// La fenêtre de mise à jour des noms (consigne 104 de GFS, kit 0.29.1) : le SEUL fichier du widget qui parle au module `kit/names-update` (`NamesUpdate.run` : voir s'il y a des noms à mettre à jour et si cette personne peut le faire, ouvrir la
// fenêtre commune, envoyer UN lot, relire les noms et vérifier) et à `kit/i18n` (la langue dont la fenêtre prend ses textes). Rien n'est renommé sans elle, dans GFS comme seul : js/schema-columns.js ne renomme plus rien lui-même.
// js/schema-columns.js lui donne ce qui est propre à Publipostage+ : `readSchema` (les noms du document maintenant), `plan` (le lot de renommage d'après ces noms, que le kit recalcule sur des noms relus juste avant d'envoyer), `apply` (UN seul
// `applyUserActions`) et `readOnly`. Ici s'ajoutent deux choses que le kit demande à l'app :
//  - la preuve de propriété (`isOwner`) : la fenêtre ne s'ouvre que pour qui est propriétaire du document ; tout le reste (pas propriétaire, ou pas de preuve) continue sur les noms que le document a, sans rien montrer. Dans GFS, la preuve est celle de
//    GFS (`contexte.role.proprietaire`, contrats 5.2 point 8, GfsLink.role) : l'app n'y a aucun jeton d'écriture. Seule, c'est celle du moteur de partage du kit : `GET /webhooks` de l'interface REST de Grist avec un jeton capable d'écrire, que Grist ne
//    rend qu'aux propriétaires (200 : propriétaire ; 403 : pas propriétaire ; tout autre résultat : pas de preuve). Ce jeton vit dans la fonction qui l'a demandé et nulle part ailleurs, comme celui de js/row-attachment.js ;
//  - l'avant-fenêtre : la page entière est là (les scripts de la page tournent tous avant DOMContentLoaded), le kit parle la langue de l'app (celle que js/i18n.js a décidée : GFS, le choix de la personne ou le navigateur) et le « chargement long »
//    de js/first-contact.js est suspendu pendant que la fenêtre attend la personne (ce temps n'est pas une lenteur du réseau), comme pour la question de js/table-consent.js. Elle ne se fait qu'une fois la preuve rendue vraie : une personne qui n'a pas
//    à voir la fenêtre ne coûte rien de plus que la preuve.
// Le module du kit (une dizaine de fichiers) ne se charge que quand il y a quelque chose à faire : js/schema-columns.js n'appelle `run` que pour un document qui porte une table du widget sous son nom d'avant.
//   NamesUpdateBridge.run({ readSchema, plan, apply, readOnly }) -> Promise<{ state, held, … }>   l'état du kit : none, wait, blocked, done, already ou skipped (voir kit/js/names-update/index.js) ; `wait` aussi quand le module du kit ne se charge pas
//   NamesUpdateBridge.proveOwner() -> Promise<true | false | null>   la preuve de propriété seule (essais)
//   NamesUpdateBridge.announceStale() -> Promise<boolean>   « Rechargez la page » (consigne 104 f) : js/schema-columns.js l'appelle quand une écriture échoue deux fois sur des noms qui ont changé ailleurs (un autre onglet, une autre personne ou une restauration a renommé
//     les tables du document depuis que cette page les a lues). Une seule fenêtre par page ; « Fermer » laisse copier ce que la page n'avait pas enregistré. Vrai quand la fenêtre s'est ouverte.
//   NamesUpdateBridge.useKitForTests(chargeur | null) -> remplace le chargement du kit par `chargeur()` -> Promise<{ NamesUpdate, kitI18n }> (essais : le produit ne l'appelle jamais) ; null le rend
const NamesUpdateBridge = (function () {
  const APP_NAME = 'Publipostage+';
  // La preuve REST attend Grist au plus ce temps : au-delà, pas de preuve (le démarrage de l'app attend la fenêtre, il n'attend pas Grist sans fin).
  const PROOF_TIMEOUT_MS = 8000;

  const loadKitFromImportMap = () => Promise.all([import('kit/names-update'), import('kit/i18n')])
    .then(([names, i18n]) => ({ NamesUpdate: names.NamesUpdate, kitI18n: i18n.I18n }));
  let loadKit = loadKitFromImportMap;
  function useKitForTests(loader) { loadKit = typeof loader === 'function' ? loader : loadKitFromImportMap; }

  // Seule : `GET /webhooks` avec un jeton capable d'écrire (js/grist-api.js, getWriteAccess : demandé ici, jeté ici). Une réponse qui n'est pas la liste des webhooks (une page de connexion d'un mandataire, une erreur) ne prouve rien.
  async function proveByWriteToken() {
    if (typeof GristAPI === 'undefined' || typeof GristAPI.getWriteAccess !== 'function' || typeof fetch !== 'function') return null;
    let access = null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), PROOF_TIMEOUT_MS) : 0;
    try {
      access = await GristAPI.getWriteAccess();
      const response = await fetch(access.baseUrl + '/webhooks?auth=' + encodeURIComponent(access.token), controller ? { signal: controller.signal } : undefined);
      if (response.status === 403) return false;
      if (!response.ok) return null;
      const body = await response.json();
      return body && Array.isArray(body.webhooks) ? true : null;
    } catch (e) {
      return null;   // rien n'est écrit dans la console : une erreur de réseau peut citer l'adresse, et l'adresse porte le jeton
    } finally {
      clearTimeout(timer);
      access = null;   // le jeton capable d'écrire est jeté avec la preuve
    }
  }

  // true : propriétaire ; false : pas propriétaire ; null : pas de preuve (GFS ne sait pas encore, ne répond pas ou date d'avant la consigne 104 ; Grist ne répond pas ou refuse le jeton).
  async function proveOwner() {
    if (typeof GfsLink !== 'undefined' && GfsLink.hosted) {
      await GfsLink.ready;
      const role = typeof GfsLink.role === 'function' ? GfsLink.role() : null;
      return role && typeof role.owner === 'boolean' ? role.owner : null;
    }
    return proveByWriteToken();
  }

  function whenPageIsLoaded() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  async function beforeWindow(kit) {
    await whenPageIsLoaded();
    kit.kitI18n.setLanguage(I18n.getLang());
    if (typeof FirstContact !== 'undefined') FirstContact.pause();
  }

  function afterWindow() {
    if (typeof FirstContact !== 'undefined') FirstContact.resume();
  }

  async function run({ readSchema, plan, apply, readOnly }) {
    let kit;
    try { kit = await loadKit(); }
    catch (e) {
      console.warn('[NamesUpdate] le module du kit ne se charge pas : le document garde ses noms, lus tels quels', e);
      return { state: 'wait', reason: 'module', held: [] };
    }
    let prepared = false;
    const port = {
      readSchema,
      readOnly,
      apply,
      isOwner: async () => {
        const owner = await proveOwner();
        if (owner === true) { await beforeWindow(kit); prepared = true; }
        return owner;
      },
    };
    try {
      return await kit.NamesUpdate.run({ port, plan, appName: APP_NAME });
    } catch (e) {
      console.warn('[NamesUpdate] la mise à jour des noms a échoué : le document garde ses noms, lus tels quels', e);
      return { state: 'wait', reason: 'error', held: [] };
    } finally {
      if (prepared) afterWindow();
    }
  }

  // « Rechargez la page » : la fenêtre simple du widget (js/dialogs.js), un seul bouton qui recharge, « Fermer » à côté. Elle ne s'ouvre qu'une fois par page : une personne qui l'a fermée pour copier son texte n'est pas relancée à chaque essai d'écriture,
  // l'erreur de l'écriture (code NAMES_CHANGED_ELSEWHERE) part de toute façon chez l'appelant. Recharger le cadre du widget suffit : les noms se lisent au démarrage.
  let staleShown = false;
  async function announceStale() {
    if (staleShown) return false;
    staleShown = true;
    if (typeof Dialogs === 'undefined' || !Dialogs || typeof Dialogs.choose !== 'function') return false;
    try {
      const choice = await Dialogs.choose({
        title: I18n.t('names.stale.title'),
        message: I18n.t('names.stale.message'),
        choices: [{ value: 'reload', label: I18n.t('names.stale.reload'), primary: true }],
        cancelLabel: I18n.t('common.close'),
      });
      if (choice === 'reload') window.location.reload();
      return true;
    } catch (e) {
      console.warn('[NamesUpdate] la fenêtre « Rechargez la page » ne s\'ouvre pas', e);
      return false;
    }
  }

  return { run, proveOwner, useKitForTests, announceStale };
})();
