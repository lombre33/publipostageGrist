#!/usr/bin/env node
// L'IMPORT d'un fichier PowerPoint (js/pptx-import.js, ligne « Importer un PowerPoint… » du menu « + » ; 6e fonction de la parité PowerPoint, après le fond, les formes, les traits, les notes, la rotation et
// l'export) à la VRAIE souris et avec un VRAI sélecteur de fichier (page.waitForEvent('filechooser') : Chromium n'ouvre le sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist
// (~700x400), hébergé par GFS (simulé par dev-tests/gfs-stub.js) avec l'extension « diapositives » active : français clair, puis anglais sombre.
// dev-tests/scenarios-pptx-import.js (groupe « pptxImport ») vérifie, DANS la page, ce que l'import écrit ; une page.evaluate ne déclenche ni le survol d'un menu, ni un geste « trusted », ni un vrai
// sélecteur de fichier : c'est ici qu'on s'assure que
//  - le menu « + » montre « Importer un PowerPoint… » (« Import from PowerPoint… ») juste après « Importer un Word… » (qui suit « Importer un Markdown… »), entière dans le panneau, que rien ne recouvre, lisible (F5), au repos et sous la souris ;
//  - un vrai clic ouvre le vrai sélecteur, réduit aux présentations (.pptx, .ppsx, .potx), pour un seul fichier ; annuler ne change rien ; le moteur (js/pptx-import.js) n'est demandé au réseau qu'au premier
//    import, une seule fois ;
//  - le fichier choisi devient une NOUVELLE présentation, sans nom : une miniature par diapositive, la page du fichier (960 x 540 points), le texte, la forme, l'image, le trait et le tableau à leur place et
//    visibles, un cadre qui se sélectionne au vrai clic, aucun point rouge sur les miniatures ; rien à dire : aucune fenêtre, et le coin d'état dit combien de diapositives sont arrivées, en entier ;
//  - un fichier qui avait ce que l'éditeur ne reprend pas tel quel (animations, graphique, dégradé, deux polices absentes, une liste de tirets trop longue pour être lue) : la fenêtre « Ce que l'import n'a pas
//    repris tel quel » dit chaque genre, dans l'ordre, au singulier ou au pluriel ; un fichier qui en a de tous les genres (seize) puis un qui demande aussi tout ce que l'éditeur ne sait pas encore faire
//    (cinquante et une lignes : cinquante-cinq au chantier 1 « le compte rendu dit tout », moins l'interligne, les espaces et les retraits que le chantier 2 reprend, et la transparence que le chantier 3 reprend) : la fenêtre tient dans le panneau, titre et bouton fixes, le texte défile jusqu'à la dernière ligne, aucune clé laissée telle quelle ; son
//    bouton se clique et rend la main à l'éditeur ; un fichier en 4:3 ouvre une présentation en 4:3 (720 x 540 points), pas à la page d'une nouvelle présentation ;
//  - un document modifié et pas enregistré : « Modifications non enregistrées » vient APRÈS le choix du fichier et sa lecture ; « Annuler » garde le document, « Ne pas enregistrer » importe, et la fenêtre
//    du rapport vient après la question ;
//  - un fichier refusé (pas une présentation, un ancien .ppt, un zip qui n'en est pas une, aucune diapositive, plus de 150 Mo) : un message clair en rouge, aucune fenêtre, rien ne change ;
//  - sans l'extension « diapositives » (le widget seul, ou GFS qui ne l'active pas), la ligne est grisée, ne s'ouvre pas, et son clic explique ce qu'il faut (aucun sélecteur de fichier).
// Lancé par run-headless.mjs (groupe Node « pptxImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pptx-import-mouse.mjs
// PPTX_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir, mkdtemp, open as openFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';
import { hoverRow, clickHoverRow } from './load-lib.mjs';

const SHOTS = process.env.PPTX_IMPORT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-pptx-import-mouse', port: Number(process.env.PPTX_IMPORT_MOUSE_PORT || 9096) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SEED = seedModels();
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-pptx';
const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_MIB = 150;

const TEXTS = {
  fr: {
    row: 'Importer un PowerPoint…', unsaved: 'Modifications non enregistrées', discard: 'Ne pas enregistrer', cancel: 'Annuler', close: 'Fermer',
    imported: n => `PowerPoint importé : ${n} ${n === 1 ? 'diapositive' : 'diapositives'}. Nommez le modèle puis enregistrez-le.`, importedPattern: /PowerPoint importé/,
    reading: /^Lecture du fichier PowerPoint/,
    unreadable: 'Ce fichier n’est pas une présentation PowerPoint (.pptx) lisible.', unreadablePattern: /n’est pas une présentation/,
    legacy: 'Format .ppt d’avant 2007 ou fichier protégé : enregistrez-le en .pptx sans mot de passe.', legacyPattern: /d’avant 2007/,
    empty: 'Cette présentation n’a aucune diapositive à importer.', emptyPattern: /aucune diapositive/,
    tooBig: 'Ce fichier est trop gros pour être importé : 150,1 Mo (au plus 150 Mo).', tooBigPattern: /trop gros/,
    reportTitle: 'Ce que l’import n’a pas repris tel quel', reportIntro: 'La présentation est importée. Le fichier avait ceci, que l’éditeur n’a pas pu reprendre tel quel :',
    report: ['2 animations d’objets non reprises', '1 graphique non repris', '1 dégradé remplacé par sa couleur moyenne',
      '2 polices absentes de l’éditeur, remplacées par la plus proche de chacune', '1 objet dont la liste de tirets est trop longue ou illisible (son trait est dessiné plein)'],
    manyFirst: '3 animations d’objets non reprises', manyLast: '1 objet illisible non repris', lostLast: '3 objets illisibles non repris',
    lostSamples: ['2 polices absentes de l’éditeur, remplacées par la plus proche de chacune', '1 section de diapositives non reprise (aucune de ses diapositives n’est importée)', '2 textes verticaux écrits à l’horizontale'],
    copy: 'Copier le détail', copied: 'Détail copié', copyTitle: 'Compte rendu d’import PowerPoint (Publipostage+)',
    animLines: ['Diapositive : 1 (×2)'], fontLines: ['Diapositive : 1 (×2)', 'Objets : Zone de texte; Dégradé', 'Détail : Comic Sans MS; Verdana'], lastLines: ['Diapositive : 1', 'Objet : Objet inconnu', 'Détail : objet graphique inconnu (inconnu)'],
    offTitle: 'Cette fonction demande Grist Factory Suite', offMessage: /Diapositives/,
  },
  en: {
    row: 'Import from PowerPoint…', unsaved: 'Unsaved changes', discard: 'Don’t save', cancel: 'Cancel', close: 'Close',
    imported: n => `PowerPoint imported: ${n} ${n === 1 ? 'slide' : 'slides'}. Name the template, then save it.`, importedPattern: /PowerPoint imported/,
    reading: /^Reading the PowerPoint file/,
    unreadable: 'This file is not a readable PowerPoint (.pptx) presentation.', unreadablePattern: /not a readable PowerPoint/,
    legacy: 'Pre-2007 .ppt format or password-protected file: save it as .pptx without a password.', legacyPattern: /Pre-2007/,
    empty: 'This presentation has no slides to import.', emptyPattern: /no slides/,
    tooBig: 'This file is too big to import: 150.1 MB (at most 150 MB).', tooBigPattern: /too big/,
    reportTitle: 'What the import did not carry over as is', reportIntro: 'The presentation is imported. The file had the following, which the editor could not carry over as is:',
    report: ['2 object animations not imported', '1 chart not imported', '1 gradient replaced by its average color',
      '2 fonts missing from the editor, replaced by the nearest available', '1 object with a dash list too long or unreadable (its line drawn solid)'],
    manyFirst: '3 object animations not imported', manyLast: '1 unreadable object not imported', lostLast: '3 unreadable objects not imported',
    lostSamples: ['2 fonts missing from the editor, replaced by the nearest available', '1 slide section not imported (none of its slides is imported)', '2 vertical texts written horizontally'],
    copy: 'Copy the detail', copied: 'Detail copied', copyTitle: 'PowerPoint import report (Publipostage+)',
    animLines: ['Slide: 1 (×2)'], fontLines: ['Slide: 1 (×2)', 'Objects: Zone de texte; Dégradé', 'Detail: Comic Sans MS; Verdana'], lastLines: ['Slide: 1', 'Object: Objet inconnu', 'Detail: unknown graphic object (inconnu)'],
    offTitle: 'This feature needs Grist Factory Suite', offMessage: /Slides/,
  },
};

