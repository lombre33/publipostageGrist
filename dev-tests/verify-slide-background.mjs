#!/usr/bin/env node
// Le fond d'une diapositive (js/slide-props.js, css/free-frame.css, extensions/diapositives/slide-background-ui.js, slide-strip.js, js/pdf-export.js, js/docx-export.js ; demande du 21/10 à 18:35, quatrième
// fonction : « fond de diapositive »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
// Un fond est une couleur unie sur toute la page, sous le texte ; il se pose dans une fenêtre du menu ⋯ d'une miniature et vit dans le même repère caché (hauteur nulle) que la transition.
//  LE MENU ET LA FENÊTRE : la ligne « Fond… » juste après « Transition… » ; la fenêtre (titre, palette de tous les menus de couleur, couleurs gardées, « Sans fond », « Personnalisé… », aperçu, « Appliquer à
//   toutes ») tient dans le panneau, un brouillon : rien n'est écrit avant « Appliquer », « Annuler » et Échap ne changent rien, UN Ctrl+Z défait ; au clavier Tab entre dans la palette par la couleur choisie,
//   les flèches passent d'une pastille à l'autre.
//  LE REPÈRE : le fond et la transition d'une diapositive vivent dans le même repère, sans se gêner (poser l'un ne touche pas l'autre, retirer l'un garde l'autre) ; un repère qui ne dit plus rien s'efface ;
//   dupliquer, déplacer, supprimer, importer l'emportent avec la diapositive ; Retour arrière au début d'une diapositive ne l'efface pas ; une diapositive vidée le retrouve.
//  LE DESSIN : sous le texte et sous les cadres libres, sur toute la page (éditeur, miniatures), sans décaler l'éditeur d'un pixel ; la Lecture, le diaporama, le PDF (autant de pages que de diapositives) et le
//   Word (forme derrière le texte) le montrent ; le HTML et le Markdown, qui n'ont pas de page, n'en gardent rien, pas même une boîte vide.
//  LES VALEURS : une couleur illisible n'est pas un fond, une couleur courte ou en majuscules est écrite #rrggbb en minuscules ; un fond enregistré puis rouvert revient à l'identique ; un modèle qui n'en a
//   jamais posé s'écrit comme avant.
// Lancé par run-headless.mjs (groupe Node "slideBackground", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-background.mjs
// SLIDE_BACKGROUND_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; SLIDE_BACKGROUND_ONLY=1,3 : ne joue que ces parties (essai) ; sans eux, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.SLIDE_BACKGROUND_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const ONLY = (process.env.SLIDE_BACKGROUND_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = part => !ONLY.length || ONLY.includes(String(part));
const t = await start({ name: 'verify-slide-background', port: Number(process.env.SLIDE_BACKGROUND_PORT || 8966) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// Le repère, écrit comme l'enregistrement le fait : `trans` ([effet, côté, durée]) et/ou le fond.
const MARK = (bg, trans) => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0${bg ? '' : ';overflow:hidden'}"${trans ? ` data-trans="${trans[0]}" data-trans-from="${trans[1]}" data-trans-dur="${trans[2]}"` : ''}${bg === null ? '' : ` data-bg="${bg}"`}></div>`;
const BOXF = (x, y, w, h, fill, html) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-fill="${fill}"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;

// Quatre diapositives : un fond jaune ; rien ; un fond bleu avec une poussée et un cadre plein blanc ; rien.
const FOUR = `${MARK('#fde047')}<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}${MARK('#0369a1', ['push', 'r', 1000])}${BOXF(100, 300, 300, 80, '#ffffff', '<p>Cadre</p>')}<h2>Trois</h2><p>Texte trois</p>${BR}<p>Quatre</p>`;
const FOUR_PLAIN = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}${BOXF(100, 300, 300, 80, '#ffffff', '<p>Cadre</p>')}<h2>Trois</h2><p>Texte trois</p>${BR}<p>Quatre</p>`;
// Trois pages d'un seul titre : rouge, blanche, bleue (de quoi mesurer en pixels, loin du texte).
const PIXELS = `${MARK('#d00000')}<h2>Rouge</h2>${BR}<h2>Blanche</h2>${BR}${MARK('#0000d0')}<h2>Bleue</h2>`;
// Des valeurs écrites à la main : une couleur nommée (illisible pour nous), courte, en majuscules, rgb(), vide.
const ODD = `${MARK('red')}<h1>Nommée</h1>${BR}${MARK('#FDE')}<h2>Courte</h2>${BR}${MARK('#ABCDEF')}<h2>Majuscules</h2>${BR}${MARK('rgb(1, 2, 3)')}<h2>Rgb</h2>${BR}${MARK('')}<h2>Vide</h2>`;
// Une source à importer : deux diapositives dont la première a un fond vert.
const SOURCE = `${MARK('#15803d')}<h1>Source un</h1><p>Source texte un</p>${BR}<h2>Source deux</h2>`;
const ONE = h => `<h1>${h}</h1>`;
// Trois diapositives pour Retour arrière : la première sans repère, la deuxième avec un fond bleu et une poussée, la troisième avec un fond jaune.
const FUSION = `<h1>Un</h1><p>Premier</p>${BR}${MARK('#0369a1', ['push', 'r', 1000])}<h2>Deux</h2><p>Texte deux</p>${BR}${MARK('#fde047')}<h2>Trois</h2><p>Fin</p>`;

// 7 « Fonds » (le menu, la fenêtre), 8 « Pixels », 10 « Valeurs », 12 « Source », 14 « Frappe » (le texte), 15 « Gestes », 16 « Cible », 17 « Sans » (le même texte sans repère), 18 « Sorties », 19 « Enregistre »,
// 20 « Plus tard », 21 « Fusion ». Chaque essai qui écrit a son modèle.
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Fonds', '${FOUR}', false, 'presentation');
  add(8, 'Pixels', '${PIXELS}', false, 'presentation');
  add(10, 'Valeurs', '${ODD}', false, 'presentation');
  add(12, 'Source', '${SOURCE}', false, 'presentation');
  add(14, 'Frappe', '${FOUR}', false, 'presentation');
  add(15, 'Gestes', '${FOUR}', false, 'presentation');
  add(16, 'Cible', '${ONE('Cible un')}${BR}<h2>Cible deux</h2>', false, 'presentation');
  add(17, 'Sans', '${FOUR_PLAIN}', false, 'presentation');
  add(18, 'Sorties', '${FOUR}', false, 'presentation');
  add(19, 'Enregistre', '${FOUR_PLAIN}', false, 'presentation');
  add(20, 'Plus tard', '${FOUR_PLAIN}', false, 'presentation');
  add(21, 'Fusion', '${FUSION}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: {
    menuRow: 'Fond…', title: n => `Fond de la diapositive ${n}`, titleMany: n => `Fond des ${n} diapositives`, intro: 'Une couleur unie derrière tout ce qu’il y a sur la diapositive.', colorLabel: 'Couleur', palette: 'Palette de couleurs',
    none: 'Sans fond', custom: 'Personnalisé…', noneCaption: 'Sans fond : la page reste blanche.', mixed: 'Les diapositives choisies n’ont pas le même fond : celui de la première est montré.',
    apply: 'Appliquer', applyAll: 'Appliquer à toutes', cancel: 'Annuler',
    applied: n => `Fond posé sur ${n} ${n > 1 ? 'diapositives' : 'diapositive'}.`, removed: n => `Fond retiré de ${n} ${n > 1 ? 'diapositives' : 'diapositive'}.`, unchanged: 'Le fond est déjà tel quel.',
    savedModel: 'Couleurs du modèle', sampleTitle: 'Titre', sampleText: 'Un peu de texte', dark: 'Le texte noir se lit mal sur ce fond.',
  },
  en: {
    menuRow: 'Background…', title: n => `Background of slide ${n}`, titleMany: n => `Background of the ${n} slides`, intro: 'A solid color behind everything on the slide.', colorLabel: 'Color', palette: 'Color palette',
    none: 'No background', custom: 'Custom…', noneCaption: 'No background: the page stays white.', mixed: 'The chosen slides do not all have the same background: the first one’s is shown.',
    apply: 'Apply', applyAll: 'Apply to all', cancel: 'Cancel',
    applied: n => `Background set on ${n} ${n > 1 ? 'slides' : 'slide'}.`, removed: n => `Background removed from ${n} ${n > 1 ? 'slides' : 'slide'}.`, unchanged: 'The background is already set that way.',
    savedModel: 'Template colors', sampleTitle: 'Title', sampleText: 'Some text', dark: 'Black text is hard to read on this background.',
  },
};
const YELLOW = '#fde047';
const BLUE = '#0369a1';
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); else if (/^echec-/.test(name)) { await mkdir('/tmp/sb-shots', { recursive: true }); await page.screenshot({ path: join('/tmp/sb-shots', name + '.png') }); } }
// Une liste de fonds en une ligne : « #fde047 - #0369a1 - ».
const brief = list => list.map(c => c || '-').join(' ');

// Les outils d'une page ouverte : positions, premier plan, vrais clics (la souris vient de loin, la bande défile d'abord quand la miniature visée n'y est pas entière).
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const showInList = async (selector, index) => {
    const need = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const list = el && el.closest('.pp-slide-list');
      if (!list) return null;
      const r = el.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const delta = r.top < l.top ? r.top - l.top - 8 : (r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0);
      return delta ? { x: l.left + l.width / 2, y: l.top + l.height / 2, delta } : null;
    }, [selector, index]);
    if (!need) return;
    await page.mouse.move(need.x, need.y);
    await page.mouse.wheel(0, need.delta);
    await sleep(250);
  };
  const hover = async (selector, index = 0) => {
    await showInList(selector, index);
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, options = {}) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y, options); await sleep(250); return c; };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, hover, click, leave };
}

// Le texte : la forme des blocs de premier niveau (h titre, p paragraphe, l liste, | saut de page, M repère, F cadre libre), les fonds et les transitions.
const docShape = page => page.evaluate(() => {
  const names = { pageBreak: '|', slideProps: 'M', freeFrame: 'F', heading: 'h', paragraph: 'p', bulletList: 'l', orderedList: 'o' };
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node) => { out.push(names[node.type.name] || '?'); });
  return out.join('');
});
const backgrounds = page => page.evaluate(() => SlideProps.backgroundsOf(EditorCore.getEditor().state.doc));
const transitions = page => page.evaluate(() => SlideProps.listOf(EditorCore.getEditor().state.doc).map(a => (a ? a.transition + ':' + a.from + ':' + a.dur : '-')).join(' '));
const markerCount = page => page.evaluate(() => { let n = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps') n++; }); return n; });
const unsaved = page => page.evaluate(() => LiveEntry.hasUnsavedEdits());
const slideCount = page => page.evaluate(() => document.querySelectorAll('.pp-slide-item').length);

// La fenêtre « Fond… » : sa palette, ses boutons, son titre, où elle est.
const windowState = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-slide-background');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const box = overlay.querySelector('.pp-modal-box');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const grid = overlay.querySelector('.cp-grid');
  const gridButtons = Array.from(grid.querySelectorAll('.cp-swatch'));
  const all = Array.from(overlay.querySelectorAll('.pp-slide-background-picker .cp-swatch'));
  const none = overlay.querySelector('.pp-slide-background-tool:not(.cp-custom)');
  const custom = overlay.querySelector('.pp-slide-background-tool.cp-custom');
  const paper = overlay.querySelector('.pp-slide-background-paper');
  const caption = overlay.querySelector('.pp-slide-background-caption');
  const mixed = overlay.querySelector('.pp-slide-background-mixed');
  const active = document.activeElement;
  const saved = Array.from(overlay.querySelectorAll('.pp-slide-background-saved .cp-row')).map(row => ({ label: row.querySelector('.cp-row-label').textContent, colors: Array.from(row.querySelectorAll('.cp-swatch')).map(b => b.dataset.color) }));
  return {
    title: overlay.querySelector('h3').textContent, labelledBy: box.getAttribute('aria-labelledby'), titleId: overlay.querySelector('h3').id, describedBy: box.getAttribute('aria-describedby'),
    intro: (overlay.querySelector('.pp-slide-background-intro') || {}).textContent, mixed: !!mixed && !mixed.hidden, mixedText: mixed ? mixed.textContent : '', box: rect(box),
    actions: Array.from(overlay.querySelectorAll('.pp-modal-actions button')).map(b => ({ text: b.textContent.trim(), rect: rect(b), primary: b.classList.contains('var-modal-primary') })),
    label: (overlay.querySelector('.pp-slide-background-label') || {}).textContent,
    grid: { count: gridButtons.length, role: grid.getAttribute('role'), label: grid.getAttribute('aria-label'), tabbable: gridButtons.filter(b => b.tabIndex === 0).map(b => b.dataset.color), first: gridButtons[0].dataset.color, last: gridButtons[gridButtons.length - 1].dataset.color },
    marked: all.filter(b => b.classList.contains('is-active')).map(b => b.dataset.color), pressed: all.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.color),
    noneText: none.textContent.trim(), nonePressed: none.getAttribute('aria-pressed') === 'true', customText: custom.textContent.trim(), customActive: custom.classList.contains('is-active'),
    paperBg: getComputedStyle(paper).backgroundColor, paperText: Array.from(paper.children).map(c => c.textContent.trim()).join(' '), paperRect: rect(paper), caption: caption.textContent, saved,
    focus: active ? (active.classList.contains('cp-swatch') ? 'swatch:' + active.dataset.color : (overlay.contains(active) ? 'button:' + active.textContent.trim() : (active.tagName + '.' + (active.className || '')).slice(0, 60))) : '',
  };
});
const menuRows = page => page.evaluate(() => {
  const menu = document.querySelector('.pp-slide-menu.visible');
  if (!menu) return null;
  return Array.from(menu.children).map(c => (c.dataset && c.dataset.action) || (c.getAttribute('role') === 'separator' ? '-' : '?')).filter(a => a !== '?' && !/^link/.test(a)).join(',');
});
// Le PDF relu par pdf.js : le nombre de pages, le texte de chacune et la couleur de points de chaque page (fractions de sa largeur et de sa hauteur).
const readPdf = (page, b64, points) => page.evaluate(async ([data64, pts]) => {
  if (!window.pdfjsLib) {
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const raw = atob(data64);
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
  const doc = await window.pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  const colors = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const content = await pg.getTextContent();
    pages.push(content.items.map(it => it.str).filter(s => s.trim()).join(' ').replace(/\s+/g, ' ').trim());
    const vp = pg.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    colors.push((pts || []).map(([fx, fy]) => { const d = ctx.getImageData(Math.min(canvas.width - 1, Math.floor(fx * vp.width)), Math.min(canvas.height - 1, Math.floor(fy * vp.height)), 1, 1).data; return [d[0], d[1], d[2]]; }));
  }
  return { numPages: doc.numPages, pages, colors };
}, [b64, points || []]);
// Des pixels d'une capture : [r, g, b] à chaque point { x, y } (la capture est lue dans la page).
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
const hexRgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const closeRgb = (got, want, tolerance = 6) => !!got && got.every((v, i) => Math.abs(v - want[i]) <= tolerance);
const WHITE = [255, 255, 255];

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, hover, click, leave } = toolsOf(page);
  // Le coin d'état redit « Enregistré à… » au bout d'un instant : on note tout ce qu'il a dit depuis la dernière fois qu'on l'a oublié, pour lire ce que « Appliquer » a annoncé même si la lecture tarde.
  await page.evaluate(() => {
    window.__said = [];
    const target = document.getElementById('status-msg');
    if (target) new MutationObserver(() => { window.__said.push(target.textContent || ''); }).observe(target, { childList: true, characterData: true, subtree: true });
  });
  const said = () => page.evaluate(() => window.__said.slice());
  const forget = () => page.evaluate(() => { window.__said.length = 0; });
  const press = async (key, settle = 220) => { await page.keyboard.press(key); await sleep(settle); };
  const save = async () => { await leave(); await click('#btn-save'); await sleep(1000); await leave(); };
  const open = async (id, slides) => {
    if (await unsaved(page)) await save();
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    const opened = await page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
    if (!opened) check(tag + `le modèle ${id} s'ouvre`, false, await page.evaluate(() => Templates.getCurrentId()));
    return opened;
  };
  const menuOf = async (index) => { await hover('.pp-slide-item', index); await click('.pp-slide-more', index); await sleep(150); };
  const openWindow = async (index) => {
    await menuOf(index);
    try { await click('.pp-slide-menu.visible [data-action="background"]'); } catch (e) {
      await snap(page, 'echec-menu-' + index);
      throw e;
    }
    await sleep(350);
    return windowState(page);
  };
  const swatch = color => `#pp-slide-background .cp-swatch[data-color="${color}"]`;
  const apply = async () => { await forget(); await click('#pp-slide-background .var-modal-primary'); };
  const applyAll = async () => { await forget(); await click('#pp-slide-background .pp-slide-background-all'); };
  const cancel = async () => { const names = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-slide-background .pp-modal-actions button')).map(b => b.textContent.trim())); await click('#pp-slide-background .pp-modal-actions button', names.indexOf(T.cancel)); };
  const cursor = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { kind: s.constructor.name, node: s.node ? s.node.type.name : null, parent: s.$from.parent.type.name, text: s.$from.parent.textContent.slice(0, 24), depth: s.$from.depth }; });
  const clickText = async (text) => {
    const find = needle => page.evaluate((word) => {
      const walker = document.createTreeWalker(document.querySelector('#editor-container .tiptap'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent.trim() === word) { n.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 20), y: b.top + b.height / 2 }; }
      }
      return null;
    }, needle);
    await find(text);
    await sleep(200);
    const c = await find(text);
    if (!c) throw new Error('texte introuvable : ' + text);
    await page.mouse.move(c.x - 5, c.y);
    await page.mouse.click(c.x, c.y);
    await sleep(200);
  };
  const base = `${YELLOW} - ${BLUE} -`;

  // --- 1. Le menu, la fenêtre.
  if (wanted(1)) {
    console.log('\n' + tag + '1) Le menu et la fenêtre');
    await open(7, 4);
    check(tag + 'le texte enregistré est lu : fond jaune sur la diapositive 1, bleu sur la 3, rien sur les autres', brief(await backgrounds(page)) === base, brief(await backgrounds(page)));
    await click('.pp-slide-item', 0);
    await menuOf(0);
    const rows = await menuRows(page);
    const rowText = await page.evaluate(() => { const r = document.querySelector('.pp-slide-menu.visible [data-action="background"]'); return r ? { text: r.textContent.trim(), role: r.getAttribute('role'), disabled: r.getAttribute('aria-disabled') } : null; });
    check(tag + `le menu ⋯ a la ligne « ${T.menuRow} » juste après « Transition… », avant « Notes… » et le filet de « Supprimer »`, /^addAfter,duplicate,-,moveUp,moveDown,-,transition,background,notes,-,delete/.test(rows || '') && !!rowText && rowText.text === T.menuRow && rowText.role === 'menuitem' && rowText.disabled === 'false', { rows, rowText });
    await click('.pp-slide-menu.visible [data-action="background"]');
    await sleep(350);
    let w = await windowState(page);
    check(tag + `la ligne ouvre « ${T.title(1)} » : un dialogue nommé par son titre et décrit par son texte (« ${T.intro} »), entier dans le panneau, avec ses trois boutons dans l'ordre « ${T.applyAll} », « ${T.cancel} », « ${T.apply} »`,
      !!w && w.title === T.title(1) && w.labelledBy === w.titleId && !!w.describedBy && w.intro === T.intro && inPanel(w.box) && JSON.stringify(w.actions.map(a => a.text)) === JSON.stringify([T.applyAll, T.cancel, T.apply]) && w.actions.every(a => inPanel(a.rect)) && w.actions[2].primary, w);
    check(tag + `la palette est celle des menus de couleur : cinquante pastilles (un groupe « ${T.palette} », du noir au rose pastel), celle du fond de la diapositive est cochée et la seule atteinte par Tab, et c'est elle qui a le clavier`,
      !!w && w.grid.count === 50 && w.grid.role === 'group' && w.grid.label === T.palette && w.grid.first === '#000000' && w.grid.last === '#ffd1e6' && w.marked.join() === YELLOW && w.pressed.join() === YELLOW && w.grid.tabbable.join() === 'rien-ici'.replace('rien-ici', w.marked[0] === YELLOW ? YELLOW : '') && w.focus === 'swatch:' + YELLOW, w && { grid: w.grid, marked: w.marked, focus: w.focus });
    check(tag + `« ${T.none} » et « ${T.custom} » sont là, ni l'un ni l'autre choisi (la couleur est dans la palette) ; l'aperçu montre la page jaune avec « ${T.sampleTitle} » et « ${T.sampleText} » et dit « ${YELLOW.toUpperCase()} »`,
      !!w && w.noneText === T.none && !w.nonePressed && w.customText === T.custom && !w.customActive && w.paperBg === 'rgb(253, 224, 71)' && w.paperText === `${T.sampleTitle} ${T.sampleText}` && w.caption === YELLOW.toUpperCase() && w.label === T.colorLabel, w && { none: [w.noneText, w.nonePressed], custom: [w.customText, w.customActive], paper: w.paperBg, caption: w.caption });
    check(tag + 'sans couleur gardée, aucune rangée de couleurs gardées', !!w && w.saved.length === 0, w && w.saved);
    await snap(page, `${lang}-fenetre-jaune`);
    for (const sel of ['.pp-slide-background-label', '.pp-slide-background-intro', '.pp-slide-background-caption', '.pp-slide-background-tool', '#pp-slide-background .var-modal-primary']) {
      const ratio = await contrastOf(page, sel);
      check(tag + `lisible à 4,5:1 au moins : ${sel.replace('#pp-slide-background ', '')}`, ratio >= 4.5, ratio);
    }
    // Un brouillon : rien n'est écrit avant « Appliquer ».
    await click(swatch('#ef4444'));
    w = await windowState(page);
    check(tag + 'choisir la pastille rouge la coche (une seule), change l\'aperçu et son code, et n\'écrit rien : le texte est comme avant, rien à enregistrer', !!w && w.marked.join() === '#ef4444' && w.paperBg === 'rgb(239, 68, 68)' && w.caption === '#EF4444' && brief(await backgrounds(page)) === base && !(await unsaved(page)), w && { marked: w.marked, paper: w.paperBg, list: brief(await backgrounds(page)) });
    await cancel();
    w = await windowState(page);
    check(tag + `« ${T.cancel} » ferme sans rien changer`, !w && brief(await backgrounds(page)) === base && !(await unsaved(page)), brief(await backgrounds(page)));
    await openWindow(0);
    await click(swatch('#22c55e'));
    await press('Escape');
    w = await windowState(page);
    check(tag + 'Échap ferme sans rien changer, la fenêtre rouverte repart du fond de la diapositive', !w && brief(await backgrounds(page)) === base, brief(await backgrounds(page)));
    w = await openWindow(0);
    check(tag + 'la fenêtre rouverte montre de nouveau le jaune de la diapositive 1', !!w && w.marked.join() === YELLOW && w.paperBg === 'rgb(253, 224, 71)', w && { marked: w.marked, paper: w.paperBg });
    // L'avertissement du fond foncé (carte du 22/10, « Un avertissement dans la fenêtre ») : sous l'aperçu, quand le texte noir de l'éditeur ne s'y lirait pas (moins de 4,5:1) ; il ne change jamais rien tout seul.
    const warnOf = () => page.evaluate(() => {
      const warn = document.querySelector('#pp-slide-background .pp-slide-background-warn');
      const caption = document.querySelector('#pp-slide-background .pp-slide-background-caption');
      if (!warn) return { text: null, role: null, shown: false, rect: null, belowCaption: false };
      const r = warn.getBoundingClientRect();
      return { text: warn.textContent, role: warn.getAttribute('role'), shown: r.height > 0, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, belowCaption: r.top >= caption.getBoundingClientRect().bottom - 0.5 };
    });
    const warning = await warnOf();
    check(tag + 'sous le jaune (qui se lit sous le texte noir), l\'avertissement est vide et ne prend aucune place : une région « status » sans texte', warning.text === '' && warning.role === 'status' && !warning.shown, warning);
    await click(swatch('#000000'));
    const darkWarn = await warnOf();
    w = await windowState(page);
    check(tag + `sur le noir, l'avertissement dit « ${T.dark} », sous le code de la couleur, entier dans le panneau, avec la fenêtre et ses trois boutons`,
      darkWarn.text === T.dark && darkWarn.shown && darkWarn.belowCaption && inPanel(darkWarn.rect) && !!w && inPanel(w.box) && w.actions.every(a => inPanel(a.rect)) && w.caption === '#000000', { darkWarn, box: w && w.box, actions: w && w.actions.map(a => a.rect) });
    const warnRatio = await contrastOf(page, '#pp-slide-background .pp-slide-background-warn');
    check(tag + 'le texte de l\'avertissement est lisible à 4,5:1 au moins', warnRatio >= 4.5, warnRatio);
    await snap(page, `${lang}-fenetre-noir`);
    // Les cinquante pastilles de la palette : l'avertissement est là pour toutes celles où le texte (#1b2430) fait moins de 4,5:1, et pour elles seules.
    const palette = await page.evaluate(() => {
      const ink = ColorMath.parseCss(getComputedStyle(document.querySelector('#pp-slide-background .pp-slide-background-paper')).color);
      const warn = document.querySelector('#pp-slide-background .pp-slide-background-warn');
      return Array.from(document.querySelectorAll('#pp-slide-background .cp-grid .cp-swatch')).map((b) => {
        b.click();
        return { color: b.dataset.color, ratio: Math.round(ColorMath.contrast(b.dataset.color, ink) * 100) / 100, warned: !!warn && warn.textContent !== '' };
      });
    });
    const wrong = palette.filter(p => p.warned !== (p.ratio < 4.5));
    check(tag + 'sur les cinquante pastilles de la palette, l\'avertissement est exactement là où le contraste du texte est sous 4,5:1 (' + palette.filter(p => p.warned).length + ' avertissent, ' + palette.filter(p => !p.warned).length + ' non)', palette.length === 50 && wrong.length === 0 && palette.some(p => p.warned) && palette.some(p => !p.warned), { wrong, count: palette.length });
    // De part et d'autre du seuil, à la vraie souris : la pastille la plus sombre qui se lit, la plus claire qui ne se lit pas.
    const edge = {
      readable: palette.filter(p => p.ratio >= 4.5).sort((x, y) => x.ratio - y.ratio)[0],
      unreadable: palette.filter(p => p.ratio < 4.5).sort((x, y) => y.ratio - x.ratio)[0],
    };
    await click(swatch(edge.unreadable.color));
    const justBelow = await warnOf();
    await click(swatch(edge.readable.color));
    const justAbove = await warnOf();
    check(tag + `au seuil : « ${edge.unreadable.color} » (${edge.unreadable.ratio}:1) avertit, « ${edge.readable.color} » (${edge.readable.ratio}:1) n'avertit pas`, justBelow.text === T.dark && justBelow.shown && justAbove.text === '' && !justAbove.shown, { edge, justBelow, justAbove });
    await click(swatch('#000000'));
    await click('#pp-slide-background .pp-slide-background-tool:not(.cp-custom)');
    const noBackground = await warnOf();
    check(tag + `« ${T.none} » (la page reste blanche) retire l'avertissement`, noBackground.text === '' && !noBackground.shown, noBackground);
    // Un avertissement n'est qu'un conseil : « Appliquer » pose le fond foncé, et le texte de la diapositive ne change pas de couleur tout seul.
    const htmlBeforeDark = await page.evaluate(() => Editor.getHTML());
    await click(swatch('#000000'));
    await apply();
    const afterDark = await page.evaluate(() => Editor.getHTML());
    check(tag + 'malgré l\'avertissement, « ' + T.apply + ' » pose le noir sur la diapositive 1 ; le texte ne change pas de couleur (aucune couleur de texte écrite)', brief(await backgrounds(page)) === `#000000 - ${BLUE} -` && !/<span[^>]*color/i.test(afterDark) && !/<span[^>]*color/i.test(htmlBeforeDark), { list: brief(await backgrounds(page)) });
    await press('Control+z');
    w = await openWindow(0);
    await click(swatch('#ef4444'));
    await apply();
    w = await windowState(page);
    check(tag + `« ${T.apply} » ferme la fenêtre et pose le rouge sur la diapositive 1 (son repère est son tout premier bloc) ; la ligne d'état dit « ${T.applied(1)} »`,
      !w && brief(await backgrounds(page)) === `#ef4444 - ${BLUE} -` && (await docShape(page)) === 'Mhp|hl|MFhp|p' && (await said()).includes(T.applied(1)), { w: !!w, list: brief(await backgrounds(page)), shape: await docShape(page), said: await said() });
    check(tag + 'le clavier est revenu dans le texte', await page.evaluate(() => !!document.activeElement.closest('.ProseMirror')), await page.evaluate(() => document.activeElement.className));
    await press('Control+z');
    check(tag + 'UN Ctrl+Z défait le fond posé (le texte est comme avant), un Ctrl+Y le remet', brief(await backgrounds(page)) === base && (await docShape(page)) === 'Mhp|hl|MFhp|p', { list: brief(await backgrounds(page)), shape: await docShape(page) });
    await press('Control+y');
    check(tag + 'Ctrl+Y le remet', brief(await backgrounds(page)) === `#ef4444 - ${BLUE} -`, brief(await backgrounds(page)));
    await press('Control+z');
    // La diapositive 2 n'a rien : un fond neuf.
    w = await openWindow(1);
    check(tag + `la diapositive 2 n'a pas de fond : aucune pastille cochée, « ${T.none} » choisi, l'aperçu est blanc et dit « ${T.noneCaption} », le clavier est sur la première pastille`,
      !!w && w.title === T.title(2) && w.marked.length === 0 && w.nonePressed && !w.customActive && w.paperBg === 'rgb(255, 255, 255)' && w.caption === T.noneCaption && w.grid.tabbable.join() === '#000000' && w.focus === 'swatch:#000000', w && { marked: w.marked, none: w.nonePressed, paper: w.paperBg, caption: w.caption, tab: w.grid.tabbable, focus: w.focus });
    // Le clavier : Tab, flèches, Début, Fin, Entrée.
    await press('ArrowRight');
    let focus = (await windowState(page)).focus;
    await press('ArrowDown');
    const down = (await windowState(page)).focus;
    await press('ArrowLeft');
    const left = (await windowState(page)).focus;
    await press('ArrowUp');
    const up = (await windowState(page)).focus;
    await press('End');
    const end = (await windowState(page)).focus;
    await press('ArrowDown');
    const stay = (await windowState(page)).focus;
    await press('Home');
    const home = (await windowState(page)).focus;
    await press('ArrowLeft');
    const homeLeft = (await windowState(page)).focus;
    check(tag + 'au clavier : → va à la pastille suivante, ↓ à celle de la rangée d\'en dessous, ← et ↑ reviennent, Fin va à la dernière, ↓ y reste, Début à la première, ← y reste',
      focus === 'swatch:#1f2937' && down === 'swatch:#c2410c' && left === 'swatch:#b91c1c' && up === 'swatch:#000000' && end === 'swatch:#ffd1e6' && stay === 'swatch:#ffd1e6' && home === 'swatch:#000000' && homeLeft === 'swatch:#000000', { focus, down, left, up, end, stay, home, homeLeft });
    await press('ArrowDown');
    await press('Enter');
    w = await windowState(page);
    check(tag + 'Entrée sur une pastille la choisit : cochée, seule atteinte par Tab, l\'aperçu la montre', !!w && w.marked.join() === '#b91c1c' && w.grid.tabbable.join() === '#b91c1c' && w.paperBg === 'rgb(185, 28, 28)', w && { marked: w.marked, tab: w.grid.tabbable, paper: w.paperBg });
    await press('Tab');
    const tab1 = (await windowState(page)).focus;
    await press('Tab');
    const tab2 = (await windowState(page)).focus;
    await press('Tab');
    const tab3 = (await windowState(page)).focus;
    await press('Tab');
    const tab4 = (await windowState(page)).focus;
    await press('Tab');
    const tab5 = (await windowState(page)).focus;
    await press('Tab');
    const tab6 = (await windowState(page)).focus;
    check(tag + `Tab sort de la palette (une seule étape) vers « ${T.none} », « ${T.custom} », « ${T.applyAll} », « ${T.cancel} », « ${T.apply} », puis revient à la palette`,
      tab1 === 'button:' + T.none && tab2 === 'button:' + T.custom && tab3 === 'button:' + T.applyAll && tab4 === 'button:' + T.cancel && tab5 === 'button:' + T.apply && tab6 === 'swatch:#b91c1c', { tab1, tab2, tab3, tab4, tab5, tab6 });
    await press('Escape');
    // « Sans fond » retire le fond.
    w = await openWindow(0);
    await click('#pp-slide-background .pp-slide-background-tool:not(.cp-custom)');
    w = await windowState(page);
    check(tag + `« ${T.none} » décoche la palette, s'enfonce, rend l'aperçu blanc et dit « ${T.noneCaption} »`, !!w && w.marked.length === 0 && w.nonePressed && w.paperBg === 'rgb(255, 255, 255)' && w.caption === T.noneCaption, w && { marked: w.marked, none: w.nonePressed, paper: w.paperBg });
    await apply();
    check(tag + `« ${T.none} » puis « ${T.apply} » retire le fond (et le repère, qui ne disait que lui) : « ${T.removed(1)} »`, brief(await backgrounds(page)) === `- - ${BLUE} -` && (await markerCount(page)) === 1 && (await said()).includes(T.removed(1)), { list: brief(await backgrounds(page)), count: await markerCount(page), said: await said() });
    await press('Control+z');
    // Le fond et la transition de la diapositive 3 ne se gênent pas.
    w = await openWindow(2);
    check(tag + 'la diapositive 3 a un fond bleu (et une poussée) : la fenêtre montre le bleu', !!w && w.title === T.title(3) && w.paperBg === 'rgb(3, 105, 161)' && w.caption === BLUE.toUpperCase(), w && { paper: w.paperBg, caption: w.caption });
    await click('#pp-slide-background .pp-slide-background-tool:not(.cp-custom)');
    await apply();
    check(tag + 'retirer son fond garde sa poussée : le repère reste, avec son effet seul', brief(await backgrounds(page)) === `${YELLOW} - - -` && (await transitions(page)) === '- - push:r:1000 -' && (await markerCount(page)) === 2, { bg: brief(await backgrounds(page)), trans: await transitions(page) });
    await press('Control+z');
    await openWindow(2);
    await click(swatch('#fca5a5'));
    await apply();
    check(tag + 'poser un autre fond garde la poussée : la transition ne bouge pas', brief(await backgrounds(page)) === `${YELLOW} - #fca5a5 -` && (await transitions(page)) === '- - push:r:1000 -', { bg: brief(await backgrounds(page)), trans: await transitions(page) });
    await press('Control+z');
    // Retirer la transition garde le fond (par la fenêtre « Transition… »).
    await menuOf(2);
    await click('.pp-slide-menu.visible [data-action="transition"]');
    await sleep(350);
    await click('#pp-slide-transition [data-value=""]');
    await click('#pp-slide-transition .var-modal-primary');
    await sleep(300);
    check(tag + 'retirer la transition de la diapositive 3 (fenêtre « Transition… ») garde son fond : le repère reste, avec sa couleur seule, écrit comme un fond seul', brief(await backgrounds(page)) === base && (await transitions(page)) === '- - - -' && (await markerCount(page)) === 2 && !/data-trans/.test(await page.evaluate(() => Editor.getHTML())), { bg: brief(await backgrounds(page)), trans: await transitions(page) });
    await press('Control+z');
    // « Appliquer à toutes » : toutes les diapositives, UN pas d'historique.
    await openWindow(1);
    await click(swatch('#c8e6ff'));
    await applyAll();
    check(tag + `« ${T.applyAll} » pose la couleur de la fenêtre sur les quatre diapositives, un repère chacune, la poussée de la 3 gardée ; « ${T.applied(4)} »`, brief(await backgrounds(page)) === '#c8e6ff #c8e6ff #c8e6ff #c8e6ff' && (await markerCount(page)) === 4 && (await transitions(page)) === '- - push:r:1000 -' && (await said()).includes(T.applied(4)), { list: brief(await backgrounds(page)), trans: await transitions(page), said: await said() });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z défait les quatre', brief(await backgrounds(page)) === base && (await markerCount(page)) === 2, brief(await backgrounds(page)));
    // Plusieurs miniatures : une seule fenêtre.
    await click('.pp-slide-item', 0);
    await page.keyboard.down('Control');
    await click('.pp-slide-item', 1);
    await page.keyboard.up('Control');
    w = await openWindow(1);
    check(tag + `deux miniatures choisies : « ${T.titleMany(2)} », la fenêtre prévient que leurs fonds diffèrent et montre celui de la première (le jaune)`, !!w && w.title === T.titleMany(2) && w.mixed && w.mixedText === T.mixed && w.marked.join() === YELLOW, w && { title: w.title, mixed: w.mixed, marked: w.marked });
    await click(swatch('#86efac'));
    await apply();
    check(tag + `elle pose le vert sur les deux, la troisième garde le sien ; « ${T.applied(2)} »`, brief(await backgrounds(page)) === `#86efac #86efac ${BLUE} -` && (await said()).includes(T.applied(2)), { list: brief(await backgrounds(page)), said: await said() });
    await press('Control+z');
    // Appliquer ce qui est déjà posé : rien n'est écrit.
    await click('.pp-slide-item', 0);
    await openWindow(0);
    await apply();
    check(tag + `appliquer sans rien changer n'écrit rien : « ${T.unchanged} »`, brief(await backgrounds(page)) === base && (await said()).includes(T.unchanged), { list: brief(await backgrounds(page)), said: await said() });
    // « Personnalisé… » : la fenêtre de couleur s'ouvre au-dessus, son « Appliquer » règle le brouillon.
    await openWindow(1);
    const htmlBefore = await page.evaluate(() => Editor.getHTML());
    await click('#pp-slide-background .pp-slide-background-tool.cp-custom');
    await sleep(500);
    const dialog = await page.evaluate(() => { const o = document.getElementById('pp-color-modal'); return { shown: !!o && getComputedStyle(o).display !== 'none', title: o ? o.querySelector('h3').textContent : '' }; });
    check(tag + `« ${T.custom} » ouvre la fenêtre de couleur par-dessus celle du fond`, dialog.shown, dialog);
    await page.keyboard.type('#123456');
    await sleep(250);
    await page.keyboard.press('Enter');
    await sleep(500);
    w = await windowState(page);
    const dialogGone = await page.evaluate(() => { const o = document.getElementById('pp-color-modal'); return !o || getComputedStyle(o).display === 'none'; });
    check(tag + 'sa couleur devient le brouillon : la fenêtre du fond la montre (aperçu, code), la fenêtre de couleur est fermée, le clavier est revenu sur « ' + T.custom + ' », et le texte de la présentation n\'a pas bougé (la couleur est seulement gardée dans les réglages du modèle)',
      dialogGone && !!w && w.paperBg === 'rgb(18, 52, 86)' && w.caption === '#123456' && w.focus === 'button:' + T.custom && brief(await backgrounds(page)) === base && (await page.evaluate(() => Editor.getHTML())) === htmlBefore, w && { dialogGone, paper: w.paperBg, caption: w.caption, focus: w.focus });
    const customWarn = await warnOf();
    check(tag + `la couleur composée (#123456, très foncée) avertit comme une pastille : « ${T.dark} »`, customWarn.text === T.dark && customWarn.shown, customWarn);
    check(tag + `la couleur composée est gardée pour le modèle : une rangée « ${T.savedModel} » apparaît dans la fenêtre avec elle, et c'est sa pastille qui est cochée (« ${T.custom} » ne l'est que pour une couleur qu'aucune rangée ne garde)`,
      !!w && w.saved.length >= 1 && w.saved[0].label === T.savedModel && w.saved[0].colors.includes('#123456') && w.marked.join() === '#123456' && !w.customActive, w && { saved: w.saved, marked: w.marked, custom: w.customActive });
    await click(swatch('#22c55e'));
    w = await windowState(page);
    check(tag + 'choisir une pastille de la palette décoche la couleur gardée (une seule cochée)', !!w && w.marked.join() === '#22c55e', w && w.marked);
    await click(swatch('#123456'));
    w = await windowState(page);
    check(tag + 'une couleur gardée se choisit comme une pastille de la palette : cochée dans sa rangée, aperçu à jour', !!w && w.marked.join() === '#123456' && !w.customActive && w.paperBg === 'rgb(18, 52, 86)', w && { marked: w.marked, custom: w.customActive, paper: w.paperBg });
    await cancel();
    await leave();
  }

  // --- 2. Le repère dans le texte : le fond seul ne se perd pas.
  if (wanted(2) && full) {
    console.log('\n' + tag + '2) Le repère dans le texte');
    await open(21, 3);
    let shape = await docShape(page);
    check(tag + 'le texte enregistré « Fusion » : la diapositive 1 sans repère, la 2 avec un fond bleu et une poussée, la 3 avec un fond jaune (hp | Mhp | Mhp)', shape === 'hp|Mhp|Mhp' && brief(await backgrounds(page)) === `- ${BLUE} ${YELLOW}` && (await transitions(page)) === '- push:r:1000 -', { shape, bg: brief(await backgrounds(page)) });
    // Retour arrière au début de la diapositive 2 : la 1 n'a pas de repère, celui de la 2 (fond ET poussée) vient en tête des deux.
    await clickText('Deux');
    await press('Home');
    await press('Backspace');
    shape = await docShape(page);
    check(tag + 'Retour arrière au début de la diapositive 2 n\'efface pas son repère : les diapositives 1 et 2 n\'en font plus qu\'une, qui garde le fond bleu et la poussée, en tête', shape === 'Mhphp|Mhp' && (await slideCount(page)) === 2 && brief(await backgrounds(page)) === `${BLUE} ${YELLOW}` && (await transitions(page)) === 'push:r:1000 -', { shape, bg: brief(await backgrounds(page)), slides: await slideCount(page) });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z défait la fusion', (await docShape(page)) === 'hp|Mhp|Mhp' && brief(await backgrounds(page)) === `- ${BLUE} ${YELLOW}`, { shape: await docShape(page), list: brief(await backgrounds(page)) });
    // Retour arrière au début de la diapositive 3 : la 2 a déjà un repère, c'est le sien qui reste (celui de la 3 se perd avec son saut de page, comme une transition).
    await clickText('Trois');
    await press('Home');
    await press('Backspace');
    shape = await docShape(page);
    check(tag + 'Retour arrière au début de la diapositive 3 : les diapositives 2 et 3 n\'en font plus qu\'une, qui garde le repère de la 2 (un seul repère par diapositive)', shape === 'hp|Mhphp' && (await slideCount(page)) === 2 && brief(await backgrounds(page)) === `- ${BLUE}` && (await markerCount(page)) === 1, { shape, bg: brief(await backgrounds(page)), slides: await slideCount(page) });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z la défait aussi', (await docShape(page)) === 'hp|Mhp|Mhp' && brief(await backgrounds(page)) === `- ${BLUE} ${YELLOW}`, { shape: await docShape(page), list: brief(await backgrounds(page)) });
    await open(14, 4);
    check(tag + 'le texte enregistré « Frappe » : chaque repère ouvre sa diapositive (Mhp | hl | MFhp | p), avant le cadre libre de la troisième', (await docShape(page)) === 'Mhp|hl|MFhp|p', await docShape(page));
    // Retour arrière tout au début du texte, avec un repère devant.
    await press('Control+Home');
    const before = await docShape(page);
    await press('Backspace');
    check(tag + 'Retour arrière tout au début du texte n\'efface pas le repère de la première diapositive', before === 'Mhp|hl|MFhp|p' && (await docShape(page)) === before && (await markerCount(page)) === 2, { before, after: await docShape(page) });
    // Une diapositive vidée de tout, repère compris.
    const cleared = await page.evaluate(() => {
      const ed = EditorCore.getEditor();
      const slide = SlideProps.slidesOf(ed.state.doc)[0];
      ed.view.dispatch(ed.state.tr.delete(slide.start, slide.end));
      return { slides: SlideProps.slidesOf(ed.state.doc).length, list: SlideProps.backgroundsOf(ed.state.doc) };
    });
    check(tag + 'effacer tout le contenu de la diapositive 1 d\'un coup (repère compris) lui rend son fond jaune : même nombre de diapositives, même fond', cleared.slides === 4 && brief(cleared.list) === base, cleared);
    await press('Control+z');
    // Un repère qui ne dit plus rien s'efface ; un repère hors de sa place revient en tête.
    const tidy = await page.evaluate(async () => {
      const ed = EditorCore.getEditor();
      const out = {};
      const names = { pageBreak: '|', slideProps: 'M', freeFrame: 'F', heading: 'h', paragraph: 'p', bulletList: 'l' };
      const shape = () => { const o = []; ed.state.doc.forEach(n => o.push(names[n.type.name] || '?')); return o.join(''); };
      out.start = shape();
      // Un repère vide, en tête de la diapositive 2 : il ne dit rien, il part.
      const s2 = SlideProps.slidesOf(ed.state.doc)[1];
      ed.view.dispatch(ed.state.tr.insert(s2.start, ed.state.schema.nodes.slideProps.create({})));
      out.blank = shape();
      // Le repère de la diapositive 1 (fond seul), sorti de sa place - après son titre : il revient en tête.
      const s1 = SlideProps.slidesOf(ed.state.doc)[0];
      const marker = s1.markers[0];
      const tr = ed.state.tr.delete(marker.pos, marker.pos + marker.node.nodeSize);
      tr.insert(tr.doc.child(0).nodeSize, marker.node);
      ed.view.dispatch(tr);
      out.moved = shape();
      out.movedList = SlideProps.backgroundsOf(ed.state.doc).join(',');
      return out;
    });
    check(tag + 'un repère qui ne dit rien (ni fond, ni effet) part ; un repère de fond sorti de sa place revient en tête de sa diapositive', tidy.start === 'Mhp|hl|MFhp|p' && tidy.blank === 'Mhp|hl|MFhp|p' && tidy.moved === 'Mhp|hl|MFhp|p' && tidy.movedList === `${YELLOW},,${BLUE},`, tidy);
    await press('Control+z');
    await press('Control+z');
    // Collage : un repère de fond.
    const pasted = await page.evaluate(async (html) => {
      const ed = EditorCore.getEditor();
      ed.commands.focus('end');
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      return { list: SlideProps.backgroundsOf(ed.state.doc).join(','), text: ed.state.doc.textContent.slice(-12) };
    }, '<div class="pp-slide-props" data-bg="#ff0000"></div><p>Collé un</p>');
    check(tag + 'un repère de fond collé à la fin d\'une présentation devient celui de sa diapositive (la 4)', pasted.list === `${YELLOW},,${BLUE},#ff0000` && /Collé un$/.test(pasted.text), pasted);
    await press('Control+z');
    await press('Control+z');
    // Hors d'une présentation, le repère collé n'entre pas.
    await open(1);
    const doc = await page.evaluate(async (html) => {
      const ed = EditorCore.getEditor();
      ed.commands.focus('end');
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      let n = 0; ed.state.doc.descendants((x) => { if (x.type.name === 'slideProps') n++; });
      return { markers: n, text: ed.state.doc.textContent.slice(-16), html: /pp-slide-props|data-bg/.test(Editor.getHTML()) };
    }, '<div class="pp-slide-props" data-bg="#ff0000"></div><p>Collé trois</p>');
    check(tag + 'dans un document (pas une présentation), le repère collé n\'entre pas : son texte arrive, pas lui', doc.markers === 0 && /Collé trois$/.test(doc.text) && !doc.html, doc);
    await leave();
  }

  // --- 3. Le dessin : sous le texte, sur toute la page, sans rien décaler.
  if (wanted(3) && full) {
    console.log('\n' + tag + '3) Le dessin dans l\'éditeur et les miniatures');
    // Les blocs de texte (hors cadres) : leur place dans l'éditeur ; le même texte avec ou sans fond est au même endroit.
    const tops = () => page.evaluate(() => {
      const root = document.querySelector('#editor-container .tiptap');
      const base = root.getBoundingClientRect();
      return Array.from(root.querySelectorAll('h1, h2, li p, p')).filter(e => e.textContent.trim() && !e.closest('.pp-free-frame')).map(e => ({ text: e.textContent.trim(), top: Math.round((e.getBoundingClientRect().top - base.top) * 10) / 10, left: Math.round((e.getBoundingClientRect().left - base.left) * 10) / 10 }));
    });
    await open(18, 4);
    const withBg = await tops();
    await open(17, 4);
    const plain = await tops();
    check(tag + 'l\'éditeur n\'est décalé d\'un pixel par aucun fond : tous les blocs sont à la même place qu\'avec le même texte sans repère', JSON.stringify(withBg) === JSON.stringify(plain) && withBg.length >= 7, { withBg: withBg.slice(0, 3), plain: plain.slice(0, 3), n: [withBg.length, plain.length] });
    await open(18, 4);
    // La géométrie du fond d'une diapositive : le pseudo-élément du repère couvre la page, depuis son coin.
    const geometry = await page.evaluate(() => {
      const marker = document.querySelector('#editor-container .tiptap .pp-slide-props[data-bg]');
      const cs = getComputedStyle(marker, '::before');
      const root = getComputedStyle(document.documentElement);
      return { z: cs.zIndex, position: cs.position, width: parseFloat(cs.width), height: parseFloat(cs.height), left: parseFloat(cs.left), top: parseFloat(cs.top), pageWidth: parseFloat(root.getPropertyValue('--pp-page-width')), pageHeight: parseFloat(root.getPropertyValue('--pp-page-height')),
        marginLeft: parseFloat(root.getPropertyValue('--pp-margin-left')), marginTop: parseFloat(root.getPropertyValue('--pp-margin-top')), events: cs.pointerEvents, height0: marker.getBoundingClientRect().height, bg: cs.backgroundColor };
    });
    check(tag + 'le fond est sous le texte (z-index -1), sans souris, de la taille de la page (celle de PageLayout) et posé depuis son coin (marges retranchées) ; le repère reste de hauteur nulle',
      geometry.z === '-1' && geometry.position === 'absolute' && geometry.events === 'none' && near(geometry.width, geometry.pageWidth, 1) && near(geometry.height, geometry.pageHeight, 1) && near(geometry.left, -geometry.marginLeft, 0.5) && near(geometry.top, -geometry.marginTop, 0.5) && geometry.height0 === 0, geometry);
    // En pixels : au bas à droite de chaque page, loin du texte.
    const pagePoint = (name, fx, fy) => page.evaluate(([which, a, b]) => {
      const markers = Array.from(document.querySelectorAll('#editor-container .tiptap .page-break-marker'));
      const tip = document.querySelector('#editor-container .tiptap');
      const sheet = tip.closest('.v2-page-sheet') || tip;
      const scale = tip.getBoundingClientRect().width / tip.offsetWidth || 1;
      const root = getComputedStyle(document.documentElement);
      const pw = parseFloat(root.getPropertyValue('--pp-page-width'));
      const ph = parseFloat(root.getPropertyValue('--pp-page-height'));
      const mt = parseFloat(root.getPropertyValue('--pp-margin-top'));
      const ml = parseFloat(root.getPropertyValue('--pp-margin-left'));
      const band = parseFloat(root.getPropertyValue('--pp-top-band')) || 0;
      // L'ancre de la diapositive : son repère (ou, sans lui, son premier bloc) ; le haut de la page est à `marge + bande` au-dessus.
      const blocks = Array.from(tip.children);
      let index = 0;
      let anchor = null;
      for (const child of blocks) {
        if (child.classList.contains('page-break-marker')) { index += 1; continue; }
        if (index === which && !anchor) anchor = child;
      }
      const r = anchor.getBoundingClientRect();
      const left = r.left - ml * scale;
      const top = r.top - (mt + band) * scale;
      return { x: left + a * pw * scale, y: top + b * ph * scale, scale, markers: markers.length, sheet: !!sheet };
    }, [name, fx, fy]);
    const scrollTo = async (point) => {
      await page.evaluate((y) => { const c = document.getElementById('editor-container'); const r = c.getBoundingClientRect(); c.scrollTop += y - (r.top + r.height / 2); }, point.y);
      await sleep(350);
    };
    for (const [k, want, label] of [[0, hexRgb(YELLOW), 'jaune'], [1, WHITE, 'blanche'], [2, hexRgb(BLUE), 'bleue'], [3, WHITE, 'blanche']]) {
      let point = await pagePoint(k, 0.85, 0.8);
      await scrollTo(point);
      point = await pagePoint(k, 0.85, 0.8);
      const [rgb] = await pixelsAt(page, [{ x: point.x, y: point.y }]);
      check(tag + `éditeur : la page de la diapositive ${k + 1} est ${label} au bas à droite, loin du texte`, closeRgb(rgb, want), { k, rgb, want, point });
      if (k === 0) await snap(page, `${lang}-editeur-jaune`);
    }
    // Le cadre plein blanc de la diapositive 3 est devant le fond bleu ; le texte est devant lui aussi.
    {
      const frame = await page.evaluate(() => { const b = document.querySelector('#editor-container .tiptap .pp-free-frame-box'); const r = b.getBoundingClientRect(); return { x: r.left + r.width * 0.9, y: r.top + r.height * 0.8 }; });
      await scrollTo(frame);
      const spot = await page.evaluate(() => { const b = document.querySelector('#editor-container .tiptap .pp-free-frame-box'); const r = b.getBoundingClientRect(); return { x: r.left + r.width * 0.9, y: r.top + r.height * 0.8 }; });
      const [inside] = await pixelsAt(page, [{ x: spot.x, y: spot.y }]);
      check(tag + 'éditeur : le cadre plein blanc de la diapositive 3 est devant le fond bleu (blanc dans le cadre)', closeRgb(inside, WHITE), { inside, spot });
      const headline = await page.evaluate(() => { const h = Array.from(document.querySelectorAll('#editor-container .tiptap h2')).find(e => e.textContent.trim() === 'Trois'); const cs = getComputedStyle(h); return { color: cs.color, z: getComputedStyle(h).zIndex }; });
      check(tag + 'éditeur : le texte d\'une diapositive à fond n\'est pas voilé (il garde sa couleur, au-dessus du fond)', headline.color === 'rgb(27, 36, 48)' && headline.z === 'auto', headline);
    }
    // Les miniatures : une copie du rendu de l'éditeur, donc le même fond.
    for (const [k, want, label] of [[0, hexRgb(YELLOW), 'jaune'], [1, WHITE, 'blanche'], [2, hexRgb(BLUE), 'bleue']]) {
      await hover('.pp-slide-thumb', k);
      const box = await rectOf('.pp-slide-thumb', k);
      const [rgb] = await pixelsAt(page, [{ x: box.left + box.width * 0.85, y: box.top + box.height * 0.85 }]);
      check(tag + `miniature ${k + 1} : ${label} au bas à droite`, closeRgb(rgb, want), { k, rgb, want, box });
    }
    await leave();
  }

  // --- 4. Les sorties : la Lecture, le diaporama, le PDF, le Word, le HTML, le Markdown.
  if (wanted(4) && full) {
    console.log('\n' + tag + '4) Les sorties');
    await open(18, 4);
    const stored = await page.evaluate(() => Editor.getHTML());
    const out = await page.evaluate(html => SlidesEntry.outputHtml('presentation', html), stored);
    const parsed = await page.evaluate((html) => {
      const body = HtmlSanitize.parseInert(html);
      const frames = Array.from(body.querySelectorAll('[data-ff-bg]')).map(f => ({ fill: f.getAttribute('data-ff-fill'), x: f.getAttribute('data-ff-x'), y: f.getAttribute('data-ff-y'), w: Number(f.getAttribute('data-ff-w')), h: Number(f.getAttribute('data-ff-h')), text: f.textContent.trim(), before: (f.previousElementSibling && f.previousElementSibling.className) || '', nextIsFrame: !!f.nextElementSibling && f.nextElementSibling.classList.contains('pp-free-frame') }));
      const page = PageLayout.getPageSizePt();
      return { frames, markers: body.querySelectorAll('.pp-slide-props, [data-bg]:not([data-ff-bg])').length, free: body.querySelectorAll('.pp-free-frame:not([data-ff-bg])').length, page: { w: page.width, h: page.height } };
    }, out);
    check(tag + 'le texte des sorties n\'a plus aucun repère ; le fond de chaque diapositive y est un cadre de la page entière (page de PageLayout, à son coin), plein de sa couleur, sans texte', parsed.markers === 0 && parsed.frames.length === 2 && parsed.frames[0].fill === YELLOW && parsed.frames[1].fill === BLUE
      && parsed.frames.every(f => f.x === '0' && f.y === '0' && near(f.w, parsed.page.w, 0.02) && near(f.h, parsed.page.h, 0.02) && f.text === ''), parsed);
    check(tag + 'sur la diapositive 3, le cadre du fond vient avant le cadre libre (qui est donc devant lui) ; le cadre libre y est toujours', parsed.free === 1 && parsed.frames[1].nextIsFrame, parsed);
    const none = await page.evaluate(() => { const html = '<p>Sans fond</p>' + Array(1).join(''); return SlidesEntry.outputHtml('presentation', html) === html; });
    check(tag + 'un texte sans repère sort tel quel', none, none);
    // La Lecture.
    await click('#btn-mode-read');
    await sleep(1200);
    const reading = await page.evaluate(() => {
      const r = document.querySelector('.reader-content');
      if (!r) return null;
      const boxes = Array.from(r.querySelectorAll('[data-ff-bg] > .pp-free-frame-box')).map((b) => { const q = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { x: q.left + q.width * 0.85, y: q.top + q.height * 0.8, z: cs.zIndex, fill: getComputedStyle(b, '::before').backgroundColor, width: q.width, height: q.height }; });
      return { markers: r.querySelectorAll('.pp-slide-props').length, boxes, text: r.textContent.replace(/\s+/g, ' ') };
    });
    check(tag + 'la Lecture n\'a aucun repère, deux cadres de fond (sous le texte : z-index -1, de la taille de la page), et tout le texte', !!reading && reading.markers === 0 && reading.boxes.length === 2 && reading.boxes.every(b => b.z === '-1') && ['Titre un', 'Deux', 'Cadre', 'Trois', 'Quatre'].every(x => reading.text.includes(x)), reading);
    {
      const targets = [[0, hexRgb(YELLOW)], [1, hexRgb(BLUE)]];
      for (const [k, want] of targets) {
        await page.evaluate((i) => { const b = document.querySelectorAll('.reader-content [data-ff-bg] > .pp-free-frame-box')[i]; b.scrollIntoView({ block: 'center' }); }, k);
        await sleep(400);
        const spot = await page.evaluate((i) => { const b = document.querySelectorAll('.reader-content [data-ff-bg] > .pp-free-frame-box')[i]; const q = b.getBoundingClientRect(); return { x: q.left + q.width * 0.85, y: q.top + q.height * 0.5 }; }, k);
        const [rgb] = await pixelsAt(page, [{ x: spot.x, y: spot.y }]);
        check(tag + `Lecture : le fond de la diapositive ${k ? 3 : 1} est peint sous le texte (${k ? 'bleu' : 'jaune'} au milieu à droite)`, closeRgb(rgb, want), { rgb, want, spot });
      }
      await snap(page, `${lang}-lecture`);
    }
    await click('#btn-mode-edit');
    await sleep(600);
    // Le diaporama : le fond de chaque page.
    await open(8, 3);
    await click('.pp-slide-item', 0);
    await leave();
    await click('.pp-slide-show-open');
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
    await sleep(900);
    const shown = [];
    for (let k = 0; k < 3; k++) {
      const [rgb] = await pixelsAt(page, [{ x: WIDTH * 0.85, y: HEIGHT * 0.8 }]);
      shown.push(rgb);
      if (k === 0) await snap(page, `${lang}-diaporama`);
      await press('ArrowRight', 1100);
    }
    check(tag + 'diaporama : la première page est rouge, la deuxième blanche, la troisième bleue (au bas à droite, loin du titre)', closeRgb(shown[0], hexRgb('#d00000')) && closeRgb(shown[1], WHITE) && closeRgb(shown[2], hexRgb('#0000d0')), shown);
    await press('Escape', 500);
    // Le PDF : une page par diapositive, la couleur sur toute la page, le même texte qu'avec le même texte sans fond.
    const exportPdf = async (points) => {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
      return readPdf(page, readFileSync(await download.path()).toString('base64'), points);
    };
    const points = [[0.02, 0.02], [0.5, 0.5], [0.97, 0.97], [0.85, 0.8]];
    await open(18, 4);
    const pdf = await exportPdf(points);
    await open(17, 4);
    const pdfPlain = await exportPdf(points);
    check(tag + 'le PDF a quatre pages, une par diapositive (un fond n\'ajoute ni page ni ligne), et le même texte qu\'avec le même texte sans fond', pdf.numPages === 4 && pdfPlain.numPages === 4 && JSON.stringify(pdf.pages) === JSON.stringify(pdfPlain.pages), { marked: pdf.pages, plain: pdfPlain.pages });
    const wantPdf = [hexRgb(YELLOW), WHITE, hexRgb(BLUE), WHITE];
    check(tag + 'PDF : la page 1 est jaune partout (coins, milieu), la page 3 bleue, les pages 2 et 4 blanches', pdf.colors.every((c, i) => c.slice(0, 3).every(rgb => closeRgb(rgb, wantPdf[i], 8))), pdf.colors);
    check(tag + 'PDF : sans fond, aucune page n\'est teintée (le même texte sans repère est blanc partout)', pdfPlain.colors.every(c => c.every(rgb => closeRgb(rgb, WHITE, 8))), pdfPlain.colors);
    // Le Word : une forme de la page entière derrière le texte, sous les images en calque ; le cadre libre, lui, reste devant.
    const wordOf = async () => {
      await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(300);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
      const b64 = readFileSync(await download.path()).toString('base64');
      const xml = await page.evaluate(async (data) => { await ExportCommon.ensureJsZipLoaded(); const zip = await JSZip.loadAsync(data, { base64: true }); return zip.file('word/document.xml').async('string'); }, b64);
      await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      const anchors = (xml.match(/<wp:anchor[\s\S]*?<\/wp:anchor>/g) || []).map(a => ({ behind: /behindDoc="1"/.test(a), height: (/relativeHeight="(\d+)"/.exec(a) || [])[1], offH: (/<wp:positionH relativeFrom="(\w+)"><wp:posOffset>(-?\d+)/.exec(a) || []).slice(1).join(':'), offV: (/<wp:positionV relativeFrom="(\w+)"><wp:posOffset>(-?\d+)/.exec(a) || []).slice(1).join(':'),
        cx: Number((/<wp:extent cx="(\d+)" cy="(\d+)"/.exec(a) || [])[1]), cy: Number((/<wp:extent cx="(\d+)" cy="(\d+)"/.exec(a) || [])[2]), fill: (/<a:solidFill><a:srgbClr val="(\w+)"/.exec(a) || [])[1], txBox: /txBox="1"/.test(a) }));
      return { anchors, text: (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('|'), markers: /pp-slide-props|data-bg|data-ff-bg/.test(xml) };
    };
    await open(18, 4);
    const word = await wordOf();
    const behind = word.anchors.filter(a => a.behind);
    const front = word.anchors.filter(a => !a.behind);
    const pageEmu = await page.evaluate(() => { const p = PageLayout.getPageSizePt(); return { w: p.width * 12700, h: p.height * 12700 }; });
    check(tag + 'le Word a deux formes DERRIÈRE le texte (une par fond), de la page entière, au coin de la page, pleines de leur couleur (jaune puis bleue), sous les images en calque (hauteur 1) et sans zone de texte ; le cadre libre reste devant',
      behind.length === 2 && behind.every(a => a.offH === 'page:0' && a.offV === 'page:0' && a.height === '1' && !a.txBox && near(a.cx, pageEmu.w, 2000) && near(a.cy, pageEmu.h, 2000)) && behind[0].fill === 'FDE047' && behind[1].fill === '0369A1' && front.length === 1 && front[0].txBox && Number(front[0].height) > 1000 && !word.markers, { behind, front, pageEmu });
    check(tag + 'le Word garde tout le texte (titres, cadre, diapositive 4)', ['Titre un', 'Deux', 'Cadre', 'Trois', 'Quatre'].every(x => word.text.includes(x)), word.text);
    // Le HTML et le Markdown : ni page ni boîte vide.
    const flat = await page.evaluate(async () => {
      await ExportEngines.ensure('md', 'html');
      const html = SlidesEntry.outputHtml('presentation', Editor.getHTML());
      const md = await MarkdownExport.htmlToMarkdown(html, null, {});
      const file = await HtmlExport.htmlToDocument(html, null, {});
      const fragment = await HtmlExport.htmlToDocument(html, null, { fragment: true });
      const text = value => (typeof value === 'string' ? value : (value && (value.html || value.source)) || '');
      const plainHtml = SlidesEntry.outputHtml('presentation', Editor.getHTML().replace(/<div class="pp-slide-props"[^>]*><\/div>/g, ''));
      return { md, file: text(file), fragment: text(fragment), mdPlain: await MarkdownExport.htmlToMarkdown(plainHtml, null, {}), filePlain: text(await HtmlExport.htmlToDocument(plainHtml, null, {})) };
    });
    check(tag + 'le HTML (page et fragment) ne garde ni repère, ni cadre de fond, ni boîte vide : le même fichier qu\'avec le même texte sans fond', !/data-bg|data-ff-bg|pp-slide-props|--pp-slide-bg/.test(flat.file + flat.fragment) && flat.file === flat.filePlain.replace(/\s+$/, '') + (flat.file.endsWith('\n') && !flat.filePlain.endsWith('\n') ? '\n' : '') || flat.file === flat.filePlain, { file: flat.file.slice(flat.file.indexOf('<body>'), flat.file.indexOf('<body>') + 400), plain: flat.filePlain.slice(flat.filePlain.indexOf('<body>'), flat.filePlain.indexOf('<body>') + 400) });
    check(tag + 'le Markdown ne garde rien du fond : le même texte qu\'avec le même texte sans fond', !/data-bg|data-ff-bg|pp-slide-props|#fde047/i.test(flat.md) && flat.md === flat.mdPlain, { md: flat.md.slice(0, 300), plain: flat.mdPlain.slice(0, 300) });
    await leave();
  }

  // --- 5. Les valeurs, l'enregistrement.
  if (wanted(5) && full) {
    console.log('\n' + tag + '5) Les valeurs et l\'enregistrement');
    await open(10, 5);
    const odd = await backgrounds(page);
    check(tag + 'des valeurs écrites à la main sont lues sans erreur : une couleur nommée n\'est pas un fond, une couleur courte ou en majuscules est écrite #rrggbb en minuscules, rgb() est lu, une valeur vide n\'est pas un fond', JSON.stringify(odd) === JSON.stringify(['', '#ffddee', '#abcdef', '#010203', '']), odd);
    check(tag + 'les miniatures le montrent : la couleur lue est peinte (la deuxième est rose pâle, la quatrième presque noire)', await (async () => {
      await hover('.pp-slide-thumb', 1);
      const box = await rectOf('.pp-slide-thumb', 1);
      const [pink] = await pixelsAt(page, [{ x: box.left + box.width * 0.85, y: box.top + box.height * 0.85 }]);
      return closeRgb(pink, hexRgb('#ffddee'));
    })(), 'miniature 2');
    const custom = await openWindow(2);
    check(tag + `sur un fond que ni la palette ni une rangée de couleurs gardées ne connaît (#abcdef), « ${T.custom} » est le seul marqué ; l'aperçu et le code disent la couleur`,
      !!custom && custom.marked.length === 0 && custom.customActive && !custom.nonePressed && custom.paperBg === 'rgb(171, 205, 239)' && custom.caption === '#ABCDEF', custom && { marked: custom.marked, custom: custom.customActive, none: custom.nonePressed, paper: custom.paperBg, caption: custom.caption });
    await cancel();
    // L'enregistrement : poser, enregistrer, rouvrir.
    await open(19, 4);
    const none = await page.evaluate(() => Editor.getHTML());
    check(tag + 'un modèle qui n\'a jamais eu de fond s\'écrit comme avant : aucun repère, aucune couleur dans son texte', !/pp-slide-props|data-bg|--pp-slide-bg/.test(none), none.slice(0, 200));
    await click('.pp-slide-item', 1);
    await openWindow(1);
    await click(swatch('#0ea5e9'));
    await apply();
    const written = await page.evaluate(() => Editor.getHTML());
    const one = (written.match(/<div class="pp-slide-props"[^>]*>/g) || []);
    check(tag + 'le fond posé est écrit dans le texte : un seul repère, sa couleur (data-bg) et la variable que le CSS lit, rien d\'une transition, hauteur nulle, rien de visible', one.length === 1 && /data-bg="#0ea5e9"/.test(one[0]) && /--pp-slide-bg:\s*#0ea5e9/.test(one[0]) && !/data-trans/.test(one[0]) && /height:\s*0(px)?\b/.test(one[0]) && /contenteditable="false"/.test(one[0]) && /aria-hidden="true"/.test(one[0]), one);
    check(tag + 'il ouvre sa diapositive : juste après le saut de page, avant le titre', /<div class="page-break-marker"[^>]*>[^<]*<\/div>\s*<div class="pp-slide-props"/.test(written) || /class="page-break-marker"[^>]*>[^<]*<\/[a-z]+><div class="pp-slide-props"/.test(written), written.slice(written.indexOf('page-break-marker') - 20, written.indexOf('page-break-marker') + 400));
    await save();
    await open(20, 4);
    await open(19, 4);
    check(tag + 'enregistré puis rouvert, le fond est le même (bleu ciel, diapositive 2) ; la miniature le peint', brief(await backgrounds(page)) === '- #0ea5e9 - -' && await (async () => {
      await hover('.pp-slide-thumb', 1);
      const box = await rectOf('.pp-slide-thumb', 1);
      const [rgb] = await pixelsAt(page, [{ x: box.left + box.width * 0.85, y: box.top + box.height * 0.85 }]);
      return closeRgb(rgb, hexRgb('#0ea5e9'));
    })(), brief(await backgrounds(page)));
    // Le retirer : le texte redevient comme avant.
    await openWindow(1);
    await click('#pp-slide-background .pp-slide-background-tool:not(.cp-custom)');
    await apply();
    const removed = await page.evaluate(() => Editor.getHTML());
    check(tag + 'retiré par « ' + T.none + ' », le fond ne laisse aucun repère dans le texte', !/pp-slide-props|data-bg|--pp-slide-bg/.test(removed) && brief(await backgrounds(page)) === '- - - -', removed.slice(0, 200));
    await save();
    await leave();
  }

  // --- 6. Importer, dupliquer, déplacer, supprimer.
  if (wanted(6) && full) {
    console.log('\n' + tag + '6) Importer et dupliquer');
    let shape;
    await open(16, 2);
    await click('.pp-slide-item', 0);
    const initialList = brief(await backgrounds(page));
    const initialShape = await docShape(page);
    await click('.pp-slide-import-open');
    await sleep(700);
    await click('.pp-slide-import .ss-trigger');
    await page.keyboard.type('Source');
    await sleep(300);
    await press('Enter', 700);
    const thumbs = await page.evaluate(() => document.querySelectorAll('.pp-slide-import .pp-slide-thumb').length);
    check(tag + 'la source « Source » montre ses deux diapositives', thumbs === 2, thumbs);
    await click('.pp-slide-import .pp-slide-thumb', 0);
    await sleep(900);
    check(tag + 'importer la diapositive 1 de « Source » (fond vert) la pose après la diapositive du curseur avec son fond : le repère arrive avec elle, en tête', brief(await backgrounds(page)) === '- #15803d -' && (await docShape(page)) === 'h|Mhp|hp', { list: brief(await backgrounds(page)), shape: await docShape(page) });
    await click('.pp-slide-import-close');
    await sleep(400);
    await clickText('Cible un');
    await press('Control+z', 500);
    check(tag + 'UN Ctrl+Z défait l\'import et son fond : le texte est celui d\'avant', brief(await backgrounds(page)) === initialList && (await docShape(page)) === initialShape, { list: brief(await backgrounds(page)), shape: await docShape(page), initialList, initialShape });
    // Dupliquer, déplacer, supprimer, ajouter : le fond suit sa diapositive.
    await open(15, 4);
    await click('.pp-slide-item', 0);
    await menuOf(0);
    await click('.pp-slide-menu.visible [data-action="duplicate"]');
    await sleep(400);
    check(tag + 'dupliquer la diapositive 1 (fond jaune) donne une copie avec le même fond, chacune son repère', brief(await backgrounds(page)) === `${YELLOW} ${YELLOW} - ${BLUE} -` && (await docShape(page)) === 'Mhp|Mhp|hl|MFhp|p', { list: brief(await backgrounds(page)), shape: await docShape(page) });
    await press('Control+z', 400);
    await menuOf(0);
    await click('.pp-slide-menu.visible [data-action="moveDown"]');
    await sleep(400);
    check(tag + 'descendre la diapositive 1 : le fond jaune descend avec elle', brief(await backgrounds(page)) === `- ${YELLOW} ${BLUE} -`, { list: brief(await backgrounds(page)), shape: await docShape(page) });
    await press('Control+z', 400);
    await menuOf(2);
    await click('.pp-slide-menu.visible [data-action="moveUp"]');
    await sleep(400);
    check(tag + 'monter la diapositive 3 fait de même dans l\'autre sens : son fond bleu et sa poussée montent avec elle', brief(await backgrounds(page)) === `${YELLOW} ${BLUE} - -` && (await transitions(page)) === '- push:r:1000 - -', { list: brief(await backgrounds(page)), trans: await transitions(page) });
    await press('Control+z', 400);
    await menuOf(0);
    await click('.pp-slide-menu.visible [data-action="delete"]');
    await sleep(500);
    check(tag + 'supprimer la diapositive 1 emporte son fond, sans toucher à celui des autres', brief(await backgrounds(page)) === `- ${BLUE} -` && (await markerCount(page)) === 1, { list: brief(await backgrounds(page)), count: await markerCount(page) });
    await press('Control+z', 400);
    await click('.pp-slide-item', 0);
    await click('.pp-slide-add');
    await click('.pp-slide-layouts.visible [data-action="blank"]');
    await sleep(500);
    check(tag + 'ajouter une diapositive après la 1 : la nouvelle n\'a pas de fond, les autres gardent le leur', brief(await backgrounds(page)) === `${YELLOW} - - ${BLUE} -`, brief(await backgrounds(page)));
    await press('Control+z', 400);
    // Copier-coller d'une diapositive (Ctrl+C, Ctrl+V depuis sa miniature) : le fond la suit.
    await click('.pp-slide-item', 0);
    await press('Control+c', 400);
    await press('Control+v', 1000);
    check(tag + 'Ctrl+C puis Ctrl+V depuis la miniature de la diapositive 1 (fond jaune) : la copie arrive après elle avec le même fond, chacune son repère', brief(await backgrounds(page)) === `${YELLOW} ${YELLOW} - ${BLUE} -` && (await markerCount(page)) === 3, { list: brief(await backgrounds(page)), count: await markerCount(page), shape: await docShape(page) });
    await press('Control+z', 500);
    check(tag + 'UN Ctrl+Z défait le collage et son fond', brief(await backgrounds(page)) === base && (await markerCount(page)) === 2, { list: brief(await backgrounds(page)), count: await markerCount(page) });
    // Un cadre libre posé sur une diapositive à fond : le repère reste en tête.
    await click('.pp-slide-item', 2);
    await chooseObject(page, 'textFrame');
    await sleep(500);
    shape = await docShape(page);
    check(tag + 'un cadre de texte posé sur la diapositive 3 (qui a un fond bleu et déjà un cadre) se range après le repère : il reste le premier bloc', /\|MFF/.test(shape), shape);
    await press('Control+z', 400);
    await leave();
  }

  // --- 7. L'extension éteinte en direct : la ligne est grisée, rien ne s'ouvre.
  if (wanted(7) && full) {
    console.log('\n' + tag + '7) L\'extension éteinte');
    await open(7, 4);
    await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
    await sleep(800);
    await menuOf(0);
    const off = await page.evaluate(() => { const r = document.querySelector('.pp-slide-menu.visible [data-action="background"]'); return r ? { disabled: r.getAttribute('aria-disabled'), tip: r.title || '' } : null; });
    check(tag + `la ligne « ${T.menuRow} » est grisée avec sa raison`, !!off && off.disabled === 'true' && off.tip.length > 5, off);
    await click('.pp-slide-menu.visible [data-action="background"]');
    await sleep(500);
    check(tag + 'son clic n\'ouvre pas la fenêtre', (await windowState(page)) === null, '');
    const thumbColor = await (async () => {
      await press('Escape');
      await hover('.pp-slide-thumb', 0);
      const box = await rectOf('.pp-slide-thumb', 0);
      const [rgb] = await pixelsAt(page, [{ x: box.left + box.width * 0.85, y: box.top + box.height * 0.85 }]);
      return rgb;
    })();
    check(tag + 'les fonds restent (ils viennent du texte) : la miniature 1 est toujours jaune', closeRgb(thumbColor, hexRgb(YELLOW)), thumbColor);
    await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
    await sleep(800);
    await leave();
  }

  await page.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
await run('fr', 'light', true);
if (!ONLY.length || ONLY.includes('en')) await run('en', 'dark', false);
await t.finish();
