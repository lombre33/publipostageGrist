#!/usr/bin/env node
// Les menus « Aa » et « Souligné » de la barre (js/character-format.js : `wireMenus`, index.html, css/character-format.css ; demande du 04/11 : les réglages de caractère « pas une popup mais un menu d'outils ») : le panneau de
// 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au vrai clavier, en clair, en sombre et en anglais. Ce que dev-tests/scenarios-character-menus.js ne peut pas voir depuis la page :
//  - « Aa » est dans la barre, entier dans le panneau, avec son icône et son nom, juste après « Barré » ; au survol son menu tient dans le panneau, chaque ligne est lisible (contraste) et au premier plan ;
//  - un vrai clic sur Petites capitales, Ombre ou Contour règle le mot choisi au double-clic, que l'éditeur DESSINE (et lui seul), sans fenêtre : le mot reste sélectionné, la ligne se coche ; UN Ctrl+Z défait chaque réglage, Ctrl+Maj+Z le remet ;
//  - l'espacement : « + » et « − » avancent d'un demi-point, une valeur tapée au vrai clavier (2,5 / 2.5 selon la langue) puis Entrée s'applique et rend le clavier au texte, une saisie fausse se dit (rouge) sans rien changer et Échap la rend ;
//  - Exposant et Indice, dans le même menu, se cliquent et s'enfoncent ; le menu du bouton Souligné : la première ligne est le soulignement classique avec sa touche, les autres sont dessinées comme leur trait ; un clic pose le trait, un
//    second le retire, un autre le remplace ; le bouton garde son clic ;
//  - une sélection aux réglages mêlés : la ligne montre un tiret, un clic la pose partout ;
//  - au clavier : le focus entre dans le menu (Tab), Entrée coche la ligne ;
//  - un modèle email : les lignes qu'il grise disent pourquoi (info-bulle, coin d'état au clic) sans rien changer, Exposant et Indice restent ; la ligne « Caractère… » n'est plus dans le menu Alignement.
// Lancé par run-headless.mjs (groupe Node "characterFormatMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-character-format-mouse.mjs
// CHARACTER_FORMAT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-character-format-mouse', port: Number(process.env.CHARACTER_FORMAT_MOUSE_PORT || 8962) });
const SHOTS = process.env.CHARACTER_FORMAT_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
// Deux réglages de suite à moins de 500 ms ne font qu'un pas d'historique (le groupe de Tiptap) : ces pauses les séparent, comme deux gestes distincts.
const BETWEEN_STEPS = 700;

const MAIN = '#v2-btn-char-main';
const FLYOUT = '#v2-char-flyout';
const ROW = { caps: '#v2-btn-char-smallcaps', shadow: '#v2-btn-char-shadow', stroke: '#v2-btn-char-stroke' };
const FIELD = '#v2-char-spacing-val';
const UNDERLINE = '#v2-btn-underline';
const UNDERLINE_FLYOUT = '#v2-underline-flyout';
const underlineRow = kind => '#v2-underline-' + kind;

