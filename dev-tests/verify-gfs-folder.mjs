#!/usr/bin/env node
// Le dossier que GFS donne à une création (js/gfs-open.js `GfsOpen.takeFolder`, js/templates.js `Templates.onCreated`, js/main.js), 700x400, GFS simulé (dev-tests/gfs-stub.js, adresse `?gfs=0`).
// Dans l'explorateur de GFS (« Mes fichiers »), la personne crée un document DANS un dossier : « Nouveau », « Nouveau > Importer », « Nouveau > Depuis un modèle » portent ce `dossier`. Avant le 20/11
// l'app ne le lisait pas : le document arrivait à la racine (bug signalé par Antoine). Désormais le dossier attend le premier enregistrement (rien n'est écrit à l'ouverture : un document qu'on abandonne
// ne laisse rien) et la ligne de rangement de la personne s'écrit avec la ligne du document, que la liste et « Organiser » montrent aussitôt dans ce dossier ; GFS la lit.
//  1. « Nouveau » au démarrage, `dossier` « Contrats/2026 » : rien n'est écrit à l'ouverture ; nommé puis enregistré à la souris, le document est rangé dans ce dossier (la table du rangement, la liste) ;
//  2. l'app déjà ouverte (appel `ouvrir`), un email dans « Litiges » : même résultat ; un « Nouveau » sans dossier reste à la racine, sans ligne de rangement ;
//  3. le dossier n'est jamais gardé pour un autre document : « Nouveau » dans un dossier, abandonné pour le bouton « Nouveau » de l'app, puis enregistré : racine ;
//  4. « Nouveau > Importer » (le document importé s'enregistre de lui-même) : rangé dans le dossier ; l'import d'après, sans dossier : racine ;
//  5. « Nouveau > Depuis un modèle » : le modèle de la galerie, enregistré, est rangé dans le dossier ;
//  6. un `dossier` écrit de travers (espaces, barres en trop) est rangé normalisé ; vide, aucune ligne.
// Lancé par run-headless.mjs (groupe Node "gfsFolder", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-folder.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-folder', port: Number(process.env.GFS_FOLDER_PORT || 8956) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NEW = (type, extra) => Object.assign({ fichier: null, type, dossier: '', raison: 'nouveau' }, extra || {});
const MODEL = (id, extra) => Object.assign({ fichier: null, type: 'document', dossier: '', raison: 'modele', modele: { id } }, extra || {});
const MARKDOWN = { name: 'note.md', mime: 'text/markdown', text: '# Titre importé\n\nTexte du fichier de GFS.' };
const TRACK = `window.__started = false;
  document.addEventListener('DOMContentLoaded', () => {
    const ready = FirstContact.ready.bind(FirstContact);
    FirstContact.ready = (...args) => { window.__started = true; return ready(...args); };
  });
  window.__makeFile = (src) => new File([src.text], src.name, { type: src.mime });`;
const started = page => page.waitForFunction(() => window.__started === true, null, { timeout: 90000 });
const openHosted = async (stub, extra = {}) => {
  const o = await t.openPage(Object.assign({ hosted: true, stub, seed: seedModels({}), init: TRACK }, extra));
  await started(o.page);
  return o;
};
const ask = (page, args, ms = 20000) => page.evaluate(({ args, ms }) => Promise.race([window.__gfsStub.call('ouvrir', args), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]), { args, ms });
const askImport = (page, src, patch = {}, ms = 30000) => page.evaluate(({ src, patch, ms }) => {
  const opening = Object.assign({ fichier: null, type: 'document', dossier: '', raison: 'importer', importation: { valeur: 'markdown', fichier: window.__makeFile(src) } }, patch);
  return Promise.race([window.__gfsStub.call('ouvrir', opening), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]);
}, { src, patch, ms });

// Le rangement tel que le faux Grist le garde (les noms d'avant : l'essai ne change pas le mode des noms) : une ligne par modèle rangé.
const prefRows = page => page.evaluate(() => {
  const t = window.__gristStub.state.rows.Publipostage_PreferencesModeles;
  return t ? t.id.map((id, i) => ({ id, user: t.Utilisateur[i], model: t.ModeleId[i], folder: t.Dossier[i] })) : [];
});
const writesOf = page => page.evaluate(() => ({
  models: window.__gristStub.countActions('AddRecord', 'Publipostage_Modeles') + window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'),
  prefs: window.__gristStub.countActions('AddRecord', 'Publipostage_PreferencesModeles') + window.__gristStub.countActions('UpdateRecord', 'Publipostage_PreferencesModeles'),
}));
const folderOf = async (page, id) => (await page.evaluate(i => TemplatePreferences.getFolder(i), id)) || '';
const currentId = page => page.evaluate(() => Templates.getCurrentId());
const center = (page, selector) => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);

