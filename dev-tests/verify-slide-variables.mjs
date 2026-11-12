#!/usr/bin/env node
// UNE DIAPOSITIVE EN BLOC QUI PARLE D'UNE LIGNE (13/11, demande d'Antoine : « mon numéro de page apparaît en # vert ; et pour les autres variables, même résolution que le document ? », carte « Redessiné par ligne »).
// Une diapositive posée « En bloc » (extensions/diapositives/slide-raster.js) est une photo ; quand elle porte une variable (une bulle #Variable, un calcul, une puce de date ou de nom, une condition, une image de
// colonne), le bloc garde aussi la diapositive elle-même (`slideSource`, js/slide-copies.js) : l'éditeur montre la photo (avec la bulle, comme le document la montre en Édition), la Lecture et les exports la redessinent
// POUR LA LIGNE qu'ils écrivent (js/reader-mode.js : `resolveSlideBlocks`) - « Bonjour Alice » à la ligne d'Alice, « Bonjour Bruno » à celle de Bruno -, sans la pastille de la bulle.
// À la vraie souris, 700x400, français clair, l'app dans le cadre isolé de GFS : « Devis » à l'écran, la ligne d'Alice (table PpDepart), la présentation « Support » (diapositive 1 : un bandeau bleu et « Bonjour #PpDepart.Nom » ;
// diapositive 2 : « Sans variable »).
//  - la diapositive qui parle d'une ligne est posée avec sa diapositive (`slideSource`, rang et nombre de diapositives compris) ; celle qui n'en parle pas, non (le document ne grossit pas) ; la photo de l'éditeur montre la bulle ;
//  - enregistré puis relu (assaini, relu par l'éditeur), le bloc garde sa diapositive ;
//  - à la Lecture, la photo est redessinée pour la ligne d'Alice : le texte du bloc dit « Bonjour Alice », la bulle a disparu de l'image, la diapositive n'est plus dans le HTML de sortie ; l'autre bloc n'est pas touché ;
//  - un export (ReaderMode.preview) pour deux lignes donne deux photos différentes (Alice, Bruno), la même ligne deux fois la même photo (sans nouveau dessin) ; l'éditeur, lui, n'a pas bougé ;
//  - « Garder liée » : le bloc lié porte aussi sa diapositive, et quand la source change ailleurs il la reprend ;
//  - en anglais, thème sombre, la Lecture redessine de même.
// Lancé par run-headless.mjs (groupe Node « slideVariables », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-variables.mjs
// `SLIDE_VARIABLES_SHOTS=<dossier>` enregistre l'image du bloc à l'éditeur, à la ligne d'Alice et à celle de Bruno.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-variables', port: Number(process.env.SLIDE_VARIABLES_PORT || 9142) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SLIDE_VARIABLES_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const save = (name, dataUrl) => { if (SHOTS && dataUrl) writeFileSync(join(SHOTS, name + '.png'), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')); };
const ACTIVE = ['graphique', 'diapositives'];

