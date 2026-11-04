#!/usr/bin/env node
// Répondre à l'appel `fermer` de GFS et enregistrer avant de partir (consigne GFS 047 : js/gfs-link.js `onClose` / `deliverClose`, js/gfs-open.js `handleClose` / `settle`, js/main.js `saveBeforeGfsLeaves` / `leaveForGfs`),
// 700x400. Un GFS simulé (dev-tests/gfs-stub.js, adresse `?gfs=0`) envoie `fermer { raison }` à l'app active, ou `ouvrir` pour un autre de ses fichiers ; ce script lit ce que la personne voit (la fenêtre « Enregistrer / Ne pas
// enregistrer / Annuler », le texte, le modèle ouvert), ce que le faux Grist a reçu (le contenu écrit, le nombre d'écritures) et ce que GFS reçoit en réponse.
//  LE FIL (gfs-link.js seul, sans le reste de l'app) : un `fermer` reçu avant l'abonné l'attend et lui est donné à l'inscription ; `{ ferme: true }` seulement quand l'abonné rend vrai (rien d'autre : ni un texte, ni 1, ni rien) ;
//   une erreur de l'abonné est une erreur pour GFS (`GFS_ECHEC`), jamais un `oui` ; la raison est l'un des six mots du contrat (`app`, `explorateur`, `nouveau`, `importer`, `lire`, `lien`), sinon vide ; sans `id` entier, aucune
//   réponse ; tout autre appel reçoit `GFS_INCONNU`.
//  RIEN N'ATTEND : `{ ferme: true }` aussitôt, pour chacune des six raisons et pour une raison inconnue, sans fenêtre ni écriture.
//  ENREGISTREMENT AUTOMATIQUE ALLUMÉ : ce qui a été tapé est enregistré AVANT la réponse (Grist lent : la réponse attend la fin de l'écriture, et le contenu écrit est déjà là quand elle arrive), sans aucune question, en une seule écriture ;
//   un passage de l'enregistrement automatique déjà parti finit d'écrire d'abord (une seule écriture en tout) ; l'appel `ouvrir` d'un autre modèle ou d'un modèle vierge fait de même (`{ ouvert: true }`, sans question).
//  CE QUE L'APP NE PEUT PAS DÉCIDER SEULE : la question « Enregistrer / Ne pas enregistrer / Annuler » se pose et GFS n'a pas de réponse tant que la personne n'a pas choisi - enregistrement automatique coupé, écriture refusée,
//   modèle sans nom (pas d'« Enregistrer » à proposer), modèle modifié ailleurs (rien n'écrase la version de l'autre) ; « Annuler » et Échap : `{ ferme: false }`, tout reste en place ; « Ne pas enregistrer » : `{ ferme: true }`
//   sans écriture ; « Enregistrer » : l'écriture, puis `{ ferme: true }`. Un modèle neuf avec un nom est créé avant le `oui`.
//  UN ÉCHEC : la fenêtre qui ne s'ouvre pas, ou qui échoue, donne une erreur à GFS et jamais un `oui` ; un `fermer` envoyé au chargement est répondu.
// Lancé par run-headless.mjs (groupe Node "gfsClose", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-close.mjs
import { start, seedModels, ROOT } from './gfs-page.mjs';
import { join } from 'node:path';

