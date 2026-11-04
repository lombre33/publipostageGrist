#!/usr/bin/env node
// Lire un PDF que GFS garde (consigne GFS 040 : js/gfs-link.js `normalizeOpening`, js/gfs-open.js, js/pdf-reading.js, extensions/lecture-pdf/, js/main.js `leaveForPdf` / `applyPdfLocks` / `renderReader`), 700x400.
// Un GFS simulé (dev-tests/gfs-stub.js, adresse `?gfs=0`) joue le rôle de GFS : il rend l'`ouverture` du contexte ou envoie l'appel `ouvrir` avec `lecture: { id, fichier: File }`, et il DONNE pdf.js
// (`bibliotheques.pdfjs` : le fichier assemblé du miroir hors-ligne, dev-tests/.offline-cache/pdfjs-gfs.json, servi comme GFS le servira) ; ce script lit ce que la personne voit et ce que GFS reçoit.
//  CE QUE L'APP GARDE : `lecture: { id, fichier }` pour la raison `lire` seule, un texte et un `File` (jamais un objet qui lui ressemble) ; rien d'autre.
//  AU DÉMARRAGE : l'ordre habituel ouvre son modèle, « Widget prêt. » se dit, puis le PDF le remplace - jamais un modèle vierge à la place, jamais l'ordre d'arrivée sauté ; une lecture qui échoue laisse le modèle habituel.
//  L'APPEL `ouvrir` : le PDF s'ouvre dans la Lecture (pages, texte, grisés avec leur raison, mode Lecture seul) ; le suivant le remplace sans recharger l'app ; un PDF vide, qui n'en est pas un, illisible ou dont le mot de
//   passe est refusé : `{ ouvert: false }`, le PDF d'avant reste ; le mot de passe se demande par une fenêtre de l'app ; la question « Enregistrer / Abandonner / Annuler » se pose APRÈS la lecture du PDF ; un modèle qui
//   s'ouvre ferme le PDF et rend le mode d'avant ; la ligne de la table qui change ne le remplace pas.
//  SANS ELLE, SANS SON MOTEUR, DANS UN VIEUX NAVIGATEUR, EN LECTURE SEULE, SEUL, DANS LE CADRE ISOLÉ DE GFS, EN ANGLAIS.
// Lancé par run-headless.mjs (groupe Node "gfsRead", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-read.mjs
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { start, seedModels, pdfjsLibrary, registryFiles, PDFJS_PATH, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-read', port: Number(process.env.GFS_READ_PORT || 8914) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LIB = pdfjsLibrary();
if (!LIB) {
  check('le fichier « pdfjs » du miroir hors-ligne est là (bash dev-tests/offline-deps.sh)', false);
  await t.finish();
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Les PDF des essais, fabriqués ici (pdf-lib et pdfmake du miroir hors-ligne) : trois pages à texte accentué, un autre de deux pages, quarante pages, des pages de formats mêlés, un PDF protégé (mot de passe « secret »)
// et trois fichiers qui n'en sont pas (vide, texte, en-tête sans contenu).
const req = createRequire(join(ROOT, 'dev-tests', '.offline-cache', 'x.js'));
const { PDFDocument, StandardFonts } = req('pdf-lib');
const PdfPrinter = req('pdfmake');
const A4 = [595.28, 841.89];
async function textPdf(labels, sizes) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  labels.forEach((text, i) => {
    const page = doc.addPage(sizes ? sizes[i] : A4);
    page.drawText(text, { x: 50, y: page.getHeight() - 60, size: 18, font });
  });
  return Buffer.from(await doc.save());
}
const OWNER_PASSWORD_SAMPLE = 'proprietaire'; // valeur d'exemple du PDF d'essai, rien d'autre
function protectedPdf(password) {
  const printer = new PdfPrinter({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } });
  const doc = printer.createPdfKitDocument({ defaultStyle: { font: 'Helvetica' }, userPassword: password, ownerPassword: OWNER_PASSWORD_SAMPLE, content: ['Texte protégé : bonjour', { text: 'page deux', pageBreak: 'before' }] });
  return new Promise((resolve) => { const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.end(); });
}
const THREE = ['Bonjour, première page : à très bientôt', 'Deuxième page — élèves', 'Troisième page'];
const OTHER = ['Autre PDF, première page', 'Autre PDF, seconde page'];
const PDFS = {
  three: { name: 'trois-pages.pdf', bytes: await textPdf(THREE) },
  other: { name: 'autre.pdf', bytes: await textPdf(OTHER) },
  long: { name: 'quarante.pdf', bytes: await textPdf(Array.from({ length: 40 }, (_, i) => 'Page ' + (i + 1) + ' sur 40')) },
  mixed: { name: 'formats-mêlés.pdf', bytes: await textPdf(['Portrait', 'Paysage large'], [A4, [A4[1], A4[0]]]) },
  locked: { name: 'protégé.pdf', bytes: await protectedPdf('secret') },
  empty: { name: 'vide.pdf', bytes: Buffer.alloc(0) },
  text: { name: 'note.pdf', bytes: Buffer.from('bonjour, ceci est un texte') },
  broken: { name: 'abîmé.pdf', bytes: Buffer.from('%PDF-1.4\nce n’est pas un vrai PDF\n%%EOF\n') },
};
const fileSrc = key => ({ name: PDFS[key].name, mime: 'application/pdf', base64: PDFS[key].bytes.toString('base64') });

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const PHRASE = {
  fr: {
    ready: 'Widget prêt.', opened: (name, n) => `PDF « ${name} » : ${n} ${n > 1 ? 'pages' : 'page'}.`, off: 'La lecture de PDF n’est pas activée dans Grist Factory Suite.',
    engine: 'La lecture de PDF n’a pas reçu son moteur de Grist Factory Suite.', loadFailed: 'La lecture de PDF n’a pas pu se charger. Rouvrez le PDF depuis l’explorateur.',
    old: 'Ce navigateur est trop ancien pour lire un PDF : mettez-le à jour.', empty: name => `Le PDF « ${name} » est vide.`, notPdf: name => `Le fichier « ${name} » n’est pas un PDF lisible.`,
    unreadable: name => `Le PDF « ${name} » n’a pas pu être lu.`, password: name => `Le PDF « ${name} » reste fermé : son mot de passe n’a pas été donné ou n’est pas le bon.`,
    passwordTitle: 'PDF protégé', passwordAsk: name => `Le PDF « ${name} » est protégé par un mot de passe.`, passwordAgain: name => `Ce mot de passe n’est pas le bon pour « ${name} ». Essayez encore.`,
    edit: 'Un PDF se lit, il ne s’édite pas. Ouvrez un modèle pour l’éditer.', template: 'Un PDF n’est pas un modèle : il n’y a rien à enregistrer, renommer ou supprimer.',
    export: 'Un PDF est déjà un PDF : l’export ne s’applique qu’à un modèle.', comment: 'Les commentaires sur un PDF ne sont pas encore possibles.', page: (n, total) => `Page ${n} sur ${total}`,
  },
  en: {
    ready: 'Widget ready.', opened: (name, n) => `PDF “${name}”: ${n} ${n > 1 ? 'pages' : 'page'}.`, off: 'PDF reading is not turned on in Grist Factory Suite.',
    engine: 'PDF reading did not get its engine from Grist Factory Suite.', loadFailed: 'PDF reading could not be loaded. Open the PDF again from the explorer.',
    old: 'This browser is too old to read a PDF: please update it.', empty: name => `The PDF “${name}” is empty.`, notPdf: name => `The file “${name}” is not a readable PDF.`,
    unreadable: name => `The PDF “${name}” could not be read.`, password: name => `The PDF “${name}” stays closed: its password was not given or is not the right one.`,
    passwordTitle: 'Protected PDF', passwordAsk: name => `The PDF “${name}” is protected by a password.`, passwordAgain: name => `That password is not the right one for “${name}”. Try again.`,
    edit: 'A PDF is read, not edited. Open a template to edit it.', template: 'A PDF is not a template: there is nothing to save, rename or delete.',
    export: 'A PDF is already a PDF: export only applies to a template.', comment: 'Comments on a PDF are not available yet.', page: (n, total) => `Page ${n} of ${total}`,
  },
};
// Ce que chaque commande grisée dit de sa raison, et celles que le PDF NE grise PAS.
const LOCKS = {
  edit: ['btn-mode-edit'],
  template: ['v2-save-group', 'btn-delete', 'btn-link-rules', 'btn-rename-template', 'btn-set-default-template', 'v2-pdf-filename-cluster', 'v2-page-group'],
  export: ['v2-quality-group', 'v2-export-pdf-group', 'btn-create-email'],
  comment: ['v2-btn-comment'],
};
const ALL_LOCKED = Object.values(LOCKS).flat().sort();
const STAYS_ACTIVE = ['v2-new-template-group', 'btn-organize-templates', 'btn-mode-read', 'v2-btn-settings'];

