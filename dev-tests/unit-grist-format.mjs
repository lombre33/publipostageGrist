#!/usr/bin/env node
// Tests purs (sans navigateur) de « Comme dans Grist » (js/variable-format.js : gristColumnFormat, applyGristFormat, documentCurrency, formatNumber avec `percent` et `maxDecimals`) :
// le format d'affichage d'une colonne Grist (widgetOptions : numMode, decimals, maxDecimals, currency, dateFormat, timeFormat) traduit en réglage de bulle.
// Les attendus ne sont pas ceux de la fonction : dev-tests/fixtures/real-grist-formats.json garde, pour 65 colonnes aux réglages variés, le texte que le VRAI Grist écrit (grist-static 0.1.6,
// vue « Raw data », sondes du 21/10/2026, un document « fr-FR » / EUR et un « en-US » / USD ; labo-grist-reel/probe-grist-formats.mjs). Trois classes de colonnes :
//  - « identique » (exact) : chaque texte de la bulle est celui de Grist, espaces insécables mis à part - le bouton ne le dit « approché » qu'à bon droit, et ne dit jamais « identique » à tort ;
//  - « approchée » : le widget écrit le plus proche (un mois en toutes lettres dans la langue de l'interface, une heure à 24 heures, sans secondes ni fuseau, des barres au lieu de points...) et le dit ;
//  - « refusée » : le widget ne sait pas l'écrire (écriture scientifique) ou l'écrirait de travers (le mois avant le jour dans une interface française).
// L'écriture d'une devise en anglais (« $-7.13 » là où Grist écrit « -$7.13 », « CHF1,234.57 » pour « CHF 1,234.57 ») est un écart de formatNumber d'avant ce bouton, laissé tel quel : KNOWN_GAPS.
// Lancer : node dev-tests/unit-grist-format.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(join(ROOT, 'dev-tests/fixtures/real-grist-formats.json'), 'utf8'));

function loadFormat(lang) {
  const ctx = createContext(lang === 'en' ? { I18n: { getLang: () => 'en', t: key => key } } : {});
  loadScript(ctx, 'js/variable-format.js');
  // Appelle `VariableFormat.<name>(...args)` dans le contexte ; les arguments passent par une variable du contexte (des objets, pas du texte à évaluer).
  return (name, ...args) => { ctx.__ARGS = args; return evalIn(ctx, `VariableFormat.${name}(...__ARGS)`); };
}
const call = { fr: loadFormat('fr'), en: loadFormat('en') };
const norm = text => String(text).replace(/[  ]/g, ' ').trim();
const NB = ' ';
// L'ordre des clés d'un objet ne compte pas.
const json = value => JSON.stringify(value, (key, item) => (item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1))) : item));
const eq = (name, got, want) => check(name, json(got) === json(want), 'obtenu ' + json(got) + ', attendu ' + json(want));

