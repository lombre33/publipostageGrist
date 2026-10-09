#!/usr/bin/env node
// Zone à deux colonnes coupée au saut de page (js/zone-page-cut.js) à la VRAIE souris et au VRAI clavier, dans le panneau de 700x400 d'Antoine - la demande du 09/10 : « quand je suis dans un module
// 2 colonnes dans l'éditeur, et que je fais des sauts de ligne, j'ai l'impression que ça ne déclenche dans l'éditeur jamais une deuxième page ». Ce que scenarios-zone-page-cut.js ne peut pas voir depuis la page :
//   1) une zone de deux pages et demie, colonnes inégales puis égales (page view par défaut, comme chez Antoine) : UNE couture DANS la zone, aucune ligne à cheval, les deux colonnes reprennent à la même
//      hauteur, tout en haut du corps de la page suivante, avec autant de lignes sur la première page ; un vrai clic sur une ligne de la page suivante y met le curseur, la flèche du bas franchit la couture
//      (de la dernière ligne de la page à la première de la suivante), celle du haut revient ;
//   2) le liseré de la zone et les bordures de ses colonnes (au survol, vraie souris) ne traversent pas les marges de la couture : la capture, relue pixel par pixel, est vierge sous le bas de la page qui
//      finit et au-dessus du haut de la suivante ;
//   3) le geste : un vrai clic à la fin de la dernière ligne d'une colonne qui touche le bas de la page, six fois Entrée au vrai clavier, puis une frappe : la page suivante s'ouvre dès que le bas est
//      passé (la ligne tapée y est), le document enregistré (Editor.getHTML) ne porte aucune trace de la coupure, Ctrl+Z (vrai clavier) rend la page unique et efface la règle de la feuille de style ;
//      Même geste avec Maj+Entrée (un retour à la ligne dans le dernier paragraphe de la colonne) : le paragraphe, d'un bloc, passe sous la couture ;
//      Dernière zone du modèle (rien après elle) : des Entrées seules n'ouvrent aucune page (comme les lignes vides de fin de modèle), un texte tapé après elles l'ouvre ;
//   4) la Lecture (vrai clic sur le bouton Lecture) coupe à la même ligne que l'éditeur, colonne par colonne ;
//   5) les lignes vides au bas des colonnes de la DERNIÈRE zone du document n'ouvrent aucune page (ni l'éditeur ni la Lecture : la Lecture et les exports les retirent) ; devant un paragraphe elles comptent ;
//   6) le thème sombre et l'anglais (mêmes mesures sur la zone inégale et la capture) ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « zoneCutMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-zone-page-cut-mouse.mjs
// ZONE_CUT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
// ZONE_CUT_VERBOSE=1 : écrit aussi les mesures des contrôles réussis ; ZONE_CUT_ONLY=2,3 : ne lance que ces scénarios.
import { mkdir, writeFile } from 'node:fs/promises';
import { open, stopServer, sleep, mode, fire } from './load-lib.mjs';