// ---- gestes et lectures ---------------------------------------------------------------------------------------------------------------------------------------------
const boxOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
    inside: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
}, selector);
// La souris vient d'à côté et s'arrête au centre du contrôle.
async function goTo(page, selector) {
  const b = await boxOf(page, selector);
  if (!b || !b.w || !b.h) throw new Error('introuvable ou masqué : ' + selector);
  await page.mouse.move(Math.max(2, b.x - 30), Math.min(396, b.y + 45));
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await pause(350);
  return b;
}
// Le groupe à survol ouvre sa ligne sans que la souris la quitte : elle descend du bouton dans le menu, longe le haut du menu jusqu'au-dessus de la ligne (l'espacement est à l'autre bout), puis descend sur elle.
// Un menu qui s'ouvre sous le bouton (`FLYOUT_OF`) ; les autres (le menu « Nouveau »), des lignes larges, par une diagonale.
const FLYOUT_OF = { [MAIN]: FLYOUT, [UNDERLINE]: UNDERLINE_FLYOUT };
async function toRow(page, buttonSelector, rowSelector) {
  const g = await goTo(page, buttonSelector);
  await pause(450);
  const r = await boxOf(page, rowSelector);
  if (!r || !r.w || !r.h) throw new Error('ligne introuvable ou masquée : ' + rowSelector);
  const flyout = FLYOUT_OF[buttonSelector] ? await boxOf(page, FLYOUT_OF[buttonSelector]) : null;
  const x = Math.min(Math.max(g.x, r.left + 6), r.right - 6);
  if (flyout) {
    await page.mouse.move(g.x, g.y + 10, { steps: 2 });
    await page.mouse.move(g.x, flyout.top + 10, { steps: 3 });
    await page.mouse.move(x, flyout.top + 10, { steps: 4 });
  } else {
    await page.mouse.move(x, g.y + 12, { steps: 2 });
  }
  await page.mouse.move(x, r.y, { steps: 6 });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await pause(250);
  return r;
}
async function press(page) {
  await page.mouse.down();
  await page.mouse.up();
  await pause(250);
}
async function clickRow(page, buttonSelector, rowSelector) {
  const r = await toRow(page, buttonSelector, rowSelector);
  await press(page);
  return r;
}
const html = page => page.evaluate(() => Editor.getHTML());
const status = page => page.evaluate(() => document.getElementById('status-msg').textContent.trim());
const clearStatus = page => page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
const attr = (page, selector, name) => page.evaluate(([sel, n]) => { const el = document.querySelector(sel); return el ? el.getAttribute(n) : null; }, [selector, name]);
const display = (page, selector) => page.evaluate(sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : null; }, selector);
const selectedText = page => page.evaluate(() => { const s = EditorCore.getEditor().state; return s.doc.textBetween(s.selection.from, s.selection.to, ' '); });
const keyboardIn = page => page.evaluate(() => { const a = document.activeElement; return a && a.closest && a.closest('.tiptap') ? 'editor' : (a ? (a.id || a.tagName) : null); });
// Ce que l'éditeur dessine d'un mot : petites capitales, ombre, contour, espacement (pt), soulignement (le style du trait), exposant, indice.
const looks = (page, word) => page.evaluate((needle) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.textContent.indexOf(needle) < 0) continue;
    const el = n.parentElement;
    const cs = getComputedStyle(el);
    const u = el.closest('u');
    return {
      caps: cs.fontVariantCaps,
      shadow: cs.textShadow !== 'none',
      stroke: parseFloat(cs.webkitTextStrokeWidth) > 0,
      spacing: cs.letterSpacing === 'normal' ? 0 : Math.round(parseFloat(cs.letterSpacing) * 0.75 * 100) / 100,
      line: u ? getComputedStyle(u).textDecorationStyle : null,
      sup: !!el.closest('sup'),
      sub: !!el.closest('sub'),
    };
  }
  return null;
}, word);
const pointOf = (page, text, at = 0.5) => page.evaluate(({ text, at }) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.textContent.indexOf(text);
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width * at, y: b.top + b.height / 2 };
  }
  return null;
}, { text, at });
async function setDoc(page, doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.mouse.move(350, 380, { steps: 3 });
  await pause(300);
}
async function selectWord(page, word) {
  const p = await pointOf(page, word);
  await page.mouse.dblclick(p.x, p.y);
  await pause(250);
}
async function clickInText(page, word) {
  const p = await pointOf(page, word);
  await page.mouse.click(p.x, p.y);
  await pause(250);
}
const rowState = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  return { checked: el.getAttribute('aria-checked'), pressed: el.getAttribute('aria-pressed'), reason: el.getAttribute('data-pp-lock-reason') || '', blocks: el.hasAttribute('data-pp-lock-blocks'), title: el.title || '' };
}, selector);
const snap = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
async function newTemplate(page, kind) {
  // Quitter un modèle modifié pose la question « Enregistrer / Ne pas enregistrer / Annuler » tant que l'enregistrement automatique (toutes les 2,5 s) n'est pas passé : selon l'instant, elle
  // s'ouvre ou non, et elle couvrirait le bouton « Aa » (js/main.js:askBeforeLeaving, verify-leave-unsaved-mouse.mjs). Ici le passage au nouveau modèle n'est pas son sujet : « Ne pas enregistrer ».
  await page.evaluate(() => { Dialogs.choose = async () => 'discard'; });
  await clickRow(page, '#btn-new', '#v2-btn-new-' + kind);
  await pause(700);
  await page.mouse.move(350, 380);
}
const numberAs = (lang, text) => (lang === 'en' ? text.replace(',', '.') : text.replace('.', ','));