// Pour toutes les pages : le File se fabrique dans la page (il ne passe ni par page.evaluate ni par le JSON du stub), le navigateur de l'essai prête à pdf.js ce qu'il lui faut (Chromium d'avant la 145 : les méthodes
// `getOrInsertComputed` de Map et de WeakMap - l'app, elle, dit « navigateur trop ancien » sans elles), et les Workers créés sont comptés (pdf.js prend son « faux Worker » : aucun).
const BASE = `
  window.__makeFile = (src) => new File([Uint8Array.from(atob(src.base64), c => c.charCodeAt(0))], src.name, { type: src.mime });
  window.__workers = 0;
  const NativeWorker = window.Worker;
  window.Worker = function (...args) { window.__workers += 1; return new NativeWorker(...args); };
  window.__marker = 'avant';`;
const POLYFILL = `
  for (const C of [Map, WeakMap]) {
    if (!C.prototype.getOrInsert) C.prototype.getOrInsert = function (k, v) { if (!this.has(k)) this.set(k, v); return this.get(k); };
    if (!C.prototype.getOrInsertComputed) C.prototype.getOrInsertComputed = function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); };
  }`;
const NO_METHODS = 'delete Map.prototype.getOrInsertComputed; delete WeakMap.prototype.getOrInsertComputed;';
// Les modèles que l'app ouvre, dans l'ordre (`Templates.setCurrentId` est le point de passage de toute ouverture ; « null » : un document vierge), et tout ce que le coin d'état a dit.
const TRACK = `
  window.__opened = []; window.__said = [];
  document.addEventListener('DOMContentLoaded', () => {
    const original = Templates.setCurrentId;
    Templates.setCurrentId = (id) => { window.__opened.push(String(id)); return original(id); };
    const corner = document.getElementById('status-msg');
    new MutationObserver(() => { const text = corner.textContent; if (text && window.__said[window.__said.length - 1] !== text) window.__said.push(text); }).observe(corner, { childList: true, characterData: true, subtree: true });
  });`;
const INIT = BASE + POLYFILL + TRACK;
const GFS = (extra = {}) => Object.assign({ extensions: ['lecture-pdf'], pdfjs: LIB, ouverture: null }, extra);
const startReading = (key, patch = {}) => `window.__gfsStub.ouverture = Object.assign({ fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: { id: 'pdf-7', fichier: window.__makeFile(${JSON.stringify(fileSrc(key))}) } }, ${JSON.stringify(patch)});`;

// L'appel `ouvrir` d'un PDF (le File est fabriqué dans la page) ; `patch` change la forme normale ; `sans-reponse` si l'app ne répond pas dans le délai.
const readCall = (page, key, patch = {}, ms = 40000) => page.evaluate(({ src, patch, ms }) => {
  const opening = Object.assign({ fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: { id: 'pdf-1', fichier: window.__makeFile(src) } }, patch);
  return Promise.race([window.__gfsStub.call('ouvrir', opening), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]);
}, { src: fileSrc(key), patch, ms });
const ask = (page, args, ms = 40000) => page.evaluate(({ args, ms }) => Promise.race([window.__gfsStub.call('ouvrir', args), new Promise(r => setTimeout(() => r({ type: 'sans-reponse' }), ms))]), { args, ms });
const MODEL = id => ({ fichier: { id: String(id), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' });
const opened = reply => reply.type === 'reponse' && reply.data && reply.data.ouvert === true;
const refused = reply => reply.type === 'reponse' && reply.data && reply.data.ouvert === false;
// Le PDF est à l'écran quand la première page est dessinée.
const settled = (page, n = 1) => page.waitForFunction(page => { try { return PdfReading.isActive() && PdfView.isMounted() && PdfView.pagesShown().includes(page); } catch (e) { return false; } }, n, { timeout: 40000 });

// Ce que la personne voit.
const seen = page => page.evaluate(({ ALL, STAY }) => {
  const q = s => document.querySelector(s);
  const visible = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const frames = Array.from(document.querySelectorAll('#reader-container .pp-pdf-page'));
  const layerOf = frame => frame && frame.querySelector('.pp-pdf-text');
  const dark = (frame) => {
    const canvas = frame && frame.querySelector('canvas');
    if (!canvas || !canvas.width) return 0;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128 && data[i] + data[i + 1] + data[i + 2] < 300) n++;
    return n;
  };
  const reader = q('#reader-container');
  return {
    active: PdfReading.isActive(), info: PdfReading.info(), mounted: typeof PdfView !== 'undefined' && PdfView.isMounted(), shown: typeof PdfView !== 'undefined' ? PdfView.pagesShown() : [],
    frames: frames.length, firstText: layerOf(frames[0]) ? layerOf(frames[0]).textContent : null, firstDark: dark(frames[0]),
    labels: frames.slice(0, 3).map(f => f.getAttribute('aria-label')), widest: reader.getAttribute('data-pp-widest-sheet'),
    readerShown: visible(reader), editorShown: visible(q('#editor-container')), modeRead: q('#btn-mode-read').classList.contains('active'), modeEdit: q('#btn-mode-edit').classList.contains('active'),
    status: q('#status-msg').textContent, statusClass: q('#status-msg').className, current: Templates.getCurrentId(), list: q('#template-select').value, name: q('#template-name').value,
    editorText: q('.ProseMirror').textContent, readerText: reader.textContent.slice(0, 80),
    locked: Array.from(document.querySelectorAll('.pp-pdf-locked')).map(e => e.id).sort(),
    titles: Object.fromEntries(['btn-mode-edit', 'v2-save-group', 'btn-delete', 'v2-page-group', 'v2-quality-group', 'v2-export-pdf-group', 'v2-btn-comment'].map(id => [id, q('#' + id) ? q('#' + id).getAttribute('title') : null])),
    aria: Object.fromEntries(ALL.map(id => [id, q('#' + id) ? q('#' + id).getAttribute('aria-disabled') : 'absent'])),
    opacity: getComputedStyle(q('#btn-mode-edit')).opacity, bubble: getComputedStyle(q('#btn-mode-edit'), '::after').display,
    stayingActive: STAY.filter(id => q('#' + id) && !q('#' + id).classList.contains('pp-pdf-locked') && q('#' + id).getAttribute('aria-disabled') !== 'true'),
    zoom: frames[0] ? parseFloat(getComputedStyle(frames[0]).zoom) : null, pageWidth: frames[0] ? Math.round(frames[0].getBoundingClientRect().width) : null, readerWidth: reader.clientWidth,
    scrollsInside: reader.scrollWidth <= reader.clientWidth + 1, workers: window.__workers, marker: window.__marker, said: window.__said ? window.__said.slice() : null, openedList: window.__opened ? window.__opened.slice() : null,
  };
}, { ALL: ALL_LOCKED, STAY: STAYS_ACTIVE });

// Les fenêtres de l'app (mot de passe d'un PDF protégé, question « Enregistrer / Ne pas enregistrer / Annuler ») et la souris.
const dialogOf = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const input = ov.querySelector('#pp-dialog-input');
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  return { open: true, title: ov.querySelector('h3').textContent, message: (ov.querySelector('#pp-dialog-message') || {}).textContent || '', inputShown: !!input && !input.hidden, inputType: input ? input.type : null, buttons, inPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
});
const waitDialog = page => page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 20000 });
const waitDialogMessage = (page, message) => page.waitForFunction((message) => { const ov = document.getElementById('pp-dialog-modal'); const m = document.getElementById('pp-dialog-message'); return !!ov && getComputedStyle(ov).display !== 'none' && !!m && m.textContent === message; }, message, { timeout: 20000 });
const clickDialog = async (page, label) => {
  const d = await dialogOf(page);
  const b = d.open && d.buttons.find(x => x.label === label);
  if (!b) throw new Error('bouton « ' + label + ' » absent : ' + JSON.stringify(d));
  await page.mouse.move(b.x - 10, b.y, { steps: 2 });
  await page.mouse.click(b.x, b.y);
  await sleep(400);
};
const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
const hover = async (page, selector) => {
  const b = await boxOf(page, selector);
  await page.mouse.move(b.x - 40, b.y);
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await sleep(500);
  return b;
};
const flyoutShown = page => page.evaluate(() => { const f = document.getElementById('v2-save-flyout'); return !!f && getComputedStyle(f).display !== 'none' && f.getClientRects().length > 0; });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Le démarrage avec un PDF passe vite de « Widget prêt. » à la phrase de la lecture : l'attente de prêt de `openPage` (qui lit le coin d'état) ne les verrait pas toutes, on attend donc la phrase elle-même (`ready: false`).
const saidBy = (page, phrase) => page.waitForFunction(phrase => (window.__said || []).includes(phrase), phrase, { timeout: 60000 });
const NAME = key => PDFS[key].name;
// Ce que l'app a écrit dans le document (les modèles) ; les commandes que la lecture seule grise.
const writes = page => page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles') + window.__gristStub.countActions('AddRecord', 'Publipostage_Modeles'));
const accessLocked = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-access-locked')).map(e => e.id || e.className).sort());

