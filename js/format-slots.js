// Les mises en forme gardées (menu au survol du pinceau, js/format-slots-menu.js) : trois emplacements dans le modèle et trois pour tout le document Grist, renommables, comme les couleurs
// personnalisées des menus de couleur (js/color-store.js : « Couleurs du modèle » et « Couleurs partagées »). Un emplacement garde ce que le pinceau de mise en forme copie (js/format-painter.js) :
// la mise en forme du caractère (gras, italique, souligné, barré, exposant, indice, police, taille, couleur, surlignage, espacement des lettres, petites capitales, ombre, contour) du premier
// caractère de la sélection ou du curseur, et celle du paragraphe (type, niveau de titre, alignement, interligne, espaces et retraits) quand la source est un curseur ou un paragraphe entier.
// L'appliquer, c'est peindre la sélection comme le pinceau le fait, en une seule transaction : un seul Ctrl + Z la défait.
//
// Chaque portée (« où elle vit ») dit où ses trois emplacements sont gardés :
//  - `model` : dans le JSON de la colonne Margins du modèle (PageLayout.getCustomFormats, clé `textFormats`, comme les couleurs du modèle), donc avec lui d'un export à l'autre et d'un chargement à
//    l'autre. Le geste se range dans Ctrl + Z avec la page (HistoryMarkers, domaine « page ») et marque le modèle modifié (pp:marginsChanged : l'enregistrement automatique l'écrit) ;
//  - `document` : partagés par tous les modèles du document et par toute l'équipe, dans la ligne réservée aux réglages du document de la table des modèles (Templates.getDocumentSettings, clé
//    `textFormats`), sans table de plus. Le changement vaut tout de suite pour les lecteurs et s'écrit dans Grist ensuite (Templates.updateDocumentSettings). Le geste se range dans Ctrl + Z avec
//    les actions du document (SettingsHistory) : défaire ne remet que ce que le geste avait posé, jamais par-dessus le geste d'une autre personne.
//
// Un emplacement est { name, style, block } : le nom (40 caractères au plus), le style de caractère que garde le style de frappe (TypingStyle.normalize : seuls les réglages connus, aux valeurs sûres) et le
// paragraphe ({ type: 'paragraph' | 'heading', level?, align?, spacing? }). Il est relu d'un JSON qu'une autre version ou une autre personne a pu écrire : tout est revu à la lecture (`cleanSlot`), et ce qui
// ne tient pas debout n'est pas un emplacement. Les trois places sont toujours rendues, `null` pour une place vide.
const FormatSlots = (function () {
  const MAX = PageLayout.CUSTOM_FORMATS_MAX;
  const NAME_MAX = PageLayout.CUSTOM_FORMAT_NAME_MAX;
  const ALIGNMENTS = ['left', 'center', 'right', 'justify'];
  const SPACING_KEYS = ['lineHeight', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentFirst'];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // `status(texte, erreur)` : le coin d'état de la page (js/main.js).
  let host = { status: () => {} };
  function wire(options) { host = Object.assign({}, host, options); }

  const cleanName = text => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '');
  const defaultName = index => I18n.t('fmtSlot.defaultName', { n: index + 1 });
  const isReadOnly = () => typeof AccessRights !== 'undefined' && AccessRights.get().readOnly;

  // Le paragraphe d'un emplacement tel que le pinceau le pose : un type que le pinceau connaît, un niveau de 1 à 6 pour un titre, un alignement connu, et les cinq réglages de « Paragraphe… » ramenés à leurs bornes
  // (ParagraphFormat.normalized ; un titre n'en a aucun). Null quand ce n'est pas un paragraphe.
  function cleanBlock(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type !== 'paragraph' && raw.type !== 'heading') return null;
    const block = { type: raw.type };
    if (raw.type === 'heading') {
      if (!Number.isInteger(raw.level) || raw.level < 1 || raw.level > 6) return null;
      block.level = raw.level;
    }
    if (ALIGNMENTS.indexOf(raw.align) !== -1) block.align = raw.align;
    if (raw.type === 'paragraph' && raw.spacing && typeof raw.spacing === 'object') {
      const spacing = {};
      SPACING_KEYS.forEach((key) => { const value = ParagraphFormat.normalized(key, raw.spacing[key]); if (value !== null) spacing[key] = value; });
      if ('indentFirst' in spacing) {
        const first = ParagraphFormat.firstLineWithin(spacing.indentLeft == null ? null : spacing.indentLeft, spacing.indentFirst);
        if (first === null) delete spacing.indentFirst; else spacing.indentFirst = first;
      }
      if (Object.keys(spacing).length) block.spacing = spacing;
    }
    return block;
  }

  // Un emplacement relu : null si ce n'en est pas un (pas de nom, ni caractère ni paragraphe). Le style d'un texte sans réglage est `{}` : « texte ordinaire » est une mise en forme, qui efface celle de la cible.
  function cleanSlot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = cleanName(raw.name);
    const style = raw.style && typeof raw.style === 'object' ? (TypingStyle.normalize(raw.style) || {}) : null;
    const block = cleanBlock(raw.block);
    if (!name || (!style && !block)) return null;
    const slot = { name };
    if (style) slot.style = style;
    if (block) slot.block = block;
    return slot;
  }
  // Les MAX places d'une liste, chacune relue.
  function padded(list) {
    const places = [];
    for (let at = 0; at < MAX; at += 1) places.push(cleanSlot(Array.isArray(list) ? list[at] : null));
    return places;
  }
  // Sous la forme qu'on garde : les places vides de la fin ne s'écrivent pas.
  function trimmed(places) {
    const kept = places.slice();
    while (kept.length && !kept[kept.length - 1]) kept.pop();
    return kept;
  }

  // La mise en forme que copie le pinceau (`FormatPainter.capture`), sous la forme qu'on garde. Le style est toujours là, vide pour un texte ordinaire ; le paragraphe seulement quand la source le donne.
  function slotOf(snapshot, name) {
    const slot = { name, style: TypingStyle.styleOfMarks(snapshot.marks) || {} };
    const block = snapshot.block ? cleanBlock(snapshot.block) : null;
    if (block) slot.block = block;
    return slot;
  }
  // Et l'inverse : de quoi peindre (`FormatPainter.paint`) avec cet emplacement, pour le schéma de l'éditeur.
  function snapshotOf(schema, slot) {
    const block = slot.block ? {
      type: slot.block.type,
      level: slot.block.level || null,
      align: slot.block.align || null,
      spacing: SPACING_KEYS.reduce((spacing, key) => Object.assign(spacing, { [key]: slot.block.spacing && slot.block.spacing[key] != null ? slot.block.spacing[key] : null }), {}),
    } : null;
    return { marks: slot.style ? TypingStyle.marksOf(schema, slot.style) : [], block };
  }

  // --- Les portées ---
  const readModel = () => trimmed(padded(PageLayout.getCustomFormats()));
  const readDocument = () => trimmed(padded(PageLayout.normalizeCustomFormats(Templates.getDocumentSettings().textFormats)));
  const namesOf = list => list.filter(Boolean).map(slot => '« ' + slot.name + ' »').join(', ');

  // Le réglage du document pour l'historique d'Annuler / Rétablir (js/settings-history.js) : lire, poser (en attendant que Grist l'ait écrit : un refus lève un conflit, rien n'est faussement dit « fait »), dire.
  const DOCUMENT_SETTING = {
    read: readDocument,
    async write(list) {
      const next = trimmed(padded(list));
      const saved = await Templates.updateDocumentSettings({ textFormats: next.length ? next : null });
      if (!saved) throw ActionHistory.conflict(I18n.t('fmtSlot.status.documentFailed'));
    },
    say: list => I18n.t('fmtSlot.status.documentNow', { names: namesOf(list) || I18n.t('fmtSlot.none') }),
    locked: isReadOnly,
  };

  // `read` rend les places utiles de la portée, `write` les remplace et rend vrai si quelque chose a changé, `track` range le geste dans Ctrl + Z. Le modèle prévient l'enregistrement automatique
  // (pp:marginsChanged, comme les couleurs) ; le document s'écrit tout seul dans Grist, un refus se dit dans le coin d'état.
  const SCOPES = [
    {
      id: 'model',
      labelKey: 'fmtSlot.scope.model',
      hintKey: 'fmtSlot.scope.model.hint',
      read: readModel,
      write(list) {
        const changed = PageLayout.setCustomFormats(trimmed(padded(list)));
        if (changed) document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
        return changed;
      },
      track: work => HistoryMarkers.track('page', work),
      savedKey: 'fmtSlot.status.savedModel',
    },
    {
      id: 'document',
      labelKey: 'fmtSlot.scope.document',
      hintKey: 'fmtSlot.scope.document.hint',
      read: readDocument,
      write(list) {
        const next = trimmed(padded(list));
        if (same(next, readDocument())) return false;
        Templates.updateDocumentSettings({ textFormats: next.length ? next : null }).then((saved) => {
          if (!saved) host.status(I18n.t('fmtSlot.status.documentFailed'), true);
        });
        return true;
      },
      track: work => SettingsHistory.track(DOCUMENT_SETTING, work),
      savedKey: 'fmtSlot.status.savedDocument',
    },
  ];
  const scopeOf = id => SCOPES.find(scope => scope.id === id) || null;
  const validIndex = index => Number.isInteger(index) && index >= 0 && index < MAX;

  // Les portées à montrer : { id, label, hint, slots } - le libellé et l'infobulle (où vivent ces mises en forme) dans la langue du moment, les MAX places.
  function scopes() {
    return SCOPES.map(scope => ({ id: scope.id, label: I18n.t(scope.labelKey), hint: I18n.t(scope.hintKey), slots: padded(scope.read()) }));
  }
  const slots = id => { const scope = scopeOf(id); return scope ? padded(scope.read()) : []; };

  // Remplace la place `index` de la portée par `slot` (null : la vide) ; rend vrai si quelque chose a changé. Un seul pas de Ctrl + Z.
  function put(scope, index, slot) {
    const next = padded(scope.read());
    next[index] = slot;
    return !!scope.track(() => scope.write(next));
  }

  // Garde la mise en forme du texte où l'on est (le curseur ou la sélection de `editor`, comme le pinceau la copie) dans la place `index`. Une place déjà prise garde son nom ; une place vide reçoit « Mise en forme N ».
  // Faux, sans rien changer, quand le pinceau est grisé (e-mail, macro-modèle, Lecture, lecture seule) ou que la portée ou la place est inconnue.
  function save(editor, scopeId, index) {
    const scope = scopeOf(scopeId);
    if (!scope || !validIndex(index) || !editor || !FormatPainter.isUsable()) return false;
    const current = padded(scope.read())[index];
    const name = current ? current.name : defaultName(index);
    const changed = put(scope, index, slotOf(FormatPainter.capture(editor.state), name));
    if (changed) host.status(I18n.t(scope.savedKey, { name }), false);
    return changed;
  }

  // Renomme la mise en forme de la place `index` ; faux pour un nom vide, une place vide ou le même nom.
  function rename(scopeId, index, name) {
    const scope = scopeOf(scopeId);
    const wanted = cleanName(name);
    if (!scope || !validIndex(index) || !wanted || !FormatPainter.isUsable()) return false;
    const current = padded(scope.read())[index];
    if (!current || current.name === wanted) return false;
    const changed = put(scope, index, Object.assign({}, current, { name: wanted }));
    if (changed) host.status(I18n.t('fmtSlot.status.renamed', { name: wanted }), false);
    return changed;
  }

  // Retire la mise en forme de la place `index` (la place redevient vide).
  function clear(scopeId, index) {
    const scope = scopeOf(scopeId);
    if (!scope || !validIndex(index) || !FormatPainter.isUsable()) return false;
    const current = padded(scope.read())[index];
    if (!current) return false;
    const changed = put(scope, index, null);
    if (changed) host.status(I18n.t('fmtSlot.status.cleared', { name: current.name }), false);
    return changed;
  }

  // Y a-t-il du texte à mettre en forme : une sélection qui couvre quelque chose (le pinceau ne peint ni un curseur ni une sélection vide).
  const hasSelection = editor => !!editor && editor.state.selection.ranges.some(range => range.$to.pos > range.$from.pos);

  // Peint la sélection de `editor` avec la mise en forme de la place `index`, comme le pinceau : une transaction. Faux, sans rien changer, quand la place est vide, que la sélection est vide ou sans texte, ou que le pinceau est
  // grisé.
  function apply(editor, scopeId, index) {
    const scope = scopeOf(scopeId);
    if (!scope || !validIndex(index) || !editor || !FormatPainter.isUsable()) return false;
    const slot = padded(scope.read())[index];
    if (!slot || !hasSelection(editor)) return false;
    const painted = FormatPainter.paint(editor, snapshotOf(editor.state.schema, slot));
    if (painted) host.status(I18n.t('fmtSlot.status.applied', { name: slot.name }), false);
    return painted;
  }

  return {
    MAX, NAME_MAX, wire, scopes, slots, save, rename, clear, apply, hasSelection, cleanName, defaultName, isReadOnly,
    // Les essais : la forme gardée d'une copie du pinceau et de quoi repeindre avec un emplacement.
    slotOf, snapshotOf, cleanSlot,
  };
})();
