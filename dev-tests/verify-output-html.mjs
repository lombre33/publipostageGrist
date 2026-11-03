#!/usr/bin/env node
// Le HTML d'une présentation à la sortie (js/slides-entry.js:outputHtml : la Lecture, le diaporama, l'impression et chaque export) : lu UNE fois pour toutes ses étapes, et le même texte qu'avant, au caractère près.
//  Avant (demande du 03/11, « bascule en mode lecture qui prend de longues secondes »), chaque étape (le fond et le décor des diapositives, les repères, les objets masqués, le thème, les sauts de diapositive) prenait
//  un texte et en rendait un : cinq lectures du HTML et quatre écritures, de 0,12 à 0,16 s pour « Présentation commerciale » à chaque entrée en Lecture dont le document avait changé. Les étapes se suivent maintenant sur le
//  même arbre (SlideProps.forOutputTree, FreeFrame.withoutHiddenIn, SlideTheme.forOutputIn, markSlideBreaks) ; les fonctions à texte (forOutput, withoutHidden, forOutput du thème) restent, pour qui n'en veut qu'une.
//  LE MÊME TEXTE : la présentation de la galerie, huit variantes d'elle (sans objet masqué, un cadre sur trois masqué, sans repères, des signets avec et sans fond, sans saut de page, un saut de page de plus,
//   un espace en tête, des balises que le nettoyage retire), les vingt-cinq autres modèles de la galerie, lus comme des présentations, et huit petits textes aux cas limites (rien à poser, le nom de la classe des repères dans un
//   texte, un saut de page seul ou en fin de texte, un objet masqué seul), chacun avec quatre thèmes (aucun, blanc sans décor, fond sombre, blanc avec décor),
//   avec et sans signets, avec et sans `keepProps`, avec la page dite ou celle du modèle ouvert : le texte d'`outputHtml` est celui de l'enchaînement des anciennes étapes à texte, rejoué ici, caractère pour caractère.
//   OUTPUT_HTML_DUMP=/chemin/empreintes.json écrit l'empreinte de chaque sortie : lancé sur un autre commit (l'ancien code, par exemple), `diff` des deux fichiers dit si les sorties ont bougé.
//  UNE SEULE LECTURE : pendant un `outputHtml` de la présentation (thème avec décor), le HTML entier n'est lu qu'une fois (HtmlSanitize.parseInert et Dom.inertTemplate, sur plus de 20 000 caractères) ; l'ancien
//   enchaînement le lisait quatre fois.
// Lancé par run-headless.mjs (groupe Node "outputHtml", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-output-html.mjs
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, seedModels } from './gfs-page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const t = await start({ name: 'verify-output-html', port: Number(process.env.OUTPUT_HTML_PORT || 8986) });
const { check } = t;

// Les HTML de la galerie : la présentation (l'unique) et les modèles de document (lus comme du HTML de présentation : outputHtml ne regarde pas ce que dit le HTML).
const read = path => readFileSync(join(ROOT, path), 'utf8');
const DECK = read('templates-gallery/proposition-commerciale/template.html');
const SMALL = [];
['templates-gallery', 'templates-gallery-dev'].forEach((dir) => {
  readdirSync(join(ROOT, dir), { withFileTypes: true }).filter(entry => entry.isDirectory()).forEach((entry) => {
    const file = join(dir, entry.name, 'template.html');
    if (entry.name !== 'proposition-commerciale' && existsSync(join(ROOT, file))) SMALL.push({ name: entry.name, html: read(file) });
  });
});

const tab = await t.openPage({ hosted: true, stub: { extensions: ['diapositives'] }, seed: seedModels({}), lang: 'fr', colorScheme: 'light' });
const { page } = tab;
await page.waitForFunction(() => typeof SlidesEntry !== 'undefined' && typeof SlideProps !== 'undefined' && typeof SlideTheme !== 'undefined' && typeof FreeFrame !== 'undefined', null, { timeout: 30000 });

