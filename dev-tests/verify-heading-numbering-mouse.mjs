#!/usr/bin/env node
// La numérotation des titres TELLE QU'ELLE EST PEINTE, et le style « Article » à la VRAIE souris, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre
// (16/10, demande d'Antoine : « Article x » pour un titre 1, « x.a » pour un titre 2, « x.a.1 » pour un titre 3, sans remettre « Article »).
//   1) Le texte que les compteurs CSS peignent devant chaque titre (css/editor-v2.css pour l'éditeur, css/style.css pour la Lecture), lu dans la mise en page du navigateur (CDP, DOMSnapshot :
//      `getComputedStyle(...).content` ne rend que la déclaration), est celui que HeadingNumbering écrit pour le sommaire, le PDF, le Word et le Markdown. Quatre styles (1) a) I), a) I) 1),
//      I) 1) a), Article), cinq documents (titres bien rangés, niveaux sautés, début par un titre 2, titres 2 seuls, début par un titre 3), dans l'éditeur puis en Lecture. Avant le correctif
//      du même jour, un titre 2 continuait ses lettres d'un titre 1 à l'autre (« c) » au lieu de « a) », « 2.c » au lieu de « 2.a ») : la racine remettait tous les compteurs à zéro, ce qui
//      masquait la remise à zéro des titres frères. Les exports repartaient bien, l'écran non.
//   2) Les numéros de notes de bas de page peints sont 1, 2, 3 : la même règle de racine, plus spécifique que `.tiptap { counter-reset: footnote-ref }`, leur retirait la leur (chaque note « 1 »).
//   3) Le bouton « Article 1 » du menu des titres, à la vraie souris : il tient dans le menu sur la même ligne que les quatre autres, sans défilement de côté ; un vrai clic pose la numérotation
//      (réglage du document, bouton actif) et le texte peint est « Article 1 », « 1.a », « 1.a.1 », « 1.b », « Article 2 », « 2.a », dans l'éditeur puis en Lecture ; les boutons « 1. » et
//      « Aucune » marchent toujours (rien ne disparaît).
//   4) Aucune erreur de page.
// À 400 px de haut, les boutons de numérotation sont sous le pli du menu : la personne le fait défiler, puis clique. Le premier appui donne le focus au bouton, ce qui remet le menu en haut
// (positionFlyout, js/editor-core.js) : le bouton s'éloigne avant le relâchement et le clic est perdu. Défaut plus ancien que ce lot, qui touche aussi « 1. », « a. » et « I. » : proposé à
// Antoine sur une carte, il n'est pas corrigé ici. Le script refait donc le geste (défiler, cliquer) quand le premier clic est perdu, et le dit sur une ligne « info » sans en faire un échec.
// Lancé par run-headless.mjs (groupe Node « headingNumberingMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-heading-numbering-mouse.mjs
import { open, stopServer, sleep, center } from './load-lib.mjs';

const PORT = Number(process.env.HEADING_NUMBERING_MOUSE_PORT || 9070);
const EDITOR_ROOT = '#editor-container .ProseMirror';
const READER_ROOT = '#reader-container .reader-content';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// ---- Le texte peint devant un élément ----
// Pour chaque élément de `selector` (dans l'ordre du document), le texte de son ::before TEL QUE LE NAVIGATEUR LE PEINT, compteurs résolus, lu dans l'instantané de mise en page (DOMSnapshot) :
// le pseudo-élément y est un nœud, dont chaque morceau de contenu (« Article », « 1 », « . », « a »...) est une boîte de texte.
async function paintedBefore(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    const wanted = [];
    for (const nodeId of nodeIds) wanted.push((await cdp.send('DOM.describeNode', { nodeId })).node.backendNodeId);
    const snap = await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
    const doc = snap.documents[0], strings = snap.strings, nodes = doc.nodes;
    const owner = new Map(); // indice du nœud dans l'instantané -> rang de l'élément demandé
    nodes.backendNodeId.forEach((backendId, index) => { const rank = wanted.indexOf(backendId); if (rank >= 0) owner.set(index, rank); });
    const pseudo = new Map();
    if (nodes.pseudoType) nodes.pseudoType.index.forEach((index, k) => pseudo.set(index, strings[nodes.pseudoType.value[k]]));
    const painted = wanted.map(() => '');
    for (let box = 0; box < doc.layout.nodeIndex.length; box++) {
      const text = doc.layout.text[box] >= 0 ? strings[doc.layout.text[box]] : '';
      if (!text) continue;
      let node = doc.layout.nodeIndex[box], inBefore = false;
      while (node >= 0 && !owner.has(node)) { if (pseudo.get(node) === 'before') inBefore = true; node = nodes.parentIndex[node]; }
      if (node >= 0 && inBefore) painted[owner.get(node)] += text;
    }
    return painted;
  } finally { await cdp.detach(); }
}
const headingsOf = root => ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(tag => `${root} > ${tag}`).join(', ');
const paintedHeadings = (page, root) => paintedBefore(page, headingsOf(root));
const scriptMarkers = (page, root, style) => page.evaluate(([selector, wanted]) => HeadingNumbering.markersFor(Array.from(document.querySelectorAll(selector)), wanted), [headingsOf(root), style]);

