#!/usr/bin/env node
// Le menu « Type d'export » (ex-« Qualité PDF ») et le menu « Exporter » au VRAI clic, à 700x400 (le panneau de Grist) : ce qu'Antoine voit et fait, pas un état interne.
//   1) le menu « Type d'export » : PDF, Word, Excel, puis la qualité du PDF - entier dans le panneau, sans texte coupé, lisible (>= 4,5:1), en français clair puis en anglais sombre ;
//      dans un document Excel est grisé (il reste là), dans une grille c'est Word ;
//   2) le menu « Exporter » : titre « Exporter », la ligne affichée puis les lots du type choisi (PDF : ZIP, un seul PDF, assemblage ; Word : son ZIP ; Excel : son ZIP, son classeur
//      unique), entier dans le panneau, atteignable à la souris ;
//   3) un vrai clic sur un type grisé ne choisit rien, un vrai clic sur Word ou Excel le choisit (ligne active, bouton du type allumé, qualités du PDF grisées) ;
//   4) le bouton Exporter - au clic et par Alt+P - exporte la ligne affichée dans le type choisi (.docx, .xlsx, .pdf), la ligne de son menu aussi, le lot demande sa confirmation et
//      « Annuler » n'exporte rien ;
//   5) un type que le modèle ne sait pas faire revient au PDF (Excel quand on repart dans un document) et la qualité du PDF choisie avant est gardée ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « exportTypeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-export-type-mouse.mjs
import { open, stopServer, sleep, click, clickHoverRow, hoverRow, fire } from './load-lib.mjs';

const PORT = Number(process.env.EXPORT_TYPE_PORT || 9010);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const TYPE_MENU = '#v2-btn-quality';
const EXPORT_MENU = '#btn-export-pdf';
const TYPE_ROW = name => '#v2-quality-flyout .v2-hover-row[data-export-type="' + name + '"]';
const QUALITY_ROW = name => '#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]';
const ROW = {
  pdf: '#v2-btn-export-pdf', pdfZip: '#v2-btn-export-pdf-batch', pdfMerged: '#v2-btn-export-pdf-merged', pdfSheets: '#v2-btn-export-pdf-sheets',
  word: '#v2-btn-export-docx', wordZip: '#v2-btn-export-docx-batch', excel: '#v2-btn-export-xlsx', excelZip: '#v2-btn-export-xlsx-batch', excelSingle: '#v2-btn-export-xlsx-single',
};
const PDF_ROWS = [ROW.pdf, ROW.pdfZip, ROW.pdfMerged, ROW.pdfSheets];
const WORD_ROWS = [ROW.word, ROW.wordZip];
const EXCEL_ROWS = [ROW.excel, ROW.excelZip, ROW.excelSingle];
const CANCEL = '#pp-dialog-modal .pp-modal-actions button:first-of-type';
const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

