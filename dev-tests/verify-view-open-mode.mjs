#!/usr/bin/env node
// Mode d'ouverture de la VUE (demande d'Antoine du 24/11 : « comment définir qu'un modèle par défaut d'une page s'ouvre en mode lecture et pas écriture ? », choix « un réglage par page ») :
// js/view-template.js porte une seconde option du widget, `pp_view_open_mode` (`read` | `edit`, absente = « le dernier mode choisi »), que js/main.js:startMode lit AVANT la préférence de la
// personne (`pp_last_mode`, dev-tests/verify-last-mode.mjs). Une fois la page prête il est trop tard pour rejouer le démarrage : chaque cas sème le faux Grist AVANT l'init (`spec.options`) et
// lit ce que voit la personne (bouton allumé, éditeur ou lecteur affiché), à 700x400, comme verify-last-mode.mjs ; le réglage, lui, se fait dans Réglages > Vue au vrai clic.
//   1) la vue dit Lecture : le modèle ★ s'ouvre en Lecture, même sans préférence de la personne, et rien n'est retenu à sa place (pp_last_mode reste absent) ;
//   2) la vue dit Lecture, la personne avait quitté en Édition : Lecture ; la vue dit Édition, la personne lisait : Édition ;
//   3) sans choix de la vue, ou avec une valeur qui n'en est pas un (`last`, texte quelconque, `null`) : la préférence de la personne, comme avant ;
//   4) rien ne s'ouvre de lui-même (pas de ★) : l'Édition, même si la vue dit Lecture ;
//   4 bis) un macro-modèle suit la vue quand elle dit Lecture (consigne 110 de GFS, choix du porteur du 26/11 : « Lecture aussi pour les macro-modèles ») : il s'ouvre en Lecture (même si la personne avait quitté en Édition), la Lecture
//      montre le document ASSEMBLÉ pour la ligne choisie (jamais une page blanche, jamais son résumé) et un vrai clic sur « Mode édition » rend le résumé ; quand la vue dit Édition, n'a pas de choix ou dit « last » (même si la personne
//      lisait en dernier), il ouvre son résumé comme avant ;
//   5) Réglages > Vue (clair/français puis sombre/anglais) : la section entière dans le panneau, sans défilement horizontal ; la liste dit « Le dernier mode choisi » au départ ;
//      un choix écrit l'option du widget (et seulement elle : le modèle de la vue n'est pas touché), la phrase dessous le dit, Ctrl + Z le défait, Ctrl + Y le rend ; « Le dernier mode choisi » retire l'option ;
//      l'option écrite par ce choix fait ouvrir la page suivante en Lecture ;
//   6) le bouton Édition reste utilisable : un vrai clic sur « Mode édition » passe à l'Édition et retient « edit » (la préférence de la personne), la vue n'en est pas changée ;
//   7) GFS ne laisse écrire qu'une clé que son manifeste déclare (`GFS_CLE_NON_DECLAREE`) : la clé de l'option porte le préfixe `pp_` (la règle des clés nouvelles de GFS) et, quand l'hôte REFUSE l'écriture (le faux Grist le
//      joue : `state.refusedOptionKeys`), la phrase sous la liste dit en rouge que le choix n'est pas gardé (Grist Factory d'abord, un autre refus ensuite), en français puis en anglais, la liste garde le choix, rien n'est
//      écrit dans la vue, le rappel « Enregistrer » ne s'allume pas (il n'y a pas de brouillon), et un choix accepté ensuite efface la phrase ; un choix accepté allume le rappel comme avant ;
//   8) aucune erreur de page (hors le refus joué, que le code écrit dans la console).
// Lancé par run-headless.mjs (groupe Node « viewOpenMode », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-view-open-mode.mjs
import { open, stopServer, sleep, click, fire } from './load-lib.mjs';

