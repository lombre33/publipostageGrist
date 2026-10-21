#!/usr/bin/env node
// Les présentations, extension « diapositives » de Grist Factory Suite (js/slides-entry.js, js/extensions.js, js/templates.js, js/page-layout.js), à la vraie souris et au vrai clavier, 700x400,
// français clair puis anglais sombre. Une présentation est un modèle de type « presentation » du même éditeur que les documents, dont la page est une diapositive 16:9 en paysage ; GFS (simulé par
// dev-tests/gfs-stub.js) active l'extension ou non.
//  HÉBERGÉ, EXTENSION ACTIVE : la ligne « Nouvelle présentation » du menu « + » (entre « Nouveau macro-modèle » et « Nouvelle grille ») est utilisable et ouvre une présentation vierge, page 16:9 en
//   paysage (bouton de la page et case d'aperçu « 16:9 », feuille au rapport 16:9), jamais le ★ ; nommée au crayon et enregistrée, sa ligne porte TypeModele « presentation » et la page de la
//   diapositive ; la liste montre les présentations avec leur icône, ouvrables (une présentation sans page à elle s'ouvre en 16:9), leur étoile grisée avec sa raison ; l'appel `ouvrir` de GFS en ouvre une.
//  EXTENSION ÉTEINTE EN DIRECT (événement `extensions`) : la ligne du menu se grise avec sa raison, les présentations de la liste aussi ; celle qui est ouverte reste ouverte et s'enregistre sous son
//   type ; le clic sur la ligne grisée appelle `installer` de GFS (pas de fenêtre) ; rallumée, tout redevient utilisable.
//  SEUL (adresse sans `gfs=`) : la ligne est grisée avec sa raison (contraste d'au moins 4,5:1), son clic ouvre la fenêtre « il faut passer par GFS » (Échap la ferme), rien ne change.
// Lancé par run-headless.mjs (groupe Node "slidesGfs", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-gfs.mjs
// SLIDES_GFS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const SHOTS = process.env.SLIDES_GFS_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slides-gfs', port: Number(process.env.SLIDES_GFS_PORT || 8926) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const TEXTS = {
  fr: {
    row: 'Nouvelle présentation',
    reason: 'Demande l’extension Diapositives (Grist Factory Suite)',
    unsaved: 'Modèle non enregistré : donnez-lui un nom puis cliquez sur Enregistrer pour activer l’enregistrement automatique.',
    pageButton: 'Page 16:9 en paysage (passer en portrait)',
    preview: 'Aperçu 16:9',
    starTip: 'Un email, un macro-modèle ou une présentation ne peut pas être le modèle par défaut du document (pour une vue : Réglages > Vue)',
    noticeTitle: 'Cette fonction demande Grist Factory Suite',
    noticeMessage: '« Présentations » fait partie de l’extension « Diapositives », disponible quand Publipostage+ tourne dans Grist Factory Suite. Pour l’utiliser, passez par Grist Factory Suite.',
    close: 'Fermer',
    name: 'Ma présentation',
  },
  en: {
    row: 'New presentation',
    reason: 'Needs the Slides extension (Grist Factory Suite)',
    unsaved: 'Template not saved: name it and click Save to enable auto-save.',
    pageButton: '16:9 page in landscape (switch to portrait)',
    preview: '16:9 preview',
    starTip: 'An email, a macro-template or a presentation cannot be the document’s default template (for one view: Settings > View)',
    noticeTitle: 'This feature needs Grist Factory Suite',
    noticeMessage: '“Presentations” is part of the “Slides” extension, available when Publipostage+ runs inside Grist Factory Suite. To use it, go through Grist Factory Suite.',
    close: 'Close',
    name: 'My presentation',
  },
};

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Les outils d'une page ouverte : positions, visibilité réelle (dans le panneau et au premier plan), menu « + » et clics à la vraie souris.
function toolsOf(page) {
  const centerOf = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom };
  }, selector);
  const seen = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && !!top && (top === el || el.contains(top));
  }, selector);
  const click = async (selector) => {
    const c = await centerOf(selector);
    if (!c) throw new Error('introuvable : ' + selector);
    await page.mouse.move(c.x - 20, c.y); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(50);
    await page.mouse.click(c.x, c.y);
  };
  // Le menu « + » ouvert au survol, la souris posée sur la ligne `selector` (descendue du bouton jusqu'à elle, sans quitter le menu).
  const hoverPlusRow = async (selector) => {
    const plus = await centerOf('#btn-new');
    await page.mouse.move(plus.x - 25, plus.y); await page.mouse.move(plus.x, plus.y, { steps: 4 }); await sleep(600);
    const row = await centerOf(selector);
    if (!row || !row.w) throw new Error('ligne introuvable ou masquée : ' + selector);
    const inRow = Math.min(Math.max(plus.x, row.x - row.w / 2 + 6), row.x + row.w / 2 - 6);
    await page.mouse.move(inRow, plus.y + 10, { steps: 2 });
    await page.mouse.move(inRow, row.y, { steps: 6 });
    await page.mouse.move(row.x, row.y, { steps: 4 }); await sleep(200);
    return row;
  };
  const clickPlusRow = async (selector) => { const row = await hoverPlusRow(selector); await page.mouse.click(row.x, row.y); };
  // La souris s'en va dans un coin vide : le menu se referme.
  const leave = async () => { await page.mouse.move(690, 390, { steps: 5 }); await sleep(500); };
  return { centerOf, seen, click, hoverPlusRow, clickPlusRow, leave };
}

