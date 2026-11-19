#!/usr/bin/env node
// Retours d'interface du 19/11 (consigne 089 de GFS), à la VRAIE souris (page.mouse, Node/Playwright), à la taille du panneau Grist d'Antoine (700x400), en clair et en sombre :
//  1. « Fond de cellule » (barre du tableau) : le bouton porte le pot de peinture (`Icons.fill`), pas la goutte que « Personnalisé… » garde sous le nom `colorCustom` ; il n'est pas écrasé à 28 px par la règle des
//     boutons de barre ; sa pastille (15 x 5 px) est TOUJOURS visible - un contour de la couleur du texte, à 4,5:1 au moins sur le fond de la barre, que le fond de cellule soit absent (la pastille est alors
//     barrée), pâle ou blanc - ; un vrai clic sur une couleur la remplit, « Aucune » la vide ;
//  2. le fond et le trait d'un objet (barre du cadre libre, extension diapositives) : même bouton, même pastille ;
//  3. les trois icônes de case à cocher (barre des listes ET barre « Oui / Non » d'une bulle) montrent leur RENDU COCHÉ à 16 px et à 20 px : accent = case pleine, coche en réserve ; classique = case à contour,
//     intérieur vide, coche franche ; texte grisé et barré pour « accent, texte barré » seulement ; une seule couleur (`currentColor`), des tracés évidés plutôt qu'une seconde couleur écrite en dur ;
//  4. la coche de la case classique est CENTRÉE dans sa case (liste à cases : éditeur et Lecture ; case d'une variable Oui / Non, accent et classique, à 14 et à 28 px) : la boîte de la coche est posée au
//     milieu de la case en pourcentages (la mise en page du navigateur arrondit aux pixels entiers, 1 px de bordure ou 1,5 px : un `left: 3px` fixe la laissait 0,5 px à gauche et 1 px en haut), mesurée aux
//     pixels d'une vraie capture ; l'export HTML écrit la même règle ; le PDF peint la coche classique au milieu de sa case (pdf.js, aux pixels), sans toucher à celle de l'accent.
// Lancé par run-headless.mjs (groupe Node "fillChecklistTickMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-fill-checklist-tick-mouse.mjs
import { start, seedModels, chooseObject, WIDTH } from './gfs-page.mjs';

const t = await start({ name: 'verify-fill-checklist-tick-mouse', port: Number(process.env.FILL_CHECKLIST_TICK_PORT || 9733) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Ce que la page sait mesurer : couleurs composées, contraste WCAG, le pot de peinture et sa pastille. Posé dans chaque page ouverte (window.__t).
function installProbes() {
  const parse = value => { const m = String(value).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const backdrop = el => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (const c of layers.reverse()) base = mix(c, base); return base; };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100; };
  const rect = e => { const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  const inner = name => { const host = document.createElement('div'); host.innerHTML = Icons.svg(name); return host.firstElementChild.innerHTML; };
  window.__t = {
    inner,
    chip(chipId, barId) {
      const chip = document.getElementById(chipId), bar = document.getElementById(barId);
      if (!chip || !bar) return null;
      const toolbar = chip.closest('.v2-floating-toolbar');
      const cs = getComputedStyle(bar), svgs = chip.querySelectorAll('svg');
      const outline = parse(cs.borderTopColor), around = backdrop(toolbar);
      return {
        chip: rect(chip), bar: rect(bar), toolbar: rect(toolbar), iconInner: svgs[0].innerHTML, svgCount: svgs.length,
        borderWidth: parseFloat(cs.borderTopWidth), outline: cs.borderTopColor, around: `rgb(${Math.round(around.r)}, ${Math.round(around.g)}, ${Math.round(around.b)})`,
        outlineContrast: outline && outline.a > 0 ? ratio(mix(outline, around), around) : 0,
        isNone: bar.classList.contains('is-none'), slash: getComputedStyle(bar, '::after').content, inline: bar.style.background, fill: cs.backgroundColor,
        chipColor: getComputedStyle(chip).color,
      };
    },
  };
}

// Un vrai geste : la souris arrive à quelques pixels du centre, le rejoint en trois pas (survol compris), puis clique.
async function realClick(page, selector) {
  const box = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, selector);
  if (!box) return null;
  await page.mouse.move(box.x - 12, box.y);
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
  await sleep(250);
  return box;
}

const TABLE = '<p>Avant</p><table><tbody><tr><td><p>R1C1 texte</p></td><td><p>R1C2 texte</p></td></tr><tr><td><p>R2C1 texte</p></td><td><p>R2C2 texte</p></td></tr></tbody></table><p>Après</p>';
async function selectInTable(app, text) {
  await app.evaluate(wanted => {
    const ed = EditorCore.getEditor();
    ed.view.focus();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === wanted) pos = p + 2; });
    ed.view.dispatch(ed.state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed.state.doc, pos)));
  }, text);
  await sleep(400);
}