const t = await start({ name: 'verify-gfs-close', port: Number(process.env.GFS_CLOSE_PORT || 8910) });
const { check } = t;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const REASONS = ['app', 'explorateur', 'nouveau', 'importer', 'lire', 'lien'];
const TABLE = 'Publipostage_Modeles';
const WHAT = (id, extra) => Object.assign({ fichier: { id: String(id), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }, extra || {});
const NEW = (type, extra) => Object.assign({ fichier: null, type, dossier: '', raison: 'nouveau' }, extra || {});
const LABELS = {
  fr: { cancel: 'Annuler', discard: 'Ne pas enregistrer', save: 'Enregistrer' },
  en: { cancel: 'Cancel', discard: 'Don’t save', save: 'Save' },
};
// L'enregistrement automatique ne part plus tout seul (son intervalle de 2,5 s, le seul de l'app, devient une heure) : toute écriture que l'essai voit est celle de `fermer` ou de `ouvrir`.
const FREEZE = `(() => { const original = window.setInterval; window.setInterval = function (fn, ms, ...rest) { return original.call(this, fn, ms === 2500 ? 3600000 : ms, ...rest); }; })();`;

// Un appel `fermer` : la réponse de l'app, ou `{ type: 'sans-reponse' }` au bout de `ms`.
const askClose = (page, raison = 'app', ms = 8000) => page.evaluate(({ raison, ms }) => Promise.race([window.__gfsStub.fermer(raison), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]), { raison, ms });
const askOpen = (page, args, ms = 20000) => page.evaluate(({ args, ms }) => Promise.race([window.__gfsStub.ouvrir(args), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]), { args, ms });
// La même chose, avec le temps que la réponse a pris et l'état du faux Grist AU MOMENT où elle arrive (ce qui était déjà écrit).
const askTimed = (page, call, args, ms = 20000) => page.evaluate(async ({ call, args, ms }) => {
  const started = performance.now();
  const reply = await Promise.race([call === 'fermer' ? window.__gfsStub.fermer(args) : window.__gfsStub.ouvrir(args), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]);
  const row = window.__gristStub.getRow('Publipostage_Modeles', 1);
  return { reply, took: Math.round(performance.now() - started), content: row ? row.Contenu : null, saves: window.__gristStub.countSaves('Publipostage_Modeles') };
}, { call, args, ms });
const answers = page => page.evaluate(() => window.__gfsStub.answers.slice());
const saves = page => page.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
const contentOf = (page, id) => page.evaluate(i => { const r = window.__gristStub.getRow('Publipostage_Modeles', i); return r ? r.Contenu : null; }, id);
const rowCount = page => page.evaluate(() => window.__gristStub.state.rows.Publipostage_Modeles.id.length);
const shown = page => page.evaluate(() => ({
  current: Templates.getCurrentId(), name: document.getElementById('template-name').value, text: document.querySelector('.ProseMirror').textContent,
  status: document.getElementById('status-msg').textContent, label: (document.querySelector('.tts-trigger-label') || {}).textContent || '',
}));
const rectOf = (page, selector) => page.evaluate((sel) => {
  const e = document.querySelector(sel); if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.right };
}, selector);
// Taper à la fin du premier paragraphe, à la vraie souris et au vrai clavier.
const typeAtEnd = async (page, text) => {
  const para = await rectOf(page, '.ProseMirror p');
  await page.mouse.click(para.r - 3, para.y);
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await sleep(150);
};
const dialogOf = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  return { open: true, title: ov.querySelector('h3').textContent, message: (ov.querySelector('.pp-dialog-message') || {}).textContent || '', buttons, inPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
});
const waitDialog = (page, ms = 8000) => page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: ms }).then(() => true, () => false);
const clickDialog = async (page, label) => {
  const d = await dialogOf(page);
  const b = d.open && d.buttons.find(x => x.label === label);
  if (!b) { check('la fenêtre propose le bouton « ' + label + ' »', false, d); return false; }
  await page.mouse.move(b.x - 10, b.y, { steps: 2 });
  await page.mouse.click(b.x, b.y);
  await sleep(400);
  return true;
};
const labelsOf = d => d.buttons.map(b => b.label).join('|');
const open = (extra = {}) => t.openPage(Object.assign({ seed: seedModels(), stub: { ouverture: null } }, extra));
const off = { pp_autosave_enabled: 'false' };

