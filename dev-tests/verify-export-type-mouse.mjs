#!/usr/bin/env node
// Le menu « Type d'export » (ex-« Qualité PDF ») et le menu « Exporter » au VRAI clic, à 700x400 (le panneau de Grist) : ce qu'Antoine voit et fait, pas un état interne.
//   1) le menu « Type d'export » : PDF, Word, Excel ; la qualité du PDF n'y est montrée que pour le PDF - entier dans le panneau, sans texte coupé, lisible (>= 4,5:1), en français
//      clair puis en anglais sombre ; dans un document Excel est grisé (il reste là), dans une grille c'est Word ; la ligne choisie, sous la souris, garde un bleu lisible (>= 4,5:1) sur le gris du survol ;
//   2) le menu « Exporter » : titre « Exporter », rien que des options de lignes et de classeur (PDF : une seule ligne, toutes les lignes en ZIP, en un seul PDF, assemblage ; Word : une
//      seule ligne, ZIP ; Excel : une seule ligne, ZIP, un seul classeur), la coche DEVANT l'option cochée, entier dans le panneau, atteignable à la souris, aucune ligne « Exporter en… » ;
//   3) un vrai clic sur un type grisé ne choisit rien, un vrai clic sur Word ou Excel le choisit (ligne active, bouton du type allumé, qualité du PDF cachée mais gardée) ;
//   4) un vrai clic sur une option la coche et n'exporte rien ; le bouton Exporter - au clic et par Alt+P - lance l'option cochée dans le type choisi : la ligne affichée (.docx, .xlsx,
//      .pdf) ou un lot (sa confirmation, « Annuler » n'exporte rien, « Générer » rend l'archive) ;
//   5) une option que le type n'a pas retombe sur « toutes les lignes (ZIP) » et revient avec son type ; un type que le modèle ne sait pas faire revient au PDF (Excel quand on repart
//      dans un document) et la qualité du PDF choisie avant est gardée ; aucune erreur de page.
//   6) les trois choix (type, qualité du PDF, une ligne / toutes) sont gardés PAR PERSONNE ET PAR MODÈLE dans la table des préférences : au vrai clic, une ligne par modèle choisi et rien
//      pour un modèle dont rien n'a changé ; dans une page rechargée (anglais, sombre) la personne retrouve ses menus tels qu'elle les a laissés, modèle par modèle ; une autre personne
//      repart de l'origine ; un compte Lecteur choisit sans rien écrire et garde son choix pour la session.
// Lancé par run-headless.mjs (groupe Node « exportTypeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-export-type-mouse.mjs
import { open, stopServer, sleep, click, clickHoverRow, hoverRow, fire, chooseExportLines, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.EXPORT_TYPE_PORT || 9010);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const TYPE_MENU = '#v2-btn-quality';
const EXPORT_MENU = '#btn-export-pdf';
const TYPE_ROW = name => '#v2-quality-flyout .v2-hover-row[data-export-type="' + name + '"]';
const QUALITY_ROW = name => '#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]';
const LINES_ROW = name => '#v2-export-pdf-flyout .v2-hover-row[data-export-lines="' + name + '"]';
const PDF_LINES = ['one', 'zip', 'merged', 'sheets'].map(LINES_ROW);
const WORD_LINES = ['one', 'zip'].map(LINES_ROW);
const EXCEL_LINES = ['one', 'zip', 'workbook'].map(LINES_ROW);
// Les neuf lignes d'export d'avant : masquées (#v2-export-legacy-rows), jamais montrées.
const OLD_ROWS = ['#v2-btn-export-pdf', '#v2-btn-export-pdf-batch', '#v2-btn-export-pdf-merged', '#v2-btn-export-pdf-sheets', '#v2-btn-export-docx', '#v2-btn-export-docx-batch',
  '#v2-btn-export-xlsx', '#v2-btn-export-xlsx-batch', '#v2-btn-export-xlsx-single'];
const CANCEL = '#pp-dialog-modal .pp-modal-actions button:first-of-type';
const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

