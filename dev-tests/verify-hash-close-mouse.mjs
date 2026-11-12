#!/usr/bin/env node
// La liste « # » qu'on ferme, à la VRAIE souris et au VRAI clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre (12/11, « j'ai dans mon texte un # qui ne
// doit pas être une variable : dès que le curseur est derrière, Entrée est pris par la liste, impossible de passer à la ligne »). Une croix ferme la liste, Échap aussi (il le faisait
// déjà), et Entrée redevient un saut de ligne ; Maj + Entrée garde son sens avec la liste ouverte, Entrée seule pose toujours la ligne choisie.
//   1) la croix : à droite des onglets, dans la fenêtre du widget (700x400), entière, assez grande pour la souris (>= 24 px), sans chevaucher l'onglet « Puces », son nom et son info-bulle
//      dans la langue de la page, son icône lisible (>= 4,5:1) au repos et sous la souris ;
//   2) un vrai clic sur la croix ferme la liste, le focus reste dans l'éditeur, et un vrai Entrée passe à la ligne (le curseur est dans le paragraphe neuf, rien n'est posé) ;
//   3) Échap fait de même ; la liste reste fermée tant qu'on écrit à la suite de ce « # » (« #Nom ») ; un nouveau « # » la rouvre, sur l'onglet des variables ;
//   4) un vrai Maj + Entrée, liste ouverte, fait un retour à la ligne sans rien poser ; un vrai Entrée seul pose la ligne choisie ;
//   5) les onglets et les lignes de la liste répondent toujours au vrai clic (la croix n'a rien changé à leur place) ;
//   6) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « hashCloseMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-hash-close-mouse.mjs
// HASH_CLOSE_SHOTS=<dossier> enregistre une capture de la liste ouverte par passe.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { open, stopServer, sleep, click, center } from './load-lib.mjs';

const PORT = Number(process.env.HASH_CLOSE_MOUSE_PORT || 9012);
const SHOTS = process.env.HASH_CLOSE_SHOTS || '';
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }, { id: 'Ville', type: 'Text' }] }] };
const BOX = '#autocomplete-box';
const CROSS = BOX + ' .ac-close';
const TAB = name => `${BOX} .ac-tab[data-tab="${name}"]`;

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Ce que le document porte : un texte par paragraphe, avec ses nœuds en ligne (`hardBreak`, `varBadge`, `smartChip`) à leur place ; et où est le curseur (indice du paragraphe, et si
// l'éditeur a le focus).
const shape = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  return {
    blocks: editor.getJSON().content.map(node => node.type + ':' + (node.content || []).map(inline => (inline.type === 'text' ? inline.text : inline.type)).join('|')),
    caretBlock: editor.state.selection.$from.index(0),
    focusInEditor: !!document.activeElement && document.activeElement.classList.contains('ProseMirror'),
  };
});
const listState = page => page.evaluate(() => {
  const box = document.getElementById('autocomplete-box');
  const shown = !!box && box.style.display !== 'none' && box.getClientRects().length > 0;
  const active = shown && box.querySelector('.ac-tab.active');
  return { shown, tab: active ? active.dataset.tab : null, rows: shown ? Array.from(box.querySelectorAll('.ac-item')).map(row => row.textContent) : [] };
});
const resetDocument = async page => {
  await page.evaluate(() => EditorCore.getEditor().commands.setContent('<p></p>'));
  await sleep(300);
  await click(page, '.tiptap p');
  await sleep(300);
};
// « Lot # » tapé au vrai clavier derrière un mot : le « # » d'une phrase, pas celui d'une variable.
const typeLotHash = async page => {
  await page.keyboard.type('Lot #');
  await sleep(900);
};

