#!/usr/bin/env node
// Les mises en forme gardées au survol du pinceau (js/format-slots.js, js/format-slots-menu.js), à la VRAIE souris et au vrai clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre
// (22/10, lancé le 02/11 : « 3 mises en forme personnelles renommables », gardées dans le modèle et partagées par le document comme les couleurs favorites).
//   1) Le survol du pinceau ouvre le menu : son intitulé (le nom du pinceau et sa touche), les deux blocs de trois places, tout dans la fenêtre, chaque ligne atteignable (la souris trouve le bouton au centre,
//      en défilant le menu si besoin), des cibles d'au moins 24 px ; le bouton du pinceau reste sur la même rangée de la barre.
//   2) Un vrai clic sur une place vide du modèle puis du document : la mise en forme du curseur y est gardée sous « Mise en forme N », l'éditeur garde le focus et la sélection, le coin d'état le dit.
//   3) Un vrai clic sur le nom d'une place avec une sélection : le paragraphe est mis en forme (taille, couleur, gras, italique, centré), le menu se range sous le pointeur ; sans sélection la ligne est grisée,
//      son pointeur dit « interdit » et un vrai clic ne change rien.
//   4) Au vrai clavier : Ctrl+Z défait l'application d'un coup, Ctrl+Y la remet.
//   5) Le crayon ouvre la fenêtre « Renommer la mise en forme » (dans la fenêtre de 700x400, le nom actuel sélectionné), Entrée renomme ; un nom de 40 caractères tient dans le menu (le nom est coupé, les boutons restent).
//   6) La corbeille du modèle retire d'un clic ; celle d'une mise en forme partagée pose d'abord la question (Annuler la garde, Retirer la retire) ; Ctrl+Z rend l'une et l'autre.
//   7) Un vrai clic sur le bouton du pinceau arme le pinceau et referme le menu tout de suite, souris dessus (le groupe est marqué `data-close-on-click`).
//   8) Le clavier seul : le focus sur le bouton ouvre le menu, Tab entre dans la première place, Entrée garde / retire / renomme (le focus reste dans le menu, à la place du geste, même quand la ligne est redessinée),
//      Entrée sur un nom peint la sélection et rend le focus au texte.
//   9) Aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « formatSlotsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-format-slots-mouse.mjs
import { open, stopServer, sleep, center } from './load-lib.mjs';

const PORT = Number(process.env.FORMAT_SLOTS_MOUSE_PORT || 9081);
const EDITOR = '#editor-container .ProseMirror';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const SAMPLE = '<p>Source ordinaire</p><p>Cible une</p><p>Cible deux</p>';
const HTML = page => page.evaluate(() => Editor.getHTML());
const FLYOUT = '#v2-painter-flyout';

async function setDocument(page) {
  await page.evaluate((html) => { PageLayout.setMarginsMm(null); Editor.setHTML(html); }, SAMPLE);
  await sleep(300);
  // « Source ordinaire » : gras, italique, Georgia 18 pt, rouge, paragraphe centré.
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    let range = null;
    ed.state.doc.descendants((n, pos) => { if (!range && n.isText && n.text === 'Source ordinaire') range = { from: pos, to: pos + n.text.length }; });
    ed.chain().focus().setTextSelection(range).setMark('textStyle', { fontFamily: 'Georgia', fontSize: '18pt', color: '#c00000' }).toggleBold().toggleItalic().setTextAlign('center').run();
    ed.chain().focus().setTextSelection(range.from + 3).run();
  });
  await sleep(500);
}
const selectParagraph = (page, needle) => page.evaluate((text) => {
  const ed = EditorCore.getEditor();
  let at = null;
  ed.state.doc.descendants((n, pos) => { if (!at && n.isText && n.text.indexOf(text) === 0) at = ed.state.doc.resolve(pos); });
  ed.chain().focus().setTextSelection({ from: at.start(), to: at.end() }).run();
}, needle).then(() => sleep(350));
const caretIn = (page, needle) => page.evaluate((text) => {
  const ed = EditorCore.getEditor();
  let at = -1;
  ed.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text.indexOf(text) === 0) at = pos; });
  ed.chain().focus().setTextSelection(at + 3).run();
}, needle).then(() => sleep(350));

