#!/usr/bin/env node
// Ouvrir le modèle de départ que GFS désigne (consigne GFS 075, « Nouveau > Depuis un modèle » : js/gfs-link.js `normalizeOpening` (`modele`), js/gfs-open.js `modelFrom`, js/template-gallery-modal.js `openFromGfs`,
// js/main.js `GfsOpen.init`, catalogue `modeles/modeles.json`), 700x400. Un GFS simulé (dev-tests/gfs-stub.js, adresse `?gfs=0`) joue le rôle de GFS : il rend l'`ouverture` du contexte
// `{ fichier: null, type, dossier, raison: 'modele', modele: { id } }` ou envoie l'appel `ouvrir` à l'app déjà ouverte ; ce script lit ce que la personne voit (le champ du nom, le texte, le coin d'état, la fenêtre
// d'accord) et ce que le faux Grist a reçu (les tables créées, les écritures dans la table des modèles).
//  AU DÉMARRAGE : l'ordre habituel ouvre son modèle, « Widget prêt. » se dit, puis la demande d'accord de la galerie (« Créer les tables du modèle ? ») se pose, dans le panneau, avec chaque table du modèle ; RIEN n'est
//   créé ni écrit tant que la personne n'a pas répondu ; « Créer » : le modèle est à l'écran NON ENREGISTRÉ (pas d'identifiant, la liste sur « Nouveau modèle », le nom de la galerie déjà dans le champ du nom, le
//   texte du modèle, le coin d'état « Modèle non enregistré »), ses tables sont créées, et rien n'est écrit dans la table des modèles - même quand la personne tape ensuite : l'enregistrement automatique ne crée
//   jamais de modèle ; « Annuler » : le modèle habituel reste, aucune table. En anglais et en thème sombre de même. Un `modele` illisible (un `id` qui n'est pas un texte, absent), un `id` inconnu, un type que la garde « type
//   inconnu » refuse, un document en lecture seule : l'ordre habituel reste, JAMAIS un modèle vierge à la place.
//  APPEL `ouvrir` : `{ ouvert: true }` avec le modèle à l'écran, non enregistré ; `{ ouvert: false }` pour un refus à la demande d'accord, un `id` inconnu (le coin d'état le dit), un `id` illisible, un type refusé, une
//   présentation sans l'extension « diapositives » (GFS reçoit la demande d'installation, rien n'est créé), un document en lecture seule ; avec des modifications que l'app ne peut pas enregistrer seule la question
//   « Enregistrer / Ne pas enregistrer / Annuler » se pose AVANT la demande d'accord (« Annuler » : rien n'est créé) ; avec l'enregistrement automatique allumé le modèle quitté est enregistré sans question ; des tables
//   déjà là et qui conviennent : pas de demande d'accord ; des tables qui ne conviennent pas : la fenêtre des conflits, `{ ouvert: false }`, rien n'est créé ; le premier « Enregistrer » crée le modèle (et un nom pris devient
//   « nom (2) »).
//  LE CATALOGUE : chacun des 22 modèles de `modeles/modeles.json` s'ouvre par son `id` (le bon nom dans les deux langues, le bon type : bandeau d'email, mode grille), et chaque vignette est, pixel pour pixel, le
//   `thumb.png` de la galerie.
// Lancé par run-headless.mjs (groupe Node "gfsModel", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-model.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-model', port: Number(process.env.GFS_MODEL_PORT || 8983) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CATALOGUE = JSON.parse(readFileSync(join(ROOT, 'modeles', 'modeles.json'), 'utf8'));
const entryOf = id => CATALOGUE.find(entry => entry.id === id);
const packOf = id => JSON.parse(readFileSync(join(ROOT, 'templates-gallery', id, 'pack.json'), 'utf8'));
// Les tables que le modèle crée : celles de son `pack.json` (un identifiant, dont les colonnes sont dans la famille de la galerie, ou une table décrite en entier).
const tablesOf = id => packOf(id).tables.map(table => (typeof table === 'string' ? table : table.id)).sort();
// La première ligne de texte du modèle de la galerie (une ligne qui a de quoi se reconnaître) : ce que l'éditeur doit montrer une fois le modèle ouvert.
const phraseOf = (id) => {
  const text = readFileSync(join(ROOT, 'templates-gallery', id, 'template.html'), 'utf8').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n');
  const lines = text.split('\n').map(line => line.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()).filter(line => line.length >= 6 && !/[&<>{}]/.test(line));
  return lines[0];
};

