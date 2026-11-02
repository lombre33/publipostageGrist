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
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Intervenant', '${SLIDES}', false, 'presentation');
  add(8, 'Soixante-dix', '${MANY}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
const TEXTS = {
  fr: {
    label: 'Vue intervenant', more: 'Autres façons de présenter : depuis le début, plein écran, vue intervenant', menu: 'Vue intervenant',
    menuNote: 'Le diaporama s’ouvre dans une fenêtre à part ; ce panneau devient la console : diapositive suivante, notes, chrono.',
    current: 'DIAPOSITIVE EN COURS', upcoming: 'SUIVANTE', end: 'Fin du diaporama', hintSlide: 'Prochain clic : diapositive suivante', hintEnd: 'Prochain clic : fin du diaporama',
    hintEnded: 'Fin du diaporama : un geste de plus le ferme.', hintClick: (k, n) => `Prochain clic : animation ${k} / ${n} (la diapositive ne change pas)`,
    noNotes: 'Pas de notes pour cette diapositive.', smaller: 'Notes en plus petit', larger: 'Notes en plus grand', goTo: 'Aller à…', hiddenMark: 'masquée', untitled: n => `Diapositive ${n}`,
    pause: 'Mettre le chrono en pause', resume: 'Reprendre le chrono', reset: 'Remettre le chrono à zéro', exit: 'Quitter le diaporama (Échap)',
    prev: 'Diapositive précédente (←)', next: 'Diapositive suivante (→)', hint: 'Un clic ou une touche pour passer en plein écran.', search: 'Chercher une diapositive…', empty: 'Aucune diapositive ne correspond.',
    blocked: 'Le navigateur a bloqué la fenêtre du diaporama : sans elle, pas de vue intervenant. Le diaporama s’affiche dans le panneau.', annexe: 'annexe',
  },
  en: {
    label: 'Presenter view', more: 'Other ways to present: from the beginning, full screen, presenter view', menu: 'Presenter view',
    menuNote: 'The slide show opens in its own window; this panel becomes the console: next slide, notes, timer.',
    current: 'CURRENT SLIDE', upcoming: 'NEXT', end: 'End of the slide show', hintSlide: 'Next click: next slide', hintEnd: 'Next click: end of the slide show',
    hintEnded: 'End of the slide show: one more step closes it.', hintClick: (k, n) => `Next click: animation ${k} / ${n} (the slide stays)`,
    noNotes: 'No notes for this slide.', smaller: 'Smaller notes', larger: 'Larger notes', goTo: 'Go to…', hiddenMark: 'hidden', untitled: n => `Slide ${n}`,
    pause: 'Pause the timer', resume: 'Resume the timer', reset: 'Reset the timer', exit: 'Exit the slide show (Esc)',
    prev: 'Previous slide (←)', next: 'Next slide (→)', hint: 'Click or press a key to go full screen.', search: 'Search for a slide…', empty: 'No slide matches.',
    blocked: 'The browser blocked the slide show window: without it, there is no presenter view. The slide show is shown in the panel.', annexe: 'hidden',
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
  const triple = async (selector, settle = 250) => {
    const c = await inPage(await centerOf(selector, 0));
    if (!c) throw new Error('introuvable : ' + selector);
    await reach(c);
    await page.mouse.click(c.x, c.y, { clickCount: 3 });
    await sleep(settle);
  };
  return { click, wheel, triple, offset, app };
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
  await page.keyboard.press('Escape');
  await sleep(500);
  const after = await app.evaluate(() => ({ show: !!document.querySelector('.pp-slide-show'), speaker: !!document.querySelector('.pp-speaker') }));
  check(tag + 'Échap le ferme, la barre de GFS revient', !after.show && !after.speaker && (await gfsCalls(page, 'barre.masquer')).length === masks0 + 2, after);
  await context.close();
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await blocked('fr', 'light');
await t.finish();