// Les mots de chaque langue : le titre des deux menus, les trois types, les trois qualités et les lignes du menu « Exporter » selon le type et le modèle.
const WORDS = {
  fr: {
    typeLabel: 'Type d’export', qualityLabel: 'Qualité PDF', exportLabel: 'Exporter', types: ['PDF', 'Word (bêta)', 'Excel'], qualities: ['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)'],
    pdf: ['Exporter en PDF', 'Exporter les lignes (ZIP)…', 'Exporter les lignes en un seul PDF…', 'Assemblage avant impression…'],
    pdfGrid: ['Exporter en PDF', 'Exporter les valeurs de la table (ZIP)…', 'Exporter les valeurs de la table en un seul PDF…', 'Assemblage avant impression…'],
    word: ['Exporter en DOCX (bêta)…', 'Exporter les lignes en DOCX (ZIP)…'],
    excel: ['Exporter en Excel…', 'Exporter les valeurs de la table en Excel (ZIP)…', 'Exporter les valeurs de la table dans un seul classeur…'],
  },
  en: {
    typeLabel: 'Export type', qualityLabel: 'PDF quality', exportLabel: 'Export', types: ['PDF', 'Word (beta)', 'Excel'], qualities: ['Vector (default)', 'Browser print', 'Light (smaller images)'],
    pdf: ['Export to PDF', 'Export rows (ZIP)…', 'Export rows as a single PDF…', 'Assemble before printing…'],
    pdfGrid: ['Export to PDF', 'Export table values (ZIP)…', 'Export table values as a single PDF…', 'Assemble before printing…'],
    word: ['Export to DOCX (beta)…', 'Export rows to DOCX (ZIP)…'],
    excel: ['Export to Excel…', 'Export table values to Excel (ZIP)…', 'Export table values to a single workbook…'],
  },
};

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Ce qu'un menu montre : pour chaque sélecteur, le texte, l'état (grisée, active), la place dans le panneau, ce qui la recouvre et le contraste de son texte.
const stateOf = (page, selectors) => page.evaluate(sels => {
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = c => {
    const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  return sels.map(sel => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const r = el.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0;
    const top = shown ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return {
      sel, text: el.textContent.trim(), shown, active: el.classList.contains('is-active'),
      greyed: el.classList.contains('v2-hover-row-disabled') && el.getAttribute('aria-disabled') === 'true', live: !el.classList.contains('v2-hover-row-disabled') && !el.hasAttribute('aria-disabled'),
      inside: shown && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && el.contains(top), cut: el.scrollWidth > el.clientWidth + 1,
      contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100,
    };
  });
}, selectors);
const labelsOf = (page, flyout) => page.evaluate(sel => Array.from(document.querySelectorAll(sel + ' .v2-hover-flyout-label')).map(l => l.textContent.trim()), flyout);
const typeValue = page => page.evaluate(() => document.getElementById('v2-export-type').value);
const qualityValue = page => page.evaluate(() => document.getElementById('v2-pdf-quality').value);
const typeButtonLit = page => page.evaluate(() => document.getElementById('v2-btn-quality').classList.contains('active'));
const dialogState = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return null;
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  return { title: ov.querySelector('h3').textContent, message: ov.querySelector('.pp-dialog-message').textContent, inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
});
// Un geste qui doit lancer un téléchargement : le fichier (ou null si rien n'arrive dans le délai).
const download = (page, action, timeout = 90000) => Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), action()]).then(([file]) => file);
const nameOf = file => (file ? file.suggestedFilename() : null);
const parkMouse = async page => { await page.mouse.move(690, 390, { steps: 3 }); await sleep(350); };

// « + » puis « Nouvelle grille » ou « Nouveau document » à la vraie souris ; la question « Modifications non enregistrées » (s'il y en a une) se répond « Abandonner ».
async function newModel(page, which) {
  await clickHoverRow(page, '#v2-new-template-group', which === 'grid' ? '#v2-btn-new-grid' : '#v2-btn-new-document');
  await sleep(500);
  const discard = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const button = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => /^(Abandonner|Discard)$/.test(b.textContent));
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (discard) { await page.mouse.click(discard.x, discard.y); await sleep(500); }
  await parkMouse(page);
}

