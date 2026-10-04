#!/usr/bin/env node
// Contrôles de ce qui part sur le dépôt public (publier.sh les lance sur l'arbre préparé, avant tout commit).
// Lecture seule : rien n'est modifié. Il lit l'arbre tel qu'il sera publié, pas le dépôt de développement.
//
// Usage : node controles.mjs <dossier de l'arbre à publier> [--version 1.0.0-beta.1]
// Sortie : une ligne par constat, « ERREUR » (publier.sh refuse de committer) ou « AVERTISSEMENT » (à relire), puis le total.
// Code de sortie : 1 s'il y a au moins une erreur, 0 sinon.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const root = args[0];
if (!root || !existsSync(root)) {
  console.error('Usage : node controles.mjs <dossier de l\'arbre à publier> [--version 1.0.0-beta.1]');
  process.exit(2);
}
const versionIdx = args.indexOf('--version');
const version = versionIdx >= 0 ? (args[versionIdx + 1] || '') : '';

const errors = [];
const warnings = [];
const fail = message => errors.push(message);
const warn = message => warnings.push(message);

// ---------------------------------------------------------------------------------------------------------------------------------------------
// L'arbre
// ---------------------------------------------------------------------------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}
const files = walk(root).map(abs => ({ abs, rel: relative(root, abs).split(sep).join('/'), size: statSync(abs).size }));
const has = rel => files.some(file => file.rel === rel);
const read = rel => readFileSync(join(root, rel), 'utf8');

// Les polices embarquées (base64) : des suites de lettres au hasard qui ressemblent à n'importe quel motif. Elles ne sont lues pour aucun contrôle de texte.
const FONT_DATA = /(^|\/)(pdf-fonts[^/]*\.js|roboto-fonts\.css)$/;
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.md', '.py', '.svg', '.txt', '']);
const textFiles = files.filter(file => TEXT_EXT.has(extname(file.rel).toLowerCase()) && !FONT_DATA.test(file.rel) && file.size < 3_000_000);

