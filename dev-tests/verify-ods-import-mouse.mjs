#!/usr/bin/env node
// L'IMPORT d'un tableur OpenDocument (js/ods-import.js, ligne « Importer un OpenDocument… » du menu « + », js/main-import.js `importOdsFile`) à la VRAIE souris et avec un VRAI sélecteur de fichier
// (page.waitForEvent('filechooser') : Chromium n'ouvre le sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist (~700x400), hébergé par GFS (simulé par dev-tests/gfs-stub.js) :
// français clair, puis anglais sombre. dev-tests/scenarios-ods-import.js (groupe « odsImport ») vérifie, DANS la page, ce que l'import écrit ; une page.evaluate ne déclenche ni un geste « trusted », ni
// un vrai sélecteur de fichier : c'est ici qu'on s'assure que
//  - le sélecteur de la ligne « Importer un OpenDocument… » accepte aussi les tableurs (.ods, .ots, .fods) à côté des documents texte, toujours pour un seul fichier, sans Word, Excel ni PowerPoint ;
//  - un tableur à trois feuilles dont une masquée ouvre la VRAIE liste des feuilles (deux lignes, dans l'ordre, la masquée absente), sous le « + », atteignable et lisible ; Échap la referme sans rien importer ;
//  - le clic sur une feuille fait une NOUVELLE grille sans nom : le coin d'état dit laquelle (« Feuille « Détail » (2 sur 2) importée : 3 lignes, 2 colonnes »), le texte est celui que le tableur affiche,
//    la ligne masquée n'est pas là, et la fenêtre du rapport dit ce qui n'est pas repris (une formule, une ligne masquée) puis rend la main à la grille ;
//  - un tableur d'une seule feuille n'ouvre pas de liste ; avec une grille à enregistrer, « Modifications non enregistrées » vient APRÈS le choix du fichier : « Annuler » garde la grille, « Ne pas enregistrer » importe ;
//  - les fichiers refusés (une présentation, un tableur vide, un fichier protégé, un fichier qui n'est pas un zip) : un message clair en rouge, aucune fenêtre, rien ne change.
// Lancé par run-headless.mjs (groupe Node « odsImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-ods-import-mouse.mjs
// ODS_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';
import { hoverRow, clickHoverRow, makeUnsaved } from './load-lib.mjs';

const SHOTS = process.env.ODS_IMPORT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-ods-import-mouse', port: Number(process.env.ODS_IMPORT_MOUSE_PORT || 9097) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEED = seedModels();
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-odf';
const SHEET_MIME = 'application/vnd.oasis.opendocument.spreadsheet';

const TEXTS = {
  fr: {
    row: 'Importer un OpenDocument…', placeholder: 'Rechercher une feuille…', unsaved: 'Modifications non enregistrées', discard: 'Ne pas enregistrer', cancel: 'Annuler', close: 'Fermer',
    savedAs: name => `Enregistré dans Grist sous « ${name} ». `, importedSheet: /^Enregistré dans Grist sous « ventes ». Feuille « Détail » \(2 sur 2\) importée : 3 lignes, 2 colonnes\./, imported: 'OpenDocument importé : 2 lignes, 2 colonnes.', importedPattern: /importé/,
    reportTitle: 'Ce que l’import n’a pas repris tel quel', reportIntro: 'Le classeur est importé. Il avait ceci, que la grille n’a pas pu reprendre tel quel :', report: ['1 formule remplacée par son résultat', '1 ligne masquée non reprise'],
    drawing: 'Ce fichier OpenDocument est un dessin : seuls les textes, tableurs et présentations sont lus.', drawingPattern: /est un dessin/,
    empty: 'Ce tableur ne contient aucune case à importer.', emptyPattern: /ne contient aucune case/,
    encrypted: 'Fichier OpenDocument protégé par un mot de passe : enregistrez-le sans mot de passe.', encryptedPattern: /protégé par un mot de passe/,
    unreadable: 'Ce fichier n’est pas un document OpenDocument lisible.', unreadablePattern: /n’est pas un document OpenDocument/,
  },
  en: {
    row: 'Import from OpenDocument…', placeholder: 'Search for a sheet…', unsaved: 'Unsaved changes', discard: 'Don’t save', cancel: 'Cancel', close: 'Close',
    savedAs: name => `Saved to Grist as “${name}”. `, importedSheet: /^Saved to Grist as “ventes”\. Sheet “Détail” \(2 of 2\) imported: 3 rows, 2 columns\./, imported: 'OpenDocument imported: 2 rows, 2 columns.', importedPattern: /imported/,
    reportTitle: 'What the import did not carry over as is', reportIntro: 'The workbook is imported. It had the following, which the grid could not carry over as is:', report: ['1 formula replaced by its result', '1 hidden row not imported'],
    drawing: 'This OpenDocument file is a drawing: only texts, spreadsheets and presentations are read.', drawingPattern: /is a drawing/,
    empty: 'This spreadsheet has no cells to import.', emptyPattern: /has no cells/,
    encrypted: 'Password-protected OpenDocument file: save it without a password.', encryptedPattern: /Password-protected/,
    unreadable: 'This file is not a readable OpenDocument file.', unreadablePattern: /not a readable OpenDocument/,
  },
};

