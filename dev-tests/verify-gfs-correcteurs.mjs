#!/usr/bin/env node
// Les correcteurs du navigateur coupés par le bouton « LanguageTool » de GFS (consigne GFS 068, contrats de GFS 5.2 point 13, guide des apps règle 21, faits vérifiés de GFS 104) : la personne ajoute le bouton à la barre
// de GFS (réglage « Bouton LanguageTool ») et le lève pour couper ; GFS le dit à l'app (`contexte.correcteurs`, événement `correcteurs`, `{ coupes }`) et l'app pose, sur chaque zone de texte de sa page, la marque
// `data-lt-active="false"` que LanguageTool respecte, sur l'élément éditable LUI-MÊME. 700x400, le vrai widget (index.html servi tel quel) dans le GFS simulé (dev-tests/gfs-stub.js : `correcteurs` rend `contexte.correcteurs`,
// `setCorrecteurs(message)` envoie l'événement `correcteurs`) avec le vrai module de pose du kit (kit/js/correcteurs-pose.js, par la carte d'importation de index.html). La vérité de chaque comparaison est un JUGE
// INDÉPENDANT du kit, écrit ici d'après le contrat (un `textarea`, un `input` de texte, un élément `contenteditable` qui ne l'est pas à « false » ; jamais un conteneur, un mot de passe, une case, un nombre) : la page n'est
// jugée ni par le kit ni par l'app, mais contre ce que le contrat dit.
//  1) SANS COUPURE rien ne change : l'app seule (adresse sans `gfs=`) ne demande jamais le kit ni ne pose de marque ni ne dit rien dans la console ; un GFS d'avant la consigne 068 (le contexte n'a pas de `correcteurs`)
//     et un GFS sans le bouton (`{ coupes: false }`) ne marquent rien non plus, alors que la page a bien des zones à marquer.
//  2) AU DÉPART le contexte dit « coupé » : chaque zone de texte de la page porte la marque, ni plus ni moins ; la racine de l'éditeur (`.tiptap` éditable, la même pour Document, Grille et Slides+) aussi ; la marque ne
//     passe jamais dans le texte du modèle (`getHTML()` intact).
//  3) LES ÉVÉNEMENTS : couper puis rallumer pose et retire les marques à chaud, UN rappel des abonnés par changement et aucun quand rien ne change, SANS recharger le cadre (la page garde son jeton), sans une seule
//     transaction de ProseMirror (l'état de l'éditeur est le même objet), sans requête ; la saisie, l'annulation et `setEditable` laissent la marque de la racine en place.
//  4) UNE MARQUE QUI N'EST PAS AU KIT (posée par l'app, à « false » ou à « true ») reste comme elle est, coupé ou non.
//  5) UN MESSAGE QUI N'EN EST PAS UN (texte, `coupes` qui n'est pas exactement `true`, rien) vaut « pas coupé » ; un événement sans `correcteurs` ne change rien.
//  6) LES TROIS MODES : Document, Slides+ (l'extension `diapositives` se charge à la demande) et Grille, d'un modèle à l'autre sans recharger : la racine éditable est marquée à chaque fois, les rendus en lecture seule
//     (miniatures, aperçu) ne le sont pas.
//  7) LES ZONES QUI NAISSENT APRÈS : les notes de Slides+ (l'extension chargée après le départ), une fenêtre de l'app (`Dialogs` ; un champ secret n'est jamais marqué), des zones posées à la main (champ de texte,
//     recherche, nombre, mot de passe, case, `contenteditable` à « true », « plaintext-only », « false »), un `contenteditable` ou un `type` qui change ; rallumer retire tout, couper remet tout.
//  8) UN KIT QUI MANQUE (le module de pose, ou le lecteur du message) : l'app démarre, ne coupe rien et le dit une fois dans la console ; un kit qui arrive en retard coupe quand même.
//  9) DANS LE CADRE ISOLÉ de GFS (sans `allow-same-origin`), avec la politique de sécurité de la page respectée : mêmes marques au départ et à l'événement, aucune violation, cadre jamais rechargé.
// Lancé par run-headless.mjs (groupe Node « gfsCorrecteurs », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-correcteurs.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-correcteurs', port: Number(process.env.GFS_CORRECTEURS_PORT || 8989) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MODEL_HTML = '<p>Contenu A</p>';
const BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const DECK = '<h1>Titre un</h1><p>Premier texte</p>' + BREAK + '<h2>Deux</h2><p>Second</p>' + BREAK + '<h2>Trois</h2><p>Fin</p>';
const GRID = '<table style="width: 300px;"><colgroup><col style="width: 150px;"><col style="width: 150px;"></colgroup><tbody><tr data-row-height="60" style="height: 60px"><td colwidth="150"><p>Avant</p></td><td colwidth="150"><p>Après</p></td></tr></tbody></table>';
// Les modèles de départ de gfs-page.mjs, puis 7 (une présentation de trois diapositives) et 8 (une grille).
const SEED = seedModels({}) + `
  add(7, 'Présentation', ${JSON.stringify(DECK)}, false, 'presentation');
  add(8, 'Grille essai', ${JSON.stringify(GRID)}, false, 'grille');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
const WITH_SLIDES = ['graphique', 'diapositives'];
const MARK = 'data-lt-active';
// Ce que la console dit des correcteurs (tout le reste du bruit d'une page n'est pas l'affaire de cet essai).
const OURS = /correcteurs|GfsLink|GfsCorrecteurs|LanguageTool|data-lt/i;

// Ouvre le widget et garde ce que la console dit d'inquiétant (avertissements et erreurs) : `logs`.
async function open(options = {}) {
  const logs = [];
  const opened = await t.openPage({
    seed: SEED, ...options,
    before: async (page, context) => {
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(m.text()); });
      if (options.before) await options.before(page, context);
    },
  });
  return { ...opened, logs };
}
const closeOf = opened => opened.context.close().catch(() => {});
// La pose est finie : le contexte de GFS est arrivé et la marque est posée (`GfsCorrecteurs.ready` ; avant la consigne, le code n'existe pas : rien à attendre).
const settle = app => app.evaluate(() => (typeof GfsCorrecteurs === 'undefined' ? null : GfsCorrecteurs.ready)).catch(() => null);
// Attend que la condition soit vraie dans la page ; rend faux au bout du délai, sans arrêter l'essai.
const until = (app, fn, arg, timeout = 3000) => app.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const htmlOf = app => app.evaluate(() => EditorCore.getEditor().getHTML());
const requestsOf = (opened, pattern) => opened.requests.filter(url => pattern.test(url));

// La VÉRITÉ : ce que le contrat veut marqué, jugé ici, sans le module du kit. `wanted` : les zones de texte de la page ; `unwanted` : les autres candidats (case, bouton radio, nombre, curseur, mot de passe…) ; `marked` : ce
// qui porte la marque ; `missing` : voulu et pas marqué `false` ; `extra` : marqué et pas voulu. `exact` : tout y est, rien de trop, et il y a de quoi comparer des deux côtés (de l'un et de l'autre).
const oracleOf = app => app.evaluate(() => {
  const TEXT = new Set(['', 'text', 'search', 'email', 'url', 'tel']);
  const EDITABLE = new Set(['', 'true', 'plaintext-only']);
  const wants = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') return TEXT.has((el.getAttribute('type') || '').trim().toLowerCase());
    const editable = el.getAttribute('contenteditable');
    return editable !== null && EDITABLE.has(editable.trim().toLowerCase());
  };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.getAttribute('type') ? '[' + el.getAttribute('type') + ']' : '');
  const all = [...document.querySelectorAll('textarea, input, [contenteditable]')];
  const marked = [...document.querySelectorAll('[data-lt-active]')];
  const missing = all.filter(el => wants(el) && el.getAttribute('data-lt-active') !== 'false').map(name);
  const extra = marked.filter(el => !wants(el) || el.getAttribute('data-lt-active') !== 'false').map(name);
  const out = { wanted: all.filter(wants).length, unwanted: all.filter(el => !wants(el)).length, marked: marked.length, missing: missing.slice(0, 6), extra: extra.slice(0, 6) };
  out.exact = out.wanted > 0 && out.unwanted > 0 && out.marked === out.wanted && missing.length === 0 && extra.length === 0;
  return out;
});
// La racine éditable de l'éditeur (une seule par page ; les rendus en lecture seule, miniatures et aperçu, n'ont pas de `contenteditable`) : la marque qu'elle porte.
const rootMarks = app => app.evaluate(() => [...document.querySelectorAll('.tiptap[contenteditable="true"]')].map(root => root.getAttribute('data-lt-active')));
const markedCount = app => app.evaluate(() => document.querySelectorAll('[data-lt-active]').length);
const rootIsMarked = app => until(app, () => { const roots = document.querySelectorAll('.tiptap[contenteditable="true"]'); return roots.length === 1 && roots[0].getAttribute('data-lt-active') === 'false'; });
const allGone = app => until(app, () => document.querySelectorAll('[data-lt-active]').length === 0);

// Le message de GFS, par la page qui joue GFS (la page elle-même, ou la page parente d'un cadre) : le geste de la personne (un événement par changement de `coupes`), ou un événement tel quel.
const cut = (page, coupes) => page.evaluate(value => window.__gfsStub.setCorrecteurs({ coupes: value }), coupes);
const sendRaw = (page, data) => page.evaluate(payload => window.__gfsStub.post({ type: 'evenement', nom: 'correcteurs', data: payload }), data);
// Ce que l'app lit : `GfsLink.correcteurs()` ; et si la pose tourne : `GfsCorrecteurs.active()` (avant la consigne, ni l'un ni l'autre n'existent : « absent », et l'essai le dit au lieu de s'arrêter).
const readOf = app => app.evaluate(() => (typeof GfsLink.correcteurs === 'function' ? GfsLink.correcteurs() : { coupes: 'absent' })).catch(() => ({ coupes: 'absent' }));
const poseOf = app => app.evaluate(() => (typeof GfsCorrecteurs === 'undefined' ? 'absent' : GfsCorrecteurs.active())).catch(() => 'absent');
const modelOpens = (page, id) => page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id);
async function openModel(page, app, id) {
  await modelOpens(page, id);
  const ok = await until(app, n => String(Templates.getCurrentId()) === String(n), id, 8000);
  await sleep(900);
  return ok;
}

console.log('— 1) sans coupure : rien ne change');
const solo = await open({ hosted: false });
await settle(solo.app);
const soloOracle = await oracleOf(solo.app);
check('l\'app seule ne demande jamais le kit (ni le lecteur des correcteurs, ni la pose)', requestsOf(solo, /\/kit\//).length === 0, requestsOf(solo, /\/kit\//));
check('l\'app seule : aucune marque nulle part, la pose est inactive, l\'app lit « pas coupé », et il y avait des zones à marquer', soloOracle.marked === 0 && soloOracle.wanted > 0 && (await poseOf(solo.app)) === false && (await readOf(solo.app)).coupes === false, soloOracle);
check('l\'app seule : rien dans la console sur les correcteurs', solo.logs.filter(text => OURS.test(text)).length === 0, solo.logs);
await closeOf(solo);

const before068 = await open({ stub: {} });   // un GFS d'avant la consigne 068 : le contexte n'a pas de `correcteurs`
await settle(before068.app);
const before068Oracle = await oracleOf(before068.app);
check('un GFS d\'avant la consigne 068 : aucune marque, l\'app lit « pas coupé », la console ne dit rien, et il y avait des zones à marquer', before068Oracle.marked === 0 && before068Oracle.wanted > 0 && (await readOf(before068.app)).coupes === false && before068.logs.filter(text => OURS.test(text)).length === 0, [before068Oracle, before068.logs]);
await closeOf(before068);

const noButton = await open({ stub: { correcteurs: { coupes: false } } });   // un GFS sans le bouton dans sa barre : `{ coupes: false }`
await settle(noButton.app);
const noButtonOracle = await oracleOf(noButton.app);
check('GFS dit `{ coupes: false }` : aucune marque, rien dans la console, et il y avait des zones à marquer', noButtonOracle.marked === 0 && noButtonOracle.wanted > 0 && noButton.logs.filter(text => OURS.test(text)).length === 0, [noButtonOracle, noButton.logs]);
await closeOf(noButton);

console.log('— 2) au départ, le contexte dit « coupé »');
const on = await open({ stub: { correcteurs: { coupes: true }, extensions: WITH_SLIDES } });
await settle(on.app);
const onOracle = await oracleOf(on.app);
check('chaque zone de texte de la page porte `data-lt-active="false"`, ni plus ni moins (champs de texte et de recherche, textarea, contenteditable ; ni case, ni radio, ni nombre, ni curseur)', onOracle.exact && onOracle.wanted >= 10 && onOracle.unwanted >= 5, onOracle);
check('la racine de l\'éditeur (le `.tiptap` éditable, un seul) porte la marque elle-même', JSON.stringify(await rootMarks(on.app)) === '["false"]', await rootMarks(on.app));
check('la marque n\'entre pas dans le texte du modèle : `getHTML()` est celui du modèle, sans `data-lt-active`', (await htmlOf(on.app)) === MODEL_HTML, await htmlOf(on.app));
check('l\'app lit `{ coupes: true }` et rend une copie (la changer ne change rien chez elle)', await on.app.evaluate(() => { if (typeof GfsLink.correcteurs !== 'function') return false; const value = GfsLink.correcteurs(); value.coupes = false; return value.coupes === false && GfsLink.correcteurs().coupes === true && Object.keys(GfsLink.correcteurs()).join() === 'coupes'; }), await readOf(on.app));
check('la pose du kit tourne (hébergée) et le kit n\'a demandé que les deux modules attendus : le lecteur du message et la pose, jamais `correcteurs.js`', (await poseOf(on.app)) === true && requestsOf(on, /\/kit\/js\/correcteurs-message\.js/).length >= 1 && requestsOf(on, /\/kit\/js\/correcteurs-pose\.js/).length >= 1 && requestsOf(on, /\/kit\/js\/correcteurs\.js/).length === 0, requestsOf(on, /\/kit\//));
check('rien dans la console', on.logs.filter(text => OURS.test(text)).length === 0, on.logs);

console.log('— 3) les événements : à chaud, une fois, sans recharger');
const ev = await open({ stub: { correcteurs: { coupes: false } } });
await settle(ev.app);
await ev.app.evaluate(() => {
  const editor = EditorCore.getEditor();
  window.__token = Math.random();
  window.__calls = [];
  if (typeof GfsLink.onCorrecteurs === 'function') GfsLink.onCorrecteurs(value => window.__calls.push(value.coupes));
  window.__state0 = editor.state;
  window.__transactions = 0;
  editor.on('transaction', () => { window.__transactions++; });
});
const token = await ev.app.evaluate(() => window.__token);
const evHtml = await htmlOf(ev.app);
const requests0 = ev.requests.length;
check('« pas coupé » au départ : aucune marque, la racine n\'en a pas non plus', (await markedCount(ev.app)) === 0 && JSON.stringify(await rootMarks(ev.app)) === '[null]', await rootMarks(ev.app));
await cut(ev.page, true);
const evOn = await rootIsMarked(ev.app);
const evOnOracle = await oracleOf(ev.app);
check('la personne coupe (événement `correcteurs`) : les marques arrivent à chaud, sur chaque zone et sur la racine, ni plus ni moins', evOn && evOnOracle.exact, evOnOracle);
check('couper : un seul rappel des abonnés, `coupes: true`', JSON.stringify(await ev.app.evaluate(() => window.__calls)) === '[true]', await ev.app.evaluate(() => window.__calls));
await sendRaw(ev.page, { correcteurs: { coupes: true } });
await sleep(250);
check('GFS redit « coupé » (un événement qui ne change rien) : aucun rappel de plus, les marques sont les mêmes', JSON.stringify(await ev.app.evaluate(() => window.__calls)) === '[true]' && (await oracleOf(ev.app)).exact, await ev.app.evaluate(() => window.__calls));
await cut(ev.page, false);
const evOff = await allGone(ev.app);
check('la personne rallume : toutes les marques (celles de la coupure d\'avant) sont retirées, la racine aussi', evOn && evOff && JSON.stringify(await rootMarks(ev.app)) === '[null]', await markedCount(ev.app));
check('rallumer : un rappel de plus, `coupes: false` (deux au total, dans l\'ordre)', JSON.stringify(await ev.app.evaluate(() => window.__calls)) === '[true,false]', await ev.app.evaluate(() => window.__calls));
check('aucune transaction de ProseMirror, l\'état de l\'éditeur est le même objet, le texte du modèle est le même', (await ev.app.evaluate(() => window.__transactions)) === 0 && (await ev.app.evaluate(() => EditorCore.getEditor().state === window.__state0)) && (await htmlOf(ev.app)) === evHtml, await ev.app.evaluate(() => window.__transactions));
check('le cadre n\'est pas rechargé (la page garde son jeton) et couper ou rallumer ne demande aucune requête', (await ev.app.evaluate(() => window.__token)) === token && ev.requests.length === requests0, ev.requests.slice(requests0));
await cut(ev.page, true);
await rootIsMarked(ev.app);
await ev.app.evaluate(() => { const editor = EditorCore.getEditor(); editor.commands.focus('end'); editor.commands.insertContent('Bonjour'); });
await sleep(250);
const typed = await rootMarks(ev.app);
await ev.app.evaluate(() => { EditorCore.getEditor().commands.undo(); });
await sleep(250);
const undone = await rootMarks(ev.app);
const editable = await ev.app.evaluate(async () => {
  const editor = EditorCore.getEditor(), root = editor.view.dom, out = {};
  editor.setEditable(false);
  await new Promise(resolve => setTimeout(resolve, 120));
  out.off = [root.getAttribute('contenteditable'), root.getAttribute('data-lt-active')];
  editor.setEditable(true);
  await new Promise(resolve => setTimeout(resolve, 120));
  out.on = [root.getAttribute('contenteditable'), root.getAttribute('data-lt-active')];
  return out;
});
check('ProseMirror laisse la marque de la racine : après la saisie, après Annuler, et quand l\'éditeur devient non éditable puis éditable', JSON.stringify(typed) === '["false"]' && JSON.stringify(undone) === '["false"]' && editable.off[1] === 'false' && editable.on[0] === 'true' && editable.on[1] === 'false', { typed, undone, editable });
check('la marque n\'est jamais dans le texte que l\'app enregistre : `getHTML()` après la saisie n\'en porte pas', !(await htmlOf(ev.app)).includes(MARK), await htmlOf(ev.app));

console.log('— 4) une marque qui n\'est pas au kit');
await cut(ev.page, false);
await allGone(ev.app);
await ev.app.evaluate(() => {
  const mk = (id, extra) => { const div = document.createElement('div'); div.id = id; div.setAttribute('contenteditable', 'true'); if (extra) div.setAttribute('data-lt-active', extra); div.textContent = id; document.body.appendChild(div); };
  mk('app-off', 'false');
  mk('app-on', 'true');
  mk('kit-free');
});
await cut(ev.page, true);
await until(ev.app, () => document.getElementById('kit-free').getAttribute('data-lt-active') === 'false');
check('coupé : la zone sans marque est marquée, celles que l\'app a marquées (« false », « true ») restent comme elles sont', await ev.app.evaluate(() => ['app-off', 'app-on', 'kit-free'].map(id => document.getElementById(id).getAttribute('data-lt-active')).join()) === 'false,true,false', await ev.app.evaluate(() => ['app-off', 'app-on', 'kit-free'].map(id => document.getElementById(id).getAttribute('data-lt-active'))));
await cut(ev.page, false);
await until(ev.app, () => document.getElementById('kit-free').getAttribute('data-lt-active') === null);
check('rallumé : le kit retire les siennes et rien que les siennes (celles de l\'app restent, « false » et « true »)', await ev.app.evaluate(() => ['app-off', 'app-on', 'kit-free'].map(id => document.getElementById(id).getAttribute('data-lt-active')).join()) === 'false,true,' && (await markedCount(ev.app)) === 2, await markedCount(ev.app));
await ev.app.evaluate(() => ['app-off', 'app-on', 'kit-free'].forEach(id => document.getElementById(id).remove()));

console.log('— 5) un message qui n\'en est pas un');
// Chaque message de travers vaut « pas coupé » (`coupes` n'est « vrai » que s'il est exactement `true`) : de l'état coupé, il retire les marques ; un événement SANS `correcteurs` ne change rien.
const BAD = [
  ['du texte', { correcteurs: 'oui' }],
  ['`coupes` en texte', { correcteurs: { coupes: 'true' } }],
  ['`coupes` en nombre', { correcteurs: { coupes: 1 } }],
  ['un objet vide', { correcteurs: {} }],
  ['`null`', { correcteurs: null }],
  ['une liste', { correcteurs: [] }],
];
// Le GFS simulé croit son propre état (un message de travers ne le change pas) : pour que « coupé » soit bien envoyé chaque fois, il passe d'abord par « pas coupé ».
const recut = async () => { await cut(ev.page, false); await cut(ev.page, true); return rootIsMarked(ev.app); };
for (const [label, data] of BAD) {
  const armed = await recut();
  await sendRaw(ev.page, data);
  const gone = await allGone(ev.app);
  check('message de travers (' + label + ') : vaut « pas coupé », les marques (posées juste avant) sont retirées', armed && gone && (await readOf(ev.app)).coupes === false, [armed, await markedCount(ev.app)]);
}
const armedAgain = await recut();
for (const data of [{}, { autre: 1 }, null, 'texte']) await sendRaw(ev.page, data);
await sleep(250);
check('un événement `correcteurs` sans `correcteurs` (objet vide, autre clé, rien, texte) ne change rien : toujours coupé, marques intactes', armedAgain && (await readOf(ev.app)).coupes === true && (await oracleOf(ev.app)).exact, await readOf(ev.app));
await closeOf(ev);

console.log('— 6) les trois modes, sans recharger');
await closeOf(on);   // la page « coupé au départ » du § 2 est rouverte avec les deux modèles de plus (la même, à 700x400)
const modes = await open({ stub: { correcteurs: { coupes: true }, extensions: WITH_SLIDES } });
await settle(modes.app);
await modes.app.evaluate(() => { window.__token = Math.random(); });
const modesToken = await modes.app.evaluate(() => window.__token);
const slidesBefore = await modes.app.evaluate(() => typeof SlideNotesUi);
const docOracle = await oracleOf(modes.app);
check('Document : la racine éditable est marquée et toute la page est comme le contrat la veut', docOracle.exact && JSON.stringify(await rootMarks(modes.app)) === '["false"]', docOracle);
check('l\'extension `diapositives` n\'est pas encore chargée (elle vient à la demande) : le cas « chargée après » est vrai', slidesBefore === 'undefined', slidesBefore);
const slidesOpen = await openModel(modes.page, modes.app, 7);
const slidesOracle = await oracleOf(modes.app);
check('Slides+ (l\'extension se charge à l\'ouverture du modèle 7, trois diapositives) : la racine éditable est marquée, les rendus en lecture seule (miniatures, aperçu) ne le sont pas, ni plus ni moins', slidesOpen && (await modes.app.evaluate(() => typeof SlideNotesUi)) === 'object' && (await modes.app.evaluate(() => document.querySelectorAll('.pp-slide-thumb .tiptap').length)) === 3 && slidesOracle.exact && JSON.stringify(await rootMarks(modes.app)) === '["false"]' && (await modes.app.evaluate(() => [...document.querySelectorAll('.pp-slide-thumb .tiptap, .tpl-preview-sheet .tiptap')].every(root => !root.hasAttribute('data-lt-active')))), slidesOracle);
const gridOpen = await openModel(modes.page, modes.app, 8);
const gridOracle = await oracleOf(modes.app);
check('Grille (modèle 8, un tableau) : la racine éditable est marquée, toute la page est comme le contrat la veut', gridOpen && gridOracle.exact && JSON.stringify(await rootMarks(modes.app)) === '["false"]' && (await modes.app.evaluate(() => document.querySelectorAll('.tiptap table').length)) === 1, gridOracle);
await modes.app.evaluate(() => { const editor = EditorCore.getEditor(); editor.commands.focus('end'); editor.commands.insertContent('x'); });
await sleep(200);
await openModel(modes.page, modes.app, 1);
check('retour au Document par un autre modèle, sans recharger : la racine est marquée, la page aussi, le cadre garde son jeton', JSON.stringify(await rootMarks(modes.app)) === '["false"]' && (await oracleOf(modes.app)).exact && (await modes.app.evaluate(() => window.__token)) === modesToken, await rootMarks(modes.app));
await cut(modes.page, false);
check('rallumer dans un mode puis revenir : rien ne reste, nulle part', slidesOracle.exact && await allGone(modes.app) && (await openModel(modes.page, modes.app, 7)) && (await markedCount(modes.app)) === 0, await markedCount(modes.app));
await cut(modes.page, true);
await rootIsMarked(modes.app);
check('couper de nouveau dans Slides+ : la racine et la page sont marquées comme le contrat le veut', (await oracleOf(modes.app)).exact, await oracleOf(modes.app));

console.log('— 7) les zones qui naissent après');
const notes = await modes.app.evaluate(async () => {
  await Extensions.loadAll();
  const before = document.getElementById('pp-slide-notes-field');
  SlideNotesUi.open([0], () => {});
  await Promise.resolve();   // le rappel des observateurs de mutations passe avant la suite : la marque est là avant tout événement de la page (avant que la personne puisse taper)
  const field = document.getElementById('pp-slide-notes-field');
  return field ? { tag: field.tagName.toLowerCase(), mark: field.getAttribute('data-lt-active'), existed: before !== null } : null;
});
check('les notes de Slides+ (fenêtre et champ nés après le départ) sont marquées dès leur arrivée', notes !== null && notes.existed === false && notes.tag === 'textarea' && notes.mark === 'false', notes);
check('toute la page reste comme le contrat la veut, notes comprises', (await oracleOf(modes.app)).exact, await oracleOf(modes.app));
// Une fenêtre de l'app, née APRÈS le geste : la première demande de `Dialogs` bâtit la fenêtre. Un champ secret n'est jamais marqué ; le même champ redevenu texte l'est.
const dialogSecret = await modes.app.evaluate(async () => {
  const exists = Boolean(document.getElementById('pp-dialog-input'));
  Dialogs.prompt({ title: 'Mot de passe', label: 'Mot de passe', secret: true });
  await Promise.resolve();
  const input = document.getElementById('pp-dialog-input');
  return { exists, type: input && input.type, mark: input && input.getAttribute('data-lt-active') };
});
check('une fenêtre de l\'app née après le geste (`Dialogs`, la première demande bâtit la fenêtre) : son champ secret (mot de passe) n\'est jamais marqué', dialogSecret.exists === false && dialogSecret.type === 'password' && dialogSecret.mark === null, dialogSecret);
const dialogText = await modes.app.evaluate(async () => {
  Dialogs.prompt({ title: 'Nom', label: 'Nom', value: 'x' });
  await Promise.resolve();
  const input = document.getElementById('pp-dialog-input');
  return { type: input.type, mark: input.getAttribute('data-lt-active') };
});
check('la même fenêtre, pour une saisie de texte (le champ change de `type`) : le champ est marqué', dialogText.type === 'text' && dialogText.mark === 'false', dialogText);
// Des zones posées à la main, d'un type chacune : la page n'a pas à les connaître d'avance.
await modes.app.evaluate(() => {
  const host = document.createElement('div');
  host.id = 'lt-essai';
  host.innerHTML = '<input id="z-text" type="text"><input id="z-none"><input id="z-search" type="search"><input id="z-email" type="email"><input id="z-url" type="url"><input id="z-tel" type="tel"><textarea id="z-area"></textarea>'
    + '<div id="z-ce" contenteditable></div><div id="z-ce-true" contenteditable="true"></div><div id="z-ce-plain" contenteditable="plaintext-only"></div><div><span><b id="z-deep" contenteditable="true"></b></span></div>'
    + '<input id="n-password" type="password"><input id="n-check" type="checkbox"><input id="n-radio" type="radio"><input id="n-number" type="number"><input id="n-range" type="range"><input id="n-color" type="color"><input id="n-file" type="file"><input id="n-hidden" type="hidden">'
    + '<div id="n-ce-false" contenteditable="false"></div><div id="n-plain"></div><p id="n-p">texte</p><button id="n-button" type="button">ok</button>';
  document.body.appendChild(host);
});
await sleep(150);
const born = await modes.app.evaluate(() => Object.fromEntries([...document.querySelectorAll('#lt-essai [id]')].map(el => [el.id, el.getAttribute('data-lt-active')])));
const bornGood = Object.entries(born).filter(([id]) => id.startsWith('z-')).every(([, mark]) => mark === 'false');
const bornNo = Object.entries(born).filter(([id]) => id.startsWith('n-')).every(([, mark]) => mark === null);
check('des zones posées à la main, nées après : chaque champ de texte (texte, sans type, recherche, e-mail, adresse, téléphone), textarea et contenteditable (vide, « true », « plaintext-only », en profondeur) est marqué', bornGood && Object.keys(born).filter(id => id.startsWith('z-')).length === 11, born);
check('… et jamais un mot de passe, une case, un radio, un nombre, un curseur, une couleur, un fichier, un champ caché, un contenteditable à « false », un div, un paragraphe, un bouton', bornNo && Object.keys(born).filter(id => id.startsWith('n-')).length === 12, born);
await modes.app.evaluate(() => {
  document.getElementById('n-plain').setAttribute('contenteditable', 'true');
  document.getElementById('n-ce-false').setAttribute('contenteditable', 'true');
  document.getElementById('n-check').setAttribute('type', 'text');
  document.getElementById('n-number').type = 'search';
  document.getElementById('n-password').type = 'text';
});
await sleep(150);
const changed = await modes.app.evaluate(() => ['n-plain', 'n-ce-false', 'n-check', 'n-number', 'n-password'].map(id => document.getElementById(id).getAttribute('data-lt-active')));
check('un élément qui DEVIENT une zone de texte (div rendu éditable, « false » passé à « true », case ou nombre ou mot de passe passés en champ de texte) est marqué à l\'instant', changed.every(mark => mark === 'false'), changed);
const bornOracle = await oracleOf(modes.app);
check('toute la page, zones nées après comprises : exactement ce que le contrat veut', bornOracle.exact, bornOracle);
await cut(modes.page, false);
check('rallumer retire AUSSI les marques des zones nées après (fenêtres, notes, zones posées), rien ne reste', bornOracle.exact && await allGone(modes.app), await markedCount(modes.app));
await cut(modes.page, true);
await until(modes.app, () => document.getElementById('pp-slide-notes-field').getAttribute('data-lt-active') === 'false');
const regained = await oracleOf(modes.app);
check('couper de nouveau remet tout, notes et zones posées comprises, comme le contrat le veut', regained.exact && (await modes.app.evaluate(() => ['z-text', 'z-deep', 'n-check', 'pp-dialog-input'].every(id => document.getElementById(id).getAttribute('data-lt-active') === 'false'))), regained);
await closeOf(modes);

console.log('— 8) un kit qui manque ou qui arrive en retard');
const noPose = await open({ stub: { correcteurs: { coupes: true } }, before: page => page.route(/\/kit\/js\/correcteurs-pose\.js/, route => route.fulfill({ status: 404, body: 'absent' })) });
await settle(noPose.app);
check('le module de pose ne se charge pas : l\'app démarre, le modèle est intact, l\'app lit pourtant « coupé », mais rien n\'est marqué et la pose se dit inactive', (await htmlOf(noPose.app)) === MODEL_HTML && (await readOf(noPose.app)).coupes === true && (await markedCount(noPose.app)) === 0 && (await poseOf(noPose.app)) === false, await markedCount(noPose.app));
check('le module de pose ne se charge pas : la console le dit une fois (`[GfsCorrecteurs]`)', noPose.logs.filter(text => /\[GfsCorrecteurs\]/.test(text)).length === 1, noPose.logs);
await closeOf(noPose);

const noReader = await open({ stub: { correcteurs: { coupes: true } }, before: page => page.route(/\/kit\/js\/correcteurs-message\.js/, route => route.fulfill({ status: 404, body: 'absent' })) });
await settle(noReader.app);
check('le lecteur du message ne se charge pas (la pose, elle, tourne) : l\'app démarre, rien n\'est cru sans être lu, donc rien n\'est coupé ni marqué', (await poseOf(noReader.app)) === true && (await htmlOf(noReader.app)) === MODEL_HTML && (await readOf(noReader.app)).coupes === false && (await markedCount(noReader.app)) === 0, await readOf(noReader.app));
check('le lecteur du message ne se charge pas : la console le dit une fois (`[GfsLink]`, les correcteurs)', noReader.logs.filter(text => /\[GfsLink\].*correcteurs/i.test(text)).length === 1, noReader.logs);
await closeOf(noReader);

const slowReader = await open({ stub: { correcteurs: { coupes: true } }, before: page => page.route(/\/kit\/js\/correcteurs-message\.js/, async (route) => { await sleep(900); await route.continue(); }) });
await settle(slowReader.app);
const slowReaderDone = await until(slowReader.app, () => document.querySelector('.tiptap[contenteditable="true"]') && document.querySelector('.tiptap[contenteditable="true"]').getAttribute('data-lt-active') === 'false', null, 6000);
check('le lecteur du message arrive en retard (900 ms) alors que le contexte dit déjà « coupé » : la coupure se fait quand même, exactement', slowReaderDone && (await oracleOf(slowReader.app)).exact && slowReader.logs.filter(text => OURS.test(text)).length === 0, [await oracleOf(slowReader.app), slowReader.logs]);
await closeOf(slowReader);

const slowPose = await open({ stub: { correcteurs: { coupes: true } }, before: page => page.route(/\/kit\/js\/correcteurs-pose\.js/, async (route) => { await sleep(900); await route.continue(); }) });
await settle(slowPose.app);
check('la pose arrive en retard (900 ms) : la coupure se fait quand même, exactement, sans rien dire dans la console', (await poseOf(slowPose.app)) === true && (await oracleOf(slowPose.app)).exact && slowPose.logs.filter(text => OURS.test(text)).length === 0, [await oracleOf(slowPose.app), slowPose.logs]);
await closeOf(slowPose);

console.log('— 9) dans le cadre isolé de GFS');
const CSP_WATCH = "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));";
const framed = await open({ framed: { csp: "frame-src 'self'" }, bypassCSP: false, stub: { correcteurs: { coupes: true }, extensions: WITH_SLIDES }, init: CSP_WATCH });
await settle(framed.app);
await framed.app.evaluate(() => { window.__token = Math.random(); });
const framedToken = await framed.app.evaluate(() => window.__token);
const framedOracle = await oracleOf(framed.app);
check('cadre isolé (origine « nulle », politique de la page respectée) : au départ « coupé », chaque zone de texte et la racine sont marquées, ni plus ni moins', framedOracle.exact && JSON.stringify(await rootMarks(framed.app)) === '["false"]', framedOracle);
await cut(framed.page, false);
const framedOff = await allGone(framed.app);
check('cadre isolé : l\'événement `correcteurs` traverse le vrai `postMessage` : rallumer retire tout', framedOracle.exact && framedOff, await markedCount(framed.app));
await cut(framed.page, true);
const framedOn = await rootIsMarked(framed.app);
check('cadre isolé : couper de nouveau remet tout, comme le contrat le veut, et le cadre n\'a pas été rechargé (il garde son jeton)', framedOn && (await oracleOf(framed.app)).exact && (await framed.app.evaluate(() => window.__token)) === framedToken, await oracleOf(framed.app));
const violations = await framed.app.evaluate(() => window.__csp || []);
check('cadre isolé : aucune violation de la politique de sécurité de la page (carte d\'importation, modules du kit, marques posées par le DOM)', framedOracle.marked > 0 && violations.length === 0, violations);
check('cadre isolé : rien dans la console sur les correcteurs', framed.logs.filter(text => OURS.test(text)).length === 0, framed.logs);
await closeOf(framed);

await t.finish();
