#!/usr/bin/env node
// Les modèles « à la suite » d'un document de macro-modèle (js/macro-editor.js:followingBlock, js/macro-templates.js:pickModeleIds) à la VRAIE souris et au vrai clavier, dans le panneau de 700x400 d'Antoine -
// sa demande du 26/11 : « après avoir mis des conditions sur un modèle, ajouter d'autres modèles dans le bloc à la suite » (carte répondue : « Modèles à la suite, dans la carte »). Ce que
// dev-tests/scenarios-macro-modeles.js ne peut pas voir depuis la page :
//   1) la carte d'un document : « + Ajouter un modèle à la suite » se lit en entier (4,5:1 au moins) et tient dans le panneau ; un vrai clic pose une ligne « Modèle » avec sa croix, la liste avec recherche
//      s'ouvre à la souris, ne propose pas « Choisi selon la ligne », et chaque contrôle est atteignable (rien ne le recouvre) une fois amené dans la vue, sans défilement de côté ;
//   2) la condition de la carte (« Seulement si… » : Statut = Urgent) se règle à la souris SOUS le bloc : le titre « À la suite, sous la même condition » dit que tout le bloc la suit ;
//   3) enregistré, le résumé dit le bloc sur UNE ligne (« Contrat urgent  puis  Annexe standard »), chaque modèle avec son stylo et son œil, « puis » se lit sur son fond (4,5:1), « Seulement si : … » dessous ;
//      rien ne déborde du panneau de côté ;
//   4) la Lecture, ligne après ligne (vraie sélection de ligne) : la ligne qui remplit la condition lit tout le bloc, dans l'ordre, l'autre n'en lit rien ;
//   5) un vrai clic sur l'œil d'un modèle à la suite le masque de la Lecture sans toucher aux autres modèles du bloc ; un vrai clic sur la croix d'une ligne la retire, le focus revient sur le lien d'ajout ;
//   6) la fenêtre étroite de la capture d'Antoine (450 px de large, 740 de haut) : mêmes cartes et même résumé, rien qui déborde de côté ni ne recouvre un contrôle ;
//   7) le thème sombre et l'anglais (mêmes mesures) ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « macroFollowingMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-macro-following-mouse.mjs
// MACRO_FOLLOWING_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { open, stopServer, sleep, click as clickAt, fire, mode, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.MACRO_FOLLOWING_PORT || 9027);
const SHOTS = process.env.MACRO_FOLLOWING_SHOTS || '';
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

// Contrastes (WCAG) : même calcul que dev-tests/verify-macro-doc-condition-mouse.mjs.
const rgbOf = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (fg, bg) => { const a = rgbOf(fg), b = rgbOf(bg); if (!a || !b) return 0; const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };

const TEXTS = {
  fr: { add: '+ Ajouter un modèle à la suite', title: 'À la suite, sous la même condition', then: 'puis', note: 'Seulement si : Statut = Urgent', onlyIf: 'Seulement si…', sentence: '2 documents, dont 1 sous condition.' },
  en: { add: '+ Add a template after it', title: 'Then, under the same condition', then: 'then', note: 'Only if: Statut = Urgent', onlyIf: 'Only if…', sentence: '2 documents, 1 of them conditional.' },
};

// Un vrai clic de souris sur un contrôle que la personne a d'abord amené dans la vue (la fenêtre défile).
async function click(page, selector) {
  await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'center' }); }, selector);
  await sleep(120);
  await clickAt(page, selector);
}

