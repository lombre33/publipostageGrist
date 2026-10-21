#!/usr/bin/env node
// Ce que le widget retient de CHAQUE PERSONNE quand Grist Factory Suite l'héberge (consigne GFS 024, contrats de GFS 5.1 `stockage.ecrire` et 5.2 `contexte.stockage`) : 700x400, à la vraie souris et au vrai clavier,
// l'app dans le cadre isolé de GFS (sans `allow-same-origin` : le cadre refuse son propre stockage, c'est pourquoi GFS garde les préférences pour l'app) que porte une page parente qui joue GFS
// (dev-tests/gfs-stub.js : `stockage` est l'espace de l'app, que GFS rend au contexte et que l'appel `stockage.ecrire` change). js/person-store.js est le seul point d'entrée des dix modules concernés.
//  1) AU DÉPART la page applique ce que GFS garde : le thème, l'enregistrement automatique coupé (bouton Enregistrer noir et blanc), la messagerie du mode Email, la touche de déclenchement (la liste s'ouvre sur
//     « @ », plus sur « # »), le caractère des abréviations, la vue du panneau des raccourcis, une touche choisie (Alt+K ouvre la Lecture), le niveau de zoom du modèle ; et rien ne repart chez GFS : lire n'écrit jamais.
//  2) CHAQUE CHANGEMENT part chez GFS, un appel `stockage.ecrire` sans `id` (aucune réponse attendue) par clé, et seulement les dix clés de la consigne (jamais la langue ni les noms de colonnes d'un document) : thème,
//     messagerie, touche de déclenchement, vue des raccourcis, caractère des abréviations, touche choisie, enregistrement automatique, zoom, assemblage avant impression, PDF protégé (jamais le mot de passe tapé) ;
//     GFS ne refuse rien (clés et valeurs dans sa règle).
//  3) LE CADRE RECHARGÉ retrouve tout ce que l'app a écrit, à l'identique (GFS garde l'espace, la page parente reste la même), sans rien réécrire au redémarrage.
//  4) UN CONTEXTE QUI ARRIVE TARD (2,5 secondes) : la page démarre quand même, applique l'espace à son arrivée (thème, bouton Enregistrer, vue des raccourcis), et rien ne s'écrit avant ni après ; ce que GFS
//     gardait n'est pas écrasé par une valeur d'origine posée au chargement.
//  5) UNE GFS D'AVANT LA CONSIGNE 024 (le contexte n'a pas de `stockage`), puis une GFS muette (aucun contexte, les 5 secondes de la page) : la page démarre comme avant, les changements valent pour la séance, et
//     rien n'est envoyé à GFS (l'appel `stockage.ecrire` n'existe pas chez elle).
//  6) HÉBERGÉ SANS CADRE, avec un stockage de navigateur qui ne dit pas la même chose : l'espace de GFS passe avant, et les changements vont à GFS, pas au navigateur.
//  7) SEUL (adresse sans `gfs=`) : le stockage du navigateur, comme avant - lu au départ, écrit à chaque changement, rien envoyé nulle part.
// Les clés qui restent dans le navigateur (la langue : GFS la donne ; les noms de colonnes d'un document) ne passent jamais par GFS.
// GFS_STORAGE_ONLY=1,3 ne joue que ces scénarios (mise au point) ; rien d'écrit sinon. Lancé par run-headless.mjs (groupe Node « gfsStorage », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-storage.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-storage', port: Number(process.env.GFS_STORAGE_PORT || 8927) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = seedModels();
const ONLY = (process.env.GFS_STORAGE_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));
// Les dix clés de la consigne 024 que le widget écrit (la onzième, celle de la fenêtre des nouveautés, vient avec elle) : toutes en `pp_…`, la règle de GFS (1 à 64 caractères parmi A-Z a-z 0-9 _ . : -).
const TEN = ['pp_theme', 'pp_trigger_char', 'pp_expansion_char', 'pp_shortcuts', 'pp_shortcuts_view', 'pp_mail_client', 'pp_autosave_enabled', 'pp_sheet_assembly', 'pp_page_zoom', 'pp_pdf_protection'];
const GFS_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
// Ce que la personne a gardé chez GFS (scénarios 1 et 4) : un modèle « Départ A défaut » (le ★, celui qui s'ouvre) zoomé à 150 %.
const SAVED_SPACE = () => ({
  pp_theme: 'dark',
  pp_autosave_enabled: 'false',
  pp_mail_client: 'zimbra',
  pp_trigger_char: '@',
  pp_expansion_char: '&',
  pp_shortcuts: JSON.stringify({ modeRead: 'Alt+k' }),
  pp_shortcuts_view: 'expansion',
  pp_page_zoom: JSON.stringify([{ i: '1', n: 'Départ A défaut', m: 'manual', z: 1.5 }]),
});
const TYPED_TEXT = 'MotDePasse-Essai-42';   // ce que la personne tape dans la fenêtre « PDF protégé » : ne doit sortir de la page vers GFS nulle part

