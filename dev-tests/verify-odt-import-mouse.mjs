#!/usr/bin/env node
// L'IMPORT d'un fichier OpenDocument texte (js/odt-import.js, ligne « Importer un OpenDocument… » du menu « + », js/main-import.js `onImportOdf`) à la VRAIE souris et avec un VRAI sélecteur de fichier
// (page.waitForEvent('filechooser') : Chromium n'ouvre le sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist (~700x400), hébergé par GFS (simulé par dev-tests/gfs-stub.js) :
// français clair, puis anglais sombre. dev-tests/scenarios-odt-import.js (groupe « odtImport ») vérifie, DANS la page, ce que l'import écrit ; une page.evaluate ne déclenche ni le survol d'un menu, ni un
// geste « trusted », ni un vrai sélecteur de fichier : c'est ici qu'on s'assure que
//  - le menu « + » montre « Importer un OpenDocument… » (« Import from OpenDocument… ») après « Importer un PowerPoint… », entière dans le panneau, que rien ne la recouvre, lisible (>= 4,5:1) au repos et
//    sous la souris, et active sans aucune extension ;
//  - un vrai clic ouvre le vrai sélecteur, réduit aux documents OpenDocument texte (.odt, .ott, .fodt), pour un seul fichier ; annuler ne change rien ; le moteur (js/odt-import.js) n'est demandé au réseau qu'au
//    premier import, une seule fois ;
//  - le fichier choisi devient un NOUVEAU document, sans nom : son titre, son texte mis en forme, sa liste, son tableau (une case fusionnée), la page A4 et ses marges ; rien à dire : aucune fenêtre ;
//  - un document modifié et pas enregistré : « Modifications non enregistrées » vient APRÈS le choix du fichier et sa lecture ; « Annuler » garde le document, « Ne pas enregistrer » importe, et la fenêtre du
//    rapport vient après la question ; elle dit chaque genre non repris, dans l'ordre, au singulier ou au pluriel, et tient dans le panneau ;
//  - un fichier refusé (pas un OpenDocument, un tableur, une présentation, un fichier protégé, un document vide, plus de 150 Mo) : un message clair en rouge, aucune fenêtre, rien ne change.
// Lancé par run-headless.mjs (groupe Node « odtImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-odt-import-mouse.mjs
// ODT_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir, mkdtemp, open as openFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';
import { hoverRow, clickHoverRow } from './load-lib.mjs';

const SHOTS = process.env.ODT_IMPORT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-odt-import-mouse', port: Number(process.env.ODT_IMPORT_MOUSE_PORT || 9098) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEED = seedModels();
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-odf';
const MIME = 'application/vnd.oasis.opendocument.text';
const MAX_MIB = 150;