const PORT = Number(process.env.VIEW_OPEN_MODE_PORT || 9291);
const LAST = 'pp_last_mode';
const VIEW = 'pp_view_open_mode';
// Les refus joués ci-dessous : le code les écrit dans la console (console.error), ce n'est pas une erreur de la page.
const EXPECTED = /\[ViewTemplate\] enregistrement de l.option du mode d.ouverture impossible/;
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const TABLE = { id: 'VoClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] };
const SPEC_STAR = { tables: [TABLE], models: { count: 1, paragraphs: 2, table: 'VoClients', columns: ['Nom'], firstIsDefault: true } };
const SPEC_NO_STAR = { tables: [TABLE], models: { count: 1, paragraphs: 2, table: 'VoClients', columns: ['Nom'] } };
const SPEC_MACRO = { tables: [TABLE], models: { count: 1, paragraphs: 2, table: 'VoClients', columns: ['Nom'], firstIsDefault: true, macro: { slots: 1, rules: 1, column: 'Nom' } } };
const specWith = (base, options) => Object.assign({}, base, options === undefined ? {} : { options });
const lastModeIs = value => p => p.addInitScript(([key, v]) => { try { localStorage.setItem(key, v); } catch (e) { /* stockage refusé */ } }, [LAST, value]);

const state = page => page.evaluate(key => {
  const shown = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; };
  let stored = null;
  try { stored = localStorage.getItem(key); } catch (e) { stored = 'illisible'; }
  return {
    readActive: document.getElementById('btn-mode-read').classList.contains('active'),
    editActive: document.getElementById('btn-mode-edit').classList.contains('active'),
    reader: shown('reader-container'),
    editor: shown('editor-container'),
    stored,
  };
}, LAST);
const isEdit = s => s.editActive && !s.readActive && !s.reader;
const isRead = s => s.readActive && !s.editActive && s.reader && !s.editor;

let w = null;
const errors = [];
async function start(spec, { storage = null, lang = 'fr', theme = 'light' } = {}) {
  if (w) { errors.push(...w.errors); await w.close(); }
  w = await open({ spec, port: PORT, settleMs: 1500, theme, lang, onPage: storage ? storage : null });
  return w.page;
}

