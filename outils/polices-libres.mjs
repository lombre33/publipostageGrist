#!/usr/bin/env node
// Relevé des polices LIBRES que le PDF peut inclure à la demande (js/free-fonts.js, extensions/polices/libres.js ; extension « polices », que GFS seul active).
//
// Chaque police vient de Fontsource (le paquet npm `@fontsource/<nom>`, servi par jsDelivr) : le sous-ensemble latin en WOFF, en 400 et 700, droit et italique. Ce script, lancé À LA MAIN (réseau :
// cdn.jsdelivr.net), lit pour chaque police la version et la licence du paquet, REFUSE toute licence qui n'est pas libre (OFL, Apache, MIT, licence Ubuntu), télécharge chaque fichier À LA VERSION
// EXACTE et en relève l'empreinte SHA-384 : le widget ne charge ensuite que cette version, et refuse un fichier dont l'empreinte a changé. Il écrit deux fichiers, entre leurs marques « generated » :
//   js/free-fonts.js              la liste (nom, paquet, version, licence, graisses qui existent) : le nom d'une police libre se reconnaît sans charger l'extension ;
//   extensions/polices/libres.js  les empreintes des fichiers.
// Pour ajouter une police : la nommer dans FONTS ci-dessous, relancer avec --ecrire, relire le diff (versions, licences), pousser les deux fichiers.
//
//   --ecrire   télécharge, vérifie et écrit les deux fichiers ;
//   --dire     télécharge et vérifie, affiche, n'écrit rien.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://cdn.jsdelivr.net/npm/@fontsource/';
// Les polices que le PDF peut inclure : de quoi couvrir ce que les agents collent ou importent d'un Word ou d'un PowerPoint (sans-serif, serif, chasse fixe), et trois polices d'accessibilité.
const FONTS = [
  ['Open Sans', 'open-sans'], ['Lato', 'lato'], ['Montserrat', 'montserrat'], ['Poppins', 'poppins'], ['Inter', 'inter'], ['Source Sans 3', 'source-sans-3'], ['Noto Sans', 'noto-sans'],
  ['Raleway', 'raleway'], ['Nunito', 'nunito'], ['Nunito Sans', 'nunito-sans'], ['Ubuntu', 'ubuntu'], ['Fira Sans', 'fira-sans'], ['PT Sans', 'pt-sans'], ['Work Sans', 'work-sans'],
  ['DM Sans', 'dm-sans'], ['Cabin', 'cabin'], ['Oswald', 'oswald'], ['Rubik', 'rubik'], ['Mulish', 'mulish'], ['Quicksand', 'quicksand'], ['Karla', 'karla'], ['IBM Plex Sans', 'ibm-plex-sans'],
  ['Barlow', 'barlow'], ['Roboto Condensed', 'roboto-condensed'], ['Titillium Web', 'titillium-web'], ['Josefin Sans', 'josefin-sans'], ['Comic Neue', 'comic-neue'],
  ['Roboto Slab', 'roboto-slab'], ['Merriweather', 'merriweather'], ['Lora', 'lora'], ['Playfair Display', 'playfair-display'], ['PT Serif', 'pt-serif'], ['Source Serif 4', 'source-serif-4'],
  ['Noto Serif', 'noto-serif'], ['Libre Baskerville', 'libre-baskerville'], ['Crimson Text', 'crimson-text'], ['EB Garamond', 'eb-garamond'], ['Cormorant Garamond', 'cormorant-garamond'],
  ['Caladea', 'caladea'], ['IBM Plex Serif', 'ibm-plex-serif'],
  ['Roboto Mono', 'roboto-mono'], ['Fira Code', 'fira-code'], ['Source Code Pro', 'source-code-pro'], ['JetBrains Mono', 'jetbrains-mono'], ['IBM Plex Mono', 'ibm-plex-mono'],
  ['Inconsolata', 'inconsolata'], ['Ubuntu Mono', 'ubuntu-mono'],
  ['Atkinson Hyperlegible', 'atkinson-hyperlegible'], ['Lexend', 'lexend'], ['OpenDyslexic', 'opendyslexic'],
];
// Les quatre graisses du PDF et le fichier de Fontsource qui la porte.
const STYLES = [['normal', '400-normal', 'n'], ['bold', '700-normal', 'b'], ['italics', '400-italic', 'i'], ['bolditalics', '700-italic', 'j']];
const FREE_LICENSE = /^(OFL|Apache|MIT|SIL OPEN FONT|Ubuntu|LicenseRef-Ubuntu)/i;
const MAX_FILE = 160 * 1024;

