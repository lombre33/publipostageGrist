// Les champs texte à bulles : Objet, À, Cc, Cci du mode email et nom du fichier PDF. Chacun est un mini-éditeur TipTap d'une seule ligne, monté dans son
// élément de la page (un <div> qui garde son identifiant et ses classes), pour que les variables y soient les mêmes bulles bleues que dans le corps d'un
// modèle - avec leur barre (condition, autres attributs, boucle dans la phrase, liste, format) - et que la liste « # » les pose, avec les puces Date du
// jour, Heure actuelle, Email et Nom de l'utilisateur.
// Le reste de l'application les traite comme les <input> qu'ils remplacent, et js/main.js n'a presque pas changé : l'élément reçoit `value`, `readOnly`,
// `focus()` et `blur()` et émet `input` (une modification de la personne) et `blur` ; deux ajouts : `showText(texte)`, par lequel la Lecture y écrit la
// valeur résolue (jamais lue comme un modèle), et l'évènement `fieldenter`, Entrée quand la liste « # » n'est pas ouverte.
// Ce qui s'enregistre dans la colonne du modèle est FieldCodec.toStored : le texte brut d'avant tant que les bulles n'ont aucun réglage et qu'aucune
// puce n'est posée, du HTML sinon.
// Annuler et Rétablir (Ctrl + Z, Ctrl + Y, boutons de la barre) : chaque champ garde l'historique de sa frappe tant qu'il a le focus ; une fois quitté, sa séance
// laisse un repère dans l'historique du modèle (js/history-markers.js, domaine « fields ») qui rend sa valeur d'avant ou d'après (`snapshot`, `restore`, `settle`).
// « @ » y cite une fiche comme dans le corps d'un modèle (js/mention.js) : la pastille violette, la liste des fiches de toutes les tables, sa barre « Autres colonnes de la même fiche » pour lire l'Email d'une personne
// dans « À ». Pas dans le champ PJ, qui ne garde que des bulles de colonnes Pièces jointes. Une adresse tapée (marie@exemple.fr) n'ouvre pas la liste, et Échap la ferme en gardant le texte tapé.
// Un quatrième usage, hors de la page : le « Sinon afficher » d'un bloc de texte ou d'une valeur conditionnels (js/variable-condition.js). Le champ est monté dans la
// fenêtre de condition (`options.hostWindow`, `options.windowEl`), d'une ligne pour la valeur, de plusieurs pour le bloc (`options.multiline`, un paragraphe par ligne). Il reprend l'interface d'un
// <input> (`value`, `placeholder`, `disabled`, `maxLength`, évènement `input`) pour que la fenêtre le traite comme le champ de texte qu'il remplace, mais n'entre pas dans
// l'historique d'Annuler du modèle : la fenêtre est un brouillon, « Enregistrer » le pose d'un coup (une seule étape à annuler). La barre de ses variables s'ouvre devant
// la fenêtre et règle le zéro et les cases Oui / Non comme dans le document - le sinon s'y écrit.
const FieldEditor = (function () {
  const fields = new Map(); // élément du champ -> { host, editor, libs, panels, shown, readOnly, session }
  let watchingFocus = false;

  const { docJson, itemsOfDoc, linesDocJson, linesOfDoc } = (function () {
    // Le document d'un champ : un seul paragraphe (un par ligne pour un champ de plusieurs lignes), du texte, des bulles, des puces et des pastilles « @ » (les éléments
    // { text }, { badge }, { chip } ou { mention } de FieldCodec)

    // `mentions` : le champ a la pastille « @ » (pas le champ PJ) ; sans elle, une pastille d'une valeur enregistrée s'écrit comme le texte qu'elle est.
    function nodeJson(item, mentions) {
      if (FieldCodec.isText(item)) return { type: 'text', text: item.text };
      if (FieldCodec.isChip(item)) return { type: 'smartChip', attrs: Object.assign({}, item.chip) };
      if (FieldCodec.isMention(item)) return mentions ? { type: 'mention', attrs: Object.assign({}, item.mention) } : (item.mention.label ? { type: 'text', text: item.mention.label } : null);
      return { type: 'varBadge', attrs: Object.assign({}, item.badge) };
    }
    const paragraphJson = (items, mentions) => ({ type: 'paragraph', content: items.map(item => nodeJson(item, mentions)).filter(Boolean) });
    const docJson = (items, mentions) => ({ type: 'doc', content: [paragraphJson(items, mentions)] });
    const linesDocJson = (lines, mentions) => ({ type: 'doc', content: (lines.length ? lines : [[]]).map(items => paragraphJson(items, mentions)) });
    function itemsOfDoc(doc) {
      const items = [];
      doc.descendants(node => {
        if (node.isText) items.push({ text: node.text });
        else if (node.type.name === 'varBadge') items.push({ badge: Object.assign({}, node.attrs) });
        else if (node.type.name === 'smartChip') items.push({ chip: Object.assign({}, node.attrs) });
        // La pastille d'un champ ne garde que sa fiche, son réglage de date ou de nombre (`format`) et son nom : pas de mise en forme selon la ligne (`condStyle`), propre au document.
        else if (node.type.name === 'mention') items.push({ mention: Object.assign({ table: node.attrs.table, row: node.attrs.row, column: node.attrs.column, label: node.attrs.label }, node.attrs.format ? { format: node.attrs.format } : {}) });
        return true;
      });
      return items;
    }
    // Les lignes d'un champ de plusieurs lignes : les éléments de chaque paragraphe.
    function linesOfDoc(doc) {
      const lines = [];
      doc.forEach(paragraph => lines.push(itemsOfDoc(paragraph)));
      return lines;
    }
    return { docJson, itemsOfDoc, linesDocJson, linesOfDoc };
  })();

  // Le contenu d'un champ, d'une ligne ou de plusieurs : sa valeur enregistrée (FieldCodec) et son document ProseMirror. `content` : les éléments du champ d'une ligne, les
  // lignes de celui de plusieurs.
  const storedOf = field => (field.multiline ? FieldCodec.toStoredLines(linesOfDoc(field.editor.state.doc))
    : FieldCodec.toStored(itemsOfDoc(field.editor.state.doc), { keepSpaces: field.keepSpaces }));
  const contentOf = (field, stored) => (field.multiline ? FieldCodec.linesOf(stored) : FieldCodec.itemsOf(stored));
  const docOf = (field, content) => {
    const mentions = !!field.editor.schema.nodes.mention;
    return field.editor.schema.nodeFromJSON(field.multiline ? linesDocJson(content, mentions) : docJson(content, mentions));
  };
  // Les caractères que le champ porte, comme la limite d'un <input> les compte : le texte, et « #Clé » pour une variable.
  const lengthOf = (doc, multiline) => (multiline ? linesOfDoc(doc).map(FieldCodec.serializePlain).join('\n') : FieldCodec.serializePlain(itemsOfDoc(doc))).length;

  const { editorProps } = (function () {
    // Le clavier et le presse-papiers d'un champ : une seule ligne (un paragraphe par ligne pour un champ de plusieurs), du texte et des bulles, aucune mise en forme

    const BLOCK_TAGS = /^(address|article|aside|blockquote|br|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)$/i;
    const SKIPPED_TAGS = /^(script|style|template|head|title|meta|link)$/i;

    // Le HTML collé, réduit à ce qu'un champ garde : le texte, sur une ligne (un changement de bloc ou de ligne devient une espace), les bulles - une
    // bulle copiée dans un autre champ ou dans le document arrive avec ses réglages - et les puces. Un <template> est inerte : rien ne s'exécute ni ne se charge.
    // Un emoji collé comme une image (Teams, Outlook sur le web, Gmail : `<img alt="😀">`) redevient son caractère d'abord (js/emoji-paste.js), sans quoi il disparaîtrait.
    // `lines` : un champ de plusieurs lignes, où un changement de bloc ou de ligne est un changement de paragraphe.
    // `mentions` : le champ a la pastille « @ » ; sans elle, le nom de la fiche se colle comme du texte.
    function inlineHtml(html, lines, mentions) {
      const template = Dom.inertTemplate(EmojiPaste.textFromImages(html));
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
        if (node.matches('span.smart-chip')) {
          // Un smiley du document se colle ici comme le texte qu'il est : un champ n'a ni grille de choix ni de quoi changer une puce « Smiley », et sa valeur s'écrit en texte.
          const chip = EditorNodes.smartChipAttrsOf(node);
          out += chip.kind === EmojiChip.KIND ? FieldCodec.escapeText(chip.emoji) : EditorNodes.smartChipHtml(chip);
          return;
        }
        if (node.matches('span.mention-chip')) {
          // Une pastille « @ » du document ou d'un autre champ se colle avec sa fiche ; sa mise en forme selon la ligne reste au document.
          const attrs = Mention.fieldAttrsOf(node);
          out += mentions ? Mention.html(attrs) : FieldCodec.escapeText(attrs.label);
          return;
        }
        const block = BLOCK_TAGS.test(node.tagName);
        if (block) out += lines ? '</p><p>' : ' ';
        walk(node);
        if (block) out += lines ? '</p><p>' : ' ';
      });
      walk(template.content);
      return lines ? '<p>' + out + '</p>' : out;
    }
    // Le texte brut collé : sans retour à la ligne, ProseMirror en ferait un paragraphe par ligne (ce que veut un champ de plusieurs lignes).
    const flatText = text => text.replace(/\s*[\r\n]+\s*/g, ' ');
    // Le texte brut d'une sélection copiée : une bulle s'écrit « #Clé », comme dans la valeur enregistrée.
    const plainText = slice => FieldCodec.serializePlain(itemsOfDoc(slice.content));

    function editorProps(multiline, mentions) {
      return {
        // `role` est repris ici : TipTap le pose à la création seulement, et setEditable (la Lecture) remplace tous les attributs de la vue.
        attributes: { role: 'textbox', 'aria-multiline': multiline ? 'true' : 'false', autocapitalize: 'off', autocorrect: 'off' },
        transformPastedHTML: html => inlineHtml(html, multiline, mentions),
        transformPastedText: multiline ? text => text : flatText,
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

  // Les extensions d'un champ : le texte, un paragraphe unique (un ou plusieurs pour un champ de plusieurs lignes), la bulle de variable, la puce et la pastille « @ » (`options.mentions`), Entrée et les listes
  // « # » et « @ ». L'ordre compte : TipTap essaie la dernière extension rangée en premier, la liste ouverte garde donc Entrée, Tab, Échap et les flèches. Un champ de plusieurs
  // lignes garde Entrée pour changer de ligne ; `options.max` limite ce qu'il porte, comme le `maxLength` d'un <input>.
  function extensions(libs, host, options) {
    const { Extension, Node: TiptapNode, mergeAttributes, StarterKit, Document, Suggestion, Plugin, PluginKey } = libs;
    const press = () => { host.dispatchEvent(new CustomEvent('fieldenter')); return true; };
    const lengthLimit = options.limit ? Extension.create({
      name: 'fieldLimit',
      addProseMirrorPlugins() {
        // Une saisie qui dépasserait la limite est refusée en bloc, un collage comme une frappe ; on peut toujours effacer.
        return [new Plugin({
          filterTransaction(tr, state) {
            const max = options.limit();
            if (!tr.docChanged || !(max > 0)) return true;
            const now = lengthOf(tr.doc, options.multiline);
            return now <= max || now <= lengthOf(state.doc, options.multiline);
          },
        })];
      },
    }) : null;
    return [
      // Du texte, un paragraphe et l'historique Annuler / Rétablir : rien d'autre (ni gras, ni titres, ni listes, ni saut de ligne).
      StarterKit.configure({
        document: false, bold: false, blockquote: false, bulletList: false, code: false, codeBlock: false, dropcursor: false, gapcursor: false,
        hardBreak: false, heading: false, horizontalRule: false, italic: false, listItem: false, listKeymap: false, link: false, orderedList: false,
        strike: false, underline: false, trailingNode: false,
      }),
      Document.extend({ content: options.multiline ? 'paragraph+' : 'paragraph' }),
      EditorNodes.createVarBadgeNode(TiptapNode, mergeAttributes),
      EditorNodes.createSmartChipNode(TiptapNode, mergeAttributes),
      options.mentions ? Mention.createNode(TiptapNode, mergeAttributes) : null,
      options.multiline ? null : Extension.create({ name: 'fieldEnter', addKeyboardShortcuts: () => ({ Enter: press, 'Shift-Enter': press, 'Mod-Enter': press }) }),
      lengthLimit,
      Variables.createFieldExtension(Extension, Suggestion),
      options.mentions ? Mention.createExtension(Extension, Suggestion, PluginKey, { field: true }) : null,
    ].filter(Boolean);
  }

  // Une fenêtre de la bulle (FloatingToolbars.variableWindowOpen) ou la clé de correspondance tient une position de la bulle qu'elle règle : tant qu'elle
  // est ouverte, le champ ne remplace pas son document. La fenêtre qui porte le champ (le « Sinon afficher » de la fenêtre de condition) est ouverte tant qu'il vit :
  // elle ne compte pas.
  function windowOpen(field) {
    const link = document.getElementById('link-config-modal');
    return FloatingToolbars.variableWindowOpen(field && field.hostWindow) || !!(link && link.style.display === 'flex');
  }

  // Le champ sert encore tant qu'il a le focus, que la barre de l'une de ses bulles en a un champ de formulaire (décimales, devise) ou qu'une fenêtre de la bulle (condition, clé de correspondance) est ouverte : ce que ces
  // réglages changent appartient à la même séance, et le champ qui s'ouvre (`unfold`) reste ouvert.
  const hasTheFocus = field => field.editor.view.hasFocus() || field.panels.some(panel => panel.el.contains(document.activeElement));
  const inUse = field => hasTheFocus(field) || windowOpen(field);

  const { unfold, watchFold, keepAboveResult, watchResult } = (function () {
    // Le champ qui s'ouvre (classe `pp-field-opens` : Objet, À, Cc, Cci et PJ du mode email) : fermé, il tient sur une ligne de la largeur que la barre lui laisse (une vingtaine de caractères à 700 px) ; avec le curseur
    // - ou, en Lecture, après un clic sur la valeur résolue - et quand son texte ne tient plus, sa zone de saisie se pose juste SOUS la ligne des champs, sur toute la largeur du bandeau et sur plusieurs lignes, par-dessus
    // la barre d'outils (css/field-editor.css) : la ligne reste en place avec ses voisins, qui se cliquent comme avant, rien ne se décale, le document non plus. Le champ de la ligne montre alors le début de son texte
    // (`data-preview`). Ce que le champ porte reste UNE ligne : seul l'affichage passe à la ligne, l'Entrée ne coupe rien. Ce fichier ne pose que la classe `is-open`, l'aperçu et les mesures de l'ouverture ;
    // la place et les lignes sont dans la feuille de style.
    const MARGIN = 10;      // le retrait du bandeau (css/toolbar-v2.css : `#v2-email-fields-row`), à gauche et à droite
    const MAX_HEIGHT = 126; // cinq lignes de 22 px et leurs marges ; au-delà, la zone défile
    const GAP = 4;          // l'écart entre la ligne des champs et la zone de saisie ouverte (css/field-editor.css : `top`)
    // Deux façons de s'ouvrir : `pp-field-opens`, la zone de saisie sous la ligne (les champs d'une barre : Objet, À, Cc, Cci, PJ du mode email, nom du fichier PDF) ; `pp-field-grows`, le champ qui grandit sur place
    // (les champs d'une fenêtre : « Sinon afficher » d'une valeur, « Si aucune ligne » d'une boucle), où la fenêtre défile et où rien d'autre n'est à portée de la souris.
    const opens = field => field.host.classList.contains('pp-field-opens') || field.host.classList.contains('pp-field-grows');
    const underLine = field => field.host.classList.contains('pp-field-opens');

    // Les mesures de l'ouverture, prises sur le champ tel qu'il est dans sa ligne (fermé, ou déjà ouvert : il garde sa place) : de quoi aller du retrait gauche du bandeau à son retrait droit, la hauteur permise jusqu'au bas du cadre.
    function place(field) {
      const { host } = field;
      // La rangée dont le bandeau donne les retraits : celle des champs de l'email, ou la première ligne de la barre (nom du fichier PDF).
      const row = host.closest('#v2-email-fields-row, .bar-row') || host.parentElement;
      if (!row) return;
      const box = host.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      const set = (name, value) => host.style.setProperty(name, value);
      set('--pp-open-left', (rowBox.left + MARGIN - box.left - host.clientLeft) + 'px');
      set('--pp-open-width', Math.max(box.width, rowBox.width - 2 * MARGIN) + 'px');
      set('--pp-open-max', Math.max(60, Math.min(MAX_HEIGHT, window.innerHeight - box.bottom - GAP - 8)) + 'px');
    }

    // Le texte ne tient pas sur la ligne du champ fermé : il la dépasse, la ligne finit par « … ». Un texte qui tient n'ouvre rien : le champ reste de sa taille et ses voisins restent sous la souris.
    const clipped = field => {
      const line = field.editor.view.dom.firstElementChild;
      return !!line && line.scrollWidth > line.clientWidth + 1;
    };

    // Ouvre le champ tant qu'il sert (le curseur, la barre d'une bulle, une fenêtre de la bulle) ou qu'on le consulte en Lecture, et que son texte ne tient pas sur sa ligne ; une fois ouvert, il le reste tant qu'il sert (il ne
    // se referme pas au fil des effacements). Le referme sinon, le texte revenu à son début (le curseur l'avait fait défiler vers sa fin).
    function unfold(field) {
      if (!opens(field)) return;
      const { host } = field;
      const wasOpen = host.classList.contains('is-open');
      // Une fenêtre de variable ouverte ne garde ouvert que le champ qui l'était déjà (celui d'où elle vient) : elle ne vaut pas pour les autres champs de la barre, qui n'ont rien à y voir (`windowOpen` ne distingue pas l'origine).
      const open = (field.peek || (field.editor.isEditable && (hasTheFocus(field) || (wasOpen && windowOpen(field))))) && (wasOpen || clipped(field));
      if (open && !wasOpen && underLine(field)) place(field);
      // Le champ de la ligne, dont la zone de saisie est sous lui, montre le début du texte (css/field-editor.css : `::after`).
      if (underLine(field)) { if (open) host.dataset.preview = FieldCodec.serializePlain(itemsOfDoc(field.editor.state.doc)); else if (wasOpen) delete host.dataset.preview; }
      host.classList.toggle('is-open', !!open);
      if (!open && wasOpen) {
        // La ligne (fermée, c'est elle qui défile) et la zone de saisie : le curseur a fait défiler l'une ou l'autre ; le champ refermé montre le début du texte.
        const dom = field.editor.view.dom;
        dom.scrollLeft = 0;
        if (dom.firstElementChild) dom.firstElementChild.scrollLeft = 0;
      }
    }

    // Le résultat collé au bas d'une fenêtre (`.var-result`, en `position: sticky`) recouvre le bas de la zone qui défile, ce que ProseMirror, qui ne mesure que le cadre de la zone, ne sait pas : un champ qui grandit
    // sur place (`pp-field-grows`) ne doit pas laisser son curseur dessous. La zone remonte juste ce qu'il faut.
    function keepAboveResult(field) {
      if (!field.host.classList.contains('pp-field-grows') || !field.editor.view.hasFocus()) return;
      const body = field.host.closest('.pp-modal-body');
      const result = body && body.querySelector(':scope > .var-result');
      if (!result) return;
      const caret = field.editor.view.coordsAtPos(field.editor.state.selection.head);
      const floor = result.getBoundingClientRect().top - 6;
      if (caret.bottom > floor) body.scrollTop += caret.bottom - floor;
    }
    // Le résultat grandit lui aussi quand la phrase s'allonge (son aperçu est relu un instant après la frappe) : tant que le champ a le focus, une mesure de plus à chaque changement de sa hauteur.
    function watchResult(field, on) {
      if (field.resultWatch) { field.resultWatch.disconnect(); field.resultWatch = null; }
      if (!on || !field.host.classList.contains('pp-field-grows') || typeof ResizeObserver === 'undefined') return;
      const body = field.host.closest('.pp-modal-body');
      const result = body && body.querySelector(':scope > .var-result');
      if (!result) return;
      field.resultWatch = new ResizeObserver(() => keepAboveResult(field));
      field.resultWatch.observe(result);
    }

    // Un champ en Lecture ne prend pas le focus : un clic sur sa valeur l'ouvre (la lire en entier, la copier), un clic ailleurs, Échap ou le retour en édition la referme. Une fois par page : les champs
    // ouverts suivent le redimensionnement du cadre.
    let watching = false;
    function watchFold() {
      if (watching) return;
      watching = true;
      const close = except => fields.forEach(field => { if (field.peek && !(except && field.host.contains(except))) { field.peek = false; unfold(field); } });
      document.addEventListener('pointerdown', event => close(event.target), true);
      document.addEventListener('keydown', event => { if (event.key === 'Escape') close(null); }, true);
      window.addEventListener('resize', () => fields.forEach(field => { if (field.host.classList.contains('is-open') && underLine(field)) place(field); }));
    }
    return { unfold, watchFold, keepAboveResult, watchResult };
  })();

  const { show, tidy, sync } = (function () {
    // Ce que le champ affiche : un autre document, le texte résolu de la Lecture, l'état « vide »

    // Pose `class="is-empty"` sur l'élément quand le champ est vide : c'est elle qui montre son indication (css/field-editor.css), lue dans l'attribut
    // `placeholder` de l'élément - donc dans la langue de l'interface, sans transaction pour la rafraîchir.
    function sync(field) {
      if (field.editor) field.host.classList.toggle('is-empty', field.editor.isEmpty);
    }
    // Remplace le document par `items` sans passer par une transaction : rien n'est une modification de la personne (ni `input`, ni brouillon « modifié »)
    // et l'historique Annuler repart de zéro - un autre modèle ne s'annule pas dans celui-ci.
    function show(field, content) {
      const { editor, libs } = field;
      const view = editor.view;
      const doc = docOf(field, content);
      view.updateState(libs.EditorState.create({ schema: editor.schema, doc, plugins: view.state.plugins }));
      // La barre d'une bulle (ou d'une puce « Heure actuelle ») du document précédent n'a plus d'objet.
      field.panels.forEach(panel => panel.hide());
      Editor.markBadgeValidity(view.dom, editor);
      sync(field);
    }
    // Une clé tapée en entier (« #TpProjet.Nom ») vaut une bulle dans la valeur enregistrée (FieldCodec.toStored) : le champ la montre alors en bulle, comme
    // elle sera relue.
    function normalize(field) {
      const { editor } = field;
      if (field.shown != null || !editor.isEditable) return;
      // Un champ qui n'accepte que des variables (le champ PJ, `data-variables-kind`) ne garde pas le texte tapé à côté : seules ses bulles restent, le texte part au départ du curseur.
      const content = contentOf(field, storedOf(field));
      const wanted = docOf(field, field.variablesKind && !field.multiline ? content.filter(item => !FieldCodec.isText(item)) : content);
      if (!wanted.eq(editor.state.doc)) show(field, field.multiline ? linesOfDoc(wanted) : itemsOfDoc(wanted));
    }
    // Au départ du curseur : une bulle sélectionnée ne reste pas la sélection (la première touche tapée au retour la remplacerait), et les clés tapées
    // en entier deviennent des bulles. Pas quand le focus est passé dans la barre de la bulle (son nombre de décimales, sa devise : de vrais champs de
    // formulaire) : elle règle cette bulle, et la barre se refermerait avec la sélection.
    function tidy(field) {
      const { editor, libs } = field;
      if (field.panels.some(panel => panel.el.contains(document.activeElement))) return;
      const { selection } = editor.state;
      if (selection.node) editor.view.dispatch(editor.state.tr.setSelection(libs.TextSelection.create(editor.state.doc, selection.to)));
      normalize(field);
    }
    return { show, tidy, sync };
  })();

  const { snapshot, restore, open, settle } = (function () {
    // Les champs dans l'historique d'Annuler / Rétablir du modèle (js/history-markers.js, domaine « fields ») : ils ont chacun l'historique de leur frappe, qui ne sert que le temps du focus ; une fois le champ quitté,
    // Ctrl + Z défaisait le dernier mot du corps et laissait l'objet ou le nom du PDF tel quel. Une séance - du focus du champ à son départ - laisse UN repère dans l'historique du corps : sa valeur d'avant et sa valeur d'après.

    // La valeur enregistrée de chaque champ modifiable, par l'identifiant de son élément. En Lecture un champ montre le texte résolu, jamais ce qu'un repère doit garder : il est laissé de côté.
    function snapshot() {
      const state = {};
      fields.forEach(field => { if (field.shown == null && field.host.id && !field.hostWindow) state[field.host.id] = field.host.value; });
      return state;
    }

    // Rend aux champs les valeurs de `next` que le geste a changées (`prev` : l'état d'avant ce retour). Ce n'est pas une frappe : l'évènement `input` marque le brouillon « modifié » (l'enregistrement automatique écrit la valeur
    // rendue) et rafraîchit la jauge de l'email ; `fieldrestored` laisse js/main.js montrer ou replier le champ du nom du PDF et celui de la Cci.
    function restore(next, prev) {
      let changed = false;
      fields.forEach(field => {
        const id = field.host.id;
        if (field.hostWindow || field.shown != null || !(id in next) || next[id] === prev[id] || field.host.value === next[id]) return;
        field.host.value = next[id];
        emit(field.host, 'input', true);
        emit(field.host, 'fieldrestored');
        changed = true;
      });
      return changed;
    }

    // Le focus du champ ouvre la séance (une seule à la fois : le retour du focus après la barre ou la fenêtre la continue). Pas en Lecture : le champ y montre le texte résolu, rien ne s'y modifie.
    function open(field) {
      // Le champ d'une fenêtre est un brouillon : la fenêtre pose son contenu en une fois à « Enregistrer », rien ne se défait champ par champ dans l'historique du modèle.
      if (field.hostWindow || field.session || !field.editor.isEditable || field.shown != null) return;
      field.session = HistoryMarkers.begin('fields');
    }

    // Le départ du champ la ferme, et pose le repère si la valeur a changé. Sans argument : tous les champs, avant un Annuler ou un Rétablir (le repère d'une frappe encore ouverte doit être dans l'historique avant que
    // l'historique ne soit défait).
    function settle(field) {
      if (!field) { fields.forEach(settle); return; }
      const session = field.session;
      if (!session || inUse(field)) return;
      field.session = null;
      session.commit({ alone: true });
    }

    return { snapshot, restore, open, settle };
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
      get: () => (field.shown != null ? field.shown : storedOf(field)),
      set: value => { field.shown = null; show(field, contentOf(field, value)); },
    });
    define('readOnly', {
      get: () => field.readOnly,
      set: flag => {
        field.readOnly = !!flag;
        // Sans le second argument, setEditable émet `update` : le brouillon passerait « modifié » à chaque passage en Lecture.
        editor.setEditable(!field.readOnly, false);
        // Le retour en édition referme la consultation de la Lecture.
        field.peek = false;
        unfold(field);
        if (field.readOnly) editor.view.dom.setAttribute('aria-readonly', 'true'); else editor.view.dom.removeAttribute('aria-readonly');
        host.classList.toggle('is-readonly', field.readOnly);
      },
    });
    // Un champ porté par une fenêtre se traite comme le <input> qu'il remplace : l'indication, le grisé (la fenêtre le grise tant que la condition n'est pas complète) et la limite.
    if (field.hostWindow) {
      define('placeholder', { get: () => host.getAttribute('placeholder') || '', set: text => host.setAttribute('placeholder', text) });
      define('disabled', {
        get: () => !!field.disabled,
        set: flag => {
          field.disabled = !!flag;
          host.readOnly = !!flag;
          host.classList.toggle('is-disabled', !!flag);
          if (flag) host.setAttribute('aria-disabled', 'true'); else host.removeAttribute('aria-disabled');
        },
      });
      define('maxLength', { get: () => (field.limit ? field.limit() : -1), set: max => { field.limit = () => max; } });
    }
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
  // prêt, la barre d'une bulle a besoin de ses réglages (Editor.init). Rend l'éditeur TipTap du champ. `options` (facultatif) : un champ porté par une fenêtre
  // - { hostWindow: 'condition', windowEl: l'élément de la fenêtre, multiline: plusieurs lignes, keepSpaces: les espaces des deux bouts comptent, limit: () => le nombre
  // de caractères permis } -, voir l'en-tête.
  function attach(host, libs, options) {
    if (!host) return null;
    if (fields.has(host)) return fields.get(host).editor;
    const opts = options || {};
    // Une valeur posée sur l'élément avant sa transformation n'est pas perdue.
    const earlyValue = Object.prototype.hasOwnProperty.call(host, 'value') ? String(host.value || '') : '';
    const field = {
      host, libs, editor: null, panels: [], shown: null, readOnly: false, peek: false, session: null,
      multiline: !!opts.multiline, keepSpaces: !!opts.keepSpaces, hostWindow: opts.hostWindow || null, limit: opts.limit || null,
      variablesKind: (host.dataset && host.dataset.variablesKind) || '',
    };
    // La pastille « @ » : dans tous les champs sauf celui des pièces jointes, qui ne cite que des colonnes Pièces jointes.
    field.mentions = !field.variablesKind;
    field.editor = new libs.TiptapEditor({
      element: host,
      extensions: extensions(libs, host, { multiline: field.multiline, mentions: field.mentions, limit: field.hostWindow ? () => (field.limit ? field.limit() : 0) : null }),
      content: field.multiline ? linesDocJson([[]]) : docJson([]),
      editorProps: editorProps(field.multiline, field.mentions),
      enableInputRules: false,
      enablePasteRules: false,
      onUpdate: () => { field.shown = null; sync(field); unfold(field); keepAboveResult(field); emit(host, 'input', true); },
      onSelectionUpdate: () => keepAboveResult(field),
      // Une pastille « @ » posée ou collée prend son état du moment (nom à jour, info-bulle, rouge quand sa fiche n'existe plus) : js/mention.js la repeint, comme dans le document.
      onTransaction: () => { sync(field); if (field.mentions) Mention.markChips(field.editor.view.dom, { field: true }); },
      onFocus: () => { open(field); unfold(field); watchResult(field, true); },
      onBlur: () => {
        emit(host, 'blur');
        watchResult(field, false);
        // Après le tour : une fenêtre ouverte par ce clic (condition, clé de correspondance...) tient une position, le champ n'y touche pas.
        setTimeout(() => {
          if (field.editor.isDestroyed) return;
          if (!field.editor.view.hasFocus() && !windowOpen(field)) tidy(field);
          settle(field);
          unfold(field);
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
    // La barre d'une bulle du « Sinon afficher » d'une fenêtre passe devant elle et ne se cache pas avec elle (FloatingToolbars.createVariableToolbar).
    const barExtra = field.hostWindow ? { sinon: true, hostWindow: field.hostWindow, windowEl: opts.windowEl } : undefined;
    field.panels = [FloatingToolbars.attachVariableToolbar(field.editor, host, barExtra), FloatingToolbars.attachTimeChipToolbar(field.editor, host, barExtra)];
    if (field.mentions) field.panels.push(FloatingToolbars.attachMentionToolbar(field.editor, host, barExtra));
    host.classList.toggle('is-multiline', field.multiline);
    // En Lecture (champ non modifiable), un clic sur la valeur résolue ouvre le champ pour la lire en entier.
    host.addEventListener('pointerdown', () => {
      if (field.editor.isEditable || field.peek) return;
      field.peek = true;
      unfold(field);
    });
    watchFold();
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
    // Le focus qui passe ailleurs - le corps, une autre ligne de la barre - ferme la séance du champ quitté, même quand le départ n'a pas fait de `blur` utile (le retour d'une fenêtre fermée).
    if (!watchingFocus) { watchingFocus = true; document.addEventListener('focusin', () => { settle(); fields.forEach(unfold); }, true); }
    if (earlyValue) host.value = earlyValue; else sync(field);
    return field.editor;
  }

  // L'éditeur TipTap d'un champ, null si l'élément n'en est pas un.
  function fieldEditorOf(host) {
    const field = fields.get(host);
    return field ? field.editor : null;
  }

  // Les bulles dont la table ou la colonne n'existe plus, ou dont la table n'a plus de lien avec la page (Editor.refreshVariableBadgeValidity) :
  // rouges ou orange aussi dans les champs.
  function refreshBadgeValidity() {
    fields.forEach(field => Editor.markBadgeValidity(field.editor.view.dom, field.editor));
  }

  // Les barres des bulles des champs relisent leurs boutons (Editor.refreshLinkState) : une transaction vide, chaque barre se relit à toutes.
  function resyncBars() {
    fields.forEach(field => field.editor.view.dispatch(field.editor.state.tr));
  }

  // Le DOM de chaque champ à bulles : Editor.badgeTables y lit les tables dont une bulle attend le verdict de son lien (Variables.scanLinkMisses).
  function badgeRoots() {
    return Array.from(fields.values(), field => field.editor.view.dom);
  }

  // Cache les barres des bulles d'un champ (la fenêtre qui le porte se ferme alors que l'une de ses bulles est choisie).
  function hidePanels(host) {
    const field = fields.get(host);
    if (field) field.panels.forEach(panel => panel.hide());
  }

  return { attach, of: fieldEditorOf, hidePanels, refreshBadgeValidity, resyncBars, badgeRoots, snapshot, restore, settle };
})();
