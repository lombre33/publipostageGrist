#!/usr/bin/env node
// Tests purs (sans navigateur) de js/xlsx-number-format.js : le texte qu'Excel montre pour une valeur, d'après le format de la case (« #,##0.00\ "€" », « dd/mm/yyyy »...). L'import d'un classeur dans une
// grille (js/grid-xlsx-import.js, sujet 18 du 02/10) en a besoin : un .xlsx ne garde que la valeur brute (12.5, 46298) et le code du format. Les attendus sont ceux d'Excel (texte affiché d'un classeur
// français et d'un classeur anglais), pas ceux de la fonction. Lancer : node dev-tests/unit-xlsx-number-format.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/xlsx-number-format.js');
ctx.__ARGS = null;
const fmt = (value, code, lang) => { ctx.__ARGS = [value, code, lang || 'fr']; return evalIn(ctx, 'XlsxNumberFormat.format(__ARGS[0], __ARGS[1], { lang: __ARGS[2] })'); };
const isDate = (code) => { ctx.__ARGS = [code]; return evalIn(ctx, 'XlsxNumberFormat.isDateFormat(__ARGS[0])'); };
const utc = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(Date.UTC(y, m - 1, d, h, mi, s, ms));
const NB = ' '; // l'espace insécable des milliers (et avant « € »)
const eq = (name, got, want) => check(name, got === want, 'obtenu « ' + got + ' », attendu « ' + want + ' »');

// 1. Nombres : séparateurs de la langue, décimales, milliers.
eq('12,5 en « #,##0.00 € » (français) : 12,50 €', fmt(12.5, '#,##0.00\\ "€"'), '12,50 €');
eq('1234567,891 en « #,##0.00 » (français) : milliers par un espace insécable, virgule décimale', fmt(1234567.891, '#,##0.00'), `1${NB}234${NB}567,89`);
eq('le même en anglais : virgule entre les milliers, point décimal', fmt(1234567.891, '#,##0.00', 'en'), '1,234,567.89');
eq('« 0.00 » ne groupe pas les milliers', fmt(1234.5, '0.00'), '1234,50');
eq('« 0 » arrondit : 12,6 → 13', fmt(12.6, '0'), '13');
eq('pourcentage « 0.0% » : 0,256 → 25,6%', fmt(0.256, '0.0%'), '25,6%');
eq('pourcentage « 0% » : 0,5 → 50%', fmt(0.5, '0%'), '50%');
eq('milliers « #,##0, » (une virgule en fin divise par 1000) : 1234 → 1', fmt(1234, '#,##0,'), '1');
eq('milliers avec unité « #,##0,"k" » : 1234567 → 1 235k', fmt(1234567, '#,##0,"k"'), `1${NB}235k`);

// 2. Chiffres obligatoires, zéros de tête, groupes de chiffres.
eq('« "N° "000 » : 5 → « N° 005 » (trois chiffres au moins)', fmt(5, '"N° "000'), 'N° 005');
eq('téléphone « 00\\ 00\\ 00\\ 00\\ 00 » : 612345678 → 06 12 34 56 78', fmt(612345678, '00\\ 00\\ 00\\ 00\\ 00'), '06 12 34 56 78');
eq('« 0000000000 » : 612345678 → 0612345678', fmt(612345678, '0000000000'), '0612345678');
eq('« #.00 » : 0,5 → « ,50 » (pas de zéro devant : un seul # )', fmt(0.5, '#.00'), ',50');
eq('« # » : zéro n\'écrit rien', fmt(0, '#'), '');
eq('« #,##0 » : zéro s\'écrit 0', fmt(0, '#,##0'), '0');