// ---- Les fichiers de l'essai : fabriqués dans la page avec les briques de dev-tests/scenarios-pptx-import.js (aucun fichier binaire dans le dépôt) --------------------------------------------------
// `plain` : trois diapositives que l'éditeur reprend en entier (un titre et un texte, une carte, un tableau avec des notes, une image et un trait fléché avec une transition) ; `report` : deux diapositives
// dont la première a deux animations, un graphique, un connecteur courbe (repris tel quel depuis le lot 4c) et un dégradé ; `many` : un objet de chaque genre que l'import ne reprend pas tel quel ; `notPresentation` : un zip qui n'est pas
// une présentation ; `empty` : une présentation sans diapositive.
const buildDeck = async (page, kind) => Buffer.from(await page.evaluate(async (which) => {
  const F = window.PptxFixtures;
  const { pptx, sp, textBox, cxn, pic, table, para, run, solid, ln, TWO_TONE, IMAGE_REL, everyKindOfObject, xfrm, CLR_MAP, BG1, ownBg } = F;
  const frame = (uri, inner, name) => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="30" name="${name}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(100, 100, 200, 100, '', 'p:xfrm')}<a:graphic><a:graphicData uri="${uri}">${inner}</a:graphicData></a:graphic></p:graphicFrame>`;
  const cells = texts => texts.map(text => ({ text, attrs: 'sz="1800"' }));
  // Neuf couples : plus que l'éditeur n'en lit (huit au plus), le trait est dessiné plein et le compte rendu le dit.
  const TOO_LONG_DASH = `<a:custDash>${'<a:ds d="100000" sp="100000"/>'.repeat(9)}</a:custDash>`;
  const decks = {
    plain: () => ({
      media: { 'image1.png': TWO_TONE() },
      slides: [
        { shapes: textBox(60, 40, 840, 80, para(run('Bilan de l’année', 'sz="4000" b="1"')), { id: 2 })
          + textBox(60, 150, 520, 220, para(run('Premier point', 'sz="2400"')) + para(run('Deuxième point', 'sz="2400"')), { id: 3 })
          + sp({ id: 4, name: 'Carte', x: 620, y: 150, w: 280, h: 160, fill: solid('D9E2F3'), line: ln(2, solid('2F5597')), text: para(run('Carte', 'sz="2400"'), 'algn="ctr"') }) },
        { notes: ['Penser à citer le chiffre d’affaires.'],
          shapes: textBox(60, 40, 840, 80, para(run('Les chiffres', 'sz="4000" b="1"')), { id: 2 })
          + table({ id: 5, x: 60, y: 150, cols: [240, 240, 240], rows: [{ h: 40, cells: cells(['Mois', 'Ventes', 'Retours']) }, { h: 40, cells: cells(['Janvier', '120', '4']) }, { h: 40, cells: cells(['Février', '98', '2']) }] }) },
        { rels: [IMAGE_REL('rId2', 'image1.png')], transition: '<p:transition spd="med"><p:fade/></p:transition>',
          shapes: pic({ id: 6, x: 60, y: 150, w: 240, h: 120 })
          + cxn({ id: 7, x: 360, y: 210, w: 300, h: 0, line: ln(3, solid('C00000'), '<a:tailEnd type="triangle"/>') }) },
      ],
    }),
    report: () => ({
      slides: [
        { timing: '<p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="clickEffect"/></p:par><p:par><p:cTn id="2" nodeType="withEffect"/></p:par><p:par><p:cTn id="3" nodeType="mainSeq"/></p:par></p:tnLst></p:timing>',
          shapes: textBox(60, 40, 840, 80, para(run('Résultats', 'sz="4000"', '<a:latin typeface="Comic Sans MS"/>')), { id: 2 })
          + frame('http://schemas.openxmlformats.org/drawingml/2006/chart', '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId9"/>', 'Graphique')
          + cxn({ id: 34, x: 100, y: 450, w: 100, h: 40, prst: 'curvedConnector3' })
          + sp({ id: 41, name: 'Dégradé', x: 400, y: 300, w: 160, h: 80, fill: '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst></a:gradFill>',
            line: ln(2, solid('C00000'), TOO_LONG_DASH), text: para(run('Dégradé', '', '<a:latin typeface="Verdana"/>')) }) },
        { shapes: textBox(60, 40, 840, 80, para(run('Suite', 'sz="4000"')), { id: 2 }) },
      ],
    }),
    many: () => everyKindOfObject(),
    // Tout à la fois : un objet de chaque genre qui n'arrive pas (many), puis tout ce que le fichier demande et que l'éditeur ne sait pas encore faire (une diapositive par cas).
    lost: () => {
      const objects = everyKindOfObject();
      const losses = F.everyKindOfLoss().options;
      return Object.assign({}, objects, losses, { slides: objects.slides.concat(losses.slides), media: Object.assign({}, objects.media, losses.media) });
    },
    fourThree: () => ({ size: [720, 540], slides: [{ shapes: textBox(72, 54, 576, 60, para(run('Quatre tiers', 'sz="3200"')), { id: 2 }) }] }),
    // Un fichier au thème sombre (le fond 1 est le noir, le texte 1 le blanc) : sa première diapositive montre le fond du thème, la seconde garde son blanc.
    dark: () => ({
      colors: { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6' }, master: { clrMap: CLR_MAP.replace('bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"', 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"'), bg: BG1 },
      slides: [{ shapes: textBox(60, 40, 840, 80, para(run('Nuit', 'sz="4000"', solid('FFFFFF'))), { id: 2 }) }, { bg: ownBg('FFFFFF'), shapes: textBox(60, 40, 840, 80, para(run('Jour', 'sz="4000"', solid('1B2430'))), { id: 2 }) }],
    }),
    empty: () => ({ slides: [] }),
  };
  let buffer;
  if (which === 'notPresentation') {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Un courrier</w:t></w:r></w:p></w:body></w:document>');
    buffer = await zip.generateAsync({ type: 'arraybuffer' });
  } else buffer = await pptx(decks[which]());
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}, kind), 'base64');
const pptxFile = (name, buffer) => ({ name, mimeType: MIME, buffer });

// ---- Ce que la page montre -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Pour chaque sélecteur : texte, place dans le panneau, ce qui le recouvre, texte coupé, contraste de son texte sur son fond opaque, ligne active ou grisée.
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
      sel, text: el.textContent.trim(), shown, top: r.top, bottom: r.bottom, inside: shown && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      reachable: !!top && el.contains(top), cut: el.scrollWidth > el.clientWidth + 1, live: !el.classList.contains('v2-hover-row-disabled') && el.getAttribute('aria-disabled') !== 'true', ariaDisabled: el.getAttribute('aria-disabled'),
      previous: (el.previousElementSibling || {}).id || '', title: el.title || '', contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100,
    };
  });
}, selectors);
// La ligne sous la VRAIE souris : survolée, peinte de son fond de survol, lisible sur ce fond.
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
// La fenêtre ouverte (Dialogs : question « Modifications non enregistrées », fenêtre du rapport, explication d'une extension absente) : titre, message, boutons, place, défilement du message.
const dialogState = page => page.evaluate(() => {
  const report = document.getElementById('pp-import-report-modal');
  if (report && getComputedStyle(report).display !== 'none') return { shown: true, title: '(fenêtre du compte rendu)', message: '', buttons: [] };   // les contrôles « aucune fenêtre » voient aussi celle-là
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
    scrolls: !!scroller, scrollTop: scroller ? scroller.scrollTop : 0, scrollMax: scroller ? scroller.scrollHeight - scroller.clientHeight : 0, messageHeight: message ? message.getBoundingClientRect().height : 0,
    focusOn: document.activeElement ? document.activeElement.textContent.trim().slice(0, 30) : '',
  };
});
// La fenêtre du compte rendu (js/import-report.js) : titre, phrase, une ligne par genre (chacune se déplie : son détail), boutons, place, défilement du contenu, ce qui a le focus.
const reportState = page => page.evaluate(() => {
  const ov = document.getElementById('pp-import-report-modal');
  const shown = !!ov && getComputedStyle(ov).display !== 'none';
  if (!shown) return { shown: false, headlines: [], buttons: [], lines: [], open: [] };
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const inPanel = r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  const body = ov.querySelector('.pp-modal-body');
  const title = ov.querySelector('#pp-import-report-title');
  const buttons = Array.from(ov.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && b.getClientRects().length);
  const items = Array.from(ov.querySelectorAll('.pp-import-report-item'));
  const feedback = ov.querySelector('.pp-import-report-feedback');
  return {
    shown, title: title.textContent, intro: ov.querySelector('.pp-import-report-intro').textContent,
    headlines: items.map(li => li.querySelector('.pp-import-report-headline').textContent),
    open: items.map(li => { const d = li.querySelector('details'); return !!d && d.open; }),
    lines: items.map(li => Array.from(li.querySelectorAll('.pp-import-report-line')).map(p => p.textContent)),
    buttons: buttons.map(b => b.textContent.trim()),
    box: rect(ov.querySelector('.pp-modal-box')), boxInPanel: inPanel(rect(ov.querySelector('.pp-modal-box'))), titleInPanel: inPanel(rect(title)), buttonsInPanel: buttons.every(b => inPanel(rect(b))),
    scrolls: body.scrollHeight > body.clientHeight + 1, scrollTop: body.scrollTop, scrollMax: body.scrollHeight - body.clientHeight,
    feedback: feedback ? feedback.textContent : '', focusOn: document.activeElement ? document.activeElement.textContent.trim().slice(0, 30) : '',
  };
});
// Une ligne du compte rendu, dépliée ou repliée au VRAI clic sur son titre (atteignable, dans la fenêtre) ; rend où il a cliqué.
async function clickReportRow(page, index) {
  const target = await page.evaluate((i) => {
    const summary = document.querySelectorAll('#pp-import-report-modal .pp-import-report-item')[i].querySelector('summary');
    if (!summary) return null;
    summary.scrollIntoView({ block: 'nearest' });
    const r = summary.getBoundingClientRect();
    const body = document.querySelector('#pp-import-report-modal .pp-modal-body').getBoundingClientRect();
    const top = document.elementFromPoint(r.left + 12, r.top + r.height / 2);
    return { x: r.left + 12, y: r.top + r.height / 2, reachable: !!top && summary.contains(top), inBody: r.top >= body.top - 1 && r.bottom <= body.bottom + 1 };
  }, index);
  if (!target) return null;
  await page.mouse.move(target.x - 6, target.y, { steps: 2 });
  await page.mouse.click(target.x, target.y);
  await sleep(250);
  return target;
}
// Les lignes de détail d'une ligne du compte rendu : toutes à l'écran, dans la fenêtre, sans que rien les recouvre.
const linesInView = (page, index) => page.evaluate((i) => {
  const body = document.querySelector('#pp-import-report-modal .pp-modal-body').getBoundingClientRect();
  const lines = Array.from(document.querySelectorAll('#pp-import-report-modal .pp-import-report-item')[i].querySelectorAll('.pp-import-report-line'));
  return { count: lines.length, inside: lines.every((line) => { const r = line.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 6, r.top + r.height / 2); return r.width > 0 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && !!top && line.contains(top); }) };
}, index);
// Un bouton de la fenêtre ouverte (la question, l'explication d'une extension absente ou le compte rendu) par son texte, au vrai clic (atteignable, dans le panneau).
async function clickDialogButton(page, text) {
  const target = await page.evaluate(label => {
    const ov = ['pp-import-report-modal', 'pp-dialog-modal'].map(id => document.getElementById(id)).find(o => o && getComputedStyle(o).display !== 'none');
    if (!ov) return null;
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
// Ce que le document montre : son HTML (la comparaison « rien n'a changé »), ses miniatures, sa page, ses cadres, son modèle.
const snapshot = page => page.evaluate(() => ({
  html: Editor.getHTML(),
  slides: document.querySelectorAll('.pp-slide-item').length,
  frames: document.querySelectorAll('#editor-container .tiptap .pp-free-frame').length,
  page: PageLayout.getPageSizePt(),
  modelId: Templates.getCurrentId(),
  select: document.getElementById('template-select').value,
  text: document.querySelector('#editor-container .tiptap').textContent,
  tables: document.querySelectorAll('#editor-container .tiptap table').length,
  images: document.querySelectorAll('#editor-container .tiptap img.editor-image').length,
  dots: Array.from(document.querySelectorAll('.pp-slide-item .pp-slide-overflow')).filter(dot => !dot.hidden && dot.getBoundingClientRect().width > 0).length,
  stripShown: !!document.querySelector('.pp-slide-strip') && !document.querySelector('.pp-slide-strip').hidden,
}));

// Le geste complet pour désigner un fichier : « + » au survol, la ligne au vrai clic ; l'écoute du sélecteur est installée AVANT le clic (elle passe par un aller-retour avec le navigateur : sans lui, le
// premier sélecteur d'une page neuve peut passer inaperçu). `file` : { name, mimeType, buffer } ou un chemin, ou null (le sélecteur reste ouvert). Rend { chooser, askedBefore } : le sélecteur (null s'il
// ne s'est pas ouvert) et l'état de la fenêtre à l'instant où il s'ouvre, AVANT que le fichier soit choisi.
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
// Attend la fin d'une étape : le coin d'état dit `pattern`, ou une fenêtre est ouverte.
const settle = async (page, pattern) => {
  await page.waitForFunction(source => {
    const text = document.getElementById('status-msg').textContent;
    const open = ['pp-import-report-modal', 'pp-dialog-modal'].some((id) => { const ov = document.getElementById(id); return !!ov && getComputedStyle(ov).display !== 'none'; });
    return new RegExp(source).test(text) || open;
  }, pattern.source, { timeout: 30000 }).catch(() => {});
  await sleep(600);
};
const waitStrip = (page, n) => page.waitForFunction(count => document.querySelectorAll('.pp-slide-item').length === count, n, { timeout: 15000 }).catch(() => {});
const mibFile = async (dir, name, bytes) => { const path = join(dir, name); const handle = await openFile(path, 'w'); await handle.truncate(bytes); await handle.close(); return path; };

async function run(lang, scheme) {
  const T = TEXTS[lang];
  const label = (lang === 'fr' ? 'français' : 'anglais') + ' ' + (scheme === 'dark' ? 'sombre' : 'clair');
  const tag = `[${lang} ${scheme}] `;
  console.log(`\n=== Import d'un PowerPoint à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { page, requests, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme: scheme });
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${scheme}-${name}.png`) }); };
  const tmp = await mkdtemp(join(tmpdir(), 'pp-pptx-import-'));
  try {
    await page.addScriptTag({ url: '/dev-tests/scenarios-pptx-import.js' });
    const engineRequests = () => requests.filter(url => /js\/pptx-import\.js/.test(url)).length;

    // 1) Le menu « + » : la ligne suit « Importer un Markdown… », dans le panneau, rien ne la recouvre, texte lisible, sur son fond de survol aussi. GFS dit ses extensions un instant après le démarrage :
    //    la barre a mis la ligne à jour (`aria-disabled="false"`) quand elle devient active.
    await page.waitForFunction(sel => { const el = document.querySelector(sel); return !!el && el.getAttribute('aria-disabled') === 'false'; }, ROW, { timeout: 15000 }).catch(() => {});
    await hoverRow(page, PLUS, ROW);
    const [row] = await rowsState(page, [ROW]);
    check(tag + `le menu « + » montre « ${T.row} » juste après « Importer un Word… » (qui suit « Importer un Markdown… »), entière dans le panneau, atteignable, active, sans texte coupé`,
      !row.missing && row.text === T.row && row.previous === 'v2-btn-import-docx' && row.inside && row.reachable && !row.cut && row.live && row.ariaDisabled === 'false', row);
    check(tag + 'le texte de la ligne tient les contrastes de la charte (>= 4,5:1), au repos et sous la souris', row.contrast >= 4.5, row.contrast);
    const hovered = await hoveredState(page, ROW);
    check(tag + 'sous la souris, la ligne se peint de son fond de survol et reste lisible (>= 4,5:1)', hovered.hovered && hovered.painted && hovered.contrast >= 4.5, hovered);
    await snap('menu');
    await parkMouse(page);

    // 2) Le vrai sélecteur : un seul fichier, réduit aux présentations ; annuler ne change rien ; le moteur n'a pas encore été demandé au réseau.
    const before = await statusOf(page);
    const { chooser } = await pickFile(page, null);
    check(tag + 'un vrai clic sur la ligne ouvre le vrai sélecteur de fichier', !!chooser);
    if (!chooser) return;
    const accept = await chooser.element().getAttribute('accept');
    check(tag + 'le sélecteur est réduit aux présentations (.pptx, .ppsx, .potx), pour un seul fichier, ni classeur ni Markdown',
      !chooser.isMultiple() && /\.pptx\b/.test(accept) && /\.ppsx\b/.test(accept) && /\.potx\b/.test(accept) && !/xlsx|\.md\b/.test(accept), { accept, multiple: chooser.isMultiple() });
    await chooser.element().evaluate(el => el.dispatchEvent(new Event('cancel'))); // ce que le navigateur envoie quand la personne ferme le sélecteur
    await sleep(500);
    const afterCancel = await statusOf(page);
    const leftovers = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    check(tag + 'annuler dans le sélecteur ne change rien : même message d\'état, aucune fenêtre, aucun champ de fichier oublié, le moteur d\'import pas encore demandé au réseau',
      afterCancel.text === before.text && !(await dialogState(page)).shown && leftovers === 0 && engineRequests() === 0, { before: before.text, afterCancel: afterCancel.text, leftovers, engine: engineRequests() });

    // 3) Une présentation que l'éditeur reprend en entier : rien n'était à enregistrer, donc aucune question ; rien à dire, donc aucune fenêtre.
    const first = await pickFile(page, pptxFile('bilan.pptx', await buildDeck(page, 'plain')));
    check(tag + 'le sélecteur s\'ouvre de nouveau', !!first.chooser);
    await settle(page, T.importedPattern);
    await waitStrip(page, 3);
    const done = await statusOf(page);
    check(tag + `le coin d'état dit « ${T.imported(3)} », en entier, sans être coupé, dans le panneau`, done.text === T.imported(3) && !done.error && !done.clipped && done.inPanel, done);
    check(tag + 'rien n\'était à enregistrer et rien n\'est à dire : aucune fenêtre ne s\'est ouverte, avant ni après', !first.askedBefore.shown && !(await dialogState(page)).shown);
    check(tag + 'le moteur d\'import est demandé au réseau une seule fois, à ce premier import', engineRequests() === 1, engineRequests());
    const plain = await snapshot(page);
    check(tag + 'le document est une NOUVELLE présentation, sans nom : la bande des diapositives est là avec trois miniatures, la page du fichier (960 x 540 pt), aucun modèle choisi',
      plain.stripShown && plain.slides === 3 && Math.abs(plain.page.width - 960) < 1 && Math.abs(plain.page.height - 540) < 1 && !plain.modelId && plain.select === '', { stripShown: plain.stripShown, slides: plain.slides, page: plain.page, id: plain.modelId, select: plain.select });
    check(tag + 'le texte, la carte, le tableau, l\'image et le trait du fichier sont dans le document : titre, deux points, carte, tableau de 3 x 3, une image, sept cadres au total (trois, un, deux, et le tableau, posé dans son cadre)',
      /Bilan de l’année/.test(plain.text) && /Premier point/.test(plain.text) && /Deuxième point/.test(plain.text) && /Carte/.test(plain.text) && /Les chiffres/.test(plain.text) && /Février/.test(plain.text)
      && plain.tables === 1 && plain.images === 1 && plain.frames === 7, { tables: plain.tables, images: plain.images, frames: plain.frames, text: plain.text.slice(0, 120) });
    check(tag + 'aucune miniature ne porte le point rouge (aucun cadre ne sort de sa diapositive)', plain.dots === 0, plain.dots);
    // Le thème du fichier est celui de la présentation : la ligne « Thème… » du menu Page, au vrai survol, le nomme (le nom du thème du fichier de l'essai : « Essai »).
    await parkMouse(page);
    const pageButton = await page.evaluate(() => { const r = document.getElementById('btn-page-orientation').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(pageButton.x - 14, pageButton.y - 6, { steps: 2 });
    await page.mouse.move(pageButton.x, pageButton.y, { steps: 4 });
    await sleep(450);
    const themeRow = await page.evaluate(() => {
      const row = document.getElementById('v2-btn-slide-theme');
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { shown: r.width > 0 && r.height > 0, disabled: row.getAttribute('aria-disabled'), value: row.querySelector('.v2-page-row-size').textContent };
    });
    check(tag + 'le thème du fichier est celui de la présentation : la ligne « Thème… » du menu Page, ouverte au vrai survol, est active et le nomme « Essai »', !!themeRow && themeRow.shown && themeRow.disabled !== 'true' && themeRow.value === 'Essai', themeRow);
    await parkMouse(page);
    // Les cadres sont de vrais cadres de l'éditeur : « Carte » se sélectionne à l'appui à 1 pixel DANS le bord de son haut, comme n'importe quel cadre.
    const card = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('#editor-container .pp-free-frame-box'));
      const box = boxes.find(b => /^Carte$/.test(b.textContent.trim()));
      if (!box) return null;
      box.scrollIntoView({ block: 'center', inline: 'center' });
      const r = box.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width * 0.25, r.top + 1);
      return { left: r.left, top: r.top, width: r.width, height: r.height, reachable: !!hit && box.parentElement.contains(hit) };
    });
    await sleep(250);
    const cardBox = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('#editor-container .pp-free-frame-box')).find(b => /^Carte$/.test(b.textContent.trim()));
      const r = box.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    check(tag + 'la carte importée est visible, à l\'écran, et atteignable à la souris', !!card && card.reachable && card.width > 20 && card.height > 20, card);
    await page.mouse.move(cardBox.left + cardBox.width * 0.25, cardBox.top + 1, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await sleep(350);
    const selected = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-free-frame.pp-ff-selected')).map(e => e.textContent.trim()));
    check(tag + 'un appui sur le bord de la carte la sélectionne (cadre de l\'éditeur, pas une image morte)', selected.length === 1 && selected[0] === 'Carte', selected);
    // La miniature de la 2e diapositive, au vrai clic, amène le tableau à l'écran.
    await page.evaluate(() => { const item = document.querySelectorAll('.pp-slide-item')[1]; item.scrollIntoView({ block: 'nearest' }); });
    const thumb = await page.evaluate(() => { const r = document.querySelectorAll('.pp-slide-item')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(thumb.x, thumb.y, { steps: 3 });
    await page.mouse.click(thumb.x, thumb.y);
    await sleep(700);
    const tableSeen = await page.evaluate(() => {
      const table = document.querySelector('#editor-container .tiptap table');
      const c = document.getElementById('editor-container').getBoundingClientRect();
      const r = table.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(Math.max(r.left + 20, c.left + 2), c.right - 2), Math.min(Math.max(r.top + 12, c.top + 2), c.bottom - 2));
      return { shown: r.width > 0 && r.bottom > c.top && r.top < c.bottom, reachable: !!hit && table.contains(hit), cells: Array.from(table.querySelectorAll('th, td')).map(cell => cell.textContent.trim()).join('|') };
    });
    check(tag + 'un clic sur la miniature de la diapositive 2 amène son tableau à l\'écran, atteignable, avec ses neuf cases', tableSeen.shown && tableSeen.reachable && tableSeen.cells === 'Mois|Ventes|Retours|Janvier|120|4|Février|98|2', tableSeen);
    await snap('plain');
    await parkMouse(page);

    // 4) Le document est maintenant « à enregistrer » : la question vient APRÈS le choix du fichier et sa lecture ; Annuler garde le document ; « Ne pas enregistrer » importe ;
    //    ce fichier a de quoi remplir la fenêtre du rapport, qui vient après la question.
    const report = pptxFile('resultats.pptx', await buildDeck(page, 'report'));
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
    check(tag + `« ${T.cancel} » : la fenêtre se ferme, le premier document reste tel quel et aucune fenêtre de rapport ne vient`, !(await dialogState(page)).shown && kept.html === plain.html && kept.slides === 3, { slides: kept.slides });
    await pickFile(page, report);
    await settle(page, /^$/);
    const discarded = await clickDialogButton(page, T.discard);
    check(tag + `« ${T.discard} » est atteignable à la souris dans le panneau`, !!discarded && discarded.reachable && discarded.inPanel, discarded);
    await settle(page, T.importedPattern);
    await sleep(400);
    const told = await reportState(page);
    check(tag + `« ${T.discard} » : la présentation du fichier remplace le premier document (deux miniatures) et le coin d'état le dit`, (await snapshot(page)).slides === 2 && (await statusOf(page)).text === T.imported(2), { slides: (await snapshot(page)).slides, status: (await statusOf(page)).text });
    check(tag + `la fenêtre du rapport s'ouvre APRÈS la question, titrée « ${T.reportTitle} », avec sa phrase d'introduction`, told.shown && told.title === T.reportTitle && told.intro === T.reportIntro, { title: told.title, intro: told.intro });
    check(tag + 'elle dit chaque genre non repris, un par ligne, dans l\'ordre (animations, graphique, dégradé), au singulier ou au pluriel, chaque ligne repliée', JSON.stringify(told.headlines) === JSON.stringify(T.report) && told.open.every(open => !open), { headlines: told.headlines, open: told.open });
    check(tag + `elle a deux boutons, « ${T.copy} » et « ${T.close} », entière dans le panneau, avec le focus sur « ${T.close} »`, JSON.stringify(told.buttons) === JSON.stringify([T.copy, T.close]) && told.boxInPanel && told.titleInPanel && told.buttonsInPanel && told.focusOn === T.close, told);
    const titleContrast = await contrastOf(page, '#pp-import-report-modal #pp-import-report-title');
    const headlineContrast = await contrastOf(page, '#pp-import-report-modal .pp-import-report-headline');
    const introContrast = await contrastOf(page, '#pp-import-report-modal .pp-import-report-intro');
    check(tag + 'le titre, la phrase et les lignes de la fenêtre du rapport tiennent les contrastes de la charte (>= 4,5:1)', titleContrast >= 4.5 && headlineContrast >= 4.5 && introContrast >= 4.5, { titleContrast, headlineContrast, introContrast });
    await snap('report');

    // Le détail d'une ligne : un vrai clic sur son titre la déplie (OÙ : la diapositive ; QUOI : les objets, les noms) ; un second la replie.
    const opening = await clickReportRow(page, 0);
    const opened = await reportState(page);
    const openedView = await linesInView(page, 0);
    check(tag + 'un vrai clic sur la première ligne (animations) est atteignable et la déplie : sa diapositive, entière dans la fenêtre, rien ne la recouvre', !!opening && opening.reachable && opening.inBody && opened.open[0] === true && opened.lines[0][0] === T.animLines[0] && openedView.count === opened.lines[0].length && openedView.inside, { opening, open: opened.open, lines: opened.lines[0], view: openedView });
    await clickReportRow(page, 0);
    const folded = await reportState(page);
    check(tag + 'un second clic la replie', folded.open[0] === false && folded.boxInPanel && folded.buttonsInPanel, { open: folded.open });
    const fontsRow = T.report.length - 2;
    await clickReportRow(page, fontsRow);
    const fonts = await reportState(page);
    const fontsView = await linesInView(page, fontsRow);
    check(tag + 'la ligne des polices dit où (diapositive 1), quels objets et quelles polices (Comic Sans MS, Verdana), à l\'écran', fonts.open[fontsRow] === true && JSON.stringify(fonts.lines[fontsRow]) === JSON.stringify(T.fontLines) && fontsView.inside && fonts.boxInPanel && fonts.titleInPanel && fonts.buttonsInPanel, { lines: fonts.lines[fontsRow], view: fontsView });
    const lineContrast = await contrastOf(page, '#pp-import-report-modal .pp-import-report-line');
    check(tag + 'les lignes du détail tiennent les contrastes de la charte (>= 4,5:1)', lineContrast >= 4.5, lineContrast);
    await snap('report-detail');

    // « Copier le détail » : un vrai clic met le texte dans le vrai presse-papiers (fichier, mesures, chaque ligne et son détail en retrait) et le dit ; la fenêtre reste ouverte.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const copying = await clickDialogButton(page, T.copy);
    const pasted = await page.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERREUR ' + e.message);
    const copied = await reportState(page);
    const pastedLines = String(pasted).split('\n');
    check(tag + `« ${T.copy} » est atteignable à la souris dans le panneau, dit « ${T.copied} », et la fenêtre reste ouverte`, !!copying && copying.reachable && copying.inPanel && copied.shown && copied.feedback === T.copied, { copying, feedback: copied.feedback });
    check(tag + 'le presse-papiers a le texte : le titre, le fichier (resultats.pptx), puis chaque ligne en « • » avec son détail en retrait', pastedLines[0] === T.copyTitle && /resultats\.pptx/.test(pastedLines[1]) && T.report.every(line => pastedLines.includes('• ' + line)) && T.fontLines.every(line => pastedLines.includes('    ' + line)) && T.animLines.every(line => pastedLines.includes('    ' + line)), pastedLines.slice(0, 14));
    await snap('report-copied');
    const closed = await clickDialogButton(page, T.close);
    check(tag + `« ${T.close} » est atteignable à la souris dans le panneau`, !!closed && closed.reachable && closed.inPanel, closed);
    const afterClose = await page.evaluate(() => ({ editorFocused: !!document.activeElement && !!document.activeElement.closest('.tiptap'), open: ['pp-import-report-modal', 'pp-dialog-modal'].some((id) => { const ov = document.getElementById(id); return !!ov && getComputedStyle(ov).display !== 'none'; }) }));
    check(tag + 'la fenêtre se ferme et rend la main à l\'éditeur (le curseur est dans le texte)', !afterClose.open && afterClose.editorFocused, afterClose);
    const reported = await snapshot(page);
    check(tag + 'rien d\'autre n\'a bougé : le texte du fichier est là, deux miniatures, des cadres', /Résultats/.test(reported.text) && reported.slides === 2 && reported.frames >= 4, { slides: reported.slides, frames: reported.frames });

    // Une longue fenêtre : à la molette, la liste défile jusqu'à sa dernière ligne, vue en entière dans la fenêtre, titre et boutons toujours là.
    const wheelToTheEnd = async (report, lastHeadline, shot) => {
      if (!report.scrolls) return;
      await page.mouse.move(WIDTH / 2, HEIGHT / 2);
      await page.mouse.wheel(0, 8000);
      await sleep(400);
      const end = await reportState(page);
      const lastVisible = await page.evaluate((line) => {
        const body = document.querySelector('#pp-import-report-modal .pp-modal-body').getBoundingClientRect();
        const items = Array.from(document.querySelectorAll('#pp-import-report-modal .pp-import-report-item'));
        const last = items[items.length - 1].querySelector('.pp-import-report-headline');
        const r = last.getBoundingClientRect();
        return { text: last.textContent, top: r.top, bottom: r.bottom, bodyTop: body.top, bodyBottom: body.bottom, inside: last.textContent === line && r.top >= body.top - 1 && r.bottom <= body.bottom + 1 };
      }, lastHeadline);
      check(tag + 'à la molette, la liste défile jusqu\'à sa dernière ligne, vue en entier dans la fenêtre, titre et boutons toujours là', end.scrollTop > 0 && lastVisible.inside && end.titleInPanel && end.buttonsInPanel, { end: { scrollTop: end.scrollTop, scrollMax: end.scrollMax }, lastVisible });
      await snap(shot);
    };

    // 5) Un fichier qui a de tout : la fenêtre du rapport le plus long (seize genres) tient dans le panneau, titre et boutons fixes, la liste défile.
    await pickFile(page, pptxFile('tout.pptx', await buildDeck(page, 'many')));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await sleep(900);
    const long = await reportState(page);
    check(tag + 'le rapport le plus long : seize genres, un par ligne, du premier (animations) au dernier (objet illisible), titre et introduction comme les autres',
      long.shown && long.title === T.reportTitle && long.intro === T.reportIntro && long.headlines.length === 16 && long.headlines[0] === T.manyFirst && long.headlines[15] === T.manyLast, { title: long.title, count: long.headlines.length, first: long.headlines[0], last: long.headlines[long.headlines.length - 1] });
    check(tag + 'la fenêtre tient dans le panneau : titre et boutons à l\'écran sans défiler la page, la liste défile dans la fenêtre', long.boxInPanel && long.titleInPanel && long.buttonsInPanel && long.scrolls && long.scrollMax > 0, long);
    await snap('report-long');
    await wheelToTheEnd(long, T.manyLast, 'report-long-end');
    // Au bout de la liste, la dernière ligne se déplie au vrai clic et se lit en entier (la liste s'allonge : un dernier coup de molette).
    await clickReportRow(page, 15);
    await page.mouse.wheel(0, 8000);
    await sleep(300);
    const lastOpen = await reportState(page);
    const lastView = await linesInView(page, 15);
    check(tag + 'la dernière ligne (objet illisible) se déplie au vrai clic : sa diapositive, son objet et ce que l\'import en dit, lus en entier dans la fenêtre', lastOpen.open[15] === true && JSON.stringify(lastOpen.lines[15]) === JSON.stringify(T.lastLines) && lastView.inside && lastOpen.titleInPanel && lastOpen.buttonsInPanel, { lines: lastOpen.lines[15], view: lastView });
    await snap('report-long-detail');
    await page.keyboard.press('Escape');
    await sleep(450);
    check(tag + 'Échap ferme la fenêtre du rapport le plus long', !(await reportState(page)).shown);

    // 5 ter) Un fichier qui a de tout, ce qui n'arrive pas ET ce que l'éditeur ne sait pas encore faire : la fenêtre au rapport le plus long de toutes (une ligne par genre du rapport), dite dans la langue de
    //    l'interface, tient dans le panneau comme les autres, titre et boutons fixes, et se lit jusqu'à sa dernière ligne.
    const lostFile = await buildDeck(page, 'lost');
    // Le fichier fait dire tous les genres du rapport sauf trois (ceux que le même objet ne peut pas faire dire ensemble) : un lot qui reprend un genre en retire un de la liste, le plancher le suit.
    const { wanted, keys } = await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const imported = await PptxImport.fromBuffer(bin.buffer);
      return { keys: PptxImport.REPORT_KEYS.length, wanted: imported.report.map(item => I18n.t('pptx.import.report.' + item.key, { n: item.n, max: PptxImport.MAX_SLIDES })) };
    }, lostFile.toString('base64'));
    await pickFile(page, pptxFile('perdu.pptx', lostFile));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await sleep(900);
    const lost = await reportState(page);
    check(tag + `le rapport le plus long de tous : ${wanted.length} genres, un par ligne, dans l'ordre et dans la langue de l'interface, du premier (animations) au dernier (objet illisible), aucune clé laissée telle quelle`,
      lost.shown && lost.title === T.reportTitle && lost.intro === T.reportIntro && wanted.length >= keys - 3 && JSON.stringify(lost.headlines) === JSON.stringify(wanted) && lost.headlines[0] === T.manyFirst
        && lost.headlines[lost.headlines.length - 1] === T.lostLast && !lost.headlines.some(line => line.includes('pptx.import.report.')), { title: lost.title, count: lost.headlines.length, wanted: wanted.length, first: lost.headlines[0], last: lost.headlines[lost.headlines.length - 1] });
    check(tag + 'des lignes à lire telles quelles, au singulier et au pluriel : ' + T.lostSamples.map(line => '« ' + line + ' »').join(', '), T.lostSamples.every(line => lost.headlines.includes(line)), lost.headlines.filter(line => /polices|fonts|sections?|verticaux|vertical/.test(line)));
    check(tag + 'les lignes du détail ne laissent aucune clé de texte telle quelle', lost.lines.every(lines => lines.every(line => !/importReport\.|pptx\.import\./.test(line))), lost.lines.flat().filter(line => /importReport\.|pptx\.import\./.test(line)));
    check(tag + 'la fenêtre tient dans le panneau : titre et boutons à l\'écran sans défiler la page, la liste défile dans la fenêtre', lost.boxInPanel && lost.titleInPanel && lost.buttonsInPanel && lost.scrolls && lost.scrollMax > long.scrollMax, { box: lost.box, scrolls: lost.scrolls, scrollMax: lost.scrollMax, longScrollMax: long.scrollMax });
    await snap('report-lost');
    await wheelToTheEnd(lost, T.lostLast, 'report-lost-end');
    const lostCopy = await clickDialogButton(page, T.copy);
    const lostPasted = String(await page.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERREUR ' + e.message)).split('\n');
    check(tag + 'le texte copié du rapport le plus long dit toutes ses lignes : une « • » par genre, le pied avec le décor du masque', !!lostCopy && lostCopy.reachable && lostPasted.filter(line => line.startsWith('• ')).length === wanted.length && wanted.every(line => lostPasted.includes('• ' + line)) && lostPasted.some(line => /Essai/.test(line)), { count: lostPasted.filter(line => line.startsWith('• ')).length, wanted: wanted.length, tail: lostPasted.slice(-4) });
    await clickDialogButton(page, T.close);
    check(tag + 'la fenêtre du rapport de tous les genres se ferme au vrai clic', !(await reportState(page)).shown);

    // 5 bis) La page du fichier : une présentation en 4:3 s'ouvre en 4:3 (720 x 540 pt) et non à la page d'une nouvelle présentation (960 x 540) ; rien à dire, donc aucune fenêtre de rapport.
    await pickFile(page, pptxFile('quatre-tiers.pptx', await buildDeck(page, 'fourThree')));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await settle(page, T.importedPattern);
    await waitStrip(page, 1);
    await sleep(400);
    const fourThree = await snapshot(page);
    const fourThreeStatus = await statusOf(page);
    check(tag + 'un fichier en 4:3 ouvre une présentation en 4:3 (720 x 540 pt) et non à la page d\'une nouvelle présentation (960 x 540) : une miniature, son texte, aucune fenêtre de rapport',
      Math.abs(fourThree.page.width - 720) < 1 && Math.abs(fourThree.page.height - 540) < 1 && fourThree.slides === 1 && /Quatre tiers/.test(fourThree.text) && !(await dialogState(page)).shown && fourThreeStatus.text === T.imported(1),
      { page: fourThree.page, slides: fourThree.slides, status: fourThreeStatus.text });
    await snap('four-three');

    // 5 ter) Un fichier au thème sombre : la page de l'éditeur prend son fond (noir), la diapositive qui montre le fond du thème n'écrit pas le sien (la seconde garde son blanc), la ligne du menu Page nomme le thème.
    await pickFile(page, pptxFile('nuit.pptx', await buildDeck(page, 'dark')));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await settle(page, T.importedPattern);
    await waitStrip(page, 2);
    await sleep(500);
    const dark = await page.evaluate(() => {
      const sheet = document.querySelector('#editor-container .v2-page-sheet') || document.getElementById('editor-container');
      const theme = PageLayout.getTheme();
      const html = Editor.getHTML();
      return {
        bg: getComputedStyle(sheet).backgroundColor, themed: document.documentElement.classList.contains('pp-themed'), theme: theme && { bg: theme.colors.bg, text: theme.colors.text },
        ownBgs: (html.match(/data-bg="[^"]*"/g) || []), text: document.getElementById('editor-container').textContent,
      };
    });
    check(tag + 'un fichier au thème sombre : la feuille de la page est noire (rgb(0, 0, 0)), le thème du fichier est gardé (fond #000000, texte #ffffff), un seul fond écrit (le blanc de la seconde diapositive : celle du thème n\'en écrit pas)',
      dark.bg === 'rgb(0, 0, 0)' && dark.themed && !!dark.theme && dark.theme.bg === '#000000' && dark.theme.text === '#ffffff' && dark.ownBgs.length === 1 && /ffffff/i.test(dark.ownBgs[0]) && /Nuit/.test(dark.text), dark);
    await snap('dark-file');

    // 6) Les fichiers refusés : un message clair en rouge, aucune fenêtre (même avec un document à enregistrer), le document ne bouge pas.
    const baseline = await snapshot(page);
    const refused = async (file, pattern) => {
      await pickFile(page, file);
      await settle(page, pattern);
      const after = await statusOf(page);
      const dialog = await dialogState(page);
      const now = await snapshot(page);
      return { after, dialog, unchanged: now.html === baseline.html && now.slides === baseline.slides };
    };
    const refusal = (what, got, expected) => check(tag + `${what} : « ${expected} » en rouge, sans fenêtre, le document ne bouge pas`, got.after.text === expected && got.after.error && !got.dialog.shown && got.unchanged && !got.after.clipped && got.after.inPanel, got);
    refusal('un fichier qui n\'est pas un zip', await refused(pptxFile('courrier.pptx', Buffer.from('Ceci est un courrier, pas une présentation.', 'utf8')), T.unreadablePattern), T.unreadable);
    refusal('un zip qui n\'est pas une présentation (un courrier Word)', await refused(pptxFile('courrier-word.pptx', await buildDeck(page, 'notPresentation')), T.unreadablePattern), T.unreadable);
    refusal('un ancien .ppt (avant 2007)', await refused({ name: 'ancien.ppt', mimeType: 'application/vnd.ms-powerpoint', buffer: Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, 0, 0, 0, 0, 0, 0]) }, T.legacyPattern), T.legacy);
    refusal('une présentation sans diapositive', await refused(pptxFile('vide.pptx', await buildDeck(page, 'empty')), T.emptyPattern), T.empty);
    const huge = await mibFile(tmp, 'gros.pptx', MAX_MIB * 1024 * 1024 + 1);
    refusal(`un fichier de plus de ${MAX_MIB} Mo (jamais lu : sa taille suffit)`, await refused(huge, T.tooBigPattern), T.tooBig);
    await snap('refused');
    check(tag + 'aucun de ces refus n\'a demandé le moindre rechargement du moteur ni laissé un champ de fichier dans la page', engineRequests() === 1 && (await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)) === 0, { engine: engineRequests() });
    check(tag + 'aucune boîte native (alert, confirm, prompt) ne s\'est ouverte pendant tout le parcours', natives.length === 0, natives);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// Sans l'extension « diapositives » : la ligne est grisée (le widget seul, ou GFS qui ne l'active pas), n'ouvre aucun sélecteur ; le document ne bouge pas. Seul, le clic explique par une fenêtre ; hébergé par
