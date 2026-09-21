// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Modeles.
const Templates = (function () {
  const TABLE_NAME = 'Publipostage_Modeles';
  let templatesCache = [];
  let currentTemplateId = null;

  async function ensureTableExists() {
    const tables = await grist.docApi.listTables();
    if (tables.includes(TABLE_NAME)) return;
    try {
      await grist.docApi.applyUserActions([
        ['AddTable', TABLE_NAME, [
          { id: 'Nom', type: 'Text' },
          { id: 'Contenu', type: 'Text' },
          { id: 'NomFichierPDF', type: 'Text' },
          { id: 'DateModif', type: 'DateTime' }
        ]]
      ]);
    } catch (e) {
      console.error('Erreur création table modèles', e);
    }
  }

  // Colonne ajoutée APRÈS la création initiale de la table (v2, en-têtes/pieds de page) - AddTable ne concerne que les tout nouveaux documents, un document
  // existant a besoin de ce chemin de migration dédié (idempotent - ne fait rien si la colonne existe déjà).
  let headerFooterColumnChecked = false;
  async function ensureHeaderFooterColumn() {
    if (headerFooterColumnChecked) return;
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('HeaderFooter' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'HeaderFooter', { type: 'Text', isFormula: false, label: 'En-tête / pied de page' }]
        ]);
      }
      headerFooterColumnChecked = true;
    } catch (e) {
      console.error('Erreur migration colonne HeaderFooter', e);
    }
  }

  // Marges de page (haut/droite/bas/gauche, mm) - même migration idempotente que HeaderFooter ci-dessus.
  let marginsColumnChecked = false;
  async function ensureMarginsColumn() {
    if (marginsColumnChecked) return;
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('Margins' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'Margins', { type: 'Text', isFormula: false, label: 'Marges de page' }]
        ]);
      }
      marginsColumnChecked = true;
    } catch (e) {
      console.error('Erreur migration colonne Margins', e);
    }
  }

  // Horodatage de dernière modification (auto-save, cf. js/main.js) - même migration idempotente que HeaderFooter ci-dessus. Manquait à l'origine : DateModif
  // ne figurait QUE dans le AddTable de ensureTableExists (donc présent sur un document tout neuf), jamais ajoutée en migration sur un document existant -
  // sur un tel document, save()/loadAll() écrivaient/lisaient une colonne qui n'a jamais existé, ce qui a empêché l'auto-save de fonctionner en pratique.
  let dateModifColumnChecked = false;
  async function ensureDateModifColumn() {
    if (dateModifColumnChecked) return;
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('DateModif' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'DateModif', { type: 'DateTime', isFormula: false, label: 'Dernière modification' }]
        ]);
      }
      dateModifColumnChecked = true;
    } catch (e) {
      console.error('Erreur migration colonne DateModif', e);
    }
  }

  // Modèle qui s'ouvre automatiquement au chargement du widget (au plus un à la fois - cf. setDefault). Colonne ajoutée après coup, même migration idempotente
  // que HeaderFooter ci-dessus.
  let defaultColumnChecked = false;
  async function ensureDefaultColumn() {
    if (defaultColumnChecked) return;
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('EstParDefaut' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'EstParDefaut', { type: 'Bool', isFormula: false, label: 'Modèle par défaut' }]
        ]);
      }
      defaultColumnChecked = true;
    } catch (e) {
      console.error('Erreur migration colonne EstParDefaut', e);
    }
  }

  // Mode email (planning/feature-email-mode.md) : colonnes par table existante plutôt qu'une table dédiée (décision d'Antoine, 2026-09-18 - "pas fan de la
  // démultiplication des tables"). TypeModele distingue un modèle email d'un modèle document ('document' par défaut - une ligne déjà existante sans cette
  // colonne, ou avec une valeur vide, EST un modèle document : aucune migration de données à rejouer sur les modèles déjà créés). Les 4 autres colonnes n'ont
  // de sens que pour un modèle email, mais restent présentes (vides) sur un modèle document plutôt que d'introduire un schéma conditionnel. Même migration
  // idempotente que les colonnes ci-dessus, regroupées ici car introduites ensemble.
  let emailColumnsChecked = false;
  async function ensureEmailColumns() {
    if (emailColumnsChecked) return;
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
      emailColumnsChecked = true;
    } catch (e) {
      console.error('Erreur migration colonnes mode email', e);
    }
  }

  // Suivi des modifications (planning/feature-track-changes.md, décision n°4) : auteur/horodatage par suggestion en attente, écrit dans le MÊME
  // UpdateRecord/AddRecord que Contenu/DateModif (jamais un appel séparé) - même migration idempotente que HeaderFooter ci-dessus.
  let trackChangesColumnChecked = false;
  async function ensureTrackChangesColumn() {
    if (trackChangesColumnChecked) return;
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('SuiviModifications' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'SuiviModifications', { type: 'Text', isFormula: false, label: 'Suivi des modifications' }]
        ]);
      }
      trackChangesColumnChecked = true;
    } catch (e) {
      console.error('Erreur migration colonne SuiviModifications', e);
    }
  }

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

  function getCurrentId() { return currentTemplateId; }

  function setCurrentId(id) { currentTemplateId = id; }

  function getDefaultId() {
    const found = templatesCache.find(t => t.estParDefaut);
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

  return { loadAll, getCached, getCurrentId, setCurrentId, getDefaultId, setDefault, save, remove, TABLE_NAME };
})();