// Les deux menus, dans une langue et un thème : le menu « Type d'export » puis le menu « Exporter », dans un document (PDF, puis Word) et dans une grille (PDF, puis Excel).
async function menus(page, lang, tag) {
  const W = WORDS[lang];
  const wanted = (rows, texts) => rows.length === texts.length && rows.every((r, i) => r.text === texts[i]);
  const entire = rows => rows.every(r => r.shown && r.inside && r.reachable && !r.cut);
  const readable = rows => rows.every(r => r.contrast >= 4.5);
  const contrasts = rows => rows.map(r => r.contrast);

  console.log(`\n[${tag}] Le menu « ${W.typeLabel} » dans un document`);
  await hoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  const typeLabels = await labelsOf(page, '#v2-quality-flyout');
  const types = await stateOf(page, [TYPE_ROW('pdf'), TYPE_ROW('docx'), TYPE_ROW('xlsx')]);
  const qualities = await stateOf(page, [QUALITY_ROW('native'), QUALITY_ROW('browser-print'), QUALITY_ROW('light')]);
  check(`${tag} : titres « ${W.typeLabel} » et « ${W.qualityLabel} »`, JSON.stringify(typeLabels) === JSON.stringify([W.typeLabel, W.qualityLabel]), typeLabels);
  check(`${tag} : trois types (${W.types.join(', ')}) puis trois qualités (${W.qualities.join(', ')})`, wanted(types, W.types) && wanted(qualities, W.qualities), { types: types.map(r => r.text), qualities: qualities.map(r => r.text) });
  check(`${tag} : les six lignes sont entières dans le panneau 700x400, sans texte coupé, atteignables à la souris`, entire([...types, ...qualities]), [...types, ...qualities].filter(r => !(r.shown && r.inside && r.reachable && !r.cut)));
  check(`${tag} : le texte des six lignes (Excel grisé compris) est lisible, >= 4,5:1`, readable([...types, ...qualities]), contrasts([...types, ...qualities]));
  check(`${tag} : au départ « PDF » et la qualité par défaut sont les lignes actives, Excel est grisé (il reste dans le menu), PDF et Word sont actifs`,
    types[0].active && !types[1].active && !types[2].active && types[0].live && types[1].live && types[2].greyed && qualities.filter(r => r.active).map(r => r.sel).join() === QUALITY_ROW('native') && qualities.every(r => r.live), { types, qualities });
  check(`${tag} : le bouton du type n'est pas allumé pour le PDF`, !(await typeButtonLit(page)));

  console.log(`\n[${tag}] Le menu « ${W.exportLabel} » dans un document, type PDF`);
  await hoverRow(page, EXPORT_MENU, ROW.pdf);
  const exportLabels = await labelsOf(page, '#v2-export-pdf-flyout');
  const pdfRows = await stateOf(page, PDF_ROWS);
  const hiddenRows = await stateOf(page, [...WORD_ROWS, ...EXCEL_ROWS]);
  check(`${tag} : le titre du menu est « ${W.exportLabel} »`, JSON.stringify(exportLabels) === JSON.stringify([W.exportLabel]), exportLabels);
  check(`${tag} : quatre lignes, dans cet ordre (${W.pdf.join(' | ')})`, wanted(pdfRows, W.pdf), pdfRows.map(r => r.text));
  check(`${tag} : les quatre lignes sont entières dans le panneau, atteignables, lisibles (>= 4,5:1) et actives`, entire(pdfRows) && readable(pdfRows) && pdfRows.every(r => r.live), pdfRows);
  check(`${tag} : les lignes de Word et d'Excel restent dans la page mais n'y sont pas montrées`, hiddenRows.every(r => !r.missing && !r.shown), hiddenRows.filter(r => r.shown || r.missing));

  console.log(`\n[${tag}] Un vrai clic sur Excel (grisé) ne choisit rien, un vrai clic sur Word le choisit`);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('xlsx'));
  await sleep(300);
  check(`${tag} : le type reste PDF après un clic sur Excel grisé, sans fenêtre`, (await typeValue(page)) === 'pdf' && !(await dialogState(page)), { type: await typeValue(page) });
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  await sleep(300);
  check(`${tag} : après un clic sur Word : le type vaut « docx » et le bouton du type est allumé`, (await typeValue(page)) === 'docx' && (await typeButtonLit(page)), { type: await typeValue(page), lit: await typeButtonLit(page) });
  await hoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  const withWord = await stateOf(page, [TYPE_ROW('pdf'), TYPE_ROW('docx'), TYPE_ROW('xlsx'), QUALITY_ROW('native'), QUALITY_ROW('browser-print'), QUALITY_ROW('light')]);
  check(`${tag} : seule la ligne Word est active, les trois qualités du PDF sont grisées (elles restent dans le menu, lisibles, entières)`,
    withWord.filter(r => r.active).map(r => r.sel).join() === TYPE_ROW('docx') && withWord.slice(3).every(r => r.greyed && !r.active && r.contrast >= 4.5 && r.shown && r.inside), withWord);
  await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('light'));
  await sleep(250);
  check(`${tag} : un vrai clic sur une qualité du PDF grisée ne la change pas`, (await qualityValue(page)) === 'native' && (await typeValue(page)) === 'docx', { quality: await qualityValue(page), type: await typeValue(page) });

  console.log(`\n[${tag}] Le menu « ${W.exportLabel} » dans un document, type Word`);
  await hoverRow(page, EXPORT_MENU, ROW.word);
  const wordRows = await stateOf(page, WORD_ROWS);
  const pdfHidden = await stateOf(page, PDF_ROWS);
  check(`${tag} : deux lignes pour Word (${W.word.join(' | ')}), entières dans le panneau, atteignables, lisibles et actives`, wanted(wordRows, W.word) && entire(wordRows) && readable(wordRows) && wordRows.every(r => r.live), wordRows);
  check(`${tag} : les quatre lignes du PDF ne sont plus montrées`, pdfHidden.every(r => !r.missing && !r.shown), pdfHidden.filter(r => r.shown || r.missing));
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  await sleep(300);
  check(`${tag} : un vrai clic sur PDF le rend (type « pdf », bouton non allumé)`, (await typeValue(page)) === 'pdf' && !(await typeButtonLit(page)), { type: await typeValue(page) });

  console.log(`\n[${tag}] Dans une grille : Word grisé, Excel choisi`);
  await newModel(page, 'grid');
  await hoverRow(page, TYPE_MENU, TYPE_ROW('xlsx'));
  const gridTypes = await stateOf(page, [TYPE_ROW('pdf'), TYPE_ROW('docx'), TYPE_ROW('xlsx')]);
  check(`${tag} : PDF et Excel sont actifs, Word est grisé (il reste dans le menu), les trois sont entiers dans le panneau et lisibles`,
    gridTypes[0].live && gridTypes[1].greyed && gridTypes[2].live && entire(gridTypes) && readable(gridTypes), gridTypes);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  await sleep(300);
  check(`${tag} : un vrai clic sur Word grisé ne le choisit pas`, (await typeValue(page)) === 'pdf', { type: await typeValue(page) });
  await hoverRow(page, EXPORT_MENU, ROW.pdf);
  const gridPdf = await stateOf(page, PDF_ROWS);
  check(`${tag} : type PDF dans une grille, les lots parlent de « valeurs de la table » (${W.pdfGrid.slice(1, 3).join(' | ')})`, wanted(gridPdf, W.pdfGrid) && entire(gridPdf) && readable(gridPdf), gridPdf.map(r => r.text));
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('xlsx'));
  await sleep(300);
  check(`${tag} : un vrai clic sur Excel le choisit (type « xlsx », bouton allumé)`, (await typeValue(page)) === 'xlsx' && (await typeButtonLit(page)), { type: await typeValue(page) });
  await hoverRow(page, EXPORT_MENU, ROW.excel);
  const excelRows = await stateOf(page, EXCEL_ROWS);
  const nothingElse = await stateOf(page, [...PDF_ROWS, ...WORD_ROWS]);
  check(`${tag} : trois lignes pour Excel (${W.excel.join(' | ')}), entières dans le panneau, atteignables, lisibles et actives`, wanted(excelRows, W.excel) && entire(excelRows) && readable(excelRows) && excelRows.every(r => r.live), excelRows);
  check(`${tag} : les lignes du PDF et de Word ne sont plus montrées`, nothingElse.every(r => !r.missing && !r.shown), nothingElse.filter(r => r.shown || r.missing));
}

