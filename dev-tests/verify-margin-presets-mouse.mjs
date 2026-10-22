#!/usr/bin/env node
// Préréglages de marges et chaîne « Lier les quatre marges » de l'onglet Marges (js/settings.js) à la VRAIE souris et au vrai clavier, dans le panneau de 700x400 d'Antoine - sa demande du 22/10 :
// « onglet setting dans Marge, avoir des preset aucune, etroit, classique, large, et un bouton pour garder link les 4 si on en change un ». Ce que dev-tests/scenarios-margin-presets.js ne peut pas voir depuis la page :
//   1) la place : les quatre boutons sur une seule rangée, entiers, dans la fenêtre et dans l'écran, sans défilement de l'onglet ; la chaîne au centre des quatre champs (entre les colonnes, entre les rangées), sans
//      recouvrir ni être recouverte ; avec un modèle simple et avec un macro-modèle (sa mention en plus, dans les 376 px de la fenêtre) ;
//   2) la main : un vrai clic sur chaque préréglage pose ses quatre marges (champs, brouillon, mise en page de l'éditeur), un seul bouton est enfoncé et son aspect se voit ; la chaîne enfoncée, une vraie frappe dans
//      un champ s'applique aux quatre, relâchée elle ne change que le champ ; « Larges » relâche la chaîne ; l'état de la chaîne reste à la réouverture ; « Selon chaque modèle » d'un macro-modèle est gardé ;
//   3) le clavier : Tab parcourt préréglages, chaîne, puis Haut, Droite, Bas, Gauche (et Maj+Tab revient) ; Entrée et Espace activent ; l'anneau de focus se voit ;
//   4) les contrastes (F5) des états enfoncé et relâché, en clair et en sombre ; le français et l'anglais ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « marginPresetsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-margin-presets-mouse.mjs
// MARGIN_PRESETS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { open, stopServer, sleep, click, center } from './load-lib.mjs';

const PORT = Number(process.env.MARGIN_PRESETS_PORT || 9099);
const SHOTS = process.env.MARGIN_PRESETS_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Contrastes (WCAG) : même calcul que dev-tests/verify-macro-margins-note-mouse.mjs.
const rgbOf = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (fg, bg) => { const a = rgbOf(fg), b = rgbOf(bg); if (!a || !b) return 0; const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };

const IDS = ['none', 'narrow', 'classic', 'wide'];
const SIDES = ['top', 'right', 'bottom', 'left'];
const LABELS = { fr: ['Aucune', 'Étroites', 'Classiques', 'Larges'], en: ['None', 'Narrow', 'Classic', 'Wide'] };
const GROUP_NAME = { fr: 'Préréglages de marges', en: 'Margin presets' };
const LINK_NAME = { fr: 'Lier les quatre marges', en: 'Link all four margins' };
const LINK_TIP = { fr: 'Lier les quatre marges : en changer une change les trois autres', en: 'Link all four margins: changing one changes the other three' };
// Les nombres de Word, dans l'ordre Haut, Droite, Bas, Gauche (mm).
const WORD = { none: [0, 0, 0, 0], narrow: [12.7, 12.7, 12.7, 12.7], classic: [25.4, 25.4, 25.4, 25.4], wide: [25.4, 50.8, 25.4, 50.8] };
const same = (a, b, tolerance = 0.06) => a.length === b.length && a.every((v, at) => Math.abs(v - b[at]) <= tolerance);
const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const PRESET = id => '#settings-margin-preset-' + id;
const FIELD = side => '#settings-margin-' + side;
const LINK = '#settings-margins-link';