// ---- Les fichiers de l'essai : fabriqués dans la page avec les briques de dev-tests/scenarios-ods-import.js (aucun fichier binaire dans le dépôt) ------------------------------------------------------------
// `sales` : trois feuilles (Résumé, Détail, Brouillon masquée) ; `small` : une seule feuille de 2 x 2 ; `drawing`, `emptySheet`, `locked`, `notZip`.
const buildFile = async (page, kind) => Buffer.from(await page.evaluate(async (which) => {
  const F = window.OdsFixtures;
  const { ods, text, num, row, sheet, cellStyle } = F;
  const hide = '<style:style style:name="ta2" style:family="table"><style:table-properties table:display="false"/></style:style>';
  const kinds = {
    sales: () => ({
      auto: hide + cellStyle('ce1', { textProps: 'fo:font-weight="bold"' }),
      sheets: [
        sheet('Résumé', [row([text('Produit', 'ce1'), text('Total', 'ce1')]), row([text('Stylo'), num('12', 12)])]),
        sheet('Détail', [
          row([text('Mois', 'ce1'), text('Montant', 'ce1')]), row([text('Janvier'), num('1 250,00 €', 1250)]),
          row([text('Caché'), num('0', 0)], 'table:visibility="collapse"'),
          row([text('Total'), '<table:table-cell office:value-type="float" office:value="1250" table:formula="of:=SUM([.B2:.B2])"><text:p>1 250,00 €</text:p></table:table-cell>']),
        ]),
        sheet('Brouillon', [row([text('brouillon')])], { style: 'ta2' }),
      ],
    }),
    small: () => ({ sheets: [sheet('Seule', [row([text('Nom'), text('Âge')]), row([text('Ana'), num('31', 31)])])] }),
    drawing: () => ({ mime: 'application/vnd.oasis.opendocument.graphics', bodyTag: 'office:drawing', sheets: '<draw:page draw:name="p1"/>' }),
    emptySheet: () => ({ sheets: [sheet('Vide', [row([F.blank(3)], 'table:number-rows-repeated="1048576"')])] }),
    locked: () => ({ encrypted: true }),
  };
  const buffer = await ods(kinds[which]());
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}, kind), 'base64');
const odsFile = (name, buffer, mimeType = SHEET_MIME) => ({ name, mimeType, buffer });