const PORT = Number(process.env.ZONE_CUT_PORT || 8996);
const SHOTS = process.env.ZONE_CUT_SHOTS || '';
const VERBOSE = !!process.env.ZONE_CUT_VERBOSE;
const ONLY = (process.env.ZONE_CUT_ONLY || '').split(',').filter(Boolean);
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name + (VERBOSE && notes !== undefined ? ' ' + JSON.stringify(notes) : ''));
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
async function scenario(title, fn, options = {}) {
  if (ONLY.length && !ONLY.includes(title[0])) return;
  console.log('\n' + title);
  let w = null;
  try {
    w = await open(Object.assign({ spec: SPEC, port: PORT, settleMs: 1200 }, options));
    await w.page.evaluate(installProbes);
    await fn(w);
    check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
  } catch (e) {
    check(title + ' : le scénario va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    if (w) await w.close();
  }
}

// --- Les documents ---
const rows = (k, tag) => Array.from({ length: k }, (_, i) => `<p>${tag} ${i + 1}</p>`).join('');
const blanks = n => '<p></p>'.repeat(n);
const zone = (left, right) => `<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">${left}</div><div class="two-columns-column">${right}</div></div>`;
const HEAD = '<h1>Courrier</h1><p>Introduction du document.</p>';
const FIN = '<p>Fin du document.</p>';

// Sondes posées dans la page : les couches de l'éditeur ou de la Lecture, lues dans leur DOM réel (rectangles à l'écran).
function installProbes() {
  const scopes = {
    editor: { bands: '#editor-container .v2-pagination-overlay .v2-page-band', columns: '#editor-container .tiptap .two-columns-zone > .two-columns-column' },
    reader: { bands: '#reader-container .v2-pagination-overlay .v2-page-band', columns: '#reader-container .reader-content .two-columns-zone > .two-columns-column' },
  };
  const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  window.__z = {
    // Les coutures de la zone de page, de haut en bas : la bande entière et sa gouttière grise (qui porte le libellé « Page N »).
    bands(scope) {
      return Array.from(document.querySelectorAll(scopes[scope].bands)).map(band => {
        const divider = band.querySelector('.v2-page-seam-divider');
        return Object.assign(rect(band), { divider: divider ? rect(divider) : null });
      }).sort((a, b) => a.top - b.top);
    },
    // Les lignes (blocs de premier niveau) de chaque colonne de la première zone.
    columns(scope) {
      return Array.from(document.querySelectorAll(scopes[scope].columns)).map(column => Array.from(column.children).map(row => Object.assign(rect(row), { text: row.textContent })));
    },
    zoneRect(scope) {
      const zone = document.querySelector(scopes[scope].columns.replace(/ > \.two-columns-column$/, ''));
      return zone ? rect(zone) : null;
    },
    selectionText() {
      const node = window.getSelection().anchorNode;
      const block = node && (node.nodeType === 1 ? node : node.parentElement);
      const row = block && block.closest('.two-columns-column > *');
      return row ? row.textContent : '';
    },
    bandRules() {
      const sheet = document.getElementById('v2-pagination-margins-style');
      return sheet ? sheet.textContent : '';
    },
  };
}

// Les lignes de chaque colonne rangées par rapport à la couture : avant (finies au-dessus), après (commencent au-dessous), à cheval.
function splitAt(columns, band) {
  return columns.map(column => {
    const out = { before: [], after: [], straddle: [] };
    column.forEach(row => {
      if (row.bottom <= band.top + 1) out.before.push(row);
      else if (row.top >= band.bottom - 1) out.after.push(row);
      else out.straddle.push(row);
    });
    return out;
  });
}

// Le nombre de pixels de la capture qui diffèrent du fond de la feuille, dans les deux morceaux de la couture qui sont transparents (le bas de la page qui finit, le haut de la suivante : la gouttière grise
// est exclue), sur toute la largeur de la zone et 4 px de part et d'autre.
async function strayInk(page, band, zoneRect) {
  const x = Math.max(0, Math.floor(zoneRect.left) - 4);
  const width = Math.min(700 - x, Math.ceil(zoneRect.right - zoneRect.left) + 8);
  const parts = [
    ['bas de la page qui finit', band.top + 1, band.divider.top - 1],
    ['haut de la page suivante', band.divider.bottom + 1, band.bottom - 1],
  ].filter(([, from, to]) => to - from >= 2);
  const found = {};
  for (const [label, from, to] of parts) {
    const top = Math.max(0, Math.ceil(from)); const height = Math.min(400 - top, Math.floor(to - from));
    if (height < 2) continue;
    const png = await page.screenshot({ clip: { x, y: top, width, height } });
    found[label] = await page.evaluate(async b64 => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const ground = [data[0], data[1], data[2]];
      let different = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - ground[0]) > 10 || Math.abs(data[i + 1] - ground[1]) > 10 || Math.abs(data[i + 2] - ground[2]) > 10) different++;
      }
      return { different, pixels: canvas.width * canvas.height };
    }, png.toString('base64'));
  }
  return found;
}

