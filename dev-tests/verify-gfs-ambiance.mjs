#!/usr/bin/env node
// L'ambiance de GFS dans l'éditeur (consigne GFS 041, contrats de GFS 5.2 point 10, guide des apps règle 15) : la personne choisit dans la fenêtre « Thème » de Grist Factory Suite une ambiance (Grist Factory, Pop, Papier,
// Brut, Néon) et, si elle veut, sa couleur ; UN seul choix pour GFS et toutes ses apps. 700x400, le vrai widget (index.html servi tel quel) dans le GFS simulé (dev-tests/gfs-stub.js : `ambiance` rend `contexte.ambiance`,
// `setAmbiance(message)` envoie l'événement `ambiance`) avec les vrais messages du moteur de GFS (dev-tests/fixtures/ambiances-gfs.json : cinq ambiances, trois couleurs libres).
//  1) SANS AMBIANCE rien ne change : l'app seule (adresse sans `gfs=`) ne demande jamais le kit ; un GFS d'avant la consigne 041, ou qui dit `null` (Grist Factory sans couleur), laisse la page aux couleurs de la charte,
//     mêmes styles calculés qu'en l'app seule, fenêtre de Réglages comprise.
//  2) AU DÉPART le contexte porte Pop : les dix-neuf couleurs du mode et les jetons de forme sont posés sur <html> (ni plus ni moins, et rien d'autre ne bouge), `data-gfs-ambiance` et `data-gfs-forme` les marquent ; le fond,
//     le bouton plein, les champs et les fenêtres (arrondi, filet, titre, ombre flottante) prennent la forme de Pop, celle de Brut après lui (angles droits, titres en capitales, ombre dure). CE QUE L'APP PRODUIT garde
//     l'aspect du modèle : le papier ne bouge pas, et l'hôte de l'impression (`.pp-print-host`) remet à zéro les jetons de forme et garde les couleurs de la charte.
//  3) LES ÉVÉNEMENTS : une ambiance chasse l'autre sans rien laisser de la première ; `null` rend l'app à ses couleurs d'origine (mêmes styles calculés, sans recharger la page) ; un événement qui change l'état rappelle
//     les abonnés une seule fois.
//  4) LE MODE : sombre pour le système, puis `data-theme` (le choix de la personne dans Réglages) et le système repeignent les jetons de l'autre mode sans que GFS dise rien.
//  5) CINQ AMBIANCES ET TROIS COULEURS LIBRES, en clair et en sombre : exactement les jetons du message, la page et la barre d'outils tiennent à 700x400, le papier est celui d'une page sans ambiance, les couleurs d'état
//     tiennent 4,5:1 sur chaque surface.
//  6) UN MESSAGE QUI N'EN EST PAS UN (texte, identifiant faux, aucune couleur) vaut « rien de choisi » ; une valeur dangereuse (`url(`, `;`, `}`, une couleur qui n'en est pas une) n'est jamais posée, les autres le sont.
//  7) UN KIT QUI MANQUE (le module de pose, ou le lecteur du message, ne se charge pas) : l'app démarre aux couleurs de la charte et le dit dans la console.
//  8) DANS LE CADRE ISOLÉ de GFS (sans `allow-same-origin`), avec la politique de sécurité de la page respectée : mêmes jetons, au départ et à l'événement, aucune violation.
// Lancé par run-headless.mjs (groupe Node « gfsAmbiance », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-ambiance.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';

// Les noms de jetons que le kit sait poser : ceux que l'app peut avoir écrits sur <html> ; les autres propriétés de <html> (`--gfs-bar-*`, `--pp-margin-*`…) sont à l'app et ne doivent pas bouger.
const kit = await import('../kit/js/ambiance-message.js').catch((e) => { console.error('Le kit de Grist Factory manque : `git submodule update --init kit` (' + e.message + ')'); process.exit(2); });
const NAMES = new Set([...kit.COLOR_TOKENS, ...kit.SHAPE_TOKENS]);

