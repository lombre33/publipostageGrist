#!/usr/bin/env node
// La VUE d'une diapositive (js/slide-view.js, js/free-frame.js : `view`, `insertView`, la vue de nœud ; js/objects-menu.js : « Vue… » ; css/free-frame.css ; extensions/diapositives/slide-strip.js : `pageCopy`,
// `redrawViews` ; demande du 02/11, étude « Slides+ », carte « Lien, puis aperçu animé d'affilée », troisième niveau, seconde partie : « la cible affichée comme une vue qui change au clic »), à la vraie souris et
// au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LE RÉGLAGE : `data-ff-view` (l'adresse de la diapositive montrée) ne reste que d'une adresse valide et jamais sur une ligne ; le texte enregistré ne porte que lui (jamais le calque ni son contenu) ;
//   `SlideView.shows` dit si un texte a une vue.
//  L'ÉDITEUR : chaque vue montre en direct sa diapositive, à la forme de la page, centrée dans la boîte du cadre (le texte de repli du cadre se cache dessous) ; une vue ne montre jamais de vue (celle de la
//   diapositive 2, qui en porte une, la montre comme un cadre à son titre ; une vue de sa propre diapositive est sans boucle) ; une diapositive disparue cache le calque et rend le texte de repli, un
//   Ctrl+Z les remet ; la copie est inerte (rien n'y reçoit la souris que le calque) ; un clic choisit le cadre, un glisser le déplace d'un pas d'historique ; ce qu'on tape dans la diapositive montrée se
//   voit dans la vue, dans une autre vue de la même diapositive et dans la miniature de la bande ; une miniature montre la vue sans la rendre cliquable.
//  LE MENU « OBJETS » : « Vue… » est à côté de « Cadre de texte » et « Tableau », le menu tient dans 700 x 400, la liste avec recherche nomme les diapositives, filtre, se choisit à la souris et au clavier,
//   la vue posée est sélectionnée, large de 40 % de la page, avec son lien et son titre ; UN Ctrl+Z la retire (et le repère qu'une diapositive sans repère a reçu avec elle), un Ctrl+Y la remet.
//  LE DIAPORAMA ET LA LECTURE : la vue montre la diapositive (page entière, réduite, sans le zoom de la feuille de la Lecture) ; un clic sur elle mène à la diapositive montrée avec l'animation choisie pour ce
//   lien ; sans lien c'est un clic comme un autre (la diapositive suivante) ; une diapositive disparue laisse le texte de repli, sans erreur.
//  LES EXPORTS : le PDF et le PowerPoint ne montrent que le cadre et son titre (le PowerPoint avec le lien de l'objet), pas la copie de la diapositive.
// Lancé par run-headless.mjs (groupe Node "slideView", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-view.mjs
import { readFileSync } from 'node:fs';
import { start, seedModels, WIDTH, HEIGHT, hoverObjectsButton, hoverObject, chooseObject, OBJECTS_BUTTON, OBJECTS_MENU, objectRow } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-view', port: Number(process.env.SLIDE_VIEW_PORT || 9393) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = 'class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"';
const MARK = (id, extra = '') => `<div ${PROPS} data-anchor="${id}"${extra}></div>`;
// Un cadre, et une vue : un cadre blanc à fin trait gris dont le texte de repli est le titre de la diapositive montrée (`data-ff-view`), son lien (`data-ff-link`) et son animation (`data-ff-link-trans`).
const FRAME = (x, y, w, h, text, { view = '', link = '', trans = '', fill = '#d9e2f3', line = '#2f5597', lw = '1.5' } = {}) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-fill="${fill}" data-ff-line="${line}" data-ff-lw="${lw}"${view ? ` data-ff-view="${view}"` : ''}${link ? ` data-ff-link="${link}"` : ''}${trans ? ` data-ff-link-trans="${trans}"` : ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${text}</p></div></div></div>`;
const VIEW = (x, y, w, h, id, text, extra = {}) => FRAME(x, y, w, h, text, Object.assign({ view: id, link: '#' + id, fill: '#ffffff', line: '#bfbfbf', lw: '0.75' }, extra));
// Quatre diapositives (la page fait 960 x 540 pt).
//  1 « Accueil » : A, la vue de la 3e (fondu de 400 ms au clic) ; B, la vue de la 2e, sans lien ; C, la vue de sa propre diapositive.
//  2 « Les chiffres » : D, la vue de la 3e ; E, la vue d'une diapositive qui n'existe pas (`slide-9`).
//  3 « Merci » : repère `slide-3`, fond bleu pâle, un bouton.
//  4 « Sans repère » : sans repère.
const SLIDES = [
  `${MARK('slide-1')}<h1>Accueil</h1><p>Bienvenue</p>${VIEW(300, 150, 360, 202.5, 'slide-3', 'Merci', { trans: 'fade r 400' })}${VIEW(40, 380, 192, 108, 'slide-2', 'Les chiffres', { link: '' })}${VIEW(720, 380, 192, 108, 'slide-1', 'Accueil')}`,
  `${MARK('slide-2')}<h2>Les chiffres</h2><p>Chiffres du mois</p>${VIEW(500, 300, 240, 135, 'slide-3', 'Merci')}${VIEW(60, 300, 240, 135, 'slide-9', 'Diapositive disparue')}`,
  `${MARK('slide-3', ' data-bg="#e8f0fe"')}<h2>Merci</h2><p>Fin de la présentation</p>${FRAME(40, 400, 200, 50, 'Un bouton', { link: '#slide-1' })}`,
  '<h2>Sans repère</h2><p>Quatrième</p>',
].join(BR);
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Vues de diapositives', '${SLIDES}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;
const [A, B, C, D, E, F] = [0, 1, 2, 3, 4, 5];

const TEXTS = {
  fr: { row: 'Vue…', search: 'Rechercher une diapositive…', altOf: n => new RegExp('^Vue de la diapositive ' + n), slide: n => `diapositive ${n}` },
  en: { row: 'Slide view…', search: 'Search for a slide…', altOf: n => new RegExp('^View of slide ' + n), slide: n => `slide ${n}` },
};

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  const key = async (name, wait = 250) => { await page.keyboard.press(name); await sleep(wait); };
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 4; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  await page.evaluate(() => {
    window.__opened = [];
    document.addEventListener('click', (event) => {
      const a = event.target && event.target.closest ? event.target.closest('a[target="_blank"]') : null;
      if (a && !a.closest('.tiptap, #reader-container, .pp-slide-show-host')) { window.__opened.push({ href: a.href }); event.preventDefault(); }
    }, true);
  });

  // Les cadres du modèle, dans l'ordre du texte : A, B, C, D, E, F.
  const framesOf = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach((node, pos) => {
      if (node.type.name !== 'freeFrame') return;
      const a = node.attrs;
      out.push({ pos, text: node.textContent.trim(), view: a.view || '', link: a.link || '', trans: a.linkTrans || '', x: a.x, y: a.y, w: a.w, h: a.h, fill: a.fill, line: a.line, lw: a.lw, alt: a.alt || '' });
    });
    return out;
  });
  // Les vues de l'éditeur (ou d'un autre conteneur), dans l'ordre des cadres : le calque, la copie qu'il porte, sa mesure.
  const viewsIn = (root = '#editor-container .ProseMirror') => page.evaluate((rootSel) => {
    const base = document.querySelector(rootSel);
    if (!base) return [];
    return Array.from(base.querySelectorAll('.pp-free-frame:not(.pp-ff-view *)')).map((frame) => {
      const box = frame.querySelector(':scope > .pp-free-frame-box');
      const host = frame.querySelector(':scope > .pp-free-frame-box > .pp-ff-view');
      const sheet = host ? host.querySelector(':scope > .pp-ff-view-page') : null;
      const content = frame.querySelector(':scope > .pp-free-frame-box > .pp-free-frame-content');
      const r = host ? host.getBoundingClientRect() : null;
      const p = sheet ? sheet.getBoundingClientRect() : null;
      const marker = sheet ? sheet.querySelector('.pp-slide-props[data-bg]') : null;
      return {
        view: frame.getAttribute('data-ff-view') || '', host: !!host, hidden: host ? host.hidden : null, has: frame.classList.contains('pp-ff-has-view'),
        text: sheet ? sheet.textContent.replace(/\s+/g, ' ').trim() : '', nested: sheet ? sheet.querySelectorAll('.pp-ff-view, [data-ff-view], .pp-ff-has-view, .pp-ff-ui').length : 0,
        inert: sheet ? sheet.inert : null, ariaHidden: host ? host.getAttribute('aria-hidden') : null, pointer: host ? getComputedStyle(host).pointerEvents : null, cursor: host ? getComputedStyle(host).cursor : null,
        inner: sheet ? Array.from(sheet.querySelectorAll('*')).filter(n => getComputedStyle(n).pointerEvents !== 'none').length : 0,
        fallback: content ? getComputedStyle(content).visibility : null,
        host_: r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        page_: p && { left: p.left, top: p.top, right: p.right, bottom: p.bottom, width: p.width, height: p.height },
        bg: marker ? getComputedStyle(marker, '::before').backgroundColor : '',
        box: box ? { left: box.getBoundingClientRect().left, top: box.getBoundingClientRect().top, width: box.getBoundingClientRect().width, height: box.getBoundingClientRect().height } : null,
      };
    });
  }, root);
  const near = (a, b, tolerance = 1.5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;
  const anchors = () => page.evaluate(() => SlideProps.anchorsOf(EditorCore.getEditor().state.doc));
  const selected = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s && s.node && s.node.type.name === 'freeFrame' ? { view: s.node.attrs.view || '', link: s.node.attrs.link || '', text: s.node.textContent.trim() } : null; });
  const waitViews = (fn, timeout = 4000) => page.waitForFunction(fn, null, { timeout }).then(() => true).catch(() => false);
  // Amène la boîte du cadre `index` à l'écran (le panneau est petit) et rend son centre.
  const showFrame = async (index) => {
    await page.evaluate((i) => { const f = document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame:not(.pp-ff-view *)')[i]; f.querySelector(':scope > .pp-free-frame-box').scrollIntoView({ block: 'center', inline: 'center' }); }, index);
    await sleep(350);
    const c = await page.evaluate((i) => { const f = document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame:not(.pp-ff-view *)')[i]; const r = f.querySelector(':scope > .pp-free-frame-box').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height }; }, index);
    return c;
  };

  // --- 1. Le réglage.
  console.log('\n' + tag + '1) Le réglage : l\'adresse de la diapositive montrée');
  const model = await page.evaluate(() => {
    const view = raw => FreeFrame.normalized({ view: raw }).view;
    return {
      keep: ['slide-3', 'a', 'A_b-1', '7x'].map(view),
      drop: ['', ' ', '#slide-3', 'a b', 'é', 'x'.repeat(65), null, undefined, 42, '-a', '_a'].map(view),
      longest: view('x'.repeat(64)).length,
      line: FreeFrame.normalized({ shape: 'line', view: 'slide-3' }).view,
      shape: FreeFrame.normalized({ shape: 'rect', view: 'slide-3' }).view,
      shows: [SlideView.shows('<div data-ff-view="slide-3"></div>'), SlideView.shows('<p>rien</p>'), SlideView.shows(''), SlideView.shows(null)],
      api: ['host', 'fit', 'tidy', 'shows', 'fill', 'blocksOf', 'track', 'untrack', 'schedule', 'redraw', 'insert', 'openPicker'].every(name => typeof SlideView[name] === 'function'),
    };
  });
  check(tag + 'une adresse valide (lettres, chiffres, tiret, tiret bas ; 64 signes au plus) est gardée telle quelle', JSON.stringify(model.keep) === JSON.stringify(['slide-3', 'a', 'A_b-1', '7x']) && model.longest === 64, model);
  check(tag + 'une adresse vide, avec un blanc, un dièse ou une lettre accentuée, trop longue ou qui n\'est pas un texte ne donne aucune vue', model.drop.every(v => v === ''), model.drop);
  check(tag + 'une ligne n\'a pas de vue (sa boîte ne montre rien) ; une forme en a une', model.line === '' && model.shape === 'slide-3', { line: model.line, shape: model.shape });
  check(tag + '`SlideView.shows` dit si un texte a une vue, et l\'interface du module est là', JSON.stringify(model.shows) === JSON.stringify([true, false, false, false]) && model.api, model);
  const frames = await framesOf();
  check(tag + 'les cinq vues du modèle gardent leur diapositive (A, D : la 3e ; B : la 2e ; C : la 1re ; E : une qui n\'existe pas), leur lien et leur animation ; le bouton n\'a pas de vue',
    frames.length === 6 && frames[A].view === 'slide-3' && frames[B].view === 'slide-2' && frames[C].view === 'slide-1' && frames[D].view === 'slide-3' && frames[E].view === 'slide-9' && frames[F].view === ''
      && frames[A].link === '#slide-3' && frames[A].trans === 'fade r 400' && frames[B].link === '' && frames[D].trans === '', frames);
  const saved = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le texte enregistré porte `data-ff-view` sur les cinq vues, et rien du calque ni de sa copie (la vue se refait de la diapositive, elle n\'est jamais enregistrée)',
    (saved.match(/data-ff-view="/g) || []).length === 5 && !/pp-ff-view|pp-ff-has-view|pp-ff-view-page/.test(saved) && /data-ff-view="slide-9"/.test(saved), (saved.match(/class="[^"]*pp-ff[^"]*"/g) || []).slice(0, 5));

  // --- 2. L'éditeur.
  console.log('\n' + tag + '2) L\'éditeur : la vue en direct');
  await waitViews(() => { const hosts = document.querySelectorAll('#editor-container .ProseMirror .pp-ff-view-page'); return hosts.length >= 4; });
  let views = await viewsIn();
  check(tag + 'cinq calques, un par vue : quatre remplis (A, B, C, D), celui de la diapositive disparue (E) caché', views.length === 6 && [A, B, C, D, E].every(i => views[i].host) && !views[F].host && [A, B, C, D].every(i => !views[i].hidden && views[i].has) && views[E].hidden === true && !views[E].has, views.map(v => ({ host: v.host, hidden: v.hidden, has: v.has })));
  check(tag + 'A montre la 3e diapositive (« Merci », « Fin de la présentation ») sur son fond bleu pâle, B la 2e, C la 1re',
    /Merci/.test(views[A].text) && /Fin de la présentation/.test(views[A].text) && views[A].bg === 'rgb(232, 240, 254)' && /Chiffres du mois/.test(views[B].text) && /Bienvenue/.test(views[C].text), views.map(v => v.text));
  check(tag + 'la copie est la page entière, réduite sans déformation et centrée dans la boîte du cadre (A, B, C, D : largeur et hauteur à 1,5 px de la boîte, 16:9)',
    [A, B, C, D].every(i => near(views[i].page_.width, views[i].host_.width, 2) && near(views[i].page_.height, views[i].host_.height, 2) && near(views[i].page_.width / views[i].page_.height, 16 / 9, 0.02) && views[i].page_.left >= views[i].host_.left - 0.6 && views[i].page_.right <= views[i].host_.right + 0.6), views.map(v => v.page_ && v.host_ && [v.page_.width, v.host_.width, v.page_.height, v.host_.height]));
  check(tag + 'le texte de repli du cadre (son titre) est caché sous la vue de A, B, C, D et se lit dans E, dont la diapositive n\'existe plus',
    [A, B, C, D].every(i => views[i].fallback === 'hidden') && views[E].fallback === 'visible', views.map(v => v.fallback));
  check(tag + 'une vue ne montre jamais de vue : la copie de la 2e diapositive (B) montre D comme un cadre à son titre « Merci », sans la 3e diapositive ; celle de la 1re (C) sans boucle',
    views[B].nested === 0 && /Merci/.test(views[B].text) && !/Fin de la présentation/.test(views[B].text) && views[C].nested === 0 && views[A].nested === 0 && views[D].nested === 0, views.map(v => ({ nested: v.nested, text: v.text })));
  check(tag + 'la copie est inerte : ni clic, ni focus, ni lecteur d\'écran (aucun de ses éléments ne reçoit la souris, le calque est masqué aux lecteurs d\'écran) ; le calque seul prend la souris (la main de déplacement)',
    [A, B, C, D].every(i => views[i].inert === true && views[i].inner === 0 && views[i].ariaHidden === 'true' && views[i].pointer === 'auto' && views[i].cursor === 'move'), views.map(v => ({ inert: v.inert, inner: v.inner, aria: v.ariaHidden, pointer: v.pointer, cursor: v.cursor })));
  // La vue d'un cadre se choisit au clic et se déplace au glisser, d'UN pas d'historique.
  const a0 = await showFrame(A);
  await leave();
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return { cls: el ? el.className : '', inHost: !!el && !!el.closest('.pp-ff-view') }; }, [a0.x, a0.y]);
  check(tag + 'sous la souris, le centre de A est le calque de la vue (pas un élément de la copie)', hit.inHost && /pp-ff-view/.test(String(hit.cls)) && !/pp-ff-view-page/.test(String(hit.cls)), hit);
  await reach(a0);
  await page.mouse.click(a0.x, a0.y);
  await sleep(450);
  let sel = await selected();
  check(tag + 'un clic sur la vue choisit son cadre (A : sa diapositive, son lien), le curseur n\'entre pas dans la copie', !!sel && sel.view === 'slide-3' && sel.link === '#slide-3' && sel.text === 'Merci', sel);
  const before = (await framesOf())[A];
  const boxBefore = (await viewsIn())[A].box;
  await page.mouse.move(a0.x, a0.y);
  await page.mouse.down();
  await page.mouse.move(a0.x + 40, a0.y + 24, { steps: 8 });
  await page.mouse.up();
  await sleep(500);
  const moved = (await framesOf())[A];
  const boxAfter = (await viewsIn())[A].box;
  check(tag + 'glisser la vue déplace le cadre (à l\'écran de la distance de la souris : 40 px, 24 px), sans toucher à sa taille', !!moved && moved.x > before.x && moved.y > before.y && moved.w === before.w && moved.h === before.h && near(boxAfter.left - boxBefore.left, 40, 4) && near(boxAfter.top - boxBefore.top, 24, 4), { before, moved, boxBefore, boxAfter });
  views = await viewsIn();
  check(tag + 'la vue suit son cadre : toujours remplie, à la page entière réduite dans sa boîte', views[A].host && views[A].has && /Fin de la présentation/.test(views[A].text) && near(views[A].page_.width, views[A].host_.width, 2), views[A]);
  await page.keyboard.press('Control+z');
  await sleep(500);
  const undone = (await framesOf())[A];
  check(tag + 'UN Ctrl+Z remet le cadre à sa place (le glisser est un seul pas d\'historique)', undone.x === before.x && undone.y === before.y, { before, undone });
  // Ce qu'on tape dans la diapositive montrée se voit dans les vues, et dans la miniature de la bande.
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    let at = -1;
    ed.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text === 'Fin de la présentation') at = pos + node.text.length; });
    ed.chain().setTextSelection(at).focus().run();
  });
  await sleep(250);
  await page.keyboard.type(' bis');
  const typed = await waitViews(() => { const hosts = Array.from(document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame[data-ff-view="slide-3"] .pp-ff-view-page')); return hosts.length === 2 && hosts.every(h => /Fin de la présentation bis/.test(h.textContent)); }, 5000);
  views = await viewsIn();
  check(tag + 'taper « bis » dans la 3e diapositive : la vue de A et celle de D (une autre vue de la même diapositive) le montrent un instant après', typed && /Fin de la présentation bis/.test(views[A].text) && /Fin de la présentation bis/.test(views[D].text), { a: views[A].text, d: views[D].text });
  const thumbOk = await waitViews(() => { const page = document.querySelectorAll('.pp-slide-item')[0].querySelector('.pp-ff-view-page'); return !!page && /bis/.test(page.textContent); }, 6000);
  const thumb = await page.evaluate(() => {
    const row = document.querySelectorAll('.pp-slide-item')[0];
    const hosts = Array.from(row.querySelectorAll('.pp-ff-view'));
    return { count: hosts.length, texts: hosts.map(h => (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)), pointer: hosts[0] ? getComputedStyle(hosts[0]).pointerEvents : null, cursor: hosts[0] ? getComputedStyle(hosts[0]).cursor : null };
  });
  check(tag + 'la miniature de la diapositive 1 montre ses vues, avec le « bis » aussi, sans en faire des cibles de la souris (la main de déplacement n\'y est pas)', thumbOk && thumb.count >= 3 && thumb.pointer === 'none' && thumb.cursor !== 'move', thumb);
  await page.keyboard.press('Control+z');
  await sleep(300);
  // Une diapositive qui disparaît (la 3e, avec son saut de page : un repère effacé seul serait remis par l'éditeur) : le calque se cache, le texte de repli se lit ; un Ctrl+Z remet la vue.
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const slide = SlideStrip.slidesOf(ed.state.doc)[2];
    ed.view.dispatch(ed.state.tr.delete(slide.breakBefore, slide.breakAfter));
  });
  const gone = await waitViews(() => { const hosts = Array.from(document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame[data-ff-view="slide-3"] .pp-ff-view')); return hosts.length === 2 && hosts.every(h => h.hidden); }, 5000);
  views = await viewsIn();
  check(tag + 'sans la 3e diapositive, les vues de A et D se cachent et leur texte de repli (« Merci ») se lit', gone && [A, D].every(i => views[i].hidden === true && !views[i].has && views[i].fallback === 'visible'), views.map(v => ({ hidden: v.hidden, has: v.has, fallback: v.fallback })));
  const thumbsOf3 = () => Array.from(document.querySelectorAll('.pp-slide-item')[0].querySelectorAll('.pp-ff-view')).filter(h => h.querySelector('.pp-ff-view-page') && /Fin de la présentation/.test(h.textContent)).length;
  const thumbGone = await waitViews(() => (Array.from(document.querySelectorAll('.pp-slide-item')[0].querySelectorAll('.pp-ff-view')).filter(h => h.querySelector('.pp-ff-view-page') && /Fin de la présentation/.test(h.textContent)).length === 0), 6000);
  check(tag + 'la miniature de la diapositive 1, un instant après, ne montre plus la 3e diapositive', thumbGone, await page.evaluate(thumbsOf3));
  await page.keyboard.press('Control+z');
  const back = await waitViews(() => Array.from(document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame[data-ff-view="slide-3"] .pp-ff-view-page')).length === 2, 5000);
  views = await viewsIn();
  check(tag + 'UN Ctrl+Z rend la 3e diapositive : les vues de A et D la montrent de nouveau', back && [A, D].every(i => !views[i].hidden && views[i].has && /Merci/.test(views[i].text)), views.map(v => ({ hidden: v.hidden, text: v.text.slice(0, 30) })));

  // --- 3. Le menu « Objets » et la pose d'une vue.
  console.log('\n' + tag + '3) Le menu « Objets » : « ' + T.row + ' »');
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.chain().setTextSelection(1).focus().run(); });
  await leave();
  await hoverObjectsButton(page);
  const menu = await page.evaluate((sel) => {
    const m = document.querySelector(sel);
    const r = m.getBoundingClientRect();
    const pick = id => m.querySelector('[data-action="' + id + '"]');
    const rows = ['textFrame', 'table', 'slideView', 'linkedTable'].map((id) => { const b = pick(id); const q = b.getBoundingClientRect(); const label = b.querySelector('span:not(.v2-menu-row-icon)'); const lr = label.getBoundingClientRect(); return { id, top: q.top, left: q.left, right: q.right, height: q.height, text: label.textContent, labelIn: lr.left >= q.left - 0.5 && lr.right <= q.right + 0.5, tip: b.getAttribute('data-tip') || '' }; });
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, rows, vh: innerHeight, vw: innerWidth };
  }, OBJECTS_MENU);
  const [mText, mTable, mView, mLinked] = menu.rows;
  check(tag + '« ' + T.row + ' » est sur la ligne de « Cadre de texte » et de « Tableau » (trois boutons côte à côte), « Tableau d\'un modèle Grille… » dessous', Math.abs(mView.top - mText.top) < 1 && Math.abs(mTable.top - mText.top) < 1 && mText.right <= mTable.left + 1 && mTable.right <= mView.left + 1 && mLinked.top > mView.top + 20, menu.rows);
  check(tag + 'le menu tient dans le panneau de 700 x 400 (il finit au-dessus du bas) et son nom n\'est coupé dans aucun des trois boutons', menu.bottom <= menu.vh - 4 && menu.right <= menu.vw && menu.width <= 300 && menu.rows.every(r => r.labelIn) && mView.text === T.row, menu);
  check(tag + 'l\'info-bulle de « ' + T.row + ' » dit où la vue se posera (' + T.slide(1) + ')', mView.tip.indexOf(T.slide(1)) >= 0, mView.tip);
  // La souris vers la ligne, le clic : la liste avec recherche s'ouvre.
  await chooseObject(page, 'slideView');
  await sleep(500);
  const picker = await page.evaluate(() => {
    const host = document.getElementById('v2-slide-view-search');
    if (!host) return null;
    const panel = host.querySelector('.ss-panel');
    const r = panel ? panel.getBoundingClientRect() : null;
    const input = host.querySelector('.ss-input');
    return { options: Array.from(host.querySelectorAll('.ss-option')).map(li => li.textContent.trim()), shown: !!r && r.width > 0, in: !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, placeholder: input ? input.placeholder : '', focus: !!input && document.activeElement === input, menuOpen: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded') };
  });
  check(tag + 'la liste avec recherche s\'ouvre sous la souris, entière dans le panneau, le clavier dans son champ (« ' + T.search + ' ») ; le menu s\'est refermé', !!picker && picker.shown && picker.in && picker.placeholder === T.search && picker.focus && picker.menuOpen === 'false', picker);
  check(tag + 'elle nomme les quatre diapositives, par leur rang et leur titre', !!picker && JSON.stringify(picker.options) === JSON.stringify(['1. Accueil', '2. Les chiffres', '3. Merci', '4. Sans repère']), picker && picker.options);
  await page.keyboard.type('chi');
  await sleep(300);
  const filtered = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-slide-view-search .ss-option')).filter(li => li.offsetParent !== null).map(li => li.textContent.trim()));
  check(tag + 'taper « chi » ne garde que « 2. Les chiffres »', JSON.stringify(filtered) === JSON.stringify(['2. Les chiffres']), filtered);
  await key('Escape', 400);
  const escaped = await page.evaluate(() => ({ open: !!document.querySelector('#v2-slide-view-search .ss-panel') && document.querySelector('#v2-slide-view-search .ss-panel').getBoundingClientRect().width > 0, frames: document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame:not(.pp-ff-view *)').length, host: !!document.getElementById('v2-slide-view-search') }));
  check(tag + 'Échap referme la liste sans rien poser', !escaped.open && escaped.frames === 6 && !escaped.host, escaped);
  // Choisir « 2. Les chiffres » : la vue se pose sur la diapositive du curseur (la 1re), sélectionnée.
  await leave();
  await chooseObject(page, 'slideView');
  await sleep(450);
  await page.keyboard.type('chi');
  await sleep(250);
  await key('Enter', 700);
  let list = await framesOf();
  const made = list.length === 7 ? list.find(f => !frames.some(g => g.pos === f.pos) ) : null;
  sel = await selected();
  check(tag + 'Entrée pose UNE vue de « 2. Les chiffres » : sélectionnée, avec son lien, son titre et son texte alternatif', list.length === 7 && !!made && made.view === 'slide-2' && made.link === '#slide-2' && made.text === 'Les chiffres' && T.altOf(2).test(made.alt) && /Les chiffres/.test(made.alt) && !!sel && sel.view === 'slide-2', { made, sel });
  const pageSize = await page.evaluate(() => ({ w: PageLayout.getPageSizePt ? PageLayout.getPageSizePt().width : 960, h: PageLayout.getPageSizePt ? PageLayout.getPageSizePt().height : 540 }));
  check(tag + 'la vue posée est large de 40 % de la page, à son format (16:9), à la page, en blanc à fin trait gris', !!made && near(made.w, 0.4 * pageSize.w, 0.7) && near(made.h, made.w * pageSize.h / pageSize.w, 0.7) && made.x >= 0 && made.y >= 0 && made.x + made.w <= pageSize.w + 0.5 && made.y + made.h <= pageSize.h + 0.5 && made.fill === '#ffffff' && made.line === '#bfbfbf' && made.lw === 0.75, { made, pageSize });
  const filled = await waitViews(() => { const hosts = Array.from(document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame[data-ff-view="slide-2"] .pp-ff-view-page')); return hosts.length >= 2 && hosts.some(h => /Chiffres du mois/.test(h.textContent)); }, 5000);
  check(tag + 'la vue posée montre « Chiffres du mois » en direct (elle s\'ajoute à celle de B)', filled, filled);
  await page.keyboard.press('Control+z');
  await sleep(600);
  list = await framesOf();
  check(tag + 'UN Ctrl+Z retire la vue (six cadres, la 2e diapositive garde son repère)', list.length === 6 && (await anchors()).filter(Boolean).length === 3, { frames: list.length, anchors: await anchors() });
  await page.keyboard.press('Control+y');
  await sleep(600);
  list = await framesOf();
  check(tag + 'UN Ctrl+Y la remet, au même endroit', list.length === 7 && list.some(f => f.view === 'slide-2' && f.text === 'Les chiffres' && !frames.some(g => g.pos === f.pos)), list.map(f => f.view));
  await page.keyboard.press('Control+z');
  await sleep(500);
  // Une diapositive sans repère en reçoit un avec la vue, d'un seul pas d'historique.
  const anchorsBefore = await anchors();
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.chain().setTextSelection(1).focus().run(); });
  await leave();
  await chooseObject(page, 'slideView');
  await sleep(450);
  await page.keyboard.type('sans');
  await sleep(250);
  await key('Enter', 800);
  const anchorsAfter = await anchors();
  list = await framesOf();
  const viewOf4 = list.find(f => f.text === 'Sans repère');
  check(tag + 'une vue de « 4. Sans repère » donne un repère à cette diapositive (quatre repères), le même que celui de la vue et de son lien', anchorsBefore.filter(Boolean).length === 3 && anchorsAfter.filter(Boolean).length === 4 && !!viewOf4 && viewOf4.view === anchorsAfter[3] && viewOf4.link === '#' + anchorsAfter[3] && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(viewOf4.view), { anchorsBefore, anchorsAfter, viewOf4 });
  await page.keyboard.press('Control+z');
  await sleep(600);
  list = await framesOf();
  check(tag + 'UN Ctrl+Z retire la vue ET le repère neuf (trois repères, six cadres)', list.length === 6 && (await anchors()).filter(Boolean).length === 3, { frames: list.length, anchors: await anchors() });
  // Au clavier : le bouton, ↓ sur la première ligne, → → « Vue… », Entrée.
  await leave();
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.chain().setTextSelection(1).focus().run(); document.querySelector('#v2-btn-objects').focus(); });
  await key('ArrowDown', 250);
  const first = await page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  await key('ArrowRight', 150);
  await key('ArrowRight', 150);
  const third = await page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  await key('ArrowDown', 150);
  const below = await page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  await key('ArrowUp', 150);
  const above = await page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  check(tag + 'au clavier : ↓ donne le clavier à « Cadre de texte », → → mène à « ' + T.row + ' », ↓ à « Tableau d\'un modèle Grille… », ↑ revient à la même place en largeur (« Cadre de texte »)', first === 'textFrame' && third === 'slideView' && below === 'linkedTable' && above === 'textFrame', { first, third, below, above });
  await key('ArrowRight', 150);
  await key('ArrowRight', 150);
  const again = await page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  check(tag + '→ → ramène à « ' + T.row + ' »', again === 'slideView', again);
  await key('Enter', 600);
  const kb = await page.evaluate(() => ({ list: !!document.getElementById('v2-slide-view-search'), focus: document.activeElement && document.activeElement.className }));
  check(tag + 'Entrée sur « ' + T.row + ' » ouvre la liste, le clavier dans son champ de recherche', kb.list && /ss-input/.test(String(kb.focus)), kb);
  await key('Escape', 400);

  // --- 4. Le diaporama.
  console.log('\n' + tag + '4) Le diaporama');
  await leave();
  await click('.pp-slide-item', 0);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await sleep(1200);
  const showState = () => page.evaluate(() => {
    const s = SlideShow.state();
    if (!s) return { open: false, index: -1, kind: null, side: null, duration: null };
    return { open: !!document.querySelector('.pp-slide-show'), index: s.index, kind: s.transition ? s.transition.kind : null, side: s.transition ? s.transition.side : null, duration: s.transition ? s.transition.duration : null };
  });
  const inShow = () => page.evaluate(() => {
    const root = (document.querySelector('.pp-slide-show .pp-slide-show-host') || {}).shadowRoot;
    if (!root) return null;
    const pick = (sel, trans) => Array.from(root.querySelectorAll('.pp-free-frame[data-ff-view' + sel + ']')).find(f => (f.getAttribute('data-ff-link-trans') || '') === trans);
    const read = (frame) => {
      if (!frame) return null;
      const box = frame.querySelector(':scope > .pp-free-frame-box');
      const host = box.querySelector(':scope > .pp-ff-view');
      const sheet = host ? host.querySelector(':scope > .pp-ff-view-page') : null;
      const content = box.querySelector(':scope > .pp-free-frame-content');
      const r = box.getBoundingClientRect();
      const q = host ? host.getBoundingClientRect() : null;
      const p = sheet ? sheet.getBoundingClientRect() : null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, host: !!host, has: frame.classList.contains('pp-ff-has-view'), text: sheet ? sheet.textContent.replace(/\s+/g, ' ').trim() : '', nested: sheet ? sheet.querySelectorAll('.pp-ff-view, [data-ff-view]').length : 0, fallback: content ? getComputedStyle(content).visibility : null, fit: !!p && !!q && Math.abs(p.width - q.width) < 2 && Math.abs(p.height - q.height) < 2 };
    };
    return { A: read(pick('="slide-3"', 'fade r 400')), B: read(pick('="slide-2"', '')), C: read(pick('="slide-1"', '')), D: read(pick('="slide-3"', '')), E: read(pick('="slide-9"', '')), total: root.querySelectorAll('.pp-ff-view').length };
  });
  let shown = await inShow();
  check(tag + 'au diaporama, la vue de A montre la 3e diapositive (« Merci », « Fin de la présentation ») en entier, réduite dans sa boîte ; celle de B la 2e sans montrer la vue qu\'elle porte ; celle de C la 1re sans boucle',
    !!shown && shown.A.host && shown.A.has && /Fin de la présentation/.test(shown.A.text) && shown.A.fit && shown.A.fallback === 'hidden' && shown.B.host && /Chiffres du mois/.test(shown.B.text) && shown.B.nested === 0 && !/Fin de la présentation/.test(shown.B.text) && shown.C.host && shown.C.nested === 0 && shown.A.nested === 0, shown);
  check(tag + 'celle de E (une diapositive qui n\'existe pas) n\'a pas de calque : son texte de repli se lit', !!shown && !!shown.E && !shown.E.host && !shown.E.has && shown.E.fallback === 'visible', shown && shown.E);
  // Un clic sur la vue de B (sans lien) ne fait rien ; un clic sur celle de A mène à la 3e diapositive avec le fondu de 400 ms de ce lien.
  await page.mouse.move(WIDTH / 2, HEIGHT / 2 + 3);
  await sleep(150);
  await page.mouse.move(shown.B.x - 10, shown.B.y); await page.mouse.move(shown.B.x, shown.B.y, { steps: 2 });
  await page.mouse.click(shown.B.x, shown.B.y);
  await sleep(500);
  let s = await showState();
  check(tag + 'un clic sur la vue de B, qui n\'a pas de lien, est un clic comme un autre : la diapositive suivante (la 2e), sans l\'animation d\'un lien', s.open && s.index === 1 && s.kind !== 'fade', s);
  await key('Home', 800);
  shown = await inShow();
  await page.mouse.move(shown.A.x - 12, shown.A.y); await page.mouse.move(shown.A.x, shown.A.y, { steps: 2 });
  await page.mouse.click(shown.A.x, shown.A.y);
  await sleep(150);
  s = await showState();
  check(tag + 'un clic sur la vue de A mène à la 3e diapositive en jouant le fondu de 400 ms choisi pour ce lien, pas autre chose', s.open && s.index === 2 && s.kind === 'fade' && s.duration === 400, s);
  await sleep(900);
  await key('ArrowLeft', 700);
  await key('Home', 700);
  await key('ArrowRight', 800);
  s = await showState();
  shown = await inShow();
  check(tag + 'sur la 2e diapositive, la vue de D montre la 3e et celle de E laisse son texte de repli', s.index === 1 && !!shown.D && shown.D.host && /Fin de la présentation/.test(shown.D.text) && !shown.E.host && shown.E.fallback === 'visible', { s, d: shown.D, e: shown.E });
  await page.mouse.move(shown.E.x - 10, shown.E.y); await page.mouse.move(shown.E.x, shown.E.y, { steps: 2 });
  await page.mouse.click(shown.E.x, shown.E.y);
  await sleep(500);
  s = await showState();
  check(tag + 'un clic sur E, dont le lien mène à une diapositive qui n\'existe pas, ne fait rien et ne casse rien', s.open && s.index === 1, s);
  await page.mouse.move(shown.D.x - 10, shown.D.y); await page.mouse.move(shown.D.x, shown.D.y, { steps: 2 });
  await page.mouse.click(shown.D.x, shown.D.y);
  await sleep(300);
  s = await showState();
  check(tag + 'un clic sur la vue de D mène à la 3e diapositive', s.index === 2, s);
  await key('Escape', 800);
  check(tag + 'le diaporama se referme', !(await showState()).open, await showState());

  // --- 5. La Lecture.
  console.log('\n' + tag + '5) La Lecture');
  await leave();
  await click('#btn-mode-read');
  await sleep(1500);
  const inRead = () => page.evaluate(() => {
    const root = document.getElementById('reader-container');
    const frames = Array.from(root.querySelectorAll('.pp-free-frame[data-ff-view]'));
    return frames.map((frame) => {
      const host = frame.querySelector(':scope > .pp-free-frame-box > .pp-ff-view');
      const sheet = host ? host.querySelector(':scope > .pp-ff-view-page') : null;
      const q = host ? host.getBoundingClientRect() : null;
      const p = sheet ? sheet.getBoundingClientRect() : null;
      return { view: frame.getAttribute('data-ff-view'), trans: frame.getAttribute('data-ff-link-trans') || '', host: !!host, text: sheet ? sheet.textContent.replace(/\s+/g, ' ').trim() : '', fit: !!p && !!q && Math.abs(p.width - q.width) < 2 && Math.abs(p.height - q.height) < 2, cursor: getComputedStyle(frame.querySelector(':scope > .pp-free-frame-box')).cursor, nested: sheet ? sheet.querySelectorAll('.pp-ff-view, [data-ff-view]').length : 0 };
    });
  });
  const read = await inRead();
  check(tag + 'la Lecture montre les cinq vues : A, B, C, D remplies à la page entière réduite, E sans calque ; la main sur celles qui ont un lien, pas sur B',
    read.length === 5 && read.slice(0, 4).every(v => v.host && v.fit && v.nested === 0) && !read[4].host && /Fin de la présentation/.test(read[0].text) && /Chiffres du mois/.test(read[1].text) && read[0].cursor === 'pointer' && read[1].cursor !== 'pointer', read);
  const markAt = id => page.evaluate((anchor) => { const m = document.querySelector('#reader-container [data-anchor="' + anchor + '"]'); if (!m) return null; const r = m.getBoundingClientRect(); return { top: r.top, inView: r.top >= -2 && r.top <= innerHeight }; }, id);
  await page.evaluate(() => { const c = document.getElementById('reader-container'); const scroller = c.closest('[style*="overflow"], .reader-scroll') || document.scrollingElement; if (scroller) scroller.scrollTop = 0; });
  await sleep(300);
  const at = await page.evaluate(() => { const frame = document.querySelector('#reader-container .pp-free-frame[data-ff-view="slide-3"]'); const box = frame.querySelector(':scope > .pp-free-frame-box'); box.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = box.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await sleep(300);
  const at2 = await page.evaluate(() => { const frame = document.querySelector('#reader-container .pp-free-frame[data-ff-view="slide-3"]'); const r = frame.querySelector(':scope > .pp-free-frame-box').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const before3 = await markAt('slide-3');
  await page.mouse.move(at2.x - 8, at2.y); await page.mouse.click(at2.x, at2.y);
  await sleep(900);
  const after3 = await markAt('slide-3');
  check(tag + 'un clic sur la vue de A, à la Lecture, amène la 3e diapositive en haut de la zone qui défile', !!before3 && !!after3 && after3.inView && (!before3.inView || Math.abs(after3.top - before3.top) > 5), { at, at2, before3, after3 });
  await leave();
  await click('#btn-mode-edit');
  await sleep(1200);
  views = await viewsIn();
  check(tag + 'revenu à l\'édition, les vues sont là (A, B, C, D remplies, E cachée)', [A, B, C, D].every(i => views[i].host && !views[i].hidden) && views[E].hidden === true, views.map(v => ({ host: v.host, hidden: v.hidden })));

  // --- 6. Les exports.
  console.log('\n' + tag + '6) Les exports : un cadre et son titre');
  await leave();
  const [pdfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const pdfBytes = readFileSync(await pdfDownload.path());
  const pdf = await page.evaluate(async (data64) => {
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
      const content = await p.getTextContent();
      pages.push(content.items.map(it => it.str).join(' ').replace(/\s+/g, ' '));
    }
    return { numPages: doc.numPages, pages };
  }, pdfBytes.toString('base64'));
  check(tag + 'le PDF a quatre pages ; la page 1 montre les titres des vues (« Merci », « Les chiffres ») sans la copie de la 3e diapositive (« Fin de la présentation » n\'est que sur la page 3)',
    pdf.numPages === 4 && /Merci/.test(pdf.pages[0]) && /Les chiffres/.test(pdf.pages[0]) && !/Fin de la présentation/.test(pdf.pages[0]) && /Fin de la présentation/.test(pdf.pages[2]), pdf.pages);
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pptx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  const [pptxDownload] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), click('#btn-export-pdf')]);
  const pptxB64 = readFileSync(await pptxDownload.path()).toString('base64');
  const pptx = await page.evaluate(async (b64) => {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
    const slide3 = await zip.file('ppt/slides/slide3.xml').async('string');
    const doc = new DOMParser().parseFromString(slide1, 'application/xml');
    const shapes = Array.from(doc.getElementsByTagName('p:sp')).map((sp) => {
      const name = sp.getElementsByTagName('p:cNvPr')[0];
      const link = name ? name.getElementsByTagName('a:hlinkClick')[0] : null;
      return { text: Array.from(sp.getElementsByTagName('a:t')).map(n => n.textContent).join(''), action: link ? link.getAttribute('action') : null };
    });
    return { shapes, slide1HasEnd: /Fin de la présentation/.test(slide1), slide3HasEnd: /Fin de la présentation/.test(slide3) };
  }, pptxB64);
  const merci = pptx.shapes.find(sh => sh.text === 'Merci');
  check(tag + 'le PowerPoint écrit la vue de A comme un objet « Merci » dont le lien est un saut vers la 3e diapositive, sans la copie de cette diapositive (son texte n\'est que sur la diapositive 3)', !!merci && merci.action === 'ppaction://hlinksldjump' && !pptx.slide1HasEnd && pptx.slide3HasEnd, pptx);
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  check(tag + 'aucune erreur de page pendant tout le parcours', errors.length === 0, errors);
  await page.close();
}

const only = process.env.SLIDE_VIEW_ONLY || '';
if (!only || only === 'fr') await run('fr', 'light');
if (!only || only === 'en') await run('en', 'dark');
await t.finish();
