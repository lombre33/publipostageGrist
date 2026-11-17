#!/usr/bin/env node
// L'IMPORT d'une présentation OpenDocument (js/odp-import.js, ligne « Importer un OpenDocument… » du menu « + », js/main-import.js `importOdpFile`) à la VRAIE souris et avec un VRAI sélecteur de fichier
// (page.waitForEvent('filechooser') : Chromium n'ouvre le sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist (~700x400), hébergé par GFS (simulé par dev-tests/gfs-stub.js) avec
// l'extension « diapositives » active : français clair, puis anglais sombre. dev-tests/scenarios-odp-import.js (groupe « odpImport ») vérifie, DANS la page, ce que l'import écrit ; une page.evaluate ne
// déclenche ni un geste « trusted », ni un vrai sélecteur de fichier : c'est ici qu'on s'assure que
//  - le sélecteur de la ligne « Importer un OpenDocument… » accepte aussi les présentations (.odp, .otp, .fodp) à côté des textes et des tableurs, toujours pour un seul fichier ; annuler ne change rien ;
//    le moteur des présentations n'est demandé au réseau qu'au premier import, une seule fois ;
//  - le fichier choisi devient une NOUVELLE présentation, sans nom : une miniature par diapositive, la page du fichier (28 x 15,75 cm), le texte, la forme, le tableau, l'image et le trait à leur place et
//    visibles ; rien à dire : aucune fenêtre, et le coin d'état dit combien de diapositives sont arrivées ;
//  - avec un document à enregistrer, « Modifications non enregistrées » vient APRÈS le choix du fichier et sa lecture : « Annuler » garde le document, « Ne pas enregistrer » importe, et la fenêtre de ce
//    que l'import n'a pas repris (animations, tracé libre, forme inconnue) vient après la question, dit chaque genre, tient dans le panneau et rend la main à l'éditeur ;
//  - les fichiers refusés (un dessin, une présentation sans diapositive, un fichier protégé, un fichier qui n'est pas un zip) : un message clair en rouge, aucune fenêtre, rien ne change ;
//  - sans l'extension « diapositives » : seul, le choix d'un .odp ouvre la fenêtre qui explique ce qu'il faut (le coin d'état ne reste pas sur « Lecture… ») ; hébergé par GFS, il demande à GFS de l'installer.
// Lancé par run-headless.mjs (groupe Node « odpImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-odp-import-mouse.mjs
// ODP_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';
import { clickHoverRow } from './load-lib.mjs';

const SHOTS = process.env.ODP_IMPORT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-odp-import-mouse', port: Number(process.env.ODP_IMPORT_MOUSE_PORT || 9103) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SEED = seedModels();
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-odf';
const MIME = 'application/vnd.oasis.opendocument.presentation';
const CM = 72 / 2.54;

const TEXTS = {
  fr: {
    unsaved: 'Modifications non enregistrées', discard: 'Ne pas enregistrer', cancel: 'Annuler', close: 'Fermer',
    imported: n => `Présentation OpenDocument importée : ${n} ${n === 1 ? 'diapositive' : 'diapositives'}. Nommez le modèle puis enregistrez-le.`, importedPattern: /Présentation OpenDocument importée/,
    reading: /^Lecture (du fichier|de la présentation) OpenDocument/,
    reportTitle: 'Ce que l’import n’a pas repris tel quel', reportIntro: 'La présentation est importée. Le fichier avait ceci, que l’éditeur n’a pas pu reprendre tel quel :',
    report: ['2 animations d’objets non reprises', '1 tracé libre, courbe ou polygone non repris', '1 forme remplacée par un rectangle'],
    drawing: 'Ce fichier OpenDocument est un dessin : seuls les textes, tableurs et présentations sont lus.', drawingPattern: /est un dessin/,
    empty: 'Cette présentation n’a aucune diapositive à importer.', emptyPattern: /aucune diapositive/,
    encrypted: 'Fichier OpenDocument protégé par un mot de passe : enregistrez-le sans mot de passe.', encryptedPattern: /protégé par un mot de passe/,
    unreadable: 'Ce fichier n’est pas un document OpenDocument lisible.', unreadablePattern: /n’est pas un document OpenDocument/,
    offTitle: 'Cette fonction demande Grist Factory Suite', offMessage: /Diapositives/,
  },
  en: {
    unsaved: 'Unsaved changes', discard: 'Don’t save', cancel: 'Cancel', close: 'Close',
    imported: n => `OpenDocument presentation imported: ${n} ${n === 1 ? 'slide' : 'slides'}. Name the template, then save it.`, importedPattern: /OpenDocument presentation imported/,
    reading: /^Reading the OpenDocument (file|presentation)/,
    reportTitle: 'What the import did not carry over as is', reportIntro: 'The presentation is imported. The file had the following, which the editor could not carry over as is:',
    report: ['2 object animations not imported', '1 free drawing, curve or polygon not imported', '1 shape replaced by a rectangle'],
    drawing: 'This OpenDocument file is a drawing: only texts, spreadsheets and presentations are read.', drawingPattern: /is a drawing/,
    empty: 'This presentation has no slides to import.', emptyPattern: /no slides/,
    encrypted: 'Password-protected OpenDocument file: save it without a password.', encryptedPattern: /Password-protected/,
    unreadable: 'This file is not a readable OpenDocument file.', unreadablePattern: /not a readable OpenDocument/,
    offTitle: 'This feature needs Grist Factory Suite', offMessage: /Slides/,
  },
};

