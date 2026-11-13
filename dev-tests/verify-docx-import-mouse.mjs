#!/usr/bin/env node
// L'IMPORT d'un fichier Word (js/docx-import.js, ligne « Importer un Word… » du menu « + ») à la VRAIE souris et avec un VRAI sélecteur de fichier (page.waitForEvent('filechooser') : Chromium n'ouvre le
// sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist (~700x400), hébergé par GFS (simulé par dev-tests/gfs-stub.js) : français clair, puis anglais sombre.
// dev-tests/scenarios-docx-import.js (groupe « docxImport ») vérifie, DANS la page, ce que l'import écrit ; une page.evaluate ne déclenche ni le survol d'un menu, ni un geste « trusted », ni un vrai
// sélecteur de fichier : c'est ici qu'on s'assure que
//  - le menu « + » montre « Importer un Word… » (« Import from Word… ») entre « Importer un Markdown… » et « Importer un PowerPoint… », entière dans le panneau, que rien ne la recouvre, lisible (>= 4,5:1),
//    au repos et sous la souris, et active sans aucune extension ;
//  - un vrai clic ouvre le vrai sélecteur, réduit aux documents Word (.docx, .docm, .dotx, .dotm), pour un seul fichier ; annuler ne change rien ; le moteur (js/docx-import.js) n'est demandé au réseau qu'au
//    premier import, une seule fois ;
//  - le fichier choisi devient un NOUVEAU document, sans nom : son titre, son texte mis en forme, sa liste, son tableau, son image, sa note de bas de page, la page A4 et ses marges, l'en-tête et le pied
//    de page, le filigrane de la page ; rien à dire : aucune fenêtre, et le coin d'état dit que le Word est importé, en entier ;
//  - un document modifié et pas enregistré : « Modifications non enregistrées » vient APRÈS le choix du fichier et sa lecture ; « Annuler » garde le document, « Ne pas enregistrer » importe, et la fenêtre
//    du rapport vient après la question ; elle dit chaque genre non repris, dans l'ordre, au singulier ou au pluriel, tient dans le panneau, titre et bouton fixes, et se lit jusqu'à sa dernière ligne ;
//  - un fichier refusé (pas un Word, un zip qui n'en est pas un, un ancien .doc, un document vide, plus de 150 Mo) : un message clair en rouge, aucune fenêtre, rien ne change.
// Lancé par run-headless.mjs (groupe Node « docxImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-docx-import-mouse.mjs
// DOCX_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir, mkdtemp, open as openFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';
import { hoverRow, clickHoverRow } from './load-lib.mjs';

const SHOTS = process.env.DOCX_IMPORT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-docx-import-mouse', port: Number(process.env.DOCX_IMPORT_MOUSE_PORT || 9097) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEED = seedModels();
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-docx';
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_MIB = 150;

const TEXTS = {
  fr: {
    row: 'Importer un Word…', adoptTitle: 'Discussions du Word non enregistrées', adoptReason: /Grist refuse d’écrire/, unsaved: 'Modifications non enregistrées', discard: 'Ne pas enregistrer', cancel: 'Annuler', close: 'Fermer',
    imported: 'Word importé. Nommez le modèle puis enregistrez-le.', importedPattern: /Word importé/,
    reading: /^Lecture du fichier Word/,
    unreadable: 'Ce fichier n’est pas un document Word (.docx) lisible.', unreadablePattern: /n’est pas un document Word/,
    legacy: 'Format .doc d’avant 2007 ou fichier protégé : enregistrez-le en .docx sans mot de passe.', legacyPattern: /d’avant 2007/,
    empty: 'Ce document Word est vide.', emptyPattern: /est vide/,
    tooBig: 'Ce fichier est trop gros pour être importé : 150,1 Mo (au plus 150 Mo).', tooBigPattern: /trop gros/,
    reportTitle: 'Ce que l’import n’a pas repris tel quel', reportIntro: 'Le document est importé. Le fichier avait ceci, que l’éditeur n’a pas pu reprendre tel quel :',
    report: ['1 police que l’éditeur n’a pas, remplacée par la plus proche', '1 paragraphe avec un retrait à droite, non repris', '1 forme, zone de texte ou objet incorporé non repris',
      '1 graphique non repris', '1 commentaire sans passage de texte à marquer, non repris'],
    longFirst: '1 section avec une autre mise en page : seule la page de la première est reprise',
    samples: ['1 police que l’éditeur n’a pas, remplacée par la plus proche', '1 note de fin reprise comme note de bas de page', '2 modifications suivies de mise en forme ou de structure acceptées telles quelles (l’éditeur ne suit que les ajouts et les suppressions de texte)'],
  },
  en: {
    row: 'Import from Word…', adoptTitle: 'Word discussions not saved', adoptReason: /Grist refuses to write/, unsaved: 'Unsaved changes', discard: 'Don’t save', cancel: 'Cancel', close: 'Close',
    imported: 'Word imported. Name the template, then save it.', importedPattern: /Word imported/,
    reading: /^Reading the Word file/,
    unreadable: 'This file is not a readable Word (.docx) document.', unreadablePattern: /not a readable Word/,
    legacy: 'Pre-2007 .doc format or password-protected file: save it as .docx without a password.', legacyPattern: /Pre-2007/,
    empty: 'This Word document is empty.', emptyPattern: /is empty/,
    tooBig: 'This file is too big to import: 150.1 MB (at most 150 MB).', tooBigPattern: /too big/,
    reportTitle: 'What the import did not carry over as is', reportIntro: 'The document is imported. The file had the following, which the editor could not carry over as is:',
    report: ['1 font the editor does not have, replaced by the closest one', '1 paragraph with a right indent, not kept', '1 shape, text box or embedded object not kept',
      '1 chart not kept', '1 comment with no text passage to mark, not kept'],
    longFirst: '1 section with a different page layout: only the first one’s page is kept',
    samples: ['1 font the editor does not have, replaced by the closest one', '1 endnote kept as a footnote', '2 tracked formatting or structure changes accepted as is (the editor only tracks text additions and deletions)'],
  },
};