// Les vérifications d'une pastille de fond, dans l'état où elle est : taille, contour, contraste du contour sur la barre, barre oblique quand il n'y a pas de fond.
function checkChip(label, m, { filled }) {
  check(`${label} : le bouton n'est pas écrasé à 28 px (icône, pastille et flèche tiennent côte à côte)`, !!m && m.chip.w >= 36 && m.chip.h >= 24 && m.svgCount === 2 && m.bar.x >= m.chip.x - 0.5 && m.bar.x + m.bar.w <= m.chip.x + m.chip.w + 0.5, m && { chip: m.chip, bar: m.bar });
  check(`${label} : la pastille fait 15 x 5 px, dans la barre`, !!m && Math.abs(m.bar.w - 15) <= 0.6 && Math.abs(m.bar.h - 5) <= 0.6 && m.bar.y >= m.toolbar.y && m.bar.y + m.bar.h <= m.toolbar.y + m.toolbar.h, m && { bar: m.bar, toolbar: m.toolbar });
  check(`${label} : le contour de la pastille est de la couleur du texte du bouton et d'au moins 1 px`, !!m && m.borderWidth >= 1 && m.outline === m.chipColor, m && { borderWidth: m.borderWidth, outline: m.outline, chipColor: m.chipColor });
  check(`${label} : le contour se lit sur la barre (${m && m.outlineContrast}:1, 4,5:1 au moins)`, !!m && m.outlineContrast >= 4.5, m && { outlineContrast: m.outlineContrast, outline: m.outline, around: m.around });
  if (filled) check(`${label} : avec un fond, la pastille prend sa couleur et n'est plus barrée`, !!m && !m.isNone && m.slash === 'none' && m.inline !== '' && m.inline !== 'transparent', m && { isNone: m.isNone, slash: m.slash, inline: m.inline });
  else check(`${label} : sans fond, la pastille est vide et barrée d'un trait`, !!m && m.isNone && m.slash !== 'none' && m.slash !== 'normal', m && { isNone: m.isNone, slash: m.slash, fill: m.fill });
}