const t = await start({ name: 'verify-gfs-ambiance', port: Number(process.env.GFS_AMBIANCE_PORT || 8920) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FIXTURES = JSON.parse(readFileSync(join(ROOT, 'dev-tests', 'fixtures', 'ambiances-gfs.json'), 'utf8'));
const IDS = Object.keys(FIXTURES).filter(key => !key.startsWith('_'));
const SEED = seedModels();
const MODEL_HTML = '<p>Contenu A</p>';
const copy = value => JSON.parse(JSON.stringify(value));

// Ce que la personne voit du chrome de l'app (la page, la barre, le bouton plein, un champ) et du papier (la feuille, son texte) : des styles calculés, comparés d'une page à l'autre.
const CHROME = {
  fond: ['body', ['backgroundColor', 'backgroundImage']],
  plan: ['#editor-container', ['backgroundColor', 'backgroundImage']],
  barre: ['#toolbar-top', ['backgroundColor', 'color', 'borderBottomColor']],
  enregistrer: ['#btn-save', ['backgroundColor', 'backgroundImage', 'color', 'borderTopLeftRadius']],
  nom: ['#template-name', ['backgroundColor', 'color', 'borderTopLeftRadius', 'borderTopColor']],
};
const PAPER = {
  feuille: ['.v2-page-sheet', ['backgroundColor', 'backgroundImage', 'color', 'boxShadow', 'borderTopLeftRadius']],
  texte: ['.tiptap', ['color', 'backgroundColor', 'fontFamily', 'fontSize']],
  paragraphe: ['.tiptap p', ['color', 'fontFamily', 'fontSize', 'lineHeight']],
};
// Les jetons de forme que les feuilles lisent et que l'impression remet à zéro (css/style.css, `.pp-print-host`), puis les couleurs qu'elle garde.
const SHAPE_READ = ['--radius-xs', '--radius-md', '--radius-lg', '--radius-pill', '--radius-btn', '--radius-input', '--font-head', '--fw-head', '--ls-head', '--tt-head', '--fill', '--fill-hover', '--fill-line', '--stripe', '--stripe-h', '--wash', '--wash-size'];
const PRINT_COLORS = ['--bg', '--surface', '--text', '--accent', '--accent-solid', '--border'];
// Les couleurs d'état et leur fond : 4,5:1 au moins (charte, F5).
const STATE_PAIRS = [
  ['--danger-ink', '--surface'], ['--danger-ink', '--surface-sunken'], ['--danger-ink', '--bg'], ['--good', '--surface'], ['--good', '--surface-sunken'], ['--good', '--bg'],
  ['--text-muted', '--surface'], ['--text-muted', '--surface-sunken'], ['--text-muted', '--bg'], ['--on-accent', '--accent-solid'], ['--accent-ink', '--surface'],
  ['--danger-ink', '--danger-soft'], ['--good', '--good-soft'],
];
const luminance = ([r, g, b]) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const parseColor = (text) => {
  const m = String(text).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = String(text).trim().replace('#', '');
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : null;
};
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

// Ce que le kit doit avoir posé sur <html> pour ce message et ce mode (comme `paintAmbiance` du kit : la forme, puis les dix-neuf couleurs du mode), à la casse près des couleurs.
const norm = value => (/^#[0-9a-f]{6}$/i.test(String(value).trim()) ? String(value).trim().toLowerCase() : String(value).trim());
const expectedFor = (message, dark) => Object.fromEntries(Object.entries({ ...(message.forme || {}), ...(dark ? message.sombre : message.clair) }).map(([name, value]) => [name, norm(value)]));
const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => a[key] !== b[key]).slice(0, 4).map(key => key + ' : ' + a[key] + ' ≠ ' + b[key]);
const flat = looks => Object.fromEntries(Object.entries(looks).flatMap(([name, props]) => (typeof props === 'string' ? [[name, props]] : Object.entries(props).map(([prop, value]) => [name + '.' + prop, value]))));

// Ouvre le widget et garde ce que la console dit d'inquiétant (avertissements et erreurs) : `logs`.
async function open(options = {}) {
  const logs = [];
  const opened = await t.openPage({
    seed: SEED, ...options,
    before: async (page, context) => {
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(m.text()); });
      if (options.before) await options.before(page, context);
    },
  });
  return { ...opened, logs };
}
const closeOf = opened => opened.context.close().catch(() => {});
// La pose est finie : le kit a posé l'ambiance du contexte (`GfsAmbiance.ready` ; avant la consigne, le code n'existe pas : rien à attendre).
const settle = app => app.evaluate(() => (typeof GfsAmbiance === 'undefined' ? null : GfsAmbiance.ready)).catch(() => null);
// Attend que la condition soit vraie dans la page ; rend faux au bout du délai, sans arrêter l'essai.
const until = (app, fn, arg, timeout = 2500) => app.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
// Le fond de page de l'ambiance est arrivé (`--bg` calculé de <html>), ou tous les jetons ont été retirés (plus de `--bg` en ligne sur <html>).
const bgIs = (app, value) => until(app, v => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase() === v, String(value).toLowerCase());
const bgGone = app => until(app, () => document.documentElement.style.getPropertyValue('--bg') === '');