const TEXTS = {
  fr: {
    row: 'Importer un OpenDocument…', unsaved: 'Modifications non enregistrées', discard: 'Ne pas enregistrer', cancel: 'Annuler', close: 'Fermer',
    imported: 'OpenDocument importé. Nommez le modèle puis enregistrez-le.', importedPattern: /OpenDocument importé/,
    reading: /^Lecture du fichier OpenDocument/,
    unreadable: 'Ce fichier n’est pas un document OpenDocument lisible.', unreadablePattern: /n’est pas un document OpenDocument/,
    encrypted: 'Fichier OpenDocument protégé par un mot de passe : enregistrez-le sans mot de passe.', encryptedPattern: /protégé par un mot de passe/,
    sheet: 'Ce tableur ne contient aucune case à importer.', sheetPattern: /ne contient aucune case/,
    drawing: 'Ce fichier OpenDocument est un dessin : seuls les textes, tableurs et présentations sont lus.', drawingPattern: /est un dessin/,
    empty: 'Ce document OpenDocument est vide.', emptyPattern: /est vide/,
    tooBig: 'Ce fichier est trop gros pour être importé : 150,1 Mo (au plus 150 Mo).', tooBigPattern: /trop gros/,
    reportTitle: 'Ce que l’import n’a pas repris tel quel', reportIntro: 'Le document est importé. Le fichier avait ceci, que l’éditeur n’a pas pu reprendre tel quel :',
    report: ['2 polices que l’éditeur n’a pas, remplacées par la plus proche', '1 paragraphe avec un retrait à droite, non repris', '1 image non reprise', '1 forme, zone de texte ou objet incorporé non repris',
      '1 commentaire non repris', '1 champ qui se met à jour (date, nombre de pages…) repris avec sa dernière valeur', '1 note de fin reprise comme note de bas de page', '1 lien vers une adresse non sûre, repris comme texte'],
  },
  en: {
    row: 'Import from OpenDocument…', unsaved: 'Unsaved changes', discard: 'Don’t save', cancel: 'Cancel', close: 'Close',
    imported: 'OpenDocument imported. Name the template, then save it.', importedPattern: /OpenDocument imported/,
    reading: /^Reading the OpenDocument file/,
    unreadable: 'This file is not a readable OpenDocument file.', unreadablePattern: /not a readable OpenDocument/,
    encrypted: 'Password-protected OpenDocument file: save it without a password.', encryptedPattern: /Password-protected/,
    sheet: 'This spreadsheet has no cells to import.', sheetPattern: /has no cells/,
    drawing: 'This OpenDocument file is a drawing: only texts, spreadsheets and presentations are read.', drawingPattern: /is a drawing/,
    empty: 'This OpenDocument document is empty.', emptyPattern: /is empty/,
    tooBig: 'This file is too big to import: 150.1 MB (at most 150 MB).', tooBigPattern: /too big/,
    reportTitle: 'What the import did not carry over as is', reportIntro: 'The document is imported. The file had the following, which the editor could not carry over as is:',
    report: ['2 fonts the editor does not have, replaced by the closest one', '1 paragraph with a right indent, not kept', '1 image not kept', '1 shape, text box or embedded object not kept',
      '1 comment not kept', '1 field that updates itself (date, page count…) kept with its last value', '1 endnote kept as a footnote', '1 link to an unsafe address kept as text'],
  },
};