// ---- un parcours, dans une langue et un thème -----------------------------------------------------------------------------------------------------------------------
async function run(theme, lang) {
  const T = lang === 'en' ? 'anglais' : theme;
  const { page } = await t.openPage({ hosted: false, lang, seed: seedModels() });
  if (theme === 'sombre') await page.evaluate(() => Settings.setTheme('dark'));
  await setDoc(page, '<p>Un deux trois quatre cinq</p>');
  const names = lang === 'en'
    ? { main: /Character/, label: 'Character', caps: 'Small capitals', shadow: 'Shadow', stroke: 'Outline', spacing: 'Spacing', sup: 'Superscript', sub: 'Subscript', underline: 'Underline', double: 'Double', dotted: 'Dotted', dashed: 'Dashed', wavy: 'Wavy' }
    : { main: /Caractère/, label: 'Caractère', caps: 'Petites capitales', shadow: 'Ombre', stroke: 'Contour', spacing: 'Espacement', sup: 'Exposant', sub: 'Indice', underline: 'Souligné', double: 'Double', dotted: 'Pointillé', dashed: 'Tireté', wavy: 'Ondulé' };

  // 1) Le bouton « Aa » : dans la barre, entier dans le panneau, avec son icône et son nom, juste après Barré.
  const aa = await boxOf(page, MAIN);
  const icon = await page.evaluate(sel => { const b = document.querySelector(sel); const svg = b && b.querySelector('svg'); const r = svg && svg.getBoundingClientRect(); return { svg: !!svg, w: r ? r.width : 0, label: b ? b.getAttribute('aria-label') : '' }; }, MAIN);
  t.check(`${T} : « Aa » est dans la barre, entier dans le panneau, avec son icône`, !!aa && aa.inside && aa.w >= 24 && icon.svg && icon.w >= 12, { aa, icon });
  t.check(`${T} : « Aa » a son nom (${lang === 'en' ? 'Character' : 'Caractère'}…) pour les lecteurs d'écran`, names.main.test(icon.label), icon.label);
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-btn-strike, #v2-btn-char-main, #v2-align-group')).map(e => e.id));
  t.check(`${T} : « Aa » vient juste après Barré, avant le groupe Alignement`, JSON.stringify(order) === '["v2-btn-strike","v2-btn-char-main","v2-align-group"]', order);
  const noOldRow = await page.evaluate(() => ({ button: !!document.getElementById('v2-btn-character'), window: !!document.getElementById('pp-charfmt-spacing'), inAlign: /Caractère…|Character…/.test(document.getElementById('v2-align-group').textContent) }));
  t.check(`${T} : la ligne « Caractère… » n'est plus dans le menu Alignement (ni sa fenêtre)`, !noOldRow.button && !noOldRow.window && !noOldRow.inAlign, noOldRow);

  // 2) Le menu s'ouvre au survol, dans le panneau, chaque ligne au premier plan et lisible.
  await selectWord(page, 'deux');
  t.check(`${T} : le double-clic choisit « deux »`, (await selectedText(page)) === 'deux', await selectedText(page));
  const first = await toRow(page, MAIN, ROW.caps);
  const shown = await page.evaluate(({ fly, ids }) => {
    const f = document.querySelector(fly);
    const r = f.getBoundingClientRect();
    const rows = ids.map((id) => {
      const el = document.querySelector(id);
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { id, inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, onTop: !!top && el.contains(top), text: el.textContent.trim() };
    });
    return { display: getComputedStyle(f).display, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, label: (f.querySelector('.v2-hover-flyout-label') || {}).textContent, rows };
  }, { fly: FLYOUT, ids: [ROW.caps, ROW.shadow, ROW.stroke, '#v2-btn-superscript', '#v2-btn-subscript', '#v2-char-spacing-minus', '#v2-char-spacing-plus', FIELD] });
  t.check(`${T} : au survol de « Aa », le menu « ${names.label} » s'ouvre entier dans le panneau, ses huit contrôles au premier plan`, first.inside && shown.display !== 'none' && shown.inside && shown.rows.every(r => r.inside && r.onTop), shown);
  t.check(`${T} : le menu dit ${names.label}, ${names.caps}, ${names.shadow}, ${names.stroke}`, shown.label === names.label && shown.rows[0].text === names.caps && shown.rows[1].text === names.shadow && shown.rows[2].text === names.stroke, shown);
  const spacingLabel = await page.evaluate(() => document.querySelector('.v2-char-spacing-label').textContent);
  t.check(`${T} : la ligne de l'espacement le nomme (${names.spacing}) et son champ dit « pt »`, spacingLabel === names.spacing && (await page.evaluate(() => document.querySelector('.v2-char-stepper-unit').textContent)) === 'pt', spacingLabel);
  const ratios = {};
  for (const [name, selector] of [['caps', ROW.caps], ['shadow', ROW.shadow], ['stroke', ROW.stroke], ['label', FLYOUT + ' .v2-hover-flyout-label'], ['spacing', '.v2-char-spacing-label'], ['field', FIELD]]) ratios[name] = await contrastOf(page, selector);
  t.check(`${T} : le texte du menu se lit (contraste d'au moins 4,5 : 1 pour les lignes et le champ, 3 : 1 pour le titre)`, ratios.caps >= 4.5 && ratios.shadow >= 4.5 && ratios.stroke >= 4.5 && ratios.spacing >= 4.5 && ratios.field >= 4.5 && ratios.label >= 3, ratios);
  await snap(page, `${T}-1-menu-aa`);

  // 3) Un vrai clic règle le mot, que l'éditeur dessine ; le mot reste choisi ; UN Ctrl+Z le défait.
  for (const [key, field] of [['caps', 'caps'], ['shadow', 'shadow'], ['stroke', 'stroke']]) {
    const want = key === 'caps' ? (v => v.caps === 'small-caps') : (v => v[field] === true);
    await clickRow(page, MAIN, ROW[key]);
    const on = await looks(page, 'deux');
    const around = await looks(page, 'trois');
    const row = await rowState(page, ROW[key]);
    t.check(`${T} : un clic sur « ${names[key]} » le pose sur « deux » (dessiné), sur lui seul, la ligne est cochée`, want(on) && !want(around) && row.checked === 'true', { on, around, row });
    t.check(`${T} : le mot reste choisi et le clavier reste dans le texte (pas de fenêtre)`, (await selectedText(page)) === 'deux' && (await keyboardIn(page)) === 'editor' && (await display(page, '.var-modal-overlay')) !== 'flex', { sel: await selectedText(page), kb: await keyboardIn(page) });
    if (key === 'caps') t.check(`${T} : « Aa » est enfoncé quand le texte porte un réglage`, await page.evaluate(() => document.getElementById('v2-btn-char-main').classList.contains('is-active')));
    await page.keyboard.press('Control+z');
    await pause(250);
    const off = await looks(page, 'deux');
    t.check(`${T} : UN Ctrl+Z défait « ${names[key]} »`, !want(off), off);
    await page.keyboard.press('Control+Shift+z');
    await pause(250);
    const back = await looks(page, 'deux');
    t.check(`${T} : Ctrl+Maj+Z le remet`, want(back), back);
    await page.keyboard.press('Control+z');
    await pause(250);
  }

  // 4) L'espacement : « + » et « − » (un demi-point), une valeur tapée au clavier, une saisie fausse.
  await clickRow(page, MAIN, '#v2-char-spacing-plus');
  await pause(BETWEEN_STEPS);
  const half = { field: await page.evaluate(sel => document.querySelector(sel).value, FIELD), looks: (await looks(page, 'deux')).spacing };
  t.check(`${T} : un clic sur « + » écarte d'un demi-point (le champ dit ${numberAs(lang, '0,5')}, l'éditeur dessine 0,5 pt)`, half.field === numberAs(lang, '0,5') && half.looks === 0.5, half);
  await press(page);
  await pause(BETWEEN_STEPS);
  const one = { field: await page.evaluate(sel => document.querySelector(sel).value, FIELD), looks: (await looks(page, 'deux')).spacing };
  t.check(`${T} : un second clic le porte à 1 pt`, one.field === '1' && one.looks === 1, one);
  await page.keyboard.press('Control+z');
  await pause(250);
  t.check(`${T} : UN Ctrl+Z ne défait que le dernier pas (0,5 pt)`, (await looks(page, 'deux')).spacing === 0.5, await looks(page, 'deux'));
  await page.keyboard.press('Control+z');
  await pause(250);
  t.check(`${T} : un second Ctrl+Z rend l'espacement d'avant (aucun)`, (await looks(page, 'deux')).spacing === 0, await looks(page, 'deux'));
  // Une valeur tapée : le champ prend le clavier, Entrée l'applique et le rend au texte.
  const field = await toRow(page, MAIN, FIELD);
  await press(page);
  t.check(`${T} : un clic dans le champ lui donne le clavier`, (await keyboardIn(page)) === 'v2-char-spacing-val', await keyboardIn(page));
  await page.keyboard.press('Control+a');
  await page.keyboard.type(numberAs(lang, '2,5'));
  await page.keyboard.press('Enter');
  await pause(300);
  const typed = { value: await page.evaluate(sel => document.querySelector(sel).value, FIELD), looks: (await looks(page, 'deux')).spacing, kb: await keyboardIn(page), sel: await selectedText(page) };
  t.check(`${T} : « ${numberAs(lang, '2,5')} » puis Entrée : 2,5 pt dessinés sur « deux », le clavier retourne dans le texte, le mot reste choisi`, typed.looks === 2.5 && typed.kb === 'editor' && typed.sel === 'deux' && typed.value === numberAs(lang, '2,5'), typed);
  await page.keyboard.press('Control+z');
  await pause(250);
  t.check(`${T} : UN Ctrl+Z défait la valeur tapée`, (await looks(page, 'deux')).spacing === 0, await looks(page, 'deux'));
  // Une valeur tapée puis la touche Tab (sans Entrée) : elle s'applique au départ du focus, et le focus va où la personne allait (le « + » suivant) : l'éditeur ne le reprend pas.
  await toRow(page, MAIN, FIELD);
  await press(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.type(numberAs(lang, '1,5'));
  await page.keyboard.press('Tab');
  await pause(300);
  const tabbed = { looks: (await looks(page, 'deux')).spacing, kb: await keyboardIn(page) };
  t.check(`${T} : « ${numberAs(lang, '1,5')} » puis Tab : 1,5 pt dessinés sur « deux », le focus passe au bouton « + » (l'éditeur ne le reprend pas)`, tabbed.looks === 1.5 && tabbed.kb === 'v2-char-spacing-plus', tabbed);
  await page.keyboard.press('Control+z');
  await pause(250);
  t.check(`${T} : UN Ctrl+Z défait aussi la valeur validée par Tab`, (await looks(page, 'deux')).spacing === 0, await looks(page, 'deux'));
  // Une saisie fausse se dit et ne pose rien ; Échap rend l'espacement du texte.
  await toRow(page, MAIN, FIELD);
  await press(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('abc');
  await pause(150);
  const bad = await rowState(page, FIELD);
  const badInk = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).color, FIELD);
  await page.keyboard.press('Enter');
  await pause(200);
  const kept = { invalid: await attr(page, FIELD, 'aria-invalid'), value: await page.evaluate(sel => document.querySelector(sel).value, FIELD), kb: await keyboardIn(page), looks: (await looks(page, 'deux')).spacing };
  t.check(`${T} : « abc » se dit (aria-invalid, info-bulle, texte rouge), Entrée le garde à corriger et ne pose rien`, bad.title.length > 0 && (await attr(page, FIELD, 'aria-invalid')) === 'true' && kept.invalid === 'true' && kept.value === 'abc' && kept.kb === 'v2-char-spacing-val' && kept.looks === 0 && badInk !== 'rgb(27, 36, 48)', { bad, badInk, kept });
  await page.keyboard.press('Escape');
  await pause(200);
  const restored = { invalid: await attr(page, FIELD, 'aria-invalid'), value: await page.evaluate(sel => document.querySelector(sel).value, FIELD), kb: await keyboardIn(page), looks: (await looks(page, 'deux')).spacing };
  t.check(`${T} : Échap rend au champ l'espacement du texte (0) et le clavier au texte`, restored.invalid === null && restored.value === '0' && restored.kb === 'editor' && restored.looks === 0, restored);

  // 5) Exposant et Indice, dans ce menu.
  await clickRow(page, MAIN, '#v2-btn-superscript');
  const sup = { looks: await looks(page, 'deux'), pressed: await attr(page, '#v2-btn-superscript', 'aria-pressed') };
  t.check(`${T} : « ${names.sup} » du menu pose <sup> sur « deux » et s'enfonce`, sup.looks.sup && !sup.looks.sub && sup.pressed === 'true', sup);
  await clickRow(page, MAIN, '#v2-btn-subscript');
  const sub = { looks: await looks(page, 'deux'), pressed: await attr(page, '#v2-btn-subscript', 'aria-pressed'), supPressed: await attr(page, '#v2-btn-superscript', 'aria-pressed') };
  t.check(`${T} : « ${names.sub} » remplace l'exposant (un seul des deux)`, sub.looks.sub && !sub.looks.sup && sub.pressed === 'true' && sub.supPressed === 'false', sub);
  await press(page);
  t.check(`${T} : un second clic retire l'indice`, !(await looks(page, 'deux')).sub);

  // 6) Le menu du bouton Souligné.
  await setDoc(page, '<p>Un deux trois quatre cinq</p>');
  await selectWord(page, 'trois');
  const single = await toRow(page, UNDERLINE, underlineRow('single'));
  const menu = await page.evaluate(({ fly, kinds }) => {
    const f = document.querySelector(fly);
    const r = f.getBoundingClientRect();
    const rows = kinds.map((kind) => {
      const el = document.getElementById('v2-underline-' + kind);
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const sample = el.querySelector('.v2-underline-sample');
      return { kind, text: sample.textContent, inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, onTop: !!top && el.contains(top), style: getComputedStyle(sample).textDecorationStyle, line: getComputedStyle(sample).textDecorationLine, hint: el.getAttribute('data-keyhint') || '' };
    });
    return { display: getComputedStyle(f).display, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, rows };
  }, { fly: UNDERLINE_FLYOUT, kinds: ['single', 'double', 'dotted', 'dashed', 'wavy'] });
  t.check(`${T} : au survol de « ${names.underline} », son menu s'ouvre entier dans le panneau, ses cinq lignes au premier plan`, single.inside && menu.display !== 'none' && menu.inside && menu.rows.every(r => r.inside && r.onTop), menu);
  t.check(`${T} : la première ligne est « ${names.underline} » avec sa touche, puis ${names.double}, ${names.dotted}, ${names.dashed}, ${names.wavy}`, menu.rows.map(r => r.text).join('|') === [names.underline, names.double, names.dotted, names.dashed, names.wavy].join('|') && /(Ctrl|Cmd|⌘)\W*U/i.test(menu.rows[0].hint), menu.rows);
  t.check(`${T} : chaque ligne est dessinée comme son trait (simple, double, pointillé, tireté, ondulé)`, menu.rows.map(r => r.style).join('|') === 'solid|double|dotted|dashed|wavy' && menu.rows.every(r => /underline/.test(r.line)), menu.rows.map(r => r.style));
  const underlineInk = {};
  for (const kind of ['single', 'double', 'wavy']) underlineInk[kind] = await contrastOf(page, underlineRow(kind));
  t.check(`${T} : les lignes du menu Souligné se lisent (contraste d'au moins 4,5 : 1)`, Object.values(underlineInk).every(r => r >= 4.5), underlineInk);
  await snap(page, `${T}-2-menu-souligne`);
  await clickRow(page, UNDERLINE, underlineRow('double'));
  t.check(`${T} : un clic sur « ${names.double} » pose le trait double sur « trois » seul`, (await looks(page, 'trois')).line === 'double' && (await looks(page, 'deux')).line === null && (await rowState(page, underlineRow('double'))).checked === 'true', { trois: await looks(page, 'trois'), row: await rowState(page, underlineRow('double')) });
  t.check(`${T} : le bouton « ${names.underline} » est enfoncé et le mot reste choisi`, (await page.evaluate(() => document.getElementById('v2-btn-underline').classList.contains('is-active'))) && (await selectedText(page)) === 'trois', await selectedText(page));
  await clickRow(page, UNDERLINE, underlineRow('wavy'));
  t.check(`${T} : un clic sur « ${names.wavy} » remplace le trait (ondulé), la ligne double se décoche`, (await looks(page, 'trois')).line === 'wavy' && (await rowState(page, underlineRow('double'))).checked === 'false' && (await rowState(page, underlineRow('wavy'))).checked === 'true');
  await press(page);
  t.check(`${T} : un second clic sur la même ligne retire le soulignement`, (await looks(page, 'trois')).line === null, await looks(page, 'trois'));
  await page.keyboard.press('Control+z');
  await pause(250);
  t.check(`${T} : UN Ctrl+Z rend le trait ondulé`, (await looks(page, 'trois')).line === 'wavy', await looks(page, 'trois'));
  await clickRow(page, UNDERLINE, underlineRow('single'));
  t.check(`${T} : la première ligne (« ${names.underline} ») pose le trait simple`, (await looks(page, 'trois')).line === 'solid', await looks(page, 'trois'));
  // Le bouton lui-même garde son clic : il retire le soulignement, puis le pose.
  const ub = await goTo(page, UNDERLINE);
  t.check(`${T} : la souris sur le bouton, le menu est ouvert`, (await display(page, UNDERLINE_FLYOUT)) !== 'none', await display(page, UNDERLINE_FLYOUT));
  await press(page);
  t.check(`${T} : le clic sur le bouton retire le soulignement, comme Ctrl+U`, (await looks(page, 'trois')).line === null, await looks(page, 'trois'));
  t.check(`${T} : le clic referme le menu (la souris est encore dessus) : il ne recouvre pas le texte qu'on vise ensuite`, (await display(page, UNDERLINE_FLYOUT)) === 'none', await display(page, UNDERLINE_FLYOUT));
  await press(page);
  t.check(`${T} : un second clic sur le bouton pose le soulignement classique`, (await looks(page, 'trois')).line === 'solid' && ub.inside, await looks(page, 'trois'));
  await page.keyboard.press('Control+u');
  await pause(250);
  t.check(`${T} : Ctrl+U le retire encore`, (await looks(page, 'trois')).line === null, await looks(page, 'trois'));

  // 7) Une sélection aux réglages mêlés : un tiret, et un clic le pose partout.
  await setDoc(page, '<p>Un deux trois quatre cinq</p>');
  await selectWord(page, 'deux');
  await clickRow(page, MAIN, ROW.caps);
  await clickInText(page, 'Un');
  await page.keyboard.press('Control+a');
  await pause(250);
  await toRow(page, MAIN, ROW.caps);
  const mixed = await page.evaluate(sel => { const el = document.querySelector(sel); const after = getComputedStyle(el, '::after'); const before = getComputedStyle(el, '::before'); return { checked: el.getAttribute('aria-checked'), mask: (after.maskImage + ' ' + after.webkitMaskImage + ' ' + before.maskImage + ' ' + before.webkitMaskImage), shown: after.visibility + '/' + before.visibility }; }, ROW.caps);
  t.check(`${T} : « ${names.caps} » sur un texte en partie en petites capitales : tiret (aria-checked « mixed »)`, mixed.checked === 'mixed' && /M6 12h12/.test(mixed.mask) && /visible/.test(mixed.shown), mixed);
  await press(page);
  const all = [await looks(page, 'Un'), await looks(page, 'deux'), await looks(page, 'cinq')];
  t.check(`${T} : un clic la pose partout (la ligne se coche), un second la retire partout`, all.every(l => l.caps === 'small-caps') && (await rowState(page, ROW.caps)).checked === 'true', all);
  await press(page);
  t.check(`${T} : un second clic retire les petites capitales de tout le texte`, [await looks(page, 'Un'), await looks(page, 'deux'), await looks(page, 'cinq')].every(l => l.caps === 'normal'));

  // 8) Au clavier : le focus entre dans le menu (Tab), Entrée coche la ligne.
  await setDoc(page, '<p>Un deux trois quatre cinq</p>');
  await selectWord(page, 'quatre');
  await page.focus(MAIN);
  await pause(300);
  t.check(`${T} : le focus sur « Aa » ouvre le menu (au clavier aussi)`, (await display(page, FLYOUT)) !== 'none', await display(page, FLYOUT));
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  const focused = await keyboardIn(page);
  t.check(`${T} : trois Tab amènent le focus sur « ${names.caps} » (Exposant, Indice, puis la ligne)`, focused === ROW.caps.slice(1), focused);
  await page.keyboard.press('Enter');
  await pause(250);
  t.check(`${T} : Entrée coche la ligne, règle « quatre » et rend le clavier au texte (comme les boutons de la barre)`, (await looks(page, 'quatre')).caps === 'small-caps' && (await rowState(page, ROW.caps)).checked === 'true' && (await keyboardIn(page)) === 'editor', { looks: await looks(page, 'quatre'), row: await rowState(page, ROW.caps), kb: await keyboardIn(page) });
  await page.focus(MAIN);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await pause(250);
  t.check(`${T} : Espace la décoche et retire le réglage`, (await looks(page, 'quatre')).caps === 'normal' && (await rowState(page, ROW.caps)).checked === 'false', { looks: await looks(page, 'quatre'), row: await rowState(page, ROW.caps) });
  await page.mouse.move(350, 380, { steps: 3 });
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await pause(250);
  t.check(`${T} : le menu se referme quand le focus et la souris partent`, (await display(page, FLYOUT)) === 'none', await display(page, FLYOUT));

  // 9) Un modèle email : les lignes qu'il grise disent pourquoi, Exposant et Indice restent.
  if (lang === 'fr') {
    await newTemplate(page, 'email');
    await page.evaluate(() => Editor.setHTML('<p>Un deux trois</p>'));
    await pause(150);
    await selectWord(page, 'deux');
    const before = await html(page);
    await clearStatus(page);
    const r = await toRow(page, MAIN, ROW.stroke);
    const shut = await rowState(page, ROW.stroke);
    const seenUnder = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const holder = el && el.closest('[data-pp-lock-reason]'); return { holder: holder ? holder.id : null, title: el && el.closest('[title]') ? el.closest('[title]').title : '', cursor: el ? getComputedStyle(el).cursor : '' }; }, { x: r.x, y: r.y });
    t.check(`${T}, email : la ligne « ${names.stroke} » est grisée, son info-bulle dit pourquoi, le curseur est « interdit »`, shut.blocks && /email/i.test(shut.title) && shut.title === shut.reason && seenUnder.holder === ROW.stroke.slice(1) && seenUnder.cursor === 'not-allowed', { shut, seenUnder });
    await press(page);
    t.check(`${T}, email : le clic écrit la raison dans le coin d'état et ne change rien`, (await status(page)) === shut.reason && (await html(page)) === before, { status: await status(page), same: (await html(page)) === before });
    const kept = await rowState(page, '#v2-btn-superscript');
    t.check(`${T}, email : Exposant et Indice restent actifs (sans raison)`, !kept.blocks && kept.reason === '', kept);
    await clickRow(page, MAIN, '#v2-btn-superscript');
    t.check(`${T}, email : un clic sur Exposant pose <sup>`, (await looks(page, 'deux')).sup, await html(page));
    // Le soulignement : le groupe grisé n'ouvre pas son menu, l'appui dit pourquoi.
    await goTo(page, UNDERLINE);
    await pause(500);
    t.check(`${T}, email : le menu Souligné grisé ne s'ouvre pas au survol`, (await display(page, UNDERLINE_FLYOUT)) === 'none', await display(page, UNDERLINE_FLYOUT));
    await clearStatus(page);
    await press(page);
    t.check(`${T}, email : l'appui sur Souligné dit pourquoi`, /email/i.test(await status(page)), await status(page));
  }
  await page.context().close();
}

await run('clair', 'fr');
await run('sombre', 'fr');
await run('clair', 'en');
await t.finish();