const EXACT = {
  fr: [
    'N_plain', 'N_dec2', 'N_max2', 'N_dec2max4', 'N_dec0', 'N_dec_mode', 'N_dec_mode2', 'N_dec_mode3', 'N_dec_mode5', 'N_cur', 'N_cur_eur', 'N_cur_eur0', 'N_cur_usd',
    'N_cur_gbp', 'N_cur_chf', 'N_cur_jpy', 'N_cur_max', 'N_pct', 'N_pct1', 'N_pct2max', 'I_plain', 'I_cur', 'I_dec', 'I_pct', 'D_default', 'D_0', 'D_9', 'D_14', 'D_15',
    'D_16', 'D_19', 'T_2', 'T_8',
  ],
  en: [
    'N_plain', 'N_dec2', 'N_max2', 'N_dec2max4', 'N_dec0', 'N_dec_mode', 'N_dec_mode2', 'N_dec_mode3', 'N_dec_mode5', 'N_cur', 'N_cur_eur', 'N_cur_eur0', 'N_cur_usd',
    'N_cur_gbp', 'N_cur_chf', 'N_cur_jpy', 'N_cur_max', 'N_pct', 'N_pct1', 'N_pct2max', 'I_plain', 'I_cur', 'I_dec', 'I_pct', 'D_default', 'D_0', 'D_2', 'D_15', 'D_16',
    'D_22', 'D_23',
  ],
};
const REFUSED = {
  fr: { N_sci: 'scientific', N_sci2: 'scientific', D_1: 'dateOrder', D_2: 'dateOrder', D_3: 'dateOrder', D_4: 'dateOrder' },
  en: { N_sci: 'scientific', N_sci2: 'scientific', D_7: 'dateOrder', D_8: 'dateOrder', D_9: 'dateOrder', D_14: 'dateOrder', D_17: 'dateOrder', D_19: 'dateOrder', D_21: 'dateOrder', T_0: 'dateOrder', T_1: 'dateOrder', T_2: 'dateOrder', T_3: 'dateOrder', T_4: 'dateOrder', T_5: 'dateOrder', T_6: 'dateOrder', T_7: 'dateOrder', T_8: 'dateOrder' },
};
const APPROX_FR = {
  N_parens: "1 234,568",
  N_cur_parens: "1 234,57 €",
  D_5: "12 septembre 2026",
  D_6: "12 sept. 2026",
  D_7: "12/09/2026",
  D_8: "12/09/2026",
  D_10: "12 septembre 2026",
  D_11: "samedi 12 septembre 2026",
  D_12: "sam. 12 sept. 2026",
  D_13: "septembre 2026",
  D_17: "12/9/26",
  D_18: "2026-09-12",
  D_20: "12 sept. 2026",
  D_21: "12/09/2026",
  D_22: "12 sept. 2026",
  D_23: "samedi 12 septembre 2026",
  T_default: "2026-09-12 23 h 30",
  T_0: "12/09/2026 23 h 30",
  T_1: "12/09/2026 23 h 30",
  T_3: "12/09/2026 23:30",
  T_4: "12/09/2026 23:30",
  T_5: "12/09/2026 23:30",
  T_6: "12/09/2026 23:30",
  T_7: "12/09/2026 23 h 30",
  T_iso_default: "2026-09-12 23 h 30",
  T_long: "samedi 12 septembre 2026 à 17:30",
};
const APPROX_EN = ['N_parens', 'N_cur_parens', 'D_1', 'D_3', 'D_4', 'D_5', 'D_6', 'D_10', 'D_11', 'D_12', 'D_13', 'D_18', 'D_20', 'T_default', 'T_iso_default', 'T_long'];

// Les textes que le widget écrit autrement que Grist, bien que le réglage soit dit « identique » (le formateur de devise de l'interface anglaise, d'avant ce bouton) : colonne -> lignes.
// Chacune doit toujours différer : le jour où le formateur est corrigé, ce test demande de la retirer de la liste.
const NEGATIVE = [1];
const KNOWN_GAPS = { en: { N_cur: NEGATIVE, N_cur_eur: NEGATIVE, N_cur_eur0: NEGATIVE, N_cur_usd: NEGATIVE, N_cur_gbp: NEGATIVE, N_cur_chf: [0, 1, 2, 3, 4, 5, 6, 7], N_cur_jpy: NEGATIVE, N_cur_max: NEGATIVE, I_cur: NEGATIVE } };

const isNumber = column => column.type === 'Numeric' || column.type === 'Int';
function mapped(lang, column) {
  const settings = fixture.documents[lang].documentSettings;
  const currency = call[lang]('documentCurrency', settings);
  return call[lang]('gristColumnFormat', column.type, column.widgetOptions || {}, currency, lang);
}
function widgetTexts(lang, column, format) {
  return fixture.samples[column.samples].map(value => (isNumber(column) ? call[lang]('formatNumber', value, format) : call[lang]('formatDate', value, format, column.type)));
}