// La ligne « Nouvelle présentation » : son texte, ses voisines, grisée ou non (aria-disabled, classe, raison au survol, data-explains) et sa couleur sur le fond du menu.
const rowState = page => page.evaluate(() => {
  const row = document.getElementById('v2-btn-new-presentation');
  if (!row) return null;
  const flyout = document.getElementById('v2-new-template-flyout');
  const fr = flyout ? flyout.getBoundingClientRect() : null;
  return {
    label: row.textContent.trim(), prev: row.previousElementSibling && row.previousElementSibling.id, next: row.nextElementSibling && row.nextElementSibling.id,
    ariaDisabled: row.getAttribute('aria-disabled'), grey: row.classList.contains('v2-hover-row-disabled'), explains: row.hasAttribute('data-explains'), title: row.title,
    flyoutInPanel: !!fr && fr.height > 0 && fr.top >= -0.5 && fr.bottom <= innerHeight + 0.5 && fr.left >= -0.5 && fr.right <= innerWidth + 0.5,
  };
});
// La page du modèle ouvert : son format, son sens, son nom dans les phrases, le bouton de la page, la case d'aperçu et le rapport de la feuille.
const pageState = page => page.evaluate(() => {
  const size = PageLayout.getPageSizeMm();
  const btn = document.getElementById('btn-page-orientation');
  const preview = document.getElementById('v2-a4-toggle');
  const sheet = document.querySelector('#editor-container .v2-page-sheet');
  const r = sheet ? sheet.getBoundingClientRect() : null;
  return {
    format: PageLayout.getFormat(), orientation: PageLayout.getOrientation(), label: PageLayout.getFormatLabel(), ratio: Math.round((size.width / size.height) * 1000) / 1000,
    button: btn ? btn.getAttribute('aria-label') : null, buttonEnabled: !!btn && !btn.disabled, preview: preview ? preview.getAttribute('data-tip') : null,
    sheetWidth: r ? Math.round(r.width) : 0, sheetInPanel: !!r && r.left >= -0.5 && r.right <= innerWidth + 0.5,
  };
});
// Ce que la personne voit du modèle ouvert.
const shown = page => page.evaluate(() => ({
  current: Templates.getCurrentId(), name: document.getElementById('template-name').value, text: document.querySelector('.ProseMirror').textContent,
  status: document.getElementById('status-msg').textContent, star: document.getElementById('btn-set-default-template').disabled,
}));
// Une ligne de la table des modèles du faux Grist, colonne Margins lue.
const rowOf = (page, id) => page.evaluate((rowId) => {
  const row = window.__gristStub.getRow('Publipostage_Modeles', rowId);
  if (!row) return null;
  let margins = null;
  try { margins = row.Margins ? JSON.parse(row.Margins) : null; } catch (e) { margins = 'illisible'; }
  return { nom: row.Nom, type: row.TypeModele, contenu: row.Contenu, format: margins && margins.format, orientation: margins && margins.orientation };
}, id);
const lastModelId = page => page.evaluate(() => Math.max(...window.__gristStub.state.rows.Publipostage_Modeles.id));
// Les lignes de la liste des modèles (ouverte) : grisées ou non, leur raison, leur icône, leur étoile.
const listRows = (page, ids) => page.evaluate((wanted) => {
  const pop = document.querySelector('.tts-popup');
  const out = {};
  for (const id of wanted) {
    const row = pop && pop.querySelector('.tts-row-leaf[data-template-id="' + id + '"]');
    if (!row) { out[id] = null; continue; }
    const icon = row.querySelector('.tts-icon');
    const star = row.querySelector('.tts-star-btn');
    const reason = row.querySelector('.tts-row-reason');
    out[id] = {
      unavailable: row.classList.contains('is-unavailable'), reason: reason ? reason.textContent : null, iconClass: icon ? icon.className : '',
      starDisabled: !!star && star.getAttribute('aria-disabled') === 'true', starTitle: star ? star.title : null,
    };
  }
  return out;
}, ids);
const listOpen = page => page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && p.classList.contains('is-open'); });
// La fenêtre simple (Dialogs.notice) : ouverte ou non, ses textes, ses boutons visibles, où est le focus.
const dialogState = page => page.evaluate(() => {
  const modal = document.getElementById('pp-dialog-modal');
  if (!modal) return { open: false };
  const open = modal.style.display !== 'none' && modal.getBoundingClientRect().height > 0;
  const box = modal.querySelector('.pp-modal-box').getBoundingClientRect();
  const buttons = Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
  const message = modal.querySelector('#pp-dialog-message');
  const a = document.activeElement;
  return {
    open, title: modal.querySelector('#pp-dialog-title').textContent, message: message.hidden ? '' : message.textContent, buttons: buttons.map(b => b.textContent.trim()),
    focusInside: !!a && !!a.closest('#pp-dialog-modal'), inPanel: box.left >= -0.5 && box.top >= -0.5 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
  };
});
const extensionTraffic = requests => requests.filter(url => /\/extensions\/diapositives\//.test(url));
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Hébergé par GFS, l'extension active : créer, nommer, enregistrer, rouvrir ; puis GFS l'éteint et la rallume.
async function runHosted(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[hébergé ${lang} ${colorScheme}] `;
  const { page, requests, natives, context } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang, colorScheme });
  const { seen, click, hoverPlusRow, clickPlusRow, leave } = toolsOf(page);

  // --- Le menu « + » : la ligne est utilisable, à sa place, dans le panneau.
  await hoverPlusRow('#v2-btn-new-presentation');
  let row = await rowState(page);
  check(tag + 'la ligne « ' + T.row + ' » du menu « + » est entre « Nouveau macro-modèle » et « Nouvelle grille », dans le menu qui tient dans les 700x400',
    !!row && row.label === T.row && row.prev === 'v2-btn-new-macro' && row.next === 'v2-btn-new-grid' && row.flyoutInPanel && await seen('#v2-btn-new-presentation'), row);
  check(tag + 'extension active : la ligne n’est pas grisée (ni aria-disabled, ni classe, ni raison au survol)', !!row && row.ariaDisabled === 'false' && !row.grey && !row.explains && row.title === '', row);
  await snap(page, `menu-${lang}-${colorScheme}`);

  // --- Le clic ouvre une présentation vierge, page 16:9 en paysage.
  await clickPlusRow('#v2-btn-new-presentation');
  await sleep(800);
  await leave();
  let now = await shown(page);
  let p = await pageState(page);
  check(tag + 'le clic ouvre un modèle vierge, pas encore enregistré, que le coin d’état dit à nommer', now.current == null && now.text === '' && now.status === T.unsaved, now);
  check(tag + 'sa page est la diapositive 16:9 en paysage (33,87 x 19,05 cm), nommée « 16:9 » par le bouton de la page et la case d’aperçu',
    p.format === '190.5x338.7' && p.orientation === 'landscape' && p.label === '16:9' && Math.abs(p.ratio - 16 / 9) < 0.005 && p.button === T.pageButton && p.buttonEnabled && p.preview === T.preview, p);
  check(tag + 'la feuille de la diapositive tient dans le panneau', p.sheetWidth > 300 && p.sheetInPanel, p);
  check(tag + 'une présentation n’est jamais le ★ du document : le bouton est grisé', now.star === true, now);
  // Le code de l'extension (la bande des diapositives, dev-tests/verify-slides-strip.mjs) arrive avec la première présentation à l'écran, à la version du registre (js/extensions.js).
  await page.waitForFunction(() => { const strip = document.querySelector('.pp-slide-strip'); return !!strip && !strip.hidden; }, null, { timeout: 8000 }).catch(() => {});
  const traffic = extensionTraffic(requests).map(url => url.replace(/^.*\/extensions\//, 'extensions/')).sort();
  check(tag + 'les fichiers de l’extension arrivent une fois chacun, à la version du registre (extensions/diapositives/slide-strip.css et .js ?v=0.6), et sa bande se montre',
    JSON.stringify(traffic) === JSON.stringify(['extensions/diapositives/slide-strip.css?v=0.6', 'extensions/diapositives/slide-strip.js?v=0.6']) && await seen('.pp-slide-add'), traffic);
  await snap(page, `nouvelle-${lang}-${colorScheme}`);

  // --- Au clavier, un texte ; au crayon, un nom ; « Enregistrer » à la vraie souris : la ligne de la table est une présentation, avec sa page.
  await click('.ProseMirror');
  await page.keyboard.type('Bienvenue');
  await click('#btn-rename-template');
  await sleep(200);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(T.name);
  await page.keyboard.press('Enter');
  await click('#btn-save');
  await page.waitForFunction(() => Templates.getCurrentId() != null, null, { timeout: 5000 }).catch(() => {});
  await sleep(500);
  const savedId = await lastModelId(page);
  const saved = await rowOf(page, savedId);
  now = await shown(page);
  check(tag + 'enregistrée, sa ligne porte TypeModele « presentation », son nom, son texte et la page de la diapositive (format et sens dans Margins)',
    !!saved && saved.nom === T.name && saved.type === 'presentation' && /Bienvenue/.test(saved.contenu) && saved.format === '190.5x338.7' && saved.orientation === 'landscape' && String(now.current) === String(savedId), { saved, now });
  check(tag + 'son étoile reste grisée une fois enregistrée', now.star === true, now);

  // --- La liste : les présentations s'ouvrent, avec leur icône ; leur étoile est grisée et dit pourquoi.
  await click('.tts-trigger');
  await page.waitForSelector('.tts-popup.is-open', { timeout: 5000 }).catch(() => {});
  let rows = await listRows(page, [6, savedId, 2]);
  check(tag + 'la liste montre « Futur » et la nouvelle présentation ouvrables (ni grisées, ni raison), avec l’icône de la présentation',
    !!rows[6] && !!rows[savedId] && !rows[6].unavailable && !rows[savedId].unavailable && rows[6].reason === null && /tts-icon-presentation/.test(rows[6].iconClass) && /tts-icon-presentation/.test(rows[savedId].iconClass), rows);
  check(tag + 'leur étoile est grisée et dit qu’une présentation ne peut pas être le modèle par défaut ; celle d’un document ne l’est pas',
    rows[6].starDisabled && rows[savedId].starDisabled && rows[6].starTitle === T.starTip && !!rows[2] && !rows[2].starDisabled, rows);
  await snap(page, `liste-${lang}-${colorScheme}`);
  // « Futur » n'a pas de page à elle (colonne Margins vide) : elle s'ouvre en 16:9.
  const futur = await page.evaluate(() => { const r = document.querySelector('.tts-popup .tts-row-leaf[data-template-id="6"] .tts-row-label').getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; });
  await page.mouse.click(futur.x, futur.y);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '6', null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  now = await shown(page);
  p = await pageState(page);
  check(tag + 'un clic sur « Futur » l’ouvre ; sans page à elle, elle prend la diapositive 16:9 en paysage', now.name === 'Futur' && now.text === 'Contenu futur' && p.format === '190.5x338.7' && p.orientation === 'landscape', { now, p });

  // --- L'appel `ouvrir` de GFS ouvre une présentation comme un autre modèle.
  const toB = await page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '2', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }));
  const toSlides = await page.evaluate(id => window.__gfsStub.ouvrir({ fichier: { id: String(id), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), savedId);
  now = await shown(page);
  check(tag + 'GFS demande d’ouvrir « Départ B » puis la présentation : `{ ouvert: true }` les deux fois, la présentation est à l’écran',
    toB.type === 'reponse' && toB.data.ouvert === true && toSlides.type === 'reponse' && toSlides.data.ouvert === true && String(now.current) === String(savedId) && /Bienvenue/.test(now.text), { toB, toSlides, now });

  // --- GFS éteint l'extension : la ligne et les présentations de la liste se grisent ; celle qui est ouverte reste ouverte et s'enregistre sous son type.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await page.waitForFunction(() => document.getElementById('v2-btn-new-presentation').getAttribute('aria-disabled') === 'true', null, { timeout: 4000 }).catch(() => {});
  await hoverPlusRow('#v2-btn-new-presentation');
  row = await rowState(page);
  check(tag + 'extension éteinte : la ligne se grise sur place, avec sa raison au survol', !!row && row.ariaDisabled === 'true' && row.grey && row.explains && row.title === T.reason && await seen('#v2-btn-new-presentation'), row);
  const greyRatio = await contrastOf(page, '#v2-btn-new-presentation');
  check(tag + 'la ligne grisée garde un contraste d’au moins 4,5:1 sur le fond du menu', greyRatio >= 4.5, greyRatio);
  await snap(page, `menu-grise-${lang}-${colorScheme}`);
  // Son clic appelle la fenêtre d'installation de GFS, sans fenêtre de l'app.
  await page.mouse.click((await page.evaluate(() => { const r = document.getElementById('v2-btn-new-presentation').getBoundingClientRect(); return r.left + r.width / 2; })), (await page.evaluate(() => { const r = document.getElementById('v2-btn-new-presentation').getBoundingClientRect(); return r.top + r.height / 2; })));
  await sleep(600);
  await leave();
  const installs = await gfsCalls(page, 'installer');
  const dialog = await dialogState(page);
  now = await shown(page);
  check(tag + 'le clic sur la ligne grisée demande à GFS d’installer « diapositives » (appel `installer`), sans fenêtre de l’app, et rien ne change à l’écran',
    JSON.stringify(installs) === JSON.stringify([{ extension: 'diapositives' }]) && !dialog.open && String(now.current) === String(savedId), { installs, dialog, now });
  await click('.tts-trigger');
  await page.waitForSelector('.tts-popup.is-open', { timeout: 5000 }).catch(() => {});
  rows = await listRows(page, [6, savedId]);
  check(tag + 'les présentations de la liste se grisent avec la raison de l’extension, et gardent leur icône',
    !!rows[6] && !!rows[savedId] && rows[6].unavailable && rows[savedId].unavailable && rows[6].reason === T.reason && rows[savedId].reason === T.reason && /tts-icon-presentation/.test(rows[savedId].iconClass), rows);
  await page.keyboard.press('Escape');
  await sleep(300);
  await click('.ProseMirror');
  await page.keyboard.press('End');
  await page.keyboard.type(' encore');
  await click('#btn-save');
  await sleep(800);
  const kept = await rowOf(page, savedId);
  now = await shown(page);
  check(tag + 'la présentation ouverte reste ouverte et s’enregistre, toujours sous son type', String(now.current) === String(savedId) && !!kept && kept.type === 'presentation' && /Bienvenue encore/.test(kept.contenu) && kept.format === '190.5x338.7', { kept, now });

  // --- GFS la rallume : tout redevient utilisable.
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await page.waitForFunction(() => document.getElementById('v2-btn-new-presentation').getAttribute('aria-disabled') === 'false', null, { timeout: 4000 }).catch(() => {});
  await click('.tts-trigger');
  await page.waitForSelector('.tts-popup.is-open', { timeout: 5000 }).catch(() => {});
  rows = await listRows(page, [6]);
  row = await rowState(page);
  check(tag + 'rallumée : la ligne du menu et « Futur » redeviennent utilisables', !!row && row.ariaDisabled === 'false' && !row.grey && !!rows[6] && !rows[6].unavailable, { row, rows });
  await page.keyboard.press('Escape');
  check(tag + 'aucune boîte native (alert, confirm, prompt)', natives.length === 0, natives);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le widget seul : la ligne est grisée, son clic explique, rien ne change.
async function runStandalone(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[seul ${lang} ${colorScheme}] `;
  const { page, requests, natives, context } = await t.openPage({ hosted: false, seed: seedModels(), lang, colorScheme });
  const { seen, hoverPlusRow, leave } = toolsOf(page);
  const before = await shown(page);
  const row = await (async () => { await hoverPlusRow('#v2-btn-new-presentation'); return rowState(page); })();
  check(tag + 'la ligne « ' + T.row + ' » est là, grisée (aria-disabled, classe), avec sa raison au survol, et se clique', !!row && row.label === T.row && row.ariaDisabled === 'true' && row.grey && row.explains && row.title === T.reason && await seen('#v2-btn-new-presentation'), row);
  const ratio = await contrastOf(page, '#v2-btn-new-presentation');
  check(tag + 'grisée, elle garde un contraste d’au moins 4,5:1 sur le fond du menu', ratio >= 4.5, ratio);
  await snap(page, `seul-menu-${lang}-${colorScheme}`);
  const r = await page.evaluate(() => { const b = document.getElementById('v2-btn-new-presentation').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.click(r.x, r.y);
  await page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; }, null, { timeout: 4000 }).catch(() => {});
  const dialog = await dialogState(page);
  check(tag + 'son clic ouvre la fenêtre qui dit qu’il faut passer par Grist Factory Suite, un seul bouton « ' + T.close + ' », le focus dedans, dans les 700x400',
    dialog.open && dialog.title === T.noticeTitle && dialog.message === T.noticeMessage && JSON.stringify(dialog.buttons) === JSON.stringify([T.close]) && dialog.focusInside && dialog.inPanel, dialog);
  await snap(page, `seul-fenetre-${lang}-${colorScheme}`);
  await page.keyboard.press('Escape');
  await sleep(300);
  await leave();
  const after = await shown(page);
  const closed = await dialogState(page);
  check(tag + 'Échap la ferme ; rien n’a changé (même modèle, même texte), aucun fichier d’extension demandé, aucune boîte native',
    !closed.open && String(after.current) === String(before.current) && after.text === before.text && extensionTraffic(requests).length === 0 && natives.length === 0, { before, after, closed, natives });
  await context.close();
}

await runHosted('fr', 'light');
await runStandalone('fr', 'light');
await runHosted('en', 'dark');
await runStandalone('en', 'dark');
await t.finish();
