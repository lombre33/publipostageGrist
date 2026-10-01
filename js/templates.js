// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Modeles.
const Templates = (function () {
  const TABLE_NAME = 'Publipostage_Modeles';
  let templatesCache = [];
  let currentTemplateId = null;

  // Régression du 2026-09-28 (Antoine : "l'enregistrement d'un modèle ne fonctionne pas") : chaque
  // ensureXxxColumn() ci-dessous suit un patron "vérifier (fetchTable) puis agir (AddVisibleColumn)"
  // qui n'est PAS atomique. autosaveTick() (js/main.js) appelle Templates.loadAll() toutes les ~2.5s,
  // et un Enregistrer manuel appelle Templates.save() - les deux passent par les MÊMES ensureXxxColumn.
  // Sur un document qui vient tout juste de recevoir une nouvelle colonne (typiquement le tout premier
  // Enregistrer après une mise à jour du widget, comme cette semaine), deux appels qui se chevauchent
  // (un tick d'auto-save pile pendant qu'on clique Enregistrer) peuvent tous les deux lire la colonne
  // absente AVANT que l'un des deux ne l'ait ajoutée, et donc tous les deux appeler AddVisibleColumn
  // pour le MÊME id de colonne - le vrai Grist rejette un id de colonne déjà utilisé. Invisible dans
  // dev-tests/grist-stub.js, dont AddVisibleColumn/AddTable sont délibérément idempotents (commentaire
  // sur ces handlers) : le faux Grist accepte donc sans broncher ce que le vrai refuserait. ensureOnce()
  // fait partager le MÊME appel fetchTable+AddVisibleColumn en cours à tout appelant concurrent, au lieu
  // que chacun reparte de zéro - et relance un essai (au prochain appel) seulement si celui-ci a échoué,
  // même comportement de retry que les checked=true/false individuels remplacés ci-dessous.
  function ensureOnce(worker) {
    let inFlight = null;
    return function ensure() {
      if (!inFlight) inFlight = worker().then(ok => { if (!ok) inFlight = null; return ok; });
      return inFlight;
    };
  }

  const ensureTableExists = ensureOnce(async function () {
    try {
      const tables = await grist.docApi.listTables();
      if (tables.includes(TABLE_NAME)) return true;
      await grist.docApi.applyUserActions([
        ['AddTable', TABLE_NAME, [
          { id: 'Nom', type: 'Text' },
          { id: 'Contenu', type: 'Text' },
          { id: 'NomFichierPDF', type: 'Text' },
          { id: 'DateModif', type: 'DateTime' }
        ]]
      ]);
      return true;
    } catch (e) {
      console.error('Erreur création table modèles', e);
      return false;
    }
  });

  // Colonne ajoutée APRÈS la création initiale de la table (v2, en-têtes/pieds de page) - AddTable ne concerne que les tout nouveaux documents, un document
  // existant a besoin de ce chemin de migration dédié (idempotent - ne fait rien si la colonne existe déjà).
  const ensureHeaderFooterColumn = ensureOnce(async function () {
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('HeaderFooter' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'HeaderFooter', { type: 'Text', isFormula: false, label: 'En-tête / pied de page' }]
        ]);
      }
      return true;
    } catch (e) {
      console.error('Erreur migration colonne HeaderFooter', e);
      return false;
    }
  });

  // Marges de page (haut/droite/bas/gauche, mm) - même migration idempotente que HeaderFooter ci-dessus.
  const ensureMarginsColumn = ensureOnce(async function () {
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('Margins' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'Margins', { type: 'Text', isFormula: false, label: 'Marges de page' }]
        ]);
      }
      return true;
    } catch (e) {
      console.error('Erreur migration colonne Margins', e);
      return false;
    }
  });

  // Horodatage de dernière modification (auto-save, cf. js/main.js) - même migration idempotente que HeaderFooter ci-dessus. Manquait à l'origine : DateModif
  // ne figurait QUE dans le AddTable de ensureTableExists (donc présent sur un document tout neuf), jamais ajoutée en migration sur un document existant -
  // sur un tel document, save()/loadAll() écrivaient/lisaient une colonne qui n'a jamais existé, ce qui a empêché l'auto-save de fonctionner en pratique.
  const ensureDateModifColumn = ensureOnce(async function () {
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('DateModif' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'DateModif', { type: 'DateTime', isFormula: false, label: 'Dernière modification' }]
        ]);
      }
      return true;
    } catch (e) {
      console.error('Erreur migration colonne DateModif', e);
      return false;
    }
  });

  // Modèle qui s'ouvre automatiquement au chargement du widget (au plus un à la fois - cf. setDefault). Colonne ajoutée après coup, même migration idempotente
  // que HeaderFooter ci-dessus.
  const ensureDefaultColumn = ensureOnce(async function () {
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('EstParDefaut' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'EstParDefaut', { type: 'Bool', isFormula: false, label: 'Modèle par défaut' }]
        ]);
      }
      return true;
    } catch (e) {
      console.error('Erreur migration colonne EstParDefaut', e);
      return false;
    }
  });

  // Mode email (planning/feature-email-mode.md) : colonnes par table existante plutôt qu'une table dédiée (décision d'Antoine, 2026-09-18 - "pas fan de la
  // démultiplication des tables"). TypeModele distingue un modèle email d'un modèle document ('document' par défaut - une ligne déjà existante sans cette
  // colonne, ou avec une valeur vide, EST un modèle document : aucune migration de données à rejouer sur les modèles déjà créés). Les 4 autres colonnes n'ont
  // de sens que pour un modèle email, mais restent présentes (vides) sur un modèle document plutôt que d'introduire un schéma conditionnel. Même migration
  // idempotente que les colonnes ci-dessus, regroupées ici car introduites ensemble.
  const ensureEmailColumns = ensureOnce(async function () {
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      const actions = [];
      const addIfMissing = (id, type, label) => { if (!(id in data)) actions.push(['AddVisibleColumn', TABLE_NAME, id, { type, isFormula: false, label }]); };
      addIfMissing('TypeModele', 'Text', 'Type de modèle');
      addIfMissing('Destinataires', 'Text', 'Destinataires (À)');
      addIfMissing('Cc', 'Text', 'Copie (Cc)');
      addIfMissing('Cci', 'Text', 'Copie cachée (Cci)');
      addIfMissing('Objet', 'Text', 'Objet de l\'email');
      if (actions.length) await grist.docApi.applyUserActions(actions);
      return true;
    } catch (e) {
      console.error('Erreur migration colonnes mode email', e);
      return false;
    }
  });

  // Suivi des modifications (planning/feature-track-changes.md, décision n°4) : auteur/horodatage par suggestion en attente, écrit dans le MÊME
  // UpdateRecord/AddRecord que Contenu/DateModif (jamais un appel séparé) - même migration idempotente que HeaderFooter ci-dessus.
  const ensureTrackChangesColumn = ensureOnce(async function () {
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('SuiviModifications' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'SuiviModifications', { type: 'Text', isFormula: false, label: 'Suivi des modifications' }]
        ]);
      }
      return true;
    } catch (e) {
      console.error('Erreur migration colonne SuiviModifications', e);
      return false;
    }
  });

  // Forme par défaut si absente/invalide - DOIT rester cohérente avec la forme utilisée côté js/editor.js (dupliquée plutôt qu'importée, ces deux fichiers ne
  // partagent aucun mécanisme de module - même tolérance à la duplication que le reste de ce projet pour ce genre de petite forme).
  function safeParseHeaderFooter(json) {
    const empty = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
    if (!json) return empty;
    try {
      const parsed = JSON.parse(json);
      return Object.assign(empty, parsed, {
        header: Object.assign({}, empty.header, parsed.header),
        footer: Object.assign({}, empty.footer, parsed.footer),
      });
    } catch (e) {
      return empty;
    }
  }

  // Macro modèles (planning/feature-macro-modeles.md) : TypeModele='macro' réutilise la colonne Contenu, mais pour y stocker du JSON (liste ordonnée de
  // slots) plutôt que du HTML TipTap - aucune nouvelle colonne, TypeModele existe déjà (mode email). Forme par défaut si absente/invalide, même tolérance
  // que safeParseHeaderFooter ci-dessus.
  function safeParseMacroSlots(json) {
    const empty = { slots: [] };
    if (!json) return empty;
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.slots)) return empty;
      return parsed;
    } catch (e) {
      return empty;
    }
  }

  // Forme par défaut si absente/invalide, même tolérance que safeParseHeaderFooter ci-dessus - {} (aucune suggestion connue) plutôt que null, pour que
  // TrackChanges.computeMetadata (js/track-changes.js) puisse toujours l'utiliser directement comme previousMetadata sans vérification préalable.
  function safeParseSuiviModifications(json) {
    if (!json) return {};
    try {
      const parsed = JSON.parse(json);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  // Défaut identique à PageLayout.DEFAULT_MARGIN_MM (js/page-layout.js) - dupliqué plutôt qu'importé, même tolérance que safeParseHeaderFooter ci-dessus.
  // DOIT convertir exactement vers 28pt (l'ancienne marge codée en dur) pour qu'un modèle sans réglage propre reste pixel-identique à avant.
  function safeParseMargins(json) {
    const DEFAULT_MARGIN_MM = 28 * 25.4 / 72;
    const empty = { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM };
    if (!json) return empty;
    try {
      return Object.assign(empty, JSON.parse(json));
    } catch (e) {
      return empty;
    }
  }

  async function loadAll() {
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    await ensureDefaultColumn();
    await ensureMarginsColumn();
    await ensureDateModifColumn();
    await ensureEmailColumns();
    await ensureTrackChangesColumn();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      templatesCache = [];
      for (let i = 0; i < data.id.length; i++) {
        const typeModele = (data.TypeModele && data.TypeModele[i]) || 'document';
        templatesCache.push({
          id: data.id[i],
          nom: data.Nom[i],
          contenu: data.Contenu[i],
          nomFichierPDF: data.NomFichierPDF ? data.NomFichierPDF[i] : '',
          headerFooter: safeParseHeaderFooter(data.HeaderFooter ? data.HeaderFooter[i] : null),
          marginsMm: safeParseMargins(data.Margins ? data.Margins[i] : null),
          estParDefaut: !!(data.EstParDefaut && data.EstParDefaut[i]),
          // Une ligne existante sans TypeModele (créée avant le mode email) est un modèle document - aucune migration de données à rejouer.
          typeModele: typeModele,
          // null pour un modèle document/email : évite de faire porter à chaque consommateur la charge de vérifier typeModele avant de lire ce champ.
          macroSlots: (typeModele === 'macro') ? safeParseMacroSlots(data.Contenu ? data.Contenu[i] : null) : null,
          // null pour un macro-modèle (jamais chargé dans l'éditeur suivi, cf. loadMacroIntoEditor - js/main.js) - même convention que macroSlots ci-dessus.
          suiviModifications: (typeModele === 'macro') ? null : safeParseSuiviModifications(data.SuiviModifications ? data.SuiviModifications[i] : null),
          destinataires: data.Destinataires ? data.Destinataires[i] : '',
          cc: data.Cc ? data.Cc[i] : '',
          cci: data.Cci ? data.Cci[i] : '',
          objet: data.Objet ? data.Objet[i] : '',
          // Utilisé par js/main.js (auto-save) pour détecter qu'une autre personne a enregistré ce même modèle entre deux vérifications - jamais affiché
          // tel quel à l'utilisateur.
          dateModif: data.DateModif ? data.DateModif[i] : null,
        });
      }
    } catch (e) {
      console.error('Erreur chargement modèles', e);
      templatesCache = [];
    }
    return templatesCache;
  }

  function getCached() { return templatesCache; }

  // Deux noms sont le même quand ils ne diffèrent que par les majuscules ou les espaces autour : « contrat » et « Contrat » se confondent dans la liste.
  function sameName(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

  // Un autre modèle porte-t-il déjà ce nom ? `ignoreId` ne compte pas : le modèle qu'on enregistre ne se gêne pas lui-même.
  function isNameTaken(nom, ignoreId) {
    return templatesCache.some(t => (ignoreId == null || String(t.id) !== String(ignoreId)) && sameName(t.nom, nom));
  }

  // Nom libre le plus proche de `nom` (demande d'Antoine du 01/10) : `nom` lui-même s'il est libre, sinon « nom (2) », « nom (3) »... Un nom qui finit déjà par « (n) » continue sa série
  // au numéro suivant (dupliquer « Rapport (2) » donne « Rapport (3) », pas « Rapport (2) (2) »). Lit le cache des modèles : relu à chaque enregistrement et à chaque passage de
  // l'enregistrement automatique, il ne retarde que d'un nom créé à l'instant par quelqu'un d'autre.
  function uniqueName(nom, ignoreId) {
    const base = String(nom || '').trim();
    if (!base || !isNameTaken(base, ignoreId)) return base;
    const series = base.match(/^(.*\S)\s*\((\d+)\)$/);
    const root = series ? series[1] : base;
    let x = series ? Number(series[2]) + 1 : 2;
    while (isNameTaken(root + ' (' + x + ')', ignoreId)) x++;
    return root + ' (' + x + ')';
  }

  function getCurrentId() { return currentTemplateId; }

  function setCurrentId(id) { currentTemplateId = id; }

  // Un modèle email ou macro n'est jamais le modèle de démarrage (cf. js/main.js, syncDefaultTemplateButton) : une ligne restée marquée EstParDefaut sur l'un
  // d'eux (défaut posé avant cette règle, colonne éditée dans Grist) ne doit pas masquer un modèle document lui aussi marqué - sinon le widget s'ouvrait sur
  // « Nouveau modèle » et l'étoile n'apparaissait sur aucun des deux. Plusieurs modèles document marqués : le premier de la table, comme avant.
  function getDefaultId() {
    const found = templatesCache.find(t => t.estParDefaut && t.typeModele !== 'email' && t.typeModele !== 'macro');
    return found ? found.id : null;
  }

  // id = null retire le modèle par défaut sans en redéfinir un autre. Un seul modèle par défaut à la fois : les autres sont explicitement repassés à false
  // plutôt que laissés tels quels, pour ne jamais se retrouver avec deux "par défaut" après un enchaînement d'appels.
  async function setDefault(id) {
    await ensureTableExists();
    await ensureDefaultColumn();
    const actions = [];
    templatesCache.forEach(t => {
      if (t.estParDefaut && String(t.id) !== String(id)) actions.push(['UpdateRecord', TABLE_NAME, t.id, { EstParDefaut: false }]);
    });
    if (id != null) actions.push(['UpdateRecord', TABLE_NAME, id, { EstParDefaut: true }]);
    if (actions.length) await grist.docApi.applyUserActions(actions);
    templatesCache.forEach(t => { t.estParDefaut = (id != null && String(t.id) === String(id)); });
  }

  // Relit le DateModif RÉELLEMENT stocké par Grist pour cette ligne, plutôt que de faire confiance à la chaîne ISO qu'on vient nous-mêmes d'envoyer :
  // rien ne garantit que Grist redonne cette même chaîne telle quelle sur une lecture ultérieure (une colonne DateTime peut très bien être représentée
  // différemment en interne - timestamp numérique, etc.). js/main.js (autosaveTick) compare la valeur renvoyée par save() à une valeur lue plus tard via
  // loadAll()/fetchTable() : si les deux ne sont pas exprimées dans la MÊME représentation, la comparaison stricte y voit un faux conflit dès le tick
  // suivant n'importe quel enregistrement, même seul sur le document. Toujours passer par cette même lecture (fetchTable) des deux côtés élimine le
  // problème quelle que soit la représentation interne réelle de Grist. Défensif : un souci ici (colonne absente, ligne introuvable, requête en échec) ne
  // doit jamais faire échouer un enregistrement par ailleurs réussi - on retombe alors sur la chaîne ISO d'origine plutôt que de lever.
  async function readBackDateModif(rowId, fallback) {
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      const idx = data.id.indexOf(rowId);
      if (idx === -1 || !data.DateModif) {
        console.error('Relecture DateModif après enregistrement : ligne ou colonne introuvable, valeur locale conservée');
        return fallback;
      }
      return data.DateModif[idx];
    } catch (e) {
      console.error('Erreur relecture DateModif après enregistrement', e);
      return fallback;
    }
  }

  // Renvoie { id, dateModif } (pas juste l'id) : js/main.js (auto-save) a besoin de connaître le DateModif qu'IL vient d'écrire, pour le distinguer d'un
  // DateModif différent constaté plus tard (preuve qu'quelqu'un d'autre a enregistré ce modèle entre-temps). dateModif vient d'une relecture Grist
  // (readBackDateModif), pas de la chaîne ISO envoyée - cf. commentaire de cette fonction.
  // typeModele/emailFields : ajoutés pour le mode email (§ ensureEmailColumns ci-dessus) - optionnels, pour ne rien changer aux appels existants (mode
  // document). emailFields = { destinataires, cc, cci, objet }, ignoré (colonnes laissées vides) pour un modèle document.
  // suiviModifications : { [id]: {author, createdAt} } (js/track-changes.js, TrackChanges.computeMetadata), écrite dans CE MÊME UpdateRecord/AddRecord que
  // Contenu - jamais un appel séparé (planning/feature-track-changes.md, décision n°4, exigence sur la fenêtre de risque en cas de conflit d'auto-save).
  // null pour un macro-modèle (Editor.getSuiviModificationsForSave n'est jamais appelée sur ce chemin, cf. onSave - js/main.js).
  async function save(id, nom, contenuHtml, nomFichierPDF, headerFooterData, marginsData, typeModele = 'document', emailFields = null, suiviModifications = null) {
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    await ensureMarginsColumn();
    await ensureDateModifColumn();
    await ensureEmailColumns();
    await ensureTrackChangesColumn();
    const now = new Date().toISOString();
    const email = emailFields || {};
    const columns = {
      Nom: nom, Contenu: contenuHtml, NomFichierPDF: nomFichierPDF, DateModif: now,
      HeaderFooter: JSON.stringify(headerFooterData || safeParseHeaderFooter(null)),
      Margins: JSON.stringify(marginsData || safeParseMargins(null)),
      TypeModele: typeModele,
      Destinataires: email.destinataires || '', Cc: email.cc || '', Cci: email.cci || '', Objet: email.objet || '',
      SuiviModifications: JSON.stringify(suiviModifications || {}),
    };
    if (id) {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', TABLE_NAME, id, columns]
      ]);
      // Le cache garde le nom que la ligne vient de recevoir : js/main.js (settleTemplateName) y compare le nom tapé, et uniqueName y cherche les noms pris.
      const cached = templatesCache.find(t => String(t.id) === String(id));
      if (cached) cached.nom = nom;
      const dateModif = await readBackDateModif(id, now);
      return { id, dateModif };
    } else {
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, columns]
      ]);
      const newId = result.retValues[0];
      currentTemplateId = newId;
      const dateModif = await readBackDateModif(newId, now);
      return { id: newId, dateModif };
    }
  }

  async function remove(id) {
    await grist.docApi.applyUserActions([
      ['RemoveRecord', TABLE_NAME, id]
    ]);
  }

  return { loadAll, getCached, getCurrentId, setCurrentId, getDefaultId, setDefault, save, remove, sameName, uniqueName, TABLE_NAME };
})();