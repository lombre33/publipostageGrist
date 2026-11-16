#!/usr/bin/env node
// Le constat d'une icône grisée des barres flottantes du TABLEAU et de l'IMAGE (js/lock-bar-causes.js, js/lock-diagnostic.js, js/lock-bubble.js ; demande du 12/11, lot 2) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau
// Grist (700x400) : dev-tests/scenarios-lock-bubble.js joue le module dans la page ; ici une personne clique dans une case, une image, une icône grisée, déplie « En savoir plus » et lit ce que le widget a LU sur le tableau ou l'image.
// LE TABLEAU : un tableau de document de 3 lignes sur 3 colonnes dont une case fusionnée ; le curseur dans une case : « Égaliser » (moins de deux lignes), « Scinder » (case non fusionnée), « Répéter la ligne » (aucune variable), « Tableau croisé »
// (tableau de document) ; deux cases glissées avec le suivi des modifications allumé : « Fusionner » et les réglages se grisent pour le suivi ; une ligne dont la seule variable vient d'une table sans lien : « Répéter la ligne » dit laquelle, et le
// texte copié masque son nom. L'IMAGE : une image collée seule dans son paragraphe (Condition, Boucle, ligne / bloc, Sur toutes les pages), une image vectorielle, un QR code (l'image d'une adresse web, bloquée jusqu'à un clic, est jouée dans le groupe lockBubble). Un geste qui change la cause dégrise l'icône
// et retire sa clé de raison. Les noms (Factures, Lignes, Autre) viennent du document ; le français puis l'anglais.
// Lancé par run-headless.mjs (groupe Node "lockBubbleBarsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-lock-bubble-bars-mouse.mjs
import { start } from './gfs-page.mjs';

const t = await start({ name: 'verify-lock-bubble-bars-mouse', port: Number(process.env.LOCK_BUBBLE_BARS_MOUSE_PORT || 9461) });
const pause = ms => new Promise(r => setTimeout(r, ms));

