#!/usr/bin/env node
// Ranger dans GFS les PDF que l'app exporte (consigne GFS 043 : js/pdf-delivery.js, `GfsLink.deposit` de js/gfs-link.js, js/pdf-export.js, js/main.js `exportRecordAs` / `finishBatchExport`), à la VRAIE souris et au vrai
// clavier, à 700x400 (le panneau de Grist), dans le cadre isolé de GFS (pas d'`allow-same-origin` : le choix de la personne vit alors dans l'espace que GFS garde pour l'app, pas dans le navigateur).
// Un GFS simulé (dev-tests/gfs-stub.js, page PARENTE du cadre) joue GFS : il sait `ranger` et répond comme lui (fichier gardé, copie « (1) » quand le nom est pris, refus). Ce script lit ce que la personne voit et ce que GFS reçoit.
//   LE MENU : « Exporter » porte, sous les options de lignes, l'intitulé « Destination du PDF » et trois lignes (Télécharger, Ranger dans GFS, Télécharger et ranger dans GFS), entières dans le panneau (le menu « Type
//    d'export » n'avait pas la place : son bas est à 490 px), atteignables à la souris, lisibles (>= 4,5:1), la coche DEVANT la ligne qui s'applique ; elles ne sont montrées que pour les deux PDF.
//   LE CHOIX : un vrai clic coche la ligne et GFS reçoit `stockage.ecrire { cle: pp_export_destination }` ; Ctrl + Z le défait et le dit au coin d'état, Ctrl + Y le remet ; Entrée et Espace marchent sur une ligne
//    qui a le focus ; rechargée, l'app retrouve le choix gardé chez GFS.
//   LE RANGEMENT : « Ranger dans GFS » + le bouton Exporter = un vrai PDF chez GFS sous son nom, AUCUN téléchargement, « PDF rangé dans GFS. » au coin d'état ; un nom pris reçoit la réponse de GFS (copie « (1) ») et
//    la dit ; « les deux » télécharge ET range ; si GFS ne garde pas le PDF (refus, GFS d'avant la consigne) il est téléchargé comme avant et la raison est dite, en rouge.
//   SEULE : les deux lignes qui rangent sont grisées (jamais retirées), avec leur raison ; un clic dessus ouvre la fenêtre qui dit qu'il faut Grist Factory Suite et ne coche rien ; l'export télécharge comme avant.
//   EN ANGLAIS, SOMBRE.
// Lancé par run-headless.mjs (groupe Node "gfsShelve", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-shelve.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-shelve', port: Number(process.env.GFS_SHELVE_PORT || 8918) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const RECORD = { id: 1, Nom: 'Marie', Statut: 'Urgent' };
const SEED = seedModels({ record: RECORD });
const KEY = 'pp_export_destination';
// L'espace que GFS garde pour l'app : la fenêtre des nouveautés y est déjà vue (le faux Grist sème `pp_news_seen` dans le navigateur, que le cadre isolé refuse : sans elle la fenêtre recouvrirait la page).
const SPACE = extra => Object.assign({ pp_news_seen: '99' }, extra || {});
const EXPORT_BUTTON = '#btn-export-pdf';
const FLYOUT = '#v2-export-pdf-flyout';
const ROW = value => FLYOUT + ' .v2-hover-row[data-destination="' + value + '"]';
const ROWS = ['download', 'gfs', 'both'].map(ROW);
const LABEL = FLYOUT + ' .v2-hover-flyout-label[data-i18n="destination.label"]';
const WORDS = {
  fr: { label: 'Destination du PDF', rows: ['Télécharger', 'Ranger dans GFS', 'Télécharger et ranger dans GFS'], off: 'Disponible dans Grist Factory Suite', undone: 'Réglage « Destination du PDF » : Télécharger.', redone: 'Réglage « Destination du PDF » : Ranger dans GFS.' },
  en: { label: 'PDF destination', rows: ['Download', 'Save to GFS', 'Download and save to GFS'] },
};

