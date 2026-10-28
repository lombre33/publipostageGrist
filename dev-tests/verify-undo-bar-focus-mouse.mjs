#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et Ctrl + Maj + Z agissent quand le focus est resté sur une liste ou une glissière de la barre flottante - décimales d'un nombre, format d'une date, opacité d'une image - à la VRAIE souris et au
// vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre - suite de sa demande du 22/10 : « Il doit prendre en compte 100% des
// actions faites dans le widget ». Ce que dev-tests/scenarios-undo-page.js, scenarios-shortcuts.js et le balayage (undoSweep) ne peuvent pas voir depuis la page : la liste ouverte à un vrai clic et choisie aux
// flèches, la glissière prise à la souris, le focus que le navigateur y laisse, la touche frappée par le clavier lui-même, et le champ de la devise, où l'on tape, qui garde SA frappe.
//   1) un nombre : une vraie liste « Décimales » choisie (clic, flèches, Entrée) change le texte ; UN Ctrl + Z, le focus resté sur la liste, rend le texte d'avant et donne le focus à l'éditeur ; la liste reprise,
//      UN Ctrl + Y le remet, puis UN Ctrl + Z et UN Ctrl + Maj + Z de même ;
//   2) une date : sa liste de format, de même ;
//   3) une image : la glissière d'opacité prise à la souris, de même ;
//   4) le champ de la devise d'un nombre : on y tape, Ctrl + Z y défait la frappe (le champ change, la touche n'est pas prise pour le bouton Annuler) ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoBarFocusMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-bar-focus-mouse.mjs
import { open, stopServer, sleep, center } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_BAR_FOCUS_MOUSE_PORT || 9157);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }, { id: 'Montant', type: 'Numeric' }, { id: 'Echeance', type: 'Date' }] }] };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const BADGE = column => '<span class="var-badge" data-table="PbClients" data-column="' + column + '" data-key="PbClients.' + column + '"></span>';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Le texte du modèle, identifiants gommés ; le contrôle qui a le focus ; l'éditeur a-t-il le focus ?
const html = page => page.evaluate(() => Editor.getHTML().replace(/(data-[a-z-]*id|id)="[^"]{6,}"/g, '$1="#"').replace(/src="[^"]{30,}"/g, 'src="…"'));
const focus = page => page.evaluate(() => {
  const a = document.activeElement;
  return { role: a && a.dataset ? a.dataset.role || null : null, tag: a ? a.tagName : null, inEditor: !!(a && a.closest && a.closest('.ProseMirror')) };
});
async function key(page, combo, wait = 800) {
  await page.keyboard.press(combo);
  await sleep(wait);
}
// Une vraie souris vers le centre (ou une fraction de la largeur) d'un contrôle, puis un clic.
async function realClick(page, selector, fraction = 0.5, wait = 400) {
  const c = await center(page, selector);
  if (!c) throw new Error('introuvable : ' + selector);
  const x = c.x - c.w / 2 + c.w * fraction;
  await page.mouse.move(x - 14, c.y, { steps: 2 });
  await page.mouse.move(x, c.y, { steps: 3 });
  await page.mouse.click(x, c.y);
  await sleep(wait);
}
// Rend le focus à un contrôle de la barre comme la personne le ferait (Tab, clic dans la zone) : ici par le focus du navigateur, la touche qui suit est frappée au vrai clavier.
async function refocus(page, selector) {
  await page.focus(selector);
  await sleep(150);
}

// Le même parcours pour une liste ou une glissière : `change` fait le geste à la vraie souris et au vrai clavier, `selector` désigne le contrôle de la barre.
async function undoRedoFromControl(page, tag, label, selector, role, change) {
  const before = await html(page);
  await change();
  const after = await html(page);
  let at = await focus(page);
  check(`${tag} : ${label} - le réglage change le texte et le focus reste sur le contrôle`, after !== before && at.role === role, { before, after, at });

  await key(page, 'Control+z');
  let now = await html(page);
  at = await focus(page);
  check(`${tag} : ${label} - UN Ctrl + Z, le focus sur le contrôle, rend le texte d'avant`, now === before, { now, before });
  check(`${tag} : ${label} - le focus passe à l'éditeur, comme depuis le bouton Annuler`, at.inEditor === true, at);

  await refocus(page, selector);
  await key(page, 'Control+y');
  now = await html(page);
  check(`${tag} : ${label} - UN Ctrl + Y, parti du contrôle, remet le réglage`, now === after, { now, after });

  await refocus(page, selector);
  await key(page, 'Control+z');
  now = await html(page);
  check(`${tag} : ${label} - un deuxième UN Ctrl + Z, parti du contrôle, rend encore le texte d'avant`, now === before, { now, before });

  await refocus(page, selector);
  await key(page, 'Control+Shift+z');
  now = await html(page);
  check(`${tag} : ${label} - UN Ctrl + Maj + Z, parti du contrôle, remet le réglage`, now === after, { now, after });
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    // Le pointeur part du coin de la page : d'un seul saut, il se pose d'abord sous le texte, sans survoler la barre d'outils, dont les menus s'ouvrent au survol et couvriraient le texte visé.
    await page.mouse.move(40, 370);

    console.log(`\n[${tag}] une liste de décimales`);
    await page.evaluate(b => { Editor.setHTML('<p>Dossier ' + b + ' fin</p>'); }, BADGE('Montant'));
    await sleep(500);
    await realClick(page, '.tiptap .var-badge', 0.5, 700);
    check(`${tag} : un clic sur la variable ouvre sa barre de format`, await page.evaluate(() => !!document.querySelector('.v2-varfmt-toolbar.visible select[data-role="num-decimals"]')));
    const DECIMALS = '.v2-varfmt-toolbar.visible select[data-role="num-decimals"]';
    await undoRedoFromControl(page, tag, 'décimales', DECIMALS, 'num-decimals', async () => {
      await realClick(page, DECIMALS, 0.5, 300);
      await page.keyboard.press('ArrowDown'); await sleep(150);
      await page.keyboard.press('ArrowDown'); await sleep(150);
      await page.keyboard.press('Enter');
      await sleep(700);
    });

    console.log(`\n[${tag}] la liste de format d'une date`);
    await page.evaluate(b => { Editor.setHTML('<p>Échéance ' + b + ' fin</p>'); }, BADGE('Echeance'));
    await sleep(500);
    await realClick(page, '.tiptap .var-badge', 0.5, 700);
    const PRESET = '.v2-varfmt-toolbar.visible select[data-role="date-preset"]';
    check(`${tag} : un clic sur la date ouvre sa barre de format`, await page.evaluate(sel => !!document.querySelector(sel), PRESET));
    await undoRedoFromControl(page, tag, 'format de date', PRESET, 'date-preset', async () => {
      await realClick(page, PRESET, 0.5, 300);
      await page.keyboard.press('ArrowDown'); await sleep(150);
      await page.keyboard.press('Enter');
      await sleep(700);
    });

    console.log(`\n[${tag}] la glissière d'opacité d'une image`);
    await page.evaluate(src => { Editor.setHTML('<p>Texte</p><p><img class="editor-image" src="' + src + '" alt="" style="width:120px;height:120px"></p>'); }, PNG);
    await sleep(500);
    await realClick(page, '.tiptap img', 0.5, 700);
    const OPACITY = '.v2-floating-toolbar.visible input[data-role="opacity"]';
    check(`${tag} : un clic sur l'image ouvre sa barre, avec la glissière d'opacité`, await page.evaluate(sel => !!document.querySelector(sel), OPACITY));
    await undoRedoFromControl(page, tag, 'opacité', OPACITY, 'opacity', async () => {
      await realClick(page, OPACITY, 0.4, 700);
    });

    console.log(`\n[${tag}] le champ de la devise garde sa frappe`);
    await page.evaluate(b => { Editor.setHTML('<p>Dossier ' + b + ' fin</p>'); }, BADGE('Montant'));
    await sleep(500);
    await realClick(page, '.tiptap .var-badge', 0.5, 700);
    const CURRENCY = '.v2-varfmt-toolbar.visible input[data-role="num-currency"]';
    check(`${tag} : la barre du nombre a son champ de devise`, await page.evaluate(sel => !!document.querySelector(sel), CURRENCY));
    await realClick(page, CURRENCY, 0.5, 200);
    await page.keyboard.type('USD', { delay: 40 });
    await sleep(200);
    const typed = await page.evaluate(sel => document.querySelector(sel).value, CURRENCY);
    await key(page, 'Control+z', 400);
    const afterField = await page.evaluate(sel => document.querySelector(sel).value, CURRENCY);
    const at = await focus(page);
    check(`${tag} : la frappe « USD » est dans le champ de la devise`, typed === 'USD', { typed });
    check(`${tag} : Ctrl + Z dans ce champ défait la frappe du champ, le focus y reste (la touche n'est pas prise pour le bouton Annuler)`, afterField !== 'USD' && at.role === 'num-currency' && at.inEditor === false, { afterField, at });

    const errors = realErrors(w);
    check(`${tag} : aucune erreur de page`, errors.length === 0, errors.slice(0, 3));
  } finally { await w.close(); }
}

try {
  await pass('fr', 'light', 'fr clair');
  await pass('en', 'dark', 'en sombre');
} catch (e) { failures++; console.log('ERREUR', e && e.stack || e); }
finally { await stopServer(); }
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
