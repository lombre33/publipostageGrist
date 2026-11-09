#!/usr/bin/env node
// Filet de sécurité d'une refactorisation (lot 0, demande du 06/11 : « refactoriser pour la maintenabilité et les liens futurs avec GFS ») : un fichier découpé, déplacé ou
// renommé ne doit changer NI ce que les autres fichiers peuvent appeler, NI l'ordre dans lequel ils se chargent, et rien à l'écran ne le montre. Les 120 gardes
// `typeof X !== 'undefined'` du code font même qu'un fichier oublié dans index.html ne casse rien : il éteint une fonction en silence. Ce script attrape ce silence.
//  L'API : chaque module global (`const Dom = (function () {…})()`, 218 en tout) est relevé dans le vrai widget à l'ouverture : ses clés et leur genre (fonction, donnée,
//   accesseur) ; le relevé gelé est dev-tests/api-snapshot.json. ÉCHEC si un module disparaît, si une clé disparaît ou si une clé change de genre (une fonction devenue donnée) ; une
//   clé AJOUTÉE n'échoue pas (une fonction neuve n'est pas une régression), elle est comptée à part. Le relevé se regèle volontairement : `node dev-tests/verify-api-snapshot.mjs --update`
//   (à faire juste avant de commencer une série de découpes, et après chaque ajout qu'on veut protéger).
//  LE CHARGEMENT : le widget s'ouvre sans erreur de page ; chaque `<script src>` local d'index.html existe et n'y est inscrit qu'une fois ; aucun fichier de js/ n'est orphelin (un
//   fichier découpé dont on a oublié la balise) ; aucun module n'est appelé (`Nom.méthode`) sans exister (hors le relevé des cas connus, dans le même fichier de relevé).
//  LES DÉTECTEURS EUX-MÊMES : quelques cas fabriqués (un module retiré, une clé retirée, un genre changé, un orphelin, un module inconnu) prouvent que chaque contrôle échoue quand il le doit.
// Lancé par run-headless.mjs (groupe Node « apiSnapshot », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-api-snapshot.mjs [--update]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { open, ROOT } from './load-lib.mjs';

const SNAPSHOT_FILE = join(ROOT, 'dev-tests', 'api-snapshot.json');
const KIND_LETTER = { function: 'f', data: 'd', getter: 'g' };

// ---- Ce qu'index.html charge ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Les scripts locaux, dans l'ordre : `js/dom.js?v=0.4` -> `js/dom.js`. Les moteurs d'export (`type="text/x-lazy-engine"`) y sont aussi : la page ne les charge qu'au premier export,
// mais ce sont eux que les découpes touchent le plus.
export function localScripts(indexHtml) {
  const out = [];
  const re = /<script\b[^>]*?\ssrc="([^"]+)"/g;
  let m;
  while ((m = re.exec(indexHtml))) {
    const src = m[1].split('?')[0];
    if (!/^https?:/.test(src)) out.push(src);
  }
  return out;
}

// Les fichiers des extensions (`REGISTRY` de js/extensions.js : `scripts: ['a.js', …]` par dossier), dans l'ordre : { 'extensions/diapositives/slide-strip.js', … }.
export function extensionScripts(extensionsJs) {
  const out = [];
  const re = /(?:'([\w-]+)'|(\w+)):\s*\{[^{}]*?scripts:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(extensionsJs))) {
    const folder = m[1] || m[2];
    for (const f of m[3].matchAll(/'([^']+\.js)'/g)) out.push(`extensions/${folder}/${f[1]}`);
  }
  return out;
}

// Les fichiers de js/ qu'aucun autre fichier ne nomme DANS SON CODE (un nom cité en commentaire ne charge rien) ni ne déclare index.html : un fichier découpé dont personne n'a branché la balise.
// `files` : { 'js/x.js': texte }, `indexScripts` : localScripts(index.html) et les fichiers d'extensions, `extraText` : le texte d'autres fichiers qui chargent des scripts (extensions/).
export function orphans(files, indexScripts, extraText = '') {
  const named = Object.entries(files).map(([f, text]) => [f, stripCode(text, true)]);
  return Object.keys(files).filter(f => {
    const name = basename(f);
    if (indexScripts.some(s => basename(s) === name)) return false;
    if (extraText && stripCode(extraText, true).includes(name)) return false;
    return !named.some(([other, text]) => other !== f && text.includes(name));
  });
}

