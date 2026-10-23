#!/usr/bin/env node
// L'app dans le cadre isolé de Grist Factory Suite (consigne GFS 011), 700x400. GFS fait tourner chaque app dans un <iframe> aux drapeaux `allow-scripts allow-forms allow-popups allow-modals
// allow-downloads`, SANS `allow-same-origin` : l'origine de l'app est « nulle ». Ce script monte le vrai widget (index.html servi tel quel, faux Grist semé avant l'init) dans un cadre de cette nature,
// porté par une page parente qui joue GFS (dev-tests/gfs-stub.js en mode parent : `postMessage` dans les deux sens, comme le vrai) ; les liens e-mail se jouent sous la politique de sécurité de GFS,
// `frame-src 'self'`, que le navigateur fait respecter (`bypassCSP: false`). Deux choses ne marchaient pas dans ce cadre :
//  1) L'IMPRESSION NAVIGATEUR (« Impression navigateur » du bouton PDF) : le cadre caché qu'elle fabriquait avant n'a plus l'origine de l'app, donc ne se lit plus (`contentDocument` vaut null). L'app
//     imprime par SA page (js/print-export.js), seule comme hébergée (une seule façon d'imprimer, choix d'Antoine du 16/10) : le vrai print() est accepté et annonce beforeprint puis afterprint à la
//     fenêtre de l'app, qui porte alors les feuilles de la Lecture, aux mêmes coupures seule ou hébergée ; à l'impression, seul leur conteneur est montré, et tout est retiré à afterprint.
//  2) LES LIENS `mailto:` ET `tel:` : suivis dans ce cadre, ils le font mourir (`frame-src 'self'` ne les connaît pas : la page d'erreur du navigateur prend la place de l'app). Hébergée, l'app les
//     ouvre dans un nouvel onglet (`target="_blank"`, `rel="noopener noreferrer"`) à trois endroits : « Créer l'e-mail », le Ctrl + clic d'un lien de l'éditeur (js/link-dialog.js) et les liens de la
//     Lecture. Seule, rien ne change.
// Les pixels de l'impression (pages, mots, lignes, thème, sens mêlés) sont comparés à la Lecture dans un vrai PDF par dev-tests/verify-browser-print.mjs : le PDF d'une page parente ne montre
// pas les règles d'impression de l'app qu'elle porte.
// Lancé par run-headless.mjs (groupe Node « gfsFrame », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-frame.mjs
// 7) UN RECHARGEMENT VOULU PAR L'APP (demande du 20/10 : « si je change la langue, j'aimerais réouvrir le doc où j'étais, peu importe que l'on soit dans GFS ou en standalone ») rouvre dans ce cadre le modèle
//    où la personne était : le stockage y est refusé (changer de langue aussi tant qu'il l'est), donc l'identifiant passe par le fragment de l'adresse du cadre (`#pp-open=<id>`, `history.replaceState`
//    n'y change que le fragment), lu puis effacé au démarrage ; mesuré avec « Recharger maintenant » de la touche de déclenchement, GFS qui ne rend plus l'`ouverture` (contrats 5.2, point 3) comme un GFS
//    plus ancien qui rejouerait la dernière : le modèle d'avant le rechargement passe avant.
// 8) « NOUVEAU > IMPORTER » (consigne GFS 035) : GFS ouvre lui-même le sélecteur de fichier et donne le `File` choisi à l'app, dans l'`ouverture` du contexte ou l'appel `ouvrir`. Ici le fichier est fabriqué dans la
//    page parente et traverse le vrai `postMessage` vers le cadre d'origine « nulle » : la copie que le cadre reçoit est un `File` DE CE CADRE (`instanceof File` y est vrai, ce que `normalizeOpening` de
//    js/gfs-link.js exige), lisible malgré l'origine, et l'app l'importe par le chemin du menu « + », au démarrage comme à l'appel `ouvrir` ({ ouvert: true }).
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-frame', port: Number(process.env.GFS_FRAME_PORT || 8997) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const RECORD = { id: 1, Nom: 'Jeanne', Statut: 'Urgent' };
const SEED = seedModels({ record: RECORD });
// La politique de GFS qui ne connaît ni mailto: ni tel: : posée sur la page parente, elle tue le cadre de l'app au premier lien suivi dedans.
const GFS_CSP = "frame-src 'self'";
// Ce que GFS demande d'ouvrir à l'app au démarrage (consigne 010) : « Départ E email », le modèle 4 du faux Grist, d'un type e-mail.
const EMAIL_AT_START = { fichier: { id: '4', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' };
const para = i => '<p>Paragraphe ' + i + ' : Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>';
const DOC = '<h1>Titre du courrier</h1>' + Array.from({ length: 45 }, (_, i) => para(i + 1)).join('');
const HF = {
  enabled: true, differentFirstPage: false, header: { default: '<p>En-tête du document</p>', first: '' },
  footer: { default: '<p style="text-align:right">Page <span class="page-number-badge" data-format="n-slash-total">1</span></p>', first: '' },
};
const LINKS_DOC = '<p>Écrire à <a href="mailto:jeanne@exemple.fr">jeanne@exemple.fr</a>, appeler le <a href="tel:+33123456789">01 23 45 67 89</a> ou voir <a href="https://exemple.fr/page">le site</a>.</p>';

// Le vrai clic, dans les coordonnées de la page parente (le cadre est à son coin, sans bordure) : l'élément est amené à l'écran, la souris approche, puis clique ; `ctrl` : avec la touche Ctrl.
async function realClick(page, app, selector, { ctrl = false } = {}) {
  const at = await app.evaluate(sel => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  await page.mouse.move(at.x - 14, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(80);
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.click(at.x, at.y);
  if (ctrl) await page.keyboard.up('Control');
}
// L'app est vivante : son éditeur répond (un cadre mort a pris la page d'erreur du navigateur, ou n'a plus de contexte).
const alive = app => app.evaluate(() => typeof EditorCore !== 'undefined' && !!EditorCore.getEditor()).catch(() => false);
const statusOf = app => app.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '').catch(() => null);
// « Impression prête » : sans geste récent (un rendu long), le widget demande un clic de plus.
async function acceptReadyIfAsked(page, app) {
  const asked = await app.evaluate(() => { const modal = document.getElementById('pp-dialog-modal'); return !!modal && getComputedStyle(modal).display !== 'none' && /Impression prête|Ready to print/.test(modal.textContent || ''); });
  if (asked) await realClick(page, app, '#pp-dialog-modal .var-modal-primary');
  return asked;
}
// La préparation de l'impression, mesurée puis défaite. Les fenêtres sont arrondies au centième de pixel ; `iframes` : les cadres de la page pendant la préparation (aucun) ; `font` : la police de
// l'emplacement des feuilles, qui doit être celle de `body`.
const prepareIn = target => target.evaluate(async ({ html, hf }) => {
  try {
    const job = await PrintExport.prepare(html, null, { id: 1 }, hf, 'impression');
    const out = { iframes: document.querySelectorAll('iframe').length, font: getComputedStyle(job.root).fontFamily, bodyFont: getComputedStyle(document.body).fontFamily, sheets: job.root.querySelectorAll('.pp-print-sheet').length, pageCount: job.pageCount, windows: job.windows.map(win => [Math.round(win.from * 100) / 100, Math.round(win.to * 100) / 100, win.at]) };
    job.dispose();
    return out;
  } catch (e) { return { error: (e && e.name) + ' : ' + String(e && e.message).slice(0, 120) }; }
}, { html: DOC, hf: HF });
const setDocument = (target, html, hf) => target.evaluate(({ html, hf }) => { Editor.setHTML(html); if (hf) Editor.setHeaderFooterData(hf); }, { html, hf: hf || null });

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n1) Le cadre est celui de GFS : origine « nulle », stockage refusé, un cadre caché ne se lit pas ; l\'impression n\'en fabrique aucun');
let isolatedWindows = null;
{
  const { page, app, context } = await t.openPage({ framed: true, seed: SEED });
  const facts = await app.evaluate(async () => {
    let storage = 'ok';
    try { localStorage.getItem('x'); } catch (e) { storage = e.name; }
    const hidden = document.createElement('iframe');
    hidden.setAttribute('sandbox', 'allow-same-origin allow-modals');
    hidden.srcdoc = '<p>x</p>';
    document.body.appendChild(hidden);
    await new Promise(r => hidden.addEventListener('load', r, { once: true }));
    let hiddenDocument = 'lu';
    try { hiddenDocument = hidden.contentDocument === null ? 'null' : 'lu'; } catch (e) { hiddenDocument = e.name; }
    hidden.remove();
    return { origin: window.origin, storage, hosted: GfsLink.hosted, answering: GfsLink.isAnswering(), hiddenDocument };
  });
  check('l’app tourne dans un cadre sans allow-same-origin : son origine est « null » et le stockage du navigateur lui est refusé (SecurityError)', facts.origin === 'null' && facts.storage === 'SecurityError', facts);
  check('elle est hébergée (`gfs=` dans son adresse) et la page parente, qui joue GFS, lui répond', facts.hosted === true && facts.answering === true, facts);
  check('un cadre caché qu’elle fabriquerait ne se lit pas (contentDocument null) : voilà pourquoi l’impression se fait dans la page, sans cadre', facts.hiddenDocument === 'null' || facts.hiddenDocument === 'SecurityError', facts);
  await setDocument(app, DOC, HF);
  await sleep(1500);
  const prepared = await prepareIn(app);
  check('l’impression se prépare dans ce cadre : aucun cadre fabriqué, une feuille par page de la Lecture, la police de `body`', !prepared.error && prepared.iframes === 0 && prepared.sheets === prepared.pageCount && prepared.pageCount >= 3 && !!prepared.font && prepared.font === prepared.bodyFont, prepared);
  const leftover = await app.evaluate(() => ({ frame: !!document.querySelector('iframe'), host: !!document.getElementById('pp-print-host'), pageRule: !!document.getElementById('pp-print-page'), printing: document.documentElement.classList.contains('pp-printing') }));
  check('et elle ne laisse rien derrière elle une fois défaite : ni cadre, ni conteneur, ni règle @page, ni classe', !leftover.frame && !leftover.host && !leftover.pageRule && !leftover.printing, leftover);

  // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  console.log('\n2) L’impression navigateur par la page de l’app, avec le vrai print() (aucun remplaçant)');
  await app.evaluate(() => {
    document.getElementById('v2-pdf-quality').value = 'browser-print';
    window.__ev = [];
    const state = name => {
      const host = document.getElementById('pp-print-host');
      window.__ev.push({ name, host: !!host, sheets: host ? host.shadowRoot.querySelectorAll('.pp-print-sheet').length : -1, title: document.title, printing: document.documentElement.classList.contains('pp-printing'), pageRule: !!document.getElementById('pp-print-page'), frames: document.querySelectorAll('iframe[sandbox*="allow-same-origin"]').length });
    };
    window.addEventListener('beforeprint', () => state('beforeprint'));
    window.addEventListener('afterprint', () => state('afterprint'));
  });
  const expected = await prepareIn(app);
  check('l’app prépare l’impression dans sa page : pas de cadre caché, une feuille par page de la Lecture dans le conteneur', expected.iframes === 0 && expected.sheets === expected.pageCount && expected.pageCount >= 3, expected);
  isolatedWindows = expected.windows;
  const titleBefore = await app.evaluate(() => document.title);
  await realClick(page, app, '#btn-export-pdf');
  await app.waitForFunction(() => window.__ev.length >= 2 || /impossible|erreur|error|échou/i.test((document.getElementById('status-msg') || {}).textContent || '') || (document.getElementById('pp-dialog-modal') && getComputedStyle(document.getElementById('pp-dialog-modal')).display !== 'none'), null, { timeout: 90000 }).catch(() => {});
  if (await acceptReadyIfAsked(page, app)) await app.waitForFunction(() => window.__ev.length >= 2, null, { timeout: 60000 }).catch(() => {});
  await sleep(400);
  const seen = await app.evaluate(() => ({ events: window.__ev.slice(), status: (document.getElementById('status-msg') || {}).textContent, host: !!document.getElementById('pp-print-host'), frames: document.querySelectorAll('iframe[sandbox*="allow-same-origin"]').length, pageRule: !!document.getElementById('pp-print-page'), printing: document.documentElement.classList.contains('pp-printing'), title: document.title }));
  check('le vrai print() est accepté : le navigateur annonce beforeprint puis afterprint à la fenêtre de l’app elle-même', seen.events.map(e => e.name).join(',') === 'beforeprint,afterprint', seen);
  const before = seen.events[0] || {};
  check(`à beforeprint, la page porte les ${expected.pageCount} feuilles de la Lecture dans son conteneur, la règle @page et la classe d’impression, aucun cadre caché`, before.host === true && before.sheets === expected.pageCount && before.pageRule === true && before.printing === true && before.frames === 0, before);
  check('et son titre n’est plus celui de la page : c’est le nom de fichier que le navigateur propose à « Enregistrer au format PDF »', !!before.title && before.title !== titleBefore, { avant: titleBefore, pendant: before.title });
  check('afterprint retire tout : le conteneur, la règle @page et la classe, et le titre de la page revient', seen.host === false && seen.pageRule === false && seen.printing === false && seen.frames === 0 && seen.title === titleBefore, seen);
  check('le message d’état dit « Impression lancée. »', seen.status === 'Impression lancée.', seen.status);
  // Une seconde impression de suite (Chromium ignore un print() posé moins de deux secondes après le précédent : la même attente que la personne qui relance), puis deux préparations l'une après l'autre :
  // un seul conteneur à la fois.
  await sleep(2600);
  await realClick(page, app, '#btn-export-pdf');
  await app.waitForFunction(() => window.__ev.length >= 4 || /impossible|erreur|error|échou/i.test((document.getElementById('status-msg') || {}).textContent || '') || (document.getElementById('pp-dialog-modal') && getComputedStyle(document.getElementById('pp-dialog-modal')).display !== 'none'), null, { timeout: 90000 }).catch(() => {});
  if (await acceptReadyIfAsked(page, app)) await app.waitForFunction(() => window.__ev.length >= 4, null, { timeout: 60000 }).catch(() => {});
  await sleep(400);
  const again = await app.evaluate(() => ({ events: window.__ev.map(e => e.name).join(','), host: !!document.getElementById('pp-print-host'), title: document.title }));
  check('une seconde impression de suite marche de même, et laisse la page propre', again.events === 'beforeprint,afterprint,beforeprint,afterprint' && again.host === false && again.title === titleBefore, again);
  const twiceRun = await app.evaluate(async ({ html, hf }) => {
    try { await PrintExport.prepare(html, null, { id: 1 }, hf, 'un'); await PrintExport.prepare(html, null, { id: 1 }, hf, 'deux'); return 'ok'; } catch (e) { return (e && e.name) + ' : ' + String(e && e.message).slice(0, 100); }
  }, { html: DOC, hf: HF });
  const twice = await app.evaluate(() => ({ hosts: document.querySelectorAll('#pp-print-host').length, rules: document.querySelectorAll('#pp-print-page').length, title: document.title }));
  check('deux préparations de suite ne laissent qu’un conteneur et qu’une règle @page (la seconde remplace la première), et le titre est celui de la seconde', twiceRun === 'ok' && twice.hosts === 1 && twice.rules === 1 && twice.title === 'deux', { twiceRun, twice });

  // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  console.log('\n3) À l’impression, seul le conteneur est montré ; sans impression posée, la page est telle qu’elle était');
  await page.emulateMedia({ media: 'print' });
  const printed = await app.evaluate(() => {
    const host = document.getElementById('pp-print-host');
    if (!host) return { noHost: true };
    const others = Array.from(document.body.children).filter(el => el !== host && !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName));
    const hostStyle = getComputedStyle(host);
    const sheet = host.shadowRoot.querySelector('.pp-print-sheet').getBoundingClientRect();
    const size = PageLayout.getPageSizePx();
    return {
      others: others.map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')), shown: others.filter(el => getComputedStyle(el).display !== 'none').map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')),
      app: getComputedStyle(document.getElementById('app')).display, hostDisplay: hostStyle.display, hostPosition: hostStyle.position, hostOpacity: hostStyle.opacity,
      sheet: [Math.round(sheet.left), Math.round(sheet.top), Math.round(sheet.width), Math.round(sheet.height)], page: [Math.round(size.width), Math.round(size.height)],
    };
  });
  await page.emulateMedia({ media: null });
  check('en média d’impression, rien d’autre que le conteneur n’est montré dans le corps de la page', !printed.noHost && printed.others.length >= 1 && printed.shown.length === 0 && printed.app === 'none', printed);
  check('le conteneur est dans le flot (position static), opaque, et sa première feuille a la taille de la page, en haut à gauche', !printed.noHost && printed.hostDisplay === 'block' && printed.hostPosition === 'static' && printed.hostOpacity === '1' && printed.sheet[0] === 0 && printed.sheet[1] === 0 && printed.sheet[2] === printed.page[0] && printed.sheet[3] === printed.page[1], printed);
  await app.evaluate(async () => { const job = await PrintExport.prepare('<p>x</p>', null, { id: 1 }, null, 'x'); job.dispose(); });
  await page.emulateMedia({ media: 'print' });
  const ordinary = await app.evaluate(() => ({ app: getComputedStyle(document.getElementById('app')).display, toolbar: getComputedStyle(document.getElementById('toolbar-top')).display, host: !!document.getElementById('pp-print-host'), printing: document.documentElement.classList.contains('pp-printing') }));
  await page.emulateMedia({ media: null });
  check('sans impression posée, un Ctrl + P ordinaire de la page est inchangé : ni conteneur ni classe, la page reste montrée', ordinary.app !== 'none' && ordinary.toolbar !== 'none' && !ordinary.host && !ordinary.printing, ordinary);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n4) Seule ou hébergée, la même impression : les mêmes feuilles, aux mêmes coupures');
{
  const alone = await t.openPage({ hosted: false, seed: SEED });
  await setDocument(alone.page, DOC, HF);
  await sleep(1500);
  const aloneRun = await prepareIn(alone.page);
  check('seule, l’impression passe par la page du widget, comme hébergée : aucun cadre, une feuille par page de la Lecture, la police de `body`', !aloneRun.error && aloneRun.iframes === 0 && aloneRun.sheets === aloneRun.pageCount && aloneRun.pageCount >= 3 && !!aloneRun.font && aloneRun.font === aloneRun.bodyFont, aloneRun);
  check('hébergée dans le cadre isolé, les feuilles ont les mêmes fenêtres (de, à, place) que seule, au centième de pixel', !!isolatedWindows && JSON.stringify(isolatedWindows) === JSON.stringify(aloneRun.windows), { isolé: isolatedWindows, seule: aloneRun.windows });
  await alone.context.close();
  const hosted = await t.openPage({ hosted: true, seed: SEED });
  await setDocument(hosted.page, DOC, HF);
  await sleep(1500);
  const hostedRun = await prepareIn(hosted.page);
  check('hébergée (`?gfs=0`, sans cadre isolé), l’impression a les mêmes feuilles que seule', !hostedRun.error && hostedRun.iframes === 0 && hostedRun.pageCount === aloneRun.pageCount && JSON.stringify(hostedRun.windows) === JSON.stringify(aloneRun.windows) && hostedRun.font === aloneRun.font, hostedRun);
  await hosted.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n5) Les liens mailto: et tel: s’ouvrent dans un nouvel onglet quand l’app est hébergée ; seule, rien ne change');