// ───────────── 1. Fond de cellule, barre du tableau ─────────────
for (const scheme of ['light', 'dark']) {
  const { page: app } = await t.openPage({ hosted: false, colorScheme: scheme });
  await app.evaluate(installProbes);
  await app.evaluate(h => { Editor.setHTML(h); }, TABLE);
  await sleep(300);
  await selectInTable(app, 'R1C1 texte');
  await app.waitForFunction(() => { const b = document.getElementById('v2-table-fill-btn'); return !!b && b.getBoundingClientRect().height > 0; }, null, { timeout: 8000 });
  const label = `${scheme === 'dark' ? 'sombre' : 'clair'} · fond de cellule`;
  const none = await app.evaluate(() => window.__t.chip('v2-table-fill-btn', 'v2-table-fill-bar'));
  const names = await app.evaluate(() => ({ fill: window.__t.inner('fill'), drop: window.__t.inner('colorCustom') }));
  check(`${label} : le bouton porte le pot de peinture, pas la goutte`, !!none && none.iconInner === names.fill && names.fill !== names.drop, { same: none && none.iconInner === names.fill, distinct: names.fill !== names.drop });
  checkChip(label, none, { filled: false });
  // Un fond posé par le code (le même appel que celui du choix de couleur), pâle puis blanc : la pastille reste lisible.
  await app.evaluate(() => EditorCore.setColorBar('v2-table-fill-bar', '#c8f7c5'));
  checkChip(`${label} (fond vert pâle)`, await app.evaluate(() => window.__t.chip('v2-table-fill-btn', 'v2-table-fill-bar')), { filled: true });
  await app.evaluate(() => EditorCore.setColorBar('v2-table-fill-bar', '#ffffff'));
  checkChip(`${label} (fond blanc)`, await app.evaluate(() => window.__t.chip('v2-table-fill-btn', 'v2-table-fill-bar')), { filled: true });
  await app.evaluate(() => EditorCore.setColorBar('v2-table-fill-bar', null));
  checkChip(`${label} (fond retiré)`, await app.evaluate(() => window.__t.chip('v2-table-fill-btn', 'v2-table-fill-bar')), { filled: false });
  // Le vrai geste : le menu s'ouvre, « Personnalisé… » garde la goutte, une couleur remplit la pastille, « Aucune » la vide.
  await realClick(app, '#v2-table-fill-btn');
  const menu = await app.evaluate(() => { const custom = document.querySelector('.v2-color-dropdown.visible .cp-custom svg'); return { open: !!custom, custom: custom ? custom.innerHTML : null }; });
  check(`${label} : le menu garde la goutte sur « Personnalisé… » (une icône = une fonction)`, menu.open && menu.custom === names.drop, { open: menu.open, same: menu.custom === names.drop });
  await realClick(app, '.v2-color-dropdown.visible .cp-swatch[data-color="#ffd6d6"]');
  const picked = await app.evaluate(() => ({ chip: window.__t.chip('v2-table-fill-btn', 'v2-table-fill-bar'), cell: (() => { let color = null; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'tableCell' && color === null && n.attrs.backgroundColor) color = n.attrs.backgroundColor; }); return color; })() }));
  check(`${label} : un vrai clic sur une couleur fond la case et remplit la pastille`, picked.cell === '#ffd6d6' && !!picked.chip && !picked.chip.isNone && /255, 214, 214/.test(picked.chip.fill), { cell: picked.cell, isNone: picked.chip && picked.chip.isNone, fill: picked.chip && picked.chip.fill });
  // Le choix d'une couleur referme le menu ET la barre du tableau (comme avant) : on reprend la sélection dans la case, la barre revient, le menu se rouvre.
  await selectInTable(app, 'R1C1 texte');
  await app.waitForFunction(() => { const b = document.getElementById('v2-table-fill-btn'); return !!b && b.getBoundingClientRect().height > 0; }, null, { timeout: 8000 });
  await realClick(app, '#v2-table-fill-btn');
  await realClick(app, '.v2-color-dropdown.visible [data-action="none"]');
  const cleared = await app.evaluate(() => window.__t.chip('v2-table-fill-btn', 'v2-table-fill-bar'));
  check(`${label} : « Aucune » vide la pastille, qui redevient barrée`, !!cleared && cleared.isNone && cleared.slash !== 'none', cleared && { isNone: cleared.isNone, slash: cleared.slash });
  await app.close();
}