// Un macro-modèle composé comme par une personne (même chemin que dev-tests/verify-macro-margins-note-mouse.mjs) : sa mention s'ajoute au-dessus des préréglages.
async function loadMacro(page) {
  await page.evaluate(async () => {
    const cover = await Templates.save(null, 'Garde marges', '<p>Page de garde</p>', '', null, null, 'document', null);
    await Templates.save(null, 'Annexe marges', '<p>Autre page</p>', '', null, null, 'document', null);
    await Templates.loadAll();
    MacroEditor.openModal(null);
    document.getElementById('macro-editor-name').value = 'Macro marges';
    const select = document.getElementById('macro-editor-cover');
    select.value = String(cover.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('macro-editor-save').click();
  });
  await page.waitForFunction(() => { const s = document.getElementById('macro-summary-container'); return !!s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(600);
}

// Ce que la personne voit dans l'onglet Marges, mesuré dans la page.
const geometry = page => page.evaluate(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const panel = document.querySelector('.settings-panel[data-settings-panel="pageMargins"]');
  const box = document.querySelector('#settings-modal .pp-modal-box');
  const body = document.querySelector('#settings-modal .settings-body');
  const group = panel.querySelector('.settings-margins-presets');
  const grid = panel.querySelector('.settings-margins-grid');
  const note = document.getElementById('settings-margins-macro-note');
  const intro = panel.querySelector('.settings-panel-intro');
  return {
    view: { w: innerWidth, h: innerHeight },
    box: rect(box), body: rect(body), panel: rect(panel), group: rect(group), grid: rect(grid), intro: rect(intro),
    note: note.hidden ? null : rect(note),
    groupClipped: group.scrollWidth > group.clientWidth + 1,
    buttons: Array.from(group.querySelectorAll('button')).map(b => Object.assign(rect(b), { text: b.textContent.trim(), clipped: b.scrollWidth > b.clientWidth + 1, id: b.dataset.marginPreset })),
    link: rect(document.getElementById('settings-margins-link')),
    labels: Array.from(grid.querySelectorAll('label')).map(rect),
    inputs: ['top', 'right', 'bottom', 'left'].map(s => rect(document.getElementById('settings-margin-' + s))),
    scroll: { content: body.scrollHeight, shown: body.clientHeight, top: body.scrollTop, page: document.scrollingElement.scrollHeight - innerHeight },
  };
});

// L'état des marges tel que les voit la personne : champs, brouillon, marges de l'éditeur derrière la fenêtre, bouton enfoncé, chaîne.
const readState = page => page.evaluate(() => {
  const m = PageLayout.getMarginsMm();
  const pad = getComputedStyle(document.querySelector('.tiptap'));
  const mm = px => Math.round(parseFloat(px) / PageLayout.MM_TO_PX * 100) / 100;
  const buttons = Array.from(document.querySelectorAll('.settings-margins-presets button'));
  const link = document.getElementById('settings-margins-link');
  return {
    margins: [m.top, m.right, m.bottom, m.left].map(v => Math.round(v * 100) / 100),
    fields: ['top', 'right', 'bottom', 'left'].map(s => parseFloat(document.getElementById('settings-margin-' + s).value)),
    screen: [pad.paddingTop, pad.paddingRight, pad.paddingBottom, pad.paddingLeft].map(mm),
    pressed: buttons.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.marginPreset),
    marked: buttons.filter(b => b.classList.contains('active')).map(b => b.dataset.marginPreset),
    link: link.getAttribute('aria-pressed'), linkOn: link.classList.contains('is-on'),
    auto: PageLayout.isOrientationAuto(),
  };
});

// Les couleurs d'un bouton telles que les rend le navigateur : texte (ou trait de l'icône) et fond opaque.
const lookOf = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  const bgOf = e => {
    for (let x = e; x; x = x.parentElement) {
      const c = getComputedStyle(x).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.99)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const style = getComputedStyle(el);
  return { color: style.color, background: bgOf(el), outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), outlineColor: style.outlineColor };
}, sel);

// La souris quitte les boutons (sur l'introduction de l'onglet) : le survol ne fausse pas l'aspect au repos.
async function away(page) {
  const c = await center(page, '.settings-panel[data-settings-panel="pageMargins"] .settings-panel-intro');
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await sleep(150);
}

async function openMargins(page) {
  await click(page, '#v2-btn-settings');
  await sleep(500);
  await click(page, '.settings-tab[data-settings-tab="pageMargins"]');
  await sleep(400);
}
async function closeSettings(page) {
  await click(page, '#settings-close');
  await sleep(300);
}
async function typeInto(page, side, text) {
  await click(page, FIELD(side));
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await sleep(250);
}
const focusedId = page => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));