for (const lang of ['fr', 'en']) {
  const label = lang === 'fr' ? 'document fr-FR / EUR, interface française' : 'document en-US / USD, interface anglaise';
  const columns = fixture.columns;
  const classes = { exact: [], refused: {}, approx: [] };
  const wrong = [];
  const gaps = [];
  for (const column of columns) {
    const result = mapped(lang, column);
    if (result.refusal) { classes.refused[column.id] = result.refusal; continue; }
    if (!result.exact) { classes.approx.push(column.id); continue; }
    const texts = widgetTexts(lang, column, result.format);
    const known = (KNOWN_GAPS[lang] && KNOWN_GAPS[lang][column.id]) || [];
    texts.forEach((text, row) => {
      const same = norm(text) === norm(column.shown[lang][row]);
      if (known.includes(row)) { if (same) gaps.push(column.id + ' ligne ' + row + ' : écart d\'avant le bouton corrigé, à retirer de KNOWN_GAPS'); }
      else if (!same) wrong.push({ column: column.id, row, widget: norm(text), grist: norm(column.shown[lang][row]) });
    });
  }
  eq(`${label} : les colonnes dites « identiques » sont celles qui le sont`, columns.filter(c => !classes.refused[c.id] && !classes.approx.includes(c.id)).map(c => c.id), EXACT[lang]);
  eq(`${label} : colonnes refusées, et pourquoi`, classes.refused, REFUSED[lang]);
  eq(`${label} : colonnes approchées`, classes.approx, lang === 'fr' ? Object.keys(APPROX_FR) : APPROX_EN);
  check(`${label} : chaque texte d'une colonne « identique » est celui que Grist écrit (${columns.length - classes.approx.length - Object.keys(classes.refused).length} colonnes, 8 lignes)`, wrong.length === 0, json(wrong.slice(0, 6)));
  check(`${label} : les écarts connus de la devise en anglais n'ont pas disparu en silence`, gaps.length === 0, gaps.join(' ; '));
}

// Le texte approché, tel que le widget l'écrit en français pour la première ligne : un changement de ces écritures est à voir, pas à subir.
{
  const wrong = [];
  for (const column of fixture.columns) {
    if (!(column.id in APPROX_FR)) continue;
    const result = mapped('fr', column);
    const first = norm(widgetTexts('fr', column, result.format)[0]);
    if (first !== APPROX_FR[column.id]) wrong.push({ column: column.id, got: first, expected: APPROX_FR[column.id] });
  }
  check('interface française : l\'écriture approchée de chaque colonne (mois en lettres, heure à 24 h, barres au lieu de points, parenthèses non reprises...)', wrong.length === 0, json(wrong));
}

// --- Le nombre : les décimales de Grist (« au moins », « au plus ») et leur écriture ---
const number = (options, type = 'Numeric', currency = 'EUR', lang = 'fr') => call[lang]('gristColumnFormat', type, options, currency, lang);
eq('nombre brut, sans réglage : pas de séparateur de milliers, jusqu\'à dix décimales', number({}).format, { type: 'number', style: 'none', decimals: 0, maxDecimals: 10 });
eq('« décimal » : milliers et jusqu\'à trois décimales', number({ numMode: 'decimal' }).format, { type: 'number', decimals: 0, maxDecimals: 3 });
eq('devise : deux décimales (aucune pour le yen), et le signe de la devise', [number({ numMode: 'currency' }).format, number({ numMode: 'currency', currency: 'JPY' }).format],
  [{ type: 'number', currency: '€', decimals: 2 }, { type: 'number', currency: '¥', decimals: 0 }]);
eq('la devise de la colonne l\'emporte sur celle du document', number({ numMode: 'currency', currency: 'GBP' }, 'Numeric', 'EUR').format, { type: 'number', currency: '£', decimals: 2 });
eq('pourcentage : aucune décimale, le drapeau `percent`, pas de devise', number({ numMode: 'percent' }).format, { type: 'number', percent: true, decimals: 0 });
eq('« au plus » plus petit que « au moins » : les décimales obligatoires gagnent', number({ numMode: 'decimal', decimals: 3, maxDecimals: 1 }).format, { type: 'number', decimals: 3 });
eq('une colonne Entier part de zéro décimale et n\'a pas de « jusqu\'à »', [number({}, 'Int').format, number({ numMode: 'decimal' }, 'Int').format],
  [{ type: 'number', style: 'none', decimals: 0 }, { type: 'number', decimals: 0 }]);
