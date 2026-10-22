#!/usr/bin/env node
// Les diapositives d'une page de document, liées à elle (js/page-copies.js ; la case « Garder liée » du volet « Importer » d'une présentation quand la source est un document, extensions/diapositives/slide-import.js ;
// la pastille et le menu ⋯ de leur miniature, slide-strip.js ; demande du 22/10, lot 3 : « importer […] des pages de document dans des slides » ; cartes « Sens unique : la copie suit la source » et « Celle
// d'arrivée, avec une case »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS, l'extension
// « diapositives » active, une présentation « Cible » à l'écran avec sa bande, et un DOCUMENT « Rapport » de trois pages.
//  LE VOLET : avec « Rapport » pour source, « Garder liée » reparaît au-dessus de « Garder la mise en forme d'origine », décochée et active ; l'indication dit ce qu'un clic fait, liée ou non.
//  POSER : un clic sur la page 1, « Garder liée » cochée, pose ses diapositives après celle du curseur, chacune avec son repère et son lien (le document, la page, le rang, l'empreinte) ; la source reçoit le
//   repère de sa page, un élément de plus dans son HTML et rien d'autre ; un seul Ctrl+Z défait tout ; la même page une seconde fois arrive en copie simple ; leur miniature porte une pastille.
//  LE VERROU : taper, supprimer, coller dans une diapositive du groupe est refusé (le coin d'état dit pourquoi, une fois) ; ses propriétés se règlent, la supprimer reste possible, la dupliquer donne une copie sans lien.
//  LA SYNCHRO : « Rapport » changé ailleurs, les diapositives prennent la nouvelle page à la lecture suivante de l'enregistrement automatique (le curseur reste où il est, la présentation n'est pas « à
//   enregistrer », un Ctrl+Z ne la rend pas) ; leurs propriétés restent ; une page plus longue, plus courte ou vide change le nombre de diapositives, sans doublon ni reste.
//  DÉTACHER : « Détacher » dans le menu ⋯ libère toutes les diapositives de la page (texte gardé, écriture libre, plus de pastille), un Ctrl+Z rend le lien ; la page ou le document perdu : les diapositives
//   restent, la pastille le dit.
//  LE DOCUMENT SOURCE : le repère de sa page ne gêne pas l'écriture (Retour arrière et Suppr contre lui joignent les pages comme sans lui), le document ne finit pas sur un repère, la pagination est celle
//   d'avant, et la Lecture n'en a aucun.
// Trois parcours, chacun sur une page neuve : A (le volet, la pose, le verrou), B (la synchro, les groupes de plusieurs diapositives, « Détacher », la page ou le document perdu, la réouverture), C (le document
// source et les sorties).
// Lancé par run-headless.mjs (groupe Node "pageCopies", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-copies.mjs (PAGE_COPIES_ONLY=fr ou en : une seule langue ; PAGE_COPIES_PART=a, b ou c : un seul parcours)
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-page-copies', port: Number(process.env.PAGE_COPIES_PORT || 8981) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const ONLY = process.env.PAGE_COPIES_ONLY || '';
const PART = process.env.PAGE_COPIES_PART || '';

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const size = (pt, text) => `<span style="font-size: ${pt}pt">${text}</span>`;
const PAGE_ONE = `<h1>${size(18, 'Rapport annuel')}</h1><p>${size(11, 'Bonjour <strong>à tous</strong>')}</p><ul><li><p>${size(11, 'Premier point')}</p></li><li><p>${size(11, 'Second point')}</p></li></ul>`;
const PAGE_TWO = `<h2>Détails</h2><p>${size(11, 'Un texte de la page deux')}</p><table><tbody><tr><td><p>Case A</p></td><td><p>Case B</p></td></tr></tbody></table>`;
const PAGE_THREE = `<p>${size(11, 'Fin du rapport')}</p>`;
const RAPPORT = `${PAGE_ONE}${BR}${PAGE_TWO}${BR}${PAGE_THREE}`;
const LONG_PARAGRAPHS = 40;
// 7 « Cible » : une présentation de trois diapositives ; 8 « Rapport » : un document de trois pages ; 9 « Long » : un document d'une seule page (sans saut) de 40 paragraphes à 11 pt, bien plus haut
// qu'une diapositive ; 10 « Vide » : un document dont la seule page est un paragraphe ; 11 « Rapport témoin » et 12 « Long témoin » : le même texte que « Rapport » et que « Long », qui ne reçoivent jamais de repère. Les modèles de départ (seedModels) : trois documents, un e-mail, un macro-modèle et une présentation, « Futur ».
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Cible', '<p>Cible un</p>${BR}<p>Cible deux</p>${BR}<p>Cible trois</p>', false, 'presentation');
  add(8, 'Rapport', '${RAPPORT}', false, 'document');
  add(9, 'Long', Array.from({ length: ${LONG_PARAGRAPHS} }, (_, i) => '<p><span style="font-size: 11pt">Paragraphe ' + (i + 1) + ' : un texte assez long pour tenir sur une ligne, et parfois deux quand la page est étroite.</span></p>').join(''), false, 'document');
  add(10, 'Vide', '<p>Un seul paragraphe</p>', false, 'document');
  add(11, 'Rapport témoin', '${RAPPORT}', false, 'document');
  add(12, 'Long témoin', Array.from({ length: ${LONG_PARAGRAPHS} }, (_, i) => '<p><span style="font-size: 11pt">Paragraphe ' + (i + 1) + ' : un texte assez long pour tenir sur une ligne, et parfois deux quand la page est étroite.</span></p>').join(''), false, 'document');
  stub.state.nextRowId.Publipostage_Modeles = 13;
