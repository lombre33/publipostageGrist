#!/usr/bin/env node
// La barre de Grist Factory Suite vue de l'app (consigne GFS 025, contrats de GFS 5.1 `barre.masquer` et 5.2 point 7 `contexte.barre` / événement `barre`) : 700x400, l'app dans le cadre isolé de GFS (sans
// `allow-same-origin`) que porte une page parente qui joue GFS (dev-tests/gfs-stub.js : `barre` est ce que le contexte rend, `setBarre` change la barre et envoie l'événement, `barre.masquer` la masque). Ce lot
// LIT la barre et l'expose (js/gfs-link.js la lit, js/gfs-bar.js en fait l'attribut <html data-gfs-bar>, les variables --gfs-bar-* et l'API GfsBar) ; les composants ne s'écartent pas encore, sauf un : la première
// ligne de la barre d'outils laisse un vide à la barre posée EN HAUT (js/toolbar-gap.js, vérifié par dev-tests/verify-gfs-bar-toolbar.mjs). Hors de cette ligne, et aux trois autres bords, rien ne bouge.
//  1) UNE GFS D'AVANT LA CONSIGNE 025 (le contexte n'a pas de `barre`) : pas de barre, attribut absent, variables à 0px, GfsBar.edge() et zone() nuls ; GfsBar.hide() envoie `barre.masquer` sans `id` que GFS ne
//     connaît pas : rien ne répond, rien n'est refusé, la page ne bouge pas. La mise en page de cette page-là est la référence du scénario 2.
//  2) AU DÉPART, aux quatre bords (gauche, haut, droite, bas, la forme de l'exemple de la consigne) : le bord (en anglais dans l'app), la zone en px du cadre, la profondeur, l'attribut, les huit variables (la zone
//     et la profondeur à chaque bord, 0px aux trois autres), des sondes qui s'en servent comme longueurs CSS, et AUCUN autre effet visible : la position de chaque élément à identifiant est celle de la référence
//     (en haut, hors de la première ligne de la barre d'outils, qui se décale).
//  3) LES CHANGEMENTS (événement `barre`) : la personne déplace la barre (en haut : rien ne bouge hors de la première ligne de la barre d'outils), l'explorateur de GFS s'ouvre (null) puis se ferme, une origine négative (la barre déborde d'un cadre plus petit qu'elle), une zone sans
//     surface ; les abonnés de GfsBar.onChange sont rappelés une fois par changement (jamais pour un événement qui répète l'état, ni pour un événement sans `barre`), un abonné qui échoue ne gêne pas les autres,
//     le désabonnement tient ; chaque forme hors règle (bord inconnu, zone qui manque, nombre négatif, texte, infini…) vaut « pas de barre » ; le cadre redimensionné (560 × 300) déplace la zone sans recharger
//     l'app ; GfsBar.overlaps() à un pixel près (au contact : non ; un pixel dedans : oui), sans barre ou sans surface : non.
//  4) `barre.masquer` : GfsBar.hide(true) part chez GFS (un appel, sans `id`, `{ masquee: true }`), la barre disparaît quand l'événement arrive, hide(false) la rend ; un argument qui n'est pas vrai ou faux n'envoie
//     rien (faux rendu, GFS ne refuse rien) ; le cadre rechargé pendant que l'app l'avait masquée repart AVEC la barre (GFS la remontre à chaque contexte).
//  5) UN CONTEXTE QUI ARRIVE TARD (2,5 secondes) : la page démarre quand même sans barre, la prend à l'arrivée du contexte et les abonnés l'apprennent une fois.
//  6) UNE BARRE HORS RÈGLE DANS LE CONTEXTE (bord inconnu) : pas de barre ; une barre bien formée qui arrive ensuite est prise.
//  7) SEUL (adresse sans `gfs=`) : pas de barre, GfsBar.hide() rend faux et n'envoie aucun message.
// GFS_BAR_ONLY=1,3 ne joue que ces scénarios (mise au point) ; rien d'écrit sinon. Lancé par run-headless.mjs (groupe Node « gfsBar », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-bar.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-bar', port: Number(process.env.GFS_BAR_PORT || 8928) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = seedModels();
const ONLY = (process.env.GFS_BAR_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));