const inlineOf = app => app.evaluate(() => { const s = document.documentElement.style; const o = {}; for (let i = 0; i < s.length; i++) o[s[i]] = s.getPropertyValue(s[i]).trim(); return o; });
const stateOf = async (app) => {
  const inline = await inlineOf(app);
  return {
    posed: Object.fromEntries(Object.entries(inline).filter(([name]) => NAMES.has(name)).map(([name, value]) => [name, norm(value)])),
    others: Object.keys(inline).filter(name => !NAMES.has(name)).sort(),
    style: await app.evaluate(() => document.documentElement.getAttribute('style') || ''),
  };
};
const marksOf = app => app.evaluate(() => ({ id: document.documentElement.getAttribute('data-gfs-ambiance'), forme: document.documentElement.hasAttribute('data-gfs-forme') }));
// Les transitions de couleur en cours (le bouton Enregistrer glisse d'une couleur à l'autre) donnent une couleur entre les deux : on attend qu'elles soient finies (0,8 s au plus) avant de lire.
const looksOf = (app, picks) => app.evaluate(async (p) => {
  await Promise.race([Promise.allSettled(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished)), new Promise(resolve => setTimeout(resolve, 800))]);
  return Object.fromEntries(Object.entries(p).map(([name, [selector, props]]) => {
    const el = document.querySelector(selector);
    return [name, el ? Object.fromEntries(props.map(prop => [prop, getComputedStyle(el)[prop]])) : 'absent'];
  }));
}, picks);
const fitOf = app => app.evaluate(() => { const bar = document.getElementById('toolbar-top'); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, bar: bar ? bar.scrollWidth - bar.clientWidth : -1 }; });
const tokensOf = (app, names) => app.evaluate(list => { const c = getComputedStyle(document.documentElement); return Object.fromEntries(list.map(name => [name, c.getPropertyValue(name).trim()])); }, names);
const statusOf = app => app.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
const htmlOf = app => app.evaluate(() => EditorCore.getEditor().getHTML());
// L'hôte de l'impression (js/print-export.js le pose dans la page du widget) : ses jetons de forme et de couleur, et ceux de <html>.
const printOf = (app) => app.evaluate(({ shapes, colors }) => {
  const host = document.createElement('div');
  host.className = 'pp-print-host';
  document.body.appendChild(host);
  const hostStyle = getComputedStyle(host), rootStyle = getComputedStyle(document.documentElement);
  const read = (style, names) => Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim()]));
  const out = { host: read(hostStyle, shapes.concat(colors)), root: read(rootStyle, shapes.concat(colors)) };
  host.remove();
  return out;
}, { shapes: SHAPE_READ, colors: PRINT_COLORS });

