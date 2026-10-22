// La copie en texte d'une diapositive, dans un document, qui reste liée à elle (demande du 22/10, lot 3 : la case « Garder liée » du volet « Diapositive d'une présentation… » ; carte « Sens
// unique : la copie suit la source »). Le socle garde ici ce qui doit tenir même sans le code de l'extension « diapositives » : le texte qui suit sa diapositive, le verrou qui le protège, ce
// que les sorties en voient. Le volet qui pose la copie est dans extensions/diapositives/slide-import.js, la barre flottante dans js/floating-toolbars.js.
//  - La COPIE : les blocs du document qui viennent de la diapositive (la conversion de js/slide-text.js : à la taille du document, sans cadres), suivis du repère de la diapositive liée
//    (js/slide-links.js : le nœud `slideLink`). Le repère dit de quelle diapositive de quelle présentation la copie vient (`data-link-model`, `data-link-key`, `data-link-slide`), l'empreinte
//    de la source à la dernière synchro (`data-link-base`), le sens (toujours « Suit la source » : `data-link-mode="pull"`), le nombre de blocs qui sont la copie, juste avant lui
//    (`data-link-span`) et si la mise en forme d'origine est gardée (`data-link-keep`). Ni nœud qui enveloppe les blocs (la pagination du document ne coupe pas dans un bloc : une copie
//    longue ne tiendrait pas sur une page), ni attribut sur chacun : le repère, de hauteur nulle, est le seul ajout.
//  - La SYNCHRO (follow) : à l'ouverture du document et à chaque lecture de l'enregistrement automatique, une copie dont la diapositive a changé depuis la dernière synchro la reprend, en
//    une transaction hors de l'historique qui ne rend pas le document « à enregistrer » (SlideLinks.isSyncTransaction) ; ce qui n'a pas changé n'est pas touché, ni le curseur. La copie ne
//    s'écrit jamais dans l'autre sens. Suivi des modifications, écriture en direct, en-tête ou pied en cours : rien ne se synchronise.
//  - Le VERROU (createExtension) : le texte de la copie ne s'écrit pas ici tant que sa présentation existe ; la frappe, le collage et les commandes qui le changeraient sont refusés, et le
//    coin d'état dit pourquoi. Passent : ce module, un chargement, Annuler et Rétablir, ce que la page pose d'elle-même (hors de l'historique), l'écriture en direct d'une autre personne, et
//    un geste qui emporte toute la copie avec son repère (la couper, la supprimer, la déplacer). « Détacher » (la barre flottante) le libère ; la copie garde ce qu'elle montre.
//    Un trait d'accent le long de son bord gauche, dans la marge, la signale (une décoration de l'éditeur seulement, comme celui d'un tableau lié).
//  - Un COLLAGE ne lie jamais (SlideLinks.createExtension : le repère ne se colle pas), et une diapositive dont la présentation est supprimée, ou dont la diapositive n'existe plus, laisse
//    sa copie en l'état.
//  - Les SORTIES : la Lecture, le PDF, le Word, les e-mails et les lots ne voient jamais le repère (forOutput, par js/slides-entry.js:outputHtml et js/macro-templates.js), et celles d'un
//    document fermé lisent la diapositive quand elle a changé depuis la dernière synchro, comme le fera l'éditeur à l'ouverture.
// Les empreintes, la lecture des présentations et le remplacement d'un morceau de texte sont ceux de js/slide-links.js (SlideLinks.kit).
const SlideCopies = (function () {
  const SOURCE_TYPE = 'presentation';
  const MARK_CLASS = 'pp-copy-mark';
  const LOCK_NOTICE_MS = 2500;

  const kit = () => SlideLinks.kit();
  const say = (key, vars, isError) => SlidesEntry.status(I18n.t(key, vars), !!isError);
  const emptyAttrs = () => Object.fromEntries(SlideLinks.ATTRS.map(name => [name, null]));

  // ---- Les copies d'un texte ----------------------------------------------------------------------------------------------------------------------------

  // La présentation d'où vient la copie de ce repère, si elle existe et que son jeton est celui du lien ; null sinon (supprimée, ou un lien venu d'un autre document).
  function sourceOf(attrs) {
    if (!attrs || !kit().hasLink(attrs)) return null;
    const model = Templates.byId(attrs.linkModel);
    return model && model.typeModele === SOURCE_TYPE && model.jeton === attrs.linkKey ? model : null;
  }
  const keyOf = attrs => attrs.linkModel + ':' + attrs.linkSlide;

  // Les copies du texte `doc` (un nœud de document ProseMirror), dans l'ordre : chaque repère de premier niveau qui porte un lien et un nombre de blocs. { node, pos, attrs, key, from, nodes,
  // whole } : sa place, son lien, la place du premier bloc de la copie, ses blocs ; `whole` est faux quand le texte n'a pas les blocs que le repère annonce (un saut de page ou un autre repère
  // les coupe, ou il en manque) : la copie n'est alors ni verrouillée ni synchronisée. Lues une fois par texte.
  const copiesCache = new WeakMap();
  function copiesOf(doc) {
    const kept = copiesCache.get(doc);
    if (kept) return kept;
    const { isTag, hasLink } = kit();
    const found = [];
    doc.forEach((node, pos, index) => {
      if (!isTag(node) || !hasLink(node.attrs) || !node.attrs.linkSpan) return;
      const nodes = [];
      let at = index;
      while (nodes.length < node.attrs.linkSpan && at > 0) {
        const before = doc.child(at - 1);
        if (isTag(before) || before.type.name === 'pageBreak') break;
        nodes.unshift(before);
        at--;
      }
      found.push({ node, pos, attrs: node.attrs, key: keyOf(node.attrs), from: pos - nodes.reduce((sum, block) => sum + block.nodeSize, 0), nodes, whole: nodes.length === node.attrs.linkSpan });
    });
    copiesCache.set(doc, found);
    return found;
  }

  // ---- Ce qu'il y a à faire d'une copie -------------------------------------------------------------------------------------------------------------

  // { action, model, remote, srcHash, at } pour la copie du repère `attrs` : 'missing' (la présentation n'existe plus, ou plus cette diapositive : la copie reste en l'état), 'none' (la diapositive
  // est celle de la dernière synchro), 'pull' (elle a changé : la copie la reprend).
  function planOf(editor, attrs) {
    const { parseModel, slideHash, parseBase } = kit();
    const model = sourceOf(attrs);
    if (!model) return { action: 'missing', model: null };
    const parsed = parseModel(editor, model);
    const at = parsed.byId.get(attrs.linkSlide);
    if (at === undefined) return { action: 'missing', model };
    const remote = parsed.slides[at];
    const srcHash = slideHash(remote);
    const base = parseBase(attrs.linkBase);
    return { action: base && base.src === srcHash ? 'none' : 'pull', model, remote, srcHash, at };
  }

  // Le HTML d'une diapositive (ses blocs, sans repère) en blocs de document : la conversion de js/slide-text.js, puis la lecture de l'éditeur. { nodes, dropped, blank } ; `keepFormat` : garde
  // les tailles de la diapositive.
  function convertHtml(editor, html, keepFormat) {
    const body = HtmlSanitize.parseInert(html);
    const result = SlideText.toDocument(body, { keepFormat });
    if (result.blank) return Object.assign(result, { nodes: [] });
    const nodes = [];
    kit().libs.PMDOMParser.fromSchema(editor.schema).parse(body).forEach(node => nodes.push(node));
    return Object.assign(result, { nodes });
  }
  // La diapositive `remote` d'une présentation lue (SlideLinks.kit : slidesOf) en blocs de document.
  function convertSlide(editor, remote, keepFormat) {
    const { portable } = kit();
    const nodes = portable(editor, remote.nodes.map(entry => entry.node));
    return convertHtml(editor, Editor.getHTML(editor.schema.topNodeType.create(null, nodes)), keepFormat);
  }

  // Remplace, dans `tr`, la copie `copy` par la diapositive de la source (`plan.remote`) : seuls les blocs qui diffèrent changent (le curseur d'ailleurs reste où il est), et le repère prend son
  // nouveau nombre de blocs et sa base. Une diapositive devenue vide laisse un paragraphe vide, où la barre se montre encore (« Détacher »).
  function pullInto(editor, tr, copy, plan) {
    const { hashOfNodes, makeBase, replaceSpan } = kit();
    const result = convertSlide(editor, plan.remote, !!copy.attrs.linkKeep);
    const nodes = result.nodes.length ? result.nodes : [editor.schema.nodes.paragraph.create()];
    replaceSpan(tr, copy.from, copy.pos, nodes);
    const at = copy.from + nodes.reduce((sum, node) => sum + node.nodeSize, 0);
    tr.setNodeMarkup(at, undefined, Object.assign({}, copy.attrs, { linkSpan: nodes.length, linkBase: makeBase(hashOfNodes(nodes), plan.srcHash) }));
    return nodes;
  }

  // Pourquoi rien ne se synchronise maintenant : pas de document à l'écran, pas d'éditeur, suivi des modifications, écriture en direct, en-tête ou pied en cours, saisie en cours.
  function paused(editor) {
    if (!kit().libs || !editor || editor.isDestroyed || SlidesEntry.presentationShown() || GridEditor.isActive()) return true;
    if (Editor.isTrackChangesOn() || LiveEntry.isLive() || HeaderFooterPreview.getHfMode()) return true;
    return !!(editor.view && editor.view.composing);
  }

  // Les copies du document ouvert reprennent leur diapositive, d'après les modèles du cache (relus par le passage de l'enregistrement automatique, ou à l'instant par la page) : à l'ouverture
  // et à chaque lecture. Une seule transaction, hors de l'historique (Annuler ne rend pas ce que personne n'a fait), qui ne rend pas le document « à enregistrer ». Rend { pulled: [rangs] }, ou
  // null quand la synchro n'a pas lieu ou qu'il n'y a pas de copie.
  function follow(editor) {
    if (paused(editor)) return null;
    const copies = copiesOf(editor.state.doc).filter(copy => copy.whole);
    if (!copies.length) return null;
    const tr = editor.state.tr;
    const done = { pulled: [], name: '' };
    // De la dernière à la première : remplacer une copie ne déplace pas celles d'avant.
    for (let i = copies.length - 1; i >= 0; i--) {
      const plan = planOf(editor, copies[i].attrs);
      if (plan.action !== 'pull') continue;
      pullInto(editor, tr, copies[i], plan);
      done.pulled.unshift(i);
      done.name = plan.model.nom;
    }
    if (!tr.steps.length) return done;
    editor.view.dispatch(SlideLinks.markSync(tr));
    if (done.pulled.length === 1) say('slides.copy.pulled', { name: done.name });
    else say('slides.copy.pulledMany', { n: done.pulled.length });
    return done;
  }

  // ---- Poser une copie ----------------------------------------------------------------------------------------------------------------------------------

  // Où la copie se pose : à la fin du bloc de premier niveau du curseur (un tableau, une liste ou une zone se finit avant), à sa place quand c'est un paragraphe vide, et jamais dans une autre
  // copie (entre ses blocs et son repère) : après le repère de celle-là. { from, to } : ce que la copie remplace (rien : from = to).
  function placeFor(state, copies) {
    const { doc, selection } = state;
    const $to = selection.$to;
    const block = doc.maybeChild($to.index(0));
    const start = $to.depth >= 1 ? $to.before(1) : selection.to;
    const end = block ? start + block.nodeSize : start;
    const inside = copies.find(copy => copy.whole && start >= copy.from && start < copy.pos);
    if (inside) { const after = inside.pos + inside.node.nodeSize; return { from: after, to: after }; }
    const blank = block && block.type.name === 'paragraph' && block.content.size === 0;
    return blank ? { from: start, to: end } : { from: end, to: end };
  }

  // Pose, au curseur du document, le texte de la diapositive `html` (sans repère) avec son repère : `link` est celui que rend SlideLinks.anchorSource ; `keepFormat` garde les tailles de la
  // diapositive. Un seul pas d'annulation, à part de la frappe d'avant, et le curseur se pose dans le bloc qui suit. Rend { blank } quand rien de lisible n'en reste (rien n'est posé), sinon
  // { dropped, blocks } (ce qui n'est pas entré, le nombre de blocs posés).
  function insert(editor, { html, link, keepFormat }) {
    const { makeBase, hashOfNodes, NODE } = kit();
    const result = convertHtml(editor, html, !!keepFormat);
    if (result.blank) return { blank: true, dropped: result.dropped };
    const { state } = editor;
    const { from, to } = placeFor(state, copiesOf(state.doc));
    const attrs = Object.assign(emptyAttrs(), {
      linkModel: link.linkModel, linkKey: link.linkKey, linkSlide: link.linkSlide, linkMode: 'pull', linkSpan: result.nodes.length, linkKeep: keepFormat ? true : null,
      linkBase: makeBase(hashOfNodes(result.nodes), link.srcHash),
    });
    const marker = editor.schema.nodes[NODE].create(attrs);
    const content = [...result.nodes, marker];
    // Un bloc de texte juste après le repère, pour que le curseur y tienne (la copie finit le document, ou un tableau, une zone ou un saut de page la suit).
    const next = state.doc.nodeAt(to);
    if (!next || !next.isTextblock) content.push(editor.schema.nodes.paragraph.create());
    const tr = state.tr.setMeta('closeHistory$', true).replaceWith(from, to, content);
    const caret = from + content.slice(0, result.nodes.length + 1).reduce((sum, node) => sum + node.nodeSize, 0);
    tr.setSelection(EditorCore.getTextSelectionClass().near(tr.doc.resolve(caret), 1)).scrollIntoView();
    editor.view.dispatch(tr);
    return { dropped: result.dropped, blocks: result.nodes.length };
  }

  // Les diapositives de la présentation `id` dont ce document porte déjà une copie liée (un lien par diapositive source et par document).
  function linkedFrom(editor, id) {
    const found = new Set();
    if (editor && !editor.isDestroyed) copiesOf(editor.state.doc).forEach((copy) => { if (String(copy.attrs.linkModel) === String(id)) found.add(copy.attrs.linkSlide); });
    return found;
  }

  // ---- Le verrou et le trait d'accent ------------------------------------------------------------------------------------------------------------------

  // Les copies que le verrou protège dans le texte `doc` : celles dont la présentation existe. { copy, key, hash }.
  function lockedOf(doc) {
    const { hashOfNodes } = kit();
    return copiesOf(doc).filter(copy => copy.whole && sourceOf(copy.attrs)).map(copy => ({ copy, key: copy.key, hash: hashOfNodes(copy.nodes) }));
  }

  // Une transaction de la personne (frappe, collage, commande) qui changerait le texte d'une copie verrouillée est refusée ; la ligne d'état dit pourquoi, une fois de temps en temps. Un geste
  // qui emporte toute la copie avec son repère passe (la couper, la supprimer, la déplacer) ; un repère effacé seul, ou une copie dont il reste des blocs, non. Passent aussi les transactions
  // de ce module, un chargement, Annuler et Rétablir, ce que la page pose d'elle-même (hors de l'historique) et l'écriture en direct d'une autre personne.
  let lockSaidAt = 0;
  function refuses(tr, state) {
    if (!tr.docChanged || SlidesEntry.presentationShown() || HeaderFooterPreview.getHfMode() || GridEditor.isActive()) return false;
    if (tr.getMeta(SlideLinks.kit().OWN_META) || tr.getMeta('history$') || tr.getMeta('preventUpdate') || tr.getMeta('addToHistory') === false || tr.getMeta('appendedTransaction') || LiveEntry.isRemote(tr)) return false;
    const locked = lockedOf(state.doc);
    if (!locked.length) return false;
    const { hashOfNodes } = kit();
    const after = new Map();
    copiesOf(tr.doc).forEach((copy) => { if (!after.has(copy.key)) after.set(copy.key, []); after.get(copy.key).push(copy); });
    const seen = new Map();
    let kept = null;
    const hit = locked.find(({ copy, key, hash }) => {
      const rank = seen.get(key) || 0;
      seen.set(key, rank + 1);
      const now = (after.get(key) || [])[rank];
      if (!now) {
        // Le repère n'y est plus : la copie est partie en entier (rien de ses blocs ne reste), ou il en reste du texte sans lien.
        if (!kept) { kept = new Set(); tr.doc.forEach(node => kept.add(node)); }
        return copy.nodes.some(node => kept.has(node));
      }
      if (!now.whole) return true;
      if (now.nodes.length === copy.nodes.length && now.nodes.every((node, i) => node === copy.nodes[i])) return false;
      return hashOfNodes(now.nodes) !== hash;
    });
    if (!hit) return false;
    if (Date.now() - lockSaidAt > LOCK_NOTICE_MS) {
      lockSaidAt = Date.now();
      say('slides.copy.locked', { name: sourceOf(hit.copy.attrs).nom }, true);
    }
    return true;
  }

  // Le trait d'accent le long du bord gauche de chaque bloc d'une copie dont la présentation existe : une décoration de l'éditeur seulement (rien n'en reste dans le document ni dans les
  // exports), qui ne prend aucune place (css/slide-copies.css).
  function marks(state, Decoration, DecorationSet) {
    if (GridEditor.isActive() || HeaderFooterPreview.getHfMode()) return null;
    const decorations = [];
    copiesOf(state.doc).forEach((copy) => {
      if (!copy.whole || !sourceOf(copy.attrs)) return;
      let pos = copy.from;
      copy.nodes.forEach((node) => {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: MARK_CLASS }));
        pos += node.nodeSize;
      });
    });
    return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
  }

  function createExtension(Extension, deps) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = deps;
    return Extension.create({
      name: 'slideCopies',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('slideCopies'),
          filterTransaction(tr, state) { return !refuses(tr, state); },
          props: { decorations: state => marks(state, Decoration, DecorationSet) },
        })];
      },
    });
  }

  // ---- La barre flottante et « Détacher » -------------------------------------------------------------------------------------------------------

  // Ce que la barre dit de la copie sous la sélection (elle tient toute dans la copie), ou null : { copy, from, name, n, gone } (`from` : le début du premier bloc, où la barre s'ancre ; `name` : la
  // présentation ; `n` : le rang de la diapositive dans la présentation ; `gone` : la présentation ou la diapositive n'existe plus : la copie reste en l'état, verrouillée tant que la
  // présentation existe (comme une diapositive liée dont la source a perdu la sienne), et « Détacher » la libère).
  function statusAt(state) {
    if (GridEditor.isActive() || HeaderFooterPreview.getHfMode()) return null;
    const { selection } = state;
    const copy = copiesOf(state.doc).find(c => c.whole && selection.from >= c.from && selection.to <= c.pos);
    if (!copy) return null;
    const editor = EditorCore.getEditor();
    const plan = editor && !editor.isDestroyed && kit().libs ? planOf(editor, copy.attrs) : { action: 'missing', model: sourceOf(copy.attrs) };
    return { copy, from: copy.from, name: plan.model ? plan.model.nom : '', n: plan.action === 'missing' ? 0 : plan.at + 1, gone: plan.action === 'missing' };
  }

  // « Détacher » : la copie garde ce qu'elle montre et n'est plus liée (le repère part) ; elle s'écrit de nouveau. Un seul Annuler. Faux, sans rien changer, sous le suivi des modifications ou
  // l'écriture en direct.
  function detach(editor) {
    if (!editor || editor.isDestroyed || !editor.isEditable) return false;
    const blocked = SlideLinks.blockedReason();
    if (blocked) { say(blocked, null, true); return false; }
    const status = statusAt(editor.state);
    if (!status) return false;
    const { copy } = status;
    editor.view.dispatch(editor.state.tr.delete(copy.pos, copy.pos + copy.node.nodeSize).setMeta(SlideLinks.kit().OWN_META, 'detach'));
    say('slides.copy.detached', { name: status.name });
    return true;
  }

  // ---- Les sorties ------------------------------------------------------------------------------------------------------------------------------------

  // Le HTML d'un document tel que la Lecture et les exports le reçoivent : sans repère, et, quand l'éditeur est là, chaque copie dont la diapositive a changé depuis la dernière synchro reprend la
  // diapositive, comme le fera l'éditeur à l'ouverture. Le HTML sans repère est rendu tel quel, sans être relu.
  function forOutput(html) {
    const text = String(html == null ? '' : html);
    const { CLASS, libs, attrsOfEl } = kit();
    if (text.indexOf(CLASS) === -1) return text;
    const body = HtmlSanitize.parseInert(text);
    const markers = Array.from(body.querySelectorAll('div.' + CLASS));
    const editor = EditorCore.getEditor();
    const live = !!libs && !!editor && !editor.isDestroyed;
    const stale = live && markers.some((el) => { const attrs = attrsOfEl(el); return !!attrs.linkSpan && planOf(editor, attrs).action === 'pull'; });
    if (!stale) {
      markers.forEach(el => el.remove());
      return body.innerHTML;
    }
    const doc = libs.PMDOMParser.fromSchema(editor.schema).parse(body);
    const tr = libs.EditorState.create({ doc }).tr;
    const copies = copiesOf(doc).filter(copy => copy.whole);
    for (let i = copies.length - 1; i >= 0; i--) {
      const plan = planOf(editor, copies[i].attrs);
      if (plan.action === 'pull') pullInto(editor, tr, copies[i], plan);
    }
    return SlideLinks.strip(Editor.getHTML(tr.doc));
  }

  return { SOURCE_TYPE, createExtension, follow, forOutput, insert, detach, statusAt, linkedFrom, copiesOf };
})();
