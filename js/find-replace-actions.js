// Rechercher / Remplacer, les actions sur les résultats : aller de l'un à l'autre, remplacer un résultat ou tous (une transaction ProseMirror, une seule étape d'annulation),
// rouvrir le texte du remplacement pour Annuler. Façade : js/find-replace.js.
const FindReplaceActions = (function () {
  const { META, state, editor, currentMatches, allStories, indexOfSelection, refresh } = FindReplaceView;
  const { expandReplacement, isBubble, replaceInBubble } = FindReplaceEngine;
  // Le message qui dit ce qu'un remplacement a fait vient du panneau, chargé après : appelé à l'usage, jamais au chargement.
  const setFlash = text => FindReplacePanel.setFlash(text);

  // Annuler juste après « Remplacer » : quand le remplacement a fait passer la recherche à un AUTRE texte (le pied s'ouvre sous les yeux), l'éditeur ne contient plus le texte
  // du remplacement, et Annuler défaisait celui qu'on vient d'ouvrir (souvent rien). On retient où le remplacement a été fait (`id`), le texte où la recherche a atterri
  // (`landedId`) et son contenu (`landed`) ; le premier Annuler qui suit, tant que ce texte est toujours ouvert et n'a pas changé (rien tapé, rien mis en forme), commence par
  // rouvrir le texte du remplacement (reopenForUndo), et c'est lui que l'Annuler défait. Tout autre geste de la recherche (suivant, précédent, nouvelle requête, autre
  // remplacement, fermeture du panneau) l'oublie.
  let afterReplace = null; // { id, landedId, landed } | null

  const liveStoryId = () => { const mode = HeaderFooterPreview.getHfMode(); return mode ? mode.zone + ':' + mode.variant : 'main'; };

  function forgetReplacement() { afterReplace = null; }

  // Appelé juste avant tout Annuler du modèle (Ctrl+Z dans le texte ou sur le panneau, bouton Annuler de la barre) : rouvre le texte du dernier remplacement quand la recherche
  // l'a quitté juste après et que rien n'a bougé depuis. Vrai quand il a rouvert ce texte. Sert une seule fois : l'Annuler d'après défait le texte ouvert, comme toujours.
  function reopenForUndo() {
    const pending = afterReplace;
    afterReplace = null;
    const ed = editor();
    if (!pending || !ed || liveStoryId() !== pending.landedId || !ed.state.doc.eq(pending.landed)) return false;
    if (!HeaderFooterPreview.openStory(pending.id)) return false;
    state.win = null; // les résultats sont ceux d'un autre document : la fenêtre de surlignage se repose
    return true;
  }

  // Se placer sur un résultat
  // Le résultat devient la sélection de l'éditeur (le panneau garde le focus : ProseMirror ne touche pas à la sélection du navigateur quand il ne l'a
  // pas) ; son surlignage vient des décorations, la sélection du navigateur étant alors dans le champ de recherche. La zone de défilement amène le
  // résultat au milieu quand il est hors de vue.
  function select(match) {
    const ed = editor();
    const TextSelection = EditorCore.getTextSelectionClass();
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, match.from, match.to)).setMeta(META, true));
    reveal(match);
  }

  function reveal(match) {
    const ed = editor();
    const scroller = document.getElementById('editor-container');
    if (!ed || !scroller) return;
    let rect;
    try { rect = ed.view.coordsAtPos(match.from); } catch (e) { return; }
    const box = scroller.getBoundingClientRect();
    const margin = 24;
    if (rect.top >= box.top + margin && rect.bottom <= box.bottom - margin) return;
    scroller.scrollTop += (rect.top + rect.bottom) / 2 - (box.top + box.bottom) / 2;
  }

  // Passe à un autre texte du modèle (l'éditeur y entre, comme après un clic sur la marge d'en-tête) et s'y place sur son résultat `ordinal` (-1 : le dernier). Les résultats du
  // texte qu'on quitte ne sont plus ceux de l'écran, ceux du nouveau se recalculent d'après son document.
  function openAndSelect(id, ordinal) {
    if (!HeaderFooterPreview.openStory(id)) return false;
    state.win = null;
    const matches = currentMatches(editor().state);
    if (!matches.length) return false;
    state.flash = '';
    select(matches[ordinal < 0 ? matches.length - 1 : Math.min(ordinal, matches.length - 1)]);
    return true;
  }

  // Le premier résultat d'un AUTRE texte, en allant vers la fin de la page (ou vers son début) et en repartant de l'autre bout : on y entre et on s'y place. Faux quand il
  // n'y en a nulle part ailleurs.
  function goElsewhere(backwards) {
    const stories = allStories(editor().state);
    const at = stories.findIndex(story => story.live);
    for (let step = 1; step < stories.length; step++) {
      const story = stories[(((backwards ? at - step : at + step) % stories.length) + stories.length) % stories.length];
      if (story.matches.length && openAndSelect(story.id, backwards ? -1 : 0)) return true;
    }
    return false;
  }

  // Suivant (ou précédent) à partir de la sélection ; quand il n'y en a plus dans ce texte, dans le texte suivant du modèle (l'en-tête, le corps, le pied : on y entre), et
  // en repartant de l'autre bout quand il n'y en a plus nulle part.
  function goToMatch(backwards) {
    afterReplace = null;
    const ed = editor();
    if (!ed || !state.query) return false;
    const matches = currentMatches(ed.state);
    const { from, to } = ed.state.selection;
    let target;
    if (backwards) {
      for (let i = matches.length - 1; i >= 0 && !target; i--) if (matches[i].to <= from) target = matches[i];
    } else {
      target = matches.find(m => m.from >= to);
    }
    if (target) { state.flash = ''; select(target); return true; }
    if (goElsewhere(backwards)) return true;
    if (!matches.length) return false;
    state.flash = '';
    select(backwards ? matches[matches.length - 1] : matches[0]);
    return true;
  }

  // La requête ou une option vient de changer : on se place sur le premier résultat à partir du début de la sélection (la frappe d'un mot qui
  // s'allonge reste donc sur place).
  function applyQuery() {
    afterReplace = null;
    const ed = editor();
    if (!ed) return;
    state.win = null; // d'autres résultats : la fenêtre de surlignage se repose autour de la sélection, puis d'après l'écran (placeWindow)
    state.flash = '';
    const matches = state.query ? currentMatches(ed.state) : [];
    const { from, to } = ed.state.selection;
    const target = matches.find(m => m.from >= from) || matches[0];
    if (target && !(target.from === from && target.to === to)) select(target); else refresh();
  }

  // Remplacer
  const TRACK_MARKS = new Set(['insertion', 'deletion', 'modification']);
  // Le texte qui remplace garde la mise en forme du premier caractère remplacé (gras, couleur, lien : une marque de lien n'est pas « inclusive »,
  // insertText la perdrait en fin de lien). En mode suivi, les marques de suivi héritées sont retirées : c'est le mode qui pose celles de
  // l'insertion.
  function replacementMarks(doc, pos, suggest) {
    const $pos = doc.resolve(pos);
    const after = $pos.nodeAfter;
    let marks = after && after.isText ? after.marks : [];
    marks = marks.filter(mark => mark.type.name !== 'deletion' && !(suggest && TRACK_MARKS.has(mark.type.name)));
    return $pos.parent.type.allowedMarks(marks);
  }

  function replaceInTransaction(tr, doc, match, text, suggest) {
    if (text) tr.replaceWith(match.from, match.to, doc.type.schema.text(text, replacementMarks(doc, match.from, suggest)));
    else tr.delete(match.from, match.to);
  }

  const KEPT_TEXT = { name: 'find.bubble.name', formula: 'find.bubble.formula', tooLong: 'find.bubble.tooLong', tooLongOtherwise: 'find.bubble.tooLongOtherwise', suggest: 'find.bubble.suggest' };
  // Remplace `match` dans `tr` : rend null quand il l'est, sinon pourquoi il reste tel quel - 'name' (le résultat n'est que dans le nom d'une bulle, qui
  // suit une colonne), 'formula' (la formule d'un calcul), 'tooLong' (un « Avant » ou un « Après » trop long), 'tooLongOtherwise' (le texte d'un sinon trop long), 'suggest' (une bulle ne se propose pas en
  // suppression et insertion : en mode suivi elle reste). Une bulle ne change que par le texte qu'elle porte (« Avant », « Après »), par ses attributs :
  // sa position et sa taille ne bougent pas, les résultats suivants non plus.
  function replaceMatch(tr, doc, match, suggest) {
    if (!isBubble(match)) { replaceInTransaction(tr, doc, match, expandReplacement(match, state.replacement), suggest); return null; }
    const { attrs, reason } = replaceInBubble(doc.nodeAt(match.from), state.query, state, state.replacement);
    if (!attrs) return reason;
    if (suggest) return 'suggest';
    tr.setNodeMarkup(match.from, null, attrs);
    return null;
  }

  // Envoie `tr` et rend la transaction réellement appliquée (celle que le pont du suivi a transformée en suggestions, le cas échéant), ou null si
  // elle a été refusée.
  function dispatchAndCapture(tr) {
    const ed = editor();
    let applied = null;
    const grab = ({ transaction }) => { if (transaction.docChanged) applied = transaction; };
    ed.on('transaction', grab);
    try { ed.view.dispatch(tr); } finally { ed.off('transaction', grab); }
    return applied;
  }

  // Remplace le résultat courant, puis se place sur le suivant. Sans résultat courant (la sélection n'est pas sur un résultat), « Remplacer » ne fait
  // que se placer sur le prochain : on voit ce qui va être remplacé avant de le remplacer.
  function replaceCurrent() {
    afterReplace = null;
    const ed = editor();
    if (!ed || !ed.isEditable || !state.query) return false;
    const matches = currentMatches(ed.state);
    const index = indexOfSelection(matches, ed.state.selection);
    if (index < 0) return goToMatch(false);
    const match = matches[index];
    const replacedIn = liveStoryId();
    const tr = ed.state.tr;
    const kept = replaceMatch(tr, ed.state.doc, match, Editor.isTrackChangesOn());
    // Une bulle qui ne change pas : on le dit et on passe au résultat suivant, comme après un remplacement.
    if (kept) { goToMatch(false); setFlash(I18n.t(KEPT_TEXT[kept], { max: kept === 'tooLongOtherwise' ? VariableOtherwise.TEXT_MAX : VariableFormat.AFFIX_MAX })); return false; }
    const applied = dispatchAndCapture(tr);
    if (!applied) { setFlash(I18n.t('find.replaceFailed')); return false; }
    // Ce qui suit le texte qui vient d'être mis : la fin du remplacement dans le document final (en mode suivi, après l'insertion qui suit la
    // suppression).
    const end = applied.mapping.map(match.to, 1);
    const rest = currentMatches(ed.state);
    const next = rest.find(m => m.from >= end);
    state.flash = '';
    if (next) select(next);
    else if (!goElsewhere(false)) {
      // Plus rien dans les autres textes : on repart du début de celui-ci.
      if (rest.length) select(rest[0]);
      else {
        const TextSelection = EditorCore.getTextSelectionClass();
        ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(Math.min(end, ed.state.doc.content.size)))).setMeta(META, true));
      }
    }
    // La recherche a quitté le texte du remplacement : le prochain Annuler le rouvre.
    if (liveStoryId() !== replacedIn) afterReplace = { id: replacedIn, landedId: liveStoryId(), landed: editor().state.doc };
    return true;
  }

  // Ce que dit le compteur après « Tout remplacer » : « 3 remplacements, 1 bulle laissée, 2 autres ailleurs » - ce qui a changé, ce qui est resté tel quel, ce qui attend dans
  // un autre texte du modèle (l'en-tête, le corps, le pied).
  function replacedFlash(count, kept, elsewhere) {
    return [count ? I18n.t('find.replaced', { count }) : '', kept ? I18n.t('find.kept', { kept }) : '', elsewhere ? I18n.t('find.elsewhere', { rest: elsewhere }) : ''].filter(Boolean).join(', ');
  }

  // Tous les résultats DU TEXTE QUE L'ÉDITEUR CONTIENT (le corps, ou l'en-tête ou le pied ouvert) en une transaction (donc une seule annulation), du dernier au premier : les
  // positions des résultats d'avant ne bougent pas. Ceux des autres textes attendent : l'annulation, elle, n'a qu'un historique par texte.
  function replaceAll() {
    afterReplace = null;
    const ed = editor();
    if (!ed || !ed.isEditable || !state.query) return 0;
    const stories = allStories(ed.state);
    const matches = stories.find(story => story.live).matches;
    if (!matches.length) return 0;
    const elsewhere = stories.reduce((sum, story) => sum + (story.live ? 0 : story.matches.length), 0);
    const suggest = Editor.isTrackChangesOn();
    const doc = ed.state.doc;
    const tr = ed.state.tr;
    let kept = 0;
    for (let i = matches.length - 1; i >= 0; i--) if (replaceMatch(tr, doc, matches[i], suggest)) kept++;
    const count = matches.length - kept;
    // Que des bulles qui ne changent pas : rien à envoyer, le document reste tel quel.
    if (!count) { setFlash(replacedFlash(0, kept, elsewhere)); return 0; }
    const applied = dispatchAndCapture(tr);
    if (!applied) { setFlash(I18n.t('find.replaceFailed')); return 0; }
    setFlash(replacedFlash(count, kept, elsewhere));
    return count;
  }

  return { go: goToMatch, applyQuery, replaceCurrent, replaceAll, reopenForUndo, forgetReplacement };
})();
