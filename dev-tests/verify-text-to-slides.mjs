#!/usr/bin/env node
// Une page de document en diapositives (extensions/diapositives/page-slides.js, js/slide-text.js:toSlide, le volet « Importer » de extensions/diapositives/slide-import.js avec un document pour source,
// le Ctrl+V de extensions/diapositives/slide-strip.js ; demande du 22/10 : « importer […] des pages de document dans des slides » ; cartes « En texte, dans les deux sens » et « Celle d'arrivée, avec
// une case »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS (sans `allow-same-origin`),
// l'extension « diapositives » active, une présentation « Cible » à l'écran avec sa bande.
//  LE VOLET : la liste avec recherche d'« Importer » propose aussi les documents (rien d'un e-mail ni d'un macro-modèle). Un document est une suite de pages (ce qui sépare deux sauts de page ;
//   sans saut, une seule) : une miniature par page, à la page du document (A4 portrait, A4 paysage, ou le sens que porte le saut de page qui l'ouvre), nommée « Page 2 sur 3 ». La case « Garder la mise en
//   forme d'origine » prend la place de « Garder liée » (le lien ne vaut que d'une présentation à une autre), décochée ; l'indication dit après quelle diapositive l'import se pose.
//  IMPORTER : un clic sur une page la pose en diapositive après celle du curseur : le texte prend les tailles d'une diapositive (titres à 44, 36 pt…, texte à 20 pt), sauf la case cochée (les tailles du
//   document restent) ; le gras, les listes, les tableaux, les variables passent tels quels, une image devant ou derrière le texte devient une image du texte. Une page vide n'ajoute rien et le dit. Le coin
//   d'état dit le nombre de diapositives. Un seul Ctrl+Z défait un import ; le curseur se pose sur la dernière diapositive posée : l'import suivant vient après elle.
//  UNE PAGE TROP LONGUE devient plusieurs diapositives, coupées entre deux blocs là où l'éditeur couperait (la pagination de l'éditeur, mesurée sur les mêmes blocs mis bout à bout) ; un tableau trop haut se
//   coupe entre deux lignes, chaque partie garde ses colonnes. Aucune diapositive posée ne dépasse de sa page (pas de point rouge).
//  CTRL+V : une sélection copiée de l'éditeur d'un document et collée sur une miniature de la bande devient des diapositives (une seule suffit, ou plusieurs quand elle est longue ou traverse des sauts
//   de page), un seul Ctrl+Z ; collée dans le texte d'une diapositive, elle se colle comme avant, avec les tailles du document.
//  EXTENSION ÉTEINTE EN DIRECT : la liste et les miniatures du volet ouvert sont grisées avec leur raison, leur clic appelle `installer` de GFS sans rien changer ; rallumée, elles se dégrisent.
// Lancé par run-headless.mjs (groupe Node "textToSlides", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-text-to-slides.mjs
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-text-to-slides', port: Number(process.env.TEXT_TO_SLIDES_PORT || 8975) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const BR_PORTRAIT = '<div class="page-break-marker" contenteditable="false" data-page-orientation="portrait">Saut de page</div>';
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const NAMES = { [PHOTO]: 'photo' };
const size = (pt, text) => `<span style="font-size: ${pt}pt">${text}</span>`;
const layered = (src, pageIndex) => `<img class="editor-image" src="${src}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: 5" data-layer="front" data-wrap="inline" data-page-index="${pageIndex}" data-page-left-pt="40" data-page-top-pt="30">`;
const CHIP = '<span class="var-badge" contenteditable="false" data-table="PpDepart" data-column="Nom" data-key="PpDepart.Nom">#PpDepart.Nom</span>';
const LONG_PARAGRAPHS = 40;
const TABLE_ROWS = 40;
// Les pages du document « Rapport » : un titre à 18 pt, du texte à 11 pt dont du gras, une liste ; un sous-titre, une variable, une image devant le texte et un tableau de deux lignes ; une page vide.
const PAGE_ONE = `<h1>${size(18, 'Rapport annuel')}</h1><p>${size(11, 'Bonjour <strong>à tous</strong>')}</p><ul><li><p>${size(11, 'Premier point')}</p></li><li><p>${size(11, 'Second point')}</p></li></ul>`;
const PAGE_TWO = `<h2>Détails</h2><p>${size(11, 'Pour ' + CHIP)}</p><p>${layered(PHOTO, 1)}</p><table><tbody><tr><td><p>Case A</p></td><td><p>Case B</p></td></tr><tr><td><p>Case C</p></td><td><p>Case D</p></td></tr></tbody></table>`;
// 7 « Cible » : une présentation de trois diapositives ; 8 « Rapport » : un document de trois pages ; 9 « Long » : un document d'une seule page (sans saut) de 40 paragraphes à 11 pt, bien plus haut qu'une
// diapositive ; 10 « Tableau » : un titre et un tableau de 40 lignes ; 11 « Paysage » : un document en paysage dont la deuxième page, ouverte par un saut qui dit portrait, est en portrait ; 12 « Autre
// présentation ». Les modèles de départ (seedModels) : trois documents, un e-mail, un macro-modèle et une présentation, « Futur ».
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Cible', '<p>Cible un</p>${BR}<p>Cible deux</p>${BR}<p>Cible trois</p>', false, 'presentation');
  add(8, 'Rapport', '${PAGE_ONE}${BR}${PAGE_TWO}${BR}<p></p>', false, 'document');
  add(9, 'Long', Array.from({ length: ${LONG_PARAGRAPHS} }, (_, i) => '<p><span style="font-size: 11pt">Paragraphe ' + (i + 1) + ' : un texte assez long pour tenir sur une ligne, et parfois deux quand la page est étroite.</span></p>').join(''), false, 'document');
  add(10, 'Tableau', '<h1><span style="font-size: 18pt">Chiffres</span></h1><table><tbody>' + Array.from({ length: ${TABLE_ROWS} }, (_, i) => '<tr><td><p>Ligne ' + (i + 1) + '</p></td><td><p>Valeur ' + (i + 1) + '</p></td></tr>').join('') + '</tbody></table>', false, 'document');
  add(11, 'Paysage', '<p>Paysage un</p>${BR_PORTRAIT}<p>Portrait deux</p>', false, 'document');
  m.Margins[m.Nom.indexOf('Paysage')] = JSON.stringify({ orientation: 'landscape' });
  add(12, 'Autre présentation', '<p>Autre</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 13;
`;
const TEXTS = {
  fr: {
    choose: '— Choisir une présentation ou un document —', title: 'Importer depuis', keep: 'Garder la mise en forme d’origine', linked: 'Garder liée',
    hint: n => `Un clic sur une page l’importe en diapositives après la diapositive ${n}.`, hintKeep: n => `Un clic sur une page l’importe en diapositives après la diapositive ${n}, avec la mise en forme du document.`,
    hintSlide: n => `Un clic sur une diapositive l’importe après la diapositive ${n}.`,
    done: (n, name, k) => `Page ${n} de « ${name} » importée en ${k} ${k > 1 ? 'diapositives' : 'diapositive'}.`, empty: (n, name) => `La page ${n} de « ${name} » est vide : rien à importer.`,
    pasted: k => `Sélection collée en ${k} ${k > 1 ? 'diapositives' : 'diapositive'}.`, item: (n, total) => `Page ${n} sur ${total}`, list: name => `Pages de « ${name} »`, slideItem: (n, total) => `Diapositive ${n} sur ${total}`,
    sources: ['Autre présentation', 'Départ A défaut', 'Départ B', 'Départ C', 'Futur', 'Long', 'Paysage', 'Rapport', 'Tableau'],
  },
  en: {
    choose: '— Choose a presentation or a document —', title: 'Import from', keep: 'Keep the original formatting', linked: 'Keep linked',
    hint: n => `Click a page to import it as slides after slide ${n}.`, hintKeep: n => `Click a page to import it as slides after slide ${n}, with the document’s formatting.`,
    hintSlide: n => `Click a slide to import it after slide ${n}.`,
    done: (n, name, k) => `Page ${n} of “${name}” imported as ${k} ${k > 1 ? 'slides' : 'slide'}.`, empty: (n, name) => `Page ${n} of “${name}” is empty: nothing to import.`,
    pasted: k => `Selection pasted as ${k} ${k > 1 ? 'slides' : 'slide'}.`, item: (n, total) => `Page ${n} of ${total}`, list: name => `Pages of “${name}”`, slideItem: (n, total) => `Slide ${n} of ${total}`,
    sources: ['Autre présentation', 'Départ A défaut', 'Départ B', 'Départ C', 'Futur', 'Long', 'Paysage', 'Rapport', 'Tableau'],
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
  // Une miniature du volet amenée dans la partie visible de sa liste par la molette de la souris, posée sur la liste : une page de document est plus haute que la liste à 700x400, on en garde le haut à l'écran.
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
    await sleep(600);
  };
  return { click, clickThumb, showThumb, clickText, press, pickSource, reach, inPage, centerOf };
}

// La présentation ouverte : le HTML découpé par diapositive (blocs, tailles, gras, tableaux, lignes, variables, images), ses images (laquelle, son calque, sa page), le curseur (la diapositive qui le porte),
// les points rouges des miniatures de la bande, où est le clavier, le coin d'état. Puis le volet : ouvert ou non, la source, l'indication, la case, ses miniatures. Lu dans le cadre de l'app.
const state = app => app.evaluate((names) => {
  const editor = EditorCore.getEditor();
  const doc = editor.state.doc;
  const html = editor.getHTML();
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const groups = [[]];
  Array.from(holder.children).forEach((el) => { if (el.classList.contains('page-break-marker')) groups.push([]); else groups[groups.length - 1].push(el); });
  const sizesOf = (els) => {
    const found = [];
    els.forEach(el => (el.outerHTML.match(/font-size: [0-9.]+pt/g) || []).forEach((m) => { const v = m.slice(11); if (!found.includes(v)) found.push(v); }));
    return found;
  };
  const slides = groups.map(els => ({
    blocks: els.map(el => el.tagName.toLowerCase() + ':' + el.textContent),
    sizes: sizesOf(els),
    bold: els.reduce((all, el) => all.concat(Array.from(el.querySelectorAll('strong, b')).map(b => b.textContent)), []),
    tables: els.filter(el => el.matches('table, .tableWrapper')).length,
    rows: els.reduce((n, el) => n + el.querySelectorAll('tr').length, 0),
    cells: els.reduce((all, el) => all.concat(Array.from(el.querySelectorAll('td, th')).map(c => c.textContent)), []),
    chips: els.reduce((n, el) => n + el.querySelectorAll('.var-badge').length, 0),
  }));
  const images = [];
  doc.descendants((node) => { if (node.type.name === 'editorImage') images.push({ name: names[node.attrs.src] || '?', layer: node.attrs.layer, pageIndex: node.attrs.pageIndex }); return node.type.name !== 'editorImage'; });
  const pm = SlideStrip.slidesOf(doc);
  const at = pm.findIndex(s => editor.state.selection.from <= s.end);
  const stripItems = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
  const importItems = Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-item'));
  const active = document.activeElement;
  let focus = null;
  if (active && active.closest('.ProseMirror')) focus = 'editor';
  else if (active && active.closest('.pp-slide-strip .pp-slide-item')) focus = 'strip';
  else if (active && active.closest('.pp-slide-import .pp-slide-item')) focus = 'thumb' + (importItems.indexOf(active.closest('.pp-slide-item')) + 1);
  else if (active) focus = active.id || active.className || active.tagName;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const panel = document.querySelector('.pp-slide-import');
  const trigger = document.querySelector('.pp-slide-import .ss-trigger');
  const hint = document.querySelector('.pp-slide-import-hint');
  // La case que le volet montre : « Garder liée » d'une présentation à une autre, « Garder la mise en forme d'origine » pour une page de document.
  const keep = Array.from(document.querySelectorAll('.pp-slide-import-keep')).find(el => !el.hidden) || null;
  const keepBox = keep ? keep.querySelector('input') : null;
  const list = document.querySelector('.pp-slide-import-list');
  return {
    html, slides, images, focus,
    count: stripItems.length,
    dots: stripItems.filter(item => { const dot = item.querySelector('.pp-slide-overflow'); return dot && !dot.hidden; }).length,
    cursor: at < 0 ? pm.length - 1 : at,
    status: document.getElementById('status-msg').textContent,
    open: !!panel && !panel.hidden,
    panel: rect(panel && !panel.hidden ? panel : null),
    field: trigger ? trigger.textContent.trim() : null,
    title: panel ? (panel.querySelector('.pp-slide-import-title') || {}).textContent : null,
    hint: hint && !hint.hidden ? hint.textContent : '',
    keep: keep && !keep.hidden ? { text: keep.textContent.trim(), checked: keepBox.checked, disabled: keepBox.disabled } : null,
    listLabel: list ? list.getAttribute('aria-label') : null,
    listDisabled: list ? list.getAttribute('aria-disabled') : null,
    rows: importItems.map(item => ({ label: item.getAttribute('aria-label'), drawn: item.querySelector('.pp-slide-page').childNodes.length > 0 })),
    pages: Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-page')).map(p => ({ w: parseFloat(p.style.width), h: parseFloat(p.style.height) })),
  };
}, NAMES);
// Où l'éditeur coupe `html` quand toutes les diapositives de `html` sont mises bout à bout en une seule : le rang du premier bloc de premier niveau de chaque nouvelle page (`blocks`), et celui de la première
// ligne de tableau de chaque nouvelle page (`rows`), d'après sa propre pagination (HeaderFooterPreview.pageIndexOf). C'est la coupure de l'éditeur, que l'import doit retrouver.
const editorCuts = (app, html) => app.evaluate(async (merged) => {
  Editor.setHTML(merged);
  await new Promise(r => setTimeout(r, 1200));
  const tiptap = document.querySelector('#editor-container .tiptap');
  const startsOf = (els) => {
    const starts = [];
    els.forEach((el, i) => { if (i && HeaderFooterPreview.pageIndexOf(el) !== HeaderFooterPreview.pageIndexOf(els[i - 1])) starts.push(i); });
    return starts;
  };
  return { blocks: startsOf(Array.from(tiptap.children)), rows: startsOf(Array.from(tiptap.querySelectorAll('tr'))) };
}, html);
// Ce que le coin d'état a dit depuis `watchStatus`.
const watchStatus = app => app.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true });
});
const statusSeen = app => app.evaluate(() => window.__statusSeen.slice());
// GFS vit dans la page parente ; les fenêtres de l'app, dans son cadre.
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);
const appDialogOpen = app => app.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; });
// Les lignes de la liste avec recherche ouverte.
const ssOptions = app => app.evaluate(() => { const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden); return panel ? Array.from(panel.querySelectorAll('.ss-list [role="option"]')).map(o => o.textContent.trim()) : null; });
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
// Ctrl+S, et l'attente de l'écriture dans le faux Grist : un modèle qu'on quitte avec des changements non enregistrés demanderait d'abord « Quitter sans enregistrer ? ».
const saved = async (tab) => {
  const before = await tab.app.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
  await tab.page.keyboard.press('Control+s');
  await tab.app.waitForFunction(n => window.__gristStub.countSaves('Publipostage_Modeles') > n, before, { timeout: 8000 }).catch(() => {});
  await sleep(300);
};
// Le modèle de départ, remis tel qu'il était (et enregistré), pour que chaque partie parte du même texte.
const fresh = async (tab, html) => { await tab.app.evaluate(h => Editor.setHTML(h), html); await sleep(500); await saved(tab); };
// Les paragraphes « Paragraphe k : … » de `slides`, dans l'ordre, sans leur texte courant.
const numbers = slides => slides.reduce((all, slide) => all.concat(slide.blocks.map(b => /^p:Paragraphe (\d+) :/.exec(b)).map(m => (m ? Number(m[1]) : -1))), []);
const cellNumbers = slides => slides.reduce((all, slide) => all.concat(slide.cells.filter((c, i) => i % 2 === 0).map(c => Number(c.replace('Ligne ', '')))), []);
// Le rang cumulé des blocs aux coupures : [3, 7] pour des diapositives de 3 puis 4 blocs (la dernière n'a pas de coupure derrière elle).
const cumulative = counts => counts.slice(0, -1).reduce((all, n) => all.concat((all.length ? all[all.length - 1] : 0) + n), []);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  // La langue est celle de GFS (consigne 019), que son contexte donne au cadre.
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 7, 3, false);
  await a.clickText('Cible deux');
  const original = (await state(app)).html;
  let s = await state(app);
  check(tag + '« Cible » à l’écran : trois diapositives, le curseur sur la 2', s.count === 3 && s.slides.length === 3 && s.cursor === 1, { count: s.count, slides: s.slides.length, cursor: s.cursor });

  // --- La liste des sources : les autres présentations ET les documents.
  await a.click('.pp-slide-import-open', 0, 800);
  s = await state(app);
  check(tag + 'sans source choisie : « ' + T.title + ' », le champ dit « ' + T.choose + ' », ni indication, ni case, ni miniature',
    s.open && s.title === T.title && s.field === T.choose && s.hint === '' && s.keep === null && s.rows.length === 0, { open: s.open, title: s.title, field: s.field, hint: s.hint, keep: s.keep, rows: s.rows.length });
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  const options = await ssOptions(app);
  check(tag + 'la liste avec recherche propose les autres présentations et TOUS les documents, par nom, et rien d’autre : ni « Cible » (à l’écran), ni l’e-mail, ni le macro-modèle',
    sameList(options, T.sources), options);
  await page.keyboard.type('rapp');
  await sleep(250);
  await a.press('Enter');
  await sleep(600);
  s = await state(app);
  check(tag + '« rapp » puis Entrée choisit « Rapport » : une miniature par page, nommée (« ' + T.item(1, 3) + ' »…), la liste dit « ' + T.list('Rapport') + ' », l’indication dit l’import après la diapositive du curseur (la 2)',
    s.field === 'Rapport' && sameList(s.rows.map(r => r.label), [T.item(1, 3), T.item(2, 3), T.item(3, 3)]) && s.listLabel === T.list('Rapport') && s.hint === T.hint(2), { field: s.field, rows: s.rows, list: s.listLabel, hint: s.hint });
  check(tag + 'la case « ' + T.keep + ' » prend la place de « ' + T.linked + ' », décochée, activée',
    !!s.keep && s.keep.text === T.keep && s.keep.checked === false && s.keep.disabled === false, s.keep);
  check(tag + 'les miniatures sont à la page du document (A4 portrait, 0,707), pas à celle de la présentation (16:9) ; elles se dessinent',
    s.pages.length === 3 && s.pages.every(p => Math.abs(p.w / p.h - 210 / 297) < 0.01) && s.rows.some(r => r.drawn), s.pages);
  check(tag + 'l’indication se lit (contraste ≥ 4,5:1)', (await contrastOf(app, '.pp-slide-import-hint')) >= 4.5, await contrastOf(app, '.pp-slide-import-hint'));
  await a.clickText('Cible un');
  s = await state(app);
  check(tag + 'le curseur passe à la diapositive 1 : l’indication le suit', s.hint === T.hint(1), s.hint);
  await a.clickText('Cible deux');

  // --- Importer la page 1 : les tailles d'une diapositive.
  await watchStatus(app);
  await a.clickThumb(0, 1800);
  s = await state(app);
  let said = await statusSeen(app);
  const one = s.slides[2];
  check(tag + 'un clic sur la page 1 la pose en diapositive après la diapositive du curseur (la 2) : le titre, le texte, la liste ; le gras est gardé',
    s.count === 4 && s.slides.length === 4 && sameList(one.blocks, ['h1:Rapport annuel', 'p:Bonjour à tous', 'ul:Premier pointSecond point']) && sameList(one.bold, ['à tous']), { count: s.count, one });
  check(tag + 'le texte prend les tailles d’une diapositive (le titre à 44 pt, le reste à 20 pt), non celles du document (18 et 11 pt)',
    sameList(one.sizes, ['44pt', '20pt']) && !/font-size: (18|11)pt/.test(s.html), one.sizes);
  check(tag + 'le coin d’état dit « ' + T.done(1, 'Rapport', 1) + ' » ; le curseur est sur la diapositive posée, le clavier reste dans le document, le volet reste ouvert, l’indication dit la diapositive 3',
    said.includes(T.done(1, 'Rapport', 1)) && s.cursor === 2 && s.focus === 'editor' && s.open && s.hint === T.hint(3), { said, cursor: s.cursor, focus: s.focus, hint: s.hint });
  await a.press('Control+z');
  await sleep(500);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait l’import : la présentation est telle qu’avant', s.html === original && s.count === 3, { count: s.count, same: s.html === original });

  // --- La case : les tailles du document restent.
  await a.click('#pp-slide-import-format', 0, 300);
  await a.clickText('Cible deux');
  s = await state(app);
  check(tag + 'la case cochée change l’indication : « ' + T.hintKeep(2) + ' »', s.keep.checked === true && s.hint === T.hintKeep(2), { keep: s.keep, hint: s.hint });
  await a.clickThumb(0, 1800);
  s = await state(app);
  check(tag + 'la case cochée, la page garde les tailles du document (18 pt pour le titre, 11 pt pour le texte), aucune de la diapositive',
    s.count === 4 && sameList(s.slides[2].sizes, ['18pt', '11pt']), { count: s.count, sizes: s.slides[2].sizes });
  await a.press('Control+z');
  await sleep(500);
  await a.click('#pp-slide-import-format', 0, 300);
  await a.clickText('Cible deux');

  // --- Importer la page 2 : variable, image, tableau.
  await a.clickThumb(1, 1800);
  s = await state(app);
  const two = s.slides[2];
  check(tag + 'la page 2 arrive en diapositive 3 : son sous-titre à 36 pt, sa variable intacte, son image devant le texte devenue une image du texte, son tableau de deux lignes et quatre cases à 20 pt',
    sameList(two.blocks.slice(0, 2).map(b => b.split(':')[0] + ':' + (b.startsWith('p:') ? 'Pour' : b.split(':')[1])), ['h2:Détails', 'p:Pour']) && two.chips === 1 && two.tables === 1 && two.rows === 2 && sameList(two.cells, ['Case A', 'Case B', 'Case C', 'Case D'])
      && two.sizes.includes('36pt') && two.sizes.includes('20pt') && s.images.length === 1 && s.images[0].name === 'photo' && s.images[0].layer === 'normal' && !/data-page-index|data-page-left-pt|position: absolute/.test(s.html),
    { two, images: s.images });
  await a.press('Control+z');
  await sleep(500);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait aussi la page 2 (son tableau, sa variable et son image avec elle)', s.html === original && s.count === 3, { count: s.count, same: s.html === original });

  // --- La page 3 est vide : rien ne s'ajoute, le coin d'état le dit.
  await watchStatus(app);
  await a.clickThumb(2, 900);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'la page 3, vide, n’ajoute rien : le coin d’état dit « ' + T.empty(3, 'Rapport') + ' »', s.count === 3 && s.html === original && said.includes(T.empty(3, 'Rapport')), { count: s.count, said });

  // --- Deux imports de suite se suivent ; chaque Ctrl+Z n'en défait qu'un.
  await a.clickThumb(0, 1800);
  await a.clickThumb(1, 1800);
  s = await state(app);
  check(tag + 'la page 1 puis la page 2, de suite : la deuxième se pose après la première (le curseur est sur la dernière posée), avant « Cible trois »',
    s.count === 5 && s.slides[2].blocks[0] === 'h1:Rapport annuel' && s.slides[3].blocks[0] === 'h2:Détails' && s.slides[4].blocks[0] === 'p:Cible trois' && s.cursor === 3, { count: s.count, firsts: s.slides.map(x => x.blocks[0]), cursor: s.cursor });
  await a.press('Control+z');
  await sleep(500);
  s = await state(app);
  check(tag + 'un Ctrl+Z défait le second import seul', s.count === 4 && s.slides[2].blocks[0] === 'h1:Rapport annuel' && s.slides[3].blocks[0] === 'p:Cible trois', { count: s.count, firsts: s.slides.map(x => x.blocks[0]) });
  await fresh(A, original);
  await a.clickText('Cible deux');

  // --- Une page trop longue : plusieurs diapositives, coupées là où l'éditeur couperait.
  await a.pickSource('long');
  s = await state(app);
  check(tag + '« Long », un document sans saut de page : une seule page (« ' + T.item(1, 1) + ' »)', s.field === 'Long' && sameList(s.rows.map(r => r.label), [T.item(1, 1)]), { field: s.field, rows: s.rows });
  await watchStatus(app);
  await a.clickThumb(0, 2500);
  s = await state(app);
  said = await statusSeen(app);
  const added = s.count - 3;
  const longSlides = s.slides.slice(2, 2 + added);
  check(tag + 'la page de 40 paragraphes devient plusieurs diapositives (au moins 3), posées après la 2 avant « Cible trois », tous les paragraphes y sont, dans l’ordre, chacun entier',
    added >= 3 && s.slides[1].blocks[0] === 'p:Cible deux' && s.slides[2 + added].blocks[0] === 'p:Cible trois'
      && sameList(numbers(longSlides), Array.from({ length: LONG_PARAGRAPHS }, (_, i) => i + 1)) && longSlides.every(sl => sl.blocks.length > 0 && sl.blocks.every(b => b.endsWith('est étroite.'))), { added, counts: longSlides.map(sl => sl.blocks.length) });
  check(tag + 'aucune diapositive ne dépasse de sa page (aucun point rouge sur la bande), tout le texte est à 20 pt, le coin d’état dit « ' + T.done(1, 'Long', added) + ' »',
    s.dots === 0 && longSlides.every(sl => sameList(sl.sizes, ['20pt'])) && said.includes(T.done(1, 'Long', added)), { dots: s.dots, sizes: longSlides.map(sl => sl.sizes), said });
  check(tag + 'le curseur est sur la dernière diapositive posée ; un second clic sur la même page se pose après elle',
    s.cursor === 1 + added, { cursor: s.cursor, added });
  // La coupure est celle de l'éditeur : les mêmes paragraphes mis bout à bout dans une seule diapositive se paginent aux mêmes endroits.
  const longHtml = longSlides.map(sl => sl.blocks.length);
  const mergedLong = s.html.split(/<div class="page-break-marker"[^>]*>[^<]*<\/div>/).slice(2, 2 + added).join('');
  const cutsLong = await editorCuts(app, mergedLong);
  check(tag + 'les coupures sont celles de la pagination de l’éditeur (les mêmes paragraphes mis bout à bout se coupent aux mêmes rangs)',
    sameList(cutsLong.blocks, cumulative(longHtml)), { editor: cutsLong.blocks, import: cumulative(longHtml) });
  await fresh(A, original);
  await a.clickText('Cible deux');

  // --- Un tableau trop haut se coupe entre deux lignes.
  await a.pickSource('tabl');
  await watchStatus(app);
  await a.clickThumb(0, 2500);
  s = await state(app);
  const addedTable = s.count - 3;
  const tableSlides = s.slides.slice(2, 2 + addedTable);
  check(tag + 'le titre et le tableau de 40 lignes deviennent plusieurs diapositives (au moins 2) : le titre à 44 pt en tête, une partie du tableau par diapositive, ses 40 lignes dans l’ordre, chaque ligne entière',
    addedTable >= 2 && tableSlides[0].blocks[0] === 'h1:Chiffres' && tableSlides[0].sizes.includes('44pt') && tableSlides.every(sl => sl.tables >= 1) && sameList(cellNumbers(tableSlides), Array.from({ length: TABLE_ROWS }, (_, i) => i + 1))
      && tableSlides.reduce((n, sl) => n + sl.rows, 0) === TABLE_ROWS, { added: addedTable, rows: tableSlides.map(sl => sl.rows) });
  check(tag + 'aucune diapositive ne dépasse de sa page (aucun point rouge), le curseur est sur la dernière', s.dots === 0 && s.cursor === 1 + addedTable, { dots: s.dots, cursor: s.cursor });
  const rowCounts = tableSlides.map(sl => sl.rows);
  const mergedTable = (() => {
    // Le titre et toutes les lignes, en un seul tableau : la pagination de l'éditeur le coupe entre deux lignes (`rowIndex`).
    const rows = s.html.match(/<tr\b[^>]*>.*?<\/tr>/g) || [];
    return '<h1><span style="font-size: 44pt">Chiffres</span></h1><table><tbody>' + rows.join('') + '</tbody></table>';
  })();
  const cutsTable = await editorCuts(app, mergedTable);
  const rowCuts = cutsTable.rows;
  const cumulativeRows = rowCounts.slice(0, -1).reduce((all, n) => all.concat((all.length ? all[all.length - 1] : 0) + n), []);
  check(tag + 'les coupures du tableau sont celles de la pagination de l’éditeur (mêmes rangs de lignes)', sameList(rowCuts, cumulativeRows), { editor: rowCuts, import: cumulativeRows });
  await fresh(A, original);
  await a.clickText('Cible deux');

  // --- Les pages d'un document en paysage, puis une page en portrait.
  await a.pickSource('pays');
  s = await state(app);
  check(tag + '« Paysage » : la première miniature est en paysage (A4, 1,414), la deuxième, ouverte par un saut qui dit portrait, en portrait (0,707)',
    s.pages.length === 2 && Math.abs(s.pages[0].w / s.pages[0].h - 297 / 210) < 0.01 && Math.abs(s.pages[1].w / s.pages[1].h - 210 / 297) < 0.01, s.pages);
  await a.pickSource('futu');
  s = await state(app);
  check(tag + 'une présentation comme source : la case redevient « ' + T.linked + ' », les miniatures sont des diapositives (« ' + T.slideItem(1, 1) + ' »), l’indication celle d’avant',
    s.field === 'Futur' && !!s.keep && s.keep.text === T.linked && sameList(s.rows.map(r => r.label), [T.slideItem(1, 1)]) && s.hint === T.hintSlide(2), { keep: s.keep, rows: s.rows, hint: s.hint });

  // --- Ctrl+V d'une sélection de document sur la bande : des diapositives.
  await a.press('Escape');
  await open(A, 9, 0);
  await a.clickText('Paragraphe 1 : un texte assez long pour tenir sur une ligne, et parfois deux quand la page est étroite.');
  await a.press('Control+a');
  await a.press('Control+c');
  await open(A, 7, 3);
  await a.click('.pp-slide-strip .pp-slide-thumb', 1, 400);
  await a.press('Escape');
  for (let i = 0; i < 10 && (await state(app)).focus !== 'strip'; i++) await a.press('Tab');
  await watchStatus(app);
  await a.press('Control+v');
  await sleep(2500);
  s = await state(app);
  said = await statusSeen(app);
  const pastedCount = s.count - 3;
  const pastedSlides = s.slides.slice(2, 2 + pastedCount);
  check(tag + 'Ctrl+V sur la miniature 2 d’une sélection de « Long » : elle devient plusieurs diapositives après la 2 (au moins 3), tous les paragraphes à 20 pt dans l’ordre, sans point rouge',
    pastedCount >= 3 && sameList(numbers(pastedSlides), Array.from({ length: LONG_PARAGRAPHS }, (_, i) => i + 1)) && pastedSlides.every(sl => sameList(sl.sizes, ['20pt'])) && s.dots === 0, { pastedCount, sizes: pastedSlides.map(sl => sl.sizes), dots: s.dots });
  check(tag + 'le coin d’état dit « ' + T.pasted(pastedCount) + ' » ; le clavier reste dans la bande, sur la dernière diapositive posée',
    said.includes(T.pasted(pastedCount)) && s.focus === 'strip' && s.cursor === 1 + pastedCount, { said, focus: s.focus, cursor: s.cursor });
  await a.press('Control+z');
  await sleep(600);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait le collage', s.html === original, { count: s.count });
  // Collée dans le texte d'une diapositive, la même sélection se colle comme avant : au curseur, avec les tailles du document.
  await a.clickText('Cible deux');
  await a.press('Control+v');
  await sleep(1200);
  s = await state(app);
  check(tag + 'collée dans le texte de la diapositive 2, la sélection se colle au curseur comme avant : les tailles du document (11 pt) restent, aucune diapositive n’est ajoutée par la conversion',
    s.slides[1].sizes.includes('11pt') && s.slides[1].blocks.some(b => b.startsWith('p:Paragraphe 1 :')) && s.slides.length === 3, { sizes: s.slides[1].sizes, slides: s.slides.length });
  await a.press('Control+z');
  await sleep(600);
  await fresh(A, original);
  // Une sélection copiée dans le texte de la présentation elle-même se colle sur une miniature telle quelle, comme avant : la taille choisie à la main reste, rien n'est converti.
  await open(A, 7, 3);
  await a.clickText('Cible deux');
  await a.press('Home');
  await a.press('Shift+End');
  await app.evaluate(() => { EditorCore.getEditor().chain().setFontSize('28pt').run(); });
  await a.press('Control+c');
  await a.click('.pp-slide-strip .pp-slide-thumb', 2, 400);
  await a.press('Escape');
  for (let i = 0; i < 10 && (await state(app)).focus !== 'strip'; i++) await a.press('Tab');
  await a.press('Control+v');
  await sleep(1500);
  s = await state(app);
  check(tag + 'une sélection copiée dans le texte de la présentation elle-même, collée sur une miniature, arrive telle quelle : une diapositive de plus, la taille choisie à la main (28 pt) gardée',
    s.count === 4 && s.slides[3].blocks[0] === 'p:Cible deux' && sameList(s.slides[3].sizes, ['28pt']), { count: s.count, last: s.slides[s.slides.length - 1] });
  await a.press('Control+z');
  await sleep(600);
  await fresh(A, original);
  // Une sélection qui traverse des sauts de page : une diapositive par page, sans diapositive vide entre elles.
  await open(A, 8, 0);
  await a.clickText('Bonjour à tous');
  await a.press('Control+a');
  await a.press('Control+c');
  await open(A, 7, 3);
  await a.click('.pp-slide-strip .pp-slide-thumb', 1, 400);
  await a.press('Escape');
  for (let i = 0; i < 10 && (await state(app)).focus !== 'strip'; i++) await a.press('Tab');
  await a.press('Control+v');
  await sleep(2000);
  s = await state(app);
  check(tag + 'Ctrl+V d’une sélection de « Rapport » (trois pages, la dernière vide) sur la bande : une diapositive par page pleine, dans l’ordre, aucune diapositive vide entre elles ni derrière, les tailles de la diapositive',
    s.count === 5 && s.slides[2].blocks[0] === 'h1:Rapport annuel' && s.slides[3].blocks[0] === 'h2:Détails' && sameList(s.slides[2].sizes, ['44pt', '20pt']) && s.slides[3].sizes.includes('36pt') && s.slides[4].blocks[0] === 'p:Cible trois',
    { count: s.count, firsts: s.slides.map(x => x.blocks[0]) });
  await a.press('Control+z');
  await sleep(600);
  await fresh(A, original);

  // --- GFS éteint l'extension : la liste et les miniatures du volet ouvert sont grisées, leur clic appelle `installer` sans rien changer.
  await a.clickText('Cible deux');
  await a.click('.pp-slide-import-open', 0, 800);
  s = await state(app);
  if (!s.open) await a.click('.pp-slide-import-open', 0, 800);
  await a.pickSource('rapp');
  const offHtml = (await state(app)).html;
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => (document.querySelector('.pp-slide-import-list') || { getAttribute: () => null }).getAttribute('aria-disabled') === 'true', null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  s = await state(app);
  check(tag + 'extension éteinte : le volet ouvert garde ses trois miniatures, grisées, la case est grisée et l’indication dit la raison',
    s.open && s.listDisabled === 'true' && s.rows.length === 3 && !!s.hint && s.hint !== T.hint(2) && !!s.keep && s.keep.disabled === true, { open: s.open, list: s.listDisabled, rows: s.rows.length, hint: s.hint, keep: s.keep });
  await a.clickThumb(0, 600);
  const installs = await gfsCalls(page, 'installer');
  s = await state(app);
  check(tag + 'un clic sur une miniature grisée demande à GFS d’installer « diapositives », sans fenêtre de l’app, et rien ne change',
    sameList(installs, [{ extension: 'diapositives' }]) && !(await appDialogOpen(app)) && s.html === offHtml, { installs, same: s.html === offHtml });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await app.waitForFunction(() => (document.querySelector('.pp-slide-import-list') || { getAttribute: () => null }).getAttribute('aria-disabled') === 'false', null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  s = await state(app);
  check(tag + 'extension rallumée : les miniatures et la case se dégrisent, l’indication revient', s.listDisabled === 'false' && !!s.keep && s.keep.disabled === false && s.hint === T.hint(2), { list: s.listDisabled, keep: s.keep, hint: s.hint });

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