// ==================================================================================================================================================================================================
console.log('\n== Ce que l’app garde de l’ouverture (js/gfs-link.js `normalizeOpening`) ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT });
  const page = o.page;
  // Le dernier abonné de `onOpen` remplace celui de l'app : il reçoit l'ouverture TELLE QUE l'app la lit et ne fait rien d'autre.
  await page.evaluate(() => { window.__read = []; GfsLink.onOpen((opening) => { window.__read.push(opening); return false; }); });
  const read = (patch, lecture = 'normal') => page.evaluate(async ({ src, patch, lecture }) => {
    const file = window.__makeFile(src);
    const shapes = {
      normal: { id: 'pdf-9', fichier: file },
      numberId: { id: 9, fichier: file },
      noId: { fichier: file },
      nonFile: { id: 'pdf-9', fichier: 'trois-pages.pdf' },
      lookalike: { id: 'pdf-9', fichier: { name: 'a.pdf', size: 4, type: 'application/pdf' } },
      blob: { id: 'pdf-9', fichier: new Blob(['%PDF-']) },
      noFile: { id: 'pdf-9' },
      extra: { id: 'pdf-9', fichier: file, chemin: '/tmp/x', jeton: 'abc' },
      none: null,
      text: 'pdf-9',
    };
    const opening = Object.assign({ fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: shapes[lecture] }, patch);
    window.__read.length = 0;
    const reply = await window.__gfsStub.call('ouvrir', opening);
    const got = window.__read[0];
    return {
      reply: reply.type, kept: got ? Object.keys(got) : null,
      lecture: got && got.lecture ? { keys: Object.keys(got.lecture), id: got.lecture.id, isFile: got.lecture.fichier instanceof File, name: got.lecture.fichier.name, size: got.lecture.fichier.size } : null,
      rest: got ? { fichier: got.fichier, type: got.type, dossier: got.dossier, raison: got.raison } : null,
    };
  }, { src: fileSrc('three'), patch, lecture });

  let got = await read({});
  check('raison `lire`, un `id` en texte et un `File` : l’ouverture garde `lecture: { id, fichier }`, le fichier lui-même (un `File`, même nom, même taille)', !!got.lecture && got.lecture.id === 'pdf-9' && got.lecture.isFile && got.lecture.name === NAME('three') && got.lecture.size === PDFS.three.bytes.length, got);
  check('… et rien d’autre n’y est ajouté : `fichier`, `type`, `dossier`, `raison` comme avant', same(got.kept, ['fichier', 'type', 'dossier', 'raison', 'lecture']) && same(got.rest, { fichier: null, type: 'pdf', dossier: '', raison: 'lire' }), got);
  got = await read({ dossier: 'Contrats/2026' });
  check('`dossier` est lu comme d’habitude, la lecture aussi', !!got.lecture && got.rest.dossier === 'Contrats/2026', got);
  for (const raison of ['nouveau', 'explorateur', 'lien', 'importer', '']) {
    got = await read({ raison });
    check(`la raison « ${raison} » ne garde pas la lecture, même bien formée : l’ouverture est lue comme avant`, got.reply === 'reponse' && got.lecture === null && same(got.kept, ['fichier', 'type', 'dossier', 'raison']) && got.rest.raison === raison, got);
  }
  for (const [label, shape] of [
    ['un `id` qui n’est pas un texte', 'numberId'], ['une lecture sans `id`', 'noId'], ['un `fichier` qui est un texte', 'nonFile'], ['un objet qui ressemble à un fichier (nom, taille, type) sans en être un', 'lookalike'],
    ['un `Blob` qui n’est pas un `File`', 'blob'], ['une lecture sans `fichier`', 'noFile'], ['une lecture nulle', 'none'], ['une lecture qui est un texte', 'text'],
  ]) {
    got = await read({}, shape);
    check(`${label} : l’ouverture est lue sans lecture (et rien n’en est inventé)`, got.reply === 'reponse' && got.lecture === null && same(got.kept, ['fichier', 'type', 'dossier', 'raison']) && got.rest.raison === 'lire', got);
  }
  got = await read({}, 'extra');
  check('rien d’autre que `id` et `fichier` n’est gardé dans la lecture', !!got.lecture && same(got.lecture.keys, ['id', 'fichier']), got);
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Au démarrage : « Lire » ouvre l’app avec le PDF ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT + startReading('three'), ready: false });
  await settled(o.page);
  const v = await seen(o.page);
  const said = v.said || [];
  check('l’ordre habituel ouvre d’abord son modèle (le ★), « Widget prêt. » se dit, puis le PDF le remplace : jamais un document vierge à la place du ★', v.openedList[0] === '1' && v.openedList.slice(1).every(x => x === 'null') && said.indexOf(PHRASE.fr.ready) >= 0 && said.indexOf(PHRASE.fr.opened(NAME('three'), 3)) > said.indexOf(PHRASE.fr.ready), { opened: v.openedList, said });
  check('le PDF est à l’écran, dans la Lecture : 3 pages nommées (« Page 1 sur 3 »…), la première dessinée (du noir sur la page) avec son texte', v.active && same(v.info, { id: 'pdf-7', name: NAME('three'), pages: 3 }) && v.frames === 3 && v.mounted && v.firstText.includes('Bonjour, première page') && v.firstDark > 200 && v.labels[0] === PHRASE.fr.page(1, 3) && v.labels[2] === PHRASE.fr.page(3, 3), v);
  check('la Lecture est le seul mode (l’éditeur est caché, le bouton Édition grisé), le coin d’état dit le PDF et ses pages', v.readerShown && !v.editorShown && v.modeRead && !v.modeEdit && v.status === PHRASE.fr.opened(NAME('three'), 3) && v.statusClass === '', v);
  check('le document dessous est un document vierge, sans nom : rien n’a été écrit', v.current === null || v.current === '' || String(v.current) === 'null', v.current);
  check('ce qui ne s’applique pas à un PDF est grisé (l’édition, les modèles, l’export, les commentaires), le reste reste actif', same(v.locked, ALL_LOCKED) && same(v.stayingActive.slice().sort(), STAYS_ACTIVE.slice().sort()), { locked: v.locked, attendu: ALL_LOCKED, actifs: v.stayingActive });
  check('pdf.js tourne dans la page : aucun Worker créé', v.workers === 0 && o.page.workers().length === 0, { workers: v.workers });
  const traffic = o.requests.map(u => u.replace(/^https?:\/\/[^/]+\//, '')).filter(u => u.startsWith('extensions/lecture-pdf/')).sort();
  check('l’extension charge chacun de ses fichiers une fois, à la version du registre, et pdf.js seulement par la source que GFS a donnée (une fois)', same(traffic, registryFiles('lecture-pdf')) && o.requests.filter(u => u.endsWith(PDFJS_PATH)).length === 1 && !o.requests.some(u => /pdf\.(?:min|worker)|pdfjs-dist/.test(u) && !u.endsWith(PDFJS_PATH)), { traffic, registre: registryFiles('lecture-pdf') });
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}
{
  // Sans l’extension : le modèle habituel reste, le coin d’état dit pourquoi, rien d’extension ni de pdf.js n’est demandé.
  const o = await t.openPage({ seed: seedModels(), stub: GFS({ extensions: [] }), init: INIT + startReading('three'), ready: false });
  await saidBy(o.page, PHRASE.fr.off);
  await sleep(500);
  const v = await seen(o.page);
  check('l’extension éteinte au démarrage : le ★ reste ouvert, aucun PDF, aucun vierge, et le coin d’état dit pourquoi (en erreur)', !v.active && v.openedList.join() === '1' && v.name === 'Départ A défaut' && v.status === PHRASE.fr.off && v.statusClass === 'error-msg' && v.locked.length === 0, v);
  check('… et rien de la lecture de PDF n’est demandé au réseau (ni fichier de l’extension, ni pdf.js)', !o.requests.some(u => /extensions\/lecture-pdf|pdfjs/.test(u)), o.requests.filter(u => /lecture-pdf|pdfjs/.test(u)));
  await o.context.close();
}
{
  // Une lecture mal formée (raison `lire`, un fichier qui n’en est pas un) : jamais un modèle vierge à la place, l’ordre habituel.
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT + `window.__gfsStub.ouverture = { fichier: null, type: 'document', dossier: '', raison: 'lire', lecture: { id: 7, fichier: 'trois-pages.pdf' } };`, ready: false });
  await saidBy(o.page, PHRASE.fr.ready);
  await sleep(1500);
  const v = await seen(o.page);
  check('une ouverture `lire` mal formée, même avec le type « document » : le ★ s’ouvre, ni PDF ni document vierge à la place', !v.active && v.openedList.join() === '1' && v.name === 'Départ A défaut' && v.editorText === 'Contenu A', v);
  await o.context.close();
}
{
  // Un PDF illisible au démarrage : le modèle habituel reste.
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT + startReading('broken'), ready: false });
  await saidBy(o.page, PHRASE.fr.unreadable(NAME('broken')));
  await sleep(500);
  const v = await seen(o.page);
  check('un PDF illisible au démarrage : le ★ reste ouvert, le coin d’état dit que le PDF n’a pas pu être lu, aucun grisé', !v.active && v.openedList.join() === '1' && v.status === PHRASE.fr.unreadable(NAME('broken')) && v.statusClass === 'error-msg' && v.locked.length === 0 && v.modeEdit, v);
  await o.context.close();
}
{
  // Aucune lecture demandée : l'extension (et pdf.js) n'est pas chargée, même active et même donnée par GFS.
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT });
  await sleep(1000);
  check('sans PDF à lire, l’extension active ne charge rien (ni ses fichiers, ni pdf.js) : le poids n’est payé qu’au premier PDF', !o.requests.some(u => /extensions\/lecture-pdf|pdfjs/.test(u)), o.requests.filter(u => /lecture-pdf|pdfjs/.test(u)));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== L’appel `ouvrir` : le PDF dans la Lecture, ses grisés, le suivant, les refus, le mot de passe ==');
