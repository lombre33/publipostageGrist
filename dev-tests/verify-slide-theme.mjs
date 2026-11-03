#!/usr/bin/env node
// Le thème d'une présentation (js/slide-theme.js, css/slide-theme.css, js/orientation-toggle.js, extensions/diapositives/slide-theme-ui.js et slide-themes.js ; demande du 02/11, fil « Ajouter un thème de
// présentation » : couleurs, polices, avant le décor), à la VRAIE souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension
// « diapositives » active. Un thème se pose dans une fenêtre du menu Page ; il vit dans la page du modèle (colonne Margins), se voit à l'écran par défaut et recolore ce qui avait une couleur du thème.
//  LA LIGNE : « Thème… » n'est dans le menu Page que d'une présentation, entière dans le panneau, lisible, avec le nom du thème posé à droite ; l'extension éteinte la grise avec sa raison et rien ne s'ouvre.
//  LA FENÊTRE : tient dans le panneau sans défiler, titre et description reliés, « Aspect d'origine » et sept thèmes (au moins 24 px de haut, atteignables), neuf pastilles et deux polices ; un BROUILLON :
//   rien n'est écrit avant « Appliquer », « Annuler » et Échap ne changent rien et rendent le clavier à l'éditeur ; au clavier les flèches choisissent un thème, Tab va aux polices puis aux couleurs, Entrée valide.
//  LA POSE : le titre et le texte prennent la police et la couleur du thème, une couleur de l'ancien thème suit le nouveau (le bleu d'origine devient le premier accent) et une couleur composée à la main reste ;
//   UN Ctrl+Z (vrai clavier) rend le thème ET les couleurs, Ctrl+Y les remet ; le thème est enregistré avec le modèle et revient à la réouverture.
//  LA COULEUR PERSONNALISÉE : une pastille ouvre la fenêtre « Couleur personnalisée » sans cases « garder » ; le thème devient personnalisé (aucun thème prêt coché, « Personnalisé » dans le menu Page) ; un texte
//   illisible sur le fond le dit sans rien empêcher.
//  LES MENUS DE COULEUR : la rangée « Couleurs du thème » est la première du menu de la couleur de police, ses neuf pastilles nommées, sans croix ; un clic pose la couleur, un Ctrl+Z la rend ; le menu tient dans le panneau.
//  LE FOND : posé dans la fenêtre (pastille « Fond »), il est peint sous chaque diapositive qui n'a pas le sien - dans l'éditeur, les miniatures, la Lecture, le diaporama, le PDF (une page par diapositive, la vide
//   de la fin comprise) et le Word (une forme derrière le texte par diapositive) ; une diapositive qui a son fond (jaune) le garde ; un Ctrl+Z rend le blanc d'un coup, Ctrl+Y le fond.
// Lancé par run-headless.mjs (groupe Node « slideThemeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-theme.mjs
// SLIDE_THEME_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.SLIDE_THEME_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slide-theme', port: Number(process.env.SLIDE_THEME_PORT || 8967) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// Deux diapositives : un titre, un texte avec un mot du bleu d'origine (le premier accent d'avant les thèmes) et un mot d'une couleur composée à la main, puis un sous-titre et une liste.
const DOC = `<h1>Titre un</h1><p>Un texte <span style="color: #2f6fed">bleu</span> et <span style="color: #123456">maison</span>.</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li></ul>`;
// Quatre diapositives dont la dernière est vide : le fond du thème se peint sous chacune, la vide comprise.
const DOC_PAPER = `<h1>Titre un</h1><p>Un texte.</p>${BR}<h2>Deux</h2><p>Suite</p>${BR}<h2>Trois</h2>${BR}`;
// 7 « Thème » (la ligne, la fenêtre, la pose), 8 « Thème bis » (les menus de couleur, l'extension éteinte), 9 « Fond » (le fond du thème partout).
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Thème', '${DOC}', false, 'presentation');
  add(8, 'Thème bis', '${DOC}', false, 'presentation');
  add(9, 'Fond', '${DOC_PAPER}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TEXTS = {
  fr: {
    row: 'Thème…', title: 'Thème de la présentation', apply: 'Appliquer', cancel: 'Annuler', original: 'Aspect d’origine', ocean: 'Océan', forest: 'Forêt', custom: 'Personnalisé', decor: 'Décor…',
    applied: 'Thème « Océan » appliqué.', themeColors: 'Couleurs du thème', text: 'Texte', accent1: 'Accent 1', accent2: 'Accent 2', warn: 'Se lit mal sur le fond : Texte.', warnBoth: 'Se lit mal sur le fond : Texte, Titres.', fontTitle: 'Police des titres',
    saveTool: 'Enregistrer comme thème…', forgetTool: 'Retirer de la liste', promptTitle: 'Enregistrer comme thème', defaultName: 'Mon thème', mine: 'Maison', rose: 'Rose',
    savedMsg: 'Thème « Maison » enregistré dans le document.', replacedMsg: 'Thème « Rose » remplacé dans le document.', removedMsg: 'Thème « Maison » retiré de la liste du document.', needsTheme: /^Choisissez ou composez un thème d’abord/, needsMine: /^Choisissez un de vos thèmes/,
    undoneMsg: 'Thèmes du document : aucun.', redoneMsg: 'Thèmes du document : « Maison ».', fullMsg: /^La liste du document garde 12 thèmes au plus/,
  },
  en: {
    row: 'Theme…', title: 'Presentation theme', apply: 'Apply', cancel: 'Cancel', original: 'Original look', ocean: 'Ocean', forest: 'Forest', custom: 'Custom', decor: 'Decoration…',
    applied: 'Theme “Ocean” applied.', themeColors: 'Theme colors', text: 'Text', accent1: 'Accent 1', accent2: 'Accent 2', warn: 'Hard to read on the background: Text.', warnBoth: 'Hard to read on the background: Text, Titles.', fontTitle: 'Title font',
    saveTool: 'Save as theme…', forgetTool: 'Remove from list', promptTitle: 'Save as theme', defaultName: 'My theme', mine: 'House', rose: 'Rose',
    savedMsg: 'Theme “House” saved in the document.', replacedMsg: 'Theme “Rose” replaced in the document.', removedMsg: 'Theme “House” removed from the document’s list.', needsTheme: /^Pick or build a theme first/, needsMine: /^Choose one of your own themes/,
    undoneMsg: 'Document themes: none.', redoneMsg: 'Document themes: “House”.', fullMsg: /^The document’s list keeps 12 themes at most/,
  },
};
// « Annuler » de la fenêtre du thème (les deux gestes du document sont des boutons du même pied, à sa gauche).
const CANCEL = '#pp-slide-theme .pp-modal-actions button:not(.var-modal-primary):not(.var-modal-spacer):not(.pp-slide-theme-tool)';
const SAVE = '#pp-slide-theme .pp-slide-theme-save';
const FORGET = '#pp-slide-theme .pp-slide-theme-forget';
const rgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
const within = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
// Un vrai clic : la souris vient de la gauche sur l'élément, s'y arrête un instant, appuie.
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
// La souris se gare dans la feuille, à gauche des menus de la barre : le menu Page d'une présentation, élargi à 232 px, couvre le coin bas droit du panneau, et un menu ouvert dont la souris ne sort pas ne se remet pas à jour.
const away = async (page) => { await page.mouse.move(300, HEIGHT - 70, { steps: 4 }); await sleep(250); };

// Le menu Page : le survol du bouton l'ouvre, la souris descend tout droit jusqu'à la ligne.
async function openPageMenu(page) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 14, btn.y - 6, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 4 });
  await sleep(350);
  return btn;
}
const themeRowState = page => page.evaluate(() => {
  const row = document.getElementById('v2-btn-slide-theme');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const menu = document.getElementById('v2-page-flyout').getBoundingClientRect();
  return {
    hidden: row.hidden || r.width === 0, name: row.querySelector('.v2-page-row-name').textContent, value: row.querySelector('.v2-page-row-size').textContent, disabled: row.getAttribute('aria-disabled'), title: row.title || '',
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 },
    insideMenu: r.left >= menu.left - 0.5 && r.right <= menu.right + 0.5 && r.top >= menu.top - 0.5 && r.bottom <= menu.bottom + 0.5,
    role: row.getAttribute('role'),
    menuBottom: menu.bottom,
    rowHeights: Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row')).filter(el => el.getBoundingClientRect().width > 0).map(el => Math.round(el.getBoundingClientRect().height * 10) / 10),
  };
});
async function clickThemeRow(page) {
  const btn = await openPageMenu(page);
  const row = await themeRowState(page);
  if (!row || row.hidden) throw new Error('ligne « Thème… » masquée');
  await page.mouse.move(btn.x, row.rect.y, { steps: 8 });
  await page.mouse.move(row.rect.x, row.rect.y, { steps: 3 });
  await sleep(120);
  await page.mouse.click(row.rect.x, row.rect.y);
  await sleep(600);
  return row;
}

