#!/usr/bin/env node
// Relevé et vérification des empreintes du code de l'ÉDITEUR que le widget charge depuis esm.sh (TipTap, ProseMirror et leurs dépendances : une centaine de fichiers).
//
// Pourquoi : ce code s'exécute dans la page avec l'accès complet au document, et le navigateur ne le contrôle par aucune empreinte (la politique de sécurité du contenu ne cite que l'hôte `esm.sh`, la
// carte d'importation de index.html ne porte pas de `integrity`). Hébergé chez nous : refusé (choix d'Antoine du 05/10). Ce qu'on peut faire sans rien changer au chargement, c'est SAVOIR :
//   --ecrire    parcourt tout ce que la carte d'importation fait charger (les modules et, de proche en proche, tous ceux qu'ils importent), à la manière du navigateur, avec trois navigateurs
//               (Chrome, Firefox, Safari), et écrit outils/empreintes-editeur.json : l'adresse de chaque fichier, son empreinte SHA-384 (celle d'un attribut `integrity`) et sa taille ;
//   --verifier  refait le même parcours et le compare au relevé : code 1 si un fichier figé chez esm.sh a changé d'octets, s'il en manque ou s'il en vient un nouveau, si les trois navigateurs ne
//               reçoivent pas les mêmes octets (un serveur qui change de réponse selon le navigateur est le signe d'une compromission), ou si une adresse du parcours porte une version FLOTTANTE
//               (`@^1.0.0`, `@~2`, `@latest` : esm.sh la résout à chaque demande, une nouvelle version publiée, ou volée, serait chargée par le widget le jour même) ; code 2 si seuls les quelques
//               fichiers d'esm.sh qui ne sont pas figés chez eux (leurs cales `node/*.mjs`, un jour de cache) ont changé ;
//   --dire      parcourt et affiche, sans lire ni écrire le relevé.
// Le relevé est gardé hors ligne par dev-tests/verify-code-hygiene.mjs : la carte d'importation ne peut plus changer sans que le relevé soit refait, et le relevé ne contient aucune version flottante.
// Une alerte se lit « le code que le widget charge n'est plus celui que j'ai relevé » : voir la fiche de crise de SECURITY.md (couper la source, retirer le module de la carte, republier).
//
// Lancer : node outils/empreintes-editeur.mjs --verifier   (réseau nécessaire : esm.sh)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = join(ROOT, 'outils', 'empreintes-editeur.json');
export const ORIGIN = 'https://esm.sh';

// Trois navigateurs : le serveur varie sa réponse selon l'en-tête User-Agent (vary: User-Agent) ; les octets doivent pourtant être les mêmes.
export const BROWSERS = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
};

// La partie de la carte d'importation qui touche esm.sh : les adresses qu'elle fait charger (valeurs) et celles qu'elle remplace (clés). Le reste (les modules du kit de GFS) change avec son
// propre sous-module et ne concerne pas ce relevé.
export function esmImports(html, origin = ORIGIN) {
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('carte d\'importation introuvable dans index.html');
  const all = JSON.parse(match[1]).imports;
  const mine = {};
  for (const key of Object.keys(all).sort()) if (key.startsWith(origin + '/') || all[key].startsWith(origin + '/')) mine[key] = all[key];
  return mine;
}

// Une empreinte de la carte : quand elle change, le relevé est à refaire.
export function importMapDigest(imports) {
  return createHash('sha256').update(JSON.stringify(Object.entries(imports).sort(([a], [b]) => (a < b ? -1 : 1))), 'utf8').digest('hex');
}

// Ce que fait le navigateur d'un spécificateur : l'adresse absolue, puis la carte d'importation si elle la remplace (même mécanisme que « prosemirror-state@^1.0.0 » → version figée).
export function resolveSpecifier(specifier, from, imports, origin = ORIGIN) {
  let address;
  if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) address = specifier;
  else if (specifier.startsWith('/') || specifier.startsWith('./') || specifier.startsWith('../')) address = new URL(specifier, from).href;
  else address = imports[specifier] || null;
  if (!address) return null;
  address = new URL(address).href;
  return imports[address] ? new URL(imports[address]).href : address;
}