// Le centre d'un élément dans les coordonnées de la page rendue (le cadre de l'app est à son coin, sans bordure ; `app` est `page` quand l'app n'est pas encadrée).
const centerOf = (app, selector, scroll = true) => app.evaluate(([sel, doScroll]) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  if (doScroll) el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [selector, scroll]);
// Le vrai clic : la souris approche, puis clique.
async function realClick(page, app, selector) {
  const at = await centerOf(app, selector);
  if (!at) throw new Error('introuvable : ' + selector);
  await page.mouse.move(at.x - 14, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(at.x, at.y);
}
// Une ligne d'un menu qui s'ouvre au survol (Enregistrer) : on descend tout droit sous le bouton avant d'aller à la ligne, le menu reste ouvert tout du long.
async function clickMenuRow(page, app, buttonSelector, rowSelector) {
  const from = await centerOf(app, buttonSelector);
  await page.mouse.move(from.x - 14, from.y);
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await sleep(300);
  const to = await centerOf(app, rowSelector, false);
  await page.mouse.move(from.x, to.y, { steps: 12 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await sleep(150);
  await page.mouse.click(to.x, to.y);
  await sleep(300);
  await page.mouse.move(350, 340, { steps: 6 });
  await sleep(250);
}
// La pastille de zoom ne montre ses boutons qu'au survol du pourcentage.
async function clickZoomIn(page, app) {
  const value = await centerOf(app, '#pp-page-zoom-value');
  await page.mouse.move(value.x, value.y - 3, { steps: 3 });
  await app.waitForFunction(() => document.getElementById('pp-page-zoom-out').getBoundingClientRect().width > 10, null, { timeout: 3000 }).catch(() => {});
  await realClick(page, app, '#pp-page-zoom-in');
}

const gfsWrites = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'stockage.ecrire').map(c => ({ args: c.args, id: c.id })));
const gfsSpace = page => page.evaluate(() => (window.__gfsStub.stockage ? Object.assign({}, window.__gfsStub.stockage) : null));
const gfsRefused = page => page.evaluate(() => window.__gfsStub.refus.slice());
const gfsContexts = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'contexte').length);

