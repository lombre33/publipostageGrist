#!/usr/bin/env node
// Import d'un fichier Markdown (js/markdown-import.js, ligne « Importer un Markdown… » du menu « + ») à la VRAIE souris et avec un VRAI sélecteur de fichier (page.waitForEvent('filechooser') :
// Chromium n'ouvre le sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist d'Antoine (~700x400), en thème clair, sombre puis en anglais.
// dev-tests/scenarios-markdown-import.js (groupe « markdownImport ») vérifie ce que l'import écrit, DANS la page ; une page.evaluate ne déclenche ni le survol d'un menu, ni un geste « trusted »,
// ni un vrai sélecteur de fichier : c'est ici qu'on s'assure que
//   - « + » ouvre son menu au survol et la ligne « Importer un Markdown… » (« Import from Markdown… ») y suit « Importer un Excel… », entière dans le panneau, que rien ne recouvre, lisible (F5) ;
//   - un vrai clic sur la ligne ouvre le vrai sélecteur, réduit aux fichiers Markdown, pour un seul fichier ; annuler dans le sélecteur ne change rien (ni message, ni fenêtre, rien ne reste dans la page) ;
//   - le fichier choisi devient un document visible dans l'éditeur ET enregistré dans Grist sous le nom de son fichier (une ligne de plus dans la table, relue) : titre, encadré, liste à cases, tableau, note de
//     bas de page, image, atteignables à la souris ; son en-tête et son pied de page (ceux que l'export écrit entre commentaires) sont ceux du document ; le coin d'état commence par « Enregistré dans Grist sous
//     « nom » » puis dit ce qui s'est passé (et combien d'images n'ont pas été reprises) ; trop long pour le coin, il se lit en entier dans la bulle de survol ; un nom déjà pris devient « nom (2) » ;
//   - un document modifié et pas enregistré (l'enregistrement automatique est coupé dans ce test) : « Modifications non enregistrées » vient APRÈS le choix du fichier et sa lecture (un fichier refusé ne demande
//     rien) ; « Annuler » garde le document, « Abandonner » importe ;
//   - un fichier binaire, vide ou de plus de 10 Mo : un message clair en rouge, rien ne change, aucune fenêtre ;
//   - le geste complet, d'un bout à l'autre : le document exporté en Markdown (menu « Type d'export », bouton Exporter) puis importé redonne le même texte, le même HTML (à l'identifiant des notes près) et les
//     mêmes en-tête et pied ;
//   - le geste complet d'un modèle, variables comprises : le type « Markdown (modèle) » (menu « Type d'export », bouton Exporter) écrit les bulles {{Table.Colonne}} et leurs réglages, le fichier importé
//     redonne les mêmes bulles ; une clé qui n'est pas une variable du document reste du texte et le coin d'état le dit (avec les images non reprises), en entier, sans être coupé ;
//   - depuis une grille ou un email ouverts (« + » puis « Nouvelle grille » / « Nouvel email »), l'import quitte ce modèle et le document s'affiche sur sa page.
// Lancé par run-headless.mjs (groupe Node « mdImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-md-import-mouse.mjs
// MD_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { open, sleep, click, hoverRow, clickHoverRow, status, downloadOf, chooseExportType, chooseExportLines, fire, makeUnsaved } from './load-lib.mjs';

const PORT = Number(process.env.MD_IMPORT_MOUSE_PORT || 9040);
const SHOTS = process.env.MD_IMPORT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-md';
const WIDTH = 700;
const HEIGHT = 400;

const TEXTS = {
  fr: {
    row: 'Importer un Markdown…', excel: 'Importer un Excel…', unsaved: 'Modifications non enregistrées', discard: 'Ne pas enregistrer', cancel: 'Annuler',
    reading: /^Lecture du fichier Markdown/, savedAs: name => `Enregistré dans Grist sous « ${name} ». `, savedTwice: name => `Enregistré dans Grist sous « ${name} » (le nom existait déjà). `, imported: 'Markdown importé.',
    importedImages: 'Markdown importé ; 1 image non reprise (fichier à côté ou adresse web).',
    unreadable: 'Ce fichier n’est pas un texte Markdown lisible.', empty: 'Ce fichier Markdown est vide : il n’y a rien à importer.',
    tooBig: /^Ce fichier est trop gros pour être importé : 10,1 Mo \(au plus 10 Mo\)\.$/, placeholder: '[image non reprise : Logo]',
    mdTemplate: 'Markdown (modèle)', templateExported: 'Modèle exporté en Markdown, variables comprises.',
    importedVariable: 'Markdown importé ; 1 variable inconnue laissée en texte.',
    importedImageVariables: 'Markdown importé ; 1 image non reprise, 2 variables inconnues.',
  },
  en: {
    row: 'Import from Markdown…', excel: 'Import from Excel…', unsaved: 'Unsaved changes', discard: 'Don’t save', cancel: 'Cancel',
    reading: /^Reading the Markdown file/, savedAs: name => `Saved to Grist as “${name}”. `, savedTwice: name => `Saved to Grist as “${name}” (the name was already taken). `, imported: 'Markdown imported.',
    importedImages: 'Markdown imported; 1 image not imported (file alongside or web address).',
    unreadable: 'This file is not readable Markdown text.', empty: 'This Markdown file is empty: there is nothing to import.',
    tooBig: /^This file is too big to import: 10\.1 MB \(at most 10 MB\)\.$/, placeholder: '[image not imported: Logo]',
    mdTemplate: 'Markdown (template)', templateExported: 'Template exported to Markdown, variables included.',
    importedVariable: 'Markdown imported; 1 unknown variable left as text.',
    importedImageVariables: 'Markdown imported; 1 image not imported, 2 unknown variables.',
  },
};