// ───────────── 2. Fond et trait d'un objet, barre du cadre libre ─────────────
const FRAME = (x, y, w, h, look, html = '<p></p>') => {
  const a = Object.assign({ shape: '', fill: '', line: '', lw: '' }, look);
  const extra = ['shape', 'fill', 'line', 'lw'].filter(key => a[key] !== '').map(key => ` data-ff-${key}="${a[key]}"`).join('');
  return `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;
};
const SLIDES = `${FRAME(40, 40, 200, 90, { shape: 'rect', line: '#000000', lw: 4 })}<p></p><div class="page-break-marker" contenteditable="false">Saut de page</div><h2>Deux</h2><p>Texte</p>`;
const SEED = seedModels({ record: { id: 1, Nom: 'Alice' } }) + `
  add(8, 'Formes', ${JSON.stringify(SLIDES)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
for (const scheme of ['light', 'dark']) {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'] }, seed: SEED, lang: 'fr', colorScheme: scheme });
  await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), 8), sleep(20000)]);
  await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), 8, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, 2, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  await page.evaluate(installProbes);
  const centre = await page.evaluate(() => { const r = document.querySelectorAll('.pp-slide-item')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(centre.x - 6, centre.y); await page.mouse.move(centre.x, centre.y, { steps: 2 }); await page.mouse.click(centre.x, centre.y); await sleep(500);
  await chooseObject(page, 'shape:rect');
  await sleep(600);
  const label = `${scheme === 'dark' ? 'sombre' : 'clair'} · barre du cadre`;
  const fill = await page.evaluate(() => window.__t.chip('v2-frame-fill-open', 'v2-frame-fill-bar'));
  const line = await page.evaluate(() => window.__t.chip('v2-frame-line-open', 'v2-frame-line-bar'));
  const names = await page.evaluate(() => ({ fill: window.__t.inner('fill'), line: window.__t.inner('shapeLine') }));
  check(`${label} : le fond de l'objet porte le pot de peinture`, !!fill && fill.iconInner === names.fill, fill && { same: fill.iconInner === names.fill });
  check(`${label} : le trait garde son icône, sans pot de peinture`, !!line && line.iconInner === names.line && names.line !== names.fill, line && { same: line.iconInner === names.line });
  checkChip(`${label}, fond`, fill, { filled: !!fill && !fill.isNone });
  checkChip(`${label}, trait`, line, { filled: !!line && !line.isNone });
  await page.close();
}

// ───────────── 3. Les trois icônes de case à cocher ─────────────
const ICONS = ['checklistAccentStrike', 'checklistClassic', 'checklistAccentPlain'];
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  await app.evaluate(installProbes);
  // Le balisage : une couleur (`currentColor`), des tracés évidés, trois dessins distincts.
  const markup = await app.evaluate(names => names.map(name => { const host = document.createElement('div'); host.innerHTML = Icons.svg(name); return host.firstElementChild.outerHTML; }), ICONS);
  const hardCoded = markup.map(m => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black|red|blue|grey|gray)\b/i.test(m.replace(/currentColor/g, '')));
  check('icônes de case : aucune couleur écrite en dur, `currentColor` seul', hardCoded.every(bad => !bad) && markup.every(m => /currentColor/.test(m)), { hardCoded });
  check('icônes de case : les deux cases pleines sont évidées (coche en réserve), la classique est un contour', /fill-rule="evenodd"/.test(markup[0]) && /fill-rule="evenodd"/.test(markup[2]) && !/fill-rule="evenodd"/.test(markup[1]), markup.map(m => /evenodd/.test(m)));
  check('icônes de case : trois dessins différents', new Set(markup).size === 3, null);
  // Le rendu, sur de vrais pixels, noir sur blanc. À l'échelle 8 (192 px) chaque point du dessin tombe sur son pixel : on y vérifie le DESSIN. À 16 px (barre d'outils) et à 20 px (barre « Oui / Non »)
  // un trait fait 1 à 2 px et le bord d'un pixel le fausse : on y vérifie la LISIBILITÉ, avec des points choisis au centre des formes et, pour la barre de texte, la moyenne d'une zone. Unités du cadre de 24.
  const POINTS = { coin: [4.5, 8.2], coche: [8.96, 11.53], interieur: [5.2, 9.0], contour: [2.9, 12], barreHaut: [19.5, 10.6], barreLigne: [19.5, 12], barreBas: [19.5, 13.4] };
  const BARRE = [17.3, 10.3, 21.7, 13.7];
  const measureIcons = async size => {
    await app.evaluate(({ names, size }) => {
      document.getElementById('tm-host') && document.getElementById('tm-host').remove();
      const host = document.createElement('div');
      host.id = 'tm-host';
      host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;color:#000;padding:8px;display:flex;gap:12px;';
      host.innerHTML = names.map(name => `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:0">${Icons.svg(name)}</span>`).join('');
      host.querySelectorAll('svg').forEach(s => { s.style.width = size + 'px'; s.style.height = size + 'px'; });
      document.body.appendChild(host);
    }, { names: ICONS, size });
    await sleep(150);
    const frame = await app.evaluate(() => { const r = document.getElementById('tm-host').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, icons: Array.from(document.querySelectorAll('#tm-host svg')).map(s => { const b = s.getBoundingClientRect(); return { x: b.x, y: b.y }; }) }; });
    const png = await app.screenshot({ clip: { x: Math.floor(frame.x), y: Math.floor(frame.y), width: Math.min(Math.ceil(frame.w), WIDTH - 10), height: Math.min(Math.ceil(frame.h), 380) } });
    return app.evaluate(async ({ b64, frame, size, points, barre }) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' }));
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
      const k = size / 24, luma = d => 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
      return frame.icons.map(ic => {
        const ox = Math.round(ic.x - Math.floor(frame.x)), oy = Math.round(ic.y - Math.floor(frame.y));
        const out = {};
        for (const [name, [ux, uy]] of Object.entries(points)) out[name] = Math.round(luma(ctx.getImageData(Math.floor(ox + ux * k), Math.floor(oy + uy * k), 1, 1).data));
        let sum = 0, count = 0;
        const [x0, y0, x1, y1] = barre;
        for (let y = Math.floor(oy + y0 * k); y <= Math.ceil(oy + y1 * k); y++) for (let x = Math.floor(ox + x0 * k); x <= Math.ceil(ox + x1 * k); x++) {
          const cx = x + 0.5, cy = y + 0.5;
          if (cx >= ox + x0 * k && cx <= ox + x1 * k && cy >= oy + y0 * k && cy <= oy + y1 * k) { sum += luma(ctx.getImageData(x, y, 1, 1).data); count++; }
        }
        out.barre = count ? Math.round(sum / count) : null;
        return out;
      });
    }, { b64: png.toString('base64'), frame, size, points: POINTS, barre: BARRE });
  };
  const dark = v => v !== null && v < 60, light = v => v !== null && v > 170;
  {
    const [strike, classic, plain] = await measureIcons(192);
    check('icônes de case (échelle 8) : « accent » = case pleine, coche en réserve (le coin et l\'intérieur sont pleins, le milieu de la coche est blanc)', [strike, plain].every(s => dark(s.coin) && dark(s.interieur) && dark(s.contour) && s.coche > 215), { strike, plain });
    check('icônes de case (échelle 8) : « classique » = case à contour, intérieur vide, coche pleine (contour et coche noirs, le reste blanc)', classic.coin > 215 && classic.interieur > 215 && dark(classic.contour) && dark(classic.coche), { classic });
    check('icônes de case (échelle 8) : le texte est grisé et barré pour « accent, texte barré » seulement (gris en haut et en bas, trait noir au milieu) ; plein pour les deux autres', strike.barreHaut > 140 && strike.barreHaut < 200 && strike.barreBas > 140 && strike.barreBas < 200 && dark(strike.barreLigne) && [plain, classic].every(s => dark(s.barreHaut) && dark(s.barreLigne) && dark(s.barreBas)), { strike, plain, classic });
  }
  for (const size of [16, 20]) {
    const [strike, classic, plain] = await measureIcons(size);
    check(`icônes de case à ${size} px : « accent » = case pleine, coche en réserve (coin sombre, milieu de la coche clair)`, [strike, plain].every(s => dark(s.coin) && light(s.coche)), { strike, plain });
    check(`icônes de case à ${size} px : « classique » = intérieur vide, coche franche (intérieur clair, milieu de la coche sombre)`, classic.interieur > 200 && classic.coche < 100, { classic });
    check(`icônes de case à ${size} px : seul « accent, texte barré » a un texte grisé (moyenne de la barre de texte entre 60 et 200, et 50 de plus que les autres) ; les autres un texte plein (moins de 40)`, strike.barre >= 60 && strike.barre <= 200 && strike.barre > plain.barre + 50 && plain.barre < 40 && classic.barre < 40, { strike: strike.barre, plain: plain.barre, classic: classic.barre });
  }
  await app.close();
}
// La barre « Oui / Non » d'une bulle prend ses trois icônes dans la même source (`Icons.checklist…`) : une seule correction pour les deux barres.
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  await app.evaluate(installProbes);
  const TABLE_ID = 'VbDossiers';
  await app.evaluate(async ({ table }) => {
    const stub = window.__gristStub;
    stub.setVariables(table, { Nom: 'Text', Actif: 'Bool' });
    stub.setRows(table, [{ id: 1, Nom: 'Dupont', Actif: true }]);
    await GristAPI.refreshSchema();
    Editor.setHTML(`<p>Livré : <span class="var-badge" data-table="${table}" data-column="Actif" data-key="${table}.Actif"></span></p>`);
    stub.fireRecord({ id: 1, Nom: 'Dupont', Actif: true }, table);
  }, { table: TABLE_ID });
  await sleep(500);
  await realClick(app, '.tiptap .var-badge[data-column="Actif"]');
  await sleep(400);
  const bar = await app.evaluate(() => {
    const out = {};
    for (const [style, name] of [['accentStrike', 'checklistAccentStrike'], ['classic', 'checklistClassic'], ['accentPlain', 'checklistAccentPlain']]) {
      const b = document.querySelector(`.v2-varfmt-toolbar.visible [data-var-panel="bool"] button[data-action="bool-style:${style}"] svg`);
      out[style] = !!b && b.innerHTML === window.__t.inner(name);
    }
    return out;
  });
  check('barre « Oui / Non » d\'une bulle : les trois boutons portent les mêmes icônes que la barre des listes', bar.accentStrike && bar.classic && bar.accentPlain, bar);
  await app.close();
}

