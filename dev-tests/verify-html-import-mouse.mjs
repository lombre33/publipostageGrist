#!/usr/bin/env node
// Import d'un fichier HTML (js/html-import.js, ligne « Importer un HTML… » du menu « + », et dépôt d'un .html sur la page) à la VRAIE souris et avec un VRAI sélecteur de fichier (page.waitForEvent('filechooser') :
// Chromium n'ouvre le sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist d'Antoine (~700x400), en thème clair, sombre puis en anglais.
// dev-tests/scenarios-html-import.js (groupe « htmlImport ») vérifie ce que l'import écrit, DANS la page ; une page.evaluate ne déclenche ni le survol d'un menu, ni un geste « trusted », ni un vrai sélecteur de
// fichier : c'est ici qu'on s'assure que
//   - « + » ouvre son menu au survol et la ligne « Importer un HTML… » (« Import from HTML… ») y suit « Importer un Markdown… » et précède « Importer un Word… », entière dans le panneau, que rien ne recouvre, lisible ;
//   - un vrai clic sur la ligne ouvre le vrai sélecteur, réduit aux fichiers HTML, pour un seul fichier ; annuler dans le sélecteur ne change rien ;
//   - le fichier choisi (une page enregistrée : feuille de style, menu, colonne, pied, image à côté, image en données, lien relatif, élément caché, programme) devient un document sans nom, visible et atteignable à la
//     souris (titre en couleur, chapeau en gras, listes, tableau à fond de case, image) ; le menu et le pied du site sont gardés comme du texte ; l'élément caché n'y est pas ; la fenêtre du compte rendu dit, en entier,
//     une ligne par genre, et son bouton se ferme à la souris ; le coin d'état dit que le HTML est importé ;
//   - un document modifié et pas enregistré : « Modifications non enregistrées » vient APRÈS le choix du fichier et sa lecture ; « Annuler » garde le document, « Ne pas enregistrer » importe ;
//   - un fichier binaire, vide, de plus de 10 Mo ou de plus de 2 millions de caractères : un message clair en rouge, rien ne change, aucune fenêtre ;
//   - le geste complet : un document exporté en HTML (menu « Type d'export » > « HTML (fichier à déposer) », bouton Exporter) puis importé redonne ses encadré, cases, colonnes, note, légende, en-tête et pied ;
//   - le DÉPÔT d'un .html sur un document ouvert : la fenêtre « Nouveau document / Remplacer celui-ci / Ajouter après / Insérer ici », « Ajouter après » met la page à la fin, le compte rendu suit.
// Lancé par run-headless.mjs (groupe Node « htmlImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-html-import-mouse.mjs
// HTML_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { open, sleep, click, hoverRow, clickHoverRow, downloadOf, chooseExportType, chooseExportLines, fire } from './load-lib.mjs';

const PORT = Number(process.env.HTML_IMPORT_MOUSE_PORT || 9041);
const SHOTS = process.env.HTML_IMPORT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-html';
const WIDTH = 700;
const HEIGHT = 400;

