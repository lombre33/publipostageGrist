#!/usr/bin/env node
// Mode d'ouverture de la VUE (demande d'Antoine du 24/11 : « comment définir qu'un modèle par défaut d'une page s'ouvre en mode lecture et pas écriture ? », choix « un réglage par page ») :
// js/view-template.js porte une seconde option du widget, `ouvertureDeLaVue` (`read` | `edit`, absente = « le dernier mode choisi »), que js/main.js:startMode lit AVANT la préférence de la
// personne (`pp_last_mode`, dev-tests/verify-last-mode.mjs). Une fois la page prête il est trop tard pour rejouer le démarrage : chaque cas sème le faux Grist AVANT l'init (`spec.options`) et
// lit ce que voit la personne (bouton allumé, éditeur ou lecteur affiché), à 700x400, comme verify-last-mode.mjs ; le réglage, lui, se fait dans Réglages > Vue au vrai clic.
//   1) la vue dit Lecture : le modèle ★ s'ouvre en Lecture, même sans préférence de la personne, et rien n'est retenu à sa place (pp_last_mode reste absent) ;
//   2) la vue dit Lecture, la personne avait quitté en Édition : Lecture ; la vue dit Édition, la personne lisait : Édition ;
//   3) sans choix de la vue, ou avec une valeur qui n'en est pas un (`last`, texte quelconque, `null`) : la préférence de la personne, comme avant ;
//   4) rien ne s'ouvre de lui-même (pas de ★) : l'Édition, même si la vue dit Lecture ; un macro-modèle choisi pour la vue s'ouvre en Édition, même si la vue dit Lecture ;
//   5) Réglages > Vue (clair/français puis sombre/anglais) : la section entière dans le panneau, sans défilement horizontal ; la liste dit « Le dernier mode choisi » au départ ;
//      un choix écrit l'option du widget (et seulement elle : le modèle de la vue n'est pas touché), la phrase dessous le dit, Ctrl + Z le défait, Ctrl + Y le rend ; « Le dernier mode choisi » retire l'option ;
//      l'option écrite par ce choix fait ouvrir la page suivante en Lecture ;
//   6) le bouton Édition reste utilisable : un vrai clic sur « Mode édition » passe à l'Édition et retient « edit » (la préférence de la personne), la vue n'en est pas changée ;
//   7) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « viewOpenMode », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-view-open-mode.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.VIEW_OPEN_MODE_PORT || 9291);
const LAST = 'pp_last_mode';
const VIEW = 'ouvertureDeLaVue';
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
  page = await start(SPEC_MACRO);
  const macroId = await page.evaluate(() => { const found = Templates.getCached().find(t => t.typeModele === 'macro'); return found ? String(found.id) : null; });
  check('le faux document porte bien un macro-modèle', macroId !== null, macroId);
  page = await start(specWith(SPEC_MACRO, { modeleDeLaVue: macroId, [VIEW]: 'read' }));
  s = await state(page);
  const macroOpen = await page.evaluate(() => ({ type: typeof currentTypeModele !== 'undefined' ? currentTypeModele : null, id: String(Templates.getCurrentId()) }));
  check('un macro-modèle choisi pour la vue s\'ouvre bien', macroOpen.id === macroId, macroOpen);
  check('… en Édition, même si la vue dit Lecture', s.editActive && !s.readActive && !s.reader, s);

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
      option: (window.__gristStub.state.options || {}).ouvertureDeLaVue,
      template: (window.__gristStub.state.options || {}).modeleDeLaVue,
    };
  });
  let p = await panel();
  const inside = r => r.l >= p.modal.l && r.r <= p.modal.r && r.t >= p.modal.t && r.b <= p.modal.b && r.w > 60 && r.h >= 24;
  check('la section, sa liste et sa phrase tiennent dans la fenêtre 700x400, sans défilement horizontal', inside(p.select) && p.status.w > 60 && p.status.r <= p.modal.r && !p.hScroll, p);
  check('le titre de la section est « Mode d\'ouverture de cette vue »', p.title === 'Mode d’ouverture de cette vue', p.title);
  check('la liste propose le dernier mode, la Lecture et l\'Édition, et dit « Le dernier mode choisi » au départ', p.value === 'last' && p.options.join('|') === 'last=Le dernier mode choisi|read=Lecture|edit=Édition', p);
  check('la phrase dit que chaque personne retrouve son dernier mode', /dernier/.test(p.sentence) && !p.disabled && !p.lockedShown, p);
  await page.selectOption('#settings-viewopen-mode', 'read');
  await sleep(400);
  p = await panel();
  check('choisir Lecture écrit l\'option du widget (et pas celle du modèle de la vue)', p.option === 'read' && (p.template === undefined || p.template === null), p);
  check('la phrase dit que le modèle de la vue s\'ouvre en Lecture', /s’ouvre en Lecture/.test(p.sentence) && p.value === 'read', p.sentence);
  const written = await page.evaluate(() => JSON.parse(JSON.stringify(window.__gristStub.state.options)));
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
  let after = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).ouvertureDeLaVue, said: ViewTemplate.openMode(), status: document.getElementById('status-msg').textContent }));
  check('Ctrl + Z rend le choix d\'avant (« Le dernier mode choisi »), le coin d\'état le dit', (after.option === null || after.option === undefined) && after.said === null && /Mode d’ouverture de cette vue/.test(after.status) && /dernier mode/.test(after.status), after);
  await page.keyboard.press('Control+y');
  await sleep(700);
  after = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).ouvertureDeLaVue, said: ViewTemplate.openMode() }));
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
  const optionStill = await page.evaluate(() => (window.__gristStub.state.options || {}).ouvertureDeLaVue);
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
  check('en anglais sombre, tout tient dans la fenêtre 700x400 sans défilement horizontal', inside(p.select) && !p.hScroll, p);
  const colors = await page.evaluate(() => {
    const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const modal = getComputedStyle(document.querySelector('#settings-modal .modal-content')).backgroundColor;
    const text = id => ratio(getComputedStyle(document.getElementById(id)).color, modal);
    return { sentence: text('settings-viewopen-status') };
  });
  check('la phrase est lisible sur le fond sombre (4,5:1 au moins)', colors.sentence >= 4.5, colors);

  errors.push(...w.errors);
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
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
