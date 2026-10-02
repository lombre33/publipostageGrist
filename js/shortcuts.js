// Raccourcis clavier personnalisables (demande d'Antoine du 2026-10-01 : « pouvoir définir des raccourcis personnalisés (navigations, etc.) » ; sa réponse à la carte : « Tout, par
// personne »). Chaque action du widget a une touche d'origine (ou aucune) que chacun peut changer, retirer ou rétablir dans Réglages > Raccourcis (js/shortcuts-panel.js).
//
// Une action « fait ce que fait son bouton » : elle clique le bouton de la barre d'outils (ou la ligne de menu), donc passe par les mêmes gardes que la souris - droits par personne
// et mode Lecture (`pp-access-locked`, js/main.js:wireAccessLockGuard), grille (js/grid-editor.js). Le grisé `v2-hf-locked` (e-mail, en-tête, macro-modèle), lui, n'est que du CSS
// (`pointer-events: none`) qu'un clic par programme ne voit pas : `usable()` le relit avant chaque clic. Aucun raccourci ne peut faire ce qu'un clic de souris ne peut pas.
//
// Les touches qui existent déjà (Ctrl+B, Ctrl+K, Ctrl+S, Ctrl+Z...) restent traitées par l'éditeur ou js/main.js tant qu'on n'y touche pas : ce module n'intervient qu'une fois la
// touche d'une action changée ou retirée. Il pose alors son écouteur en capture sur le document, avant tous les autres (ce script est chargé juste après js/i18n.js), et arrête
// l'ancienne touche pour qu'elle ne fasse plus rien - sans cela « Ctrl+B » gras continuerait de répondre après avoir donné « Alt+B » au gras.
//
// Une combinaison s'écrit « Mod+Alt+Shift+k » (Mod = Ctrl sous Windows et Linux, ⌘ sous macOS) : la même d'une plateforme à l'autre. Les choix sont par navigateur (localStorage),
// comme la langue et le thème. Les touches ne marchent que quand le focus est dans le widget (le navigateur ne livre rien d'autre à un iframe).
const Shortcuts = (function () {
  const STORAGE = 'pp_shortcuts';

  // === Combinaisons ==========================================================================================================================================

  const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock'];
  const NAMED_KEYS = { Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Insert: 'Insert', ' ': 'Space' };
  const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift'];

  let platformOverride = null; // 'mac' | 'other' | null : les tests forcent la plateforme
  function isMac() {
    if (platformOverride) return platformOverride === 'mac';
    return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  }
  function lang() { return (typeof I18n !== 'undefined' && I18n.getLang()) || 'fr'; }

  // La touche seule, sans modificateurs : une lettre en minuscule, un chiffre (lu sur le code physique - sur un clavier AZERTY il faut Maj pour taper « 1 », et c'est quand même la
  // touche « 1 »), « F1 » à « F12 », une touche nommée, ou un signe de ponctuation ASCII. null : touche seule de modificateur, ou touche qu'on ne sait pas nommer.
  function keyOf(event) {
    const key = event.key;
    if (MODIFIER_KEYS.indexOf(key) !== -1) return null;
    if (NAMED_KEYS[key]) return NAMED_KEYS[key];
    if (/^F([1-9]|1[0-2])$/.test(key)) return key;
    const code = event.code || '';
    let match = /^Digit(\d)$/.exec(code);
    if (match) return match[1];
    if (typeof key === 'string' && key.length === 1) {
      if (/^[a-z]$/i.test(key)) return key.toLowerCase();
      if (key.charCodeAt(0) < 128) return key === '+' ? null : key;
    }
    // macOS : Option+lettre écrit un autre caractère (« ¬ » pour Option+L) ou une touche morte (Option+E) - la lettre se lit alors sur le code physique.
    match = /^Key([A-Z])$/.exec(code);
    if (match) return match[1].toLowerCase();
    return null;
  }

  // { combo, altGr } ; combo = null quand l'événement n'est qu'un modificateur ou une touche sans nom. `altGr` : Ctrl+Alt sous Windows et Linux, c'est AltGr, qui écrit des caractères
  // (« @ », « # » sur un clavier AZERTY) : jamais un raccourci.
  function fromEvent(event) {
    const key = keyOf(event);
    if (!key) return { combo: null, altGr: false };
    const mac = isMac();
    const parts = [];
    let altGr = false;
    if (mac) {
      if (event.metaKey) parts.push('Mod');
      if (event.ctrlKey) parts.push('Ctrl');
    } else {
      if (event.metaKey) return { combo: null, altGr: false }; // la touche Windows : jamais à la page
      if (event.ctrlKey && event.altKey) altGr = true;
      if (event.ctrlKey) parts.push('Mod');
    }
    if (event.altKey) parts.push('Alt');
    // Maj fait partie de la combinaison pour une lettre, un chiffre ou une touche nommée ; pour un signe (« ? », « / »), Maj a servi à le produire.
    if (event.shiftKey && !(key.length === 1 && !/^[a-z0-9]$/.test(key))) parts.push('Shift');
    parts.push(key);
    return { combo: parts.join('+'), altGr };
  }

  function parse(combo) {
    if (typeof combo !== 'string' || !combo) return null;
    const tokens = combo.split('+');
    const key = tokens.pop();
    if (!key) return null;
    const result = { mod: false, ctrl: false, alt: false, shift: false, key };
    for (const token of tokens) {
      if (token === 'Mod') result.mod = true;
      else if (token === 'Ctrl') result.ctrl = true;
      else if (token === 'Alt') result.alt = true;
      else if (token === 'Shift') result.shift = true;
      else return null;
    }
    return result;
  }

  const KEY_LABELS = {
    fr: { Enter: 'Entrée', Tab: 'Tab', Escape: 'Échap', Backspace: 'Retour arrière', Delete: 'Suppr', Home: 'Début', End: 'Fin', PageUp: 'Page préc.', PageDown: 'Page suiv.',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Insert: 'Inser', Space: 'Espace', Shift: 'Maj', Alt: 'Alt' },
    en: { Enter: 'Enter', Tab: 'Tab', Escape: 'Esc', Backspace: 'Backspace', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Insert: 'Ins', Space: 'Space', Shift: 'Shift', Alt: 'Alt' },
  };
  const MAC_KEYS = { Enter: '↩', Tab: '⇥', Escape: '⎋', Backspace: '⌫', Delete: '⌦', Space: '␣', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

  function keyLabel(key, mac) {
    if (mac && MAC_KEYS[key]) return MAC_KEYS[key];
    const table = KEY_LABELS[lang()] || KEY_LABELS.fr;
    if (table[key]) return table[key];
    return key.length === 1 ? key.toUpperCase() : key;
  }

  // « Ctrl+Alt+Maj+K » ailleurs, « ⌃⌥⇧⌘K » sur macOS (dans l'ordre de la plateforme : Ctrl, Option, Maj, Commande). '' quand `combo` n'en est pas une (action sans touche).
  function format(combo) {
    const p = parse(combo);
    if (!p) return '';
    const mac = isMac();
    const label = keyLabel(p.key, mac);
    if (mac) return (p.ctrl ? '⌃' : '') + (p.alt ? '⌥' : '') + (p.shift ? '⇧' : '') + (p.mod ? '⌘' : '') + label;
    const table = KEY_LABELS[lang()] || KEY_LABELS.fr;
    const parts = [];
    if (p.mod) parts.push('Ctrl');
    if (p.alt) parts.push(table.Alt);
    if (p.shift) parts.push(table.Shift);
    parts.push(label);
    return parts.join('+');
  }

  // Écriture WAI-ARIA de `aria-keyshortcuts` : « Control+B », « Alt+Shift+H », « Meta+B ».
  function ariaKeys(combo) {
    const p = parse(combo);
    if (!p) return '';
    const parts = [];
    if (p.mod) parts.push(isMac() ? 'Meta' : 'Control');
    if (p.ctrl) parts.push('Control');
    if (p.alt) parts.push('Alt');
    if (p.shift) parts.push('Shift');
    parts.push(p.key.length === 1 ? p.key.toUpperCase() : p.key);
    return parts.join('+');
  }

  // Ce qu'on ne peut pas prendre pour une touche : '' quand la combinaison convient, sinon le code du problème (clé `settings.keys.problem.<code>` pour le texte).
  function formProblem(combo) {
    const p = parse(combo);
    if (!p) return 'invalid';
    if (!/^F\d+$/.test(p.key) && !p.mod && !p.ctrl && !p.alt) return 'needsModifier'; // une touche seule s'écrirait dans le texte
    if (isMac() && p.ctrl && !p.mod && !p.alt) return 'macCtrl'; // Ctrl+lettre y sert à se déplacer dans le texte
    return '';
  }

  // Touches que l'éditeur ou le navigateur gardent pour eux, hors des actions de la liste : copier-coller, sélection, saut de ligne, texte en code, titres 0 et 4 à 6, tâches, retour à
  // la ligne forcé, rechargement, fermeture, nouveaux onglets, retour en arrière. Elles n'arrivent pas toutes à la page (Ctrl+T, Ctrl+N, Ctrl+W jamais) :
  // ce sont celles qu'on refuse de prendre, avec leur raison - une touche déjà liée qui n'a pas de ligne dans la liste ne pourrait plus jamais être rétablie.
  const RESERVED = ['Mod+a', 'Mod+c', 'Mod+x', 'Mod+v', 'Mod+Shift+v', 'Mod+Enter', 'Shift+Enter', 'Mod+Backspace', 'Mod+Delete', 'Mod+e', 'Mod+Shift+9',
    'Mod+Alt+0', 'Mod+Alt+4', 'Mod+Alt+5', 'Mod+Alt+6',
    'Mod+r', 'Mod+Shift+r', 'Mod+l', 'Mod+n', 'Mod+t', 'Mod+w', 'Mod+q', 'Mod+m', 'Mod+Shift+n', 'Mod+Shift+t', 'Mod+Shift+w', 'Mod+Tab', 'Mod+Shift+Tab',
    'Mod+PageUp', 'Mod+PageDown', 'Alt+F4', 'F5', 'F11', 'F12', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+ArrowUp', 'Alt+ArrowDown'];

  // === Les actions ==========================================================================================================================================

  const byId = id => document.getElementById(id);

  // Un clic de souris pourrait-il atteindre cet élément ? Faux pour un bouton désactivé, grisé (`v2-hf-locked`, `pp-access-locked`, ou tout autre `pointer-events: none` hérité) ou
  // masqué. Une ligne de menu au survol (`.v2-hover-flyout`) est toujours fermée, donc sans dimensions : seul le reste compte pour elle.
  function usable(el) {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[hidden], .v2-hf-locked, .pp-access-locked')) return false;
    if (getComputedStyle(el).pointerEvents === 'none') return false;
    return !!el.closest('.v2-hover-flyout') || el.getClientRects().length > 0;
  }
  // Clique le bouton (ou la ligne de menu) : même chemin que la souris, donc mêmes gardes. false quand il n'y en a pas ou qu'il est inutilisable.
  const click = id => () => { const el = byId(id); if (!usable(el)) return false; el.click(); return true; };
  // Un bouton câblé sur « mousedown » (couleur de police, surlignage, taille de police : js/floating-toolbars.js, js/main-toolbar.js) ne verrait jamais un `click` : on lui fait le même
  // geste que la souris. Mêmes gardes que `click`.
  const mouseDown = id => () => {
    const el = byId(id);
    if (!usable(el)) return false;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0, view: window }));
    return true;
  };
  // « Titre 1 » : la ligne du menu Titre (même geste que la souris). Une seconde fois sur le même niveau, retour au paragraphe : la touche de TipTap (Ctrl+Alt+1) en fait autant.
  const headingRow = level => () => {
    const select = byId('v2-header-select');
    const target = select && select.value === String(level) ? 'p' : String(level);
    const row = document.querySelector('#v2-heading-flyout .v2-hover-row[data-level="' + target + '"]');
    if (!usable(row)) return false;
    row.click();
    return true;
  };
  // « Rechercher » et « Rechercher et remplacer » : ouvrent la barre de js/find-replace.js, le clavier dans son champ - comme Ctrl+F et Ctrl+H, pas comme la loupe, qui referme la barre
  // déjà ouverte (une touche qui la fermerait ne chercherait plus). Faux sans rien ouvrir quand l'éditeur n'est pas à l'écran (Lecture, macro-modèle) : la touche reste alors au navigateur.
  const findPanel = replace => () => typeof FindReplace !== 'undefined' && !!FindReplace.open({ replace });
  // « Mode édition » : le curseur revient dans le document, pour qu'on tape tout de suite - sinon la frappe suivante tomberait sur le bouton (Espace le cliquerait).
  const editMode = () => {
    if (!click('btn-mode-edit')()) return false;
    const editor = typeof EditorCore !== 'undefined' && EditorCore.getEditor();
    if (editor && editor.isEditable) editor.commands.focus();
    return true;
  };
  const templatesList = () => { const el = document.querySelector('#v2-title-cluster .tts-trigger'); if (!usable(el)) return false; el.click(); return true; };

  // { id, group, label (clé i18n du nom), key (touche d'origine, '' = aucune), macKey (celle de macOS quand elle diffère), native (la touche d'origine est déjà traitée par l'éditeur,
  // js/main.js ou js/find-replace.js), aliases (autres touches d'origine traitées de même), scope ('editor' = ne vaut pas dans un champ de saisie ; 'app' = vaut partout), repeat (la touche enfoncée se répète), hint (sélecteur de
  // l'élément qui montre la touche : infobulle, ligne de menu ou titre de menu), aria (sélecteur de l'élément qui la dit aux lecteurs d'écran, `hint` par défaut), run }.
  const tip = id => '#' + id;
  const ACTIONS = [
    // Modèles
    { id: 'save', group: 'templates', label: 'toolbar.save', key: 'Mod+s', native: true, scope: 'app', aria: tip('btn-save'), run: click('btn-save') },
    { id: 'new', group: 'templates', label: 'toolbar.new', key: '', scope: 'app', hint: '#v2-new-template-flyout .v2-hover-flyout-label', aria: tip('btn-new'), run: click('btn-new') },
    { id: 'rename', group: 'templates', label: 'shortcuts.action.rename', key: 'F2', scope: 'app', hint: tip('btn-rename-template'), run: click('btn-rename-template') },
    { id: 'setDefault', group: 'templates', label: 'shortcuts.action.setDefault', key: '', scope: 'app', hint: tip('btn-set-default-template'), run: click('btn-set-default-template') },
    { id: 'templates', group: 'templates', label: 'shortcuts.action.templates', key: 'Alt+m', scope: 'app', aria: '#v2-title-cluster .tts-trigger', run: templatesList },
    { id: 'delete', group: 'templates', label: 'shortcuts.action.delete', key: '', scope: 'app', hint: tip('btn-delete'), run: click('btn-delete') },
    { id: 'exportPdf', group: 'templates', label: 'toolbar.exportPdf', key: 'Alt+p', scope: 'app', hint: '#v2-export-pdf-flyout .v2-hover-flyout-label', aria: tip('btn-export-pdf'), run: click('btn-export-pdf') },
    // Affichage
    { id: 'modeEdit', group: 'view', label: 'toolbar.modeEdit', key: 'Alt+e', scope: 'app', hint: tip('btn-mode-edit'), run: editMode },
    { id: 'modeRead', group: 'view', label: 'toolbar.modeRead', key: 'Alt+l', scope: 'app', hint: '#v2-read-flyout .v2-hover-flyout-label', aria: tip('btn-mode-read'), run: click('btn-mode-read') },
    { id: 'settings', group: 'view', label: 'settings.tooltip', key: '', scope: 'app', hint: tip('v2-btn-settings'), run: click('v2-btn-settings') },
    { id: 'keysList', group: 'view', label: 'shortcuts.action.keysList', key: 'Mod+/', scope: 'app', run: () => openKeysList() },
    { id: 'find', group: 'view', label: 'shortcuts.action.find', key: 'Mod+f', native: true, scope: 'app', aria: tip('v2-btn-find'), run: findPanel(false) },
    { id: 'replace', group: 'view', label: 'shortcuts.action.replace', key: 'Mod+h', macKey: 'Mod+Shift+h', aliases: ['Mod+Shift+h'], native: true, scope: 'app', run: findPanel(true) },
    // Mise en forme
    { id: 'bold', group: 'format', label: 'fmt.bold', key: 'Mod+b', native: true, scope: 'editor', hint: tip('v2-btn-bold'), run: click('v2-btn-bold') },
    { id: 'italic', group: 'format', label: 'fmt.italic', key: 'Mod+i', native: true, scope: 'editor', hint: tip('v2-btn-italic'), run: click('v2-btn-italic') },
    { id: 'underline', group: 'format', label: 'fmt.underline', key: 'Mod+u', native: true, scope: 'editor', hint: tip('v2-btn-underline'), run: click('v2-btn-underline') },
    { id: 'strike', group: 'format', label: 'fmt.strike', key: 'Mod+Shift+s', native: true, scope: 'editor', hint: tip('v2-btn-strike'), run: click('v2-btn-strike') },
    { id: 'alignLeft', group: 'format', label: 'align.left', key: 'Mod+Shift+l', native: true, scope: 'editor', hint: tip('v2-btn-align-left'), run: click('v2-btn-align-left') },
    { id: 'alignCenter', group: 'format', label: 'align.center', key: 'Mod+Shift+e', native: true, scope: 'editor', hint: tip('v2-btn-align-center'), run: click('v2-btn-align-center') },
    { id: 'alignRight', group: 'format', label: 'align.right', key: 'Mod+Shift+r', native: true, scope: 'editor', hint: tip('v2-btn-align-right'), run: click('v2-btn-align-right') },
    { id: 'alignJustify', group: 'format', label: 'align.justify', key: 'Mod+Shift+j', native: true, scope: 'editor', hint: tip('v2-btn-align-justify'), run: click('v2-btn-align-justify') },
    { id: 'bulletList', group: 'format', label: 'shortcuts.action.bulletList', key: 'Mod+Shift+8', native: true, scope: 'editor', hint: '#v2-list-flyout .v2-hover-flyout-label', aria: tip('v2-btn-bullet'), run: click('v2-btn-bullet') },
    { id: 'orderedList', group: 'format', label: 'shortcuts.action.orderedList', key: 'Mod+Shift+7', native: true, scope: 'editor', hint: tip('v2-btn-ordered-numeric'), run: click('v2-btn-ordered-numeric') },
    { id: 'outdent', group: 'format', label: 'indent.decrease', key: '', scope: 'editor', repeat: true, hint: tip('v2-btn-outdent'), run: click('v2-btn-outdent') },
    { id: 'indent', group: 'format', label: 'indent.increase', key: '', scope: 'editor', repeat: true, hint: tip('v2-btn-indent'), run: click('v2-btn-indent') },
    { id: 'sizeDown', group: 'format', label: 'font.sizeDecrease', key: '', scope: 'editor', repeat: true, aria: tip('v2-size-minus'), run: mouseDown('v2-size-minus') },
    { id: 'sizeUp', group: 'format', label: 'font.sizeIncrease', key: '', scope: 'editor', repeat: true, aria: tip('v2-size-plus'), run: mouseDown('v2-size-plus') },
    { id: 'textColor', group: 'format', label: 'color.text.tip', key: '', scope: 'editor', hint: tip('v2-btn-text-color'), run: mouseDown('v2-btn-text-color') },
    { id: 'highlight', group: 'format', label: 'color.highlight.tip', key: 'Alt+Shift+h', scope: 'editor', hint: tip('v2-btn-highlight'), run: mouseDown('v2-btn-highlight') },
    // Le pinceau (js/format-painter.js) : la touche fait ce que fait son bouton - copie la mise en forme et arme le pinceau, ou l'arrête s'il est armé. « Appliquer » pose ce qui a été
    // copié sur la sélection du moment, faite au clavier ou à la souris ; sans rien de copié, ni sélection de texte, elle ne fait rien.
    { id: 'formatPainter', group: 'format', label: 'fmt.painter.tip', key: 'Alt+Shift+c', scope: 'editor', hint: tip('v2-btn-format-painter'), run: click('v2-btn-format-painter') },
    { id: 'formatPaste', group: 'format', label: 'shortcuts.action.formatPaste', key: 'Alt+Shift+v', scope: 'editor', run: () => typeof FormatPainter !== 'undefined' && FormatPainter.apply() },
    { id: 'heading1', group: 'format', label: 'heading.level1', key: 'Alt+Shift+1', aliases: ['Mod+Alt+1'], scope: 'editor', hint: '#v2-heading-flyout .v2-hover-row[data-level="1"]', run: headingRow(1) },
    { id: 'heading2', group: 'format', label: 'heading.level2', key: 'Alt+Shift+2', aliases: ['Mod+Alt+2'], scope: 'editor', hint: '#v2-heading-flyout .v2-hover-row[data-level="2"]', run: headingRow(2) },
    { id: 'heading3', group: 'format', label: 'heading.level3', key: 'Alt+Shift+3', aliases: ['Mod+Alt+3'], scope: 'editor', hint: '#v2-heading-flyout .v2-hover-row[data-level="3"]', run: headingRow(3) },
    // Insertion
    { id: 'table', group: 'insert', label: 'insert.table', key: '', scope: 'editor', hint: tip('v2-btn-table'), run: click('v2-btn-table') },
    { id: 'twoColumns', group: 'insert', label: 'insert.twoColumns', key: '', scope: 'editor', hint: tip('v2-btn-two-columns'), run: click('v2-btn-two-columns') },
    { id: 'image', group: 'insert', label: 'shortcuts.action.image', key: '', scope: 'editor', hint: '#v2-image-flyout .v2-hover-flyout-label', aria: tip('v2-btn-image'), run: click('v2-btn-image') },
    { id: 'pageBreak', group: 'insert', label: 'insert.pageBreak.tip', key: 'Alt+Enter', scope: 'editor', hint: tip('v2-btn-page-break'), run: click('v2-btn-page-break') },
    { id: 'toc', group: 'insert', label: 'insert.toc.tip', key: '', scope: 'editor', hint: tip('v2-btn-toc'), run: click('v2-btn-toc') },
    { id: 'comment', group: 'insert', label: 'insert.comment.tip', key: 'Alt+Shift+m', scope: 'editor', hint: tip('v2-btn-comment'), run: click('v2-btn-comment') },
    { id: 'link', group: 'insert', label: 'insert.link.row', key: 'Mod+k', native: true, scope: 'editor', aria: '#v2-btn-link, #v2-row-link', run: click('v2-btn-link') },
    { id: 'citation', group: 'insert', label: 'insert.citation.tip', key: 'Mod+Shift+b', native: true, scope: 'editor', hint: tip('v2-btn-citation'), run: click('v2-btn-citation') },
    { id: 'codeBlock', group: 'insert', label: 'insert.codeBlock.tip', key: 'Mod+Alt+c', native: true, scope: 'editor', hint: tip('v2-btn-code-block'), run: click('v2-btn-code-block') },
    { id: 'callout', group: 'insert', label: 'insert.callout.row', key: '', scope: 'editor', hint: tip('v2-btn-callout'), run: click('v2-btn-callout') },
    { id: 'signature', group: 'insert', label: 'insert.signature.tip', key: '', scope: 'editor', hint: tip('v2-btn-signature'), run: click('v2-btn-signature') },
    { id: 'qrCode', group: 'insert', label: 'insert.qr.row', key: '', scope: 'editor', hint: tip('v2-btn-qr'), run: click('v2-btn-qr') },
    { id: 'variable', group: 'insert', label: 'insert.variable.tip', key: '', scope: 'editor', hint: tip('v2-btn-insert-variable'), run: click('v2-btn-insert-variable') },
    { id: 'today', group: 'insert', label: 'chips.date', key: 'Alt+Shift+d', scope: 'editor', run: () => insertTodayChip() },
    // Historique et suivi
    { id: 'undo', group: 'history', label: 'history.undo', key: 'Mod+z', native: true, scope: 'editor', repeat: true, hint: tip('v2-btn-undo'), run: click('v2-btn-undo') },
    { id: 'redo', group: 'history', label: 'history.redo', key: 'Mod+y', aliases: ['Mod+Shift+z'], native: true, scope: 'editor', repeat: true, hint: tip('v2-btn-redo'), run: click('v2-btn-redo') },
    { id: 'trackChanges', group: 'history', label: 'trackChanges.toggle.tip', key: '', scope: 'editor', hint: tip('v2-btn-track-changes'), run: click('v2-btn-track-changes') },
    { id: 'acceptAll', group: 'history', label: 'trackChanges.acceptAll.tip', key: '', scope: 'editor', hint: tip('v2-btn-accept-all'), run: click('v2-btn-accept-all') },
    { id: 'rejectAll', group: 'history', label: 'trackChanges.rejectAll.tip', key: '', scope: 'editor', hint: tip('v2-btn-reject-all'), run: click('v2-btn-reject-all') },
  ];
  const GROUPS = ['templates', 'view', 'format', 'insert', 'history'];
  const BY_ID = {};
  ACTIONS.forEach(action => { BY_ID[action.id] = action; });

  // « Date du jour » : la même bulle que la ligne « Date du jour » du panneau # (résolue à chaque Lecture et à chaque export), pas une date figée dans le modèle. Faite par le
  // bouton « Insérer une variable » : grisée comme lui (lecture seule, Lecture, macro-modèle).
  function insertTodayChip() {
    const editor = typeof EditorCore !== 'undefined' && EditorCore.getEditor();
    if (!editor || !usable(byId('v2-btn-insert-variable'))) return false;
    return editor.chain().focus().insertContent({ type: 'smartChip', attrs: { kind: 'date' } }).run();
  }

  // Ouvre Réglages sur l'onglet Raccourcis, au tableau des touches.
  function openKeysList() {
    const button = byId('v2-btn-settings');
    if (!usable(button)) return false;
    button.click();
    const tab = document.querySelector('.settings-tab[data-settings-tab="shortcuts"]');
    if (tab) tab.click();
    if (typeof ShortcutsPanel !== 'undefined') ShortcutsPanel.showKeys();
    return true;
  }

  // === Touches choisies (par navigateur) ====================================================================================================================

  // { idAction: combinaison | '' } : seules les actions changées y sont ; '' = « aucune touche ». Une entrée illisible (action disparue, combinaison abîmée) est ignorée.
  let custom = readStorage();
  const listeners = [];

  function readStorage() {
    const found = {};
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      Object.keys(raw || {}).forEach(id => {
        const value = raw[id];
        if (!BY_ID[id] || typeof value !== 'string') return;
        if (value === '' || (parse(value) && formProblem(value) === '')) found[id] = value;
      });
    } catch (e) { /* stockage illisible ou indisponible : les touches d'origine */ }
    return found;
  }
  function writeStorage() {
    try {
      if (Object.keys(custom).length) localStorage.setItem(STORAGE, JSON.stringify(custom));
      else localStorage.removeItem(STORAGE);
    } catch (e) { /* stockage indisponible : le choix ne survivra pas au rechargement */ }
  }
  function changed() { decorate(); listeners.slice().forEach(fn => { try { fn(); } catch (e) { console.warn('[shortcuts] un abonné a levé une exception', e); } }); }

  const isCustomized = action => Object.prototype.hasOwnProperty.call(custom, action.id);
  // La touche d'origine sur cette plateforme : `macKey` quand elle y diffère (⌘H masque l'application sous macOS : le remplacement y est ⌘⇧H, js/find-replace.js).
  const defaultOf = action => (isMac() && action.macKey !== undefined ? action.macKey : action.key);
  const currentKey = action => (isCustomized(action) ? custom[action.id] : defaultOf(action));
  const nativeKeys = action => (action.native ? [defaultOf(action)] : []).concat(action.aliases || []);

  function actionOf(id) { return BY_ID[id] || null; }
  function keyFor(id) { const a = actionOf(id); return a ? currentKey(a) : ''; }
  function defaultKeyFor(id) { const a = actionOf(id); return a ? defaultOf(a) : ''; }
  function label(id) { return format(keyFor(id)); }
  function isChanged(id) { const a = actionOf(id); return !!a && isCustomized(a); }

  // L'action qui a cette combinaison comme touche actuelle (hors `exceptId`).
  function ownerOf(combo, exceptId) {
    return ACTIONS.find(a => a.id !== exceptId && currentKey(a) === combo) || null;
  }

  // Une touche d'origine « rendue » : l'action dont elle était la touche native a changé (ou perdu) sa touche, et personne ne l'a prise depuis - elle ne fait plus ce qu'elle faisait.
  // Retourne l'action qui l'a rendue.
  function freedBy(combo) {
    if (ownerOf(combo)) return null;
    return ACTIONS.find(a => isCustomized(a) && nativeKeys(a).indexOf(combo) !== -1) || null;
  }

  // Ce que dirait la liste de Réglages si on essayait de donner `combo` à `id` : { problem, other } - problem '' quand c'est bon.
  function check(id, combo) {
    const problem = formProblem(combo);
    if (problem) return { problem };
    const other = ownerOf(combo, id);
    if (other) return { problem: 'duplicate', other };
    if (RESERVED.indexOf(combo) !== -1) return { problem: 'reserved' };
    // Les touches d'origine natives d'une autre action qu'on n'a pas touchée sont à elle aussi : « Ctrl+Maj+8 » reste aux puces tant qu'elles ne l'ont pas rendue.
    const holder = ACTIONS.find(a => a.id !== id && !isCustomized(a) && nativeKeys(a).indexOf(combo) !== -1);
    if (holder) return { problem: 'duplicate', other: holder };
    return { problem: '' };
  }

  function setKey(id, combo) {
    const action = actionOf(id);
    if (!action) return { problem: 'invalid' };
    if (combo === defaultOf(action)) return resetKey(id);
    if (combo !== '') {
      const result = check(id, combo);
      if (result.problem) return result;
    }
    custom[id] = combo;
    writeStorage();
    changed();
    return { problem: '' };
  }
  function resetKey(id) {
    if (!actionOf(id)) return { problem: 'invalid' };
    delete custom[id];
    writeStorage();
    changed();
    return { problem: '' };
  }
  function resetAll() { custom = {}; writeStorage(); changed(); }

  // === Infobulles et lecteurs d'écran ====================================================================================================================

  // La touche se montre là où le bouton se nomme : `data-keytip` (« (Ctrl+B) ») après le texte de l'infobulle d'un bouton [data-tip], `data-keyhint` (« Ctrl+B ») à droite d'une
  // ligne de menu ou après le titre d'un menu - css/shortcuts.css les lit - et se dit aux lecteurs d'écran (`aria-keyshortcuts`). Des attributs à eux, qu'aucun changement de langue
  // ne réécrit : un « (Ctrl+B) » ajouté au data-tip s'effacerait au premier applyTranslations().
  function setAttr(el, name, value) { if (value) el.setAttribute(name, value); else el.removeAttribute(name); }
  function decorate() {
    ACTIONS.forEach(action => {
      const key = currentKey(action);
      const text = format(key);
      if (action.hint) document.querySelectorAll(action.hint).forEach(el => {
        setAttr(el, 'data-keyhint', text);
        setAttr(el, 'data-keytip', text ? ' (' + text + ')' : '');
      });
      const aria = action.aria || action.hint;
      if (aria) document.querySelectorAll(aria).forEach(el => setAttr(el, 'aria-keyshortcuts', key ? ariaKeys(key) : ''));
    });
  }

  // === Le clavier ========================================================================================================================================

  let recorder = null; // la liste de Réglages écoute une combinaison : elle reçoit toutes les touches, plus aucune action ne part

  function modalOpen() {
    return Array.from(document.querySelectorAll('.pp-modal')).some(m => m.isConnected && getComputedStyle(m).display !== 'none');
  }
  // Un champ de saisie autre que l'éditeur : Alt+Maj+H n'y a rien à surligner, et la touche y sert à écrire.
  function inTextField() {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    if (el.closest && el.closest('.ProseMirror')) return false;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
  }

  function onKeydown(event) {
    if (event.isComposing || event.keyCode === 229) return; // une saisie en cours (IME) : ni action, ni enregistrement
    if (recorder) {
      event.preventDefault();
      event.stopImmediatePropagation();
      recorder(event);
      return;
    }
    if (event.defaultPrevented) return;
    const { combo, altGr } = fromEvent(event);
    if (!combo || altGr) return;
    const owner = ownerOf(combo);
    if (owner) {
      // À sa touche d'origine, une action native est déjà prise en charge par l'éditeur ou js/main.js : rien à faire ici.
      if (owner.native && !isCustomized(owner) && defaultOf(owner) === combo) return;
      if (modalOpen() || (owner.scope === 'editor' && inTextField())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat && !owner.repeat) return;
      try { owner.run(); } catch (e) { console.warn('[shortcuts] l’action « ' + owner.id + ' » a échoué', e); }
      return;
    }
    // Une touche d'origine rendue ne fait plus ce qu'elle faisait - mais dans un champ de saisie autre que l'éditeur elle garde son sens de texte (Ctrl+Z y défait la frappe).
    const freed = freedBy(combo);
    if (freed && !modalOpen() && !(freed.scope === 'editor' && inTextField())) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  document.addEventListener('keydown', onKeydown, true);

  if (typeof I18n !== 'undefined') I18n.onChange(() => changed());
  window.addEventListener('storage', event => { if (event.key === STORAGE || event.key === null) { custom = readStorage(); changed(); } });
  decorate();

  return {
    GROUPS, ACTIONS,
    action: actionOf, keyFor, defaultKeyFor, label, isChanged, check, setKey, resetKey, resetAll, ownerOf, usable,
    fromEvent, parse, format, ariaKeys, formProblem,
    setRecorder: fn => { recorder = typeof fn === 'function' ? fn : null; },
    isRecording: () => !!recorder,
    onChange: fn => { if (typeof fn === 'function') listeners.push(fn); },
    setPlatform: value => { platformOverride = value || null; changed(); },
    reload: () => { custom = readStorage(); changed(); },
    run: id => { const a = actionOf(id); return !!a && a.run(); },
  };
})();
