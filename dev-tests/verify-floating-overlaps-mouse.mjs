#!/usr/bin/env node
// Les barres, volets et languettes qui se partagent le haut et les bords du panneau ne se recouvrent jamais (retour d'Antoine du 20/11 : « petit chevauchement d'UI quand on a le menu Rechercher / Remplacer avec
// l'onglet des titres »), à 700x400 (le panneau de Grist), à la VRAIE souris, en français clair puis en anglais sombre. Rien n'est écrit dans le document.
//  1) LA RECHERCHE ET LES LANGUETTES : la barre Rechercher / Remplacer se pose AVANT les languettes (celle du plan du document au bord gauche, celle du panneau du haut au milieu), qui pendent sous elle sur le
//     document : ni l'une ni l'autre ne recouvre le chevron « Remplacer par » ni le champ ; un vrai clic sur le chevron montre et cache la ligne de remplacement, un vrai clic sur le champ à la place où la languette
//     du panneau le mordait y pose le clavier (le panneau reste déplié), un vrai clic sur la languette du plan l'ouvre, le volet est sous la barre ; refermée, la barre rend aux languettes leur place d'avant.
//  2) LA BARRE DE GFS (cadre isolé, GFS simulé : `barre` aux quatre bords, la zone de 42 x 132 px et celle de la vraie barre de 5 boutons, 42 x 162) : la barre de recherche (une ligne, avec « Remplacer par ») et
//     les bandeaux en flux sous la barre d'outils (« Revenir au macro-modèle », « Revenir au document », « Polices du PDF », « modifié ailleurs ») cèdent à la barre le début ou le bout de leur ligne par un
//     retrait de la profondeur de la zone quand elle les recouvre à leur hauteur (aucun texte ni bouton sous elle), ne posent RIEN quand elle ne les touche pas (haut, bas, cadre plus haut), et rendent tout
//     quand elle part.
//  3) LE BALAYAGE : chaque combinaison de recherche, plan du document (étroit : par-dessus le texte), volet « Modifications », panneau du haut replié, bandeaux et Lecture, sans barre puis aux quatre bords de GFS :
//     aucun contrôle n'est recouvert par un autre (ce que reçoit le clic en cinq points de chacun), aucun ne passe sous la zone de la barre, et aucune paire de meubles (languettes, volets, barre de recherche,
//     bande des diapositives, pastille du zoom) ne se superpose.
//  4) AUCUNE ERREUR de page.
// Lancé par run-headless.mjs (groupe Node « floatingOverlapsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-floating-overlaps-mouse.mjs
// FLOATING_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-floating-overlaps-mouse', port: Number(process.env.FLOATING_PORT || 8941) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.FLOATING_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } });
const lines = n => Array.from({ length: n }, (_, i) => `<p>Ligne ${i + 1} du document pour le faire défiler.</p>`).join('');
const DOC = `<h1>Convention</h1><p>Entre les soussignés.</p><h2>Article 1</h2>${lines(10)}<h2>Article 2</h2>${lines(10)}<h2>Article 3</h2>${lines(10)}`;
const TC_DOC = '<h1>Titre</h1><p>Alpha <ins data-id="3">ajouté</ins> bêta <del data-id="1">retiré</del> gamma.</p><p>Un deuxième paragraphe.</p><h2>Sous-titre</h2><p>Fin</p>';
const TC_META = { 1: { author: 'a@example.org', authorName: 'Jean', createdAt: '2026-11-03T09:00:00.000Z' }, 3: { author: 'a@example.org', authorName: 'Jean', createdAt: '2026-11-03T09:05:00.000Z' } };
const EN = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };
const AT = { gauche: 'à gauche', haut: 'en haut', droite: 'à droite', bas: 'en bas' };

// Les meubles : ce qui se pose par-dessus le texte ou entre la barre d'outils et lui.
const FURNITURE = {
  outlineTab: '#v2-outline-tab', outlinePane: '#pp-outline-pane', foldTab: '#v2-bar-fold-tab', findBar: '#pp-find-bar', trackPane: '#pp-track-pane', statePane: '.pp-statepane',
  zoom: '.pp-page-zoom', readingLine: '.pp-reading-line', strip: '.pp-slide-strip', slideImport: '.pp-slide-import', macro: '#macro-return-bar', linked: '#linked-return-bar', fonts: '#pdf-fonts-bar',
  conflict: '#autosave-conflict-banner',
};