let w = null;
try {
  // ---- Passe 1 : français, thème clair, avec les vrais exports ----
  w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme: 'light', lang: 'fr' });
  let { page } = w;
  const accessible = await page.evaluate(() => ({ type: document.getElementById('v2-btn-quality').getAttribute('aria-label'), exportButton: document.getElementById('btn-export-pdf').getAttribute('aria-label') }));
  check('les deux boutons se nomment « Type d’export » et « Exporter »', accessible.type === 'Type d’export' && accessible.exportButton === 'Exporter', accessible);

  await menus(page, 'fr', 'français, clair');

  console.log('\nLes exports de la grille (type Excel)');
  await fire(page, 'PbClients', 1);
  const gridFile = await download(page, () => click(page, EXPORT_MENU));
  check('le bouton Exporter, type Excel : le classeur .xlsx de la ligne courante est téléchargé', /\.xlsx$/i.test(nameOf(gridFile) || ''), nameOf(gridFile));
  await sleep(500);
  await parkMouse(page);
  const rowFile = await download(page, () => clickHoverRow(page, EXPORT_MENU, ROW.excel));
  check('la ligne « Exporter en Excel… » du menu télécharge le même classeur .xlsx', /\.xlsx$/i.test(nameOf(rowFile) || ''), nameOf(rowFile));
  await sleep(500);
  await parkMouse(page);
  const singleDownload = await download(page, async () => {
    await clickHoverRow(page, EXPORT_MENU, ROW.excelSingle);
    await sleep(700);
  }, 2500);
  const asked = await dialogState(page);
  check('la ligne « …dans un seul classeur… » demande d\'abord sa confirmation, dans le panneau, sans rien télécharger', !!asked && asked.inside && /Excel/.test(asked.message) && singleDownload === null, { asked, file: nameOf(singleDownload) });
  if (asked) await page.mouse.click(...(await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, CANCEL)));
  await sleep(500);
  const afterCancel = await download(page, async () => { await sleep(1500); }, 1500);
  check('« Annuler » ferme la fenêtre et n\'exporte rien', !(await dialogState(page)) && afterCancel === null, { file: nameOf(afterCancel) });
  await parkMouse(page);

  console.log('\nRetour dans un document : le type revient au PDF');
  await newModel(page, 'document');
  check('Excel ne se fait pas dans un document : le type est revenu au PDF, le bouton du type n\'est plus allumé', (await typeValue(page)) === 'pdf' && !(await typeButtonLit(page)), { type: await typeValue(page), lit: await typeButtonLit(page) });
  await hoverRow(page, EXPORT_MENU, ROW.pdf);
  const backRows = await stateOf(page, PDF_ROWS);
  check('le menu « Exporter » est de nouveau celui du PDF (quatre lignes, les mots du document)', backRows.every(r => r.shown && r.inside) && backRows.map(r => r.text).join('|') === WORDS.fr.pdf.join('|'), backRows.map(r => r.text));
  await parkMouse(page);

  console.log('\nLes exports d\'un document (Word, puis PDF)');
  await page.evaluate(hf => { Editor.setHTML('<p>Bonjour, voici votre courrier.</p>'); Editor.setHeaderFooterData(hf); }, NO_HF);
  await fire(page, 'PbClients', 1);
  await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('light'));
  await sleep(200);
  check('la qualité « Léger » est choisie avant de passer à Word', (await qualityValue(page)) === 'light');
  await parkMouse(page);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  await sleep(300);
  await parkMouse(page);
  const wordFile = await download(page, () => click(page, EXPORT_MENU));
  check('le bouton Exporter, type Word : un fichier .docx est téléchargé', /\.docx$/i.test(nameOf(wordFile) || ''), nameOf(wordFile));
  await sleep(600);
  await parkMouse(page);
  const wordRowFile = await download(page, () => clickHoverRow(page, EXPORT_MENU, ROW.word));
  check('la ligne « Exporter en DOCX (bêta)… » du menu télécharge un .docx', /\.docx$/i.test(nameOf(wordRowFile) || ''), nameOf(wordRowFile));
  await sleep(600);
  await parkMouse(page);
  await page.evaluate(() => { const editor = document.querySelector('.tiptap'); editor.focus(); });
  await click(page, '.tiptap p');
  await sleep(200);
  const shortcutFile = await download(page, () => page.keyboard.press('Alt+p'));
  check('le raccourci Alt+P exporte dans le type choisi (ici un .docx)', /\.docx$/i.test(nameOf(shortcutFile) || ''), nameOf(shortcutFile));
  await sleep(600);
  await parkMouse(page);
  const wordZipDownload = await download(page, async () => {
    await clickHoverRow(page, EXPORT_MENU, ROW.wordZip);
    await sleep(700);
  }, 2500);
  const wordAsked = await dialogState(page);
  check('la ligne du ZIP de Word demande sa confirmation, dans le panneau, sans rien télécharger', !!wordAsked && wordAsked.inside && /DOCX/.test(wordAsked.message) && wordZipDownload === null, { wordAsked, file: nameOf(wordZipDownload) });
  if (wordAsked) await page.mouse.click(...(await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, CANCEL)));
  await sleep(500);
  await parkMouse(page);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  await sleep(300);
  await hoverRow(page, TYPE_MENU, QUALITY_ROW('light'));
  const kept = await stateOf(page, [QUALITY_ROW('native'), QUALITY_ROW('browser-print'), QUALITY_ROW('light')]);
  check('retour au PDF : la qualité « Léger » choisie avant est gardée (ligne active, les trois qualités de nouveau actives)', (await qualityValue(page)) === 'light' && kept.filter(r => r.active).map(r => r.sel).join() === QUALITY_ROW('light') && kept.every(r => r.live), { quality: await qualityValue(page), kept });
  await parkMouse(page);
  const pdfFile = await download(page, () => click(page, EXPORT_MENU));
  check('le bouton Exporter, type PDF : un fichier .pdf est téléchargé', /\.pdf$/i.test(nameOf(pdfFile) || ''), nameOf(pdfFile));
  await sleep(600);
  check('aucune erreur de page (passe française)', realErrors(w).length === 0, realErrors(w));
  await w.close();
  w = null;

  // ---- Passe 2 : anglais, thème sombre, les menus seulement ----
  w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme: 'dark', lang: 'en' });
  ({ page } = w);
  const accessibleEn = await page.evaluate(() => ({ type: document.getElementById('v2-btn-quality').getAttribute('aria-label'), exportButton: document.getElementById('btn-export-pdf').getAttribute('aria-label') }));
  check('(anglais) les deux boutons se nomment « Export type » et « Export »', accessibleEn.type === 'Export type' && accessibleEn.exportButton === 'Export', accessibleEn);
  await menus(page, 'en', 'anglais, sombre');
  check('aucune erreur de page (passe anglaise)', realErrors(w).length === 0, realErrors(w));
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