const TEXTS = {
  fr: {
    row: 'Importer un HTML…', md: 'Importer un Markdown…', word: 'Importer un Word…', unsaved: 'Modifications non enregistrées', discard: 'Ne pas enregistrer', cancel: 'Annuler',
    reading: /^Lecture du fichier HTML/, imported: 'HTML importé. Nommez le modèle puis enregistrez-le.', reportTitle: 'Ce que l’import n’a pas repris tel quel',
    reportIntro: 'La page est importée. Elle avait ceci, que l’éditeur n’a pas pu reprendre tel quel :',
    reportLines: ['• 1 image rangée à côté du fichier (adresse relative), remplacée par un mot', '• 1 lien vers une autre page du site (adresse relative), repris comme texte', '• 1 programme (script) retiré',
      '• 3 blocs de navigation (menus, colonnes latérales, en-têtes ou pieds du site) repris comme du texte', '• 1 élément caché par la page retiré'],
    unreadable: 'Ce fichier n’est pas une page HTML lisible.', empty: 'Cette page HTML est vide : il n’y a rien à importer.',
    tooBig: /^Ce fichier est trop gros pour être importé : 10,1 Mo \(au plus 10 Mo\)\.$/, tooMuch: /^Cette page contient trop de texte pour l’éditeur : 2[\s  ]000[\s  ]001 caractères \(au plus 2[\s  ]000[\s  ]000\)\.$/,
    placeholder: '[image non reprise : Logo]', close: 'OK', merged: /importé|fusionné|ajouté|inséré/i,
    drop: { nw: 'Nouveau document', after: 'Ajouter après' },
  },
  en: {
    row: 'Import from HTML…', md: 'Import from Markdown…', word: 'Import from Word…', unsaved: 'Unsaved changes', discard: 'Don’t save', cancel: 'Cancel',
    reading: /^Reading the HTML file/, imported: 'HTML imported. Name the template, then save it.', reportTitle: 'What the import did not carry over as is',
    reportIntro: 'The page is imported. It had the following, which the editor could not carry over as is:',
    reportLines: ['• 1 image stored next to the file (relative address), replaced by a word', '• 1 link to another page of the site (relative address) kept as text', '• 1 script removed',
      '• 3 navigation blocks (menu, sidebar, site header or footer) kept as text', '• 1 element hidden by the page removed'],
    unreadable: 'This file is not a readable HTML page.', empty: 'This HTML page is empty: there is nothing to import.',
    tooBig: /^This file is too big to import: 10\.1 MB \(at most 10 MB\)\.$/, tooMuch: /^This page has too much text for the editor: 2,000,001 characters \(at most 2,000,000\)\.$/,
    placeholder: '[image not imported: Logo]', close: 'OK', merged: /imported|merged|added|inserted/i,
    drop: { nw: 'New document', after: 'Add after' },
  },
};

