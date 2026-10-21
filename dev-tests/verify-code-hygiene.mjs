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
//  10. un texte rouge posé avec --danger (4,37:1 sur blanc) au lieu de --danger-ink (4,5:1 au moins sur tous les fonds) : seuls quatre boutons à icône seule gardent --danger (contrôle du 03/10).
//  11. la politique de sécurité du contenu d'index.html qui ne dit plus ce que la page charge : un script en ligne (la carte d'importation comprise) dont l'empreinte n'est plus la sienne, une bibliothèque
//      d'un CDN qu'elle ne permet pas, une empreinte ou une adresse que plus rien n'utilise (contrôle de sécurité du 04/10).
//  12. une police ou une feuille de style chargée depuis un autre site (Google Fonts ou autre : @import, url(), <link>, adresse d'un service de polices), ou une police d'interface qui n'est plus celle du
//      système (choix d'Antoine du 04/10 : « une police système similaire, pas de Google Fonts ou autre »).
//  13. un console.log, console.info, console.debug ou console.trace dans js/ ou index.html (la console ne reçoit que les avertissements et les erreurs : un widget public ne raconte pas son démarrage), et la
//      fenêtre « réseau bloqué » (js/first-contact.js) qui ne liste plus les sites que la politique de sécurité du contenu laisse charger des scripts (bêta : « Tout soigner »).
//  14. un des cinq mots anglais du travail à reprendre écrit en capitales (MARKERS, section 14 : l'audit externe du 04/10 les compte comme travail inachevé), ou un littéral assigné à `token`, `secret`,
//      `password`, `apiKey` - en minuscules comme en capitales (`SECRET`, `PASSWORD`) - qui n'est pas le faux jeton `stub-token` des tests (contrôle de l'audit externe : « valeur en dur dans token » du 04/10, « valeur en dur dans SECRET » du 21/10).
//  15. un champ de saisie de index.html (input, select, textarea, ou l'élément d'un champ texte à bulles `pp-field-editor`) sans nom accessible : ni aria-label, ni aria-labelledby vers un élément qui existe,
//      ni <label for> ou <label> englobante, ni title (audit externe du 04/10, point F-RGAA-04 ; un texte d'exemple, placeholder, n'est pas un nom) ; les cinq champs à bulles (Objet, À, Cc, Cci, nom du
//      PDF) sont bien là, et index.html charge leur feuille de style et leurs deux scripts une fois chacun, avant js/main.js.
//      Chaque <button> de index.html a aussi un nom (texte, aria-label, title, aria-labelledby), même caché en attendant un script (audit externe du 21/10, point F-RGAA-05).
//  16. une fonction reçue en paramètre donnée telle quelle à setTimeout (`onLinked` de js/condition-fields.js, `update` de js/variable-modal.js : audit externe du 04/10, point C-XSS-04) au lieu d'une
//      flèche qui l'appelle ; le chargeur de scripts des exports (js/export-common.js) garde sa liste blanche (dev-tests/unit-script-loader.mjs, script Node `scriptLoaderUnit`).
//  17. le prénom de la personne qui a demandé le widget écrit dans ce que le dépôt public reprend (index.html, css, js, img, templates-gallery, LICENSE) : commentaire, texte ou donnée (contrôle d'avant la
//      bêta ; dev-tests et planning ne sont pas publiés et gardent leurs références).
//  18. un moteur d'export (PDF, fusion, feuilles, Word, Excel, format des nombres : ~380 Ko) qui redevient un <script src> ordinaire de index.html, donc chargé à l'ouverture, ou qu'un script appelle
//      sans passer par js/export-engines.js (choix d'Antoine du 05/10 : « Charger les moteurs d'export seulement au premier export »).
//  19. une table du widget créée sans passer par la question « Créer les tables du widget dans ce document ? » : un `AddTable` écrit ailleurs que dans js/grist-api.js (addTableIfMissing), dans la galerie de
//      modèles (la table que la personne nomme elle-même) et dans l'installateur des modèles à pack (js/template-pack.js, que seule la galerie appelle, APRÈS la question « Créer les tables du modèle ? » qui
//      nomme chaque table), la question qui n'est plus posée avant l'écriture, ou js/table-consent.js qui n'est plus branché avant le démarrage anticipé d'index.html
//      (choix d'Antoine du 05/10 : « demander une fois, mais si la personne refuse, lui redemander à chaque action de sa part sur le widget »).
//  20. une image d'un autre site qui charge sans le clic « Afficher » : une surface (Lecture, en-têtes et pieds, galerie, vue d'image de l'éditeur) qui écrit le HTML d'un modèle dans la page sans passer par
//      ExternalImages (block, blockIn, blockedSiteOf), ou la Lecture avec commentaires qui sérialise le document dans celui de la page (une <img> créée là charge son adresse même détachée)
//      (choix d'Antoine du 05/10 : « Bloquer jusqu'à un clic »).
//  21. un fichier ou un dossier de ce que le widget charge (css, js, img, templates-gallery, templates-gallery-dev) dont le nom commence par « _ » ou « . » : GitHub Pages (Jekyll) ne le sert pas, il se lit en
//      local et répond 404 en ligne (le dossier des tables de famille, templates-gallery/_tables, a fait ouvrir 17 modèles de la galerie sur une erreur le 09/10 ; il s'appelle `families/`).
//  22. la feuille de route du README public qui promet encore ce que le widget livre (« Export PDF : impression full HD, PDF compressé (V1) » : l'impression par le navigateur et le PDF « Léger » sont livrés
//      et décrits plus haut ; relevé du 12/10, retiré dans les deux langues).
//  23. un changement de langue de Réglages qui retraduit l'écran sur place au lieu de recharger la page (demande du 14/10 : « quand on change de langue, on recharge la page et uniquement ça, pour ne
//      pas alourdir ») : les cases de langue passent par changeLanguage (la question « Enregistrer / Abandonner / Annuler » d'abord, puis I18n.storeLang et reloadKeepingTemplate, qui laisse le modèle
//      ouvert dans le fragment de l'adresse puis recharge), et un stockage refusé laisse la langue telle quelle (la case revient sur celle de la page). Le modèle où la personne était se rouvre après ce
//      rechargement et celui de la touche de déclenchement (demande du 20/10) par le fragment `#pp-open=<id>` de l'adresse du cadre, jamais par le stockage du navigateur, que le cadre isolé de GFS refuse.
//      Hébergée par GFS (consigne 019), la langue est celle de GFS : lue au départ (le fragment `pp-lang`, puis le paramètre `language` de l'adresse, seulement avec `gfs=<n>`), suivie à chaque événement `langue`
//      par la même question puis le même rechargement, qui garde la langue de GFS dans le fragment (`#pp-open=<id>&pp-lang=fr|en`) ; les deux cases de Réglages sont grisées avec la raison, jamais masquées ; une
//      adresse qu'on ne peut pas modifier ne fait pas recharger la page (elle repartirait dans l'ancienne langue et s'y reprendrait sans fin).
//  24. un retour du code qui retraduisait en direct (même demande du 14/10, « on simplifie le code ») : I18n n'a plus de crochet de changement de langue (ni onChange, ni abonnés, ni applyTranslations
//      exporté), aucun fichier de js/ n'appelle I18n.onChange ni I18n.setLang (réservé aux tests) ; un écran écrit ses libellés quand il se bâtit ou s'ouvre et ne les relit pas.
//  25. le graphique, une extension de Grist Factory Suite (consignes GFS 005 et 007 du 14/10) : son code est dans extensions/graphique/, nommé par le registre de js/extensions.js et jamais par index.html ; sa bibliothèque
//      (Plotly) n'est ni dans la carte d'importation, ni dans la liste des bibliothèques de l'app, et la politique de sécurité du contenu ne la nomme que par l'adresse exacte du catalogue de GFS (mode CDN) ; ni
//      cette adresse ni une empreinte ne sont écrites dans le code, sa version exacte l'est une fois ; le reste du widget n'atteint le graphique que par js/chart-entry.js ; seul js/gfs-link.js parle au cadre parent ;
//      extensions/ part sur le dépôt public.
//  26. l'envoi sur le dépôt public qu'un oubli ferait refuser (« Oui » d'Antoine du 16/10 : « Vérifier à chaque correction que l'envoi public ne sera pas bloqué ? ») : outils/depot-propre/controles.mjs, lancé sur
//      l'arbre que publier.sh assemblerait (ce que PUBLIES nomme, pris dans le dossier de travail, et les documents de outils/depot-propre/public/), ne trouve aucune erreur ; une clé « pp_ » inconnue le fait échouer.
//  27. un fichier nommé manifest.json, ou un script qui en lit un : l'audit externe du 21/10 (gwaudit) lit tout manifest.json comme le manifeste d'un widget Grist et comptait cinquante constats (F-GUIDE-03 et F-GUIDE-04) sur les deux
//      listes de modèles de la galerie, qui s'appellent catalogue.json.
//  28. le balisage calculé qui entre dans la page ailleurs que par `Dom.setMarkup` / `Dom.inertTemplate` (js/dom.js) : `innerHTML` ou `outerHTML` reçoit autre chose qu'un littéral, ou `insertAdjacentHTML`,
//      `createContextualFragment`, `document.write` reviennent dans js/ ou extensions/ (audit externe du 21/10, point C-XSS-01 : quarante et une écritures éparpillées, toutes fermées dans le fond, aucune lisible comme telle).
//
// Volontairement PERMISSIF : un nom cité seulement dans un commentaire compte comme utilisé, un préfixe construit (`'toc-level-' + n`) couvre toute la
// famille. Le but est de ne jamais faire échouer un changement légitime, seulement d'attraper ce qui n'a plus AUCUN point d'entrée. Une classe posée
// par une bibliothèque (TipTap, prosemirror-tables) n'apparaît dans aucun de nos fichiers : elle va dans LIBRARY_CLASSES ci-dessous, avec sa source.
//
// Lancer : node dev-tests/verify-code-hygiene.mjs
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, rmSync, cpSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
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
  'ProseMirror-separator', // prosemirror-view : l'<img> posée après une image en fin de paragraphe (css/editor-v2.css retire sa ligne quand l'image est seule sur la sienne)
]);

// Le code du widget : js/ et css/, et le code des extensions de Grist Factory Suite (extensions/<identifiant>/, chargé au premier usage, js/extensions.js) - il est publié et soumis aux mêmes règles.
const jsFiles = [...listFiles('js', /\.js$/), ...listFiles('extensions', /\.js$/)];
// Les bibliothèques des extensions de Grist Factory Suite (consigne GFS 007) : GFS les porte et l'app ne les charge jamais seule (le graphique y est grisé). Seule la politique de sécurité du contenu d'index.html
// garde l'adresse exacte de leur mode CDN, telle que le catalogue de GFS la donne (GFS ne peut imposer aucune politique à un sous-cadre) : une adresse par bibliothèque, écrite ICI et nulle part dans le code du widget.
// La section « politique » ne la prend pas pour une adresse oubliée ; la section 25 garde qu'elle est là, seule et exacte.
const EXTENSION_LIBRARY_ADDRESSES = { plotly: 'https://cdn.jsdelivr.net/npm/plotly.js-basic-dist-min@2.13.2/plotly-basic.min.js' };
const cssFiles = [...listFiles('css', /\.css$/), ...listFiles('extensions', /\.css$/)];
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

  // « Puces » : en français, l'onglet du menu « # », l'aide du caractère déclencheur (Réglages) et le nom du bouton « Insérer une variable » disent « puces », jamais « chips » (choix d'Antoine du 05/10) ;
  // l'anglais garde « chip(s) ». Seuls les textes lus comptent : un nom de classe ou d'id d'index.html (`v2-format-chip`) n'en est pas un, d'où les nœuds de texte et les attributs lus par une personne.
  const readableHtml = [...htmlText.matchAll(/>([^<>]*)</g), ...htmlText.matchAll(/\b(?:aria-label|data-tip|title|placeholder|alt)="([^"]*)"/g)].map(m => m[1].trim()).filter(Boolean);
  check('vocabulaire : les textes d\'index.html se lisent bien (garde-fou de l\'analyse elle-même)', readableHtml.length > 100, `${readableHtml.length} textes trouvés`);
  const chipFr = bad(t => /\bchips?\b/i.test(t), 'fr');
  const chipHtml = readableHtml.filter(t => /\bchips?\b/i.test(t));
  check('vocabulaire : « puce », jamais « chip » ni « chips », dans les textes français', chipFr.length === 0 && chipHtml.length === 0, '\n    ' + [...chipFr, ...chipHtml].join('\n    '));

  const dashes = [...bad(t => /^--\s/.test(t), 'fr'), ...bad(t => /^--\s/.test(t), 'en')];
  const htmlDashes = htmlText.match(/>--\s[^<]*</g) || [];
  check('vocabulaire : l\'option vide d\'une liste s\'écrit « — Choisir … — » (tirets longs), jamais « -- … -- »', dashes.length === 0 && htmlDashes.length === 0, '\n    ' + [...dashes, ...htmlDashes].join('\n    '));
  const imperative = bad(t => /^— Choisissez\b/.test(t), 'fr');
  check('vocabulaire : l\'option vide dit « Choisir », pas « Choisissez »', imperative.length === 0, '\n    ' + imperative.join('\n    '));

  const macroSpelling = [...bad(t => /Macro modèle/.test(t), 'fr'), ...(htmlText.match(/Macro modèle/g) || [])];
  check('vocabulaire : « macro-modèle » s\'écrit avec un trait d\'union', macroSpelling.length === 0, macroSpelling.join(', '));

  // Les lettres des trois boutons jour / mois / année de la barre d'une date suivent la langue de l'interface : J, M, A en français, D, M, Y en anglais (« Oui, D M Y » d'Antoine, 12/10). Elles ne sont jamais
  // écrites en dur dans la barre, qui les écrit une fois, à sa construction, dans la langue de la page : changer de langue recharge la page, rien n'est relu à l'ouverture.
  const toolbarsJs = read('js/floating-toolbars.js');
  const letterKeys = ['varFmt.dayLetter', 'varFmt.monthLetter', 'varFmt.yearLetter'];
  const letterEntries = letterKeys.map(key => entries.find(e => e.key === key));
  check('vocabulaire : les boutons jour / mois / année d\'une date ont leurs lettres dans js/i18n.js (J M A en français, D M Y en anglais), jamais écrites en dur dans la barre', letterEntries.every(Boolean) && letterEntries.map(e => e.fr).join(' ') === 'J M A' && letterEntries.map(e => e.en).join(' ') === 'D M Y' && !/data-action="date-part:[a-z]+"[^>]*>[A-Z]</.test(toolbarsJs));
  check('vocabulaire : la barre d\'une date écrit ces lettres une seule fois, à sa construction (aucune relecture à l\'ouverture : changer de langue recharge la page)', letterKeys.every(key => toolbarsJs.split(key).length - 1 === 1));

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
    ['en', 'status.batchExportDoneWithFailures', { ok: 2, failed: 1 }, '2 PDFs generated, 1 failure — ZIP archive downloaded.'],
    ['fr', 'status.batchExportDoneWithFailures', { ok: 2, failed: 3 }, '2 PDF générés, 3 échecs — archive ZIP téléchargée.'],
    ['fr', 'batchFailures.title', { n: 1 }, 'Un document n’a pas été généré'],
    ['fr', 'batchFailures.title', { n: 3 }, '3 documents n’ont pas été générés'],
    ['en', 'batchFailures.title', { n: 1 }, 'One document was not generated'],
    ['en', 'batchFailures.title', { n: 2 }, '2 documents were not generated'],
    ['fr', 'batchFailures.intro', { ok: 1, n: 1 }, 'Le fichier téléchargé contient 1 autre document, mais pas celui-ci :'],
    ['fr', 'batchFailures.intro', { ok: 5, n: 2 }, 'Le fichier téléchargé contient 5 autres documents, mais pas ceux-ci :'],
    ['en', 'batchFailures.intro', { ok: 1, n: 2 }, 'The downloaded file has 1 other document, but not these:'],
    ['fr', 'batchFailures.more', { n: 1 }, '… et 1 autre document.'],
    ['fr', 'batchFailures.more', { n: 12 }, '… et 12 autres documents.'],
    ['en', 'batchFailures.more', { n: 12 }, '… and 12 more documents.'],
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