// GFS (qui répond), il demande à GFS sa fenêtre d'installation (appel `installer`, sans fenêtre de l'app), comme « Nouvelle présentation ».
async function runDisabled(lang, scheme, hosted) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${scheme} ${hosted ? 'GFS sans l\'extension' : 'widget seul'}] `;
  console.log(`\n=== Import d'un PowerPoint sans l'extension « diapositives » (${hosted ? 'hébergé par GFS' : 'widget seul'}), ${WIDTH}x${HEIGHT} ===`);
  const { page, natives } = await t.openPage({ hosted, stub: hosted ? { extensions: ['graphique'] } : null, seed: SEED, lang, colorScheme: scheme });
  await page.waitForFunction(sel => { const el = document.querySelector(sel); return !!el && el.getAttribute('aria-disabled') === 'true'; }, ROW, { timeout: 15000 }).catch(() => {});
  await hoverRow(page, PLUS, ROW);
  const [row] = await rowsState(page, [ROW]);
  check(tag + `la ligne « ${T.row} » est là, entière dans le panneau, grisée (aria-disabled), et dit pourquoi en info-bulle`, !row.missing && row.text === T.row && row.inside && !row.live && row.ariaDisabled === 'true' && /Grist Factory Suite/.test(row.title), row);
  const before = await page.evaluate(() => Editor.getHTML());
  const waiting = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
  await page.evaluate(() => 0);
  await sleep(250);
  await clickHoverRow(page, PLUS, ROW);
  const chooser = await waiting;
  check(tag + 'un vrai clic sur la ligne grisée n\'ouvre aucun sélecteur de fichier', chooser === null);
  await sleep(700);
  const opened = await dialogState(page);
  if (hosted) {
    const installs = await page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer').map(c => c.args));
    check(tag + 'il demande à GFS d\'installer « diapositives » (appel `installer`), sans fenêtre de l\'app', JSON.stringify(installs) === JSON.stringify([{ extension: 'diapositives' }]) && !opened.shown, { installs, opened });
  } else {
    check(tag + `il explique : « ${T.offTitle} », en citant l'extension « Diapositives », avec un seul bouton, entière dans le panneau`, opened.shown && opened.title === T.offTitle && T.offMessage.test(opened.message) && opened.buttons.length === 1 && opened.boxInPanel, opened);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${scheme}-seul.png`) });
    await clickDialogButton(page, T.close);
  }
  check(tag + 'rien ne bouge : la fenêtre est fermée, le document est le même, aucun champ de fichier ni boîte native', !(await dialogState(page)).shown && (await page.evaluate(() => Editor.getHTML())) === before
    && (await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)) === 0 && natives.length === 0, natives);
}

await run('fr', 'light');
await runDisabled('fr', 'light', false);
await run('en', 'dark');
await runDisabled('en', 'dark', true);
await t.finish();