// Une page enregistrée : feuille de style, en-tête, menu, article (titre en couleur, chapeau en gras, listes, tableau à fond de case, deux images), pied, un élément caché et un programme.
const savedPage = title => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>h1 { color: #000091 } p.lead { color: #b34000; font-weight: bold } td.hot { background: #fff4d6 } .gone { display: none }</style></head>`
  + `<body><header><p>Intranet de la direction</p></header><nav><ul><li><a href="accueil.html">Accueil</a></li></ul></nav><main><h1>${title}</h1><p class="lead">Chapeau en couleur.</p>`
  + '<p>Texte avec <strong>gras</strong> et un <a href="https://www.exemple.fr/">lien</a>.</p><p class="gone">Texte caché par la page</p><ul><li>Un</li><li>Deux<ul><li>Sous-point</li></ul></li></ul>'
  + '<table><tr><th>Nom</th><th>Total</th></tr><tr><td class="hot">Stylo</td><td>3</td></tr></table>'
  + `<p><img src="images/logo.png" alt="Logo"></p><p><img src="${PNG}" alt="Plan" width="80"></p></main><footer><p>Pied du site</p></footer><script>window.__htmlImportMousePwn = 1</script></body></html>`;
const htmlFile = (name, text) => ({ name, mimeType: 'text/html', buffer: Buffer.from(text, 'utf8') });

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e) && !/\[main\] import HTML impossible/.test(e));

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
      reachable: !!top && el.contains(top), cut: el.scrollWidth > el.clientWidth + 1, live: !el.classList.contains('v2-hover-row-disabled') && !el.hasAttribute('aria-disabled'),
      contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100,
    };
  });
}, selectors);
const statusOf = page => page.evaluate(() => {
  const el = document.getElementById('status-msg');
  const r = el.getBoundingClientRect();
  return { text: el.textContent, error: el.classList.contains('error-msg'), clipped: el.scrollWidth > el.clientWidth + 1, inPanel: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
});
// La fenêtre ouverte (celle de confirmation, du compte rendu ou du dépôt) : titre, texte entier, boutons, ce qui la déborde.
const dialogState = page => page.evaluate(() => {
  const modal = Array.from(document.querySelectorAll('.pp-modal')).find(m => m.getClientRects().length > 0);
  if (!modal) return { shown: false, title: '', text: '', buttons: [] };
  const box = modal.querySelector('.pp-modal-box, .pp-modal-dialog, [role="dialog"]') || modal;
  const r = box.getBoundingClientRect();
  return {
    shown: true, title: (modal.querySelector('.pp-modal-title, h3') || {}).textContent || '', text: (modal.textContent || '').replace(/\s+/g, ' ').trim(),
    message: Array.from(modal.querySelectorAll('.pp-modal-message, .pp-modal-body, p')).map(p => p.innerText).join('\n'),
    buttons: Array.from(modal.querySelectorAll('button')).filter(b => !b.hidden && b.getClientRects().length).map(b => b.textContent.trim()),
    inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
  };
});
async function clickDialogButton(page, text) {
  const target = await page.evaluate(label => {
    const modal = Array.from(document.querySelectorAll('.pp-modal')).find(m => m.getClientRects().length > 0);
    if (!modal) return null;
    const button = Array.from(modal.querySelectorAll('button')).filter(b => !b.hidden).find(b => b.textContent.trim() === label);
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
const snapshot = page => page.evaluate(() => ({
  text: EditorCore.getEditor().state.doc.textContent,
  html: Editor.getHTML().replace(/data-note-id="[^"]*"/g, 'data-note-id=""'),
  zones: JSON.stringify(Editor.getHeaderFooterData()),
  title: (document.querySelector('.tiptap h1') || {}).textContent || '',
  name: document.getElementById('template-name').value,
  modelId: Templates.getCurrentId(),
  select: document.getElementById('template-select').value,
}));
const reachableInDocument = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { sel, missing: true };
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const c = document.getElementById('editor-container').getBoundingClientRect();
  const x = Math.max(r.left, c.left) + Math.min(r.width / 2, 40);
  const y = (Math.max(r.top, c.top) + Math.min(r.bottom, c.bottom)) / 2;
  const top = document.elementFromPoint(x, y);
  return { sel, shown: r.width > 0 && r.height > 0, reachable: !!top && el.contains(top), text: el.textContent.trim().slice(0, 40) };
}, selector);

// « + » au survol, la ligne au vrai clic ; l'écoute du sélecteur est installée AVANT le clic.
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
// Attend la fin de l'import : le message d'état (ou une fenêtre) est là.
const settle = async (page, pattern) => {
  await page.waitForFunction(source => {
    const text = document.getElementById('status-msg').textContent;
    const modal = Array.from(document.querySelectorAll('.pp-modal')).some(m => m.getClientRects().length > 0);
    return new RegExp(source).test(text) || modal;
  }, pattern.source, { timeout: 20000 }).catch(() => {});
  await sleep(500);
};
// Un glisser-déposer réel pour le navigateur : un DataTransfer portant un vrai File (Playwright n'a pas de glisser depuis le bureau).
const dropFile = (page, name, content) => page.evaluate(({ name, content }) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File([content], name, { type: 'text/html' }));
  const fire = kind => { const e = new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: transfer }); document.body.dispatchEvent(e); return e; };
  fire('dragenter'); fire('dragover');
  return { dropPrevented: fire('drop').defaultPrevented };
}, { name, content });