// Ce que la page montre sans rien ouvrir : thème, aspect de l'enregistrement automatique, zoom de la pastille, ce que PersonStore dit de lui-même.
const lookOf = app => app.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  autosaveOffClass: document.documentElement.classList.contains('pp-autosave-off'),
  saveButtonOff: document.getElementById('btn-save').classList.contains('is-autosave-off'),
  autosaveRow: document.getElementById('v2-btn-autosave').getAttribute('aria-checked'),
  zoom: (document.getElementById('pp-page-zoom-value') || {}).textContent || '',
  shared: typeof PersonStore !== 'undefined' ? PersonStore.shared() : 'absent',          // 'absent' : le code d'avant la consigne 024
  space: typeof GfsLink.hasStorage === 'function' ? GfsLink.hasStorage() : 'absent',
  origin: window.origin,
  storage: (() => { try { localStorage.getItem('pp_theme'); return 'accessible'; } catch (e) { return 'refusé'; } })(),
}));
const readerShown = app => app.evaluate(() => { const r = document.getElementById('reader-container'); return !!r && r.getClientRects().length > 0; });
const listShown = app => app.evaluate(() => { const b = document.getElementById('autocomplete-box'); return !!b && getComputedStyle(b).display !== 'none'; });

async function openSettings(page, app) {
  await realClick(page, app, '#v2-btn-settings');
  await app.waitForFunction(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none', null, { timeout: 5000 });
  await sleep(250);
}
async function settingsTab(page, app, name) {
  await realClick(page, app, `#settings-modal .settings-tab[data-settings-tab="${name}"]`);
  await sleep(250);
}
const closeSettings = async (page, app) => { await realClick(page, app, '#settings-close'); await sleep(250); };
// Ce que les Réglages ouverts disent des choix en vigueur.
const settingsState = app => app.evaluate(() => {
  const checked = name => { const r = document.querySelector(`input[name="${name}"]:checked`); return r ? r.value : null; };
  const keyButton = document.querySelector('li.settings-key-row[data-action="modeRead"] .settings-key-btn');
  return {
    theme: checked('settings-theme'),
    mail: checked('settings-mail-client'),
    trigger: document.getElementById('settings-trigger-char').value,
    expansionChar: document.getElementById('settings-expansion-char').value,
    keysShown: !document.getElementById('settings-keys-section').hidden,
    expansionShown: !document.getElementById('settings-expansion-section').hidden,
    readKey: keyButton ? keyButton.textContent : null,
  };
});
// Le texte tapé dans l'éditeur, à la vraie souris et au vrai clavier : la liste « # » (ou la touche choisie) s'ouvre-t-elle ?
async function typeInEditor(page, app, text) {
  await realClick(page, app, '.tiptap p');
  await sleep(200);
  await page.keyboard.press('Control+A');   // la touche de déclenchement s'écoute en début de ligne ou après une espace
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
  await sleep(700);
}
async function clearEditorLine(page) {
  await page.keyboard.press('Escape');
  await sleep(150);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(150);
}
// L'attente du redémarrage d'un cadre qui se recharge : le repère posé avant a disparu, l'éditeur répond et le coin d'état dit que la page est prête.
const markPage = app => app.evaluate(() => { window.__marker = 'avant'; });
const READY = () => !window.__marker && typeof EditorCore !== 'undefined' && !!EditorCore.getEditor && !!EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || '');
async function waitThrough(app, condition, ms = 40000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { await app.waitForFunction(condition, null, { timeout: Math.max(500, deadline - Date.now()) }); return true; }
    catch (e) { if (/Timeout/i.test(String(e))) return false; await sleep(250); }
  }
  return false;
}
const waitReady = (app, ms) => app.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: ms });

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(1)) {
  console.log('\n1) Au départ, la page applique ce que GFS garde pour la personne - et rien ne repart chez GFS');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { stockage: SAVED_SPACE() } });
  const look = await lookOf(app);
  check('le cadre est isolé (origine « null », son propre stockage refusé) : ce qui suit ne peut venir que de GFS', look.origin === 'null' && look.storage === 'refusé', look);
  check('thème « sombre » (<html data-theme>), repris du contexte de GFS', look.theme === 'dark', look);
  check('enregistrement automatique coupé : <html> et bouton Enregistrer noir et blanc, ligne du menu décochée', look.autosaveOffClass && look.saveButtonOff && look.autosaveRow === 'false', look);
  check('niveau de zoom du modèle ouvert (150 %) lu à la pastille', /150/.test(look.zoom), look);
  check('PersonStore dit que les préférences sont celles de GFS', look.shared === true && look.space === true, look);

  // La touche choisie (Alt+K) ouvre la Lecture, au vrai clavier.
  await realClick(page, app, '.tiptap p');
  await sleep(250);
  await page.keyboard.press('Alt+k');
  await sleep(700);
  const reading = await readerShown(app);
  check('la touche choisie chez GFS (Alt+K) ouvre la Lecture', reading === true, reading);
  await page.keyboard.press('Alt+e');
  await sleep(500);

  // La touche de déclenchement choisie (@) ouvre la liste ; « # » ne l'ouvre plus.
  await typeInEditor(page, app, '@');
  const onAt = await listShown(app);
  await clearEditorLine(page);
  await typeInEditor(page, app, '#');
  const onHash = await listShown(app);
  await clearEditorLine(page);
  check('la touche de déclenchement choisie chez GFS (@) ouvre la liste des variables, « # » ne l’ouvre plus', onAt === true && onHash === false, { onAt, onHash });

  // Réglages : chaque choix affiché est celui de GFS.
  await openSettings(page, app);
  await settingsTab(page, app, 'theme');
  const theme = await settingsState(app);
  await settingsTab(page, app, 'mailClient');
  const mail = await settingsState(app);
  await settingsTab(page, app, 'triggerKey');
  const trigger = await settingsState(app);
  await settingsTab(page, app, 'shortcuts');
  const shortcuts = await settingsState(app);
  check('Réglages : thème « sombre » coché, messagerie « zimbra » cochée, touche de déclenchement « @ »', theme.theme === 'dark' && mail.mail === 'zimbra' && trigger.trigger === '@', { theme: theme.theme, mail: mail.mail, trigger: trigger.trigger });
  check('Réglages > Raccourcis : la vue gardée (Abréviations) est montrée, avec le caractère « & » ; la touche de la Lecture affiche « K »',
    shortcuts.expansionShown === true && shortcuts.keysShown === false && shortcuts.expansionChar === '&' && /k/i.test(shortcuts.readKey || ''), shortcuts);
  await closeSettings(page, app);

  const writes = await gfsWrites(page);
  check('lire n’écrit jamais : aucun appel `stockage.ecrire` du démarrage à la fin du parcours', writes.length === 0, writes);
  check('le contexte n’a été demandé qu’une fois', (await gfsContexts(page)) === 1, await gfsContexts(page));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let round = null;   // la page des scénarios 2 et 3 : les changements, puis le cadre rechargé
