#!/usr/bin/env node
// UNE DIAPOSITIVE DANS UN DOCUMENT, « EN BLOC » (12/11, demande d'Antoine : « j'aimerais que ça soit un bloc complet redimensionnable, là c'est compliqué de le sélectionner et de le supprimer car le contenu épouse un peu trop le
// document ; pas mal d'éléments de la diapositive ne suivent pas : le bandeau sur le côté, le numéro de page, le logo »). Le volet « Insérer depuis » d'un document pose désormais la diapositive en UNE image (extensions/diapositives/
// slide-raster.js : la page de la diapositive peinte dans un SVG puis un canevas), large comme le texte, avec son décor ; l'image garde le texte de la diapositive (`slideText` : Ctrl+F, texte alternatif), ses mots et leur place
// (`slideWords`), et, « Garder liée » cochée, sa diapositive source (`slideLink` : js/slide-copies.js, `followBlocks`). « En texte » reste là, tel qu'il était.
// À la vraie souris et au vrai clavier, 700x400, français clair, l'app dans le cadre isolé de GFS (sans `allow-same-origin` : les feuilles de style ne s'y lisent pas) : « Devis » à l'écran, la présentation « Support » dont la
// diapositive 3 est celle de l'exemple d'Antoine (bandeau bleu à gauche, logo blanc dans le bandeau, numéro en bas à droite, titre, tableau de quatre colonnes aux cellules colorées).
//  - le volet propose « En bloc » (choisi d'abord) et « En texte » ; « En texte » pose du texte, comme avant (un tableau, pas d'image) ;
//  - « En bloc » : un clic sur la diapositive 3 pose UNE image, de la largeur du texte, de format 16:9, dont les pixels montrent le bandeau bleu, le logo blanc dans le bandeau, le tableau, ses cellules vertes et le numéro ;
//    elle porte le texte de la diapositive et ses mots ; le texte alternatif est tiré de ce texte (500 signes au plus) ; un seul Ctrl+Z défait la pose ;
//  - un clic sur le bloc le SÉLECTIONNE entier (poignées), glisser une poignée le redimensionne, Suppr le supprime, Ctrl+Z le rend à la taille qu'il avait ;
//  - Ctrl+F trouve le texte de la diapositive : UN résultat, le bloc cerclé ; « Remplacer » le laisse tel quel et le dit ; « Tout remplacer » aussi ;
//  - « Garder liée » : le bloc porte sa diapositive source, la ligne de « Support » reçoit son repère ; quand « Support » change ailleurs, le bloc prend la nouvelle diapositive à la lecture suivante de l'enregistrement
//    automatique, SANS perdre sa taille ; la barre de l'image dit « Suit la diapositive 3 de « Support » » et « Détacher » ne garde que l'image.
// Lancé par run-headless.mjs (groupe Node « slideBlock », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-block.mjs
// `SLIDE_BLOCK_SHOTS=<dossier>` enregistre des captures (le zoom au survol, le bloc posé avec son numéro écrit).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-block', port: Number(process.env.SLIDE_BLOCK_PORT || 9141) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SLIDE_BLOCK_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (tab, name) => { if (SHOTS) await tab.page.screenshot({ path: join(SHOTS, name + '.png') }); };
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

// La présentation, fabriquée par l'éditeur lui-même (des cadres libres comme l'import PowerPoint les écrit : le bandeau, le logo et le numéro derrière le texte, le titre et le tableau devant) et enregistrée telle que getHTML()
// l'écrit. Le logo est dessiné dans un canevas : du blanc sur transparent, invisible hors du bandeau.
async function buildSlides() {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
  const html = await page.evaluate(() => {
    const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    const canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 90;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.fillText('FRANCE', 8, 40); g.font = 'bold 40px Arial'; g.fillText('2030', 8, 80);
    const logo = canvas.toDataURL('image/png');
    const cell = (text, style, tag = 'td') => `<${tag}${style ? ` style="${style}"` : ''}><p>${text}</p></${tag}>`;
    const HEAD = 'background-color: #009de0; color: #ffffff';
    const row = (a, b, c, d, ok) => `<tr>${cell(`<strong>${a}</strong>`)}${cell(`<strong>${b}</strong>`)}${cell(`<strong>${c}</strong>`)}${cell(`<strong>${d}</strong>`, ok ? 'background-color: #00b050' : '')}</tr>`;
    const table = '<table><tbody>'
      + `<tr>${cell('<strong>Projet / Sujet</strong>', HEAD)}${cell('<strong>Programme / Action</strong>', HEAD)}${cell('<strong>Discussion / Décision à valider</strong>', HEAD)}${cell('<strong>Arbitrage</strong>', HEAD)}</tr>`
      + row('Feuilles de route émergente #3', 'InnovationS - Action 1', 'Lancement de la Feuille de route émergente #3', 'Validé', true)
      + row('AAP SPARK #4', 'SPARK / InnovationS - Actions 6 et 11', 'Demande de validation de la sélection des projets de la vague 4', 'Validé', true)
      + row('Open Lab #2', 'OpenLab / InnovationS - Action 18', 'Validation du projet si pas de questions spécifiques', 'A valider', false)
      + '</tbody></table>';
    const slide3 = FreeFrame.html({ x: 0, y: 0, w: 60, h: 540, shape: 'rect', fill: '#009de0', layer: 'behind', decorative: '1' }, '')
      + FreeFrame.html({ x: 8, y: 10, w: 50, h: 22, layer: 'behind' }, `<p><img class="editor-image" src="${logo}" alt="" style="width: 44px"></p>`)
      + FreeFrame.html({ x: 880, y: 500, w: 60, h: 24, layer: 'behind' }, '<p><span style="font-size: 12pt"><span class="page-number-badge" contenteditable="false" data-format="n">#</span></span></p>')
      + FreeFrame.html({ x: 90, y: 30, w: 760, h: 50 }, '<h2><span style="font-size: 20pt">Arbitrages du 13 octobre 2026</span></h2>')
      + FreeFrame.html({ x: 90, y: 100, w: 800, h: 300 }, table);
    return FreeFrame.html({ x: 80, y: 200, w: 800, h: 100 }, '<h1><span style="font-size: 44pt">Comité innovation</span></h1>') + MARK
      + FreeFrame.html({ x: 60, y: 40, w: 800, h: 60 }, '<h2><span style="font-size: 28pt">Ordre du jour</span></h2>') + MARK + slide3;
  });
  await page.context().close();
  return html;
}

