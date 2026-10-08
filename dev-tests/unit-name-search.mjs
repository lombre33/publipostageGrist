#!/usr/bin/env node
// Tests purs (sans navigateur) de la recherche par nom partagée : js/search-select.js (searchWords, searchKey, foundIn et filterItems) - cf. dev-tests/unit-harness.mjs pour le contexte
// général. Demande d'Antoine du 08/10 : « si la colonne est Projets.Porteur_3, en tapant "porteur 3" ou "Porteur3" je ne la trouve pas ; plus exhaustif, qui teste tous les noms ». Les
// attendus sont ceux de la personne qui tape, pas ceux de la fonction :
//  1) « porteur 3 », « Porteur3 », « 3 porteur », « porteur_3 », « PORTEUR-3 », « projets porteur_3 » et « Projets.Porteur_3 » retrouvent tous Projets.Porteur_3 ; « porteur 4 », « porteur 33 » et une
//     faute de frappe ne la retrouvent pas ; « Porteur_3 » tapé en entier ne retrouve pas Porteur_13, « porteur 3 » (deux mots) oui ;
//  2) les accents et la casse ne comptent pas, ni le nombre d'espaces ni leur place ;
//  3) tous les noms se cherchent : l'identifiant et la table, le libellé Grist (`data-search`), l'indice ; un mot ne passe pas d'un nom à l'autre ;
//  4) une liste garde son ordre, la ligne épinglée reste, le choix « rien » ne se propose que sans recherche, et une saisie sans lettre ni chiffre ne filtre rien.
// Lancer : node dev-tests/unit-name-search.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

// SearchSelect ne touche au DOM qu'à l'usage (attach) : il lui suffit ici d'un `Dom.el` à l'évaluation du fichier.
const ctx = createContext({ Dom: { el: () => ({}) } });
loadScript(ctx, 'js/search-select.js');

ctx.__ITEMS = null;
const words = query => { ctx.__Q = query; return evalIn(ctx, 'SearchSelect.searchWords(__Q)'); };
// Vrai quand `query` retrouve un candidat qui porte ces noms.
const finds = (query, ...names) => { ctx.__Q = query; ctx.__N = names; return evalIn(ctx, 'SearchSelect.foundIn(SearchSelect.searchWords(__Q), SearchSelect.searchKey(...__N))'); };
// Les valeurs gardées par filterItems, dans l'ordre : `items` est une liste de { value, name, hint, search, pinned, empty }.
const filtered = (items, query) => {
  ctx.__ITEMS = items; ctx.__Q = query;
  return evalIn(ctx, `SearchSelect.filterItems(__ITEMS.map(i => Object.assign({}, i, { haystack: SearchSelect.searchKey(i.name, i.hint, i.search) })), __Q).map(i => i.value)`);
};

