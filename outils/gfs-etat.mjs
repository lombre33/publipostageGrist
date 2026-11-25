#!/usr/bin/env node
// Les MESURES de GFS-ETAT.md : ce que le code de l'app dit d'elle-même à GFS, écrit par un script d'après les fichiers que git suit, et non à la main (23/11, « page courte et journal »).
//
// Pourquoi : GFS lit cette page pour savoir ce que l'app appelle, écrit et charge. Ces faits (noms d'hôte, clés `pp_*`, tables, politique de contenu, poids des extensions) se comptent dans le code ;
// les écrire à la main, comme la page le faisait, coûtait une longue vérification à chaque mise à jour et laissait un nombre se périmer (la ligne S4 de la section Sécurité disait cinq empreintes quand `index.html` en avait six).
//
//   node outils/gfs-etat.mjs              écrit les mesures sur la sortie
//   node outils/gfs-etat.mjs --ecrire     réécrit, dans GFS-ETAT.md, le bloc entre les deux repères « mesures » (la section « Mesures du dépôt »)
//   node outils/gfs-etat.mjs --verifier   code 1 si le bloc de GFS-ETAT.md n'est plus celui que ces mesures donnent, ou si la ligne S4 dit un autre nombre d'empreintes que `script-src`
//
// Les définitions sont celles des mises à jour d'avant de la page, pour que les nombres se comparent : le code servi est `index.html`, `nouveautes.html`, `js/*.js`, `css/*.css` et les `.js`, `.html` et
// `.css` de `extensions/` ; un nom d'hôte est ce qui suit `http://` ou `https://` (sans le point d'une fin de phrase) ; un appel à Grist est `grist.<nom>(` ; un mot de stockage est `localStorage`,
// `sessionStorage` ou `indexedDB`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE = join(ROOT, 'GFS-ETAT.md');
export const START = '<!-- mesures : début (écrit par outils/gfs-etat.mjs d\'après les fichiers que git suit ; ne pas le modifier à la main) -->';
export const END = '<!-- mesures : fin -->';
const SERVED = /^(index\.html|nouveautes\.html|js\/.*\.js|extensions\/.*\.(js|html|css)|css\/.*\.css)$/;
const GRIST_CALL = /\bgrist\.[A-Za-z]+(?:\.[A-Za-z]+)*\(/g;

const read = path => readFileSync(join(ROOT, path), 'utf8');
const tracked = () => execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean);
const sorted = set => [...set].sort();
const count = (text, pattern) => (text.match(pattern) || []).length;

// La politique de contenu d'index.html : directive → sources.
function contentPolicy(html) {
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/s.exec(html);
  if (!meta) throw new Error('index.html : pas de balise de politique de contenu');
  const out = {};
  for (const directive of meta[1].replace(/\s+/g, ' ').split(';').map(x => x.trim()).filter(Boolean)) {
    const [name, ...sources] = directive.split(' ');
    out[name] = sources;
  }
  return out;
}

// Les empreintes sha256 des scripts en ligne (sans `src`), écrites comme la politique les écrit.
function inlineHashes(html) {
  const out = new Set();
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(m[1])) continue;
    out.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  return out;
}

// Les tables et les colonnes du registre de js/schema-columns.js : [{ id, columns: [[nom, ancien nom]] }].
function registry(text) {
  const start = text.indexOf('const TABLES = [');
  const end = text.indexOf('\n  ];', start);
  if (start < 0 || end < 0) throw new Error('js/schema-columns.js : le registre `const TABLES = [` est introuvable');
  const tables = [];
  for (const line of text.slice(start, end).split('\n')) {
    let m = /^\s+id: '(\w+)',\s*$/.exec(line);
    if (m) { tables.push({ id: m[1], columns: [] }); continue; }
    m = /^\s+\['(\w+)', '(\w+)'(?:, '(?:[^'\\]|\\.)*')?\],?\s*$/.exec(line);
    if (m && tables.length) tables[tables.length - 1].columns.push([m[1], m[2]]);
  }
  return tables;
}

