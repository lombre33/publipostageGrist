#!/usr/bin/env node
// Ouvrir le modèle que GFS désigne (consigne GFS 010 : js/gfs-link.js `opening` / `onOpen`, js/gfs-open.js, js/main.js `init`, js/row-template.js `start`) et lui faire ouvrir un modèle vierge (« Nouveau », consigne
// 014 : js/gfs-open.js `requestedBlank`, js/main.js `openBlankOfType` / `startNewTemplate`, js/slides-entry.js `startNew`), 700x400. Un GFS simulé (dev-tests/gfs-stub.js,
// adresse `?gfs=0`) joue le rôle de GFS : il rend l'`ouverture` du contexte et envoie l'appel `ouvrir` à l'app déjà ouverte ; ce script lit ce que la personne voit (la liste des modèles, le texte, le
// coin d'état) et ce que GFS reçoit.
//  AU DÉMARRAGE : le modèle que GFS désigne passe avant l'ordre habituel (la ligne, le modèle de la vue, le ★) et le coin d'état dit pourquoi, en français et en anglais, clair et sombre ; la ligne qui
//   désignait un autre modèle ne rouvre pas le sien par-dessus (les lignes suivantes suivent les règles) ; rien n'est écrit (ni modèle de la vue, ni ★) ; sans modèle qui s'ouvre (`ouverture` nulle,
//   « Nouveau », identifiant inconnu, type que la garde de la 002 refuse, forme inattendue) l'ordre habituel reste, sans message ; une raison inconnue ouvre sans rien dire ; un GFS qui ne répond pas
//   n'empêche pas le démarrage.
//  « NOUVEAU » (consigne 014 : `fichier` nul et un `type`) AU DÉMARRAGE : un modèle vierge de ce type s'ouvre à la place de l'ordre habituel - document, email avec son bandeau, grille avec son tableau, présentation en 16:9
//   quand l'extension « diapositives » est active - sans que le ★ ni aucun modèle s'ouvre, sans rien écrire, le coin d'état garde l'avertissement « modèle non enregistré » (français et anglais), la ligne courante ne
//   rouvre pas son modèle ; le macro-modèle garde l'ordre habituel et ouvre par-dessus son écran de composition, vide, dans le panneau ; `dossier` n'y change rien ; un type absent, refusé par la garde, une présentation
//   sans l'extension, un document en lecture seule : l'ordre habituel, sans message.
//  SEUL (adresse sans `gfs=`) : rien n'est envoyé, aucun appel `ouvrir` n'est écouté, l'ordre d'arrivée est celui d'avant.
//  APPEL `ouvrir` : un autre modèle s'ouvre (réponse `{ ouvert: true }`, le coin d'état dit pourquoi) ; déjà ouvert : `{ ouvert: true }`, rien ne change ; introuvable, d'un type refusé, sans fichier :
//   `{ ouvert: false }` ; avec des modifications en attente la question « Enregistrer / Abandonner / Annuler » se pose et la réponse attend la personne (« Annuler » : `{ ouvert: false }`) ; un appel reçu
//   pendant le démarrage attend sa fin ; deux appels de suite sont traités l'un après l'autre ; tout autre nom d'appel reçoit `GFS_INCONNU` ; sans `id` entier, aucune réponse.
//  APPEL `ouvrir` SANS FICHIER (« Nouveau ») : le modèle vierge s'ouvre par le chemin du bouton « Nouveau » du même type (`{ ouvert: true }` ; document, email, grille, présentation si l'extension est active ; macro-modèle :
//   son écran de composition est ouvert), avec la question d'enregistrement quand des modifications attendent (« Annuler » : `{ ouvert: false }`, « Abandonner » : le vierge s'ouvre) ; un type absent, refusé, une
//   présentation sans l'extension, un document en lecture seule : `{ ouvert: false }`, rien ne change ; deux appels de suite à la suite l'un de l'autre ; un appel reçu pendant le démarrage attend sa fin ; rien n'est écrit.
// Lancé par run-headless.mjs (groupe Node "gfsOpen", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-open.mjs
// GFS_OPEN_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.GFS_OPEN_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-gfs-open', port: Number(process.env.GFS_OPEN_PORT || 8913) });
const { check } = t;

