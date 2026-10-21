#!/usr/bin/env node
// Chaque diapositive au haut de sa page, et la même diapositive dans les trois vues (js/header-footer-preview.js:placeReserve et la surveillance des réserves, js/reader-mode.js,
// EditorCore.fitReserve ; demande du 21/10 : « la copie apparaît en bas de la diapositive 1, au-dessus de la bande Page 2 », et « un gros travail de fidélité entre l'éditeur, la
// Lecture et le diaporama »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, l'app dans le cadre isolé de GFS, l'extension « diapositives » active.
//  DUPLIQUER : une présentation d'une diapositive « Diapo 1) » ; « ⋯ » puis « Dupliquer », deux fois : chaque diapositive commence au haut du corps de sa page, sous la couture.
//  UN STYLE ARRIVÉ APRÈS COUP (sans transaction, comme une police ou une feuille chargée en retard) : la diapositive 1 grandit, puis, mise en page refaite à la frappe, raccourcit ;
//   une marge disparaît sans que rien ne change de taille (la souris qui passe sur la page suffit) : les diapositives d'après restent au haut de leur page. Avant la correction, le
//   plancher de la feuille (la hauteur de sa dernière page) cachait le changement : elles restaient 136 px trop bas ou trop haut, la seconde au bas de la page d'avant.
//  LE BLOC QUI OUVRE UNE DIAPOSITIVE N'EST PAS OÙ LE CALCUL L'ATTEND (une marge du haut de -136 px) : la réserve se corrige, dans l'éditeur et dans la Lecture ; la marge retirée,
//   la souris sur la page les remet en place.
//  FIDÉLITÉ : une présentation de quatre diapositives (titre centré, liste, texte) ; chaque repère est à la même place de sa page, à 0,4 % près, dans l'éditeur, dans la Lecture et
//   dans le diaporama, et chaque page y est en 16:9.
//  LE CONTENU AU CARRÉ DU ZOOM (capture du 21/10 : sous Firefox, chez une personne, le texte et la marge de gauche de la page se dessinaient à 63 % quand la feuille était à 79 %) : un
//   style qui ajoute au contenu de la feuille le zoom que la feuille porte déjà fait le même effet ici ; le contenu se remet au zoom de la feuille, texte et marge de gauche à leur
//   taille, « ⋯ » puis « Dupliquer » et « Importer » posent chaque diapositive au haut de sa page, et un changement de zoom de la page n'y change rien.
// Lancé par run-headless.mjs (groupe Node "slidesPages", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-pages.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-pages', port: Number(process.env.SLIDES_PAGES_PORT || 8956) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FIDELITY = '<h1 style="text-align: center">Titre A</h1><p style="text-align: center">Sous-titre</p>' + BR
  + '<h2>Deux B</h2><ul><li><p>Point un</p></li><li><p>Point deux</p></li></ul>' + BR + '<p>Slide C</p>' + BR + '<p>Texte D</p><p>Encore</p>';