// Ouvre le menu au survol du pinceau, comme la personne, et le garde ouvert souris dedans.
async function openMenu(page) {
  const button = await center(page, '#v2-btn-format-painter');
  await page.mouse.move(button.x - 20, button.y);
  await page.mouse.move(button.x, button.y, { steps: 4 });
  await sleep(450);
  const inside = await page.evaluate(() => { const r = document.getElementById('v2-painter-flyout').getBoundingClientRect(); return { x: r.left + 30, y: r.top + 20 }; });
  await page.mouse.move(button.x, button.y + 15, { steps: 3 });
  await page.mouse.move(inside.x, inside.y, { steps: 6 });
  await sleep(250);
}
const selectorOf = (scope, slot, action) => `${FLYOUT} button[data-scope="${scope}"][data-slot="${slot}"][data-action="${action}"]`;
const info = (page, selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel);
  if (!node) return null;
  const flyout = document.getElementById('v2-painter-flyout');
  const f = flyout.getBoundingClientRect();
  const b = node.getBoundingClientRect();
  const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    text: node.textContent, label: node.getAttribute('aria-label'), title: node.title, disabled: node.getAttribute('aria-disabled'), x: b.left + b.width / 2, y: b.top + b.height / 2, width: Math.round(b.width), height: Math.round(b.height),
    insideFlyout: b.left >= f.left - 0.5 && b.right <= f.right + 0.5 && b.top >= f.top - 0.5 && b.bottom <= f.bottom + 0.5, sideScroll: flyout.scrollWidth - flyout.clientWidth,
    underPointerIsIt: !!under && (under === node || node.contains(under)), cursor: getComputedStyle(node).cursor, inViewport: b.bottom <= innerHeight && b.top >= 0 && b.right <= innerWidth,
  };
}, selector);
// Défile le menu jusqu'au bouton (molette, souris dedans), puis le mesure.
async function reach(page, selector) {
  let found = await info(page, selector);
  for (let i = 0; i < 8 && found && !(found.insideFlyout && found.underPointerIsIt && found.inViewport); i++) {
    const pointer = await page.evaluate(() => { const r = document.getElementById('v2-painter-flyout').getBoundingClientRect(); return { x: r.left + 30, y: Math.min(r.bottom - 10, innerHeight - 10) }; });
    await page.mouse.move(pointer.x, pointer.y, { steps: 2 });
    await page.mouse.wheel(0, 90);
    await sleep(250);
    found = await info(page, selector);
  }
  return found;
}
// Un vrai clic : le pointeur va au bouton (le menu défilé jusque-là), appui, relâchement.
async function clickButton(page, selector) {
  const target = await reach(page, selector);
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await sleep(150);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  await sleep(400);
  return target;
}
const leaveMenu = async page => { await page.mouse.move(350, 392, { steps: 6 }); await sleep(500); };
const slotsOf = (page, scope) => page.evaluate(id => FormatSlots.slots(id).map(slot => slot && slot.name), scope);
const paint = (page, needle) => page.evaluate((text) => {
  const p = Array.from(document.querySelectorAll('#editor-container .ProseMirror p')).find(el => el.textContent.indexOf(text) === 0);
  // Le style du texte lui-même (l'élément le plus profond qui le porte : les marques s'emboîtent), celui du paragraphe pour l'alignement.
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const cs = getComputedStyle(walker.nextNode().parentElement);
  const paragraph = getComputedStyle(p);
  return { size: cs.fontSize, color: cs.color, weight: cs.fontWeight, italic: cs.fontStyle, align: paragraph.textAlign };
}, needle);
const modalState = page => page.evaluate(() => {
  const modal = document.getElementById('pp-dialog-modal');
  if (!modal || getComputedStyle(modal).display === 'none') return null;
  const box = modal.querySelector('.pp-dialog-box') || modal.firstElementChild;
  const r = box.getBoundingClientRect();
  const input = document.getElementById('pp-dialog-input');
  return { title: (document.getElementById('pp-dialog-title') || {}).textContent, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, value: input && getComputedStyle(input).display !== 'none' ? input.value : null, selected: input ? input.selectionStart === 0 && input.selectionEnd === input.value.length : null };
});

