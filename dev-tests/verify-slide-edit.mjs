#!/usr/bin/env node
// « MODIFIER LA DIAPO » : ROUVRIR LE VOLET « INSÉRER DEPUIS » SUR UNE DIAPOSITIVE DÉJÀ POSÉE DANS UN DOCUMENT (20/11, « quand on ajoute une diapo dans un document depuis un slides, j'aimerais que l'on puisse changer
// nos choix après (live, mode texte/bloc etc.) : quand on clique sur la diapo importée, ça devrait rouvrir le menu » ; carte « Comment rouvrir les choix d'une diapo insérée ? » : « Double clic et bouton de la
// barre »). js/slide-copies.js (`editTargetAt`, `rangeOf`, `edit`), la barre flottante de la diapositive (js/floating-toolbars.js : « Modifier la diapo », et son double clic), le volet (extensions/diapositives/
// slide-import.js : `openFor`, `replacing`) et l'attribut `slideFrom` du bloc (js/editor-nodes.js).
// L'app hébergée par GFS (extension « diapositives »), 700x400, français clair puis anglais sombre. « Devis » (un document) est à l'écran ; « Offre » (trois diapositives) et « Autre » (deux) sont des présentations.
//  UN BLOC SANS LIEN retient sa diapositive d'origine (`slideFrom`) ; le sélectionner montre une barre (« Diapositive de « Offre » », « Modifier la diapo », ni mise à jour ni « Détacher ») ; un double clic sur son image
//    et le bouton rouvrent le volet : « Offre » choisie, sa diapositive entourée, « En bloc » choisi, « Garder liée » décochée, l'indication dit qu'un clic remplace ; le clic sur une autre miniature REMPLACE le bloc
//    à sa place (même taille), en UN seul Ctrl+Z qui le rend ; le volet insère de nouveau au curseur ensuite ;
//  UNE COPIE EN TEXTE LIÉE : le curseur dans la copie, la barre propose « Modifier la diapo » avec « Mettre à jour » et « Détacher » ; le bouton rouvre le volet (« En texte », « Garder liée » cochée, sa diapositive
//    entourée) ; le clic sur une autre miniature remplace la copie et son repère par la nouvelle, liée, en un Ctrl+Z ;
//  CHANGER LE CHOIX : une copie liée devient un bloc sans lien (« En bloc », « Garder liée » décochée) ; un bloc devient du texte lié ; la copie liée devient du texte seul : dans chaque cas l'ancienne est partie et
//    la nouvelle est là, en un Ctrl+Z ;
//  UNE AUTRE PRÉSENTATION : en modifiant, choisir « Autre » dans la liste et une de ses diapositives remplace aussi ;
//  UN BLOC D'AVANT (sans origine) : la barre le montre, le volet s'ouvre sans diapositive entourée ; la diapositive à remplacer retirée du document pendant que le volet attend : le clic dit qu'elle n'y est plus et ne pose rien.
// Lancé par run-headless.mjs (groupe Node « slideEdit », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-edit.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-edit', port: Number(process.env.SLIDE_EDIT_PORT || 9149) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Devis', '<p>Bonjour,</p><p>Cordialement</p>', false, 'document');
  add(8, 'Offre', '<h1>Un</h1><p>Texte un</p>${BR}<h1>Deux</h1><p>Texte deux</p>${BR}<h1>Trois</h1><p>Texte trois</p>', false, 'presentation');
  add(9, 'Autre', '<h1>Alpha</h1><p>Texte alpha</p>${BR}<h1>Beta</h1><p>Texte beta</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 10;
`;
const INIT = `try { localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) {}`;
const TEXTS = {
  fr: { edit: 'Modifier la diapo', barFree: 'Diapositive de « Offre »', barOld: 'Diapositive posée en bloc', bar: n => `Suit la diapositive ${n} de « Offre »`, hint: 'Un clic sur une diapositive remplace celle du document, à sa place.', gone: 'La diapositive à modifier n’est plus dans le document : rien n’a été remplacé.' },
  en: { edit: 'Edit slide', barFree: 'Slide from “Offre”', barOld: 'Slide placed as a block', bar: n => `Follows slide ${n} of “Offre”`, hint: 'Click a slide to replace the one in the document, in place.', gone: 'The slide to edit is no longer in the document: nothing was replaced.' },
};

// Le document : ses blocs de premier niveau, résumés (« paragraph:texte », « image{texte|origine|lien|largeur} », « tag{diapositive} »).
const doc = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const out = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'paragraph' && node.childCount === 1 && node.firstChild.type.name === 'editorImage') {
      const a = node.firstChild.attrs;
      out.push('image{' + [a.slideText || '', a.slideFrom ? a.slideFrom.model + ':' + a.slideFrom.rank : '-', a.slideLink ? 'lié' : '-', a.width].join('|') + '}');
    } else if (node.type.name === 'slideLink') out.push('tag{' + node.attrs.linkModel + ':' + (node.attrs.linkSlide ? 'ok' : '-') + '}');
    else out.push(node.type.name + ':' + node.textContent);
  });
  return out;
});
const imageAttrs = page => page.evaluate(() => { let found = null; EditorCore.getEditor().state.doc.descendants((n) => { if (!found && n.type.name === 'editorImage') found = Object.assign({}, n.attrs, { src: null, slideWords: null }); }); return found; });
const tagSlides = page => page.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.forEach((n) => { if (n.type.name === 'slideLink') out.push(n.attrs.linkSlide); }); return out; });
const bar = page => page.evaluate(() => {
  const el = document.querySelector('.v2-copy-toolbar');
  const rect = node => { if (!node || node.hidden) return null; const r = node.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; };
  return {
    shown: !!el && getComputedStyle(el).display !== 'none' && !!el.getClientRects().length,
    name: el ? (el.querySelector('.v2-copy-name') || {}).textContent : null,
    edit: rect(el && el.querySelector('.v2-copy-edit')), editText: el && el.querySelector('.v2-copy-edit') ? el.querySelector('.v2-copy-edit').textContent.trim() : null,
    refresh: rect(el && el.querySelector('.v2-copy-refresh')), detach: rect(el && el.querySelector('.v2-copy-detach')),
    width: window.innerWidth,
  };
});
const panel = page => page.evaluate(() => {
  const p = document.querySelector('.pp-slide-import');
  const open = !!p && !p.hidden;
  const items = Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-item'));
  return {
    open, source: open ? document.getElementById('pp-slide-import-source').value : null,
    current: items.map((item, i) => (item.classList.contains('pp-slide-current') ? i : -1)).filter(i => i >= 0),
    kindBlock: !!document.querySelector('.pp-slide-import-kind-btn[aria-checked="true"]') && document.querySelectorAll('.pp-slide-import-kind-btn')[0].getAttribute('aria-checked') === 'true',
    linked: open ? document.getElementById('pp-slide-import-keep').checked : null,
    hint: (document.getElementById('pp-slide-import-hint') || {}).textContent || '',
    rows: items.length,
    status: document.getElementById('status-msg').textContent,
  };
});
const status = page => page.evaluate(() => document.getElementById('status-msg').textContent);
// Le volet « Insérer depuis », ouvert comme la ligne du menu : sur « Offre » (ou `id`), « En bloc » ou « En texte », « Garder liée » cochée ou non.
const openPanel = (page, { id = '8', block = true, linked = false } = {}) => page.evaluate(async ({ id, block, linked }) => {
  await SlidesEntry.openTextImport(false);
  const select = document.getElementById('pp-slide-import-source');
  select.value = id;
  select.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 400));
  document.querySelectorAll('.pp-slide-import-kind-btn')[block ? 0 : 1].click();
  const keep = document.getElementById('pp-slide-import-keep');
  if (keep.checked !== linked) keep.click();
  await new Promise(r => setTimeout(r, 200));
}, { id, block, linked });
const clickThumb = async (page, index, settle = 1500) => {
  await page.evaluate(i => document.querySelectorAll('.pp-slide-import .pp-slide-item')[i].click(), index);
  await sleep(settle);
};
const setSource = async (page, id) => {
  await page.evaluate((value) => { const select = document.getElementById('pp-slide-import-source'); select.value = value; select.dispatchEvent(new Event('change')); }, id);
  await sleep(500);
};
const closePanel = page => page.evaluate(() => SlideImport.close(false, true));
const cursorAfter = (page, text) => page.evaluate((whole) => {
  const editor = EditorCore.getEditor();
  let at = -1;
  editor.state.doc.descendants((node, pos) => { if (at < 0 && node.isTextblock && node.textContent === whole) at = pos + node.nodeSize - 1; });
  editor.chain().focus().setTextSelection(at).run();
}, text);
const mouse = {
  click: async (page, c, double = false) => { await page.mouse.move(c.x - 6, c.y - 6); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(120); if (double) await page.mouse.dblclick(c.x, c.y); else await page.mouse.click(c.x, c.y); await sleep(700); },
};
const imageCenter = page => page.evaluate(() => { const img = document.querySelector('#editor-container img.editor-image'); if (!img) return null; img.scrollIntoView({ block: 'center' }); const r = img.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const textCenter = (page, text) => page.evaluate((whole) => {
  const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
  if (!block) return null;
  block.scrollIntoView({ block: 'center' });
  const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, node.textContent.length);
  const r = range.getBoundingClientRect();
  return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 };
}, text);
// Le curseur dans le paragraphe `text`, à la souris : la page finit de défiler avant le clic (une image qui se pose décale le texte), et le clic est refait tant que le curseur n'y est pas.
const selectText = async (page, text) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    await textCenter(page, text);
    await sleep(350);
    const c = await textCenter(page, text);
    await mouse.click(page, c);
    await sleep(200);
    if ((await page.evaluate(() => EditorCore.getEditor().state.selection.$head.parent.textContent)) === text) return c;
  }
  return null;
};
const undo = async (page) => { await page.evaluate(() => EditorCore.getEditor().commands.focus()); await page.keyboard.press('Control+z'); await sleep(500); };

for (const [lang, scheme] of [['fr', 'light'], ['en', 'dark']]) {
  const X = TEXTS[lang];
  const tag = lang + ' : ';
  const A = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'], langue: lang }, seed: SEED, lang, colorScheme: scheme, init: INIT });
  const { page } = A;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && !!EditorCore.getEditor(), null, { timeout: 15000 });
  await sleep(800);

  // --- Un bloc sans lien : « Deux » (diapositive 2) posé après « Bonjour, ».
  await cursorAfter(page, 'Bonjour,');
  await openPanel(page, { block: true, linked: false });
  await clickThumb(page, 1, 2500);
  let d = await doc(page);
  const first = await imageAttrs(page);
  check(tag + 'un bloc sans lien est posé (« Texte deux ») et retient sa diapositive d’origine (« Offre », rang 1)', d.some(b => b.startsWith('image{') && b.includes('Texte deux') && b.includes('|8:1|-|')) && !!first && first.slideFrom && String(first.slideFrom.model) === '8' && first.slideFrom.rank === 1, { d, from: first && first.slideFrom });
  await closePanel(page);
  await sleep(300);

  // --- Le bloc sélectionné (un clic à la souris) : sa barre.
  let c = await imageCenter(page);
  await mouse.click(page, c);
  let b = await bar(page);
  check(tag + 'le bloc sélectionné : la barre dit « ' + X.barFree + ' » et propose « ' + X.edit + ' », sans mise à jour ni « Détacher »', b.shown && b.name === X.barFree && !!b.edit && b.editText === X.edit && !b.refresh && !b.detach, b);
  check(tag + 'la barre tient dans la fenêtre', b.shown && b.edit && b.edit.x + b.edit.w / 2 <= b.width, b);

  // --- Le double clic sur l'image : le volet s'ouvre sur sa diapositive.
  c = await imageCenter(page);
  await mouse.click(page, c, true);
  let p = await panel(page);
  check(tag + 'un double clic sur l’image rouvre le volet : « Offre » choisie, la diapositive 2 entourée, « En bloc », « Garder liée » décochée', p.open && p.source === '8' && p.current.join() === '1' && p.kindBlock && p.linked === false, p);
  check(tag + 'l’indication dit qu’un clic remplace : « ' + X.hint + ' »', p.hint === X.hint, p.hint);

  // --- Un clic sur la miniature 1 : le bloc est REMPLACÉ à sa place, même taille, un seul Ctrl+Z.
  const before = await doc(page);
  await clickThumb(page, 0, 2500);
  d = await doc(page);
  const after = await imageAttrs(page);
  check(tag + 'le clic sur la diapositive 1 remplace le bloc : « Texte un » à la place de « Texte deux », un seul bloc, au même endroit', d.length === before.length && d.filter(x => x.startsWith('image{')).length === 1 && d.findIndex(x => x.startsWith('image{')) === before.findIndex(x => x.startsWith('image{')) && d.some(x => x.includes('Texte un')) && !d.some(x => x.includes('Texte deux')), { before, d });
  check(tag + 'le nouveau bloc retient SA diapositive (rang 0) et garde la taille du précédent', !!after && after.slideFrom && after.slideFrom.rank === 0 && after.width === first.width, { after: after && after.slideFrom, width: after && after.width, was: first.width });
  p = await panel(page);
  check(tag + 'le volet insère de nouveau au curseur : plus d’entourage, l’indication d’avant', p.current.length === 0 && p.hint !== X.hint, p);
  await undo(page);
  d = await doc(page);
  check(tag + 'un seul Ctrl+Z rend le bloc d’avant (« Texte deux »)', d.some(x => x.includes('Texte deux')) && !d.some(x => x.includes('Texte un')) && d.filter(x => x.startsWith('image{')).length === 1, d);
  await closePanel(page);

  // --- Une copie en texte liée : la diapositive 3, posée après « Cordialement ».
  await cursorAfter(page, 'Cordialement');
  await openPanel(page, { block: false, linked: true });
  await clickThumb(page, 2, 2500);
  d = await doc(page);
  check(tag + 'la copie liée de la diapositive 3 est posée (« Trois », « Texte trois » et son repère)', d.includes('paragraph:Texte trois') && d.some(x => x.startsWith('tag{8:ok')), d);
  await closePanel(page);
  const tag3 = (await tagSlides(page))[0];
  c = await selectText(page, 'Texte trois');
  b = await bar(page);
  check(tag + 'le curseur dans la copie : la barre dit « ' + X.bar(3) + ' » avec « ' + X.edit + ' », la mise à jour et « Détacher »', b.shown && b.name === X.bar(3) && !!b.edit && !!b.refresh && !!b.detach, b);

  // --- Le bouton de la barre : le volet s'ouvre sur la copie, ses choix repris.
  await mouse.click(page, b.edit);
  p = await panel(page);
  check(tag + 'le bouton « ' + X.edit + ' » rouvre le volet : « Offre », la diapositive 3 entourée, « En texte », « Garder liée » cochée', p.open && p.source === '8' && p.current.join() === '2' && !p.kindBlock && p.linked === true, p);
  await clickThumb(page, 0, 2500);
  d = await doc(page);
  const tags = await tagSlides(page);
  check(tag + 'le clic sur la diapositive 1 remplace la copie et son repère : « Texte un » liée, plus « Texte trois », un seul repère, différent', d.includes('paragraph:Texte un') && !d.includes('paragraph:Texte trois') && tags.length === 1 && !!tags[0] && tags[0] !== tag3, { d, tags, was: tag3 });
  await undo(page);
  d = await doc(page);
  check(tag + 'un seul Ctrl+Z rend la copie d’avant avec son repère', d.includes('paragraph:Texte trois') && !d.includes('paragraph:Texte un') && (await tagSlides(page))[0] === tag3, d);
  await closePanel(page);

  // --- Changer le choix : la copie liée devient un bloc sans lien.
  c = await selectText(page, 'Texte trois');
  b = await bar(page);
  await mouse.click(page, b.edit);
  await page.evaluate(() => { document.querySelectorAll('.pp-slide-import-kind-btn')[0].click(); const keep = document.getElementById('pp-slide-import-keep'); if (keep.checked) keep.click(); });
  await sleep(300);
  await clickThumb(page, 1, 2500);
  d = await doc(page);
  check(tag + 'la copie liée devient un bloc sans lien (diapositive 2) : plus de texte ni de repère, un bloc « Texte deux »', !d.includes('paragraph:Texte trois') && !d.some(x => x.startsWith('tag{')) && d.some(x => x.startsWith('image{') && x.includes('Texte deux') && x.includes('|-|')), d);
  await undo(page);
  d = await doc(page);
  check(tag + 'un seul Ctrl+Z rend la copie liée', d.includes('paragraph:Texte trois') && d.some(x => x.startsWith('tag{8:ok')), d);
  await closePanel(page);

  // --- Une copie liée devient du texte seul (sans repère).
  c = await selectText(page, 'Texte trois');
  b = await bar(page);
  await mouse.click(page, b.edit);
  await page.evaluate(() => { const keep = document.getElementById('pp-slide-import-keep'); if (keep.checked) keep.click(); });
  await sleep(300);
  await clickThumb(page, 0, 1500);
  d = await doc(page);
  check(tag + 'la copie liée devient du texte seul : « Texte un » sans repère, plus de « Texte trois »', d.includes('paragraph:Texte un') && !d.includes('paragraph:Texte trois') && !d.some(x => x.startsWith('tag{')), { d, status: await status(page), panel: await panel(page) });
  await undo(page);
  d = await doc(page);
  check(tag + 'un seul Ctrl+Z rend la copie liée', d.includes('paragraph:Texte trois') && d.some(x => x.startsWith('tag{8:ok')), d);
  await closePanel(page);

  // --- Une autre présentation : en modifiant, « Autre » et sa diapositive 2.
  c = await selectText(page, 'Texte trois');
  b = await bar(page);
  await mouse.click(page, b.edit);
  await setSource(page, '9');
  p = await panel(page);
  check(tag + 'en changeant de présentation (« Autre ») la diapositive entourée disparaît : ce n’est pas la sienne', p.source === '9' && p.current.length === 0 && p.rows === 2, p);
  await clickThumb(page, 1, 2500);
  d = await doc(page);
  check(tag + 'la diapositive 2 d’« Autre » remplace la copie d’« Offre » (« Texte beta », un repère vers « Autre »)', d.includes('paragraph:Texte beta') && !d.includes('paragraph:Texte trois') && d.some(x => x.startsWith('tag{9:ok')), d);
  await closePanel(page);
}

// --- Un bloc d'avant (sans origine) et la diapositive retirée, une fois, en français.
{
  const lang = 'fr';
  const X = TEXTS[lang];
  const A = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'], langue: lang }, seed: SEED, lang, colorScheme: 'light', init: INIT });
  const { page } = A;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && !!EditorCore.getEditor(), null, { timeout: 15000 });
  await sleep(800);
  // Un bloc comme ceux d'avant cette fonction : une image qui garde le texte de sa diapositive, sans `slideFrom` ni lien.
  await page.evaluate(() => {
    const editor = EditorCore.getEditor();
    const node = editor.schema.nodes.paragraph.create(null, [editor.schema.nodes.editorImage.create({ src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'Diapositive', width: '300px', slideText: 'Texte deux' })]);
    let at = -1;
    editor.state.doc.forEach((n, pos) => { if (at < 0 && n.textContent === 'Bonjour,') at = pos + n.nodeSize; });
    editor.view.dispatch(editor.state.tr.insert(at, node));
  });
  await sleep(500);
  let c = await imageCenter(page);
  await mouse.click(page, c);
  let b = await bar(page);
  check('un bloc d’avant (sans origine) : la barre dit « ' + X.barOld + ' » et propose « ' + X.edit + ' »', b.shown && b.name === X.barOld && !!b.edit, b);
  await mouse.click(page, b.edit);
  let p = await panel(page);
  check('le volet s’ouvre sans diapositive entourée (l’origine est inconnue) : on désigne la diapositive dans la liste', p.open && p.current.length === 0, p);
  await setSource(page, '8');
  // Le bloc est retiré du document pendant que le volet attend : le clic le dit et ne pose rien.
  await page.evaluate(() => {
    const editor = EditorCore.getEditor();
    let found = null;
    editor.state.doc.forEach((n, pos) => { if (!found && n.firstChild && n.firstChild.type.name === 'editorImage') found = { from: pos, to: pos + n.nodeSize }; });
    editor.view.dispatch(editor.state.tr.delete(found.from, found.to));
  });
  const was = await doc(page);
  await clickThumb(page, 0, 1500);
  const now = await doc(page);
  check('la diapositive à remplacer n’est plus dans le document : le clic dit « ' + X.gone + ' » et ne pose rien', now.join('|') === was.join('|') && (await status(page)).includes(X.gone), { was, now, status: await status(page) });
}

await t.finish();
