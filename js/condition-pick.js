// La condition seule d'un objet à condition, à copier et à coller (demande du 26/11 : « si on la copie et qu'on va sur une autre bulle de condition et qu'on colle, ça prend les éléments de condition »,
// puis : « il faudrait pouvoir sélectionner le bloc entier, la puce, au premier clic, et après sélection la bulle de la condition - on garde l'option de copier-coller condition et contenu, ou juste condition »).
// Deux niveaux de sélection, sur les six objets qui portent une condition d'affichage (js/variable-condition-data.js:TEXTS : bloc de texte, bulle de variable, calcul, case, valeur dans la phrase, image) :
//  - le premier clic choisit l'objet ENTIER (une sélection de nœud : la barre flottante s'ouvre) : Ctrl+C le copie avec son contenu, Ctrl+V sur un objet choisi le remplace, comme toujours ;
//  - un deuxième clic sur sa bulle bleue - l'étiquette « Si … » d'un bloc, la bulle de variable, de calcul ou de case elle-même - ne choisit que sa CONDITION (la bulle se remplit, le coin d'état le dit) ; un troisième clic,
//    Échap ou tout autre geste la relâche. Ctrl+C copie alors la condition seule - le presse-papiers du système, un `<span data-pp-condition>` que le collage relit, d'un document à l'autre - et Ctrl+V sur un objet
//    choisi (entier ou condition seule) lui donne cette condition : ses règles et sa combinaison, groupes compris, remplacées en entier ; son contenu, son « Sinon afficher » et son « Avant » / « Après » restent.
//    Sur un objet dont la condition seule est choisie, coller un objet entier copié (Ctrl+C du premier clic) en prend aussi la condition, sans toucher au contenu.
// Le choix de la condition seule n'est qu'un état de la vue (une décoration) : rien n'est écrit dans le document, un clic ailleurs, une frappe ou un changement du document le relâchent. Coller est UNE transaction :
// un Ctrl+Z défait. Les images et les valeurs dans la phrase (un texte qu'on édite) n'ont pas de deuxième clic ; elles reçoivent une condition copiée seule, et la fenêtre « Condition d'affichage » reste là pour toutes.
const ConditionPick = (function () {
  const { TEXTS, conditionSummary } = VariableConditionData;
  const ATTR = 'data-pp-condition'; // le presse-papiers d'une condition copiée seule : <span data-pp-condition='{…}'>Statut = Urgent</span>
  // Les objets dont la bulle bleue EST le nœud (un deuxième clic dessus choisit la condition) ; la bulle d'un bloc est son étiquette, que sa vue gère (js/editor-nodes.js:conditionalTextNodeView).
  const CHIP_TYPES = { varBadge: true, calcBadge: true, conditionalCheckbox: true };
  const PICKED_CLASS = 'pp-condition-picked';

  let pluginKey = null;
  let host = { status: () => {} }; // `status(texte, erreur)` : le coin d'état de la page (js/main.js)
  let downOnChosen = false; // l'appui de souris en cours a commencé sur un objet DÉJÀ choisi : seul le clic qui le suit compte pour un deuxième clic

  const nodeIsPickable = node => !!node && !!TEXTS[node.type.name];
  // Le nœud choisi en entier (une sélection de nœud) quand il peut porter une condition.
  const chosenNode = selection => (selection && nodeIsPickable(selection.node) ? selection.node : null);

  // La position de l'objet dont la condition seule est choisie, ou null.
  function pickedPos(state) {
    const value = pluginKey && pluginKey.getState(state);
    return value ? value.pos : null;
  }
  // Choisit (`pos`) ou relâche (null) la condition seule : une transaction sans historique, qui ne touche ni au document ni à la sélection.
  function setPick(view, pos) {
    if (!pluginKey || pickedPos(view.state) === (pos == null ? null : pos)) return;
    view.dispatch(view.state.tr.setMeta(pluginKey, pos == null ? null : { pos }).setMeta('addToHistory', false));
  }
  // Le clic qui choisit la condition seule de l'objet choisi en entier - ou la relâche s'il l'était déjà.
  function toggle(view, pos) {
    const node = view.state.doc.nodeAt(pos);
    if (!nodeIsPickable(node)) return;
    if (pickedPos(view.state) === pos) { setPick(view, null); return; }
    setPick(view, pos);
    host.status(I18n.t('varCond.pick.on'));
  }

  // Une condition copiée seule, dans les deux formats que le système garde : le texte (« Statut = Urgent ») et le HTML qui la porte.
  function writeCondition(data, condition) {
    const el = document.createElement('span');
    el.setAttribute(ATTR, JSON.stringify(condition));
    el.textContent = conditionSummary(condition, { full: true });
    data.setData('text/html', el.outerHTML);
    data.setData('text/plain', el.textContent);
  }
  // La condition qu'un presse-papiers porte, ou null : celle d'une copie de condition seule ; le HTML d'un objet entier n'en est pas une.
  function payloadOf(data) {
    const html = data && typeof data.getData === 'function' ? data.getData('text/html') : '';
    if (!html || html.indexOf(ATTR) === -1) return null;
    const holder = new DOMParser().parseFromString(html, 'text/html').querySelector('[' + ATTR + ']');
    if (!holder) return null;
    try { return ConditionRules.plainCondition(JSON.parse(holder.getAttribute(ATTR))); } catch (e) { return null; }
  }

  // Le seul objet à condition de la tranche collée : copié seul, il arrive nu (une bulle dans la ligne, un bloc entier), ou seul dans son paragraphe quand l'endroit où l'on colle veut un bloc. Un texte, deux
  // objets, un tableau, une liste : null.
  function soleConditionNode(slice) {
    let fragment = slice && slice.content;
    while (fragment && fragment.childCount === 1) {
      const child = fragment.firstChild;
      if (nodeIsPickable(child)) return child;
      if (child.type.name !== 'paragraph') return null;
      fragment = child.content;
    }
    return null;
  }

  // Ctrl+C (et Ctrl+X, qui ne retire rien : ni l'objet ni sa condition) sur une condition seule choisie : elle va au presse-papiers, à la place de l'objet entier.
  function copyPicked(view, event) {
    const pos = pickedPos(view.state);
    if (pos == null || !event.clipboardData) return false;
    const node = view.state.doc.nodeAt(pos);
    const condition = node && ConditionRules.plainCondition(node.attrs.condition);
    event.preventDefault();
    if (!condition) { host.status(I18n.t('varCond.pick.none')); return true; }
    writeCondition(event.clipboardData, condition);
    host.status(I18n.t('varCond.pick.copied', { summary: conditionSummary(condition) }));
    return true;
  }

  // Vrai quand le collage est pris : un objet à condition est choisi (en entier ou sa condition seule) et le presse-papiers porte une condition copiée seule ; ou sa condition seule est choisie et le presse-papiers porte
  // un objet entier à condition. Sinon faux, et le collage suit son cours (la copie remplace l'objet choisi, comme toujours). Une seule transaction ; la condition seule reste choisie si elle l'était.
  function pasteOver(view, slice, event) {
    if (!view || !slice) return false;
    const { selection } = view.state;
    const target = chosenNode(selection);
    if (!target) return false;
    const picked = pickedPos(view.state) === selection.from;
    let condition = payloadOf(event && event.clipboardData);
    if (!condition && picked) {
      const source = soleConditionNode(slice);
      condition = source && ConditionRules.plainCondition(source.attrs.condition);
    }
    if (!condition) return false;
    const current = ConditionRules.plainCondition(target.attrs.condition);
    if (current && JSON.stringify(current) === JSON.stringify(condition)) {
      host.status(I18n.t('varCond.paste.same'));
      return true;
    }
    const tr = view.state.tr.setNodeMarkup(selection.from, undefined, Object.assign({}, target.attrs, { condition }));
    // Le nœud est remplacé : la sélection de nœud se repose dessus, sinon le curseur retombe dans le texte et la barre se ferme.
    tr.setSelection(selection.constructor.create(tr.doc, selection.from));
    tr.setMeta(pluginKey, picked ? { pos: selection.from } : null);
    view.dispatch(tr);
    host.status(I18n.t('varCond.paste.done', { summary: conditionSummary(condition) }));
    return true;
  }

  function createExtension(Extension, libs) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    pluginKey = new PluginKey('conditionPick');
    return Extension.create({
      name: 'conditionPick',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: pluginKey,
          // { pos } tant que la condition seule d'un objet est choisie. Tout changement de sélection ou du document la relâche, sauf la transaction qui la pose (ou la repose) elle-même.
          state: {
            init: () => null,
            apply(tr, value) {
              const meta = tr.getMeta(pluginKey);
              if (meta !== undefined) return meta;
              return value && (tr.selectionSet || tr.docChanged) ? null : value;
            },
          },
          props: {
            decorations(state) {
              const pos = pickedPos(state);
              const node = pos == null ? null : state.doc.nodeAt(pos);
              if (!nodeIsPickable(node) || state.selection.from !== pos) return null;
              return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: PICKED_CLASS })]);
            },
            // Un deuxième clic sur la bulle bleue d'un objet déjà choisi : l'appui est noté avant que ProseMirror ne choisisse l'objet, le clic qui le suit décide (un glissé du nœud n'en fait pas un clic).
            handleDOMEvents: {
              mousedown(view, event) {
                const node = chosenNode(view.state.selection);
                const dom = node && CHIP_TYPES[node.type.name] ? view.nodeDOM(view.state.selection.from) : null;
                downOnChosen = !!dom && dom.contains(event.target) && event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
                return false;
              },
              click(view) {
                const wanted = downOnChosen;
                downOnChosen = false;
                const node = wanted && chosenNode(view.state.selection);
                if (!node || !CHIP_TYPES[node.type.name]) return false;
                toggle(view, view.state.selection.from);
                return true;
              },
              copy: copyPicked,
              cut: copyPicked,
            },
            // La condition seule est choisie : une frappe ou Retour arrière / Suppr n'effacent PAS l'objet entier (c'est ce que fait une sélection de nœud) ; Échap la relâche sans rien prendre à d'autres.
            handleKeyDown(view, event) {
              if (pickedPos(view.state) == null) return false;
              if (event.key === 'Escape') { setPick(view, null); return false; }
              const typed = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
              if (!typed && event.key !== 'Backspace' && event.key !== 'Delete') return false;
              setPick(view, null);
              event.preventDefault();
              return true;
            },
          },
        })];
      },
    });
  }

  return { createExtension, toggle, setPick, pickedPos, pasteOver, setHost(given) { host = Object.assign({ status: () => {} }, given); } };
})();