// L'enchaînement d'avant, étape par étape sur des textes (les fonctions à texte n'ont pas changé de sens), et les variantes de la présentation.
await page.evaluate(() => {
  window.__sequential = (html, { keepProps = false, anchors = false, theme = null, page = null } = {}) => {
    html = SlideLinks.forOutput(html);
    if (!keepProps) html = SlideProps.forOutput(html, { anchors, background: SlideTheme.paperOf(theme), decor: SlideTheme.decorHtmlFor(theme, page) });
    if (!keepProps) html = FreeFrame.withoutHidden(html);
    if (theme) html = SlideTheme.forOutput(html, theme);
    const host = Dom.inertTemplate(html);
    const blocks = Array.from(host.content.children);
    const breaks = blocks.filter(block => block.classList.contains('page-break-marker'));
    if (!breaks.length) return html;
    breaks.forEach(block => block.setAttribute(SlidesEntry.SLIDE_BREAK_ATTR, ''));
    const written = blocks.filter(block => !block.hasAttribute('data-ff-bg') && !block.hasAttribute('data-ff-decor'));
    if (written[written.length - 1].classList.contains('page-break-marker')) host.content.appendChild(document.createElement('p'));
    return host.innerHTML;
  };
  window.__variants = (deck) => {
    const parse = text => new DOMParser().parseFromString(text, 'text/html').body;
    const out = { deck };
    let body = parse(deck); body.querySelectorAll('[data-ff-hidden]').forEach((el) => { el.removeAttribute('data-ff-hidden'); }); out.sansMasques = body.innerHTML;
    body = parse(deck); Array.from(body.querySelectorAll('.pp-free-frame')).forEach((el, i) => { if (i % 3 === 0) el.setAttribute('data-ff-hidden', 'true'); }); out.unSurTroisMasque = body.innerHTML;
    body = parse(deck); body.querySelectorAll('.pp-slide-props').forEach((el) => { el.remove(); }); out.sansRepères = body.innerHTML;
    body = parse(deck); body.querySelectorAll('.pp-slide-props').forEach((el, i) => { if (i % 2) el.removeAttribute('data-bg'); else { el.setAttribute('data-anchor', 'partie-' + i); el.setAttribute('data-anchor-name', 'Partie ' + i); } }); out.signets = body.innerHTML;
    body = parse(deck); body.querySelectorAll('.page-break-marker').forEach((el) => { el.remove(); }); out.sansSauts = body.innerHTML;
    out.sautEnPlus = deck + '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    out.espaceEnTete = '\n  ' + deck;
    out.balisesRetirees = deck.replace('</p>', '</p><script>alert(1)</script><x-y>texte</x-y><!-- note --><p onclick="x()" style="color:red">a<a href="javascript:alert(1)">lien</a><a href="https://exemple.fr/">ok</a><img src="javascript:x"></p><iframe src="https://exemple.fr/"></iframe><style>p{color:red}</style>');
    return out;
  };
});

// Quatre thèmes : aucun, blanc sans décor (rien à peindre sous les diapositives), fond sombre, blanc avec décor (bande, numéro, pied de page).
const WHITE = { v: 1, name: 'Blanc', colors: { bg: '#ffffff', text: '#222222', title: '#000000' }, fonts: { title: 'Roboto', body: 'Roboto' } };
const THEMES = {
  aucun: null,
  blanc: WHITE,
  sombre: { v: 1, name: 'Sombre', colors: { bg: '#10222f', text: '#e8eef2', title: '#ffffff', accent1: '#f2b45a' }, fonts: { title: 'Roboto', body: 'Roboto' } },
  decor: Object.assign({}, WHITE, { name: 'Décor', decor: { band: { edge: 'left', size: 'medium', color: 'accent1' }, number: { pos: 'br' }, footer: { text: 'Pied de page', pos: 'bl' }, skipFirst: true } }),
};
const PAGES = { modele: null, dite: { width: 720, height: 405 } };

// 1. Le même texte
// OUTPUT_HTML_DUMP=/chemin/empreintes.json : écrit l'empreinte et la longueur de chaque sortie, pour les comparer à celles d'un autre commit (le même fichier lancé sur l'ancien code) : `diff` des deux fichiers.
const dump = {};
async function compare(label, html, combos) {
  const result = await page.evaluate(({ html, combos, themes, pages }) => {
    const different = [];
    const prints = {};
    // Deux empreintes de 32 bits (FNV-1a et une autre graine) : assez pour comparer deux sorties, sans rien transférer d'elles.
    const fingerprint = (text) => {
      let a = 0x811c9dc5, b = 0x9747b28c;
      for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 0x01000193) + i >>> 0; }
      return a.toString(16) + b.toString(16) + ':' + text.length;
    };
    let count = 0;
    combos.forEach(([themeName, pageName, keepProps, anchors]) => {
      const options = { keepProps, anchors, theme: themes[themeName], page: pages[pageName] };
      let expected, got;
      try { expected = window.__sequential(html, options); } catch (e) { expected = 'ERREUR ' + e.message; }
      try { got = SlidesEntry.outputHtml('presentation', html, options); } catch (e) { got = 'ERREUR ' + e.message; }
      count += 1;
      prints[[themeName, pageName, keepProps ? 'garde' : 'sort', anchors ? 'signets' : 'sans'].join('/')] = fingerprint(got);
      if (got !== expected) {
        let at = 0;
        while (at < expected.length && expected[at] === got[at]) at += 1;
        different.push({ themeName, pageName, keepProps, anchors, lengths: [expected.length, got.length], at, expected: expected.slice(Math.max(0, at - 60), at + 80), got: got.slice(Math.max(0, at - 60), at + 80) });
      }
    });
    return { count, different, prints };
  }, { html, combos, themes: THEMES, pages: PAGES });
  dump[label] = result.prints;
  check(`${label} : le même texte qu'avant dans ${result.count} cas`, result.different.length === 0, result.different.slice(0, 2));
  return result;
}
const every = (themes, pages, keeps, anchors) => themes.flatMap(themeName => pages.flatMap(pageName => keeps.flatMap(keepProps => anchors.map(a => [themeName, pageName, keepProps, a]))));
const ALL = every(Object.keys(THEMES), ['modele', 'dite'], [false, true], [false, true]);
const SOME = [['decor', 'dite', false, true], ['decor', 'modele', false, false], ['sombre', 'modele', false, true], ['sombre', 'dite', true, false], ['blanc', 'modele', false, false], ['blanc', 'modele', false, true], ['aucun', 'modele', false, false], ['aucun', 'dite', false, true]];

