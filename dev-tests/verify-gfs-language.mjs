#!/usr/bin/env node
// La langue d'une app que Grist Factory Suite héberge est celle de GFS (consigne GFS 019, contrats de GFS 5.2 point 6) : UN seul choix par personne, pour GFS et toutes ses apps, 700x400, à la vraie souris et
// au vrai clavier, l'app dans le cadre isolé de GFS (sans `allow-same-origin`, stockage refusé) que porte une page parente qui joue GFS (dev-tests/gfs-stub.js). GFS dit la langue de deux façons : `contexte.langue`
// (celle qui vaut maintenant) et le paramètre `language` de l'adresse du cadre (celle de sa CRÉATION : GFS ne recharge jamais un cadre), puis l'événement `langue`, une fois par changement.
//  1) AU DÉPART la page prend la langue de GFS, avant celle du navigateur et celle qu'elle avait gardée ; seule, ou avec une GFS qui ne la donne pas, l'ordre d'avant ne change pas.
//  2) RÉGLAGES : les deux cases de langue sont GRISÉES (jamais masquées), avec la phrase qui dit où la choisir (clair et sombre, français et anglais, sans défilement) ; un clic dessus ne fait rien. Seule, ou avec
//     une GFS qui ne donne pas la langue, les cases restent actives et la phrase cachée.
//  3) L'ÉVÉNEMENT `langue`, rien en attente : la page se recharge dans la bonne langue et rouvre le modèle où la personne était (le fragment `#pp-open=…&pp-lang=…`, lu puis effacé, car le cadre garde son adresse
//     d'origine et le stockage lui est refusé), dans les deux sens ; l'événement qui arrive à une page qui n'avait pas la langue (contexte sans `langue`) est suivi de même ; « Recharger maintenant » de la touche de
//     déclenchement garde la langue de GFS (un seul rechargement, jamais deux).
//  4) UNE MODIFICATION ATTEND d'être enregistrée : la question « Modifications non enregistrées » passe d'abord, « Annuler » laisse la page, sa langue et le texte tapé (un changement suivant la repose), « Enregistrer »
//     écrit le modèle avant que la page parte, « Abandonner » la laisse partir sans l'écrire.
//  5) UNE LANGUE CHANGÉE PENDANT LE RECHARGEMENT (GFS n'envoie rien à un cadre absent) est rattrapée au démarrage, une fois le modèle ouvert.
//  6) FILETS : une langue qui ne change rien, qui n'est ni `fr` ni `en`, ou un message qui ne vient pas du parent ne rechargent rien ; une adresse qu'on ne peut pas modifier ne fait pas recharger la page (elle
//     repartirait dans l'ancienne langue et s'y reprendrait sans fin).
// Les modifications en attente (4) se jouent hors du cadre isolé, enregistrement automatique coupé (le cadre refuse le stockage où ce réglage vit : il y écrirait la frappe dans les 2,5 secondes).
// Lancé par run-headless.mjs (groupe Node « gfsLanguage », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-language.mjs
import { join } from 'node:path';
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-language', port: Number(process.env.GFS_LANGUAGE_PORT || 8915) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = seedModels();
// GFS_LANGUAGE_SHOTS=<dossier> : garde une capture de Réglages (français clair, anglais sombre) pour la regarder, rien d'écrit sinon.
const SHOTS = process.env.GFS_LANGUAGE_SHOTS || '';
const TYPED = 'MARQUETAPEE';
// Le faux Grist (dev-tests/grist-stub.js) dit le navigateur français tant qu'un test ne fixe pas `window.__browserLanguages` : ce script le met en anglais, pour montrer que la langue de GFS passe avant.
const ENGLISH_BROWSER = "window.__browserLanguages = ['en-US', 'en'];";
const NOTE = {
  fr: 'La langue se choisit dans Grist Factory Suite (bouton Langue de l’explorateur).',
  en: 'The language is chosen in Grist Factory Suite (Language button in the explorer).',
};
// Ce que GFS demande d'ouvrir au démarrage (consigne 010) : « Départ C », le modèle 3 du faux Grist.
const C_AT_START = { fichier: { id: '3', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' };

// Le vrai clic, dans les coordonnées de la page rendue (le cadre de l'app est à son coin, sans bordure ; `app` est `page` quand l'app n'est pas encadrée) : l'élément est amené à l'écran, la souris approche, puis clique.
async function realClick(page, app, selector) {
  const at = await app.evaluate(sel => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  await page.mouse.move(at.x - 14, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(at.x, at.y);
}
// Ce que la page montre : sa langue, celle que GfsLink dit de GFS ('absent' : le code d'avant la consigne 019), l'info-bulle du bouton Sommaire (la barre dans la langue de la page), le modèle ouvert, le fragment de l'adresse.
const stateOf = app => app.evaluate(() => ({
  lang: I18n.getLang(),
  htmlLang: document.documentElement.lang,
  gfs: typeof GfsLink.language === 'function' ? GfsLink.language() : 'absent',
  tip: document.getElementById('v2-btn-toc').getAttribute('data-tip') || '',
  id: String(Templates.getCurrentId()),
  name: (document.getElementById('template-name') || {}).value || '',
  hash: location.hash,
  marker: window.__marker || null,
  origin: window.origin,
  stored: (() => { try { return localStorage.getItem('pp_lang'); } catch (e) { return 'refusé'; } })(),
  text: (document.querySelector('.tiptap') || {}).textContent || '',
})).catch(e => ({ error: String(e) }));
const markPage = (app, value = 'avant') => app.evaluate(v => { window.__marker = v; }, value);
const FRENCH = /sommaire/i;
const ENGLISH = /table of contents/i;
// La page vient de (re)partir : elle n'a plus le repère posé avant, son éditeur répond et son coin d'état dit qu'elle est prête.
const READY = () => !window.__marker && typeof EditorCore !== 'undefined' && !!EditorCore.getEditor && !!EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || '');
// Une attente que le rechargement coupe (« Execution context was destroyed ») est reprise dans la nouvelle page ; vrai quand la condition est remplie avant le délai.
async function waitThrough(app, condition, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { await app.waitForFunction(condition, null, { timeout: Math.max(500, deadline - Date.now()) }); return true; }
    catch (e) { if (/Timeout/i.test(String(e))) return false; await sleep(250); }
  }
  return false;
}
const reloaded = (app, ms = 30000) => waitThrough(app, READY, ms);
// Rien ne part dans le délai donné : le repère posé avant est toujours là.
async function staysPut(app, ms = 1500) {
  await sleep(ms);
  return (await app.evaluate(() => window.__marker || null).catch(() => null)) !== null;
}
const contextCalls = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'contexte').length);
// La personne ouvre un autre modèle par la liste des modèles (`#template-select`, le point de passage de toute ouverture).
async function pickTemplate(app, id) {
  await app.evaluate(v => { const s = document.getElementById('template-select'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, String(id));
  await app.waitForFunction(v => String(Templates.getCurrentId()) === v, String(id), { timeout: 10000 }).catch(() => {});
  await sleep(300);
}
// Réglages ouvert sur l'onglet « Langue », à la vraie souris.
async function openLanguageTab(page, app) {
  await realClick(page, app, '#v2-btn-settings');
  await app.waitForFunction(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none', null, { timeout: 5000 }).catch(() => {});
  await sleep(250);
  await realClick(page, app, '#settings-modal .settings-tab[data-settings-tab="language"]');
  await sleep(150);
}
// L'onglet « Langue » tel qu'on le voit : cases (cochée, grisée), libellés visibles et leur opacité, phrase (cachée ou non, son texte, dans la fenêtre), contenu de l'onglet sans défilement, fenêtre dans le panneau.
const languagePanel = app => app.evaluate(() => {
  const radios = Array.from(document.querySelectorAll('input[name="settings-lang"]'));
  const note = document.getElementById('settings-language-gfs-note');
  const box = document.querySelector('#settings-modal .settings-modal-content');
  const body = document.querySelector('#settings-modal .settings-body');
  const shown = el => !!el && el.getClientRects().length > 0;
  const within = (el, outer) => { const a = el.getBoundingClientRect(), b = outer.getBoundingClientRect(); return a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5; };
  const boxRect = box.getBoundingClientRect();
  return {
    radios: radios.map(r => r.value + ':' + (r.checked ? 'coché' : 'décoché') + ':' + (r.disabled ? 'grisé' : 'actif')).join(' '),
    labelsShown: radios.every(r => shown(r) && shown(r.parentElement)),
    labelsGreyed: radios.map(r => r.parentElement.classList.contains('is-disabled')),
    opacity: radios.map(r => parseFloat(getComputedStyle(r.parentElement).opacity)),
    describedBy: radios.map(r => r.getAttribute('aria-describedby')),
    note: note ? { hidden: note.hidden, shown: shown(note), text: note.textContent.trim(), inBody: shown(note) && within(note, body) } : null,
    noScroll: body.scrollHeight <= body.clientHeight + 1,
    inPanel: boxRect.left >= 0 && boxRect.top >= 0 && boxRect.right <= innerWidth && boxRect.bottom <= innerHeight,
  };
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n1) Au départ, la page prend la langue de GFS (avant le navigateur, avant ce qu’elle avait gardé) ; 2) dans Réglages, les cases de langue sont grisées avec la raison');
{
  // GFS dit « en » (adresse du cadre `language=en` et contexte) alors que le navigateur est en français : thème sombre.
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', colorScheme: 'dark', stub: { langue: 'en' } });
  await markPage(app, 'depart');
  const en = await stateOf(app);
  check('GFS dit « en », le navigateur est en français : la page démarre en anglais (<html lang>, info-bulle de la barre, GfsLink.language()), dans un cadre d’origine « null » au stockage refusé',
    en.lang === 'en' && en.htmlLang === 'en' && ENGLISH.test(en.tip) && en.gfs === 'en' && en.origin === 'null' && en.stored === 'refusé', en);
  await openLanguageTab(page, app);
  const panel = await languagePanel(app);
  check('Réglages en anglais, thème sombre : « English » est coché, les deux cases sont GRISÉES, leurs libellés restent affichés (grisés, jamais masqués)',
    panel.radios === 'fr:décoché:grisé en:coché:grisé' && panel.labelsShown && panel.labelsGreyed.every(Boolean) && panel.opacity.every(o => o > 0.3 && o < 0.7), panel);
  check('la phrase qui dit où choisir la langue est là, en anglais, et chaque case la désigne (aria-describedby)',
    !!panel.note && !panel.note.hidden && panel.note.shown && panel.note.text === NOTE.en && panel.describedBy.every(id => id === 'settings-language-gfs-note'), panel.note);
  check('la phrase et les cases tiennent dans la fenêtre sans défilement, dans le panneau de 700x400', !!panel.note && panel.note.inBody && panel.noScroll && panel.inPanel, panel);
  const contrast = await contrastOf(app, '#settings-language-gfs-note');
  check('la phrase se lit en thème sombre (contraste ≥ 4,5)', contrast >= 4.5, contrast);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'reglages-en-sombre.png') });
  await realClick(page, app, 'input[name="settings-lang"][value="fr"]');
  await realClick(page, app, '#settings-modal [data-settings-panel="language"] label:nth-child(1) span');
  const stays = await staysPut(app, 1500);
  const afterClicks = await stateOf(app);
  const dialog = await app.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
  check('un vrai clic sur « French » (case, puis libellé) ne fait rien : ni rechargement, ni question, ni langue changée',
    stays && !dialog && afterClicks.lang === 'en' && afterClicks.marker === 'depart' && afterClicks.gfs === 'en', { stays, dialog, afterClicks });
  await context.close();
}
{
  // GFS dit « fr » alors que le navigateur est en anglais : thème clair.
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED, lang: 'en', colorScheme: 'light', stub: { langue: 'fr' }, init: ENGLISH_BROWSER });
  await markPage(app, 'depart');
  const fr = await stateOf(app);
  check('GFS dit « fr », le navigateur est en anglais : la page démarre en français et n’a pas rechargé (rien à rattraper)',
    fr.lang === 'fr' && fr.htmlLang === 'fr' && FRENCH.test(fr.tip) && fr.gfs === 'fr', fr);
  await openLanguageTab(page, app);
  const panel = await languagePanel(app);
  check('Réglages en français, thème clair : « Français » est coché, les deux cases sont grisées, la phrase est là en français, sans défilement',
    panel.radios === 'fr:coché:grisé en:décoché:grisé' && panel.labelsShown && panel.labelsGreyed.every(Boolean) && !!panel.note && panel.note.shown && panel.note.text === NOTE.fr && panel.note.inBody && panel.noScroll && panel.inPanel, panel);
  const contrast = await contrastOf(app, '#settings-language-gfs-note');
  check('la phrase se lit en thème clair (contraste ≥ 4,5)', contrast >= 4.5, contrast);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'reglages-fr-clair.png') });
  await realClick(page, app, '#settings-modal [data-settings-panel="language"] label:nth-child(2) span');
  const stays = await staysPut(app, 1200);
  const afterClick = await stateOf(app);
  check('un vrai clic sur « Anglais » ne fait rien : la page reste en français, sans recharger', stays && afterClick.lang === 'fr' && afterClick.marker === 'depart', afterClick);
  await sleep(1500);
  check('la page n’a pas rechargé depuis le départ : le rattrapage de la langue ne se déclenche pas quand elle est déjà la bonne', (await stateOf(app)).marker === 'depart');
  await context.close();
}
{
  // Une GFS d’avant la consigne 019 : ni `langue` au contexte, ni (ici) une langue utilisable dans l’adresse - la page suit le navigateur, les cases restent actives.
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED, lang: 'en', stub: null, search: '&language=de', init: ENGLISH_BROWSER });
  await markPage(app, 'depart');
  const old = await stateOf(app);
  check('GFS ne donne pas la langue (adresse `language=de`, contexte sans `langue`) : la page suit le navigateur (anglais) et GfsLink.language() rend null',
    old.lang === 'en' && old.htmlLang === 'en' && ENGLISH.test(old.tip) && (old.gfs === null || old.gfs === 'absent'), old);
  await openLanguageTab(page, app);
  const panel = await languagePanel(app);
  check('Réglages : les deux cases restent actives (« English » cochée), sans libellé grisé ni aria-describedby, et la phrase reste cachée',
    panel.radios === 'fr:décoché:actif en:coché:actif' && panel.labelsGreyed.every(g => !g) && panel.describedBy.every(d => d === null) && !!panel.note && panel.note.hidden && !panel.note.shown, panel);
  await context.close();
}
{
  // Hébergée hors cadre isolé (stockage disponible) : GFS passe avant le choix que la personne avait gardé ici ; ce choix-là n'est ni effacé ni réécrit.
  const { app, context } = await t.openPage({ seed: SEED, lang: 'fr', stub: { langue: 'en' } });
  await markPage(app, 'depart');
  const kept = await stateOf(app);
  check('la langue gardée par l’app (français) cède à celle de GFS (anglais), sans être réécrite',
    kept.lang === 'en' && ENGLISH.test(kept.tip) && kept.stored === 'fr' && kept.gfs === 'en', kept);
  await context.close();
}
{
  // Seule (sans `gfs=`), le paramètre `language` de l’adresse ne compte pas : l’ordre d’avant (choix gardé, puis navigateur) ne change pas ; les cases restent actives.
  const { page, app, context } = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', search: '?language=en' });
  const alone = await stateOf(app);
  check('seule, `language=en` dans l’adresse est ignoré : la page garde le français choisi, GfsLink.language() rend null', alone.lang === 'fr' && FRENCH.test(alone.tip) && (alone.gfs === null || alone.gfs === 'absent'), alone);
  const before = await app.evaluate(() => { const n = document.getElementById('settings-language-gfs-note'); return n ? n.hidden : 'absente'; });
  await openLanguageTab(page, app);
  const panel = await languagePanel(app);
  check('seule : la phrase de GFS est cachée et les deux cases sont actives', before === true && panel.radios === 'fr:coché:actif en:décoché:actif' && !!panel.note && panel.note.hidden && panel.labelsGreyed.every(g => !g), { before, panel });
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n3) L’événement `langue` (rien en attente) : la page se recharge dans la bonne langue et rouvre le modèle où la personne était, dans le cadre isolé');
{
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { langue: 'fr' } });
  const start = await stateOf(app);
  check('au départ : français, le ★ « Départ A défaut » est ouvert', start.lang === 'fr' && start.id === '1' && start.gfs === 'fr', start);
  await pickTemplate(app, 2);
  const onB = await stateOf(app);
  check('la personne ouvre « Départ B »', onB.id === '2' && onB.name === 'Départ B', onB);
  await markPage(app);
  const callsBefore = await contextCalls(page);
  await page.evaluate(() => window.__gfsStub.setLangue('en'));
  const backToEn = await reloaded(app);
  const en = await stateOf(app);
  check('GFS passe en anglais : la page se recharge (le repère a disparu) et repart en anglais (<html lang>, info-bulle de la barre)',
    backToEn && en.marker === null && en.lang === 'en' && en.htmlLang === 'en' && ENGLISH.test(en.tip) && en.gfs === 'en', en);
  check('elle rouvre « Départ B » (pas le ★), efface le fragment de son adresse et reste dans le cadre isolé (origine « null »)',
    en.id === '2' && en.name === 'Départ B' && en.hash === '' && !/pp-(open|lang)/.test(app.url()) && en.origin === 'null', { en, url: app.url() });
  check('l’adresse du cadre n’a pas bougé (GFS ne la change jamais : `language=fr` y est encore) et pourtant la page est en anglais ; elle a redemandé le contexte une seule fois',
    /[?&]language=fr(&|$)/.test(app.url()) && (await contextCalls(page)) === callsBefore + 1, { url: app.url(), callsBefore, calls: await contextCalls(page) });
  // Dans l’autre sens.
  await markPage(app, 'milieu');
  await page.evaluate(() => window.__gfsStub.setLangue('fr'));
  const backToFr = await reloaded(app);
  const fr = await stateOf(app);
  check('GFS revient au français : la page se recharge, repart en français et rouvre « Départ B » encore',
    backToFr && fr.marker === null && fr.lang === 'fr' && fr.htmlLang === 'fr' && FRENCH.test(fr.tip) && fr.id === '2' && fr.hash === '', fr);

  // « Recharger maintenant » de la touche de déclenchement : la page garde la langue de GFS, en un seul rechargement. Passée en anglais, l’adresse du cadre dit encore « fr » : sans la langue dans le fragment,
  // la page repartirait en français puis se rattraperait (deux rechargements, un éclair de français).
  await markPage(app);
  await page.evaluate(() => window.__gfsStub.setLangue('en'));
  await reloaded(app);
  await markPage(app, 'avant-declencheur');
  const callsAtTrigger = await contextCalls(page);
  await realClick(page, app, '#v2-btn-settings');
  await sleep(300);
  await realClick(page, app, '#settings-modal .settings-tab[data-settings-tab="triggerKey"]');
  await sleep(200);
  await app.selectOption('#settings-trigger-char', '@');
  await realClick(page, app, '#settings-trigger-reload-btn');
  const triggerReloaded = await reloaded(app);
  await sleep(2500);
  const afterTrigger = await stateOf(app);
  check('« Recharger maintenant » (touche de déclenchement) : la page garde l’anglais de GFS et rouvre « Départ B », en un seul rechargement',
    triggerReloaded && afterTrigger.lang === 'en' && afterTrigger.id === '2' && afterTrigger.hash === '' && afterTrigger.marker === null && (await contextCalls(page)) === callsAtTrigger + 1,
    { afterTrigger, callsAtTrigger, calls: await contextCalls(page) });
  await context.close();
}
{
  // Le contexte n’a pas donné la langue (GFS d’avant, ou lent) : l’événement qui arrive ensuite est suivi, les cases se grisent.
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: null });
  const start = await stateOf(app);
  check('GFS ne donne pas la langue au départ : la page est en français (navigateur), GfsLink.language() rend null', start.lang === 'fr' && (start.gfs === null || start.gfs === 'absent'), start);
  await markPage(app);
  await page.evaluate(() => window.__gfsStub.setLangue('en'));
  const followed = await reloaded(app);
  const en = await stateOf(app);
  check('GFS envoie ensuite l’événement `langue` « en » : la page se recharge en anglais, sans adresse `language=` pour le dire (le fragment suffit), et GfsLink.language() rend « en »',
    followed && en.marker === null && en.lang === 'en' && ENGLISH.test(en.tip) && en.gfs === 'en' && en.hash === '' && !/language=/.test(app.url()), { en, url: app.url() });
  await openLanguageTab(page, app);
  const panel = await languagePanel(app);
  check('et ses cases de langue sont grisées', panel.radios === 'fr:décoché:grisé en:coché:grisé' && !!panel.note && panel.note.shown, panel);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n4) Une modification attend d’être enregistrée : la question passe d’abord (enregistrement automatique coupé, page hébergée hors cadre isolé)');
{
  // La page se recharge elle-même et le GFS simulé d’une fenêtre de premier niveau repart avec elle : la langue de GFS d’après le rechargement est gardée dans sessionStorage, comme GFS la garderait. Au départ de la
  // page (événement `navigate`), le script note la langue qu’elle a encore et si le modèle tapé est déjà écrit dans le faux Grist : c’est ce que le test relit après.
  const INIT = `
    try { const g = sessionStorage.getItem('e2e_gfs_langue'); if (g) window.__gfsStub.langue = g; } catch (e) { /* stockage indisponible */ }
    try {
      navigation.addEventListener('navigate', (e) => {
        if (e.navigationType !== 'reload') return;
        const rows = window.__gristStub && window.__gristStub.state.rows.Publipostage_Modeles;
        sessionStorage.setItem('e2e_at_reload', JSON.stringify({ lang: I18n.getLang(), written: !!rows && rows.Contenu.some(c => String(c).includes('${TYPED}')) }));
      });
    } catch (e) { /* API Navigation absente */ }
  `;
  const { page, app, context } = await t.openPage({ seed: SEED, lang: 'fr', stub: { langue: 'fr' }, storage: { pp_autosave_enabled: 'false' }, init: INIT });
  const gfsChanges = next => page.evaluate(v => { sessionStorage.setItem('e2e_gfs_langue', v); window.__gfsStub.setLangue(v); }, next);
  const takeAtReload = () => page.evaluate(() => { const v = sessionStorage.getItem('e2e_at_reload'); sessionStorage.removeItem('e2e_at_reload'); return v ? JSON.parse(v) : null; });
  const dialogShown = () => page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 }).then(() => true, () => false);
  async function clickDialogButton(text) {
    const at = await page.evaluate(label => {
      const b = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).find(x => x.textContent.trim() === label && x.getClientRects().length > 0);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, text);
    if (!at) return null;
    await page.mouse.move(at.x - 6, at.y, { steps: 2 });
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await page.mouse.click(at.x, at.y);
    return at;
  }
  // Une frappe au vrai clavier dans le texte du modèle : le brouillon est « à enregistrer » (l’enregistrement automatique est coupé, il ne l’écrit pas tout seul).
  async function typeInEditor() {
    await realClick(page, app, '.tiptap p');
    await page.keyboard.press('End');
    await page.keyboard.type(' ' + TYPED);
    await page.waitForFunction(() => document.getElementById('status-msg').classList.contains('is-unsaved'), null, { timeout: 5000 }).catch(() => {});
    return page.evaluate(() => document.getElementById('status-msg').classList.contains('is-unsaved'));
  }
  const asked = () => page.evaluate(() => {
    const modal = document.getElementById('pp-dialog-modal');
    const box = modal && modal.querySelector('.pp-dialog-box');
    if (!box) return null;
    const buttons = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).filter(b => b.getClientRects().length > 0).map(b => b.textContent.trim());
    const r = box.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12);
    return {
      title: (document.getElementById('pp-dialog-title') || {}).textContent || '',
      message: (document.getElementById('pp-dialog-message') || {}).textContent || '',
      buttons,
      inFront: !!top && box.contains(top),
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    };
  });

  await markPage(page);
  check('le texte tapé est « à enregistrer »', await typeInEditor());
  await gfsChanges('en');
  check('GFS passe en anglais avec une modification en attente : la question « Modifications non enregistrées » s’ouvre devant la page', await dialogShown());
  const q = await asked();
  check('elle propose « Annuler », « Ne pas enregistrer » et « Enregistrer », devant tout, dans le panneau de 700x400',
    !!q && /Modifications non enregistrées/.test(q.title) && /Départ A/.test(q.message) && q.buttons.join('|') === 'Annuler|Ne pas enregistrer|Enregistrer' && q.inFront && q.inside, q);
  const held = await stateOf(page);
  check('rien ne change avant la réponse : la page n’a pas rechargé et garde sa langue', held.marker === 'avant' && held.lang === 'fr' && FRENCH.test(held.tip), held);

  // « Annuler » : la personne reste où elle en était, dans la langue d’avant, avec son texte.
  await clickDialogButton('Annuler');
  const stayed = await staysPut(page, 1500);
  const afterCancel = await stateOf(page);
  check('« Annuler » : la page ne recharge pas, garde le français et le texte tapé, toujours à enregistrer',
    stayed && afterCancel.lang === 'fr' && afterCancel.text.includes(TYPED) && await page.evaluate(() => document.getElementById('status-msg').classList.contains('is-unsaved')), afterCancel);

  // GFS change encore : un retour au français ne demande rien (la page y est), un nouveau passage à l’anglais pose la question de nouveau.
  await gfsChanges('fr');
  await sleep(600);
  const noQuestion = await page.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
  check('GFS revient au français, la langue de la page : aucune question', !noQuestion);
  await gfsChanges('en');
  check('GFS repasse à l’anglais : la question est reposée', await dialogShown());

  // « Enregistrer » : le modèle est écrit avant que la page parte.
  const savedAndGone = page.waitForNavigation({ waitUntil: 'load', timeout: 40000 }).then(() => true, () => false);
  await clickDialogButton('Enregistrer');
  const wentAfterSave = await savedAndGone;
  await app.waitForFunction(READY, null, { timeout: 60000 }).catch(() => {});
  const atSave = await takeAtReload();
  check('« Enregistrer » : le modèle est écrit dans le document avant que la page parte, qui a encore sa langue d’avant', wentAfterSave && !!atSave && atSave.written === true && atSave.lang === 'fr', atSave);
  const saved = await stateOf(page);
  check('la page rechargée repart en anglais, sans fragment dans son adresse', saved.marker === null && saved.lang === 'en' && ENGLISH.test(saved.tip) && saved.hash === '' && saved.gfs === 'en', saved);

  // « Abandonner » : la page part sans rien écrire (la question est alors en anglais).
  await markPage(page);
  check('une nouvelle frappe est « à enregistrer »', await typeInEditor());
  await gfsChanges('fr');
  check('GFS repasse au français : la question s’ouvre, en anglais (la langue de la page)', await dialogShown());
  const qEn = await asked();
  check('ses boutons sont « Cancel », « Don’t save » et « Save »', !!qEn && /Unsaved changes/.test(qEn.title) && qEn.buttons.join('|') === 'Cancel|Don’t save|Save', qEn);
  const discardedAndGone = page.waitForNavigation({ waitUntil: 'load', timeout: 40000 }).then(() => true, () => false);
  await clickDialogButton('Don’t save');
  const wentAfterDiscard = await discardedAndGone;
  await app.waitForFunction(READY, null, { timeout: 60000 }).catch(() => {});
  const atDiscard = await takeAtReload();
  const discarded = await stateOf(page);
  check('« Ne pas enregistrer » : la page part sans rien écrire et repart en français, sans le texte tapé',
    wentAfterDiscard && !!atDiscard && atDiscard.written === false && atDiscard.lang === 'en' && discarded.marker === null && discarded.lang === 'fr' && FRENCH.test(discarded.tip) && !discarded.text.includes(TYPED), { atDiscard, discarded });
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n5) Une langue changée pendant le rechargement est rattrapée au démarrage, une fois le modèle ouvert');
{
  // L’adresse du cadre dit « fr » (sa langue de création), GFS dit « en » maintenant : la page part en français, s’en aperçoit après avoir ouvert le modèle que GFS désigne, et se recharge en anglais.
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { langue: 'en', ouverture: C_AT_START }, search: '&language=fr', ready: false });
  const caught = await waitThrough(app, () => typeof I18n !== 'undefined' && I18n.getLang() === 'en' && typeof EditorCore !== 'undefined' && !!EditorCore.getEditor && !!EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || ''), 60000);
  await sleep(1500);
  const after = await stateOf(app);
  check('la page est partie dans la langue de l’adresse (français) et GFS dit « en » : elle se recharge, repart en anglais et rouvre « Départ C » (celui que GFS désignait)',
    caught && after.lang === 'en' && ENGLISH.test(after.tip) && after.id === '3' && after.name === 'Départ C' && after.hash === '' && after.gfs === 'en', after);
  check('le contexte a été demandé deux fois (le départ, puis le rechargement) et la page ne se recharge plus ensuite', (await contextCalls(page)) === 2, await contextCalls(page));
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n6) Filets : rien ne recharge ce qui ne change rien, et une adresse qu’on ne peut pas modifier n’envoie pas la page dans une boucle');
{
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { langue: 'fr' } });
  await markPage(app);
  const send = data => page.evaluate(d => window.__gfsStub.post({ type: 'evenement', nom: 'langue', data: d }), data);
  await send({ langue: 'fr' });
  await send({ langue: 'de' });
  await send({ langue: 'EN' });
  await send({ langue: null });
  await send(null);
  await send('en');
  await page.evaluate(() => window.__gfsStub.post({ type: 'evenement', nom: 'inconnu', data: { langue: 'en' } }));
  // Un message qui ne vient pas du parent (le cadre se l’envoie à lui-même) n’est pas lu.
  await app.evaluate(() => window.postMessage({ gfs: 0, type: 'evenement', nom: 'langue', data: { langue: 'en' } }, '*'));
  const stays = await staysPut(app, 2000);
  const same = await stateOf(app);
  check('la même langue, une langue qui n’est ni « fr » ni « en », une donnée vide, un autre événement et un message qui ne vient pas du parent ne rechargent rien et ne changent pas la langue de GFS',
    stays && same.lang === 'fr' && same.gfs === 'fr' && same.marker === 'avant', same);

  // Adresse qu’on ne peut pas modifier : la langue ne peut pas passer, la page ne se recharge pas (elle repartirait en français et s’y reprendrait sans fin).
  await app.evaluate(() => { window.__nativeReplaceState = History.prototype.replaceState; History.prototype.replaceState = function () { throw new Error('adresse non modifiable'); }; });
  await page.evaluate(() => window.__gfsStub.setLangue('en'));
  const blocked = await staysPut(app, 2500);
  const refused = await stateOf(app);
  check('GFS passe en anglais mais l’adresse n’est pas modifiable : la page ne se recharge pas, reste en français, et sait que GFS dit « en »', blocked && refused.lang === 'fr' && refused.gfs === 'en' && refused.marker === 'avant', refused);
  // L’adresse redevient modifiable : la page se rattrape à la prochaine demande, rien n’est resté coincé.
  await app.evaluate(() => { History.prototype.replaceState = window.__nativeReplaceState; });
  const outcome = await app.evaluate(() => Settings.followGfsLanguage()).catch(() => 'rechargée');
  const recovered = await reloaded(app);
  const en = await stateOf(app);
  check('l’adresse redevenue modifiable, la page se recharge enfin en anglais', recovered && en.lang === 'en' && ENGLISH.test(en.tip) && en.gfs === 'en' && en.marker === null && (outcome === true || outcome === 'rechargée'), { outcome, en });
  await context.close();
}

await t.finish();