// Le fichier d'un jour de réunion : en-tête YAML (ignoré), titre, encadré GitHub, texte aux marques et note de bas de page, liste à cases, tableau aux colonnes alignées, une image qui n'est pas en
// ligne (non reprise : depuis le 24/11 une adresse web ne l'est pas non plus), une image intégrée, puis l'en-tête et le pied de page entre les commentaires que l'export du widget écrit.
const doc = (...lines) => lines.join('\n') + '\n';
const meeting = title => doc('---', 'title: Compte rendu', 'tags: [reunion]', '---', '', `# ${title}`, '', '> [!NOTE]', '> Document importé depuis un fichier Markdown.', '',
  'Les **points clés** du *12 octobre*, avec une note[^1] et ~~un ancien plan~~.', '', '## Décisions', '', '- [x] Envoyer le compte rendu', '- [ ] Relancer les absents', '',
  '| Nom | Quantité |', '| --- | ---: |', '| Stylo | 3 |', '', '![Logo](images/logo.png)', '', `![Plan](${PNG})`, '', '[^1]: La note de bas de page.', '',
  '<!-- publipostage:header -->', '', 'En-tête du fichier', '', '<!-- /publipostage:header -->', '', '<!-- publipostage:footer -->', '', 'Pied du fichier', '', '<!-- /publipostage:footer -->');
const mdFile = (name, text) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8') });

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e) && !/\[main\] import Markdown impossible/.test(e));