// ---- Les fichiers de l'essai : fabriqués dans la page avec les briques de dev-tests/scenarios-odt-import.js (aucun fichier binaire dans le dépôt) ------------------------------------------------------------
// `plain` : un document que l'éditeur reprend en entier (titre, texte mis en forme, liste, tableau avec fusion) ; `report` : huit genres non repris ; `sheet`, `drawing` : un tableur et un dessin ;
// `locked` : un fichier protégé ; `empty` : un document sans texte ; `notOdf` : un zip qui n'est pas un OpenDocument.
const buildFile = async (page, kind) => Buffer.from(await page.evaluate(async (which) => {
  const F = window.OdtFixtures;
  const { odt, p, h, span, tStyle, cellStyle, cell, covered, row, table, bulletList, item, listStyle, BULLET_LEVELS, DEFAULT_STYLES, MASTER } = F;
  const kinds = {
    plain: () => ({
      masters: MASTER('<style:header><text:p>Rapport de gestion</text:p></style:header><style:footer><text:p>Page <text:page-number text:select-page="current">1</text:page-number></text:p></style:footer>'),
      styles: DEFAULT_STYLES + listStyle('L1', BULLET_LEVELS(['•'])),
      auto: tStyle('T1', 'fo:font-weight="bold" fo:color="#c80000"') + cellStyle('Table1.A1', 'fo:border="0.5pt solid #000000"') + cellStyle('Table1.B1', 'fo:background-color="#d9e2f3" fo:border="0.5pt solid #000000"'),
      body: '<text:tracked-changes><text:changed-region text:id="ct1"><text:insertion><office:change-info><dc:creator>Camille</dc:creator><dc:date>2026-11-10T09:00:00</dc:date></office:change-info></text:insertion></text:changed-region></text:tracked-changes>'
        + h('Bilan de l’année') + p('Le chiffre d’affaires ' + span('progresse', 'T1') + ' de 12 %.')
        + p('Une <text:change-start text:change-id="ct1"/>ligne ajoutée<text:change-end text:change-id="ct1"/> et un <office:annotation office:name="N1"><dc:creator>Camille</dc:creator><dc:date>2026-11-10T09:00:00</dc:date><text:p>À vérifier</text:p></office:annotation>chiffre à revoir<office:annotation-end office:name="N1"/>.') + bulletList([item(p('Premier point')), item(p('Deuxième point'))])
        + table('<table:table-column/><table:table-column/>', [row([cell(p('Mois'), 'Table1.B1', 'table:number-columns-spanned="2"'), covered()]), row([cell(p('Janvier'), 'Table1.A1'), cell(p('120'), 'Table1.A1')])]),
    }),
    report: () => ({
      auto: tStyle('T1', 'style:font-name="Cambria"') + tStyle('T2', 'style:font-name="Consolas"') + `<style:style style:name="P9" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-right="1cm"/></style:style>`,
      body: p('Résultats ' + span('serif', 'T1') + ' ' + span('mono', 'T2')) + p('Retrait à droite', 'P9')
        + p('Image <draw:frame draw:name="i1" text:anchor-type="as-char"><draw:image xlink:href="Pictures/a.png"/></draw:frame>')
        + p('Zone <draw:frame draw:name="z1" text:anchor-type="as-char"><draw:text-box><text:p>dedans</text:p></draw:text-box></draw:frame>')
        + p('Note<text:note text:id="n1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p>Voici la note de fin.</text:p></text:note-body></text:note>')
        + p('Avec commentaire') + p('<office:annotation><dc:creator>A</dc:creator><text:p>À revoir</text:p></office:annotation>')
        + p('Date : <text:date text:date-value="2026-11-17">17/11/2026</text:date>')
        + p('<text:a xlink:href="javascript:alert(1)" xlink:type="simple">piège</text:a>'),
    }),
    sheet: () => ({ mime: 'application/vnd.oasis.opendocument.spreadsheet', bodyTag: 'office:spreadsheet', body: '<table:table table:name="A"/>' }),
    drawing: () => ({ mime: 'application/vnd.oasis.opendocument.graphics', bodyTag: 'office:drawing', body: '<draw:page draw:name="p1"/>' }),
    locked: () => ({ encrypted: true }),
    empty: () => ({ body: p('') }),
  };
  let buffer;
  if (which === 'notOdf') {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
    buffer = await zip.generateAsync({ type: 'arraybuffer' });
  } else buffer = await odt(kinds[which]());
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}, kind), 'base64');
const odfFile = (name, buffer) => ({ name, mimeType: MIME, buffer });