`;
const TEXTS = {
  fr: {
    link: 'Garder liée', format: 'Garder la mise en forme d’origine',
    linkTip: 'Les diapositives restent liées à la page : elles la suivent quand elle change et ne s’écrivent plus ici, jusqu’à « Détacher ».',
    hint: n => `Un clic sur une page l’importe en diapositives après la diapositive ${n}.`,
    hintLinked: n => `Un clic sur une page l’importe en diapositives après la diapositive ${n}, liées à la page.`,
    hintLinkedKeep: n => `Un clic sur une page l’importe en diapositives après la diapositive ${n}, liées, avec la mise en forme du document.`,
    done: (n, name, k) => `Page ${n} de « ${name} » importée en ${k} ${k > 1 ? 'diapositives' : 'diapositive'}, ${k > 1 ? 'liées' : 'liée'} à sa source.`,
    already: (n, name) => `La page ${n} de « ${name} » est déjà liée ici : elle arrive en copie.`,
    pulled: name => `Les diapositives liées à « ${name} » ont pris la dernière version de leur page.`,
    locked: name => `Cette diapositive suit une page de « ${name} » : elle ne s’écrit pas ici. Détachez-la pour la modifier.`,
    badge: (n, name) => `Suit la page ${n} de « ${name} »`, badgeGone: 'Liée à une page qui n’existe plus', noteGone: 'Sa page n’existe plus',
    note: (n, name) => `Suit la page ${n} de « ${name} »`,
    detach: 'Détacher', detached: (k, name) => `Page détachée : ${k} ${k > 1 ? 'diapositives ne suivent' : 'diapositive ne suit'} plus « ${name} ».`,
    modes: ['Dans les deux sens', 'Suit la source', 'Envoie à la source', 'Comparer les deux versions'],
    duplicate: 'Dupliquer', moveDown: 'Descendre', remove: 'Supprimer',
  },
  en: {
    link: 'Keep linked', format: 'Keep the original formatting',
    linkTip: 'The slides stay linked to the page: they follow it when it changes and can’t be edited here until you detach them.',
    hint: n => `Click a page to import it as slides after slide ${n}.`,
    hintLinked: n => `Click a page to import it as slides after slide ${n}, linked to the page.`,
    hintLinkedKeep: n => `Click a page to import it as slides after slide ${n}, linked, with the document’s formatting.`,
    done: (n, name, k) => `Page ${n} of “${name}” imported as ${k} ${k > 1 ? 'slides' : 'slide'}, linked to its source.`,
    already: (n, name) => `Page ${n} of “${name}” is already linked here: it arrives as a copy.`,
    pulled: name => `The slides linked to “${name}” took the latest version of their page.`,
    locked: name => `This slide follows a page of “${name}”: it can’t be edited here. Detach it to edit it.`,
    badge: (n, name) => `Follows page ${n} of “${name}”`, badgeGone: 'Linked to a page that no longer exists', noteGone: 'Its page no longer exists',
    note: (n, name) => `Follows page ${n} of “${name}”`,
    detach: 'Detach', detached: (k, name) => `Page detached: ${k} ${k > 1 ? 'slides no longer follow' : 'slide no longer follows'} “${name}”.`,
    modes: ['Both ways', 'Follows the source', 'Sends to the source', 'Compare both versions'],
    duplicate: 'Duplicate', moveDown: 'Move down', remove: 'Delete',
  },
};

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
  const hover = async (selector, index = 0) => {
    const c = await inPage(await centerOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
  };
  // Une miniature du volet amenée dans la partie visible de sa liste par la molette de la souris, posée sur la liste.
  const showThumb = async (index) => {
    for (let i = 0; i < 12; i++) {
      const at = await app.evaluate((k) => {
        const list = document.querySelector('.pp-slide-import-list');
        const thumb = document.querySelectorAll('.pp-slide-import .pp-slide-thumb')[k];
        if (!list || !thumb) return null;
        const l = list.getBoundingClientRect();
        const r = thumb.getBoundingClientRect();
        const want = Math.min(r.height, 80);
        const room = l.bottom - r.top;
        return { list: { x: l.left + l.width / 2, y: l.top + l.height / 2 }, dy: r.top < l.top ? r.top - l.top - 4 : room < want ? want - room + 4 : 0 };
      }, index);
      if (!at || !at.dy) return;
      const c = await inPage(at.list);
      await reach(c);
      await page.mouse.wheel(0, at.dy);
      await sleep(250);
    }
  };
  // Un clic au milieu de ce que la liste montre de la miniature.
  const clickThumb = async (index, settle = 250) => {
    await showThumb(index);
    const c = await inPage(await app.evaluate((k) => {
      const list = document.querySelector('.pp-slide-import-list');
      const thumb = document.querySelectorAll('.pp-slide-import .pp-slide-thumb')[k];
      const l = list.getBoundingClientRect();
      const r = thumb.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: (Math.max(r.top, l.top) + Math.min(r.bottom, l.bottom)) / 2 };
    }, index));
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(settle);
  };
  // Le texte `text` d'un bloc de l'éditeur (le plus profond qui le dit en entier : un item de liste, une case de tableau), amené à l'écran : un clic au bord de son texte, puis Fin ou Début (le curseur au bout
  // du texte, ou à son début avec `where` = 'start').
  const clickText = async (text, where = 'end') => {
    const c = await inPage(await app.evaluate(([whole, edge]) => {
      const matches = Array.from(document.querySelectorAll('#editor-container .tiptap *')).filter(el => el.textContent === whole && !el.classList.contains('pp-slide-link'));
      const block = matches.find(el => !matches.some(other => other !== el && el.contains(other)));
      if (!block) return null;
      block.scrollIntoView({ block: 'center' });
      const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, edge === 'start' ? 1 : node.textContent.length);
      const r = range.getBoundingClientRect();
      return { x: edge === 'start' ? r.left + 1 : r.right - 1, y: r.top + r.height / 2 };
    }, [text, where]));
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    await page.keyboard.press(where === 'start' ? 'Home' : 'End');
    await sleep(120);
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  // Le choix d'une source dans la liste avec recherche du volet : un clic, le début du nom, Entrée.
  const pickSource = async (query) => {
    await click('.pp-slide-import .ss-trigger', 0, 400);
    await page.keyboard.type(query);
    await sleep(250);
    await press('Enter');
    await sleep(600);
  };
  // Le menu ⋯ de la miniature `index` de la bande : survol de la miniature, clic sur son « ⋯ » ; puis une de ses lignes, par son texte.
  const openMenu = async (index) => { await hover('.pp-slide-strip .pp-slide-thumb', index); await click('.pp-slide-strip .pp-slide-more', index, 300); };
  const menuRow = async (label) => {
    const at = await app.evaluate(text => Array.from(document.querySelectorAll('.pp-slide-menu.visible [data-action]')).findIndex(b => b.textContent === text && b.getBoundingClientRect().width > 0), label);
    if (at < 0) throw new Error('ligne introuvable : ' + label);
    await click('.pp-slide-menu.visible [data-action]', at, 500);
  };
  const leave = async () => { await page.mouse.move(670, 380); await sleep(200); };
  // Le menu ⋯ ouvert à la souris se ferme d'un clic ailleurs : sur la première miniature de la bande (qui y pose le curseur).
  const closeMenu = async () => { await click('.pp-slide-strip .pp-slide-thumb', 0, 300); await leave(); };
  return { click, hover, clickThumb, showThumb, clickText, press, pickSource, openMenu, menuRow, closeMenu, leave, reach, inPage, centerOf };
}

// La présentation ouverte : ses diapositives (blocs, repère et lien, propriétés), le curseur, la bande (pastilles), le volet (cases, indication), le coin d'état.
const state = app => app.evaluate(() => {
  const editor = EditorCore.getEditor();
  const doc = editor.state.doc;
  const kit = SlideLinks.kit();
  const slides = kit.slidesOf(doc).map(slide => ({
    blocks: slide.nodes.filter(({ node }) => node.type.name !== 'slideProps').map(({ node }) => node.type.name + ':' + node.textContent),
    props: slide.nodes.some(({ node }) => node.type.name === 'slideProps'),
    notes: (slide.nodes.find(({ node }) => node.type.name === 'slideProps') || { node: { attrs: {} } }).node.attrs.notes || '',
    tags: slide.tags.length,
    link: slide.tag ? slide.tag.node.attrs.linkPage : null,
    slideId: slide.tag ? slide.tag.node.attrs.slideId : null,
  }));
  const pm = kit.slidesOf(doc);
  const at = pm.findIndex(s => editor.state.selection.from <= s.end);
  const stripItems = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
  const importItems = Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-item'));
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const box = (id) => { const input = document.getElementById(id); const row = input && input.closest('label'); return row && !row.hidden ? { text: row.textContent.trim(), checked: input.checked, disabled: input.disabled, title: row.title || '', rect: rect(row) } : null; };
  const panel = document.querySelector('.pp-slide-import');
  const hint = document.querySelector('.pp-slide-import-hint');
  const active = document.activeElement;
  const head = editor.state.selection.$head;
  return {
    html: editor.getHTML(),
    caret: { block: head.parent.textContent, atEnd: head.parentOffset === head.parent.content.size },
    slides, count: stripItems.length, cursor: at < 0 ? pm.length - 1 : at,
    badges: stripItems.map((item) => { const badge = item.querySelector('.pp-slide-link-badge'); return badge && !badge.hidden ? badge.title : ''; }),
    dots: stripItems.filter(item => { const dot = item.querySelector('.pp-slide-overflow'); return dot && !dot.hidden; }).length,
    status: document.getElementById('status-msg').textContent,
    dirty: Templates.isDirty ? Templates.isDirty() : null,
    focus: active && active.closest('.ProseMirror') ? 'editor' : (active && active.closest('.pp-slide-import .pp-slide-item') ? 'thumb' : (active ? active.id || active.className || active.tagName : null)),
    open: !!panel && !panel.hidden,
    field: panel && panel.querySelector('.ss-trigger') ? panel.querySelector('.ss-trigger').textContent.trim() : null,
    hint: hint && !hint.hidden ? hint.textContent : '',
    link: box('pp-slide-import-keep'), format: box('pp-slide-import-format'),
    rows: importItems.map(item => item.getAttribute('aria-label')),
  };
});
// La ligne `id` du faux Grist : son texte, et le nombre d'écritures de la table.
const stored = (app, id) => app.evaluate(n => ({ html: (window.__gristStub.getRow('Publipostage_Modeles', n) || {}).Contenu || '', saves: window.__gristStub.countSaves('Publipostage_Modeles') }), id);
// Les éléments de premier niveau d'un HTML de modèle, sans les repères (div.pp-slide-link), et ces repères.
const topOf = (app, html) => app.evaluate((h) => {
  const body = HtmlSanitize.parseInert(h);
  const all = Array.from(body.children);
  const marker = el => el.classList.contains('pp-slide-link');
  return { rest: all.filter(el => !marker(el)).map(el => el.outerHTML), markers: all.filter(marker).map(el => ({ id: el.getAttribute('data-slide-id'), at: all.indexOf(el), before: all[all.indexOf(el) - 1] ? all[all.indexOf(el) - 1].className || all[all.indexOf(el) - 1].tagName : null, after: all[all.indexOf(el) + 1] ? all[all.indexOf(el) + 1].className || all[all.indexOf(el) + 1].tagName : null })), count: all.length };
}, html);
// La ligne `id` réécrite ailleurs (une autre personne, un autre onglet) : `from` remplacé par `to` dans son texte, sa date changée. Vrai si `from` y était.
const rewrite = (app, id, from, to) => app.evaluate(([n, a, b]) => {
  const stub = window.__gristStub;
  const html = stub.getRow('Publipostage_Modeles', n).Contenu;
  stub.remoteWrite('Publipostage_Modeles', n, { Contenu: html.split(a).join(b), DateModif: new Date().toISOString() });
  return html.includes(a);
}, [id, from, to]);
// La ligne `id` remplacée par `html` ailleurs.
const replaceRow = (app, id, html) => app.evaluate(([n, h]) => { window.__gristStub.remoteWrite('Publipostage_Modeles', n, { Contenu: h, DateModif: new Date().toISOString() }); }, [id, html]);
// Attend que le texte de la présentation contienne `text` (ou ne le contienne plus) : la synchro arrive à la lecture suivante de l'enregistrement automatique.
const waitDoc = (app, text, present = true, timeout = 25000) => app.waitForFunction(([needle, want]) => EditorCore.getEditor().state.doc.textContent.includes(needle) === want, [text, present], { timeout }).then(() => true, () => false);
// Ce que le coin d'état a dit depuis `watchStatus`.
const watchStatus = app => app.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true });
});
const statusSeen = app => app.evaluate(() => window.__statusSeen.slice());
// L'appel `ouvrir` de GFS, puis le modèle `id` à l'écran (et, pour une présentation, sa bande avec ses `slides` miniatures).
const open = async (tab, id, slides = 0, flush = true) => {
  if (flush) await saved(tab);
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, count]) => {
    if (String(Templates.getCurrentId()) !== String(n)) return false;
    if (!count) return true;
    const strip = document.querySelector('.pp-slide-strip');
    return !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === count;
  }, [id, slides], { timeout: 15000 }).catch(() => {});
  await sleep(800);
};
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Ctrl+S, et l'attente de l'écriture dans le faux Grist.
const saved = async (tab) => {
  const before = await tab.app.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
  await tab.page.keyboard.press('Control+s');
  await tab.app.waitForFunction(n => window.__gristStub.countSaves('Publipostage_Modeles') > n, before, { timeout: 8000 }).catch(() => {});
  await sleep(300);
};
// Le lien d'un repère, lu : { model, key, page, part, src, keep }.
const parseLink = (value) => { if (!value) return null; const [model, key, page, part, src, keep] = value.split(':'); return { model: Number(model), key, page, part: Number(part), src, keep: keep === '1' }; };
const inWindow = (r, inner = { width: 700, height: 400 }) => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= inner.width + 0.5 && r.bottom <= inner.height + 0.5;

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Une page neuve avec « Cible » à l'écran et sa bande ; rend le contexte des parcours : { A, page, app, a, T, tag }.
async function ready(lang, colorScheme, part) {
  // La langue est celle de GFS (consigne 019), que son contexte donne au cadre.
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const a = toolsOf(A);
  await open(A, 7, 3, false);
  return { A, page: A.page, app: A.app, a, T: TEXTS[lang], tag: `[${lang} ${colorScheme} ${part}] ` };
}
// Le volet « Importer » ouvert sur la source `name` (`query` : le début de son nom dans la liste), « Garder liée » cochée ou non (`link`), la mise en forme d'origine de même (`format`), puis un clic sur la miniature
// de rang `page` ; les diapositives arrivent après celle qui contient le bloc de texte `after`.
async function importPage(ctx, { query, name, page, after, link = true, format = false }) {
  const { a, app } = ctx;
  let s = await state(app);
  if (!s.open) await a.click('.pp-slide-import-open', 0, 800);
  s = await state(app);
  if (s.field !== name) await a.pickSource(query);
  s = await state(app);
  if (s.link && s.link.checked !== link) await a.click('#pp-slide-import-keep', 0, 300);
  s = await state(app);
  if (s.format && s.format.checked !== format) await a.click('#pp-slide-import-format', 0, 300);
  await a.clickText(after);
  await a.clickThumb(page, 2200);
  return state(app);
}
// La ligne `id` du faux Grist changée comme par quelqu'un d'autre, d'après le geste `kind` sur le corps de son HTML (le code ne passe pas par `eval` : la page a sa CSP) ; vrai si le geste a trouvé de quoi faire.
const editRow = (app, id, kind, value) => app.evaluate(([n, op, arg]) => {
  const stub = window.__gristStub;
  const body = new DOMParser().parseFromString(stub.getRow('Publipostage_Modeles', n).Contenu, 'text/html').body;
  const markers = () => Array.from(body.querySelectorAll(':scope > div.pp-slide-link'));
  let done = false;
  if (op === 'beforeMarker') { const m = markers()[0]; if (m) { m.insertAdjacentHTML('beforebegin', arg); done = true; } }
  else if (op === 'dropMarkers') { done = markers().length > 0; markers().forEach(el => el.remove()); }
  else if (op === 'emptyFirstPage') {
    const cut = Array.from(body.children).findIndex(el => el.classList.contains('page-break-marker'));
    Array.from(body.children).slice(0, cut).forEach((el) => { if (!el.classList.contains('pp-slide-link')) { el.remove(); done = true; } });
  }
  else if (op === 'dropParagraphsFrom') { const ps = Array.from(body.querySelectorAll(':scope > p')); done = ps.length > arg; ps.slice(arg).forEach(el => el.remove()); }
  if (done) stub.remoteWrite('Publipostage_Modeles', n, { Contenu: body.innerHTML, DateModif: new Date().toISOString() });
  return done;
}, [id, kind, value]);
// La ligne `id` supprimée du faux Grist (rend ses colonnes, pour la remettre par putRow), puis remise.
const dropRow = (app, id) => app.evaluate((n) => {
  const table = window.__gristStub.state.rows.Publipostage_Modeles;
  const at = table.id.indexOf(n);
  if (at < 0) return null;
  const row = {};
  Object.keys(table).forEach((col) => { if (Array.isArray(table[col])) row[col] = table[col].splice(at, 1)[0]; });
  return row;
}, id);
const putRow = (app, row) => app.evaluate((data) => {
  const table = window.__gristStub.state.rows.Publipostage_Modeles;
  Object.keys(table).forEach((col) => { if (Array.isArray(table[col])) table[col].push(data[col] === undefined ? null : data[col]); });
}, row);
// Attend que la pastille de la miniature `index` de la bande dise `text`.
const waitBadge = (app, index, text, timeout = 25000) => app.waitForFunction(([k, want]) => {
  const item = document.querySelectorAll('.pp-slide-strip .pp-slide-item')[k];
  const badge = item && item.querySelector('.pp-slide-link-badge');
  return !!badge && !badge.hidden && badge.title === want;
}, [index, text], { timeout }).then(() => true, () => false);
// Le texte du document ouvert : ses blocs de premier niveau (type, début du texte, repère ou non), sans repère le HTML « visible », la place de chaque bloc à l'écran, le dernier bloc.
const docState = app => app.evaluate(() => {
  const editor = EditorCore.getEditor();
  const root = document.querySelector('#editor-container .tiptap');
  const rect = root.getBoundingClientRect();
  const top = [];
  editor.state.doc.forEach(node => top.push({ type: node.type.name, text: node.textContent.slice(0, 24), full: node.textContent, marker: node.type.name === 'slideLink' }));
  const body = HtmlSanitize.parseInert(editor.getHTML());
  body.querySelectorAll(':scope > div.pp-slide-link').forEach(el => el.remove());
  const selection = editor.state.selection;
  return {
    top, markers: top.filter(n => n.marker).length, breaks: top.filter(n => n.type === 'pageBreak').length, last: top.length ? top[top.length - 1] : null,
    visible: body.innerHTML, html: editor.getHTML(),
    tops: Array.from(root.children).filter(el => !el.classList.contains('pp-slide-link')).map(el => ({ text: el.textContent.slice(0, 20), top: Math.round((el.getBoundingClientRect().top - rect.top) * 10) / 10 })),
    selNode: selection.node ? selection.node.type.name : null, empty: selection.empty,
  };
});

async function scenarioA(lang, colorScheme) {
  const ctx = await ready(lang, colorScheme, 'A');
  const { A, page, app, a, T, tag } = ctx;
  await a.clickText('Cible deux');
  const original = (await state(app)).html;
  const source0 = await stored(app, 8);
  const source0Top = await topOf(app, source0.html);
  let s = await state(app);
  check(tag + '« Cible » à l’écran : trois diapositives, le curseur sur la 2', s.count === 3 && s.slides.length === 3 && s.cursor === 1, { count: s.count, cursor: s.cursor });

  // --- Le volet : « Garder liée » reparaît pour un document.
  await a.click('.pp-slide-import-open', 0, 800);
  await a.pickSource('rapp');
  s = await state(app);
  check(tag + 'avec « Rapport » pour source, « ' + T.link + ' » reparaît au-dessus de « ' + T.format + ' », décochée et active ; l’info-bulle de la première dit ce que le lien fait',
    !!s.link && !!s.format && s.link.text === T.link && s.format.text === T.format && s.link.rect.top < s.format.rect.top && !s.link.checked && !s.link.disabled && !s.format.checked && s.link.title === T.linkTip, { link: s.link, format: s.format });
  check(tag + 'l’indication dit ce qu’un clic fait, sans lien : « ' + T.hint(2) + ' »', s.hint === T.hint(2), s.hint);
  check(tag + 'le texte des deux cases se lit (contraste ≥ 4,5:1)', (await contrastOf(app, '#pp-slide-import-keep + span')) >= 4.5 && (await contrastOf(app, '#pp-slide-import-format + span')) >= 4.5, { link: await contrastOf(app, '#pp-slide-import-keep + span'), format: await contrastOf(app, '#pp-slide-import-format + span') });
  await a.click('#pp-slide-import-keep', 0, 300);
  s = await state(app);
  check(tag + 'cochée, « ' + T.link + ' » change l’indication : « ' + T.hintLinked(2) + ' »', s.link.checked && s.hint === T.hintLinked(2), { link: s.link, hint: s.hint });
  await a.click('#pp-slide-import-format', 0, 300);
  s = await state(app);
  check(tag + 'avec la mise en forme du document en plus : « ' + T.hintLinkedKeep(2) + ' »', s.format.checked && s.hint === T.hintLinkedKeep(2), s.hint);
  await a.click('#pp-slide-import-format', 0, 300);
  s = await state(app);
  check(tag + 'décochée de nouveau, l’indication revient à « ' + T.hintLinked(2) + ' »', !s.format.checked && s.hint === T.hintLinked(2), s.hint);

  // --- Poser la page 1.
  await a.clickText('Cible deux');
  await watchStatus(app);
  await a.clickThumb(0, 2200);
  s = await state(app);
  let said = await statusSeen(app);
  const added = s.count - 3;
  const mine = s.slides.slice(2, 2 + added);
  const link = parseLink(mine[0].link);
  const row8 = await stored(app, 8);
  const sourceTop = await topOf(app, row8.html);
  check(tag + 'un clic sur la page 1 la pose en diapositive après la 2, avant « Cible trois » : le titre, le texte, la liste',
    added === 1 && s.slides[1].blocks[0] === 'paragraph:Cible deux' && sameList(mine[0].blocks, ['heading:Rapport annuel', 'paragraph:Bonjour à tous', 'bulletList:Premier pointSecond point']) && s.slides[3].blocks[0] === 'paragraph:Cible trois', { added, mine });
  check(tag + 'sa diapositive porte un repère et son lien : « Rapport » (le document 8), le numéro de sa page, le rang 0, l’empreinte de la page, sans mise en forme gardée',
    mine[0].tags === 1 && !!link && link.model === 8 && /^[A-Za-z0-9]{8,}$/.test(link.key) && /^[a-z0-9]{8,24}$/.test(link.page) && link.part === 0 && /^[a-z0-9]{8,12}$/.test(link.src) && link.keep === false, mine[0]);
  check(tag + 'le coin d’état dit « ' + T.done(1, 'Rapport', 1) + ' » ; le curseur est sur la diapositive posée, le clavier reste dans le document, le volet reste ouvert',
    said.includes(T.done(1, 'Rapport', 1)) && s.cursor === 2 && s.focus === 'editor' && s.open, { said, cursor: s.cursor, focus: s.focus, open: s.open });
  check(tag + 'la source a reçu le repère de sa page : un élément de plus dans son HTML, à la fin de la page 1 (avant le saut), le numéro du lien ; rien d’autre n’y a changé',
    sourceTop.markers.length === 1 && sourceTop.markers[0].id === link.page && sourceTop.markers[0].after === 'page-break-marker' && sameList(sourceTop.rest, source0Top.rest) && sourceTop.count === source0Top.count + 1, { source0: source0Top.count, now: sourceTop });
  check(tag + 'sa miniature porte une pastille : « ' + T.badge(1, 'Rapport') + ' »', s.badges[2] === T.badge(1, 'Rapport') && s.badges.filter(Boolean).length === 1, s.badges);
  await a.press('Control+z');
  await sleep(500);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait toute l’importation (la diapositive et son repère) : la présentation est telle qu’avant', s.html === original && s.count === 3 && s.badges.every(b => !b), { count: s.count, same: s.html === original });
  await a.press('Control+y');
  await sleep(500);
  s = await state(app);
  check(tag + 'Ctrl+Y la refait, avec son repère et son lien', s.count === 4 && parseLink(s.slides[2].link) && parseLink(s.slides[2].link).page === link.page, s.slides.map(x => x.link));
  await a.clickText('Cible deux');
  await watchStatus(app);
  await a.clickThumb(0, 2200);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'la même page une seconde fois arrive en copie simple, sans repère de plus (un lien par page et par présentation), et le coin d’état le dit',
    s.count === 5 && s.slides.filter(x => x.link).length === 1 && said.includes(T.already(1, 'Rapport')), { count: s.count, links: s.slides.map(x => x.link), said });
  await a.press('Control+z');
  await sleep(500);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait cette copie simple : la diapositive liée est restée', s.count === 4 && !!s.slides[2].link, { count: s.count });

  // --- La barre de la bande et le menu ⋯.
  await a.openMenu(2);
  const menu = await app.evaluate(() => {
    const panel = document.querySelector('.pp-slide-menu.visible');
    const rows = Array.from(panel.querySelectorAll('[data-action]')).filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent);
    const note = panel.querySelector('.pp-slide-menu-note');
    const r = panel.getBoundingClientRect();
    return { rows, note: note ? note.textContent : null, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } };
  });
  check(tag + 'son menu ⋯ dit « ' + T.note(1, 'Rapport') + ' » et propose « ' + T.detach + ' » sans les sens ni « ' + T.modes[3] + ' »', menu.note === T.note(1, 'Rapport') && menu.rows.includes(T.detach) && !T.modes.some(m => menu.rows.includes(m)), menu);
  check(tag + 'le menu tient dans la fenêtre à 700x400', inWindow(menu.rect), menu.rect);
  await a.closeMenu();

  // --- Le verrou : la frappe, le collage, la suppression sont refusés dans la diapositive du groupe.
  const locked = (await state(app)).html;
  await a.clickText('Rapport annuel');
  await watchStatus(app);
  await page.keyboard.type('x');
  await sleep(300);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'taper dans la diapositive liée est refusé : le texte ne change pas, et le coin d’état dit pourquoi (« ' + T.locked('Rapport') + ' »)', s.html === locked && said.includes(T.locked('Rapport')), { same: s.html === locked, said });
  await page.keyboard.press('Backspace');
  await sleep(200);
  await page.keyboard.press('Enter');
  await sleep(300);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'Retour arrière et Entrée aussi : le texte ne change pas, et le coin d’état ne le redit pas à chaque touche', s.html === locked && said.filter(x => x === T.locked('Rapport')).length === 1, { same: s.html === locked, said });
  await a.clickText('Cible trois');
  await page.keyboard.type('!');
  await sleep(300);
  s = await state(app);
  check(tag + 'témoin : une autre diapositive s’écrit (« Cible trois! »)', s.slides[3].blocks[0] === 'paragraph:Cible trois!', s.slides[3].blocks);
  await page.keyboard.press('Backspace');
  await sleep(300);

  // --- Ses propriétés se règlent : le texte reste verrouillé.
  const notesSet = await app.evaluate(() => SlideProps.applyNotes(EditorCore.getEditor(), [2], 'Mes notes'));
  s = await state(app);
  check(tag + 'les notes de la diapositive se posent malgré le verrou (propriétés de la diapositive, pas son texte)', s.slides[2].props && s.slides[2].notes === 'Mes notes' && !!s.slides[2].link, { notesSet, slide: s.slides[2] });

  // --- Dupliquer : la copie arrive sans lien, l'originale garde le sien.
  await a.openMenu(2);
  await a.menuRow(T.duplicate);
  await sleep(500);
  s = await state(app);
  check(tag + 'dupliquer la diapositive liée : la copie arrive sans lien, l’originale garde le sien (un lien par rang de page)', s.count === 5 && s.slides.filter(x => x.link).length === 1 && !!s.slides[2].link && !s.slides[3].link && s.slides[2].blocks[0] === s.slides[3].blocks[0], s.slides.map(x => [x.link, x.blocks[0]]));
  await a.press('Control+z');
  await sleep(500);
  await a.leave();

  // --- La déplacer et la supprimer restent possibles.
  await a.openMenu(2);
  await a.menuRow(T.moveDown);
  await sleep(400);
  s = await state(app);
  check(tag + 'la déplacer reste possible (« ' + T.moveDown + ' ») : elle garde son lien, à sa nouvelle place', s.count === 4 && !s.slides[2].link && !!s.slides[3].link && s.slides[3].blocks[0] === 'heading:Rapport annuel', s.slides.map(x => [x.link, x.blocks[0]]));
  await a.press('Control+z');
  await sleep(500);
  await a.leave();
  await watchStatus(app);
  await a.openMenu(2);
  await a.menuRow(T.remove);
  await sleep(400);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'la supprimer reste possible (« ' + T.remove + ' ») : il n’en reste aucune liée, et le coin d’état ne refuse rien', s.count === 3 && s.slides.every(x => !x.link) && !said.includes(T.locked('Rapport')), { count: s.count, said });
  await a.press('Control+z');
  await sleep(500);
  s = await state(app);
  check(tag + 'un Ctrl+Z la rend, avec son lien', s.count === 4 && !!s.slides[2].link && s.slides[2].blocks[0] === 'heading:Rapport annuel', s.slides.map(x => [x.link, x.blocks[0]]));
  await a.leave();

  await A.context.close();
}

async function scenarioB(lang, colorScheme) {
  const ctx = await ready(lang, colorScheme, 'B');
  const { A, page, app, a, T, tag } = ctx;
  let s = await importPage(ctx, { query: 'rapp', name: 'Rapport', page: 0, after: 'Cible deux' });
  check(tag + '(préparation) la page 1 de « Rapport » est posée, liée, après « Cible deux »', s.count === 4 && !!s.slides[2].link, s.slides.map(x => x.link));
  await app.evaluate(() => SlideProps.applyNotes(EditorCore.getEditor(), [2], 'Mes notes'));
  await saved(A);
  const row7Before = await stored(app, 7);
  const anchored = (await stored(app, 8)).html;
  check(tag + 'enregistrée, la ligne de « Cible » garde le lien de la diapositive (data-link-page) et son repère', row7Before.html.includes('data-link-page="8:') && (row7Before.html.match(/data-link-page=/g) || []).length === 1, row7Before.html.slice(0, 200));
  s = await state(app);
  const link0 = parseLink(s.slides[2].link);
  const original = ['heading:Rapport annuel', 'paragraph:Bonjour à tous', 'bulletList:Premier pointSecond point'];

  // --- La synchro : « Rapport » changée ailleurs, la diapositive prend la nouvelle page à la lecture suivante de l'enregistrement automatique.
  await a.clickText('Cible trois');
  check(tag + '(préparation) « Rapport » réécrite ailleurs : « Premier point » devient « Premier point revu »', await rewrite(app, 8, 'Premier point', 'Premier point revu'), null);
  await watchStatus(app);
  const arrived = await waitDoc(app, 'Premier point revu');
  await sleep(500);
  s = await state(app);
  let said = await statusSeen(app);
  const link1 = parseLink(s.slides[2].link);
  const synced = ['heading:Rapport annuel', 'paragraph:Bonjour à tous', 'bulletList:Premier point revuSecond point'];
  check(tag + 'la lecture suivante de l’enregistrement automatique remplace la diapositive par la page d’aujourd’hui (la liste dit « Premier point revu ») ; le repère garde sa page et son rang, avec l’empreinte de la nouvelle',
    arrived && sameList(s.slides[2].blocks, synced) && !!link1 && link1.page === link0.page && link1.part === 0 && link1.src !== link0.src && s.count === 4, { arrived, blocks: s.slides[2].blocks, link0, link1 });
  check(tag + 'le coin d’état le dit : « ' + T.pulled('Rapport') + ' »', said.includes(T.pulled('Rapport')), said);
  check(tag + 'les notes de la diapositive sont restées, le curseur aussi (au bout de « Cible trois », le clavier dans le document)', s.slides[2].notes === 'Mes notes' && s.caret.block === 'Cible trois' && s.caret.atEnd && s.focus === 'editor', { notes: s.slides[2].notes, caret: s.caret, focus: s.focus });
  await sleep(7000);
  const row7After = await stored(app, 7);
  check(tag + 'la synchro ne rend pas la présentation « à enregistrer » : deux lectures plus tard, rien n’a été écrit dans sa ligne', row7After.saves === row7Before.saves && row7After.html === row7Before.html, { saves: [row7Before.saves, row7After.saves] });
  await page.keyboard.type('!');
  await sleep(300);
  await a.press('Control+z');
  s = await state(app);
  check(tag + 'Ctrl+Z défait la frappe de la personne, pas la synchro : « Cible trois » est revenu, la page dit toujours « Premier point revu »', s.slides[3].blocks[0] === 'paragraph:Cible trois' && sameList(s.slides[2].blocks, synced), { s3: s.slides[3].blocks, s2: s.slides[2].blocks });

  // --- Une page plus longue, vide, remise : la diapositive suit, ses notes restent.
  check(tag + '(préparation) la page 1 reçoit un paragraphe de plus à sa fin', await editRow(app, 8, 'beforeMarker', '<p>Ligne ajoutée</p>'), null);
  const longer = await waitDoc(app, 'Ligne ajoutée');
  await sleep(500);
  s = await state(app);
  check(tag + 'plus longue : la diapositive a un bloc de plus, les autres n’ont pas bougé (même nombre de diapositives)', longer && s.count === 4 && sameList(s.slides[2].blocks, [...synced, 'paragraph:Ligne ajoutée']) && s.slides[1].blocks[0] === 'paragraph:Cible deux' && s.slides[3].blocks[0] === 'paragraph:Cible trois', { longer, blocks: s.slides[2].blocks });
  check(tag + '(préparation) la page 1 vidée dans « Rapport » (son repère reste)', await editRow(app, 8, 'emptyFirstPage'), null);
  const emptied = await waitDoc(app, 'Rapport annuel', false);
  await sleep(500);
  s = await state(app);
  check(tag + 'vide : un paragraphe vide à la place, son lien et ses notes gardés, le reste n’a pas bougé', emptied && s.count === 4 && sameList(s.slides[2].blocks, ['paragraph:']) && !!s.slides[2].link && s.slides[2].notes === 'Mes notes' && s.slides[3].blocks[0] === 'paragraph:Cible trois', { emptied, blocks: s.slides[2].blocks });
  await replaceRow(app, 8, anchored);
  const back = await waitDoc(app, 'Rapport annuel');
  await sleep(500);
  s = await state(app);
  check(tag + '« Rapport » remise comme au début : la diapositive reprend sa page (la liste dit « Premier point »), avec ses notes', back && sameList(s.slides[2].blocks, original) && s.slides[2].notes === 'Mes notes', { back, blocks: s.slides[2].blocks });

  // --- La page perdue, puis le document perdu : les diapositives restent, la pastille le dit.
  check(tag + '(préparation) le repère de la page 1 retiré de « Rapport » : la page n’y est plus', await editRow(app, 8, 'dropMarkers'), null);
  const lost = await waitBadge(app, 2, T.badgeGone);
  s = await state(app);
  check(tag + 'la page perdue : la pastille dit « ' + T.badgeGone + ' », la diapositive reste telle quelle', lost && s.count === 4 && s.slides[2].blocks[0] === 'heading:Rapport annuel' && s.badges[2] === T.badgeGone, { lost, badges: s.badges });
  await a.openMenu(2);
  const gone = await app.evaluate(() => {
    const panel = document.querySelector('.pp-slide-menu.visible');
    const note = panel && panel.querySelector('.pp-slide-menu-note');
    return { note: note ? note.textContent : null, rows: panel ? Array.from(panel.querySelectorAll('[data-action]')).filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent) : [] };
  });
  check(tag + 'son menu ⋯ dit « ' + T.noteGone + ' » et propose toujours « ' + T.detach + ' »', gone.note === T.noteGone && gone.rows.includes(T.detach), gone);
  await a.closeMenu();
  await replaceRow(app, 8, anchored);
  const found = await waitBadge(app, 2, T.badge(1, 'Rapport'));
  check(tag + '« Rapport » remise comme au début : la pastille redit « ' + T.badge(1, 'Rapport') + ' »', found, (await state(app)).badges);
  const row8 = await dropRow(app, 8);
  const lostDoc = await waitBadge(app, 2, T.badgeGone);
  await a.clickText('Rapport annuel');
  await page.keyboard.type('x');
  await sleep(300);
  s = await state(app);
  check(tag + 'le document perdu : la pastille le dit, et la diapositive s’écrit de nouveau (rien à suivre) : « Rapport annuelx »', !!row8 && lostDoc && s.slides[2].blocks[0] === 'heading:Rapport annuelx', { lostDoc, blocks: s.slides[2].blocks });
  await page.keyboard.press('Backspace');
  await sleep(300);
  await putRow(app, row8);
  const returned = await waitBadge(app, 2, T.badge(1, 'Rapport'));
  s = await state(app);
  check(tag + 'le document revenu : la pastille redit « ' + T.badge(1, 'Rapport') + ' », et la diapositive redevient celle de la page', returned && sameList(s.slides[2].blocks, original), { returned, blocks: s.slides[2].blocks });

  // --- Rouvrir : la présentation prend la page d'aujourd'hui dès son ouverture.
  await saved(A);
  await open(A, 10, 0);
  check(tag + '(préparation) « Rapport » réécrite pendant que « Cible » est fermée', await rewrite(app, 8, 'Premier point', 'Premier point rouvert'), null);
  await open(A, 7, 4);
  const reopened = await waitDoc(app, 'Premier point rouvert', true, 15000);
  s = await state(app);
  check(tag + 'rouverte, « Cible » montre la page d’aujourd’hui (« Premier point rouvert »), avec son lien et ses notes', reopened && s.count === 4 && !!s.slides[2].link && s.slides[2].notes === 'Mes notes' && s.slides[2].blocks[2] === 'bulletList:Premier point rouvertSecond point', { reopened, slide: s.slides[2] });
  await replaceRow(app, 8, anchored);
  await waitDoc(app, 'Premier point rouvert', false);

  // --- Une page plus haute qu'une diapositive : plusieurs diapositives, un seul groupe.
  const longGroup = st => st.slides.map((x, i) => ({ i, link: parseLink(x.link) })).filter(x => x.link && x.link.model === 9);
  await watchStatus(app);
  s = await importPage(ctx, { query: 'long', name: 'Long', page: 0, after: 'Cible trois' });
  said = await statusSeen(app);
  let group = longGroup(s);
  const k = group.length;
  check(tag + 'une page plus haute qu’une diapositive arrive en plusieurs diapositives liées à la même page, de rang 0 à n-1, après « Cible trois »', k >= 2 && group.every((x, i) => x.link.page === group[0].link.page && x.link.part === i && x.i === 4 + i) && s.count === 4 + k, { k, group });
  check(tag + 'le coin d’état dit « ' + T.done(1, 'Long', k) + ' »', said.includes(T.done(1, 'Long', k)), said);
  await app.evaluate(() => { const editor = EditorCore.getEditor(); SlideProps.applyNotes(editor, [4], 'Notes un'); SlideProps.applyNotes(editor, [5], 'Notes deux'); });
  const longHtml = (await stored(app, 9)).html;
  check(tag + '(préparation) « Long » réécrite : « Paragraphe 3 » devient « Paragraphe trois »', await rewrite(app, 9, 'Paragraphe 3 :', 'Paragraphe trois :'), null);
  const edited = await waitDoc(app, 'Paragraphe trois :');
  await sleep(500);
  s = await state(app);
  group = longGroup(s);
  check(tag + 'même nombre de diapositives : chacune garde sa place et ses notes, seule la première change', edited && group.length === k && s.slides[4].notes === 'Notes un' && s.slides[5].notes === 'Notes deux' && s.slides[4].blocks.some(b => b.includes('Paragraphe trois')) && !s.slides[5].blocks.some(b => b.includes('Paragraphe trois')), { edited, k, group: group.length, notes: [s.slides[4].notes, s.slides[5].notes] });
  check(tag + '(préparation) « Long » perd ses vingt derniers paragraphes', await editRow(app, 9, 'dropParagraphsFrom', 20), null);
  const shorter = await waitDoc(app, 'Paragraphe 40 :', false);
  await sleep(500);
  s = await state(app);
  group = longGroup(s);
  check(tag + 'plus courte : moins de diapositives, une seule suite de rangs 0 à n-1 (ni doublon ni reste), « Cible trois » toujours avant, la première garde ses notes',
    shorter && group.length >= 1 && group.length < k && group.every((x, i) => x.link.part === i && x.i === 4 + i) && s.count === 4 + group.length && s.slides[3].blocks[0] === 'paragraph:Cible trois' && s.slides[4].notes === 'Notes un', { shorter, k, group: group.length, count: s.count });
  await replaceRow(app, 9, longHtml);
  const regrown = await waitDoc(app, 'Paragraphe 40 :');
  await sleep(500);
  s = await state(app);
  group = longGroup(s);
  check(tag + '« Long » remise comme au début : le groupe retrouve ses diapositives (' + k + '), toujours une seule suite de rangs, la première garde ses notes', regrown && group.length === k && group.every((x, i) => x.link.part === i && x.i === 4 + i) && s.count === 4 + k && s.slides[4].notes === 'Notes un', { regrown, k, group: group.length, count: s.count });

  // --- « Détacher » : tout le groupe est libéré, un seul Ctrl+Z le relie.
  await a.openMenu(4);
  await watchStatus(app);
  await a.menuRow(T.detach);
  s = await state(app);
  said = await statusSeen(app);
  group = longGroup(s);
  check(tag + '« Détacher » libère toutes les diapositives de la page : plus aucun lien parmi elles, leur texte gardé, la page 1 de « Rapport » toujours suivie, et le coin d’état le dit (« ' + T.detached(k, 'Long') + ' »)',
    group.length === 0 && s.count === 4 + k && !!s.slides[2].link && said.includes(T.detached(k, 'Long')), { group: group.length, said });
  check(tag + 'leurs pastilles ont disparu (seule celle de la page 1 reste)', s.badges.filter(Boolean).length === 1 && s.badges[2] === T.badge(1, 'Rapport'), s.badges);
  await a.leave();
  const firstLong = s.slides[4].blocks[0].replace(/^paragraph:/, '');
  await a.clickText(firstLong);
  await page.keyboard.type('x');
  await sleep(300);
  s = await state(app);
  check(tag + 'libérée, la diapositive s’écrit de nouveau', s.slides[4].blocks[0] === 'paragraph:' + firstLong + 'x', s.slides[4].blocks);
  await a.press('Control+z');
  await sleep(700);
  await a.press('Control+z');
  s = await state(app);
  group = longGroup(s);
  check(tag + 'Ctrl+Z défait la frappe puis « Détacher » en un seul pas : les ' + k + ' diapositives sont reliées de nouveau', group.length === k && group.every((x, i) => x.link.part === i) && s.slides[4].blocks[0] === 'paragraph:' + firstLong, { group: group.length, k });
  await A.context.close();
}

async function scenarioC(lang, colorScheme) {
  const ctx = await ready(lang, colorScheme, 'C');
  const { A, page, app, a, T, tag } = ctx;
  let s = await importPage(ctx, { query: 'rapp', name: 'Rapport', page: 0, after: 'Cible deux' });
  s = await importPage(ctx, { query: 'rapp', name: 'Rapport', page: 2, after: 'Cible trois' });
  check(tag + '(préparation) les pages 1 et 3 de « Rapport » sont posées, liées', s.count === 5 && s.slides.filter(x => x.link).length === 2, s.slides.map(x => x.link));
  await saved(A);
  const raw = (await stored(app, 8)).html;
  const top = await topOf(app, raw);
  check(tag + 'dans la ligne de « Rapport », le repère de la page 1 finit sa page (juste avant le saut) et celui de la page 3, dernière, la commence (juste après le saut) : le texte ne finit pas sur un repère',
    top.markers.length === 2 && top.markers[0].after === 'page-break-marker' && top.markers[1].before === 'page-break-marker' && top.markers[1].at < top.count - 1, top.markers);

  // --- Le document source : rien ne gêne la page, ni sa pagination, ni l'écriture.
  await open(A, 8, 0);
  const d0 = await docState(app);
  const where = (test) => d0.top.map((n, i) => (test(n) ? i : -1)).filter(i => i >= 0);
  const marks = where(n => n.marker);
  const breaks = where(n => n.type === 'pageBreak');
  check(tag + 'ouvert, « Rapport » a ses deux repères, l’un juste avant le premier saut, l’autre juste après le second, et finit sur « Fin du rapport » (ni repère ni paragraphe vide)',
    d0.markers === 2 && d0.breaks === 2 && marks[0] + 1 === breaks[0] && marks[1] === breaks[1] + 1 && d0.last && d0.last.text === 'Fin du rapport' && !d0.last.marker, { top: d0.top });
  await open(A, 11, 0);
  const twin0 = await docState(app);
  check(tag + 'WYSIWYG : la pagination est celle d’avant les repères : chaque bloc est à la même place que dans « Rapport témoin » (même texte, sans repère)', twin0.markers === 0 && sameList(twin0.tops, d0.tops) && twin0.visible === d0.visible, { with: d0.tops, without: twin0.tops });
  const trace = async () => {
    const out = [];
    const mark = async (label) => { const d = await docState(app); out.push({ label, visible: d.visible, selNode: d.selNode, markers: d.markers, lastIsMarker: d.last ? d.last.marker : null }); };
    await a.clickText('Second point', 'end');
    await a.press('Delete'); await mark('Suppr 1');
    await a.press('Delete'); await mark('Suppr 2');
    await a.clickText('Fin du rapport', 'start');
    await a.press('Backspace'); await mark('Retour arrière 1');
    await a.press('Backspace'); await mark('Retour arrière 2');
    for (let i = 1; i <= 4; i++) { await a.press('Control+z'); await mark('Annuler ' + i); }
    return out;
  };
  const twinTrace = await trace();
  await open(A, 8, 0);
  const withTrace = await trace();
  check(tag + 'Suppr au bout de la page 1 et Retour arrière au début de la page 3, deux fois chacun : le texte visible et la sélection sont, à chaque touche, ceux du document sans repère',
    withTrace.length === twinTrace.length && withTrace.every((x, i) => x.visible === twinTrace[i].visible && x.selNode === twinTrace[i].selNode), withTrace.map((x, i) => [x.label, x.visible === twinTrace[i].visible, x.selNode, twinTrace[i].selNode]));
  check(tag + 'les deux repères restent au document pendant ces touches, et le texte ne finit jamais sur un repère', withTrace.every(x => x.markers === 2 && !x.lastIsMarker), withTrace.map(x => [x.label, x.markers, x.lastIsMarker]));
  check(tag + 'quatre Ctrl+Z (une touche, un pas) remettent le texte tel qu’il était, avec ses deux repères', withTrace[withTrace.length - 1].visible === d0.visible && withTrace[withTrace.length - 1].markers === 2, { markers: withTrace[withTrace.length - 1].markers });
  await a.clickText('Second point', 'end');
  await page.keyboard.type('x');
  await sleep(300);
  const typed = await docState(app);
  const ul = typed.top.findIndex(n => n.type === 'bulletList');
  check(tag + 'taper au bout de la page 1 ne déplace pas son repère : il reste juste après la liste, avant le saut', typed.top[ul].full.endsWith('Second pointx') && typed.top[ul + 1].marker && typed.top[ul + 2].type === 'pageBreak', typed.top.slice(ul, ul + 3));
  await a.press('Control+z');
  const spared = await app.evaluate(() => {
    const editor = EditorCore.getEditor();
    let pos = -1;
    editor.state.doc.forEach((node, offset) => { if (pos < 0 && node.type.name === 'slideLink') pos = offset; });
    const before = editor.state.doc;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + editor.state.doc.nodeAt(pos).nodeSize));
    return { pos, same: editor.state.doc.eq(before) };
  });
  check(tag + 'une transaction qui n’ôterait que le repère d’une page est refusée (personne ne le voit : la page y perdrait son numéro)', spared.pos > 0 && spared.same, spared);

  // --- Une page unique : le repère ouvre le document, sans changer la place des blocs.
  await open(A, 7, 5);
  s = await importPage(ctx, { query: 'long', name: 'Long', page: 0, after: 'Cible trois' });
  const total = s.count;
  check(tag + '(préparation) « Long », d’une seule page, est posée, liée', s.slides.filter(x => x.link && parseLink(x.link).model === 9).length >= 2, s.slides.map(x => x.link));
  await open(A, 9, 0);
  const long0 = await docState(app);
  await open(A, 12, 0);
  const longTwin = await docState(app);
  check(tag + 'WYSIWYG : « Long », dont le repère ouvre le texte, a ses blocs aux mêmes places que son témoin sans repère', long0.markers === 1 && long0.top[0].marker && longTwin.markers === 0 && sameList(long0.tops, longTwin.tops) && long0.visible === longTwin.visible, { first: long0.top[0], with: long0.tops.slice(0, 3), without: longTwin.tops.slice(0, 3) });

  // --- Les sorties : la Lecture, les exports et les sorties de la présentation n'ont aucun repère.
  await open(A, 8, 0);
  await a.click('#btn-mode-read', 0, 300);
  await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const reading = await app.evaluate(() => {
    const reader = document.querySelector('#reader-container .reader-content');
    return { text: reader ? reader.textContent : '', markers: document.querySelectorAll('#reader-container .pp-slide-link, #reader-container [data-slide-id]').length, out: SlidesEntry.outputHtml('document', EditorCore.getEditor().getHTML()), raw: EditorCore.getEditor().getHTML() };
  });
  check(tag + 'la Lecture de « Rapport » montre son texte sans repère, et ses sorties (SlidesEntry.outputHtml) n’en ont pas non plus', reading.text.includes('Rapport annuel') && reading.text.includes('Fin du rapport') && reading.markers === 0 && reading.raw.includes('pp-slide-link') && !reading.out.includes('pp-slide-link') && !reading.out.includes('data-slide-id'), { markers: reading.markers, raw: reading.raw.includes('pp-slide-link'), out: reading.out.includes('pp-slide-link') });
  await a.click('#btn-mode-edit', 0, 500);
  await open(A, 7, total);
  const outs = await app.evaluate(() => ({ raw: EditorCore.getEditor().getHTML(), out: SlidesEntry.outputHtml('presentation', EditorCore.getEditor().getHTML()) }));
  check(tag + 'les sorties de la présentation n’ont ni repère ni lien de page (data-link-page), et gardent le texte des diapositives', outs.raw.includes('data-link-page') && !outs.out.includes('data-link-page') && !outs.out.includes('pp-slide-link') && outs.out.includes('Rapport annuel') && outs.out.includes('Fin du rapport'), { raw: outs.raw.includes('data-link-page'), out: outs.out.slice(0, 200) });

  // --- La dernière page (dont le repère ouvre la page) et deux pages jointes : la présentation suit.
  check(tag + '(préparation) la dernière page de « Rapport » réécrite ailleurs', await rewrite(app, 8, 'Fin du rapport', 'Fin révisée'), null);
  const lastPage = await waitDoc(app, 'Fin révisée');
  s = await state(app);
  check(tag + 'la dernière page est suivie comme les autres : « Fin révisée » arrive dans sa diapositive, le reste n’a pas bougé', lastPage && s.slides.filter(x => x.blocks.includes('paragraph:Fin révisée')).length === 1 && s.count === total && s.slides[2].blocks[0] === 'heading:Rapport annuel', { lastPage, count: s.count });
  await open(A, 8, 0);
  await a.clickText('Second point', 'end');
  await a.press('Delete');
  await a.press('Delete');
  const joined = await docState(app);
  check(tag + '(préparation) le saut de la page 1 ôté dans « Rapport » : deux pages n’en font plus qu’une, les deux repères restent', joined.breaks === 1 && joined.markers === 2, { breaks: joined.breaks, markers: joined.markers });
  await saved(A);
  await open(A, 7, 0);
  const merged = await waitDoc(app, 'Détails', true, 20000);
  await sleep(1000);
  s = await state(app);
  const followed = s.slides.filter(x => x.link);
  check(tag + 'la présentation reprend la page jointe (la diapositive montre aussi « Détails ») ; chaque diapositive liée garde son lien, et la dernière page reste suivie',
    merged && followed.length >= 2 && s.slides.some(x => x.blocks.some(b => b.includes('Détails'))) && s.slides.some(x => x.blocks.includes('paragraph:Fin révisée')) && s.slides[1].blocks[0] === 'paragraph:Cible deux', { merged, followed: followed.length, blocks: s.slides.map(x => x.blocks[0]) });
  await A.context.close();
}

const SCENARIOS = { a: scenarioA, b: scenarioB, c: scenarioC };
for (const [lang, scheme] of [['fr', 'light'], ['en', 'dark']]) {
  if (ONLY && ONLY !== lang) continue;
  for (const [key, scenario] of Object.entries(SCENARIOS)) if (!PART || PART === key) await scenario(lang, scheme);
}
await t.finish();
