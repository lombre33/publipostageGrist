#!/usr/bin/env node
// La copie figée de l'éditeur, SEUL mode de l'éditeur (consignes 066 et 107 de GFS) : l'éditeur (TipTap et ProseMirror) démarre toujours depuis vendor/editeur/, jamais depuis un autre site. Le vrai widget
// (index.html servi tel quel, faux Grist de dev-tests/grist-stub.js) à 700x400, dans un vrai Chromium SANS contournement de la politique de sécurité (`bypassCSP: false`) : une requête vers un autre site, ou un
// module de la copie refusé, se verrait. La carte d'importation est celle d'index.html, écrite par l'outil du kit (`node kit/outils/bibliotheques.mjs --copies`) : UNE seule, ordinaire, sans script de choix.
//   1) seul : la page n'a qu'une carte d'importation, dont chaque module de l'éditeur est un fichier de vendor/editeur/ ; l'éditeur démarre, plus de trente fichiers de la copie sont demandés, tous répondus 200 ;
//      AUCUNE requête vers un autre site (ni l'ancien CDN de l'éditeur, dont le nom n'est pas écrit ici en entier : la recherche « plus aucun appel à cet hôte » reste vide), aucune violation de la politique, aucune
//      requête en échec ; il s'écrit au vrai clavier (la touche Entrée d'abord : elle plantait quand deux instances de ProseMirror se chargeaient) ;
//   2) Réglages > Thème > « Éditeur hors ligne » : la case est cochée ET grisée, la phrase « c'est son seul mode pour l'instant » dit pourquoi (français, puis anglais), son contraste tient en clair et en sombre ;
//      un vrai clic sur la case ou sur son libellé ne change rien (ni case, ni clé du navigateur, ni demande de rechargement) ;
//   3) l'ancien choix ne lit plus rien : `copie=editeur` dans l'adresse et la clé `pp_editeur_copie` du navigateur (valant `copie`, ou autre chose) donnent la même carte, la même case, les mêmes fichiers - et la clé reste
//      telle qu'elle est (rien ne la lit ni ne l'écrit) ;
//   4) hébergé par GFS (`?gfs=0`, le GFS simulé) : même éditeur, même case grisée, mêmes fichiers ; dans le cadre isolé de GFS (origine « nulle », stockage refusé), l'éditeur démarre depuis la copie sans violation.
// Sur le code d'avant la 107 (la carte du CDN par défaut, la copie sur demande), 1) échouait : l'éditeur venait d'un autre site.
// Lancé par run-headless.mjs (groupe Node « editorCopy », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-editor-copy.mjs
import { start } from './gfs-page.mjs';