let beforePdf;
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT });
  const page = o.page;
  await hover(page, '#btn-save');
  check('témoin : sans PDF, le menu d’« Enregistrer » s’ouvre au survol de son bouton', await flyoutShown(page));
  await page.mouse.move(5, 5);
  beforePdf = await seen(page);

  let reply = await readCall(page, 'three');
  await settled(page);
  let v = await seen(page);
  check('`ouvrir` d’un PDF : GFS reçoit `{ ouvert: true }` quand le PDF est à l’écran (3 pages, texte de la première, noir dessiné)', opened(reply) && v.active && v.frames === 3 && v.firstText.includes('Bonjour, première page') && v.firstDark > 200, { reply, v });
  check('la Lecture est le seul mode : Édition grisé, éditeur caché, le coin d’état dit le PDF', v.readerShown && !v.editorShown && v.modeRead && !v.modeEdit && v.status === PHRASE.fr.opened(NAME('three'), 3), v);
  check('les commandes grisées le sont toutes (l’édition, les modèles, l’export, les commentaires), les autres restent actives (Nouveau, l’arbre des modèles, Lecture, Réglages)', same(v.locked, ALL_LOCKED) && same(v.stayingActive.slice().sort(), STAYS_ACTIVE.slice().sort()), { locked: v.locked, actifs: v.stayingActive });
  const reasons = [['btn-mode-edit', 'edit'], ['v2-save-group', 'template'], ['btn-delete', 'template'], ['v2-page-group', 'template'], ['v2-quality-group', 'export'], ['v2-export-pdf-group', 'export'], ['v2-btn-comment', 'comment']];
  check('chacune dit sa raison dans son info-bulle (`title`) : l’édition, les modèles, l’export, les commentaires', reasons.every(([id, why]) => v.titles[id] === PHRASE.fr[why]), v.titles);
  check('grisées comme un compte en lecture seule (opacité), sans la bulle de l’app (que l’estompage rendrait illisible) ; `aria-disabled` posé', v.opacity === '0.35' && v.bubble === 'none' && ALL_LOCKED.every(id => v.aria[id] === 'true'), { opacity: v.opacity, bubble: v.bubble, avant: beforePdf.bubble, aria: v.aria });
  check('la page tient dans le panneau 700 px (aucun défilement de côté) : l’ajustement d’origine réduit la feuille', v.scrollsInside && v.zoom > 0.5 && v.zoom < 1 && v.pageWidth <= v.readerWidth, { zoom: v.zoom, pageWidth: v.pageWidth, readerWidth: v.readerWidth });

  // La souris et le clavier : un clic sur une commande grisée ne fait rien et dit pourquoi ; le menu au survol ne s'ouvre pas.
  const edit = await boxOf(page, '#btn-mode-edit');
  await page.mouse.move(edit.x - 30, edit.y);
  await page.mouse.click(edit.x, edit.y);
  await sleep(300);
  v = await seen(page);
  check('un clic sur « Édition » ne change rien (la Lecture reste) et le coin d’état dit la raison', v.modeRead && !v.modeEdit && !v.editorShown && v.status === PHRASE.fr.edit, v);
  await hover(page, '#btn-save');
  check('au survol du bouton « Enregistrer » grisé, son menu ne s’ouvre pas', !(await flyoutShown(page)));
  const exportBox = await boxOf(page, '#v2-export-pdf-group');
  await page.mouse.click(exportBox.x, exportBox.y);
  await sleep(300);
  v = await seen(page);
  check('un clic sur « Exporter » grisé ne lance rien (aucune fenêtre) et dit la raison de l’export', v.status === PHRASE.fr.export && !(await dialogOf(page)).open && v.active, { status: v.status });
  await page.focus('#btn-save');
  await page.keyboard.press('Enter');
  await sleep(300);
  v = await seen(page);
  check('au clavier (Entrée sur « Enregistrer » grisé) : rien ne s’enregistre, aucune question, la raison des modèles dans le coin d’état', v.status === PHRASE.fr.template && !(await dialogOf(page)).open && v.active, { status: v.status });
  // Les raccourcis des commandes grisées ne font rien non plus : Ctrl+S n'enregistre pas, Alt+P n'exporte pas.
  const written = await writes(page);
  await page.focus('.pp-pdf-pages');
  await page.keyboard.press('Control+s');
  await sleep(400);
  await page.keyboard.press('Alt+p');
  await sleep(400);
  v = await seen(page);
  check('au clavier, Ctrl+S et Alt+P ne font rien d’un PDF : aucune fenêtre, rien d’écrit, le PDF reste à l’écran', !(await dialogOf(page)).open && (await writes(page)) === written && v.active && v.frames === 3, { written, now: await writes(page) });

  // Le texte du PDF se sélectionne à la souris (la couche de texte de pdf.js) : double-clic sur un mot.
  const word = await boxOf(page, '.pp-pdf-page .pp-pdf-text span');
  await page.mouse.dblclick(word.left + 8, word.y);
  const selection = await page.evaluate(() => getSelection().toString());
  check('le texte du PDF se sélectionne à la souris : un double-clic prend un mot de la première ligne', selection.trim().length > 0 && THREE[0].includes(selection.trim()), selection);

  // Le suivant remplace le premier, sans recharger l'app et sans question.
  const opened1 = v.openedList.length;
  reply = await readCall(page, 'other');
  await page.waitForFunction(() => PdfReading.isActive() && PdfReading.info().pages === 2 && PdfView.pagesShown().includes(1), null, { timeout: 30000 });
  v = await seen(page);
  check('un autre PDF remplace le premier : `{ ouvert: true }`, 2 pages, le texte du second, sans recharger l’app ni poser de question', opened(reply) && v.info.name === NAME('other') && v.frames === 2 && v.firstText.includes('Autre PDF, première page') && v.marker === 'avant' && !(await dialogOf(page)).open && v.openedList.length === opened1, { reply, v });
  check('… et le coin d’état dit le nouveau PDF', v.status === PHRASE.fr.opened(NAME('other'), 2), v.status);

  // Les refus : `{ ouvert: false }`, le PDF d'avant reste, le coin d'état dit pourquoi (en erreur).
  for (const [key, phrase, label] of [['empty', PHRASE.fr.empty(NAME('empty')), 'vide'], ['text', PHRASE.fr.notPdf(NAME('text')), 'qui n’est pas un PDF'], ['broken', PHRASE.fr.unreadable(NAME('broken')), 'illisible']]) {
    reply = await readCall(page, key);
    v = await seen(page);
    check(`un PDF ${label} : \`{ ouvert: false }\`, le PDF d’avant reste à l’écran, le coin d’état dit pourquoi`, refused(reply) && v.active && v.info.name === NAME('other') && v.status === phrase && v.statusClass === 'error-msg', { reply, status: v.status, info: v.info });
  }
  reply = await readCall(page, 'three', { lecture: null });
  v = await seen(page);
  check('une ouverture `lire` sans lecture : `{ ouvert: false }`, le PDF reste, aucun document vierge', refused(reply) && v.active && v.info.name === NAME('other') && v.openedList.length === opened1, { reply, v });

  // Le mot de passe : une fenêtre de l'app (champ masqué), jamais prompt() ; « Annuler » refuse, un mauvais mot de passe redemande.
  let pending = readCall(page, 'locked');
  await waitDialog(page);
  let d = await dialogOf(page);
  check('un PDF protégé : l’app demande le mot de passe dans sa fenêtre (champ masqué), avec le nom du PDF', d.open && d.inPanel && d.title === PHRASE.fr.passwordTitle && d.message === PHRASE.fr.passwordAsk(NAME('locked')) && d.inputShown && d.inputType === 'password', d);
  check('… et le PDF d’avant reste à l’écran pendant la question', (await seen(page)).info.name === NAME('other'));
  await clickDialog(page, 'Annuler');
  reply = await pending;
  v = await seen(page);
  check('« Annuler » : `{ ouvert: false }`, le PDF d’avant reste, le coin d’état dit que le PDF reste fermé', refused(reply) && v.info.name === NAME('other') && v.status === PHRASE.fr.password(NAME('locked')) && v.statusClass === 'error-msg', { reply, status: v.status });
  pending = readCall(page, 'locked');
  await waitDialogMessage(page, PHRASE.fr.passwordAsk(NAME('locked')));
  await page.keyboard.type('mauvais');
  await page.keyboard.press('Enter');
  await waitDialogMessage(page, PHRASE.fr.passwordAgain(NAME('locked')));
  check('un mauvais mot de passe : la fenêtre redemande, en le disant', (await dialogOf(page)).open);
  await page.keyboard.type('secret');
  await page.keyboard.press('Enter');
  reply = await pending;
  await page.waitForFunction(() => PdfReading.isActive() && PdfReading.info().name.startsWith('prot') && PdfView.pagesShown().includes(1), null, { timeout: 30000 });
  v = await seen(page);
  check('le bon mot de passe : `{ ouvert: true }`, le PDF protégé s’affiche (2 pages, son texte), la fenêtre est fermée', opened(reply) && v.info.name === NAME('locked') && v.frames === 2 && v.firstText.includes('Texte protégé') && !(await dialogOf(page)).open, { reply, v });

  // Un modèle qui s'ouvre ferme le PDF : tout est rendu, le mode d'avant (l'édition) revient.
  reply = await ask(page, MODEL(2));
  v = await seen(page);
  check('un modèle qui s’ouvre ferme le PDF : `{ ouvert: true }`, plus de feuilles, le modèle est dans l’éditeur, le mode d’avant (Édition) est revenu', opened(reply) && !v.active && !v.mounted && v.frames === 0 && String(v.current) === '2' && v.name === 'Départ B' && v.editorText === 'Contenu B' && v.modeEdit && v.editorShown && !v.readerShown, { reply, v });
  check('… plus rien n’est grisé : mêmes `title` et mêmes `aria-disabled` qu’avant le PDF, la bulle et l’opacité de l’app reviennent', v.locked.length === 0 && same(v.titles, beforePdf.titles) && same(v.aria, beforePdf.aria) && v.opacity === '1' && v.bubble === beforePdf.bubble, { titles: v.titles, aria: v.aria, opacity: v.opacity, bubble: v.bubble, avant: beforePdf.bubble });
  await hover(page, '#btn-save');
  check('… et le menu d’« Enregistrer » s’ouvre de nouveau au survol', await flyoutShown(page));
  await page.mouse.move(5, 5);

  // « Nouveau » ferme le PDF aussi (le bouton « Nouveau » reste actif pendant la lecture).
  await readCall(page, 'three');
  await settled(page);
  reply = await ask(page, { fichier: null, type: 'document', dossier: '', raison: 'nouveau' });
  v = await seen(page);
  check('« Nouveau » ferme le PDF et ouvre un document vierge (`{ ouvert: true }`), le mode d’avant revient', opened(reply) && !v.active && v.frames === 0 && (v.current === null || v.current === '') && v.modeEdit && v.locked.length === 0, { reply, v });

  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