// ───────────── 4. La coche des cases, centrée ─────────────
// Mesure : chaque coche est peinte en rouge par une feuille d'essai (la géométrie ne change pas) ; la page est agrandie 4 fois par une transformation (la mise en page, donc l'arrondi au pixel entier, reste celle d'une
// page à 100 %, mais l'encre se mesure au quart de pixel) ; l'écart est celui du milieu de la boîte englobante de l'encre au milieu de la case, en pixels de la page. Deux positions de la case : entière et demi-pixel.
const TICK_HOST = `
  <div id="tm-scale" style="position:fixed;left:0;top:0;width:350px;height:200px;transform:scale(4);transform-origin:0 0;background:#fff;font:14px Roboto,Arial,sans-serif;color:#1b2430;z-index:99999">
    <div class="tiptap" id="tm-ed" style="position:absolute"><ul data-type="taskList" data-tasklist-style="classic"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked></label><div><p>Texte</p></div></li></ul></div>
    <div class="reader-content" id="tm-rd" style="position:absolute"><ul data-type="taskList" data-tasklist-style="classic"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked></label><div><p>Texte</p></div></li></ul></div>
    <div id="tm-v14" style="position:absolute;font-size:14px;line-height:20px"><span class="resolved-checkbox" id="tm-v-accent" data-checked="true" data-checkbox-style="accentStrike">☑</span> <span class="resolved-checkbox" id="tm-v-classic" data-checked="true" data-checkbox-style="classic">☑</span></div>
    <div id="tm-v28" style="position:absolute;font-size:28px;line-height:36px"><span class="resolved-checkbox" id="tm-v-accent28" data-checked="true" data-checkbox-style="accentStrike">☑</span> <span class="resolved-checkbox" id="tm-v-classic28" data-checked="true" data-checkbox-style="classic">☑</span></div>
  </div>
  <style>#tm-ed input:checked::after, #tm-rd input:checked::after, #tm-v-classic::after, #tm-v-classic28::after, #tm-v-accent::after, #tm-v-accent28::after { border-color: #e00 !important; }</style>`;
