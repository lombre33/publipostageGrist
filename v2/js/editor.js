// Éditeur V2 — TipTap/ProseMirror (remplace Quill).
// Script classique (pas type="module") : TipTap/ProseMirror chargés via
// import() dynamique dans init(), pour garder le partage de portée globale
// avec GristAPI/Templates/ReaderMode. Les nœuds/extensions personnalisés
// (classes TipTap disponibles seulement après cet import) sont construits
// par des fonctions createXxx(...) plutôt que déclarés en haut de fichier.
const Editor = (function () {
  let editor = null;
  let floatingUi = null;
  // Nécessaire pour recréer une NodeSelection après tr.setNodeMarkup()
  // (remplace le nœud) - cf. patchNodeAndReselect.
  let NodeSelectionClass = null;
  let currentAlign = 'left';
  let TextSelectionClass = null;

  // `null` = édition normale ; sinon édition d'en-tête/pied (même éditeur,
  // contenu affiché échangé via setContent).
  let hfMode = null; // { zone: 'header'|'footer', variant: 'default'|'first' }
  let mainDocSnapshot = null;
  function emptyHeaderFooterData() {
    return { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  }
  let headerFooterDraft = emptyHeaderFooterData();

  // Partagé par updateAttrs/updateSelectedImage/updateSelectedBadge :
  // setNodeMarkup() remplace le nœud, donc la NodeSelection doit être
  // recréée explicitement dessus (sinon retombe en curseur texte).
  function patchNodeAndReselect(ed, pos, newAttrs) {
    const { state, view } = ed;
    const tr = state.tr.setNodeMarkup(pos, undefined, newAttrs);
    if (NodeSelectionClass) tr.setSelection(NodeSelectionClass.create(tr.doc, pos));
    view.dispatch(tr);
  }

  // Taille max d'une image en en-tête/pied (convention, pas une limite technique).
  const HF_MAX_IMAGE_HEIGHT_PX = 60;
  const HF_MAX_IMAGE_WIDTH_PX = 300;
  function clampWidthForHfMaxSize(widthPx, naturalWidth, naturalHeight) {
    if (!hfMode || !naturalWidth || !naturalHeight) return widthPx;
    const maxWidthFromHeight = HF_MAX_IMAGE_HEIGHT_PX * (naturalWidth / naturalHeight);
    const maxWidthPx = Math.min(HF_MAX_IMAGE_WIDTH_PX, maxWidthFromHeight);
    return Math.min(widthPx, maxWidthPx);
  }
  function probeImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve({ naturalWidth: probe.naturalWidth, naturalHeight: probe.naturalHeight });
      probe.onerror = reject;
      probe.src = url;
    });
  }
  // Partagée par le bouton toolbar et le collage presse-papiers (src = URL ou data URI).
  async function insertImageAtDefaultSize(src) {
    let width = 320;
    if (hfMode) {
      try {
        const dims = await probeImageDimensions(src);
        width = clampWidthForHfMaxSize(width, dims.naturalWidth, dims.naturalHeight);
      } catch (e) { /* repli sur 320px */ }
    }
    editor.chain().focus().insertImage({ src, alt: 'Image', width: Math.round(width) + 'px' }).run();
  }

  // Menu listant les colonnes Attachments : insère un placeholder lié à la
  // #Variable (résolu en vraie image en mode Lecture/export).
  let imageVarPickerBox = null;
  function ensureImageVarPickerBox() {
    if (imageVarPickerBox) return imageVarPickerBox;
    imageVarPickerBox = document.createElement('div');
    imageVarPickerBox.id = 'v2-image-var-picker';
    imageVarPickerBox.style.display = 'none';
    document.body.appendChild(imageVarPickerBox);
    document.addEventListener('mousedown', event => {
      if (imageVarPickerBox.style.display !== 'none' && !imageVarPickerBox.contains(event.target)) {
        imageVarPickerBox.style.display = 'none';
      }
    });
    return imageVarPickerBox;
  }
  async function openImageVariablePicker(anchorEl) {
    const box = ensureImageVarPickerBox();
    await GristAPI.refreshSchema().catch(() => {});
    const candidates = GristAPI.getAllVariables().filter(v => GristAPI.getColumnType(v.table, v.column) === 'Attachments');
    box.innerHTML = '';
    if (!candidates.length) {
      const empty = document.createElement('div');
      empty.className = 'v2-image-var-picker-empty';
      empty.textContent = I18n.t('imageVarPicker.empty');
      box.appendChild(empty);
    } else {
      candidates.forEach(v => {
        const item = document.createElement('div');
        item.className = 'v2-image-var-picker-item';
        item.textContent = v.key;
        // mousedown (pas click) + preventDefault : évite que le blur du
        // focus éditeur en cours (déclenché par ce clic) ne referme/perturbe
        // la sélection avant que insertImage n'ait pu s'exécuter - même
        // précaution que ac-item (variables.js:render, mousedown+preventDefault).
        item.addEventListener('mousedown', event => {
          event.preventDefault();
          editor.chain().focus().insertImage({ varTable: v.table, varColumn: v.column, varKey: v.key, width: '320px', height: '240px' }).run();
          box.style.display = 'none';
        });
        box.appendChild(item);
      });
    }
    const rect = anchorEl.getBoundingClientRect();
    box.style.position = 'absolute';
    box.style.left = (rect.left + window.scrollX) + 'px';
    box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    box.style.display = 'block';
  }

  // Popup d'édition d'une note de bas de page. Une seule active à la fois :
  // ouvrir une note en valide une autre déjà ouverte (commitFootnotePopup).
  // Se ferme UNIQUEMENT via une action explicite (OK/Supprimer/Échap/autre
  // note) - jamais au clic extérieur, source de 3 régressions successives.
  let footnotePopupBox = null;
  let footnotePopupPos = null;
  function ensureFootnotePopupBox() {
    if (footnotePopupBox) return footnotePopupBox;
    footnotePopupBox = document.createElement('div');
    footnotePopupBox.id = 'v2-footnote-popup';
    footnotePopupBox.style.display = 'none';
    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.placeholder = I18n.t('footnotePopup.placeholder');
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); commitFootnotePopup(); }
    });
    footnotePopupBox.appendChild(textarea);
    const actions = document.createElement('div');
    actions.className = 'v2-footnote-popup-actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'v2-footnote-popup-delete';
    delBtn.textContent = I18n.t('footnotePopup.delete');
    delBtn.addEventListener('mousedown', event => { event.preventDefault(); deleteFootnotePopupNode(); });
    actions.appendChild(delBtn);
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'v2-footnote-popup-ok';
    okBtn.textContent = I18n.t('footnotePopup.ok');
    okBtn.addEventListener('mousedown', event => { event.preventDefault(); commitFootnotePopup(); });
    actions.appendChild(okBtn);
    footnotePopupBox.appendChild(actions);
    footnotePopupBox._textarea = textarea;
    document.body.appendChild(footnotePopupBox);
    return footnotePopupBox;
  }
  function commitFootnotePopup() {
    const box = footnotePopupBox;
    if (!box || box.style.display === 'none') return;
    const pos = footnotePopupPos;
    footnotePopupPos = null;
    box.style.display = 'none';
    if (pos == null) return;
    const current = editor.state.doc.nodeAt(pos);
    if (!current || current.type.name !== 'footnoteRef') return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, current.attrs, { text: box._textarea.value }));
    editor.view.dispatch(tr);
  }
  // Retire le nœud footnoteRef lui-même (pas seulement son texte) - lu via
  // getPos()-équivalent au moment du clic (footnotePopupPos), jamais une
  // position mise en cache d'avant : le document a pu changer entre
  // l'ouverture et ce clic (texte tapé ailleurs, etc.).
  function deleteFootnotePopupNode() {
    const box = footnotePopupBox;
    const pos = footnotePopupPos;
    footnotePopupPos = null;
    if (box) box.style.display = 'none';
    if (pos == null) return;
    const current = editor.state.doc.nodeAt(pos);
    if (!current || current.type.name !== 'footnoteRef') return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + current.nodeSize));
  }
  function openFootnoteEditorAt(pos) {
    const box = ensureFootnotePopupBox();
    if (footnotePopupPos != null && footnotePopupPos !== pos) commitFootnotePopup();
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'footnoteRef') {
      console.warn('[Editor] openFootnoteEditorAt(' + pos + ') : aucun nœud footnoteRef à cette position (trouvé : ' + (node && node.type && node.type.name) + ') - popup non ouverte.');
      return;
    }
    footnotePopupPos = pos;
    box._textarea.value = node.attrs.text || '';
    // Bornée à la zone visible (jamais hors champ) ; toute erreur de mesure
    // retombe sur un positionnement générique plutôt que de bloquer l'ouverture.
    try {
      const dom = editor.view.nodeDOM(pos);
      const anchor = (dom && dom.getBoundingClientRect) ? dom : editor.view.dom;
      const rect = anchor.getBoundingClientRect();
      const boxWidth = 240; // cf. #v2-footnote-popup { width: 240px } (editor-v2.css)
      const boxHeightEstimate = 130;
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 4;
      // Math.max garantit maxLeft/Top >= minLeft/Top même dans un panneau
      // très étroit, pour ne jamais clamper à une position pire que l'origine.
      const minLeft = window.scrollX + 4;
      const minTop = window.scrollY + 4;
      const maxLeft = Math.max(minLeft, window.scrollX + window.innerWidth - boxWidth - 8);
      const maxTop = Math.max(minTop, window.scrollY + window.innerHeight - boxHeightEstimate - 8);
      left = Math.min(Math.max(left, minLeft), maxLeft);
      top = Math.min(Math.max(top, minTop), maxTop);
      box.style.position = 'absolute';
      box.style.left = left + 'px';
      box.style.top = top + 'px';
    } catch (e) {
      console.warn('[Editor] positionnement du popup de note échoué, repli générique :', e);
      box.style.position = 'fixed';
      box.style.left = '40%';
      box.style.top = '30%';
    }
    box.style.display = 'block';
    // setTimeout(...,0), pas un appel synchrone : le mousedown déclencheur
    // fait reprendre le focus sur .tiptap par ProseMirror juste après le
    // retour de cette fonction - un focus() synchrone ici serait écrasé.
    setTimeout(() => { box._textarea.focus(); }, 0);
  }

  // Image collée depuis le presse-papiers, convertie en data URI (forme
  // requise par pdf-export.js) avant insertion.
  function readFileAsDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader a échoué'));
      reader.readAsDataURL(file);
    });
  }
  async function pasteImageFile(file) {
    let dataUri;
    try {
      dataUri = await readFileAsDataUri(file);
    } catch (e) {
      console.warn('[Editor] image collée illisible :', e);
      return;
    }
    await insertImageAtDefaultSize(dataUri);
  }

  // Touche de déclenchement configurable (panneau Réglages) - lue
  // directement depuis localStorage, même clé que v2/js/variables.js (pas de
  // dépendance de module croisée pour une simple lecture, cf. son en-tête).
  function varBadgeTriggerChar() {
    try {
      const v = localStorage.getItem('pp_trigger_char');
      return (v && v.length === 1) ? v : '#';
    } catch (e) { return '#'; }
  }

  // Badge de variable #Variable — nœud "atome" en ligne, non éditable au
  // caractère près (contenteditable="false"), même forme HTML que l'éditeur
  // V1 (js/editor.js:VarBadgeBlot) pour que reader-mode.js/pdf-export.js
  // le reconnaissent sans changement :
  // <span class="var-badge" data-table data-column data-key>.
  function createVarBadgeNode(Node, mergeAttributes) {
    return Node.create({
      name: 'varBadge',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        // renderHTML: () => ({}) sur chaque attribut : sans ça, TipTap rend
        // CHAQUE attribut par défaut comme un attribut HTML bare
        // (table="..."/column="..."/key="...") EN PLUS des data-table/
        // data-column/data-key posés à la main dans renderHTML ci-dessous -
        // un doublon constaté en conditions réelles. Ces attributs ne
        // doivent exister QUE dans le JSON interne du nœud ProseMirror.
        const noBareRender = { default: null, renderHTML: () => ({}) };
        // `format` : { type:'number', style, decimals, currency, words } ou
        // { type:'date', preset } - choisi via la barre flottante (cf.
        // wireVariableFloatingToolbar), `null` tant que l'utilisateur n'a
        // rien réglé (comportement historique, String(val) brut).
        return { table: noBareRender, column: noBareRender, key: noBareRender, format: noBareRender };
      },
      parseHTML() {
        return [{
          tag: 'span.var-badge',
          getAttrs: el => {
            let format = null;
            const raw = el.getAttribute('data-format');
            if (raw) { try { format = JSON.parse(raw); } catch (e) { format = null; } }
            return { table: el.getAttribute('data-table'), column: el.getAttribute('data-column'), key: el.getAttribute('data-key'), format };
          },
        }];
      },
      renderHTML({ HTMLAttributes, node }) {
        const attrs = mergeAttributes(HTMLAttributes, {
          class: 'var-badge', contenteditable: 'false',
          'data-table': node.attrs.table, 'data-column': node.attrs.column, 'data-key': node.attrs.key,
        });
        if (node.attrs.format) attrs['data-format'] = JSON.stringify(node.attrs.format);
        // Préfixe décoratif régénéré à chaque rendu (jamais stocké) : suit la
        // touche de déclenchement configurée, rétroactif sans migration.
        return ['span', attrs, varBadgeTriggerChar() + node.attrs.key];
      },
    });
  }

  // Badge de numéro de page - même schéma que VarBadge. Le libellé rendu
  // dans l'éditeur n'est qu'un espace réservé visuel (format choisi),
  // résolu en vrai numéro seulement à l'export/l'aperçu paginé.
  function createPageNumberBadgeNode(Node, mergeAttributes) {
    const LABELS = { n: '#', 'page-n': 'Page #', 'n-slash-total': '#/#' };
    return Node.create({
      name: 'pageNumberBadge',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return { format: { default: 'n', renderHTML: () => ({}) } };
      },
      parseHTML() {
        return [{ tag: 'span.page-number-badge', getAttrs: el => ({ format: el.getAttribute('data-format') || 'n' }) }];
      },
      renderHTML({ node }) {
        const attrs = mergeAttributes({ class: 'page-number-badge', contenteditable: 'false', 'data-format': node.attrs.format });
        return ['span', attrs, LABELS[node.attrs.format] || LABELS.n];
      },
      addCommands() {
        return { insertPageNumberBadge: format => ({ chain }) => chain().insertContent({ type: this.name, attrs: { format } }).run() };
      },
    });
  }

  // Chip intelligent - date/heure/email, même schéma que VarBadge. Jamais
  // de vraie valeur dans l'éditeur (résolu en mode Lecture/export, cf.
  // js/reader-mode.js:resolveSmartChips) - vert plutôt que bleu pour
  // signaler "valeur calculée, pas une colonne Grist".
  function createSmartChipNode(Node, mergeAttributes) {
    const KIND_I18N_KEYS = { date: 'chips.date', time: 'chips.time', email: 'chips.email' };
    function labelFor(kind) {
      const key = KIND_I18N_KEYS[kind];
      return key ? I18n.t(key) : '?';
    }
    return Node.create({
      name: 'smartChip',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return { kind: { default: 'date', renderHTML: () => ({}) } };
      },
      parseHTML() {
        return [{ tag: 'span.smart-chip', getAttrs: el => ({ kind: el.getAttribute('data-chip-kind') || 'date' }) }];
      },
      renderHTML({ node }) {
        const attrs = mergeAttributes({ class: 'smart-chip', contenteditable: 'false', 'data-chip-kind': node.attrs.kind });
        return ['span', attrs, labelFor(node.attrs.kind)];
      },
    });
  }

  // Note de bas de page - nœud atome portant le texte en attribut (`text`,
  // texte brut). Numérotation continue sur tout le document via le seul
  // compteur CSS `footnote-ref` (cf. editor-v2.css), jamais compté en JS.
  function createFootnoteRefNode(Node, mergeAttributes) {
    return Node.create({
      name: 'footnoteRef',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return {
          id: { default: null, renderHTML: () => ({}) },
          text: { default: '', renderHTML: () => ({}) },
        };
      },
      parseHTML() {
        return [{ tag: 'sup.footnote-ref-marker', getAttrs: el => ({ id: el.getAttribute('data-note-id'), text: el.getAttribute('data-note-text') || '' }) }];
      },
      renderHTML({ node }) {
        const attrs = mergeAttributes({
          class: 'footnote-ref-marker', contenteditable: 'false',
          'data-note-id': node.attrs.id, 'data-note-text': node.attrs.text,
        });
        // Contenu texte vide à dessein : le chiffre vient de
        // `::before { content: counter(footnote-ref) }` (editor-v2.css).
        return ['sup', attrs];
      },
      addNodeView() {
        return ({ getPos }) => {
          const marker = document.createElement('sup');
          marker.className = 'footnote-ref-marker';
          marker.addEventListener('mousedown', event => {
            event.preventDefault();
            // PAS de stopPropagation() : ProseMirror sélectionne ce nœud via
            // un gestionnaire posé sur .tiptap (un ancêtre) - la bloquer
            // casserait la sélection au clic donc la suppression au clavier.
            const pos = getPos();
            if (typeof pos === 'number') openFootnoteEditorAt(pos);
          });
          return { dom: marker };
        };
      },
    });
  }

  // Augmente la marque 'textStyle' via addGlobalAttributes (comme
  // FontFamily/Color officiels) - 'textStyle' doit être enregistrée à part
  // (TextStyle, câblée dans init()), sinon ProseMirror lève une erreur.
  function createFontSizeExtension(Extension) {
    return Extension.create({
      name: 'fontSize',
      addGlobalAttributes() {
        return [{
          types: ['textStyle'],
          attributes: {
            fontSize: {
              default: null,
              parseHTML: el => el.style.fontSize || null,
              renderHTML: attrs => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
            },
          },
        }];
      },
      addCommands() {
        return { setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run() };
      },
    });
  }

  // Couleur de police/surlignage - même schéma que FontSize.
  function createTextColorExtension(Extension) {
    return Extension.create({
      name: 'textColor',
      addGlobalAttributes() {
        return [{
          types: ['textStyle'],
          attributes: {
            color: {
              default: null,
              parseHTML: el => el.style.color || null,
              renderHTML: attrs => (attrs.color ? { style: `color: ${attrs.color}` } : {}),
            },
          },
        }];
      },
      addCommands() {
        return {
          setTextColor: color => ({ chain }) => chain().setMark('textStyle', { color }).run(),
          unsetTextColor: () => ({ chain }) => chain().setMark('textStyle', { color: null }).run(),
        };
      },
    });
  }
  function createHighlightExtension(Extension) {
    return Extension.create({
      name: 'highlightColor',
      addGlobalAttributes() {
        return [{
          types: ['textStyle'],
          attributes: {
            backgroundColor: {
              default: null,
              parseHTML: el => el.style.backgroundColor || null,
              renderHTML: attrs => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
            },
          },
        }];
      },
      addCommands() {
        return {
          setHighlight: backgroundColor => ({ chain }) => chain().setMark('textStyle', { backgroundColor }).run(),
          unsetHighlight: () => ({ chain }) => chain().setMark('textStyle', { backgroundColor: null }).run(),
        };
      },
    });
  }

  // Style de puce - augmente 'bulletList' (StarterKit) plutôt que 'textStyle'.
  function createBulletStyleExtension(Extension) {
    return Extension.create({
      name: 'bulletStyle',
      addGlobalAttributes() {
        return [{
          types: ['bulletList'],
          attributes: {
            bulletStyle: {
              default: 'disc',
              parseHTML: el => el.getAttribute('data-bullet-style') || 'disc',
              renderHTML: attrs => (attrs.bulletStyle && attrs.bulletStyle !== 'disc' ? { 'data-bullet-style': attrs.bulletStyle } : {}),
            },
          },
        }];
      },
    });
  }

  // Style de numérotation - augmente 'orderedList'.
  function createOrderedListStyleExtension(Extension) {
    return Extension.create({
      name: 'orderedListStyle',
      addGlobalAttributes() {
        return [{
          types: ['orderedList'],
          attributes: {
            numberStyle: {
              default: 'decimal',
              parseHTML: el => el.getAttribute('data-number-style') || 'decimal',
              renderHTML: attrs => (attrs.numberStyle && attrs.numberStyle !== 'decimal' ? { 'data-number-style': attrs.numberStyle } : {}),
            },
          },
        }];
      },
    });
  }

  // Style de case à cocher - augmente 'taskList'. Rendu réel en CSS
  // (data-tasklist-style), cette extension ne fait que sérialiser le choix.
  function createTaskListStyleExtension(Extension) {
    return Extension.create({
      name: 'taskListStyle',
      addGlobalAttributes() {
        return [{
          types: ['taskList'],
          attributes: {
            taskListStyle: {
              default: 'accentStrike',
              parseHTML: el => el.getAttribute('data-tasklist-style') || 'accentStrike',
              renderHTML: attrs => (attrs.taskListStyle && attrs.taskListStyle !== 'accentStrike' ? { 'data-tasklist-style': attrs.taskListStyle } : {}),
            },
          },
        }];
      },
    });
  }

  // Fond de cellule - augmente TableCell/TableHeader du même backgroundColor
  // que le surlignage de texte (lu par pdf-export.js:tableFrom, pas inheritedStyle).
  function withCellBackground(CellExtension) {
    return CellExtension.extend({
      addAttributes() {
        return Object.assign({}, this.parent(), {
          backgroundColor: {
            default: null,
            parseHTML: el => el.style.backgroundColor || null,
            renderHTML: attrs => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
          },
        });
      },
    });
  }
  // Applique à toutes les cellules touchées par la sélection (CellSelection
  // reconnue par duck-typing sur `forEachCell`, pas un instanceof).
  function setCellsBackground(nodeEditor, color) {
    const { state, view } = nodeEditor;
    const { selection } = state;
    if (typeof selection.forEachCell === 'function') {
      const tr = state.tr;
      selection.forEachCell((cell, pos) => {
        tr.setNodeMarkup(pos, undefined, Object.assign({}, cell.attrs, { backgroundColor: color }));
      });
      view.dispatch(tr);
      return;
    }
    nodeEditor.chain().updateAttributes('tableCell', { backgroundColor: color }).updateAttributes('tableHeader', { backgroundColor: color }).run();
  }

  // Zone 2 colonnes - paire de nœuds imbriqués, mêmes classes CSS que la V1.
  // `isolating: true` : empêche backspace/suppr de fusionner la zone avec le
  // paragraphe voisin.
  // Tab/Shift-Tab : court-circuitent l'indentation de liste en premier
  // (sinon l'extension Table l'emporte sur StarterKit pour une liste en
  // cellule), sinon déplacent le curseur d'une colonne à l'autre ou en sortent.
  function findTwoColumnsContext($from) {
    let columnDepth = -1;
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type.name === 'twoColumnsColumn') { columnDepth = d; break; }
    }
    if (columnDepth === -1) return null;
    const zoneDepth = columnDepth - 1;
    if (zoneDepth < 1 || $from.node(zoneDepth).type.name !== 'twoColumnsZone') return null;
    return { columnDepth, zoneDepth, colIndex: $from.index(zoneDepth) };
  }
  function createTabNavigationExtension(Extension) {
    return Extension.create({
      name: 'tabNavigation',
      addKeyboardShortcuts() {
        return {
          Tab: ({ editor: ed }) => {
            if (ed.isActive('listItem')) {
              // Toujours consommé, même en cas d'échec du sink : jamais de
              // repli sur un changement de cellule/colonne.
              ed.commands.sinkListItem('listItem');
              return true;
            }
            const { $from } = ed.state.selection;
            const ctx = findTwoColumnsContext($from);
            if (!ctx) return false;
            const { columnDepth, zoneDepth, colIndex } = ctx;
            if (colIndex === 0) {
              const afterLeftCol = $from.after(columnDepth);
              const target = ed.state.doc.resolve(Math.min(afterLeftCol + 1, ed.state.doc.content.size));
              ed.chain().focus().setTextSelection(TextSelectionClass.near(target, 1)).run();
              return true;
            }
            const afterZone = $from.after(zoneDepth);
            if (afterZone >= ed.state.doc.content.size) {
              ed.chain().focus().insertContentAt(afterZone, { type: 'paragraph' }).setTextSelection(afterZone + 1).run();
              return true;
            }
            ed.chain().focus().setTextSelection(TextSelectionClass.near(ed.state.doc.resolve(afterZone), 1)).run();
            return true;
          },
          'Shift-Tab': ({ editor: ed }) => {
            if (ed.isActive('listItem')) {
              ed.commands.liftListItem('listItem');
              return true;
            }
            const { $from } = ed.state.selection;
            const ctx = findTwoColumnsContext($from);
            if (!ctx) return false;
            const { columnDepth, zoneDepth, colIndex } = ctx;
            if (colIndex === 1) {
              const beforeRightCol = $from.before(columnDepth);
              const target = ed.state.doc.resolve(Math.max(beforeRightCol - 1, 0));
              ed.chain().focus().setTextSelection(TextSelectionClass.near(target, -1)).run();
              return true;
            }
            const beforeZone = $from.before(zoneDepth);
            if (beforeZone <= 0) return true; // rien avant la zone - sans effet
            ed.chain().focus().setTextSelection(TextSelectionClass.near(ed.state.doc.resolve(beforeZone - 1), -1)).run();
            return true;
          },
        };
      },
    });
  }

  // TipTap v3 n'expose plus de commande clearHistory (seulement undo/redo) :
  // reconstruire l'EditorState avec les mêmes plugins réinitialise leur état
  // (dont l'historique) sans recréer la vue ni perdre le document.
  function createClearHistoryExtension(Extension, EditorState) {
    return Extension.create({
      name: 'clearHistory',
      addCommands() {
        return {
          clearHistory: () => ({ editor: ed }) => {
            const { view } = ed;
            view.updateState(EditorState.create({ schema: view.state.schema, doc: view.state.doc, selection: view.state.selection, plugins: view.state.plugins }));
            return true;
          },
        };
      },
    });
  }

  function createTwoColumnsNodes(Node, mergeAttributes) {
    const TwoColumnsColumn = Node.create({
      name: 'twoColumnsColumn',
      content: 'block+',
      isolating: true,
      parseHTML() { return [{ tag: 'div.two-columns-column' }]; },
      renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'two-columns-column' }), 0]; },
    });
    const TwoColumnsZone = Node.create({
      name: 'twoColumnsZone',
      group: 'block',
      content: 'twoColumnsColumn twoColumnsColumn',
      isolating: true,
      addAttributes() {
        return {
          // Largeur (%) de la colonne gauche, clampée 20-80 au glisser,
          // sérialisée en variable CSS --layout-left.
          layoutLeft: {
            default: 50,
            parseHTML: el => { const v = parseFloat(el.style.getPropertyValue('--layout-left')); return Number.isFinite(v) ? v : 50; },
            renderHTML: () => ({}),
          },
        };
      },
      parseHTML() { return [{ tag: 'div.two-columns-zone' }]; },
      renderHTML({ HTMLAttributes, node }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'two-columns-zone', style: `--layout-left: ${node.attrs.layoutLeft || 50}%` }), 0];
      },
      addCommands() {
        return {
          insertTwoColumns: () => ({ chain }) => chain().insertContent({
            type: this.name,
            content: [
              { type: 'twoColumnsColumn', content: [{ type: 'paragraph' }] },
              { type: 'twoColumnsColumn', content: [{ type: 'paragraph' }] },
            ],
          }).run(),
        };
      },
      // dom = wrapper externe (ancre la poignée en absolu) englobant
      // contentDOM (les 2 colonnes gérées par ProseMirror) et la poignée,
      // hors contentDOM pour éviter qu'une reconciliation future la retire.
      // --layout-left posé sur le wrapper (hérite vers le bas uniquement,
      // la poignée ne le verrait pas si posé sur contentDOM).
      addNodeView() {
        return ({ node, editor: nodeEditor, getPos }) => {
          const wrap = document.createElement('div');
          wrap.className = 'two-columns-zone-outer';
          const contentDOM = document.createElement('div');
          contentDOM.className = 'two-columns-zone';
          wrap.appendChild(contentDOM);
          const grip = document.createElement('div');
          grip.className = 'two-columns-resize-grip';
          grip.title = I18n.t('twoColumns.resizeGrip');
          wrap.appendChild(grip);

          const applyLayout = attrs => wrap.style.setProperty('--layout-left', (attrs.layoutLeft || 50) + '%');
          applyLayout(node.attrs);

          let dragging = false;
          function onMove(event) {
            const rect = wrap.getBoundingClientRect();
            if (!rect.width) return;
            const left = ((event.clientX - rect.left) / rect.width) * 100;
            wrap.style.setProperty('--layout-left', Math.max(20, Math.min(80, left)) + '%');
          }
          function onUp() {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            const finalLeft = Math.round(parseFloat(wrap.style.getPropertyValue('--layout-left')) || 50);
            const pos = getPos();
            if (typeof pos !== 'number') return;
            const { state, view } = nodeEditor;
            const current = state.doc.nodeAt(pos);
            if (!current) return;
            view.dispatch(state.tr.setNodeMarkup(pos, undefined, Object.assign({}, current.attrs, { layoutLeft: finalLeft })));
          }
          grip.addEventListener('mousedown', event => {
            event.preventDefault(); event.stopPropagation();
            dragging = true;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp, { once: true });
          });

          return {
            dom: wrap,
            contentDOM,
            update: updatedNode => {
              if (updatedNode.type.name !== 'twoColumnsZone') return false;
              if (!dragging) applyLayout(updatedNode.attrs);
              return true;
            },
            destroy: () => document.removeEventListener('mousemove', onMove),
            // Sans ça, ProseMirror voit la mutation de style pendant le
            // glisser (hors transaction) comme inattendue et recrée le
            // NodeView - le wrapper devient alors détaché avant le mouseup,
            // et le commit final s'applique à un nœud fantôme.
            ignoreMutation: () => true,
          };
        };
      },
    });
    return { TwoColumnsColumn, TwoColumnsZone };
  }

  // Image - nœud atome en ligne : `layer` (normal/devant/derrière),
  // `opacity`, `align`, `wrap`. Chaque attribut garde renderHTML: () => ({})
  // - le nœud construit lui-même la chaîne `style` complète ci-dessous.
  function createEditorImageNode(Node) {
    const noBareRender = () => ({});
    // `height` n'est posé que pour une image liée à une variable
    // (placeholder de taille fixe, mode "contain" côté rendu).
    function styleFor(a) {
      const parts = [];
      if (a.width) parts.push(`width: ${a.width}`);
      if (a.varTable && a.height) parts.push(`height: ${a.height}`);
      if (a.layer !== 'normal') {
        parts.push('position: absolute', `left: ${a.left || 0}px`, `top: ${a.top || 0}px`, `z-index: ${a.layer === 'front' ? 5 : -1}`);
      }
      if (a.opacity !== 1 && a.opacity != null) parts.push(`opacity: ${a.opacity}`);
      return parts.join('; ');
    }
    return Node.create({
      name: 'editorImage',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return {
          src: { default: null },
          alt: { default: 'Image' },
          width: { default: '320px', parseHTML: el => el.style.width || null, renderHTML: noBareRender },
          height: { default: null, parseHTML: el => el.style.height || null, renderHTML: noBareRender },
          layer: { default: 'normal', parseHTML: el => el.getAttribute('data-layer') || 'normal', renderHTML: noBareRender },
          left: { default: null, parseHTML: el => (el.style.left ? parseFloat(el.style.left) : null), renderHTML: noBareRender },
          top: { default: null, parseHTML: el => (el.style.top ? parseFloat(el.style.top) : null), renderHTML: noBareRender },
          opacity: { default: 1, parseHTML: el => (el.style.opacity !== '' ? parseFloat(el.style.opacity) : 1), renderHTML: noBareRender },
          align: { default: null, parseHTML: el => el.getAttribute('data-align') || null, renderHTML: noBareRender },
          wrap: { default: 'inline', parseHTML: el => el.getAttribute('data-wrap') || 'inline', renderHTML: noBareRender },
          // Posés ensemble : transforment ce nœud en placeholder de #Variable
          // Attachments (jamais de vraie image dans l'éditeur).
          varTable: { default: null, parseHTML: el => el.getAttribute('data-var-table') || null, renderHTML: noBareRender },
          varColumn: { default: null, parseHTML: el => el.getAttribute('data-var-column') || null, renderHTML: noBareRender },
          varKey: { default: null, parseHTML: el => el.getAttribute('data-var-key') || null, renderHTML: noBareRender },
        };
      },
      parseHTML() { return [{ tag: 'img.editor-image' }]; },
      renderHTML({ node }) {
        const a = node.attrs;
        // Placeholder lié à une variable : `src` reste vide (résolu au
        // rendu/export par js/reader-mode.js:resolveVariableImages).
        const attrs = { class: 'editor-image', draggable: 'false', src: a.varTable ? '' : a.src, alt: a.alt, style: styleFor(a), 'data-layer': a.layer, 'data-wrap': a.wrap };
        if (a.align) attrs['data-align'] = a.align;
        if (a.varTable) {
          attrs['data-var-table'] = a.varTable;
          attrs['data-var-column'] = a.varColumn;
          attrs['data-var-key'] = a.varKey;
        }
        return ['img', attrs];
      },
      addCommands() {
        return { insertImage: attrs => ({ chain }) => chain().insertContent({ type: this.name, attrs }).run() };
      },
      // NodeView (pas des overlays document.body comme en V1) : les poignées
      // sont de vrais enfants DOM du wrapper, positionnées en pur CSS.
      addNodeView() {
        return ({ node, editor: nodeEditor, getPos }) => {
          const wrap = document.createElement('span');
          wrap.className = 'editor-image-view';
          const img = document.createElement('img');
          img.className = 'editor-image';
          img.draggable = false;
          wrap.appendChild(img);

          // Placeholder de #Variable : <span> superposé (icône +
          // "#Table.Colonne") plutôt que de compter sur le rendu natif d'un
          // <img src="">. Le <img> reste dans le DOM, invisible, pour
          // continuer à porter width/height (poignées, toolbar flottante).
          const varLabel = document.createElement('span');
          varLabel.className = 'editor-image-var-label';
          wrap.appendChild(varLabel);

          const moveHandle = document.createElement('span');
          moveHandle.className = 'editor-image-move-handle';
          moveHandle.title = I18n.t('image.moveHandle');
          wrap.appendChild(moveHandle);
          ['nw', 'ne', 'sw', 'se'].forEach(corner => {
            const h = document.createElement('span');
            h.className = 'editor-image-handle editor-image-handle-' + corner;
            wrap.appendChild(h);
            h.addEventListener('mousedown', event => startResize(event, corner));
          });
          moveHandle.addEventListener('mousedown', startMove);
          // Une fois DÉJÀ sélectionnée, permet de glisser directement au
          // clic sur l'image (pas seulement sur la poignée de déplacement) -
          // le tout premier clic suit le chemin normal de sélection ProseMirror.
          img.addEventListener('mousedown', event => {
            if (!wrap.classList.contains('editor-image-layered')) return;
            if (!wrap.classList.contains('editor-image-selected')) return;
            startMove(event);
          });

          // Le z-index négatif ("derrière le texte") est posé sur l'<img>
          // seule, pas le wrapper : sinon la poignée de déplacement (enfant
          // du wrapper) serait entraînée derrière le texte avec lui,
          // devenant impossible à re-sélectionner une fois cachée.
          function applyAttrs(attrs) {
            const isVarBox = !!attrs.varTable;
            img.src = isVarBox ? '' : (attrs.src || '');
            img.alt = attrs.alt || '';
            const imgStyle = [];
            if (attrs.width) imgStyle.push(`width: ${attrs.width}`);
            if (isVarBox && attrs.height) imgStyle.push(`height: ${attrs.height}`);
            if (attrs.opacity !== 1 && attrs.opacity != null) imgStyle.push(`opacity: ${attrs.opacity}`);
            if (attrs.layer !== 'normal') imgStyle.push('position: relative', `z-index: ${attrs.layer === 'front' ? 5 : -1}`);
            img.setAttribute('style', imgStyle.join('; '));
            wrap.classList.toggle('editor-image-var-placeholder', isVarBox);
            varLabel.textContent = isVarBox ? ('#' + (attrs.varKey || '')) : '';
            const layered = attrs.layer !== 'normal';
            wrap.classList.toggle('editor-image-layered', layered);
            if (layered) {
              wrap.style.position = 'absolute';
              wrap.style.left = (attrs.left || 0) + 'px';
              wrap.style.top = (attrs.top || 0) + 'px';
              // Largeur explicite (pas de shrink-to-fit implicite) : dans
              // une cellule de tableau étroite, le shrink-to-fit par défaut
              // s'effondre à 0 quand l'image approche la largeur du bloc englobant.
              wrap.style.width = attrs.width || '';
            } else {
              wrap.style.position = ''; wrap.style.left = ''; wrap.style.top = ''; wrap.style.width = '';
            }
            moveHandle.style.display = layered ? '' : 'none';
            if (attrs.align) wrap.setAttribute('data-align', attrs.align); else wrap.removeAttribute('data-align');
            wrap.setAttribute('data-wrap', attrs.wrap || 'inline');
          }
          applyAttrs(node.attrs);

          // Le retour visuel de sélection (classe CSS) n'est pas géré ici ni
          // via selectNode/deselectNode de la NodeView (peu fiable après un
          // setNodeMarkup, qui remplace le nœud) : centralisé dans
          // wireImageFloatingToolbar.check(), qui recalcule l'état à chaque
          // transaction depuis editor.isActive('editorImage').
          function updateAttrs(patch) {
            const pos = getPos();
            if (typeof pos !== 'number') return;
            const current = nodeEditor.state.doc.nodeAt(pos);
            if (!current) return;
            patchNodeAndReselect(nodeEditor, pos, Object.assign({}, current.attrs, patch));
          }

          // Attributs COURANTS - jamais `node.attrs` directement : ce
          // paramètre de closure ne reflète que le premier rendu de cette
          // NodeView, seul `update(updatedNode)` reçoit le nœud frais.
          function currentAttrs() {
            const pos = getPos();
            const current = typeof pos === 'number' ? nodeEditor.state.doc.nodeAt(pos) : null;
            return (current && current.attrs) || node.attrs;
          }

          let resizeState = null;
          function startResize(event, corner) {
            event.preventDefault(); event.stopPropagation();
            const rect = img.getBoundingClientRect();
            const attrsNow = currentAttrs();
            resizeState = {
              startX: event.clientX, startY: event.clientY,
              startWidth: rect.width, startHeight: rect.height,
              signX: corner.includes('w') ? -1 : 1, signY: corner.includes('n') ? -1 : 1,
              isVarBox: !!attrsNow.varTable,
              // En calque, `wrap` a une largeur explicite (cf. applyAttrs) ;
              // sans la faire grandir aussi pendant le glisser (pas seulement
              // à la fin), `.editor-image { max-width:100% }` plafonnerait
              // l'<img> à l'ancienne largeur du wrap.
              isLayered: attrsNow.layer !== 'normal',
            };
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp, { once: true });
          }
          function onResizeMove(event) {
            if (!resizeState) return;
            let width = Math.max(30, resizeState.startWidth + (event.clientX - resizeState.startX) * resizeState.signX);
            // En en-tête/pied, la poignée bute sur le plafond mais reste
            // utilisable (rétrécir reste toujours libre).
            width = clampWidthForHfMaxSize(width, img.naturalWidth, img.naturalHeight);
            img.style.width = Math.round(width) + 'px';
            if (resizeState.isLayered) wrap.style.width = Math.round(width) + 'px';
            if (resizeState.isVarBox) {
              const height = Math.max(30, resizeState.startHeight + (event.clientY - resizeState.startY) * resizeState.signY);
              img.style.height = Math.round(height) + 'px';
            }
          }
          function onResizeUp() {
            document.removeEventListener('mousemove', onResizeMove);
            if (resizeState) {
              const patch = { width: Math.round(img.getBoundingClientRect().width) + 'px' };
              if (resizeState.isVarBox) patch.height = Math.round(img.getBoundingClientRect().height) + 'px';
              updateAttrs(patch);
            }
            resizeState = null;
          }

          let moveState = null;
          function startMove(event) {
            event.preventDefault(); event.stopPropagation();
            // Attributs courants via getPos()/nodeAt, pas `node` (figé au 1er rendu).
            const pos = getPos();
            const current = (typeof pos === 'number' && nodeEditor.state.doc.nodeAt(pos)) || node;
            moveState = { startX: event.clientX, startY: event.clientY, startLeft: current.attrs.left || 0, startTop: current.attrs.top || 0 };
            document.addEventListener('mousemove', onMoveMove);
            document.addEventListener('mouseup', onMoveUp, { once: true });
          }
          function onMoveMove(event) {
            if (!moveState) return;
            wrap.style.left = (moveState.startLeft + (event.clientX - moveState.startX)) + 'px';
            wrap.style.top = (moveState.startTop + (event.clientY - moveState.startY)) + 'px';
          }
          function onMoveUp(event) {
            document.removeEventListener('mousemove', onMoveMove);
            if (moveState) {
              updateAttrs({
                left: Math.round(moveState.startLeft + (event.clientX - moveState.startX)),
                top: Math.round(moveState.startTop + (event.clientY - moveState.startY)),
              });
            }
            moveState = null;
          }

          return {
            dom: wrap,
            update: updatedNode => {
              if (updatedNode.type.name !== 'editorImage') return false;
              applyAttrs(updatedNode.attrs);
              return true;
            },
            selectNode: () => wrap.classList.add('editor-image-selected'),
            deselectNode: () => wrap.classList.remove('editor-image-selected'),
            destroy: () => {
              document.removeEventListener('mousemove', onResizeMove);
              document.removeEventListener('mousemove', onMoveMove);
            },
          };
        };
      },
    });
  }

  // Saut de page forcé - nœud atome de bloc, même classe que la V1.
  function createPageBreakNode(Node) {
    return Node.create({
      name: 'pageBreak',
      group: 'block',
      atom: true,
      selectable: true,
      parseHTML() { return [{ tag: 'div.page-break-marker' }]; },
      renderHTML() { return ['div', { class: 'page-break-marker', contenteditable: 'false' }, 'Saut de page']; },
      addCommands() {
        return { insertPageBreak: () => ({ chain }) => chain().insertContent({ type: this.name }).run() };
      },
    });
  }

  // Numérotation des titres - configuration persistée comme un nœud dans le
  // contenu plutôt qu'une colonne Grist séparée (évite une migration de
  // schéma). Attribut nommé `numberingStyle` pas `style` (collision HTML).
  function createHeadingNumberingConfigNode(Node) {
    return Node.create({
      name: 'headingNumberingConfig',
      group: 'block',
      atom: true,
      selectable: false,
      addAttributes() {
        return { numberingStyle: { default: 'none', renderHTML: () => ({}) } };
      },
      parseHTML() {
        return [{ tag: 'div.heading-numbering-config', getAttrs: el => ({ numberingStyle: el.dataset.style || 'none' }) }];
      },
      renderHTML({ node }) {
        return ['div', { class: 'heading-numbering-config', contenteditable: 'false', 'data-style': node.attrs.numberingStyle }];
      },
      addCommands() {
        return {
          // Un seul nœud de config par document : cherche parmi les enfants
          // directs (doc.forEach), sinon l'insère en tête. `dispatch` peut
          // être absent (mode "can-run") - ne muter `tr` que s'il est présent.
          setHeadingNumberingStyle: numberingStyle => ({ tr, state, dispatch }) => {
            let foundPos = null;
            state.doc.forEach((node, pos) => { if (node.type.name === 'headingNumberingConfig') foundPos = pos; });
            if (dispatch) {
              if (foundPos !== null) tr.setNodeMarkup(foundPos, undefined, { numberingStyle });
              else tr.insert(0, state.schema.nodes.headingNumberingConfig.create({ numberingStyle }));
            }
            return true;
          },
        };
      },
    });
  }

  // Sommaire - nœud atome de bloc. Le HTML sérialisé reste un placeholder
  // statique (résolu par reader-mode.js/pdf-export.js) ; l'éditeur affiche
  // un aperçu vivant via un NodeView, isolé du modèle par `ignoreMutation`.
  function createTocNode(Node) {
    return Node.create({
      name: 'toc',
      group: 'block',
      atom: true,
      selectable: true,
      parseHTML() { return [{ tag: 'div.toc-marker' }]; },
      renderHTML() { return ['div', { class: 'toc-marker' }, 'Sommaire (généré automatiquement à partir des titres)']; },
      addCommands() {
        return { insertToc: () => ({ chain }) => chain().insertContent({ type: this.name }).run() };
      },
      addNodeView() {
        return ({ editor: nodeViewEditor }) => {
          const dom = document.createElement('div');
          dom.className = 'toc-marker';
          const refresh = () => {
            const headingEls = Array.from(nodeViewEditor.view.dom.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
            dom.innerHTML = '';
            if (!headingEls.length) { dom.textContent = I18n.t('toc.placeholder'); return; }
            const style = nodeViewEditor.view.dom.dataset.headingStyle || 'none';
            HeadingNumbering.entriesFor(headingEls, style).forEach(entry => {
              const line = document.createElement('div');
              line.className = 'toc-entry-preview';
              line.style.paddingLeft = ((entry.level - 1) * 14) + 'px';
              line.textContent = entry.text;
              dom.appendChild(line);
            });
          };
          refresh();
          nodeViewEditor.on('update', refresh);
          return { dom, ignoreMutation: () => true, destroy: () => nodeViewEditor.off('update', refresh) };
        };
      },
    });
  }

  // En mode Aperçu A4, un tableau ne doit jamais dépasser la largeur de
  // page réelle : un <col> à largeur EXPLICITE n'a, contrairement à
  // min-width, aucun plafond naturel - une colonne trop agrandie pousse le
  // reste du tableau hors de la feuille. L'extension de redimensionnement
  // n'expose pas de crochet pendant le glisser ; ce correctif tourne donc
  // sur chaque mise à jour et rétrécit après coup les colonnes
  // explicitement redimensionnées (`colwidth` réel, jamais les colonnes
  // "auto" - déjà couvertes par `min-width: 0`) dès que la largeur totale
  // dépasse le conteneur - un léger rebond après avoir relâché la poignée,
  // mais le tableau ne peut jamais rester plus large que la page.
  // Largeur disponible pour un enfant direct de `.tiptap` : son clientWidth
  // inclut SON PROPRE padding (simule la marge de page en Aperçu A4), non
  // disponible à un enfant. Partagé entre clampOverflowingTables et
  // l'alignement des images en calque (même calcul).
  function editorContentWidthPx(currentEditor) {
    const rootEl = currentEditor.view.dom;
    const rootCs = getComputedStyle(rootEl);
    return rootEl.clientWidth - (parseFloat(rootCs.paddingLeft) || 0) - (parseFloat(rootCs.paddingRight) || 0);
  }

  // Tant qu'UNE SEULE colonne d'un tableau reste "auto" (pas de `colwidth`
  // propre), `<table>` ne porte qu'un `min-width` - `.tiptap table {
  // width: 100% }` s'applique donc toujours tel quel : agrandir une colonne
  // ne fait que voler de la place aux colonnes "auto" voisines, et la
  // poignée extérieure droite (sans colonne voisine à qui prendre de la
  // place) ne peut jamais faire grandir le tableau du tout. Dès que TOUTES
  // les colonnes ont un `colwidth` explicite, `<table>` porte un `width`
  // exact qui l'affranchit du `width:100%` (peut alors dépasser 100%,
  // jusqu'à ce que clampOverflowingTables le retienne). Fixé en gelant, dès
  // le premier redimensionnement d'une colonne, la largeur RENDUE actuelle
  // de chaque colonne encore "auto" du même tableau comme son propre
  // `colwidth` - clampOverflowingTables rattrape ensuite un éventuel
  // dépassement.
  function backfillAutoColumnWidths(currentEditor) {
    const { state, view } = currentEditor;
    let tr = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return true;
      const firstRow = node.firstChild;
      if (!firstRow) return false;
      let hasExplicit = false; let hasAuto = false;
      firstRow.forEach(cellNode => { if (cellNode.attrs.colwidth) hasExplicit = true; else hasAuto = true; });
      if (!hasExplicit || !hasAuto) return false;
      node.forEach((rowNode, rowOffset) => {
        rowNode.forEach((cellNode, cellOffset) => {
          if (cellNode.attrs.colwidth) return;
          const cellPos = pos + 1 + rowOffset + 1 + cellOffset;
          const dom = view.nodeDOM(cellPos);
          if (!dom || !dom.getBoundingClientRect) return;
          const span = cellNode.attrs.colspan || 1;
          const widthPx = Math.max(DEFAULT_COL_PX, Math.round(dom.getBoundingClientRect().width / span));
          if (!tr) tr = state.tr;
          tr.setNodeMarkup(cellPos, undefined, Object.assign({}, cellNode.attrs, { colwidth: Array(span).fill(widthPx) }));
        });
      });
      return false;
    });
    if (tr) currentEditor.view.dispatch(tr);
  }

  const DEFAULT_COL_PX = 25;
  function clampOverflowingTables(currentEditor) {
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer || !editorContainer.classList.contains('a4-preview')) return;
    const containerWidth = editorContentWidthPx(currentEditor);
    if (!containerWidth) return;
    const { state } = currentEditor;
    let tr = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return true;
      const firstRow = node.firstChild;
      if (!firstRow) return false;
      // Calculé sur la première ligne, mais appliqué à TOUTES : sinon
      // prosemirror-tables (largeur cohérente par colonne exigée) annule la
      // correction pour la réaligner sur les lignes non corrigées.
      let total = 0;
      firstRow.forEach(cellNode => {
        const span = cellNode.attrs.colspan || 1;
        const colwidth = cellNode.attrs.colwidth;
        total += colwidth ? colwidth.reduce((sum, w) => sum + (w || DEFAULT_COL_PX), 0) : DEFAULT_COL_PX * span;
      });
      if (total <= containerWidth) return false;
      const scale = containerWidth / total;
      node.forEach((rowNode, rowOffset) => {
        rowNode.forEach((cellNode, cellOffset) => {
          const colwidth = cellNode.attrs.colwidth;
          if (!colwidth) return; // colonne "auto" par défaut - laissée telle quelle
          const newColwidth = colwidth.map(w => (w ? Math.max(DEFAULT_COL_PX, Math.round(w * scale)) : w));
          const cellPos = pos + 1 + rowOffset + 1 + cellOffset;
          if (!tr) tr = state.tr;
          tr.setNodeMarkup(cellPos, undefined, Object.assign({}, cellNode.attrs, { colwidth: newColwidth }));
        });
      });
      return false;
    });
    if (tr) currentEditor.view.dispatch(tr);
  }

  // Toolbar contextuelle flottante, positionnée par @floating-ui/dom, ancrée
  // dans document.body (évite tout souci de contexte d'empilement avec un ancêtre).
  function createFloatingPanel(className, innerHTML, onAction, onInput) {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = innerHTML;
    // mousedown+preventDefault : évite de perdre le focus/la sélection
    // ProseMirror avant que l'action ne s'exécute.
    el.addEventListener('mousedown', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      event.preventDefault();
      onAction(btn.dataset.action);
    });
    if (onInput) el.addEventListener('input', (event) => {
      const input = event.target.closest('[data-role]');
      if (input) onInput(input.dataset.role, input.value);
    });
    document.body.appendChild(el);
    let stopAutoUpdate = null;
    return {
      el,
      show(referenceEl) {
        el.classList.add('visible');
        const update = () => {
          floatingUi.computePosition(referenceEl, el, {
            placement: 'top',
            middleware: [floatingUi.offset(8), floatingUi.flip(), floatingUi.shift({ padding: 8 })],
          }).then(({ x, y }) => { el.style.left = `${x}px`; el.style.top = `${y}px`; });
        };
        if (stopAutoUpdate) stopAutoUpdate();
        stopAutoUpdate = floatingUi.autoUpdate(referenceEl, el, update);
      },
      hide() {
        el.classList.remove('visible');
        if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
      },
    };
  }

  // Filet de sécurité : les toolbars contextuelles (tableau/image/variable)
  // ne se ferment normalement que sur un changement RÉEL de sélection
  // ProseMirror - un clic hors de `.tiptap` ET hors `.v2-floating-toolbar`
  // les referme toutes, pour les cas où aucun évènement ProseMirror ne se
  // déclenche (ex. clic sur "Mode lecture").
  const floatingContextPanels = [];
  function hideFloatingContextToolbars() { floatingContextPanels.forEach(p => p.hide()); }
  document.addEventListener('mousedown', (event) => {
    if (event.target.closest('.tiptap') || event.target.closest('.v2-floating-toolbar')) return;
    hideFloatingContextToolbars();
  });

  const TEXT_COLOR_PRESETS = ['#000000', '#5f6368', '#c0392b', '#d68910', '#8a7000', '#1e8449', '#2874a6', '#7d3c98'];
  const FILL_COLOR_PRESETS = ['#fff2a8', '#c8f7c5', '#c8e6ff', '#ffd6d6', '#e6d6ff', '#ffe0b3', '#e0e0e0'];

  // Un seul menu déroulant à la fois (couleur/police/taille), fermé au clic ailleurs.
  let openDropdownPanel = null;
  document.addEventListener('mousedown', (event) => {
    if (!openDropdownPanel) return;
    if (event.target.closest('.v2-color-dropdown') || event.target.closest('.v2-color-split')
      || event.target.closest('.v2-format-panel') || event.target.closest('.v2-format-chip')
      || event.target.closest('.v2-stepper') || event.target.closest('.v2-fill-chip')) return;
    openDropdownPanel.hide();
    openDropdownPanel = null;
  });

  // Menu déroulant de couleur générique (grille de nuances + case
  // "personnalisé" ouvrant le sélecteur natif + case "aucune", optionnelle) -
  // même esprit que la toolbar de tableau/image (createFloatingPanel), pour
  // le bouton de police/surlignage de la toolbar principale ET le bouton de
  // fond de cellule de la toolbar de tableau. `onPick(chain, color)`/
  // `onNone(chain)` reçoivent une chaîne TipTap déjà focus+sélection
  // restaurée (cf. `withSavedSelection` de chaque appelant) - à eux
  // d'appeler la commande adéquate dessus, sans jamais lancer .run() (fait
  // par l'appelant, une seule fois).
  function createColorDropdown(presets, { noneLabel, onPick, onNone, withSavedSelection }) {
    const swatches = presets.map(c => `<button data-action="pick:${c}" style="background:${c}" title="${c}"></button>`).join('');
    const html = '<div class="v2-color-grid">' + swatches + '</div>'
      + '<div class="v2-color-dropdown-footer">'
      + `<button data-action="custom" title="${I18n.t('colorDropdown.custom')}">${Icons.svg('fill')}<span>${I18n.t('colorDropdown.customLabel')}</span></button>`
      + (onNone ? `<button data-action="none" title="${noneLabel}">${Icons.svg('noColor')}<span>${noneLabel}</span></button>` : '')
      + '</div>'
      + '<input type="color" class="v2-color-dropdown-native">';
    const panel = createFloatingPanel('v2-color-dropdown', html, (action) => {
      if (action === 'custom') { panel.el.querySelector('.v2-color-dropdown-native').click(); return; }
      if (action === 'none') { withSavedSelection(chain => onNone(chain)); closeDropdownPanel(); return; }
      if (action.indexOf('pick:') === 0) { const color = action.slice(5); withSavedSelection(chain => onPick(chain, color)); closeDropdownPanel(); }
    });
    panel.el.querySelector('.v2-color-dropdown-native').addEventListener('input', (event) => {
      withSavedSelection(chain => onPick(chain, event.target.value));
      closeDropdownPanel();
    });
    return panel;
  }
  function closeDropdownPanel() { if (openDropdownPanel) { openDropdownPanel.hide(); openDropdownPanel = null; } }
  // Ouvre/ferme `panel` au clic sur `btn` - mousedown+preventDefault (pas
  // click) : même raison que la toolbar de tableau/image, éviter de perdre
  // la sélection ProseMirror avant que le panneau ne s'ouvre. `getSelection`
  // capture la sélection AU MOMENT du clic (avant que le panneau ne vole le
  // focus) - restaurée par `withSavedSelection` quand une couleur est
  // effectivement choisie, potentiellement bien après ce clic initial.
  function wireDropdownButton(btn, panel, captureSelection) {
    if (!btn) return;
    btn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      captureSelection();
      if (openDropdownPanel === panel) { closeDropdownPanel(); return; }
      closeDropdownPanel();
      panel.show(btn);
      openDropdownPanel = panel;
    });
  }
  function setColorBar(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.background = color || 'transparent';
  }
  function setColorIcon(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.color = color || '';
  }

  // Un menu/panneau flottant vole le focus au clic - sans mémoriser la
  // sélection avant de l'ouvrir, `editor.chain().focus()` retomberait sur la
  // position du curseur, pas la sélection réellement visée par l'utilisateur.
  function createSelectionPreserver() {
    let savedSelection = null;
    const captureSelection = () => { const { from, to } = editor.state.selection; savedSelection = { from, to }; };
    const withSavedSelection = (fn) => {
      const chain = editor.chain().focus();
      if (savedSelection) chain.setTextSelection(savedSelection);
      fn(chain);
      chain.run();
    };
    return { captureSelection, withSavedSelection };
  }

  // Couleur de police / surlignage : bouton "appliquer" (réapplique la
  // dernière couleur choisie) + bouton chevron séparé (menu de nuances).
  function wireColorPickers() {
    const { captureSelection, withSavedSelection } = createSelectionPreserver();
    // "Aucune couleur" appliquée n'est jamais mémorisée comme "dernier choix"
    // - un clic rapide sur l'icône doit toujours appliquer une VRAIE couleur.
    let lastTextColor = TEXT_COLOR_PRESETS[0];
    let lastHighlightColor = FILL_COLOR_PRESETS[0];
    const wireQuickApply = (id, fn) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('mousedown', (event) => { event.preventDefault(); captureSelection(); withSavedSelection(fn); });
    };

    const textColorPanel = createColorDropdown(TEXT_COLOR_PRESETS, {
      noneLabel: I18n.t('colorDropdown.noneDefault'),
      withSavedSelection,
      onPick: (chain, color) => { lastTextColor = color; chain.setTextColor(color); setColorIcon('v2-text-color-icon', color); },
      onNone: (chain) => { chain.unsetTextColor(); setColorIcon('v2-text-color-icon', null); },
    });
    wireQuickApply('v2-btn-text-color', chain => chain.setTextColor(lastTextColor));
    wireDropdownButton(document.getElementById('v2-btn-text-color-caret'), textColorPanel, captureSelection);

    const highlightPanel = createColorDropdown(FILL_COLOR_PRESETS, {
      noneLabel: I18n.t('colorDropdown.none'),
      withSavedSelection,
      onPick: (chain, color) => { lastHighlightColor = color; chain.setHighlight(color); setColorIcon('v2-highlight-icon', color); },
      onNone: (chain) => { chain.unsetHighlight(); setColorIcon('v2-highlight-icon', null); },
    });
    wireQuickApply('v2-btn-highlight', chain => chain.setHighlight(lastHighlightColor));
    wireDropdownButton(document.getElementById('v2-btn-highlight-caret'), highlightPanel, captureSelection);
  }

  // Toolbar de gestion de tableau : panneau flottant, visible seulement
  // curseur dans une cellule, ancré sur le <table> réel.
  function wireTableFloatingToolbar() {
    const buttons = [
      ['row-before', 'rowBefore', I18n.t('table.rowBefore')],
      ['row-after', 'rowAfter', I18n.t('table.rowAfter')],
      ['row-del', 'rowDel', I18n.t('table.rowDel')],
      ['col-before', 'colBefore', I18n.t('table.colBefore')],
      ['col-after', 'colAfter', I18n.t('table.colAfter')],
      ['col-del', 'colDel', I18n.t('table.colDel')],
      ['table-del', 'trash', I18n.t('table.tableDel')],
    ];
    const html = buttons.map(([action, icon, title]) =>
      `<button data-action="${action}" title="${title}">${Icons.svg(icon)}</button>`).join('')
      + '<span class="v2-floating-sep"></span>'
      + `<button data-action="fill-open" class="v2-fill-chip" id="v2-table-fill-btn" title="${I18n.t('table.fillOpen')}">`
      + Icons.svg('fill') + '<span class="v2-fill-bar" id="v2-table-fill-bar"></span>' + Icons.svg('caretDown')
      + '</button>';
    const panel = createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const commands = {
        'row-before': () => editor.chain().focus().addRowBefore().run(),
        'row-after': () => editor.chain().focus().addRowAfter().run(),
        'row-del': () => editor.chain().focus().deleteRow().run(),
        'col-before': () => editor.chain().focus().addColumnBefore().run(),
        'col-after': () => editor.chain().focus().addColumnAfter().run(),
        'col-del': () => editor.chain().focus().deleteColumn().run(),
        'table-del': () => editor.chain().focus().deleteTable().run(),
        'fill-open': () => {
          const btn = document.getElementById('v2-table-fill-btn');
          if (openDropdownPanel === fillPanel) { closeDropdownPanel(); return; }
          closeDropdownPanel();
          fillPanel.show(btn);
          openDropdownPanel = fillPanel;
        },
      };
      (commands[action] || (() => {}))();
    });
    // Pas de sélection à restaurer ici : setCellsBackground lit
    // editor.state.selection directement (persiste indépendamment du focus DOM).
    const fillPanel = createColorDropdown(FILL_COLOR_PRESETS, {
      noneLabel: I18n.t('colorDropdown.none'),
      withSavedSelection: fn => fn(null),
      onPick: (chain, color) => { setCellsBackground(editor, color); setColorBar('v2-table-fill-bar', color); },
      onNone: () => { setCellsBackground(editor, null); setColorBar('v2-table-fill-bar', null); },
    });
    floatingContextPanels.push(panel);
    const check = () => {
      // editor.isActive(...) ne change pas seul quand le focus quitte
      // l'éditeur - vérifier hasFocus() explicitement pour fermer le
      // panneau au clic hors de l'éditeur.
      if (!editor.view.hasFocus()) { panel.hide(); return; }
      if (!editor.isActive('table')) { panel.hide(); return; }
      const { $from } = editor.state.selection;
      let tableDepth = -1;
      for (let d = $from.depth; d > 0; d--) { if ($from.node(d).type.name === 'table') { tableDepth = d; break; } }
      if (tableDepth === -1) { panel.hide(); return; }
      // nodeDOM d'une table renvoie le wrapper (.tableWrapper de
      // prosemirror-tables), pas le <table> - redescend dessus pour l'ancrage.
      const dom = editor.view.nodeDOM($from.before(tableDepth));
      if (!dom) { panel.hide(); return; }
      const tableEl = dom.tagName === 'TABLE' ? dom : (dom.querySelector && dom.querySelector('table')) || dom;
      panel.show(tableEl);
      const cellAttrs = editor.getAttributes('tableCell').backgroundColor ? editor.getAttributes('tableCell') : editor.getAttributes('tableHeader');
      setColorBar('v2-table-fill-bar', cellAttrs.backgroundColor || null);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Toolbar flottante d'image : zoom, taille d'origine, alignement, wrap,
  // opacité, calque, suppression.
  function wireImageFloatingToolbar() {
    const html = [
      `<button data-action="zoom-out" title="${I18n.t('imgToolbar.shrink')}">${Icons.svg('zoomOut')}</button>`,
      `<button data-action="zoom-in" title="${I18n.t('imgToolbar.grow')}">${Icons.svg('zoomIn')}</button>`,
      `<button data-action="reset" title="${I18n.t('imgToolbar.originalSize')}">${Icons.svg('resetSize')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="align-left" title="${I18n.t('align.left')}">${Icons.svg('alignLeft')}</button>`,
      `<button data-action="align-center" title="${I18n.t('align.center')}">${Icons.svg('alignCenter')}</button>`,
      `<button data-action="align-right" title="${I18n.t('align.right')}">${Icons.svg('alignRight')}</button>`,
      `<button data-action="wrap" title="${I18n.t('imgToolbar.inlineToggle')}">${Icons.svg('wrapToggle')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<input type="range" data-role="opacity" min="10" max="100" value="100" title="${I18n.t('imgToolbar.opacity')}">`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="layer-normal" title="${I18n.t('imgToolbar.inText')}">${Icons.svg('layerNormal')}</button>`,
      `<button data-action="layer-front" title="${I18n.t('imgToolbar.front')}">${Icons.svg('layerFront')}</button>`,
      `<button data-action="layer-behind" title="${I18n.t('imgToolbar.behind')}">${Icons.svg('layerBehind')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="delete" title="${I18n.t('imgToolbar.delete')}">${Icons.svg('trash')}</button>`,
    ].join('');

    // Exige une VRAIE NodeSelection (`.node`), pas juste editor.isActive()
    // qui reste vrai pour une simple sélection de texte traversant la
    // position DOM de l'image. Duck-typing sur `.node` plutôt que
    // `instanceof NodeSelectionClass` : un clic réel sur l'image produit une
    // sélection créée en interne par prosemirror-view qui échoue cet
    // instanceof (deux exemplaires distincts du module prosemirror-state).
    function selectedImageNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'editorImage') ? node : null;
    }

    // Dimensions intrinsèques (naturalWidth/Height) pour clampWidthForHfMaxSize.
    function selectedImageDom() {
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      return (dom && dom.querySelector) ? dom.querySelector('img') : null;
    }

    function updateSelectedImage(patch) {
      const node = selectedImageNode();
      if (!node) return;
      patchNodeAndReselect(editor, editor.state.selection.from, Object.assign({}, node.attrs, patch));
    }

    // En flux normal, alignement classique ; en calque, réaligne sur le
    // bord du conteneur (margin:auto n'a aucun effet en position:absolute).
    function alignOrSnap(align) {
      const node = selectedImageNode();
      if (!node) return;
      const { state } = editor;
      if (node.attrs.layer === 'normal') { updateSelectedImage({ align }); return; }
      const dom = editor.view.nodeDOM(state.selection.from);
      const img = dom && dom.querySelector && dom.querySelector('img');
      if (!img) return;
      const imgWidthPx = img.getBoundingClientRect().width;
      const containerWidthPx = editorContentWidthPx(editor);
      // `left` est stocké depuis le bord de la boîte de padding, mais
      // l'alignement vise le bord du texte - décalage explicite du padding.
      const rootCs = getComputedStyle(editor.view.dom);
      const padLeft = parseFloat(rootCs.paddingLeft) || 0;
      const left = align === 'left' ? padLeft : align === 'center' ? padLeft + Math.max(0, (containerWidthPx - imgWidthPx) / 2) : padLeft + Math.max(0, containerWidthPx - imgWidthPx);
      updateSelectedImage({ left: Math.round(left) });
    }

    // Sélecteur explicite à 3 états (normal/devant/derrière), chaque bouton
    // fixe le calque visé. Au premier passage en calque, initialise
    // left/top depuis la position RENDUE actuelle pour éviter un saut visuel.
    function setLayer(target) {
      const node = selectedImageNode();
      if (!node) return;
      const pos = editor.state.selection.from;
      if (node.attrs.layer === target) return;
      const patch = { layer: target };
      if (target !== 'normal' && (node.attrs.left == null || node.attrs.top == null)) {
        const dom = editor.view.nodeDOM(pos);
        const img = dom && dom.querySelector && dom.querySelector('img');
        if (img) {
          const imgRect = img.getBoundingClientRect();
          const rootRect = editor.view.dom.getBoundingClientRect();
          // Pas de soustraction de padding : left/top sont appliqués tels
          // quels en CSS depuis le bord de la boîte de padding (styleFor()),
          // qui ne bouge pas avec le padding - contrairement à la zone de
          // contenu, seule affectée si on avait retranché le padding ici.
          patch.left = Math.round(imgRect.left - rootRect.left);
          patch.top = Math.round(imgRect.top - rootRect.top);
        }
      }
      patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, patch));
    }

    const panel = createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const selNode = selectedImageNode();
      if (!selNode) return;
      const attrs = selNode.attrs;
      // Plafond en mode en-tête/pied (cf. clampWidthForHfMaxSize, en tête
      // de fichier) : zoom avant/reset restent utilisables (poignées aussi,
      // cf. startResize) - juste bornés à la taille max, jamais bloqués.
      // zoom-out n'a besoin d'aucun plafond (il ne fait que rétrécir).
      const clampedWidth = widthPx => {
        const dom = selectedImageDom();
        return dom ? clampWidthForHfMaxSize(widthPx, dom.naturalWidth, dom.naturalHeight) : widthPx;
      };
      const commands = {
        'zoom-out': () => updateSelectedImage({ width: Math.round((parseFloat(attrs.width) || 320) * 0.75) + 'px' }),
        'zoom-in': () => updateSelectedImage({ width: Math.round(clampedWidth((parseFloat(attrs.width) || 320) * 1.25)) + 'px' }),
        reset: () => updateSelectedImage({ width: Math.round(clampedWidth(320)) + 'px', align: null }),
        'align-left': () => alignOrSnap('left'),
        'align-center': () => alignOrSnap('center'),
        'align-right': () => alignOrSnap('right'),
        wrap: () => updateSelectedImage({ wrap: attrs.wrap === 'block' ? 'inline' : 'block' }),
        'layer-normal': () => setLayer('normal'),
        // Verrouillé en mode en-tête/pied (cf. syncState ci-dessous pour le
        // grisage visuel) - garde-fou en plus du CSS pointer-events:none, au
        // cas où : pdf-export.js ne résout pas encore la position d'une
        // image en calque à l'intérieur d'un en-tête/pied (pas de mesure en
        // 2 passes pour cette zone, contrairement au flux principal).
        'layer-front': () => { if (!hfMode) setLayer('front'); },
        'layer-behind': () => { if (!hfMode) setLayer('behind'); },
        delete: () => {
          const pos = editor.state.selection.from;
          editor.chain().focus().deleteRange({ from: pos, to: pos + selNode.nodeSize }).run();
        },
      };
      (commands[action] || (() => {}))();
    }, (role, value) => {
      if (role === 'opacity') updateSelectedImage({ opacity: Math.max(0.1, parseInt(value, 10) / 100) });
    });

    function syncState() {
      const node = selectedImageNode();
      if (!node) return;
      const attrs = node.attrs;
      const opacityInput = panel.el.querySelector('input[data-role="opacity"]');
      if (opacityInput && document.activeElement !== opacityInput) opacityInput.value = Math.round((attrs.opacity != null ? attrs.opacity : 1) * 100);
      const setActive = (action, isActive) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('is-active', !!isActive); };
      setActive('align-left', attrs.align === 'left');
      setActive('align-center', attrs.align === 'center');
      setActive('align-right', attrs.align === 'right');
      setActive('wrap', attrs.wrap === 'block');
      setActive('layer-normal', !attrs.layer || attrs.layer === 'normal');
      setActive('layer-front', attrs.layer === 'front');
      setActive('layer-behind', attrs.layer === 'behind');
      // Cf. commentaire sur 'layer-front'/'layer-behind' dans onAction
      // ci-dessus : calque non résolu par pdf-export.js à l'intérieur d'un
      // en-tête/pied, grisé pendant tout le mode (même classe/mécanisme que
      // le reste de la toolbar, cf. .v2-hf-locked dans css/toolbar-v2.css).
      const setLockedBtn = (action, locked) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('v2-hf-locked', !!locked); };
      setLockedBtn('layer-front', !!hfMode);
      setLockedBtn('layer-behind', !!hfMode);
    }

    // Retour visuel de sélection (classe .editor-image-selected) recalculé
    // ICI à chaque passage plutôt que de dépendre de selectNode/deselectNode
    // de la NodeView (constaté peu fiable après un setNodeMarkup - cf.
    // commentaire dans updateAttrs) : on efface d'abord toute classe
    // résiduelle, puis on ne la repose que sur l'image RÉELLEMENT
    // sélectionnée. Source de vérité unique, correcte même si une NodeView a
    // été recréée entre-temps.
    floatingContextPanels.push(panel);
    const check = () => {
      // Cf. commentaire équivalent dans wireTableFloatingToolbar - un blur
      // réel (clic hors de l'éditeur) ne change pas la sélection ProseMirror
      // à lui seul, donc sans cette garde une 'transaction' qui suit peut
      // rouvrir le panneau juste après sa fermeture.
      if (!editor.view.hasFocus()) { panel.hide(); return; }
      document.querySelectorAll('.tiptap .editor-image-view.editor-image-selected').forEach(el => el.classList.remove('editor-image-selected'));
      if (!selectedImageNode()) { panel.hide(); return; }
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      const img = dom && dom.querySelector && dom.querySelector('img');
      if (!img) { panel.hide(); return; }
      dom.classList.add('editor-image-selected');
      syncState();
      panel.show(img);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Barre flottante de formatage nombre/date d'une bulle #Variable, sur le
  // même modèle que celle de l'image (createFloatingPanel, sélection réelle
  // du nœud - cf. commentaire de selectedImageNode ci-dessus sur le piège
  // instanceof/duck-typing, même prudence ici). Le TYPE de colonne Grist
  // (GristAPI.getColumnType) détermine lequel des 2 sous-panneaux (nombre/
  // date) s'affiche - une colonne Texte/Référence n'a rien à formater, la
  // barre reste cachée. Rien n'est stocké sur le nœud tant que l'utilisateur
  // n'a rien choisi (`format: null` par défaut, cf. createVarBadgeNode) :
  // formatValue() garde alors son comportement historique (String(val) brut).
  function wireVariableFloatingToolbar() {
    const dateOptions = VariableFormat.DATE_PRESETS.map(p => `<option value="${p.key}">${VariableFormat.presetLabel(p)}</option>`).join('');
    const html = [
      '<div data-var-panel="number">',
      '<span class="v2-varfmt-seg">',
      `<button data-action="num-style:fr" title="${I18n.t('varFmt.styleFr')}">FR</button>`,
      `<button data-action="num-style:us" title="${I18n.t('varFmt.styleUs')}">US</button>`,
      `<button data-action="num-style:none" title="${I18n.t('varFmt.styleNone')}">—</button>`,
      '</span>',
      `<select data-role="num-decimals" title="${I18n.t('varFmt.decimals')}"><option value="">${I18n.t('varFmt.decimalsAuto')}</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>`,
      `<input type="text" data-role="num-currency" placeholder="${I18n.t('varFmt.currencyPlaceholder')}" title="${I18n.t('varFmt.currencyTitle')}" maxlength="6">`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="num-words" title="${I18n.t('varFmt.wordsNumberTitle')}">${I18n.t('varFmt.wordsButton')}</button>`,
      '</div>',
      '<div data-var-panel="date" hidden>',
      '<span class="v2-varfmt-seg">',
      `<button data-action="date-part:day" title="${I18n.t('varFmt.showDay')}">J</button>`,
      `<button data-action="date-part:month" title="${I18n.t('varFmt.showMonth')}">M</button>`,
      `<button data-action="date-part:year" title="${I18n.t('varFmt.showYear')}">A</button>`,
      '</span>',
      `<select data-role="date-preset" title="${I18n.t('varFmt.datePreset')}">${dateOptions}</select>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="date-words" title="${I18n.t('varFmt.wordsDateTitle')}">${I18n.t('varFmt.wordsButton')}</button>`,
      '</div>',
    ].join('');
    const panel = createFloatingPanel('v2-floating-toolbar v2-varfmt-toolbar', html, onAction, onInput);
    floatingContextPanels.push(panel);

    function selectedVarBadgeNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'varBadge') ? node : null;
    }
    function updateSelectedBadge(patch) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      const format = Object.assign({}, node.attrs.format, patch);
      patchNodeAndReselect(editor, editor.state.selection.from, Object.assign({}, node.attrs, { format }));
    }
    function onAction(action) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      if (action.indexOf('num-style:') === 0) { updateSelectedBadge({ type: 'number', style: action.slice(10) }); return; }
      if (action === 'num-words') {
        const current = node.attrs.format || {};
        updateSelectedBadge({ type: 'number', words: !current.words });
        return;
      }
      // J/M/A : bascule un composant de la date (vrai par défaut, cf.
      // VariableFormat.formatDate) - le dernier composant encore actif ne
      // peut pas être désactivé (éviterait une date vide "").
      if (action.indexOf('date-part:') === 0) {
        const part = action.slice(10);
        const current = node.attrs.format || {};
        const activeParts = ['day', 'month', 'year'].filter(p => current[p] !== false);
        if (activeParts.length === 1 && activeParts[0] === part) return;
        updateSelectedBadge({ type: 'date', [part]: current[part] === false });
        return;
      }
      if (action === 'date-words') {
        const current = node.attrs.format || {};
        updateSelectedBadge({ type: 'date', words: !current.words });
      }
    }
    function onInput(role, value) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      if (role === 'num-decimals') { updateSelectedBadge({ type: 'number', decimals: value === '' ? null : parseInt(value, 10) }); return; }
      if (role === 'num-currency') { updateSelectedBadge({ type: 'number', currency: value.trim() }); return; }
      if (role === 'date-preset') { updateSelectedBadge({ type: 'date', preset: value }); return; }
    }

    function syncState() {
      const node = selectedVarBadgeNode();
      if (!node) return;
      const format = node.attrs.format || {};
      const setActive = (action, isActive) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('is-active', !!isActive); };
      // Repli par défaut aligné sur la langue de l'interface (Réglages >
      // Langue) plutôt que toujours 'fr' - seulement quand la variable elle-
      // même n'a AUCUN style explicitement choisi (format.style posé =
      // override assumé, jamais réécrit ici).
      const defaultStyle = I18n.getLang() === 'en' ? 'us' : 'fr';
      const style = format.type === 'number' ? (format.style || defaultStyle) : defaultStyle;
      setActive('num-style:fr', style === 'fr');
      setActive('num-style:us', style === 'us');
      setActive('num-style:none', style === 'none');
      setActive('num-words', format.type === 'number' && !!format.words);
      panel.el.querySelector('[data-var-panel="number"]').classList.toggle('v2-varfmt-words-active', format.type === 'number' && !!format.words);
      const decimalsSelect = panel.el.querySelector('select[data-role="num-decimals"]');
      if (decimalsSelect && document.activeElement !== decimalsSelect) decimalsSelect.value = (format.type === 'number' && format.decimals != null) ? String(format.decimals) : '';
      const currencyInput = panel.el.querySelector('input[data-role="num-currency"]');
      if (currencyInput && document.activeElement !== currencyInput) currencyInput.value = (format.type === 'number' && format.currency) ? format.currency : '';
      const dateSelect = panel.el.querySelector('select[data-role="date-preset"]');
      if (dateSelect && document.activeElement !== dateSelect) dateSelect.value = (format.type === 'date' && format.preset) ? format.preset : VariableFormat.DATE_PRESETS[0].key;
      // J/M/A vrais par défaut (format.day/month/year absent = affiché),
      // cohérent avec VariableFormat.formatDate.
      const isDate = format.type === 'date';
      setActive('date-part:day', !isDate || format.day !== false);
      setActive('date-part:month', !isDate || format.month !== false);
      setActive('date-part:year', !isDate || format.year !== false);
      setActive('date-words', isDate && !!format.words);
    }

    const check = () => {
      // Cf. commentaire équivalent dans wireTableFloatingToolbar.
      if (!editor.view.hasFocus()) { panel.hide(); return; }
      const node = selectedVarBadgeNode();
      if (!node) { panel.hide(); return; }
      const type = GristAPI.getColumnType(node.attrs.table, node.attrs.column);
      const isNumber = type === 'Numeric' || type === 'Int';
      const isDate = type === 'Date' || type === 'DateTime';
      if (!isNumber && !isDate) { panel.hide(); return; }
      panel.el.querySelector('[data-var-panel="number"]').hidden = !isNumber;
      panel.el.querySelector('[data-var-panel="date"]').hidden = !isDate;
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      if (!dom) { panel.hide(); return; }
      syncState();
      panel.show(dom);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Même vérification qu'en V1 (js/editor.js:436-445) : un fetch() sur la
  // même URL que pdf-export.js utilisera pour inliner l'image en base64 à
  // l'export - si ça échoue (serveur sans en-tête CORS permissif), l'export
  // devra silencieusement ignorer l'image. Non bloquant : l'insertion a déjà
  // eu lieu, ceci prévient juste l'utilisateur à l'avance plutôt que de le
  // laisser découvrir l'absence de l'image seulement après un export.
  async function warnIfImageUrlNotExportable(src) {
    if (!src || src.startsWith('data:')) return;
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      await resp.blob();
    } catch (e) {
      console.warn('[Editor] image probablement non exportable en PDF (CORS) :', src, e);
      window.alert(I18n.t('image.corsWarning'));
    }
  }

  // === Mode d'édition en-tête/pied de page (incrément 2.1) ===
  // Entre dans le mode (ou change de zone/variante si déjà actif) : sauvegarde
  // d'abord le contenu qu'on quitte (brouillon si on change de zone/variante,
  // snapshot du document principal si c'est la toute première entrée), puis
  // charge le fragment demandé dans l'éditeur UNIQUE via setContent.
  function enterHeaderFooterMode(zone, variant) {
    if (!editor) return;
    if (hfMode) headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    else mainDocSnapshot = editor.getHTML();
    // Le simple fait d'ouvrir ce mode vaut activation : il n'y a pas de case
    // "activer" séparée dans la sous-barre (cf. maquette du plan), seulement
    // "Première page différente" - une fois qu'un en-tête/pied a été
    // configuré, il doit s'afficher partout (éditeur/lecture/PDF, à partir
    // des incréments suivants).
    headerFooterDraft.enabled = true;
    hfMode = { zone, variant };
    editor.commands.setContent(headerFooterDraft[zone][variant] || '');
    const container = document.getElementById('editor-container');
    if (container) container.classList.add('hf-editing');
    syncToolbarState();
    renderHfPill();
    renderPaginationOverlay(); // masqué pendant hfMode (cf. sa propre garde) - fait disparaître l'aperçu le temps de l'édition
  }

  // Sauvegarde le contenu courant dans le brouillon, restaure le document
  // principal, retire l'habillage visuel. Sans effet si le mode n'est déjà
  // pas actif (`null`).
  function exitHeaderFooterMode() {
    if (!hfMode || !editor) return;
    headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    hfMode = null;
    editor.commands.setContent(mainDocSnapshot || '');
    mainDocSnapshot = null;
    const container = document.getElementById('editor-container');
    if (container) container.classList.remove('hf-editing');
    syncToolbarState();
    renderHfPill(); // hfMode redevenu null - retire la pastille (cf. sa propre garde)
    renderPaginationOverlay(); // ré-affiche l'aperçu
  }

  // Filet de sécurité appelé par v2/js/main.js AVANT Save/Enregistrer sous/
  // Export PDF/passage en Mode Lecture - sans ça, l'une de ces actions
  // lirait/enverrait le contenu d'un en-tête/pied de page chargé À LA PLACE
  // du document principal (editor.getHTML() ne sait pas dans quel mode on
  // est, il renvoie toujours ce qui est actuellement affiché).
  function exitHeaderFooterModeIfActive() {
    if (hfMode) exitHeaderFooterMode();
  }
  // v2/js/variables.js: onglet "Chips" du panneau # - une note de bas de
  // page n'a pas de sens dans une zone d'en-tête/pied (répétée sur chaque
  // page, aucun repère de page physique auquel l'ancrer), contrairement à
  // date/heure/email (cf. js/reader-mode.js:resolveHeaderFooterZone qui les
  // résout bien dans cette zone). Masquée à l'insertion plutôt que
  // silencieusement ignorée à l'export, pour ne pas laisser l'utilisateur
  // insérer une note qui ne produirait jamais aucun texte nulle part (le
  // pipeline PDF ne parcourt que le contenu du corps principal, jamais
  // l'en-tête/pied, pour construire content._footnoteBlocks).
  function isEditingHeaderFooter() { return !!hfMode; }

  // Reflète le brouillon EN COURS (zone/variante actuellement affichée
  // comprise) sans devoir sortir du mode - les appelants réels (Save/Export)
  // appellent de toute façon exitHeaderFooterModeIfActive() juste avant,
  // mais un appel pendant que le mode est encore actif reste cohérent.
  function getHeaderFooterData() {
    if (hfMode && editor) headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    return headerFooterDraft;
  }

  // Chargement d'un modèle (cf. v2/js/main.js:loadTemplateIntoEditor) - le
  // mode est déjà garanti inactif à cet instant (exitHeaderFooterModeIfActive
  // appelée juste avant côté main.js), remplace donc directement le
  // brouillon en mémoire.
  function setHeaderFooterData(data) {
    const empty = emptyHeaderFooterData();
    headerFooterDraft = data && typeof data === 'object'
      ? Object.assign(empty, data, {
          header: Object.assign({}, empty.header, data.header),
          footer: Object.assign({}, empty.footer, data.footer),
        })
      : empty;
    // Assaini ICI, au seul point d'entrée d'un en-tête/pied venant de
    // l'extérieur de l'éditeur (colonne Grist HeaderFooter, potentiellement
    // modifiable par un autre collaborateur du document sans jamais ouvrir
    // ce widget) - tout le reste de ce module (aperçu de pagination,
    // mesure, export PDF via Editor.getHeaderFooterData()) consomme
    // ensuite `headerFooterDraft` déjà propre. La saisie normale PENDANT
    // l'édition (ligne ~2360, via editor.getHTML()) reste, elle, hors de
    // portée : son HTML est déjà contraint par le schéma ProseMirror.
    headerFooterDraft.header.default = HtmlSanitize.clean(headerFooterDraft.header.default);
    headerFooterDraft.header.first = HtmlSanitize.clean(headerFooterDraft.header.first);
    headerFooterDraft.footer.default = HtmlSanitize.clean(headerFooterDraft.footer.default);
    headerFooterDraft.footer.first = HtmlSanitize.clean(headerFooterDraft.footer.first);
    renderPaginationOverlay();
  }

  // Pastille flottante d'édition d'en-tête/pied - remplace l'ancien bouton de
  // bascule + sous-barre dockée sous la toolbar (retour utilisateur : "pas
  // beau", voulait quelque chose façon Google Docs/Word). Plus de point
  // d'entrée dédié dans la toolbar : on entre en mode édition en cliquant
  // directement une zone de marge (haut/bas de page, ou une "couture" entre
  // deux pages) posée par renderPaginationOverlay ci-dessous - la pastille
  // n'apparaît QUE pendant l'édition elle-même (hfMode actif), sticky en
  // haut de #editor-container pour rester visible en scrollant. Reconstruite
  // paresseusement (une seule fois par session d'édition continue), puis
  // resynchronisée à chaque appel - cf. tous les appels dans
  // enterHeaderFooterMode/exitHeaderFooterMode.
  function renderHfPill() {
    const container = document.getElementById('editor-container');
    if (!container) return;
    let pill = document.getElementById('v2-hf-pill');
    if (!hfMode) { if (pill) pill.remove(); return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'v2-hf-pill';
      pill.className = 'v2-hf-pill';
      pill.innerHTML =
        '<span class="v2-segmented" id="v2-hf-zone-segment">'
        + `<button type="button" class="v2-segmented-btn" data-zone="header">${I18n.t('hf.zoneHeader')}</button>`
        + `<button type="button" class="v2-segmented-btn" data-zone="footer">${I18n.t('hf.zoneFooter')}</button>`
        + '</span>'
        + `<label class="v2-hf-checkbox"><input type="checkbox" id="v2-hf-different-first">${I18n.t('hf.differentFirstPage')}</label>`
        + '<span class="v2-segmented" id="v2-hf-variant-segment" hidden>'
        + `<button type="button" class="v2-segmented-btn" data-variant="default">${I18n.t('hf.variantDefault')}</button>`
        + `<button type="button" class="v2-segmented-btn" data-variant="first">${I18n.t('hf.variantFirst')}</button>`
        + '</span>'
        + '<span class="v2-hover-group" id="v2-hf-pagenum-group">'
        + `<button type="button" id="v2-hf-btn-pagenum" data-tip="${I18n.t('hf.insertPageNumber')}" aria-label="${I18n.t('hf.insertPageNumber')}"><span class="v2-hf-pagenum-icon" aria-hidden="true">#</span></button>`
        + '<span class="v2-hover-flyout v2-hover-flyout-v" id="v2-hf-pagenum-flyout">'
        + `<span class="v2-hover-row" data-pagenum-format="n">${I18n.t('hf.pagenumSimple')}</span>`
        + `<span class="v2-hover-row" data-pagenum-format="page-n">${I18n.t('hf.pagenumPageN')}</span>`
        + `<span class="v2-hover-row" data-pagenum-format="n-slash-total">${I18n.t('hf.pagenumSlash')}</span>`
        + '</span>'
        + '</span>'
        + `<button type="button" id="v2-hf-btn-done" class="v2-hf-btn-done">${I18n.t('hf.done')}</button>`;
      container.insertBefore(pill, container.firstChild);

      pill.querySelectorAll('#v2-hf-zone-segment button').forEach(btn => {
        btn.addEventListener('click', () => { if (hfMode && hfMode.zone !== btn.dataset.zone) enterHeaderFooterMode(btn.dataset.zone, hfMode.variant); });
      });
      pill.querySelectorAll('#v2-hf-variant-segment button').forEach(btn => {
        btn.addEventListener('click', () => { if (hfMode && hfMode.variant !== btn.dataset.variant) enterHeaderFooterMode(hfMode.zone, btn.dataset.variant); });
      });
      pill.querySelector('#v2-hf-different-first').addEventListener('change', (event) => {
        headerFooterDraft.differentFirstPage = event.target.checked;
        if (!event.target.checked && hfMode && hfMode.variant === 'first') enterHeaderFooterMode(hfMode.zone, 'default');
        else renderHfPill();
      });
      pill.querySelector('#v2-hf-btn-done').addEventListener('click', () => exitHeaderFooterMode());
      // mousedown+preventDefault (pas click) : même piège que les autres
      // menus déroulants de ce fichier (cf. createFloatingPanel/
      // wireDropdownButton) - un simple 'click' laisserait d'abord le
      // mousedown faire perdre le focus/la sélection ProseMirror de
      // l'en-tête/pied en cours d'édition avant que la commande ne s'exécute,
      // qui retomberait alors sur une sélection obsolète ou absente
      // (constaté : le badge ne s'insérait nulle part).
      pill.querySelectorAll('#v2-hf-pagenum-flyout .v2-hover-row').forEach(row => {
        row.addEventListener('mousedown', (event) => {
          event.preventDefault();
          editor.chain().focus().insertPageNumberBadge(row.dataset.pagenumFormat).run();
        });
      });
    }
    pill.querySelectorAll('#v2-hf-zone-segment button').forEach(btn => btn.classList.toggle('active', btn.dataset.zone === hfMode.zone));
    pill.querySelectorAll('#v2-hf-variant-segment button').forEach(btn => btn.classList.toggle('active', btn.dataset.variant === hfMode.variant));
    pill.querySelector('#v2-hf-different-first').checked = !!headerFooterDraft.differentFirstPage;
    pill.querySelector('#v2-hf-variant-segment').hidden = !headerFooterDraft.differentFirstPage;
  }

  // === Aperçu paginé réel - éditeur (incrément 2.3) ===
  // Constantes dupliquées depuis v2/js/pdf-export.js (mêmes valeurs - A4 =
  // 595.28×841.89pt, marge de base 28pt, 1pt = 96/72px) : aucun mécanisme de
  // module partagé entre les deux fichiers, même tolérance à la duplication
  // que le reste de ce projet pour ce genre de petites constantes (cf. les
  // marqueurs de numérotation des titres, dupliqués entre reader-mode.js et
  // heading-numbering.js).
  const PT_TO_PX = 96 / 72;
  const A4_PAGE_HEIGHT_PX = 841.89 * PT_TO_PX;
  // Doit matcher le padding de `.tiptap` en Aperçu A4 (css/editor-v2.css,
  // déjà 28pt convertis en px) - PAS une nouvelle valeur.
  const A4_BASE_MARGIN_PX = 37.33;
  const A4_CONTENT_WIDTH_PX = 719.04; // même valeur que CONTENT_WIDTH_PX, pdf-export.js
  const HEADER_FOOTER_GAP_PX = 10 * PT_TO_PX; // même écart que HEADER_FOOTER_GAP_PT, pdf-export.js

  // Hauteur RENDUE d'un fragment HTML, hors écran - même mécanisme que
  // attachMeasureHost côté pdf-export.js, MÊME correctif `min-height:0`
  // (`.tiptap` réserve 200px pour que l'éditeur VIDE reste cliquable, cf.
  // css/editor-v2.css - sans ce correctif un en-tête d'une seule ligne
  // mesurerait 200px, bug déjà rencontré et corrigé côté export PDF).
  function measureHtmlHeightPx(html) {
    // `<img` en plus du texte : cf. le même correctif dans updateHfZone -
    // sans lui, un en-tête/pied ne contenant qu'une image mesurait une
    // hauteur de 0, réservant AUCUNE marge pour elle (le corps du document
    // aurait alors chevauché l'image dans l'aperçu de pagination).
    if (!html || (!html.replace(/<[^>]*>/g, '').trim() && !/<img[\s>]/i.test(html))) return 0;
    const host = document.createElement('div');
    host.className = 'tiptap';
    host.innerHTML = html;
    host.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + A4_CONTENT_WIDTH_PX + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(host);
    const h = host.getBoundingClientRect().height;
    document.body.removeChild(host);
    return h;
  }

  // Limites de page : mesure les blocs de haut niveau réellement rendus dans
  // .tiptap (même principe que clampOverflowingTables plus haut), accumule
  // leur hauteur, respecte .page-break-marker comme coupure forcée. Grain du
  // BLOC, jamais de la ligne/du pixel comme pdfmake (limite assumée et
  // annoncée, cf. le plan) - un bloc entier bascule à la page suivante dès
  // qu'il ne rentre plus, jamais coupé en deux visuellement ici.
  // Retourne le bloc APRÈS lequel insérer la coupure (`afterEl`), pas un
  // simple décalage en pixels - cf. le mécanisme de réservation d'espace
  // réel ci-dessous (renderPaginationOverlay), qui a besoin d'un vrai
  // élément DOM sur lequel poser un `margin-bottom`.
  function computePageBreaks(tiptapEl, pageContentHeightPx) {
    const breaks = [];
    let consumed = 0;
    let lastBlock = null;
    Array.from(tiptapEl.children).forEach(child => {
      const height = child.getBoundingClientRect().height;
      if (child.classList.contains('page-break-marker')) {
        breaks.push({ afterEl: child, forced: true });
        consumed = 0;
        lastBlock = child;
        return;
      }
      if (consumed > 0 && consumed + height > pageContentHeightPx) {
        breaks.push({ afterEl: lastBlock, forced: false });
        consumed = height;
      } else {
        consumed += height;
      }
      lastBlock = child;
    });
    return breaks;
  }

  // Résout chaque badge .page-number-badge (posé tel quel dans le HTML
  // stocké, avec son libellé-espace-réservé - "#"/"Page #"/"#/#") en son
  // texte réel pour LA page où cette bande tombe - même conversion que
  // formatPageNumberText côté pdf-export.js (dupliquée, pas partagée).
  function resolvePageNumberBadgesForPreview(html, pageNum, totalPages) {
    const host = document.createElement('div');
    host.innerHTML = html || '';
    host.querySelectorAll('.page-number-badge').forEach(badge => {
      const format = badge.getAttribute('data-format') || 'n';
      badge.textContent = format === 'page-n' ? ('Page ' + pageNum) : format === 'n-slash-total' ? (pageNum + '/' + totalPages) : String(pageNum);
    });
    return host.innerHTML;
  }

  let paginationOverlayEl = null;
  let paginationEdgeTopEl = null;
  let paginationEdgeBottomEl = null;
  let paginationRecomputeTimer = null;
  // Réserve un vrai espace vide sous le dernier bloc d'une page (cf.
  // renderPaginationOverlay) via une FEUILLE DE STYLE dédiée (règles
  // `:nth-child`), PAS un style inline posé directement sur le bloc : un
  // style inline sur un nœud géré par ProseMirror s'est avéré silencieusement
  // ANNULÉ peu après (constaté en conditions réelles - présent juste après
  // l'appel, disparu à la vérification suivante) - ProseMirror surveille les
  // mutations DOM sur les nœuds qu'il gère et "répare" tout ce qu'il n'a pas
  // lui-même produit via une transaction, y compris un simple attribut style
  // (même famille de piège que project_quill_mutation_observer, qui ne
  // concernait jusqu'ici que des enfants DOM ajoutés à la main). Une feuille
  // de style EXTERNE ciblant les blocs par POSITION (`:nth-child`) ne modifie
  // en revanche RIEN sur les nœuds eux-mêmes (ni attribut, ni enfant) - hors
  // de portée de cette surveillance, donc jamais annulée.
  let paginationMarginStyleEl = null;
  function ensurePaginationMarginStyle() {
    if (!paginationMarginStyleEl) {
      paginationMarginStyleEl = document.createElement('style');
      paginationMarginStyleEl.id = 'v2-pagination-margins-style';
      document.head.appendChild(paginationMarginStyleEl);
    }
    return paginationMarginStyleEl;
  }
  function clearPageBreakMargins() {
    if (paginationMarginStyleEl) paginationMarginStyleEl.textContent = '';
  }
  function schedulePaginationRecompute() {
    if (paginationRecomputeTimer) clearTimeout(paginationRecomputeTimer);
    paginationRecomputeTimer = setTimeout(renderPaginationOverlay, 200);
  }
  function clearPaginationOverlay() {
    if (paginationOverlayEl) paginationOverlayEl.innerHTML = '';
    if (paginationEdgeTopEl && paginationEdgeTopEl.parentNode) paginationEdgeTopEl.parentNode.removeChild(paginationEdgeTopEl);
    if (paginationEdgeBottomEl && paginationEdgeBottomEl.parentNode) paginationEdgeBottomEl.parentNode.removeChild(paginationEdgeBottomEl);
    paginationEdgeTopEl = null; paginationEdgeBottomEl = null;
    clearPageBreakMargins();
  }

  // Zones de marge cliquables (façon Google Docs/Word) : un clic (zone vide
  // ou déjà remplie) appelle enterHeaderFooterMode(zone, variant) - aucun
  // bouton de toolbar dédié, cf. renderHfPill pour la pastille flottante
  // visible pendant l'édition. Recalculées au fil de la frappe (débounce,
  // cf. schedulePaginationRecompute) ; masquées si Aperçu A4 désactivé ou
  // édition d'en-tête/pied déjà en cours (hfMode).
  //
  // Deux natures de zones : le début/la fin du document ont un vrai espace
  // libre avant/après `.tiptap`, donc de VRAIS éléments DOM en flux normal
  // (`.v2-page-edge-spacer`, dans `.v2-page-sheet`, JAMAIS enfants de
  // `.tiptap` lui-même - cf. mémoire project_quill_mutation_observer pour
  // pourquoi). Les limites INTERMÉDIAIRES (entre deux pages) n'ont pas
  // d'espace naturel - le contenu défile sans interruption - donc restent
  // de purs overlays `position:absolute` posés dans un espace réservé
  // exprès (`margin-bottom` sur le dernier bloc de la page, cf.
  // pageBreakMarginEls plus bas), affichées dès que le document dépasse
  // une page même sans en-tête/pied configuré (repère "Page N" par défaut).
  function ensureEdgeZone(pageSheet, tiptapEl, pos) {
    if (pos === 'top' && !paginationEdgeTopEl) {
      paginationEdgeTopEl = document.createElement('div');
      paginationEdgeTopEl.className = 'v2-page-edge-spacer v2-page-edge-top v2-hf-zone';
      pageSheet.insertBefore(paginationEdgeTopEl, tiptapEl);
    }
    if (pos === 'bottom' && !paginationEdgeBottomEl) {
      paginationEdgeBottomEl = document.createElement('div');
      paginationEdgeBottomEl.className = 'v2-page-edge-spacer v2-page-edge-bottom v2-hf-zone';
      pageSheet.insertBefore(paginationEdgeBottomEl, tiptapEl.nextSibling);
    }
  }
  function updateHfZone(el, html, pageNum, totalPages, zone, variant, ghostLabel) {
    const resolved = html ? resolvePageNumberBadgesForPreview(html, pageNum, totalPages) : '';
    // `<img` en plus du texte : un en-tête/pied ne contenant QU'une image
    // (aucun texte autour) avait tout son HTML dépouillé de balises par ce
    // test, chaîne vide restante - traité à tort comme "zone vide", affichant
    // l'accroche fantôme "+ Ajouter..." à la place de l'image réellement
    // configurée (même bug, même correctif que resolveZone dans
    // pdf-export.js, trouvé en ajoutant la prise en charge des images ici).
    const hasContent = !!(resolved.replace(/<[^>]*>/g, '').trim() || /<img[\s>]/i.test(resolved));
    el.classList.toggle('v2-hf-zone-empty', !hasContent);
    el.classList.toggle('v2-hf-zone-filled', hasContent);
    el.innerHTML = hasContent
      ? '<div class="v2-hf-zone-body">' + resolved + '</div><span class="v2-hf-zone-pencil" aria-hidden="true"></span>'
      : '<span class="v2-hf-zone-ghost"><span aria-hidden="true">+</span> ' + ghostLabel + '</span>';
    el.onclick = () => enterHeaderFooterMode(zone, variant);
  }
  function renderPaginationOverlay() {
    const container = document.getElementById('editor-container');
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!container || !tiptapEl) return;
    if (hfMode || !container.classList.contains('a4-preview')) { clearPaginationOverlay(); return; }

    if (!paginationOverlayEl) {
      paginationOverlayEl = document.createElement('div');
      paginationOverlayEl.className = 'v2-pagination-overlay';
      container.appendChild(paginationOverlayEl);
    }
    paginationOverlayEl.innerHTML = '';

    const enabled = !!headerFooterDraft.enabled;
    const differentFirstPage = enabled && !!headerFooterDraft.differentFirstPage;
    const headerHtml = enabled ? headerFooterDraft.header.default : null;
    const headerFirstHtml = differentFirstPage ? headerFooterDraft.header.first : null;
    const footerHtml = enabled ? headerFooterDraft.footer.default : null;
    const footerFirstHtml = differentFirstPage ? headerFooterDraft.footer.first : null;
    const headerForPage = n => (n === 1 && differentFirstPage) ? headerFirstHtml : headerHtml;
    const footerForPage = n => (n === 1 && differentFirstPage) ? footerFirstHtml : footerHtml;

    const headerHeightPx = enabled ? Math.max(measureHtmlHeightPx(headerHtml), measureHtmlHeightPx(headerFirstHtml)) : 0;
    const footerHeightPx = enabled ? Math.max(measureHtmlHeightPx(footerHtml), measureHtmlHeightPx(footerFirstHtml)) : 0;
    const topExtraPx = headerHeightPx ? headerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const bottomExtraPx = footerHeightPx ? footerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const pageContentHeightPx = Math.max(50, A4_PAGE_HEIGHT_PX - 2 * A4_BASE_MARGIN_PX - topExtraPx - bottomExtraPx);
    // Nettoie AVANT de recalculer (cf. sa propre doc) - le bloc "dernier de
    // la page" à une frontière donnée peut changer d'une frappe à l'autre,
    // laisser une ancienne marge orpheline gonflerait le document à tort.
    clearPageBreakMargins();
    const breaks = computePageBreaks(tiptapEl, pageContentHeightPx);
    const totalPages = breaks.length + 1;

    // `.v2-page-sheet` : enveloppe permanente posée UNE SEULE FOIS autour de
    // `.tiptap` à la création de l'éditeur (cf. init()) - les zones de bord
    // vivent DEDANS (collées à `.tiptap`, cf. css/editor-v2.css), plus en
    // frères directs de #editor-container.
    const pageSheet = tiptapEl.parentElement;
    ensureEdgeZone(pageSheet, tiptapEl, 'top');
    ensureEdgeZone(pageSheet, tiptapEl, 'bottom');
    updateHfZone(paginationEdgeTopEl, headerForPage(1), 1, totalPages, 'header', differentFirstPage ? 'first' : 'default', 'Ajouter un en-tête');
    updateHfZone(paginationEdgeBottomEl, footerForPage(totalPages), totalPages, totalPages, 'footer', (totalPages === 1 && differentFirstPage) ? 'first' : 'default', 'Ajouter un pied de page');

    const tiptapOffsetLeft = tiptapEl.offsetLeft;
    const tiptapWidth = tiptapEl.getBoundingClientRect().width;
    const tiptapRect = tiptapEl.getBoundingClientRect();

    // Limites intermédiaires - une bande par frontière entre 2 pages.
    // Toujours affichées dès que le document dépasse une page - même sans
    // aucun en-tête/pied configuré (retour utilisateur : la pagination
    // automatique doit se voir dès "beaucoup de lignes", pas seulement via
    // un saut de page forcé) : à défaut de contenu à afficher, un simple
    // trait "— Page N —" marque quand même la coupure automatique. Ces
    // coutures représentent le VRAI saut entre deux pages PHYSIQUES
    // (contrairement aux zones de bord ci-dessus, qui vivent SUR la même
    // page que le corps) - restent donc volontairement une carte distincte,
    // jamais "collées" au texte.
    //
    // Un VRAI espace vide est réservé sous `afterEl` plutôt que de superposer
    // la bande en `position:absolute` par-dessus le texte qui continuerait de
    // défiler sans interruption - signalé par l'utilisateur : du texte se
    // retrouvait visuellement SOUS les bandes d'en-tête/pied entre deux
    // pages. Réservé via une règle CSS `:nth-child` dans une feuille de style
    // dédiée (cf. ensurePaginationMarginStyle) plutôt qu'un style inline posé
    // directement sur `afterEl` : un style inline sur un nœud géré par
    // ProseMirror s'est avéré silencieusement ANNULÉ peu après (ProseMirror
    // "répare" toute mutation DOM qu'il n'a pas lui-même produite via une
    // transaction, même un simple attribut style - constaté en conditions
    // réelles). Une règle CSS externe ciblant par POSITION ne modifie RIEN
    // sur le nœud lui-même, hors de portée de cette surveillance.
    const marginRules = [];
    const tiptapChildren = Array.from(tiptapEl.children);
    breaks.forEach((brk, i) => {
      const pageEnding = i + 1;
      const pageStarting = i + 2;
      const footerText = enabled ? footerForPage(pageEnding) : null;
      const headerText = enabled ? headerForPage(pageStarting) : null;
      const seam = document.createElement('div');
      if (!footerText && !headerText) {
        seam.className = 'v2-page-band v2-page-break-line';
        seam.innerHTML = '<span class="v2-page-break-label">Page ' + pageStarting + '</span>';
      } else {
        seam.className = 'v2-page-band v2-page-seam';
        if (footerText) {
          const f = document.createElement('div');
          f.className = 'v2-page-band-footer v2-hf-zone v2-hf-zone-filled';
          f.innerHTML = resolvePageNumberBadgesForPreview(footerText, pageEnding, totalPages);
          f.onclick = () => enterHeaderFooterMode('footer', (pageEnding === 1 && differentFirstPage) ? 'first' : 'default');
          seam.appendChild(f);
        }
        const divider = document.createElement('div');
        divider.className = 'v2-page-seam-divider';
        seam.appendChild(divider);
        if (headerText) {
          const h = document.createElement('div');
          h.className = 'v2-page-band-header v2-hf-zone v2-hf-zone-filled';
          h.innerHTML = resolvePageNumberBadgesForPreview(headerText, pageStarting, totalPages);
          h.onclick = () => enterHeaderFooterMode('header', 'default'); // pageStarting >= 2 toujours dans une couture
          seam.appendChild(h);
        }
      }
      paginationOverlayEl.appendChild(seam);
      seam.style.left = tiptapOffsetLeft + 'px';
      seam.style.width = tiptapWidth + 'px';
      const seamHeight = seam.getBoundingClientRect().height;
      // Réserve l'espace AVANT de positionner : `afterEl` ne bouge pas à
      // cause de sa PROPRE marge (une marge est hors de la boîte de bordure
      // de l'élément), donc son rect mesuré juste après reste correct pour
      // placer la bande exactement dans le vide ainsi ouvert. Écrit la
      // feuille de style à CHAQUE itération (pas une seule fois à la fin) :
      // la coupure suivante doit voir l'effet des marges déjà posées avant
      // de mesurer sa propre position (elles se cumulent dans le flux réel).
      const nthChild = tiptapChildren.indexOf(brk.afterEl) + 1;
      marginRules.push('#editor-container .tiptap > *:nth-child(' + nthChild + ') { margin-bottom: ' + seamHeight + 'px; }');
      ensurePaginationMarginStyle().textContent = marginRules.join('\n');
      const afterRect = brk.afterEl.getBoundingClientRect();
      seam.style.top = (tiptapEl.offsetTop + (afterRect.bottom - tiptapRect.top)) + 'px';
    });
  }

  // Icônes de la toolbar statique (posées en JS plutôt que dans le HTML : une
  // seule source de vérité pour les tracés SVG, partagée avec les toolbars
  // flottantes ci-dessus/ci-dessous qui doivent de toute façon construire
  // leur contenu en JS - cf. v2/js/icons.js).
  function applyToolbarIcons() {
    const set = (id, icon) => { const el = document.getElementById(id); if (el) el.innerHTML = Icons.svg(icon); };
    set('v2-btn-bold', 'bold'); set('v2-btn-italic', 'italic');
    set('v2-btn-underline', 'underline'); set('v2-btn-strike', 'strike');
    set('v2-btn-align-left', 'alignLeft'); set('v2-btn-align-center', 'alignCenter');
    set('v2-btn-align-right', 'alignRight'); set('v2-btn-align-justify', 'alignJustify');
    // v2-btn-align-main : icône initiale, resynchronisée dès le premier appel
    // de syncToolbarState avec l'alignement réel du curseur.
    set('v2-btn-align-main', 'alignLeft');
    set('v2-btn-bullet', 'bulletList');
    set('v2-btn-bullet-disc', 'bulletDisc'); set('v2-btn-bullet-circle', 'bulletCircle'); set('v2-btn-bullet-square', 'bulletSquare');
    set('v2-btn-ordered-numeric', 'orderedList'); set('v2-btn-ordered-alpha', 'orderedAlpha'); set('v2-btn-ordered-roman', 'orderedRoman');
    set('v2-btn-checklist-accent-strike', 'checklistAccentStrike');
    set('v2-btn-checklist-classic', 'checklistClassic');
    set('v2-btn-checklist-accent-plain', 'checklistAccentPlain');
    set('v2-btn-outdent', 'outdent'); set('v2-btn-indent', 'indent');
    set('v2-btn-table', 'table');
    set('v2-btn-two-columns', 'twoColumns'); set('v2-btn-image', 'image');
    set('v2-btn-page-break', 'pageBreak'); set('v2-btn-toc', 'toc');
    set('v2-btn-undo', 'undo'); set('v2-btn-redo', 'redo');
    set('v2-highlight-icon', 'highlight');
    set('v2-color-text-caret', 'caretDown'); set('v2-color-highlight-caret', 'caretDown');
    set('v2-font-chip-caret', 'caretDown');
  }

  // Retour visuel d'état actif (aucun jusqu'ici : un bouton gras ne montrait
  // pas que le curseur est déjà dans du texte en gras). Recalculé à chaque
  // sélection/transaction plutôt que seulement au clic, pour rester juste
  // aussi quand la sélection change au clavier/à la souris sans passer par la
  // toolbar. Inclut aussi `v2-header-select`, pour la même raison (montrer
  // "Titre 2" quand le curseur est dans un H2, pas seulement "Normal" figé).
  function syncToolbarState() {
    const setActive = (id, isActive) => { const el = document.getElementById(id); if (el) el.classList.toggle('is-active', !!isActive); };
    setActive('v2-btn-bold', editor.isActive('bold'));
    setActive('v2-btn-italic', editor.isActive('italic'));
    setActive('v2-btn-underline', editor.isActive('underline'));
    setActive('v2-btn-strike', editor.isActive('strike'));
    setActive('v2-btn-align-left', editor.isActive({ textAlign: 'left' }));
    setActive('v2-btn-align-center', editor.isActive({ textAlign: 'center' }));
    setActive('v2-btn-align-right', editor.isActive({ textAlign: 'right' }));
    setActive('v2-btn-align-justify', editor.isActive({ textAlign: 'justify' }));
    // Bouton principal du groupe survol "Alignement" (maquette "Options au
    // survol") : montre TOUJOURS l'alignement réel du curseur (gauche par
    // défaut, valeur par défaut de l'extension TextAlign) - currentAlign est
    // relu par son propre gestionnaire de clic pour le réappliquer tel quel.
    const aligns = ['left', 'center', 'right', 'justify'];
    currentAlign = aligns.find(a => editor.isActive({ textAlign: a })) || 'left';
    const alignMain = document.getElementById('v2-btn-align-main');
    if (alignMain) alignMain.innerHTML = Icons.svg('align' + currentAlign[0].toUpperCase() + currentAlign.slice(1));
    // Bouton "Liste" fusionné (puces + numéros + cases à cocher, cf. maquette
    // de simplification demandée) : actif dès qu'UN des trois types l'est.
    setActive('v2-btn-bullet', editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList'));
    const bulletStyle = editor.isActive('bulletList') ? (editor.getAttributes('bulletList').bulletStyle || 'disc') : null;
    setActive('v2-btn-bullet-disc', bulletStyle === 'disc');
    setActive('v2-btn-bullet-circle', bulletStyle === 'circle');
    setActive('v2-btn-bullet-square', bulletStyle === 'square');
    const orderedStyle = editor.isActive('orderedList') ? (editor.getAttributes('orderedList').numberStyle || 'decimal') : null;
    setActive('v2-btn-ordered-numeric', orderedStyle === 'decimal');
    setActive('v2-btn-ordered-alpha', orderedStyle === 'alpha');
    setActive('v2-btn-ordered-roman', orderedStyle === 'roman');
    const taskListStyle = editor.isActive('taskList') ? (editor.getAttributes('taskList').taskListStyle || 'accentStrike') : null;
    setActive('v2-btn-checklist-accent-strike', taskListStyle === 'accentStrike');
    setActive('v2-btn-checklist-classic', taskListStyle === 'classic');
    setActive('v2-btn-checklist-accent-plain', taskListStyle === 'accentPlain');
    const setDisabled = (id, disabled) => { const el = document.getElementById(id); if (el) el.disabled = !!disabled; };
    setDisabled('v2-btn-indent', !editor.can().sinkListItem('listItem'));
    setDisabled('v2-btn-outdent', !editor.can().liftListItem('listItem'));
    // Mode en-tête/pied de page (incrément 2.1) : grise (pointer-events, cf.
    // .v2-hf-locked dans css/toolbar-v2.css) tableau/2-colonnes/saut de
    // page/sommaire/numérotation des titres - aucun sens dans ce contexte
    // (cf. calibration utilisateur du plan). Le schéma ProseMirror reste
    // UNIQUE et partagé (compromis assumé) : seuls les BOUTONS sont bloqués.
    // Image RETIRÉE de cette liste (demande utilisateur ultérieure) : une
    // image "au cœur du texte" (flux normal) s'exporte très bien dans un
    // en-tête/pied (htmlToPdfContent est générique, aucun câblage
    // supplémentaire nécessaire) - seul le calque devant/derrière reste
    // verrouillé (cf. wireImageFloatingToolbar), faute de résolution de
    // position pour ce cas dans pdf-export.js (pas de pagination à l'intérieur
    // d'un en-tête/pied, mais pas non plus câblé pour l'instant).
    const inHfMode = !!hfMode;
    const setLocked = (id, locked) => { const el = document.getElementById(id); if (el) el.classList.toggle('v2-hf-locked', !!locked); };
    setLocked('v2-btn-table', inHfMode);
    setLocked('v2-btn-two-columns', inHfMode);
    setLocked('v2-btn-page-break', inHfMode);
    setLocked('v2-btn-toc', inHfMode);
    // Numérotation seule verrouillée (pas tout le menu Titre fusionné, cf.
    // v2/index.html #v2-heading-flyout) : un niveau de titre garde un sens
    // dans un en-tête/pied, la numérotation (qui ne compte que les titres du
    // flux principal) non - même raison que l'ancienne pastille séparée.
    setLocked('v2-numbering-seg', inHfMode);
    const headerSelect = document.getElementById('v2-header-select');
    if (headerSelect) {
      let value = 'p';
      for (let level = 1; level <= 6; level++) { if (editor.isActive('heading', { level })) value = String(level); }
      if (headerSelect.value !== value) headerSelect.value = value;
      const chipVal = document.getElementById('v2-heading-chip-val');
      if (chipVal) chipVal.textContent = value === 'p' ? 'Normal' : 'Titre ' + value;
      const headingFlyout = document.getElementById('v2-heading-flyout');
      if (headingFlyout) {
        headingFlyout.querySelectorAll('.v2-hover-row[data-level]').forEach(row => {
          row.classList.toggle('is-active', row.dataset.level === value);
        });
      }
    }
    const textStyleAttrs = editor.getAttributes('textStyle');
    setColorIcon('v2-text-color-icon', textStyleAttrs.color || null);
    setColorIcon('v2-highlight-icon', textStyleAttrs.backgroundColor || null);
    // Polices/tailles : les swatches de couleur ci-dessus étaient déjà
    // synchronisés sur le curseur, mais PAS ces deux <select> (signalé par
    // l'utilisateur - ex. curseur en Arial 15pt sans que la toolbar ne le
    // montre). Repli sur la police/taille RÉELLEMENT rendue en l'absence de
    // marque explicite (Roboto/10.5pt, cf. `.tiptap` dans editor-v2.css et
    // DEFAULT_FONT_SIZE dans pdf-export.js - les deux valeurs concordent
    // déjà, 14px = 10.5pt à 96dpi) plutôt qu'un vide "Police"/"Taille" qui
    // n'affichait jamais rien tant que l'utilisateur n'avait pas cliqué
    // explicitement un réglage (signalé par l'utilisateur : les valeurs par
    // défaut au clavier ne s'affichaient jamais).
    const fontChipVal = document.getElementById('v2-font-chip-val');
    if (fontChipVal) { const value = textStyleAttrs.fontFamily || 'Roboto'; if (fontChipVal.textContent !== value) fontChipVal.textContent = value; }
    const sizeChipVal = document.getElementById('v2-size-chip-val');
    if (sizeChipVal) { const value = textStyleAttrs.fontSize || '10.5pt'; if (sizeChipVal.textContent !== value) sizeChipVal.textContent = value; }
  }

  async function init() {
    const { Editor: TiptapEditor, Extension, Node, mergeAttributes } = await import('@tiptap/core');
    const { StarterKit } = await import('@tiptap/starter-kit');
    const { TextAlign } = await import('@tiptap/extension-text-align');
    const { TextStyle } = await import('@tiptap/extension-text-style');
    const { FontFamily } = await import('@tiptap/extension-font-family');
    const { Suggestion } = await import('@tiptap/suggestion');
    const { Table } = await import('@tiptap/extension-table');
    const { TableRow } = await import('@tiptap/extension-table-row');
    const { TableCell } = await import('@tiptap/extension-table-cell');
    const { TableHeader } = await import('@tiptap/extension-table-header');
    const { TaskList } = await import('@tiptap/extension-task-list');
    const { TaskItem } = await import('@tiptap/extension-task-item');
    const { computePosition, offset, flip, shift, autoUpdate } = await import('@floating-ui/dom');
    floatingUi = { computePosition, offset, flip, shift, autoUpdate };
    let EditorStateClass;
    ({ NodeSelection: NodeSelectionClass, TextSelection: TextSelectionClass, EditorState: EditorStateClass } = await import('prosemirror-state'));

    const VarBadge = createVarBadgeNode(Node, mergeAttributes);
    const PageNumberBadge = createPageNumberBadgeNode(Node, mergeAttributes);
    const SmartChip = createSmartChipNode(Node, mergeAttributes);
    const FootnoteRef = createFootnoteRefNode(Node, mergeAttributes);
    const FontSize = createFontSizeExtension(Extension);
    const TextColor = createTextColorExtension(Extension);
    const HighlightColor = createHighlightExtension(Extension);
    const BulletStyle = createBulletStyleExtension(Extension);
    const OrderedListStyle = createOrderedListStyleExtension(Extension);
    const TaskListStyle = createTaskListStyleExtension(Extension);
    const TableHeaderWithBg = withCellBackground(TableHeader);
    const TableCellWithBg = withCellBackground(TableCell);
    const { TwoColumnsColumn, TwoColumnsZone } = createTwoColumnsNodes(Node, mergeAttributes);
    const EditorImage = createEditorImageNode(Node);
    const PageBreak = createPageBreakNode(Node);
    const HeadingNumberingConfig = createHeadingNumberingConfigNode(Node);
    const Toc = createTocNode(Node);

    editor = new TiptapEditor({
      element: document.getElementById('editor-container'),
      onUpdate: ({ editor: updatedEditor }) => { backfillAutoColumnWidths(updatedEditor); clampOverflowingTables(updatedEditor); schedulePaginationRecompute(); refreshVariableBadgeValidity(); },
      // Collage d'image depuis le presse-papiers (cf. pasteImageFile plus
      // haut) : ne consomme QUE si le presse-papiers contient réellement une
      // image (`item.type` préfixé "image/") - un collage de texte normal,
      // bien plus fréquent, doit continuer de suivre le traitement natif de
      // ProseMirror (return false), jamais intercepté ici.
      editorProps: {
        handlePaste(view, event) {
          const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
          const imageItem = items.find(item => item.kind === 'file' && item.type && item.type.startsWith('image/'));
          if (!imageItem) return false;
          const file = imageItem.getAsFile();
          if (!file) return false;
          event.preventDefault();
          pasteImageFile(file);
          return true;
        },
      },
      extensions: [
        StarterKit,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TextStyle,
        FontFamily,
        FontSize,
        TextColor,
        HighlightColor,
        BulletStyle,
        OrderedListStyle,
        // Case à cocher : extension officielle plutôt qu'un nœud maison (même
        // logique que Table/TwoColumns) - nested:false, pas besoin d'imbriquer
        // une case dans une autre pour ce besoin.
        TaskList,
        TaskItem.configure({ nested: false }),
        TaskListStyle,
        VarBadge,
        PageNumberBadge,
        SmartChip,
        FootnoteRef,
        Variables.createExtension(Extension, Suggestion),
        // Tableau : extensions officielles, colonnes redimensionnables (même
        // comportement de poignée que la V1, cf. mémoire
        // project_table_resize_handle_regression) - validées dans
        // v2/smoke-test.html avec du contenu riche réel dans une cellule.
        Table.configure({ resizable: true }),
        TableRow,
        TableHeaderWithBg,
        TableCellWithBg,
        TwoColumnsColumn,
        TwoColumnsZone,
        EditorImage,
        PageBreak,
        HeadingNumberingConfig,
        Toc,
        createTabNavigationExtension(Extension),
        createClearHistoryExtension(Extension, EditorStateClass),
      ],
      content: '',
    });

    // Enveloppe UNE SEULE FOIS, à la création - jamais re-enveloppé/déplacé
    // ensuite (cf. renderPaginationOverlay, qui lit juste tiptapEl.parentElement
    // à chaque appel). Porte le fond/liseré "page" en Aperçu A4 à la place de
    // `.tiptap` lui-même (cf. css/editor-v2.css:.v2-page-sheet) pour que les
    // zones d'en-tête/pied de page (posées DEDANS, cf. ensureEdgeZone) restent
    // visuellement COLLÉES au corps - une seule "feuille" continue plutôt que
    // 3 cartes séparées par un espace, au plus près de ce que sera la vraie
    // page exportée (retour utilisateur). `.tiptap` lui-même n'est JAMAIS
    // déplacé/recréé par cette opération, seul son parent change - sans
    // risque pour ProseMirror (qui ne connaît que ses propres descendants).
    const pageSheet = document.createElement('div');
    pageSheet.className = 'v2-page-sheet';
    editor.view.dom.parentNode.insertBefore(pageSheet, editor.view.dom);
    pageSheet.appendChild(editor.view.dom);

    wireToolbar();
    wireColorPickers();
    wireTableFloatingToolbar();
    wireImageFloatingToolbar();
    wireVariableFloatingToolbar();
    editor.on('selectionUpdate', syncToolbarState);
    editor.on('transaction', syncToolbarState);
    window.addEventListener('resize', schedulePaginationRecompute);
    return editor;
  }

  // Une seule instance, une seule toolbar : chaque bouton appelle directement
  // une commande TipTap sur la sélection réelle - plus besoin de savoir "suis-je
  // dans une cellule/colonne" avant d'agir (contrairement à l'éditeur V1), et
  // plus aucun execCommand.
  function wireToolbar() {
    applyToolbarIcons();
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('v2-btn-bold', () => editor.chain().focus().toggleBold().run());
    bind('v2-btn-italic', () => editor.chain().focus().toggleItalic().run());
    bind('v2-btn-underline', () => editor.chain().focus().toggleUnderline().run());
    bind('v2-btn-strike', () => editor.chain().focus().toggleStrike().run());
    bind('v2-btn-align-left', () => editor.chain().focus().setTextAlign('left').run());
    bind('v2-btn-align-center', () => editor.chain().focus().setTextAlign('center').run());
    bind('v2-btn-align-right', () => editor.chain().focus().setTextAlign('right').run());
    bind('v2-btn-align-justify', () => editor.chain().focus().setTextAlign('justify').run());
    // Bouton principal du groupe survol - réapplique l'alignement qu'il
    // montre actuellement (currentAlign, tenu à jour par syncToolbarState) ;
    // les 4 boutons ci-dessus vivent maintenant dans le panneau révélé au
    // survol (cf. v2/index.html .v2-hover-flyout), inchangés sinon.
    bind('v2-btn-align-main', () => editor.chain().focus().setTextAlign(currentAlign).run());
    bind('v2-btn-bullet', () => editor.chain().focus().toggleBulletList().run());
    // Styles de puce, révélés au survol du bouton "Liste à puces" (maquette
    // "Options au survol") - crée la liste si le curseur n'y est pas encore,
    // sinon change juste le style de la liste existante à cet endroit.
    const applyBulletStyle = (style) => {
      const chain = editor.chain().focus();
      if (!editor.isActive('bulletList')) chain.toggleBulletList();
      chain.updateAttributes('bulletList', { bulletStyle: style }).run();
    };
    bind('v2-btn-bullet-disc', () => applyBulletStyle('disc'));
    bind('v2-btn-bullet-circle', () => applyBulletStyle('circle'));
    bind('v2-btn-bullet-square', () => applyBulletStyle('square'));
    // Styles de numérotation, révélés dans le même panneau au survol (liste
    // "fusionnée" puces+numéros demandée) - même logique que les styles de
    // puce ci-dessus (crée la liste si besoin, sinon change juste le style).
    const applyOrderedStyle = (style) => {
      const chain = editor.chain().focus();
      if (!editor.isActive('orderedList')) chain.toggleOrderedList();
      chain.updateAttributes('orderedList', { numberStyle: style }).run();
    };
    bind('v2-btn-ordered-numeric', () => applyOrderedStyle('decimal'));
    bind('v2-btn-ordered-alpha', () => applyOrderedStyle('alpha'));
    bind('v2-btn-ordered-roman', () => applyOrderedStyle('roman'));
    // Styles de case à cocher, mêmes trois maquettes que celles proposées à
    // l'utilisateur (accent+barré/classique/accent sans barré) - crée la
    // liste si besoin, sinon change juste le style de la liste existante à
    // cet endroit (même logique que applyBulletStyle/applyOrderedStyle).
    const applyTaskListStyle = (style) => {
      const chain = editor.chain().focus();
      if (!editor.isActive('taskList')) chain.toggleTaskList();
      chain.updateAttributes('taskList', { taskListStyle: style }).run();
    };
    bind('v2-btn-checklist-accent-strike', () => applyTaskListStyle('accentStrike'));
    bind('v2-btn-checklist-classic', () => applyTaskListStyle('classic'));
    bind('v2-btn-checklist-accent-plain', () => applyTaskListStyle('accentPlain'));
    // Réutilisent les mêmes commandes que le Tab/Shift-Tab clavier dans une
    // liste (cf. createTabNavigationExtension) - sans effet (no-op, jamais
    // d'erreur) hors d'une liste, d'où l'état désactivé posé dans
    // syncToolbarState plutôt qu'un masquage complet du bouton.
    bind('v2-btn-outdent', () => editor.chain().focus().liftListItem('listItem').run());
    bind('v2-btn-indent', () => editor.chain().focus().sinkListItem('listItem').run());
    // withHeaderRow: false - un tableau inséré n'a pas de style de première
    // ligne différent des autres (signalé par l'utilisateur : gras + fond
    // coloré inattendus par défaut, cf. aussi css/editor-v2.css).
    bind('v2-btn-table', () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run());
    // Gestion ligne/colonne/suppression de tableau : déplacée vers la
    // toolbar flottante contextuelle, cf. wireTableFloatingToolbar.
    bind('v2-btn-two-columns', () => editor.chain().focus().insertTwoColumns().run());
    bind('v2-btn-image', async () => {
      const url = window.prompt(I18n.t('image.urlPrompt'));
      if (!url) return;
      await insertImageAtDefaultSize(url);
      warnIfImageUrlNotExportable(url);
    });
    bind('v2-btn-image-from-variable', () => openImageVariablePicker(document.getElementById('v2-btn-image-from-variable')));
    bind('v2-btn-page-break', () => editor.chain().focus().insertPageBreak().run());
    bind('v2-btn-toc', () => editor.chain().focus().insertToc().run());
    bind('v2-btn-undo', () => editor.chain().focus().undo().run());
    bind('v2-btn-redo', () => editor.chain().focus().redo().run());

    wireHeadingMenu();
    wireSelectionDependentSelects();
    wireCompactFontSizeControls();
  }

  // Menu "Titre" fusionné (niveau de titre + numérotation des titres, cf.
  // v2/index.html #v2-heading-flyout - demande utilisateur de regrouper les
  // deux réglages jusqu'ici séparés : un <select> natif en tout début de
  // barre, et une pastille de numérotation isolée bien plus loin). Les DEUX
  // réglages restent portés par un <select> caché comme source de vérité
  // (v2-header-select/v2-heading-numbering-select, cf. css/toolbar-v2.css) -
  // les lignes/boutons visibles du flyout ne font que poser sa valeur puis
  // redéclencher 'change', réutilisant tel quel le câblage déjà en place
  // ailleurs (bindSelect('v2-header-select', ...) dans
  // wireSelectionDependentSelects pour le niveau de titre) plutôt que de le
  // dupliquer. Aucune capture/restauration de sélection nécessaire ici
  // (contrairement à un vrai <select> natif) : un <span>/<button> cliqué
  // dans ce flyout ne vole jamais le focus de l'éditeur au survol/clic comme
  // le ferait l'ouverture d'un <select>, la sélection ProseMirror reste donc
  // intacte au moment où la commande s'applique.
  function wireHeadingMenu() {
    const headerSelect = document.getElementById('v2-header-select');
    const flyout = document.getElementById('v2-heading-flyout');
    if (headerSelect && flyout) {
      flyout.querySelectorAll('.v2-hover-row[data-level]').forEach(row => {
        row.addEventListener('click', () => {
          if (headerSelect.value === row.dataset.level) return;
          headerSelect.value = row.dataset.level;
          headerSelect.dispatchEvent(new Event('change'));
        });
      });
    }
    // Réglage de DOCUMENT (numérotation des titres), pas une mise en forme de
    // sélection : pas besoin de capturer/restaurer la sélection texte, seul
    // le focus est rendu à l'éditeur par confort. Le data-attribute est posé
    // AVANT de dispatcher la commande (qui déclenche elle-même, synchronement,
    // le rafraîchissement du sommaire via son NodeView) afin que ce
    // rafraîchissement lise déjà la bonne valeur.
    const select = document.getElementById('v2-heading-numbering-select');
    if (!select) return;
    select.addEventListener('change', () => {
      editor.view.dom.dataset.headingStyle = select.value;
      editor.chain().setHeadingNumberingStyle(select.value).focus().run();
    });
    if (!flyout) return;
    const numButtons = flyout.querySelectorAll('#v2-numbering-seg [data-num]');
    const syncActiveNum = () => numButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.num === select.value));
    numButtons.forEach(btn => btn.addEventListener('click', () => {
      if (select.value === btn.dataset.num) return;
      select.value = btn.dataset.num;
      select.dispatchEvent(new Event('change'));
      syncActiveNum();
    }));
    // Lu à la volée à chaque survol plutôt que poussé en continu : la valeur
    // peut aussi changer sans passer par ici (chargement d'un modèle, cf.
    // v2/js/main.js:loadTemplateIntoEditor qui pose select.value directement).
    const group = document.getElementById('v2-heading-group');
    if (group) group.addEventListener('mouseenter', syncActiveNum);
    syncActiveNum();
  }

  // Un <select>, contrairement à un <button>, vole le focus dès le
  // pointerdown (avant 'change') - la sélection à mettre en forme doit donc
  // être capturée à ce moment puis restaurée avant d'appliquer la commande.
  function wireSelectionDependentSelects() {
    const { captureSelection, withSavedSelection } = createSelectionPreserver();
    const bindSelect = (id, onChange) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', captureSelection);
      el.addEventListener('change', () => onChange(el.value));
    };
    bindSelect('v2-header-select', value => withSavedSelection(chain => {
      if (value === 'p') chain.setParagraph(); else chain.toggleHeading({ level: parseInt(value, 10) });
    }));
  }

  // Liste UNIQUE des tailles proposées, partagée par le stepper (-/+ passe au
  // preset voisin) et le panneau flottant (choix direct) - "Toolbar compacte"
  // option A, remplace l'ancien <select> natif dont "Times New Roman" imposait
  // sa largeur à toute la barre.
  const FONT_SIZE_PRESETS = ['8pt', '9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt', '36pt', '48pt', '72pt'];
  const FONT_FAMILY_PRESETS = [
    { value: 'Roboto', label: 'Roboto (par défaut)' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Courier New', label: 'Courier New' },
    { value: 'Calibri', label: 'Calibri' },
  ];

  function wireCompactFontSizeControls() {
    const { captureSelection, withSavedSelection } = createSelectionPreserver();

    // Police : pastille icône+valeur, ouvre un panneau flottant (même
    // mécanisme que le menu de couleur) listant les polices supportées.
    const fontHtml = FONT_FAMILY_PRESETS.map(o => `<button data-action="${o.value}">${o.label}</button>`).join('');
    const fontPanel = createFloatingPanel('v2-format-panel', fontHtml, (value) => {
      withSavedSelection(chain => chain.setFontFamily(value));
      closeDropdownPanel();
    });
    wireDropdownButton(document.getElementById('v2-font-chip'), fontPanel, captureSelection);

    // Taille : stepper -/+ (passe au preset voisin dans FONT_SIZE_PRESETS) +
    // clic sur la valeur pour ouvrir le panneau (choix direct, comme police).
    const sizeHtml = FONT_SIZE_PRESETS.map(s => `<button data-action="${s}">${s}</button>`).join('');
    const sizePanel = createFloatingPanel('v2-format-panel', sizeHtml, (value) => {
      withSavedSelection(chain => chain.setFontSize(value));
      closeDropdownPanel();
    });
    const sizeValBtn = document.getElementById('v2-size-chip-val');
    wireDropdownButton(sizeValBtn, sizePanel, captureSelection);
    const stepSize = (delta) => {
      captureSelection();
      const current = sizeValBtn.textContent.trim();
      const idx = FONT_SIZE_PRESETS.indexOf(current);
      const nextIdx = idx === -1 ? (delta > 0 ? 0 : FONT_SIZE_PRESETS.length - 1) : Math.min(FONT_SIZE_PRESETS.length - 1, Math.max(0, idx + delta));
      withSavedSelection(chain => chain.setFontSize(FONT_SIZE_PRESETS[nextIdx]));
    };
    const minusBtn = document.getElementById('v2-size-minus');
    const plusBtn = document.getElementById('v2-size-plus');
    if (minusBtn) minusBtn.addEventListener('mousedown', (event) => { event.preventDefault(); stepSize(-1); });
    if (plusBtn) plusBtn.addEventListener('mousedown', (event) => { event.preventDefault(); stepSize(1); });
  }

  function getHTML() { return editor ? editor.getHTML() : ''; }

  function getHeadingNumberingStyle() {
    if (!editor) return 'none';
    let style = 'none';
    editor.state.doc.forEach(node => { if (node.type.name === 'headingNumberingConfig') style = node.attrs.numberingStyle; });
    return style;
  }

  // Signale les badges #Variable dont la table/colonne référencée n'existe
  // plus (table supprimée, colonne supprimée/renommée depuis Grist) - un
  // simple ajout de classe + `title` natif sur le <span> déjà rendu, PAS un
  // attribut du nœud ProseMirror lui-même : la validité dépend d'un état
  // externe (le schéma Grist courant), pas du contenu du document, donc rien
  // à persister dans le HTML enregistré. Comme pour la manipulation DOM
  // directe déjà rencontrée ailleurs dans ce fichier, ProseMirror peut
  // reconstruire ce span à tout moment et perdre cet ajout - on ne compte
  // donc jamais sur "ça tient", on rejoue cette passe à chaque déclencheur
  // pertinent (setHTML ci-dessous ET onUpdate, cf. plus bas) plutôt que de
  // la poser une seule fois.
  function refreshVariableBadgeValidity() {
    if (!editor) return;
    editor.view.dom.querySelectorAll('span.var-badge').forEach(el => {
      const table = el.dataset.table;
      const column = el.dataset.column;
      let reason = '';
      if (table && GristAPI.getTables().indexOf(table) === -1) {
        reason = `La table « ${table} » n'existe plus dans ce document.`;
      } else if (table && column && GristAPI.getColumns(table).indexOf(column) === -1) {
        reason = `La colonne « ${column} » n'existe plus dans la table « ${table} ».`;
      }
      el.classList.toggle('var-badge-broken', !!reason);
      if (reason) el.title = reason; else el.removeAttribute('title');
    });
  }

  function setHTML(html) {
    if (!editor) return;
    editor.commands.setContent(html || '', { emitUpdate: false });
    // Vide l'historique Annuler/Rétablir : sans ça, il s'accumule sur toute
    // la durée de vie de l'éditeur, y compris à travers plusieurs changements
    // de modèle successifs - un Annuler après un chargement peut alors faire
    // réapparaître le contenu d'un modèle précédent (bug confirmé, cf.
    // dev-tests/BUGS.md). Seul appelant de setHTML : main.js au chargement
    // d'un modèle - aucun usage interne ne compte sur un historique préservé.
    editor.commands.clearHistory();
    editor.view.dom.dataset.headingStyle = getHeadingNumberingStyle();
    // Un modèle chargé peut déjà porter une numérotation configurée : la
    // valeur ci-dessus vient d'être posée mais le NodeView du sommaire a déjà
    // fait son premier rendu (pendant setContent, donc AVANT). On force un
    // rafraîchissement en dispatchant une transaction sans changement de
    // document - même idée que `quill.update(Quill.sources.SILENT)` en V1
    // pour resynchroniser l'affichage après une modification externe au flux
    // normal d'édition.
    editor.view.dispatch(editor.state.tr);
    // Un modèle chargé peut aussi contenir un tableau déjà trop large (créé
    // avant ce correctif, ou importé) - le dispatch juste au-dessus ne
    // déclenche PAS onUpdate (transaction sans changement réel), donc
    // clampOverflowingTables ne tourne jamais tout seul pour ce cas précis ;
    // appelé explicitement ici pour le couvrir aussi.
    backfillAutoColumnWidths(editor);
    clampOverflowingTables(editor);
    renderPaginationOverlay();
    // Vérification immédiate (schéma déjà en cache, peut être légèrement
    // périmé) PUIS après un rafraîchissement explicite du schéma (couvre le
    // cas "table/colonne supprimée depuis la dernière ouverture du widget") -
    // même schéma "immédiat + arrière-plan" que variables.js pour l'autocomplétion.
    refreshVariableBadgeValidity();
    GristAPI.refreshSchema().then(refreshVariableBadgeValidity)
      .catch(e => console.warn('[Editor] refreshSchema pour la validation des #Variable a échoué', e));
  }

  return {
    init, getHTML, setHTML, getHeadingNumberingStyle,
    getHeaderFooterData, setHeaderFooterData, exitHeaderFooterModeIfActive,
    refreshPaginationPreview: renderPaginationOverlay,
    openFootnoteEditorAt, isEditingHeaderFooter,
  };
})();
