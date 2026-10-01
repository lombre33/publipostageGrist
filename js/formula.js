// Moteur de calcul d'une bulle « Calcul » (demande d'Antoine du 2026-10-01 : « variables calculées », au classeur de la feuille de route « Somme et soustraction entre
// #Variables (sous-total + TVA = total) »). Un module PUR : ni DOM, ni Grist, ni I18n - il lit un texte, en fait un arbre, et l'évalue sur des valeurs déjà lues ; ce
// sont js/variables.js (lecture des variables, mise en forme) et js/variable-calc.js (fenêtre) qui le branchent. Pas de `eval` ni de `Function` : un modèle peut venir d'un
// collaborateur (js/html-sanitize.js), un calcul n'exécute jamais que ce parseur.
//
// Deux écritures du même calcul :
//  - la forme ENREGISTRÉE (attribut `formula` de la bulle, data-formula) : indépendante de la langue et de la touche de déclenchement - variables entre accolades
//    `{Facture.SousTotal}`, décimales au point, fonctions en anglais, valeurs d'une fonction séparées par « ; » : `{Facture.SousTotal}*0.2+SUM({Lignes.Prix};10)`.
//    Une variable est « Table.Colonne », ou « Table.Reference.Colonne » quand elle descend de référence en référence (la même clé que la bulle #Variable) ;
//  - la forme SAISIE (le champ de la fenêtre, le texte de la bulle) : `#Facture.SousTotal × 0,2 + somme(#Lignes.Prix ; 10)`, dans la langue de l'interface. fromDisplay
//    et toDisplay passent de l'une à l'autre, sans rien perdre : une personne qui change de langue ou de touche de déclenchement retrouve son calcul.
//
// Ce qu'un calcul sait faire : + - * / (et × ÷ −), les parenthèses, le pourcentage (`20%` vaut 0,2), des nombres et des variables ; les fonctions SUM/SOMME,
// AVERAGE/MOYENNE, MIN, MAX, COUNT/NB et ROUND/ARRONDI. Une variable d'une table liée à plusieurs lignes (règle « match » de la Boucle) vaut une LISTE de nombres, une
// par ligne, dans l'ordre de la table : `SUM({Lignes.Prix} * {Lignes.Quantite})` en fait le total. Les opérations s'appliquent ligne à ligne (un nombre seul vaut pour
// chaque ligne ; deux listes veulent la même longueur) et seules les fonctions ramènent une liste à un nombre. Une cellule vide compte pour 0 dans une opération et est
// ignorée par SUM, AVERAGE, MIN, MAX et COUNT.
const Formula = (function () {
  // Fonctions : nom enregistré -> noms saisis (français en premier, c'est celui que la fenêtre propose) et nombre de valeurs permis [min, max].
  const FUNCTIONS = {
    SUM: { fr: 'SOMME', en: 'SUM', args: [1, Infinity] },
    AVERAGE: { fr: 'MOYENNE', en: 'AVERAGE', args: [1, Infinity] },
    MIN: { fr: 'MIN', en: 'MIN', args: [1, Infinity] },
    MAX: { fr: 'MAX', en: 'MAX', args: [1, Infinity] },
    COUNT: { fr: 'NB', en: 'COUNT', args: [1, Infinity] },
    ROUND: { fr: 'ARRONDI', en: 'ROUND', args: [1, 2] },
  };
  const FUNCTION_ORDER = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND'];
  // Nom saisi (en français ou en anglais, casse libre) -> nom enregistré.
  const FUNCTION_BY_TYPED = {};
  FUNCTION_ORDER.forEach(name => { FUNCTION_BY_TYPED[FUNCTIONS[name].fr] = name; FUNCTION_BY_TYPED[FUNCTIONS[name].en] = name; });
  const MAX_DEPTH = 40; // parenthèses et fonctions imbriquées : au-delà, c'est une erreur plutôt qu'un dépassement de pile

  const KEY = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;
  const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)/;
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

  function fail(code, extra) { return Object.assign({ code }, extra); }

  // === Lecture : texte enregistré -> jetons ===
  // Retourne { tokens } ou { error }. Un jeton : { t: 'num'|'var'|'name'|'op', pos, ... } - `op` est l'un de + - * / % ( ) ;
  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '{') {
        const end = src.indexOf('}', i);
        if (end === -1) return { error: fail('unclosedBrace', { pos: i }) };
        const key = src.slice(i + 1, end).trim();
        if (!KEY.test(key)) return { error: fail('badKey', { key, pos: i }) };
        const dot = key.indexOf('.');
        tokens.push({ t: 'var', pos: i, key, table: key.slice(0, dot), column: key.slice(dot + 1) });
        i = end + 1;
        continue;
      }
      const rest = src.slice(i);
      const num = rest.match(NUMBER);
      if (num) { tokens.push({ t: 'num', pos: i, value: parseFloat(num[0]) }); i += num[0].length; continue; }
      const ident = rest.match(IDENT);
      if (ident) { tokens.push({ t: 'name', pos: i, name: ident[0] }); i += ident[0].length; continue; }
      if ('+-*/%();'.indexOf(ch) !== -1) { tokens.push({ t: 'op', pos: i, op: ch }); i += 1; continue; }
      if (ch === ',') return { error: fail('comma', { pos: i }) };
      return { error: fail('badChar', { char: ch, pos: i }) };
    }
    return { tokens };
  }

  // === Lecture : jetons -> arbre ===
  //   expr    := terme (('+'|'-') terme)*        terme := signe (('*'|'/') signe)*
  //   signe   := ('-'|'+') signe | suffixe       suffixe := primaire '%'*
  //   primaire:= nombre | {variable} | NOM '(' [expr (';' expr)*] ')' | '(' expr ')'
  // Nœuds : { t:'num', value } { t:'var', key, table, column } { t:'neg', a } { t:'pct', a } { t:'bin', op, a, b } { t:'call', name, args }.
  function parseTokens(tokens) {
    let at = 0;
    const peek = () => tokens[at];
    const isOp = (token, op) => token && token.t === 'op' && token.op === op;
    const describe = token => (token.t === 'num' ? String(token.value) : token.t === 'var' ? '{' + token.key + '}' : token.t === 'name' ? token.name : token.op);
    const unexpected = token => (token ? fail('unexpected', { token: describe(token), pos: token.pos }) : fail('unexpectedEnd'));

    function primary(depth) {
      const token = peek();
      if (!token) throw fail('unexpectedEnd');
      if (depth > MAX_DEPTH) throw fail('tooDeep');
      if (token.t === 'num') { at += 1; return { t: 'num', value: token.value }; }
      if (token.t === 'var') { at += 1; return { t: 'var', key: token.key, table: token.table, column: token.column }; }
      if (isOp(token, '(')) {
        at += 1;
        const inner = expr(depth + 1);
        if (!isOp(peek(), ')')) throw (peek() ? unexpected(peek()) : fail('unclosedParen'));
        at += 1;
        return inner;
      }
      if (token.t === 'name') {
        // Un mot seul n'est ni une variable (elle commence par la touche de déclenchement, ou s'écrit {…} une fois enregistrée) ni une fonction (elle porte ses parenthèses).
        if (!isOp(tokens[at + 1], '(')) throw fail('unknownName', { name: token.name, pos: token.pos });
        const name = FUNCTION_BY_TYPED[token.name.toUpperCase()];
        if (!name) throw fail('unknownFunction', { name: token.name, pos: token.pos });
        at += 2;
        const args = [];
        if (isOp(peek(), ')')) throw fail('badArgs', { name, min: FUNCTIONS[name].args[0], max: FUNCTIONS[name].args[1] });
        for (;;) {
          args.push(expr(depth + 1));
          if (isOp(peek(), ';')) { at += 1; continue; }
          break;
        }
        if (!isOp(peek(), ')')) throw (peek() ? unexpected(peek()) : fail('unclosedParen'));
        at += 1;
        const [min, max] = FUNCTIONS[name].args;
        if (args.length < min || args.length > max) throw fail('badArgs', { name, min, max });
        return { t: 'call', name, args };
      }
      throw unexpected(token);
    }
    function postfix(depth) {
      let node = primary(depth);
      while (isOp(peek(), '%')) { at += 1; node = { t: 'pct', a: node }; }
      return node;
    }
    function unary(depth) {
      if (isOp(peek(), '-')) { at += 1; return { t: 'neg', a: unary(depth + 1) }; }
      if (isOp(peek(), '+')) { at += 1; return unary(depth + 1); }
      return postfix(depth);
    }
    function term(depth) {
      let node = unary(depth);
      while (isOp(peek(), '*') || isOp(peek(), '/')) {
        const op = peek().op;
        at += 1;
        node = { t: 'bin', op, a: node, b: unary(depth) };
      }
      return node;
    }
    function expr(depth) {
      let node = term(depth);
      while (isOp(peek(), '+') || isOp(peek(), '-')) {
        const op = peek().op;
        at += 1;
        node = { t: 'bin', op, a: node, b: term(depth) };
      }
      return node;
    }

    try {
      const ast = expr(0);
      if (at < tokens.length) throw unexpected(tokens[at]);
      return { ast };
    } catch (e) {
      if (e && e.code) return { error: e };
      throw e;
    }
  }

  // Texte enregistré -> { ast } ou { error: { code, … } }. Un texte vide est une erreur (`empty`) : une bulle sans calcul n'a rien à montrer.
  function parse(src) {
    const text = String(src == null ? '' : src);
    if (!text.trim()) return { error: fail('empty') };
    const lexed = tokenize(text);
    if (lexed.error) return { error: lexed.error };
    return parseTokens(lexed.tokens);
  }

  // Variables d'un arbre, chacune une fois : [{ key, table, column }] dans l'ordre où elles paraissent.
  function variablesOf(ast) {
    const seen = new Map();
    (function walk(node) {
      if (node.t === 'var') { if (!seen.has(node.key)) seen.set(node.key, { key: node.key, table: node.table, column: node.column }); }
      else if (node.t === 'neg' || node.t === 'pct') walk(node.a);
      else if (node.t === 'bin') { walk(node.a); walk(node.b); }
      else if (node.t === 'call') node.args.forEach(walk);
    })(ast);
    return Array.from(seen.values());
  }

  // === Valeurs ===
  // Une valeur d'un calcul : un nombre, `null` (cellule vide) ou une LISTE de nombres/null (une valeur par ligne liée).
  // Un nombre lu dans une cellule : un vrai nombre, un booléen (1 ou 0), ou un texte qui n'est QUE un nombre (« 12,5 », « 1 234,56 ») - jamais « 12 EUR » ni « 1.234,56 »,
  // deux écritures dont le sens dépend de la langue : mieux vaut dire que ce n'est pas un nombre que de se tromper de total. { value } ou { error }.
  function toNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return { value: null };
    if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw } : { error: fail('notNumber', { text: String(raw) }) };
    if (typeof raw === 'boolean') return { value: raw ? 1 : 0 };
    if (typeof raw === 'string') {
      const compact = raw.replace(/[\s  ]/g, '');
      if (!compact) return { value: null };
      if (/^[-+−]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(compact)) return { value: Number(compact.replace('−', '-').replace(',', '.')) };
    }
    return { error: fail('notNumber', { text: String(raw) }) };
  }

  // Le bruit des nombres à virgule (0,1 + 0,2 = 0,30000000000000004) : quinze chiffres significatifs, ce que Grist et les tableurs montrent. Jamais de « -0 » : Intl l'écrirait.
  function clean(n) {
    const rounded = Number(n.toPrecision(15));
    return rounded === 0 ? 0 : rounded;
  }

  // Arrondi « à l'école » (la moitié s'éloigne de zéro : 2,5 -> 3 et -2,5 -> -3, comme ARRONDI d'un tableur), par décalage décimal de l'ÉCRITURE du nombre : 1,005 à
  // 2 décimales donne 1,01, que n * 100 (100,49999999999999) arrondirait mal.
  function roundHalfAway(x, digits) {
    const n = Math.abs(x);
    const text = String(n);
    let rounded;
    if (text.indexOf('e') === -1) rounded = Number(Math.round(Number(text + 'e' + digits)) + 'e' + (-digits));
    else rounded = Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits);
    return x < 0 ? -rounded : rounded;
  }

  // === Évaluation ===
  const isList = v => Array.isArray(v);
  const num = v => (v === null || v === undefined ? 0 : v);
  // Applique `fn` à deux valeurs, ligne à ligne quand l'une est une liste : un nombre seul vaut pour chaque ligne, deux listes veulent la même longueur.
  function zip(a, b, fn) {
    if (!isList(a) && !isList(b)) return fn(a, b);
    if (isList(a) && isList(b)) {
      if (a.length !== b.length) throw fail('lengthMismatch', { a: a.length, b: b.length });
      return a.map((x, i) => fn(x, b[i]));
    }
    return isList(a) ? a.map(x => fn(x, b)) : b.map(y => fn(a, y));
  }
  const mapList = (v, fn) => (isList(v) ? v.map(fn) : fn(v));
  // Tous les nombres d'une série de valeurs (nombres seuls et listes), sans les cellules vides.
  function numbersOf(values) {
    const out = [];
    values.forEach(v => (isList(v) ? v : [v]).forEach(x => { if (x !== null && x !== undefined) out.push(x); }));
    return out;
  }

  function callFunction(name, args) {
    if (name === 'ROUND') {
      let digits = 0;
      if (args.length > 1) {
        if (isList(args[1]) || args[1] === null || !Number.isInteger(args[1]) || args[1] < -10 || args[1] > 10) throw fail('badRound');
        digits = args[1];
      }
      return mapList(args[0], x => roundHalfAway(num(x), digits));
    }
    const all = numbersOf(args);
    if (name === 'SUM') return all.reduce((sum, x) => sum + x, 0);
    if (name === 'COUNT') return all.length;
    if (!all.length) return null;
    if (name === 'AVERAGE') return all.reduce((sum, x) => sum + x, 0) / all.length;
    if (name === 'MIN') return Math.min(...all);
    return Math.max(...all);
  }

  function evalNode(node, values) {
    switch (node.t) {
      case 'num': return node.value;
      case 'var': {
        const found = values[node.key];
        if (found === undefined) throw fail('unknownVariable', { key: node.key });
        if (found && typeof found === 'object' && !isList(found)) throw fail('variable', { key: node.key, message: found.error });
        return found;
      }
      case 'neg': return mapList(evalNode(node.a, values), x => 0 - num(x));
      case 'pct': return mapList(evalNode(node.a, values), x => num(x) / 100);
      case 'bin': {
        const a = evalNode(node.a, values);
        const b = evalNode(node.b, values);
        if (node.op === '+') return zip(a, b, (x, y) => num(x) + num(y));
        if (node.op === '-') return zip(a, b, (x, y) => num(x) - num(y));
        if (node.op === '*') return zip(a, b, (x, y) => num(x) * num(y));
        return zip(a, b, (x, y) => { if (num(y) === 0) throw fail('divZero'); return num(x) / num(y); });
      }
      default: return callFunction(node.name, node.args.map(arg => evalNode(arg, values)));
    }
  }

  // Évalue un arbre sur `values` : { [clé de variable]: nombre | null | liste | { error: texte } } (les valeurs lues, déjà converties par toNumber). Retourne { value } - un
  // nombre, ou null quand il n'y a rien à montrer (une cellule vide seule, la moyenne de rien) - ou { error: { code, … } }. Le résultat final est UN nombre : une liste de
  // plusieurs lignes est une erreur (`manyValues`), une liste d'une seule ligne vaut son nombre, une liste vide ne montre rien.
  function evaluate(ast, values) {
    try {
      let result = evalNode(ast, values || {});
      if (isList(result)) {
        if (result.length > 1) throw fail('manyValues', { count: result.length });
        result = result.length ? result[0] : null;
      }
      if (result === null || result === undefined) return { value: null };
      if (!Number.isFinite(result)) throw fail('badResult');
      return { value: clean(result) };
    } catch (e) {
      if (e && e.code) return { error: e };
      throw e;
    }
  }

  // === Écriture saisie <-> écriture enregistrée ===
  // La saisie : `spans` dit où sont les variables de `text` ([{ start, end, table, column }], dans l'ordre : js/variables.js:findTextVariables, qui connaît les colonnes du
  // document et la touche de déclenchement) ; elles deviennent {Table.Colonne}. Le reste est ramené à la forme enregistrée : × ÷ − et les décimales à virgule (« 0,2 »),
  // et les noms de fonction (français ou anglais, casse libre) à leur nom enregistré. Une faute (une virgule perdue, un mot inconnu) n'est PAS corrigée ici : le texte
  // rendu passe ensuite par parse(), qui la nomme.
  // `lang` : en anglais la virgule n'est PAS une décimale (« 1,000 » y est mille) : elle reste telle quelle, et le moteur la refuse plutôt que de lire 1.
  function plainToStored(segment, lang) {
    let out = segment.replace(/[×]/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-');
    if (lang !== 'en') out = out.replace(/(\d),(\d)/g, '$1.$2').replace(/(^|[(;+\-*/])(,)(\d)/g, '$1.$3');
    return out.replace(/([A-Za-z_][A-Za-z0-9_]*)(\s*\()/g, (all, word, open) => (FUNCTION_BY_TYPED[word.toUpperCase()] || word) + open);
  }
  function fromDisplay(text, spans, opts) {
    const lang = opts && opts.lang;
    const source = String(text == null ? '' : text);
    let out = '';
    let at = 0;
    (spans || []).slice().sort((a, b) => a.start - b.start).forEach(span => {
      if (span.start < at) return;
      out += plainToStored(source.slice(at, span.start), lang) + '{' + span.table + '.' + span.column + '}';
      at = span.end;
    });
    return (out + plainToStored(source.slice(at), lang)).trim();
  }

  // La forme enregistrée -> la saisie, `opts` : { trigger: touche de déclenchement ('#'), lang: 'fr'|'en', pretty: × ÷ − à la place de * / - (le texte d'une bulle ; le champ de
  // la fenêtre garde ce qu'on tape au clavier) }. Les espaces sont remis autour des opérateurs. Un texte que le moteur ne sait pas lire revient tel quel.
  function toDisplay(stored, opts) {
    const o = Object.assign({ trigger: '#', lang: 'fr', pretty: false }, opts);
    const lexed = tokenize(String(stored == null ? '' : stored));
    if (lexed.error) return String(stored == null ? '' : stored);
    const sym = { '*': o.pretty ? '×' : '*', '/': o.pretty ? '÷' : '/', '-': o.pretty ? '−' : '-' };
    let out = '';
    let operand = false; // le jeton précédent finit une valeur : un + ou un - qui suit est une opération, sinon un signe
    lexed.tokens.forEach(token => {
      if (token.t === 'num') {
        const text = String(token.value);
        out += o.lang === 'fr' ? text.replace('.', ',') : text;
        operand = true;
      } else if (token.t === 'var') {
        out += o.trigger + token.key;
        operand = true;
      } else if (token.t === 'name') {
        const name = FUNCTIONS[token.name.toUpperCase()];
        out += name ? name[o.lang === 'fr' ? 'fr' : 'en'] : token.name;
        operand = false;
      } else if (token.op === '(') {
        out += '(';
        operand = false;
      } else if (token.op === ')') {
        out += ')';
        operand = true;
      } else if (token.op === '%') {
        out += '%';
        operand = true;
      } else if (token.op === ';') {
        out += '; ';
        operand = false;
      } else if ((token.op === '+' || token.op === '-') && !operand) {
        out += token.op === '-' ? sym['-'] : '+';
      } else {
        out += ' ' + (sym[token.op] || token.op) + ' ';
        operand = false;
      }
    });
    return out.trim();
  }

  // Les fonctions proposées, dans la langue de l'interface : ['SOMME', 'MOYENNE', …] (l'aide de la fenêtre).
  function functionNames(lang) {
    return FUNCTION_ORDER.map(name => FUNCTIONS[name][lang === 'en' ? 'en' : 'fr']);
  }

  // Le message d'une erreur, par `t` (I18n.t : clés `formula.error.*` de js/i18n.js) - le moteur ne connaît aucune langue. `trigger` : la touche de déclenchement, dite dans
  // l'aide d'un mot inconnu.
  function errorMessage(error, t, opts) {
    const lang = opts && opts.lang;
    const trigger = (opts && opts.trigger) || '#';
    const e = error || {};
    switch (e.code) {
      case 'variable': return e.message;
      case 'unknownName': return t('formula.error.unknownName', { name: e.name, trigger });
      case 'unknownFunction': return t('formula.error.unknownFunction', { name: e.name, list: functionNames(lang).join(', ') });
      case 'badArgs': return t(e.max === Infinity ? 'formula.error.badArgsMin' : 'formula.error.badArgsRound', { name: FUNCTIONS[e.name] ? FUNCTIONS[e.name][lang === 'en' ? 'en' : 'fr'] : e.name });
      // Une variable lue par le moteur s'écrit {Table.Colonne} : la personne la connaît sous sa touche de déclenchement.
      case 'unexpected': return t('formula.error.unexpected', { token: String(e.token).replace(/^\{(.*)\}$/, trigger + '$1') });
      case 'badChar': return t('formula.error.badChar', { char: e.char });
      case 'notNumber': return t('formula.error.notNumber', { key: e.key, text: e.text });
      case 'unknownVariable': return t('formula.error.unknownVariable', { key: e.key });
      case 'unclosedBrace': return t('formula.error.unclosedBrace', { trigger });
      case 'badKey': return t('formula.error.badKey', { key: e.key, trigger });
      case 'lengthMismatch': return t('formula.error.lengthMismatch', { a: e.a, b: e.b });
      case 'manyValues': return t('formula.error.manyValues', { count: e.count });
      default: return t('formula.error.' + (e.code || 'badResult'), e);
    }
  }

  return { parse, variablesOf, evaluate, toNumber, fromDisplay, toDisplay, functionNames, errorMessage, FUNCTIONS, FUNCTION_ORDER };
})();