// Ce qu'un clic suit, lu sans le suivre : chaque lien mailto, tel ou web que le widget fabrique et clique de lui-même (un <a> posé dans le corps de la page), arrêté en phase de capture.
const CAPTURE = () => {
  window.__links = [];
  document.addEventListener('click', event => {
    const a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!a || a.parentNode !== document.body || !/^(?:mailto|tel|https?):/i.test(a.getAttribute('href'))) return;
    window.__links.push({ scheme: a.getAttribute('href').replace(/^((?:mailto|tel|https?):).*$/i, '$1'), target: a.getAttribute('target'), rel: a.getAttribute('rel') });
    event.preventDefault();
  }, true);
};
const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' };
const AS_BEFORE = { target: null, rel: null };
const readerLinks = page => page.evaluate(() => Array.from(document.querySelectorAll('#reader-container a[href]')).map(a => ({ scheme: a.getAttribute('href').replace(/^((?:mailto|tel|https?):).*$/i, '$1'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })));
let editorLinksAlone = null;
const sameLink = (got, scheme, want) => !!got && got.scheme === scheme && got.target === want.target && got.rel === want.rel;
for (const hostedMode of [false, true]) {
  const label = hostedMode ? 'hébergée' : 'seule';
  const want = hostedMode ? NEW_TAB : AS_BEFORE;
  // « Créer l'e-mail » : le <a> synthétique du lien mailto: (js/main.js, onCreateEmail). Hébergée, GFS désigne le modèle e-mail ; seule, c'est le modèle de la vue.
  const mail = await t.openPage(hostedMode ? { hosted: true, seed: SEED, stub: { ouverture: EMAIL_AT_START } } : { hosted: false, seed: seedModels({ record: RECORD, options: { modeleDeLaVue: '4' } }) });
  await mail.page.evaluate(CAPTURE);
  await realClick(mail.page, mail.page, '#btn-create-email');
  await mail.page.waitForFunction(() => window.__links.length >= 1, null, { timeout: 15000 }).catch(() => {});
  const created = await mail.page.evaluate(() => ({ links: window.__links, status: (document.getElementById('status-msg') || {}).textContent }));
  check(`${label} : « Créer l’e-mail » suit le lien mailto: ${hostedMode ? 'dans un nouvel onglet (target="_blank", rel="noopener noreferrer")' : 'comme avant (sans target ni rel)'}`, created.links.length === 1 && sameLink(created.links[0], 'mailto:', want), created);
  await mail.context.close();
  // Le Ctrl + clic d'un lien de l'éditeur (js/link-dialog.js, openExternal), puis les liens de la Lecture (js/reader-mode.js).
  const doc = await t.openPage({ hosted: hostedMode, seed: SEED });
  await doc.page.evaluate(CAPTURE);
  await setDocument(doc.page, LINKS_DOC);
  await sleep(600);
  const results = {};
  for (const [scheme, selector] of [['mailto:', '.ProseMirror a[href^="mailto:"]'], ['tel:', '.ProseMirror a[href^="tel:"]'], ['https:', '.ProseMirror a[href^="https:"]']]) {
    await doc.page.evaluate(() => { window.__links.length = 0; });
    await realClick(doc.page, doc.page, selector, { ctrl: true });
    await sleep(300);
    results[scheme] = await doc.page.evaluate(() => window.__links.slice());
  }
  check(`${label} : le Ctrl + clic d’un lien mailto: ou tel: de l’éditeur ${hostedMode ? 'les ouvre dans un nouvel onglet' : 'garde son comportement (sans target ni rel)'} ; un lien web s’ouvre toujours dans un nouvel onglet`, results['mailto:'].length === 1 && sameLink(results['mailto:'][0], 'mailto:', want) && results['tel:'].length === 1 && sameLink(results['tel:'][0], 'tel:', want) && results['https:'].length === 1 && sameLink(results['https:'][0], 'https:', NEW_TAB), results);
  // Les liens de la Lecture (js/reader-mode.js) : ceux que l'éditeur écrit portent déjà target="_blank" (seule comme hébergée, ils ne changent pas) ; ceux qui viennent d'ailleurs (modèle importé, colonne
  // écrite par un autre) n'en portent pas : la Lecture reçoit ici le HTML brut.
  await realClick(doc.page, doc.page, '#btn-mode-read');
  await doc.page.waitForFunction(() => { const rc = document.getElementById('reader-container'); return !!rc && getComputedStyle(rc).display !== 'none' && !!rc.querySelector('a[href^="mailto:"]'); }, null, { timeout: 30000 }).catch(() => {});
  await sleep(500);
  const fromEditor = await readerLinks(doc.page);
  check(`${label} : dans la Lecture, les liens que l’éditeur a écrits s’ouvrent déjà dans un nouvel onglet`, ['mailto:', 'tel:', 'https:'].every(scheme => { const link = fromEditor.find(l => l.scheme === scheme); return !!link && link.target === '_blank' && /noopener/.test(link.rel || ''); }), fromEditor);
  if (hostedMode) check('hébergée, ce que ces liens portent est ce qu’ils portent seule (rien n’est changé à un lien déjà ouvert dans un nouvel onglet)', JSON.stringify(fromEditor) === JSON.stringify(editorLinksAlone), { seule: editorLinksAlone, hébergée: fromEditor });
  else editorLinksAlone = fromEditor;
  await doc.page.evaluate(html => ReaderMode.render(html, GristAPI.getCurrentTableId(), GristAPI.getCurrentRecord(), null), LINKS_DOC);
  await sleep(300);
  const raw = await readerLinks(doc.page);
  const inRaw = scheme => raw.find(l => l.scheme === scheme);
  check(`${label} : dans la Lecture, les liens mailto: et tel: venus d’ailleurs ${hostedMode ? 'portent target="_blank" et rel="noopener noreferrer"' : 'n’en portent pas (comme avant)'}, le lien web les porte toujours`, sameLink(inRaw('mailto:'), 'mailto:', want) && sameLink(inRaw('tel:'), 'tel:', want) && sameLink(inRaw('https:'), 'https:', NEW_TAB), raw);
  await doc.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n6) Dans le cadre isolé de GFS (frame-src \'self\'), un clic sur un lien e-mail ou téléphone laisse l’app affichée');
{
  // « Créer l'e-mail » : la page parente porte la politique de GFS, l'app ouvre le modèle e-mail que GFS désigne.
  const mail = await t.openPage({ framed: { csp: GFS_CSP }, bypassCSP: false, seed: SEED, stub: { ouverture: EMAIL_AT_START } });
  const mailUrl = mail.app.url();
  await realClick(mail.page, mail.app, '#btn-create-email');
  await sleep(2500);
  const afterCreate = { alive: await alive(mail.app), url: mail.app.url(), status: await statusOf(mail.app) };
  check('« Créer l’e-mail » : l’app reste affichée (même adresse, éditeur vivant) et le message dit que l’e-mail est créé', afterCreate.alive && afterCreate.url === mailUrl && /Email créé/.test(afterCreate.status || ''), afterCreate);
  await mail.context.close();
  // Le Ctrl + clic d'un lien de l'éditeur : mailto:, puis tel:.
  const editor = await t.openPage({ framed: { csp: GFS_CSP }, bypassCSP: false, seed: SEED });
  const editorUrl = editor.app.url();
  await setDocument(editor.app, LINKS_DOC);
  await sleep(600);
  await realClick(editor.page, editor.app, '.ProseMirror a[href^="mailto:"]', { ctrl: true });
  await sleep(1500);
  const afterMailto = { alive: await alive(editor.app), url: editor.app.url() };
  check('Ctrl + clic sur un lien mailto: de l’éditeur : l’app reste affichée', afterMailto.alive && afterMailto.url === editorUrl, afterMailto);
  if (afterMailto.alive) {
    await realClick(editor.page, editor.app, '.ProseMirror a[href^="tel:"]', { ctrl: true });
    await sleep(1500);
  }
  const afterTel = { alive: await alive(editor.app), url: editor.app.url() };
  check('Ctrl + clic sur un lien tel: de l’éditeur : l’app reste affichée', afterTel.alive && afterTel.url === editorUrl, afterTel);
  await editor.context.close();
  // Les liens de la Lecture.
  const reader = await t.openPage({ framed: { csp: GFS_CSP }, bypassCSP: false, seed: SEED });
  const readerUrl = reader.app.url();
  await realClick(reader.page, reader.app, '#btn-mode-read');
  await reader.app.waitForFunction(() => { const rc = document.getElementById('reader-container'); return !!rc && getComputedStyle(rc).display !== 'none'; }, null, { timeout: 30000 }).catch(() => {});
  await sleep(500);
  await reader.app.evaluate(html => ReaderMode.render(html, GristAPI.getCurrentTableId(), GristAPI.getCurrentRecord(), null), LINKS_DOC);
  await sleep(500);
  await realClick(reader.page, reader.app, '#reader-container a[href^="mailto:"]');
  await sleep(1500);
  const readerMailto = { alive: await alive(reader.app), url: reader.app.url() };
  check('Lecture : un clic sur un lien mailto: venu d’ailleurs laisse l’app affichée', readerMailto.alive && readerMailto.url === readerUrl, readerMailto);
  if (readerMailto.alive) {
    await realClick(reader.page, reader.app, '#reader-container a[href^="tel:"]');
    await sleep(1500);
  }
  const readerTel = { alive: await alive(reader.app), url: reader.app.url() };
  check('Lecture : un clic sur un lien tel: venu d’ailleurs laisse l’app affichée', readerTel.alive && readerTel.url === readerUrl, readerTel);
  await reader.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n7) Un rechargement voulu par l’app rouvre le modèle où la personne était, dans ce cadre isolé (stockage refusé), avant l’ouverture que GFS rejouerait');
{
  const openedIn = app => app.evaluate(() => ({ id: String(Templates.getCurrentId()), name: (document.getElementById('template-name') || {}).value || '', hash: location.hash, hosted: GfsLink.hosted, origin: window.origin })).catch(e => ({ error: String(e) }));
  const C_AT_START = { fichier: { id: '3', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' };
  for (const replay of [false, true]) {
    const how = replay ? 'GFS rejoue la dernière ouverture (« Départ C »)' : 'GFS ne rend plus l’ouverture';
    const { page, app, context } = await t.openPage({ framed: true, seed: SEED, stub: replay ? { ouverture: C_AT_START } : null });
    const start = await openedIn(app);
    check(`${how} : au démarrage, ${replay ? '« Départ C » (GFS le désigne)' : 'le ★ « Départ A défaut »'} est ouvert, dans un cadre d’origine « null »`,
      start.origin === 'null' && start.hosted === true && (replay ? start.id === '3' : start.id === '1'), start);
    await app.evaluate(() => { const s = document.getElementById('template-select'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await app.waitForFunction(() => String(Templates.getCurrentId()) === '2', null, { timeout: 10000 }).catch(() => {});
    await sleep(300);
    const onB = await openedIn(app);
    check(`${how} : la personne ouvre « Départ B »`, onB.id === '2' && onB.name === 'Départ B', onB);
    await app.evaluate(() => { window.__marker = 'avant'; });
    await realClick(page, app, '#v2-btn-settings');
    await sleep(300);
    await realClick(page, app, '#settings-modal .settings-tab[data-settings-tab="triggerKey"]');
    await sleep(200);
    await app.selectOption('#settings-trigger-char', '@');
    await realClick(page, app, '#settings-trigger-reload-btn');
    await app.waitForFunction(() => !window.__marker && typeof EditorCore !== 'undefined' && !!EditorCore.getEditor && !!EditorCore.getEditor() && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 90000 }).catch(() => {});
    const after = await openedIn(app);
    check(`${how} : le cadre rechargé rouvre « Départ B », pas ${replay ? '« Départ C »' : 'le ★'}, et le fragment est effacé de son adresse`,
      after.id === '2' && after.name === 'Départ B' && after.hash === '' && after.hosted === true && after.origin === 'null' && !/pp-open/.test(app.url()), { after, url: app.url() });
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n8) « Nouveau > Importer » : le fichier que GFS donne traverse le cadre isolé (origine « nulle ») et s’importe, au démarrage comme par l’appel `ouvrir`');
{
  const MD_TEXT = '# Titre du fichier de GFS\n\nUn paragraphe du fichier.';
  const MD_ON_SCREEN = 'Titre du fichier de GFSUn paragraphe du fichier.';
  const makeFile = (text, name) => `new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: 'text/markdown' })`;
  const importation = (text, name) => `{ fichier: null, type: 'document', dossier: '', raison: 'importer', importation: { valeur: 'markdown', fichier: ${makeFile(text, name)} } }`;
  // Posée sur la page PARENTE avant ses scripts : le stub de GFS (dev-tests/gfs-stub.js) s'y crée en affectant `window.__gfsStub`, et l'`ouverture` d'un test ne passe pas par du JSON quand elle porte un File ; l'accesseur la pose
  // à cet instant, avant que le cadre ne demande le contexte.
  const parentInit = `(() => { let held; Object.defineProperty(window, '__gfsStub', { configurable: true, get() { return held; }, set(stub) { held = stub; stub.ouverture = ${importation(MD_TEXT, 'depuis-gfs.md')}; } }); })();`;
  const frameState = app => app.evaluate(() => {
    const opening = GfsLink.opening();
    const given = opening && opening.importation;
    return {
      origin: window.origin, hosted: GfsLink.hosted, current: Templates.getCurrentId(), name: (document.getElementById('template-name') || {}).value || '',
      text: document.querySelector('.ProseMirror').textContent, status: document.getElementById('status-msg').textContent,
      given: given ? { reason: opening.raison, valeur: given.valeur, isFile: given.fichier instanceof File, name: given.fichier.name, size: given.fichier.size } : null,
    };
  }).catch(e => ({ error: String(e) }));

  // Au démarrage : l'`ouverture` du contexte porte le fichier.
  const startup = await t.openPage({ framed: true, seed: SEED, ready: false, init: parentInit });
  await startup.app.waitForFunction(() => /^Markdown importé/.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 90000 }).catch(() => {});
  let state = await frameState(startup.app);
  check('au démarrage, le fichier est arrivé dans le cadre d’origine « null » : une importation `markdown`, d’un `File` de ce cadre, de son nom et de sa taille', state.origin === 'null' && state.hosted === true
    && !!state.given && state.given.reason === 'importer' && state.given.valeur === 'markdown' && state.given.isFile === true && state.given.name === 'depuis-gfs.md' && state.given.size === new TextEncoder().encode(MD_TEXT).length, state);
  check('… l’app l’a lu malgré l’origine « nulle » et importé : le document est à l’écran, sans nom ni modèle courant, avec la phrase du menu « + »', state.text === MD_ON_SCREEN && state.current == null && state.name === ''
    && /^Markdown importé\. Nommez le modèle puis enregistrez-le\./.test(state.status), state);
  check('… l’app est vivante (son éditeur répond)', await alive(startup.app));
  await startup.context.close();

  // L'app déjà ouverte : l'appel `ouvrir` de GFS porte le fichier.
  const open = await t.openPage({ framed: true, seed: SEED });
  const reply = await open.page.evaluate(`window.__gfsStub.ouvrir(${importation(MD_TEXT, 'ensuite.md')})`);
  state = await frameState(open.app);
  check('l’appel `ouvrir` porte le fichier : GFS reçoit `{ ouvert: true }` et le document du fichier est à l’écran, sans nom ni modèle courant', reply.type === 'reponse' && reply.data.ouvert === true && state.text === MD_ON_SCREEN
    && state.current == null && state.name === '' && /^Markdown importé/.test(state.status), { reply, state });
  await open.context.close();
}

await t.finish();
