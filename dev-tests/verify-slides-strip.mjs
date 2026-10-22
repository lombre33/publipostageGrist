#!/usr/bin/env node
// La bande des diapositives d'une présentation (extensions/diapositives/slide-strip.js et .css, js/slides-entry.js) et la page de la diapositive vide qui termine une présentation (carte du
// 19/10, « Tout de suite » : js/slides-entry.js:showsEveryPage et outputHtml, js/header-footer-preview.js:trailingBlankStart, js/reader-mode.js:trimTail), à la vraie souris et au vrai
// clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LA BANDE : à l'ouverture d'une présentation (appel `ouvrir` de GFS), les fichiers de l'extension arrivent (slide-strip et slide-import, .js et .css, version du registre) ; la bande est à gauche de la page,
//   sur la hauteur visible du document, sans la recouvrir ; une miniature 16:9 par diapositive avec son texte, nommée « Diapositive n sur N », celle du curseur cochée ; numéros et « Ajouter »
//   lisibles (>= 4,5:1).
//  LES SAUTS DE PAGE (demande du 21/10) : ceux d'une présentation ne se voient pas dans l'éditeur (ni texte ni cadre) et gardent leur place (trois pages) ; celui qu'une flèche sélectionne
//   se voit ; ceux d'un document se voient toujours.
//  ALLER : un clic sur une miniature pose le curseur dans sa diapositive, que le document montre, et rend le clavier au document.
//  LES GESTES, chacun défait par UN Ctrl+Z : « Ajouter » (au bas de la bande) ajoute une diapositive vide après celle du curseur, où l'on écrit aussitôt ; le menu « ⋯ » (au survol) et le clic
//   droit ouvrent le menu de la diapositive, au premier plan et dans le panneau : « Dupliquer », « Descendre », « Supprimer » ; « Monter » est grisé sur la première, « Descendre » sur la
//   dernière, avec leur raison.
//  LE CLAVIER : Échap puis Tab quittent le document jusqu'à la bande (la miniature cochée) ; ↑, Début, Fin vont de l'une à l'autre ; Maj+F10 ouvre le menu (focus sur sa première ligne,
//   Échap le referme) ; Ctrl+↑ déplace, Suppr efface, Ctrl+Z défait, sans quitter la bande ; Entrée rend le clavier au document.
//  CE QUI DÉPASSE (carte du 19/10, « Continuer ») : la miniature de la diapositive trop longue porte le point rouge, et son nom le dit.
//  LA LÉGÈRETÉ (demande du 21/10) : dans une présentation de quarante diapositives, la bande ne copie que les miniatures qu'elle montre, et un peu au-delà, chacune avec son texte ; la
//   molette la descend jusqu'au bout et les dernières se copient en arrivant ; Ctrl+↑ ne pagine l'éditeur qu'une fois et les deux miniatures échangées gardent leur copie.
//  LES IMAGES EN CALQUE SUIVENT LEUR DIAPOSITIVE (défaut vu le 21/10) : une image passée « Devant le texte » (vrai clic sur sa barre) sur la diapositive 2 monte avec elle (Ctrl+↑ :
//   page 1, dessinée avec son texte, une seule pagination), et la Lecture (vrai clic) la montre sur la page 1 ; un Ctrl+Z rend le texte d'avant à l'identique ; « Ajouter » avant
//   elle l'envoie en page 3 (une seule pagination) ; la diapositive 1 qui dépasse (frappe au vrai clavier) l'envoie en page 3, et un Ctrl+Z la ramène ; enregistrée, elle garde sa page.
//  LA DIAPOSITIVE VIDE DE FIN (« Tout de suite ») : une présentation qui finit sur un saut de page montre la page de sa dernière diapositive dans l'éditeur, la Lecture (vrai clic), le PDF
//   (vrai clic sur « Exporter » : trois pages, sans question) et le Word ; un document au même texte garde ses deux pages (carte du 14/10), et la bande n'y est pas.
//  LES DIAPOSITIVES VIDES DU PDF (carte du 19/10, « Ne plus avertir ») : une présentation dont la première, une du milieu et la dernière diapositive sont vides part en PDF sans
//   « Exporter quand même ? » (vrai clic : cinq pages), et son lot aussi (archive ZIP, sans fenêtre de fin de lot, cinq pages par PDF) ; un document qui a une page blanche garde la
//   question (elle nomme la page 2 ; « Annuler » au vrai clic : rien ne part).
//  EXTENSION ÉTEINTE EN DIRECT : la bande reste, ses gestes sont grisés avec leur raison (lisible) et leur clic appelle `installer` de GFS, sans fenêtre de l'app ; une miniature mène
//   toujours à sa diapositive. Rallumée, tout redevient utilisable ; le modèle enregistré ne porte jamais la marque des sauts de la Lecture et des exports.
// Lancé par run-headless.mjs (groupe Node "slidesStrip", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-strip.mjs
// SLIDES_STRIP_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, registryFiles, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.SLIDES_STRIP_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slides-strip', port: Number(process.env.SLIDES_STRIP_PORT || 8932) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
// Au-delà de ce délai, deux gestes sont deux pas de l'historique (history.newGroupDelay de l'éditeur : 500 ms).
const APART_MS = 650;

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const lines = n => Array.from({ length: n }, (_, i) => `<p>Ligne ${i + 1} de la diapositive trop longue</p>`).join('');
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
// 7 « Diapos » : trois diapositives ; 8 « Longue » : la deuxième dépasse de sa page ; 9 « Fin vide » : une présentation qui finit sur un saut de page, et 10 « Doc fin », un document au même texte ;
// 11 « Vides » : une présentation dont la première, la troisième et la cinquième diapositive sont vides, et 12 « Doc blanc », un document dont la page 2 est blanche ; 13 « Quarante » :
// quarante diapositives (« Diapo n », « Texte n ») ; 14 « Formes » : trois diapositives, une image dans le texte de la deuxième. Deux lignes dans `PpDepart` pour l'export en lot.
const FORTY = Array.from({ length: 40 }, (_, i) => `<h2>Diapo ${i + 1}</h2><p>Texte ${i + 1}</p>`).join(BR);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGP4z8DwnxLMMGoAw6gBDKMGMAAAJ/wD/fJ9qnkAAAAASUVORK5CYII=';
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Diapos', '<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>', false, 'presentation');
  add(8, 'Longue', '<p>Court</p>${BR}${lines(45)}${BR}<p>Fin</p>', false, 'presentation');
  add(9, 'Fin vide', '<p>Un</p>${BR}<p>Deux</p>${BR}', false, 'presentation');
  add(10, 'Doc fin', '<p>Un</p>${BR}<p>Deux</p>${BR}', false, 'document');
  add(11, 'Vides', '<p></p>${BR}<p>Deux</p>${BR}<p></p>${BR}<p>Quatre</p>${BR}', false, 'presentation');
  add(12, 'Doc blanc', '<p>Un</p>${BR}<p></p>${BR}<p>Trois</p>', false, 'document');
  add(13, 'Quarante', '${FORTY}', false, 'presentation');
  add(14, 'Formes', '<p>Un</p>${BR}<p>Deux texte</p><p><img class="editor-image" src="${PNG}" alt="" style="width: 120px; height: 80px" data-layer="normal" data-wrap="inline"></p>${BR}<p>Trois</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 15;
  stub.setRows('PpDepart', [{ id: 1, Nom: 'Alice', Statut: 'Urgent' }, { id: 2, Nom: 'Bruno', Statut: 'Autre' }]);
  stub.state.lastTableId = 'PpDepart'; // la table de ce widget, que lit la vue d'un lot (fetchSelectedTable) : seedModels donne sa ligne sans passer par fireRecord
`;
const ONE = 'Titre unPremier texte';
const TWO = 'Deuxab';
const THREE = 'Trois';

const TEXTS = {
  fr: {
    label: 'Diapositives', item: (n, total) => `Diapositive ${n} sur ${total}`, overflow: 'Son contenu dépasse : la suite passe sur une diapositive de plus',
    add: 'Ajouter', addTip: n => `Ajouter une diapositive après la diapositive ${n}`, importTip: 'Importer une diapositive d’une autre présentation, ou une page d’un document', more: 'Actions de la diapositive', menuLabel: n => `Diapositive ${n}`,
    menu: ['Ajouter une diapositive après', 'Dupliquer', 'Monter', 'Descendre', 'Transition…', 'Fond…', 'Notes…', 'Supprimer'],
    first: 'C’est déjà la première diapositive', last: 'C’est déjà la dernière diapositive', reason: 'Demande l’extension Diapositives (Grist Factory Suite)',
  },
  en: {
    label: 'Slides', item: (n, total) => `Slide ${n} of ${total}`, overflow: 'Its content overflows: the rest continues on one more slide',
    add: 'Add', addTip: n => `Add a slide after slide ${n}`, importTip: 'Import a slide from another presentation, or a page from a document', more: 'Slide actions', menuLabel: n => `Slide ${n}`,
    menu: ['Add a slide after', 'Duplicate', 'Move up', 'Move down', 'Transition…', 'Background…', 'Notes…', 'Delete'],
    first: 'This is already the first slide', last: 'This is already the last slide', reason: 'Needs the Slides extension (Grist Factory Suite)',
  },
};

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;

// Les outils d'une page ouverte : positions, premier plan et gestes à la vraie souris.
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
  // La souris arrive près de la cible d'un saut, puis glisse dessus : un long trajet passerait sur les menus au survol de la barre d'outils, dont les volets descendent sur la bande.
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  // Une miniature que la liste de la bande ne montre pas entière (« Ajouter » et « Importer » prennent le bas de la bande, à 700x400 elle en montre trois) : la molette, sur la
  // liste, l'y amène d'abord, comme on le ferait.
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
  // Le point que la souris vise : le centre de la cible, sinon le premier point de sa colonne du milieu qu'aucune couche ne recouvre (la barre d'une image sélectionnée passe
  // au-dessus de la bande, js/layers.js), comme on viserait la partie visible.
  const visiblePoint = (selector, index) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const free = y => { const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit)); };
    let y = r.top + r.height / 2;
    if (!free(y)) for (let k = r.top + 3; k < r.bottom - 2; k += 3) { if (free(k)) { y = k; break; } }
    return { x, y };
  }, [selector, index]);
  const hover = async (selector, index = 0) => {
    await showInList(selector, index);
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    Object.assign(c, await visiblePoint(selector, index));
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, options = {}) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y, options); await sleep(250); return c; };
  // La souris s'en va dans un coin vide du document.
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, onTop, hover, click, leave };
}

// Ce que montrent la bande et l'éditeur : les miniatures (noms, cochée, Tab, point rouge, texte), les diapositives du texte, celle du curseur, où est le clavier.
const stripState = page => page.evaluate(() => {
  const strip = document.querySelector('.pp-slide-strip');
  const items = Array.from(document.querySelectorAll('.pp-slide-item'));
  const editor = EditorCore.getEditor();
  const slides = SlideStrip.slidesOf(editor.state.doc);
  const at = slides.findIndex(s => editor.state.selection.from <= s.end);
  const active = document.activeElement;
  let focus = null;
  if (active && active.closest('.ProseMirror')) focus = 'editor';
  else if (active && active.closest('.pp-slide-item')) focus = 'item' + (items.indexOf(active.closest('.pp-slide-item')) + 1);
  else if (active && active.closest('.pp-slide-menu')) focus = 'menu:' + (active.dataset.action || '');
  else if (active) focus = active.id || active.tagName;
  const menu = document.querySelector('.pp-slide-menu');
  return {
    shown: !!strip && !strip.hidden && strip.getBoundingClientRect().width > 0,
    count: items.length,
    labels: items.map(i => i.getAttribute('aria-label')),
    selected: items.map(i => i.getAttribute('aria-selected') === 'true'),
    tabbable: items.map(i => i.tabIndex),
    dots: items.map(i => !i.querySelector('.pp-slide-overflow').hidden),
    thumbs: items.map(i => i.querySelector('.pp-slide-page').textContent),
    texts: slides.map(s => s.nodes.map(entry => entry.node.textContent).join('')),
    cursor: at < 0 ? slides.length - 1 : at,
    focus,
    menuOpen: !!menu && menu.classList.contains('visible'),
    html: editor.getHTML(),
  };
});
// Le menu ouvert : son nom, ses lignes (texte, grisée, raison), où il est, s'il est au premier plan.
const menuState = page => page.evaluate(() => {
  const menu = document.querySelector('.pp-slide-menu.visible');
  if (!menu) return null;
  // Les lignes qu'il montre : celles du lien d'une diapositive liée restent cachées sur une diapositive qui ne l'est pas (verify-slides-link.mjs).
  const rows = Array.from(menu.querySelectorAll('[data-action]')).filter(b => b.getBoundingClientRect().width > 0);
  const r = menu.getBoundingClientRect();
  return {
    label: menu.getAttribute('aria-label'), role: menu.getAttribute('role'), rows: rows.map(b => b.textContent), disabled: rows.map(b => b.getAttribute('aria-disabled') === 'true'), titles: rows.map(b => b.title),
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width },
    onTop: rows.every((b) => { const br = b.getBoundingClientRect(); const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2); return !!hit && (hit === b || b.contains(hit)); }),
  };
});
// Les pages de l'éditeur (Aperçu de la page) : une bande « Page N » ou une couture par changement de page, et les coupures que la pagination a lues.
const editorPages = page => page.evaluate(() => {
  Editor.refreshPaginationPreview();
  return { marks: document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-break-line, #editor-container .v2-pagination-overlay .v2-page-seam').length + 1, cuts: HeaderFooterPreview.pageBreaks().length + 1 };
});
// Les sauts de page de l'éditeur : invisibles (texte et cadre transparents), leur hauteur, sélectionnés ou non.
const breakMarks = page => page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap > .page-break-marker')).map((el) => {
  const style = getComputedStyle(el);
  const clear = value => /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(value);
  return { hidden: clear(style.color) && clear(style.borderTopColor) && clear(style.borderBottomColor), height: Math.round(el.getBoundingClientRect().height), selected: el.classList.contains('ProseMirror-selectednode'), color: style.color };
}));
// Les miniatures d'une longue présentation : combien ont leur copie, et celles que la bande montre (même en partie), avec leur texte.
const thumbsState = page => page.evaluate(() => {
  const list = document.querySelector('.pp-slide-list');
  const box = list.getBoundingClientRect();
  const rows = Array.from(list.querySelectorAll('.pp-slide-row'));
  const pages = rows.map(row => row.querySelector('.pp-slide-page'));
  return {
    count: rows.length,
    filled: pages.filter(p => p.childElementCount > 0).length,
    visible: rows.map((row, index) => ({ index, r: row.getBoundingClientRect(), text: pages[index].textContent }))
      .filter(v => v.r.bottom > box.top && v.r.top < box.bottom).map(v => ({ index: v.index, text: v.text })),
  };
});
// L'image de la présentation ouverte : son calque et sa page (pageIndex), la diapositive sur laquelle l'éditeur la dessine (la dernière dont le texte commence au-dessus de son milieu),
// et le texte de chaque diapositive.
const layerState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  let attrs = null;
  editor.state.doc.descendants((node) => { if (node.type.name === 'editorImage') attrs = node.attrs; });
  const img = document.querySelector('#editor-container .tiptap img.editor-image');
  const slides = SlideStrip.slidesOf(editor.state.doc);
  const r = img ? img.getBoundingClientRect() : null;
  let drawnOn = -1;
  slides.forEach((slide, k) => {
    const dom = slide.nodes.length ? editor.view.nodeDOM(slide.nodes[0].pos) : null;
    if (r && dom && dom.getBoundingClientRect().top <= r.top + r.height / 2) drawnOn = k;
  });
  return { layer: attrs && attrs.layer, pageIndex: attrs ? attrs.pageIndex : null, drawnOn, texts: slides.map(s => s.nodes.map(e => e.node.textContent).join('')), pages: HeaderFooterPreview.pageBreaks().length + 1 };
});
// La page de la Lecture sur laquelle l'image est dessinée (1 : la première) : les coutures au-dessus de son milieu, plus une.
const readerImagePage = page => page.evaluate(() => {
  const img = document.querySelector('#reader-container img.editor-image');
  if (!img) return 0;
  const r = img.getBoundingClientRect();
  const middle = r.top + r.height / 2;
  return Array.from(document.querySelectorAll('#reader-container .v2-pagination-overlay .v2-page-break-line, #reader-container .v2-pagination-overlay .v2-page-seam'))
    .filter(seam => seam.getBoundingClientRect().top < middle).length + 1;
});
// Compte les paginations de l'éditeur à partir de maintenant ; `paginations(page)` rend leur nombre et arrête de compter.
const countPaginations = page => page.evaluate(() => { window.__paginations = 0; window.__stopCounting = HeaderFooterPreview.onPaginated(() => { window.__paginations += 1; }); });
const paginations = page => page.evaluate(() => { window.__stopCounting(); return window.__paginations; });
const readerPages = page => page.evaluate(() => document.querySelectorAll('#reader-container .v2-pagination-overlay .v2-page-break-line, #reader-container .v2-pagination-overlay .v2-page-seam').length + 1);
// Le Word du même HTML que l'export (js/main.js:currentDocumentHtml) : ses sauts de page avant un paragraphe, un par page de plus.
const wordBreaks = (page, typeModele) => page.evaluate(async ([type, record]) => {
  await ExportEngines.ensure(['docx']);
  await ExportCommon.ensureJsZipLoaded();
  const { blob } = await DocxExport.getDocxBlobForRecord(SlidesEntry.outputHtml(type, Editor.getHTML()), 'PpDepart', record, '', Editor.getHeaderFooterData(), null);
  const zip = await JSZip.loadAsync(blob);
  const xml = await zip.file('word/document.xml').async('string');
  return (xml.match(/<w:pageBreakBefore(?![^>]*w:val="(?:false|0)")[^>]*\/>/g) || []).length;
}, [typeModele, RECORD]);
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);
const appDialogOpen = page => page.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; });
const pdfPagesIn = path => (readFileSync(path).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme) {
  const T = Object.assign({}, TEXTS[lang]);
  const tag = `[${lang} ${colorScheme}] `;
  const { page, requests, natives, context } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const downloads = [];
  page.on('download', download => downloads.push(download));
  const { rectOf, onTop, hover, click, leave } = toolsOf(page);
  // Les textes de l'app que les exports montrent : « Générer » d'un lot, « Annuler », la question des pages blanches d'un document dont la page 2 est blanche.
  Object.assign(T, await page.evaluate(() => ({
    generate: I18n.t('common.generate'), cancel: I18n.t('common.cancel'), blankTitle: I18n.t('blankPages.title', { n: 1 }), blankMessage: I18n.t('blankPages.confirm', { n: 1, pages: '2' }),
  })));
  const documentPadding = await page.evaluate(() => getComputedStyle(document.getElementById('editor-container')).paddingLeft);
  // L'appel `ouvrir` de GFS passe par le sélecteur de modèles : un modèle modifié poserait d'abord sa question « Enregistrer / Abandonner / Annuler », que rien n'attend ici (save avant).
  const open = async (id, slides) => {
    const answer = await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000).then(() => ({ type: 'pas de réponse de l’app' })),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(700);
    return answer;
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  // « Enregistrer » au vrai clic ; la souris s'en va ensuite, sans quoi le menu au survol du bouton reste ouvert.
  const save = async () => { await leave(); await click('#btn-save'); await sleep(1000); await leave(); };
  const dialogText = () => page.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return { title: m.querySelector('#pp-dialog-title').textContent, message: m.querySelector('#pp-dialog-message').textContent }; });
  const dialogButton = label => page.evaluate(text => Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).findIndex(b => b.textContent.trim() === text && b.getBoundingClientRect().width > 0), label);
  // « Exporter » (PDF) au vrai clic : le PDF part, ou la question des pages blanches se pose (`asked`, son titre et son message) et reçoit « Annuler » au vrai clic ; puis les
  // pages du PDF téléchargé (0 : rien n'est parti).
  const exportPdf = async () => {
    const before = downloads.length;
    await click('#btn-export-pdf');
    for (let i = 0; i < 240 && downloads.length === before && !(await appDialogOpen(page)); i++) await sleep(250);
    const out = { asked: await appDialogOpen(page), answered: false };
    if (out.asked) {
      Object.assign(out, await dialogText());
      const index = await dialogButton(T.cancel);
      if (index >= 0) { await click('#pp-dialog-modal .var-modal-actions button', index); out.answered = true; }
      await sleep(1500);
    }
    out.pages = downloads.length > before ? pdfPagesIn(await downloads[downloads.length - 1].path()) : 0;
    await leave();
    return out;
  };
  // Le lot PDF (archive ZIP) des lignes de la table : la ligne du menu d'export (un clic du DOM, comme le harnais : le menu au survol a ses propres tests), puis « Générer » au
  // vrai clic ; l'archive téléchargée (ses PDF et leurs pages, lus par JSZip dans la page) et, deux secondes plus tard, la fenêtre de fin de lot ouverte ou non (Échap la referme).
  const exportPdfBatch = async () => {
    const before = downloads.length;
    await page.evaluate(() => document.getElementById('v2-btn-export-pdf-batch').click());
    await page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; }, null, { timeout: 30000 }).catch(() => {});
    const out = { generate: false };
    const index = await dialogButton(T.generate);
    if (index >= 0) { await click('#pp-dialog-modal .var-modal-actions button', index); out.generate = true; }
    for (let i = 0; i < 240 && downloads.length === before; i++) await sleep(250);
    if (downloads.length > before) {
      const data = readFileSync(await downloads[downloads.length - 1].path()).toString('base64');
      out.zip = await page.evaluate(async b64 => {
        const zip = await JSZip.loadAsync(b64, { base64: true });
        const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
        const pages = [];
        for (const name of names) pages.push(((await zip.file(name).async('binarystring')).match(/\/Type\s*\/Page(?![s\w])/g) || []).length);
        return { count: names.length, pages };
      }, data);
    }
    await sleep(2000);
    out.after = { open: await appDialogOpen(page) };
    if (out.after.open) { Object.assign(out.after, await dialogText()); await page.keyboard.press('Escape'); await sleep(400); }
    await leave();
    return out;
  };

  // --- L'ouverture : les fichiers de l'extension, la bande à sa place, ses miniatures et leurs noms.
  const opened = await open(7, 3);
  const html0 = (await stripState(page)).html;
  let s = await stripState(page);
  const files = requests.filter(url => /\/extensions\/diapositives\//.test(url)).map(url => url.replace(/^.*\/extensions\//, 'extensions/'));
  check(tag + 'GFS ouvre « Diapos » ; les fichiers de l’extension arrivent, une fois chacun, à la version du registre (la bande, le volet « Importer », les diapositives liées et le diaporama, .js et .css)',
    opened.type === 'reponse' && opened.data.ouvert === true && JSON.stringify(files.slice().sort()) === JSON.stringify(registryFiles('diapositives')), { opened, files, registre: registryFiles('diapositives') });
  const strip = await rectOf('.pp-slide-strip');
  const box = await page.evaluate(() => { const c = document.getElementById('editor-container'); const r = c.getBoundingClientRect(); return { top: r.top + c.clientTop, bottom: r.top + c.clientTop + c.clientHeight }; });
  const sheet = await rectOf('#editor-container .v2-page-sheet');
  check(tag + 'la bande est à gauche, sur la hauteur visible du document, dans le panneau ; la page se range à sa droite sans être recouverte, entière en largeur',
    s.shown && inPanel(strip) && strip.left < 0.5 && Math.abs(strip.top - box.top) < 1 && Math.abs(strip.bottom - box.bottom) < 1 && !!sheet && sheet.left >= strip.right - 0.5 && sheet.right <= WIDTH + 0.5, { strip, box, sheet });
  const names = await page.evaluate(() => ({
    strip: document.querySelector('.pp-slide-strip').getAttribute('aria-label'), list: document.querySelector('.pp-slide-list').getAttribute('aria-label'), role: document.querySelector('.pp-slide-list').getAttribute('role'),
    add: document.querySelector('.pp-slide-add').textContent.trim(), addLabel: document.querySelector('.pp-slide-add').getAttribute('aria-label'), more: document.querySelector('.pp-slide-more').title,
  }));
  check(tag + 'une liste « ' + T.label + ' » : « ' + T.item(1, 3) + ' »… celle du curseur cochée, seule atteinte par Tab ; « ' + T.add + ' » (son nom accessible) dit après laquelle il ajoute',
    names.strip === T.label && names.list === T.label && names.role === 'listbox' && JSON.stringify(s.labels) === JSON.stringify([T.item(1, 3), T.item(2, 3), T.item(3, 3)])
    && s.selected.filter(Boolean).length === 1 && s.selected[s.cursor] && s.tabbable[s.cursor] === 0 && s.tabbable.filter(v => v === 0).length === 1
    && names.addLabel === T.addTip(s.cursor + 1) && names.more === T.more, { names, s });
  // --- Trois boutons carrés sur UNE ligne au bas de la bande (carte du 22/10, « Trois icônes sur une ligne ») : leur nom est l'info-bulle, et la liste retrouve trois miniatures à 700x400.
  const row = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const stripBox = box(document.querySelector('.pp-slide-strip'));
    const listEl = document.querySelector('.pp-slide-list');
    const listBox = box(listEl);
    const visible = Array.from(document.querySelectorAll('.pp-slide-row')).filter((r) => { const b = r.getBoundingClientRect(); return b.top >= listBox.top - 0.5 && b.bottom <= listBox.bottom + 0.5; }).length;
    const buttons = Array.from(document.querySelectorAll('.pp-slide-actions > button')).map(b => Object.assign(box(b), {
      text: b.textContent.trim(), label: b.getAttribute('aria-label') || '', title: b.title, icon: b.querySelectorAll('svg').length, hidden: b.querySelector('svg') ? b.querySelector('svg').getAttribute('aria-hidden') : null, popup: b.getAttribute('aria-haspopup'),
      cls: b.className,
    }));
    const actionsEl = document.querySelector('.pp-slide-actions');
    return { strip: stripBox, list: listBox, buttons, visible, scrolls: listEl.scrollHeight > listEl.clientHeight + 1, actions: actionsEl ? box(actionsEl) : null };
  });
  const [bAdd, bImport] = row.buttons;
  check(tag + 'les deux boutons du bas (« Ajouter », « Importer ») sont sur UNE ligne, deux carrés de 30 px écartés de 4 px, sous la liste et dans la bande ; « Objets » n\'y est plus (il est dans la barre d\'outils du haut, dev-tests/verify-free-frame.mjs)',
    row.buttons.length === 2 && row.buttons.every(b => Math.abs(b.width - 30) < 0.6 && Math.abs(b.height - 30) < 0.6 && Math.abs(b.top - bAdd.top) < 0.6)
    && bAdd.right < bImport.left && Math.abs(bImport.left - bAdd.right - 4) < 1
    && bAdd.top >= row.list.bottom - 0.5 && row.buttons.every(b => b.left >= row.strip.left && b.right <= row.strip.right && b.bottom <= row.strip.bottom + 0.5)
    && /pp-slide-import-open/.test(bImport.cls) && !row.buttons.some(b => /pp-slide-objects/.test(b.cls)), row);
  check(tag + 'chacun n’est qu’une icône (pas de texte visible, icône cachée aux lecteurs d’écran) ; son nom est l’info-bulle et le nom accessible : « ' + T.addTip(s.cursor + 1) + ' », « ' + T.importTip + ' »',
    row.buttons.length === 2 && row.buttons.every(b => b.text === '' && b.icon === 1 && b.hidden === 'true') && bAdd.title === T.addTip(s.cursor + 1) && bAdd.label === T.addTip(s.cursor + 1)
    && bImport.title === T.importTip && bImport.label === T.importTip && bAdd.popup === 'menu', row.buttons);
  check(tag + 'à ' + WIDTH + 'x' + HEIGHT + ', la liste montre ses trois miniatures entières, sans défiler',
    row.visible === 3 && !row.scrolls, { visible: row.visible, scrolls: row.scrolls, list: row.list });
  const thumbs = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-thumb')).map(th => { const r = th.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check(tag + 'une miniature 16:9 par diapositive (80x45), chacune avec le texte de sa diapositive', JSON.stringify(thumbs) === JSON.stringify([[80, 45], [80, 45], [80, 45]])
    && JSON.stringify(s.thumbs) === JSON.stringify([ONE, TWO, THREE]) && JSON.stringify(s.texts) === JSON.stringify([ONE, TWO, THREE]), { thumbs, s: s.thumbs });
  const ratios = {
    number: await contrastOf(page, '.pp-slide-item[aria-selected="false"] .pp-slide-num'), current: await contrastOf(page, '.pp-slide-item[aria-selected="true"] .pp-slide-num'),
    add: await contrastOf(page, '.pp-slide-add'),
  };
  check(tag + 'les numéros (celui de la diapositive cochée compris) et l’icône d’« ' + T.add + ' » sont lisibles (>= 4,5:1)', ratios.number >= 4.5 && ratios.current >= 4.5 && ratios.add >= 4.5, ratios);
  await snap(page, `ouverte-${lang}-${colorScheme}`);

  // --- Les sauts de page ne se voient pas (demande du 21/10) : ni texte ni cadre, à leur place ; celui qu'une flèche sélectionne se voit.
  let marks = await breakMarks(page);
  const slidePages = await editorPages(page);
  check(tag + 'les deux sauts de page de la présentation ne se voient pas (ni « Saut de page » ni cadre) et gardent leur place : trois pages, comme avant',
    marks.length === 2 && marks.every(m => m.hidden && m.height > 0 && !m.selected) && slidePages.marks === 3 && slidePages.cuts === 3, { marks, slidePages });
  await click('.ProseMirror > p', 0);
  await press('End');
  await press('ArrowRight');
  marks = await breakMarks(page);
  const selectedText = await page.evaluate(() => { const sel = EditorCore.getEditor().state.selection; return sel.node ? sel.node.type.name : ''; });
  check(tag + 'au clavier (clic dans « Premier texte », Fin, →), le premier saut est sélectionné : il se voit, l’autre non', selectedText === 'pageBreak' && marks[0].selected && !marks[0].hidden && marks[1].hidden, { selectedText, marks });
  await snap(page, `saut-selectionne-${lang}-${colorScheme}`);
  await press('ArrowRight');
  marks = await breakMarks(page);
  check(tag + '→ encore : le curseur passe à la diapositive 2, le saut ne se voit plus', marks.every(m => m.hidden && !m.selected) && (await stripState(page)).cursor === 1, marks);

  // --- Aller : un clic sur une miniature.
  await click('.pp-slide-thumb', 0);
  s = await stripState(page);
  const first = await page.evaluate(() => { const c = document.getElementById('editor-container').getBoundingClientRect(); const r = document.querySelector('.ProseMirror h1').getBoundingClientRect(); return { top: r.top - c.top, bottom: c.bottom - r.bottom }; });
  check(tag + 'un clic sur la miniature 1 pose le curseur dans la diapositive 1, qu’il coche ; le clavier va au document, qui montre son titre',
    s.cursor === 0 && s.selected[0] && !s.selected[1] && s.focus === 'editor' && first.top > 0 && first.bottom > 0, { cursor: s.cursor, selected: s.selected, focus: s.focus, first });
  await click('.pp-slide-thumb', 2);
  s = await stripState(page);
  const third = await page.evaluate(() => { const c = document.getElementById('editor-container').getBoundingClientRect(); const p = Array.from(document.querySelectorAll('.ProseMirror > p')).find(el => el.textContent === 'Trois').getBoundingClientRect(); return { top: p.top - c.top, height: c.height }; });
  check(tag + 'un clic sur la miniature 3 y pose le curseur et fait défiler le document jusqu’à sa page : son texte est en haut de la partie visible',
    s.cursor === 2 && s.selected[2] && s.focus === 'editor' && third.top > 0 && third.top < third.height / 3, { cursor: s.cursor, focus: s.focus, third });

  // --- « Ajouter », mise en page « Vide » : une diapositive vide après celle du curseur, où l'on écrit aussitôt.
  await click('.pp-slide-add');
  await click('.pp-slide-layouts.visible [data-action="blank"]');
  s = await stripState(page);
  check(tag + '« ' + T.add + ' » ajoute une quatrième diapositive, vide, après la troisième ; le curseur y est, le clavier au document, sa miniature cochée',
    JSON.stringify(s.texts) === JSON.stringify([ONE, TWO, THREE, '']) && s.count === 4 && s.cursor === 3 && s.selected[3] && s.focus === 'editor' && s.labels[3] === T.item(4, 4), s);
  await page.keyboard.type('Quatre');
  await sleep(600);
  s = await stripState(page);
  check(tag + 'ce qu’on tape va dans la nouvelle diapositive, et sa miniature le montre après la pause de la frappe', JSON.stringify(s.texts) === JSON.stringify([ONE, TWO, THREE, 'Quatre']) && s.thumbs[3] === 'Quatre', { texts: s.texts, thumbs: s.thumbs });
  await snap(page, `ajoutee-${lang}-${colorScheme}`);
  await sleep(APART_MS);
  const html4 = s.html;

  // --- Le menu « ⋯ » de la diapositive 2 : « Dupliquer », puis un Ctrl+Z.
  await hover('.pp-slide-thumb', 1);
  const moreShown = await onTop('.pp-slide-more', 1);
  await click('.pp-slide-more', 1);
  let menu = await menuState(page);
  check(tag + 'au survol de la miniature 2, son « ⋯ » paraît ; son clic ouvre le menu « ' + T.menuLabel(2) + ' » à côté d’elle, entier dans le panneau et au premier plan, rien de grisé',
    moreShown && !!menu && menu.role === 'menu' && menu.label === T.menuLabel(2) && JSON.stringify(menu.rows) === JSON.stringify(T.menu) && menu.disabled.every(d => !d) && inPanel(menu.rect) && menu.onTop
    && menu.rect.left >= strip.right - 1, { moreShown, menu });
  const rowRatio = await contrastOf(page, '.pp-slide-menu.visible button[data-action="delete"]');
  check(tag + 'les lignes du menu sont lisibles (>= 4,5:1)', rowRatio >= 4.5, rowRatio);
  await snap(page, `menu-${lang}-${colorScheme}`);
  await click('.pp-slide-menu.visible [data-action="duplicate"]');
  s = await stripState(page);
  check(tag + '« ' + T.menu[1] + ' » copie la diapositive 2 juste après elle ; le menu se ferme, le curseur va dans la copie, le clavier au document',
    JSON.stringify(s.texts) === JSON.stringify([ONE, TWO, TWO, THREE, 'Quatre']) && !s.menuOpen && s.cursor === 2 && s.selected[2] && s.focus === 'editor' && s.count === 5, s);
  await sleep(APART_MS);
  await press('Control+z');
  s = await stripState(page);
  check(tag + 'un seul Ctrl+Z défait la copie : le texte redevient exactement celui d’avant', s.html === html4 && s.count === 4, { texts: s.texts });
  await sleep(APART_MS);

  // --- Le clic droit sur la miniature 1 : « Monter » grisé, « Descendre ».
  await click('.pp-slide-thumb', 0, { button: 'right' });
  menu = await menuState(page);
  check(tag + 'un clic droit sur la miniature 1 ouvre son menu : « ' + T.menu[2] + ' » y est grisé et dit « ' + T.first + ' », le reste est utilisable',
    !!menu && menu.label === T.menuLabel(1) && JSON.stringify(menu.disabled) === JSON.stringify([false, false, true, false, false, false, false, false]) && menu.titles[2] === T.first && inPanel(menu.rect) && menu.onTop, menu);
  const greyRatio = await contrastOf(page, '.pp-slide-menu.visible button[aria-disabled="true"]');
  check(tag + 'la ligne grisée reste lisible (>= 4,5:1)', greyRatio >= 4.5, greyRatio);
  await click('.pp-slide-menu.visible [data-action="moveUp"]');
  s = await stripState(page);
  check(tag + 'un clic sur la ligne grisée ne fait rien : le menu reste ouvert, rien ne bouge', s.menuOpen && s.html === html4, { menuOpen: s.menuOpen, texts: s.texts });
  await click('.pp-slide-menu.visible [data-action="moveDown"]');
  s = await stripState(page);
  check(tag + '« ' + T.menu[3] + ' » passe la diapositive 1 après la 2 ; le curseur la suit', JSON.stringify(s.texts) === JSON.stringify([TWO, ONE, THREE, 'Quatre']) && !s.menuOpen && s.cursor === 1 && s.focus === 'editor', s);
  await sleep(APART_MS);
  await press('Control+z');
  s = await stripState(page);
  check(tag + 'un seul Ctrl+Z la remet en tête', s.html === html4, { texts: s.texts });
  await sleep(APART_MS);

  // --- Le menu de la dernière : « Descendre » grisé, « Supprimer ».
  await hover('.pp-slide-thumb', 3);
  await click('.pp-slide-more', 3);
  menu = await menuState(page);
  check(tag + 'le menu de la dernière diapositive grise « ' + T.menu[3] + ' », qui dit « ' + T.last + ' » ; il reste entier dans le panneau',
    !!menu && menu.label === T.menuLabel(4) && JSON.stringify(menu.disabled) === JSON.stringify([false, false, false, true, false, false, false, false]) && menu.titles[3] === T.last && inPanel(menu.rect) && menu.onTop, menu);
  await click('.pp-slide-menu.visible [data-action="delete"]');
  s = await stripState(page);
  check(tag + '« ' + T.menu[7] + ' » l’efface avec son saut de page : le texte redevient celui de l’ouverture, le curseur dans la diapositive 3',
    s.html === html0 && s.count === 3 && s.cursor === 2 && s.selected[2] && !s.menuOpen, { texts: s.texts, cursor: s.cursor });
  await sleep(APART_MS);

  // --- Le clavier.
  // Le clic dans le texte de la diapositive 3, en vue (« Trois ») ; puis le clavier seul.
  await click('.ProseMirror > p', 1);
  await press('Escape');
  const tabs = [];
  for (let i = 0; i < 10; i++) {
    await press('Tab');
    s = await stripState(page);
    tabs.push(s.focus);
    if (/^item/.test(s.focus || '')) break;
  }
  check(tag + 'Échap puis Tab quittent le document jusqu’à la bande : le clavier arrive sur la miniature cochée (celle du curseur)', s.focus === 'item' + (s.cursor + 1) && tabs.length <= 8, tabs);
  await press('ArrowUp');
  s = await stripState(page);
  const up = s;
  await press('Home');
  const home = await stripState(page);
  await press('End');
  const end = await stripState(page);
  check(tag + '↑, Début et Fin vont d’une miniature à l’autre, cochée avec le curseur dans sa diapositive, sans quitter la bande',
    up.focus === 'item2' && up.cursor === 1 && up.selected[1] && home.focus === 'item1' && home.cursor === 0 && end.focus === 'item3' && end.cursor === 2, { up: [up.focus, up.cursor], home: [home.focus, home.cursor], end: [end.focus, end.cursor] });
  await press('Shift+F10');
  const keyMenu = await menuState(page);
  const onFirstRow = await stripState(page);
  await press('ArrowDown');
  const onSecondRow = await stripState(page);
  await press('Escape');
  s = await stripState(page);
  check(tag + 'Maj+F10 ouvre le menu de la miniature, le clavier sur sa première ligne ; ↓ passe à la suivante ; Échap le referme et rend le clavier à la miniature',
    !!keyMenu && keyMenu.label === T.menuLabel(3) && onFirstRow.focus === 'menu:addAfter' && onSecondRow.focus === 'menu:duplicate' && !s.menuOpen && s.focus === 'item3', { keyMenu, first: onFirstRow.focus, second: onSecondRow.focus, after: s.focus });
  await press('Control+ArrowUp');
  s = await stripState(page);
  check(tag + 'Ctrl+↑ monte la diapositive 3 d’un cran ; le clavier la suit dans la bande', JSON.stringify(s.texts) === JSON.stringify([ONE, THREE, TWO]) && s.focus === 'item2' && s.cursor === 1 && s.selected[1], { texts: s.texts, focus: s.focus });
  await sleep(APART_MS);
  await press('Control+z');
  s = await stripState(page);
  check(tag + 'Ctrl+Z, dans la bande, la remet à sa place, le clavier toujours dans la bande', s.html === html0 && /^item/.test(s.focus || ''), { texts: s.texts, focus: s.focus });
  await sleep(APART_MS);
  await press('End');
  await press('Delete');
  s = await stripState(page);
  check(tag + 'Suppr efface la diapositive de la miniature (la 3) ; le clavier passe à la 2', JSON.stringify(s.texts) === JSON.stringify([ONE, TWO]) && s.focus === 'item2', { texts: s.texts, focus: s.focus });
  await sleep(APART_MS);
  await press('Control+z');
  await press('End');
  await press('Shift+F10');
  await press('Enter');
  s = await stripState(page);
  check(tag + 'Ctrl+Z la rend ; au menu (Maj+F10), Entrée sur « ' + T.menu[0] + ' » ajoute une diapositive après la 3, le clavier sur sa miniature',
    JSON.stringify(s.texts) === JSON.stringify([ONE, TWO, THREE, '']) && s.focus === 'item4' && s.cursor === 3 && !s.menuOpen, { texts: s.texts, focus: s.focus });
  await sleep(APART_MS);
  await press('Control+z');
  await press('Enter');
  s = await stripState(page);
  check(tag + 'Entrée rend le clavier au document, le curseur dans la diapositive de la miniature', s.html === html0 && s.focus === 'editor' && s.cursor === s.selected.indexOf(true), { texts: s.texts, focus: s.focus, cursor: s.cursor });
  await save();

  // --- Ce qui dépasse : le point rouge.
  await open(8, 3);
  s = await stripState(page);
  const longPages = await editorPages(page);
  check(tag + 'une diapositive trop longue continue sur une page de plus (quatre pages pour trois diapositives) : sa miniature porte le point rouge, et son nom le dit',
    JSON.stringify(s.dots) === JSON.stringify([false, true, false]) && s.labels[1] === T.item(2, 3) + ' · ' + T.overflow && s.labels[0] === T.item(1, 3) && longPages.cuts === 4, { dots: s.dots, labels: s.labels, longPages });
  await snap(page, `depasse-${lang}-${colorScheme}`);

  // --- La légèreté (demande du 21/10) : quarante diapositives.
  await open(13, 40);
  const textOf = n => 'Diapo ' + n + 'Texte ' + n;
  let light = await thumbsState(page);
  check(tag + 'quarante diapositives : la bande ne copie que les miniatures qu’elle montre, et un peu au-delà ; chacune de celles qu’on voit a le texte de sa diapositive',
    light.count === 40 && light.filled < 40 && light.visible.length > 0 && light.visible.every(v => v.text === textOf(v.index + 1)), light);
  await hover('.pp-slide-list');
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 400); await sleep(60); }
  await sleep(500);
  light = await thumbsState(page);
  check(tag + 'la molette descend la bande jusqu’au bout : les dernières miniatures se copient en arrivant, chacune avec son texte',
    light.visible.some(v => v.index === 39) && light.visible.every(v => v.text === textOf(v.index + 1)), light);
  await click('.pp-slide-thumb', 37);
  await press('Escape');
  for (let i = 0; i < 10 && !/^item/.test((await stripState(page)).focus || ''); i++) await press('Tab');
  await page.evaluate(() => {
    window.__paginations = 0;
    window.__stopCounting = HeaderFooterPreview.onPaginated(() => { window.__paginations += 1; });
    window.__copiesBefore = Array.from(document.querySelectorAll('.pp-slide-page')).map(p => p.firstElementChild);
  });
  await page.keyboard.press('Control+ArrowUp');
  await sleep(900);
  const moved = await page.evaluate(() => {
    window.__stopCounting();
    const now = Array.from(document.querySelectorAll('.pp-slide-page')).map(p => p.firstElementChild);
    const before = window.__copiesBefore;
    return { paginations: window.__paginations, kept: !!now[36] && !!now[37] && now[36] === before[37] && now[37] === before[36] };
  });
  s = await stripState(page);
  check(tag + 'Ctrl+↑ monte la diapositive 38 : l’éditeur ne se pagine qu’une fois, et les deux miniatures échangées gardent leur copie (rien n’est recopié)',
    moved.paginations === 1 && moved.kept && s.texts[36] === textOf(38) && s.texts[37] === textOf(37) && s.thumbs[36] === textOf(38) && s.focus === 'item37', { moved, focus: s.focus, texts: s.texts.slice(35, 39), thumbs: s.thumbs.slice(35, 39) });
  await save();

  // --- Les images en calque suivent leur diapositive : l'image de « Formes » passe « Devant le texte » au vrai clic (sa barre), sur la diapositive 2.
  await open(14, 3);
  await page.evaluate(() => document.querySelector('#editor-container .tiptap img.editor-image').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await click('#editor-container .tiptap img.editor-image');
  await click('.v2-floating-toolbar button[data-action="layer-front"]');
  await sleep(500);
  let layer = await layerState(page);
  check(tag + 'l’image de la diapositive 2 passe « Devant le texte » (vrai clic) : posée sur sa page, la 2', layer.layer === 'front' && layer.pageIndex === 1 && layer.drawnOn === 1, layer);
  const layerHtml = (await stripState(page)).html;
  await click('.pp-slide-thumb', 1);
  await press('Escape');
  for (let i = 0; i < 10 && !/^item/.test((await stripState(page)).focus || ''); i++) await press('Tab');
  await countPaginations(page);
  await page.keyboard.press('Control+ArrowUp');
  await sleep(900);
  let count = await paginations(page);
  layer = await layerState(page);
  check(tag + 'Ctrl+↑ monte la diapositive 2 : son image monte avec elle (page 1, dessinée avec son texte), et l’éditeur ne se pagine qu’une fois',
    layer.texts[0] === 'Deux texte' && layer.pageIndex === 0 && layer.drawnOn === 0 && count === 1, { layer, count });
  await leave();
  await click('#btn-mode-read');
  await page.waitForFunction(() => document.querySelectorAll('#reader-container .v2-pagination-overlay').length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const readerPage = await readerImagePage(page);
  check(tag + 'la Lecture (vrai clic) dessine l’image sur la page 1, avec sa diapositive', readerPage === 1, { readerPage });
  await leave();
  await click('#btn-mode-edit');
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length === 3 && !document.querySelector('.pp-slide-strip').hidden, null, { timeout: 8000 }).catch(() => {});
  await sleep(600);
  await click('.pp-slide-thumb', 0);
  await press('Escape');
  for (let i = 0; i < 10 && !/^item/.test((await stripState(page)).focus || ''); i++) await press('Tab');
  await press('Control+z');
  await sleep(700);
  s = await stripState(page);
  layer = await layerState(page);
  check(tag + 'un Ctrl+Z la remet en deuxième, son image en page 2 avec elle : le texte d’avant, à l’identique', s.html === layerHtml && layer.pageIndex === 1 && layer.drawnOn === 1, { layer, same: s.html === layerHtml });
  await click('.pp-slide-thumb', 0);
  await countPaginations(page);
  await click('.pp-slide-add');
  await click('.pp-slide-layouts.visible [data-action="blank"]');
  await sleep(900);
  count = await paginations(page);
  layer = await layerState(page);
  check(tag + '« ' + T.add + ' » après la diapositive 1 : l’image de la diapositive 2 la suit en page 3, et l’éditeur ne se pagine qu’une fois',
    layer.texts.length === 4 && layer.texts[2] === 'Deux texte' && layer.pageIndex === 2 && layer.drawnOn === 2 && count === 1, { layer, count });
  await page.keyboard.press('Control+z');
  await sleep(700);
  await click('.ProseMirror > p', 0);
  await press('End');
  for (let i = 0; i < 24; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('ligne ' + (i + 1)); }
  await sleep(1500);
  layer = await layerState(page);
  check(tag + 'la diapositive 1 dépasse de sa page (frappe) : l’image de la diapositive 2 la suit en page 3, dessinée avec son texte',
    layer.pages === 4 && layer.pageIndex === 2 && layer.drawnOn === 1 && layer.texts[1] === 'Deux texte', layer);
  await page.keyboard.press('Control+z');
  await sleep(1200);
  s = await stripState(page);
  layer = await layerState(page);
  check(tag + 'un Ctrl+Z défait la frappe : l’image revient en page 2, et le texte est celui d’avant', s.html === layerHtml && layer.pages === 3 && layer.pageIndex === 1 && layer.drawnOn === 1, { layer, same: s.html === layerHtml });
  await click('.pp-slide-thumb', 1);
  await press('Escape');
  for (let i = 0; i < 10 && !/^item/.test((await stripState(page)).focus || ''); i++) await press('Tab');
  await press('Control+ArrowUp');
  await sleep(700);
  await save();
  const storedImage = String(await page.evaluate(() => window.__gristStub.getRow('Publipostage_Modeles', 14).Contenu) || '').match(/<img[^>]*>/);
  check(tag + 'enregistrée, la présentation garde l’image sur sa page, la 1 (data-page-index="0")', !!storedImage && /data-page-index="0"/.test(storedImage[0]), { storedImage: storedImage && storedImage[0].replace(/src="[^"]*"/, 'src=…') });

  // --- La diapositive vide de fin : sa page dans l'éditeur, la Lecture, le PDF et le Word.
  await open(9, 3);
  s = await stripState(page);
  const endPages = await editorPages(page);
  check(tag + 'une présentation qui finit sur un saut de page : trois miniatures, et l’éditeur montre la page de la troisième, vide', s.count === 3 && JSON.stringify(s.texts) === JSON.stringify(['Un', 'Deux', '']) && endPages.marks === 3 && endPages.cuts === 3, { texts: s.texts, endPages });
  await snap(page, `fin-vide-${lang}-${colorScheme}`);
  await click('#btn-mode-read');
  await page.waitForFunction(() => document.querySelectorAll('#reader-container .v2-pagination-overlay').length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const reader = await readerPages(page);
  const inReader = await stripState(page);
  check(tag + 'la Lecture (vrai clic) montre les trois pages, sans la bande', reader === 3 && !inReader.shown && !(await page.evaluate(() => document.body.classList.contains('pp-slide-strip-on'))), { reader, shown: inReader.shown });
  await snap(page, `fin-vide-lecture-${lang}-${colorScheme}`);
  await leave();
  await click('#btn-mode-edit');
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length === 3 && !document.querySelector('.pp-slide-strip').hidden, null, { timeout: 8000 }).catch(() => {});
  s = await stripState(page);
  check(tag + 'retour à l’Édition : la bande revient, ses trois miniatures', s.shown && s.count === 3, { shown: s.shown, count: s.count });
  const endPdf = await exportPdf();
  check(tag + 'le PDF (vrai clic sur « Exporter ») part sans « Exporter quand même ? » et a les trois pages', !endPdf.asked && endPdf.pages === 3, endPdf);
  const slidesWord = await wordBreaks(page, 'presentation');
  check(tag + 'le Word du même texte a ses trois pages (deux sauts de page)', slidesWord === 2, slidesWord);
  await open(10, 0);
  s = await stripState(page);
  const docPages = await editorPages(page);
  const docState = await page.evaluate(() => ({ on: document.body.classList.contains('pp-slide-strip-on'), padding: getComputedStyle(document.getElementById('editor-container')).paddingLeft }));
  const docWord = await wordBreaks(page, 'document');
  check(tag + 'un document au même texte garde ses deux pages (éditeur et Word) ; la bande n’y est pas, la marge du document redevient la sienne',
    !s.shown && !docState.on && docState.padding === documentPadding && docPages.marks === 2 && docPages.cuts === 2 && docWord === 1, { shown: s.shown, docState, documentPadding, docPages, docWord });
  const docMarks = await breakMarks(page);
  check(tag + 'dans un document, les sauts de page se voient toujours', docMarks.length === 2 && docMarks.every(m => !m.hidden && m.height > 0), docMarks);

  // --- Les diapositives vides du PDF (« Ne plus avertir ») : la première, une du milieu et la dernière.
  await open(11, 5);
  s = await stripState(page);
  const emptyPdf = await exportPdf();
  check(tag + 'une présentation aux diapositives vides (la première, la troisième, la cinquième) : son PDF (vrai clic) part sans « Exporter quand même ? », avec ses cinq pages',
    s.count === 5 && JSON.stringify(s.texts) === JSON.stringify(['', 'Deux', '', 'Quatre', '']) && !emptyPdf.asked && emptyPdf.pages === 5, { texts: s.texts, emptyPdf });
  const lot = await exportPdfBatch();
  check(tag + 'son lot PDF (« ' + T.generate + ' » au vrai clic) : une archive de deux PDF de cinq pages, sans fenêtre de fin de lot sur des pages blanches',
    lot.generate && lot.zip && lot.zip.count === 2 && lot.zip.pages.every(n => n === 5) && !lot.after.open, lot);
  await open(12, 0);
  const docAsk = await exportPdf();
  check(tag + 'un document qui a une page blanche garde la question : elle nomme la page 2, « ' + T.cancel + ' » (vrai clic) ne télécharge rien',
    docAsk.asked && docAsk.title === T.blankTitle && docAsk.message === T.blankMessage && docAsk.answered && docAsk.pages === 0, docAsk);

  // --- GFS éteint l'extension, la présentation ouverte : la bande reste, ses gestes se grisent et appellent `installer`.
  await open(7, 3);
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await page.waitForFunction(() => document.querySelector('.pp-slide-add').getAttribute('aria-disabled') === 'true', null, { timeout: 5000 }).catch(() => {});
  s = await stripState(page);
  const off = await page.evaluate(() => { const b = document.querySelector('.pp-slide-add'); return { disabled: b.getAttribute('aria-disabled'), title: b.title }; });
  const offRatio = await contrastOf(page, '.pp-slide-add');
  check(tag + 'extension éteinte : la bande reste avec ses miniatures ; « ' + T.add + ' » est grisé avec sa raison, son icône lisible (>= 4,5:1)',
    s.shown && s.count === 3 && off.disabled === 'true' && off.title === T.reason && offRatio >= 4.5, { off, offRatio, count: s.count });
  await snap(page, `eteinte-${lang}-${colorScheme}`);
  await click('.pp-slide-add');
  await sleep(300);
  let installs = await gfsCalls(page, 'installer');
  s = await stripState(page);
  check(tag + 'son clic demande à GFS d’installer « diapositives » (appel `installer`), sans fenêtre de l’app, et rien ne change', JSON.stringify(installs) === JSON.stringify([{ extension: 'diapositives' }]) && !(await appDialogOpen(page)) && s.html === html0, { installs });
  await hover('.pp-slide-thumb', 1);
  await click('.pp-slide-more', 1);
  menu = await menuState(page);
  check(tag + 'le menu d’une diapositive grise toutes ses lignes, avec la même raison', !!menu && menu.disabled.every(Boolean) && menu.titles.every(title => title === T.reason), menu);
  await click('.pp-slide-menu.visible [data-action="duplicate"]');
  installs = await gfsCalls(page, 'installer');
  s = await stripState(page);
  check(tag + 'une ligne grisée appelle aussi `installer` et referme le menu ; rien ne change', installs.length === 2 && !s.menuOpen && s.html === html0 && !(await appDialogOpen(page)), { installs, menuOpen: s.menuOpen });
  await click('.pp-slide-thumb', 0);
  s = await stripState(page);
  check(tag + 'une miniature mène toujours à sa diapositive', s.cursor === 0 && s.selected[0] && s.focus === 'editor', { cursor: s.cursor, focus: s.focus });

  // --- Rallumée : tout redevient utilisable ; le modèle enregistré ne porte pas la marque des sauts.
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await page.waitForFunction(() => document.querySelector('.pp-slide-add').getAttribute('aria-disabled') === 'false', null, { timeout: 5000 }).catch(() => {});
  const on = await page.evaluate(() => { const b = document.querySelector('.pp-slide-add'); return { disabled: b.getAttribute('aria-disabled'), title: b.title }; });
  await click('.pp-slide-thumb', 2);
  await click('.pp-slide-add');
  await click('.pp-slide-layouts.visible [data-action="blank"]');
  await page.keyboard.type('Fin');
  await sleep(300);
  await save();
  const stored = await page.evaluate(() => window.__gristStub.getRow('Publipostage_Modeles', 7).Contenu);
  check(tag + 'rallumée : « ' + T.add + ' » est utilisable ; ce qu’il ajoute s’enregistre comme un saut de page ordinaire, sans la marque de la Lecture et des exports',
    on.disabled === 'false' && on.title === T.addTip(1) && (stored.match(/page-break-marker/g) || []).length === 3 && !/data-slide-break/.test(stored) && /<p><span style="font-size: 20pt;">Fin<\/span><\/p>$/.test(stored), { on, stored });
  check(tag + 'aucune boîte native (alert, confirm, prompt)', natives.length === 0, natives);
  await context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
