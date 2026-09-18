// Suite "autosave" - enregistrement automatique + détection de conflit (js/main.js, section "Auto-save (V1)").
//
// Ce que cette suite vérifie vraiment, et pourquoi elle est construite comme ça :
//
// 1. La promesse de l'auto-save n'est pas "le contenu finit par être enregistré" (n'importe quelle boucle qui écrit en permanence tiendrait cette
//    promesse) mais "RIEN n'est écrit tant que rien n'a changé". Cette seconde moitié ne se vérifie pas en relisant l'état final - il est identique
//    dans les deux cas. Il faut compter les ÉCRITURES réelles, d'où `window.__gristStub.getActionLog()`/`countActions()` (dev-tests/grist-stub.js).
// 2. La détection de conflit suppose un SECOND utilisateur qui enregistre le même modèle entre deux ticks. `window.__gristStub.remoteWrite()` écrit
//    directement dans l'état du stub, sans passer par applyUserActions ni par le journal - exactement ce que ce client verrait d'une écriture faite
//    ailleurs. C'est le seul moyen honnête de tester ce chemin sans piloter un second navigateur.
// 3. La boucle d'auto-save est un `setInterval` global démarré par main.js:init() (AUTOSAVE_INTERVAL_MS = 2500). Aucun scénario ne peut la déclencher
//    à la demande : ils ATTENDENT un vrai tick. D'où `waitTicks()` plutôt qu'un sleep arbitraire, et un groupe volontairement plus lent que les autres
//    (~1 min) - c'est le prix d'un test qui exerce le vrai minuteur plutôt qu'une fonction interne appelée à la main.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const TICK_MS = 2500; // = AUTOSAVE_INTERVAL_MS (js/main.js). À garder synchronisé si cette constante change.

  // Attend n intervalles d'auto-save + une marge (l'écriture elle-même est asynchrone : fetchTable de vérification de conflit PUIS applyUserActions).
  const waitTicks = (h, n) => h.sleep(TICK_MS * n + 900);

  const stub = () => window.__gristStub;

  // Crée un modèle RÉELLEMENT enregistré (une ligne Grist existante), par le vrai bouton Enregistrer - jamais par un appel direct à Templates.save() :
  // l'auto-save dépend d'un état interne à main.js (autosaveLastKnownDateModif, autosaveDirty) que seul le vrai chemin onSave() met à jour.
  async function saveTemplate(h, nom, html) {
    await h.resetEditor();
    if (html) Editor.setHTML(html);
    const nameInput = document.getElementById('template-name');
    nameInput.value = nom;
    await h.clickButton('btn-save');
    await h.sleep(400);
    return Templates.getCurrentId();
  }

  // Remet le widget sur "-- Nouveau modèle -- " : aucun modèle courant, donc aucune ligne que l'auto-save pourrait mettre à jour.
  async function newTemplate(h) {
    await h.clickButton('btn-new');
    await h.sleep(300);
  }

  const banner = () => document.getElementById('autosave-conflict-banner');
  const bannerVisible = () => { const b = banner(); return !!b && b.style.display !== 'none'; };

  // Toute suite laissant un conflit actif gèlerait l'auto-save pour les scénarios suivants (le gel est PERSISTANT à dessein). Un Enregistrer manuel est
  // la sortie prévue par le code lui-même, donc la remise à zéro correcte ici.
  async function clearConflictIfAny(h) {
    if (!bannerVisible()) return;
    await h.clickButton('btn-save');
    await h.sleep(400);
  }

  cases.push({
    id: 'autosave_no_write_when_idle',
    description: "Aucune écriture tant que rien n'a changé (la moitié de la promesse qu'un enregistrement permanent tiendrait aussi)",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave modèle inactif', '<p>Contenu initial</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé par le bouton Enregistrer' };
      stub().clearActionLog();
      await waitTicks(h, 2); // deux tours complets, aucune frappe entre-temps
      const writes = stub().countActions('UpdateRecord', TABLE) + stub().countActions('AddRecord', TABLE);
      return { pass: writes === 0, notes: 'écritures sur ' + TABLE + ' pendant 2 ticks sans modification = ' + writes };
    },
  });

  cases.push({
    id: 'autosave_writes_once_after_edit',
    description: 'Une vraie frappe déclenche exactement UNE écriture, puis plus rien tant que rien ne rechange',
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave une écriture', '<p>Avant</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      stub().clearActionLog();
      await h.focusAtEnd();
      await h.typeText(' modifié');
      await waitTicks(h, 1);
      const afterEdit = stub().countActions('UpdateRecord', TABLE);
      await waitTicks(h, 1); // le tick SUIVANT ne doit plus rien écrire : autosaveDirty a été remis à false
      const afterIdle = stub().countActions('UpdateRecord', TABLE);
      const row = stub().getRow(TABLE, id);
      const contenuOk = !!row && String(row.Contenu).indexOf('modifié') !== -1;
      return {
        pass: afterEdit === 1 && afterIdle === 1 && contenuOk,
        notes: 'écritures après frappe=' + afterEdit + ', après tick suivant=' + afterIdle + ', contenu enregistré=' + (row ? String(row.Contenu) : 'ligne introuvable'),
      };
    },
  });

  cases.push({
    id: 'autosave_never_creates_template',
    description: "Un modèle jamais enregistré manuellement n'est JAMAIS créé par l'auto-save (sinon chaque brouillon jetable polluerait la table)",
    run: async (h) => {
      await clearConflictIfAny(h);
      await saveTemplate(h, 'AutoSave garde-fou création', '<p>Peu importe</p>');
      await newTemplate(h);
      const nameInput = document.getElementById('template-name');
      nameInput.value = 'Brouillon jamais enregistré';
      stub().clearActionLog();
      await h.focusAtEnd();
      await h.typeText('Du texte dans un brouillon');
      await waitTicks(h, 2);
      const created = stub().countActions('AddRecord', TABLE);
      return { pass: created === 0, notes: 'AddRecord sur ' + TABLE + ' pendant 2 ticks sur un brouillon = ' + created };
    },
  });

  cases.push({
    id: 'autosave_preserves_page_margins',
    description: "L'auto-save réenregistre les marges de page du modèle au lieu de les réécrire aux valeurs par défaut",
    // Régression de FUSION, pas de code : `Templates.save()` a pris un 6e paramètre (marges) sur main pendant que la branche auto-save changeait sa
    // valeur de retour. Les deux changements fusionnent sans conflit textuel, et un autosaveTick qui oublie ce 6e paramètre remet silencieusement les
    // marges du modèle à leur valeur par défaut à chaque tick - sans erreur, sans trace, et invisible pour tout test qui ne regarde que le contenu.
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave marges', '<p>Avec marges personnalisées</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      PageLayout.setMarginsMm({ top: 33, right: 22, bottom: 11, left: 44 });
      await h.clickButton('btn-save'); // enregistrement manuel : les marges partent bien en base
      await h.sleep(400);
      const afterManual = JSON.parse(stub().getRow(TABLE, id).Margins || '{}');
      stub().clearActionLog();
      await h.focusAtEnd();
      await h.typeText(' puis une frappe');
      await waitTicks(h, 1);
      const afterAuto = JSON.parse(stub().getRow(TABLE, id).Margins || '{}');
      const pass = afterManual.top === 33 && afterAuto.top === 33 && afterAuto.left === 44 && afterAuto.right === 22 && afterAuto.bottom === 11;
      return { pass, notes: 'marges après Enregistrer=' + JSON.stringify(afterManual) + ', après auto-save=' + JSON.stringify(afterAuto) };
    },
  });

  cases.push({
    id: 'autosave_conflict_detected_and_frozen',
    description: "Un enregistrement fait par quelqu'un d'autre gèle l'auto-save et affiche le bandeau, au lieu d'écraser en silence",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave conflit', '<p>Version locale</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      // Quelqu'un d'autre enregistre ce même modèle : DateModif change sans que ce client l'ait écrit.
      stub().remoteWrite(TABLE, id, { Contenu: '<p>Version de quelqu\'un d\'autre</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
      stub().clearActionLog();
      await h.focusAtEnd();
      await h.typeText(' frappe locale pendant le conflit');
      await waitTicks(h, 2);
      const writes = stub().countActions('UpdateRecord', TABLE);
      const visible = bannerVisible();
      const remoteIntact = String(stub().getRow(TABLE, id).Contenu).indexOf("quelqu'un d'autre") !== -1;
      await clearConflictIfAny(h);
      return {
        pass: visible && writes === 0 && remoteIntact,
        notes: 'bandeau=' + visible + ', écritures pendant le gel=' + writes + ', version distante intacte=' + remoteIntact,
      };
    },
  });

  cases.push({
    id: 'autosave_manual_save_resolves_conflict',
    description: 'Un Enregistrer manuel pendant un conflit tranche en faveur de la version locale, masque le bandeau et redémarre l\'auto-save',
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave conflit résolu manuellement', '<p>Base</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      await h.focusAtEnd();
      await h.typeText(' texte local à garder');
      stub().remoteWrite(TABLE, id, { Contenu: '<p>Version distante</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
      await waitTicks(h, 1);
      if (!bannerVisible()) return { pass: false, notes: 'le bandeau de conflit ne s\'est pas affiché, rien à résoudre' };

      await h.clickButton('btn-save');
      await h.sleep(400);
      const bannerGone = !bannerVisible();
      const localWon = String(stub().getRow(TABLE, id).Contenu).indexOf('texte local à garder') !== -1;

      // L'auto-save doit être RE-débloqué, pas seulement le bandeau masqué : une nouvelle frappe doit repartir en écriture normale.
      stub().clearActionLog();
      await h.focusAtEnd();
      await h.typeText(' et la suite');
      await waitTicks(h, 1);
      const resumed = stub().countActions('UpdateRecord', TABLE) === 1;
      return { pass: bannerGone && localWon && resumed, notes: 'bandeau masqué=' + bannerGone + ', version locale conservée=' + localWon + ', auto-save redémarré=' + resumed };
    },
  });

  cases.push({
    id: 'autosave_conflict_reload_takes_remote_version',
    description: '"Recharger la dernière version" remplace bien l\'éditeur par la version distante et lève le gel',
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave conflit rechargé', '<p>Version locale à abandonner</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      stub().remoteWrite(TABLE, id, { Contenu: '<p>Version distante rechargée</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
      await h.focusAtEnd();
      await h.typeText(' modif locale');
      await waitTicks(h, 1);
      if (!bannerVisible()) return { pass: false, notes: 'le bandeau de conflit ne s\'est pas affiché' };

      await h.clickButton('autosave-conflict-reload');
      await h.sleep(600);
      const html = Editor.getHTML();
      const tookRemote = html.indexOf('Version distante rechargée') !== -1;
      const bannerGone = !bannerVisible();
      await clearConflictIfAny(h);
      return { pass: tookRemote && bannerGone, notes: 'contenu après rechargement=' + html + ', bandeau masqué=' + bannerGone };
    },
  });

  cases.push({
    id: 'autosave_skips_tick_while_editing_header_footer',
    description: "En édition d'en-tête/pied, le tick est SAUTÉ (et non forcé), pour ne pas éjecter l'utilisateur de ce mode toutes les 2-3 secondes",
    // getHTML() renverrait alors le fragment d'en-tête/pied à la place du document : écrire ce tick-là remplacerait le modèle par son propre en-tête.
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave en-tête', '<p>Corps du document</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      // Les zones de marge (.v2-hf-zone) ne sont rendues que sous a4-preview, que resetEditor() retire entre deux scénarios - cf. le même préalable dans
      // scenarios-headerfooter.js:hf_enter_via_real_ui_click.
      document.getElementById('editor-container').classList.add('a4-preview');
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>Mon en-tête</p>', first: '' }, footer: { default: '', first: '' } });
      await h.sleep(300);
      const zone = document.querySelector('.v2-hf-zone');
      if (!zone) return { pass: false, notes: 'zone en-tête/pied introuvable (cf. piège .a4-preview, dev-tests/README.md)' };
      zone.click();
      await h.sleep(400);
      if (!Editor.isEditingHeaderFooter()) {
        Editor.exitHeaderFooterModeIfActive();
        return { pass: false, notes: 'impossible d\'entrer en mode édition en-tête/pied depuis ce harnais' };
      }
      stub().clearActionLog();
      await h.typeText(' texte tapé dans l\'en-tête');
      await waitTicks(h, 1);
      const writes = stub().countActions('UpdateRecord', TABLE);
      const stillEditing = Editor.isEditingHeaderFooter();
      Editor.exitHeaderFooterModeIfActive();
      await h.sleep(300);
      const bodyIntact = Editor.getHTML().indexOf('Corps du document') !== -1;
      await clearConflictIfAny(h);
      return {
        pass: writes === 0 && stillEditing && bodyIntact,
        notes: 'écritures pendant l\'édition en-tête=' + writes + ', toujours en mode en-tête=' + stillEditing + ', corps intact après sortie=' + bodyIntact,
      };
    },
  });

  cases.push({
    id: 'autosave_no_false_conflict_for_lone_editor',
    // Régression réelle signalée par Antoine : Templates.save() renvoyait la chaîne ISO brute qu'il venait lui-même d'écrire (new Date().toISOString()),
    // alors que Templates.loadAll() relit ce même DateModif via grist.docApi.fetchTable() - si Grist ne redonne pas cette chaîne à l'identique (un
    // DateTime réel se représente en interne comme un timestamp numérique), autosaveTick() comparait deux représentations différentes d'un seul et même
    // instant avec `!==` et affichait le bandeau, sans que personne d'autre n'ait jamais touché au modèle. Différence-clé avec tous les scénarios de
    // conflit ci-dessus (qui simulent un second utilisateur via remoteWrite) : ici AUCUN remoteWrite n'est appelé, le client est seul du début à la fin.
    description: "Un client seul (aucun remoteWrite) ne doit jamais voir le bandeau « modifié ailleurs » apparaître après ses propres enregistrements, manuels ou automatiques",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'AutoSave sans faux conflit solo', '<p>Version initiale</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      if (bannerVisible()) return { pass: false, notes: 'bandeau déjà affiché juste après le tout premier enregistrement manuel' };

      // Un tick de vérification de conflit sans la moindre modification entre-temps : déjà suffisant pour révéler un mismatch de représentation, puisque
      // autosaveLastKnownDateModif vient d'être réécrit avec la valeur renvoyée par ce premier save().
      await waitTicks(h, 1);
      const bannerAfterFirstTick = bannerVisible();

      // Second enregistrement MANUEL (le cas exact rapporté : Enregistrer, continuer à taper, Enregistrer encore) - exercise onSave(), qui réécrit
      // autosaveLastKnownDateModif une seconde fois.
      await h.focusAtEnd();
      await h.typeText(' puis une frappe locale');
      await h.clickButton('btn-save');
      await h.sleep(400);
      const bannerAfterSecondManualSave = bannerVisible();

      // Puis un vrai tick d'auto-save après une nouvelle frappe, pour couvrir aussi le chemin autosaveTick() (pas seulement onSave()) - deux
      // enregistrements réels consécutifs par le MÊME client, sans jamais qu'un autre utilisateur n'intervienne.
      await h.focusAtEnd();
      await h.typeText(' puis encore une frappe');
      await waitTicks(h, 1);
      const bannerAfterAutosaveTick = bannerVisible();

      const pass = !bannerAfterFirstTick && !bannerAfterSecondManualSave && !bannerAfterAutosaveTick;
      return {
        pass,
        notes: 'bandeau après 1er tick=' + bannerAfterFirstTick + ', après 2e Enregistrer manuel=' + bannerAfterSecondManualSave
          + ', après tick auto-save suivant=' + bannerAfterAutosaveTick,
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.autosave = cases;
})();
