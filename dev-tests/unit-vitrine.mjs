#!/usr/bin/env node
// Tests purs (sans navigateur) du dossier `vitrine/` : ce que GFS demande à chaque app pour sa carte et sa fiche dans la fenêtre « Apps et extensions » (consigne 071 de GFS, 17/11) :
// `vitrine.json` (une description de 280 caractères au plus en une à trois phrases, sans promesse de sécurité, trois captures, chacune avec une légende de 60 caractères au plus,
// en français et en anglais) et `1.webp`, `2.webp`, `3.webp` (WebP, 960 x 600 px, 60 Ko au plus chacune). Le dossier ne porte rien d'autre : GFS en copie les images chez lui.
// Les captures elles-mêmes (l'app seule, dans un vrai Grist, en clair, sans nom de personne réel) ne se vérifient pas par un script : elles sont prises dans le banc du vrai Grist (`labo-grist-reel/lab-vitrine.mjs`, grist-static) et relues à l'œil.
// Lancer : node dev-tests/unit-vitrine.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'vitrine');
const WIDTH = 960, HEIGHT = 600;
const MAX_BYTES = 60000;           // « 60 Ko au plus » : lu au plus strict (60 000 octets, pas 61 440)
const MAX_DESCRIPTION = 280, MAX_LEGEND = 60;

// Largeur et hauteur d'un WebP d'après son en-tête : les trois formes du format (avec perte `VP8 `, sans perte `VP8L`, étendue `VP8X`). Rend null quand ce n'est pas un WebP.
function webpSize(buffer) {
  if (buffer.length < 30 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  if (chunk === 'VP8X') return { width: (buffer.readUIntLE(24, 3)) + 1, height: (buffer.readUIntLE(27, 3)) + 1 };
  return null;
}
// Le nombre de phrases : les fins de phrase (point, point d'exclamation ou d'interrogation, suivis d'une espace ou de la fin du texte) ; un texte sans fin de phrase en est une.
const sentences = (text) => Math.max(1, (text.match(/[.!?…]+(\s|$)/g) || []).length);
// « Sans promesse de sécurité » (guide des apps de GFS, 1.1 point 13) : aucun mot qui en promette une.
const SECURITY_PROMISE = /s[ée]curi|chiffr|encrypt|prot[ée]g|protect|confidenti|\bsafe|\bsûr/i;

check('le dossier vitrine/ existe à la racine', existsSync(DIR) && statSync(DIR).isDirectory());
if (existsSync(DIR)) {
  const names = readdirSync(DIR).sort();
  check('vitrine/ ne porte que vitrine.json et les trois images', JSON.stringify(names) === JSON.stringify(['1.webp', '2.webp', '3.webp', 'vitrine.json']), names);

  let data = null;
  try { data = JSON.parse(readFileSync(join(DIR, 'vitrine.json'), 'utf8')); } catch (e) { check('vitrine.json se lit', false, e.message); }
  if (data) {
    check('vitrine.json : seulement `description` et `captures`', JSON.stringify(Object.keys(data).sort()) === JSON.stringify(['captures', 'description']), Object.keys(data));
    for (const lang of ['fr', 'en']) {
      const text = data.description && data.description[lang];
      check(`description ${lang} : un texte`, typeof text === 'string' && text.trim().length > 0);
      if (typeof text !== 'string') continue;
      check(`description ${lang} : ${MAX_DESCRIPTION} caractères au plus (${text.length})`, text.length <= MAX_DESCRIPTION);
      check(`description ${lang} : une à trois phrases (${sentences(text)})`, sentences(text) >= 1 && sentences(text) <= 3);
      check(`description ${lang} : aucune promesse de sécurité`, !SECURITY_PROMISE.test(text), (text.match(SECURITY_PROMISE) || [])[0]);
    }
    check('description : seulement fr et en', JSON.stringify(Object.keys(data.description || {}).sort()) === JSON.stringify(['en', 'fr']));
    const captures = Array.isArray(data.captures) ? data.captures : [];
    check('trois captures', captures.length === 3, captures.length);
    captures.forEach((capture, i) => {
      const file = `${i + 1}.webp`;
      check(`capture ${i + 1} : son fichier est ${file}`, capture.fichier === file, capture.fichier);
      for (const lang of ['fr', 'en']) {
        const legend = capture.legende && capture.legende[lang];
        check(`capture ${i + 1} : légende ${lang} d'au plus ${MAX_LEGEND} caractères (${typeof legend === 'string' ? legend.length : '-'})`, typeof legend === 'string' && legend.trim().length > 0 && legend.length <= MAX_LEGEND);
        check(`capture ${i + 1} : légende ${lang} sans promesse de sécurité`, typeof legend === 'string' && !SECURITY_PROMISE.test(legend), legend);
      }
      check(`capture ${i + 1} : seulement fichier et legende`, JSON.stringify(Object.keys(capture).sort()) === JSON.stringify(['fichier', 'legende']), Object.keys(capture));
    });
  }

  for (let i = 1; i <= 3; i++) {
    const path = join(DIR, `${i}.webp`);
    if (!existsSync(path)) { check(`${i}.webp existe`, false); continue; }
    const buffer = readFileSync(path);
    const size = webpSize(buffer);
    check(`${i}.webp : un WebP`, !!size);
    check(`${i}.webp : ${WIDTH} x ${HEIGHT} px (${size ? size.width + ' x ' + size.height : '?'})`, !!size && size.width === WIDTH && size.height === HEIGHT);
    check(`${i}.webp : ${MAX_BYTES} octets au plus (${buffer.length})`, buffer.length <= MAX_BYTES);
  }
}

// Le détecteur : une description trop longue, quatre phrases, une promesse de sécurité, une image de mauvaise taille ou qui n'est pas un WebP sont vues.
check('détecteur : une description de 281 caractères est vue', 'x'.repeat(281).length > MAX_DESCRIPTION);
check('détecteur : quatre phrases sont vues', sentences('Un. Deux. Trois. Quatre.') === 4 && sentences('Un seul texte sans fin') === 1);
check('détecteur : une promesse de sécurité est vue (en français et en anglais)', SECURITY_PROMISE.test('Vos données restent sécurisées.') && SECURITY_PROMISE.test('Your data stays safe.') && SECURITY_PROMISE.test('Encrypted end to end') && !SECURITY_PROMISE.test('Un document par ligne de la table.'));
const fakeVp8 = Buffer.alloc(40); fakeVp8.write('RIFF', 0, 'latin1'); fakeVp8.write('WEBP', 8, 'latin1'); fakeVp8.write('VP8 ', 12, 'latin1'); fakeVp8.writeUInt16LE(960, 26); fakeVp8.writeUInt16LE(600, 28);
check('détecteur : la taille d\'un WebP avec perte se lit (960 x 600)', JSON.stringify(webpSize(fakeVp8)) === JSON.stringify({ width: 960, height: 600 }));
const fakeVp8x = Buffer.alloc(40); fakeVp8x.write('RIFF', 0, 'latin1'); fakeVp8x.write('WEBP', 8, 'latin1'); fakeVp8x.write('VP8X', 12, 'latin1'); fakeVp8x.writeUIntLE(959, 24, 3); fakeVp8x.writeUIntLE(599, 27, 3);
check('détecteur : la taille d\'un WebP étendu se lit (960 x 600)', JSON.stringify(webpSize(fakeVp8x)) === JSON.stringify({ width: 960, height: 600 }));
check('détecteur : un fichier qui n\'est pas un WebP est vu', webpSize(Buffer.from('<svg></svg>'.padEnd(40))) === null);

summarizeAndExit();
