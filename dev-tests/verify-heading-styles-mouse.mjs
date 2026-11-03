#!/usr/bin/env node
// Le style d'un niveau de titre, pris d'après la sélection (js/heading-styles.js), à la VRAIE souris et au vrai clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre
// (22/10, lancé le 02/11 : « style des titres d'après la sélection », comme « Mettre à jour Titre 2 pour correspondre à la sélection » de Word).
//   1) Le menu « Titre » au survol : les deux lignes de plus (« Mettre à jour « Titre N » d'après la sélection », « Rétablir le style d'origine ») y sont, nomment le niveau du titre où est le curseur,
//      tiennent dans la largeur du menu et sont atteignables après défilement (ce que la souris trouve au centre de la ligne, c'est la ligne) ; les boutons de numérotation du dessous le restent.
//   2) Un vrai clic sur « Mettre à jour » : le premier suffit, le menu ne remonte pas sous le pointeur, l'éditeur garde le focus et la sélection, les trois titres 1 sont peints du style (taille, couleur,
//      italique), le titre 2 et le paragraphe non ; « Rétablir » s'allume, un vrai clic dessus rend l'aspect d'origine.
//   3) Une ligne grisée (le curseur dans un paragraphe) : un vrai clic ne change rien, le pointeur dit « interdit ».
//   4) Au vrai clavier : Ctrl+Z défait la mise à jour d'un coup (le style et la mise en forme à la main d'un autre titre), Ctrl+Y la remet.
//   5) Le bloc des styles PARTAGÉS du menu (lot 3, 03/11 : « comme pour les couleurs on doit pouvoir voir les styles liés aux modèles et ceux liés au document ») : les deux intitulés (« Styles de titres du modèle »,
//      « Styles de titres partagés ») et leur aperçu (« Aucun » puis une pastille par niveau stylé), ses deux lignes atteignables et nommant le niveau ; un vrai clic sur « Mettre à jour » écrit le style dans les
//      réglages du document (pas dans le modèle) et peint les titres, « Rétablir » le retire, Ctrl+Z défait chaque geste d'un coup (le texte ET le document), Ctrl+Y le remet.
//   6) Aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « headingStylesMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-heading-styles-mouse.mjs
import { open, stopServer, sleep, center } from './load-lib.mjs';

const PORT = Number(process.env.HEADING_STYLES_MOUSE_PORT || 9071);
const EDITOR = '#editor-container .ProseMirror';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const SAMPLE = '<h1>Un titre</h1><h1>Deux titre</h1><h1>Trois titre</h1><h2>Sous-titre</h2><p>Un paragraphe de texte.</p>';
const HTML = page => page.evaluate(() => Editor.getHTML());
const paintOf = (page, selector) => page.evaluate(sel => Array.from(document.querySelectorAll(sel)).map((el) => {
  const cs = getComputedStyle(el);
  return { size: cs.fontSize, color: cs.color, italic: cs.fontStyle, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') };
}), selector);

async function setDocument(page) {
  await page.evaluate(h => Editor.setHTML(h), SAMPLE);
  await sleep(300);
  // « Un titre » : Georgia, 18 pt, bleu, italique, à la main ; « Deux titre » : rouge à la main (la mise à jour le lui retire).
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const range = (needle) => { let found = null; ed.state.doc.descendants((n, pos) => { if (!found && n.isText && n.text.indexOf(needle) !== -1) found = { from: pos + n.text.indexOf(needle), to: pos + n.text.indexOf(needle) + needle.length }; }); return found; };
    ed.chain().focus().setTextSelection(range('Un titre')).setMark('textStyle', { fontFamily: 'Georgia', fontSize: '18pt', color: '#1f4e79' }).setMark('italic').run();
    ed.chain().focus().setTextSelection(range('Deux titre')).setMark('textStyle', { color: '#c0392b' }).run();
    ed.chain().focus().setTextSelection(range('Un titre')).run();
  });
  await sleep(700);
}