// ---- Lire le code sans ses commentaires ni ses chaînes ---------------------------------------------------------------------------------------------------------------------------------------
// Une machine à états assez bonne pour des noms de modules (pas un analyseur) : les commentaires et les chaînes disparaissent, les expressions `${…}` d'un gabarit restent.
// `keepStrings` : les chaînes restent (pour chercher un nom de fichier qu'un script charge), les commentaires disparaissent toujours.
export function stripCode(src, keepStrings = false) {
  let out = '';
  let i = 0;
  const n = src.length;
  const stack = []; // accolades ouvertes dans un `${…}` de gabarit : au retour de la dernière, on reprend le texte du gabarit
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") {
      const from = ++i;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; }
      out += keepStrings ? ' ' + src.slice(from, i) + ' ' : ' ';
      i++; continue;
    }
    if (c === '`') {
      const from = ++i;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { stack.push(0); if (keepStrings) out += ' ' + src.slice(from, i) + ' '; i += 2; out += ' '; break; }
        i++;
      }
      if (keepStrings && src[i] === '`') out += ' ' + src.slice(from, i) + ' ';
      if (src[i] === '`') { i++; out += ' '; }
      continue;
    }
    if (stack.length) {
      if (c === '{') stack[stack.length - 1]++;
      else if (c === '}') {
        if (stack[stack.length - 1] === 0) {
          stack.pop(); i++;
          // retour dans le texte du gabarit
          while (i < n && src[i] !== '`') {
            if (src[i] === '\\') { i += 2; continue; }
            if (src[i] === '$' && src[i + 1] === '{') { stack.push(0); i += 2; break; }
            i++;
          }
          if (src[i] === '`') i++;
          out += ' '; continue;
        }
        stack[stack.length - 1]--;
      }
    }
    out += c; i++;
  }
  return out;
}

// Les tables de textes de l'interface (js/i18n-texts-<domaine>.js) : des données, hors du relevé de l'API.
export const isTextTable = file => /^js\/i18n-texts-[a-z]+\.js$/.test(file);

// Les modules globaux d'un fichier : `const Nom = …` / `let` / `var` / `class Nom` à la marge (colonne 0), nom en capitales de tête.
export function declaredGlobals(src) {
  const names = [];
  const re = /^(?:const|let|var|class)\s+([A-Z][A-Za-z0-9_]*)\b/gm;
  let m;
  while ((m = re.exec(src))) names.push(m[1]);
  return names;
}

// Les `Nom.méthode` d'un fichier dont `Nom` n'est pas déclaré dans le même fichier (variable locale, paramètre de même nom : un faux positif de moins) ni un nom courant du navigateur ;
// c'est la liste à confronter aux modules qui existent vraiment.
export function calledModules(src) {
  const code = stripCode(src);
  const local = new Set();
  const decl = /\b(?:const|let|var|function|class)\s+([A-Z][A-Za-z0-9_]*)\b/g;
  let m;
  while ((m = decl.exec(code))) local.add(m[1]);
  // paramètres et déstructurations en capitales : `(Name, …) =>`, `function (Name)`
  const params = /[(,]\s*([A-Z][A-Za-z0-9_]*)\s*(?=[,)=])/g;
  while ((m = params.exec(code))) local.add(m[1]);
  const called = new Set();
  const use = /(?<![\w$.])([A-Z][A-Za-z0-9_]*)\.(?=[A-Za-z_$])/g;
  while ((m = use.exec(code))) if (!local.has(m[1])) called.add(m[1]);
  return called;
}

