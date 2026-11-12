#!/usr/bin/env node
// « GARDER LIÉE » D'UNE DIAPOSITIVE D'UNE GROSSE PRÉSENTATION (12/11, « l'import prend beaucoup de temps, genre beaucoup ») : js/slide-links.js:anchorSource relisait toute la table des modèles à chaque étape et lisait
// deux fois, en entier, le texte de la présentation source (un PowerPoint de 30 Mo : plusieurs secondes de page figée à chaque lecture), pour poser le repère de la diapositive dans sa ligne. Désormais : le texte que le
// volet a déjà lu pour ses miniatures sert tel quel (aucune relecture si la source n'a pas changé) et le jeton du modèle ne relit plus la table avant d'être écrit (Templates.ensureToken, `fresh`). L'écriture du repère
// dans la source reste (un seul passage, dans la ligne de la source). À la vraie souris et au vrai clavier, 700x400, français clair, l'app dans le cadre isolé de GFS : un document « Devis » à l'écran, la présentation
// « Offre » de 12 diapositives de 60 formes de décor, un logo de 150 Ko chacune (environ 2,5 Mo de texte), colonne `Jeton` vide.
//  - la PREMIÈRE liaison de la présentation (elle n'a pas encore de jeton) : du clic au coin d'état, au plus TROIS lectures de la table entière (celle de la source, celle du jeton écrit, la date relue ; il y en avait
//    quatre) et AUCUNE lecture du texte de la source par le navigateur (HtmlSanitize.parseInert sur le texte entier : il y en avait deux) ;
//  - la SECONDE (le jeton existe) : au plus deux lectures de la table, le texte de la source lu une seule fois (la première liaison y a posé un repère : le volet ne l'a pas relu) ;
//  - le résultat est celui d'avant : la copie est posée avec son repère (un lien vers « Offre »), la ligne de la source reçoit le numéro de chaque diapositive liée, une fois, sans autre changement de son texte.
// Lancé par run-headless.mjs (groupe Node « slideLinkReads », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-link-reads.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-link-reads', port: Number(process.env.SLIDE_LINK_READS_PORT || 9140) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SLIDES = 12;
const DECOR = 60;
const IMG_KB = 150;

// Les gestes à la vraie souris et au vrai clavier : les éléments se lisent dans le cadre de l'app (`app`), la souris et le clavier sont ceux de l'onglet (`page`), décalés de la place du
// cadre dans la page parente.
function toolsOf(tab) {
  const { page, app } = tab;
  let shift = null;
  const offset = async () => {
    if (!shift) {
      const frame = app === page ? null : await app.frameElement();
      const box = frame ? await frame.boundingBox() : null;
      shift = box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
    }
    return shift;
  };
  const inPage = async (c) => { if (!c) return c; const o = await offset(); return Object.assign({}, c, { x: c.x + o.x, y: c.y + o.y }); };
  const centerOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right };
  }, [selector, index]);
  // La souris arrive près de la cible, puis glisse dessus : un long trajet passerait sur les menus au survol de la barre d'outils.
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, settle = 250) => {
    const c = await inPage(await centerOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(settle);
  };
  // Le menu « Lien et blocs de contenu » : il s'ouvre au survol de son icône (la souris arrive d'en dessous), et se quitte par le coin bas droit du panneau.
  const openMenu = async () => {
    const c = await inPage(await centerOf('#v2-btn-link'));
    await page.mouse.move(c.x, c.y + 120);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await sleep(500);
    return c;
  };
  const leaveMenu = async () => { await page.mouse.move(670, 380, { steps: 3 }); await sleep(300); };
  // Une ligne du menu, à la vraie souris : la main descend de l'icône sur la ligne, sans quitter le volet, et clique.
  const clickRow = async (id, settle = 700) => {
    const c = await openMenu();
    // Le menu a dix lignes et défile à 700x400 (depuis « Vidéo », d2e0656, la dernière - « Diapositive d'une présentation… » - est sous le bas du menu) : la molette, la souris posée sur le menu, amène
    // la ligne voulue dans sa partie visible. Sans cela le clic tombait sous le bas de la fenêtre et le volet ne s'ouvrait pas (« .pp-slide-import .ss-trigger » introuvable).
    for (let i = 0; i < 6; i++) {
      const hidden = await app.evaluate((rowId) => {
        const f = document.getElementById('v2-blocks-flyout').getBoundingClientRect();
        const r = document.getElementById(rowId).getBoundingClientRect();
        return r.bottom > f.bottom - 1 || r.top < f.top;
      }, id);
      if (!hidden) break;
      const spot = await inPage(await centerOf('#v2-row-link'));
      await page.mouse.move(spot.x, spot.y + 40, { steps: 3 });
      await page.mouse.wheel(0, 120);
      await sleep(150);
    }
    const r = await inPage(await centerOf('#' + id));
    const x = Math.min(Math.max(c.x, r.left + 8), r.right - 8);
    await page.mouse.move(x, r.y, { steps: 8 });
    await sleep(100);
    await page.mouse.click(x, r.y);
    await sleep(settle);
  };
  // Une miniature du volet amenée dans la partie visible de sa liste par la molette de la souris, posée sur la liste.
  const showThumb = async (index, selector = '.pp-slide-import') => {
    for (let i = 0; i < 12; i++) {
      const at = await app.evaluate(([k, root]) => {
        const list = document.querySelector(root + ' .pp-slide-import-list, ' + root + ' .pp-slide-strip-list');
        const thumb = document.querySelectorAll(root + ' .pp-slide-thumb')[k];
        if (!list || !thumb) return null;
        const l = list.getBoundingClientRect();
        const r = thumb.getBoundingClientRect();
        return { list: { x: l.left + l.width / 2, y: l.top + l.height / 2 }, dy: r.top < l.top ? r.top - l.top - 8 : r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0 };
      }, [index, selector]);
      if (!at || !at.dy) return;
      const c = await inPage(at.list);
      await reach(c);
      await page.mouse.wheel(0, at.dy);
      await sleep(250);
    }
  };
  const clickThumb = async (index, settle = 250) => { await showThumb(index); await click('.pp-slide-import .pp-slide-thumb', index, settle); };
  // Le texte `text` d'un bloc de l'éditeur, amené à l'écran : un clic juste avant sa dernière lettre (le curseur au bout du texte).
  const clickText = async (text) => {
    const c = await inPage(await app.evaluate((whole) => {
      const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
      if (!block) return null;
      block.scrollIntoView({ block: 'center' });
      const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, node.textContent.length);
      const r = range.getBoundingClientRect();
      return { x: r.right - 1, y: r.top + r.height / 2 };
    }, text));
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  // Le choix d'une source dans la liste avec recherche du volet : un clic, le début du nom, Entrée.
  const pickSource = async (query) => {
    await click('.pp-slide-import .ss-trigger', 0, 400);
    await page.keyboard.type(query);
    await sleep(250);
    await press('Enter');
    await sleep(500);
    // Ces essais jouent la copie EN TEXTE (le volet choisit « En bloc » d'abord, le bloc a son propre essai : `slideBlock`) : on choisit « En texte ».
    await click('.pp-slide-import-kind-btn', 1, 300);
  };
  return { click, clickRow, openMenu, leaveMenu, clickThumb, showThumb, clickText, press, pickSource, reach, inPage, centerOf };
}