eq('écriture scientifique : refusée', number({ numMode: 'scientific' }), { refusal: 'scientific' });
eq('une devise que personne ne connaît (réglages du document illisibles) : refusée, avec le nom du réglage', number({ numMode: 'currency' }, 'Numeric', null), { refusal: 'currency' });
eq('un code de devise qu\'Intl refuse : refusée, avec le code', number({ numMode: 'currency', currency: 'EURO' }), { refusal: 'currency', detail: 'EURO' });
eq('parenthèses des négatifs : non reprises, et la bulle le dit (approché)', [number({ numMode: 'decimal', numSign: 'parens' }).exact, number({ numMode: 'decimal' }).exact], [false, true]);
eq('réglages illisibles ou autre type de colonne : « unknown »', [number(null), call.fr('gristColumnFormat', 'Text', {}, 'EUR', 'fr'), call.fr('gristColumnFormat', 'Bool', {}, 'EUR', 'fr')], [{ refusal: 'unknown' }, { refusal: 'unknown' }, { refusal: 'unknown' }]);

// --- La date et l'heure ---
const date = (dateFormat, type = 'Date', timeFormat, lang = 'fr') => call[lang]('gristColumnFormat', type, timeFormat === undefined ? { dateFormat } : { dateFormat, timeFormat }, 'EUR', lang);
eq('« DD/MM/YYYY » en français et « MM/DD/YYYY » en anglais : le préréglage en chiffres, identique', [date('DD/MM/YYYY'), date('MM/DD/YYYY', 'Date', undefined, 'en')],
  [{ format: { type: 'date', preset: 'dmy_slash_full' }, exact: true }, { format: { type: 'date', preset: 'dmy_slash_full' }, exact: true }]);
eq('le mois avant le jour dans une interface française (et l\'inverse en anglais) : refusé, jamais lu à l\'envers', [date('MM/DD/YYYY'), date('DD/MM/YYYY', 'Date', undefined, 'en')],
  [{ refusal: 'dateOrder', detail: 'MM/DD/YYYY' }, { refusal: 'dateOrder', detail: 'DD/MM/YYYY' }]);
eq('l\'année d\'abord est lue pareil partout (ISO)', [date('YYYY-MM-DD'), date('YYYY-MM-DD', 'Date', undefined, 'en')].map(r => r.format), [{ type: 'date', preset: 'iso' }, { type: 'date', preset: 'iso' }]);
eq('un composant absent du format : le bouton J, M ou A relâché', [date('DD/MM').format, date('MM/YYYY').format, date('YYYY').format],
  [{ type: 'date', preset: 'dmy_slash_full', year: false }, { type: 'date', preset: 'dmy_slash_full', day: false }, { type: 'date', preset: 'iso', day: false, month: false }]);
eq('un mois en lettres : approché en français, identique en anglais quand le format est celui du préréglage',
  [date('D MMMM YYYY').exact, date('MMM D, YYYY', 'Date', undefined, 'en').exact, date('D MMMM YYYY', 'Date', undefined, 'en').exact], [false, true, false]);
eq('un format que le widget n\'écrit pas (deux fois le mois, un mot entre crochets, un séparateur inconnu) : refusé', [date('MM MM'), date('[le] D'), date('DD_MM_YYYY')].map(r => r.refusal), ['dateFormat', 'dateFormat', 'dateFormat']);
eq('Date et heure : l\'heure à 24 h (« colon »), à 12 h (« natural »), aucune quand le format d\'heure est vide',
  [date('DD/MM/YYYY', 'DateTime:Europe/Paris', 'HH:mm'), date('DD/MM/YYYY', 'DateTime:Europe/Paris', 'h:mma'), date('DD/MM/YYYY', 'DateTime:Europe/Paris', '')].map(r => r.format.time || null),
  ['colon', 'natural', null]);
eq('Date et heure sans format d\'heure : celui de Grist, « h:mma » (à 12 h)', date('DD/MM/YYYY', 'DateTime:Europe/Paris').format.time, 'natural');
eq('Date et heure : un format d\'heure inconnu est refusé', date('DD/MM/YYYY', 'DateTime:Europe/Paris', 'LT').refusal, 'timeFormat');
eq('les secondes, le fuseau et l\'heure sur 12 heures ne s\'écrivent pas pareil : approché', ['HH:mm:ss', 'HH:mm z', 'H:mm'].map(f => date('DD/MM/YYYY', 'DateTime:Europe/Paris', f).exact), [false, false, false]);

