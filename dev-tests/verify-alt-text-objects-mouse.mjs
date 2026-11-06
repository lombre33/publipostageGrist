#!/usr/bin/env node
// Le TEXTE ALTERNATIF d'un objet de diapositive (js/alt-text.js, js/free-frame.js : `alt`, `decorative` ; demande du 06/11, « Texte alternatif des images et des objets », lot 2), à la vraie souris et au vrai
// clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LA BARRE : le bouton « Texte alternatif… » est dans la barre d'un cadre, d'une forme et d'une ligne, avec son icône, visible dans 700x400 (la barre entière reste dans le panneau) et sous la souris ; il est
//   éteint pour un objet sans description, allumé (et `aria-pressed`) pour un objet décrit ou décoratif.
//  LA FENÊTRE : un clic l'ouvre avec les mots de l'objet (« Description de l'objet », « Objet décoratif ») et le texte de l'objet ; taper, Entrée : l'objet est décrit, la fenêtre se ferme et le focus revient à
//   l'éditeur, UN Ctrl+Z défait (un Ctrl+Y le remet) ; la case décorative grise le champ ; Échap n'écrit rien ; le HTML enregistré porte `data-ff-alt` / `data-ff-decorative`.
//  LA TOUCHE : Ctrl+Alt+Y ouvre la fenêtre sur l'objet quand le curseur est dans son texte, et le curseur y reste après Entrée.
//  LA LECTURE : un objet décrit s'y lit avec son texte comme nom (`aria-label`), un objet décoratif sans nom (`role="presentation"`).
// Lancé par run-headless.mjs (groupe Node "altTextObjects", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-alt-text-objects-mouse.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-alt-text-objects-mouse', port: Number(process.env.ALT_TEXT_OBJECTS_PORT || 9394) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.ALT_TEXT_OBJECTS_SHOTS || '';
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = 'class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"';
const FRAME = (x, y, w, h, html, extra = '') => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;
// Deux diapositives. La 1re : A un cadre de texte, B une forme (décrite d'avance), C une ligne, D une forme décorative d'avance.
const SLIDES = [
  `<div ${PROPS} data-anchor="slide-1"></div><h1>Accueil</h1><p>Début</p>`
    + FRAME(40, 160, 260, 56, '<p>Bloc de texte</p>')
    + FRAME(340, 160, 200, 80, '<p></p>', ' data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5" data-ff-alt="Un schéma des deux étapes"')
    + FRAME(40, 300, 260, 0, '', ' data-ff-shape="line" data-ff-line="#0369a1" data-ff-lw="2"')
    + FRAME(340, 300, 200, 60, '<p></p>', ' data-ff-shape="rect" data-ff-fill="#cccccc" data-ff-decorative="1"'),
  '<h2>Fin</h2><p>Merci</p>',
].join(BR);
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Texte alternatif objets', '${SLIDES}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: { button: 'Texte alternatif…', title: 'Texte alternatif', label: 'Description de l’objet', decorative: 'Objet décoratif (rien à lire)', imageLabel: 'Description de l’image', read: '#btn-mode-read', edit: '#btn-mode-edit' },
  en: { button: 'Alternative text…', title: 'Alternative text', label: 'Object description', decorative: 'Decorative object (nothing to read)', imageLabel: 'Image description', read: '#btn-mode-read', edit: '#btn-mode-edit' },
};
const TYPED = { fr: 'Une flèche vers l’étape 2', en: 'An arrow towards step 2' };

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, options = {}) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y, options);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${colorScheme === 'dark' ? 'sombre' : 'clair'}-${lang}-${name}.png` }); };
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 2; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);

  const framesOf = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach((node, pos) => {
      if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') {
        const a = FreeFrame.normalized(node.attrs);
        out.push({ pos, line: node.type.name === 'freeLine', text: node.textContent.trim(), alt: a.alt, decorative: a.decorative });
      }
    });
    return out;
  });
  const selectFrame = async (index) => {
    await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') list.push(pos); });
      FreeFrame.select(ed, list[i]);
      const dom = ed.view.nodeDOM(list[i]);
      if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'center', inline: 'center' });
    }, index);
    await sleep(450);
  };
  const barButton = () => page.evaluate(() => {
    const bar = document.querySelector('.v2-frame-toolbar');
    const b = document.querySelector('.v2-frame-toolbar [data-action="alt"]');
    if (!b || !bar) return null;
    const r = b.getBoundingClientRect();
    const rb = bar.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      title: b.title, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), svg: !!b.querySelector('svg'),
      shown: getComputedStyle(b).display !== 'none' && r.width > 0, hit: top === b || b.contains(top),
      barIn: rb.left >= -0.5 && rb.right <= innerWidth + 0.5 && rb.top >= -0.5 && rb.bottom <= innerHeight + 0.5, barWidth: Math.round(rb.width),
    };
  });
  const dialog = () => page.evaluate(() => {
    const modal = document.getElementById('pp-alt-modal');
    const open = !!modal && modal.style.display !== 'none' && !modal.hidden && getComputedStyle(modal).display !== 'none';
    if (!open) return { open: false };
    const box = modal.querySelector('.pp-modal-box').getBoundingClientRect();
    const input = document.getElementById('pp-alt-text');
    const label = modal.querySelector('label[for="pp-alt-text"]');
    const ok = modal.querySelector('.var-modal-primary').getBoundingClientRect();
    return {
      open, title: document.getElementById('pp-alt-title').textContent, label: label.textContent, value: input.value, placeholder: input.placeholder, disabled: input.disabled,
      decorative: document.querySelector('.pp-alt-decorative span').textContent, checked: document.getElementById('pp-alt-decorative').checked, focus: document.activeElement && document.activeElement.id,
      count: document.getElementById('pp-alt-count').textContent,
      inView: box.top >= -0.5 && box.bottom <= innerHeight + 0.5 && box.left >= -0.5 && box.right <= innerWidth + 0.5, okIn: ok.bottom <= box.bottom + 0.5,
    };
  });
  const focusInEditor = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));
  const openFromBar = async (index) => {
    await selectFrame(index);
    await leave();
    await click('.v2-frame-toolbar [data-action="alt"]');
    await sleep(300);
  };

  // --- 1. La barre.
  console.log('\n' + tag + `1) Le bouton « ${T.button} » de la barre de l'objet`);
  await selectFrame(0);
  await leave();
  let button = await barButton();
  check(tag + `le cadre de texte (sans description) : bouton « ${T.button} » avec son icône, visible, sous la souris, pas enfoncé ; la barre entière tient dans ${WIDTH}x${HEIGHT} (${button && button.barWidth} px)`,
    !!button && button.title === T.button && button.label === T.button && button.svg && button.shown && button.hit && button.pressed === 'false' && !button.active && button.barIn, button);
  await selectFrame(1);
  button = await barButton();
  check(tag + 'la forme décrite d\'avance : le bouton est enfoncé', !!button && button.pressed === 'true' && button.active && button.shown && button.hit, button);
  await selectFrame(2);
  button = await barButton();
  check(tag + 'la ligne a le bouton aussi (éteint : sans description)', !!button && button.shown && button.hit && button.pressed === 'false' && !button.active && button.barIn, button);
  await selectFrame(3);
  button = await barButton();
  check(tag + 'la forme décorative d\'avance : le bouton est enfoncé', !!button && button.pressed === 'true' && button.active, button);
  await shot('1-barre');

  // --- 2. La fenêtre : un texte.
  console.log('\n' + tag + '2) La fenêtre : décrire un cadre de texte');
  await openFromBar(0);
  let box = await dialog();
  check(tag + `un clic sur le bouton ouvre la fenêtre « ${T.title} » avec les mots de l'objet (« ${T.label} », « ${T.decorative} »), le champ vide et pris au focus, entière dans ${WIDTH}x${HEIGHT}`,
    box.open && box.title === T.title && box.label === T.label && box.decorative === T.decorative && box.value === '' && box.focus === 'pp-alt-text' && !box.checked && !box.disabled && box.inView && box.okIn && box.label !== T.imageLabel, box);
  await shot('2-fenetre');
  await page.keyboard.type(TYPED[lang]);
  box = await dialog();
  check(tag + 'le compteur suit la frappe', box.count === `${TYPED[lang].length} / 500`, box);
  await page.keyboard.press('Enter');
  await sleep(300);
  let frames = await framesOf();
  box = await dialog();
  check(tag + 'Entrée écrit le texte sur le cadre, ferme la fenêtre et rend le focus à l\'éditeur', frames[0].alt === TYPED[lang] && !frames[0].decorative && !box.open && (await focusInEditor()), { frames: frames.slice(0, 1), box });
  button = await barButton();
  check(tag + 'le bouton de la barre s\'allume (et `aria-pressed`)', !!button && button.pressed === 'true' && button.active, button);
  const saved = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le HTML enregistré porte `data-ff-alt` sur cet objet et sur la forme déjà décrite seulement', (saved.match(/data-ff-alt="/g) || []).length === 2 && saved.indexOf('data-ff-alt="' + TYPED[lang] + '"') > 0, saved.slice(0, 300));
  await page.keyboard.press('Control+z');
  await sleep(300);
  frames = await framesOf();
  check(tag + 'UN Ctrl+Z défait le texte (le cadre n\'est plus décrit, le bouton s\'éteint)', frames[0].alt === '' && (await barButton()).pressed === 'false', frames[0]);
  await page.keyboard.press('Control+y');
  await sleep(300);
  frames = await framesOf();
  check(tag + 'un Ctrl+Y le remet', frames[0].alt === TYPED[lang], frames[0]);

  // --- 3. Échap, et rien n'est écrit sans changement.
  console.log('\n' + tag + '3) Échap et la case décorative');
  await openFromBar(1);
  box = await dialog();
  check(tag + 'la forme décrite d\'avance ouvre la fenêtre avec son texte', box.open && box.value === 'Un schéma des deux étapes', box);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Autre texte');
  await page.keyboard.press('Escape');
  await sleep(300);
  frames = await framesOf();
  box = await dialog();
  check(tag + 'Échap ferme la fenêtre sans rien écrire', !box.open && frames[1].alt === 'Un schéma des deux étapes' && (await focusInEditor()), { frames: frames[1], box });
  // La ligne : la case décorative.
  await openFromBar(2);
  box = await dialog();
  check(tag + 'la ligne ouvre la même fenêtre', box.open && box.label === T.label && box.value === '', box);
  await click('#pp-alt-modal .pp-alt-decorative');
  box = await dialog();
  check(tag + 'la case « Objet décoratif » grise le champ', box.checked && box.disabled, box);
  await shot('3-decorative');
  await click('#pp-alt-modal .var-modal-primary');
  await sleep(300);
  frames = await framesOf();
  button = await barButton();
  check(tag + 'valider avec la case cochée marque la ligne décorative (sans texte) et allume le bouton', frames[2].decorative === '1' && frames[2].alt === '' && !!button && button.pressed === 'true', { line: frames[2], button });
  const savedDecor = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le HTML enregistré porte `data-ff-decorative="1"` sur la ligne et sur la forme déjà décorative, et rien d\'autre', (savedDecor.match(/data-ff-decorative="1"/g) || []).length === 2, savedDecor.slice(0, 200));
  await click('.v2-frame-toolbar [data-action="alt"]');
  await sleep(300);
  box = await dialog();
  check(tag + 'rouverte, la fenêtre montre la case cochée et le champ gris', box.open && box.checked && box.disabled && box.value === '', box);
  await page.keyboard.press('Escape');
  await sleep(300);

  // --- 4. La touche, le curseur dans le texte.
  console.log('\n' + tag + '4) Ctrl+Alt+Y avec le curseur dans le texte d\'un cadre');
  await selectFrame(0);
  await leave();
  const inText = await page.evaluate(() => {
    const frame = document.querySelectorAll('#editor-container .pp-free-frame')[0];
    const content = frame.querySelector('.pp-free-frame-content');
    content.scrollIntoView({ block: 'center' });
    const r = content.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2 };
  });
  await sleep(300);
  const textAt = await page.evaluate(() => {
    const frame = document.querySelectorAll('#editor-container .pp-free-frame')[0];
    const p = frame.querySelector('.pp-free-frame-content p');
    const r = p.getBoundingClientRect();
    return { x: r.left + Math.min(30, r.width / 2), y: r.top + r.height / 2 };
  });
  await reach(textAt);
  await page.mouse.click(textAt.x, textAt.y);
  await sleep(300);
  const caret = await page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { node: !!s.node, from: s.from }; });
  await page.keyboard.press('Control+Alt+y');
  await sleep(350);
  box = await dialog();
  check(tag + 'le curseur dans le texte du cadre : Ctrl+Alt+Y ouvre la fenêtre sur ce cadre (son texte, les mots de l\'objet)', !caret.node && box.open && box.label === T.label && box.value === TYPED[lang], { caret, box, inText });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Titre du bloc');
  await page.keyboard.press('Enter');
  await sleep(300);
  frames = await framesOf();
  const after = await page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { node: !!s.node, from: s.from }; });
  check(tag + 'Entrée écrit le texte ; le curseur reste dans le texte du cadre (le cadre n\'est pas devenu la sélection)', frames[0].alt === 'Titre du bloc' && !after.node && after.from === caret.from && (await focusInEditor()), { frame: frames[0], caret, after });

  // --- 5. La Lecture.
  console.log('\n' + tag + '5) La Lecture');
  await leave();
  await click(T.read);
  await sleep(1200);
  const read = await page.evaluate(() => {
    const root = document.getElementById('reader-container');
    return Array.from(root ? root.querySelectorAll('.pp-free-frame') : []).map(el => ({ role: el.getAttribute('role'), label: el.getAttribute('aria-label') || '' }));
  });
  check(tag + 'dans la Lecture : le cadre décrit a son texte pour nom, la forme décrite aussi, la ligne et la forme décoratives sont sans nom (`role="presentation"`)',
    read.length === 4 && read[0].role === 'group' && read[0].label === 'Titre du bloc' && read[1].label === 'Un schéma des deux étapes' && read[2].role === 'presentation' && read[2].label === '' && read[3].role === 'presentation' && read[3].label === '', read);
  await leave();
  await click(T.edit);
  await sleep(900);
  frames = await framesOf();
  check(tag + 'revenu à l\'édition, les quatre objets gardent leur texte alternatif et leur marque', frames.length === 4 && frames[0].alt === 'Titre du bloc' && frames[1].alt === 'Un schéma des deux étapes' && frames[2].decorative === '1' && frames[3].decorative === '1', frames);
  await page.close();
}

const only = process.env.ALT_TEXT_OBJECTS_ONLY || '';
if (!only || only === 'fr') await run('fr', 'light');
if (!only || only === 'en') await run('en', 'dark');
await t.finish();