const TARGETS = [
  ['liste à cases classique, éditeur', '#tm-ed input', '#tm-ed'], ['liste à cases classique, Lecture', '#tm-rd input', '#tm-rd'],
  ['case Oui / Non classique, 14 px', '#tm-v-classic', '#tm-v14'], ['case Oui / Non accent, 14 px', '#tm-v-accent', '#tm-v14'],
  ['case Oui / Non classique, 28 px', '#tm-v-classic28', '#tm-v28'], ['case Oui / Non accent, 28 px', '#tm-v-accent28', '#tm-v28'],
];
const HOSTS = ['#tm-ed', '#tm-rd', '#tm-v14', '#tm-v28'];
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  await app.evaluate(html => { const host = document.createElement('div'); host.id = 'tm-outer'; host.innerHTML = html; document.body.appendChild(host); }, TICK_HOST);
  await sleep(250);
  const worst = {};
  for (const shift of [0, 0.5]) {
    for (const [name, sel, host] of TARGETS) {
      // Une seule case à la fois, à l'échelle 4, en haut à gauche : tout tient dans le panneau, même les cases de 28 px.
      await app.evaluate(({ hosts, host, shift }) => { for (const h of hosts) { const e = document.querySelector(h); e.style.display = h === host ? '' : 'none'; e.style.left = (10 + shift) + 'px'; e.style.top = (10 + shift) + 'px'; } }, { hosts: HOSTS, host, shift });
      const info = await app.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
      const pad = 8;
      const png = await app.screenshot({ clip: { x: Math.floor(info.x) - pad, y: Math.floor(info.y) - pad, width: Math.ceil(info.w) + 2 * pad, height: Math.ceil(info.h) + 2 * pad } });
      const offset = await app.evaluate(async ({ b64, info, pad }) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' }));
        const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
        const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
        for (let Y = 0; Y < cv.height; Y++) for (let X = 0; X < cv.width; X++) {
          const i = (Y * cv.width + X) * 4;
          if ((d[i] - (d[i + 1] + d[i + 2]) / 2) / 200 >= 0.5) { x0 = Math.min(x0, X); x1 = Math.max(x1, X + 1); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y + 1); }
        }
        if (x1 < 0) return null;
        const ox = Math.floor(info.x) - pad, oy = Math.floor(info.y) - pad;
        return { dx: ((ox + (x0 + x1) / 2) - (info.x + info.w / 2)) / 4, dy: ((oy + (y0 + y1) / 2) - (info.y + info.h / 2)) / 4 };
      }, { b64: png.toString('base64'), info, pad });
      const prev = worst[name] || { dx: 0, dy: 0 };
      worst[name] = offset ? { dx: Math.max(prev.dx, Math.abs(offset.dx)), dy: Math.max(prev.dy, Math.abs(offset.dy)) } : { dx: 99, dy: 99 };
    }
  }
  for (const [name] of TARGETS) {
    const w = worst[name];
    check(`coche centrée · ${name} : écart au milieu de la case de ${w.dx.toFixed(2)} px en largeur et ${w.dy.toFixed(2)} px en hauteur (0,6 px au plus : l'arrondi du navigateur au pixel)`, w.dx <= 0.6 && w.dy <= 0.6, w);
  }
  // La géométrie, sans arrondi : le milieu de la boîte de la coche (corrigé de ce que son coin pivoté pèse sous son milieu) est le milieu de l'intérieur de la case, quelle que soit l'épaisseur de bordure retenue.
  const geometry = await app.evaluate(hosts => {
    hosts.forEach(h => { document.querySelector(h).style.display = ''; });
    const one = (sel, em) => {
      const el = document.querySelector(sel), cs = getComputedStyle(el), after = getComputedStyle(el, '::after');
      const bw = parseFloat(after.borderRightWidth), w = parseFloat(after.width), h = parseFloat(after.height);
      const padW = el.getBoundingClientRect().width / 4 - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      const padH = el.getBoundingClientRect().height / 4 - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
      const sink = em ? 0.0932 * parseFloat(cs.fontSize) : 1.29;
      return { dx: +(parseFloat(after.left) + (w + bw) / 2 - padW / 2).toFixed(3), dy: +(parseFloat(after.top) + (h + bw) / 2 + sink - padH / 2).toFixed(3), bw, em };
    };
    return { liste: one('#tm-ed input', false), lecture: one('#tm-rd input', false), classique14: one('#tm-v-classic', true), accent14: one('#tm-v-accent', true), classique28: one('#tm-v-classic28', true), accent28: one('#tm-v-accent28', true) };
  }, HOSTS);
  for (const [name, g] of Object.entries(geometry)) check(`coche centrée · géométrie ${name} : la boîte de la coche est posée au milieu de la case (écart ${g.dx} / ${g.dy} px)`, Math.abs(g.dx) <= 0.05 && Math.abs(g.dy) <= 0.12, g);
  await app.close();
}

