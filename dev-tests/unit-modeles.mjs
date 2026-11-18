#!/usr/bin/env node
// Tests purs (sans navigateur) du dossier `modeles/` : le catalogue des modèles de départ que GFS lit pour « Nouveau > Depuis un modèle » (consigne 075 de GFS, 18/11 ; contrats 2.2 « modeles » et 5.4 point 13).
// `modeles/modeles.json` : une liste d'entrées { id, type, nom, description, etiquettes, vignette, extensions, tables } et, à côté, une vignette WebP par modèle. Les règles sont celles que GFS applique à chaque
// entrée (prototype/js/apps/templates-catalogue.js : une entrée mal formée est écartée, les autres restent) et que son outil `outils/modeles.mjs --depuis <ce dossier> --app publipostage` relit avant de copier :
// id `[a-z0-9][a-z0-9._-]{0,63}` unique et jamais changé, un `type` que l'app ouvre (document, grille, présentation, email), `nom` de 60 signes au plus et `description` de 140 signes au plus - en français ET en
// anglais -, des `etiquettes` bilingues, une `vignette` à chemin relatif sûr (WebP, 240 x 320 px, 12 Ko conseillés), des `extensions` que l'app connaît, `tables` vrai ou faux. S'y ajoute ce que l'app tient à garder
// d'accord avec sa galerie (templates-gallery/) : le catalogue porte exactement les modèles de la galerie, dans son ordre, avec les mêmes noms, étiquettes, types et extensions que celle-ci, et `tables: true` pour
// chaque modèle qui vient avec ses tables (son `pack.json`). Les vignettes elles-mêmes sont les `thumb.png` de la galerie, sans perte : l'essai du navigateur (dev-tests/verify-gfs-model.mjs) le mesure pixel à pixel.
// Lancer : node dev-tests/unit-modeles.mjs
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'modeles');
const GALLERY = join(ROOT, 'templates-gallery');

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const NAME_MAX = 60, TEXT_MAX = 140;
const THUMB_WIDTH = 240, THUMB_HEIGHT = 320, THUMB_BYTES = 12 * 1024;
const TYPES = ['document', 'email', 'grille', 'presentation'];
// Les extensions de l'app (le manifeste de GFS : `extensions[].id`).
const EXTENSIONS = ['graphique', 'edition', 'diapositives', 'lecture-pdf', 'polices'];
const KEYS = ['description', 'etiquettes', 'extensions', 'id', 'nom', 'tables', 'type', 'vignette'];
const IMAGE_RE = /\.(webp|png|jpe?g)$/i;