// La barre telle que GFS la donne pour un cadre de 700 × 400 : 34 × 124 px à 4 px du bord, centrée sur lui, 4 px de marge autour (la zone fait 42 × 132 px) ; l'exemple « gauche » est celui de la consigne.
const BAR = {
  gauche: { bord: 'gauche', epaisseur: 42, zone: { x: 0, y: 134, largeur: 42, hauteur: 132 } },
  haut: { bord: 'haut', epaisseur: 42, zone: { x: 284, y: 0, largeur: 132, hauteur: 42 } },
  droite: { bord: 'droite', epaisseur: 42, zone: { x: 658, y: 134, largeur: 42, hauteur: 132 } },
  bas: { bord: 'bas', epaisseur: 42, zone: { x: 284, y: 358, largeur: 132, hauteur: 42 } },
};
// La même, pour un cadre de 560 × 300 (la barre est centrée sur son bord : la zone bouge avec le cadre).
const SMALL_LEFT = { bord: 'gauche', epaisseur: 42, zone: { x: 0, y: 84, largeur: 42, hauteur: 132 } };
const EDGE = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };
// Ce que l'app en retient : le bord nommé en anglais, la profondeur, la zone en { x, y, width, height }.
const norm = bar => ({ edge: EDGE[bar.bord], depth: bar.epaisseur, zone: { x: bar.zone.x, y: bar.zone.y, width: bar.zone.largeur, height: bar.zone.hauteur } });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const px = value => value + 'px';
const NONE_VARS = { x: '0px', y: '0px', width: '0px', height: '0px' };
const NONE_INSETS = { left: '0px', top: '0px', right: '0px', bottom: '0px' };

