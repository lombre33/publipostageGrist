#!/usr/bin/env node
// Les captures et les pastilles de la galerie (templates-gallery/, templates-gallery-dev/) : sans navigateur, en lisant les fichiers.
//   1. chaque fichier que le manifeste nomme existe (html, pack, schéma, en-tête et pied, vignette, captures) ;
//   2. chaque capture a la taille que le manifeste dit (largeur et hauteur lues dans l'en-tête du PNG) : le HTML de l'aperçu réserve la place avant le chargement ;
//   3. les captures sont à jour : l'empreinte de captures.json est celle de pack.json, template.html, exemple.json, de la famille de tables et de l'en-tête et pied
//      (dev-tests/gallery-captures-lib.mjs:inputsHash). Un modèle modifié sans que `node dev-tests/gallery-captures.mjs` ait été relancé s'arrête ici ;
//   4. les pastilles « Fonctions montrées » (`shows`) disent vrai : chaque clé a son libellé français et anglais (js/i18n.js) ET sa preuve dans le modèle (le HTML
//      ou le pack contient bien la fonction) ; au plus 6 pastilles par modèle (l'aperçu les range sur la première ligne visible d'un panneau de 400 px) ;
//   5. le widget ne lit jamais les lignes d'exemple : aucun fichier de js/ ne cite « exemple.json » ni « .exemple.json » ;
//   6. aucun modèle de templates-gallery/ n'a un nom de carte de plus de 40 caractères (la carte le coupe à deux lignes).
// Lancé par run-headless.mjs (groupe Node "galleryCaptures"), ou seul : node dev-tests/verify-gallery-captures.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryFiles, inputsHash, pngSize, readJson } from './gallery-captures-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

// ---- Les libellés de js/i18n.js : { clé: { fr, en } } pour gallery.shows.* ----
const i18n = readFileSync(join(ROOT, 'js', 'i18n.js'), 'utf8');
const labels = {};
for (const m of i18n.matchAll(/'gallery\.shows\.([A-Za-z0-9]+)':\s*\{\s*fr:\s*'((?:[^'\\]|\\.)*)',\s*en:\s*'((?:[^'\\]|\\.)*)'\s*\}/g)) labels[m[1]] = { fr: m[2], en: m[3] };

// ---- Les preuves : ce que le modèle doit contenir pour avoir le droit de dire qu'il montre cette fonction ----
// (html : le contenu du modèle, pack : pack.json, headerFooter : le texte de son fichier d'en-tête et pied ou '', entry : l'entrée du manifeste)
const A4_AREA = 210 * 297;
const pageArea = (pack) => {
  const page = (pack.template && pack.template.page) || {};
  const format = page.format || 'A4';
  const sizes = { A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148] };
  const free = /^(\d+(?:\.\d)?)x(\d+(?:\.\d)?)$/.exec(format);
  const size = sizes[format] || (free ? [Number(free[1]), Number(free[2])] : sizes.A4);
  return size[0] * size[1];
};
const formatJson = (html) => Array.from(html.matchAll(/data-format="([^"]*)"/g)).map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
const PROOFS = {
  pageFormat: ({ pack }) => { const page = (pack.template && pack.template.page) || {}; return (page.format || 'A4') !== 'A4' || page.orientation === 'landscape'; },
  sheets: ({ pack }) => pageArea(pack) <= A4_AREA / 2 + 1,
  images: ({ html }) => /<img[^>]*data-var-key=/.test(html),
  dateFormat: ({ html }) => formatJson(html).some((f) => /"type":"date"/.test(f)),
  condition: ({ html }) => /class="conditional-text"/.test(html),
  qr: ({ html }) => /<img[^>]*data-qr-text=/.test(html),
  twoColumns: ({ html }) => /class="two-columns-zone"/.test(html),
  otherwise: ({ html }) => /<span[^>]*data-otherwise-key=/.test(html),
  dateWords: ({ html }) => formatJson(html).some((f) => /"type":"date"/.test(f) && /"words":true/.test(f)),
  loop: ({ html }) => /data-loop=/.test(html),
  calc: ({ html }) => /class="calc-badge"/.test(html),
  amountWords: ({ html }) => formatJson(html).some((f) => /"type":"number"/.test(f) && /"words":true/.test(f) && /"currency":"[^"]+"/.test(f)),
  pageNumbers: ({ headerFooter }) => /page-number-badge/.test(headerFooter), // le fichier est du JSON : les guillemets du HTML y sont échappés
  linked: ({ pack }) => (pack.links || []).length > 0,
  today: ({ html }) => /data-chip-kind="date"/.test(html),
  headings: ({ html }) => /class="heading-numbering-config" data-style="(numeric|alpha|roman)"/.test(html) && /<h[1-6][ >]/.test(html),
  footnote: ({ html }) => /class="footnote-ref-marker"/.test(html),
  checkbox: ({ html }) => formatJson(html).some((f) => /"type":"bool"/.test(f) && /"style":"(accentStrike|classic|accentPlain)"/.test(f)),
  headerFooter: ({ headerFooter }) => headerFooter !== '' && JSON.parse(headerFooter).enabled === true,
  conditionValue: ({ html }) => /class="conditional-value"/.test(html),
};