// --- La devise du document ---
eq('devise d\'un document : la sienne, sinon celle de sa langue (« en-US » quand il n\'en dit pas), inconnue sans réglages lus',
  [{ currency: 'JPY', locale: 'fr-FR' }, { locale: 'fr-FR' }, { locale: 'de-CH' }, {}, { locale: 'fr' }, { locale: 'xx-ZZ' }, null].map(s => call.fr('documentCurrency', s)),
  ['JPY', 'EUR', 'CHF', 'USD', null, null, null]);

// --- Poser le format sur une bulle ---
const apply = (current, gristFormat) => call.fr('applyGristFormat', current, gristFormat);
eq('« Comme dans Grist » remplace les réglages de nombre d\'avant (en lettres, décimales, devise) et garde le zéro masqué ou la liste, qui ne sont pas à Grist',
  apply({ type: 'number', words: true, decimals: 1, currency: '$', zero: 'show', list: { pick: 'first' } }, { type: 'number', currency: '€', decimals: 2 }),
  { zero: 'show', list: { pick: 'first' }, type: 'number', currency: '€', decimals: 2 });
eq('un nombre groupé garde le FR ou US choisi sur la bulle ; un nombre brut (style « none ») le remplace', [apply({ type: 'number', style: 'us' }, { type: 'number', decimals: 0, maxDecimals: 3 }), apply({ type: 'number', style: 'us' }, { type: 'number', style: 'none', decimals: 0 })],
  [{ type: 'number', style: 'us', decimals: 0, maxDecimals: 3 }, { type: 'number', style: 'none', decimals: 0 }]);
eq('une date remplace les jours, mois et années retirés d\'avant', apply({ type: 'date', preset: 'iso', day: false, time: 'colon', words: true }, { type: 'date', preset: 'dmy_slash_full' }), { type: 'date', preset: 'dmy_slash_full' });
eq('une bulle sans réglage prend le format tel quel', apply(null, { type: 'number', percent: true, decimals: 1 }), { type: 'number', percent: true, decimals: 1 });
eq('sameFormat : sans réglage et format vide sont le même, l\'ordre des clés ne compte pas', [call.fr('sameFormat', null, {}), call.fr('sameFormat', { type: 'number', decimals: 2 }, { decimals: 2, type: 'number' }), call.fr('sameFormat', { decimals: 2 }, { decimals: 3 })], [true, true, false]);

// --- Le pourcentage et les décimales « au plus » dans formatNumber ---
const fn = (value, format, lang = 'fr') => norm(call[lang]('formatNumber', value, Object.assign({ type: 'number' }, format)));
eq('pourcentage : la valeur fois cent et « % », avec l\'espace insécable en français et sans espace en anglais', [fn(0.256, { percent: true, decimals: 1 }), fn(0.256, { percent: true, decimals: 1 }, 'en'), fn(1234.5678, { percent: true, decimals: 0 })],
  ['25,6 %', '25.6%', '123 457 %']);
eq('le pourcentage l\'emporte sur la devise', fn(0.256, { percent: true, decimals: 1, currency: '€' }), '25,6 %');
eq('décimales « de x à y » : au moins x, au plus y', [fn(1234.5678, { decimals: 2, maxDecimals: 3 }), fn(1234.5, { decimals: 2, maxDecimals: 3 }), fn(1234, { decimals: 0, maxDecimals: 2 }), fn(1234.567, { decimals: 0, maxDecimals: 2 })], ['1 234,568', '1 234,50', '1 234', '1 234,57']);
eq('un réglage d\'avant le bouton (décimales fixes, devise, lettres) écrit comme avant', [fn(1234.5, { decimals: 2 }), fn(1234.5, { decimals: 0, currency: '€' }), fn(1234.5, {}), fn(1234.5, { style: 'none' })], ['1 234,50', '1 235 €', '1 234,5', '1234,5']);

summarizeAndExit();