// Ouvre le menu « Titre » au survol, comme la personne, et le garde ouvert souris dedans. Rend où est le menu.
async function openMenu(page) {
  const chip = await center(page, '#v2-heading-chip');
  await page.mouse.move(chip.x - 20, chip.y);
  await page.mouse.move(chip.x, chip.y, { steps: 4 });
  await sleep(450);
  const inside = await page.evaluate(() => { const r = document.getElementById('v2-heading-flyout').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; });
  await page.mouse.move(chip.x, chip.y + 15, { steps: 3 });
  await page.mouse.move(inside.x, inside.y, { steps: 6 });
  await sleep(250);
}
const rowInfo = (page, id) => page.evaluate((rowId) => {
  const row = document.getElementById(rowId);
  const flyout = document.getElementById('v2-heading-flyout');
  const f = flyout.getBoundingClientRect();
  const b = row.getBoundingClientRect();
  const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    text: row.textContent, disabled: row.getAttribute('aria-disabled'), x: b.left + b.width / 2, y: b.top + b.height / 2, width: Math.round(b.width), height: Math.round(b.height),
    insideFlyout: b.left >= f.left && b.right <= f.right && b.top >= f.top && b.bottom <= f.bottom, sideScroll: flyout.scrollWidth - flyout.clientWidth,
    underPointerIsRow: !!under && under.closest('#' + rowId) === row, cursor: getComputedStyle(row).cursor, scrollTop: flyout.scrollTop, inViewport: b.bottom <= innerHeight && b.top >= 0,
  };
}, id);
// Défile le menu jusqu'à la ligne (molette), puis la mesure.
async function reachRow(page, id) {
  let info = await rowInfo(page, id);
  for (let i = 0; i < 6 && !(info.insideFlyout && info.underPointerIsRow); i++) {
    await page.mouse.wheel(0, 120);
    await sleep(250);
    info = await rowInfo(page, id);
  }
  return info;
}
// Un vrai clic en deux temps sur la ligne : mesure ce qui est sous le pointeur et le défilement du menu pendant l'appui.
async function clickRow(page, id) {
  const before = await reachRow(page, id);
  await page.mouse.move(before.x, before.y, { steps: 4 });
  await sleep(150);
  await page.mouse.down();
  await sleep(80);
  const during = await page.evaluate(([x, y, rowId]) => ({ scrollTop: document.getElementById('v2-heading-flyout').scrollTop, underIsRow: !!document.elementFromPoint(x, y) && !!document.elementFromPoint(x, y).closest('#' + rowId) }), [before.x, before.y, id]);
  await page.mouse.up();
  await sleep(350);
  return { before, during };
}
const leaveMenu = async page => { await page.mouse.move(350, 390, { steps: 6 }); await sleep(500); };

