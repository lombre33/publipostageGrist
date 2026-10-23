#!/usr/bin/env node
// Les POINTES d'une ligne (js/free-frame.js : le menu « Extrémités » de la barre flottante, js/shape-geometry.js, css/free-frame.css, js/html-sanitize.js ; chantier 3 « Traits et transparence » du plan « Import
// PowerPoint sans perte », demande du 22/10, lot 3d : la forme et la taille de la pointe de chaque bout), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS
// (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active. Ce que dev-tests/scenarios-frame-ends.js ne peut pas voir depuis la page :
//  LE MENU : le bouton « Extrémités » de la barre d'une ligne ouvre un menu entier dans le panneau de 700x400, sans défilement : en haut quatre icônes (sans flèche, à la fin, au début, aux deux bouts : leur nom est
//   l'info-bulle et le nom accessible, dans la langue de la page), puis deux sections, « Début » et « Fin », chacune avec six formes de pointe (aucune, triangle plein, flèche ouverte, flèche à encoche, losange,
//   ovale : une icône nommée chacune) et neuf tailles (la largeur en rangées, la longueur en colonnes : un échantillon nommé chacune, dessiné avec la forme du bout) ; tout est lisible (>= 4,5:1), aucun bouton
//   n'en recouvre un autre ; ce qui est choisi est coché ; la taille d'un bout sans pointe est grisée (avec sa raison en info-bulle, jamais retirée) et un clic dessus ne change rien.
//  LES CHOIX : une forme ou une taille est UN pas d'historique (Ctrl+Z défait, Ctrl+Maj+Z et Ctrl+Y rétablissent, le menu suit), la ligne reste sélectionnée et le menu reste ouvert pour régler l'autre ; choisir ce
//   qui est déjà choisi ne fait pas de pas ; une icône du haut ferme le menu, garde la forme et la taille d'une pointe déjà posée, ne donne le triangle plein qu'au bout qui n'en avait pas, retire la taille avec la
//   pointe ; « sans flèche » sur un bout retire aussi sa taille (un seul Ctrl+Z les rend) ; au clavier, Entrée sur une forme la choisit.
//  LE DESSIN : sur les pixels de l'éditeur (page à 100 %), une ligne à pointe ovale, en losange, large et courte, et celle qui porte deux pointes grandes (losange au début, ovale à la fin) ont la hauteur que PowerPoint leur
//   donne, dans l'éditeur, dans la Lecture, et peintes par la même image dans la miniature et le diaporama.
// Lancé par run-headless.mjs (groupe Node "frameEndsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-ends.mjs
// FRAME_ENDS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.FRAME_ENDS_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-frame-ends', port: Number(process.env.FRAME_ENDS_PORT || 9156) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>`;
// Une ligne écrite comme l'enregistrement le fait : les mesures, la sorte, le trait, puis le sens et les pointes quand il y en a.
const LINE = (x, y, w, h, look) => {
  const a = Object.assign({ line: '#000000', lw: 6, flip: '', head: '', headW: '', headLen: '', tail: '', tailW: '', tailLen: '' }, look);
  const names = { line: 'line', lw: 'lw', flip: 'flip', head: 'head', headW: 'head-w', headLen: 'head-len', tail: 'tail', tailW: 'tail-w', tailLen: 'tail-len' };
  const extra = Object.keys(names).filter(key => a[key] !== '').map(key => ` data-ff-${names[key]}="${a[key]}"`).join('');
  return `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-shape="line"${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
};
// « Posées » : la première diapositive porte quatre lignes noires de 6 points, de 150 points de long, l'une sous l'autre : une pointe ovale moyenne à la fin, un losange moyen à la fin, un triangle large et court à
// la fin, un losange grand au début et un ovale grand à la fin. Aucun texte sur la diapositive : aucune lettre sous les traits.
const POSEES = LINE(60, 50, 150, 0, { tail: 'oval' })
  + LINE(60, 110, 150, 0, { tail: 'diamond' })
  + LINE(60, 170, 150, 0, { tail: 'triangle', tailW: 'lg', tailLen: 'sm' })
  + LINE(60, 240, 150, 0, { head: 'diamond', headW: 'lg', headLen: 'lg', tail: 'oval', tailW: 'lg', tailLen: 'lg' })
  + '<p></p>' + BR + '<h2>Deux</h2><p>Texte</p>';
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Formes', '${SLIDES}', false, 'presentation');
  add(8, 'Posées', ${JSON.stringify(POSEES)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TYPE_IDS = ['none', 'triangle', 'arrow', 'stealth', 'diamond', 'oval'];
const LEVELS = ['sm', 'med', 'lg'];
const TEXTS = {
  fr: {
    ends: 'Extrémités', presetsGroup: 'Bouts qui portent une flèche', presets: ['Sans flèche', 'Flèche à la fin', 'Flèche au début', 'Flèches aux deux bouts'], sides: { head: 'Début', tail: 'Fin' },
    typesGroup: 'Forme de la flèche', types: ['Sans flèche', 'Flèche pleine', 'Flèche ouverte', 'Flèche à encoche', 'Losange', 'Ovale'], sizesGroup: 'Taille de la flèche',
    size: (w, l) => `Largeur : ${{ sm: 'étroite', med: 'moyenne', lg: 'large' }[w]}, longueur : ${{ sm: 'courte', med: 'moyenne', lg: 'longue' }[l]}`, noEnd: 'Choisir d’abord une forme de flèche pour ce bout',
  },
  en: {
    ends: 'Line ends', presetsGroup: 'Ends that carry an arrow', presets: ['No arrow', 'Arrow at the end', 'Arrow at the start', 'Arrows at both ends'], sides: { head: 'Start', tail: 'End' },
    typesGroup: 'Arrow shape', types: ['No arrow', 'Filled arrow', 'Open arrow', 'Notched arrow', 'Diamond', 'Oval'], sizesGroup: 'Arrow size',
    size: (w, l) => `Width: ${{ sm: 'narrow', med: 'medium', lg: 'wide' }[w]}, length: ${{ sm: 'short', med: 'medium', lg: 'long' }[l]}`, noEnd: 'Choose an arrow shape for this end first',
  },
};
const PRESET_IDS = ['ends:none', 'ends:end', 'ends:start', 'ends:both'];
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Les outils d'une page ouverte : positions, premier plan, vrais clics (même outillage que dev-tests/verify-frame-dash.mjs).
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

// Les lignes du texte avec leurs pointes, la sélection.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const lines = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'freeLine') {
      const a = node.attrs;
      lines.push({ pos: offset, x: a.x, y: a.y, w: a.w, h: a.h, line: a.line, lw: a.lw, flip: a.flip, head: a.head, headW: a.headW, headLen: a.headLen, tail: a.tail, tailW: a.tailW, tailLen: a.tailLen });
    }
  });
  const sel = editor.state.selection;
  return { lines, selection: { selectedLine: !!(sel.node && sel.node.type.name === 'freeLine') } };
});
const htmlOf = page => page.evaluate(() => EditorCore.getEditor().getHTML());
const lastLine = async (page) => { const s = await docState(page); return s.lines[s.lines.length - 1]; };

// Le menu des extrémités ouvert : sa boîte, ses groupes, ses boutons.
const endsMenuState = page => page.evaluate(() => {
  const menu = document.querySelector('.v2-frame-ends-menu.visible');
  const chip = document.getElementById('v2-frame-ends-open');
  if (!menu) return null;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const button = (b) => ({
    action: b.dataset.action, name: b.getAttribute('aria-label'), title: b.title, bare: b.textContent.trim() === '', checked: b.getAttribute('aria-checked'), role: b.getAttribute('role'), active: b.classList.contains('is-active'),
    disabled: b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), svg: !!b.querySelector('svg'), paths: b.querySelectorAll('svg path').length, drawn: b.dataset.drawn || '', d: Array.from(b.querySelectorAll('svg path')).map(p => p.getAttribute('d')).join('|'), rect: rect(b),
  });
  const presets = menu.querySelector('.pp-ff-ends-presets');
  return {
    menu: rect(menu), role: menu.getAttribute('role'), label: menu.getAttribute('aria-label'), expanded: chip ? chip.getAttribute('aria-expanded') : null, scroll: [menu.scrollHeight, menu.clientHeight],
    presetsGroup: presets ? { label: presets.getAttribute('aria-label'), role: presets.getAttribute('role') } : null,
    presets: Array.from(menu.querySelectorAll('[data-action^="ends:"]')).map(button),
    sections: Array.from(menu.querySelectorAll('.pp-ff-end')).map((section) => {
      const types = section.querySelector('.pp-ff-end-types');
      const sizes = section.querySelector('.pp-ff-end-sizes');
      return {
        label: section.getAttribute('aria-label'), role: section.getAttribute('role'), title: section.querySelector('.pp-ff-end-title').textContent.trim(),
        typesGroup: { label: types.getAttribute('aria-label'), role: types.getAttribute('role'), columns: getComputedStyle(types).gridTemplateColumns.split(' ').length },
        sizesGroup: { label: sizes.getAttribute('aria-label'), role: sizes.getAttribute('role'), columns: getComputedStyle(sizes).gridTemplateColumns.split(' ').length },
        types: Array.from(types.querySelectorAll('[data-action]')).map(button), sizes: Array.from(sizes.querySelectorAll('[data-action]')).map(button),
      };
    }),
    every: Array.from(menu.querySelectorAll('button')).map((b) => { const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }),
  };
});
// La barre flottante : ses boutons visibles dans l'ordre, sa boîte.
const barState = page => page.evaluate(() => {
  const bar = document.querySelector('.v2-frame-toolbar');
  if (!bar || bar.getBoundingClientRect().width === 0) return null;
  const r = bar.getBoundingClientRect();
  const buttons = Array.from(bar.querySelectorAll('button')).filter(b => b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none');
  const ends = document.getElementById('v2-frame-ends-open');
  return {
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, ids: buttons.map(b => b.id || b.dataset.action),
    every: buttons.map((b) => { const q = b.getBoundingClientRect(); return { left: q.left, right: q.right, width: q.width }; }),
    ends: ends ? { name: ends.getAttribute('aria-label'), title: ends.title, popup: ends.getAttribute('aria-haspopup'), expanded: ends.getAttribute('aria-expanded'), svg: !!ends.querySelector('svg') } : null,
  };
});

// La capture de la boîte `index` d'un conteneur (éditeur ou Lecture), amenée à l'écran : le PNG (8 pixels de papier autour), la boîte dedans, les pixels par point et la place des deux bouts de la ligne.
async function shotOfLine(page, root, index) {
  const measured = await page.evaluate(([rootSel, i]) => {
    const box = document.querySelector(rootSel).querySelectorAll('.pp-free-frame-box')[i];
    box.scrollIntoView({ block: 'center', inline: 'center' });
    const frame = box.parentElement;
    const pt = name => parseFloat(frame.style.getPropertyValue(name));
    return { w: parseFloat(frame.getAttribute('data-ff-w')), bleed: pt('--ff-bleed'), sx: pt('--ff-sx'), sy: pt('--ff-sy'), ex: pt('--ff-ex'), ey: pt('--ff-ey') };
  }, [root, index]);
  await sleep(300);
  const rect = await page.evaluate(([rootSel, i]) => { const r = document.querySelector(rootSel).querySelectorAll('.pp-free-frame-box')[i].getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }, [root, index]);
  const margin = 8;
  const x0 = Math.max(0, rect.left - margin);
  const y0 = Math.max(0, rect.top - margin);
  const width = Math.min(WIDTH - x0, rect.width + rect.left - x0 + margin);
  const height = Math.min(HEIGHT - y0, rect.height + rect.top - y0 + margin);
  const png = await page.screenshot({ clip: { x: x0, y: y0, width, height }, type: 'png' });
  return { b64: png.toString('base64'), box: { left: rect.left - x0, top: rect.top - y0, width: rect.width, height: rect.height }, k: rect.width / (measured.w + 2 * measured.bleed), ends: measured, visible: rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= WIDTH && rect.top + rect.height <= HEIGHT };
}
// L'encre le long d'une colonne de la capture, à `dx` points du bout `at` ({ x, y } en points depuis le coin de la boîte) : la plus longue série d'encre qui coupe l'axe de la ligne, en points.
const inkAtColumn = (page, shot, at, dx) => page.evaluate(async ([b64, box, k, end, offset]) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const x = Math.floor(box.left + (end.x + offset) * k);
  const axis = Math.floor(box.top + end.y * k);
  const ink = (y) => { if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false; const d = ctx.getImageData(x, y, 1, 1).data; return d[0] + d[1] + d[2] < 330; };
  if (!ink(axis)) return 0;
  let top = axis;
  let bottom = axis;
  while (ink(top - 1)) top -= 1;
  while (ink(bottom + 1)) bottom += 1;
  return (bottom - top + 1) / k;
}, [shot.b64, shot.box, shot.k, at, dx]);

// Une page neuve (un document modifié et pas enregistré ferait demander « Modifications non enregistrées » à l'ouverture d'un autre modèle) et ses outils.
async function setup(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, hover, click, leave } = toolsOf(page);
  const press = async (key) => { await page.keyboard.press(key); await sleep(260); };
  const open = async (id, slides) => {
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  const menuOpen = () => page.evaluate(() => !!document.querySelector('.v2-frame-ends-menu.visible'));
  // Comme les autres menus de la barre : le bouton bascule, un clic ailleurs referme.
  const closeMenu = async () => { if (await menuOpen()) await click('#v2-frame-ends-open'); };
  const openMenu = async () => { if (!(await menuOpen())) await click('#v2-frame-ends-open'); };
  // L'historique (prosemirror-history) réunit en un seul pas deux changements voisins faits à moins de 500 ms d'écart : `gap` les sépare, un choix = un pas.
  const gap = () => sleep(650);
  const choose = async (action) => { await gap(); await openMenu(); await click(`.v2-frame-ends-menu.visible [data-action="${action}"]`); };
  return { T, tag, page, rectOf, hover, click, leave, press, gap, open, menuOpen, closeMenu, openMenu, choose };
}

// Le bouton, son menu, les choix et l'historique.
async function menuPart(lang, colorScheme) {
  const { T, tag, page, click, leave, press, open, menuOpen, closeMenu, openMenu, choose } = await setup(lang, colorScheme);
  const typeAction = (side, type) => `end:${side}:type:${type}`;
  const sizeAction = (side, w, l) => `end:${side}:size:${w}:${l}`;

  // --- 1. Le bouton de la barre et son menu.
  console.log('\n' + tag + '1) Le bouton « ' + T.ends + ' » et son menu');
  await open(7, 3);
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'line:arrow');
  const base = await htmlOf(page);
  const bar = await barState(page);
  check(tag + `la barre de la ligne a le bouton « ${T.ends} » (nom accessible et info-bulle), il annonce son menu, son icône est là, la barre est entière dans le panneau de 700x400`,
    !!bar && !!bar.ends && bar.ends.name === T.ends && bar.ends.title === T.ends && bar.ends.popup === 'true' && bar.ends.expanded === 'false' && bar.ends.svg && inPanel(bar.rect) && bar.every.every(b => b.left >= bar.rect.left - 0.5 && b.right <= bar.rect.right + 0.5 && b.width > 0), bar);
  await click('#v2-frame-ends-open');
  let menu = await endsMenuState(page);
  check(tag + `le menu est ouvert, annonce son rôle (« menu ») et son nom (« ${T.ends} »), la pastille dit qu'il est ouvert`, !!menu && menu.role === 'menu' && menu.label === T.ends && menu.expanded === 'true', menu && { role: menu.role, label: menu.label, expanded: menu.expanded });
  check(tag + `en haut, quatre icônes dans un groupe nommé « ${T.presetsGroup} » (« ${T.presets.join(' », « ')} ») : le nom est l'info-bulle et le nom accessible, aucun texte, « ${T.presets[1]} » cochée (la ligne posée a sa pointe à la fin)`,
    !!menu && !!menu.presetsGroup && menu.presetsGroup.label === T.presetsGroup && menu.presetsGroup.role === 'group' && JSON.stringify(menu.presets.map(p => p.action)) === JSON.stringify(PRESET_IDS) && JSON.stringify(menu.presets.map(p => p.name)) === JSON.stringify(T.presets)
    && menu.presets.every(p => p.title === p.name && p.bare && p.svg && p.role === 'menuitemradio') && menu.presets.map(p => p.checked).join() === 'false,true,false,false' && menu.presets[1].active, menu && menu.presets.map(p => [p.action, p.name, p.checked]));
  check(tag + `deux sections, « ${T.sides.head} » puis « ${T.sides.tail} », chacune un groupe nommé comme son titre`,
    !!menu && menu.sections.length === 2 && menu.sections.map(s => s.title).join() === [T.sides.head, T.sides.tail].join() && menu.sections.every(s => s.label === s.title && s.role === 'group'), menu && menu.sections.map(s => [s.label, s.title]));
  check(tag + `chaque section a six formes en grille de trois colonnes (« ${T.types.join(' », « ')} »), une icône nommée dans la langue de la page chacune, et neuf tailles en grille de trois colonnes (largeur en rangées, longueur en colonnes), groupes nommés « ${T.typesGroup} » et « ${T.sizesGroup} »`,
    !!menu && menu.sections.every(s => s.typesGroup.label === T.typesGroup && s.typesGroup.role === 'group' && s.typesGroup.columns === 3 && s.sizesGroup.label === T.sizesGroup && s.sizesGroup.role === 'group' && s.sizesGroup.columns === 3
      && s.types.length === 6 && JSON.stringify(s.types.map(b => b.name)) === JSON.stringify(T.types) && s.types.every(b => b.title === b.name && b.svg && b.bare && b.role === 'menuitemradio')
      && JSON.stringify(s.types.map(b => b.action)) === JSON.stringify(TYPE_IDS.map(type => typeAction(s.label === T.sides.head ? 'head' : 'tail', type)))
      && s.sizes.length === 9 && s.sizes.every(b => b.role === 'menuitemradio' && b.bare)
      && JSON.stringify(s.sizes.map(b => b.action)) === JSON.stringify(LEVELS.flatMap(w => LEVELS.map(l => sizeAction(s.label === T.sides.head ? 'head' : 'tail', w, l))))
      && JSON.stringify(s.sizes.map(b => b.name)) === JSON.stringify(LEVELS.flatMap(w => LEVELS.map(l => T.size(w, l))))), menu && menu.sections.map(s => [s.types.map(b => b.name), s.sizes.length]));
  check(tag + 'le menu est entier dans le panneau de 700x400, sans défilement, chaque bouton dedans, d\'au moins 20 x 18 pixels, sans en recouvrir un autre',
    !!menu && inPanel(menu.menu) && menu.scroll[0] <= menu.scroll[1] + 1 && menu.every.every(r => r.left >= menu.menu.left - 0.5 && r.right <= menu.menu.right + 0.5 && r.top >= menu.menu.top - 0.5 && r.bottom <= menu.menu.bottom + 0.5 && r.width >= 20 && r.height >= 18)
    && menu.every.every((a, i) => menu.every.every((b, j) => i >= j || a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5)), menu && { box: menu.menu, scroll: menu.scroll });
  const head = menu ? menu.sections[0] : null;
  const tail = menu ? menu.sections[1] : null;
  check(tag + `la forme cochée est « ${T.types[0]} » au début et « ${T.types[1]} » à la fin ; la taille moyenne est cochée à la fin`,
    !!head && !!tail && head.types.map(b => b.checked).join() === 'true,false,false,false,false,false' && tail.types.map(b => b.checked).join() === 'false,true,false,false,false,false'
    && tail.sizes.filter(b => b.checked === 'true').map(b => b.action).join() === sizeAction('tail', 'med', 'med') && head.sizes.every(b => b.checked === 'false'), menu && [head.types.map(b => b.checked), tail.sizes.filter(b => b.checked === 'true').map(b => b.action)]);
  check(tag + `les neuf tailles du début sont grisées (le bout n'a pas de pointe), jamais retirées, avec leur raison en info-bulle (« ${T.noEnd} ») ; celles de la fin sont à choisir`,
    !!head && !!tail && head.sizes.every(b => b.disabled && b.ariaDisabled === 'true' && b.title === T.noEnd) && tail.sizes.every(b => !b.disabled && b.ariaDisabled === 'false' && b.title === b.name), menu && [head.sizes[0].title, tail.sizes[0].title]);
  const pathsOf = list => list.map(b => b.paths).join();
  check(tag + 'les échantillons dessinent leur pointe (« sans flèche » : le trait seul ; les cinq autres : le trait et la pointe, tous différents), et les neuf tailles sont toutes différentes',
    !!tail && pathsOf(tail.types) === '1,2,2,2,2,2' && new Set(tail.types.map(b => b.d)).size === 6 && new Set(tail.sizes.map(b => b.d)).size === 9 && tail.sizes.every(b => b.drawn === 'triangle') && head.sizes.every(b => b.drawn === 'triangle'), tail && tail.types.map(b => b.d.slice(0, 50)));
  const contrasts = [];
  for (const id of [typeAction('head', 'none'), typeAction('tail', 'oval'), sizeAction('tail', 'sm', 'lg'), 'ends:none', 'ends:both']) contrasts.push(await contrastOf(page, `.v2-frame-ends-menu.visible [data-action="${id}"]`));
  contrasts.push(await contrastOf(page, '#v2-frame-ends-open'));
  check(tag + 'les icônes du menu et le bouton de la barre sont lisibles (>= 4,5:1)', contrasts.every(c => c >= 4.5), contrasts);
  await snap(page, `${lang}-menu-extremites`);
  await click('#v2-frame-ends-open');
  menu = await endsMenuState(page);
  const afterToggle = await barState(page);
  check(tag + 'un second clic sur le bouton referme le menu (la pastille le dit) et la ligne reste sélectionnée', menu === null && !!afterToggle && afterToggle.ends.expanded === 'false' && (await docState(page)).selection.selectedLine, afterToggle && afterToggle.ends);

  // --- 2. Un choix est un pas d'historique, le menu reste ouvert.
  console.log('\n' + tag + '2) Un choix, un pas d\'historique');
  const before = await lastLine(page);
  check(tag + 'la ligne posée a une pointe pleine moyenne à la fin et rien au début', before.tail === 'triangle' && before.head === '' && before.tailW === '' && before.tailLen === '' && before.line === '#2f5597' && before.lw === 3, before);
  await choose(typeAction('tail', 'oval'));
  let line = await lastLine(page);
  menu = await endsMenuState(page);
  check(tag + `« ${T.types[5]} » à la fin pose la pointe ovale sans toucher au reste (couleur, épaisseur, place), le menu reste ouvert, la ligne reste sélectionnée, la forme est cochée`,
    line.tail === 'oval' && line.tailW === '' && line.tailLen === '' && line.head === '' && line.line === before.line && line.lw === before.lw && line.x === before.x && line.y === before.y && line.w === before.w && (await menuOpen()) && (await docState(page)).selection.selectedLine
    && !!menu && menu.sections[1].types.map(b => b.checked).join() === 'false,false,false,false,false,true' && menu.presets.map(p => p.checked).join() === 'false,true,false,false', line);
  check(tag + 'les tailles de la fin se redessinent avec l\'ovale (leur échantillon est celui du bout)', !!menu && menu.sections[1].sizes.every(b => b.drawn === 'oval' && b.paths === 2 && b.d.split('L').length > 39), menu && menu.sections[1].sizes.map(b => b.drawn));
  await press('Control+z');
  line = await lastLine(page);
  menu = await endsMenuState(page);
  check(tag + 'un seul Ctrl+Z défait ce choix : la ligne est comme avant, au caractère près, et le menu, resté ouvert, coche de nouveau le triangle plein', (await htmlOf(page)) === base && line.tail === 'triangle' && !!menu && menu.sections[1].types.map(b => b.checked).join() === 'false,true,false,false,false,false', line);
  await press('Control+Shift+z');
  line = await lastLine(page);
  menu = await endsMenuState(page);
  check(tag + 'Ctrl+Maj+Z le rétablit (l\'ovale revient), le menu le coche', line.tail === 'oval' && !!menu && menu.sections[1].types[5].checked === 'true', line);
  await press('Control+z');
  await press('Control+y');
  line = await lastLine(page);
  check(tag + 'et Ctrl+Y de même, la ligne restant sélectionnée', line.tail === 'oval' && (await docState(page)).selection.selectedLine, line);
  const afterOval = await htmlOf(page);
  await choose(sizeAction('tail', 'lg', 'sm'));
  line = await lastLine(page);
  menu = await endsMenuState(page);
  check(tag + `« ${T.size('lg', 'sm')} » à la fin : la largeur et la longueur de l'ovale, le menu reste ouvert, la taille choisie est la seule cochée`,
    line.tail === 'oval' && line.tailW === 'lg' && line.tailLen === 'sm' && (await menuOpen()) && !!menu && menu.sections[1].sizes.filter(b => b.checked === 'true').map(b => b.action).join() === sizeAction('tail', 'lg', 'sm'), line);
  await press('Control+z');
  line = await lastLine(page);
  check(tag + 'un Ctrl+Z défait la taille seule, la forme reste', line.tail === 'oval' && line.tailW === '' && line.tailLen === '' && (await htmlOf(page)) === afterOval, line);
  await press('Control+Shift+z');
  await choose(sizeAction('tail', 'sm', 'lg'));
  line = await lastLine(page);
  check(tag + `« ${T.size('sm', 'lg')} » remplace la taille précédente`, line.tailW === 'sm' && line.tailLen === 'lg', line);
  await choose(typeAction('tail', 'diamond'));
  line = await lastLine(page);
  check(tag + 'changer de forme garde la taille (comme dans PowerPoint) : le losange est étroit et long', line.tail === 'diamond' && line.tailW === 'sm' && line.tailLen === 'lg', line);
  await press('Control+z');
  await press('Control+z');
  await press('Control+z');
  line = await lastLine(page);
  check(tag + 'trois Ctrl+Z (la forme, la taille, la taille) rendent la ligne d\'avant eux, l\'ovale seul, au caractère près', (await htmlOf(page)) === afterOval, line);
  await press('Control+z');
  check(tag + 'un de plus rend la ligne posée, au caractère près', (await htmlOf(page)) === base, await lastLine(page));
  // Le début.
  await choose(typeAction('head', 'diamond'));
  line = await lastLine(page);
  menu = await endsMenuState(page);
  check(tag + `« ${T.types[4]} » au début pose un losange, les tailles du début ne sont plus grisées, « ${T.presets[3]} » est cochée`,
    line.head === 'diamond' && line.tail === 'triangle' && !!menu && menu.sections[0].sizes.every(b => !b.disabled && b.ariaDisabled === 'false' && b.title === b.name && b.drawn === 'diamond') && menu.presets.map(p => p.checked).join() === 'false,false,false,true', line);
  await choose(sizeAction('head', 'sm', 'lg'));
  line = await lastLine(page);
  check(tag + `« ${T.size('sm', 'lg')} » au début : la taille du losange du début, celle de la fin n'y touche pas`, line.head === 'diamond' && line.headW === 'sm' && line.headLen === 'lg' && line.tail === 'triangle' && line.tailW === '' && line.tailLen === '', line);
  const withSize = await htmlOf(page);
  await choose(typeAction('head', 'diamond'));
  check(tag + 'choisir la forme déjà choisie ne change rien', (await htmlOf(page)) === withSize, await lastLine(page));
  await choose(sizeAction('head', 'sm', 'lg'));
  check(tag + 'ni la taille déjà choisie', (await htmlOf(page)) === withSize, await lastLine(page));
  await press('Control+z');
  line = await lastLine(page);
  check(tag + 'et aucun pas d\'historique n\'a été ajouté : un Ctrl+Z défait la taille du début, pas autre chose', line.head === 'diamond' && line.headW === '' && line.headLen === '' && line.tail === 'triangle', line);
  await press('Control+Shift+z');
  // Les quatre icônes du haut.
  await choose('ends:end');
  line = await lastLine(page);
  check(tag + `« ${T.presets[1]} » retire la pointe du début ET sa taille, garde celle de la fin, et ferme le menu`, line.head === '' && line.headW === '' && line.headLen === '' && line.tail === 'triangle' && !(await menuOpen()) && (await docState(page)).selection.selectedLine, line);
  await press('Control+z');
  line = await lastLine(page);
  check(tag + 'un seul Ctrl+Z rend le losange du début avec sa taille', line.head === 'diamond' && line.headW === 'sm' && line.headLen === 'lg' && line.tail === 'triangle', line);
  await choose(typeAction('tail', 'oval'));
  await choose(sizeAction('tail', 'lg', 'sm'));
  await choose('ends:none');
  line = await lastLine(page);
  check(tag + `« ${T.presets[0]} » retire les deux pointes et leurs tailles, ferme le menu`, line.head === '' && line.tail === '' && line.headW === '' && line.headLen === '' && line.tailW === '' && line.tailLen === '' && !(await menuOpen()), line);
  await press('Control+z');
  line = await lastLine(page);
  check(tag + 'un seul Ctrl+Z rend les deux pointes avec leurs tailles', line.head === 'diamond' && line.headW === 'sm' && line.headLen === 'lg' && line.tail === 'oval' && line.tailW === 'lg' && line.tailLen === 'sm', line);
  await choose('ends:end');
  line = await lastLine(page);
  check(tag + `« ${T.presets[1]} » garde la forme et la taille de la pointe de la fin (l'ovale large et court)`, line.head === '' && line.tail === 'oval' && line.tailW === 'lg' && line.tailLen === 'sm', line);
  await choose('ends:start');
  line = await lastLine(page);
  check(tag + `« ${T.presets[2]} » donne le triangle plein au début, qui n'avait rien, et retire la fin avec sa taille`, line.head === 'triangle' && line.headW === '' && line.tail === '' && line.tailW === '' && line.tailLen === '', line);
  await choose('ends:both');
  line = await lastLine(page);
  check(tag + `« ${T.presets[3]} » garde le triangle du début et donne le triangle plein à la fin`, line.head === 'triangle' && line.tail === 'triangle', line);
  await press('Control+z');
  await press('Control+z');
  await press('Control+z');
  line = await lastLine(page);
  check(tag + 'trois Ctrl+Z défont ces trois choix (les deux pointes reviennent avec leurs tailles, comme avant le premier)', line.head === 'diamond' && line.headW === 'sm' && line.headLen === 'lg' && line.tail === 'oval' && line.tailW === 'lg' && line.tailLen === 'sm', line);
  // « Sans flèche » sur un bout.
  await choose(typeAction('tail', 'none'));
  line = await lastLine(page);
  menu = await endsMenuState(page);
  check(tag + `« ${T.types[0]} » sur la fin retire la pointe ET sa taille, le menu reste ouvert, les tailles de la fin sont grisées`, line.tail === '' && line.tailW === '' && line.tailLen === '' && (await menuOpen()) && !!menu && menu.sections[1].sizes.every(b => b.disabled) && menu.sections[1].types[0].checked === 'true', line);
  await press('Control+z');
  line = await lastLine(page);
  check(tag + 'un seul Ctrl+Z les rend ensemble', line.tail === 'oval' && line.tailW === 'lg' && line.tailLen === 'sm', line);
  await choose(typeAction('tail', 'none'));
  const noEnds = await htmlOf(page);
  await click(`.v2-frame-ends-menu.visible [data-action="${sizeAction('tail', 'lg', 'lg')}"]`);
  check(tag + 'la taille d\'un bout sans pointe est grisée : le clic ne change rien', (await htmlOf(page)) === noEnds, await lastLine(page));
  // Au clavier : Tab jusqu'à une forme, Entrée la choisit.
  await page.focus(`.v2-frame-ends-menu.visible [data-action="${typeAction('tail', 'stealth')}"]`);
  await press('Enter');
  line = await lastLine(page);
  check(tag + `au clavier, Entrée sur « ${T.types[3]} » à la fin la choisit (un pas d'historique)`, line.tail === 'stealth' && line.tailW === '' && (await menuOpen()), line);
  await page.focus(`.v2-frame-ends-menu.visible [data-action="${sizeAction('tail', 'med', 'lg')}"]`);
  await press('Space');
  line = await lastLine(page);
  check(tag + `et Espace sur « ${T.size('med', 'lg')} » en pose la taille`, line.tail === 'stealth' && line.tailW === '' && line.tailLen === 'lg', line);
  await snap(page, `${lang}-menu-apres-choix`);
  // La barre reste là, entière dans le panneau, avec la ligne sélectionnée.
  const barAfter = await barState(page);
  check(tag + 'la barre de la ligne est toujours là, entière dans le panneau, la ligne sélectionnée', !!barAfter && inPanel(barAfter.rect) && (await docState(page)).selection.selectedLine, barAfter && barAfter.rect);
  await closeMenu();
  let presses = 0;
  while (presses < 24 && (await htmlOf(page)) !== base) { await press('Control+z'); presses += 1; }
  check(tag + 'quelques Ctrl+Z rendent la ligne posée, au caractère près', (await htmlOf(page)) === base, { presses });
  await leave();
}

