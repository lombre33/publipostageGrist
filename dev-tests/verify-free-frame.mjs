#!/usr/bin/env node
// Les cadres de texte libres d'une présentation (js/free-frame.js, css/free-frame.css, js/objects-menu.js ; demande du 21/10 à 18:35 et cartes « Où cliquer ? » et
// « Quand le texte déborde ? »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives »
// active. Un modèle neuf par scénario (un modèle modifié poserait sa question « Enregistrer / Abandonner / Annuler » à l'ouverture du suivant : il est enregistré avant).
//  L'ENTRÉE : le bouton « Objets » est dans la barre d'outils du haut (demande du 22/10 : il était sous les miniatures), juste après « Image », entier dans le panneau, lisible (>= 4,5:1), nommé
//   selon la diapositive du curseur ; la bande n'a plus que « Ajouter » et « Importer » ; le survol de la souris ouvre son menu, sous lui, au premier plan et dans le panneau ; au clavier (Entrée, ↓,
//   Échap) il s'ouvre, se parcourt et rend le clavier au bouton. « Cadre de texte » pose UN cadre au centre de la diapositive du curseur (384 x 72 pt), devant les autres, le curseur dedans, et
//   referme le menu ; un seul Ctrl+Z le défait.
//  LE CADRE : posé à l'endroit de la page que disent ses mesures (points depuis le coin de la page : l'éditeur, la Lecture et le diaporama au pixel près), de la largeur dite ; il grandit avec son
//   texte sans que sa hauteur enregistrée ne bouge ; ses bords le déplacent (sans toucher à sa taille), ses poignées le redimensionnent, UN pas d'historique par geste, Échap abandonne le geste, il
//   reste atteignable ; au clavier les flèches le déplacent (Maj : dix points), Entrée y pose le curseur, Échap le sélectionne, Suppr l'efface ; sa barre (fond, trait, épaisseur, premier plan,
//   arrière-plan, dupliquer, supprimer) est au premier plan, entière dans le panneau. Les formes, le fond et le trait ont leur propre essai : dev-tests/verify-shapes.mjs.
//  LE TEXTE : la miniature de la bande montre le texte du cadre, sans ses poignées ; un clic sur une miniature pose le curseur dans le texte de la diapositive, pas dans un cadre ; un collage qui porte
//   un cadre au milieu d'un texte le range au début de sa diapositive, hors d'une présentation il devient du texte ; rien ne se range au chargement d'un modèle.
//  LES SORTIES : le diaporama et la Lecture posent chaque cadre à ses mesures, sans feuille de plus pour un cadre posé au bas d'une diapositive ; le PDF (vrai clic) pose chaque cadre à sa place sur
//   la page (texte relu par pdf.js), sans page de plus ; le Word (vrai clic) en fait une zone de texte ancrée à la page (EMU), devant le texte ; le HTML et le Markdown gardent son texte, sans sa
//   position ; une présentation sans cadre part en PDF comme avant.
// Lancé par run-headless.mjs (groupe Node "freeFrame", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-free-frame.mjs
// FREE_FRAME_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, OBJECTS_BUTTON, objectRow, hoverObject, hoverObjectsButton, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.FREE_FRAME_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-free-frame', port: Number(process.env.FREE_FRAME_PORT || 8946) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FRAME = (x, y, w, h, html) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" style="--ff-x:${x}pt;--ff-y:${y}pt;--ff-w:${w}pt;--ff-h:${h}pt"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;
const LONG = '<p>Un long texte de cadre posé tout en bas de la diapositive, qui passe très largement la marge du bas de la page et qui devrait être rogné au bord de la page sans jamais créer de page en plus.</p><p>Deuxième paragraphe du même cadre.</p><p>Troisième paragraphe du même cadre.</p>';
// Huit paragraphes : un cadre posé près du bas de la page dont le texte passe de beaucoup le bord (l'essai de rognage).
const TALL = Array.from({ length: 8 }, (_, i) => `<p>Ligne ${i + 1} du cadre rogné au bord de la page, assez longue pour tenir sur une ligne ou deux.</p>`).join('');
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>`;
// Un cadre pivoté de `deg` degrés, et une ligne (deux bouts : sa boîte est celle de x, y, w, h) : de quoi essayer le point rouge d'un cadre qui sort de la page.
const TURNED = (x, y, w, h, deg, html) => FRAME(x, y, w, h, html).replace(`data-ff-h="${h}"`, `data-ff-h="${h}" data-ff-rot="${deg}"`);
const LINE_AT = (x, y, w, h) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
// Quarante-cinq lignes : le texte d'une diapositive qui passe sa page (la pagination en fait une page de plus).
const MANY = Array.from({ length: 45 }, (_, i) => `<p>Ligne ${i + 1} du texte long</p>`).join('');
// Les six diapositives de « Pivotés » : un cadre dans la page ; un cadre pivoté de 90° dont le HAUT sort (la boîte droite est dans la page, la boîte tournée non) ; un cadre dont la boîte DROITE sort
// par la droite mais que 90° fait rentrer ; une ligne dont un bout sort ; une ligne dans la page ; un cadre qui sort à droite sous un texte qui passe la page.
// Les deux diapositives de « Au bord » : la première porte un cadre posé trop bas (sa boîte sort de dix points par le bas) et un cadre qui sort par la droite ; la seconde n'en a pas.
const EDGE = `${FRAME(40, 510, 400, 40, '<p>Cadre posé trop bas</p>')}${FRAME(700, 100, 400, 40, '<p>Cadre qui sort à droite</p>')}<h1>Un</h1><p>Texte</p>${BR}<h1>Deux</h1>`;
const TURNEDSLIDES = `${FRAME(100, 100, 300, 40, '<p>Cadre dans la page</p>')}<h1>Un</h1>${BR}${TURNED(100, 100, 300, 40, 90, '<p>Pivoté qui sort par le haut</p>')}<h1>Deux</h1>${BR}${TURNED(760, 200, 300, 40, 90, '<p>Pivoté qui rentre</p>')}<h1>Trois</h1>${BR}${LINE_AT(900, 100, 100, 0)}<h1>Quatre</h1>${BR}${LINE_AT(100, 100, 200, 0)}<h1>Cinq</h1>${BR}${FRAME(800, 40, 300, 60, '<p>Cadre qui sort à droite</p>')}<h1>Six</h1>${MANY}`;
// Les quatre diapositives de « Posés » (8), reprises par « En-tête et pied » (15).
const POSED = `${FRAME(600, 60, 300, 40, '<p>Cadre un en haut à droite</p>')}<h1>Titre un</h1><p>Premier texte</p>${BR}${FRAME(100, 300, 400, 60, '<p>Cadre deux au milieu de la diapositive deux</p>')}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}${FRAME(40, 480, 500, 40, LONG)}<p>Trois</p>${BR}<p>Quatre</p>`;
// Les quatre diapositives de « Décor » (18), ce que l'import d'un PowerPoint pose : 1, un bandeau DERRIÈRE le texte, sans texte, qui dépasse la page des deux côtés (un décor est rogné à la page, rien n'y est perdu :
// pas de point rouge) ; 2, un cadre DERRIÈRE le texte qui a un texte et sort à droite (son texte est coupé : le point rouge) ; 3, un cadre sans fond ni trait dont seules les marges invisibles passent le bord (son
// texte est dans la page : pas de point rouge) ; 4, le même cadre avec un fond (sa boîte se voit, elle sort : le point rouge).
const BEHIND = frame => frame.replace('role="group"', 'role="group" data-ff-layer="behind"');
const FILLED = frame => frame.replace('role="group"', 'role="group" data-ff-fill="#d9e2f3"');
const DECOR = `${BEHIND(FRAME(-40, 0, 1040, 60, ''))}<h1>Un</h1>${BR}${BEHIND(FRAME(700, 100, 400, 40, '<p>Texte derrière</p>'))}<h1>Deux</h1>${BR}${FRAME(-7, 100, 974, 40, '<p>Au ras de la page</p>')}<h1>Trois</h1>${BR}${FILLED(FRAME(-7, 100, 974, 40, '<p>Au ras, avec un fond</p>'))}<h1>Quatre</h1>`;
// 7 « Cadres » : trois diapositives sans cadre (l'entrée, la pose) ; 12 « Gestes » : un cadre de 300 x 120 au début de la diapositive 2 (les gestes, le clavier) ; 13 « Barre » : trois diapositives sans
// cadre (la barre du cadre, la bande, le collage) ; 8 « Posés » : quatre diapositives dont trois portent un cadre, rangés au début de la leur (le diaporama, la Lecture, les exports) ; 9 « Document » :
// un document (un collage y perd ses cadres) ; 10 « Mal rangé » : un cadre au milieu du texte de la diapositive 1 (rien ne se range à l'ouverture) ; 11 « Sans cadre » : trois diapositives que le PDF
// a toujours montrées de la même façon ; 14 « Rogné » : un cadre posé près du bas de la page (son texte passe le bord) et un cadre qui dépasse le bord droit (le rognage à la page) ; 15 « En-tête et pied » : les quatre diapositives de « Posés » avec un
// en-tête et un pied de page (la bande que l'en-tête réserve en haut de chaque page) ; 16 « Pivotés » : six diapositives dont certaines portent un cadre ou une ligne qui sort de la page, et 17 « Au bord » : deux cadres qui en sortent (le point rouge de la bande).
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Cadres', '${SLIDES}', false, 'presentation');
  add(8, 'Posés', '${POSED}', false, 'presentation');
  add(9, 'Document', '<p>Début du document</p><p>Fin du document</p>', false, 'document');
  add(10, 'Mal rangé', '<h1>Titre un</h1><p>Premier texte</p>${FRAME(100, 100, 300, 40, '<p>Cadre au milieu</p>')}<p>Suite</p>${BR}<p>Deux</p>', false, 'presentation');
  add(11, 'Sans cadre', '<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><p>Texte deux</p>${BR}<p>Trois</p>', false, 'presentation');
  add(12, 'Gestes', '<h1>Titre un</h1><p>Premier texte</p>${BR}${FRAME(200, 150, 300, 120, '<p>Cadre</p>')}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>', false, 'presentation');
  add(13, 'Barre', '${SLIDES}', false, 'presentation');
  add(14, 'Rogné', '${FRAME(40, 440, 500, 40, TALL)}${FRAME(800, 40, 300, 60, '<p>Cadre qui dépasse le bord droit de la page, avec un texte assez long pour deux lignes.</p>')}<p>Après</p>${BR}<p>Deux</p>', false, 'presentation');
  add(15, 'En-tête et pied', '${POSED}', false, 'presentation');
  m.HeaderFooter[m.id.indexOf(15)] = JSON.stringify({ enabled: true, differentFirstPage: false, header: { default: '<p>En-tête de la présentation</p>', first: '' }, footer: { default: '<p>Pied de la présentation</p>', first: '' } });
  add(16, 'Pivotés', '${TURNEDSLIDES}', false, 'presentation');
  add(17, 'Au bord', '${EDGE}', false, 'presentation');
  add(18, 'Décor', '${DECOR}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 19;
`;