const MARKS = ['Titre A', 'Deux B', 'Slide C', 'Texte D'];
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(8, 'Diapo', '<p>Diapo 1)</p>', false, 'presentation');
  add(9, 'Fidélité', ${JSON.stringify(FIDELITY)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 10;
`;
// L'écart toléré entre le haut d'une diapositive et le haut du corps de sa page (pixels de mise en page).
const TOL = 1;
const SHIFT = 136;

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
  const hover = async (selector, index = 0) => {
    const c = await inPage(await centerOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(120);
    return c;
  };
  const click = async (selector, index = 0, settle = 300) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y); await sleep(settle); };
  const moveAt = async (x, y) => { const c = await inPage({ x, y }); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(120); };
  const press = async (key, settle = 150) => { await page.keyboard.press(key); await sleep(settle); };
  return { click, hover, moveAt, press };
}

// Pour chaque diapositive après la première : l'écart entre le haut de son premier bloc et le bas de la couture qui ouvre sa page, en pixels de mise en page (0 : au haut du corps).
const editorOffsets = app => app.evaluate(() => {
  const editor = EditorCore.getEditor();
  const z = EditorCore.layoutZoom(editor.view.dom);
  const seams = Array.from(document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-band')).map(el => el.getBoundingClientRect().bottom).sort((a, b) => a - b);
  const firsts = [];
  let after = false;
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === 'pageBreak') { after = true; return; }
    if (after) { const dom = editor.view.nodeDOM(pos); firsts.push(dom && dom.getBoundingClientRect ? dom.getBoundingClientRect().top : null); after = false; }
  });
  return firsts.map((top, i) => (top == null || seams[i] == null) ? null : Math.round((top - seams[i]) / z * 10) / 10);
});
const readerOffsets = app => app.evaluate(() => {
  const root = document.querySelector('#reader-container .reader-content');
  if (!root) return null;
  const z = EditorCore.layoutZoom(root);
  const seams = Array.from(document.querySelectorAll('#reader-container .v2-pagination-overlay .v2-page-band')).map(el => el.getBoundingClientRect().bottom).sort((a, b) => a - b);
  const firsts = Array.from(root.querySelectorAll(':scope > .page-break-marker')).map(m => m.nextElementSibling).filter(n => n && n.tagName !== 'STYLE').map(n => n.getBoundingClientRect().top);
  return firsts.map((top, i) => seams[i] == null ? null : Math.round((top - seams[i]) / z * 10) / 10);
});
const aligned = offsets => !!offsets && offsets.length > 0 && offsets.every(o => o != null && Math.abs(o) <= TOL);
const slideCount = app => app.evaluate(() => document.querySelectorAll('.pp-slide-strip .pp-slide-item').length);
// Une feuille de style posée sans transaction (comme une police ou une feuille chargée en retard), puis retirée.
const addStyle = (app, id, css) => app.evaluate(([i, c]) => { const s = document.createElement('style'); s.id = i; s.textContent = c; document.head.appendChild(s); }, [id, css]);
const removeStyle = (app, id) => app.evaluate(i => { const s = document.getElementById(i); if (s) s.remove(); }, id);

const open = async (tab, id, slides) => {
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, count]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === count;
  }, [id, slides], { timeout: 15000 }).catch(() => {});
  await sleep(1200);
};

// Pour chaque repère : sa page (rang), sa place dans la page en fractions de la page (x, y) ; et le format de chaque page.
const measure = (app, kind) => app.evaluate(([marks, kind]) => {
  const rect = el => el.getBoundingClientRect();
  let pages = [];
  let root;
  if (kind === 'editor' || kind === 'reader') {
    const scope = document.getElementById(kind === 'editor' ? 'editor-container' : 'reader-container');
    root = scope.querySelector(kind === 'editor' ? '.tiptap' : '.reader-content');
    const sheet = kind === 'editor' ? scope.querySelector('.v2-page-sheet') : (scope.querySelector('.v2-page-edge-top') || root);
    const c = rect(root);
    const dividers = Array.from(scope.querySelectorAll('.v2-pagination-overlay .v2-page-band .v2-page-seam-divider')).map(rect).sort((a, b) => a.top - b.top);
    const tops = [rect(sheet).top, ...dividers.map(d => d.bottom)];
    pages = tops.map((top, i) => ({ left: c.left, width: c.width, top, height: i < dividers.length ? dividers[i].top - top : null }));
    const known = pages.find(p => p.height);
    pages.forEach(p => { if (!p.height) p.height = known.height; });
  } else {
    const host = document.getElementById('pp-slide-show-stage');
    // La page montrée est dans le calque vivant (sa copie figée, pendant une transition, est un autre calque).
    const layer = host && host.shadowRoot ? host.shadowRoot.querySelector('.pp-print-scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)') : null;
    const frame = layer ? layer.firstElementChild : null;
    root = frame;
    const f = rect(frame);
    pages = [{ left: f.left, top: f.top, width: f.width, height: f.height }];
  }
  const out = {};
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const mark = marks.find(m => n.nodeValue.includes(m));
    if (!mark || out[mark]) continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (!r.width) continue;
    const k = pages.findIndex(p => r.top >= p.top - 1 && r.top < p.top + p.height);
    const p = pages[Math.max(0, k)];
    out[mark] = { page: k, x: (r.left - p.left) / p.width, y: (r.top - p.top) / p.height };
  }
  return { ratios: pages.slice(0, 4).map(p => Math.round(p.width / p.height * 1000) / 1000), marks: out };
}, [MARKS, kind]);

// Le zoom dessiné du contenu de la feuille (sa largeur dessinée sur sa largeur de mise en page) et celui de la feuille ; le texte de « Diapo 1) » : sa distance au bord gauche de la
// feuille et sa hauteur, en pixels de mise en page ; la marge de gauche de la page.
const zoomsOf = app => app.evaluate(() => {
  const tip = EditorCore.getEditor().view.dom;
  const sheet = tip.parentElement;
  const walker = document.createTreeWalker(tip, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let text = null;
  for (let n = walker.nextNode(); n && !text; n = walker.nextNode()) if (n.nodeValue.includes('Diapo 1)')) { range.selectNodeContents(n); text = range.getBoundingClientRect(); }
  const z = EditorCore.layoutZoom(tip);
  return {
    sheet: z, content: tip.getBoundingClientRect().width / tip.offsetWidth,
    left: text ? (text.left - sheet.getBoundingClientRect().left) / z : null, height: text ? text.height / z : null, margin: PageLayout.getMarginsPx().left,
  };
});
const atSheetZoom = z => !!z && Math.abs(z.content / z.sheet - 1) < 0.006;

// Le contenu de la feuille au carré du zoom, comme chez la personne : le moteur ajoute au `zoom` de `.tiptap` celui de la feuille, par-dessus ce que la page en demande.
const DOUBLE_ZOOM = '#editor-container.a4-preview .v2-page-sheet > .tiptap { zoom: calc(var(--pp-fit-zoom, 1) * var(--pp-content-fix, 1)); }';

async function runDoubleZoom() {
  const tag = '[fr light, contenu au carré du zoom] ';
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: 'fr' }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 8, 1);
  const before = await zoomsOf(app);
  await addStyle(app, 'pp-test-double-zoom', DOUBLE_ZOOM);
  // Une frappe : la mise en page se refait avec ce style.
  await a.click('.pp-slide-thumb', 0, 500); await a.press('End'); await page.keyboard.type('x'); await sleep(1200);
  await page.keyboard.press('Backspace'); await sleep(1200);
  let z = await zoomsOf(app);
  check(tag + 'sans le style, le contenu est au zoom de la feuille ; avec lui, il y revient (pas à son carré)', atSheetZoom(before) && atSheetZoom(z), { before, z });
  check(tag + 'le texte de la diapositive est à sa taille et à sa marge de gauche (celles de la page, au zoom de la feuille)',
    !!z && z.left != null && Math.abs(z.left - z.margin) <= 1.5 && Math.abs(z.height - before.height) <= 1, { z, before });
  const fixed = await app.evaluate(() => document.getElementById('editor-container').style.getPropertyValue('--pp-content-fix'));
  check(tag + 'le rapport qui manque est posé sur le conteneur (1 / zoom de la feuille)', Math.abs(parseFloat(fixed) - 1 / z.sheet) < 0.02, { fixed, sheet: z.sheet });

  const duplicate = async (index) => {
    await a.hover('.pp-slide-thumb', index);
    await a.click('.pp-slide-more', index);
    await a.click('.pp-slide-menu.visible [data-action="duplicate"]', 0, 1500);
  };
  await duplicate(0);
  await duplicate(1);
  let offsets = await editorOffsets(app);
  z = await zoomsOf(app);
  check(tag + '« ⋯ » puis « Dupliquer » deux fois : chaque diapositive au haut de sa page, le contenu toujours au zoom de la feuille', (await slideCount(app)) === 3 && aligned(offsets) && atSheetZoom(z), { offsets, z });

  // Importer la première diapositive de « Fidélité » après celle du curseur.
  await a.click('.pp-slide-thumb', 1, 500);
  await a.click('.pp-slide-import-open', 0, 800);
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  await page.keyboard.type('fid');
  await sleep(250);
  await a.press('Enter');
  await sleep(500);
  await a.click('.pp-slide-import .pp-slide-thumb', 0, 1800);
  offsets = await editorOffsets(app);
  z = await zoomsOf(app);
  check(tag + '« Importer » une diapositive : chaque diapositive au haut de sa page, le contenu toujours au zoom de la feuille', (await slideCount(app)) === 4 && aligned(offsets) && atSheetZoom(z), { offsets, z });
  await a.click('.pp-slide-import-close', 0, 600);

  // Un autre zoom de la page (la pastille) : le rapport suit, rien ne glisse.
  await a.hover('.pp-page-zoom .pp-page-zoom-value');
  await a.click('.pp-page-zoom .pp-page-zoom-step', 1, 1500);
  await sweep2(a);
  offsets = await editorOffsets(app);
  z = await zoomsOf(app);
  check(tag + 'après un autre zoom de la page : le contenu est au zoom de la feuille, chaque diapositive au haut de sa page', aligned(offsets) && atSheetZoom(z) && Math.abs(z.sheet - before.sheet) > 0.02, { offsets, z, before: before.sheet });
  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}
const sweep2 = async (a) => { for (const [x, y] of [[300, 150], [380, 200], [450, 260], [400, 300]]) { await a.moveAt(x, y); await sleep(200); } await sleep(900); };

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 8, 1);

  // --- « ⋯ » puis « Dupliquer » : la copie commence au haut de la page 2 ; une seconde fois, chaque diapositive au haut de la sienne.
  const duplicate = async (index) => {
    await a.hover('.pp-slide-thumb', index);
    await a.click('.pp-slide-more', index);
    await a.click('.pp-slide-menu.visible [data-action="duplicate"]', 0, 1500);
  };
  await duplicate(0);
  let offsets = await editorOffsets(app);
  check(tag + '« ⋯ » puis « Dupliquer » : la copie de la diapositive 1 commence au haut du corps de la page 2, sous la couture', (await slideCount(app)) === 2 && aligned(offsets), offsets);
  await duplicate(1);
  offsets = await editorOffsets(app);
  check(tag + 'dupliquée une seconde fois : chaque diapositive commence au haut du corps de sa page', (await slideCount(app)) === 3 && aligned(offsets), offsets);

  // Le curseur à la fin de la diapositive 1 (un clic sur sa miniature, Fin) et une lettre tapée : une mise en page refaite à la frappe.
  const typeInFirst = async (letter) => { await a.click('.pp-slide-thumb', 0, 500); await a.press('End'); await page.keyboard.type(letter); await sleep(900); };
  // La souris qui passe sur la page.
  const sweep = async () => { for (const [x, y] of [[300, 150], [380, 200], [450, 260], [400, 300]]) { await a.moveAt(x, y); await sleep(200); } await sleep(900); };

  // --- Un style arrivé après coup grandit la diapositive 1, sans transaction : les suivantes restent au haut de leur page.
  await addStyle(app, 'pp-test-taller', `#editor-container .tiptap > p:first-child { padding-bottom: ${SHIFT}px; }`);
  await sleep(1200);
  offsets = await editorOffsets(app);
  check(tag + `un style arrivé après coup grandit la diapositive 1 de ${SHIFT} px : les diapositives d’après restent au haut de leur page`, aligned(offsets), offsets);
  // Mise en page refaite à la frappe avec ce style ; il part ensuite : la diapositive 1 raccourcit (le cas vu sous Firefox, la suivante au bas de la page d'avant).
  await typeInFirst('x');
  await removeStyle(app, 'pp-test-taller');
  await sleep(1200);
  offsets = await editorOffsets(app);
  check(tag + 'puis il part, après une frappe : la diapositive 1 raccourcit, la suivante ne remonte pas au bas de la page 1', aligned(offsets), offsets);

  // --- Une marge qui disparaît sans que rien ne change de taille, longtemps après la mise en page : la souris sur la page suffit.
  await addStyle(app, 'pp-test-margin', `#editor-container .tiptap > p:first-child { margin-bottom: ${SHIFT}px !important; }`);
  await typeInFirst('y');
  await sleep(2500);
  await removeStyle(app, 'pp-test-margin');
  await sleep(300);
  await sweep();
  offsets = await editorOffsets(app);
  check(tag + 'une marge de la diapositive 1 disparaît sans rien redimensionner : la souris qui passe sur la page remet les suivantes au haut de leur page', aligned(offsets), offsets);

  // --- Le bloc qui ouvre une diapositive n'est pas où le calcul l'attend : la réserve se corrige ; la marge retirée, la souris sur la page les remet en place.
  await addStyle(app, 'pp-test-pull', `#editor-container .tiptap > .page-break-marker + * { margin-top: -${SHIFT}px !important; }`);
  await typeInFirst('z');
  offsets = await editorOffsets(app);
  check(tag + `le bloc qui ouvre une diapositive tiré de ${SHIFT} px vers le haut : la réserve se corrige, chaque diapositive au haut de sa page`, aligned(offsets), offsets);
  await removeStyle(app, 'pp-test-pull');
  await sleep(300);
  await sweep();
  offsets = await editorOffsets(app);
  check(tag + 'le style retiré : la souris sur la page les remet au haut de leur page', aligned(offsets), offsets);

  // --- La Lecture : même correction, même surveillance.
  await addStyle(app, 'pp-test-pull-reader', `#reader-container .reader-content > .page-break-marker + * { margin-top: -${SHIFT}px !important; }`);
  await a.click('#btn-mode-read', 0, 300);
  await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
  await sleep(2500);
  let rOffsets = await readerOffsets(app);
  check(tag + `la Lecture, le bloc qui ouvre une diapositive tiré de ${SHIFT} px vers le haut : chaque diapositive au haut de sa page`, aligned(rOffsets), rOffsets);
  await removeStyle(app, 'pp-test-pull-reader');
  await sleep(300);
  await sweep();
  rOffsets = await readerOffsets(app);
  check(tag + 'la Lecture, le style retiré : la souris sur la page les remet au haut de leur page', aligned(rOffsets), rOffsets);
  await a.click('#btn-mode-edit', 0, 1200);

  // --- Fidélité : chaque repère à la même place de sa page dans l'éditeur, la Lecture et le diaporama ; des pages en 16:9.
  await open(A, 9, 4);
  const editor = await measure(app, 'editor');
  await a.click('#btn-mode-read', 0, 300);
  await app.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
  await sleep(2500);
  const reader = await measure(app, 'reader');
  await a.click('#btn-mode-edit', 0, 1200);
  await a.click('.pp-slide-thumb', 0, 500);
  await a.press('F5', 300);
  await app.waitForFunction(() => { const s = document.querySelector('.pp-slide-show'); const c = s && s.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const show = [];
  for (let i = 0; i < MARKS.length; i++) {
    const m = await measure(app, 'show');
    show.push({ ratio: m.ratios[0], mark: m.marks[MARKS[i]] });
    await a.press('ArrowRight', 500);
  }
  await a.press('Escape', 400);
  const close = (p, q) => !!p && !!q && Math.abs(p.x - q.x) <= 0.004 && Math.abs(p.y - q.y) <= 0.004;
  const same = MARKS.map((mark, k) => {
    const r = { mark, editor: editor.marks[mark], reader: reader.marks[mark], show: show[k].mark };
    return Object.assign(r, { ok: !!r.editor && r.editor.page === k && !!r.reader && r.reader.page === k && close(r.editor, r.reader) && close(r.editor, r.show) });
  });
  check(tag + 'fidélité : chaque diapositive montre son texte au même endroit de sa page dans l’éditeur, la Lecture et le diaporama (à 0,4 % près)', same.every(r => r.ok), same);
  const ratios = [...editor.ratios, ...reader.ratios, ...show.map(s => s.ratio)];
  check(tag + 'chaque page est en 16:9 dans les trois vues (pas plus allongée)', ratios.length >= 9 && ratios.every(r => Math.abs(r - 16 / 9) <= 0.01), ratios);

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await runDoubleZoom();
await t.finish();
