#!/usr/bin/env node
// La fenêtre des nouveautés qui s'ouvre toute seule, une fois par personne (js/whats-new.js : openOnFirstConnection, appelée par js/main.js à la fin du démarrage et à chaque changement de droits ; la dernière
// version fermée est la clé `pp_news_seen` de PersonStore, js/person-store.js) : 700x400, à la vraie souris et au vrai clavier, en français clair et en anglais sombre - demande du 2026-10-21 : « lors de leur
// première connexion chaque user a une popup qui décrit les nouveautés, il peut la fermer et elle ne s'affichera plus jamais », liée à la personne ; GFS retient les choix de chaque personne (consigne 024).
// dev-tests/scenarios-whats-new.js vérifie la comparaison des versions et les conditions DANS la page ; ici, le démarrage entier, seul et dans le cadre isolé de GFS :
//   1) SEUL, première ouverture (rien de retenu) : la fenêtre s'ouvre toute seule, sur son premier écran, le focus dedans, tout entière dans le panneau ; « 0 » est retenu (aucune version vue) tant qu'elle est
//      ouverte ; un vrai clic sur « Fermer » la ferme et retient « 1.0 » ; la page rechargée ne la rouvre pas ;
//   2) SEUL, en anglais sombre : Échap, au vrai clavier, la ferme et retient « 1.0 » ;
//   3) SEUL, un navigateur qui ne retient rien (stockage refusé) : elle ne s'ouvre pas toute seule, sans erreur - elle se rouvrirait à chaque chargement ;
//   4) SEUL, `?dev` : le widget se développe, elle ne s'ouvre pas ;
//   5) SEUL, personne en lecture seule : elle ne s'ouvre pas, rien n'est retenu ;
//   6) SEUL, droits qui arrivent tard (plus de 5 secondes), personne qui écrit : rien avant la réponse, puis elle s'ouvre ;
//   7) CHEZ GFS (cadre isolé sans `allow-same-origin`, espace vide) : elle s'ouvre toute seule ; GFS reçoit « 0 » à l'ouverture et « 1.0 » à la fermeture (appels `stockage.ecrire` sans `id`), rien d'autre ; le
//      cadre rechargé ne la rouvre pas et n'écrit rien ;
//   8) CHEZ GFS, version déjà vue (« 1.0 ») ou plus récente (« 2.0 ») : rien ne s'ouvre, rien ne s'écrit ; ouverte à la main par Réglages > Crédits puis fermée, « 2.0 » n'est pas abaissée ;
//   9) CHEZ GFS, version plus ancienne (« 0.9 »), en anglais sombre : elle s'ouvre, « 1.0 » est retenu à la fermeture ;
//  10) CHEZ UNE GFS D'AVANT LA CONSIGNE 024 (pas d'espace pour l'app) : elle ne s'ouvre pas toute seule (la mémoire du cadre est refusée), rien n'est envoyé que la demande de contexte.
// NEWS_FIRST_ONLY=1,7 ne joue que ces scénarios (mise au point) ; rien d'écrit sinon. Lancé par run-headless.mjs (groupe Node « whatsNewFirst », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-whats-new-first.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-whats-new-first', port: Number(process.env.NEWS_FIRST_PORT || 9014) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = seedModels();
const ONLY = (process.env.NEWS_FIRST_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));
const WINDOW = '#pp-news-modal';
const UNSEEN = 'window.__newsUnseen = true;';   // dev-tests/grist-stub.js sème sinon « 99 » : la personne a déjà tout vu
// Les droits de la personne : une ligne de la table « Droits » (comme dev-tests/verify-clean-reading-mouse.mjs), qui met `delayMs` à répondre quand il y en a un (Grist lent : le widget démarre verrouillé par
// précaution au bout de 5 secondes, js/main.js).
const RIGHTS = (readOnly, delayMs = 0) => `
  stub.setVariables('Droits', { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
  stub.setRows('Droits', [{ id: 1, Email: 'personne@exemple.fr', LectureSeule: ${readOnly}, Export: false, Commentaires: true }]);
  stub.setUserEmail('personne@exemple.fr');
  stub.state.options = { droitsAcces: { table: 'Droits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' } };
  ${delayMs ? `const read = window.grist.docApi.fetchTable; window.grist.docApi.fetchTable = async function (tableId) { if (tableId === 'Droits') await new Promise(r => setTimeout(r, ${delayMs})); return read.apply(this, arguments); };` : ''}`;

