#!/usr/bin/env node
// Les diapositives liées (js/slide-links.js, extensions/diapositives/slide-links-ui.js ; demande du 21/10, « Réutiliser », sa troisième fonction ; cartes « Case du volet », « À la frappe »,
// « Demander »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (extension « diapositives » active), « Cible » à l'écran.
//  L'IMPORT LIÉ : dans le volet « Importer », la case « Garder liée » (décochée, lisible) change l'indication ; un clic sur la miniature 2 de « Source » la copie après la diapositive du
//   curseur avec son repère caché (le lien : la source, sa diapositive, le sens « Dans les deux sens », la base), et la ligne de « Source » reçoit tout de suite le numéro de sa
//   diapositive ; sa forme se pose sur sa nouvelle page ; le coin d'état le dit ; sa miniature porte la pastille du lien, que son nom dit aussi. Un seul Ctrl+Z défait l'import lié, un
//   Ctrl+Y le refait avec son lien.
//  CE QUI CHANGE ICI PART À LA SOURCE : du texte tapé dans la diapositive liée, puis Ctrl+S : la ligne de « Source » le reçoit dans le même enregistrement, et rien ne reste à envoyer.
//  CE QUI CHANGE DANS LA SOURCE ARRIVE ICI : « Source » réécrite ailleurs, la lecture suivante de l'enregistrement automatique remplace la diapositive liée ; le coin d'état le dit, et
//   Ctrl+Z ne la rend pas (il défait ce que la personne a tapé).
//  « DEMANDER » : changée des deux côtés, la fenêtre montre les deux versions en miniatures, chacune sous son nom, entière dans le panneau ; le clavier arrive sur son cadre (une touche
//   ne choisit rien) ; « Prendre l'autre » prend celle de la source (un Ctrl+Z la rend) ; « Comparer les deux versions », dans le menu ⋯, la rouvre ; « Garder celle d'ici » la garde,
//   et Ctrl+S l'envoie à la source.
//  LE MENU ⋯ : la note « Liée à « Source » », les trois sens (celui du lien coché), « Comparer », « Détacher », lisibles. « Suit la source » : la diapositive refuse la frappe, le coin
//   d'état dit pourquoi (en rouge), le reste s'écrit. « Envoie à la source », puis Ctrl+S : la diapositive de « Source » porte le verrou ; « Source » ouverte, sa pastille est un cadenas,
//   elle refuse la frappe, et son menu ne propose que « Détacher ».
//  LES GARDE-FOUS : une diapositive liée dupliquée garde sa copie sans lien ; un collage de son HTML (repère compris) ne lie rien.
//  LES SORTIES : la Lecture et le diaporama ne montrent jamais le repère, ni le HTML qu'ils reçoivent.
//  « DÉTACHER » : la pastille et le lien partent, la diapositive garde ce qu'elle montre ; enregistré, le verrou de « Source » tombe : elle s'écrit de nouveau.
// Lancé par run-headless.mjs (groupe Node "slidesLink", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-link.mjs
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-link', port: Number(process.env.SLIDES_LINK_PORT || 8952) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// La forme « Devant le texte » de la diapositive 2 de « Source », sur sa page (la 2).
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const layered = (src, pageIndex) => `<img class="editor-image" src="${src}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: 5" data-layer="front" data-wrap="inline" data-page-index="${pageIndex}" data-page-left-pt="40" data-page-top-pt="30">`;
// 7 « Source » : trois diapositives, la deuxième avec un titre, un texte et une forme ; 8 « Cible » : trois diapositives.
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Source', '<p>Source un</p>${BR}<h2>Deux titre</h2><p>Deux texte</p><p>${layered(FRONT, 1)}</p>${BR}<p>Source trois</p>', false, 'presentation');
  add(8, 'Cible', '<p>Cible un</p>${BR}<p>Cible deux</p>${BR}<p>Cible trois</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 9;
`;
const TEXTS = {
  fr: {
    keep: 'Garder liée', hint: n => `Un clic sur une diapositive l’importe, liée à sa source, après la diapositive ${n}.`, done: (n, name) => `Diapositive ${n} de « ${name} » importée, liée à sa source.`,
    item: (n, total) => `Diapositive ${n} sur ${total}`, both: name => `Liée à « ${name} », dans les deux sens`, title: 'Deux versions d’une diapositive liée', here: 'Ici', there: name => `Dans « ${name} »`,
    buttons: ['Garder celle d’ici', 'Plus tard', 'Prendre l’autre'], note: name => `Liée à « ${name} »`, lockNote: name => `Envoyée ici par « ${name} »`,
    links: ['Dans les deux sens', 'Suit la source', 'Envoie à la source', 'Comparer les deux versions', 'Détacher'],
  },
  en: {
    keep: 'Keep linked', hint: n => `Click a slide to import it, linked to its source, after slide ${n}.`, done: (n, name) => `Slide ${n} from “${name}” imported, linked to its source.`,
    item: (n, total) => `Slide ${n} of ${total}`, both: name => `Linked to “${name}”, both ways`, title: 'Two versions of a linked slide', here: 'Here', there: name => `In “${name}”`,
    buttons: ['Keep this one', 'Later', 'Take the other one'], note: name => `Linked to “${name}”`, lockNote: name => `Sent here by “${name}”`,
    links: ['Both ways', 'Follows the source', 'Sends to the source', 'Compare both versions', 'Detach'],
  },
};
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;

// Les outils d'une page ouverte : positions et gestes à la vraie souris (la souris arrive près de la cible, puis glisse dessus : un long trajet passerait sur les menus au survol de la
// barre d'outils).
function toolsOf(page) {
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  // Une miniature que sa liste ne montre pas entière : la molette, sur la liste, l'y amène d'abord.
  const showInList = async (selector, index) => {
    const need = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const list = el && el.closest('.pp-slide-list, .pp-slide-import-list');
      if (!list) return null;
      const r = el.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const delta = r.top < l.top ? r.top - l.top - 8 : (r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0);
      return delta ? { x: l.left + l.width / 2, y: l.top + l.height / 2, delta } : null;
    }, [selector, index]);
    if (!need) return;
    await page.mouse.move(need.x, need.y);
    await page.mouse.wheel(0, need.delta);
    await sleep(250);
  };
  const pointOf = (selector, index) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [selector, index]);
  const hover = async (selector, index = 0) => {
    await showInList(selector, index);
    const c = await pointOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, settle = 250) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y); await sleep(settle); return c; };
  // La ligne `label` du menu ⋯ de la miniature `index` : survol de la miniature, clic sur son « ⋯ », puis sur la ligne.
  const openMenu = async (index) => { await hover('.pp-slide-strip .pp-slide-thumb', index); await click('.pp-slide-strip .pp-slide-more', index, 300); };
  const menuRow = async (label) => {
    const at = await page.evaluate(text => Array.from(document.querySelectorAll('.pp-slide-menu.visible [data-action]')).findIndex(b => b.textContent === text && b.getBoundingClientRect().width > 0), label);
    if (at < 0) throw new Error('ligne introuvable : ' + label);
    await click('.pp-slide-menu.visible [data-action]', at, 500);
  };
  // Le texte `text` d'un bloc de l'éditeur (son texte entier), amené à l'écran : un clic sur sa première lettre (la forme posée sur la page, à droite, ne la couvre pas), puis Fin.
  const clickText = async (text) => {
    const c = await page.evaluate((whole) => {
      const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
      if (!block) return null;
      block.scrollIntoView({ block: 'center' });
      const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 1);
      const r = range.getBoundingClientRect();
      return { x: r.left + 1, y: r.top + r.height / 2 };
    }, text);
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    await page.keyboard.press('End');
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  const type = async (text) => { await page.keyboard.type(text, { delay: 30 }); await sleep(250); };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { hover, click, openMenu, menuRow, clickText, press, type, leave };
}

// Ce que montrent l'éditeur et la bande : le texte de chaque diapositive, son repère (le lien), la forme (sa page), les pastilles (montrée, info-bulle, couleur des versions qui
// diffèrent), le nom des miniatures, le coin d'état (et s'il est en rouge), ce que dit le module des liens, la fenêtre « Demander ».
const state = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const slides = SlideStrip.slidesOf(editor.state.doc);
  const tags = slides.map((s) => { const tag = s.nodes.find(e => e.node.type.name === 'slideLink'); return tag ? Object.assign({}, tag.node.attrs) : null; });
  const texts = slides.map(s => s.nodes.map(e => e.node.textContent).join(''));
  const images = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'editorImage') images.push({ layer: node.attrs.layer, pageIndex: node.attrs.pageIndex, slide: slides.findIndex(s => pos <= s.end) });
    return node.type.name !== 'editorImage';
  });
  const items = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
  const ask = document.getElementById('pp-slide-link-ask');
  const askOpen = !!ask && ask.style.display !== 'none';
  const box = ask && ask.querySelector('.pp-modal-box');
  const r = box ? box.getBoundingClientRect() : null;
  const status = document.getElementById('status-msg');
  return {
    texts, tags, images,
    badges: items.map((item) => { const b = item.querySelector('.pp-slide-link-badge'); return b && !b.hidden ? { title: b.title, differs: b.classList.contains('pp-slide-link-differs'), icon: !!b.querySelector('svg') } : null; }),
    labels: items.map(item => item.getAttribute('aria-label')),
    status: status.textContent, statusError: status.classList.contains('error-msg'),
    pending: SlideLinks.hasPending(editor),
    focusInEditor: !!document.activeElement && !!document.activeElement.closest('.ProseMirror'),
    ask: askOpen ? {
      title: ask.querySelector('#pp-slide-link-ask-title').textContent,
      message: ask.querySelector('.pp-slide-link-ask-message').textContent,
      captions: Array.from(ask.querySelectorAll('figcaption')).map(c => c.textContent),
      thumbs: Array.from(ask.querySelectorAll('.pp-slide-link-ask-thumb .pp-slide-page')).map(p => p.textContent),
      thumbImages: Array.from(ask.querySelectorAll('.pp-slide-link-ask-thumb')).map(h => h.querySelectorAll('img').length),
      buttons: Array.from(ask.querySelectorAll('.var-modal-actions button')).map(b => b.textContent),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width },
      focusOnBox: document.activeElement === box,
    } : null,
    html: editor.getHTML(),
  };
});
// Le menu ⋯ ouvert : ses lignes montrées (texte, cochée, grisée), sa note.
const menuState = page => page.evaluate(() => {
  const menu = document.querySelector('.pp-slide-menu.visible');
  if (!menu) return null;
  const rows = Array.from(menu.querySelectorAll('[data-action]')).filter(b => b.getBoundingClientRect().width > 0);
  const note = menu.querySelector('.pp-slide-menu-note');
  const group = menu.querySelector('.pp-slide-menu-link');
  const r = menu.getBoundingClientRect();
  return {
    rows: rows.map(b => b.textContent), checked: rows.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.textContent), disabled: rows.filter(b => b.getAttribute('aria-disabled') === 'true').map(b => b.textContent),
    note: note && note.getBoundingClientRect().width > 0 ? note.textContent : null, groupLabel: group ? group.getAttribute('aria-label') : null,
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width },
  };
});
// Ce que le coin d'état a dit depuis `watchStatus` : l'enregistrement automatique peut le remplacer peu après par « Enregistré à … ».
const watchStatus = page => page.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push({ text: el.textContent, error: el.classList.contains('error-msg') }));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
});
const statusSeen = page => page.evaluate(() => window.__statusSeen.slice());
const said = (seen, text) => seen.some(s => s.text === text);
const saidError = (seen, text) => seen.some(s => s.text === text && s.error);
// La ligne `id` du faux Grist : son texte, et le nombre d'enregistrements de la table.
const stored = (page, id) => page.evaluate(n => ({ html: (window.__gristStub.getRow('Publipostage_Modeles', n) || {}).Contenu || '', saves: window.__gristStub.countSaves('Publipostage_Modeles') }), id);
// La ligne `id` réécrite ailleurs (une autre personne, un autre onglet) : `from` remplacé par `to` dans son texte, sa date changée.
const rewrite = (page, id, from, to) => page.evaluate(([n, a, b]) => {
  const stub = window.__gristStub;
  const html = stub.getRow('Publipostage_Modeles', n).Contenu;
  stub.remoteWrite('Publipostage_Modeles', n, { Contenu: html.split(a).join(b), DateModif: new Date().toISOString() });
  return html.includes(a);
}, [id, from, to]);
const t18 = (page, key, vars) => page.evaluate(([k, v]) => I18n.t(k, v), [key, vars || {}]);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { page, natives } = A;
  const a = toolsOf(page);
  // L'appel `ouvrir` de GFS (le modèle à l'écran est enregistré d'abord : rien n'attend sa question), puis la bande et ses `slides` miniatures.
  const open = async (id, slides) => {
    await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id), sleep(20000)]);
    await page.waitForFunction(([n, count]) => {
      const strip = document.querySelector('.pp-slide-strip');
      return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === count;
    }, [id, slides], { timeout: 15000 }).catch(() => {});
    await sleep(800);
  };
  const save = async () => {
    const before = (await stored(page, 8)).saves;
    await a.press('Control+s');
    await page.waitForFunction(n => window.__gristStub.countSaves('Publipostage_Modeles') > n, before, { timeout: 10000 }).catch(() => {});
    await sleep(600);
  };
  await open(8, 3);
  await a.clickText('Cible deux');

  // --- Le volet « Importer », « Source » choisie : la case « Garder liée ».
  await a.click('.pp-slide-import-open', 0, 800);
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  await page.keyboard.type('sour');
  await sleep(250);
  await a.press('Enter');
  await sleep(500);
  const keep = await page.evaluate(() => { const row = document.querySelector('.pp-slide-import-keep'); const box = row && row.querySelector('input'); return row && !row.hidden ? { text: row.textContent, checked: box.checked, disabled: box.disabled, title: row.title } : null; });
  const keepRatio = await contrastOf(page, '.pp-slide-import-keep span');
  check(tag + 'la case « ' + T.keep + ' » est sous le choix de la source, décochée, avec son info-bulle, lisible (>= 4,5:1)',
    !!keep && keep.text === T.keep && !keep.checked && !keep.disabled && keep.title === await t18(page, 'slides.import.keepLinkedTip') && keepRatio >= 4.5, { keep, keepRatio });
  await a.click('.pp-slide-import-keep input', 0, 300);
  const hint = await page.evaluate(() => document.querySelector('.pp-slide-import-hint').textContent);
  check(tag + 'cochée, l’indication dit l’import lié après la diapositive du curseur', hint === T.hint(2), hint);

  // --- L'import lié : la miniature 2 de « Source », après la diapositive 2.
  await watchStatus(page);
  const sourceBefore = (await stored(page, 7)).html;
  await a.click('.pp-slide-import .pp-slide-thumb', 1, 300);
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === 4, null, { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  let s = await state(page);
  let seen = await statusSeen(page);
  const link = s.tags[2];
  const sourceAfter = await stored(page, 7);
  const front = s.images.find(image => image.slide === 2);
  check(tag + 'un clic sur la miniature 2 la copie après la diapositive 2, avec son repère : la source, sa diapositive, « Dans les deux sens » et la base',
    JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', 'Deux titreDeux texte', 'Cible trois']) && !!link && link.linkModel === 7 && /^[A-Za-z0-9]{8,}$/.test(link.linkKey || '')
      && /^[a-z0-9]{8,24}$/.test(link.linkSlide || '') && link.linkMode === 'both' && /^[a-z0-9]+\.[a-z0-9]+$/.test(link.linkBase || '') && s.tags.filter(Boolean).length === 1, { texts: s.texts, tags: s.tags });
  // Son texte tel que l'éditeur l'écrit (il range autrement les attributs d'une image), sans le repère : le même que celui de départ, relu par l'éditeur.
  const sameText = await page.evaluate(([was, now]) => {
    const read = html => { const body = HtmlSanitize.parseInert(html); body.querySelectorAll('div.pp-slide-link').forEach(el => el.remove()); return { text: body.textContent, images: Array.from(body.querySelectorAll('img')).map(img => [img.getAttribute('src'), img.dataset.layer, img.dataset.pageIndex, img.dataset.pageLeftPt, img.dataset.pageTopPt].join('|')) }; };
    return JSON.stringify(read(was)) === JSON.stringify(read(now));
  }, [sourceBefore, sourceAfter.html]);
  check(tag + 'la ligne de « Source » reçoit tout de suite le numéro de sa diapositive 2, à la fin de celle-ci ; son texte et sa forme ne changent pas',
    !!link && sourceAfter.html.split('data-slide-id="' + link.linkSlide + '"').length === 2 && !sourceBefore.includes('data-slide-id') && sameText
      && sourceAfter.html.indexOf(link.linkSlide) < sourceAfter.html.indexOf('Source trois') && sourceAfter.html.indexOf(link.linkSlide) > sourceAfter.html.indexOf('Deux texte'),
    { anchored: !!link && sourceAfter.html.includes(link.linkSlide), sameText });
  check(tag + 'sa forme se pose sur sa nouvelle page (la 3) ; le coin d’état dit « ' + T.done(2, 'Source') + ' »', !!front && front.pageIndex === 2 && said(seen, T.done(2, 'Source')), { front, seen });
  check(tag + 'sa miniature porte la pastille du lien (« ' + T.both('Source') + ' »), que son nom dit aussi ; les autres n’en ont pas',
    !!s.badges[2] && s.badges[2].title === T.both('Source') && s.badges[2].icon && !s.badges[2].differs && s.badges.filter(Boolean).length === 1 && s.labels[2] === T.item(3, 4) + ' · ' + T.both('Source'),
    { badges: s.badges, labels: s.labels });
  const linkedHtml = s.html;
  await a.click('.pp-slide-import-close', 0, 400);
  await a.clickText('Cible un');
  await a.press('Control+z');
  await sleep(500);
  s = await state(page);
  check(tag + 'un seul Ctrl+Z défait l’import lié en entier (diapositive et repère)', JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', 'Cible trois']) && s.tags.every(x => !x), s.texts);
  await a.press('Control+y');
  await sleep(500);
  s = await state(page);
  check(tag + 'Ctrl+Y le refait, avec son lien', s.html === linkedHtml && !!s.tags[2] && s.tags[2].linkSlide === link.linkSlide, { texts: s.texts, tag: s.tags[2] });

  // --- Ce qui change ici part à la source avec l'enregistrement.
  await a.clickText('Deux texte');
  await watchStatus(page);
  await page.evaluate(() => {
    window.__batches = [];
    const api = grist.docApi;
    const real = api.applyUserActions.bind(api);
    api.applyUserActions = (actions, ...rest) => { window.__batches.push(actions.map(x => [x[0], x[1], x[2]])); return real(actions, ...rest); };
  });
  await a.type(' ici');
  await save();
  const together = await page.evaluate(() => window.__batches.some(batch => [7, 8].every(id => batch.some(x => x[1] === 'Publipostage_Modeles' && [].concat(x[2]).includes(id)))));
  s = await state(page);
  seen = await statusSeen(page);
  let source = await stored(page, 7);
  let cible = await stored(page, 8);
  check(tag + 'du texte tapé dans la diapositive liée, puis l’enregistrement : la ligne de « Source » le reçoit, dans le même lot d’écriture que « Cible », et le coin d’état le dit ; rien ne reste à envoyer',
    source.html.includes('<p>Deux texte ici</p>') && source.html.includes('<p>Source un</p>') && source.html.includes('<p>Source trois</p>') && cible.html.includes('data-link-slide="' + link.linkSlide + '"')
      && together && !s.pending && said(seen, await t18(page, 'slides.link.pushed', { name: 'Source' })), { together, pending: s.pending, seen, source: source.html.includes('Deux texte ici') });

  // --- Ce qui change dans la source arrive ici, à la lecture suivante.
  check(tag + '(préparation) « Source » réécrite ailleurs', await rewrite(page, 7, 'Deux titre', 'Titre changé'), null);
  await watchStatus(page);
  await a.clickText('Cible un');
  await a.type(' x');
  await page.waitForFunction(() => SlideStrip.slidesOf(EditorCore.getEditor().state.doc)[2].nodes.some(e => e.node.textContent === 'Titre changé'), null, { timeout: 12000 }).catch(() => {});
  await sleep(500);
  s = await state(page);
  seen = await statusSeen(page);
  check(tag + 'la lecture suivante de l’enregistrement automatique remplace la diapositive liée par celle de « Source » ; le coin d’état le dit',
    s.texts[2] === 'Titre changéDeux texte ici' && said(seen, await t18(page, 'slides.link.pulled', { n: 3, name: 'Source' })) && !!s.tags[2] && s.tags[2].linkSlide === link.linkSlide, { texts: s.texts, seen });
  await a.press('Control+z');
  await sleep(400);
  s = await state(page);
  check(tag + 'Ctrl+Z ne rend pas l’ancienne diapositive : il défait ce que la personne a tapé', s.texts[0] === 'Cible un' && s.texts[2] === 'Titre changéDeux texte ici', s.texts);
  await save();

  // --- Changée des deux côtés : « Demander ».
  await rewrite(page, 7, 'Deux texte ici', 'Deux texte là-bas');
  await a.clickText('Titre changé');
  await a.type(' encore');
  await page.waitForFunction(() => { const m = document.getElementById('pp-slide-link-ask'); return !!m && m.style.display !== 'none'; }, null, { timeout: 12000 }).catch(() => {});
  await sleep(600);
  s = await state(page);
  const message = await t18(page, 'slides.link.ask.message', { n: 3, name: 'Source' });
  check(tag + 'changée ici et dans « Source » : la fenêtre « ' + T.title + ' » montre les deux versions, chacune sous son nom, entière dans le panneau',
    !!s.ask && s.ask.title === T.title && s.ask.message === message && JSON.stringify(s.ask.captions) === JSON.stringify([T.here, T.there('Source')])
      && JSON.stringify(s.ask.thumbs) === JSON.stringify(['Titre changé encoreDeux texte ici', 'Titre changéDeux texte là-bas']) && JSON.stringify(s.ask.thumbImages) === JSON.stringify([1, 1])
      && JSON.stringify(s.ask.buttons) === JSON.stringify(T.buttons) && inPanel(s.ask.rect), s.ask);
  const captionRatio = await contrastOf(page, '#pp-slide-link-ask figcaption');
  const messageRatio = await contrastOf(page, '#pp-slide-link-ask .pp-slide-link-ask-message');
  check(tag + 'son message et ses légendes se lisent (>= 4,5:1) ; le clavier arrive sur son cadre ; la pastille de la diapositive dit les deux versions',
    captionRatio >= 4.5 && messageRatio >= 4.5 && s.ask.focusOnBox && !!s.badges[2] && s.badges[2].differs && s.badges[2].title === await t18(page, 'slides.strip.linkDiffers', { name: 'Source' }),
    { captionRatio, messageRatio, focus: s.ask.focusOnBox, badge: s.badges[2] });
  const before = s.html;
  await page.keyboard.type('ab');
  await a.press('Enter');
  s = await state(page);
  check(tag + 'une frappe qui continue ne choisit rien : la fenêtre reste, le texte ne change pas', !!s.ask && s.html === before, { ask: !!s.ask });
  await watchStatus(page);
  await a.click('#pp-slide-link-ask .var-modal-primary', 0, 500);
  s = await state(page);
  seen = await statusSeen(page);
  check(tag + '« ' + T.buttons[2] + ' » prend celle de « Source » ; la fenêtre se ferme, la pastille ne dit plus de désaccord',
    !s.ask && s.texts[2] === 'Titre changéDeux texte là-bas' && said(seen, await t18(page, 'slides.link.taken', { n: 3 })) && !!s.badges[2] && !s.badges[2].differs, { texts: s.texts, seen, badge: s.badges[2] });
  await a.press('Control+z');
  await sleep(400);
  s = await state(page);
  check(tag + 'un Ctrl+Z rend celle d’ici, et le désaccord revient', s.texts[2] === 'Titre changé encoreDeux texte ici' && !!s.badges[2] && s.badges[2].differs, { texts: s.texts, badge: s.badges[2] });

  // --- Le menu ⋯ : les lignes du lien ; « Comparer les deux versions » rouvre la fenêtre, « Garder celle d'ici » l'envoie avec l'enregistrement.
  await a.openMenu(2);
  let menu = await menuState(page);
  const noteRatio = await contrastOf(page, '.pp-slide-menu.visible .pp-slide-menu-note');
  check(tag + 'le menu ⋯ de la diapositive liée : la note « ' + T.note('Source') + ' », les trois sens (« ' + T.links[0] + ' » coché), « ' + T.links[3] + ' », « ' + T.links[4] + ' », lisibles, entier dans le panneau',
    !!menu && menu.note === T.note('Source') && menu.groupLabel === T.note('Source') && JSON.stringify(menu.rows.slice(-5)) === JSON.stringify(T.links) && JSON.stringify(menu.checked) === JSON.stringify([T.links[0]])
      && menu.disabled.length === 0 && noteRatio >= 4.5 && inPanel(menu.rect), { menu, noteRatio });
  await a.menuRow(T.links[3]);
  s = await state(page);
  check(tag + '« ' + T.links[3] + ' » rouvre la fenêtre', !!s.ask && JSON.stringify(s.ask.thumbs) === JSON.stringify(['Titre changé encoreDeux texte ici', 'Titre changéDeux texte là-bas']), s.ask);
  await a.click('#pp-slide-link-ask .pp-slide-link-ask-keep', 0, 500);
  s = await state(page);
  check(tag + '« ' + T.buttons[0] + ' » la garde : elle reste à envoyer', !s.ask && s.texts[2] === 'Titre changé encoreDeux texte ici' && s.pending && !s.badges[2].differs, { texts: s.texts, pending: s.pending });
  await save();
  source = await stored(page, 7);
  check(tag + 'Ctrl+S l’envoie à « Source »', source.html.includes('Titre changé encore') && source.html.includes('<p>Deux texte ici</p>') && !source.html.includes('là-bas'), source.html.length);

  // --- « Suit la source » : la diapositive refuse la frappe ; le reste s'écrit.
  await a.openMenu(2);
  await watchStatus(page);
  await a.menuRow(T.links[1]);
  s = await state(page);
  seen = await statusSeen(page);
  check(tag + '« ' + T.links[1] + ' » : le repère prend ce sens, la pastille et le coin d’état le disent',
    s.tags[2].linkMode === 'pull' && s.badges[2].title === await t18(page, 'slides.strip.linkPull', { name: 'Source' }) && said(seen, await t18(page, 'slides.link.mode', { n: 3, mode: T.links[1] })), { tag: s.tags[2], badge: s.badges[2], seen });
  const pulled = s.texts[2];
  await a.clickText('Deux texte ici');
  await watchStatus(page);
  await a.type('zz');
  s = await state(page);
  seen = await statusSeen(page);
  check(tag + 'la frappe dans la diapositive qui suit sa source est refusée ; le coin d’état dit pourquoi, en rouge', s.texts[2] === pulled && saidError(seen, await t18(page, 'slides.link.lockedPull', { name: 'Source' })), { texts: s.texts, seen });
  await a.clickText('Cible un');
  await a.type('y');
  s = await state(page);
  check(tag + 'le reste de la présentation s’écrit', s.texts[0] === 'Cible uny', s.texts[0]);
  await a.press('Backspace');

  // --- « Envoie à la source », puis Ctrl+S : la diapositive de « Source » est verrouillée.
  await a.openMenu(2);
  await a.menuRow(T.links[2]);
  await save();
  source = await stored(page, 7);
  check(tag + '« ' + T.links[2] + ' », puis Ctrl+S : la diapositive de « Source » porte le verrou de « Cible »', (await state(page)).tags[2].linkMode === 'push' && source.html.includes('data-slide-lock="8"'), source.html.includes('data-slide-lock'));
  await open(7, 3);
  s = await state(page);
  check(tag + '« Source » ouverte : la pastille de sa diapositive 2 est un cadenas qui le dit',
    !!s.badges[1] && s.badges[1].title === await t18(page, 'slides.strip.linkLocked', { name: 'Cible' }) && s.badges.filter(Boolean).length === 1, s.badges);
  await a.clickText('Deux texte ici');
  await watchStatus(page);
  await a.type('qq');
  s = await state(page);
  seen = await statusSeen(page);
  check(tag + 'elle refuse la frappe, et le coin d’état dit qui l’envoie', s.texts[1] === 'Titre changé encoreDeux texte ici' && saidError(seen, await t18(page, 'slides.link.lockedHere', { name: 'Cible' })), { texts: s.texts, seen });
  await a.openMenu(1);
  menu = await menuState(page);
  check(tag + 'son menu ⋯ dit « ' + T.lockNote('Cible') + ' » et ne propose que « ' + T.links[4] + ' »', !!menu && menu.note === T.lockNote('Cible') && menu.rows[menu.rows.length - 1] === T.links[4]
    && !menu.rows.some(row => T.links.slice(0, 4).includes(row)), menu);
  await a.press('Escape');
  await open(8, 4);

  // --- Les garde-fous : dupliquer garde la copie sans lien ; un collage ne lie rien.
  await a.openMenu(2);
  await a.menuRow(await t18(page, 'slides.menu.duplicate'));
  await sleep(400);
  s = await state(page);
  check(tag + 'une diapositive liée dupliquée : la copie n’a pas de lien, l’originale le garde', s.texts.length === 5 && s.texts[3] === s.texts[2] && s.tags.filter(x => x && x.linkSlide).length === 1 && !!s.tags[2] && s.tags[2].linkSlide === link.linkSlide,
    { texts: s.texts, tags: s.tags });
  await a.clickText('Cible un');
  await a.press('Control+z');
  await sleep(300);
  await page.evaluate(() => { const ed = EditorCore.getEditor(); const slide = SlideStrip.slidesOf(ed.state.doc)[2]; ed.view.pasteHTML(Editor.getHTML(ed.state.doc.cut(slide.start, slide.end))); });
  await sleep(400);
  s = await state(page);
  check(tag + 'le HTML de la diapositive liée collé (repère compris) ne lie rien', s.tags.filter(x => x && x.linkSlide).length === 1 && s.texts.some((text, i) => i !== 2 && text.includes('Titre changé encore')),
    { texts: s.texts, tags: s.tags.filter(Boolean).length });
  await a.press('Control+z');
  await sleep(300);

  // --- Les sorties : la Lecture et le diaporama ne montrent jamais le repère.
  await a.leave();
  await a.click('#btn-mode-read', 0, 300);
  await page.waitForFunction(() => document.querySelectorAll('#reader-container .v2-pagination-overlay').length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(500);
  const reader = await page.evaluate(() => ({ tags: document.querySelectorAll('#reader-container .pp-slide-link, #reader-container [data-link-slide]').length, text: document.getElementById('reader-container').textContent.includes('Titre changé encore') }));
  await a.click('#btn-mode-edit', 0, 600);
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden; }, null, { timeout: 8000 }).catch(() => {});
  const output = await page.evaluate(() => SlidesEntry.outputHtml('presentation', Editor.getHTML()));
  check(tag + 'la Lecture montre la diapositive liée sans son repère, et le HTML des sorties n’en a pas', reader.text && reader.tags === 0 && !output.includes('pp-slide-link') && output.includes('Titre changé encore'), reader);
  await a.click('.pp-slide-show-open', 0, 300);
  await page.waitForFunction(() => !!document.getElementById('pp-slide-show-stage'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const show = await page.evaluate(() => { const stage = document.getElementById('pp-slide-show-stage'); return stage ? { tags: stage.querySelectorAll('.pp-slide-link, [data-link-slide]').length } : null; });
  await a.press('Escape');
  await sleep(600);
  check(tag + 'le diaporama non plus', !!show && show.tags === 0, show);

  // --- « Détacher » : la pastille et le lien partent ; enregistré, le verrou de « Source » tombe.
  await a.openMenu(2);
  await watchStatus(page);
  await a.menuRow(T.links[4]);
  s = await state(page);
  seen = await statusSeen(page);
  check(tag + '« ' + T.links[4] + ' » : le lien part, la diapositive garde ce qu’elle montre, la pastille s’en va ; le coin d’état le dit',
    s.tags.every(x => !x || !x.linkSlide) && s.texts[2] === 'Titre changé encoreDeux texte ici' && s.badges.every(b => !b) && said(seen, await t18(page, 'slides.link.detached', { n: 3 })), { tags: s.tags, badges: s.badges, seen });
  await save();
  await open(7, 3);
  await a.clickText('Deux texte ici');
  await a.type(' libre');
  s = await state(page);
  check(tag + 'enregistré, « Source » s’écrit de nouveau : le verrou de « Cible » est tombé', s.texts[1] === 'Titre changé encoreDeux texte ici libre' && s.badges.every(b => !b), { texts: s.texts, badges: s.badges });

  check(tag + 'aucune boîte native du navigateur', natives.length === 0, natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
