#!/usr/bin/env node
// Le bouton « Objets » de la barre d'outils du haut : quand il se grise, ce que son menu dit alors, et qu'il tient dans un petit panneau (js/objects-menu.js, css/free-frame.css ; demande du
// 22/10 : « le bouton d'ajout des formes n'a rien à faire en bas à gauche, ça doit être dans la tool bar en haut comme tout le reste du contenu »), à la vraie souris et au vrai clavier, 700x400,
// français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js) ou seul. Le geste lui-même (poser un cadre, une forme, une ligne) a ses essais : dev-tests/verify-free-frame.mjs
// (l'entrée, le menu, le clavier, le cadre), verify-shapes.mjs et verify-lines.mjs (chaque forme, chaque ligne).
//  HÉBERGÉ, EXTENSION ACTIVE : devant une présentation le bouton n'est pas grisé (ses vingt choix se voient) ; devant un document, un email ou un macro-modèle il se grise sur place (aria-disabled,
//   son nom reste « Objets ») et son menu s'ouvre quand même pour dire « Les objets se posent sur une diapositive » (lisible, >= 4,5:1, aucun choix) ; rien ne se pose, ni au clic ni au clavier ;
//   ouvrir une présentation le dégrise, rouvrir un document le grise.
//  EXTENSION ÉTEINTE EN DIRECT (événement `extensions`) : le bouton se grise avec la raison de l'extension, son clic appelle `installer` de GFS (pas de fenêtre) ; rallumée, il redevient utilisable.
//  SEUL (adresse sans `gfs=`) : le bouton est grisé avec la raison de l'extension, son clic ouvre la fenêtre « il faut passer par GFS » (Échap la ferme), rien ne change.
//  LA LECTURE : la barre est grisée comme tout le reste (rien ne s'ouvre à la souris, rien ne se pose, ni au clavier) ; revenu en Édition le bouton pose un cadre.
//  UN PETIT PANNEAU : à 600x400 le bouton est dans la barre, son menu entier dans le panneau, au premier plan.
// Lancé par run-headless.mjs (groupe Node "objectsMenu", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-objects-menu.mjs
// OBJECTS_MENU_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf, OBJECTS_BUTTON, OBJECTS_MENU, objectRow, hoverObject, hoverObjectsButton, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.OBJECTS_MENU_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-objects-menu', port: Number(process.env.OBJECTS_MENU_PORT || 8964) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
// 1 « Départ A défaut » (document), 4 « Départ E email », 5 « Départ M macro » (macro-modèle), 6 « Futur » (présentation) : dev-tests/gfs-page.mjs (`seedModels`).
const SEED = seedModels();
const DOCUMENT = 1, EMAIL = 4, MACRO = 5, PRESENTATION = 6;