// ---- Ce que la page montre ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// `whole` : le texte se lit en entier, dans le coin ou, trop long pour lui (il finit alors par « … »), dans sa bulle de survol (`title`, posée à l'entrée de la souris).
const statusOf = async page => {
  const s = await page.evaluate(() => {
    const el = document.getElementById('status-msg');
    const r = el.getBoundingClientRect();
    return { text: el.textContent, error: el.classList.contains('error-msg'), clipped: el.scrollWidth > el.clientWidth + 1, inPanel: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  if (s.clipped) { s.tooltip = await page.evaluate(() => { const el = document.getElementById('status-msg'); el.dispatchEvent(new MouseEvent('mouseenter')); return el.title; }); }
  return { ...s, whole: !s.clipped || s.tooltip === s.text };
};
// Les lignes de la table des documents dans Grist (le faux Grist du test) : ce que l'import y a écrit, relu.
const stored = page => page.evaluate(() => { const t = window.__gristStub.state.rows.Publipostage_Modeles; return t.id.map((id, i) => ({ id, name: t.Nom[i], length: String(t.Contenu[i] || '').length })); });
const SEED_IDS = [1, 2, 3, 4, 5, 6];   // les lignes déjà là avant tout import (seedModels)
// Attend que le coin d'état annonce l'enregistrement sous le nom du fichier `base` (le texte d'un import précédent ne compte pas : il ne porte pas ce nom).
const settleSaved = async (page, base) => {
  await page.waitForFunction(b => { const t = document.getElementById('status-msg').textContent; return t.includes('« ' + b) || t.includes('“' + b); }, base, { timeout: 30000 }).catch(() => {});
  await sleep(600);
};
const dialogState = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  const shown = !!ov && getComputedStyle(ov).display !== 'none';
  if (!shown) return { shown: false, title: '', message: '', buttons: [] };
  const box = ov.querySelector('.pp-dialog-box') || ov.firstElementChild;
  const message = ov.querySelector('.pp-dialog-message');
  const buttons = Array.from(ov.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && b.getClientRects().length);
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const title = ov.querySelector('#pp-dialog-title');
  const inPanel = r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  return {
    shown, title: title ? title.textContent : '', message: message ? message.textContent : '', buttons: buttons.map(b => b.textContent.trim()),
    boxInPanel: inPanel(rect(box)), buttonsInPanel: buttons.every(b => inPanel(rect(b))), focusOn: document.activeElement ? document.activeElement.textContent.trim().slice(0, 30) : '',
  };
});
async function clickDialogButton(page, label) {
  const target = await page.evaluate((wanted) => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const button = Array.from(ov.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && b.getClientRects().length).find(b => b.textContent.trim() === wanted);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, reachable: !!top && button.contains(top), inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }, label);
  if (!target) return null;
  await page.mouse.move(target.x - 8, target.y, { steps: 2 });
  await page.mouse.click(target.x, target.y);
  await sleep(450);
  return target;
}
const parkMouse = async page => { await page.mouse.move(WIDTH - 10, HEIGHT - 10, { steps: 3 }); await sleep(350); };
// La liste des feuilles (js/grid-xlsx-import.js:chooseSheet) telle que la personne la voit : ses lignes (atteignables à la souris), la zone de recherche et son focus, la place qu'elle prend sous le « + ».
const sheetList = page => page.evaluate(() => {
  const panel = document.querySelector('#v2-xlsx-sheet-search .ss-panel');
  if (!panel || panel.hidden) return null;
  const r = panel.getBoundingClientRect();
  const input = panel.querySelector('.ss-input');
  const plus = document.getElementById('btn-new').getBoundingClientRect();
  const rows = Array.from(panel.querySelectorAll('.ss-option')).map((row) => {
    const rr = row.getBoundingClientRect();
    const top = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
    return { text: row.querySelector('.ss-name').textContent, x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, reachable: !!top && row.contains(top), inPanel: rr.left >= 0 && rr.top >= 0 && rr.right <= innerWidth && rr.bottom <= innerHeight };
  });
  return {
    rows, placeholder: input.placeholder, focused: document.activeElement === input,
    inPanel: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    belowPlus: r.top >= plus.bottom - 1 && r.top <= plus.bottom + 24 && r.left <= plus.left + plus.width / 2 && r.right >= plus.left + plus.width / 2,
  };
});
async function waitForSheetList(page) {
  await page.waitForFunction(() => { const panel = document.querySelector('#v2-xlsx-sheet-search .ss-panel'); return !!panel && !panel.hidden; }, null, { timeout: 30000 }).catch(() => {});
  await sleep(300);
  return sheetList(page);
}
const gridState = page => page.evaluate(() => ({ active: GridEditor.isActive(), text: EditorCore.getEditor().state.doc.textContent, html: Editor.getHTML(), select: document.getElementById('template-select').value }));
const focusInText = page => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));