// Le vrai clic, dans les coordonnées de la page rendue : l'élément est amené à l'écran, la souris approche, puis clique.
async function realClick(page, app, selector) {
  const at = await app.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  await page.mouse.move(at.x - 14, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(at.x, at.y);
}
// La fenêtre de Réglages ouverte au vrai clic : son arrondi, son ombre (comparée à l'ombre flottante du moment), le filet en haut de son cadre et le titre.
async function windowOf(page, app) {
  await realClick(page, app, '#v2-btn-settings');
  await app.waitForSelector('#settings-modal .pp-modal-box', { state: 'visible', timeout: 5000 });
  await sleep(250);
  return app.evaluate(() => {
    const box = document.querySelector('#settings-modal .pp-modal-box');
    const c = getComputedStyle(box), before = getComputedStyle(box, '::before'), title = getComputedStyle(box.querySelector('h3'));
    const probe = document.createElement('div');
    probe.style.boxShadow = 'var(--shadow-float)';
    document.body.appendChild(probe);
    const floating = getComputedStyle(probe).boxShadow;
    probe.remove();
    return { radius: c.borderTopLeftRadius, shadow: c.boxShadow, floating, stripeHeight: before.height, stripeImage: before.backgroundImage, titleWeight: title.fontWeight, titleCase: title.textTransform, titleFamily: title.fontFamily, over: box.scrollWidth - box.clientWidth };
  });
}
// Le message de GFS, par la page qui joue GFS (la page elle-même, ou la page parente d'un cadre) : un événement `ambiance` tel quel, ou le geste de la personne (une fois, rien si l'état ne change pas).
const sendRaw = (page, message) => page.evaluate(m => window.__gfsStub.post({ type: 'evenement', nom: 'ambiance', data: { ambiance: m } }), message);
const choose = (page, message) => page.evaluate(m => window.__gfsStub.setAmbiance(m), message);
const bgOf = message => (message === null ? null : message.clair['--bg']);

console.log('— 1) sans ambiance : rien ne change');
const soloLight = await open({ hosted: false });
await settle(soloLight.app);
const baseLight = { chrome: flat(await looksOf(soloLight.app, CHROME)), paper: flat(await looksOf(soloLight.app, PAPER)), fit: await fitOf(soloLight.app), state: await stateOf(soloLight.app), print: await printOf(soloLight.app), status: await statusOf(soloLight.app) };
const baseWindow = await windowOf(soloLight.page, soloLight.app);
check('l\'app seule ne demande jamais le kit (ni le lecteur du message, ni la pose)', soloLight.requests.filter(url => /\/kit\//.test(url)).length === 0, soloLight.requests.filter(url => /\/kit\//.test(url)));
check('l\'app seule : aucun jeton d\'ambiance sur <html>, aucune marque', Object.keys(baseLight.state.posed).length === 0 && (await marksOf(soloLight.app)).id === null && !(await marksOf(soloLight.app)).forme, baseLight.state.posed);
check('l\'app seule : la fenêtre de Réglages a l\'arrondi de la charte (8px), sans filet, titre en gras', baseWindow.radius === '8px' && baseWindow.stripeImage === 'none' && baseWindow.titleWeight === '700' && baseWindow.titleCase === 'none', baseWindow);
await closeOf(soloLight);

const soloDark = await open({ hosted: false, colorScheme: 'dark' });
await settle(soloDark.app);
const baseDark = { paper: flat(await looksOf(soloDark.app, PAPER)), chrome: flat(await looksOf(soloDark.app, CHROME)), fit: await fitOf(soloDark.app) };
await closeOf(soloDark);

const before041 = await open({ stub: {} });   // un GFS d'avant la consigne 041 : le contexte n'a pas d'`ambiance`
await settle(before041.app);
const before041Chrome = flat(await looksOf(before041.app, CHROME));
const before041State = await stateOf(before041.app);
check('un GFS d\'avant la consigne 041 : aucun jeton posé, aucune marque, mêmes styles calculés que l\'app seule', Object.keys(before041State.posed).length === 0 && (await marksOf(before041.app)).id === null && diff(before041Chrome, baseLight.chrome).length === 0, diff(before041Chrome, baseLight.chrome));
await closeOf(before041);

const grayDefault = await open({ stub: { ambiance: null } });   // Grist Factory sans couleur : GFS dit `null`
await settle(grayDefault.app);
const grayState = await stateOf(grayDefault.app);
check('GFS dit `null` (Grist Factory sans couleur) : aucun jeton posé, aucune marque', Object.keys(grayState.posed).length === 0 && (await marksOf(grayDefault.app)).id === null && !(await marksOf(grayDefault.app)).forme, grayState.posed);
check('GFS dit `null` : mêmes styles calculés que l\'app seule (page, barre, bouton plein, champ, plan de travail, papier)', diff(flat(await looksOf(grayDefault.app, CHROME)), baseLight.chrome).length === 0 && diff(flat(await looksOf(grayDefault.app, PAPER)), baseLight.paper).length === 0, diff(flat(await looksOf(grayDefault.app, CHROME)), baseLight.chrome));
const grayWindow = await windowOf(grayDefault.page, grayDefault.app);
check('GFS dit `null` : la fenêtre de Réglages est celle de l\'app seule (arrondi, ombre, filet, titre)', diff(grayWindow, baseWindow).length === 0, diff(grayWindow, baseWindow));
await closeOf(grayDefault);

console.log('— 2) au départ, le contexte porte une ambiance');
const pop = await open({ stub: { ambiance: FIXTURES.pop } });
await settle(pop.app);
const popState = await stateOf(pop.app);
const popMarks = await marksOf(pop.app);
const popExpected = expectedFor(FIXTURES.pop, false);
const popPosed = popMarks.id === 'pop' && Object.keys(popState.posed).length > 0;   // les gardes qui suivent ne valent que sous l'ambiance posée : sans elle, elles seraient vraies de tout code
check('Pop : les dix-neuf couleurs du mode clair et les jetons de forme sont posés sur <html>, ni plus ni moins', diff(popState.posed, popExpected).length === 0, diff(popState.posed, popExpected));
check('Pop posé : rien d\'autre ne bouge sur <html> (les variables de la barre de GFS, des marges et de la page restent)', popPosed && popState.others.join() === baseLight.state.others.join(), popState.others);
check('Pop : `data-gfs-ambiance="pop"` et `data-gfs-forme` marquent <html>', popMarks.id === 'pop' && popMarks.forme === true, popMarks);
const popChrome = flat(await looksOf(pop.app, CHROME));
check('Pop : le fond de la page et le plan de travail prennent le fond de l\'ambiance (le décor en image)', popChrome['fond.backgroundColor'] === rgb(FIXTURES.pop.clair['--bg']) && popChrome['plan.backgroundColor'] === rgb(FIXTURES.pop.clair['--bg']) && /gradient/.test(popChrome['fond.backgroundImage']), popChrome);
check('Pop : le bouton Enregistrer prend le bouton plein de l\'ambiance (dégradé, arrondi maximal)', /^linear-gradient\(135deg/.test(popChrome['enregistrer.backgroundImage']) && popChrome['enregistrer.borderTopLeftRadius'] === '999px', popChrome);
check('Pop : un champ prend l\'arrondi des champs de l\'ambiance (13px)', popChrome['nom.borderTopLeftRadius'] === FIXTURES.pop.forme['--radius-input'], popChrome['nom.borderTopLeftRadius']);
const popPaper = flat(await looksOf(pop.app, PAPER));
check('Pop posé : le papier (la feuille et son texte) est celui d\'une page sans ambiance', popPosed && diff(popPaper, baseLight.paper).length === 0, diff(popPaper, baseLight.paper));
check('Pop posé : le contenu du modèle et le message de l\'état ne changent pas (rien à enregistrer)', popPosed && (await htmlOf(pop.app)) === MODEL_HTML && (await statusOf(pop.app)) === baseLight.status, [await htmlOf(pop.app), await statusOf(pop.app), baseLight.status]);
const popFit = await fitOf(pop.app);
check('Pop posé : la page et la barre d\'outils tiennent à 700x400 (pas de défilement de plus qu\'en l\'app seule)', popPosed && popFit.page === 0 && popFit.bar <= baseLight.fit.bar, popFit);
const popPrint = await printOf(pop.app);
const shapesSet = SHAPE_READ.filter(name => popPrint.root[name] !== '');
check('Pop : <html> porte les jetons de forme que les feuilles lisent', shapesSet.length >= 8 && shapesSet.includes('--radius-md') && shapesSet.includes('--fill') && shapesSet.includes('--stripe-h') && shapesSet.includes('--wash'), shapesSet);
check('Pop posé : l\'hôte de l\'impression (`.pp-print-host`) remet à zéro chacun de ces jetons de forme', popPosed && shapesSet.length > 0 && shapesSet.every(name => popPrint.host[name] === ''), shapesSet.filter(name => popPrint.host[name] !== '').map(name => name + '=' + popPrint.host[name]));
check('Pop posé : l\'hôte de l\'impression garde les couleurs de la charte, pas celles de l\'ambiance', popPosed && PRINT_COLORS.every(name => popPrint.host[name] === baseLight.print.host[name]) && popPrint.host['--bg'] !== popPrint.root['--bg'], [popPrint.host['--bg'], popPrint.root['--bg']]);
const popWindow = await windowOf(pop.page, pop.app);
check('Pop : la fenêtre de Réglages a l\'arrondi des fenêtres (18px) et l\'ombre flottante de l\'ambiance', popWindow.radius === FIXTURES.pop.forme['--radius-lg'] && popWindow.shadow === popWindow.floating && popWindow.shadow !== baseWindow.shadow, [popWindow.radius, popWindow.shadow, baseWindow.shadow]);
check('Pop : le filet de l\'ambiance (3px) marque le haut de la fenêtre, le titre prend son gras (800)', popWindow.stripeHeight === FIXTURES.pop.forme['--stripe-h'] && /gradient/.test(popWindow.stripeImage) && popWindow.titleWeight === FIXTURES.pop.forme['--fw-head'].replace(/\D/g, ''), popWindow);
check('Pop posé : la fenêtre de Réglages ne déborde pas', popPosed && popWindow.radius === FIXTURES.pop.forme['--radius-lg'] && popWindow.over <= 0, popWindow.over);
check('Pop posé : aucun avertissement du lien ni de la pose dans la console', popPosed && pop.logs.filter(text => /GfsAmbiance|GfsLink|ambiance/i.test(text)).length === 0, pop.logs);
await closeOf(pop);

const brut = await open({ stub: { ambiance: FIXTURES.brut } });
await settle(brut.app);
const brutWindow = await windowOf(brut.page, brut.app);
check('Brut : angles droits, ombre dure et titre en capitales dans la fenêtre de Réglages (sans filet)', brutWindow.radius === '0px' && brutWindow.shadow === brutWindow.floating && brutWindow.titleCase === 'uppercase' && brutWindow.stripeImage === 'none', brutWindow);
const brutChrome = flat(await looksOf(brut.app, CHROME));
check('Brut : le bouton Enregistrer a les angles droits et le jaune de l\'ambiance, sans dégradé', brutChrome['enregistrer.borderTopLeftRadius'] === '0px' && brutChrome['enregistrer.backgroundColor'] === rgb(FIXTURES.brut.clair['--accent-solid']) && brutChrome['enregistrer.backgroundImage'] === 'none', brutChrome);
await closeOf(brut);

console.log('— 3) les événements');
const live = await open({ stub: { ambiance: null } });
await settle(live.app);
await live.app.evaluate(() => { window.__marker = 'avant'; window.__calls = 0; GfsLink.onAmbiance(() => { window.__calls += 1; }); }).catch(() => {});
const live0 = await stateOf(live.app);
const liveChrome0 = flat(await looksOf(live.app, CHROME));
await choose(live.page, FIXTURES.pop);
const poseDone = await bgIs(live.app, FIXTURES.pop.clair['--bg']);
const livePop = await stateOf(live.app);
check('l\'événement `ambiance` (Pop) pose les jetons sans recharger la page, et la page change de fond', poseDone && diff(livePop.posed, popExpected).length === 0 && (await marksOf(live.app)).id === 'pop' && (await looksOf(live.app, CHROME)).fond.backgroundColor === rgb(FIXTURES.pop.clair['--bg']), diff(livePop.posed, popExpected));
await choose(live.page, FIXTURES.brut);
await bgIs(live.app, FIXTURES.brut.clair['--bg']);
const liveBrut = await stateOf(live.app);
check('Brut chasse Pop : exactement les jetons de Brut, rien de Pop ne reste (filet, dégradé, arrondis)', diff(liveBrut.posed, expectedFor(FIXTURES.brut, false)).length === 0 && !('--stripe-h' in liveBrut.posed) && !('--fill' in liveBrut.posed), diff(liveBrut.posed, expectedFor(FIXTURES.brut, false)));
const callsBefore = await live.app.evaluate(() => window.__calls).catch(() => -1);
await sendRaw(live.page, FIXTURES.neon);
await bgIs(live.app, FIXTURES.neon.clair['--bg']);
await sendRaw(live.page, FIXTURES.neon);   // le même message une seconde fois : l'état ne change pas
await sleep(300);
const callsAfter = await live.app.evaluate(() => window.__calls).catch(() => -1);
check('un événement qui change l\'état rappelle les abonnés une fois ; le même message renvoyé ne rappelle personne', callsAfter - callsBefore === 1, [callsBefore, callsAfter]);
const livePosed = await stateOf(live.app);   // Néon est posé : le retour à `null` a quelque chose à défaire
const liveChromePosed = flat(await looksOf(live.app, CHROME));
await choose(live.page, null);
const backDone = await bgGone(live.app);
const liveBack = await stateOf(live.app);
check('`null` (retour à Grist Factory) retire tous les jetons et les deux marques, sans recharger la page', Object.keys(livePosed.posed).length > 0 && backDone && Object.keys(liveBack.posed).length === 0 && (await marksOf(live.app)).id === null && !(await marksOf(live.app)).forme && (await live.app.evaluate(() => window.__marker)) === 'avant', [Object.keys(liveBack.posed).length, await marksOf(live.app)]);
check('`null` ne retire que ce qui avait été posé : les autres propriétés de <html> sont toujours là', Object.keys(livePosed.posed).length > 0 && liveBack.others.join() === live0.others.join() && !/--(bg|radius-md|stripe-h|accent-solid)\b/.test(liveBack.style), [liveBack.others, liveBack.style.slice(0, 120)]);
check('`null` rend à l\'app ses styles calculés d\'origine (page, plan de travail, barre, bouton plein, champ), que l\'ambiance avait changés', diff(liveChromePosed, liveChrome0).length > 0 && diff(flat(await looksOf(live.app, CHROME)), liveChrome0).length === 0, diff(flat(await looksOf(live.app, CHROME)), liveChrome0));
await choose(live.page, FIXTURES.pop);
await bgIs(live.app, FIXTURES.pop.clair['--bg']);
check('après le retour, une ambiance se repose de nouveau (le cycle recommence)', diff((await stateOf(live.app)).posed, popExpected).length === 0, diff((await stateOf(live.app)).posed, popExpected));
check('l\'ambiance posée ne touche pas au modèle : rien à enregistrer, même contenu', Object.keys((await stateOf(live.app)).posed).length > 0 && (await htmlOf(live.app)) === MODEL_HTML && (await statusOf(live.app)) === baseLight.status, [await statusOf(live.app)]);
await closeOf(live);

console.log('— 4) le mode');
const mode = await open({ stub: { ambiance: FIXTURES.pop }, colorScheme: 'dark' });
await settle(mode.app);
const darkNow = await stateOf(mode.app);
check('Pop avec le système en sombre : les jetons du mode sombre (pas ceux du clair)', diff(darkNow.posed, expectedFor(FIXTURES.pop, true)).length === 0, diff(darkNow.posed, expectedFor(FIXTURES.pop, true)));
check('Pop sombre : la barre d\'outils prend la surface sombre de l\'ambiance, la feuille du papier reste blanche', (await looksOf(mode.app, CHROME)).barre.backgroundColor === rgb(FIXTURES.pop.sombre['--surface']) && (await looksOf(mode.app, PAPER)).feuille.backgroundColor === 'rgb(255, 255, 255)', [(await looksOf(mode.app, CHROME)).barre.backgroundColor, (await looksOf(mode.app, PAPER)).feuille.backgroundColor]);
await mode.app.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
const toLight = await bgIs(mode.app, FIXTURES.pop.clair['--bg']);
check('le choix « clair » de la personne (`data-theme`) repeint les jetons du mode clair, GFS n\'ayant rien dit', toLight && diff((await stateOf(mode.app)).posed, popExpected).length === 0, diff((await stateOf(mode.app)).posed, popExpected));
await mode.app.evaluate(() => document.documentElement.removeAttribute('data-theme'));
const toDark = await bgIs(mode.app, FIXTURES.pop.sombre['--bg']);
check('sans choix de la personne, le système (sombre) reprend la main', toDark && diff((await stateOf(mode.app)).posed, expectedFor(FIXTURES.pop, true)).length === 0, diff((await stateOf(mode.app)).posed, expectedFor(FIXTURES.pop, true)));
await mode.page.emulateMedia({ colorScheme: 'light' });
const sysLight = await bgIs(mode.app, FIXTURES.pop.clair['--bg']);
check('le système qui passe au clair repeint les jetons du mode clair', sysLight && diff((await stateOf(mode.app)).posed, popExpected).length === 0, diff((await stateOf(mode.app)).posed, popExpected));
await mode.app.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
const choiceDark = await bgIs(mode.app, FIXTURES.pop.sombre['--bg']);
check('le choix « sombre » de la personne l\'emporte sur le système (clair)', choiceDark && diff((await stateOf(mode.app)).posed, expectedFor(FIXTURES.pop, true)).length === 0, diff((await stateOf(mode.app)).posed, expectedFor(FIXTURES.pop, true)));
await closeOf(mode);

console.log('— 5) cinq ambiances et trois couleurs libres, clair et sombre');
const all = await open({ stub: { ambiance: null } });
await settle(all.app);
const bad = { jetons: [], marques: [], tenue: [], papier: [], couleurs: [] };
for (const id of IDS) {
  for (const scheme of ['light', 'dark']) {
    const dark = scheme === 'dark';
    const label = `${id} ${dark ? 'sombre' : 'clair'}`;
    await all.page.emulateMedia({ colorScheme: scheme });
    await choose(all.page, FIXTURES[id]);
    const want = expectedFor(FIXTURES[id], dark);
    const arrived = await bgIs(all.app, want['--bg']);
    const state = await stateOf(all.app);
    const problems = diff(state.posed, want);
    if (!arrived || problems.length) bad.jetons.push(label + ' : ' + (problems.join(' ; ') || 'pas posé'));
    if (!arrived) { for (const list of [bad.marques, bad.tenue, bad.papier, bad.couleurs]) list.push(label + ' : pas posé'); continue; }   // sans l'ambiance, les autres contrôles seraient vrais de tout code
    const marks = await marksOf(all.app);
    const wantForme = Object.keys(FIXTURES[id].forme || {}).length > 0;
    if (marks.id !== FIXTURES[id].id || marks.forme !== wantForme) bad.marques.push(label + ' : ' + JSON.stringify(marks));
    const fit = await fitOf(all.app);
    const base = dark ? baseDark : baseLight;
    if (fit.page !== 0 || fit.bar > base.fit.bar) bad.tenue.push(label + ' : ' + JSON.stringify(fit));
    const paper = diff(flat(await looksOf(all.app, PAPER)), base.paper);
    if (paper.length) bad.papier.push(label + ' : ' + paper.join(' ; '));
    const tokens = await tokensOf(all.app, [...new Set(STATE_PAIRS.flat())]);
    for (const [fg, bg] of STATE_PAIRS) {
      const a = parseColor(tokens[fg]), b = parseColor(tokens[bg]);
      const ratio = a && b ? contrast(a, b) : 0;
      if (!(ratio >= 4.5)) bad.couleurs.push(`${label} : ${fg} sur ${bg} ${ratio.toFixed(2)}`);
    }
  }
}
check(`les ${IDS.length} messages en clair et en sombre : exactement les jetons du message, rien de l'ambiance précédente`, bad.jetons.length === 0, bad.jetons);
check('les marques de <html> suivent chaque message (l\'identifiant ; la forme seulement quand le message en porte)', bad.marques.length === 0, bad.marques);
check('chaque ambiance tient à 700x400 : la page ne défile pas de côté, la barre d\'outils ne déborde pas plus qu\'en l\'app seule', bad.tenue.length === 0, bad.tenue);
check('le papier (la feuille et son texte) est celui d\'une page sans ambiance, en clair comme en sombre', bad.papier.length === 0, bad.papier);
check('les couleurs d\'état (erreur, réussite, texte discret, texte du bouton plein, lien) tiennent 4,5:1 sur chaque surface', bad.couleurs.length === 0, bad.couleurs);
await closeOf(all);

console.log('— 6) un message qui n\'en est pas un');
const rough = await open({ stub: { ambiance: FIXTURES.pop } });
await settle(rough.app);
// Les événements partent tels quels (`sendRaw`) : le GFS simulé ne garde pas ce qu'on lui fait dire, il ne saurait pas qu'il faut renvoyer Pop après un message invalide.
for (const [name, message] of [['du texte', 'pop'], ['un identifiant faux', { ...copy(FIXTURES.pop), id: 'Pop!' }], ['aucune couleur', { id: 'pop', clair: {}, sombre: {}, forme: copy(FIXTURES.pop.forme) }], ['une liste', [FIXTURES.pop]]]) {
  await sendRaw(rough.page, FIXTURES.pop);
  const posedFirst = await until(rough.app, () => document.documentElement.style.getPropertyValue('--bg') !== '');
  await sendRaw(rough.page, message);
  const gone = await bgGone(rough.app);
  const state = await stateOf(rough.app);
  check(`un message invalide (${name}) défait l'ambiance posée : « rien de choisi », tout est retiré, rien n'est posé`, posedFirst && gone && Object.keys(state.posed).length === 0 && (await marksOf(rough.app)).id === null, Object.keys(state.posed));
}
const dangerous = copy(FIXTURES.pop);
dangerous.forme['--wash'] = 'url(https://evil.example/x.png)';
dangerous.forme['--fill'] = 'red; background: blue';
dangerous.forme['--radius-md'] = '4px} body{display:none';
dangerous.clair['--bg'] = 'red';
dangerous.clair['--surface'] = '#12345';
const kept = copy(FIXTURES.pop);
['--wash', '--fill', '--radius-md'].forEach(name => delete kept.forme[name]);
['--bg', '--surface'].forEach(name => delete kept.clair[name]);
await sendRaw(rough.page, null);
await bgGone(rough.app);
await sendRaw(rough.page, dangerous);
const dangerousIn = await until(rough.app, () => document.documentElement.style.getPropertyValue('--accent') !== '');
const dangerousState = await stateOf(rough.app);
check('les valeurs dangereuses (`url(`, `;`, `}`, une couleur qui n\'en est pas une) ne sont jamais posées, les autres le sont', dangerousIn && diff(dangerousState.posed, expectedFor(kept, false)).length === 0, diff(dangerousState.posed, expectedFor(kept, false)));
await sleep(300);
check('rien de dangereux dans l\'attribut `style` de <html> et aucune adresse étrangère demandée', dangerousIn && !/evil|display\s*:\s*none|background\s*:\s*blue/.test(dangerousState.style) && !rough.requests.some(url => /evil\.example/.test(url)), [dangerousState.style.slice(0, 80), rough.requests.filter(url => /evil/.test(url))]);
await closeOf(rough);

console.log('— 7) un kit qui manque');
const noPose = await open({ stub: { ambiance: FIXTURES.pop }, before: page => page.route(/\/kit\/js\/ambiance-pose\.js/, route => route.fulfill({ status: 404, body: 'absent' })) });
await settle(noPose.app);
const noPoseState = await stateOf(noPose.app);
check('le module de pose ne se charge pas : l\'app démarre quand même, l\'ambiance est lue mais rien n\'est posé, aucune marque, les couleurs de la charte', (await htmlOf(noPose.app)) === MODEL_HTML && (await noPose.app.evaluate(() => typeof GfsLink.ambiance === 'function' && GfsLink.ambiance() !== null).catch(() => false)) && Object.keys(noPoseState.posed).length === 0 && (await marksOf(noPose.app)).id === null && diff(flat(await looksOf(noPose.app, CHROME)), baseLight.chrome).length === 0, diff(flat(await looksOf(noPose.app, CHROME)), baseLight.chrome));
check('le module de pose ne se charge pas : la console le dit (`[GfsAmbiance]`) et la pose se déclare inactive', noPose.logs.some(text => /\[GfsAmbiance\]/.test(text)) && (await noPose.app.evaluate(() => (typeof GfsAmbiance === 'undefined' ? 'absent' : GfsAmbiance.active())).catch(() => 'absent')) === false, noPose.logs);
await closeOf(noPose);

const noReader = await open({ stub: { ambiance: FIXTURES.pop }, before: page => page.route(/\/kit\/js\/ambiance-message\.js/, route => route.fulfill({ status: 404, body: 'absent' })) });
await settle(noReader.app);
const noReaderState = await stateOf(noReader.app);
check('le lecteur du message ne se charge pas (la pose, elle, tourne) : l\'app démarre quand même et garde les couleurs de la charte, rien n\'est cru sans être lu', (await noReader.app.evaluate(() => typeof GfsAmbiance !== 'undefined' && GfsAmbiance.active()).catch(() => false)) && (await htmlOf(noReader.app)) === MODEL_HTML && Object.keys(noReaderState.posed).length === 0 && (await marksOf(noReader.app)).id === null && diff(flat(await looksOf(noReader.app, CHROME)), baseLight.chrome).length === 0, noReaderState.posed);
check('le lecteur du message ne se charge pas : la console le dit (`[GfsLink]`) et l\'ambiance lue reste vide', noReader.logs.some(text => /\[GfsLink\]/.test(text)) && (await noReader.app.evaluate(() => (typeof GfsLink.ambiance === 'function' ? GfsLink.ambiance() : 'absent')).catch(() => 'absent')) === null, noReader.logs);
await closeOf(noReader);

console.log('— 8) dans le cadre isolé de GFS');
const CSP_WATCH = "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));";
const framed = await open({ framed: { csp: "frame-src 'self'" }, bypassCSP: false, stub: { ambiance: FIXTURES.neon }, init: CSP_WATCH });
await settle(framed.app);
const framedState = await stateOf(framed.app);
check('cadre isolé (origine « nulle », politique de la page respectée) : les jetons de Néon sont posés, avec leurs marques', diff(framedState.posed, expectedFor(FIXTURES.neon, false)).length === 0 && (await marksOf(framed.app)).id === 'neon' && (await marksOf(framed.app)).forme === true, diff(framedState.posed, expectedFor(FIXTURES.neon, false)));
check('cadre isolé : la page prend le fond de l\'ambiance', (await looksOf(framed.app, CHROME)).fond.backgroundColor === rgb(FIXTURES.neon.clair['--bg']), (await looksOf(framed.app, CHROME)).fond.backgroundColor);
await choose(framed.page, FIXTURES.papier);
const framedEvent = await bgIs(framed.app, FIXTURES.papier.clair['--bg']);
check('cadre isolé : l\'événement `ambiance` traverse le vrai `postMessage` et change l\'ambiance (Papier chasse Néon)', framedEvent && diff((await stateOf(framed.app)).posed, expectedFor(FIXTURES.papier, false)).length === 0, diff((await stateOf(framed.app)).posed, expectedFor(FIXTURES.papier, false)));
await choose(framed.page, null);
const framedBack = await bgGone(framed.app);
check('cadre isolé : `null` retire tout ce qui avait été posé', framedEvent && framedBack && Object.keys((await stateOf(framed.app)).posed).length === 0 && (await marksOf(framed.app)).id === null, Object.keys((await stateOf(framed.app)).posed).length);
const violations = await framed.app.evaluate(() => window.__csp || []);
check('cadre isolé : aucune violation de la politique de sécurité de la page (carte d\'importation, modules du kit, jetons posés par le CSSOM)', Object.keys(framedState.posed).length > 0 && violations.length === 0, violations);
await closeOf(framed);

await t.finish();
