#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent le ★ « modèle par défaut » du document, à la vraie souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine,
// en français clair puis en anglais sombre - suite de sa demande du 22/10 (« Il doit prendre en compte 100% des actions faites dans le widget ») et de sa réponse du 27/10 (« Oui, tout, Réglages compris »). Ce que
// dev-tests/scenarios-undo-library.js ne peut pas voir depuis la page : le vrai clic sur le bouton de la barre et sur l'étoile d'une ligne de la vraie liste, la touche frappée par le clavier lui-même (le focus sur le bouton
// qu'on vient de cliquer, puis dans l'éditeur), le clavier rendu à l'éditeur, la liste qui montre le ★ où il est.
//   1) le ★ posé au bouton de la barre : UN Ctrl + Z le retire (le focus passe à l'éditeur), UN Ctrl + Y le remet, puis les boutons Annuler et Rétablir de la barre, à la souris ;
//   2) le ★ pris à un autre modèle : Ctrl + Z le lui rend, Ctrl + Y puis Ctrl + Maj + Z le reprennent ;
//   3) l'étoile d'une ligne de la liste, au vrai clic : Ctrl + Z la défait, la liste montre le ★ là où il revient ;
//   4) un AUTRE modèle ouvert entre-temps, à la vraie liste : Ctrl + Z retire encore le ★, le modèle ouvert ne change pas, Ctrl + Y le remet ;
//   5) du texte, le ★, du texte : trois Ctrl + Z défont dans l'ordre inverse, trois Ctrl + Y les rendent dans l'ordre ;
//   6) le nom du modèle ouvert, donné au crayon (vrai clic sur le crayon, frappe, Entrée) : Ctrl + Z rend le nom d'avant - le champ et la liste -, Ctrl + Y le nom donné, puis les boutons de la barre ; du texte, le nom, du texte : trois
//      Ctrl + Z dans l'ordre inverse ;
//   7) le type, la qualité du PDF et les lignes d'export du modèle ouvert, choisis au vrai survol et au vrai clic des menus : chaque choix est un pas de Ctrl + Z, Ctrl + Y le rend, les boutons de la barre aussi, le texte et le choix
//      gardent leur ordre ;
//   8) la suppression d'un modèle, au vrai clic sur la corbeille puis sur « Supprimer » de la fenêtre : Ctrl + Z rend la ligne telle qu'elle était et rouvre le modèle (nom, texte, ★, choix d'export), Ctrl + Y le supprime de
//      nouveau, les boutons de la barre aussi, et rien n'est réécrit dans la table une fois le modèle rendu ;
//   9) le rangement de la personne, aux vrais clics : l'épingle d'une ligne de la liste, puis dans « Organiser mes modèles » le dossier tapé dans « Déplacer vers… » et le dossier « replié par défaut » : Ctrl + Z les défait dans
//      l'ordre inverse (la fenêtre refermée), Ctrl + Y les rend, les boutons de la barre aussi, le texte et l'épingle gardent leur ordre ;
//   10) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoLibraryMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-library-mouse.mjs
import { open, stopServer, sleep, click, clickHoverRow, chooseExportLines, pickTemplate, status } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_LIBRARY_MOUSE_PORT || 9158);
const SPEC = { models: { count: 3, paragraphs: 2 } };
const TYPE_MENU = '#v2-btn-quality';
const TYPE_ROW = name => '#v2-quality-flyout .v2-hover-row[data-export-type="' + name + '"]';
const QUALITY_ROW = name => '#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]';
const DIALOG_OK = '#pp-dialog-modal .var-modal-primary';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Les lignes marquées « par défaut » dans la table, telles que Grist les garde ; le ★ de la barre ; les lignes de la liste qui le portent ; le modèle ouvert ; le texte ; le focus.
const flagged = page => page.evaluate(() => { const t = window.__gristStub.state.rows.Publipostage_Modeles; return t.id.filter((id, i) => t.EstParDefaut && t.EstParDefaut[i]); });
const barStar = page => page.evaluate(() => document.getElementById('btn-set-default-template').classList.contains('is-default'));
const listMarks = page => page.evaluate(() => Array.from(document.getElementById('template-select').options).filter(o => /★/.test(o.textContent)).map(o => Number(o.value)));
const current = page => page.evaluate(() => Templates.getCurrentId());
const text = page => page.evaluate(() => EditorCore.getEditor().getText());
const inEditor = page => page.evaluate(() => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ProseMirror')));
const said = (page, key, name) => page.evaluate(({ key, name }) => I18n.t(key, { name }), { key, name });
async function key(page, combo, wait = 900) {
  await page.keyboard.press(combo);
  await sleep(wait);
}
// Le curseur à la fin du texte (la touche qui suit est frappée au vrai clavier).
async function toEnd(page) {
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await sleep(200);
}
// Repart d'une réserve vide : les gestes d'une partie ne se défont pas dans la suivante.
const forget = page => page.evaluate(() => { if (typeof ActionHistory !== 'undefined') ActionHistory.reset(); });
// Le nom que le champ du crayon et la liste montrent ; les trois choix d'export des listes cachées ; la ligne de type active du menu et le bouton du type.
const nameShown = page => page.evaluate(() => ({ field: document.getElementById('template-name').value, label: (document.querySelector('.tts-trigger .tts-trigger-label') || {}).textContent }));
const choices = page => page.evaluate(() => ['v2-export-type', 'v2-pdf-quality', 'v2-export-lines'].map(id => document.getElementById(id).value).join('|'));
const typeMenu = page => page.evaluate(() => ({ row: (document.querySelector('#v2-quality-flyout .v2-hover-row[data-export-type].is-active') || {dataset: {}}).dataset.exportType, lit: document.getElementById('v2-btn-quality').classList.contains('active') }));
// Enregistre (le bouton de la barre, cliqué par la page) : changer de modèle derrière un texte ou un nom en attente poserait la question « Enregistrer / Abandonner / Annuler ».
const saved = async page => { await page.evaluate(() => document.getElementById('btn-save').click()); await sleep(900); };
// Le crayon, au vrai clic et au vrai clavier : le champ s'ouvre avec le nom choisi, la frappe le remplace, Entrée valide.
async function renameByPencil(page, name) {
  await click(page, '#btn-rename-template');
  await sleep(250);
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await sleep(500);
}

// La ligne `id` de la table des modèles telle que Grist la garde, sur les colonnes que le widget porte (js/templates.js : ROW_COLUMNS) ; null si elle n'existe pas. La liste, ce qui s'est écrit dans la table des modèles.
const ROW_COLUMNS = ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif', 'HeaderFooter', 'Margins', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet', 'SuiviModifications', 'Jeton', 'ModifiePar'];
const rowOf = (page, id) => page.evaluate(({ id, columns }) => {
  const row = window.__gristStub.getRow('Publipostage_Modeles', id);
  if (!row) return null;
  const out = {};
  columns.forEach(column => { if (column in row) out[column] = row[column]; });
  return out;
}, { id, columns: ROW_COLUMNS });
const inList = (page, id) => page.evaluate(id => Array.from(document.getElementById('template-select').options).some(option => option.value === String(id)), id);
const modelWrites = page => page.evaluate(() => window.__gristStub.getActionLog().filter(action => action[1] === 'Publipostage_Modeles').map(action => [action[0], action[2]]));
const clearWrites = page => page.evaluate(() => window.__gristStub.clearActionLog());
const sameRow = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Le rangement de la personne tel que Grist le garde (la dernière ligne qui convient, comme TemplatePreferences la lit) : l'épingle et le dossier d'un modèle, le dossier « replié par défaut ». Puis ce que la liste montre.
const pinOf = (page, id) => page.evaluate(id => { const t = window.__gristStub.state.rows.Publipostage_PreferencesModeles; if (!t) return false; let at = -1; t.id.forEach((r, i) => { if (Number(t.ModeleId[i]) === id) at = i; }); return at !== -1 && !!t.Epingle[at]; }, id);
const folderOf = (page, id) => page.evaluate(id => { const t = window.__gristStub.state.rows.Publipostage_PreferencesModeles; if (!t) return ''; let at = -1; t.id.forEach((r, i) => { if (Number(t.ModeleId[i]) === id) at = i; }); return at === -1 ? '' : (t.Dossier[at] || ''); }, id);
const collapsedOf = (page, path) => page.evaluate(path => { const t = window.__gristStub.state.rows.Publipostage_PreferencesModeles; if (!t) return false; let at = -1; t.id.forEach((r, i) => { if (Number(t.ModeleId[i]) === 0 && t.Dossier[i] === path) at = i; }); return at !== -1 && !!(t.Replie && t.Replie[at]); }, path);
const pinnedShown = page => page.evaluate(() => {
  const names = [];
  let inPinned = false;
  Array.from(document.querySelector('.tts-popup').children).forEach(node => {
    if (node.classList.contains('tts-section-label')) inPinned = node.textContent === I18n.t('templateTree.pinnedSection');
    else if (inPinned && node.classList.contains('tts-row-leaf')) names.push(node.querySelector('.tts-row-label').textContent.replace(/ ★| 📌/g, '').trim());
  });
  return names;
});
const foldersShown = page => page.evaluate(() => Array.from(document.querySelectorAll('.tts-popup .tts-row-folder')).map(row => row.querySelector('.tts-row-label').textContent));
const popupOpen = page => page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0; });
const saidWith = (page, key, params) => page.evaluate(({ key, params }) => I18n.t(key, params), { key, params });
// Le vrai clic sur un élément que la page désigne (`find`, évaluée dans la page) : ramené en vue d'abord, puis le pointeur y va et clique.
async function clickWhere(page, find, arg) {
  const pos = await page.evaluate(({ src, arg }) => {
    const element = (new Function('arg', 'return (' + src + ')(arg)'))(arg);
    if (!element) return null;
    element.scrollIntoView({ block: 'nearest' });
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { src: find.toString(), arg });
  if (!pos) throw new Error('introuvable : ' + find.toString());
  await page.mouse.move(pos.x - 20, pos.y);
  await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(pos.x, pos.y);
}
// L'épingle d'une ligne de la liste des modèles, au vrai clic : la liste s'ouvre si elle ne l'est pas, puis se referme.
async function pinInList(page, id) {
  if (!(await popupOpen(page))) { await click(page, '.tts-trigger'); await sleep(350); }
  await clickWhere(page, id => document.querySelector(`.tts-popup .tts-row-leaf[data-template-id="${id}"] .tts-pin-btn`), id);
  await sleep(500);
  if (await popupOpen(page)) { await click(page, '.tts-trigger'); await sleep(350); }
}

async function phase(lang, theme) {
  const tag = `${lang}/${theme}`;
  const w = await open({ spec: SPEC, port: PORT, theme, lang });
  const { page } = w;
  console.log(`\n=== Ctrl + Z et le ★ du modèle par défaut, vraie souris et vrai clavier, 700x400, ${lang === 'fr' ? 'français clair' : 'anglais sombre'} ===`);
  try {
    // --- 1) le bouton de la barre ---
    await pickTemplate(page, 'Modèle 0001');
    await click(page, '#btn-set-default-template');
    await sleep(700);
    check(`${tag} 1 : le vrai clic pose le ★ sur le modèle ouvert`, JSON.stringify(await flagged(page)) === '[1]' && await barStar(page) && JSON.stringify(await listMarks(page)) === '[1]', { flagged: await flagged(page) });
    await key(page, 'Control+z');
    check(`${tag} 1 : Ctrl + Z (le focus sur le bouton cliqué) retire le ★ : table, barre, liste`, JSON.stringify(await flagged(page)) === '[]' && !(await barStar(page)) && JSON.stringify(await listMarks(page)) === '[]', { flagged: await flagged(page), bar: await barStar(page) });
    check(`${tag} 1 : le coin d'état dit ce qui a été défait`, (await status(page)) === await said(page, 'status.defaultTemplateCleared', 'Modèle 0001'), await status(page));
    check(`${tag} 1 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+y');
    check(`${tag} 1 : Ctrl + Y remet le ★`, JSON.stringify(await flagged(page)) === '[1]' && await barStar(page), { flagged: await flagged(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 1 : le bouton Annuler de la barre retire le ★`, JSON.stringify(await flagged(page)) === '[]' && !(await barStar(page)), { flagged: await flagged(page) });
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 1 : le bouton Rétablir de la barre le remet`, JSON.stringify(await flagged(page)) === '[1]' && await barStar(page), { flagged: await flagged(page) });

    // --- 2) le ★ pris à un autre modèle ---
    await forget(page);
    await pickTemplate(page, 'Modèle 0002');
    await click(page, '#btn-set-default-template');
    await sleep(700);
    check(`${tag} 2 : le ★ passe de 0001 à 0002`, JSON.stringify(await flagged(page)) === '[2]', await flagged(page));
    await key(page, 'Control+z');
    check(`${tag} 2 : Ctrl + Z le rend à 0001`, JSON.stringify(await flagged(page)) === '[1]' && JSON.stringify(await listMarks(page)) === '[1]' && !(await barStar(page)), { flagged: await flagged(page), marks: await listMarks(page) });
    check(`${tag} 2 : le coin d'état nomme 0001`, (await status(page)) === await said(page, 'status.defaultTemplateSet', 'Modèle 0001'), await status(page));
    await key(page, 'Control+y');
    check(`${tag} 2 : Ctrl + Y le reprend pour 0002`, JSON.stringify(await flagged(page)) === '[2]' && await barStar(page), await flagged(page));
    await key(page, 'Control+z');
    await key(page, 'Control+Shift+z');
    check(`${tag} 2 : Ctrl + Maj + Z rétablit de même`, JSON.stringify(await flagged(page)) === '[2]', await flagged(page));

    // --- 3) l'étoile d'une ligne de la vraie liste ---
    await forget(page);
    await click(page, '.tts-trigger');
    await sleep(500);
    await click(page, '.tts-popup .tts-row-leaf[data-template-id="3"] .tts-star-btn');
    await sleep(800);
    check(`${tag} 3 : le vrai clic sur l'étoile de la ligne 0003 la pose`, JSON.stringify(await flagged(page)) === '[3]', await flagged(page));
    await page.keyboard.press('Escape');
    await sleep(400);
    await key(page, 'Control+z');
    check(`${tag} 3 : Ctrl + Z rend le ★ à 0002, la liste le montre`, JSON.stringify(await flagged(page)) === '[2]' && JSON.stringify(await listMarks(page)) === '[2]', { flagged: await flagged(page), marks: await listMarks(page) });
    await key(page, 'Control+y');
    check(`${tag} 3 : Ctrl + Y le repose sur 0003`, JSON.stringify(await flagged(page)) === '[3]', await flagged(page));

    // --- 4) un autre modèle ouvert entre-temps ---
    await forget(page);
    await pickTemplate(page, 'Modèle 0001');
    await click(page, '#btn-set-default-template');
    await sleep(700);
    check(`${tag} 4 : le ★ passe sur 0001`, JSON.stringify(await flagged(page)) === '[1]', await flagged(page));
    await pickTemplate(page, 'Modèle 0003');
    await key(page, 'Control+z');
    check(`${tag} 4 : depuis 0003, Ctrl + Z rend le ★ à 0003 (il y était avant) sans changer de modèle`, JSON.stringify(await flagged(page)) === '[3]' && (await current(page)) === 3, { flagged: await flagged(page), current: await current(page) });
    await key(page, 'Control+y');
    check(`${tag} 4 : Ctrl + Y le remet sur 0001`, JSON.stringify(await flagged(page)) === '[1]' && (await current(page)) === 3, { flagged: await flagged(page), current: await current(page) });

    // --- 5) l'ordre avec le texte ---
    await forget(page);
    await pickTemplate(page, 'Modèle 0002');
    await toEnd(page);
    await page.keyboard.type(' UN');
    await sleep(700);
    await click(page, '#btn-set-default-template');
    await sleep(700);
    await toEnd(page);
    await page.keyboard.type(' DEUX');
    await sleep(700);
    check(`${tag} 5 : le texte et le ★ sont posés`, /UN DEUX/.test(await text(page)) && JSON.stringify(await flagged(page)) === '[2]', { text: await text(page), flagged: await flagged(page) });
    await key(page, 'Control+z');
    check(`${tag} 5 : 1er Ctrl + Z : « DEUX » seul`, !/DEUX/.test(await text(page)) && / UN/.test(await text(page)) && JSON.stringify(await flagged(page)) === '[2]', { text: await text(page), flagged: await flagged(page) });
    await key(page, 'Control+z');
    check(`${tag} 5 : 2e Ctrl + Z : le ★ seul`, / UN/.test(await text(page)) && JSON.stringify(await flagged(page)) === '[1]', { text: await text(page), flagged: await flagged(page) });
    await key(page, 'Control+z');
    check(`${tag} 5 : 3e Ctrl + Z : « UN »`, !/ UN/.test(await text(page)), await text(page));
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 5 : 2e Ctrl + Y : « UN » et le ★`, / UN/.test(await text(page)) && !/DEUX/.test(await text(page)) && JSON.stringify(await flagged(page)) === '[2]', { text: await text(page), flagged: await flagged(page) });
    await key(page, 'Control+y');
    check(`${tag} 5 : 3e Ctrl + Y : « DEUX »`, /UN DEUX/.test(await text(page)) && JSON.stringify(await flagged(page)) === '[2]', { text: await text(page), flagged: await flagged(page) });

    // --- 6) le nom du modèle, au crayon ---
    await saved(page);
    await forget(page);
    await pickTemplate(page, 'Modèle 0001');
    await renameByPencil(page, 'Nom au crayon');
    check(`${tag} 6 : le vrai crayon donne le nom : le champ et la liste`, JSON.stringify(await nameShown(page)) === JSON.stringify({ field: 'Nom au crayon', label: 'Nom au crayon' }), await nameShown(page));
    await key(page, 'Control+z');
    check(`${tag} 6 : Ctrl + Z rend le nom d'avant : le champ et la liste`, JSON.stringify(await nameShown(page)) === JSON.stringify({ field: 'Modèle 0001', label: 'Modèle 0001' }), await nameShown(page));
    check(`${tag} 6 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+y');
    check(`${tag} 6 : Ctrl + Y redonne le nom`, JSON.stringify(await nameShown(page)) === JSON.stringify({ field: 'Nom au crayon', label: 'Nom au crayon' }), await nameShown(page));
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 6 : le bouton Annuler de la barre rend le nom d'avant`, (await nameShown(page)).field === 'Modèle 0001', await nameShown(page));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 6 : le bouton Rétablir de la barre redonne le nom`, (await nameShown(page)).field === 'Nom au crayon', await nameShown(page));
    await saved(page);
    await forget(page);
    await pickTemplate(page, 'Modèle 0003');
    await toEnd(page);
    await page.keyboard.type(' UN');
    await sleep(700);
    await renameByPencil(page, 'Nom du troisième');
    await toEnd(page);
    await page.keyboard.type(' DEUX');
    await sleep(700);
    check(`${tag} 6 : le texte et le nom sont posés`, /UN DEUX/.test(await text(page)) && (await nameShown(page)).field === 'Nom du troisième', { text: await text(page), name: await nameShown(page) });
    await key(page, 'Control+z');
    check(`${tag} 6 : 1er Ctrl + Z : « DEUX » seul`, !/DEUX/.test(await text(page)) && / UN/.test(await text(page)) && (await nameShown(page)).field === 'Nom du troisième', { text: await text(page), name: await nameShown(page) });
    await key(page, 'Control+z');
    check(`${tag} 6 : 2e Ctrl + Z : le nom seul`, / UN/.test(await text(page)) && (await nameShown(page)).field === 'Modèle 0003', { text: await text(page), name: await nameShown(page) });
    await key(page, 'Control+z');
    check(`${tag} 6 : 3e Ctrl + Z : « UN »`, !/ UN/.test(await text(page)), await text(page));
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 6 : 2e Ctrl + Y : « UN » et le nom`, / UN/.test(await text(page)) && !/DEUX/.test(await text(page)) && (await nameShown(page)).field === 'Nom du troisième', { text: await text(page), name: await nameShown(page) });
    await key(page, 'Control+y');
    check(`${tag} 6 : 3e Ctrl + Y : « DEUX »`, /UN DEUX/.test(await text(page)), await text(page));

    // --- 7) le type, la qualité et les lignes d'export, aux vrais menus ---
    await saved(page);
    await forget(page);
    await pickTemplate(page, 'Modèle 0002');
    check(`${tag} 7 : au départ le PDF vectoriel, une seule ligne`, await choices(page) === 'pdf|native|one', await choices(page));
    await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('light'));
    await sleep(300);
    await chooseExportLines(page, 'zip');
    await sleep(300);
    await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
    await sleep(400);
    check(`${tag} 7 : les trois vrais clics posent la qualité, les lignes et le type`, await choices(page) === 'docx|light|zip', await choices(page));
    await page.mouse.move(40, 370);
    await sleep(300);
    await key(page, 'Control+z');
    check(`${tag} 7 : 1er Ctrl + Z : le type seul, le menu et le bouton suivent`, await choices(page) === 'pdf|light|zip' && JSON.stringify(await typeMenu(page)) === JSON.stringify({ row: 'pdf', lit: false }), { choices: await choices(page), menu: await typeMenu(page) });
    check(`${tag} 7 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+z');
    check(`${tag} 7 : 2e Ctrl + Z : les lignes`, await choices(page) === 'pdf|light|one', await choices(page));
    await key(page, 'Control+z');
    check(`${tag} 7 : 3e Ctrl + Z : la qualité`, await choices(page) === 'pdf|native|one', await choices(page));
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 7 : trois Ctrl + Y rendent les trois choix, le bouton du type est allumé`, await choices(page) === 'docx|light|zip' && (await typeMenu(page)).lit === true, { choices: await choices(page), menu: await typeMenu(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 7 : le bouton Annuler de la barre défait le type`, await choices(page) === 'pdf|light|zip', await choices(page));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 7 : le bouton Rétablir de la barre le rend`, await choices(page) === 'docx|light|zip', await choices(page));
    await toEnd(page);
    await page.keyboard.type(' TEXTE');
    await sleep(700);
    await clickHoverRow(page, TYPE_MENU, TYPE_ROW('md'));
    await sleep(400);
    await page.mouse.move(40, 370);
    await sleep(300);
    await key(page, 'Control+z');
    check(`${tag} 7 : le dernier Ctrl + Z défait le type (Markdown), le texte reste`, (await choices(page)).split('|')[0] === 'docx' && /TEXTE/.test(await text(page)), { choices: await choices(page), text: await text(page) });
    await key(page, 'Control+z');
    check(`${tag} 7 : le Ctrl + Z suivant défait le texte`, !/TEXTE/.test(await text(page)) && (await choices(page)).split('|')[0] === 'docx', { choices: await choices(page), text: await text(page) });

    // --- 8) supprimer un modèle, aux vrais clics ---
    await saved(page);
    await forget(page);
    await pickTemplate(page, 'Modèle 0002');
    const kept = await rowOf(page, 2);
    const keptText = await text(page);
    const keptChoices = await choices(page);
    const keptStar = await flagged(page);
    check(`${tag} 8 : au départ le modèle 0002 est ouvert, avec son ★ et ses choix d'export`, kept !== null && JSON.stringify(keptStar) === '[2]' && (await current(page)) === 2 && keptChoices.split('|')[0] !== 'pdf', { star: keptStar, choices: keptChoices });
    await click(page, '#btn-delete');
    await sleep(500);
    await click(page, DIALOG_OK);
    await sleep(900);
    check(`${tag} 8 : les vrais clics suppriment la ligne, la liste ne la montre plus, l'écran est vierge`, (await rowOf(page, 2)) === null && !(await inList(page, 2)) && (await current(page)) === null && (await text(page)) === '', { current: await current(page), text: await text(page) });
    await clearWrites(page);
    await key(page, 'Control+z');
    check(`${tag} 8 : Ctrl + Z rend la ligne telle qu'elle était, sous le même numéro`, sameRow(await rowOf(page, 2), kept), { row: await rowOf(page, 2) });
    check(`${tag} 8 : une seule écriture dans la table des modèles`, JSON.stringify(await modelWrites(page)) === '[["AddRecord",2]]', await modelWrites(page));
    check(`${tag} 8 : la liste le montre, l'écran l'a rouvert avec son texte, son ★ et ses choix d'export`, (await inList(page, 2)) && (await current(page)) === 2 && (await text(page)) === keptText && JSON.stringify(await flagged(page)) === '[2]' && (await barStar(page)) && (await choices(page)) === keptChoices, { current: await current(page), text: await text(page), flagged: await flagged(page), choices: await choices(page) });
    check(`${tag} 8 : le coin d'état dit que le modèle est rétabli`, (await status(page)) === await said(page, 'status.templateRestored', 'Modèle 0002'), await status(page));
    check(`${tag} 8 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+y');
    check(`${tag} 8 : Ctrl + Y le supprime de nouveau : la ligne, la liste, l'écran vierge`, (await rowOf(page, 2)) === null && !(await inList(page, 2)) && (await current(page)) === null && (await text(page)) === '', { current: await current(page), text: await text(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 8 : le bouton Annuler de la barre le rend, identique`, sameRow(await rowOf(page, 2), kept) && (await current(page)) === 2, { row: await rowOf(page, 2), current: await current(page) });
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 8 : le bouton Rétablir de la barre le supprime`, (await rowOf(page, 2)) === null && (await current(page)) === null, { current: await current(page) });
    await key(page, 'Control+z');
    check(`${tag} 8 : Ctrl + Z le rend une dernière fois, identique`, sameRow(await rowOf(page, 2), kept) && (await current(page)) === 2, { row: await rowOf(page, 2) });
    await clearWrites(page);
    await sleep(4500);
    check(`${tag} 8 : rien n'est réécrit dans la table des modèles une fois le modèle rendu (l'enregistrement automatique n'a rien à enregistrer)`, JSON.stringify(await modelWrites(page)) === '[]', await modelWrites(page));

    // --- 9) le rangement de la personne : l'épingle, le dossier, le dossier replié par défaut, aux vrais clics ---
    // Les noms d'ici : 0001 et 0003 ont reçu le leur à la partie 6.
    const ONE = 'Nom au crayon', TWO = 'Modèle 0002', THREE = 'Nom du troisième';
    await saved(page);
    await forget(page);
    await pickTemplate(page, ONE);
    await clearWrites(page);
    await pinInList(page, 3);
    check(`${tag} 9 : le vrai clic sur l'épingle de la liste épingle le troisième modèle : table, cache et section « Épinglés »`, (await pinOf(page, 3)) && (await page.evaluate(() => TemplatePreferences.isPinned(3))) && JSON.stringify(await pinnedShown(page)) === JSON.stringify([THREE]), { table: await pinOf(page, 3), shown: await pinnedShown(page) });
    check(`${tag} 9 : le modèle ouvert n'a pas changé, rien n'est écrit dans la table des modèles`, (await current(page)) === 1 && JSON.stringify(await modelWrites(page)) === '[]', { current: await current(page), writes: await modelWrites(page) });
    await toEnd(page);
    await key(page, 'Control+z');
    check(`${tag} 9 : Ctrl + Z retire l'épingle : table, cache et section « Épinglés »`, !(await pinOf(page, 3)) && !(await page.evaluate(() => TemplatePreferences.isPinned(3))) && JSON.stringify(await pinnedShown(page)) === '[]', { table: await pinOf(page, 3), shown: await pinnedShown(page) });
    check(`${tag} 9 : le coin d'état dit ce qui a été défait`, (await status(page)) === await said(page, 'status.templateUnpinned', THREE), await status(page));
    check(`${tag} 9 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+y');
    check(`${tag} 9 : Ctrl + Y la repose`, (await pinOf(page, 3)) && JSON.stringify(await pinnedShown(page)) === JSON.stringify([THREE]), { table: await pinOf(page, 3), shown: await pinnedShown(page) });
    check(`${tag} 9 : le coin d'état dit ce qui a été rétabli`, (await status(page)) === await said(page, 'status.templatePinned', THREE), await status(page));

    // « Organiser mes modèles » : 0002 rangé dans un dossier imbriqué, par la saisie « Déplacer vers… », puis ce dossier réglé « replié par défaut ».
    await click(page, '.tts-trigger');
    await sleep(350);
    await click(page, '#btn-organize-templates');
    await sleep(500);
    await clickWhere(page, () => document.querySelector('#template-organize-list .tts-row-leaf[data-template-id="2"] .tom-move-btn'));
    await sleep(500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Rangés/Sous');
    await click(page, DIALOG_OK);
    await sleep(700);
    check(`${tag} 9 : « Déplacer vers… » (la frappe au vrai clavier) range le deuxième modèle dans « Rangés/Sous »`, (await folderOf(page, 2)) === 'Rangés/Sous', await folderOf(page, 2));
    await clickWhere(page, () => {
      const row = Array.from(document.querySelectorAll('#template-organize-list .tts-row-folder')).find(r => r.querySelector('.tts-row-label').textContent === 'Sous');
      return row && row.querySelector('.tom-folder-default-btn');
    });
    await sleep(600);
    check(`${tag} 9 : le vrai clic sur l'interrupteur du dossier le règle « replié par défaut »`, await collapsedOf(page, 'Rangés/Sous'), await collapsedOf(page, 'Rangés/Sous'));
    await click(page, '#template-organize-close');
    await sleep(500);
    await toEnd(page);
    await key(page, 'Control+z');
    check(`${tag} 9 : Ctrl + Z (la fenêtre refermée) rend le dossier déplié par défaut, le deuxième modèle reste rangé`, !(await collapsedOf(page, 'Rangés/Sous')) && (await folderOf(page, 2)) === 'Rangés/Sous', { collapsed: await collapsedOf(page, 'Rangés/Sous'), folder: await folderOf(page, 2) });
    check(`${tag} 9 : le coin d'état nomme le dossier`, (await status(page)) === await saidWith(page, 'status.folderExpanded', { folder: 'Rangés/Sous' }), await status(page));
    await key(page, 'Control+z');
    check(`${tag} 9 : le 2e Ctrl + Z remet le deuxième modèle hors de tout dossier : la table et la liste`, (await folderOf(page, 2)) === '' && !(await foldersShown(page)).includes('Sous'), { folder: await folderOf(page, 2), folders: await foldersShown(page) });
    check(`${tag} 9 : le coin d'état dit que le modèle est sorti de son dossier`, (await status(page)) === await said(page, 'status.templateUnfiled', TWO), await status(page));
    check(`${tag} 9 : l'épingle du troisième modèle, plus ancienne, est restée`, await pinOf(page, 3), await pinOf(page, 3));
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 9 : deux Ctrl + Y rangent le deuxième modèle et replient le dossier de nouveau`, (await folderOf(page, 2)) === 'Rangés/Sous' && await collapsedOf(page, 'Rangés/Sous'), { folder: await folderOf(page, 2), collapsed: await collapsedOf(page, 'Rangés/Sous') });
    check(`${tag} 9 : le coin d'état nomme le dossier replié`, (await status(page)) === await saidWith(page, 'status.folderCollapsed', { folder: 'Rangés/Sous' }), await status(page));
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 9 : le bouton Annuler de la barre déplie le dossier`, !(await collapsedOf(page, 'Rangés/Sous')), await collapsedOf(page, 'Rangés/Sous'));
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 9 : le bouton Annuler de la barre défait le rangement du deuxième modèle`, (await folderOf(page, 2)) === '', await folderOf(page, 2));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 9 : le bouton Rétablir de la barre range le deuxième modèle et replie le dossier`, (await folderOf(page, 2)) === 'Rangés/Sous' && await collapsedOf(page, 'Rangés/Sous'), { folder: await folderOf(page, 2), collapsed: await collapsedOf(page, 'Rangés/Sous') });

    // Du texte, une épingle, du texte : trois Ctrl + Z dans l'ordre inverse, trois Ctrl + Y dans l'ordre.
    await saved(page);
    await forget(page);
    await toEnd(page);
    await page.keyboard.type(' RANG');
    await sleep(700);
    await pinInList(page, 1);
    await toEnd(page);
    await page.keyboard.type(' ORDRE');
    await sleep(700);
    check(`${tag} 9 : le texte, l'épingle du premier modèle, le texte`, / RANG/.test(await text(page)) && / ORDRE/.test(await text(page)) && await pinOf(page, 1), { text: await text(page), pinned: await pinOf(page, 1) });
    await key(page, 'Control+z');
    check(`${tag} 9 : 1er Ctrl + Z : le second texte seul`, !/ ORDRE/.test(await text(page)) && / RANG/.test(await text(page)) && await pinOf(page, 1), { text: await text(page), pinned: await pinOf(page, 1) });
    await key(page, 'Control+z');
    check(`${tag} 9 : 2e Ctrl + Z : l'épingle seule`, / RANG/.test(await text(page)) && !(await pinOf(page, 1)), { text: await text(page), pinned: await pinOf(page, 1) });
    await key(page, 'Control+z');
    check(`${tag} 9 : 3e Ctrl + Z : le premier texte`, !/ RANG/.test(await text(page)) && !(await pinOf(page, 1)), await text(page));
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 9 : 2e Ctrl + Y : le premier texte et l'épingle`, / RANG/.test(await text(page)) && await pinOf(page, 1) && !/ ORDRE/.test(await text(page)), { text: await text(page), pinned: await pinOf(page, 1) });
    await key(page, 'Control+y');
    check(`${tag} 9 : 3e Ctrl + Y : le second texte`, / ORDRE/.test(await text(page)) && await pinOf(page, 1), await text(page));

    check(`${tag} 10 : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await phase('fr', 'light');
  await phase('en', 'dark');
} finally {
  await stopServer();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