// Ce que la page dit de la barre : l'API de GfsBar (absente = le code d'avant la consigne 025), ce que GfsLink a lu, l'attribut de <html> et les huit variables.
const lookOf = app => app.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  const read = name => style.getPropertyValue(name).trim();
  const has = typeof GfsBar !== 'undefined';
  return {
    api: has,
    attr: document.documentElement.getAttribute('data-gfs-bar'),
    edge: has ? GfsBar.edge() : 'absent',
    zone: has ? GfsBar.zone() : 'absent',
    link: typeof GfsLink.bar === 'function' ? GfsLink.bar() : 'absent',
    vars: { x: read('--gfs-bar-x'), y: read('--gfs-bar-y'), width: read('--gfs-bar-width'), height: read('--gfs-bar-height') },
    insets: { left: read('--gfs-bar-inset-left'), top: read('--gfs-bar-inset-top'), right: read('--gfs-bar-inset-right'), bottom: read('--gfs-bar-inset-bottom') },
  };
});
// La page est-elle comme la barre `bar` (ou sans barre : null) le veut, partout où elle la dit ?
function matches(look, bar) {
  if (!look.api) return false;
  if (bar === null) return look.attr === null && look.edge === null && look.zone === null && look.link === null && same(look.vars, NONE_VARS) && same(look.insets, NONE_INSETS);
  const n = norm(bar);
  const inset = side => px(n.edge === side ? n.depth : 0);
  return look.attr === n.edge && look.edge === n.edge && same(look.zone, n.zone) && same(look.link, n)
    && same(look.vars, { x: px(n.zone.x), y: px(n.zone.y), width: px(n.zone.width), height: px(n.zone.height) })
    && same(look.insets, { left: inset('left'), top: inset('top'), right: inset('right'), bottom: inset('bottom') });
}
// Les variables comme longueurs CSS : une sonde placée avec la zone et une autre habillée de la profondeur à chaque bord (mesurées, puis ôtées).
const probeOf = app => app.evaluate(() => {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:var(--gfs-bar-x);top:var(--gfs-bar-y);width:var(--gfs-bar-width);height:var(--gfs-bar-height);visibility:hidden;pointer-events:none';
  const pad = document.createElement('div');
  pad.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--gfs-bar-inset-top) var(--gfs-bar-inset-right) var(--gfs-bar-inset-bottom) var(--gfs-bar-inset-left)';
  document.body.append(box, pad);
  const rect = box.getBoundingClientRect();
  const style = getComputedStyle(pad);
  const out = { zone: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, insets: { left: parseFloat(style.paddingLeft), top: parseFloat(style.paddingTop), right: parseFloat(style.paddingRight), bottom: parseFloat(style.paddingBottom) } };
  box.remove();
  pad.remove();
  return out;
});
// La mise en page : la position et la taille de chaque élément à identifiant, et la taille du cadre. `outsideRow` laisse de côté ce qui est dans la première ligne de la barre d'outils (`.bar-row`), la seule
// que la barre posée en haut décale (js/toolbar-gap.js).
const layoutOf = (app, { outsideRow = false } = {}) => app.evaluate((skip) => {
  const out = {};
  const round = n => Math.round(n * 10) / 10;
  document.querySelectorAll('[id]').forEach((el) => { if (skip && el.closest('#toolbar-top .bar-row')) return; const r = el.getBoundingClientRect(); out['#' + el.id] = [round(r.left), round(r.top), round(r.width), round(r.height)]; });
  out.cadre = [window.innerWidth, window.innerHeight, document.documentElement.scrollWidth, document.documentElement.scrollHeight];
  return out;
}, outsideRow);
const differences = (a, b) => Object.keys(Object.assign({}, a, b)).filter(key => !same(a[key], b[key])).slice(0, 6).map(key => key + ' : ' + JSON.stringify(a[key]) + ' → ' + JSON.stringify(b[key]));
// La barre « vue » par l'abonné d'une page : tout ce que GfsBar.onChange a rappelé depuis l'inscription.
const watch = app => app.evaluate(() => { window.__seen = []; if (typeof GfsBar !== 'undefined') GfsBar.onChange(bar => window.__seen.push(bar)); });
const seenOf = app => app.evaluate(() => (window.__seen || []).slice());
const waitEdge = (app, edge) => app.waitForFunction(wanted => document.documentElement.getAttribute('data-gfs-bar') === wanted, edge, { timeout: 5000 }).then(() => true, () => false);
// GFS : la barre qu'il montre maintenant (l'événement `barre` part si ce que l'app voit change) et ce qu'il a reçu de `barre.masquer`.
const gfsSets = (page, bar) => page.evaluate(next => window.__gfsStub.setBarre(next), bar);
const gfsRaw = (page, barre) => page.evaluate(next => window.__gfsStub.post({ type: 'evenement', nom: 'barre', data: next }), barre);
const gfsHideCalls = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'barre.masquer').map(c => ({ args: c.args, id: c.id })));
const hideBar = (app, masked) => app.evaluate(value => (typeof GfsBar === 'undefined' ? 'absent' : GfsBar.hide(value)), masked);
// GfsBar.overlaps() pour chaque rectangle : { left, top, right, bottom }, { dom: [x, y, largeur, hauteur] } (un vrai DOMRect), null ou 'undefined'.
const overlapsOf = (app, specs) => app.evaluate(list => list.map((spec) => {
  if (typeof GfsBar === 'undefined') return 'absent';
  return GfsBar.overlaps(spec === 'undefined' ? undefined : spec !== null && spec.dom ? new DOMRect(...spec.dom) : spec);
}), specs);
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