// ---- Comparer deux relevés -------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Un relevé : { Module: 'clé:f clé2:d …' | 'data' } (clés triées, genre en une lettre). Rend { removedModules, removedKeys, changedKinds, addedModules, addedKeys }.
const parseKeys = text => {
  const map = new Map();
  if (!text || text === 'data') return map;
  for (const part of text.split(' ')) {
    const at = part.lastIndexOf(':');
    map.set(part.slice(0, at), part.slice(at + 1));
  }
  return map;
};
export function compareSnapshots(frozen, live) {
  const diff = { removedModules: [], removedKeys: [], changedKinds: [], addedModules: [], addedKeys: [] };
  for (const mod of Object.keys(frozen)) {
    if (!(mod in live)) { diff.removedModules.push(mod); continue; }
    const before = parseKeys(frozen[mod]);
    const after = parseKeys(live[mod]);
    for (const [key, kind] of before) {
      if (!after.has(key)) diff.removedKeys.push(`${mod}.${key}`);
      else if (after.get(key) !== kind) diff.changedKinds.push(`${mod}.${key} (${kind} -> ${after.get(key)})`);
    }
    for (const key of after.keys()) if (!before.has(key)) diff.addedKeys.push(`${mod}.${key}`);
  }
  for (const mod of Object.keys(live)) if (!(mod in frozen)) diff.addedModules.push(mod);
  return diff;
}

