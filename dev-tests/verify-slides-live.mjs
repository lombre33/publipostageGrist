#!/usr/bin/env node
// Les diapositives liées « À la frappe » (js/slide-links-live.js, avec le socle js/slide-links.js ; choix du 21/10 pour l'import lié) : deux pages du widget, chacune avec sa présentation
// à l'écran, qui partagent UNE table du direct (dev-tests/live-test-kit.mjs), GFS simulé avec les extensions « diapositives » et « édition », enregistrement automatique coupé (seule
// la table du direct relie les deux pages). A montre « Source », B montre « Cible », dont la diapositive 2 est liée à la diapositive 2 de « Source ».
//  LA PRÉSENCE : chaque page pose sa ligne sur le canal de « Source », rien n'est enregistré ;
//  DE LA SOURCE À LA CIBLE : ce que A tape dans sa diapositive 2 arrive dans celle de B pendant la frappe, sans la rendre « à enregistrer », hors de son historique (Ctrl+Z ne le rend pas) ;
//  DE LA CIBLE À LA SOURCE : ce que B tape dans sa diapositive liée arrive chez A ; un Ctrl+Z de A ne défait que sa propre frappe, et B le reçoit aussi ;
//  LE CURSEUR RESTE : A tape dans sa diapositive 3 pendant que B tape dans la 2 ; les deux frappes sont là, celle de A à sa place ;
//  « DEMANDER » : les deux pages tapent dans la diapositive 2 sans se lire (cachées) ; revenues, chacune montre la fenêtre ; « Garder celle d'ici » chez A : B prend la version de A
//   et sa fenêtre se ferme d'elle-même ;
//  APRÈS L'ENREGISTREMENT : A enregistre une version venue de B, B continue de taper, puis relit les modèles : aucun désaccord (la version enregistrée est une des siennes) ;
//  PARTIR : B passe à un document, sa ligne part ; A tape, plus rien ne part ;
//  GARDES : ni erreur de page, ni boîte native.
// Vraie souris et vrai clavier, 700x400, français clair. Lancé par run-headless.mjs (groupe Node "slidesLive", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-live.mjs
import { deflateSync } from 'node:zlib';
import { startKit, until, dialogShown, pressDialogButton } from './live-test-kit.mjs';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// Une image PNG unie de 24 x 16 non compressée (plus de 1 024 signes en base64 : elle voyage en renvoi « pp-media: »).
function png(rgb) {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
  const head = Buffer.alloc(13); head.writeUInt32BE(24, 0); head.writeUInt32BE(16, 4); head.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.concat(Array.from({ length: 16 }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 24 }, () => rgb).flat())])));
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows, { level: 0 })), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const PHOTO = png([200, 40, 40]);
const NEW_PHOTO = png([40, 120, 200]);
const img = src => `<p><img class="editor-image" src="${src}" alt="" style="width: 48px; height: 32px" data-layer="normal" data-wrap="inline"></p>`;
const KEY = 'JetonSource7';
const SLIDE = 'deuxsource01';
const tag = attrs => `<div class="pp-slide-link" contenteditable="false" aria-hidden="true" ${attrs}></div>`;
// 7 « Source » : trois diapositives, la deuxième source d'un lien ; 8 « Cible » : trois diapositives, la deuxième liée à celle de « Source » (même texte : la synchro de l'ouverture pose
// sa base) ; 9 « Note » : un document.
const templatesFor = open => [
  { id: 7, nom: 'Source', type: 'presentation', def: open === 7, contenu: `<p>Source un</p>${BR}<h2>Deux titre</h2><p>Deux texte</p>${img(PHOTO)}${tag(`data-slide-id="${SLIDE}"`)}${BR}<p>Source trois</p>` },
  { id: 8, nom: 'Cible', type: 'presentation', def: open === 8, contenu: `<p>Cible un</p>${BR}<h2>Deux titre</h2><p>Deux texte</p>${img(PHOTO)}${tag(`data-link-model="7" data-link-key="${KEY}" data-link-slide="${SLIDE}" data-link-mode="both"`)}${BR}<p>Cible trois</p>` },
  { id: 9, nom: 'Note', type: 'document', def: false, contenu: '<p>Une note</p>' },
];
// L'enregistrement automatique coupé, le jeton de « Source » posé (celui que l'import lié écrit).
const INIT = `try { localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) {}
  const rows = stub.state.rows.Publipostage_Modeles; rows.Jeton = rows.id.map(id => (id === 7 ? ${JSON.stringify(KEY)} : ''));`;