let baseline = null;          // la mise en page d'une page sans barre (scénario 1), la référence du scénario 2
let baselineOutside = null;   // la même, sans la première ligne de la barre d'outils (la référence de la barre en haut)

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(1) || wanted(2) || wanted(5)) {
  console.log('\n1) Une GFS d’avant la consigne 025 : pas de barre, rien ne change');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr' });
  const look = await lookOf(app);
  const isolated = await app.evaluate(() => window.origin);
  check('le cadre est isolé (origine « null ») comme chez GFS, et GFS simulé n’a pas de barre dans son contexte', isolated === 'null' && (await page.evaluate(() => window.__gfsStub.barre)) === undefined, { isolated });
  check('GfsBar existe, et sans barre : pas d’attribut, bord et zone nuls, variables à 0px, GfsLink.bar() nul', matches(look, null), look);
  baseline = await layoutOf(app);
  baselineOutside = await layoutOf(app, { outsideRow: true });
  check('la référence : la page a des éléments à identifiant et la taille de cadre attendue (700 × 400)', Object.keys(baseline).length > 40 && same(baseline.cadre.slice(0, 2), [700, 400]), { count: Object.keys(baseline).length, cadre: baseline.cadre });
  const sent = await hideBar(app, true);
  await sleep(400);
  const calls = await gfsHideCalls(page);
  const after = await lookOf(app);
  check('GfsBar.hide(true) part quand même chez GFS (un appel `barre.masquer`, sans `id`), qui ne le connaît pas : aucune réponse, aucune erreur, la page ne change pas', sent === true && calls.length === 1 && calls[0].id === undefined && same(calls[0].args, { masquee: true }) && matches(after, null), { sent, calls });
  const answers = await page.evaluate(() => window.__gfsStub.answers.length);
  check('et l’app ne répond de rien à GFS à cette occasion', answers === 0, answers);
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(2)) {
  console.log('\n2) Au départ, la barre du contexte est lue aux quatre bords, sans le moindre effet visible');
  for (const name of ['gauche', 'haut', 'droite', 'bas']) {
    const bar = BAR[name];
    const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: bar } });
    const look = await lookOf(app);
    check(`barre ${name} (${bar.zone.largeur} × ${bar.zone.hauteur} à ${bar.zone.x},${bar.zone.y}) : GfsLink la lit, GfsBar donne le bord « ${EDGE[name]} » et la zone, <html data-gfs-bar> le dit, huit variables à jour`, matches(look, bar), look);
    const probe = await probeOf(app);
    const n = norm(bar);
    check(`les variables sont des longueurs CSS : une sonde placée avec elles occupe la zone, et la profondeur (${n.depth}px) n’habille que le bord « ${n.edge} »`,
      same(probe.zone, n.zone) && same(probe.insets, { left: n.edge === 'left' ? n.depth : 0, top: n.edge === 'top' ? n.depth : 0, right: n.edge === 'right' ? n.depth : 0, bottom: n.edge === 'bottom' ? n.depth : 0 }), probe);
    const top = name === 'haut';
    const layout = await layoutOf(app, { outsideRow: top });
    const moved = baseline ? differences(top ? baselineOutside : baseline, layout) : ['pas de référence (scénario 1 non joué)'];
    check(top ? 'aucun autre effet visible : hors de la première ligne de la barre d’outils (qui laisse le vide, dev-tests/verify-gfs-bar-toolbar.mjs), chaque élément à identifiant est où il était sans barre (position et taille)'
      : 'aucun effet visible : chaque élément à identifiant est où il était sans barre (position et taille)', moved.length === 0, moved);
    const calls = await gfsHideCalls(page);
    check('et la page n’envoie rien à GFS que le contexte (elle ne masque pas la barre d’elle-même)', calls.length === 0, calls);
    await page.context().close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(3)) {
  console.log('\n3) Les changements : l’événement `barre`, une seule fois par changement, jamais de rechargement');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: BAR.gauche } });
  await markPage(app);
  await app.evaluate(() => { window.__failing = 0; if (typeof GfsBar !== 'undefined') GfsBar.onChange(() => { window.__failing += 1; throw new Error('abonné en échec'); }); });
  await watch(app);
  const referenceOutside = await layoutOf(app, { outsideRow: true });

  await gfsSets(page, BAR.haut);
  check('la personne déplace la barre en haut : l’événement est pris (attribut, variables, GfsLink), sans recharger', (await waitEdge(app, 'top')) && matches(await lookOf(app), BAR.haut), await lookOf(app));
  check('l’abonné est rappelé une fois, avec la nouvelle barre (bord, profondeur, zone)', same(await seenOf(app), [norm(BAR.haut)]), await seenOf(app));
  check('un abonné qui échoue (il a été rappelé) ne gêne ni les autres ni la page', (await app.evaluate(() => window.__failing)) === 1, null);
  const moved = differences(referenceOutside, await layoutOf(app, { outsideRow: true }));
  check('aucun autre effet visible : rien dans la page n’a bougé avec la barre, que la première ligne de la barre d’outils (le vide du haut)', moved.length === 0, moved);
  const probe = await probeOf(app);
  check('la sonde suit : la zone est celle du haut (284, 0, 132 × 42), la profondeur n’habille plus que le haut', same(probe.zone, { x: 284, y: 0, width: 132, height: 42 }) && same(probe.insets, { left: 0, top: 42, right: 0, bottom: 0 }), probe);

  await gfsRaw(page, { barre: BAR.haut });
  await gfsRaw(page, {});
  await gfsRaw(page, { autre: 1 });
  await sleep(400);
  check('un événement qui répète l’état d’avant, et un événement sans `barre`, ne rappellent personne et ne changent rien', same(await seenOf(app), [norm(BAR.haut)]) && matches(await lookOf(app), BAR.haut), await seenOf(app));

  await gfsSets(page, null);
  check('l’explorateur de GFS s’ouvre (barre nulle) : plus d’attribut, variables à 0px, abonné rappelé avec null', (await waitEdge(app, null)) && matches(await lookOf(app), null) && same(await seenOf(app), [norm(BAR.haut), null]), { look: await lookOf(app), seen: await seenOf(app) });
  await gfsSets(page, BAR.droite);
  check('il se ferme, la personne a choisi la droite : la barre est là de nouveau, à droite', (await waitEdge(app, 'right')) && matches(await lookOf(app), BAR.droite), await lookOf(app));

  const negative = { bord: 'haut', epaisseur: 42, zone: { x: -20, y: -10, largeur: 132, hauteur: 42 } };
  await gfsSets(page, negative);
  check('une origine négative reste une origine (la barre déborde d’un cadre plus petit qu’elle) : la zone est gardée telle quelle', (await waitEdge(app, 'top')) && matches(await lookOf(app), negative), await lookOf(app));
  const flat = { bord: 'bas', epaisseur: 0, zone: { x: 299, y: 400, largeur: 0, hauteur: 0 } };
  await gfsSets(page, flat);
  check('une zone sans surface est une barre bien formée (profondeur 0px au bord « bottom »), et elle ne recouvre rien', (await waitEdge(app, 'bottom')) && matches(await lookOf(app), flat)
    && same(await overlapsOf(app, [{ left: 0, top: 0, right: 700, bottom: 400 }]), [false]), await lookOf(app));

  // Chaque forme hors règle vaut « pas de barre » : on part d'une barre bien formée pour voir le changement. Les événements partent tels quels, sans passer par l'état de GFS simulé (qui ne bouge pas).
  await gfsSets(page, null);
  await waitEdge(app, null);
  const zone = { x: 0, y: 134, largeur: 42, hauteur: 132 };
  const INVALID = [
    ['un bord inconnu (« centre »)', { bord: 'centre', epaisseur: 42, zone }],
    ['un bord que GFS ne dit pas (« left »)', { bord: 'left', epaisseur: 42, zone }],
    ['une zone qui manque', { bord: 'gauche', epaisseur: 42 }],
    ['une largeur négative', { bord: 'gauche', epaisseur: 42, zone: Object.assign({}, zone, { largeur: -1 }) }],
    ['une hauteur en texte', { bord: 'gauche', epaisseur: 42, zone: Object.assign({}, zone, { hauteur: '132' }) }],
    ['une largeur infinie', { bord: 'gauche', epaisseur: 42, zone: Object.assign({}, zone, { largeur: Infinity }) }],
    ['une origine qui n’est pas un nombre', { bord: 'gauche', epaisseur: 42, zone: Object.assign({}, zone, { x: null }) }],
    ['une épaisseur qui manque', { bord: 'gauche', zone }],
    ['une épaisseur négative', { bord: 'gauche', epaisseur: -42, zone }],
    ['un texte à la place de la barre', 'gauche'],
    ['une liste à la place de la barre', [BAR.gauche]],
  ];
  for (const [label, invalid] of INVALID) {
    await gfsRaw(page, { barre: BAR.gauche });
    const valid = await waitEdge(app, 'left');
    await gfsRaw(page, { barre: invalid });
    const gone = await waitEdge(app, null);
    const look = await lookOf(app);
    check(`${label} : pas de barre (la page n’écarte rien plutôt que de se fier à une zone qui n’en est pas une)`, valid && gone && matches(look, null), look);
  }

  // Le cadre change de taille (l'app n'est jamais rechargée) : GFS déplace la zone avec la barre, centrée sur son bord.
  await gfsSets(page, BAR.gauche);
  await waitEdge(app, 'left');
  await page.evaluate(() => { const frame = document.querySelector('iframe[name="app"]'); frame.style.width = '560px'; frame.style.height = '300px'; });
  await app.waitForFunction(() => window.innerWidth === 560 && window.innerHeight === 300, null, { timeout: 5000 }).catch(() => {});
  await gfsSets(page, SMALL_LEFT);
  await app.waitForFunction(() => GfsBar.zone() && GfsBar.zone().y === 84, null, { timeout: 5000 }).catch(() => {});
  const small = await lookOf(app);
  const kept = await app.evaluate(() => ({ marker: window.__marker, width: window.innerWidth, height: window.innerHeight }));
  check('cadre de 560 × 300 : la zone suit (y = 84), l’app n’a pas été rechargée (le repère posé avant est resté)', matches(small, SMALL_LEFT) && kept.marker === 'avant' && kept.width === 560 && kept.height === 300, { small, kept });
  await page.evaluate(() => { const frame = document.querySelector('iframe[name="app"]'); frame.style.width = '700px'; frame.style.height = '400px'; });
  await app.waitForFunction(() => window.innerWidth === 700 && window.innerHeight === 400, null, { timeout: 5000 }).catch(() => {});

  // overlaps() : la zone est la barre en haut (284..416 × 0..42).
  await gfsSets(page, BAR.haut);
  await waitEdge(app, 'top');
  const hits = await overlapsOf(app, [
    { left: 416, top: 0, right: 500, bottom: 20 },      // touchRight : au contact du côté droit
    { left: 415, top: 10, right: 500, bottom: 20 },     // oneRight : un pixel dedans
    { left: 0, top: 42, right: 700, bottom: 80 },       // touchBottom
    { left: 0, top: 41, right: 700, bottom: 80 },       // oneBottom
    { left: 200, top: 0, right: 284, bottom: 20 },      // touchLeft
    { left: 200, top: 0, right: 285, bottom: 20 },      // oneLeft
    { dom: [320, 10, 20, 20] },                         // inside : un vrai DOMRect dedans
    { dom: [10, 200, 100, 100] },                       // far
    null,                                               // nothing
    'undefined',                                        // undefinedRect
  ]);
  check('overlaps() à un pixel près : au contact non, un pixel dedans oui (aux quatre côtés), un DOMRect dedans oui, loin non, rien non',
    same(hits, [false, true, false, true, false, true, true, false, false, false]), hits);
  await gfsSets(page, null);
  await waitEdge(app, null);
  check('sans barre, overlaps() rend faux pour tout rectangle', same(await overlapsOf(app, [{ left: 0, top: 0, right: 700, bottom: 400 }]), [false]), null);

  // Le désabonnement tient.
  await app.evaluate(() => { window.__off = []; if (typeof GfsBar !== 'undefined') GfsBar.onChange(bar => window.__off.push(bar))(); });
  await gfsSets(page, BAR.bas);
  await waitEdge(app, 'bottom');
  await sleep(200);
  check('un abonné désinscrit n’est plus rappelé (l’inscription rend de quoi se désabonner)', (await app.evaluate(() => typeof GfsBar !== 'undefined')) && same(await app.evaluate(() => window.__off), []), await app.evaluate(() => window.__off));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(4)) {
  console.log('\n4) `barre.masquer` : GfsBar.hide() demande, GFS masque et rend, un cadre rechargé repart avec la barre');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: BAR.gauche } });
  await watch(app);
  const hid = await hideBar(app, true);
  const gone = await waitEdge(app, null);
  const calls = await gfsHideCalls(page);
  check('hide(true) : un appel `barre.masquer { masquee: true }` part chez GFS, sans `id`', hid === true && calls.length === 1 && calls[0].id === undefined && same(calls[0].args, { masquee: true }), { hid, calls });
  check('GFS masque la barre et le dit par l’événement : la page n’a plus de barre, l’abonné a appris null', gone && matches(await lookOf(app), null) && same(await seenOf(app), [null]), { look: await lookOf(app), seen: await seenOf(app) });
  const shown = await hideBar(app, false);
  const back = await waitEdge(app, 'left');
  const callsAfter = await gfsHideCalls(page);
  check('hide(false) la rend : l’appel part, la barre revient telle qu’elle était', shown === true && back && matches(await lookOf(app), BAR.gauche) && callsAfter.length === 2 && same(callsAfter[1].args, { masquee: false }), { shown, callsAfter });

  const refused = [await hideBar(app, 'oui'), await hideBar(app, 1), await hideBar(app, null), await hideBar(app, undefined), await hideBar(app, {})];
  await sleep(300);
  const state = await page.evaluate(() => ({ calls: window.__gfsStub.calls.filter(c => c.nom === 'barre.masquer').length, refus: window.__gfsStub.refusBarre.length }));
  check('un argument qui n’est pas vrai ou faux rend faux et n’envoie rien (GFS n’a rien à refuser)', refused.every(value => value === false) && state.calls === 2 && state.refus === 0, { refused, state });

  // Masquée, puis le cadre se recharge : GFS remontre la barre à chaque contexte.
  await hideBar(app, true);
  await waitEdge(app, null);
  await markPage(app);
  await app.evaluate(() => location.reload());
  const reloaded = await waitThrough(app, READY);
  const edge = await waitEdge(app, 'left');
  const masked = await page.evaluate(() => window.__gfsStub.masquee);
  check('le cadre rechargé pendant que l’app avait masqué la barre repart AVEC la barre (GFS la remontre à chaque contexte)', reloaded === true && edge && masked === false && matches(await lookOf(app), BAR.gauche), { reloaded, edge, masked, look: await lookOf(app) });
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(5)) {
  console.log('\n5) Un contexte qui arrive tard : la page démarre quand même, prend la barre à son arrivée, une seule fois');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', ready: false, stub: { barre: BAR.droite, contextDelayMs: 2500 } });
  const early = await lookOf(app);
  await watch(app);
  check('avant le contexte (2,5 secondes) : pas de barre, rien d’écarté', matches(early, null), early);
  await waitReady(app, 60000);
  const arrived = await waitEdge(app, 'right');
  await sleep(500);
  check('à l’arrivée du contexte : la barre est prise (droite, 658,134, 42 × 132), partout', arrived && matches(await lookOf(app), BAR.droite), await lookOf(app));
  check('les abonnés l’ont apprise une seule fois', same(await seenOf(app), [norm(BAR.droite)]), await seenOf(app));
  const moved = baseline ? differences(baseline, await layoutOf(app)) : ['pas de référence (scénario 1 non joué)'];
  check('et la page ne bouge pas pour autant (même mise en page que sans barre)', moved.length === 0, moved);
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(6)) {
  console.log('\n6) Une barre hors règle dans le contexte : pas de barre, puis une barre bien formée est prise');
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: { bord: 'centre', epaisseur: 42, zone: BAR.gauche.zone } } });
  const look = await lookOf(app);
  check('un bord inconnu dans le contexte : pas de barre (attribut absent, variables à 0px, bord et zone nuls)', matches(look, null), look);
  await gfsSets(page, BAR.bas);
  check('une barre bien formée qui arrive ensuite (événement) est prise', (await waitEdge(app, 'bottom')) && matches(await lookOf(app), BAR.bas), await lookOf(app));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(7)) {
  console.log('\n7) Seul (adresse sans `gfs=`) : pas de barre, rien d’envoyé');
  const listen = `window.__barCalls = []; window.addEventListener('message', (event) => { if (event.data && event.data.nom === 'barre.masquer') window.__barCalls.push(event.data); });`;
  const { app } = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', init: listen });
  const look = await lookOf(app);
  check('pas de barre : attribut absent, variables à 0px, bord et zone nuls', matches(look, null), look);
  const hid = await hideBar(app, true);
  await sleep(400);
  const posted = await app.evaluate(() => window.__barCalls.length);
  check('GfsBar.hide(true) rend faux et n’envoie aucun message', hid === false && posted === 0, { hid, posted });
  const off = await app.evaluate(() => (typeof GfsBar === 'undefined' ? 'absent' : typeof GfsBar.onChange(() => {})));
  check('on peut s’abonner (rien ne sera rappelé) et l’inscription rend de quoi se désabonner', off === 'function', off);
  await app.context().close();
}

await t.finish();