async function setDocument(page, html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await sleep(300);
}
// La Lecture dans la page, à côté de l'éditeur (les deux restent affichés pour que les deux soient mis en page), comme TestHelpers.renderReaderMode.
async function renderReader(page, html) {
  await page.evaluate(async h => {
    document.getElementById('reader-container').style.display = 'block';
    document.getElementById('editor-container').style.display = 'block';
    const noHeaderFooter = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
    await ReaderMode.render(h, null, { id: 1 }, noHeaderFooter);
  }, html);
  await sleep(300);
}
const docWith = (style, levels) => `<div class="heading-numbering-config" data-style="${style}"></div>` + levels.map((level, i) => `<h${level}>T${i}</h${level}>`).join('');

// ---- 1) et 2) Le texte peint est celui de HeadingNumbering ----
const STYLES = ['article', 'numeric', 'alpha', 'roman'];
const STRUCTURES = {
  'titres bien rangés': [1, 2, 3, 2, 1, 2, 3, 3, 2, 1, 2, 3, 4, 5, 6],
  'niveaux sautés': [1, 3, 2, 1, 3, 3, 2, 4],
  'début par un titre 2': [2, 1, 3, 2],
  'titres 2 seuls': [2, 2, 2],
  'début par un titre 3': [3, 3, 1, 3, 2, 3],
};
async function paintedMatchesScript(page, tag) {
  console.log(`\n[${tag}] Le texte peint par les compteurs CSS est celui de HeadingNumbering`);
  for (const surface of [{ name: 'éditeur', root: EDITOR_ROOT }, { name: 'Lecture', root: READER_ROOT }]) {
    for (const style of STYLES) {
      const differences = [];
      for (const [label, levels] of Object.entries(STRUCTURES)) {
        const html = docWith(style, levels);
        if (surface.root === EDITOR_ROOT) await setDocument(page, html); else await renderReader(page, html);
        const painted = await paintedHeadings(page, surface.root);
        const script = await scriptMarkers(page, surface.root, style);
        // Un texte peint vide ne compte pas comme « pareil » : un style que ni le script ni la feuille de style ne connaissent n'écrirait rien des deux côtés.
        painted.forEach((text, i) => { if (text !== script[i] || text === '') differences.push({ structure: label, titre: i, niveau: levels[i], peint: text, script: script[i] }); });
        if (painted.length !== levels.length) differences.push({ structure: label, titres_peints: painted.length, titres: levels.length });
      }
      const label = { article: 'Article', numeric: '1) a) I)', alpha: 'a) I) 1)', roman: 'I) 1) a)' }[style];
      check(`${tag} : ${surface.name}, style ${label}, les cinq documents sont peints comme HeadingNumbering les écrit`, differences.length === 0, differences.slice(0, 4));
    }
  }
  // Une vérification littérale, pour que le script et les compteurs ne puissent pas se tromper ensemble : le titre 2 repart à « a » sous le deuxième Article.
  await setDocument(page, docWith('article', [1, 2, 2, 1, 2, 3]));
  const editorTexts = await paintedHeadings(page, EDITOR_ROOT);
  check(`${tag} : éditeur, « Article 2 » remet les titres du dessous à zéro (Article 1, 1.a, 1.b, Article 2, 2.a, 2.a.1)`, JSON.stringify(editorTexts) === JSON.stringify(['Article 1 ', '1.a ', '1.b ', 'Article 2 ', '2.a ', '2.a.1 ']), editorTexts);
  await renderReader(page, docWith('article', [1, 2, 2, 1, 2, 3]));
  const readerTexts = await paintedHeadings(page, READER_ROOT);
  check(`${tag} : Lecture, « Article 2 » remet les titres du dessous à zéro (Article 1, 1.a, 1.b, Article 2, 2.a, 2.a.1)`, JSON.stringify(readerTexts) === JSON.stringify(['Article 1 ', '1.a ', '1.b ', 'Article 2 ', '2.a ', '2.a.1 ']), readerTexts);
}

