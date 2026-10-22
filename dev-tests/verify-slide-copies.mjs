#!/usr/bin/env node
// La copie en texte d'une diapositive, qui reste liée à elle (js/slide-copies.js ; la case « Garder liée » du volet « Diapositive d'une présentation… » de extensions/diapositives/slide-import.js ; la barre
// flottante « Détacher » de js/floating-toolbars.js ; demande du 22/10, lot 3 : cartes « Sens unique : la copie suit la source » et « Celle d'arrivée, avec une case »), à la vraie souris et au vrai clavier,
// 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS, l'extension « diapositives » active, un DOCUMENT « Devis » à l'écran et la présentation
// « Offre » (trois diapositives : un titre, un texte et une liste ; un titre et un texte ; une vide).
//  LE VOLET : en texte, deux cases sous la source, « Garder liée » puis « Garder la mise en forme d'origine », décochées, actives et lisibles (≥ 4,5:1) ; l'indication dit ce qu'un clic fait ; à 700x400 la
//   première miniature tient entière dans le volet.
//  POSER : un clic sur la miniature 1, « Garder liée » cochée, pose le texte de la diapositive après le paragraphe du curseur, suivi de son repère (de hauteur nulle : la source, la diapositive, « Suit la source »,
//   le nombre de blocs), d'un seul Annuler ; la source reçoit le numéro de sa diapositive, son texte ne change pas ; un trait d'accent borde chaque bloc de la copie (une décoration : rien n'en reste dans le
//   HTML) ; la même diapositive une seconde fois arrive en copie simple (un lien par diapositive et par document).
//  LA BARRE : le curseur dans la copie, la barre dit « Suit la diapositive 1 de « Offre » » et propose « Détacher », dans la fenêtre ; hors de la copie, elle se retire.
//  LE VERROU : taper, supprimer, couper la fin ou coller dans la copie est refusé (le texte ne change pas, le coin d'état dit pourquoi, une fois) ; le texte autour s'écrit ; un geste qui emporte toute la
//   copie avec son repère passe, et un Ctrl+Z la rend.
//  LA SYNCHRO : « Offre » changée ailleurs, la copie prend la nouvelle diapositive à la lecture suivante de l'enregistrement automatique (le curseur reste où il est, le document n'est pas « à enregistrer »,
//   Ctrl+Z ne la rend pas) ; une diapositive plus longue, plus courte ou vide change le nombre de blocs ; le verrou suit le nouveau texte.
//  LES SORTIES : la Lecture et les sorties (SlidesEntry.outputHtml) n'ont pas le repère ; un document fermé dont la diapositive a changé depuis son enregistrement prend la nouvelle (SlideCopies.forOutput).
//  DÉTACHER : le clic sur « Détacher » ôte le repère : le texte reste, s'écrit de nouveau, plus de trait, et un Ctrl+Z rend le lien ; sa diapositive perdue : la barre le dit et « Détacher » libère ; sa
//   présentation supprimée : la copie reste, libre.
//  LA MISE EN FORME D'ORIGINE : avec les deux cases, la copie garde les tailles de la diapositive, et les garde à chaque synchro.
// Lancé par run-headless.mjs (groupe Node "slideCopies", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-copies.mjs (SLIDE_COPIES_ONLY=fr ou en : une seule des deux parties)
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-copies', port: Number(process.env.SLIDE_COPIES_PORT || 8978) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
// SLIDE_COPIES_ONLY=fr | en : une seule partie (la mise au point) ; SLIDE_COPIES_SHOTS=<dossier> : des captures de la page parente.
const ONLY = process.env.SLIDE_COPIES_ONLY || '';
const SHOTS = process.env.SLIDE_COPIES_SHOTS || '';
const shot = async (tab, name) => { if (SHOTS) { await mkdir(SHOTS, { recursive: true }); await tab.page.screenshot({ path: join(SHOTS, name + '.png') }); } };

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const size = (pt, text) => `<span style="font-size: ${pt}pt">${text}</span>`;
// 7 « Devis » : un document de deux paragraphes ; 8 « Offre » : trois diapositives, la première avec un titre à 44 pt, un texte dont un mot est en gras et une liste ; la deuxième avec un titre à 36 pt et
// un texte ; la troisième vide ; 9 « Devis assemblé » : un macro-modèle qui prend « Devis ». Les modèles de départ (seedModels) : des documents, un e-mail, un macro-modèle et une présentation, « Futur ».
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Devis', '<p>Bonjour,</p><p>Cordialement</p>', false, 'document');
  add(8, 'Offre', '<h1>${size(44, 'Notre offre')}</h1><p>${size(20, 'Un texte ')}<strong>${size(20, 'gras')}</strong></p><ul><li><p>${size(20, 'Rapide')}</p></li></ul>${BR}<h2>${size(36, 'Deux')}</h2><p>${size(20, 'Suite')}</p>${BR}<p></p>', false, 'presentation');
  add(9, 'Devis assemblé', JSON.stringify({ slots: [{ type: 'fixed', modeleId: 7 }] }), false, 'macro');
  stub.state.nextRowId.Publipostage_Modeles = 10;
