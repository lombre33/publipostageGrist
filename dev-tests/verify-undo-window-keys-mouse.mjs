#!/usr/bin/env node
// Sous une fenêtre ouverte, Ctrl + Z, Ctrl + Y et Ctrl + Maj + Z n'agissent NI sur la page NI sur le navigateur, à la vraie souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en
// français clair puis en anglais sombre - suite de sa demande du 22/10 (« Il doit prendre en compte 100% des actions faites dans le widget ») et de la carte « Ctrl + Z natif de Chrome derrière une fenêtre » (option « Le bloquer,
// partout », go général du 02/11). Ce que dev-tests/scenarios-shortcuts.js ne peut pas voir depuis la page : le Ctrl + Z que Chromium fait lui-même (« historyUndo »), qui défaisait la dernière frappe du document DERRIÈRE la fenêtre, focus sur un
// bouton ou une case de la fenêtre, dès que du texte avait été tapé dans l'éditeur (constaté par dev-tests/verify-undo-settings-mouse.mjs, qui tapait donc son texte en dernier).
//   1) du texte tapé au vrai clavier, puis Réglages ouverts au vrai clic : le focus est sur un bouton de la fenêtre ; Ctrl + Z, Ctrl + Y et Ctrl + Maj + Z ne changent ni le texte ni la fenêtre ;
//   2) la case de l'autre thème cliquée (le focus reste sur la case) : le thème change, puis Ctrl + Z, Ctrl + Y et Ctrl + Maj + Z ne changent rien (ni le texte, ni le thème : la page n'annule pas non plus sous la fenêtre) ;
//   3) un champ de la fenêtre garde son annulation : « ub » tapé dans le champ de l'abréviation, Ctrl + Z le vide, Ctrl + Y le rend, sans toucher au texte du document ni au thème ;
//   4) la fenêtre refermée, les touches agissent de nouveau : UN Ctrl + Z rend le thème d'avant, UN Ctrl + Y l'autre, puis Ctrl + Z deux fois rend aussi le texte tapé au départ ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoWindowKeysMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-window-keys-mouse.mjs
import { open, stopServer, sleep, click, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_WINDOW_KEYS_MOUSE_PORT || 9163);
const SPEC = { models: { count: 2, paragraphs: 2 } };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const attr = (page, name) => page.evaluate(n => document.documentElement.getAttribute(n), name);
const text = page => page.evaluate(() => EditorCore.getEditor().getText());
const displayed = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; }, selector);
const forget = page => page.evaluate(() => { if (typeof ActionHistory !== 'undefined') ActionHistory.reset(); });
async function key(page, combo, wait = 900) {
  await page.keyboard.press(combo);
  await sleep(wait);
}
async function toEnd(page) {
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await sleep(200);
}
// Où est le focus : dans la fenêtre Réglages, et sur quoi (un bouton, une case : rien où l'on écrit ; un champ de saisie).
const focusOf = page => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  return { inWindow: !!el.closest('#settings-modal'), tag: el.tagName, type: el.type || '', typing: /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(range|checkbox|radio|button|submit|reset|image|color|file)$/.test(el.type) };
});
// Le vrai clic sur un élément que la page désigne (`find`, évaluée dans la page) : ramené en vue d'abord, puis le pointeur y va et clique.
async function clickWhere(page, find, arg) {
  const pos = await page.evaluate(({ src, arg }) => {
    const element = (new Function('arg', 'return (' + src + ')(arg)'))(arg);
    if (!element) return null;
    element.scrollIntoView({ block: 'nearest' });
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { src: find.toString(), arg });
  if (!pos) throw new Error('introuvable : ' + find.toString());
  await page.mouse.move(pos.x - 20, pos.y);
  await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(pos.x, pos.y);
}
// Réglages ouverts au vrai clic de la barre, sur l'onglet voulu ; refermés au vrai clic de « Fermer ».
async function openSettings(page, tab) {
  await click(page, '#v2-btn-settings');
  await sleep(500);
  await click(page, '.settings-tab[data-settings-tab="' + tab + '"]');
  await sleep(300);
}
async function closeSettings(page) {
  await click(page, '#settings-close');
  await sleep(400);
}
// La case d'un choix cliquée à la vraie souris : c'est l'étiquette qui l'entoure qu'on clique, comme sous les doigts.
const clickRadio = (page, name, value) => clickWhere(page, ({ name, value }) => document.querySelector('input[name="' + name + '"][value="' + value + '"]').closest('label'), { name, value });
const abbrField = page => page.evaluate(() => document.getElementById('settings-expansion-abbr').value);

async function phase(lang, theme) {
  const tag = `${lang}/${theme}`;
  const other = theme === 'light' ? 'dark' : 'light';
  const w = await open({ spec: SPEC, port: PORT, theme, lang });
  const { page } = w;
  console.log(`\n=== Ctrl + Z, Ctrl + Y et Ctrl + Maj + Z sous une fenêtre ouverte, vraie souris et vrai clavier, 700x400, ${lang === 'fr' ? 'français clair' : 'anglais sombre'} ===`);
  try {
    await pickTemplate(page, 'Modèle 0001');
    await forget(page);
    check(`${tag} 0 : le thème de départ est « ${theme} »`, (await attr(page, 'data-theme')) === theme, await attr(page, 'data-theme'));

    // --- 1) du texte tapé, puis une fenêtre ---
    await toEnd(page);
    await page.keyboard.type(' ALPHA');
    await sleep(700);
    const typed = await text(page);
    check(`${tag} 1 : « ALPHA » est tapé dans le document`, / ALPHA$/.test(typed), typed);
    await openSettings(page, 'theme');
    const focus = await focusOf(page);
    check(`${tag} 1 : Réglages est ouvert et le focus est dans la fenêtre, sur un contrôle où l'on n'écrit pas`, await displayed(page, '#settings-modal') && !!focus && focus.inWindow && !focus.typing, focus);
    await key(page, 'Control+z');
    check(`${tag} 1 : Ctrl + Z sous la fenêtre ne défait pas la frappe du document`, (await text(page)) === typed && await displayed(page, '#settings-modal'), { text: await text(page), open: await displayed(page, '#settings-modal') });
    await key(page, 'Control+y');
    check(`${tag} 1 : Ctrl + Y sous la fenêtre ne change pas le document`, (await text(page)) === typed, await text(page));
    await key(page, 'Control+Shift+z');
    check(`${tag} 1 : Ctrl + Maj + Z sous la fenêtre ne change pas le document`, (await text(page)) === typed, await text(page));

    // --- 2) une case de la fenêtre ---
    await clickRadio(page, 'settings-theme', other);
    await sleep(500);
    const onRadio = await focusOf(page);
    check(`${tag} 2 : la case de l'autre thème change le thème, le focus reste sur la case de la fenêtre`, (await attr(page, 'data-theme')) === other && !!onRadio && onRadio.inWindow && onRadio.type === 'radio', { theme: await attr(page, 'data-theme'), focus: onRadio });
    await key(page, 'Control+z');
    check(`${tag} 2 : Ctrl + Z sous la fenêtre, focus sur la case : ni le texte ni le thème ne bougent`, (await text(page)) === typed && (await attr(page, 'data-theme')) === other, { text: await text(page), theme: await attr(page, 'data-theme') });
    await key(page, 'Control+y');
    await key(page, 'Control+Shift+z');
    check(`${tag} 2 : Ctrl + Y et Ctrl + Maj + Z sous la fenêtre ne changent rien non plus`, (await text(page)) === typed && (await attr(page, 'data-theme')) === other && await displayed(page, '#settings-modal'), { text: await text(page), theme: await attr(page, 'data-theme') });

    // --- 3) un champ de la fenêtre garde son annulation ---
    await click(page, '.settings-tab[data-settings-tab="shortcuts"]');
    await sleep(300);
    await clickWhere(page, () => document.getElementById('settings-switch-expansion'));
    await sleep(500);
    await clickWhere(page, () => document.getElementById('settings-expansion-abbr'));
    await sleep(200);
    await page.keyboard.type('ub');
    await sleep(700);
    const inField = await focusOf(page);
    check(`${tag} 3 : « ub » est tapé dans le champ de l'abréviation, qui a le focus`, (await abbrField(page)) === 'ub' && !!inField && inField.inWindow && inField.typing, { value: await abbrField(page), focus: inField });
    await key(page, 'Control+z');
    check(`${tag} 3 : Ctrl + Z dans le champ de la fenêtre défait SA frappe (le champ se vide), pas celle du document ni le thème`, (await abbrField(page)) === '' && (await text(page)) === typed && (await attr(page, 'data-theme')) === other, { field: await abbrField(page), text: await text(page), theme: await attr(page, 'data-theme') });
    await key(page, 'Control+y');
    check(`${tag} 3 : Ctrl + Y dans le champ de la fenêtre rend sa frappe, le document et le thème ne bougent pas`, (await abbrField(page)) === 'ub' && (await text(page)) === typed && (await attr(page, 'data-theme')) === other, { field: await abbrField(page), text: await text(page), theme: await attr(page, 'data-theme') });

    // --- 4) la fenêtre refermée ---
    await closeSettings(page);
    check(`${tag} 4 : la fenêtre est refermée`, !(await displayed(page, '#settings-modal')), await displayed(page, '#settings-modal'));
    await key(page, 'Control+z');
    check(`${tag} 4 : fenêtre refermée, UN Ctrl + Z rend le thème d'avant (le texte reste)`, (await attr(page, 'data-theme')) === theme && (await text(page)) === typed, { theme: await attr(page, 'data-theme'), text: await text(page) });
    await key(page, 'Control+y');
    check(`${tag} 4 : UN Ctrl + Y rend l'autre thème`, (await attr(page, 'data-theme')) === other && (await text(page)) === typed, { theme: await attr(page, 'data-theme'), text: await text(page) });
    await key(page, 'Control+z');
    await key(page, 'Control+z');
    check(`${tag} 4 : deux Ctrl + Z de plus rendent le thème d'avant puis le texte tapé au départ`, (await attr(page, 'data-theme')) === theme && !/ ALPHA/.test(await text(page)), { theme: await attr(page, 'data-theme'), text: await text(page) });

    check(`${tag} 5 : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await phase('fr', 'light');
  await phase('en', 'dark');
} finally {
  await stopServer();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