// L'`ouverture` d'un modèle de départ (consigne 075) : le `type` que GFS lit dans son catalogue (celui de l'entrée), `dossier` vide, la raison `modele` et l'identifiant ; `extra` change la forme normale.
const MODEL = (id, extra) => Object.assign({ fichier: null, type: entryOf(id) ? entryOf(id).type : 'document', dossier: '', raison: 'modele', modele: { id } }, extra || {});
const NEW = type => ({ fichier: null, type, dossier: '', raison: 'nouveau' });
const FILE = id => ({ fichier: { id: String(id), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' });

const READY = { fr: 'Widget prêt.', en: 'Widget ready.' };
const WARNING = { fr: /^Modèle non enregistré/, en: /^Template not saved/ };
const UNKNOWN = {
  fr: 'Ce modèle n’existe pas dans cette version de Publipostage+ : rien n’a été ouvert.',
  en: 'This template does not exist in this version of Publipostage+: nothing was opened.',
};
const DIALOG = { fr: { title: 'Créer les tables du modèle ?', buttons: 'Annuler|Créer', unsaved: 'Annuler|Ne pas enregistrer|Enregistrer' }, en: { title: 'Create the template’s tables?', buttons: 'Cancel|Create', unsaved: 'Cancel|Don’t save|Save' } };

// Les modèles que l'app ouvre, dans l'ordre (`Templates.setCurrentId` est le point de passage de toute ouverture ; `null` : un modèle sans identifiant) et la fin du démarrage (`FirstContact.ready`).
const TRACK = `window.__opened = []; window.__started = false;
  document.addEventListener('DOMContentLoaded', () => {
    const ready = FirstContact.ready.bind(FirstContact);
    FirstContact.ready = (...args) => { window.__started = true; return ready(...args); };
    const original = Templates.setCurrentId;
    Templates.setCurrentId = (id) => { window.__opened.push(String(id)); return original(id); };
  });`;
const started = page => page.waitForFunction(() => window.__started === true, null, { timeout: 90000 });
const startWith = async (stub, { lang = 'fr', colorScheme = 'light', search = '', storage = null, seed = seedModels() } = {}) => {
  const o = await t.openPage({ hosted: true, stub, seed, lang, colorScheme, init: TRACK, search, storage });
  await started(o.page);
  return o;
};

// Ce que la personne voit : le modèle ouvert (liste, nom, texte) et le coin d'état.
const shown = page => page.evaluate(() => ({
  current: Templates.getCurrentId(), list: document.getElementById('template-select').value, name: document.getElementById('template-name').value,
  text: document.querySelector('.ProseMirror').textContent.replace(/\s+/g, ' ').trim(), status: document.getElementById('status-msg').textContent, statusClass: document.getElementById('status-msg').className,
}));
const surfaces = page => page.evaluate(() => {
  const visible = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.style.display !== 'none' && e.getBoundingClientRect().height > 0; };
  return { emailBanner: visible('v2-email-fields-row'), grid: GridEditor.isActive(), table: !!document.querySelector('.ProseMirror table'), editor: visible('editor-container') };
});
// Ce que le faux Grist a reçu : les tables créées (par AddTable) et les écritures dans la table des modèles (aucune ne doit partir d'une ouverture).
const received = page => page.evaluate(() => ({
  // Les tables de l'app elle-même (`Publipostage_…`, créées au démarrage) ne sont pas celles d'un modèle.
  tables: window.__gristStub.getActionLog().filter(a => a[0] === 'AddTable' && !/^Publipostage_/.test(a[1])).map(a => a[1]).sort(),
  models: window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles') + window.__gristStub.countActions('AddRecord', 'Publipostage_Modeles'),
  names: window.__gristStub.state.rows.Publipostage_Modeles.Nom.slice(),
}));
const opened = page => page.evaluate(() => window.__opened.slice());
// L'appel de GFS et sa réponse ; `sans-reponse` si l'app n'a rien répondu dans le délai.
const ask = (page, args, ms = 40000) => page.evaluate(({ args, ms }) => Promise.race([window.__gfsStub.call('ouvrir', args), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]), { args, ms });
const answers = page => page.evaluate(() => window.__gfsStub.answers.slice());
const installs = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer').map(c => c.args));

// La fenêtre de l'app (accord, question d'enregistrement, conflits) et ses boutons, à la vraie souris.
const dialogOf = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const message = document.getElementById('pp-dialog-message');
  return { open: true, title: ov.querySelector('h3').textContent, message: message ? message.textContent : '', buttons, inPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
});
const waitDialog = (page, ms = 20000) => page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: ms }).then(() => true, () => false);
const pressDialog = async (page, label) => {
  const d = await dialogOf(page);
  const b = d.open && d.buttons.find(x => x.label === label);
  if (!b) { check('la fenêtre propose le bouton « ' + label + ' »', false, d); return false; }
  await page.mouse.move(b.x - 10, b.y, { steps: 2 });
  await page.mouse.click(b.x, b.y);
  await sleep(500);
  return true;
};
const noDialog = async page => !(await dialogOf(page)).open;
const waitModel = (page, name) => page.waitForFunction(n => Templates.getCurrentId() == null && document.getElementById('template-name').value === n, name, { timeout: 40000 }).then(() => true, () => false);
const clickOn = async (page, selector) => {
  const box = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  await page.mouse.move(box.x - 8, box.y, { steps: 2 });
  await page.mouse.click(box.x, box.y);
};
// Tape à la fin du texte, à la vraie frappe, et rend vrai quand l'app a vu la modification (le coin d'état passe en « modifications non enregistrées », ou garde l'avertissement d'un modèle non enregistré) : une
// frappe tombée pendant que le modèle d'ouverture finit de se poser serait perdue, on la refait.
const typeInEditor = async (page, text) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
    await page.keyboard.type(text);
    const seen = await page.waitForFunction(() => { const c = document.getElementById('status-msg').classList; return c.contains('is-unsaved') || c.contains('error-msg'); }, null, { timeout: 2500 }).then(() => true, () => false);
    await sleep(300);
    if (seen && (await page.evaluate(() => document.querySelector('.ProseMirror').textContent)).includes(text.trim())) return true;
  }
  return false;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Un modèle de la galerie vient d'être ouvert non enregistré : tout ce qu'on lit à l'écran. Rend vrai quand tout y est.
