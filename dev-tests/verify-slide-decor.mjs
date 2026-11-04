#!/usr/bin/env node
// Le DÉCOR du thème d'une présentation (js/slide-theme.js : decorItems, decorElement, createExtension ; js/slide-props.js, js/free-frame.js, js/slides-entry.js : les sorties ; js/pptx-export.js : le masque ; extensions/diapositives/slide-decor-ui.js et
// slide-theme-ui.js : la fenêtre « Décor… » ; carte « Quel décor le thème pose-t-il sur toutes les diapositives ? », option « Décor réglé dans le thème », 02/11, fil « Ajouter un thème de présentation »), à la VRAIE souris et au vrai clavier, 700x400,
// français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active. Le décor est un bandeau de couleur, un logo, le numéro de la diapositive et un texte de pied, posés derrière toutes les diapositives.
//  LE BOUTON ET LA FENÊTRE : « Décor… » est sous les deux polices de la fenêtre « Thème… » (entier dans la fenêtre, 24 px au moins, lisible) et dit dans son infobulle ce que le décor contient ; la fenêtre du décor s'ouvre par-dessus celle du thème (qui reste), tient dans le panneau
//   sans défiler, ses champs sans objet sont grisés (l'épaisseur et les pastilles sans bandeau, le coin et la taille sans logo, la place du pied sans texte, la case « pas sur la première » sans numéro ni pied) ; Échap ne ferme qu'elle et ne change rien, le clavier revient au bouton.
//  LE LOGO : un vrai sélecteur de fichier ; une image est redessinée plus petite jusqu'à tenir dans le poids d'un logo (SVG rastérisé, photo en JPEG), un fichier illisible ou de plus de 10 Mo le dit sans rien changer.
//  LE BROUILLON : « Appliquer » rend le décor à la fenêtre du thème (son aperçu le montre, rien n'est écrit) ; un thème prêt LAISSE le décor réglé, « Aspect d'origine » l'ôte ; « Annuler » ne change rien.
//  LA POSE : le thème et son décor se posent d'un pas ; l'éditeur et les miniatures montrent le décor (le bandeau dans sa couleur de réglage, le logo, le numéro, le pied), la pagination est celle d'avant, un Ctrl+Z (vrai clavier) rend le thème sans décor et un Ctrl+Y le remet ; le décor est
//   enregistré avec le modèle et revient à la réouverture ; un thème du document garde son décor.
//  LES SORTIES : la Lecture (un décor par diapositive, le numéro de chacune, rien de plus sur la première avec « pas sur la première »), le PDF (une page par diapositive : le bandeau et le logo aux bons endroits), le Word (une forme derrière le texte par objet du décor), le PowerPoint (le masque, une mise en page de la première).
//  LES VUES (seconde partie, un modèle à part : la 1re diapositive porte une « Vue… » de la 3e, la 2e une vue de la 1re, la 3e a son propre fond bleu pâle) : la vue montre le décor de la diapositive MONTRÉE (le bandeau, le pied et le numéro 3 ; le bandeau seul pour la 1re),
//   le bandeau se voit dessus le fond propre d'une diapositive, dans l'éditeur, dans sa miniature et dans la vue (le décor passe après le repère qui dessine ce fond) ; la miniature de la diapositive qui porte la vue la montre avec son décor ; quand le thème perd son décor les vues se refont sans lui,
//   un Ctrl+Z le rend ; à la Lecture la vue porte les cadres de décor de la diapositive montrée.
// Lancé par run-headless.mjs (groupe Node « slideDecorMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-decor.mjs
// SLIDE_DECOR_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
// SLIDE_DECOR_ONLY=view : ne rejoue que la seconde partie (les vues), pour la relancer vite.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.SLIDE_DECOR_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slide-decor', port: Number(process.env.SLIDE_DECOR_PORT || 8968) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// Trois diapositives, la seconde plus fournie : le décor ne change rien à leur pagination.
const DOC = `<h1>Titre un</h1><p>Un texte.</p>${BR}<h2>Deux</h2><p>Premier paragraphe.</p><p>Deuxième paragraphe, un peu plus long que le premier pour occuper la ligne.</p><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<h2>Trois</h2><p>Fin.</p>`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Décor', '${DOC}', false, 'presentation');
  add(8, 'Autre', '<h1>Autre</h1><p>x</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TEXTS = {
  fr: {
    decor: 'Décor…', title: 'Décor du thème', none: 'Aucun décor pour l’instant.', all: 'Décor actuel : bandeau, logo, numéro, texte de pied.', choose: 'Choisir une image…', change: 'Changer l’image…', remove: 'Retirer',
    unreadable: /n’a pas pu être lue/, fileTooBig: /plus de 10 Mo/, clearAll: 'Tout retirer', apply: 'Appliquer', cancel: 'Annuler', footer: 'Grist Factory', mine: 'Marque', saveTool: 'Enregistrer comme thème…', ocean: 'Océan', applied: 'Thème « Océan » appliqué.',
  },
  en: {
    decor: 'Decoration…', title: 'Theme decoration', none: 'No decoration yet.', all: 'Current decoration: band, logo, slide number, footer text.', choose: 'Choose an image…', change: 'Change image…', remove: 'Remove',
    unreadable: /could not be read/, fileTooBig: /over 10 MB/, clearAll: 'Remove all', apply: 'Apply', cancel: 'Cancel', footer: 'Grist Factory', mine: 'Brand', saveTool: 'Save as theme…', ocean: 'Ocean', applied: 'Theme “Ocean” applied.',
  },
};
const T_ROW = { fr: 'Thème…', en: 'Theme…' };
const D = '#pp-slide-decor ';
const TH = '#pp-slide-theme ';
const hexRgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const closeRgb = (got, want, tolerance = 8) => !!got && got.every((v, i) => Math.abs(v - want[i]) <= tolerance);
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
const ORANGE = '#d9742a';
// Deux listes de mots, sans compter leur ordre (les objets du décor se rangent à la peinture, pas à l'écran).
const sameWords = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
async function realClick(page, selector) {
  const c = await boxOf(page, selector);
  if (!c || !c.width) throw new Error('introuvable ou masqué : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(c.x, c.y);
  await sleep(250);
  return c;
}
const away = async (page) => { await page.mouse.move(300, HEIGHT - 70, { steps: 4 }); await sleep(250); };
async function openPageMenu(page) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 14, btn.y - 6, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 4 });
  await sleep(350);
  return btn;
}
async function clickThemeRow(page) {
  const btn = await openPageMenu(page);
  const row = await boxOf(page, '#v2-btn-slide-theme');
  if (!row || !row.width) throw new Error('ligne « Thème… » masquée');
  await page.mouse.move(btn.x, row.y, { steps: 8 });
  await page.mouse.move(row.x, row.y, { steps: 3 });
  await sleep(120);
  await page.mouse.click(row.x, row.y);
  await sleep(600);
  await away(page);
}
// Des pixels d'une capture : [r, g, b] à chaque point { x, y }.
async function pixelsAt(page, points) {
  const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
  return page.evaluate(async ([data64, pts]) => {
    const bytes = Uint8Array.from(atob(data64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return pts.map(({ x, y }) => { const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; });
  }, [b64, points]);
}
const pixelAt = async (page, x, y) => (await pixelsAt(page, [{ x, y }]))[0];
// Le PDF relu par pdf.js : le nombre de pages et la couleur de points de chaque page (fractions de sa largeur et de sa hauteur).
const readPdf = (page, b64, points) => page.evaluate(async ([data64, pts]) => {
  if (!window.pdfjsLib) {
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const raw = atob(data64);
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
  const doc = await window.pdfjsLib.getDocument({ data }).promise;
  const colors = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    colors.push(pts.map(([fx, fy]) => { const d = ctx.getImageData(Math.min(canvas.width - 1, Math.floor(fx * vp.width)), Math.min(canvas.height - 1, Math.floor(fy * vp.height)), 1, 1).data; return [d[0], d[1], d[2]]; }));
  }
  return { numPages: doc.numPages, colors };
}, [b64, points || []]);

// Un PNG fait dans la page : w x h, d'une couleur, ou de bruit (il ne se comprime pas : l'échelle des tailles du logo y passe par le JPEG).
const makePng = (page, w, h, kind) => page.evaluate(([width, height, mode, color]) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (mode === 'noise') {
    const image = g.createImageData(width, height);
    for (let i = 0; i < image.data.length; i += 4) { image.data[i] = Math.random() * 256; image.data[i + 1] = Math.random() * 256; image.data[i + 2] = Math.random() * 256; image.data[i + 3] = 255; }
    g.putImageData(image, 0, 0);
  } else { g.fillStyle = color; g.fillRect(0, 0, width, height); }
  return canvas.toDataURL('image/png').split(',')[1];
}, [w, h, kind, ORANGE]);

// La fenêtre du décor.
const decorWindow = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-slide-decor');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const box = overlay.querySelector('.pp-modal-box');
  const body = overlay.querySelector('.pp-modal-body');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const field = name => overlay.querySelector('[data-field="' + name + '"]');
  const state = (name) => { const s = field(name); return { value: s.value, disabled: s.disabled, rect: rect(s), label: s.getAttribute('aria-label') }; };
  const swatches = Array.from(overlay.querySelectorAll('.pp-slide-decor-swatch')).map(b => ({ slot: b.dataset.slot, checked: b.getAttribute('aria-checked'), disabled: b.disabled, tab: b.tabIndex, background: getComputedStyle(b).backgroundColor, label: b.getAttribute('aria-label'), width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height }));
  const controls = Array.from(overlay.querySelectorAll('select, input, button')).filter(el => el.getClientRects().length > 0 && !el.disabled);
  const covered = controls.filter((el) => { const q = el.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(hit === el || el.contains(hit)); }).map(el => el.dataset.field || el.dataset.slot || el.textContent.trim() || el.className);
  const paper = overlay.querySelector('.pp-slide-theme-paper');
  const logo = paper.querySelector('.pp-slide-decor-logo');
  const tool = overlay.querySelector('.pp-modal-body .pp-slide-decor-tool');
  const clear = Array.from(overlay.querySelectorAll('.pp-modal-body .pp-slide-decor-tool'))[1];
  const input = overlay.querySelector('.pp-slide-decor-input');
  const check = overlay.querySelector('.pp-slide-decor-check input');
  const active = document.activeElement;
  const buttons = Array.from(overlay.querySelectorAll('.pp-modal-actions button')).map(b => ({ text: b.textContent.trim(), rect: rect(b), primary: b.classList.contains('var-modal-primary') }));
  return {
    title: overlay.querySelector('h3').textContent, labelledBy: box.getAttribute('aria-labelledby'), titleId: overlay.querySelector('h3').id, describedBy: box.getAttribute('aria-describedby'),
    box: rect(box), scrolls: body.scrollHeight > body.clientHeight + 1 || box.scrollHeight > box.clientHeight + 1,
    edge: state('edge'), bsize: state('bsize'), lpos: state('lpos'), lsize: state('lsize'), npos: state('npos'), fpos: state('fpos'), swatches,
    logoButton: { text: tool.textContent.trim(), rect: rect(tool) }, logoClear: { text: clear.textContent.trim(), hidden: clear.hidden || clear.getClientRects().length === 0, rect: rect(clear) },
    footer: { value: input.value, rect: rect(input), placeholder: input.placeholder, label: input.getAttribute('aria-label') },
    skip: { checked: check.checked, disabled: check.disabled, title: check.parentElement.title, rect: rect(check) },
    status: overlay.querySelector('.pp-slide-decor-status').textContent,
    paper: rect(paper), items: paper.querySelectorAll('.pp-slide-decor-page > *').length, logoSrc: logo ? logo.src : '', texts: Array.from(paper.querySelectorAll('.pp-slide-decor-text')).map(x => x.textContent),
    buttons, covered, focus: active ? (active.dataset.field || active.dataset.slot || (active.textContent || '').trim() || active.className) : '', inside: overlay.contains(active),
  };
});
// La fenêtre du thème : ses lignes cochées, son aperçu, le bouton « Décor… ».
const themeWindow = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-slide-theme');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const paper = overlay.querySelector('.pp-slide-theme-paper');
  const button = overlay.querySelector('.pp-slide-theme-decor');
  const body = overlay.querySelector('.pp-modal-body');
  const box = overlay.querySelector('.pp-modal-box');
  const fonts = overlay.querySelector('.pp-slide-theme-fonts');
  const selects = Array.from(overlay.querySelectorAll('.pp-slide-theme-select')).map(rect);
  return {
    checked: Array.from(overlay.querySelectorAll('.pp-slide-theme-row[aria-checked="true"]')).map(r => r.dataset.value), paper: rect(paper), items: paper.querySelectorAll('.pp-slide-decor-page > *').length, texts: Array.from(paper.querySelectorAll('.pp-slide-decor-text')).map(x => x.textContent),
    button: { text: button.textContent.trim(), title: button.title, rect: rect(button), focused: document.activeElement === button }, fontsRect: rect(fonts), selects, box: rect(box), scrolls: body.scrollHeight > body.clientHeight + 1,
    caption: overlay.querySelector('.pp-slide-theme-caption').textContent, focus: document.activeElement ? (document.activeElement.dataset.value || document.activeElement.dataset.slot || (document.activeElement.textContent || '').trim()) : '',
  };
});
const themeOf = page => page.evaluate(() => { const theme = PageLayout.getTheme(); return theme ? JSON.parse(JSON.stringify(theme)) : null; });
const unsaved = page => page.evaluate(() => LiveEntry.hasUnsavedEdits());
const status = page => page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
const selectWord = (page, needle) => page.evaluate((word) => {
  const ed = EditorCore.getEditor();
  let found = null;
  ed.state.doc.descendants((node, pos) => { if (!found && node.isText && node.text.indexOf(word) !== -1) found = { from: pos + node.text.indexOf(word), to: pos + node.text.indexOf(word) + word.length }; });
  ed.chain().focus().setTextSelection(found).run();
}, needle);
// Les blocs du texte de l'éditeur (sans les décors) : leur place sous le haut du texte, au demi-pixel (la pagination).
const blockTops = page => page.evaluate(() => {
  const root = document.querySelector('#editor-container .ProseMirror');
  const top = root.getBoundingClientRect().top;
  return Array.from(root.children).filter(el => !el.classList.contains('pp-slide-decor')).map(el => Math.round((el.getBoundingClientRect().top - top) * 2) / 2);
});
// Amène un élément dans la vue (`block` : 'start' pour son haut, 'end' pour son bas) et attend que la page ait fini de défiler (sa place ne bouge plus pendant quelques images).
const bringIntoView = (page, selector, index, block) => page.evaluate(async ([sel, at, align]) => {
  const el = document.querySelectorAll(sel)[at];
  if (!el) return false;
  el.scrollIntoView({ block: align, behavior: 'instant' });
  await new Promise((done) => {
    let last = '';
    let same = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const key = r.top + ',' + r.left;
      if (key === last) { if (++same >= 4) return done(); } else { same = 0; last = key; }
      requestAnimationFrame(tick);
    };
    tick();
  });
  return true;
}, [selector, index, block]);
// Le décor de la diapositive n° `n` (à partir de 0) dans l'éditeur : sa page, ses objets et les fractions de la page où ils tombent. `block` : 'start' (le haut de la page dans la vue : le logo) ou 'end' (le bas : le bandeau et les textes de pied).
async function editorDecor(page, n, block) {
  const found = await bringIntoView(page, '#editor-container .tiptap .pp-slide-decor-page', n, block || 'start');
  if (!found) return null;
  return page.evaluate((index) => {
    const widgets = Array.from(document.querySelectorAll('#editor-container .tiptap .pp-slide-decor'));
    const pageEl = document.querySelectorAll('#editor-container .tiptap .pp-slide-decor-page')[index];
    const q = pageEl.getBoundingClientRect();
    const frac = (b) => ({ x: (b.left - q.left) / q.width, y: (b.top - q.top) / q.height, w: b.width / q.width, h: b.height / q.height });
    const box = selector => pageEl.querySelector(selector) ? frac(pageEl.querySelector(selector).getBoundingClientRect()) : null;
    return { count: widgets.length, page: { left: q.left, top: q.top, width: q.width, height: q.height }, band: box('.pp-slide-decor-band'), logo: box('.pp-slide-decor-logo'), texts: Array.from(pageEl.querySelectorAll('.pp-slide-decor-text')).map(x => x.textContent) };
  }, n);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const save = async () => { await away(page); await realClick(page, '#btn-save'); await sleep(1000); await away(page); };
  const open = async (id, slides) => {
    if (await unsaved(page)) await save();
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    return page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
  };
  const chooseRow = async (value) => { await realClick(page, `${TH}.pp-slide-theme-row[data-value="${value}"]`); await sleep(150); };
  // Le choix d'un fichier par le vrai sélecteur du navigateur.
  const chooseFile = async (file) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), realClick(page, D + '.pp-modal-body .pp-slide-decor-tool')]);
    await chooser.setFiles(file);
    await sleep(900);
  };
  // Le décor réglé à la souris et au clavier : un bandeau en bas, épais, du deuxième accent ; le logo orange en haut à droite ; le numéro en bas à droite ; le pied en bas à gauche ; ni numéro ni pied sur la première.
  const setDecor = async () => {
    await page.selectOption(D + '[data-field="edge"]', 'bottom');
    await sleep(150);
    await realClick(page, D + '.pp-slide-decor-swatch[data-slot="accent2"]');
    await page.selectOption(D + '[data-field="bsize"]', 'thick');
    await page.selectOption(D + '[data-field="npos"]', 'br');
    await realClick(page, D + '.pp-slide-decor-input');
    await page.keyboard.type(T.footer);
    await page.selectOption(D + '[data-field="fpos"]', 'bl');
    await realClick(page, D + '.pp-slide-decor-check input');
    await chooseFile({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(page, 600, 240, 'plain'), 'base64') });
    await page.selectOption(D + '[data-field="lpos"]', 'tr');
    await sleep(200);
  };
  // Les couleurs des deux thèmes prêts utilisés, en minuscules (la forme qu'a le thème posé).
  const presetOf = id => page.evaluate(i => { const theme = SlideTheme.normalize(SlideThemes.byId(i).theme); return { colors: theme.colors, fonts: theme.fonts }; }, id);

  if (!await open(7, 3)) { check(tag + 'le modèle « Décor » s\'ouvre', false); await page.context().close(); return; }
  const ocean = await presetOf('ocean');
  const forest = await presetOf('forest');
  const accent2 = { ocean: ocean.colors.accent2.toLowerCase(), forest: forest.colors.accent2.toLowerCase() };

  // 1) Le bouton « Décor… ».
  await clickThemeRow(page);
  await chooseRow('ocean');
  let tw = await themeWindow(page);
  check(tag + `« ${T.decor} » est sous les deux polices, entier dans la fenêtre du thème, de 24 px au moins, lisible (4,5:1) ; l'infobulle dit qu'il n'y a pas de décor ; la fenêtre du thème tient toujours dans le panneau sans défiler`,
    !!tw && tw.button.text === T.decor && inPanel(tw.button.rect) && tw.button.rect.height >= 24 && tw.button.rect.top >= tw.selects[1].bottom - 0.5 && tw.button.rect.left >= tw.fontsRect.left - 0.5 && tw.button.title.endsWith(T.none)
      && (await contrastOf(page, TH + '.pp-slide-theme-decor')) >= 4.5 && inPanel(tw.box) && !tw.scrolls && tw.items === 0, tw && { button: tw.button, selects: tw.selects, scrolls: tw.scrolls, items: tw.items });
  await snap(page, `${lang}-${colorScheme}-d1-theme`);

  // 2) La fenêtre du décor.
  await realClick(page, TH + '.pp-slide-theme-decor');
  let dw = await decorWindow(page);
  check(tag + 'un vrai clic ouvre la fenêtre du décor, titrée, reliée à son titre et à sa description, devant celle du thème (qui reste ouverte), dans le panneau, sans défiler, le clavier sur le premier champ (le bord du bandeau)',
    !!dw && dw.title === T.title && dw.labelledBy === dw.titleId && !!dw.describedBy && inPanel(dw.box) && !dw.scrolls && !!(await themeWindow(page)) && dw.focus === 'edge' && !dw.covered.length, dw && { title: dw.title, box: dw.box, scrolls: dw.scrolls, focus: dw.focus, covered: dw.covered });
  if (!dw) { await snap(page, tag.replace(/\W+/g, '') + 'echec'); await page.context().close(); return; }
  await snap(page, `${lang}-${colorScheme}-d2-fenetre`);
  check(tag + 'sans décor : le bord est « aucun », l\'épaisseur et les huit pastilles sont grisées, le logo est à choisir (« ' + T.remove + ' » caché, coin et taille grisés), le numéro « aucun », le pied vide (sa place grisée), la case grisée avec sa raison, l\'aperçu n\'a aucun objet',
    dw.edge.value === '' && dw.bsize.disabled && dw.swatches.length === 8 && dw.swatches.every(s => s.disabled) && dw.logoButton.text === T.choose && dw.logoClear.hidden && dw.lpos.disabled && dw.lsize.disabled && dw.npos.value === '' && dw.footer.value === '' && dw.fpos.disabled
      && dw.skip.disabled && dw.skip.title.length > 10 && dw.items === 0, { edge: dw.edge, bsize: dw.bsize, swatches: dw.swatches.map(s => s.disabled), logo: dw.logoButton.text, clear: dw.logoClear, skip: dw.skip, items: dw.items });
  check(tag + 'les champs actifs sont atteignables (24 px de haut au moins, 20 px pour les pastilles), les deux boutons « ' + T.cancel + ' » et « ' + T.apply + ' » (le second principal) et « ' + T.clearAll + ' » sont dans le panneau',
    dw.edge.rect.height >= 24 && dw.npos.rect.height >= 24 && dw.footer.rect.height >= 24 && dw.logoButton.rect.height >= 24 && dw.buttons.length === 3 && dw.buttons[0].text === T.clearAll && dw.buttons[1].text === T.cancel && dw.buttons[2].text === T.apply && dw.buttons[2].primary && dw.buttons.every(b => inPanel(b.rect)),
    { heights: [dw.edge.rect.height, dw.npos.rect.height, dw.footer.rect.height, dw.logoButton.rect.height], buttons: dw.buttons.map(b => b.text) });
  check(tag + 'les textes se lisent (4,5:1) : le titre de la rangée, la liste du bord, le texte de pied', (await contrastOf(page, D + '.pp-slide-decor-row-label')) >= 4.5 && (await contrastOf(page, D + '[data-field="edge"]')) >= 4.5 && (await contrastOf(page, D + '.pp-slide-decor-intro')) >= 4.5,
    [await contrastOf(page, D + '.pp-slide-decor-row-label'), await contrastOf(page, D + '[data-field="edge"]'), await contrastOf(page, D + '.pp-slide-decor-intro')]);

  // 3) Le bandeau, le numéro, le pied.
  await page.selectOption(D + '[data-field="edge"]', 'bottom');
  await sleep(150);
  dw = await decorWindow(page);
  check(tag + 'avec un bandeau, l\'épaisseur et les pastilles sont dégrisées, le premier accent est coché (une pastille seule atteinte par Tab), l\'aperçu a un objet', !dw.bsize.disabled && dw.swatches.every(s => !s.disabled) && dw.swatches.filter(s => s.checked === 'true').map(s => s.slot).join() === 'accent1' && dw.swatches.filter(s => s.tab === 0).length === 1 && dw.items === 1,
    { bsize: dw.bsize.disabled, swatches: dw.swatches.map(s => [s.slot, s.checked, s.disabled, s.tab]), items: dw.items });
  check(tag + 'les pastilles sont les huit réglages du thème (titres, texte, six accents), nommées, aux couleurs d\'« ' + T.ocean + ' »', ['title', 'text', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].every((slot, i) => dw.swatches[i].slot === slot && dw.swatches[i].background === 'rgb(' + hexRgb(ocean.colors[slot]).join(', ') + ')' && /· #[0-9A-F]{6}$/.test(dw.swatches[i].label)),
    dw.swatches.map(s => [s.slot, s.background, s.label]));
  await realClick(page, D + '.pp-slide-decor-swatch[data-slot="accent2"]');
  await page.selectOption(D + '[data-field="bsize"]', 'thick');
  dw = await decorWindow(page);
  const paper = dw.paper;
  const band = await pixelAt(page, paper.left + paper.width * 0.5, paper.top + paper.height * 0.97);
  const above = await pixelAt(page, paper.left + paper.width * 0.5, paper.top + paper.height * 0.7);
  check(tag + 'un vrai clic sur la pastille « accent 2 » : l\'aperçu peint le bandeau du bas dans cette couleur, la page au-dessus reste celle du fond', closeRgb(band, hexRgb(accent2.ocean)) && closeRgb(above, hexRgb(ocean.colors.bg)), { band, above, want: accent2.ocean });
  await page.selectOption(D + '[data-field="npos"]', 'br');
  await realClick(page, D + '.pp-slide-decor-input');
  await page.keyboard.type(T.footer);
  dw = await decorWindow(page);
  check(tag + 'le texte de pied tapé au vrai clavier : sa place est dégrisée (« en bas à gauche »), l\'aperçu a deux textes (le pied et le numéro), la case est dégrisée', dw.footer.value === T.footer && !dw.fpos.disabled && dw.fpos.value === 'bl' && sameWords(dw.texts, [T.footer, '2']) && !dw.skip.disabled && dw.skip.title === '', { footer: dw.footer.value, fpos: dw.fpos, texts: dw.texts, skip: dw.skip });
  await realClick(page, D + '.pp-slide-decor-check input');
  dw = await decorWindow(page);
  check(tag + 'la case « pas sur la première » se coche à la souris', dw.skip.checked === true, dw.skip);

  // 4) Le logo : le vrai sélecteur de fichier.
  await chooseFile({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(page, 600, 240, 'plain'), 'base64') });
  dw = await decorWindow(page);
  check(tag + 'un PNG de 600x240 choisi : le bouton devient « ' + T.change + ' », « ' + T.remove + ' » apparaît, le coin et la taille sont dégrisés (en haut à droite, moyen), l\'aperçu montre le logo (une image PNG qui tient dans le poids d\'un logo), sans message',
    dw.logoButton.text === T.change && !dw.logoClear.hidden && !dw.lpos.disabled && !dw.lsize.disabled && dw.lpos.value === 'tr' && dw.lsize.value === 'medium' && /^data:image\/png;base64,/.test(dw.logoSrc) && dw.logoSrc.length <= 72000 && dw.status === '' && dw.items === 4,
    { button: dw.logoButton.text, clear: dw.logoClear.hidden, logo: dw.logoSrc.slice(0, 30) + ' ' + dw.logoSrc.length, status: dw.status, items: dw.items });
  const orangeSpot = await pixelAt(page, paper.left + paper.width * 0.93, paper.top + paper.height * 0.045);
  check(tag + 'le logo orange est dans le coin haut droit de l\'aperçu', closeRgb(orangeSpot, hexRgb(ORANGE)), orangeSpot);
  await snap(page, `${lang}-${colorScheme}-d3-decor`);
  // Un fichier qui n'est pas une image, un fichier de plus de 10 Mo : le message, rien ne change.
  const keepLogo = dw.logoSrc;
  await chooseFile({ name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci n\'est pas une image') });
  dw = await decorWindow(page);
  check(tag + 'un fichier illisible le dit (en rouge lisible, sous le formulaire) et laisse le logo tel quel', T.unreadable.test(dw.status) && dw.logoSrc === keepLogo && (await contrastOf(page, D + '.pp-slide-decor-status')) >= 4.5 && inPanel(dw.box) && !dw.scrolls, { status: dw.status, same: dw.logoSrc === keepLogo, scrolls: dw.scrolls });
  await chooseFile({ name: 'gros.png', mimeType: 'image/png', buffer: Buffer.alloc(11 * 1024 * 1024) });
  dw = await decorWindow(page);
  check(tag + 'un fichier de plus de 10 Mo le dit et laisse le logo tel quel', T.fileTooBig.test(dw.status) && dw.logoSrc === keepLogo, { status: dw.status });
  // Une photo (du bruit, 1600x1000, plusieurs Mo) : redessinée plus petite, en JPEG, jusqu'à tenir ; un SVG : rastérisé en PNG.
  await chooseFile({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(page, 1600, 1000, 'noise'), 'base64') });
  dw = await decorWindow(page);
  check(tag + 'une photo de 1600x1000 (bruit, ne se comprime pas) est réduite jusqu\'à tenir (JPEG, 72 000 caractères au plus), le message est effacé', dw.status === '' && /^data:image\/(jpeg|png);base64,/.test(dw.logoSrc) && dw.logoSrc.length <= 72000 && dw.logoSrc !== keepLogo, { status: dw.status, logo: dw.logoSrc.slice(0, 26) + ' ' + dw.logoSrc.length });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#ff0000"/></svg>';
  await chooseFile({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  dw = await decorWindow(page);
  check(tag + 'un SVG est rastérisé en PNG (jamais gardé tel quel : il peut porter un script)', /^data:image\/png;base64,/.test(dw.logoSrc) && !/svg/.test(dw.logoSrc.slice(0, 30)) && dw.status === '', { status: dw.status, logo: dw.logoSrc.slice(0, 30) });
  await chooseFile({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(page, 600, 240, 'plain'), 'base64') });
  // « Retirer » ôte le logo (le clavier va au bouton de choix), « Tout retirer » vide le tout.
  await realClick(page, D + '.pp-modal-body .pp-slide-decor-tool:nth-of-type(2)');
  dw = await decorWindow(page);
  check(tag + '« ' + T.remove + ' » ôte le logo : le bouton redevient « ' + T.choose + ' », le coin et la taille se grisent, l\'aperçu perd son image, le clavier est sur le bouton de choix', dw.logoButton.text === T.choose && dw.logoClear.hidden && dw.lpos.disabled && dw.logoSrc === '' && dw.focus === T.choose, { button: dw.logoButton.text, focus: dw.focus, src: dw.logoSrc.length });
  await chooseFile({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(page, 600, 240, 'plain'), 'base64') });
  dw = await decorWindow(page);

  // 5) Échap ne ferme que la fenêtre du décor, sans rien changer ; le clavier revient au bouton.
  await page.keyboard.press('Escape');
  await sleep(350);
  tw = await themeWindow(page);
  check(tag + 'Échap ferme la fenêtre du décor seule : celle du thème reste ouverte, son aperçu n\'a aucun décor, le clavier est revenu sur le bouton « ' + T.decor + ' »', (await decorWindow(page)) === null && !!tw && tw.items === 0 && tw.button.focused && (await themeOf(page)) === null, tw && { items: tw.items, focused: tw.button.focused });
  await realClick(page, TH + '.pp-slide-theme-decor');
  dw = await decorWindow(page);
  check(tag + 'rouverte, la fenêtre du décor est vide : ce qui n\'a pas été appliqué est perdu', !!dw && dw.edge.value === '' && dw.logoSrc === '' && dw.footer.value === '' && dw.items === 0, dw && { edge: dw.edge.value, items: dw.items });
  // Une image encore en lecture quand la fenêtre se ferme n'entre pas dans la fenêtre rouverte. La lecture est retenue par le test (ImageIo.load attend qu'on la lâche), pour qu'elle soit
  // sûrement en cours à la fermeture ET à la réouverture : Échap, la fenêtre rouverte, puis la lecture est lâchée et va jusqu'au bout (sans cette retenue, une petite image finit avant la fermeture).
  await page.evaluate(() => {
    const gate = window.__decorGate = { loaded: false, release: null, real: ImageIo.load };
    const held = new Promise(resolve => { gate.release = resolve; });
    ImageIo.load = async function (...args) {
      await held;
      const image = await gate.real.apply(this, args);
      gate.loaded = true;
      return image;
    };
  });
  await chooseFile({ name: 'lente.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(page, 600, 240, 'plain'), 'base64') });
  const waiting = await decorWindow(page);
  await page.keyboard.press('Escape');
  await sleep(350);
  await realClick(page, TH + '.pp-slide-theme-decor');
  const reopened = await decorWindow(page);
  await page.evaluate(() => window.__decorGate.release());
  await page.waitForFunction(() => window.__decorGate.loaded === true, null, { timeout: 8000 });
  await sleep(500);
  await page.evaluate(() => { ImageIo.load = window.__decorGate.real; delete window.__decorGate; });
  dw = await decorWindow(page);
  check(tag + 'une image encore en lecture quand la fenêtre se ferme n\'entre pas dans la fenêtre rouverte (elle reste sans logo, sans message, alors que la lecture est allée au bout)',
    !!waiting && waiting.logoSrc === '' && !!reopened && reopened.logoSrc === '' && !!dw && dw.logoSrc === '' && dw.status === '' && dw.logoButton.text === T.choose && dw.items === 0,
    dw && { waiting: waiting && waiting.logoSrc.length, reopened: reopened && reopened.logoSrc.length, logo: dw.logoSrc.length, status: dw.status, button: dw.logoButton.text, items: dw.items });
  // Le clavier : Tab saute les champs grisés (l'épaisseur, les pastilles, le coin et la taille du logo, la place du pied), Entrée dans le texte de pied valide la fenêtre.
  const walk = [];
  for (let n = 0; n < 3; n++) { await page.keyboard.press('Tab'); await sleep(80); walk.push((await decorWindow(page)).focus); }
  await page.keyboard.type('Clavier');
  await page.keyboard.press('Enter');
  await sleep(400);
  tw = await themeWindow(page);
  check(tag + 'au clavier : Tab saute les champs grisés (le bouton du logo, le numéro, le texte de pied), Entrée dans le texte de pied valide la fenêtre : le brouillon a le pied tapé, le clavier est revenu sur « ' + T.decor + ' »',
    walk.join('|') === [T.choose, 'npos', 'pp-slide-decor-input'].join('|') && (await decorWindow(page)) === null && !!tw && sameWords(tw.texts, ['Clavier']) && tw.button.focused, { walk, texts: tw && tw.texts, focused: tw && tw.button.focused });
  await realClick(page, TH + '.pp-slide-theme-decor');
  await realClick(page, D + '.pp-modal-actions .var-modal-danger');
  await realClick(page, D + '.pp-modal-actions .var-modal-primary');
  await sleep(350);
  tw = await themeWindow(page);
  check(tag + '« ' + T.clearAll + ' » puis « ' + T.apply + ' » rend le brouillon sans décor, « ' + T.ocean + ' » reste coché', !!tw && tw.items === 0 && tw.checked.join() === 'ocean', tw && { items: tw.items, checked: tw.checked });
  await realClick(page, TH + '.pp-slide-theme-decor');

  // 6) Appliquer : le décor entre dans le brouillon, l'aperçu du thème le montre.
  await setDecor();
  dw = await decorWindow(page);
  await realClick(page, D + '.pp-modal-actions .var-modal-primary');
  await sleep(400);
  tw = await themeWindow(page);
  const themePaper = tw && tw.paper;
  const draftBand = themePaper ? await pixelAt(page, themePaper.left + themePaper.width * 0.5, themePaper.top + themePaper.height * 0.97) : null;
  check(tag + '« ' + T.apply + ' » ferme la fenêtre du décor : celle du thème reste, « ' + T.ocean + ' » est toujours coché, son aperçu montre le décor (quatre objets, le bandeau dans la couleur du deuxième accent), l\'infobulle du bouton liste ce qu\'il contient, le clavier est sur lui, rien n\'est écrit',
    (await decorWindow(page)) === null && !!tw && tw.checked.join() === 'ocean' && tw.items === 4 && closeRgb(draftBand, hexRgb(accent2.ocean)) && tw.button.title.endsWith(T.all) && tw.button.focused && (await themeOf(page)) === null && !(await unsaved(page)),
    tw && { checked: tw.checked, items: tw.items, draftBand, title: tw.button.title, focused: tw.button.focused });
  await snap(page, `${lang}-${colorScheme}-d4-brouillon`);
  // Un thème prêt change les couleurs, pas le décor ; « Aspect d'origine » l'ôte ; « Annuler » ne change rien.
  await chooseRow('forest');
  tw = await themeWindow(page);
  const forestBand = await pixelAt(page, tw.paper.left + tw.paper.width * 0.5, tw.paper.top + tw.paper.height * 0.97);
  check(tag + 'un clic sur « Forêt » garde le décor réglé : quatre objets, le bandeau prend le deuxième accent de la forêt, la ligne est cochée', tw.checked.join() === 'forest' && tw.items === 4 && closeRgb(forestBand, hexRgb(accent2.forest)), { checked: tw.checked, items: tw.items, forestBand, want: accent2.forest });
  await chooseRow('');
  tw = await themeWindow(page);
  check(tag + '« Aspect d\'origine » n\'est aucun thème : le décor part avec lui, l\'infobulle dit qu\'il n\'y en a plus', tw.checked.join() === '' && tw.items === 0 && tw.button.title.endsWith(T.none), { checked: tw.checked, items: tw.items, title: tw.button.title });
  await realClick(page, `${TH}.pp-modal-actions button:not(.var-modal-primary):not(.var-modal-spacer):not(.pp-slide-theme-tool)`);
  await sleep(300);
  check(tag + '« ' + T.cancel + ' » ne pose rien : pas de thème, pas de décor dans l\'éditeur', (await themeOf(page)) === null && (await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-slide-decor').length)) === 0 && !(await unsaved(page)), [await themeOf(page)]);

  // 7) La pose : le thème « Océan » seul (la pagination d'avant), puis son décor.
  await clickThemeRow(page);
  await chooseRow('ocean');
  await realClick(page, TH + '.pp-modal-actions .var-modal-primary');
  await sleep(900);
  const topsBefore = await blockTops(page);
  check(tag + 'le thème « ' + T.ocean + ' » posé sans décor : aucun décor dans l\'éditeur', (await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-slide-decor').length)) === 0 && (await themeOf(page)).name === T.ocean && !(await themeOf(page)).decor, await themeOf(page));
  // Le modèle est enregistré avant la pose du décor : l'enregistrement automatique de la pose d'« Océan » (deux secondes et demie après) ne peut pas tomber au milieu de celle du décor.
  if (await unsaved(page)) await save();
  await clickThemeRow(page);
  await realClick(page, TH + '.pp-slide-theme-decor');
  await setDecor();
  await realClick(page, D + '.pp-modal-actions .var-modal-primary');
  await sleep(300);
  await realClick(page, TH + '.pp-modal-actions .var-modal-primary');
  // Le modèle est marqué modifié tout de suite (l'enregistrement automatique le range deux secondes et demie plus tard).
  const unsavedRightAfter = await unsaved(page);
  await sleep(1200);
  const applied = await themeOf(page);
  const decorGot = applied && applied.decor;
  const posed = {
    decor: !!decorGot, band: !!decorGot && decorGot.band.edge === 'bottom' && decorGot.band.color === 'accent2' && decorGot.band.size === 'thick', logo: !!decorGot && !!decorGot.logo && /^data:image\/png/.test(decorGot.logo.src) && decorGot.logo.pos === 'tr',
    number: !!decorGot && !!decorGot.number && decorGot.number.pos === 'br', footer: !!decorGot && !!decorGot.footer && decorGot.footer.text === T.footer, skip: !!decorGot && decorGot.skipFirst === true, name: !!applied && applied.name === T.ocean, unsaved: unsavedRightAfter,
  };
  check(tag + 'le thème et son décor sont posés : le décor est dans le thème de la page (bandeau en bas du deuxième accent, logo, numéro, pied, pas sur la première), le modèle est modifié', Object.values(posed).every(Boolean), posed);
  const topsAfter = await blockTops(page);
  check(tag + 'la pagination est celle d\'avant : chaque bloc du texte est à la même place avec le décor et sans lui', topsBefore.length > 5 && JSON.stringify(topsBefore) === JSON.stringify(topsAfter), { before: topsBefore, after: topsAfter });
  // Le haut de la deuxième page (le logo), puis son bas (le bandeau, les textes) : la page de 314 px ne tient pas entière dans la zone de l'éditeur à 700x400.
  const secondTop = await editorDecor(page, 1, 'start');
  const logoPx = secondTop ? await pixelAt(page, secondTop.page.left + secondTop.page.width * 0.93, secondTop.page.top + secondTop.page.height * 0.045) : null;
  const second = await editorDecor(page, 1, 'end');
  const bandPx = second ? await pixelAt(page, second.page.left + second.page.width * 0.5, second.page.top + second.page.height * 0.97) : null;
  check(tag + 'l\'éditeur montre le décor de chaque diapositive (trois) : sur la deuxième, le bandeau du bas est dans la couleur du deuxième accent, le logo orange est en haut à droite, le pied et le numéro (2) sont en bas',
    !!second && second.count === 3 && closeRgb(bandPx, hexRgb(accent2.ocean)) && closeRgb(logoPx, hexRgb(ORANGE)) && sameWords(second.texts, [T.footer, '2']) && second.band.h > 0.04 && second.band.h < 0.06 && second.logo.x > 0.85, { second, secondTop, bandPx, logoPx });
  const first = await editorDecor(page, 0, 'start');
  check(tag + '« pas sur la première » : la première diapositive a le bandeau et le logo mais ni pied ni numéro', !!first && !!first.band && !!first.logo && first.texts.length === 0, first);
  await snap(page, `${lang}-${colorScheme}-d5-editeur`);
  const thumbs = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map((item) => {
    const decor = item.querySelector('.pp-slide-decor-page');
    if (!decor) return null;
    const r = decor.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, texts: Array.from(decor.querySelectorAll('.pp-slide-decor-text')).map(x => x.textContent) };
  }));
  const thumbPx = thumbs[1] ? await pixelAt(page, thumbs[1].left + thumbs[1].width * 0.5, thumbs[1].top + thumbs[1].height * 0.97) : null;
  check(tag + 'les trois miniatures montrent le décor : le bandeau de la deuxième est dans la couleur du deuxième accent, la première n\'a ni pied ni numéro', thumbs.length === 3 && thumbs.every(x => !!x) && closeRgb(thumbPx, hexRgb(accent2.ocean)) && thumbs[0].texts.length === 0 && thumbs[1].texts.length === 2, { thumbs, thumbPx });

  // Supprimer une diapositive renumérote celles d'après : leurs blocs n'ont pas changé, seul le décor (le numéro, le pied de la première) se refait. Les miniatures gardent donc les éléments de leurs blocs
  // (une marque posée sur chacun survit) : les recopier à chaque suppression coûtait des centaines de millisecondes sur une longue présentation.
  await page.evaluate(() => document.querySelectorAll('.pp-slide-item').forEach((item, i) => {
    Array.from(item.querySelector('.pp-slide-page').children).forEach((child) => { if (!child.classList.contains('pp-slide-decor')) child.__kept = i + 1; });
  }));
  const thumbMarks = () => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map((item) => {
    const kids = Array.from(item.querySelector('.pp-slide-page').children);
    return {
      kept: kids.filter(child => !child.classList.contains('pp-slide-decor')).map(child => child.__kept || 0),
      decors: kids.filter(child => child.classList.contains('pp-slide-decor')).length,
      texts: Array.from(item.querySelectorAll('.pp-slide-decor-text')).map(x => x.textContent),
    };
  }));
  const allMarked = (list, n) => list.length > 0 && list.every(v => v === n);
  const before = await thumbMarks();
  await page.evaluate(() => document.querySelector('.pp-slide-item').focus());
  await page.keyboard.press('Delete');
  await sleep(900);
  const afterDelete = await thumbMarks();
  check(tag + 'Suppr efface la première diapositive : les deux autres miniatures gardent leurs blocs (les mêmes éléments) et changent de décor : la nouvelle première n\'a plus ni pied ni numéro, la suivante passe au numéro 2',
    before.length === 3 && afterDelete.length === 2 && allMarked(afterDelete[0].kept, 2) && allMarked(afterDelete[1].kept, 3) && afterDelete.every(x => x.decors === 1) && afterDelete[0].texts.length === 0 && sameWords(afterDelete[1].texts, [T.footer, '2']),
    { before, afterDelete });
  await page.keyboard.press('Control+z');
  await sleep(900);
  const afterRestore = await thumbMarks();
  check(tag + 'Ctrl+Z rend la première diapositive : les deux miniatures d\'avant gardent encore leurs blocs et reprennent leur numéro (2 et 3), la première n\'a ni pied ni numéro',
    afterRestore.length === 3 && allMarked(afterRestore[1].kept, 2) && allMarked(afterRestore[2].kept, 3) && afterRestore.every(x => x.decors === 1) && afterRestore[0].texts.length === 0 && sameWords(afterRestore[1].texts, [T.footer, '2']) && sameWords(afterRestore[2].texts, [T.footer, '3']),
    { afterRestore });

  // 8) Un Ctrl+Z (vrai clavier) rend le thème sans décor, un Ctrl+Y le remet.
  await selectWord(page, 'Titre');
  await page.keyboard.press('Control+z');
  await sleep(900);
  const undone = await themeOf(page);
  const widgetsAfterUndo = await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-slide-decor').length);
  check(tag + 'un Ctrl+Z défait la pose d\'un pas : le thème n\'a plus de décor (« ' + T.ocean + ' » sans rien d\'autre), l\'éditeur n\'a plus de décor', !!undone && !undone.decor && widgetsAfterUndo === 0, { undone: undone && undone.name, widgets: widgetsAfterUndo });
  await selectWord(page, 'Titre');
  await page.keyboard.press('Control+y');
  await sleep(900);
  const redone = await themeOf(page);
  check(tag + 'un Ctrl+Y remet le décor', !!redone && !!redone.decor && redone.decor.footer.text === T.footer && (await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-slide-decor').length)) === 3, redone && JSON.stringify(redone.decor).slice(0, 80));

  // 9) Un thème du document garde son décor ; un thème sans décor laisse celui qu'on a réglé.
  await clickThemeRow(page);
  await realClick(page, `${TH}.pp-slide-theme-save`);
  await sleep(400);
  await page.keyboard.type(T.mine);
  await realClick(page, '#pp-dialog-modal .var-modal-primary');
  await sleep(600);
  tw = await themeWindow(page);
  check(tag + '« ' + T.saveTool + ' » : « ' + T.mine + ' » est rangé, coché, avec son décor (le logo compris) dans la liste du document',
    !!tw && tw.checked.join() === 'my:' + T.mine && (await page.evaluate(() => { const l = Templates.getDocumentSettings().themes || []; return l.length === 1 && !!l[0].decor && !!l[0].decor.logo && l[0].decor.footer.text === 'Grist Factory'; })), tw && tw.checked);
  await realClick(page, TH + '.pp-slide-theme-decor');
  await realClick(page, D + '.pp-modal-actions .var-modal-danger');
  dw = await decorWindow(page);
  await realClick(page, D + '.pp-modal-actions .var-modal-primary');
  await sleep(350);
  tw = await themeWindow(page);
  check(tag + '« ' + T.clearAll + ' » puis « ' + T.apply + ' » : le brouillon n\'a plus de décor, « ' + T.ocean + ' » est coché (les couleurs et les polices sont les siennes), « ' + T.mine + ' » ne l\'est plus (il avait un décor)',
    !!dw && dw.items === 0 && !!tw && tw.items === 0 && tw.checked.join() === 'ocean', { items: tw && tw.items, checked: tw && tw.checked });
  await chooseRow('my:' + T.mine);
  tw = await themeWindow(page);
  check(tag + 'un clic sur « ' + T.mine + ' » rend le décor du thème du document (quatre objets), la ligne est cochée', tw.checked.join() === 'my:' + T.mine && tw.items === 4, { checked: tw.checked, items: tw.items });
  await realClick(page, `${TH}.pp-modal-actions button:not(.var-modal-primary):not(.var-modal-spacer):not(.pp-slide-theme-tool)`);
  await sleep(300);

  // 10) Le décor est enregistré avec le modèle et revient à la réouverture.
  await save();
  const stored = await page.evaluate(() => { const m = window.__gristStub.state.rows.Publipostage_Modeles; return m.Margins[m.id.indexOf(7)]; });
  check(tag + 'Grist a reçu le décor dans la colonne Margins du modèle (clé theme, sous-clé decor), le logo compris', typeof stored === 'string' && /"decor":\{"band"/.test(stored) && /"logo":\{"src":"data:image\/png/.test(stored), String(stored).slice(0, 120));
  if (await open(8, 1)) {
    const other = await themeOf(page);
    check(tag + 'l\'autre modèle n\'a ni thème ni décor (le décor est celui de CE modèle)', other === null && (await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-slide-decor').length)) === 0, other);
  }
  if (await open(7, 3)) {
    const back = await themeOf(page);
    check(tag + 'rouvert, le modèle a son décor (le thème, trois décors dans l\'éditeur, trois diapositives)', !!back && !!back.decor && back.decor.band.color === 'accent2' && (await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-slide-decor').length)) === 3, back && JSON.stringify(back.decor).slice(0, 60));
  }

  // 11) La Lecture : un décor par diapositive.
  await realClick(page, '#btn-mode-read');
  await sleep(1600);
  const reader = await page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll('.reader-content [data-ff-decor]'));
    return { count: frames.length, numbers: frames.map(f => f.textContent.trim()).filter(x => /^\d+$/.test(x)), footers: frames.filter(f => /Grist Factory/.test(f.textContent)).length, bands: frames.filter(f => f.getAttribute('data-ff-fill')).map(f => f.getAttribute('data-ff-fill')), logos: frames.filter(f => f.querySelector('img')).length };
  });
  check(tag + 'la Lecture a le décor : dix cadres (trois bandeaux, trois logos, deux pieds et deux numéros, ni l\'un ni l\'autre sur la première), les numéros 2 et 3, les bandeaux du deuxième accent d\'« ' + T.ocean + ' »',
    reader.count === 10 && reader.numbers.join() === '2,3' && reader.footers === 2 && reader.bands.length === 3 && reader.bands.every(c => c.toLowerCase() === accent2.ocean) && reader.logos === 3, reader);
  await bringIntoView(page, '.reader-content [data-ff-decor][data-ff-fill] > .pp-free-frame-box', 1, 'center');
  const bandSpot = await page.evaluate(() => {
    const f = Array.from(document.querySelectorAll('.reader-content [data-ff-decor][data-ff-fill]'))[1];
    const q = (f.querySelector('.pp-free-frame-box') || f).getBoundingClientRect();
    return { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width, h: q.height };
  });
  const readerBand = await pixelAt(page, bandSpot.x, bandSpot.y);
  check(tag + 'dans la Lecture, le bandeau de la deuxième diapositive se voit dans la couleur du deuxième accent', closeRgb(readerBand, hexRgb(accent2.ocean)), { readerBand, bandSpot });
  await snap(page, `${lang}-${colorScheme}-d6-lecture`);
  await realClick(page, '#btn-mode-edit');
  await sleep(700);

  // 12) Le diaporama (F5, au vrai clavier) : le bandeau du bas et le logo en haut à droite de chacune des trois diapositives.
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await sleep(200);
  await page.keyboard.press('F5');
  await sleep(1500);
  const shown = [];
  for (let k = 0; k < 3; k++) {
    const [bandSeen, logoSeen] = await pixelsAt(page, [{ x: WIDTH * 0.5, y: HEIGHT * 0.965 }, { x: WIDTH * 0.93, y: HEIGHT * 0.06 }]);
    shown.push({ band: bandSeen, logo: logoSeen });
    if (k === 1) await snap(page, `${lang}-${colorScheme}-d7-diaporama`);
    if (k < 2) { await page.keyboard.press('ArrowRight'); await sleep(1100); }
  }
  check(tag + 'le diaporama (F5) montre le décor de chaque diapositive : le bandeau du bas du deuxième accent et le logo orange en haut à droite, sur les trois', shown.every(s => closeRgb(s.band, hexRgb(accent2.ocean)) && closeRgb(s.logo, hexRgb(ORANGE))), shown);
  await page.keyboard.press('Escape');
  await sleep(700);

  if (full) {
    // Le PDF : une page par diapositive, le bandeau du bas et le logo en haut à droite sur chacune.
    const [pdfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), realClick(page, '#btn-export-pdf')]);
    const points = [[0.5, 0.97], [0.93, 0.045], [0.5, 0.6]];
    const pdf = await readPdf(page, readFileSync(await pdfDownload.path()).toString('base64'), points);
    check(tag + 'le PDF a trois pages ; sur chacune le bandeau du bas est dans la couleur du deuxième accent, le logo orange est en haut à droite, le milieu de la page est resté blanc',
      pdf.numPages === 3 && pdf.colors.every(c => closeRgb(c[0], hexRgb(accent2.ocean), 12) && closeRgb(c[1], hexRgb(ORANGE), 12) && closeRgb(c[2], [255, 255, 255], 12)), pdf.colors);
    // Le Word : une forme ou une image derrière le texte par objet du décor.
    await page.evaluate(() => { const sel = document.getElementById('v2-export-type'); sel.value = 'docx'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    const [wordDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), realClick(page, '#btn-export-pdf')]);
    const xml = await page.evaluate(async (data) => { await ExportCommon.ensureJsZipLoaded(); const zip = await JSZip.loadAsync(data, { base64: true }); return zip.file('word/document.xml').async('string'); }, readFileSync(await wordDownload.path()).toString('base64'));
    const anchors = (xml.match(/<wp:anchor[\s\S]*?<\/wp:anchor>/g) || []).filter(a => /behindDoc="1"/.test(a));
    check(tag + 'le Word a dix objets derrière le texte pour le décor (trois bandeaux de la couleur du deuxième accent, trois logos, deux pieds, deux numéros)',
      anchors.length >= 10 && anchors.filter(a => new RegExp('<a:srgbClr val="' + accent2.ocean.slice(1) + '"', 'i').test(a)).length === 3 && (xml.match(/Grist Factory/g) || []).length === 2, { anchors: anchors.length, bands: anchors.filter(a => new RegExp(accent2.ocean.slice(1), 'i').test(a)).length, footers: (xml.match(/Grist Factory/g) || []).length });
    // Le PowerPoint : le décor est sur le masque, la première diapositive a sa mise en page.
    await page.evaluate(() => { const sel = document.getElementById('v2-export-type'); sel.value = 'pptx'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(500);
    const [pptDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), realClick(page, '#btn-export-pdf')]);
    const ppt = await page.evaluate(async (data) => {
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(data, { base64: true });
      const text = async path => (zip.file(path) ? zip.file(path).async('string') : '');
      return { master: await text('ppt/slideMasters/slideMaster1.xml'), layout2: await text('ppt/slideLayouts/slideLayout2.xml'), slide1: await text('ppt/slides/_rels/slide1.xml.rels'), slide2: await text('ppt/slides/_rels/slide2.xml.rels'), media: Object.keys(zip.files).filter(n => /^ppt\/media\//.test(n)) };
    }, readFileSync(await pptDownload.path()).toString('base64'));
    await page.evaluate(() => { const sel = document.getElementById('v2-export-type'); sel.value = 'pdf'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    check(tag + 'le PowerPoint : le masque porte le bandeau (accent2), le logo, le champ du numéro et le pied ; la première diapositive prend la mise en page n° 2 (masque caché, bandeau et logo repris), les autres la première',
      /<a:schemeClr val="accent2"\/>/.test(ppt.master) && /<p:pic>/.test(ppt.master) && /type="slidenum"/.test(ppt.master) && /Grist Factory/.test(ppt.master) && /showMasterSp="0"/.test(ppt.layout2) && /<p:pic>/.test(ppt.layout2) && !/Grist Factory/.test(ppt.layout2)
        && /slideLayout2\.xml/.test(ppt.slide1) && /slideLayout1\.xml/.test(ppt.slide2) && ppt.media.length === 1, { media: ppt.media, layout2: ppt.layout2.slice(0, 120) });
  }

  await away(page);
  check(tag + 'aucune boîte native ouverte pendant tout le parcours', natives.length === 0, natives);
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Une « Vue… » de diapositive (js/slide-view.js ; extensions/diapositives/slide-strip.js : pageCopy) montre la diapositive AVEC son décor : celui de la diapositive MONTRÉE (son rang, pas celui du cadre qui la porte),
// dans l'éditeur (la copie que la bande sait faire), dans la miniature de la diapositive qui porte la vue et à la Lecture (le HTML résolu a déjà ses cadres de décor) ; la vue suit le thème : décor retiré, puis rendu par Ctrl+Z.
const VIEW_PROPS = 'class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"';
const VIEW_MARK = (id, extra = '') => `<div ${VIEW_PROPS} data-anchor="${id}"${extra}></div>`;
const VIEW_FRAME = (id, text) => `<div class="pp-free-frame" role="group" data-ff-x="300" data-ff-y="150" data-ff-w="360" data-ff-h="202.5" data-ff-fill="#ffffff" data-ff-line="#bfbfbf" data-ff-lw="0.75" data-ff-view="${id}" data-ff-link="#${id}"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${text}</p></div></div></div>`;
// Trois diapositives : la 1re porte la vue de la 3e (rang 2 : bandeau, pied et numéro), la 2e la vue de la 1re (rang 0 : le bandeau seul, « pas sur la première »).
const VIEW_DOC = [
  `${VIEW_MARK('slide-1')}<h1>Accueil</h1><p>Bienvenue</p>${VIEW_FRAME('slide-3', 'Merci')}`,
  `${VIEW_MARK('slide-2')}<h2>Les chiffres</h2><p>Chiffres du mois</p>${VIEW_FRAME('slide-1', 'Accueil')}`,
  `${VIEW_MARK('slide-3', ' data-bg="#e8f0fe"')}<h2>Merci</h2><p>Fin de la présentation</p>`,
].join(BR);
const VIEW_ORANGE = '#e07a1f';
const VIEW_FOOTER = 'Pied de test';
const VIEW_THEME = { v: 1, name: 'Océan', colors: { bg: '#ffffff', text: '#1f2937', title: '#0b3c5d', accent1: '#1d6fa5', accent2: VIEW_ORANGE, accent3: '#2e8b57', accent4: '#8e44ad', accent5: '#c0392b', accent6: '#7f8c8d' }, fonts: { title: 'Arial', body: 'Arial' }, decor: { band: { edge: 'bottom', size: 'thick', color: 'accent2' }, number: { pos: 'br' }, footer: { text: VIEW_FOOTER, pos: 'bl' }, skipFirst: true } };
const VIEW_SEED = seedModels({ record: RECORD }) + `
  add(7, 'Vue et décor', '${VIEW_DOC}', false, 'presentation');
  m.Margins[m.id.indexOf(7)] = ${JSON.stringify(JSON.stringify({ theme: VIEW_THEME }))};
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
async function runView(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] vue : `;
  const { page, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: VIEW_SEED, lang, colorScheme });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), 7);
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length === 3, null, { timeout: 15000 }).catch(() => {});
  await sleep(1800);
  // Le décor que chaque vue de l'éditeur porte, par diapositive montrée : le nombre de bandeaux et les textes (pied, numéro).
  const editorViews = () => page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-free-frame[data-ff-view]')).map((frame) => {
    const sheet = frame.querySelector('.pp-ff-view-page');
    return { view: frame.getAttribute('data-ff-view'), sheet: !!sheet, bands: sheet ? sheet.querySelectorAll('.pp-slide-decor-band').length : -1, texts: sheet ? Array.from(sheet.querySelectorAll('.pp-slide-decor-text')).map(x => x.textContent) : [] };
  }));
  const pick = (views, id) => views.find(v => v.view === id) || null;
  const decorOf3 = v => !!v && v.bands === 1 && sameWords(v.texts, [VIEW_FOOTER, '3']);
  const decorOf1 = v => !!v && v.bands === 1 && v.texts.length === 0;
  const noDecor = v => !!v && v.sheet && v.bands === 0 && v.texts.length === 0;

  // 1) L'éditeur : le décor de la diapositive montrée, à son rang.
  const views = await editorViews();
  check(tag + 'dans l\'éditeur, la vue de la 3e diapositive porte son décor (le bandeau, le pied « ' + VIEW_FOOTER + ' », le numéro 3) et celle de la 1re le bandeau seul (« pas sur la première » : ni pied ni numéro)',
    views.length === 2 && decorOf3(pick(views, 'slide-3')) && decorOf1(pick(views, 'slide-1')), views);
  await bringIntoView(page, '#editor-container .pp-free-frame[data-ff-view="slide-3"] .pp-free-frame-box', 0, 'center');
  const sheet3 = await boxOf(page, '#editor-container .pp-free-frame[data-ff-view="slide-3"] .pp-ff-view-page');
  const [bandPx, midPx] = sheet3 ? await pixelsAt(page, [{ x: sheet3.left + sheet3.width * 0.5, y: sheet3.top + sheet3.height * 0.975 }, { x: sheet3.left + sheet3.width * 0.5, y: sheet3.top + sheet3.height * 0.7 }]) : [null, null];
  check(tag + 'le bandeau se voit au bas de la vue, dans la couleur du deuxième accent, et le milieu de la page garde le fond de la diapositive montrée',
    !!sheet3 && inPanel(sheet3) && closeRgb(bandPx, hexRgb(VIEW_ORANGE)) && closeRgb(midPx, hexRgb('#e8f0fe')), { sheet: sheet3 && { top: sheet3.top, height: sheet3.height }, bandPx, midPx });

  // La 3e diapositive a son propre fond (bleu pâle) : le bandeau est dessus, dans l'éditeur comme dans sa miniature (le décor passe après le repère qui dessine ce fond).
  await bringIntoView(page, '#editor-container .ProseMirror > .pp-slide-decor > .pp-slide-decor-page', 2, 'end');
  const page3 = await page.evaluate(() => { const r = document.querySelectorAll('#editor-container .ProseMirror > .pp-slide-decor > .pp-slide-decor-page')[2].getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });
  const [editorBand, editorMid] = await pixelsAt(page, [{ x: page3.left + page3.width * 0.5, y: page3.top + page3.height * 0.985 }, { x: page3.left + page3.width * 0.5, y: page3.top + page3.height * 0.6 }]);
  check(tag + 'dans l\'éditeur, la 3e diapositive (fond bleu pâle) a son bandeau dessus, dans la couleur du deuxième accent, et son milieu garde le fond', closeRgb(editorBand, hexRgb(VIEW_ORANGE)) && closeRgb(editorMid, hexRgb('#e8f0fe')), { editorBand, editorMid, page: page3 });
  await page.evaluate(() => document.querySelectorAll('.pp-slide-item')[2].scrollIntoView({ block: 'nearest', behavior: 'instant' }));
  await sleep(300);
  const thumb3 = await page.evaluate(() => { const r = document.querySelectorAll('.pp-slide-item')[2].querySelector('.pp-slide-decor-page').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  const [thumbBand, thumbMid] = await pixelsAt(page, [{ x: thumb3.left + thumb3.width * 0.5, y: thumb3.top + thumb3.height * 0.96 }, { x: thumb3.left + thumb3.width * 0.5, y: thumb3.top + thumb3.height * 0.6 }]);
  check(tag + 'la miniature de la 3e diapositive (fond bleu pâle) a son bandeau dessus, dans la couleur du deuxième accent, et son milieu garde le fond', closeRgb(thumbBand, hexRgb(VIEW_ORANGE)) && closeRgb(thumbMid, hexRgb('#e8f0fe')), { thumbBand, thumbMid, thumb: thumb3 });

  // 2) La miniature de la 1re diapositive montre sa vue avec le décor de la 3e.
  const thumbViews = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map(item => item.querySelectorAll('.pp-ff-view .pp-slide-decor-band').length));
  check(tag + 'la miniature de la 1re diapositive montre sa vue avec le bandeau de la 3e, celle de la 2e la vue de la 1re (un bandeau), la 3e n\'a pas de vue', thumbViews.length === 3 && thumbViews[0] === 1 && thumbViews[1] === 1 && thumbViews[2] === 0, thumbViews);

  // 3) Le thème perd son décor (la fenêtre « Thème… », « Décor… », « Tout retirer », « Appliquer » deux fois) : les vues se refont sans lui ; un Ctrl+Z (vrai clavier) le rend.
  await clickThemeRow(page);
  await realClick(page, TH + '.pp-slide-theme-decor');
  await realClick(page, D + '.pp-modal-actions .var-modal-danger');
  await realClick(page, D + '.pp-modal-actions .var-modal-primary');
  await sleep(300);
  await realClick(page, TH + '.pp-modal-actions .var-modal-primary');
  await sleep(1200);
  const bare = await editorViews();
  check(tag + 'quand le thème perd son décor, les deux vues se refont sans bandeau ni textes (sans attendre un changement du texte)', bare.length === 2 && noDecor(pick(bare, 'slide-3')) && noDecor(pick(bare, 'slide-1')) && !(await themeOf(page)).decor, bare);
  await selectWord(page, 'Accueil');
  await page.keyboard.press('Control+z');
  await sleep(1200);
  const back = await editorViews();
  check(tag + 'un Ctrl+Z rend le décor : les deux vues le portent de nouveau', back.length === 2 && decorOf3(pick(back, 'slide-3')) && decorOf1(pick(back, 'slide-1')) && !!(await themeOf(page)).decor, back);

  // 4) La Lecture : la vue porte les cadres de décor de la diapositive montrée (le bandeau, le pied et le numéro de la 3e ; le bandeau de la 1re).
  await page.click('#btn-mode-read');
  await sleep(1800);
  const read = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .pp-free-frame[data-ff-view]')).map((frame) => {
    const sheet = frame.querySelector('.pp-ff-view-page');
    return { view: frame.getAttribute('data-ff-view'), frames: sheet ? sheet.querySelectorAll('[data-ff-decor]').length : -1 };
  }));
  check(tag + 'à la Lecture, la vue de la 3e diapositive porte trois cadres de décor (bandeau, pied, numéro) et celle de la 1re un seul (le bandeau)', read.length === 2 && (read.find(v => v.view === 'slide-3') || {}).frames === 3 && (read.find(v => v.view === 'slide-1') || {}).frames === 1, read);

  check(tag + 'aucune erreur de page, aucune boîte native', errors.length === 0 && natives.length === 0, { errors, natives });
  await page.context().close();
}

const ONLY_VIEW = process.env.SLIDE_DECOR_ONLY === 'view';   // seulement l'essai des vues (pour le relancer vite)
if (!ONLY_VIEW) await run('fr', 'light', true);
await runView('fr', 'light');
if (!ONLY_VIEW) await run('en', 'dark', false);
await runView('en', 'dark');
await t.finish();