// ---- Ce que la page montre ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const rowsState = (page, selectors) => page.evaluate(sels => {
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
      sel, text: el.textContent.trim(), shown, inside: shown && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      reachable: !!top && el.contains(top), cut: el.scrollWidth > el.clientWidth + 1, live: !el.classList.contains('v2-hover-row-disabled') && el.getAttribute('aria-disabled') !== 'true',
      previous: (el.previousElementSibling || {}).id || '', next: (el.nextElementSibling || {}).id || '', contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100,
    };
  });
}, selectors);
const hoveredState = async (page, row) => {
  await hoverRow(page, PLUS, row);
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const la = lum(cs.color), lb = lum(cs.backgroundColor);
    return { hovered: el.matches(':hover'), painted: !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor), contrast: Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100 };
  }, row);
};
const statusOf = page => page.evaluate(() => {
  const el = document.getElementById('status-msg');
  const r = el.getBoundingClientRect();
  return { text: el.textContent, error: el.classList.contains('error-msg'), clipped: el.scrollWidth > el.clientWidth + 1, inPanel: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
});
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
    boxInPanel: inPanel(rect(box)), titleInPanel: !!title && inPanel(rect(title)), buttonsInPanel: buttons.every(b => inPanel(rect(b))),
    focusOn: document.activeElement ? document.activeElement.textContent.trim().slice(0, 30) : '',
  };
});
async function clickDialogButton(page, text) {
  const target = await page.evaluate(label => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const button = Array.from(ov.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && b.getClientRects().length).find(b => b.textContent.trim() === label);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, reachable: !!top && button.contains(top), inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }, text);
  if (!target) return null;
  await page.mouse.move(target.x - 8, target.y, { steps: 2 });
  await page.mouse.click(target.x, target.y);
  await sleep(450);
  return target;
}
const parkMouse = async page => { await page.mouse.move(WIDTH - 10, HEIGHT - 10, { steps: 3 }); await sleep(350); };
// Ce que le document montre : son HTML (la comparaison « rien n'a changé »), sa page, son modèle, ses blocs.
const snapshot = page => page.evaluate(() => ({
  html: Editor.getHTML(),
  page: PageLayout.getPageSizePt(),
  modelId: Templates.getCurrentId(),
  select: document.getElementById('template-select').value,
  text: document.querySelector('#editor-container .tiptap').textContent,
  headings: document.querySelectorAll('#editor-container .tiptap h1').length,
  items: document.querySelectorAll('#editor-container .tiptap li').length,
  tables: document.querySelectorAll('#editor-container .tiptap table').length,
  strong: Array.from(document.querySelectorAll('#editor-container .tiptap strong')).map(e => e.textContent),
  merged: Array.from(document.querySelectorAll('#editor-container .tiptap td, #editor-container .tiptap th')).filter(c => c.colSpan === 2).length,
}));

// Le geste complet pour désigner un fichier : « + » au survol, la ligne au vrai clic ; l'écoute du sélecteur est installée AVANT le clic.
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
const mibFile = async (dir, name, bytes) => { const path = join(dir, name); const handle = await openFile(path, 'w'); await handle.truncate(bytes); await handle.close(); return path; };