// La capacité de la page vue par l'éditeur lui-même : le plus grand nombre de lignes à gauche d'une zone (après un titre et un paragraphe) qui ne font aucune couture, par dichotomie (chaque essai est un vrai rendu).
async function editorCapacity(page) {
  const bandsFor = async n => { await setDocument(page, HEAD + zone(rows(n, 'Haut'), rows(3, 'Bas')) + FIN); return (await probe(page, () => window.__z.bands('editor'))).length; };
  let fits = 20, over = 120;
  while (over - fits > 1) { const mid = (fits + over) >> 1; if ((await bandsFor(mid)) === 0) fits = mid; else over = mid; }
  return fits;
}
async function shot(page, name) { if (SHOTS) await writeFile(`${SHOTS}/${name}.png`, await page.screenshot()); }
async function setDocument(page, html) {
  await page.evaluate(h => { Editor.setHTML(h); }, html);
  await fire(page, 'PbClients', 1);
  await sleep(900);
}
async function bringToView(page, scope, index = 0) {
  await page.evaluate(({ scope, index }) => {
    const sel = scope === 'reader' ? '#reader-container .v2-pagination-overlay .v2-page-band' : '#editor-container .v2-pagination-overlay .v2-page-band';
    const band = document.querySelectorAll(sel)[index];
    if (band) band.scrollIntoView({ block: 'center' });
  }, { scope, index });
  await sleep(350);
}
async function clickAt(page, x, y) {
  await page.mouse.move(x - 15, y); await page.mouse.move(x, y, { steps: 3 }); await sleep(50);
  await page.mouse.click(x, y);
  await sleep(120);
}
const probe = (page, fn, arg) => page.evaluate(fn, arg);