// Nomme le document à la souris et au clavier (le crayon du titre), puis clique « Enregistrer » : le chemin de la personne.
async function nameAndSave(page, name) {
  const pencil = await center(page, '#btn-rename-template');
  await page.mouse.click(pencil.x, pencil.y);
  await sleep(250);
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await sleep(200);
  const save = await center(page, '#btn-save');
  await page.mouse.move(save.x, save.y);
  await page.mouse.click(save.x, save.y);
  await page.waitForFunction(() => Templates.getCurrentId() != null, null, { timeout: 15000 }).catch(() => {});
  await sleep(700);
  return currentId(page);
}
// Le document dans la liste : le dossier qui le contient, tel que la liste le montre (le déroulant ouvert à la souris).
async function folderInList(page, name) {
  const trigger = await center(page, '.tts-trigger');
  await page.mouse.click(trigger.x, trigger.y);
  await sleep(300);
  const found = await page.evaluate(n => {
    const leaf = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(r => r.querySelector('.tts-row-label').textContent.replace(' ★', '') === n);
    if (!leaf) return null;
    const group = leaf.closest('.tts-group, [role="group"]');
    const folder = group && group.previousElementSibling && group.previousElementSibling.dataset ? group.previousElementSibling.dataset.folderPath : '';
    return { folder: folder || '' };
  }, name);
  await page.keyboard.press('Escape');
  await sleep(150);
  return found;
}

console.log('\n== 1. « Nouveau » au démarrage, dans un dossier ==');
{
  const o = await openHosted({ ouverture: NEW('document', { dossier: 'Contrats/2026' }) });
  const before = await writesOf(o.page);
  check('à l’ouverture rien n’est écrit (ni document, ni rangement) : un document abandonné ne laisse rien', before.models === 0 && before.prefs === 0 && (await prefRows(o.page)).length === 0, before);
  const id = await nameAndSave(o.page, 'Bail du dossier');
  check('« Enregistrer » a créé le document', id != null, id);
  const rows = (await prefRows(o.page)).filter(r => r.model === Number(id));
  check('la ligne de rangement du document est écrite avec le dossier de GFS, une seule', rows.length === 1 && rows[0].folder === 'Contrats/2026', rows);
  check('l’app le range aussi : TemplatePreferences.getFolder rend le dossier', (await folderOf(o.page, id)) === 'Contrats/2026');
  const listed = await folderInList(o.page, 'Bail du dossier');
  check('la liste des documents le montre dans le dossier « Contrats/2026 », pas à la racine', !!listed && listed.folder === 'Contrats/2026', listed);
  await o.context.close();
}

console.log('\n== 2. L’app déjà ouverte : un email dans un dossier, puis un « Nouveau » sans dossier ==');
{
  const o = await openHosted({ ouverture: null });
  let reply = await ask(o.page, NEW('email', { dossier: 'Litiges' }));
  check('l’appel `ouvrir` « Nouveau » email est accepté', reply.type === 'reponse' && reply.data.ouvert === true, reply);
  check('rien n’est écrit tant que le document n’est pas enregistré', (await writesOf(o.page)).prefs === 0);
  const id = await nameAndSave(o.page, 'Courrier du dossier');
  const row = (await prefRows(o.page)).find(r => r.model === Number(id));
  check('l’email enregistré est rangé dans « Litiges »', !!row && row.folder === 'Litiges' && (await folderOf(o.page, id)) === 'Litiges', row);
  reply = await ask(o.page, NEW('document'));
  check('un « Nouveau » sans dossier est accepté', reply.type === 'reponse' && reply.data.ouvert === true, reply);
  const rootId = await nameAndSave(o.page, 'Document de la racine');
  check('sans dossier : aucune ligne de rangement pour ce document, il est à la racine', rootId != null && !(await prefRows(o.page)).some(r => r.model === Number(rootId)) && (await folderOf(o.page, rootId)) === '', { rootId });
  await o.context.close();
}

