#!/usr/bin/env node
// Les transitions d'une diapositive (js/slide-props.js, extensions/diapositives/slide-transitions.js, slide-transitions-ui.js, slide-show.js, slide-strip.js ; demande du 21/10 à 18:35 :
// « transitions »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
// Une transition est un repère caché (hauteur nulle) au tout début de sa diapositive ; elle se règle dans une fenêtre du menu ⋯ d'une miniature et se joue au diaporama.
//  LE MENU ET LA FENÊTRE : la ligne « Transition… » entre « Descendre » et « Supprimer » ; la fenêtre (titre, effets, direction, durée, aperçu, « Appliquer à toutes ») tient dans le panneau, un
//   brouillon : rien n'est écrit avant « Appliquer », « Annuler » et Échap ne changent rien, UN Ctrl+Z défait ; la pastille de la miniature dit l'effet ; au clavier chaque groupe est un groupe de
//   boutons radio.
//  LE REPÈRE DANS LE TEXTE : un seul par diapositive, avant ses cadres libres ; Retour arrière au début d'une diapositive ne l'efface pas (les deux diapositives n'en font plus qu'une), une
//   diapositive vidée le retrouve ; dupliquer, déplacer, supprimer, importer l'emportent avec la diapositive ; un collage hors d'une présentation l'ignore ; les flèches le traversent.
//  LES SORTIES : jamais dans la Lecture, le PDF (autant de pages que de diapositives), le Word, le HTML ni le diaporama ; l'éditeur n'en est pas décalé d'un pixel.
//  LE DIAPORAMA : chaque effet (fondu, poussée, balayage, recouvrement, dévoilement, zoom) est mesuré à mi-course (animations suspendues : la géométrie ET les pixels d'une capture), le retour en
//   arrière rejoue l'effet de la diapositive quittée à l'envers, aucun effet pour un saut (Début, Fin), l'écran de fin, deux pages d'une même diapositive ou une diapositive sans repère ; un geste
//   pendant l'effet le termine ; le mouvement réduit ramène l'effet à un fondu court ; la copie de la page quittée est retirée ; rien n'est écrit dans le modèle ; une présentation de 70
//   diapositives reste légère.
//  LES VALEURS : un effet inconnu devient « aucune », un côté illisible « de droite », une durée est bornée et arrondie au pas de 50 ms ; une transition enregistrée puis rouverte revient à
//   l'identique ; un modèle qui n'en a jamais posé s'écrit comme avant.
// Lancé par run-headless.mjs (groupe Node "transitions", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-transitions.mjs
// TRANSITIONS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; TRANSITIONS_ONLY=1,3 : ne joue que ces parties (essai) ; sans eux, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.TRANSITIONS_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const ONLY = (process.env.TRANSITIONS_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = part => !ONLY.length || ONLY.includes(String(part));
const t = await start({ name: 'verify-transitions', port: Number(process.env.TRANSITIONS_PORT || 8962) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// Le repère, écrit comme l'enregistrement le fait.
const PROPS = (kind, from, dur) => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden" data-trans="${kind}" data-trans-from="${from}" data-trans-dur="${dur}"></div>`;
const PROPS_RAW = attrs => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"${attrs}></div>`;
// Un cadre plein (rectangle de la page entière, 960 x 540 points, sans trait) : sa couleur dit, en pixels, laquelle des deux diapositives on voit.
const FULL = color => `<div class="pp-free-frame" role="group" data-ff-x="0" data-ff-y="0" data-ff-w="960" data-ff-h="540" data-ff-shape="rect" data-ff-fill="${color}"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p></p></div></div></div>`;
const BOX = (x, y, w, h, html) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;

// Les quatre diapositives des essais d'écriture : sans transition, une poussée (1 s), un fondu (0,5 s) avec un cadre, sans transition.
const FOUR = `<h1>Titre un</h1><p>Premier texte</p>${BR}${PROPS('push', 'r', 1000)}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}${PROPS('fade', 'r', 500)}${BOX(100, 100, 300, 80, '<p>Cadre</p>')}<p>Trois</p>${BR}<p>Quatre</p>`;
const FOUR_PLAIN = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}${BOX(100, 100, 300, 80, '<p>Cadre</p>')}<p>Trois</p>${BR}<p>Quatre</p>`;
// Huit diapositives de couleur pour le diaporama : la première a un fondu (qu'on ne joue pas en arrivant), puis un effet chacune, la dernière aucun.
const COLORS = ['#d00000', '#0000d0', '#00a000', '#e0e000', '#a000a0', '#00a0a0', '#ff8000', '#606060'];
const EFFECT = [PROPS('fade', 'r', 1000), PROPS('fade', 'r', 1000), PROPS('push', 'r', 1000), PROPS('wipe', 'l', 1000), PROPS('cover', 't', 1000), PROPS('uncover', 'b', 1000), PROPS('zoom', 'r', 1000), ''];
const PAINTED = COLORS.map((color, k) => `${EFFECT[k]}${FULL(color)}<h2>Couleur ${k + 1}</h2>`).join(BR);
// Trois diapositives dont la deuxième est longue (deux pages) et a une poussée.
const LONG_LINES = Array.from({ length: 34 }, (_, k) => `<p>Ligne ${k + 1} de la diapositive longue</p>`).join('');
const LONGER = `<h1>Début</h1>${BR}${PROPS('push', 'r', 1000)}<h2>Longue</h2>${LONG_LINES}${BR}<h2>Fin</h2>`;
// Des valeurs écrites à la main : un effet inconnu, un côté inconnu, une durée hors bornes, hors pas, sans côté ni durée.
const ODD = `${PROPS('spin', 'x', 'abc')}<h1>Inconnue</h1>${BR}${PROPS('push', 'x', '9999999')}<h2>Énorme</h2>${BR}${PROPS('fade', '', '5')}<h2>Minuscule</h2>${BR}${PROPS('wipe', 't', '1234')}<h2>Hors pas</h2>${BR}${PROPS_RAW(' data-trans="push"')}<h2>Sans côté</h2>`;
// Une source à importer : deux diapositives dont la première a un recouvrement.
const SOURCE = `${PROPS('cover', 't', 800)}<h1>Source un</h1><p>Source texte un</p>${BR}<h2>Source deux</h2>`;
// Soixante-dix diapositives, toutes avec un fondu, de quoi mesurer la copie de la page quittée.
const SEVENTY = Array.from({ length: 70 }, (_, k) => `${PROPS('fade', 'r', 300)}<h2>Diapositive ${k + 1}</h2><p>Un premier paragraphe de la diapositive ${k + 1}, assez long pour faire une ligne ou deux.</p><ul><li><p>Premier point</p></li><li><p>Deuxième point</p></li></ul><p>Un dernier paragraphe.</p>`).join(BR);

// 7 « Effets » (le menu, la fenêtre, les pastilles), 14 « Frappe » (le texte), 15 « Gestes » (dupliquer, déplacer, supprimer), 16 « Cible » (importer), 17 « Sans » (le même texte sans repère),
// 18 « Sorties », 19 « Enregistre », 8 « Couleurs », 9 « Longue », 10 « Valeurs », 11 « Soixante-dix », 12 « Source ». Chaque essai qui écrit a son modèle.
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Effets', '${FOUR}', false, 'presentation');
  add(8, 'Couleurs', '${PAINTED}', false, 'presentation');
  add(9, 'Longue', '${LONGER}', false, 'presentation');
  add(10, 'Valeurs', '${ODD}', false, 'presentation');
  add(11, 'Soixante-dix', '${SEVENTY}', false, 'presentation');
  add(12, 'Source', '${SOURCE}', false, 'presentation');
  add(14, 'Frappe', '${FOUR}', false, 'presentation');
  add(15, 'Gestes', '${FOUR}', false, 'presentation');
  add(16, 'Cible', '<h1>Cible un</h1>${BR}<h2>Cible deux</h2>', false, 'presentation');
  add(17, 'Sans', '${FOUR_PLAIN}', false, 'presentation');
  add(18, 'Sorties', '${FOUR}', false, 'presentation');
  add(19, 'Enregistre', '${FOUR_PLAIN}', false, 'presentation');
  add(20, 'Plus tard', '${FOUR_PLAIN}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: {
    menuRow: 'Transition…', title: n => `Transition de la diapositive ${n}`, titleMany: n => `Transition des ${n} diapositives`, effects: ['Aucune', 'Fondu', 'Poussée', 'Balayage', 'Recouvrement', 'Dévoilement', 'Zoom'],
    sides: ['Vers la gauche', 'Vers la droite', 'Vers le haut', 'Vers le bas'], effectLabel: 'Effet', directionLabel: 'Direction', durationLabel: 'Durée', mixed: 'Les diapositives choisies n’ont pas la même transition : celle de la première est montrée.',
    apply: 'Appliquer', applyAll: 'Appliquer à toutes', cancel: 'Annuler', preview: 'Aperçu', previewLabel: 'Aperçu de la transition',
    badge: name => `Transition : ${name}`, describe: { push1: 'Poussée, vers la gauche, 1 s', fade05: 'Fondu, 0,5 s', pushUp15: 'Poussée, vers le haut, 1,5 s' },
    applied: n => `Transition posée sur ${n} ${n > 1 ? 'diapositives' : 'diapositive'}.`, removed: n => `Transition retirée de ${n} ${n > 1 ? 'diapositives' : 'diapositive'}.`, unchanged: 'La transition est déjà telle quelle.',
    seconds: n => `${String(n).replace('.', ',')} s`,
    noDirection: 'Cet effet n’a pas de direction.', noDuration: 'Sans effet, il n’y a pas de durée.',
  },
  en: {
    menuRow: 'Transition…', title: n => `Transition of slide ${n}`, titleMany: n => `Transition of the ${n} slides`, effects: ['None', 'Fade', 'Push', 'Wipe', 'Cover', 'Uncover', 'Zoom'],
    sides: ['To the left', 'To the right', 'Upward', 'Downward'], effectLabel: 'Effect', directionLabel: 'Direction', durationLabel: 'Duration', mixed: 'The chosen slides do not all have the same transition: the first one’s is shown.',
    apply: 'Apply', applyAll: 'Apply to all', cancel: 'Cancel', preview: 'Preview', previewLabel: 'Transition preview',
    badge: name => `Transition: ${name}`, describe: { push1: 'Push, to the left, 1 s', fade05: 'Fade, 0.5 s', pushUp15: 'Push, upward, 1.5 s' },
    applied: n => `Transition set on ${n} ${n > 1 ? 'slides' : 'slide'}.`, removed: n => `Transition removed from ${n} ${n > 1 ? 'slides' : 'slide'}.`, unchanged: 'The transition is already set that way.',
    seconds: n => `${n} s`,
    noDirection: 'This effect has no direction.', noDuration: 'With no effect, there is no duration.',
  },
};
const EFFECT_IDS = ['', 'fade', 'push', 'wipe', 'cover', 'uncover', 'zoom'];
const SIDE_IDS = ['r', 'l', 'b', 't'];
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); else if (/^echec-/.test(name)) { await mkdir('/tmp/tr-shots', { recursive: true }); await page.screenshot({ path: join('/tmp/tr-shots', name + '.png') }); } }
// Une liste de transitions en une ligne : « - push:r:1000 fade:r:500 - ».
const brief = list => list.map(a => (a ? `${a.transition}:${a.from}:${a.dur}` : '-')).join(' ');

// Les outils d'une page ouverte : positions, premier plan, vrais clics (la souris vient de loin, la bande défile d'abord quand la miniature visée n'y est pas entière).
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const onTop = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && !!hit && (hit === el || el.contains(hit));
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
  return { rectOf, onTop, hover, click, leave };
}

// Le texte : la forme des blocs de premier niveau (h titre, p paragraphe, l liste, | saut de page, M repère de transition, F cadre libre), la liste des transitions et la sélection.
const docShape = page => page.evaluate(() => {
  const names = { pageBreak: '|', slideProps: 'M', freeFrame: 'F', heading: 'h', paragraph: 'p', bulletList: 'l', orderedList: 'o' };
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node) => { out.push(names[node.type.name] || '?'); });
  return out.join('');
});
const listOf = page => page.evaluate(() => SlideProps.listOf(EditorCore.getEditor().state.doc));
const markerCount = page => page.evaluate(() => { let n = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps') n++; }); return n; });
const texts = page => page.evaluate(() => SlideProps.slidesOf(EditorCore.getEditor().state.doc).map((slide) => {
  const doc = EditorCore.getEditor().state.doc;
  return doc.textBetween(slide.start, slide.end, ' ', ' ').replace(/\s+/g, ' ').trim();
}));
const unsaved = page => page.evaluate(() => LiveEntry.hasUnsavedEdits());

// La fenêtre « Transition… » : ses trois groupes, son titre, ses boutons, où elle est.
const windowState = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-slide-transition');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const box = overlay.querySelector('.pp-modal-box');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const group = (sel) => {
    const g = overlay.querySelector(sel);
    if (!g) return null;
    const buttons = Array.from(g.querySelectorAll('.pp-slide-transition-choice'));
    return {
      shown: !g.hidden && getComputedStyle(g).display !== 'none', disabled: g.getAttribute('aria-disabled') === 'true', tip: g.title || '', role: g.getAttribute('role'), label: g.getAttribute('aria-label'), values: buttons.map(b => b.dataset.value), labels: buttons.map(b => b.textContent.trim()),
      names: buttons.map(b => b.getAttribute('aria-label') || b.textContent.trim()), checked: buttons.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.value),
      tabbable: buttons.filter(b => b.tabIndex === 0).map(b => b.dataset.value), roles: Array.from(new Set(buttons.map(b => b.getAttribute('role')))),
    };
  };
  const active = document.activeElement;
  const mixed = overlay.querySelector('.pp-slide-transition-mixed');
  const actions = Array.from(overlay.querySelectorAll('.pp-modal-actions button')).map(b => ({ text: b.textContent.trim(), rect: rect(b), primary: b.classList.contains('var-modal-primary') }));
  return {
    title: overlay.querySelector('h3').textContent, labelledBy: box.getAttribute('aria-labelledby'), titleId: overlay.querySelector('h3').id, describedBy: box.getAttribute('aria-describedby'),
    intro: (overlay.querySelector('.pp-slide-transition-intro') || {}).textContent, mixed: !!mixed && !mixed.hidden, mixedText: mixed ? mixed.textContent : '', box: rect(box), actions,
    effects: group('.pp-slide-transition-effects'), sides: group('.pp-slide-transition-sides'), durations: group('.pp-slide-transition-durations'),
    labels: Array.from(overlay.querySelectorAll('.pp-slide-transition-label')).filter(l => !l.hidden && getComputedStyle(l).display !== 'none').map(l => l.textContent.trim()),
    focus: active && active.classList.contains('pp-slide-transition-choice') ? 'radio:' + active.closest('.pp-slide-transition-choices').className.replace(/.*pp-slide-transition-(effects|sides|durations).*/, '$1') + ':' + active.dataset.value
      : (active && overlay.contains(active) ? 'button:' + active.textContent.trim() : (active ? (active.tagName + '.' + (active.className || '')).slice(0, 60) : '')),
    previewAnimations: overlay.querySelector('.pp-slide-transition-after').getAnimations().length, previewRect: rect(overlay.querySelector('.pp-slide-transition-preview')),
  };
});
// Les pastilles des miniatures : celle qui est là, son info-bulle, et le nom de la miniature.
const badges = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map((item) => {
  const b = item.querySelector('.pp-slide-trans-badge');
  const r = b ? b.getBoundingClientRect() : null;
  return { shown: !!b && !b.hidden && r.width > 0, title: b ? b.title : '', svg: !!(b && b.querySelector('svg')), label: item.getAttribute('aria-label') || '', rect: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null };
}));
const menuRows = page => page.evaluate(() => {
  const menu = document.querySelector('.pp-slide-menu.visible');
  if (!menu) return null;
  return Array.from(menu.children).map(c => (c.dataset && c.dataset.action) || (c.getAttribute('role') === 'separator' ? '-' : '?')).filter(a => a !== '?' && !/^link/.test(a)).join(',');
});

// Le PDF relu par pdf.js : le nombre de pages et le texte de chacune (ligne à ligne).
const readPdf = (page, b64) => page.evaluate(async (data64) => {
  if (!window.pdfjsLib) {
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const raw = atob(data64);
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
  const doc = await window.pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map(it => it.str).filter(s => s.trim()).join(' ').replace(/\s+/g, ' ').trim());
  }
  return { numPages: doc.numPages, pages };
}, b64);
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
const mixRgb = (top, under, a) => top.map((v, i) => v * a + under[i] * (1 - a));
const closeRgb = (got, want, tolerance = 14) => !!got && got.every((v, i) => Math.abs(v - want[i]) <= tolerance);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, onTop, hover, click, leave } = toolsOf(page);
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
    try { await click('.pp-slide-menu.visible [data-action="transition"]'); } catch (e) {
      console.log('  (menu non ouvert pour la miniature ' + index + ') ' + JSON.stringify(await page.evaluate(() => { const m = document.querySelector('.pp-slide-menu'); const more = Array.from(document.querySelectorAll('.pp-slide-more')).map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }); return { menu: m && { cls: m.className, rect: m.getBoundingClientRect().toJSON() }, more, active: document.activeElement && document.activeElement.className }; })));
      await snap(page, 'echec-menu-' + index);
      throw e;
    }
    await sleep(350);
    return windowState(page);
  };
  const inWindow = value => `#pp-slide-transition [data-value="${value}"]`;
  const apply = async () => { await forget(); await click('#pp-slide-transition .var-modal-primary'); };
  const applyAll = async () => { await forget(); await click('#pp-slide-transition .pp-slide-transition-all'); };
  const cancel = async () => { const rects = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-slide-transition .pp-modal-actions button')).map(b => b.textContent.trim())); const i = rects.indexOf(T.cancel); await click('#pp-slide-transition .pp-modal-actions button', i); };
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
  const base = '- push:r:1000 fade:r:500 -';

  // --- 1. Le menu, la fenêtre, les pastilles.
  if (wanted(1)) {
    console.log('\n' + tag + '1) Le menu, la fenêtre et les pastilles');
    await open(7, 4);
    const read = await listOf(page);
    check(tag + 'le texte enregistré est lu : la diapositive 2 a une poussée (1 s), la 3 un fondu (0,5 s), les autres rien', brief(read) === base, brief(read));
    let b = await badges(page);
    check(tag + `seules les miniatures 2 et 3 portent la pastille ; son info-bulle dit « ${T.badge(T.describe.push1)} » et « ${T.badge(T.describe.fade05)} », reprise dans le nom de la miniature`,
      b.map(x => x.shown).join() === 'false,true,true,false' && b[1].title === T.badge(T.describe.push1) && b[2].title === T.badge(T.describe.fade05) && b[1].label.includes(b[1].title) && b[2].label.includes(b[2].title) && b[1].svg, b);
    { const ratio = await contrastOf(page, '.pp-slide-trans-badge:not([hidden])'); check(tag + 'la pastille est lisible à 4,5:1 au moins sur la bande', ratio >= 4.5, ratio); }
    await click('.pp-slide-item', 0);
    await menuOf(0);
    const rows = await menuRows(page);
    const rowText = await page.evaluate(() => { const r = document.querySelector('.pp-slide-menu.visible [data-action="transition"]'); return r ? { text: r.textContent.trim(), role: r.getAttribute('role'), disabled: r.getAttribute('aria-disabled'), svg: !!r.querySelector('svg') } : null; });
    check(tag + `le menu ⋯ a la ligne « ${T.menuRow} » après « Descendre » et avant « Fond… » (puis « Notes… » et « Supprimer »), séparée de « Descendre » par un filet`, /^addAfter,duplicate,-,moveUp,moveDown,-,transition,background,notes,-,delete/.test(rows || '') && !!rowText && rowText.text === T.menuRow && rowText.role === 'menuitem' && rowText.disabled === 'false', { rows, rowText });
    await click('.pp-slide-menu.visible [data-action="transition"]');
    await sleep(350);
    let w = await windowState(page);
    check(tag + `la ligne ouvre « ${T.title(1)} » : un dialogue nommé par son titre et décrit par son texte, entier dans le panneau, avec ses trois boutons dans l'ordre « ${T.applyAll} », « ${T.cancel} », « ${T.apply} »`,
      !!w && w.title === T.title(1) && w.labelledBy === w.titleId && !!w.describedBy && inPanel(w.box) && JSON.stringify(w.actions.map(a => a.text)) === JSON.stringify([T.applyAll, T.cancel, T.apply]) && w.actions.every(a => inPanel(a.rect)) && w.actions[2].primary, w);
    check(tag + `les effets sont un groupe de boutons radio « ${T.effectLabel} » : ${T.effects.join(', ')} ; « ${T.effects[0]} » est choisi (la diapositive n'a rien), seul atteint par Tab, et c'est lui qui a le clavier`,
      !!w && w.effects.role === 'radiogroup' && w.effects.label === T.effectLabel && JSON.stringify(w.effects.values) === JSON.stringify(EFFECT_IDS) && JSON.stringify(w.effects.labels) === JSON.stringify(T.effects) && w.effects.roles.join() === 'radio'
        && w.effects.checked.join() === '' && w.effects.tabbable.length === 1 && w.effects.tabbable[0] === '' && w.focus === 'radio:effects:', w && { effects: w.effects, focus: w.focus });
    check(tag + 'sans effet, la direction et la durée restent là, grisées avec leur raison en info-bulle (rien ne disparaît), sans arrêt de Tab ; l\'aperçu est là, muet pour un lecteur d\'écran',
      !!w && w.sides.shown && w.durations.shown && w.sides.disabled && w.durations.disabled && w.sides.tip === T.noDirection && w.durations.tip === T.noDuration && w.sides.tabbable.length === 0 && w.durations.tabbable.length === 0 && !w.effects.disabled
        && JSON.stringify(w.labels) === JSON.stringify([T.effectLabel, T.directionLabel, T.durationLabel]) && w.previewRect.width > 100, w && { labels: w.labels, sides: [w.sides.disabled, w.sides.tip], durations: [w.durations.disabled, w.durations.tip] });
    await snap(page, `${lang}-fenetre-aucune`);
    // Un effet sans direction (le fondu) a une durée : seule la direction reste grisée, et un clic sur une flèche grisée ne change rien (ni la souris, ni le clavier).
    await click(inWindow('fade'));
    await click(inWindow('t'));
    await press('ArrowRight');
    w = await windowState(page);
    check(tag + `« ${T.effects[1]} » a une durée mais pas de direction : la durée est active, la direction grisée ; un clic sur « ↓ » grisé puis une flèche du clavier ne la cochent pas`,
      !!w && w.effects.checked.join() === 'fade' && w.durations.disabled === false && w.durations.tip === '' && w.sides.disabled && w.sides.tip === T.noDirection && w.sides.checked.join() === 'r' && w.sides.tabbable.length === 0, w && { sides: w.sides.checked, disabled: [w.sides.disabled, w.durations.disabled] });
    { const ratio = await contrastOf(page, '.pp-slide-transition-sides .pp-slide-transition-choice[aria-checked="false"]'); check(tag + 'les flèches grisées restent lisibles à 4,5:1 au moins', ratio >= 4.5, ratio); }
    await click(inWindow('push'));
    w = await windowState(page);
    check(tag + `« ${T.effects[2]} » montre la direction (${T.sides.join(', ')}, des flèches) et la durée (${[0.3, 0.5, 0.7, 1, 1.5, 2].map(T.seconds).join(', ')}), « ${T.sides[0]} » et ${T.seconds(0.7)} par défaut`,
      !!w && w.effects.checked.join() === 'push' && w.sides.shown && w.durations.shown && !w.sides.disabled && !w.durations.disabled && w.sides.tip === '' && w.durations.tip === '' && JSON.stringify(w.sides.values) === JSON.stringify(SIDE_IDS) && JSON.stringify(w.sides.labels) === JSON.stringify(['←', '→', '↑', '↓']) && JSON.stringify(w.sides.names) === JSON.stringify(T.sides)
        && w.sides.checked.join() === 'r' && JSON.stringify(w.durations.labels) === JSON.stringify([0.3, 0.5, 0.7, 1, 1.5, 2].map(T.seconds)) && w.durations.checked.join() === '700' && JSON.stringify(w.labels) === JSON.stringify([T.effectLabel, T.directionLabel, T.durationLabel]), w);
    check(tag + 'un brouillon : rien n\'est écrit tant qu\'on n\'a pas appliqué (le texte est comme avant, rien à enregistrer)', brief(await listOf(page)) === base && !(await unsaved(page)), brief(await listOf(page)));
    await click(inWindow('b'));
    await click(inWindow('1500'));
    await sleep(400);
    w = await windowState(page);
    check(tag + 'le choix de la direction (« ' + T.sides[2] + ' ») et de la durée (1,5 s) se coche, un seul à la fois', !!w && w.sides.checked.join() === 'b' && w.durations.checked.join() === '1500' && w.sides.tabbable.join() === 'b', w && { sides: w.sides.checked, durations: w.durations.checked });
    check(tag + 'l\'aperçu rejoue l\'effet à chaque choix (une animation sur la carte « Après »), puis revient au repos', !!w && w.previewAnimations >= 1, w && w.previewAnimations);
    await sleep(2600);
    w = await windowState(page);
    check(tag + 'l\'aperçu, une fois joué, ne laisse aucune animation en route', !!w && w.previewAnimations === 0, w && w.previewAnimations);
    await click('#pp-slide-transition .pp-slide-transition-replay');
    w = await windowState(page);
    check(tag + `« ${T.preview} » (nom : « ${T.previewLabel} ») le rejoue à la demande`, !!w && w.previewAnimations >= 1 && (await page.evaluate(() => document.querySelector('.pp-slide-transition-replay').getAttribute('aria-label'))) === T.previewLabel, w && w.previewAnimations);
    for (const sel of ['.pp-slide-transition-choice[aria-checked="true"]', '.pp-slide-transition-choice[aria-checked="false"]', '.pp-slide-transition-label', '.pp-slide-transition-intro', '.pp-slide-transition-before', '.pp-slide-transition-after', '#pp-slide-transition .var-modal-primary']) {
      const ratio = await contrastOf(page, sel);
      check(tag + `lisible à 4,5:1 au moins : ${sel.replace('#pp-slide-transition ', '')}`, ratio >= 4.5, ratio);
    }
    await snap(page, `${lang}-fenetre-poussee`);
    await apply();
    w = await windowState(page);
    let list = await listOf(page);
    check(tag + `« ${T.apply} » ferme la fenêtre et pose la poussée vers le haut de 1,5 s sur la diapositive 1 (le repère est son tout premier bloc)`, !w && brief(list) === 'push:b:1500 push:r:1000 fade:r:500 -' && (await docShape(page)) === 'Mhp|Mhl|MFp|p', { w: !!w, list: brief(list), shape: await docShape(page) });
    b = await badges(page);
    check(tag + `la pastille de la miniature 1 dit « ${T.badge(T.describe.pushUp15)} » ; la ligne d'état dit « ${T.applied(1)} »`, b[0].shown && b[0].title === T.badge(T.describe.pushUp15) && (await said()).includes(T.applied(1)), { badge: b[0].title, said: await said() });
    check(tag + 'le clavier est revenu dans le texte', await page.evaluate(() => !!document.activeElement.closest('.ProseMirror')), await page.evaluate(() => document.activeElement.className));
    await press('Control+z');
    list = await listOf(page);
    check(tag + 'UN Ctrl+Z défait la transition posée (le texte est comme avant, sans repère), un Ctrl+Y la remet', brief(list) === base && (await docShape(page)) === 'hp|Mhl|MFp|p', { list: brief(list), shape: await docShape(page) });
    await press('Control+y');
    check(tag + 'Ctrl+Y la remet', brief(await listOf(page)) === 'push:b:1500 push:r:1000 fade:r:500 -', brief(await listOf(page)));
    await press('Control+z');
    // Annuler, Échap : rien ne change.
    w = await openWindow(1);
    check(tag + `la fenêtre de la diapositive 2 montre sa transition : « ${T.effects[2]} », « ${T.sides[0]} », ${T.seconds(1)}`, !!w && w.title === T.title(2) && w.effects.checked.join() === 'push' && w.sides.checked.join() === 'r' && w.durations.checked.join() === '1000', w && { title: w.title, effects: w.effects.checked, sides: w.sides.checked, durations: w.durations.checked });
    await click(inWindow('zoom'));
    await cancel();
    w = await windowState(page);
    check(tag + `« ${T.cancel} » ferme sans rien changer`, !w && brief(await listOf(page)) === base && !(await unsaved(page)), brief(await listOf(page)));
    await openWindow(1);
    await click(inWindow('wipe'));
    await press('Escape');
    w = await windowState(page);
    check(tag + 'Échap ferme sans rien changer, la fenêtre rouverte repart de la transition de la diapositive', !w && brief(await listOf(page)) === base, brief(await listOf(page)));
    // « Appliquer à toutes » : toutes les diapositives, UN pas d'historique.
    await openWindow(2);
    await click(inWindow('uncover'));
    await applyAll();
    list = await listOf(page);
    check(tag + `« ${T.applyAll} » pose l'effet de la fenêtre (Dévoilement, ${T.sides[0].toLowerCase()}, ${T.seconds(0.5)}) sur les quatre diapositives, un repère chacune`, brief(list) === 'uncover:r:500 uncover:r:500 uncover:r:500 uncover:r:500' && (await markerCount(page)) === 4 && (await docShape(page)) === 'Mhp|Mhl|MFp|Mp' && (await said()).includes(T.applied(4)), { list: brief(list), shape: await docShape(page), said: await said() });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z défait les quatre', brief(await listOf(page)) === base && (await markerCount(page)) === 2, brief(await listOf(page)));
    // Plusieurs miniatures : une seule fenêtre.
    await click('.pp-slide-item', 0);
    await page.keyboard.down('Control');
    await click('.pp-slide-item', 1);
    await page.keyboard.up('Control');
    w = await openWindow(1);
    check(tag + `deux miniatures choisies : « ${T.titleMany(2)} », et la fenêtre prévient que leurs transitions diffèrent`, !!w && w.title === T.titleMany(2) && w.mixed && w.mixedText === T.mixed && w.effects.checked.join() === '', w && { title: w.title, mixed: w.mixed, checked: w.effects.checked });
    await click(inWindow('fade'));
    await apply();
    check(tag + 'elle pose le fondu sur les deux (700 ms par défaut), la troisième garde le sien', brief(await listOf(page)) === 'fade:r:700 fade:r:700 fade:r:500 -' && (await said()).includes(T.applied(2)), { list: brief(await listOf(page)), said: await said() });
    await press('Control+z');
    // « Aucune » retire.
    await click('.pp-slide-item', 1);
    w = await openWindow(1);
    await click(inWindow(''));
    w = await windowState(page);
    check(tag + `« ${T.effects[0]} » grise la direction et la durée, sans les cacher`, !!w && w.sides.shown && w.durations.shown && w.sides.disabled && w.durations.disabled && w.effects.checked.join() === '', w && { sides: [w.sides.shown, w.sides.disabled], durations: [w.durations.shown, w.durations.disabled] });
    await apply();
    check(tag + `« ${T.effects[0]} » puis « ${T.apply} » retire la transition (et son repère) : « ${T.removed(1)} »`, brief(await listOf(page)) === '- - fade:r:500 -' && (await markerCount(page)) === 1 && (await said()).includes(T.removed(1)), { list: brief(await listOf(page)), said: await said() });
    await press('Control+z');
    // Appliquer ce qui est déjà posé : rien n'est écrit.
    await openWindow(1);
    await apply();
    check(tag + `appliquer sans rien changer n'écrit rien : « ${T.unchanged} »`, brief(await listOf(page)) === base && (await said()).includes(T.unchanged), { list: brief(await listOf(page)), said: await said() });
    await leave();
  }

  // --- 2. Le repère dans le texte : un par diapositive, au début, qui ne se perd pas.
  if (wanted(2) && full) {
    console.log('\n' + tag + '2) Le repère dans le texte');
    await open(14, 4);
    let shape = await docShape(page);
    check(tag + 'le texte enregistré : chaque repère ouvre sa diapositive (hp | Mhl | MFp | p), avant le cadre libre de la troisième', shape === 'hp|Mhl|MFp|p', shape);
    // Retour arrière au début de la diapositive 2.
    await clickText('Deux');
    await press('Home');
    await press('Backspace');
    shape = await docShape(page);
    let list = await listOf(page);
    check(tag + 'Retour arrière au début de la diapositive 2 n\'efface pas sa transition : les diapositives 1 et 2 n\'en font plus qu\'une, qui garde la poussée en tête', shape === 'Mhphl|MFp|p' && brief(list) === 'push:r:1000 fade:r:500 -', { shape, list: brief(list) });
    check(tag + 'la bande suit : trois miniatures', (await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length)) === 3, await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length));
    await press('Control+z');
    check(tag + 'UN Ctrl+Z défait la fusion', (await docShape(page)) === 'hp|Mhl|MFp|p' && brief(await listOf(page)) === base, { shape: await docShape(page), list: brief(await listOf(page)) });
    // Retour arrière tout au début du texte, avec un repère devant.
    await page.evaluate(() => SlideProps.apply(EditorCore.getEditor(), [0], { transition: 'fade', from: 'r', dur: 700 }));
    await sleep(200);
    await press('Control+Home');
    const before = await docShape(page);
    await press('Backspace');
    check(tag + 'Retour arrière tout au début du texte n\'efface pas le repère de la première diapositive', before === 'Mhp|Mhl|MFp|p' && (await docShape(page)) === before && (await markerCount(page)) === 3, { before, after: await docShape(page) });
    await press('Control+z');
    // Une diapositive vidée de tout, repère compris.
    const cleared = await page.evaluate(() => {
      const ed = EditorCore.getEditor();
      const slide = SlideProps.slidesOf(ed.state.doc)[1];
      ed.view.dispatch(ed.state.tr.delete(slide.start, slide.end));
      return { shape: (() => { const o = []; ed.state.doc.forEach(n => o.push(n.type.name)); return o.join(','); })(), list: SlideProps.listOf(ed.state.doc), slides: SlideProps.slidesOf(ed.state.doc).length };
    });
    check(tag + 'effacer tout le contenu de la diapositive 2 d\'un coup (repère compris) lui rend sa poussée : même nombre de diapositives, même transition', cleared.slides === 4 && brief(cleared.list) === base, cleared);
    await press('Control+z');
    // Un repère hors de sa place revient à sa place ; un repère de trop part.
    const tidy = await page.evaluate(async () => {
      const ed = EditorCore.getEditor();
      const out = {};
      const names = { pageBreak: '|', slideProps: 'M', freeFrame: 'F', heading: 'h', paragraph: 'p', bulletList: 'l' };
      const shape = () => { const o = []; ed.state.doc.forEach(n => o.push(names[n.type.name] || '?')); return o.join(''); };
      out.start = shape();
      // Un repère de trop, au milieu de la diapositive 3 (après son cadre) : le premier reste, l'autre part.
      let s3 = SlideProps.slidesOf(ed.state.doc)[2];
      let frameEnd = 0;
      ed.state.doc.forEach((n, pos) => { if (n.type.name === 'freeFrame') frameEnd = pos + n.nodeSize; });
      ed.view.dispatch(ed.state.tr.insert(frameEnd, ed.state.schema.nodes.slideProps.create({ transition: 'zoom', from: 'l', dur: 900 })));
      out.extra = shape();
      out.extraList = SlideProps.listOf(ed.state.doc).map(a => (a ? a.transition : '-')).join(',');
      // Le seul repère de la diapositive 3, mis après le cadre : il revient en tête.
      s3 = SlideProps.slidesOf(ed.state.doc)[2];
      const first = s3.markers[0];
      const tr = ed.state.tr.delete(first.pos, first.pos + first.node.nodeSize);
      let after = 0;
      tr.doc.forEach((n, pos) => { if (n.type.name === 'freeFrame') after = pos + n.nodeSize; });
      tr.insert(after, first.node);
      ed.view.dispatch(tr);
      out.moved = shape();
      out.movedList = SlideProps.listOf(ed.state.doc).map(a => (a ? a.transition : '-')).join(',');
      return out;
    });
    check(tag + 'un second repère dans une diapositive part (le premier reste) et un repère sorti de sa place revient en tête, avant les cadres', tidy.start === 'hp|Mhl|MFp|p' && tidy.extra === 'hp|Mhl|MFp|p' && tidy.extraList === '-,push,fade,-' && tidy.moved === 'hp|Mhl|MFp|p' && tidy.movedList === '-,push,fade,-', tidy);
    await press('Control+z');
    await press('Control+z');
    // Les flèches traversent les diapositives, les repères et les sauts de page sans rester dessus.
    await press('Control+Home');
    const visited = [];
    for (let k = 0; k < 22; k++) { const c = await cursor(); visited.push(c.node === 'slideProps' ? '<repère>' : (c.node ? '<' + c.node + '>' : c.text)); await press('ArrowDown', 90); }
    const seen = ['Titre un', 'Premier texte', 'Deux', 'Quatre'].every(x => visited.some(v => v.startsWith(x)));
    check(tag + '↓ parcourt tout le texte de la diapositive 1 à la 4 sans jamais se poser sur un repère', seen && !visited.includes('<repère>'), visited);
    const back = [];
    for (let k = 0; k < 26; k++) { await press('ArrowUp', 90); const c = await cursor(); back.push(c.node === 'slideProps' ? '<repère>' : (c.node ? '<' + c.node + '>' : c.text)); }
    check(tag + '↑ remonte jusqu\'au titre de la diapositive 1 sans s\'arrêter sur un repère', back[back.length - 1].startsWith('Titre un') && !back.includes('<repère>'), back);
    // Un clic à la souris sur le bord d'une diapositive ne choisit pas le repère.
    await clickText('Quatre');
    await press('Home');
    await press('ArrowLeft');
    const left = await cursor();
    check(tag + '← au début de la diapositive 4 quitte la diapositive sans se poser sur un repère ni un cadre', left.node !== 'slideProps', left);
    // Collage.
    const pasted = await page.evaluate(async (html) => {
      const ed = EditorCore.getEditor();
      ed.commands.focus('end');
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      const names = { pageBreak: '|', slideProps: 'M', freeFrame: 'F', heading: 'h', paragraph: 'p', bulletList: 'l' };
      const o = []; ed.state.doc.forEach(n => o.push(names[n.type.name] || '?'));
      return { shape: o.join(''), list: SlideProps.listOf(ed.state.doc).map(a => (a ? a.transition : '-')).join(','), text: ed.state.doc.textContent.slice(-12) };
    }, `<div class="pp-slide-props" data-trans="zoom" data-trans-from="l" data-trans-dur="900"></div><p>Collé un</p>`);
    check(tag + 'un repère collé à la fin d\'une présentation devient celui de sa diapositive (la 4), en tête', pasted.list === '-,push,fade,zoom' && /Collé un$/.test(pasted.text) && /\|M[ph]*$/.test(pasted.shape), pasted);
    const again = await page.evaluate(async (html) => {
      const ed = EditorCore.getEditor();
      ed.commands.focus('end');
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      return { list: SlideProps.listOf(ed.state.doc).map(a => (a ? a.transition + ':' + a.from : '-')).join(','), count: (() => { let n = 0; ed.state.doc.descendants((x) => { if (x.type.name === 'slideProps') n++; }); return n; })() };
    }, `<div class="pp-slide-props" data-trans="wipe" data-trans-from="t" data-trans-dur="400"></div><p>Collé deux</p>`);
    check(tag + 'un second repère collé dans la même diapositive n\'en fait pas deux : la diapositive garde le sien', again.list === '-,push:r,fade:r,zoom:l' && again.count === 3, again);
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
      return { markers: n, text: ed.state.doc.textContent.slice(-16), html: Editor.getHTML().includes('pp-slide-props') };
    }, `<div class="pp-slide-props" data-trans="zoom" data-trans-from="l" data-trans-dur="900"></div><p>Collé trois</p>`);
    check(tag + 'dans un document (pas une présentation), le repère collé n\'entre pas : son texte arrive, pas lui', doc.markers === 0 && /Collé trois$/.test(doc.text) && !doc.html, doc);
    await leave();
  }

  // --- 3. Les sorties : jamais de repère, et l'éditeur n'en est pas décalé.
  if (wanted(3) && full) {
    console.log('\n' + tag + '3) Les sorties');
    const tops = () => page.evaluate(() => {
      const root = document.querySelector('#editor-container .tiptap');
      const base = root.getBoundingClientRect();
      return Array.from(root.querySelectorAll('h1, h2, li p, p')).filter(e => e.textContent.trim() && !e.closest('.pp-free-frame')).map(e => ({ text: e.textContent.trim(), top: Math.round((e.getBoundingClientRect().top - base.top) * 10) / 10, left: Math.round((e.getBoundingClientRect().left - base.left) * 10) / 10 }));
    });
    await open(18, 4);
    const marked = await tops();
    const stored = await page.evaluate(() => Editor.getHTML());
    const out = await page.evaluate(html => SlidesEntry.outputHtml('presentation', html), stored);
    const marks = (stored.match(/class="pp-slide-props"/g) || []).length;
    check(tag + 'le texte enregistré porte les deux repères, écrits comme avant (effet, côté, durée, rien de visible)', marks === 2 && /data-trans="push" data-trans-from="r" data-trans-dur="1000"/.test(stored) && /data-trans="fade" data-trans-from="r" data-trans-dur="500"/.test(stored) && /height:\s*0(px)?\b/.test(stored), { marks, stored: stored.slice(0, 400) });
    check(tag + 'le texte des sorties (Lecture, PDF, Word, e-mail, lots, diaporama) n\'a plus aucun repère', !/pp-slide-props|data-trans/.test(out) && /Quatre/.test(out), out.slice(0, 300));
    await open(17, 4);
    const plain = await tops();
    check(tag + 'l\'éditeur n\'est décalé d\'un pixel par aucun repère : tous les blocs sont à la même place qu\'avec le même texte sans repère', JSON.stringify(marked) === JSON.stringify(plain) && marked.length >= 7, { marked: marked.slice(0, 4), plain: plain.slice(0, 4), n: [marked.length, plain.length] });
    // La Lecture.
    await open(18, 4);
    await click('#btn-mode-read');
    await sleep(900);
    const reading = await page.evaluate(() => { const r = document.querySelector('.reader-content'); return r ? { markers: r.querySelectorAll('.pp-slide-props, [data-trans]').length, text: r.textContent.replace(/\s+/g, ' '), empties: Array.from(r.children).filter(c => !c.textContent.trim() && !c.querySelector('img') && c.getBoundingClientRect().height < 1 && !c.classList.contains('page-break-marker')).length } : null; });
    check(tag + 'la Lecture n\'a aucun repère, et le texte de toutes les diapositives', !!reading && reading.markers === 0 && ['Titre un', 'Deux', 'Cadre', 'Trois', 'Quatre'].every(x => reading.text.includes(x)), reading);
    await click('#btn-mode-edit');
    await sleep(600);
    // Le PDF et le Word, avec et sans repères.
    const exportPdf = async () => {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
      return readPdf(page, readFileSync(await download.path()).toString('base64'));
    };
    const pdfMarked = await exportPdf();
    await open(17, 4);
    const pdfPlain = await exportPdf();
    check(tag + 'le PDF a quatre pages, une par diapositive (un repère n\'ajoute ni page ni ligne), et le même texte qu\'avec le même texte sans repère', pdfMarked.numPages === 4 && pdfPlain.numPages === 4 && JSON.stringify(pdfMarked.pages) === JSON.stringify(pdfPlain.pages), { marked: pdfMarked.pages, plain: pdfPlain.pages });
    const wordOf = async () => {
      await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(300);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
      const b64 = readFileSync(await download.path()).toString('base64');
      const xml = await page.evaluate(async (data) => { await ExportCommon.ensureJsZipLoaded(); const zip = await JSZip.loadAsync(data, { base64: true }); return zip.file('word/document.xml').async('string'); }, b64);
      await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      return { paragraphs: (xml.match(/<w:p[ >]/g) || []).length, text: (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('|'), markers: /pp-slide-props|data-trans/.test(xml) };
    };
    const wordPlain = await wordOf();
    await open(18, 4);
    const wordMarked = await wordOf();
    check(tag + 'le Word a les mêmes paragraphes et le même texte avec ou sans repères, et aucune trace d\'un repère', wordMarked.paragraphs === wordPlain.paragraphs && wordMarked.text === wordPlain.text && !wordMarked.markers && wordMarked.paragraphs > 4, { marked: wordMarked, plain: wordPlain });
    await leave();
  }

  // --- 4. Le diaporama : chaque effet à mi-course (animations suspendues), à l'endroit et à l'envers.
  if (wanted(4)) {
    console.log('\n' + tag + '4) Le diaporama');
    // Le diaporama vu de la page : ses calques (le courant, la copie de la page quittée), leur place à l'écran, leur pile, leurs animations.
    const probe = () => page.evaluate(() => {
      const root = document.querySelector('.pp-slide-show');
      const host = root && root.querySelector('.pp-slide-show-host');
      const shadow = host && host.shadowRoot;
      if (!root || !shadow) return null;
      const rr = root.getBoundingClientRect();
      const layers = Array.from(shadow.querySelectorAll('.pp-slide-show-layer')).map((layer) => {
        const r = layer.getBoundingClientRect();
        const cs = getComputedStyle(layer);
        const animations = layer.getAnimations();
        const frame = layer.firstElementChild ? layer.firstElementChild.getBoundingClientRect() : null;
        return {
          ghost: layer.classList.contains('pp-slide-show-ghost'), dx: r.left - rr.left, dy: r.top - rr.top, w: r.width, h: r.height, opacity: Number(cs.opacity), clip: cs.clipPath, z: layer.style.zIndex, order: Array.from(layer.parentNode.children).indexOf(layer), animations: animations.length,
          progress: animations.map(a => a.effect.getComputedTiming().progress), inert: !!layer.inert, hidden: layer.getAttribute('aria-hidden'), events: cs.pointerEvents, frame: frame && { left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom },
        };
      });
      return { state: SlideShow.state(), rootW: rr.width, rootH: rr.height, layers, ghosts: layers.filter(l => l.ghost).length };
    });
    const freeze = fraction => page.evaluate((f) => {
      const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
      const animations = Array.from(host.shadowRoot.querySelectorAll('.pp-slide-show-layer')).flatMap(l => l.getAnimations());
      animations.forEach((a) => { a.pause(); a.currentTime = f * a.effect.getComputedTiming().endTime; });
      return animations.length;
    }, fraction);
    const finishAll = () => page.evaluate(() => {
      const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
      Array.from(host.shadowRoot.querySelectorAll('.pp-slide-show-layer')).flatMap(l => l.getAnimations()).forEach(a => a.finish());
    });
    const counter = () => page.evaluate(() => (document.querySelector('.pp-slide-show-counter') || {}).textContent || '');
    const insets = (clip, w, h) => {
      const m = /inset\(([^)]*)\)/.exec(clip || '');
      if (!m) return null;
      const parts = m[1].trim().split(/\s+/);
      const four = [parts[0], parts[1] || parts[0], parts[2] || parts[0], parts[3] || parts[1] || parts[0]];
      const size = [h, w, h, w];
      return four.map((p, i) => (/%$/.test(p) ? parseFloat(p) / 100 : parseFloat(p) / size[i]));
    };
    // Ce que doit montrer l'écran à la fraction `fraction` de l'effet, selon l'effet et le sens ; la copie de la page quittée est `old`, la page d'arrivée `now`.
    function judge(kind, reverse, shown, oldHex, newHex) {
      const { rootW: W, rootH: H } = shown;
      const old = shown.layers.find(l => l.ghost);
      const now = shown.layers.find(l => !l.ghost);
      const mover = (reverse ? (kind === 'uncover' ? now : old) : (kind === 'uncover' ? old : now));
      const p = (mover.progress[0] !== undefined ? mover.progress[0] : 0);
      const o = hexRgb(oldHex);
      const n = hexRgb(newHex);
      const geometry = [];
      const pixels = [];
      const near2 = (a, b, tolerance = 2.5) => Math.abs(a - b) <= tolerance;
      const at = (x, y, want) => pixels.push({ x: Math.round(x), y: Math.round(y), want });
      const mid = H / 2;
      const col = W / 2;
      const key = kind + (reverse ? '-' : '+');
      switch (key) {
        case 'fade+':
          geometry.push(['la page d\'arrivée apparaît (opacité ' + p.toFixed(2) + ')', near2(now.opacity, p, 0.03) && old.opacity === 1 && old.animations === 0, { now: now.opacity, p }]);
          at(col, mid, mixRgb(n, o, p));
          break;
        case 'fade-':
          geometry.push(['la page quittée disparaît (opacité ' + (1 - p).toFixed(2) + ')', near2(old.opacity, 1 - p, 0.03) && now.animations === 0, { old: old.opacity, p }]);
          at(col, mid, mixRgb(o, n, 1 - p));
          break;
        case 'push+':
          geometry.push(['la page d\'arrivée entre de la droite, la quittée sort à gauche', near2(now.dx, (1 - p) * W) && near2(old.dx, -p * W), { now: now.dx, old: old.dx, p }]);
          at((1 - p) * W - 30, mid, o); at((1 - p) * W + 30, mid, n);
          break;
        case 'push-':
          geometry.push(['la page quittée sort à droite, celle où l\'on revient entre de la gauche', near2(old.dx, p * W) && near2(now.dx, -(1 - p) * W), { now: now.dx, old: old.dx, p }]);
          at(p * W - 30, mid, n); at(p * W + 30, mid, o);
          break;
        case 'wipe+': {
          const cut = insets(now.clip, W, H);
          geometry.push(['la page d\'arrivée se découvre depuis le bord gauche', !!cut && near2(cut[1] * W, (1 - p) * W, 3) && cut[0] === 0 && cut[2] === 0 && cut[3] === 0, { clip: now.clip, p }]);
          at(p * W - 30, mid, n); at(p * W + 30, mid, o);
          break;
        }
        case 'wipe-': {
          const cut = insets(old.clip, W, H);
          geometry.push(['la page quittée se referme vers le bord gauche', !!cut && near2(cut[1] * W, p * W, 3), { clip: old.clip, p }]);
          at((1 - p) * W - 30, mid, o); at((1 - p) * W + 30, mid, n);
          break;
        }
        case 'cover+':
          geometry.push(['la page d\'arrivée descend d\'en haut sur l\'autre, qui ne bouge pas', near2(now.dy, -(1 - p) * H) && old.dy === 0 && old.animations === 0, { now: now.dy, old: old.dy, p }]);
          at(col, p * H - 30, n); at(col, p * H + 30, o);
          break;
        case 'cover-':
          geometry.push(['la page quittée remonte et laisse voir l\'autre dessous', near2(old.dy, -p * H) && now.dy === 0, { now: now.dy, old: old.dy, p }]);
          at(col, H - p * H - 30, o); at(col, H - p * H + 30, n);
          break;
        case 'uncover+':
          geometry.push(['la page quittée remonte et découvre celle d\'arrivée dessous', near2(old.dy, -p * H) && now.dy === 0 && now.animations === 0, { now: now.dy, old: old.dy, p }]);
          at(col, H - p * H - 30, o); at(col, H - p * H + 30, n);
          break;
        case 'uncover-':
          geometry.push(['la page où l\'on revient descend d\'en haut sur l\'autre', near2(now.dy, -(1 - p) * H) && old.dy === 0, { now: now.dy, old: old.dy, p }]);
          at(col, p * H - 30, n); at(col, p * H + 30, o);
          break;
        case 'zoom+':
          geometry.push(['la page d\'arrivée grandit depuis le centre en apparaissant', near2(now.opacity, p, 0.03) && near2(now.w / W, 0.5 + 0.5 * p, 0.03), { opacity: now.opacity, scale: now.w / W, p }]);
          at(col, mid, mixRgb(n, o, p)); at(8, mid, o);
          break;
        case 'zoom-':
          geometry.push(['la page quittée rétrécit vers le centre en disparaissant', near2(old.opacity, 1 - p, 0.03) && near2(old.w / W, 1 - 0.5 * p, 0.03), { opacity: old.opacity, scale: old.w / W, p }]);
          at(col, mid, mixRgb(o, n, 1 - p)); at(8, mid, n);
          break;
        default:
          geometry.push(['effet connu', false, key]);
      }
      const above = (reverse ? (kind === 'uncover' ? 'new' : 'old') : (kind === 'uncover' ? 'old' : 'new'));
      geometry.push([`la pile : ${above === 'new' ? 'la page d\'arrivée' : 'la page quittée'} est devant (le dernier calque du conteneur, sans aucun z-index posé)`, (above === 'new' ? now.order > old.order : old.order > now.order) && now.z === '' && old.z === '', { now: [now.order, now.z], old: [old.order, old.z] }]);
      geometry.push(['la copie de la page quittée ne prend ni la souris ni le clavier (inerte, cachée aux lecteurs d\'écran)', old.inert && old.hidden === 'true' && old.events === 'none', old]);
      return { geometry, pixels, p };
    }

    await open(8, 8);
    const before = brief(await listOf(page));
    check(tag + 'les huit diapositives de couleur ont leurs effets : fondu, fondu, poussée, balayage, recouvrement, dévoilement, zoom, rien', before === 'fade:r:1000 fade:r:1000 push:r:1000 wipe:l:1000 cover:t:1000 uncover:b:1000 zoom:r:1000 -', before);
    await click('.pp-slide-item', 0);
    await leave();
    await click('.pp-slide-show-open');
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
    await sleep(900);
    let shown = await probe();
    check(tag + 'le diaporama part de la diapositive 1 sans effet (on y arrive, on n\'y passe pas), une seule page à l\'écran', !!shown && shown.state.index === 0 && shown.state.transition === null && shown.layers.length === 1 && shown.ghosts === 0 && shown.layers[0].animations === 0, shown);
    const rgbOk = async (name, points) => {
      const got = await pixelsAt(page, points.map(({ x, y }) => ({ x, y })));
      const bad = points.map((pt, i) => ({ pt, got: got[i] })).filter(({ pt, got: g }) => !closeRgb(g, pt.want, 16));
      check(name, bad.length === 0, bad);
    };
    const FORWARD = ['fade', 'push', 'wipe', 'cover', 'uncover', 'zoom'];
    const SIDES_OF = { fade: 'r', push: 'r', wipe: 'l', cover: 't', uncover: 'b', zoom: 'r' };
    const NAME = { fade: 'fondu', push: 'poussée', wipe: 'balayage', cover: 'recouvrement', uncover: 'dévoilement', zoom: 'zoom' };
    // Vers l'avant : 1 -> 2 (fondu), 2 -> 3 (poussée), 3 -> 4 (balayage), 4 -> 5 (recouvrement), 5 -> 6 (dévoilement), 6 -> 7 (zoom).
    for (let k = 0; k < FORWARD.length; k++) {
      const kind = FORWARD[k];
      await press('ArrowRight', 40);
      const count = await freeze(0.5);
      await sleep(150);
      shown = await probe();
      const info = shown && shown.state;
      check(tag + `→ de la diapositive ${k + 1} à la ${k + 2} joue le ${NAME[kind]} de la diapositive d'arrivée (1 s, côté ${SIDES_OF[kind]}) : ${count} animation(s), une copie de la page quittée par-dessus`,
        !!info && info.index === k + 1 && !!info.transition && info.transition.kind === kind && info.transition.side === SIDES_OF[kind] && info.transition.duration === 1000 && info.transition.reverse === false && shown.ghosts === 1 && shown.layers.length === 2 && count >= 1, shown);
      if (shown && shown.layers.length === 2 && info && info.transition) {
        const verdict = judge(kind, false, shown, COLORS[k], COLORS[k + 1]);
        verdict.geometry.forEach(([name, ok, got]) => check(tag + `${NAME[kind]} à mi-course : ${name}`, ok, got));
        await rgbOk(tag + `${NAME[kind]} à mi-course : les pixels de l'écran sont ceux de l'effet (capture de la page, aux deux côtés de la frontière)`, verdict.pixels);
        if (k === 1 || k === 5) await snap(page, `${lang}-diaporama-${kind}`);
      }
      await finishAll();
      await sleep(250);
      shown = await probe();
      check(tag + `${NAME[kind]} fini : la copie est retirée, le calque courant est revenu à son état naturel (rien d'animé, pas de pile ni de décalage)`, !!shown && shown.ghosts === 0 && shown.layers.length === 1 && shown.layers[0].animations === 0 && shown.layers[0].z === '' && shown.layers[0].dx === 0 && shown.layers[0].dy === 0 && shown.layers[0].opacity === 1 && shown.state.transition === null, shown);
    }
    // À l'envers : on revient de la 7 à la 1, chaque effet joué à l'envers (celui de la diapositive qu'on quitte).
    for (let k = FORWARD.length - 1; k >= 0; k--) {
      const kind = FORWARD[k];
      await press('ArrowLeft', 40);
      const count = await freeze(0.5);
      await sleep(150);
      shown = await probe();
      const info = shown && shown.state;
      check(tag + `← de la diapositive ${k + 2} à la ${k + 1} rejoue le ${NAME[kind]} de la diapositive qu'on quitte, à l'envers : ${count} animation(s)`,
        !!info && info.index === k && !!info.transition && info.transition.kind === kind && info.transition.reverse === true && shown.ghosts === 1 && count >= 1, shown);
      if (shown && shown.layers.length === 2 && info && info.transition) {
        const verdict = judge(kind, true, shown, COLORS[k + 1], COLORS[k]);
        verdict.geometry.forEach(([name, ok, got]) => check(tag + `${NAME[kind]} à l'envers, à mi-course : ${name}`, ok, got));
        await rgbOk(tag + `${NAME[kind]} à l'envers, à mi-course : les pixels de l'écran sont ceux de l'effet`, verdict.pixels);
      }
      await finishAll();
      await sleep(250);
    }
    shown = await probe();
    check(tag + 'revenu à la diapositive 1 : plus de copie, le compteur dit 1', !!shown && shown.state.index === 0 && shown.ghosts === 0 && /^1\b/.test(await counter()), { shown: shown && shown.state, counter: await counter() });
    // Sans effet : Fin, Début, l'écran de fin.
    await press('End', 120);
    shown = await probe();
    check(tag + 'Fin va à la dernière diapositive d\'un coup (pas d\'effet, pas de copie), Début revient de même', !!shown && shown.state.index === 7 && shown.state.transition === null && shown.ghosts === 0 && shown.layers[0].animations === 0, shown && shown.state);
    await press('Home', 120);
    shown = await probe();
    check(tag + 'Début revient à la première de même', !!shown && shown.state.index === 0 && shown.state.transition === null && shown.ghosts === 0, shown && shown.state);
    // Sans repère sur la diapositive d'arrivée, ni en revenant d'une diapositive qui n'en a pas.
    await press('End', 120);
    await press('ArrowLeft', 40);
    shown = await probe();
    check(tag + '← de la dernière diapositive (qui n\'a pas de transition) vers la 7 ne joue rien', !!shown && shown.state.index === 6 && shown.state.transition === null && shown.ghosts === 0, shown && shown.state);
    await press('ArrowRight', 40);
    shown = await probe();
    check(tag + '→ vers la dernière diapositive (sans transition) ne joue rien non plus', !!shown && shown.state.index === 7 && shown.state.transition === null && shown.ghosts === 0 && shown.layers.every(l => l.animations === 0), shown && shown.state);
    await press('ArrowRight', 40);
    shown = await probe();
    const ended = await page.evaluate(() => { const e = document.querySelector('.pp-slide-show-end'); return !!e && !e.hidden; });
    check(tag + 'après la dernière, l\'écran de fin s\'affiche sans effet', ended && shown.state.ended === true && shown.state.transition === null && shown.ghosts === 0, shown && shown.state);
    await press('ArrowLeft', 40);
    shown = await probe();
    check(tag + '← de l\'écran de fin revient à la dernière diapositive sans effet', shown.state.ended === false && shown.state.index === 7 && shown.state.transition === null && shown.ghosts === 0, shown && shown.state);
    // Un geste pendant l'effet le termine aussitôt et fait ce qu'il demande.
    await press('Home', 120);
    await press('ArrowRight', 10);
    await press('ArrowRight', 40);
    shown = await probe();
    check(tag + 'deux → d\'affilée : le premier effet est terminé aussitôt (une seule copie, celle du second), on est sur la diapositive 3 et c\'est la poussée qui joue', !!shown && shown.state.index === 2 && shown.state.transition && shown.state.transition.kind === 'push' && shown.ghosts === 1, shown && { state: shown.state, ghosts: shown.ghosts });
    await sleep(1400);
    shown = await probe();
    check(tag + 'laissée à elle-même, la poussée va jusqu\'au bout : plus de copie, calque revenu à son état naturel', !!shown && shown.ghosts === 0 && shown.layers[0].animations === 0 && shown.layers[0].z === '' && shown.layers[0].dx === 0 && shown.state.transition === null, shown);
    // Échap en plein effet.
    await press('ArrowRight', 40);
    await press('Escape', 400);
    check(tag + 'Échap en plein effet ferme le diaporama (plus de rendu, plus de copie)', await page.evaluate(() => !document.querySelector('.pp-slide-show') && !document.querySelector('#pp-slide-show-stage')), '');
    check(tag + 'le diaporama n\'a rien écrit dans le modèle : le texte est celui d\'avant, rien n\'est à enregistrer', brief(await listOf(page)) === before && !(await unsaved(page)), brief(await listOf(page)));
    // Le mouvement réduit du système : tout effet devient un fondu court, sans déplacement.
    if (full) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await click('.pp-slide-item', 1);
      await leave();
      await click('.pp-slide-show-open');
      await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
      await sleep(900);
      await press('ArrowRight', 40);
      const count = await freeze(0.5);
      await sleep(150);
      shown = await probe();
      const calm = shown && shown.state && shown.state.transition;
      const arriving = shown && shown.layers.find(l => !l.ghost);
      const leaving = shown && shown.layers.find(l => l.ghost);
      check(tag + 'mouvement réduit : la poussée de la diapositive 3 devient un fondu de 300 ms au plus, sans déplacement', !!calm && calm.kind === 'fade' && calm.duration <= 300 && count === 1 && !!arriving && arriving.dx === 0 && arriving.dy === 0 && leaving.dx === 0 && arriving.opacity > 0.05 && arriving.opacity < 0.95, { calm, count, arriving: arriving && [arriving.dx, arriving.dy, arriving.opacity] });
      await finishAll();
      await press('Escape', 400);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    await leave();
  }

  // --- 5. Les valeurs, l'enregistrement.
  if (wanted(5) && full) {
    console.log('\n' + tag + '5) Les valeurs et l\'enregistrement');
    await open(10, 5);
    const odd = await listOf(page);
    check(tag + 'des valeurs écrites à la main sont lues sans erreur : un effet inconnu devient « aucune », un côté inconnu « de droite », une durée est bornée (100 ms à 5 s) et arrondie à 50 ms, un côté et une durée absents prennent leur valeur', brief(odd) === '- push:r:5000 fade:r:100 wipe:t:1250 push:r:700', brief(odd));
    const oddBadges = await badges(page);
    check(tag + 'seule la diapositive à effet inconnu n\'a pas de pastille ; les autres disent ce qui sera joué', oddBadges.map(x => x.shown).join() === 'false,true,true,true,true', oddBadges.map(x => x.shown));
    // L'enregistrement : poser, enregistrer, rouvrir.
    await open(19, 4);
    const none = await page.evaluate(() => Editor.getHTML());
    check(tag + 'un modèle qui n\'a jamais eu de transition s\'écrit comme avant : aucun repère dans son texte', !/pp-slide-props|data-trans/.test(none), none.slice(0, 200));
    await click('.pp-slide-item', 1);
    await openWindow(1);
    await click(inWindow('push'));
    await click(inWindow('b'));
    await click(inWindow('1500'));
    await apply();
    const written = await page.evaluate(() => Editor.getHTML());
    const one = (written.match(/<div class="pp-slide-props"[^>]*>/g) || []);
    check(tag + 'la transition posée est écrite dans le texte : un seul repère, ses trois valeurs, rien de visible', one.length === 1 && /data-trans="push" data-trans-from="b" data-trans-dur="1500"/.test(one[0]) && /display:\s*block;\s*height:\s*0(px)?\b/.test(one[0]) && /contenteditable="false"/.test(one[0]) && /aria-hidden="true"/.test(one[0]), one);
    check(tag + 'il ouvre sa diapositive : juste après le saut de page, avant le titre', /<div class="page-break-marker"[^>]*>[^<]*<\/div>\s*<div class="pp-slide-props"/.test(written) || /class="page-break-marker"[^>]*>[^<]*<\/[a-z]+><div class="pp-slide-props"/.test(written), written.slice(written.indexOf('page-break-marker') - 20, written.indexOf('page-break-marker') + 400));
    await save();
    await open(20, 4);
    await open(19, 4);
    const reopened = await listOf(page);
    check(tag + 'enregistrée puis rouverte, la transition est la même (poussée vers le haut, 1,5 s, diapositive 2) ; la pastille est là', brief(reopened) === '- push:b:1500 - -' && (await badges(page))[1].shown, brief(reopened));
    // La retirer : le texte redevient comme avant.
    await openWindow(1);
    await click(inWindow(''));
    await apply();
    const removed = await page.evaluate(() => Editor.getHTML());
    check(tag + 'retirée par « ' + T.effects[0] + ' », la transition ne laisse aucun repère dans le texte', !/pp-slide-props|data-trans/.test(removed) && brief(await listOf(page)) === '- - - -', removed.slice(0, 200));
    await save();
    await leave();
  }

  // --- 6. Importer une diapositive qui a une transition.
  if (wanted(6) && full) {
    console.log('\n' + tag + '6) Importer et dupliquer');
    await open(16, 2);
    await click('.pp-slide-item', 0);
    const initialList = brief(await listOf(page));
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
    let list = await listOf(page);
    let shape = await docShape(page);
    check(tag + 'importer la diapositive 1 de « Source » (qui a un recouvrement par le haut, 0,8 s) la pose après la diapositive du curseur avec sa transition : le repère arrive avec elle, en tête', brief(list) === '- cover:t:800 -' && shape === 'h|Mhp|hp', { list: brief(list), shape });
    check(tag + 'sa miniature porte la pastille', (await badges(page))[1].shown, (await badges(page)).map(x => x.shown));
    // Le clavier est resté sur la liste des sources : on referme le volet et on pose le curseur dans le texte, comme on le ferait.
    await click('.pp-slide-import-close');
    await sleep(400);
    await clickText('Cible un');
    await press('Control+z', 500);
    check(tag + 'UN Ctrl+Z défait l\'import et sa transition : le texte est celui d\'avant', brief(await listOf(page)) === initialList && (await docShape(page)) === initialShape, { list: brief(await listOf(page)), shape: await docShape(page), initialList, initialShape });
    // Dupliquer, déplacer, supprimer, ajouter : la transition suit sa diapositive.
    await open(15, 4);
    await click('.pp-slide-item', 1);
    await menuOf(1);
    await click('.pp-slide-menu.visible [data-action="duplicate"]');
    await sleep(400);
    list = await listOf(page);
    check(tag + 'dupliquer la diapositive 2 (poussée) donne une copie avec la même transition, chacune son repère', brief(list) === '- push:r:1000 push:r:1000 fade:r:500 -' && (await docShape(page)) === 'hp|Mhl|Mhl|MFp|p', { list: brief(list), shape: await docShape(page) });
    await press('Control+z', 400);
    await menuOf(1);
    await click('.pp-slide-menu.visible [data-action="moveDown"]');
    await sleep(400);
    list = await listOf(page);
    check(tag + 'descendre la diapositive 2 : le fondu de la 3 monte avec elle, la poussée descend avec la sienne', brief(list) === '- fade:r:500 push:r:1000 -' && (await docShape(page)) === 'hp|MFp|Mhl|p', { list: brief(list), shape: await docShape(page) });
    await press('Control+z', 400);
    await menuOf(2);
    await click('.pp-slide-menu.visible [data-action="moveUp"]');
    await sleep(400);
    check(tag + 'monter la diapositive 3 fait de même dans l\'autre sens', brief(await listOf(page)) === '- fade:r:500 push:r:1000 -', brief(await listOf(page)));
    await press('Control+z', 400);
    // Une diapositive qui a une transition passe devant ou derrière une qui n'en a pas : la transition la suit, la diapositive qui prend sa place n'en reçoit pas de copie (le rangement ne
    // prend pas un déplacement pour un contenu effacé).
    await menuOf(2);
    await click('.pp-slide-menu.visible [data-action="moveDown"]');
    await sleep(400);
    check(tag + 'descendre la diapositive 3 (fondu) sous la 4 (sans transition) : le fondu la suit, la diapositive qui prend sa place n\'en reçoit pas de copie', brief(await listOf(page)) === '- push:r:1000 - fade:r:500', brief(await listOf(page)));
    await press('Control+z', 400);
    await menuOf(1);
    await click('.pp-slide-menu.visible [data-action="moveUp"]');
    await sleep(400);
    check(tag + 'monter la diapositive 2 (poussée) au-dessus de la 1 (sans transition) : la poussée la suit, sans copie sur la diapositive qui prend sa place', brief(await listOf(page)) === 'push:r:1000 - fade:r:500 -', brief(await listOf(page)));
    await press('Control+z', 400);
    await menuOf(1);
    await click('.pp-slide-menu.visible [data-action="delete"]');
    await sleep(500);
    check(tag + 'supprimer la diapositive 2 emporte sa transition, sans toucher à celle des autres', brief(await listOf(page)) === '- fade:r:500 -' && (await markerCount(page)) === 1, { list: brief(await listOf(page)), count: await markerCount(page) });
    await press('Control+z', 400);
    await click('.pp-slide-item', 0);
    await click('.pp-slide-add');
    await click('.pp-slide-layouts.visible [data-action="blank"]');
    await sleep(500);
    list = await listOf(page);
    check(tag + 'ajouter une diapositive après la 1 : la nouvelle n\'a pas de transition, les autres gardent la leur', brief(list) === '- - push:r:1000 fade:r:500 -', brief(list));
    await press('Control+z', 400);
    // Un cadre libre posé sur une diapositive à transition : le repère reste en tête.
    await click('.pp-slide-item', 2);
    await chooseObject(page, 'textFrame');
    await sleep(500);
    shape = await docShape(page);
    check(tag + 'un cadre de texte posé sur la diapositive 3 (qui a un fondu et déjà un cadre) se range après le repère : il reste le premier bloc', /\|MFFp\|/.test(shape) || /\|MFp?F/.test(shape), shape);
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
    const off = await page.evaluate(() => { const r = document.querySelector('.pp-slide-menu.visible [data-action="transition"]'); return r ? { disabled: r.getAttribute('aria-disabled'), tip: r.title || '' } : null; });
    check(tag + 'la ligne « Transition… » est grisée avec sa raison', !!off && off.disabled === 'true' && off.tip.length > 5, off);
    await click('.pp-slide-menu.visible [data-action="transition"]');
    await sleep(500);
    check(tag + 'son clic n\'ouvre pas la fenêtre', (await windowState(page)) === null, '');
    const pills = await badges(page);
    check(tag + 'les pastilles restent (elles viennent du texte)', pills[1].shown && pills[2].shown, pills.map(x => x.shown));
    await press('Escape');
    await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
    await sleep(800);
    await leave();
  }

  // --- 8. Une présentation de soixante-dix diapositives reste légère.
  if (wanted(8) && full) {
    console.log('\n' + tag + '8) Soixante-dix diapositives');
    await open(11, 70);
    await click('.pp-slide-item', 0);
    await leave();
    await page.evaluate(() => {
      window.__clone = [];
      const original = Node.prototype.cloneNode;
      Node.prototype.cloneNode = function patched(deep) {
        const t0 = performance.now();
        const copy = original.call(this, deep);
        if (this.classList && this.classList.contains('pp-slide-show-layer')) window.__clone.push(performance.now() - t0);
        return copy;
      };
      window.__long = [];
      try { new PerformanceObserver((list) => { list.getEntries().forEach(e => window.__long.push(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* pas de longtask */ }
    });
    await click('.pp-slide-show-open');
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
    await sleep(1200);
    const total = await page.evaluate(() => (document.querySelector('.pp-slide-show-counter') || {}).textContent);
    await page.evaluate(() => { window.__long.length = 0; });
    const nodes0 = await page.evaluate(() => { const h = document.querySelector('.pp-slide-show-host'); return h && h.shadowRoot ? h.shadowRoot.querySelectorAll('*').length : 0; });
    const walked = [];
    for (let k = 0; k < 12; k++) {
      await press('ArrowRight', 30);
      walked.push(await page.evaluate(() => SlideShow.state().transition && SlideShow.state().transition.kind));
      await sleep(420);
    }
    const stats = await page.evaluate(() => ({ clones: window.__clone.slice(), long: window.__long.slice() }));
    const nodes1 = await page.evaluate(() => { const h = document.querySelector('.pp-slide-show-host'); return h && h.shadowRoot ? h.shadowRoot.querySelectorAll('*').length : 0; });
    const worst = Math.max(0, ...stats.clones);
    console.log(`  (soixante-dix diapositives : ${total}, copie de la page quittée : ${stats.clones.map(x => x.toFixed(1)).join(' / ')} ms, tâches longues : ${stats.long.map(x => Math.round(x)).join(' / ') || 'aucune'}, nœuds ${nodes0} -> ${nodes1})`);
    check(tag + 'chacun des douze pas joue un fondu', walked.length === 12 && walked.every(kind => kind === 'fade'), walked);
    check(tag + `la copie de la page quittée prend moins de 80 ms (au plus ${worst.toFixed(1)} ms sur ${stats.clones.length})`, stats.clones.length === 12 && worst < 80, stats.clones);
    check(tag + 'aucune tâche longue de plus de 200 ms pendant les douze transitions', Math.max(0, ...stats.long) < 200, stats.long);
    check(tag + 'rien ne s\'accumule : douze transitions plus tard, le diaporama compte autant de nœuds qu\'avant (aucune copie oubliée)', nodes1 === nodes0, [nodes0, nodes1]);
    await press('Escape', 400);
    await leave();
  }

  await page.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
await run('fr', 'light', true);
if (!ONLY.length || ONLY.includes('en')) await run('en', 'dark', false);
await t.finish();