const variants = await page.evaluate(deck => window.__variants(deck), DECK);
for (const [name, html] of Object.entries(variants)) await compare(`présentation de la galerie (${name})`, html, name === 'deck' ? ALL : SOME);
// Ce que les cas disent vraiment : les repères sont partis, les objets masqués aussi, les fonds sont des cadres, les sauts sont des sauts de diapositive, le décor est posé.
const sample = await page.evaluate(({ deck, themes }) => {
  const out = SlidesEntry.outputHtml('presentation', deck, { anchors: true, theme: themes.decor, page: null });
  const body = new DOMParser().parseFromString(out, 'text/html').body;
  return {
    marks: body.querySelectorAll('.pp-slide-props').length, hidden: body.querySelectorAll('[data-ff-hidden]').length, backgrounds: body.querySelectorAll('[data-ff-bg]').length,
    decor: body.querySelectorAll('[data-ff-decor]').length, breaks: body.querySelectorAll('[data-slide-break]').length, anchors: body.querySelectorAll('[data-anchor]').length,
    styled: body.querySelectorAll('p[style*="font-family"]').length,
  };
}, { deck: DECK, themes: THEMES });
check('la sortie a bien fait son travail (plus de repères ni d\'objets masqués ; des fonds, un décor, des signets, des sauts de diapositive, la police du thème)',
  sample.marks === 0 && sample.hidden === 0 && sample.backgrounds > 0 && sample.decor > 0 && sample.anchors > 0 && sample.breaks > 0 && sample.styled > 0, sample);
for (const { name, html } of SMALL) await compare(`modèle « ${name} »`, html, every(['aucun', 'blanc', 'sombre', 'decor'], ['modele', 'dite'], [false, true], [false, true]).filter((_, i) => i % 3 === 0));
// Les petits textes, qui prennent les chemins de repli : rien à poser (ni repère, ni thème, ni objet masqué), le nom de la classe des repères dans un texte sans en être un, un saut de page seul ou qui termine le texte, un objet masqué seul.
const TINY = {
  vide: '',
  sansRien: '<p>Bonjour</p>',
  classeEnTexte: '<p>pp-slide-props et <x-y>des balises</x-y> en trop</p>',
  sautSeul: '<p>a</p><div class="page-break-marker" contenteditable="false"></div>',
  sautEtSuite: '<p>a</p><div class="page-break-marker" contenteditable="false"></div><p>b</p>',
  masqueSeul: '<div class="pp-free-frame" data-ff-hidden="true"><p>x</p></div><p>a</p>',
  repereSeul: '<div class="pp-slide-props" data-bg="#ffeecc" data-anchor="a" data-anchor-name="A"></div><p>a</p>',
  repereEtSaut: '<div class="pp-slide-props" data-trans="zoom"></div><p>a</p><div class="page-break-marker"></div><div class="pp-slide-props" data-bg="#102030"></div><p>b</p><div class="page-break-marker"></div>',
};
for (const [name, html] of Object.entries(TINY)) await compare(`petit texte (${name})`, html, ALL);

// 2. Une seule lecture du HTML entier
const reads = await page.evaluate(({ deck, themes }) => {
  const html = deck + '<p>variante ' + Math.random() + '</p>';   // un HTML que le cache d'outputHtml n'a jamais vu
  const big = [];
  const parseInert = HtmlSanitize.parseInert;
  HtmlSanitize.parseInert = function (text) { if (String(text).length > 20000) big.push('parseInert'); return parseInert.apply(this, arguments); };
  const inertTemplate = Dom.inertTemplate;
  Dom.inertTemplate = function (text) { if (String(text).length > 20000) big.push('inertTemplate'); return inertTemplate.apply(this, arguments); };
  try { SlidesEntry.outputHtml('presentation', html, { anchors: true, theme: themes.decor, page: null }); } finally { HtmlSanitize.parseInert = parseInert; Dom.inertTemplate = inertTemplate; }
  return big;
}, { deck: DECK, themes: THEMES });
check(`le HTML entier de la présentation n'est lu qu'une fois par outputHtml (${reads.length} lecture(s) : ${reads.join(', ')})`, reads.length === 1, reads);

if (process.env.OUTPUT_HTML_DUMP) writeFileSync(process.env.OUTPUT_HTML_DUMP, JSON.stringify(dump, null, 1));
await t.finish();
