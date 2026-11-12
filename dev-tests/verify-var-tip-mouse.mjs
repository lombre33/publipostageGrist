#!/usr/bin/env node
// L'info-bulle de valeur d'une bulle (js/variable-tip.js, js/editor-tip.js, css/variable-tip.css) à la VRAIE souris et au VRAI clavier (page.mouse, page.keyboard) dans le panneau de Grist d'Antoine
// (700x400, cadre isolé de GFS), en clair, en sombre et en anglais. Ce que dev-tests/scenarios-var-value-tip.js ne peut pas voir depuis la page :
//  1) LE SURVOL : la souris posée sur une bulle, l'info-bulle vient après l'attente (pas avant), donne la valeur, reste dans le panneau, ne recouvre pas la bulle (la souris la garde), se lit (≥ 4,5:1) ;
//  2) ELLE SE SURVOLE ET SE SÉLECTIONNE : la souris passe de la bulle à l'info-bulle sans qu'elle se ferme, un double clic dans sa valeur la sélectionne, elle part quand la souris s'en va ;
//  3) EN BAS DU PANNEAU : la bulle tout en bas, l'info-bulle passe au-dessus et reste dans le panneau ; une zone répétée de 7 lignes y tient (5 tours et « + 2 autres ») ;
//  4) LA SOURIS PARQUÉE : on tape au vrai clavier devant une bulle qui glisse sous la souris immobile : aucune info-bulle ; un vrai mouvement de souris l'ouvre ;
//  5) AU CLAVIER : une flèche amène la sélection sur la bulle, l'info-bulle vient dessous après 0,6 s ; Échap la ferme et la frappe qui suit aussi ;
//  6) LA BARRE DE GFS aux quatre bords : l'info-bulle ne recouvre jamais sa zone et reste dans le panneau (au-dessus de la bulle sous une barre en bas) ;
//  7) EN SOMBRE puis EN ANGLAIS : l'info-bulle se lit et parle anglais ;
//  8) LE COÛT D'UNE TOUCHE : le gestionnaire de touche de l'info-bulle (500 touches envoyées au document) ne coûte rien de mesurable.
// VAR_TIP_SHOTS=<dossier> y range une capture par étape (à regarder - aucune vérification n'en dépend) ; VAR_TIP_ONLY=1,3 n'en joue que ces parties. Lancé par run-headless.mjs (groupe Node « varTipMouse », cf. NODE_SCRIPTS), ou seul :
// node dev-tests/verify-var-tip-mouse.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-var-tip-mouse', port: Number(process.env.VAR_TIP_MOUSE_PORT || 8897) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.VAR_TIP_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const ONLY = (process.env.VAR_TIP_ONLY || '').split(',').map(x => x.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));
const SEED = seedModels();
const FRAME = [700, 400];
const EDGES = ['gauche', 'haut', 'droite', 'bas'];
const EN_EDGE = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };

const TABLE = 'VtDossiers';
const ROW_LOOP = JSON.stringify({ repeat: 'row', table: 'VtLignes', empty: 'header' }).replace(/"/g, '&quot;');
const badge = (table, column, loop) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${loop ? ` data-loop="${ROW_LOOP}" data-loop-repeat="row"` : ''}></span>`;
const LOOP_TABLE = `<table><tbody><tr><td><p>${badge('VtLignes', 'Designation', true)}</p></td><td><p>${badge('VtLignes', 'Qte')}</p></td></tr></tbody></table>`;

async function prepare(app) {
  await app.evaluate(async (table) => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables(table, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setVariables('VtLignes', { Dossier: 'Ref:' + table, Designation: 'Text', Qte: 'Numeric', manualSort: 'ManualSortPos' });
    stub.setRows(table, [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 }, { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 }]);
    const lines = [];
    for (let i = 1; i <= 7; i++) lines.push({ id: i, Dossier: 1, Designation: 'Ligne ' + i, Qte: i * 10, manualSort: i });
    stub.setRows('VtLignes', lines);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('VtLignes');
    await GristAPI.saveLinkRule('VtLignes', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 }, table);
  }, TABLE);
  await sleep(200);
}
const setHtml = async (app, html) => {
  await app.evaluate(h => { Editor.setHTML(h); const box = document.getElementById('editor-container'); if (box) box.scrollTop = 0; }, html);
  await sleep(400);
};
const rectOf = (app, selector, index = 0) => app.evaluate(([sel, n]) => {
  const el = document.querySelectorAll(sel)[n];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height } : null;
}, [selector, index]);
const tipRect = app => rectOf(app, '.pp-var-tip:not([hidden])');
const tipText = app => app.evaluate(() => { const tip = document.querySelector('.pp-var-tip'); return tip && !tip.hidden ? tip.textContent : null; });
const centerOf = r => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
const inFrame = r => r.left >= -0.5 && r.top >= -0.5 && r.right <= FRAME[0] + 0.5 && r.bottom <= FRAME[1] + 0.5;
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
async function waitTip(app, ms = 2500) {
  await app.waitForFunction(() => { const tip = document.querySelector('.pp-var-tip'); return !!tip && !tip.hidden; }, null, { timeout: ms }).catch(() => {});
  return tipRect(app);
}
async function goneTip(app, ms = 1500) {
  await app.waitForFunction(() => { const tip = document.querySelector('.pp-var-tip'); return !tip || tip.hidden; }, null, { timeout: ms }).catch(() => {});
  return !(await tipRect(app));
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
// Remet l'écran à froid : l'info-bulle fermée, la souris loin, la « fenêtre tiède » (info-bulle fermée il y a moins de 1,5 s) passée.
async function cool(page, app) {
  await page.mouse.move(5, FRAME[1] - 20);
  await app.evaluate(() => VariableTip.close());
  await sleep(1700);
}

const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
const { page, app } = ctx;
await prepare(app);

if (wanted(1)) {
// 1) Le survol.
console.log('\n1) Le survol, 700 × 400');
await setHtml(app, `<p>Dossier : ${badge(TABLE, 'Titre')} (statut ${badge(TABLE, 'Statut')})</p><p>Suite du texte.</p>`);
await cool(page, app);
{
  const bubble = await rectOf(app, '.tiptap span.var-badge', 0);
  const c = centerOf(bubble);
  await page.mouse.move(c.x - 30, c.y + 40);
  await sleep(100);
  const started = Date.now();
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await sleep(250);
  check('1) avant la fin de l\'attente, rien n\'est affiché', !(await tipRect(app)));
  const tip = await waitTip(app);
  const elapsed = Date.now() - started;
  check('1) l\'info-bulle s\'affiche quand la souris s\'arrête sur la bulle', !!tip);
  check('1) elle vient après l\'attente d\'une demi-seconde, pas avant (' + elapsed + ' ms)', elapsed >= 450, { elapsed });
  if (tip) {
    const text = await tipText(app);
    check('1) elle donne la valeur de la ligne sélectionnée et le nom de la variable avec le numéro de la ligne', /^Dossier A/.test(text) && /ligne n° 1/.test(text) && text.includes('VtDossiers.Titre'), { text });
    check('1) elle reste dans le panneau', inFrame(tip), tip);
    check('1) elle ne recouvre pas la bulle', !overlap(tip, bubble), { tip, bubble });
    const stays = await app.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest('span.var-badge'); }, [c.x, c.y]);
    check('1) la souris reste sur la bulle (l\'info-bulle ne passe pas dessous)', stays);
    const ratio = await contrastOf(app, '.pp-var-tip:not([hidden])');
    check('1) elle se lit : contraste d\'au moins 4,5:1 (clair)', ratio >= 4.5, ratio);
    await shot(page, '1-survol-clair');
  }
  await page.mouse.move(c.x - 60, c.y + 80, { steps: 3 });
  check('1) elle part quand la souris s\'en va', await goneTip(app));
}
}

if (wanted(2)) {
// 2) Elle se survole et se sélectionne.
console.log('\n2) L\'info-bulle se survole et se sélectionne');
await setHtml(app, `<p>Dossier : ${badge(TABLE, 'Titre')} (statut ${badge(TABLE, 'Statut')})</p><p>Suite du texte.</p>`);
await cool(page, app);
{
  const bubble = await rectOf(app, '.tiptap span.var-badge', 0);
  const c = centerOf(bubble);
  await page.mouse.move(c.x - 20, c.y + 30);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  const tip = await waitTip(app);
  if (!tip) check('2) l\'info-bulle s\'affiche', false);
  else {
    // Vers l'info-bulle, en traversant l'écart de quelques pixels qui la sépare de la bulle.
    const valueRect = await rectOf(app, '.pp-var-tip .pp-var-tip-value');
    const target = centerOf(valueRect);
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await sleep(500);
    check('2) la souris passe de la bulle à l\'info-bulle : elle reste ouverte', !!(await tipRect(app)));
    await page.mouse.dblclick(valueRect.left + 8, target.y);
    await sleep(120);
    const picked = await app.evaluate(() => String(window.getSelection()));
    check('2) un double clic dans sa valeur sélectionne le mot (on peut le copier)', /Dossier|A/.test(picked), { picked });
    check('2) la sélection ne ferme pas l\'info-bulle', !!(await tipRect(app)));
    await page.mouse.move(FRAME[0] - 20, FRAME[1] - 20, { steps: 4 });
    check('2) elle part quand la souris quitte la bulle et l\'info-bulle', await goneTip(app));
  }
}
}

if (wanted(3)) {
// 3) En bas du panneau, et une zone répétée.
console.log('\n3) En bas du panneau');
await setHtml(app, '<p>ligne</p>'.repeat(14) + `<p>Dossier : ${badge(TABLE, 'Titre')}</p>` + '<p>ligne</p>'.repeat(14));
await cool(page, app);
{
  await app.evaluate(() => {
    const el = document.querySelector('.tiptap span.var-badge');
    let box = el.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (box) box.scrollTop += el.getBoundingClientRect().top - (innerHeight - 50);
  });
  await sleep(300);
  const bubble = await rectOf(app, '.tiptap span.var-badge', 0);
  const c = centerOf(bubble);
  await page.mouse.move(c.x - 40, c.y - 40);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  const tip = await waitTip(app);
  check('3) la bulle en bas du panneau : l\'info-bulle s\'affiche', !!tip);
  if (tip) {
    check('3) elle passe au-dessus de la bulle (pas de place dessous) et reste dans le panneau', tip.bottom <= bubble.top && inFrame(tip), { tip, bubble });
    await shot(page, '3-en-bas');
  }
}
await setHtml(app, LOOP_TABLE);
await cool(page, app);
{
  const bubble = await rectOf(app, '.tiptap span.var-badge', 1);
  const c = centerOf(bubble);
  await page.mouse.move(c.x - 40, c.y - 30);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  const tip = await waitTip(app);
  check('3) une zone répétée : l\'info-bulle s\'affiche', !!tip);
  if (tip) {
    const lines = await app.evaluate(() => Array.from(document.querySelectorAll('.pp-var-tip .pp-var-tip-turn')).map(e => e.textContent));
    const notes = await app.evaluate(() => Array.from(document.querySelectorAll('.pp-var-tip .pp-var-tip-note')).map(e => e.textContent));
    check('3) elle donne les cinq premiers tours et « + 2 autres »', lines.length === 5 && notes[0] === 'Répétée pour 7 lignes' && notes[1] === '+ 2 autres', { lines, notes });
    check('3) elle tient dans le panneau, sans recouvrir la bulle', inFrame(tip) && !overlap(tip, bubble), { tip, bubble });
    await shot(page, '3-zone');
  }
}
}

if (wanted(4)) {
// 4) La souris parquée.
console.log('\n4) La souris parquée sous un texte qui glisse');
await setHtml(app, `<p>${badge(TABLE, 'Titre')} fin de ligne</p>`);
await cool(page, app);
{
  const first = await rectOf(app, '.tiptap span.var-badge', 0);
  const y = (first.top + first.bottom) / 2;
  // Le glissement de dix lettres, mesuré pour de vrai (puis effacé) : la souris sera parquée là où la bulle arrivera, juste à droite de sa place d'origine.
  await page.mouse.click(first.left - 2, y);
  await page.keyboard.press('Home');
  await page.keyboard.type('wwwwwwwwww', { delay: 5 });
  await sleep(150);
  const moved = await rectOf(app, '.tiptap span.var-badge', 0);
  for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
  await sleep(150);
  const shift = moved.left - first.left;
  const park = { x: first.right + Math.min(8, shift / 2), y };
  await page.mouse.move(park.x, y, { steps: 3 });
  await sleep(150);
  await page.keyboard.type('wwwwwwwwww', { delay: 15 });
  await sleep(250);
  const under = await app.evaluate(([x, py]) => { const el = document.elementFromPoint(x, py); return !!el && !!el.closest('span.var-badge'); }, [park.x, park.y]);
  await sleep(900);
  check('4) la bulle a glissé sous la souris immobile (le cas est bien produit)', under);
  check('4) aucune info-bulle ne s\'ouvre : la souris n\'a pas bougé', !(await tipRect(app)));
  await page.mouse.move(park.x + 12, park.y + 1, { steps: 3 });
  const tip = await waitTip(app, 2000);
  check('4) un vrai mouvement de souris sur la bulle ouvre l\'info-bulle', !!tip);
}
}

if (wanted(5)) {
// 5) Au clavier.
console.log('\n5) Au clavier');
await setHtml(app, `<p>Avant ${badge(TABLE, 'Titre')} après</p>`);
await cool(page, app);
{
  const bubble = await rectOf(app, '.tiptap span.var-badge', 0);
  await page.mouse.click(bubble.left - 3, (bubble.top + bubble.bottom) / 2);
  await page.mouse.move(5, FRAME[1] - 20);
  await sleep(200);
  // Une ou deux flèches : la première peut passer l'espace qui précède la bulle.
  const selectedNow = () => app.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s.node ? s.node.type.name : null; });
  for (let i = 0; i < 3 && (await selectedNow()) !== 'varBadge'; i++) { await page.keyboard.press('ArrowRight'); await sleep(60); }
  await sleep(300);
  const early = !!(await tipRect(app));
  const tip = await waitTip(app, 2000);
  const sel = await app.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s.node ? s.node.type.name : null; });
  check('5) une flèche sélectionne la bulle', sel === 'varBadge', { sel });
  check('5) l\'info-bulle ne vient pas tout de suite (0,6 s)', !early);
  check('5) elle s\'affiche sous la bulle, dans le panneau', !!tip && tip.top >= bubble.bottom && inFrame(tip), { tip, bubble });
  check('5) elle est liée à la bulle pour les lecteurs d\'écran (aria-describedby)', await app.evaluate(() => { const b = document.querySelector('.tiptap span.var-badge'); const tipEl = document.getElementById(b.getAttribute('aria-describedby') || '-'); return !!tipEl && tipEl.getAttribute('role') === 'tooltip'; }));
  await shot(page, '5-clavier');
  await page.keyboard.press('Escape');
  check('5) Échap la ferme', await goneTip(app, 500));
  await page.keyboard.press('ArrowRight');
  await sleep(100);
  await page.keyboard.press('ArrowLeft');
  await sleep(100);
  await page.keyboard.type('x');
  await sleep(900);
  check('5) une frappe ne la rouvre pas', !(await tipRect(app)));
}
}

if (wanted(6)) {
// 6) La barre de GFS aux quatre bords.
console.log('\n6) La barre de GFS');
const zoneOf = (bord) => page.evaluate(([b, w, h]) => window.__gfsStub.zoneDe(b, w, h), [bord, FRAME[0], FRAME[1]]);
const hits = (r, bar) => !!bar && r.left < bar.zone.x + bar.zone.largeur - 0.02 && r.right > bar.zone.x + 0.02 && r.top < bar.zone.y + bar.zone.hauteur - 0.02 && r.bottom > bar.zone.y + 0.02;
await setHtml(app, '<p>ligne</p>'.repeat(8) + `<p style="text-align:center">${badge(TABLE, 'Titre')}</p>` + `<p style="text-align:right">${badge(TABLE, 'Statut')}</p>` + '<p>ligne</p>'.repeat(14));
for (const bord of [null, ...EDGES]) {
  for (const which of [0, 1]) {
    const bar = bord === null ? null : await zoneOf(bord);
    await page.evaluate(next => window.__gfsStub.setBarre(next), bar);
    await app.waitForFunction(want => document.documentElement.getAttribute('data-gfs-bar') === want, bord === null ? null : EN_EDGE[bord], { timeout: 5000 });
    await sleep(150);
    await app.evaluate(([n, y]) => {
      const el = document.querySelectorAll('.tiptap span.var-badge')[n];
      let box = el.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      if (box) box.scrollTop += el.getBoundingClientRect().top - y;
    }, [which, which === 0 ? FRAME[1] - 70 : Math.round(FRAME[1] / 2) - 12]);
    await sleep(300);
    const bubble = await rectOf(app, '.tiptap span.var-badge', which);
    await cool(page, app);
    const c = centerOf(bubble);
    await page.mouse.move(c.x - 30, c.y - 30);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    const tip = await waitTip(app);
    const label = `6) ${bord === null ? 'sans barre' : 'barre ' + bord}, bulle ${which === 0 ? 'au centre, tout en bas' : 'à droite, à mi-hauteur'}`;
    check(label + ' : l\'info-bulle s\'affiche', !!tip);
    if (tip) {
      check(label + ' : elle ne recouvre pas la zone de la barre', !hits(tip, bar), { tip, zone: bar && bar.zone });
      check(label + ' : elle reste dans le panneau', inFrame(tip), tip);
    }
  }
}
await page.evaluate(() => window.__gfsStub.setBarre(null));
await sleep(200);
}

if (wanted(8)) {
// 8) Le coût d'une touche.
console.log('\n8) Le coût d\'une touche');
await app.evaluate(() => { Editor.setHTML(('<p>Dossier ' + '<span class="var-badge" data-table="VtDossiers" data-column="Titre" data-key="VtDossiers.Titre"></span>' + ' texte courant du paragraphe.</p>').repeat(400)); });
await sleep(1200);
{
  const cost = await app.evaluate(() => {
    const start = performance.now();
    for (let i = 0; i < 500; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    return performance.now() - start;
  });
  check('8) 500 touches envoyées au document : le gestionnaire de l\'info-bulle ne coûte rien de mesurable (' + cost.toFixed(1) + ' ms en tout)', cost < 150, { cost });
}
}

await ctx.page.context().close();

if (wanted(7)) {
// 7) En sombre, puis en anglais.
console.log('\n7) En sombre puis en anglais');
for (const [colorScheme, lang] of [['dark', 'fr'], ['light', 'en']]) {
  const dark = await t.openPage({ framed: true, seed: SEED, lang, colorScheme, stub: lang === 'en' ? { barre: null, langue: 'en' } : { barre: null } });
  await prepare(dark.app);
  if (colorScheme === 'dark') await dark.app.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await setHtml(dark.app, LOOP_TABLE);
  await sleep(300);
  const bubble = await rectOf(dark.app, '.tiptap span.var-badge', 1);
  const c = centerOf(bubble);
  await dark.page.mouse.move(c.x - 40, c.y - 30);
  await dark.page.mouse.move(c.x, c.y, { steps: 3 });
  const tip = await waitTip(dark.app);
  const label = `7) ${colorScheme === 'dark' ? 'thème sombre' : 'anglais'}`;
  check(label + ' : l\'info-bulle s\'affiche', !!tip);
  if (tip) {
    const ratio = await contrastOf(dark.app, '.pp-var-tip:not([hidden])');
    check(label + ' : elle se lit (≥ 4,5:1)', ratio >= 4.5, ratio);
    const notes = await dark.app.evaluate(() => Array.from(document.querySelectorAll('.pp-var-tip .pp-var-tip-note')).map(e => e.textContent));
    const foot = await dark.app.evaluate(() => document.querySelector('.pp-var-tip .pp-var-tip-foot').textContent);
    if (lang === 'en') check(label + ' : « Repeated for 7 rows », « + 2 more », « row #1 »', notes[0] === 'Repeated for 7 rows' && notes[1] === '+ 2 more' && /row #1/.test(foot), { notes, foot });
    await shot(dark.page, colorScheme === 'dark' ? '7-sombre' : '7-anglais');
  }
  await dark.page.context().close();
}
}

await t.finish();
