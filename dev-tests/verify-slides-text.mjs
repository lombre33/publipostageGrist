#!/usr/bin/env node
// Le texte neuf d'une présentation à 20 pt et ses titres plus grands (js/slides-entry.js:createTextExtension, textMarks ; demande du 21/10 : « la taille par défaut du texte à
// augmenter fortement, passer à 20 quand on est en mode slide »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, l'app dans le cadre isolé de GFS, l'extension « diapositives » active.
//  UN DOCUMENT n'a rien de changé : le texte tapé dans un paragraphe neuf n'a pas de taille.
//  UNE PRÉSENTATION NEUVE (« + », « Nouvelle présentation ») : le menu des tailles montre 20 pt avant la frappe ; le texte tapé dans la diapositive vide est à 20 pt (et
//   s'affiche à 20 pt) ; Entrée garde 20 pt ; un texte brut collé dans une ligne vide prend 20 pt.
//  LES TITRES, plus grands que le texte (carte du 21/10, « Grossir ») : un paragraphe à 20 pt passé en « Titre 1 » au menu passe à 44 pt ; Ctrl+Z le rend tel qu'il était, en un
//   geste ; « Titre 2 » le met à 36 pt, « Normal » le rend à 20 pt ; « # » en début de ligne fait un Titre 1 à 44 pt ; un texte à une autre taille choisie la garde.
//  « AJOUTER », « Titre et contenu » : le titre à 36 pt, les points de la liste à 20 pt.
//  UNE PRÉSENTATION DÉJÀ FAITE : le texte déjà écrit garde sa taille (rien n'est réécrit à l'ouverture, rien n'attend d'être enregistré, la frappe au bout d'un texte sans taille
//   reste sans taille) ; une ligne neuve est à 20 pt ; la Lecture montre ce texte à 20 pt.
// Lancé par run-headless.mjs (groupe Node "slidesText", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-text.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-text', port: Number(process.env.SLIDES_TEXT_PORT || 8957) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['diapositives'];
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(8, 'Diapo', '<p>Diapo 1)</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 9;
`;
// 20 pt en pixels CSS de mise en page (96 / 72).
const PX_20PT = 20 * 96 / 72;

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
  const boxOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, w: r.width, h: r.height };
  }, [selector, index]);
  const hover = async (selector, index = 0) => {
    const c = await inPage(await boxOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(150);
    return c;
  };
  const click = async (selector, index = 0, settle = 300) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y); await sleep(settle); };
  // Un clic juste à droite de la fin du texte de `selector`, puis Fin : le curseur au bout de ce bloc.
  const clickEnd = async (selector, index = 0) => {
    const b = await boxOf(selector, index);
    if (!b) throw new Error('introuvable : ' + selector + ' #' + index);
    const end = await app.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects());
      const last = rects[rects.length - 1] || el.getBoundingClientRect();
      return { x: last.right + 4, y: last.top + last.height / 2 };
    }, [selector, index]);
    const c = await inPage(end);
    await page.mouse.move(c.x - 20, c.y, { steps: 2 }); await page.mouse.click(c.x, c.y); await sleep(200);
    await page.keyboard.press('End'); await sleep(100);
  };
  // Un clic au début de `selector` (un paragraphe vide).
  const clickStart = async (selector, index = 0) => {
    const b = await inPage(await boxOf(selector, index));
    if (!b) throw new Error('introuvable : ' + selector + ' #' + index);
    await page.mouse.move(b.x, b.y, { steps: 2 }); await page.mouse.click(b.x - b.w / 2 + 8, b.y); await sleep(300);
  };
  // Le menu « + » : la souris descend du bouton vers la ligne, sans quitter le menu.
  const clickPlusRow = async (selector) => {
    const plus = await inPage(await boxOf('#btn-new'));
    await page.mouse.move(plus.x - 25, plus.y); await page.mouse.move(plus.x, plus.y, { steps: 4 }); await sleep(600);
    const row = await inPage(await boxOf(selector));
    if (!row || !row.w) throw new Error('ligne introuvable ou masquée : ' + selector);
    const inRow = Math.min(Math.max(plus.x, row.x - row.w / 2 + 6), row.x + row.w / 2 - 6);
    await page.mouse.move(inRow, plus.y + 10, { steps: 2 });
    await page.mouse.move(inRow, row.y, { steps: 6 });
    await page.mouse.move(row.x, row.y, { steps: 4 }); await sleep(200);
    await page.mouse.click(row.x, row.y); await sleep(1500);
  };
  // Le menu « Titre » : la souris passe sur son bouton, puis sur la ligne du niveau.
  const pickHeading = async (level) => {
    const chip = await hover('#v2-heading-chip');
    await sleep(400);
    const row = await inPage(await boxOf(`#v2-heading-flyout .v2-hover-row[data-level="${level}"]`));
    if (!row || !row.w) throw new Error('ligne de titre introuvable : ' + level);
    await page.mouse.move(chip.x, row.y - row.h, { steps: 3 });
    await page.mouse.move(row.x, row.y, { steps: 4 }); await sleep(150);
    await page.mouse.click(row.x, row.y); await sleep(300);
    // La souris s'en va à droite de la page : le menu se referme.
    const away = await inPage({ x: 620, y: 250 });
    await page.mouse.move(row.x + row.w / 2 + 20, row.y, { steps: 3 }); await page.mouse.move(away.x, away.y, { steps: 6 }); await sleep(500);
  };
  const press = async (key, settle = 150) => { await page.keyboard.press(key); await sleep(settle); };
  const type = async (text, settle = 400) => { await page.keyboard.type(text, { delay: 20 }); await sleep(settle); };
  // La question « Enregistrer / Ne pas enregistrer / Annuler » : « Ne pas enregistrer », le bouton du milieu, quelle que soit la langue.
  const discardIfAsked = async () => {
    const asked = await app.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 2500 }).then(() => true, () => false);
    if (!asked) return;
    const b = await app.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).filter(x => !x.hidden);
      const r = buttons[1].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const c = await inPage(b);
    await page.mouse.move(c.x - 10, c.y, { steps: 2 }); await page.mouse.click(c.x, c.y); await sleep(800);
  };
  return { click, clickStart, clickEnd, clickPlusRow, pickHeading, press, type, discardIfAsked };
}

