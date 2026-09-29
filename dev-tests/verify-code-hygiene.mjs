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
//
// Volontairement PERMISSIF : un nom cité seulement dans un commentaire compte comme utilisé, un préfixe construit (`'toc-level-' + n`) couvre toute la
// famille. Le but est de ne jamais faire échouer un changement légitime, seulement d'attraper ce qui n'a plus AUCUN point d'entrée. Une classe posée
// par une bibliothèque (TipTap, prosemirror-tables) n'apparaît dans aucun de nos fichiers : elle va dans LIBRARY_CLASSES ci-dessous, avec sa source.
//
// Lancer : node dev-tests/verify-code-hygiene.mjs
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
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
]);

const jsFiles = listFiles('js', /\.js$/);
const cssFiles = listFiles('css', /\.css$/);
const galleryFiles = [...listFiles('templates-gallery', /\.(html|json)$/), ...listFiles('templates-gallery-dev', /\.(html|json)$/)];
// Tout ce qui PRODUIT du DOM ou consomme des noms : la page, les scripts, les modèles livrés.
const producerText = ['index.html', ...jsFiles, ...galleryFiles].map(read).join('\n');

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

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
}

summarizeAndExit();
