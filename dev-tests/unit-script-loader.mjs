#!/usr/bin/env node
// Tests purs (sans navigateur) du chargeur de scripts des exports : js/export-common.js (ExportCommon.scriptRefusal et ExportCommon.loadScriptOnce) - cf. dev-tests/unit-harness.mjs
// pour le contexte général. Audit externe de la bêta, 04/10, point C-EXFIL-05 (« URL de script dynamique ») : la bibliothèque à charger vient de sept constantes écrites dans le code (pdfmake et
// ses polices, JSZip, pdf-lib, ExcelJS, qrcode-generator, docx), et le chargeur refuse tout le reste AVANT d'ajouter la balise :
//  1) une adresse n'est permise que si elle vient d'un des deux CDN de la politique de sécurité du contenu (cdnjs.cloudflare.com, cdn.jsdelivr.net), en https, ET porte une empreinte SRI
//     (sha256, sha384 ou sha512), ou si elle vient du dépôt lui-même (même origine que la page, sans empreinte) ;
//  2) tout autre site, un faux CDN (`cdnjs.cloudflare.com.autre.site`, `cdn.jsdelivr.net@autre.site`), le http, un schéma javascript: ou data:, une adresse vide ou illisible, une empreinte
//     absente ou d'un autre algorithme sont refusés, et la promesse est rejetée sans que le document reçoive la moindre balise ;
//  3) les sept bibliothèques du widget passent la règle (une huitième, ajoutée sans empreinte ou depuis un autre site, la ferait échouer ici).
// Lancer : node dev-tests/unit-script-loader.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'https://widget.exemple.test';
const SRI = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';

// Un faux document : createElement('script') donne un objet que appendChild « charge » aussitôt (onload) ; rien d'autre n'est simulé.
function fresh() {
  const appended = [];
  const document = {
    baseURI: PAGE + '/dossier/index.html',
    createElement: () => ({}),
    head: { appendChild(el) { appended.push(el); queueMicrotask(() => el.onload && el.onload()); } },
  };
  const ctx = createContext({ document, window: { location: { origin: PAGE } }, URL, console });
  loadScript(ctx, 'js/export-common.js');
  return { ctx, appended, refusal: lib => { ctx.__lib = lib; return evalIn(ctx, 'ExportCommon.scriptRefusal(__lib)'); }, load: lib => { ctx.__lib = lib; return evalIn(ctx, 'ExportCommon.loadScriptOnce(__lib)'); } };
}