const shotOf = (page, tag) => async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png` }); };

// La fenêtre telle que la personne la voit : les cartes, leurs lignes « à la suite », la fenêtre déborde-t-elle de côté.
const windowState = page => page.evaluate(() => {
  const modal = document.getElementById('macro-editor-modal');
  const body = modal.querySelector('.pp-modal-body');
  const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const cards = Array.from(document.querySelectorAll('#macro-editor-slots .macro-slot-card')).map(card => ({
    title: card.querySelector('.macro-slot-title').textContent,
    when: card.querySelector('select.macro-doc-when').value,
    addText: card.querySelector('.macro-following-add').textContent,
    blockTitle: (card.querySelector('.macro-following-title') || {}).textContent || null,
    rows: Array.from(card.querySelectorAll('.macro-following-row')).map(row => ({ value: row.querySelector('select.macro-following-model').value, remove: row.querySelector('.macro-following-remove').getAttribute('aria-label') })),
    conditionShown: !card.querySelector('.macro-doc-condition').hidden,
  }));
  return { view: { w: innerWidth, h: innerHeight }, modal: box(modal), body: { scrollsSideways: body.scrollWidth > body.clientWidth + 1 }, cards };
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
const summaryOf = page => page.evaluate(() => {
  const list = document.getElementById('macro-summary-parts');
  return {
    sentence: (document.getElementById('macro-summary-text') || {}).textContent || '',
    rows: Array.from(list.querySelectorAll('.macro-summary-part')).map(row => ({
      label: row.querySelector('.macro-summary-part-label').textContent,
      models: Array.from(row.querySelectorAll('.macro-summary-model-name')).map(n => n.textContent),
      then: Array.from(row.querySelectorAll('.macro-summary-then')).map(n => n.textContent),
      note: (row.querySelector('.macro-summary-condition') || {}).textContent || null,
      eyes: Array.from(row.querySelectorAll('.macro-summary-eye')).map(b => ({ id: b.dataset.templateId, pressed: b.getAttribute('aria-pressed'), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })),
      pencils: row.querySelectorAll('.macro-summary-edit').length,
    })),
    overflowsSideways: list.scrollWidth > list.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
  };
});

// Choisit une ligne dans une liste avec recherche (SearchSelect) à la VRAIE souris : un clic sur le champ, un clic sur la ligne. La liste n'a pas d'identifiant propre : on lui en pose un.
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
// Les listes « Modèle » d'une carte, repérées par leur rang (pas d'identifiant dans la page) : la i-ème ligne « à la suite » de la carte `card` (1 = la première).
const followSelect = async (page, card, index) => {
  const id = 'mf-' + card + '-' + index;
  await page.evaluate(({ card, index, id }) => { document.querySelectorAll('#macro-editor-slots .macro-slot-card')[card - 1].querySelectorAll('select.macro-following-model')[index - 1].id = id; }, { card, index, id });
  return '#' + id;
};
// Les options que la liste avec recherche d'une ligne propose.
const optionsOfField = async (page, selectSelector) => {
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), selectSelector + ' + .ss-wrap .ss-trigger');
  await click(page, selectSelector + ' + .ss-wrap .ss-trigger');
  await sleep(300);
  const names = await page.evaluate(() => Array.from(document.querySelectorAll('.ss-panel:not([hidden]) .ss-option .ss-name')).map(n => n.textContent));
  await page.keyboard.press('Escape');
  await sleep(200);
  return names;
};

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

// Un macro-modèle déjà composé : une garde, puis un contrat sous condition suivi de l'annexe.
async function seedBlockMacro(page, ids, name) {
  return page.evaluate(async ({ ids, name }) => {
    const slots = { slots: [
      { type: 'fixed', modeleId: ids.garde },
      { type: 'fixed', modeleId: ids.contrat, followingModeleIds: [ids.annexe], condition: { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] } },
    ] };
    const saved = await Templates.save(null, name, JSON.stringify(slots), '', null, PageLayout.newMacroMarginsMm(), 'macro', null);
    await Templates.loadAll();
    // L'arbre des documents se construit d'après les lignes enregistrées ET les options du vrai <select>.
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(saved.id); option.textContent = name; select.appendChild(option);
    return saved.id;
  }, { ids, name });
}

async function run(w, lang, theme) {
  const page = w.page;
  const T = TEXTS[lang];
  const where = (theme === 'dark' ? 'sombre' : 'clair') + ', ' + (lang === 'en' ? 'anglais' : 'français') + ' : ';
  const shot = shotOf(page, `${theme}-${lang}`);
  await page.evaluate(rows => { window.__gristStub.setRows('PbDossiers', rows); }, ROWS);
  await fire(page, 'PbDossiers', 1);
  await seedTemplates(page);

  // 1) Un macro-modèle neuf : « + Ajouter un modèle à la suite » sous le premier document, à la vraie souris.
  await page.evaluate(() => MacroEditor.openModal(null));
  await sleep(500);
  await page.fill('#macro-editor-name', 'Macro à la suite');
  await pickFromField(page, '#macro-editor-slots .macro-slot-card:nth-child(1) select.macro-doc-model', 'Garde');
  await click(page, '#macro-editor-add-document');
  await sleep(200);
  await pickFromField(page, '#macro-editor-slots .macro-slot-card:nth-child(2) select.macro-doc-model', 'Contrat urgent');
  let state = await windowState(page);
  check(where + 'sous chaque carte, « ' + T.add + ' » se lit en entier ; pas de titre « à la suite » tant qu\'aucun modèle n\'est ajouté', state.cards.every(c => c.addText === T.add && c.blockTitle === null && c.rows.length === 0), state.cards);
  const addPaint = await paintOf(page, '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-add');
  check(where + 'le lien « ' + T.add + ' » se lit sur son fond (4,5:1 au moins)', ratio(addPaint.color, addPaint.bg) >= 4.5, { addPaint, ratio: ratio(addPaint.color, addPaint.bg) });
  const addReach = await reachable(page, '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-add');
  check(where + 'le lien d\'ajout est atteignable à la souris dans le panneau, avec une cible d\'au moins 20 px de haut', addReach.found && addReach.onTop && addReach.inView && addReach.h >= 20, addReach);
  await click(page, '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-add');
  await sleep(250);
  await click(page, '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-add');
  await sleep(250);
  state = await windowState(page);
  await shot('1-deux-lignes');
  check(where + 'deux clics posent deux lignes sous le Document 2, avec le titre « ' + T.title + ' »', state.cards[1].rows.length === 2 && state.cards[1].blockTitle === T.title && state.cards[0].rows.length === 0, state.cards[1]);
  check(where + 'le focus est sur la liste de la ligne qu\'on vient d\'ajouter', await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.macro-following-row')));
  const first = await followSelect(page, 2, 1);
  const second = await followSelect(page, 2, 2);
  const offered = await optionsOfField(page, first);
  check(where + 'la liste d\'une ligne « à la suite » propose les modèles, jamais « Choisi selon la ligne »', offered.includes('Annexe standard') && offered.includes('Contrat urgent') && !offered.some(n => /selon la ligne|by the row/i.test(n)), offered);
  await pickFromField(page, first, 'Annexe standard');
  await pickFromField(page, second, 'Garde');
  const controls = ['#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-row:nth-of-type(2) .ss-trigger', '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-row:nth-of-type(2) .macro-following-remove', '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-row:nth-of-type(3) .ss-trigger', '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-row:nth-of-type(3) .macro-following-remove'];
  const reach = await Promise.all(controls.map(sel => reachable(page, sel).then(r => ({ sel: sel.slice(-60), ok: r.found && r.onTop && r.inView && r.h >= 20 }))));
  check(where + 'la liste et la croix de chaque ligne sont atteignables à la souris (cible de 20 px au moins)', reach.every(r => r.ok), reach.filter(r => !r.ok));
  // 2) La condition du Document 2 : « Seulement si… » Statut = Urgent, réglée à la souris sous le bloc.
  await page.selectOption('#macro-editor-slots .macro-slot-card:nth-child(2) select.macro-doc-when', 'if');
  await sleep(250);
  await pickFromField(page, '#macro-editor-slots .macro-slot-card:nth-child(2) select.macro-rule-column:not(.macro-rule-value-column)', 'Statut');
  await sleep(150);
  await click(page, '#macro-editor-slots .macro-slot-card:nth-child(2) input.macro-rule-value');
  await page.keyboard.type('Urgent', { delay: 15 });
  await sleep(150);
  state = await windowState(page);
  await shot('2-condition');
  check(where + 'la condition (' + T.onlyIf + ' Statut = Urgent) s\'ouvre au-dessus du bloc, qui garde ses deux lignes', state.cards[1].when === 'if' && state.cards[1].conditionShown && state.cards[1].rows.length === 2, state.cards[1]);
  check(where + 'la fenêtre ne déborde pas de côté, ni le titre ni les lignes à la suite', !state.body.scrollsSideways && state.modal.right <= state.view.w + 0.5 && state.modal.left >= -0.5, { modal: state.modal, body: state.body });
  const titlePaint = await paintOf(page, '#macro-editor-slots .macro-slot-card:nth-child(2) .macro-following-title');
  check(where + 'le titre « ' + T.title + ' » se lit sur son fond (4,5:1 au moins)', ratio(titlePaint.color, titlePaint.bg) >= 4.5, { titlePaint, ratio: ratio(titlePaint.color, titlePaint.bg) });

  // 3) Enregistrer, vrai clic : le résumé dit le bloc sur une ligne.
  await click(page, '#macro-editor-save');
  await page.waitForFunction(() => { const s = document.getElementById('macro-summary-container'); return !!s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(900);
  await fire(page, 'PbDossiers', 1);
  await shot('3-resume');
  let summary = await summaryOf(page);
  check(where + 'le résumé dit le Document 2 sur une seule ligne : Contrat urgent, « ' + T.then + ' » Annexe standard, « ' + T.then + ' » Garde, puis « ' + T.note + ' »',
    JSON.stringify(summary.rows[1].models) === JSON.stringify(['Contrat urgent', 'Annexe standard', 'Garde']) && JSON.stringify(summary.rows[1].then) === JSON.stringify([T.then, T.then]) && summary.rows[1].note === T.note, summary.rows[1]);
  check(where + 'chaque modèle du bloc a son stylo et son œil (24 px au moins), la phrase compte les documents (« ' + T.sentence + ' »)', summary.rows[1].pencils === 3 && summary.rows[1].eyes.length === 3 && summary.rows[1].eyes.every(e => e.w >= 24 && e.h >= 24) && summary.sentence === T.sentence, { sentence: summary.sentence, row: summary.rows[1] });
  check(where + 'le Document 1 n\'a pas de « ' + T.then + ' »', summary.rows[0].then.length === 0 && summary.rows[0].models.length === 1, summary.rows[0]);
  check(where + 'le résumé ne déborde pas de côté', !summary.overflowsSideways, summary);
  const thenPaint = await paintOf(page, '#macro-summary-parts .macro-summary-then');
  check(where + '« ' + T.then + ' » se lit sur son fond (4,5:1 au moins)', ratio(thenPaint.color, thenPaint.bg) >= 4.5, { thenPaint, ratio: ratio(thenPaint.color, thenPaint.bg) });

  // 4) La Lecture, ligne après ligne.
  await mode(page, 'read');
  const forUrgent = await readingText(page);
  await fire(page, 'PbDossiers', 2);
  await sleep(500);
  const forNormal = await readingText(page);
  await fire(page, 'PbDossiers', 3);
  await sleep(500);
  const forAnother = await readingText(page);
  const order = text => ['Texte de la garde', 'Texte du contrat urgent', 'Texte de l’annexe standard'].map(t => text.indexOf(t));
  check(where + 'la Lecture : la ligne « Urgent » lit tout le bloc dans l\'ordre (contrat, annexe), la ligne « Normal » n\'en lit rien, la garde est partout',
    order(forUrgent)[0] >= 0 && forUrgent.includes('Texte du contrat urgent') && forUrgent.includes('Texte de l’annexe standard') && forNormal.includes('Texte de la garde') && !forNormal.includes('Texte du contrat urgent') && !forNormal.includes('Texte de l’annexe standard') && forAnother.includes('Texte de l’annexe standard'),
    { forUrgent: forUrgent.slice(0, 160), forNormal: forNormal.slice(0, 160), forAnother: forAnother.slice(0, 160) });
  check(where + 'l\'ordre de la Lecture est celui du bloc (garde, contrat, annexe, garde)', (() => { const text = forUrgent; const a = text.indexOf('Texte du contrat urgent'); const b = text.indexOf('Texte de l’annexe standard'); const c = text.lastIndexOf('Texte de la garde'); return a >= 0 && b > a && c > b; })() && order(forUrgent)[0] >= 0, order(forUrgent));
  await mode(page, 'edit');
  await fire(page, 'PbDossiers', 1);

  // 5) Un vrai clic sur l'œil de l'annexe : masquée de la Lecture, les autres modèles du bloc restent.
  await page.evaluate(() => { document.querySelectorAll('#macro-summary-parts .macro-summary-part')[1].querySelectorAll('.macro-summary-eye')[1].id = 'eye-annexe'; });
  await click(page, '#eye-annexe');
  await sleep(900);
  summary = await summaryOf(page);
  check(where + 'un clic sur l\'œil de l\'annexe l\'enfonce (masquée) sans toucher aux deux autres modèles du bloc', JSON.stringify(summary.rows[1].eyes.map(e => e.pressed)) === JSON.stringify(['false', 'true', 'false']), summary.rows[1].eyes);
  await shot('4-oeil');
  await mode(page, 'read');
  const hiddenReading = await readingText(page);
  check(where + 'la Lecture ne montre plus l\'annexe, mais le contrat de la ligne « Urgent » y est toujours', !hiddenReading.includes('Texte de l’annexe standard') && hiddenReading.includes('Texte du contrat urgent'), hiddenReading.slice(0, 200));
  await mode(page, 'edit');

  // La fenêtre rouverte : les trois lignes dans l'ordre ; la croix de la première retire l'annexe, le focus revient sur le lien d'ajout.
  await page.evaluate(() => document.getElementById('btn-edit-macro').click());
  await sleep(600);
  state = await windowState(page);
  check(where + 'la fenêtre rouverte montre les deux lignes « à la suite » du Document 2 dans l\'ordre (Annexe standard, Garde)', state.cards[1].rows.length === 2 && state.cards[1].rows[0].value !== '' && state.cards[1].rows[1].value !== '' && state.cards[1].rows[0].value !== state.cards[1].rows[1].value, state.cards[1]);
  await page.evaluate(() => { document.querySelectorAll('#macro-editor-slots .macro-slot-card')[1].querySelectorAll('.macro-following-remove')[0].id = 'remove-first'; });
  await click(page, '#remove-first');
  await sleep(250);
  state = await windowState(page);
  check(where + 'un clic sur la croix de la première ligne la retire (il reste une ligne) et le focus revient sur « ' + T.add + ' »', state.cards[1].rows.length === 1 && await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('macro-following-add')), state.cards[1]);
  await shot('5-retrait');
  await click(page, '#macro-editor-cancel');
  await sleep(300);
}

// La fenêtre étroite de la capture d'Antoine (450 px de large) : le bloc dans la fenêtre de composition et dans le résumé, mêmes cartes, rien qui déborde de côté.
async function runNarrow(w, lang) {
  const page = w.page;
  const T = TEXTS[lang];
  const where = '450 px, ' + (lang === 'en' ? 'anglais' : 'français') + ' : ';
  const shot = shotOf(page, `etroit-${lang}`);
  await page.evaluate(rows => { window.__gristStub.setRows('PbDossiers', rows); }, ROWS);
  await fire(page, 'PbDossiers', 1);
  const ids = await seedTemplates(page);
  await seedBlockMacro(page, ids, 'Macro bloc');
  await pickTemplate(page, 'Macro bloc');
  await sleep(500);
  await fire(page, 'PbDossiers', 1);
  const summary = await summaryOf(page);
  await shot('1-resume');
  check(where + 'le résumé dit le bloc (Contrat urgent « ' + T.then + ' » Annexe standard) et tient dans la largeur, sans défilement de côté', JSON.stringify(summary.rows[1].models) === JSON.stringify(['Contrat urgent', 'Annexe standard']) && JSON.stringify(summary.rows[1].then) === JSON.stringify([T.then]) && !summary.overflowsSideways, summary);
  await page.evaluate(() => document.getElementById('btn-edit-macro').click());
  await sleep(600);
  const card2 = '#macro-editor-slots .macro-slot-card:nth-child(2)';
  await shot('2-fenetre');
  await click(page, card2 + ' .macro-following-add');
  await sleep(250);
  const state = await windowState(page);
  await shot('3-ligne-ajoutee');
  check(where + 'la carte du Document 2 montre ses deux lignes (l\'annexe et la ligne qu\'on vient d\'ajouter), « ' + T.title + ' » au-dessus', state.cards[1].rows.length === 2 && state.cards[1].blockTitle === T.title && state.cards[1].rows[1].value === '', state.cards[1]);
  check(where + 'la fenêtre tient dans la largeur, sans défilement de côté', state.modal.right <= state.view.w + 0.5 && state.modal.left >= -0.5 && !state.body.scrollsSideways, { modal: state.modal, view: state.view, body: state.body });
  const reachList = [card2 + ' .macro-following-row:nth-of-type(2) .ss-trigger', card2 + ' .macro-following-row:nth-of-type(2) .macro-following-remove', card2 + ' .macro-following-row:nth-of-type(3) .ss-trigger', card2 + ' .macro-following-row:nth-of-type(3) .macro-following-remove', card2 + ' .macro-following-add'];
  const reach = await Promise.all(reachList.map(sel => reachable(page, sel).then(r => ({ sel: sel.slice(-60), ok: r.found && r.onTop && r.inView }))));
  check(where + 'chaque liste, chaque croix et le lien d\'ajout sont atteignables à la souris', reach.every(r => r.ok), reach.filter(r => !r.ok));
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