async function get(url, as) {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(url + ' : ' + response.status);
  return as === 'json' ? response.json() : new Uint8Array(await response.arrayBuffer());
}
const digest = bytes => 'sha384-' + createHash('sha384').update(bytes).digest('base64');

async function read() {
  const list = [];
  const hashes = {};
  const refused = [];
  for (const [name, slug] of FONTS) {
    const meta = await get(CDN + slug + '/package.json', 'json');
    if (!meta) { refused.push(name + ' : paquet absent chez Fontsource'); continue; }
    if (!/^\d+\.\d+\.\d+$/.test(meta.version)) { refused.push(name + ' : version ' + meta.version); continue; }
    const license = String(meta.license || '');
    if (!FREE_LICENSE.test(license)) { refused.push(name + ' : licence « ' + license + ' » écartée'); continue; }
    const files = {};
    let styles = '';
    for (const [style, part, letter] of STYLES) {
      const bytes = await get(CDN + slug + '@' + meta.version + '/files/' + slug + '-latin-' + part + '.woff');
      if (!bytes) continue;
      if (bytes.length > MAX_FILE || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOFF') { refused.push(name + ' : fichier ' + part + ' illisible ou trop lourd (' + bytes.length + ' octets)'); styles = ''; break; }
      files[style] = digest(bytes);
      styles += letter;
    }
    if (!styles.includes('n')) { if (!refused.some(line => line.startsWith(name + ' :'))) refused.push(name + ' : pas de graisse normale'); continue; }
    list.push({ name, slug, version: meta.version, license, styles });
    hashes[slug] = files;
    process.stdout.write('  ' + name + ' ' + meta.version + ' ' + license + ' [' + styles + ']\n');
  }
  return { list, hashes, refused };
}

function between(file, mark, text) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const open = '// <generated:' + mark + '>';
  const close = '// </generated:' + mark + '>';
  const a = source.indexOf(open);
  const b = source.indexOf(close);
  if (a < 0 || b < a) throw new Error(file + ' : marques « generated:' + mark + ' » absentes');
  return source.slice(0, a + open.length) + '\n' + text + source.slice(b);
}

const { list, hashes, refused } = await read();
refused.forEach(line => console.log('  ÉCARTÉE ' + line));
const listText = list.map(f => `    { name: '${f.name}', slug: '${f.slug}', version: '${f.version}', license: '${f.license}', styles: '${f.styles}' },`).join('\n') + '\n    ';
const hashText = '    const HASHES = {\n' + list.map(f => `      '${f.slug}': { ${Object.entries(hashes[f.slug]).map(([style, hash]) => `${style}: '${hash}'`).join(', ')} },`).join('\n') + '\n    };\n    ';
console.log(list.length + ' polices retenues, ' + refused.length + ' écartées.');
if (process.argv.includes('--ecrire')) {
  writeFileSync(join(ROOT, 'js/free-fonts.js'), between('js/free-fonts.js', 'list', listText));
  writeFileSync(join(ROOT, 'extensions/polices/libres.js'), between('extensions/polices/libres.js', 'hashes', hashText));
  console.log('js/free-fonts.js et extensions/polices/libres.js écrits.');
}