// ---- Les fichiers de l'essai : fabriqués dans la page avec les briques de dev-tests/scenarios-docx-import.js (aucun fichier binaire dans le dépôt) ------------------------------------------------------
// `plain` : un Word que l'éditeur reprend en entier (titre, texte mis en forme, liste, tableau avec fusion et fond, image, note de bas de page, en-tête, pied de page, filigrane) ; `report` : six genres
// non repris ; `many` : un fichier qui fait dire presque tous les genres ; `notWord` : un zip qui n'est pas un Word ; `empty` : un Word sans rien.
const buildFile = async (page, kind) => Buffer.from(await page.evaluate(async (which) => {
  const F = window.DocxFixtures;
  const { docx, p, r, tbl, tr, tc, pStyle, numPr, STYLES, NUMBERING, RED_BLUE, drawing, IMAGE_REL, SECT_A4 } = F;
  const fld = (instr, shown) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(shown)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const mark = text => `<w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" style="position:absolute;rotation:315" fillcolor="silver" stroked="f"><v:fill opacity=".5"/><v:textpath string="${text}"/></v:shape></w:pict></w:r></w:p>`;
  const sectWith = '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:footerReference w:type="default" r:id="rIdF1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>';
  const shape = '<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="Forme"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"/></a:graphic></wp:inline></w:drawing></w:r>';
  const chart = '<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="2" name="Graphique"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></wp:inline></w:drawing></w:r>';
  const diagram = '<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="3" name="Schéma"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:graphic></wp:inline></w:drawing></w:r>';
  const kinds = {
    plain: () => ({
      body: p('Bilan de l’année', pStyle('Heading1'))
        + p(r('Le chiffre d’affaires ', '') + r('progresse', '<w:b/><w:color w:val="C00000"/>') + r(' de 12 %.'), '<w:jc w:val="center"/>')
        + p('Premier point', numPr(1)) + p('Deuxième point', numPr(1))
        + tbl([tr([tc(p('Mois'), '<w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>')]), tr([tc(p('Janvier')), tc(p('120'))])], { grid: [2400, 2400], style: 'TableGrid' })
        + p(drawing({ rid: 'rIdImg1', w: 120, h: 60, descr: 'Logo' }))
        + p(r('Une note') + '<w:r><w:footnoteReference w:id="2"/></w:r>' + r('.')),
      sect: sectWith, numbering: NUMBERING, media: { 'image1.png': RED_BLUE() }, docRels: [IMAGE_REL('rIdImg1', 'image1.png')],
      headers: { 1: mark('CONFIDENTIEL') + p('Rapport trimestriel') }, footers: { 1: p(r('Page ') + fld('PAGE', '1'), '<w:jc w:val="center"/>') },
      footnotes: '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r>' + r(' Voici la note de bas de page.') + '</w:p></w:footnote>',
    }),
    report: () => ({
      body: p(r('Résultats ') + r('police rare', '<w:rFonts w:ascii="Segoe Script" w:hAnsi="Segoe Script"/>') + shape + chart)
        + p('Retrait à droite', '<w:ind w:right="720"/>')
        + p(r('Ajout') + '<w:del w:id="9" w:author="A"><w:r><w:delText>Retiré</w:delText></w:r></w:del><w:ins w:id="8" w:author="A">' + r(' inséré') + '</w:ins>'),
      comments: '<w:comment w:id="0" w:author="A"><w:p><w:r><w:t>Un commentaire</w:t></w:r></w:p></w:comment>',
    }),
    many: () => {
      const sect2 = '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/><w:cols w:num="2" w:space="708"/><w:pgBorders><w:top w:val="single" w:sz="4"/></w:pgBorders></w:sectPr>';
      const sect3 = sect2.replace('w:num="2"', 'w:num="1"');
      const inner = tbl([tr([tc(p('i1'))])]);
      return {
        body: p(r('Police ') + r('rare', '<w:rFonts w:ascii="Segoe Script" w:hAnsi="Segoe Script"/>') + shape + chart + diagram)
          + p('<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x=1</m:t></m:r></m:oMath>')
          + p(r('Ajout') + '<w:del w:id="9" w:author="A"><w:r><w:delText>Retiré</w:delText></w:r></w:del><w:ins w:id="8" w:author="A">' + r(' inséré') + '</w:ins>')
          + p(r('Forme', '<w:rPrChange w:id="17" w:author="A"><w:rPr/></w:rPrChange>')) + p(r('Forme deux', '<w:rPrChange w:id="18" w:author="A"><w:rPr/></w:rPrChange>'))
          + `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="2000"/></w:tabs></w:pPr>${r('Tab')}<w:r><w:tab/></w:r>${r('ulée')}</w:p>`
          + p('Retrait droit', '<w:ind w:right="720"/>') + p('Encadré', '<w:pBdr><w:top w:val="single" w:sz="4" w:color="000000"/></w:pBdr>')
          + p(r('Ombre', '<w:shadow/>')) + p(r('Caché', '<w:vanish/>') + r('visible'))
          + p(fld('DATE \\@ "dd/MM/yyyy"', '07/11/2026') + r(' ') + fld('MERGEFIELD Inconnue', '«Inconnue»'))
          + p(r('Note de fin') + '<w:r><w:endnoteReference w:id="3"/></w:r>')
          + tbl([tr([tc(p('dehors') + inner)])], { grid: [4000] })
          + tbl([tr([tc(p('a'), '<w:tcBorders><w:top w:val="dashed" w:sz="8" w:color="FF0000"/></w:tcBorders>')])], { grid: [4000] })
          + p(r('Sym') + '<w:r><w:sym w:font="Wingdings" w:char="F0FF"/></w:r>')
          + p(r('Lien ') + '<w:hyperlink w:anchor="signet">' + r('interne') + '</w:hyperlink>')
          + `<w:p><w:pPr>${sect2}</w:pPr>${r('Fin de la première section')}</w:p>` + `<w:p><w:pPr>${sect3}</w:pPr>${r('Fin de la deuxième')}</w:p>` + p('Fin'),
        endnotes: '<w:endnote w:id="3"><w:p><w:r><w:endnoteRef/></w:r>' + r(' Voici la note de fin.') + '</w:p></w:endnote>',
        comments: '<w:comment w:id="0" w:author="A"><w:p><w:r><w:t>Un commentaire</w:t></w:r></w:p></w:comment>',
        numbering: '<w:abstractNum w:abstractNumId="5"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="5"/></w:num>',
      };
    },
    // Un Word relu par deux personnes : un ajout et une suppression suivis, un commentaire sur un passage et la réponse d'une seconde personne.
    reviewed: () => ({
      body: p(r('Le contrat ') + '<w:ins w:id="1" w:author="Marie Dupont" w:date="2026-11-05T09:30:00Z">' + r('révisé ') + '</w:ins>'
        + '<w:del w:id="2" w:author="Paul Martin" w:date="2026-11-06T14:00:00Z"><w:r><w:delText xml:space="preserve">ancien </w:delText></w:r></w:del>'
        + '<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>' + r('prend effet le 1er janvier') + '<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r>' + r('.')),
      comments: '<w:comment xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" w:id="0" w:author="Marie Dupont" w:date="2026-11-05T09:30:00Z"><w:p w14:paraId="0000000A"><w:r><w:t>Vérifier la date.</w:t></w:r></w:p></w:comment>'
        + '<w:comment xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" w:id="1" w:author="Paul Martin" w:date="2026-11-05T10:00:00Z"><w:p w14:paraId="0000000B"><w:r><w:t>C’est confirmé.</w:t></w:r></w:p></w:comment>',
      docRels: [{ id: 'rIdExt', type: 'commentsExtended', target: 'commentsExtended.xml' }],
      parts: { 'word/commentsExtended.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:commentEx w15:paraId="0000000A" w15:done="0"/><w15:commentEx w15:paraId="0000000B" w15:paraIdParent="0000000A" w15:done="0"/></w15:commentsEx>' },
    }),
    empty: () => ({ body: '<w:p/>', headers: {}, footers: {} }),
  };
  let buffer;
  if (which === 'notWord') {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
    buffer = await zip.generateAsync({ type: 'arraybuffer' });
  } else buffer = await docx(kinds[which]());
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}, kind), 'base64');
const wordFile = (name, buffer) => ({ name, mimeType: MIME, buffer });