export function measure() {
  const files = tracked().filter(f => SERVED.test(f));
  const sets = { hosts: new Set(), pp: new Set(), gfslink: new Set(), tables: new Set(), gfsword: new Set(), calls: new Set() };
  const counts = { fetch: {}, post: {}, calls: {}, storage: {} };
  const bump = (key, file, n) => { if (n) counts[key][file] = n; };
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) sets.hosts.add(m[1].replace(/\.$/, ''));
    for (const m of text.matchAll(/pp_[a-z0-9_]+/g)) sets.pp.add(m[0]);
    for (const m of text.matchAll(/GfsLink\.([A-Za-z]+)/g)) sets.gfslink.add(m[1]);
    for (const m of text.matchAll(/Publipostage_[A-Za-z_]+/g)) sets.tables.add(m[0]);
    for (const m of text.matchAll(/\bGFS_[A-Z_]+\b/g)) sets.gfsword.add(m[0]);
    for (const m of text.matchAll(GRIST_CALL)) sets.calls.add(m[0]);
    bump('fetch', file, count(text, /\bfetch\(/g));
    bump('post', file, count(text, /postMessage/g));
    bump('calls', file, count(text, GRIST_CALL));
    bump('storage', file, count(text, /localStorage|sessionStorage|indexedDB/g));
  }
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const where = o => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)).map(([f, n]) => `${f} ${n}`).join(', ');

  const html = read('index.html');
  const policy = contentPolicy(html);
  const script = policy['script-src'] || [];
  const hashes = script.filter(s => s.startsWith("'sha256-"));
  const inline = inlineHashes(html);
  const strangers = hashes.filter(h => !inline.has(h));
  // La carte d'importation : une seule balise `<script type="importmap">` (depuis la consigne 107 de GFS, l'éditeur n'a plus de carte de CDN), dont les entrées vont à la copie de l'éditeur ou au kit.
  const importMap = (html.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1];
  const imports = importMap ? Object.values(JSON.parse(importMap).imports || {}) : [];
  const cards = { total: imports.length, editeur: imports.filter(a => a.startsWith('./vendor/editeur/')).length, kit: imports.filter(a => a.startsWith('./kit/')).length };

  const exts = {};
  for (const f of tracked().filter(f => f.startsWith('extensions/'))) {
    const name = f.split('/')[1];
    exts[name] ||= { files: 0, bytes: 0 };
    exts[name].files += 1;
    exts[name].bytes += statSync(join(ROOT, f)).size;
  }
  // La liste des noms que rend `GristAPI` : le premier nom peut changer (`rowsOf, init, ...` depuis le 25/11), la forme `return { a, b, ... };` ferme le fichier.
  const api = /\n  return \{ ([A-Za-z_$][\w$]*, .*?) \};\n\}\)\(\);/s.exec(read('js/grist-api.js'));
  const reg = registry(read('js/schema-columns.js'));
  const docs = reg.find(t => t.id === 'Publipostage_Templates');

  const lines = [
    `- fichiers servis · ${files.length} · index.html, nouveautes.html, js/, css/ et extensions/`,
    `- noms d'hôte écrits dans le code servi · ${sets.hosts.size} · ${sorted(sets.hosts).join(', ')}`,
    `- clés \`pp_*\` · ${sets.pp.size} · ${sorted(sets.pp).join(', ')}`,
    `- tables \`Publipostage_*\` · ${sets.tables.size} · ${sorted(sets.tables).join(', ')}`,
    `- noms \`GfsLink.*\` · ${sets.gfslink.size} · ${sorted(sets.gfslink).join(', ')}`,
    `- mots \`GFS_*\` · ${sets.gfsword.size} · ${sorted(sets.gfsword).join(', ')}`,
    `- \`fetch(\` · ${sum(counts.fetch)} · ${where(counts.fetch)}`,
    `- \`postMessage\` · ${sum(counts.post)} · ${where(counts.post)}`,
    `- appels \`grist.*\` · ${sum(counts.calls)} appels de ${sets.calls.size} noms · ${where(counts.calls)}`,
    `- mots de stockage du navigateur · ${sum(counts.storage)} · ${where(counts.storage)}`,
    `- politique de contenu d'\`index.html\` · ${Object.keys(policy).length} directives · ${Object.keys(policy).join(', ')} ; \`script-src\` : ${script.length} sources dont ${hashes.length} empreintes \`sha256-\`, ` +
      `${strangers.length ? `dont ${strangers.length} qui ne sont celles d'aucun script en ligne` : 'toutes celles de scripts en ligne d\'`index.html`'}`,
    `- carte d'importation d'\`index.html\` · ${cards.total} entrées : ${cards.editeur} vers la copie de l'éditeur (\`vendor/editeur\`), ${cards.kit} vers le kit`,
    `- extensions · ${Object.keys(exts).length} · ${Object.entries(exts).sort(([a], [b]) => (a < b ? -1 : 1)).map(([n, e]) => `${n} ${e.files} fichiers, ${e.bytes} octets, ${Math.round(e.bytes / 1000)} Ko`).join(' ; ')}`,
    `- ce que \`js/grist-api.js\` rend · ${api ? api[1].split(',').length : 0} noms`,
    `- registre des tables (\`js/schema-columns.js\`) · ${reg.length} tables et ${reg.reduce((n, t) => n + t.columns.length, 0)} colonnes · ${reg.map(t => `${t.id} ${t.columns.length}`).join(', ')}`,
    `- colonnes de la table des documents (\`Publipostage_Templates\`) · ${docs ? docs.columns.length : 0} · ${docs ? docs.columns.map(([name]) => name).join(', ') : ''}`,
  ];
  return { lines, hashes: hashes.length };
}