// Ce que l'écran montre à cet instant : les contrôles (et le texte des bandeaux) recouverts - par un autre élément à l'un des cinq points essayés, ou par la zone de la barre de GFS -, les paires de meubles qui
// se superposent, et la place de chacun.
const probe = app => app.evaluate((FURN) => {
  const vw = innerWidth;
  const vh = innerHeight;
  const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && !n.closest('[hidden]'); };
  const desc = (n) => { if (!n) return ''; const lab = (n.getAttribute('aria-label') || n.title || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30); return (n.id ? '#' + n.id : n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/)[0] : '')) + (lab ? ' « ' + lab + ' »' : ''); };
  const rect = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const out = { covered: [], overlaps: [], places: {} };
  const zone = typeof GfsBar !== 'undefined' ? GfsBar.zone() : null;
  const controls = Array.from(document.querySelectorAll('button, input, select, textarea, a[href], [role=button], [role=tab], [role=menuitem], .macro-return-text, #autosave-conflict-banner > span')).filter(vis);
  for (const c of controls) {
    if (c.closest('.pp-modal')) continue;
    const r = c.getBoundingClientRect();
    let box = { l: Math.max(r.left, 0), t: Math.max(r.top, 0), r: Math.min(r.right, vw), b: Math.min(r.bottom, vh) };
    // Un contrôle dans une liste qui défile n'est recouvert que par la part que son conteneur lui laisse voir.
    for (let p = c.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const pr = p.getBoundingClientRect(); box = { l: Math.max(box.l, pr.left), t: Math.max(box.t, pr.top), r: Math.min(box.r, pr.right), b: Math.min(box.b, pr.bottom) }; }
    }
    if (box.r - box.l < 3 || box.b - box.t < 3) continue;
    const at = f => [box.l + (box.r - box.l) * f, box.t + (box.b - box.t) * f];
    let hits = 0;
    let by = null;
    for (const [x, y] of [[at(.5)[0], at(.5)[1]], [at(.25)[0], at(.5)[1]], [at(.75)[0], at(.5)[1]], [at(.5)[0], at(.25)[1]], [at(.5)[0], at(.75)[1]]]) {
      const e = document.elementFromPoint(x, y);
      if (e && !c.contains(e) && !e.contains(c)) { hits++; by = e; }
    }
    if (hits) out.covered.push(desc(c) + ' @' + rect(c) + ' recouvert par ' + desc(by));
    if (zone && box.l < zone.x + zone.width - 0.5 && box.r > zone.x + 0.5 && box.t < zone.y + zone.height - 0.5 && box.b > zone.y + 0.5) out.covered.push(desc(c) + ' @' + rect(c) + ' sous la barre de GFS');
  }
  const named = [];
  for (const [name, sel] of Object.entries(FURN)) { const n = document.querySelector(sel); if (n && vis(n)) { named.push([name, n]); out.places[name] = rect(n); } }
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const [an, a] = named[i];
      const [bn, b] = named[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 1 && h > 1) out.overlaps.push(`${an} × ${bn} : ${Math.round(w)}×${Math.round(h)} px`);
    }
  }
  return out;
}, FURNITURE);