// La fenêtre « Thème… » : ses lignes, ses pastilles, ses polices, son aperçu, ses boutons, où elle est.
const windowState = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-slide-theme');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const box = overlay.querySelector('.pp-modal-box');
  const body = overlay.querySelector('.pp-modal-body');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const style = (el) => { const cs = getComputedStyle(el); return { color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, ''), background: cs.backgroundColor }; };
  const rows = Array.from(overlay.querySelectorAll('.pp-slide-theme-row'));
  const chips = Array.from(overlay.querySelectorAll('.pp-slide-theme-chip'));
  const selects = Array.from(overlay.querySelectorAll('.pp-slide-theme-select'));
  const buttons = Array.from(overlay.querySelectorAll('.pp-modal-actions button:not(.pp-slide-theme-tool)'));
  const tools = Array.from(overlay.querySelectorAll('.pp-modal-actions .pp-slide-theme-tool'));
  const controls = rows.concat(chips, selects, buttons, tools);
  const covered = controls.filter((el) => { const q = el.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(hit === el || el.contains(hit)); }).map(el => el.dataset.value || el.dataset.slot || el.textContent.trim());
  const active = document.activeElement;
  let focus = '';
  if (active) {
    if (active.classList.contains('pp-slide-theme-row')) focus = 'row:' + active.dataset.value;
    else if (active.classList.contains('pp-slide-theme-chip')) focus = 'chip:' + active.dataset.slot;
    else if (active.classList.contains('pp-slide-theme-select')) focus = 'select:' + active.dataset.role;
    else if (active.classList.contains('pp-slide-theme-tool')) focus = 'tool:' + active.textContent.trim();
    else if (overlay.contains(active)) focus = 'button:' + active.textContent.trim();
    else focus = (active.tagName + '.' + (active.className || '')).slice(0, 60);
  }
  const preview = overlay.querySelector('.pp-slide-theme-paper');
  return {
    title: overlay.querySelector('h3').textContent, labelledBy: box.getAttribute('aria-labelledby'), titleId: overlay.querySelector('h3').id, describedBy: box.getAttribute('aria-describedby'),
    describedText: (document.getElementById(box.getAttribute('aria-describedby')) || {}).textContent || '', box: rect(box), scrolls: body.scrollHeight > body.clientHeight + 1 || box.scrollHeight > box.clientHeight + 1,
    rows: rows.map(r => ({ value: r.dataset.value, text: r.textContent.trim(), checked: r.getAttribute('aria-checked'), tab: r.tabIndex, height: r.getBoundingClientRect().height, mine: r.classList.contains('is-mine'), firstReady: r.classList.contains('is-first-ready'), title: r.title, visible: (() => { const q = r.getBoundingClientRect(); const l = overlay.querySelector('.pp-slide-theme-list').getBoundingClientRect(); return q.top >= l.top - 0.5 && q.bottom <= l.bottom + 0.5; })() })),
    tools: tools.map(b => ({ text: b.textContent.trim(), disabled: b.getAttribute('aria-disabled'), title: b.title, rect: rect(b) })),
    list: (() => { const l = overlay.querySelector('.pp-slide-theme-list'); const r = l.getBoundingClientRect(); return { scrolls: l.scrollHeight > l.clientHeight + 1, top: r.top, bottom: r.bottom, scrollTop: l.scrollTop }; })(),
    chips: chips.map(c => ({ slot: c.dataset.slot, label: c.getAttribute('aria-label'), background: getComputedStyle(c).backgroundColor, pressed: c.getAttribute('aria-pressed'), width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height })),
    selects: selects.map(s => ({ role: s.dataset.role, value: s.value, label: s.getAttribute('aria-label') })),
    paper: style(preview), previewTitle: style(overlay.querySelector('.pp-slide-theme-sample-title')), previewText: style(overlay.querySelector('.pp-slide-theme-sample-text')),
    bars: Array.from(overlay.querySelectorAll('.pp-slide-theme-bars i')).map(i => getComputedStyle(i).backgroundColor),
    caption: overlay.querySelector('.pp-slide-theme-caption').textContent, warn: overlay.querySelector('.pp-slide-theme-warn').textContent,
    warnShown: (() => { const w = overlay.querySelector('.pp-slide-theme-warn').getBoundingClientRect(); const b = body.getBoundingClientRect(); const a = overlay.querySelector('.pp-modal-actions').getBoundingClientRect(); return w.height > 0 && w.bottom <= b.bottom + 0.5 && w.bottom <= a.top + 0.5; })(),
    warnLines: Math.round(overlay.querySelector('.pp-slide-theme-warn').getBoundingClientRect().height / 16),
    buttons: buttons.map(b => ({ text: b.textContent.trim(), rect: rect(b), primary: b.classList.contains('var-modal-primary') })), covered, focus,
  };
});
// La fenêtre « Couleur personnalisée » ouverte par une pastille.
const colorDialogState = page => page.evaluate(() => {
  const modal = document.getElementById('pp-color-modal');
  if (!modal || getComputedStyle(modal).display === 'none') return null;
  const keep = modal.querySelector('.pp-color-keep');
  const r = modal.querySelector('.pp-modal-box').getBoundingClientRect();
  return { keepShown: !!keep && getComputedStyle(keep).display !== 'none' && keep.querySelectorAll('input').length > 0, hex: document.getElementById('pp-color-hex').value, focus: document.activeElement && document.activeElement.id, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
});

// Le texte à l'écran : la police et la couleur de l'élément (`text` : celui dont le texte est exactement celui-là).
const paintOf = (page, selector, text) => page.evaluate(([sel, txt]) => {
  const all = Array.from(document.querySelectorAll('#editor-container .ProseMirror ' + sel));
  const el = txt ? all.find(e => e.textContent === txt) : all[0];
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') };
}, [selector, text || '']);
const themeOf = page => page.evaluate(() => {
  const theme = PageLayout.getTheme();
  if (!theme) return null;
  const preset = typeof SlideThemes !== 'undefined' ? SlideThemes.find(theme) : null;
  return { id: preset ? preset.id : null, name: theme.name || null, colors: theme.colors, fonts: theme.fonts };
});
const unsaved = page => page.evaluate(() => LiveEntry.hasUnsavedEdits());
const status = page => page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
const inEditor = page => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });
const pageClass = page => page.evaluate(() => document.documentElement.classList.contains('pp-themed'));
const selectWord = (page, needle) => page.evaluate((word) => {
  const ed = EditorCore.getEditor();
  let found = null;
  ed.state.doc.descendants((node, pos) => { if (!found && node.isText && node.text.indexOf(word) !== -1) found = { from: pos + node.text.indexOf(word), to: pos + node.text.indexOf(word) + word.length }; });
  ed.chain().focus().setTextSelection(found).run();
}, needle);
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
const PAPER = '#1b2430';
const YELLOW = '#fde047';
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
const savedMargins = (page, id) => page.evaluate((n) => { const m = window.__gristStub.state.rows.Publipostage_Modeles; return m.Margins[m.id.indexOf(n)]; }, id);
const noThemes = list => list === null || (Array.isArray(list) && list.length === 0);
// Les thèmes du document tels que Grist les a reçus : la clé `themes` de la ligne réservée aux réglages (TypeModele « reglages »), [] sans clé, null sans ligne.
const documentThemes = page => page.evaluate(() => {
  const m = window.__gristStub.state.rows.Publipostage_Modeles;
  const at = m.TypeModele.indexOf('reglages');
  if (at < 0) return null;
  try { return JSON.parse(m.Contenu[at]).themes || []; } catch (e) { return 'illisible'; }
});
// La fenêtre de saisie du nom (js/dialogs.js), posée par-dessus celle du thème.
const promptState = page => page.evaluate(() => {
  const modal = document.getElementById('pp-dialog-modal');
  if (!modal || getComputedStyle(modal).display === 'none') return null;
  const box = modal.querySelector('.pp-dialog-box') || modal.querySelector('.pp-modal-box') || modal.firstElementChild;
  const r = box.getBoundingClientRect();
  const input = document.getElementById('pp-dialog-input');
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    title: (document.getElementById('pp-dialog-title') || {}).textContent, value: input.value, focused: document.activeElement === input,
    selected: input.selectionStart === 0 && input.selectionEnd === input.value.length, onTop: !!hit && box.contains(hit),
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, ok: (modal.querySelector('.var-modal-primary') || {}).textContent,
  };
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  // Le journal des messages d'état (l'enregistrement automatique toutes les 2,5 s remplace le message du thème : un message lu plus tard peut déjà être « Enregistré à… »).
  await page.evaluate(() => {
    window.__statusLog = [];
    const el = document.getElementById('status-msg');
    new MutationObserver(() => window.__statusLog.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const statusLog = () => page.evaluate(() => window.__statusLog.slice());
  const save = async () => { await away(page); await realClick(page, '#btn-save'); await sleep(1000); await away(page); };
  // L'appel `ouvrir` de GFS passe par le sélecteur de modèles : un modèle modifié est enregistré d'abord (sans quoi il poserait sa question « Enregistrer / Abandonner / Annuler »).
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
  const chooseRow = async (value) => { await realClick(page, `#pp-slide-theme .pp-slide-theme-row[data-value="${value}"]`); await sleep(150); };

  // 1) La ligne « Thème… » n'est que dans le menu d'une présentation.
  await openPageMenu(page);
  const inDocument = await themeRowState(page);
  check(tag + 'dans un document, le menu Page n\'a pas de ligne « Thème… » (elle n\'y est pas du tout)', inDocument === null, inDocument);
  await away(page);
  if (!await open(7, 2)) { await page.context().close(); return; }

  const before = await paintOf(page, 'p');
  await openPageMenu(page);
  const row = await themeRowState(page);
  check(tag + `dans une présentation, la ligne « ${T.row} » est dans le menu Page, sans thème à droite, entière dans le menu et dans le panneau`,
    !!row && !row.hidden && row.name === T.row && row.value === '' && row.disabled === 'false' && row.insideMenu && inPanel(row.rect) && row.role === 'menuitem', row);
  check(tag + `le menu Page d'une présentation, avec sa ligne « ${T.row} » de plus, tient dans le panneau de ${WIDTH}x${HEIGHT} avec de la marge (son bas à 20 px au moins du bas) : ses lignes font 24 px, la taille minimale d'une cible, à hauteur de texte fixée`,
    !!row && row.menuBottom <= HEIGHT - 20 && row.rowHeights.length >= 9 && row.rowHeights.every(h => h === 24), row && { bottom: row.menuBottom, heights: row.rowHeights });
  check(tag + 'la ligne est assez haute pour la souris (au moins 20 px) et lisible (4,5:1)', !!row && row.rect.height >= 20 && (await contrastOf(page, '#v2-btn-slide-theme .v2-page-row-name')) >= 4.5, [row && row.rect.height, await contrastOf(page, '#v2-btn-slide-theme .v2-page-row-name')]);
  await away(page);

  // 2) Un vrai clic ouvre la fenêtre.
  await clickThemeRow(page);
  await away(page);
  let win = await windowState(page);
  check(tag + 'un vrai clic sur la ligne ouvre la fenêtre, titrée, reliée à son titre et à sa description', !!win && win.title === T.title && win.labelledBy === win.titleId && !!win.describedBy && win.describedText.length > 30, win && { title: win.title, labelledBy: win.labelledBy, titleId: win.titleId, describedBy: win.describedBy });
  if (!win) { await snap(page, tag.replace(/\W+/g, '') + 'echec'); await page.context().close(); return; }
  await snap(page, `${lang}-${colorScheme}-1-fenetre`);
  check(tag + 'la fenêtre tient dans le panneau de 700x400 sans défiler, boutons compris', inPanel(win.box) && !win.scrolls && win.buttons.every(b => inPanel(b.rect)), { box: win.box, scrolls: win.scrolls, buttons: win.buttons.map(b => b.rect) });
  check(tag + 'huit lignes (Aspect d\'origine et sept thèmes) de 24 px au moins, toutes atteignables, « Aspect d\'origine » cochée et seule atteinte par Tab',
    win.rows.length === 8 && win.rows[0].text === T.original && win.rows[0].checked === 'true' && win.rows.filter(r => r.checked === 'true').length === 1 && win.rows.filter(r => r.tab === 0).length === 1 && win.rows[0].tab === 0 && win.rows.every(r => r.height >= 23.5) && !win.covered.length,
    { rows: win.rows.map(r => [r.value, r.text, r.checked, r.tab, Math.round(r.height)]), covered: win.covered });
  check(tag + 'neuf pastilles de couleur (22 px) et deux polices, boutons « ' + T.cancel + ' » et « ' + T.apply + ' » (le second principal)', win.chips.length === 9 && win.chips.every(c => c.width >= 21.5 && c.height >= 21.5) && win.selects.length === 2
    && win.buttons.map(b => b.text).join('|') === `${T.cancel}|${T.apply}` && win.buttons[1].primary, { chips: win.chips.length, selects: win.selects, buttons: win.buttons.map(b => b.text) });
  check(tag + 'le clavier est sur le thème coché', win.focus === 'row:', win.focus);
  const OCEAN = await page.evaluate(() => SlideThemes.byId('ocean').theme);
  const FOREST = await page.evaluate(() => SlideThemes.byId('forest').theme);

  // 3) Un brouillon : un vrai clic sur « Océan » ne change que l'aperçu.
  await chooseRow('ocean');
  win = await windowState(page);
  const oceanRow = win.rows.find(r => r.value === 'ocean');
  check(tag + 'un clic sur « ' + T.ocean + ' » la coche (une seule) et l\'aperçu prend ses couleurs et ses polices',
    oceanRow.checked === 'true' && win.rows.filter(r => r.checked === 'true').length === 1 && win.paper.background === rgb(OCEAN.colors.bg) && win.previewTitle.color === rgb(OCEAN.colors.title) && win.previewTitle.family === OCEAN.fonts.title
    && win.previewText.color === rgb(OCEAN.colors.text) && win.previewText.family === OCEAN.fonts.body && win.bars.join() === ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(s => rgb(OCEAN.colors[s])).join(),
    { paper: win.paper, title: win.previewTitle, text: win.previewText, bars: win.bars });
  check(tag + 'les neuf pastilles et les deux polices sont celles d\'« ' + T.ocean + ' », nommées',
    ['bg', 'text', 'title', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].every((slot, i) => win.chips[i].slot === slot && win.chips[i].background === rgb(OCEAN.colors[slot]) && /· #[0-9A-F]{6}$/.test(win.chips[i].label))
    && win.selects[0].value === OCEAN.fonts.title && win.selects[1].value === OCEAN.fonts.body, { chips: win.chips.map(c => [c.slot, c.background, c.label]), selects: win.selects });
  check(tag + 'rien n\'est écrit avant « ' + T.apply + ' » : pas de thème, le texte de l\'éditeur est resté tel quel, le modèle n\'est pas modifié',
    (await themeOf(page)) === null && JSON.stringify(await paintOf(page, 'p')) === JSON.stringify(before) && !(await pageClass(page)) && !(await unsaved(page)), [await themeOf(page), before, await paintOf(page, 'p')]);

  // 4) « Annuler » et Échap ne changent rien et rendent le clavier à l'éditeur.
  await realClick(page, CANCEL);
  await sleep(300);
  check(tag + '« ' + T.cancel + ' » ferme la fenêtre sans rien poser, le clavier est dans l\'éditeur', (await windowState(page)) === null && (await themeOf(page)) === null && !(await unsaved(page)) && (await inEditor(page)), [await themeOf(page), await inEditor(page)]);
  await clickThemeRow(page);
  await away(page);
  win = await windowState(page);
  check(tag + 'rouverte, la fenêtre repart de l\'état du modèle (« ' + T.original + ' » cochée, pas le brouillon d\'avant)', !!win && win.rows[0].checked === 'true' && win.rows.find(r => r.value === 'ocean').checked === 'false', win && win.rows.map(r => r.checked));
  await chooseRow('forest');
  await page.keyboard.press('Escape');
  await sleep(300);
  check(tag + 'Échap ferme la fenêtre sans rien poser, le clavier est dans l\'éditeur', (await windowState(page)) === null && (await themeOf(page)) === null && !(await unsaved(page)) && (await inEditor(page)), [await themeOf(page), await inEditor(page)]);

  // 5) Le clavier : flèches, Tab, Entrée.
  await clickThemeRow(page);
  await away(page);
  await page.keyboard.press('ArrowDown');
  await sleep(150);
  win = await windowState(page);
  check(tag + 'la flèche bas passe à « ' + T.ocean + ' », la coche et l\'atteint au clavier', win.focus === 'row:ocean' && win.rows.find(r => r.value === 'ocean').checked === 'true' && win.rows.find(r => r.value === 'ocean').tab === 0, { focus: win.focus, rows: win.rows.map(r => [r.value, r.checked, r.tab]) });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await sleep(150);
  win = await windowState(page);
  check(tag + 'bas puis haut revient à « ' + T.ocean + ' »', win.focus === 'row:ocean' && win.rows.filter(r => r.checked === 'true').length === 1, win.focus);
  const tabbed = [];
  for (let n = 0; n < 4; n++) {
    await page.keyboard.press('Tab');
    await sleep(100);
    tabbed.push((await windowState(page)).focus);
  }
  check(tag + 'Tab sort de la liste vers la police des titres, puis la police du texte, puis « ' + T.decor + ' » (sous les polices), puis la première pastille', tabbed.join() === ['select:title', 'select:body', 'button:' + T.decor, 'chip:bg'].join(), tabbed);
  await chooseRow('ocean');
  await page.keyboard.press('Enter');
  const unsavedRightAfter = await unsaved(page);
  await sleep(900);
  const applied = await themeOf(page);
  check(tag + 'Entrée sur la liste valide la fenêtre : le thème « ' + T.ocean + ' » est posé, la fenêtre fermée et le clavier dans l\'éditeur', (await windowState(page)) === null && !!applied && applied.id === 'ocean' && (await inEditor(page)), [applied && applied.id, await inEditor(page)]);

  // 6) Ce que la pose change dans le texte.
  const h1 = await paintOf(page, 'h1');
  const para = await paintOf(page, 'p');
  const blue = await paintOf(page, 'p span', 'bleu');
  const mine = await paintOf(page, 'p span', 'maison');
  check(tag + 'le titre a la police et la couleur des titres du thème, le texte celles du texte', !!h1 && h1.color === rgb(OCEAN.colors.title) && h1.family === OCEAN.fonts.title && !!para && para.color === rgb(OCEAN.colors.text) && para.family === OCEAN.fonts.body, { h1, para });
  check(tag + 'le mot du bleu d\'origine suit le premier accent du thème, le mot d\'une couleur composée à la main reste', !!blue && blue.color === rgb(OCEAN.colors.accent1) && !!mine && mine.color === 'rgb(18, 52, 86)', { blue, mine });
  const rowAfter = await (async () => { await openPageMenu(page); const s = await themeRowState(page); await away(page); return s; })();
  check(tag + 'le menu Page dit le thème posé à droite de la ligne', !!rowAfter && rowAfter.value === T.ocean, rowAfter && rowAfter.value);
  check(tag + 'le modèle est modifié, le message dit le thème appliqué, le thème est sur la page (classe `pp-themed`)', unsavedRightAfter && (await statusLog()).includes(T.applied) && (await pageClass(page)), [unsavedRightAfter, await statusLog(page), await pageClass(page)]);
  await snap(page, `${lang}-${colorScheme}-2-posé`);

  // 7) Un seul Ctrl+Z (vrai clavier) rend le thème et les couleurs ; Ctrl+Y les remet.
  await selectWord(page, 'bleu');
  await page.keyboard.press('Control+z');
  await sleep(500);
  const undone = await themeOf(page);
  const blueBack = await paintOf(page, 'p span', 'bleu');
  const paraBack = await paintOf(page, 'p');
  check(tag + 'un seul Ctrl+Z rend le thème (aucun), la couleur du mot bleu et la police du texte d\'avant', undone === null && !!blueBack && blueBack.color === 'rgb(47, 111, 237)' && !(await pageClass(page)) && JSON.stringify(paraBack) === JSON.stringify(before), { undone, blueBack, paraBack, before });
  await page.keyboard.press('Control+y');
  await sleep(500);
  const redone = await themeOf(page);
  const blueAgain = await paintOf(page, 'p span', 'bleu');
  check(tag + 'Ctrl+Y remet le thème et la couleur du mot bleu', !!redone && redone.id === 'ocean' && !!blueAgain && blueAgain.color === rgb(OCEAN.colors.accent1), { redone: redone && redone.id, blueAgain });

  // 8) Une couleur composée dans la fenêtre « Couleur personnalisée », sans cases « garder ».
  await clickThemeRow(page);
  await away(page);
  win = await windowState(page);
  check(tag + 'rouverte, la fenêtre coche « ' + T.ocean + ' »', !!win && win.rows.find(r => r.value === 'ocean').checked === 'true', win && win.rows.map(r => r.checked));
  await realClick(page, '#pp-slide-theme .pp-slide-theme-chip[data-slot="accent1"]');
  await sleep(300);
  const dialog = await colorDialogState(page);
  check(tag + 'la pastille « ' + T.accent1 + ' » ouvre « Couleur personnalisée » sur sa couleur, sans cases « garder », dans le panneau', !!dialog && !dialog.keepShown && dialog.hex.toLowerCase() === OCEAN.colors.accent1 && dialog.inside && dialog.focus === 'pp-color-hex', dialog);
  await page.keyboard.type('AA3366');
  await sleep(150);
  await realClick(page, '#pp-color-modal .pp-modal-actions .var-modal-primary');
  await sleep(350);
  win = await windowState(page);
  check(tag + 'la couleur composée est dans le brouillon : pastille et aperçu, aucun thème prêt coché, légende « ' + T.accent1 + ' · #AA3366 », le clavier revient sur la pastille',
    !!win && win.chips[3].background === rgb('#aa3366') && win.bars[0] === rgb('#aa3366') && win.rows.every(r => r.checked === 'false') && win.caption === `${T.accent1} · #AA3366` && win.focus === 'chip:accent1' && (await colorDialogState(page)) === null,
    win && { chip: win.chips[3].background, bars: win.bars[0], checked: win.rows.map(r => r.checked), caption: win.caption, focus: win.focus });
  const titleSelect = await boxOf(page, '#pp-slide-theme .pp-slide-theme-select[data-role="title"]');
  await page.mouse.move(titleSelect.x - 10, titleSelect.y, { steps: 2 });
  await page.selectOption('#pp-slide-theme .pp-slide-theme-select[data-role="title"]', 'Courier New');
  await sleep(200);
  win = await windowState(page);
  check(tag + 'la police des titres choisie dans la liste passe dans l\'aperçu (« Courier New »)', !!win && win.selects[0].value === 'Courier New' && win.previewTitle.family === 'Courier New', win && [win.selects, win.previewTitle]);
  // 9) Un texte illisible sur le fond le dit sans rien empêcher.
  await realClick(page, '#pp-slide-theme .pp-slide-theme-chip[data-slot="text"]');
  await sleep(300);
  await page.keyboard.type(OCEAN.colors.bg.slice(1).toUpperCase());
  await realClick(page, '#pp-color-modal .pp-modal-actions .var-modal-primary');
  await sleep(350);
  win = await windowState(page);
  check(tag + 'un texte de la couleur du fond s\'avertit en rouge lisible (« ' + T.warn + ' ») et « ' + T.apply + ' » reste possible',
    !!win && win.warn === T.warn && (await contrastOf(page, '#pp-slide-theme .pp-slide-theme-warn')) >= 4.5 && !(await page.evaluate(() => document.querySelector('#pp-slide-theme .pp-modal-actions .var-modal-primary').disabled)), [win && win.warn, await contrastOf(page, '#pp-slide-theme .pp-slide-theme-warn')]);
  check(tag + 'l\'avertissement est entier à l\'écran, la fenêtre ne défile pas', !!win && win.warnShown && !win.scrolls && inPanel(win.box), win && { warnShown: win.warnShown, scrolls: win.scrolls, box: win.box });
  // Les titres aussi : l'avertissement nomme les deux, sur deux lignes au besoin, et tient encore.
  await realClick(page, '#pp-slide-theme .pp-slide-theme-chip[data-slot="title"]');
  await sleep(300);
  await page.keyboard.type(OCEAN.colors.bg.slice(1).toUpperCase());
  await realClick(page, '#pp-color-modal .pp-modal-actions .var-modal-primary');
  await sleep(350);
  win = await windowState(page);
  check(tag + 'texte et titres illisibles : l\'avertissement les nomme (' + T.warnBoth + '), entier à l\'écran, sans que la fenêtre défile', !!win && win.warn === T.warnBoth && win.warnShown && !win.scrolls && inPanel(win.box), win && { warn: win.warn, lines: win.warnLines, warnShown: win.warnShown, scrolls: win.scrolls, box: win.box });
  await snap(page, `${lang}-${colorScheme}-3-perso`);
  // On remet un texte et des titres lisibles, puis « Appliquer » au vrai clic.
  await realClick(page, '#pp-slide-theme .pp-slide-theme-chip[data-slot="title"]');
  await sleep(300);
  await page.keyboard.type('111111');
  await realClick(page, '#pp-color-modal .pp-modal-actions .var-modal-primary');
  await sleep(350);
  await realClick(page, '#pp-slide-theme .pp-slide-theme-chip[data-slot="text"]');
  await sleep(300);
  await page.keyboard.type('222222');
  await realClick(page, '#pp-color-modal .pp-modal-actions .var-modal-primary');
  await sleep(350);
  await realClick(page, '#pp-slide-theme .pp-modal-actions .var-modal-primary');
  await sleep(900);
  const custom = await themeOf(page);
  check(tag + '« ' + T.apply + ' » pose le thème personnalisé (premier accent, police des titres, texte) : aucun thème prêt, pas de nom', !!custom && custom.id === null && custom.colors.accent1 === '#aa3366' && custom.fonts.title === 'Courier New' && custom.colors.text === '#222222', custom);
  const blueCustom = await paintOf(page, 'p span', 'bleu');
  check(tag + 'le mot qui suivait le premier accent suit sa nouvelle couleur', !!blueCustom && blueCustom.color === rgb('#aa3366'), blueCustom);
  const rowCustom = await (async () => { await openPageMenu(page); const s = await themeRowState(page); await away(page); return s; })();
  check(tag + 'le menu Page dit « ' + T.custom + ' »', !!rowCustom && rowCustom.value === T.custom, rowCustom && rowCustom.value);

  // 10) Enregistré avec le modèle, retrouvé à la réouverture.
  await save();
  const stored = await savedMargins(page, 7);
  check(tag + 'le thème est enregistré dans la colonne Margins du modèle', typeof stored === 'string' && /"theme"/.test(stored) && /#aa3366/.test(stored), String(stored).slice(0, 200));
  if (await open(8, 2) && await open(7, 2)) {
    const reopened = await themeOf(page);
    const h1Again = await paintOf(page, 'h1');
    check(tag + 'rouvert, le modèle a son thème et le titre sa police', !!reopened && reopened.colors.accent1 === '#aa3366' && !!h1Again && h1Again.family === 'Courier New' && (await pageClass(page)), [reopened && reopened.colors.accent1, h1Again]);
  }

  // 10b) Le diaporama (F5, vrai clavier) montre le thème : le modèle rouvert a le thème personnalisé de l'étape 8.
  if (await open(7, 2)) {
    await page.evaluate(() => EditorCore.getEditor().commands.focus());
    await sleep(200);
    await page.keyboard.press('F5');
    await sleep(1300);
    const show = await page.evaluate(() => {
      // La diapositive montrée est dans le calque vivant de l'ombre de la scène (le PDF, le diaporama et l'impression y ont leurs propres feuilles de style).
      const stage = document.getElementById('pp-slide-show-stage');
      const scope = stage && stage.shadowRoot ? stage.shadowRoot.querySelector('.pp-print-scope') : null;
      const layer = scope && scope.querySelector(':scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)');
      if (!layer) return null;
      const look = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') }; };
      const spans = Array.from(layer.querySelectorAll('p span'));
      return { title: look(layer.querySelector('h1')), text: look(layer.querySelector('p')), blue: look(spans.find(e => e.textContent === 'bleu')), mine: look(spans.find(e => e.textContent === 'maison')) };
    });
    check(tag + 'le diaporama (F5) montre le thème : titre et texte à leur police et à leur couleur, le mot du premier accent à sa nouvelle couleur, la couleur composée à la main inchangée',
      !!show && !!show.title && show.title.family === 'Courier New' && show.title.color === rgb('#111111') && show.text.color === rgb('#222222') && show.blue.color === rgb('#aa3366') && show.mine.color === 'rgb(18, 52, 86)', show);
    await snap(page, `${lang}-${colorScheme}-5-diaporama`);
    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // 11) « Forêt » (Georgia pour les titres, Calibri pour le texte : deux polices qui ne sont pas celle de l'éditeur) : la puce de police de la barre et la rangée « Couleurs du thème » du menu de la couleur de police.
  await open(8, 2);
  await clickThemeRow(page);
  await away(page);
  await chooseRow('forest');
  await realClick(page, '#pp-slide-theme .pp-modal-actions .var-modal-primary');
  await sleep(900);
  const chipOf = async (word) => { await selectWord(page, word); await sleep(200); return page.evaluate(() => document.getElementById('v2-font-chip-val').textContent); };
  const chipBody = await chipOf('Un texte');
  const chipTitle = await chipOf('Titre');
  check(tag + 'la puce de police de la barre dit la police du texte du thème (' + FOREST.fonts.body + ') dans un paragraphe et celle des titres (' + FOREST.fonts.title + ') dans un titre', chipBody === FOREST.fonts.body && chipTitle === FOREST.fonts.title && FOREST.fonts.body !== FOREST.fonts.title, [chipBody, chipTitle]);
  const forestTitle = await paintOf(page, 'h1');
  const forestText = await paintOf(page, 'p');
  check(tag + 'le titre est en ' + FOREST.fonts.title + ' et le texte en ' + FOREST.fonts.body + ', aux couleurs du thème', !!forestTitle && forestTitle.family === FOREST.fonts.title && forestTitle.color === rgb(FOREST.colors.title) && !!forestText && forestText.family === FOREST.fonts.body && forestText.color === rgb(FOREST.colors.text), { forestTitle, forestText });
  await selectWord(page, 'maison');
  await sleep(150);
  await realClick(page, '#v2-btn-text-color-caret');
  await sleep(350);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.v2-color-dropdown.visible');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const first = m.querySelector('.cp-row');
    const swatches = first ? Array.from(first.querySelectorAll('.cp-swatch')) : [];
    return {
      scope: first && first.dataset.scope, label: first && first.querySelector('.cp-row-label') ? first.querySelector('.cp-row-label').textContent : '', colors: swatches.map(s => s.dataset.color), titles: swatches.map(s => s.title), crosses: first ? first.querySelectorAll('.cp-forget').length : -1,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, bottom: Math.round(r.bottom), rows: Array.from(m.querySelectorAll('.cp-row')).map(row => row.dataset.scope),
    };
  });
  const themeColors = ['bg', 'text', 'title', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(slot => FOREST.colors[slot]);
  check(tag + 'la rangée « ' + T.themeColors + ' » est la première du menu de la couleur de police : neuf pastilles dans l\'ordre, nommées, sans croix', !!menu && menu.scope === 'theme' && menu.label === T.themeColors && menu.colors.join() === themeColors.join() && menu.titles[3].startsWith(T.accent1) && menu.crosses === 0, menu);
  check(tag + 'le menu de couleur tient dans le panneau (rangées : ' + (menu && menu.rows.join(', ')) + ', bas à ' + (menu && menu.bottom) + ' px)', !!menu && menu.inside, menu);
  await snap(page, `${lang}-${colorScheme}-4-menu-couleur`);
  if (menu) {
    const swatch = await boxOf(page, `.v2-color-dropdown.visible .cp-row[data-scope="theme"] .cp-swatch[data-color="${FOREST.colors.accent2}"]`);
    await page.mouse.move(swatch.x - 6, swatch.y, { steps: 3 });
    await sleep(120);
    await page.mouse.click(swatch.x, swatch.y);
    await sleep(400);
    const picked = await paintOf(page, 'p span', 'maison');
    check(tag + 'un clic sur « ' + T.accent2 + ' » colore le mot choisi', !!picked && picked.color === rgb(FOREST.colors.accent2), picked);
    await page.keyboard.press('Control+z');
    await sleep(400);
    const unpicked = await paintOf(page, 'p span', 'maison');
    check(tag + 'un Ctrl+Z rend la couleur d\'avant', !!unpicked && unpicked.color === 'rgb(18, 52, 86)', unpicked);
  }

  // 11b) Le fond du thème : peint sous chaque diapositive qui n'a pas le sien, partout.
  if (full && await open(9, 4)) {
    console.log('\n' + tag + '11b) Le fond du thème');
    const spotRightOf = async (selector, index = 0) => page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll('#editor-container .ProseMirror ' + sel)[i];
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.min(r.right - 10, innerWidth - 12), y: r.top + r.height / 2 };
    }, [selector, index]);
    const editorPixel = async (selector, index) => { await sleep(350); const spot = await spotRightOf(selector, index); await sleep(250); return (await pixelsAt(page, [spot]))[0]; };
    const thumbPixel = async (k) => {
      // Une miniature hors de la fenêtre de la bande (le panneau fait 400 px) est amenée au milieu avant d'être lue.
      await page.evaluate((n) => document.querySelectorAll('.pp-slide-item .pp-slide-thumb')[n].scrollIntoView({ block: 'center' }), k);
      await sleep(350);
      const r = await page.evaluate((n) => { const q = document.querySelectorAll('.pp-slide-item .pp-slide-thumb')[n].getBoundingClientRect(); return { x: q.right - 6, y: q.bottom - 5 }; }, k);
      return (await pixelsAt(page, [r]))[0];
    };
    check(tag + 'avant le thème, la page de l\'éditeur et la miniature sont blanches', closeRgb(await editorPixel('h1'), WHITE) && closeRgb(await thumbPixel(0), WHITE), [await editorPixel('h1'), await thumbPixel(0)]);
    // Le thème sombre posé dans la fenêtre, pastille par pastille : texte et titres clairs d'abord (l'avertissement le dit tant que le fond est blanc), puis le fond.
    await clickThemeRow(page);
    await away(page);
    const pick = async (slot, hex) => {
      await realClick(page, `#pp-slide-theme .pp-slide-theme-chip[data-slot="${slot}"]`);
      await sleep(300);
      await page.keyboard.type(hex);
      await realClick(page, '#pp-color-modal .pp-modal-actions .var-modal-primary');
      await sleep(350);
    };
    await pick('text', 'F2F5F9');
    await pick('title', 'FFFFFF');
    await pick('bg', PAPER.slice(1).toUpperCase());
    const draft = await windowState(page);
    check(tag + 'le fond choisi est dans le brouillon (pastille et aperçu) et l\'avertissement de lisibilité s\'est tu', !!draft && draft.chips[0].background === rgb(PAPER) && draft.warn === '', draft && { chip: draft.chips[0].background, warn: draft.warn });
    await realClick(page, '#pp-slide-theme .pp-modal-actions .var-modal-primary');
    await sleep(900);
    await away(page);
    check(tag + 'la page de l\'éditeur est du fond du thème (loin du texte, à droite du titre)', closeRgb(await editorPixel('h1'), hexRgb(PAPER)), await editorPixel('h1'));
    check(tag + 'les quatre miniatures sont du fond du thème, la vide aussi', (await Promise.all([0, 1, 2, 3].map(thumbPixel))).every(c => closeRgb(c, hexRgb(PAPER))), await Promise.all([0, 1, 2, 3].map(thumbPixel)));
    await snap(page, `${lang}-${colorScheme}-6-fond`);
    // Un seul Ctrl+Z rend le blanc, Ctrl+Y le fond.
    await selectWord(page, 'Un texte');
    await page.keyboard.press('Control+z');
    await sleep(500);
    check(tag + 'un seul Ctrl+Z rend la page blanche (éditeur et miniatures)', closeRgb(await editorPixel('h1'), WHITE) && closeRgb(await thumbPixel(1), WHITE) && (await themeOf(page)) === null, [await editorPixel('h1'), await thumbPixel(1)]);
    await page.keyboard.press('Control+y');
    await sleep(500);
    check(tag + 'Ctrl+Y rend le fond du thème', closeRgb(await editorPixel('h1'), hexRgb(PAPER)) && closeRgb(await thumbPixel(1), hexRgb(PAPER)), [await editorPixel('h1'), await thumbPixel(1)]);
    // Le fond propre de la diapositive 2 (jaune) l'emporte sur le fond du thème, dans l'éditeur comme dans la miniature ; les autres gardent le fond du thème.
    await page.evaluate((c) => SlideProps.applyBackground(EditorCore.getEditor(), [1], c), YELLOW);
    await sleep(600);
    check(tag + 'la diapositive 2 a son fond jaune (éditeur, miniature), la diapositive 3 garde le fond du thème', closeRgb(await editorPixel('h2', 0), hexRgb(YELLOW)) && closeRgb(await thumbPixel(1), hexRgb(YELLOW)) && closeRgb(await editorPixel('h2', 1), hexRgb(PAPER)) && closeRgb(await thumbPixel(2), hexRgb(PAPER)),
      [await editorPixel('h2', 0), await thumbPixel(1), await editorPixel('h2', 1), await thumbPixel(2)]);
    await save();
    // La Lecture.
    await realClick(page, '#btn-mode-read');
    await sleep(1400);
    const frames = await page.evaluate(() => document.querySelectorAll('.reader-content [data-ff-bg] > .pp-free-frame-box').length);
    check(tag + 'la Lecture a un cadre de fond par diapositive (quatre)', frames === 4, frames);
    const readerWant = [PAPER, YELLOW, PAPER, PAPER];
    const readerGot = [];
    for (let k = 0; k < 4; k++) {
      await page.evaluate((i) => { document.querySelectorAll('.reader-content [data-ff-bg] > .pp-free-frame-box')[i].scrollIntoView({ block: 'center' }); }, k);
      await sleep(350);
      const spot = await page.evaluate((i) => { const q = document.querySelectorAll('.reader-content [data-ff-bg] > .pp-free-frame-box')[i].getBoundingClientRect(); return { x: q.left + q.width * 0.85, y: q.top + q.height * 0.5 }; }, k);
      readerGot.push((await pixelsAt(page, [spot]))[0]);
    }
    check(tag + 'Lecture : le fond du thème sous les diapositives 1, 3 et la vide, le jaune propre sous la 2', readerGot.every((c, i) => closeRgb(c, hexRgb(readerWant[i]))), readerGot);
    await snap(page, `${lang}-${colorScheme}-7-lecture`);
    await realClick(page, '#btn-mode-edit');
    await sleep(700);
    // Le diaporama (F5).
    await page.evaluate(() => EditorCore.getEditor().commands.focus());
    await sleep(200);
    await page.keyboard.press('F5');
    await sleep(1400);
    const shownColors = [];
    for (let k = 0; k < 4; k++) {
      shownColors.push((await pixelsAt(page, [{ x: WIDTH * 0.85, y: HEIGHT * 0.8 }]))[0]);
      if (k < 3) { await page.keyboard.press('ArrowRight'); await sleep(1100); }
    }
    check(tag + 'diaporama : fond du thème, jaune propre, fond du thème, fond du thème (la vide)', shownColors.every((c, i) => closeRgb(c, hexRgb(readerWant[i]))), shownColors);
    await snap(page, `${lang}-${colorScheme}-8-diaporama`);
    await page.keyboard.press('Escape');
    await sleep(600);
    // Le PDF : une page par diapositive, chacune de son fond.
    const [pdfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), realClick(page, '#btn-export-pdf')]);
    const points = [[0.02, 0.02], [0.5, 0.5], [0.97, 0.97], [0.85, 0.8]];
    const pdf = await readPdf(page, readFileSync(await pdfDownload.path()).toString('base64'), points);
    check(tag + 'le PDF a quatre pages, une par diapositive, la vide comprise', pdf.numPages === 4, pdf.numPages);
    check(tag + 'PDF : fond du thème sur les pages 1, 3 et 4, jaune sur la 2, partout sur la page (coins, milieu)', pdf.colors.length === 4 && pdf.colors.every((c, i) => c.slice(0, 3).every(rgbValue => closeRgb(rgbValue, hexRgb(readerWant[i]), 8))), pdf.colors);
    // Le Word : une forme derrière le texte par diapositive, de la page entière.
    await page.evaluate(() => { const sel = document.getElementById('v2-export-type'); sel.value = 'docx'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    const [wordDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), realClick(page, '#btn-export-pdf')]);
    const xml = await page.evaluate(async (data) => { await ExportCommon.ensureJsZipLoaded(); const zip = await JSZip.loadAsync(data, { base64: true }); return zip.file('word/document.xml').async('string'); }, readFileSync(await wordDownload.path()).toString('base64'));
    await page.evaluate(() => { const sel = document.getElementById('v2-export-type'); sel.value = 'pdf'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    const fills = (xml.match(/<wp:anchor[\s\S]*?<\/wp:anchor>/g) || []).filter(a => /behindDoc="1"/.test(a)).map(a => (/<a:solidFill><a:srgbClr val="(\w+)"/.exec(a) || [])[1]);
    check(tag + 'le Word a quatre formes derrière le texte, du fond du thème, du jaune propre, puis du fond du thème deux fois', fills.join() === ['1B2430', 'FDE047', '1B2430', '1B2430'].join(), fills);
    // Le PowerPoint : le fond du thème est celui du masque (lt1), seule la diapositive jaune écrit le sien.
    await page.evaluate(() => { const sel = document.getElementById('v2-export-type'); sel.value = 'pptx'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(500);
    const [pptDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), realClick(page, '#btn-export-pdf')]);
    const ppt = await page.evaluate(async (data) => {
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(data, { base64: true });
      const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      const slides = await Promise.all(names.map(n => zip.file(n).async('string')));
      return { theme: await zip.file('ppt/theme/theme1.xml').async('string'), master: await zip.file('ppt/slideMasters/slideMaster1.xml').async('string'), backgrounds: slides.map(x => (/<p:bg>[\s\S]*?<\/p:bg>/.exec(x) || [''])[0]) };
    }, readFileSync(await pptDownload.path()).toString('base64'));
    await page.evaluate(() => { const sel = document.getElementById('v2-export-type'); sel.value = 'pdf'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    check(tag + 'le PowerPoint : lt1 du thème est le fond (1B2430), le masque peint bg1, seule la diapositive 2 écrit son fond jaune',
      /<a:lt1><a:srgbClr val="1B2430"\/>/i.test(ppt.theme) && /<p:bg><p:bgRef[^>]*><a:schemeClr val="bg1"\/>/.test(ppt.master) && ppt.backgrounds.length === 4 && ppt.backgrounds.map(b => /FDE047/i.test(b)).join() === 'false,true,false,false', { lt1: (/<a:lt1>[\s\S]*?<\/a:lt1>/.exec(ppt.theme) || [''])[0], backgrounds: ppt.backgrounds });
    await away(page);
  }

  // 11c) Les thèmes du DOCUMENT : « Enregistrer comme thème… » range le thème du brouillon sous un nom, toutes les présentations du document le retrouvent, « Retirer de la liste » l'ôte ; chaque geste est un pas de Ctrl+Z.
  if (await open(8, 2)) {
    console.log('\n' + tag + '11c) Les thèmes du document');
    const closeWindow = async () => { await realClick(page, CANCEL); await sleep(300); };
    const reopen = async () => { await clickThemeRow(page); await away(page); return windowState(page); };
    const tool = async (which) => { await realClick(page, which === 1 ? SAVE : FORGET); await sleep(350); };
    const undoStep = async () => { await selectWord(page, 'Titre'); await page.keyboard.press('Control+z'); await sleep(700); };
    const redoStep = async () => { await selectWord(page, 'Titre'); await page.keyboard.press('Control+y'); await sleep(700); };
    win = await reopen();
    check(tag + `au pied de la fenêtre, à gauche d'« ${T.cancel} », deux boutons : « ${T.saveTool} » (actif : le thème choisi est celui de la présentation) et « ${T.forgetTool} » (grisé : aucun thème du document n'est choisi), dans le panneau, de 24 px au moins, sans rien devant, sur la ligne des boutons de la fenêtre`,
      !!win && win.rows.length === 8 && win.rows.every(r => !r.mine) && win.tools.length === 2 && win.tools[0].text === T.saveTool && win.tools[1].text === T.forgetTool && win.tools[0].disabled === 'false' && win.tools[1].disabled === 'true'
      && win.tools.every(b => inPanel(b.rect) && b.rect.height >= 24 && Math.abs((b.rect.top + b.rect.bottom) / 2 - (win.buttons[0].rect.top + win.buttons[0].rect.bottom) / 2) < 3 && b.rect.right <= win.buttons[0].rect.left) && win.tools[0].rect.right <= win.tools[1].rect.left && !win.covered.length && inPanel(win.box) && !win.scrolls, win && { rows: win.rows.length, tools: win.tools.map(b => [b.text, b.disabled, Math.round(b.rect.height)]), covered: win.covered, scrolls: win.scrolls });
    check(tag + 'le bouton grisé dit sa raison dans son infobulle, les deux textes se lisent (4,5:1)', !!win && T.needsMine.test(win.tools[1].title) && (await contrastOf(page, SAVE)) >= 4.5 && (await contrastOf(page, FORGET)) >= 4.5,
      [win && win.tools[1].title, await contrastOf(page, SAVE), await contrastOf(page, FORGET)]);
    await tool(2);
    win = await windowState(page);
    check(tag + 'un clic sur le bouton grisé ne retire rien, la ligne sous les couleurs dit pourquoi', !!win && win.rows.length === 8 && T.needsMine.test(win.caption) && (await promptState(page)) === null && noThemes(await documentThemes(page)), win && { rows: win.rows.length, caption: win.caption });
    // Un nom se demande : Échap ne range rien, la fenêtre du thème reste ouverte.
    await tool(1);
    let ask = await promptState(page);
    check(tag + `« ${T.saveTool} » demande un nom : la saisie « ${T.promptTitle} » est devant la fenêtre du thème, dans le panneau, propose « ${T.defaultName} » (sélectionné, le clavier dedans)`, !!ask && ask.title === T.promptTitle && ask.value === T.defaultName && ask.focused && ask.selected && ask.onTop && ask.inside, ask);
    await snap(page, `${lang}-${colorScheme}-9-nom`);
    await page.keyboard.press('Escape');
    await sleep(350);
    win = await windowState(page);
    check(tag + 'Échap ferme la saisie seule : la fenêtre du thème reste ouverte, rien n\'est rangé, rien n\'est écrit dans Grist', (await promptState(page)) === null && !!win && win.rows.length === 8 && noThemes(await documentThemes(page)), [win && win.rows.length, await documentThemes(page)]);
    // Ranger « Maison » : le nom tapé remplace le nom proposé ; la saisie se valide au vrai clic.
    await tool(1);
    await page.keyboard.type(T.mine);
    await realClick(page, '#pp-dialog-modal .var-modal-primary');
    await sleep(500);
    win = await windowState(page);
    const mineRow = win && win.rows.find(r => r.value === 'my:' + T.mine);
    check(tag + `« ${T.mine} » est rangé : une neuvième ligne, juste après « ${T.original} » et avant les thèmes prêts (le premier est séparé d'eux par un filet), entière dans la liste, cochée (seule), le clavier dessus, la fenêtre du thème ne défile pas`,
      !!win && win.rows.length === 9 && win.rows[1].value === 'my:' + T.mine && !!mineRow && mineRow.mine && mineRow.visible && win.rows[2].firstReady && mineRow.checked === 'true' && win.rows.filter(r => r.checked === 'true').length === 1 && win.focus === 'row:my:' + T.mine && !win.scrolls && inPanel(win.box) && win.rows.every(r => r.height >= 23.5),
      win && { rows: win.rows.map(r => [r.value, r.checked, r.mine, r.firstReady, r.visible]), focus: win.focus, scrolls: win.scrolls });
    check(tag + 'la ligne sous les couleurs le dit, « ' + T.forgetTool + ' » devient actif, la ligne du document a son infobulle', !!win && win.caption === T.savedMsg && win.tools[1].disabled === 'false' && !!mineRow && mineRow.title.length > 10, win && { caption: win.caption, tools: win.tools.map(b => b.disabled), title: mineRow && mineRow.title });
    await snap(page, `${lang}-${colorScheme}-10-liste`);
    const stored = await documentThemes(page);
    check(tag + 'Grist a reçu la liste : un thème, « ' + T.mine + ' », aux couleurs et aux polices de la présentation', Array.isArray(stored) && stored.length === 1 && stored[0].name === T.mine && JSON.stringify(stored[0].colors) === JSON.stringify(FOREST.colors) && JSON.stringify(stored[0].fonts) === JSON.stringify(FOREST.fonts), stored);
    await closeWindow();
    check(tag + 'rien n\'est posé sur la présentation (« Annuler » ferme), le modèle n\'est pas modifié : la liste est celle du document', (await themeOf(page)).id === 'forest' && !(await unsaved(page)), [await themeOf(page), await unsaved(page)]);
    // Ctrl+Z défait le rangement (depuis la présentation, au vrai clavier), Ctrl+Y le remet.
    await undoStep();
    check(tag + 'un Ctrl+Z défait le rangement : la liste est vide, Grist l\'a reçu, le coin d\'état le dit', (await documentThemes(page)).length === 0 && (await statusLog()).includes(T.undoneMsg), [await documentThemes(page), (await statusLog()).slice(-3)]);
    win = await reopen();
    check(tag + 'rouverte, la fenêtre n\'a plus de thème du document', !!win && win.rows.length === 8 && win.rows.every(r => !r.mine), win && win.rows.length);
    await closeWindow();
    await redoStep();
    check(tag + 'un Ctrl+Y remet « ' + T.mine + ' » (Grist le reçoit, le coin d\'état le dit)', (await documentThemes(page)).length === 1 && (await statusLog()).includes(T.redoneMsg), [await documentThemes(page), (await statusLog()).slice(-3)]);
    // Retirer : le thème choisi quitte la liste, le brouillon garde ses réglages ; un Ctrl+Z le remet.
    win = await reopen();
    await chooseRow('my:' + T.mine);
    await tool(2);
    win = await windowState(page);
    check(tag + `« ${T.forgetTool} » retire « ${T.mine} » de la liste : huit lignes, la ligne sous les couleurs le dit, les réglages restent dans le brouillon (le thème prêt qu'ils sont est coché), le clavier sur la ligne cochée`,
      !!win && win.rows.length === 8 && win.caption === T.removedMsg && win.rows.filter(r => r.checked === 'true').length === 1 && win.rows.find(r => r.value === 'forest').checked === 'true' && /^row:/.test(win.focus) && win.tools[1].disabled === 'true' && (await documentThemes(page)).length === 0,
      win && { rows: win.rows.length, caption: win.caption, focus: win.focus, tools: win.tools.map(b => b.disabled) });
    await closeWindow();
    await undoStep();
    check(tag + 'un Ctrl+Z remet le thème retiré dans la liste (Grist le reçoit)', (await documentThemes(page)).length === 1 && (await documentThemes(page))[0].name === T.mine, await documentThemes(page));
    // Un thème composé dans une présentation est rangé, une AUTRE présentation du document le retrouve et le pose.
    if (await open(7, 2)) {
      win = await reopen();
      check(tag + 'dans l\'autre présentation, la liste du document est là (« ' + T.mine + ' » juste après « ' + T.original + ' », visible sans défiler la liste) et son thème personnalisé n\'est dans aucune ligne cochée', !!win && win.rows.length === 9 && win.rows[1].value === 'my:' + T.mine && win.rows[1].visible && win.rows.every(r => r.checked === 'false'), win && win.rows.map(r => [r.value, r.checked, r.visible]));
      await tool(1);
      ask = await promptState(page);
      check(tag + `« ${T.saveTool} » propose « ${T.defaultName} » (le nom n'est pas pris)`, !!ask && ask.value === T.defaultName, ask);
      await page.keyboard.type(T.rose);
      await page.keyboard.press('Enter');
      await sleep(500);
      win = await windowState(page);
      check(tag + `« ${T.rose} » est rangé : dixième ligne, la deuxième du document (après « ${T.mine} »), cochée, avec le premier accent et la police des titres composés ; Grist a deux thèmes`,
        !!win && win.rows.length === 10 && win.rows[2].value === 'my:' + T.rose && win.rows[2].checked === 'true' && win.rows[2].visible && win.caption === T.savedMsg.replace(T.mine, T.rose) && (await documentThemes(page)).length === 2 && (await documentThemes(page))[1].colors.accent1 === '#aa3366' && (await documentThemes(page))[1].fonts.title === 'Courier New',
        win && { rows: win.rows.map(r => [r.value, r.checked]), caption: win.caption, stored: await documentThemes(page) });
      await closeWindow();
      if (await open(8, 2)) {
        win = await reopen();
        check(tag + 'dans la première présentation, « ' + T.rose + ' » est dans la liste', !!win && win.rows.length === 10 && !!win.rows.find(r => r.value === 'my:' + T.rose), win && win.rows.map(r => r.value));
        await chooseRow('my:' + T.rose);
        await realClick(page, '#pp-slide-theme .pp-modal-actions .var-modal-primary');
        await sleep(900);
        const posed = await themeOf(page);
        const rowRose = await (async () => { await openPageMenu(page); const s = await themeRowState(page); await away(page); return s; })();
        const h1Rose = await paintOf(page, 'h1');
        check(tag + 'un thème du document se pose comme un thème prêt : couleurs, polices et nom de « ' + T.rose + ' », le menu Page dit « ' + T.rose + ' », le titre est en Courier New',
          !!posed && posed.id === null && posed.name === T.rose && posed.colors.accent1 === '#aa3366' && posed.fonts.title === 'Courier New' && !!rowRose && rowRose.value === T.rose && !!h1Rose && h1Rose.family === 'Courier New', [posed, rowRose && rowRose.value, h1Rose]);
        // Remplacer : on part de « Rose », on change une police, on range sous le même nom (proposé) : la ligne est remplacée à sa place.
        win = await reopen();
        await page.selectOption('#pp-slide-theme .pp-slide-theme-select[data-role="title"]', 'Georgia');
        await sleep(200);
        await tool(1);
        ask = await promptState(page);
        check(tag + 'à partir d\'un thème du document, « ' + T.saveTool + ' » propose son nom (« ' + T.rose + ' ») : le ranger le remplace', !!ask && ask.value === T.rose, ask);
        await page.keyboard.press('Enter');
        await sleep(500);
        win = await windowState(page);
        const roseNow = (await documentThemes(page)).find(item => item.name === T.rose);
        check(tag + 'la ligne « ' + T.rose + ' » est remplacée à sa place (toujours dix lignes, la ligne sous les couleurs le dit, Grist a la police des titres Georgia)', !!win && win.rows.length === 10 && win.rows[2].value === 'my:' + T.rose && win.caption === T.replacedMsg && !!roseNow && roseNow.fonts.title === 'Georgia', win && { rows: win.rows.length, caption: win.caption, stored: roseNow });
        // « Aspect d'origine » n'est pas un thème à ranger.
        await chooseRow('');
        win = await windowState(page);
        check(tag + `avec « ${T.original} » choisi, « ${T.saveTool} » est grisé avec sa raison`, !!win && win.tools[0].disabled === 'true' && T.needsTheme.test(win.tools[0].title), win && win.tools[0]);
        await tool(1);
        win = await windowState(page);
        check(tag + 'un clic sur le bouton grisé n\'ouvre aucune saisie et dit pourquoi', (await promptState(page)) === null && !!win && T.needsTheme.test(win.caption), win && win.caption);
        await closeWindow();
        check(tag + '« ' + T.cancel + ' » ne change pas le thème posé sur la présentation (« ' + T.rose + ' »)', (await themeOf(page)).name === T.rose, await themeOf(page));
      }
    }
    // Douze thèmes au plus, et une liste longue tient dans le panneau : elle défile dans sa colonne, la fenêtre ne bouge pas.
    await page.evaluate(() => { for (let n = 3; n <= 12; n += 1) SlideThemes.save(SlideThemes.byId('ocean').theme, 'Thème ' + n); });
    await sleep(500);
    win = await reopen();
    check(tag + 'douze thèmes du document : vingt lignes, la liste défile dans sa colonne, la fenêtre et ses boutons restent dans le panneau sans défiler', !!win && win.rows.length === 20 && win.list.scrolls && !win.scrolls && inPanel(win.box) && win.buttons.every(b => inPanel(b.rect)) && win.tools.every(b => inPanel(b.rect)),
      win && { rows: win.rows.length, listScrolls: win.list.scrolls, scrolls: win.scrolls, box: win.box });
    await snap(page, `${lang}-${colorScheme}-11-liste-longue`);
    await chooseRow('my:' + T.mine);
    await tool(1);
    ask = await promptState(page);
    await page.keyboard.type('Treize');
    await page.keyboard.press('Enter');
    await sleep(500);
    win = await windowState(page);
    check(tag + 'une treizième entrée est refusée : aucune ligne de plus, la ligne sous les couleurs le dit, la saisie est fermée', !!ask && (await promptState(page)) === null && !!win && win.rows.length === 20 && T.fullMsg.test(win.caption) && (await documentThemes(page)).length === 12, win && { rows: win.rows.length, caption: win.caption, stored: (await documentThemes(page)).length });
    // La dernière ligne s'atteint à la souris (la molette fait défiler la liste) et se coche.
    const listBox = await boxOf(page, '#pp-slide-theme .pp-slide-theme-list');
    await page.mouse.move(listBox.x, listBox.y, { steps: 3 });
    await page.mouse.wheel(0, 1200);
    await sleep(400);
    const lastValue = 'editorial';
    const EDITORIAL = await page.evaluate(() => SlideThemes.byId('editorial').theme);
    const lastBox = await boxOf(page, `#pp-slide-theme .pp-slide-theme-row[data-value="${lastValue}"]`);
    const shownInList = !!lastBox && lastBox.top >= listBox.top - 0.5 && lastBox.bottom <= listBox.bottom + 0.5;
    check(tag + 'la molette fait défiler la liste jusqu\'à la dernière ligne (un thème prêt, après les douze du document), entière dans sa colonne', shownInList, { lastBox, listBox });
    if (shownInList) {
      await realClick(page, `#pp-slide-theme .pp-slide-theme-row[data-value="${lastValue}"]`);
      win = await windowState(page);
      check(tag + 'un clic sur la dernière ligne la coche (seule) et l\'aperçu prend ses couleurs', !!win && win.rows.find(r => r.value === lastValue).checked === 'true' && win.rows.filter(r => r.checked === 'true').length === 1 && win.previewTitle.color === rgb(EDITORIAL.colors.title) && win.previewTitle.family === EDITORIAL.fonts.title, win && { checked: win.rows.filter(r => r.checked === 'true').map(r => r.value), title: win.previewTitle });
    }
    await closeWindow();
    // Chaque geste est un pas : le Ctrl+Z qui suit ne défait que le dernier.
    await selectWord(page, 'Titre');
    await page.keyboard.press('Control+z');
    await sleep(500);
    check(tag + 'le Ctrl+Z qui suit défait le dernier geste seulement (« Thème 12 »), pas toute la liste', (await documentThemes(page)).length === 11 && !(await documentThemes(page)).some(item => item.name === 'Thème 12'), (await documentThemes(page)).map(item => item.name));
  }

  // 12) L'extension éteinte grise la ligne avec sa raison et rien ne s'ouvre.
  await away(page);
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await sleep(700);
  await openPageMenu(page);
  const off = await themeRowState(page);
  check(tag + 'l\'extension éteinte, la ligne « ' + T.row + ' » est grisée (aria-disabled) avec sa raison en infobulle', !!off && !off.hidden && off.disabled === 'true' && off.title.length > 10, off);
  if (off && !off.hidden) {
    const btn = await boxOf(page, '#btn-page-orientation');
    await page.mouse.move(btn.x, off.rect.y, { steps: 8 });
    await page.mouse.move(off.rect.x, off.rect.y, { steps: 3 });
    await page.mouse.click(off.rect.x, off.rect.y);
    await sleep(600);
    check(tag + 'un clic sur la ligne grisée n\'ouvre pas la fenêtre du thème', (await windowState(page)) === null, await windowState(page));
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  await away(page);
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique', 'diapositives']));
  await sleep(900);
  await openPageMenu(page);
  const on = await themeRowState(page);
  check(tag + 'l\'extension rallumée, la ligne est de nouveau active', !!on && on.disabled === 'false', on);
  await away(page);
  check(tag + 'aucune boîte native ouverte pendant tout le parcours', natives.length === 0, natives);
  await page.context().close();
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