// Ce qu'un menu montre pour chaque sélecteur : texte, place dans le panneau, ce qui le recouvre, texte coupé, contraste de son texte sur son fond opaque.
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
// `whole` : le texte se lit en entier, dans le coin ou, quand il est trop long pour lui (il finit alors par « … »), dans sa bulle de survol (`title`, posée à l'entrée de la souris).
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
const dialogState = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  const shown = !!ov && getComputedStyle(ov).display !== 'none';
  return { shown, title: shown ? (ov.querySelector('h3') || {}).textContent || '' : '', buttons: shown ? Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent.trim()) : [] };
});
// Un bouton de la fenêtre « Modifications non enregistrées » par son texte, au vrai clic (atteignable, dans le panneau).
async function clickDialogButton(page, text) {
  const target = await page.evaluate(label => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const button = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => b.textContent.trim() === label);
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
// Ce que le document montre : texte, HTML (l'identifiant d'une note change à chaque lecture), en-tête et pied de page, nom du modèle.
const snapshot = page => page.evaluate(() => ({
  text: EditorCore.getEditor().state.doc.textContent,
  html: Editor.getHTML().replace(/data-note-id="[^"]*"/g, 'data-note-id=""'),
  zones: JSON.stringify(Editor.getHeaderFooterData()),
  title: (document.querySelector('.tiptap h1') || {}).textContent || '',
  modelId: Templates.getCurrentId(),
  select: document.getElementById('template-select').value,
}));
// Un élément du document est-il visible et atteignable à la souris ? Défilé jusqu'à lui, puis le point mesuré est le milieu de ce qu'on en voit dans la page de l'éditeur (une image plus haute que
// la place sous la barre d'outils n'est pas toute à l'écran : son haut passe sous la barre, comme pour une personne qui défile).
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

// Le geste complet pour désigner un fichier : « + » au survol, la ligne au vrai clic ; l'écoute du sélecteur est installée AVANT le clic (elle passe par un aller-retour avec le navigateur : sans lui,
// le premier sélecteur d'une page neuve peut passer inaperçu). `file` : { name, mimeType, buffer } ou null (le sélecteur reste ouvert). Rend { chooser, askedBefore } : le sélecteur (null s'il ne s'est pas
// ouvert) et l'état de la fenêtre de confirmation à l'instant où il s'ouvre, AVANT que le fichier soit choisi.
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
// Attend la fin de l'import : le message d'état (ou la fenêtre de confirmation) est là.
const settle = async (page, pattern) => {
  await page.waitForFunction(source => {
    const text = document.getElementById('status-msg').textContent;
    const ov = document.getElementById('pp-dialog-modal');
    return new RegExp(source).test(text) || (!!ov && getComputedStyle(ov).display !== 'none');
  }, pattern.source, { timeout: 20000 }).catch(() => {});
  await sleep(500);
};

// Attend que le coin d'état annonce l'enregistrement sous le nom du fichier `base` (le texte d'un import précédent ne compte pas : il ne porte pas ce nom).
const settleSaved = async (page, base) => {
  await page.waitForFunction(b => { const t = document.getElementById('status-msg').textContent; return t.includes('« ' + b) || t.includes('“' + b); }, base, { timeout: 20000 }).catch(() => {});
  await sleep(500);
};
// Ce que le coin d'état doit dire d'un fichier importé : « Enregistré dans Grist sous « nom » » (ou « (le nom existait déjà) » si le nom était pris : le document se nomme alors « nom (2) »), puis `what`.
const savedLine = async (page, T, fileName, what) => {
  const shown = await page.evaluate(() => document.getElementById('template-name').value.trim());
  const base = fileName.replace(/\.[^.]*$/, '');
  return { shown, base, text: (shown === base ? T.savedAs(shown) : T.savedTwice(shown)) + what, nameOk: shown === base || shown === base + ' (2)' };
};

async function run(theme, lang) {
  const label = lang === 'en' ? 'anglais' : theme === 'dark' ? 'sombre' : 'clair';
  const T = TEXTS[lang];
  console.log(`\n=== Import d'un fichier Markdown à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const w = await open({ spec: SPEC, theme, lang, port: PORT, storage: { pp_autosave_enabled: 'false' } }); // enregistrement automatique coupé : une modification reste « à enregistrer » jusqu'au geste de la personne
  const { page } = w;
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang === 'en' ? 'en' : theme}-${name}.png`) }); };
  try {
    await fire(page, 'PbClients', 1);

    // 1) Le menu « + » : la ligne suit « Importer un Excel… », dans le panneau, rien ne la recouvre, texte lisible, sur son fond de survol aussi.
    await hoverRow(page, PLUS, ROW);
    const [excel, md] = await rowsState(page, ['#v2-btn-import-xlsx', ROW]);
    check(`${label} - le menu « + » montre « ${T.row} » juste après « ${T.excel} », entière dans le panneau, atteignable, sans texte coupé`,
      !!md && md.text === T.row && excel.text === T.excel && md.top >= excel.bottom - 1 && md.inside && md.reachable && !md.cut && md.live, { excel, md });
    check(`${label} - le texte de la ligne tient les contrastes de la charte (>= 4,5:1), au repos et sous la souris`, md.contrast >= 4.5, md.contrast);
    const hovered = await hoveredState(page, ROW);
    check(`${label} - sous la souris, la ligne se peint de son fond de survol et reste lisible (>= 4,5:1)`, hovered.hovered && hovered.painted && hovered.contrast >= 4.5, hovered);
    await snap('menu');
    await parkMouse(page);

    // 2) Le vrai sélecteur : un seul fichier, réduit au Markdown ; annuler ne change rien et ne laisse rien dans la page.
    const before = await statusOf(page);
    const { chooser: chooser1 } = await pickFile(page, null);
    check(`${label} - un vrai clic sur la ligne ouvre le vrai sélecteur de fichier`, !!chooser1);
    if (!chooser1) return;
    const accept = await chooser1.element().getAttribute('accept');
    check(`${label} - le sélecteur est réduit aux fichiers Markdown (pas aux classeurs), pour un seul fichier`, !chooser1.isMultiple() && /\.md\b/.test(accept) && /\.markdown\b/.test(accept) && !/xlsx/.test(accept), { accept, multiple: chooser1.isMultiple() });
    await chooser1.element().evaluate(el => el.dispatchEvent(new Event('cancel'))); // ce que le navigateur envoie quand la personne ferme le sélecteur
    await sleep(500);
    const afterCancel = await statusOf(page);
    const leftovers = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    check(`${label} - annuler dans le sélecteur ne change rien : même message d'état, aucune fenêtre, aucun champ de fichier oublié dans la page`,
      afterCancel.text === before.text && !(await dialogState(page)).shown && leftovers === 0, { before: before.text, afterCancel: afterCancel.text, leftovers });

    // 3) Le fichier choisi devient le document : rien n'était à enregistrer, donc aucune question.
    const first = await pickFile(page, mdFile('compte-rendu.md', meeting('Compte rendu de la réunion')));
    check(`${label} - le sélecteur s'ouvre de nouveau`, !!first.chooser);
    await settle(page, /Markdown import/);
    const done = await statusOf(page);
    check(`${label} - le coin d'état commence par l'enregistrement sous le nom du fichier, dit que le Markdown est importé et qu'une image n'a pas été reprise (celle d'un fichier à côté : une adresse web ne l'est plus non plus), se lit en entier, dans le panneau`,
      done.text === T.savedAs('compte-rendu') + T.importedImages && !done.error && done.whole && done.inPanel, done);
    const rows1 = await stored(page);
    check(`${label} - le document est ENREGISTRÉ dans Grist sous le nom du fichier « compte-rendu » (une ligne, relue dans la table), sans que personne l'ait nommé ni enregistré`,
      rows1.length === 1 && rows1[0].name === 'compte-rendu' && rows1[0].length > 200, rows1);
    check(`${label} - rien n'était à enregistrer : aucune fenêtre n'a été posée, et une fois enregistré le document n'attend plus rien (aucune question pour quitter)`, !first.askedBefore.shown && !(await dialogState(page)).shown
      && await page.evaluate(() => !Templates.verifyStored || Templates.verifyStored(Templates.getCurrentId(), document.getElementById('template-name').value.trim()) === 'ok'));
    const imported = await snapshot(page);
    const nameShown = await page.evaluate(() => document.getElementById('template-name').value);
    check(`${label} - l'éditeur affiche le document enregistré : choisi dans la liste, nommé comme son fichier, avec le titre du fichier (l'en-tête YAML n'est pas du texte)`,
      imported.title === 'Compte rendu de la réunion' && imported.modelId === rows1[0].id && imported.select === String(rows1[0].id) && nameShown === 'compte-rendu' && !/tags:|title: Compte/.test(imported.text), { title: imported.title, id: imported.modelId, select: imported.select, nameShown });
    const shown = [];
    for (const selector of ['.tiptap h1', '.tiptap div.callout', '.tiptap ul[data-type="taskList"]', '.tiptap table', '.tiptap sup.footnote-ref-marker', '.tiptap img.editor-image']) shown.push(await reachableInDocument(page, selector));
    check(`${label} - titre, encadré, liste à cases, tableau, note de bas de page et image sont visibles et atteignables à la souris`, shown.every(s => s.shown && s.reachable), shown.filter(s => !(s.shown && s.reachable)));
    const content = await page.evaluate(([placeholder]) => ({
      callout: (document.querySelector('.tiptap div.callout') || { dataset: {} }).dataset.color,
      tasks: Array.from(document.querySelectorAll('.tiptap ul[data-type="taskList"] > li')).map(li => li.getAttribute('data-checked') + ':' + li.querySelector('p').textContent.trim()).join('|'),
      cells: Array.from(document.querySelectorAll('.tiptap table th, .tiptap table td')).map(c => c.textContent.trim()).join('|'),
      note: (/data-note-text="([^"]*)"/.exec(Editor.getHTML()) || [])[1] || null,
      strong: Array.from(document.querySelectorAll('.tiptap strong')).map(n => n.textContent).join('|'),
      placeholder: document.querySelector('.tiptap').textContent.includes(placeholder),
      images: document.querySelectorAll('.tiptap img.editor-image').length,
    }), [T.placeholder]);
    check(`${label} - le contenu : encadré bleu (NOTE), cases ${'true:Envoyer le compte rendu|false:Relancer les absents'}, tableau, texte de la note, gras, mot « image non reprise » à la place de l'image locale, une image gardée`,
      content.callout === 'blue' && content.tasks === 'true:Envoyer le compte rendu|false:Relancer les absents' && content.cells === 'Nom|Quantité|Stylo|3' && content.note === 'La note de bas de page.'
      && content.strong === 'points clés' && content.placeholder && content.images === 1, content);
    const zones = JSON.parse(imported.zones);
    check(`${label} - l'en-tête et le pied de page du fichier sont ceux du document`, zones.enabled && /En-tête du fichier/.test(zones.header.default) && /Pied du fichier/.test(zones.footer.default), zones);
    await page.evaluate(() => { document.querySelector('.tiptap').scrollIntoView({ block: 'start' }); const c = document.getElementById('editor-container'); if (c) c.scrollTop = 0; window.scrollTo(0, 0); });
    await sleep(300);
    await snap('document');

    // 4) Le document est maintenant « à enregistrer » (le nom retapé, enregistrement automatique coupé) : la question vient APRÈS le choix du fichier et sa lecture ; Annuler garde le document, Abandonner importe.
    await makeUnsaved(page);
    const edited = await snapshot(page);
    const second = await pickFile(page, mdFile('second.md', meeting('Second document')));
    check(`${label} - (document à enregistrer) le sélecteur s'ouvre sans poser de question avant le choix du fichier`, !!second.chooser && !second.askedBefore.shown, second.askedBefore);
    await settle(page, /^$/);
    const asked = await dialogState(page);
    check(`${label} - la fenêtre « ${T.unsaved} » s'ouvre après le choix du fichier, avec « ${T.discard} » et « ${T.cancel} »`, asked.shown && asked.title === T.unsaved && asked.buttons.includes(T.discard) && asked.buttons.includes(T.cancel), asked);
    check(`${label} - pendant la question, le coin d'état n'annonce plus la lecture du fichier (elle est finie)`, !T.reading.test((await statusOf(page)).text), await statusOf(page));
    await snap('question');
    const cancelled = await clickDialogButton(page, T.cancel);
    check(`${label} - « ${T.cancel} » est atteignable à la souris dans le panneau`, !!cancelled && cancelled.reachable && cancelled.inPanel, cancelled);
    const kept = await snapshot(page);
    check(`${label} - « ${T.cancel} » : la fenêtre se ferme et le premier document reste tel quel`, !(await dialogState(page)).shown && kept.title === 'Compte rendu de la réunion' && kept.html === imported.html && edited.html === imported.html, { shown: (await dialogState(page)).shown, title: kept.title });
    await pickFile(page, mdFile('second.md', meeting('Second document')));
    await settle(page, /^$/);
    const discarded = await clickDialogButton(page, T.discard);
    check(`${label} - « ${T.discard} » est atteignable à la souris dans le panneau`, !!discarded && discarded.reachable && discarded.inPanel, discarded);
    await settleSaved(page, 'second');
    const replaced = await snapshot(page);
    const rows2 = await stored(page);
    check(`${label} - « ${T.discard} » : le second fichier remplace le document ET s'enregistre sous son nom « second » (deux lignes dans la table), son message d'état est dit ; le premier, abandonné, garde son nom d'origine`,
      replaced.title === 'Second document' && (await statusOf(page)).text === T.savedAs('second') + T.importedImages && rows2.length === 2 && rows2[1].name === 'second' && rows2[0].name === 'compte-rendu',
      { title: replaced.title, status: (await statusOf(page)).text, rows2 });

    // 5) Les fichiers refusés : un message clair en rouge, aucune fenêtre (même avec un document à enregistrer), le document ne bouge pas, rien de plus n'est enregistré.
    await makeUnsaved(page);
    const refused = async (name, buffer, expected) => {
      await pickFile(page, { name, mimeType: 'text/plain', buffer });
      await settle(page, expected);
      const after = await statusOf(page);
      const dialog = await dialogState(page);
      const now = await snapshot(page);
      return { after, dialog, unchanged: now.html === replaced.html && now.zones === replaced.zones && (await stored(page)).length === 2 };
    };
    const binary = await refused('programme.md', Buffer.from([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3]), /Markdown lisible|readable Markdown/);
    check(`${label} - un fichier binaire : « ${T.unreadable} » en rouge, sans fenêtre, le document ne bouge pas`, binary.after.text === T.unreadable && binary.after.error && !binary.dialog.shown && binary.unchanged && !binary.after.clipped && binary.after.inPanel, binary);
    const empty = await refused('vide.md', Buffer.from('  \n\n \t\n'), /vide|empty/);
    check(`${label} - un fichier vide : « ${T.empty} » en rouge, sans fenêtre, le document ne bouge pas`, empty.after.text === T.empty && empty.after.error && !empty.dialog.shown && empty.unchanged && !empty.after.clipped, empty);
    const big = await refused('gros.md', Buffer.alloc(10 * 1024 * 1024 + 1, 0x61), /trop gros|too big/);
    check(`${label} - un fichier de plus de 10 Mo : sa taille et la limite sont dites, en rouge, sans fenêtre, le document ne bouge pas`, T.tooBig.test(big.after.text) && big.after.error && !big.dialog.shown && big.unchanged && !big.after.clipped, big);
    await snap('refused');

    // 5b) Un nom déjà pris : le même fichier importé de nouveau devient « second (2) », le coin d'état le dit, le premier « second » n'est pas touché (jamais écrasé).
    await makeUnsaved(page);
    await pickFile(page, mdFile('second.md', meeting('Second document')));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await settleSaved(page, 'second');
    const twice = await statusOf(page);
    const rows3 = await stored(page);
    check(`${label} - un nom déjà pris : le même fichier importé de nouveau s'enregistre sous « second (2) », le coin d'état dit que le nom existait déjà, le premier document n'est pas touché`,
      twice.text === T.savedTwice('second (2)') + T.importedImages && twice.whole && rows3.map(r => r.name).join('|') === 'compte-rendu|second|second (2)' && rows3[1].length === rows2[1].length, { twice, rows3 });

    // 6) Le geste complet, d'un bout à l'autre : exporter en Markdown (menu « Type d'export », bouton Exporter) puis importer ce fichier redonne le même document.
    await fire(page, 'PbClients', 1);
    const exported = await downloadOf(page, `md-import-${lang}-${theme}`, async () => {
      await chooseExportType(page, 'md');
      await chooseExportLines(page, 'one');
      await click(page, '#btn-export-pdf');
    });
    const exportedText = await readFile(exported.file, 'utf8');
    check(`${label} - l'export Markdown du document est un .md qui porte son titre, son encadré, ses cases, son tableau, sa note, son en-tête et son pied`,
      /\.md$/.test(exported.suggested) && /^# Second document$/m.test(exportedText) && /\[!NOTE\]/.test(exportedText) && /- \[x\] Envoyer le compte rendu/.test(exportedText) && /\| Nom \| Quantité \|/.test(exportedText)
      && /\[\^1\]: La note de bas de page\./.test(exportedText) && /publipostage:header/.test(exportedText) && /publipostage:footer/.test(exportedText), { suggested: exported.suggested, head: exportedText.slice(0, 200) });
    await pickFile(page, mdFile(exported.suggested, exportedText));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await settleSaved(page, exported.suggested.replace(/\.[^.]*$/, ''));
    const back = await snapshot(page);
    check(`${label} - le fichier exporté, importé de nouveau, redonne le même texte, le même HTML (aux identifiants de notes près) et les mêmes en-tête et pied`,
      back.text === replaced.text && back.html === replaced.html && back.zones === replaced.zones, { sameText: back.text === replaced.text, sameHtml: back.html === replaced.html, sameZones: back.zones === replaced.zones });
    // 6b) Le modèle, variables comprises : le type « Markdown (modèle) » écrit les bulles {{Table.Colonne}} (un réglage reste en HTML), le fichier importé redonne les mêmes bulles.
    const bubble = (column, extra) => `<span class="var-badge" contenteditable="false" data-table="PbClients" data-column="${column}" data-key="PbClients.${column}"${extra || ''}>#PbClients.${column}</span>`;
    await page.evaluate(html => {
      Editor.setHTML(html);
      Editor.setHeaderFooterData({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
    }, `<h1>Contrat ${bubble('Nom')}</h1><p>Bonjour <strong>${bubble('Nom')}</strong>, ${bubble('Nom', ' data-before="Dr "')}.</p>`);
    await sleep(300);
    const modelBefore = await snapshot(page);
    const modelExport = await downloadOf(page, `md-model-${lang}-${theme}`, async () => {
      await chooseExportType(page, 'mdTemplate');
      await click(page, '#btn-export-pdf');
    });
    const modelText = await readFile(modelExport.file, 'utf8');
    check(`${label} - « ${T.mdTemplate} » puis Exporter : un .md du modèle, ses bulles écrites {{PbClients.Nom}} (dans le titre et le gras) et celle qui a un réglage en HTML, sans valeur de ligne`,
      /\.md$/.test(modelExport.suggested) && /^# Contrat \{\{PbClients\.Nom\}\}$/m.test(modelText) && /\*\*\{\{PbClients\.Nom\}\}\*\*/.test(modelText) && /<span class="var-badge"[^>]* data-before="Dr ">/.test(modelText) && !/Alpha|Bravo/.test(modelText),
      { suggested: modelExport.suggested, text: modelText });
    const templateDone = await statusOf(page);
    check(`${label} - le coin d'état dit « ${T.templateExported} », en entier, sans être coupé, dans le panneau`, templateDone.text === T.templateExported && !templateDone.error && !templateDone.clipped && templateDone.inPanel, templateDone);
    const importModel = async (name, text, what) => {
      await makeUnsaved(page); // le document précédent, enregistré par son import, est modifié de nouveau : la question revient
      await pickFile(page, mdFile(name, text));
      await settle(page, /^$/);
      await clickDialogButton(page, T.discard);
      await settleSaved(page, name.replace(/\.[^.]*$/, ''));
      const line = await savedLine(page, T, name, what);
      return { snap: await snapshot(page), state: await statusOf(page), line };
    };
    const same = await importModel(modelExport.suggested, modelText, T.imported);
    check(`${label} - le fichier du modèle, importé de nouveau, redonne les mêmes bulles et le même HTML ; le coin d'état n'a rien à ajouter à « ${T.imported} » (que l'enregistrement sous le nom du fichier, suivi de « (2) » quand le nom est déjà pris)`,
      same.snap.html === modelBefore.html && same.snap.zones === modelBefore.zones && same.state.text === same.line.text && same.line.nameOk && same.state.whole, { sameHtml: same.snap.html === modelBefore.html, status: same.state.text, line: same.line });
    const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(b => b.dataset.key + (b.dataset.before ? '/' + b.dataset.before : '')).join('|'));
    check(`${label} - les trois bulles sont dans l'éditeur (la troisième avec son « Dr »)`, keys === 'PbClients.Nom|PbClients.Nom|PbClients.Nom/Dr ', keys);
    const oneUnknown = await importModel('inconnue.md', modelText + '\n{{AutreTable.Nom}}\n', T.importedVariable);
    check(`${label} - une clé qui n'est pas une variable du document reste du texte et le coin d'état le dit : « ${T.importedVariable} », en entier, sans être coupé, dans le panneau`,
      oneUnknown.state.text === oneUnknown.line.text && !oneUnknown.state.error && oneUnknown.state.whole && oneUnknown.state.inPanel && /\{\{AutreTable\.Nom\}\}/.test(oneUnknown.snap.text), { status: oneUnknown.state, text: oneUnknown.snap.text.slice(-60) });
    const mixed = await importModel('mixte.md', modelText + '\n{{AutreTable.Nom}} {{AutreTable.Ville}}\n\n![Logo](images/logo.png)\n', T.importedImageVariables);
    check(`${label} - avec une image locale en plus, une seule phrase : « ${T.importedImageVariables} », en entier, sans être coupée, dans le panneau`,
      mixed.state.text === mixed.line.text && !mixed.state.error && mixed.state.whole && mixed.state.inPanel, mixed.state);
    // 6c) Un fichier écrit sous Windows (Notepad++ : fins de ligne \r\n) : deux lignes l'une sous l'autre restent l'une sous l'autre dans le document importé (« je vois les sauts de ligne dans Notepad++,
    //     en important le fichier je les perds », 23/11 : marked les fondait en un blanc), la ligne vide sépare toujours les paragraphes, et le coin d'état n'a rien de plus à dire.
    const notepad = await importModel('notepad.md', ['# Notes du jour', 'Première ligne', 'Deuxième ligne', '', 'Autre paragraphe', 'suite', 'et fin', '', '- puce un', '  suite de la puce', '- puce deux', ''].join('\r\n'), T.imported);
    const lineShape = await page.evaluate(() => {
      // Le `<br>` de fin que ProseMirror pose dans un paragraphe vide (le paragraphe final que l'éditeur garde sous une liste) n'est pas un saut de ligne ; ce paragraphe vide n'est pas du contenu.
      const paragraphs = Array.from(document.querySelectorAll('.tiptap > p')).map(p => Array.from(p.childNodes).map(n => (n.nodeName === 'BR' ? (n.classList.contains('ProseMirror-trailingBreak') ? '' : '|') : n.textContent)).join('')).filter(Boolean);
      // Chaque ligne d'un paragraphe sur sa propre rangée à l'écran : le haut de la première lettre de chaque ligne.
      const tops = Array.from(document.querySelectorAll('.tiptap > p')).slice(0, 2).map(p => {
        const out = [];
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1); out.push(Math.round(r.getBoundingClientRect().top)); }
        return out;
      });
      return { paragraphs, tops, bullets: Array.from(document.querySelectorAll('.tiptap ul > li')).map(li => li.innerHTML.replace(/<\/?p>/g, '').replace(/<br[^>]*>/g, '|')) };
    });
    check(`${label} - un fichier Notepad++ (fins de ligne Windows) : « Première ligne|Deuxième ligne » et « Autre paragraphe|suite|et fin » restent des lignes séparées, deux paragraphes, aucun de plus`,
      lineShape.paragraphs.join('/') === 'Première ligne|Deuxième ligne/Autre paragraphe|suite|et fin' && notepad.state.text === notepad.line.text && !notepad.state.error, { lineShape: lineShape.paragraphs, status: notepad.state.text });
    check(`${label} - à l'écran, chaque ligne est sur sa propre rangée (la deuxième est plus bas que la première), et la suite d'une puce est une ligne de plus`,
      lineShape.tops[0].length === 2 && lineShape.tops[0][1] > lineShape.tops[0][0] + 5 && lineShape.tops[1].length === 3 && lineShape.tops[1][2] > lineShape.tops[1][1] + 5 && lineShape.tops[1][1] > lineShape.tops[1][0] + 5
      && lineShape.bullets.join('/') === 'puce un|suite de la puce/puce deux', lineShape);
    await snap('model');

    // 7) Depuis une grille, puis depuis un email (« + » puis « Nouvelle grille » / « Nouvel email » au vrai clic) : l'import quitte ce modèle, rien de la grille ni de l'email ne reste et le document s'affiche
    //    sur sa page. (Un macro-modèle ouvert se modifie dans une fenêtre qui recouvre la barre d'outils : « + » n'est pas à portée tant qu'elle est là.)
    const modelState = () => page.evaluate(() => {
      const shown = id => { const e = document.getElementById(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
      const r = (document.querySelector('.v2-page-sheet') || document.body).getBoundingClientRect();
      return {
        grid: GridEditor.isActive(), emailButton: shown('btn-create-email'), emailFields: shown('v2-email-fields-row'), title: (document.querySelector('.tiptap h1') || {}).textContent || '',
        page: document.getElementById('editor-container').classList.contains('a4-preview'), sheet: r.width > 300,
      };
    });
    for (const [kind, row, isOpen, isGone] of [
      ['une grille', '#v2-btn-new-grid', m => m.grid, m => !m.grid],
      ['un email', '#v2-btn-new-email', m => m.emailButton && m.emailFields, m => !m.emailButton && !m.emailFields],
    ]) {
      await makeUnsaved(page);
      await clickHoverRow(page, PLUS, row);
      await settle(page, /^$/);
      if ((await dialogState(page)).shown) await clickDialogButton(page, T.discard);
      await sleep(600);
      const opened = await modelState();
      await pickFile(page, mdFile('venu-de-ailleurs.md', doc('# Venu d’ailleurs', '', 'Un texte.')));
      await sleep(1500);
      if ((await dialogState(page)).shown) await clickDialogButton(page, T.discard);
      await settleSaved(page, 'venu-de-ailleurs');
      const imported = await modelState();
      check(`${label} - depuis ${kind} : l'import quitte ce modèle, le document s'affiche sur sa page`, isOpen(opened) && isGone(imported) && imported.title === 'Venu d’ailleurs' && imported.page && imported.sheet, { opened, imported });
    }
    // 7) Grist refuse d'écrire dans la table des documents : le document s'affiche quand même (rien n'est perdu), mais le coin d'état ne dit PAS « Enregistré dans Grist », il dit l'échec en rouge,
    // aucune ligne n'est écrite, et le document reste « à enregistrer » : la question « Modifications non enregistrées » se pose encore quand on le quitte.
    await makeUnsaved(page);
    const rowsBeforeRefusal = (await stored(page)).length;
    await page.evaluate(() => window.__gristStub.denyTable('Publipostage_Modeles', true));
    await pickFile(page, mdFile('refuse.md', meeting('Document refusé')));
    await settle(page, /^$/);
    await clickDialogButton(page, T.discard);
    await page.waitForFunction(() => document.getElementById('status-msg').classList.contains('error-msg'), null, { timeout: 20000 }).catch(() => {});
    await sleep(500);
    const refusedWrite = await statusOf(page);
    const refusedShown = await snapshot(page);
    const rowsRefused = await stored(page);
    await page.evaluate(() => window.__gristStub.denyTable('Publipostage_Modeles', false));
    await pickFile(page, mdFile('suite.md', meeting('Document suivant')));
    await settle(page, /^$/);
    const asksStill = await dialogState(page);
    await clickDialogButton(page, T.cancel);
    check(`${label} - Grist refuse d'écrire : le document s'affiche, le coin d'état le dit en rouge sans prétendre qu'il est enregistré, et aucune ligne n'est écrite`,
      refusedShown.title === 'Document refusé' && refusedWrite.error && !/Enregistré dans Grist|Saved to Grist/.test(refusedWrite.text) && refusedWrite.text.trim() !== '' && rowsRefused.length === rowsBeforeRefusal, { refusedWrite, title: refusedShown.title, rows: rowsRefused.length, rowsBeforeRefusal });
    check(`${label} - le document refusé reste à enregistrer : en importer un autre pose encore la question « ${T.unsaved} », et « ${T.cancel} » le garde`, asksStill.shown && asksStill.title === T.unsaved && (await snapshot(page)).title === 'Document refusé', { asksStill });

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
