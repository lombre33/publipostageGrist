#!/usr/bin/env node
// Le panneau du haut replié par une languette (js/bar-fold.js, css/bar-fold.css) à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard, Node/Playwright) et à la taille du panneau
// Grist d'Antoine (~700x400), en thème clair puis sombre - demande du 10/11 : « pouvoir, y compris en mode éditeur, replier le panneau d'en haut, n'avoir que le texte pour gagner de la place
// en hauteur » ; ses choix : une languette sous la barre, qui replie TOUT le panneau.
// dev-tests/scenarios-bar-fold.js vérifie la structure et les états DANS la page (clics et touches synthétiques) ; ici, ce qui se mesure aux PIXELS et au geste réel :
//  1) LA LANGUETTE panneau déplié : au milieu, juste sous le panneau, sans rien cacher de la barre ni du texte du haut, lisible (≥ 4,5:1) ;
//  2) UN VRAI CLIC la replie : le texte prend toute la hauteur du panneau de Grist (autant de pixels que le panneau en faisait), plus rien du panneau ne reçoit la souris, le curseur reste dans le texte
//     (une lettre tapée au vrai clavier s'y écrit), la languette est restée accrochée en haut ; un second clic rend exactement la mise en page d'avant ;
//  3) CTRL+MAJ+F au vrai clavier replie et déplie, depuis le texte ; replié, la touche d'une action qui clique un bouton de la barre (Alt+Maj+H, le surlignage) agit encore sur le texte ;
//  4) UNE ALERTE du coin d'état (erreur, non enregistré) panneau replié : la languette s'élargit et la dit, lisible, sans sortir du panneau de Grist ;
//  5) LA LECTURE ÉPURÉE depuis le panneau replié : la languette disparaît avec tout le reste, la sortie la rend, panneau toujours replié ;
//  6) LA BARRE DE GFS (consigne 025) aux quatre bords, panneau déplié puis replié : la languette ne recouvre jamais sa zone (elle glisse de côté en haut, là où elle se trouve une fois replié), reste dans le cadre,
//     un vrai clic à sa nouvelle place la bascule, et la barre partie elle revient où elle était.
//  7) LA BARRE DE L'IMAGE panneau replié : une image sous un paragraphe reçoit sa barre au-dessus d'elle (js/floating-toolbars.js ne fait plus éviter le panneau invisible) ; déplié, rien ne change.
// BAR_FOLD_SHOTS=<dossier> y range une capture par étape (à regarder - aucune vérification n'en dépend) ; BAR_FOLD_ONLY=<1..7> n'en joue qu'une. Lancé par run-headless.mjs (groupe Node « barFoldMouse »,
// cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-bar-fold-mouse.mjs
import { mkdir } from 'node:fs/promises';
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-bar-fold-mouse', port: Number(process.env.BAR_FOLD_MOUSE_PORT || 8967) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.BAR_FOLD_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const ONLY = (process.env.BAR_FOLD_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));
const SEED = seedModels();
const FRAME = [700, 400];

const round = n => Math.round(n * 10) / 10;
const showRect = r => [r.left, r.top, r.right, r.bottom].map(round).join(', ');
const crosses = (a, b) => a.left < b.right - 0.02 && a.right > b.left + 0.02 && a.top < b.bottom - 0.02 && a.bottom > b.top + 0.02;
const inFrame = (r, [w, h]) => r.left >= -0.5 && r.top >= -0.5 && r.right <= w + 0.5 && r.bottom <= h + 0.5;

const LONG = '<p>Bonjour, voici le contrat de location.</p>' + Array.from({ length: 40 }, (_, i) => '<p>Paragraphe ' + (i + 1) + ' du contrat de location : une phrase assez longue pour que la ligne aille jusqu’au bord droit de la feuille, et que le texte passe sous la languette quand on fait défiler le document.</p>').join('');