// ---- Ce que la page montre -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
  let scroller = null;
  for (let e = message; e && e !== ov; e = e.parentElement) { if (/auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1) { scroller = e; break; } }
  const buttons = Array.from(ov.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && b.getClientRects().length);
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const title = ov.querySelector('#pp-dialog-title');
  const inPanel = r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  return {
    shown, title: title ? title.textContent : '', message: message ? message.textContent : '', buttons: buttons.map(b => b.textContent.trim()),
    box: rect(box), boxInPanel: inPanel(rect(box)), titleInPanel: !!title && inPanel(rect(title)), buttonsInPanel: buttons.every(b => inPanel(rect(b))),
    scrolls: !!scroller, scrollTop: scroller ? scroller.scrollTop : 0, scrollMax: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
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
  margins: PageLayout.getMarginsMm ? PageLayout.getMarginsMm() : null,
  watermark: PageLayout.getWatermark(),
  headerFooter: Editor.getHeaderFooterData ? Editor.getHeaderFooterData() : null,
  modelId: Templates.getCurrentId(),
  select: document.getElementById('template-select').value,
  text: document.querySelector('#editor-container .tiptap').textContent,
  headings: document.querySelectorAll('#editor-container .tiptap h1').length,
  items: document.querySelectorAll('#editor-container .tiptap li').length,
  tables: document.querySelectorAll('#editor-container .tiptap table').length,
  images: document.querySelectorAll('#editor-container .tiptap img.editor-image').length,
  notes: document.querySelectorAll('#editor-container .tiptap .footnote-ref-marker').length,
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
  console.log(`\n=== Import d'un Word à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { page, requests, natives } = await t.openPage({ hosted: true, stub: { extensions: ['graphique'] }, seed: SEED, lang, colorScheme: scheme });
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${scheme}-${name}.png`) }); };
  const tmp = await mkdtemp(join(tmpdir(), 'pp-docx-import-'));
  try {
    await page.addScriptTag({ url: '/dev-tests/scenarios-docx-import.js' });
    const engineRequests = () => requests.filter(url => /js\/docx-import\.js/.test(url)).length;

    // 1) Le menu « + » : la ligne est entre « Importer un Markdown… » et « Importer un PowerPoint… », dans le panneau, rien ne la recouvre, texte lisible, sur son fond de survol aussi, active sans extension.
    await hoverRow(page, PLUS, ROW);
    const [row] = await rowsState(page, [ROW]);
    check(tag + `le menu « + » montre « ${T.row} » entre « Importer un Markdown… » et « Importer un PowerPoint… », entière dans le panneau, atteignable, active sans aucune extension, sans texte coupé`,
      !row.missing && row.text === T.row && row.previous === 'v2-btn-import-html' && row.next === 'v2-btn-import-pptx' && row.inside && row.reachable && !row.cut && row.live, row);
    check(tag + 'le texte de la ligne tient les contrastes de la charte (>= 4,5:1), au repos et sous la souris', row.contrast >= 4.5, row.contrast);
    const hovered = await hoveredState(page, ROW);
    check(tag + 'sous la souris, la ligne se peint de son fond de survol et reste lisible (>= 4,5:1)', hovered.hovered && hovered.painted && hovered.contrast >= 4.5, hovered);
    await snap('menu');
    await parkMouse(page);

    // 2) Le vrai sélecteur : un seul fichier, réduit aux documents Word ; annuler ne change rien ; le moteur n'a pas encore été demandé au réseau.
    const before = await statusOf(page);
    const { chooser } = await pickFile(page, null);
    check(tag + 'un vrai clic sur la ligne ouvre le vrai sélecteur de fichier', !!chooser);
    if (!chooser) return;
    const accept = await chooser.element().getAttribute('accept');
    check(tag + 'le sélecteur est réduit aux documents Word (.docx, .docm, .dotx, .dotm), pour un seul fichier, ni classeur, ni présentation, ni Markdown',
      !chooser.isMultiple() && /\.docx\b/.test(accept) && /\.dotx\b/.test(accept) && !/xlsx|pptx|\.md\b/.test(accept), { accept, multiple: chooser.isMultiple() });
    await chooser.element().evaluate(el => el.dispatchEvent(new Event('cancel')));
    await sleep(500);
    const afterCancel = await statusOf(page);
    const leftovers = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    check(tag + 'annuler dans le sélecteur ne change rien : même message d\'état, aucune fenêtre, aucun champ de fichier oublié, le moteur d\'import pas encore demandé au réseau',
      afterCancel.text === before.text && !(await dialogState(page)).shown && leftovers === 0 && engineRequests() === 0, { before: before.text, afterCancel: afterCancel.text, leftovers, engine: engineRequests() });

    // 3) Un Word que l'éditeur reprend en entier : rien n'était à enregistrer, donc aucune question ; rien à dire, donc aucune fenêtre.
    const first = await pickFile(page, wordFile('bilan.docx', await buildFile(page, 'plain')));
    check(tag + 'le sélecteur s\'ouvre de nouveau', !!first.chooser);
    await settle(page, T.importedPattern);
    await sleep(500);
    const done = await statusOf(page);
    check(tag + `le coin d'état dit « ${T.imported} », en entier, sans être coupé, dans le panneau`, done.text === T.imported && !done.error && !done.clipped && done.inPanel, done);
    check(tag + 'rien n\'était à enregistrer et rien n\'est à dire : aucune fenêtre ne s\'est ouverte, avant ni après', !first.askedBefore.shown && !(await dialogState(page)).shown);
    check(tag + 'le moteur d\'import est demandé au réseau une seule fois, à ce premier import', engineRequests() === 1, engineRequests());
    const plain = await snapshot(page);
    check(tag + 'le document est NOUVEAU, sans nom : aucun modèle choisi, la page A4 du fichier (595 x 842 pt)', !plain.modelId && plain.select === '' && Math.abs(plain.page.width - 595) < 2 && Math.abs(plain.page.height - 842) < 2, { id: plain.modelId, select: plain.select, page: plain.page });
    check(tag + 'le titre, le texte, les deux points de la liste, le tableau (une case sur deux colonnes), l\'image et la note de bas de page sont dans le document',
      plain.headings === 1 && /Bilan de l’année/.test(plain.text) && /Le chiffre d’affaires progresse de 12 %\./.test(plain.text) && plain.items === 2 && /Deuxième point/.test(plain.text)
      && plain.tables === 1 && plain.merged === 1 && /Janvier/.test(plain.text) && plain.images === 1 && plain.notes === 1, { headings: plain.headings, items: plain.items, tables: plain.tables, merged: plain.merged, images: plain.images, notes: plain.notes, text: plain.text.slice(0, 120) });
    check(tag + 'la mise en forme du texte est reprise : « progresse » en gras', plain.strong.includes('progresse'), plain.strong);
    check(tag + 'l\'en-tête, le pied de page et le filigrane du fichier sont ceux de la page : « Rapport trimestriel », « Page » et le numéro de page, « CONFIDENTIEL » en diagonale',
      !!plain.headerFooter && /Rapport trimestriel/.test(plain.headerFooter.header.default) && /Page/.test(plain.headerFooter.footer.default) && /page-number-badge/.test(plain.headerFooter.footer.default)
      && !!plain.watermark && plain.watermark.text === 'CONFIDENTIEL' && plain.watermark.angle === 'diagonal', { headerFooter: plain.headerFooter, watermark: plain.watermark });
    const visible = await page.evaluate(() => {
      const c = document.getElementById('editor-container').getBoundingClientRect();
      const h1 = document.querySelector('#editor-container .tiptap h1');
      const r = h1.getBoundingClientRect();
      return { shown: r.width > 0 && r.bottom > c.top && r.top < c.bottom, font: getComputedStyle(h1).fontSize };
    });
    check(tag + 'le titre est visible dans l\'éditeur', visible.shown, visible);
    await snap('plain');
    await parkMouse(page);

    // 4) Le document est maintenant « à enregistrer » : la question vient APRÈS le choix du fichier et sa lecture ; Annuler garde le document ; « Ne pas enregistrer » importe ;
    //    ce fichier a de quoi remplir la fenêtre du rapport, qui vient après la question.
    const report = wordFile('resultats.docx', await buildFile(page, 'report'));
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
    check(tag + `« ${T.discard} » : le Word du fichier remplace le premier document (« Résultats », plus de tableau) et le coin d'état le dit`, /Résultats/.test(replaced.text) && replaced.tables === 0 && (await statusOf(page)).text === T.imported, { tables: replaced.tables, text: replaced.text.slice(0, 80) });
    const lines = told.message.split('\n');
    check(tag + `la fenêtre du rapport s'ouvre APRÈS la question, titrée « ${T.reportTitle} », avec sa phrase d'introduction`, told.shown && told.title === T.reportTitle && lines[0] === T.reportIntro, { title: told.title, intro: lines[0] });
    check(tag + 'elle dit chaque genre non repris, un par ligne, dans l\'ordre (police, retrait, forme, graphique, commentaire, modifications suivies), au singulier ou au pluriel',
      JSON.stringify(lines.slice(1)) === JSON.stringify(T.report.map(line => '• ' + line)), lines.slice(1));
    check(tag + 'elle n\'a qu\'un bouton, « ' + T.close + ' », entière dans le panneau, avec le focus dessus', told.buttons.length === 1 && told.buttons[0] === T.close && told.boxInPanel && told.buttonsInPanel && told.focusOn === T.close, told);
    const titleContrast = await contrastOf(page, '#pp-dialog-modal #pp-dialog-title');
    const messageContrast = await contrastOf(page, '#pp-dialog-modal .pp-dialog-message');
    check(tag + 'le titre et le texte de la fenêtre du rapport tiennent les contrastes de la charte (>= 4,5:1)', titleContrast >= 4.5 && messageContrast >= 4.5, { titleContrast, messageContrast });
    await snap('report');
    const closed = await clickDialogButton(page, T.close);
    check(tag + `« ${T.close} » est atteignable à la souris dans le panneau`, !!closed && closed.reachable && closed.inPanel, closed);
    const afterClose = await page.evaluate(() => ({ editorFocused: !!document.activeElement && !!document.activeElement.closest('.tiptap'), open: getComputedStyle(document.getElementById('pp-dialog-modal')).display !== 'none' }));
    check(tag + 'la fenêtre se ferme et rend la main à l\'éditeur (le curseur est dans le texte)', !afterClose.open && afterClose.editorFocused, afterClose);
    const tracked = await page.evaluate(() => ({ adds: Array.from(document.querySelectorAll('#editor-container .tiptap ins')).map(e => e.textContent), dels: Array.from(document.querySelectorAll('#editor-container .tiptap del')).map(e => e.textContent) }));
    check(tag + 'les modifications suivies du fichier restent à valider : l\'ajout est dans une insertion, la suppression dans une suppression, rien n\'est accepté en silence', tracked.adds.join('').includes('inséré') && tracked.dels.join('').includes('Retiré'), tracked);

    // 4 bis) Un Word relu par deux personnes : les modifications suivies et le commentaire sont dans le document, le fil s'ouvre au VRAI clic sur sa marque avec ses deux messages ; rien à dire : aucune fenêtre.
    await pickFile(page, wordFile('relu.docx', await buildFile(page, 'reviewed')));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await settle(page, T.importedPattern);
    await sleep(500);
    const reviewed = await page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { shown: r.width > 0 && r.height > 0, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const mark = document.querySelector('#editor-container .tiptap .comment-mark');
      const ins = document.querySelector('#editor-container .tiptap ins');
      const del = document.querySelector('#editor-container .tiptap del');
      if (mark) mark.scrollIntoView({ block: 'center' });
      return { mark: mark ? { text: mark.textContent, resolved: mark.getAttribute('data-resolved'), box: box(mark) } : null, ins: ins ? { text: ins.textContent, box: box(ins) } : null, del: del ? { text: del.textContent, box: box(del) } : null };
    });
    check(tag + 'le Word relu : l\'ajout « révisé », la suppression « ancien » et le passage commenté sont dans le document, visibles', !!reviewed.ins && reviewed.ins.text.includes('révisé') && reviewed.ins.box.shown && !!reviewed.del && reviewed.del.text.includes('ancien') && reviewed.del.box.shown
      && !!reviewed.mark && reviewed.mark.text === 'prend effet le 1er janvier' && reviewed.mark.box.shown && reviewed.mark.resolved === 'false', reviewed);
    check(tag + 'rien à dire pour ce fichier : aucune fenêtre de rapport', !(await dialogState(page)).shown);
    const markBox = await page.evaluate(() => { const m = document.querySelector('#editor-container .tiptap .comment-mark'); const r = m.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }; });
    await page.mouse.move(markBox.x - 6, markBox.y, { steps: 2 });
    await page.mouse.click(markBox.x, markBox.y);
    await sleep(500);
    const thread = await page.evaluate(() => {
      const popup = document.getElementById('v2-comment-popup');
      if (!popup || popup.style.display === 'none') return null;
      const r = popup.getBoundingClientRect();
      return { texts: Array.from(popup.querySelectorAll('.v2-comment-popup-message')).map(m => m.textContent), inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
    });
    check(tag + 'un vrai clic sur le passage commenté ouvre le fil, entier dans le panneau, avec les deux messages (Marie Dupont, puis la réponse de Paul Martin)', !!thread && thread.inPanel && thread.texts.length === 2 && /Vérifier la date/.test(thread.texts[0]) && /Marie Dupont/.test(thread.texts[0]) && /C’est confirmé/.test(thread.texts[1]) && /Paul Martin/.test(thread.texts[1]), thread);
    await snap('reviewed');
    const closeBox = await page.evaluate(() => { const b = document.querySelector('#v2-comment-popup .v2-comment-popup-close'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(closeBox.x, closeBox.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await sleep(300);
    check(tag + 'la croix du fil le referme à la vraie souris', await page.evaluate(() => { const p = document.getElementById('v2-comment-popup'); return !p || p.style.display === 'none' || p.getBoundingClientRect().width === 0; }));
    await parkMouse(page);

    // 5) Un fichier qui a presque tous les genres : la fenêtre du rapport le plus long tient dans le panneau, titre et bouton fixes, le texte défile jusqu'à sa dernière ligne, dans la langue de l'interface.
    const manyFile = await buildFile(page, 'many');
    const { wanted, keys } = await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const imported = await DocxImport.fromBuffer(bin.buffer);
      return { keys: DocxImport.REPORT_KEYS.length, wanted: imported.report.map(item => '• ' + I18n.t('docx.import.report.' + item.key, { n: item.n })) };
    }, manyFile.toString('base64'));
    await pickFile(page, wordFile('tout.docx', manyFile));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await sleep(900);
    const long = await dialogState(page);
    const longLines = long.message.split('\n');
    check(tag + `le rapport le plus long : ${wanted.length} genres (sur ${keys}), un par ligne, dans l'ordre et dans la langue de l'interface, de « ${T.longFirst} » au dernier, aucune clé laissée telle quelle`,
      long.shown && long.title === T.reportTitle && longLines[0] === T.reportIntro && wanted.length >= 20 && JSON.stringify(longLines.slice(1)) === JSON.stringify(wanted) && longLines[1] === '• ' + T.longFirst && !long.message.includes('docx.import.report.'),
      { title: long.title, count: longLines.length - 1, wanted: wanted.length, first: longLines[1], last: longLines[longLines.length - 1] });
    check(tag + 'des lignes à lire telles quelles, au singulier et au pluriel : ' + T.samples.map(line => '« ' + line + ' »').join(', '), T.samples.every(line => longLines.includes('• ' + line)), longLines.filter(line => /police|font|modification|tracked|fin|endnote/.test(line)));
    check(tag + 'la fenêtre tient dans le panneau : titre et bouton « ' + T.close + ' » à l\'écran sans défiler la page, le texte défile dans la fenêtre', long.boxInPanel && long.titleInPanel && long.buttonsInPanel && long.scrolls && long.scrollMax > 0,
      { box: long.box, scrolls: long.scrolls, scrollMax: long.scrollMax });
    await snap('report-long');
    await page.mouse.move(WIDTH / 2, HEIGHT / 2);
    await page.mouse.wheel(0, 9000);
    await sleep(400);
    const end = await dialogState(page);
    const lastVisible = await page.evaluate((line) => {
      const message = document.querySelector('#pp-dialog-modal .pp-dialog-message');
      const range = document.createRange();
      const node = message.firstChild;
      const at = node.textContent.lastIndexOf(line);
      range.setStart(node, at);
      range.setEnd(node, at + line.length);
      const r = range.getBoundingClientRect();
      const box = document.querySelector('#pp-dialog-modal .pp-dialog-box').getBoundingClientRect();
      return { inside: r.top >= box.top && r.bottom <= box.bottom + 1 };
    }, wanted[wanted.length - 1].slice(2));
    check(tag + 'à la molette, le texte défile jusqu\'à sa dernière ligne, vue en entier dans la fenêtre, titre et bouton toujours là', end.scrollTop > 0 && lastVisible.inside && end.titleInPanel && end.buttonsInPanel, { scrollTop: end.scrollTop, lastVisible });
    await snap('report-long-end');
    await clickDialogButton(page, T.close);
    check(tag + 'la fenêtre du rapport le plus long se ferme au vrai clic', !(await dialogState(page)).shown);

    // 6) Les fichiers refusés : un message clair en rouge, aucune fenêtre (même avec un document à enregistrer), le document ne bouge pas.
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
    refusal('un fichier qui n\'est pas un zip', await refused(wordFile('courrier.docx', Buffer.from('Ceci est un courrier, pas un document Word.', 'utf8')), T.unreadablePattern), T.unreadable);
    refusal('un zip qui n\'est pas un Word (une présentation)', await refused(wordFile('presentation.docx', await buildFile(page, 'notWord')), T.unreadablePattern), T.unreadable);
    refusal('un ancien .doc (avant 2007)', await refused({ name: 'ancien.doc', mimeType: 'application/msword', buffer: Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, 0, 0, 0, 0, 0, 0]) }, T.legacyPattern), T.legacy);
    refusal('un Word sans rien dedans', await refused(wordFile('vide.docx', await buildFile(page, 'empty')), T.emptyPattern), T.empty);
    const huge = await mibFile(tmp, 'gros.docx', MAX_MIB * 1024 * 1024 + 1);
    refusal(`un fichier de plus de ${MAX_MIB} Mo (jamais lu : sa taille suffit)`, await refused(huge, T.tooBigPattern), T.tooBig);
    await snap('refused');
    check(tag + 'aucun de ces refus n\'a demandé le moindre rechargement du moteur ni laissé un champ de fichier dans la page', engineRequests() === 1 && (await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)) === 0, { engine: engineRequests() });
    // 7) Grist refuse d'écrire dans la table des commentaires au premier enregistrement d'un Word importé : une fenêtre le dit (entière dans le panneau), le fil s'ouvre encore au vrai clic sur sa marque,
    // et l'enregistrement suivant, l'écriture permise, écrit les messages.
    await pickFile(page, wordFile('relu-refus.docx', await buildFile(page, 'reviewed')));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await settle(page, T.importedPattern);
    await sleep(500);
    const realSave = async () => {
      const box = await page.evaluate(() => { const b = document.getElementById('btn-save'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(box.x - 6, box.y, { steps: 2 });
      await page.mouse.click(box.x, box.y);
      await sleep(1500);
      await parkMouse(page);
    };
    const threadRows = () => page.evaluate(() => { const rows = window.__gristStub.state.rows.Publipostage_Commentaires; return rows ? rows.id.length : 0; });
    await page.evaluate(() => {
      const rows = window.__gristStub.state.rows.Publipostage_Commentaires;
      if (rows) Object.keys(rows).forEach(column => { rows[column] = []; });
      window.__gristStub.denyTable('Publipostage_Commentaires', true);
      document.getElementById('template-name').value = 'Word relu';
    });
    await realSave();
    const adopt = await dialogState(page);
    check(tag + `Grist refuse les fils : une fenêtre « ${T.adoptTitle} » le dit, avec la raison, entière dans le panneau, et « ${T.close} » en bas`, adopt.shown && adopt.title === T.adoptTitle && T.adoptReason.test(adopt.message) && adopt.boxInPanel && adopt.titleInPanel && adopt.buttonsInPanel && adopt.buttons.includes(T.close), { title: adopt.title, buttons: adopt.buttons, box: adopt.box });
    check(tag + 'le modèle est enregistré malgré tout, aucun message n\'est écrit dans la table des fils', (await page.evaluate(() => Templates.getCurrentId())) != null && (await threadRows()) === 0);
    await snap('adopt-refused');
    await clickDialogButton(page, T.close);
    check(tag + 'la fenêtre se ferme au vrai clic', !(await dialogState(page)).shown);
    const keptBox = await page.evaluate(() => { const m = document.querySelector('#editor-container .tiptap .comment-mark'); m.scrollIntoView({ block: 'center' }); const r = m.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }; });
    await page.mouse.move(keptBox.x - 6, keptBox.y, { steps: 2 });
    await page.mouse.click(keptBox.x, keptBox.y);
    await sleep(500);
    const stillThere = await page.evaluate(() => { const popup = document.getElementById('v2-comment-popup'); return popup && popup.style.display !== 'none' ? popup.querySelectorAll('.v2-comment-popup-message').length : 0; });
    check(tag + 'un vrai clic sur le passage commenté ouvre encore le fil, avec ses deux messages : rien n\'est perdu', stillThere === 2, stillThere);
    const keptClose = await page.evaluate(() => { const b = document.querySelector('#v2-comment-popup .v2-comment-popup-close'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(keptClose.x, keptClose.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await sleep(300);
    await page.evaluate(() => window.__gristStub.denyTable('Publipostage_Commentaires', false));
    await realSave();
    check(tag + 'l\'enregistrement suivant, l\'écriture permise, écrit les deux messages du fil, sans fenêtre', (await threadRows()) === 2 && !(await dialogState(page)).shown, { rows: await threadRows() });
    check(tag + 'aucune boîte native (alert, confirm, prompt) ne s\'est ouverte pendant tout le parcours', natives.length === 0, natives);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
