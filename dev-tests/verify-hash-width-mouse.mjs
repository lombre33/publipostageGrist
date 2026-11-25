#!/usr/bin/env node
// La LARGEUR de la liste « # » (25/11, « j'ai l'impression que la largeur du menu # dépend du nom de variable le plus long ? peux-tu prévoir une taille fixe pour uniformiser, assez
// large, avec un retour à la ligne quand un nom est trop long »). Avant : `min-width: 160px; max-width: 320px` sans `width`, donc la largeur de la ligne la plus longue (162 px pour
// « Projets.Ville », 322 px dès qu'un nom long était dans la liste, et elle changeait à chaque frappe) ; un nom long était COUPÉ, avec un défilement à l'horizontale.
// À la vraie souris et au vrai clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre, puis dans un cadre étroit (340 px) :
//   1) la largeur est FIXE : 360 px, qu'il y ait une ligne ou toutes, des noms courts ou longs, sur l'onglet des variables comme sur celui des puces, à chaque frappe et à chaque effacement ;
//   2) un nom trop long passe à la ligne au lieu d'élargir le panneau : toutes ses lettres sont lues (rien de coupé), aucun défilement à l'horizontale, chaque ligne reste dans le panneau ;
//      la coupure tombe derrière un « _ » ou un « . » (entre deux mots du nom), sauf pour un mot sans séparateur plus long que la ligne, coupé à la lettre près ;
//   3) un nom court reste un seul nœud texte, sans `<wbr>` (la liste n'a pas de limite de longueur : pas de nœuds en plus pour rien), et son texte est celui de la clé ;
//   4) un vrai clic sur la SECONDE ligne d'un nom qui passe à la ligne pose la variable entière ; la liste est au premier plan, dans la fenêtre ;
//   5) dans un cadre plus étroit que le panneau, il garde sa marge (6 px) de chaque côté, sans défilement à l'horizontale ;
//   6) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « hashWidthMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-hash-width-mouse.mjs
// HASH_WIDTH_SHOTS=<dossier> enregistre une capture de la liste par passe.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.HASH_WIDTH_MOUSE_PORT || 9045);
const SHOTS = process.env.HASH_WIDTH_SHOTS || '';
const WIDTH = 360;
const LONG_DATE = 'Projets.Date_de_signature_du_contrat_de_financement_principal';
const LONG_RESP = 'Projets.Responsable_scientifique_et_technique_du_projet_collaboratif';
const NO_SEPARATOR = 'Projets.' + 'Identifiantsansseparateurquidepasselalargeurdupanneau'.repeat(2);
const SPEC = { tables: [
  { id: 'Projets', rows: 2, columns: [
    { id: 'Nom', type: 'Text' }, { id: 'Ville', type: 'Text' },
    { id: 'Date_de_signature_du_contrat_de_financement_principal', type: 'Text' },
    { id: 'Responsable_scientifique_et_technique_du_projet_collaboratif', type: 'Text' },
    { id: 'Identifiantsansseparateurquidepasselalargeurdupanneau'.repeat(2), type: 'Text' },
    { id: 'Budget_prevu', type: 'Numeric' },
  ] },
  { id: 'Entites', rows: 2, columns: [{ id: 'Nom', type: 'Text' }, { id: 'Cp', type: 'Text' }] },
] };
const BOX = '#autocomplete-box';
const TAB = name => `${BOX} .ac-tab[data-tab="${name}"]`;

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// La liste telle qu'elle est PEINTE : sa largeur, sa place dans la fenêtre, le défilement à l'horizontale de sa partie qui défile, ses lignes (texte, hauteur, bord droit).
const listState = page => page.evaluate(() => {
  const box = document.getElementById('autocomplete-box');
  const shown = !!box && box.style.display !== 'none' && box.getClientRects().length > 0;
  if (!shown) return { shown: false };
  const r = box.getBoundingClientRect();
  const list = box.querySelector('.ac-items');
  const rows = Array.from(list.querySelectorAll('.ac-item'));
  return {
    shown, width: r.width, left: r.left, right: r.right, window: [innerWidth, innerHeight],
    hOverflow: list.scrollWidth > list.clientWidth + 0.5, tab: box.querySelector('.ac-tab.active').dataset.tab,
    rows: rows.map(row => { const q = row.getBoundingClientRect(); return { text: row.textContent, height: Math.round(q.height), right: q.right, nodes: row.childNodes.length, wbr: row.querySelectorAll('wbr').length }; }),
  };
});
// Où le nom d'une ligne passe à la ligne : le dernier caractère de chaque ligne sauf la dernière, d'après la place peinte de chaque lettre.
const lineEnds = (page, text) => page.evaluate(wanted => {
  const row = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(e => e.textContent === wanted);
  if (!row) return null;
  const letters = [];
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let i = 0; i < node.data.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      letters.push({ c: node.data[i], top: range.getBoundingClientRect().top });
    }
  }
  const ends = [];
  letters.forEach((letter, i) => { if (i && letter.top > letters[i - 1].top + 3) ends.push(letters[i - 1].c); });
  return { lines: ends.length + 1, ends };
}, text);
const resetDocument = async page => {
  await page.evaluate(() => EditorCore.getEditor().commands.setContent('<p></p>'));
  await sleep(250);
  await click(page, '.tiptap p');
  await sleep(250);
};
const typeHash = async (page, query = '') => {
  await page.keyboard.type('Lot #' + query);
  await sleep(800);
};
const around = (a, b, margin = 0.6) => Math.abs(a - b) <= margin;