async function footnotesAreNumbered(page, tag) {
  console.log(`\n[${tag}] Les notes de bas de page gardent leur numérotation continue`);
  const note = n => `<sup class="footnote-ref-marker" data-note-id="n${n}" data-note-text="x"></sup>`;
  for (const style of ['none', 'article']) {
    const html = `<div class="heading-numbering-config" data-style="${style}"></div><h1>Titre</h1><p>A${note(1)}</p><p>B${note(2)}</p><p>C${note(3)}</p>`;
    await setDocument(page, html);
    const inEditor = await paintedBefore(page, `${EDITOR_ROOT} .footnote-ref-marker`);
    check(`${tag} : éditeur, numérotation « ${style} », les trois notes sont peintes 1, 2, 3`, JSON.stringify(inEditor) === JSON.stringify(['1', '2', '3']), inEditor);
    await renderReader(page, html);
    const inReader = await paintedBefore(page, `${READER_ROOT} .footnote-ref-marker`);
    check(`${tag} : Lecture, numérotation « ${style} », les trois notes sont peintes 1, 2, 3`, JSON.stringify(inReader) === JSON.stringify(['1', '2', '3']), inReader);
  }
}

// ---- 3) Le menu des titres à la vraie souris ----
// Ouvre le menu au survol de la pastille « Titre », le fait défiler à la molette jusqu'aux boutons de numérotation, mesure le bouton demandé, clique dessus. Renvoie ce que la personne a vu.
async function pickNumbering(page, key) {
  const chip = await center(page, '#v2-heading-chip');
  await page.mouse.move(chip.x - 20, chip.y);
  await page.mouse.move(chip.x, chip.y, { steps: 4 });
  await sleep(450);
  const inside = await page.evaluate(() => { const r = document.getElementById('v2-heading-flyout').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 60 }; });
  await page.mouse.move(chip.x, chip.y + 15, { steps: 3 });
  await page.mouse.move(inside.x, inside.y, { steps: 6 });
  await sleep(200);
  const result = { key, attempts: 0, applied: false, firstClickLost: false, geometry: null };
  for (let attempt = 1; attempt <= 3 && !result.applied; attempt++) {
    result.attempts = attempt;
    await page.mouse.wheel(0, 400);
    await sleep(300);
    const seen = await page.evaluate(wantedKey => {
      const flyout = document.getElementById('v2-heading-flyout');
      const f = flyout.getBoundingClientRect();
      const buttons = Array.from(flyout.querySelectorAll('#v2-numbering-seg [data-num]'));
      const button = buttons.find(b => b.dataset.num === wantedKey);
      if (!button) return { missing: true, keys: buttons.map(b => b.dataset.num) };
      const b = button.getBoundingClientRect();
      const tops = buttons.map(x => Math.round(x.getBoundingClientRect().top));
      return {
        label: button.textContent.trim(), x: b.left + b.width / 2, y: b.top + b.height / 2, width: Math.round(b.width), height: Math.round(b.height),
        insideFlyout: b.left >= f.left && b.right <= f.right && b.top >= f.top && b.bottom <= f.bottom,
        oneRow: Math.max(...tops) - Math.min(...tops) <= 1, keys: buttons.map(x => x.dataset.num),
        sideScroll: flyout.scrollWidth - flyout.clientWidth, scrollTop: flyout.scrollTop,
      };
    }, key);
    if (seen.missing) { result.geometry = seen; return result; }
    if (attempt === 1) result.geometry = seen;
    await page.mouse.move(seen.x, seen.y, { steps: 4 });
    await sleep(150);
    await page.mouse.click(seen.x, seen.y);
    await sleep(350);
    result.applied = await page.evaluate(wantedKey => Editor.getHeadingNumberingStyle() === wantedKey, key);
    if (!result.applied && attempt === 1) result.firstClickLost = true;
  }
  await page.mouse.move(350, 390, { steps: 6 }); // hors du menu, dans le texte
  await sleep(500);
  return result;
}