async function pickFile(page, file) {
  const waiting = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  await page.evaluate(() => 0);
  await sleep(250);
  await clickHoverRow(page, PLUS, ROW);
  const chooser = await waiting;
  await parkMouse(page);
  const askedBefore = await dialogState(page);
  if (chooser && file) await chooser.setFiles(file);
  return { chooser, askedBefore };
}
const settle = async (page, pattern) => {
  await page.waitForFunction(source => {
    const text = document.getElementById('status-msg').textContent;
    const ov = document.getElementById('pp-dialog-modal');
    return new RegExp(source).test(text) || (!!ov && getComputedStyle(ov).display !== 'none');
  }, pattern.source, { timeout: 30000 }).catch(() => {});
  await sleep(600);
};

async function run(lang, scheme) {
  const T = TEXTS[lang];
  const label = (lang === 'fr' ? 'français' : 'anglais') + ' ' + (scheme === 'dark' ? 'sombre' : 'clair');
  const tag = `[${lang} ${scheme}] `;
  console.log(`\n=== Import d'un tableur OpenDocument à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { page, requests, natives } = await t.openPage({ hosted: true, stub: { extensions: ['graphique'] }, seed: SEED, lang, colorScheme: scheme, storage: { pp_autosave_enabled: 'false' } }); // enregistrement automatique coupé : une modification reste « à enregistrer » jusqu'au geste de la personne
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${scheme}-${name}.png`) }); };
  await page.addScriptTag({ url: '/dev-tests/scenarios-ods-import.js' });
  const engineRequests = () => requests.filter(url => /js\/ods-import\.js/.test(url)).length;

  // 1) Le vrai sélecteur : un seul fichier, les documents texte ET les tableurs OpenDocument, ni Word, ni Excel, ni PowerPoint ; annuler ne change rien ; le moteur du tableur n'a pas été demandé.
  const before = await statusOf(page);
  const { chooser } = await pickFile(page, null);
  check(tag + 'un vrai clic sur la ligne ouvre le vrai sélecteur de fichier', !!chooser);
  if (!chooser) return;
  const accept = await chooser.element().getAttribute('accept');
  check(tag + 'le sélecteur accepte les documents texte (.odt, .ott, .fodt) et les tableurs (.ods, .ots, .fods) OpenDocument, pour un seul fichier, sans Word, Excel ni PowerPoint',
    !chooser.isMultiple() && ['.odt', '.ott', '.fodt', '.ods', '.ots', '.fods'].every(ext => accept.split(',').includes(ext)) && /opendocument\.spreadsheet/.test(accept) && !/docx|xlsx|pptx|\.md\b/.test(accept), { accept, multiple: chooser.isMultiple() });
  await chooser.element().evaluate(el => el.dispatchEvent(new Event('cancel')));
  await sleep(500);
  check(tag + 'annuler dans le sélecteur ne change rien : même message d\'état, aucune fenêtre, le moteur du tableur pas encore demandé au réseau',
    (await statusOf(page)).text === before.text && !(await dialogState(page)).shown && engineRequests() === 0, { engine: engineRequests() });

  // 2) Trois feuilles dont une masquée : la liste des feuilles s'ouvre ; Échap la referme sans rien importer.
  const sales = odsFile('ventes.ods', await buildFile(page, 'sales'));
  await pickFile(page, sales);
  const list = await waitForSheetList(page);
  check(tag + 'la liste des feuilles s\'ouvre : « Résumé » puis « Détail », la feuille masquée n\'y est pas', !!list && list.rows.map(r => r.text).join('|') === 'Résumé|Détail', list && list.rows.map(r => r.text));
  check(tag + `elle a sa zone de recherche (« ${T.placeholder} ») avec le focus, tient dans le panneau sous le « + », et chaque ligne est atteignable`,
    !!list && list.placeholder === T.placeholder && list.focused && list.inPanel && list.belowPlus && list.rows.every(r => r.reachable && r.inPanel), list);
  await snap('sheets');
  await page.keyboard.press('Escape');
  await sleep(500);
  const escaped = await gridState(page);
  check(tag + 'Échap referme la liste sans rien importer : aucune grille, aucune fenêtre, l\'éditeur reprend la main', !(await sheetList(page)) && !escaped.active && !(await dialogState(page)).shown && (await focusInText(page)), { grid: escaped.active });

  // 3) La feuille « Détail » : une nouvelle grille ; le rapport dit la formule et la ligne masquée.
  await pickFile(page, sales);
  const again = await waitForSheetList(page);
  const detail = again && again.rows.find(r => r.text === 'Détail');
  check(tag + 'la liste se rouvre au fichier suivant (rien d\'oublié de la première fois)', !!detail, again && again.rows.map(r => r.text));
  if (detail) { await page.mouse.move(detail.x - 6, detail.y, { steps: 3 }); await page.mouse.click(detail.x, detail.y); }
  await settle(page, /importée|imported/);
  const told = await dialogState(page);
  const grid = await gridState(page);
  check(tag + 'le moteur du tableur est demandé au réseau une seule fois', engineRequests() === 1, engineRequests());
  const rows1 = (await stored(page)).filter(r => !SEED_IDS.includes(r.id));
  check(tag + 'une NOUVELLE grille s\'affiche, ENREGISTRÉE dans Grist sous le nom du fichier « ventes » (une ligne de plus, relue, choisie dans la liste), avec le texte du tableur tel qu\'il l\'affichait (« 1 250,00 € »), sans la ligne masquée ni les autres feuilles',
    rows1.length === 1 && rows1[0].name === 'ventes' && rows1[0].length > 100 && grid.select === String(rows1[0].id) && grid.active && /Mois/.test(grid.text) && /Janvier/.test(grid.text) && /1 250,00 €/.test(grid.text.replace(/\s/g, ' ')) && !/Caché/.test(grid.text) && !/Stylo/.test(grid.text) && !/brouillon/.test(grid.text), { active: grid.active, text: grid.text, rows1, select: grid.select });
  check(tag + 'les titres sont en gras, comme dans le tableur', /<strong>Mois<\/strong>/.test(grid.html), grid.html.slice(0, 300));
  check(tag + `le coin d'état dit quelle feuille a été importée (${T.importedSheet})`, T.importedSheet.test((await statusOf(page)).text), (await statusOf(page)).text);
  const lines = told.message.split('\n');
  check(tag + `la fenêtre du rapport s'ouvre, titrée « ${T.reportTitle} », avec sa phrase d'introduction`, told.shown && told.title === T.reportTitle && lines[0] === T.reportIntro, { title: told.title, intro: lines[0] });
  check(tag + 'elle dit la formule remplacée par son résultat puis la ligne masquée, une par ligne', JSON.stringify(lines.slice(1)) === JSON.stringify(T.report.map(line => '• ' + line)), lines.slice(1));
  check(tag + `elle n'a qu'un bouton, « ${T.close} », entière dans le panneau, avec le focus dessus`, told.buttons.length === 1 && told.buttons[0] === T.close && told.boxInPanel && told.buttonsInPanel && told.focusOn === T.close, told);
  check(tag + 'le texte de la fenêtre du rapport tient les contrastes de la charte (>= 4,5:1)', (await contrastOf(page, '#pp-dialog-modal .pp-dialog-message')) >= 4.5);
  await snap('report');
  const closed = await clickDialogButton(page, T.close);
  check(tag + `« ${T.close} » est atteignable à la souris dans le panneau`, !!closed && closed.reachable && closed.inPanel, closed);
  await parkMouse(page);

  // 4) Un tableur d'une feuille : pas de liste ; la grille est « à enregistrer » : la question vient APRÈS le choix du fichier.
  const small = odsFile('petit.ods', await buildFile(page, 'small'));
  await makeUnsaved(page); // le nom retapé : la grille enregistrée par son import est de nouveau « à enregistrer »
  const second = await pickFile(page, small);
  check(tag + '(grille à enregistrer) le sélecteur s\'ouvre sans poser de question avant le choix du fichier', !!second.chooser && !second.askedBefore.shown, second.askedBefore);
  await settle(page, /^$/);
  const asked = await dialogState(page);
  check(tag + 'aucune liste de feuilles pour un tableur d\'une feuille ; la fenêtre « ' + T.unsaved + ' » s\'ouvre après le choix du fichier', !(await sheetList(page)) && asked.shown && asked.title === T.unsaved && asked.buttons.includes(T.discard) && asked.buttons.includes(T.cancel), asked);
  await snap('question');
  const keptBefore = await gridState(page);
  await clickDialogButton(page, T.cancel);
  const kept = await gridState(page);
  check(tag + `« ${T.cancel} » : la fenêtre se ferme et la grille reste telle quelle`, !(await dialogState(page)).shown && kept.html === keptBefore.html, { same: kept.html === keptBefore.html });
  await pickFile(page, small);
  await settle(page, /^$/);
  await clickDialogButton(page, T.discard);
  await settleSaved(page, 'petit');
  const small2 = await gridState(page);
  const rows2 = (await stored(page)).filter(r => !SEED_IDS.includes(r.id));
  check(tag + `« ${T.discard} » : la grille du fichier remplace la première, s'enregistre sous « petit » (deux lignes, « ventes » intacte) et le coin d'état dit « ${T.imported} » après l'enregistrement, sans fenêtre de rapport (rien à dire)`,
    small2.active && /Ana/.test(small2.text) && !/Mois/.test(small2.text) && (await statusOf(page)).text === T.savedAs('petit') + T.imported && !(await dialogState(page)).shown && rows2.map(r => r.name).join('|') === 'ventes|petit', { text: small2.text, status: (await statusOf(page)).text, rows2 });
  await parkMouse(page);

  // 5) Les fichiers refusés : un message clair en rouge, aucune fenêtre (même avec une grille à enregistrer), la grille ne bouge pas.
  await makeUnsaved(page);
  const baseline = await gridState(page);
  const rowsBefore = (await stored(page)).length;
  const refused = async (file, pattern) => {
    await pickFile(page, file);
    await settle(page, pattern);
    const after = await statusOf(page);
    const dialog = await dialogState(page);
    const now = await gridState(page);
    return { after, dialog, unchanged: now.html === baseline.html && (await stored(page)).length === rowsBefore };
  };
  const refusal = (what, got, expected) => check(tag + `${what} : « ${expected} » en rouge, sans fenêtre, la grille ne bouge pas`, got.after.text === expected && got.after.error && !got.dialog.shown && got.unchanged && !got.after.clipped && got.after.inPanel, got);
  refusal('un dessin OpenDocument', await refused({ name: 'dessin.odg', mimeType: 'application/vnd.oasis.opendocument.graphics', buffer: await buildFile(page, 'drawing') }, T.drawingPattern), T.drawing);
  refusal('un tableur sans aucune case', await refused(odsFile('vide.ods', await buildFile(page, 'emptySheet')), T.emptyPattern), T.empty);
  refusal('un tableur protégé par un mot de passe', await refused(odsFile('secret.ods', await buildFile(page, 'locked')), T.encryptedPattern), T.encrypted);
  refusal('un fichier qui n\'est pas un zip', await refused(odsFile('courrier.ods', Buffer.from('Ceci est un courrier, pas un tableur.', 'utf8')), T.unreadablePattern), T.unreadable);
  await snap('refused');
  check(tag + 'aucune boîte native (alert, confirm, prompt) ne s\'est ouverte pendant tout le parcours, aucun champ de fichier oublié dans la page', natives.length === 0 && (await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)) === 0, natives);
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