async function scenario(title, options, fn) {
  console.log('\n' + title);
  let w = null;
  try {
    w = await open(Object.assign({ spec: SPEC, port: PORT, settleMs: 1200 }, options));
    await fn(w);
    check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
  } catch (e) {
    check(title + ' : le scénario va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    if (w) await w.close();
  }
}

// La place des préréglages et de la chaîne, dans la langue et le thème donnés ; `where` dit où l'on est (modèle simple, macro-modèle).
async function layoutChecks(page, lang, where, withNote) {
  const g = await geometry(page);
  const inside = r => r.top >= g.box.top - 0.5 && r.bottom <= g.box.bottom + 0.5 && r.bottom <= g.view.h && r.left >= g.box.left - 0.5 && r.right <= g.box.right + 0.5 && r.right <= g.view.w;
  check(where + 'les quatre préréglages, dans l\'ordre, avec les mots de la langue', g.buttons.map(b => b.text).join('|') === LABELS[lang].join('|') && g.buttons.map(b => b.id).join('|') === IDS.join('|'), g.buttons.map(b => b.text));
  const names = await page.evaluate(() => ({ group: document.querySelector('.settings-margins-presets').getAttribute('aria-label'), link: document.getElementById('settings-margins-link').getAttribute('aria-label'), tip: document.getElementById('settings-margins-link').title, tips: Array.from(document.querySelectorAll('.settings-margins-presets button')).map(b => b.title) }));
  check(where + 'le groupe, la chaîne et son info-bulle ont leurs noms dans la langue', names.group === GROUP_NAME[lang] && names.link === LINK_NAME[lang] && names.tip === LINK_TIP[lang], names);
  check(where + 'chaque préréglage dit ses nombres dans son info-bulle', names.tips.every(tip => /mm/.test(tip)) && names.tips.every(tip => lang === 'fr' ? !/\d\.\d/.test(tip) : !/\d,\d/.test(tip)), names.tips);
  check(where + 'les préréglages tiennent sur une seule rangée, entiers (aucun mot coupé)', g.buttons.every(b => Math.abs(b.top - g.buttons[0].top) < 1 && !b.clipped) && !g.groupClipped, { rows: g.buttons.map(b => b.top), clipped: g.buttons.map(b => b.clipped) });
  check(where + 'les préréglages sont dans la fenêtre et dans l\'écran', g.buttons.every(inside) && inside(g.group), { group: g.group, box: g.box, view: g.view });
  check(where + 'les préréglages sont dans la largeur de l\'onglet', g.group.left >= g.panel.left - 0.5 && g.group.right <= g.panel.right + 0.5, { group: g.group, panel: g.panel });
  check(where + 'la chaîne et les quatre champs sont entiers à l\'écran', [g.link, ...g.inputs, ...g.labels].every(inside), { link: g.link, inputs: g.inputs, box: g.box });
  const left = Math.max(g.labels[0].right, g.labels[2].right), right = Math.min(g.labels[1].left, g.labels[3].left);
  const midY = (g.labels[0].top + g.labels[0].bottom + g.labels[2].top + g.labels[2].bottom) / 4;
  check(where + 'la chaîne est entre les deux colonnes et entre les deux rangées', g.link.left >= left - 0.5 && g.link.right <= right + 0.5 && Math.abs((g.link.top + g.link.bottom) / 2 - midY) <= 2, { link: g.link, left, right, midY });
  check(where + 'la chaîne a la taille d\'un petit bouton (26 px) : cible assez grande', Math.abs(g.link.w - 26) < 1 && Math.abs(g.link.h - 26) < 1, g.link);
  const things = [['préréglages', g.group], ['chaîne', g.link], ...g.labels.map((r, at) => ['étiquette ' + SIDES[at], r])];
  const clashes = [];
  for (let a = 0; a < things.length; a++) for (let b = a + 1; b < things.length; b++) if (overlap(things[a][1], things[b][1])) clashes.push(things[a][0] + ' / ' + things[b][0]);
  check(where + 'rien ne se recouvre (préréglages, chaîne, étiquettes et champs)', clashes.length === 0, clashes);
  check(where + 'les préréglages sont sous l\'introduction' + (withNote ? ' et sa mention' : '') + ' et au-dessus des champs', g.group.top >= (withNote && g.note ? g.note.bottom : g.intro.bottom) - 0.5 && g.group.bottom <= g.grid.top + 0.5, { intro: g.intro, note: g.note, group: g.group, grid: g.grid });
  check(where + 'l\'onglet ne défile pas : tout est à l\'écran sans molette', g.scroll.content <= g.scroll.shown + 1 && g.scroll.page <= 0, g.scroll);
  check(where + 'la fenêtre tient dans l\'écran', g.box.top >= 0 && g.box.bottom <= g.view.h, { box: g.box, view: g.view });
  return g;
}

// Un vrai clic sur chaque préréglage.
async function presetChecks(page, where, withEditor) {
  for (const id of IDS) {
    await click(page, PRESET(id));
    await sleep(300);
    const s = await readState(page);
    check(where + 'un clic sur « ' + id + ' » pose ses quatre marges', same(s.margins, WORD[id], 0.01), s.margins);
    check(where + '« ' + id + ' » : les quatre champs les montrent', same(s.fields, WORD[id]), s.fields);
    if (withEditor) check(where + '« ' + id + ' » : l\'éditeur derrière la fenêtre prend ces marges', same(s.screen, WORD[id], 0.2), s.screen);
    check(where + '« ' + id + ' » : lui seul est enfoncé (aria-pressed et aspect ensemble)', s.pressed.join() === id && s.marked.join() === id, { pressed: s.pressed, marked: s.marked });
  }
}

// Les états : enfoncé ou relâché, au repos et sous la souris, le texte et l'icône se lisent (F5).
async function contrastChecks(page, where) {
  await click(page, PRESET('classic'));
  await sleep(250);
  const onHover = await lookOf(page, PRESET('classic'));
  await away(page);
  const on = await lookOf(page, PRESET('classic')), off = await lookOf(page, PRESET('narrow'));
  await click(page, PRESET('narrow'));
  await sleep(250);
  const offHover = await lookOf(page, PRESET('narrow'));
  await click(page, PRESET('classic'));
  await away(page);
  check(where + 'préréglage enfoncé : texte lisible (>= 4,5:1)', ratio(on.color, on.background) >= 4.5, { ratio: ratio(on.color, on.background), on });
  check(where + 'préréglage enfoncé sous la souris : texte lisible (>= 4,5:1)', ratio(onHover.color, onHover.background) >= 4.5, { ratio: ratio(onHover.color, onHover.background), onHover });
  check(where + 'préréglage relâché : texte lisible (>= 4,5:1)', ratio(off.color, off.background) >= 4.5, { ratio: ratio(off.color, off.background), off });
  check(where + 'préréglage relâché sous la souris : texte lisible (>= 4,5:1)', ratio(offHover.color, offHover.background) >= 4.5, { ratio: ratio(offHover.color, offHover.background), offHover });
  check(where + 'l\'état enfoncé se voit : le fond n\'est pas celui des autres', on.background !== off.background, { on: on.background, off: off.background });
  const linkOff = await lookOf(page, LINK);
  await click(page, LINK);
  await sleep(250);
  const linkOnHover = await lookOf(page, LINK);
  await away(page);
  const linkOn = await lookOf(page, LINK);
  check(where + 'chaîne relâchée : l\'icône se lit (>= 4,5:1)', ratio(linkOff.color, linkOff.background) >= 4.5, { ratio: ratio(linkOff.color, linkOff.background), linkOff });
  check(where + 'chaîne enfoncée : l\'icône se lit (>= 4,5:1)', ratio(linkOn.color, linkOn.background) >= 4.5, { ratio: ratio(linkOn.color, linkOn.background), linkOn });
  check(where + 'chaîne enfoncée sous la souris : l\'icône se lit (>= 4,5:1)', ratio(linkOnHover.color, linkOnHover.background) >= 4.5, { ratio: ratio(linkOnHover.color, linkOnHover.background), linkOnHover });
  check(where + 'l\'état de la chaîne se voit : le fond change', linkOn.background !== linkOff.background, { on: linkOn.background, off: linkOff.background });
  await click(page, LINK);
  await sleep(250);
  await away(page);
}

// La chaîne, à la vraie souris et au vrai clavier.
async function linkChecks(page, where, withEditor) {
  await click(page, PRESET('classic'));
  await sleep(250);
  const before = await readState(page);
  await click(page, LINK);
  await sleep(250);
  const on = await readState(page);
  check(where + 'un clic sur la chaîne l\'enfonce sans changer aucune marge', on.link === 'true' && on.linkOn && same(on.margins, before.margins, 0.001) && on.pressed.join() === 'classic', on);
  await typeInto(page, 'right', '15');
  const typed = await readState(page);
  check(where + 'chaîne enfoncée : « 15 » saisi dans Droite devient la marge des quatre', same(typed.margins, [15, 15, 15, 15], 0.01) && same(typed.fields, [15, 15, 15, 15]), typed);
  if (withEditor) check(where + 'chaîne enfoncée : l\'éditeur prend les quatre marges', same(typed.screen, [15, 15, 15, 15], 0.2), typed.screen);
  check(where + 'quinze millimètres partout n\'est aucun préréglage : aucun bouton enfoncé', typed.pressed.length === 0 && typed.marked.length === 0, typed.pressed);
  await typeInto(page, 'bottom', '12.7');
  const narrow = await readState(page);
  check(where + 'chaîne enfoncée : 12,7 saisi dans Bas retrouve « Étroites »', same(narrow.margins, WORD.narrow, 0.01) && narrow.pressed.join() === 'narrow', narrow);
  await typeInto(page, 'left', '400');
  const big = await readState(page);
  check(where + 'chaîne enfoncée : une valeur démesurée est bornée par paire, les champs montrent ce qui est retenu', big.margins[1] === big.margins[3] && big.margins[0] === big.margins[2] && big.margins[1] < 400 && same(big.fields, big.margins, 0.06) && big.margins[1] + big.margins[3] < 210, big);
  await click(page, LINK);
  await sleep(250);
  await typeInto(page, 'top', '20');
  const alone = await readState(page);
  check(where + 'chaîne relâchée : la saisie ne change de nouveau que son champ', alone.link === 'false' && !alone.linkOn && alone.margins[0] === 20 && alone.margins[1] === big.margins[1] && alone.margins[2] === big.margins[2] && alone.margins[3] === big.margins[3], alone);
  await click(page, PRESET('none'));
  await sleep(250);
  await click(page, LINK);
  await sleep(250);
  await click(page, PRESET('wide'));
  await sleep(300);
  const wide = await readState(page);
  check(where + '« Larges » relâche la chaîne (quatre marges inégales) et pose ses marges', wide.link === 'false' && !wide.linkOn && same(wide.margins, WORD.wide, 0.01) && wide.pressed.join() === 'wide', wide);
  await click(page, LINK);
  await sleep(250);
  await click(page, PRESET('narrow'));
  await sleep(250);
  const kept = await readState(page);
  check(where + 'un préréglage de quatre marges égales garde la chaîne enfoncée', kept.link === 'true' && kept.linkOn && kept.pressed.join() === 'narrow', kept);
  // Fermer puis rouvrir Réglages : la chaîne garde son état, les marges sont celles d'avant.
  await closeSettings(page);
  await openMargins(page);
  const reopened = await readState(page);
  check(where + 'Réglages rouvert : la chaîne est toujours enfoncée, « Étroites » toujours enfoncé', reopened.link === 'true' && reopened.pressed.join() === 'narrow' && same(reopened.margins, WORD.narrow, 0.01), reopened);
  await click(page, LINK);
  await sleep(250);
  const released = await readState(page);
  check(where + 'un second clic sur la chaîne la relâche', released.link === 'false' && !released.linkOn, released);
}

// Tab, Maj+Tab, Entrée et Espace.
async function keyboardChecks(page, where) {
  await page.focus(PRESET('none'));
  const order = [await focusedId(page)];
  for (let step = 0; step < 8; step++) { await page.keyboard.press('Tab'); order.push(await focusedId(page)); }
  const expected = ['settings-margin-preset-none', 'settings-margin-preset-narrow', 'settings-margin-preset-classic', 'settings-margin-preset-wide', 'settings-margins-link', 'settings-margin-top', 'settings-margin-right', 'settings-margin-bottom', 'settings-margin-left'];
  check(where + 'Tab : les préréglages, la chaîne, puis Haut, Droite, Bas, Gauche', order.join() === expected.join(), order);
  const back = [];
  for (let step = 0; step < 5; step++) { await page.keyboard.press('Shift+Tab'); back.push(await focusedId(page)); }
  check(where + 'Maj+Tab revient dans l\'ordre inverse', back.join() === ['settings-margin-bottom', 'settings-margin-right', 'settings-margin-top', 'settings-margins-link', 'settings-margin-preset-wide'].join(), back);
  const ring = await lookOf(page, PRESET('wide'));
  check(where + 'un préréglage au clavier montre son anneau de focus', ring.outlineStyle !== 'none' && ring.outlineWidth >= 2, ring);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await sleep(300);
  const entered = await readState(page);
  check(where + 'Entrée sur « Classiques » le pose', same(entered.margins, WORD.classic, 0.01) && entered.pressed.join() === 'classic', entered);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await sleep(300);
  const spaced = await readState(page);
  check(where + 'Espace sur « Étroites » le pose', same(spaced.margins, WORD.narrow, 0.01) && spaced.pressed.join() === 'narrow', spaced);
  await page.focus(LINK);
  const linkRing = await lookOf(page, LINK);
  await page.keyboard.press('Space');
  await sleep(250);
  const spaceLink = await readState(page);
  check(where + 'Espace sur la chaîne l\'enfonce', spaceLink.link === 'true' && spaceLink.linkOn, spaceLink);
  check(where + 'la chaîne au clavier montre son anneau de focus', linkRing.outlineStyle !== 'none' && linkRing.outlineWidth >= 2, linkRing);
  await page.keyboard.press('Enter');
  await sleep(250);
  const enterLink = await readState(page);
  check(where + 'Entrée sur la chaîne la relâche', enterLink.link === 'false' && !enterLink.linkOn, enterLink);
}

// Un modèle simple, dans la langue et le thème donnés.
async function runSimple(w, lang, theme) {
  const page = w.page;
  const where = (theme === 'dark' ? 'sombre' : 'clair') + ', ' + (lang === 'en' ? 'anglais' : 'français') + ' : modèle simple : ';
  await openMargins(page);
  await layoutChecks(page, lang, where, false);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/simple-${theme}-${lang}.png` });
  await presetChecks(page, where, true);
  await linkChecks(page, where, true);
  await contrastChecks(page, where);
  await keyboardChecks(page, where);
  await click(page, PRESET('classic'));
  await sleep(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/simple-classic-${theme}-${lang}.png` });
  await closeSettings(page);
}