try {
  console.log('\n[1] La vue dit Lecture, la personne n\'a rien choisi');
  let page = await start(specWith(SPEC_STAR, { [VIEW]: 'read' }));
  let s = await state(page);
  check('le modèle ★ s\'ouvre en Lecture (bouton allumé, lecteur affiché, éditeur caché)', isRead(s), s);
  check('la préférence de la personne n\'est pas écrite à sa place', s.stored === null, s);
  const rendered = await page.evaluate(() => (document.getElementById('reader-container').textContent || '').trim().length);
  check('la Lecture montre bien le modèle (le lecteur n\'est pas vide)', rendered > 0, rendered);

  console.log('\n[2] La vue passe avant la préférence de la personne');
  page = await start(specWith(SPEC_STAR, { [VIEW]: 'read' }), { storage: lastModeIs('edit') });
  s = await state(page);
  check('la vue dit Lecture, la personne avait quitté en Édition : Lecture', isRead(s) && s.stored === 'edit', s);
  page = await start(specWith(SPEC_STAR, { [VIEW]: 'edit' }), { storage: lastModeIs('read') });
  s = await state(page);
  check('la vue dit Édition, la personne lisait : Édition', isEdit(s) && s.editor && s.stored === 'read', s);

  console.log('\n[3] Sans choix de la vue : la préférence de la personne, comme avant');
  page = await start(specWith(SPEC_STAR), { storage: lastModeIs('read') });
  s = await state(page);
  check('aucune option : la Lecture retenue par la personne s\'ouvre', isRead(s), s);
  for (const [label, value] of [['« last »', 'last'], ['un texte quelconque', 'lecture ??'], ['null', null]]) {
    page = await start(specWith(SPEC_STAR, { [VIEW]: value }), { storage: lastModeIs('read') });
    s = await state(page);
    check('une option à ' + label + ' n\'est pas un choix : la préférence de la personne (Lecture)', isRead(s), s);
  }
  page = await start(specWith(SPEC_STAR, { [VIEW]: 'last' }));
  s = await state(page);
  check('« last » sans préférence : l\'Édition, comme avant', isEdit(s) && s.editor, s);

  console.log('\n[4] Ce qui demande l\'éditeur reste en Édition');
  page = await start(specWith(SPEC_NO_STAR, { [VIEW]: 'read' }));
  s = await state(page);
  check('aucun modèle ne s\'ouvre de lui-même (pas de ★) : l\'Édition, même si la vue dit Lecture', isEdit(s) && s.editor, s);

  console.log('\n[4 bis] Un macro-modèle suit la vue quand elle dit Lecture (consigne 110 de GFS)');
  page = await start(SPEC_MACRO);
  const macroId = await page.evaluate(() => { const found = Templates.getCached().find(t => t.typeModele === 'macro'); return found ? String(found.id) : null; });
  check('le faux document porte bien un macro-modèle', macroId !== null, macroId);
  const macroView = page => page.evaluate(() => {
    const shown = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; };
    const sheet = document.querySelector('#reader-container .reader-content');
    return { id: String(Templates.getCurrentId()), summary: shown('macro-summary-container'), sheetText: sheet ? (sheet.innerText || '').trim() : null };
  });
  // Le résumé d'un macro-modèle (sa composition) : l'écran d'Édition d'un macro-modèle, à la place de l'éditeur.
  const isMacroEdit = (st, m) => isEdit(st) && !st.editor && m.summary;
  page = await start(specWith(SPEC_MACRO, { modeleDeLaVue: macroId, [VIEW]: 'read' }), { storage: lastModeIs('edit') });
  await fire(page, 'VoClients', 1);
  await sleep(900);
  s = await state(page);
  let m = await macroView(page);
  check('un macro-modèle choisi pour la vue s\'ouvre bien', m.id === macroId, m);
  check('la vue dit Lecture : il s\'ouvre en Lecture, même si la personne avait quitté en Édition (bouton allumé, lecteur affiché, éditeur et résumé cachés)', isRead(s) && !m.summary, { s, m });
  check('la préférence de la personne (Édition) n\'est pas écrasée', s.stored === 'edit', s);
  check('la Lecture montre le document ASSEMBLÉ pour la ligne choisie (le modèle de son premier emplacement, ses champs remplis), pas une page blanche', !!m.sheetText && /Paragraphe 1 du modèle 1/.test(m.sheetText) && !/\{\{|VoClients\.Nom\}/.test(m.sheetText), m);
  await click(page, '#btn-mode-edit');
  await sleep(900);
  s = await state(page);
  m = await macroView(page);
  check('un vrai clic sur « Mode édition » rend le résumé du macro-modèle (la personne garde le bouton)', isMacroEdit(s, m), { s, m });
  await click(page, '#btn-mode-read');
  await sleep(900);
  s = await state(page);
  m = await macroView(page);
  check('« Mode lecture » le relit : le document assemblé, toujours pour la même ligne', isRead(s) && /Paragraphe 1 du modèle 1/.test(m.sheetText || ''), { s, m });
  for (const [label, options, storage] of [
    ['la vue dit Édition, la personne lisait en dernier', { modeleDeLaVue: macroId, [VIEW]: 'edit' }, lastModeIs('read')],
    ['la vue n\'a pas de choix, la personne lisait en dernier (comme avant : jamais la dernière préférence)', { modeleDeLaVue: macroId }, lastModeIs('read')],
    ['l\'option de la vue vaut « last » (ce n\'est pas un choix), la personne lisait en dernier', { modeleDeLaVue: macroId, [VIEW]: 'last' }, lastModeIs('read')],
    ['la vue n\'a pas de choix et la personne n\'a rien choisi', { modeleDeLaVue: macroId }, null],
  ]) {
    page = await start(specWith(SPEC_MACRO, options), storage ? { storage } : {});
    s = await state(page);
    m = await macroView(page);
    check('le macro-modèle ouvre son résumé en Édition : ' + label, m.id === macroId && isMacroEdit(s, m), { s, m });
  }
  page = await start(specWith(SPEC_MACRO, { modeleDeLaVue: macroId, [VIEW]: 'read' }));
  s = await state(page);
  m = await macroView(page);
  check('sans ligne choisie (le faux Grist n\'en envoie pas au départ), la vue dit Lecture : la Lecture s\'ouvre quand même, sans erreur', isRead(s) && m.id === macroId, { s, m });

  console.log('\n[5] Réglages > Vue, au vrai clic : français clair');
  page = await start(specWith(SPEC_STAR));
  await click(page, '#v2-btn-settings');
  await sleep(500);
  await click(page, '.settings-tab[data-settings-tab="rowTemplate"]');
  await sleep(300);
  await page.evaluate(() => document.getElementById('settings-viewopen-section').scrollIntoView({ block: 'end' }));
  await sleep(250);
  const panel = () => page.evaluate(() => {
    const modal = document.querySelector('#settings-modal .modal-content').getBoundingClientRect();
    const body = document.querySelector('#settings-modal .settings-body');
    const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const select = document.getElementById('settings-viewopen-mode');
    return {
      modal: { l: modal.left, r: modal.right, t: modal.top, b: modal.bottom },
      hScroll: body.scrollWidth > body.clientWidth + 1,
      select: rect('settings-viewopen-mode'), status: rect('settings-viewopen-status'),
      value: select.value, disabled: select.disabled,
      options: Array.from(select.options).map(o => o.value + '=' + o.textContent),
      sentence: document.getElementById('settings-viewopen-status').textContent,
      title: document.getElementById('settings-viewopen-section').querySelector('.settings-section-title').textContent,
      lockedShown: !document.getElementById('settings-viewopen-locked').hidden,
      option: (window.__gristStub.state.options || {}).pp_view_open_mode,
      template: (window.__gristStub.state.options || {}).modeleDeLaVue,
    };
  });
  let p = await panel();
  const inside = r => r.l >= p.modal.l && r.r <= p.modal.r && r.t >= p.modal.t && r.b <= p.modal.b && r.w > 60 && r.h >= 24;
  check('la section, sa liste et sa phrase tiennent dans la fenêtre 700x400, sans défilement horizontal', inside(p.select) && p.status.w > 60 && p.status.r <= p.modal.r && !p.hScroll, p);
  check('le titre de la section est « Mode d\'ouverture de cette vue »', p.title === 'Mode d’ouverture de cette vue', p.title);
  check('la liste propose le dernier mode, la Lecture et l\'Édition, et dit « Le dernier mode choisi » au départ', p.value === 'last' && p.options.join('|') === 'last=Le dernier mode choisi|read=Lecture|edit=Édition', p);
  check('la phrase dit que chaque personne retrouve son dernier mode', /dernier/.test(p.sentence) && !p.disabled && !p.lockedShown, p);
  const hintOf = () => page.evaluate(() => (document.querySelector('#settings-viewopen-section .settings-access-hint') || {}).textContent || '');
  let hint = await hintOf();
  check('le petit texte sous la liste ne dit plus qu\'un macro-modèle s\'ouvre toujours en Édition : il dit qu\'il suit ce choix, et s\'ouvre en Édition quand la vue n\'en a pas (consigne 110)', !/macro-modèle s’ouvrent toujours/.test(hint) && /Un modèle vierge et un fichier importé s’ouvrent toujours en Édition/.test(hint) && /un macro-modèle suit ce choix, et s’ouvre en Édition quand la vue n’en a pas/.test(hint), hint);
  await page.selectOption('#settings-viewopen-mode', 'read');
  await sleep(400);
  p = await panel();
  check('choisir Lecture écrit l\'option du widget (et pas celle du modèle de la vue)', p.option === 'read' && (p.template === undefined || p.template === null), p);
  check('la phrase dit que le modèle de la vue s\'ouvre en Lecture', /s’ouvre en Lecture/.test(p.sentence) && p.value === 'read', p.sentence);
  const written = await page.evaluate(() => JSON.parse(JSON.stringify(window.__gristStub.state.options)));
  const reminder = await page.evaluate(() => { const box = document.getElementById('settings-save-reminder'); return { hidden: box.hidden, text: box.textContent.trim() }; });
  check('un choix accepté allume le rappel « Enregistrer » comme avant (brouillon de Grist)', reminder.hidden === false && /Enregistrer/.test(reminder.text), reminder);
  check('la clé de l\'option porte le préfixe pp_ (GFS ne déclare que des clés pp_* pour les réglages nouveaux)', Object.keys(written).includes('pp_view_open_mode') && /^pp_[a-z0-9_]+$/.test(VIEW), Object.keys(written));
  const sentenceClass = await page.evaluate(() => document.getElementById('settings-viewopen-status').classList.contains('is-problem'));
  check('la phrase d\'un choix accepté n\'est pas en rouge', sentenceClass === false, sentenceClass);
  await page.selectOption('#settings-viewopen-mode', 'edit');
  await sleep(400);
  p = await panel();
  check('choisir Édition l\'écrit de même, la phrase suit', p.option === 'edit' && /s’ouvre en Édition/.test(p.sentence), p);
  await page.selectOption('#settings-viewopen-mode', 'last');
  await sleep(400);
  p = await panel();
  check('« Le dernier mode choisi » retire l\'option du widget', (p.option === null || p.option === undefined) && p.value === 'last', p);
  // Ctrl + Z, Réglages refermés (le clavier de l'éditeur ne défait rien sous une fenêtre ouverte).
  await page.selectOption('#settings-viewopen-mode', 'read');
  await sleep(400);
  await click(page, '#settings-close');
  await sleep(500);
  await click(page, '.ProseMirror');
  await sleep(200);
  await page.keyboard.press('Control+z');
  await sleep(700);
  let after = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).pp_view_open_mode, said: ViewTemplate.openMode(), status: document.getElementById('status-msg').textContent }));
  check('Ctrl + Z rend le choix d\'avant (« Le dernier mode choisi »), le coin d\'état le dit', (after.option === null || after.option === undefined) && after.said === null && /Mode d’ouverture de cette vue/.test(after.status) && /dernier mode/.test(after.status), after);
  await page.keyboard.press('Control+y');
  await sleep(700);
  after = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).pp_view_open_mode, said: ViewTemplate.openMode() }));
  check('Ctrl + Y le rend (Lecture)', after.option === 'read' && after.said === 'read', after);

  console.log('\n[5 bis] L\'option écrite par ce choix fait ouvrir la page suivante en Lecture');
  page = await start(specWith(SPEC_STAR, written));
  s = await state(page);
  check('rouverte avec l\'option écrite (Lecture), la page s\'ouvre en Lecture', isRead(s), { written, s });

  console.log('\n[6] Le bouton Édition reste utilisable');
  await click(page, '#btn-mode-edit');
  await sleep(900);
  s = await state(page);
  check('un vrai clic sur « Mode édition » passe à l\'Édition', isEdit(s) && s.editor, s);
  await page.evaluate(() => { try { PersonStore.get('pp_last_mode'); } catch (e) { /* rien */ } });
  await sleep(300);
  const optionStill = await page.evaluate(() => (window.__gristStub.state.options || {}).pp_view_open_mode);
  check('l\'option de la vue n\'est pas changée par ce clic', optionStill === 'read', optionStill);
  await page.keyboard.press('Alt+l');
  await sleep(900);
  s = await state(page);
  check('Alt+L repasse en Lecture', isRead(s), s);

  console.log('\n[7] Anglais sombre');
  page = await start(specWith(SPEC_STAR, { [VIEW]: 'edit' }), { lang: 'en', theme: 'dark' });
  s = await state(page);
  check('la vue dit Édition : le modèle ★ s\'ouvre en Édition', isEdit(s) && s.editor, s);
  await click(page, '#v2-btn-settings');
  await sleep(500);
  await click(page, '.settings-tab[data-settings-tab="rowTemplate"]');
  await sleep(300);
  await page.evaluate(() => document.getElementById('settings-viewopen-section').scrollIntoView({ block: 'end' }));
  await sleep(250);
  p = await panel();
  check('le titre, la liste et la phrase sont en anglais', p.title === 'Opening mode of this view' && p.options.join('|') === 'last=The last mode chosen|read=Read|edit=Edit' && p.value === 'edit' && /opens in Edit mode/.test(p.sentence), p);
  hint = await hintOf();
  check('le petit texte sous la liste est en anglais et dit qu\'un macro-template suit ce choix (et ne dit plus qu\'il s\'ouvre toujours en Édition)', !/macro-template always open/.test(hint) && /A blank template and an imported file always open in Edit mode; a macro-template follows this choice, and opens in Edit mode when the view has none\./.test(hint), hint);
  check('en anglais sombre, tout tient dans la fenêtre 700x400 sans défilement horizontal', inside(p.select) && !p.hScroll, p);
  const colors = await page.evaluate(() => {
    const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const modal = getComputedStyle(document.querySelector('#settings-modal .modal-content')).backgroundColor;
    const text = id => ratio(getComputedStyle(document.getElementById(id)).color, modal);
    return { sentence: text('settings-viewopen-status') };
  });
  check('la phrase est lisible sur le fond sombre (4,5:1 au moins)', colors.sentence >= 4.5, colors);

  console.log('\n[8] Grist Factory refuse l\'écriture : le choix n\'est pas gardé, et l\'écran le dit');
  for (const [lang, theme, code, wanted, labelOf] of [
    ['fr', 'light', 'GFS_CLE_NON_DECLAREE', /Ce choix n’est pas gardé : Grist Factory ne connaît pas encore ce réglage de la vue\. La vue s’ouvrira comme avant\./, 'français clair, clé non déclarée'],
    ['en', 'dark', 'GFS_CLE_NON_DECLAREE', /This choice is not kept: Grist Factory does not know this view setting yet\. The view will open as before\./, 'anglais sombre, clé non déclarée'],
    ['fr', 'light', 'GRIST_REFUSE', /Ce choix n’est pas gardé : Grist a refusé de l’écrire dans la vue\. La vue s’ouvrira comme avant\./, 'français clair, un autre refus'],
  ]) {
    page = await start(specWith(SPEC_STAR), { lang, theme });
    await page.evaluate(refusal => { window.__gristStub.state.refusedOptionKeys = { pp_view_open_mode: refusal }; }, code);
    await click(page, '#v2-btn-settings');
    await sleep(500);
    await click(page, '.settings-tab[data-settings-tab="rowTemplate"]');
    await sleep(300);
    await page.evaluate(() => document.getElementById('settings-viewopen-section').scrollIntoView({ block: 'end' }));
    await sleep(250);
    await page.selectOption('#settings-viewopen-mode', 'read');
    await sleep(500);
    const refused = await page.evaluate(() => {
      const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const status = document.getElementById('settings-viewopen-status');
      const modalContent = document.querySelector('#settings-modal .modal-content');
      const box = document.getElementById('settings-save-reminder');
      const r = status.getBoundingClientRect();
      const body = document.querySelector('#settings-modal .settings-body');
      return {
        sentence: status.textContent, problem: status.classList.contains('is-problem'),
        contrast: ratio(getComputedStyle(status).color, getComputedStyle(modalContent).backgroundColor),
        value: document.getElementById('settings-viewopen-mode').value,
        option: (window.__gristStub.state.options || {}).pp_view_open_mode,
        reminderHidden: box.hidden, reminderText: box.textContent.trim(),
        fits: r.left >= 0 && r.right <= window.innerWidth && body.scrollWidth <= body.clientWidth + 1,
        local: ViewTemplate.openMode(),
      };
    });
    check(labelOf + ' : la phrase dit que le choix n\'est pas gardé', wanted.test(refused.sentence), refused.sentence);
    check(labelOf + ' : la phrase est en rouge (is-problem), lisible (4,5:1 au moins) et tient dans la fenêtre', refused.problem && refused.contrast >= 4.5 && refused.fits, refused);
    check(labelOf + ' : la liste garde le choix et rien n\'est écrit dans la vue', refused.value === 'read' && refused.local === 'read' && (refused.option === null || refused.option === undefined), refused);
    check(labelOf + ' : le rappel « Enregistrer » ne s\'allume pas (il n\'y a pas de brouillon dans Grist)', refused.reminderHidden === true && refused.reminderText === '', refused);
  }
  // Le refus levé : un choix accepté efface la phrase et se garde.
  await page.evaluate(() => { window.__gristStub.state.refusedOptionKeys = {}; });
  await page.selectOption('#settings-viewopen-mode', 'edit');
  await sleep(500);
  const healed = await page.evaluate(() => ({ sentence: document.getElementById('settings-viewopen-status').textContent, problem: document.getElementById('settings-viewopen-status').classList.contains('is-problem'), option: (window.__gristStub.state.options || {}).pp_view_open_mode }));
  check('un choix accepté ensuite efface la phrase de refus et s\'écrit dans la vue', healed.option === 'edit' && healed.problem === false && /s’ouvre en Édition/.test(healed.sentence), healed);

  errors.push(...w.errors);
  const unexpected = errors.filter(line => !EXPECTED.test(line));
  check('aucune erreur de page', unexpected.length === 0, unexpected.slice(0, 3));
} catch (e) {
  failed++;
  total++;
  console.log('  FAIL - exception : ' + (e && e.stack || e));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failed) + '/' + total + ' passés');
process.exit(failed ? 1 : 0);
