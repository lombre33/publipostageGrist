#!/usr/bin/env node
// La condition de CHAQUE document d'un macro-modèle (js/macro-editor.js, js/macro-templates.js) à la VRAIE souris et au vrai clavier, dans le panneau de 700x400 d'Antoine - sa demande du 24/11 : « pour un macro
// modèle, ne plus avoir le fonctionnement par page de garde, mais pouvoir mettre des conditions sur chaque document ». Ce que dev-tests/scenarios-macro-modeles.js ne peut pas voir depuis la page :
//   1) la fenêtre de composition, ouverte sur un macro-modèle neuf : un seul document (« Document 1 »), pas de page de garde à part, les deux boutons d'ajout lisibles, tout dans la fenêtre sans défilement de côté ;
//   2) « Inclure ce document » : « Toujours » à côté du modèle ; un vrai clic sur la liste et « Seulement si… » ouvre les règles sous le modèle, l'indication « toujours inclus » tant que la règle est incomplète
//      (lisible, 4,5:1 au moins), la colonne, l'opérateur et la valeur se règlent à la souris et au clavier, « + Ajouter une condition » et « + Groupe » restent atteignables dans le panneau ;
//   3) chaque contrôle de la carte est au-dessus de ce qui l'entoure (rien ne le recouvre) une fois amené dans la vue, la fenêtre défile au lieu de déborder ;
//   4) enregistré, le résumé dit « Seulement si : … » sous le modèle sous condition, la phrase compte les documents ; la Lecture, ligne après ligne (vraie sélection de ligne) : le document sous condition n'apparaît que
//      pour la ligne qui la remplit, le document sans condition est partout ; la fenêtre rouverte montre la condition réglée ;
//   5) un macro-modèle d'AVANT (page de garde + annexe choisie selon la ligne) s'ouvre en « Document 1 / Document 2 », sans condition, et la Lecture est celle d'avant ;
//   6) UNE SEULE CARTE (retour d'Antoine du 24/11 : « pourquoi ce n'est pas harmonisé entre le premier et les autres ? ») : le document choisi selon la ligne a, comme le premier, « Modèle » (qui dit « Choisi selon la ligne »)
//      puis « Inclure ce document » ; ses règles se déroulent dessous, atteignables ; « Seulement si… » y règle une condition à la souris ; un modèle choisi dans la liste le refait document à un seul modèle ;
//   7) la fenêtre étroite de la capture d'Antoine (450 px de large, 740 de haut) : mêmes cartes, rien qui déborde de côté ni ne recouvre un contrôle ;
//   8) le thème sombre et l'anglais (mêmes mesures) ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « macroDocConditionMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-macro-doc-condition-mouse.mjs
// MACRO_DOC_CONDITION_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { open, stopServer, sleep, click, fire, mode, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.MACRO_DOC_CONDITION_PORT || 9026);
const SHOTS = process.env.MACRO_DOC_CONDITION_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbDossiers', rows: 3, columns: [{ id: 'Nom', type: 'Text' }, { id: 'Statut', type: 'Text' }, { id: 'Montant', type: 'Numeric' }] }] };
const ROWS = [
  { id: 1, Nom: 'Alma', Statut: 'Urgent', Montant: 500 },
  { id: 2, Nom: 'Basile', Statut: 'Normal', Montant: 20 },
  { id: 3, Nom: 'Cyrus', Statut: 'Urgent', Montant: 5 },
];

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

const TEXTS = {
  fr: { model: 'Modèle', include: 'Inclure ce document', byRowChoice: 'Choisi selon la ligne', doc1: 'Document 1', doc2: 'Document 2', always: 'Toujours', onlyIf: 'Seulement si…', addDoc: '+ Ajouter un document', addByRow: '+ Ajouter un document choisi selon la ligne', hint: 'Aucune condition complète pour l’instant : ce document sera toujours inclus. Choisissez une colonne.', summaryNote: 'Seulement si : Statut = Urgent', sentence: '2 documents, dont 1 sous condition.', tag: 'choisi selon la ligne' },
  en: { model: 'Template', include: 'Include this document', byRowChoice: 'Chosen by the row', doc1: 'Document 1', doc2: 'Document 2', always: 'Always', onlyIf: 'Only if…', addDoc: '+ Add a document', addByRow: '+ Add a document chosen by the row', hint: 'No complete condition yet: this document will always be included. Choose a column.', summaryNote: 'Only if: Statut = Urgent', sentence: '2 documents, 1 of them conditional.', tag: 'chosen by the row' },
};