async function pass(lang, theme, tag, width) {
  const narrow = width < 700;
  const expected = narrow ? width - 12 : WIDTH; // dans un cadre étroit : 6 px de marge de chaque côté (max-width: calc(100vw - 12px))
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang, width, height: 400 });
  try {
    const { page } = w;
    await click(page, '.tiptap p');
    await sleep(300);

    console.log(`\n[${tag}] La largeur ne dépend plus des lignes`);
    await typeHash(page);
    const all = await listState(page);
    check(`${tag} : « Lot # » ouvre la liste, toutes les variables, sur l'onglet des variables`, all.shown && all.tab === 'variables' && all.rows.length >= 8, all);
    check(`${tag} : la liste fait ${expected} px de large (${all.width})`, around(all.width, expected), all.width);
    check(`${tag} : elle est entière dans la fenêtre ${all.window.join('×')} (de ${Math.round(all.left)} à ${Math.round(all.right)})`, all.left >= 0 && all.right <= all.window[0] + 0.5, all);
    if (SHOTS) { await mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `liste-diese-largeur-${lang}-${theme}-${width}.png`), clip: { x: 0, y: 0, width, height: 400 } }); }

    // Une saisie qui réduit la liste, lettre après lettre, puis qui l'élargit en effaçant : la largeur ne bouge pas d'un pixel.
    const widths = [all.width];
    for (const letter of 'Respons') { await page.keyboard.type(letter); await sleep(250); const s = await listState(page); widths.push(s.shown ? s.width : -1); }
    for (let i = 0; i < 7; i++) { await page.keyboard.press('Backspace'); await sleep(250); const s = await listState(page); widths.push(s.shown ? s.width : -1); }
    check(`${tag} : la largeur reste la même à chaque lettre tapée puis effacée (${widths.length} mesures)`, widths.every(x => around(x, all.width)), widths);
    for (const [query, label] of [['Ville', 'une ligne courte'], ['Cp', 'une ligne courte d\'une autre table'], ['Responsable', 'une ligne longue'], ['Nom', 'deux lignes courtes']]) {
      await resetDocument(page);
      await typeHash(page, query);
      const s = await listState(page);
      check(`${tag} : ${label} (« #${query} », ${s.shown ? s.rows.length : 0} ligne${s.shown && s.rows.length > 1 ? 's' : ''}) : toujours ${expected} px`, s.shown && around(s.width, expected), s);
    }
    await resetDocument(page);
    await typeHash(page);
    await click(page, TAB('chips'));
    await sleep(300);
    const chips = await listState(page);
    check(`${tag} : l'onglet des puces a la même largeur (${chips.width} px, ${chips.rows.length} lignes)`, chips.shown && chips.tab === 'chips' && around(chips.width, expected) && chips.rows.length >= 5, chips);
    await click(page, TAB('variables'));
    await sleep(300);

    console.log(`\n[${tag}] Un nom trop long passe à la ligne`);
    const long = await listState(page);
    const rowOf = (state, text) => (state.rows || []).find(r => r.text === text);
    const oneLine = rowOf(long, 'Projets.Nom');
    for (const [text, label] of [[LONG_DATE, 'Date_de_signature…'], [LONG_RESP, 'Responsable_scientifique…'], [NO_SEPARATOR, 'un mot sans séparateur']]) {
      const row = rowOf(long, text);
      check(`${tag} : « ${label} » est dans la liste en entier (toutes ses lettres, rien de coupé), sur plus d'une ligne (${row ? row.height : '-'} px contre ${oneLine ? oneLine.height : '-'})`, !!row && !!oneLine && row.height >= oneLine.height * 1.6, row);
      check(`${tag} : « ${label} » reste dans le panneau (bord droit ${row ? Math.round(row.right) : '-'} ≤ ${Math.round(long.right)})`, !!row && row.right <= long.right + 0.5, row);
    }
    check(`${tag} : aucun défilement à l'horizontale, même avec un nom plus long que la ligne`, long.hOverflow === false, long);
    const dateEnds = await lineEnds(page, LONG_DATE);
    const respEnds = await lineEnds(page, LONG_RESP);
    check(`${tag} : la coupure tombe derrière un « _ » ou un « . » (entre deux mots du nom), pas au milieu d'un mot`, !!dateEnds && !!respEnds && dateEnds.lines >= 2 && respEnds.lines >= 2 && dateEnds.ends.concat(respEnds.ends).every(c => c === '_' || c === '.'), { dateEnds, respEnds });
    const blunt = await lineEnds(page, NO_SEPARATOR);
    check(`${tag} : un mot sans séparateur plus long que la ligne est coupé à la lettre près, plutôt que de déborder (${blunt ? blunt.lines : '-'} lignes)`, !!blunt && blunt.lines >= 2, blunt);

    console.log(`\n[${tag}] Les noms courts restent simples`);
    const shortRows = long.rows.filter(r => r.text.length < 30);
    check(`${tag} : un nom court est un seul nœud texte, sans <wbr> (${shortRows.length} lignes)`, shortRows.length >= 4 && shortRows.every(r => r.nodes === 1 && r.wbr === 0), shortRows.filter(r => r.nodes !== 1 || r.wbr !== 0));
    check(`${tag} : le texte d'une ligne longue est celui de sa clé, les <wbr> n'y ajoutent rien`, rowOf(long, LONG_DATE).wbr >= 4 && rowOf(long, LONG_RESP).wbr >= 4, [rowOf(long, LONG_DATE), rowOf(long, LONG_RESP)]);

    console.log(`\n[${tag}] La souris, sur les deux lignes d'un nom, et le premier plan`);
    const point = await page.evaluate(({ wanted }) => {
      const row = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(e => e.textContent === wanted);
      const list = document.querySelector('#autocomplete-box .ac-items');
      const q = row.getBoundingClientRect(); // la 4e ligne de la liste, visible sans défiler (la liste fait 280 px au plus)
      const box = document.getElementById('autocomplete-box').getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, q.top + q.height / 2);
      return { x: q.left + 40, y: q.bottom - 7, height: q.height, visible: q.bottom <= list.getBoundingClientRect().bottom, inBox: !!top && document.getElementById('autocomplete-box').contains(top), listTop: list.getBoundingClientRect().top };
    }, { wanted: LONG_RESP });
    check(`${tag} : la liste est au premier plan (la ligne longue reçoit les clics, pas la barre d'outils derrière)`, point.inBox && point.visible, point);
    await page.mouse.move(point.x - 12, point.y, { steps: 2 });
    await page.mouse.move(point.x, point.y, { steps: 3 });
    await sleep(200);
    const hovered = await page.evaluate(() => { const row = document.querySelector('#autocomplete-box .ac-item.selected'); return row ? row.textContent : null; });
    check(`${tag} : sous la souris, sur la seconde ligne du nom, la ligne entière est la ligne choisie`, hovered === LONG_RESP, hovered);
    await page.mouse.click(point.x, point.y);
    await sleep(500);
    const posed = await page.evaluate(() => {
      const out = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') out.push(node.attrs.key); });
      const box = document.getElementById('autocomplete-box');
      return { keys: out, shown: box.style.display !== 'none' && box.getClientRects().length > 0 };
    });
    check(`${tag} : un vrai clic sur la seconde ligne pose la variable entière, et la liste se ferme`, posed.keys.length === 1 && posed.keys[0] === LONG_RESP && !posed.shown, posed);

    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair, 700 px', 700);
  await pass('en', 'dark', 'anglais, sombre, 700 px', 700);
  await pass('fr', 'light', 'français, clair, cadre étroit 340 px', 340);
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