console.log('\n== Resté en Lecture avant le PDF : on y reste quand un modèle s’ouvre ==');
{
  const o = await t.openPage({ seed: seedModels({ record: { id: 1, Nom: 'L1', Statut: 'Autre' } }), stub: GFS(), init: INIT });
  const page = o.page;
  const read = await boxOf(page, '#btn-mode-read');
  await page.mouse.move(read.x - 30, read.y);
  await page.mouse.click(read.x, read.y);
  await page.waitForFunction(() => document.getElementById('btn-mode-read').classList.contains('active'), null, { timeout: 5000 });
  await readCall(page, 'three');
  await settled(page);
  const reply = await ask(page, MODEL(3));
  await page.waitForFunction(() => document.getElementById('reader-container').textContent.includes('Contenu C'), null, { timeout: 10000 }).catch(() => {});
  const v = await seen(page);
  check('resté en Lecture avant le PDF : le modèle qui s’ouvre se dessine dans la Lecture (on y reste), le PDF est parti, plus rien n’est grisé', opened(reply) && !v.active && !v.mounted && v.frames === 0 && v.modeRead && !v.modeEdit && v.readerShown && !v.editorShown && v.readerText.includes('Contenu C') && v.locked.length === 0, { reply, v });
  await o.context.close();
}

console.log('\n== La ligne de la table qui change ne remplace pas le PDF ==');
{
  const ROW_RULES = { enabled: true, rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: '3' }], otherwise: 'default' };
  const o = await t.openPage({ seed: seedModels({ options: { modeleSelonLigne: ROW_RULES }, record: { id: 1, Nom: 'L1', Statut: 'Urgent' } }), stub: GFS(), init: INIT });
  const page = o.page;
  check('témoin : la ligne « Urgent » a ouvert le modèle C au démarrage', (await seen(page)).name === 'Départ C', await seen(page));
  await readCall(page, 'three');
  await settled(page);
  const before = (await seen(page)).openedList.length;
  await page.evaluate(() => { window.__root = document.querySelector('.pp-pdf-pages'); window.__gristStub.fireRecord({ id: 2, Nom: 'L2', Statut: 'Autre' }, 'PpDepart'); });
  await sleep(1500);
  const v = await seen(page);
  const kept = await page.evaluate(() => window.__root === document.querySelector('.pp-pdf-pages') && !!window.__root.isConnected);
  check('une autre ligne (dont la règle désigne le ★) : le PDF reste, posé une seule fois (mêmes feuilles), aucun modèle ne s’ouvre par-dessus', v.active && kept && v.info.name === NAME('three') && v.openedList.length === before, { opened: v.openedList, before, kept });
  await o.context.close();
}