// 1. Projets.Porteur_3, trouvée de toutes les façons dont on peut l'écrire.
{
  const names = ['Projets.Porteur_3'];
  const writings = ['porteur 3', 'Porteur3', '3 porteur', 'porteur_3', 'PORTEUR-3', 'projets porteur_3', 'Projets.Porteur_3', 'projets 3 porteur', 'porteur.3', '  porteur   3  ', 'projetsporteur3', 'teur 3'];
  const missed = writings.filter(w => !finds(w, ...names));
  check('Projets.Porteur_3 : douze écritures la retrouvent', missed.length === 0, JSON.stringify(missed));
  const wrong = ['porteur 4', 'porteur 33', 'porteur4', 'portuer 3', 'projet 3 accompagnateur', 'porteur 3 4'];
  const found = wrong.filter(w => finds(w, ...names));
  check('Projets.Porteur_3 : un autre numéro, une faute de frappe ou un mot en trop ne la retrouvent pas', found.length === 0, JSON.stringify(found));
  check('Porteur3 sans « _ » dans le nom : « porteur 3 » et « Porteur_3 » le retrouvent aussi', finds('porteur 3', 'Projets.Porteur3') && finds('Porteur_3', 'Projets.Porteur3'));
  // Une espace sépare des mots (le « 3 » peut être n'importe où : Porteur_13 le porte aussi) ; « _ », « . » et « - » ne comptent pas, donc le nom tapé en entier
  // reste précis : il n'a pas à retrouver une colonne de plus (Entrée choisit la première ligne de la liste « # »).
  const p13 = ['Projets.Porteur_13'];
  check('précision : « porteur 3 » (deux mots) retrouve aussi Porteur_13, « Porteur_3 », « Projets.Porteur_3 », « Porteur3 » et « PORTEUR-3 » (un seul mot) non',
    finds('porteur 3', ...p13) && !finds('Porteur_3', ...p13) && !finds('Projets.Porteur_3', ...p13) && !finds('Porteur3', ...p13) && !finds('PORTEUR-3', ...p13) && !finds('porteur.3', ...p13));
  check('précision : « Porteur_3 » retrouve encore Porteur_33 (un nom qui commence ainsi), comme la recherche d\'avant', finds('Porteur_3', 'Projets.Porteur_33'));
}

// 2. Les mots de la saisie.
{
  check('mots : coupés à l\'espace seulement, sans « _ », « . » ni « - », sans accents ni casse', JSON.stringify(words('  Porteur_3 - À.Faire ')) === JSON.stringify(['porteur3', 'afaire']));
  check('mots : « Porteur3 », « Porteur_3 » et « PORTEUR-3 » sont un seul mot, le même', ['Porteur3', 'Porteur_3', 'PORTEUR-3', 'porteur.3'].every(q => JSON.stringify(words(q)) === JSON.stringify(['porteur3'])));
  check('mots : une saisie sans lettre ni chiffre n\'en a aucun', words('').length === 0 && words(' _ . - ').length === 0 && words(null).length === 0);
  check('mots : les lettres d\'autres écritures comptent (cyrillique), pas le signe « № »', JSON.stringify(words('Номер №3')) === JSON.stringify(['номер', '3']));
  check('mots : une espace insécable ou fine sépare aussi', JSON.stringify(words('porteur\u00a03\u202fdossiers')) === JSON.stringify(['porteur', '3', 'dossiers']));
  check('accents et casse : « PÖRTEUR » et « portéur » retrouvent Porteur_3', finds('PÖRTEUR', 'Projets.Porteur_3') && finds('portéur 3', 'Projets.Porteur_3'));
}

// 3. Tous les noms se cherchent.
{
  check('libellé : « chef de projet » retrouve Projets.Porteur_3 dont le libellé Grist est « Chef de projet n°3 »', finds('chef de projet', 'Projets.Porteur_3 Chef de projet n°3'));
  check('libellé : « projet 3 chef » (autre ordre, table et libellé mêlés) la retrouve', finds('projet 3 chef', 'Projets.Porteur_3 Chef de projet n°3'));
  check('libellé : sans lui, « chef » ne la retrouve pas', !finds('chef', 'Projets.Porteur_3'));
  check('table : « dossiers titre » retrouve la colonne Titre de la table Dossiers (nom nu, table en `data-search`)', finds('dossiers titre', 'Titre', '', 'Dossiers.Titre'));
  check('indice : « date » retrouve une colonne dont le type est « date »', finds('date', 'Echeance', 'date', 'Dossiers.Echeance'));
  check('noms séparés : un mot ne passe pas d\'un nom à l\'autre', !finds('phabe', 'alpha', 'beta') && finds('alpha beta', 'alpha', 'beta'));
  check('table collée à la colonne dans un même nom : « projetsporteur3 » la retrouve', finds('projetsporteur3', 'Projets.Porteur_3'));
}

