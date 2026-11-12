#!/usr/bin/env node
// La copie figée de l'éditeur (consigne 066 de GFS) : l'éditeur (TipTap et ProseMirror) démarre depuis vendor/editeur/ au lieu d'esm.sh quand la page le demande, et le choix se fait dans Réglages. Le vrai widget
// (index.html servi tel quel, faux Grist de dev-tests/grist-stub.js) à 700x400, dans un vrai Chromium SANS contournement de la politique de sécurité (`bypassCSP: false`) : une adresse d'esm.sh demandée, ou un module de la
// copie refusé, se verrait. Le script de index.html (écrit par l'outil du kit, `node kit/outils/bibliotheques.mjs --copies`) pose UNE carte d'importation avant tout le reste : celle de la copie quand l'adresse dit
// `copie=editeur` (GFS la met) ou que la clé `pp_editeur_copie` du navigateur vaut `copie`, celle du CDN sinon.
//   1) SANS `copie` : la page garde la carte du CDN, texte pour texte (celle de `gfs-carte-cdn`) ; l'éditeur vient d'esm.sh (miroir hors ligne), aucun module de vendor/editeur/ n'est demandé, aucune violation de la politique ;
//      il s'écrit et se met en forme au vrai clavier (la touche Entrée d'abord : elle plantait quand deux instances de ProseMirror se chargeaient) ;
//   2) AVEC `?copie=editeur` : la carte posée est celle de la copie (`gfs-carte-copie`), l'éditeur démarre depuis vendor/editeur/ (plus de trente modules, tous répondus 200, aucun échec), AUCUNE requête vers esm.sh, aucune
//      violation de la politique, et le même parcours d'écriture passe (une seule instance de ProseMirror : Entrée, gras) ;
//   3) la clé `pp_editeur_copie` du navigateur vaut `copie` : même résultat, sans rien dans l'adresse ;
//   4) Réglages > Thème > « Éditeur hors ligne » (à la vraie souris) : la case est libre seule, cochée par la copie qui est chargée ; l'adresse qui demande la copie la grise et dit pourquoi ; hébergée par GFS
//      (`?gfs=0`) elle est grisée avec la phrase de la fenêtre « Apps et extensions », cochée ou non selon ce qui est chargé ;
//   5) le geste : la case cochée écrit la clé, la phrase « Rechargez la page » paraît tant que le choix n'est pas ce qui est chargé et disparaît quand ils s'accordent ; « Recharger maintenant » recharge, l'éditeur vient
//      alors de la copie (aucune requête vers esm.sh) ; avec du texte non enregistré, il pose d'abord la question « Ne pas enregistrer / Annuler » (Annuler laisse tout en l'état, rien ne recharge) ; décochée puis
//      rechargée, l'éditeur revient d'esm.sh ; Ctrl + Z rend le choix d'avant ;
//   6) dans le cadre isolé de GFS (origine « nulle », stockage refusé, l'adresse du cadre porte `copie=editeur`) : l'éditeur démarre depuis la copie, aucune requête vers esm.sh, aucune violation ; sans `copie`, depuis esm.sh.
// Sur le code d'avant la 066 (une seule carte, sans script), `?copie=editeur` n'y changeait rien : esm.sh était demandé et 2) échouait.
// Lancé par run-headless.mjs (groupe Node « editorCopy », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-editor-copy.mjs
import { start } from './gfs-page.mjs';