// Ce qu'une ligne montre : son texte, son état (cochée, grisée), sa place dans le panneau, ce qui la recouvre, le contraste de son texte et sa coche (visible, DEVANT le libellé).
const stateOf = (app, selectors) => app.evaluate(sels => {
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
      tick = { visible: pseudo.visibility === 'visible', inFront: range.getBoundingClientRect().left >= r.left + parseFloat(pseudo.width) };
    }
    return {
      sel, text: el.textContent.trim(), shown, bottom: Math.round(r.bottom), checked: el.getAttribute('aria-checked') === 'true', tick, title: el.getAttribute('title') || '',
      greyed: el.classList.contains('v2-hover-row-disabled') && el.getAttribute('aria-disabled') === 'true', live: !el.classList.contains('v2-hover-row-disabled') && !el.hasAttribute('aria-disabled'),
      inside: shown && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && el.contains(top), cut: el.scrollWidth > el.clientWidth + 1,
      contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100,
    };
  });
}, selectors);
const entire = rows => rows.every(r => r.shown && r.inside && r.reachable && !r.cut);
const readable = rows => rows.every(r => r.contrast >= 4.5);
const center = (app, sel) => app.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
// La souris vient de la gauche sur le bouton Exporter, le menu s'ouvre au survol, elle descend tout droit dedans puis va sur la ligne (le cadre de l'app est en (0, 0) de la page parente : mêmes coordonnées).
async function hoverRow(page, app, rowSel) {
  const p = await center(app, EXPORT_BUTTON);
  await page.mouse.move(p.x - 25, p.y);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await sleep(600);
  const r = await center(app, rowSel);
  if (!r || !r.w) throw new Error('ligne introuvable ou masquée : ' + rowSel);
  const inRow = Math.min(Math.max(p.x, r.x - r.w / 2 + 6), r.x + r.w / 2 - 6);
  await page.mouse.move(inRow, p.y + 10, { steps: 2 });
  await page.mouse.move(inRow, r.y, { steps: 6 });
  await page.mouse.move(r.x, r.y, { steps: 4 });
  await sleep(200);
  return r;
}
async function clickRow(page, app, rowSel) {
  const r = await hoverRow(page, app, rowSel);
  await page.mouse.click(r.x, r.y);
  await sleep(250);
  await page.mouse.move(5, 395);
  await sleep(200);
}
// Le bouton Exporter à la souris (la ligne affichée, un PDF), puis le coin d'état une fois l'export fini.
async function exportOne(page, app) {
  await app.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
  const b = await center(app, EXPORT_BUTTON);
  await page.mouse.move(b.x - 10, b.y, { steps: 2 });
  await page.mouse.click(b.x, b.y);
  const startedAt = Date.now();
  let said = '';
  while (Date.now() - startedAt < 60000) {
    said = await statusOf(app);
    if (/rangé dans GFS|non rangé|PDF généré|PDF generated|saved to GFS|not saved|downloaded/i.test(said.text)) break;
    await sleep(150);
  }
  await sleep(250);
  await page.mouse.move(5, 395);
  return statusOf(app);
}
const statusOf = app => app.evaluate(() => { const el = document.getElementById('status-msg'); return { text: el.textContent, error: el.className === 'error-msg' }; });
const stubOf = page => page.evaluate(() => ({
  stockage: window.__gfsStub.stockage, fichiers: window.__gfsStub.fichiers.map(f => ({ nom: f.nom, pdf: String.fromCharCode.apply(null, Array.from(f.octets.slice(0, 5))) === '%PDF-', taille: f.taille })),
  appels: window.__gfsStub.rangerAppels.map(c => ({ nom: c.nom, lot: c.lot, suivants: c.suivants, dossier: c.dossier, instance: c.instance, type: c.type })), ecritures: window.__gfsStub.calls.filter(c => c.nom === 'stockage.ecrire').map(c => c.args),
}));
const ticked = rows => rows.filter(r => r.checked).map(r => r.sel.replace(/.*data-destination="([a-z]+)".*/, '$1')).join();
async function undoRedo(page, app, key) {
  await app.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await sleep(150);
  await page.keyboard.press(key);
  await sleep(500);
}
function downloadsOf(page) {
  const files = [];
  page.on('download', d => files.push(d.suggestedFilename()));
  return files;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1) Dans le cadre isolé de GFS, français clair : le menu, le choix, le rangement, Ctrl + Z, le clavier.