async function expectOnScreen(page, id, lang, label, { tablesNow } = {}) {
  const entry = entryOf(id);
  const got = await shown(page);
  const name = entry.nom[lang];
  check(`${label} : le nom de la galerie est déjà dans le champ du nom (« ${name} »), sans modèle courant et la liste sur « Nouveau modèle »`, got.current == null && got.list === '' && got.name === name, got);
  check(`${label} : le texte du modèle est à l’écran (« ${phraseOf(id)} »)`, got.text.includes(phraseOf(id)), got.text.slice(0, 120));
  check(`${label} : le coin d’état garde l’avertissement « modèle non enregistré », en erreur`, WARNING[lang].test(got.status) && got.statusClass === 'error-msg', got);
  const seen = await surfaces(page);
  const type = entry.type;
  check(`${label} : la forme du type « ${type} » (email : son bandeau ; grille : le mode grille et son tableau ; sinon un document)`, type === 'email' ? seen.emailBanner : type === 'grille' ? seen.grid && seen.table : !seen.emailBanner && !seen.grid, seen);
  if (tablesNow) check(`${label} : ses tables sont créées (${tablesNow.join(', ')}), et rien d’autre`, same((await received(page)).tables, tablesNow), (await received(page)).tables);
}

console.log('\n== Au démarrage : GFS désigne « Facture, devis ou avoir » ==');
{
  const o = await startWith({ ouverture: MODEL('facture') });
  const page = o.page;
  check('la demande d’accord de la galerie se pose après « Widget prêt. »', await waitDialog(page));
  const d = await dialogOf(page);
  check('« Créer les tables du modèle ? » : dans le panneau, avec « Annuler » et « Créer »', d.open && d.inPanel && d.title === DIALOG.fr.title && d.buttons.map(b => b.label).join('|') === DIALOG.fr.buttons, d);
  const text = d.message || '';
  check('elle nomme le modèle et chacune de ses tables', text.includes('« Facture, devis ou avoir »') && tablesOf('facture').every(id => text.includes('• ' + id + ' (')), text);
  let seen = await shown(page);
  let got = await received(page);
  check('l’ordre habituel a ouvert le ★ d’abord, et « Widget prêt. » s’est dit', seen.name === 'Départ A défaut' && String(seen.current) === '1' && seen.status === READY.fr, seen);
  check('rien n’est créé ni écrit tant que la personne n’a pas répondu : ni table, ni modèle', got.tables.length === 0 && got.models === 0, got);
  const context = await page.evaluate(() => GfsLink.opening());
  check('l’app a gardé la demande : raison `modele`, sans fichier, avec `modele: { id }`', context && context.raison === 'modele' && context.fichier === null && JSON.stringify(context.modele) === JSON.stringify({ id: 'facture' }) && context.type === 'document', context);

  await pressDialog(page, 'Créer');
  check('« Créer » : le modèle s’ouvre', await waitModel(page, entryOf('facture').nom.fr));
  await expectOnScreen(page, 'facture', 'fr', '« Créer »', { tablesNow: tablesOf('facture') });
  got = await received(page);
  check('rien n’est écrit dans la table des modèles : le modèle ne naît qu’au premier « Enregistrer »', got.models === 0 && got.names.length === 6, got);
  check('l’app est passée par le ★ puis par un modèle sans identifiant, rien d’autre (jamais un autre modèle entre les deux)', same(await opened(page), ['1', 'null']), await opened(page));
  // L'appel `securite` (le `relais` du kit, consigne 084) n'est pas une demande à GFS : il n'entre pas dans ce compte ; dev-tests/verify-gfs-violations.mjs le juge.
  check('GFS a reçu l’appel `contexte` et rien d’autre au démarrage', same(await page.evaluate(() => window.__gfsStub.calls.map(c => c.nom).filter(nom => nom !== 'securite')), ['contexte']), await page.evaluate(() => window.__gfsStub.calls.map(c => c.nom)));
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);

  // Tapé : le modèle n'existe toujours pas - l'enregistrement automatique ne crée jamais de modèle (deux passages de 2,5 s).
  await typeInEditor(page, ' Nouvelle ligne');
  await sleep(6500);
  got = await received(page);
  seen = await shown(page);
  check('après la frappe et deux passages de l’enregistrement automatique : toujours aucune ligne dans la table des modèles', got.models === 0 && got.names.length === 6 && seen.current == null, { got, seen });

  // Le premier « Enregistrer » le crée, sous le nom de la galerie.
  await clickOn(page, '#btn-save');
  await page.waitForFunction(() => Templates.getCurrentId() != null, null, { timeout: 20000 }).catch(() => {});
  got = await received(page);
  seen = await shown(page);
  check('« Enregistrer » : le modèle naît (une ligne de plus) sous le nom de la galerie, et devient le modèle courant', got.names.length === 7 && got.names[6] === 'Facture, devis ou avoir' && seen.current != null && seen.name === 'Facture, devis ou avoir', { got, seen });
  await o.context.close();
}

console.log('\n== Au démarrage : « Annuler » à la demande d’accord ==');
{
  const o = await startWith({ ouverture: MODEL('facture') });
  const page = o.page;
  check('la demande d’accord se pose', await waitDialog(page));
  await pressDialog(page, 'Annuler');
  await sleep(1200);
  const seen = await shown(page);
  const got = await received(page);
  check('« Annuler » : le modèle habituel reste à l’écran (le ★), avec « Widget prêt. », sans erreur', seen.name === 'Départ A défaut' && String(seen.current) === '1' && seen.status === READY.fr && seen.statusClass === '', seen);
  check('rien n’est créé ni écrit : ni table, ni modèle', got.tables.length === 0 && got.models === 0, got);
  check('jamais un modèle vierge à la place : seul le ★ est passé par `setCurrentId`', same(await opened(page), ['1']), await opened(page));
  check('plus aucune fenêtre ouverte', await noDialog(page));
  await o.context.close();
}