const TEXTS = {
  fr: { frameOverflow: 'Un cadre dépasse de la diapositive', textOverflow: 'Son contenu dépasse : la suite passe sur une diapositive de plus', item: (n, total) => `Diapositive ${n} sur ${total}`, button: 'Objets', buttonTip: n => `Ajouter un objet à la diapositive ${n}`, menu: 'Objets', row: 'Cadre de texte', rowTip: n => `Un cadre de texte libre au centre de la diapositive ${n}`, front: 'Premier plan', back: 'Arrière-plan', behind: 'Derrière le texte', animation: 'Animation…', orientation: 'Orientation du texte', columns: 'Colonnes de texte', duplicate: 'Dupliquer l\'objet', delete: 'Supprimer l\'objet', fill: 'Couleur de fond', line: 'Couleur du trait', lineWidth: 'Épaisseur du trait', dash: 'Style du trait', frame: 'Cadre de texte', typed: 'Mon cadre' },
  en: { frameOverflow: 'A frame extends beyond the slide', textOverflow: 'Its content overflows: the rest continues on one more slide', item: (n, total) => `Slide ${n} of ${total}`, button: 'Objects', buttonTip: n => `Add an object to slide ${n}`, menu: 'Objects', row: 'Text frame', rowTip: n => `A free text frame in the middle of slide ${n}`, front: 'Bring to front', back: 'Send to back', behind: 'Behind text', animation: 'Animation…', orientation: 'Text direction', columns: 'Text columns', duplicate: 'Duplicate the object', delete: 'Delete the object', fill: 'Fill color', line: 'Line color', lineWidth: 'Line weight', dash: 'Line style', frame: 'Text frame', typed: 'My frame' },
};
const PT = 96 / 72;
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Les outils d'une page ouverte : positions, premier plan, vrais clics (la souris vient de loin, la bande défile d'abord quand la miniature visée n'y est pas entière).
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const onTop = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && !!hit && (hit === el || el.contains(hit));
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const showInList = async (selector, index) => {
    const need = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const list = el && el.closest('.pp-slide-list');
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
  const hover = async (selector, index = 0) => {
    await showInList(selector, index);
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, options = {}) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y, options); await sleep(250); return c; };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, onTop, hover, click, leave };
}

