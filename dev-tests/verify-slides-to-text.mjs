#!/usr/bin/env node
// Une diapositive en texte de document (js/slide-text.js, extensions/diapositives/slide-import.js en mode « texte », SlidesEntry.openTextImport et pastedInDocument ; demande du 22/10 :
// « importer des slide dans des documents » ; cartes « En texte, dans les deux sens » et « Celle d'arrivée, avec une case »), à la vraie souris et au vrai clavier, 700x400, français clair
// puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS (sans `allow-same-origin`), l'extension « diapositives » active, un DOCUMENT « Devis » à l'écran.
//  LE MENU : « Lien et blocs de contenu » a neuf lignes, la dernière « Diapositive d'une présentation… » (icône, texte lisible ≥ 4,5:1) ; à 700x400 elles tiennent toutes dans la fenêtre, sans
//   défilement. Elle est grisée dans un e-mail et dans une présentation (le volet « Importer » de la bande y copie une diapositive entière).
//  LE VOLET : un clic sur la ligne l'ouvre à droite du document, comme celui d'« Importer » (la page se réduit, la pastille du zoom passe à sa gauche), le clavier reste dans le texte ; Tab puis
//   Entrée l'ouvre avec le clavier dans le volet. La liste avec recherche propose TOUTES les présentations du document, par nom, et rien d'autre. Les miniatures gardent la page de la
//   présentation (16:9, ses cadres à leur place), pas celle du document ; la case « Garder la mise en forme d'origine » se montre avec la source, décochée.
//  INSÉRER À LA SOURIS : un clic sur la miniature 1 pose la diapositive en texte du document, après le paragraphe du curseur : le titre, le texte courant (gras gardé), la liste, puis les cadres
//   dans l'ordre de lecture (de haut en bas, de gauche à droite à la même hauteur) ; la forme garde son texte, le trait n'a pas de texte ; plus aucune taille (le texte prend celle du
//   document), aucun cadre, aucun repère de la diapositive. Le coin d'état dit ce qui n'est pas entré (une forme, un trait, des notes, une transition). Le curseur reste après le texte :
//   un second clic se pose après le premier. Une diapositive qui finit par une liste n'avale pas la suivante. Un seul Ctrl+Z défait une insertion, Ctrl+Y la refait. Une variable arrive intacte
//   et se fusionne à la Lecture, une image devant ou derrière le texte devient une image du texte ; une diapositive vide n'insère rien et le dit.
//  LA CASE : cochée, le texte garde les tailles de la diapositive (20 pt, titres à 44 pt) et l'indication le dit ; elle est décochée à chaque ouverture du volet, qui garde sa source.
//  CTRL+V : une diapositive copiée de la bande (Ctrl+C sur sa miniature) et collée dans le texte d'un document devient du texte de ce document, comme au volet (la ligne d'état le dit, avec
//   ce qui n'est pas entré) ; plusieurs diapositives se suivent ; la case du volet ouvert s'y applique ; un seul Ctrl+Z.
//  L'ÉCRAN CHANGE : ouvrir une présentation ferme le volet. EXTENSION ÉTEINTE EN DIRECT : la ligne et les miniatures du volet ouvert sont grisées avec leur raison, leur clic appelle `installer`
//   de GFS sans rien changer ; rallumée, elles se dégrisent.
// Lancé par run-headless.mjs (groupe Node "slidesToText", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-to-text.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-to-text', port: Number(process.env.SLIDES_TO_TEXT_PORT || 8974) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
// SLIDES_TO_TEXT_SHOTS=<dossier> : des captures de la page parente (le menu, le volet et son essai).
const SHOTS = process.env.SLIDES_TO_TEXT_SHOTS || '';
const shot = async (tab, name) => { if (SHOTS) { await mkdir(SHOTS, { recursive: true }); await tab.page.screenshot({ path: join(SHOTS, name + '.png') }); } };

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const BEHIND = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGMQWWADRwzEcQCDww8BPjSCQgAAAABJRU5ErkJggg==';
const NAMES = { [FRONT]: 'front', [BEHIND]: 'behind' };
const layered = (src, layer, pageIndex) => `<img class="editor-image" src="${src}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: ${layer === 'front' ? 5 : -1}" data-layer="${layer}" data-wrap="inline" data-page-index="${pageIndex}" data-page-left-pt="40" data-page-top-pt="30">`;
const size = (pt, text) => `<span style="font-size: ${pt}pt">${text}</span>`;
// Un cadre tel que l'éditeur l'écrit : ses mesures en variables (`style`) autant qu'en `data-ff-*`, que lisent les miniatures.
const VARS = (x, y, w, h) => `style="--ff-x:${x}pt;--ff-y:${y}pt;--ff-w:${w}pt;--ff-h:${h}pt"`;
const FRAME = (x, y, w, h, look, body) => `<div class="pp-free-frame" role="group" ${VARS(x, y, w, h)} data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${look || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${body}</div></div></div>`;
const SHAPE = ' data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"';
const LINE = '<div class="pp-free-frame" role="group" ' + VARS(400, 120, 200, 0) + ' data-ff-x="400" data-ff-y="120" data-ff-w="200" data-ff-h="0" data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>';
const PROPS = '<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0" data-trans="fade" data-trans-from="r" data-trans-dur="700" data-notes="Dire bonjour"></div>';
const CHIP = '<span class="var-badge" contenteditable="false" data-table="PpDepart" data-column="Nom" data-key="PpDepart.Nom">#PpDepart.Nom</span>';
// 7 « Devis » : un document de deux paragraphes ; 8 « Présentation commerciale » : trois diapositives, la première avec sa transition et ses notes, cinq cadres au début (dans l'ordre du fichier, qui
// n'est pas celui de la lecture : « Cadre bas », « Cadre droit » un peu plus haut que « Cadre gauche », puis la forme et le trait), un titre à 44 pt, du texte et une liste à 20 pt ;
// la deuxième avec un titre, une variable et deux images (devant et derrière le texte, posées sur sa page) ; la troisième vide ; 9 « Contrat » : un autre document ; 10 « Nos références » :
// une diapositive qui finit par une liste, puis une autre. Les modèles de départ (seedModels) : des documents, un e-mail, un macro-modèle et une présentation, « Futur ».
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Devis', '<p>Bonjour,</p><p>Cordialement</p>', false, 'document');
  add(8, 'Présentation commerciale', '${PROPS}${FRAME(200, 440, 300, 40, '', `<p>${size(20, 'Cadre bas')}</p>`)}${FRAME(400, 300, 300, 40, '', `<p>${size(20, 'Cadre droit')}</p>`)}${FRAME(40, 304, 300, 40, '', `<p>${size(20, 'Cadre gauche')}</p>`)}${FRAME(100, 100, 200, 80, SHAPE, `<p>${size(20, 'Dans la forme')}</p>`)}${LINE}<h1 style="text-align: left">${size(44, 'Notre offre')}</h1><p>${size(20, 'Un texte ')}<strong>${size(20, 'gras')}</strong></p><ul><li><p>${size(20, 'Rapide')}</p></li></ul>${BR}<h2>${size(36, 'Deux')}</h2><p>${size(20, 'Bonjour ')}${CHIP}${layered(FRONT, 'front', 1)}${layered(BEHIND, 'behind', 1)}</p>${BR}<p></p>', false, 'presentation');
  add(9, 'Contrat', '<p>Contrat</p>', false, 'document');
  add(10, 'Nos références', '<h1>${size(44, 'Références')}</h1><ul><li><p>${size(20, 'Alpha')}</p></li><li><p>${size(20, 'Beta')}</p></li></ul>${BR}<p>${size(20, 'Autre texte')}</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;
const READING = ['paragraph:Bonjour,', 'heading:Notre offre', 'paragraph:Un texte gras', 'bulletList:Rapide', 'paragraph:Dans la forme', 'paragraph:Cadre gauche', 'paragraph:Cadre droit', 'paragraph:Cadre bas', 'paragraph:Cordialement'];
const ROWS = ['v2-row-link', 'v2-row-bookmark', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr', 'v2-btn-chart', 'v2-btn-slide-text'];
const NAME = 'Présentation commerciale';
const TEXTS = {
  fr: {
    row: 'Diapositive d’une présentation…', title: 'Insérer depuis', choose: '— Choisir une présentation —', keep: 'Garder la mise en forme d’origine', label: 'Insérer une diapositive en texte',
    hint: 'Un clic sur une diapositive l’insère en texte à l’endroit du curseur.', hintKeep: 'Un clic sur une diapositive l’insère en texte à l’endroit du curseur, avec la mise en forme de la diapositive.',
    done: (n, name) => `Diapositive ${n} de « ${name} » insérée en texte.`, empty: (n, name) => `La diapositive ${n} de « ${name} » est vide : rien à insérer.`,
    dropped: '4 éléments non repris : 1 forme, 1 trait, 1 jeu de notes de l’intervenant, 1 transition.',
    pasted: 'Diapositive collée en texte.', pastedMany: n => `${n} diapositives collées en texte.`, copied: n => `Diapositive ${n} copiée.`, item: (n, total) => `Diapositive ${n} sur ${total}`,
    sources: ['Futur', 'Nos références', NAME], plural: '3 éléments non repris : 2 formes, 1 jeu de notes de l’intervenant.',
  },
  en: {
    row: 'Slide from a presentation…', title: 'Insert from', choose: '— Choose a presentation —', keep: 'Keep the original formatting', label: 'Insert a slide as text',
    hint: 'Click a slide to insert it as text at the cursor.', hintKeep: 'Click a slide to insert it as text at the cursor, with the slide’s formatting.',
    done: (n, name) => `Slide ${n} from “${name}” inserted as text.`, empty: (n, name) => `Slide ${n} of “${name}” is empty: nothing to insert.`,
    dropped: '4 items not carried over: 1 shape, 1 line, 1 set of speaker notes, 1 transition.',
    pasted: 'Slide pasted as text.', pastedMany: n => `${n} slides pasted as text.`, copied: n => `Slide ${n} copied.`, item: (n, total) => `Slide ${n} of ${total}`,
    sources: ['Futur', 'Nos références', NAME], plural: '3 items not carried over: 2 shapes, 1 set of speaker notes.',
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

// Le document ouvert : ses blocs (type et texte), son gras, ses images (laquelle, son calque, sa page), ses tailles de texte et ses variables ; le curseur ; où est le clavier ; le coin d'état. Puis le
// volet : ouvert ou non, sa place, celle de la page et de la pastille du zoom, son titre, la source choisie, l'indication, la case, ses miniatures. Lu dans le cadre de l'app.
const state = app => app.evaluate((names) => {
  const editor = EditorCore.getEditor();
  const doc = editor.state.doc;
  const blocks = [];
  doc.forEach((node) => blocks.push(node.type.name + ':' + node.textContent));
  const bold = [];
  doc.descendants((node) => { if (node.isText && node.marks.some(m => m.type.name === 'bold')) bold.push(node.text); });
  const images = [];
  doc.descendants((node) => { if (node.type.name === 'editorImage') images.push({ name: names[node.attrs.src] || '?', layer: node.attrs.layer, pageIndex: node.attrs.pageIndex }); return node.type.name !== 'editorImage'; });
  const html = editor.getHTML();
  const active = document.activeElement;
  let focus = null;
  if (active && active.closest('.ProseMirror')) focus = 'editor';
  else if (active && active.closest('.pp-slide-strip .pp-slide-item')) focus = 'strip';
  else if (active && active.closest('.pp-slide-import .pp-slide-item')) focus = 'thumb' + (Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-item')).indexOf(active.closest('.pp-slide-item')) + 1);
  else if (active && active.closest('.pp-slide-import')) focus = 'panel:' + (active.id || active.className);
  else if (active) focus = active.id || active.className || active.tagName;
  const { $from } = editor.state.selection;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const panel = document.querySelector('.pp-slide-import');
  const box = document.getElementById('editor-container');
  const boxRect = box.getBoundingClientRect();
  const trigger = document.querySelector('.pp-slide-import .ss-trigger');
  const hint = document.querySelector('.pp-slide-import-hint');
  const keep = document.querySelector('.pp-slide-import-keep');
  const keepBox = keep ? keep.querySelector('input') : null;
  const thumbs = Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-item'));
  return {
    blocks, bold, images, html,
    sizes: html.match(/font-size: [0-9.]+pt/g) || [],
    chips: (html.match(/class="var-badge"/g) || []).length,
    cursor: { block: $from.parent.textContent, atStart: $from.parentOffset === 0, atEnd: $from.parentOffset === $from.parent.content.size },
    focus,
    status: document.getElementById('status-msg').textContent,
    open: !!panel && !panel.hidden,
    bodyOn: document.body.classList.contains('pp-slide-import-on'),
    panel: rect(panel && !panel.hidden ? panel : null),
    inner: { right: boxRect.left + box.clientLeft + box.clientWidth, top: boxRect.top + box.clientTop, height: box.clientHeight },
    paddingRight: getComputedStyle(box).paddingRight,
    sheet: rect(document.querySelector('#editor-container .tiptap')),
    zoom: rect(document.querySelector('.pp-page-zoom')),
    label: panel ? panel.getAttribute('aria-label') : null,
    title: panel ? (panel.querySelector('.pp-slide-import-title') || {}).textContent : null,
    field: trigger ? trigger.textContent.trim() : null,
    hint: hint && !hint.hidden ? hint.textContent : '',
    keep: keep && !keep.hidden ? { text: keep.textContent.trim(), checked: keepBox.checked, disabled: keepBox.disabled } : null,
    listDisabled: (document.querySelector('.pp-slide-import-list') || { getAttribute: () => null }).getAttribute('aria-disabled'),
    rows: thumbs.map(item => ({ label: item.getAttribute('aria-label'), drawn: item.querySelector('.pp-slide-page').childNodes.length > 0 })),
  };
}, NAMES);
// Le menu « Lien et blocs de contenu », ouvert : ses lignes (dans l'ordre), leur place, leur texte, leur icône, si elles sont grisées ; la place du volet.
const menuOf = app => app.evaluate(() => {
  const flyout = document.getElementById('v2-blocks-flyout');
  const f = flyout.getBoundingClientRect();
  const rows = Array.from(flyout.querySelectorAll('.v2-menu-row')).map((row) => {
    const r = row.getBoundingClientRect();
    return { id: row.id, top: r.top, bottom: r.bottom, height: r.height, text: row.textContent.trim(), icon: !!row.querySelector('svg'), locked: row.classList.contains('v2-hf-locked'), aria: row.getAttribute('aria-disabled'), explains: row.hasAttribute('data-explains') };
  });
  return { rows, flyout: { top: f.top, bottom: f.bottom }, noScroll: flyout.scrollHeight <= flyout.clientHeight + 1, innerHeight: window.innerHeight };
});
// Une ligne du menu, sans l'ouvrir : grisée ou non, avec sa raison.
const rowOf = app => app.evaluate(() => {
  const row = document.getElementById('v2-btn-slide-text');
  return { locked: row.classList.contains('v2-hf-locked'), aria: row.getAttribute('aria-disabled'), title: row.title, explains: row.hasAttribute('data-explains'), label: row.getAttribute('aria-label') };
});
// La miniature `index` du volet : sa page (taille, marges), et la place de ses cadres dans la page (0 en haut, 1 en bas).
const thumbOf = (app, index) => app.evaluate((k) => {
  const page = document.querySelectorAll('.pp-slide-import .pp-slide-page')[k];
  const r = page.getBoundingClientRect();
  const frames = Array.from(page.querySelectorAll('.pp-free-frame-box')).map(box => ({ text: box.textContent.trim(), at: (box.getBoundingClientRect().top - r.top) / r.height }));
  return { width: parseFloat(page.style.width), height: parseFloat(page.style.height), text: page.textContent, frames };
}, index);
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
  await open(A, 7, 0, false);
  await a.clickText('Bonjour,');
  const original = (await state(app)).html;

  // --- Le menu : neuf lignes, la dernière est la nouvelle.
  await a.openMenu();
  let menu = await menuOf(app);
  const last = menu.rows[menu.rows.length - 1];
  check(tag + 'le menu « Lien et blocs de contenu » a neuf lignes, la dernière « ' + T.row + ' » (après « Graphique de la page… »), avec son icône',
    sameList(menu.rows.map(r => r.id), ROWS) && last.text === T.row && last.icon && !last.locked, { rows: menu.rows.map(r => r.id), last });
  await shot(A, lang + '-' + colorScheme + '-1-menu');
  check(tag + 'à 700x400 les neuf lignes tiennent dans la fenêtre (le menu finit au-dessus du bas), sans défilement, chacune assez haute pour la souris (≥ 24 px)',
    menu.flyout.bottom <= menu.innerHeight && menu.rows.every(r => r.top >= 0 && r.bottom <= menu.innerHeight && r.height >= 24) && menu.noScroll, { bottom: menu.flyout.bottom, heights: menu.rows.map(r => r.height), noScroll: menu.noScroll });
  check(tag + 'le texte de la ligne se lit (contraste ≥ 4,5:1)', (await contrastOf(app, '#v2-btn-slide-text')) >= 4.5, await contrastOf(app, '#v2-btn-slide-text'));
  await a.leaveMenu();

  // --- Un clic sur la ligne ouvre le volet à droite ; le clavier reste dans le texte.
  await a.clickRow('v2-btn-slide-text', 900);
  let s = await state(app);
  check(tag + 'un clic sur la ligne ouvre le volet à droite du document, sur sa hauteur visible ; le clavier reste dans le texte, au bout de « Bonjour, »',
    s.open && s.bodyOn && Math.abs(s.panel.right - s.inner.right) < 1 && Math.abs(s.panel.top - s.inner.top) < 1 && Math.abs(s.panel.height - s.inner.height) < 1 && s.focus === 'editor' && s.cursor.block === 'Bonjour,' && s.cursor.atEnd,
    { panel: s.panel, inner: s.inner, focus: s.focus, cursor: s.cursor });
  check(tag + 'la page se réduit à la largeur qui reste (rembourrage 214 px) sans passer sous le volet, et la pastille du zoom passe à sa gauche',
    s.paddingRight === '214px' && s.sheet.right <= s.panel.left + 0.5 && !!s.zoom && s.zoom.right <= s.panel.left, { paddingRight: s.paddingRight, sheet: s.sheet, zoom: s.zoom, panel: s.panel });
  check(tag + 'sans source choisie : « ' + T.title + ' » (nom accessible « ' + T.label + ' »), le champ dit « ' + T.choose + ' », ni indication, ni case, ni miniature',
    s.title === T.title && s.label === T.label && s.field === T.choose && s.hint === '' && s.keep === null && s.rows.length === 0, { title: s.title, label: s.label, field: s.field, hint: s.hint, keep: s.keep, rows: s.rows.length });
  check(tag + 'le titre, le texte de l’indication et de la case se lisent (contraste ≥ 4,5:1)', (await contrastOf(app, '.pp-slide-import-title')) >= 4.5, await contrastOf(app, '.pp-slide-import-title'));
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  const options = await ssOptions(app);
  check(tag + 'la liste avec recherche propose TOUTES les présentations du document, par nom (« Futur », « Nos références », « ' + NAME + ' »), et rien d’autre : ni document, ni e-mail, ni macro-modèle',
    sameList(options, T.sources), options);
  await page.keyboard.type('commerc');
  await sleep(250);
  await a.press('Enter');
  await sleep(600);
  s = await state(app);
  check(tag + '« commerc » puis Entrée choisit « ' + NAME + ' » : une miniature par diapositive, nommée ; l’indication dit où elle arrive ; la case « ' + T.keep + ' » se montre, décochée',
    s.field === NAME && sameList(s.rows.map(r => r.label), [T.item(1, 3), T.item(2, 3), T.item(3, 3)]) && s.hint === T.hint && !!s.keep && s.keep.text === T.keep && !s.keep.checked && !s.keep.disabled,
    { field: s.field, rows: s.rows, hint: s.hint, keep: s.keep });
  await shot(A, lang + '-' + colorScheme + '-2-volet');
  const thumb = await thumbOf(app, 0);
  const frameAt = text => (thumb.frames.find(f => f.text.indexOf(text) >= 0) || { at: -1 }).at;
  check(tag + 'les miniatures gardent la page de la présentation (16:9 : 1280 x 720 px, pas la page du document) et ses cadres à leur place : « Cadre bas » (440 pt sur 540) dans le bas de la page, « Dans la forme » (100 pt) dans le haut',
    Math.abs(thumb.width - 1280) < 1 && Math.abs(thumb.height - 720) < 1 && frameAt('Cadre bas') > 0.7 && frameAt('Dans la forme') < 0.35 && frameAt('Dans la forme') >= 0, thumb);

  // --- Insérer à la souris : la miniature 1, après « Bonjour, ».
  await watchStatus(app);
  await a.clickThumb(0, 1500);
  s = await state(app);
  let said = await statusSeen(app);
  await shot(A, lang + '-' + colorScheme + '-3-apres');
  check(tag + 'un clic sur la miniature 1 pose la diapositive en texte après « Bonjour, » : le titre, le texte courant, la liste, puis les cadres dans l’ordre de lecture (« Dans la forme », « Cadre gauche » puis « Cadre droit » à la même hauteur, « Cadre bas »), avant « Cordialement »',
    sameList(s.blocks, READING), s.blocks);
  check(tag + 'le gras est gardé (« gras ») ; la diapositive arrive à la taille du document (aucune taille de texte) ; ni cadre, ni repère, ni notes, ni transition ne passent',
    sameList(s.bold, ['gras']) && s.sizes.length === 0 && !/pp-free-frame|pp-slide-props|data-notes|data-trans|data-ff-/.test(s.html), { bold: s.bold, sizes: s.sizes });
  check(tag + 'le coin d’état dit « ' + T.done(1, NAME) + ' » puis ce qui n’est pas entré : « ' + T.dropped + ' »', said.includes(T.done(1, NAME) + ' ' + T.dropped), said);
  check(tag + 'le volet reste ouvert, le clavier revient dans le texte (le clic était à la souris), le curseur au début du bloc qui suit la diapositive (« Cordialement »)', s.open && s.focus === 'editor' && s.cursor.block === 'Cordialement' && s.cursor.atStart, { open: s.open, focus: s.focus, cursor: s.cursor });
  const afterOne = s.html;
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait toute l’insertion : le document revient à l’identique', s.html === original, s.blocks);
  await a.press('Control+y');
  await sleep(400);
  s = await state(app);
  check(tag + 'Ctrl+Y la refait', s.html === afterOne, s.blocks);

  // --- Un second clic se pose après le premier : la variable arrive intacte, les images deviennent des images du texte.
  await watchStatus(app);
  await a.clickThumb(1, 1500);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'un second clic (la miniature 2) se pose après le premier, avant « Cordialement » : un titre « Deux », puis le texte avec sa variable',
    sameList(s.blocks, READING.slice(0, 8).concat(['heading:Deux', 'paragraph:Bonjour ', 'paragraph:Cordialement'])) && s.chips === 1 && s.html.includes('data-key="PpDepart.Nom"'), { blocks: s.blocks, chips: s.chips });
  check(tag + 'les deux images posées devant et derrière le texte sont des images du texte : calque « normal », ni page, ni position sur la page',
    sameList(s.images.map(i => i.name + ':' + i.layer).sort(), ['behind:normal', 'front:normal']) && !/data-page-index|data-page-left-pt|data-page-top-pt|position: absolute/.test(s.html), { images: s.images });
  check(tag + 'le coin d’état dit « ' + T.done(2, NAME) + ' » sans rien à signaler (la diapositive 2 n’a ni forme, ni notes, ni transition)', said.includes(T.done(2, NAME)) && !said.some(m => /non repris|not carried/.test(m)), said);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un Ctrl+Z ne défait que le second : la première diapositive est restée', s.html === afterOne, s.blocks);
  await a.clickThumb(1, 1200);
  // La Lecture fusionne la variable avec les données du document.
  await a.click('#btn-mode-read', 0, 300);
  await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
  await sleep(1500);
  const reading = await app.evaluate(() => document.querySelector('#reader-container .reader-content').textContent);
  check(tag + 'à la Lecture, la variable de la diapositive se fusionne avec les données du document (« Bonjour Alice »)', reading.includes('Bonjour Alice') && !reading.includes('#PpDepart.Nom'), reading.slice(0, 200));
  await a.click('#btn-mode-edit', 0, 500);
  s = await state(app);
  check(tag + 'la Lecture ferme le volet (il n’est que pour l’Édition d’un document)', !s.open && !s.bodyOn, { open: s.open });
  await a.clickText('Cordialement');
  await a.clickRow('v2-btn-slide-text', 900);
  s = await state(app);
  check(tag + 'rouvert, le volet garde « ' + NAME + ' » et ses trois miniatures, la case est décochée', s.open && s.field === NAME && s.rows.length === 3 && !!s.keep && !s.keep.checked, { open: s.open, field: s.field, rows: s.rows.length, keep: s.keep });

  // --- Une diapositive vide n'insère rien.
  const beforeEmpty = (await state(app)).html;
  await watchStatus(app);
  await a.clickThumb(2, 800);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'la diapositive 3 est vide : rien ne s’insère, et le coin d’état le dit (« ' + T.empty(3, NAME) + ' »)', s.html === beforeEmpty && said.includes(T.empty(3, NAME)), { same: s.html === beforeEmpty, said });

  // --- Une diapositive qui finit par une liste n'avale pas la suivante : le curseur passe au paragraphe vide qui termine le document.
  await fresh(A, original);
  await a.pickSource('nos');
  s = await state(app);
  check(tag + '« nos » choisit « Nos références » : deux miniatures', s.field === 'Nos références' && s.rows.length === 2, { field: s.field, rows: s.rows.length });
  await a.clickText('Cordialement');
  await a.clickThumb(0, 1200);
  s = await state(app);
  check(tag + 'une diapositive qui finit le document par une liste (« Alpha », « Beta ») : le curseur passe au paragraphe vide qui la suit, il ne reste pas dans « Beta »',
    sameList(s.blocks, ['paragraph:Bonjour,', 'paragraph:Cordialement', 'heading:Références', 'bulletList:AlphaBeta', 'paragraph:']) && s.cursor.block === '' && s.focus === 'editor', { blocks: s.blocks, cursor: s.cursor, focus: s.focus });
  await a.clickThumb(1, 1200);
  s = await state(app);
  check(tag + 'la diapositive suivante (« Autre texte ») se pose APRÈS la liste, pas dans son dernier élément',
    sameList(s.blocks, ['paragraph:Bonjour,', 'paragraph:Cordialement', 'heading:Références', 'bulletList:AlphaBeta', 'paragraph:Autre texte']), s.blocks);

  // --- La case : cochée, le texte garde les tailles de la diapositive.
  await fresh(A, original);
  await a.pickSource('commerc');
  await a.click('.pp-slide-import-keep input', 0, 300);
  s = await state(app);
  check(tag + 'la case « ' + T.keep + ' » cochée à la souris : l’indication le dit (« ' + T.hintKeep + ' »)', !!s.keep && s.keep.checked && s.hint === T.hintKeep, { keep: s.keep, hint: s.hint });
  await a.clickText('Bonjour,');
  await a.clickThumb(0, 1200);
  s = await state(app);
  check(tag + 'cochée, la diapositive 1 garde ses tailles : le titre à 44 pt et le texte à 20 pt (le reste est comme avant)',
    s.sizes.includes('font-size: 44pt') && s.sizes.includes('font-size: 20pt') && s.blocks.join('|').includes('heading:Notre offre|paragraph:Un texte gras'), { sizes: s.sizes.slice(0, 4), blocks: s.blocks });
  await a.press('Control+z');
  await sleep(300);
  s = await state(app);
  check(tag + 'un Ctrl+Z défait aussi cette insertion', s.html === original, s.blocks);

  // --- « Fermer » (×) ferme le volet et rend le clavier au texte ; rouvert au clavier, il garde sa source et la case est décochée.
  await a.click('.pp-slide-import-close', 0, 400);
  s = await state(app);
  check(tag + '« Fermer » (×) ferme le volet : le clavier revient dans le texte, la page reprend sa place', !s.open && !s.bodyOn && s.focus === 'editor' && s.paddingRight === '14px', { open: s.open, focus: s.focus, paddingRight: s.paddingRight });
  await app.evaluate(() => document.getElementById('v2-btn-link').focus());
  for (let i = 0; i < 16 && (await state(app)).focus !== 'v2-btn-slide-text'; i++) await a.press('Tab');
  s = await state(app);
  check(tag + 'au clavier, Tab depuis « Lien et blocs de contenu » mène à la ligne, la dernière du menu', s.focus === 'v2-btn-slide-text', s.focus);
  await a.press('Enter');
  await sleep(500);
  s = await state(app);
  check(tag + 'Entrée sur la ligne ouvre le volet avec le clavier sur la première miniature ; il a gardé sa source (« ' + NAME + ' »), la case est décochée',
    s.open && s.focus === 'thumb1' && s.field === NAME && s.rows.length === 3 && !!s.keep && !s.keep.checked && s.hint === T.hint, { open: s.open, focus: s.focus, field: s.field, rows: s.rows.length, keep: s.keep, hint: s.hint });
  await a.press('ArrowDown');
  await a.press('Enter');
  await sleep(800);
  s = await state(app);
  check(tag + '↓ puis Entrée insèrent la diapositive 2 à l’endroit du curseur ; le clavier reste sur sa miniature, pour la suivante',
    s.blocks.includes('heading:Deux') && s.focus === 'thumb2', { blocks: s.blocks, focus: s.focus });
  await a.press('Control+z');
  await sleep(300);
  s = await state(app);
  check(tag + 'Ctrl+Z dans le volet défait l’insertion, sans quitter le volet', s.html === original && s.focus === 'thumb2', { same: s.html === original, focus: s.focus });
  await a.press('Escape');
  s = await state(app);
  check(tag + 'Échap ferme le volet et rend le clavier au texte', !s.open && s.focus === 'editor', { open: s.open, focus: s.focus });

  // --- Ctrl+V : une diapositive copiée de la bande devient du texte du document.
  await fresh(A, original);
  await open(A, 8, 3);
  s = await state(app);
  const strip = await app.evaluate(() => document.querySelectorAll('.pp-slide-strip .pp-slide-item').length);
  check(tag + '« ' + NAME + ' » à l’écran : sa bande a trois miniatures, la ligne du menu est grisée (le volet « Importer » de la bande y copie une diapositive entière), et le volet est fermé',
    strip === 3 && (await rowOf(app)).locked && !s.open && !s.bodyOn, { strip, row: await rowOf(app), open: s.open });
  await a.click('.pp-slide-strip .pp-slide-thumb', 0, 400);
  await a.press('Escape');
  for (let i = 0; i < 10 && !/^strip$/.test((await state(app)).focus || ''); i++) await a.press('Tab');
  await a.press('Control+c');
  s = await state(app);
  check(tag + 'Ctrl+C sur la miniature 1 la copie : « ' + T.copied(1) + ' »', s.status === T.copied(1) && s.focus === 'strip', { status: s.status, focus: s.focus });
  await open(A, 7);
  await a.clickText('Bonjour,');
  await watchStatus(app);
  await a.press('Control+v');
  await sleep(700);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'Ctrl+V dans le texte de « Devis » : la diapositive arrive en texte du document, comme au volet (mêmes blocs, même ordre), sans taille, sans enveloppe du presse-papiers',
    sameList(s.blocks, READING) && sameList(s.bold, ['gras']) && s.sizes.length === 0 && !/data-pp-slide|pp-free-frame|data-notes/.test(s.html), { blocks: s.blocks, sizes: s.sizes });
  check(tag + 'le coin d’état dit « ' + T.pasted + ' » puis ce qui n’est pas entré : « ' + T.dropped + ' »', said.includes(T.pasted + ' ' + T.dropped), said);
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z défait le collage', s.html === original, s.blocks);

  // --- Plusieurs diapositives copiées ensemble se suivent, sans le saut de page qui les séparait.
  await fresh(A, original);
  await open(A, 8, 3);
  await a.click('.pp-slide-strip .pp-slide-thumb', 0, 400);
  await page.keyboard.down('Shift');
  await a.click('.pp-slide-strip .pp-slide-thumb', 1, 400);
  await page.keyboard.up('Shift');
  await a.press('Control+c');
  await open(A, 7);
  await a.clickText('Bonjour,');
  await watchStatus(app);
  await a.press('Control+v');
  await sleep(700);
  s = await state(app);
  said = await statusSeen(app);
  check(tag + 'deux diapositives copiées ensemble (Maj+clic) et collées : elles se suivent dans le texte, sans saut de page entre elles ; le coin d’état dit « ' + T.pastedMany(2) + ' »',
    sameList(s.blocks, READING.slice(0, 8).concat(['heading:Deux', 'paragraph:Bonjour ', 'paragraph:Cordialement'])) && !s.html.includes('page-break-marker') && said.some(m => m.indexOf(T.pastedMany(2)) === 0), { blocks: s.blocks, said });
  await a.press('Control+z');
  await sleep(400);

  // --- La case du volet ouvert s'applique au collage.
  await a.clickRow('v2-btn-slide-text', 900);
  await a.pickSource('commerc');
  await a.click('.pp-slide-import-keep input', 0, 300);
  await a.clickText('Bonjour,');
  await a.press('Control+v');
  await sleep(700);
  s = await state(app);
  check(tag + 'la case « ' + T.keep + ' » cochée dans le volet ouvert s’applique au collage : les deux diapositives gardent leurs tailles (44, 36 et 20 pt)',
    s.sizes.includes('font-size: 44pt') && s.sizes.includes('font-size: 36pt') && s.sizes.includes('font-size: 20pt'), s.sizes.slice(0, 6));
  await a.press('Control+z');
  await sleep(400);

  // --- GFS éteint l'extension : la ligne et les miniatures du volet ouvert sont grisées, leur clic appelle `installer` sans rien changer.
  const offHtml = (await state(app)).html;
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => document.getElementById('v2-btn-slide-text').getAttribute('aria-disabled') === 'true', null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  s = await state(app);
  const row = await rowOf(app);
  check(tag + 'extension éteinte : la ligne du menu est grisée avec sa raison ; le volet ouvert garde ses miniatures, grisées, et l’indication dit la raison',
    row.aria === 'true' && row.explains && !!row.title && s.open && s.listDisabled === 'true' && s.rows.length === 3 && !!s.hint && s.hint !== T.hint && s.hint !== T.hintKeep, { row, hint: s.hint, list: s.listDisabled });
  await a.clickThumb(0, 600);
  let installs = await gfsCalls(page, 'installer');
  s = await state(app);
  check(tag + 'un clic sur une miniature grisée demande à GFS d’installer « diapositives », sans fenêtre de l’app, et rien ne change',
    sameList(installs, [{ extension: 'diapositives' }]) && !(await appDialogOpen(app)) && s.html === offHtml, { installs, same: s.html === offHtml });
  await a.clickRow('v2-btn-slide-text', 600);
  installs = await gfsCalls(page, 'installer');
  s = await state(app);
  check(tag + 'le clic sur la ligne grisée aussi (un deuxième appel), et le volet reste tel quel', installs.length === 2 && s.open && s.html === offHtml, { installs, open: s.open });
  await a.clickText('Bonjour,');
  await a.press('Control+v');
  await sleep(600);
  s = await state(app);
  check(tag + 'Ctrl+V d’une diapositive copiée, l’extension éteinte : elle se colle comme un texte, sans la conversion (ses cadres, ses tailles et ses notes restent), et sans enveloppe',
    s.html !== offHtml && s.html.includes('Notre offre') && /pp-free-frame|font-size/.test(s.html) && !s.html.includes('data-pp-slide'), { blocks: s.blocks });
  await a.press('Control+z');
  await sleep(400);
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await app.waitForFunction(() => document.getElementById('v2-btn-slide-text').getAttribute('aria-disabled') !== 'true', null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  s = await state(app);
  check(tag + 'extension rallumée : la ligne et le volet se dégrisent, l’indication revient', (await rowOf(app)).aria !== 'true' && s.listDisabled === 'false' && s.hint === T.hintKeep, { row: await rowOf(app), list: s.listDisabled, hint: s.hint });

  // --- L'écran change : le volet se ferme avec le document.
  await open(A, 4);
  s = await state(app);
  const mail = await rowOf(app);
  check(tag + 'un e-mail à l’écran ferme le volet, et la ligne y est grisée (texte brut)', !s.open && !s.bodyOn && mail.locked, { open: s.open, row: mail });
  await open(A, 7);
  check(tag + 'de retour sur un document, la ligne est de nouveau active', !(await rowOf(app)).locked, await rowOf(app));

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