const shotOf = (page, tag) => async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png` }); };

// La fenêtre telle que la personne la voit : où est chaque contrôle, est-il au-dessus de ce qui l'entoure, la fenêtre déborde-t-elle de côté.
const windowState = page => page.evaluate(() => {
  const modal = document.getElementById('macro-editor-modal');
  const body = modal.querySelector('.pp-modal-body');
  const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const inView = el => { const r = el.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.width > 0 && r.height > 0; };
  const cards = Array.from(document.querySelectorAll('#macro-editor-slots .macro-slot-card')).map(card => ({
    kind: card.dataset.kind, title: card.querySelector('.macro-slot-title').textContent,
    tag: (card.querySelector('.macro-slot-kind') || {}).textContent || null,
    when: card.querySelector('select.macro-doc-when') ? card.querySelector('select.macro-doc-when').value : null,
    labels: Array.from(card.querySelectorAll('.macro-doc-row .macro-doc-label')).map(l => l.textContent),
    modelShown: (() => { const trigger = card.querySelector('.macro-doc-model + .ss-wrap .ss-trigger'); const sel = card.querySelector('select.macro-doc-model'); return ((trigger && trigger.textContent) || (sel && sel.selectedOptions[0] && sel.selectedOptions[0].textContent) || '').trim(); })(),
    byRowBody: card.querySelector('.macro-by-row') ? !card.querySelector('.macro-by-row').hidden : false,
    whenLabel: card.querySelector('select.macro-doc-when') ? card.querySelector('select.macro-doc-when').selectedOptions[0].textContent : null,
    conditionShown: card.querySelector('.macro-doc-condition') ? !card.querySelector('.macro-doc-condition').hidden : null,
    hintShown: card.querySelector('.macro-doc-hint') ? !card.querySelector('.macro-doc-hint').hidden : null,
    hintText: card.querySelector('.macro-doc-hint') ? card.querySelector('.macro-doc-hint').textContent : null,
    rules: card.querySelectorAll('.macro-doc-rules .macro-rule-row').length,
    rowRules: card.querySelectorAll('.macro-slot-rules .macro-rule-row').length,
  }));
  return {
    view: { w: innerWidth, h: innerHeight },
    modal: box(modal), body: { box: box(body), scrollsSideways: body.scrollWidth > body.clientWidth + 1, scrolls: body.scrollHeight > body.clientHeight + 1 },
    cards,
    add: [document.getElementById('macro-editor-add-document').textContent, document.getElementById('macro-editor-add-slot').textContent],
    addInView: [document.getElementById('macro-editor-add-document'), document.getElementById('macro-editor-add-slot')].map(inView),
    header: modal.querySelector('.macro-editor-slots-header').textContent,
    coverList: !!document.getElementById('macro-editor-cover'),
  };
});

// Amène un contrôle dans la vue (la fenêtre défile, comme le ferait la personne) et dit s'il est atteignable à la souris : rien ne le recouvre, il tient dans la fenêtre.
const reachable = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { found: true, onTop: !!hit && (hit === el || el.contains(hit) || (hit.closest && hit.closest('label') && hit.closest('label').contains(el))), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, w: r.width, h: r.height };
}, selector);

const paintOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  const bgOf = node => {
    for (let e = node; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.99)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const style = getComputedStyle(el);
  return { color: style.color, bg: bgOf(el), size: style.fontSize };
}, selector);

const readingText = page => page.evaluate(() => document.getElementById('reader-container').textContent || '');
const summaryOf = page => page.evaluate(() => ({
  sentence: (document.getElementById('macro-summary-text') || {}).textContent || '',
  notes: Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-condition')).map(n => n.textContent),
  parts: Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-part-label')).map(n => n.textContent),
}));

// Choisit une valeur dans une liste native (la liste s'ouvre à la souris : Playwright pose la valeur et envoie les mêmes évènements qu'un choix de la personne).
async function choose(page, selector, value) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.selectOption(selector, value);
  await sleep(120);
}

// Choisit une ligne dans une liste avec recherche (SearchSelect) à la VRAIE souris : un clic sur le champ, un clic sur la ligne.
async function pickFromField(page, selectSelector, text) {
  const trigger = selectSelector + ' + .ss-wrap .ss-trigger';
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), trigger);
  await sleep(150);
  await click(page, trigger);
  await sleep(300);
  const pos = await page.evaluate(wanted => {
    const row = Array.from(document.querySelectorAll('.ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === wanted);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + Math.min(60, b.width / 2), y: b.top + b.height / 2 };
  }, text);
  if (!pos) throw new Error('ligne introuvable dans la liste avec recherche : ' + text);
  await page.mouse.move(pos.x, pos.y); await sleep(80); await page.mouse.click(pos.x, pos.y);
  await sleep(250);
}

async function seedTemplates(page) {
  return page.evaluate(async () => {
    const make = async (name, html) => (await Templates.save(null, name, html, '', null, null, 'document', null)).id;
    const garde = await make('Garde', '<p>Texte de la garde</p>');
    const contrat = await make('Contrat urgent', '<p>Texte du contrat urgent</p>');
    const annexe = await make('Annexe standard', '<p>Texte de l’annexe standard</p>');
    await Templates.loadAll();
    return { garde: String(garde), contrat: String(contrat), annexe: String(annexe) };
  });
}

// Un macro-modèle d'avant (une page de garde, une annexe choisie selon la ligne), enregistré comme l'ancienne fenêtre l'écrivait.
async function seedOldMacro(page, ids) {
  return page.evaluate(async ({ ids }) => {
    const slots = { slots: [
      { type: 'fixed', modeleId: ids.garde },
      { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: ids.contrat }], defaultModeleId: ids.annexe },
    ] };
    const saved = await Templates.save(null, 'Macro ancienne', JSON.stringify(slots), '', null, PageLayout.newMacroMarginsMm(), 'macro', null);
    await Templates.loadAll();
    // L'arbre des documents se construit d'après les lignes enregistrées ET les options du vrai <select>.
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(saved.id); option.textContent = 'Macro ancienne'; select.appendChild(option);
    return saved.id;
  }, { ids });
}

// Une seule carte : le document choisi selon la ligne a le même haut que le premier, ses règles dessous ; une condition d'inclusion se règle comme sur les autres ; un modèle choisi le refait document.
async function unifiedCard(page, state, where, T, shot) {
  const sameTop = state.cards.every(c => JSON.stringify(c.labels) === JSON.stringify([T.model, T.include]) && c.when === 'always');
  check(where + 'tous les documents, y compris celui choisi selon la ligne, ont « ' + T.model + ' » puis « ' + T.include + ' »', sameTop, state.cards.map(c => [c.title, c.labels, c.when]));
  check(where + 'le document choisi selon la ligne dit « ' + T.byRowChoice + ' » dans « ' + T.model + ' » et déroule ses règles dessous', state.cards[1].modelShown === T.byRowChoice && state.cards[1].byRowBody && state.cards[1].rowRules === 1 && state.cards[0].modelShown === 'Garde' && !state.cards[0].byRowBody, state.cards.map(c => [c.modelShown, c.byRowBody, c.rowRules]));
  const card2 = '#macro-editor-slots .macro-slot-card:nth-child(2)';
  await shot('8-selon-la-ligne');
  const reach = await Promise.all([card2 + ' .macro-slot-rules .macro-rule-row', card2 + ' .macro-rule-add', card2 + ' .macro-slot-default-select + .ss-wrap .ss-trigger', card2 + ' select.macro-doc-when'].map(sel => reachable(page, sel).then(r => r.found && r.onTop && r.inView)));
  check(where + 'ses règles, « + Ajouter une condition « ou si » », son modèle par défaut et « ' + T.include + ' » sont atteignables à la souris', reach.every(Boolean), reach);
  // « Seulement si… » sur ce document-là : une règle réglée à la souris et au clavier.
  await choose(page, card2 + ' select.macro-doc-when', 'if');
  await sleep(200);
  await pickFromField(page, card2 + ' .macro-doc-rules select.macro-rule-column:not(.macro-rule-value-column)', 'Statut');
  await sleep(150);
  await click(page, card2 + ' .macro-doc-rules input.macro-rule-value');
  await page.keyboard.type('Urgent', { delay: 15 });
  await sleep(150);
  const withCondition = await windowState(page);
  await shot('9-selon-la-ligne-condition');
  check(where + 'sous « ' + T.onlyIf + ' », sa condition s\'ouvre et se règle (Statut = Urgent), sans indication « toujours inclus », ses règles toujours là',
    withCondition.cards[1].when === 'if' && withCondition.cards[1].conditionShown && !withCondition.cards[1].hintShown && withCondition.cards[1].rowRules === 1 && withCondition.cards[1].byRowBody, withCondition.cards[1]);
  check(where + 'la fenêtre ne déborde pas de côté avec la condition et les règles', !withCondition.body.scrollsSideways && withCondition.modal.right <= withCondition.view.w + 0.5, { body: withCondition.body });
  // Un modèle dans la liste : le document n'est plus « selon la ligne » ; revenir à « Choisi selon la ligne » retrouve ses règles.
  await pickFromField(page, card2 + ' select.macro-doc-model', 'Contrat urgent');
  await sleep(200);
  const asDocument = await windowState(page);
  check(where + 'un modèle choisi dans la liste en fait un document à un seul modèle (plus de règles dessous), la condition reste', asDocument.cards[1].kind === 'document' && asDocument.cards[1].modelShown === 'Contrat urgent' && !asDocument.cards[1].byRowBody && asDocument.cards[1].when === 'if' && asDocument.cards[1].conditionShown, asDocument.cards[1]);
  await pickFromField(page, card2 + ' select.macro-doc-model', T.byRowChoice);
  await sleep(200);
  const backToRows = await windowState(page);
  check(where + '« ' + T.byRowChoice + ' » rend ses règles', backToRows.cards[1].kind === 'by-row' && backToRows.cards[1].byRowBody && backToRows.cards[1].rowRules === 1 && backToRows.cards[1].modelShown === T.byRowChoice, backToRows.cards[1]);
}

async function run(w, lang, theme) {
  const page = w.page;
  const T = TEXTS[lang];
  const where = (theme === 'dark' ? 'sombre' : 'clair') + ', ' + (lang === 'en' ? 'anglais' : 'français') + ' : ';
  const shot = shotOf(page, `${theme}-${lang}`);
  await page.evaluate(rows => { window.__gristStub.setRows('PbDossiers', rows); }, ROWS);
  await fire(page, 'PbDossiers', 1);
  const ids = await seedTemplates(page);

  // 1) Un macro-modèle neuf : un seul document, pas de page de garde à part.
  await page.evaluate(() => MacroEditor.openModal(null));
  await sleep(500);
  let state = await windowState(page);
  await shot('1-neuf');
  check(where + 'un macro-modèle neuf s\'ouvre sur « ' + T.doc1 + ' » seul, sans liste de page de garde à part, en documents',
    state.cards.length === 1 && state.cards[0].title === T.doc1 && state.cards[0].kind === 'document' && state.cards[0].when === 'always' && !state.cards[0].conditionShown && !state.coverList, state);
  check(where + 'les deux boutons d\'ajout se lisent en entier et tiennent dans le panneau (' + T.addDoc + ' / ' + T.addByRow + ')',
    state.add[0] === T.addDoc && state.add[1] === T.addByRow && state.addInView.every(Boolean), { add: state.add, inView: state.addInView });
  check(where + 'la fenêtre tient dans la largeur du panneau, sans défilement de côté', state.modal.right <= state.view.w + 0.5 && state.modal.left >= -0.5 && !state.body.scrollsSideways, { modal: state.modal, body: state.body });

  // 2) Deux documents ; « Inclure ce document » du second réglé à la souris.
  await page.fill('#macro-editor-name', 'Macro conditions');
  await pickFromField(page, '#macro-editor-slots .macro-slot-card:nth-child(1) select.macro-doc-model', 'Garde');
  await click(page, '#macro-editor-add-document');
  await sleep(200);
  await pickFromField(page, '#macro-editor-slots .macro-slot-card:nth-child(2) select.macro-doc-model', 'Contrat urgent');
  state = await windowState(page);
  check(where + 'un clic sur « ' + T.addDoc + ' » ajoute « ' + T.doc2 + ' », « ' + T.always + ' » par défaut',
    state.cards.length === 2 && state.cards[1].title === T.doc2 && state.cards[1].when === 'always' && state.cards[1].whenLabel === T.always, state.cards);
  await choose(page, '#macro-editor-slots .macro-slot-card:nth-child(2) select.macro-doc-when', 'if');
  await sleep(200);
  state = await windowState(page);
  await shot('2-seulement-si');
  check(where + '« ' + T.onlyIf + ' » ouvre une règle vide et l\'indication « ce document sera toujours inclus »',
    state.cards[1].when === 'if' && state.cards[1].whenLabel === T.onlyIf && state.cards[1].conditionShown && state.cards[1].rules === 1 && state.cards[1].hintShown && state.cards[1].hintText === T.hint, state.cards[1]);
  const hint = await paintOf(page, '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-doc-hint');
  check(where + 'l\'indication se lit sur son fond (4,5:1 au moins)', ratio(hint.color, hint.bg) >= 4.5, { hint, ratio: ratio(hint.color, hint.bg) });
  check(where + 'la liste des colonnes, l\'opérateur, « + Ajouter une condition » et « + Groupe » sont atteignables à la souris dans le panneau',
    (await Promise.all(['#macro-editor-slots .macro-slot-card:nth-child(2) select.macro-rule-column:not(.macro-rule-value-column) + .ss-wrap .ss-trigger', '#macro-editor-slots .macro-slot-card:nth-child(2) .var-condition-add', '#macro-editor-slots .macro-slot-card:nth-child(2) .var-condition-add-group']
      .map(sel => reachable(page, sel).then(r => r.found && r.onTop && r.inView && r.h >= 20)))).every(Boolean));
  // La règle : colonne Statut, valeur « Urgent » (vraie saisie au clavier).
  await pickFromField(page, '#macro-editor-slots .macro-slot-card:nth-child(2) select.macro-rule-column:not(.macro-rule-value-column)', 'Statut');
  await sleep(150);
  const valueInput = '#macro-editor-slots .macro-slot-card:nth-child(2) input.macro-rule-value';
  await click(page, valueInput);
  await page.keyboard.type('Urgent', { delay: 15 });
  await sleep(150);
  state = await windowState(page);
  await shot('3-regle');
  check(where + 'une fois la règle complète (Statut = Urgent), l\'indication part', state.cards[1].conditionShown && !state.cards[1].hintShown, state.cards[1]);
  check(where + 'la fenêtre ne déborde toujours pas de côté avec la règle', !state.body.scrollsSideways && state.modal.right <= state.view.w + 0.5, { body: state.body });
  // Enregistrer, vrai clic.
  await click(page, '#macro-editor-save');
  await page.waitForFunction(() => { const s = document.getElementById('macro-summary-container'); return !!s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(900);
  await fire(page, 'PbDossiers', 1);
  await shot('4-resume');
  const summary = await summaryOf(page);
  check(where + 'le résumé dit « ' + T.summaryNote + ' » sous le second document seulement, et la phrase compte les documents (« ' + T.sentence + ' »)',
    JSON.stringify(summary.notes) === JSON.stringify([T.summaryNote]) && summary.sentence === T.sentence, summary);

  // 4) La Lecture, ligne après ligne.
  await mode(page, 'read');
  const forUrgent = await readingText(page);
  await fire(page, 'PbDossiers', 2);
  await sleep(500);
  const forNormal = await readingText(page);
  await shot('5-lecture-normal');
  await fire(page, 'PbDossiers', 3);
  await sleep(500);
  const forAnother = await readingText(page);
  check(where + 'la Lecture montre le contrat pour la ligne « Urgent », la garde partout, et plus de contrat pour la ligne « Normal »',
    forUrgent.includes('Texte de la garde') && forUrgent.includes('Texte du contrat urgent') && forNormal.includes('Texte de la garde') && !forNormal.includes('Texte du contrat urgent') && forAnother.includes('Texte du contrat urgent'),
    { forUrgent: forUrgent.slice(0, 120), forNormal: forNormal.slice(0, 120), forAnother: forAnother.slice(0, 120) });
  await mode(page, 'edit');

  // La fenêtre rouverte montre la condition réglée.
  await page.evaluate(() => document.getElementById('btn-edit-macro').click());
  await sleep(600);
  state = await windowState(page);
  const reopened = await page.evaluate(() => {
    const card = document.querySelector('#macro-editor-slots .macro-slot-card:nth-child(2)');
    const row = card.querySelector('.macro-doc-rules .macro-rule-row');
    return { column: row.querySelector('select.macro-rule-column').value, value: (row.querySelector('input.macro-rule-value') || {}).value };
  });
  await shot('6-rouverte');
  check(where + 'la fenêtre rouverte montre « ' + T.onlyIf + ' » et la règle Statut = Urgent', state.cards[1].when === 'if' && state.cards[1].conditionShown && reopened.column === 'Statut' && reopened.value === 'Urgent', { card: state.cards[1], reopened });
  check(where + 'le premier document reste « ' + T.always + ' », sans règle', state.cards[0].when === 'always' && !state.cards[0].conditionShown, state.cards[0]);
  await click(page, '#macro-editor-cancel');
  await sleep(300);

  // 5) Un macro-modèle d'AVANT : une page de garde puis une annexe choisie selon la ligne.
  const oldId = await seedOldMacro(page, ids);
  // Le macro-modèle se choisit dans l'arbre des documents, à la vraie souris.
  const chosenId = await pickTemplate(page, 'Macro ancienne');
  await sleep(500);
  await fire(page, 'PbDossiers', 2);
  await page.evaluate(() => document.getElementById('btn-edit-macro').click());
  await sleep(600);
  state = await windowState(page);
  await shot('7-ancienne');
  check(where + 'c\'est bien le macro-modèle d\'avant qui est chargé', String(chosenId) === String(oldId), { chosenId, oldId });
  check(where + 'un macro-modèle d\'avant s\'ouvre en « ' + T.doc1 + ' » (la page de garde) et « ' + T.doc2 + ' » (' + T.tag + '), sans condition',
    state.cards.length === 2 && state.cards[0].kind === 'document' && state.cards[0].title === T.doc1 && state.cards[0].when === 'always' && state.cards[1].kind === 'by-row' && state.cards[1].title === T.doc2 && state.cards[1].tag === T.tag, state.cards);
  await unifiedCard(page, state, where, T, shot);
  await click(page, '#macro-editor-cancel');
  await sleep(300);
  await mode(page, 'read');
  const oldReading = await readingText(page);
  check(where + 'sa Lecture est celle d\'avant : la garde, puis l\'annexe par défaut (ligne « Normal »)', oldReading.includes('Texte de la garde') && oldReading.includes('Texte de l’annexe standard') && !oldReading.includes('Texte du contrat urgent'), oldReading.slice(0, 160));
  await mode(page, 'edit');
}

// La fenêtre étroite de la capture d'Antoine (450 px de large) : le macro-modèle d'avant et un document sous condition, mêmes cartes, rien qui déborde de côté.
async function runNarrow(w, lang) {
  const page = w.page;
  const T = TEXTS[lang];
  const where = '450 px, ' + (lang === 'en' ? 'anglais' : 'français') + ' : ';
  const shot = shotOf(page, `etroit-${lang}`);
  await page.evaluate(rows => { window.__gristStub.setRows('PbDossiers', rows); }, ROWS);
  await fire(page, 'PbDossiers', 1);
  const ids = await seedTemplates(page);
  await seedOldMacro(page, ids);
  await pickTemplate(page, 'Macro ancienne');
  await sleep(500);
  await fire(page, 'PbDossiers', 2);
  await page.evaluate(() => document.getElementById('btn-edit-macro').click());
  await sleep(600);
  const card2 = '#macro-editor-slots .macro-slot-card:nth-child(2)';
  await shot('1-ouverte');
  await choose(page, card2 + ' select.macro-doc-when', 'if');
  await sleep(200);
  const state = await windowState(page);
  await shot('2-condition');
  check(where + 'les deux cartes ont « ' + T.model + ' » puis « ' + T.include + ' »', state.cards.length === 2 && state.cards.every(c => JSON.stringify(c.labels) === JSON.stringify([T.model, T.include])), state.cards.map(c => [c.title, c.labels]));
  check(where + 'la fenêtre tient dans la largeur, sans défilement de côté', state.modal.right <= state.view.w + 0.5 && state.modal.left >= -0.5 && !state.body.scrollsSideways, { modal: state.modal, view: state.view, body: state.body });
  const controls = [card2 + ' select.macro-doc-when', card2 + ' .macro-doc-condition select.macro-rule-column:not(.macro-rule-value-column) + .ss-wrap .ss-trigger', card2 + ' .macro-rule-add', card2 + ' .macro-slot-default-select + .ss-wrap .ss-trigger', '#macro-editor-save'];
  const reach = await Promise.all(controls.map(sel => reachable(page, sel).then(r => ({ sel, ok: r.found && r.onTop && r.inView }))));
  check(where + 'chaque contrôle de la carte « selon la ligne » est atteignable à la souris', reach.every(r => r.ok), reach.filter(r => !r.ok));
}

async function scenario(title, options, fn) {
  console.log('\n' + title);
  let w;
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

await scenario('1. Clair, français', {}, w => run(w, 'fr', 'light'));
await scenario('2. Sombre, anglais', { theme: 'dark', lang: 'en' }, w => run(w, 'en', 'dark'));
await scenario('3. Fenêtre étroite (450 x 740), clair, français', { width: 450, height: 740 }, w => runNarrow(w, 'fr'));
await scenario('4. Fenêtre étroite (450 x 740), sombre, anglais', { width: 450, height: 740, theme: 'dark', lang: 'en' }, w => runNarrow(w, 'en'));

await stopServer();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