// 3. Sections : positif ; négatif ; zéro ; texte.
eq('négatif sans section : le signe moins devant', fmt(-12.5, '#,##0.00'), '-12,50');
eq('section négative en parenthèses « #,##0.00_);(#,##0.00) » : -12,5 → (12,50)', fmt(-12.5, '#,##0.00_);(#,##0.00)'), '(12,50)');
eq('section négative rouge « #,##0.00;[Red]\\-#,##0.00 » : la couleur n\'est pas du texte', fmt(-12.5, '#,##0.00;[Red]\\-#,##0.00'), '-12,50');
eq('section du zéro « 0.00;-0.00;"zéro" »', fmt(0, '0.00;-0.00;"zéro"'), 'zéro');
const COMPTA = '_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-';
eq('comptabilité (Excel français) : 3 → « 3,00 € »', fmt(3, COMPTA), '3,00 €');
eq('comptabilité : -3 → « -3,00 € »', fmt(-3, COMPTA), '-3,00 €');
eq('comptabilité : un texte reste tel quel', fmt('abc', COMPTA), 'abc');
eq('format texte « @ » : le texte', fmt('abc', '@'), 'abc');
eq('format texte « "Réf : "@ » : le texte précédé de son libellé', fmt('abc', '"Réf : "@'), 'Réf : abc');
eq('un texte dans un format sans section texte reste tel quel', fmt('abc', '0.00'), 'abc');

// 4. Devises entre crochets.
eq('« [$€-40C]\\ #,##0.00 » : le symbole de la devise', fmt(12.5, '[$€-40C]\\ #,##0.00'), '€ 12,50');
eq('« [$$-409]#,##0.00 » en anglais', fmt(12.5, '[$$-409]#,##0.00', 'en'), '$12.50');

// 5. « Standard » (General) : jusqu'à 11 chiffres significatifs, pas de bruit de virgule flottante.
eq('Standard : 3,14159 (français)', fmt(3.14159, 'General'), '3,14159');
eq('Standard : 3.14159 (anglais)', fmt(3.14159, 'General', 'en'), '3.14159');
eq('Standard : 0,1 + 0,2 → 0,3', fmt(0.1 + 0.2, 'General'), '0,3');
eq('Standard : un grand entier garde tous ses chiffres', fmt(123456789012, 'General'), '123456789012');
eq('sans format du tout : Standard', fmt(42, ''), '42');
eq('format absent : Standard', fmt(42, undefined), '42');

// 6. Dates et heures : d'après la langue.
eq('« dd/mm/yyyy » : 02/10/2026', fmt(utc(2026, 10, 2), 'dd/mm/yyyy'), '02/10/2026');
eq('format système « mm-dd-yy » (Excel français) : jour / mois / année', fmt(utc(2026, 10, 2), 'mm-dd-yy'), '02/10/2026');
eq('format système « mm-dd-yy » (Excel anglais) : mois / jour / année', fmt(utc(2026, 10, 2), 'mm-dd-yy', 'en'), '10/2/2026');
eq('un numéro de série d\'Excel : 46298 → 03/10/2026', fmt(46298, 'dd/mm/yyyy'), '03/10/2026');
eq('« d mmmm yyyy » : 2 octobre 2026', fmt(utc(2026, 10, 2), 'd mmmm yyyy'), '2 octobre 2026');
eq('« dddd d mmmm yyyy » : vendredi 2 octobre 2026', fmt(utc(2026, 10, 2), 'dddd d mmmm yyyy'), 'vendredi 2 octobre 2026');
eq('« dddd, mmmm d, yyyy » en anglais : Friday, October 2, 2026', fmt(utc(2026, 10, 2), 'dddd, mmmm d, yyyy', 'en'), 'Friday, October 2, 2026');
eq('« mmm-yy » en anglais : Oct-26', fmt(utc(2026, 10, 2), 'mmm-yy', 'en'), 'Oct-26');
eq('« dd/mm/yyyy hh:mm » : date et heure', fmt(utc(2026, 10, 2, 14, 5, 9), 'dd/mm/yyyy hh:mm'), '02/10/2026 14:05');
eq('« h:mm AM/PM » : 2:05 PM', fmt(utc(2026, 10, 2, 14, 5, 9), 'h:mm AM/PM', 'en'), '2:05 PM');
eq('« h:mm:ss AM/PM » à 00:05:09 : 12:05:09 AM', fmt(utc(2026, 10, 2, 0, 5, 9), 'h:mm:ss AM/PM', 'en'), '12:05:09 AM');
eq('« yyyy-mm-dd"T"hh:mm:ss » : un texte entre guillemets au milieu', fmt(utc(2026, 10, 2, 14, 5, 9), 'yyyy-mm-dd"T"hh:mm:ss'), '2026-10-02T14:05:09');
eq('« m » juste après les heures est une minute, « mm » avant les secondes aussi', fmt(utc(2026, 3, 7, 9, 4, 6), 'h:m:s') === '9:4:6' && fmt(utc(2026, 3, 7, 9, 4, 6), 'mm:ss') === '04:06' ? 'ok' : 'non', 'ok');
eq('« m » ailleurs est le mois : un format écrit par la personne, « m/d/yyyy », reste tel quel (même dans un classeur lu en français)', fmt(utc(2026, 3, 7), 'm/d/yyyy'), '3/7/2026');
eq('centièmes de seconde « mm:ss.00 »', fmt(utc(2026, 10, 2, 14, 5, 9, 450), 'mm:ss.00'), '05:09.45');
eq('une heure seule « hh:mm » : 06:30', fmt(utc(1899, 12, 30, 6, 30), 'hh:mm'), '06:30');
eq('heures cumulées « [h]:mm » : 50:00', fmt(utc(1900, 1, 1, 2, 0), '[h]:mm'), '50:00');
eq('une date sans format de date (Standard) : la date courte de la langue', fmt(utc(2026, 10, 2), 'General'), '02/10/2026');
eq('une date et une heure sans format : avec l\'heure', fmt(utc(2026, 10, 2, 8, 30), 'General', 'en'), '10/2/2026 08:30:00');
eq('format intégré n° 22 d\'ExcelJS « m/d/yy "h":mm » : date et heure de la langue', fmt(utc(2026, 10, 2, 14, 5), 'm/d/yy "h":mm'), '02/10/2026 14:05');