// Les blocs de texte du document : type, niveau, et pour chaque texte sa taille (la marque, null sans taille).
const blocks = app => app.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants((node) => {
    if (!node.isTextblock) return true;
    const runs = [];
    node.forEach((child) => { if (child.isText) { const style = child.marks.find(m => m.type.name === 'textStyle'); runs.push({ text: child.text, size: (style && style.attrs.fontSize) || null }); } });
    out.push({ type: node.type.name, level: node.attrs.level || null, text: node.textContent, runs });
    return false;
  });
  return out;
});
const blockWith = (list, text) => list.find(b => b.text.includes(text));
const allAt = (block, size) => !!block && block.runs.length > 0 && block.runs.every(r => r.size === size);
// La taille affichée (px de mise en page) du texte qui contient `text`, dans l'éditeur ou la Lecture.
const shownSize = (app, text, scope = '#editor-container .tiptap') => app.evaluate(([s, sel]) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.includes(s)) return parseFloat(getComputedStyle(n.parentElement).fontSize);
  return null;
}, [text, scope]);
const chipValue = app => app.evaluate(() => document.getElementById('v2-size-chip-val').textContent.trim());
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.2;
const paste = (app, text) => app.evaluate((s) => {
  const dt = new DataTransfer();
  dt.setData('text/plain', s);
  EditorCore.getEditor().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, text);
const openModel = async (tab, a, id) => {
  const asked = Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await sleep(500);
  await a.discardIfAsked();
  await asked;
  await tab.app.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 15000 }).catch(() => {});
  await sleep(1200);
};

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { app } = A;
  const a = toolsOf(A);

  // --- Un document : rien de changé.
  await a.clickEnd('#editor-container .tiptap p', 0);
  await a.press('Enter');
  await a.type('Doc neuf');
  let list = await blocks(app);
  check(tag + 'un document : le texte tapé dans un paragraphe neuf n’a pas de taille, comme avant', allAt(blockWith(list, 'Doc neuf'), null), list);

  // --- Une présentation neuve : 20 pt avant la frappe, à la frappe sans clic, après Entrée, au collage d'un texte brut.
  await a.clickPlusRow('#v2-btn-new-presentation');
  await a.discardIfAsked();
  await app.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  const chip = await chipValue(app);
  check(tag + 'une présentation neuve : le menu des tailles montre 20 pt avant la frappe', chip === '20pt', chip);
  await a.clickStart('#editor-container .tiptap p', 0);
  await a.type('Bonjour');
  list = await blocks(app);
  let px = await shownSize(app, 'Bonjour');
  check(tag + 'un clic dans la diapositive vide, puis la frappe : le texte est à 20 pt et s’affiche à 20 pt', allAt(blockWith(list, 'Bonjour'), '20pt') && near(px, PX_20PT), { list, px });
  await a.press('Enter');
  await a.type('Deuxième ligne');
  list = await blocks(app);
  check(tag + 'Entrée garde 20 pt', allAt(blockWith(list, 'Deuxième ligne'), '20pt'), list);
  await a.press('Enter');
  await paste(app, 'Collé brut');
  await sleep(500);
  list = await blocks(app);
  check(tag + 'un texte brut collé dans une ligne vide prend 20 pt', allAt(blockWith(list, 'Collé brut'), '20pt'), list);

  // --- Les titres : « Titre 1 » au menu, Ctrl+Z, « Normal », « # » en début de ligne.
  await a.clickEnd('#editor-container .tiptap p', 1);
  await a.pickHeading('1');
  list = await blocks(app);
  let h = blockWith(list, 'Deuxième ligne');
  px = await shownSize(app, 'Deuxième ligne');
  check(tag + 'un paragraphe à 20 pt passé en « Titre 1 » : il passe à 44 pt et s’affiche à 44 pt', !!h && h.type === 'heading' && h.level === 1 && allAt(h, '44pt') && near(px, 44 * 96 / 72), { h, px });
  await a.press('Control+z', 500);
  list = await blocks(app);
  h = blockWith(list, 'Deuxième ligne');
  check(tag + 'Ctrl+Z, une fois : le paragraphe revient, à 20 pt', !!h && h.type === 'paragraph' && allAt(h, '20pt'), h);
  await a.pickHeading('1');
  await a.pickHeading('2');
  list = await blocks(app);
  h = blockWith(list, 'Deuxième ligne');
  check(tag + '« Titre 2 » : il passe à 36 pt', !!h && h.type === 'heading' && h.level === 2 && allAt(h, '36pt'), h);
  await a.pickHeading('p');
  list = await blocks(app);
  h = blockWith(list, 'Deuxième ligne');
  check(tag + 'repassé en « Normal » : le paragraphe reprend 20 pt', !!h && h.type === 'paragraph' && allAt(h, '20pt'), h);
  // Une autre taille choisie (12 pt, au menu des tailles) reste quand le bloc devient un titre.
  await a.clickEnd('#editor-container .tiptap p', 0);
  await a.press('Shift+Home');
  await a.click('#v2-size-chip-val', 0, 400);
  await a.click('.v2-format-panel.visible [data-action="12pt"]', 0, 400);
  await a.clickEnd('#editor-container .tiptap p', 0);
  await a.pickHeading('1');
  list = await blocks(app);
  h = blockWith(list, 'Bonjour');
  check(tag + 'un texte à une autre taille choisie (12 pt) la garde quand son bloc devient un titre', !!h && h.type === 'heading' && allAt(h, '12pt'), h);
  await a.press('Control+z', 500);
  await a.clickEnd('#editor-container .tiptap p', 2);
  await a.press('Enter');
  await a.type('# Titre clavier');
  list = await blocks(app);
  h = blockWith(list, 'Titre clavier');
  check(tag + '« # » en début de ligne : un Titre 1 à 44 pt', !!h && h.type === 'heading' && h.level === 1 && allAt(h, '44pt'), h);

  // --- « Ajouter », « Titre et contenu » : les points à 20 pt, le titre à sa taille de titre.
  await a.click('.pp-slide-strip .pp-slide-thumb', 0, 500);
  await a.click('.pp-slide-add', 0, 500);
  await a.click('.pp-slide-layouts.visible [data-action="titleContent"]', 0, 1200);
  list = await blocks(app);
  const items = list.filter(b => b.type === 'paragraph' && /Point|point/.test(b.text));
  const title = list.filter(b => b.type === 'heading' && b.level === 2).pop();
  check(tag + '« Ajouter », « Titre et contenu » : le titre à 36 pt, les points de la liste à 20 pt', items.length === 2 && items.every(b => allAt(b, '20pt')) && !!title && allAt(title, '36pt'), { items, title });

  // --- Une présentation déjà faite : son texte garde sa taille ; une ligne neuve est à 20 pt ; la Lecture la montre à 20 pt.
  await openModel(A, a, 8);
  list = await blocks(app);
  const unsaved = await app.evaluate(() => document.getElementById('status-msg').classList.contains('is-unsaved'));
  check(tag + 'une présentation déjà faite : à l’ouverture, son texte n’a pas de taille, comme enregistré, et rien n’attend d’être enregistré', list.length >= 1 && allAt(blockWith(list, 'Diapo 1)'), null) && !unsaved, { list, unsaved });
  await a.clickEnd('#editor-container .tiptap p', 0);
  await a.type(' suite');
  list = await blocks(app);
  check(tag + 'la frappe au bout d’un texte sans taille reste sans taille', allAt(blockWith(list, 'Diapo 1) suite'), null), list);
  await a.press('Enter');
  await a.type('Ligne neuve');
  list = await blocks(app);
  check(tag + 'une ligne neuve est à 20 pt, la ligne d’avant garde sa taille', allAt(blockWith(list, 'Ligne neuve'), '20pt') && allAt(blockWith(list, 'Diapo 1) suite'), null), list);
  await a.click('#btn-mode-read', 0, 300);
  await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
  await sleep(2000);
  const reader = { neuve: await shownSize(app, 'Ligne neuve', '#reader-container .reader-content'), avant: await shownSize(app, 'Diapo 1)', '#reader-container .reader-content') };
  check(tag + 'la Lecture montre la ligne neuve à 20 pt et la ligne d’avant à sa taille (10,5 pt)', near(reader.neuve, PX_20PT) && near(reader.avant, 14), reader);
  await a.click('#btn-mode-edit', 0, 800);

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