// Le contraste d'une couleur de texte (ou d'icône) sur un fond : le fond de la croix est transparent, on prend celui de la liste (au repos) ou celui de son survol.
const contrastOf = (page, colorSel, backgroundSel) => page.evaluate(({ colorSel, backgroundSel }) => {
  const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const color = getComputedStyle(document.querySelector(colorSel)).color;
  const own = getComputedStyle(document.querySelector(backgroundSel)).backgroundColor;
  const la = lum(color), lb = lum(own);
  return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100;
}, { colorSel, backgroundSel });

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    const label = lang === 'en' ? 'Close the list (Esc)' : 'Fermer la liste (Échap)';

    console.log(`\n[${tag}] La croix de la liste « # »`);
    await click(page, '.tiptap p');
    await sleep(300);
    await typeLotHash(page);
    const opened = await listState(page);
    check(`${tag} : « Lot # » ouvre la liste, sur l'onglet des variables`, opened.shown && opened.tab === 'variables' && opened.rows.length > 0, opened);
    const geometry = await page.evaluate(({ box, cross, chips }) => {
      const b = document.querySelector(box).getBoundingClientRect();
      const c = document.querySelector(cross);
      const r = c.getBoundingClientRect();
      const t = document.querySelector(chips).getBoundingClientRect();
      return {
        inWindow: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, insideBox: r.left >= b.left && r.right <= b.right + 0.5 && r.top >= b.top && r.bottom <= b.bottom,
        width: Math.round(r.width), height: Math.round(r.height), rightOfChips: r.left >= t.right - 0.5, label: c.getAttribute('aria-label'), title: c.title, tabIndex: c.tabIndex, tag: c.tagName, window: [window.innerWidth, window.innerHeight],
      };
    }, { box: BOX, cross: CROSS, chips: TAB('chips') });
    check(`${tag} : la croix est dans la fenêtre du widget (${geometry.window.join('×')}), dans la liste, à droite de l'onglet « ${lang === 'en' ? 'Chips' : 'Puces'} »`, geometry.inWindow && geometry.insideBox && geometry.rightOfChips, geometry);
    check(`${tag} : la croix est assez grande pour la souris (${geometry.width}×${geometry.height} px)`, geometry.width >= 24 && geometry.height >= 24, geometry);
    check(`${tag} : la croix est un bouton, hors de l'ordre de tabulation, nommée « ${label} » (nom et info-bulle)`, geometry.tag === 'BUTTON' && geometry.tabIndex === -1 && geometry.label === label && geometry.title === label, geometry);
    const atRest = await contrastOf(page, CROSS, BOX);
    check(`${tag} : l'icône de la croix est lisible au repos (${atRest}:1, >= 4,5:1)`, atRest >= 4.5, atRest);
    const at = await center(page, CROSS);
    await page.mouse.move(at.x - 25, at.y, { steps: 3 });
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await sleep(250);
    const hover = await page.evaluate(sel => { const e = document.querySelector(sel); const cs = getComputedStyle(e); return { hovered: e.matches(':hover'), background: cs.backgroundColor, cursor: cs.cursor }; }, CROSS);
    const hoverContrast = await page.evaluate(sel => {
      const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = c => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const cs = getComputedStyle(document.querySelector(sel));
      const la = lum(cs.color), lb = lum(cs.backgroundColor);
      return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100;
    }, CROSS);
    check(`${tag} : sous la souris la croix se peint (gris de survol), le curseur est la main, l'icône reste lisible (${hoverContrast}:1)`, hover.hovered && !/rgba\(0, 0, 0, 0\)|transparent/.test(hover.background) && hover.cursor === 'pointer' && hoverContrast >= 4.5, { hover, hoverContrast });
    if (SHOTS) { await mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `liste-diese-croix-${lang}-${theme}.png`), clip: { x: 0, y: 0, width: 700, height: 400 } }); }

    console.log(`\n[${tag}] Un vrai clic sur la croix, puis Entrée`);
    await click(page, CROSS);
    await sleep(400);
    const afterCross = { list: await listState(page), doc: await shape(page) };
    check(`${tag} : un vrai clic sur la croix ferme la liste, le texte n'a pas bougé et le focus reste dans l'éditeur`, !afterCross.list.shown && same(afterCross.doc.blocks, ['paragraph:Lot #']) && afterCross.doc.focusInEditor, afterCross);
    await page.keyboard.press('Enter');
    await sleep(400);
    const afterEnter = { list: await listState(page), doc: await shape(page) };
    check(`${tag} : Entrée passe alors à la ligne (deux paragraphes, curseur dans le second, aucune variable posée)`, !afterEnter.list.shown && same(afterEnter.doc.blocks, ['paragraph:Lot #', 'paragraph:']) && afterEnter.doc.caretBlock === 1, afterEnter);
    await page.keyboard.type('suite');
    await sleep(300);
    const typedOn = await shape(page);
    check(`${tag} : on écrit à la suite, sur la nouvelle ligne`, same(typedOn.blocks, ['paragraph:Lot #', 'paragraph:suite']), typedOn);

    console.log(`\n[${tag}] Échap, puis la liste reste fermée tant que ce « # » est celui de la saisie`);
    await resetDocument(page);
    await typeLotHash(page);
    const reopenedA = await listState(page);
    await page.keyboard.press('Escape');
    await sleep(400);
    const closedByEscape = await listState(page);
    await page.keyboard.type('Nom');
    await sleep(500);
    const whileTyping = await listState(page);
    check(`${tag} : Échap ferme la liste (qui s'était rouverte), et elle reste fermée en écrivant « Nom » à la suite du « # »`, reopenedA.shown && !closedByEscape.shown && !whileTyping.shown, { reopenedA, closedByEscape, whileTyping });
    await page.keyboard.press('Enter');
    await sleep(400);
    const afterEscapeEnter = await shape(page);
    check(`${tag} : Entrée passe alors à la ligne, rien n'est posé`, same(afterEscapeEnter.blocks, ['paragraph:Lot #Nom', 'paragraph:']) && afterEscapeEnter.caretBlock === 1, afterEscapeEnter);
    await page.keyboard.type('#');
    await sleep(800);
    const newHash = await listState(page);
    check(`${tag} : un nouveau « # » rouvre la liste, sur l'onglet des variables`, newHash.shown && newHash.tab === 'variables' && newHash.rows.length > 0, newHash);

    console.log(`\n[${tag}] Les onglets, les lignes et les touches de la liste ouverte`);
    await click(page, TAB('chips'));
    await sleep(300);
    const onChips = await listState(page);
    check(`${tag} : un vrai clic sur l'onglet des puces le choisit (la croix n'a pas bougé les onglets)`, onChips.shown && onChips.tab === 'chips' && onChips.rows.length >= 5, onChips);
    await click(page, CROSS);
    await sleep(300);
    // Un nouveau « # », derrière un mot (un « # » seul sur sa ligne + Entrée est une règle de saisie de TipTap, un titre vide : sans rapport avec la liste).
    await resetDocument(page);
    await typeLotHash(page);
    const backToVariables = await listState(page);
    check(`${tag} : fermée sur l'onglet des puces, la liste suivante repart de l'onglet des variables`, backToVariables.shown && backToVariables.tab === 'variables', backToVariables);
    await click(page, TAB('chips'));
    await sleep(300);
    const dateRow = await page.evaluate(sel => {
      const rows = Array.from(document.querySelectorAll(sel));
      const row = rows.find(e => /Date du jour|Today’s date/.test(e.textContent));
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: row.textContent };
    }, `${BOX} .ac-item`);
    check(`${tag} : la ligne « Date du jour » est dans la liste des puces`, !!dateRow, dateRow);
    if (dateRow) {
      await page.mouse.move(dateRow.x - 10, dateRow.y, { steps: 2 });
      await page.mouse.move(dateRow.x, dateRow.y, { steps: 3 });
      await sleep(150);
      await page.mouse.click(dateRow.x, dateRow.y);
      await sleep(500);
      const afterRow = await shape(page);
      check(`${tag} : un vrai clic sur une ligne de la liste pose toujours sa puce`, afterRow.blocks.some(block => block.endsWith('|smartChip')), afterRow);
    }

    await resetDocument(page);
    await typeLotHash(page);
    const forShift = await listState(page);
    await page.keyboard.press('Shift+Enter');
    await sleep(400);
    const afterShift = await shape(page);
    check(`${tag} : un vrai Maj + Entrée, liste ouverte, fait un retour à la ligne sans rien poser`, forShift.shown && same(afterShift.blocks, ['paragraph:Lot #|hardBreak']), { forShift, afterShift });
    await resetDocument(page);
    await typeLotHash(page);
    const forPlain = await listState(page);
    await page.keyboard.press('Enter');
    await sleep(400);
    const afterPlain = await shape(page);
    check(`${tag} : un vrai Entrée seul, liste ouverte, pose la ligne choisie, sur la même ligne du document`, forPlain.shown && afterPlain.blocks.length === 1 && afterPlain.blocks[0].startsWith('paragraph:Lot |varBadge'), { forPlain, afterPlain });

    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair');
  await pass('en', 'dark', 'anglais, sombre');
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