// Les mots de chaque langue : le titre des deux menus, les trois types, les trois qualités et les options du menu « Exporter » selon le type et le modèle.
const WORDS = {
  fr: {
    typeLabel: 'Type d’export', qualityLabel: 'Qualité PDF', exportLabel: 'Exporter', types: ['PDF', 'Word (bêta)', 'Excel'], qualities: ['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)'],
    pdf: ['Une seule ligne', 'Toutes les lignes (ZIP)', 'Toutes les lignes en un seul PDF', 'Assemblage avant impression'],
    pdfGrid: ['Une seule ligne', 'Toutes les valeurs de la table (ZIP)', 'Toutes les valeurs de la table en un seul PDF', 'Assemblage avant impression'],
    word: ['Une seule ligne', 'Toutes les lignes (ZIP)'],
    excel: ['Une seule ligne', 'Toutes les valeurs de la table (ZIP)', 'Toutes les valeurs de la table dans un seul classeur'],
  },
  en: {
    typeLabel: 'Export type', qualityLabel: 'PDF quality', exportLabel: 'Export', types: ['PDF', 'Word (beta)', 'Excel'], qualities: ['Vector (default)', 'Browser print', 'Light (smaller images)'],
    pdf: ['A single row', 'All rows (ZIP)', 'All rows as a single PDF', 'Assemble before printing'],
    pdfGrid: ['A single row', 'All table values (ZIP)', 'All table values as a single PDF', 'Assemble before printing'],
    word: ['A single row', 'All rows (ZIP)'],
    excel: ['A single row', 'All table values (ZIP)', 'All table values in a single workbook'],
  },
};

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Ce qu'un menu montre : pour chaque sélecteur, le texte, l'état (grisée, active, cochée), la place dans le panneau, ce qui la recouvre, le contraste de son texte et la coche (visible,
// DEVANT le libellé : le texte commence après la place de la coche).
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
    let tick = null;
    if (shown && el.hasAttribute('aria-checked')) {
      const pseudo = getComputedStyle(el, '::before');
      const range = document.createRange();
      range.selectNodeContents(el);
      const textLeft = range.getBoundingClientRect().left;
      tick = { visible: pseudo.visibility === 'visible', width: parseFloat(pseudo.width), inFront: textLeft >= r.left + parseFloat(pseudo.width) };
    }
    return {
      sel, text: el.textContent.trim(), shown, active: el.classList.contains('is-active'), ticked: el.getAttribute('aria-checked') === 'true', tick,
      greyed: el.classList.contains('v2-hover-row-disabled') && el.getAttribute('aria-disabled') === 'true', live: !el.classList.contains('v2-hover-row-disabled') && !el.hasAttribute('aria-disabled'),
      inside: shown && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && el.contains(top), cut: el.scrollWidth > el.clientWidth + 1,
      contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100,
    };
  });
}, selectors);
// Une ligne sous la VRAIE souris : survolée (:hover), peinte de son fond de survol (le contraste de son texte se mesure sur ce fond, jamais sur celui du menu derrière) et, quand elle est
// choisie (is-active), toujours bleue et en gras.
const hoveredRow = async (page, menu, row) => {
  await hoverRow(page, menu, row);
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [r, g, b] = rgb(cs.color);
    const la = lum(cs.color), lb = lum(cs.backgroundColor);
    return {
      sel, hovered: el.matches(':hover'), active: el.classList.contains('is-active'), painted: !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor), blue: b > r && b > g,
      bold: Number(cs.fontWeight) >= 700, color: cs.color, background: cs.backgroundColor, contrast: Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100,
    };
  }, row);
};
const chosenReadable = s => s.hovered && s.active && s.painted && s.blue && s.bold && s.contrast >= 4.5;
// Les intitulés que le menu montre (un intitulé masqué n'a pas de cadre) : le menu doit être ouvert (survolé) pour que la mise en page existe.
const labelsOf = (page, flyout) => page.evaluate(sel => Array.from(document.querySelectorAll(sel + ' .v2-hover-flyout-label')).filter(l => l.getBoundingClientRect().width > 0).map(l => l.textContent.trim()), flyout);
const typeValue = page => page.evaluate(() => document.getElementById('v2-export-type').value);
const qualityValue = page => page.evaluate(() => document.getElementById('v2-pdf-quality').value);
const linesValue = page => page.evaluate(() => document.getElementById('v2-export-lines').value);
const tickedLines = page => page.evaluate(() => Array.from(document.querySelectorAll('#v2-export-pdf-flyout .v2-hover-row[aria-checked="true"]')).map(r => r.dataset.exportLines).join());
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
const cancelDialog = async page => {
  await page.mouse.click(...(await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, CANCEL)));
  await sleep(500);
};

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

  console.log(`\n[${tag}] Le menu « ${W.typeLabel} » dans un document, type PDF`);
  await hoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  const typeLabels = await labelsOf(page, '#v2-quality-flyout');
  const types = await stateOf(page, [TYPE_ROW('pdf'), TYPE_ROW('docx'), TYPE_ROW('xlsx')]);
  const qualities = await stateOf(page, [QUALITY_ROW('native'), QUALITY_ROW('browser-print'), QUALITY_ROW('light')]);
  check(`${tag} : titres « ${W.typeLabel} » et « ${W.qualityLabel} » (la qualité est montrée pour le PDF)`, JSON.stringify(typeLabels) === JSON.stringify([W.typeLabel, W.qualityLabel]), typeLabels);
  check(`${tag} : trois types (${W.types.join(', ')}) puis trois qualités (${W.qualities.join(', ')})`, wanted(types, W.types) && wanted(qualities, W.qualities), { types: types.map(r => r.text), qualities: qualities.map(r => r.text) });
  check(`${tag} : les six lignes sont entières dans le panneau 700x400, sans texte coupé, atteignables à la souris`, entire([...types, ...qualities]), [...types, ...qualities].filter(r => !(r.shown && r.inside && r.reachable && !r.cut)));
  check(`${tag} : le texte des six lignes (Excel grisé compris) est lisible, >= 4,5:1`, readable([...types, ...qualities]), contrasts([...types, ...qualities]));
  check(`${tag} : au départ « PDF » et la qualité par défaut sont les lignes actives, Excel est grisé (il reste dans le menu), PDF et Word sont actifs`,
    types[0].active && !types[1].active && !types[2].active && types[0].live && types[1].live && types[2].greyed && qualities.filter(r => r.active).map(r => r.sel).join() === QUALITY_ROW('native') && qualities.every(r => r.live), { types, qualities });
  check(`${tag} : le bouton du type n'est pas allumé pour le PDF`, !(await typeButtonLit(page)));

  // La ligne CHOISIE sous la souris (les mesures du menu ci-dessus le survolent sur une autre ligne) : son bleu passe sur le gris du survol. Avant : 4,02:1 en clair, 4,43:1 en sombre.
  console.log(`\n[${tag}] La ligne choisie d'un menu, sous la souris`);
  const hoveredType = await hoveredRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  const hoveredQuality = await hoveredRow(page, TYPE_MENU, QUALITY_ROW('native'));
  check(`${tag} : « ${W.types[0]} » (type choisi), sous la souris : sur son gris de survol, toujours bleue et en gras, lisible (>= 4,5:1)`, chosenReadable(hoveredType), hoveredType);
  check(`${tag} : « ${W.qualities[0]} » (qualité choisie), sous la souris : sur son gris de survol, toujours bleue et en gras, lisible (>= 4,5:1)`, chosenReadable(hoveredQuality), hoveredQuality);

  console.log(`\n[${tag}] Le menu « ${W.exportLabel} » dans un document, type PDF : rien que des options de lignes`);
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const exportLabels = await labelsOf(page, '#v2-export-pdf-flyout');
  const pdfRows = await stateOf(page, PDF_LINES);
  const oldRows = await stateOf(page, OLD_ROWS);
  check(`${tag} : le titre du menu est « ${W.exportLabel} »`, JSON.stringify(exportLabels) === JSON.stringify([W.exportLabel]), exportLabels);
  check(`${tag} : quatre options, dans cet ordre (${W.pdf.join(' | ')})`, wanted(pdfRows, W.pdf), pdfRows.map(r => r.text));
  check(`${tag} : les quatre options sont entières dans le panneau, atteignables, lisibles (>= 4,5:1) et actives`, entire(pdfRows) && readable(pdfRows) && pdfRows.every(r => r.live), pdfRows);
  check(`${tag} : la petite coche est devant « ${W.pdf[0]} » (cochée au départ, visible) et seulement devant elle`,
    pdfRows[0].ticked && pdfRows[0].tick.visible && pdfRows[0].tick.inFront && pdfRows.slice(1).every(r => !r.ticked && !r.tick.visible && r.tick.inFront), pdfRows.map(r => ({ ticked: r.ticked, tick: r.tick })));
  check(`${tag} : aucune ligne « Exporter en… » : les neuf lignes d'avant restent dans la page, masquées`, oldRows.every(r => !r.missing && !r.shown), oldRows.filter(r => r.shown || r.missing));

  console.log(`\n[${tag}] Un vrai clic sur une option la coche et n'exporte rien`);
  await clickHoverRow(page, EXPORT_MENU, LINES_ROW('zip'));
  await sleep(300);
  check(`${tag} : après un clic sur « ${W.pdf[1]} » : cochée (liste cachée « zip »), « ${W.pdf[0]} » décochée, aucune fenêtre`, (await linesValue(page)) === 'zip' && (await tickedLines(page)) === 'zip' && !(await dialogState(page)), { lines: await linesValue(page), ticked: await tickedLines(page) });
  await hoverRow(page, EXPORT_MENU, LINES_ROW('merged'));
  const afterZip = await stateOf(page, PDF_LINES);
  check(`${tag} : la coche a suivi (devant « ${W.pdf[1]} » seulement, devant son libellé)`, afterZip.filter(r => r.ticked).map(r => r.sel).join() === LINES_ROW('zip') && afterZip[1].tick.visible && afterZip[1].tick.inFront && !afterZip[0].tick.visible, afterZip.map(r => ({ ticked: r.ticked, tick: r.tick })));
  await clickHoverRow(page, EXPORT_MENU, LINES_ROW('merged'));
  await sleep(300);
  check(`${tag} : « ${W.pdf[2]} » cochée à son tour`, (await linesValue(page)) === 'merged' && (await tickedLines(page)) === 'merged', { lines: await linesValue(page) });

  console.log(`\n[${tag}] Le menu « ${W.typeLabel} » : un vrai clic sur Excel (grisé) ne choisit rien, un vrai clic sur Word le choisit`);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('xlsx'));
  await sleep(300);
  check(`${tag} : le type reste PDF après un clic sur Excel grisé, sans fenêtre`, (await typeValue(page)) === 'pdf' && !(await dialogState(page)), { type: await typeValue(page) });
  await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('light'));
  await sleep(250);
  check(`${tag} : un vrai clic sur « ${W.qualities[2]} » la choisit`, (await qualityValue(page)) === 'light', { quality: await qualityValue(page) });
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  await sleep(300);
  check(`${tag} : après un clic sur Word : le type vaut « docx » et le bouton du type est allumé`, (await typeValue(page)) === 'docx' && (await typeButtonLit(page)), { type: await typeValue(page), lit: await typeButtonLit(page) });
  // Le menu est survolé sur la ligne PDF : la ligne Word, active, se mesure au repos (survolée, son bleu passe sur le fond du survol).
  await hoverRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  const withWord = await stateOf(page, [TYPE_ROW('pdf'), TYPE_ROW('docx'), TYPE_ROW('xlsx'), QUALITY_ROW('native'), QUALITY_ROW('browser-print'), QUALITY_ROW('light')]);
  const wordLabels = await labelsOf(page, '#v2-quality-flyout');
  check(`${tag} : avec Word, seule la ligne Word est active et les trois types sont entiers et lisibles`, withWord.filter(r => r.active).map(r => r.sel).join() === TYPE_ROW('docx') && entire(withWord.slice(0, 3)) && readable(withWord.slice(0, 3)), withWord.slice(0, 3));
  check(`${tag} : la qualité du PDF n'est plus montrée avec Word (ni l'intitulé « ${W.qualityLabel} », ni ses trois lignes), mais reste dans la page`,
    JSON.stringify(wordLabels) === JSON.stringify([W.typeLabel]) && withWord.slice(3).every(r => !r.missing && !r.shown), { labels: wordLabels, qualities: withWord.slice(3).map(r => r.shown) });
  check(`${tag} : la qualité choisie est gardée (« light ») en attendant le retour au PDF`, (await qualityValue(page)) === 'light', { quality: await qualityValue(page) });

  console.log(`\n[${tag}] Le menu « ${W.exportLabel} » dans un document, type Word`);
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const wordRows = await stateOf(page, WORD_LINES);
  const pdfOnly = await stateOf(page, [LINES_ROW('merged'), LINES_ROW('sheets'), LINES_ROW('workbook')]);
  check(`${tag} : deux options pour Word (${W.word.join(' | ')}), entières dans le panneau, atteignables, lisibles et actives`, wanted(wordRows, W.word) && entire(wordRows) && readable(wordRows) && wordRows.every(r => r.live), wordRows);
  check(`${tag} : « un seul PDF » (cochée avant) n'existe pas pour Word : « ${W.word[1]} » est cochée à sa place, avec sa coche devant`, wordRows[1].ticked && wordRows[1].tick.visible && wordRows[1].tick.inFront && !wordRows[0].ticked && (await linesValue(page)) === 'merged', { ticked: wordRows.map(r => r.ticked), lines: await linesValue(page) });
  check(`${tag} : les options du PDF et du classeur ne sont pas montrées pour Word`, pdfOnly.every(r => !r.missing && !r.shown), pdfOnly.filter(r => r.shown || r.missing));
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  await sleep(300);
  check(`${tag} : un vrai clic sur PDF le rend (type « pdf », bouton non allumé)`, (await typeValue(page)) === 'pdf' && !(await typeButtonLit(page)), { type: await typeValue(page) });
  await hoverRow(page, TYPE_MENU, QUALITY_ROW('light'));
  const kept = await stateOf(page, [QUALITY_ROW('native'), QUALITY_ROW('browser-print'), QUALITY_ROW('light')]);
  const keptLabels = await labelsOf(page, '#v2-quality-flyout');
  check(`${tag} : retour au PDF : la qualité « ${W.qualities[2]} » choisie avant est gardée (ligne active, les trois qualités montrées et actives, avec leur intitulé)`,
    JSON.stringify(keptLabels) === JSON.stringify([W.typeLabel, W.qualityLabel]) && kept.filter(r => r.active).map(r => r.sel).join() === QUALITY_ROW('light') && kept.every(r => r.live && r.shown), { keptLabels, kept });
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const backToPdf = await stateOf(page, PDF_LINES);
  check(`${tag} : le menu « ${W.exportLabel} » retrouve « ${W.pdf[2]} » cochée (le choix gardé revient avec le PDF)`, wanted(backToPdf, W.pdf) && backToPdf.filter(r => r.ticked).map(r => r.sel).join() === LINES_ROW('merged'), backToPdf.map(r => ({ text: r.text, ticked: r.ticked })));
  await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('native'));
  await sleep(250);
  await chooseExportLines(page, 'one');

  console.log(`\n[${tag}] Dans une grille : Word grisé, Excel choisi`);
  await newModel(page, 'grid');
  await hoverRow(page, TYPE_MENU, TYPE_ROW('xlsx'));
  const gridTypes = await stateOf(page, [TYPE_ROW('pdf'), TYPE_ROW('docx'), TYPE_ROW('xlsx')]);
  check(`${tag} : PDF et Excel sont actifs, Word est grisé (il reste dans le menu), les trois sont entiers dans le panneau et lisibles`,
    gridTypes[0].live && gridTypes[1].greyed && gridTypes[2].live && entire(gridTypes) && readable(gridTypes), gridTypes);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  await sleep(300);
  check(`${tag} : un vrai clic sur Word grisé ne le choisit pas`, (await typeValue(page)) === 'pdf', { type: await typeValue(page) });
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const gridPdf = await stateOf(page, PDF_LINES);
  check(`${tag} : type PDF dans une grille, les lots parlent de « valeurs de la table » (${W.pdfGrid.slice(1, 3).join(' | ')})`, wanted(gridPdf, W.pdfGrid) && entire(gridPdf) && readable(gridPdf), gridPdf.map(r => r.text));
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('xlsx'));
  await sleep(300);
  check(`${tag} : un vrai clic sur Excel le choisit (type « xlsx », bouton allumé, qualité du PDF cachée)`, (await typeValue(page)) === 'xlsx' && (await typeButtonLit(page)) && (await labelsOf(page, '#v2-quality-flyout')).length <= 1, { type: await typeValue(page) });
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const excelRows = await stateOf(page, EXCEL_LINES);
  const nothingElse = await stateOf(page, [LINES_ROW('merged'), LINES_ROW('sheets')]);
  check(`${tag} : trois options pour Excel (${W.excel.join(' | ')}), entières dans le panneau, atteignables, lisibles et actives`, wanted(excelRows, W.excel) && entire(excelRows) && readable(excelRows) && excelRows.every(r => r.live), excelRows);
  check(`${tag} : la coche d'Excel est devant l'option cochée (« ${W.excel[0]} »)`, excelRows[0].ticked && excelRows[0].tick.visible && excelRows[0].tick.inFront && excelRows.slice(1).every(r => !r.ticked && !r.tick.visible), excelRows.map(r => ({ ticked: r.ticked, tick: r.tick })));
  check(`${tag} : les options du PDF seul (un seul PDF, assemblage) ne sont pas montrées pour Excel`, nothingElse.every(r => !r.missing && !r.shown), nothingElse.filter(r => r.shown || r.missing));
}