console.log('\n== Au démarrage : en anglais, thème sombre ==');
{
  const o = await startWith({ ouverture: MODEL('reappro-email') }, { lang: 'en', colorScheme: 'dark' });
  const page = o.page;
  check('la demande d’accord se pose', await waitDialog(page));
  const d = await dialogOf(page);
  check('la fenêtre est en anglais : « Create the template’s tables? », « Cancel » et « Create »', d.open && d.inPanel && d.title === DIALOG.en.title && d.buttons.map(b => b.label).join('|') === DIALOG.en.buttons, d);
  check('elle nomme le modèle par son nom anglais', (d.message || '').includes('“' + entryOf('reappro-email').nom.en + '”'), d.message);
  await pressDialog(page, 'Create');
  check('« Create » : le modèle s’ouvre', await waitModel(page, entryOf('reappro-email').nom.en));
  await expectOnScreen(page, 'reappro-email', 'en', 'en anglais', { tablesNow: tablesOf('reappro-email') });
  check('le coin d’état est rouge sur le fond sombre, lisible (contraste d’au moins 4,5 : 1)', (await page.evaluate(() => {
    const el = document.getElementById('status-msg');
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    let bg = null;
    for (let n = el; n && !bg; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a >= 1) bg = c; }
    bg = bg || { r: 0, g: 0, b: 0 };
    const fg = parse(getComputedStyle(el).color);
    const a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  })) >= 4.5);
  await o.context.close();
}

console.log('\n== Au démarrage : ce qui n’ouvre rien (l’ordre habituel reste, jamais un modèle vierge) ==');
{
  const cases = [
    ['un `id` que la galerie ne connaît pas', MODEL('inexistant', { type: 'document' }), { status: UNKNOWN.fr, error: true }],
    ['un `id` en majuscules (les identifiants sont minuscules)', MODEL('FACTURE', { type: 'document' }), { status: UNKNOWN.fr, error: true }],
    ['un `modele` dont l’`id` n’est pas un texte', MODEL('facture', { modele: { id: 5 } }), { status: READY.fr, error: false }],
    ['un `modele` sans `id`', MODEL('facture', { modele: {} }), { status: READY.fr, error: false }],
    ['un `id` vide', MODEL('facture', { modele: { id: '   ' } }), { status: READY.fr, error: false }],
    ['une raison `modele` sans `modele`', { fichier: null, type: 'document', dossier: '', raison: 'modele' }, { status: READY.fr, error: false }],
    ['un `type` que la garde « type inconnu » refuse', MODEL('facture', { type: 'reglages' }), { status: READY.fr, error: false }],
  ];
  for (const [label, ouverture, expected] of cases) {
    const o = await startWith({ ouverture });
    await sleep(1200);
    const seen = await shown(o.page);
    const got = await received(o.page);
    check(`${label} : le ★ reste à l’écran, le coin d’état dit « ${expected.status} »${expected.error ? ' en erreur' : ', sans erreur'}`, seen.name === 'Départ A défaut' && String(seen.current) === '1' && seen.status === expected.status && (seen.statusClass === 'error-msg') === expected.error, seen);
    check(`${label} : aucune fenêtre, aucune table, aucune écriture, et seul le ★ est passé par \`setCurrentId\``, (await noDialog(o.page)) && got.tables.length === 0 && got.models === 0 && same(await opened(o.page), ['1']), { got, opened: await opened(o.page) });
    await o.context.close();
  }
  // Une autre raison avec un `modele` : il n'est pas gardé, la demande est celle de sa raison.
  const o = await startWith({ ouverture: Object.assign(NEW('document'), { modele: { id: 'facture' } }) });
  const context = await o.page.evaluate(() => GfsLink.opening());
  const seen = await shown(o.page);
  check('un « Nouveau » qui porte un `modele` : le `modele` n’est pas gardé, un document vierge s’ouvre (pas la facture)', context && !('modele' in context) && seen.current == null && seen.name === '' && seen.text === '' && (await noDialog(o.page)), { context, seen });
  await o.context.close();
  const p = await startWith({ ouverture: Object.assign(FILE(2), { modele: { id: 'facture' } }) });
  const ctx2 = await p.page.evaluate(() => GfsLink.opening());
  const seen2 = await shown(p.page);
  check('le modèle d’un fichier (« Départ B ») qui porte un `modele` : le `modele` n’est pas gardé, c’est le fichier qui s’ouvre', ctx2 && !('modele' in ctx2) && seen2.name === 'Départ B' && (await noDialog(p.page)), { ctx2, seen2 });
  await p.context.close();

  const r = await startWith({ ouverture: MODEL('facture') }, { search: '&readonly=true' });
  await sleep(1200);
  const seenR = await shown(r.page);
  const gotR = await received(r.page);
  check('un document en lecture seule : rien ne s’ouvre, aucune fenêtre, aucune table (« Départ A défaut » reste)', seenR.name === 'Départ A défaut' && (await noDialog(r.page)) && gotR.tables.length === 0 && gotR.models === 0, { seenR, gotR });
  await r.context.close();
}

