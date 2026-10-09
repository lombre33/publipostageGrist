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
for (const required of ['index.html', 'LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'NOTICE', 'CARTE_DU_CODE.md']) {
  if (!has(required)) fail(`fichier absent : ${required}`);
}
const NEVER = ['dev-tests', 'planning', 'prototypes', 'templates-gallery-dev', 'outils', '.claude', 'AUDIT_CODE.md', 'CAHIER_DES_CHARGES.md'];
const topLevel = new Set(files.map(file => file.rel.split('/')[0]));
for (const name of NEVER) if (topLevel.has(name)) fail(`entrée du dépôt de développement présente à la racine : ${name}`);
const KNOWN = new Set(['index.html', 'css', 'js', 'img', 'templates-gallery', 'screenshots', 'LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'NOTICE', 'CARTE_DU_CODE.md', '.github', '.gitignore', '.gitattributes', '.nojekyll']);
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

// GitHub Pages (Jekyll) ne sert aucun fichier ni dossier dont le nom commence par « _ » ou « . » : ce que le widget charge n'en porte pas (templates-gallery/_tables/ répondait 404 en ligne le 09/10 ; il s'appelle families/).
{
  const hidden = files.filter(file => /^(css|js|img|templates-gallery)\//.test(file.rel) && file.rel.split('/').some(part => /^[_.]/.test(part)));
  if (hidden.length) fail(`un fichier ou un dossier que le widget charge porte un nom qui commence par « _ » ou « . » (GitHub Pages ne le sert pas, il répond 404 en ligne) : ${hidden.slice(0, 4).map(file => file.rel).join(', ')}`);
}

if (has('templates-gallery/manifest.json')) {
  try {
    const entries = JSON.parse(read('templates-gallery/manifest.json'));
    for (const entry of entries) {
      for (const key of ['screenshot', 'html', 'schema', 'pack', 'headerFooter']) {
        if (entry[key] && !has(`templates-gallery/${entry[key]}`)) fail(`templates-gallery/manifest.json : « ${entry.id || entry.name} » cite ${entry[key]}, absent de l'arbre`);
      }
      // Les captures de l'aperçu, et le fichier de tables de la famille que le pack du modèle nomme.
      for (const shot of Array.isArray(entry.preview) ? entry.preview : []) {
        if (shot && shot.src && !has(`templates-gallery/${shot.src}`)) fail(`templates-gallery/manifest.json : « ${entry.id || entry.name} » cite la capture ${shot.src}, absente de l'arbre`);
      }
      if (entry.pack && has(`templates-gallery/${entry.pack}`)) {
        let pack = null;
        try { pack = JSON.parse(read(`templates-gallery/${entry.pack}`)); } catch (error) { fail(`templates-gallery/${entry.pack} illisible : ${error.message}`); }
        if (pack && pack.family && !has(`templates-gallery/families/${pack.family}.json`)) fail(`templates-gallery/${entry.pack} : la famille ${pack.family} n'a pas de fichier templates-gallery/families/${pack.family}.json`);
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
  const DOCS = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'CARTE_DU_CODE.md'];
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
// 6. La carte du code : chaque fichier qu'elle cite existe, chaque fichier de js/ y figure
// ---------------------------------------------------------------------------------------------------------------------------------------------
if (has('CARTE_DU_CODE.md')) {
  const cited = new Set([...read('CARTE_DU_CODE.md').matchAll(/`((?:js|css|img|templates-gallery)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+|index\.html)`/g)].map(match => match[1]));
  const dead = [...cited].filter(path => !has(path));
  if (dead.length) fail(`CARTE_DU_CODE.md cite des fichiers absents de l'arbre : ${dead.slice(0, 8).join(', ')}${dead.length > 8 ? ` (et ${dead.length - 8} autre(s))` : ''}`);
  // Les feuilles de style s'y disent en bloc (« les 31 autres vont chacune avec un module ») : seuls les fichiers de js/ y ont chacun leur ligne.
  const jsFiles = files.filter(file => /^js\/[^/]+\.js$/.test(file.rel));
  const absent = jsFiles.filter(file => !cited.has(file.rel)).map(file => file.rel);
  if (absent.length) warn(`fichier(s) de js/ sans ligne dans CARTE_DU_CODE.md : ${absent.slice(0, 8).join(', ')}${absent.length > 8 ? ` (et ${absent.length - 8} autre(s))` : ''}`);
  // Les nombres du texte : les fichiers de js/ (en tout et par famille) se comptent au juste, les lignes au vingtième près.
  const text = read('CARTE_DU_CODE.md');
  const statedFiles = [...new Set([...text.matchAll(/(\d+) (?:fichiers dans|files in) `js\/`/g)].map(match => Number(match[1])))];
  if (statedFiles.some(n => n !== jsFiles.length)) warn(`CARTE_DU_CODE.md annonce ${statedFiles.join(' et ')} fichiers dans js/, l'arbre en compte ${jsFiles.length}`);
  for (const block of text.split(/^### /m).slice(1)) {
    const heading = block.split('\n')[0].trim();
    const stated = /\((\d+) (?:fichiers|files),/.exec(heading);
    if (!stated) continue;
    const real = new Set([...block.split(/^#{1,2} /m)[0].matchAll(/`(js\/[A-Za-z0-9_.-]+\.js)`/g)].map(match => match[1])).size;
    if (Number(stated[1]) !== real) warn(`CARTE_DU_CODE.md : « ${heading} » annonce ${stated[1]} fichiers, son tableau en cite ${real}`);
  }
  const lines = jsFiles.reduce((total, file) => total + readFileSync(file.abs, 'utf8').split('\n').length - 1, 0);
  for (const match of text.matchAll(/\((\d[\d ,]*) (?:lignes|lines) ?:/g)) {
    const statedLines = Number(match[1].replace(/[ ,]/g, ''));
    if (Math.abs(statedLines - lines) > lines / 20) warn(`CARTE_DU_CODE.md annonce ${match[1]} lignes dans js/, l'arbre en compte ${lines}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 7. Le README dit ce que le widget garde dans le navigateur : chaque clé du localStorage, nommée en français et en anglais
// ---------------------------------------------------------------------------------------------------------------------------------------------
if (has('README.md')) {
  // Clé du code (ou préfixe, quand elle finit par « _ ») → les mots par lesquels le paragraphe « Aucune donnée n'est stockée hors de Grist » la nomme, en français puis en anglais.
  const STORED = {
    pp_lang: ['langue', 'language'],
    pp_theme: ['thème', 'theme'],
    pp_trigger_char: ['touches', 'keys'],
    pp_expansion_char: ['touches', 'keys'],
    pp_shortcuts: ['raccourcis', 'shortcuts'],
    pp_shortcuts_view: ['vue de leur panneau', 'view of their panel'],
    pp_autosave_enabled: ['enregistrement automatique', 'autosave'],
    pp_sheet_assembly: ['assemblage avant impression', 'sheet assembly before printing'],
    pp_page_zoom: ['niveau de zoom', 'zoom level'],
    pp_schema_: ['renommages', 'renames'],
  };
  const entryOf = key => Object.keys(STORED).find(name => key === name || (name.endsWith('_') && key.startsWith(name)));
  const used = new Map();
  for (const file of textFiles.filter(file => file.rel.startsWith('js/') || file.rel === 'index.html')) {
    for (const match of readFileSync(file.abs, 'utf8').matchAll(/['"`](pp_[A-Za-z0-9_]+)/g)) if (!used.has(match[1])) used.set(match[1], file.rel);
  }
  const readme = read('README.md');
  const paragraphs = { fr: /Aucune donnée n'est stockée hors de Grist[\s\S]*?\n\s*\n/, en: /No data is ever stored outside of Grist[\s\S]*?\n\s*\n/ };
  const said = {};
  for (const [lang, pattern] of Object.entries(paragraphs)) {
    const found = readme.match(pattern);
    said[lang] = found ? found[0].replace(/\s+/g, ' ').toLowerCase() : null;
    if (!found && used.size) fail(`README.md : le paragraphe sur le stockage du navigateur (${lang === 'fr' ? 'français' : 'anglais'}) est introuvable`);
  }
  for (const [key, file] of used) {
    const name = entryOf(key);
    if (!name) { fail(`le code garde « ${key} » dans le navigateur (${file}) sans que controles.mjs le connaisse : l'ajouter à STORED et au paragraphe du README sur le stockage (français et anglais)`); continue; }
    ['fr', 'en'].forEach((lang, index) => {
      if (said[lang] && !said[lang].includes(STORED[name][index])) fail(`README.md (${lang === 'fr' ? 'français' : 'anglais'}) ne nomme pas ce que garde « ${key} » : « ${STORED[name][index]} » absent du paragraphe sur le stockage du navigateur`);
    });
  }
  if (used.size) for (const name of Object.keys(STORED)) if (![...used.keys()].some(key => entryOf(key) === name)) warn(`STORED (controles.mjs) cite « ${name} », que le code ne garde plus : le README en parle-t-il encore ?`);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
for (const message of errors) console.log(`ERREUR         ${message}`);
for (const message of warnings) console.log(`AVERTISSEMENT  ${message}`);
console.log(`\n${files.length} fichiers lus (${textFiles.length} en texte) : ${errors.length} erreur(s), ${warnings.length} avertissement(s).`);
process.exit(errors.length ? 1 : 0);