async function pass(lang, theme, tag) {
  const w = await open({ spec: {}, port: PORT, settleMs: 1500, theme, lang });
  const page = w.page;
  const english = lang === 'en';
  try {
    console.log(`\n[${tag}] Le menu « Titre », les deux lignes de plus, à la vraie souris`);
    await setDocument(page);
    const original = await HTML(page);
    await openMenu(page);
    const update = await reachRow(page, 'v2-btn-heading-style-update');
    const reset = await reachRow(page, 'v2-btn-heading-style-reset');
    check(`${tag} : « Mettre à jour » nomme le niveau du titre où est le curseur`, update.text === (english ? 'Update “Heading 1” to match the selection' : 'Mettre à jour « Titre 1 » d’après la sélection'), update.text);
    check(`${tag} : « Rétablir » nomme le niveau et est grisée tant que le niveau n'a pas de style`, reset.text === (english ? 'Restore the original style of “Heading 1”' : 'Rétablir le style d’origine de « Titre 1 »') && reset.disabled === 'true', reset);
    check(`${tag} : les deux lignes tiennent dans la largeur du menu, sans défilement de côté, et sont atteignables (la souris trouve la ligne au centre)`, update.insideFlyout && reset.insideFlyout && update.sideScroll <= 0 && update.underPointerIsRow && reset.underPointerIsRow && update.inViewport && reset.inViewport, { update, reset });
    check(`${tag} : la ligne de la mise à jour mesure au moins 24 px de haut (cible assez grande pour la souris)`, update.height >= 24, update.height);
    const numbering = await page.evaluate(() => { const b = document.querySelector('#v2-numbering-seg [data-num="article"]'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const f = document.getElementById('v2-heading-flyout').getBoundingClientRect(); return { inside: r.left >= f.left && r.right <= f.right && r.top >= f.top && r.bottom <= f.bottom }; });
    check(`${tag} : les boutons de numérotation, sous les deux lignes, restent atteignables en défilant le menu`, numbering.inside, numbering);

    console.log(`\n[${tag}] Un vrai clic sur « Mettre à jour »`);
    const clicked = await clickRow(page, 'v2-btn-heading-style-update');
    const after = await page.evaluate(() => ({
      styles: JSON.stringify(HeadingStyles.stylesOf(EditorCore.getEditor().state.doc)),
      focusInEditor: !!document.activeElement && !!document.activeElement.closest('.ProseMirror'),
      selection: EditorCore.getEditor().state.selection.from,
    }));
    check(`${tag} : le premier appui ne remonte pas le menu et laisse la ligne sous le pointeur`, clicked.during.underIsRow && clicked.during.scrollTop === clicked.before.scrollTop, clicked);
    check(`${tag} : le premier clic suffit : le style du niveau 1 est écrit dans le modèle`, after.styles === JSON.stringify({ 1: { italic: true, color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' } }), after.styles);
    check(`${tag} : l'éditeur garde le focus et la sélection (le clic n'a pas pris le focus)`, after.focusInEditor && after.selection > 0, after);
    await leaveMenu(page);
    const ones = await paintOf(page, `${EDITOR} h1`);
    const two = await paintOf(page, `${EDITOR} h2`);
    const para = await paintOf(page, `${EDITOR} p`);
    check(`${tag} : les trois titres 1 sont peints du style (24px, bleu, italique, Georgia), même celui qui était rouge à la main`, ones.length === 3 && ones.every(p => p.size === '24px' && p.color === 'rgb(31, 78, 121)' && p.italic === 'italic' && p.family === 'Georgia'), ones);
    check(`${tag} : le titre 2 et le paragraphe n'ont pas bougé`, two[0].size === '26.6667px' && two[0].italic === 'normal' && para[0].size === '14px' && para[0].italic === 'normal', { two, para });
    const updatedHtml = await HTML(page);

    await openMenu(page);
    const resetNow = await reachRow(page, 'v2-btn-heading-style-reset');
    check(`${tag} : « Rétablir » s'allume (le niveau a un style)`, resetNow.disabled === 'false', resetNow);
    const resetClick = await clickRow(page, 'v2-btn-heading-style-reset');
    await leaveMenu(page);
    const restored = await paintOf(page, `${EDITOR} h1`);
    check(`${tag} : un vrai clic sur « Rétablir » rend l'aspect d'origine des titres 1 (taille et poids de la balise, ni bleu ni italique)`, resetClick.during.underIsRow && restored.every(p => p.size === '32px' && p.italic === 'normal' && p.color !== 'rgb(31, 78, 121)'), { resetClick, restored });

    console.log(`\n[${tag}] Au vrai clavier : Ctrl+Z et Ctrl+Y`);
    // Rétablir est un geste de plus dans l'historique : un Ctrl+Z le défait, un second défait la mise à jour.
    await page.evaluate(() => EditorCore.getEditor().chain().focus().run());
    await page.keyboard.press('Control+z');
    await sleep(250);
    const undoReset = await HTML(page);
    await sleep(600);
    await page.keyboard.press('Control+z');
    await sleep(250);
    const undoUpdate = await HTML(page);
    check(`${tag} : un Ctrl+Z défait « Rétablir » (le style revient)`, undoReset === updatedHtml, { undoReset: undoReset.slice(0, 160) });
    check(`${tag} : un second Ctrl+Z défait la mise à jour d'un coup : le style ET la mise en forme à la main reviennent, octet pour octet`, undoUpdate === original, { undoUpdate: undoUpdate.slice(0, 200), original: original.slice(0, 200) });
    await page.keyboard.press('Control+y');
    await sleep(250);
    check(`${tag} : Ctrl+Y remet la mise à jour`, (await HTML(page)) === updatedHtml);

    console.log(`\n[${tag}] Le bloc des styles partagés, à la vraie souris`);
    await page.evaluate(() => Templates.updateDocumentSettings({ headingStyles: null }));
    await setDocument(page);
    const sharedStart = await HTML(page);
    const sharedOf = () => page.evaluate(() => JSON.stringify(Templates.getDocumentSetting('headingStyles') || null));
    const modelOf = () => page.evaluate(() => JSON.stringify(HeadingStyles.stylesOf(EditorCore.getEditor().state.doc)));
    const expectedShared = JSON.stringify({ 1: { italic: true, color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' } });
    await openMenu(page);
    const docUpdate = await reachRow(page, 'v2-btn-heading-style-doc-update');
    const docReset = await reachRow(page, 'v2-btn-heading-style-doc-reset');
    check(`${tag} : « Mettre à jour » du bloc partagé nomme le niveau et dit « partagé »`, docUpdate.text === (english ? 'Update shared “Heading 1” to match the selection' : 'Mettre à jour « Titre 1 » (partagé) d’après la sélection') && docUpdate.disabled === 'false', docUpdate);
    check(`${tag} : « Rétablir » du bloc partagé est grisée tant que le document n'a pas de style à ce niveau`, docReset.text === (english ? 'Restore the original style of shared “Heading 1”' : 'Rétablir le style d’origine de « Titre 1 » (partagé)') && docReset.disabled === 'true' && docReset.cursor === 'not-allowed', docReset);
    check(`${tag} : les deux lignes partagées tiennent dans le menu, sans défilement de côté, atteignables à la souris, d'au moins 24 px`, docUpdate.insideFlyout && docReset.insideFlyout && docUpdate.sideScroll <= 0 && docUpdate.underPointerIsRow && docReset.underPointerIsRow && docUpdate.height >= 24 && docReset.height >= 24, { docUpdate, docReset });
    const blocks = await page.evaluate(() => {
      const pick = (head, levels) => ({ head: document.getElementById(head).textContent, hint: document.getElementById(head).title, levels: document.getElementById(levels).textContent, chips: document.querySelectorAll('#' + levels + ' .pp-hs-chip').length });
      return { model: pick('v2-heading-scope-model', 'v2-heading-levels-model'), shared: pick('v2-heading-scope-document', 'v2-heading-levels-document') };
    });
    check(`${tag} : les deux blocs ont leur intitulé et leur infobulle, et disent « ${english ? 'None' : 'Aucun'} » sans style`,
      blocks.model.head === (english ? 'Template heading styles' : 'Styles de titres du modèle') && blocks.model.hint === (english ? 'With this template only' : 'Avec ce modèle seulement')
      && blocks.shared.head === (english ? 'Shared heading styles' : 'Styles de titres partagés') && blocks.shared.hint === (english ? 'For every template in this Grist document, shared with the team' : 'Pour tous les modèles de ce document Grist, partagés avec l’équipe')
      && blocks.model.levels === (english ? 'None' : 'Aucun') && blocks.shared.levels === (english ? 'None' : 'Aucun') && !blocks.model.chips && !blocks.shared.chips, blocks);
    const clickedShared = await clickRow(page, 'v2-btn-heading-style-doc-update');
    const afterShared = await page.evaluate(() => ({
      focusInEditor: !!document.activeElement && !!document.activeElement.closest('.ProseMirror'), selection: EditorCore.getEditor().state.selection.from,
    }));
    check(`${tag} : le premier appui ne remonte pas le menu et laisse la ligne sous le pointeur`, clickedShared.during.underIsRow && clickedShared.during.scrollTop === clickedShared.before.scrollTop, clickedShared);
    check(`${tag} : le premier clic suffit : le style est dans les réglages du document, pas dans le modèle`, (await sharedOf()) === expectedShared && (await modelOf()) === 'null', { shared: await sharedOf(), model: await modelOf() });
    check(`${tag} : l'éditeur garde le focus et la sélection`, afterShared.focusInEditor && afterShared.selection > 0, afterShared);
    const chip = await page.evaluate(() => {
      const el = document.querySelector('#v2-heading-levels-document .pp-hs-chip');
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      const f = document.getElementById('v2-heading-flyout').getBoundingClientRect();
      return { text: el.textContent, color: getComputedStyle(el).color, italic: getComputedStyle(el).fontStyle, inside: r.left >= f.left && r.right <= f.right && r.top >= f.top && r.bottom <= f.bottom, title: el.title, modelChips: document.querySelectorAll('#v2-heading-levels-model .pp-hs-chip').length };
    });
    check(`${tag} : le bloc partagé montre le niveau 1 en pastille (sa couleur, son italique, dans le menu), le bloc du modèle reste vide`, !!chip && chip.text === (english ? 'Heading 1' : 'Titre 1') && chip.color === 'rgb(31, 78, 121)' && chip.italic === 'italic' && chip.inside && chip.modelChips === 0 && chip.title.indexOf('Georgia') !== -1, chip);
    await leaveMenu(page);
    const sharedOnes = await paintOf(page, `${EDITOR} h1`);
    const sharedTwo = await paintOf(page, `${EDITOR} h2`);
    check(`${tag} : les trois titres 1 prennent le style du document (même celui qui était rouge à la main), le titre 2 non`, sharedOnes.length === 3 && sharedOnes.every(p => p.size === '24px' && p.color === 'rgb(31, 78, 121)' && p.italic === 'italic' && p.family === 'Georgia') && sharedTwo[0].italic === 'normal', { sharedOnes, sharedTwo });
    const sharedUpdatedHtml = await HTML(page);
    await openMenu(page);
    const docResetNow = await reachRow(page, 'v2-btn-heading-style-doc-reset');
    check(`${tag} : « Rétablir » du bloc partagé s'allume (le document a un style à ce niveau)`, docResetNow.disabled === 'false', docResetNow);
    const clickedReset = await clickRow(page, 'v2-btn-heading-style-doc-reset');
    await leaveMenu(page);
    const sharedRestored = await paintOf(page, `${EDITOR} h1`);
    check(`${tag} : un vrai clic sur « Rétablir » retire le style du document et rend leur aspect d'origine aux titres 1`, clickedReset.during.underIsRow && (await sharedOf()) === 'null' && sharedRestored.every(p => p.size === '32px' && p.italic === 'normal' && p.color !== 'rgb(31, 78, 121)'), { shared: await sharedOf(), sharedRestored });
    await page.evaluate(() => EditorCore.getEditor().chain().focus().run());
    await page.keyboard.press('Control+z');
    await sleep(350);
    check(`${tag} : un Ctrl+Z défait « Rétablir » : le style du document revient`, (await sharedOf()) === expectedShared && (await HTML(page)) === sharedUpdatedHtml, await sharedOf());
    await sleep(600);
    await page.keyboard.press('Control+z');
    await sleep(350);
    check(`${tag} : un second Ctrl+Z défait la mise à jour d'un coup : le style du document part ET la mise en forme à la main revient, octet pour octet`, (await sharedOf()) === 'null' && (await HTML(page)) === sharedStart, { shared: await sharedOf(), html: (await HTML(page)).slice(0, 160) });
    await page.keyboard.press('Control+y');
    await sleep(350);
    check(`${tag} : Ctrl+Y remet la mise à jour (le style du document et le texte)`, (await sharedOf()) === expectedShared && (await HTML(page)) === sharedUpdatedHtml);

    console.log(`\n[${tag}] Une ligne grisée ne fait rien`);
    await page.evaluate(() => { const ed = EditorCore.getEditor(); let at = -1; ed.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text.indexOf('Un paragraphe') === 0) at = pos; }); ed.chain().focus().setTextSelection(at + 3).run(); });
    await sleep(300);
    const grey = await HTML(page);
    await openMenu(page);
    const greyed = await reachRow(page, 'v2-btn-heading-style-update');
    await clickRow(page, 'v2-btn-heading-style-update');
    await leaveMenu(page);
    check(`${tag} : dans un paragraphe, « Mettre à jour » est grisée, son pointeur dit « interdit », un vrai clic ne change rien`, greyed.disabled === 'true' && greyed.cursor === 'not-allowed' && (await HTML(page)) === grey, greyed);

    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair');
  await pass('en', 'dark', 'anglais, sombre');
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