// Les cadres du texte : leurs mesures enregistrées et leur texte, la forme du texte (types de nœuds de premier niveau), la sélection.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const frames = [];
  const shape = [];
  editor.state.doc.forEach((node, offset) => {
    shape.push(node.type.name === 'freeFrame' ? 'F' : node.type.name === 'pageBreak' ? '|' : node.type.name === 'heading' ? 'h' : node.type.name === 'paragraph' ? 'p' : node.type.name.slice(0, 2));
    if (node.type.name === 'freeFrame') frames.push({ pos: offset, x: node.attrs.x, y: node.attrs.y, w: node.attrs.w, h: node.attrs.h, text: node.textContent, blocks: node.childCount });
  });
  const sel = editor.state.selection;
  const found = FreeFrame.frameAround(sel.$from);
  return { frames, shape: shape.join(''), selection: { selectedFrame: !!(sel.node && sel.node.type.name === 'freeFrame'), inFrame: !!found && !sel.node, from: sel.from } };
});
// L'écran : la boîte de chaque cadre de l'éditeur (ou de la Lecture), et le haut de la page de chaque diapositive (le haut de son premier bloc de texte moins la marge de la page).
// `band` : la bande que l'en-tête réserve en haut de chaque page (0 sans en-tête) : le haut de la page est celui du corps moins la marge et cette bande.
const screenState = (page, root = '#editor-container', band = 0) => page.evaluate(([rootSel, bandPx]) => {
  const host = document.querySelector(rootSel);
  const content = host && host.querySelector('.tiptap, .reader-content');
  if (!content) return null;
  const zoom = rootSel === '#editor-container' ? EditorCore.layoutZoom(content) : (parseFloat(getComputedStyle(content).zoom) || 1);
  const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-margin-top')) || 0;
  const tops = [];
  let started = false;
  Array.from(content.children).forEach((child, i) => {
    const isBreak = child.classList.contains('page-break-marker');
    const isFrame = child.classList.contains('pp-free-frame');
    if (i === 0 || (tops.length && isBreak)) started = false;
    if (isBreak || isFrame || child.tagName === 'STYLE') return;
    if (!started) { tops.push(child.getBoundingClientRect().top - (margin + bandPx) * zoom); started = true; }
  });
  const boxes = Array.from(host.querySelectorAll('.pp-free-frame-box')).map((box) => {
    const r = box.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, text: box.textContent.trim() };
  });
  return { zoom, pageTops: tops, contentLeft: content.getBoundingClientRect().left, boxes };
}, [root, band]);
// Où la boîte d'un cadre doit être sur l'écran : à ses mesures, depuis le coin de la page de sa diapositive.
const expectedBox = (screen, slideIndex, frame) => ({
  left: screen.contentLeft + frame.x * PT * screen.zoom,
  top: screen.pageTops[slideIndex] + frame.y * PT * screen.zoom,
  width: frame.w * PT * screen.zoom,
});
const pdfPagesIn = path => (readFileSync(path).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, onTop, hover, click, leave } = toolsOf(page);
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  // « Enregistrer » au vrai clic ; la souris s'en va ensuite, sans quoi le menu au survol du bouton reste ouvert.
  const save = async () => { await leave(); await click('#btn-save'); await sleep(1000); await leave(); };
  const unsaved = () => page.evaluate(() => LiveEntry.hasUnsavedEdits());
  // L'appel `ouvrir` de GFS passe par le sélecteur de modèles : un modèle modifié est enregistré d'abord (sans quoi il poserait sa question « Enregistrer / Abandonner / Annuler »).
  const open = async (id, slides) => {
    if (await unsaved()) await save();
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    const opened = await page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
    if (!opened) check(tag + `le modèle ${id} s'ouvre`, false, await page.evaluate(() => Templates.getCurrentId()));
    return opened;
  };
  // Le cadre à l'écran, entier dans la zone visible du document : le faire défiler jusqu'à lui.
  const showFrame = async (index = 0) => {
    await page.evaluate((i) => { const box = document.querySelectorAll('#editor-container .pp-free-frame-box')[i]; if (box) box.scrollIntoView({ block: 'center', inline: 'center' }); }, index);
    await sleep(250);
    return rectOf('#editor-container .pp-free-frame-box', index);
  };
  const zoomNow = () => page.evaluate(() => EditorCore.layoutZoom(document.querySelector('#editor-container .tiptap')));
  // Le cadre `index` de l'éditeur ou de la Lecture, amené à l'écran, est rogné au bord de sa page : un point 6 px en dedans du bord (`side` : le bas ou le bord droit de la page) est-il sur le cadre,
  // et un point 6 px au-delà ? `over` dit de combien le cadre dépasse la page (en px écran) : l'essai ne vaut que si c'est assez pour tenir le point de dehors. `elementsFromPoint`, pas
  // `elementFromPoint` : la couture de la pagination de l'éditeur passe devant le cadre sans le rogner.
  const clipProbe = (root, index, side) => page.evaluate(([rootSel, i, which]) => {
    const host = document.querySelector(rootSel);
    const box = host.querySelectorAll('.pp-free-frame-box')[i];
    box.scrollIntoView({ block: 'center', inline: 'nearest' });
    const content = host.querySelector('.tiptap, .reader-content');
    const zoom = rootSel === '#editor-container' ? EditorCore.layoutZoom(content) : (parseFloat(getComputedStyle(content).zoom) || 1);
    const r = box.getBoundingClientRect();
    const size = PageLayout.getPageSizePt();
    const px = 96 / 72 * zoom;
    const at = box.parentElement;
    const onFrame = (xx, yy) => document.elementsFromPoint(xx, yy).some(el => !!el.closest && !!el.closest('.pp-free-frame-box'));
    if (which === 'bottom') {
      const edge = r.top + (size.height - parseFloat(at.getAttribute('data-ff-y'))) * px;
      const x = r.left + 60 * zoom;
      return { side: which, zoom, inside: onFrame(x, edge - 6), outside: onFrame(x, edge + 6), over: Math.round((r.bottom - edge) * 10) / 10, clip: getComputedStyle(box).clipPath };
    }
    const edge = r.left + (size.width - parseFloat(at.getAttribute('data-ff-x'))) * px;
    const y = r.top + 12 * zoom;
    return { side: which, zoom, inside: onFrame(edge - 6, y), outside: onFrame(edge + 6, y), over: Math.round((r.right - edge) * 10) / 10, clip: getComputedStyle(box).clipPath };
  }, [root, index, side]);
  // Une souris qui glisse : appui, trajet, relâchement (ou Échap avant le relâchement).
  const drag = async (from, dx, dy, { escape = false } = {}) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 3 });
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 3 });
    if (escape) await page.keyboard.press('Escape');
    await page.mouse.up();
    await sleep(350);
  };
  // Un appui sans glisser sur le bord du haut (au quart de sa largeur, loin des poignées) : sélectionne le cadre. Les points de bord sont à 1 pixel DANS la boîte.
  const topEdge = box => ({ x: box.left + box.width * 0.25, y: box.top + 1 });
  const press1 = async (point) => { await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.up(); await sleep(300); };
  const handlePoint = (side, index = 0) => rectOf('#editor-container .pp-free-frame .pp-ff-handle-' + side, index);
  const pageSize = () => page.evaluate(() => PageLayout.getPageSizePt());

  // --- 1. L'entrée : le bouton « Objets » de la barre d'outils du haut.
  console.log('\n' + tag + '1) Le bouton « Objets », son menu');
  await open(7, 3);
  await click('.pp-slide-item', 1);
  const button = await rectOf(OBJECTS_BUTTON);
  const imageButton = await rectOf('#v2-btn-image');
  check(tag + 'le bouton « Objets » est dans la barre d\'outils du haut, sur la même ligne qu\'« Image » et juste après lui, entier dans le panneau', !!button && !!imageButton && button.left >= imageButton.right - 1 && button.left - imageButton.right < 12 && Math.abs(button.top - imageButton.top) < 0.6 && inPanel(button) && await onTop(OBJECTS_BUTTON), { button, imageButton });
  const gone = await page.evaluate(() => ({ oldButton: !!document.querySelector('.pp-slide-objects-open'), oldMenu: !!document.querySelector('.pp-slide-objects'), stripButtons: document.querySelectorAll('.pp-slide-strip > .pp-slide-actions > .pp-slide-add').length }));
  check(tag + 'plus rien sous les miniatures : la bande n\'a que ses deux boutons « Ajouter » et « Importer », pas de bouton ni de menu « Objets »', !gone.oldButton && !gone.oldMenu && gone.stripButtons === 2, gone);
  const contrast = await contrastOf(page, OBJECTS_BUTTON);
  check(tag + 'l\'icône du bouton est lisible (>= 4,5:1)', contrast >= 4.5, contrast);
  // À 700x400 sous la barre d'outils, la bande a 249 px : la rangée de ses deux boutons (30 px de haut, 6 de rembourrage) laisse à la liste trois miniatures entières (51 px, 6 d'écart, 8 de
  // rembourrage), comme avec trois boutons sur une ligne (carte du 22/10 : « Trois icônes sur une ligne »).
  const stripFit = await page.evaluate(() => {
    const list = document.querySelector('.pp-slide-list');
    list.scrollTop = 0;
    const box = list.getBoundingClientRect();
    const rows = Array.from(list.querySelectorAll('.pp-slide-row')).map(row => row.getBoundingClientRect());
    const buttons = Array.from(document.querySelectorAll('.pp-slide-strip > .pp-slide-actions > .pp-slide-add')).map((b) => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; });
    return { whole: rows.filter(r => r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5).length, listBottom: Math.round(box.bottom), buttons, inner: window.innerHeight };
  });
  check(tag + 'à 700x400 la bande garde trois miniatures entières au-dessus de ses deux boutons (« Ajouter », « Importer »), côte à côte sur une ligne sans se recouvrir, entiers dans le panneau',
    stripFit.whole >= 3 && stripFit.buttons.length === 2 && stripFit.buttons[0].top >= stripFit.listBottom - 1 && stripFit.buttons.every((b, i) => b.top === stripFit.buttons[0].top && (i === 0 || b.left >= stripFit.buttons[i - 1].right)) && stripFit.buttons[1].bottom <= stripFit.inner, stripFit);
  // Le survol du bouton ouvre son menu, au-dessous (comme celui de l'Image) : la ligne « Cadre de texte » (info-bulle : la diapositive du curseur), puis les seize formes et les trois lignes.
  const closedLook = await page.evaluate(() => { const b = document.querySelector('#v2-btn-objects'); const m = document.querySelector('#v2-objects-flyout'); return { expanded: b.getAttribute('aria-expanded'), shown: m.getBoundingClientRect().width > 0 }; });
  await hoverObject(page, 'textFrame');
  const menu = await page.evaluate(() => {
    const b = document.querySelector('#v2-btn-objects');
    const m = document.querySelector('#v2-objects-flyout');
    const r = m.getBoundingClientRect();
    const rows = Array.from(m.querySelectorAll('[data-action]')).filter(x => !x.closest('[hidden]'));
    return {
      text: b.textContent.trim(), svg: !!b.querySelector('svg'), label: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded'), disabled: b.getAttribute('aria-disabled'),
      role: m.getAttribute('role'), menuLabel: m.getAttribute('aria-label'), heading: m.querySelector('.v2-hover-flyout-label').textContent.trim(),
      rows: rows.map(x => x.getAttribute('aria-label') || x.textContent.trim()), tips: rows.map(x => x.getAttribute('data-tip')), firstText: rows[0].textContent.trim(),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    };
  });
  check(tag + 'fermé, le menu ne se voit pas (aria-expanded jamais « true ») ; le survol l\'ouvre (« true »)', closedLook.expanded !== 'true' && !closedLook.shown && menu.expanded === 'true', { closedLook, expanded: menu.expanded });
  check(tag + `le bouton n'est qu'une icône (le nom « ${T.button} » est son aria-label, avec la diapositive 2 du curseur : « ${T.buttonTip(2)} »), non grisé`, menu.text === '' && menu.svg && menu.label === T.buttonTip(2) && menu.disabled === 'false', menu);
  check(tag + `le menu « ${T.menu} » (role menu) s'ouvre sous le bouton : la ligne « ${T.row} » (info-bulle : « ${T.rowTip(2)} ») puis les seize formes de l'onglet ouvert et les trois lignes (dev-tests/verify-shapes.mjs et verify-lines.mjs les essaient une à une), entier dans le panneau`, menu.role === 'menu' && menu.menuLabel === T.menu && menu.heading === T.menu && menu.rows.length === 20 && menu.firstText === T.row && menu.tips[0] === T.rowTip(2) && menu.rect.top >= button.bottom - 1 && menu.rect.left <= button.x && menu.rect.right >= button.x && inPanel(menu.rect), menu);
  check(tag + 'le menu est au premier plan (la ligne et la dernière icône reçoivent le clic)', await onTop(objectRow('textFrame')) && await onTop(objectRow('line:double')));
  await snap(page, `${lang}-menu`);
  await leave();
  check(tag + 'la souris partie, le menu se referme', (await page.evaluate(() => ({ expanded: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded'), shown: document.querySelector('#v2-objects-flyout').getBoundingClientRect().width > 0 }))).expanded === 'false');
  // Au clavier : le focus sur le bouton ouvre son menu, Entrée donne le clavier à la première ligne, ↓ passe au premier onglet des formes, Échap referme le menu et rend le clavier au bouton.
  await page.focus(OBJECTS_BUTTON);
  const focusOpen = await page.evaluate(() => document.querySelector('#v2-btn-objects').getAttribute('aria-expanded'));
  await press('Enter');
  const keyboardOpen = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.dataset.action, open: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded') }));
  await press('ArrowDown');
  const afterDown = await page.evaluate(() => document.activeElement && (document.activeElement.dataset.action || 'tab:' + document.activeElement.dataset.tab));
  await press('Escape');
  const afterEscape = await page.evaluate(() => ({ focusIsButton: document.activeElement === document.querySelector('#v2-btn-objects'), open: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded') }));
  check(tag + 'au clavier : le focus sur le bouton ouvre le menu, Entrée donne le clavier à la ligne « Cadre de texte », ↓ passe au premier onglet des formes, Échap referme le menu et rend le clavier au bouton', focusOpen === 'true' && keyboardOpen.focus === 'textFrame' && keyboardOpen.open === 'true' && afterDown === 'tab:common' && afterEscape.focusIsButton && afterEscape.open === 'false', { focusOpen, keyboardOpen, afterDown, afterEscape });
  // Refermé au clavier, la souris étant ailleurs : le premier survol qui suit rouvre le menu (sans cela il resterait fermé jusqu'à ce que la souris soit entrée puis sortie du groupe).
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await hoverObjectsButton(page);
  const reopened = await page.evaluate(() => ({ open: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded'), shown: document.querySelector('#v2-objects-flyout').getBoundingClientRect().width > 0 }));
  check(tag + 'refermé au clavier (Échap), le premier survol de la souris qui suit rouvre le menu', reopened.open === 'true' && reopened.shown, reopened);
  await leave();

  // --- 2. Poser un cadre : le vrai clic sur la ligne.
  console.log('\n' + tag + '2) Poser un cadre');
  await click('.pp-slide-item', 1);
  const before = await docState(page);
  const original = await page.evaluate(() => Editor.getHTML());
  await chooseObject(page, 'textFrame');
  const placed = await docState(page);
  check(tag + 'choisir la ligne referme le menu (la souris est encore dessus) et le bouton annonce « fermé »', (await page.evaluate(() => ({ open: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded'), shown: document.querySelector('#v2-objects-flyout').getBoundingClientRect().width > 0 }))).open === 'false');
  const size = await pageSize();
  check(tag + 'un cadre est posé au début de la diapositive 2, juste après le saut de page, rien d\'autre ne change (titre, texte, saut, CADRE, titre, liste, saut, texte)', before.shape === 'hp|hbu|p' && placed.shape === 'hp|Fhbu|p', { before: before.shape, placed: placed.shape });
  check(tag + 'ses mesures : au centre de la page (x au milieu de la largeur, y 234, 384 x 72 points)', placed.frames.length === 1 && near(placed.frames[0].x, (size.width - 384) / 2, 0.01) && placed.frames[0].y === 234 && placed.frames[0].w === 384 && placed.frames[0].h === 72, { frame: placed.frames, page: size });
  check(tag + 'le curseur est dans le texte du cadre, prêt à écrire (ni cadre sélectionné, ni curseur resté dans la diapositive)', placed.selection.inFrame && !placed.selection.selectedFrame, placed.selection);
  const activeClass = await page.evaluate(() => { const f = document.querySelector('#editor-container .pp-free-frame'); return { active: f.classList.contains('pp-ff-active'), role: f.getAttribute('role'), label: f.getAttribute('aria-label') }; });
  check(tag + `le cadre est nommé (« ${T.frame} », rôle group) et son contour plein dit que le curseur est dedans`, activeClass.active && activeClass.role === 'group' && activeClass.label === T.frame, activeClass);
  // Un seul Ctrl+Z défait la pose, Ctrl+Maj+Z la rétablit.
  await press('Control+z');
  const undone = await page.evaluate(() => Editor.getHTML());
  check(tag + 'un seul Ctrl+Z défait la pose : le texte redevient celui d\'avant, au caractère près', undone === original, { same: undone === original, frames: (await docState(page)).frames.length });
  await press('Control+Shift+z');
  const redone = await docState(page);
  check(tag + 'Ctrl+Maj+Z la rétablit, au même endroit, le curseur dedans', redone.frames.length === 1 && redone.shape === 'hp|Fhbu|p' && redone.frames[0].x === placed.frames[0].x && redone.frames[0].y === placed.frames[0].y && redone.selection.inFrame, redone);
  if (!redone.selection.inFrame) { const b = await showFrame(); await page.mouse.click(b.x, b.y); await sleep(250); }
  await page.keyboard.type(T.typed);
  await sleep(300);
  const typed = await docState(page);
  check(tag + `ce qu'on écrit va dans le cadre (« ${T.typed} ») et nulle part ailleurs`, typed.frames.length === 1 && typed.frames[0].text === T.typed && typed.frames[0].h === 72 && typed.shape === 'hp|Fhbu|p', typed);
  const screen2 = await screenState(page);
  const want2 = expectedBox(screen2, 1, typed.frames[0]);
  const box2 = screen2.boxes[0];
  check(tag + 'à l\'écran, la boîte est à ses mesures : bord gauche et haut comptés depuis le coin de la page de sa diapositive (à 1,5 pixel), largeur de 384 points', !!box2 && near(box2.left, want2.left, 1.5) && near(box2.top, want2.top, 1.5) && near(box2.width, want2.width, 1.5), { box2, want2, zoom: screen2.zoom, tops: screen2.pageTops });
  await snap(page, `${lang}-frame-typed`);
  // Le cadre grandit avec son texte : cinq lignes de plus, la hauteur enregistrée ne bouge pas.
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('Ligne ' + (i + 1)); }
  await sleep(300);
  const grown = await docState(page);
  const grownScreen = await screenState(page);
  check(tag + 'le cadre grandit à mesure qu\'on écrit : plus haut que ses 72 points, sans que la hauteur enregistrée change', grown.frames[0].blocks === 6 && grown.frames[0].h === 72 && grownScreen.boxes[0].height > 72 * PT * grownScreen.zoom + 10, { h: grown.frames[0].h, shown: grownScreen.boxes[0].height / PT / grownScreen.zoom });
  const overflow = await page.evaluate(() => { const box = document.querySelector('#editor-container .pp-free-frame-box'); const content = box.querySelector('.pp-free-frame-content'); return { boxH: box.getBoundingClientRect().height, textH: content.scrollHeight * (box.getBoundingClientRect().height / box.offsetHeight) }; });
  check(tag + 'aucune ligne ne dépasse la boîte (jamais plus bas que son texte)', overflow.textH <= overflow.boxH + 1, overflow);

  // --- 3. Les gestes à la souris : déplacer par un bord, redimensionner par une poignée, un pas d'historique chacun.
  console.log('\n' + tag + '3) Déplacer, redimensionner');
  await open(12, 3);
  await click('.pp-slide-item', 1);
  let box = await showFrame();
  const z = await zoomNow();
  const start = (await docState(page)).frames[0];
  check(tag + 'le cadre du modèle « Gestes » est là, à ses mesures (200 ; 150 ; 300 x 120)', !!start && start.x === 200 && start.y === 150 && start.w === 300 && start.h === 120, start);
  const edge = topEdge(box);
  const edgeHit = await page.evaluate(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit ? { cls: String(hit.className), cursor: getComputedStyle(hit).cursor } : null; }, [edge.x, edge.y]);
  check(tag + 'le bord du cadre se saisit (sous la souris : le bord, curseur « déplacer »)', !!edgeHit && /pp-ff-edge/.test(edgeHit.cls) && edgeHit.cursor === 'move', edgeHit);
  await drag(edge, 60, 30);
  const moved = await docState(page);
  const dxPt = 60 / z / PT;
  const dyPt = 30 / z / PT;
  check(tag + 'glisser le bord déplace le cadre de la distance de la souris (en points de la page, quel que soit le zoom), SANS toucher à sa taille', near(moved.frames[0].x, start.x + dxPt, 1) && near(moved.frames[0].y, start.y + dyPt, 1) && moved.frames[0].w === start.w && moved.frames[0].h === start.h, { start, moved: moved.frames[0], dxPt, dyPt });
  check(tag + 'le cadre est alors sélectionné (clavier à lui)', moved.selection.selectedFrame, moved.selection);
  const toolbar = await page.evaluate(() => { const bar = document.querySelector('.v2-frame-toolbar'); if (!bar) return null; const r = bar.getBoundingClientRect(); const buttons = Array.from(bar.querySelectorAll('button')).filter(btn => getComputedStyle(btn).display !== 'none' && btn.getBoundingClientRect().width > 0); return { visible: r.width > 0 && bar.classList.contains('visible'), actions: buttons.map(b => b.dataset.action), titles: buttons.map(b => b.title), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }; });
  check(tag + `sa barre flottante s'ouvre (${T.fill}, ${T.line}, ${T.lineWidth}, ${T.dash}, ${T.front}, ${T.back}, ${T.behind}, ${T.animation}, ${T.orientation}, ${T.columns}, ${T.duplicate}, ${T.delete}), entière dans le panneau`, !!toolbar && toolbar.visible && JSON.stringify(toolbar.actions) === JSON.stringify(['fill-open', 'line-open', 'width-open', 'dash-open', 'front', 'back', 'behind', 'animate', 'orient-open', 'columns-open', 'duplicate', 'delete']) && JSON.stringify(toolbar.titles) === JSON.stringify([T.fill, T.line, T.lineWidth, T.dash, T.front, T.back, T.behind, T.animation, T.orientation, T.columns, T.duplicate, T.delete]) && inPanel(toolbar.rect), toolbar);
  check(tag + 'la barre est au premier plan', await onTop('.v2-frame-toolbar button'));
  await snap(page, `${lang}-frame-selected`);
  await press('Control+z');
  const afterUndo = await docState(page);
  check(tag + 'un seul Ctrl+Z annule tout le glissement (x et y reviennent ensemble)', afterUndo.frames[0].x === start.x && afterUndo.frames[0].y === start.y, afterUndo.frames[0]);
  // Une poignée : le cadre est sélectionné par un appui sur son bord, les poignées se montrent ; l'angle bas droit.
  box = await showFrame();
  await press1(topEdge(box));
  const se = await handlePoint('se');
  check(tag + 'cadre sélectionné, ses huit poignées se montrent', (await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-free-frame .pp-ff-handle')).filter(h => getComputedStyle(h).display !== 'none').length)) === 8 && !!se && se.width > 0, se);
  await drag(se, 50, 20);
  const resized = await docState(page);
  check(tag + 'glisser la poignée bas droite agrandit le cadre de la distance de la souris (en points), sans le déplacer', near(resized.frames[0].w, start.w + 50 / z / PT, 1) && near(resized.frames[0].h, start.h + 20 / z / PT, 1) && resized.frames[0].x === start.x && resized.frames[0].y === start.y, { start, resized: resized.frames[0] });
  await press('Control+z');
  check(tag + 'un seul Ctrl+Z annule tout l\'agrandissement (largeur et hauteur ensemble)', (await docState(page)).frames[0].w === start.w && (await docState(page)).frames[0].h === start.h);
  // Une poignée du côté seul (« e ») ne touche pas à la hauteur, même quand le texte demande plus.
  box = await showFrame();
  await press1(topEdge(box));
  const east = await handlePoint('e');
  await drag(east, -40, 0);
  const narrowed = await docState(page);
  check(tag + 'la poignée de droite ne change que la largeur : la hauteur enregistrée reste celle du cadre', near(narrowed.frames[0].w, start.w - 40 / z / PT, 1) && narrowed.frames[0].h === start.h && narrowed.frames[0].x === start.x && narrowed.frames[0].y === start.y, { start, narrowed: narrowed.frames[0] });
  await press('Control+z');
  // Raccourcir sous le texte : la hauteur enregistrée tombe au minimum, la boîte montre alors son texte.
  box = await showFrame();
  await press1(topEdge(box));
  const south = await handlePoint('s');
  await drag(south, 0, -400);
  const shrunk = await docState(page);
  const shrunkBox = await rectOf('#editor-container .pp-free-frame-box');
  check(tag + 'raccourcie sous son texte, la hauteur enregistrée tombe au minimum (12 points) et la boîte montre son texte, sans le couper', shrunk.frames[0].h === 12 && shrunkBox.height > 12 * PT * z && shrunkBox.height < start.h * PT * z, { shrunk: shrunk.frames[0], shown: shrunkBox.height / PT / z });
  await press('Control+z');
  // Échap abandonne le geste : rien n'est écrit, la boîte revient à ses mesures.
  box = await showFrame();
  const before2 = await docState(page);
  await drag(topEdge(box), 70, 40, { escape: true });
  const aborted = await docState(page);
  check(tag + 'Échap pendant le glissement l\'abandonne : mesures inchangées', aborted.frames[0].x === before2.frames[0].x && aborted.frames[0].y === before2.frames[0].y, { before: before2.frames[0], aborted: aborted.frames[0] });
  const abortedBox = await rectOf('#editor-container .pp-free-frame-box');
  const wantAborted = expectedBox(await screenState(page), 1, aborted.frames[0]);
  check(tag + 'et la boîte revient à ses mesures à l\'écran', near(abortedBox.left, wantAborted.left, 1.5) && near(abortedBox.top, wantAborted.top, 1.5), { abortedBox, wantAborted });
  // Le cadre reste atteignable : tiré très loin à droite et en bas, 24 points restent sur la page.
  box = await showFrame();
  await drag(topEdge(box), 2000, 2000);
  const far = await docState(page);
  const pageSizePt = await pageSize();
  check(tag + 'tiré hors de la page, le cadre reste atteignable : au moins 24 points de lui restent dessus', far.frames[0].x <= pageSizePt.width - 24 + 0.01 && far.frames[0].y <= pageSizePt.height - 24 + 0.01 && far.frames[0].x > start.x, { frame: far.frames[0], page: pageSizePt });
  await press('Control+z');

  // --- 4. Le clavier : le cadre sélectionné.
  console.log('\n' + tag + '4) Au clavier');
  const keyStart = (await docState(page)).frames[0];
  box = await showFrame();
  await press1(topEdge(box));
  const pressed = await docState(page);
  check(tag + 'un simple appui sur le bord sélectionne le cadre, sans le déplacer', pressed.selection.selectedFrame && pressed.frames[0].x === keyStart.x && pressed.frames[0].y === keyStart.y, pressed);
  await press('ArrowRight');
  const right = (await docState(page)).frames[0];
  await press('Shift+ArrowDown');
  const down = (await docState(page)).frames[0];
  check(tag + 'cadre sélectionné : → le déplace d\'un point, Maj+↓ de dix', right.x === keyStart.x + 1 && right.y === keyStart.y && down.y === keyStart.y + 10 && down.x === keyStart.x + 1, { keyStart, right, down });
  await press('Enter');
  const inside = await docState(page);
  check(tag + 'Entrée pose le curseur dans le texte du cadre', inside.selection.inFrame && !inside.selection.selectedFrame, inside.selection);
  await press('Escape');
  const outside = await docState(page);
  check(tag + 'Échap, dans le texte du cadre, sélectionne le cadre', outside.selection.selectedFrame, outside.selection);
  await press('Delete');
  const deleted = await docState(page);
  check(tag + 'Suppr efface le cadre sélectionné, rien d\'autre', deleted.frames.length === 0 && deleted.shape === 'hp|hbu|p', deleted);
  await press('Control+z');
  const restored = await docState(page);
  check(tag + 'et Ctrl+Z le rend, avec ses dernières mesures', restored.frames.length === 1 && restored.frames[0].x === down.x && restored.frames[0].y === down.y, restored.frames);

  // --- 4b. Le point rouge de la bande : un cadre qui sort de sa diapositive (carte du 22/10, « Un point rouge sur la miniature »).
  console.log('\n' + tag + '4b) Le point rouge d\'un cadre qui dépasse de la diapositive');
  // Pour chaque miniature : son point rouge (montré ou non, sa taille), son info-bulle et le nom de la miniature.
  const dots = () => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map((item) => {
    const dot = item.querySelector('.pp-slide-overflow');
    const r = dot.getBoundingClientRect();
    return { shown: !dot.hidden && r.width > 0 && r.height > 0, title: dot.title, label: item.getAttribute('aria-label'), size: [Math.round(r.width), Math.round(r.height)] };
  }));
  const flagsOf = list => list.map(d => (d.shown ? '1' : '0')).join('');
  await open(17, 2);
  let dotsNow = await dots();
  check(tag + '« Au bord » : la miniature de la diapositive 1 (un cadre posé trop bas, un cadre qui sort à droite) porte le point rouge, celle de la 2 non',
    flagsOf(dotsNow) === '10' && dotsNow[0].size[0] === 8 && dotsNow[0].size[1] === 8, dotsNow);
  check(tag + 'l\'info-bulle du point dit « ' + T.frameOverflow + ' », et le nom de la miniature aussi',
    dotsNow[0].title === T.frameOverflow && dotsNow[0].label === T.item(1, 2) + ' · ' + T.frameOverflow && dotsNow[1].label === T.item(2, 2), dotsNow);
  const edgeZoom = await zoomNow();
  const pxPerPt = PT * edgeZoom;
  let edgeBox = await showFrame(1);
  await drag(topEdge(edgeBox), -150 * pxPerPt, 0);
  const movedRight = (await docState(page)).frames;
  dotsNow = await dots();
  check(tag + 'un vrai glissement ramène le cadre de droite dans la page (700 → ~550) : le point reste, le cadre du bas sort encore', near(movedRight[1].x, 550, 6) && flagsOf(dotsNow) === '10', { frames: movedRight, dotsNow });
  edgeBox = await showFrame(0);
  await drag(topEdge(edgeBox), 0, -24 * pxPerPt);
  const movedUp = (await docState(page)).frames;
  dotsNow = await dots();
  check(tag + 'le cadre du bas remonté (510 → ~486) : plus rien ne sort de la page, le point rouge a disparu', near(movedUp[0].y, 486, 4) && flagsOf(dotsNow) === '00' && dotsNow[0].label === T.item(1, 2), { frames: movedUp, dotsNow });
  await press('Control+z');
  dotsNow = await dots();
  check(tag + 'Ctrl+Z défait le dernier glissement : le cadre du bas ressort, le point rouge revient', flagsOf(dotsNow) === '10' && dotsNow[0].title === T.frameOverflow, dotsNow);
  // « Posés » : la hauteur enregistrée du cadre de la diapositive 3 (40 points) le laisse dans la page, mais son texte, plus haut, la passe : c'est la boîte DESSINÉE qui compte.
  await open(8, 4);
  dotsNow = await dots();
  const tallBox = await page.evaluate(() => { const b = document.querySelectorAll('#editor-container .pp-free-frame-box')[2]; return { stored: parseFloat(b.parentElement.getAttribute('data-ff-h')), y: parseFloat(b.parentElement.getAttribute('data-ff-y')), shownPt: b.offsetHeight * 0.75, pagePt: PageLayout.getPageSizePt().height }; });
  check(tag + 'la boîte d\'un cadre grandit avec son texte : celui de la diapositive 3, posé à 480 pt avec 40 pt réglés, passe le bas de la page par son texte : seule sa miniature porte le point',
    flagsOf(dotsNow) === '0010' && tallBox.y + tallBox.stored <= tallBox.pagePt && tallBox.y + tallBox.shownPt > tallBox.pagePt + 1 && dotsNow[2].title === T.frameOverflow, { dotsNow, tallBox });
  // « Pivotés » : la boîte TOURNÉE compte, pas la droite ; une ligne, par ses deux bouts.
  await open(16, 6);
  dotsNow = await dots();
  check(tag + '« Pivotés » : un cadre dans la page, aucun point (1) ; tourné de 90°, son haut sort : le point (2) ; sa boîte droite sort par la droite mais tournée elle rentre : aucun point (3) ; une ligne dont un bout sort : le point (4) ; une ligne dans la page : aucun (5)',
    flagsOf(dotsNow).slice(0, 5) === '01010' && dotsNow[1].title === T.frameOverflow && dotsNow[3].title === T.frameOverflow, dotsNow);
  check(tag + 'la diapositive 6 (un cadre qui sort à droite, un texte qui passe la page) dit les deux, le texte d\'abord, séparés par « · », dans l\'info-bulle comme dans le nom de la miniature',
    dotsNow[5].shown && dotsNow[5].title === T.textOverflow + ' · ' + T.frameOverflow && dotsNow[5].label === T.item(6, 6) + ' · ' + T.textOverflow + ' · ' + T.frameOverflow, dotsNow[5]);
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    let found = null;
    ed.state.doc.descendants((node, pos) => { if (!found && node.type.name === 'freeFrame' && node.attrs.rot === 90 && node.attrs.x === 100) found = pos; });
    FreeFrame.patch(ed, found, { rot: 0 });
  });
  await sleep(500);
  dotsNow = await dots();
  check(tag + 'remis droit (rot 0°), le cadre de la diapositive 2 est dans la page : son point rouge disparaît, les autres ne bougent pas', flagsOf(dotsNow) === '000101', dotsNow);
  // « Décor » : ce que l'import d'un PowerPoint pose. Un bandeau derrière le texte, sans texte, est rogné à la page par construction ; un cadre sans fond ni trait n'a que son texte pour se voir, ses marges ne comptent pas.
  await open(18, 4);
  dotsNow = await dots();
  check(tag + '« Décor » : un bandeau derrière le texte qui dépasse la page (1) et un cadre sans fond au ras de la page (3) n\'allument rien ; un cadre derrière le texte AVEC du texte qui sort (2) et le même cadre au ras avec un fond (4) allument le point',
    flagsOf(dotsNow) === '0101' && dotsNow[1].title === T.frameOverflow && dotsNow[3].title === T.frameOverflow, dotsNow);

  if (!full) return;

  // --- 5. La barre : premier plan, arrière-plan, dupliquer, supprimer.
  console.log('\n' + tag + '5) La barre du cadre');
  await open(13, 3);
  await click('.pp-slide-item', 1);
  for (const label of ['Un', 'Deux']) {
    await chooseObject(page, 'textFrame');
    await page.keyboard.type('Cadre ' + label);
    await sleep(300);
  }
  let two = await docState(page);
  check(tag + 'deux cadres posés se suivent au début de la diapositive 2, le dernier devant (ordre du texte), le second glissé de 12 points (jamais sur le premier)', two.frames.length === 2 && two.frames[0].text === 'Cadre Un' && two.frames[1].text === 'Cadre Deux' && near(two.frames[1].x, two.frames[0].x + 12, 0.01) && near(two.frames[1].y, two.frames[0].y + 12, 0.01) && two.shape === 'hp|FFhbu|p', two);
  // Sélectionner le premier par un appui sur son bord (le second le recouvre en partie, pas sur le quart gauche de son bord du haut), puis « Premier plan » à la vraie souris.
  const firstBox = await showFrame(0);
  await press1(topEdge(firstBox));
  check(tag + 'le premier cadre, pris par son bord, est sélectionné et sa barre est là', (await docState(page)).selection.selectedFrame && (await onTop('.v2-frame-toolbar button')));
  await click('.v2-frame-toolbar [data-action="front"]');
  two = await docState(page);
  check(tag + `le premier cadre passe au premier plan (« ${T.front} ») : l'ordre du texte s'inverse`, two.frames.length === 2 && two.frames[1].text === 'Cadre Un' && two.frames[0].text === 'Cadre Deux' && two.selection.selectedFrame, two.frames.map(f => f.text));
  await click('.v2-frame-toolbar [data-action="back"]');
  two = await docState(page);
  check(tag + `« ${T.back} » le renvoie derrière`, two.frames[0].text === 'Cadre Un' && two.frames[1].text === 'Cadre Deux', two.frames.map(f => f.text));
  await click('.v2-frame-toolbar [data-action="duplicate"]');
  two = await docState(page);
  // Le premier pas de 12 points est pris par « Cadre Deux » : la copie va au pas suivant, jamais sur un autre cadre.
  check(tag + `« ${T.duplicate} » pose une copie décalée de 12 points en 12 points jusqu'à une place libre (ici 24, la première est prise), devant, sélectionnée`, two.frames.length === 3 && two.frames[2].text === 'Cadre Un' && near(two.frames[2].x, two.frames[0].x + 24, 0.01) && near(two.frames[2].y, two.frames[0].y + 24, 0.01) && two.selection.selectedFrame, two.frames);
  await click('.v2-frame-toolbar [data-action="delete"]');
  two = await docState(page);
  check(tag + `« ${T.delete} » efface le cadre sélectionné (la copie) et rend le clavier au texte`, two.frames.length === 2 && !two.selection.selectedFrame, { frames: two.frames.length, selection: two.selection });

  // --- 6. La bande et le collage.
  console.log('\n' + tag + '6) La bande, le collage');
  const stripThumb = await page.evaluate(() => { const items = Array.from(document.querySelectorAll('.pp-slide-item')); const pageEl = items[1].querySelector('.pp-slide-page'); return { text: pageEl.textContent, visibleUi: Array.from(pageEl.querySelectorAll('.pp-ff-ui')).filter(e => getComputedStyle(e).display !== 'none').length, boxes: pageEl.querySelectorAll('.pp-free-frame-box').length }; });
  check(tag + 'la miniature de la diapositive 2 montre le texte des deux cadres, sans leurs bords ni leurs poignées', /Cadre Un/.test(stripThumb.text) && /Cadre Deux/.test(stripThumb.text) && stripThumb.boxes === 2 && stripThumb.visibleUi === 0, stripThumb);
  await click('.pp-slide-item', 0);
  check(tag + 'un clic sur une miniature pose le curseur dans le texte de la diapositive, pas dans un cadre', !(await docState(page)).selection.inFrame);
  await click('.pp-slide-item', 1);
  const intoSlide2 = await docState(page);
  check(tag + 'y compris sur la diapositive qui porte des cadres : le curseur est dans son texte (titre, liste), pas dans un cadre', !intoSlide2.selection.inFrame && !intoSlide2.selection.selectedFrame, intoSlide2.selection);
  // Un collage qui porte un cadre au milieu d'un texte : le cadre remonte au début de sa diapositive.
  await click('.pp-slide-item', 2);
  await page.evaluate((html) => { const ed = EditorCore.getEditor(); ed.commands.focus('end'); ed.view.pasteHTML(html); }, '<p>Texte collé</p>' + FRAME(50, 50, 200, 40, '<p>Cadre collé</p>') + '<p>Suite collée</p>');
  await sleep(500);
  const pasted = await docState(page);
  check(tag + 'collé au milieu d\'un texte, un cadre est rangé au début de sa diapositive (après le saut de page), son texte reste où le curseur était', pasted.frames.length === 3 && /Cadre collé/.test(pasted.frames[2].text) && pasted.shape === 'hp|FFhbu|Fpp', pasted);
  // Hors d'une présentation, un cadre collé devient du texte.
  await open(9);
  await page.evaluate((html) => { const ed = EditorCore.getEditor(); ed.commands.focus('end'); ed.view.pasteHTML(html); }, '<p>Texte collé</p>' + FRAME(50, 50, 200, 40, '<p>Cadre collé</p>'));
  await sleep(500);
  const asText = await page.evaluate(() => ({ frames: document.querySelectorAll('#editor-container .pp-free-frame').length, text: EditorCore.getEditor().state.doc.textContent }));
  check(tag + 'dans un document, le cadre collé devient du texte ordinaire (aucun cadre, son texte est là)', asText.frames === 0 && /Cadre collé/.test(asText.text) && /Texte collé/.test(asText.text), asText);
  // Rien ne se range à l'ouverture d'un modèle : un cadre au milieu du texte reste où l'enregistrement l'a mis, et le modèle n'est pas « modifié ».
  await open(10, 2);
  await sleep(600);
  const loaded = await page.evaluate(() => ({ shape: (() => { const s = []; EditorCore.getEditor().state.doc.forEach(n => s.push(n.type.name)); return s.join(','); })(), dirty: LiveEntry.hasUnsavedEdits() }));
  check(tag + 'à l\'ouverture d\'un modèle, le cadre posé au milieu du texte n\'est pas déplacé et le modèle n\'est pas modifié (ouvrir n\'écrit rien)', loaded.shape === 'heading,paragraph,freeFrame,paragraph,pageBreak,paragraph' && loaded.dirty === false, loaded);

  // --- 7. Le diaporama et la Lecture : les cadres à leurs mesures.
  console.log('\n' + tag + '7) Le diaporama, la Lecture');
  // Rogné à sa diapositive : un cadre posé près du bas de la page, dont le texte passe le bord, et un cadre qui dépasse le bord droit. Dans l'éditeur comme à la Lecture, rien d'eux ne se montre au-delà
  // du bord de la page (ni sur la couture entre deux pages, ni sur la diapositive d'après) ; en dedans du bord, ils sont là.
  await open(14, 2);
  const clipEditor = [await clipProbe('#editor-container', 0, 'bottom'), await clipProbe('#editor-container', 1, 'right')];
  const clipped = probe => probe.over >= 10 && probe.inside && !probe.outside;
  check(tag + 'dans l\'éditeur, le cadre posé près du bas de la diapositive dépasse sa page mais n\'en montre rien au-delà de son bord', clipped(clipEditor[0]), clipEditor[0]);
  check(tag + 'dans l\'éditeur, le cadre qui dépasse le bord droit de la page est rogné à ce bord', clipped(clipEditor[1]), clipEditor[1]);
  await leave();
  await click('#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const clipReader = [await clipProbe('#reader-container', 0, 'bottom'), await clipProbe('#reader-container', 1, 'right')];
  check(tag + 'à la Lecture, le cadre posé près du bas de la diapositive est rogné au bas de sa page', clipped(clipReader[0]), clipReader[0]);
  check(tag + 'à la Lecture, le cadre qui dépasse le bord droit de la page est rogné à ce bord', clipped(clipReader[1]), clipReader[1]);
  await click('#btn-mode-edit');
  await sleep(900);
  // Les trois vues à l'écran d'un modèle de quatre diapositives dont trois portent un cadre : le diaporama, la Lecture, l'éditeur. `band` : la bande que son en-tête réserve en haut de chaque page
  // (0 sans en-tête), `why` : ce qui le distingue dans le nom des vérifications.
  const onScreen = async (id, band, why) => {
    await open(id, 4);
    const frames8 = (await docState(page)).frames;
    await click('.pp-slide-item', 0);
    await leave();
    await click('.pp-slide-show-open');
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
    await sleep(700);
    const showAt = () => page.evaluate(() => {
      const root = document.querySelector('.pp-slide-show');
      const host = root && root.querySelector('.pp-slide-show-host');
      const shadow = host && host.shadowRoot;
      if (!shadow) return null;
      // La feuille de la page : le parent de sa fenêtre (un calque de transition l'enveloppe depuis les transitions).
      const window_ = shadow.querySelector('.pp-print-window');
      const sheet = window_ && window_.parentElement;
      if (!sheet) return null;
      const s = sheet.getBoundingClientRect();
      const scale = s.width / sheet.offsetWidth;
      const inSheet = Array.from(shadow.querySelectorAll('.pp-free-frame-box')).map((b) => { const r = b.getBoundingClientRect(); return { left: (r.left - s.left) / scale, top: (r.top - s.top) / scale, width: r.width / scale, text: b.textContent.trim().slice(0, 30), visible: r.top >= s.top - 1 && r.top < s.bottom && r.left >= s.left - 1 && r.left < s.right }; }).filter(b => b.visible);
      return { counter: root.querySelector('.pp-slide-show-counter').textContent.trim(), paper: { width: sheet.offsetWidth, height: sheet.offsetHeight }, scale, frames: inSheet };
    });
    const counterOf = (n, total) => page.evaluate(([a, b]) => I18n.t('slides.show.counter', { n: a, total: b }), [n, total]);
    const shows = [];
    for (let i = 0; i < 4; i++) {
      shows.push(await showAt());
      if (i < 3) await press('ArrowRight');
    }
    check(tag + why + 'le diaporama montre quatre diapositives, une feuille chacune : le cadre du bas de la diapositive 3 n\'en ajoute aucune', shows[0] && shows[0].counter === await counterOf(1, 4) && shows[3] && shows[3].counter === await counterOf(4, 4), shows.map(s => s && s.counter));
    const showOk = shows[0] && shows.slice(0, 3).every((s, i) => s && s.frames.length === 1 && near(s.frames[0].left, frames8[i].x * PT, 1.5) && near(s.frames[0].top, frames8[i].y * PT, 1.5) && near(s.frames[0].width, frames8[i].w * PT, 1.5)) && shows[3].frames.length === 0;
    check(tag + why + 'au diaporama, chaque cadre est à ses mesures sur sa feuille (à 1,5 pixel de la page), un seul par feuille, aucun sur la quatrième', showOk, shows.map(s => s && s.frames));
    await snap(page, `${lang}-show-3${band ? '-en-tete' : ''}`);
    await press('Escape');
    await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
    await sleep(300);
    check(tag + why + 'Échap quitte le diaporama', !(await page.evaluate(() => !!document.querySelector('.pp-slide-show'))));
    await leave();
    await click('#btn-mode-read');
    await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content'), null, { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    const readerScreen = await screenState(page, '#reader-container', band);
    const readerFrames = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .pp-free-frame')).map(f => ({ x: parseFloat(f.getAttribute('data-ff-x')), y: parseFloat(f.getAttribute('data-ff-y')), w: parseFloat(f.getAttribute('data-ff-w')), h: parseFloat(f.getAttribute('data-ff-h')) })));
    const readerOk = !!readerScreen && readerFrames.length === 3 && readerScreen.boxes.length === 3 && [0, 1, 2].every((slide) => {
      const want = expectedBox(readerScreen, slide, readerFrames[slide]);
      const got = readerScreen.boxes[slide];
      return near(got.left, want.left, 1.5) && near(got.top, want.top, 1.5) && near(got.width, want.width, 1.5);
    });
    check(tag + why + 'dans la Lecture, chaque cadre est à ses mesures depuis le coin de la page de sa diapositive (à 1,5 pixel), les trois', readerOk, { readerScreen, readerFrames });
    const readerUi = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .pp-ff-ui')).filter(e => getComputedStyle(e).display !== 'none').length);
    check(tag + why + 'sans bord ni poignée dans la Lecture', readerUi === 0, readerUi);
    await snap(page, `${lang}-reader${band ? '-en-tete' : ''}`);
    await click('#btn-mode-edit');
    await sleep(900);
    // Dans l'éditeur, les trois cadres sont à leurs mesures aussi.
    const editScreen = await screenState(page, '#editor-container', band);
    const editFrames = (await docState(page)).frames;
    const editOk = !!editScreen && editFrames.length === 3 && [0, 1, 2].every((slide) => {
      const want = expectedBox(editScreen, slide, editFrames[slide]);
      const got = editScreen.boxes[slide];
      return got && near(got.left, want.left, 1.5) && near(got.top, want.top, 1.5) && near(got.width, want.width, 1.5);
    });
    check(tag + why + 'dans l\'éditeur de même, les trois cadres sont à leurs mesures', editOk, { editScreen, editFrames });
    // La miniature de la bande n'a pas de bande d'en-tête : son cadre est à la même fraction de la page que sur la page elle-même.
    const thumbs = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-thumb')).slice(0, 3).map((thumb) => {
      const sheet = thumb.querySelector('.pp-slide-page');
      const box = thumb.querySelector('.pp-free-frame-box');
      if (!sheet || !box) return null;
      const s = sheet.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      return { y: parseFloat(box.parentElement.getAttribute('data-ff-y')), x: parseFloat(box.parentElement.getAttribute('data-ff-x')), gotY: (b.top - s.top) / s.height, gotX: (b.left - s.left) / s.width };
    }));
    const size = await pageSize();
    check(tag + why + 'dans la miniature de la bande, chaque cadre est à la même fraction de la page que sur la page (à 0,5 %)', thumbs.length === 3 && thumbs.every(th => th && near(th.gotY, th.y / size.height, 0.005) && near(th.gotX, th.x / size.width, 0.005)), thumbs);
  };
  await onScreen(15, await page.evaluate(() => PageLayout.HEADER_FOOTER_BAND_PX), 'avec un en-tête et un pied, ');
  await onScreen(8, 0, '');

  // --- 8. Les exports : le PDF, le Word, le HTML et le Markdown.
  console.log('\n' + tag + '8) Les exports');
  await leave();
  const [pdfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const pdfPath = await pdfDownload.path();
  const pdfBytes = readFileSync(pdfPath);
  const readPdf = b64 => page.evaluate(async (data64) => {
    if (!window.pdfjsLib) {
      await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const raw = atob(data64);
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const v = p.getViewport({ scale: 1 });
      const content = await p.getTextContent();
      const lines = {};
      content.items.filter(it => it.str.trim()).forEach((it) => { const y = Math.round((v.height - it.transform[5]) * 10) / 10; (lines[y] = lines[y] || []).push([it.transform[4], it.str]); });
      pages.push({ width: Math.round(v.width * 100) / 100, height: v.height, lines: Object.keys(lines).map(Number).sort((a, b) => a - b).map(y => ({ y, x: Math.round(Math.min(...lines[y].map(l => l[0])) * 10) / 10, text: lines[y].sort((a, b) => a[0] - b[0]).map(l => l[1]).join(' ') })) });
    }
    return { numPages: doc.numPages, pages };
  }, b64);
  const pdf = await readPdf(pdfBytes.toString('base64'));
  const lineOf = (doc, p, text) => doc.pages[p] && doc.pages[p].lines.find(l => l.text.indexOf(text) >= 0);
  check(tag + 'le PDF a quatre pages, une par diapositive : le cadre du bas de la diapositive 3 n\'ajoute aucune page', pdf.numPages === 4 && pdfPagesIn(pdfPath) === 4, { pages: pdf.numPages });
  const f1 = lineOf(pdf, 0, 'Cadre un en haut');
  const f2 = lineOf(pdf, 1, 'Cadre deux');
  const f3 = lineOf(pdf, 2, 'Un long texte');
  // Le texte d'un cadre commence à son bord + 7,2 points (marge intérieure) ; sa première ligne à son haut + 3,6 + la ligne de base (~9,7 points).
  check(tag + 'le PDF pose le cadre 1 à sa place : x = 600 + 7,2 et sa première ligne à 60 + 3,6 + 9,7 points du haut (à 0,6 point), sur la page 1', !!f1 && near(f1.x, 607.2) && near(f1.y, 73.3), f1);
  check(tag + 'le cadre 2 sur la page 2 (x 100 + 7,2 ; y 300 + 13,3)', !!f2 && near(f2.x, 107.2) && near(f2.y, 313.3), f2);
  check(tag + 'le cadre 3, au bas de la page 3 (x 40 + 7,2 ; y 480 + 13,3)', !!f3 && near(f3.x, 47.2) && near(f3.y, 493.3), f3);
  const bottomLines = pdf.pages[2].lines.filter(l => l.y > 480);
  check(tag + 'rien du cadre du bas ne passe le bord de la page (toutes ses lignes au-dessus de 540 points)', bottomLines.length >= 2 && bottomLines.every(l => l.y <= 540), bottomLines);
  check(tag + 'le texte de la diapositive reste là où il était (titre de la diapositive 1, « Quatre » en page 4)', !!lineOf(pdf, 0, 'Titre un') && !!lineOf(pdf, 3, 'Quatre'), pdf.pages.map(p => p.lines.map(l => l.text)));
  // Avec un en-tête et un pied de page, le PDF place les cadres aux mêmes mesures de la page (elles sont depuis le coin de la page, pas depuis le corps) et n'ajoute aucune page.
  await open(15, 4);
  await leave();
  const [pdfHfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const pdfHfPath = await pdfHfDownload.path();
  const pdfHf = await readPdf(readFileSync(pdfHfPath).toString('base64'));
  const hf1 = lineOf(pdfHf, 0, 'Cadre un en haut');
  const hf2 = lineOf(pdfHf, 1, 'Cadre deux');
  const hf3 = lineOf(pdfHf, 2, 'Un long texte');
  check(tag + 'avec un en-tête et un pied, le PDF a quatre pages et pose les trois cadres aux mêmes mesures de la page que sans', pdfHf.numPages === 4 && pdfPagesIn(pdfHfPath) === 4 && !!hf1 && near(hf1.x, 607.2) && near(hf1.y, 73.3) && !!hf2 && near(hf2.x, 107.2) && near(hf2.y, 313.3) && !!hf3 && near(hf3.x, 47.2) && near(hf3.y, 493.3), { pages: pdfHf.numPages, hf1, hf2, hf3 });
  check(tag + 'avec un en-tête et un pied, le PDF montre l\'en-tête et le pied sur chaque page', pdfHf.pages.every(p => p.lines.some(l => /En-\s?tête de la présentation/.test(l.text)) && p.lines.some(l => /Pied de la présentation/.test(l.text))), pdfHf.pages.map(p => p.lines.map(l => l.text)));
  await open(8, 4);
  await leave();

  // Word : une zone de texte ancrée à la page par cadre.
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  const [docxDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const docxB64 = readFileSync(await docxDownload.path()).toString('base64');
  const word = await page.evaluate(async (b64) => {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const num = (el, name) => { const n = el.getElementsByTagName(name)[0]; return n ? Number(n.textContent) : null; };
    const anchors = Array.from(doc.getElementsByTagName('wp:anchor')).map((a) => {
      const h = a.getElementsByTagName('wp:positionH')[0];
      const v = a.getElementsByTagName('wp:positionV')[0];
      const ext = a.getElementsByTagName('wp:extent')[0];
      return { behind: a.getAttribute('behindDoc'), relH: h.getAttribute('relativeFrom'), x: num(h, 'wp:posOffset'), relV: v.getAttribute('relativeFrom'), y: num(v, 'wp:posOffset'), cx: Number(ext.getAttribute('cx')), wrapNone: a.getElementsByTagName('wp:wrapNone').length, text: Array.from(a.getElementsByTagName('w:t')).map(n => n.textContent).join('') };
    });
    return { anchors, pageBreaks: (xml.match(/<w:pageBreakBefore\/>|<w:br w:type="page"\/>/g) || []).length };
  }, docxB64);
  const wordOk = word.anchors.length === 3 && word.anchors.every(a => a.relH === 'page' && a.relV === 'page' && a.behind === '0' && a.wrapNone === 1)
    && word.anchors[0].x === 600 * 12700 && word.anchors[0].y === 60 * 12700 && word.anchors[0].cx === 300 * 12700
    && word.anchors[1].x === 100 * 12700 && word.anchors[1].y === 300 * 12700 && word.anchors[1].cx === 400 * 12700
    && word.anchors[2].x === 40 * 12700 && word.anchors[2].y === 480 * 12700 && word.anchors[2].cx === 500 * 12700;
  check(tag + 'le Word fait de chaque cadre une zone de texte ancrée à la PAGE, devant le texte, sans habillage : trois, aux mesures en EMU (12 700 par point)', wordOk, word);
  check(tag + 'le texte des cadres est dans leur zone', /Cadre un en haut/.test(word.anchors[0].text) && /Cadre deux/.test(word.anchors[1].text) && /Un long texte/.test(word.anchors[2].text), word.anchors.map(a => a.text));
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await leave();

  // HTML et Markdown : le texte, sans la position.
  const text = await page.evaluate(async (html) => {
    await ExportEngines.loadAll();
    const doc = await HtmlExport.htmlToDocument(html, {});
    const md = await MarkdownExport.htmlToMarkdown(html);
    return { html: typeof doc === 'string' ? doc : JSON.stringify(doc), md };
  }, '<h1>Titre</h1>' + FRAME(600, 60, 300, 40, '<p>Cadre <strong>gras</strong> un</p>') + '<p>Texte</p>');
  check(tag + 'le HTML et le Markdown gardent le texte du cadre (en gras comme il l\'est), sans sa position', /Cadre <strong>gras<\/strong> un/.test(text.html) && !/ff-x|data-ff|position:\s*absolute|pp-free-frame/.test(text.html) && /Cadre \*\*gras\*\* un/.test(text.md), { html: text.html.slice(-300), md: text.md });

  // --- 9. Une présentation sans cadre : le PDF reste ce qu'il était.
  await open(11, 3);
  await leave();
  const [plainDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const plain = await readPdf(readFileSync(await plainDownload.path()).toString('base64'));
  const topOf = (p, text) => { const l = lineOf(plain, p, text); return l ? [l.x, l.y] : null; };
  check(tag + 'une présentation sans cadre part en PDF comme avant : trois pages, le titre en haut à gauche de la page 1, « Texte deux » en haut de la page 2, « Trois » en haut de la page 3', plain.numPages === 3 && !!topOf(0, 'Titre un') && !!topOf(1, 'Texte deux') && !!topOf(2, 'Trois') && topOf(1, 'Texte deux')[1] < 140 && topOf(2, 'Trois')[1] < 100, plain.pages.map(p => p.lines.map(l => l.x + ',' + l.y + ' ' + l.text)));
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