export function block() {
  return [START, ...measure().lines, END].join('\n');
}

// Le bloc écrit dans la page, tel qu'il y est.
function pageBlock(page) {
  const a = page.indexOf(START), b = page.indexOf(END);
  return a >= 0 && b > a ? page.slice(a, b + END.length) : null;
}

const arg = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gfs-etat.mjs')) {
  if (!arg) {
    process.stdout.write(`${block()}\n`);
  } else if (arg === '--ecrire') {
    const page = readFileSync(PAGE, 'utf8');
    const current = pageBlock(page);
    if (!current) { console.error('GFS-ETAT.md : les deux repères « mesures » sont introuvables'); process.exit(2); }
    writeFileSync(PAGE, page.replace(current, () => block()));
    console.log('GFS-ETAT.md : les mesures sont écrites');
  } else if (arg === '--verifier') {
    const page = readFileSync(PAGE, 'utf8');
    const current = pageBlock(page);
    const { hashes } = measure();
    const s4 = /^- S4 · .* et (\d+) empreintes/m.exec(page);
    const problems = [];
    if (!current) problems.push('les deux repères « mesures » sont introuvables');
    else if (current !== block()) problems.push('le bloc des mesures n\'est plus celui du dépôt : lancer `node outils/gfs-etat.mjs --ecrire`');
    if (!s4 || Number(s4[1]) !== hashes) problems.push(`la ligne S4 dit ${s4 ? s4[1] : 'aucun nombre de'} empreintes, \`script-src\` en a ${hashes}`);
    if (problems.length) { for (const p of problems) console.error(`GFS-ETAT.md : ${p}`); process.exit(1); }
    console.log('GFS-ETAT.md : les mesures et la ligne S4 sont à jour');
  } else {
    console.error('usage : node outils/gfs-etat.mjs [--ecrire | --verifier]');
    process.exit(2);
  }
}
