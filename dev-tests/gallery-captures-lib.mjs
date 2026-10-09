// Ce que les captures d'un modèle de la galerie lisent, et comment on sait qu'elles sont à jour (dev-tests/gallery-captures.mjs les fabrique,
// dev-tests/verify-gallery-captures.mjs les contrôle : les deux passent par ce fichier, pour qu'ils parlent de la même empreinte).
//
// Un modèle à captures a, dans son dossier (templates-gallery/<id>/ ou templates-gallery-dev/<id>/) :
//   pack.json      les tables, les règles de liaison et la page du modèle (js/template-pack.js) ;
//   template.html  le contenu du modèle ;
//   exemple.json   les lignes d'exemple et ce qu'on photographie (jamais lu par le widget : les tables d'un utilisateur se créent vides) ;
//   capture-N.png  ce que le vrai widget en tire (PDF exporté par le vrai bouton, page par page, ou Lecture pour un e-mail ou une grille) ;
//   thumb.png      la vignette de la carte ;
//   captures.json  l'empreinte des fichiers ci-dessus au moment des captures, et la taille de chaque image.
// Les tables partagées d'une famille sont dans <galerie>/_tables/<famille>.json (lues par le widget) et leurs lignes d'exemple dans
// <galerie>/_tables/<famille>.exemple.json (jamais lues par le widget) : les lignes du modèle (`rows` de exemple.json) remplacent, table par table, celles de la famille.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// À monter quand le script change ce qu'il écrit (la mise en page des vignettes, la résolution des images) : toutes les captures deviennent à refaire.
export const CAPTURE_VERSION = 1;

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const maybe = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

// Les fichiers d'un modèle du manifeste : { dir, packPath, pack, html, exemple, family, familyExemple, familyTablesPath, familyExemplePath } ou null quand le modèle n'a pas de pack.
export function entryFiles(galleryRoot, entry) {
  if (!entry || !entry.pack) return null;
  const packPath = join(galleryRoot, entry.pack);
  const dir = dirname(packPath);
  const pack = readJson(packPath);
  const family = pack.family || '';
  const familyTablesPath = family ? join(galleryRoot, '_tables', family + '.json') : '';
  const familyExemplePath = family ? join(galleryRoot, '_tables', family + '.exemple.json') : '';
  return {
    dir, packPath, pack,
    html: readFileSync(join(galleryRoot, entry.html), 'utf8'),
    exemple: existsSync(join(dir, 'exemple.json')) ? readJson(join(dir, 'exemple.json')) : null,
    family, familyTablesPath, familyExemplePath,
    familyTables: familyTablesPath && existsSync(familyTablesPath) ? readJson(familyTablesPath) : null,
    familyExemple: familyExemplePath && existsSync(familyExemplePath) ? readJson(familyExemplePath) : null,
  };
}

// L'empreinte de tout ce qui change une capture : si l'une de ces entrées change sans que les images soient refaites, la garde le dit.
export function inputsHash(galleryRoot, entry) {
  const files = entryFiles(galleryRoot, entry);
  const hash = createHash('sha1');
  hash.update('v' + CAPTURE_VERSION + '\n');
  hash.update(entry.name + '\n');
  hash.update(maybe(files.packPath) + '\n');
  hash.update(files.html + '\n');
  hash.update(maybe(join(files.dir, 'exemple.json')) + '\n');
  hash.update(maybe(files.familyTablesPath) + '\n');
  hash.update(maybe(files.familyExemplePath) + '\n');
  if (entry.headerFooter) hash.update(maybe(join(galleryRoot, entry.headerFooter)) + '\n');
  return hash.digest('hex').slice(0, 16);
}

// Largeur et hauteur d'un PNG, lues dans son en-tête (IHDR), sans bibliothèque d'images.
export function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) throw new Error('pas un PNG');
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}