async function main() {
  const { refusal, load, appended } = fresh();

  // 1. Permises : les deux CDN en https avec empreinte, et le dépôt (relatif ou absolu, sans empreinte).
  const allowed = [
    ['cdnjs avec sha384', { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', integrity: SRI }],
    ['jsDelivr avec sha384', { src: 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js', integrity: SRI }],
    ['cdnjs avec sha256', { src: 'https://cdnjs.cloudflare.com/x.js', integrity: 'sha256-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG=' }],
    ['cdnjs avec sha512', { src: 'https://cdnjs.cloudflare.com/x.js', integrity: 'sha512-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG+/==' }],
    ['dépôt, adresse relative, sans empreinte', { src: 'js/autre.js' }],
    ['dépôt, adresse absolue, sans empreinte', { src: PAGE + '/js/autre.js' }],
  ];
  for (const [label, lib] of allowed) check('permis : ' + label, refusal(lib) === '', refusal(lib));

  // 2. Refusées : chacune dit pourquoi, et le chargeur ne touche pas au document.
  const refused = [
    ['un autre site avec empreinte', { src: 'https://evil.example/x.js', integrity: SRI }, 'origine non permise'],
    ['un faux CDN (le nom du CDN en sous-domaine d\'un autre site)', { src: 'https://cdnjs.cloudflare.com.evil.example/x.js', integrity: SRI }, 'origine non permise'],
    ['un faux CDN (le nom du CDN avant un @)', { src: 'https://cdn.jsdelivr.net@evil.example/x.js', integrity: SRI }, 'origine non permise'],
    ['une adresse sans schéma qui part sur un autre site', { src: '//evil.example/x.js', integrity: SRI }, 'origine non permise'],
    ['le CDN en http', { src: 'http://cdnjs.cloudflare.com/ajax/libs/x.js', integrity: SRI }, 'origine non permise'],
    ['un schéma javascript:', { src: 'javascript:alert(1)', integrity: SRI }, 'origine non permise'],
    ['un schéma data:', { src: 'data:text/javascript,alert(1)', integrity: SRI }, 'origine non permise'],
    ['un schéma blob:', { src: 'blob:https://widget.exemple.test/abc', integrity: SRI }, 'origine non permise'],
    ['un CDN sans empreinte', { src: 'https://cdnjs.cloudflare.com/ajax/libs/x.js' }, 'empreinte absente ou illisible'],
    ['un CDN avec une empreinte vide', { src: 'https://cdnjs.cloudflare.com/ajax/libs/x.js', integrity: '' }, 'empreinte absente ou illisible'],
    ['un CDN avec une empreinte d\'un autre algorithme', { src: 'https://cdnjs.cloudflare.com/ajax/libs/x.js', integrity: 'md5-abcdef==' }, 'empreinte absente ou illisible'],
    ['un CDN avec une empreinte mal formée', { src: 'https://cdnjs.cloudflare.com/ajax/libs/x.js', integrity: 'sha384-pas valide !' }, 'empreinte absente ou illisible'],
    ['une adresse vide', { src: '' }, 'adresse absente'],
    ['aucune adresse', {}, 'adresse absente'],
    ['aucune bibliothèque', null, 'adresse absente'],
  ];
  for (const [label, lib, why] of refused) {
    const before = appended.length;
    let rejected = false;
    let message = '';
    try { await load(lib); } catch (e) { rejected = true; message = String(e && e.message); }
    check('refusé : ' + label, refusal(lib) === why && rejected && /^Script refusé/.test(message) && appended.length === before, `${refusal(lib)} | ${message} | balises ajoutées : ${appended.length - before}`);
  }

  // 3. Une bibliothèque permise s'ajoute une fois, avec son empreinte et crossOrigin ; celle du dépôt sans empreinte.
  const before = appended.length;
  await load(allowed[0][1]);
  const cdn = appended[before];
  check('chargé : un CDN permis ajoute une balise avec son adresse, son empreinte et crossOrigin anonymous', appended.length === before + 1 && cdn.src === allowed[0][1].src && cdn.integrity === SRI && cdn.crossOrigin === 'anonymous', JSON.stringify(cdn));
  await load(allowed[4][1]);
  const own = appended[before + 1];
  check('chargé : un fichier du dépôt ajoute une balise sans empreinte ni crossOrigin', appended.length === before + 2 && own.src === 'js/autre.js' && own.integrity === undefined && own.crossOrigin === undefined, JSON.stringify(own));

  // 4. Les bibliothèques du widget : chacune écrite `{ src: '…', integrity: '…' }` dans js/ passe la règle.
  const libs = [];
  for (const name of readdirSync(join(ROOT, 'js')).filter(n => n.endsWith('.js'))) {
    const text = readFileSync(join(ROOT, 'js', name), 'utf8');
    for (const m of text.matchAll(/\{\s*src:\s*'(https:\/\/[^']+)'\s*,\s*integrity:\s*'([^']+)'\s*\}/g)) libs.push({ file: name, src: m[1], integrity: m[2] });
  }
  const refusedLibs = libs.filter(lib => refusal(lib) !== '').map(lib => `${lib.file} : ${lib.src}`);
  check('bibliothèques : au moins les sept du widget sont trouvées dans js/ (garde-fou de l\'analyse elle-même)', libs.length >= 7, libs.length + ' trouvées');
  check('bibliothèques : chacune vient d\'un CDN permis avec son empreinte', refusedLibs.length === 0, refusedLibs.join(', '));
  const withoutSri = [];
  for (const name of readdirSync(join(ROOT, 'js')).filter(n => n.endsWith('.js'))) {
    const text = readFileSync(join(ROOT, 'js', name), 'utf8');
    for (const m of text.matchAll(/\{\s*src:\s*'(https:\/\/[^']+)'\s*\}/g)) withoutSri.push(`${name} : ${m[1]}`);
  }
  check('bibliothèques : aucune adresse de CDN n\'est écrite sans empreinte', withoutSri.length === 0, withoutSri.join(', '));
}

main().then(summarizeAndExit);