// Les pixels de l'éditeur, de la Lecture, de la miniature et du diaporama.
async function pixelPart(lang, colorScheme) {
  const { tag, page, click, leave, press, open } = await setup(lang, colorScheme);
  console.log('\n' + tag + '3) Les pixels : ovale, losange, triangle large et court, deux grandes pointes');
  await open(8, 2);
  await click('.pp-slide-item', 0);
  await leave();
  // La page agrandie à 100 % : un point de la page fait un pixel et un tiers.
  for (let i = 0; i < 9; i++) {
    const zoom = await page.evaluate(() => EditorCore.layoutZoom(document.querySelector('#editor-container .tiptap')));
    if (zoom >= 0.99) break;
    await press('Control+=');
    await sleep(200);
  }
  // Pour chaque ligne : l'encre d'une colonne à quelques distances du bout (en points), à comparer à ce que PowerPoint donne. Trait de 6 points : la pointe moyenne fait 18 sur 18, la grande 30 sur 30.
  const half = (from, d) => 2 * Math.sqrt(Math.max(0, from * from - d * d));
  const EXPECT = [
    { name: 'ovale moyen (fin)', index: 0, end: 'end', columns: [[0, 18], [-4, half(9, 4)], [-7, half(9, 7)], [-60, 6]] },
    { name: 'losange moyen (fin)', index: 1, end: 'end', columns: [[0, 18], [-4, 10], [-7, 4], [-60, 6]] },
    { name: 'triangle large et court (fin)', index: 2, end: 'end', columns: [[-3, 7.5], [-9, 22.5], [-14, 6], [-60, 6]] },
    { name: 'losange grand (début)', index: 3, end: 'start', columns: [[0, 30], [4, 22], [10, 10]] },
    { name: 'ovale grand (fin)', index: 3, end: 'end', columns: [[0, 30], [-5, half(15, 5)], [-10, half(15, 10)]] },
  ];
  const measure = async (root) => {
    const out = [];
    const shots = {};
    for (const spec of EXPECT) {
      if (!shots[spec.index]) shots[spec.index] = await shotOfLine(page, root, spec.index);
      const shot = shots[spec.index];
      const at = spec.end === 'end' ? { x: shot.ends.ex, y: shot.ends.ey } : { x: shot.ends.sx, y: shot.ends.sy };
      const got = [];
      for (const [dx, want] of spec.columns) got.push({ dx, want: Math.round(want * 10) / 10, got: Math.round((await inkAtColumn(page, shot, at, dx)) * 10) / 10 });
      out.push({ name: spec.name, visible: shot.visible, k: Math.round(shot.k * 1000) / 1000, got });
    }
    return out;
  };
  const right = measured => measured.every(item => item.visible && near(item.k, 4 / 3, 0.02) && item.got.every(column => near(column.got, column.want, 1.7)));
  const editorLook = await measure('#editor-container');
  check(tag + 'éditeur à 100 % : l\'ovale (18 sur 18 centré sur le bout), le losange (18 sur 18, ses coins), le triangle large et court (30 sur 12), le losange et l\'ovale grands (30 sur 30) ont la hauteur que PowerPoint leur donne à chaque distance du bout, le corps reste de 6 points', right(editorLook), editorLook);
  await snap(page, `${lang}-editeur-pointes`);
  // La Lecture : mêmes pixels.
  await click('.pp-slide-item', 0).catch(() => {});
  await leave();
  await click('#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content .pp-free-frame-box'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const readerLook = await measure('#reader-container');
  check(tag + 'la Lecture dessine les mêmes pointes, aux mêmes hauteurs', right(readerLook), readerLook);
  await snap(page, `${lang}-lecture-pointes`);
  await click('#btn-mode-edit');
  await sleep(900);
  // La miniature de la bande et le diaporama : la même image.
  const drawn = await page.evaluate(() => {
    const read = box => ({ art: getComputedStyle(box, '::after').backgroundImage, clip: getComputedStyle(box, '::before').clipPath });
    return { editor: Array.from(document.querySelectorAll('#editor-container .pp-free-frame-box')).map(read), thumbs: Array.from(document.querySelectorAll('.pp-slide-thumb .pp-free-frame-box')).map(read) };
  });
  const isArt = value => /^url\("data:image\/svg\+xml,/.test(value || '');
  const sameDrawing = (list, i) => !!list[i] && !!drawn.editor[i] && list[i].art === drawn.editor[i].art && list[i].clip === drawn.editor[i].clip;
  check(tag + 'l\'éditeur peint une image pour l\'ovale, le losange et la ligne à deux grandes pointes, un polygone pour le triangle', drawn.editor.length >= 4 && isArt(drawn.editor[0].art) && isArt(drawn.editor[1].art) && !isArt(drawn.editor[2].art) && drawn.editor[2].clip !== 'none' && isArt(drawn.editor[3].art), drawn.editor.map(d => [d.art.slice(0, 30), d.clip.slice(0, 30)]));
  check(tag + 'la miniature de la bande peint les mêmes images et le même polygone que l\'éditeur, pour les quatre lignes', drawn.thumbs.length >= 4 && [0, 1, 2, 3].every(i => sameDrawing(drawn.thumbs, i)), { thumbs: drawn.thumbs.length });
  await click('.pp-slide-item', 0);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  const show = await page.evaluate(() => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const shadow = host && host.shadowRoot;
    const boxes = shadow ? Array.from(shadow.querySelectorAll('.pp-free-frame-box')) : [];
    return boxes.map(box => ({ art: getComputedStyle(box, '::after').backgroundImage, clip: getComputedStyle(box, '::before').clipPath }));
  });
  check(tag + 'le diaporama peint les mêmes images et le même polygone, pour les quatre lignes', show.length >= 4 && [0, 1, 2, 3].every(i => sameDrawing(show, i)), show.map(d => [d.art.slice(0, 30), d.clip.slice(0, 30)]));
  await press('Escape');
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  await press('Control+0');
  await leave();
}

await menuPart('fr', 'light');
await pixelPart('fr', 'light');
await menuPart('en', 'dark');
await t.finish();