const slides = await buildSlides();
const INTRO = '<p>Helene SCHWALM revient sur les décisions du dernier Comité.</p><p>Merci à toutes et à tous.</p>';
const SEED = seedModels() + `
  m.Contenu[0] = ${JSON.stringify(INTRO)};
  m.id.push(8); m.Nom.push('Support'); m.Contenu.push(window.__SLIDES); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(false); m.TypeModele.push('presentation');
  stub.state.nextRowId.Publipostage_Modeles = 10;
  m.Jeton = m.id.map(() => '');
`;

const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE }, seed: SEED, init: `window.__SLIDES = ${JSON.stringify(slides)};`, lang: 'fr', colorScheme: 'light' });
const { page, app } = A;
const a = toolsOf(A);
await sleep(1500);

const watchStatus = () => app.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true });
});
const said = () => app.evaluate(() => window.__statusSeen.slice());
const waitSaid = (pattern, timeout = 60000) => app.waitForFunction(p => window.__statusSeen.some(m => new RegExp(p).test(m)), pattern.source, { timeout }).then(() => true, () => false);
// Les blocs du document : { type, text, image } (l'image : ses attributs utiles, `src` en taille seulement).
const blocks = () => app.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.forEach((n) => {
    const img = n.firstChild && n.firstChild.type.name === 'editorImage' ? n.firstChild.attrs : null;
    out.push({ type: n.type.name, text: n.textContent.slice(0, 40), image: img ? { width: img.width, alt: img.alt, slideText: img.slideText, words: (img.slideWords || []).length, link: img.slideLink, srcKb: Math.round(img.src.length / 1024), mime: img.src.slice(5, 14) } : null });
  });
  return out;
});
const images = async () => (await blocks()).filter(b => b.image);
// Les pixels de l'image du bloc à `at` (le rang de l'image dans le document) : { w, h, at: [{ x, y, rgb }] } pour des points en fractions de sa largeur et de sa hauteur.
const pixelsOf = (points) => app.evaluate(async (pts) => {
  let src = null;
  EditorCore.getEditor().state.doc.descendants((n) => { if (!src && n.type.name === 'editorImage' && n.attrs.slideText) src = n.attrs.src; });
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { w: img.naturalWidth, h: img.naturalHeight, at: pts.map(([fx, fy]) => Array.from(ctx.getImageData(Math.round(fx * (img.naturalWidth - 1)), Math.round(fy * (img.naturalHeight - 1)), 1, 1).data.slice(0, 3))) };
}, points);
const near = (rgb, want, tolerance = 28) => rgb.every((v, i) => Math.abs(v - want[i]) <= tolerance);
// Compte, dans un rectangle de l'image (fractions), les pixels presque blancs (le logo blanc dans le bandeau bleu) et les pixels sombres (le numéro).
const countIn = (box, test) => app.evaluate(async ([b, kind]) => {
  let src = null;
  EditorCore.getEditor().state.doc.descendants((n) => { if (!src && n.type.name === 'editorImage' && n.attrs.slideText) src = n.attrs.src; });
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const x = Math.round(b[0] * img.naturalWidth); const y = Math.round(b[1] * img.naturalHeight);
  const data = ctx.getImageData(x, y, Math.round((b[2] - b[0]) * img.naturalWidth), Math.round((b[3] - b[1]) * img.naturalHeight)).data;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) { const light = data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225; const dark = data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90; const green = data[i + 1] > 235 && data[i + 1] - data[i] > 10 && data[i + 1] - data[i + 2] > 5; if (kind === 'light' ? light : kind === 'green' ? green : dark) n++; }
  return n;
}, [box, test]);
const selectedNode = () => app.evaluate(() => { const n = EditorCore.getEditor().state.selection.node; return n ? { type: n.type.name, hasText: !!n.attrs.slideText } : null; });
const widthPx = () => app.evaluate(() => { const img = document.querySelector('#editor-container .tiptap .editor-image-view.editor-image-slide > img'); return img ? img.getBoundingClientRect().width : 0; });
const contentWidth = () => app.evaluate(() => Math.floor(PageLayout.getContentWidthMm() * PageLayout.MM_TO_PX));
const row8 = () => app.evaluate(() => (window.__gristStub.getRow('Publipostage_Modeles', 8) || {}).Contenu || '');
// Un clic sur le bloc de rang `rank` (l'image de diapositive), amené d'abord au milieu de la fenêtre : un bloc posé plus bas n'est pas à l'écran.
const clickBlock = async (rank) => {
  await app.evaluate((i) => document.querySelectorAll('#editor-container .tiptap .editor-image-view.editor-image-slide')[i].scrollIntoView({ block: 'center' }), rank);
  await sleep(300);
  await a.click('#editor-container .editor-image-view.editor-image-slide > img', rank, 400);
};
const waitFor = (fn, arg, timeout = 30000) => app.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