// ---- Les essais ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); };
const report = () => {
  for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'ECHEC'} ${r.name}${r.ok || !r.detail ? '' : '\n        ' + String(r.detail).split('\n').join('\n        ')}`);
  const pass = results.filter(r => r.ok).length;
  console.log(`${pass}/${results.length} passés`);
  process.exit(pass === results.length ? 0 : 1);
};

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (!isMain) { /* importé par un autre essai : seules les fonctions ci-dessus servent */ } else {
  const update = process.argv.includes('--update');
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const scripts = localScripts(indexHtml);
  const extScripts = extensionScripts(readFileSync(join(ROOT, 'js', 'extensions.js'), 'utf8'));
  const files = {};
  for (const f of readdirSync(join(ROOT, 'js'))) if (f.endsWith('.js')) files['js/' + f] = readFileSync(join(ROOT, 'js', f), 'utf8');
  for (const dir of readdirSync(join(ROOT, 'extensions'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of readdirSync(join(ROOT, 'extensions', dir.name))) if (f.endsWith('.js')) files[`extensions/${dir.name}/${f}`] = readFileSync(join(ROOT, 'extensions', dir.name, f), 'utf8');
  }

  // 1. index.html : chaque script local existe, une seule fois.
  const missing = [...scripts, ...extScripts].filter(s => !existsSync(join(ROOT, s)));
  check('index.html et js/extensions.js : chaque fichier nommé existe', missing.length === 0, missing.join('\n'));
  const seen = new Set();
  const twice = scripts.filter(s => (seen.has(s) ? true : (seen.add(s), false)));
  check('index.html : aucun script local inscrit deux fois', twice.length === 0, twice.join('\n'));

  // 2. Aucun fichier de js/ orphelin.
  const orphanList = orphans(Object.fromEntries(Object.entries(files).filter(([f]) => f.startsWith('js/'))), [...scripts, ...extScripts], Object.entries(files).filter(([f]) => f.startsWith('extensions/')).map(([, t]) => t).join('\n'));
  check('js/ : aucun fichier que personne ne charge ni ne nomme (balise oubliée après une découpe)', orphanList.length === 0, orphanList.join('\n'));

  // 3. Le widget s'ouvre ; le relevé de l'API.
  // Un script oublié ou un ordre de chargement cassé empêche souvent le widget d'être prêt : on le dit au bout d'une minute, avec les erreurs de la page, au lieu d'attendre les trois minutes de load-lib.
  const early = [];
  const opening = open({ port: Number(process.env.API_SNAPSHOT_PORT || 9214), onPage: page => {
    page.on('pageerror', e => early.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') early.push('console.error: ' + m.text()); });
  } });
  opening.catch(() => {});
  const w = await Promise.race([opening, new Promise(done => setTimeout(() => done(null), 60000))]);
  if (!w) {
    check('widget : s\'ouvre (prêt en moins d\'une minute)', false, early.filter(e => !/Failed to load resource|net::ERR|favicon/i.test(e)).slice(0, 8).join('\n') || 'aucune erreur de page, mais « Widget prêt. » n\'est jamais venu');
    report();
  }
  // Ce que la page ne charge qu'au besoin (les moteurs d'export, les extensions de GFS) est chargé ici de force : un module découpé dans pdf-export.js ou slide-strip.js doit être relevé aussi.
  await w.page.evaluate(() => Promise.all([ExportEngines.loadAll(), VersionsStore.loadWindow(), VersionsStore.loadCompare()]));
  const extErrors = await w.page.evaluate(async list => {
    const failed = [];
    for (const src of list) {
      await new Promise(done => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.onload = () => done();
        tag.onerror = () => { failed.push(src); done(); };
        document.head.appendChild(tag);
      });
    }
    return failed;
  }, extScripts);
  await new Promise(r => setTimeout(r, 500));
  check('extensions : chaque fichier de js/extensions.js se charge', extErrors.length === 0, extErrors.join('\n'));
  const loaded = [...scripts, ...extScripts].filter(s => files[s] !== undefined);
  const declared = new Set();
  // Les tables de textes (js/i18n-texts-*.js) ne sont pas une API : des milliers de clés { fr, en } qui gonfleraient le relevé ; les gardes d'i18n (codeHygiene, section 1) lisent leurs clés.
  for (const s of loaded) if (!isTextTable(s)) for (const name of declaredGlobals(files[s])) declared.add(name);
  const live = await w.page.evaluate(names => {
    const g = (0, eval);
    const hidden = new Set(['length', 'name', 'prototype', 'caller', 'arguments']);
    const out = {};
    for (const name of names) {
      let value;
      try { value = g(`typeof ${name} === 'undefined' ? undefined : ${name}`); } catch (e) { value = undefined; }
      if (value === undefined) continue;
      if (value === null || (typeof value !== 'object' && typeof value !== 'function')) { out[name] = 'data'; continue; }
      const parts = [];
      for (const key of Object.getOwnPropertyNames(value)) {
        if (typeof value === 'function' && hidden.has(key)) continue;
        const d = Object.getOwnPropertyDescriptor(value, key);
        const kind = d.get || d.set ? 'g' : (typeof d.value === 'function' ? 'f' : 'd');
        parts.push(`${key}:${kind}`);
      }
      parts.sort();
      out[name] = parts.length ? parts.join(' ') : 'data';
    }
    return out;
  }, [...declared].sort());
  const pageErrors = w.errors.filter(e => !/Failed to load resource|net::ERR|favicon/i.test(e));
  check('widget : s\'ouvre sans erreur de page', pageErrors.length === 0, pageErrors.slice(0, 8).join('\n'));

  // 4. Les modules appelés qui n'existent pas.
  const allKnown = await w.page.evaluate(names => {
    const g = (0, eval);
    const known = {};
    for (const name of names) { try { known[name] = g(`typeof ${name} !== 'undefined'`); } catch (e) { known[name] = false; } }
    return known;
  }, [...new Set(loaded.flatMap(s => [...calledModules(files[s])]))].sort());
  const unresolved = {};
  for (const s of loaded) for (const name of calledModules(files[s])) if (!allKnown[name]) (unresolved[name] = unresolved[name] || new Set()).add(s);
  const unresolvedNames = Object.keys(unresolved).sort();
  await w.close();

  if (update) {
    const frozen = { _comment: 'Relevé de l\'API des modules globaux (dev-tests/verify-api-snapshot.mjs --update). modules : clés triées « nom:genre » (f fonction, d donnée, g accesseur). connus : appels `Nom.x` dont Nom n\'existe pas dans la page de test, déjà là au gel.', modules: live, connus: unresolvedNames };
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(frozen, null, 0).replace(/,"([A-Za-z0-9_]+)":/g, ',\n"$1":').replace('"modules":{', '"modules":{\n').replace('},"connus"', '\n},\n"connus"') + '\n');
    console.log(`Relevé regelé : ${Object.keys(live).length} modules, ${unresolvedNames.length} noms connus non résolus.`);
    process.exit(0);
  }

  if (!existsSync(SNAPSHOT_FILE)) {
    check('relevé gelé présent (dev-tests/api-snapshot.json)', false, 'le créer : node dev-tests/verify-api-snapshot.mjs --update');
    report();
  }
  const frozen = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
  const diff = compareSnapshots(frozen.modules, live);
  check('API : aucun module global n\'a disparu', diff.removedModules.length === 0, diff.removedModules.join('\n'));
  check('API : aucune clé de module n\'a disparu', diff.removedKeys.length === 0, diff.removedKeys.slice(0, 40).join('\n'));
  check('API : aucune clé n\'a changé de genre (fonction / donnée / accesseur)', diff.changedKinds.length === 0, diff.changedKinds.slice(0, 40).join('\n'));
  const newUnresolved = unresolvedNames.filter(n => !frozen.connus.includes(n));
  check('appels : aucun `Nom.méthode` sur un module qui n\'existe pas (hors les cas connus du relevé)', newUnresolved.length === 0, newUnresolved.map(n => `${n} (dans ${[...unresolved[n]].join(', ')})`).join('\n'));
  console.log(`  ... ${Object.keys(live).length} modules relevés ; ajoutés depuis le gel (informatif) : ${diff.addedModules.length} modules, ${diff.addedKeys.length} clés${diff.addedKeys.length || diff.addedModules.length ? ' (--update pour les geler)' : ''}`);

  // 5. Les détecteurs échouent quand ils le doivent.
  const base = { A: 'run:f size:d', B: 'go:f' };
  check('détecteur : un module retiré est vu', compareSnapshots(base, { A: base.A }).removedModules.join() === 'B');
  check('détecteur : une clé retirée est vue', compareSnapshots(base, { A: 'run:f', B: base.B }).removedKeys.join() === 'A.size');
  check('détecteur : une fonction devenue donnée est vue', compareSnapshots(base, { A: 'run:d size:d', B: base.B }).changedKinds.length === 1);
  check('détecteur : une clé ajoutée n\'échoue pas', (() => { const d = compareSnapshots(base, { A: 'extra:f run:f size:d', B: base.B, C: 'x:f' }); return d.removedKeys.length + d.changedKinds.length + d.removedModules.length === 0 && d.addedKeys.join() === 'A.extra' && d.addedModules.join() === 'C'; })());
  check('détecteur : un fichier que personne ne nomme est un orphelin', orphans({ 'js/a.js': 'A.run(); load(\'js/d.js\')', 'js/b-part.js': 'x', 'js/c.js': '// voir b-part.js', 'js/d.js': 'y' }, ['js/a.js']).join() === 'js/b-part.js,js/c.js');
  check('détecteur : un appel sur un module inconnu est relevé, pas une variable locale', (() => { const c = calledModules('const Local = {}; Local.a(); Ghost.run(); // Fake.x\nconst s = "Str.y";'); return c.has('Ghost') && !c.has('Local') && !c.has('Fake') && !c.has('Str'); })());
  check('détecteur : les fichiers d\'une extension sont lus dans js/extensions.js', extensionScripts("a: { scripts: ['x.js', 'y.js'], styles: [] }, 'lecture-pdf': { nameKey: 'k', scripts: ['z.js'] }").join() === 'extensions/a/x.js,extensions/a/y.js,extensions/lecture-pdf/z.js');
  check('détecteur : une table de textes (js/i18n-texts-*.js) n\'est pas un module du relevé, un autre fichier de js/ l\'est', isTextTable('js/i18n-texts-export.js') && !isTextTable('js/i18n.js') && !isTextTable('js/export-menu.js'), null);
  check('détecteur : les modules déclarés à la marge sont relevés', declaredGlobals('const Alpha = (function () {})();\n  const inner = 1;\nclass Beta {}\nlet Gamma;').join() === 'Alpha,Beta,Gamma');
  report();
}