// ---- Les fichiers de l'essai : fabriqués dans la page avec les briques de dev-tests/scenarios-odp-import.js (aucun fichier binaire dans le dépôt) ------------------------------------------------------------
// `deck` : trois diapositives que l'éditeur reprend en entier (un titre et une carte ; un tableau avec des notes ; une image et un trait fléché avec un fondu) ; `report` : une diapositive avec deux animations,
// un tracé libre et une forme que l'éditeur ne dessine pas ; `drawing`, `empty`, `locked`.
const buildFile = async (page, kind) => Buffer.from(await page.evaluate(async (which) => {
  const F = window.OdpFixtures;
  const { odp, page: slide, frameText, shape, lineEl, pictureFrame, notesFrame, graphic, paragraph, span, paragraphStyle, textStyle, pageStyle, PNG_RED } = F;
  const invisible = 'Object_20_with_20_no_20_fill_20_and_20_no_20_line';
  const cell = text => `<table:table-cell>${paragraph(text)}</table:table-cell>`;
  const table = '<draw:frame svg:x="2cm" svg:y="4cm" svg:width="18cm" svg:height="6cm"><table:table><table:table-column table:style-name="co1" table:number-columns-repeated="3"/>'
    + ['Mois|Ventes|Retours', 'Janvier|120|4', 'Février|98|2'].map(line => `<table:table-row table:style-name="ro1">${line.split('|').map(cell).join('')}</table:table-row>`).join('') + '</table:table></draw:frame>';
  const common = graphic('gr1', 'draw:fill="none" draw:stroke="none" draw:textarea-vertical-align="top"', { parent: invisible }) + textStyle('T1', 'fo:font-size="40pt" fo:font-weight="bold"') + paragraphStyle('P1', { text: 'fo:font-size="20pt"' })
    + '<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="6cm"/></style:style><style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="2cm"/></style:style>';
  const kinds = {
    deck: () => ({
      files: { 'Pictures/rouge.png': PNG_RED },
      auto: common + graphic('gr2', 'draw:fill="solid" draw:fill-color="#d9e2f3" draw:stroke="solid" svg:stroke-width="0.07cm" svg:stroke-color="#2f5597" draw:textarea-vertical-align="middle"')
        + graphic('gr3', 'draw:stroke="solid" svg:stroke-width="0.106cm" svg:stroke-color="#c00000" draw:marker-end="Arrow"') + pageStyle('dp1', 'smil:type="fade" presentation:transition-speed="medium"'),
      pages: [
        slide('Bilan', frameText(paragraph(span('Bilan de l’année', 'T1')), { style: 'gr1', box: { x: 2, y: 1.5, w: 24, h: 2.5 } }) + shape('ooxml-roundRect', { style: 'gr2', box: { x: 15, y: 6, w: 9, h: 5 }, content: paragraph('Carte', 'P1'), modifiers: '16667' })),
        slide('Chiffres', frameText(paragraph(span('Les chiffres', 'T1')), { style: 'gr1', box: { x: 2, y: 1.5, w: 24, h: 2.5 } }) + table, { notes: notesFrame(['Penser à citer le chiffre d’affaires.']) }),
        slide('Image', pictureFrame('Pictures/rouge.png', { box: { x: 2, y: 4, w: 8, h: 5 }, desc: 'Un point rouge' }) + lineEl('line', 12, 6, 24, 9, 'gr3'), { style: 'dp1' }),
      ],
    }),
    report: () => ({
      auto: common + graphic('gr2', 'draw:fill="solid" draw:fill-color="#445566" draw:stroke="none"'),
      pages: [slide('Bilan', frameText(paragraph(span('Résultats', 'T1')), { style: 'gr1', box: { x: 2, y: 1.5, w: 24, h: 2.5 } }) + shape('mso-spt-inconnue', { style: 'gr2', box: { x: 3, y: 6, w: 6, h: 3 } })
        + '<draw:polygon draw:points="0,0 10,10 0,10" svg:viewBox="0 0 10 10" svg:x="12cm" svg:y="6cm" svg:width="4cm" svg:height="4cm"/>'
        + '<anim:par presentation:node-type="on-click"><anim:par presentation:node-type="with-previous"/></anim:par>')],
    }),
    drawing: () => ({ mime: 'application/vnd.oasis.opendocument.graphics', bodyTag: 'office:drawing', pages: '<draw:page draw:name="p1"/>' }),
    empty: () => ({ pages: '' }),
    locked: () => ({ encrypted: true }),
  };
  const buffer = await odp(kinds[which]());
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}, kind), 'base64');
const odpFile = (name, buffer, mimeType = MIME) => ({ name, mimeType, buffer });

