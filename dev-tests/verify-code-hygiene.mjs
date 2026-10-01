#!/usr/bin/env node
// Garde-fou d'hygiène du code - Node pur, aucun navigateur (< 1 s). Enregistré dans NODE_SCRIPTS de run-headless.mjs (groupe `codeHygiene`).
//
// Le nettoyage du 29/09/2026 a retiré des restes que RIEN à l'écran ne trahit, donc qu'aucun test fonctionnel ne peut voir : ils ne cassent jamais, ils
// s'accumulent (AUDIT_CODE.md en signalait déjà certains en septembre, jamais retirés). Ce script attrape leur retour :
//   1. une clé de js/i18n.js que plus aucun script ni index.html ne demande (et une clé déclarée deux fois : la dernière écrase l'autre en silence) ;
//   2. une variable CSS déclarée (--x: ...) que plus aucune règle ni aucun script ne lit ;
//   3. une règle CSS dont CHAQUE sélecteur vise une classe ou un id que ni index.html, ni un script, ni un modèle de la galerie ne produit ;
//   4. une aide d'export recopiée au lieu d'être appelée dans js/export-common.js (chargeur de script CDN, téléchargement d'un Blob, mesure des colonnes d'un
//      tableau, hôte de mesure, résolution des variables d'en-tête/pied) : PDF, DOCX, PDF unique et les lots ZIP de js/main.js s'en servent tous.
//   5. la conversion « Page n » / « n/total » d'un numéro de page recopiée hors de js/page-layout.js (aperçu paginé, mode Lecture, export PDF).
//   6. le vocabulaire de l'interface que la personne lit (choix d'Antoine du 29/09) : « modèle » et jamais « template » en français, un pluriel écrit
//      `{n|singulier|pluriel}` et jamais « ligne(s) », une seule façon d'écrire l'option vide d'une liste (« — Choisir une colonne — »), « macro-modèle ».
//   7. une boîte du navigateur (prompt, confirm) au lieu des fenêtres du widget, ou une saisie / confirmation appelée sans `await` (choix d'Antoine du 29/09).
//   8. js/xlsx-export.js qui lit un style calculé (getComputedStyle) : il suivrait le thème sombre de l'éditeur.
//   9. un z-index de 100 ou plus écrit en dur sur une couche flottante (barre, menu, liste, popup, info-bulle) au lieu d'un jeton --z-* de css/style.css (retour d'Antoine du 01/10) ;
//      un jeton --z-* déclaré dans une autre feuille, un z-index en `!important` (un popup de fenêtre passe par Layers.raise(popup, fenêtre)), un z-index posé en ligne hors js/layers.js.
//
// Volontairement PERMISSIF : un nom cité seulement dans un commentaire compte comme utilisé, un préfixe construit (`'toc-level-' + n`) couvre toute la
// famille. Le but est de ne jamais faire échouer un changement légitime, seulement d'attraper ce qui n'a plus AUCUN point d'entrée. Une classe posée
// par une bibliothèque (TipTap, prosemirror-tables) n'apparaît dans aucun de nos fichiers : elle va dans LIBRARY_CLASSES ci-dessous, avec sa source.
//
// Lancer : node dev-tests/verify-code-hygiene.mjs
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

function listFiles(dir, re) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...listFiles(rel, re));
    else if (re.test(name)) out.push(rel);
  }
  return out;
}

// Classes présentes dans le DOM sans qu'aucun de NOS fichiers ne les écrive : posées par TipTap / prosemirror-tables.
const LIBRARY_CLASSES = new Set([
  'is-editor-empty',     // extension Placeholder de TipTap
  'selectedCell',        // prosemirror-tables : cellule sélectionnée
  'column-resize-handle', // prosemirror-tables : poignée de largeur de colonne
  'resize-cursor',       // prosemirror-tables : curseur pendant le survol d'une bordure
  'ProseMirror-selectednode', // prosemirror-view : nœud « atome » sélectionné (la bulle choisie d'une variable ou d'un calcul)
]);