// --- Le volet.
await a.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await a.clickRow('v2-btn-slide-text', 900);
await a.leaveMenu();
await a.pickSource('support');
const kinds = await app.evaluate(() => ({ block: document.querySelector('.pp-slide-import-kind-btn:nth-child(1)').getAttribute('aria-checked'), text: document.querySelector('.pp-slide-import-kind-btn:nth-child(2)').getAttribute('aria-checked'), labels: Array.from(document.querySelectorAll('.pp-slide-import-kind-btn')).map(b => b.textContent), hint: document.getElementById('pp-slide-import-hint').textContent, format: !document.getElementById('pp-slide-import-format').closest('label').hidden }));
check('le volet propose « En bloc » (choisi d’abord) et « En texte » ; l’indication parle d’un bloc, la mise en forme d’origine (du texte) n’est pas proposée', kinds.block === 'true' && kinds.text === 'false' && kinds.labels.join('|') === 'En bloc|En texte' && /en un bloc/.test(kinds.hint) && !kinds.format, kinds);

// --- Les miniatures du volet sont plus grandes (13/11, « les diapos sont toutes petites »), et un zoom les montre en grand au survol, à la souris comme au clavier.
const thumbBox = await app.evaluate(() => { const t = document.querySelector('.pp-slide-import .pp-slide-thumb'); const p = document.querySelector('.pp-slide-import').getBoundingClientRect(); const l = document.querySelector('.pp-slide-import-list'); const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), panelRight: Math.round(p.right), bottom: Math.round(r.bottom), listBottom: Math.round(l.getBoundingClientRect().bottom), overflowX: l.scrollWidth > l.clientWidth }; });
check('à 700 x 400 (fenêtre basse), les miniatures restent à 96 px et la première tient entière dans le volet, sans défilement de côté', thumbBox.w === 96 && thumbBox.h >= 53 && thumbBox.h <= 55 && thumbBox.right <= thumbBox.panelRight && thumbBox.bottom <= thumbBox.listBottom && !thumbBox.overflowX, thumbBox);
const zoomProbe = () => {
  const z = document.querySelector('.pp-slide-import-zoom');
  if (!z || z.hidden) return null;
  const r = z.getBoundingClientRect();
  const p = document.querySelector('.pp-slide-import').getBoundingClientRect();
  const badge = z.querySelector('.page-number-badge');
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { w: Math.round(r.width), right: Math.round(r.right), panelLeft: Math.round(p.left), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, text: z.textContent.replace(/\s+/g, ' ').trim().slice(0, 80), badge: badge ? { text: badge.textContent, resolved: badge.getAttribute('data-slide-number'), bg: getComputedStyle(badge).backgroundColor } : null, pointer: getComputedStyle(z).pointerEvents, hit: !!hit && z.contains(hit) };
};
const zoomState = () => app.evaluate(zoomProbe);
await a.showThumb(0);
await a.reach(await a.inPage(await a.centerOf('.pp-slide-import .pp-slide-thumb', 0)));
const zoomEarly = await zoomState();
await sleep(500);
const zoom1 = await zoomState();
check('au survol de la miniature 1, le zoom ne s’ouvre pas tout de suite, puis montre la diapositive en grand, à gauche du volet, dans la fenêtre', !zoomEarly && !!zoom1 && zoom1.w >= 300 && zoom1.w <= 520 && zoom1.right <= zoom1.panelLeft && zoom1.top >= 0 && zoom1.bottom <= zoom1.vh && /Comité innovation/.test(zoom1.text), { zoomEarly, zoom1 });
check('le zoom ne prend ni la souris ni un clic (pas d’événement de pointeur, rien ne tombe dessus)', !!zoom1 && zoom1.pointer === 'none' && !zoom1.hit, zoom1);
// À 700 x 400, la liste du volet montre une miniature : la molette amène la suivante sous la souris immobile, le zoom se ferme avec le défilement et se rouvre au premier mouvement, sur celle qui est dessous.
const pitch = await app.evaluate(() => { const t = document.querySelectorAll('.pp-slide-import .pp-slide-item'); return Math.round(t[1].getBoundingClientRect().top - t[0].getBoundingClientRect().top); });
await page.mouse.wheel(0, pitch);
await sleep(400);
const zoomScrolled = await zoomState();
check('la liste défile sous la souris : le zoom se ferme', zoomScrolled === null, zoomScrolled);
const hoverAt = await a.inPage(await a.centerOf('.pp-slide-import .pp-slide-thumb', 1));
await page.mouse.move(hoverAt.x + 3, hoverAt.y - 3, { steps: 2 });
await sleep(500);
const zoom0 = await zoomState();
check('au premier mouvement de la souris, il se rouvre sur la miniature qui est dessous : la diapositive 2', !!zoom0 && /Ordre du jour/.test(zoom0.text) && !/Comité innovation/.test(zoom0.text), zoom0);
await a.showThumb(2);
await a.reach(await a.inPage(await a.centerOf('.pp-slide-import .pp-slide-thumb', 2)));
await sleep(500);
const zoom2 = await zoomState();
check('le zoom de la diapositive 3 montre son numéro écrit (« 3 »), sans la pastille verte', !!zoom2 && !!zoom2.badge && zoom2.badge.text === '3' && zoom2.badge.resolved === '3' && /rgba\(0, 0, 0, 0\)|transparent/.test(zoom2.badge.bg) && /Arbitrages/.test(zoom2.text), zoom2);
await page.mouse.move(...Object.values(await a.inPage({ x: 150, y: 200 })), { steps: 4 });
await sleep(150);
check('la souris quitte le volet : le zoom se ferme', (await zoomState()) === null, await zoomState());
await app.evaluate(() => document.querySelector('.pp-slide-import-kind-btn[aria-checked="true"]').focus());
await a.press('Tab');
await a.press('Tab');
const onRow = await app.evaluate(() => (document.activeElement.classList.contains('pp-slide-item') ? Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-item')).indexOf(document.activeElement) : -1));
const zoomKey = await zoomState();
check('au clavier, la miniature qui a le focus montre son zoom (la diapositive 1)', onRow === 0 && !!zoomKey && /Comité innovation/.test(zoomKey.text), { onRow, zoomKey });
await a.press('ArrowDown');
const zoomKey2 = await zoomState();
check('Flèche bas : le zoom passe à la diapositive suivante', !!zoomKey2 && /Ordre du jour/.test(zoomKey2.text), zoomKey2);
await a.press('Shift+Tab');
check('le focus sort de la liste : le zoom se ferme', (await zoomState()) === null, await zoomState());
await app.evaluate(() => { const first = document.querySelector('.pp-slide-import .pp-slide-item'); if (first) first.scrollIntoView({ block: 'nearest' }); });

// --- « En texte » reste ce qu'il était : du texte (un tableau), pas d'image.
await a.click('.pp-slide-import-kind-btn', 1, 300);
const textKinds = await app.evaluate(() => ({ text: document.querySelectorAll('.pp-slide-import-kind-btn')[1].getAttribute('aria-checked'), hint: document.getElementById('pp-slide-import-hint').textContent, format: !document.getElementById('pp-slide-import-format').closest('label').hidden }));
check('« En texte » : l’indication redit « l’insère en texte », « Garder la mise en forme d’origine » revient', textKinds.text === 'true' && /en texte/.test(textKinds.hint) && textKinds.format, textKinds);
await watchStatus();
await a.clickThumb(2, 0);
check('« En texte » : le coin d’état dit « insérée en texte »', await waitSaid(/insérée en texte/), await said());
let list = await blocks();
check('« En texte » : le document a un tableau, et aucun bloc de diapositive (l’image du logo y est une image de texte, comme avant)', list.some(b => b.type === 'table') && !list.some(b => b.image && b.image.slideText), list.map(b => b.type));
await a.press('Control+z');
await sleep(400);
list = await blocks();
check('(préparation) un Ctrl+Z défait le texte : le document est revenu à ses deux paragraphes', list.length === 2 && list.every(b => b.type === 'paragraph'), list.map(b => b.type));

// --- « En bloc » : un clic sur la diapositive 3.
await a.click('.pp-slide-import-kind-btn', 0, 300);
await a.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await watchStatus();
const t0 = Date.now();
await a.clickThumb(2, 0);
const placed = await waitSaid(/3 de « Support » posée en bloc\./);
const took = Date.now() - t0;
check('« En bloc » : la diapositive 3 est posée (' + took + ' ms) et le coin d’état le dit', placed, await said());
list = await blocks();
let found = list.filter(b => b.image);
const textWidth = await contentWidth();
check('une seule image dans le document, juste après le premier paragraphe, de la largeur du texte (' + textWidth + ' px), en PNG', found.length === 1 && list.indexOf(found[0]) === 1 && found[0].image.width === textWidth + 'px' && found[0].image.mime === 'image/png', { list: list.map(b => b.type + (b.image ? '[' + b.image.width + ',' + b.image.mime + ']' : '')), textWidth });
const img0 = found[0].image;
check('l’image garde le texte de la diapositive (titre, tableau, numéro) et ses mots avec leur place', /Arbitrages du 13 octobre 2026/.test(img0.slideText) && /Open Lab #2/.test(img0.slideText) && /Discussion \/ Décision à valider/.test(img0.slideText) && img0.words >= 30, img0);
check('le texte alternatif vient de ce texte, dans l’ordre où on lit la diapositive (le titre, le tableau, puis le numéro) : « Diapositive : Arbitrages du 13 octobre 2026… », 500 signes au plus', /^Diapositive : Arbitrages du 13 octobre 2026/.test(img0.alt) && img0.alt.length <= 500 && /\n3$/.test(img0.slideText), { alt: img0.alt, end: img0.slideText.slice(-20) });
const px = await pixelsOf([[0.03, 0.5], [0.5, 0.9], [0.5, 0.215], [0.82, 0.27], [0.5, 0.5]]);
check('l’image est de format 16:9 (' + px.w + ' x ' + px.h + ')', Math.abs(px.w / px.h - 16 / 9) < 0.02, px);
check('le bandeau bleu est là, sur le côté gauche (#009de0)', near(px.at[0], [0, 157, 224]), px.at[0]);
check('le bas de la page est blanc, l’en-tête du tableau est bleu, la cellule « Validé » est verte (#00b050)', near(px.at[1], [255, 255, 255]) && near(px.at[2], [0, 157, 224]) && near(px.at[3], [0, 176, 80], 40), px.at);
const logoLight = await countIn([0.01, 0.025, 0.07, 0.1], 'light');
const numberDark = await countIn([0.9, 0.9, 0.97, 0.97], 'dark');
check('le logo est dans le bandeau (des pixels blancs sur le bleu, là où il est posé) et le numéro est en bas à droite (des pixels sombres)', logoLight > 30 && numberDark > 20, { logoLight, numberDark });
// 13/11, « mon numéro de page apparaît en # vert » : la pastille de numéro de la diapositive (celle que l'import PowerPoint écrit) est écrite en chiffre, comme à la Lecture, sans la pastille verte de l'éditeur.
const numberGreen = await countIn([0.88, 0.88, 0.99, 0.99], 'green');
check('le numéro de la diapositive est écrit (« 3 », le dernier texte de l’image), non laissé en « # » ; ni pastille verte à sa place', /(^|\s)3\s*$/.test(img0.slideText) && !/(^|\s)#(\s|$)/.test(img0.slideText) && numberGreen === 0, { text: img0.slideText.slice(-40), numberGreen });
const caret = await app.evaluate(() => EditorCore.getEditor().state.selection.$from.parent.textContent);
check('le curseur est dans le bloc qui suit l’image (« Merci à toutes et à tous. »), les insertions se suivent', caret === 'Merci à toutes et à tous.', caret);
await a.press('Control+z');
await sleep(500);
list = await blocks();
check('UN seul Ctrl+Z défait la pose : plus d’image, le document est revenu à ses deux paragraphes', list.length === 2 && !list.some(b => b.image), list.map(b => b.type));
await a.press('Control+y');
await sleep(500);
list = await blocks();
check('Ctrl+Y la rend', list.filter(b => b.image).length === 1, list.map(b => b.type));

// --- Enregistré puis relu, le bloc est le même : le texte, les mots et le lien sont dans le HTML enregistré, et le HTML assaini à l'ouverture les garde.
const saved = await app.evaluate(() => {
  const ed = EditorCore.getEditor();
  const html = Editor.getHTML(ed.state.doc);
  const body = HtmlSanitize.parseInert(html);
  const img = body.querySelector('img.editor-image[data-slide-text]');
  const doc = SlideLinks.kit().libs.PMDOMParser.fromSchema(ed.schema).parse(body);
  let back = null;
  doc.descendants((n) => { if (!back && n.type.name === 'editorImage' && n.attrs.slideText) back = n.attrs; });
  return { has: !!img, words: img ? JSON.parse(img.getAttribute('data-slide-words')).length : 0, style: img ? img.getAttribute('style') : '', backText: back && back.slideText.length, backWords: back && back.slideWords.length, backAlt: back && back.alt.length };
});
check('enregistré puis relu (assaini, relu par l’éditeur), le bloc garde son texte, ses mots, sa largeur et son texte alternatif', saved.has && saved.words >= 30 && /width: 719px/.test(saved.style) && saved.backText > 100 && saved.backWords === saved.words && saved.backAlt > 20, saved);

// --- Le bloc se sélectionne d'un clic, se redimensionne à la poignée, se supprime d'un geste.
await clickBlock(0);
let sel = await selectedNode();
const handles = await app.evaluate(() => document.querySelectorAll('.tiptap .editor-image-view.editor-image-selected .editor-image-handle').length);
check('un clic sur le bloc le SÉLECTIONNE en entier (une image, ses poignées)', !!sel && sel.type === 'editorImage' && sel.hasText && handles === 4, { sel, handles });
// La poignée du coin haut gauche (celle du bas peut tomber sous le bas de la fenêtre de 400 px : le bloc fait la largeur du texte), tirée vers l'intérieur : le bloc rétrécit.
const before = await widthPx();
const corner = await a.inPage(await a.centerOf('.tiptap .editor-image-view.editor-image-selected .editor-image-handle-nw'));
await a.reach(corner);
await page.mouse.down();
await page.mouse.move(corner.x + 120, corner.y + 40, { steps: 8 });
await page.mouse.up();
await sleep(500);
const after = await widthPx();
check('glisser la poignée d’un coin le redimensionne (' + Math.round(before) + ' → ' + Math.round(after) + ' px)', after < before - 60, { before, after });
check('redimensionnée, la diapositive garde son texte et ses mots', (await images())[0].image.words >= 30, (await images())[0].image);
await clickBlock(0);
await a.press('Delete');
list = await blocks();
check('Suppr supprime le bloc entier', !list.some(b => b.image), list.map(b => b.type));
await a.press('Control+z');
await sleep(500);
list = await blocks();
check('Ctrl+Z le rend, à la taille qu’il avait', list.filter(b => b.image).length === 1 && Math.abs((await widthPx()) - after) < 3, { n: list.length, width: await widthPx(), after });

// --- Ctrl+F.
await a.clickText('Merci à toutes et à tous.');
await page.keyboard.press('Control+f');
await sleep(500);
await page.keyboard.type('open lab');
await sleep(700);
const found1 = await app.evaluate(() => ({ count: document.getElementById('pp-find-count').textContent, current: !!document.querySelector('.tiptap .editor-image-view.editor-image-slide.pp-find-current') }));
check('Ctrl+F trouve « open lab » dans le texte de la diapositive : UN résultat (« 1 sur 1 »), le bloc est cerclé', /1\D+1/.test(found1.count) && found1.current, found1);
await page.keyboard.press('Enter');
await sleep(300);
const none = await app.evaluate(() => { const input = document.getElementById('pp-find-input'); return input.value; });
check('(préparation) le champ garde « open lab »', none === 'open lab', none);
// « Remplacer » : le bloc reste tel quel, et le dit.
await a.click('#pp-find-toggle-replace', 0, 300);
await a.click('#pp-find-replacement', 0, 200);
await page.keyboard.type('Fermé');
await sleep(200);
const textBefore = (await images())[0].image.slideText;
await a.click('#pp-find-replace-one', 0, 500);
let afterReplace = await app.evaluate(() => ({ count: document.getElementById('pp-find-count').textContent }));
check('« Remplacer » laisse la diapositive telle quelle et le dit (« ne se remplace pas »)', (await images())[0].image.slideText === textBefore && /ne se remplace pas/.test(afterReplace.count), afterReplace);
await a.click('#pp-find-replace-all', 0, 500);
afterReplace = await app.evaluate(() => ({ count: document.getElementById('pp-find-count').textContent }));
check('« Tout remplacer » aussi : « 1 diapositive laissée », le texte de l’image n’a pas changé', (await images())[0].image.slideText === textBefore && /1 diapositive laissée/.test(afterReplace.count), afterReplace);
await a.click('#pp-find-close', 0, 300);

// --- « Garder liée ».
await a.click('#pp-slide-import-keep', 0, 300);
await a.clickText('Merci à toutes et à tous.');
await watchStatus();
await a.clickThumb(2, 0);
const linkedPlaced = await waitSaid(/3 de « Support » posée en bloc, liée à sa source\./);
check('« Garder liée » : la diapositive 3 est posée en bloc, liée à sa source, le coin d’état le dit', linkedPlaced, await said());
list = await blocks();
const linked = list.filter(b => b.image && b.image.link);
check('le bloc porte sa diapositive source (la présentation 8, son jeton, une diapositive, l’empreinte de la source)', linked.length === 1 && linked[0].image.link.model === 8 && !!linked[0].image.link.key && /^[a-z0-9]{8,24}$/.test(linked[0].image.link.slide) && !!linked[0].image.link.base, linked.map(b => b.image.link));
check('la ligne de « Support » a reçu le numéro de la diapositive, une fois', (await row8()).split('data-slide-id="' + linked[0].image.link.slide + '"').length === 2, null);
const sizeBefore = await app.evaluate(() => { const img = EditorCore.getEditor().state.doc; let w = null; img.descendants((n) => { if (n.type.name === 'editorImage' && n.attrs.slideLink) w = n.attrs.width; }); return w; });
// La barre de l'image dit à quelle diapositive elle est liée.
await clickBlock(1);
const bar = await app.evaluate(() => { const el = document.querySelector('.v2-copy-toolbar'); return el && el.getClientRects().length ? el.textContent.replace(/\s+/g, ' ').trim() : ''; });
check('la barre de l’image dit « Suit la diapositive 3 de « Support » » et propose « Détacher »', /Suit la diapositive 3 de « Support »/.test(bar) && /Détacher/.test(bar), bar);

// « Support » change ailleurs : le titre de la diapositive 3.
await watchStatus();
const rewrote = await app.evaluate(() => { const stub = window.__gristStub; const html = stub.getRow('Publipostage_Modeles', 8).Contenu; stub.remoteWrite('Publipostage_Modeles', 8, { Contenu: html.split('Arbitrages du 13 octobre 2026').join('Arbitrages du 20 novembre 2026'), DateModif: new Date().toISOString() }); return html.includes('Arbitrages du 13 octobre 2026'); });
check('(préparation) « Support » réécrite ailleurs : le titre de la diapositive 3 change', rewrote, null);
const refreshed = await waitFor(() => { let ok = false; EditorCore.getEditor().state.doc.descendants((n) => { if (n.type.name === 'editorImage' && n.attrs.slideLink && /20 novembre 2026/.test(n.attrs.slideText || '')) ok = true; }); return ok; }, null, 45000);
check('à la lecture suivante de l’enregistrement automatique, le bloc lié prend la nouvelle diapositive (son texte dit « 20 novembre 2026 »)', refreshed, await said());
await sleep(500);
list = await blocks();
const now = list.filter(b => b.image && b.image.link)[0];
check('il garde sa taille, son lien (même diapositive, nouvelle empreinte) et un texte alternatif à jour', !!now && now.image.width === sizeBefore && now.image.link.slide === linked[0].image.link.slide && now.image.link.base !== linked[0].image.link.base && /20 novembre 2026/.test(now.image.alt), { now, sizeBefore });
check('le coin d’état le dit : « Le bloc lié à « Support » a pris la dernière version de sa diapositive. »', (await said()).includes('Le bloc lié à « Support » a pris la dernière version de sa diapositive.'), await said());
// Une diapositive est ajoutée AVANT elle dans « Support » : son numéro passe de 3 à 4, le bloc lié se redessine avec (son contenu n'a pas bougé : c'est son rang qui change).
await watchStatus();
const inserted = await app.evaluate(() => { const stub = window.__gristStub; const html = stub.getRow('Publipostage_Modeles', 8).Contenu; const marks = Array.from(html.matchAll(/<div[^>]*page-break-marker[^>]*>[^<]*<\/div>/g)); if (marks.length < 2) return false; const at = marks[1].index; stub.remoteWrite('Publipostage_Modeles', 8, { Contenu: html.slice(0, at) + marks[1][0] + '<p>Diapositive ajoutée</p>' + html.slice(at), DateModif: new Date().toISOString() }); return true; });
check('(préparation) une diapositive est ajoutée avant la 3e dans « Support »', inserted, null);
const renumbered = await waitFor(() => { let ok = false; EditorCore.getEditor().state.doc.descendants((n) => { if (n.type.name === 'editorImage' && n.attrs.slideLink && /(^|\s)4\s*$/.test(n.attrs.slideText || '')) ok = true; }); return ok; }, null, 45000);
check('le bloc lié se redessine avec le nouveau rang : son numéro dit 4, son contenu n’a pas changé', renumbered, await said());
// « Détacher » : l'image reste, le lien part.
await clickBlock(1);
await a.click('.v2-copy-toolbar .v2-copy-detach', 0, 500);
list = await blocks();
check('« Détacher » : l’image reste, avec son texte, sans lien', list.filter(b => b.image).length === 2 && list.filter(b => b.image && b.image.link).length === 0 && /20 novembre 2026/.test(list.filter(b => b.image)[1].image.slideText), list.map(b => b.image ? b.image.link : null));
await a.press('Control+z');
await sleep(400);
list = await blocks();
check('un Ctrl+Z rend le lien', list.filter(b => b.image && b.image.link).length === 1, null);

// --- En anglais, thème sombre : les mots du volet, le coin d'état et le texte alternatif sont ceux de la langue, et la barre du lien dit son nom.
const B = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: 'en' }, seed: SEED, init: `window.__SLIDES = ${JSON.stringify(slides)};`, lang: 'en', colorScheme: 'dark' });
const b = toolsOf(B);
await sleep(1500);
const appB = B.app;
await b.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await b.clickRow('v2-btn-slide-text', 900);
await b.leaveMenu();
await b.pickSource('support');
const en = await appB.evaluate(() => ({ labels: Array.from(document.querySelectorAll('.pp-slide-import-kind-btn')).map(e => e.textContent), group: document.querySelector('.pp-slide-import-kind').getAttribute('aria-label'), hint: document.getElementById('pp-slide-import-hint').textContent }));
check('[en dark] le volet dit « As a block » / « As text » et « Click a slide to place it as a block »', en.labels.join('|') === 'As a block|As text' && /^Click a slide to place it as a block/.test(en.hint) && en.group === 'How to insert the slide', en);
await appB.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  new MutationObserver(() => window.__statusSeen.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
});
await b.clickThumb(2, 0);
const placedEn = await appB.waitForFunction(() => window.__statusSeen.some(m => /Slide 3 from “Support” placed as a block\./.test(m)), null, { timeout: 60000 }).then(() => true, () => false);
const altEn = await appB.evaluate(() => { let alt = ''; EditorCore.getEditor().state.doc.descendants((n) => { if (!alt && n.type.name === 'editorImage' && n.attrs.slideText) alt = n.attrs.alt; }); return alt; });
check('[en dark] « Slide 3 from “Support” placed as a block. » et le texte alternatif commence par « Slide: Arbitrages… »', placedEn && /^Slide: Arbitrages du 13 octobre 2026/.test(altEn), altEn);
const barColors = await appB.evaluate(() => { const on = document.querySelector('.pp-slide-import-kind-btn[aria-checked="true"]'); const s = getComputedStyle(on); const off = getComputedStyle(document.querySelector('.pp-slide-import-kind-btn[aria-checked="false"]')); return { onText: s.color, onBg: s.backgroundColor, offText: off.color }; });
const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const ratio = (a1, a2) => { const [hi, lo] = [lum(a1), lum(a2)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
check('[en dark] le bouton choisi se lit : texte sur son fond au moins 4,5:1', ratio(barColors.onText, barColors.onBg) >= 4.5, { barColors, ratio: ratio(barColors.onText, barColors.onBg) });

// --- Dans une fenêtre haute (900 x 760), les miniatures du volet font 148 px (« les diapos sont toutes petites »), plusieurs tiennent dans la liste, et le zoom suit tout de suite d'une miniature à l'autre.
const C = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE }, seed: SEED, init: `window.__SLIDES = ${JSON.stringify(slides)};`, lang: 'fr', colorScheme: 'light', width: 900, height: 760 });
const c = toolsOf(C);
await sleep(1500);
await c.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await c.clickRow('v2-btn-slide-text', 900);
await c.leaveMenu();
await c.pickSource('support');
const tall = await C.app.evaluate(() => { const l = document.querySelector('.pp-slide-import-list').getBoundingClientRect(); const thumbs = Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-thumb')).map(el => el.getBoundingClientRect()); return { widths: thumbs.map(r => Math.round(r.width)), heights: thumbs.map(r => Math.round(r.height)), inside: thumbs.filter(r => r.top >= l.top - 1 && r.bottom <= l.bottom + 1).length, overflowX: document.querySelector('.pp-slide-import-list').scrollWidth > document.querySelector('.pp-slide-import-list').clientWidth, panelRight: Math.round(document.querySelector('.pp-slide-import').getBoundingClientRect().right), right: Math.round(thumbs[0].right) }; });
check('dans une fenêtre haute (900 x 760), les trois miniatures font 148 px de large (83 de haut), tiennent toutes dans le volet, sans défilement de côté', tall.widths.join() === '148,148,148' && tall.heights.every(h => h >= 82 && h <= 84) && tall.inside === 3 && !tall.overflowX && tall.right <= tall.panelRight, tall);
await c.reach(await c.inPage(await c.centerOf('.pp-slide-import .pp-slide-thumb', 0)));
await sleep(550);
const tallZoom0 = await C.app.evaluate(zoomProbe);
check('au survol de la miniature 1, le zoom montre la diapositive en grand (520 px au plus), à gauche du volet', !!tallZoom0 && tallZoom0.w === 520 && tallZoom0.right <= tallZoom0.panelLeft && /Comité innovation/.test(tallZoom0.text), tallZoom0);
await C.app.evaluate(() => { const l = document.querySelector('.pp-slide-import-list'); l.scrollTop = 0; });
const tallAt1 = await c.inPage(await c.centerOf('.pp-slide-import .pp-slide-thumb', 1));
await C.page.mouse.move(tallAt1.x, tallAt1.y, { steps: 3 });
await sleep(150);
const tallZoom1 = await C.app.evaluate(zoomProbe);
check('d’une miniature à l’autre, le zoom suit tout de suite : la diapositive 2', !!tallZoom1 && /Ordre du jour/.test(tallZoom1.text) && !/Comité innovation/.test(tallZoom1.text), tallZoom1);
await c.reach(await c.inPage(await c.centerOf('.pp-slide-import .pp-slide-thumb', 2)));
await sleep(550);
await shot(C, 'volet-zoom-diapositive-3');
await c.clickThumb(2, 1200);
check('un clic sur la miniature ferme le zoom (la diapositive se pose)', (await C.app.evaluate(zoomProbe)) === null, await C.app.evaluate(zoomProbe));
await C.app.evaluate(() => { const img = document.querySelector('#editor-container .tiptap img.editor-image-slide, #editor-container .tiptap .editor-image-slide img'); if (img) img.scrollIntoView({ block: 'center' }); });
await sleep(400);
await shot(C, 'bloc-pose-numero-ecrit');

await t.finish();