// ============================================================================
// 10. Texte rouge : --danger-ink pour un texte, --danger pour une icône, une bordure ou un filet
// ============================================================================
// Contrôle complet du 03/10 (choix d'Antoine « Tout corriger ») : --danger (#d84343) ne fait que 4,37:1 sur blanc. Posé en couleur de TEXTE (message d'erreur de la barre, « Retirer la condition »,
// « Supprimer » d'une bulle de note ou de commentaire, compteur d'email dépassé, avertissement de colonne du macro-modèle, ligne « accès verrouillé » de Réglages) il passait sous les 4,5:1.
// Le défaut avait déjà été corrigé règle par règle (color: var(--text) dans trois d'entre elles) et revenait avec chaque nouveau texte rouge : le correctif est au jeton. Un texte rouge prend
// var(--danger-ink) (css/style.css : 4,5:1 au moins sur tous les fonds du thème, en clair et en sombre) ; --danger reste aux bordures, aux filets et aux icônes (3:1 suffit).
// Les seules règles qui gardent `color: var(--danger)` sont des boutons à icône seule, dont le masque d'icône prend `color` : un nouveau cas se discute, puis s'ajoute à cette liste, avec ce qu'il contient.
{
  const ICON_ONLY = new Set([
    '#toolbar-top #btn-delete',          // corbeille de la barre du haut (css/style.css : icône en masque, aucun texte)
    '.macro-slot-remove:hover',          // croix d'une annexe du macro-modèle (js/macro-editor.js : bouton sans texte)
    '.macro-rule-remove:hover',          // croix d'une règle (macro-modèle, condition, boucle, panneau d'une ligne : boutons sans texte)
    '.link-rule-btn-delete:hover',       // corbeille d'une règle de lien entre deux tables (js/variables.js : icône en masque)
  ]);
  const offenders = [];
  for (const rel of cssFiles) {
    for (const m of stripComments(read(rel)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(?<![\w-])color\s*:\s*var\(\s*--danger\s*[,)]/.test(m[2])) continue;
      const selectors = m[1].split(',').map(sel => sel.replace(/\s+/g, ' ').trim());
      if (!selectors.every(sel => ICON_ONLY.has(sel))) offenders.push(`${rel} : ${selectors.join(', ').slice(0, 110)}`);
    }
  }
  check('texte rouge : aucune règle ne pose `color: var(--danger)` hors des quatre boutons à icône seule - un texte rouge prend var(--danger-ink) (--danger n\'a que 4,37:1 sur blanc)', offenders.length === 0, '\n    ' + offenders.join('\n    '));

  // Le jeton existe, dans la feuille qui porte les autres, pour le thème clair ET les deux blocs sombres (sans lui, `color: var(--danger-ink)` hérite du texte courant : plus rien de rouge, et aucun test de contraste ne le verrait).
  const style = stripComments(read('css/style.css'));
  const declarations = [...style.matchAll(/--danger-ink\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map(m => m[1].toLowerCase());
  check('texte rouge : css/style.css déclare --danger-ink trois fois (thème clair, thème sombre choisi, thème sombre du système), d\'un rouge plus foncé que --danger en clair', declarations.length === 3 && declarations[0] === '#c53030', JSON.stringify(declarations));
}

// ============================================================================
// 11. Politique de sécurité du contenu : ses empreintes et ses adresses disent ce que la page charge
// ============================================================================
// Contrôle de sécurité du 04/10 (choix d'Antoine « Tout corriger », correction 6) : index.html porte une politique (<meta http-equiv="Content-Security-Policy">) qui refuse tout script en ligne, tout gestionnaire
// d'événement, tout script d'une autre adresse que celles qu'elle cite, tout cadre, objet, formulaire et toute balise de base. Elle ne protège que si elle reste juste, et ce qui la dérègle ne se voit pas dans
// les tests (ils tournent avec bypassCSP) : (a) un script en ligne modifié d'une lettre, la carte d'importation comprise, n'a plus la même empreinte : le navigateur le refuse et le widget ne démarre plus chez
// Antoine ; (b) une bibliothèque chargée depuis une adresse que la politique ne cite pas échoue sans bruit au premier export qui la demande ; (c) une empreinte ou une adresse que plus rien n'utilise est un reste
// qui ouvre la politique pour rien. dev-tests/verify-csp.mjs (script Node `cspLoad`) joue la politique dans un vrai navigateur, ce contrôle-ci garde ses deux listes à jour sans navigateur.
{
  const CDN_SCRIPT_HOSTS = 'cdnjs\\.cloudflare\\.com|cdn\\.jsdelivr\\.net|esm\\.sh|unpkg\\.com|docs\\.getgrist\\.com';
  const raw = read('index.html');
  // Les commentaires d'index.html parlent de <script> et d'adresses : blanchis à longueur égale, ils ne comptent pas, et les positions restent celles du texte brut (dont on prend le contenu à hacher).
  const page = raw.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const meta = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  check('politique : index.html porte une politique de sécurité du contenu, avant son premier script', !!meta && meta.index < page.indexOf('<script'), meta ? 'la balise vient après le premier <script>' : '<meta http-equiv="Content-Security-Policy"> introuvable');

  const policy = meta ? meta[1] : '';
  const scriptSrc = (policy.split(';').map(d => d.trim().split(/\s+/)).find(d => d[0] === 'script-src') || []).slice(1);
  const cited = scriptSrc.filter(source => /^'sha256-/.test(source));
  const hostSources = scriptSrc.filter(source => /^https:\/\//.test(source));

  // (a) Chaque script en ligne est cité par son empreinte SHA-256 (celle du texte entre les balises, espaces compris), et chaque empreinte citée correspond à un script en ligne.
  const inline = new Map();
  for (const m of page.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const body = raw.slice(m.index + m[0].indexOf('>') + 1, m.index + m[0].length - '</script>'.length);
    const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
    inline.set(hash, `${/type\s*=\s*["']?importmap/i.test(m[1]) ? 'la carte d\'importation' : 'un script en ligne'} « ${body.trim().replace(/\s+/g, ' ').slice(0, 40)}… »`);
  }
  const uncited = [...inline].filter(([hash]) => !cited.includes(hash)).map(([hash, what]) => `${hash} (${what})`);
  check('politique : chaque script en ligne d\'index.html, la carte d\'importation comprise, est cité dans script-src par son empreinte (modifié, il en a une nouvelle : l\'écrire)', inline.size >= 3 && uncited.length === 0, '\n    à ajouter à script-src : ' + uncited.join('\n    à ajouter à script-src : '));
  const stale = cited.filter(hash => !inline.has(hash));
  check('politique : aucune empreinte de script-src ne correspond à plus aucun script en ligne (celle d\'un script modifié est à remplacer, pas à garder)', stale.length === 0, '\n    à retirer de script-src : ' + stale.join(' '));

  // (b) Chaque adresse de bibliothèque que le widget charge est permise ; (c) chaque adresse permise sert encore. Une source avec un chemin est exacte, une source sans chemin ouvre tout son hôte (esm.sh).
  const permits = (source, address) => {
    const s = new URL(source);
    const u = new URL(address);
    return s.origin === u.origin && (s.pathname === '/' || (s.pathname.endsWith('/') ? u.pathname.startsWith(s.pathname) : u.pathname === s.pathname));
  };
  const loaded = new Map();
  const noteLoaded = (address, file) => { if (!loaded.has(address)) loaded.set(address, file); };
  // La politique cite ses propres adresses : sans la blanchir, chacune se compterait comme chargée par la page.
  const policyTag = meta ? page.slice(meta.index, page.indexOf('>', meta.index) + 1) : '';
  const pageOutsidePolicy = page.replace(policyTag, policyTag.replace(/[^\n]/g, ' '));
  for (const m of pageOutsidePolicy.matchAll(new RegExp(`https://(?:${CDN_SCRIPT_HOSTS})/[^\\s"'<>)\\\\]*`, 'g'))) noteLoaded(m[0], 'index.html');
  for (const rel of jsFiles) {
    for (const m of noCommentsJs(read(rel)).matchAll(new RegExp(`https://(?:${CDN_SCRIPT_HOSTS})/[^\\s"'\`)\\\\]*\\.m?js`, 'g'))) noteLoaded(m[0], rel);
  }
  const refused = [...loaded].filter(([address]) => !hostSources.some(source => permits(source, address))).map(([address, file]) => `${file} : ${address}`);
  check('politique : chaque bibliothèque que le widget charge depuis un CDN (index.html, js/) est permise par script-src - sinon sa fonction échoue sans bruit chez Antoine', loaded.size >= 10 && refused.length === 0, '\n    ' + refused.join('\n    ') + '\n    à ajouter à script-src : l\'adresse entière (esm.sh : l\'hôte)');
  // Les adresses des bibliothèques d'extension (EXTENSION_LIBRARY_ADDRESSES) ne sont chargées par aucun script de l'app : GFS les donne à l'extension, la politique ne fait que les permettre.
  const unused = hostSources.filter(source => !Object.values(EXTENSION_LIBRARY_ADDRESSES).includes(source) && ![...loaded.keys()].some(address => permits(source, address)));
  check('politique : aucune adresse de script-src que plus aucun script ne charge', unused.length === 0, '\n    à retirer de script-src : ' + unused.join(' '));

  // html2pdf.js 0.10.1 embarquait un jsPDF et un DOMPurify périmés (failles connues, rapport du 04/10) pour des qualités d'export grisées dans l'interface : il a été retiré avec elles.
  // Le remettre, c'est d'abord le mettre à jour, puis ajouter son adresse à la politique.
  const html2pdfRefs = [...jsFiles.filter(rel => /html2pdf/i.test(noCommentsJs(read(rel)))), ...(/html2pdf/i.test(pageOutsidePolicy) ? ['index.html'] : [])];
  check('politique : html2pdf.js (jsPDF et DOMPurify périmés) n\'est chargé par aucun fichier de js/ ni par index.html - le remettre, c\'est d\'abord le mettre à jour', html2pdfRefs.length === 0, html2pdfRefs.join(', '));
}

// ============================================================================
// 12. Aucune police ni feuille de style d'un autre site : l'interface prend la police du système
// ============================================================================
// Choix d'Antoine du 04/10 (contrôle de sécurité, point sur Google Fonts) : « une police système similaire, pas de Google Fonts ou autre ». Une feuille de style ou une police chargée depuis un autre site lui
// dit, à chaque ouverture du widget, l'adresse IP et l'heure de la personne, et la politique de sécurité du contenu laisse les styles et les polices libres : rien d'autre ne l'arrêterait. L'interface prend donc
// la police du système (--font-ui commence par system-ui, css/style.css), le contenu du courrier le Roboto de css/roboto-fonts.css (en data:, sans réseau). dev-tests/verify-csp.mjs (script Node `cspLoad`) le
// confirme dans un vrai navigateur (aucune feuille ni police demandée à un autre site) ; ce contrôle-ci garde les sources, sans navigateur.
{
  const remote = '(?:https?:)?//[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+';
  const isRemote = target => new RegExp('^' + remote, 'i').test(target);
  const offenders = [];
  const scanStyles = (where, text) => {
    // Les polices embarquées (data:) pèsent des centaines de Ko et ne sortent pas du widget : écartées avant de chercher.
    const css = stripComments(text).replace(/url\(\s*['"]?data:[^)]*\)/gi, 'url(data:)');
    for (const m of css.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/gi)) if (isRemote(m[1])) offenders.push(`${where} : @import ${m[1].slice(0, 80)}`);
    for (const m of css.matchAll(new RegExp(`url\\(\\s*['"]?(${remote}[^'")\\s]*)`, 'gi'))) offenders.push(`${where} : url(${m[1].slice(0, 80)})`);
  };
  for (const rel of cssFiles) scanStyles(rel, read(rel));
  const page = read('index.html').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  scanStyles('index.html', page);
  for (const m of page.matchAll(new RegExp(`<link\\b[^>]*\\bhref\\s*=\\s*["']?(${remote}[^"'\\s>]*)`, 'gi'))) offenders.push(`index.html : <link href="${m[1].slice(0, 80)}">`);
  const FONT_SERVICES = /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.bunny\.net|use\.typekit\.net|(?:kit|use)\.fontawesome\.com/i;
  for (const rel of jsFiles) if (FONT_SERVICES.test(noCommentsJs(read(rel)))) offenders.push(`${rel} : adresse d'un service de polices`);
  const embedded = (read('css/roboto-fonts.css').match(/url\(data:font\/woff2/g) || []).length;
  check('polices : les feuilles se lisent bien (garde-fou de l\'analyse elle-même : le Roboto embarqué y est, en data:)', cssFiles.length >= 25 && embedded >= 4, `${cssFiles.length} feuilles, ${embedded} polices embarquées`);
  check('polices : ni feuille de style, ni page, ni script ne charge de police ou de feuille d\'un autre site (@import, url(), <link>, service de polices) - une police du système, jamais Google Fonts', offenders.length === 0, '\n    ' + offenders.join('\n    '));
  const fontUi = ((stripComments(read('css/style.css')).match(/--font-ui\s*:\s*([^;]+);/) || [])[1] || '').trim();
  check('polices : --font-ui, la police de l\'interface, commence par system-ui (la police du système)', /^system-ui\b/.test(fontUi), fontUi);
  // Un champ (<input>, <select>, <textarea>) ou un bouton ne reprend pas la police de son parent : sans règle de base il garde celle du navigateur (Arial), à côté du reste de l'interface en police du système
  // (« Oui, tous » d'Antoine, 12/10, pour les champs puis pour les boutons et les libellés). css/style.css la leur donne ; un bouton en `font-family: inherit` prend celle de son conteneur, et un conteneur
  // rattaché à document.body (le panneau des polices et des tailles, l'invitation des zones d'en-tête et de pied) sort de la cascade de la barre : il la porte lui-même. La seule règle qui écrit encore « Arial » en
  // première police est la base de la page (html, body). dev-tests/verify-field-fonts-mouse.mjs (script Node `fieldFontsMouse`) et dev-tests/verify-button-fonts-mouse.mjs (`buttonFontsMouse`) le mesurent dans un
  // vrai navigateur, menus et fenêtres ouverts ; ce contrôle-ci garde les sources.
  const baseCss = stripComments(read('css/style.css'));
  check('polices : css/style.css donne la police de l\'interface aux champs et aux boutons (input, select, textarea, button) - sinon ils gardent Arial, celle du navigateur', /(?:^|\})\s*input\s*,\s*select\s*,\s*textarea\s*,\s*button\s*\{[^}]*\bfont-family\s*:\s*var\(--font-ui\)/.test(baseCss));
  const editorCss = stripComments(read('css/editor-v2.css'));
  const ruleHasUiFont = (css, selector) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(m => m[1].split(',').map(part => part.trim()).includes(selector) && /\bfont-family\s*:\s*var\(--font-ui\)/.test(m[2]));
  check('polices : le panneau des polices et des tailles (.v2-format-panel) et l\'invitation « + Ajouter un en-tête » (.v2-hf-zone-ghost) portent la police de l\'interface - rattachés hors de la barre, ils prendraient l\'Arial de body', ruleHasUiFont(editorCss, '.v2-format-panel') && ruleHasUiFont(editorCss, '.v2-hf-zone-ghost'));
  // Le texte d'un en-tête ou d'un pied de la feuille est du contenu du modèle : Roboto, comme `.tiptap`, la Lecture et le PDF (« Oui, Roboto » d'Antoine, 12/10). Le corps d'une zone de bord et les bandes de couture ne sont pas
  // dans `.tiptap` : ils portent la police eux-mêmes, sinon ils prendraient l'Arial de body. dev-tests/verify-button-fonts-mouse.mjs (`buttonFontsMouse`) le mesure dans un vrai navigateur.
  const ruleHasContentFont = (css, selector) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(m => m[1].split(',').map(part => part.trim()).includes(selector) && /\bfont-family\s*:\s*['"]?Roboto['"]?\s*,/.test(m[2]));
  check('polices : le texte d\'un en-tête ou d\'un pied de la feuille (.v2-hf-zone-body, .v2-page-band-header, .v2-page-band-footer) est en Roboto comme le document - hors de `.tiptap`, il prendrait l\'Arial de body', ['.v2-hf-zone-body', '.v2-page-band-header', '.v2-page-band-footer'].every(selector => ruleHasContentFont(editorCss, selector)));
  const arialFirst = cssFiles.flatMap(rel => [...stripComments(read(rel)).matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => /\bfont-family\s*:\s*Arial\b/i.test(m[2])).map(m => `${rel} : ${m[1].trim().replace(/\s+/g, ' ').slice(0, 70)}`));
  check('polices : seule la base de la page (html, body) écrit « Arial » en première police ; aucune règle ne la remet sur un champ ou un bouton', arialFirst.length === 1 && arialFirst[0] === 'css/style.css : html, body', arialFirst);
}

// ============================================================================
// 13. Console silencieuse, et la fenêtre « réseau bloqué » dit les mêmes adresses que la politique
// ============================================================================
// Bêta (« Tout soigner », Antoine, 04/10) : la personne qui ouvre la console du navigateur ne doit pas y lire le démarrage du widget (19 console.log en sortaient). On y garde les avertissements (warn) et les
// erreurs (error), qui ont un sens pour elle ou pour qui signale un problème. dev-tests/verify-first-contact.mjs (script Node `firstContact`) le confirme dans un vrai navigateur au démarrage ; ce contrôle-ci
// garde les sources. Les adresses de la fenêtre « réseau bloqué » sont celles que la politique de sécurité du contenu (index.html) laisse charger des scripts : un nouveau CDN ajouté à la politique s'ajoute
// aussi à HOSTS de js/first-contact.js, avec ce qu'il sert à faire (js/i18n.js, firstContact.host.*), sinon la personne dont le pare-feu le bloque ne saurait pas l'autoriser.
{
  const talkative = [];
  const scan = (where, code) => noCommentsJs(code).split('\n').forEach((line, i) => { if (/\bconsole\s*\.\s*(?:log|info|debug|trace)\s*\(/.test(line)) talkative.push(`${where}:${i + 1}`); });
  jsFiles.forEach(rel => scan(rel, read(rel)));
  const page = read('index.html').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  scan('index.html', page);
  const warned = jsFiles.filter(rel => /\bconsole\s*\.\s*(?:warn|error)\s*\(/.test(noCommentsJs(read(rel)))).length;
  check('console : les sources se lisent bien (garde-fou de l\'analyse elle-même : des console.warn / console.error existent encore)', jsFiles.length >= 60 && warned >= 10, `${jsFiles.length} scripts, ${warned} avec warn ou error`);
  check('console : ni console.log, ni console.info, ni console.debug, ni console.trace dans js/ ou index.html - la console ne reçoit que les avertissements et les erreurs', talkative.length === 0, talkative.join(', '));
  const policy = (page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  const scriptSrc = (policy.match(/script-src([^;]*);/) || [])[1] || '';
  const allowed = [...new Set([...scriptSrc.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]))].sort();
  const listed = [...noCommentsJs(read('js/first-contact.js')).matchAll(/host:\s*'([^']+)'/g)].map(m => m[1]).sort();
  check('premier contact : la fenêtre « réseau bloqué » (HOSTS de js/first-contact.js) liste exactement les sites dont la politique de sécurité du contenu laisse charger des scripts', allowed.length >= 4 && JSON.stringify(allowed) === JSON.stringify(listed), `politique : ${allowed.join(', ')} ; fenêtre : ${listed.join(', ')}`);
}

// ============================================================================
// 14. Aucun mot de travail inachevé, aucun jeton en dur (audit externe de la bêta, 04/10)
// ============================================================================
// L'audit externe (gwaudit, 04/10) a compté douze « marqueurs de travail inachevé » : des commentaires d'anciens tests et du prototype du suivi qui disaient le mot anglais du défaut en capitales, les trois croix
// d'un numéro de SIRET de modèle. Aucun n'était du travail oublié ; ils sont reformulés (« défaut », « numéro à 14 chiffres ») et ce contrôle garde le compte à zéro : aucun des cinq mots de MARKERS, en capitales et
// mot entier, nulle part (code, tests, documents, modèles de la galerie). L'audit signalait aussi une valeur en dur dans `token` (le faux jeton d'un test de la Lecture) : un faux jeton s'appelle `stub-token`, comme
// celui du faux Grist (dev-tests/grist-stub.js). Les mots sont écrits en morceaux dans le code pour que ce fichier ne se compte pas lui-même ; les dossiers cachés (le miroir hors ligne) et node_modules sont ignorés.
{
  const walkText = (dir, exts, out = []) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const rel = dir ? `${dir}/${name}` : name;
      if (statSync(join(ROOT, rel)).isDirectory()) walkText(rel, exts, out);
      else if (exts.test(name)) out.push(rel);
    }
    return out;
  };
  const withoutBlobs = text => text.replace(/[A-Za-z0-9+/=]{120,}/g, ''); // une police ou une image en base64 n'est pas du texte écrit à la main
  const textFiles = walkText('', /\.(?:js|mjs|css|html|md|sh|json|txt)$/);
  const MARKERS = ['TO' + 'DO', 'FIX' + 'ME', 'X'.repeat(3), 'HA' + 'CK', 'B' + 'UG'];
  const markerRe = new RegExp(`\\b(?:${MARKERS.join('|')})\\b`);
  const markers = [];
  const secretRe = /\b(?:token|secret|passwd|password|apiKey|api_key)\b['"]?\s*[:=]\s*(['"])([^'"\n]{6,})\1/gi;   // `i` : une constante `SECRET` ou `PASSWORD` est lue comme `secret` ou `password` (audit du 21/10)
  const hardCoded = [];
  let stubSeen = 0;
  for (const rel of textFiles) {
    const text = withoutBlobs(read(rel));
    text.split('\n').forEach((line, i) => { if (markerRe.test(line)) markers.push(`${rel}:${i + 1}`); });
    if (!/\.(?:js|mjs|html|sh)$/.test(rel)) continue;
    for (const m of text.matchAll(secretRe)) {
      const value = m[2];
      if (value.startsWith('stub-token')) stubSeen++;
      else if (!/[{}]/.test(value) && !/^(?:YOUR_|CHANGE_?ME|PLACEHOLDER)/i.test(value)) hardCoded.push(`${rel} (« ${value} »)`);
    }
  }
  check('travail inachevé : l\'analyse lit bien le dépôt (garde-fou de l\'analyse elle-même : au moins 150 fichiers texte, le faux jeton `stub-token` du faux Grist est vu)', textFiles.length >= 150 && stubSeen >= 1, `${textFiles.length} fichiers, ${stubSeen} faux jeton(s)`);
  check('jetons : l\'analyse lit aussi les noms en capitales (garde-fou de l\'analyse elle-même : une constante `SECRET` ou `PASSWORD` est lue comme `secret` ou `password`)',
    ['SEC' + 'RET', 'PASS' + 'WORD'].every(name => `const ${name} = 'valeur-d-essai'`.match(secretRe)), 'la regex ne lit plus les capitales');
  check('travail inachevé : aucun des cinq mots anglais du travail à reprendre (MARKERS) en capitales et mot entier, ni dans le code, ni dans les tests, les documents ou les modèles - écrire « défaut » ou un libellé en toutes lettres', markers.length === 0, markers.slice(0, 12).join(', '));
  check('jetons : un littéral assigné à token, secret, password ou apiKey est le faux jeton `stub-token` des tests (ou un texte de remplacement), jamais une valeur choisie à la main', hardCoded.length === 0, hardCoded.slice(0, 8).join(', '));
}

// ============================================================================
// 15. Chaque champ de index.html a un nom accessible (audit externe de la bêta, 04/10, point F-RGAA-04)
// ============================================================================
// Un lecteur d'écran lit le nom d'un champ, pas son texte d'exemple (placeholder) : un champ de saisie (input, select, textarea) porte donc un aria-label, un aria-labelledby vers un élément qui existe, un <label for>
// qui le vise, une <label> qui l'entoure, ou un title. L'audit en trouvait onze sans (nom du modèle, nom de fichier PDF, objet / À / Cc / Cci de l'e-mail, les deux colonnes de la fenêtre des liens, deux recherches, le
// caractère déclencheur). Un champ ajouté à index.html sans nom fait échouer ce contrôle ; les noms posés par `data-i18n-aria` suivent la langue de l'interface (dev-tests/scenarios-landmarks.js, groupe `landmarks`).
{
  const page = read('index.html').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const unnamed = [];
  let fields = 0;
  // Les champs texte à bulles (js/field-editor.js) sont des <div> : un lecteur d'écran lit le nom de la zone de saisie que l'éditeur y monte, qui reprend celui de l'élément (aria-label, aria-labelledby).
  const bubbleFields = [...page.matchAll(/<(div)\b([^>]*\bclass="[^"]*\bpp-field-editor\b[^"]*"[^>]*)>/gi)];
  for (const m of [...page.matchAll(/<(input|select|textarea)\b([^>]*)>/gi), ...bubbleFields]) {
    const attrs = m[2];
    const type = ((attrs.match(/\btype="([^"]*)"/i) || [])[1] || (m[1].toLowerCase() === 'input' ? 'text' : '')).toLowerCase();
    if (['hidden', 'button', 'submit', 'reset', 'image'].includes(type)) continue;
    fields++;
    const before = page.slice(0, m.index);
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const labelledBy = (attrs.match(/\baria-labelledby="([^"]+)"/) || [])[1];
    const named = /\baria-label="[^"]+"/.test(attrs) || /\btitle="[^"]+"/.test(attrs)
      || (!!labelledBy && labelledBy.split(/\s+/).every(target => ids.has(target)))
      || (!!id && new RegExp(`<label\\b[^>]*\\bfor="${id}"`).test(page))
      || before.lastIndexOf('<label') > before.lastIndexOf('</label>');
    if (!named) unnamed.push(id ? `#${id}` : `${m[1]} (${attrs.trim().slice(0, 40)})`);
  }
  check('champs : index.html se lit bien (garde-fou de l\'analyse elle-même : une trentaine de champs au moins)', fields >= 30, `${fields} champs`);
  check('champs : chaque champ de saisie de index.html a un nom accessible (aria-label, aria-labelledby, <label for> ou <label> englobante, title) - un texte d\'exemple n\'en est pas un', unnamed.length === 0, unnamed.join(', '));
  const bubbleIds = bubbleFields.map(m => (m[2].match(/\bid="([^"]+)"/) || [])[1]).sort();
  check('champs à bulles : index.html a les cinq champs texte à bulles (Objet, À, Cc, Cci, nom du PDF) en éléments `pp-field-editor`, jamais un <input> : un <input> ne porte pas de bulle', JSON.stringify(bubbleIds) === JSON.stringify(['pdf-filename-template', 'v2-email-cc', 'v2-email-cci', 'v2-email-subject', 'v2-email-to'])
    && !/<input\b[^>]*\bid="(pdf-filename-template|v2-email-subject|v2-email-to|v2-email-cc|v2-email-cci)"/.test(page), bubbleIds.join(', '));
  const at = needle => page.indexOf(needle);
  const once = pattern => (page.match(pattern) || []).length === 1;
  check('champs à bulles : index.html charge css/field-editor.css, js/field-codec.js et js/field-editor.js une fois chacun, le codec avant le champ et les deux avant js/main.js (qui monte les champs au démarrage)',
    once(/<link[^>]*href="css\/field-editor\.css\?v=/g) && once(/<script src="js\/field-codec\.js\?v=/g) && once(/<script src="js\/field-editor\.js\?v=/g)
      && at('js/field-codec.js?v=') < at('js/field-editor.js?v=') && at('js/field-editor.js?v=') < at('js/main.js?v='), `codec ${at('js/field-codec.js?v=')}, champ ${at('js/field-editor.js?v=')}, main ${at('js/main.js?v=')}`);

  // Les boutons (audit externe du 21/10, point F-RGAA-05) : l'audit juge chaque <button> comme s'il était affiché, même celui qu'un script ne montre que dans certains cas (`hidden`) ; sans texte, sans
  // aria-label, sans title, sans aria-labelledby vers un élément qui existe, il n'a pas de nom. Celui de l'aperçu d'un pack de la galerie (#tpl-preview-use-pack) n'en avait pas : son texte (« Utiliser avec 3
  // tables ») n'est écrit qu'à l'ouverture de l'aperçu ; il porte maintenant le libellé par défaut du bouton voisin, que le script remplace. Le texte d'un enfant caché (hidden, aria-hidden) ne nomme rien.
  let buttons = 0;
  const unnamedButtons = [];
  for (const m of page.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    buttons++;
    const attrs = m[1];
    const inner = m[2].replace(/<(\w+)\b[^>]*\b(?:hidden|aria-hidden="true")[^>]*>[\s\S]*?<\/\1>/gi, '');
    const labelledBy = (attrs.match(/\baria-labelledby="([^"]+)"/) || [])[1];
    const named = /\S/.test(inner.replace(/<[^>]*>/g, ''))
      || /\b(?:aria-label|title)="[^"]*\S[^"]*"/.test(attrs) || /<\w+\b[^>]*\b(?:(?:aria-label|title)="[^"]*\S[^"]*"|alt="[^"]*\S[^"]*")/.test(inner)
      || (!!labelledBy && labelledBy.split(/\s+/).some(target => ids.has(target)));
    if (!named) unnamedButtons.push((attrs.match(/\bid="([^"]+)"/) || [])[1] ? `#${attrs.match(/\bid="([^"]+)"/)[1]}` : `button (${attrs.trim().slice(0, 40)})`);
  }
  check('boutons : index.html se lit bien (garde-fou de l\'analyse elle-même : une centaine de boutons au moins)', buttons >= 100, `${buttons} boutons`);
  check('boutons : chaque <button> de index.html a un nom accessible (texte, aria-label, title, aria-labelledby vers un élément qui existe), même caché en attendant un script - l\'audit externe le juge comme s\'il était affiché', unnamedButtons.length === 0, unnamedButtons.join(', '));
}

// ============================================================================
// 16. Une fonction reçue en paramètre ne va pas telle quelle à setTimeout (audit externe de la bêta, 04/10, point C-XSS-04)
// ============================================================================
// L'audit lit `setTimeout(param, délai)` comme un minuteur dont le premier argument pourrait être un texte (exécuté comme du code) : `onLinked` (js/condition-fields.js, rappel de ensureTableLinked) et `update`
// (js/variable-modal.js, calcul de l'aperçu d'une fenêtre) étaient donnés tels quels. Ils passent par une flèche (`() => onLinked()`), qui ne peut rien être d'autre qu'une fonction ; le comportement est le
// même. Ce contrôle garde ces deux appels.
{
  const timers = [['js/condition-fields.js', 'onLinked'], ['js/variable-modal.js', 'update']].map(([rel, name]) => {
    const bare = new RegExp(`\\bset(?:Timeout|Interval)\\(\\s*${name}\\s*[,)]`);
    const wrapped = new RegExp(`\\bsetTimeout\\(\\s*\\(\\)\\s*=>\\s*${name}\\(\\)`);
    const code = noCommentsJs(read(rel));
    return { rel, name, bare: bare.test(code), wrapped: wrapped.test(code) };
  });
  check('minuteurs : les deux appels que l\'audit signalait existent toujours, derrière une flèche (garde-fou de l\'analyse elle-même)', timers.every(t => t.wrapped), JSON.stringify(timers.filter(t => !t.wrapped)));
  check('minuteurs : ni `onLinked` ni `update` n\'est donné tel quel à setTimeout ou setInterval - une flèche l\'appelle', timers.every(t => !t.bare), timers.filter(t => t.bare).map(t => `${t.rel} : ${t.name}`).join(', '));
}

// ============================================================================
// 17. Le prénom de la personne qui a demandé le widget n'est pas dans ce qui est publié (contrôle d'avant la bêta)
// ============================================================================
// Le dépôt public ne reprend que index.html, css, js, extensions, img, templates-gallery et LICENSE : un commentaire, un texte ou un modèle qui cite la personne par son prénom y serait lu par tout le monde.
// Les tests (dev-tests) et les notes de travail (planning) ne sont pas publiés : ils gardent leurs références.
{
  const published = ['index.html', 'LICENSE', ...['css', 'js', 'extensions', 'img', 'templates-gallery'].flatMap(dir => listFiles(dir, /./))];
  const named = [];
  let scanned = 0;
  for (const rel of published) {
    const text = read(rel);
    if (text.includes('\0')) continue; // une image : rien à lire
    scanned++;
    text.split('\n').forEach((line, i) => { if (/\bAntoine\b/.test(line)) named.push(`${rel}:${i + 1}`); });
  }
  check('prénom : l\'analyse lit bien le code publié (garde-fou de l\'analyse elle-même : au moins 100 fichiers texte)', scanned >= 100, `${scanned} fichiers`);
  check('prénom : le prénom de la personne qui a demandé le widget n\'est écrit nulle part dans index.html, css, js, extensions, img, templates-gallery ni LICENSE - un commentaire dit la raison d\'un choix, pas qui l\'a demandé', named.length === 0, named.join(', '));
}

// ============================================================================
// 18. Les moteurs d'export ne se chargent qu'au premier export (choix d'Antoine du 05/10 : « Maintenant »)
// ============================================================================
// PDF, fusion des PDF, feuilles d'assemblage, Word, Excel, le format des nombres d'Excel, le Markdown et le HTML font ~430 Ko (~125 Ko compressés) : index.html les déclare en balises inertes
// (`<script type="text/x-lazy-engine" data-engine="…" src="…">`, que le navigateur ne lit pas) et js/export-engines.js les charge au premier besoin (`ExportEngines.ensure`). Ce contrôle garde
// ce que le banc dev-tests/verify-lazy-engines.mjs ne voit pas d'un coup d'œil : un des fichiers de moteur qui redevient une balise ordinaire (chargé à l'ouverture, comme avant), un nom de moteur
// écrit de travers dans un export, et un script qui appelle un moteur sans le faire charger (une erreur « PdfExport n'est pas défini » au premier clic, que seul cet export-là montre).
{
  const ENGINE_FILES = { pdf: 'pdf-export', sheets: 'sheet-layout', merge: 'pdf-merge', docx: 'docx-export', xlsx: 'xlsx-export', xlsxFormat: 'xlsx-number-format', md: 'markdown-export', html: 'html-export' };
  const ENGINE_GLOBALS = { PdfExport: 'pdf-export', SheetLayout: 'sheet-layout', PdfMerge: 'pdf-merge', DocxExport: 'docx-export', XlsxExport: 'xlsx-export', XlsxNumberFormat: 'xlsx-number-format', MarkdownExport: 'markdown-export', HtmlExport: 'html-export' };
  // Les fichiers qui nomment un moteur sans nommer ExportEngines : la fenêtre des planches, que js/main.js (onExportBatch) n'ouvre qu'après avoir chargé « sheets ».
  const CALLED_AFTER_ENSURE = ['js/sheet-assembly-dialog.js'];
  const page = read('index.html').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const attr = (attrs, name) => (attrs.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
  const tags = [...page.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
  const inert = tags.filter(attrs => attr(attrs, 'type') === 'text/x-lazy-engine').map(attrs => ({ engine: attr(attrs, 'data-engine'), src: attr(attrs, 'src') }));
  const ordinary = tags.filter(attrs => !attr(attrs, 'type')).map(attrs => attr(attrs, 'src')).filter(Boolean);
  const engineFileNames = Object.values(ENGINE_FILES);
  check('moteurs d\'export : index.html déclare une balise inerte par moteur (ENGINE_FILES), chacune vers son fichier avec une version de cache (?v=)',
    inert.length === Object.keys(ENGINE_FILES).length && Object.entries(ENGINE_FILES).every(([engine, file]) => inert.filter(t => t.engine === engine && new RegExp(`^js/${file}\\.js\\?v=\\d+(\\.\\d+)*$`).test(t.src || '')).length === 1), JSON.stringify(inert));
  check('moteurs d\'export : aucun des fichiers de moteur n\'est un <script src> ordinaire de index.html (le navigateur le chargerait à l\'ouverture) ; js/export-engines.js l\'est, une fois',
    ordinary.every(src => !engineFileNames.some(file => src.startsWith(`js/${file}.js`))) && ordinary.filter(src => /^js\/export-engines\.js\?v=/.test(src)).length === 1, ordinary.filter(src => engineFileNames.some(file => src.startsWith(`js/${file}.js`))).join(', '));

  // Les noms de moteurs que le code demande : `engines: ['pdf', 'merge']` (js/main.js) et `ExportEngines.ensure('xlsx', 'xlsxFormat')`.
  const asked = [];
  const users = [];
  for (const rel of jsFiles) {
    if (rel === 'js/export-engines.js') continue;
    const code = noCommentsJs(read(rel));
    for (const m of code.matchAll(/\bengines:\s*\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/'([^']+)'/g)) asked.push([rel, n[1]]);
    for (const m of code.matchAll(/\bExportEngines\.ensure\(([^)]*)\)/g)) for (const n of m[1].matchAll(/'([^']+)'/g)) asked.push([rel, n[1]]);
    const ownFile = rel.replace(/^js\//, '').replace(/\.js$/, '');
    const named = Object.entries(ENGINE_GLOBALS).filter(([name, file]) => file !== ownFile && new RegExp(`\\b${name}\\b`).test(code)).map(([name]) => name);
    if (named.length) users.push({ rel, named, ensures: /\bExportEngines\b/.test(code) });
  }
  const unknown = asked.filter(([, name]) => !ENGINE_FILES[name]).map(([rel, name]) => `${rel} : « ${name} »`);
  check('moteurs d\'export : l\'analyse lit bien le code (garde-fou de l\'analyse elle-même : au moins dix noms de moteur demandés, js/main.js et js/grid-xlsx-import.js parmi les fichiers qui en demandent)',
    asked.length >= 10 && ['js/main.js', 'js/grid-xlsx-import.js'].every(rel => asked.some(([file]) => file === rel)), `${asked.length} noms`);
  check('moteurs d\'export : chaque nom de moteur demandé (engines: [...], ExportEngines.ensure(...)) est un moteur déclaré dans index.html', unknown.length === 0, unknown.join(', '));
  check('moteurs d\'export : chacun des moteurs est demandé quelque part (un moteur que rien ne charge ne s\'exécuterait jamais)', Object.keys(ENGINE_FILES).every(name => asked.some(([, asking]) => asking === name)), Object.keys(ENGINE_FILES).filter(name => !asked.some(([, asking]) => asking === name)).join(', '));
  const unguarded = users.filter(u => !u.ensures && !CALLED_AFTER_ENSURE.includes(u.rel)).map(u => `${u.rel} (${u.named.join(', ')})`);
  check('moteurs d\'export : un script qui appelle PdfExport, PdfMerge, SheetLayout, DocxExport, XlsxExport, XlsxNumberFormat, MarkdownExport ou HtmlExport hors de son fichier nomme ExportEngines (il fait charger le moteur avant) - sinon le premier export, seul, échoue',
    users.length >= 2 && unguarded.length === 0, unguarded.length ? unguarded.join(', ') : `${users.length} fichiers`);
}

// ============================================================================
// 19. Une table du widget ne se crée qu'après l'accord de la personne (choix d'Antoine du 05/10)
// ============================================================================
// Le widget range ses modèles, ses commentaires et ses réglages dans des tables du document (Publipostage_…, visibles dans la liste des pages de Grist). Leur création passe par UNE porte, addTableIfMissing
// de js/grist-api.js, qui pose la question de js/table-consent.js avant d'écrire (dev-tests/unit-table-consent.mjs et verify-table-consent-mouse.mjs en gardent le comportement). Ce contrôle garde ce que
// ces deux scripts ne voient pas : un `AddTable` écrit ailleurs (une table créée sans question), la question sautée dans addTableIfMissing, et js/table-consent.js qui n'est plus chargé avant le démarrage
// anticipé d'index.html (la première création partirait sans qu'elle soit branchée : le widget créerait ses tables sans demander).
{
  // Deux exceptions, deux gestes explicites qui ne sont pas des tables du widget : la galerie de modèles crée la table de DONNÉES que la personne vient de nommer elle-même dans une fenêtre
  // (js/template-gallery-modal.js, useWithData) ; l'installateur des modèles à pack (js/template-pack.js) crée les tables du modèle que la personne a choisi, que la fenêtre lui a nommées une à une
  // et qu'elle a acceptées (contrôle plus bas : la galerie est la seule à l'appeler, et la question précède l'appel).
  const ALLOWED = ['js/grist-api.js', 'js/template-gallery-modal.js', 'js/template-pack.js'];
  const creators = jsFiles.filter(rel => /['"]AddTable['"]/.test(noCommentsJs(read(rel))));
  check('tables : l\'analyse lit bien le code (garde-fou de l\'analyse elle-même : js/grist-api.js écrit un AddTable)', creators.includes('js/grist-api.js'), creators.join(', '));
  check('tables : « AddTable » n\'est écrit que dans js/grist-api.js (addTableIfMissing, qui pose la question), dans la galerie de modèles (la table que la personne nomme elle-même) et dans l\'installateur des modèles à pack - toute autre création de table passerait sans question',
    creators.every(rel => ALLOWED.includes(rel)), creators.filter(rel => !ALLOWED.includes(rel)).join(', '));

  const installers = jsFiles.filter(rel => /TemplatePack\.apply\(/.test(noCommentsJs(read(rel))));
  check('tables : l\'installateur des modèles à pack (TemplatePack.apply) n\'est appelé que par la galerie (js/template-gallery-modal.js)',
    installers.length === 1 && installers[0] === 'js/template-gallery-modal.js', installers.join(', '));
  const gallery = noCommentsJs(read('js/template-gallery-modal.js'));
  const useAt = gallery.indexOf('async function useWithPack');
  const useBody = useAt === -1 ? '' : gallery.slice(useAt, gallery.indexOf('\n  }\n', useAt));
  const asksFirst = useBody.indexOf('Dialogs.confirm(');
  const installs = useBody.indexOf('TemplatePack.apply(');
  check('tables : la galerie pose la question « Créer les tables du modèle ? » (Dialogs.confirm) AVANT TemplatePack.apply, et ne crée rien si la personne répond non',
    asksFirst !== -1 && installs !== -1 && asksFirst < installs && /Dialogs\.confirm\([^\n]*\)\)\)\s*return;/.test(useBody), `${useBody.length} caractères, question en ${asksFirst}, installation en ${installs}`);

  const api = noCommentsJs(read('js/grist-api.js'));
  const start = api.indexOf('async function addTableIfMissing');
  const body = start === -1 ? '' : api.slice(start, api.indexOf('\n  }\n', start));
  const asks = body.indexOf('tableCreationConsent(');
  const writes = body.indexOf('\'AddTable\'');
  check('tables : addTableIfMissing demande l\'accord (tableCreationConsent) AVANT d\'écrire l\'AddTable, et lève l\'erreur « refusée » (tablesDeclinedError) quand la personne refuse',
    asks !== -1 && writes !== -1 && asks < writes && /tablesDeclinedError\(\)/.test(body), `${body.length} caractères, question en ${asks}, écriture en ${writes}`);

  const page = read('index.html').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const at = needle => page.indexOf(needle);
  const early = at('GristAPI.init()');
  check('tables : index.html charge js/table-consent.js (une fois) après js/grist-api.js et js/templates.js, et AVANT le script en ligne du démarrage anticipé (qui lance la première création de table)',
    (page.match(/<script src="js\/table-consent\.js\?v=/g) || []).length === 1 && early !== -1
      && at('js/grist-api.js?v=') < at('js/table-consent.js?v=') && at('js/table-consent.js?v=') < early, `grist-api ${at('js/grist-api.js?v=')}, table-consent ${at('js/table-consent.js?v=')}, démarrage anticipé ${early}`);
}

// ============================================================================
// 20. Une image d'un autre site ne charge qu'après un clic « Afficher » (choix d'Antoine du 05/10, « Bloquer jusqu'à un clic »)
// ============================================================================
// Une <img> dont l'adresse est un autre site télécharge cette adresse dès que le navigateur la voit : le site apprend alors que le document est ouvert. Les surfaces qui écrivent le HTML du modèle dans la page
// passent donc par js/external-images.js (block, blockIn : le cadre « Afficher » à la place de l'adresse) ; la vue d'image de l'éditeur ne donne pas d'adresse à son <img> (blockedSiteOf). dev-tests/
// scenarios-external-images.js et verify-external-images-mouse.mjs gardent le comportement, requêtes du navigateur comprises ; ce contrôle garde les points d'entrée qu'un nouveau code oublierait.
{
  // Le corps d'une fonction : de sa ligne de déclaration à la première ligne qui ferme à la même indentation.
  const bodyOf = (code, needle) => {
    const at = code.indexOf(needle);
    if (at === -1) return '';
    const lineStart = code.lastIndexOf('\n', at) + 1;
    const indent = code.slice(lineStart).match(/^ */)[0];
    const end = code.indexOf('\n' + indent + '}', at);
    return end === -1 ? '' : code.slice(at, end);
  };
  // `first` doit venir avant `then` dans le corps : le cadre est posé AVANT que le HTML entre dans la page.
  const before = (body, first, then) => { const a = body.indexOf(first), b = body.indexOf(then); return a !== -1 && b !== -1 && a < b; };

  const reader = noCommentsJs(read('js/reader-mode.js'));
  check('images externes : la Lecture passe le HTML du document par ExternalImages.block AVANT de l\'écrire dans la page (readerWrapperFrom)',
    before(bodyOf(reader, 'function readerWrapperFrom'), 'ExternalImages.block(', 'wrapper.innerHTML ='), bodyOf(reader, 'function readerWrapperFrom').length + ' caractères');
  check('images externes : la Lecture passe aussi chaque zone d\'en-tête et de pied par ExternalImages.block AVANT l\'écrire (resolveHeaderFooterZone)',
    before(bodyOf(reader, 'async function resolveHeaderFooterZone'), 'ExternalImages.block(', 'wrapper.innerHTML ='), bodyOf(reader, 'async function resolveHeaderFooterZone').length + ' caractères');
  const layout = noCommentsJs(read('js/page-layout.js'));
  check('images externes : les en-têtes et pieds de l\'aperçu paginé (PageLayout.resolvePageNumberBadges) passent par ExternalImages.blockIn (dans le <template> inerte) avant que le HTML ne soit rendu',
    before(bodyOf(layout, 'function resolvePageNumberBadges'), 'ExternalImages.blockIn(', 'return host.innerHTML'), bodyOf(layout, 'function resolvePageNumberBadges').length + ' caractères');
  check('images externes : l\'aperçu d\'un modèle de la galerie passe par ExternalImages.block (sans feuille réduite : zoom 1)',
    /previewTiptap\.innerHTML\s*=\s*ExternalImages\.block\(/.test(noCommentsJs(read('js/template-gallery-modal.js'))), 'previewTiptap.innerHTML');
  const nodes = noCommentsJs(read('js/editor-nodes.js'));
  const apply = bodyOf(nodes, 'function applyImageAttrs');
  check('images externes : la vue d\'image de l\'éditeur (applyImageAttrs) ne donne pas d\'adresse à son <img> tant que le site n\'est pas affiché (ExternalImages.blockedSiteOf)',
    /ExternalImages\.blockedSiteOf\(/.test(apply) && /const shownSrc\s*=\s*\(isVarBox \|\| blockedSite\)\s*\?\s*''/.test(apply) && /img\.src\s*=\s*shownSrc/.test(apply), apply.length + ' caractères');
  const comments = noCommentsJs(read('js/comments.js'));
  const readerHtml = bodyOf(comments, 'async function buildReaderHtml');
  check('images externes : la Lecture avec commentaires (buildReaderHtml) sérialise le document dans un document inerte (createHTMLDocument), jamais dans celui de la page : une <img> créée là charge son adresse même détachée',
    /createHTMLDocument\(/.test(readerHtml) && !/serializeFragment\([^)]*\{\s*document\s*\}/.test(readerHtml) && !/\bdocument\.createElement\('div'\)/.test(readerHtml), readerHtml.length + ' caractères');

  const page = read('index.html').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const at = needle => page.indexOf(needle);
  check('images externes : index.html charge js/external-images.js une fois, avant js/main.js, et css/external-images.css une fois',
    (page.match(/<script src="js\/external-images\.js\?v=/g) || []).length === 1 && at('js/external-images.js?v=') !== -1 && at('js/external-images.js?v=') < at('js/main.js?v=')
      && (page.match(/<link[^>]*href="css\/external-images\.css\?v=/g) || []).length === 1, `external-images ${at('js/external-images.js?v=')}, main ${at('js/main.js?v=')}`);
  const ext = noCommentsJs(read('js/external-images.js'));
  check('images externes : js/external-images.js lit le HTML dans un <template> inerte (Dom.inertTemplate : jamais innerHTML sur un nœud de la page) et ne garde rien nulle part (ni localStorage, ni sessionStorage, ni appel à Grist)',
    /Dom\.inertTemplate\(/.test(ext) && !/\.innerHTML\s*=/.test(ext) && !/localStorage|sessionStorage|applyUserActions|GristAPI\.(?!getAttachmentDownloadUrl)/.test(ext), 'external-images.js');
}

// ============================================================================
// 21. Rien de ce que le widget charge ne porte un nom qui commence par « _ » ou « . » (GitHub Pages ne le sert pas)
// ============================================================================
// GitHub Pages construit le site avec Jekyll, qui laisse de côté tout fichier ou dossier dont le nom commence par « _ » ou « . » : templates-gallery/_tables/gestion.json se lisait très bien en local (c'est
// là que tous les essais le lisent) et répondait 404 en ligne, si bien que 17 modèles de la galerie ne s'ouvraient pas sur le site publié (09/10). Seul ce garde-fou peut le voir avant la mise en ligne.
{
  const served = ['css', 'js', 'extensions', 'img', 'templates-gallery', 'templates-gallery-dev'].flatMap(dir => listFiles(dir, /./));
  const hidden = served.filter(rel => rel.split('/').some(part => /^[_.]/.test(part)));
  check('pages : l\'analyse lit bien ce que le widget charge (garde-fou de l\'analyse elle-même : au moins 100 fichiers)', served.length >= 100, `${served.length} fichiers`);
  check('pages : aucun fichier ni dossier de css, js, extensions, img, templates-gallery ou templates-gallery-dev ne commence par « _ » ou « . » - GitHub Pages (Jekyll) ne le sert pas : il répond 404 en ligne alors qu\'il se lit en local', hidden.length === 0, hidden.slice(0, 5).join(', '));
  const files = served.filter(rel => rel.startsWith('templates-gallery/families/'));
  check('pages : les tables de famille des modèles de la galerie sont dans templates-gallery/families/ (le dossier se lit en ligne) et js/template-gallery.js les y cherche', files.length >= 16 && /resolveUrl\('families\/' \+ raw\.family/.test(read('js/template-gallery.js')), `${files.length} fichiers`);
}

// ============================================================================
// 22. La feuille de route du README public ne promet pas ce que le widget livre déjà (relevé du 12/10)
// ============================================================================
// « Export PDF : impression full HD, PDF compressé (V1) » restait à venir dans la feuille de route, en français et en anglais, alors que l'impression par le navigateur et le PDF « Léger » sont livrés et
// décrits plus haut : le public lisait une promesse déjà tenue. Aucun test fonctionnel ne lit le README ; ce contrôle garde les deux lignes retirées.
{
  const readme = read('outils/depot-propre/public/README.md');
  const promised = readme.match(/full HD|PDF compressé|compressed PDF/gi) || [];
  check('README public : la feuille de route ne promet plus un « PDF full HD » ni un « PDF compressé » (livrés : l\'impression par le navigateur et le PDF « Léger », décrits plus haut)', promised.length === 0, promised.join(', '));
  check('README public : l\'impression par le navigateur et le PDF « Léger » sont décrits, en français et en anglais (ce que la feuille de route promettait)',
    /Impression par le navigateur/.test(readme) && /PDF « Léger »/.test(readme) && /Browser print/.test(readme) && /Light PDF/.test(readme), 'README.md');
}

// ============================================================================
// 23. Changer de langue dans Réglages recharge la page, rien d'autre (demande du 14/10)
// ============================================================================
// « Quand on change de langue, on recharge la page et uniquement ça, pour ne pas alourdir » : Réglages ne retraduit plus rien sur place. Le choix passe par I18n.storeLang puis reloadKeepingTemplate (qui recharge, location.reload()), après la
// question « Enregistrer / Abandonner / Annuler » quand une modification attend (comme tout ce qui remplace le contenu de l'éditeur) ; un stockage refusé ne change rien : la case revient sur la langue de
// la page. Un retour de l'ancien comportement (I18n.setLang appelé par les cases de langue) ne casserait rien à l'écran, il ne changerait simplement plus la page : ce contrôle le garde.
{
  const settings = noCommentsJs(read('js/settings.js'));
  const i18n = noCommentsJs(read('js/i18n.js'));
  const main = noCommentsJs(read('js/main.js'));
  const fn = (settings.match(/async function changeLanguage\(next, leave\) \{[\s\S]*?\n  \}/) || [''])[0];
  const at = needle => fn.indexOf(needle);
  check('langue : les cases de langue de Réglages passent par changeLanguage, jamais directement par I18n.setLang',
    /wireRadios\('settings-lang', value => changeLanguage\(value, leave\)\)/.test(settings) && !/wireRadios\('settings-lang', value => I18n\.setLang/.test(settings), 'js/settings.js');
  check('langue : changeLanguage pose la question (hasEditsToConfirmBeforeLeaving, askBeforeLeaving) AVANT de garder la langue et de recharger',
    fn !== '' && at('hasEditsToConfirmBeforeLeaving') !== -1 && at('askBeforeLeaving') > at('hasEditsToConfirmBeforeLeaving') && at('I18n.storeLang(') > at('askBeforeLeaving') && at('reloadKeepingTemplate()') > at('I18n.storeLang('), fn);
  check('langue : « Annuler » rend la case de la langue de la page (checkLangRadios) et ne recharge pas', /askBeforeLeaving\(\)\)\) \{ checkLangRadios\(\); return; \}/.test(fn), fn);
  check('langue : un stockage refusé ne change rien : la case revient sur la langue de la page (checkLangRadios), sans rechargement ni I18n.setLang',
    /if \(!I18n\.storeLang\(next\)\) \{ checkLangRadios\(\); return; \}\s*reloadKeepingTemplate\(\);/.test(fn) && !/I18n\.setLang/.test(fn), fn);
  check('langue : js/main.js donne à Réglages la question « Enregistrer / Abandonner / Annuler »', /Settings\.wireSettingsModal\(\{ hasEditsToConfirmBeforeLeaving, askBeforeLeaving \}\)/.test(main), 'js/main.js');
  // Un rechargement que l'app veut (langue, touche de déclenchement) ramène la personne sur le modèle où elle était (demande du 20/10) : l'identifiant passe par le fragment `#pp-open=<id>` de l'adresse du cadre,
  // écrit par history.replaceState juste avant location.reload(), lu puis effacé au démarrage par js/main.js avant tout autre choix de modèle. Jamais par le stockage du navigateur : le cadre isolé de GFS (origine
  // nulle) le refuse, et ce cadre est le seul endroit où la demande portait aussi.
  const reload = (settings.match(/function reloadKeepingTemplate\(language, openId\) \{[\s\S]*?\n  \}/) || [''])[0];
  const take = (settings.match(/function takeReopenId\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  check('réouverture : reloadKeepingTemplate laisse l\u2019identifiant du modèle ouvert dans le fragment de l\u2019adresse (history.replaceState) AVANT de recharger, et la langue et la touche de déclenchement passent par lui',
    reload !== '' && reload.indexOf('Templates.getCurrentId()') !== -1 && reload.indexOf("'pp-open='") !== -1 && reload.indexOf("'#' + parts.join('&')") !== -1 && reload.indexOf('history.replaceState(') !== -1 && reload.indexOf('location.reload()') > reload.indexOf('history.replaceState(')
      && /reloadBtn\.addEventListener\('click', reloadKeepingTemplate\)/.test(settings), reload);
  check('réouverture : takeReopenId lit le fragment, l\u2019efface aussitôt (history.replaceState) et ne touche à aucun autre fragment ; il n\u2019écrit ni ne lit aucun stockage du navigateur',
    take !== '' && settings.includes(String.raw`const REOPEN_HASH = /^#(?:pp-open=(\d+)(?:&pp-lang=(?:fr|en))?|pp-lang=(?:fr|en))$/;`) && take.indexOf('history.replaceState(') !== -1 && !/(?:local|session)Storage|indexedDB|document\.cookie/.test(reload + take), take);
  check('réouverture : js/main.js lit ce fragment (Settings.takeReopenId) avant le modèle que GFS désigne, la ligne, la vue et le ★, qui passent après lui',
    main.indexOf('Settings.takeReopenId()') !== -1 && main.indexOf('Settings.takeReopenId()') < main.indexOf('GfsOpen.startupTemplateId()')
      && /\[reopenTemplateId, gfsTemplateId, startupRowTemplateId, ViewTemplate\.usableId\(\), Templates\.getDefaultId\(\)\]/.test(main), 'js/main.js');
  check('langue : I18n garde le choix par storeLang (faux si le stockage est refusé), seul endroit qui écrit pp_lang ; setLang (réservé aux tests) ne touche ni la page ni le stockage',
    /function storeLang\(next\)[\s\S]*?return true;[\s\S]*?return false;/.test(i18n) && /function setLang\(next\) \{ lang = next === 'en' \? 'en' : 'fr'; \}/.test(i18n) && (i18n.match(/localStorage\.setItem\('pp_lang'/g) || []).length === 1 && /return \{ t, has, getLang, setLang, storeLang \};/.test(i18n), 'js/i18n.js');

  // La langue de GFS (consigne 019, contrats de GFS 5.2 point 6) : un seul choix par personne pour GFS et toutes ses apps. Hébergée, la page la prend au départ avant le stockage et le navigateur, la suit à chaque
  // événement `langue`, grise les cases de Réglages avec la raison, et ne recopie jamais la langue de GFS dans le stockage de l'app. Seule, rien de tout cela (gfs=<n> absent de l'adresse, `language()` rend null).
  const gfsLink = noCommentsJs(read('js/gfs-link.js'));
  const gfsLang = (i18n.match(/function gfsLang\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  const initial = (i18n.match(/function initialLang\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  const lock = (settings.match(/function applyLanguageLock\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  const follow = (settings.match(/async function followGfsLanguage\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  check('langue de GFS : js/i18n.js la lit au départ (gfsLang) AVANT le stockage et le navigateur, seulement quand l\u2019adresse porte gfs=<n>, en acceptant « fr » et « en » seulement (le fragment pp-lang d\u2019un rechargement de l\u2019app d\u2019abord)',
    gfsLang !== '' && initial !== '' && initial.indexOf('gfsLang()') !== -1 && initial.indexOf('gfsLang()') < initial.indexOf('localStorage.getItem') && initial.indexOf('localStorage.getItem') < initial.indexOf('navigator.languages')
      && gfsLang.indexOf("search.get('gfs')") !== -1 && gfsLang.indexOf('\\d{1,6}') !== -1 && /\(fr\|en\)/.test(gfsLang) && gfsLang.indexOf('window.location.hash') < gfsLang.indexOf("search.get('language')")
      && gfsLang.indexOf("given === 'fr' || given === 'en'") !== -1 && !/(?:local|session)Storage/.test(gfsLang), gfsLang);
  check('langue de GFS : js/gfs-link.js garde `langue` du contexte et de l\u2019événement `langue` seulement si elle vaut « fr » ou « en », rappelle les abonnés une fois par changement, et la rend par language() / onLanguage()',
    /if \(data\.langue === 'fr' \|\| data\.langue === 'en'\) language = data\.langue;/.test(gfsLink) && /message\.type === 'evenement' && message\.nom === 'langue'\) applyLanguage\(message\.data\)/.test(gfsLink)
      && /\(next !== 'fr' && next !== 'en'\) \|\| next === language\) return;/.test(gfsLink) && /language: getLanguage, /.test(gfsLink) && /onLanguage, /.test(gfsLink) && !/(?:local|session)Storage/.test(gfsLink), 'js/gfs-link.js');
  check('langue de GFS : applyLanguageLock grise les deux cases (disabled, jamais retirées ni masquées) et montre la phrase de la raison seulement quand GFS donne la langue ; elle passe à chaque ouverture de Réglages',
    lock !== '' && /const locked = GfsLink\.language\(\) !== null;/.test(lock) && /radio\.disabled = locked;/.test(lock) && /classList\.toggle\('is-disabled', locked\)/.test(lock) && /note\.hidden = !locked;/.test(lock) && !/\.remove\(|\.hidden = locked|display/.test(lock)
      && /openBtn\.addEventListener\('click', \(\) => \{\s*checkLangRadios\(\);\s*applyLanguageLock\(\);/.test(settings), lock);
  check('langue de GFS : followGfsLanguage pose la question (hasEditsToConfirmBeforeLeaving, askBeforeLeaving) AVANT de relire la langue de GFS et de recharger ; l\u2019événement `langue` l\u2019appelle, et js/main.js la rappelle à la fin de init(), après l\u2019ouverture du modèle',
    follow !== '' && follow.indexOf('hasEditsToConfirmBeforeLeaving') !== -1 && follow.indexOf('askBeforeLeaving') > follow.indexOf('hasEditsToConfirmBeforeLeaving') && follow.indexOf('GfsLink.language()', follow.indexOf('askBeforeLeaving')) > follow.indexOf('askBeforeLeaving')
      && follow.indexOf('reloadKeepingTemplate(next)') > follow.indexOf('askBeforeLeaving') && /GfsLink\.onLanguage\(\(\) => \{ applyLanguageLock\(\); followGfsLanguage\(\); \}\)/.test(settings)
      && /checkAfterOpen\(\);\s*Settings\.followGfsLanguage\(\);\s*\}/.test(main) && main.indexOf('Settings.followGfsLanguage()') > main.indexOf('Settings.takeReopenId()'), follow);
  check('langue de GFS : une langue qui ne peut pas passer par l\u2019adresse (non modifiable) ne recharge pas la page (elle repartirait dans l\u2019ancienne et s\u2019y reprendrait sans fin) ; sans langue donnée, la langue de GFS est gardée dans le fragment',
    reload !== '' && /catch \(e\) \{ if \(asked\) return false; \}/.test(reload) && /const carried = asked \? language : GfsLink\.language\(\);/.test(reload) && reload.indexOf("'pp-lang=' + carried") !== -1, reload);
  const page = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const noteTag = (page.match(/<p [^>]*id="settings-language-gfs-note"[^>]*>/) || [''])[0];
  check('langue de GFS : la phrase des cases grisées est dans index.html, cachée au départ et traduite (français et anglais), après les deux cases ; une case grisée a son style (opacité, curseur) dans css/toolbar-v2.css',
    /\bhidden\b/.test(noteTag) && noteTag.indexOf('data-i18n="settings.language.gfsNote"') !== -1 && page.indexOf('id="settings-language-gfs-note"') > page.indexOf('name="settings-lang" value="en"')
      && /'settings\.language\.gfsNote': \{ fr: '[^']+', en: '[^']+' \}/.test(i18n) && /\.settings-radio-row label\.is-disabled \{[^}]*opacity: \.45;[^}]*cursor: default;/.test(read('css/toolbar-v2.css')), noteTag);
}

// ============================================================================
// 24. Plus aucun écran ne se retraduit en direct (demande du 14/10)
// ============================================================================
// Réglages recharge la page pour changer de langue : un écran écrit ses libellés, ses infobulles et ses noms accessibles quand il se bâtit ou s'ouvre, dans la langue de la page, et ne les relit pas.
// Les inscriptions à I18n.onChange ont été retirées par lots (« Oui, retirer », 14/10) ; ce contrôle garde le résultat : I18n n'a plus de crochet de changement de langue, aucun fichier de js/ n'en demande
// un (la règle est écrite dans la charte UX/UI, §1), et aucun n'appelle I18n.setLang, que seuls les tests utilisent.
{
  const i18n = noCommentsJs(read('js/i18n.js'));
  const listening = [], setting = [];
  for (const file of jsFiles) {
    const code = noCommentsJs(read(file));
    if (/\bI18n\.onChange\(/.test(code)) listening.push(file);
    if (/\bI18n\.setLang\(/.test(code)) setting.push(file);
  }
  check('langue : I18n n\'offre plus de crochet de changement de langue (ni onChange, ni liste d\'abonnés, ni applyTranslations en export)', !/\bonChange\b/.test(i18n) && !/changeListeners/.test(i18n) && !/return \{[^}]*applyTranslations/.test(i18n), 'js/i18n.js');
  check('langue : aucun fichier de js/ ne s\'inscrit à I18n.onChange (un écran écrit ses libellés quand il se bâtit ou s\'ouvre, la page ne change plus de langue en route)', listening.length === 0, listening.join(', '));
  check('langue : aucun fichier de js/ n\'appelle I18n.setLang (réservé aux tests : le produit garde la langue par storeLang puis recharge la page)', setting.length === 0, setting.join(', '));
}

// ============================================================================
// 25. Le graphique est une extension de Grist Factory Suite : son code est à part, sa bibliothèque n'est pas dans l'app (consigne GFS 005, 14/10)
// ============================================================================
// « Seules les dépendances non natives (graphique, édition en direct, diapositives) ne sont plus dans le code ici mais uniquement via GFS » (14/10). Le code du graphique vit dans extensions/graphique/ (trois scripts
// et une feuille de style) : js/extensions.js nomme ses fichiers et les charge au premier usage, et seulement si GFS dit l'extension active ; index.html n'en demande aucun (l'outil d'audit de GFS compte les
// balises de la page, pas ce registre). Plotly, sa bibliothèque, est une affaire de GFS : sa source { src, integrite } arrive par le contexte (js/gfs-link.js), l'app ne la nomme ni dans sa liste ni dans sa
// carte d'importation, et n'écrit ni son adresse ni son empreinte dans son code ; seule la version exacte qu'exige l'extension s'écrit, une fois. UNE exception, voulue par la consigne 007 : la politique de
// sécurité du contenu d'index.html garde l'adresse exacte du catalogue de GFS pour le mode CDN (GFS ne peut imposer aucune politique à un sous-cadre : sans elle le navigateur refuse le script), et rien d'autre pour
// le graphique. Rien de tout cela ne casserait un test fonctionnel : sans ce contrôle, Plotly pourrait revenir dans la liste ou l'import map un jour de précipitation, l'adresse disparaître de la politique
// (le mode CDN de GFS serait refusé sans bruit), la politique s'ouvrir à tout jsDelivr, ou le graphique se rebrancher par une balise <script>.
{
  const raw = read('index.html');
  const page = raw.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const policy = (page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  // La page sans sa politique : l'adresse de Plotly n'a de place que dans la politique (consigne 007) ; partout ailleurs dans la page - une balise <script src>, un <link> -, elle n'a rien à faire.
  const pageWithoutPolicy = page.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*"/, '<meta csp>');
  const importMap = (page.match(/<script\b[^>]*type\s*=\s*["']?importmap[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || '';
  const list = read('dev-tests/.offline-cache/package.json') + '\n' + read('dev-tests/.offline-cache/build.mjs');
  const PLOTLY_ADDRESS = EXTENSION_LIBRARY_ADDRESSES.plotly;   // l'adresse du catalogue de GFS (bibliotheques/catalogue.json), mode CDN
  check('extension : ni la liste des bibliothèques de l\'app (dev-tests/.offline-cache) ni la carte d\'importation d\'index.html ne nomment Plotly (GFS le porte)',
    importMap.length > 100 && list.length > 100 && !/plotly/i.test(importMap) && !/plotly/i.test(list), JSON.stringify({ importMap: /plotly/i.test(importMap), list: /plotly/i.test(list) }));
  // Pareil pour l'écriture en direct (consigne GFS 012, 16/10) : les six paquets de son fichier « edition-live » (que GFS assemble) ne sont pas dans la liste de l'app non plus, ni nommés par build.mjs ; leurs versions
  // exactes et la recette de l'assemblage sont dans dev-tests/.offline-cache/edition-live.json, à part, que build.mjs lit pour refaire le fichier des essais. Le labo de GFS ne copie que build.mjs et package.json :
  // sans ce fichier, build.mjs saute cette étape.
  const LIVE_SIX = ['yjs', 'y-protocols', 'lib0', '@tiptap/y-tiptap', '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-caret'];
  const liveNamedInList = LIVE_SIX.filter(name => list.includes('"' + name + '"') || list.includes("'" + name + "'") || list.includes("'" + name + '/'));
  check('extension : ni la liste des bibliothèques de l\'app (dev-tests/.offline-cache/package.json) ni build.mjs ne nomment les six paquets de l\'écriture en direct (GFS les porte : edition-live.json, à part)',
    list.length > 100 && liveNamedInList.length === 0, liveNamedInList.join(', '));
  let liveSpec = null;
  try { liveSpec = JSON.parse(read('dev-tests/.offline-cache/edition-live.json')); } catch (e) { liveSpec = null; }
  const liveDeps = (liveSpec && liveSpec.dependencies) || {};
  check('extension : edition-live.json (lu par build.mjs) porte les six paquets de l\'écriture en direct, chacun à une version exacte, et la recette de l\'assemblage ; build.mjs le lit',
    !!liveSpec && JSON.stringify(Object.keys(liveDeps).sort()) === JSON.stringify(LIVE_SIX.slice().sort()) && Object.values(liveDeps).every(version => /^\d+\.\d+\.\d+$/.test(String(version)))
      && !!liveSpec.assemble && Array.isArray(liveSpec.assemble.modules) && liveSpec.assemble.modules.length === 5 && /edition-live\.json/.test(read('dev-tests/.offline-cache/build.mjs')),
    liveSpec ? Object.keys(liveDeps).join(', ') : 'edition-live.json introuvable ou illisible');
  const policyTokens = policy.split(/\s+/).filter(Boolean);
  const plotlyTokens = policyTokens.filter(token => /plotly/i.test(token));
  const jsdelivrTokens = policyTokens.filter(token => /jsdelivr/i.test(token));
  check('extension : la politique de sécurité du contenu d\'index.html nomme Plotly 2.13.2 par l\'adresse exacte du catalogue de GFS (mode CDN), une fois, et par aucun autre moyen : jsDelivr n\'y est jamais ouvert en entier (ni hôte seul, ni caractère générique) et blob: n\'y est pas',
    policy.length > 100 && plotlyTokens.length === 1 && plotlyTokens[0] === PLOTLY_ADDRESS && jsdelivrTokens.length > 0 && jsdelivrTokens.every(token => !token.includes('*') && /^https:\/\/cdn\.jsdelivr\.net\/npm\/[^\s]+\.js$/.test(token)) && !/\bblob:/.test(policy),
    JSON.stringify({ plotly: plotlyTokens, jsdelivr: jsdelivrTokens, blob: /\bblob:/.test(policy) }));

  const named = [], versions = [];
  for (const rel of [...jsFiles, 'index.html']) {
    const code = rel === 'index.html' ? pageWithoutPolicy : noCommentsJs(read(rel));
    if (/(?:https?:)?\/\/[^\s'"`]*plotly|plotly[^\n]*(?:https?:)?\/\/[^\s'"`]+\.js\b/i.test(code)) named.push(rel);
    if (/\b2\.13\.2\b/.test(code)) versions.push(rel);
  }
  check('extension : ni l\'adresse de Plotly ni une empreinte (sha384-…) ne sont écrites dans le code du widget ou de ses extensions, ni ailleurs dans la page que dans sa politique (la source vient de GFS)',
    named.length === 0 && !jsFiles.filter(rel => rel.startsWith('extensions/')).some(rel => /sha(256|384|512)-[A-Za-z0-9+/=]{20,}/.test(read(rel))), named.join(', '));
  check('extension : la version exacte de Plotly (2.13.2) s\'écrit une fois dans le code, avec son identifiant, dans extensions/graphique/chart-plot.js (la politique d\'index.html la porte aussi, dans l\'adresse)',
    versions.length === 1 && versions[0] === 'extensions/graphique/chart-plot.js' && /const LIBRARY = \{ id: 'plotly', version: '2\.13\.2' \};/.test(read('extensions/graphique/chart-plot.js')), versions.join(', '));
  const plot = noCommentsJs(read('extensions/graphique/chart-plot.js'));
  check('extension : chart-plot.js prend la source de Plotly chez GFS (Extensions.library) et la charge par ExportCommon.loadScriptOnce, avec son empreinte, sans chargeur à lui',
    /Extensions\.library\(LIBRARY\.id\)/.test(plot) && /ExportCommon\.loadScriptOnce\(\s*\{\s*src: source\.src,\s*integrity: source\.integrite\s*\}\s*\)/.test(plot) && !/createElement\(\s*['"]script['"]\s*\)/.test(plot), 'extensions/graphique/chart-plot.js');

  // Le registre : les fichiers que js/extensions.js nomme sont ceux du dossier de l'extension, ni plus ni moins.
  const literal = (read('js/extensions.js').match(/const REGISTRY = (\{[\s\S]*?\n  \});/) || [])[1];
  let registry = null;
  try { registry = literal ? vm.runInNewContext('(' + literal + ')') : null; } catch (e) { registry = null; }
  check('extension : le registre de js/extensions.js se lit (garde-fou de l\'analyse elle-même) : « graphique » y a une version de cache, des scripts et une feuille de style',
    !!registry && !!registry.graphique && /^\d+(\.\d+)*$/.test(registry.graphique.version) && registry.graphique.scripts.length === 3 && registry.graphique.styles.length === 1, literal ? literal.slice(0, 80) : 'REGISTRY introuvable');
  if (registry) {
    const problems = [];
    const dirs = existsSync(join(ROOT, 'extensions')) ? readdirSync(join(ROOT, 'extensions')) : [];
    for (const name of dirs) if (!statSync(join(ROOT, 'extensions', name)).isDirectory() || !(name in registry)) problems.push(`extensions/${name} n'est pas une extension du registre`);
    for (const id of Object.keys(registry)) {
      const named = [...registry[id].scripts, ...registry[id].styles];
      const onDisk = listFiles(`extensions/${id}`, /./).map(rel => rel.slice(`extensions/${id}/`.length));
      for (const file of named) if (!onDisk.includes(file)) problems.push(`${id} : ${file} est nommé et absent du dossier`);
      for (const file of onDisk) if (!named.includes(file)) problems.push(`${id} : ${file} est dans le dossier et n'est pas nommé par le registre`);
      for (const file of registry[id].scripts) if (!/\.js$/.test(file)) problems.push(`${id} : ${file} n'est pas un script`);
    }
    check('extension : chaque dossier d\'extensions/ est une extension du registre, et le registre nomme exactement ses fichiers (rien d\'oublié, rien d\'absent)', problems.length === 0, problems.join(' ; '));
  }
  check('extension : index.html ne demande aucun fichier d\'extensions/ (ni <script>, ni <link>) ni les anciens js/chart-block.js, js/chart-plot.js, js/chart-source.js, css/chart-block.css : le registre les charge au premier usage',
    !/\bextensions\//.test(page) && !/(?:js\/chart-(?:block|plot|source)\.js|css\/chart-block\.css)/.test(page), (page.match(/(?:extensions\/|js\/chart-(?:block|plot|source)\.js|css\/chart-block\.css)/g) || []).join(', '));
  const order = ['js/gfs-link.js', 'js/extensions.js', 'js/chart-entry.js'].map(file => ({ file, at: page.indexOf(`<script src="${file}?v=`), count: page.split(`<script src="${file}?v=`).length - 1 }));
  check('extension : index.html charge js/gfs-link.js, js/extensions.js puis js/chart-entry.js, chacun une fois et dans cet ordre (le point d\'entrée s\'abonne au registre en se chargeant), et css/chart-frame.css (le cadre du socle) une fois',
    order.every(o => o.count === 1) && order[0].at < order[1].at && order[1].at < order[2].at && page.split('<link rel="stylesheet" href="css/chart-frame.css?v=').length - 1 === 1, JSON.stringify(order));

  // Le point d'entrée : hors du dossier de l'extension, seul js/chart-entry.js nomme le code du graphique.
  const reaching = jsFiles.filter(rel => !rel.startsWith('extensions/') && rel !== 'js/chart-entry.js' && /\b(?:ChartBlock|ChartPlot|ChartSource)\b/.test(noCommentsJs(read(rel))));
  check('extension : hors d\'extensions/graphique/, seul js/chart-entry.js nomme ChartBlock (ni ChartPlot ni ChartSource) : le reste du widget passe par ChartEntry, qui répond aussi quand l\'extension est absente', reaching.length === 0, reaching.join(', '));

  // Le lien avec GFS : seul js/gfs-link.js écrit au cadre parent ou écoute ses messages, par addEventListener (jamais `window.onmessage =`, qui remplacerait l'écouteur de l'API de Grist), en vérifiant d'où vient le message.
  const talking = jsFiles.filter(rel => rel !== 'js/gfs-link.js' && /\b(?:parent|window|top)\.postMessage\(|addEventListener\(\s*['"]message['"]|\bonmessage\s*=/.test(noCommentsJs(read(rel))));
  const link = noCommentsJs(read('js/gfs-link.js'));
  check('extension : seul js/gfs-link.js écrit au cadre parent ou écoute les messages, par addEventListener, en ne lisant que ceux du cadre parent (event.source) ; jamais window.onmessage =',
    talking.length === 0 && /window\.parent\.postMessage\(/.test(link) && /addEventListener\(\s*'message'/.test(link) && /event\.source !== window\.parent/.test(link) && !/\bonmessage\s*=/.test(link), talking.join(', '));

  // L'envoi public : le dossier part avec le reste.
  const publier = read('outils/depot-propre/publier.sh');
  const publiees = ((publier.match(/^PUBLIES=\(([^)]*)\)/m) || [])[1] || '').split(/\s+/).filter(Boolean);
  check('extension : extensions/ est dans PUBLIES de outils/depot-propre/publier.sh et connu de controles.mjs (le dossier part sur le dépôt public avec le reste)',
    publiees.includes('extensions') && /const KNOWN = new Set\(\[[^\]]*'extensions'/.test(read('outils/depot-propre/controles.mjs')), publiees.join(' '));
}

// ============================================================================
// 26. L'envoi sur le dépôt public ne sera pas refusé : controles.mjs ne trouve aucune erreur sur l'arbre qu'on y publierait (« Oui » d'Antoine, 16/10)
// ============================================================================
// outils/depot-propre/controles.mjs refuse l'envoi à la moindre ERREUR (une clé « pp_ » que le README ne nomme pas, un fichier cité par la carte du code qui n'existe plus, un lien cassé, la politique de sécurité du
// contenu, le prénom, un gabarit {{…}} resté en place) mais il ne tourne que le jour de l'envoi : les marques « pp_versions_added » et « pp_versions_removed » de « Comparer » (14/10) y sont restées deux erreurs que
// personne ne voyait, et l'envoi suivant aurait été refusé. Ce contrôle assemble l'arbre comme publier.sh (ce que PUBLIES nomme, pris dans le dossier de travail, et les documents de outils/depot-propre/public/ aux
// gabarits remplis) dans un dossier temporaire, y lance controles.mjs et refuse toute erreur ; les avertissements, qui se relisent, restent ceux de l'envoi. Garde-fou de l'analyse : une clé « pp_ » inconnue de
// STORED, posée dans une copie de l'arbre, doit faire échouer controles.mjs, qui la nomme - c'est ce qui échouait avec pp_versions_added.
{
  const publiees = ((read('outils/depot-propre/publier.sh').match(/^PUBLIES=\(([^)]*)\)/m) || [])[1] || '').split(/\s+/).filter(Boolean);
  const version = (read('js/version.js').match(/PP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '';
  const arbre = mkdtempSync(join(tmpdir(), 'arbre-publier-'));
  try {
    for (const entree of publiees) cpSync(join(ROOT, entree), join(arbre, entree), { recursive: true });
    const documents = join(ROOT, 'outils/depot-propre/public');
    for (const doc of readdirSync(documents, { withFileTypes: true })) {
      if (doc.isDirectory()) { if (doc.name === 'screenshots') cpSync(join(documents, doc.name), join(arbre, doc.name), { recursive: true }); continue; }
      writeFileSync(join(arbre, doc.name), readFileSync(join(documents, doc.name), 'utf8')
        .replace(/\{\{VERSION\}\}/g, version).replace(/\{\{DATE_FR\}\}/g, '14 octobre 2026').replace(/\{\{DATE_EN\}\}/g, 'October 14, 2026').replace(/\{\{DATE\}\}/g, '2026-10-14'));
    }
    const lancer = () => {
      const run = spawnSync(process.execPath, [join(ROOT, 'outils/depot-propre/controles.mjs'), arbre, '--version', version], { encoding: 'utf8', timeout: 120000 });
      const out = (run.stdout || '') + (run.stderr || '');
      return { status: run.status, error: run.error ? String(run.error.message || run.error) : '', errors: out.split('\n').filter(line => line.startsWith('ERREUR')).map(line => line.replace(/\s+/g, ' ').trim()), read: Number((/(\d+) fichiers lus/.exec(out) || [])[1] || 0) };
    };
    const clean = lancer();
    check('envoi public : l\'analyse lit bien l\'arbre à publier (garde-fou de l\'analyse elle-même : PUBLIES se lit dans publier.sh, une version dans js/version.js, et controles.mjs lit au moins 300 fichiers)',
      publiees.length >= 7 && /^\d+\.\d+\.\d+/.test(version) && clean.read >= 300, JSON.stringify({ publiees: publiees.length, version, lus: clean.read, erreur: clean.error }));
    check('envoi public : controles.mjs (outils/depot-propre) ne trouve aucune erreur sur l\'arbre qu\'on publierait - une clé « pp_ » que le README ne nomme pas, un fichier cité qui n\'existe plus, un lien cassé : l\'envoi suivant ne sera pas refusé',
      clean.status === 0 && clean.errors.length === 0, clean.errors.slice(0, 3).map(line => line.slice(0, 240)).join(' | ') || `sortie ${clean.status} ${clean.error}`);
    appendFileSync(join(arbre, 'js/main.js'), "\nconst cleDeLEssai = 'pp_cle_inconnue_de_l_essai';\n");
    const unknown = lancer();
    check('envoi public : une clé « pp_ » inconnue de STORED, posée dans une copie de l\'arbre, fait échouer controles.mjs, qui la nomme (garde-fou de l\'analyse elle-même : c\'est ce qui échouait avec pp_versions_added)',
      unknown.status === 1 && unknown.errors.some(line => line.includes('pp_cle_inconnue_de_l_essai')), JSON.stringify({ sortie: unknown.status, erreurs: unknown.errors.length }));
  } finally {
    rmSync(arbre, { recursive: true, force: true });
  }
}

// ============================================================================
// 27. Le catalogue de la galerie n'est pas un « manifest.json » (audit externe du 21/10, points F-GUIDE-03 et F-GUIDE-04)
// ============================================================================
// L'audit externe (gwaudit, dépôt Grist-widget-audit) lit tout fichier nommé manifest.json comme le manifeste d'un widget Grist (name, url, widgetId, accessLevel). Les deux listes de modèles de la galerie
// (templates-gallery/, templates-gallery-dev/) lui valaient cinquante constats, vingt-cinq « entrée de manifeste incomplète » et vingt-cinq « niveau d'accès non déclaré », pour des fichiers qui n'ont rien d'un
// manifeste de widget. Elles s'appellent catalogue.json ; ce contrôle garde qu'aucun fichier du dépôt ne reprend le nom manifest.json (le miroir hors ligne et node_modules exceptés), que les deux catalogues sont
// là et lisibles, et qu'aucun script, outil ou test ne lit un fichier de ce nom (le nom est écrit en deux morceaux ici pour que ce fichier ne se compte pas lui-même).
{
  const oldName = 'manifest' + '.json';
  const named = [];
  const walkAll = dir => {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const rel = dir ? `${dir}/${name}` : name;
      if (statSync(join(ROOT, rel)).isDirectory()) walkAll(rel);
      else if (name === oldName) named.push(rel);
    }
  };
  walkAll('');
  const catalogues = ['templates-gallery/catalogue.json', 'templates-gallery-dev/catalogue.json'].map(rel => {
    let list = null;
    try { list = JSON.parse(read(rel)); } catch (e) { list = null; }
    return { rel, count: Array.isArray(list) ? list.length : -1 };
  });
  check('catalogue : les deux listes de modèles de la galerie sont là et lisibles (templates-gallery/catalogue.json, templates-gallery-dev/catalogue.json : au moins vingt modèles et quatre modèles de test)',
    catalogues[0].count >= 20 && catalogues[1].count >= 4, JSON.stringify(catalogues));
  check('catalogue : aucun fichier du dépôt ne s\'appelle manifest.json - gwaudit le lirait comme le manifeste d\'un widget Grist (url, widgetId, accessLevel) et compterait deux constats par modèle', named.length === 0, named.join(', '));
  const readers = ['index.html', ...jsFiles, ...listFiles('dev-tests', /\.(?:js|mjs|sh)$/), ...listFiles('outils', /\.(?:js|mjs|sh)$/)]
    .filter(rel => rel !== 'dev-tests/verify-code-hygiene.mjs' && read(rel).includes(oldName));
  check('catalogue : aucun script, outil ni test ne lit un fichier manifest.json (le chargeur de la galerie, js/template-gallery.js, lit catalogue.json)', readers.length === 0, readers.join(', '));
  check('catalogue : le chargeur de la galerie lit catalogue.json dans chacun de ses deux dossiers (garde-fou de l\'analyse elle-même)', /fetchNoStore\(base \+ 'catalogue\.json'\)/.test(read('js/template-gallery.js')));
}

// ============================================================================
// 28. Le balisage calculé entre dans la page par un seul endroit (audit externe du 21/10, point C-XSS-01)
// ============================================================================
// L'audit du 21/10 comptait quarante et une écritures de `innerHTML` à valeur calculée, dans vingt-quatre fichiers : des icônes de js/icons.js, des libellés de js/i18n.js, du HTML nettoyé à la source ou lu
// dans un <template> inerte - toutes fermées dans le fond, mais aucune lisible comme telle sans relire son contexte. Elles passent par `Dom.setMarkup` (écrire dans un élément) et `Dom.inertTemplate` (lire
// sans rien poser) de js/dom.js : un seul endroit à relire. Ce contrôle garde qu'aucune autre écriture de balisage calculé ne revient dans js/ ni extensions/ : `innerHTML` ou `outerHTML` qui reçoit autre chose
// qu'un littéral (vider un élément : `''`), `insertAdjacentHTML`, `createContextualFragment`, `document.write`. `PENDING` : les fichiers pas encore passés par Dom (lots suivants), vide à la fin ; un fichier
// qui n'y a plus rien à convertir doit en sortir.
{
  const PENDING = new Set([
    'js/header-footer-preview.js', 'js/print-export.js', 'js/reader-mode.js', 'js/template-gallery-modal.js',
    // Hors de ce que l'audit lit (moteurs d'export chargés à la demande, historique des versions, bandeau des diapositives) : à passer par Dom dans un lot à part, avec leurs groupes d'export.
    'js/docx-export.js', 'js/pdf-export.js', 'js/xlsx-export.js', 'js/versions-history.js', 'extensions/diapositives/slide-strip.js',
  ]);
  const LITERAL_AFTER_EQUALS = /^\s*(?:(['"])(?:(?!\1)[^\\\n])*\1|`[^`$\\]*`)\s*(?:;|\n|\)|,|\}|$)/;
  const sinksIn = code => {
    const found = [];
    for (const m of code.matchAll(/\.(?:innerHTML|outerHTML)\s*(\+?)=(?!=)/g)) {
      if (m[1] || !LITERAL_AFTER_EQUALS.test(code.slice(m.index + m[0].length))) found.push(code.slice(0, m.index).split('\n').length);
    }
    for (const m of code.matchAll(/\b(?:insertAdjacentHTML|createContextualFragment)\s*\(|\bdocument\.write(?:ln)?\s*\(/g)) found.push(code.slice(0, m.index).split('\n').length);
    return found;
  };
  const offenders = [];
  const stale = [];
  const sinks = new Map();
  for (const rel of jsFiles) {
    const lines = sinksIn(noCommentsJs(read(rel)));
    sinks.set(rel, lines);
    if (rel === 'js/dom.js') continue;
    if (lines.length && !PENDING.has(rel)) offenders.push(`${rel}:${lines.join(',')}`);
    if (!lines.length && PENDING.has(rel)) stale.push(rel);
  }
  const probe = source => sinksIn(source).length;
  check('balisage : l\'analyse lit bien le code (garde-fou de l\'analyse elle-même : une écriture calculée est vue, un littéral ne l\'est pas, et js/dom.js porte la seule lecture de balisage du widget)',
    probe("a.innerHTML = Icons.svg('x');") === 1 && probe("a.innerHTML = '<b>' + x + '</b>';") === 1 && probe('a.innerHTML = `<b>${x}</b>`;') === 1 && probe('a.innerHTML += x;') === 1
      && probe("a.innerHTML = '';") === 0 && probe('a.innerHTML = "<hr>";') === 0 && probe("a.insertAdjacentHTML('beforeend', x);") === 1 && probe('f = r.createContextualFragment(x);') === 1
      && (sinks.get('js/dom.js') || []).length === 1 && jsFiles.length >= 100,
    `dom.js : ${(sinks.get('js/dom.js') || []).length} lecture(s), ${jsFiles.length} fichiers`);
  check('balisage : aucune écriture de HTML calculé (innerHTML, outerHTML, insertAdjacentHTML, createContextualFragment, document.write) dans js/ ni extensions/ hors js/dom.js - écrire par Dom.setMarkup(élément, balisage) ou lire par Dom.inertTemplate(balisage)',
    offenders.length === 0, offenders.join(', '));
  check('balisage : un fichier sorti de la liste des lots restants (PENDING) n\'y reste pas', stale.length === 0, stale.join(', '));
}

summarizeAndExit();