// ---- Ce que la page montre ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
    boxInPanel: inPanel(rect(box)), titleInPanel: !!title && inPanel(rect(title)), buttonsInPanel: buttons.every(b => inPanel(rect(b))), focusOn: document.activeElement ? document.activeElement.textContent.trim().slice(0, 30) : '',
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
// Ce que le document montre : son HTML (la comparaison « rien n'a changé »), ses miniatures, sa page, ses cadres, son modèle.
const snapshot = page => page.evaluate(() => ({
  html: Editor.getHTML(),
  slides: document.querySelectorAll('.pp-slide-item').length,
  frames: document.querySelectorAll('#editor-container .tiptap .pp-free-frame').length,
  page: PageLayout.getPageSizePt(),
  select: document.getElementById('template-select').value,
  text: document.querySelector('#editor-container .tiptap').textContent,
  tables: document.querySelectorAll('#editor-container .tiptap table').length,
  images: document.querySelectorAll('#editor-container .tiptap img.editor-image').length,
  dots: Array.from(document.querySelectorAll('.pp-slide-item .pp-slide-overflow')).filter(dot => !dot.hidden && dot.getBoundingClientRect().width > 0).length,
  stripShown: !!document.querySelector('.pp-slide-strip') && !document.querySelector('.pp-slide-strip').hidden,
}));
// Un objet du document (cadre, tableau, image) amené à l'écran : a-t-il de la place (plus de 4 points), est-il DANS la zone d'édition et atteignable (rien ne le recouvre) ? `pick` s'écrit dans la page : (container) => élément.
const seenOnScreen = (page, pick) => page.evaluate((source) => {
  const el = new Function('return (' + source + ')')()(document.getElementById('editor-container'));
  if (!el) return { found: false };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const c = document.getElementById('editor-container').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, c.left + 2), c.right - 2), Math.min(Math.max(r.top + r.height / 2, c.top + 2), c.bottom - 2));
  return { found: true, size: r.width > 4 && r.height > 4, inside: r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom, reachable: !!hit && (el.contains(hit) || hit.contains(el)) };
}, pick.toString());
const frameWith = text => `c => Array.from(c.querySelectorAll('.pp-free-frame')).filter(f => f.textContent.trim() === ${JSON.stringify(text)}).map(f => f.querySelector('.pp-free-frame-box') || f)[0]`;
const seenOk = seen => seen.found && seen.size && seen.inside && seen.reachable;

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
  await sleep(700);
};
const waitStrip = (page, n) => page.waitForFunction(count => document.querySelectorAll('.pp-slide-item').length === count, n, { timeout: 15000 }).catch(() => {});

