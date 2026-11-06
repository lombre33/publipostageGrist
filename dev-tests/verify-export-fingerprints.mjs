#!/usr/bin/env node
// Empreintes des exports, pour qu'une refactorisation de pdf-export.js, docx-export.js, pptx-export.js ou xlsx-export.js ne change RIEN à ce qu'ils écrivent (lot 0b, demande du 06/11).
// Les groupes `docx`, `pdfFidelity`, `pdfGroundTruth`… prouvent des cas choisis ; ils ne voient pas la dérive d'un point dans un document qu'ils n'ont pas prévu. Ici le corpus est celui
// des modèles de la galerie (`templates-gallery/*/template.html`, 22 modèles réels) et des documents d'essai de la galerie de dev (`templates-gallery-dev/*/template.html`), chacun passé
// par SIX exports dans le vrai widget : PDF (le docDefinition de pdfmake ET les positions de sa mise en page, sans les octets du PDF qui portent une date), Word, Excel, PowerPoint
// (le zip ouvert : chaque partie XML, les médias par leur taille et leur empreinte), Markdown et HTML. Chaque résultat est ramené à un texte stable (clés triées, nombres arrondis au
// millième, dates figées), puis comparé à ce que le MÊME code, sur la MÊME machine et le MÊME Chromium, rendait avant.
// Le relevé n'est donc PAS commité : le rendu dépend un peu du navigateur (le DOM se sérialise autrement d'une version de Chromium à l'autre, cf. betaCompat). Il se gèle juste avant
// une série de découpes, sur le code d'origin/main, puis se rejoue après chacune. Ce n'est pas un groupe de la suite complète : il se lance à la main.
//   node dev-tests/verify-export-fingerprints.mjs --freeze          # gèle .export-fingerprints/baseline/ (≈ 2 à 4 minutes)
//   node dev-tests/verify-export-fingerprints.mjs                   # rejoue et compare ; les textes sont dans .export-fingerprints/last/, la première différence est affichée
//   options : --only facture,bulletin   --kinds pdf,docx,xlsx,pptx,md,html   --self-test (les détecteurs seuls, sans navigateur)
// Rend « N/M passés » comme les autres scripts Node ; code 1 s'il y a une différence ou une erreur nouvelle.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const HERE = new URL('.', import.meta.url).pathname;
const ROOT = join(HERE, '..');
const STORE = join(HERE, '.export-fingerprints');
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGM4gQMwDC0JAJwulgGh6TLjAAAAAElFTkSuQmCC';
const KINDS_ALL = ['pdf', 'docx', 'xlsx', 'pptx', 'md', 'html'];

// ---- Ce qu'on compare ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const sha = text => createHash('sha1').update(text).digest('hex').slice(0, 12);

// La première différence entre deux textes, en lignes : { line, before, after } ou null.
export function firstDifference(before, after) {
  if (before === after) return null;
  const a = before.split('\n');
  const b = after.split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return { line: i + 1, before: (a[i] ?? '(fin du texte)').slice(0, 300), after: (b[i] ?? '(fin du texte)').slice(0, 300) };
  return null;
}

// Compare deux relevés { clé: empreinte } : ce qui change, ce qui disparaît, ce qui apparaît.
export function compareFingerprints(frozen, live) {
  const changed = [];
  const removed = [];
  const added = [];
  for (const key of Object.keys(frozen)) {
    if (!(key in live)) removed.push(key);
    else if (frozen[key] !== live[key]) changed.push(key);
  }
  for (const key of Object.keys(live)) if (!(key in frozen)) added.push(key);
  return { changed, removed, added };
}

// ---- Le corpus --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function corpus(only) {
  const docs = [];
  for (const [folder, prefix, hfName] of [['templates-gallery', '', 'header-footer.json'], ['templates-gallery-dev', 'dev-', 'headerfooter.json']]) {
    const base = join(ROOT, folder);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const file = join(base, name, 'template.html');
      if (!existsSync(file)) continue;
      const doc = { name: prefix + name, html: readFileSync(file, 'utf8'), headerFooter: null, grid: false };
      for (const hf of [hfName, 'header-footer.json', 'headerfooter.json']) {
        const p = join(base, name, hf);
        if (existsSync(p)) { try { doc.headerFooter = JSON.parse(readFileSync(p, 'utf8')); } catch { /* en-tête illisible : ignoré */ } break; }
      }
      const pack = join(base, name, 'pack.json');
      if (existsSync(pack)) { try { doc.grid = (JSON.parse(readFileSync(pack, 'utf8')).template || {}).type === 'grille'; } catch { /* pas de pack lisible */ } }
      if (!only.length || only.includes(doc.name) || only.includes(name)) docs.push(doc);
    }
  }
  return docs;
}