// 4. filterItems : l'ordre, l'épinglé, le choix « rien ».
{
  const items = [
    { value: '', name: '— Choisir une colonne —', hint: '', search: '', empty: true },
    { value: 'a', name: 'Dossiers.Porteur_1', hint: '', search: '' },
    { value: 'b', name: 'Projets.Porteur_3', hint: '', search: '' },
    { value: 'c', name: 'Projets.Accompagnateur_3', hint: 'texte', search: '' },
    { value: 'd', name: 'Echeance', hint: 'date', search: 'Projets.Echeance Date limite' },
    { value: '__advanced', name: 'Autre colonne…', hint: '', search: '', pinned: true },
  ];
  const keep = (...v) => JSON.stringify(v);
  check('liste : sans saisie, tout (le choix « rien » compris), dans l\'ordre', JSON.stringify(filtered(items, '')) === keep('', 'a', 'b', 'c', 'd', '__advanced'));
  check('liste : une saisie sans lettre ni chiffre ne filtre rien', JSON.stringify(filtered(items, ' . ')) === keep('', 'a', 'b', 'c', 'd', '__advanced'));
  check('liste : « porteur 3 » ne garde que Projets.Porteur_3, plus la ligne épinglée, jamais le choix « rien »', JSON.stringify(filtered(items, 'porteur 3')) === keep('b', '__advanced'));
  check('liste : « Porteur3 » donne la même chose', JSON.stringify(filtered(items, 'Porteur3')) === keep('b', '__advanced'));
  check('liste : « 3 » garde les deux colonnes qui le portent, dans l\'ordre de la liste', JSON.stringify(filtered(items, '3')) === keep('b', 'c', '__advanced'));
  check('liste : « porteur » garde Dossiers.Porteur_1 et Projets.Porteur_3, dans l\'ordre', JSON.stringify(filtered(items, 'porteur')) === keep('a', 'b', '__advanced'));
  check('liste : « projets » trouve la table dans le nom et dans `data-search`', JSON.stringify(filtered(items, 'projets')) === keep('b', 'c', 'd', '__advanced'));
  check('liste : « limite date » trouve Echeance par son libellé, dans l\'autre ordre', JSON.stringify(filtered(items, 'limite date')) === keep('d', '__advanced'));
  check('liste : l\'indice se cherche (« texte »)', JSON.stringify(filtered(items, 'texte')) === keep('c', '__advanced'));
  check('liste : rien ne correspond, il ne reste que la ligne épinglée', JSON.stringify(filtered(items, 'zzz')) === keep('__advanced'));
}

// 5. Le coût : la liste « # » prépare toutes les colonnes du document à chaque frappe. 20 000 colonnes, une recherche à deux mots, à froid (les noms ne sont pas encore
// préparés) puis à chaud ; les bornes sont larges (une machine chargée), le but est de garder une recherche qui reste immédiate sur un très gros document.
{
  const candidates = [];
  for (let t = 1; t <= 200; t++) for (let c = 1; c <= 100; c++) candidates.push('Table' + t + '.Colonne_' + String(c).padStart(3, '0') + ' Libellé ' + c);
  ctx.__NAMES = candidates;
  ctx.__Q = 'colonne 100';
  const run = () => evalIn(ctx, '(() => { const words = SearchSelect.searchWords(__Q); const started = Date.now(); const found = __NAMES.filter(n => SearchSelect.foundIn(words, SearchSelect.searchKey(n))).length; return [Date.now() - started, found]; })()');
  const compact = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const expected = candidates.filter(n => compact(n).includes('colonne') && compact(n).includes('100')).length;
  const cold = run();
  const warm = run();
  check('coût : 20 000 colonnes, « colonne 100 » (' + expected + ' réponses) en moins de 600 ms à froid et 300 ms à chaud', cold[1] === expected && warm[1] === expected && cold[0] < 600 && warm[0] < 300, JSON.stringify({ expected, cold, warm }));
}

summarizeAndExit();