// La présentation lourde, fabriquée par l'éditeur lui-même (des cadres libres de décor derrière le texte, un logo en image, un titre) et enregistrée telle que getHTML() l'écrit.
async function buildHeavy() {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
  const html = await page.evaluate(({ slides, decor, imgKb }) => {
    const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    const b64 = 'iVBORw0KGgo'.repeat(Math.ceil(imgKb * 1024 / 11));
    let out = '';
    for (let n = 1; n <= slides; n++) {
      if (n > 1) out += MARK;
      for (let i = 0; i < decor; i++) out += FreeFrame.html({ x: (i % 24) * 26, y: 10 + Math.floor(i / 24) * 12, w: 24, h: 10, shape: 'rect', fill: '#0070c0', layer: 'behind', decorative: '1' }, '');
      out += FreeFrame.html({ x: 10, y: 400, w: 60, h: 40, layer: 'behind' }, `<p><img class="editor-image" src="data:image/png;base64,${b64}" alt="" style="width: 80px"></p>`);
      out += FreeFrame.html({ x: 40, y: 20, w: 560, h: 60 }, `<h1>Titre ${n}</h1>`) + FreeFrame.html({ x: 40, y: 100, w: 560, h: 120 }, `<p>Texte de la diapositive ${n}</p>`);
    }
    return out;
  }, { slides: SLIDES, decor: DECOR, imgKb: IMG_KB });
  await page.context().close();
  return html;
}

const heavy = await buildHeavy();
const SEED = seedModels() + `
  m.Contenu[0] = '<p>Bonjour,</p><p>Cordialement</p>';
  m.id.push(8); m.Nom.push('Offre'); m.Contenu.push(window.__HEAVY); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(false); m.TypeModele.push('presentation');
  stub.state.nextRowId.Publipostage_Modeles = 10;
  m.Jeton = m.id.map(() => '');
`;

const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE }, seed: SEED, init: `window.__HEAVY = ${JSON.stringify(heavy)};`, lang: 'fr', colorScheme: 'light' });
const { page, app } = A;
const a = toolsOf(A);
await sleep(1500);