console.log('\n== Des modifications en attente : la question se pose APRÈS la lecture du PDF ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT, storage: { pp_autosave_enabled: 'false' } });
  const page = o.page;
  const para = await boxOf(page, '.ProseMirror p');
  await page.mouse.click(para.right - 3, para.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' TAPÉ');
  await page.waitForFunction(() => document.getElementById('status-msg').classList.contains('is-unsaved'), null, { timeout: 5000 }).catch(() => {});
  let reply = await readCall(page, 'broken');
  let v = await seen(page);
  check('un PDF illisible avec des modifications en attente : `{ ouvert: false }` sans aucune question, le modèle garde ce qui a été tapé', refused(reply) && !(await dialogOf(page)).open && v.editorText.includes('TAPÉ') && !v.active, { reply, v });
  const answered = await page.evaluate(() => window.__gfsStub.answers.length);
  let pending = readCall(page, 'three');
  await waitDialog(page);
  let d = await dialogOf(page);
  v = await seen(page);
  check('un PDF lisible : la question « Enregistrer / Ne pas enregistrer / Annuler » se pose, dans le panneau, le modèle est encore là', d.open && d.inPanel && d.buttons.map(b => b.label).join('|') === 'Annuler|Ne pas enregistrer|Enregistrer' && !v.active && v.editorText.includes('TAPÉ'), { d, v });
  await sleep(600);
  check('GFS n’a pas de réponse tant que la personne n’a pas choisi', (await page.evaluate(() => window.__gfsStub.answers.length)) === answered);
  await clickDialog(page, 'Annuler');
  reply = await pending;
  v = await seen(page);
  check('« Annuler » : `{ ouvert: false }`, aucun PDF, le modèle garde ce qui a été tapé', refused(reply) && !v.active && v.editorText.includes('TAPÉ') && v.modeEdit, { reply, v });
  pending = readCall(page, 'three');
  await waitDialog(page);
  await clickDialog(page, 'Ne pas enregistrer');
  reply = await pending;
  await settled(page);
  v = await seen(page);
  check('« Ne pas enregistrer » : `{ ouvert: true }`, le PDF remplace le modèle (les modifications sont abandonnées), les grisés sont là', opened(reply) && v.active && v.info.name === NAME('three') && v.locked.length === ALL_LOCKED.length, { reply, v });
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== La Lecture épurée et le zoom valent pour un PDF, comme pour une feuille de la Lecture ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT });
  const page = o.page;
  await readCall(page, 'three');
  await settled(page);
  const width = () => page.evaluate(() => Math.round(document.querySelector('#reader-container .pp-pdf-page').getBoundingClientRect().width));
  const w0 = await width();
  // Ctrl + molette : la page s'élargit ; Ctrl + 0 rend l'ajustement au panneau.
  await page.mouse.move(350, 250);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -500);
  await page.keyboard.up('Control');
  await sleep(700);
  const w1 = await width();
  check('Ctrl + molette zoome le PDF comme une feuille de la Lecture : la page s’élargit', w1 > w0 + 40, { w0, w1 });
  await page.keyboard.press('Control+0');
  await sleep(700);
  const w2 = await width();
  check('Ctrl + 0 rend l’ajustement au panneau : la page retrouve sa largeur d’origine', Math.abs(w2 - w0) <= 2, { w0, w2 });

  // La Lecture épurée : cocher la ligne du menu, puis cliquer le bouton Mode lecture ; Échap en sort.
  await hover(page, '#btn-mode-read');
  const row = await boxOf(page, '#v2-btn-clean-reading');
  await page.mouse.move(row.x, row.y, { steps: 10 });
  await page.mouse.click(row.x, row.y);
  const button = await boxOf(page, '#btn-mode-read');
  await page.mouse.move(button.x, button.y, { steps: 8 });
  await page.mouse.click(button.x, button.y);
  await sleep(700);
  const state = () => page.evaluate(() => ({
    clean: document.body.classList.contains('pp-clean-reading'), toolbar: getComputedStyle(document.getElementById('toolbar-top')).display, exit: getComputedStyle(document.getElementById('btn-exit-clean-reading')).display,
    frames: document.querySelectorAll('#reader-container .pp-pdf-page').length, active: PdfReading.isActive(), shown: PdfView.pagesShown(), modeRead: document.getElementById('btn-mode-read').classList.contains('active'),
  }));
  let st = await state();
  check('la Lecture épurée garde le PDF : la barre est masquée, le bouton de sortie est là, les trois pages restent (la première dessinée)', st.clean && st.toolbar === 'none' && st.exit !== 'none' && st.frames === 3 && st.active && st.shown.includes(1), st);
  await page.keyboard.press('Escape');
  await sleep(700);
  st = await state();
  check('Échap en sort : la barre revient, le PDF est toujours là en mode Lecture, grisés compris', !st.clean && st.toolbar !== 'none' && st.frames === 3 && st.active && st.modeRead && same((await seen(page)).locked, ALL_LOCKED), st);
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Sans son moteur, avec un fichier qui n’arrive pas, avec un autre fichier, dans un vieux navigateur ==');
{
  // L'extension est active mais GFS ne donne pas pdf.js (`bibliotheques.pdfjs` absent) : le coin d'état le dit, rien n'est chargé.
  const o = await t.openPage({ seed: seedModels(), stub: GFS({ pdfjs: null }), init: INIT });
  const page = o.page;
  const before = await seen(page);
  const reply = await readCall(page, 'three');
  const v = await seen(page);
  check('GFS ne donne pas pdf.js : `{ ouvert: false }`, le coin d’état dit que la lecture n’a pas reçu son moteur (en erreur), le modèle reste, rien n’est grisé', refused(reply) && !v.active && v.status === PHRASE.fr.engine && v.statusClass === 'error-msg' && v.name === before.name && v.modeEdit && v.locked.length === 0, { reply, status: v.status, name: v.name });
  check('… et rien de la lecture n’est demandé au réseau (ni les fichiers de l’extension, ni pdf.js)', !o.requests.some(u => /extensions\/lecture-pdf|pdfjs/.test(u)), o.requests.filter(u => /lecture-pdf|pdfjs/.test(u)));
  await o.context.close();
}
{
  // Le fichier de GFS ne vient pas (réseau coupé un instant) : on le dit ; la reprise (le PDF rouvert) le redemande et le PDF s'ouvre, sans recharger les fichiers de l'extension déjà arrivés.
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT });
  const page = o.page;
  let attempts = 0;
  await page.route('**/vendor/pdfjs/1.0.0/pdfjs.js*', (route) => { attempts += 1; if (attempts === 1) route.abort('failed'); else route.continue(); });
  let reply = await readCall(page, 'three');
  let v = await seen(page);
  check('le fichier de pdf.js ne vient pas : `{ ouvert: false }`, le coin d’état dit que la lecture n’a pas pu se charger (en erreur), le modèle reste, rien n’est grisé', refused(reply) && !v.active && v.status === PHRASE.fr.loadFailed && v.statusClass === 'error-msg' && v.modeEdit && v.locked.length === 0, { reply, status: v.status });
  reply = await readCall(page, 'three');
  await settled(page);
  v = await seen(page);
  const traffic = o.requests.map(u => u.replace(/^https?:\/\/[^/]+\//, '')).filter(u => u.startsWith('extensions/lecture-pdf/')).sort();
  check('la reprise (le PDF rouvert) : `{ ouvert: true }`, le PDF est à l’écran, pdf.js est demandé une seconde fois, chaque fichier de l’extension n’est venu qu’une fois', opened(reply) && v.active && v.frames === 3 && attempts === 2 && same(traffic, registryFiles('lecture-pdf')), { reply, attempts, traffic });
  await o.context.close();
}
{
  // GFS donne un fichier qui n'est pas pdf.js (rien de ce qu'il faut sous `GfsPaquets.pdfjs`) : « sans moteur », pas un écran blanc.
  const body = 'globalThis.GfsPaquets = Object.assign(globalThis.GfsPaquets || {}, { pdfjs: { version: "0", modules: { "pdfjs-dist/build/pdf.min.mjs": {} } } });';
  const fake = { src: '/vendor/pdfjs/1.0.0/autre.js', integrite: 'sha384-' + createHash('sha384').update(body).digest('base64'), forme: 'module' };
  const o = await t.openPage({ seed: seedModels(), stub: GFS({ pdfjs: fake }), init: INIT });
  await o.page.route('**/vendor/pdfjs/1.0.0/autre.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body }));
  const reply = await readCall(o.page, 'three');
  const v = await seen(o.page);
  check('un fichier qui n’est pas pdf.js (ni `getDocument` ni `TextLayer`) : `{ ouvert: false }`, le coin d’état dit que le moteur manque (en erreur), le modèle reste', refused(reply) && !v.active && v.status === PHRASE.fr.engine && v.statusClass === 'error-msg' && v.modeEdit && v.locked.length === 0, { reply, status: v.status });
  await o.context.close();
}
{
  // Un navigateur d'avant `Map.prototype.getOrInsertComputed` (Chrome avant la 145, Firefox avant la 144) : pdf.js 6 échouerait à la première page, on le dit avant.
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: BASE + NO_METHODS + TRACK });
  const page = o.page;
  const reply = await readCall(page, 'three');
  const v = await seen(page);
  check('un navigateur trop ancien pour pdf.js 6 : `{ ouvert: false }`, le coin d’état dit de le mettre à jour (en erreur), le modèle reste, rien n’est grisé', refused(reply) && !v.active && v.status === PHRASE.fr.old && v.statusClass === 'error-msg' && v.modeEdit && v.locked.length === 0, { reply, status: v.status });
  await o.context.close();
}

