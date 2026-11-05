// Le menu Alignement (survol du bouton), le menu « Aa » des réglages de caractère (sans fenêtre, depuis le 04/11) et la fenêtre « Paragraphe… » : le vrai widget, la vraie souris.
// Le document est un modèle de démonstration (« Caractères ») où chaque ligne porte un des réglages du menu ; rien n'est dessiné à la main.
import { openWidget, seedModel, idle, shot, sleep, done, click, clickMenuRow, hoverMenuRow, rectOf } from './kit.mjs';
const W = 1280, H = 800;
const center = (inner) => `<p style="text-align: center">${inner}</p>`;
const size = (pt, inner, extra = '') => `<span style="font-size: ${pt}pt${extra ? '; ' + extra : ''}">${inner}</span>`;
const html = [
  center(size(24, '<strong>Ce que règle le menu « Aa »</strong>')),
  center(size(14, 'Le texte sélectionné, ou ce que vous allez taper.', 'color: #5b6574')),
  '<p></p>',
  center(size(18, 'Espacement des lettres', 'letter-spacing: 4pt')),
  center(size(18, 'Petites Capitales', 'font-variant: small-caps; letter-spacing: 1pt')),
  center(size(18, '<strong>Ombre portée</strong>', 'text-shadow: 1.5pt 1.5pt 2pt #00000066')),
  center(size(26, '<strong>Contour</strong>', 'color: #ffffff; -webkit-text-stroke: 0.75pt #1b2430')),
  center(size(18, '<u style="text-decoration-style: double">Soulignement double</u>')),
  center(size(18, '<u style="text-decoration-style: dotted">Soulignement pointillé</u>')),
  center(size(18, '<u style="text-decoration-style: dashed">Soulignement tireté</u>')),
  center(size(18, '<u style="text-decoration-style: wavy">Soulignement ondulé</u>')),
  '<p></p>',
  '<p style="text-align: left">Un paragraphe se règle de la même façon : interligne, espaces avant et après, retraits (dont le retrait suspendu). Ce texte sert à montrer l’effet de la fenêtre « Paragraphe… » sur plusieurs lignes de suite, avec un retrait de première ligne.</p>',
].join('');
const { page } = await openWidget({ width: W, height: H, seed: seedModel({ name: 'Caractères', html }) });
await sleep(800);
// Le modèle semé est « par défaut » (une étoile à côté du nom) : un clic sur l'étoile la retire, comme dans la galerie.
await click(page, '#btn-set-default-template', 500);
const select = (from, to) => page.evaluate(([f, t]) => { const ed = EditorCore.getEditor(); ed.chain().focus().setTextSelection(t === undefined ? f : { from: f, to: t }).run(); }, [from, to]);
// Le curseur dans le paragraphe vide : rien n'est surligné, aucun bouton de mise en forme n'est allumé.
const emptyPos = await page.evaluate(() => { let pos = null; EditorCore.getEditor().state.doc.descendants((node, p) => { if (pos === null && node.type.name === 'paragraph' && node.content.size === 0) pos = p + 1; }); return pos; });
await select(emptyPos);
await idle(page, 70, 700);
await page.evaluate(() => { document.getElementById('status-msg').textContent = I18n.t('status.ready'); });
await shot(page, 'b0-repos');

// 1. Le menu Alignement, ouvert au survol du bouton.
await hoverMenuRow(page, '#v2-btn-align-main', null, 600);
await shot(page, 'b1-menu-alignement');
await shot(page, 'b1-menu-alignement-plein');
await page.mouse.move(70, 700, { steps: 4 }); await sleep(400);

// 2. Le menu « Aa » sur le titre : petites capitales, ombre, espacement des lettres 3 pt ; le menu reste ouvert tant que la souris est dessus.
const titleEnd = await page.evaluate(() => 1 + EditorCore.getEditor().state.doc.firstChild.content.size);
await select(1, titleEnd);
await sleep(300);
await clickMenuRow(page, '#v2-btn-char-main', '#v2-btn-char-smallcaps', 500);
await click(page, '#v2-btn-char-shadow', 400, false);
const sp = await rectOf(page, '#v2-char-spacing-val');
await page.mouse.move(sp.x - 10, sp.y, { steps: 3 }); await page.mouse.click(sp.x, sp.y); await page.keyboard.press('Control+a'); await page.keyboard.type('3'); await page.keyboard.press('Enter'); await sleep(500);
// Le menu reste ouvert : la souris retourne sur une ligne du menu (aucune ligne n'est survolée en vedette).
const fly = await rectOf(page, '#v2-char-flyout');
const grp = await rectOf(page, '#v2-btn-char-main');
await page.mouse.move(fly.l + fly.w - 18, fly.t + fly.h - 10, { steps: 4 }); await sleep(500);
console.log('menu Aa', JSON.stringify({ fly, grp }));
await shot(page, 'b2-menu-caractere-plein');
const cx = Math.max(0, Math.min(grp.x - 330, W - 660));
await shot(page, 'b2-menu-caractere', { clip: { x: cx, y: Math.max(0, grp.t - 14), width: 660, height: fly.b - grp.t + 30 } });
await page.mouse.move(70, 700, { steps: 4 }); await sleep(500);
// Le titre garde les réglages : le curseur retourne dans le paragraphe vide, le coin d'état au repos.
await select(emptyPos);
await idle(page, 70, 700);
await shot(page, 'b2b-caractere-applique');

// 3. « Paragraphe… » sur le dernier paragraphe : interligne 1,5, espace après, retrait suspendu (retrait à gauche 24 pt, première ligne -24 pt).
const last = await page.evaluate(() => { let r = null; EditorCore.getEditor().state.doc.descendants((node, p) => { if (node.type.name === 'paragraph' && node.content.size > 0) r = { from: p + 1, to: p + 1 + node.content.size }; }); return r; });
await select(last.from, last.to);
await clickMenuRow(page, '#v2-btn-align-main', '#v2-btn-paragraph', 700);
await page.waitForSelector('#pp-parafmt-modal .pp-parafmt-box', { state: 'visible', timeout: 10000 });
await sleep(500);
for (const [key, value] of [['lineHeight', '1.5'], ['spaceBefore', '0'], ['spaceAfter', '12'], ['indentLeft', '24'], ['indentFirst', '-24']]) {
  const f = await rectOf(page, '#pp-parafmt-' + key);
  await page.mouse.move(f.x - 20, f.y, { steps: 3 }); await page.mouse.click(f.x, f.y); await page.keyboard.press('Control+a'); await page.keyboard.type(value); await sleep(150);
}
// Un clic sur le titre quitte le dernier champ sans rien valider (Entrée validerait la fenêtre).
const pt = await rectOf(page, '#pp-parafmt-title'); await page.mouse.move(pt.x + 160, pt.y, { steps: 3 }); await page.mouse.click(pt.x + 160, pt.y); await sleep(400);
await page.mouse.move(70, 700, { steps: 4 }); await sleep(500);
const pbox = await rectOf(page, '#pp-parafmt-modal .pp-parafmt-box');
console.log('boîte paragraphe', JSON.stringify(pbox));
await shot(page, 'b3-fenetre-paragraphe', { clip: { x: Math.max(0, pbox.l - 40), y: Math.max(0, pbox.t - 40), width: pbox.w + 80, height: pbox.h + 80 } });
await shot(page, 'b3-fenetre-paragraphe-plein');
await click(page, '#pp-parafmt-modal .var-modal-actions button:last-child', 600);
await select(emptyPos);
await idle(page, 70, 700);
await shot(page, 'b3b-paragraphe-applique');
await done();