const PHRASE = { fr: 'Ouvert depuis l’explorateur.', en: 'Opened from the explorer.' };
const READY = { fr: 'Widget prêt.', en: 'Widget ready.' };
const WHAT = (id, extra) => Object.assign({ fichier: id == null ? null : { id: String(id), type: 'modele' }, type: id == null ? 'document' : '', dossier: '', raison: 'explorateur' }, extra || {});
// « Nouveau » (consigne 014) : pas de fichier, le type demandé.
const NEW = (type, extra) => Object.assign({ fichier: null, type, dossier: '', raison: 'nouveau' }, extra || {});
const WARNING = { fr: /^Modèle non enregistré/, en: /^Template not saved/ };
const MACRO_TITLE = { fr: 'Macro-modèle', en: 'Macro template' };
const ROW_RULES = { enabled: true, rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: '3' }], otherwise: 'default' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Les modèles que l'app ouvre, dans l'ordre (`Templates.setCurrentId` est le point de passage de toute ouverture ; `null` : un modèle vierge), et la fin du démarrage (`FirstContact.ready`, son dernier geste avant le coin d'état).
const TRACK = `window.__opened = []; window.__started = false;
  document.addEventListener('DOMContentLoaded', () => {
    const ready = FirstContact.ready.bind(FirstContact);
    FirstContact.ready = (...args) => { window.__started = true; return ready(...args); };
    const original = Templates.setCurrentId;
    Templates.setCurrentId = (id) => { window.__opened.push(String(id)); return original(id); };
  });`;
const started = page => page.waitForFunction(() => window.__started === true, null, { timeout: 90000 });

// Ce que la personne voit : le modèle ouvert (liste, nom, texte) et le coin d'état.
const shown = page => page.evaluate(() => ({
  current: Templates.getCurrentId(), list: document.getElementById('template-select').value, name: document.getElementById('template-name').value,
  text: document.querySelector('.ProseMirror').textContent, status: document.getElementById('status-msg').textContent, statusClass: document.getElementById('status-msg').className,
}));
const surfaces = page => page.evaluate(() => {
  const visible = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.style.display !== 'none' && e.getBoundingClientRect().height > 0; };
  return { emailBanner: visible('v2-email-fields-row'), macroSummary: visible('macro-summary-container'), editor: visible('editor-container') };
});
// Le mode grille, les modèles ouverts depuis le début et la page (une présentation vierge prend la diapositive 16:9 en paysage).
const probe = page => page.evaluate(() => ({ grid: GridEditor.isActive(), table: !!document.querySelector('.ProseMirror table'), opened: window.__opened || [], format: PageLayout.getFormat(), orientation: PageLayout.getOrientation() }));
// L'écran de composition d'un macro-modèle : ouvert ou non, vide, dans le panneau (titre, champ, boutons), le focus dans le nom ; `cancel` : où cliquer « Annuler ».
const macroModal = page => page.evaluate(() => {
  const ov = document.getElementById('macro-editor-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const inside = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; };
  const name = document.getElementById('macro-editor-name');
  const cancel = document.getElementById('macro-editor-cancel').getBoundingClientRect();
  return {
    open: true, title: ov.querySelector('h3').textContent, name: name.value, focused: document.activeElement === name,
    inPanel: inside(ov.querySelector('.modal-content')), parts: [name, document.getElementById('macro-editor-save'), document.getElementById('macro-editor-cancel')].every(inside),
    cancel: { x: cancel.left + cancel.width / 2, y: cancel.top + cancel.height / 2 },
  };
});
const closeMacroModal = async (page) => {
  const m = await macroModal(page);
  if (!m.open) return;
  await page.mouse.move(m.cancel.x - 10, m.cancel.y, { steps: 2 });
  await page.mouse.click(m.cancel.x, m.cancel.y);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('macro-editor-modal')).display === 'none', null, { timeout: 4000 }).catch(() => {});
};
// Ce que le faux Grist a reçu : les écritures dans la table des modèles (aucune ne doit partir d'une ouverture), les options de la vue.
const writes = page => page.evaluate(() => ({ models: window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles') + window.__gristStub.countActions('AddRecord', 'Publipostage_Modeles'), options: JSON.stringify(window.__gristStub.state.options) }));
// L'appel de GFS et sa réponse ; `sans-reponse` si l'app n'a rien répondu dans le délai.
const ask = (page, args, name = 'ouvrir', ms = 6000) => page.evaluate(({ args, name, ms }) => Promise.race([window.__gfsStub.call(name, args), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]), { args, name, ms });
const answers = page => page.evaluate(() => window.__gfsStub.answers.slice());

async function startWith(label, { stub, options, record, lang = 'fr', colorScheme = 'light', hosted = true, search = '' } = {}, expectName, expectId, expectStatus) {
  const opened = await t.openPage({ hosted, stub, seed: seedModels({ options, record }), lang, colorScheme, search });
  const got = await shown(opened.page);
  check(label, got.name === expectName && String(got.current) === String(expectId) && String(got.list) === String(expectId) && got.status === expectStatus, got);
  return opened;
}

console.log('\n== Au démarrage : le modèle que GFS désigne ==');
{
  let o = await startWith('GFS désigne « Départ B » : il s’ouvre à la place du ★, et le coin d’état dit pourquoi', { stub: { ouverture: WHAT(2) } }, 'Départ B', 2, PHRASE.fr);
  const got = await shown(o.page);
  const sent = await o.page.evaluate(() => window.__gfsStub.calls.map(c => c.nom));
  check('le texte de ce modèle est à l’écran, sans classe d’erreur', got.text === 'Contenu B' && got.statusClass === '', got);
  check('GFS a reçu l’appel `contexte` et rien d’autre au démarrage', JSON.stringify(sent) === JSON.stringify(['contexte']), sent);
  check('rien n’est écrit : ni écriture de modèle (★ compris), ni option de la vue', JSON.stringify(await writes(o.page)) === JSON.stringify({ models: 0, options: 'null' }), await writes(o.page));
  await o.context.close();

  o = await startWith('le modèle de GFS passe avant le modèle choisi pour la vue, sans le changer', { stub: { ouverture: WHAT(2) }, options: { modeleDeLaVue: '3' } }, 'Départ B', 2, PHRASE.fr);
  const w = await writes(o.page);
  check('l’option `modeleDeLaVue` reste celle qu’elle était', JSON.parse(w.options).modeleDeLaVue === '3' && w.models === 0, w);
  await o.context.close();

  o = await startWith('le modèle de GFS passe avant la ligne qui désigne un autre modèle', { stub: { ouverture: WHAT(2) }, options: { modeleSelonLigne: ROW_RULES }, record: { id: 1, Nom: 'L1', Statut: 'Urgent' } }, 'Départ B', 2, PHRASE.fr);
  await sleep(1500);
  let now = await shown(o.page);
  check('la ligne courante ne rouvre pas son modèle par-dessus celui de GFS (même une fois le démarrage fini)', now.name === 'Départ B' && String(now.current) === '2' && now.status === PHRASE.fr, now);
  await o.page.evaluate(() => window.__gristStub.fireRecord({ id: 4, Nom: 'L4', Statut: 'Urgent' }, 'PpDepart'));
  await o.page.waitForFunction(() => String(Templates.getCurrentId()) === '3', null, { timeout: 4000 }).catch(() => {});
  now = await shown(o.page);
  check('une autre ligne qui correspond, reçue ensuite, suit sa règle comme d’habitude', now.name === 'Départ C' && now.text === 'Contenu C', now);
  await o.context.close();

  o = await startWith('GFS désigne un email : il s’ouvre avec son bandeau Objet / À / Cc', { stub: { ouverture: WHAT(4) } }, 'Départ E email', 4, PHRASE.fr);
  let s = await surfaces(o.page);
  check('le bandeau de l’email est montré avec l’éditeur, sans résumé de macro-modèle', s.emailBanner && s.editor && !s.macroSummary, s);
  await o.context.close();

  o = await startWith('GFS désigne un macro-modèle : le résumé de sa composition remplace l’éditeur', { stub: { ouverture: WHAT(5) } }, 'Départ M macro', 5, PHRASE.fr);
  s = await surfaces(o.page);
  check('le résumé est à l’écran et l’éditeur caché', s.macroSummary && !s.editor && !s.emailBanner, s);
  await o.context.close();
}

console.log('\n== Au démarrage : sans modèle qui s’ouvre, l’ordre habituel (aucun message) ==');
{
  const cases = [
    ['`ouverture` nulle (GFS n’a rien demandé)', { ouverture: null }],
    ['« Nouveau » sans type (une ouverture mal formée)', { ouverture: NEW('') }],
    ['« Nouveau » d’un type que la garde « type inconnu » refuse', { ouverture: NEW('reglages') }],
    ['« Nouveau » d’un type que l’app ne connaît pas', { ouverture: NEW('inconnu') }],
    ['« Nouveau » d’une présentation, GFS n’ayant pas activé l’extension « diapositives »', { ouverture: NEW('presentation') }],
    ['un identifiant qui n’est plus un modèle du document', { ouverture: WHAT(99) }],
    ['un modèle d’un type que la garde « type inconnu » ne laisse pas ouvrir', { ouverture: WHAT(6) }],
    ['un `fichier` sans identifiant', { ouverture: { fichier: { id: '' }, type: '', dossier: '', raison: 'explorateur' } }],
    ['un identifiant qui n’est pas un numéro de ligne', { ouverture: WHAT('abc') }],
    ['une `ouverture` qui n’est pas un objet', { ouverture: 'Départ B' }],
  ];
  for (const [label, stub] of cases) {
    const o = await startWith(`${label} : le ★ s’ouvre, le coin d’état dit seulement « ${READY.fr} »`, { stub }, 'Départ A défaut', 1, READY.fr);
    const got = await shown(o.page);
    check(`${label} : pas d’erreur affichée`, got.statusClass === '', got);
    await o.context.close();
  }
  const o = await startWith('une raison que l’app ne connaît pas (`lien`) : le modèle s’ouvre, sans phrase', { stub: { ouverture: WHAT(2, { raison: 'lien' }) } }, 'Départ B', 2, READY.fr);
  await o.context.close();
}

console.log('\n== Au démarrage : « Nouveau » ouvre un modèle vierge du type demandé ==');
{
  // Le démarrage est fini (`__started`) : le coin d'état, les modèles ouverts et les écritures se lisent alors une fois pour toutes.
  const startNew = async (stub, { options, record, lang = 'fr', colorScheme = 'light', search = '' } = {}) => {
    const o = await t.openPage({ hosted: true, stub, seed: seedModels({ options, record }), lang, colorScheme, init: TRACK, search });
    await started(o.page);
    return o;
  };
  const onlyBlank = opened => opened.length > 0 && opened.every(id => id === 'null');
  const nothingWritten = async page => { const w = await writes(page); return w.models === 0 && w.options === 'null'; };

  let o = await startNew({ ouverture: NEW('document') });
  let got = await shown(o.page);
  let seen = await probe(o.page);
  check('« Nouveau » document : un éditeur vide, sans nom ni modèle courant, la liste sur « Nouveau modèle »', got.current == null && got.list === '' && got.name === '' && got.text === '', got);
  check('le ★ (ni aucun autre modèle) ne s’est ouvert : seul le vierge est passé par `setCurrentId`', onlyBlank(seen.opened), seen.opened);
  check('le coin d’état garde l’avertissement « modèle non enregistré », pas « Widget prêt. »', WARNING.fr.test(got.status) && got.statusClass === 'error-msg', got);
  check('rien n’est écrit : ni modèle, ni ★, ni option de la vue', await nothingWritten(o.page), await writes(o.page));
  const sent = await o.page.evaluate(() => window.__gfsStub.calls.map(c => c.nom));
  check('GFS a reçu l’appel `contexte` et rien d’autre au démarrage', JSON.stringify(sent) === JSON.stringify(['contexte']), sent);
  await o.context.close();

  o = await startNew({ ouverture: NEW('email') });
  got = await shown(o.page); seen = await probe(o.page);
  let s = await surfaces(o.page);
  check('« Nouveau » email : un modèle vierge, son bandeau Objet / À / Cc / Cci est montré avec l’éditeur', got.current == null && got.name === '' && got.text === '' && s.emailBanner && s.editor && !s.macroSummary && onlyBlank(seen.opened), { got, s, seen });
  check('l’email vierge garde l’avertissement « modèle non enregistré »', WARNING.fr.test(got.status), got);
  await o.context.close();

  o = await startNew({ ouverture: NEW('grille') });
  got = await shown(o.page); seen = await probe(o.page); s = await surfaces(o.page);
  check('« Nouveau » grille : le mode grille, avec son tableau de départ, sans bandeau d’email', got.current == null && got.name === '' && seen.grid && seen.table && !s.emailBanner && onlyBlank(seen.opened), { got, s, seen });
  await o.context.close();

  o = await startNew({ ouverture: NEW('macro') });
  got = await shown(o.page);
  let m = await macroModal(o.page);
  check('« Nouveau » macro-modèle : l’ordre habituel reste (le ★ s’ouvre) et l’écran de composition s’ouvre par-dessus, vide', got.name === 'Départ A défaut' && String(got.current) === '1' && m.open && m.title === MACRO_TITLE.fr && m.name === '', { got, m });
  check('l’écran de composition tient dans le panneau (titre, champ, boutons) et le focus est dans le nom', m.inPanel && m.parts && m.focused, m);
  await closeMacroModal(o.page);
  m = await macroModal(o.page);
  got = await shown(o.page);
  check('« Annuler » (vraie souris) le ferme : le modèle habituel est resté, rien n’est écrit', !m.open && got.name === 'Départ A défaut' && await nothingWritten(o.page), { m, got });
  await o.context.close();

  o = await startNew({ ouverture: NEW('presentation'), extensions: ['graphique', 'diapositives'] });
  got = await shown(o.page); seen = await probe(o.page);
  check('« Nouveau » présentation (extension active) : un modèle vierge, sur la diapositive 16:9 en paysage', got.current == null && got.name === '' && got.text === '' && onlyBlank(seen.opened) && seen.format === '190.5x338.7' && seen.orientation === 'landscape', { got, seen });
  check('la présentation vierge garde l’avertissement et rien n’est écrit', WARNING.fr.test(got.status) && await nothingWritten(o.page), got);
  await o.context.close();

  o = await startNew({ ouverture: NEW('email', { dossier: 'Contrats/2026' }) });
  got = await shown(o.page); s = await surfaces(o.page);
  check('un `dossier` rempli n’y change rien : le même email vierge, à la racine, sans rien écrire', got.current == null && s.emailBanner && await nothingWritten(o.page), { got, s });
  await o.context.close();

  o = await startNew({ ouverture: NEW('document') }, { options: { modeleDeLaVue: '3', modeleSelonLigne: ROW_RULES }, record: { id: 1, Nom: 'L1', Statut: 'Urgent' } });
  await sleep(1500);
  got = await shown(o.page); seen = await probe(o.page);
  let w = await writes(o.page);
  check('le vierge passe avant le modèle de la vue et avant la ligne qui désigne un autre modèle, qui ne rouvre pas le sien (même une fois le démarrage fini)', got.current == null && got.name === '' && onlyBlank(seen.opened) && JSON.parse(w.options).modeleDeLaVue === '3' && w.models === 0, { got, seen, w });
  await o.page.evaluate(() => window.__gristStub.fireRecord({ id: 4, Nom: 'L4', Statut: 'Urgent' }, 'PpDepart'));
  await o.page.waitForFunction(() => String(Templates.getCurrentId()) === '3', null, { timeout: 4000 }).catch(() => {});
  got = await shown(o.page);
  check('une autre ligne qui correspond, reçue ensuite, suit sa règle comme d’habitude', got.name === 'Départ C' && got.text === 'Contenu C', got);
  await o.context.close();

  o = await startNew({ ouverture: NEW('document') }, { search: '&readonly=true' });
  got = await shown(o.page); seen = await probe(o.page);
  check('un document en lecture seule : l’ordre habituel (le ★ s’ouvre), aucun vierge, aucun avertissement', got.name === 'Départ A défaut' && String(got.current) === '1' && seen.opened.join() === '1' && !WARNING.fr.test(got.status) && got.statusClass === '', { got, seen });
  await o.context.close();
}

console.log('\n== Au démarrage : un GFS qui ne répond pas, et l’app seule ==');
{
  const begin = Date.now();
  const o = await startWith('GFS ne répond pas au contexte : le démarrage suit l’ordre habituel (le ★) après les 5 secondes', { stub: { ignoreContext: true, ouverture: WHAT(2) } }, 'Départ A défaut', 1, READY.fr);
  check('le démarrage n’attend pas plus que le délai du contexte', Date.now() - begin < 40000, Date.now() - begin);
  await o.context.close();

  const solo = await t.openPage({
    hosted: false, seed: seedModels(),
    init: `window.__sent = []; const original = window.postMessage.bind(window); window.postMessage = function (message, ...rest) { if (message && typeof message === 'object' && 'gfs' in message) window.__sent.push(message); return original(message, ...rest); };`,
  });
  let got = await shown(solo.page);
  check('seule (adresse sans `gfs=`) : le ★ s’ouvre comme avant', got.name === 'Départ A défaut' && got.status === READY.fr, got);
  await solo.page.evaluate(() => window.postMessage({ gfs: 0, type: 'appel', id: 1, nom: 'ouvrir', args: { fichier: { id: '2', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' } }, '*'));
  await sleep(700);
  got = await shown(solo.page);
  const sentSolo = await solo.page.evaluate(() => window.__sent);
  check('seule : un appel `ouvrir` reçu n’ouvre rien et ne reçoit aucune réponse (rien n’est écouté ni envoyé)', got.name === 'Départ A défaut' && sentSolo.length === 1 && sentSolo[0].type === 'appel', { got, sentSolo });
  await solo.context.close();
}

console.log('\n== L’appel `ouvrir` : l’app est déjà ouverte ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: { ouverture: null }, storage: { pp_autosave_enabled: 'false' } });
  const page = o.page;
  let got = await shown(page);
  check('l’app s’ouvre sur le ★ (GFS n’a rien désigné)', got.name === 'Départ A défaut' && got.status === READY.fr, got);

  let reply = await ask(page, WHAT(1));
  got = await shown(page);
  check('le modèle demandé est déjà ouvert : `{ ouvert: true }`, rien ne change (ni modèle, ni coin d’état)', reply.type === 'reponse' && reply.data.ouvert === true && got.name === 'Départ A défaut' && got.status === READY.fr, { reply, got });

  const nextId = await page.evaluate(() => window.__gfsStub.answers.length);
  reply = await ask(page, WHAT(3));
  got = await shown(page);
  const w = await writes(page);
  check('un autre modèle : il s’ouvre, la réponse est `{ ouvert: true }` du contrat 0 avec l’`id` de l’appel', reply.type === 'reponse' && reply.gfs === 0 && Number.isInteger(reply.id) && reply.data.ouvert === true && got.name === 'Départ C' && got.text === 'Contenu C', { reply, got, nextId });
  check('le coin d’état dit pourquoi', got.status === PHRASE.fr, got);
  check('rien n’est écrit : ni modèle, ni ★, ni option de la vue', w.models === 0 && w.options === 'null', w);

  for (const [label, args] of [
    ['un modèle introuvable', WHAT(99)],
    ['un modèle d’un type refusé par la garde « type inconnu »', WHAT(6)],
    ['« Nouveau » sans type', NEW('')],
    ['« Nouveau » d’un type que la garde « type inconnu » refuse', NEW('reglages')],
    ['« Nouveau » d’une présentation, l’extension « diapositives » n’étant pas active', NEW('presentation')],
    ['des arguments qui ne sont pas un objet', 'Départ B'],
  ]) {
    reply = await ask(page, args);
    const after = await shown(page);
    check(`${label} : \`{ ouvert: false }\`, le modèle ouvert et le coin d’état ne bougent pas`, reply.type === 'reponse' && reply.data.ouvert === false && after.name === 'Départ C' && after.status === PHRASE.fr, { reply, after });
  }

  reply = await ask(page, WHAT(4, { raison: 'lien' }));
  got = await shown(page);
  check('une raison inconnue : le modèle s’ouvre, le coin d’état ne dit rien de plus que ce que l’ouverture a posé', reply.data && reply.data.ouvert === true && got.name === 'Départ E email' && got.status !== PHRASE.fr, { reply, got });

  reply = await ask(page, WHAT(1), 'fermer');
  check('un autre nom d’appel (`fermer`) reçoit `GFS_INCONNU`, avec l’`id` de l’appel', reply.type === 'erreur' && reply.code === 'GFS_INCONNU' && Number.isInteger(reply.id) && typeof reply.message === 'string', reply);
  reply = await ask(page, {}, 'installer');
  check('`installer` aussi : cet appel ne va que d’une app vers GFS', reply.type === 'erreur' && reply.code === 'GFS_INCONNU', reply);

  const before = (await answers(page)).length;
  await page.evaluate(() => window.__gfsStub.post({ type: 'appel', nom: 'fermer', args: {} }));
  await page.evaluate(() => window.__gfsStub.post({ type: 'appel', nom: 'ouvrir', args: { fichier: { id: '2', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' } }));
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '2', null, { timeout: 4000 }).catch(() => {});
  await sleep(500);
  got = await shown(page);
  check('un appel sans `id` n’attend pas de réponse : `ouvrir` ouvre quand même le modèle, `fermer` est ignoré, rien n’est répondu', got.name === 'Départ B' && (await answers(page)).length === before, { got, before, after: (await answers(page)).length });

  // Deux appels postés dans le même instant : le modèle de chacun s'ouvre à son tour (Templates.setCurrentId est le point de passage de toute ouverture), et les réponses suivent dans cet ordre.
  const both = await page.evaluate(async () => {
    const stub = window.__gfsStub;
    const opened = [];
    const original = Templates.setCurrentId;
    Templates.setCurrentId = (id) => { opened.push(String(id)); return original(id); };
    const one = stub.ouvrir({ fichier: { id: '3', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' });
    const two = stub.ouvrir({ fichier: { id: '1', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' });
    const [first, second] = await Promise.all([one, two]);
    Templates.setCurrentId = original;
    return { opened, first: first.data && first.data.ouvert, second: second.data && second.data.ouvert, ordered: first.id < second.id, current: String(Templates.getCurrentId()) };
  });
  check('deux appels de suite sont traités l’un après l’autre : C puis A s’ouvrent, les deux reçoivent `{ ouvert: true }`', JSON.stringify(both) === JSON.stringify({ opened: ['3', '1'], first: true, second: true, ordered: true, current: '1' }), both);
  await o.context.close();
}

console.log('\n== L’appel `ouvrir` avec des modifications en attente : la question d’enregistrement ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: { ouverture: null }, storage: { pp_autosave_enabled: 'false' } });
  const page = o.page;
  const rectOf = selector => page.evaluate((sel) => {
    const e = document.querySelector(sel); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.right };
  }, selector);
  const dialog = () => page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
    const box = ov.querySelector('.modal-content').getBoundingClientRect();
    const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    return { open: true, title: ov.querySelector('h3').textContent, buttons, inPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
  });
  const clickDialog = async (label) => {
    const d = await dialog();
    const b = d.open && d.buttons.find(x => x.label === label);
    if (!b) throw new Error('bouton « ' + label + ' » absent : ' + JSON.stringify(d));
    await page.mouse.move(b.x - 10, b.y, { steps: 2 });
    await page.mouse.click(b.x, b.y);
    await sleep(500);
  };
  const typeAtEnd = async (text) => {
    const para = await rectOf('.ProseMirror p');
    await page.mouse.click(para.r - 3, para.y);
    await page.keyboard.press('End');
    await page.keyboard.type(text);
    await page.waitForFunction(() => document.getElementById('status-msg').classList.contains('is-unsaved'), null, { timeout: 5000 }).catch(() => {});
  };

  await typeAtEnd(' TAPÉ');
  let pending = ask(page, WHAT(2), 'ouvrir', 20000);
  await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  let d = await dialog();
  check('des modifications attendent : la question « Enregistrer / Abandonner / Annuler » se pose, dans le panneau', d.open && d.inPanel && d.buttons.map(b => b.label).join('|') === 'Annuler|Abandonner|Enregistrer', d);
  await sleep(600);
  check('GFS n’a pas de réponse tant que la personne n’a pas choisi (pas de délai)', (await answers(page)).length === 0, await answers(page));
  await clickDialog('Annuler');
  let reply = await pending;
  let got = await shown(page);
  check('« Annuler » : `{ ouvert: false }`, le modèle ouvert garde ce qui a été tapé', reply.type === 'reponse' && reply.data.ouvert === false && got.name === 'Départ A défaut' && got.text.includes('TAPÉ'), { reply, got });

  pending = ask(page, WHAT(2), 'ouvrir', 20000);
  await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await clickDialog('Abandonner');
  reply = await pending;
  got = await shown(page);
  check('« Abandonner » : `{ ouvert: true }`, le modèle demandé est ouvert et dit pourquoi', reply.type === 'reponse' && reply.data.ouvert === true && got.name === 'Départ B' && got.text === 'Contenu B' && got.status === PHRASE.fr, { reply, got });

  await typeAtEnd(' ENCORE');
  pending = ask(page, WHAT(3), 'ouvrir', 20000);
  await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await clickDialog('Enregistrer');
  reply = await pending;
  got = await shown(page);
  const saves = await page.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
  check('« Enregistrer » : le modèle quitté est enregistré (une écriture), puis `{ ouvert: true }` et le modèle demandé s’ouvre', reply.type === 'reponse' && reply.data.ouvert === true && saves === 1 && got.name === 'Départ C', { reply, got, saves });

  // « Nouveau » (consigne 014) passe par le chemin du bouton « Nouveau » du type : la même question se pose, et GFS attend la personne.
  await typeAtEnd(' NOUVEAU');
  let answered = (await answers(page)).length;
  pending = ask(page, NEW('email'), 'ouvrir', 20000);
  await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  d = await dialog();
  await sleep(600);
  check('« Nouveau » avec des modifications en attente : la même question, dans le panneau, et GFS n’a pas de réponse tant que la personne n’a pas choisi', d.open && d.inPanel && d.buttons.map(b => b.label).join('|') === 'Annuler|Abandonner|Enregistrer' && (await answers(page)).length === answered, d);
  await clickDialog('Annuler');
  reply = await pending;
  got = await shown(page);
  check('« Annuler » : `{ ouvert: false }`, le modèle ouvert garde ce qui a été tapé', reply.type === 'reponse' && reply.data.ouvert === false && got.name === 'Départ C' && got.text.includes('NOUVEAU'), { reply, got });

  pending = ask(page, NEW('email'), 'ouvrir', 20000);
  await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await clickDialog('Abandonner');
  reply = await pending;
  got = await shown(page);
  const surf = await surfaces(page);
  const savesAfter = await page.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
  check('« Abandonner » : `{ ouvert: true }`, l’email vierge est à l’écran avec son bandeau et son avertissement « modèle non enregistré »', reply.type === 'reponse' && reply.data.ouvert === true && got.current == null && got.name === '' && surf.emailBanner && WARNING.fr.test(got.status), { reply, got, surf });
  check('rien n’a été enregistré de plus', savesAfter === 1, savesAfter);
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

console.log('\n== L’appel `ouvrir` sans fichier : « Nouveau » (l’app est déjà ouverte) ==');
{
  const o = await t.openPage({
    seed: seedModels(), stub: { ouverture: null }, storage: { pp_autosave_enabled: 'false' },
    init: `${TRACK}
      window.__modes = [];
      document.addEventListener('DOMContentLoaded', () => {
        const email = MainToolbar.setEmailMode, grid = MainToolbar.setGridMode;
        MainToolbar.setEmailMode = (on, ...rest) => { if (on) window.__modes.push('email'); return email.call(MainToolbar, on, ...rest); };
        MainToolbar.setGridMode = (on, ...rest) => { if (on) window.__modes.push('grille'); return grid.call(MainToolbar, on, ...rest); };
      });`,
  });
  const page = o.page;
  await started(page);
  const dialogOpen = () => page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; });
  let got = await shown(page);
  check('l’app s’ouvre sur le ★ (GFS n’a rien désigné)', got.name === 'Départ A défaut' && got.status === READY.fr, got);

  let reply = await ask(page, NEW('document'));
  got = await shown(page);
  check('document : `{ ouvert: true }` avec l’`id` de l’appel, le ★ cède la place à un éditeur vide, sans nom ni modèle courant', reply.type === 'reponse' && reply.gfs === 0 && Number.isInteger(reply.id) && reply.data.ouvert === true && got.current == null && got.list === '' && got.name === '' && got.text === '', { reply, got });
  check('le coin d’état garde l’avertissement « modèle non enregistré » : aucune phrase de GFS par-dessus', WARNING.fr.test(got.status) && got.statusClass === 'error-msg', got);

  reply = await ask(page, NEW('email'));
  got = await shown(page);
  let s = await surfaces(page);
  check('email : `{ ouvert: true }`, un email vierge avec son bandeau Objet / À / Cc / Cci', reply.data && reply.data.ouvert === true && got.current == null && got.text === '' && s.emailBanner && s.editor, { reply, got, s });

  reply = await ask(page, NEW('grille'));
  got = await shown(page);
  let seen = await probe(page);
  s = await surfaces(page);
  check('grille : `{ ouvert: true }`, le mode grille avec son tableau de départ, sans bandeau d’email', reply.data && reply.data.ouvert === true && got.current == null && seen.grid && seen.table && !s.emailBanner, { reply, got, seen, s });

  reply = await ask(page, NEW('document', { dossier: 'Contrats/2026' }));
  got = await shown(page);
  seen = await probe(page);
  check('un `dossier` rempli n’y change rien : un document vierge, hors du mode grille', reply.data && reply.data.ouvert === true && got.current == null && got.text === '' && !seen.grid, { reply, got, seen });

  reply = await ask(page, NEW('macro'));
  let m = await macroModal(page);
  got = await shown(page);
  check('macro-modèle : `{ ouvert: true }`, l’écran de composition est ouvert, vide, dans le panneau, le focus dans le nom ; le modèle dessous ne change pas', reply.data && reply.data.ouvert === true && m.open && m.name === '' && m.inPanel && m.parts && m.focused && got.current == null, { reply, m, got });
  await closeMacroModal(page);
  m = await macroModal(page);
  check('« Annuler » (vraie souris) ferme cet écran', !m.open, m);

  for (const [label, args] of [
    ['« Nouveau » sans type', NEW('')],
    ['« Nouveau » d’un type que la garde « type inconnu » refuse', NEW('reglages')],
    ['« Nouveau » d’un type que l’app ne connaît pas', NEW('inconnu')],
    ['« Nouveau » d’une présentation, l’extension « diapositives » n’étant pas active', NEW('presentation')],
  ]) {
    const before = await shown(page);
    reply = await ask(page, args);
    const after = await shown(page);
    m = await macroModal(page);
    check(`${label} : \`{ ouvert: false }\`, rien ne change (ni le modèle, ni le coin d’état, aucun écran, aucune question)`, reply.type === 'reponse' && reply.data.ouvert === false && JSON.stringify(after) === JSON.stringify(before) && !m.open && !(await dialogOpen()), { reply, before, after });
  }

  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique', 'diapositives']));
  await page.waitForFunction(() => SlidesEntry.isAvailable(), null, { timeout: 4000 });
  reply = await ask(page, NEW('presentation'));
  got = await shown(page);
  seen = await probe(page);
  check('présentation, l’extension « diapositives » étant active : `{ ouvert: true }`, un vierge sur la diapositive 16:9 en paysage, hors du mode grille', reply.data && reply.data.ouvert === true && got.current == null && got.text === '' && !seen.grid && seen.format === '190.5x338.7' && seen.orientation === 'landscape', { reply, got, seen });
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await page.waitForFunction(() => !SlidesEntry.isAvailable(), null, { timeout: 4000 });
  reply = await ask(page, NEW('presentation'));
  check('l’extension éteinte de nouveau : `{ ouvert: false }`, et aucune fenêtre ne s’ouvre pour l’expliquer', reply.data && reply.data.ouvert === false && !(await dialogOpen()), { reply });

  // Deux appels postés dans le même instant : l'un après l'autre, dans l'ordre (les réponses suivent), sans qu'une question se pose par-dessus l'autre.
  const both = await page.evaluate(async () => {
    const stub = window.__gfsStub;
    window.__modes.length = 0;
    const one = stub.ouvrir({ fichier: null, type: 'email', dossier: '', raison: 'nouveau' });
    const two = stub.ouvrir({ fichier: null, type: 'grille', dossier: '', raison: 'nouveau' });
    const [first, second] = await Promise.all([one, two]);
    return { modes: window.__modes.slice(), first: first.data && first.data.ouvert, second: second.data && second.data.ouvert, ordered: first.id < second.id, grid: GridEditor.isActive() };
  });
  check('deux appels de suite sont traités l’un après l’autre : l’email s’ouvre, puis la grille, les deux reçoivent `{ ouvert: true }`', JSON.stringify(both) === JSON.stringify({ modes: ['email', 'grille'], first: true, second: true, ordered: true, grid: true }), both);

  const w = await writes(page);
  check('rien n’est écrit de tout cela : ni modèle, ni ★, ni option de la vue', w.models === 0 && w.options === 'null', w);
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();

  const readonly = await t.openPage({ seed: seedModels(), stub: { ouverture: null }, search: '&readonly=true' });
  const before = await shown(readonly.page);
  reply = await ask(readonly.page, NEW('document'));
  const after = await shown(readonly.page);
  check('un document en lecture seule : `{ ouvert: false }`, rien ne change', reply.type === 'reponse' && reply.data.ouvert === false && JSON.stringify(after) === JSON.stringify(before) && before.name === 'Départ A défaut', { reply, before, after });
  await readonly.context.close();
}

console.log('\n== L’appel `ouvrir` sans fichier reçu pendant le démarrage ==');
{
  // Comme pour un modèle désigné : la réponse n'arrive qu'après « Widget prêt. », le ★ s'est ouvert avant, puis le vierge.
  const o = await t.openPage({
    seed: seedModels(), stub: { ouverture: null },
    init: `
      window.__order = [];
      document.addEventListener('DOMContentLoaded', () => {
        const ready = FirstContact.ready.bind(FirstContact);
        FirstContact.ready = (...args) => { window.__order.push('prêt'); return ready(...args); };
        const original = Templates.setCurrentId;
        Templates.setCurrentId = (id) => { window.__order.push('ouvert:' + id); return original(id); };
        window.__gfsStub.ouvrir({ fichier: null, type: 'email', dossier: '', raison: 'nouveau' }).then((message) => {
          window.__order.push('réponse');
          window.__early = { message, current: Templates.getCurrentId(), status: document.getElementById('status-msg').textContent, banner: !document.getElementById('v2-email-fields-row').hidden };
        });
      });`,
  });
  await o.page.waitForFunction(() => !!window.__early, null, { timeout: 30000 }).catch(() => {});
  const early = await o.page.evaluate(() => ({ early: window.__early || null, order: window.__order }));
  check('la réponse arrive : `{ ouvert: true }`, l’email vierge est à l’écran avec son bandeau et son avertissement', !!early.early && early.early.message.type === 'reponse' && early.early.message.data.ouvert === true && early.early.current == null && early.early.banner && WARNING.fr.test(early.early.status), early.early);
  const at = word => early.order.findIndex(e => e === word || e.startsWith(word + ':'));
  check('elle n’arrive qu’après la fin du démarrage : le ★ s’ouvre, « Widget prêt. » est posé, puis le vierge s’ouvre, puis la réponse part', at('ouvert:1') !== -1 && at('ouvert:1') < at('prêt') && at('prêt') < early.order.lastIndexOf('ouvert:null') && early.order.lastIndexOf('ouvert:null') < at('réponse'), early.order);
  await o.context.close();
}

console.log('\n== L’appel `ouvrir` reçu pendant le démarrage ==');
{
  // GFS envoie l'appel dès que la page est chargée, bien avant la fin du démarrage de l'app : la réponse n'arrive qu'après « Widget prêt. » (FirstContact.ready, juste avant), et le modèle est alors ouvert.
  const o = await t.openPage({
    seed: seedModels(), stub: { ouverture: null },
    init: `
      window.__order = [];
      document.addEventListener('DOMContentLoaded', () => {
        const ready = FirstContact.ready.bind(FirstContact);
        FirstContact.ready = (...args) => { window.__order.push('prêt'); return ready(...args); };
        const original = Templates.setCurrentId;
        Templates.setCurrentId = (id) => { window.__order.push('ouvert:' + id); return original(id); };
        window.__gfsStub.ouvrir({ fichier: { id: '3', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }).then((message) => {
          window.__order.push('réponse');
          window.__early = { message, current: Templates.getCurrentId(), status: document.getElementById('status-msg').textContent };
        });
      });`,
  });
  await o.page.waitForFunction(() => !!window.__early, null, { timeout: 30000 }).catch(() => {});
  const early = await o.page.evaluate(() => ({ early: window.__early || null, order: window.__order }));
  check('la réponse arrive : `{ ouvert: true }`, le modèle demandé est ouvert et le coin d’état dit pourquoi', !!early.early && early.early.message.type === 'reponse' && early.early.message.data.ouvert === true && String(early.early.current) === '3' && early.early.status === PHRASE.fr, early.early);
  const at = word => early.order.findIndex(e => e === word || e.startsWith(word + ':'));
  check('elle n’arrive qu’après la fin du démarrage : « Widget prêt. » est posé, puis le modèle de GFS s’ouvre, puis la réponse part', at('prêt') !== -1 && at('prêt') < early.order.lastIndexOf('ouvert:3') && early.order.lastIndexOf('ouvert:3') < at('réponse'), early.order);
  await o.context.close();
}

console.log('\n== Le coin d’état à 700x400 : français clair, anglais sombre ==');
for (const [lang, colorScheme] of [['fr', 'light'], ['en', 'dark']]) {
  const o = await startWith(`${lang} ${colorScheme} : la phrase « ${PHRASE[lang]} » s’écrit à l’ouverture`, { stub: { ouverture: WHAT(2) }, lang, colorScheme }, 'Départ B', 2, PHRASE[lang]);
  const box = await o.page.evaluate(() => {
    const e = document.getElementById('status-msg'); const r = e.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, clipped: e.scrollWidth > e.clientWidth + 1, display: getComputedStyle(e).display, visibility: getComputedStyle(e).visibility };
  });
  const contrast = await contrastOf(o.page, '#status-msg');
  check(`${lang} ${colorScheme} : le coin d’état est dans le panneau, visible, sans rien couper`, box.w > 0 && box.h > 0 && box.l >= 0 && box.t >= 0 && box.r <= WIDTH && box.b <= HEIGHT && !box.clipped && box.visibility === 'visible', box);
  check(`${lang} ${colorScheme} : son texte a un contraste d’au moins 4,5:1`, contrast >= 4.5, contrast);
  if (SHOTS) await o.page.screenshot({ path: `${SHOTS}/gfs-open-${lang}-${colorScheme}.png` });
  await o.context.close();

  // « Nouveau » (consigne 014) : l'avertissement « modèle non enregistré » du coin d'état (le message entier se lit au survol), puis l'écran de composition d'un macro-modèle.
  const blank = await t.openPage({ hosted: true, stub: { ouverture: NEW('document') }, seed: seedModels(), lang, colorScheme, init: TRACK });
  await started(blank.page);
  const warn = await blank.page.evaluate(() => {
    const e = document.getElementById('status-msg'); const r = e.getBoundingClientRect();
    return { text: e.textContent, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, visibility: getComputedStyle(e).visibility, cls: e.className };
  });
  const warnContrast = await contrastOf(blank.page, '#status-msg');
  check(`${lang} ${colorScheme} : « Nouveau » : l’avertissement « modèle non enregistré » est dans le panneau, visible, en erreur`, WARNING[lang].test(warn.text) && warn.cls === 'error-msg' && warn.w > 0 && warn.h > 0 && warn.l >= 0 && warn.t >= 0 && warn.r <= WIDTH && warn.b <= HEIGHT && warn.visibility === 'visible', warn);
  check(`${lang} ${colorScheme} : son texte a un contraste d’au moins 4,5:1`, warnContrast >= 4.5, warnContrast);
  if (SHOTS) await blank.page.screenshot({ path: `${SHOTS}/gfs-nouveau-${lang}-${colorScheme}.png` });
  await blank.context.close();

  const macro = await t.openPage({ hosted: true, stub: { ouverture: NEW('macro') }, seed: seedModels(), lang, colorScheme, init: TRACK });
  await started(macro.page);
  const composition = await macroModal(macro.page);
  const titleContrast = await contrastOf(macro.page, '#macro-editor-title');
  check(`${lang} ${colorScheme} : « Nouveau » macro-modèle : l’écran de composition (« ${MACRO_TITLE[lang]} ») tient dans le panneau, le focus dans le nom`, composition.open && composition.title === MACRO_TITLE[lang] && composition.inPanel && composition.parts && composition.focused, composition);
  check(`${lang} ${colorScheme} : son titre a un contraste d’au moins 4,5:1`, titleContrast >= 4.5, titleContrast);
  if (SHOTS) await macro.page.screenshot({ path: `${SHOTS}/gfs-nouveau-macro-${lang}-${colorScheme}.png` });
  await macro.context.close();
}

await t.finish();