let w = null;
// ---- Les choix gardés par personne et par modèle (js/export-choices.js ; table Publipostage_PreferencesModeles de js/template-preferences.js) ----
const PREFS = 'Publipostage_PreferencesModeles';
const PREF_COLUMNS = ['Utilisateur', 'ModeleId', 'Epingle', 'Dossier', 'Replie', 'TypeExport', 'QualitePdf', 'LignesExport'];
const PREF_WRITES = ['AddRecord', 'BulkAddRecord', 'UpdateRecord', 'BulkUpdateRecord', 'RemoveRecord', 'BulkRemoveRecord', 'AddVisibleColumn', 'AddColumn'];
const MARIE = 'marie@exemple.fr';
const PAUL = 'paul@exemple.fr';
// Un document de deux modèles enregistrés (« Modèle 0001 », « Modèle 0002 »), la personne qui l'ouvre et, pour une page rechargée, les lignes de préférences que Grist gardait.
const persistSpec = (email, rows) => ({ tables: SPEC.tables, models: { count: 2, paragraphs: 2, table: 'PbClients', columns: ['Nom'] }, userEmail: email, internal: rows ? [{ table: PREFS, columns: PREF_COLUMNS, rows }] : [] });
const choicesOf = async page => [await typeValue(page), await qualityValue(page), await linesValue(page)].join('|');
// Les lignes de la table des préférences telles que Grist les a : une par personne et par modèle.
const prefRows = page => page.evaluate(table => {
  const t = window.__gristStub.state.rows[table];
  return t ? t.id.map((id, i) => Object.fromEntries(Object.keys(t).filter(k => k !== 'id').map(k => [k, t[k][i]]))) : [];
}, PREFS);
// Les écritures faites dans cette table depuis le dernier oubli du journal du faux Grist (forgetLog).
const prefWrites = page => page.evaluate(({ table, writes }) => window.__gristStub.getActionLog().filter(a => a[1] === table && writes.includes(a[0])).map(a => a[0]), { table: PREFS, writes: PREF_WRITES });
const forgetLog = page => page.evaluate(() => { window.__gristStub.clearActionLog(); window.__gristStub.state.deniedWrites = []; });
const rowOf = (rows, model) => rows.find(r => r.ModeleId === model);