console.log('\n== Un document en lecture seule lit un PDF ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT, search: '&readonly=true' });
  const page = o.page;
  const lockedBefore = await accessLocked(page);
  const writesBefore = await writes(page);
  const reply = await readCall(page, 'three');
  await settled(page);
  let v = await seen(page);
  check('un document en lecture seule lit un PDF : `{ ouvert: true }`, le PDF est à l’écran avec son texte', opened(reply) && v.active && v.frames === 3 && v.firstText.includes('Bonjour, première page') && v.modeRead && v.readerShown, { reply, v });
  check('… lire n’écrit rien dans le document (aucune ligne de modèle écrite)', (await writes(page)) === writesBefore, { avant: writesBefore, apres: await writes(page) });
  const lockedWith = await accessLocked(page);
  check('… et la lecture seule garde ses propres grisés, que le PDF n’efface pas', lockedBefore.length > 0 && same(lockedWith, lockedBefore), { lockedBefore, lockedWith });
  const back = await ask(page, MODEL(2));
  v = await seen(page);
  check('un modèle qui s’ouvre ferme le PDF (`{ ouvert: true }`), plus rien n’est grisé par le PDF, la lecture seule garde ses grisés', opened(back) && !v.active && v.locked.length === 0 && v.name === 'Départ B' && same(await accessLocked(page), lockedBefore), { back, v });
  check('aucune boîte native (confirm / alert / prompt) n’a été posée', o.natives.length === 0, o.natives);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Quarante pages, des formats mêlés ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT });
  const page = o.page;
  const reply = await readCall(page, 'long');
  await settled(page);
  await sleep(1000);
  let v = await seen(page);
  check('quarante pages : les quarante feuilles sont là d’emblée (le défilement a sa hauteur vraie), mais seules celles qui approchent de l’écran sont dessinées', opened(reply) && v.frames === 40 && v.shown.includes(1) && v.shown.length <= 6 && !v.shown.includes(40), { shown: v.shown, frames: v.frames });
  // On parcourt le document par bonds : la mémoire reste bornée (huit pages dessinées au plus), les pages lointaines redeviennent des feuilles blanches.
  for (const n of [12, 24, 36, 40]) {
    await page.evaluate(n => document.querySelectorAll('#reader-container .pp-pdf-page')[n - 1].scrollIntoView({ block: 'center' }), n);
    await page.waitForFunction(n => PdfView.pagesShown().includes(n), n, { timeout: 30000 });
  }
  await sleep(800);
  v = await seen(page);
  const first = await page.evaluate(() => { const f = document.querySelector('#reader-container .pp-pdf-page'); return { canvas: !!f.querySelector('canvas'), text: !!f.querySelector('.pp-pdf-text'), rendered: f.dataset.rendered || null }; });
  check('après quatre bonds jusqu’à la fin : la dernière page est dessinée, au plus huit pages le restent, la première est redevenue une feuille blanche (ni toile, ni texte)', v.shown.includes(40) && v.shown.length <= 8 && !v.shown.includes(1) && !first.canvas && !first.text && first.rendered === null, { shown: v.shown, first });
  await page.evaluate(() => { document.getElementById('reader-container').scrollTop = 0; });
  await page.waitForFunction(() => PdfView.pagesShown().includes(1), null, { timeout: 30000 });
  await sleep(300);
  v = await seen(page);
  check('revenu au début : la première page se redessine, texte compris, et rien ne défile de côté', v.shown.includes(1) && v.firstText.includes('Page 1 sur 40') && v.firstDark > 100 && v.scrollsInside, { shown: v.shown, text: v.firstText });
  await o.context.close();
}
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT });
  const page = o.page;
  const reply = await readCall(page, 'mixed');
  await settled(page);
  await page.waitForFunction(() => PdfView.pagesShown().includes(2), null, { timeout: 30000 });
  await sleep(500);
  const m = await page.evaluate(() => {
    const r = document.getElementById('reader-container');
    const frames = Array.from(r.querySelectorAll('.pp-pdf-page')).map(f => Math.round(f.getBoundingClientRect().width));
    return { widest: r.getAttribute('data-pp-widest-sheet'), frames, readerWidth: r.clientWidth, scrollsInside: r.scrollWidth <= r.clientWidth + 1, zoom: parseFloat(getComputedStyle(r.querySelector('.pp-pdf-page')).zoom) };
  });
  check('des pages de formats mêlés (portrait, puis paysage) : la plus large (1123 px) fixe l’ajustement au panneau, la portrait est plus étroite que la paysage, aucune ne dépasse, rien ne défile de côté', opened(reply) && m.widest === '1123' && m.frames.length === 2 && m.frames[0] < m.frames[1] && m.frames[1] <= m.readerWidth && m.scrollsInside && m.zoom < 1, m);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== En anglais, en thème sombre ==');
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT, lang: 'en', colorScheme: 'dark' });
  const page = o.page;
  let reply = await readCall(page, 'three');
  await settled(page);
  let v = await seen(page);
  check('en anglais : le PDF s’ouvre, le coin d’état et le nom des pages sont dans la langue (« Page 1 of 3 »)', opened(reply) && v.active && v.status === PHRASE.en.opened(NAME('three'), 3) && v.labels[0] === PHRASE.en.page(1, 3) && v.labels[2] === PHRASE.en.page(3, 3), { reply, status: v.status, labels: v.labels });
  check('… les commandes grisées disent leur raison en anglais', v.titles['btn-mode-edit'] === PHRASE.en.edit && v.titles['v2-save-group'] === PHRASE.en.template && v.titles['v2-export-pdf-group'] === PHRASE.en.export && v.titles['v2-btn-comment'] === PHRASE.en.comment, v.titles);
  const paper = await page.evaluate(() => { const rgb = s => (s.match(/\d+/g) || []).slice(0, 3).map(Number); return { page: rgb(getComputedStyle(document.querySelector('.pp-pdf-page')).backgroundColor), around: rgb(getComputedStyle(document.getElementById('reader-container')).backgroundColor) }; });
  check('en thème sombre, la page du PDF reste blanche (c’est le papier) sur un fond sombre', same(paper.page, [255, 255, 255]) && paper.around.reduce((a, b) => a + b, 0) < 3 * 140, paper);
  for (const [key, phrase] of [['empty', PHRASE.en.empty(NAME('empty'))], ['text', PHRASE.en.notPdf(NAME('text'))], ['broken', PHRASE.en.unreadable(NAME('broken'))]]) {
    reply = await readCall(page, key);
    v = await seen(page);
    check(`en anglais, « ${NAME(key)} » : \`{ ouvert: false }\` et la phrase du refus dans la langue`, refused(reply) && v.status === phrase && v.statusClass === 'error-msg' && v.info.name === NAME('three'), { reply, status: v.status });
  }
  const pending = readCall(page, 'locked');
  await waitDialog(page);
  const d = await dialogOf(page);
  check('le mot de passe se demande en anglais, dans le panneau, champ masqué', d.open && d.inPanel && d.title === PHRASE.en.passwordTitle && d.message === PHRASE.en.passwordAsk(NAME('locked')) && d.inputType === 'password', d);
  await clickDialog(page, 'Cancel');
  reply = await pending;
  v = await seen(page);
  check('« Cancel » : `{ ouvert: false }`, le coin d’état dit que le PDF reste fermé, en anglais', refused(reply) && v.status === PHRASE.en.password(NAME('locked')) && v.statusClass === 'error-msg', { reply, status: v.status });
  await o.context.close();
}
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS({ extensions: [] }), init: INIT, lang: 'en' });
  const reply = await readCall(o.page, 'three');
  const v = await seen(o.page);
  check('en anglais, l’extension éteinte : `{ ouvert: false }` et le coin d’état dit pourquoi, dans la langue', refused(reply) && v.status === PHRASE.en.off && v.statusClass === 'error-msg' && !v.active, { reply, status: v.status });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Seule (adresse sans `gfs=`) : rien ne change ==');
{
  const o = await t.openPage({
    hosted: false, seed: seedModels(),
    init: BASE + POLYFILL + `window.__sent = []; const original = window.postMessage.bind(window); window.postMessage = function (message, ...rest) { if (message && typeof message === 'object' && 'gfs' in message) window.__sent.push(message); return original(message, ...rest); };`,
  });
  const page = o.page;
  await page.evaluate((src) => window.postMessage({ gfs: 0, type: 'appel', id: 7, nom: 'ouvrir', args: { fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: { id: 'pdf-1', fichier: window.__makeFile(src) } } }, '*'), fileSrc('three'));
  await sleep(1200);
  const v = await seen(page);
  const solo = await page.evaluate(() => ({ opening: GfsLink.opening(), hosted: GfsLink.hosted, active: Extensions.isActive('lecture-pdf'), sent: window.__sent.length }));
  check('seule : un appel `ouvrir` qui porte un PDF n’ouvre rien et ne reçoit aucune réponse (le ★ reste, aucun grisé, la barre est celle d’avant)', !v.active && v.name === 'Départ A défaut' && v.modeEdit && v.locked.length === 0 && v.status === PHRASE.fr.ready && solo.sent === 1 && solo.opening === null && solo.hosted === false && solo.active === false, { v, solo });
  check('… et rien de la lecture n’est demandé au réseau', !o.requests.some(u => /extensions\/lecture-pdf|pdfjs/.test(u)), o.requests.filter(u => /lecture-pdf|pdfjs/.test(u)));
  await o.context.close();
}

