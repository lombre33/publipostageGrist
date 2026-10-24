#!/usr/bin/env node
// Masquer un objet de diapositive (js/free-frame.js : `hidden`, `data-ff-hidden`, le bouton « Masquer l'objet » de la barre de l'objet ; chantier 10 de « Import PowerPoint sans perte », lot 10c, le volet
// Sélection de PowerPoint), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LE BOUTON : la barre de l'objet sélectionné l'offre, visible dans 700x400 et sous la souris, avec son nom ; un vrai clic masque l'objet (enfoncé, atténué dans l'éditeur, texte toujours là), un second le montre.
//  L'HISTORIQUE : un seul Ctrl+Z défait un masquage, Ctrl+Y le refait ; l'objet reste sélectionnable une fois masqué.
//  LES SORTIES : la Lecture (vrai clic sur « Lecture ») ne montre pas l'objet masqué, l'éditeur le retrouve en revenant.
// Lancé par run-headless.mjs (groupe Node "frameHiddenMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-hidden.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-hidden', port: Number(process.env.FRAME_HIDDEN_PORT || 9170) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const FRAME = (x, y, w, h, name) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${name}</p></div></div></div>`;
const SLIDE = `<h2>Titre</h2>${FRAME(40, 100, 220, 60, 'Premier')}${FRAME(300, 100, 220, 60, 'Second')}`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Masque', '${SLIDE}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;
const TEXTS = {
  fr: { button: "Masquer l'objet", read: 'Lecture' },
  en: { button: 'Hide object', read: 'Reading' },
};

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const rectOf = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selector);
  const click = async (selector) => {
    const c = await rectOf(selector);
    if (!c) throw new Error('introuvable : ' + selector);
    await page.mouse.move(c.x - 6, c.y);
    await page.mouse.move(c.x, c.y, { steps: 2 });
    await sleep(80);
    await page.mouse.click(c.x, c.y);
    await sleep(300);
    return c;
  };
  const open = async (id) => {
    await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id), sleep(20000)]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('#editor-container .pp-free-frame'), null, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  const selectFrame = async (index) => {
    await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame') list.push(pos); });
      FreeFrame.select(ed, list[i]);
      const dom = ed.view.nodeDOM(list[i]);
      if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'center', inline: 'center' });
    }, index);
    await sleep(400);
  };
  const hiddenOf = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach((node) => { if (node.type.name === 'freeFrame') out.push(node.textContent + '=' + (node.attrs.hidden || '')); });
    return out.join(' ');
  });
  const barButton = () => page.evaluate(() => {
    const b = document.querySelector('.v2-frame-toolbar [data-action="hide"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { title: b.title, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), svg: !!b.querySelector('svg'), shown: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: top === b || b.contains(top) };
  });
  const dimmed = index => page.evaluate((i) => {
    const el = document.querySelectorAll('#editor-container .pp-free-frame')[i];
    return el ? { opacity: getComputedStyle(el.querySelector('.pp-free-frame-box')).opacity, text: el.textContent.trim() } : null;
  }, index);

  await open(7);
  console.log('\n' + tag + `1) Le bouton « ${T.button} » de la barre de l'objet`);
  await selectFrame(0);
  let button = await barButton();
  check(tag + `la barre de l'objet a le bouton « ${T.button} », avec son icône, visible dans ${WIDTH}x${HEIGHT} et sous la souris, pas enfoncé`, !!button && button.title === T.button && button.label === T.button && button.svg && button.shown && button.hit && button.pressed === 'false' && !button.active, button);
  await click('.v2-frame-toolbar [data-action="hide"]');
  check(tag + 'un vrai clic masque l\'objet choisi, et lui seul', (await hiddenOf()) === 'Premier=1 Second=', await hiddenOf());
  button = await barButton();
  check(tag + 'le bouton est enfoncé, la barre reste sous la souris', !!button && button.pressed === 'true' && button.active && button.hit, button);
  let first = await dimmed(0), second = await dimmed(1);
  check(tag + 'l\'objet masqué est atténué dans l\'éditeur, son texte est toujours là ; l\'autre garde son aspect', !!first && parseFloat(first.opacity) < 0.5 && first.text === 'Premier' && !!second && second.opacity === '1', { first, second });
  const html = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le HTML enregistré porte data-ff-hidden="1" sur l\'objet masqué seulement', (html.match(/data-ff-hidden="1"/g) || []).length === 1 && /data-ff-hidden="1"[^>]*>(?:(?!pp-free-frame")[\s\S])*Premier/.test(html), html.slice(0, 400));

  console.log('\n' + tag + '2) L\'historique');
  await page.keyboard.press('Control+z');
  await sleep(300);
  check(tag + 'un seul Ctrl+Z remontre l\'objet', (await hiddenOf()) === 'Premier= Second=', await hiddenOf());
  await page.keyboard.press('Control+y');
  await sleep(300);
  check(tag + 'Ctrl+Y le masque de nouveau', (await hiddenOf()) === 'Premier=1 Second=', await hiddenOf());
  await selectFrame(1);
  await selectFrame(0);
  button = await barButton();
  check(tag + 'l\'objet masqué se choisit encore : sa barre le montre enfoncé', !!button && button.pressed === 'true', button);

  console.log('\n' + tag + '3) La Lecture');
  const readButton = await rectOf('#btn-mode-read');
  await page.mouse.move(readButton.x, readButton.y, { steps: 4 });
  await page.mouse.click(readButton.x, readButton.y);
  await sleep(700);
  const reading = await page.evaluate(() => {
    const root = document.getElementById('reader-container');
    return { shown: !!root && getComputedStyle(root).display !== 'none', frames: root ? Array.from(root.querySelectorAll('.pp-free-frame')).map(f => f.textContent.trim()) : [] };
  });
  check(tag + 'la Lecture montre l\'objet visible et pas l\'objet masqué', reading.shown && reading.frames.join() === 'Second', reading);
  const editButton = await rectOf('#btn-mode-edit');
  await page.mouse.move(editButton.x, editButton.y, { steps: 4 });
  await page.mouse.click(editButton.x, editButton.y);
  await sleep(700);
  check(tag + 'revenu à l\'édition, l\'objet masqué est toujours là, atténué', (await hiddenOf()) === 'Premier=1 Second=', await hiddenOf());
  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