console.log('\n== L’appel `ouvrir` : l’app est déjà ouverte ==');
{
  const o = await startWith({ ouverture: null }, { storage: { pp_autosave_enabled: 'false' } });
  const page = o.page;
  let before = await shown(page);
  check('l’app s’ouvre sur le ★ (GFS n’a rien désigné), l’enregistrement automatique est coupé', before.name === 'Départ A défaut' && before.status === READY.fr, before);

  // « Annuler » à la demande d'accord : rien ne change.
  let pending = ask(page, MODEL('facture'));
  check('la demande d’accord se pose', await waitDialog(page));
  check('GFS n’a pas de réponse tant que la personne n’a pas choisi (pas de délai)', (await answers(page)).length === 0, await answers(page));
  await sleep(600);
  await pressDialog(page, 'Annuler');
  let reply = await pending;
  let seen = await shown(page);
  let got = await received(page);
  check('« Annuler » : `{ ouvert: false }`, le ★ reste, aucune table, aucune écriture', reply.type === 'reponse' && reply.gfs === 0 && Number.isInteger(reply.id) && reply.data.ouvert === false && seen.name === 'Départ A défaut' && JSON.stringify(seen) === JSON.stringify(before) && got.tables.length === 0 && got.models === 0, { reply, seen, got });

  // Échap ferme la fenêtre comme « Annuler ».
  pending = ask(page, MODEL('facture'));
  await waitDialog(page);
  await page.keyboard.press('Escape');
  reply = await pending;
  seen = await shown(page);
  got = await received(page);
  check('Échap à la demande d’accord : `{ ouvert: false }`, le ★ reste, aucune table, aucune écriture', reply.data && reply.data.ouvert === false && JSON.stringify(seen) === JSON.stringify(before) && got.tables.length === 0 && got.models === 0 && (await noDialog(page)), { reply, seen, got });

  // Un modèle illisible (le fichier ne vient pas) : rien ne s'ouvre, le coin d'état le dit, et la demande d'accord ne se pose pas (les tables n'ont pas à être créées pour un modèle qu'on ne peut pas montrer).
  await page.route('**/templates-gallery/facture/template.html*', route => route.abort());
  reply = await ask(page, MODEL('facture'), 15000);
  seen = await shown(page);
  got = await received(page);
  check('le texte du modèle ne vient pas : `{ ouvert: false }`, le coin d’état dit « Impossible de charger ce modèle. », ni fenêtre ni table', reply.data && reply.data.ouvert === false && seen.status === 'Impossible de charger ce modèle.' && seen.statusClass === 'error-msg' && seen.name === before.name && (await noDialog(page)) && got.tables.length === 0, { reply, seen, got });
  await page.unroute('**/templates-gallery/facture/template.html*');
  await page.route('**/templates-gallery/facture/pack.json*', route => route.abort());
  reply = await ask(page, MODEL('facture'), 15000);
  seen = await shown(page);
  got = await received(page);
  check('le pack du modèle ne vient pas : `{ ouvert: false }`, le coin d’état dit « Impossible de lire ce modèle et ses tables. », ni fenêtre ni table', reply.data && reply.data.ouvert === false && seen.status === 'Impossible de lire ce modèle et ses tables.' && seen.statusClass === 'error-msg' && (await noDialog(page)) && got.tables.length === 0, { reply, seen, got });
  await page.unroute('**/templates-gallery/facture/pack.json*');

  // « Créer » : le modèle s'ouvre.
  pending = ask(page, MODEL('facture'));
  await waitDialog(page);
  await pressDialog(page, 'Créer');
  reply = await pending;
  check('« Créer » : `{ ouvert: true }` avec l’`id` de l’appel', reply.type === 'reponse' && reply.data && reply.data.ouvert === true, reply);
  await expectOnScreen(page, 'facture', 'fr', 'l’appel `ouvrir`', { tablesNow: tablesOf('facture') });
  got = await received(page);
  check('rien n’est écrit dans la table des modèles', got.models === 0, got);

  // Les tables sont là : la même demande, de nouveau, n'en demande plus l'accord (rien à créer), et le nom pris devient « nom (2) » au premier « Enregistrer ».
  reply = await ask(page, MODEL('facture'));
  seen = await shown(page);
  got = await received(page);
  check('les mêmes tables sont déjà dans le document et conviennent : `{ ouvert: true }` sans demande d’accord, aucune table de plus', reply.data && reply.data.ouvert === true && seen.name === 'Facture, devis ou avoir' && seen.current == null && same(got.tables, tablesOf('facture')), { reply, seen, got });
  await clickOn(page, '#btn-save');
  await page.waitForFunction(() => Templates.getCurrentId() != null, null, { timeout: 20000 }).catch(() => {});
  got = await received(page);
  seen = await shown(page);
  check('« Enregistrer » : le modèle naît sous le nom de la galerie', got.names[got.names.length - 1] === 'Facture, devis ou avoir' && seen.current != null, { got, seen });
  reply = await ask(page, MODEL('facture'));
  seen = await shown(page);
  check('rouvert une seconde fois : le nom pris est déjà dans le champ tel quel, sans modèle courant (non enregistré)', reply.data && reply.data.ouvert === true && seen.current == null && seen.name === 'Facture, devis ou avoir', { reply, seen });
  await clickOn(page, '#btn-save');
  await page.waitForFunction(() => Templates.getCurrentId() != null, null, { timeout: 20000 }).catch(() => {});
  got = await received(page);
  check('au « Enregistrer » le nom pris devient « Facture, devis ou avoir (2) » : jamais deux modèles du même nom', got.names[got.names.length - 1] === 'Facture, devis ou avoir (2)' && got.names.filter(name => name === 'Facture, devis ou avoir').length === 1, got.names);

  // Le `id` s'écrit avec des blancs autour : il est rogné.
  reply = await ask(page, MODEL('  facture  '));
  seen = await shown(page);
  check('un `id` entouré de blancs est rogné : le modèle s’ouvre', reply.data && reply.data.ouvert === true && seen.name === 'Facture, devis ou avoir' && seen.current == null, { reply, seen });

  // Les refus : `{ ouvert: false }`, rien ne change que le coin d'état d'un `id` inconnu.
  for (const [label, args, status, error] of [
    ['un `id` que la galerie ne connaît pas', MODEL('inexistant', { type: 'document' }), UNKNOWN.fr, true],
    ['un `id` en majuscules', MODEL('FACTURE'), UNKNOWN.fr, true],
    ['un `id` qui n’est pas un texte', MODEL('facture', { modele: { id: 5 } }), null, false],
    ['un `modele` sans `id`', MODEL('facture', { modele: {} }), null, false],
    ['une raison `modele` sans `modele`', { fichier: null, type: 'document', dossier: '', raison: 'modele' }, null, false],
    ['un `type` que la garde « type inconnu » refuse', MODEL('facture', { type: 'reglages' }), null, false],
    ['un `type` que l’app ne connaît pas', MODEL('facture', { type: 'inconnu' }), null, false],
  ]) {
    before = await shown(page);
    const w0 = await received(page);
    reply = await ask(page, args, 8000);
    seen = await shown(page);
    got = await received(page);
    check(`${label} : \`{ ouvert: false }\`, jamais un modèle vierge, ni fenêtre, ni table, ni écriture${status ? ' ; le coin d’état dit pourquoi' : ' ; le coin d’état ne change pas'}`,
      reply.type === 'reponse' && reply.data && reply.data.ouvert === false && (await noDialog(page)) && got.tables.length === w0.tables.length && got.models === w0.models
      && seen.name === before.name && seen.text === before.text && seen.current === before.current && (status ? seen.status === status && seen.statusClass === 'error-msg' : seen.status === before.status), { reply, before, seen });
  }

  // Un document en lecture seule ne s'ouvre pas.
  const readonly = await startWith({ ouverture: null }, { search: '&readonly=true' });
  before = await shown(readonly.page);
  reply = await ask(readonly.page, MODEL('facture'), 8000);
  seen = await shown(readonly.page);
  check('un document en lecture seule : `{ ouvert: false }`, rien ne change, aucune fenêtre', reply.type === 'reponse' && reply.data.ouvert === false && JSON.stringify(seen) === JSON.stringify(before) && (await noDialog(readonly.page)), { reply, before, seen });
  await readonly.context.close();

  // Un autre nom d'appel que `ouvrir` : inconnu, comme avant.
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

console.log('\n== L’appel `ouvrir` : des modifications attendent (l’enregistrement automatique est coupé) ==');
{
  const o = await startWith({ ouverture: null }, { storage: { pp_autosave_enabled: 'false' } });
  const page = o.page;
  await sleep(1500);
  check('une frappe est vue par l’app : le modèle a des modifications en attente', await typeInEditor(page, ' TAPÉ'));
  let pending = ask(page, MODEL('facture'));
  check('la question « Enregistrer / Ne pas enregistrer / Annuler » se pose d’abord', await waitDialog(page));
  let d = await dialogOf(page);
  let got = await received(page);
  check('c’est la question de l’enregistrement, dans le panneau, et RIEN n’est encore créé (ni table ni modèle) : la demande d’accord de la galerie vient après', d.open && d.inPanel && d.buttons.map(b => b.label).join('|') === DIALOG.fr.unsaved && got.tables.length === 0 && got.models === 0, { d, got });
  await sleep(600);
  check('GFS n’a pas de réponse tant que la personne n’a pas choisi', (await answers(page)).length === 0, await answers(page));
  await pressDialog(page, 'Annuler');
  let reply = await pending;
  let seen = await shown(page);
  got = await received(page);
  check('« Annuler » : `{ ouvert: false }`, le modèle ouvert garde ce qui a été tapé, aucune table, aucune fenêtre de plus', reply.data && reply.data.ouvert === false && seen.name === 'Départ A défaut' && seen.text.includes('TAPÉ') && got.tables.length === 0 && got.models === 0 && (await noDialog(page)), { reply, seen, got });

  pending = ask(page, MODEL('facture'));
  await waitDialog(page);
  await pressDialog(page, 'Ne pas enregistrer');
  check('« Ne pas enregistrer » : la demande d’accord de la galerie se pose ensuite', await waitDialog(page));
  d = await dialogOf(page);
  check('c’est « Créer les tables du modèle ? »', d.open && d.title === DIALOG.fr.title && d.buttons.map(b => b.label).join('|') === DIALOG.fr.buttons, d);
  await pressDialog(page, 'Annuler');
  reply = await pending;
  seen = await shown(page);
  got = await received(page);
  check('« Annuler » à cette seconde question : `{ ouvert: false }`, rien n’est créé, le modèle quitté reste à l’écran avec ce qui a été tapé', reply.data && reply.data.ouvert === false && got.tables.length === 0 && got.models === 0 && seen.name === 'Départ A défaut' && seen.text.includes('TAPÉ'), { reply, seen, got });

  pending = ask(page, MODEL('facture'));
  await waitDialog(page);
  await pressDialog(page, 'Ne pas enregistrer');
  await waitDialog(page);
  await pressDialog(page, 'Créer');
  reply = await pending;
  check('« Ne pas enregistrer » puis « Créer » : `{ ouvert: true }`, le modèle de départ remplace ce qui avait été tapé', reply.data && reply.data.ouvert === true && !(await shown(page)).text.includes('TAPÉ'), reply);
  await expectOnScreen(page, 'facture', 'fr', 'après « Ne pas enregistrer »', { tablesNow: tablesOf('facture') });
  got = await received(page);
  check('rien n’a été enregistré de tout cela', got.models === 0, got);
  await o.context.close();
}

console.log('\n== L’appel `ouvrir` : l’enregistrement automatique est allumé ==');
{
  // Le modèle qu'on quitte est enregistré avant de partir, sans question : la personne a allumé l'enregistrement automatique (consigne GFS 047, js/main-leave.js `saveBeforeGfsLeaves`).
  const o = await startWith({ ouverture: FILE(2) }, { storage: { pp_autosave_enabled: 'true' } });
  const page = o.page;
  const first = await shown(page);
  await sleep(1500);
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await page.keyboard.type(' MODIFIÉ');
  const pending = ask(page, MODEL('facture'));
  check('pas de question d’enregistrement : la demande d’accord de la galerie se pose directement', await waitDialog(page));
  const d = await dialogOf(page);
  const saved = await page.evaluate(() => { const rows = window.__gristStub.state.rows.Publipostage_Modeles; return rows.Contenu[rows.id.indexOf(2)]; });
  check('c’est « Créer les tables du modèle ? », et « Départ B » est déjà enregistré avec ce qui a été tapé', first.name === 'Départ B' && d.open && d.title === DIALOG.fr.title && saved.includes('MODIFIÉ'), { first, d, saved });
  await pressDialog(page, 'Créer');
  const reply = await pending;
  const seen = await shown(page);
  const got = await received(page);
  check('`{ ouvert: true }`, le modèle de départ est à l’écran non enregistré, et la table des modèles n’a pas de ligne de plus', reply.data && reply.data.ouvert === true && seen.name === 'Facture, devis ou avoir' && seen.current == null && got.names.length === 6, { reply, seen, got });
  await o.context.close();
}

console.log('\n== L’appel `ouvrir` : des tables qui ne conviennent pas ==');
{
  // Le document a déjà une table « Facture » (le nom d'une table du modèle) avec d'autres colonnes : la fenêtre des conflits, rien n'est créé.
  const seed = seedModels() + `
  stub.setVariables('Factures', { Numero: 'Text' });`;
  const o = await startWith({ ouverture: null }, { seed });
  const page = o.page;
  const before = await shown(page);
  const tables = tablesOf('facture');
  const taken = await page.evaluate(() => window.__gristStub.state.tables.slice());
  check('le document a déjà une table `Factures` aux colonnes différentes (le modèle en a une du même nom)', tables.includes('Factures') && taken.includes('Factures'), { tables, taken });
  const pending = ask(page, MODEL('facture'));
  check('la fenêtre des conflits se pose', await waitDialog(page));
  const d = await dialogOf(page);
  check('elle dit que le modèle ne peut pas être créé ici, nomme la table et propose « Fermer »', d.open && d.inPanel && /ne peut pas être créé ici/.test(d.title) && /Factures/.test(d.message) && d.buttons.map(b => b.label).join('|') === 'Fermer', d);
  await pressDialog(page, 'Fermer');
  const reply = await pending;
  const seen = await shown(page);
  const got = await received(page);
  check('`{ ouvert: false }`, rien n’est créé ni modifié, le modèle ouvert reste', reply.data && reply.data.ouvert === false && got.tables.length === 0 && got.models === 0 && seen.name === before.name, { reply, seen, got });
  await o.context.close();
}

console.log('\n== L’appel `ouvrir` : une présentation ==');
{
  const id = 'proposition-commerciale';
  // L'extension « diapositives » éteinte : la garde « type inconnu » ne laisse pas ouvrir une présentation, comme pour un « Nouveau » de ce type : `{ ouvert: false }`, sans rien dire ni créer.
  const o = await startWith({ ouverture: null, extensions: ['graphique'] });
  const page = o.page;
  const before = await shown(page);
  let reply = await ask(page, MODEL(id), 15000);
  let got = await received(page);
  check('sans l’extension « diapositives » : `{ ouvert: false }`, rien n’est créé ni écrit, aucune fenêtre, le modèle ouvert reste', reply.type === 'reponse' && reply.data.ouvert === false && got.tables.length === 0 && got.models === 0 && (await noDialog(page)) && JSON.stringify(await shown(page)) === JSON.stringify(before), { reply, got });
  // « diapositives » allumée mais pas « graphique », que le pack exige : GFS reçoit la demande d'installation de celle-ci, comme au clic de la galerie, et rien n'est créé.
  await page.evaluate(() => window.__gfsStub.setExtensions(['diapositives']));
  await page.waitForFunction(() => SlidesEntry.isAvailable(), null, { timeout: 8000 });
  reply = await ask(page, MODEL(id), 30000);
  got = await received(page);
  check('« diapositives » sans « graphique » (que son pack exige) : `{ ouvert: false }`, rien n’est créé ni écrit', reply.type === 'reponse' && reply.data.ouvert === false && got.tables.length === 0 && got.models === 0 && (await shown(page)).name === before.name, { reply, got });
  check('GFS reçoit la demande d’installation de l’extension « graphique », comme au clic de la galerie', same(await installs(page), [{ extension: 'graphique' }]), await installs(page));
  // Les deux allumées : la présentation s'ouvre avec ses tables.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique', 'diapositives']));
  await page.waitForFunction(() => SlidesEntry.isAvailable() && Extensions.isActive('graphique'), null, { timeout: 8000 });
  const pending = ask(page, MODEL(id), 60000);
  check('les deux extensions allumées : la demande d’accord se pose', await waitDialog(page, 40000));
  await pressDialog(page, 'Créer');
  const done = await pending;
  const format = await page.evaluate(() => ({ format: PageLayout.getFormat(), orientation: PageLayout.getOrientation() }));
  const seen = await shown(page);
  check('`{ ouvert: true }` : la présentation est à l’écran non enregistrée, sur la diapositive 16:9 en paysage', done.data && done.data.ouvert === true && seen.current == null && seen.name === entryOf(id).nom.fr && format.format === '190.5x338.7' && format.orientation === 'landscape', { done, seen, format });
  check('ses tables sont créées', same((await received(page)).tables, tablesOf(id)), (await received(page)).tables);
  await o.context.close();
}

console.log('\n== Le catalogue : chacun des modèles s’ouvre par son `id` ==');
{
  const o = await startWith({ ouverture: null, extensions: ['graphique', 'diapositives'] });
  const page = o.page;
  const problems = [];
  for (const entry of CATALOGUE) {
    const pending = ask(page, MODEL(entry.id), 90000);
    let steps = 0;
    // Une demande d'accord, ou la fenêtre des conflits quand des tables d'un modèle précédent n'iraient pas : on dit laquelle.
    while (steps++ < 3) {
      const reply = await Promise.race([pending.then(r => ({ r })), sleep(400).then(() => null)]);
      if (reply) break;
      const d = await dialogOf(page);
      if (!d.open) continue;
      if (d.title === DIALOG.fr.title) await pressDialog(page, 'Créer');
      else { problems.push(entry.id + ' : ' + d.title); await pressDialog(page, 'Fermer'); }
    }
    const reply = await pending;
    const seen = await shown(page);
    const seenSurface = await surfaces(page);
    const ok = reply.type === 'reponse' && reply.data && reply.data.ouvert === true && seen.current == null && seen.name === entry.nom.fr && WARNING.fr.test(seen.status)
      && (entry.type === 'email' ? seenSurface.emailBanner : entry.type === 'grille' ? seenSurface.grid : !seenSurface.emailBanner && !seenSurface.grid);
    check(`« ${entry.id} » (${entry.type}) : \`{ ouvert: true }\`, « ${entry.nom.fr} » à l’écran non enregistré, sous la forme de son type`, ok, { reply, seen, seenSurface });
  }
  check('aucune demande n’a rencontré de conflit de tables avec un modèle ouvert avant elle', problems.length === 0, problems);
  const got = await received(page);
  check('22 modèles ouverts l’un après l’autre : rien n’est écrit dans la table des modèles', got.models === 0 && got.names.length === 6, got);
  await o.context.close();
}

console.log('\n== Le catalogue en anglais : les noms viennent de l’interface ==');
{
  const o = await startWith({ ouverture: null }, { lang: 'en' });
  const page = o.page;
  for (const id of ['facture', 'emargement-grille', 'bon-de-commande']) {
    const pending = ask(page, MODEL(id), 60000);
    check(`« ${id} » : la demande d’accord se pose`, await waitDialog(page));
    await pressDialog(page, 'Create');
    const reply = await pending;
    const seen = await shown(page);
    check(`« ${id} » : \`{ ouvert: true }\`, « ${entryOf(id).nom.en} » dans le champ du nom`, reply.data && reply.data.ouvert === true && seen.name === entryOf(id).nom.en && seen.current == null && WARNING.en.test(seen.status), { reply, seen });
  }
  const refused = await ask(page, MODEL('inexistant', { type: 'document' }), 8000);
  const seen = await shown(page);
  check('un `id` inconnu : `{ ouvert: false }` et le coin d’état le dit en anglais', refused.data && refused.data.ouvert === false && seen.status === UNKNOWN.en && seen.statusClass === 'error-msg', { refused, seen });
  await o.context.close();
}

console.log('\n== Les vignettes du catalogue sont celles de la galerie, pixel pour pixel ==');
{
  const o = await t.openPage({ hosted: false, seed: seedModels() });
  const results = await o.page.evaluate(async (ids) => {
    const load = async (url) => {
      const response = await fetch(url);
      if (!response.ok) return null;
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
    };
    const out = [];
    for (const id of ids) {
      const webp = await load('/modeles/' + id + '.webp');
      const png = await load('/templates-gallery/' + id + '/thumb.png');
      if (!webp || !png) { out.push({ id, missing: true }); continue; }
      let different = 0;
      if (webp.width === png.width && webp.height === png.height) for (let i = 0; i < webp.data.length; i++) if (webp.data[i] !== png.data[i]) different++;
      out.push({ id, width: webp.width, height: webp.height, same: webp.width === png.width && webp.height === png.height && different === 0, different });
    }
    return out;
  }, CATALOGUE.map(entry => entry.id));
  for (const item of results) check(`« ${item.id} » : la vignette (240 x 320) est le thumb.png de la galerie, sans une différence`, !item.missing && item.width === 240 && item.height === 320 && item.same, item);
  await o.context.close();
}

await t.finish();