// Les gestes à la vraie souris et au vrai clavier : les éléments se lisent dans le cadre de l'app (`app`), la souris et le clavier sont ceux de l'onglet (`page`), décalés de la place du
// cadre dans la page parente.
function toolsOf(tab) {
  const { page, app } = tab;
  let shift = null;
  const offset = async () => {
    if (!shift) {
      const frame = app === page ? null : await app.frameElement();
      const box = frame ? await frame.boundingBox() : null;
      shift = box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
    }
    return shift;
  };
  const inPage = async (c) => { if (!c) return c; const o = await offset(); return Object.assign({}, c, { x: c.x + o.x, y: c.y + o.y }); };
  const centerOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right };
  }, [selector, index]);
  // La souris arrive près de la cible, puis glisse dessus : un long trajet passerait sur les menus au survol de la barre d'outils.
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, settle = 250) => {
    const c = await inPage(await centerOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(settle);
  };
  // Le menu « Lien et blocs de contenu » : il s'ouvre au survol de son icône (la souris arrive d'en dessous), et se quitte par le coin bas droit du panneau.
  const openMenu = async () => {
    const c = await inPage(await centerOf('#v2-btn-link'));
    await page.mouse.move(c.x, c.y + 120);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await sleep(500);
    return c;
  };
  const leaveMenu = async () => { await page.mouse.move(670, 380, { steps: 3 }); await sleep(300); };
  // Une ligne du menu, à la vraie souris : la main descend de l'icône sur la ligne, sans quitter le volet, et clique.
  const clickRow = async (id, settle = 700) => {
    const c = await openMenu();
    // Le menu a dix lignes et défile à 700x400 (depuis « Vidéo », d2e0656, la dernière - « Diapositive d'une présentation… » - est sous le bas du menu) : la molette, la souris posée sur le menu, amène
    // la ligne voulue dans sa partie visible. Sans cela le clic tombait sous le bas de la fenêtre et le volet ne s'ouvrait pas (« .pp-slide-import .ss-trigger » introuvable).
    for (let i = 0; i < 6; i++) {
      const hidden = await app.evaluate((rowId) => {
        const f = document.getElementById('v2-blocks-flyout').getBoundingClientRect();
        const r = document.getElementById(rowId).getBoundingClientRect();
        return r.bottom > f.bottom - 1 || r.top < f.top;
      }, id);
      if (!hidden) break;
      const spot = await inPage(await centerOf('#v2-row-link'));
      await page.mouse.move(spot.x, spot.y + 40, { steps: 3 });
      await page.mouse.wheel(0, 120);
      await sleep(150);
    }
    const r = await inPage(await centerOf('#' + id));
    const x = Math.min(Math.max(c.x, r.left + 8), r.right - 8);
    await page.mouse.move(x, r.y, { steps: 8 });
    await sleep(100);
    await page.mouse.click(x, r.y);
    await sleep(settle);
  };
  // Une miniature du volet amenée dans la partie visible de sa liste par la molette de la souris, posée sur la liste.
  const showThumb = async (index, selector = '.pp-slide-import') => {
    for (let i = 0; i < 12; i++) {
      const at = await app.evaluate(([k, root]) => {
        const list = document.querySelector(root + ' .pp-slide-import-list, ' + root + ' .pp-slide-strip-list');
        const thumb = document.querySelectorAll(root + ' .pp-slide-thumb')[k];
        if (!list || !thumb) return null;
        const l = list.getBoundingClientRect();
        const r = thumb.getBoundingClientRect();
        return { list: { x: l.left + l.width / 2, y: l.top + l.height / 2 }, dy: r.top < l.top ? r.top - l.top - 8 : r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0 };
      }, [index, selector]);
      if (!at || !at.dy) return;
      const c = await inPage(at.list);
      await reach(c);
      await page.mouse.wheel(0, at.dy);
      await sleep(250);
    }
  };
  const clickThumb = async (index, settle = 250) => { await showThumb(index); await click('.pp-slide-import .pp-slide-thumb', index, settle); };
  // Le texte `text` d'un bloc de l'éditeur, amené à l'écran : un clic juste avant sa dernière lettre (le curseur au bout du texte).
  const clickText = async (text) => {
    const c = await inPage(await app.evaluate((whole) => {
      const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
      if (!block) return null;
      block.scrollIntoView({ block: 'center' });
      const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, node.textContent.length);
      const r = range.getBoundingClientRect();
      return { x: r.right - 1, y: r.top + r.height / 2 };
    }, text));
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  // Le choix d'une source dans la liste avec recherche du volet : un clic, le début du nom, Entrée.
  const pickSource = async (query) => {
    await click('.pp-slide-import .ss-trigger', 0, 400);
    await page.keyboard.type(query);
    await sleep(250);
    await press('Enter');
    await sleep(500);
  };
  return { click, clickRow, openMenu, leaveMenu, clickThumb, showThumb, clickText, press, pickSource, reach, inPage, centerOf };
}

// La présentation, fabriquée par l'éditeur lui-même (des cadres libres comme l'import PowerPoint les écrit) : un bandeau bleu, le numéro, un titre. La première diapositive dit « Bonjour » suivi de la bulle de la colonne
// Nom ; la seconde « Sans variable ».
const CHIP = '<span class="var-badge" contenteditable="false" data-table="PpDepart" data-column="Nom" data-key="PpDepart.Nom">#PpDepart.Nom</span>';
async function buildSlides() {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
  const html = await page.evaluate((chip) => {
    const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    const band = FreeFrame.html({ x: 0, y: 0, w: 60, h: 540, shape: 'rect', fill: '#009de0', layer: 'behind', decorative: '1' }, '');
    const number = FreeFrame.html({ x: 880, y: 500, w: 60, h: 24, layer: 'behind' }, '<p><span style="font-size: 12pt"><span class="page-number-badge" contenteditable="false" data-format="n">#</span></span></p>');
    const title = inner => FreeFrame.html({ x: 90, y: 200, w: 800, h: 100 }, `<h1><span style="font-size: 44pt">${inner}</span></h1>`);
    return band + number + title('Bonjour ' + chip) + MARK + band + number + title('Sans variable');
  }, CHIP);
  await page.context().close();
  return html;
}