const rectOf = (app, selector) => app.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
}, selector);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, r) {
  const x = (r.left + r.right) / 2;
  const y = (r.top + r.bottom) / 2;
  await page.mouse.move(x - 12, y + 18, { steps: 2 });
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.click(x, y);
  await sleep(250);
  // Le pointeur repart du haut : une fois le panneau déplié, il serait sur un bouton de la barre dont le menu au survol s'ouvrirait sur la languette.
  await page.mouse.move(6, 394);
  await sleep(150);
}
const state = app => app.evaluate(() => {
  const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const tab = document.getElementById('v2-bar-fold-tab');
  return { folded: BarFold.isFolded(), bodyClass: document.body.classList.contains('pp-bar-folded'), tab: r('v2-bar-fold-tab'), bar: r('toolbar-top'), editor: r('editor-container'), expanded: tab.getAttribute('aria-expanded'),
    barVisibility: getComputedStyle(document.getElementById('toolbar-top')).visibility, translate: tab.style.translate, label: tab.getAttribute('aria-label') };
});
const hitTab = (app, r) => app.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && (el.id === 'v2-bar-fold-tab' || !!el.closest('#v2-bar-fold-tab')); }, [(r.left + r.right) / 2, (r.top + r.bottom) / 2]);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function runPanel(colorScheme) {
  const tag = `${colorScheme === 'dark' ? 'sombre' : 'clair'}`;
  console.log(`\n=== 1-5) La languette à 700 × 400, thème ${tag} ===`);
  const ctx = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', colorScheme });
  const { page, app } = ctx;
  await app.evaluate((html) => { Editor.setHTML(html); }, LONG);
  await sleep(500);

  if (wanted(1)) {
    const s = await state(app);
    const textTop = await app.evaluate(() => { const p = document.querySelector('.tiptap p'); return p ? p.getBoundingClientRect().top : null; });
    await shot(page, `${tag}-1-deplie`);
    check(`${tag} 1 : le panneau est déplié et la languette est au milieu, juste sous lui`, !s.folded && !s.bodyClass && s.expanded === 'true' && Math.abs((s.tab.left + s.tab.right) / 2 - 350) < 1.5 && Math.abs(s.tab.top - s.bar.bottom) < 1.5, s);
    check(`${tag} 1 : la languette est petite (48 × 14 px) et dans le panneau de Grist`, Math.abs(s.tab.width - 48) < 0.6 && Math.abs(s.tab.height - 14) < 0.6 && inFrame(s.tab, FRAME), s.tab);
    check(`${tag} 1 : elle ne couvre aucun bouton de la barre (elle commence là où la barre finit) ni la première ligne du texte`, s.tab.top >= s.bar.bottom - 1.5 && textTop !== null && textTop >= s.tab.bottom, { tab: s.tab, bar: s.bar, textTop });
    check(`${tag} 1 : un vrai pointeur à son centre tombe sur elle`, await hitTab(app, s.tab));
    const contrast = await contrastOf(page, '#v2-bar-fold-tab');
    check(`${tag} 1 : son chevron se lit (contraste ${contrast}, au moins 4,5:1)`, contrast >= 4.5, contrast);
    check(`${tag} 1 : le panneau fait ses quatre lignes à 700 px (≈ 151 px sur 400) et ne laisse au texte que ≈ 249 px`, s.bar.height > 140 && s.editor.height < 260, { bar: s.bar.height, editor: s.editor.height });
  }

  if (wanted(2)) {
    const before = await state(app);
    // Le curseur d'abord dans le texte (un vrai clic), puis un vrai clic sur la languette.
    const para = await rectOf(app, '.tiptap p');
    await page.mouse.click(para.left + 40, para.top + 8);
    await sleep(150);
    await realClick(page, before.tab);
    const folded = await state(app);
    await shot(page, `${tag}-2-replie`);
    check(`${tag} 2 : un vrai clic replie le panneau`, folded.folded && folded.bodyClass && folded.expanded === 'false' && /^Déplier/.test(folded.label), folded);
    check(`${tag} 2 : le texte prend tout le panneau de Grist (de 0 à 400 px) et gagne la hauteur du panneau`, folded.editor.top === 0 && Math.abs(folded.editor.height - 400) < 0.6 && Math.abs((folded.editor.height - before.editor.height) - before.bar.height) < 1.5, { avant: before.editor, apres: folded.editor, barre: before.bar });
    check(`${tag} 2 : la languette est restée accrochée en haut du panneau de Grist, au milieu`, folded.tab.top === 0 && Math.abs((folded.tab.left + folded.tab.right) / 2 - 350) < 1.5 && await hitTab(app, folded.tab), folded.tab);
    check(`${tag} 2 : le panneau est invisible et la souris le traverse (aucun de ses éléments sous les anciens boutons)`, folded.barVisibility === 'hidden' && await app.evaluate(() => {
      const probes = ['btn-save', 'btn-mode-edit', 'v2-btn-bold', 'btn-mode-read'].map(id => document.getElementById(id)).filter(Boolean);
      return probes.every((b) => { const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !at || !document.getElementById('toolbar-top').contains(at); });
    }));
    // Le curseur est resté dans le texte : une lettre tapée au vrai clavier s'y écrit, à l'endroit du clic.
    await page.keyboard.type('Zq');
    await sleep(200);
    const typed = await app.evaluate(() => document.querySelector('.tiptap p').textContent.includes('Zq'));
    check(`${tag} 2 : le curseur est resté dans le texte (« Zq » tapé au vrai clavier s'y écrit)`, typed);
    // Défiler : la languette ne bouge pas, et un vrai clic la déplie.
    await page.mouse.move(350, 250);
    await page.mouse.wheel(0, 300);
    await sleep(300);
    const scrolled = await state(app);
    check(`${tag} 2 : le document défile sous la languette, qui reste en place`, scrolled.tab.top === 0 && Math.abs(scrolled.tab.left - folded.tab.left) < 0.6, scrolled.tab);
    await realClick(page, scrolled.tab);
    await app.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
    await sleep(200);
    const back = await state(app);
    await shot(page, `${tag}-2-redeplie`);
    check(`${tag} 2 : un second vrai clic rend la mise en page d'avant, à la ligne près (panneau, languette, texte)`, !back.folded && back.barVisibility === 'visible' && Math.abs(back.bar.height - before.bar.height) < 0.6 && Math.abs(back.editor.top - before.editor.top) < 0.6 && Math.abs(back.editor.height - before.editor.height) < 0.6 && Math.abs(back.tab.top - before.tab.top) < 0.6, { avant: before, apres: back });
  }

  if (wanted(3)) {
    // Ctrl+Maj+F au vrai clavier, le curseur dans le texte.
    const para = await rectOf(app, '.tiptap p');
    await page.mouse.click(para.left + 60, para.top + 8);
    await sleep(150);
    await page.keyboard.press('Control+Shift+F');
    await sleep(250);
    const one = await state(app);
    await page.keyboard.press('Control+Shift+F');
    await sleep(250);
    const two = await state(app);
    await page.keyboard.press('Control+Shift+F');
    await sleep(250);
    const three = await state(app);
    check(`${tag} 3 : Ctrl+Maj+F au vrai clavier replie, déplie, replie`, one.folded && !two.folded && three.folded, { one: one.folded, two: two.folded, three: three.folded });
    // Replié : le surlignage (Alt+Maj+H) est une action qui clique un bouton de la barre ; il doit encore agir sur le texte sélectionné.
    const word = await app.evaluate(() => {
      const editor = EditorCore.getEditor();
      let at = -1;
      editor.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text.includes('contrat')) at = pos + node.text.indexOf('contrat'); });
      editor.chain().focus().setTextSelection({ from: at, to: at + 7 }).run();
      return at;
    });
    await page.keyboard.press('Alt+Shift+H');
    await sleep(300);
    const marked = await app.evaluate(() => /<mark|background-color/.test(EditorCore.getEditor().getHTML()));
    check(`${tag} 3 : replié, Alt+Maj+H (la touche d'une action qui clique un bouton de la barre) surligne encore le texte sélectionné`, word > 0 && marked, { word, marked });
    await page.keyboard.press('Control+Shift+F');
    await sleep(250);
    const four = await state(app);
    check(`${tag} 3 : le même Ctrl+Maj+F rend le panneau`, !four.folded && four.barVisibility === 'visible', four);
    await app.evaluate(() => { EditorCore.getEditor().commands.undo(); });
  }

  if (wanted(4)) {
    // Une alerte du coin d'état, panneau replié : la languette la dit.
    await app.evaluate(() => { BarFold.set(true); });
    await sleep(200);
    await app.evaluate(() => { const s = document.getElementById('status-msg'); s.textContent = 'Grist a refusé d’écrire dans ce modèle.'; s.className = 'error-msg'; });
    await sleep(200);
    const s = await state(app);
    await shot(page, `${tag}-4-alerte`);
    const contrast = await contrastOf(page, '#v2-bar-fold-tab');
    check(`${tag} 4 : l'erreur du coin d'état s'écrit dans la languette, qui s'élargit sans sortir du panneau de Grist`, s.tab.width > 150 && inFrame(s.tab, FRAME) && Math.abs((s.tab.left + s.tab.right) / 2 - 350) < 1.5 && s.tab.top === 0, s.tab);
    check(`${tag} 4 : l'alerte se lit (contraste ${contrast}, au moins 4,5:1)`, contrast >= 4.5, contrast);
    await realClick(page, s.tab);
    const open = await state(app);
    check(`${tag} 4 : un vrai clic sur la languette élargie déplie le panneau (où l'alerte se lit dans son coin)`, !open.folded, open);
    await app.evaluate(() => { const st = document.getElementById('status-msg'); st.textContent = ''; st.className = ''; });
  }

  if (wanted(5)) {
    // La Lecture épurée depuis le panneau replié.
    await app.evaluate(() => { BarFold.set(true); CleanReading.choose('clean'); });
    await app.evaluate(() => document.getElementById('btn-mode-read').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })));
    await app.waitForFunction(() => CleanReading.isActive(), null, { timeout: 6000 });
    await sleep(300);
    const clean = await app.evaluate(() => ({ tabDisplay: getComputedStyle(document.getElementById('v2-bar-fold-tab')).display, wrapperDisplay: getComputedStyle(document.getElementById('v2-bar-fold')).display, exit: getComputedStyle(document.getElementById('btn-exit-clean-reading')).display, folded: BarFold.isFolded() }));
    await shot(page, `${tag}-5-epuree`);
    check(`${tag} 5 : la Lecture épurée cache la languette avec tout le reste, le bouton de sortie est seul`, clean.wrapperDisplay === 'none' && clean.exit !== 'none' && clean.folded, clean);
    const exit = await rectOf(app, '#btn-exit-clean-reading');
    await realClick(page, exit);
    await app.waitForFunction(() => !CleanReading.isActive(), null, { timeout: 6000 });
    await sleep(300);
    const out = await state(app);
    check(`${tag} 5 : la sortie de la Lecture épurée rend le panneau replié, la languette visible en haut`, out.folded && out.barVisibility === 'hidden' && out.tab.top === 0 && await hitTab(app, out.tab), out);
    await app.evaluate(() => { CleanReading.choose('simple'); BarFold.set(false); });
  }
  await ctx.context.close();
}