const SAMPLE = '<h1>Objet</h1><p>Texte</p><h2>Définitions</h2><h3>Cas</h3><h2>Autres</h2><h1>Prix</h1><h2>Détail</h2>';
const WANTED = {
  article: ['Article 1 ', '1.a ', '1.a.1 ', '1.b ', 'Article 2 ', '2.a '],
  numeric: ['1) ', 'a) ', 'I) ', 'b) ', '2) ', 'a) '],
  none: ['', '', '', '', '', ''],
};

async function articleButton(page, tag) {
  console.log(`\n[${tag}] Le bouton « Article 1 » du menu des titres, à la vraie souris`);
  await setDocument(page, SAMPLE);
  const article = await pickNumbering(page, 'article');
  const g = article.geometry || {};
  check(`${tag} : le bouton « Article 1 » existe, avec ce libellé dans les deux langues`, !g.missing && g.label === 'Article 1', g);
  check(`${tag} : il est entier dans le menu, sur la même ligne que les quatre autres, sans défilement de côté`, !g.missing && g.insideFlyout === true && g.oneRow === true && g.sideScroll <= 0
    && JSON.stringify(g.keys) === JSON.stringify(['none', 'numeric', 'alpha', 'roman', 'article']), g);
  if (article.firstClickLost) console.log('  info - le premier clic a été perdu (le menu revient en haut quand le bouton prend le focus, défaut plus ancien, carte posée) ; geste refait');
  check(`${tag} : un vrai clic pose la numérotation « Article » (réglage du document, bouton actif)`, article.applied
    && await page.evaluate(() => document.querySelector('#v2-numbering-seg [data-num="article"]').classList.contains('active') && document.getElementById('v2-heading-numbering-select').value === 'article'), article);
  const inEditor = await paintedHeadings(page, EDITOR_ROOT);
  check(`${tag} : éditeur, les six titres sont peints Article 1, 1.a, 1.a.1, 1.b, Article 2, 2.a`, JSON.stringify(inEditor) === JSON.stringify(WANTED.article), inEditor);
  await renderReader(page, await page.evaluate(() => Editor.getHTML()));
  const inReader = await paintedHeadings(page, READER_ROOT);
  check(`${tag} : Lecture, les six titres sont peints de même`, JSON.stringify(inReader) === JSON.stringify(WANTED.article), inReader);

  // Rien ne disparaît : les autres boutons marchent toujours, et l'on repasse de l'un à l'autre.
  const numeric = await pickNumbering(page, 'numeric');
  const numericTexts = await paintedHeadings(page, EDITOR_ROOT);
  check(`${tag} : « 1. » marche toujours à la vraie souris et repart à « a) » sous le deuxième titre 1`, numeric.applied && JSON.stringify(numericTexts) === JSON.stringify(WANTED.numeric), { numeric, numericTexts });
  const none = await pickNumbering(page, 'none');
  const noneTexts = await paintedHeadings(page, EDITOR_ROOT);
  check(`${tag} : « Aucune » marche toujours à la vraie souris (aucun marqueur peint)`, none.applied && JSON.stringify(noneTexts) === JSON.stringify(WANTED.none), { none, noneTexts });
}

async function pass(lang, theme, tag, withPainted) {
  const w = await open({ spec: {}, port: PORT, settleMs: 1500, theme, lang });
  try {
    if (withPainted) {
      await paintedMatchesScript(w.page, tag);
      await footnotesAreNumbered(w.page, tag);
    }
    await articleButton(w.page, tag);
    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair', true);
  await pass('en', 'dark', 'anglais, sombre', false);
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
