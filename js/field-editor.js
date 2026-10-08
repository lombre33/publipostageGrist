// Les champs texte à bulles : Objet, À, Cc, Cci du mode email et nom du fichier PDF. Chacun est un mini-éditeur TipTap d'une seule ligne, monté dans son
// élément de la page (un <div> qui garde son identifiant et ses classes), pour que les variables y soient les mêmes bulles bleues que dans le corps d'un
// modèle - avec leur barre (condition, autres attributs, boucle dans la phrase, liste, format) - et que la liste « # » les pose, avec les puces Date du
// jour, Heure actuelle, Email et Nom de l'utilisateur.
// Le reste de l'application les traite comme les <input> qu'ils remplacent, et js/main.js n'a presque pas changé : l'élément reçoit `value`, `readOnly`,
// `focus()` et `blur()` et émet `input` (une modification de la personne) et `blur` ; deux ajouts : `showText(texte)`, par lequel la Lecture y écrit la
// valeur résolue (jamais lue comme un modèle), et l'évènement `fieldenter`, Entrée quand la liste « # » n'est pas ouverte.
// Ce qui s'enregistre dans la colonne du modèle est FieldCodec.toStored : le texte brut d'avant tant que les bulles n'ont aucun réglage et qu'aucune
// puce n'est posée, du HTML sinon.
const FieldEditor = (function () {
  const fields = new Map(); // élément du champ -> { host, editor, libs, panel, shown, readOnly }

  const { docJson, itemsOfDoc } = (function () {
    // Le document d'un champ : un seul paragraphe, du texte, des bulles et des puces (les éléments { text }, { badge } ou { chip } de FieldCodec)

    function nodeJson(item) {
      if (FieldCodec.isText(item)) return { type: 'text', text: item.text };
      if (FieldCodec.isChip(item)) return { type: 'smartChip', attrs: Object.assign({}, item.chip) };
      return { type: 'varBadge', attrs: Object.assign({}, item.badge) };
    }
    const docJson = items => ({ type: 'doc', content: [{ type: 'paragraph', content: items.map(nodeJson) }] });
    function itemsOfDoc(doc) {
      const items = [];
      doc.descendants(node => {
        if (node.isText) items.push({ text: node.text });
        else if (node.type.name === 'varBadge') items.push({ badge: Object.assign({}, node.attrs) });
        else if (node.type.name === 'smartChip') items.push({ chip: Object.assign({}, node.attrs) });
        return true;
      });
      return items;
    }
    return { docJson, itemsOfDoc };
  })();

  const { editorProps } = (function () {
    // Le clavier et le presse-papiers d'un champ : une seule ligne, du texte et des bulles, aucune mise en forme

    const BLOCK_TAGS = /^(address|article|aside|blockquote|br|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)$/i;
    const SKIPPED_TAGS = /^(script|style|template|head|title|meta|link)$/i;

    // Le HTML collé, réduit à ce qu'un champ garde : le texte, sur une ligne (un changement de bloc ou de ligne devient une espace), les bulles - une
    // bulle copiée dans un autre champ ou dans le document arrive avec ses réglages - et les puces. Un <template> est inerte : rien ne s'exécute ni ne se charge.
    function inlineHtml(html) {
      const template = document.createElement('template');
      template.innerHTML = html;
      let out = '';
      const walk = parent => parent.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) { out += FieldCodec.escapeText(node.nodeValue.replace(/\s+/g, ' ')); return; }
        if (node.nodeType !== Node.ELEMENT_NODE || SKIPPED_TAGS.test(node.tagName)) return;
        if (node.matches('span.var-badge')) {
          const attrs = EditorNodes.varBadgeAttrsOf(node);
          // Une boucle sur les lignes d'un tableau, d'une liste ou de paragraphes ne répète rien sur une ligne de texte : la bulle redevient une variable ordinaire.
          const loop = LoopRules.normalizeLoop(attrs.loop);
          if (loop && loop.repeat !== 'inline') attrs.loop = null;
          out += EditorNodes.varBadgeHtml(attrs);
          return;
        }
        if (node.matches('span.smart-chip')) { out += EditorNodes.smartChipHtml(EditorNodes.smartChipAttrsOf(node)); return; }
        const block = BLOCK_TAGS.test(node.tagName);
        if (block) out += ' ';
        walk(node);
        if (block) out += ' ';
      });
      walk(template.content);
      return out;
    }
    // Le texte brut collé : sans retour à la ligne, ProseMirror en ferait un paragraphe par ligne.
    const flatText = text => text.replace(/\s*[\r\n]+\s*/g, ' ');
    // Le texte brut d'une sélection copiée : une bulle s'écrit « #Clé », comme dans la valeur enregistrée.
    const plainText = slice => FieldCodec.serializePlain(itemsOfDoc(slice.content));

    function editorProps() {
      return {
        // `role` est repris ici : TipTap le pose à la création seulement, et setEditable (la Lecture) remplace tous les attributs de la vue.
        attributes: { role: 'textbox', 'aria-multiline': 'false', autocapitalize: 'off', autocorrect: 'off' },
        transformPastedHTML: inlineHtml,
        transformPastedText: flatText,
        clipboardTextSerializer: plainText,
        // Gras, italique et souligné du navigateur : le champ n'a aucune mise en forme.
        handleKeyDown(view, event) {
          if ((event.ctrlKey || event.metaKey) && !event.altKey && /^[biu]$/i.test(event.key)) { event.preventDefault(); return true; }
          return false;
        },
      };
    }
    return { editorProps };
  })();

  // Les extensions d'un champ : le texte, un paragraphe unique, la bulle de variable et la puce, Entrée et la liste « # ». L'ordre compte : TipTap essaie la dernière
  // extension rangée en premier, la liste ouverte garde donc Entrée, Tab, Échap et les flèches.
  function extensions(libs, host) {
    const { Extension, Node: TiptapNode, mergeAttributes, StarterKit, Document, Suggestion } = libs;
    const press = () => { host.dispatchEvent(new CustomEvent('fieldenter')); return true; };
    return [
      // Du texte, un paragraphe et l'historique Annuler / Rétablir : rien d'autre (ni gras, ni titres, ni listes, ni saut de ligne).
      StarterKit.configure({
        document: false, bold: false, blockquote: false, bulletList: false, code: false, codeBlock: false, dropcursor: false, gapcursor: false,
        hardBreak: false, heading: false, horizontalRule: false, italic: false, listItem: false, listKeymap: false, link: false, orderedList: false,
        strike: false, underline: false, trailingNode: false,
      }),
      Document.extend({ content: 'paragraph' }),
      EditorNodes.createVarBadgeNode(TiptapNode, mergeAttributes),
      EditorNodes.createSmartChipNode(TiptapNode, mergeAttributes),
      Extension.create({ name: 'fieldEnter', addKeyboardShortcuts: () => ({ Enter: press, 'Shift-Enter': press, 'Mod-Enter': press }) }),
      Variables.createFieldExtension(Extension, Suggestion),
    ];
  }

  // Une fenêtre de la bulle (FloatingToolbars.variableWindowOpen) ou la clé de correspondance tient une position de la bulle qu'elle règle : tant qu'elle
  // est ouverte, le champ ne remplace pas son document.
  function windowOpen() {
    const link = document.getElementById('link-config-modal');
    return FloatingToolbars.variableWindowOpen() || !!(link && link.style.display === 'flex');
  }

  const { show, tidy, sync } = (function () {
    // Ce que le champ affiche : un autre document, le texte résolu de la Lecture, l'état « vide »

    // Pose `class="is-empty"` sur l'élément quand le champ est vide : c'est elle qui montre son indication (css/field-editor.css), lue dans l'attribut
    // `placeholder` de l'élément - donc dans la langue de l'interface, sans transaction pour la rafraîchir.
    function sync(field) {
      if (field.editor) field.host.classList.toggle('is-empty', field.editor.isEmpty);
    }
    // Remplace le document par `items` sans passer par une transaction : rien n'est une modification de la personne (ni `input`, ni brouillon « modifié »)
    // et l'historique Annuler repart de zéro - un autre modèle ne s'annule pas dans celui-ci.
    function show(field, items) {
      const { editor, libs } = field;
      const view = editor.view;
      const doc = editor.schema.nodeFromJSON(docJson(items));
      view.updateState(libs.EditorState.create({ schema: editor.schema, doc, plugins: view.state.plugins }));
      // La barre d'une bulle du document précédent n'a plus d'objet.
      if (field.panel) field.panel.hide();
      Editor.markBadgeValidity(view.dom);
      sync(field);
    }
    // Une clé tapée en entier (« #TpProjet.Nom ») vaut une bulle dans la valeur enregistrée (FieldCodec.toStored) : le champ la montre alors en bulle, comme
    // elle sera relue.
    function normalize(field) {
      const { editor } = field;
      if (field.shown != null || !editor.isEditable) return;
      const wanted = editor.schema.nodeFromJSON(docJson(FieldCodec.itemsOf(FieldCodec.toStored(itemsOfDoc(editor.state.doc)))));
      if (!wanted.eq(editor.state.doc)) show(field, itemsOfDoc(wanted));
    }
    // Au départ du curseur : une bulle sélectionnée ne reste pas la sélection (la première touche tapée au retour la remplacerait), et les clés tapées
    // en entier deviennent des bulles. Pas quand le focus est passé dans la barre de la bulle (son nombre de décimales, sa devise : de vrais champs de
    // formulaire) : elle règle cette bulle, et la barre se refermerait avec la sélection.
    function tidy(field) {
      const { editor, libs } = field;
      if (field.panel && field.panel.el.contains(document.activeElement)) return;
      const { selection } = editor.state;
      if (selection.node) editor.view.dispatch(editor.state.tr.setSelection(libs.TextSelection.create(editor.state.doc, selection.to)));
      normalize(field);
    }
    return { show, tidy, sync };
  })();

  // Les attributs qui nomment le champ pour un lecteur d'écran sont posés sur l'élément (index.html, js/i18n.js les pose et les change avec la langue) ;
  // c'est pourtant la zone de saisie qui est le champ de texte : elle les reprend à chaque changement, et l'élément, qui n'a pas de rôle, les perd -
  // le nom ne serait sinon annoncé qu'une fois de trop.
  function mirrorLabels(host, dom) {
    const copy = () => {
      ['aria-label', 'aria-labelledby'].forEach(name => {
        const value = host.getAttribute(name);
        if (!value) return;
        dom.setAttribute(name, value);
        host.removeAttribute(name);
      });
      const placeholder = host.getAttribute('placeholder');
      if (placeholder) dom.setAttribute('aria-placeholder', placeholder);
    };
    copy();
    new MutationObserver(copy).observe(host, { attributes: true, attributeFilter: ['aria-label', 'aria-labelledby', 'placeholder'] });
  }

  // L'interface d'un <input> que le reste de l'application attend de ces éléments.
  function defineInputApi(field) {
    const { host, editor, libs } = field;
    const define = (name, descriptor) => Object.defineProperty(host, name, Object.assign({ configurable: true }, descriptor));
    // La valeur enregistrée (FieldCodec.toStored) ; pendant la Lecture, le texte affiché, comme un <input> en lecture seule.
    define('value', {
      get: () => (field.shown != null ? field.shown : FieldCodec.toStored(itemsOfDoc(editor.state.doc))),
      set: value => { field.shown = null; show(field, FieldCodec.itemsOf(value)); },
    });
    define('readOnly', {
      get: () => field.readOnly,
      set: flag => {
        field.readOnly = !!flag;
        // Sans le second argument, setEditable émet `update` : le brouillon passerait « modifié » à chaque passage en Lecture.
        editor.setEditable(!field.readOnly, false);
        if (field.readOnly) editor.view.dom.setAttribute('aria-readonly', 'true'); else editor.view.dom.removeAttribute('aria-readonly');
        host.classList.toggle('is-readonly', field.readOnly);
      },
    });
    // La Lecture écrit ici la valeur résolue : un texte, jamais lu comme un modèle (un « # » résolu n'y devient pas une bulle).
    host.showText = text => {
      field.shown = String(text == null ? '' : text);
      show(field, field.shown ? [{ text: field.shown }] : []);
    };
    // Le curseur à la fin, tout de suite (la commande focus de TipTap attend l'image suivante) ; un champ qui a déjà le focus ne bouge pas.
    host.focus = () => {
      const view = editor.view;
      if (!editor.isEditable || view.hasFocus()) return;
      view.dispatch(view.state.tr.setSelection(libs.TextSelection.atEnd(view.state.doc)));
      view.focus();
    };
    host.blur = () => { editor.view.dom.blur(); };
  }

  function emit(host, type, bubbles) { host.dispatchEvent(new Event(type, { bubbles: !!bubbles })); }

  // Transforme `host` en champ texte à bulles. `libs` : les classes de TipTap et de ProseMirror (Editor.loadLibraries) ; l'éditeur du document est déjà
  // prêt, la barre d'une bulle a besoin de ses réglages (Editor.init). Rend l'éditeur TipTap du champ.
  function attach(host, libs) {
    if (!host) return null;
    if (fields.has(host)) return fields.get(host).editor;
    // Une valeur posée sur l'élément avant sa transformation n'est pas perdue.
    const earlyValue = Object.prototype.hasOwnProperty.call(host, 'value') ? String(host.value || '') : '';
    const field = { host, libs, editor: null, panel: null, shown: null, readOnly: false };
    field.editor = new libs.TiptapEditor({
      element: host,
      extensions: extensions(libs, host),
      content: docJson([]),
      editorProps: editorProps(),
      enableInputRules: false,
      enablePasteRules: false,
      onUpdate: () => { field.shown = null; sync(field); emit(host, 'input', true); },
      onTransaction: () => sync(field),
      onBlur: () => {
        emit(host, 'blur');
        // Après le tour : une fenêtre ouverte par ce clic (condition, clé de correspondance...) tient une position, le champ n'y touche pas.
        setTimeout(() => {
          if (field.editor.isDestroyed || field.editor.view.hasFocus() || windowOpen()) return;
          tidy(field);
        }, 0);
      },
    });
    const dom = field.editor.view.dom;
    // `tiptap` et `ProseMirror` sont les classes du document : ses règles (page, marges, paragraphes) et celles des scripts qui cherchent « l'éditeur »
    // (`document.querySelector('.ProseMirror')`, dont le premier résultat serait sinon le nom du PDF, au-dessus de la page) n'ont rien à faire ici. ProseMirror
    // ne les remet pas : il ne retouche que les classes qui changent d'une mise à jour à l'autre.
    dom.classList.remove('tiptap', 'ProseMirror');
    dom.classList.add('pp-field-text');
    host.classList.add('pp-field-editor');
    mirrorLabels(host, dom);
    defineInputApi(field);
    field.panel = FloatingToolbars.attachVariableToolbar(field.editor, host);
    // Le bord du champ, hors du texte, place le curseur : un clic y viserait sinon rien.
    host.addEventListener('mousedown', event => {
      if (event.target !== host || !field.editor.isEditable) return;
      event.preventDefault();
      host.focus();
    });
    // Une lettre en cours de composition (accent, clavier asiatique) n'est pas encore dans le document : l'indication ne doit pas passer dessus.
    host.addEventListener('compositionstart', () => host.classList.remove('is-empty'));
    host.addEventListener('compositionend', () => sync(field));
    fields.set(host, field);
    if (earlyValue) host.value = earlyValue; else sync(field);
    return field.editor;
  }

  // L'éditeur TipTap d'un champ, null si l'élément n'en est pas un.
  function of(host) {
    const field = fields.get(host);
    return field ? field.editor : null;
  }

  // Les bulles dont la table ou la colonne n'existe plus (Editor.refreshVariableBadgeValidity) : rouges aussi dans les champs.
  function refreshBadgeValidity() {
    fields.forEach(field => Editor.markBadgeValidity(field.editor.view.dom));
  }

  return { attach, of, refreshBadgeValidity };
})();