if (wanted(1) || wanted(2) || wanted(3) || wanted(4) || wanted(5)) { await runPanel('light'); await runPanel('dark'); }

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 7) La barre de l'image n'évite plus le panneau du haut quand il est replié (js/floating-toolbars.js:topBarRowsBottom).
// Une barre d'image posée au-dessus d'une image n'a pas le droit de recouvrir les boutons de la barre du haut : elle se pose SOUS l'image quand elle n'a pas la place entre le bas de la dernière rangée de la
// barre et l'image. Replié, le panneau garde ses boutons en place mais ne se voit plus : une image juste sous un paragraphe, à 70 px du haut, a la place de recevoir sa barre au-dessus d'elle.
if (wanted(7)) {
  console.log('\n=== 7) La barre de l\'image, panneau replié, 700 × 400 ===');
  const ctx = await t.openPage({ hosted: false, seed: SEED, lang: 'fr' });
  const { page, app } = ctx;
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#c33"/></svg>').toString('base64');
  await app.evaluate((src) => { Editor.setHTML('<p>Avant</p><p><img class="editor-image" src="' + src + '" alt="" style="width: 200px"></p><p>Après</p>'); }, svg);
  await sleep(500);
  const barState = async () => {
    const image = await rectOf(app, '.tiptap img.editor-image');
    await page.mouse.click((image.left + image.right) / 2, (image.top + image.bottom) / 2);
    await sleep(400);
    return app.evaluate(() => {
      const bar = document.querySelector('.v2-image-toolbar.visible');
      const img = document.querySelector('.tiptap img.editor-image').getBoundingClientRect();
      if (!bar) return null;
      const b = bar.getBoundingClientRect();
      return { barTop: b.top, barBottom: b.bottom, imageTop: img.top, imageBottom: img.bottom };
    });
  };
  await app.evaluate(() => { BarFold.set(true); });
  await sleep(300);
  const folded = await barState();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/7-barre-image-repliee.png` });
  check('panneau replié, image sous un paragraphe : la barre de l\'image se pose AU-DESSUS de l\'image (le panneau, invisible, n\'est plus rien à éviter)', !!folded && folded.barBottom <= folded.imageTop && folded.barTop >= 0 && folded.imageTop < 150, folded);
  await page.mouse.click(350, 380);
  await app.evaluate(() => { BarFold.set(false); });
  await sleep(300);
  const open = await barState();
  check('panneau déplié, la même image : la barre est toujours au-dessus de l\'image et ne recouvre aucun bouton de la barre du haut', !!open && open.barBottom <= open.imageTop && await app.evaluate(() => {
    const bar = document.querySelector('.v2-image-toolbar.visible').getBoundingClientRect();
    return ![...document.querySelectorAll('#toolbar-top button')].some(b => { const r = b.getBoundingClientRect(); return b.getClientRects().length && !b.closest('.v2-hover-flyout') && r.left < bar.right && r.right > bar.left && r.top < bar.bottom && r.bottom > bar.top; });
  }), open);
  await ctx.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 6) La barre de GFS : sa zone n'est jamais recouverte par la languette, déplié comme replié.
const EDGES = ['gauche', 'haut', 'droite', 'bas'];
const EN = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };
const barOf = (page, bord, width, height) => (bord === null ? null : page.evaluate(([b, w, h]) => window.__gfsStub.zoneDe(b, w, h), [bord, width, height]));
async function showBar(page, app, bord, [width, height]) {
  const bar = await barOf(page, bord, width, height);
  await page.evaluate(next => window.__gfsStub.setBarre(next), bar);
  await app.waitForFunction(want => document.documentElement.getAttribute('data-gfs-bar') === want, bord === null ? null : EN[bord], { timeout: 5000 });
  await sleep(250);
  return bar;
}
const zoneRect = bar => (bar ? { left: bar.zone.x, top: bar.zone.y, right: bar.zone.x + bar.zone.largeur, bottom: bar.zone.y + bar.zone.hauteur } : null);

if (wanted(6)) {
  console.log('\n=== 6) La languette et la barre de GFS à 700 × 400 ===');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  const { page, app } = ctx;
  await showBar(page, app, null, FRAME);
  await app.evaluate(() => { BarFold.set(false); });
  await sleep(150);
  const origin = { open: (await state(app)).tab };
  await app.evaluate(() => { BarFold.set(true); });
  await sleep(200);
  origin.folded = (await state(app)).tab;
  await app.evaluate(() => { BarFold.set(false); });
  for (const bord of [...EDGES, null]) {
    const bar = await showBar(page, app, bord, FRAME);
    const zone = zoneRect(bar);
    const where = bord === null ? 'sans barre' : `barre ${bord}`;
    for (const folded of [false, true]) {
      await app.evaluate(f => { BarFold.set(f); }, folded);
      await sleep(250);
      const s = await state(app);
      const label = `GFS, ${where}, panneau ${folded ? 'replié' : 'déplié'}`;
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/gfs-${bord || 'aucune'}-${folded ? 'replie' : 'deplie'}.png` });
      check(`${label} : la languette ne recouvre pas la zone de la barre`, !zone || !crosses(s.tab, zone), { languette: showRect(s.tab), zone });
      check(`${label} : elle reste dans le cadre`, inFrame(s.tab, FRAME), showRect(s.tab));
      const was = folded ? origin.folded : origin.open;
      if (bord === 'haut' && folded) check(`${label} : la zone tombe sur le milieu du bord haut : la languette a glissé de côté (propriété translate de GfsBar.keepClear)`, s.translate !== '', { translate: s.translate, languette: showRect(s.tab) });
      if (bord === 'haut' && !folded) check(`${label} : la zone est loin de la languette (sous le panneau) : elle n'a pas bougé`, s.translate === '', s.translate);
      if (bord === null) check(`${label} : la barre partie, elle est où elle était (rien de décalé)`, Math.abs(s.tab.left - was.left) < 0.6 && Math.abs(s.tab.top - was.top) < 0.6 && s.translate === '', { languette: showRect(s.tab), avant: showRect(was), translate: s.translate });
      // Un vrai clic à sa place la bascule (le pointeur au centre tombe sur elle).
      if (await hitTab(app, s.tab)) {
        await realClick(page, s.tab);
        const after = await state(app);
        check(`${label} : un vrai clic à sa place la ${folded ? 'déplie' : 'replie'}`, after.folded === !folded, { avant: folded, apres: after.folded });
        await app.evaluate(f => { BarFold.set(f); }, folded);
        await sleep(200);
      } else {
        check(`${label} : un vrai pointeur au centre de la languette tombe sur elle`, false, showRect(s.tab));
      }
    }
    await app.evaluate(() => { BarFold.set(false); });
  }
  await ctx.context.close();
}

await t.finish();