console.log('\n[cadre isolé de GFS, français clair]');
{
  const { page, app } = await t.openPage({ hosted: true, framed: true, stub: { ranger: {}, stockage: SPACE() }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const downloads = downloadsOf(page);
  await hoverRow(page, app, ROW('gfs'));
  let rows = await stateOf(app, ROWS);
  const label = (await stateOf(app, [LABEL]))[0];
  check('le menu « Exporter » porte l’intitulé « ' + WORDS.fr.label + ' » et ses trois lignes (' + WORDS.fr.rows.join(', ') + ')', label.shown && label.text === WORDS.fr.label && rows.map(r => r.text).join('|') === WORDS.fr.rows.join('|'), { label: label.text, rows: rows.map(r => r.text) });
  check('les trois lignes sont entières dans le panneau 700x400 (la dernière finit avant le bas), sans texte coupé, atteignables à la souris, lisibles (>= 4,5:1)', entire(rows) && readable(rows), rows.map(r => ({ text: r.text, bottom: r.bottom, inside: r.inside, reachable: r.reachable, cut: r.cut, contrast: r.contrast })));
  check('au départ « Télécharger » est cochée, sa coche devant le libellé ; les deux autres sont actives (GFS range), sans info-bulle', ticked(rows) === 'download' && rows[0].tick && rows[0].tick.visible && rows[0].tick.inFront && rows[1].live && rows[2].live && !rows[1].title && !rows[2].title, rows);

  await clickRow(page, app, ROW('gfs'));
  await hoverRow(page, app, ROW('gfs'));
  rows = await stateOf(app, ROWS);
  let gfs = await stubOf(page);
  check('un vrai clic sur « Ranger dans GFS » la coche (et décoche l’autre)', ticked(rows) === 'gfs' && rows[1].tick && rows[1].tick.visible && rows[1].tick.inFront, rows);
  check('le choix de la personne est écrit dans l’espace que GFS garde pour l’app (`stockage.ecrire`, clé ' + KEY + '), pas dans le navigateur du cadre isolé', gfs.stockage && gfs.stockage[KEY] === 'gfs' && gfs.ecritures.some(a => a.cle === KEY && a.valeur === 'gfs'), gfs);
  await page.mouse.move(5, 395);

  const first = await exportOne(page, app);
  gfs = await stubOf(page);
  check('le bouton Exporter donne le PDF à GFS : « PDF rangé dans GFS. », aucun téléchargement', first.text === 'PDF rangé dans GFS.' && !first.error && downloads.length === 0, { first, downloads });
  check('GFS a reçu un vrai PDF (un File, `%PDF-`, un nom en .pdf, `suivants` 0, sans lot ni dossier)', gfs.fichiers.length === 1 && gfs.fichiers[0].pdf && /\.pdf$/.test(gfs.fichiers[0].nom) && gfs.fichiers[0].taille > 500
    && gfs.appels.length === 1 && gfs.appels[0].instance === 'File' && gfs.appels[0].type === 'application/pdf' && gfs.appels[0].suivants === 0 && gfs.appels[0].lot === undefined && gfs.appels[0].dossier === undefined, gfs);

  const second = await exportOne(page, app);
  gfs = await stubOf(page);
  const copyName = gfs.fichiers[0] ? gfs.fichiers[0].nom.replace(/\.pdf$/, '') + ' (1).pdf' : '?';
  check('même nom : GFS pose sa question, la réponse « Garder les deux » range « … (1).pdf » et le coin d’état le dit ; toujours aucun téléchargement',
    second.text === 'PDF rangé dans GFS sous le nom « ' + copyName + ' ».' && gfs.fichiers.map(f => f.nom).join('|') === gfs.fichiers[0].nom + '|' + copyName && downloads.length === 0, { second, copyName, files: gfs.fichiers.map(f => f.nom), downloads });

  await undoRedo(page, app, 'Control+z');
  await hoverRow(page, app, ROW('gfs'));
  rows = await stateOf(app, ROWS);
  gfs = await stubOf(page);
  let said = await statusOf(app);
  check('Ctrl + Z au vrai clavier rend « Télécharger » : la coche, l’espace de GFS et le coin d’état (« ' + WORDS.fr.undone + ' »)', ticked(rows) === 'download' && gfs.stockage[KEY] === 'download' && said.text === WORDS.fr.undone, { ticked: ticked(rows), stockage: gfs.stockage, said });
  await page.mouse.move(5, 395);
  await undoRedo(page, app, 'Control+y');
  await hoverRow(page, app, ROW('gfs'));
  rows = await stateOf(app, ROWS);
  gfs = await stubOf(page);
  said = await statusOf(app);
  check('Ctrl + Y remet « Ranger dans GFS » (la coche, l’espace de GFS, « ' + WORDS.fr.redone + ' »)', ticked(rows) === 'gfs' && gfs.stockage[KEY] === 'gfs' && said.text === WORDS.fr.redone, { ticked: ticked(rows), stockage: gfs.stockage, said });
  await page.mouse.move(5, 395);

  // Le clavier : le focus sur une ligne, Entrée la coche, Espace aussi.
  await hoverRow(page, app, ROW('both'));
  await app.evaluate(sel => document.querySelector(sel).focus(), ROW('both'));
  await page.keyboard.press('Enter');
  await sleep(300);
  rows = await stateOf(app, ROWS);
  check('Entrée sur « Télécharger et ranger dans GFS » (la ligne a le focus) la coche', ticked(rows) === 'both', rows.map(r => r.checked));
  await app.evaluate(sel => document.querySelector(sel).focus(), ROW('download'));
  await page.keyboard.press('Space');
  await sleep(300);
  rows = await stateOf(app, ROWS);
  gfs = await stubOf(page);
  check('Espace sur « Télécharger » la coche, et GFS en est averti', ticked(rows) === 'download' && gfs.stockage[KEY] === 'download', { ticked: ticked(rows), stockage: gfs.stockage });
  await page.mouse.move(5, 395);

  // « Les deux » : un téléchargement ET un rangement.
  await clickRow(page, app, ROW('both'));
  const filesBefore = (await stubOf(page)).fichiers.length;
  const both = await exportOne(page, app);
  gfs = await stubOf(page);
  check('« Télécharger et ranger dans GFS » : le PDF est téléchargé ET rangé (un fichier de plus chez GFS, une copie car le nom est pris)', downloads.length === 1 && /\.pdf$/.test(downloads[0]) && gfs.fichiers.length === filesBefore + 1 && /rangé dans GFS sous le nom/.test(both.text) && /PDF généré\.$/.test(both.text), { downloads, both, files: gfs.fichiers.length });

  // GFS ne garde pas le PDF : il est téléchargé comme avant, la raison est dite en rouge, au début.
  await clickRow(page, app, ROW('gfs'));
  await page.evaluate(() => { window.__gfsStub.ranger = { erreur: { code: 'GFS_ECHEC', message: 'Le serveur Grist ne répond pas.' } }; });
  const before = downloads.length;
  const failed = await exportOne(page, app);
  check('un refus de GFS (`GFS_ECHEC`) : le PDF est téléchargé comme avant, la raison est dite en rouge au début du coin d’état', downloads.length === before + 1 && failed.error && failed.text === 'GFS n’a pas gardé 1 PDF (Le serveur Grist ne répond pas) : téléchargé. PDF généré.', { downloads, failed });
  await page.evaluate(() => { window.__gfsStub.ranger = null; });
  const old = await exportOne(page, app);
  check('un GFS d’avant la consigne 043 (`GFS_INCONNU`) : le PDF est téléchargé, la raison dit que cette version de GFS ne range pas encore', downloads.length === before + 2 && old.error && /cette version de GFS ne range pas encore les fichiers/.test(old.text), { downloads, old });

  // Le type Word : la destination n'est pas là (elle ne vaut que pour les PDF).
  await app.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; document.getElementById('v2-btn-quality').closest('.v2-hover-group').dispatchEvent(new Event('mouseenter')); });
  await sleep(200);
  const b = await center(app, EXPORT_BUTTON);
  await page.mouse.move(b.x - 25, b.y);
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await sleep(500);
  rows = await stateOf(app, [LABEL, ...ROWS]);
  check('pour le type Word le menu « Exporter » ne montre ni l’intitulé ni les trois lignes', rows.every(r => !r.shown), rows.map(r => r.shown));
  await page.mouse.move(5, 395);
  await page.context().close();
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2) Rechargée : l'espace de GFS dit déjà « Télécharger et ranger dans GFS », la coche y est dès l'ouverture, sans un clic.
console.log('\n[l’app rouverte : le choix gardé chez GFS]');
{
  const { page, app } = await t.openPage({ hosted: true, framed: true, stub: { ranger: {}, stockage: SPACE({ [KEY]: 'both' }) }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  await hoverRow(page, app, ROW('both'));
  const rows = await stateOf(app, ROWS);
  check('rouverte, la coche est sur « Télécharger et ranger dans GFS » : le choix suit la personne (l’espace de GFS), sans un clic', ticked(rows) === 'both', rows.map(r => r.checked));
  await page.mouse.move(5, 395);
  await page.context().close();
}
{
  // Une valeur étrangère dans l'espace de GFS vaut l'origine.
  const { page, app } = await t.openPage({ hosted: true, framed: true, stub: { ranger: {}, stockage: SPACE({ [KEY]: 'n’importe quoi' }) }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  await hoverRow(page, app, ROW('download'));
  const rows = await stateOf(app, ROWS);
  check('une valeur étrangère gardée chez GFS vaut l’origine : « Télécharger » cochée', ticked(rows) === 'download', rows.map(r => r.checked));
  await page.mouse.move(5, 395);
  await page.context().close();
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 3) Seule (adresse sans `gfs=`) : rien à ranger. Les deux lignes qui rangent sont grisées avec leur raison, un clic explique, l'export télécharge comme avant.
console.log('\n[l’app seule]');
{
  const { page, app, natives } = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const downloads = downloadsOf(page);
  await hoverRow(page, app, ROW('gfs'));
  let rows = await stateOf(app, ROWS);
  check('seule : les trois lignes sont là, entières et lisibles ; « Télécharger » est cochée et active, les deux qui rangent sont grisées (jamais retirées) avec leur raison en info-bulle',
    entire(rows) && readable(rows) && ticked(rows) === 'download' && rows[0].live && rows[1].greyed && rows[2].greyed && rows[1].title === WORDS.fr.off && rows[2].title === WORDS.fr.off, rows);
  const r = await center(app, ROW('gfs'));
  await page.mouse.click(r.x, r.y);
  await sleep(500);
  const notice = await app.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const box = ov.querySelector('.modal-content').getBoundingClientRect();
    return { title: ov.querySelector('h3').textContent, message: ov.querySelector('.pp-dialog-message').textContent, inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
  });
  check('un clic sur la ligne grisée ouvre la fenêtre commune (dans le panneau) qui dit qu’il faut Grist Factory Suite', !!notice && notice.inside && /Grist Factory Suite/.test(notice.title + ' ' + notice.message), notice);
  await page.keyboard.press('Escape');
  await sleep(300);
  await hoverRow(page, app, ROW('gfs'));
  rows = await stateOf(app, ROWS);
  check('le clic sur la ligne grisée ne coche rien : « Télécharger » reste cochée', ticked(rows) === 'download', rows.map(x => x.checked));
  await page.mouse.move(5, 395);
  const plain = await exportOne(page, app);
  check('seule, le bouton Exporter télécharge le PDF comme avant (« PDF généré. », un fichier)', plain.text === 'PDF généré.' && !plain.error && downloads.length === 1 && /\.pdf$/.test(downloads[0]), { plain, downloads });
  check('aucune boîte native ouverte (alert, confirm, prompt)', natives.length === 0, natives);
  await page.context().close();
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 4) En anglais, sombre : les mots, la place, les contrastes.
console.log('\n[cadre isolé de GFS, anglais sombre]');
{
  const { page, app } = await t.openPage({ hosted: true, framed: true, stub: { ranger: {}, stockage: SPACE(), langue: 'en' }, seed: SEED, lang: 'en', colorScheme: 'dark' });   // chez GFS la langue est celle de GFS (consigne 019)
  await hoverRow(page, app, ROW('gfs'));
  const rows = await stateOf(app, ROWS);
  const label = (await stateOf(app, [LABEL]))[0];
  check('(anglais) l’intitulé « ' + WORDS.en.label + ' » et les lignes « ' + WORDS.en.rows.join(' », « ') + ' »', label.shown && label.text === WORDS.en.label && rows.map(r => r.text).join('|') === WORDS.en.rows.join('|'), { label: label.text, rows: rows.map(r => r.text) });
  check('(sombre) les trois lignes sont entières dans le panneau 700x400, atteignables, lisibles (>= 4,5:1), « Download » cochée', entire(rows) && readable(rows) && ticked(rows) === 'download', rows.map(r => ({ text: r.text, bottom: r.bottom, inside: r.inside, contrast: r.contrast })));
  await clickRow(page, app, ROW('both'));
  const stored = await stubOf(page);
  check('(anglais) un clic sur « ' + WORDS.en.rows[2] + ' » la coche et GFS garde le choix', stored.stockage[KEY] === 'both', stored.stockage);
  await page.mouse.move(5, 395);
  await page.context().close();
}

await t.finish();