async function run(lang, scheme) {
  const T = TEXTS[lang];
  const label = (lang === 'fr' ? 'français' : 'anglais') + ' ' + (scheme === 'dark' ? 'sombre' : 'clair');
  const tag = `[${lang} ${scheme}] `;
  console.log(`\n=== Import d'un OpenDocument à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { page, requests, natives } = await t.openPage({ hosted: true, stub: { extensions: ['graphique'] }, seed: SEED, lang, colorScheme: scheme });
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${scheme}-${name}.png`) }); };
  const tmp = await mkdtemp(join(tmpdir(), 'pp-odt-import-'));
  try {
    await page.addScriptTag({ url: '/dev-tests/scenarios-odt-import.js' });
    const engineRequests = () => requests.filter(url => /js\/odt-import\.js/.test(url)).length;

    // 1) Le menu « + » : la ligne suit « Importer un PowerPoint… », dans le panneau, rien ne la recouvre, texte lisible, sur son fond de survol aussi, active sans extension.
    await hoverRow(page, PLUS, ROW);
    const [row] = await rowsState(page, [ROW]);
    check(tag + `le menu « + » montre « ${T.row} » après « Importer un PowerPoint… », entière dans le panneau, atteignable, active sans aucune extension, sans texte coupé`,
      !row.missing && row.text === T.row && row.previous === 'v2-btn-import-pptx' && row.inside && row.reachable && !row.cut && row.live, row);
    check(tag + 'le texte de la ligne tient les contrastes de la charte (>= 4,5:1), au repos et sous la souris', row.contrast >= 4.5, row.contrast);
    const hovered = await hoveredState(page, ROW);
    check(tag + 'sous la souris, la ligne se peint de son fond de survol et reste lisible (>= 4,5:1)', hovered.hovered && hovered.painted && hovered.contrast >= 4.5, hovered);
    await snap('menu');
    await parkMouse(page);

    // 2) Le vrai sélecteur : un seul fichier, réduit aux documents OpenDocument texte ; annuler ne change rien ; le moteur n'a pas encore été demandé au réseau.
    const before = await statusOf(page);
    const { chooser } = await pickFile(page, null);
    check(tag + 'un vrai clic sur la ligne ouvre le vrai sélecteur de fichier', !!chooser);
    if (!chooser) return;
    const accept = await chooser.element().getAttribute('accept');
    check(tag + 'le sélecteur est réduit aux fichiers OpenDocument texte (.odt, .ott, .fodt) et tableur (.ods, .ots, .fods), pour un seul fichier, ni Word, ni Excel, ni présentation',
      !chooser.isMultiple() && /\.odt\b/.test(accept) && /\.ott\b/.test(accept) && /\.fodt\b/.test(accept) && !/docx|xlsx|pptx|\.md\b/.test(accept), { accept, multiple: chooser.isMultiple() });
    await chooser.element().evaluate(el => el.dispatchEvent(new Event('cancel')));
    await sleep(500);
    const afterCancel = await statusOf(page);
    const leftovers = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    check(tag + 'annuler dans le sélecteur ne change rien : même message d\'état, aucune fenêtre, aucun champ de fichier oublié, le moteur d\'import pas encore demandé au réseau',
      afterCancel.text === before.text && !(await dialogState(page)).shown && leftovers === 0 && engineRequests() === 0, { before: before.text, afterCancel: afterCancel.text, leftovers, engine: engineRequests() });

    // 3) Un document que l'éditeur reprend en entier : rien n'était à enregistrer, donc aucune question ; rien à dire, donc aucune fenêtre.
    const first = await pickFile(page, odfFile('bilan.odt', await buildFile(page, 'plain')));
    check(tag + 'le sélecteur s\'ouvre de nouveau', !!first.chooser);
    await settle(page, T.importedPattern);
    await sleep(500);
    const done = await statusOf(page);
    check(tag + `le coin d'état dit « ${T.imported} », en entier, sans être coupé, dans le panneau`, done.text === T.imported && !done.error && !done.clipped && done.inPanel, done);
    check(tag + 'rien n\'était à enregistrer et rien n\'est à dire : aucune fenêtre ne s\'est ouverte, avant ni après', !first.askedBefore.shown && !(await dialogState(page)).shown);
    check(tag + 'le moteur d\'import est demandé au réseau une seule fois, à ce premier import', engineRequests() === 1, engineRequests());
    const plain = await snapshot(page);
    check(tag + 'le document est NOUVEAU, sans nom : aucun modèle choisi, la page A4 du fichier (595 x 842 pt)', !plain.modelId && plain.select === '' && Math.abs(plain.page.width - 595) < 2 && Math.abs(plain.page.height - 842) < 2, { id: plain.modelId, select: plain.select, page: plain.page });
    check(tag + 'le titre, le texte, les deux points de la liste et le tableau (une case sur deux colonnes) sont dans le document',
      plain.headings === 1 && /Bilan de l’année/.test(plain.text) && /Le chiffre d’affaires progresse de 12 %\./.test(plain.text) && plain.items === 2 && /Deuxième point/.test(plain.text)
      && plain.tables === 1 && plain.merged === 1 && /Janvier/.test(plain.text), { headings: plain.headings, items: plain.items, tables: plain.tables, merged: plain.merged, text: plain.text.slice(0, 160) });
    check(tag + 'la mise en forme du texte est reprise : « progresse » en gras', plain.strong.includes('progresse'), plain.strong);
    const rich = await page.evaluate(() => {
      const data = HeaderFooterPreview.getHeaderFooterData();
      const tiptap = document.querySelector('#editor-container .tiptap');
      return { enabled: data.enabled, header: data.header.default, footer: data.footer.default, inserted: Array.from(tiptap.querySelectorAll('ins')).map(e => e.textContent), marked: Array.from(tiptap.querySelectorAll('span.comment-mark')).map(e => e.textContent) };
    });
    check(tag + 'l\'en-tête et le pied de page du fichier sont repris (le numéro de page est celui de l\'éditeur), sans rien dire de plus',
      rich.enabled && /Rapport de gestion/.test(rich.header) && /Page/.test(rich.footer) && /page-number-badge/.test(rich.footer), rich);
    check(tag + 'l\'insertion suivie du fichier reste en attente dans le texte et le passage commenté est marqué',
      rich.inserted.join('') === 'ligne ajoutée' && rich.marked.join('') === 'chiffre à revoir', rich);
    const visible = await page.evaluate(() => {
      const c = document.getElementById('editor-container').getBoundingClientRect();
      const h1 = document.querySelector('#editor-container .tiptap h1');
      const r = h1.getBoundingClientRect();
      return { shown: r.width > 0 && r.bottom > c.top && r.top < c.bottom };
    });
    check(tag + 'le titre est visible dans l\'éditeur', visible.shown, visible);
    await snap('plain');
    await parkMouse(page);

    // 4) Le document est maintenant « à enregistrer » : la question vient APRÈS le choix du fichier et sa lecture ; Annuler garde le document ; « Ne pas enregistrer » importe ;
    //    ce fichier a de quoi remplir la fenêtre du rapport, qui vient après la question.
    const report = odfFile('resultats.odt', await buildFile(page, 'report'));
    const second = await pickFile(page, report);
    check(tag + '(document à enregistrer) le sélecteur s\'ouvre sans poser de question avant le choix du fichier', !!second.chooser && !second.askedBefore.shown, second.askedBefore);
    await settle(page, /^$/);
    const asked = await dialogState(page);
    check(tag + `la fenêtre « ${T.unsaved} » s'ouvre après le choix du fichier, avec « ${T.discard} » et « ${T.cancel} »`, asked.shown && asked.title === T.unsaved && asked.buttons.includes(T.discard) && asked.buttons.includes(T.cancel), asked);
    check(tag + 'pendant la question, le coin d\'état n\'annonce plus la lecture du fichier (elle est finie)', !T.reading.test((await statusOf(page)).text), (await statusOf(page)).text);
    await snap('question');
    const cancelled = await clickDialogButton(page, T.cancel);
    check(tag + `« ${T.cancel} » est atteignable à la souris dans le panneau`, !!cancelled && cancelled.reachable && cancelled.inPanel, cancelled);
    const kept = await snapshot(page);
    check(tag + `« ${T.cancel} » : la fenêtre se ferme, le premier document reste tel quel et aucune fenêtre de rapport ne vient`, !(await dialogState(page)).shown && kept.html === plain.html, { same: kept.html === plain.html });
    await pickFile(page, report);
    await settle(page, /^$/);
    const discarded = await clickDialogButton(page, T.discard);
    check(tag + `« ${T.discard} » est atteignable à la souris dans le panneau`, !!discarded && discarded.reachable && discarded.inPanel, discarded);
    await settle(page, T.importedPattern);
    await sleep(400);
    const told = await dialogState(page);
    const replaced = await snapshot(page);
    check(tag + `« ${T.discard} » : le document du fichier remplace le premier (« Résultats », plus de tableau) et le coin d'état le dit`, /Résultats/.test(replaced.text) && replaced.tables === 0 && (await statusOf(page)).text === T.imported, { tables: replaced.tables, text: replaced.text.slice(0, 80) });
    const lines = told.message.split('\n');
    check(tag + `la fenêtre du rapport s'ouvre APRÈS la question, titrée « ${T.reportTitle} », avec sa phrase d'introduction`, told.shown && told.title === T.reportTitle && lines[0] === T.reportIntro, { title: told.title, intro: lines[0] });
    check(tag + 'elle dit chaque genre non repris, un par ligne, dans l\'ordre (polices, retrait, image, forme, commentaire, champ, note de fin, lien), au singulier ou au pluriel',
      JSON.stringify(lines.slice(1)) === JSON.stringify(T.report.map(line => '• ' + line)), lines.slice(1));
    check(tag + `elle n'a qu'un bouton, « ${T.close} », entière dans le panneau, avec le focus dessus`, told.buttons.length === 1 && told.buttons[0] === T.close && told.boxInPanel && told.buttonsInPanel && told.focusOn === T.close, told);
    const titleContrast = await contrastOf(page, '#pp-dialog-modal #pp-dialog-title');
    const messageContrast = await contrastOf(page, '#pp-dialog-modal .pp-dialog-message');
    check(tag + 'le titre et le texte de la fenêtre du rapport tiennent les contrastes de la charte (>= 4,5:1)', titleContrast >= 4.5 && messageContrast >= 4.5, { titleContrast, messageContrast });
    await snap('report');
    const closed = await clickDialogButton(page, T.close);
    check(tag + `« ${T.close} » est atteignable à la souris dans le panneau`, !!closed && closed.reachable && closed.inPanel, closed);
    const afterClose = await page.evaluate(() => ({ editorFocused: !!document.activeElement && !!document.activeElement.closest('.tiptap'), open: getComputedStyle(document.getElementById('pp-dialog-modal')).display !== 'none' }));
    check(tag + 'la fenêtre se ferme et rend la main à l\'éditeur (le curseur est dans le texte)', !afterClose.open && afterClose.editorFocused, afterClose);
    check(tag + 'le texte du champ garde sa dernière valeur et le lien refusé reste du texte : « 17/11/2026 » et « piège » sont dans le document, sans lien',
      await page.evaluate(() => { const text = document.querySelector('#editor-container .tiptap').textContent; return /17\/11\/2026/.test(text) && /piège/.test(text) && !document.querySelector('#editor-container .tiptap a[href^="javascript"]'); }));
    await parkMouse(page);

    // 5) Les fichiers refusés : un message clair en rouge, aucune fenêtre (même avec un document à enregistrer), le document ne bouge pas.
    const baseline = await snapshot(page);
    const refused = async (file, pattern) => {
      await pickFile(page, file);
      await settle(page, pattern);
      const after = await statusOf(page);
      const dialog = await dialogState(page);
      const now = await snapshot(page);
      return { after, dialog, unchanged: now.html === baseline.html };
    };
    const refusal = (what, got, expected) => check(tag + `${what} : « ${expected} » en rouge, sans fenêtre, le document ne bouge pas`, got.after.text === expected && got.after.error && !got.dialog.shown && got.unchanged && !got.after.clipped && got.after.inPanel, got);
    refusal('un fichier qui n\'est pas un zip', await refused(odfFile('courrier.odt', Buffer.from('Ceci est un courrier, pas un document OpenDocument.', 'utf8')), T.unreadablePattern), T.unreadable);
    refusal('un zip qui n\'est pas un OpenDocument (une présentation PowerPoint)', await refused(odfFile('presentation.odt', await buildFile(page, 'notOdf')), T.unreadablePattern), T.unreadable);
    refusal('un fichier protégé par un mot de passe', await refused(odfFile('secret.odt', await buildFile(page, 'locked')), T.encryptedPattern), T.encrypted);
    refusal('un tableur OpenDocument sans aucune case (un tableur plein est importé : dev-tests/verify-ods-import-mouse.mjs)', await refused({ name: 'chiffres.ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: await buildFile(page, 'sheet') }, T.sheetPattern), T.sheet);
    refusal('un dessin OpenDocument', await refused({ name: 'dessin.odg', mimeType: 'application/vnd.oasis.opendocument.graphics', buffer: await buildFile(page, 'drawing') }, T.drawingPattern), T.drawing);
    refusal('un document sans rien dedans', await refused(odfFile('vide.odt', await buildFile(page, 'empty')), T.emptyPattern), T.empty);
    const huge = await mibFile(tmp, 'gros.odt', MAX_MIB * 1024 * 1024 + 1);
    refusal(`un fichier de plus de ${MAX_MIB} Mo (jamais lu : sa taille suffit)`, await refused(huge, T.tooBigPattern), T.tooBig);
    await snap('refused');
    check(tag + 'aucun de ces refus n\'a demandé le moindre rechargement du moteur ni laissé un champ de fichier dans la page', engineRequests() === 1 && (await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)) === 0, { engine: engineRequests() });
    check(tag + 'aucune boîte native (alert, confirm, prompt) ne s\'est ouverte pendant tout le parcours', natives.length === 0, natives);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
