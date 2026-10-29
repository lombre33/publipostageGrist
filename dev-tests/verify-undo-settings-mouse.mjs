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
//   5) les touches du clavier (Réglages > Raccourcis > Touches) : le bouton de la touche du gras cliqué, Alt+B tapée au vrai clavier, la fenêtre refermée, UN Ctrl + Z rend Ctrl+B (l'infobulle, la ligne rouverte), UN Ctrl + Y rend Alt+B, les boutons de la barre ;
//      le Retour arrière qui retire la touche de l'italique ; le bouton « Par défaut » de la ligne ; « Tout remettre par défaut » et sa question : UN pas, défait avec les deux touches qu'il rendait, puis les deux touches une à une ;
//   6) le caractère déclencheur des abréviations (Réglages > Raccourcis > Abréviations) : « % » tapé dans le champ, Ctrl + Z rend « § », Ctrl + Y « % », le champ rouvert le dit ;
//   7) la liste des abréviations (même onglet) : « ub » et son texte tapés au vrai clavier, « Ajouter » au vrai clic, Ctrl + Z la retire (table, liste de l'éditeur, Réglages rouverts), Ctrl + Y la rend sous le même numéro de ligne ; « Modifier » puis
//      « Enregistrer » (le texte d'avant, puis celui d'après) ; « Supprimer » et sa question (la ligne revient sous son numéro, puis repart) ; les boutons de la barre ; le formulaire qui modifiait une ligne que Ctrl + Z a retirée repart à zéro ;
//   8) du texte, le thème, du texte : trois Ctrl + Z dans l'ordre inverse, trois Ctrl + Y dans l'ordre ;
//   9) aucune erreur de page.
// Le texte tapé au vrai clavier passe en DERNIER (8) : Chromium garde une pile d'annulation à lui, et une fois du texte tapé dans l'éditeur, son Ctrl + Z (« historyUndo », sans passer par js/shortcuts.js) défait le dernier geste même sous une
// fenêtre ouverte, focus sur un bouton ou une case. Les contrôles « sous la fenêtre ouverte, Ctrl + Z n'agit pas » des étapes 1 et 5 ne valent donc que pour une page où rien n'a été tapé (constaté dans Chromium ; Firefox n'a pas été essayé).
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

// Les touches du clavier : le bouton de la touche d'une action, son bouton « Par défaut », ce que la page en dit.
const keyButton = id => document.querySelector('.settings-key-row[data-action="' + id + '"] .settings-key-btn');
const keyDefault = id => document.querySelector('.settings-key-row[data-action="' + id + '"] .settings-key-reset');
const keyFor = (page, id) => page.evaluate(i => Shortcuts.keyFor(i), id);
// Les touches choisies, telles que la page les a GARDÉES (la clé pp_shortcuts) : pas de nouvelle porte de la page, la même lecture que sur le code d'avant.
const chosen = page => page.evaluate(() => { try { return JSON.parse(PersonStore.get('pp_shortcuts') || '{}'); } catch (e) { return null; } });
const shownKey = (page, id) => page.evaluate(i => document.querySelector('.settings-key-row[data-action="' + i + '"] .settings-key-btn').textContent, id);
const tipOf = (page, id) => page.evaluate(i => document.querySelector(Shortcuts.action(i).hint).getAttribute('data-keytip') || '', id);
const tipFor = (page, combo) => page.evaluate(c => (c ? ' (' + Shortcuts.format(c) + ')' : ''), combo);
const keySaid = (page, id, combo) => page.evaluate(({ id, combo }) => {
  const action = I18n.t(Shortcuts.action(id).label);
  return combo ? I18n.t('status.keySet', { action, key: Shortcuts.format(combo) }) : I18n.t('status.keyNone', { action });
}, { id, combo });
const keysSaid = (page, count) => page.evaluate(n => I18n.t('status.keysChanged', { count: n }), count);