async function pass(lang, theme, tag) {
  const w = await open({ spec: {}, port: PORT, settleMs: 1500, theme, lang });
  const page = w.page;
  const english = lang === 'en';
  const T = (fr, en) => (english ? en : fr);
  try {
    console.log(`\n[${tag}] Le survol du pinceau ouvre le menu`);
    await setDocument(page);
    const rowBefore = await page.evaluate(() => { const b = document.getElementById('v2-btn-format-painter').getBoundingClientRect(); return Math.round(b.top); });
    await openMenu(page);
    const head = await page.evaluate(() => {
      const flyout = document.getElementById('v2-painter-flyout');
      const f = flyout.getBoundingClientRect();
      const label = flyout.firstElementChild;
      return {
        open: getComputedStyle(flyout).display !== 'none', label: label.textContent, keytip: label.getAttribute('data-keytip'),
        scopes: Array.from(flyout.querySelectorAll('.pp-fs-scope')).map(node => node.textContent), empties: flyout.querySelectorAll('.pp-fs-empty').length,
        inWindow: f.left >= 0 && f.right <= innerWidth && f.top >= 0 && f.bottom <= innerHeight + 1, scrolls: flyout.scrollHeight > flyout.clientHeight + 1,
        button: Math.round(document.getElementById('v2-btn-format-painter').getBoundingClientRect().top), ariaExpanded: document.getElementById('v2-btn-format-painter').getAttribute('aria-expanded'),
      };
    });
    check(`${tag} : le survol ouvre le menu, qui tient dans la fenêtre (il défile s'il le faut), sous un intitulé qui nomme le pinceau et sa touche`, head.open && head.inWindow && head.label === T('Reproduire la mise en forme', 'Format painter') && head.keytip === T(' (Alt+Maj+C)', ' (Alt+Shift+C)'), head);
    check(`${tag} : deux blocs, « ${T('Mises en forme du modèle', 'Template formats')} » et « ${T('Mises en forme partagées', 'Shared formats')} », six places vides`, head.scopes.join('|') === T('Mises en forme du modèle|Mises en forme partagées', 'Template formats|Shared formats') && head.empties === 6, head);
    check(`${tag} : le bouton du pinceau n'a pas bougé de rangée et son info-bulle ne recouvre pas le menu (aria-expanded)`, head.button === rowBefore && head.ariaExpanded === 'true', { rowBefore, head });
    const first = await reach(page, selectorOf('model', 0, 'save'));
    const last = await reach(page, selectorOf('document', 2, 'save'));
    check(`${tag} : la première et la dernière place sont atteignables (la souris trouve le bouton au centre, dans le menu, sans défilement de côté), de 24 px de haut au moins`, !!first && !!last && first.underPointerIsIt && last.underPointerIsIt && first.insideFlyout && last.insideFlyout && first.sideScroll <= 0 && first.height >= 24 && last.height >= 24, { first, last });
    check(`${tag} : la place vide dit « ${T('Garder la mise en forme du texte', 'Keep the text’s formatting')} »`, first.text === '+ ' + T('Garder la mise en forme du texte', 'Keep the text’s formatting'), first.text);

    console.log(`\n[${tag}] Un vrai clic sur une place vide garde la mise en forme du curseur`);
    const kept = await clickButton(page, selectorOf('model', 0, 'save'));
    const afterKeep = await page.evaluate(() => ({
      model: FormatSlots.slots('model').map(slot => slot && slot.name), status: document.getElementById('status-msg').textContent,
      focusInEditor: !!document.activeElement && !!document.activeElement.closest('.ProseMirror'), selection: EditorCore.getEditor().state.selection.from,
      slot: FormatSlots.slots('model')[0],
    }));
    check(`${tag} : le premier clic suffit : la place 1 du modèle porte « ${T('Mise en forme 1', 'Format 1')} », sa mise en forme (gras, italique, Georgia, 18 pt, rouge, centré)`, afterKeep.model[0] === T('Mise en forme 1', 'Format 1') && afterKeep.slot.style.bold && afterKeep.slot.style.italic && afterKeep.slot.style.fontSize === '18pt' && afterKeep.slot.style.color === '#c00000' && afterKeep.slot.block.align === 'center', afterKeep);
    check(`${tag} : le coin d'état le dit et l'éditeur garde le focus et la sélection (le clic n'a pas pris le focus)`, afterKeep.status.indexOf(T('gardée dans ce modèle', 'kept in this template')) !== -1 && afterKeep.focusInEditor && afterKeep.selection > 0, afterKeep);
    const nameButton = await info(page, selectorOf('model', 0, 'apply'));
    check(`${tag} : la ligne montre maintenant le nom, un crayon et une corbeille de 24 px, dans le menu`, !!nameButton && nameButton.text === T('Mise en forme 1', 'Format 1') && nameButton.insideFlyout && (await info(page, selectorOf('model', 0, 'rename'))).width >= 24 && (await info(page, selectorOf('model', 0, 'clear'))).height >= 24, nameButton);
    await clickButton(page, selectorOf('document', 1, 'save'));
    const shared = await page.evaluate(() => ({ names: FormatSlots.slots('document').map(slot => slot && slot.name), json: (Templates.getDocumentSettings().textFormats || []).map(slot => slot && slot.name) }));
    check(`${tag} : la place 2 partagée garde aussi la mise en forme (dans les réglages du document)`, shared.names[1] === T('Mise en forme 2', 'Format 2') && shared.json[1] === shared.names[1] && shared.names[0] === null, shared);
    await leaveMenu(page);

    console.log(`\n[${tag}] Un vrai clic sur le nom d'une place peint la sélection`);
    await selectParagraph(page, 'Cible une');
    const original = await HTML(page);
    await openMenu(page);
    const usable = await reach(page, selectorOf('model', 0, 'apply'));
    check(`${tag} : avec une sélection la ligne n'est pas grisée et dit « ${T('Appliquer à la sélection', 'Apply to the selection')} »`, usable.disabled === null && usable.title === T('Appliquer à la sélection', 'Apply to the selection'), usable);
    await clickButton(page, selectorOf('model', 0, 'apply'));
    const painted = await paint(page, 'Cible une');
    const focus = await page.evaluate(() => ({ focusInEditor: !!document.activeElement && !!document.activeElement.closest('.ProseMirror'), flyoutShown: getComputedStyle(document.getElementById('v2-painter-flyout')).display !== 'none', other: document.querySelectorAll('#editor-container .ProseMirror p')[2].style.cssText }));
    check(`${tag} : « Cible une » est mise en forme (18 pt = 24px, rouge, gras, italique, centré), « Cible deux » non`, painted.size === '24px' && painted.color === 'rgb(192, 0, 0)' && Number(painted.weight) >= 600 && painted.italic === 'italic' && painted.align === 'center' && (await paint(page, 'Cible deux')).size === '14px', painted);
    check(`${tag} : le menu se range sous le pointeur après l'application et le focus revient au texte`, !focus.flyoutShown && focus.focusInEditor, focus);
    const applied = await HTML(page);
    await leaveMenu(page);

    console.log(`\n[${tag}] Au vrai clavier : Ctrl+Z et Ctrl+Y`);
    await page.evaluate(() => EditorCore.getEditor().chain().focus().run());
    await page.keyboard.press('Control+z');
    await sleep(300);
    check(`${tag} : un Ctrl+Z défait l'application d'un coup, octet pour octet`, (await HTML(page)) === original, { now: (await HTML(page)).slice(0, 200), original: original.slice(0, 200) });
    await page.keyboard.press('Control+y');
    await sleep(300);
    check(`${tag} : Ctrl+Y la remet`, (await HTML(page)) === applied);

    console.log(`\n[${tag}] Sans sélection, la ligne est grisée et ne fait rien`);
    await caretIn(page, 'Cible deux');
    const before = await HTML(page);
    await openMenu(page);
    const greyed = await reach(page, selectorOf('model', 0, 'apply'));
    await clickButton(page, selectorOf('model', 0, 'apply'));
    await leaveMenu(page);
    check(`${tag} : au curseur, la ligne est grisée (« ${T('Sélectionnez le texte à mettre en forme.', 'Select the text to format.')} »), le pointeur dit « interdit » et un vrai clic ne change rien`, greyed.disabled === 'true' && greyed.title === T('Sélectionnez le texte à mettre en forme.', 'Select the text to format.') && greyed.cursor === 'not-allowed' && (await HTML(page)) === before, greyed);

    console.log(`\n[${tag}] Le crayon renomme`);
    await openMenu(page);
    await clickButton(page, selectorOf('model', 0, 'rename'));
    const asked = await modalState(page);
    check(`${tag} : la fenêtre « ${T('Renommer la mise en forme', 'Rename the format')} » tient dans la fenêtre et montre le nom actuel sélectionné`, !!asked && asked.title === T('Renommer la mise en forme', 'Rename the format') && asked.inside && asked.value === T('Mise en forme 1', 'Format 1') && asked.selected, asked);
    await page.keyboard.type('Mon rouge');
    await page.keyboard.press('Enter');
    await sleep(500);
    check(`${tag} : Entrée renomme : « Mon rouge » (le menu l'a déjà redessiné)`, (await slotsOf(page, 'model'))[0] === 'Mon rouge' && !(await modalState(page)), await slotsOf(page, 'model'));
    await leaveMenu(page);
    await page.evaluate(() => EditorCore.getEditor().chain().focus().run());
    await page.keyboard.press('Control+z');
    await sleep(300);
    check(`${tag} : un Ctrl+Z rend l'ancien nom`, (await slotsOf(page, 'model'))[0] === T('Mise en forme 1', 'Format 1'), await slotsOf(page, 'model'));
    await page.keyboard.press('Control+y');
    await sleep(300);
    // Un nom de 40 caractères : coupé dans le menu, les boutons restent.
    await openMenu(page);
    await clickButton(page, selectorOf('model', 0, 'rename'));
    await page.keyboard.type('N'.repeat(10) + ' ' + 'très long nom de mise en forme gardée'.slice(0, 29));
    await page.keyboard.press('Enter');
    await sleep(500);
    await openMenu(page);
    const longRow = await reach(page, selectorOf('model', 0, 'apply'));
    const longClear = await reach(page, selectorOf('model', 0, 'clear'));
    check(`${tag} : un nom de 40 caractères est coupé dans le menu : ni défilement de côté, ni bouton hors du menu`, longRow.sideScroll <= 0 && longRow.insideFlyout && longClear.insideFlyout && longClear.underPointerIsIt, { longRow, longClear });
    await leaveMenu(page);

    console.log(`\n[${tag}] La corbeille retire, avec une question pour une mise en forme partagée`);
    await openMenu(page);
    await clickButton(page, selectorOf('model', 0, 'clear'));
    check(`${tag} : la corbeille du modèle retire d'un clic, sans question`, (await slotsOf(page, 'model'))[0] === null && !(await modalState(page)), await slotsOf(page, 'model'));
    await clickButton(page, selectorOf('document', 1, 'clear'));
    const question = await modalState(page);
    check(`${tag} : la corbeille d'une mise en forme partagée pose d'abord la question « ${T('Retirer « Mise en forme 2 » ?', 'Remove “Format 2”?')} » (dans la fenêtre)`, !!question && question.title === T('Retirer « Mise en forme 2 » ?', 'Remove “Format 2”?') && question.inside, question);
    await page.click('#pp-dialog-modal .pp-dialog-cancel, #pp-dialog-modal .var-modal-actions button:not(.var-modal-primary)');
    await sleep(400);
    check(`${tag} : Annuler garde la mise en forme partagée`, (await slotsOf(page, 'document'))[1] === T('Mise en forme 2', 'Format 2'), await slotsOf(page, 'document'));
    await openMenu(page);
    await clickButton(page, selectorOf('document', 1, 'clear'));
    await page.click('#pp-dialog-modal .var-modal-primary');
    await sleep(500);
    check(`${tag} : « ${T('Retirer', 'Remove')} » la retire`, (await slotsOf(page, 'document'))[1] === null, await slotsOf(page, 'document'));
    await leaveMenu(page);
    await page.evaluate(() => EditorCore.getEditor().chain().focus().run());
    await page.keyboard.press('Control+z');
    await sleep(900);
    check(`${tag} : un Ctrl+Z rend la mise en forme partagée`, (await slotsOf(page, 'document'))[1] === T('Mise en forme 2', 'Format 2'), await slotsOf(page, 'document'));
    await page.keyboard.press('Control+z');
    await sleep(900);
    check(`${tag} : le Ctrl+Z suivant rend celle du modèle retirée avant`, (await slotsOf(page, 'model'))[0] !== null, await slotsOf(page, 'model'));

    // Le bouton garde son geste : un vrai clic copie la mise en forme du texte et arme le pinceau, et referme le menu tout de suite (le groupe est marqué `data-close-on-click`, comme Enregistrer) : le menu resté ouvert
    // sous la souris recouvrirait le texte qu'on vise ensuite.
    console.log(`\n[${tag}] Un vrai clic sur le bouton du pinceau : il arme le pinceau et referme le menu`);
    await caretIn(page, 'Source');
    const painterButton = await center(page, '#v2-btn-format-painter');
    await page.mouse.move(painterButton.x - 20, painterButton.y);
    await page.mouse.move(painterButton.x, painterButton.y, { steps: 4 });
    await sleep(450);
    const shownBeforeClick = await page.evaluate(() => getComputedStyle(document.getElementById('v2-painter-flyout')).display !== 'none');
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    await sleep(350);
    const afterButtonClick = await page.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('v2-painter-flyout')).display !== 'none', expanded: document.getElementById('v2-btn-format-painter').getAttribute('aria-expanded'),
      armed: FormatPainter.isArmed(), focusInEditor: !!document.activeElement && !!document.activeElement.closest('.ProseMirror'),
    }));
    check(`${tag} : le survol ouvre le menu, puis un vrai clic sur le bouton arme le pinceau et le referme tout de suite, souris encore dessus, sans prendre le focus du texte`, shownBeforeClick && !afterButtonClick.shown && afterButtonClick.expanded === 'false' && afterButtonClick.armed && afterButtonClick.focusInEditor, { shownBeforeClick, afterButtonClick });
    await page.evaluate(() => FormatPainter.disarm());
    await leaveMenu(page);

    // Le clavier seul : Tab depuis le bouton du pinceau entre dans le menu, Entrée sur une ligne fait le geste et le focus RESTE dans le menu, à la place du geste, même quand la ligne est redessinée (le bouton qui le
    // portait part avec l'ancien dessin : sans le correctif de js/format-slots-menu.js, le menu se refermait et le focus tombait sur la page).
    console.log(`\n[${tag}] Au clavier seul, dans le menu : Tab, Entrée, le focus ne se perd pas`);
    await page.evaluate(async () => { PageLayout.setCustomFormats([]); await Templates.updateDocumentSettings({ textFormats: null }); FormatSlotsMenu.render(); });
    await caretIn(page, 'Source');
    const where = () => page.evaluate(() => {
      const a = document.activeElement;
      return {
        at: a && a.dataset && a.dataset.scope ? `${a.dataset.scope}/${a.dataset.slot}/${a.dataset.action}` : (a ? (a.id || (a.closest && a.closest('.ProseMirror') ? 'éditeur' : a.tagName)) : null),
        shown: getComputedStyle(document.getElementById('v2-painter-flyout')).display !== 'none', expanded: document.getElementById('v2-btn-format-painter').getAttribute('aria-expanded'),
      };
    });
    await page.focus('#v2-btn-format-painter'); // ce que fait Tab jusqu'au bouton
    await sleep(300);
    const onButton = await where();
    check(`${tag} : le focus sur le bouton du pinceau ouvre le menu`, onButton.at === 'v2-btn-format-painter' && onButton.shown && onButton.expanded === 'true', onButton);
    await page.keyboard.press('Tab');
    await sleep(200);
    const firstRow = await where();
    check(`${tag} : Tab entre dans le menu, sur la première place du modèle`, firstRow.at === 'model/0/save' && firstRow.shown, firstRow);
    await page.keyboard.press('Enter');
    await sleep(450);
    const keptByKey = await where();
    check(`${tag} : Entrée garde la mise en forme, le menu reste ouvert et le focus passe à la ligne de cette place`, (await slotsOf(page, 'model'))[0] === T('Mise en forme 1', 'Format 1') && keptByKey.at === 'model/0/apply' && keptByKey.shown, { keptByKey, names: await slotsOf(page, 'model') });
    await page.keyboard.press('Tab');
    await sleep(120);
    const pencil = await where();
    await page.keyboard.press('Tab');
    await sleep(120);
    const trash = await where();
    await page.keyboard.press('Tab');
    await sleep(120);
    const secondPlace = await where();
    check(`${tag} : Tab suit la ligne (nom, crayon, corbeille) puis la place suivante`, pencil.at === 'model/0/rename' && trash.at === 'model/0/clear' && secondPlace.at === 'model/1/save' && secondPlace.shown, { pencil, trash, secondPlace });
    await page.keyboard.press('Shift+Tab');
    await sleep(120);
    await page.keyboard.press('Enter');
    await sleep(450);
    const clearedByKey = await where();
    check(`${tag} : Maj+Tab puis Entrée sur la corbeille retire la mise en forme du modèle sans question, le menu reste ouvert, le focus passe à la place vide`, (await slotsOf(page, 'model'))[0] === null && !(await modalState(page)) && clearedByKey.at === 'model/0/save' && clearedByKey.shown, { clearedByKey, names: await slotsOf(page, 'model') });
    await page.keyboard.press('Enter');
    await sleep(450);
    await page.keyboard.press('Tab');
    await sleep(120);
    await page.keyboard.press('Enter'); // le crayon
    await sleep(500);
    const renaming = await modalState(page);
    await page.keyboard.type('Au clavier');
    await page.keyboard.press('Enter');
    await sleep(500);
    const renamedByKey = await where();
    check(`${tag} : Entrée sur le crayon ouvre la fenêtre, Entrée la valide, le focus revient au crayon et le menu est ouvert`, !!renaming && (await slotsOf(page, 'model'))[0] === 'Au clavier' && !(await modalState(page)) && renamedByKey.at === 'model/0/rename' && renamedByKey.shown, { renaming, renamedByKey, names: await slotsOf(page, 'model') });
    await selectParagraph(page, 'Cible une');
    await page.focus('#v2-btn-format-painter');
    await sleep(300);
    await page.keyboard.press('Tab');
    await sleep(200);
    const applyRow = await where();
    await page.keyboard.press('Enter');
    await sleep(500);
    const afterApplyByKey = await where();
    const paintedByKey = await paint(page, 'Cible une');
    check(`${tag} : Entrée sur le nom peint la sélection (Georgia 18 pt, rouge) et rend le focus au texte, le menu rangé`, applyRow.at === 'model/0/apply' && paintedByKey.size === '24px' && paintedByKey.color === 'rgb(192, 0, 0)' && afterApplyByKey.at === 'éditeur' && !afterApplyByKey.shown, { applyRow, afterApplyByKey, paintedByKey });

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