const IMPORT_RE = /(?:\bimport\s*(?:[\w*{}\s,$]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;
export function specifiersOf(source) {
  return [...source.matchAll(IMPORT_RE)].map(m => m[1]);
}

// Une version écrite `@1.8.0` (ou `@1.8.0-beta.2`) est figée ; tout le reste (`@^1.0.0`, `@~2.1`, `@1`, `@latest`, `@*`) est résolu par esm.sh à chaque demande.
export function floatingVersion(address) {
  let path;
  try { path = new URL(address).pathname; } catch (e) { return null; } // un nom nu de la carte (« @tiptap/core ») n'est pas une adresse
  for (const raw of path.split('/')) {
    const segment = raw.replace(/^\*/, '');
    const at = segment.lastIndexOf('@');
    if (at <= 0) continue; // pas de version, ou « @scope » d'un paquet à portée (`@tiptap/core@3.31.3` : le `@` de `@tiptap` ouvre le segment)
    const version = segment.slice(at + 1);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) return `@${version}`;
  }
  return null;
}

const sri = bytes => 'sha384-' + createHash('sha384').update(bytes).digest('base64');
const FROZEN = /\bimmutable\b/;

// Le parcours : largeur d'abord, un navigateur à la fois. `fetchFn(address, userAgent)` rend { status, bytes (Buffer), cacheControl } ; il est injecté pour que l'essai hors ligne joue un faux serveur.
export async function crawl({ imports, fetchFn, browsers = BROWSERS, concurrency = 8, origin = ORIGIN, onProgress = () => {} }) {
  const roots = [...new Set(Object.values(imports).filter(v => v.startsWith(origin + '/')))].sort();
  const perBrowser = {};
  const problems = [];
  for (const [name, userAgent] of Object.entries(browsers)) {
    const files = new Map();
    let level = roots.slice();
    const queued = new Set(level);
    while (level.length) {
      const next = [];
      for (let i = 0; i < level.length; i += concurrency) {
        const batch = level.slice(i, i + concurrency);
        const got = await Promise.all(batch.map(async address => ({ address, response: await fetchFn(address, userAgent) })));
        for (const { address, response } of got) {
          const entry = { status: response.status, bytes: response.bytes.length, sri: sri(response.bytes), frozen: FROZEN.test(response.cacheControl || '') };
          files.set(address, entry);
          onProgress(name, address, entry);
          if (response.status !== 200) continue;
          for (const specifier of specifiersOf(response.bytes.toString('utf8'))) {
            const target = resolveSpecifier(specifier, address, imports, origin);
            if (!target) { problems.push({ kind: 'unresolved', browser: name, from: address, specifier }); continue; }
            if (!target.startsWith(origin + '/')) { problems.push({ kind: 'foreign', browser: name, from: address, specifier: target }); continue; }
            if (!queued.has(target)) { queued.add(target); next.push(target); }
          }
        }
      }
      level = next;
    }
    perBrowser[name] = files;
  }
  return { roots, perBrowser, problems };
}

// Les trois navigateurs doivent recevoir les mêmes fichiers, aux mêmes octets : on retient celui du premier, et on note tout écart.
export function consolidate({ perBrowser }) {
  const names = Object.keys(perBrowser);
  const [first, ...others] = names;
  const files = {};
  const divergences = [];
  for (const [address, entry] of perBrowser[first]) files[address] = entry;
  for (const name of others) {
    for (const [address, entry] of perBrowser[name]) {
      const base = perBrowser[first].get(address);
      if (!base) divergences.push(`${address} : demandé par ${name}, pas par ${first}`);
      else if (base.sri !== entry.sri || base.status !== entry.status) divergences.push(`${address} : octets différents pour ${name} et pour ${first}`);
    }
    for (const address of perBrowser[first].keys()) if (!perBrowser[name].has(address)) divergences.push(`${address} : demandé par ${first}, pas par ${name}`);
  }
  return { files, divergences };
}

export function buildManifest({ imports, consolidated, browsers = Object.keys(BROWSERS), origin = ORIGIN }) {
  const fichiers = {};
  for (const address of Object.keys(consolidated.files).sort()) {
    const e = consolidated.files[address];
    fichiers[address] = e.status === 200 ? { sri: e.sri, octets: e.bytes, fige: e.frozen } : { statut: e.status };
  }
  return {
    lisezMoi: 'Relevé produit par outils/empreintes-editeur.mjs --ecrire : ne pas modifier à la main. Une adresse, l\'empreinte SHA-384 de ses octets (celle d\'un attribut integrity), sa taille, et « fige » quand esm.sh la sert avec un cache immuable d\'un an.',
    origine: origin,
    navigateurs: browsers,
    carteImportEsmSha256: importMapDigest(imports),
    fichiers,
  };
}

// Le relevé contre un parcours frais. `hard` : un fichier figé a changé, un fichier manque ou vient en plus, les navigateurs divergent, une version flotte. `soft` : seuls des fichiers non figés ont changé.
export function compare(manifest, consolidated, divergences = []) {
  const hard = [];
  const soft = [];
  const known = manifest.fichiers;
  for (const [address, now] of Object.entries(consolidated.files)) {
    const then = known[address];
    const nowKey = now.status === 200 ? now.sri : `statut ${now.status}`;
    if (!then) { hard.push(`nouveau fichier chargé, absent du relevé : ${address}`); continue; }
    const thenKey = then.sri || `statut ${then.statut}`;
    if (thenKey !== nowKey) (then.fige ? hard : soft).push(`${then.fige ? 'fichier figé' : 'fichier non figé'} modifié : ${address}`);
  }
  for (const address of Object.keys(known)) if (!consolidated.files[address]) hard.push(`fichier du relevé qui n'est plus chargé : ${address}`);
  for (const address of Object.keys(consolidated.files)) { const flottante = floatingVersion(address); if (flottante) hard.push(`version flottante ${flottante} dans le parcours : ${address}`); }
  for (const line of divergences) hard.push(`les navigateurs divergent : ${line}`);
  return { hard, soft };
}

async function liveFetch(address, userAgent) {
  const response = await fetch(address, { headers: { 'user-agent': userAgent } });
  return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()), cacheControl: response.headers.get('cache-control') || '' };
}