const shownNow = app => app.evaluate(sel => { const m = document.querySelector(sel); return !!m && getComputedStyle(m).display !== 'none'; }, WINDOW);
// Attend qu'elle s'ouvre (vrai) ou, quand `ms` passe sans qu'elle s'ouvre, rend faux.
async function waitShown(app, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await shownNow(app)) return true; await sleep(120); }
  return shownNow(app);
}
// Elle ne s'ouvre à aucun moment pendant `ms` (le démarrage est fini, rien n'arrive plus après).
async function neverShown(app, ms = 2500) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await shownNow(app)) return false; await sleep(150); }
  return !(await shownNow(app));
}
const keptAlone = app => app.evaluate(() => { try { return localStorage.getItem('pp_news_seen'); } catch (e) { return 'refusé'; } });
// Ce que la fenêtre ouverte montre : le titre, l'écran, le focus, et si elle tient dans le panneau (boîte et bouton « Fermer » compris).
const look = app => app.evaluate((sel) => {
  const win = document.querySelector(sel);
  const box = win.querySelector('.pp-modal-box');
  const r = box.getBoundingClientRect();
  const close = Array.from(win.querySelectorAll('.pp-modal-actions button')).find(b => b.textContent.trim() === I18n.t('common.close'));
  const c = close ? close.getBoundingClientRect() : null;
  const dots = Array.from(win.querySelectorAll('.pp-news-dot'));
  return {
    title: win.querySelector('h3').textContent.trim(), expectedTitle: I18n.t('news.title', { version: '1.0' }),
    screen: dots.findIndex(d => d.getAttribute('aria-selected') === 'true'), screens: dots.length,
    focusInside: box.contains(document.activeElement),
    inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    closeInside: !!c && c.left >= 0 && c.right <= window.innerWidth && c.top >= 0 && c.bottom <= window.innerHeight,
    viewport: [window.innerWidth, window.innerHeight], origin: window.origin,
    storage: (() => { try { localStorage.getItem('pp_theme'); return 'accessible'; } catch (e) { return 'refusé'; } })(),
  };
}, WINDOW);