// ---- Dans la page ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Rend, pour un document et un genre, le texte stable de son export (ou « ERREUR : … » : une erreur est aussi une empreinte, elle ne doit pas apparaître ni disparaître).
async function inPage(doc, kind) {
  const round = n => Math.round(n * 1000) / 1000;
  const hashBytes = bytes => { let h = 5381; for (let i = 0; i < bytes.length; i++) h = ((h * 33) ^ bytes[i]) >>> 0; return h.toString(16); };
  const canon = (value, seen = new Set()) => {
    if (typeof value === 'function') return '[fonction]';
    if (typeof value === 'number') return Number.isFinite(value) ? round(value) : String(value);
    if (typeof value === 'string') {
      if (/^data:/.test(value)) { const comma = value.indexOf(','); return value.slice(0, Math.min(comma < 0 ? 40 : comma, 60)) + ' [' + (value.length - comma - 1) + ' octets, ' + hashBytes(new TextEncoder().encode(value.slice(comma + 1, comma + 4001))) + ']'; }
      return value;
    }
    if (value === null || typeof value !== 'object') return value;
    if (typeof Node !== 'undefined' && value instanceof Node) return '[noeud]';
    if (seen.has(value)) return '[cycle]';
    seen.add(value);
    let out;
    if (Array.isArray(value)) out = value.map(v => canon(v, seen));
    else {
      out = {};
      for (const key of Object.keys(value).sort()) {
        // `_…` : les dimensions que pdfmake ajoute pendant sa mise en page, déjà dites par `positions`.
        if (key.startsWith('_')) continue;
        out[key] = canon(value[key], seen);
      }
    }
    seen.delete(value);
    return out;
  };
  const prettyXml = xml => xml.replace(/>\s+</g, '><').replace(/></g, '>\n<').trim();
  const zipText = async blob => {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
    const out = [];
    for (const name of names) {
      if (/^docProps\//.test(name)) continue; // dates de création et nom du programme
      if (/\.(xml|rels|vml)$/.test(name)) out.push('=== ' + name + '\n' + prettyXml(await zip.file(name).async('string')));
      else { const bytes = await zip.file(name).async('uint8array'); out.push('=== ' + name + ' (' + bytes.length + ' octets, ' + hashBytes(bytes) + ')'); }
    }
    return out.join('\n');
  };
  try {
    if (kind === 'pdf') {
      await PdfExport.ensurePdfLibsLoaded();
      let last = null;
      const gens = [];
      const original = window.pdfMake.createPdf;
      window.pdfMake.createPdf = function (definition) {
        last = definition;
        const gen = original.call(window.pdfMake, definition);
        gen.download = function () {};
        gens.push(gen);
        return gen;
      };
      try { await PdfExport.getNativePdfBlobForRecord(doc.html, null, {}, '', doc.headerFooter, undefined, doc.grid, undefined); } finally { window.pdfMake.createPdf = original; }
      await new Promise(resolve => gens[gens.length - 1].getBase64(resolve));
      return JSON.stringify(canon(last), null, 1);
    }
    if (kind === 'docx') {
      await DocxExport.ensureDocxLibLoaded();
      const { blob } = await DocxExport.getDocxBlobForRecord(doc.html, null, {}, '', doc.headerFooter, null);
      return await zipText(blob);
    }
    if (kind === 'xlsx') {
      await XlsxExport.ensureExcelLibLoaded();
      const { blob } = await XlsxExport.getXlsxBlobForRecord(doc.html, null, {}, '', undefined);
      return await zipText(blob);
    }
    if (kind === 'pptx') {
      const { blob } = await PptxExport.getPptxBlobForRecord(doc.html, null, {}, '', doc.headerFooter, undefined);
      return await zipText(blob);
    }
    if (kind === 'md') {
      const { blob } = await MarkdownExport.getMarkdownBlobForRecord(doc.html, null, {}, '', doc.headerFooter);
      return await blob.text();
    }
    if (kind === 'html') {
      const { blob } = await HtmlExport.getHtmlBlobForRecord(doc.html, null, {}, '', doc.headerFooter, {});
      return await blob.text();
    }
    return 'ERREUR : genre inconnu ' + kind;
  } catch (e) {
    return 'ERREUR : ' + String((e && e.message) || e).split('\n')[0].slice(0, 200);
  }
}

// ---- Le programme ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const freeze = args.includes('--freeze');
  const only = (option('--only') || '').split(',').filter(Boolean);
  const kinds = (option('--kinds') || KINDS_ALL.join(',')).split(',').filter(k => KINDS_ALL.includes(k));

  if (args.includes('--self-test')) {
    let pass = 0;
    let total = 0;
    const check = (name, ok) => { total++; if (ok) pass++; console.log(`  ${ok ? 'ok  ' : 'ECHEC'} ${name}`); };
    check('détecteur : deux textes égaux n\'ont pas de différence', firstDifference('a\nb', 'a\nb') === null);
    check('détecteur : la première ligne qui change est donnée', (() => { const d = firstDifference('a\nb\nc', 'a\nX\nc'); return d && d.line === 2 && d.before === 'b' && d.after === 'X'; })());
    check('détecteur : un texte plus court est vu', firstDifference('a\nb', 'a').line === 2);
    check('détecteur : une empreinte qui change, disparaît ou apparaît est vue', (() => { const d = compareFingerprints({ a: '1', b: '2', c: '3' }, { a: '1', b: '9', d: '4' }); return d.changed.join() === 'b' && d.removed.join() === 'c' && d.added.join() === 'd'; })());
    check('détecteur : sha est stable et change avec le texte', sha('x') === sha('x') && sha('x') !== sha('y'));
    console.log(`${pass}/${total} passés`);
    process.exit(pass === total ? 0 : 1);
  }

  const { open } = await import('./load-lib.mjs');
  const docs = corpus(only);
  if (!docs.length) { console.error('Aucun document dans le corpus.'); process.exit(2); }
  const baselineDir = join(STORE, 'baseline');
  const lastDir = join(STORE, 'last');
  if (!freeze && !existsSync(join(STORE, 'baseline.json'))) {
    console.error('Aucun relevé gelé. Le geler d\'abord, sur le code d\'origine : node dev-tests/verify-export-fingerprints.mjs --freeze');
    process.exit(2);
  }
  const w = await open({
    port: Number(process.env.EXPORT_FINGERPRINT_PORT || 9215),
    onPage: async page => {
      await page.clock.setFixedTime(new Date('2026-01-15T10:00:00Z'));
      // Les images d'un autre site (le document « vitrine » en a quatre, picsum.photos) ne se chargent pas dans un conteneur sans réseau et l'export les attend : toutes rendent la même petite image.
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]*\/.*\.(png|jpe?g|gif|webp)(\?.*)?$|picsum\.photos/, route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64') }));
    },
  });
  // Les images d'un autre site restent bloquées jusqu'à un clic (js/external-images.js) : l'export attendrait pour rien ; on les montre, elles rendent toutes la même petite image.
  await w.page.evaluate(async () => { ExternalImages.allow('picsum.photos'); await ExportEngines.loadAll(); });
  const targetDir = freeze ? baselineDir : lastDir;
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  const live = {};
  const texts = {};
  const t0 = Date.now();
  for (const doc of docs) {
    for (const kind of kinds) {
      const key = `${doc.name}:${kind}`;
      // Un export qui n'en finit pas (une fenêtre qu'il attend, un réseau absent) arrête le relevé : un délai ne se compare à rien.
      const text = await Promise.race([
        w.page.evaluate(([d, k, fn]) => (0, eval)('(' + fn + ')')(d, k), [doc, kind, inPage.toString()]),
        new Promise((_, stop) => setTimeout(() => stop(new Error(`l'export ${key} ne rend rien au bout de 90 s`)), 90000)),
      ]).catch(e => { console.error('\n' + e.message); process.exit(2); });
      texts[key] = text;
      live[key] = sha(text);
      writeFileSync(join(targetDir, `${doc.name}.${kind}.txt`), text);
    }
    process.stdout.write(`  ${doc.name} `);
  }
  await w.close();
  console.log(`\n${Object.keys(live).length} exports en ${Math.round((Date.now() - t0) / 1000)} s ; ${Object.values(texts).filter(t => t.startsWith('ERREUR')).length} en erreur (une erreur est aussi une empreinte).`);

  if (freeze) {
    // Un gel ne remplace que ce qu'il a rejoué (--only, --kinds) : le reste du relevé précédent reste.
    const path = join(STORE, 'baseline.json');
    const previous = existsSync(path) && (only.length || kinds.length < KINDS_ALL.length) ? JSON.parse(readFileSync(path, 'utf8')) : {};
    writeFileSync(path, JSON.stringify({ ...previous, ...live }, null, 1) + '\n');
    console.log(`Relevé gelé : ${Object.keys({ ...previous, ...live }).length} empreintes dans dev-tests/.export-fingerprints/.`);
    process.exit(0);
  }

  const frozen = JSON.parse(readFileSync(join(STORE, 'baseline.json'), 'utf8'));
  // On ne compare que ce qui a été rejoué.
  const scoped = Object.fromEntries(Object.entries(frozen).filter(([key]) => key in live || (!only.length && kinds.includes(key.split(':')[1]))));
  const diff = compareFingerprints(scoped, live);
  let pass = 0;
  for (const key of Object.keys(live)) {
    if (key in scoped && scoped[key] === live[key]) { pass++; continue; }
    if (!(key in scoped)) continue;
    const [name, kind] = key.split(':');
    const baseText = existsSync(join(baselineDir, `${name}.${kind}.txt`)) ? readFileSync(join(baselineDir, `${name}.${kind}.txt`), 'utf8') : '';
    const d = firstDifference(baseText, texts[key]);
    console.log(`  ECHEC ${key} : l'export a changé${d ? ` (ligne ${d.line})\n        avant : ${d.before}\n        après : ${d.after}` : ''}\n        textes : dev-tests/.export-fingerprints/baseline/${name}.${kind}.txt et last/${name}.${kind}.txt`);
  }
  for (const key of diff.removed) console.log(`  ECHEC ${key} : plus d'export`);
  if (diff.added.length) console.log(`  ... ${diff.added.length} export(s) nouveau(x) sans empreinte gelée : ${diff.added.slice(0, 6).join(', ')}`);
  console.log(`${pass}/${Object.keys(scoped).length} passés`);
  process.exit(pass === Object.keys(scoped).length && !diff.removed.length ? 0 : 1);
}