// Un macro-modèle (une page neuve : le modèle simple d'avant, modifié, ferait passer la question « Enregistrer / Abandonner » devant sa composition).
async function runMacro(w, lang, theme) {
  const page = w.page;
  const where = (theme === 'dark' ? 'sombre' : 'clair') + ', ' + (lang === 'en' ? 'anglais' : 'français') + ' : macro-modèle : ';
  await loadMacro(page);
  await openMargins(page);
  const g = await layoutChecks(page, lang, where, true);
  check(where + 'la mention est affichée au-dessus des préréglages', !!g.note && g.note.h > 0, g.note);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/macro-${theme}-${lang}.png` });
  await click(page, PRESET('wide'));
  await sleep(300);
  const macro = await readState(page);
  check(where + '« Larges » pose ses marges et garde « Selon chaque modèle »', same(macro.margins, WORD.wide, 0.01) && macro.pressed.join() === 'wide' && macro.auto === true, macro);
  await click(page, LINK);
  await sleep(250);
  await typeInto(page, 'top', '18');
  const linked = await readState(page);
  check(where + 'chaîne enfoncée, « 18 » devient la marge des quatre', same(linked.margins, [18, 18, 18, 18], 0.01) && linked.auto === true, linked);
  await click(page, LINK);
  await sleep(250);
  await click(page, PRESET('classic'));
  await sleep(250);
  const classic = await readState(page);
  check(where + '« Classiques » après la chaîne : ses marges, « Selon chaque modèle » gardé', same(classic.margins, WORD.classic, 0.01) && classic.pressed.join() === 'classic' && classic.auto === true, classic);
  await closeSettings(page);
}

await scenario('1. Clair, français, modèle simple', {}, w => runSimple(w, 'fr', 'light'));
await scenario('2. Clair, français, macro-modèle', {}, w => runMacro(w, 'fr', 'light'));
await scenario('3. Sombre, anglais, modèle simple', { theme: 'dark', lang: 'en' }, w => runSimple(w, 'en', 'dark'));
await scenario('4. Sombre, anglais, macro-modèle', { theme: 'dark', lang: 'en' }, w => runMacro(w, 'en', 'dark'));

await stopServer();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
