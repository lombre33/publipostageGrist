#!/usr/bin/env node
// La fenêtre à part du diaporama (extensions/diapositives/slide-window.js, slide-present.js, present.html, slide-player.js ; demande du 24/10 : « un moyen alternatif pour avoir un plein écran, c'est
// vraiment important », choix d'Antoine : « fenêtre à part, sans GFS d'abord »), l'app dans le cadre isolé de GFS - sans `allow-same-origin` et sans `allow="fullscreen"` : le plein écran du navigateur
// y est refusé, c'est ce qui envoie le diaporama dans une fenêtre -, à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, la politique de sécurité du contenu respectée
// (`bypassCSP` faux) et `popups` vrai : le navigateur de l'essai ouvre la fenêtre pour de bon, bloqueur de fenêtres de Chromium ALLUMÉ (`popupBlocker` : une fenêtre ne s'ouvre que dans un clic ou une touche vrais, vieux
// de moins de 5 s ; verify-slides-show.mjs la fait refuser et mesure le repli dans le panneau).
//  LE DÉPART : le ▶ (interrupteur « Plein écran » coché, cadre qui le refuse) ouvre une fenêtre à part, de l'adresse de present.html à la version de l'extension, dans le bac à sable que le cadre lui
//   passe (origine « nulle », son ouvreur gardé) ; rien ne se pose dans le panneau (ni diaporama, ni rendu, et GFS ne masque pas sa barre) ; la fenêtre porte le nom du modèle et la langue et le thème de
//   l'app ; elle dit « Un clic ou une touche pour passer en plein écran » (devant la page, lisible) jusqu'au premier geste ; elle montre la diapositive du curseur, entière, la plus grande possible (16:9),
//   la variable remplie avec la ligne choisie, la forme « Devant le texte » sur sa diapositive, le fond de la diapositive et un cadre libre plein à leur place ; et son rendu est le même, pixel pour pixel, que celui du panneau (interrupteur décoché).
//  LE PLEIN ÉCRAN : le premier clic, ou la première touche (pas Échap, ni une touche seule, ni un raccourci), ne fait que le demander - il ne passe pas aussi à la suivante - ; accordé, la ligne s'efface ; le
//   suivant passe. → ← Espace Entrée Début Fin, la molette, un clic sur un lien vers une autre diapositive (il y mène), la barre du bas et ses boutons marchent dans la fenêtre comme dans le panneau.
//  SORTIR : Échap, « Quitter », la fin suivie d'une touche ferment la fenêtre ; le document de l'app n'a pas bougé, rien n'est enregistré, la fenêtre libère ce qu'elle gardait (l'app le sait).
//  ROUVRIR : ▶ pendant que la fenêtre est ouverte la remplace au lieu d'en empiler une deuxième (même nom) ; une fenêtre rechargée redemande son rendu ; une image d'un autre site pose sa question AVANT
//   la fenêtre (Annuler n'ouvre rien, Continuer l'ouvre : le geste est celui du bouton de la question) ; un rendu qui échoue ferme la fenêtre et le dit.
//  LE DÉLAI DU GESTE : un rendu de 6,5 s n'empêche pas la fenêtre de s'ouvrir tout de suite (elle s'ouvre avant le rendu) ; une attente de 6,5 s avant l'ouverture la fait refuser par le navigateur : le panneau, avec
//   la ligne qui le dit, puis le lancement suivant ouvre la fenêtre.
//  SÛRETÉ : la page n'écoute que son ouvreur (un message d'elle-même ou d'un autre est ignoré), l'app n'écoute que la fenêtre qu'elle a ouverte ; du HTML piégé dans le rendu ne s'exécute pas (script,
//   gestionnaire `on…`, adresse `javascript:`, cadre, objet, formulaire sont retirés) et la politique de la page refuse de toute façon le script en ligne, ses gestionnaires et `eval` ; ouverte seule, la page
//   dit d'où elle s'ouvre, sans rien jouer.
// Lancé par run-headless.mjs (groupe Node "slidesWindow", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-window.mjs
import { start, seedModels, contrastOf, registryFiles } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-window', port: Number(process.env.SLIDES_WINDOW_PORT || 8961), popupBlocker: true });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const VERSION = /\?v=([^&]+)/.exec(registryFiles('diapositives')[0])[1];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const CHIP = '<span class="var-badge" data-table="PpDepart" data-column="Nom" data-key="PpDepart.Nom"></span>';
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const SHAPE = `<img class="editor-image" src="${FRONT}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: 5" data-layer="front" data-wrap="inline" data-page-index="2" data-page-left-pt="40" data-page-top-pt="30">`;
// Un cadre libre plein et un fond de diapositive : leur place dépend des variables de page (--pp-margin-*, --pp-page-width, --pp-page-height) de <html>, que la fenêtre doit recevoir pour que son rendu soit celui du panneau.
const FRAME = '<div class="pp-free-frame" role="group" data-ff-x="360" data-ff-y="190" data-ff-w="170" data-ff-h="70" data-ff-fill="#ffcc00" data-ff-line="#cc0000" data-ff-lw="2"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>Cadre deux</p></div></div></div>';
// Le signet de la 3e diapositive (cible du lien « Aller » de la première), dans son repère caché.
const ANCHOR = '<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden" data-anchor="slide-3" data-anchor-name="Diapositive 3"></div>';
const BACKGROUND = '<div class="pp-slide-props" data-bg="#e6f0ff"></div>';
const OUTSIDE = '<p><img class="editor-image" src="https://pp-window.test/a.png" alt="" style="width: 120px;"></p>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(8, 'Cible', '<h1>Bonjour ${CHIP}</h1><p>Cible un</p><p><a href="#slide-3">Aller</a></p>${BR}${BACKGROUND}${FRAME}<h2>Deux</h2><p>Cible deux</p>${BR}${ANCHOR}<p>Cible trois</p><p>${SHAPE}</p>', false, 'presentation');
  add(9, 'Dehors', '<p>Dehors un</p>${OUTSIDE}${BR}<p>Dehors deux</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 12;
`;
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TEXTS = {
  fr: {
    hint: 'Un clic ou une touche pour passer en plein écran.', end: 'Fin du diaporama. Un clic ou une touche pour quitter.', closed: 'Le diaporama est terminé. Cette fenêtre peut être fermée.',
    blocked: 'Le navigateur a bloqué la fenêtre du diaporama : il s’affiche dans le panneau.',
    title: 'Cible', failed: m => `Le diaporama n’a pas pu s’afficher : ${m}`,
  },
  en: {
    hint: 'Click or press a key to go full screen.', end: 'End of slide show. Click or press a key to exit.', closed: 'The slide show is over. This window can be closed.',
    blocked: 'The browser blocked the slide show window: it is shown in the panel.',
    title: 'Cible', failed: m => `The slide show could not be shown: ${m}`,
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
  return { click };
}

// Ce que la fenêtre (ou le panneau, `target` : une page ou un cadre) montre : sa boîte, la page montrée, le compteur, la ligne d'information, la barre, l'écran de fin, le texte que la page laisse voir, le
// plein écran du navigateur, et ce que la page dit d'elle-même.
const shownIn = target => target.evaluate(() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const show = document.querySelector('.pp-slide-show');
  const host = document.getElementById('pp-slide-show-stage');
  const scope = host && host.shadowRoot ? host.shadowRoot.querySelector('.pp-print-scope') : null;
  const layer = scope ? scope.querySelector(':scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)') : null;
  const frame = layer ? layer.firstElementChild : null;
  const view = frame ? frame.firstElementChild : null;
  let visible = '';
  let shapeShown = false;
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
    shapeShown = Array.from(view.querySelectorAll('img[data-layer="front"]')).some(img => inBox(img.getBoundingClientRect()));
  }
  const visibleText = (selector) => { const e = show && show.querySelector(selector); return e && !e.hidden ? e.textContent : null; };
  return {
    show: !!show, host: !!host, rect: rect(show), bg: show ? getComputedStyle(show).backgroundColor : '', frame: rect(frame), visible, shapeShown,
    ff: rect(view ? view.querySelector('.pp-free-frame[data-ff-x="360"] > .pp-free-frame-box') : null),
    counter: (show && show.querySelector('.pp-slide-show-counter') || {}).textContent || '',
    barOpacity: show ? getComputedStyle(show.querySelector('.pp-slide-show-bar')).opacity : '',
    end: visibleText('.pp-slide-show-end'), note: visibleText('.pp-slide-show-note'),
    fullscreen: !!document.fullscreenElement && document.fullscreenElement === show,
    title: document.title, lang: document.documentElement.lang, theme: document.documentElement.getAttribute('data-theme') || '',
    origin: self.origin, path: location.pathname + location.search, opener: !!window.opener, size: { width: innerWidth, height: innerHeight },
    wait: (w => (w ? { text: w.textContent, opacity: getComputedStyle(w).opacity } : null))(document.getElementById('pp-present-wait')),
  };
});
const countersOf = async (target) => (await shownIn(target)).counter;
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const waitCounter = (target, timeout = 25000) => target.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout }).catch(() => {});
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
// Les pixels d'une capture qui ne sont pas du blanc, dans le rectangle `rect` de la capture.
async function inkIn(page, buffer, rect) {
  return page.evaluate(async ([data64, box]) => {
    const bytes = Uint8Array.from(atob(data64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(Math.round(box.x), Math.round(box.y), Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)));
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 690) ink++;
    return ink;
  }, [buffer.toString('base64'), rect]);
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
// Deux captures de même taille : combien de pixels diffèrent (d'plus de 12 niveaux en tout).
async function pixelDiff(page, one, two) {
  return page.evaluate(async ([a64, b64]) => {
    const load = async (d) => createImageBitmap(new Blob([Uint8Array.from(atob(d), c => c.charCodeAt(0))], { type: 'image/png' }));
    const [A, B] = await Promise.all([load(a64), load(b64)]);
    if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height], diff: -1, total: 0 };
    const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const da = px(A);
    const db = px(B);
    let diff = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 12) diff++;
    return { size: [A.width, A.height], diff, total: da.length / 4 };
  }, [one.toString('base64'), two.toString('base64')]);
}

// ▶ à la vraie souris ; rend la fenêtre qui s'ouvre (ou null au bout de `wait` ms).
async function playAndCatch(A, a, wait = 15000) {
  const caught = A.page.waitForEvent('popup', { timeout: wait }).catch(() => null);
  await a.click('.pp-slide-show-open', 0, 150);
  return caught;
}
// Le curseur dans la diapositive n (de 0) de la bande.
async function cursorIn(a, n) {
  await a.click('.pp-slide-strip .pp-slide-item', n, 500);
  await a.click('.pp-slide-strip .pp-slide-item', n, 500);
}
// La fenêtre est fermée au bout de `ms` au plus (une fenêtre qui se ferme elle-même emporte l'appel qui l'a fermée : les gestes qui la ferment passent par `closing`).
async function closedWithin(popup, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (popup.isClosed()) return true; await sleep(100); }
  return popup.isClosed();
}
const closing = promise => promise.catch(() => {});

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, popups: true, bypassCSP: false });
  const { page, app, context } = A;
  const a = toolsOf(A);
  // Les erreurs de page de chaque fenêtre ouverte (la page de l'app est suivie par l'essai lui-même).
  const errors = [];
  context.on('page', p => p.on('pageerror', e => errors.push(String(e.message).slice(0, 200))));
  await context.route('**://pp-window.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(TINY_PNG, 'base64') }));
  await open(A, 8, 3);
  await cursorIn(a, 1);
  const htmlBefore = await app.evaluate(() => Editor.getHTML());
  const savesBefore = await saves(app);
  const masks0 = (await gfsCalls(page, 'barre.masquer')).length;

  // --- Le cadre de GFS refuse le plein écran du navigateur : c'est ce qui envoie le diaporama dans une fenêtre.
  const frameAllows = await app.evaluate(() => ({ enabled: document.fullscreenEnabled, ask: typeof document.documentElement.requestFullscreen }));
  check(tag + 'dans le cadre isolé (comme chez GFS) le navigateur refuse le plein écran : c’est le cas qui demande la fenêtre à part', frameAllows.enabled === false, frameAllows);

  // --- Le rendu du panneau, pour la comparaison : l'interrupteur « Plein écran » décoché, le ▶ joue dans le panneau.
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  const asPanel = await playAndCatch(A, a, 1500);
  await waitCounter(app);
  // La barre du bas se montre quand la souris bouge, se cache après deux secondes : on attend qu'elle soit cachée avant la capture.
  await sleep(3000);
  await app.evaluate(() => { const n = document.querySelector('.pp-slide-show-note'); if (n) n.hidden = true; });
  const panelShot = await page.screenshot({ type: 'png' });
  const panel = await shownIn(app);
  await page.keyboard.press('Escape');
  await sleep(500);
  check(tag + 'interrupteur « Plein écran » décoché : le ▶ garde le panneau et n’ouvre aucune fenêtre', !asPanel && panel.show && panel.counter === '2 / 3' && context.pages().length === 1, { opened: !!asPanel, counter: panel.counter, pages: context.pages().length });

  // --- Coché de nouveau, le ▶ ouvre la fenêtre.
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  const popup = await playAndCatch(A, a);
  check(tag + 'le ▶ ouvre une fenêtre à part', !!popup && context.pages().length === 2, { pages: context.pages().length });
  if (!popup) { await A.context.close(); return; }
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  // La ligne « un clic ou une touche » est écrite avant le rendu.
  await popup.waitForFunction(() => { const n = document.querySelector('.pp-slide-show-note'); return !!n && !n.hidden; }, null, { timeout: 15000 }).catch(() => {});
  const early = await shownIn(popup);
  await waitCounter(popup);
  await sleep(500);
  let w = await shownIn(popup);
  const barAtStart = w.barOpacity;
  const appNow = await shownIn(app);
  check(tag + 'rien ne se pose dans le panneau : ni diaporama, ni rendu, et GFS ne masque pas sa barre', !appNow.show && !appNow.host && (await gfsCalls(page, 'barre.masquer')).length === masks0 + 2,
    { show: appNow.show, host: appNow.host, masks: (await gfsCalls(page, 'barre.masquer')).length, before: masks0 });
  check(tag + 'la fenêtre est la page present.html de l’extension, à sa version, dans le bac à sable du cadre (origine « nulle »), son ouvreur gardé', /\/extensions\/diapositives\/present\.html$/.test(w.path.split('?')[0]) && w.path.endsWith('?v=' + VERSION) && w.origin === 'null' && w.opener, { path: w.path, origin: w.origin, opener: w.opener });
  const theme = await app.evaluate(() => document.documentElement.getAttribute('data-theme') || '');
  check(tag + 'elle porte le nom du modèle, la langue et le thème de l’app', w.title === T.title && w.lang === lang && w.theme === theme, { title: w.title, lang: w.lang, theme: w.theme, appTheme: theme });
  check(tag + 'avant le rendu : la ligne « un clic ou une touche pour le plein écran » est déjà là', early.note === T.hint && early.show, { note: early.note });
  const r = w.frame;
  const fits = !!r && (near(r.width, w.size.width) || near(r.height, w.size.height)) && r.width <= w.size.width + 1 && r.height <= w.size.height + 1 && near(r.width / r.height, 16 / 9, 0.02)
    && near(r.left + r.width / 2, w.size.width / 2) && near(r.top + r.height / 2, w.size.height / 2);
  check(tag + 'elle montre la diapositive du curseur (2 / 3), entière, au centre, aussi grande que la fenêtre le permet (16:9), fond noir', w.counter === '2 / 3' && w.bg === 'rgb(0, 0, 0)' && fits && near(w.rect.width, w.size.width) && near(w.rect.height, w.size.height),
    { counter: w.counter, bg: w.bg, frame: w.frame, rect: w.rect, size: w.size });
  check(tag + 'son texte, rien de la diapositive d’avant ni d’après, ni « Saut de page »', w.visible === 'Cadre deux Deux Cible deux', w.visible);
  // Le cadre libre et le fond de la diapositive sont à leur place : leur position dépend des variables de page de l'app (marges, largeur et hauteur de la page), que la fenêtre reprend.
  const scale = r.width / 1280.13;
  const frameOk = !!w.ff && near(w.ff.left, r.left + 480 * scale, 3) && near(w.ff.top, r.top + (190 / 0.75) * scale, 3) && near(w.ff.width, (170 / 0.75) * scale, 3);
  const hintShot = await popup.screenshot({ type: 'png' });
  const pageColor = await colorAt(page, hintShot, r.left + 6, r.bottom - 6);
  const frameColor = await colorAt(page, hintShot, w.ff ? w.ff.left + 8 : 0, w.ff ? w.ff.top + w.ff.height - 8 : 0);
  check(tag + 'le fond de la diapositive (#e6f0ff) couvre toute la page, et son cadre libre plein (#ffcc00) est à sa place sur la page', frameOk && pageColor.join() === '230,240,255' && frameColor.join() === '255,204,0', { ff: w.ff, frame: r, pageColor, frameColor });
  const hintBox = await popup.evaluate(() => { const r = document.querySelector('.pp-slide-show-note').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });
  check(tag + 'la ligne est devant la page (de l’encre à sa place à l’écran), tout entière dans la fenêtre, lisible (4,5:1 au moins)',
    w.note === T.hint && (await inkIn(page, hintShot, hintBox)) > 60 && hintBox.x >= 0 && hintBox.y >= 0 && hintBox.right <= w.size.width && hintBox.bottom <= w.size.height && (await contrastOf(popup, '.pp-slide-show-note')) >= 4.5, { note: w.note, hintBox });

  // --- Le rendu est celui du panneau, pixel pour pixel (la ligne et la barre mises à part).
  await popup.evaluate(() => { document.querySelector('.pp-slide-show-note').hidden = true; });
  const windowShot = await popup.screenshot({ type: 'png' });
  const diff = await pixelDiff(page, panelShot, windowShot);
  check(tag + 'le rendu de la fenêtre est celui du panneau : le même, pixel pour pixel (diapositive, polices, fond, variable remplie)', diff.diff === 0 && panel.counter === '2 / 3' && w.size.width === 700 && w.size.height === 400, { diff, panelFrame: panel.frame, windowFrame: w.frame });
  await popup.evaluate(() => { const n = document.querySelector('.pp-slide-show-note'); n.hidden = false; });

  // --- Le premier geste ne fait que demander le plein écran.
  await popup.mouse.click(350, 200);
  await sleep(500);
  w = await shownIn(popup);
  check(tag + 'le premier clic demande le plein écran et ne passe pas à la suivante : la diapositive reste la 2, la fenêtre est en plein écran, la ligne s’efface', w.fullscreen && w.counter === '2 / 3' && w.note === null, { fullscreen: w.fullscreen, counter: w.counter, note: w.note });
  await popup.mouse.click(350, 200);
  await sleep(300);
  w = await shownIn(popup);
  check(tag + 'le clic suivant passe à la 3, sa forme « Devant le texte » posée sur elle', w.counter === '3 / 3' && w.visible === 'Cible trois' && w.shapeShown, { counter: w.counter, visible: w.visible, shape: w.shapeShown });
  await popup.keyboard.press('ArrowLeft');
  await sleep(250);
  await popup.keyboard.press('ArrowLeft');
  await sleep(250);
  w = await shownIn(popup);
  check(tag + '← ← : la première, la variable remplie avec la ligne choisie (Alice)', w.counter === '1 / 3' && w.visible === 'Bonjour Alice Cible un Aller', { counter: w.counter, visible: w.visible });
  // Un lien du texte vers une autre diapositive (« Aller », vers la 3e) y mène, comme au panneau ; un autre clic passe à la suivante.
  const link = await popup.evaluate(() => {
    const host = document.getElementById('pp-slide-show-stage');
    const a = host && host.shadowRoot ? host.shadowRoot.querySelector('a[data-link-anchor="slide-3"]') : null;
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
  });
  if (link) { await popup.mouse.move(link.x - 6, link.y); await popup.mouse.click(link.x, link.y); await sleep(400); }
  const viaLink = await countersOf(popup);
  check(tag + 'un clic sur le lien « Aller » mène à la 3e diapositive (pas à la 2e)', !!link && link.inside && viaLink === '3 / 3', { link, viaLink });
  await popup.keyboard.press('Home');
  await sleep(300);
  w = await shownIn(popup);
  await sleep(2800);
  const barIdle = (await shownIn(popup)).barOpacity;
  check(tag + 'la barre du bas est cachée tant que la souris ne bouge pas, et se cache de nouveau deux secondes après le dernier mouvement', barAtStart === '0' && barIdle === '0', { barAtStart, barIdle });
  await popup.keyboard.press(' ');
  await sleep(250);
  const afterSpace = await countersOf(popup);
  await popup.keyboard.press('End');
  await sleep(250);
  const atEnd = await countersOf(popup);
  await popup.keyboard.press('Home');
  await sleep(250);
  const atHome = await countersOf(popup);
  await popup.mouse.move(200, 200);
  await popup.mouse.wheel(0, 120);
  await sleep(450);
  const afterWheel = await countersOf(popup);
  check(tag + 'Espace passe à la suivante, Fin et Début vont aux deux bouts, la molette avance', afterSpace === '2 / 3' && atEnd === '3 / 3' && atHome === '1 / 3' && afterWheel === '2 / 3', { afterSpace, atEnd, atHome, afterWheel });
  await popup.mouse.move(260, 220, { steps: 3 });
  await sleep(250);
  w = await shownIn(popup);
  await popup.click('.pp-slide-show-next');
  await sleep(250);
  const viaNext = await countersOf(popup);
  await popup.click('.pp-slide-show-prev');
  await sleep(250);
  const viaPrev = await countersOf(popup);
  check(tag + 'la souris qui bouge montre la barre du bas ; ses boutons suivante et précédente marchent', w.barOpacity === '1' && viaNext === '3 / 3' && viaPrev === '2 / 3', { bar: w.barOpacity, viaNext, viaPrev });

  // --- Le document de l'app n'a pas bougé pendant ce temps.
  const sameDoc = await app.evaluate(() => Editor.getHTML());
  check(tag + 'pendant le diaporama de la fenêtre : le texte de l’app n’a pas changé et rien n’est enregistré', sameDoc === htmlBefore && (await saves(app)) === savesBefore, { same: sameDoc === htmlBefore, saves: [savesBefore, await saves(app)] });

  // --- L'app sait où en est la fenêtre ; Échap la ferme.
  const linkOpen = await app.evaluate(() => SlideWindow.state());
  await closing(popup.keyboard.press('Escape'));
  const closedByEsc = await closedWithin(popup, 4000);
  await sleep(2600);
  const linkAfter = await app.evaluate(() => SlideWindow.state());
  check(tag + 'Échap ferme la fenêtre ; l’app le voit et libère le rendu qu’elle gardait', linkOpen && linkOpen.open && linkOpen.ready && linkOpen.delivered && closedByEsc && linkAfter === null, { linkOpen, closedByEsc, linkAfter });

  // --- ▶ de nouveau pendant qu'une fenêtre est ouverte : elle est remplacée, jamais empilée.
  const second = await playAndCatch(A, a);
  if (second) await waitCounter(second);
  await sleep(600);
  let sw = second ? await shownIn(second) : null;
  check(tag + 'rouvert après la fermeture : une nouvelle fenêtre, à la diapositive du curseur', !!second && sw.counter === '2 / 3' && context.pages().length === 2, { counter: sw && sw.counter, pages: context.pages().length });
  await cursorIn(a, 2);
  const replaced = A.page.waitForEvent('popup', { timeout: 4000 }).then(() => true).catch(() => false);
  await a.click('.pp-slide-show-open', 0, 150);
  const stacked = await replaced;
  if (second) { await second.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && c.textContent === '3 / 3'; }, null, { timeout: 20000 }).catch(() => {}); }
  await sleep(500);
  sw = second && !second.isClosed() ? await shownIn(second) : null;
  check(tag + '▶ pendant que la fenêtre est ouverte la remplace (même fenêtre, la diapositive du nouveau curseur) au lieu d’en empiler une deuxième', !stacked && context.pages().length === 2 && !!sw && sw.counter === '3 / 3', { stacked, pages: context.pages().length, counter: sw && sw.counter });
  // Une page rechargée redemande son rendu.
  if (second && !second.isClosed()) {
    await second.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await waitCounter(second);
    await sleep(500);
    sw = await shownIn(second);
    check(tag + 'la fenêtre rechargée (F5 dans la fenêtre) redemande son rendu à l’app et le rejoue', sw.counter === '3 / 3' && sw.visible === 'Cible trois', { counter: sw.counter, visible: sw.visible });
    // Un message qui ne vient pas de la fenêtre qu'elle a ouverte ne fait rien à l'app : elle ne renvoie ni textes ni rendu.
    await second.evaluate(() => { window.__heard = []; window.addEventListener('message', (e) => { if (e.data && typeof e.data.type === 'string' && e.data.type.indexOf('pp-present-') === 0) window.__heard.push(e.data.type); }); });
    await app.evaluate(() => window.postMessage({ type: 'pp-present-ready' }, '*'));
    await sleep(600);
    const heard = await second.evaluate(() => window.__heard);
    check(tag + 'un « prête » qui ne vient pas de la fenêtre de l’app (de la page elle-même) est ignoré : rien n’est renvoyé', heard.length === 0, heard);
    // Fin du diaporama : l'écran de fin, puis une touche ferme la fenêtre.
    await second.mouse.click(350, 200);
    await sleep(400);
    await second.keyboard.press('End');
    await sleep(250);
    await second.keyboard.press('ArrowRight');
    await sleep(400);
    sw = await shownIn(second);
    check(tag + 'après la dernière : l’écran de fin', sw.end === T.end, sw.end);
    await closing(second.keyboard.press('x'));
    const closedByEnd = await closedWithin(second, 4000);
    check(tag + 'une touche depuis l’écran de fin ferme la fenêtre', closedByEnd, closedByEnd);
  }

  // --- « Quitter », à la souris.
  const third = await playAndCatch(A, a);
  if (third) {
    await waitCounter(third);
    await sleep(300);
    await third.mouse.click(350, 200);
    await sleep(300);
    await third.mouse.move(300, 250, { steps: 3 });
    await sleep(250);
    await closing(third.click('.pp-slide-show-exit'));
    check(tag + '« Quitter » (vraie souris) ferme la fenêtre', await closedWithin(third, 4000), null);
  } else check(tag + '« Quitter » (vraie souris) ferme la fenêtre', false, 'pas de fenêtre');

  // --- Une image d'un autre site : la question d'abord ; Annuler n'ouvre rien, Continuer ouvre la fenêtre (le geste est celui du bouton).
  await open(A, 9, 2);
  const cancelled = await playAndCatch(A, a, 2500);
  const asked = await app.evaluate(() => { const modal = document.getElementById('pp-dialog-modal'); return !!modal && getComputedStyle(modal).display !== 'none' ? (modal.textContent || '') : ''; });
  await page.keyboard.press('Escape');
  await sleep(700);
  check(tag + 'une image d’un autre site : la question précède la fenêtre (et nomme le site) ; Annuler n’ouvre rien', !cancelled && /pp-window\.test/.test(asked) && context.pages().length === 1, { opened: !!cancelled, asked: asked.slice(0, 120), pages: context.pages().length });
  const confirmed = A.page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
  await a.click('.pp-slide-show-open', 0, 900);
  await a.click('#pp-dialog-modal .var-modal-primary', 0, 200);
  const afterAsk = await confirmed;
  check(tag + 'Continuer ouvre la fenêtre (la fenêtre s’ouvre dans le geste du bouton, après la question)', !!afterAsk, null);
  if (afterAsk) {
    await waitCounter(afterAsk);
    await sleep(800);
    const image = await afterAsk.evaluate(() => {
      const host = document.getElementById('pp-slide-show-stage');
      const img = host && host.shadowRoot ? host.shadowRoot.querySelector('img[src*="pp-window.test"]') : null;
      return img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 } : null;
    });
    check(tag + 'l’image de l’autre site y est, chargée', !!image && image.loaded, image);
    await closing(afterAsk.keyboard.press('Escape'));
    await closedWithin(afterAsk, 3000);
  }

  // --- Un rendu qui échoue : la fenêtre se ferme et l'app le dit ; le lancement suivant n'est pas bloqué.
  await open(A, 8, 3);
  await app.evaluate(() => { window.__stage = PrintExport.stage; PrintExport.stage = () => Promise.reject(new Error('boum')); });
  const broken = await playAndCatch(A, a);
  const brokenClosed = broken ? await closedWithin(broken, 6000) : false;
  await sleep(300);
  const said = await app.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
  check(tag + 'un rendu qui échoue : la fenêtre se ferme et l’app le dit', !!broken && brokenClosed && said.indexOf(T.failed('boum')) !== -1, { opened: !!broken, closed: brokenClosed, said });
  await app.evaluate(() => { PrintExport.stage = window.__stage; });
  const again = await playAndCatch(A, a);
  if (again) {
    await waitCounter(again);
    check(tag + 'le lancement suivant n’est pas bloqué par l’échec', (await countersOf(again)) !== '', await countersOf(again));
    await closing(again.keyboard.press('Escape'));
    await closedWithin(again, 3000);
  } else check(tag + 'le lancement suivant n’est pas bloqué par l’échec', false, 'pas de fenêtre');

  // --- Le délai du geste, avec le VRAI bloqueur de fenêtres du navigateur (`popupBlocker` : Chromium n'ouvre une fenêtre que pendant environ 5 s après un clic ou une touche). Un rendu long ne retarde donc rien : la fenêtre
  // s'ouvre d'abord, le rendu la suit. Et une attente de plus de 5 s avant l'ouverture la fait refuser : le diaporama prend alors le panneau, avec la ligne qui le dit, et le lancement suivant n'en garde rien. Rien n'est
  // évalué dans la page entre le clic et l'attente : l'`evaluate` de Playwright compte lui-même pour un geste et renouvellerait le délai.
  if (lang === 'fr') {
    await open(A, 8, 3);
    await app.evaluate(() => { window.__stage = PrintExport.stage; PrintExport.stage = async (...args) => { await new Promise(resolve => setTimeout(resolve, 6500)); return window.__stage.apply(PrintExport, args); }; });
    const early = await playAndCatch(A, a, 3000);
    check(tag + 'un rendu de 6,5 s : la fenêtre s’ouvre tout de suite, avant le rendu (bloqueur de fenêtres allumé)', !!early, null);
    if (early) {
      await waitCounter(early, 30000);
      const slow = await shownIn(early);
      check(tag + 'le rendu lent arrive ensuite dans la fenêtre déjà ouverte', slow.counter !== '' && slow.visible !== '', { counter: slow.counter, visible: slow.visible });
      await closing(early.keyboard.press('Escape'));
      await closedWithin(early, 3000);
    }
    await app.evaluate(() => { PrintExport.stage = window.__stage; });
    await app.evaluate(() => { window.__confirm = ExternalImages.confirmExport; ExternalImages.confirmExport = async (...args) => { await new Promise(resolve => setTimeout(resolve, 6500)); return window.__confirm(...args); }; });
    const late = await playAndCatch(A, a, 9500);
    const lateState = await shownIn(app);
    check(tag + 'une attente de 6,5 s avant l’ouverture : le navigateur refuse la fenêtre, le diaporama prend le panneau avec la ligne qui le dit', !late && lateState.show && lateState.note === T.blocked && context.pages().length === 1, { opened: !!late, show: lateState.show, note: lateState.note, pages: context.pages().length });
    await page.keyboard.press('Escape');
    await sleep(700);
    await app.evaluate(() => { ExternalImages.confirmExport = window.__confirm; });
    const after = await playAndCatch(A, a);
    check(tag + 'le lancement suivant, sans attente, ouvre la fenêtre', !!after, null);
    if (after) {
      await waitCounter(after);
      await closing(after.keyboard.press('Escape'));
      await closedWithin(after, 3000);
    }
  }

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  check(tag + 'aucune erreur de page dans la fenêtre', errors.length === 0, errors);
  await A.context.close();
}

// --- La page ouverte seule, ou par un autre que l'app ; du HTML piégé.
async function standalone() {
  const tag = '[sûreté] ';
  const context = await t.browser.newContext({ viewport: { width: 700, height: 400 } });
  const url = `${t.base}/extensions/diapositives/present.html?v=${VERSION}`;
  const lone = await context.newPage();
  const errors = [];
  lone.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  await lone.goto(url, { waitUntil: 'load' });
  await sleep(3600);
  const alone = await shownIn(lone);
  check(tag + 'ouverte seule, la page dit d’où elle s’ouvre (au bout de trois secondes) et ne joue rien', !alone.show && !!alone.wait && alone.wait.opacity === '1' && /Publipostage\+/.test(alone.wait.text) && !alone.opener, alone);
  await lone.evaluate(() => window.postMessage({ type: 'pp-present-info', info: { lang: 'en', theme: 'dark', title: 'X', labels: { label: 'x', preparing: 'x', end: 'x', prev: 'x', next: 'x', exit: 'x', counter: '{n}/{total}', hint: 'x', closed: 'x', failed: 'x' } } }, '*'));
  await sleep(400);
  const own = await shownIn(lone);
  check(tag + 'un message qui ne vient pas de son ouvreur (ici d’elle-même) est ignoré : rien ne se monte', !own.show && !!own.wait && own.title !== 'X', own);

  // Une page « ouvreur » qui n’est pas l’app (autre origine) envoie à present.html du HTML piégé : il ne s’exécute pas, et la politique de la page refuse le reste.
  const opener = await context.newPage();
  await opener.goto('about:blank');
  const popupP = opener.waitForEvent('popup', { timeout: 15000 });
  await opener.evaluate(address => { window.__pop = window.open(address, 'pp-hostile'); }, url);
  const pop = await popupP;
  const popErrors = [];
  pop.on('pageerror', e => popErrors.push(String(e.message).slice(0, 200)));
  await pop.waitForLoadState('domcontentloaded');
  await pop.evaluate(() => { window.__violations = []; document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.violatedDirective)); });
  const labels = { label: 'Diaporama', preparing: 'Préparation', end: 'Fin', prev: 'Précédente', next: 'Suivante', exit: 'Quitter', counter: '{n} / {total}', hint: 'indice', closed: 'fermé', failed: 'échec {message}' };
  await opener.evaluate((l) => { window.__pop.postMessage({ type: 'pp-present-info', info: { lang: 'fr', theme: 'light', title: 'Piégé', labels: l } }, '*'); }, labels);
  await sleep(500);
  const trap = '<script>window.__pwned = 1<\/script><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="window.__pwned = 2" onload="window.__pwned = 3">'
    + '<a id="evil-a" href="java\tscript:window.__pwned = 4">lien</a><a id="evil-b" href=" JavaScript:window.__pwned = 5">lien</a><iframe src="javascript:window.__pwned = 6"></iframe><object data="x"></object><embed src="x">'
    + '<form id="evil-form" action="https://pp-window.test/"><button formaction="javascript:window.__pwned = 7">go</button></form><base href="https://pp-window.test/"><meta http-equiv="refresh" content="0;url=https://pp-window.test/">'
    + '<link rel="stylesheet" href="https://pp-window.test/x.css"><svg><a xlink:href="javascript:window.__pwned = 8"><text y="10">svg</text></a></svg><div id="evil-div" onclick="window.__pwned = 9" style="width:10px;height:10px">y</div><p id="fine">reste</p>';
  const scope = `<div class="pp-print-scope"><div id="reader-container"><div class="reader-content">${trap}</div></div></div>`;
  await opener.evaluate(([html]) => {
    window.__pop.postMessage({ type: 'pp-present-show', payload: { v: 1, sheets: [{ id: 'own', text: '.pp-print-scope{color:#000}' }, { href: 'javascript:window.__pwned = 10' }, { href: 'data:text/css,*{}' }], scope: html, vars: { '--pp-page-width': '800px', 'color': 'red', '--evil': '1' }, hostClass: 'pp-print-host', hostWidth: '800px', windows: [{ page: 0, top: 0, height: 100 }], pagePx: { w: 800, h: 450 }, sheetLeft: 0, props: [{}], timings: [{}], starts: [0], startPage: 0, fromCurrent: false } }, '*');
  }, [scope]);
  await sleep(1500);
  const safe = await pop.evaluate(() => {
    const host = document.getElementById('pp-slide-show-stage');
    const shadow = host ? host.shadowRoot : null;
    const all = shadow ? Array.from(shadow.querySelectorAll('*')) : [];
    return {
      pwned: window.__pwned === undefined, host: !!host,
      forbidden: all.filter(n => /^(script|iframe|object|embed|base|meta|link|form|frame|frameset|applet|noscript|portal)$/i.test(n.tagName)).map(n => n.tagName),
      handlers: all.filter(n => Array.from(n.attributes).some(at => /^on/i.test(at.name))).map(n => n.tagName),
      addresses: all.filter(n => Array.from(n.attributes).some(at => /^(href|src|xlink:href|action|formaction|data)$/i.test(at.name) && /^(javascript|vbscript)/i.test(at.value.replace(/[\u0000- ]+/g, '')))).map(n => n.tagName),
      fine: !!(shadow && shadow.getElementById('fine')), headLinks: Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map(l => l.getAttribute('href')).filter(h => /^(javascript|data):/i.test(h)),
      rootVars: { evil: document.documentElement.style.getPropertyValue('--evil'), color: document.documentElement.style.color, width: document.documentElement.style.getPropertyValue('--pp-page-width') },
      baseHref: document.baseURI,
    };
  });
  check(tag + 'du HTML piégé reçu en message ne s’exécute pas : aucun des dix scripts, gestionnaires et adresses n’a tourné', safe.pwned, safe);
  check(tag + 'les balises et attributs qui s’exécuteraient sont retirés du rendu (script, cadre, objet, formulaire, base, meta, lien, gestionnaire on…, adresse javascript:), le texte reste', safe.forbidden.length === 0 && safe.handlers.length === 0 && safe.addresses.length === 0 && safe.fine, safe);
  check(tag + 'seules les variables « --pp- » passent, seules les feuilles de style de sites web (http, https) sont reprises', safe.rootVars.evil === '' && safe.rootVars.color === '' && safe.rootVars.width === '800px' && safe.headLinks.length === 0 && safe.baseHref.indexOf('pp-window.test') === -1, safe);
  // La politique de la page : script en ligne, gestionnaire en ligne et eval refusés pour de bon. L'eval part d'une minuterie de la page : une évaluation lancée par le banc d'essai passe outre la politique.
  const csp = await pop.evaluate(() => {
    const out = { inline: window.__csp, handler: undefined };
    const script = document.createElement('script');
    script.textContent = 'window.__csp = 1';
    document.body.appendChild(script);
    out.inline = window.__csp;
    document.body.insertAdjacentHTML('beforeend', '<button id="pp-probe" onclick="window.__csp2 = 1">x</button>');
    setTimeout(() => { document.getElementById('pp-probe').click(); }, 0);
    setTimeout(() => { try { (0, eval)('window.__csp3 = 1'); window.__evaluated = 'ran'; } catch (e) { window.__evaluated = 'refused'; } }, 0);
    return out;
  });
  await sleep(700);
  const after = await pop.evaluate(() => ({ handler: window.__csp2, evaluated: window.__evaluated, directives: window.__violations.slice() }));
  check(tag + 'la politique de la page refuse le script en ligne, ses gestionnaires et eval (défense en plus du nettoyage)',
    csp.inline === undefined && after.handler === undefined && after.evaluated === 'refused' && ['script-src-elem', 'script-src-attr', 'script-src'].every(d => after.directives.indexOf(d) !== -1), { csp, after });
  check(tag + 'aucune erreur de page pendant ces essais', errors.length === 0 && popErrors.length === 0, { errors, popErrors });
  await context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await standalone();
await t.finish();