const TEXTS = {
  fr: {
    menu: 'Objets', buttonTip: n => `Ajouter un objet à la diapositive ${n}`, onlyPresentation: 'Les objets se posent sur une diapositive : ouvre une présentation.', extension: 'Demande l’extension Diapositives (Grist Factory Suite)',
    noticeTitle: 'Cette fonction demande Grist Factory Suite',
    noticeMessage: '« Présentations » fait partie de l’extension « Diapositives », qui n’est disponible que dans Grist Factory Suite. Ouvrez Publipostage+ depuis Grist Factory Suite pour l’utiliser.', close: 'Fermer',
  },
  en: {
    menu: 'Objects', buttonTip: n => `Add an object to slide ${n}`, onlyPresentation: 'Objects go on a slide: open a presentation.', extension: 'Needs the Slides extension (Grist Factory Suite)',
    noticeTitle: 'This feature needs Grist Factory Suite',
    noticeMessage: '“Presentations” is part of the “Slides” extension, which is only available in Grist Factory Suite. Open Publipostage+ from Grist Factory Suite to use it.', close: 'Close',
  },
};
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const inPanel = (r, width, height) => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= width + 0.5 && r.bottom <= height + 0.5;
const centerOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
const onTop = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return r.width > 0 && !!hit && (hit === el || el.contains(hit));
}, selector);
// La souris s'en va dans un coin vide : le menu se referme.
const leave = async (page, width = 700, height = 400) => { await page.mouse.move(width - 10, height - 10, { steps: 5 }); await sleep(450); };
// Le bouton et son menu : grisé ou non, nommé comment, ce que le menu montre (la raison ou les choix), où il est.
const stateOf = page => page.evaluate(() => {
  const b = document.getElementById('v2-btn-objects');
  const m = document.getElementById('v2-objects-flyout');
  const shown = el => !!el && el.getBoundingClientRect().width > 0;
  const reason = m.querySelector('.v2-objects-reason');
  const r = m.getBoundingClientRect();
  return {
    disabled: b.getAttribute('aria-disabled'), explains: b.hasAttribute('data-explains'), label: b.getAttribute('aria-label'), opacity: Number(getComputedStyle(b).opacity), expanded: b.getAttribute('aria-expanded'),
    off: m.classList.contains('pp-objects-off'), choices: Array.from(m.querySelectorAll('[data-action]')).filter(shown).length, reason: shown(reason) ? reason.textContent : '',
    title: shown(m.querySelector('.v2-hover-flyout-label')) ? m.querySelector('.v2-hover-flyout-label').textContent.trim() : '',
    menu: r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null,
  };
});
const html = page => page.evaluate(() => Editor.getHTML());
const frames = page => page.evaluate(() => (Editor.getHTML().match(/class="pp-free-frame"/g) || []).length);
const dialogState = page => page.evaluate(() => {
  const modal = document.getElementById('pp-dialog-modal');
  if (!modal) return { open: false };
  const open = modal.style.display !== 'none' && modal.getBoundingClientRect().height > 0;
  const message = modal.querySelector('#pp-dialog-message');
  const buttons = Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
  return { open, title: modal.querySelector('#pp-dialog-title').textContent, message: message.hidden ? '' : message.textContent, buttons: buttons.map(b => b.textContent.trim()) };
});
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function runHosted(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[hébergé ${lang} ${colorScheme}] `;
  const { page, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const open = async (id) => {
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    await sleep(1200);
  };

  // --- Devant une présentation : utilisable.
  await open(PRESENTATION);
  let s = await stateOf(page);
  check(tag + 'devant une présentation le bouton n\'est pas grisé (aria-disabled « false », opaque), nommé d\'après la diapositive du curseur (« ' + T.buttonTip(1) + ' »), menu fermé', s.disabled === 'false' && s.opacity === 1 && !s.explains && s.label === T.buttonTip(1) && s.expanded !== 'true' && !s.menu, s);
  await hoverObject(page, 'textFrame');
  s = await stateOf(page);
  check(tag + 'son menu montre ses vingt choix (la ligne, seize formes, trois lignes) et aucune raison', !s.off && s.choices === 20 && s.reason === '' && s.title === T.menu && inPanel(s.menu, 700, 400), s);
  await snap(page, `presentation-${lang}-${colorScheme}`);
  await leave(page);

  // --- Devant un document, un email, un macro-modèle : grisé, avec la raison.
  await open(DOCUMENT);
  s = await stateOf(page);
  check(tag + 'devant un document le bouton se grise sur place (aria-disabled « true », pâli), son nom reste « ' + T.menu + ' », son clic n\'explique rien (aucune extension à demander)', s.disabled === 'true' && s.opacity < 0.6 && s.label === T.menu && !s.explains, s);
  await hoverObjectsButton(page);
  s = await stateOf(page);
  check(tag + 'son menu s\'ouvre quand même : le titre « ' + T.menu + ' » et la raison « ' + T.onlyPresentation + ' », aucun choix, entier dans le panneau',
    s.expanded === 'true' && s.off && s.choices === 0 && s.reason === T.onlyPresentation && s.title === T.menu && inPanel(s.menu, 700, 400), s);
  const ratio = await contrastOf(page, OBJECTS_MENU + ' .v2-objects-reason');
  check(tag + 'la raison est lisible (>= 4,5:1)', ratio >= 4.5, ratio);
  await snap(page, `document-${lang}-${colorScheme}`);
  const before = await html(page);
  const c = await centerOf(page, OBJECTS_BUTTON);
  await page.mouse.click(c.x, c.y);
  await sleep(300);
  check(tag + 'un clic sur le bouton grisé ne pose rien et n\'ouvre aucune fenêtre', (await html(page)) === before && !(await dialogState(page)).open && (await gfsCalls(page, 'installer')).length === 0);
  await leave(page);
  await page.focus(OBJECTS_BUTTON);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  const keyed = await page.evaluate(() => ({ onButton: document.activeElement === document.getElementById('v2-btn-objects'), frames: (Editor.getHTML().match(/class="pp-free-frame"/g) || []).length }));
  check(tag + 'au clavier, Entrée et ↓ sur le bouton grisé ne vont nulle part (le clavier reste sur le bouton) et ne posent rien', keyed.onButton && keyed.frames === 0 && (await html(page)) === before, keyed);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await leave(page);

  for (const [id, name] of [[EMAIL, 'email'], [MACRO, 'macro-modèle']]) {
    await open(id);
    s = await stateOf(page);
    await hoverObjectsButton(page);
    const menu = await stateOf(page);
    check(tag + `devant un ${name} il est grisé aussi, et son menu dit la même chose`, s.disabled === 'true' && s.opacity < 0.6 && menu.reason === T.onlyPresentation && menu.choices === 0, { s, menu });
    await leave(page);
  }
  await open(PRESENTATION);
  s = await stateOf(page);
  check(tag + 'rouvrir la présentation le dégrise (il suit le modèle ouvert, dans les deux sens)', s.disabled === 'false' && s.opacity === 1 && s.label === T.buttonTip(1), s);

  // --- GFS éteint l'extension : grisé avec sa raison ; le clic appelle `installer`.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await page.waitForFunction(() => document.getElementById('v2-btn-objects').getAttribute('aria-disabled') === 'true', null, { timeout: 4000 }).catch(() => {});
  s = await stateOf(page);
  check(tag + 'extension éteinte en direct : le bouton se grise (« true »), son clic explique (data-explains)', s.disabled === 'true' && s.explains && s.opacity < 0.6, s);
  await hoverObjectsButton(page);
  s = await stateOf(page);
  check(tag + 'son menu dit la raison de l\'extension (« ' + T.extension + ' »), sans choix, entier dans le panneau', s.reason === T.extension && s.choices === 0 && inPanel(s.menu, 700, 400), s);
  await snap(page, `extension-eteinte-${lang}-${colorScheme}`);
  const c2 = await centerOf(page, OBJECTS_BUTTON);
  await page.mouse.click(c2.x, c2.y);
  await sleep(700);
  await leave(page);
  const installs = await gfsCalls(page, 'installer');
  check(tag + 'son clic demande à GFS d\'installer « diapositives » (appel `installer`), sans fenêtre de l\'app, et rien ne se pose', JSON.stringify(installs) === JSON.stringify([{ extension: 'diapositives' }]) && !(await dialogState(page)).open && (await frames(page)) === 0, { installs });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await page.waitForFunction(() => document.getElementById('v2-btn-objects').getAttribute('aria-disabled') === 'false', null, { timeout: 4000 }).catch(() => {});
  s = await stateOf(page);
  check(tag + 'rallumée : le bouton redevient utilisable', s.disabled === 'false' && s.opacity === 1 && !s.explains, s);

  // --- La Lecture grise la barre : rien ne s'ouvre, rien ne se pose ; l'Édition rend le geste.
  await page.click('#btn-mode-read');
  await sleep(1200);
  const locked = await page.evaluate(() => { const g = document.getElementById('v2-objects-group'); return { locked: g.classList.contains('pp-access-locked'), aria: g.getAttribute('aria-disabled'), pointer: getComputedStyle(g).pointerEvents }; });
  const readBefore = await html(page);
  await hoverObjectsButton(page);
  const hovered = await stateOf(page);
  check(tag + 'en Lecture le groupe est grisé comme le reste de la barre (aria-disabled, aucun événement de souris) : le survol n\'ouvre pas le menu', locked.locked && locked.aria === 'true' && locked.pointer === 'none' && hovered.expanded !== 'true' && !hovered.menu, { locked, hovered });
  await page.focus(OBJECTS_BUTTON);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await sleep(300);
  check(tag + 'au clavier, Entrée, Tab puis Entrée ne posent rien en Lecture', (await html(page)) === readBefore && (await frames(page)) === 0, await frames(page));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await leave(page);
  await page.click('#btn-mode-edit');
  await sleep(1200);
  await chooseObject(page, 'textFrame');
  check(tag + 'revenu en Édition, le bouton pose un cadre de texte', (await frames(page)) === 1, await frames(page));
  check(tag + 'aucune boîte native (alert, confirm, prompt)', natives.length === 0, natives);
  await page.close?.();
}

// Le widget seul : pas de GFS, donc pas d'extension ; le bouton est grisé avec sa raison, son clic explique.
async function runStandalone(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[seul ${lang} ${colorScheme}] `;
  const { page, natives } = await t.openPage({ hosted: false, seed: SEED, lang, colorScheme });
  await sleep(1500);
  let s = await stateOf(page);
  check(tag + 'seul, le bouton est grisé (« true »), son clic explique (data-explains)', s.disabled === 'true' && s.explains && s.opacity < 0.6, s);
  await hoverObjectsButton(page);
  s = await stateOf(page);
  const ratio = await contrastOf(page, OBJECTS_MENU + ' .v2-objects-reason');
  check(tag + 'son menu dit la raison de l\'extension (« ' + T.extension + ' »), lisible (>= 4,5:1), sans choix, entier dans le panneau', s.reason === T.extension && ratio >= 4.5 && s.choices === 0 && inPanel(s.menu, 700, 400), { s, ratio });
  const before = await html(page);
  const c = await centerOf(page, OBJECTS_BUTTON);
  await page.mouse.click(c.x, c.y);
  await page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; }, null, { timeout: 4000 }).catch(() => {});
  const dialog = await dialogState(page);
  check(tag + 'son clic ouvre la fenêtre qui dit qu\'il faut passer par Grist Factory Suite, un seul bouton « ' + T.close + ' »', dialog.open && dialog.title === T.noticeTitle && dialog.message === T.noticeMessage && JSON.stringify(dialog.buttons) === JSON.stringify([T.close]), dialog);
  await snap(page, `seul-fenetre-${lang}-${colorScheme}`);
  await page.keyboard.press('Escape');
  await sleep(300);
  await leave(page);
  check(tag + 'Échap la ferme ; rien n\'a changé, aucune boîte native', !(await dialogState(page)).open && (await html(page)) === before && natives.length === 0, natives);
  await page.close?.();
}