const t = await start({ name: 'verify-editor-copy', port: Number(process.env.EDITOR_COPY_PORT || 9216) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KEY = 'pp_editeur_copie';
const hostOf = url => { try { return new URL(url).host; } catch (e) { return ''; } };
const esmRequests = requests => requests.filter(url => hostOf(url) === 'esm.sh');
const copyRequests = requests => requests.filter(url => url.includes('/vendor/editeur/'));

// Les violations de la politique de la page (et de son cadre), notées par le navigateur lui-même.
const VIOLATIONS = `window.__cspViolations = []; document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push(e.effectiveDirective + ' ' + e.blockedURI), true);`;

// Ouvre le widget sous sa vraie politique, et note les réponses de la copie (leur état) et les requêtes en échec.
async function boot(options = {}) {
  const seen = { copy: [], failed: [] };
  const opened = await t.openPage({
    hosted: false, bypassCSP: false, init: VIOLATIONS, ...options,
    before: page => {
      page.on('response', response => { if (response.url().includes('/vendor/editeur/')) seen.copy.push({ url: response.url(), status: response.status() }); });
      page.on('requestfailed', request => seen.failed.push(request.url() + ' ' + (request.failure() && request.failure().errorText)));
    },
  });
  return { ...opened, seen };
}

const installedMaps = app => app.evaluate(() => Array.from(document.querySelectorAll('script[type="importmap"]')).map(script => script.textContent));
const blockText = (app, id) => app.evaluate(blockId => (document.getElementById(blockId) || {}).textContent || null, id);
const violations = app => app.evaluate(() => window.__cspViolations.slice());
const stored = app => app.evaluate(key => { try { return localStorage.getItem(key); } catch (e) { return 'refusé'; } }, KEY);
const editorUp = app => app.evaluate(() => typeof EditorCore !== 'undefined' && !!EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || '')).catch(() => false);

// Le vrai clic, dans les coordonnées de la page : l'élément est amené à l'écran, la souris approche, puis clique.
async function realClick(page, app, selector) {
  const at = await app.evaluate(sel => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  await page.mouse.move(at.x - 14, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(at.x, at.y);
}

// Écrire au vrai clavier : Entrée (deux paragraphes), puis le gras sur tout. Une seconde instance de ProseMirror faisait planter Entrée (« multiple versions of prosemirror-model »).
async function writeSomething(page, app) {
  await app.click('.tiptap');
  await page.keyboard.type('Bonjour la copie');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Deuxième ligne');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+B');
  return app.evaluate(() => Editor.getHTML());
}
const written = html => (html.match(/<p[ >]/g) || []).length >= 2 && /<strong>/.test(html) && /Bonjour la copie/.test(html) && /Deuxième ligne/.test(html);

// Un bouton de la question « Enregistrer / Ne pas enregistrer / Annuler » (Dialogs.choose), au vrai clic ; null quand la question n'est pas ouverte.
async function clickDialog(page, app, label) {
  const at = await app.evaluate(wanted => {
    const overlay = document.getElementById('pp-dialog-modal');
    if (!overlay || getComputedStyle(overlay).display === 'none') return null;
    const button = Array.from(overlay.querySelectorAll('.var-modal-actions button')).find(candidate => !candidate.hidden && candidate.textContent.trim() === wanted);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  if (!at) return false;
  await page.mouse.move(at.x - 10, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(at.x, at.y);
  return true;
}
const questionOpen = app => app.evaluate(() => { const overlay = document.getElementById('pp-dialog-modal'); return !!overlay && getComputedStyle(overlay).display !== 'none' && /non enregistrées|Unsaved/.test(overlay.textContent || ''); });

async function openSettingsTheme(page, app) {
  await realClick(page, app, '#v2-btn-settings');
  await sleep(300);
  await realClick(page, app, '#settings-modal .settings-tab[data-settings-tab="theme"]');
  await sleep(200);
  // Sans la case (le code d'avant la 066), rien de ce qui suit n'a de sens : l'essai le dit et s'arrête.
  if (!(await app.evaluate(() => !!document.getElementById('settings-offline-editor')))) {
    check('Réglages > Thème porte la case « Éditeur hors ligne »', false);
    await t.finish();
  }
}
async function closeSettings(page, app) {
  await realClick(page, app, '#settings-close');
  await sleep(200);
}
// L'état de la case et de ses phrases, tel que la personne le voit (une phrase `hidden` ne compte pas).
const boxState = app => app.evaluate(() => {
  const box = document.getElementById('settings-offline-editor');
  const shown = id => { const el = document.getElementById(id); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
  return {
    checked: box.checked, disabled: box.disabled, greyedLabel: document.getElementById('settings-offline-editor-label').classList.contains('is-disabled'),
    gfsNote: shown('settings-offline-editor-gfs-note'), addressNote: shown('settings-offline-editor-address-note'), perBrowser: shown('settings-offline-editor-per-browser'), notice: shown('settings-offline-editor-reload-notice'),
    described: box.getAttribute('aria-describedby'),
  };
});

const cdnText = { value: null };
const copyText = { value: null };

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n1) sans `copie` : la page garde la carte du CDN, l\'éditeur vient d\'esm.sh');
{
  const { page, app, requests, seen, context } = await boot();
  cdnText.value = await blockText(app, 'gfs-carte-cdn');
  copyText.value = await blockText(app, 'gfs-carte-copie');
  const maps = await installedMaps(app);
  check('la page porte deux cartes en données (CDN et copie) et en pose UNE seule : celle du CDN, texte pour texte', !!cdnText.value && !!copyText.value && cdnText.value !== copyText.value && maps.length === 1 && maps[0] === cdnText.value, { maps: maps.length, same: maps[0] === cdnText.value });
  check('l\'éditeur est démarré (« Widget prêt »)', await editorUp(app));
  check('l\'éditeur est demandé à esm.sh (miroir hors ligne) et aucun module de vendor/editeur/ n\'est demandé', esmRequests(requests).length > 20 && copyRequests(requests).length === 0, { esm: esmRequests(requests).length, copie: copyRequests(requests).length });
  check('aucune violation de la politique de sécurité', (await violations(app)).length === 0, await violations(app));
  const html = await writeSomething(page, app);
  check('l\'éditeur s\'écrit au vrai clavier : Entrée donne deux paragraphes, Ctrl + B met en gras', written(html), html.slice(0, 160));
  check('aucune requête en échec', seen.failed.length === 0, seen.failed.slice(0, 3));
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n2) avec `?copie=editeur` : la carte de la copie, l\'éditeur démarre depuis vendor/editeur/, aucune requête vers esm.sh');
{
  const { page, app, requests, seen, context } = await boot({ search: '?copie=editeur' });
  const maps = await installedMaps(app);
  check('la carte posée est celle de la copie, texte pour texte (gfs-carte-copie)', maps.length === 1 && maps[0] === copyText.value, { maps: maps.length, same: maps[0] === copyText.value });
  check('l\'éditeur est démarré (« Widget prêt »)', await editorUp(app));
  const copy = copyRequests(requests);
  check('plus de trente modules de vendor/editeur/ sont demandés, tous répondus 200', copy.length > 30 && seen.copy.length >= copy.length && seen.copy.every(entry => entry.status === 200), { demandes: copy.length, reponses: seen.copy.length, autres: seen.copy.filter(entry => entry.status !== 200).slice(0, 3) });
  check('AUCUNE requête vers esm.sh', esmRequests(requests).length === 0, esmRequests(requests).slice(0, 5));
  check('aucune violation de la politique de sécurité', (await violations(app)).length === 0, await violations(app));
  const html = await writeSomething(page, app);
  check('l\'éditeur de la copie s\'écrit au vrai clavier : Entrée donne deux paragraphes (une seule instance de ProseMirror), Ctrl + B met en gras', written(html), html.slice(0, 160));
  check('aucune requête en échec', seen.failed.length === 0, seen.failed.slice(0, 3));
  await openSettingsTheme(page, app);
  const state = await boxState(app);
  check('Réglages > Thème > Éditeur hors ligne : cochée et grisée, la phrase de l\'adresse le dit, ni phrase « propre à ce navigateur » ni demande de rechargement',
    state.checked && state.disabled && state.greyedLabel && state.addressNote && !state.gfsNote && !state.perBrowser && !state.notice && /address-note/.test(state.described), state);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n3) la clé `pp_editeur_copie` du navigateur vaut `copie` : même résultat, rien dans l\'adresse');
{
  const { page, app, requests, seen, context } = await boot({ storage: { [KEY]: 'copie' } });
  const maps = await installedMaps(app);
  check('la carte posée est celle de la copie', maps.length === 1 && maps[0] === copyText.value);
  check('l\'éditeur vient de vendor/editeur/ (plus de trente modules, tous 200), AUCUNE requête vers esm.sh, aucune violation', copyRequests(requests).length > 30 && seen.copy.every(entry => entry.status === 200) && esmRequests(requests).length === 0 && (await violations(app)).length === 0, { copie: copyRequests(requests).length, esm: esmRequests(requests).length, violations: await violations(app) });
  const html = await writeSomething(page, app);
  check('l\'éditeur s\'écrit (Entrée, gras)', written(html), html.slice(0, 120));
  await openSettingsTheme(page, app);
  const open = await boxState(app);
  check('la case est cochée et libre, la phrase « propre à ce navigateur » est là, rien à recharger', open.checked && !open.disabled && !open.greyedLabel && open.perBrowser && !open.gfsNote && !open.addressNote && !open.notice && /per-browser/.test(open.described), open);
  await realClick(page, app, '#settings-offline-editor');
  await sleep(200);
  const off = await boxState(app);
  check('à la vraie souris, la case décochée retire la clé, et la phrase « Rechargez la page » paraît (la copie est encore chargée)', !off.checked && !off.disabled && off.notice && (await stored(app)) === null, { off, key: await stored(app) });
  await realClick(page, app, '#settings-offline-editor');
  await sleep(200);
  const on = await boxState(app);
  check('recochée, la clé revient et la phrase disparaît : le choix et ce qui est chargé s\'accordent', on.checked && !on.notice && (await stored(app)) === 'copie', { on, key: await stored(app) });
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n4) Réglages > Thème > Éditeur hors ligne, seul puis hébergé par GFS');
{
  const { page, app, context } = await boot();
  await openSettingsTheme(page, app);
  const state = await boxState(app);
  check('seul, sans copie : la case est décochée et libre, la phrase « propre à ce navigateur » est là, ni phrase de GFS ni de l\'adresse, rien à recharger',
    !state.checked && !state.disabled && !state.greyedLabel && state.perBrowser && !state.gfsNote && !state.addressNote && !state.notice && /per-browser/.test(state.described), state);
  const title = await app.evaluate(() => document.getElementById('settings-offline-editor-title').textContent);
  const label = await app.evaluate(() => document.querySelector('#settings-offline-editor-label span').textContent);
  check('le titre et la case disent « Éditeur hors ligne » et « Utiliser la copie hors ligne de l\'éditeur »', title === 'Éditeur hors ligne' && label === 'Utiliser la copie hors ligne de l’éditeur', { title, label });
  await context.close();
}
for (const [copy, wording] of [[false, 'GFS a gardé le CDN'], [true, 'GFS a choisi la copie (`copie=editeur` dans l\'adresse)']]) {
  const { page, app, requests, context } = await boot({ hosted: true, search: copy ? '&copie=editeur' : '' });
  await openSettingsTheme(page, app);
  const state = await boxState(app);
  check(`hébergé, ${wording} : la case est grisée et ${copy ? 'cochée' : 'décochée'}, la phrase de la fenêtre « Apps et extensions » le dit, rien à recharger`,
    state.checked === copy && state.disabled && state.greyedLabel && state.gfsNote && !state.addressNote && !state.perBrowser && !state.notice && /gfs-note/.test(state.described), state);
  check(`hébergé, ${wording} : l'éditeur vient ${copy ? 'de la copie, sans esm.sh' : 'd\'esm.sh, sans la copie'}`, copy ? (copyRequests(requests).length > 30 && esmRequests(requests).length === 0) : (esmRequests(requests).length > 20 && copyRequests(requests).length === 0), { esm: esmRequests(requests).length, copie: copyRequests(requests).length });
  await context.close();
}
{
  const { page, app, context } = await boot({ hosted: true, search: '&copie=editeur', lang: 'en' });
  await openSettingsTheme(page, app);
  const texts = await app.evaluate(() => ({
    title: document.getElementById('settings-offline-editor-title').textContent, label: document.querySelector('#settings-offline-editor-label span').textContent,
    gfs: document.getElementById('settings-offline-editor-gfs-note').textContent,
  }));
  check('en anglais : titre, case et phrase de GFS sont traduits', texts.title === 'Offline editor' && texts.label === 'Use the offline copy of the editor' && /Apps and extensions/.test(texts.gfs), texts);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n5) le geste : cocher, recharger, écrire, décocher, la question avant de quitter, recharger, Ctrl + Z');
{
  const { page, app, requests, context } = await boot();
  const waitReloaded = () => app.waitForFunction(() => !window.__marker && typeof EditorCore !== 'undefined' && !!EditorCore.getEditor && !!EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 90000 }).then(() => true, () => false);
  await openSettingsTheme(page, app);
  await realClick(page, app, '#settings-offline-editor');
  await sleep(250);
  const ticked = await boxState(app);
  check('cochée à la vraie souris : la clé vaut « copie », la case reste cochée, la phrase « Rechargez la page » paraît, l\'éditeur chargé est toujours celui d\'esm.sh', ticked.checked && ticked.notice && (await stored(app)) === 'copie' && (await installedMaps(app))[0] === cdnText.value, { ticked, key: await stored(app) });
  // Rien n'attend d'être enregistré : « Recharger maintenant » recharge sans poser de question.
  await app.evaluate(() => { window.__marker = 'avant'; });
  let from = requests.length;
  await realClick(page, app, '#settings-offline-editor-reload-btn');
  const firstReload = await waitReloaded();
  const afterCopy = requests.slice(from);
  check('rien à enregistrer : « Recharger maintenant » recharge la page sans question, et l\'éditeur vient de la copie (plus de trente modules), AUCUNE requête vers esm.sh', firstReload && copyRequests(afterCopy).length > 30 && esmRequests(afterCopy).length === 0 && (await installedMaps(app))[0] === copyText.value, { firstReload, copie: copyRequests(afterCopy).length, esm: esmRequests(afterCopy).length });
  const html = await writeSomething(page, app);
  check('après le rechargement : aucune violation de la politique, l\'éditeur s\'écrit', (await violations(app)).length === 0 && written(html), await violations(app));
  await openSettingsTheme(page, app);
  const reopened = await boxState(app);
  check('Réglages rouverts : la case est cochée et libre, plus rien à recharger', reopened.checked && !reopened.disabled && !reopened.notice, reopened);
  await realClick(page, app, '#settings-offline-editor');
  await sleep(250);
  const cleared = await boxState(app);
  check('décochée : la clé disparaît et la phrase « Rechargez la page » paraît', !cleared.checked && cleared.notice && (await stored(app)) === null, { cleared, key: await stored(app) });
  // Du texte attend d'être enregistré : la question « Ne pas enregistrer / Annuler » passe avant le rechargement. « Annuler » laisse tout en l'état.
  await app.evaluate(() => { window.__marker = 'avant'; });
  from = requests.length;
  await realClick(page, app, '#settings-offline-editor-reload-btn');
  await sleep(500);
  const asked = await questionOpen(app);
  check('avec du texte non enregistré, « Recharger maintenant » pose la question « Modifications non enregistrées » et ne recharge rien', asked && (await app.evaluate(() => window.__marker)) === 'avant', { asked });
  await clickDialog(page, app, 'Annuler');
  await sleep(600);
  const stayed = await app.evaluate(() => ({ marker: window.__marker, text: Editor.getHTML() }));
  check('« Annuler » : la page n\'est pas rechargée, le texte écrit est toujours là, la case reste décochée', stayed.marker === 'avant' && /Bonjour la copie/.test(stayed.text) && !(await boxState(app)).checked && !(await questionOpen(app)), stayed);
  await realClick(page, app, '#settings-offline-editor-reload-btn');
  await sleep(500);
  await clickDialog(page, app, 'Ne pas enregistrer');
  const secondReload = await waitReloaded();
  const afterCdn = requests.slice(from);
  check('« Ne pas enregistrer » : la page se recharge, l\'éditeur revient d\'esm.sh, sans la copie', secondReload && esmRequests(afterCdn).length > 20 && copyRequests(afterCdn).length === 0 && (await installedMaps(app))[0] === cdnText.value, { secondReload, esm: esmRequests(afterCdn).length, copie: copyRequests(afterCdn).length });
  // Ctrl + Z : la case cochée est un pas de l'historique, comme les autres réglages (page rechargée, rien n'a été écrit dans l'éditeur).
  await openSettingsTheme(page, app);
  await realClick(page, app, '#settings-offline-editor');
  await sleep(250);
  await closeSettings(page, app);
  const kept = await stored(app);
  await page.keyboard.press('Control+z');
  await sleep(400);
  const undone = await stored(app);
  const status = await app.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
  check('Ctrl + Z défait la case cochée : la clé est retirée et le coin d\'état le dit', kept === 'copie' && undone === null && /Éditeur hors ligne/.test(status) && /éteint/.test(status), { kept, undone, status });
  await page.keyboard.press('Control+y');
  await sleep(400);
  check('Ctrl + Y la rend', (await stored(app)) === 'copie', await stored(app));
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n6) dans le cadre isolé de GFS (origine « nulle », stockage refusé) : l\'adresse du cadre porte `copie=editeur`');
for (const copy of [true, false]) {
  const { app, requests, seen, context } = await boot({ hosted: true, framed: true, search: copy ? '&copie=editeur' : '' });
  const origin = await app.evaluate(() => ({ origin: window.origin, hosted: GfsLink.hosted }));
  const maps = await installedMaps(app);
  check(`cadre isolé${copy ? ', copie demandée' : ', sans copie'} : l'app tourne dans un cadre d'origine « null », sa carte est celle ${copy ? 'de la copie' : 'du CDN'}`, origin.origin === 'null' && origin.hosted === true && maps.length === 1 && maps[0] === (copy ? copyText.value : cdnText.value), { origin, same: maps[0] === (copy ? copyText.value : cdnText.value) });
  check(`cadre isolé${copy ? ', copie demandée' : ', sans copie'} : l'éditeur démarre ${copy ? 'depuis vendor/editeur/ (plus de trente modules, tous 200), AUCUNE requête vers esm.sh' : 'depuis esm.sh, sans la copie'}`,
    (await editorUp(app)) && (copy ? (copyRequests(requests).length > 30 && seen.copy.every(entry => entry.status === 200) && esmRequests(requests).length === 0) : (esmRequests(requests).length > 20 && copyRequests(requests).length === 0)),
    { esm: esmRequests(requests).length, copie: copyRequests(requests).length });
  check(`cadre isolé${copy ? ', copie demandée' : ', sans copie'} : aucune violation de la politique, aucune requête en échec`, (await violations(app)).length === 0 && seen.failed.length === 0, { violations: await violations(app), failed: seen.failed.slice(0, 3) });
  await context.close();
}

await t.finish();