const jsFiles = listFiles('js', /\.js$/);
const cssFiles = listFiles('css', /\.css$/);
const galleryFiles = [...listFiles('templates-gallery', /\.(html|json)$/), ...listFiles('templates-gallery-dev', /\.(html|json)$/)];
// Tout ce qui PRODUIT du DOM ou consomme des noms : la page, les scripts, les modèles livrés.
const producerText = ['index.html', ...jsFiles, ...galleryFiles].map(read).join('\n');

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
const noCommentsJs = code => code.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// ============================================================================
// 1. Clés i18n
// ============================================================================
{
  const i18nSource = read('js/i18n.js');
  const keys = [...i18nSource.matchAll(/^\s*'([A-Za-z0-9_.-]+)'\s*:\s*\{/gm)].map(m => m[1]);
  const consumerText = ['index.html', ...jsFiles.filter(f => f !== 'js/i18n.js'), ...galleryFiles].map(read).join('\n');
  // 'varLoop.repeat.' + kind  ou  `varLoop.repeat.${kind}` : le préfixe couvre toutes les clés de la famille.
  const dynamicPrefixes = [...consumerText.matchAll(/['"`]([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*\.)(?:['"`]|\$\{)/g)].map(m => m[1]);
  const isUsed = k => consumerText.includes(`'${k}'`) || consumerText.includes(`"${k}"`) || consumerText.includes('`' + k + '`') || dynamicPrefixes.some(p => k.startsWith(p));
  const unused = keys.filter(k => !isUsed(k));
  check('i18n : les clés se lisent bien (garde-fou de l\'analyse elle-même)', keys.length > 400, `${keys.length} clés trouvées`);
  check('i18n : aucune clé de js/i18n.js sans usage', unused.length === 0, unused.join(', '));
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  check('i18n : aucune clé déclarée deux fois', dupes.length === 0, dupes.join(', '));
}

// ============================================================================
// 2. Variables CSS
// ============================================================================
{
  const cssText = cssFiles.map(f => stripComments(read(f)).replace(/url\([^)]*\)/g, 'url()')).join('\n');
  const readers = cssText + '\n' + producerText;
  const declared = new Set([...cssText.matchAll(/(?<![\w-])(--[A-Za-z0-9_-]+)\s*:/g)].map(m => m[1]));
  const dead = [];
  for (const name of declared) {
    const re = new RegExp(`(?<![\\w-])${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![\\w-])`, 'g');
    const occurrences = (readers.match(re) || []).length;
    const declarations = (cssText.match(new RegExp(`(?<![\\w-])${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*:`, 'g')) || []).length;
    if (occurrences - declarations <= 0) dead.push(name);
  }
  check('variables CSS : les déclarations se lisent bien (garde-fou de l\'analyse elle-même)', declared.size >= 12, `${declared.size} variables trouvées`);
  check('variables CSS : aucune variable déclarée sans lecteur', dead.length === 0, dead.join(', '));
}

// ============================================================================
// 3. Règles CSS sans point d'entrée
// ============================================================================
{
  const universe = new Set(producerText.match(/[A-Za-z_][A-Za-z0-9_-]*/g));
  const prefixes = [...universe].filter(t => /[-_]$/.test(t));
  const isKnown = tok => universe.has(tok) || LIBRARY_CLASSES.has(tok) || prefixes.some(p => tok.startsWith(p));

  // Retire les pseudo-classes fonctionnelles (:not(.x), :is(...), :has(...)) : leur contenu n'est pas REQUIS pour qu'un sélecteur s'applique.
  function withoutFunctionalPseudos(sel) {
    let prev;
    do { prev = sel; sel = sel.replace(/:(?:not|is|where|has)\([^()]*\)/g, ''); } while (sel !== prev);
    return sel;
  }

  const deadRules = [];
  let ruleCount = 0;
  for (const file of cssFiles) {
    // Textes et url(...) neutralisés (un « { » ou un « ; » dans un data-URI fausserait le découpage), commentaires blanchis en gardant les retours à la ligne.
    const css = stripComments(read(file)).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/url\([^)]*\)/g, 'url()');
    let buffer = '';
    let line = 1;
    let bufferStartLine = 1;
    for (const ch of css) {
      if (ch === '\n') line++;
      if (ch === '{') {
        const prelude = buffer.trim();
        if (prelude && !prelude.startsWith('@')) {
          ruleCount++;
          const selectors = prelude.split(',').map(s => s.trim()).filter(Boolean);
          const unknownPerSelector = selectors.map(sel => {
            const bare = withoutFunctionalPseudos(sel).replace(/\[[^\]]*\]/g, '');
            const tokens = [...bare.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map(m => m[1]);
            return tokens.filter(t => !isKnown(t));
          });
          if (unknownPerSelector.every(u => u.length)) deadRules.push(`${file}:${bufferStartLine} ${prelude.replace(/\s+/g, ' ').slice(0, 90)} <- ${[...new Set(unknownPerSelector.flat())].join(', ')}`);
        }
        buffer = '';
        bufferStartLine = line;
      } else if (ch === '}' || ch === ';') {
        buffer = '';
        bufferStartLine = line;
      } else {
        if (!buffer.trim() && /\S/.test(ch)) bufferStartLine = line;
        buffer += ch;
      }
    }
  }
  check('CSS : les règles se lisent bien (garde-fou de l\'analyse elle-même)', ruleCount >= 400, `${ruleCount} règles trouvées`);
  check('CSS : aucune règle ne vise une classe ou un id que rien ne produit', deadRules.length === 0, '\n    ' + deadRules.join('\n    '));
}

// ============================================================================
// 4. Aides d'export : une seule définition, dans js/export-common.js
// ============================================================================
{
  const SHARED = ['loadScriptOnce', 'downloadBlob', 'attachMeasureHost', 'measuredColumnWidthsPx', 'resolveHeaderFooterVariables'];
  const sources = jsFiles.map(f => [f, read(f)]);
  const definedIn = name => sources.filter(([, text]) => new RegExp(`function\\s+${name}\\s*\\(`).test(text)).map(([f]) => f);
  check('export-common.js : les cinq aides partagées y sont définies', SHARED.every(n => definedIn(n).includes('js/export-common.js')), SHARED.filter(n => !definedIn(n).includes('js/export-common.js')).join(', '));
  const copies = SHARED.flatMap(n => definedIn(n).filter(f => f !== 'js/export-common.js').map(f => `${n} dans ${f}`));
  check('export : aucune de ces aides n\'est recopiée ailleurs', copies.length === 0, copies.join(', '));
  const others = sources.filter(([f]) => f !== 'js/export-common.js');
  const loaders = others.filter(([, t]) => /createElement\(\s*['"]script['"]\s*\)/.test(t)).map(([f]) => f);
  check('export : un seul chargeur de script CDN (createElement("script") hors export-common.js)', loaders.length === 0, loaders.join(', '));
  const downloads = others.filter(([, t]) => /\.download\s*=/.test(t)).map(([f]) => f);
  check('export : un seul téléchargement de Blob (<a>.download hors export-common.js)', downloads.length === 0, downloads.join(', '));
  // JSZip (archive des lots ZIP) se charge seul depuis export-common.js : le lot PDF (pdfmake, polices, ~4 Mo) n'a pas à le traîner, ni le lot DOCX à charger le PDF pour lui.
  const jsZipLoaders = others.filter(([, t]) => /jszip\/[\d.]+\/jszip/i.test(t)).map(([f]) => f);
  check('export : JSZip ne se charge que par ExportCommon.ensureJsZipLoaded, hors du lot PDF', jsZipLoaders.length === 0 && /jszip\/[\d.]+\/jszip/i.test(read('js/export-common.js')), jsZipLoaders.join(', '));
}

// ============================================================================
// 5. Numéro de page : une seule conversion, dans js/page-layout.js
// ============================================================================
{
  // Aperçu paginé de l'éditeur, mode Lecture et export PDF recopiaient « Page n » / « n/total » chacun ; ils appellent PageLayout.pageNumberText.
  // js/docx-export.js branche, lui, sur les mêmes formats pour poser de vrais champs PAGE/NUMPAGES : autre besoin, hors de cette règle.
  const copies = jsFiles.filter(f => f !== 'js/page-layout.js' && f !== 'js/docx-export.js' && /===\s*['"]n-slash-total['"]/.test(read(f)));
  check('numéro de page : le format « n/total » n\'est converti en texte que dans js/page-layout.js', copies.length === 0, copies.join(', '));
  const named = jsFiles.filter(f => /function\s+(?:resolvePageNumberBadgesForPreview|formatPageNumberText)\s*\(/.test(read(f)));
  check('numéro de page : plus de copie locale de la conversion (resolvePageNumberBadgesForPreview, formatPageNumberText)', named.length === 0, named.join(', '));
}

// ============================================================================
// 6. Vocabulaire des textes de l'interface
// ============================================================================
{
  const i18nSource = read('js/i18n.js');
  // Une entrée par ligne : 'clé': { fr: '…', en: '…' } (guillemets simples, apostrophes typographiques dans le texte, `\'` échappé au besoin).
  const quoted = "'((?:[^'\\\\]|\\\\.)*)'";
  const entries = [...i18nSource.matchAll(new RegExp(`^\\s*'([A-Za-z0-9_.-]+)'\\s*:\\s*\\{\\s*fr:\\s*${quoted}\\s*,\\s*en:\\s*${quoted}`, 'gm'))]
    .map(m => ({ key: m[1], fr: m[2], en: m[3] }));
  check('vocabulaire : les textes se lisent bien (garde-fou de l\'analyse elle-même)', entries.length > 400, `${entries.length} textes trouvés`);

  const bad = (test, side) => entries.filter(e => test(e[side])).map(e => `${e.key} (${side}) : ${e[side]}`);
  const parenPlural = t => /\p{L}\((?:s|es|x|e|ée?s?)\)/u.test(t);
  const found = [...bad(parenPlural, 'fr'), ...bad(parenPlural, 'en')];
  check('vocabulaire : aucun pluriel entre parenthèses (« ligne(s) ») : on écrit {n|singulier|pluriel}', found.length === 0, '\n    ' + found.join('\n    '));

  const template = bad(t => /\btemplates?\b/i.test(t), 'fr');
  const htmlText = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const htmlTemplate = htmlText.match(/[^<>"\n]*\b(?:un|ce|ces|de|des|le|du)\s+templates?\b[^<>"\n]*/gi) || [];
  check('vocabulaire : « modèle », jamais « template », dans les textes français', template.length === 0 && htmlTemplate.length === 0, '\n    ' + [...template, ...htmlTemplate].join('\n    '));

  const dashes = [...bad(t => /^--\s/.test(t), 'fr'), ...bad(t => /^--\s/.test(t), 'en')];
  const htmlDashes = htmlText.match(/>--\s[^<]*</g) || [];
  check('vocabulaire : l\'option vide d\'une liste s\'écrit « — Choisir … — » (tirets longs), jamais « -- … -- »', dashes.length === 0 && htmlDashes.length === 0, '\n    ' + [...dashes, ...htmlDashes].join('\n    '));
  const imperative = bad(t => /^— Choisissez\b/.test(t), 'fr');
  check('vocabulaire : l\'option vide dit « Choisir », pas « Choisissez »', imperative.length === 0, '\n    ' + imperative.join('\n    '));

  const macroSpelling = [...bad(t => /Macro modèle/.test(t), 'fr'), ...(htmlText.match(/Macro modèle/g) || [])];
  check('vocabulaire : « macro-modèle » s\'écrit avec un trait d\'union', macroSpelling.length === 0, macroSpelling.join(', '));

  // Le pluriel lui-même : I18n.t choisit la forme selon le nombre, dans la langue en cours (0 et 1 au singulier en français, seul 1 en anglais), sans jamais
  // lire comme un pluriel le texte d'une variable (un nom de colonne, une valeur saisie).
  const ctx = { localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: {}, querySelectorAll: () => [] }, console };
  const I18n = vm.runInNewContext(i18nSource + ';I18n', ctx);
  const at = (lang, key, vars) => { I18n.setLang(lang); return I18n.t(key, vars); };
  const cases = [
    ['fr', 'varLinked.insert', { count: 0 }, 'Insérer 0 attribut'],
    ['fr', 'varLinked.insert', { count: 1 }, 'Insérer 1 attribut'],
    ['fr', 'varLinked.insert', { count: 3 }, 'Insérer 3 attributs'],
    ['en', 'varLinked.insert', { count: 0 }, 'Insert 0 attributes'],
    ['en', 'varLinked.insert', { count: 1 }, 'Insert 1 attribute'],
    ['fr', 'linkConfig.previewMatches', { count: 1, table: 'T', ids: '4' }, '1 ligne trouvée dans « T » (n° 4).'],
    ['fr', 'linkConfig.previewMatches', { count: 2, table: 'T', ids: '4, 5' }, '2 lignes trouvées dans « T » (n° 4, 5).'],
    ['fr', 'varCond.debug.count', { table: 'T', count: 1, total: 3 }, 'Dans « T » : 1 ligne sur 3 remplit la condition.'],
    ['fr', 'varCond.debug.count', { table: 'T', count: 2, total: 3 }, 'Dans « T » : 2 lignes sur 3 remplissent la condition.'],
    ['en', 'varCond.debug.count', { table: 'T', count: 1, total: 3 }, 'In “T”: 1 of 3 rows meets the condition.'],
    ['fr', 'varLoop.preview.noneKept', { id: 1, total: 1 }, 'Ligne sélectionnée (n° 1) : la ligne liée n’est pas retenue.'],
    ['fr', 'varLoop.preview.noneKept', { id: 1, total: 4 }, 'Ligne sélectionnée (n° 1) : aucune des 4 lignes liées n’est retenue.'],
    ['fr', 'macro.summary.text', { cover: 'C', count: 2 }, 'Page de garde : C — 2 annexes conditionnelles.'],
    ['en', 'status.batchExportDoneWithFailures', { ok: 2, failed: 1 }, '2 PDFs generated, 1 failure (see console) — ZIP archive downloaded.'],
    ['fr', 'searchSelect.count', { count: 5 }, '5 résultats'],
  ];
  const wrong = cases.map(([lang, key, vars, want]) => ({ lang, key, want, got: at(lang, key, vars) })).filter(c => c.got !== c.want);
  check('vocabulaire : I18n.t accorde les pluriels ({n|singulier|pluriel}) en français et en anglais', wrong.length === 0, '\n    ' + wrong.map(c => `${c.lang} ${c.key} : « ${c.got} » au lieu de « ${c.want} »`).join('\n    '));
  const literal = at('fr', 'varLoop.preview.paragraph', { count: 2, values: '{count|a|b}' });
  check('vocabulaire : le texte d\'une variable qui ressemble à un pluriel reste tel quel', literal === 'Le paragraphe se répète 2 fois : {count|a|b}.', literal);
  I18n.setLang('fr');
}

// ============================================================================
// 7. Saisies et confirmations : les fenêtres du widget, jamais la boîte du navigateur
// ============================================================================
{
  // Choix d'Antoine du 29/09 (audit UX/UI, « Saisies et confirmations ») : window.prompt et window.confirm cèdent la place à Dialogs.prompt et Dialogs.confirm
  // (js/dialogs.js). Les alert() restent, à dessein. Deux façons de faire revenir le défaut : réécrire un prompt() / confirm() natif, ou oublier `await` devant
  // Dialogs.confirm - une promesse est toujours « vraie », donc `if (!Dialogs.confirm(...)) return;` ne s'arrête jamais et une suppression partirait sans réponse.
  // Même garde pour Dialogs.choose (« Enregistrer / Abandonner / Annuler », 01/10) : sans `await`, la question s'ouvrirait et le changement de modèle partirait déjà.
  const noComments = code => code.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const native = [];
  const unawaited = [];
  for (const rel of jsFiles) {
    const lines = noComments(read(rel)).split('\n');
    lines.forEach((line, i) => {
      const where = `${rel}:${i + 1} : ${line.trim().slice(0, 110)}`;
      if (/(?<![\w$.])(?:prompt|confirm)\s*\(|\bwindow\.(?:prompt|confirm)\s*\(/.test(line)) native.push(where);
      for (const m of line.matchAll(/\bDialogs\.(?:prompt|confirm|choose)\s*\(/g)) {
        if (rel !== 'js/dialogs.js' && !/\b(?:await|return)\s*\(?\s*$/.test(line.slice(0, m.index))) unawaited.push(where);
      }
    });
  }
  check('boîtes natives : aucun prompt() ni confirm() du navigateur dans js/ (les alert() restent) - on appelle Dialogs.prompt / Dialogs.confirm', native.length === 0, '\n    ' + native.join('\n    '));
  check('boîtes natives : chaque Dialogs.prompt / Dialogs.confirm / Dialogs.choose est appelé avec `await` (ou `return`), jamais sans', unawaited.length === 0, '\n    ' + unawaited.join('\n    '));
}

// ============================================================================
// 8. Export Excel : aucune couleur lue du style calculé
// ============================================================================
// La couleur du texte, le fond et les filets d'une case calculés par le navigateur suivent le thème sombre de l'éditeur (texte clair, fond sombre) : un fichier Excel
// qui les recopierait aurait du blanc sur blanc et des cases noires. js/xlsx-export.js n'écrit donc que ce que la personne a posé en ligne (couleur, fond) et un filet
// gris fixe, comme js/docx-export.js et le PDF (js/pdf-export.js:tableFrom). Un besoin nouveau de style calculé se discute : cette règle s'adapte alors, pas en silence.
{
  const code = read('js/xlsx-export.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  check('export Excel : js/xlsx-export.js ne lit aucun style calculé (getComputedStyle)', !/getComputedStyle/.test(code), 'une couleur calculée suit le thème sombre de l\'éditeur');
}

// ============================================================================
// 9. Couches flottantes : l'ordre d'empilement vient des jetons, jamais d'un nombre en dur
// ============================================================================
// Retour d'Antoine du 01/10 : le menu # s'ouvrait SOUS la barre flottante du tableau. Chaque couche avait son z-index en dur (barre 2000, liste # 1000, menus de la barre du haut 15, liste des
// modèles 40), sans aucun ordre entre elles : le défaut revenait à chaque couche ajoutée. L'ordre est posé une fois (jetons --z-floating-toolbar < --z-menu < --z-tip dans css/style.css, rangs
// de js/layers.js) ; une barre, un menu, une liste, un popup ou une info-bulle y prend son niveau, jamais un nombre. Les fenêtres (css/modal-base.css), l'info-bulle d'un lien
// (css/link-dialog.css) et celle de la grille (css/grid.css) ont leur propre échelle, au-dessus de tout, et gardent leurs nombres.
{
  const OWN_SCALE = new Set(['css/modal-base.css', 'css/link-dialog.css', 'css/grid.css']);
  const hardcoded = [];
  for (const rel of cssFiles) {
    if (OWN_SCALE.has(rel)) continue;
    stripComments(read(rel)).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/(?<![\w-])z-index\s*:\s*(\d+)/g)) {
        // La poignée d'image d'avant l'éditeur V2 (`position: fixed`, 9999) est recouverte dans l'éditeur par `.tiptap .editor-image-handle` (editor-v2.css) : elle n'ordonne rien.
        if (Number(m[1]) >= 100 && !/^\.editor-image-handle\s*\{/.test(line.trim())) hardcoded.push(`${rel}:${i + 1} : ${line.trim().slice(0, 110)}`);
      }
    });
  }
  check('couches flottantes : aucun z-index de 100 ou plus écrit en dur dans css/ - un jeton --z-floating-toolbar, --z-menu ou --z-tip (css/style.css)', hardcoded.length === 0, '\n    ' + hardcoded.join('\n    '));

  const tokens = {};
  for (const m of stripComments(read('css/style.css')).matchAll(/--z-([a-z-]+)\s*:\s*(\d+)\s*;/g)) tokens[m[1]] = Number(m[2]);
  const gapOf = (low, high) => tokens[high] - tokens[low];
  const ordered = tokens['floating-toolbar'] > 0 && gapOf('floating-toolbar', 'menu') >= 100 && gapOf('menu', 'tip') >= 100 && tokens['tip'] + 100 <= 1990;
  check('couches flottantes : css/style.css déclare --z-floating-toolbar < --z-menu < --z-tip, à 100 d\'écart chacun (la largeur d\'un niveau), le tout sous les fenêtres (1990)', ordered, JSON.stringify(tokens));

  // Les niveaux sont dits à UN endroit. Un jeton ou un `!important` de plus dans la feuille d'une fonctionnalité recrée un niveau que js/layers.js ne range pas avec les autres : la liste # d'un champ
  // de fenêtre avait son --z-window-list, posé en `!important` pour masquer le rang écrit en ligne - il ne suivait pas l'ordre d'ouverture. Un popup ouvert depuis une fenêtre passe par
  // Layers.raise(popup, fenêtre) (ViewportFit.placePopup, option `over`).
  const ownTokens = [];
  const importantZ = [];
  for (const rel of cssFiles) {
    stripComments(read(rel)).split('\n').forEach((line, i) => {
      if (rel !== 'css/style.css' && /--z-[a-z-]+\s*:/.test(line)) ownTokens.push(`${rel}:${i + 1} : ${line.trim().slice(0, 110)}`);
      if (/z-index\s*:[^;}]*!important/.test(line)) importantZ.push(`${rel}:${i + 1} : ${line.trim().slice(0, 110)}`);
    });
  }
  check('couches flottantes : aucun jeton --z-* déclaré hors css/style.css - un popup de fenêtre prend le niveau de sa fenêtre par Layers.raise(popup, fenêtre)', ownTokens.length === 0, '\n    ' + ownTokens.join('\n    '));
  check('couches flottantes : aucun z-index en !important dans css/ - il masquerait le rang que Layers.raise écrit en ligne', importantZ.length === 0, '\n    ' + importantZ.join('\n    '));

  // Côté script, js/layers.js est le seul à poser un z-index en ligne (niveau + rang) ; js/docx-export.js en parle aussi, mais c'est l'ordre d'une image dans le Word, pas du CSS.
  const inline = [];
  for (const rel of jsFiles) {
    if (rel === 'js/layers.js' || rel === 'js/docx-export.js') continue;
    noCommentsJs(read(rel)).split('\n').forEach((line, i) => {
      if (/\.style\.zIndex\s*=|setProperty\(\s*['"]z-index['"]|z-index\s*:\s*\d{3,}/.test(line)) inline.push(`${rel}:${i + 1} : ${line.trim().slice(0, 110)}`);
    });
  }
  check('couches flottantes : aucun script hors js/layers.js ne pose de z-index en ligne - il appelle Layers.raise(élément) à l\'ouverture', inline.length === 0, '\n    ' + inline.join('\n    '));
}

summarizeAndExit();