async function run(lang, scheme) {
  const T = TEXTS[lang];
  const label = (lang === 'fr' ? 'français' : 'anglais') + ' ' + (scheme === 'dark' ? 'sombre' : 'clair');
  const tag = `[${lang} ${scheme}] `;
  console.log(`\n=== Import d'une présentation OpenDocument à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { page, requests, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme: scheme });
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${scheme}-${name}.png`) }); };
  await page.addScriptTag({ url: '/dev-tests/scenarios-odp-import.js' });
  const engineRequests = () => requests.filter(url => /js\/odp-import\.js/.test(url)).length;

  // 1) Le vrai sélecteur : un seul fichier, les textes, les tableurs ET les présentations OpenDocument, ni Word, ni Excel, ni PowerPoint ; annuler ne change rien ; le moteur n'a pas été demandé.
  const before = await statusOf(page);
  const { chooser } = await pickFile(page, null);
  check(tag + 'un vrai clic sur la ligne ouvre le vrai sélecteur de fichier', !!chooser);
  if (!chooser) return;
  const accept = await chooser.element().getAttribute('accept');
  check(tag + 'le sélecteur accepte aussi les présentations OpenDocument (.odp, .otp, .fodp), pour un seul fichier, sans Word, Excel ni PowerPoint',
    !chooser.isMultiple() && ['.odt', '.ods', '.odp', '.otp', '.fodp'].every(ext => accept.split(',').includes(ext)) && /opendocument\.presentation/.test(accept) && !/docx|xlsx|pptx|\.md\b/.test(accept), { accept, multiple: chooser.isMultiple() });
  await chooser.element().evaluate(el => el.dispatchEvent(new Event('cancel')));
  await sleep(500);
  check(tag + 'annuler dans le sélecteur ne change rien : même message d\'état, aucune fenêtre, le moteur des présentations pas encore demandé au réseau',
    (await statusOf(page)).text === before.text && !(await dialogState(page)).shown && engineRequests() === 0, { engine: engineRequests() });

  // 2) Une présentation que l'éditeur reprend en entier : une NOUVELLE présentation sans nom, une miniature par diapositive, rien à dire.
  const emptyBefore = await snapshot(page);
  await pickFile(page, odpFile('bilan.odp', await buildFile(page, 'deck')));
  await settle(page, T.importedPattern);
  await waitStrip(page, 3);
  const done = await snapshot(page);
  const status = await statusOf(page);
  check(tag + 'le moteur des présentations est demandé au réseau une seule fois', engineRequests() === 1, engineRequests());
  check(tag + `le coin d'état dit « ${T.imported(3)} », en entier, dans le panneau`, status.text === T.imported(3) && !status.error && !status.clipped && status.inPanel, status);
  check(tag + 'aucune fenêtre ne s\'est ouverte (rien à dire : tout est repris)', !(await dialogState(page)).shown);
  check(tag + 'une présentation neuve, sans nom : trois miniatures, la bande des diapositives, aucun point rouge', done.slides === 3 && done.select === '' && done.stripShown && done.dots === 0 && done.html !== emptyBefore.html, { slides: done.slides, select: done.select, dots: done.dots });
  check(tag + 'la page est celle du fichier : 28 x 15,75 cm', Math.abs(done.page.width - 28 * CM) < 1 && Math.abs(done.page.height - 15.75 * CM) < 1, done.page);
  check(tag + 'le document porte les trois diapositives : six cadres (deux par diapositive), un tableau, une image', done.frames === 6 && done.tables === 1 && done.images === 1 && /Bilan de l’année/.test(done.text) && /Les chiffres/.test(done.text), { frames: done.frames, tables: done.tables, images: done.images });
  const title = await seenOnScreen(page, new Function('return ' + frameWith('Bilan de l’année'))());
  const card = await seenOnScreen(page, new Function('return ' + frameWith('Carte'))());
  check(tag + 'la première diapositive : le titre et la carte sont à l\'écran, entiers et atteignables', seenOk(title) && seenOk(card), { title, card });
  await snap('deck');
  // Un cadre importé est un vrai cadre de l'éditeur : un appui sur le bord de la carte la sélectionne.
  const cardBox = await page.evaluate(() => { const box = Array.from(document.querySelectorAll('#editor-container .pp-free-frame-box')).find(b => b.textContent.trim() === 'Carte'); const r = box.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width }; });
  await page.mouse.move(cardBox.left + cardBox.width * 0.25, cardBox.top + 1, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await sleep(350);
  const selected = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-free-frame.pp-ff-selected')).map(e => e.textContent.trim()));
  check(tag + 'un appui sur le bord de la carte la sélectionne (cadre de l\'éditeur, pas une image morte)', selected.length === 1 && selected[0] === 'Carte', selected);
  // La deuxième et la troisième : le tableau et l'image, au vrai clic sur leur miniature.
  const clickThumb = async (index) => {
    const target = await page.evaluate((i) => { const item = document.querySelectorAll('.pp-slide-item')[i]; const r = item.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, index);
    await page.mouse.move(target.x - 6, target.y, { steps: 2 });
    await page.mouse.click(target.x, target.y);
    await sleep(700);
  };
  await clickThumb(1);
  const table = await seenOnScreen(page, c => c.querySelector('table'));
  const cells = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap table th, #editor-container .tiptap table td')).map(cell => cell.textContent.trim()).join('|'));
  check(tag + 'un clic sur la miniature de la diapositive 2 amène son tableau à l\'écran, atteignable, avec ses neuf cases', seenOk(table) && cells === 'Mois|Ventes|Retours|Janvier|120|4|Février|98|2', { table, cells });
  await snap('table');
  await clickThumb(2);
  const picture = await seenOnScreen(page, c => c.querySelector('img.editor-image'));
  const arrow = await seenOnScreen(page, c => { const line = c.querySelector('.pp-free-frame[data-ff-shape="line"]'); return line && (line.querySelector('.pp-free-frame-box') || line); });
  check(tag + 'un clic sur la miniature de la diapositive 3 amène son image et son trait fléché à l\'écran, atteignables', seenOk(picture) && seenOk(arrow), { picture, arrow });
  await snap('picture');
  await parkMouse(page);

  // 3) Un document à enregistrer : la question vient APRÈS le choix du fichier ; « Annuler » garde le document ; « Ne pas enregistrer » importe, puis la fenêtre dit ce qui n'est pas repris.
  const report = odpFile('resultats.odp', await buildFile(page, 'report'));
  const second_ = await pickFile(page, report);
  check(tag + '(document à enregistrer) le sélecteur s\'ouvre sans poser de question avant le choix du fichier', !!second_.chooser && !second_.askedBefore.shown, second_.askedBefore);
  await settle(page, /^$/);
  const asked = await dialogState(page);
  check(tag + `la fenêtre « ${T.unsaved} » s'ouvre après le choix du fichier, avec « ${T.discard} » et « ${T.cancel} »`, asked.shown && asked.title === T.unsaved && asked.buttons.includes(T.discard) && asked.buttons.includes(T.cancel) && asked.boxInPanel, asked);
  check(tag + 'pendant la question, le coin d\'état ne reste pas sur « Lecture… »', !T.reading.test((await statusOf(page)).text), (await statusOf(page)).text);
  await snap('question');
  const keptBefore = await snapshot(page);
  await clickDialogButton(page, T.cancel);
  const kept = await snapshot(page);
  check(tag + `« ${T.cancel} » : la fenêtre se ferme et la présentation reste telle quelle`, !(await dialogState(page)).shown && kept.html === keptBefore.html && kept.slides === 3, { slides: kept.slides });
  await pickFile(page, report);
  await settle(page, /^$/);
  await clickDialogButton(page, T.discard);
  await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 30000 }).catch(() => {});   // la fenêtre du compte rendu vient après la mise en place
  await sleep(500);
  await waitStrip(page, 1);
  const told = await dialogState(page);
  const lines = told.message.split('\n');
  check(tag + `la fenêtre du compte rendu s'ouvre, titrée « ${T.reportTitle} », avec sa phrase d'introduction`, told.shown && told.title === T.reportTitle && lines[0] === T.reportIntro, { title: told.title, intro: lines[0] });
  check(tag + 'elle dit les animations, le tracé libre puis la forme remplacée, une par ligne', JSON.stringify(lines.slice(1)) === JSON.stringify(T.report.map(line => '• ' + line)), lines.slice(1));
  check(tag + `elle n'a qu'un bouton, « ${T.close} », entière dans le panneau, avec le focus dessus`, told.buttons.length === 1 && told.buttons[0] === T.close && told.boxInPanel && told.titleInPanel && told.buttonsInPanel && told.focusOn === T.close, told);
  check(tag + 'le texte de la fenêtre tient les contrastes de la charte (>= 4,5:1)', (await contrastOf(page, '#pp-dialog-modal .pp-dialog-message')) >= 4.5);
  await snap('report');
  const closed = await clickDialogButton(page, T.close);
  check(tag + `« ${T.close} » est atteignable à la souris dans le panneau`, !!closed && closed.reachable && closed.inPanel, closed);
  await parkMouse(page);
  const one = await snapshot(page);
  check(tag + 'la présentation du fichier a remplacé la première : une diapositive, son titre, la forme inconnue en rectangle', one.slides === 1 && /Résultats/.test(one.text) && one.frames === 2 && !(await dialogState(page)).shown, { slides: one.slides, frames: one.frames });
  check(tag + 'le focus est rendu à l\'éditeur après la fenêtre', await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap')));

  // 4) Les fichiers refusés : un message clair en rouge, aucune fenêtre (même avec un document à enregistrer), le document ne bouge pas.
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
  refusal('un dessin OpenDocument', await refused({ name: 'dessin.odg', mimeType: 'application/vnd.oasis.opendocument.graphics', buffer: await buildFile(page, 'drawing') }, T.drawingPattern), T.drawing);
  refusal('une présentation sans diapositive', await refused(odpFile('vide.odp', await buildFile(page, 'empty')), T.emptyPattern), T.empty);
  refusal('une présentation protégée par un mot de passe', await refused(odpFile('secret.odp', await buildFile(page, 'locked')), T.encryptedPattern), T.encrypted);
  refusal('un fichier qui n\'est pas un zip', await refused(odpFile('courrier.odp', Buffer.from('Ceci est un courrier, pas une présentation.', 'utf8')), T.unreadablePattern), T.unreadable);
  await snap('refused');
  check(tag + 'aucun de ces refus n\'a demandé un second chargement du moteur ; aucune boîte native (alert, confirm, prompt) ne s\'est ouverte, aucun champ de fichier oublié dans la page',
    engineRequests() === 1 && natives.length === 0 && (await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)) === 0, { engine: engineRequests(), natives });
}

