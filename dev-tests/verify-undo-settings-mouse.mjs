#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent les RÉGLAGES de la personne, à la vraie souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair puis en
// anglais sombre - suite de sa demande du 22/10 (« Il doit prendre en compte 100% des actions faites dans le widget ») et de sa réponse du 27/10 (« Oui, tout, Réglages compris »). Ce que dev-tests/scenarios-undo-settings.js ne peut pas
// voir depuis la page : le vrai clic sur la case d'un thème, des bulles et des puces ou d'une messagerie, la liste du caractère d'insertion changée par une flèche du clavier, la fenêtre Réglages atteignable et refermée dans 700x400, le thème
// qu'on voit changer (le fond de la page), la touche frappée par le clavier lui-même.
//   1) le thème : la case de l'autre thème cliquée dans l'onglet Thème ; sous la fenêtre ouverte, Ctrl + Z n'agit pas ; la fenêtre refermée, UN Ctrl + Z rend le thème d'avant (le fond le montre, le coin d'état le dit), UN Ctrl + Y l'autre,
//      puis les boutons de la barre ; les Réglages rouverts cochent le thème en vigueur ;
//   2) les bulles et les puces : « Mise en forme » cliquée, rendue par Ctrl + Z, redonnée par Ctrl + Y ;
//   3) le caractère d'insertion : la liste changée par la flèche du clavier (« # » puis « @ »), rendue par Ctrl + Z, redonnée par Ctrl + Y ;
//   4) la messagerie : « Zimbra » cliquée, rendue par Ctrl + Z, redonnée par Ctrl + Y et par les boutons de la barre ;
//   5) du texte, le thème, du texte : trois Ctrl + Z dans l'ordre inverse, trois Ctrl + Y dans l'ordre ;
//   6) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoSettingsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-settings-mouse.mjs
import { open, stopServer, sleep, click, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_SETTINGS_MOUSE_PORT || 9160);
const SPEC = { models: { count: 2, paragraphs: 2 } };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const attr = (page, name) => page.evaluate(n => document.documentElement.getAttribute(n), name);
const stored = (page, key) => page.evaluate(k => PersonStore.get(k), key);
const background = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const status = page => page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
// Le texte du coin d'état d'un réglage : le nom du réglage et sa valeur sont ceux de la page (clés i18n), ou le caractère lui-même.
const said = (page, labelKey, valueKey, rawValue) => page.evaluate(({ labelKey, valueKey, rawValue }) => I18n.t('status.settingSet', { setting: I18n.t(labelKey), value: rawValue !== undefined ? rawValue : I18n.t(valueKey) }), { labelKey, valueKey, rawValue });
const text = page => page.evaluate(() => EditorCore.getEditor().getText());
const inEditor = page => page.evaluate(() => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ProseMirror')));
const displayed = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; }, selector);
const forget = page => page.evaluate(() => { if (typeof ActionHistory !== 'undefined') ActionHistory.reset(); });
const checkedValue = (page, name) => page.evaluate(n => { const found = document.querySelector('input[name="' + n + '"]:checked'); return found ? found.value : null; }, name);
async function key(page, combo, wait = 900) {
  await page.keyboard.press(combo);
  await sleep(wait);
}
async function toEnd(page) {
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await sleep(200);
}
// Un contrôle atteignable : dans le panneau, et rien d'autre à son centre.
const reach = (page, selector) => page.evaluate(sel => {
  const e = document.querySelector(sel);
  if (!e) return { found: false };
  const r = e.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === e || e.contains(top)) };
}, selector);
const reachable = async (page, selector) => { const r = await reach(page, selector); return r.found && r.inViewport && r.onTop; };
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