// Ce que le navigateur fait d'une table lourde : les lectures de la table des modèles et les lectures d'un texte entier de la source, comptées depuis le clic.
await app.evaluate((size) => {
  window.__reads = 0; window.__parses = 0; window.__big = size;
  const docApi = grist.docApi;
  const fetchTable = docApi.fetchTable.bind(docApi);
  // Ne comptent que les lectures de la liaison : le passage de l'enregistrement automatique (toutes les 2,5 s) et l'enregistrement du document ouvert (saveRow) lisent la table eux aussi, et selon l'instant
  // où ils tombent par rapport au clic (le moindre retard de la page les déplace) ils se retrouvaient dans la fenêtre : l'essai ne mesurait plus la liaison.
  docApi.fetchTable = (table) => { if (table === 'Publipostage_Modeles' && !/runAutosaveTick|saveRow/.test(new Error().stack)) window.__reads++; return fetchTable(table); };
  const parse = HtmlSanitize.parseInert;
  HtmlSanitize.parseInert = function (html) { if (String(html).length >= window.__big / 2 && !/runAutosaveTick|saveRow/.test(new Error().stack)) window.__parses++; return parse.apply(this, arguments); };
}, heavy.length);
const counts = () => app.evaluate(() => ({ reads: window.__reads, parses: window.__parses }));
const resetCounts = () => app.evaluate(() => { window.__reads = 0; window.__parses = 0; });
// Ce que le coin d'état a dit depuis `watchStatus` : l'enregistrement automatique le recouvre vite, on ne le lit pas à un instant donné.
const watchStatus = () => app.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true });
});
const said = () => app.evaluate(() => window.__statusSeen.slice());
// Attend que le coin d'état dise `pattern` ; rend le moment (ms depuis `from`) et les lectures comptées à cet instant.
const waitSaid = async (pattern, from) => {
  const ok = await app.waitForFunction(p => window.__statusSeen.some(m => new RegExp(p).test(m)), pattern.source, { timeout: 90000 }).then(() => true, () => false);
  const took = Date.now() - from;
  return { ok, took, counts: await counts() };
};
const statusOf = () => app.evaluate(() => document.getElementById('status-msg').textContent);
const stored = () => app.evaluate(() => (window.__gristStub.getRow('Publipostage_Modeles', 8) || {}).Contenu || '');
const copies = () => app.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.forEach((n) => { if (n.type.name === 'slideLink') out.push(Object.assign({}, n.attrs)); }); return out; });

await a.clickText('Bonjour,');
await a.clickRow('v2-btn-slide-text', 900);
await a.leaveMenu();
await a.pickSource('offre');
await a.click('#pp-slide-import-keep', 0, 300);
const rows = await app.evaluate(() => document.querySelectorAll('.pp-slide-import .pp-slide-item').length);
check('le volet montre les ' + SLIDES + ' diapositives de « Offre » (' + (heavy.length / 1e6).toFixed(1) + ' M signes) avec « Garder liée » cochée', rows === SLIDES, rows);

// --- La première liaison : la présentation n'a pas de jeton.
await watchStatus();
await resetCounts();
const first = Date.now();
await a.clickThumb(2, 0);
const one = await waitSaid(/3 de « Offre » insérée en texte, liée à sa source/, first);
let c = one.counts;
check('la diapositive 3 est posée, liée à « Offre » (' + one.took + ' ms)', one.ok, await said());
check('première liaison : au plus trois lectures de la table des modèles entière (il y en avait quatre)', c.reads <= 3, c);
check('première liaison : le texte de la source n’est relu par le navigateur NI une fois (il l’était deux fois)', c.parses === 0, c);
let tags = await copies();
check('le repère de la copie : « Offre », « Suit la source », une diapositive, la base de sa diapositive', tags.length === 1 && tags[0].linkModel === 8 && tags[0].linkMode === 'pull' && /^[a-z0-9]{8,24}$/.test(tags[0].linkSlide || '') && !!tags[0].linkBase && !!tags[0].linkKey, tags);
let source = await stored();
check('la ligne de « Offre » reçoit le numéro de la diapositive 3, une fois ; son texte n’a pas bougé (même nombre de diapositives, mêmes titres)',
  !!tags[0] && source.split('data-slide-id="' + tags[0].linkSlide + '"').length === 2 && (source.match(/page-break-marker/g) || []).length === SLIDES - 1 && source.includes('Titre 3') && source.includes('Titre 12'), { ids: (source.match(/data-slide-id/g) || []).length });

// --- La seconde : le jeton existe.
await a.clickText('Cordialement');
await watchStatus();
await resetCounts();
const second = Date.now();
await a.clickThumb(4, 0);
const two = await waitSaid(/5 de « Offre » insérée en texte, liée à sa source/, second);
c = two.counts;
check('seconde liaison (' + two.took + ' ms) : au plus deux lectures de la table, et le texte de la source n’est lu qu’une fois (la première liaison l’a changé : il y avait le repère de plus ; il l’était deux fois)', c.reads <= 2 && c.parses <= 1, c);
tags = await copies();
source = await stored();
check('deux copies liées, chacune à sa diapositive ; la source porte les deux numéros', tags.length === 2 && tags[0].linkSlide !== tags[1].linkSlide && (source.match(/data-slide-id/g) || []).length === 2, { tags: tags.length, ids: (source.match(/data-slide-id/g) || []).length });

await t.finish();