// Sans l'extension « diapositives » : le choix d'un .odp ne laisse pas le coin d'état sur « Lecture… ». Seul, une fenêtre explique ce qu'il faut ; hébergé par GFS (qui répond), il lui demande de l'installer
// (appel `installer`, sans fenêtre de l'app), comme « Nouvelle présentation ». Le document ne bouge pas.
async function runDisabled(lang, scheme, hosted) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${scheme} ${hosted ? 'GFS sans l\'extension' : 'widget seul'}] `;
  console.log(`\n=== Import d'une présentation OpenDocument sans l'extension « diapositives » (${hosted ? 'hébergé par GFS' : 'widget seul'}), ${WIDTH}x${HEIGHT} ===`);
  const { page, natives } = await t.openPage({ hosted, stub: hosted ? { extensions: ['graphique'] } : null, seed: SEED, lang, colorScheme: scheme });
  await page.addScriptTag({ url: '/dev-tests/scenarios-odp-import.js' });
  const before = await page.evaluate(() => Editor.getHTML());
  await pickFile(page, odpFile('bilan.odp', await buildFile(page, 'deck')));
  await sleep(1500);
  const opened = await dialogState(page);
  const status = await statusOf(page);
  if (hosted) {
    const installs = await page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer').map(c => c.args));
    check(tag + 'il demande à GFS d\'installer « diapositives » (appel `installer`), sans fenêtre de l\'app', JSON.stringify(installs) === JSON.stringify([{ extension: 'diapositives' }]) && !opened.shown, { installs, opened });
  } else {
    check(tag + `il explique : « ${T.offTitle} », en citant l'extension « Diapositives », avec un seul bouton, entière dans le panneau`, opened.shown && opened.title === T.offTitle && T.offMessage.test(opened.message) && opened.buttons.length === 1 && opened.boxInPanel, opened);
    await clickDialogButton(page, T.close);
  }
  check(tag + 'le coin d\'état ne reste pas sur « Lecture… » une fois l\'explication donnée', !T.reading.test(status.text), status.text);
  check(tag + 'rien ne bouge : la fenêtre est fermée, le document est le même, aucun champ de fichier ni boîte native', !(await dialogState(page)).shown && (await page.evaluate(() => Editor.getHTML())) === before
    && (await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)) === 0 && natives.length === 0, natives);
}

await run('fr', 'light');
await runDisabled('fr', 'light', false);
await run('en', 'dark');
await runDisabled('en', 'dark', true);
await t.finish();