// --- 1 à 2, 6 : la zone coupée, ses lignes, le curseur, le liseré ---
async function cutZone(w, label) {
  const { page } = w;
  check(label + ' : la vue en pages est celle de départ (case « Aperçu A4 » cochée)', await page.evaluate(() => document.getElementById('v2-toggle-a4-preview').checked && document.getElementById('editor-container').classList.contains('a4-preview')));

  // Colonnes inégales : la gauche passe le bas de la page, la droite tient sur la première.
  await setDocument(page, HEAD + zone(rows(60, 'Gauche'), rows(45, 'Droite')) + FIN);
  let bands = await probe(page, () => window.__z.bands('editor'));
  check(label + ' : colonnes inégales : une couture, DANS la zone', bands.length === 1, bands);
  let columns = await probe(page, () => window.__z.columns('editor'));
  let zoneRect = await probe(page, () => window.__z.zoneRect('editor'));
  check(label + ' : la couture est entre le haut et le bas de la zone', bands.length === 1 && zoneRect.top < bands[0].top && bands[0].bottom < zoneRect.bottom, { band: bands[0], zone: zoneRect });
  let split = bands.length ? splitAt(columns, bands[0]) : null;
  check(label + ' : aucune ligne à cheval sur la couture', !!split && split.every(s => s.straddle.length === 0), split && split.map(s => s.straddle.map(r => r.text)));
  check(label + ' : la colonne haute continue sur la page suivante, la courte finit sur la première', !!split && split[0].after.length > 0 && split[0].before.length > 0 && split[1].after.length === 0 && split[1].before.length === 45, split && split.map(s => s.before.length + ' avant, ' + s.after.length + ' après'));
  const capacity = split ? split[0].before.length : 0;
  check(label + ' : toute la colonne gauche s\'enchaîne sans trou (60 lignes, aucune perdue)', !!split && split[0].before.length + split[0].after.length === 60, split && split[0].before.length + split[0].after.length);

  // Colonnes égales : les deux reprennent à la même hauteur, tout en haut de la page suivante, avec autant de lignes sur la première.
  await setDocument(page, HEAD + zone(rows(capacity + 8, 'Gauche'), rows(capacity + 5, 'Droite')) + FIN);
  bands = await probe(page, () => window.__z.bands('editor'));
  columns = await probe(page, () => window.__z.columns('editor'));
  zoneRect = await probe(page, () => window.__z.zoneRect('editor'));
  split = bands.length === 1 ? splitAt(columns, bands[0]) : null;
  check(label + ' : colonnes égales : une couture, autant de lignes sur la première page des deux côtés (' + capacity + ')', !!split && split.every(s => s.before.length === capacity && s.straddle.length === 0), split && split.map(s => s.before.length + ' avant, ' + s.after.length + ' après, ' + s.straddle.length + ' à cheval'));
  if (split && split.every(s => s.after.length)) {
    const tops = split.map(s => s.after[0].top);
    check(label + ' : les deux colonnes reprennent à la même hauteur (écart ' + Math.abs(tops[0] - tops[1]).toFixed(1) + ' px)', Math.abs(tops[0] - tops[1]) <= 1, tops);
    check(label + ' : et tout en haut du corps de la page suivante, sous la couture (écart ' + Math.abs(tops[0] - bands[0].bottom).toFixed(1) + ' px)', Math.abs(tops[0] - bands[0].bottom) <= 2, { top: tops[0], seamBottom: bands[0].bottom });
  } else check(label + ' : les deux colonnes ont des lignes sur la page suivante', false, split);

  // Le curseur : un vrai clic sur une ligne de la page suivante, puis la flèche du bas et du haut au vrai clavier.
  if (split && split[0].after.length) {
    await bringToView(page, 'editor');
    columns = await probe(page, () => window.__z.columns('editor'));
    bands = await probe(page, () => window.__z.bands('editor'));
    split = splitAt(columns, bands[0]);
    const target = split[0].after[2];
    await clickAt(page, target.left + 40, (target.top + target.bottom) / 2);
    const clicked = await probe(page, () => window.__z.selectionText());
    check(label + ' : un vrai clic sur « ' + target.text + ' », de l\'autre côté de la couture, y met le curseur', clicked === target.text, clicked);
    const last = split[0].before[split[0].before.length - 1]; const first = split[0].after[0];
    await clickAt(page, last.left + 40, (last.top + last.bottom) / 2);
    check(label + ' : un vrai clic sur la dernière ligne de la première page y met le curseur', (await probe(page, () => window.__z.selectionText())) === last.text);
    await page.keyboard.press('ArrowDown'); await sleep(150);
    const down = await probe(page, () => window.__z.selectionText());
    check(label + ' : la flèche du bas franchit la couture (« ' + last.text + ' » vers « ' + first.text + ' »)', down === first.text, down);
    await page.keyboard.press('ArrowUp'); await sleep(150);
    const up = await probe(page, () => window.__z.selectionText());
    check(label + ' : la flèche du haut revient', up === last.text, up);
    await shot(page, label.replace(/\W+/g, '-') + '-editeur');

    // Le liseré et les bordures des colonnes (survol, vraie souris) ne traversent pas les marges de la couture.
    columns = await probe(page, () => window.__z.columns('editor'));
    bands = await probe(page, () => window.__z.bands('editor'));
    zoneRect = await probe(page, () => window.__z.zoneRect('editor'));
    // Une ligne de la page qui finit, visible juste au-dessus de la couture (la souris est sur la zone, comme quand on y écrit).
    const above = splitAt(columns, bands[0])[0].before;
    const hover = above[above.length - 4];
    const hoverY = (hover.top + hover.bottom) / 2;
    await page.mouse.move(hover.left + 60, hoverY - 25); await page.mouse.move(hover.left + 60, hoverY, { steps: 4 }); await sleep(250);
    const hovered = await probe(page, () => { const z = document.querySelector('#editor-container .tiptap .two-columns-zone'); return !!z && z.matches(':hover') && getComputedStyle(z.querySelector('.two-columns-column')).borderTopColor !== 'rgba(0, 0, 0, 0)'; });
    check(label + ' : le survol de la zone montre bien les bordures des colonnes', hovered);
    const ink = await strayInk(page, bands[0], zoneRect);
    const stray = Object.entries(ink).filter(([, v]) => v.different > 0);
    check(label + ' : sous le bas de la première page et au-dessus de la seconde, ni liseré ni bordure (aucun pixel qui diffère du fond)', stray.length === 0 && Object.keys(ink).length >= 1, ink);
    await shot(page, label.replace(/\W+/g, '-') + '-survol');
    await page.mouse.move(5, 5); await sleep(100);
  }
  return capacity;
}

await scenario('1) La zone coupée : couture dans la zone, lignes, curseur, liseré', async w => { await cutZone(w, 'clair, français'); });