// ============================================================================================================================================================
console.log('\n== Le fil : gfs-link.js seul, sans le reste de l’app (l’appel `fermer` et son abonné) ==');
{
  const context = await t.browser.newContext({ viewport: { width: 700, height: 400 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript({ path: join(ROOT, 'dev-tests', 'gfs-stub.js') });
  await page.route(url => url.pathname === '/__close-unit.html', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><body><script src="/js/gfs-link.js"></script>' }));
  await page.goto(t.base + '/__close-unit.html?gfs=0', { waitUntil: 'load' });
  await page.evaluate(() => { window.__closed = []; window.__later = window.__gfsStub.fermer('lien'); });
  await sleep(300);
  const early = await page.evaluate(() => ({ answers: window.__gfsStub.answers.length, known: typeof GfsLink.onClose }));
  check('`GfsLink.onClose` existe', early.known === 'function', early);
  check('un `fermer` reçu avant l’abonné n’est pas répondu (ni `GFS_INCONNU`, ni un `oui`) : il attend l’inscription', early.answers === 0, early);
  const given = await page.evaluate(async () => {
    GfsLink.onClose((reason) => { window.__closed.push(reason); return Promise.resolve(true); });
    return window.__later;
  });
  check('à l’inscription il lui est donné, avec sa raison, et GFS reçoit `{ ferme: true }`', given.type === 'reponse' && given.data.ferme === true && (await page.evaluate(() => window.__closed.join(','))) === 'lien', given);
  const results = await page.evaluate(async () => {
    const out = {};
    const next = (value) => { GfsLink.onClose(typeof value === 'function' ? value : () => value); };
    for (const [key, value] of [['faux', false], ['rien', undefined], ['un', 1], ['texte', 'oui'], ['objet', { ferme: true }]]) { next(value); out[key] = await window.__gfsStub.fermer('app'); }
    next(() => { throw new Error('boum'); }); out.leve = await window.__gfsStub.fermer('app');
    next(() => Promise.reject(new Error('boum'))); out.rejete = await window.__gfsStub.fermer('app');
    const seen = [];
    next((reason) => { seen.push(reason); return true; });
    for (const reason of ['app', 'explorateur', 'nouveau', 'importer', 'lire', 'lien', 'autre', '', 7, null]) await window.__gfsStub.fermer(reason);
    out.reasons = seen.slice();
    out.noArgs = await window.__gfsStub.call('fermer', undefined);
    out.inconnu = await window.__gfsStub.call('fermerPlus', { raison: 'app' });
    const before = window.__gfsStub.answers.length;
    window.__gfsStub.post({ type: 'appel', nom: 'fermer', args: { raison: 'app' } });   // sans `id`
    await new Promise(r => setTimeout(r, 300));
    out.withoutId = window.__gfsStub.answers.length - before;
    return out;
  });
  check('un abonné qui rend faux : `{ ferme: false }`', results.faux.type === 'reponse' && results.faux.data.ferme === false, results.faux);
  check('un abonné qui ne rend rien, 1, un texte ou un objet : `{ ferme: false }` (seul `true` est un `oui`)', ['rien', 'un', 'texte', 'objet'].every(k => results[k].type === 'reponse' && results[k].data.ferme === false), results);
  check('un abonné qui lève une erreur, ou dont la promesse est rejetée : une erreur pour GFS (`GFS_ECHEC`), jamais un `oui`', ['leve', 'rejete'].every(k => results[k].type === 'erreur' && results[k].code === 'GFS_ECHEC' && !results[k].data), results);
  check('la raison est l’un des six mots du contrat, sinon vide', results.reasons.join(',') === 'app,explorateur,nouveau,importer,lire,lien,,,,', results.reasons);
  check('un `fermer` sans argument est répondu comme les autres', results.noArgs.type === 'reponse' && results.noArgs.data.ferme === true, results.noArgs);
  check('tout autre nom d’appel reçoit toujours `GFS_INCONNU`', results.inconnu.type === 'erreur' && results.inconnu.code === 'GFS_INCONNU', results.inconnu);
  check('sans `id` entier, aucune réponse', results.withoutId === 0, results.withoutId);
  check('aucune erreur de page dans ce petit essai', errors.length === 0, errors);
  await context.close();
}

// ============================================================================================================================================================
console.log('\n== Rien n’attend : `{ ferme: true }` aussitôt, sans fenêtre ni écriture ==');
{
  const o = await open({ init: FREEZE });
  const page = o.page;
  const savesBefore = await saves(page);
  for (const reason of REASONS.concat(['autre'])) {
    const got = await askTimed(page, 'fermer', reason, 8000);
    check('raison « ' + reason + ' » : `{ ferme: true }` tout de suite', got.reply.type === 'reponse' && got.reply.data.ferme === true && got.took < 1500, got);
  }
  check('aucune fenêtre ne s’est ouverte, rien n’a été écrit', !(await dialogOf(page)).open && (await saves(page)) === savesBefore, { dialog: await dialogOf(page), saves: await saves(page) });
  await o.context.close();
}

// ============================================================================================================================================================
console.log('\n== Enregistrement automatique allumé, des modifications attendent : enregistrées AVANT la réponse, sans question ==');
{
  const o = await open({ init: FREEZE });
  const page = o.page;
  await typeAtEnd(page, ' TAPÉ');
  await sleep(3200);
  check('le passage de l’enregistrement automatique est arrêté pour cet essai : rien n’est encore écrit', (await saves(page)) === 0 && !(await contentOf(page, 1)).includes('TAPÉ'), { saves: await saves(page), content: await contentOf(page, 1) });
  await page.evaluate(() => window.__gristStub.setLatency({ fetchTable: 0, applyUserActions: 1000 }));
  const got = await askTimed(page, 'fermer', 'app', 30000);
  check('`{ ferme: true }`', got.reply.type === 'reponse' && got.reply.data.ferme === true, got);
  check('Grist écrit en 1 s : la réponse a attendu la fin de l’écriture (jamais un `oui` avant d’avoir fini d’écrire)', got.took >= 900, got);
  check('au moment où GFS reçoit le `oui`, le texte tapé est déjà dans le modèle, écrit une seule fois', got.content.includes('TAPÉ') && got.saves === 1, got);
  check('aucune fenêtre n’a été posée', !(await dialogOf(page)).open && (await dialogOf(page)).open === false);
  await page.evaluate(() => window.__gristStub.setLatency(0));
  const again = await askTimed(page, 'fermer', 'app', 8000);
  check('un deuxième `fermer` : `{ ferme: true }` tout de suite, sans écrire de plus', again.reply.data && again.reply.data.ferme === true && again.took < 1500 && again.saves === 1, again);
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

console.log('\n== Enregistrement automatique allumé : l’appel `ouvrir` d’un autre fichier enregistre d’abord, sans question ==');
{
  const o = await open({ init: FREEZE });
  const page = o.page;
  await typeAtEnd(page, ' TAPÉ');
  const polled = [];
  const watcher = (async () => { for (let i = 0; i < 40; i += 1) { polled.push((await dialogOf(page)).open); await sleep(100); } })();
  const got = await askTimed(page, 'ouvrir', WHAT(2), 20000);
  await watcher;
  const now = await shown(page);
  check('un autre modèle : `{ ouvert: true }`, il est ouvert', got.reply.type === 'reponse' && got.reply.data.ouvert === true && now.current === 2 && now.text === 'Contenu B', { got: got.reply, now });
  check('le modèle quitté est enregistré, une seule fois, avec ce qui a été tapé, et il l’était déjà quand GFS a reçu la réponse', got.content.includes('TAPÉ') && got.saves === 1, got);
  check('aucune question n’a été posée, à aucun moment', polled.every(open => open === false), polled);
  await typeAtEnd(page, ' ENCORE');
  const blank = await askTimed(page, 'ouvrir', NEW('document'), 20000);
  const after = await shown(page);
  const second = await page.evaluate(() => window.__gristStub.getRow('Publipostage_Modeles', 2).Contenu);
  check('« Nouveau » : `{ ouvert: true }`, le document vierge est à l’écran, le modèle quitté est enregistré sans question', blank.reply.type === 'reponse' && blank.reply.data.ouvert === true && after.current == null && second.includes('ENCORE') && !(await dialogOf(page)).open, { blank: blank.reply, after, second });
  const same = await askTimed(page, 'ouvrir', WHAT(2), 20000);
  check('un modèle vierge sans modification : l’ouverture suivante n’écrit rien', same.reply.data && same.reply.data.ouvert === true && same.saves === 2, same);
  await o.context.close();
}

// ============================================================================================================================================================
console.log('\n== Enregistrement automatique coupé, des modifications attendent : la question, et GFS attend la personne ==');
for (const [lang, scheme] of [['fr', 'light'], ['en', 'dark']]) {
  const L = LABELS[lang];
  const o = await open({ storage: off, lang, colorScheme: scheme });
  const page = o.page;
  await typeAtEnd(page, ' TAPÉ');
  let pending = askClose(page, 'explorateur', 20000);
  await waitDialog(page);
  let d = await dialogOf(page);
  check('(' + lang + ') la question se pose, dans le panneau : ' + [L.cancel, L.discard, L.save].join(' | '), d.open && d.inPanel && labelsOf(d) === [L.cancel, L.discard, L.save].join('|'), d);
  await sleep(700);
  check('(' + lang + ') GFS n’a pas de réponse tant que la personne n’a pas choisi', (await answers(page)).length === 0, await answers(page));
  await clickDialog(page, L.cancel);
  let reply = await pending;
  let now = await shown(page);
  check('(' + lang + ') « ' + L.cancel + ' » : `{ ferme: false }`, tout reste en place, rien n’est écrit', reply.type === 'reponse' && reply.data.ferme === false && now.text.includes('TAPÉ') && (await saves(page)) === 0, { reply, now });

  pending = askClose(page, 'lien', 20000);
  await waitDialog(page);
  await page.keyboard.press('Escape');
  reply = await pending;
  check('(' + lang + ') Échap : `{ ferme: false }`', reply.type === 'reponse' && reply.data.ferme === false && !(await dialogOf(page)).open, reply);

  pending = askClose(page, 'app', 20000);
  await waitDialog(page);
  await clickDialog(page, L.discard);
  reply = await pending;
  check('(' + lang + ') « ' + L.discard + ' » : `{ ferme: true }`, rien n’est écrit', reply.type === 'reponse' && reply.data.ferme === true && (await saves(page)) === 0, { reply, saves: await saves(page) });

  pending = askClose(page, 'nouveau', 20000);
  await waitDialog(page);
  await clickDialog(page, L.save);
  reply = await pending;
  now = await page.evaluate(() => window.__gristStub.getRow('Publipostage_Modeles', 1).Contenu);
  check('(' + lang + ') « ' + L.save + ' » : l’écriture, puis `{ ferme: true }`', reply.type === 'reponse' && reply.data.ferme === true && (await saves(page)) === 1 && now.includes('TAPÉ'), { reply, saves: await saves(page), now });
  check('(' + lang + ') aucune boîte native n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

// ============================================================================================================================================================
console.log('\n== Enregistrement automatique allumé, mais l’app ne peut pas décider seule : la question reste ==');
{
  // L'écriture est refusée.
  const o = await open({ init: FREEZE });
  const page = o.page;
  await typeAtEnd(page, ' REFUS');
  await page.evaluate(() => window.__gristStub.denyTable('Publipostage_Modeles'));
  let pending = askClose(page, 'app', 20000);
  await waitDialog(page);
  let d = await dialogOf(page);
  check('écriture refusée : la question se pose (Annuler | Ne pas enregistrer | Enregistrer), GFS attend', d.open && labelsOf(d) === 'Annuler|Ne pas enregistrer|Enregistrer', d);
  await sleep(500);
  check('... et GFS n’a pas de réponse', (await answers(page)).length === 0, await answers(page));
  await clickDialog(page, 'Annuler');
  let reply = await pending;
  check('« Annuler » : `{ ferme: false }`, le texte est toujours là', reply.type === 'reponse' && reply.data.ferme === false && (await shown(page)).text.includes('REFUS'), reply);
  await page.evaluate(() => window.__gristStub.denyTable('Publipostage_Modeles', false));
  const retry = await askTimed(page, 'fermer', 'app', 20000);
  check('l’écriture redevient possible : enregistré, puis `{ ferme: true }` sans question', retry.reply.data && retry.reply.data.ferme === true && retry.content.includes('REFUS') && !(await dialogOf(page)).open, retry);
  await o.context.close();
}
{
  // Un modèle neuf, sans nom : rien à enregistrer.
  const o = await open({ init: FREEZE });
  const page = o.page;
  const blank = await askOpen(page, NEW('document'));
  check('(préparation) le document vierge est ouvert', blank.type === 'reponse' && blank.data.ouvert === true && (await shown(page)).current == null, blank);
  await typeAtEnd(page, 'Texte sans nom');
  const rows = await rowCount(page);
  let pending = askClose(page, 'app', 20000);
  await waitDialog(page);
  let d = await dialogOf(page);
  check('sans nom : la question n’a pas d’« Enregistrer » (Annuler | Ne pas enregistrer), elle dit pourquoi', d.open && labelsOf(d) === 'Annuler|Ne pas enregistrer' && /pas de nom/.test(d.message), d);
  check('rien n’a été créé, et l’app n’a pas tenté d’enregistrer sans nom (aucun « Nom du modèle requis. » dans le coin d’état)', (await rowCount(page)) === rows && (await saves(page)) === 0 && (await shown(page)).status !== 'Nom du modèle requis.', { rows: await rowCount(page), saves: await saves(page), status: (await shown(page)).status });
  await clickDialog(page, 'Annuler');
  let reply = await pending;
  check('« Annuler » : `{ ferme: false }`', reply.type === 'reponse' && reply.data.ferme === false, reply);
  // Le nom donné, à la vraie souris : le modèle est créé avant le `oui`.
  const pencil = await rectOf(page, '#btn-rename-template');
  await page.mouse.click(pencil.x, pencil.y);
  await sleep(250);
  await page.keyboard.type('Nommé pour partir');
  await page.keyboard.press('Enter');
  await sleep(300);
  await page.evaluate(() => window.__gristStub.setLatency(0));
  const created = await askTimed(page, 'fermer', 'app', 20000);
  const added = await page.evaluate(() => { const m = window.__gristStub.state.rows.Publipostage_Modeles; const i = m.Nom.indexOf('Nommé pour partir'); return i < 0 ? null : { id: m.id[i], text: m.Contenu[i] }; });
  check('avec un nom : le modèle est créé, puis `{ ferme: true }` sans question', created.reply.data && created.reply.data.ferme === true && added !== null && /Texte sans nom/.test(added.text) && (await rowCount(page)) === rows + 1 && !(await dialogOf(page)).open, { created: created.reply, added, rows: await rowCount(page) });
  await o.context.close();
}
{
  // Le modèle a été modifié ailleurs : l'écraser serait trancher à la place de la personne.
  const o = await open();
  const page = o.page;
  await page.evaluate(() => window.__gristStub.remoteWrite('Publipostage_Modeles', 1, { Contenu: '<p>Version d’ailleurs</p>', DateModif: 1790001000 }));
  await typeAtEnd(page, ' LOCAL');
  const banner = await page.waitForFunction(() => { const b = document.getElementById('autosave-conflict-banner'); return !!b && getComputedStyle(b).display !== 'none'; }, null, { timeout: 15000 }).then(() => true, () => false);
  check('(préparation) le bandeau « modifié ailleurs » est là', banner);
  const savesBefore = await saves(page);
  let pending = askClose(page, 'app', 20000);
  await waitDialog(page);
  let d = await dialogOf(page);
  check('modèle modifié ailleurs : la question se pose, rien n’est écrit à la place de la personne', d.open && labelsOf(d) === 'Annuler|Ne pas enregistrer|Enregistrer' && (await saves(page)) === savesBefore && (await contentOf(page, 1)) === '<p>Version d’ailleurs</p>', { d, saves: await saves(page), content: await contentOf(page, 1) });
  await clickDialog(page, 'Annuler');
  let reply = await pending;
  check('« Annuler » : `{ ferme: false }`, la version de l’autre est intacte', reply.type === 'reponse' && reply.data.ferme === false && (await contentOf(page, 1)) === '<p>Version d’ailleurs</p>', reply);
  await o.context.close();
}

// ============================================================================================================================================================
console.log('\n== Un passage de l’enregistrement automatique déjà parti ; un échec ; un `fermer` envoyé au chargement ==');
{
  // Le passage est en train de lire la table (Grist lent) quand `fermer` arrive : il finit, la réponse vient après, une seule écriture.
  const o = await open();
  const page = o.page;
  await typeAtEnd(page, ' PASSAGE');
  await page.evaluate(() => { window.__gristStub.setLatency({ fetchTable: 1200, applyUserActions: 400 }); });
  const reading = await page.waitForFunction(() => window.__gristStub.state.inFlight.fetchTable > 0 || window.__gristStub.state.inFlight.applyUserActions > 0, null, { timeout: 15000 }).then(() => true, () => false);
  check('(préparation) un passage de l’enregistrement automatique est en route', reading);
  const got = await askTimed(page, 'fermer', 'app', 30000);
  await sleep(1500);
  check('`{ ferme: true }` sans question, après la fin de l’écriture : le texte est déjà dans le modèle quand GFS reçoit le `oui`', got.reply.data && got.reply.data.ferme === true && got.content.includes('PASSAGE') && !(await dialogOf(page)).open, got);
  check('une seule écriture du modèle en tout (le passage en route et `fermer` ne l’écrivent pas deux fois), même un peu plus tard', got.saves === 1 && (await saves(page)) === 1, { atReply: got.saves, later: await saves(page) });
  await o.context.close();
}
{
  const o = await open({ storage: off });
  const page = o.page;
  await typeAtEnd(page, ' PANNE');
  await page.evaluate(() => { Dialogs.choose = () => Promise.reject(new Error('fenêtre indisponible')); });
  const reply = await askClose(page, 'app', 10000);
  check('si la question échoue : une erreur pour GFS (`GFS_ECHEC`), jamais un `{ ferme: true }`', reply.type === 'erreur' && reply.code === 'GFS_ECHEC' && !reply.data, reply);
  check('... et le texte tapé est toujours là', (await shown(page)).text.includes('PANNE'));
  await o.context.close();
}
{
  // Un `fermer` posté dès le chargement de la page, avant que l'app ait tout installé, est répondu.
  const o = await open({
    ready: false,
    init: `document.addEventListener('DOMContentLoaded', () => { window.__early = window.__gfsStub.fermer('app'); }, { once: true });`,
  });
  const reply = await o.page.waitForFunction(() => !!window.__early, null, { timeout: 30000 }).then(() => o.page.evaluate(() => Promise.race([window.__early, new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), 30000))])));
  check('un `fermer` envoyé au chargement est répondu : `{ ferme: true }` (rien n’y attendait)', reply.type === 'reponse' && reply.data.ferme === true, reply);
  await o.context.close();
}

await t.finish();
