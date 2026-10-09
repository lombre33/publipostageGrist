// Exposant et indice (m³, H₂O, 1ᵉʳ) : deux marques de caractère, comme le gras ou le souligné. Elles se posent sur le texte choisi (ou sur ce qu'on tape à
// la suite) par les deux icônes « Exposant » et « Indice » du menu « Lien et blocs de contenu » (#v2-btn-superscript, #v2-btn-subscript, js/main-toolbar.js)
// ou au clavier : Ctrl+. et Ctrl+, (⌘ sous macOS), réglables dans Réglages > Raccourcis (js/shortcuts.js). Un caractère n'est jamais les deux à la fois :
// poser l'un retire l'autre. Un texte collé de Word ou de Google Docs garde les siens.
//
// Le HTML du modèle porte <sup> et <sub>, rien de plus : la Lecture les affiche telles quelles, et le PDF, le Word et l'Excel les lisent comme ils
// lisent <strong> ou <u> (`kindOf`). Le rendu est le même partout, à la taille et au décalage près que chaque moteur sait écrire :
//  - éditeur, Lecture, en-têtes et pieds de page, mesures du PDF : css/script-marks.css (6/10 de la taille du texte, décalage proportionnel à celle-ci) ;
//  - PDF : js/pdf-export.js met la taille ci-dessous (`SIZE_RATIO`) et le drapeau `sup` ou `sub` de pdfmake, qui lève de 0,75 fois la taille du run et
//    baisse de 0,35 fois : les décalages du CSS ;
//  - Word et Excel : le vrai exposant ou le vrai indice de leur format (`w:vertAlign`, `vertAlign`), dont ils règlent eux-mêmes la taille et le
//    décalage ; la personne qui ouvre le fichier les retrouve comme marques de mise en forme, qu'elle peut retirer ;
//  - email : le corps d'un lien mailto: est du texte brut (js/mailto-export.js), l'exposant et l'indice y deviennent les caractères Unicode qui en
//    tiennent lieu (`toUnicode` : « m³ », « H₂O », « 1ᵉʳ »).
// La note de bas de page est elle aussi un <sup> (js/editor-nodes.js:createFootnoteRefNode) mais n'est pas un exposant de texte : elle garde son rendu
// et son numéro à elle, ici comme dans chaque export (`.footnote-ref-marker`).
const ScriptMarks = (function () {
  const SUPERSCRIPT = 'superscript';
  const SUBSCRIPT = 'subscript';

  // La taille d'un exposant ou d'un indice, en part de celle du texte qui le porte. Une valeur pour les deux ; css/script-marks.css la reprend (un cas de
  // dev-tests/scenarios-script-marks.js compare les deux).
  const SIZE_RATIO = 0.6;

  // Ce qui change d'une marque à l'autre : la balise, la valeur de `vertical-align` que lisent Word et Google Docs, la touche, les commandes de TipTap.
  const KINDS = {
    [SUPERSCRIPT]: { tag: 'sup', vertical: /^super\b/i, key: 'Mod-.', commands: ['setSuperscript', 'toggleSuperscript', 'unsetSuperscript'] },
    [SUBSCRIPT]: { tag: 'sub', vertical: /^sub\b/i, key: 'Mod-,', commands: ['setSubscript', 'toggleSubscript', 'unsetSubscript'] },
  };

  // Les deux marques TipTap, à ranger avec les autres extensions du texte (js/editor.js:textExtensions). Chacune ajoute ses trois commandes :
  // `setSuperscript`, `toggleSuperscript`, `unsetSuperscript` (et celles de l'indice), `toggle` étant celle des lignes du menu et de la touche.
  function createMarks(Mark) {
    return [SUPERSCRIPT, SUBSCRIPT].map(name => {
      const { tag, vertical, key, commands } = KINDS[name];
      const [setName, toggleName, unsetName] = commands;
      return Mark.create({
        name,
        // Le défaut d'une marque est de n'exclure qu'elle-même : il faut nommer l'autre pour que poser l'une retire l'autre.
        excludes: `${SUPERSCRIPT} ${SUBSCRIPT}`,
        parseHTML() {
          return [
            // Pas la note de bas de page : c'est un <sup class="footnote-ref-marker"> que son nœud relit (js/editor-nodes.js), jamais une marque.
            { tag: `${tag}:not(.footnote-ref-marker)` },
            // Word et Google Docs écrivent plutôt <span style="vertical-align: super">.
            { style: 'vertical-align', getAttrs: value => (vertical.test(String(value).trim()) ? null : false) },
          ];
        },
        renderHTML() { return [tag, 0]; },
        addCommands() {
          return {
            [setName]: () => ({ commands }) => commands.setMark(name),
            [toggleName]: () => ({ commands }) => commands.toggleMark(name),
            [unsetName]: () => ({ commands }) => commands.unsetMark(name),
          };
        },
        // Les touches de TipTap (Ctrl+. et Ctrl+,). Sur un clavier français le point se tape avec Maj : ProseMirror retombe alors sur la touche sans
        // Maj, et js/shortcuts.js lit la même combinaison (`Mod+.`) avec ou sans Maj.
        addKeyboardShortcuts() { return { [key]: () => this.editor.commands[toggleName]() }; },
      });
    });
  }

  // Les caractères Unicode qui tiennent lieu d'exposant ou d'indice dans un texte brut : les chiffres, + - = ( ) et les lettres que l'Unicode a en exposant (toutes
  // sauf q, et C F Q S X Y Z en capitale) ou en indice (a e h i j k l m n o p r s t u v x). Pour chaque liste, `from` et `to` vont de pair, caractère à caractère ;
  // le tiret et le signe moins sont tous deux le signe moins en haut ou en bas. Un cas de dev-tests/scenarios-script-marks.js relit chaque paire (la
  // décomposition de compatibilité de l'Unicode, NFKC, ramène chaque caractère de `to` à celui de `from`).
  const PLAIN_TEXT_SCRIPTS = {
    [SUPERSCRIPT]: {
      from: '0123456789+-−=()abcdefghijklmnoprstuvwxyzABDEGHIJKLMNOPRTUVW',
      to: '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂ',
    },
    [SUBSCRIPT]: {
      from: '0123456789+-−=()aehijklmnoprstuvx',
      to: '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ',
    },
  };

  // Le texte d'un exposant ou d'un indice en caractères Unicode (« 3 » → « ³ », « er » → « ᵉʳ », en indice « 2 » → « ₂ »), ou null quand un seul de ses
  // caractères n'en a pas (« è », « q », une virgule) : un groupe écrit à moitié en exposant se lirait de travers (« ème » ne devient pas « èᵐᵉ »), il reste
  // tel qu'il a été tapé. Les espaces passent.
  function toUnicode(kind, text) {
    const table = PLAIN_TEXT_SCRIPTS[kind];
    if (!table || !text) return null;
    let out = '';
    for (const ch of text) {
      if (ch === ' ' || ch === '\u00a0') { out += ch; continue; }
      const at = table.from.indexOf(ch);
      if (at < 0) return null;
      out += table.to[at];
    }
    return out;
  }

  // L'exposant ou l'indice qu'un élément du HTML d'un modèle porte : 'superscript' (<sup>), 'subscript' (<sub>), sinon null - dont la note de bas de
  // page, qui est un <sup> mais n'en est pas un. Le seul test que le PDF, le Word et l'Excel appliquent.
  function kindOf(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.tagName === 'SUB') return SUBSCRIPT;
    if (node.tagName === 'SUP' && !node.classList.contains('footnote-ref-marker')) return SUPERSCRIPT;
    return null;
  }

  // Un texte collé de Google Docs écrit son exposant `<span style="font-size: 0.6em; vertical-align: super">` : la marque réduit déjà le texte, la taille
  // du <span> le réduirait une seconde fois (0,6 × 0,6). Elle est donc retirée de tout élément qui porte un `vertical-align` d'exposant ou d'indice ; le
  // HTML qui n'en a pas ressort tel quel, sans être relu.
  const SCRIPT_STYLE = /vertical-align\s*:\s*(?:super|sub)\b/i;
  function cleanPastedHtml(html) {
    if (typeof html !== 'string' || !SCRIPT_STYLE.test(html)) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html'); // un document inerte : rien ne se charge, rien ne s'exécute
    doc.body.querySelectorAll('[style]').forEach(el => {
      if (SCRIPT_STYLE.test(el.getAttribute('style'))) el.style.removeProperty('font-size');
    });
    return doc.body.innerHTML;
  }

  return { SUPERSCRIPT, SUBSCRIPT, SIZE_RATIO, PLAIN_TEXT_SCRIPTS, createMarks, kindOf, toUnicode, cleanPastedHtml };
})();