const rectOf = (app, selector) => app.evaluate((sel) => { const n = document.querySelector(sel); if (!n || n.getClientRects().length === 0) return null; const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, selector);
const topAt = (app, x, y, selector) => app.evaluate(([px, py, sel]) => { const e = document.elementFromPoint(px, py); const n = document.querySelector(sel); return !!e && !!n && n.contains(e); }, [x, y, selector]);
const realClick = async (page, p) => { await page.mouse.move(p.x - 6, p.y + 4, { steps: 2 }); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.click(p.x, p.y); await sleep(350); };

const dirty = new Set();   // les pages dont le document d'essai a été remplacé (le volet « Modifications » veut des marques) : le prochain `reset` le remet
// Les gestes qui posent chaque état (comme le ferait la personne, sans la souris quand ce n'est pas l'objet de la vérification).
const drive = {
  find: app => app.evaluate(() => FindReplace.open({ replace: false })),
  replace: app => app.evaluate(() => FindReplace.open({ replace: true })),
  outline: app => app.evaluate(() => DocumentOutline.open({ focus: false })),
  track: async (app) => { dirty.add(app); await app.evaluate(([d, m]) => { Editor.setHTML(d, m); }, [TC_DOC, TC_META]); await app.evaluate(() => TrackChangesPane.open()); await sleep(300); },
  fold: app => app.evaluate(() => document.getElementById('v2-bar-fold-tab').click()),
  read: async (app) => { await app.evaluate(() => document.getElementById('btn-mode-read').click()); await sleep(1500); },
  macro: app => app.evaluate(() => { document.getElementById('macro-return-text').textContent = 'Ce modèle a été ouvert depuis le macro-modèle « Courrier ».'; document.getElementById('macro-return-bar').hidden = false; }),
  linked: app => app.evaluate(() => { document.getElementById('linked-return-text').textContent = 'Ce modèle a été ouvert depuis un document.'; document.getElementById('linked-return-bar').hidden = false; }),
  fonts: app => app.evaluate(() => { document.getElementById('pdf-fonts-bar').querySelector('.pp-fonts-bar-text').textContent = 'Trois polices de ce document ne peuvent pas être écrites dans le PDF.'; document.getElementById('pdf-fonts-bar').hidden = false; }),
  conflict: app => app.evaluate(() => { document.getElementById('autosave-conflict-banner').style.display = 'flex'; }),
};
// Remet le widget à l'état de départ entre deux combinaisons : tout fermé, tout caché, l'éditeur à l'écran.
async function reset(app) {
  await app.evaluate(() => {
    if (typeof FindReplace !== 'undefined') FindReplace.close({ focus: false });
    if (typeof DocumentOutline !== 'undefined') DocumentOutline.close({ focus: false });
    if (typeof TrackChangesPane !== 'undefined') TrackChangesPane.closePane({ focus: false });
    if (document.body.classList.contains('pp-bar-folded')) document.getElementById('v2-bar-fold-tab').click();
    ['macro-return-bar', 'linked-return-bar', 'pdf-fonts-bar'].forEach((id) => { document.getElementById(id).hidden = true; });
    document.getElementById('autosave-conflict-banner').style.display = 'none';
    if (document.getElementById('editor-container').style.display === 'none') document.getElementById('btn-mode-edit').click();
  });
  if (dirty.delete(app)) await app.evaluate(html => Editor.setHTML(html), DOC);
  await sleep(300);
}

// Le balayage complet (sans barre de GFS et à son bord gauche, le bord par défaut) puis le balayage court (les autres bords).
const COMBOS = [
  ['base', []], ['recherche', ['find']], ['recherche et remplacer', ['replace']], ['plan', ['outline']], ['plan puis recherche', ['outline', 'find']], ['recherche puis plan', ['find', 'outline']],
  ['volet Modifications', ['track']], ['plan et volet Modifications', ['outline', 'track']], ['recherche et volet Modifications', ['find', 'track']], ['panneau du haut replié', ['fold']],
  ['replié et recherche', ['fold', 'find']], ['replié et plan', ['fold', 'outline']], ['bandeau macro-modèle', ['macro']], ['bandeau et recherche', ['macro', 'find']], ['bandeau polices', ['fonts']],
  ['bandeau conflit', ['conflict']], ['trois bandeaux, recherche et plan', ['conflict', 'macro', 'fonts', 'find', 'outline']], ['Lecture', ['read']], ['Lecture et plan', ['read', 'outline']],
];

const QUICK = COMBOS.filter(([name]) => ['recherche et remplacer', 'plan puis recherche', 'recherche et volet Modifications', 'replié et recherche', 'bandeau et recherche', 'trois bandeaux, recherche et plan', 'Lecture et plan'].includes(name));

async function sweep(ctx, label, bar, combos = COMBOS) {
  const { page, app } = ctx;
  let bad = 0;
  for (const [name, steps] of combos) {
    await reset(app);
    for (const s of steps) { await drive[s](app); await sleep(250); }
    await sleep(150);
    const r = await probe(app);
    if (r.covered.length || r.overlaps.length) { bad++; check(`${label} : ${name} - rien de recouvert`, false, { recouverts: r.covered, superposes: r.overlaps }); }
  }
  check(`${label} : les ${combos.length} combinaisons (recherche, plan, volet Modifications, replié, bandeaux, Lecture) : aucun contrôle recouvert, aucune paire de meubles superposée${bar ? ', rien sous la barre de GFS' : ''}`, bad === 0, bad);
  await reset(app);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1) La recherche et les languettes, sans GFS, à la vraie souris.
async function languettes(lang, colorScheme) {
  const fr = lang === 'fr';
  const L = `[${lang} ${colorScheme}]`;
  const ctx = await t.openPage({ hosted: false, lang, colorScheme, seed: SEED });
  const { page, app } = ctx;
  await app.evaluate(html => Editor.setHTML(html), DOC);
  await sleep(700);

  const before = { tab: await rectOf(app, '#v2-outline-tab'), fold: await rectOf(app, '#v2-bar-fold-tab') };
  await app.evaluate(() => FindReplace.open({ replace: false }));
  await sleep(400);
  const bar = await rectOf(app, '#pp-find-bar');
  const toggle = await rectOf(app, '#pp-find-toggle-replace');
  const input = await rectOf(app, '.pp-find-input');
  const tab = await rectOf(app, '#v2-outline-tab');
  const fold = await rectOf(app, '#v2-bar-fold-tab');
  const box = await rectOf(app, '#editor-container');
  check(`${L} la barre de recherche est ouverte, entre la barre d'outils et le texte, et le texte commence sous elle`, !!bar && !!toggle && !!input && Math.abs(box.top - bar.bottom) < 1, { bar, box });
  check(`${L} les languettes pendent SOUS la barre de recherche (plan : haut ${Math.round(tab.top)} ≥ bas de la barre ${Math.round(bar.bottom)} ; panneau du haut : ${Math.round(fold.top)})`, tab.top >= bar.bottom - 0.5 && fold.top >= bar.bottom - 0.5, { tab, fold, bar });
  check(`${L} aucune languette ne recouvre le chevron « Remplacer par » ni le champ de recherche`, (tab.right <= toggle.left || tab.left >= toggle.right || tab.bottom <= toggle.top || tab.top >= toggle.bottom) && fold.top >= input.bottom - 0.5, { tab, fold, toggle, input });
  check(`${L} le centre du chevron et le haut du champ reçoivent bien le clic (rien dessus)`, (await topAt(app, toggle.cx, toggle.cy, '#pp-find-toggle-replace')) && (await topAt(app, fold.cx, input.top + 3, '.pp-find-input')), { toggle, fold, input });
  await shot(page, `${colorScheme}-${lang}-1-recherche-ouverte`);

  // Le chevron, au vrai clic : la ligne de remplacement se montre puis se cache.
  await realClick(page, { x: toggle.cx, y: toggle.cy });
  const opened = await app.evaluate(() => ({ expanded: document.getElementById('pp-find-toggle-replace').getAttribute('aria-expanded'), row: !document.getElementById('pp-find-replace-row').hidden }));
  check(`${L} un vrai clic sur le chevron montre la ligne « Remplacer par »`, opened.expanded === 'true' && opened.row, opened);
  const tabWith = await rectOf(app, '#v2-outline-tab');
  const barWith = await rectOf(app, '#pp-find-bar');
  check(`${L} la ligne de remplacement ouverte, la languette suit le bas de la barre (${Math.round(tabWith.top)} ≥ ${Math.round(barWith.bottom)})`, tabWith.top >= barWith.bottom - 0.5, { tabWith, barWith });
  await shot(page, `${colorScheme}-${lang}-2-remplacer-ouvert`);
  await realClick(page, { x: toggle.cx, y: toggle.cy });
  const closed = await app.evaluate(() => document.getElementById('pp-find-replace-row').hidden);
  check(`${L} un second vrai clic sur le chevron cache la ligne`, closed === true);

  // Le champ, à la place où la languette du panneau le mordait : le clavier y arrive et le panneau reste déplié.
  await app.evaluate(() => document.activeElement && document.activeElement.blur());
  await realClick(page, { x: fold.cx, y: input.top + 4 });
  const typed = await app.evaluate(() => ({ field: document.activeElement && document.activeElement.id, folded: document.body.classList.contains('pp-bar-folded') }));
  check(`${L} un vrai clic sur le champ, sous l'ancienne place de la languette du panneau, y pose le clavier sans replier le panneau`, typed.field === 'pp-find-input' && !typed.folded, typed);

  // La languette du plan, au vrai clic, la recherche ouverte : le volet est sous la barre (la languette a suivi la ligne de remplacement refermée : on la remesure).
  const tabNow = await rectOf(app, '#v2-outline-tab');
  await realClick(page, { x: tabNow.cx, y: tabNow.cy });
  const pane = await rectOf(app, '#pp-outline-pane');
  const boxNow = await rectOf(app, '#editor-container');
  const barNow = await rectOf(app, '#pp-find-bar');
  check(`${L} un vrai clic sur la languette du plan l'ouvre, la recherche ouverte : le volet commence sous la barre (${pane && Math.round(pane.top)} ≥ ${Math.round(barNow.bottom)})`, !!pane && pane.top >= barNow.bottom - 0.5 && Math.abs(pane.top - boxNow.top) < 1, { pane, barNow, boxNow });
  const keep = await probe(app);
  check(`${L} recherche et plan ouverts ensemble : rien de recouvert`, keep.covered.length === 0 && keep.overlaps.length === 0, keep);
  await shot(page, `${colorScheme}-${lang}-3-recherche-et-plan`);

  // La recherche fermée (Échap), les languettes reprennent leur place d'avant.
  await app.evaluate(() => DocumentOutline.close({ focus: false }));
  await app.evaluate(() => { const input = document.getElementById('pp-find-input'); input.focus(); });
  await page.keyboard.press('Escape');
  await sleep(400);
  const after = { tab: await rectOf(app, '#v2-outline-tab'), fold: await rectOf(app, '#v2-bar-fold-tab') };
  check(`${L} la recherche fermée, les deux languettes retrouvent leur place d'avant`, !!after.tab && !!after.fold && Math.abs(after.tab.top - before.tab.top) < 1 && Math.abs(after.fold.top - before.fold.top) < 1 && Math.abs(after.tab.left - before.tab.left) < 1, { before, after });

  await sweep(ctx, `${L} sans barre de GFS`, false, fr ? COMBOS : QUICK);
  await ctx.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2) La barre de GFS : la recherche et les bandeaux lui cèdent la place, sans rien poser quand elle ne les touche pas.
async function barresDeGfs(boutons) {
  const L = `[GFS, barre de ${boutons} boutons]`;
  const ctx = await t.openPage({ hosted: true, framed: true, lang: 'fr', colorScheme: 'light', seed: SEED, stub: { barre: null } });
  const { page, app } = ctx;
  await app.evaluate(html => Editor.setHTML(html), DOC);
  await sleep(700);
  const setBar = async (bord) => {
    const bar = bord === null ? null : await page.evaluate(([b, n]) => window.__gfsStub.zoneDe(b, 700, 400, n), [bord, boutons]);
    await page.evaluate(next => window.__gfsStub.setBarre(next), bar);
    await app.waitForFunction(want => document.documentElement.getAttribute('data-gfs-bar') === want, bord === null ? null : EN[bord], { timeout: 5000 });
    await sleep(300);
    return bar;
  };
  const paddings = selector => app.evaluate((sel) => { const n = document.querySelector(sel); return { left: n.style.paddingLeft, right: n.style.paddingRight, top: n.style.paddingTop }; }, selector);
  const hitsZone = (r, bar) => !!bar && r.left < bar.zone.x + bar.zone.largeur - 0.02 && r.right > bar.zone.x + 0.02 && r.top < bar.zone.y + bar.zone.hauteur - 0.02 && r.bottom > bar.zone.y + 0.02;

  // La recherche, une ligne puis avec « Remplacer par » : aux quatre bords et sans barre.
  for (const bord of boutons === 4 ? [null, 'gauche', 'droite', 'haut', 'bas'] : ['gauche', 'droite']) {
    await reset(app);
    const bar = await setBar(bord);
    const label = `${L} ${bord === null ? 'sans barre' : 'barre ' + AT[bord]}`;
    await drive.find(app);
    await sleep(400);
    for (const rows of ['une ligne', 'avec « Remplacer par »']) {
      if (rows !== 'une ligne') { await drive.replace(app); await sleep(400); }
      const found = await app.evaluate(() => {
        const rc = (n) => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
        const controls = Array.from(document.querySelectorAll('#pp-find-bar button, #pp-find-bar input')).filter(n => !n.closest('[hidden]')).map(n => ({ id: n.id || n.className, rect: rc(n) }));
        return { bar: rc(document.getElementById('pp-find-bar')), controls };
      });
      const under = found.controls.filter(c => hitsZone(c.rect, bar)).map(c => c.id);
      check(`${label}, recherche ${rows} : aucun de ses ${found.controls.length} boutons et champs sous la barre de GFS`, under.length === 0, { sous: under, zone: bar && bar.zone });
      const pads = await paddings('#pp-find-bar');
      const side = bar && hitsZone(found.bar, bar) ? (bar.bord === 'gauche' ? 'left' : bar.bord === 'droite' ? 'right' : null) : null;
      const expected = { left: side === 'left' ? Math.ceil(bar.zone.largeur) + 'px' : '', right: side === 'right' ? Math.ceil(bar.zone.largeur) + 'px' : '' };
      check(`${label}, recherche ${rows} : ${side ? 'retrait de ' + expected[side] + ' du côté de la barre' : 'rien de posé (la barre ne touche pas sa ligne)'}`, pads.left === expected.left && pads.right === expected.right && pads.top === '', { pads, expected });
    }
    if (bord === 'gauche') await shot(page, `gfs-${boutons}-gauche-recherche`);
    // Elle ferme : la barre, elle, ne laisse rien de posé sur la ligne cachée ; la barre de GFS partie, la ligne rendue.
    await app.evaluate(() => FindReplace.close({ focus: false }));
    await sleep(250);
  }
  await setBar(null);
  await drive.find(app);
  await sleep(300);
  const clean = await paddings('#pp-find-bar');
  check(`${L} la barre de GFS retirée, la recherche ouverte n'a plus aucun retrait`, clean.left === '' && clean.right === '', clean);
  await app.evaluate(() => FindReplace.close({ focus: false }));

  // Les bandeaux : chacun, aux quatre bords.
  const BANDS = [['macro', '#macro-return-bar', 'macro-modèle'], ['linked', '#linked-return-bar', 'document lié'], ['fonts', '#pdf-fonts-bar', 'polices du PDF'], ['conflict', '#autosave-conflict-banner', 'conflit d\'enregistrement']];
  for (const [step, selector, name] of BANDS) {
    for (const bord of boutons === 4 ? ['gauche', 'droite', 'haut', 'bas', null] : ['gauche', 'droite']) {
      await reset(app);
      const bar = await setBar(bord);
      await drive[step](app);
      await sleep(450);
      const found = await app.evaluate((sel) => {
        const band = document.querySelector(sel);
        const rc = (n) => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
        const parts = Array.from(band.querySelectorAll('button, span')).filter(n => n.getClientRects().length > 0 && n.textContent.trim()).map(n => ({ id: (n.id || n.className || n.tagName).toString().slice(0, 30), rect: rc(n) }));
        return { band: rc(band), parts, left: band.style.paddingLeft, right: band.style.paddingRight, top: band.style.paddingTop };
      }, selector);
      const label = `${L} bandeau ${name}, ${bord === null ? 'sans barre' : 'barre ' + AT[bord]}`;
      const under = found.parts.filter(c => hitsZone(c.rect, bar)).map(c => c.id);
      check(`${label} : ni son texte ni son bouton sous la barre de GFS`, under.length === 0, { sous: under, zone: bar && bar.zone, bandeau: found.band });
      const side = bar && hitsZone(found.band, bar) ? (bar.bord === 'gauche' ? 'left' : bar.bord === 'droite' ? 'right' : null) : null;
      const expected = { left: side === 'left' ? Math.ceil(bar.zone.largeur) + 'px' : '', right: side === 'right' ? Math.ceil(bar.zone.largeur) + 'px' : '' };
      check(`${label} : ${side ? 'retrait de ' + expected[side] + ' du côté de la barre' : 'rien de posé'}`, found.left === expected.left && found.right === expected.right && found.top === '', { found, expected });
      if (step === 'macro' && (bord === 'gauche' || bord === 'droite')) await shot(page, `gfs-${boutons}-${bord}-bandeau-macro`);
    }
  }

  // Le panneau du haut replié, la barre de GFS en haut : la barre de recherche est alors tout en haut du cadre, sous la zone ; elle descend d'autant (retrait en haut), le champ et « Remplacer par » ne sont plus
  // sous la barre ; la barre partie, ou le panneau déplié, le retrait part.
  await reset(app);
  await setBar('haut');
  await drive.fold(app);
  await drive.replace(app);
  await sleep(450);
  {
    const zone = (await page.evaluate(([b, n]) => window.__gfsStub.zoneDe(b, 700, 400, n), ['haut', boutons]));
    const found = await app.evaluate(() => { const rc = (n) => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }; const bar = document.getElementById('pp-find-bar'); return { bar: rc(bar), top: bar.style.paddingTop, fields: Array.from(bar.querySelectorAll('input, button')).filter(n => n.getClientRects().length > 0).map(n => rc(n)) }; });
    check(`${L} panneau du haut replié, barre de GFS en haut : la recherche (tout en haut du cadre) se pose sous la zone - retrait en haut, aucun champ ni bouton sous la barre`, found.top !== '' && found.fields.every(r => !hitsZone(r, zone)), { retrait: found.top, zone: zone.zone, barre: found.bar });
    await shot(page, `gfs-${boutons}-haut-replie-recherche`);
    await setBar(null);
    const gone = await paddings('#pp-find-bar');
    check(`${L} la barre de GFS partie, le retrait en haut de la recherche part avec elle`, gone.top === '' && gone.left === '' && gone.right === '', gone);
    await setBar('haut');
    await drive.fold(app);
    await sleep(350);
    const unfolded = await paddings('#pp-find-bar');
    check(`${L} le panneau du haut déplié (la barre de GFS en haut est sur la barre d'outils), la recherche n'a plus de retrait`, unfolded.top === '', unfolded);
  }

  // La barre qui change de bord bandeau ouvert : le retrait suit, sans rien rouvrir.
  await reset(app);
  await drive.macro(app);
  await setBar('gauche');
  const g = await paddings('#macro-return-bar');
  await setBar('droite');
  const d = await paddings('#macro-return-bar');
  await setBar('haut');
  const h = await paddings('#macro-return-bar');
  await setBar(null);
  const n = await paddings('#macro-return-bar');
  check(`${L} la barre passe de gauche à droite, en haut, puis part, le bandeau ouvert : le retrait la suit (gauche, droite, rien, rien)`, g.left !== '' && g.right === '' && d.right !== '' && d.left === '' && h.left === '' && h.right === '' && n.left === '' && n.right === '', { g, d, h, n });

  // Le balayage, aux quatre bords.
  for (const bord of boutons === 4 ? [null, 'gauche', 'droite', 'haut', 'bas'] : ['gauche', 'droite']) {
    const bar = await setBar(bord);
    await sweep(ctx, `${L} ${bord === null ? 'sans barre' : 'barre ' + AT[bord]}`, bar, boutons === 4 && bord === 'gauche' ? COMBOS : QUICK);
  }
  await ctx.context.close();
}

// Les quatre parcours sont indépendants (une page chacun) : ils se jouent ensemble.
await Promise.all([languettes('fr', 'light'), languettes('en', 'dark'), barresDeGfs(4), barresDeGfs(5)]);
await t.finish();