// 7. Booléens, vides, ce qui n'est pas géré.
eq('booléen vrai (français)', fmt(true, 'General'), 'VRAI');
eq('booléen faux (français)', fmt(false, 'General'), 'FAUX');
eq('booléen vrai (anglais)', fmt(true, 'General', 'en'), 'TRUE');
eq('valeur vide : rien', fmt(null, '0.00') + fmt(undefined, '0.00') + fmt('', '0.00'), '');
eq('notation scientifique (non gérée) : Standard', fmt(12.5, '0.00E+00'), '12,5');
eq('fraction (non gérée) : Standard', fmt(0.75, '# ?/?'), '0,75');

// 8. Reconnaître un format de date.
check('isDateFormat : dates et heures', ['dd/mm/yyyy', 'mm-dd-yy', 'h:mm', '[h]:mm', 'd mmmm yyyy', 'yyyy-mm-dd hh:mm'].every(isDate));
check('isDateFormat : ni nombres, ni texte, ni Standard', !['#,##0.00', '0.00" m"', 'General', '@', '0%', '', null, undefined].some(isDate));

// 9. Un format abîmé ne casse rien.
const garbage = ['[[[', '"non fermé', '\\', ';;;', '0.00;', '[Red', '_', '*'];
let thrown = null;
try { garbage.forEach((code) => { fmt(12.5, code); fmt('x', code); fmt(utc(2026, 1, 1), code); }); } catch (e) { thrown = e.message; }
check('des formats abîmés (crochet ou guillemet ouvert, point-virgules seuls) ne lèvent rien', thrown === null, thrown);
eq('une date invalide : rien', fmt(new Date(NaN), 'dd/mm/yyyy'), '');
eq('un nombre infini s\'écrit tel quel', fmt(Infinity, '0.00'), 'Infinity');
eq('une date avant 1900 avec un format de date : rien n\'est inventé', fmt(-5, 'dd/mm/yyyy'), '');