console.log('\n== Dans le cadre isolé de GFS (sans `allow-same-origin`) ==');
{
  // L'app est dans un <iframe> sans `allow-same-origin`, comme chez GFS : pdf.js ne peut créer aucun Worker (il prend son faux Worker) et le `File` traverse le cadre par `postMessage`.
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: BASE + POLYFILL, framed: true });
  const { page, app } = o;
  const reply = await readCall(page, 'three');
  await app.waitForFunction(() => { try { return PdfReading.isActive() && PdfView.pagesShown().includes(1); } catch (e) { return false; } }, null, { timeout: 40000 });
  const v = await seen(app);
  check('dans le cadre isolé : `{ ouvert: true }`, le PDF est à l’écran (3 pages, texte de la première, noir dessiné), les grisés sont là', opened(reply) && v.active && v.frames === 3 && v.firstText.includes('Bonjour, première page') && v.firstDark > 200 && same(v.locked, ALL_LOCKED), { reply, v });
  check('… sans aucun Worker (le moteur tourne dans le cadre), et pdf.js n’est demandé qu’une fois, par la source de GFS', v.workers === 0 && page.workers().length === 0 && o.requests.filter(u => u.endsWith(PDFJS_PATH)).length === 1, { workers: v.workers, requests: o.requests.filter(u => /pdfjs/.test(u)) });
  const next = await readCall(page, 'other');
  await app.waitForFunction(() => { try { return PdfReading.info().pages === 2 && PdfView.pagesShown().includes(1); } catch (e) { return false; } }, null, { timeout: 40000 });
  const w = await seen(app);
  check('le suivant remplace le premier dans le cadre isolé (`{ ouvert: true }`, deux pages, son texte)', opened(next) && w.info.name === NAME('other') && w.firstText.includes('Autre PDF, première page'), { next, w });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Le code : ni adresse, ni import dynamique, ni boîte native, rien à ajouter à la politique de sécurité ==');
{
  const read = rel => readFileSync(join(ROOT, rel), 'utf8');
  const mine = ['js/pdf-reading.js', 'extensions/lecture-pdf/pdf-engine.js', 'extensions/lecture-pdf/pdf-view.js'];
  const withoutComments = rel => read(rel).replace(/(^|\s)\/\/.*$/gm, '$1');
  check('aucune adresse dans le code de la lecture (ni CDN, ni dépôt : pdf.js vient de GFS, par la source de son contexte)', mine.every(rel => !/https?:\/\//.test(read(rel))), mine.filter(rel => /https?:\/\//.test(read(rel))));
  // `Dialogs.prompt(...)` est la fenêtre de l'app : seuls `prompt()` / `confirm()` / `alert()` seuls ou posés sur `window` sont les boîtes du navigateur.
  const forbidden = /\bimport\s*\(|workerSrc|(?<![.\w])(?:prompt|confirm|alert)\s*\(|\bwindow\.(?:prompt|confirm|alert)\s*\(|console\.log|\beval\s*\(|new Function/;
  check('ni `import()`, ni `workerSrc`, ni boîte native (`prompt` / `confirm` / `alert`), ni `console.log`, ni `eval` dans ce code (hors commentaires)', mine.every(rel => !forbidden.test(withoutComments(rel))), mine.filter(rel => forbidden.test(withoutComments(rel))));
  check('… et le mot de passe d’un PDF se demande par la fenêtre de saisie de l’app (`Dialogs.prompt`, champ masqué)', /Dialogs\.prompt\(\{[\s\S]*secret: true/.test(withoutComments('js/pdf-reading.js')));
  const engine = withoutComments('extensions/lecture-pdf/pdf-engine.js');
  check('pdf.js est ouvert comme GFS l’a mesuré : `isEvalSupported: false`, `verbosity: 0`, les octets en `data`, la tâche détruite à la fermeture (`destroy`)', /getDocument\(\{[^}]*data: bytes[^}]*isEvalSupported: false[^}]*verbosity: 0[^}]*\}\)/.test(engine) && /task\.destroy\(\)/.test(engine));
  const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(read('index.html'));
  check('la politique de sécurité d’`index.html` ne nomme pas pdf.js (rien à y ajouter : le fichier vient de la même origine que l’app)', !!csp && !/pdfjs/i.test(csp[1]), csp && csp[1].length);
  const onDisk = readdirSync(join(ROOT, 'extensions', 'lecture-pdf')).sort();
  const registered = registryFiles('lecture-pdf').map(f => f.replace(/^extensions\/lecture-pdf\//, '').replace(/\?v=.*$/, '')).sort();
  check('chaque fichier du dossier de l’extension est dans le registre (et réciproquement), aucun ne commence par `_` ou `.`', same(onDisk, registered) && onDisk.every(f => !/^[_.]/.test(f)), { onDisk, registered });
  check('`index.html` charge `js/pdf-reading.js` après `js/extensions.js`', (() => { const html = read('index.html'); const a = html.indexOf('js/extensions.js'); const b = html.indexOf('js/pdf-reading.js'); return a > 0 && b > a; })());
  const sizes = Object.fromEntries(registered.map(f => [f, readFileSync(join(ROOT, 'extensions', 'lecture-pdf', f)).length]));
  console.log('  poids des fichiers de l’extension (octets) :', JSON.stringify(sizes), '- total', Object.values(sizes).reduce((a, b) => a + b, 0));
}

await t.finish();