const kit = await startKit({ port: Number(process.env.SLIDES_LIVE_PORT || 8955), tag: 'slides-live' });
const table = kit.newTable();
const open = id => kit.openPage({ table, templates: templatesFor(id), extensions: ['diapositives', 'edition'], identity: { name: id === 7 ? 'Alice' : 'Bob', email: id === 7 ? 'alice@example.com' : 'bob@example.com' }, extraInit: INIT });
const A = await open(7);
const B = await open(8);
const pa = A.page;
const pb = B.page;

// L'appel `ouvrir` de GFS (la présentation `id` à l'écran), puis la bande de ses trois miniatures.
async function show(page, id) {
  await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id), sleep(20000)]);
  await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n) && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === 3, id, { timeout: 20000 }).catch(() => {});
  await sleep(500);
}
await show(pa, 7);
await show(pb, 8);

// Les outils d'une page : un clic à la vraie souris sur la première lettre d'un bloc de l'éditeur (son texte entier), amené à l'écran, puis Fin ; la frappe au clavier.
function toolsOf(page) {
  const clickText = async (text) => {
    const c = await page.evaluate((whole) => {
      const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
      if (!block) return null;
      block.scrollIntoView({ block: 'center' });
      const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 1);
      const r = range.getBoundingClientRect();
      return { x: r.left + 1, y: r.top + r.height / 2 };
    }, text);
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await page.mouse.move(c.x - 10, c.y);
    await page.mouse.move(c.x, c.y, { steps: 2 });
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    await page.keyboard.press('End');
  };
  const type = async (text) => { await page.keyboard.type(text, { delay: 30 }); await sleep(150); };
  const press = async (key) => { await page.keyboard.press(key); await sleep(250); };
  // Le texte de chaque bloc de l'éditeur, et la diapositive où est le curseur (son rang, d'après les sauts de page).
  const blocks = () => page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap > *')).filter(el => !el.classList.contains('page-break-marker') && !el.classList.contains('pp-slide-link')).map(el => el.textContent));
  const cursorSlide = () => page.evaluate(() => {
    const state = EditorCore.getEditor().state;
    let n = 0;
    state.doc.forEach((node, pos) => { if (node.type.name === 'pageBreak' && pos < state.selection.from) n++; });
    return n;
  });
  const unsaved = () => page.evaluate(() => document.getElementById('status-msg').classList.contains('is-unsaved'));
  const hasBlock = (text, timeout = 4000) => page.waitForFunction(whole => Array.from(document.querySelectorAll('#editor-container .tiptap > *')).some(el => el.textContent === whole), text, { timeout }).then(() => true, () => false);
  return { clickText, type, press, blocks, cursorSlide, unsaved, hasBlock };
}
const a = toolsOf(pa);
const b = toolsOf(pb);
// Cacher une page (ou la remontrer) : une page cachée ne lit plus la table.
const hide = (page, hidden) => page.evaluate((flag) => {
  if (flag) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); else delete document.visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
const askOf = page => page.evaluate(() => {
  const win = document.getElementById('pp-slide-link-ask');
  if (!win || win.style.display === 'none' || win.getBoundingClientRect().height === 0) return null;
  return { message: win.querySelector('.pp-slide-link-ask-message').textContent, buttons: Array.from(win.querySelectorAll('button')).filter(x => x.getBoundingClientRect().width > 0).map(x => x.textContent) };
});
const clickButton = async (page, label) => {
  const c = await page.evaluate((text) => {
    const button = Array.from(document.querySelectorAll('#pp-slide-link-ask button')).find(x => x.textContent === text && x.getBoundingClientRect().width > 0);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  if (!c) throw new Error('bouton introuvable : ' + label);
  await page.mouse.move(c.x - 10, c.y);
  await page.mouse.move(c.x, c.y, { steps: 2 });
  await page.mouse.click(c.x, c.y);
  await sleep(300);
};
const saves = page => page.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
const rowsOn = doc => table.rows.filter(row => row.Doc === doc && row.Kind === 'l');

// --- La présence.
await sleep(2600);
const present = rowsOn('slides:7');
check('chaque page pose sa ligne sur le canal de « Source » (Doc « slides:7 », Kind « l »), vide', present.length === 2 && present.every(row => JSON.parse(row.Data).slides.length === 0),
  present.map(row => ({ client: row.Client, data: row.Data })));
check('rien n\'est enregistré, aucune page n\'est « à enregistrer »', (await saves(pa)) === 0 && (await saves(pb)) === 0 && !(await a.unsaved()) && !(await b.unsaved()));

// --- De la source à la cible.
await a.clickText('Deux texte');
let at = Date.now();
await a.type(' vu');
const arrived = await b.hasBlock('Deux texte vu');
const delay = Date.now() - at;
check('ce que A tape dans la diapositive source arrive chez B pendant la frappe (moins de 4 s)', arrived, { delay, blocks: await b.blocks() });
check('chez B, la version arrivée ne rend pas la présentation « à enregistrer »', !(await b.unsaved()));
const photos = page => page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap img.editor-image')).map(el => el.getAttribute('src')));
const sentA = table.rows.filter(row => row.Doc === 'slides:7' && row.Kind === 'l').map(row => JSON.parse(row.Data)).find(data => data.slides.length);
check('l’image de la diapositive voyage en renvoi (« pp-media: »), sans être jointe : l’enregistrement de « Source » la porte déjà ; B la garde',
  !!sentA && sentA.slides.some(slide => /src="pp-media:[a-z0-9]+"/.test(slide.html)) && Object.keys(sentA.media).length === 0 && JSON.stringify(await photos(pb)) === JSON.stringify([PHOTO]),
  { media: sentA && Object.keys(sentA.media), photos: (await photos(pb)).map(src => src.length) });
await b.clickText('Cible un');
await b.press('Control+z');
check('chez B, Ctrl+Z ne rend pas la version arrivée (hors de son historique)', (await b.blocks()).includes('Deux texte vu') && (await b.blocks()).includes('Cible un'), await b.blocks());

// --- De la cible à la source.
await b.clickText('Deux texte vu');
await b.type(' ici');
check('ce que B tape dans sa diapositive liée arrive chez A', await a.hasBlock('Deux texte vu ici'), await a.blocks());
await a.clickText('Source un');
await a.press('Control+z');
check('chez A, Ctrl+Z défait sa propre frappe seulement (« vu »), pas celle arrivée de B', await a.hasBlock('Deux texte ici', 1500), await a.blocks());
check('B reçoit le Ctrl+Z de A', await b.hasBlock('Deux texte ici'), await b.blocks());

// --- Le curseur reste.
await a.clickText('Source trois');
await a.type('X');
await b.clickText('Deux texte ici');
await b.type(' encore');
const crossed = await a.hasBlock('Deux texte ici encore');
await a.type('Y');
check('A tape dans sa diapositive 3 pendant que B tape dans la 2 : les deux frappes sont là, celle de A à sa place, son curseur dans la 3',
  crossed && (await a.blocks()).includes('Source troisXY') && (await a.cursorSlide()) === 2, { blocks: await a.blocks(), slide: await a.cursorSlide() });

// --- « Demander ».
await hide(pa, true);
await hide(pb, true);
await sleep(2200);
await a.clickText('Deux texte ici encore');
await a.type(' A');
await b.clickText('Deux texte ici encore');
await b.type(' B');
await sleep(1500);
await hide(pa, false);
await hide(pb, false);
// La fenêtre « Demander » d'une page, attendue (ou partie : `gone`).
const waitAsk = async (page, gone = false) => { for (let i = 0; i < 30; i++) { if (!(await askOf(page)) === gone) return true; await sleep(200); } return false; };
const askA = await waitAsk(pa);
const askB = await waitAsk(pb);
const shownA = await askOf(pa);
const shownB = await askOf(pb);
check('changée des deux côtés sans se lire : chacune des deux pages montre la fenêtre « Demander »', askA && askB && !!shownA && !!shownB, { shownA, shownB });
await clickButton(pa, 'Garder celle d’ici');
check('« Garder celle d’ici » chez A : B prend la version de A', await b.hasBlock('Deux texte ici encore A'), await b.blocks());
const closedB = await waitAsk(pb, true);
check('la fenêtre de B se ferme d’elle-même (il n’y a plus de désaccord), celle de A aussi', closedB && !(await askOf(pa)), { a: await askOf(pa), b: await askOf(pb) });
check('A garde sa version', (await a.blocks()).includes('Deux texte ici encore A'), await a.blocks());

// --- Après l'enregistrement.
await b.clickText('Deux texte ici encore A');
await b.type(' fin');
const finArrived = await a.hasBlock('Deux texte ici encore A fin');
await a.clickText('Source un');
const before = await saves(pa);
await a.press('Control+s');
await pa.waitForFunction(n => window.__gristStub.countSaves('Publipostage_Modeles') > n, before, { timeout: 10000 }).catch(() => {});
await sleep(500);
await b.clickText('Deux texte ici encore A fin');
await b.type(' plus');
const plusArrived = await a.hasBlock('Deux texte ici encore A fin plus');
// La lecture des modèles que l'enregistrement automatique ferait : B relit « Source », enregistrée avec la version « fin » de B.
await pb.evaluate(async () => { await Templates.loadAll(); SlideLinks.follow(EditorCore.getEditor(), false); });
await sleep(600);
const info = await pb.evaluate(() => { const i = SlideLinks.infoAt(EditorCore.getEditor(), 1); return i ? { kind: i.kind, differs: i.differs } : null; });
check('A enregistre une version venue de B, B tape encore puis relit les modèles : aucun désaccord, aucune fenêtre', finArrived && plusArrived && !!info && info.kind === 'target' && !info.differs && !(await askOf(pb)),
  { finArrived, plusArrived, info, ask: await askOf(pb) });

// --- Une image nouvelle : jointe à la ligne, elle arrive chez B.
await pa.evaluate((src) => {
  const editor = EditorCore.getEditor();
  let breaks = 0;
  let at = null;
  editor.state.doc.forEach((node, pos) => { if (node.type.name === 'pageBreak' && ++breaks === 2) at = pos; });
  editor.chain().insertContentAt(at, { type: 'paragraph', content: [{ type: 'editorImage', attrs: { src, layer: 'normal', wrap: 'inline' } }] }).run();
}, NEW_PHOTO);
const newArrived = await pb.waitForFunction(src => Array.from(document.querySelectorAll('#editor-container .tiptap img.editor-image')).some(el => el.getAttribute('src') === src), NEW_PHOTO, { timeout: 4000 }).then(() => true, () => false);
const withMedia = table.rows.filter(row => row.Doc === 'slides:7' && row.Kind === 'l').map(row => JSON.parse(row.Data)).find(data => Object.keys(data.media).length);
check('une image nouvelle dans la diapositive source est jointe à la ligne, et arrive chez B', newArrived && !!withMedia && Object.values(withMedia.media).includes(NEW_PHOTO),
  { newArrived, media: withMedia ? Object.keys(withMedia.media) : null });

// --- Partir.
// « Cible » a des frappes à enregistrer : la question de l'app, « Enregistrer ».
const leaving = pb.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '9', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })).catch(() => {});
await pb.waitForFunction(dialogShown, null, { timeout: 5000 }).catch(() => {});
await pressDialogButton(pb, 'Enregistrer');
await Promise.race([leaving, sleep(20000)]);
await until(pb, () => String(Templates.getCurrentId()) === '9');
await sleep(2600);
const left = rowsOn('slides:7').map(row => row.Client);
check('B passe à un document : sa ligne part, celle de A reste', left.length === 1, left);
const writes = table.writeLog.length;
await a.clickText('Source un');
await a.type(' seule');
await sleep(1800);
check('A tape seule : plus rien ne part à la table du direct', table.writeLog.slice(writes).every(entry => !entry.actions.some(action => action[0] === 'BulkAddOrUpdateRecord' && JSON.stringify(action[3] || {}).includes('"Data"'))),
  table.writeLog.slice(writes).map(entry => entry.actions.map(action => action[0])));

// --- Gardes.
check('ni erreur de page, ni boîte native', kit.pageErrors.length === 0 && A.natives.length === 0 && B.natives.length === 0, { errors: kit.pageErrors, natives: [...A.natives, ...B.natives] });

await kit.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