console.log('\n== 3. Le dossier n’est jamais gardé pour un autre document ==');
{
  const o = await openHosted({ ouverture: null });
  await ask(o.page, NEW('document', { dossier: 'Abandonné' }));
  // La personne laisse ce document pour le bouton « Nouveau » de l'app (rien n'a été modifié : aucune question).
  const button = await center(o.page, '#btn-new');
  await o.page.mouse.click(button.x, button.y);
  await sleep(500);
  const id = await nameAndSave(o.page, 'Autre document');
  check('« Nouveau » de l’app après un « Nouveau » de GFS dans un dossier : le document est à la racine', id != null && (await folderOf(o.page, id)) === '' && !(await prefRows(o.page)).some(r => r.folder === 'Abandonné'), await prefRows(o.page));
  await o.context.close();
}

console.log('\n== 4. « Nouveau > Importer » dans un dossier ==');
{
  const o = await openHosted({ ouverture: null });
  let reply = await askImport(o.page, MARKDOWN, { dossier: 'Imports/Notes' });
  check('l’import est accepté', reply.type === 'reponse' && reply.data.ouvert === true, reply);
  await sleep(700);
  const id = await currentId(o.page);
  const row = (await prefRows(o.page)).find(r => r.model === Number(id));
  check('le document importé (enregistré de lui-même) est rangé dans « Imports/Notes »', id != null && !!row && row.folder === 'Imports/Notes' && (await folderOf(o.page, id)) === 'Imports/Notes', { id, row });
  reply = await askImport(o.page, Object.assign({}, MARKDOWN, { name: 'seconde.md' }), {});
  await sleep(700);
  const second = await currentId(o.page);
  check('l’import d’après, sans dossier : à la racine, le dossier du premier n’est pas gardé', reply.type === 'reponse' && second != null && second !== id && (await folderOf(o.page, second)) === '' && !(await prefRows(o.page)).some(r => r.model === Number(second)), { second });
  await o.context.close();
}

console.log('\n== 5. « Nouveau > Depuis un modèle » dans un dossier ==');
{
  const o = await openHosted({ ouverture: null });
  // Les modèles de la galerie créent des tables : la fenêtre « Créer les tables du modèle ? » se pose avant que le modèle s'ouvre ; la personne dit « Créer ».
  const pending = o.page.evaluate(args => Promise.race([window.__gfsStub.call('ouvrir', args), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), 40000))]), MODEL('facture', { dossier: 'Factures/2026' }));
  await o.page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 30000 }).catch(() => {});
  const button = await o.page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(x => !x.hidden && x.textContent === 'Créer');
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (button) { await o.page.mouse.move(button.x - 10, button.y, { steps: 2 }); await o.page.mouse.click(button.x, button.y); }
  const reply = await pending;
  await sleep(500);
  check('le modèle de départ s’ouvre (tables créées avec l’accord), non enregistré : rien n’est rangé', !!button && reply.type === 'reponse' && reply.data.ouvert === true && (await currentId(o.page)) == null && (await writesOf(o.page)).prefs === 0, { button, reply });
  const save = await center(o.page, '#btn-save');
  await o.page.mouse.click(save.x, save.y);
  await o.page.waitForFunction(() => Templates.getCurrentId() != null, null, { timeout: 15000 }).catch(() => {});
  await sleep(700);
  const id = await currentId(o.page);
  check('enregistré, il est rangé dans « Factures/2026 »', id != null && (await folderOf(o.page, id)) === 'Factures/2026' && (await prefRows(o.page)).some(r => r.model === Number(id) && r.folder === 'Factures/2026'), { id, rows: await prefRows(o.page) });
  await o.context.close();
}

console.log('\n== 6. Un dossier écrit de travers, un dossier vide ==');
{
  const o = await openHosted({ ouverture: null });
  await ask(o.page, NEW('document', { dossier: '  Contrats / / 2026 /' }));
  const id = await nameAndSave(o.page, 'Nettoyé');
  check('le chemin est rangé normalisé (« Contrats/2026 »)', id != null && (await folderOf(o.page, id)) === 'Contrats/2026', await prefRows(o.page));
  await ask(o.page, NEW('document', { dossier: '   ' }));
  const blank = await nameAndSave(o.page, 'Sans dossier');
  check('un dossier fait d’espaces ne range rien', blank != null && (await folderOf(o.page, blank)) === '', await prefRows(o.page));
  await o.context.close();
}

await t.finish();