`;
const COPY = ['heading:Notre offre', 'paragraph:Un texte gras', 'bulletList:Rapide'];
const TEXTS = {
  fr: {
    link: 'Garder liée', format: 'Garder la mise en forme d’origine',
    linkTip: 'Le texte reste lié à la diapositive : il la suit quand elle change et ne s’écrit plus ici, jusqu’à « Détacher ».',
    hint: 'Un clic sur une diapositive l’insère en texte à l’endroit du curseur.',
    hintLinked: 'Un clic sur une diapositive l’insère en texte à l’endroit du curseur, liée à la diapositive.',
    hintLinkedKeep: 'Un clic sur une diapositive l’insère en texte à l’endroit du curseur, liée, avec la mise en forme de la diapositive.',
    done: (n, name) => `Diapositive ${n} de « ${name} » insérée en texte, liée à sa source.`,
    already: (n, name) => `La diapositive ${n} de « ${name} » est déjà liée ici : elle arrive en copie.`,
    pulled: name => `Le texte lié à « ${name} » a pris la dernière version de sa diapositive.`,
    locked: name => `Ce texte suit « ${name} » : il ne s’écrit pas ici. Détachez-le pour le modifier.`,
    bar: (n, name) => `Suit la diapositive ${n} de « ${name} »`, barGone: 'Sa diapositive d’origine n’existe plus',
    detach: 'Détacher', detached: 'Texte détaché : il ne suit plus sa diapositive.',
  },
  en: {
    link: 'Keep linked', format: 'Keep the original formatting',
    linkTip: 'The text stays linked to the slide: it follows it when it changes and can’t be edited here until you detach it.',
    hint: 'Click a slide to insert it as text at the cursor.',
    hintLinked: 'Click a slide to insert it as text at the cursor, linked to the slide.',
    hintLinkedKeep: 'Click a slide to insert it as text at the cursor, linked, with the slide’s formatting.',
    done: (n, name) => `Slide ${n} from “${name}” inserted as text, linked to its source.`,
    already: (n, name) => `Slide ${n} from “${name}” is already linked here: it arrives as a copy.`,
    pulled: name => `The text linked to “${name}” took the latest version of its slide.`,
    locked: name => `This text follows “${name}”: it can’t be edited here. Detach it to edit it.`,
    bar: (n, name) => `Follows slide ${n} of “${name}”`, barGone: 'Its original slide no longer exists',
    detach: 'Detach', detached: 'Text detached: it no longer follows its slide.',
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
  };
  return { click, clickRow, openMenu, leaveMenu, clickThumb, showThumb, clickText, press, pickSource, reach, inPage, centerOf };
}

// Le document ouvert : ses blocs (type et texte), les repères de copie qu'il porte (leurs attributs), son HTML et les repères qu'il y écrit, ses tailles de texte ; le curseur ; où est le clavier ; le coin
// d'état. Puis le trait d'accent (les blocs qu'il borde, son ombre, la hauteur du repère), la barre flottante de la copie, le volet (ouvert ou non, la source, l'indication, les deux cases, la première
// miniature). Lu dans le cadre de l'app.
const state = app => app.evaluate(() => {
  const editor = EditorCore.getEditor();
  const doc = editor.state.doc;
  const blocks = [];
  const tags = [];
  doc.forEach((node) => { blocks.push(node.type.name + ':' + node.textContent); if (node.type.name === 'slideLink') tags.push(Object.assign({}, node.attrs)); });
  const html = editor.getHTML();
  const markers = Array.from(HtmlSanitize.parseInert(html).querySelectorAll('div.pp-slide-link')).map(el => ({ span: el.getAttribute('data-link-span'), mode: el.getAttribute('data-link-mode'), keep: el.getAttribute('data-link-keep'), slide: el.getAttribute('data-link-slide') }));
  const active = document.activeElement;
  let focus = null;
  if (active && active.closest('.ProseMirror')) focus = 'editor';
  else if (active && active.closest('.pp-slide-import .pp-slide-item')) focus = 'thumb';
  else if (active && active.closest('.pp-slide-import')) focus = 'panel';
  else if (active) focus = active.id || active.className || active.tagName;
  const { $from } = editor.state.selection;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const labelOf = (id) => {
    const box = document.getElementById(id);
    const label = box && box.closest('label');
    if (!label || label.hidden) return null;
    return { text: label.textContent.trim(), checked: box.checked, disabled: box.disabled, title: label.title, top: label.getBoundingClientRect().top };
  };
  const panel = document.querySelector('.pp-slide-import');
  const trigger = document.querySelector('.pp-slide-import .ss-trigger');
  const hint = document.querySelector('.pp-slide-import-hint');
  const marks = Array.from(document.querySelectorAll('#editor-container .tiptap > .pp-copy-mark'));
  const marker = document.querySelector('#editor-container .tiptap > div.pp-slide-link');
  const bar = document.querySelector('.v2-copy-toolbar');
  const barShown = !!bar && bar.classList.contains('visible') && bar.getBoundingClientRect().width > 0;
  return {
    blocks, tags, markers, html,
    sizes: html.match(/font-size: [0-9.]+pt/g) || [],
    cursor: { block: $from.parent.textContent, atStart: $from.parentOffset === 0, atEnd: $from.parentOffset === $from.parent.content.size },
    focus,
    status: document.getElementById('status-msg').textContent,
    marks: marks.map(el => el.textContent),
    shadow: marks.length ? getComputedStyle(marks[0]).boxShadow : '',
    markerHeight: marker ? marker.getBoundingClientRect().height : null,
    bar: barShown ? { text: bar.querySelector('.v2-copy-name').textContent, button: bar.querySelector('.v2-copy-detach').textContent.trim(), rect: rect(bar), tip: bar.querySelector('.v2-copy-detach').title } : null,
    inner: { width: window.innerWidth, height: window.innerHeight },
    open: !!panel && !panel.hidden,
    panel: rect(panel && !panel.hidden ? panel : null),
    field: trigger ? trigger.textContent.trim() : null,
    hint: hint && !hint.hidden ? hint.textContent : '',
    link: labelOf('pp-slide-import-keep'),
    format: labelOf('pp-slide-import-format'),
    thumb0: rect(document.querySelector('.pp-slide-import .pp-slide-item')),
    rows: document.querySelectorAll('.pp-slide-import .pp-slide-item').length,
  };
});
const inWindow = (r, inner) => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= inner.width + 0.5 && r.bottom <= inner.height + 0.5;
// La ligne `id` du faux Grist : son texte, et le nombre d'écritures de la table.
const stored = (app, id) => app.evaluate(n => ({ html: (window.__gristStub.getRow('Publipostage_Modeles', n) || {}).Contenu || '', saves: window.__gristStub.countSaves('Publipostage_Modeles') }), id);
// Le texte d'un HTML de modèle, sans ses repères.
const textOf = (app, html) => app.evaluate((h) => { const body = HtmlSanitize.parseInert(h); body.querySelectorAll('div.pp-slide-link').forEach(el => el.remove()); return body.textContent; }, html);
// La ligne `id` réécrite ailleurs (une autre personne, un autre onglet) : `from` remplacé par `to` dans son texte, sa date changée. Vrai si `from` y était.
const rewrite = (app, id, from, to) => app.evaluate(([n, a, b]) => {
  const stub = window.__gristStub;
  const html = stub.getRow('Publipostage_Modeles', n).Contenu;
  stub.remoteWrite('Publipostage_Modeles', n, { Contenu: html.split(a).join(b), DateModif: new Date().toISOString() });
  return html.includes(a);
}, [id, from, to]);
// La ligne `id` remise telle qu'elle était (`html`), sa date changée.
const restore = (app, id, html) => app.evaluate(([n, h]) => { window.__gristStub.remoteWrite('Publipostage_Modeles', n, { Contenu: h, DateModif: new Date().toISOString() }); }, [id, html]);
// Attend que le texte du document (hors repères) contienne `text` (ou ne le contienne plus) : la synchro d'une copie arrive à la lecture suivante de l'enregistrement automatique.
const waitDoc = (app, text, present = true, timeout = 20000) => app.waitForFunction(([needle, want]) => EditorCore.getEditor().state.doc.textContent.includes(needle) === want, [text, present], { timeout }).then(() => true, () => false);

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
// Ctrl+S, et l'attente de l'écriture dans le faux Grist : un modèle qu'on quitte avec des changements non enregistrés demanderait d'abord « Quitter sans enregistrer ? ».
const saved = async (tab) => {
  const before = await tab.app.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
  await tab.page.keyboard.press('Control+s');
  await tab.app.waitForFunction(n => window.__gristStub.countSaves('Publipostage_Modeles') > n, before, { timeout: 8000 }).catch(() => {});
  await sleep(300);
};
// Le document de départ, remis tel qu'il était (et enregistré), pour que chaque partie parte du même texte.
const fresh = async (tab, html) => { await tab.app.evaluate(h => Editor.setHTML(h), html); await sleep(300); await saved(tab); };

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  // La langue est celle de GFS (consigne 019), que son contexte donne au cadre.
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { page, app } = A;
  const a = toolsOf(A);
  // Le curseur au bout d'un texte : le clic de `clickText` tombe juste avant sa dernière lettre, la touche Fin le porte au bout.
  const atEnd = async (text) => { await a.clickText(text); await page.keyboard.press('End'); await sleep(150); };
  await open(A, 7, 0, false);
  await a.clickText('Bonjour,');
  const original = (await state(app)).html;

  // --- Le volet : deux cases sous la source, décochées, lisibles.
  await a.clickRow('v2-btn-slide-text', 900);
  // Le menu s'ouvre au survol et recouvre le début du champ tant que la souris est dessus : la main le quitte avant de viser le champ.
  await a.leaveMenu();
  await a.pickSource('offre');
  let s = await state(app);
  check(tag + 'sous la source « Offre », deux cases dans cet ordre : « ' + T.link + ' » puis « ' + T.format + ' », décochées et actives ; l’info-bulle de la première dit ce que le lien fait',
    s.field === 'Offre' && !!s.link && !!s.format && s.link.text === T.link && s.format.text === T.format && !s.link.checked && !s.format.checked && !s.link.disabled && !s.format.disabled && s.link.top < s.format.top && s.link.title === T.linkTip,
    { field: s.field, link: s.link, format: s.format });
  check(tag + 'l’indication dit ce qu’un clic fait, sans lien : « ' + T.hint + ' »', s.hint === T.hint, s.hint);
  const ratios = [await contrastOf(app, '#pp-slide-import-keep + span'), await contrastOf(app, '#pp-slide-import-format + span')];
  check(tag + 'le texte des deux cases se lit (contraste ≥ 4,5:1)', ratios.every(r => r >= 4.5), ratios);
  check(tag + 'à 700x400 la première miniature tient entière dans le volet, sous les deux cases', !!s.thumb0 && !!s.panel && s.thumb0.top >= s.panel.top - 0.5 && s.thumb0.bottom <= s.panel.bottom + 0.5, { thumb0: s.thumb0, panel: s.panel });
  await shot(A, lang + '-' + colorScheme + '-1-volet');
  await a.click('#pp-slide-import-keep', 0, 300);
  s = await state(app);
  check(tag + 'cochée, « ' + T.link + ' » change l’indication : « ' + T.hintLinked + ' »', !!s.link && s.link.checked && s.hint === T.hintLinked, { link: s.link, hint: s.hint });
  await a.click('#pp-slide-import-format', 0, 300);
  s = await state(app);
  check(tag + 'avec la mise en forme d’origine en plus : « ' + T.hintLinkedKeep + ' »', !!s.format && s.format.checked && s.hint === T.hintLinkedKeep, { format: s.format, hint: s.hint });
  await a.click('#pp-slide-import-format', 0, 300);
  s = await state(app);
  check(tag + 'décochée de nouveau, l’indication revient à « ' + T.hintLinked + ' »', !!s.format && !s.format.checked && s.hint === T.hintLinked, { format: s.format, hint: s.hint });

  // --- Poser : la miniature 1, après « Bonjour, ».
  await watchStatus(app);
  const sourceBefore = await stored(app, 8);
  await a.clickThumb(0, 2000);
  s = await state(app);
  let said = await statusSeen(app);
  await shot(A, lang + '-' + colorScheme + '-2-copie');
  const afterOne = ['paragraph:Bonjour,'].concat(COPY, ['slideLink:', 'paragraph:Cordialement']);
  const afterOneHtml = s.html;
  const link = s.tags[0] || {};
  check(tag + 'un clic sur la miniature 1 pose la diapositive en texte après « Bonjour, » (le titre, le texte, la liste), suivie de son repère, avant « Cordialement »', sameList(s.blocks, afterOne), s.blocks);
  check(tag + 'le repère dit d’où vient la copie : « Offre », sa diapositive, « Suit la source », trois blocs, sans mise en forme d’origine, avec sa base',
    s.tags.length === 1 && link.linkModel === 8 && /^[A-Za-z0-9]{8,}$/.test(link.linkKey || '') && /^[a-z0-9]{8,24}$/.test(link.linkSlide || '') && link.linkMode === 'pull' && link.linkSpan === 3 && !link.linkKeep && /^[a-z0-9]+\.[a-z0-9]+$/.test(link.linkBase || ''), link);
  check(tag + 'le HTML du document porte ce repère (trois blocs, « pull », pas de mise en forme gardée) et rien de la décoration du trait', s.markers.length === 1 && s.markers[0].span === '3' && s.markers[0].mode === 'pull' && s.markers[0].keep === null && !/pp-copy-mark/.test(s.html), { markers: s.markers });
  const sourceAfter = await stored(app, 8);
  const textBefore = await textOf(app, sourceBefore.html);
  const textAfter = await textOf(app, sourceAfter.html);
  check(tag + 'la ligne de « Offre » reçoit tout de suite le numéro de sa diapositive 1 (une fois) ; son texte ne change pas',
    !!link.linkSlide && sourceAfter.html.split('data-slide-id="' + link.linkSlide + '"').length === 2 && !sourceBefore.html.includes('data-slide-id') && textAfter === textBefore, { anchored: !!link.linkSlide && sourceAfter.html.includes(link.linkSlide), same: textAfter === textBefore });
  check(tag + 'le coin d’état dit « ' + T.done(1, 'Offre') + ' » sans rien à signaler (rien n’est resté de la diapositive)', said.includes(T.done(1, 'Offre')) && !said.some(m => /non repris|not carried/.test(m)), said);
  check(tag + 'un trait d’accent borde les trois blocs de la copie (« Notre offre », le texte, la liste), et le repère ne prend aucune place',
    sameList(s.marks, ['Notre offre', 'Un texte gras', 'Rapide']) && !!s.shadow && s.shadow !== 'none' && s.markerHeight === 0, { marks: s.marks, shadow: s.shadow, markerHeight: s.markerHeight });
  check(tag + 'le volet reste ouvert, le clavier revient dans le texte (le clic était à la souris), le curseur au début du bloc qui suit la copie (« Cordialement »)', s.open && s.focus === 'editor' && s.cursor.block === 'Cordialement' && s.cursor.atStart, { open: s.open, focus: s.focus, cursor: s.cursor });
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait toute l’insertion (la copie et son repère) : le document revient à l’identique', s.html === original && s.tags.length === 0 && s.marks.length === 0, s.blocks);
  await a.press('Control+y');
  await sleep(400);
  s = await state(app);
  check(tag + 'Ctrl+Y la refait, avec son repère', s.html === afterOneHtml && s.tags.length === 1, s.blocks);

  // --- La même diapositive une seconde fois : un lien par diapositive et par document.
  await a.clickText('Cordialement');
  await watchStatus(app);
  await a.clickThumb(0, 2000);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'la même diapositive une seconde fois arrive en copie simple, sans repère de plus (un lien par diapositive et par document), et le coin d’état le dit',
    s.tags.length === 1 && sameList(s.blocks, afterOne.concat(COPY, ['paragraph:'])) && said.includes(T.already(1, 'Offre')), { blocks: s.blocks, said });
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait cette copie simple : la copie liée est restée', s.html === afterOneHtml, s.blocks);

  // --- La barre : le curseur dans la copie.
  await a.clickText('Un texte gras');
  await sleep(300);
  s = await state(app);
  check(tag + 'le curseur dans la copie : la barre dit « ' + T.bar(1, 'Offre') + ' » et propose « ' + T.detach + ' », entière dans la fenêtre',
    !!s.bar && s.bar.text === T.bar(1, 'Offre') && s.bar.button === T.detach && inWindow(s.bar.rect, s.inner), { bar: s.bar });
  await shot(A, lang + '-' + colorScheme + '-3-barre');
  const barRatios = [await contrastOf(app, '.v2-copy-name'), await contrastOf(app, '.v2-copy-detach')];
  check(tag + 'le nom et « ' + T.detach + ' » se lisent (contraste ≥ 4,5:1)', barRatios.every(r => r >= 4.5), barRatios);
  await a.clickText('Bonjour,');
  await sleep(300);
  s = await state(app);
  check(tag + 'le curseur hors de la copie : la barre se retire', !s.bar, s.bar);

  // --- Le verrou : rien ne s'écrit dans la copie.
  await a.clickText('Un texte gras');
  const locked = (await state(app)).html;
  await watchStatus(app);
  await page.keyboard.type('x');
  await sleep(300);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'taper dans la copie est refusé : le texte ne change pas, et le coin d’état dit pourquoi (« ' + T.locked('Offre') + ' »)', s.html === locked && said.includes(T.locked('Offre')), { same: s.html === locked, said });
  await a.press('Backspace');
  await a.press('Enter');
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'Retour arrière et Entrée aussi : le texte ne change pas, et le coin d’état ne le redit pas à chaque touche', s.html === locked && said.filter(m => m === T.locked('Offre')).length === 1, { same: s.html === locked, said });
  // Coller : le même texte copié passe hors de la copie (le témoin), pas dans la copie.
  await a.clickText('Bonjour,');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+c');
  await sleep(200);
  await a.clickText('Cordialement');
  await a.press('Control+v');
  await sleep(300);
  s = await state(app);
  check(tag + 'témoin : le texte copié se colle hors de la copie (« Cordialement » le reçoit)', s.blocks[s.blocks.length - 1] !== 'paragraph:Cordialement' && s.blocks.some(b => /Cordialement.*Bonjour|Bonjour.*Cordialement/.test(b)), s.blocks);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + '(témoin défait) le document est revenu à la copie liée seule', s.html === locked, s.blocks);
  await a.clickText('Un texte gras');
  await watchStatus(app);
  await a.press('Control+v');
  await sleep(300);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'le même collage dans la copie est refusé : le texte ne change pas', s.html === locked, s.blocks);
  // Une sélection qui va de « Bonjour, » jusque dans la copie : la supprimer changerait la copie.
  await a.clickText('Bonjour,');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await a.press('Delete');
  s = await state(app);
  check(tag + 'supprimer une sélection qui entre dans la copie est refusé : le document ne change pas', s.html === locked, s.blocks);
  // Le texte autour s'écrit.
  await atEnd('Bonjour,');
  await page.keyboard.type('!');
  await sleep(300);
  s = await state(app);
  check(tag + 'hors de la copie, la frappe passe (« Bonjour,! ») et la copie reste telle quelle', s.blocks[0] === 'paragraph:Bonjour,!' && sameList(s.blocks.slice(1), afterOne.slice(1)), s.blocks);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un Ctrl+Z défait la frappe seule : la copie est restée', s.html === locked, s.blocks);
  // Un geste qui emporte toute la copie avec son repère passe (ici : de la fin de « Bonjour, » à la fin du document).
  await atEnd('Bonjour,');
  await page.keyboard.press('Shift+Control+End');
  await a.press('Delete');
  s = await state(app);
  check(tag + 'supprimer la copie en entier, avec son repère (et le reste du document), passe : plus de repère, plus de trait', s.tags.length === 0 && s.marks.length === 0 && s.blocks[0] === 'paragraph:Bonjour,' && !s.blocks.some(b => b.startsWith('heading')), s.blocks);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z la rend, avec son repère et son verrou', s.html === locked && s.tags.length === 1, s.blocks);

  // --- La synchro : « Offre » changée ailleurs, la copie prend la nouvelle diapositive à la lecture suivante de l'enregistrement automatique.
  await saved(A);
  await atEnd('Bonjour,');
  const row7Before = await stored(app, 7);
  const anchored = (await stored(app, 8)).html;
  check(tag + 'enregistrée, la ligne de « Devis » garde la copie et son repère (trois blocs)', row7Before.html.includes('data-link-span="3"') && row7Before.html.includes('Notre offre') && row7Before.html.includes('Rapide'), row7Before.html.slice(0, 300));
  check(tag + '(préparation) « Offre » réécrite ailleurs', await rewrite(app, 8, 'Rapide', 'Très rapide'), null);
  await watchStatus(app);
  const arrived = await waitDoc(app, 'Très rapide');
  await sleep(500);
  s = await state(app);
  said = await statusSeen(app);
  const pulledBlocks = ['paragraph:Bonjour,', 'heading:Notre offre', 'paragraph:Un texte gras', 'bulletList:Très rapide', 'slideLink:', 'paragraph:Cordialement'];
  check(tag + 'la lecture suivante de l’enregistrement automatique remplace la copie par la diapositive de « Offre » (la liste dit « Très rapide ») ; le repère reste', arrived && sameList(s.blocks, pulledBlocks) && s.tags.length === 1 && s.tags[0].linkSlide === link.linkSlide, { arrived, blocks: s.blocks });
  check(tag + 'le coin d’état le dit : « ' + T.pulled('Offre') + ' »', said.includes(T.pulled('Offre')), said);
  check(tag + 'le repère a pris sa nouvelle base, et le curseur est resté au bout de « Bonjour, » (le clavier aussi)', s.tags.length === 1 && s.tags[0].linkBase !== link.linkBase && s.tags[0].linkSpan === 3 && s.cursor.block === 'Bonjour,' && s.cursor.atEnd && s.focus === 'editor', { tag: s.tags[0], cursor: s.cursor, focus: s.focus });
  await sleep(7000);
  const row7After = await stored(app, 7);
  check(tag + 'la synchro ne rend pas le document « à enregistrer » : deux lectures plus tard, rien n’a été écrit dans la ligne de « Devis »', row7After.saves === row7Before.saves && row7After.html === row7Before.html, { saves: [row7Before.saves, row7After.saves] });
  // Le macro-modèle qui prend « Devis » : l’enregistrement de « Devis » date d’avant le changement de « Offre », sa Lecture lit pourtant la diapositive d’aujourd’hui, sans repère.
  await open(A, 9, 0, false);
  await a.click('#btn-mode-read', 0, 300);
  await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const macro = await app.evaluate(() => { const el = document.querySelector('#reader-container .reader-content'); return { text: el ? el.textContent : '', markers: document.querySelectorAll('#reader-container .pp-slide-link, #reader-container [data-link-span]').length }; });
  check(tag + 'le macro-modèle qui prend « Devis » montre la copie à jour (« Très rapide ») et sans repère, alors que l’enregistrement de « Devis » date d’avant', macro.text.includes('Notre offre') && macro.text.includes('Très rapide') && macro.markers === 0 && !row7After.html.includes('Très rapide'), { markers: macro.markers, text: macro.text.slice(0, 200) });
  await a.click('#btn-mode-edit', 0, 500);
  await open(A, 7, 0, false);
  await a.clickText('Bonjour,');
  s = await state(app);
  check(tag + 'rouvert, « Devis » montre sa copie à jour (la synchro de l’ouverture), avec son repère', sameList(s.blocks, pulledBlocks) && s.tags.length === 1, s.blocks);
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await sleep(300);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'Ctrl+Z défait la frappe de la personne, pas la synchro : « Bonjour, » est revenu, la liste dit toujours « Très rapide »', sameList(s.blocks, pulledBlocks), s.blocks);

  // --- Une diapositive plus longue, plus courte, vide : le nombre de blocs suit, le verrou aussi.
  check(tag + '(préparation) « Offre » reçoit une ligne de plus après la liste', await rewrite(app, 8, '</ul>', '</ul><p>Nouvelle ligne</p>'), null);
  await watchStatus(app);
  const longer = await waitDoc(app, 'Nouvelle ligne');
  await sleep(500);
  s = await state(app);
  check(tag + 'plus longue : la copie a un bloc de plus (« Nouvelle ligne »), le repère compte quatre blocs, le trait en borde quatre',
    longer && sameList(s.blocks, ['paragraph:Bonjour,', 'heading:Notre offre', 'paragraph:Un texte gras', 'bulletList:Très rapide', 'paragraph:Nouvelle ligne', 'slideLink:', 'paragraph:Cordialement']) && s.tags[0].linkSpan === 4 && s.marks.length === 4, { blocks: s.blocks, tag: s.tags[0], marks: s.marks });
  const longerHtml = s.html;
  await a.clickText('Nouvelle ligne');
  await page.keyboard.type('x');
  await sleep(300);
  s = await state(app);
  check(tag + 'le verrou suit le nouveau texte : taper dans le bloc arrivé est refusé', s.html === longerHtml, s.blocks);
  check(tag + '(préparation) « Offre » reperd cette ligne', await rewrite(app, 8, '<p>Nouvelle ligne</p>', ''), null);
  const shorter = await waitDoc(app, 'Nouvelle ligne', false);
  await sleep(500);
  s = await state(app);
  check(tag + 'plus courte : la copie perd ce bloc, le repère compte de nouveau trois blocs', shorter && sameList(s.blocks, pulledBlocks) && s.tags[0].linkSpan === 3 && s.marks.length === 3, { blocks: s.blocks, tag: s.tags[0] });
  // La diapositive vidée : tout ce qui précède son repère dans « Offre » s'en va.
  await app.evaluate(() => {
    const stub = window.__gristStub;
    const body = new DOMParser().parseFromString(stub.getRow('Publipostage_Modeles', 8).Contenu, 'text/html').body;
    const kids = Array.from(body.children);
    const cut = kids.findIndex(el => el.classList.contains('page-break-marker'));
    kids.slice(0, cut).forEach((el) => { if (!el.classList.contains('pp-slide-link')) el.remove(); });
    stub.remoteWrite('Publipostage_Modeles', 8, { Contenu: body.innerHTML, DateModif: new Date().toISOString() });
  });
  const emptied = await waitDoc(app, 'Notre offre', false);
  await sleep(500);
  s = await state(app);
  check(tag + 'vide : la copie laisse un paragraphe vide, avec son repère (un seul bloc), et la barre se montre encore dans ce paragraphe',
    emptied && sameList(s.blocks, ['paragraph:Bonjour,', 'paragraph:', 'slideLink:', 'paragraph:Cordialement']) && s.tags[0].linkSpan === 1, { blocks: s.blocks, tag: s.tags[0] });
  await a.clickText('Bonjour,');
  await page.keyboard.press('ArrowDown');
  await sleep(300);
  s = await state(app);
  check(tag + 'le curseur dans ce paragraphe vide : la barre dit toujours « ' + T.bar(1, 'Offre') + ' »', s.cursor.block === '' && !!s.bar && s.bar.text === T.bar(1, 'Offre'), { cursor: s.cursor, bar: s.bar });
  await restore(app, 8, anchored);
  const back = await waitDoc(app, 'Notre offre');
  await sleep(500);
  s = await state(app);
  check(tag + '« Offre » remise comme au début : la copie reprend ses trois blocs (la liste dit « Rapide »)', back && sameList(s.blocks, afterOne) && s.tags[0].linkSpan === 3, s.blocks);

  // --- Les sorties : la Lecture et les exports n'ont pas le repère.
  const out = await app.evaluate(() => ({ raw: EditorCore.getEditor().getHTML(), out: SlidesEntry.outputHtml('document', EditorCore.getEditor().getHTML()) }));
  check(tag + 'les sorties (SlidesEntry.outputHtml) n’ont pas le repère et gardent le texte de la copie', out.raw.includes('pp-slide-link') && !out.out.includes('pp-slide-link') && !out.out.includes('data-link-') && out.out.includes('Notre offre') && out.out.includes('Rapide'), { raw: out.raw.includes('pp-slide-link'), out: out.out.slice(0, 200) });
  // Un document fermé : son enregistrement (row7Before : « Rapide », l’ancienne base) date d’avant le changement de « Offre » ; sa sortie lit la diapositive d’aujourd’hui.
  check(tag + '(préparation) « Offre » réécrite ailleurs', await rewrite(app, 8, 'Rapide', 'Très rapide'), null);
  await waitDoc(app, 'Très rapide');
  const closedNow = await app.evaluate(html => SlideCopies.forOutput(html), row7Before.html);
  check(tag + 'un document fermé dont la diapositive a changé depuis son enregistrement sort la nouvelle (« Très rapide »), sans repère', !row7Before.html.includes('Très rapide') && closedNow.includes('Très rapide') && !closedNow.includes('pp-slide-link') && !closedNow.includes('data-link-'), closedNow.slice(0, 300));
  await restore(app, 8, anchored);
  await waitDoc(app, 'Très rapide', false);
  await a.click('#btn-mode-read', 0, 300);
  await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
  await sleep(1200);
  const reading = await app.evaluate(() => ({ text: document.querySelector('#reader-container .reader-content').textContent, markers: document.querySelectorAll('#reader-container .pp-slide-link, #reader-container [data-link-span]').length }));
  check(tag + 'la Lecture montre le texte de la copie, sans repère', reading.text.includes('Notre offre') && reading.text.includes('Un texte gras') && reading.markers === 0, { markers: reading.markers, text: reading.text.slice(0, 120) });
  await a.click('#btn-mode-edit', 0, 600);

  // --- Détacher : la barre. Le texte reste, s'écrit de nouveau ; un Ctrl+Z rend le lien.
  await a.clickText('Un texte gras');
  await sleep(300);
  await watchStatus(app);
  await a.click('.v2-copy-detach', 0, 500);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'un clic sur « ' + T.detach + ' » ôte le repère : le texte reste, plus de trait, la barre se retire, et le coin d’état le dit (« ' + T.detached + ' »)',
    s.tags.length === 0 && s.marks.length === 0 && !s.bar && sameList(s.blocks, afterOne.filter(b => b !== 'slideLink:')) && said.includes(T.detached), { blocks: s.blocks, bar: s.bar, said });
  await sleep(700);
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await sleep(300);
  s = await state(app);
  check(tag + 'le texte détaché s’écrit de nouveau (« Un texte grasx »)', s.blocks.includes('paragraph:Un texte grasx'), s.blocks);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un Ctrl+Z défait la frappe seule : le texte est revenu, toujours détaché', s.blocks.includes('paragraph:Un texte gras') && s.tags.length === 0, s.blocks);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un second Ctrl+Z rend le lien : le repère, le trait et le verrou sont revenus', s.tags.length === 1 && s.marks.length === 3 && sameList(s.blocks, afterOne), s.blocks);
  await a.clickText('Un texte gras');
  const relocked = (await state(app)).html;
  await page.keyboard.type('y');
  await sleep(300);
  check(tag + 'le verrou est bien revenu : taper dans la copie est de nouveau refusé', (await state(app)).html === relocked, null);

  // --- La mise en forme d'origine : la diapositive 2 avec les deux cases ; une seconde copie dans le même document, qui garde ses tailles.
  await a.clickRow('v2-btn-slide-text', 900);
  s = await state(app);
  check(tag + 'rouvert, le volet garde sa source (« Offre »), « ' + T.link + ' » et « ' + T.format + ' » sont décochées', s.open && s.field === 'Offre' && !!s.link && !s.link.checked && !!s.format && !s.format.checked, { open: s.open, field: s.field, link: s.link, format: s.format });
  // Le menu s'ouvre au survol : la souris le quitte avant de cocher, sinon la ligne du menu reçoit le clic.
  await a.leaveMenu();
  await a.click('#pp-slide-import-keep', 0, 300);
  await a.click('#pp-slide-import-format', 0, 300);
  await atEnd('Bonjour,');
  s = await state(app);
  check(tag + 'les deux cases cochées, l’indication dit « ' + T.hintLinkedKeep + ' »', !!s.link && s.link.checked && !!s.format && s.format.checked && s.hint === T.hintLinkedKeep, { link: s.link, format: s.format, hint: s.hint });
  await watchStatus(app);
  await a.clickThumb(1, 2000);
  s = await state(app);
  said = await statusSeen(app);
  const two = ['paragraph:Bonjour,', 'heading:Deux', 'paragraph:Suite', 'slideLink:'].concat(afterOne.slice(1));
  check(tag + 'la diapositive 2, avec les deux cases, se pose après « Bonjour, » (avant la première copie, jamais dedans) : le titre « Deux », le texte « Suite », son repère',
    sameList(s.blocks, two) && s.tags.length === 2, s.blocks);
  check(tag + 'son repère garde la mise en forme d’origine (deux blocs) ; le texte garde les tailles de la diapositive (36 pt, 20 pt) ; l’autre copie n’en a pas',
    s.tags[0].linkSpan === 2 && s.tags[0].linkKeep === true && s.tags[1].linkSpan === 3 && !s.tags[1].linkKeep && s.sizes.includes('font-size: 36pt') && s.sizes.includes('font-size: 20pt') && !s.sizes.includes('font-size: 44pt'), { tags: s.tags.map(x => [x.linkSpan, x.linkKeep]), sizes: s.sizes });
  check(tag + 'le coin d’état dit « ' + T.done(2, 'Offre') + ' »', said.includes(T.done(2, 'Offre')), said);
  const anchored2 = (await stored(app, 8)).html;
  check(tag + '(préparation) « Offre » réécrite ailleurs : « Suite » devient « Suite et fin »', await rewrite(app, 8, 'Suite', 'Suite et fin'), null);
  const kept = await waitDoc(app, 'Suite et fin');
  await sleep(500);
  s = await state(app);
  check(tag + 'à la synchro, la copie de la diapositive 2 prend « Suite et fin » en gardant ses tailles (36 pt, 20 pt) ; l’autre copie ne bouge pas',
    kept && s.blocks[2] === 'paragraph:Suite et fin' && s.sizes.includes('font-size: 36pt') && s.sizes.includes('font-size: 20pt') && s.tags[0].linkKeep === true && sameList(s.blocks.slice(3), two.slice(3)), { blocks: s.blocks, sizes: s.sizes });
  check(tag + 'le coin d’état dit « ' + T.pulled('Offre') + ' »', (await statusSeen(app)).includes(T.pulled('Offre')), await statusSeen(app));
  await restore(app, 8, anchored2);
  await waitDoc(app, 'Suite et fin', false);
  await sleep(300);

  // --- Sa diapositive perdue : la barre le dit, la copie reste en l'état.
  const idsBefore = (await stored(app, 8)).html.split('data-slide-id').length;
  await app.evaluate(() => {
    const stub = window.__gristStub;
    const body = new DOMParser().parseFromString(stub.getRow('Publipostage_Modeles', 8).Contenu, 'text/html').body;
    const first = body.querySelector('div.pp-slide-link[data-slide-id]');
    if (first) first.remove();
    stub.remoteWrite('Publipostage_Modeles', 8, { Contenu: body.innerHTML, DateModif: new Date().toISOString() });
  });
  await app.waitForFunction(n => Templates.byId(8).contenu.split('data-slide-id').length < n, idsBefore, { timeout: 20000 }).catch(() => {});
  await sleep(500);
  await a.clickText('Rapide');
  await a.clickText('Un texte gras');
  s = await state(app);
  check(tag + 'sa diapositive n’existe plus dans « Offre » : la barre le dit (« ' + T.barGone + ' »), la copie reste telle quelle', !!s.bar && s.bar.text === T.barGone && s.tags.length === 2 && s.blocks.includes('paragraph:Un texte gras'), { bar: s.bar, tags: s.tags.length });
  const gone = s.html;
  await page.keyboard.type('z');
  await sleep(300);
  check(tag + 'elle reste verrouillée tant que « Offre » existe : taper est refusé (« Détacher » libère)', (await state(app)).html === gone, null);

  // --- Sa présentation supprimée : la copie reste en l'état, libre.
  await app.evaluate(() => grist.docApi.applyUserActions([['RemoveRecord', 'Publipostage_Modeles', 8]]));
  await app.waitForFunction(() => !Templates.byId(8), null, { timeout: 20000 }).catch(() => {});
  await sleep(500);
  await a.clickText('Rapide');
  await a.clickText('Un texte gras');
  s = await state(app);
  check(tag + '« Offre » supprimée : la copie reste (même texte), le trait part, et la barre dit que sa diapositive n’existe plus', s.blocks.includes('paragraph:Un texte gras') && s.marks.length === 0 && !!s.bar && s.bar.text === T.barGone, { marks: s.marks, bar: s.bar });
  await page.keyboard.press('End');
  await page.keyboard.type('q');
  await sleep(300);
  s = await state(app);
  check(tag + 'plus verrouillée : le texte s’écrit (« Un texte grasq »)', s.blocks.includes('paragraph:Un texte grasq'), s.blocks);
  await a.click('.v2-copy-detach', 0, 500);
  s = await state(app);
  check(tag + '« ' + T.detach + ' » ôte alors le repère mort de cette copie ; l’autre garde le sien', s.tags.length === 1 && !s.bar, { tags: s.tags.length, bar: s.bar });

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

if (!ONLY || ONLY === 'fr') await run('fr', 'light');
if (!ONLY || ONLY === 'en') await run('en', 'dark');
await t.finish();