// Largeur et hauteur d'un WebP d'après son en-tête : les trois formes du format (avec perte `VP8 `, sans perte `VP8L`, étendue `VP8X`). Rend null quand ce n'est pas un WebP.
function webpSize(buffer) {
  if (buffer.length < 30 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  if (chunk === 'VP8X') return { width: (buffer.readUIntLE(24, 3)) + 1, height: (buffer.readUIntLE(27, 3)) + 1 };
  return null;
}
// Un chemin relatif sûr (comme `isSafePath` de GFS) : sans adresse absolue, sans « .. », sans segment qui commence par « _ » ou « . » (GitHub Pages ne les sert pas).
function isSafePath(path) {
  if (typeof path !== 'string' || path.trim() === '' || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every(segment => segment !== '' && segment !== '..' && !/^[_.]/.test(segment));
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
// Un texte bilingue (fr et en), d'au plus `max` signes dans chaque langue.
const isBilingual = (value, max) => isObject(value) && isText(value.fr) && isText(value.en) && value.fr.length <= max && value.en.length <= max;

// Ce qui ne va pas dans une entrée, dit en une phrase chacun ; rien quand elle est bonne. `thumbOf(nom)` rend les octets de la vignette ou null.
function problemsOf(entry, thumbOf) {
  if (!isObject(entry)) return ['ce n’est pas un objet'];
  const problems = [];
  const extra = Object.keys(entry).filter(key => !KEYS.includes(key));
  if (extra.length) problems.push('clé inconnue : ' + extra.join(', '));
  if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) problems.push('id hors format');
  if (!TYPES.includes(entry.type)) problems.push('type « ' + entry.type + ' » que l’app n’ouvre pas');
  if (!isBilingual(entry.nom, NAME_MAX)) problems.push('nom bilingue de ' + NAME_MAX + ' signes au plus attendu');
  if (!isBilingual(entry.description, TEXT_MAX)) problems.push('description bilingue de ' + TEXT_MAX + ' signes au plus attendue');
  if (!(Array.isArray(entry.etiquettes) && entry.etiquettes.length > 0 && entry.etiquettes.every(tag => isBilingual(tag, NAME_MAX)))) problems.push('étiquettes bilingues attendues');
  if (entry.extensions !== undefined && !(Array.isArray(entry.extensions) && entry.extensions.length > 0 && entry.extensions.every(id => EXTENSIONS.includes(id)))) problems.push('extension inconnue de l’app');
  if (typeof entry.tables !== 'boolean') problems.push('tables : vrai ou faux attendu');
  if (!isSafePath(entry.vignette) || !IMAGE_RE.test(entry.vignette || '')) problems.push('vignette : chemin relatif sûr d’une image attendu');
  else {
    const bytes = thumbOf(entry.vignette);
    if (!bytes) problems.push('vignette ' + entry.vignette + ' absente');
    else {
      const size = webpSize(bytes);
      if (!size) problems.push('vignette ' + entry.vignette + ' : ce n’est pas un WebP');
      else if (size.width !== THUMB_WIDTH || size.height !== THUMB_HEIGHT) problems.push('vignette ' + entry.vignette + ' : ' + size.width + ' x ' + size.height + ' px au lieu de ' + THUMB_WIDTH + ' x ' + THUMB_HEIGHT);
      if (bytes.length > THUMB_BYTES) problems.push('vignette ' + entry.vignette + ' : ' + bytes.length + ' octets (' + THUMB_BYTES + ' conseillés)');
    }
  }
  return problems;
}

check('le dossier modeles/ existe à la racine', existsSync(DIR) && statSync(DIR).isDirectory());
const thumbOf = name => { const path = join(DIR, name); return existsSync(path) && statSync(path).isFile() ? readFileSync(path) : null; };

let catalogue = null;
try { catalogue = JSON.parse(readFileSync(join(DIR, 'modeles.json'), 'utf8')); } catch (e) { check('modeles/modeles.json se lit', false, e.message); }
if (catalogue) {
  check('modeles.json est une liste d’entrées', Array.isArray(catalogue) && catalogue.length > 0, typeof catalogue);
  const ids = catalogue.map(entry => entry && entry.id);
  check('chaque id n’est pris qu’une fois', new Set(ids).size === ids.length, ids.filter((id, at) => ids.indexOf(id) !== at));
  catalogue.forEach((entry) => {
    const problems = problemsOf(entry, thumbOf);
    check(`« ${entry && entry.id} » : une entrée bien formée`, problems.length === 0, problems.join(' ; '));
  });

  // Le dossier ne porte que le catalogue, sa notice et une vignette par modèle : GFS copie ces fichiers-là, une image de plus serait une vignette orpheline.
  const wanted = catalogue.map(entry => entry.vignette).concat(['modeles.json', 'README.md']).sort();
  const names = readdirSync(DIR).sort();
  check('modeles/ ne porte que modeles.json, README.md et une vignette par modèle', JSON.stringify(names) === JSON.stringify(wanted), names.filter(name => !wanted.includes(name)).concat(wanted.filter(name => !names.includes(name)).map(name => '-' + name)));
  check('chaque vignette a le nom de son modèle (<id>.webp), jamais celle d’un autre', catalogue.every(entry => entry.vignette === entry.id + '.webp'), catalogue.filter(entry => entry.vignette !== entry.id + '.webp').map(entry => entry.id));

  // L'accord avec la galerie de l'app : les mêmes modèles, dans le même ordre.
  const gallery = JSON.parse(readFileSync(join(GALLERY, 'catalogue.json'), 'utf8'));
  check('le catalogue porte exactement les modèles de la galerie, dans l’ordre de la galerie', JSON.stringify(ids) === JSON.stringify(gallery.map(entry => entry.id)), { catalogue: ids.filter(id => !gallery.some(entry => entry.id === id)), galerie: gallery.map(entry => entry.id).filter(id => !ids.includes(id)) });

  // Les noms et les étiquettes en anglais sont ceux de l'interface (js/i18n-texts-templates.js : gallery.name.<id>, gallery.tag.<étiquette>) ; le français est celui du catalogue de la galerie.
  const context = createContext({});
  loadScript(context, 'js/i18n-texts-templates.js');
  const texts = evalIn(context, 'I18nTextsTemplates');
  const tagKey = tag => 'gallery.tag.' + String(tag).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const label = (key, fallback) => (texts[key] ? texts[key] : { fr: fallback, en: fallback });
  for (const item of gallery) {
    const entry = catalogue.find(candidate => candidate.id === item.id);
    if (!entry) { check(`« ${item.id} » est au catalogue`, false); continue; }
    const pack = JSON.parse(readFileSync(join(GALLERY, item.id, 'pack.json'), 'utf8'));
    const name = label('gallery.name.' + item.id, item.name);
    check(`« ${item.id} » : le nom est celui de la galerie, dans les deux langues`, entry.nom && entry.nom.fr === item.name && entry.nom.en === name.en, entry.nom);
    const tags = (item.tags || []).map(tag => label(tagKey(tag), tag));
    check(`« ${item.id} » : les étiquettes sont celles de la galerie (${tags.map(tag => tag.fr).join(', ')}), dans les deux langues`, JSON.stringify(entry.etiquettes) === JSON.stringify(tags), entry.etiquettes);
    const type = (pack.template && pack.template.type) || 'document';
    check(`« ${item.id} » : le type est celui de son pack (${type})`, entry.type === type, entry.type);
    const requires = pack.requires || [];
    check(`« ${item.id} » : les extensions sont celles que son pack exige (${requires.join(', ') || 'aucune'}), jamais « diapositives » (c’est celle de son type)`, JSON.stringify(entry.extensions || []) === JSON.stringify(requires) && !(entry.extensions || []).includes('diapositives') && (requires.length > 0 || !('extensions' in entry)), entry.extensions);
    check(`« ${item.id} » : \`tables\` dit s’il vient avec ses tables (${pack.tables.length})`, entry.tables === pack.tables.length > 0, entry.tables);
  }
}

// Le détecteur : chaque défaut que GFS écarterait (ou que l'app refuse) est vu sur une entrée bonne que l'on abîme.
const good = catalogue ? catalogue.find(entry => entry.id === 'facture') : null;
if (good) {
  const bad = (patch) => problemsOf(Object.assign({}, good, patch), thumbOf);
  check('détecteur : l’entrée bonne ne donne rien', problemsOf(good, thumbOf).length === 0);
  check('détecteur : un id en majuscules est vu', bad({ id: 'Facture' }).length > 0);
  check('détecteur : un id de 65 signes est vu, un de 64 passe', bad({ id: 'a'.repeat(65) }).length > 0 && !bad({ id: 'a'.repeat(64) }).some(p => /id hors format/.test(p)));
  check('détecteur : un type inconnu et le type « macro » sont vus', bad({ type: 'reglages' }).length > 0 && bad({ type: 'macro' }).length > 0);
  check('détecteur : un nom de 61 signes est vu, un de 60 passe', bad({ nom: { fr: 'x'.repeat(61), en: 'y' } }).length > 0 && !bad({ nom: { fr: 'x'.repeat(60), en: 'y'.repeat(60) } }).some(p => /nom/.test(p)));
  check('détecteur : un nom sans l’anglais est vu', bad({ nom: { fr: 'Facture' } }).length > 0 && bad({ nom: { fr: 'Facture', en: ' ' } }).length > 0);
  check('détecteur : une description de 141 signes est vue, une absente aussi', bad({ description: { fr: 'x'.repeat(141), en: 'y' } }).length > 0 && bad({ description: undefined }).length > 0);
  check('détecteur : une étiquette sans l’anglais est vue', bad({ etiquettes: [{ fr: 'Vente' }] }).length > 0);
  check('détecteur : une vignette hors du dossier, absolue ou sans fichier est vue', ['../facture.webp', '/facture.webp', 'https://x.test/facture.webp', '.cache/facture.webp', 'inconnue.webp'].every(path => bad({ vignette: path }).length > 0));
  check('détecteur : une vignette qui n’est pas une image est vue', bad({ vignette: 'modeles.json' }).length > 0);
  check('détecteur : une extension inconnue est vue', bad({ extensions: ['inconnue'] }).length > 0 && bad({ extensions: 'graphique' }).length > 0);
  check('détecteur : `tables` qui n’est pas un booléen est vu', bad({ tables: 'oui' }).length > 0 && bad({ tables: undefined }).length > 0);
  check('détecteur : une clé inconnue est vue', bad({ apercu: 'x' }).length > 0);
  check('détecteur : une vignette de mauvaise taille ou trop lourde est vue', problemsOf(good, () => Buffer.alloc(13 * 1024)).length > 0);
  const fakeWebp = (width, height) => { const buffer = Buffer.alloc(40); buffer.write('RIFF', 0, 'latin1'); buffer.write('WEBP', 8, 'latin1'); buffer.write('VP8 ', 12, 'latin1'); buffer.writeUInt16LE(width, 26); buffer.writeUInt16LE(height, 28); return buffer; };
  check('détecteur : un WebP de 240 x 320 passe, un de 320 x 240 est vu', problemsOf(good, () => fakeWebp(240, 320)).length === 0 && problemsOf(good, () => fakeWebp(320, 240)).some(p => /320 x 240/.test(p)));
  check('détecteur : un fichier qui n’est pas un WebP est vu', problemsOf(good, () => Buffer.from('<svg></svg>'.padEnd(40))).some(p => /pas un WebP/.test(p)));
}
check('détecteur : isSafePath refuse « .. », une adresse absolue, un segment caché, et accepte un nom simple', !isSafePath('../a.webp') && !isSafePath('/a.webp') && !isSafePath('x/.a.webp') && !isSafePath('x/_a.webp') && isSafePath('facture.webp'));

summarizeAndExit();