// Ce que les deux menus montrent du modèle ouvert : `want` = [type, qualité, lignes]. Chaque menu est survolé sur une AUTRE ligne que la ligne choisie, qui se mesure ainsi au repos.
async function menusShow(page, tag, want) {
  const [type, quality, lines] = want;
  const got = await choicesOf(page);
  check(`${tag} : les listes cachées disent ${want.join(' | ')}`, got === want.join('|'), got);
  check(`${tag} : le bouton du type est ${type === 'pdf' ? 'éteint' : 'allumé'}`, (await typeButtonLit(page)) === (type !== 'pdf'), { lit: await typeButtonLit(page) });
  await hoverRow(page, TYPE_MENU, TYPE_ROW(type === 'pdf' ? 'docx' : 'pdf'));
  const typeRows = await stateOf(page, [TYPE_ROW('pdf'), TYPE_ROW('docx'), TYPE_ROW('xlsx')]);
  check(`${tag} : dans le menu du type, seule la ligne « ${type} » est active ; les trois sont entières et lisibles`,
    typeRows.filter(r => r.active).map(r => r.sel).join() === TYPE_ROW(type) && typeRows.every(r => r.shown && r.inside && r.contrast >= 4.5), typeRows);
  if (type === 'pdf') {
    const qualities = await stateOf(page, ['native', 'browser-print', 'light'].map(QUALITY_ROW));
    check(`${tag} : la qualité « ${quality} » est la ligne active ; les trois sont entières et lisibles`,
      qualities.filter(r => r.active).map(r => r.sel).join() === QUALITY_ROW(quality) && qualities.every(r => r.shown && r.inside && r.contrast >= 4.5), qualities);
  }
  await hoverRow(page, EXPORT_MENU, LINES_ROW(lines === 'one' ? 'zip' : 'one'));
  const ticked = (await stateOf(page, [LINES_ROW(lines)]))[0];
  check(`${tag} : dans le menu « Exporter », seule l'option « ${lines} » est cochée, sa coche devant, entière et lisible`,
    (await tickedLines(page)) === lines && ticked.shown && ticked.inside && !!ticked.tick && ticked.tick.visible && ticked.tick.inFront && ticked.contrast >= 4.5, ticked);
  await parkMouse(page);
}