const t = await start({ name: 'verify-editor-copy', port: Number(process.env.EDITOR_COPY_PORT || 9216) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KEY = 'pp_editeur_copie';
// L'ancien CDN de l'éditeur : son nom est écrit en morceaux, pour que la recherche de cet hôte dans le code reste vide (consigne 107).
const OLD_CDN_HOST = ['esm', 'sh'].join('.');
const hostOf = url => { try { return new URL(url).host; } catch (e) { return ''; } };
const oldCdnRequests = requests => requests.filter(url => hostOf(url) === OLD_CDN_HOST);
const copyRequests = requests => requests.filter(url => url.includes('/vendor/editeur/'));
// Ce que l'app peut demander à d'autres sites au démarrage : l'API de Grist (le faux Grist la remplace) et les polices de Google (coupées par l'essai). Rien d'autre, rien de l'éditeur.
const ALLOWED = new Set(['docs.getgrist.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const foreignRequests = requests => requests.filter(url => /^https?:/.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url) && !ALLOWED.has(hostOf(url)));

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

async function openSettingsTheme(page, app) {
  await realClick(page, app, '#v2-btn-settings');
  await sleep(300);
  await realClick(page, app, '#settings-modal .settings-tab[data-settings-tab="theme"]');
  await sleep(200);
  // Sans la case, rien de ce qui suit n'a de sens : l'essai le dit et s'arrête.
  if (!(await app.evaluate(() => !!document.getElementById('settings-offline-editor')))) {
    check('Réglages > Thème porte la case « Éditeur hors ligne »', false);
    await t.finish();
  }
}
// L'état de la case et de ses phrases, tel que la personne le voit (une phrase `hidden` ne compte pas), et le contraste de la phrase « seul mode » (le texte contre le fond que la personne voit derrière).
const boxState = app => app.evaluate(() => {
  const box = document.getElementById('settings-offline-editor');
  const shown = id => { const el = document.getElementById(id); return !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0; };
  const channels = text => (/rgba?\(([^)]+)\)/.exec(text) || [, '0,0,0,0'])[1].split(',').map(Number);
  const luminance = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const phrase = document.getElementById('settings-offline-editor-only-mode');
  if (!box || !phrase) return { missing: true, contrast: 0 }; // sur le code d'avant la 107 la phrase n'existe pas : les contrôles échouent proprement, ils ne plantent pas
  let background = [255, 255, 255];
  for (let el = phrase; el; el = el.parentElement) { const c = channels(getComputedStyle(el).backgroundColor); if ((c[3] === undefined ? 1 : c[3]) > 0.99) { background = c.slice(0, 3); break; } }
  const fore = channels(getComputedStyle(phrase).color).slice(0, 3);
  const [hi, lo] = [luminance(fore), luminance(background)].sort((a, b) => b - a);
  return {
    checked: box.checked, disabled: box.disabled, greyedLabel: document.getElementById('settings-offline-editor-label').classList.contains('is-disabled'),
    onlyMode: shown('settings-offline-editor-only-mode'), onlyModeText: phrase.textContent.trim(), reloadNotice: !!document.getElementById('settings-offline-editor-reload-notice'), gfsNote: !!document.getElementById('settings-offline-editor-gfs-note'),
    described: box.getAttribute('aria-describedby'), contrast: Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100,
    title: document.getElementById('settings-offline-editor-title').textContent, label: document.querySelector('#settings-offline-editor-label span').textContent,
  };
});

const reference = { map: null };

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n1) seul : une seule carte d\'importation, l\'éditeur vient de vendor/editeur/, aucune requête vers un autre site');
{
  const { page, app, requests, seen, context } = await boot();
  const maps = await installedMaps(app);
  reference.map = maps[0] || null;
  const entries = reference.map ? JSON.parse(reference.map).imports : {};
  const editorEntries = Object.entries(entries).filter(([name]) => !name.startsWith('kit/'));
  check('la page porte UNE seule carte d\'importation, ordinaire (plus de carte de CDN en données, plus de script de choix)', maps.length === 1 && (await app.evaluate(() => !document.getElementById('gfs-carte-cdn') && !document.getElementById('gfs-carte-copie'))), { cartes: maps.length });
  check('chaque module de l\'éditeur de la carte est un fichier de vendor/editeur/ (plus de trente, aucune adresse d\'un autre site)', editorEntries.length > 30 && editorEntries.every(([, target]) => /^\.\/vendor\/editeur\/[^:]+$/.test(target)), { modules: editorEntries.length, autres: editorEntries.filter(([, target]) => !/^\.\/vendor\/editeur\//.test(target)).slice(0, 3) });
  check('l\'éditeur est démarré (« Widget prêt »)', await editorUp(app));
  const copy = copyRequests(requests);
  check('plus de trente fichiers de vendor/editeur/ sont demandés, tous répondus 200', copy.length > 30 && seen.copy.length >= copy.length && seen.copy.every(entry => entry.status === 200), { demandes: copy.length, reponses: seen.copy.length, autres: seen.copy.filter(entry => entry.status !== 200).slice(0, 3) });
  check('AUCUNE requête vers l\'ancien CDN de l\'éditeur', oldCdnRequests(requests).length === 0, oldCdnRequests(requests).slice(0, 5));
  check('AUCUNE requête vers un autre site au démarrage (l\'API de Grist et les polices mises à part)', foreignRequests(requests).length === 0, foreignRequests(requests).slice(0, 5));
  check('aucune violation de la politique de sécurité', (await violations(app)).length === 0, await violations(app));
  const html = await writeSomething(page, app);
  check('l\'éditeur s\'écrit au vrai clavier : Entrée donne deux paragraphes (une seule instance de ProseMirror), Ctrl + B met en gras', written(html), html.slice(0, 160));
  check('aucune requête en échec', seen.failed.length === 0, seen.failed.slice(0, 3));
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n2) Réglages > Thème > Éditeur hors ligne : cochée et grisée, la phrase dit pourquoi (français, anglais, clair, sombre) ; un clic ne change rien');
for (const [lang, colorScheme, title, label, phrase] of [
  ['fr', 'light', 'Éditeur hors ligne', 'Utiliser la copie hors ligne de l’éditeur', 'L’éditeur est servi par la copie de l’application : c’est son seul mode pour l’instant.'],
  ['fr', 'dark', 'Éditeur hors ligne', 'Utiliser la copie hors ligne de l’éditeur', 'L’éditeur est servi par la copie de l’application : c’est son seul mode pour l’instant.'],
  ['en', 'light', 'Offline editor', 'Use the offline copy of the editor', 'The editor is served by the application’s own copy: it is its only mode for now.'],
  ['en', 'dark', 'Offline editor', 'Use the offline copy of the editor', 'The editor is served by the application’s own copy: it is its only mode for now.'],
]) {
  const { page, app, context } = await boot({ lang, colorScheme });
  await openSettingsTheme(page, app);
  const state = await boxState(app);
  check(`${lang}, ${colorScheme === 'dark' ? 'sombre' : 'clair'} : la case est cochée ET grisée, la phrase « seul mode » est là et décrit la case, ni phrase de GFS ni demande de rechargement`,
    state.checked && state.disabled && state.greyedLabel && state.onlyMode && /only-mode/.test(state.described) && !state.reloadNotice && !state.gfsNote, state);
  check(`${lang}, ${colorScheme === 'dark' ? 'sombre' : 'clair'} : titre, case et phrase sont dans la langue (« ${phrase.slice(0, 32)}… »)`, state.title === title && state.label === label && state.onlyModeText === phrase, { title: state.title, label: state.label, phrase: state.onlyModeText });
  check(`${lang}, ${colorScheme === 'dark' ? 'sombre' : 'clair'} : la phrase se lit (contraste d'au moins 4,5 : 1)`, state.contrast >= 4.5, { contraste: state.contrast });
  if (lang === 'fr' && colorScheme === 'light') {
    await realClick(page, app, '#settings-offline-editor');
    await sleep(200);
    await realClick(page, app, '#settings-offline-editor-label span');
    await sleep(200);
    const after = await boxState(app);
    check('à la vraie souris, un clic sur la case puis sur son libellé ne change rien : toujours cochée et grisée, aucune clé écrite dans le navigateur, rien à recharger', after.checked && after.disabled && !after.reloadNotice && (await stored(app)) === null, { after, key: await stored(app) });
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n3) l\'ancien choix ne lit plus rien : `copie=editeur` dans l\'adresse, la clé `pp_editeur_copie` du navigateur');
for (const [wording, options] of [
  ['avec `?copie=editeur` dans l\'adresse', { search: '?copie=editeur' }],
  ['avec la clé `pp_editeur_copie` à « copie »', { storage: { [KEY]: 'copie' } }],
  ['avec la clé `pp_editeur_copie` à une autre valeur', { storage: { [KEY]: 'cdn' } }],
]) {
  const { page, app, requests, seen, context } = await boot(options);
  const maps = await installedMaps(app);
  check(`${wording} : la carte posée est la même, texte pour texte`, maps.length === 1 && maps[0] === reference.map, { cartes: maps.length, pareille: maps[0] === reference.map });
  check(`${wording} : l'éditeur démarre depuis vendor/editeur/ (plus de trente fichiers, tous 200), aucune requête vers un autre site, aucune violation`,
    (await editorUp(app)) && copyRequests(requests).length > 30 && seen.copy.every(entry => entry.status === 200) && foreignRequests(requests).length === 0 && (await violations(app)).length === 0, { copie: copyRequests(requests).length, autres: foreignRequests(requests).slice(0, 3), violations: await violations(app) });
  const html = await writeSomething(page, app);
  check(`${wording} : l'éditeur s'écrit (Entrée, gras)`, written(html), html.slice(0, 120));
  await openSettingsTheme(page, app);
  const state = await boxState(app);
  check(`${wording} : la case est la même (cochée et grisée, avec la phrase « seul mode »), et la clé du navigateur n'a pas bougé`, state.checked && state.disabled && state.greyedLabel && state.onlyMode && !state.reloadNotice && (await stored(app)) === (options.storage ? options.storage[KEY] : null), { state, key: await stored(app) });
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n4) hébergé par GFS (le GFS simulé), puis dans son cadre isolé (origine « nulle », stockage refusé)');
{
  const { page, app, requests, seen, context } = await boot({ hosted: true });
  const maps = await installedMaps(app);
  check('hébergé : la même carte, l\'éditeur vient de vendor/editeur/ (plus de trente fichiers, tous 200), aucune requête vers un autre site que ceux de GFS et de Grist, aucune violation',
    maps.length === 1 && maps[0] === reference.map && (await editorUp(app)) && copyRequests(requests).length > 30 && seen.copy.every(entry => entry.status === 200) && oldCdnRequests(requests).length === 0 && (await violations(app)).length === 0,
    { cartes: maps.length, pareille: maps[0] === reference.map, copie: copyRequests(requests).length, ancien: oldCdnRequests(requests).length, violations: await violations(app) });
  await openSettingsTheme(page, app);
  const state = await boxState(app);
  check('hébergé : la case est cochée et grisée avec la phrase « seul mode », rien à recharger (la fenêtre « Apps et extensions » de GFS n\'a plus de ligne Éditeur à lui proposer)', state.checked && state.disabled && state.greyedLabel && state.onlyMode && !state.reloadNotice && !state.gfsNote, state);
  await context.close();
}
{
  const { app, requests, seen, context } = await boot({ hosted: true, framed: true });
  const origin = await app.evaluate(() => ({ origin: window.origin, hosted: GfsLink.hosted }));
  const maps = await installedMaps(app);
  check('cadre isolé : l\'app tourne dans un cadre d\'origine « null », hébergée par GFS, avec la même carte', origin.origin === 'null' && origin.hosted === true && maps.length === 1 && maps[0] === reference.map, { origin, pareille: maps[0] === reference.map });
  check('cadre isolé : l\'éditeur démarre depuis vendor/editeur/ (plus de trente fichiers, tous 200), AUCUNE requête vers l\'ancien CDN, aucune violation, aucune requête en échec',
    (await editorUp(app)) && copyRequests(requests).length > 30 && seen.copy.every(entry => entry.status === 200) && oldCdnRequests(requests).length === 0 && (await violations(app)).length === 0 && seen.failed.length === 0,
    { copie: copyRequests(requests).length, ancien: oldCdnRequests(requests).length, violations: await violations(app), failed: seen.failed.slice(0, 3) });
  await context.close();
}

await t.finish();