// L'export HTML écrit la règle de la coche comme l'éditeur (le fichier se lit hors de l'app, avec ses propres feuilles).
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  const same = await app.evaluate(async () => {
    const rule = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules); } catch { return []; } }).find(r => r.selectorText === '.resolved-checkbox[data-checked="true"]::after');
    await ExportEngines.loadAll();
    const doc = await HtmlExport.htmlToDocument('<p><span class="resolved-checkbox" data-checked="true" data-checkbox-style="classic">☑</span></p>', null, { title: 'x' });
    const exported = /\.pp-doc \.pp-checkbox\.pp-checked::after \{([^}]*)\}/.exec(String(doc));
    const pick = (text, prop) => { const m = new RegExp('(?:^|[;{\\s])' + prop + ':\\s*([^;]+)').exec(text || ''); return m ? m[1].trim().replace(/\s+/g, ' ').replace(/(^|[^\d])0\./g, '$1.') : null; };
    const editorText = rule ? rule.cssText.replace(/^[^{]*\{/, '').replace(/\}\s*$/, '') : '';
    return { editor: { left: pick(editorText, 'left'), top: pick(editorText, 'top') }, exported: { left: pick(exported && exported[1], 'left'), top: pick(exported && exported[1], 'top') } };
  });
  check('export HTML : la règle de la coche (left, top) est celle de l\'éditeur, en pourcentages du milieu de la case', !!same.editor.left && same.editor.left === same.exported.left && same.editor.top === same.exported.top && /calc\(50%/.test(same.exported.left) && /calc\(50%/.test(same.exported.top), same);
  await app.close();
}

// Le PDF : la coche de la case classique d'un item de liste est peinte au milieu de sa case (pdf.js, aux pixels), celle de l'accent est restée où elle était.
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  await app.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
  const html = style => `<ul data-type="taskList"${style ? ` data-tasklist-style="${style}"` : ''}><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked><span></span></label><div><p>Texte</p></div></li></ul>`;
  const result = await app.evaluate(async ({ markups }) => {
    await ExportEngines.loadAll();
    await PdfExport.ensurePdfLibsLoaded();
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const out = {};
    for (const [label, markup, classic] of markups) {
      let definition = null;
      const original = window.pdfMake.createPdf;
      window.pdfMake.createPdf = function (doc) { definition = doc; const gen = original.call(window.pdfMake, doc); gen.download = function () {}; return gen; };
      let blob;
      try { blob = (await PdfExport.getNativePdfBlobForRecord(markup, null, {}, '', null)).blob; } finally { window.pdfMake.createPdf = original; }
      const canvases = [];
      (function walk(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node.canvas)) canvases.push(node.canvas); Object.values(node).forEach(walk); })(definition.content);
      const polyline = (canvases[0] || []).find(shape => shape.type === 'polyline');
      const box = (canvases[0] || []).find(shape => shape.type === 'rect');
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      const page = await pdf.getPage(1);
      const vp1 = page.getViewport({ scale: 1 });
      const word = (await page.getTextContent()).items.find(it => it.str && it.str.trim() === 'Texte');
      const tx = word.transform[4], ty = vp1.height - word.transform[5], scale = 16;
      const rx0 = tx - 30, ry0 = ty - 20, rw = 32, rh = 28;
      const cv = document.createElement('canvas'); cv.width = rw * scale; cv.height = rh * scale;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }), transform: [1, 0, 0, 1, -rx0 * scale, -ry0 * scale] }).promise;
      const W = cv.width, H = cv.height, d = ctx.getImageData(0, 0, W, H).data;
      const lum = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
      const textLeft = Math.round((tx - rx0) * scale);
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < textLeft - 2 * scale; x++) if (lum(x, y) < 235) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const ins = Math.round(1.1 * scale);
      let a0 = W, b0 = H, a1 = -1, b1 = -1;
      for (let y = y0 + ins; y <= y1 - ins; y++) for (let x = x0 + ins; x <= x1 - ins; x++) { const l = lum(x, y); if (classic ? l < 60 : l > 215) { a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y); } }
      out[label] = {
        points: polyline && box ? polyline.points.map(p => [Math.round((p.x - box.x) * 100) / 100, Math.round((p.y - box.y) * 100) / 100]) : null,
        dxPx: +((((a0 + a1 + 1) / 2 - (x0 + x1 + 1) / 2) / scale) * 4 / 3).toFixed(2), dyPx: +((((b0 + b1 + 1) / 2 - (y0 + y1 + 1) / 2) / scale) * 4 / 3).toFixed(2),
      };
    }
    return out;
  }, { markups: [['classique', html('classic'), true], ['accent', html(''), false]] });
  check('PDF · liste à cases classique : la coche est peinte au milieu de sa case (0,3 px au plus d\'écart, mesuré sur le PDF rendu)', Math.abs(result.classique.dxPx) <= 0.3 && Math.abs(result.classique.dyPx) <= 0.3, result.classique);
  check('PDF · liste à cases d\'accent : la coche n\'a pas bougé (ses trois points, comptés depuis le coin de sa case)', JSON.stringify(result.accent.points) === JSON.stringify([[2.05, 5.89], [4.23, 8.46], [8.46, 2.56]]), result.accent.points);
  await app.close();
}

await t.finish();