async function phase(lang, theme) {
  const tag = `${lang}/${theme}`;
  const other = theme === 'light' ? 'dark' : 'light';
  const w = await open({ spec: SPEC, port: PORT, theme, lang });
  const { page } = w;
  console.log(`\n=== Ctrl + Z et les réglages de la personne, vraie souris et vrai clavier, 700x400, ${lang === 'fr' ? 'français clair' : 'anglais sombre'} ===`);
  try {
    await pickTemplate(page, 'Modèle 0001');
    await forget(page);
    check(`${tag} 0 : le thème de départ est « ${theme} », les bulles par défaut, « # », Standard`, (await attr(page, 'data-theme')) === theme && (await attr(page, 'data-bubble-marks')) === null && (await page.evaluate(() => Variables.triggerChar())) === '#' && (await page.evaluate(() => MailtoExport.getMailClient())) === 'standard');

    // --- 1) le thème ---
    const startBackground = await background(page);
    await openSettings(page, 'theme');
    check(`${tag} 1 : Réglages s'ouvre sur l'onglet Thème, la case du thème en vigueur est cochée, « Fermer » est atteignable`, await displayed(page, '#settings-modal') && (await checkedValue(page, 'settings-theme')) === theme && await reachable(page, '#settings-close'), { checked: await checkedValue(page, 'settings-theme') });
    await clickRadio(page, 'settings-theme', other);
    await sleep(400);
    const otherBackground = await background(page);
    check(`${tag} 1 : le vrai clic sur la case « ${other} » change le thème : l'attribut, la clé gardée, le fond de la page`, (await attr(page, 'data-theme')) === other && (await stored(page, 'pp_theme')) === other && otherBackground !== startBackground, { attr: await attr(page, 'data-theme'), stored: await stored(page, 'pp_theme'), startBackground, otherBackground });
    await key(page, 'Control+z');
    check(`${tag} 1 : sous la fenêtre ouverte, Ctrl + Z n'agit pas (le thème reste)`, (await attr(page, 'data-theme')) === other && await displayed(page, '#settings-modal'), await attr(page, 'data-theme'));
    await closeSettings(page);
    check(`${tag} 1 : la fenêtre est refermée`, !(await displayed(page, '#settings-modal')));
    await key(page, 'Control+z');
    check(`${tag} 1 : Ctrl + Z rend le thème d'avant (attribut, clé gardée, fond de la page)`, (await attr(page, 'data-theme')) === theme && (await stored(page, 'pp_theme')) === theme && (await background(page)) === startBackground, { attr: await attr(page, 'data-theme'), stored: await stored(page, 'pp_theme') });
    check(`${tag} 1 : le coin d'état dit le thème`, (await status(page)) === await said(page, 'settings.tab.theme', 'settings.theme.' + theme), await status(page));
    check(`${tag} 1 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+y');
    check(`${tag} 1 : Ctrl + Y rend l'autre thème`, (await attr(page, 'data-theme')) === other && (await background(page)) === otherBackground && (await status(page)) === await said(page, 'settings.tab.theme', 'settings.theme.' + other), { attr: await attr(page, 'data-theme'), status: await status(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 1 : le bouton Annuler de la barre rend le thème d'avant`, (await attr(page, 'data-theme')) === theme, await attr(page, 'data-theme'));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 1 : le bouton Rétablir de la barre rend l'autre thème`, (await attr(page, 'data-theme')) === other, await attr(page, 'data-theme'));
    await key(page, 'Control+z');
    await openSettings(page, 'theme');
    check(`${tag} 1 : les Réglages rouverts cochent le thème en vigueur`, (await checkedValue(page, 'settings-theme')) === theme, await checkedValue(page, 'settings-theme'));
    await closeSettings(page);

    // --- 2) les bulles et les puces ---
    await forget(page);
    await openSettings(page, 'theme');
    await clickRadio(page, 'settings-bubble-marks', 'marks');
    await sleep(300);
    check(`${tag} 2 : le vrai clic sur « Mise en forme » pose le choix (attribut, clé gardée)`, (await attr(page, 'data-bubble-marks')) === 'marks' && (await stored(page, 'pp_bubble_marks')) === 'marks', { attr: await attr(page, 'data-bubble-marks'), stored: await stored(page, 'pp_bubble_marks') });
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 2 : Ctrl + Z rend « Par défaut » (attribut retiré, clé gardée), le coin d'état le dit`, (await attr(page, 'data-bubble-marks')) === null && (await stored(page, 'pp_bubble_marks')) === 'default' && (await status(page)) === await said(page, 'settings.bubbleMarks.title', 'settings.bubbleMarks.default'), { attr: await attr(page, 'data-bubble-marks'), status: await status(page) });
    await key(page, 'Control+y');
    check(`${tag} 2 : Ctrl + Y rend « Mise en forme »`, (await attr(page, 'data-bubble-marks')) === 'marks' && (await status(page)) === await said(page, 'settings.bubbleMarks.title', 'settings.bubbleMarks.marks'), { attr: await attr(page, 'data-bubble-marks'), status: await status(page) });
    await key(page, 'Control+z');
    await openSettings(page, 'theme');
    check(`${tag} 2 : les Réglages rouverts cochent « Par défaut »`, (await checkedValue(page, 'settings-bubble-marks')) === 'default', await checkedValue(page, 'settings-bubble-marks'));
    await closeSettings(page);

    // --- 3) le caractère d'insertion ---
    await forget(page);
    await openSettings(page, 'triggerKey');
    check(`${tag} 3 : l'onglet Insertion montre « # »`, (await page.evaluate(() => document.getElementById('settings-trigger-char').value)) === '#');
    await clickWhere(page, () => document.getElementById('settings-trigger-char'));
    await sleep(300);
    await page.keyboard.press('ArrowDown');
    await sleep(200);
    await page.keyboard.press('Enter');
    await sleep(400);
    check(`${tag} 3 : la liste changée au clavier pose « @ » (clé gardée)`, (await page.evaluate(() => Variables.triggerChar())) === '@' && (await stored(page, 'pp_trigger_char')) === '@', { shown: await page.evaluate(() => document.getElementById('settings-trigger-char').value), stored: await stored(page, 'pp_trigger_char') });
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 3 : Ctrl + Z rend « # », le coin d'état le dit`, (await page.evaluate(() => Variables.triggerChar())) === '#' && (await status(page)) === await said(page, 'settings.triggerKey.name', undefined, '#'), { trigger: await page.evaluate(() => Variables.triggerChar()), status: await status(page) });
    await key(page, 'Control+y');
    check(`${tag} 3 : Ctrl + Y rend « @ »`, (await page.evaluate(() => Variables.triggerChar())) === '@' && (await status(page)) === await said(page, 'settings.triggerKey.name', undefined, '@'), { trigger: await page.evaluate(() => Variables.triggerChar()), status: await status(page) });
    await key(page, 'Control+z');

    // --- 4) la messagerie ---
    await forget(page);
    await openSettings(page, 'mailClient');
    await clickRadio(page, 'settings-mail-client', 'zimbra');
    await sleep(300);
    check(`${tag} 4 : le vrai clic sur « Zimbra » pose la messagerie (clé gardée)`, (await page.evaluate(() => MailtoExport.getMailClient())) === 'zimbra' && (await stored(page, 'pp_mail_client')) === 'zimbra', await stored(page, 'pp_mail_client'));
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 4 : Ctrl + Z rend Standard, le coin d'état le dit`, (await page.evaluate(() => MailtoExport.getMailClient())) === 'standard' && (await status(page)) === await said(page, 'settings.tab.mailClient', 'settings.mailClient.standard'), { client: await page.evaluate(() => MailtoExport.getMailClient()), status: await status(page) });
    await key(page, 'Control+y');
    check(`${tag} 4 : Ctrl + Y rend Zimbra`, (await page.evaluate(() => MailtoExport.getMailClient())) === 'zimbra' && (await status(page)) === await said(page, 'settings.tab.mailClient', 'settings.mailClient.zimbra'), { client: await page.evaluate(() => MailtoExport.getMailClient()), status: await status(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 4 : le bouton Annuler de la barre rend Standard`, (await page.evaluate(() => MailtoExport.getMailClient())) === 'standard', await page.evaluate(() => MailtoExport.getMailClient()));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 4 : le bouton Rétablir de la barre rend Zimbra`, (await page.evaluate(() => MailtoExport.getMailClient())) === 'zimbra', await page.evaluate(() => MailtoExport.getMailClient()));
    await key(page, 'Control+z');
    await openSettings(page, 'mailClient');
    check(`${tag} 4 : les Réglages rouverts cochent Standard`, (await checkedValue(page, 'settings-mail-client')) === 'standard', await checkedValue(page, 'settings-mail-client'));
    await closeSettings(page);

    // --- 5) l'ordre avec le texte ---
    await forget(page);
    await toEnd(page);
    await page.keyboard.type(' RANG');
    await sleep(700);
    await openSettings(page, 'theme');
    await clickRadio(page, 'settings-theme', other);
    await sleep(300);
    await closeSettings(page);
    await toEnd(page);
    await page.keyboard.type(' ORDRE');
    await sleep(700);
    check(`${tag} 5 : le texte, le thème, le texte`, / RANG/.test(await text(page)) && / ORDRE/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+z');
    check(`${tag} 5 : 1er Ctrl + Z : le second texte seul`, !/ ORDRE/.test(await text(page)) && / RANG/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+z');
    check(`${tag} 5 : 2e Ctrl + Z : le thème seul`, / RANG/.test(await text(page)) && (await attr(page, 'data-theme')) === theme, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+z');
    check(`${tag} 5 : 3e Ctrl + Z : le premier texte`, !/ RANG/.test(await text(page)) && (await attr(page, 'data-theme')) === theme, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 5 : 2e Ctrl + Y : le premier texte et le thème`, / RANG/.test(await text(page)) && !/ ORDRE/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+y');
    check(`${tag} 5 : 3e Ctrl + Y : le second texte`, / ORDRE/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });

    check(`${tag} 6 : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
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