// La liste des abréviations : les lignes de la table du document (la personne des essais est anonyme, Utilisateur vide), ce que la fenêtre en montre, ce que l'éditeur en connaît, le coin d'état.
const abbrRows = page => page.evaluate(() => { const t = window.__gristStub.state.rows.Publipostage_Abreviations; return t ? t.id.map((id, i) => ({ id, user: t.Utilisateur[i], abbr: t.Abreviation[i], text: t.Texte[i] })) : []; });
const abbrList = async page => (await abbrRows(page)).map(r => r.abbr + '=' + r.text);
const shownAbbr = page => page.evaluate(() => Array.from(document.querySelectorAll('#settings-expansion-list .settings-expansion-row .settings-expansion-abbr')).map(e => e.textContent));
const knownAbbr = page => page.evaluate(() => TextExpansion.list().map(e => e.abbreviation + '=' + e.text));
const abbrSaid = (page, key, abbr) => page.evaluate(({ key, abbr }) => I18n.t(key, { abbreviation: TextExpansion.storedChar() + abbr }), { key, abbr });
const formState = page => page.evaluate(() => ({ abbr: document.getElementById('settings-expansion-abbr').value, text: document.getElementById('settings-expansion-text').value, submit: document.getElementById('settings-expansion-submit').textContent, cancelShown: !document.getElementById('settings-expansion-cancel').hidden }));
// Le bouton « Modifier » (0) ou « Supprimer » (1) de la ligne de l'abréviation `abbr`.
const abbrButton = ({ abbr, index }) => {
  const row = Array.from(document.querySelectorAll('#settings-expansion-list .settings-expansion-row')).find(r => r.querySelector('.settings-expansion-abbr').textContent === TextExpansion.storedChar() + abbr);
  return row && row.querySelectorAll('button')[index];
};

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

    // --- 5) les touches du clavier ---
    await forget(page);
    await page.evaluate(() => Shortcuts.resetAll());
    await page.evaluate(() => ShortcutsPanel.showView('keys', false));
    await openSettings(page, 'shortcuts');
    check(`${tag} 5 : l'onglet Raccourcis montre les touches, le gras garde Ctrl+B`, await displayed(page, '#settings-keys-section') && (await shownKey(page, 'bold')) === await page.evaluate(() => Shortcuts.format('Mod+b')), await shownKey(page, 'bold'));
    await clickWhere(page, keyButton, 'bold');
    await sleep(250);
    check(`${tag} 5 : le clic sur la touche du gras l'écoute`, await page.evaluate(() => Shortcuts.isRecording()));
    await page.keyboard.press('Alt+b');
    await sleep(300);
    check(`${tag} 5 : Alt+B tapée au vrai clavier est prise (touche, choix gardé, ligne de la liste)`, (await keyFor(page, 'bold')) === 'Alt+b' && JSON.stringify(await chosen(page)) === '{"bold":"Alt+b"}' && (await shownKey(page, 'bold')) === 'Alt+B', { key: await keyFor(page, 'bold'), shown: await shownKey(page, 'bold') });
    check(`${tag} 5 : l'infobulle du gras dit Alt+B`, (await tipOf(page, 'bold')) === await tipFor(page, 'Alt+b'), await tipOf(page, 'bold'));
    await key(page, 'Control+z');
    check(`${tag} 5 : sous la fenêtre ouverte, Ctrl + Z n'agit pas (Alt+B reste)`, (await keyFor(page, 'bold')) === 'Alt+b' && await displayed(page, '#settings-modal'), await keyFor(page, 'bold'));
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 5 : Ctrl + Z rend Ctrl+B au gras (touche, choix gardé, infobulle)`, (await keyFor(page, 'bold')) === 'Mod+b' && (await chosen(page)) && Object.keys(await chosen(page)).length === 0 && (await tipOf(page, 'bold')) === await tipFor(page, 'Mod+b'), { key: await keyFor(page, 'bold'), tip: await tipOf(page, 'bold') });
    check(`${tag} 5 : le coin d'état nomme l'action et sa touche`, (await status(page)) === await keySaid(page, 'bold', 'Mod+b'), await status(page));
    check(`${tag} 5 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+y');
    check(`${tag} 5 : Ctrl + Y rend Alt+B`, (await keyFor(page, 'bold')) === 'Alt+b' && (await status(page)) === await keySaid(page, 'bold', 'Alt+b'), { key: await keyFor(page, 'bold'), status: await status(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 5 : le bouton Annuler de la barre rend Ctrl+B`, (await keyFor(page, 'bold')) === 'Mod+b', await keyFor(page, 'bold'));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 5 : le bouton Rétablir de la barre rend Alt+B`, (await keyFor(page, 'bold')) === 'Alt+b', await keyFor(page, 'bold'));
    await openSettings(page, 'shortcuts');
    check(`${tag} 5 : les Réglages rouverts montrent Alt+B, « Par défaut » est allumé`, (await shownKey(page, 'bold')) === 'Alt+B' && await page.evaluate(() => !document.querySelector('.settings-key-row[data-action="bold"] .settings-key-reset').disabled), await shownKey(page, 'bold'));
    // Le bouton « Par défaut » de la ligne.
    await clickWhere(page, keyDefault, 'bold');
    await sleep(250);
    check(`${tag} 5 : « Par défaut » rend Ctrl+B au gras`, (await keyFor(page, 'bold')) === 'Mod+b' && Object.keys(await chosen(page)).length === 0, await keyFor(page, 'bold'));
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 5 : Ctrl + Z redonne Alt+B (le pas de « Par défaut »)`, (await keyFor(page, 'bold')) === 'Alt+b' && (await status(page)) === await keySaid(page, 'bold', 'Alt+b'), { key: await keyFor(page, 'bold'), status: await status(page) });
    await key(page, 'Control+z');
    check(`${tag} 5 : le Ctrl + Z suivant rend Ctrl+B (le pas d'Alt+B)`, (await keyFor(page, 'bold')) === 'Mod+b' && Object.keys(await chosen(page)).length === 0, await keyFor(page, 'bold'));
    // Le Retour arrière qui retire la touche de l'italique.
    await forget(page);
    await openSettings(page, 'shortcuts');
    await clickWhere(page, keyButton, 'italic');
    await sleep(250);
    await page.keyboard.press('Backspace');
    await sleep(300);
    check(`${tag} 5 : le Retour arrière retire la touche de l'italique (« Aucune »)`, (await keyFor(page, 'italic')) === '' && JSON.stringify(await chosen(page)) === '{"italic":""}', { key: await keyFor(page, 'italic'), chosen: await chosen(page) });
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 5 : Ctrl + Z rend Ctrl+I à l'italique`, (await keyFor(page, 'italic')) === 'Mod+i' && (await status(page)) === await keySaid(page, 'italic', 'Mod+i'), { key: await keyFor(page, 'italic'), status: await status(page) });
    await key(page, 'Control+y');
    check(`${tag} 5 : Ctrl + Y le laisse sans touche, le coin d'état dit « aucune touche »`, (await keyFor(page, 'italic')) === '' && (await status(page)) === await keySaid(page, 'italic', ''), { key: await keyFor(page, 'italic'), status: await status(page) });
    await key(page, 'Control+z');
    // « Tout remettre par défaut » et sa question : UN pas.
    await forget(page);
    await openSettings(page, 'shortcuts');
    for (const [id, combo] of [['italic', 'Alt+i'], ['underline', 'Alt+u']]) {
      await clickWhere(page, keyButton, id);
      await sleep(250);
      await page.keyboard.press(combo);
      await sleep(300);
    }
    check(`${tag} 5 : deux touches choisies, « Tout remettre par défaut » s'allume`, JSON.stringify(await chosen(page)) === '{"italic":"Alt+i","underline":"Alt+u"}' && await page.evaluate(() => !document.getElementById('settings-keys-reset-all').disabled), await chosen(page));
    await clickWhere(page, () => document.getElementById('settings-keys-reset-all'));
    await sleep(400);
    await click(page, '#pp-dialog-modal .var-modal-primary');
    await sleep(400);
    check(`${tag} 5 : la question confirmée, toutes les touches sont d'origine`, Object.keys(await chosen(page)).length === 0, await chosen(page));
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 5 : UN Ctrl + Z redonne les deux touches d'un coup, le coin d'état dit deux touches`, JSON.stringify(await chosen(page)) === '{"italic":"Alt+i","underline":"Alt+u"}' && (await status(page)) === await keysSaid(page, 2), { chosen: await chosen(page), status: await status(page) });
    await key(page, 'Control+z');
    check(`${tag} 5 : le Ctrl + Z suivant défait la touche du soulignement seule`, JSON.stringify(await chosen(page)) === '{"italic":"Alt+i"}', await chosen(page));
    await key(page, 'Control+z');
    check(`${tag} 5 : puis celle de l'italique`, Object.keys(await chosen(page)).length === 0, await chosen(page));
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 5 : trois Ctrl + Y rendent les deux touches puis la remise à zéro`, Object.keys(await chosen(page)).length === 0 && (await status(page)) === await keysSaid(page, 2), { chosen: await chosen(page), status: await status(page) });
    await key(page, 'Control+z');
    await key(page, 'Control+z');
    await key(page, 'Control+z');
    check(`${tag} 5 : trois Ctrl + Z de plus ramènent les touches d'origine`, Object.keys(await chosen(page)).length === 0, await chosen(page));

    // --- 6) le caractère déclencheur des abréviations ---
    await forget(page);
    await openSettings(page, 'shortcuts');
    await clickWhere(page, () => document.getElementById('settings-switch-expansion'));
    await sleep(500);
    check(`${tag} 6 : l'onglet Abréviations montre « § » dans le champ du déclencheur`, await displayed(page, '#settings-expansion-section') && (await page.evaluate(() => document.getElementById('settings-expansion-char').value)) === '§', await page.evaluate(() => document.getElementById('settings-expansion-char').value));
    await clickWhere(page, () => document.getElementById('settings-expansion-char'));
    await sleep(200);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('%');
    await sleep(400);
    check(`${tag} 6 : « % » tapé au vrai clavier est pris (déclencheur écouté, clé gardée)`, (await page.evaluate(() => TextExpansion.triggerChar())) === '%' && (await stored(page, 'pp_expansion_char')) === '%', { trigger: await page.evaluate(() => TextExpansion.triggerChar()), stored: await stored(page, 'pp_expansion_char') });
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 6 : Ctrl + Z rend « § » (déclencheur écouté, clé gardée), le coin d'état le dit`, (await page.evaluate(() => TextExpansion.triggerChar())) === '§' && (await stored(page, 'pp_expansion_char')) === '§' && (await status(page)) === await said(page, 'settings.expansion.char', undefined, '§'), { trigger: await page.evaluate(() => TextExpansion.triggerChar()), status: await status(page) });
    await openSettings(page, 'shortcuts');
    check(`${tag} 6 : les Réglages rouverts montrent « § »`, (await page.evaluate(() => document.getElementById('settings-expansion-char').value)) === '§', await page.evaluate(() => document.getElementById('settings-expansion-char').value));
    await closeSettings(page);
    await key(page, 'Control+y');
    check(`${tag} 6 : Ctrl + Y rend « % »`, (await page.evaluate(() => TextExpansion.triggerChar())) === '%' && (await status(page)) === await said(page, 'settings.expansion.char', undefined, '%'), { trigger: await page.evaluate(() => TextExpansion.triggerChar()), status: await status(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 6 : le bouton Annuler de la barre rend « § »`, (await page.evaluate(() => TextExpansion.triggerChar())) === '§', await page.evaluate(() => TextExpansion.triggerChar()));

    // --- 7) la liste des abréviations ---
    await forget(page);
    await openSettings(page, 'shortcuts');
    await clickWhere(page, () => document.getElementById('settings-switch-expansion'));
    await sleep(500);
    check(`${tag} 7 : la liste des abréviations est vide et le formulaire dit « Ajouter »`, (await shownAbbr(page)).length === 0 && (await formState(page)).submit === await page.evaluate(() => I18n.t('settings.expansion.add')), { shown: await shownAbbr(page), form: await formState(page) });
    await clickWhere(page, () => document.getElementById('settings-expansion-abbr'));
    await page.keyboard.type('ub');
    await clickWhere(page, () => document.getElementById('settings-expansion-text'));
    await page.keyboard.type('université de Bordeaux');
    await clickWhere(page, () => document.getElementById('settings-expansion-submit'));
    await sleep(600);
    check(`${tag} 7 : « Ajouter » écrit la ligne (table, liste de la fenêtre, liste de l'éditeur), une action en réserve`, JSON.stringify(await abbrList(page)) === '["ub=université de Bordeaux"]' && JSON.stringify(await shownAbbr(page)) === '["§ub"]' && JSON.stringify(await knownAbbr(page)) === '["ub=université de Bordeaux"]' && (await page.evaluate(() => ActionHistory.count())) === 1, { table: await abbrList(page), shown: await shownAbbr(page) });
    const ubRow = (await abbrRows(page))[0].id;
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 7 : Ctrl + Z retire l'abréviation (table, liste de l'éditeur), le coin d'état la nomme`, (await abbrList(page)).length === 0 && (await knownAbbr(page)).length === 0 && (await status(page)) === await abbrSaid(page, 'status.abbreviationRemoved', 'ub'), { table: await abbrList(page), status: await status(page) });
    check(`${tag} 7 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await openSettings(page, 'shortcuts');
    check(`${tag} 7 : les Réglages rouverts ne la montrent plus`, (await shownAbbr(page)).length === 0, await shownAbbr(page));
    await closeSettings(page);
    await key(page, 'Control+y');
    check(`${tag} 7 : Ctrl + Y la rend, sous le même numéro de ligne, le coin d'état la nomme`, JSON.stringify((await abbrRows(page)).map(r => [r.id, r.abbr, r.text])) === JSON.stringify([[ubRow, 'ub', 'université de Bordeaux']]) && (await status(page)) === await abbrSaid(page, 'status.abbreviationRestored', 'ub'), { rows: await abbrRows(page), status: await status(page) });
    // « Modifier » puis « Enregistrer » : le texte d'avant, puis celui d'après.
    await forget(page);
    await openSettings(page, 'shortcuts');
    await clickWhere(page, abbrButton, { abbr: 'ub', index: 0 });
    await sleep(250);
    check(`${tag} 7 : « Modifier » remplit le formulaire (« Enregistrer », « Annuler »)`, JSON.stringify(await formState(page)) === JSON.stringify({ abbr: 'ub', text: 'université de Bordeaux', submit: await page.evaluate(() => I18n.t('common.save')), cancelShown: true }), await formState(page));
    await clickWhere(page, () => document.getElementById('settings-expansion-text'));
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Bordeaux');
    await clickWhere(page, () => document.getElementById('settings-expansion-submit'));
    await sleep(600);
    check(`${tag} 7 : « Enregistrer » écrit le nouveau texte sur la même ligne`, JSON.stringify((await abbrRows(page)).map(r => [r.id, r.abbr, r.text])) === JSON.stringify([[ubRow, 'ub', 'Bordeaux']]), await abbrRows(page));
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 7 : Ctrl + Z rend le texte d'avant sur la même ligne, le coin d'état nomme l'abréviation`, JSON.stringify((await abbrRows(page)).map(r => [r.id, r.abbr, r.text])) === JSON.stringify([[ubRow, 'ub', 'université de Bordeaux']]) && (await status(page)) === await abbrSaid(page, 'status.abbreviationRestored', 'ub'), { rows: await abbrRows(page), status: await status(page) });
    await key(page, 'Control+y');
    check(`${tag} 7 : Ctrl + Y rend le texte d'après`, (await abbrList(page))[0] === 'ub=Bordeaux', await abbrList(page));
    // « Supprimer » et sa question : la ligne revient sous son numéro, puis repart.
    await forget(page);
    await openSettings(page, 'shortcuts');
    await clickWhere(page, abbrButton, { abbr: 'ub', index: 1 });
    await sleep(400);
    await click(page, '#pp-dialog-modal .var-modal-primary');
    await sleep(500);
    check(`${tag} 7 : « Supprimer » confirmé retire la ligne (table, liste de la fenêtre)`, (await abbrList(page)).length === 0 && (await shownAbbr(page)).length === 0, { table: await abbrList(page), shown: await shownAbbr(page) });
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 7 : Ctrl + Z rend la ligne sous son numéro, avec son texte`, JSON.stringify((await abbrRows(page)).map(r => [r.id, r.abbr, r.text])) === JSON.stringify([[ubRow, 'ub', 'Bordeaux']]) && (await status(page)) === await abbrSaid(page, 'status.abbreviationRestored', 'ub'), { rows: await abbrRows(page), status: await status(page) });
    await key(page, 'Control+y');
    check(`${tag} 7 : Ctrl + Y la supprime de nouveau`, (await abbrList(page)).length === 0 && (await status(page)) === await abbrSaid(page, 'status.abbreviationRemoved', 'ub'), { table: await abbrList(page), status: await status(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 7 : le bouton Annuler de la barre rend la ligne`, (await abbrList(page)).length === 1, await abbrList(page));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 7 : le bouton Rétablir de la barre la supprime de nouveau`, (await abbrList(page)).length === 0, await abbrList(page));
    // Le formulaire qui modifiait une ligne que Ctrl + Z a retirée repart à zéro.
    await forget(page);
    await openSettings(page, 'shortcuts');
    await clickWhere(page, () => document.getElementById('settings-expansion-abbr'));
    await page.keyboard.type('mel');
    await clickWhere(page, () => document.getElementById('settings-expansion-text'));
    await page.keyboard.type('bonjour');
    await clickWhere(page, () => document.getElementById('settings-expansion-submit'));
    await sleep(600);
    await clickWhere(page, abbrButton, { abbr: 'mel', index: 0 });
    await sleep(250);
    check(`${tag} 7 : le formulaire modifie « mel »`, (await formState(page)).submit === await page.evaluate(() => I18n.t('common.save')) && (await formState(page)).abbr === 'mel', await formState(page));
    await closeSettings(page);
    await key(page, 'Control+z');
    check(`${tag} 7 : Ctrl + Z retire « mel »`, (await abbrList(page)).length === 0, await abbrList(page));
    await openSettings(page, 'shortcuts');
    check(`${tag} 7 : les Réglages rouverts : le formulaire repart à zéro, la liste est vide`, JSON.stringify(await formState(page)) === JSON.stringify({ abbr: '', text: '', submit: await page.evaluate(() => I18n.t('settings.expansion.add')), cancelShown: false }) && (await shownAbbr(page)).length === 0, { form: await formState(page), shown: await shownAbbr(page) });
    await closeSettings(page);

    // --- 8) l'ordre avec le texte ---
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
    check(`${tag} 8 : le texte, le thème, le texte`, / RANG/.test(await text(page)) && / ORDRE/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+z');
    check(`${tag} 8 : 1er Ctrl + Z : le second texte seul`, !/ ORDRE/.test(await text(page)) && / RANG/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+z');
    check(`${tag} 8 : 2e Ctrl + Z : le thème seul`, / RANG/.test(await text(page)) && (await attr(page, 'data-theme')) === theme, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+z');
    check(`${tag} 8 : 3e Ctrl + Z : le premier texte`, !/ RANG/.test(await text(page)) && (await attr(page, 'data-theme')) === theme, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 8 : 2e Ctrl + Y : le premier texte et le thème`, / RANG/.test(await text(page)) && !/ ORDRE/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });
    await key(page, 'Control+y');
    check(`${tag} 8 : 3e Ctrl + Y : le second texte`, / ORDRE/.test(await text(page)) && (await attr(page, 'data-theme')) === other, { text: await text(page), attr: await attr(page, 'data-theme') });

    check(`${tag} 9 : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
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