async function run(theme, lang) {
  const label = lang === 'en' ? 'anglais' : theme === 'dark' ? 'sombre' : 'clair';
  const T = TEXTS[lang];
  console.log(`\n=== Import d'un fichier HTML à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const w = await open({ spec: SPEC, theme, lang, port: PORT });
  const { page } = w;
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang === 'en' ? 'en' : theme}-${name}.png`) }); };
  try {
    await fire(page, 'PbClients', 1);

    // 1) Le menu « + » : la ligne est entre Markdown et Word, dans le panneau, rien ne la recouvre, texte lisible.
    await hoverRow(page, PLUS, ROW);
    const [md, html, word] = await rowsState(page, ['#v2-btn-import-md', ROW, '#v2-btn-import-docx']);
    check(`${label} - le menu « + » montre « ${T.row} » entre « ${T.md} » et « ${T.word} », entière dans le panneau, atteignable, sans texte coupé`,
      !!html && html.text === T.row && md.text === T.md && word.text === T.word && html.top >= md.bottom - 1 && word.top >= html.bottom - 1 && html.inside && html.reachable && !html.cut && html.live, { md, html, word });
    check(`${label} - le texte de la ligne tient les contrastes de la charte (>= 4,5:1)`, html.contrast >= 4.5, html.contrast);
    await snap('menu');
    await parkMouse(page);

    // 2) Le vrai sélecteur : un seul fichier, réduit au HTML ; annuler ne change rien.
    const before = await statusOf(page);
    const { chooser: chooser1 } = await pickFile(page, null);
    check(`${label} - un vrai clic sur la ligne ouvre le vrai sélecteur de fichier`, !!chooser1);
    if (!chooser1) return;
    const accept = await chooser1.element().getAttribute('accept');
    check(`${label} - le sélecteur est réduit aux fichiers HTML (pas aux classeurs ni au Markdown), pour un seul fichier`, !chooser1.isMultiple() && /\.html\b/.test(accept) && /\.htm\b/.test(accept) && !/xlsx|\.md\b/.test(accept), { accept, multiple: chooser1.isMultiple() });
    await chooser1.element().evaluate(el => el.dispatchEvent(new Event('cancel')));
    await sleep(500);
    const afterCancel = await statusOf(page);
    const leftovers = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    check(`${label} - annuler dans le sélecteur ne change rien : même message d'état, aucune fenêtre, aucun champ de fichier oublié`, afterCancel.text === before.text && !(await dialogState(page)).shown && leftovers === 0, { before: before.text, afterCancel: afterCancel.text, leftovers });

    // 3) Le fichier choisi devient le document ; le compte rendu dit ce qui n'a pas été repris.
    const first = await pickFile(page, htmlFile('note-de-service.html', savedPage('Note de service')));
    check(`${label} - le sélecteur s'ouvre de nouveau`, !!first.chooser);
    await settle(page, /^$/);
    const report = await dialogState(page);
    check(`${label} - la fenêtre « ${T.reportTitle} » s'ouvre après la lecture, dans le panneau, avec sa phrase d'introduction et UNE LIGNE PAR GENRE, en entier`,
      report.shown && report.title === T.reportTitle && report.inPanel && report.text.includes(T.reportIntro) && T.reportLines.every(line => (report.message + report.text).includes(line)), report);
    check(`${label} - rien n'était à enregistrer : aucune question avant la fenêtre`, !first.askedBefore.shown && !report.buttons.includes(T.discard), report.buttons);
    await snap('compte-rendu');
    const closed = await clickDialogButton(page, report.buttons[report.buttons.length - 1]);
    check(`${label} - le bouton de la fenêtre est atteignable à la souris, dans le panneau, et la ferme`, !!closed && closed.reachable && closed.inPanel && !(await dialogState(page)).shown, closed);
    const done = await statusOf(page);
    check(`${label} - le coin d'état dit « ${T.imported} », en entier, sans être coupé, dans le panneau`, done.text === T.imported && !done.error && !done.clipped && done.inPanel, done);
    const imported = await snapshot(page);
    check(`${label} - le document est un nouveau modèle sans nom, avec le titre de la page`, imported.title === 'Note de service' && !imported.modelId && imported.select === '' && imported.name === '', { title: imported.title, id: imported.modelId, select: imported.select, name: imported.name });
    const shown = [];
    for (const selector of ['.tiptap h1', '.tiptap ul', '.tiptap table', '.tiptap img.editor-image']) shown.push(await reachableInDocument(page, selector));
    check(`${label} - titre, liste, tableau et image sont visibles et atteignables à la souris`, shown.every(s => s.shown && s.reachable), shown.filter(s => !(s.shown && s.reachable)));
    const content = await page.evaluate(([placeholder]) => {
      const spanOf = text => Array.from(document.querySelectorAll('.tiptap span')).find(s => s.textContent === text);
      const lead = spanOf('Chapeau en couleur.');
      const cell = Array.from(document.querySelectorAll('.tiptap td')).find(c => c.textContent.trim() === 'Stylo');
      return {
        titleColor: (spanOf('Note de service') || { style: {} }).style.color, leadColor: lead && lead.style.color, leadBold: !!lead && !!(lead.querySelector('strong') || lead.closest('strong')),
        cellFill: cell && cell.style.backgroundColor, text: document.querySelector('.tiptap').textContent,
        nested: document.querySelectorAll('.tiptap ul ul li').length, images: document.querySelectorAll('.tiptap img.editor-image').length, placeholder: document.querySelector('.tiptap').textContent.includes(placeholder),
        pwn: window.__htmlImportMousePwn === undefined,
      };
    }, [T.placeholder]);
    check(`${label} - la feuille de style est reprise : titre bleu, chapeau orange en gras, case à fond crème`, content.titleColor === 'rgb(0, 0, 145)' && content.leadColor === 'rgb(179, 64, 0)' && content.leadBold && content.cellFill === 'rgb(255, 244, 214)', content);
    check(`${label} - le menu, la colonne et le pied du site restent du texte ; l'élément caché n'y est pas ; la liste a son sous-point ; mot « image non reprise » pour l'image d'à côté, une image gardée`,
      /Intranet de la direction/.test(content.text) && /Accueil/.test(content.text) && /Pied du site/.test(content.text) && !/Texte caché par la page/.test(content.text) && content.nested === 1 && content.placeholder && content.images === 1, content);
    check(`${label} - le programme de la page ne s'est pas exécuté`, content.pwn);
    await page.evaluate(() => { const c = document.getElementById('editor-container'); if (c) c.scrollTop = 0; window.scrollTo(0, 0); });
    await sleep(300);
    await snap('document');

    // 4) Le document est « à enregistrer » : la question vient APRÈS le choix du fichier et sa lecture ; Annuler garde le document, Ne pas enregistrer importe.
    const second = await pickFile(page, htmlFile('second.html', savedPage('Second document')));
    check(`${label} - (document à enregistrer) le sélecteur s'ouvre sans poser de question avant le choix du fichier`, !!second.chooser && !second.askedBefore.shown, second.askedBefore);
    await settle(page, /^$/);
    const asked = await dialogState(page);
    check(`${label} - la fenêtre « ${T.unsaved} » s'ouvre après le choix du fichier, avec « ${T.discard} » et « ${T.cancel} », et le coin d'état n'annonce plus la lecture`,
      asked.shown && asked.title === T.unsaved && asked.buttons.includes(T.discard) && asked.buttons.includes(T.cancel) && !T.reading.test((await statusOf(page)).text), asked);
    const cancelled = await clickDialogButton(page, T.cancel);
    const kept = await snapshot(page);
    check(`${label} - « ${T.cancel} » : atteignable, la fenêtre se ferme, le premier document reste tel quel`, !!cancelled && cancelled.reachable && !(await dialogState(page)).shown && kept.title === 'Note de service' && kept.html === imported.html, { cancelled, title: kept.title });
    await pickFile(page, htmlFile('second.html', savedPage('Second document')));
    await settle(page, /^$/);
    const discarded = await clickDialogButton(page, T.discard);
    check(`${label} - « ${T.discard} » est atteignable à la souris dans le panneau`, !!discarded && discarded.reachable && discarded.inPanel, discarded);
    await settle(page, /^$/);
    const secondReport = await dialogState(page);
    if (secondReport.shown) await clickDialogButton(page, secondReport.buttons[secondReport.buttons.length - 1]);
    const replaced = await snapshot(page);
    check(`${label} - « ${T.discard} » : le second fichier remplace le document, son compte rendu est lu`, replaced.title === 'Second document' && secondReport.shown && secondReport.title === T.reportTitle, { title: replaced.title, report: secondReport.title });

    // 5) Les fichiers refusés : un message clair en rouge, aucune fenêtre, le document ne bouge pas.
    const refused = async (name, buffer, expected) => {
      await pickFile(page, { name, mimeType: 'text/html', buffer });
      await settle(page, expected);
      const after = await statusOf(page);
      const dialog = await dialogState(page);
      const now = await snapshot(page);
      return { after, dialog, unchanged: now.html === replaced.html && now.zones === replaced.zones };
    };
    const binary = await refused('programme.html', Buffer.from([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3]), /HTML lisible|readable HTML/);
    check(`${label} - un fichier binaire : « ${T.unreadable} » en rouge, sans fenêtre, le document ne bouge pas`, binary.after.text === T.unreadable && binary.after.error && !binary.dialog.shown && binary.unchanged && !binary.after.clipped, binary);
    const empty = await refused('vide.html', Buffer.from('<html><body>  \n </body></html>'), /vide|empty/);
    check(`${label} - une page vide : « ${T.empty} » en rouge, sans fenêtre, le document ne bouge pas`, empty.after.text === T.empty && empty.after.error && !empty.dialog.shown && empty.unchanged && !empty.after.clipped, empty);
    const big = await refused('gros.html', Buffer.alloc(10 * 1024 * 1024 + 1, 0x61), /trop gros|too big/);
    check(`${label} - un fichier de plus de 10 Mo : sa taille et la limite sont dites, en rouge, sans fenêtre, le document ne bouge pas`, T.tooBig.test(big.after.text) && big.after.error && !big.dialog.shown && big.unchanged && !big.after.clipped, big);
    const much = await refused('long.html', Buffer.from('<p>' + 'a'.repeat(2000001) + '</p>'), /trop de texte|too much text/);
    check(`${label} - plus de 2 millions de caractères de texte : le nombre et la limite sont dits, en rouge, sans fenêtre, le document ne bouge pas`, T.tooMuch.test(much.after.text) && much.after.error && !much.dialog.shown && much.unchanged && !much.after.clipped, much);
    await snap('refused');

    // 6) Le geste complet : un document exporté en HTML (menu « Type d'export », bouton Exporter) puis importé redonne ses objets.
    await page.evaluate((png) => {
      const row = (done, text) => `<li data-checked="${done}" data-type="taskItem"><label><input type="checkbox"${done ? ' checked="checked"' : ''}><span></span></label><div><p>${text}</p></div></li>`;
      Editor.setHTML('<h1>Conditions</h1><div class="callout" data-color="amber" data-icon="warning"><p>Attention</p></div><ul data-type="taskList">' + row(true, 'Fait') + row(false, 'À faire') + '</ul>'
        + '<p>Le contrat<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Voir l\'annexe 1."></sup> règle.</p>'
        + '<div class="two-columns-zone" style="--layout-left: 40%"><div class="two-columns-column"><p>Gauche</p></div><div class="two-columns-column"><p>Droite</p></div></div><p data-caption="true">Légende</p>'
        + `<p><img class="editor-image" src="${png}" data-align="right" style="width: 60px" alt="Pastille"></p>`);
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>En-tête du document</p>', first: '' }, footer: { default: '<p>Pied du document</p>', first: '' } });
    }, PNG);
    await sleep(400);
    const exported = await downloadOf(page, `html-import-${lang}-${theme}`, async () => {
      await chooseExportType(page, 'html');
      await chooseExportLines(page, 'one');
      await click(page, '#btn-export-pdf');
    });
    const exportedText = await readFile(exported.file, 'utf8');
    check(`${label} - l'export HTML du document est un .html qui porte son encadré, ses cases, ses colonnes, sa note, son en-tête et son pied`,
      /\.html$/.test(exported.suggested) && /pp-callout/.test(exportedText) && /pp-tasks/.test(exportedText) && /pp-columns/.test(exportedText) && /pp-fnref/.test(exportedText) && /En-tête du document/.test(exportedText) && /Pied du document/.test(exportedText), { suggested: exported.suggested });
    await pickFile(page, htmlFile(exported.suggested, exportedText));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await settle(page, /^$/);
    const roundTripReport = await dialogState(page);
    check(`${label} - le fichier exporté par le widget n'a rien à dire : aucune fenêtre de compte rendu`, !roundTripReport.shown || roundTripReport.title === T.unsaved ? !roundTripReport.shown : false, roundTripReport.title);
    const back = await page.evaluate(() => {
      const zones = Editor.getHeaderFooterData();
      const root = new DOMParser().parseFromString('<body>' + Editor.getHTML() + '</body>', 'text/html').body;
      const tasks = Array.from(root.querySelectorAll('ul[data-type="taskList"] > li')).map(li => li.getAttribute('data-checked') + ':' + li.querySelector('p').textContent.trim());
      const callout = root.querySelector('div.callout');
      const columns = root.querySelector('.two-columns-zone');
      const note = root.querySelector('sup.footnote-ref-marker');
      const image = root.querySelector('img.editor-image');
      return {
        callout: callout && [callout.dataset.color, callout.dataset.icon].join('/'), tasks: tasks.join('|'), columns: columns && columns.querySelectorAll('.two-columns-column').length, left: columns && columns.getAttribute('style'),
        note: note && note.getAttribute('data-note-text'), caption: Array.from(root.querySelectorAll('p[data-caption="true"]')).map(p => p.textContent).join('|'),
        image: image && [image.getAttribute('data-align'), image.getAttribute('style')].join('/'), header: zones.header.default, footer: zones.footer.default, enabled: zones.enabled,
      };
    });
    check(`${label} - le fichier exporté, importé de nouveau, redonne l'encadré ambre, les cases, les deux colonnes (40 %), la note, la légende, l'image à droite et l'en-tête et le pied de page`,
      back.callout === 'amber/warning' && back.tasks === 'true:Fait|false:À faire' && back.columns === 2 && /40%/.test(back.left) && back.note === 'Voir l\'annexe 1.' && back.caption === 'Légende' && /^right\//.test(back.image)
      && /60px/.test(back.image) && /En-tête du document/.test(back.header) && /Pied du document/.test(back.footer) && back.enabled, back);
    await snap('aller-retour');

    // 7) Le DÉPÔT d'un .html sur un document ouvert : la fenêtre à quatre choix ; « Ajouter après » met la page à la fin ; le compte rendu suit.
    await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setContent('<p>Début du texte</p><p>Fin du texte</p>'); ed.commands.focus('start'); });
    await sleep(500);
    await page.evaluate(() => { document.getElementById('template-name').value = 'Mon modèle'; });
    const dropped = await dropFile(page, 'note-de-service.html', savedPage('Page déposée'));
    await sleep(900);
    const choose = await dialogState(page);
    check(`${label} - un .html déposé sur un document ouvert : la fenêtre à quatre choix s'ouvre (« ${T.drop.nw} », « ${T.drop.after} »...) et le navigateur n'ouvre pas le fichier`,
      dropped.dropPrevented && choose.shown && choose.buttons.includes(T.drop.nw) && choose.buttons.includes(T.drop.after) && choose.buttons.length >= 4, { dropped, choose });
    await snap('depot');
    await clickDialogButton(page, T.drop.after);
    await settle(page, /^$/);
    const merged = await dialogState(page);
    check(`${label} - « ${T.drop.after} » : le compte rendu de la page est lu après l'ajout`, merged.shown && merged.title === T.reportTitle, merged);
    if (merged.shown) await clickDialogButton(page, merged.buttons[merged.buttons.length - 1]);
    const after = await snapshot(page);
    check(`${label} - « ${T.drop.after} » : le texte d'avant reste, la page déposée est à la fin, le modèle garde son nom`,
      after.text.startsWith('Début du texteFin du texte') && /Page déposée/.test(after.text) && after.name === 'Mon modèle', { text: after.text.slice(0, 80), name: after.name });
    check(`${label} - aucune erreur de page, aucune boîte du navigateur`, realErrors(w).length === 0 && w.dialogs.length === 0, { errors: realErrors(w), dialogs: w.dialogs });
  } finally {
    await w.close();
  }
}

await run('light', 'fr');
await run('dark', 'fr');
await run('light', 'en');
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