async function persistence() {
  const errors = [];
  console.log('\n[gardé par personne et par modèle] Marie choisit, modèle par modèle, à la vraie souris');
  w = await open({ spec: persistSpec(MARIE), port: PORT, settleMs: 1500, theme: 'light', lang: 'fr' });
  let page = w.page;
  const first = await pickTemplate(page, 'Modèle 0001');
  await forgetLog(page);
  await menusShow(page, 'Modèle 0001, première ouverture', ['pdf', 'native', 'one']);
  check('regarder les deux menus n\'écrit rien dans le document', (await prefWrites(page)).length === 0, await prefWrites(page));
  await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('light'));
  await sleep(500);
  await parkMouse(page);
  let rows = await prefRows(page);
  check('« Léger » choisi : une ligne pour Marie et ce modèle, la qualité seule est écrite', rows.length === 1 && rows[0].Utilisateur === MARIE && rows[0].ModeleId === first && rows[0].QualitePdf === 'light' && !rows[0].TypeExport && !rows[0].LignesExport, rows);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  await sleep(500);
  await parkMouse(page);
  await chooseExportLines(page, 'zip');
  await sleep(500);
  await parkMouse(page);
  rows = await prefRows(page);
  check('Word puis « Toutes les lignes (ZIP) » : toujours UNE ligne, mise à jour sur place (Word, léger, ZIP)', rows.length === 1 && rows[0].TypeExport === 'docx' && rows[0].QualitePdf === 'light' && rows[0].LignesExport === 'zip', rows);

  const second = await pickTemplate(page, 'Modèle 0002');
  await menusShow(page, 'Modèle 0002, première ouverture', ['pdf', 'native', 'one']);
  rows = await prefRows(page);
  check('« Modèle 0002 » s\'ouvre à l\'origine (les réglages du premier n\'ont pas suivi) et rien ne s\'écrit pour lui', rows.length === 1 && rows[0].ModeleId === first, rows);
  await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('browser-print'));
  await sleep(500);
  await parkMouse(page);
  await chooseExportLines(page, 'merged');
  await sleep(500);
  await parkMouse(page);
  rows = await prefRows(page);
  const own = rowOf(rows, second);
  check('« Impression navigateur » et « un seul PDF » pour le second modèle : sa propre ligne, la première intacte',
    rows.length === 2 && !!own && own.Utilisateur === MARIE && own.QualitePdf === 'browser-print' && own.LignesExport === 'merged' && !own.TypeExport
      && rowOf(rows, first).TypeExport === 'docx' && rowOf(rows, first).QualitePdf === 'light' && rowOf(rows, first).LignesExport === 'zip', rows);
  await pickTemplate(page, 'Modèle 0001');
  await menusShow(page, 'retour au Modèle 0001 (même page)', ['docx', 'light', 'zip']);
  const writes = await prefWrites(page);
  check('les écritures sont celles des choix : deux lignes créées (une par modèle), les autres choix mis à jour sur place, aucune colonne ajoutée',
    writes.filter(x => x === 'AddRecord').length === 2 && writes.filter(x => x === 'UpdateRecord').length === 3 && writes.length === 5, writes);
  const kept = await prefRows(page);
  errors.push(...realErrors(w));
  await w.close();

  console.log('\n[gardé par personne et par modèle] La page est rechargée (anglais, sombre) : Marie retrouve ses menus');
  w = await open({ spec: persistSpec(MARIE, kept), port: PORT, settleMs: 1500, theme: 'dark', lang: 'en' });
  page = w.page;
  await forgetLog(page);
  await pickTemplate(page, 'Modèle 0001');
  await menusShow(page, 'rechargé, Modèle 0001', ['docx', 'light', 'zip']);
  await pickTemplate(page, 'Modèle 0002');
  await menusShow(page, 'rechargé, Modèle 0002', ['pdf', 'browser-print', 'merged']);
  check('rechargé : relire ses choix n\'écrit rien dans le document', (await prefWrites(page)).length === 0, await prefWrites(page));
  await pickTemplate(page, 'Modèle 0001');
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  await sleep(500);
  await parkMouse(page);
  await menusShow(page, 'rechargé, Modèle 0001 repassé au PDF (la qualité gardée revient)', ['pdf', 'light', 'zip']);
  rows = await prefRows(page);
  const back = rowOf(rows, first);
  check('repasser au PDF réécrit la même ligne : le type d\'origine est vide, la qualité et les lignes sont gardées', rows.length === 2 && !!back && back.TypeExport === '' && back.QualitePdf === 'light' && back.LignesExport === 'zip', rows);
  errors.push(...realErrors(w));
  await w.close();

  console.log('\n[gardé par personne et par modèle] Une autre personne repart de l\'origine ; un compte Lecteur choisit sans rien écrire');
  w = await open({ spec: persistSpec(PAUL, kept), port: PORT, settleMs: 1500, theme: 'light', lang: 'fr' });
  page = w.page;
  await forgetLog(page);
  await pickTemplate(page, 'Modèle 0001');
  await menusShow(page, 'autre personne, Modèle 0001', ['pdf', 'native', 'one']);
  await pickTemplate(page, 'Modèle 0002');
  await menusShow(page, 'autre personne, Modèle 0002', ['pdf', 'native', 'one']);
  await page.evaluate(async () => { window.__gristStub.setViewer(true); await AccessRights.refresh(); });
  await sleep(500);
  check('le compte devient Lecteur (lecture seule)', await page.evaluate(() => AccessRights.get().readOnly), await page.evaluate(() => AccessRights.get()));
  await forgetLog(page);
  await pickTemplate(page, 'Modèle 0001');
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  await sleep(500);
  await parkMouse(page);
  await chooseExportLines(page, 'zip');
  await sleep(500);
  await parkMouse(page);
  await menusShow(page, 'Lecteur, Modèle 0001', ['docx', 'native', 'zip']);
  await pickTemplate(page, 'Modèle 0002');
  await menusShow(page, 'Lecteur, Modèle 0002 (le choix du premier n\'a pas suivi)', ['pdf', 'native', 'one']);
  await pickTemplate(page, 'Modèle 0001');
  await menusShow(page, 'Lecteur, retour au Modèle 0001 (gardé pour la session)', ['docx', 'native', 'zip']);
  const viewerWrites = await prefWrites(page);
  const denied = await page.evaluate(() => window.__gristStub.state.deniedWrites.length);
  check('Lecteur : aucune écriture dans la table des préférences et aucune écriture refusée par Grist', viewerWrites.length === 0 && denied === 0, { viewerWrites, denied });
  check('Lecteur : les lignes de Marie sont intactes', JSON.stringify(await prefRows(page)) === JSON.stringify(kept), await prefRows(page));
  errors.push(...realErrors(w));
  await w.close();
  w = null;
  check('aucune erreur de page (choix gardés)', errors.length === 0, errors);
}

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
  check('le bouton Exporter, type Excel, « une seule ligne » : le classeur .xlsx de la ligne courante est téléchargé', /\.xlsx$/i.test(nameOf(gridFile) || ''), nameOf(gridFile));
  await sleep(500);
  await parkMouse(page);
  await chooseExportLines(page, 'workbook');
  await parkMouse(page);
  const singleDownload = await download(page, async () => {
    await click(page, EXPORT_MENU);
    await sleep(700);
  }, 2500);
  const asked = await dialogState(page);
  check('« …dans un seul classeur » cochée, le bouton Exporter demande d\'abord sa confirmation, dans le panneau, sans rien télécharger', !!asked && asked.inside && /seul classeur Excel/.test(asked.message) && singleDownload === null, { asked, file: nameOf(singleDownload) });
  if (asked) await cancelDialog(page);
  const afterCancel = await download(page, async () => { await sleep(1500); }, 1500);
  check('« Annuler » ferme la fenêtre et n\'exporte rien', !(await dialogState(page)) && afterCancel === null, { file: nameOf(afterCancel) });
  await parkMouse(page);
  await chooseExportLines(page, 'zip');
  await parkMouse(page);
  const zipDownload = await download(page, async () => {
    await click(page, EXPORT_MENU);
    await page.waitForSelector('#pp-dialog-modal .var-modal-primary', { state: 'visible', timeout: 30000 });
    await sleep(250);
    await click(page, '#pp-dialog-modal .var-modal-primary');
  }, 120000);
  check('« Toutes les valeurs de la table (ZIP) » cochée, le bouton Exporter demande sa confirmation, « Générer » rend l\'archive des classeurs (-export-xlsx.zip)', /-export-xlsx\.zip$/i.test(nameOf(zipDownload) || ''), nameOf(zipDownload));
  await sleep(600);
  await parkMouse(page);
  await chooseExportLines(page, 'one');
  await parkMouse(page);

  console.log('\nRetour dans un document : le type revient au PDF');
  await newModel(page, 'document');
  check('Excel ne se fait pas dans un document : le type est revenu au PDF, le bouton du type n\'est plus allumé', (await typeValue(page)) === 'pdf' && !(await typeButtonLit(page)), { type: await typeValue(page), lit: await typeButtonLit(page) });
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const backRows = await stateOf(page, PDF_LINES);
  check('le menu « Exporter » est de nouveau celui du PDF (quatre options, les mots du document, « une seule ligne » cochée)', backRows.every(r => r.shown && r.inside) && backRows.map(r => r.text).join('|') === WORDS.fr.pdf.join('|') && backRows[0].ticked, backRows.map(r => r.text));
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
  check('le bouton Exporter, type Word, « une seule ligne » : un fichier .docx est téléchargé', /\.docx$/i.test(nameOf(wordFile) || ''), nameOf(wordFile));
  await sleep(600);
  await parkMouse(page);
  await page.evaluate(() => { const editor = document.querySelector('.tiptap'); editor.focus(); });
  await click(page, '.tiptap p');
  await sleep(200);
  const shortcutFile = await download(page, () => page.keyboard.press('Alt+p'));
  check('le raccourci Alt+P exporte dans le type choisi (ici un .docx)', /\.docx$/i.test(nameOf(shortcutFile) || ''), nameOf(shortcutFile));
  await sleep(600);
  await parkMouse(page);
  await chooseExportLines(page, 'zip');
  await parkMouse(page);
  await click(page, '.tiptap p');
  await sleep(200);
  const shortcutZip = await download(page, async () => {
    await page.keyboard.press('Alt+p');
    await sleep(700);
  }, 2500);
  const wordAsked = await dialogState(page);
  check('« Toutes les lignes (ZIP) » cochée, Alt+P pose la confirmation du ZIP de Word, dans le panneau, sans rien télécharger', !!wordAsked && wordAsked.inside && /DOCX/.test(wordAsked.message) && shortcutZip === null, { wordAsked, file: nameOf(shortcutZip) });
  if (wordAsked) await cancelDialog(page);
  await parkMouse(page);
  await chooseExportLines(page, 'one');
  await parkMouse(page);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  await sleep(300);
  await parkMouse(page);
  const pdfFile = await download(page, () => click(page, EXPORT_MENU));
  check('le bouton Exporter, type PDF, « une seule ligne » : un fichier .pdf est téléchargé', /\.pdf$/i.test(nameOf(pdfFile) || ''), nameOf(pdfFile));
  await sleep(600);
  await parkMouse(page);
  await chooseExportLines(page, 'merged');
  await parkMouse(page);
  const mergedDownload = await download(page, async () => {
    await click(page, EXPORT_MENU);
    await sleep(700);
  }, 2500);
  const pdfAsked = await dialogState(page);
  check('« Toutes les lignes en un seul PDF » cochée, le bouton Exporter pose la confirmation du PDF unique, dans le panneau, sans rien télécharger', !!pdfAsked && pdfAsked.inside && /seul fichier PDF/.test(pdfAsked.message) && mergedDownload === null, { pdfAsked, file: nameOf(mergedDownload) });
  if (pdfAsked) await cancelDialog(page);
  await parkMouse(page);
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
  await w.close();
  w = null;

  // ---- Passe 3 : les choix d'export gardés par personne et par modèle, puis relus dans une page rechargée ----
  await persistence();
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
