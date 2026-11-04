#!/usr/bin/env node
// La VUE INTERVENANT du diaporama (extensions/diapositives/slide-speaker.js et .css, slide-show.js, slide-player.js, slide-window.js, slide-present.js ; demande du 02/11 : « notes, diapositive suivante, chrono, aller à
// une diapositive » ; carte du 02/11 : « dans le widget »), l'app dans le cadre isolé de GFS - sans `allow-fullscreen`, donc le diaporama se joue dans une fenêtre -, à la vraie souris et au vrai clavier, 700x400, français
// clair puis anglais sombre, la politique de sécurité du contenu respectée (`bypassCSP` faux), `popups` vrai et bloqueur de fenêtres de Chromium ALLUMÉ (une fenêtre ne s'ouvre que dans un geste vrai : c'est ce qui force
// la console à tenir avec UNE seule fenêtre par geste).
//  LE MENU : la ligne « Vue intervenant » du menu ▾ (case à cocher, décochée au départ, avec sa note), atteinte au clavier (Fin), cochée à la souris et gardée pour la page ouverte.
//  LE DÉPART : le ▶ ouvre UNE fenêtre - une vraie fenêtre, pas un onglet - qui joue le diaporama ; le panneau devient la console (rien du diaporama dedans, la barre de GFS masquée) ; elle montre la diapositive du curseur et la
//   suivante (celle que « suivante » atteint : la masquée est sautée), entières, avec le même rendu que le public, le numéro, ce que le prochain clic fera, les notes (retours à la ligne gardés) ; les notes ne partent jamais vers la
//   fenêtre ; à 700x400 tout tient, lisible (4,5:1 au moins).
//  LES ORDRES : › ‹, les touches du diaporama (→ ← Espace Début Fin), un clic sur la diapositive en cours, la molette sur les aperçus, la fenêtre et la console restent d'accord ; une animation à clic se joue d'abord (l'aperçu et la
//   consigne la suivent, « précédent » la défait) ; les notes défilent à la molette et aux flèches quand elles ont le focus ; l'écran de fin ; « Aller à… » (la liste devant la console, la recherche, la masquée marquée et atteignable,
//   une diapositive sans texte nommée par son numéro, Échap ne ferme que la liste).
//  LE CHRONO ET L'HEURE : le chrono part avec le diaporama, se met en pause, reprend, se remet à zéro ; l'heure est celle de l'appareil ; A− et A+ règlent les notes entre des bornes.
//  LE CLAVIER : Tab circule dans la console sans en sortir, F5 ne recharge pas la page, un autre ▶ n'ouvre pas une deuxième fenêtre.
//  SORTIR : Échap, « Quitter », la fenêtre qui se ferme (Échap dedans, ou le navigateur) ferment la console ; la barre de GFS revient, le clavier revient où il était, le document n'a pas bougé et rien n'est enregistré.
//  L'ÉCRAN NOIR, L'ÉCRAN BLANC ET LE STYLO (demande du 04/11, fonction `screensAndPen`, fenêtre à 1024x600 : « Plein écran » décoché) : quatre outils nommés au bord droit du titre de la diapositive en cours ; B noircit l'écran du public, W le
//   blanchit (la même touche, le bouton, ou un clic dans la fenêtre le rend ; B sur le blanc passe au noir ; la barre du bas de la fenêtre est couverte), la console garde la diapositive et le dit (bouton enfoncé, phrase en négatif) ;
//   toute navigation rend la diapositive ; une touche gardée enfoncée ne clignote pas ; le stylo trace à la souris sur la diapositive en cours, le même trait au même endroit de la page dans la console et dans la fenêtre (pixels
//   rouges), un clic sans glisser fait un point sans passer à la suivante, hors de la page rien ne se trace, derrière un écran non plus (et rien ne revient ensuite) ; effacer (bouton, E), changer de diapositive et recharger la fenêtre
//   effacent ; Échap finit le stylo avant de quitter ; des messages mal formés, hors page, d'un autre expéditeur ou trop nombreux ne tracent rien de plus que le plafond ; la fenêtre sans vue intervenant (ou le panneau) n'a ni
//   écran ni stylo ; derrière un écran noir le passage seul attend et se recompte au retour, et le tracé de la page qu'on quitte part avec elle le temps d'un effet.
//  LES AUTRES CAS : « Plein écran » décoché, la fenêtre se joue telle qu'elle est (aucun clic n'y demande le plein écran) ; sans la case, ▶ ouvre la fenêtre comme avant ; la fenêtre refusée par le navigateur : le diaporama se joue
//   dans le panneau, avec la ligne qui le dit, sans console ; un message qui ne vient pas de la fenêtre, ou qui n'est pas un état, est ignoré (dans les deux sens) ; soixante-dix diapositives restent fluides.
// Lancé par run-headless.mjs (groupe Node "slidesSpeaker", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-speaker.mjs
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-speaker', port: Number(process.env.SLIDES_SPEAKER_PORT || 9173), popupBlocker: true });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
async function until(condition, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await condition();
    if (value || Date.now() > end) return value;
    await sleep(60);
  }
}

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const NOTES = text => `<div class="pp-slide-props" data-notes="${text.replace(/\n/g, '&#10;')}"></div>`;
const FRAME = (x, y, w, h, anim, name) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${anim ? ` data-ff-anim="${anim}"` : ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${name}</p></div></div></div>`;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const FIRST_NOTES = 'Accueillir, rappeler le contexte.\n\nCiter le chiffre clé : 18 % du temps perdu.\nLaisser une question ouverte.';
const LONG_NOTES = Array.from({ length: 40 }, (_, i) => 'Point ' + (i + 1)).join('\n');
// Six diapositives : 1 deux animations à clic (Alpha puis Bravo) et des notes sur plusieurs lignes ; 2 des notes ; 3 MASQUÉE ; 4 un texte sans titre ; 5 une image seule, sans aucun texte ; 6 de longues notes (40 lignes).
const SLIDES = [
  `${NOTES(FIRST_NOTES)}<h1>Mieux piloter</h1><p>Sous-titre un</p>${FRAME(40, 190, 200, 60, 'fade', 'Alpha')}${FRAME(260, 190, 200, 60, 'fade', 'Bravo')}`,
  `${NOTES('Le constat en trois points.')}<h2>Le constat</h2><p>Trois sites, deux outils</p>`,
  '<div class="pp-slide-props" data-hidden="1"></div><h2>Annexe masquée</h2><p>Cachée au public</p>',
  '<p>Texte seul sans titre</p>',
  `<p><img class="editor-image" src="${PIXEL}" alt="" style="width: 80px; height: 80px"></p>`,
  `${NOTES(LONG_NOTES)}<h2>Conclusion</h2><p>Merci</p>`,
].join(BR);
const MANY = Array.from({ length: 70 }, (_, k) => `${NOTES('Notes de la diapositive ' + (k + 1))}<h2>Titre ${k + 1}</h2><p>Texte de la diapositive ${k + 1}</p>`).join(BR);
// Quatre diapositives pour l'écran noir : 2 passe seule après 2 s ; 4 arrive en fondu de 2,5 s.
const TIMED = [
  '<h2>Un</h2>',
  '<div class="pp-slide-props" data-advance="2000"></div><h2>Deux</h2>',
  '<h2>Trois</h2>',
  '<div class="pp-slide-props" data-trans="fade" data-trans-dur="2500"></div><h2>Quatre</h2>',
].join(BR);
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Intervenant', '${SLIDES}', false, 'presentation');
  add(8, 'Soixante-dix', '${MANY}', false, 'presentation');
  add(9, 'Ecrans', '${TIMED}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
const TEXTS = {
  fr: {
    label: 'Vue intervenant', more: 'Autres façons de présenter : depuis le début, plein écran, vue intervenant', menu: 'Vue intervenant',
    menuNote: 'Le diaporama s’ouvre dans une fenêtre à part ; ce panneau devient la console : diapositive suivante, notes, chrono, écran noir et stylo.',
    current: 'DIAPOSITIVE EN COURS', upcoming: 'SUIVANTE', end: 'Fin du diaporama', hintSlide: 'Prochain clic : diapositive suivante', hintEnd: 'Prochain clic : fin du diaporama',
    hintEnded: 'Fin du diaporama : un geste de plus le ferme.', hintClick: (k, n) => `Prochain clic : animation ${k} / ${n} (la diapositive ne change pas)`,
    noNotes: 'Pas de notes pour cette diapositive.', smaller: 'Notes en plus petit', larger: 'Notes en plus grand', goTo: 'Aller à…', hiddenMark: 'masquée', untitled: n => `Diapositive ${n}`,
    pause: 'Mettre le chrono en pause', resume: 'Reprendre le chrono', reset: 'Remettre le chrono à zéro', exit: 'Quitter le diaporama (Échap)',
    prev: 'Diapositive précédente (←)', next: 'Diapositive suivante (→)', hint: 'Un clic ou une touche pour passer en plein écran.', search: 'Chercher une diapositive…', empty: 'Aucune diapositive ne correspond.',
    blocked: 'Le navigateur a bloqué la fenêtre du diaporama : sans elle, pas de vue intervenant. Le diaporama s’affiche dans le panneau.', annexe: 'annexe',
    tools: 'Écran du public et stylo', black: 'Écran noir pour le public (B)', white: 'Écran blanc pour le public (W)', pen: 'Stylo : dessiner sur la diapositive (D)', erase: 'Effacer le tracé (E)',
    blackTip: 'Le public ne voit plus que du noir ; votre console reste affichée. B, un clic dans la fenêtre ou un changement de diapositive retire l’écran noir.',
    whiteTip: 'Le public ne voit plus que du blanc ; votre console reste affichée. W, un clic dans la fenêtre ou un changement de diapositive retire l’écran blanc.',
    penTip: 'Dessinez en rouge sur la diapositive en cours : le trait apparaît au même endroit chez le public. Changer de diapositive l’efface ; Échap repose le stylo.',
    eraseTip: 'Efface tout ce qui est dessiné au stylo sur la diapositive en cours, chez vous et chez le public. Grisé quand il n’y a rien à effacer.',
    hintBlack: 'Écran noir pour le public : B pour revenir.', hintWhite: 'Écran blanc pour le public : W pour revenir.', hintPen: 'Stylo : dessine ici. E efface, Échap finit.',
  },
  en: {
    label: 'Presenter view', more: 'Other ways to present: from the beginning, full screen, presenter view', menu: 'Presenter view',
    menuNote: 'The slide show opens in its own window; this panel becomes the console: next slide, notes, timer, black screen and pen.',
    current: 'CURRENT SLIDE', upcoming: 'NEXT', end: 'End of the slide show', hintSlide: 'Next click: next slide', hintEnd: 'Next click: end of the slide show',
    hintEnded: 'End of the slide show: one more step closes it.', hintClick: (k, n) => `Next click: animation ${k} / ${n} (the slide stays)`,
    noNotes: 'No notes for this slide.', smaller: 'Smaller notes', larger: 'Larger notes', goTo: 'Go to…', hiddenMark: 'hidden', untitled: n => `Slide ${n}`,
    pause: 'Pause the timer', resume: 'Resume the timer', reset: 'Reset the timer', exit: 'Exit the slide show (Esc)',
    prev: 'Previous slide (←)', next: 'Next slide (→)', hint: 'Click or press a key to go full screen.', search: 'Search for a slide…', empty: 'No slide matches.',
    blocked: 'The browser blocked the slide show window: without it, there is no presenter view. The slide show is shown in the panel.', annexe: 'hidden',
    tools: 'Audience screen and pen', black: 'Black screen for the audience (B)', white: 'White screen for the audience (W)', pen: 'Pen: draw on the slide (D)', erase: 'Erase the drawing (E)',
    blackTip: 'The audience sees only black; your console stays visible. B, a click in the window or a slide change removes the black screen.',
    whiteTip: 'The audience sees only white; your console stays visible. W, a click in the window or a slide change removes the white screen.',
    penTip: 'Draw in red on the current slide: the stroke appears in the same place for the audience. Changing slides erases it; Esc puts the pen down.',
    eraseTip: 'Erases everything drawn with the pen on the current slide, for you and for the audience. Grayed out when there is nothing to erase.',
    hintBlack: 'Black screen for the audience: B to go back.', hintWhite: 'White screen for the audience: W to go back.', hintPen: 'Pen: draw here. E erases, Esc stops.',
  },
};

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
  const inPage = async (c) => { if (!c) return c; const o = await offset(); return { x: c.x + o.x, y: c.y + o.y }; };
  const centerOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, settle = 250) => {
    const c = await inPage(await centerOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(settle);
  };
  const wheel = async (selector, dy, settle = 450) => {
    const c = await inPage(await centerOf(selector, 0));
    if (!c) throw new Error('introuvable : ' + selector);
    await reach(c);
    await page.mouse.wheel(0, dy);
    await sleep(settle);
  };
  // Pose le pointeur sur l'élément et rend l'instant où il y arrive (la bulle d'un outil se compte à partir de là).
  const hover = async (selector, index = 0) => {
    const c = await inPage(await centerOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    const at = Date.now();
    await page.mouse.move(c.x - 10, c.y);
    await page.mouse.move(c.x, c.y, { steps: 2 });
    return at;
  };
  const triple = async (selector, settle = 250) => {
    const c = await inPage(await centerOf(selector, 0));
    if (!c) throw new Error('introuvable : ' + selector);
    await reach(c);
    await page.mouse.click(c.x, c.y, { clickCount: 3 });
    await sleep(settle);
  };
  return { click, wheel, triple, hover, offset, app };
}

// Ce que la fenêtre du diaporama montre : le compteur, le texte que la page laisse voir, la ligne d'information, le plein écran, la taille et la barre d'adresse (une vraie fenêtre n'en a pas).
const CLOSED = { show: false, counter: '', visible: '', note: null, ended: false, fullscreen: false, size: { width: 0, height: 0 }, bar: null, closed: true };
const showOf = target => target.evaluate(() => {
  const show = document.querySelector('.pp-slide-show');
  const host = document.getElementById('pp-slide-show-stage');
  const scope = host && host.shadowRoot ? host.shadowRoot.querySelector('.pp-print-scope') : null;
  const layer = scope ? scope.querySelector(':scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)') : null;
  const view = layer && layer.firstElementChild ? layer.firstElementChild.firstElementChild : null;
  let visible = '';
  if (view) {
    const box = view.getBoundingClientRect();
    const inBox = r => r.width > 0 && r.bottom > box.top + 1 && r.top < box.bottom - 1 && r.right > box.left + 1 && r.left < box.right - 1;
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const parts = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/\S/.test(n.nodeValue) || n.parentElement.closest('style, .v2-page-seam-divider')) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.visibility === 'hidden' || /^transparent$|^rgba\(.*,\s*0\)$/.test(cs.color)) continue;
      range.selectNodeContents(n);
      if (Array.from(range.getClientRects()).some(inBox)) parts.push(n.nodeValue.trim());
    }
    visible = parts.join(' ');
  }
  const note = show && show.querySelector('.pp-slide-show-note');
  const end = show && show.querySelector('.pp-slide-show-end');
  return {
    show: !!show, counter: (show && show.querySelector('.pp-slide-show-counter') || {}).textContent || '', visible, note: note && !note.hidden ? note.textContent : null, ended: !!end && !end.hidden,
    fullscreen: !!document.fullscreenElement, size: { width: innerWidth, height: innerHeight }, bar: window.locationbar ? window.locationbar.visible : null,
  };
}).catch(() => CLOSED);

// Un aperçu de la console (`current` ou `upcoming`) : le cadre de la page, le texte qu'il laisse voir, et si la page y est cachée.
const previewOf = (app, which) => app.evaluate((name) => {
  const box = document.querySelector('.pp-speaker-' + name);
  const host = box && box.querySelector('.pp-print-host');
  const scope = host && host.shadowRoot ? host.shadowRoot.querySelector('.pp-print-scope') : null;
  const layer = scope ? scope.querySelector(':scope > .pp-slide-show-layer') : null;
  const frame = layer ? layer.firstElementChild : null;
  const view = frame ? frame.firstElementChild : null;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  let text = '';
  if (view) {
    const area = view.getBoundingClientRect();
    const inArea = r => r.width > 0 && r.bottom > area.top + 1 && r.top < area.bottom - 1 && r.right > area.left + 1 && r.left < area.right - 1;
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const parts = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/\S/.test(n.nodeValue) || n.parentElement.closest('style, .v2-page-seam-divider')) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.visibility === 'hidden' || /^transparent$|^rgba\(.*,\s*0\)$/.test(cs.color)) continue;
      range.selectNodeContents(n);
      if (Array.from(range.getClientRects()).some(inArea)) parts.push(n.nodeValue.trim());
    }
    text = parts.join(' ');
  }
  const images = view ? Array.from(view.querySelectorAll('img')).filter(img => { const r = img.getBoundingClientRect(); const area = view.getBoundingClientRect(); return r.width > 0 && r.bottom > area.top && r.top < area.bottom; }).length : 0;
  return { box: rect(box), frame: rect(frame), text, images, hidden: frame ? getComputedStyle(frame).visibility === 'hidden' : null, outline: frame ? getComputedStyle(frame).outlineStyle : '', ring: box ? getComputedStyle(box).getPropertyValue('--pp-ring').trim() : '' };
}, which);

// Ce que la console montre.
const consoleOf = app => app.evaluate(() => {
  const q = s => document.querySelector(s);
  const root = q('.pp-speaker');
  if (!root) return { present: false };
  const r = root.getBoundingClientRect();
  const rectOf = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const active = document.activeElement;
  return {
    present: true, role: root.getAttribute('role'), modal: root.getAttribute('aria-modal'), name: root.getAttribute('aria-label'),
    counter: q('.pp-speaker-count').textContent, hint: q('.pp-speaker-hint').textContent, hintClick: q('.pp-speaker-hint').classList.contains('pp-speaker-hint-click'),
    notes: q('.pp-speaker-notes').textContent, notesEmpty: q('.pp-speaker-notes').classList.contains('pp-speaker-notes-empty'), notesFont: getComputedStyle(q('.pp-speaker-notes')).fontSize,
    notesSpace: getComputedStyle(q('.pp-speaker-notes')).whiteSpace, timer: q('.pp-speaker-timer').textContent, clock: q('.pp-speaker-clock').textContent,
    ready: q('.pp-speaker-status').hidden, endCard: !q('.pp-speaker-current > .pp-speaker-card').hidden, nextCard: !q('.pp-speaker-upcoming > .pp-speaker-card').hidden,
    prevOff: q('.pp-speaker-prev').getAttribute('aria-disabled') === 'true', pauseTip: q('.pp-speaker-pause').title, smallerOff: q('.pp-speaker-size').getAttribute('aria-disabled') === 'true',
    largerOff: q('.pp-speaker-size:last-of-type').getAttribute('aria-disabled') === 'true',
    rect: { x: r.left, y: r.top, width: r.width, height: r.height }, head: rectOf(q('.pp-speaker-head')), body: rectOf(q('.pp-speaker-body')), notesRect: rectOf(q('.pp-speaker-notes')),
    overflowX: root.scrollWidth - root.clientWidth, show: !!q('.pp-slide-show'),
    headChildren: Array.from(q('.pp-speaker-head').children).filter(c => c.getClientRects().length).map(c => rectOf(c)),
    inside: !!active && root.contains(active), activeTag: active ? active.tagName : '', notesFocused: active === q('.pp-speaker-notes'), notesTop: q('.pp-speaker-notes').scrollTop,
    notesScrollable: q('.pp-speaker-notes').scrollHeight > q('.pp-speaker-notes').clientHeight,
  };
});

const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);
const saves = app => app.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
const open = async (tab, id, slides) => {
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, count]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === count;
  }, [id, slides], { timeout: 15000 }).catch(() => {});
  await sleep(800);
};
// Le curseur dans la diapositive n (de 0) de la bande : à 700x400 elle ne montre que trois ou quatre miniatures (les autres passent sous la barre d'outils de l'éditeur, qui prendrait le clic) ; elle est défilée en haut d'abord, comme les autres essais de la bande.
async function cursorIn(a, n) {
  await a.app.evaluate(() => { document.querySelector('.pp-slide-list').scrollTop = 0; });
  await sleep(150);
  await a.click('.pp-slide-strip .pp-slide-item', n, 500);
  await a.click('.pp-slide-strip .pp-slide-item', n, 500);
}
// La couleur d'un pixel d'une capture.
async function colorAt(page, buffer, x, y) {
  return page.evaluate(async ([data64, px, py]) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(data64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [buffer.toString('base64'), x, y]);
}
const rgbOf = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim()); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null; };
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const seconds = text => { const p = text.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, popups: true, bypassCSP: false });
  const { page, app, context } = A;
  const a = toolsOf(A);
  const popErrors = [];
  context.on('page', p => p.on('pageerror', e => popErrors.push(String(e.message).slice(0, 200))));
  await open(A, 7, 6);
  await cursorIn(a, 1);
  const htmlBefore = await app.evaluate(() => Editor.getHTML());
  const savesBefore = await saves(app);

  // --- LE MENU
  await a.click('.pp-slide-show-more', 0, 250);
  const menu = await app.evaluate(() => {
    const b = document.querySelector('.pp-show-menu [data-action="speaker"]');
    const m = document.querySelector('.pp-show-menu').getBoundingClientRect();
    const note = b.querySelector('.pp-show-menu-note');
    return {
      role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), name: b.querySelector('.pp-show-menu-name').textContent, note: note.textContent, noteShown: !note.hidden && note.getClientRects().length > 0,
      described: (document.getElementById(b.getAttribute('aria-describedby')) || {}).textContent, items: document.querySelectorAll('.pp-show-menu [data-action]').length,
      inside: m.top >= 0 && m.bottom <= innerHeight && m.left >= 0 && m.right <= innerWidth, more: document.querySelector('.pp-slide-show-more').title,
    };
  });
  check(tag + 'le menu ▾ a la ligne « ' + T.menu + ' » : une case à cocher (menuitemcheckbox), décochée au départ, avec sa note lisible (aria-describedby), le menu entier dans le panneau', menu.role === 'menuitemcheckbox' && menu.checked === 'false'
    && menu.name === T.menu && menu.note === T.menuNote && menu.noteShown && menu.described === T.menuNote && menu.items === 4 && menu.inside, menu);
  check(tag + 'l’info-bulle de ▾ dit aussi la vue intervenant', menu.more === T.more, menu.more);
  // Au clavier : Entrée sur ▾ ouvre le menu, Fin va à la dernière ligne, Espace la coche (le menu se referme et rend le clavier à ▾) ; à la souris, le menu la garde cochée.
  await a.click('.pp-slide-show-more', 0, 250);
  await app.evaluate(() => document.querySelector('.pp-slide-show-more').focus());
  await page.keyboard.press('Enter');
  await sleep(250);
  await page.keyboard.press('End');
  await sleep(150);
  const onLast = await app.evaluate(() => document.activeElement.getAttribute('data-action'));
  await page.keyboard.press(' ');
  await sleep(250);
  const afterSpace = await app.evaluate(() => ({ open: document.querySelector('.pp-show-menu').classList.contains('visible'), onMore: document.activeElement.classList.contains('pp-slide-show-more') }));
  await a.click('.pp-slide-show-more', 0, 250);
  const checkedByKey = await app.evaluate(() => document.querySelector('.pp-show-menu [data-action="speaker"]').getAttribute('aria-checked'));
  check(tag + 'au clavier, Entrée sur ▾ puis Fin atteignent la ligne « ' + T.menu + ' », Espace la coche, referme le menu et rend le clavier à ▾ ; la case reste cochée à la réouverture',
    onLast === 'speaker' && !afterSpace.open && afterSpace.onMore && checkedByKey === 'true', { onLast, afterSpace, checkedByKey });
  await a.click('.pp-show-menu [data-action="speaker"]', 0, 250);
  await a.click('.pp-slide-show-more', 0, 250);
  const uncheckedByMouse = await app.evaluate(() => document.querySelector('.pp-show-menu [data-action="speaker"]').getAttribute('aria-checked'));
  await a.click('.pp-show-menu [data-action="speaker"]', 0, 250);
  check(tag + 'à la souris la case se décoche, puis se coche (la dernière fois : cochée pour la suite)', uncheckedByMouse === 'false', uncheckedByMouse);
  // Le curseur revient dans le texte de la diapositive 2 (le clavier y est), et on y pose une sonde : à la sortie du diaporama le clavier doit y revenir.
  await cursorIn(a, 1);
  await app.evaluate(() => { document.activeElement.setAttribute('data-pp-probe', '1'); });
  const cursorBefore = await app.evaluate(() => ({ from: EditorCore.getEditor().state.selection.from, slide: SlideStrip.current() }));

  // --- LE DÉPART
  const masks0 = (await gfsCalls(page, 'barre.masquer')).length;
  async function launch() {
    const caught = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    await a.click('.pp-slide-show-open', 0, 150);
    const popup = await caught;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 25000 }).catch(() => {});
    }
    await app.waitForFunction(() => { const s = document.querySelector('.pp-speaker-status'); return !!s && s.hidden; }, null, { timeout: 25000 }).catch(() => {});
    await until(async () => (await consoleOf(app)).counter, 5000);
    return popup;
  }
  // La console et la fenêtre d'accord : le même numéro (chaque diapositive tient sur une page).
  const agree = async (popup, ms = 4000) => until(async () => { const c = await consoleOf(app); const w = await showOf(popup); return c.present && c.counter === w.counter && c.counter !== ''; }, ms);
  const popup = await launch();
  check(tag + 'le ▶ ouvre UNE fenêtre (le navigateur n’en accorde pas deux au même geste)', !!popup && context.pages().length === 2, { pages: context.pages().length });
  if (!popup) { await context.close(); return; }
  await agree(popup);
  let w = await showOf(popup);
  let c = await consoleOf(app);
  check(tag + 'c’est une vraie fenêtre (sans barre d’adresse, aux dimensions de la console), non un onglet qui cacherait le panneau', w.bar === false && w.size.width === 1024 && w.size.height === 600, w.size);
  check(tag + 'la console est le panneau : une fenêtre modale nommée « ' + T.label + ' », qui le remplit ; rien du diaporama dedans ; GFS masque sa barre', c.present && c.role === 'dialog' && c.modal === 'true' && c.name === T.label
    && near(c.rect.width, 700, 1) && near(c.rect.height, 400, 1) && !c.show && (await gfsCalls(page, 'barre.masquer')).length === masks0 + 1, { c: { role: c.role, name: c.name, rect: c.rect, show: c.show }, masks: (await gfsCalls(page, 'barre.masquer')).length, before: masks0 });
  check(tag + 'la fenêtre joue le diaporama à la diapositive du curseur (2 / 6), avec « ' + T.hint + ' » ; la console dit 2 / 6', w.show && w.counter === '2 / 6' && w.visible === 'Le constat Trois sites, deux outils' && w.note === T.hint && c.counter === '2 / 6', { w, counter: c.counter });
  const cur = await previewOf(app, 'current');
  const nxt = await previewOf(app, 'upcoming');
  check(tag + 'l’aperçu de la diapositive en cours montre la page entière (16:9), au centre, avec son texte ; celui de la suivante montre la 4 - la 3, masquée, est sautée comme au diaporama',
    cur.text === 'Le constat Trois sites, deux outils' && near(cur.frame.width / cur.frame.height, 16 / 9, 0.03) && nxt.text === 'Texte seul sans titre' && near(nxt.frame.width / nxt.frame.height, 16 / 9, 0.03), { cur: cur.text, nxt: nxt.text, curFrame: cur.frame, nxtFrame: nxt.frame });
  check(tag + 'sous « ' + T.current + ' » et « ' + T.upcoming + ' », la consigne dit ce que fera le prochain clic (« ' + T.hintSlide + ' ») et les notes de la diapositive sont là', c.hint === T.hintSlide && !c.hintClick && c.notes === 'Le constat en trois points.' && !c.notesEmpty, { hint: c.hint, notes: c.notes });
  const labelsShown = await app.evaluate(() => Array.from(document.querySelectorAll('.pp-speaker-label > span:first-child, .pp-speaker-label:not(:has(span))')).map(n => n.textContent.toUpperCase()));
  check(tag + 'les deux intitulés (« ' + T.current + ' », « ' + T.upcoming + ' ») et celui des notes sont dans la langue de la page', labelsShown.indexOf(T.current) !== -1 && labelsShown.indexOf(T.upcoming) !== -1, labelsShown);
  // Les notes ne quittent jamais l'app : la fenêtre n'en a ni le texte ni l'attribut.
  const leaked = await popup.evaluate((needles) => {
    const parts = [];
    const collect = (root) => { parts.push(root.innerHTML || ''); root.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) collect(n.shadowRoot); }); };
    collect(document.documentElement);
    const dump = parts.join('\n');
    return needles.filter(n => dump.indexOf(n) !== -1);
  }, ['Le constat en trois points', 'Accueillir', 'Point 12', 'data-notes']);
  check(tag + 'les notes ne partent pas vers la fenêtre du diaporama (ni leur texte, ni l’attribut des repères) : le public ne les voit pas, même en partageant la fenêtre', leaked.length === 0, leaked);
  // L'anneau de la diapositive en cours (trait d'accent autour de la page, à la taille de l'écran) : un pixel juste à gauche de la page a la couleur de `--pp-ring`.
  const shot = await page.screenshot({ type: 'png' });
  const off = await a.offset();
  const want = rgbOf(cur.ring);
  const px = [await colorAt(page, shot, off.x + cur.frame.left - 1, off.y + (cur.frame.top + cur.frame.bottom) / 2), await colorAt(page, shot, off.x + cur.frame.left - 2, off.y + (cur.frame.top + cur.frame.bottom) / 2)];
  const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
  check(tag + 'la diapositive en cours a son anneau d’accent, la suivante un filet : les cadres ont un trait, à la couleur du jeton, à la taille de l’écran (non réduite avec la page)', cur.outline === 'solid' && nxt.outline === 'solid' && !!want && Math.min(dist(px[0], want), dist(px[1], want)) < 40, { ring: cur.ring, px, outline: cur.outline });

  // --- À 700x400 : tout tient, rien ne déborde.
  const head = c.head;
  const headTight = c.headChildren.every(r => r.left >= -0.5 && r.right <= 700.5 && r.top >= -0.5 && r.bottom <= head.bottom + 0.5)
    && c.headChildren.every((r, i) => i === 0 || r.left >= c.headChildren[i - 1].right - 0.5);
  check(tag + 'à 700x400 l’en-tête tient sur une ligne (précédente, numéro, suivante, « ' + T.goTo + ' », chrono, heure, quitter), sans recouvrement, et le corps le suit', headTight && head.height <= 44 && c.body.top >= head.bottom - 0.5 && c.overflowX <= 1, { head, body: c.body, overflowX: c.overflowX });
  check(tag + 'les deux aperçus sont assez grands pour se lire (en cours : 240 px de large au moins ; suivante : 150) et les notes occupent la moitié droite', cur.frame.width >= 240 && cur.frame.height >= 130 && nxt.frame.width >= 150 && c.notesRect.width >= 300 && c.notesRect.height >= 200 && c.notesRect.right <= 700.5 && c.notesRect.bottom <= 400.5, { cur: cur.frame, nxt: nxt.frame, notes: c.notesRect });
  const contrasts = {};
  for (const sel of ['.pp-speaker-count', '.pp-speaker-label', '.pp-speaker-hint', '.pp-speaker-clock', '.pp-speaker-timer', '.pp-speaker-goto', '.pp-speaker-notes', '.pp-speaker-size']) contrasts[sel] = await contrastOf(app, sel);
  check(tag + 'tous les textes de la console se lisent (4,5:1 au moins) : numéro, intitulés, consigne, heure, chrono, « ' + T.goTo + ' », notes, A− A+', Object.values(contrasts).every(v => v >= 4.5), contrasts);

  // --- LES ORDRES : › ‹, la fenêtre et la console d'accord
  await a.click('.pp-speaker-forward', 0, 350);
  await agree(popup);
  w = await showOf(popup);
  c = await consoleOf(app);
  let pv = await previewOf(app, 'upcoming');
  check(tag + '› (vraie souris) : la fenêtre passe à la diapositive 4 - la masquée est sautée -, la console la suit (4 / 6), sans notes (« ' + T.noNotes + ' »), et montre la 5 (une image seule) à côté',
    w.counter === '4 / 6' && w.visible === 'Texte seul sans titre' && c.counter === '4 / 6' && c.notes === T.noNotes && c.notesEmpty && pv.text === '' && pv.images >= 1, { w: w.counter, c: c.counter, notes: c.notes, upcoming: pv });
  await a.click('.pp-speaker-prev', 0, 350);
  await agree(popup);
  c = await consoleOf(app);
  check(tag + '‹ revient à la 2 (la masquée est sautée dans ce sens aussi)', c.counter === '2 / 6' && (await showOf(popup)).counter === '2 / 6', c.counter);
  // Les touches du diaporama, dans la console.
  await page.keyboard.press('ArrowRight');
  await sleep(250);
  await agree(popup);
  const afterRight = (await consoleOf(app)).counter;
  await page.keyboard.press('ArrowLeft');
  await sleep(250);
  await agree(popup);
  const afterLeft = (await consoleOf(app)).counter;
  await page.keyboard.press('Home');
  await sleep(300);
  await agree(popup);
  w = await showOf(popup);
  c = await consoleOf(app);
  const cur1 = await previewOf(app, 'current');
  check(tag + '→ ← Début au clavier de la console pilotent la fenêtre (4, 2, 1) ; la diapositive 1 : notes sur plusieurs lignes gardées, consigne « animation 1 / 2 », « précédent » grisé',
    afterRight === '4 / 6' && afterLeft === '2 / 6' && w.counter === '1 / 6' && c.counter === '1 / 6' && c.notes === FIRST_NOTES && c.notesSpace === 'pre-wrap' && c.hint === T.hintClick(1, 2) && c.hintClick && c.prevOff,
    { afterRight, afterLeft, counter: c.counter, notes: c.notes, hint: c.hint, prevOff: c.prevOff });
  check(tag + 'les objets à clic ne sont pas encore là, ni dans la fenêtre ni dans l’aperçu (la diapositive en cours est montrée comme le public la voit)', w.visible === 'Mieux piloter Sous-titre un' && cur1.text === 'Mieux piloter Sous-titre un', { w: w.visible, cur: cur1.text });
  await a.click('.pp-speaker-forward', 0, 700);
  w = await showOf(popup);
  c = await consoleOf(app);
  let cur2 = await previewOf(app, 'current');
  check(tag + '› joue la première animation (Alpha) dans la fenêtre avant de passer à la suivante ; la console reste à 1 / 6, l’aperçu montre Alpha, la consigne passe à « animation 2 / 2 », « précédent » se dégrise',
    w.counter === '1 / 6' && /Alpha/.test(w.visible) && !/Bravo/.test(w.visible) && c.counter === '1 / 6' && /Alpha/.test(cur2.text) && !/Bravo/.test(cur2.text) && c.hint === T.hintClick(2, 2) && !c.prevOff, { w: w.visible, cur: cur2.text, hint: c.hint, prevOff: c.prevOff });
  await a.click('.pp-speaker-current', 0, 700);
  w = await showOf(popup);
  c = await consoleOf(app);
  cur2 = await previewOf(app, 'current');
  check(tag + 'un clic sur la diapositive en cours fait comme le diaporama : la deuxième animation (Bravo), puis la consigne dit « ' + T.hintSlide + ' »', /Bravo/.test(w.visible) && /Bravo/.test(cur2.text) && c.hint === T.hintSlide && !c.hintClick && c.counter === '1 / 6', { w: w.visible, cur: cur2.text, hint: c.hint });
  await a.click('.pp-speaker-prev', 0, 500);
  w = await showOf(popup);
  c = await consoleOf(app);
  cur2 = await previewOf(app, 'current');
  check(tag + '‹ défait la dernière animation (Bravo repart), sans changer de diapositive, dans la fenêtre comme dans l’aperçu', c.counter === '1 / 6' && !/Bravo/.test(w.visible) && /Alpha/.test(w.visible) && !/Bravo/.test(cur2.text) && c.hint === T.hintClick(2, 2), { w: w.visible, cur: cur2.text, hint: c.hint });
  await page.keyboard.press(' ');
  await sleep(500);
  await page.keyboard.press(' ');
  await sleep(500);
  await agree(popup);
  c = await consoleOf(app);
  check(tag + 'Espace : Bravo, puis la diapositive 2 (la fenêtre et la console d’accord)', c.counter === '2 / 6' && (await showOf(popup)).counter === '2 / 6', c.counter);
  // La molette : sur les aperçus un cran passe d'une diapositive à l'autre (les crans qui suivent de près sont ignorés).
  await page.keyboard.press('ArrowRight');
  await sleep(300);
  await a.wheel('.pp-speaker-current', 120);
  await agree(popup);
  const wheeled = (await consoleOf(app)).counter;
  await a.wheel('.pp-speaker-current', -120);
  await agree(popup);
  const wheeledBack = (await consoleOf(app)).counter;
  check(tag + 'la molette sur les aperçus : un cran vers le bas passe à la suivante (5), vers le haut revient (4)', wheeled === '5 / 6' && wheeledBack === '4 / 6', { wheeled, wheeledBack });

  // --- Les longues notes : elles défilent, à la molette et aux flèches quand elles ont le focus ; les flèches ailleurs changent de diapositive.
  await page.keyboard.press('End');
  await sleep(300);
  await agree(popup);
  c = await consoleOf(app);
  const before = c.notesTop;
  await a.wheel('.pp-speaker-notes', 200);
  const scrolled = await consoleOf(app);
  check(tag + 'Fin : la diapositive 6, ses 40 lignes de notes défilent à la molette sans changer de diapositive', c.counter === '6 / 6' && c.notesScrollable && scrolled.notesTop > before && scrolled.counter === '6 / 6', { counter: c.counter, before, after: scrolled.notesTop, scrollable: c.notesScrollable });
  await page.keyboard.press('Tab');
  let focusLoop = [];
  for (let i = 0; i < 14; i++) { const s = await consoleOf(app); focusLoop.push(s.inside); if (s.notesFocused) break; await page.keyboard.press('Tab'); }
  const atNotes = await consoleOf(app);
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  const arrowed = await consoleOf(app);
  check(tag + 'Tab mène aux notes (focus visible dans la console, jamais dehors) ; ↓ les fait défiler au lieu de changer de diapositive', atNotes.notesFocused && focusLoop.every(Boolean) && arrowed.notesTop > atNotes.notesTop && arrowed.counter === '6 / 6', { focusLoop, top: [atNotes.notesTop, arrowed.notesTop], counter: arrowed.counter });
  await page.keyboard.press('ArrowRight');
  await sleep(500);
  await agree(popup);
  w = await showOf(popup);
  c = await consoleOf(app);
  check(tag + '→ au focus des notes passe quand même à la suite : l’écran de fin, dans la fenêtre comme dans la console (carte « ' + T.end + ' », consigne « fin »), la suivante : « ' + T.end + ' »', w.ended && c.endCard && c.nextCard && c.hint === T.hintEnded && (await previewOf(app, 'upcoming')).hidden === true, { ended: w.ended, endCard: c.endCard, nextCard: c.nextCard, hint: c.hint });
  await page.keyboard.press('ArrowLeft');
  await sleep(500);
  await agree(popup);
  c = await consoleOf(app);
  check(tag + '← depuis la fin revient à la dernière diapositive (6 / 6) : les cartes de fin disparaissent, la page revient', c.counter === '6 / 6' && !c.endCard && !(await showOf(popup)).ended && (await previewOf(app, 'current')).text === 'Conclusion Merci', c.counter);

  // --- « ALLER À… »
  await a.click('.pp-speaker-goto', 0, 500);
  const list = await app.evaluate(() => {
    const panel = document.querySelector('.ss-panel:not([hidden])');
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2));
    return { rows: Array.from(panel.querySelectorAll('.ss-option')).map(o => o.textContent.trim()), above: !!hit && panel.contains(hit), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, placeholder: (panel.querySelector('input') || {}).placeholder, expanded: document.querySelector('.pp-speaker-goto').getAttribute('aria-expanded') };
  });
  check(tag + '« ' + T.goTo + ' » ouvre la liste des diapositives par leur titre (le premier titre, à défaut le premier texte, à défaut son numéro), la masquée marquée, devant la console et dans le panneau',
    !!list && list.rows.length === 6 && list.rows[0] === '1. Mieux piloter' && list.rows[1] === '2. Le constat' && list.rows[2].indexOf('3. Annexe masquée') === 0 && list.rows[2].indexOf(T.hiddenMark) !== -1 && list.rows[3] === '4. Texte seul sans titre'
    && list.rows[4] === '5. ' + T.untitled(5) && list.rows[5] === '6. Conclusion' && list.above && list.inside && list.placeholder === T.search && list.expanded === 'true', list);
  await page.keyboard.press('Escape');
  await sleep(300);
  c = await consoleOf(app);
  check(tag + 'Échap dans la liste ne ferme que la liste : la console et la fenêtre restent', c.present && !!(await showOf(popup)).show && !(await app.evaluate(() => !!document.querySelector('.ss-panel:not([hidden])'))) && (await app.evaluate(() => document.querySelector('.pp-speaker-goto').getAttribute('aria-expanded'))) === 'false', { present: c.present });
  await a.click('.pp-speaker-goto', 0, 400);
  await page.keyboard.type(T.annexe, { delay: 25 });
  await sleep(300);
  const filtered = await app.evaluate(() => Array.from(document.querySelectorAll('.ss-panel:not([hidden]) .ss-option')).map(o => o.textContent.trim()));
  await page.keyboard.type('zzzz', { delay: 20 });
  await sleep(250);
  const emptyList = await app.evaluate(() => (document.querySelector('.ss-panel:not([hidden]) .ss-empty') || {}).textContent || '');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await sleep(250);
  await page.keyboard.press('Enter');
  await sleep(600);
  await agree(popup);
  w = await showOf(popup);
  c = await consoleOf(app);
  check(tag + 'taper « ' + T.annexe + ' » ne garde que la diapositive 3 ; sans correspondance : « ' + T.empty + ' » ; Entrée saute à la 3 - masquée, atteinte quand même -, la fenêtre et la console la montrent, sans notes',
    filtered.length === 1 && filtered[0].indexOf('3. Annexe masquée') === 0 && emptyList === T.empty && w.counter === '3 / 6' && w.visible === 'Annexe masquée Cachée au public' && c.counter === '3 / 6' && c.notesEmpty, { filtered, emptyList, w: w.counter, c: c.counter });
  check(tag + 'après le choix le clavier revient à la console : → passe à la 4 (la liste est défaite)', await (async () => { await page.keyboard.press('ArrowRight'); await sleep(400); await agree(popup); return (await consoleOf(app)).counter === '4 / 6' && !(await app.evaluate(() => !!document.querySelector('#pp-speaker-goto-search'))); })(), '');

  // --- LE CHRONO ET L'HEURE
  c = await consoleOf(app);
  const t1 = seconds(c.timer);
  await sleep(1300);
  const t2 = seconds((await consoleOf(app)).timer);
  check(tag + 'le chrono a démarré avec le diaporama et avance à la seconde (mm:ss)', /^\d\d:\d\d$/.test(c.timer) && t1 >= 4 && t2 - t1 >= 1 && t2 - t1 <= 3, { first: c.timer, t1, t2 });
  const minute = await app.evaluate(l => new Date().toLocaleTimeString(l, { hour: '2-digit', minute: '2-digit' }), lang);
  check(tag + 'l’heure de la console est celle de l’appareil (hh:mm dans la langue de la page)', c.clock === minute || (await consoleOf(app)).clock === minute, { clock: c.clock, minute });
  await a.click('.pp-speaker-pause', 0, 200);
  const paused = await consoleOf(app);
  await sleep(1400);
  const stillPaused = await consoleOf(app);
  check(tag + 'la pause fige le chrono (le bouton propose « ' + T.resume + ' »)', paused.timer === stillPaused.timer && stillPaused.pauseTip === T.resume, { before: paused.timer, after: stillPaused.timer, tip: stillPaused.pauseTip });
  await a.click('.pp-speaker-pause', 0, 1300);
  const resumed = await consoleOf(app);
  check(tag + 'reprendre repart d’où il était (sans remise à zéro) et le bouton redevient « ' + T.pause + ' »', seconds(resumed.timer) >= seconds(paused.timer) + 1 && seconds(resumed.timer) <= seconds(paused.timer) + 3 && resumed.pauseTip === T.pause, { paused: paused.timer, resumed: resumed.timer, tip: resumed.pauseTip });
  await a.click('.pp-speaker-restart', 0, 120);
  const zero = await consoleOf(app);
  check(tag + '↺ remet le chrono à zéro tout de suite, il continue de courir', zero.timer === '00:00' && zero.pauseTip === T.pause, { timer: zero.timer });
  // --- Les notes : A− A+
  c = await consoleOf(app);
  await a.click('.pp-speaker-size:last-of-type', 0, 150);
  const bigger = (await consoleOf(app)).notesFont;
  for (let i = 0; i < 8; i++) await a.click('.pp-speaker-size:last-of-type', 0, 60);
  const biggest = await consoleOf(app);
  for (let i = 0; i < 12; i++) await a.click('.pp-speaker-size', 0, 60);
  const smallest = await consoleOf(app);
  check(tag + 'A+ et A− règlent la taille des notes (16 → 18 px, bornes 32 et 12 px), le bouton se grise à la borne', c.notesFont === '16px' && bigger === '18px' && biggest.notesFont === '32px' && biggest.largerOff && !biggest.smallerOff && smallest.notesFont === '12px' && smallest.smallerOff && !smallest.largerOff,
    { start: c.notesFont, bigger, biggest: biggest.notesFont, smallest: smallest.notesFont, off: [biggest.largerOff, smallest.smallerOff] });
  await a.click('.pp-speaker-size:last-of-type', 0, 100);
  await a.click('.pp-speaker-size:last-of-type', 0, 100);

  // --- LE CLAVIER : Tab circule dans la console, F5 ne recharge pas, un autre ▶ n'ouvre rien.
  await app.evaluate(() => document.querySelector('.pp-speaker').focus());
  const tabbed = [];
  for (let i = 0; i < 16; i++) { await page.keyboard.press('Tab'); tabbed.push((await consoleOf(app)).inside); }
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+Tab'); tabbed.push((await consoleOf(app)).inside); }
  check(tag + 'Tab et Maj+Tab font le tour de la console sans jamais en sortir (vingt appuis)', tabbed.every(Boolean), tabbed);
  const pagesBefore = context.pages().length;
  const marker = await app.evaluate(() => { window.__pp_alive = 1; return 1; });
  await app.evaluate(() => document.querySelector('.pp-speaker').focus());
  await page.keyboard.press('F5');
  await sleep(600);
  check(tag + 'F5 pendant la console ne recharge pas la page et n’ouvre pas une deuxième fenêtre', marker === 1 && (await app.evaluate(() => window.__pp_alive)) === 1 && context.pages().length === pagesBefore && (await consoleOf(app)).present, { pages: context.pages().length });
  // --- LA SÛRETÉ : un message qui n'est pas de la fenêtre, ou qui n'est pas un état, ne change rien.
  c = await consoleOf(app);
  await app.evaluate(() => { window.postMessage({ type: 'pp-present-state', state: { index: 0, count: 6, slide: 0, next: 1, prev: -1, clicks: 0, left: 0, ended: false, advancing: false } }, '*'); });
  await popup.evaluate(() => { window.opener.postMessage({ type: 'pp-present-state', state: { index: 'x', count: 6, slide: 0 } }, '*'); window.opener.postMessage({ type: 'pp-present-state', state: { index: 0, count: 0, slide: 0 } }, '*'); window.opener.postMessage({ type: 'pp-present-state', state: null }, '*'); });
  await sleep(400);
  const c2 = await consoleOf(app);
  check(tag + 'l’app ignore un état qui ne vient pas de sa fenêtre, ou qui n’en est pas un (texte, zéro page, rien) : la console garde son numéro', c2.counter === c.counter && c2.present, { before: c.counter, after: c2.counter });
  const wasAt = (await showOf(popup)).counter;
  await popup.evaluate(() => {
    const send = (data, source) => window.dispatchEvent(new MessageEvent('message', { data, source }));
    send({ type: 'pp-present-command', name: 'jump', index: 99999 }, window.opener);
    send({ type: 'pp-present-command', name: 'bogus', index: 0 }, window.opener);
    send({ type: 'pp-present-command', name: 'jump', index: 0 }, window);
    send({ type: 'pp-present-command', name: 'next' }, null);
  });
  await sleep(400);
  check(tag + 'la fenêtre ignore un ordre hors de la découpe, inconnu, ou qui ne vient pas de son ouvreur : elle reste où elle était', (await showOf(popup)).counter === wasAt, { was: wasAt, now: (await showOf(popup)).counter });

  // --- La fenêtre du diaporama est rechargée (F5 dedans) : la console reste ; la fenêtre redemande son rendu, rejoue le diaporama depuis son départ (la diapositive du curseur au lancement) et la console la suit.
  // Un message posté pendant qu'une page se décharge n'a plus de source sous Chromium (mesuré) et un autre navigateur peut lui en garder une : la page ne dit « au revoir » que de la fin du diaporama (le navigateur qui ferme la fenêtre est vu par le guet de l'app).
  await popup.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await popup.waitForFunction(() => { const n = document.querySelector('.pp-slide-show-counter'); return !!n && n.textContent !== ''; }, null, { timeout: 25000 }).catch(() => {});
  await agree(popup, 8000);
  w = await showOf(popup);
  c = await consoleOf(app);
  check(tag + 'la fenêtre rechargée (F5 dans la fenêtre) ne ferme pas la console : elle redemande son rendu, rejoue le diaporama depuis son départ (2 / 6) et la console la suit', !popup.isClosed() && c.present && w.counter === '2 / 6' && c.counter === '2 / 6' && c.ready,
    { closed: popup.isClosed(), present: c.present, popup: w.counter, console: c.counter, ready: c.ready });
  // --- SORTIR : Échap dans la console. L'intervenant a sélectionné ses notes (pour les copier) : la sélection du navigateur est dans la console, plus dans le texte ; à la sortie le curseur doit être où il était.
  await a.triple('.pp-speaker-notes');
  const picked = await app.evaluate(() => { const sel = getSelection(); return { text: sel.toString().length, inEditor: !!sel.anchorNode && EditorCore.getEditor().view.dom.contains(sel.anchorNode) }; });
  check(tag + 'un triple clic sélectionne les notes (elles se copient) : la sélection du navigateur est dans la console, hors du texte', picked.text > 0 && !picked.inEditor, picked);
  await app.evaluate(() => document.querySelector('.pp-speaker').focus());
  await page.keyboard.press('Escape');
  const closed = await until(() => popup.isClosed(), 4000);
  await sleep(400);
  c = await consoleOf(app);
  const bar = await gfsCalls(page, 'barre.masquer');
  check(tag + 'Échap dans la console ferme la fenêtre du diaporama et la console ; la barre de GFS revient, le clavier aussi où il était, le document n’a pas bougé, rien n’est enregistré',
    closed && !c.present && bar.length === masks0 + 2 && bar[bar.length - 1].masquee === false && (await app.evaluate(() => !!document.activeElement && document.activeElement.hasAttribute('data-pp-probe')))
    && (await app.evaluate(() => Editor.getHTML())) === htmlBefore && (await saves(app)) === savesBefore, { closed, present: c.present, bar, saves: [savesBefore, await saves(app)] });

  const cursorAfter = await app.evaluate(() => ({ from: EditorCore.getEditor().state.selection.from, slide: SlideStrip.current(), inEditor: EditorCore.getEditor().view.dom.contains(document.activeElement) }));
  check(tag + 'à la sortie le curseur est resté où il était (la diapositive 2, au même endroit du texte), le clavier est dans le texte : un clic ou une sélection faits dans la console ne le font pas partir au début du document',
    cursorAfter.from === cursorBefore.from && cursorAfter.slide === cursorBefore.slide && cursorAfter.slide === 1 && cursorAfter.inEditor, { before: cursorBefore, after: cursorAfter });
  // --- Le menu garde la case : ✕ (vraie souris) ferme la fenêtre aussi.
  let popup2 = await launch();
  await agree(popup2);
  const keptChecked = !!popup2 && (await consoleOf(app)).present;
  await a.click('.pp-speaker-exit', 0, 300);
  const closed2 = popup2 ? await until(() => popup2.isClosed(), 4000) : false;
  check(tag + 'la case reste cochée pour la page ouverte (la console revient d’un ▶) ; « ' + T.exit.replace(/ \(.*/, '') + ' » (✕, vraie souris) ferme la fenêtre et la console', keptChecked && closed2 && !(await consoleOf(app)).present, { keptChecked, closed2 });
  // La fenêtre se ferme d'elle-même (Échap dedans) : la console s'en va avec elle, la barre revient.
  popup2 = await launch();
  await agree(popup2);
  await popup2.keyboard.press('Escape').catch(() => {});
  const gone = await until(async () => !(await consoleOf(app)).present, 4000);
  const bar2 = await gfsCalls(page, 'barre.masquer');
  check(tag + 'Échap dans la fenêtre du diaporama : la console disparaît avec elle et la barre de GFS revient', gone && bar2.length === masks0 + 6 && bar2[bar2.length - 1].masquee === false, { gone, calls: bar2.length, before: masks0 });
  // Le navigateur ferme la fenêtre (la croix de sa barre de titre) : même chose, sans message de la page.
  popup2 = await launch();
  await agree(popup2);
  await popup2.close({ runBeforeUnload: false }).catch(() => {});
  const gone2 = await until(async () => !(await consoleOf(app)).present, 5000);
  check(tag + 'la fenêtre fermée par le navigateur : la console le voit (au plus une seconde) et se ferme, le panneau est rendu', gone2 && (await gfsCalls(page, 'barre.masquer')).length === masks0 + 8, { gone2 });

  // --- « Plein écran » décoché : la fenêtre se joue telle qu'elle est.
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  popup2 = await launch();
  await agree(popup2);
  const plain = await showOf(popup2);
  await popup2.mouse.click(300, 300);
  await sleep(500);
  const afterClick = await showOf(popup2);
  check(tag + '« Plein écran » décoché : la fenêtre n’invite pas au plein écran, et son premier clic passe à la suivante (au lieu de le demander) ; la console suit',
    plain.note === null && !afterClick.fullscreen && afterClick.counter !== plain.counter && (await consoleOf(app)).counter === afterClick.counter, { note: plain.note, from: plain.counter, to: afterClick.counter });
  await a.click('.pp-speaker-exit', 0, 300);
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);

  // --- Sans la case : ▶ ouvre la fenêtre comme avant (un onglet aux dimensions de la page, aucune console).
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="speaker"]', 0, 250);
  popup2 = await launch();
  const plainWindow = popup2 ? await showOf(popup2) : null;
  const noConsole = await consoleOf(app);
  check(tag + 'sans « ' + T.menu + ' », ▶ ouvre la fenêtre comme avant : pas de console, pas les dimensions de la console, le diaporama de la fenêtre seul (rien de plus dans le panneau)', !!plainWindow && plainWindow.show && !noConsole.present && plainWindow.size.width === 700 && !(await app.evaluate(() => !!document.querySelector('.pp-slide-show'))), { size: plainWindow && plainWindow.size, console: noConsole.present });
  // La fenêtre sans vue intervenant n'a ni écran noir ni stylo : B ne fait rien, aucun voile, aucun calque, et un ordre venu de l'ouvreur n'y change rien non plus.
  if (popup2 && plainWindow) {
    await popup2.keyboard.press('b');
    await popup2.keyboard.press('w');
    await popup2.evaluate(() => {
      const send = (data) => window.dispatchEvent(new MessageEvent('message', { data, source: window.opener }));
      send({ type: 'pp-present-command', name: 'screen', index: 1 });
      send({ type: 'pp-present-command', name: 'ink', index: 1, points: [0.1, 0.1, 0.9, 0.9] });
    });
    await sleep(400);
    const bare = await popup2.evaluate(() => {
      const host = document.getElementById('pp-slide-show-stage');
      return { veil: !!document.querySelector('.pp-slide-show-screen'), ink: !!(host && host.shadowRoot && host.shadowRoot.querySelector('svg[data-pp-ink]')), counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent };
    });
    check(tag + 'la fenêtre sans « ' + T.menu + ' » n’a ni écran noir ni stylo : B et W ne font rien, ni voile ni calque dans la page, un ordre d’écran ou de trait de l’ouvreur n’y change rien', !bare.veil && !bare.ink && bare.counter === plainWindow.counter, { bare, before: plainWindow.counter });
  }
  if (popup2) { await popup2.keyboard.press('Escape').catch(() => {}); await until(() => popup2.isClosed(), 4000); }
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="speaker"]', 0, 250);

  if (full) {
    // --- SOIXANTE-DIX diapositives : la console reste fluide (trois copies du rendu : la fenêtre, la diapositive en cours, la suivante).
    await open(A, 8, 70);
    await cursorIn(a, 1);
    const t0 = Date.now();
    const big = await launch();
    const ready = Date.now() - t0;
    await agree(big, 20000);
    const steps = [];
    for (let i = 0; i < 8; i++) {
      const s0 = Date.now();
      const was = (await consoleOf(app)).counter;
      await a.click('.pp-speaker-forward', 0, 0);
      await until(async () => { const c3 = await consoleOf(app); const w3 = await showOf(big); return c3.counter !== was && c3.counter === w3.counter; }, 5000);
      steps.push(Date.now() - s0);
    }
    const worst = Math.max(...steps);
    console.log(`  info - 70 diapositives : console prête en ${ready} ms, › : ${steps.join(', ')} ms`);
    c = await consoleOf(app);
    check(tag + '70 diapositives : la console est prête en moins de 20 s et chaque › est suivi en moins de 1,5 s par la fenêtre et la console (mesures dans la ligne « info »)', ready < 20000 && worst < 1500 && c.counter === '10 / 70' && c.notes === 'Notes de la diapositive 10', { ready, steps, counter: c.counter });
    await a.click('.pp-speaker-exit', 0, 300);
  }
  check(tag + 'aucune erreur de page, ni dans l’app ni dans les fenêtres', popErrors.length === 0, popErrors);
  await context.close();
}

// Le navigateur refuse la fenêtre (`popups` faux : `window.open` rend null, comme un bloqueur) : le diaporama se joue dans le panneau, avec la ligne qui le dit, sans console.
async function blocked(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, popups: false, bypassCSP: false });
  const { page, app, context } = A;
  const a = toolsOf(A);
  await open(A, 7, 6);
  await cursorIn(a, 1);
  const masks0 = (await gfsCalls(page, 'barre.masquer')).length;
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="speaker"]', 0, 250);
  await a.click('.pp-slide-show-open', 0, 600);
  await app.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 25000 }).catch(() => {});
  const seen = await app.evaluate(() => { const note = document.querySelector('.pp-slide-show-note'); return { show: !!document.querySelector('.pp-slide-show'), speaker: !!document.querySelector('.pp-speaker'), note: note && !note.hidden ? note.textContent : null, counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent }; });
  check(tag + 'la fenêtre refusée par le navigateur : le diaporama se joue dans le panneau (2 / 6) avec la ligne « ' + T.blocked.slice(0, 40) + '… », sans console', seen.show && !seen.speaker && seen.note === T.blocked && seen.counter === '2 / 6', seen);
  // Le diaporama du panneau n'a ni écran noir ni stylo non plus.
  await page.keyboard.press('b');
  await sleep(300);
  const panelBare = await app.evaluate(() => ({ veil: !!document.querySelector('.pp-slide-show-screen'), counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent }));
  check(tag + 'le diaporama du panneau n’a pas d’écran noir : B ne fait rien (aucun voile, toujours 2 / 6)', !panelBare.veil && panelBare.counter === '2 / 6', panelBare);
  await page.keyboard.press('Escape');
  await sleep(500);
  const after = await app.evaluate(() => ({ show: !!document.querySelector('.pp-slide-show'), speaker: !!document.querySelector('.pp-speaker') }));
  check(tag + 'Échap le ferme, la barre de GFS revient', !after.show && !after.speaker && (await gfsCalls(page, 'barre.masquer')).length === masks0 + 2, after);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// L'ÉCRAN NOIR, L'ÉCRAN BLANC ET LE STYLO (demande du 04/11)

// Les outils de la console, tels qu'elle les montre : les quatre boutons (enfoncés ou non), la phrase d'aide, le curseur de la diapositive en cours, l'état de la fenêtre qu'elle a reçu et les traits de sa copie.
const deskOf = app => app.evaluate(() => {
  const q = s => document.querySelector(s);
  const rectOf = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const button = (sel) => { const b = q(sel); const d = b && b.getAttribute('aria-describedby'); const note = d ? document.getElementById(d) : null; return b ? { pressed: b.getAttribute('aria-pressed'), disabled: b.getAttribute('aria-disabled'), label: b.getAttribute('aria-label'), title: b.title, hasTitle: b.hasAttribute('title'), detail: note ? note.textContent : null, rect: rectOf(b), icon: !!b.querySelector('svg') } : null; };
  const group = q('.pp-speaker-tools');
  const hint = q('.pp-speaker-hint');
  const speaker = SlideShow.speaker();
  const state = speaker ? speaker.state() : null;
  const active = document.activeElement;
  return {
    black: button('.pp-speaker-black'), white: button('.pp-speaker-white'), pen: button('.pp-speaker-pen'), erase: button('.pp-speaker-erase'),
    group: group ? { role: group.getAttribute('role'), label: group.getAttribute('aria-label'), rect: rectOf(group) } : null,
    hint: hint.textContent, hintScreen: hint.classList.contains('pp-speaker-hint-screen'), hintClick: hint.classList.contains('pp-speaker-hint-click'),
    inking: q('.pp-speaker-current').classList.contains('pp-speaker-inking'), cursor: getComputedStyle(q('.pp-speaker-current')).cursor, column: rectOf(q('.pp-speaker-previews')), head: rectOf(q('.pp-speaker-label')),
    screen: state ? state.screen : null, ink: speaker ? speaker.pen() : null, counter: q('.pp-speaker-count').textContent, focusOnButton: !!active && active.tagName === 'BUTTON' && active.classList.contains('pp-speaker-tool'),
  };
});

// La bulle des quatre outils (demande du 04/11 : le détail de ce que fait chaque bouton, au survol) : cachée ou non, ses deux lignes (nom, détail), leur place, le contraste réel de chacune sur le fond de la bulle (l'opacité de la ligne comptée : `contrastOf` ne la compte pas), ce qui la rend sans effet sur la souris, et combien il y en a dans la page.
const tipOf = app => app.evaluate(() => {
  const tip = document.querySelector('.pp-speaker-tip');
  // Pas de bulle du tout (l'ancien code) : un état « cachée » sans rôle ni place, que les contrôles refusent, plutôt qu'un essai qui s'arrête.
  if (!tip) return { hidden: true, missing: true, role: null, tips: 0, details: document.querySelectorAll('.pp-speaker-detail').length };
  const cs = getComputedStyle(tip);
  const rectOf = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const name = tip.querySelector('.pp-speaker-tip-name');
  const text = tip.querySelector('.pp-speaker-tip-text');
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lumin = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const background = parse(cs.backgroundColor);
  const contrast = (el) => {
    if (!el || !background) return null;
    const ecs = getComputedStyle(el);
    const fg = parse(ecs.color);
    const alpha = fg.a * parseFloat(ecs.opacity) * parseFloat(cs.opacity);
    const seen = { r: fg.r * alpha + background.r * (1 - alpha), g: fg.g * alpha + background.g * (1 - alpha), b: fg.b * alpha + background.b * (1 - alpha) };
    const a = lumin(seen), b = lumin(background);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  };
  const root = document.querySelector('.pp-speaker');
  return {
    hidden: tip.hidden || cs.display === 'none' || cs.visibility === 'hidden', role: tip.getAttribute('role'), position: cs.position, pointer: cs.pointerEvents, opaque: !!background && background.a === 1,
    z: Number(cs.zIndex), rootZ: root ? Number(getComputedStyle(root).zIndex) : null, inRoot: !!root && root.contains(tip),
    name: name ? name.textContent : null, text: text ? text.textContent : null, nameWeight: name ? Number(getComputedStyle(name).fontWeight) : 0,
    rect: rectOf(tip), nameRect: rectOf(name), textRect: rectOf(text), nameContrast: contrast(name), textContrast: contrast(text),
    view: { width: innerWidth, height: innerHeight },
    tips: document.querySelectorAll('.pp-speaker-tip').length, details: document.querySelectorAll('.pp-speaker-detail').length,
  };
});

// Ce que la fenêtre du diaporama montre de l'écran et du tracé : le voile (couleur, couvre-t-il tout), la feuille de la page, les traits de son calque (leurs points, en part de la page) et ceux des copies de rechange des effets.
const veilOf = popup => popup.evaluate(() => {
  const veil = document.querySelector('.pp-slide-show-screen');
  const host = document.getElementById('pp-slide-show-stage');
  const scope = host && host.shadowRoot ? host.shadowRoot.querySelector('.pp-print-scope') : null;
  const layer = scope ? scope.querySelector(':scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)') : null;
  const frame = layer ? layer.firstElementChild : null;
  const svg = frame ? frame.querySelector(':scope > svg[data-pp-ink]') : null;
  const fr = frame ? frame.getBoundingClientRect() : null;
  const vr = veil ? veil.getBoundingClientRect() : null;
  return {
    veil: !!veil, shown: !!veil && !veil.hidden && getComputedStyle(veil).display !== 'none', background: veil ? getComputedStyle(veil).backgroundColor : '', cursor: veil ? getComputedStyle(veil).cursor : '',
    covers: !!vr && vr.left <= 0 && vr.top <= 0 && vr.right >= innerWidth && vr.bottom >= innerHeight, counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent || '',
    frame: fr ? { left: fr.left, top: fr.top, width: fr.width, height: fr.height } : null, svg: !!svg, viewBox: svg ? svg.getAttribute('viewBox') : null,
    ink: svg ? { pointer: getComputedStyle(svg).pointerEvents, hidden: svg.getAttribute('aria-hidden') } : null,
    paths: svg ? Array.from(svg.querySelectorAll('path')).map(p => ({ d: p.getAttribute('d') })) : [],
    ghosts: scope ? Array.from(scope.querySelectorAll(':scope > .pp-slide-show-ghost')).map(g => ({ parked: g.classList.contains('pp-slide-show-parked'), inks: g.querySelectorAll('svg[data-pp-ink]').length, paths: g.querySelectorAll('svg[data-pp-ink] path').length })) : [],
    size: { width: innerWidth, height: innerHeight },
  };
}).catch(() => ({ veil: false, shown: false, paths: [], ghosts: [], frame: null }));

// Les points d'un trait du calque, en part de la page (le chemin `M x y L x y…` est en pixels de page, la boîte du calque dit leur taille).
function fractionsOf(path, viewBox) {
  const [, , w, h] = String(viewBox).split(' ').map(Number);
  const nums = (path.d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i] / w, nums[i + 1] / h]);
  return points;
}
// Un trait à la vraie souris dans l'aperçu de la diapositive en cours : `points` sont des parts de la page (de 0 à 1).
async function stroke(a, page, frame, points, steps = 8) {
  const off = await a.offset();
  const at = ([fx, fy]) => ({ x: off.x + frame.left + fx * frame.width, y: off.y + frame.top + fy * frame.height });
  const first = at(points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of points.slice(1)) { const q = at(p); await page.mouse.move(q.x, q.y, { steps }); }
  await page.mouse.up();
  await sleep(250);
}
// Ce que fait une souris : la trajectoire idéale `shape(t)` (t de 0 à 1, en parts de la page) suivie à une vitesse qui varie (de 1,5 à 4,5 pixels d'écran par événement), UNE position par événement, en pixels d'écran
// ENTIERS - dans un aperçu de quelque 190 pixels, un pixel de la souris en vaut sept à dix de la page sur l'écran du public : c'est ce qui fait l'escalier d'un trait qu'on ne lisse pas. `origin` : le coin de la page à l'écran ;
// `size` : sa taille à l'écran.
function mousePositions(shape, size, origin) {
  const dense = Array.from({ length: 2001 }, (_, k) => { const [fx, fy] = shape(k / 2000); return [origin.x + fx * size.width, origin.y + fy * size.height]; });
  const along = [0];
  for (let k = 1; k < dense.length; k++) along.push(along[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
  const total = along[along.length - 1];
  const at = (s) => { let k = 1; while (k < along.length - 1 && along[k] < s) k++; const u = (s - along[k - 1]) / ((along[k] - along[k - 1]) || 1); return [dense[k - 1][0] + (dense[k][0] - dense[k - 1][0]) * u, dense[k - 1][1] + (dense[k][1] - dense[k - 1][1]) * u]; };
  const out = [];
  const push = ([x, y]) => { const q = [Math.round(x), Math.round(y)]; const last = out[out.length - 1]; if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q); };
  for (let s = 0; s < total; s += 1.5 + 3 * (0.5 + 0.5 * Math.sin(s / 45))) push(at(s));
  push(at(total));
  return out;
}
// Un trait fait de ces positions à la vraie souris dans l'aperçu de la diapositive en cours (pas d'interpolation : une position, un événement). Rend les positions, en pixels d'écran.
async function mouseStroke(a, page, frame, shape) {
  const off = await a.offset();
  const positions = mousePositions(shape, frame, { x: off.x + frame.left, y: off.y + frame.top });
  await page.mouse.move(positions[0][0], positions[0][1]);
  await page.mouse.down();
  for (const [x, y] of positions.slice(1)) await page.mouse.move(x, y);
  await page.mouse.up();
  await sleep(400);
  return positions;
}
// La rugosité d'un chemin, mesurée dans la page : on le parcourt de 2 pixels en 2 pixels (de la page) et on mesure de combien le cap change d'un pas au suivant. `rug` : l'écart type de ces changements, en degrés ;
// `maxTurn` : le plus grand. Une ligne brisée aux marches d'un aperçu de 190 pixels est à 4 ou 6 degrés et a des pics de 50 ; un trait lissé est sous 1 degré, ses pics sous 5 (une vraie courbe en a : un cercle de 100 pixels de rayon change de cap de 1,1 degré par pas).
const roughOf = (page, d) => page.evaluate((d) => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden';
  document.body.appendChild(svg);
  const length = path.getTotalLength();
  const first = path.getPointAtLength(0);
  const headings = [];
  let prev = first;
  for (let s = 2; s <= length; s += 2) { const q = path.getPointAtLength(s); headings.push(Math.atan2(q.y - prev.y, q.x - prev.x)); prev = q; }
  const last = path.getPointAtLength(length);
  const turns = [];
  for (let k = 1; k < headings.length; k++) { let u = headings[k] - headings[k - 1]; while (u > Math.PI) u -= 2 * Math.PI; while (u < -Math.PI) u += 2 * Math.PI; turns.push(u * 180 / Math.PI); }
  const mean = turns.reduce((x, y) => x + y, 0) / (turns.length || 1);
  const rug = Math.sqrt(turns.reduce((x, y) => x + (y - mean) ** 2, 0) / (turns.length || 1));
  const box = path.getBBox();
  svg.remove();
  return { length, rug, maxTurn: Math.max(0, ...turns.map(Math.abs)), first: { x: first.x, y: first.y }, last: { x: last.x, y: last.y }, box: { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height } };
}, d);
// La couleur la plus rouge dans une petite fenêtre autour d'un point d'une capture (un trait fin tombe entre deux pixels) : [r, g, b] et son « rouge » (r moins la moyenne de g et b).
async function reddest(page, shot, x, y, reach = 3) {
  let best = null;
  for (let dy = -reach; dy <= reach; dy++) {
    const px = await colorAt(page, shot, x, y + dy);
    const red = px[0] - (px[1] + px[2]) / 2;
    if (!best || red > best.red) best = { px, red };
  }
  return best;
}
function driver(A, a) {
  const { page, app } = A;
  async function launch() {
    const caught = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    await a.click('.pp-slide-show-open', 0, 150);
    const popup = await caught;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 25000 }).catch(() => {});
    }
    await app.waitForFunction(() => { const s = document.querySelector('.pp-speaker-status'); return !!s && s.hidden; }, null, { timeout: 25000 }).catch(() => {});
    await until(async () => (await consoleOf(app)).counter, 5000);
    return popup;
  }
  const agree = async (popup, ms = 4000) => until(async () => { const c = await consoleOf(app); const w = await showOf(popup); return c.present && c.counter === w.counter && c.counter !== ''; }, ms);
  return { launch, agree };
}

async function screensAndPen(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, popups: true, bypassCSP: false });
  const { page, app, context } = A;
  const a = toolsOf(A);
  const { launch, agree } = driver(A, a);
  const popErrors = [];
  context.on('page', p => p.on('pageerror', e => popErrors.push(String(e.message).slice(0, 200))));
  await open(A, 7, 6);
  await cursorIn(a, 1);
  // « Plein écran » décoché (la fenêtre se joue telle qu'elle est : 1024x600, ses clics et ses touches font ce qu'ils disent au lieu de demander le plein écran) et « Vue intervenant » cochée.
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="speaker"]', 0, 250);
  const htmlBefore = await app.evaluate(() => Editor.getHTML());
  const savesBefore = await saves(app);
  const popup = await launch();
  if (!popup) { check(tag + 'la fenêtre de la vue intervenant s’ouvre', false, 'aucune fenêtre'); await context.close(); return; }
  await agree(popup);
  const BLACK = [0, 0, 0];
  const WHITE = [255, 255, 255];
  const same = (px, rgb, tol = 3) => !!px && px.every((v, i) => Math.abs(v - rgb[i]) <= tol);
  // Trois points de la fenêtre : la bande noire au-dessus de la page (16:9 dans 1024x600), le papier au centre, et la barre du bas que la souris réveille.
  const probe = async () => {
    const shot = await popup.screenshot({ type: 'png' });
    return { shot, top: await colorAt(page, shot, 512, 3), middle: await colorAt(page, shot, 512, 300), bar: await colorAt(page, shot, 40, 573) };
  };
  const frameOf = async () => (await previewOf(app, 'current')).frame;
  let w = await showOf(popup);
  let desk = await deskOf(app);
  let veil = await veilOf(popup);
  const preview = await previewOf(app, 'current');
  check(tag + 'la fenêtre (« Plein écran » décoché) se joue telle qu’elle est, 1024x600, à la diapositive 2 / 6, sans voile ; la console dit 2 / 6',
    w.show && w.counter === '2 / 6' && w.note === null && w.size.width === 1024 && w.size.height === 600 && desk.counter === '2 / 6' && veil.veil && !veil.shown && veil.svg, { w: w.counter, size: w.size, note: w.note, veil: veil.veil, shown: veil.shown, svg: veil.svg });
  const names = { black: T.black, white: T.white, pen: T.pen, erase: T.erase };
  const details = { black: T.blackTip, white: T.whiteTip, pen: T.penTip, erase: T.eraseTip };
  check(tag + 'quatre outils au bord droit du titre « ' + T.current + ' », dans un groupe « ' + T.tools + ' », nommés dans la langue de la page (écran noir B, écran blanc W, stylo D, effacer E), chacun avec son icône, son nom pour nom accessible, son détail lu par `aria-describedby` et aucun `title` natif (il doublerait la bulle) ; aucun enfoncé, « effacer » grisé tant qu’il n’y a rien à effacer ; tous dans la colonne des aperçus, au-dessus de la diapositive',
    !!desk.group && desk.group.role === 'group' && desk.group.label === T.tools && ['black', 'white', 'pen', 'erase'].every(k => desk[k] && desk[k].label === names[k] && !desk[k].hasTitle && desk[k].detail === details[k] && desk[k].icon && desk[k].rect.height >= 22 && desk[k].rect.height <= 30
      && desk[k].rect.left >= desk.column.left - 0.5 && desk[k].rect.right <= desk.column.right + 0.5 && desk[k].rect.bottom <= preview.box.top + 1) && desk.group.rect.right >= desk.head.right - 8
    && desk.black.pressed === 'false' && desk.white.pressed === 'false' && desk.pen.pressed === 'false' && desk.erase.disabled === 'true' && desk.screen === 0 && !desk.inking, desk);
  const labelRow = await app.evaluate(() => { const row = document.querySelector('.pp-speaker-label'); const text = row.querySelector('.pp-speaker-label-text'); return { text: text.textContent, clipped: text.scrollWidth > text.clientWidth + 1 }; });
  check(tag + 'à 700x400 le titre « ' + T.current + ' » tient entier à côté des outils (rien de tronqué)', labelRow.text.toUpperCase() === T.current && !labelRow.clipped, labelRow);
  const contrast0 = { tool: await contrastOf(app, '.pp-speaker-black'), erase: await contrastOf(app, '.pp-speaker-erase') };
  check(tag + 'les icônes des outils se lisent sur leur fond (4,5:1 au moins)', contrast0.tool >= 4.5 && contrast0.erase >= 4.5, contrast0);

  // --- LA BULLE DES QUATRE OUTILS (demande du 04/11 : « en survol à la souris, le détail de ce que font ces boutons ») : rien au repos ; elle vient après un temps de survol (jamais à un simple passage), dit le nom puis ce que fait l'outil, tient dans la fenêtre sans rien déplacer ni prendre la souris, et part au moindre geste.
  const KEYS = ['black', 'white', 'pen', 'erase'];
  const calm = () => a.hover('.pp-speaker-label-text');
  const tipShown = () => until(async () => { const v = await tipOf(app); return v && !v.hidden ? v : null; }, 2500);
  const near = (p, q) => !!p && !!q && ['left', 'top', 'width', 'height'].every(f => Math.abs(p[f] - q[f]) <= 0.5);
  await calm();
  await sleep(450);
  const atRest = await tipOf(app);
  check(tag + 'au repos la bulle des outils est là mais cachée : une seule (`role="tooltip"`, fixe, opaque, au-dessus des cartes de la console, sans effet sur la souris, dans la console) et quatre détails cachés lus par `aria-describedby`',
    !!atRest && atRest.hidden && atRest.role === 'tooltip' && atRest.position === 'fixed' && atRest.pointer === 'none' && atRest.opaque && atRest.inRoot && atRest.z > 2 && atRest.tips === 1 && atRest.details === 4, atRest);
  const restDesk = await deskOf(app);
  const restPreviews = { current: (await previewOf(app, 'current')).frame, upcoming: (await previewOf(app, 'upcoming')).frame };
  const rounds = {};
  for (const key of KEYS) {
    // d'un outil au suivant, sans repasser par le vide : la bulle du précédent est partie, celle-ci se compte à partir de son arrivée
    const at = await a.hover('.pp-speaker-' + key);
    await sleep(60);
    const early = await tipOf(app);
    const earlyAge = Date.now() - at;
    const late = await tipShown();
    const lateAge = Date.now() - at;
    const deskNow = await deskOf(app);
    rounds[key] = { early: !!early && early.hidden, earlyAge, late, lateAge, group: deskNow.group.rect, current: (await previewOf(app, 'current')).frame, upcoming: (await previewOf(app, 'upcoming')).frame };
  }
  check(tag + 'à la vraie souris, la bulle de chaque outil ne vient pas tout de suite (rien à 0,1 s) mais après un temps de survol (0,35 s), d’un outil au suivant sans repasser par le vide : noir, blanc, stylo, effacer',
    KEYS.every(k => !!rounds[k].late && (rounds[k].earlyAge > 300 || rounds[k].early) && rounds[k].lateAge >= 300 && rounds[k].lateAge < 2500),
    KEYS.map(k => ({ k, early: rounds[k].early, earlyAge: rounds[k].earlyAge, lateAge: rounds[k].lateAge, shown: !!rounds[k].late })));
  check(tag + 'la bulle dit le nom de l’outil (en gras, avec sa touche) puis, dessous, ce qu’il fait, dans la langue de la page (« ' + T.penTip.slice(0, 24) + '… »)',
    KEYS.every(k => { const v = rounds[k].late; return !!v && v.name === names[k] && v.text === details[k] && v.nameWeight >= 600 && v.nameRect.height > 0 && v.textRect.height > 0 && v.nameRect.bottom <= v.textRect.top + 1; }),
    KEYS.map(k => ({ k, name: rounds[k].late && rounds[k].late.name, text: rounds[k].late && rounds[k].late.text, weight: rounds[k].late && rounds[k].late.nameWeight })));
  check(tag + 'elle tient dans la fenêtre à 700x400 (3 pixels de marge au moins), à côté du bouton survolé sans jamais le couvrir, sans prendre la souris, et se lit (4,5:1 au moins pour le nom comme pour le détail)',
    KEYS.every(k => {
      const v = rounds[k].late; const b = restDesk[k].rect;
      return !!v && v.rect.left >= 3 && v.rect.top >= 3 && v.rect.right <= v.view.width - 3 && v.rect.bottom <= v.view.height - 3 && v.rect.width <= 280.5
        && (v.rect.top - b.bottom >= 0 && v.rect.top - b.bottom <= 14 || b.top - v.rect.bottom >= 0 && b.top - v.rect.bottom <= 14) && v.pointer === 'none' && v.nameContrast >= 4.5 && v.textContrast >= 4.5;
    }),
    KEYS.map(k => ({ k, rect: rounds[k].late && rounds[k].late.rect, button: restDesk[k].rect, view: rounds[k].late && rounds[k].late.view, contrast: rounds[k].late && [rounds[k].late.nameContrast, rounds[k].late.textContrast] })));
  check(tag + 'la bulle ne déplace rien : pendant qu’elle est là, les deux aperçus et le groupe des outils gardent leur taille et leur place',
    KEYS.every(k => !!rounds[k].late && near(restPreviews.current, rounds[k].current) && near(restPreviews.upcoming, rounds[k].upcoming) && near(restDesk.group.rect, rounds[k].group)),
    KEYS.map(k => ({ k, current: rounds[k].current, rest: restPreviews.current, group: rounds[k].group })));
  await calm();
  await sleep(150);
  const leftOff = await tipOf(app);
  check(tag + 'le pointeur qui s’en va fait partir la bulle (qui était bien là)', leftOff.hidden && !!rounds.erase.late, { hidden: leftOff.hidden, wasShown: !!rounds.erase.late });
  // Posée près du bord droit par la bulle d'avant, elle garde sa largeur : mesurée là où la largeur disponible la serrerait, elle serait étroite et haute.
  await app.evaluate(() => { const tip = document.querySelector('.pp-speaker-tip'); if (tip) { tip.style.left = '640px'; tip.style.top = '300px'; } });
  await a.hover('.pp-speaker-pen');
  const squeezed = await tipShown();
  await calm();
  const penBox = restDesk.pen.rect;
  check(tag + 'une bulle laissée près du bord droit par la précédente se pose pourtant où il faut : sous le bouton du stylo, centrée sur lui, de sa largeur naturelle (mesurée là où la largeur disponible la serrerait, elle serait étroite et haute, donc posée au-dessus et de travers)',
    !!squeezed && squeezed.rect.width >= 200 && squeezed.rect.height <= 130 && squeezed.rect.top - penBox.bottom >= 0 && squeezed.rect.top - penBox.bottom <= 14 && Math.abs(squeezed.rect.left + squeezed.rect.width / 2 - (penBox.left + penBox.width / 2)) <= 2,
    { rect: squeezed && squeezed.rect, button: penBox });
  // Appuyer sur le bouton fait partir la bulle ; le clic fait ce qu'il disait ; elle ne revient pas tant que le pointeur reste dessus.
  await a.hover('.pp-speaker-black');
  const beforePress = await tipShown();
  await page.mouse.down();
  await sleep(80);
  const whilePressed = await tipOf(app);
  await page.mouse.up();
  await sleep(450);
  const afterPress = await tipOf(app);
  const blackOn = await deskOf(app);
  await sleep(600);
  const stayed = await tipOf(app);
  check(tag + 'appuyer sur un outil fait partir sa bulle, le clic fait ce qu’il dit (l’écran noir) et la bulle ne revient pas tant que le pointeur reste sur le bouton',
    !!beforePress && whilePressed.hidden && afterPress.hidden && blackOn.screen === 1 && blackOn.black.pressed === 'true' && stayed.hidden, { shown: !!beforePress, pressed: whilePressed.hidden, after: afterPress.hidden, screen: blackOn.screen, stayed: stayed.hidden });
  await a.click('.pp-speaker-black', 0, 450);
  const blackOff = await deskOf(app);
  await calm();
  check(tag + 'un second clic rend la diapositive (le bouton se relève, plus d’écran noir) : la bulle n’a rien changé au comportement des boutons', blackOff.screen === 0 && blackOff.black.pressed === 'false', { screen: blackOff.screen, pressed: blackOff.black.pressed });
  // Un simple passage sur les quatre outils (une fraction de seconde sur chacun) n'affiche rien, ni après coup.
  for (const key of KEYS) { await a.hover('.pp-speaker-' + key); await sleep(70); }
  await calm();
  await sleep(700);
  const swept = await tipOf(app);
  check(tag + 'un simple passage sur les quatre outils (moins d’un tiers de seconde sur chacun) n’affiche rien, ni après coup (alors qu’un survol posé l’affiche)', swept.hidden && !!rounds.black.late, { hidden: swept.hidden, wasShown: !!rounds.black.late });
  // Au clavier : Tab jusqu'au bouton noir, la bulle vient comme au survol ; une touche la ferme ; Tab vers le blanc et elle revient pour lui ; le focus qui s'en va la ferme.
  await app.evaluate(() => document.querySelector('.pp-speaker').focus());
  let tabs = 0;
  for (; tabs < 24; tabs++) {
    await page.keyboard.press('Tab');
    if (await app.evaluate(() => document.activeElement === document.querySelector('.pp-speaker-black'))) break;
  }
  const viaKey = await tipShown();
  await page.keyboard.press('Shift');
  await sleep(80);
  const afterKey = await tipOf(app);
  await page.keyboard.press('Tab');
  const viaKey2 = await tipShown();
  await app.evaluate(() => document.querySelector('.pp-speaker').focus());
  await sleep(80);
  const afterBlur = await tipOf(app);
  check(tag + 'au clavier la bulle vient aussi (Tab sur le bouton noir, puis sur le blanc), se ferme à la moindre touche et quand le focus s’en va',
    tabs < 24 && !!viaKey && viaKey.name === names.black && viaKey.text === details.black && afterKey.hidden && !!viaKey2 && viaKey2.name === names.white && viaKey2.text === details.white && afterBlur.hidden,
    { tabs, first: viaKey && viaKey.name, shut: afterKey.hidden, second: viaKey2 && viaKey2.name, blur: afterBlur.hidden });
  const swarm = await tipOf(app);
  check(tag + 'après tout cela il reste une seule bulle et quatre détails dans la console (rien ne s’empile)', swarm.tips === 1 && swarm.details === 4 && swarm.hidden, { tips: swarm.tips, details: swarm.details, hidden: swarm.hidden });

  // --- L'ÉCRAN NOIR : le bouton (vraie souris)
  const shown0 = await probe();
  check(tag + 'la diapositive montrée : une bande noire autour de la page, le papier au centre (repères des essais qui suivent)', same(shown0.top, BLACK) && same(shown0.middle, WHITE), { top: shown0.top, middle: shown0.middle });
  await a.click('.pp-speaker-black', 0, 450);
  await popup.mouse.move(120, 570);
  await sleep(350);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  let seen = await probe();
  const keptPreview = await previewOf(app, 'current');
  check(tag + 'le bouton noir couvre l’écran du public de noir : un voile qui couvre toute la fenêtre, noir, sans pointeur ; le noir est partout, même sous la barre du bas que la souris réveille ; la diapositive 2 / 6 reste là',
    veil.shown && veil.covers && veil.background === 'rgb(0, 0, 0)' && veil.cursor === 'none' && same(seen.top, BLACK) && same(seen.middle, BLACK) && same(seen.bar, BLACK) && veil.counter === '2 / 6', { veil: { shown: veil.shown, covers: veil.covers, bg: veil.background, cursor: veil.cursor, counter: veil.counter }, seen: [seen.top, seen.middle, seen.bar] });
  check(tag + 'la console, elle, reste affichée avec la diapositive en cours (« ' + 'Le constat Trois sites, deux outils' + ' ») sans changer de taille ; le bouton noir est enfoncé, pas le blanc ; la phrase passe en négatif (« ' + T.hintBlack + ' »), sur une ligne, lisible',
    desk.screen === 1 && desk.black.pressed === 'true' && desk.white.pressed === 'false' && desk.hint === T.hintBlack && desk.hintScreen && !desk.hintClick && keptPreview.text === 'Le constat Trois sites, deux outils' && keptPreview.hidden === false
    && Math.abs(keptPreview.frame.height - preview.frame.height) <= 1.5 && Math.abs(keptPreview.frame.width - preview.frame.width) <= 1.5
    && (await contrastOf(app, '.pp-speaker-hint')) >= 4.5 && (await contrastOf(app, '.pp-speaker-black')) >= 4.5, { desk: { screen: desk.screen, black: desk.black.pressed, hint: desk.hint, negative: desk.hintScreen }, text: keptPreview.text });
  // B (clavier de la console) rend la diapositive : le voile s'en va, le noir autour de la page revient, le bouton se relève.
  await page.keyboard.press('b');
  await sleep(450);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  seen = await probe();
  check(tag + 'B (clavier de la console) rend la diapositive : plus de voile, la bande noire et le papier sont revenus, le bouton se relève, la phrase redevient « ' + T.hintSlide + ' »',
    !veil.shown && same(seen.top, BLACK) && same(seen.middle, WHITE) && desk.screen === 0 && desk.black.pressed === 'false' && !desk.hintScreen && desk.hint === T.hintSlide && veil.counter === '2 / 6', { shown: veil.shown, top: seen.top, middle: seen.middle, desk: { screen: desk.screen, black: desk.black.pressed, hint: desk.hint } });
  // W : l'écran blanc.
  await page.keyboard.press('w');
  await sleep(450);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  seen = await probe();
  check(tag + 'W : l’écran blanc - le voile est blanc et couvre tout (la bande noire aussi), le bouton blanc est enfoncé, pas le noir, la phrase dit « ' + T.hintWhite + ' »',
    veil.shown && veil.covers && veil.background === 'rgb(255, 255, 255)' && same(seen.top, WHITE) && same(seen.middle, WHITE) && same(seen.bar, WHITE) && desk.screen === 2 && desk.white.pressed === 'true' && desk.black.pressed === 'false' && desk.hint === T.hintWhite && desk.hintScreen
    && (await contrastOf(app, '.pp-speaker-hint')) >= 4.5, { shown: veil.shown, bg: veil.background, seen: [seen.top, seen.middle, seen.bar], desk: { screen: desk.screen, white: desk.white.pressed, hint: desk.hint } });
  // B sur le blanc passe au noir d'un coup.
  await page.keyboard.press('b');
  await sleep(450);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  seen = await probe();
  check(tag + 'B pendant l’écran blanc passe directement au noir (un seul voile, noir), le bouton noir s’enfonce et le blanc se relève', veil.shown && veil.background === 'rgb(0, 0, 0)' && same(seen.middle, BLACK) && desk.screen === 1 && desk.black.pressed === 'true' && desk.white.pressed === 'false', { bg: veil.background, mid: seen.middle, screen: desk.screen });
  // Un clic dans la fenêtre, sur le voile, rend la diapositive sans passer à la suivante.
  await popup.mouse.click(500, 300);
  await sleep(450);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  check(tag + 'un clic sur l’écran noir, dans la fenêtre, rend la diapositive sans passer à la suivante (toujours 2 / 6) ; la console le sait', !veil.shown && veil.counter === '2 / 6' && desk.screen === 0 && desk.black.pressed === 'false' && desk.counter === '2 / 6', { shown: veil.shown, counter: veil.counter, screen: desk.screen });
  // Le clavier de la fenêtre.
  await popup.keyboard.press('B');
  await sleep(450);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  const fromPopup = { shown: veil.shown, screen: desk.screen, pressed: desk.black.pressed };
  await popup.keyboard.press('w');
  await sleep(450);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  const toWhite = { bg: veil.background, screen: desk.screen };
  await popup.keyboard.press('W');
  await sleep(450);
  veil = await veilOf(popup);
  check(tag + 'les touches B et W marchent aussi dans la fenêtre (majuscule ou minuscule) : noir, puis blanc, puis la diapositive ; la console suit chaque fois (bouton enfoncé)',
    fromPopup.shown && fromPopup.screen === 1 && fromPopup.pressed === 'true' && toWhite.bg === 'rgb(255, 255, 255)' && toWhite.screen === 2 && !veil.shown && (await deskOf(app)).screen === 0, { fromPopup, toWhite, shown: veil.shown });

  // --- Toute navigation rend la diapositive
  await page.keyboard.press('b');
  await sleep(350);
  await page.keyboard.press('ArrowRight');
  await sleep(500);
  await agree(popup);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  check(tag + '→ pendant l’écran noir passe à la suite (4 / 6) ET rend la diapositive : plus de voile, la console à jour', !veil.shown && veil.counter === '4 / 6' && desk.counter === '4 / 6' && desk.screen === 0 && desk.black.pressed === 'false', { shown: veil.shown, popup: veil.counter, console: desk.counter });
  await page.keyboard.press('w');
  await sleep(350);
  await a.click('.pp-speaker-prev', 0, 500);
  await agree(popup);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  check(tag + '‹ (vraie souris) pendant l’écran blanc revient à la 2 / 6 ET rend la diapositive', !veil.shown && veil.counter === '2 / 6' && desk.counter === '2 / 6' && desk.screen === 0 && desk.white.pressed === 'false', { shown: veil.shown, popup: veil.counter });
  // « Aller à… » et Début / Fin passent aussi par la même porte : Fin pendant l'écran noir.
  await page.keyboard.press('b');
  await sleep(350);
  await page.keyboard.press('End');
  await sleep(500);
  await agree(popup);
  veil = await veilOf(popup);
  check(tag + 'Fin pendant l’écran noir saute à la dernière diapositive (6 / 6) et rend la diapositive', !veil.shown && veil.counter === '6 / 6', { shown: veil.shown, counter: veil.counter });
  // On revient à la 2 / 6 : Début (la 1, qui a deux animations à clic), puis → trois fois (Alpha, Bravo, la diapositive 2).
  await page.keyboard.press('Home');
  await sleep(500);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(450); }
  await agree(popup);
  veil = await veilOf(popup);
  const backOn2 = veil.counter === '2 / 6';
  // Une touche gardée enfoncée ne répète pas l'ordre : un seul changement d'écran.
  await page.keyboard.down('b');
  await page.keyboard.down('b');
  await page.keyboard.down('b');
  await page.keyboard.up('b');
  await sleep(450);
  veil = await veilOf(popup);
  desk = await deskOf(app);
  check(tag + 'la touche B gardée enfoncée (répétition du clavier) ne change l’écran qu’une fois : noir, sans clignoter', backOn2 && veil.shown && desk.screen === 1, { backOn2, shown: veil.shown, screen: desk.screen });
  await page.keyboard.press('b');
  await sleep(450);

  // --- LE STYLO
  await a.click('.pp-speaker-pen', 0, 250);
  desk = await deskOf(app);
  const penPreview = await previewOf(app, 'current');
  check(tag + 'le bouton stylo s’enfonce, la diapositive en cours prend le curseur de dessin SANS changer de taille (la phrase « ' + T.hintPen + ' » tient sur une ligne : on ne dessine pas sur un aperçu qui bouge), et le clavier reste dans la console (le bouton ne prend pas le focus)',
    desk.pen.pressed === 'true' && desk.inking && desk.cursor === 'crosshair' && desk.hint === T.hintPen && !desk.hintClick && !desk.hintScreen && !desk.focusOnButton && desk.erase.disabled === 'true'
    && Math.abs(penPreview.frame.height - preview.frame.height) <= 1.5 && Math.abs(penPreview.frame.width - preview.frame.width) <= 1.5, { pen: desk.pen.pressed, inking: desk.inking, cursor: desk.cursor, hint: desk.hint, focusOnButton: desk.focusOnButton, before: preview.frame, after: penPreview.frame });
  const frame = await frameOf();
  const LINE = [[0.2, 0.5], [0.5, 0.5], [0.8, 0.5]];
  await stroke(a, page, frame, LINE);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  const off = await a.offset();
  const consoleShot = await page.screenshot({ type: 'png' });
  const popShot = await popup.screenshot({ type: 'png' });
  const popMid = await reddest(page, popShot, veil.frame.left + veil.frame.width * 0.5, veil.frame.top + veil.frame.height * 0.5, 4);
  const conMid = await reddest(page, consoleShot, off.x + frame.left + frame.width * 0.5, off.y + frame.top + frame.height * 0.5, 3);
  const popPoints = veil.paths.length === 1 ? fractionsOf(veil.paths[0], veil.viewBox) : [];
  const sameLine = popPoints.length >= 3 && Math.abs(popPoints[0][0] - 0.2) < 0.015 && Math.abs(popPoints[popPoints.length - 1][0] - 0.8) < 0.015 && popPoints.every(p => Math.abs(p[1] - 0.5) < 0.012);
  check(tag + 'un trait à la souris sur la diapositive en cours : la console en garde un (sur sa copie), la fenêtre en a UN, du même endroit de la page (de 20 % à 80 % de la largeur, à mi-hauteur) ; le calque ne prend aucun clic',
    desk.ink.strokes === 1 && veil.paths.length === 1 && sameLine && !!veil.ink && veil.ink.pointer === 'none' && veil.ink.hidden === 'true', { console: desk.ink, popPaths: veil.paths.length, first: popPoints[0], last: popPoints[popPoints.length - 1], ink: veil.ink });
  check(tag + 'le trait est rouge au même endroit des deux côtés : un pixel rouge au milieu de la page dans la fenêtre comme dans la console (capture)', popMid.red > 120 && conMid.red > 60, { popup: popMid, console: conMid });
  check(tag + 'effacer se dégrise dès qu’il y a un trait, la diapositive n’a pas bougé (2 / 6) : dessiner n’est pas un clic', desk.erase.disabled === 'false' && desk.counter === '2 / 6' && veil.counter === '2 / 6', { erase: desk.erase.disabled, counter: desk.counter });
  // Un clic sans glisser : un point, pas la diapositive suivante.
  await page.mouse.click(off.x + frame.left + frame.width * 0.5, off.y + frame.top + frame.height * 0.25);
  await sleep(350);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  check(tag + 'un clic sans glisser, le stylo en main, fait un point (deux traits des deux côtés) et NE passe PAS à la suivante', desk.ink.strokes === 2 && veil.paths.length === 2 && desk.counter === '2 / 6' && veil.counter === '2 / 6' && /h 0\.01$/.test(veil.paths[1].d), { console: desk.ink, popup: veil.paths.map(p => p.d.slice(-12)), counter: desk.counter });
  // Un glissé qui part hors de la page (la marge du cadre) ne trace rien.
  const box = (await previewOf(app, 'current')).box;
  await page.mouse.move(off.x + box.left + 1, off.y + box.top + 1);
  await page.mouse.down();
  await page.mouse.move(off.x + frame.left + frame.width * 0.5, off.y + frame.top + frame.height * 0.7, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  check(tag + 'un glissé qui part hors de la page (dans la marge du cadre) ne trace rien', desk.ink.strokes === 2 && veil.paths.length === 2 && desk.counter === '2 / 6', { console: desk.ink, popup: veil.paths.length });
  // Derrière un écran, le stylo ne trace pas - et rien ne revient quand l'écran s'en va.
  await page.keyboard.press('b');
  await sleep(400);
  await stroke(a, page, frame, [[0.3, 0.8], [0.7, 0.8]]);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  const behind = { console: desk.ink.strokes, popup: veil.paths.length, shown: veil.shown };
  await page.keyboard.press('b');
  await sleep(400);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  check(tag + 'derrière l’écran noir le stylo ne trace rien (ni dans la console, ni dans la fenêtre), et rien ne surgit quand l’écran s’en va', behind.shown && behind.console === 2 && behind.popup === 2 && !veil.shown && desk.ink.strokes === 2 && veil.paths.length === 2, { behind, after: { console: desk.ink.strokes, popup: veil.paths.length } });
  // Effacer : le bouton, puis la touche E.
  await a.click('.pp-speaker-erase', 0, 350);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  check(tag + 'le bouton effacer vide le tracé des deux côtés et se grise ; le stylo reste en main', desk.ink.strokes === 0 && veil.paths.length === 0 && desk.erase.disabled === 'true' && desk.pen.pressed === 'true', { console: desk.ink, popup: veil.paths.length, erase: desk.erase.disabled });
  await stroke(a, page, frame, [[0.25, 0.4], [0.75, 0.45]]);
  desk = await deskOf(app);
  await page.keyboard.press('e');
  await sleep(400);
  const afterE = { before: desk.ink.strokes, console: (await deskOf(app)).ink.strokes, popup: (await veilOf(popup)).paths.length };
  check(tag + 'la touche E efface aussi, des deux côtés', afterE.before === 1 && afterE.console === 0 && afterE.popup === 0, afterE);
  // Le trait est LISSÉ (retour du 04/11 : « très crénelé, il manque de lissage »). Une souris donne des positions ENTIÈRES dans un aperçu de quelque 190 pixels : chacune en vaut sept à dix de la page sur l'écran du public, et la
  // ligne brisée de ces positions est en escalier. Le trait d'une ellipse suivie ainsi, à la vraie souris, est le même des deux côtés et se lit lisse.
  const ELLIPSE = u => [0.5 + 0.32 * Math.cos(u * Math.PI * 2.2 - Math.PI / 2), 0.5 + 0.3 * Math.sin(u * Math.PI * 2.2 - Math.PI / 2)];
  const mouse = await mouseStroke(a, page, frame, ELLIPSE);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  // Le calque de la console est dans l'arbre ombre de la copie de la diapositive en cours (comme la page de la fenêtre dans le sien).
  const conPaths = await app.evaluate(() => {
    const host = document.querySelector('.pp-speaker-current .pp-print-host');
    return host && host.shadowRoot ? Array.from(host.shadowRoot.querySelectorAll('svg[data-pp-ink] path')).map(path => path.getAttribute('d')) : [];
  });
  const popRough = veil.paths.length === 1 ? await roughOf(popup, veil.paths[0].d) : null;
  const [, , sheetW, sheetH] = String(veil.viewBox).split(' ').map(Number);
  const offNow = await a.offset();
  const onSheet = ([x, y]) => ({ x: (x - offNow.x - frame.left) / frame.width * sheetW, y: (y - offNow.y - frame.top) / frame.height * sheetH });
  const startAt = onSheet(mouse[0]);
  const endAt = onSheet(mouse[mouse.length - 1]);
  check(tag + 'un trait à la vraie souris (positions entières, une par événement : ' + mouse.length + ' ici) est le MÊME des deux côtés, au caractère près : la console et la fenêtre dessinent le même chemin',
    desk.ink.strokes === 1 && conPaths.length === 1 && veil.paths.length === 1 && conPaths[0] === veil.paths[0].d && mouse.length > 60, { console: conPaths.map(d => d.slice(0, 60)), popup: veil.paths.map(path => path.d.slice(0, 60)), events: mouse.length });
  check(tag + 'et il est lissé : de 2 pixels de la page en 2 pixels son cap change de moins de 1,5° en moyenne quadratique et de 12° au plus (la ligne brisée de ces positions : 4 à 6° et des pics de 50°)',
    !!popRough && popRough.rug < 1.5 && popRough.maxTurn < 12, popRough && { rug: Math.round(popRough.rug * 100) / 100, maxTurn: Math.round(popRough.maxTurn * 10) / 10, length: Math.round(popRough.length) });
  const around = (v, want, reach) => Math.abs(v - want) <= reach;
  check(tag + 'le lissage garde les bouts et la forme : le trait part et finit où était la souris (à 2 pixels de la page près) et tient dans le cadre de l’ellipse suivie (à 10 pixels près)',
    !!popRough && Math.hypot(popRough.first.x - startAt.x, popRough.first.y - startAt.y) <= 2 && Math.hypot(popRough.last.x - endAt.x, popRough.last.y - endAt.y) <= 2
    && around(popRough.box.left, 0.18 * sheetW, 10) && around(popRough.box.right, 0.82 * sheetW, 10) && around(popRough.box.top, 0.2 * sheetH, 10) && around(popRough.box.bottom, 0.8 * sheetH, 10),
    popRough && { first: popRough.first, wantFirst: startAt, last: popRough.last, wantLast: endAt, box: popRough.box, sheet: [sheetW, sheetH] });
  await page.keyboard.press('e');
  await sleep(400);
  check(tag + 'la touche E efface ce trait des deux côtés (le suivant se dessine sur une page vide)', (await deskOf(app)).ink.strokes === 0 && (await veilOf(popup)).paths.length === 0, { console: (await deskOf(app)).ink.strokes });
  if (full) {
    // Le calque seul (`SlidePlayer.inkLayer`), hors de toute fenêtre, sur des positions de souris simulées dans un aperçu de 190 x 107 pixels (le coin de la page n'est pas sur un pixel entier : 0,37 et 0,21).
    const grain = shape => mousePositions(shape, { width: 190, height: 107 }, { x: 0.37, y: 0.21 }).map(([x, y]) => [Math.round((x - 0.37) / 190 * 1e4) / 1e4, Math.round((y - 0.21) / 107 * 1e4) / 1e4]);
    const UNDERLINE = u => [0.55 + 0.4 * u, 0.82 + 0.012 * Math.sin(u * Math.PI * 3)];
    const sets = [grain(ELLIPSE), grain(UNDERLINE)];
    // Un long trait : un méandre dont chaque point est à 2,5 pixels de page du précédent (un point à moins de 2 pixels du dernier prend sa place, et il ne doit pas en manquer pour passer les 6 000 points gardés) ; un trait DENSE : 6 200 points à un vingtième de pixel les uns des autres,
    // comme un stylet en donne.
    const tri = u => { const m = u % 2; return m < 1 ? m : 2 - m; };
    const long = Array.from({ length: 6200 }, (_, k) => [Math.round((0.05 + 0.9 * tri(k * 2.5 / (0.9 * 1280))) * 1e4) / 1e4, Math.round((0.1 + 0.8 * k / 6200) * 1e4) / 1e4]);
    const dense = Array.from({ length: 6200 }, (_, k) => [Math.round((0.2 + k * 0.05 / 1280) * 1e4) / 1e4, Math.round((0.5 + 0.1 * Math.sin(k / 500)) * 1e4) / 1e4]);
    const layer = await app.evaluate(({ sets, one, two, long, dense }) => {
      const frame = document.createElement('div');
      frame.style.cssText = 'position:absolute;left:0;top:0;width:1280px;height:720px;visibility:hidden';
      document.body.appendChild(frame);
      const draw = (points) => {
        const l = SlidePlayer.inkLayer(frame);
        let slowest = 0;
        for (let i = 0; i < points.length; i += 128) { const t0 = performance.now(); l.add(points.slice(i, i + 128).flat(), i === 0); slowest = Math.max(slowest, performance.now() - t0); }
        l.end();
        const paths = Array.from(frame.querySelectorAll('svg[data-pp-ink] path')).map(path => path.getAttribute('d'));
        l.destroy();
        return { paths, slowest };
      };
      const result = { shapes: sets.map(points => draw(points).paths[0]) };
      result.one = draw(one).paths[0];
      result.two = draw(two).paths[0];
      result.long = draw(long);
      result.dense = draw(dense);
      frame.remove();
      return result;
    }, { sets, one: [[0.4, 0.4]], two: [[0.2, 0.3], [0.6, 0.7]], long, dense });
    const rough = await Promise.all(layer.shapes.map(d => roughOf(app, d)));
    check(tag + 'le calque seul lisse des positions de souris entières dans un aperçu de 190 pixels (une ellipse, un soulignement) : cap qui change de moins de 1,5° en moyenne quadratique, de 12° au plus, et les bouts à 0,1 pixel des points reçus',
      rough.every(r => r.rug < 1.5 && r.maxTurn < 12) && Math.hypot(rough[0].first.x - sets[0][0][0] * 1280, rough[0].first.y - sets[0][0][1] * 720) <= 0.15 && Math.hypot(rough[0].last.x - sets[0][sets[0].length - 1][0] * 1280, rough[0].last.y - sets[0][sets[0].length - 1][1] * 720) <= 0.15
      && Math.hypot(rough[1].first.x - sets[1][0][0] * 1280, rough[1].first.y - sets[1][0][1] * 720) <= 0.15,
      rough.map(r => ({ rug: Math.round(r.rug * 100) / 100, maxTurn: Math.round(r.maxTurn * 10) / 10 })));
    check(tag + 'un point seul reste un point rond, deux points une droite (rien à lisser), et le trait reste dans le repère de la page (viewBox 1280 x 720)',
      /^M [\d.]+ [\d.]+ h 0\.01$/.test(layer.one) && /^M 256 216 L 768 504$/.test(layer.two), { one: layer.one, two: layer.two });
    check(tag + 'au-delà de 6 000 points le trait continue dans un autre chemin qui part où le premier s’arrête (deux chemins pour 6 200 points), et chaque envoi de 128 points se lisse en moins de 150 ms (' + Math.round(layer.long.slowest) + ' ms au plus)',
      layer.long.paths.length === 2 && layer.long.paths[1].startsWith('M ') && layer.long.slowest < 150 && (() => { const end = layer.long.paths[0].match(/L ([\d.]+) ([\d.]+)$/); const begin = layer.long.paths[1].match(/^M ([\d.]+) ([\d.]+)/); return !!end && !!begin && end[1] === begin[1] && end[2] === begin[2]; })(),
      { paths: layer.long.paths.map(d => d.slice(0, 30) + '…' + d.slice(-24)), slowest: layer.long.slowest });
    // Le trait dense ne s'effondre pas en une droite du premier point au dernier (un point à moins de 2 pixels du dernier gardé n'est que le BOUT du trait), ni ne garde ses six mille points : quelques centaines de segments, et une longueur proche de celle de la ligne reçue (le lissage rabote la houle : 84 % ici ; une droite du premier au dernier point n'en ferait que 42 %).
    const denseRough = layer.dense.paths.length === 1 ? await roughOf(app, layer.dense.paths[0]) : null;
    const denseSegments = layer.dense.paths.length === 1 ? (layer.dense.paths[0].match(/Q/g) || []).length : 0;
    const denseLength = dense.reduce((sum, p, k) => k ? sum + Math.hypot((p[0] - dense[k - 1][0]) * 1280, (p[1] - dense[k - 1][1]) * 720) : 0, 0);
    check(tag + 'un trait DENSE (6 200 points à un vingtième de pixel de page les uns des autres, ce qu\'un stylet donne) se lisse aussi vite (' + Math.round(layer.dense.slowest) + ' ms au plus pour un envoi de 128 points, moins de 150), reste UN chemin de quelques centaines de segments (' + denseSegments + '), en suit la ligne (longueur ' + (denseRough ? Math.round(denseRough.length) : '?') + ' pour ' + Math.round(denseLength) + ' reçus) et finit au dernier point reçu',
      layer.dense.paths.length === 1 && layer.dense.slowest < 150 && denseSegments >= 100 && denseSegments <= 800 && !!denseRough && denseRough.length >= 0.75 * denseLength && denseRough.length <= 1.02 * denseLength
      && (() => { const end = layer.dense.paths[0].match(/L ([\d.]+) ([\d.]+)$/); const last = dense[dense.length - 1]; return !!end && Math.abs(Number(end[1]) - last[0] * 1280) <= 0.01 && Math.abs(Number(end[2]) - last[1] * 720) <= 0.01; })(),
      { paths: layer.dense.paths.map(d => d.length + ' caractères, fin ' + d.slice(-24)), slowest: layer.dense.slowest, segments: denseSegments, length: denseRough && denseRough.length, received: denseLength, last: dense[dense.length - 1] });
  }
  // Changer de diapositive efface : au clavier, et aussi quand le trait est fait pendant que la page change.
  await stroke(a, page, frame, [[0.25, 0.4], [0.75, 0.45]]);
  await page.keyboard.press('ArrowRight');
  await sleep(500);
  await agree(popup);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  const onNext = { counter: veil.counter, console: desk.ink.strokes, popup: veil.paths.length };
  await page.keyboard.press('ArrowLeft');
  await sleep(500);
  await agree(popup);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  check(tag + 'changer de diapositive efface le tracé (de la console et de la fenêtre) et il ne revient pas en revenant (2 / 6)', onNext.counter === '4 / 6' && onNext.console === 0 && onNext.popup === 0 && veil.counter === '2 / 6' && desk.ink.strokes === 0 && veil.paths.length === 0, { onNext, back: { console: desk.ink.strokes, popup: veil.paths.length } });
  // Échap finit le stylo d'abord, sans quitter ; D le reprend.
  await page.keyboard.press('Escape');
  await sleep(300);
  desk = await deskOf(app);
  const stillThere = (await consoleOf(app)).present && !popup.isClosed();
  check(tag + 'Échap pendant le stylo ne fait que finir le stylo : le bouton se relève, la phrase redevient celle du clic, la console et la fenêtre restent', stillThere && desk.pen.pressed === 'false' && !desk.inking && desk.cursor === 'pointer' && desk.hint !== T.hintPen, { stillThere, pen: desk.pen.pressed, cursor: desk.cursor, hint: desk.hint });
  await page.keyboard.press('d');
  await sleep(250);
  desk = await deskOf(app);
  await page.keyboard.press('d');
  await sleep(250);
  const penOff = await deskOf(app);
  check(tag + 'D reprend le stylo, D le repose', desk.pen.pressed === 'true' && desk.inking && penOff.pen.pressed === 'false' && !penOff.inking, { on: desk.pen.pressed, off: penOff.pen.pressed });
  // Sans le stylo, un clic sur la diapositive en cours passe à la suivante comme avant.
  await a.click('.pp-speaker-current', 0, 500);
  await agree(popup);
  const plainClick = (await consoleOf(app)).counter;
  await a.click('.pp-speaker-prev', 0, 500);
  await agree(popup);
  check(tag + 'sans le stylo, un clic sur la diapositive en cours passe à la suivante comme avant (4 / 6)', plainClick === '4 / 6', plainClick);

  // --- Des messages que la fenêtre ne doit pas croire : mal formés, d'un autre expéditeur, trop nombreux.
  const forged = await popup.evaluate(() => {
    const send = (data, source = window.opener) => window.dispatchEvent(new MessageEvent('message', { data, source }));
    const cmd = (name, index, points) => ({ type: 'pp-present-command', name, index, points });
    const bad = [
      cmd('ink', 1, [0.1, 0.1, 0.2]), cmd('ink', 1, ['a', 'b']), cmd('ink', 1, [NaN, 0.5]), cmd('ink', 1, [Infinity, 0]), cmd('ink', 1, [[0.1, 0.2]]), cmd('ink', 1, 'x'), cmd('ink', 1, null), cmd('ink', 1, []),
      cmd('ink', 1, new Array(258).fill(0.5)), cmd('ink', 1, { length: 2, 0: 0.1, 1: 0.1 }), cmd('ink', 1, [null, null]), cmd('ink', 1, [true, false]), cmd('ink', 1, [0.1]), cmd('ink', 1),
    ];
    bad.forEach(m => send(m));
    send(cmd('ink', 1, [0.4, 0.4, 0.6, 0.6]), window);
    send(cmd('ink', 1, [0.4, 0.4, 0.6, 0.6]), null);
    return bad.length + 2;
  });
  await sleep(300);
  veil = await veilOf(popup);
  check(tag + 'la fenêtre ne trace rien d’un envoi mal formé (' + forged + ' essais : points impairs, texte, NaN, infini, imbriqués, vides, 258 nombres, objet, nuls, booléens) ni d’un envoi qui ne vient pas de son ouvreur', veil.paths.length === 0, { paths: veil.paths.length });
  await popup.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'pp-present-command', name: 'ink', index: 1, points: [-5, 7, 2, -3] }, source: window.opener })));
  await sleep(250);
  veil = await veilOf(popup);
  const clamped = veil.paths.length === 1 ? fractionsOf(veil.paths[0], veil.viewBox) : [];
  check(tag + 'un envoi bien formé mais hors de la page est ramené à son bord (de 0 à 1) : jamais de trait hors du cadre', clamped.length === 2 && clamped.every(p => p.every(v => v >= 0 && v <= 1)) && clamped[0][0] === 0 && clamped[0][1] === 1 && clamped[1][0] === 1 && clamped[1][1] === 0, clamped);
  await popup.evaluate(() => {
    const send = (data) => window.dispatchEvent(new MessageEvent('message', { data, source: window.opener }));
    const cmd = (name, index, points) => ({ type: 'pp-present-command', name, index, points });
    send(cmd('inkClear'));
    for (let i = 0; i < 450; i++) send(cmd('ink', 1, [(i % 100) / 100, 0.5]));
  });
  await sleep(500);
  veil = await veilOf(popup);
  check(tag + 'le calque garde 400 traits au plus (450 envoyés : les plus anciens s’effacent) et reste réactif', veil.paths.length === 400, { paths: veil.paths.length });
  const screens = await popup.evaluate(() => {
    const send = (data) => window.dispatchEvent(new MessageEvent('message', { data, source: window.opener }));
    const cmd = (name, index) => ({ type: 'pp-present-command', name, index });
    const shown = () => { const v = document.querySelector('.pp-slide-show-screen'); return !!v && !v.hidden; };
    send(cmd('inkClear'));
    ['x', -1, 3, 1.5, '1', null, undefined, NaN, [], {}, true].forEach(i => send(cmd('screen', i)));
    const afterBad = shown();
    send(cmd('screen', 1));
    const black = shown();
    send({ type: 'pp-present-command', name: 'ink', index: 1, points: [0.1, 0.1, 0.2, 0.2] });
    const inkBehind = document.getElementById('pp-slide-show-stage').shadowRoot.querySelectorAll('svg[data-pp-ink] path').length;
    send(cmd('screen', 1));
    send(cmd('screen', 0));
    return { afterBad, black, inkBehind, end: shown() };
  });
  check(tag + 'un ordre d’écran qui n’est pas 0, 1 ou 2 (texte, négatif, fraction, nul, NaN, objet…) ne fait rien ; 1 couvre, un envoi du stylo derrière le voile ne trace rien, 1 de nouveau puis 0 laissent la diapositive', !screens.afterBad && screens.black && screens.inkBehind === 0 && !screens.end, screens);
  // Une fenêtre rechargée repart de zéro, et la console le sait : son tracé et son écran noir disparaissent avec ceux de la fenêtre.
  await a.click('.pp-speaker-pen', 0, 200);
  await stroke(a, page, frame, [[0.2, 0.3], [0.8, 0.3]]);
  await page.keyboard.press('b');
  await sleep(450);
  desk = await deskOf(app);
  const beforeReload = { strokes: desk.ink.strokes, screen: desk.screen, black: desk.black.pressed };
  await popup.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await popup.waitForFunction(() => { const n = document.querySelector('.pp-slide-show-counter'); return !!n && n.textContent !== ''; }, null, { timeout: 25000 }).catch(() => {});
  await agree(popup, 8000);
  await sleep(400);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  check(tag + 'la fenêtre rechargée repart de zéro et la console le sait : plus de trait chez elle (la copie de la console non plus), plus d’écran noir (le bouton se relève) - le stylo reste en main',
    beforeReload.strokes === 1 && beforeReload.screen === 1 && beforeReload.black === 'true' && desk.ink.strokes === 0 && desk.screen === 0 && desk.black.pressed === 'false' && veil.paths.length === 0 && !veil.shown && desk.pen.pressed === 'true' && desk.erase.disabled === 'true', { beforeReload, desk: { strokes: desk.ink.strokes, screen: desk.screen, black: desk.black.pressed, pen: desk.pen.pressed }, popup: veil.paths.length });
  // Après le rechargement tout marche encore : un trait neuf.
  await stroke(a, page, frame, [[0.2, 0.6], [0.8, 0.6]]);
  desk = await deskOf(app);
  veil = await veilOf(popup);
  check(tag + 'après le rechargement un trait neuf se dessine des deux côtés', desk.ink.strokes === 1 && veil.paths.length === 1, { console: desk.ink.strokes, popup: veil.paths.length });
  // La console, comme la fenêtre, ne touche pas au document.
  check(tag + 'rien de tout cela ne touche au document ni ne s’enregistre (le texte et les écritures de la table sont ceux d’avant)', (await app.evaluate(() => Editor.getHTML())) === htmlBefore && (await saves(app)) === savesBefore, { saves: [savesBefore, await saves(app)] });
  await a.click('.pp-speaker-exit', 0, 300);
  await until(() => popup.isClosed(), 4000);

  if (full) {
    // --- Derrière un écran noir, le passage seul attend (la diapositive 2 passe seule après 2 s) et se recompte au retour ; le tracé de la page qu'on quitte part avec elle pendant l'effet (la 4 arrive en fondu de 2,5 s).
    await open(A, 9, 4);
    await cursorIn(a, 0);
    const timed = await launch();
    if (!timed) { check(tag + 'la fenêtre du modèle à passage seul s’ouvre', false, 'aucune fenêtre'); await context.close(); return; }
    await agree(timed);
    await a.click('.pp-speaker-forward', 0, 0);
    await page.keyboard.press('b');
    await sleep(300);
    const t0 = Date.now();
    let heldView = await veilOf(timed);
    await sleep(Math.max(0, 2800 - (Date.now() - t0)));
    const held = await veilOf(timed);
    const heldDesk = await deskOf(app);
    check(tag + 'derrière l’écran noir la diapositive 2 (qui passe seule après 2 s) ne passe pas : toujours 2 / 4 après 3 s, des deux côtés', heldView.shown && held.shown && held.counter === '2 / 4' && heldDesk.counter === '2 / 4', { before: heldView.counter, after: held.counter, console: heldDesk.counter });
    await page.keyboard.press('b');
    await sleep(1000);
    const resumed = await veilOf(timed);
    await sleep(1700);
    const advanced = await veilOf(timed);
    check(tag + 'au retour de l’écran son temps se recompte : 1 s après, toujours 2 / 4 ; 2,7 s après, elle est passée seule à la suite (3 / 4)', !resumed.shown && resumed.counter === '2 / 4' && advanced.counter === '3 / 4', { afterOneSecond: resumed.counter, afterTwoSeconds: advanced.counter });
    await agree(timed);
    // Le tracé part avec la page quittée : sur la 3, un trait, puis › vers la 4 (fondu de 2,5 s).
    await a.click('.pp-speaker-pen', 0, 200);
    const frame3 = await frameOf();
    await stroke(a, page, frame3, [[0.2, 0.5], [0.8, 0.5]]);
    const drawn = (await veilOf(timed)).paths.length;
    await a.click('.pp-speaker-forward', 0, 0);
    await sleep(400);
    const during = await veilOf(timed);
    const live = during.paths.length;
    const flying = during.ghosts.filter(g => !g.parked);
    await sleep(3200);
    const after = await veilOf(timed);
    check(tag + 'pendant l’effet (fondu de 2,5 s) le tracé de la page quittée part avec elle : la copie de la 3 porte 1 trait, la 4 n’en a aucun ; l’effet fini, la copie est garée sans trait, la 4 est vierge',
      drawn === 1 && flying.length === 1 && flying[0].inks === 1 && flying[0].paths === 1 && live === 0 && after.counter === '4 / 4' && after.ghosts.every(g => g.parked && g.inks === 0) && after.paths.length === 0, { drawn, flying, live, after: { counter: after.counter, ghosts: after.ghosts, paths: after.paths.length } });
    await a.click('.pp-speaker-exit', 0, 300);
    await until(() => timed.isClosed(), 4000);
  }
  check(tag + 'aucune erreur de page, ni dans l’app ni dans les fenêtres', popErrors.length === 0, popErrors);
  await context.close();
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await blocked('fr', 'light');
await screensAndPen('fr', 'light', true);
await screensAndPen('en', 'dark', false);
await t.finish();