// Retourne « fichier:ligne » pour chaque ligne qui correspond, au plus `limit` par motif.
function grep(pattern, selection = textFiles) {
  const hits = [];
  for (const file of selection) {
    const lines = readFileSync(file.abs, 'utf8').split('\n');
    lines.forEach((line, index) => { if (pattern.test(line)) hits.push({ file: file.rel, line: index + 1, text: line.trim().slice(0, 110) }); });
  }
  return hits;
}
function report(level, label, hits, show = 4) {
  if (!hits.length) return;
  const files = new Set(hits.map(hit => hit.file));
  const examples = hits.slice(0, show).map(hit => `${hit.file}:${hit.line}`).join(', ');
  const message = `${label} : ${hits.length} ligne(s) dans ${files.size} fichier(s), par exemple ${examples}`;
  (level === 'error' ? fail : warn)(message);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 1. Ce qui doit être là, et ce qui ne doit jamais l'être
// ---------------------------------------------------------------------------------------------------------------------------------------------
for (const required of ['index.html', 'LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'NOTICE']) {
  if (!has(required)) fail(`fichier absent : ${required}`);
}
const NEVER = ['dev-tests', 'planning', 'prototypes', 'templates-gallery-dev', 'outils', '.claude', 'AUDIT_CODE.md', 'CAHIER_DES_CHARGES.md'];
const topLevel = new Set(files.map(file => file.rel.split('/')[0]));
for (const name of NEVER) if (topLevel.has(name)) fail(`entrée du dépôt de développement présente à la racine : ${name}`);
const KNOWN = new Set(['index.html', 'css', 'js', 'img', 'templates-gallery', 'screenshots', 'LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'NOTICE', '.github', '.gitignore', '.gitattributes', '.nojekyll']);
for (const name of topLevel) if (!KNOWN.has(name) && !NEVER.includes(name)) warn(`entrée inconnue à la racine : ${name} (à classer dans publier.sh et dans controles.mjs)`);

if (has('LICENSE')) {
  const license = read('LICENSE');
  if (!/GNU GENERAL PUBLIC LICENSE/.test(license) || !/Version 3, 29 June 2007/.test(license)) fail('LICENSE : ce n\'est pas le texte de la GNU GPL version 3');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 2. Identité et traces de travail : jamais dans ce qui est public
// ---------------------------------------------------------------------------------------------------------------------------------------------
report('error', 'le prénom du développeur', grep(/\bAntoine\b/));
report('error', 'le compte personnel (lombre33)', grep(/lombre33/i));
report('error', 'un lien ou une trace de session de travail (claude.ai, Claude-Session, session_…)', grep(/claude\.ai\/|Claude-Session|\b(session|cse)_[A-Za-z0-9]{12,}\b/));
report('error', 'un renvoi à la mémoire du projet ([[…]])', grep(/\[\[[a-z0-9][a-z0-9-]+\]\]/));
report('warning', 'un renvoi à un dossier ou un document non publié (planning, dev-tests, prototypes, templates-gallery-dev, AUDIT_CODE, CAHIER_DES_CHARGES)',
  grep(/\b(planning|dev-tests|prototypes|templates-gallery-dev|AUDIT_CODE|CAHIER_DES_CHARGES)\b/));

// Secrets : mêmes motifs que preuves.sh.
report('error', 'un secret, un jeton ou un identifiant de document Grist',
  grep(/ghp_[A-Za-z0-9]{20}|github_pat_|AKIA[0-9A-Z]{16}|sk-ant-|-----BEGIN [A-Z ]*PRIVATE KEY|getgrist\.com\/(o\/[^/ ]+\/)?doc\/[A-Za-z0-9]{22}/));

// Adresses e-mail : seules celles des documents de contact (SECURITY, CODE_OF_CONDUCT) et les adresses d'exemple sont normales.
{
  const fictional = /@(ex\.fr|exemple\.[a-z]+|example\.(com|org|net)|test\.[a-z]+|domaine\.[a-z]+|societe\.[a-z]+|entreprise\.[a-z]+|mail\.[a-z]+|email\.[a-z]+|[a-z0-9.-]*noreply[a-z0-9.-]*|[a-z0-9.-]*\.invalid|evil\.example|getgrist\.com)$/i;
  const contactDocs = new Set(['SECURITY.md', 'CODE_OF_CONDUCT.md']);
  const found = new Map();
  for (const file of textFiles) {
    if (contactDocs.has(file.rel)) continue;
    for (const match of readFileSync(file.abs, 'utf8').matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (!fictional.test(match[0]) && !found.has(match[0])) found.set(match[0], file.rel);
    }
  }
  if (found.size) warn(`adresse(s) e-mail à vérifier (réelles ou d'exemple ?) : ${[...found].slice(0, 6).map(([address, file]) => `${address} (${file})`).join(', ')}`);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 3. La page : politique de sécurité du contenu, références, galerie
// ---------------------------------------------------------------------------------------------------------------------------------------------
if (has('index.html')) {
  const raw = read('index.html');
  // Les commentaires parlent de <script> et d'adresses : blanchis à longueur égale, ils ne comptent pas et les positions restent celles du texte brut.
  const page = raw.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '));
  const meta = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!meta) {
    fail('index.html : aucune politique de sécurité du contenu (<meta http-equiv="Content-Security-Policy">)');
  } else {
    if (meta.index > page.indexOf('<script')) fail('index.html : la politique de sécurité du contenu vient après le premier <script>');
    const scriptSrc = (meta[1].split(';').map(directive => directive.trim().split(/\s+/)).find(directive => directive[0] === 'script-src') || []).slice(1);
    if (scriptSrc.includes("'unsafe-inline'")) fail("index.html : script-src autorise 'unsafe-inline'");
    const cited = scriptSrc.filter(source => /^'sha256-/.test(source));
    const inline = new Map();
    for (const match of page.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)) {
      if (/\bsrc\s*=/i.test(match[1])) continue;
      const body = raw.slice(match.index + match[0].indexOf('>') + 1, match.index + match[0].length - '</script>'.length);
      inline.set(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`, body.trim().replace(/\s+/g, ' ').slice(0, 40));
    }
    const uncited = [...inline].filter(([hash]) => !cited.includes(hash));
    if (uncited.length) fail(`index.html : script(s) en ligne sans empreinte dans script-src (le navigateur les refusera) : ${uncited.map(([hash, start]) => `${start}… ${hash}`).join(' ; ')}`);
    const stale = cited.filter(hash => !inline.has(hash));
    if (stale.length) fail(`index.html : empreinte(s) de script-src qui ne correspondent à aucun script en ligne : ${stale.join(' ')}`);
    if (inline.size < 1) warn('index.html : aucun script en ligne trouvé (le contrôle des empreintes n\'a rien vérifié)');
  }

  // Chaque fichier local que la page cite existe.
  const missing = [];
  for (const match of page.matchAll(/\b(?:src|href)="([^"#]+)"/g)) {
    const target = match[1].split('?')[0];
    if (/^(https?:|\/\/|data:|mailto:|javascript:)/i.test(target)) continue;
    if (!has(target.replace(/^\.\//, ''))) missing.push(target);
  }
  if (missing.length) fail(`index.html cite des fichiers absents de l'arbre : ${[...new Set(missing)].join(', ')}`);

  // Rien dans la page ne doit encore pointer vers le dépôt de développement.
  report('error', 'l\'adresse du dépôt de développement (publipostageGrist)', grep(/publipostageGrist/i));
}

if (has('templates-gallery/manifest.json')) {
  try {
    const entries = JSON.parse(read('templates-gallery/manifest.json'));
    for (const entry of entries) {
      for (const key of ['screenshot', 'html', 'schema']) {
        if (entry[key] && !has(`templates-gallery/${entry[key]}`)) fail(`templates-gallery/manifest.json : « ${entry.id || entry.name} » cite ${entry[key]}, absent de l'arbre`);
      }
    }
  } catch (error) {
    fail(`templates-gallery/manifest.json illisible : ${error.message}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 4. Console, taille, gabarits restés en place, version
// ---------------------------------------------------------------------------------------------------------------------------------------------
report('warning', 'console.log / console.info dans js/ (la console de la personne qui ouvre le widget)', grep(/\bconsole\.(log|info)\b/, textFiles.filter(file => file.rel.startsWith('js/'))), 3);
for (const file of files) if (file.size > 2_500_000) warn(`fichier de plus de 2,5 Mo : ${file.rel} (${(file.size / 1e6).toFixed(1)} Mo)`);
report('error', 'un gabarit {{…}} resté dans un document', grep(/\{\{[A-Z_]+\}\}/, textFiles.filter(file => /\.md$|^NOTICE$/.test(file.rel))));

if (version) {
  if (has('CHANGELOG.md') && !new RegExp(`^##\\s*\\[?${version.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')}\\]?`, 'm').test(read('CHANGELOG.md'))) {
    fail(`CHANGELOG.md : aucune section « ## [${version}] »`);
  }
  // Réglages > Crédits lit PP_VERSION : sans ce fichier, ou sans la page qui le charge, la version n'apparaît nulle part.
  if (!has('js/version.js')) {
    fail('js/version.js absent de l\'arbre : Réglages > Crédits n\'afficherait aucune version');
  } else {
    const declared = (read('js/version.js').match(/PP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1];
    if (!declared) fail('js/version.js ne déclare pas PP_VERSION');
    else if (declared !== version) fail(`js/version.js annonce ${declared}, la publication vise ${version}`);
    if (has('index.html') && !/<script\b[^>]*\bsrc\s*=\s*["']js\/version\.js(?:\?[^"']*)?["']/.test(read('index.html'))) fail('index.html ne charge pas js/version.js');
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 5. Les liens des documents publics : fichiers présents, ancres présentes (ancres calculées comme le fait GitHub)
// ---------------------------------------------------------------------------------------------------------------------------------------------
{
  const DOCS = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md'];
  const blank = match => match.replace(/[^\n]/g, ' ');
  const withoutCode = text => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank).replace(/`[^`\n]*`/g, blank);
  function anchorsOf(text) {
    const seen = new Map();
    const anchors = new Set();
    for (const line of withoutCode(text).split('\n')) {
      const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
      if (!heading) continue;
      let slug = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^\p{L}\p{M}\p{N} _-]/gu, '').trim().replace(/ /g, '-');
      const count = seen.get(slug) || 0;
      seen.set(slug, count + 1);
      if (count) slug += `-${count}`;
      anchors.add(slug);
    }
    return anchors;
  }
  const parsed = {};
  for (const doc of DOCS) if (has(doc)) parsed[doc] = { text: read(doc), anchors: anchorsOf(read(doc)) };
  const broken = [];
  for (const [doc, { text }] of Object.entries(parsed)) {
    for (const match of withoutCode(text).matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|tel:)/i.test(target)) continue;
      const [path, anchor] = target.split('#');
      if (path && !has(path)) { broken.push(`${doc} → ${target} (fichier absent)`); continue; }
      const known = parsed[path || doc]?.anchors;
      if (anchor && known && !known.has(decodeURIComponent(anchor).toLowerCase())) broken.push(`${doc} → ${target} (ancre absente)`);
    }
  }
  if (broken.length) fail(`lien(s) cassé(s) dans les documents publics : ${broken.slice(0, 8).join(' ; ')}${broken.length > 8 ? ` (et ${broken.length - 8} autre(s))` : ''}`);
  if (version && has('README.md') && !read('README.md').includes(version)) warn(`README.md ne cite pas la version ${version}`);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
for (const message of errors) console.log(`ERREUR         ${message}`);
for (const message of warnings) console.log(`AVERTISSEMENT  ${message}`);
console.log(`\n${files.length} fichiers lus (${textFiles.length} en texte) : ${errors.length} erreur(s), ${warnings.length} avertissement(s).`);
process.exit(errors.length ? 1 : 0);