// --- 3 : le geste d'Antoine ---
await scenario('2) Entrée au vrai clavier dans une colonne : la page suivante s\'ouvre', async w => {
  const { page } = w;
  const fits = await editorCapacity(page);
  check('la capacité de la page (' + fits + ' lignes à gauche) est trouvée', fits > 20 && fits < 119, fits);
  const start = HEAD + zone(rows(fits - 2, 'Haut'), rows(3, 'Bas')) + FIN;
  await setDocument(page, start);
  const initial = await page.evaluate(() => Editor.getHTML());
  check('avant les Entrées : une seule page', (await probe(page, () => window.__z.bands('editor'))).length === 0);
  await bringToView(page, 'editor');
  const columns = await probe(page, () => window.__z.columns('editor'));
  const lastRow = columns[0][columns[0].length - 1];
  // Le dernier rang de la colonne est peut-être sous le bord de l'écran : le défilement l'amène à la vue avant le clic.
  await page.evaluate(() => { const col = document.querySelector('#editor-container .tiptap .two-columns-column'); col.lastElementChild.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  const fresh = (await probe(page, () => window.__z.columns('editor')))[0];
  const target = fresh[fresh.length - 1];
  await clickAt(page, target.left + 60, (target.top + target.bottom) / 2);
  check('un vrai clic à la fin de la dernière ligne de la colonne y met le curseur (« ' + lastRow.text + ' »)', (await probe(page, () => window.__z.selectionText())) === lastRow.text, await probe(page, () => window.__z.selectionText()));
  const seen = [];
  for (let i = 1; i <= 6; i++) {
    await page.keyboard.press('Enter');
    await sleep(450); // la pagination se recalcule 200 ms après la dernière modification
    seen.push((await probe(page, () => window.__z.bands('editor'))).length);
  }
  check('les Entrées ouvrent la page suivante dès que le bas est passé (coutures après chaque Entrée : ' + seen.join(', ') + ')', seen[0] === 0 && seen[seen.length - 1] === 1, seen);
  await page.keyboard.type('Dernier');
  await sleep(500);
  const bands = await probe(page, () => window.__z.bands('editor'));
  const typed = await probe(page, () => { const sel = window.getSelection(); const node = sel.anchorNode; const el = node && (node.nodeType === 1 ? node : node.parentElement); return el ? { text: el.textContent, top: el.getBoundingClientRect().top } : null; });
  check('la ligne tapée (« Dernier ») est sous la couture, sur la page suivante', bands.length === 1 && !!typed && typed.text === 'Dernier' && typed.top >= bands[0].bottom - 1, { bands: bands.length, typed });
  await shot(page, 'entree-vrai-clavier');
  const saved = await page.evaluate(() => Editor.getHTML());
  check('le document enregistré porte les lignes tapées et rien de la coupure (ni marge, ni !important, ni style)', /Dernier/.test(saved) && !/margin-top|!important|<style|pagination/.test(saved), saved.slice(-300));
  const rules = await probe(page, () => window.__z.bandRules());
  check('la feuille de style de pagination porte une règle pour la zone (marge haute de la ligne qui ouvre la page)', /two-columns-zone > \.two-columns-column:nth-child\(1\) > :nth-child\(\d+\) \{ margin-top: [\d.]+px !important; \}/.test(rules), rules.slice(0, 300));
  // Ctrl+Z, au vrai clavier : jusqu'au document de départ.
  let undone = 0;
  for (; undone < 20; undone++) {
    if ((await page.evaluate(() => Editor.getHTML())) === initial) break;
    await page.keyboard.press('Control+z'); await sleep(120);
  }
  await sleep(500);
  check('Ctrl+Z ramène le document d\'avant (' + undone + ' appuis)', (await page.evaluate(() => Editor.getHTML())) === initial, undone);
  check('et la page redevient unique', (await probe(page, () => window.__z.bands('editor'))).length === 0);
  const after = await probe(page, () => window.__z.bandRules());
  check('et la règle de la zone a quitté la feuille de style de pagination', !/two-columns-zone > \.two-columns-column/.test(after), after.slice(0, 300));
});

// --- 3 bis : le retour à la ligne (Maj+Entrée) ---
await scenario('2b) Maj+Entrée au vrai clavier dans un paragraphe de colonne : le paragraphe passe sur la page suivante', async w => {
  const { page } = w;
  const fits = await editorCapacity(page);
  await setDocument(page, HEAD + zone(rows(fits - 6, 'Haut') + '<p>Fin de colonne</p>', rows(3, 'Bas')) + FIN);
  const initial = await page.evaluate(() => Editor.getHTML());
  check('avant les retours à la ligne : une seule page', (await probe(page, () => window.__z.bands('editor'))).length === 0);
  await page.evaluate(() => { const col = document.querySelector('#editor-container .tiptap .two-columns-column'); col.lastElementChild.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  const fresh = (await probe(page, () => window.__z.columns('editor')))[0];
  const target = fresh[fresh.length - 1];
  await clickAt(page, target.left + 120, (target.top + target.bottom) / 2);
  check('un vrai clic à la fin de la dernière ligne de la colonne y met le curseur', (await probe(page, () => window.__z.selectionText())) === 'Fin de colonne', await probe(page, () => window.__z.selectionText()));
  const seen = [];
  for (let i = 1; i <= 8; i++) {
    await page.keyboard.press('Shift+Enter');
    await sleep(450);
    seen.push((await probe(page, () => window.__z.bands('editor'))).length);
  }
  check('les retours à la ligne ouvrent la page suivante dès que le paragraphe ne tient plus (coutures après chacun : ' + seen.join(', ') + ')', seen[0] === 0 && seen[seen.length - 1] === 1, seen);
  await page.keyboard.type('Suite');
  await sleep(500);
  const bands = await probe(page, () => window.__z.bands('editor'));
  const column = (await probe(page, () => window.__z.columns('editor')))[0];
  const paragraph = column[column.length - 1];
  check('le paragraphe tout entier est sous la couture (d\'un bloc, comme tout paragraphe de l\'éditeur), jamais à cheval', bands.length === 1 && paragraph.top >= bands[0].bottom - 1, { bands: bands.length, paragraph });
  check('la ligne tapée (« Suite ») est dans ce paragraphe', (await probe(page, () => window.__z.selectionText())).endsWith('Suite'), await probe(page, () => window.__z.selectionText()));
  await shot(page, 'maj-entree-vrai-clavier');
  let undone = 0;
  for (; undone < 20; undone++) {
    if ((await page.evaluate(() => Editor.getHTML())) === initial) break;
    await page.keyboard.press('Control+z'); await sleep(120);
  }
  await sleep(500);
  check('Ctrl+Z ramène le document d\'avant (' + undone + ' appuis) et la page redevient unique', (await page.evaluate(() => Editor.getHTML())) === initial && (await probe(page, () => window.__z.bands('editor'))).length === 0, undone);
});

// --- 3 ter : la dernière zone du modèle ---
await scenario('2c) Dernière zone du modèle : des Entrées seules n\'ouvrent pas de page, du texte tapé oui', async w => {
  const { page } = w;
  const fits = await editorCapacity(page);
  await setDocument(page, HEAD + zone(rows(fits - 2, 'Haut'), rows(3, 'Bas')));
  const initial = await page.evaluate(() => Editor.getHTML());
  await page.evaluate(() => { const col = document.querySelector('#editor-container .tiptap .two-columns-column'); col.lastElementChild.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  const fresh = (await probe(page, () => window.__z.columns('editor')))[0];
  const target = fresh[fresh.length - 1];
  await clickAt(page, target.left + 60, (target.top + target.bottom) / 2);
  const seen = [];
  for (let i = 1; i <= 6; i++) {
    await page.keyboard.press('Enter');
    await sleep(450);
    seen.push((await probe(page, () => window.__z.bands('editor'))).length);
  }
  check('six Entrées seules au bas de la dernière zone : aucune page ne s\'ouvre (comme en fin de modèle ; coutures après chacune : ' + seen.join(', ') + ')', seen.every(n => n === 0), seen);
  await page.keyboard.type('Dernier');
  await sleep(500);
  const bands = await probe(page, () => window.__z.bands('editor'));
  const typed = await probe(page, () => { const sel = window.getSelection(); const node = sel.anchorNode; const el = node && (node.nodeType === 1 ? node : node.parentElement); return el ? { text: el.textContent, top: el.getBoundingClientRect().top } : null; });
  check('dès qu\'un texte est tapé après ces lignes vides, la page suivante s\'ouvre et le texte y est', bands.length === 1 && !!typed && typed.text === 'Dernier' && typed.top >= bands[0].bottom - 1, { bands: bands.length, typed });
  await shot(page, 'derniere-zone-entrees-puis-texte');
  let undone = 0;
  for (; undone < 20; undone++) {
    if ((await page.evaluate(() => Editor.getHTML())) === initial) break;
    await page.keyboard.press('Control+z'); await sleep(120);
  }
  await sleep(500);
  check('Ctrl+Z ramène le document d\'avant (' + undone + ' appuis) et la page redevient unique', (await page.evaluate(() => Editor.getHTML())) === initial && (await probe(page, () => window.__z.bands('editor'))).length === 0, undone);
});

// --- 4 : la Lecture ---
await scenario('3) La Lecture coupe à la même ligne que l\'éditeur', async w => {
  const { page } = w;
  await setDocument(page, HEAD + zone(rows(80, 'Gauche'), rows(70, 'Droite')) + FIN);
  const bands = await probe(page, () => window.__z.bands('editor'));
  const columns = await probe(page, () => window.__z.columns('editor'));
  const editorSplit = bands.length ? bands.map(band => splitAt(columns, band)) : [];
  const firstsEditor = editorSplit.map(parts => parts.map(part => part.after.length ? part.after[0].text : null));
  await mode(w.page, 'read');
  await sleep(1200);
  const readerBands = await probe(page, () => window.__z.bands('reader'));
  const readerColumns = await probe(page, () => window.__z.columns('reader'));
  const readerSplit = readerBands.map(band => splitAt(readerColumns, band));
  const firstsReader = readerSplit.map(parts => parts.map(part => part.after.length ? part.after[0].text : null));
  check('la Lecture a autant de coutures que l\'éditeur (' + bands.length + ')', bands.length >= 1 && readerBands.length === bands.length, { editeur: bands.length, lecture: readerBands.length });
  check('aucune ligne à cheval sur une couture de la Lecture', readerSplit.every(parts => parts.every(part => part.straddle.length === 0)), readerSplit.map(parts => parts.map(part => part.straddle.map(r => r.text))));
  check('la première ligne de chaque colonne sur chaque page suivante est la même dans la Lecture et dans l\'éditeur', JSON.stringify(firstsReader) === JSON.stringify(firstsEditor), { editeur: firstsEditor, lecture: firstsReader });
  await bringToView(page, 'reader');
  await shot(page, 'lecture');
});

// --- 5 : les lignes vides de la dernière zone ---
await scenario('4) Lignes vides au bas de la dernière zone : aucune page de plus', async w => {
  const { page } = w;
  const fits = await editorCapacity(page);
  await setDocument(page, HEAD + zone(rows(fits - 3, 'Haut') + blanks(15), rows(3, 'Bas') + blanks(15)));
  check('dernière zone, quinze lignes vides en bas des colonnes : aucune couture dans l\'éditeur', (await probe(page, () => window.__z.bands('editor'))).length === 0, await probe(page, () => window.__z.bands('editor')));
  await setDocument(page, HEAD + zone(rows(fits - 3, 'Haut') + blanks(15), rows(3, 'Bas') + blanks(15)) + FIN);
  check('les mêmes lignes devant un paragraphe : la page suivante s\'ouvre', (await probe(page, () => window.__z.bands('editor'))).length === 1, await probe(page, () => window.__z.bands('editor')));
  await setDocument(page, HEAD + zone(rows(fits - 3, 'Haut') + blanks(15), rows(3, 'Bas') + blanks(15)));
  await mode(w.page, 'read');
  await sleep(1200);
  check('la Lecture du même document sans paragraphe après : aucune couture non plus', (await probe(page, () => window.__z.bands('reader'))).length === 0, await probe(page, () => window.__z.bands('reader')));
});

// --- 6 : sombre, anglais ---
await scenario('5) Thème sombre, anglais : la même coupure, le même liseré', async w => { await cutZone(w, 'sombre, anglais'); }, { theme: 'dark', lang: 'en' });

await stopServer();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