// 10. Les chemins que le découpage de tokenize, de renderDateSection et de format déplace (audit externe, groupe B) : chaque jeton de date, chaque
// sorte de valeur, chaque section.
eq('« mmmmm » : l\'initiale du mois (octobre → O)', fmt(utc(2026, 10, 2), 'mmmmm'), 'O');
eq('« ddd » : le jour abrégé (français)', fmt(utc(2026, 10, 2), 'ddd'), 'ven.');
eq('« dddd » : le jour entier (français)', fmt(utc(2026, 10, 2), 'dddd'), 'vendredi');
eq('« h:mm A/P » : l\'initiale de l\'après-midi', fmt(utc(2026, 10, 2, 14, 5), 'h:mm A/P', 'en'), '2:05 P');
eq('« h:mm A/P » : l\'initiale du matin', fmt(utc(2026, 10, 2, 9, 4), 'h:mm A/P', 'en'), '9:04 A');
eq('« h:mm am/pm » : en minuscules', fmt(utc(2026, 10, 2, 14, 5), 'h:mm am/pm', 'en'), '2:05 pm');
eq('« [mm] » : les minutes cumulées (un jour et demi = 2160)', fmt(1.5, '[mm]'), '2160');
eq('« [ss] » : les secondes cumulées (un jour et demi = 129600)', fmt(1.5, '[ss]'), '129600');
eq('« [hhh] » : les heures cumulées sur trois chiffres', fmt(1.5, '[hhh]'), '036');
eq('« mm:[ss] » : « mm » juste avant des secondes cumulées est une minute', fmt(utc(1900, 1, 1, 0, 5, 0), 'mm:[ss]'), '05:173100');
eq('« mm:ss.0000 » : le quatrième chiffre d\'une fraction de seconde s\'écrit 0', fmt(utc(2026, 10, 2, 14, 5, 9, 450), 'mm:ss.0000'), '05:09.4500');
eq('« hh:mm.00 » : une fraction sans secondes n\'écrit aucun chiffre, le point reste', fmt(utc(2026, 10, 2, 14, 5, 9, 450), 'hh:mm.00'), '14:05.');
eq('« hh,ss » : la virgule s\'écrit dans une date', fmt(utc(2026, 10, 2, 14, 5, 9), 'hh,ss'), '14,09');
eq('un jeton « @ » dans un format de date n\'écrit rien', fmt(utc(2026, 10, 2), 'yyyy @'), '2026 ');
eq('booléen faux (anglais)', fmt(false, 'General', 'en'), 'FALSE');
eq('un texte dans la section texte d\'un format à quatre sections : les chiffres de cette section n\'écrivent rien', fmt('abc', '0;0;0;"<"0@">"'), '<abc>');
eq('une valeur qui n\'est ni un nombre, ni une date, ni un texte s\'écrit telle quelle', fmt({ toString: () => 'xyz' }, '0.00'), 'xyz');
eq('format anglais d\'une date en « General » : la date courte anglaise', fmt(utc(2026, 10, 2), 'General', 'en'), '10/2/2026');
eq('zéro dans un format de date : 30/12/1899', fmt(0, 'dd/mm/yyyy'), '30/12/1899');
eq('nombre négatif et section négative d\'une date : rien d\'inventé', fmt(-1, 'dd/mm/yyyy;dd/mm/yyyy'), '');
eq('un format écrit avec des espaces autour : coupé', fmt(12.5, '  0.00  '), '12,50');
eq('un format fait d\'espaces seulement : Standard', fmt(12.5, '   '), '12,5');
eq('un format écrit en minuscules « general » : Standard', fmt(3.5, 'general'), '3,5');
eq('le mot « Standard » collé à des textes : « General » reconnu, les textes gardés', fmt(3.5, '"≈ "General" €"'), '≈ 3,5 €');
eq('« E+ » dans un format est la notation scientifique, non gérée : Standard', fmt(1234.5, '0.00E+00'), '1234,5');
eq('guillemet jamais fermé : le texte va jusqu\'à la fin', fmt(12.5, '0.0" m'), '12,5 m');
eq('un caractère échappé en fin de format : rien ne lève', fmt(12.5, '0.0\\'), '12,5');

summarizeAndExit();
