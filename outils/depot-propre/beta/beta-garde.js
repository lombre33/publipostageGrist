// Le garde-fou de la bêta figée (consigne 102 de Grist Factory Suite, 25/11 ; choix du porteur : « une dernière bêta qui ne recrée pas les anciennes tables ») : devant un document que la version 1 a déjà
// mis à jour - il porte au moins une table du widget sous son nom anglais (Publipostage_Templates, Publipostage_Comments…) -, la bêta n'écrit PLUS RIEN et le dit : « Ce document a été mis à jour par
// une version plus récente : ouvrez la dernière version. »
//
// Pourquoi : la bêta ne connaît que les noms d'avant (Publipostage_Modeles, Publipostage_Commentaires…). Devant un document aux noms anglais elle ne trouve aucune de ses tables, demande « Créer les tables
// du widget dans ce document ? » puis les recrée, vides, à côté de celles de la version 1 : le document porte alors les deux séries de tables et chaque version n'en voit qu'une. Ici, rien n'est créé, rien
// n'est écrit, la question n'est même pas posée, et une couche pleine page dit quoi faire (ouvrir la dernière version).
//
// Ce fichier n'est pas de la bêta : la publication l'ajoute à beta/, avec le bandeau (outils/depot-propre/beta-bandeau.mjs) ; une seule ligne d'index.html le charge, juste avant js/table-consent.js, donc
// avant le démarrage anticipé de la bêta (la première lecture, la première création, la première question). Tout le reste de beta/ est, octet pour octet, ce que l'étiquette de la bêta porte.
// Il ne touche à la bêta qu'en trois endroits, tous des enveloppes autour de ce qu'elle appelle déjà, et ne change rien tant que le document n'a que les noms d'avant :
//  - grist.docApi.listTables : la liste rendue est inchangée, mais si elle contient un nom anglais le garde-fou se déclenche ;
//  - grist.docApi.applyUserActions : une fois déclenché, toute écriture est refusée par l'erreur de refus que la bêta connaît déjà (`tablesDeclined`, celle d'une personne qui dit « Ne pas créer » : ses
//    gestes s'arrêtent sans message ni journal d'erreur) ; avant, la création d'une table du widget relit d'abord la liste (un autre onglet a pu poser les noms anglais depuis la dernière lecture) ;
//  - GristAPI.setTableConsent : la question « Créer les tables du widget ? » reçoit « non » d'avance, sans fenêtre, quand le document porte les noms anglais.
// La langue est celle de la bêta (I18n.getLang, suivie quand la personne la change dans Réglages) ; avant que I18n soit là, celle qu'elle a choisie (pp_lang), sinon celle du navigateur, comme js/i18n.js.
(function () {
  'use strict';
  if (document.getElementById('pp-beta-guard')) return;
  if (typeof grist === 'undefined' || !grist || !grist.docApi || typeof grist.docApi.listTables !== 'function' || typeof grist.docApi.applyUserActions !== 'function') return;

  // Les tables que la version 1 nomme en anglais (js/schema-columns.js) : leur présence dit qu'une version plus récente est passée dans ce document. Ni Publipostage_UserProbe (même nom des deux
  // côtés) ni Publipostage_Versions (la bêta ne la connaît pas, mais un document aux noms d'avant peut la porter sans que la bêta s'y perde) n'en font partie.
  const NEWER_TABLES = [
    'Publipostage_Templates', 'Publipostage_TableLinks', 'Publipostage_TemplatePreferences', 'Publipostage_Comments', 'Publipostage_Abbreviations', 'Publipostage_PageFormats',
  ];
  const WIDGET_TABLE = /^Publipostage_/;
  const TEXTS = {
    fr: {
      lead: 'Ce document a été mis à jour par une version plus récente : ouvrez la dernière version.',
      why: 'Cette version bêta n’y écrit plus rien : elle ne recrée pas les anciennes tables et laisse vos modèles intacts.',
      how: 'Dans Grist, remplacez l’adresse du widget par celle de la dernière version :',
      region: 'Document mis à jour par une version plus récente',
    },
    en: {
      lead: 'This document was updated by a more recent version: open the latest version.',
      why: 'This beta version no longer writes anything to it: it does not recreate the old tables and leaves your templates untouched.',
      how: 'In Grist, replace the widget address with the one of the latest version:',
      region: 'Document updated by a more recent version',
    },
  };

  const docApi = grist.docApi;
  const listTables = docApi.listTables;
  const applyUserActions = docApi.applyUserActions;
  let tripped = false;

  function currentLang() {
    try {
      if (typeof I18n !== 'undefined' && typeof I18n.getLang === 'function') return I18n.getLang() === 'en' ? 'en' : 'fr';
    } catch (e) { /* I18n pas prêt : la langue choisie, sinon celle du navigateur */ }
    let stored = null;
    try { stored = localStorage.getItem('pp_lang'); } catch (e) { /* stockage indisponible : on suit le navigateur */ }
    if (stored === 'fr' || stored === 'en') return stored;
    const asked = (navigator.languages && navigator.languages.length ? Array.from(navigator.languages) : [navigator.language]).filter(Boolean);
    for (const tag of asked) {
      const code = String(tag).toLowerCase().split('-')[0];
      if (code === 'fr' || code === 'en') return code;
    }
    return asked.length ? 'en' : 'fr';
  }

  // Le refus : la même erreur que celle d'une personne qui refuse de créer les tables (js/grist-api.js : tablesDeclinedError), pour que les gestes de la bêta s'arrêtent sans message d'échec.
  function refusal() {
    const error = new Error('Bêta : ce document a été mis à jour par une version plus récente, rien n’y est écrit.');
    error.tablesDeclined = true;
    error.betaGuard = true;
    return error;
  }

  // ---- La couche pleine page : le texte, l'adresse de la dernière version (celle du dossier au-dessus de beta/), et plus rien d'atteignable derrière (attribut `inert`, y compris pour ce que la bêta
  // ajoute ensuite à la page). Un seul exemplaire, créé au déclenchement du garde-fou.
  let overlay = null;
  let refs = null;
  function render() {
    if (!overlay) return;
    const t = TEXTS[currentLang()];
    overlay.setAttribute('aria-label', t.region);
    refs.lead.textContent = t.lead;
    refs.why.textContent = t.why;
    refs.how.textContent = t.how;
  }
  function inertAll(except) {
    Array.from(document.body.children).forEach((node) => { if (node !== except && node.tagName !== 'SCRIPT') node.setAttribute('inert', ''); });
  }
  function show() {
    if (overlay || !document.body) return;
    overlay = document.createElement('div');
    overlay.id = 'pp-beta-guard';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    const card = document.createElement('div');
    card.className = 'pp-beta-guard-card';
    card.tabIndex = -1;
    const lead = document.createElement('h1');
    lead.className = 'pp-beta-guard-lead';
    lead.id = 'pp-beta-guard-lead';
    const why = document.createElement('p');
    why.className = 'pp-beta-guard-text';
    const how = document.createElement('p');
    how.className = 'pp-beta-guard-text';
    const link = document.createElement('a');
    link.className = 'pp-beta-guard-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    try { link.href = new URL('../', location.href).href; } catch (e) { link.href = '../'; }
    link.textContent = link.href;
    card.appendChild(lead);
    card.appendChild(why);
    card.appendChild(how);
    card.appendChild(link);
    overlay.appendChild(card);
    overlay.setAttribute('aria-labelledby', 'pp-beta-guard-lead');
    refs = { lead, why, how };
    render();
    inertAll(null);
    document.body.appendChild(overlay);
    new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1 && node !== overlay && node.tagName !== 'SCRIPT') node.setAttribute('inert', ''); }));
    }).observe(document.body, { childList: true });
    try { card.focus({ preventScroll: true }); } catch (e) { /* le focus reste où il était */ }
    // I18n est chargé après ce fichier : à la fin du chargement de la page la langue de la bêta est connue (et suivie quand la personne la change).
    const followLang = () => {
      render();
      try { if (typeof I18n !== 'undefined' && typeof I18n.onChange === 'function') I18n.onChange(render); } catch (e) { /* la langue suivra au prochain chargement */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', followLang, { once: true });
    else followLang();
  }

  function trip() {
    tripped = true;
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  }
  // Une liste de tables lue dans le document : le garde-fou se déclenche dès qu'elle porte un nom anglais. Rend la liste telle quelle.
  function note(list) {
    if (!tripped && Array.isArray(list) && list.some(name => NEWER_TABLES.indexOf(name) !== -1)) trip();
    return list;
  }
  // Relit la liste des tables (une lecture qui échoue ne déclenche rien : la bêta fera ce qu'elle faisait sans le garde-fou).
  function checkNow() { return Promise.resolve(listTables.call(docApi)).then(note, () => null); }

  docApi.listTables = function () {
    return Promise.resolve(listTables.apply(docApi, arguments)).then(note);
  };

  docApi.applyUserActions = function (actions) {
    if (tripped) return Promise.reject(refusal());
    const args = arguments;
    const createsWidgetTable = Array.isArray(actions) && actions.some(action => Array.isArray(action) && action[0] === 'AddTable' && WIDGET_TABLE.test(String(action[1])));
    if (!createsWidgetTable) return applyUserActions.apply(docApi, args);
    return checkNow().then(() => (tripped ? Promise.reject(refusal()) : applyUserActions.apply(docApi, args)));
  };

  // La question « Créer les tables du widget dans ce document ? » (js/table-consent.js l'enregistre juste après ce fichier) : « non » d'avance, sans fenêtre, devant un document aux noms anglais.
  if (typeof GristAPI !== 'undefined' && GristAPI && typeof GristAPI.setTableConsent === 'function') {
    const setTableConsent = GristAPI.setTableConsent;
    GristAPI.setTableConsent = function (hooks) {
      if (!hooks || typeof hooks.ask !== 'function') return setTableConsent.apply(GristAPI, arguments);
      const ask = hooks.ask;
      return setTableConsent.call(GristAPI, Object.assign({}, hooks, {
        ask: function () {
          if (tripped) return Promise.resolve(false);
          const args = arguments;
          return checkNow().then(() => (tripped ? false : ask.apply(hooks, args)));
        },
      }));
    };
  }
})();
