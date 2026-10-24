#!/usr/bin/env node
// « Présenter », le diaporama d'une présentation (extensions/diapositives/slide-show.js ; demande du 21/10, carte « Près du zoom »), à la vraie souris et au vrai clavier, 700x400,
// français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS (sans `allow-same-origin`, qui refuse aussi le plein écran : le diaporama
// s'ouvre alors dans une fenêtre à part, que le navigateur de l'essai refuse - `popups` faux, comme un bloqueur de fenêtres - : il se joue donc dans le panneau, avec la ligne qui le dit ;
// la fenêtre pour de bon est dans verify-slides-window.mjs), l'extension « diapositives » active, « Cible » à l'écran (trois diapositives, une variable, une forme « Devant le texte » sur la troisième).
//  LE BOUTON : ▶ à gauche de la pastille du zoom, sur sa ligne, sans la recouvrir ni recouvrir la page de la diapositive ; il la suit quand elle s'ouvre au survol ; son info-bulle dit la
//   diapositive du curseur. Rien ne bouge dans la barre d'outils. La pastille arrivée après lui (présentation ouverte au démarrage, demande du 21/10 : « le bouton play peut revenir
//   avec le zoom ») : il attend, invisible, puis se pose à sa gauche.
//  DÉPART : F5 part de la première diapositive, le bouton et Maj+F5 de celle du curseur. Le diaporama couvre tout le panneau, fond noir, la diapositive au centre, entière, aussi grande
//   que le panneau le permet (16:9) ; la variable y est remplie avec la ligne choisie, la forme est sur sa diapositive ; ni « Saut de page », ni bande, ni barre d'outils.
//  PASSER : → Espace Entrée Page suivante, un clic, la molette avancent ; ← Page précédente reculent ; Début et Fin ; après la dernière, l'écran de fin, et une touche quitte. La souris
//   qui bouge montre la barre du bas (précédente, numéro, suivante, quitter), cachée sinon ; ses boutons marchent à la souris.
//  SORTIR : Échap, ou « Quitter » ; le rendu est retiré, le clavier revient où il était, le texte n'a pas changé et rien n'est enregistré.
//  LE MENU ▾ (demande du 22/10, « plein écran au lancement » et « partir du début ou de la diapositive actuelle ») : un petit bouton à gauche du ▶ (le ▶ reste contre la pastille et lance,
//   d'un clic, depuis la diapositive du curseur) ouvre « À partir de la diapositive N », « Depuis le début » et l'interrupteur « Plein écran ». Les deux départs lancent depuis la
//   diapositive du curseur et depuis la première ; l'interrupteur, coché au départ, décide de la demande de plein écran faite au navigateur (comptée ici sur un `requestFullscreen`
//   espion) pour le ▶, F5 et Maj+F5 ; dans un cadre qui ne le permet pas, il n'est jamais grisé : coché, il demande la fenêtre à part (comptée sur un `window.open` espion ; refusée, le diaporama
//   prend le panneau avec une ligne qui le dit), décoché il garde le panneau sans rien demander. Clavier : Entrée ouvre, ↓ ↑ circulent, Échap referme et rend le clavier à ▾ ; un appui à côté referme.
//  EXTENSION ÉTEINTE EN DIRECT : le bouton est grisé avec sa raison, son clic, celui de ▾ et F5 demandent à GFS d'installer « diapositives » et ne lancent rien.
// Lancé par run-headless.mjs (groupe Node "slidesShow", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-show.mjs
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-show', port: Number(process.env.SLIDES_SHOW_PORT || 8939) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const CHIP = '<span class="var-badge" data-table="PpDepart" data-column="Nom" data-key="PpDepart.Nom"></span>';
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const SHAPE = `<img class="editor-image" src="${FRONT}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: 5" data-layer="front" data-wrap="inline" data-page-index="2" data-page-left-pt="40" data-page-top-pt="30">`;
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(8, 'Cible', '<h1>Bonjour ${CHIP}</h1><p>Cible un</p>${BR}<h2>Deux</h2><p>Cible deux</p>${BR}<p>Cible trois</p><p>${SHAPE}</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;
const TEXTS = {
  fr: {
    tip: n => `Présenter à partir de la diapositive ${n} (Maj+F5) ; depuis le début : F5`, end: 'Fin du diaporama. Un clic ou une touche pour quitter.', exit: 'Quitter le diaporama (Échap)',
    more: 'Autres façons de présenter : depuis le début, plein écran', current: n => `À partir de la diapositive ${n} (Maj+F5)`, begin: 'Depuis le début (F5)', fullscreen: 'Plein écran',
    fullscreenWindow: 'Ce cadre ne le permet pas : le diaporama s’ouvre dans une fenêtre à part, où un clic ou une touche donne le plein écran.', blocked: 'Le navigateur a bloqué la fenêtre du diaporama : il s’affiche dans le panneau.',
  },
  en: {
    tip: n => `Present from slide ${n} (Shift+F5); from the beginning: F5`, end: 'End of slide show. Click or press a key to exit.', exit: 'Exit the slide show (Esc)',
    more: 'Other ways to present: from the beginning, full screen', current: n => `From slide ${n} (Shift+F5)`, begin: 'From the beginning (F5)', fullscreen: 'Full screen',
    fullscreenWindow: 'This frame does not allow it: the slide show opens in a separate window, where a click or a key press gives full screen.', blocked: 'The browser blocked the slide show window: it is shown in the panel.',
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
  const clickAt = async (x, y, settle = 250) => { const c = await inPage({ x, y }); await reach(c); await page.mouse.click(c.x, c.y); await sleep(settle); };
  const moveAt = async (x, y) => { const c = await inPage({ x, y }); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(120); };
  const wheelAt = async (x, y, dy) => { const c = await inPage({ x, y }); await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, dy); await sleep(150); };
  const press = async (key, settle = 200) => { await page.keyboard.press(key); await sleep(settle); };
  return { click, clickAt, moveAt, wheelAt, press, inPage };
}

// Ce que l'écran montre : le bouton, la pastille, la page de l'éditeur ; le diaporama (sa boîte, la page montrée et sa boîte à l'écran, le compteur, la barre, l'écran de fin, ce que la
// page montrée laisse voir du texte, qu'on voit).
function state(app) {
  return app.evaluate(() => {
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const button = document.querySelector('.pp-slide-show-open');
    const show = document.querySelector('.pp-slide-show');
    const host = document.getElementById('pp-slide-show-stage');
    const scope = host && host.shadowRoot ? host.shadowRoot.querySelector('.pp-print-scope') : null;
    // La page montrée est dans le calque vivant (sa copie figée, pendant une transition, est un autre calque).
    const layer = scope ? scope.querySelector(':scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)') : null;
    const frame = layer ? layer.firstElementChild : null;
    const view = frame ? frame.firstElementChild : null;
    // Le texte que la fenêtre de la page laisse voir : les lignes dont la boîte tombe dans la fenêtre à l'écran.
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
        // Le texte qu'on ne voit pas (le « Saut de page » du repère, écrit en transparent par la Lecture) n'est pas montré.
        const cs = getComputedStyle(n.parentElement);
        if (cs.visibility === 'hidden' || /^transparent$|^rgba\(.*,\s*0\)$/.test(cs.color)) continue;
        range.selectNodeContents(n);
        if (Array.from(range.getClientRects()).some(inBox)) parts.push(n.nodeValue.trim());
      }
      visible = parts.join(' ');
      shapeShown = Array.from(view.querySelectorAll('img[data-layer="front"]')).some(img => inBox(img.getBoundingClientRect()));
    }
    const editor = document.querySelector('#editor-container .tiptap');
    return {
      button: button ? { hidden: button.hidden, rect: rect(button), title: button.title, disabled: button.getAttribute('aria-disabled') } : null,
      more: (m => (m ? { hidden: m.hidden, rect: rect(m), title: m.title, disabled: m.getAttribute('aria-disabled'), popup: m.getAttribute('aria-haspopup'), expanded: m.getAttribute('aria-expanded') } : null))(document.querySelector('.pp-slide-show-more')),
      pill: rect(document.getElementById('pp-page-zoom')),
      sheet: rect(document.querySelector('#editor-container .v2-page-sheet')),
      show: show ? {
        rect: rect(show), bg: getComputedStyle(show).backgroundColor, frame: rect(frame), view: rect(view), visible, shapeShown,
        counter: (show.querySelector('.pp-slide-show-counter') || {}).textContent || '', barOpacity: getComputedStyle(show.querySelector('.pp-slide-show-bar')).opacity,
        end: (() => { const e = show.querySelector('.pp-slide-show-end'); return e && !e.hidden ? e.textContent : null; })(),
        note: (() => { const e = show.querySelector('.pp-slide-show-note'); return e && !e.hidden ? e.textContent : null; })(),
        preparing: (() => { const e = show.querySelector('.pp-slide-show-card:not(.pp-slide-show-end)'); return !!e && !e.hidden; })(),
        frameHidden: frame ? frame.style.visibility === 'hidden' : true,
      } : null,
      host: !!host,
      html: window.Editor ? Editor.getHTML() : '',
      focus: document.activeElement === document.body ? 'body' : (document.activeElement && document.activeElement.closest('.tiptap') ? 'editor' : (document.activeElement && document.activeElement.className) || ''),
      editorText: editor ? editor.textContent.slice(0, 40) : '',
    };
  });
}
// Le menu de ▾ : ouvert ou non, sa boîte, ses trois lignes (texte, coché, grisé), la raison sous l'interrupteur, la ligne qui a le clavier.
const menuState = app => app.evaluate(() => {
  const menu = document.querySelector('.pp-show-menu');
  const open = !!menu && menu.classList.contains('visible') && getComputedStyle(menu).display !== 'none';
  const r = menu ? menu.getBoundingClientRect() : null;
  const items = menu ? Array.from(menu.querySelectorAll('[data-action]')).map(b => ({
    action: b.dataset.action, role: b.getAttribute('role'), text: (b.querySelector('.pp-show-menu-name') || b).textContent, checked: b.getAttribute('aria-checked'), disabled: b.getAttribute('aria-disabled'),
    note: (n => (n && !n.hidden && getComputedStyle(n).display !== 'none' ? n.textContent : ''))(b.querySelector('.pp-show-menu-note')),
  })) : [];
  const active = document.activeElement;
  return { open, rect: r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, items, active: active ? (active.dataset && active.dataset.action) || active.className || active.tagName : '' };
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
const shown = app => app.waitForFunction(() => { const s = document.querySelector('.pp-slide-show'); const c = s && s.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 15000 }).catch(() => {});
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
// Les pixels d'une capture qui ne sont pas du blanc, dans le rectangle `rect` ({ x, y, width, height } de la page) : ce que la capture montre là (la capture est lue dans la page).
async function inkIn(page, rect) {
  const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
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
  }, [b64, rect]);
}

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { page, app } = A;
  const a = toolsOf(A);
  // La pastille du zoom arrive après le bouton (une présentation ouverte au démarrage s'affiche avant que la pastille soit construite) : le bouton attend, invisible, puis se pose à
  // sa gauche, jamais au coin haut gauche du panneau.
  await app.evaluate(() => { window.__ppPill = document.getElementById('pp-page-zoom'); window.__ppPill.remove(); });
  await open(A, 8, 3);
  const early = await app.evaluate(() => { const b = document.querySelector('.pp-slide-show-open'); return { built: !!b, shown: !!b && !b.hidden && getComputedStyle(b).visibility !== 'hidden' }; });
  await app.evaluate(() => document.body.appendChild(window.__ppPill));
  await sleep(400);
  const late = await state(app);
  check(tag + 'la pastille du zoom arrivée après le bouton : le bouton attend, invisible, puis se pose à sa gauche, sur sa ligne (jamais au coin haut gauche)',
    early.built && !early.shown && !!late.button && !late.button.hidden && late.button.rect.right <= late.pill.left && late.pill.left - late.button.rect.right <= 6 && near(late.button.rect.bottom, late.pill.bottom),
    { early, button: late.button && late.button.rect, pill: late.pill });
  // Le curseur dans la diapositive 2 : un clic sur sa miniature.
  await a.click('.pp-slide-strip .pp-slide-item', 1, 600);
  await a.click('.pp-slide-strip .pp-slide-item', 1, 600);
  const savesBefore = await saves(app);
  let s = await state(app);
  const htmlBefore = s.html;
  check(tag + 'le bouton ▶ est à gauche de la pastille du zoom, sur sa ligne, sans la recouvrir, et son info-bulle dit la diapositive du curseur (2)',
    !!s.button && !s.button.hidden && s.button.rect.right <= s.pill.left && s.pill.left - s.button.rect.right <= 6 && near(s.button.rect.bottom, s.pill.bottom) && s.button.title === T.tip(2)
      && (await contrastOf(app, '.pp-slide-show-open')) >= 3, { button: s.button, pill: s.pill });
  check(tag + 'le petit bouton ▾ est à gauche du ▶, sur sa ligne, sans le recouvrir, avec son info-bulle, et annonce un menu',
    !!s.more && !s.more.hidden && s.more.rect.right <= s.button.rect.left && s.button.rect.left - s.more.rect.right <= 4 && near(s.more.rect.bottom, s.button.rect.bottom) && s.more.title === T.more
      && s.more.popup === 'menu' && s.more.expanded === 'false' && s.more.rect.width >= 16 && (await contrastOf(app, '.pp-slide-show-more')) >= 3, { more: s.more, button: s.button && s.button.rect });
  // La pastille s'ouvre au survol, vers la gauche : le bouton la suit.
  const pillCenter = { x: (s.pill.left + s.pill.right) / 2, y: (s.pill.top + s.pill.bottom) / 2 };
  await a.moveAt(pillCenter.x, pillCenter.y);
  await sleep(300);
  s = await state(app);
  check(tag + 'la pastille ouverte au survol : le bouton reste à sa gauche, sans la recouvrir', s.pill.width > 60 && s.button.rect.right <= s.pill.left && s.pill.left - s.button.rect.right <= 6, { button: s.button.rect, pill: s.pill });
  await a.moveAt(300, 250);

  // --- Le bouton : depuis la diapositive du curseur.
  await a.click('.pp-slide-show-open', 0, 300);
  await shown(app);
  await sleep(300);
  s = await state(app);
  const r = s.show && s.show.frame;
  const fits = !!r && (near(r.width, 700) || near(r.height, 400)) && r.width <= 701 && r.height <= 401 && near(r.width / r.height, 16 / 9, 0.02)
    && near(r.left + r.width / 2, 350) && near(r.top + r.height / 2, 200);
  check(tag + 'le bouton lance le diaporama depuis la diapositive du curseur : tout le panneau, fond noir, la diapositive entière au centre, aussi grande que le panneau le permet',
    !!s.show && s.show.counter === '2 / 3' && near(s.show.rect.width, 700) && near(s.show.rect.height, 400) && s.show.bg === 'rgb(0, 0, 0)' && fits && !s.show.preparing,
    { show: s.show && { counter: s.show.counter, rect: s.show.rect, frame: s.show.frame, bg: s.show.bg } });
  check(tag + 'elle montre son texte, rien de la diapositive d’avant ni d’après, ni « Saut de page »', s.show.visible === 'Deux Cible deux', s.show.visible);
  await a.press('ArrowRight');
  s = await state(app);
  check(tag + '→ : la diapositive 3, sa forme « Devant le texte » posée sur elle', s.show.counter === '3 / 3' && s.show.visible === 'Cible trois' && s.show.shapeShown, { counter: s.show.counter, visible: s.show.visible, shape: s.show.shapeShown });
  await a.press('ArrowLeft');
  await a.press('ArrowLeft');
  s = await state(app);
  check(tag + '← ← : la première, la variable remplie avec la ligne choisie', s.show.counter === '1 / 3' && s.show.visible === 'Bonjour Alice Cible un', { counter: s.show.counter, visible: s.show.visible });
  check(tag + 'la barre du bas est cachée tant que la souris ne bouge pas', s.show.barOpacity === '0', s.show.barOpacity);
  await a.press(' ');
  s = await state(app);
  const afterSpace = s.show.counter;
  await a.clickAt(350, 200);
  s = await state(app);
  const afterClick = s.show.counter;
  await a.wheelAt(350, 200, -120);
  s = await state(app);
  check(tag + 'Espace et un clic avancent, la molette vers le haut recule', afterSpace === '2 / 3' && afterClick === '3 / 3' && s.show.counter === '2 / 3', { afterSpace, afterClick, wheel: s.show.counter });
  await a.press('End');
  const atEnd = (await state(app)).show.counter;
  await a.press('Home');
  const atHome = (await state(app)).show.counter;
  check(tag + 'Fin et Début : la dernière et la première', atEnd === '3 / 3' && atHome === '1 / 3', { atEnd, atHome });
  // La souris bouge : la barre se montre ; ses boutons.
  await a.moveAt(200, 200);
  await a.moveAt(220, 210);
  s = await state(app);
  check(tag + 'la souris qui bouge montre la barre du bas', s.show.barOpacity === '1', s.show.barOpacity);
  await a.click('.pp-slide-show-next', 0, 250);
  const viaNext = (await state(app)).show.counter;
  await a.click('.pp-slide-show-prev', 0, 250);
  const viaPrev = (await state(app)).show.counter;
  check(tag + 'les boutons de la barre : suivante, précédente', viaNext === '2 / 3' && viaPrev === '1 / 3', { viaNext, viaPrev });
  await a.press('End');
  await a.press('ArrowRight');
  s = await state(app);
  check(tag + 'après la dernière : l’écran de fin, sans diapositive', s.show && s.show.end === T.end && s.show.frameHidden, { end: s.show && s.show.end });
  await a.press('ArrowLeft');
  s = await state(app);
  const back = s.show && s.show.counter;
  await a.press('ArrowRight');
  await a.press('x', 400);
  s = await state(app);
  check(tag + '← depuis l’écran de fin ramène la dernière ; une touche quitte depuis l’écran de fin', back === '3 / 3' && !s.show && !s.host, { back, show: !!s.show });

  // --- F5 : depuis la première ; Échap quitte.
  await a.press('F5', 300);
  await shown(app);
  await sleep(200);
  s = await state(app);
  const viaF5 = s.show && s.show.counter;
  await a.press('Escape', 400);
  s = await state(app);
  check(tag + 'F5 lance depuis la première diapositive, Échap quitte : le rendu est retiré', viaF5 === '1 / 3' && !s.show && !s.host, { viaF5, show: !!s.show, host: s.host });
  await a.press('Shift+F5', 300);
  await shown(app);
  await sleep(200);
  s = await state(app);
  const viaShiftF5 = s.show && s.show.counter;
  await a.moveAt(200, 200);
  await a.click('.pp-slide-show-exit', 0, 400);
  s = await state(app);
  check(tag + 'Maj+F5 lance depuis la diapositive du curseur, « Quitter » ferme', viaShiftF5 === '2 / 3' && !s.show && !s.host, { viaShiftF5, show: !!s.show });
  const savesAfter = await saves(app);
  check(tag + 'après le diaporama : le texte n’a pas changé, rien n’est enregistré, le clavier est revenu au document', s.html === htmlBefore && savesAfter === savesBefore && s.focus === 'editor',
    { same: s.html === htmlBefore, saves: [savesBefore, savesAfter], focus: s.focus });

  // --- Le menu ▾ : deux départs et l'interrupteur « Plein écran ». Un `requestFullscreen` espion compte ce qu'on demande au navigateur ; `fullscreenEnabled` dit ce que le cadre permet
  // (le cadre isolé de GFS ne le permet pas : c'est l'état de départ, vérifié avant qu'on le force).
  await app.evaluate(() => {
    window.__fs = { asked: 0 };
    Element.prototype.requestFullscreen = function () { window.__fs.asked++; return Promise.resolve(); };
    // Les fenêtres que l'app demande (le navigateur de l'essai refuse celle du diaporama : `popups` faux), comptées au passage.
    const was = window.open;
    window.__opens = [];
    window.open = function (url) { window.__opens.push(String(url)); return was.apply(this, arguments); };
  });
  const frameAllows = await app.evaluate(() => document.fullscreenEnabled);
  const allow = value => app.evaluate(v => { Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => v }); }, value);
  const asked = () => app.evaluate(() => window.__fs.asked);
  const opens = () => app.evaluate(() => window.__opens.length);
  const startedAt = async () => { await shown(app); await sleep(250); return (await state(app)).show && (await state(app)).show.counter; };
  await allow(false);
  await a.click('.pp-slide-show-more', 0, 300);
  let m = await menuState(app);
  s = await state(app);
  const labels = m.items.map(i => i.text);
  check(tag + 'un clic sur ▾ : le menu s’ouvre au-dessus, dans le panneau, avec « À partir de la diapositive 2 », « Depuis le début » et l’interrupteur « Plein écran »',
    m.open && s.more.expanded === 'true' && m.rect.left >= 0 && m.rect.right <= 700 && m.rect.top >= 0 && m.rect.bottom <= s.more.rect.top + 1
      && labels.join('|') === [T.current(2), T.begin, T.fullscreen].join('|') && m.items[2].role === 'menuitemcheckbox', { open: m.open, rect: m.rect, labels, more: s.more });
  check(tag + 'dans un cadre qui ne permet pas le plein écran : l’interrupteur est coché et jamais grisé, avec sa ligne dessous : le diaporama s’ouvre dans une fenêtre à part',
    m.items[2].disabled === null && m.items[2].checked === 'true' && m.items[2].note === T.fullscreenWindow, m.items[2]);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  m = await menuState(app);
  const closedOff = !m.open;
  await a.click('.pp-slide-show-more', 0, 250);
  m = await menuState(app);
  check(tag + 'son clic le décoche et referme le menu ; la ligne dessous reste', closedOff && m.open && m.items[2].checked === 'false' && m.items[2].note === T.fullscreenWindow, { closedOff, item: m.items[2] });
  await a.click('.pp-show-menu [data-action="begin"]', 0, 300);
  const offBegin = await startedAt();
  s = await state(app);
  check(tag + 'décoché : le diaporama part dans le panneau sans rien demander - ni fenêtre, ni plein écran - et sans ligne de refus',
    offBegin === '1 / 3' && (await opens()) === 0 && (await asked()) === 0 && s.show.note === null, { offBegin, opens: await opens(), asked: await asked(), note: s.show && s.show.note });
  await a.press('Escape', 400);
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="begin"]', 0, 300);
  const fromBegin = await startedAt();
  m = await menuState(app);
  s = await state(app);
  check(tag + 'recoché, « Depuis le début » demande la fenêtre à part (une fois) ; le navigateur la refuse : le diaporama part dans le panneau, depuis la première diapositive (le curseur est dans la 2), avec la ligne qui dit pourquoi ; le menu se ferme, et rien n’est demandé au navigateur en plein écran',
    fromBegin === '1 / 3' && !m.open && (await opens()) === 1 && (await asked()) === 0 && s.show.note === T.blocked, { fromBegin, open: m.open, opens: await opens(), asked: await asked(), note: s.show && s.show.note });
  // La ligne est devant la page : de l'encre à sa place à l'écran (sous le rendu, qui vient après elle dans la page, elle ne se verrait pas : la page blanche est vide à cet endroit).
  const noteBox = await app.evaluate(() => { const r = document.querySelector('.pp-slide-show-note').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  const noteAt = await a.inPage({ x: noteBox.left, y: noteBox.top });
  const noteInk = await inkIn(page, { x: noteAt.x, y: noteAt.y, width: noteBox.width, height: noteBox.height });
  check(tag + 'la ligne de refus est visible : devant la page (de l’encre à sa place à l’écran), tout entière dans le panneau, lisible (4,5:1 au moins)',
    noteInk > 60 && noteBox.left >= 0 && noteBox.top >= 0 && noteBox.left + noteBox.width <= 700 && noteBox.top + noteBox.height <= 400 && (await contrastOf(app, '.pp-slide-show-note')) >= 4.5, { noteInk, noteBox });
  await a.press('Escape', 400);
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="current"]', 0, 300);
  const fromHere = await startedAt();
  check(tag + '« À partir de la diapositive 2 » lance depuis celle du curseur (et redemande la fenêtre)', fromHere === '2 / 3' && (await asked()) === 0 && (await opens()) === 2, { fromHere, asked: await asked(), opens: await opens() });
  await a.press('Escape', 400);
  // Un cadre qui le permet : l'interrupteur est coché, le plein écran est demandé une fois par lancement (le ▶, F5 et Maj+F5 comme le menu).
  await allow(true);
  await a.click('.pp-slide-show-more', 0, 250);
  m = await menuState(app);
  check(tag + 'dans un cadre qui permet le plein écran : « Plein écran » est coché au départ, sans raison dessous', m.items[2].checked === 'true' && m.items[2].disabled === null && m.items[2].note === '', m.items[2]);
  await a.click('.pp-show-menu [data-action="current"]', 0, 300);
  const fsMenu = await startedAt();
  const askedMenu = await asked();
  await a.press('Escape', 400);
  await a.click('.pp-slide-show-open', 0, 300);
  const fsButton = await startedAt();
  const askedButton = await asked();
  await a.press('Escape', 400);
  check(tag + 'coché, le plein écran est demandé au navigateur à chaque lancement : par le menu, par le ▶ - et aucune fenêtre à part (le cadre permet le plein écran, le diaporama reste dans le panneau)', fsMenu === '2 / 3' && askedMenu === 1 && fsButton === '2 / 3' && askedButton === 2 && (await opens()) === 2, { fsMenu, askedMenu, fsButton, askedButton, opens: await opens() });
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  m = await menuState(app);
  const closedByToggle = !m.open;
  await a.click('.pp-slide-show-more', 0, 250);
  m = await menuState(app);
  const unchecked = m.items[2].checked;
  await a.press('Escape', 250);
  await a.click('.pp-slide-show-open', 0, 300);
  const noFsButton = await startedAt();
  await a.press('Escape', 400);
  await a.press('F5', 300);
  const noFsF5 = await startedAt();
  await a.press('Escape', 400);
  await a.press('Shift+F5', 300);
  const noFsShiftF5 = await startedAt();
  await a.press('Escape', 400);
  check(tag + 'décoché : le menu se ferme, l’interrupteur reste décoché, et ni le ▶, ni F5, ni Maj+F5 ne demandent le plein écran - le diaporama part quand même, dans le panneau',
    closedByToggle && unchecked === 'false' && noFsButton === '2 / 3' && noFsF5 === '1 / 3' && noFsShiftF5 === '2 / 3' && (await asked()) === 2, { closedByToggle, unchecked, noFsButton, noFsF5, noFsShiftF5, asked: await asked() });
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  await a.press('F5', 300);
  const fsF5 = await startedAt();
  await a.press('Escape', 400);
  check(tag + 'recoché : F5 le demande de nouveau', fsF5 === '1 / 3' && (await asked()) === 3, { fsF5, asked: await asked() });
  // Le clavier : Entrée ouvre, ↓ circule, Échap referme et rend le clavier à ▾ ; Entrée sur une ligne la fait.
  await app.evaluate(() => document.querySelector('.pp-slide-show-more').focus());
  await a.press('Enter', 300);
  m = await menuState(app);
  const opened = m.open && m.active === 'current';
  await a.press('ArrowDown', 150);
  const second = (await menuState(app)).active;
  await a.press('Escape', 250);
  m = await menuState(app);
  s = await state(app);
  check(tag + 'au clavier : Entrée sur ▾ ouvre le menu sur sa première ligne, ↓ passe à la suivante, Échap le referme et rend le clavier à ▾',
    opened && second === 'begin' && !m.open && m.active.includes('pp-slide-show-more') && s.more.expanded === 'false', { opened, second, open: m.open, active: m.active });
  await a.press('Enter', 300);
  await a.press('ArrowDown', 150);
  await a.press('Enter', 300);
  const viaKeys = await startedAt();
  await a.press('Escape', 400);
  s = await state(app);
  m = await menuState(app);
  check(tag + 'Entrée sur « Depuis le début » le lance ; en quittant, le clavier revient à ▾', viaKeys === '1 / 3' && !s.show && !m.open && s.focus.includes('pp-slide-show-more'), { viaKeys, focus: s.focus, open: m.open });
  await a.click('.pp-slide-show-more', 0, 250);
  await a.clickAt(300, 250);
  m = await menuState(app);
  check(tag + 'un appui à côté referme le menu, sans rien lancer', !m.open && !(await state(app)).show, { open: m.open });
  await allow(frameAllows);
  await app.evaluate(() => { delete document.fullscreenEnabled; });

  // --- GFS éteint l'extension : le bouton est grisé avec sa raison, son clic et F5 demandent l'installation, rien ne se lance.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-show-open'); return !!b && b.getAttribute('aria-disabled') === 'true'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  s = await state(app);
  const reason = s.button && s.button.title;
  check(tag + 'extension éteinte : le bouton reste, grisé avec sa raison', !!s.button && !s.button.hidden && s.button.disabled === 'true' && !!reason && reason !== T.tip(2), s.button);
  check(tag + 'extension éteinte : le petit bouton ▾ reste aussi, grisé avec la même raison', !!s.more && !s.more.hidden && s.more.disabled === 'true' && s.more.title === reason, s.more);
  await a.click('.pp-slide-show-open', 0, 500);
  await a.click('.pp-slide-show-more', 0, 500);
  await a.press('F5', 500);
  const installs = await gfsCalls(page, 'installer');
  s = await state(app);
  m = await menuState(app);
  check(tag + 'son clic, celui de ▾ et F5 demandent à GFS d’installer « diapositives », et aucun diaporama ni menu ne se lance', installs.length === 3 && installs.every(i => i && i.extension === 'diapositives') && !s.show && !m.open, { installs, show: !!s.show, open: m.open });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-show-open'); return !!b && b.getAttribute('aria-disabled') === 'false'; }, null, { timeout: 8000 }).catch(() => {});

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