async function main() {
  const mode = process.argv[2];
  if (!['--ecrire', '--verifier', '--dire'].includes(mode)) {
    console.error('Usage : node outils/empreintes-editeur.mjs --ecrire | --verifier | --dire');
    process.exit(64);
  }
  const imports = esmImports(readFileSync(join(ROOT, 'index.html'), 'utf8'));
  const result = await crawl({ imports, fetchFn: liveFetch });
  const consolidated = consolidate(result);
  const flat = Object.keys(consolidated.files);
  const total = flat.reduce((n, a) => n + consolidated.files[a].bytes, 0);
  console.log(`${flat.length} fichiers, ${total} octets, ${Object.keys(BROWSERS).length} navigateurs ; ${consolidated.divergences.length} divergence(s) ; ${result.problems.length} specificateur(s) hors parcours`);
  for (const p of result.problems) console.log(`  hors parcours (${p.kind}) : ${p.specifier} dans ${p.from}`);
  if (mode === '--dire') { for (const a of flat) console.log(`  ${consolidated.files[a].status} ${a}`); return; }
  if (mode === '--ecrire') {
    const manifest = buildManifest({ imports, consolidated });
    const floating = flat.filter(floatingVersion);
    if (consolidated.divergences.length || floating.length) {
      console.error('Relevé non écrit :');
      for (const d of consolidated.divergences) console.error(`  les navigateurs divergent : ${d}`);
      for (const a of floating) console.error(`  version flottante ${floatingVersion(a)} : ${a} (à figer dans la carte d'importation de index.html, avec une entrée qui renvoie vers la version exacte)`);
      process.exit(1);
    }
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    console.log('Relevé écrit : outils/empreintes-editeur.json');
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const { hard, soft } = compare(manifest, consolidated, consolidated.divergences);
  if (manifest.carteImportEsmSha256 !== importMapDigest(imports)) hard.push('la carte d\'importation de index.html n\'est plus celle du relevé : le refaire (--ecrire)');
  for (const line of hard) console.log('  ECART : ' + line);
  for (const line of soft) console.log('  à regarder : ' + line);
  if (hard.length) { console.log('Le code que le widget charge n\'est PLUS celui du relevé.'); process.exit(1); }
  if (soft.length) { console.log('Seuls des fichiers non figés chez esm.sh ont changé.'); process.exit(2); }
  console.log('Le code de l\'éditeur est celui du relevé, octet pour octet.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