// Le vrai clic sur le bouton « Fermer » : la souris approche, puis clique (le cadre de l'app est à l'angle de la page : mêmes coordonnées).
async function clickClose(page, app) {
  const at = await app.evaluate((sel) => {
    const b = Array.from(document.querySelectorAll(sel + ' .pp-modal-actions button')).find(x => x.textContent.trim() === I18n.t('common.close') && !x.hidden);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, WINDOW);
  if (!at) throw new Error('bouton « Fermer » introuvable');
  await page.mouse.move(at.x - 20, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(60);
  await page.mouse.click(at.x, at.y);
  await sleep(300);
}
const centerOf = (app, selector) => app.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, selector);
async function realClick(page, app, selector) {
  const at = await centerOf(app, selector);
  if (!at) throw new Error('introuvable : ' + selector);
  await page.mouse.move(at.x - 14, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(at.x, at.y);
  await sleep(250);
}
// Réglages > Crédits > « Voir les nouveautés », au vrai clic.
async function openFromCredits(page, app) {
  await realClick(page, app, '#v2-btn-settings');
  await app.waitForFunction(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none', null, { timeout: 5000 });
  await realClick(page, app, '#settings-modal .settings-tab[data-settings-tab="credits"]');
  await realClick(page, app, '#settings-credits-news');
}

const gfsWrites = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'stockage.ecrire').map(c => ({ args: c.args, id: c.id })));
const gfsSpace = page => page.evaluate(() => (window.__gfsStub.stockage ? Object.assign({}, window.__gfsStub.stockage) : null));
const gfsCalls = page => page.evaluate(() => window.__gfsStub.calls.map(c => c.nom));
const gfsContexts = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'contexte').length);
const writtenKeys = writes => writes.map(w => w.args.cle + '=' + w.args.valeur);

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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(1)) {
  console.log('\n1) Seul, première ouverture : la fenêtre s\'ouvre toute seule, se ferme au clic, ne revient pas');
  const { page, app } = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', init: UNSEEN });
  const opened = await waitShown(app);
  check('rien n\'est retenu, la fenêtre des nouveautés s\'ouvre toute seule après le démarrage', opened === true, opened);
  const l = await look(app);
  check('« Nouveautés de la version 1.0 », premier des neuf écrans, le focus dans la fenêtre', l.title === l.expectedTitle && l.title === 'Nouveautés de la version 1.0' && l.screen === 0 && l.screens === 9 && l.focusInside, l);
  check('elle tient tout entière dans le panneau de 700 × 400, « Fermer » compris', l.inside && l.closeInside && l.viewport[0] === 700 && l.viewport[1] === 400, l);
  check('tant qu\'elle est ouverte, « 0 » est retenu : aucune version n\'est vue', (await keptAlone(app)) === '0', await keptAlone(app));
  await clickClose(page, app);
  check('un vrai clic sur « Fermer » la ferme et retient « 1.0 »', (await shownNow(app)) === false && (await keptAlone(app)) === '1.0', { shown: await shownNow(app), kept: await keptAlone(app) });
  await page.reload({ waitUntil: 'load' });
  await app.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 60000 });
  check('la page rechargée ne la rouvre pas, et « 1.0 » reste retenu', (await neverShown(app)) === true && (await keptAlone(app)) === '1.0', { kept: await keptAlone(app) });
  await openFromCredits(page, app);
  check('Réglages > Crédits > « Voir les nouveautés » l\'ouvre encore à la demande ; la fermer ne change pas « 1.0 »', (await waitShown(app, 3000)) === true, null);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Échap ferme la fenêtre seule (les Réglages restent), « 1.0 » intact', (await shownNow(app)) === false && (await keptAlone(app)) === '1.0', await keptAlone(app));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(2)) {
  console.log('\n2) Seul, en anglais sombre : Échap la ferme et retient la version');
  const { page, app } = await t.openPage({ hosted: false, seed: SEED, lang: 'en', colorScheme: 'dark', init: UNSEEN });
  const opened = await waitShown(app);
  const l = opened ? await look(app) : null;
  check('en anglais, elle s\'ouvre toute seule : « What’s new in version 1.0 » (le titre de la page), premier écran, focus dedans, tout entière dans le panneau',
    opened === true && l.title === 'What’s new in version 1.0' && l.title === l.expectedTitle && l.screen === 0 && l.focusInside && l.inside && l.closeInside, l);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Échap, au vrai clavier, la ferme et retient « 1.0 »', (await shownNow(app)) === false && (await keptAlone(app)) === '1.0', { shown: await shownNow(app), kept: await keptAlone(app) });
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(3)) {
  console.log('\n3) Seul, un navigateur qui ne retient rien : elle ne s\'ouvre pas toute seule');
  const denied = `${UNSEEN} Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('stockage refusé'); } });`;
  const { app, page } = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', init: denied });
  const never = await neverShown(app, 3500);
  const get = await app.evaluate(() => PersonStore.get('pp_news_seen'));
  check('le stockage refuse tout (navigation privée) : la fenêtre ne s\'ouvre à aucun moment, PersonStore ne lève rien', never === true && get === null, { never, get });
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(4)) {
  console.log('\n4) Seul, `?dev` : le widget se développe, rien à accueillir');
  const { app, page } = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', init: UNSEEN, search: '?dev' });
  check('avec ?dev dans l\'adresse, la fenêtre ne s\'ouvre pas et rien n\'est retenu', (await neverShown(app)) === true && (await keptAlone(app)) === null, await keptAlone(app));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(5)) {
  console.log('\n5) Seul, personne en lecture seule : elle ne s\'ouvre pas');
  const { app, page } = await t.openPage({ hosted: false, seed: SEED + RIGHTS(true), lang: 'fr', init: UNSEEN });
  const rights = await app.evaluate(() => ({ readOnly: AccessRights.get().readOnly, state: AccessRights.getStatus().state }));
  check('la personne est bien en lecture seule (droits confirmés)', rights.readOnly === true && rights.state === 'found', rights);
  check('la fenêtre ne s\'ouvre pas, rien n\'est retenu', (await neverShown(app)) === true && (await keptAlone(app)) === null, await keptAlone(app));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(6)) {
  console.log('\n6) Seul, droits qui arrivent tard (7 secondes), personne qui écrit : rien avant la réponse, puis elle s\'ouvre');
  const { app, page } = await t.openPage({ hosted: false, seed: SEED + RIGHTS(false, 7000), lang: 'fr', init: UNSEEN, ready: false });
  let sawPending = false;
  let firstShown = null;
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline && !firstShown) {
    const now = await app.evaluate((sel) => {
      const m = document.querySelector(sel);
      return { shown: !!m && getComputedStyle(m).display !== 'none', state: typeof AccessRights !== 'undefined' ? AccessRights.getStatus().state : null, editor: typeof EditorCore !== 'undefined' && !!EditorCore.getEditor && !!EditorCore.getEditor() };
    }, WINDOW).catch(() => null);
    if (now) {
      if (now.state === 'pending') sawPending = true;
      if (now.shown) firstShown = now;
    }
    await sleep(100);
  }
  check('les droits sont restés en attente pendant le démarrage (la table des droits tarde)', sawPending === true, sawPending);
  check('la fenêtre ne s\'ouvre qu\'à la réponse des droits, pas avant (changement de droits : js/main.js, onAccessRightsChange)', !!firstShown && firstShown.state !== 'pending' && firstShown.state !== 'error', firstShown);
  const rights = await app.evaluate(() => ({ readOnly: AccessRights.get().readOnly, state: AccessRights.getStatus().state }));
  check('la personne écrit (droits confirmés) et la fenêtre est ouverte, « 0 » retenu', rights.readOnly === false && (await shownNow(app)) === true && (await keptAlone(app)) === '0', { rights, kept: await keptAlone(app) });
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let round = null;
if (wanted(7)) {
  console.log('\n7) Chez GFS, espace vide : elle s\'ouvre toute seule, GFS reçoit « 0 » puis « 1.0 », le cadre rechargé ne la rouvre pas');
  round = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { stockage: {} } });
  const { page, app } = round;
  const opened = await waitShown(app);
  const l = opened ? await look(app) : null;
  check('le cadre est isolé (origine « null », son propre stockage refusé) et la fenêtre s\'ouvre toute seule', opened === true && l.origin === 'null' && l.storage === 'refusé', l);
  check('premier écran, focus dedans, tout entière dans le panneau', !!l && l.screen === 0 && l.focusInside && l.inside && l.closeInside, l);
  const writes = await gfsWrites(page);
  check('GFS a reçu UN appel `stockage.ecrire` sans `id` : `pp_news_seen` = 0 (aucune version vue), et c\'est tout', JSON.stringify(writtenKeys(writes)) === JSON.stringify(['pp_news_seen=0']) && writes[0].id === undefined, writes);
  await clickClose(page, app);
  const writesAfter = await gfsWrites(page);
  check('un vrai clic sur « Fermer » la ferme et GFS retient `pp_news_seen` = 1.0, rien d\'autre', (await shownNow(app)) === false && JSON.stringify(writtenKeys(writesAfter)) === JSON.stringify(['pp_news_seen=0', 'pp_news_seen=1.0']) && JSON.stringify(await gfsSpace(page)) === JSON.stringify({ pp_news_seen: '1.0' }), { writesAfter, space: await gfsSpace(page) });
  await markPage(app);
  await app.evaluate(() => location.reload());
  const back = await waitThrough(app, READY);
  check('le cadre repart et redevient prêt', back === true, back);
  check('le cadre rechargé ne rouvre pas la fenêtre et n\'écrit rien : GFS garde `pp_news_seen` = 1.0', (await neverShown(app)) === true && (await gfsWrites(page)).length === 2 && JSON.stringify(await gfsSpace(page)) === JSON.stringify({ pp_news_seen: '1.0' }), { writes: (await gfsWrites(page)).length, space: await gfsSpace(page) });
  check('le contexte a été redemandé par le cadre rechargé (deux en tout)', (await gfsContexts(page)) === 2, await gfsContexts(page));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(8)) {
  console.log('\n8) Chez GFS, version déjà vue ou plus récente : rien ne s\'ouvre, rien ne s\'écrit');
  const seen = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { stockage: { pp_news_seen: '1.0' } } });
  check('« 1.0 » déjà gardée : la fenêtre ne s\'ouvre pas, GFS ne reçoit aucune écriture', (await neverShown(seen.app)) === true && (await gfsWrites(seen.page)).length === 0, await gfsWrites(seen.page));
  await seen.page.context().close();

  const newer = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { stockage: { pp_news_seen: '2.0' } } });
  check('« 2.0 » gardée (une app plus neuve l\'a fermée) : rien ne s\'ouvre, rien ne s\'écrit', (await neverShown(newer.app)) === true && (await gfsWrites(newer.page)).length === 0, await gfsWrites(newer.page));
  await openFromCredits(newer.page, newer.app);
  check('à la demande, Réglages > Crédits l\'ouvre quand même', (await waitShown(newer.app, 3000)) === true, null);
  await clickClose(newer.page, newer.app);
  check('la fermer n\'abaisse pas « 2.0 » et n\'écrit rien chez GFS', (await shownNow(newer.app)) === false && (await gfsWrites(newer.page)).length === 0 && (await gfsSpace(newer.page)).pp_news_seen === '2.0', { writes: await gfsWrites(newer.page), space: await gfsSpace(newer.page) });
  await newer.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(9)) {
  console.log('\n9) Chez GFS, version plus ancienne, en anglais sombre : elle s\'ouvre, la version est retenue à la fermeture');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'en', colorScheme: 'dark', stub: { langue: 'en', stockage: { pp_news_seen: '0.9' } } });
  const opened = await waitShown(app);
  const l = opened ? await look(app) : null;
  check('« 0.9 » gardée, la version de la fenêtre est « 1.0 » : elle s\'ouvre toute seule, dans la langue de GFS (l\'anglais), tout entière dans le panneau', opened === true && l.title === 'What’s new in version 1.0' && l.title === l.expectedTitle && l.screen === 0 && l.focusInside && l.inside && l.closeInside, l);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Échap la ferme ; GFS retient `pp_news_seen` = 1.0 (la même valeur qu\'à l\'ouverture, puis la nouvelle version)', (await shownNow(app)) === false && (await gfsSpace(page)).pp_news_seen === '1.0' && JSON.stringify(writtenKeys(await gfsWrites(page))) === JSON.stringify(['pp_news_seen=0.9', 'pp_news_seen=1.0']), { space: await gfsSpace(page), writes: await gfsWrites(page) });
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(10)) {
  console.log('\n10) Chez une GFS d\'avant la consigne 024 : elle ne s\'ouvre pas toute seule');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr' });
  const l = await app.evaluate(() => ({ origin: window.origin, shared: PersonStore.shared(), space: GfsLink.hasStorage() }));
  check('le contexte n\'a pas d\'espace pour l\'app et le cadre refuse son stockage : la fenêtre ne s\'ouvre à aucun moment', l.origin === 'null' && l.shared === false && l.space === false && (await neverShown(app, 3500)) === true, l);
  const calls = await gfsCalls(page);
  check('rien n\'est envoyé à GFS que la demande de contexte', calls.length > 0 && calls.every(nom => nom === 'contexte'), calls);
  await page.context().close();
}

await t.finish();