if (wanted(2) || wanted(3)) {
  console.log('\n2) Chaque changement part chez GFS, par `stockage.ecrire`, sans rien d’autre que les dix clés');
  const opened = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { stockage: {} } });
  const { page, app } = opened;
  round = opened;
  const spaceKey = async key => (await gfsSpace(page))[key];
  const startupWrites = await gfsWrites(page);
  check('un espace vide au départ : la page démarre sans rien écrire', startupWrites.length === 0, startupWrites);

  await openSettings(page, app);
  await settingsTab(page, app, 'theme');
  await realClick(page, app, 'input[name="settings-theme"][value="dark"]');
  await sleep(300);
  check('Réglages > Thème, « Sombre » : `pp_theme` = dark chez GFS, et la page est sombre', (await spaceKey('pp_theme')) === 'dark' && (await lookOf(app)).theme === 'dark', { value: await spaceKey('pp_theme') });

  await settingsTab(page, app, 'mailClient');
  await realClick(page, app, 'input[name="settings-mail-client"][value="zimbra"]');
  await sleep(300);
  check('Réglages > Email, « Zimbra » : `pp_mail_client` = zimbra chez GFS', (await spaceKey('pp_mail_client')) === 'zimbra', { value: await spaceKey('pp_mail_client') });

  await settingsTab(page, app, 'triggerKey');
  await app.selectOption('#settings-trigger-char', '@');
  await sleep(300);
  const noticeShown = await app.evaluate(() => !document.getElementById('settings-trigger-reload-notice').hidden);
  check('Réglages > Touche de déclenchement, « @ » : `pp_trigger_char` = @ chez GFS, la phrase « Rechargez la page » s’affiche', (await spaceKey('pp_trigger_char')) === '@' && noticeShown, { value: await spaceKey('pp_trigger_char'), noticeShown });

  await settingsTab(page, app, 'shortcuts');
  await realClick(page, app, '#settings-switch-expansion');
  await sleep(300);
  check('Réglages > Raccourcis, onglet Abréviations : `pp_shortcuts_view` = expansion chez GFS', (await spaceKey('pp_shortcuts_view')) === 'expansion', { value: await spaceKey('pp_shortcuts_view') });
  await realClick(page, app, '#settings-expansion-char');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('&');
  await sleep(300);
  check('le caractère des abréviations « & » : `pp_expansion_char` = & chez GFS', (await spaceKey('pp_expansion_char')) === '&', { value: await spaceKey('pp_expansion_char') });
  await realClick(page, app, '#settings-switch-keys');
  await sleep(300);
  check('retour sur l’onglet Touches : `pp_shortcuts_view` = keys chez GFS', (await spaceKey('pp_shortcuts_view')) === 'keys', { value: await spaceKey('pp_shortcuts_view') });
  await realClick(page, app, 'li.settings-key-row[data-action="modeRead"] .settings-key-btn');
  await sleep(200);
  await page.keyboard.press('Alt+k');
  await sleep(400);
  check('une touche choisie (Lecture : Alt+K) : `pp_shortcuts` = {"modeRead":"Alt+k"} chez GFS', (await spaceKey('pp_shortcuts')) === '{"modeRead":"Alt+k"}', { value: await spaceKey('pp_shortcuts') });
  await closeSettings(page, app);

  await clickMenuRow(page, app, '#btn-save', '#v2-btn-autosave');
  check('menu d’Enregistrer, « Enregistrement automatique » décoché : `pp_autosave_enabled` = false chez GFS, bouton noir et blanc',
    (await spaceKey('pp_autosave_enabled')) === 'false' && (await lookOf(app)).saveButtonOff === true, { value: await spaceKey('pp_autosave_enabled') });

  await clickZoomIn(page, app);
  await sleep(700);
  const zoomValue = await spaceKey('pp_page_zoom');
  let zoomList = null;
  try { zoomList = JSON.parse(zoomValue); } catch (e) { /* vérifié ci-dessous */ }
  const pill = (await lookOf(app)).zoom;
  check('la pastille de zoom, « + » : `pp_page_zoom` = le niveau du modèle ouvert chez GFS, celui que la pastille montre',
    Array.isArray(zoomList) && zoomList.length === 1 && String(zoomList[0].i) === '1' && zoomList[0].m === 'manual' && zoomList[0].z >= 0.25 && zoomList[0].z <= 4 && pill.includes(String(Math.round(zoomList[0].z * 100))), { zoomValue, pill });

  // Assemblage avant impression : la fenêtre s'ouvre par son menu (js/main.js) ; le test l'ouvre par sa fonction et valide à la vraie souris.
  await app.evaluate(() => ExportEngines.ensure('sheets').then(() => { SheetAssemblyDialog.open({ count: 4 }).then(v => { window.__sheets = v; }); }));
  await app.waitForFunction(() => { const m = document.getElementById('pp-sheets-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 8000 });
  await sleep(300);
  await realClick(page, app, '#pp-sheets-modal .var-modal-actions .var-modal-primary');
  await sleep(500);
  let sheets = null;
  try { sheets = JSON.parse(await spaceKey('pp_sheet_assembly')); } catch (e) { /* vérifié ci-dessous */ }
  check('Assemblage avant impression, « Générer » : `pp_sheet_assembly` = la feuille, le sens, les traits de coupe et la marge chez GFS', !!sheets && typeof sheets.sheet === 'string' && typeof sheets.orientation === 'string' && typeof sheets.marks === 'boolean' && Number.isFinite(sheets.margin), sheets);

  // PDF protégé : le mot de passe est tapé au vrai clavier, validé à la vraie souris ; il ne part nulle part.
  await app.evaluate(() => { PdfProtectionDialog.open({ table: 'PpDepart' }).then(v => { window.__protect = v; }); });
  await app.waitForFunction(() => { const m = document.getElementById('pp-protect-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 8000 });
  await sleep(300);
  await realClick(page, app, '#pp-protect-password');
  await page.keyboard.type(TYPED_TEXT);
  await sleep(300);
  await realClick(page, app, '#pp-protect-modal .pp-modal-actions .var-modal-primary');
  await sleep(500);
  let protect = null;
  try { protect = JSON.parse(await spaceKey('pp_pdf_protection')); } catch (e) { /* vérifié ci-dessous */ }
  check('PDF protégé, « Exporter » : `pp_pdf_protection` = le mode, les droits et l’auteur chez GFS', !!protect && protect.mode === 'typed' && typeof protect.allowPrint === 'boolean' && typeof protect.allowCopy === 'boolean' && typeof protect.allowModify === 'boolean', protect);

  const space = await gfsSpace(page);
  const writes = await gfsWrites(page);
  check('chez GFS, exactement les dix clés de la consigne - ni la langue, ni les noms de colonnes d’un document, ni autre chose', JSON.stringify(Object.keys(space).sort()) === JSON.stringify(TEN.slice().sort()), Object.keys(space).sort());
  check('chaque appel `stockage.ecrire` porte une clé et un texte dans la règle de GFS (clé de 1 à 64 caractères A-Z a-z 0-9 _ . : -), sans `id` (aucune réponse attendue) ; GFS n’en a refusé aucun',
    writes.length >= TEN.length && writes.every(w => GFS_KEY.test(w.args.cle) && typeof w.args.valeur === 'string' && w.id === undefined) && (await gfsRefused(page)).length === 0, { count: writes.length, refused: await gfsRefused(page) });
  check('le mot de passe tapé n’est dans aucun appel ni dans l’espace de GFS', !JSON.stringify(writes).includes(TYPED_TEXT) && !JSON.stringify(space).includes(TYPED_TEXT), null);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(3) && round) {
  console.log('\n3) Le cadre rechargé retrouve tout ce que l’app a écrit, sans rien réécrire');
  const { page, app } = round;
  const before = await gfsSpace(page);
  const writesBefore = (await gfsWrites(page)).length;
  await markPage(app);
  await app.evaluate(() => location.reload());
  const back = await waitThrough(app, READY);
  check('le cadre repart et redevient prêt', back === true, back);
  await sleep(500);
  const reread = await app.evaluate(keys => keys.reduce((found, key) => Object.assign(found, { [key]: typeof PersonStore !== 'undefined' ? PersonStore.get(key) : null }), {}), TEN);
  check('chacune des dix clés est relue à l’identique de ce qu’elle avait écrit', TEN.every(key => reread[key] === before[key]), { reread, before });
  const look = await lookOf(app);
  check('la page rouverte est sombre, l’enregistrement automatique reste coupé, le zoom du modèle est repris', look.theme === 'dark' && look.autosaveOffClass && look.saveButtonOff && look.zoom !== '' && look.shared === true, look);
  await realClick(page, app, '.tiptap p');
  await sleep(250);
  await page.keyboard.press('Alt+k');
  await sleep(700);
  check('la touche choisie (Alt+K) ouvre encore la Lecture après le rechargement', (await readerShown(app)) === true, null);
  await page.keyboard.press('Alt+e');
  await sleep(400);
  await typeInEditor(page, app, '@');
  const onAt = await listShown(app);
  await clearEditorLine(page);
  check('la touche de déclenchement choisie (@) ouvre la liste après le rechargement', onAt === true, onAt);
  check('le redémarrage n’a rien réécrit chez GFS', (await gfsWrites(page)).length === writesBefore, { before: writesBefore, after: (await gfsWrites(page)).length });
  check('le contexte a été redemandé par le cadre rechargé', (await gfsContexts(page)) === 2, await gfsContexts(page));
}
if (round) await round.page.context().close();

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(4)) {
  console.log('\n4) Un contexte qui arrive tard : la page démarre quand même, applique l’espace à son arrivée, et ne l’écrase pas');
  const space = SAVED_SPACE();
  const initial = JSON.stringify(space);
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', ready: false, stub: { stockage: space, contextDelayMs: 2500 } });
  // Avant l'arrivée du contexte (2,5 secondes) : rien de GFS n'est encore appliqué, et rien ne s'écrit.
  const early = await app.evaluate(() => ({ shared: typeof PersonStore !== 'undefined' ? PersonStore.shared() : 'absent', theme: document.documentElement.getAttribute('data-theme'), kept: typeof PersonStore !== 'undefined' ? PersonStore.set('pp_theme', 'light') : 'absent' })).catch(e => ({ error: String(e) }));
  check('avant le contexte, les préférences ne sont pas encore celles de GFS, et une écriture n’est retenue nulle part', early.shared === false && early.theme === null && early.kept === false, early);
  await waitReady(app, 60000);
  await sleep(500);
  const look = await lookOf(app);
  check('à l’arrivée du contexte, la page prend le thème de GFS et l’aspect de l’enregistrement automatique coupé', look.shared === true && look.theme === 'dark' && look.autosaveOffClass && look.saveButtonOff && /150/.test(look.zoom), look);
  await openSettings(page, app);
  await settingsTab(page, app, 'shortcuts');
  const shortcuts = await settingsState(app);
  check('la vue des raccourcis gardée chez GFS (Abréviations) est celle qu’on voit, et la touche choisie s’affiche', shortcuts.expansionShown === true && shortcuts.keysShown === false && /k/i.test(shortcuts.readKey || ''), shortcuts);
  await closeSettings(page, app);
  const writes = await gfsWrites(page);
  check('rien n’a été écrit chez GFS, et ce qu’elle gardait est intact (aucune valeur d’origine posée au chargement ne l’a écrasé)', writes.length === 0 && JSON.stringify(await gfsSpace(page)) === initial, { writes, space: await gfsSpace(page) });
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(5)) {
  console.log('\n5) Une GFS d’avant la consigne 024, puis une GFS muette : la page démarre comme avant et n’envoie rien');
  const old = await t.openPage({ framed: true, seed: SEED, lang: 'fr' });
  const startOld = await lookOf(old.app);
  check('le contexte n’a pas de `stockage` : les préférences ne sont pas celles de GFS, la page est au thème du système', startOld.shared === false && startOld.space === false && startOld.theme === null, startOld);
  await openSettings(old.page, old.app);
  await settingsTab(old.page, old.app, 'theme');
  await realClick(old.page, old.app, 'input[name="settings-theme"][value="dark"]');
  await sleep(400);
  check('un changement de thème vaut pour la séance (la page est sombre)', (await lookOf(old.app)).theme === 'dark', null);
  await settingsTab(old.page, old.app, 'shortcuts');
  await realClick(old.page, old.app, '#settings-switch-expansion');
  await sleep(300);
  await closeSettings(old.page, old.app);
  await clickMenuRow(old.page, old.app, '#btn-save', '#v2-btn-autosave');
  const sent = await old.page.evaluate(() => window.__gfsStub.calls.map(c => c.nom));
  check('rien n’est envoyé à GFS : ni `stockage.ecrire` (elle ne le connaît pas), ni rien d’autre que le contexte', !sent.includes('stockage.ecrire') && sent.every(nom => nom === 'contexte'), sent);
  await old.page.context().close();

  const mute = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { ignoreContext: true } });
  const startMute = await lookOf(mute.app);
  check('GFS ne répond pas au contexte : la page démarre quand même (après les 5 secondes d’attente), sans espace', startMute.shared === false && startMute.space === false, startMute);
  await openSettings(mute.page, mute.app);
  await settingsTab(mute.page, mute.app, 'theme');
  await realClick(mute.page, mute.app, 'input[name="settings-theme"][value="dark"]');
  await sleep(400);
  const sentMute = await mute.page.evaluate(() => window.__gfsStub.calls.map(c => c.nom));
  check('le changement de thème vaut pour la séance et rien n’est envoyé à GFS que la demande de contexte', (await lookOf(mute.app)).theme === 'dark' && sentMute.every(nom => nom === 'contexte'), sentMute);
  await mute.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(6)) {
  console.log('\n6) Hébergé sans cadre, avec un stockage de navigateur qui ne dit pas la même chose : l’espace de GFS passe avant');
  // Le navigateur dit « sombre » et enregistrement automatique coupé ; GFS dit « clair » (et ne parle pas de l'enregistrement automatique).
  const { page, app } = await t.openPage({ hosted: true, seed: SEED, lang: 'fr', storage: { pp_theme: 'dark', pp_autosave_enabled: 'false' }, stub: { stockage: { pp_theme: 'light' } } });
  const look = await lookOf(app);
  check('le thème est celui de GFS (clair), pas celui du navigateur (sombre) ; l’enregistrement automatique que seul le navigateur disait coupé reste actif',
    look.shared === true && look.theme === 'light' && look.saveButtonOff === false, look);
  await openSettings(page, app);
  await settingsTab(page, app, 'theme');
  await realClick(page, app, 'input[name="settings-theme"][value="system"]');
  await sleep(400);
  const browserTheme = await app.evaluate(() => localStorage.getItem('pp_theme'));
  check('un changement de thème va à GFS (`pp_theme` = system) et le navigateur garde ce qu’il avait (sombre)', (await gfsSpace(page)).pp_theme === 'system' && browserTheme === 'dark', { space: await gfsSpace(page), browserTheme });
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(7)) {
  console.log('\n7) Seul (adresse sans `gfs=`) : le stockage du navigateur, comme avant');
  const { page, app } = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', storage: { pp_theme: 'dark', pp_autosave_enabled: 'false' } });
  const look = await lookOf(app);
  check('lu au départ dans le navigateur : sombre, enregistrement automatique coupé ; les préférences ne sont pas celles de GFS (il n’y en a pas)', look.shared === false && look.space === false && look.theme === 'dark' && look.saveButtonOff === true, look);
  await openSettings(page, app);
  await settingsTab(page, app, 'theme');
  await realClick(page, app, 'input[name="settings-theme"][value="light"]');
  await sleep(300);
  await settingsTab(page, app, 'shortcuts');
  await realClick(page, app, '#settings-switch-expansion');
  await sleep(300);
  const stored = await app.evaluate(() => ({ theme: localStorage.getItem('pp_theme'), view: localStorage.getItem('pp_shortcuts_view') }));
  check('chaque changement est écrit dans le navigateur (`pp_theme` = light, `pp_shortcuts_view` = expansion) et le thème s’applique', stored.theme === 'light' && stored.view === 'expansion' && (await lookOf(app)).theme === 'light', stored);
  const nothing = await app.evaluate(() => typeof window.__gfsStub);
  check('rien n’est envoyé à un GFS : il n’y en a pas dans cette page', nothing === 'undefined', nothing);
  await page.context().close();
}

await t.finish();