// À 600x400 : le bouton est dans la barre du haut, son menu entier dans le panneau, au premier plan.
async function runSmall() {
  const tag = '[600x400] ';
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang: 'fr', colorScheme: 'light', width: 600, height: 400 });
  await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), PRESENTATION), sleep(20000)]);
  await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), PRESENTATION, { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  const button = await centerOf(page, OBJECTS_BUTTON);
  const image = await centerOf(page, '#v2-btn-image');
  check(tag + 'le bouton « Objets » est dans la barre, derrière « Image », entier dans le panneau, au premier plan', !!button && !!image && button.left >= image.right - 1 && inPanel(button, 600, 400) && await onTop(page, OBJECTS_BUTTON), { button, image });
  await hoverObject(page, 'line:double');
  const s = await stateOf(page);
  check(tag + 'son menu est entier dans le panneau, la dernière ligne et la dernière forme reçoivent le clic', s.choices === 20 && inPanel(s.menu, 600, 400) && await onTop(page, objectRow('line:double')) && await onTop(page, objectRow('shape:wedgeRoundRectCallout')) && await onTop(page, objectRow('textFrame')), s);
  await snap(page, 'petit-panneau');
  await page.close?.();
}

await runHosted('fr', 'light');
await runStandalone('fr', 'light');
await runSmall();
await runHosted('en', 'dark');
await runStandalone('en', 'dark');
await t.finish();