const slides = await buildSlides();
const INTRO = '<p>Helene SCHWALM revient sur les décisions du dernier Comité.</p><p>Merci à toutes et à tous.</p>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  m.Contenu[0] = ${JSON.stringify(INTRO)};
  m.id.push(8); m.Nom.push('Support'); m.Contenu.push(window.__SLIDES); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(false); m.TypeModele.push('presentation');
  stub.state.nextRowId.Publipostage_Modeles = 10;
  m.Jeton = m.id.map(() => '');
`;

const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE }, seed: SEED, init: `window.__SLIDES = ${JSON.stringify(slides)};`, lang: 'fr', colorScheme: 'light' });
const { page, app } = A;
const a = toolsOf(A);
await sleep(1500);

const watchStatus = (tab = app) => tab.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true });
});
const said = (tab = app) => tab.evaluate(() => window.__statusSeen.slice());
const waitSaid = (pattern, timeout = 60000, tab = app) => tab.waitForFunction(p => window.__statusSeen.some(m => new RegExp(p).test(m)), pattern.source, { timeout }).then(() => true, () => false);
// Les blocs-diapositives du document, dans l'ordre : leurs attributs utiles (`src` en taille seulement).
const slideBlocks = (tab = app) => tab.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants((n) => {
    if (n.type.name !== 'editorImage' || !n.attrs.slideText) return;
    const s = n.attrs.slideSource;
    out.push({ text: n.attrs.slideText, alt: n.attrs.alt, words: (n.attrs.slideWords || []).map(w => w[4]), link: n.attrs.slideLink, srcKb: Math.round(n.attrs.src.length / 1024), source: s ? { r: s.r, t: s.t, chip: /var-badge/.test(s.h), page: !!s.m || s.m === null, kb: Math.round(JSON.stringify(s).length / 1024), h: s.h.slice(0, 4000) } : null });
  });
  return out;
});
const editorSrc = (rank) => app.evaluate((i) => { let k = 0; let src = null; EditorCore.getEditor().state.doc.descendants((n) => { if (n.type.name === 'editorImage' && n.attrs.slideText) { if (k === i) src = n.attrs.src; k++; } }); return src; }, rank);
// Les pixels de la pastille de variable (#eaf2ff, le fond d'une bulle) dans une image PNG : une photo de l'éditeur en a des centaines, une photo de la Lecture aucune.
const chipPixels = (src) => app.evaluate(async (data) => {
  const img = new Image();
  img.src = data;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 234) <= 4 && Math.abs(d[i + 1] - 242) <= 4 && d[i + 2] >= 251) n++;
  return n;
}, src);
const waitFor = (fn, arg, timeout = 30000, tab = app) => tab.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const row8 = () => app.evaluate(() => (window.__gristStub.getRow('Publipostage_Modeles', 8) || {}).Contenu || '');

// --- Le volet : « En bloc » est choisi d'abord ; la diapositive 1 (la variable) puis la diapositive 2 (sans variable) sont posées.
await a.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await a.clickRow('v2-btn-slide-text', 900);
await a.leaveMenu();
await a.pickSource('support');
await watchStatus();
await a.clickThumb(0, 0);
check('la diapositive 1 (celle de la variable) est posée en bloc', await waitSaid(/1 de « Support » posée en bloc\./), await said());
await a.clickText('Merci à toutes et à tous.');
await watchStatus();
await a.clickThumb(1, 0);
check('la diapositive 2 (sans variable) est posée en bloc', await waitSaid(/2 de « Support » posée en bloc\./), await said());
let list = await slideBlocks();
check('deux blocs-diapositives dans le document', list.length === 2, list.map(b => b.text.slice(0, 30)));
check('la diapositive qui parle d’une ligne garde sa diapositive (`slideSource` : la bulle, son rang 1 sur 2), pas l’autre', !!list[0] && !!list[0].source && list[0].source.chip && list[0].source.r === 1 && list[0].source.t === 2 && !!list[1] && list[1].source === null, list.map(b => b.source && { r: b.source.r, t: b.source.t, chip: b.source.chip }));
check('la diapositive gardée pèse peu (moins de 40 Ko) : elle n’a pas d’image dedans', !!list[0].source && list[0].source.kb < 40, list[0].source && list[0].source.kb);
check('le texte du bloc, à l’éditeur, montre la bulle (« Bonjour #PpDepart.Nom ») et le numéro écrit (1)', /Bonjour #PpDepart\.Nom/.test(list[0].text) && /(^|\s)1\s*$/.test(list[0].text), list[0].text);
const src0 = await editorSrc(0);
const src1 = await editorSrc(1);
const chipEditor = await chipPixels(src0);
check('la photo de l’éditeur montre la pastille de la bulle (' + chipEditor + ' pixels du fond d’une bulle)', chipEditor > 300, chipEditor);
save('1-editeur', src0);

// --- Enregistré puis relu : le bloc garde sa diapositive.
const saved = await app.evaluate(() => {
  const ed = EditorCore.getEditor();
  const html = Editor.getHTML(ed.state.doc);
  const body = HtmlSanitize.parseInert(html);
  const imgs = Array.from(body.querySelectorAll('img.editor-image[data-slide-text]'));
  const doc = SlideLinks.kit().libs.PMDOMParser.fromSchema(ed.schema).parse(body);
  const back = [];
  doc.descendants((n) => { if (n.type.name === 'editorImage' && n.attrs.slideText) back.push(n.attrs.slideSource); });
  return { attrs: imgs.map(i => i.hasAttribute('data-slide-source')), back: back.map(s => s && { r: s.r, t: s.t, chip: /var-badge/.test(s.h) }) };
});
check('enregistré puis relu (assaini, relu par l’éditeur), le premier bloc garde sa diapositive et le second n’en a pas', saved.attrs.join() === 'true,false' && saved.back[0] && saved.back[0].chip && saved.back[0].r === 1 && saved.back[1] === null, saved);

// --- La Lecture : la photo est redessinée pour la ligne d'Alice.
await app.evaluate(() => { window.__draws = 0; const was = SlidesEntry.blockSnapshot; SlidesEntry.blockSnapshot = function () { window.__draws++; return was.apply(this, arguments); }; });
await a.click('#btn-mode-read', 0, 300);
await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
const redrawn = await waitFor(() => { const i = document.querySelector('#reader-container img.editor-image[data-slide-text]'); return !!i && /Bonjour Alice/.test(i.getAttribute('data-slide-text')); }, null, 60000);
check('à la Lecture, le premier bloc est redessiné pour la ligne d’Alice : son texte dit « Bonjour Alice »', redrawn, await app.evaluate(() => Array.from(document.querySelectorAll('#reader-container img.editor-image')).map(i => i.getAttribute('data-slide-text'))));
const reading = await app.evaluate(() => Array.from(document.querySelectorAll('#reader-container img.editor-image[data-slide-text]')).map(i => ({ text: i.getAttribute('data-slide-text'), words: JSON.parse(i.getAttribute('data-slide-words') || '[]').map(w => w[4]), src: i.getAttribute('src'), source: i.hasAttribute('data-slide-source'), alt: i.alt, loaded: i.complete && i.naturalWidth })));
check('la Lecture montre deux blocs-diapositives, 1 seul dessin refait (' + await app.evaluate(() => window.__draws) + ')', reading.length === 2 && (await app.evaluate(() => window.__draws)) === 1, reading.map(r => r.text.slice(0, 20)));
check('le texte redessiné lit « Bonjour Alice » et plus la bulle ; le numéro est toujours écrit (1) ; les mots de l’image portent « Alice »', !!reading[0] && /Bonjour Alice/.test(reading[0].text) && !/#PpDepart/.test(reading[0].text) && /(^|\s)1\s*$/.test(reading[0].text) && reading[0].words.includes('Alice'), reading[0] && { text: reading[0].text, words: reading[0].words });
check('le texte alternatif suit (« Diapositive : Bonjour Alice… »)', !!reading[0] && /^Diapositive : Bonjour Alice/.test(reading[0].alt), reading[0] && reading[0].alt);
const chipReading = reading[0] ? await chipPixels(reading[0].src) : -1;
check('la photo de la Lecture n’a plus la pastille de la bulle (' + chipReading + ' pixels, contre ' + chipEditor + ' à l’éditeur) et la photo a changé', chipReading >= 0 && chipReading < 30 && reading[0].src !== src0, { chipReading });
check('la diapositive n’est plus dans le HTML de sortie (pas de data-slide-source) ; l’image est chargée', reading.every(r => !r.source) && reading.every(r => r.loaded > 0), reading.map(r => ({ source: r.source, loaded: r.loaded })));
check('le bloc sans variable est tel que l’éditeur le montre (même image)', !!reading[1] && reading[1].src === src1, reading[1] && reading[1].src.length);
save('2-lecture-alice', reading[0] && reading[0].src);
await a.click('#btn-mode-edit', 0, 500);
const afterEdit = await slideBlocks();
check('de retour à l’édition, rien n’a bougé : le bloc garde sa photo, son texte (la bulle) et sa diapositive', afterEdit.length === 2 && afterEdit[0].text === list[0].text && !!afterEdit[0].source && (await editorSrc(0)) === src0, afterEdit.map(b => b.text.slice(0, 30)));

// --- Un export, deux lignes : ReaderMode.preview écrit le document d'UNE ligne.
const exported = await app.evaluate(async () => {
  const html = Editor.getHTML(EditorCore.getEditor().state.doc);
  window.__draws = 0;
  const take = async (rec) => {
    const out = await ReaderMode.preview(html, 'PpDepart', rec);
    const d = document.createElement('div');
    d.innerHTML = out;
    return Array.from(d.querySelectorAll('img.editor-image[data-slide-text]')).map(i => ({ text: i.getAttribute('data-slide-text'), src: i.getAttribute('src'), source: i.hasAttribute('data-slide-source') }));
  };
  const bruno = await take({ id: 2, Nom: 'Bruno', Statut: 'Normal' });
  const afterBruno = window.__draws;
  const alice = await take({ id: 1, Nom: 'Alice', Statut: 'Urgent' });
  const afterAlice = window.__draws;
  const aliceAgain = await take({ id: 1, Nom: 'Alice', Statut: 'Urgent' });
  return { bruno, alice, aliceAgain, drawsBruno: afterBruno, drawsAlice: afterAlice, drawsAgain: window.__draws };
});
check('l’export de la ligne de Bruno dit « Bonjour Bruno » ; celui d’Alice « Bonjour Alice » ; ni l’un ni l’autre ne garde la diapositive', /Bonjour Bruno/.test(exported.bruno[0].text) && /Bonjour Alice/.test(exported.alice[0].text) && [exported.bruno, exported.alice].every(l => l.every(i => !i.source)), { bruno: exported.bruno.map(i => i.text.slice(0, 30)), alice: exported.alice.map(i => i.text.slice(0, 30)) });
check('les deux photos sont différentes (Bruno, Alice) ; celle d’Alice est celle de la Lecture (dessin gardé : pas de nouveau dessin)', exported.bruno[0].src !== exported.alice[0].src && exported.alice[0].src === reading[0].src && exported.drawsBruno === 1 && exported.drawsAlice === 1, { drawsBruno: exported.drawsBruno, drawsAlice: exported.drawsAlice });
check('une même ligne deux fois : la même photo, sans nouveau dessin (' + exported.drawsAgain + ' dessin au total pour trois exports)', exported.aliceAgain[0].src === exported.alice[0].src && exported.drawsAgain === 1, exported);
check('le bloc sans variable n’est pas redessiné dans l’export', exported.bruno[1].src === src1 && exported.alice[1].src === src1, null);
save('3-export-bruno', exported.bruno[0].src);

// --- « Garder liée » : le bloc lié porte aussi sa diapositive, et la reprend quand la source change.
// (la Lecture a refermé le volet : on le rouvre)
await a.clickText('Merci à toutes et à tous.');
if (!(await app.evaluate(() => !!document.querySelector('.pp-slide-import .pp-slide-thumb')))) {
  await a.clickRow('v2-btn-slide-text', 900);
  await a.leaveMenu();
  await a.pickSource('support');
}
await a.click('#pp-slide-import-keep', 0, 300);
await a.clickText('Merci à toutes et à tous.');
await watchStatus();
await a.clickThumb(0, 0);
check('« Garder liée » : la diapositive 1 est posée en bloc, liée à sa source', await waitSaid(/1 de « Support » posée en bloc, liée à sa source\./), await said());
list = await slideBlocks();
const linked = list.filter(b => b.link);
check('le bloc lié porte sa diapositive (la bulle, rang 1 sur 2)', linked.length === 1 && !!linked[0].source && linked[0].source.chip && linked[0].source.r === 1 && linked[0].source.t === 2, linked.map(b => b.source && { r: b.source.r, t: b.source.t }));
await watchStatus();
const rewrote = await app.evaluate(() => { const stub = window.__gristStub; const html = stub.getRow('Publipostage_Modeles', 8).Contenu; stub.remoteWrite('Publipostage_Modeles', 8, { Contenu: html.split('Bonjour ').join('Salut '), DateModif: new Date().toISOString() }); return html.includes('Bonjour '); });
check('(préparation) « Support » réécrite ailleurs : « Salut » à la place de « Bonjour »', rewrote, null);
const followed = await waitFor(() => { let ok = false; EditorCore.getEditor().state.doc.descendants((n) => { if (n.type.name === 'editorImage' && n.attrs.slideLink && /Salut/.test(n.attrs.slideText || '') && n.attrs.slideSource && /Salut/.test(n.attrs.slideSource.h)) ok = true; }); return ok; }, null, 45000);
check('le bloc lié reprend la nouvelle diapositive : son texte ET sa diapositive gardée disent « Salut »', followed, await said());
list = await slideBlocks();
check('les deux autres blocs ne bougent pas (ils disent toujours « Bonjour »)', list.filter(b => !b.link && b.source).every(b => /Bonjour/.test(b.text)), list.map(b => b.text.slice(0, 20)));

// --- Une diapositive qui ne parle que d'une puce (date du jour) est, elle aussi, gardée : la détection ne se limite pas aux bulles.
const probe = await app.evaluate(() => {
  const at = { rank: 1, total: 1 };
  return {
    chip: !!SlideCopies.blockSourceOf('<p>Le <span class="smart-chip" data-chip-kind="date">date</span></p>', null, at),
    calc: !!SlideCopies.blockSourceOf('<p><span class="calc-badge" data-calc="1+1">1+1</span></p>', null, at),
    condition: !!SlideCopies.blockSourceOf('<p data-condition="{}">Texte</p>', null, at),
    plain: SlideCopies.blockSourceOf('<p>Texte <strong>seul</strong></p>', null, at),
    number: SlideCopies.blockSourceOf('<p><span class="var-badge">#a</span></p>', { marginsMm: { top: 10 } }, null),
  };
});
check('une puce, un calcul ou une condition rendent la diapositive « à redessiner » ; un texte seul non ; sans numéro, rang 0', probe.chip && probe.calc && probe.condition && probe.plain === null && probe.number && probe.number.r === 0 && probe.number.m && probe.number.m.top === 10, probe);

// --- En anglais, thème sombre : la Lecture redessine de même, le texte alternatif est celui de la langue.
const B = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: 'en' }, seed: SEED, init: `window.__SLIDES = ${JSON.stringify(slides)};`, lang: 'en', colorScheme: 'dark' });
const b = toolsOf(B);
await sleep(1500);
const appB = B.app;
await b.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await b.clickRow('v2-btn-slide-text', 900);
await b.leaveMenu();
await b.pickSource('support');
await watchStatus(appB);
await b.clickThumb(0, 0);
check('[en dark] la diapositive 1 est posée en bloc', await waitSaid(/Slide 1 from “Support” placed as a block\./, 60000, appB), await said(appB));
await b.click('#btn-mode-read', 0, 300);
await appB.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
const redrawnEn = await waitFor(() => { const i = document.querySelector('#reader-container img.editor-image[data-slide-text]'); return !!i && /Bonjour Alice/.test(i.getAttribute('data-slide-text')); }, null, 60000, appB);
const altEn = await appB.evaluate(() => { const i = document.querySelector('#reader-container img.editor-image[data-slide-text]'); return i ? i.alt : ''; });
check('[en dark] la Lecture redessine pour Alice, et le texte alternatif commence par « Slide: Bonjour Alice »', redrawnEn && /^Slide: Bonjour Alice/.test(altEn), altEn);

await t.finish();