const galleries = [{ dir: 'templates-gallery', dev: false }, { dir: 'templates-gallery-dev', dev: true }];
const seenKeys = new Set();
for (const gallery of galleries) {
  const root = join(ROOT, gallery.dir);
  const manifestPath = join(root, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  console.log(`\n== ${gallery.dir} (${manifest.length} modèle(s)) ==`);
  for (const entry of manifest) {
    const id = entry.id;
    const files = ['html', 'screenshot', 'schema', 'pack', 'headerFooter'].filter((k) => entry[k]);
    const missing = files.filter((k) => !existsSync(join(root, entry[k])));
    check(`${id} : les fichiers du manifeste existent (${files.join(', ')})`, !missing.length, missing.map((k) => entry[k]));
    if (gallery.dev === false) check(`${id} : le nom de la carte tient en deux lignes (40 caractères au plus)`, entry.name.length <= 40, entry.name.length);
    for (const shot of entry.preview || []) {
      const path = join(root, shot.src);
      if (!existsSync(path)) { check(`${id} : la capture ${shot.src} existe`, false, shot.src); continue; }
      const size = pngSize(readFileSync(path));
      check(`${id} : la capture ${shot.src} fait ${shot.w} x ${shot.h} comme le manifeste le dit`, size.w === shot.w && size.h === shot.h && shot.w > 0 && shot.h > 0, { file: size, manifest: [shot.w, shot.h] });
    }
    if (/\.png$/.test(entry.screenshot || '') && existsSync(join(root, entry.screenshot))) {
      const size = pngSize(readFileSync(join(root, entry.screenshot)));
      check(`${id} : la vignette est un PNG lisible`, size.w > 0 && size.h > 0, size);
    }
    if (!entry.pack) { check(`${id} : sans pack, sans pastille ni capture`, !(entry.shows || []).length && !(entry.preview || []).length, entry); continue; }

    const f = entryFiles(root, entry);
    if (f.exemple) {
      const capturesPath = join(f.dir, 'captures.json');
      const recorded = existsSync(capturesPath) ? readJson(capturesPath) : null;
      const hash = inputsHash(root, entry);
      check(`${id} : les captures sont à jour (node dev-tests/gallery-captures.mjs --only ${id})`, !!recorded && recorded.hash === hash, { recorded: recorded && recorded.hash, wanted: hash });
      check(`${id} : le manifeste porte les captures de captures.json, dans l'ordre`, !!recorded && JSON.stringify(entry.preview || []) === JSON.stringify(recorded.preview), { manifest: entry.preview, recorded: recorded && recorded.preview });
      check(`${id} : la vignette du manifeste est celle de captures.json`, !!recorded && entry.screenshot === recorded.thumb.src, { manifest: entry.screenshot, recorded: recorded && recorded.thumb });
      const pages = (f.exemple.captures || []).reduce((n, c) => n + (c.pages || [1]).length, 0);
      check(`${id} : une image par page demandée dans exemple.json (${pages})`, !!recorded && recorded.preview.length === pages, { pages, images: recorded && recorded.preview.length });
    } else {
      check(`${id} : sans exemple.json, pas de capture à garder à jour`, !(entry.preview || []).length || gallery.dev, entry.preview);
    }

    const shows = entry.shows || [];
    const headerFooter = entry.headerFooter && existsSync(join(root, entry.headerFooter)) ? readFileSync(join(root, entry.headerFooter), 'utf8') : '';
    check(`${id} : au plus 6 pastilles « Fonctions montrées »`, shows.length <= 6, shows);
    check(`${id} : des pastilles sans doublon`, new Set(shows).size === shows.length, shows);
    for (const key of shows) {
      seenKeys.add(key);
      check(`${id} : la pastille « ${key} » a son libellé français et anglais`, !!labels[key] && !!labels[key].fr && !!labels[key].en, labels[key]);
      const proof = PROOFS[key];
      check(`${id} : la pastille « ${key} » a une preuve dans ce script et le modèle la donne`, typeof proof === 'function' && proof({ html: f.html, pack: f.pack, headerFooter, entry }) === true, typeof proof === 'function' ? 'le modèle ne contient pas la fonction' : 'pas de preuve écrite pour cette clé');
    }
  }
}

console.log('\n== Libellés et lecture par le widget ==');
const allLabelKeys = Object.keys(labels);
const unused = allLabelKeys.filter((k) => !seenKeys.has(k));
check('chaque libellé gallery.shows.* est utilisé par au moins un modèle d’un catalogue', !unused.length, unused);
const jsFiles = readdirSync(join(ROOT, 'js')).filter((n) => /\.js$/.test(n));
const reads = jsFiles.filter((n) => /exemple\.json|\.exemple\b/.test(readFileSync(join(ROOT, 'js', n), 'utf8')));
check('aucun fichier de js/ ne lit les lignes d’exemple (elles ne servent qu’aux captures)', !reads.length, reads);

console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