// ---- gestes et lectures ---------------------------------------------------------------------------------------------------------------------------------------------
const boxOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}, selector);
async function goTo(page, selector) {
  const b = await boxOf(page, selector);
  if (!b || !b.w || !b.h) throw new Error('introuvable ou masqué : ' + selector);
  await page.mouse.move(Math.max(2, b.x - 30), Math.min(page.viewportSize().height - 4, b.y + 45));
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await pause(250);
  return b;
}
async function press(page, selector) {
  const b = await goTo(page, selector);
  await page.mouse.down();
  await page.mouse.up();
  await pause(300);
  return b;
}
const closeBubble = page => page.evaluate(() => LockBubble.close());
const bubbleOpen = page => page.evaluate(() => !!document.querySelector('.pp-lockbubble'));
const textOf = (page, selector) => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }, selector);
const checksOf = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-lockbubble-check')).map(li => ({ no: li.classList.contains('is-no'), text: li.textContent.replace(/\s+/g, ' ').trim() })));
const html = page => page.evaluate(() => Editor.getHTML());
const readClipboard = page => page.evaluate(() => navigator.clipboard.readText().catch(e => 'ERREUR ' + e));
const TABLE_BAR = '.v2-table-toolbar.visible';
const IMAGE_BAR = '.v2-image-toolbar.visible';
const barButton = (bar, action) => `${bar} button[data-action="${action}"]`;
const buttonState = (page, selector) => page.evaluate(sel => { const b = document.querySelector(sel); return b ? { grey: b.getAttribute('aria-disabled') === 'true', reason: b.getAttribute('data-pp-bar-reason'), title: b.getAttribute('title') } : null; }, selector);
async function clickCell(page, text) {
  const spot = await page.evaluate(label => {
    const cell = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(node => node.textContent.trim() === label);
    const r = cell.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, text);
  await page.mouse.click(spot.x, spot.y);
  await pause(450);
}
async function dragCells(page, from, to) {
  const spots = await page.evaluate(labels => labels.map(label => {
    const cell = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(node => node.textContent.trim() === label);
    const r = cell.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }), [from, to]);
  await page.mouse.move(spots[0].x, spots[0].y);
  await page.mouse.down();
  await page.mouse.move(spots[1].x, spots[1].y, { steps: 8 });
  await page.mouse.up();
  await pause(450);
}
const seenNames = [];
// Presse l'icône grisée, déplie « En savoir plus » et rend ce que la personne lit : la phrase, les vérifications, le geste, ce que le widget voit.
async function read(page, selector) {
  await press(page, selector);
  const opened = await bubbleOpen(page);
  const why = await textOf(page, '.pp-lockbubble-why');
  const name = await textOf(page, '.pp-lockbubble-name');
  seenNames.push(name);
  await press(page, '.pp-lockbubble-more');
  const ctx = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-lockbubble-ctx dt, .pp-lockbubble-ctx dd')).map(node => node.textContent.trim()).join(' '));
  return { opened, why, name, checks: await checksOf(page), fix: await textOf(page, '.pp-lockbubble-fix'), ctx };
}
const has = (checks, wanted, no) => checks.some(check => check.no === no && wanted.test(check.text));

// ---- la page : Factures (page), Lignes (liée), Autre (sans lien) -------------------------------------------------------------------------------------------------
async function barPage({ lang = 'fr' } = {}) {
  const { page } = await t.openPage({ hosted: false, lang });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables('Factures', { Numero: 'Text', Client: 'Text' });
    stub.setVariables('Lignes', { Parent: 'Ref:Factures', Designation: 'Text' });
    stub.setVariables('Autre', { Nom: 'Text' });
    stub.setRows('Factures', [{ id: 1, Numero: 'F-1', Client: 'X' }]);
    stub.setRows('Lignes', [{ id: 1, Parent: 1, Designation: 'A' }]);
    stub.setRows('Autre', [{ id: 1, Nom: 'N' }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('Lignes');
    await GristAPI.saveLinkRule('Lignes', { mode: 'match', colonneCible: 'Parent', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Numero: 'F-1', Client: 'X' }, 'Factures');
  });
  await pause(500);
  return page;
}
const PLAIN_TABLE = '<table><tbody><tr><th><p>Produit</p></th><th><p>Quantité</p></th><th><p>Prix</p></th></tr><tr><td colspan="2"><p>Fusion</p></td><td><p>Total</p></td></tr>'
  + '<tr><td><p>Gamma</p></td><td><p>Delta</p></td><td><p>Epsilon</p></td></tr></tbody></table><p>Fin</p>';

// ---- 1) Le tableau, en français : le curseur dans une case ----------------------------------------------------------------------------------------------------------
{
  const page = await barPage();
  await page.evaluate(doc => Editor.setHTML(doc), PLAIN_TABLE);
  await pause(400);
  await clickCell(page, 'Gamma');
  const before = await html(page);
  const equalize = await buttonState(page, barButton(TABLE_BAR, 'rows-equalize'));
  t.check('tableau : « Égaliser la hauteur » est grisé et garde la clé de sa raison sur le bouton', !!equalize && equalize.grey && equalize.reason === 'table.rowsEqualizeNeed', equalize);
  const rows = await read(page, barButton(TABLE_BAR, 'rows-equalize'));
  t.check('tableau : un vrai clic ouvre la bulle, qui dit la phrase de l\'info-bulle', rows.opened && rows.why === equalize.title, rows);
  t.check('tableau : égaliser : le tableau lu (3 lignes × 3 colonnes) est écarté, « moins de deux lignes choisies » est la cause', has(rows.checks, /Le curseur est dans un tableau.*3 lignes × 3 colonnes/, false) && has(rows.checks, /Moins de deux lignes choisies.*une seule case \(ou un simple curseur\)/, true), rows.checks);
  t.check('tableau : égaliser : le geste dit de glisser sur le tableau pour choisir au moins deux lignes', /Pour la dégriser.*glissez sur le tableau pour choisir au moins deux lignes/.test(rows.fix), rows.fix);
  t.check('tableau : égaliser : ce que le widget voit (type, taille, cases fusionnées, sélection, suivi)', /Type de tableau tableau de document/.test(rows.ctx) && /Tableau sous le curseur 3 × 3 \(lignes × colonnes\)/.test(rows.ctx) && /Cases fusionnées 1/.test(rows.ctx) && /Sélection un curseur, aucune case choisie/.test(rows.ctx) && /Suivi des modifications éteint/.test(rows.ctx), rows.ctx);
  await closeBubble(page);

  const split = await read(page, barButton(TABLE_BAR, 'cell-split'));
  t.check('tableau : scinder : la case du curseur n\'est pas fusionnée, et le tableau a une case fusionnée ailleurs', has(split.checks, /La case du curseur n’est pas fusionnée.*ce tableau a 1 case fusionnée, mais pas celle-ci/, true) && /placez le curseur dans une case fusionnée/.test(split.fix), split);
  await closeBubble(page);

  const repeat = await read(page, barButton(TABLE_BAR, 'row-repeat'));
  t.check('tableau : répéter la ligne sans variable : une seule ligne ✓, aucune case fusionnée ✓, aucune variable ✕, et le geste dit de taper #', has(repeat.checks, /Le curseur est dans une seule ligne/, false) && has(repeat.checks, /Aucune case fusionnée ne traverse la ligne/, false) && has(repeat.checks, /La ligne n’a aucune variable/, true) && /tapez #/.test(repeat.fix), repeat);
  await closeBubble(page);

  const pivot = await read(page, barButton(TABLE_BAR, 'row-pivot'));
  t.check('tableau : tableau croisé : c\'est un tableau de document, et le tableau croisé n\'existe que dans une grille', has(pivot.checks, /Le tableau est un tableau de document.*que dans une grille/, true) && /modèle de type Grille/.test(pivot.fix), pivot);
  await closeBubble(page);

  await clickCell(page, 'Fusion');
  const mergedRow = await read(page, barButton(TABLE_BAR, 'row-repeat'));
  t.check('tableau : répéter la ligne d\'une case fusionnée : la ligne du curseur est celle de la fusion, le constat le dit sans inventer de variable', mergedRow.opened && mergedRow.checks.length >= 2, mergedRow);
  await closeBubble(page);
  t.check('tableau : la barre est restée ouverte et le document n\'a pas bougé', (await page.evaluate(sel => !!document.querySelector(sel), TABLE_BAR)) && (await html(page)) === before);

  // Deux lignes choisies : « Égaliser la hauteur » se dégrise toute seule et perd sa clé ; « Égaliser la largeur » reste grisé, avec la même lecture.
  await dragCells(page, 'Total', 'Epsilon');
  const rowsAfter = await buttonState(page, barButton(TABLE_BAR, 'rows-equalize'));
  t.check('tableau : deux lignes choisies : « Égaliser la hauteur » est dégrisé et n\'a plus de clé de raison', !!rowsAfter && !rowsAfter.grey && !rowsAfter.reason, rowsAfter);
  const cols = await read(page, barButton(TABLE_BAR, 'cols-equalize'));
  t.check('tableau : « Égaliser la largeur » : une seule colonne choisie, et le tableau lit la sélection (2 cases, 2 × 1)', has(cols.checks, /Moins de deux colonnes choisies.*la sélection couvre 1 colonne/, true) && /2 cases choisies, sur 2 × 1 \(lignes × colonnes\)/.test(cols.ctx), cols);
  await closeBubble(page);
  await page.context().close();
}

// ---- 2) Le suivi des modifications : fusionner, réglages ----------------------------------------------------------------------------------------------------------------
{
  const page = await barPage();
  await page.evaluate(doc => { Editor.setHTML(doc); Editor.setTrackChanges(true); }, PLAIN_TABLE);
  await pause(400);
  await dragCells(page, 'Gamma', 'Delta');
  const merge = await buttonState(page, barButton(TABLE_BAR, 'cell-merge'));
  t.check('suivi : deux cases glissées, « Fusionner » est grisé avec la clé du suivi', !!merge && merge.grey && merge.reason === 'table.cellTracked', merge);
  const found = await read(page, barButton(TABLE_BAR, 'cell-merge'));
  t.check('suivi : fusionner : le suivi allumé est la cause, la forme du tableau changerait', has(found.checks, /Le suivi des modifications est allumé.*la forme du tableau changerait/, true), found.checks);
  t.check('suivi : le geste nomme l\'icône « Suivi des modifications » et son menu « Édition collaborative »', /éteignez « Suivi des modifications » \(menu « Édition collaborative » de la barre du haut\)/.test(found.fix), found.fix);
  t.check('suivi : ce que le widget voit : 2 cases choisies sur 1 × 2, suivi allumé', /2 cases choisies, sur 1 × 2/.test(found.ctx) && /Suivi des modifications allumé/.test(found.ctx), found.ctx);
  await closeBubble(page);
  const align = await buttonState(page, barButton(TABLE_BAR, 'valign-middle'));
  const setting = await read(page, barButton(TABLE_BAR, 'valign-middle'));
  t.check('suivi : un réglage (alignement vertical) est grisé pour le suivi, et le constat dit que le suivi ne verrait pas ce changement', !!align && align.reason === 'table.settingTracked' && has(setting.checks, /Le suivi des modifications est allumé.*que le suivi ne verrait pas/, true), setting.checks);
  await closeBubble(page);
  // Le suivi éteint, un nouveau geste : l'icône se dégrise et perd sa clé.
  await page.evaluate(() => Editor.setTrackChanges(false));
  await dragCells(page, 'Gamma', 'Delta');
  const mergeAfter = await buttonState(page, barButton(TABLE_BAR, 'cell-merge'));
  t.check('suivi : le suivi éteint, « Fusionner » se dégrise toute seule et perd sa clé de raison', !!mergeAfter && !mergeAfter.grey && !mergeAfter.reason, mergeAfter);
  await page.context().close();
}

// ---- 3) Une ligne dont la variable vient d'une table sans lien ------------------------------------------------------------------------------------------------------
{
  const page = await barPage();
  await page.evaluate(() => {
    const badge = (table, column) => '<span class="var-badge" data-table="' + table + '" data-column="' + column + '" data-key="' + table + '.' + column + '"></span>';
    Editor.setHTML('<table><tbody><tr><th><p>Nom</p></th><th><p>Texte</p></th></tr><tr><td><p>' + badge('Autre', 'Absente') + '</p></td><td><p>Fixe</p></td></tr></tbody></table><p>Fin</p>');
  });
  await pause(500);
  await clickCell(page, 'Fixe');
  const repeat = await buttonState(page, barButton(TABLE_BAR, 'row-repeat'));
  t.check('ligne sans source : « Répéter la ligne » est grisé avec la clé « aucune source »', !!repeat && repeat.grey && repeat.reason === 'table.rowRepeatNoSource', repeat);
  const found = await read(page, barButton(TABLE_BAR, 'row-repeat'));
  t.check('ligne sans source : la variable de la ligne est nommée avec ce qui lui manque (sa colonne est introuvable ; noms lus dans le document)', has(found.checks, /La ligne porte des variables.*1 variable/, false) && has(found.checks, /Aucune ne peut répéter la ligne.*Autre\.Absente \(sa colonne est introuvable\)/, true), found.checks);
  await press(page, '.pp-lockbubble-copy');
  const plain = await readClipboard(page);
  t.check('ligne sans source : « Copier le constat » écrit les noms', /Autre\.Absente \(sa colonne est introuvable/.test(plain) && /Répéter la ligne/.test(plain), plain);
  await press(page, '.pp-lockbubble-mask input');
  await press(page, '.pp-lockbubble-copy');
  const masked = await readClipboard(page);
  t.check('ligne sans source : avec « Masquer les noms », la table et la colonne deviennent Table 1.Colonne 1 et « Autre » n\'est plus dans le texte', /Table 1\.Colonne 1 \(sa colonne est introuvable/.test(masked) && !/Autre|Absente/.test(masked), masked);
  await closeBubble(page);
  await page.context().close();
}

// ---- 4) L'image ------------------------------------------------------------------------------------------------------------------------------------------------------------
const PNG = '<canvas>';
async function loadImage(page, src, extra = '') {
  await page.evaluate(([source, more]) => {
    let url = source;
    if (!url) {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 200, 100);
      url = canvas.toDataURL('image/png');
    }
    Editor.setHTML('<p>Avant</p><p><img class="editor-image" src="' + url + '" alt="" style="width: 160px"' + more + '></p><p>Après</p>');
  }, [src === PNG ? '' : src, extra]);
  await pause(500);
  const box = await boxOf(page, '.tiptap img.editor-image');
  await page.mouse.click(box.x, box.y);
  await pause(500);
}
{
  const page = await barPage();
  await loadImage(page, PNG);
  const before = await html(page);
  const condition = await buttonState(page, barButton(IMAGE_BAR, 'var-condition'));
  t.check('image : « Condition d\'affichage » est grisée pour une image collée, avec la clé de sa raison', !!condition && condition.grey && condition.reason === 'imgToolbar.conditionNeedsColumn', condition);
  const found = await read(page, barButton(IMAGE_BAR, 'var-condition'));
  t.check('image : condition : « pas liée à une colonne Pièces jointes », c\'est une image collée dans le document, et le geste dit de taper #', has(found.checks, /L’image n’est pas liée à une colonne Pièces jointes.*c’est une image collée dans le document/, true) && /tapez # puis choisissez une colonne de type Pièces jointes/.test(found.fix), found);
  t.check('image : ce que le widget voit : image collée, place « Au cœur du texte », aperçu A4', /Image une image collée dans le document/.test(found.ctx) && /Place de l’image Au cœur du texte/.test(found.ctx) && /Aperçu A4 (allumé|éteint)/.test(found.ctx), found.ctx);
  await closeBubble(page);
  const loop = await read(page, barButton(IMAGE_BAR, 'var-loop'));
  t.check('image : la Boucle d\'une image sans colonne dit la même chose', has(loop.checks, /n’est pas liée à une colonne Pièces jointes/, true), loop.checks);
  await closeBubble(page);
  const wrap = await read(page, barButton(IMAGE_BAR, 'wrap'));
  t.check('image : « ligne / bloc » : l\'image est dans le texte ✓, non alignée ✓, seule dans son paragraphe ✕', has(wrap.checks, /L’image est dans le texte/, false) && has(wrap.checks, /L’image n’est pas alignée/, false) && has(wrap.checks, /L’image est seule dans son paragraphe/, true) && /écrivez du texte dans le même paragraphe/.test(wrap.fix), wrap);
  await closeBubble(page);
  const behind = await read(page, barButton(IMAGE_BAR, 'repeat'));
  t.check('image : « Sur toutes les pages » : l\'image n\'est pas derrière le texte, et le geste nomme l\'icône de calque', has(behind.checks, /L’image n’est pas derrière le texte.*Au cœur du texte/, true) && /mettez l’image « Derrière le texte »/.test(behind.fix), behind);
  await closeBubble(page);
  t.check('image : la barre est restée ouverte et le document n\'a pas bougé', (await page.evaluate(sel => !!document.querySelector(sel), IMAGE_BAR)) && (await html(page)) === before);
  await page.context().close();
}
{
  const page = await barPage();
  await loadImage(page, 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22100%22%3E%3Crect%20width%3D%22200%22%20height%3D%22100%22%2F%3E%3C%2Fsvg%3E');
  const vector = await read(page, barButton(IMAGE_BAR, 'reshape'));
  t.check('image vectorielle : « Pivoter et retourner » : l\'image est vectorielle (SVG), elle perdrait sa netteté', has(vector.checks, /L’image est vectorielle \(SVG\).*perdrait sa netteté/, true) && /PNG ou JPEG/.test(vector.fix), vector);
  await closeBubble(page);
  const crop = await buttonState(page, barButton(IMAGE_BAR, 'crop'));
  t.check('image vectorielle : « Rogner » est grisé pour la même raison', !!crop && crop.grey && crop.reason === 'imgToolbar.reshapeVector', crop);
  await page.context().close();
}
{
  const page = await barPage();
  await loadImage(page, PNG, ' data-qr-text="https://exemple.fr"');
  const qr = await read(page, barButton(IMAGE_BAR, 'reshape'));
  t.check('QR code : « Pivoter et retourner » dit que c\'est un QR code qui se règle à sa source', has(qr.checks, /L’image n’est pas une image collée dans le document.*c’est un QR code : elle se règle à sa source/, true), qr);
  await closeBubble(page);
  await page.context().close();
}

// ---- 5) Les lignes de menu que la place du curseur grise (lot 3) : le groupe à survol ouvre sa ligne, le vrai appui sur la ligne grisée ouvre la bulle ----------------------------------
// Le groupe à survol ouvre sa ligne sans que la souris la quitte : elle descend dans le menu et s'arrête sur la ligne (comme verify-lock-reasons-mouse.mjs).
async function toRow(page, groupSelector, rowSelector) {
  const g = await goTo(page, groupSelector);
  await pause(450);
  await page.evaluate((sel) => { const el = document.querySelector(sel); if (el && el.closest('.v2-hover-flyout-scrollable')) el.scrollIntoView({ block: 'nearest' }); }, rowSelector);
  await pause(150);
  const r = await boxOf(page, rowSelector);
  if (!r || !r.w || !r.h) throw new Error('ligne introuvable ou masquée : ' + rowSelector);
  const x = Math.min(Math.max(g.x, r.left + 6), r.right - 6);
  await page.mouse.move(x, g.y + 12, { steps: 2 });
  await page.mouse.move(x, r.y, { steps: 6 });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await pause(250);
  return r;
}
async function clickRow(page, groupSelector, rowSelector) {
  await closeBubble(page);
  await toRow(page, groupSelector, rowSelector);
  await page.mouse.down();
  await page.mouse.up();
  await pause(300);
}
async function readRow(page, groupSelector, rowSelector) {
  await clickRow(page, groupSelector, rowSelector);
  const opened = await bubbleOpen(page);
  const name = await textOf(page, '.pp-lockbubble-name');
  const why = await textOf(page, '.pp-lockbubble-why');
  if (opened) await press(page, '.pp-lockbubble-more');
  const ctx = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-lockbubble-ctx dt, .pp-lockbubble-ctx dd')).map(node => node.textContent.trim()).join(' '));
  return { opened, name, why, checks: await checksOf(page), fix: await textOf(page, '.pp-lockbubble-fix'), ctx };
}
{
  const page = await barPage();
  await page.evaluate(() => Editor.setHTML('<h2>Titre du contrat</h2><p>Texte</p><ol><li><p>Un</p></li></ol>'));
  await pause(400);
  const heading = await boxOf(page, '.tiptap h2');
  await page.mouse.click(heading.x, heading.y);
  await pause(400);
  const before = await html(page);
  const keep = await buttonState(page, '#v2-btn-keep-next');
  t.check('menu : « Garder avec le suivant » est grisée dans un titre, avec la clé de sa raison sur la ligne', !!keep && keep.grey && keep.reason === 'keepNext.notHere', keep);
  const found = await readRow(page, '#v2-btn-align-main', '#v2-btn-keep-next');
  t.check('menu : un vrai appui sur la ligne grisée ouvre la bulle, qui s\'appelle comme la ligne et dit sa raison', found.opened && /^Garder avec le suivant/.test(found.name) && found.why === keep.title, found);
  t.check('menu : « Garder avec le suivant » : ni en-tête ni pied de page ✓, aucun paragraphe de texte dans la sélection ✕, le curseur est dans un titre de niveau 2', has(found.checks, /Aucun en-tête ni pied de page n’est en cours d’édition/, false) && has(found.checks, /Aucun paragraphe de texte dans la sélection.*le curseur est dans un titre de niveau 2/, true), found.checks);
  t.check('menu : le geste dit de placer le curseur dans un paragraphe du texte, et le constat lit le curseur', /placez le curseur dans un paragraphe du texte/.test(found.fix) && /Curseur un titre de niveau 2/.test(found.ctx), found);
  t.check('menu : la ligne reste grisée, le document n\'a pas bougé', (await buttonState(page, '#v2-btn-keep-next')).grey && (await html(page)) === before);
  // Dans une liste numérotée : « Puce… » dit ce que le curseur touche.
  await closeBubble(page);
  const item = await boxOf(page, '.tiptap ol li p');
  await page.mouse.click(item.x, item.y);
  await pause(400);
  const bullet = await readRow(page, '#v2-btn-bullet', '#v2-btn-bullet-char');
  t.check('menu : « Puce… » dans une liste numérotée : le curseur n\'est pas dans une liste à puces, il est dans un paragraphe d\'une liste numérotée', bullet.opened && has(bullet.checks, /Le curseur n’est pas dans une liste à puces.*le curseur est dans un paragraphe, dans une liste numérotée/, true) && /placez le curseur dans une liste à puces/.test(bullet.fix), bullet);
  // Signet… dans une liste à puces (la barre flottante d'un tableau recouvrirait le menu : le test prend une liste).
  await closeBubble(page);
  await page.evaluate(() => Editor.setHTML('<ul><li><p>Puce</p></li></ul><p>Fin</p>'));
  await pause(400);
  const dot = await boxOf(page, '.tiptap ul li p');
  await page.mouse.click(dot.x, dot.y);
  await pause(400);
  const mark = await readRow(page, '#v2-btn-link', '#v2-row-bookmark');
  t.check('menu : « Signet… » dans une liste à puces : le curseur est dans un paragraphe, dans une liste à puces, et le geste le dit', mark.opened && has(mark.checks, /Le curseur n’est pas dans un paragraphe ou un titre du texte, au premier niveau.*le curseur est dans un paragraphe, dans une liste à puces/, true) && /hors tableau, liste, colonne et encadré/.test(mark.fix), mark);
  // Le curseur revient dans un paragraphe du texte : la ligne se dégrise et perd sa clé.
  await closeBubble(page);
  await page.evaluate(() => Editor.setHTML('<p>Bonjour</p>'));
  await pause(300);
  const paragraph = await boxOf(page, '.tiptap p');
  await page.mouse.click(paragraph.x, paragraph.y);
  await pause(400);
  const freed = await buttonState(page, '#v2-btn-keep-next');
  t.check('menu : le curseur dans un paragraphe du texte, « Garder avec le suivant » se dégrise et perd sa clé de raison', !!freed && !freed.grey && !freed.reason, freed);
  await page.context().close();
}

// ---- 5b) Les boutons que le navigateur grisait (lot 4) : Retrait, Tout accepter, ★ ---------------------------------------------------------------------------------------
// Un bouton `disabled` ne reçoit aucun clic : js/lock-reasons.js le grise « doux » (aria-disabled, plus de `disabled`, hors de l'ordre des tabulations) ; son clic ouvre la bulle, son info-bulle reste.
const softState = (page, selector) => page.evaluate(sel => { const b = document.querySelector(sel); return b ? { soft: b.hasAttribute('data-pp-lock-soft'), aria: b.getAttribute('aria-disabled'), disabled: b.disabled, tabindex: b.getAttribute('tabindex'), title: b.getAttribute('title'), blocks: b.hasAttribute('data-pp-lock-blocks') } : null; }, selector);
{
  const page = await barPage();
  await page.evaluate(() => Editor.setHTML('<p>Texte</p><ul><li><p>Un</p></li><li><p>Deux</p></li></ul>'));
  await pause(400);
  const texte = await boxOf(page, '.tiptap > p');
  await page.mouse.click(texte.x, texte.y);
  await pause(400);
  const before = await html(page);
  const indent = await softState(page, '#v2-btn-indent');
  t.check('boutons : « Retrait » hors d\'une liste est grisé « doux » : aria-disabled, plus de `disabled`, hors de l\'ordre des tabulations, il garde sa raison en info-bulle', !!indent && indent.soft && indent.aria === 'true' && indent.disabled === false && indent.tabindex === '-1' && /point de liste/.test(indent.title || '') && indent.blocks, indent);
  await closeBubble(page);
  await press(page, '#v2-btn-indent');
  const outsideOpened = await bubbleOpen(page);
  const outsideName = await textOf(page, '.pp-lockbubble-name');
  const outsideWhy = await textOf(page, '.pp-lockbubble-why');
  if (outsideOpened) await press(page, '.pp-lockbubble-more');
  const outsideChecks = await checksOf(page);
  const outsideFix = await textOf(page, '.pp-lockbubble-fix');
  t.check('boutons : un vrai appui sur « Retrait » grisé ouvre la bulle, qui s\'appelle comme le bouton et dit sa raison', outsideOpened && /retrait/i.test(outsideName) && outsideWhy === indent.title, { outsideOpened, outsideName, outsideWhy });
  t.check('boutons : « Retrait » : le curseur n\'est pas dans une liste, il est dans un paragraphe, et le geste dit de le placer dans un point de liste', has(outsideChecks, /Le curseur n’est pas dans une liste.*un paragraphe/, true) && /point de liste/.test(outsideFix), { outsideChecks, outsideFix });
  t.check('boutons : le bouton reste grisé et le document n\'a pas bougé', (await softState(page, '#v2-btn-indent')).soft && (await html(page)) === before);
  // Premier point d'une liste.
  await closeBubble(page);
  const first = await boxOf(page, '.tiptap ul li:first-child p');
  await page.mouse.click(first.x, first.y);
  await pause(400);
  await press(page, '#v2-btn-indent');
  const firstOpened = await bubbleOpen(page);
  if (firstOpened) await press(page, '.pp-lockbubble-more');
  const firstChecks = await checksOf(page);
  t.check('boutons : « Retrait » sur le premier point d\'une liste : le curseur est dans un point de liste ✓, ce point est le premier de sa liste ✕', firstOpened && has(firstChecks, /Le curseur est dans un point de liste/, false) && has(firstChecks, /premier de sa liste/, true), firstChecks);
  // Le deuxième point : le bouton se dégrise, rend son état au navigateur, et un vrai clic descend le point.
  await closeBubble(page);
  const second = await boxOf(page, '.tiptap ul li:nth-child(2) p');
  await page.mouse.click(second.x, second.y);
  await pause(400);
  const freedIndent = await softState(page, '#v2-btn-indent');
  t.check('boutons : sur le deuxième point, « Retrait » se dégrise : plus de grisé doux, plus d\'info-bulle de raison, retour dans l\'ordre des tabulations', !!freedIndent && !freedIndent.soft && freedIndent.aria === null && freedIndent.tabindex === null && !(freedIndent.title || '').includes('Indisponible') && !freedIndent.blocks, freedIndent);
  await press(page, '#v2-btn-indent');
  t.check('boutons : le bouton dégrisé agit pour de vrai : le deuxième point descend d\'un niveau et aucune bulle ne s\'ouvre', /<ul>.*<li><p>Un<\/p><ul>/.test(await html(page)) && !(await bubbleOpen(page)), await html(page));
  // Tout accepter, sans modification suivie.
  await closeBubble(page);
  const accept = await softState(page, '#v2-btn-accept-all');
  t.check('boutons : « Tout accepter » sans modification suivie est grisé « doux » avec la raison en info-bulle', !!accept && accept.soft && accept.aria === 'true' && accept.disabled === false && /aucune modification suivie/.test(accept.title || ''), accept);
  const pending = await readRow(page, '#v2-collab-group', '#v2-btn-accept-all');
  t.check('boutons : un vrai appui sur « Tout accepter » grisé ouvre la bulle : le suivi est éteint ✕, aucune modification suivie n\'attend ✕, le geste dit d\'allumer le suivi', pending.opened && /accepter/i.test(pending.name) && has(pending.checks, /Le suivi des modifications est éteint/, true) && has(pending.checks, /Aucune modification suivie n’attend/, true) && /suivi des modifications/.test(pending.fix), pending);
  // ★ : le bouton du modèle par défaut.
  await closeBubble(page);
  const star = await softState(page, '#btn-set-default-template');
  if (star && star.soft) {
    await press(page, '#btn-set-default-template');
    const starOpened = await bubbleOpen(page);
    const starName = await textOf(page, '.pp-lockbubble-name');
    if (starOpened) await press(page, '.pp-lockbubble-more');
    const starChecks = await checksOf(page);
    t.check('boutons : ★ sans modèle ouvert : un vrai appui ouvre la bulle, qui dit qu\'aucun modèle n\'est ouvert et le geste', starOpened && /défaut/i.test(starName) && has(starChecks, /Aucun modèle n’est ouvert/, true), { starOpened, starName, starChecks });
  } else {
    t.check('boutons : ★ est actif dans cette page d\'essai (aucun grisé à lire)', !!star && !star.soft, star);
  }
  await page.context().close();
}

// ---- 6) L'anglais -----------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const page = await barPage({ lang: 'en' });
  await page.evaluate(doc => Editor.setHTML(doc), PLAIN_TABLE);
  await pause(400);
  await clickCell(page, 'Gamma');
  const rows = await read(page, barButton(TABLE_BAR, 'rows-equalize'));
  t.check('anglais : égaliser : les vérifications, le geste et ce que le widget voit sont en anglais', has(rows.checks, /The cursor is in a table.*3 rows × 3 columns/, false) && has(rows.checks, /Fewer than two rows chosen/, true) && /drag across the table to choose at least two rows/.test(rows.fix) && /Table type document table/.test(rows.ctx), rows);
  await closeBubble(page);
  await page.context().close();
}

t.check('chaque bulle porte le nom de son icône (jamais « Cette commande »)', seenNames.length >= 15 && seenNames.every(name => name && !/^Cette commande/.test(name)), seenNames);
t.check('les noms des bulles sont ceux des icônes : Égaliser la hauteur, Scinder, Répéter la ligne, Condition, Sur toutes les pages…', [/^Égaliser la hauteur/, /^Scinder/, /^Répéter la ligne/, /^Tableau croisé/, /^Fusionner/].every(pattern => seenNames.some(name => pattern.test(name))), seenNames);
await t.finish();
