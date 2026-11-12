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

  // Les diapositives de la présentation `id` dont ce document porte déjà une copie liée (un lien par diapositive source et par document), en texte ou en bloc.
  function linkedFrom(editor, id) {
    const found = new Set();
    if (!editor || editor.isDestroyed) return found;
    copiesOf(editor.state.doc).forEach((copy) => { if (String(copy.attrs.linkModel) === String(id)) found.add(copy.attrs.linkSlide); });
    blocksOf(editor.state.doc).forEach(({ link }) => { if (String(link.model) === String(id)) found.add(link.slide); });
    return found;
  }

  // ---- Les diapositives posées en bloc --------------------------------------------------------------------------------------------------------------

  // Une diapositive posée « En bloc » est UNE image du document (le nœud `editorImage` : poignées, alignement, Suppr comme toute image) qui porte, en plus, ce que la diapositive dit : son texte
  // (`slideText`, que la recherche Ctrl+F trouve), ses mots et leur place (`slideWords`, la couche de texte invisible) et, quand « Garder liée » est cochée, sa diapositive source (`slideLink` :
  // `{ model, key, slide, base }`, la présentation, son jeton, le numéro de la diapositive dans la présentation, l'empreinte de la source à la dernière synchro). Pas de repère à part ni de verrou :
  // l'image est un seul bloc, qu'on supprime ou qu'on déplace en entier, et la personne peut la redimensionner ou la recadrer ; la source, elle, la remplace quand elle change (`followBlocks`), en gardant
  // la taille et l'alignement. La photo est dessinée par l'extension « diapositives » (extensions/diapositives/slide-raster.js, `SlidesEntry.blockSnapshot`) : éteinte, le bloc reste tel qu'il est.
  const isBlockLink = link => !!link && typeof link === 'object' && !!link.model && !!link.key && !!link.slide && typeof link.base === 'string';
  // Les diapositives en bloc liées du texte `doc`, dans l'ordre : [{ node, pos, link }].
  function blocksOf(doc) {
    const found = [];
    doc.descendants((node, pos) => {
      if (node.type.name === 'editorImage' && isBlockLink(node.attrs.slideLink)) found.push({ node, pos, link: node.attrs.slideLink });
      return !node.isAtom;
    });
    return found;
  }
  // Le texte alternatif d'une diapositive en bloc : ce qu'elle dit, sur une ligne (500 signes au plus : AltText.MAX).
  const blockAltOf = text => AltText.clean(text ? I18n.t('slides.block.alt', { text: String(text).replace(/\s*\n+\s*/g, ' ; ') }) : I18n.t('slides.block.altEmpty'));
  // Une diapositive qui parle d'une ligne (une variable, un calcul, une puce de date ou de nom, une condition, une image de colonne) ne se dessine pas une fois pour toutes : la Lecture et les exports la
  // redessinent pour chaque ligne (`fillBlocks`). Le bloc garde donc la diapositive elle-même, `slideSource` : { h, m, r, t } - son HTML, les marges de sa présentation (qui donnent la page), son rang
  // dans la présentation et le nombre de diapositives (0 : sans numéro). Null pour une diapositive qui n'en parle pas : sa photo suffit, et le document ne grossit pas.
  const needsRow = html => /var-badge|calc-badge|smart-chip|mention-chip|data-var-table|data-condition|data-loop/.test(html || '');
  function blockSourceOf(html, tpl, at) {
    return needsRow(html) ? { h: html, m: (tpl && tpl.marginsMm) || null, r: at ? at.rank : 0, t: at ? at.total : 0 } : null;
  }
  // Les attributs de l'image d'une photo de diapositive `shot` ({ src, text, words }), large de `width` (en px) ; `link` : { linkModel, linkKey, linkSlide, srcHash } de SlideLinks.anchorSource ;
  // `source` : celle de `blockSourceOf`.
  function blockAttrs(shot, width, link, source) {
    return {
      src: shot.src, alt: blockAltOf(shot.text), width: width + 'px', slideText: shot.text || null, slideWords: shot.words && shot.words.length ? shot.words : null,
      slideLink: link ? { model: link.linkModel, key: link.linkKey, slide: link.linkSlide, base: link.srcHash } : null,
      slideSource: source || null,
    };
  }
  // Pose la photo `shot` au curseur du document, large de `width` px (la largeur du texte) : un paragraphe qui ne porte que l'image, un seul pas d'annulation à part de la frappe d'avant ; le curseur se
  // pose dans le bloc qui suit (il y en a toujours un : une ligne vide est ajoutée au besoin). Rend { blocks: 1 }.
  function insertBlock(editor, { shot, width, link, slideSource }) {
    const { state } = editor;
    const { from, to } = placeFor(state, copiesOf(state.doc));
    const { editorImage, paragraph } = editor.schema.nodes;
    const block = paragraph.create(null, [editorImage.create(blockAttrs(shot, width, link, slideSource))]);
    const content = [block];
    const next = state.doc.nodeAt(to);
    if (!next || !next.isTextblock) content.push(paragraph.create());
    const tr = state.tr.setMeta('closeHistory$', true).replaceWith(from, to, content);
    tr.setSelection(EditorCore.getTextSelectionClass().near(tr.doc.resolve(from + block.nodeSize), 1)).scrollIntoView();
    editor.view.dispatch(tr);
    return { blocks: 1 };
  }

  // Ce qu'il y a à faire d'un bloc lié : { action, model, remote, srcHash, at } comme `planOf` ('missing' : la présentation ou la diapositive n'existe plus, le bloc reste tel quel ; 'none' ; 'pull').
  function blockPlanOf(editor, link) {
    const { parseModel, slideHash } = kit();
    const model = Templates.byId(link.model);
    if (!model || model.typeModele !== SOURCE_TYPE || model.jeton !== link.key) return { action: 'missing', model: null };
    const parsed = parseModel(editor, model);
    const at = parsed.byId.get(link.slide);
    if (at === undefined) return { action: 'missing', model };
    const remote = parsed.slides[at];
    const total = parsed.slides.length;
    const srcHash = slideHash(remote) + numberStamp(hasNumber(remote), at + 1, total);
    return { action: link.base === srcHash ? 'none' : 'pull', model, remote, srcHash, at, total };
  }
  // Une diapositive qui porte son numéro (la pastille de numéro de page) est dessinée avec ce numéro : elle n'est plus à jour quand son rang ou le nombre de diapositives change, même si son contenu
  // n'a pas bougé. L'empreinte d'un tel bloc garde donc le rang et le total derrière celle du contenu (vide pour une diapositive sans numéro : les blocs d'avant restent à jour).
  const numberStamp = (has, rank, total) => (has ? '@' + rank + '/' + total : '');
  function hasNumber(remote) {
    let found = false;
    remote.nodes.forEach((entry) => { entry.node.descendants((node) => { if (node.type.name === 'pageNumberBadge') found = true; return !found; }); });
    return found;
  }
  // Le HTML d'une diapositive lue de sa présentation (sans repère ni image répétée), tel que l'extension le dessine.
  function slideHtml(editor, remote) {
    const { portable } = kit();
    return Editor.getHTML(editor.schema.topNodeType.create(null, portable(editor, remote.nodes.map(entry => entry.node))));
  }

  // Les blocs du document ouvert reprennent leur diapositive quand elle a changé depuis la dernière synchro, d'après les modèles du cache (comme `follow`) ; la photo se dessine (c'est asynchrone) puis
  // une seule transaction, hors de l'historique et sans rendre le document « à enregistrer », remplace l'image de chaque bloc en gardant sa taille, son alignement et le texte alternatif de la
  // personne. Un bloc qui n'est plus là, ou déjà à jour, n'est pas touché. Rend une promesse : { pulled: [rangs] }, ou null quand rien n'a lieu (rien de lié, rien de changé, l'extension éteinte).
  let following = false;
  async function followBlocks(editor) {
    if (following || paused(editor)) return null;
    const stale = blocksOf(editor.state.doc).map(block => ({ block, plan: blockPlanOf(editor, block.link) })).filter(({ plan }) => plan.action === 'pull');
    if (!stale.length) return null;
    following = true;
    try {
      // Une photo par diapositive source (deux blocs de la même diapositive la partagent).
      const shots = new Map();
      for (const { block, plan } of stale) {
        const key = keyOf({ linkModel: block.link.model, linkSlide: block.link.slide });
        if (shots.has(key)) continue;
        const html = slideHtml(editor, plan.remote);
        const at = { rank: plan.at + 1, total: plan.total };
        shots.set(key, { plan, shot: await SlidesEntry.blockSnapshot(html, plan.model, at), slideSource: blockSourceOf(html, plan.model, at) });
      }
      if (editor.isDestroyed || paused(editor)) return null;
      const tr = editor.state.tr;
      const done = { pulled: [], name: '' };
      // De la dernière à la première : un bloc remplacé ne déplace pas ceux d'avant (le nœud garde sa taille : les positions ne bougent de toute façon pas).
      const now = blocksOf(editor.state.doc);
      for (let i = now.length - 1; i >= 0; i--) {
        const { node, pos, link } = now[i];
        const got = shots.get(keyOf({ linkModel: link.model, linkSlide: link.slide }));
        if (!got || !got.shot) continue;
        const live = blockPlanOf(editor, link);
        // La source a bougé encore pendant le dessin : le prochain passage reprend (la photo n'est plus la bonne).
        if (live.action !== 'pull' || live.srcHash !== got.plan.srcHash) continue;
        const own = node.attrs.alt !== blockAltOf(node.attrs.slideText);
        const attrs = Object.assign({}, node.attrs, blockAttrs(got.shot, 0, { linkModel: link.model, linkKey: link.key, linkSlide: link.slide, srcHash: live.srcHash }, got.slideSource));
        attrs.width = node.attrs.width;
        if (own) attrs.alt = node.attrs.alt;
        tr.setNodeMarkup(pos, undefined, attrs);
        done.pulled.unshift(i);
        done.name = live.model.nom;
      }
      if (!tr.steps.length) return null;
      editor.view.dispatch(SlideLinks.markSync(tr));
      if (done.pulled.length === 1) say('slides.block.pulled', { name: done.name });
      else say('slides.block.pulledMany', { n: done.pulled.length });
      return done;
    } finally {
      following = false;
    }
  }
  // ---- Les blocs redessinés pour une ligne (la Lecture et les exports) -----------------------------------------------------------------------------------

  // La Lecture et les exports (js/reader-mode.js : `resolveSlideBlocks`) redessinent, pour la ligne qu'ils écrivent, chaque diapositive en bloc qui garde sa diapositive (`slideSource`) : `resolveHtml(html)`
  // rend le HTML de la diapositive avec les valeurs de la ligne (les mêmes bulles, puces et conditions que le document), le dessin est celui du volet (SlidesEntry.blockSnapshot, numéro écrit) et il remplace
  // l'image de ce bloc, son texte et son texte alternatif (celui qu'elle avait tiré de la diapositive : un texte alternatif écrit par la personne reste). Les photos déjà dessinées se gardent (même HTML résolu,
  // mêmes marges, même rang : une autre ligne qui donne les mêmes valeurs, ou la même ligne relue) ; hors de l'extension, ou si le dessin échoue, le bloc garde la photo de l'éditeur.
  const REDRAWN_KEEP = 16;
  const redrawn = new Map();
  // Une empreinte courte d'un long texte (le HTML d'une diapositive peut porter ses images) : FNV-1a sur 32 bits, derrière la longueur.
  function stampOf(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return text.length + ':' + (h >>> 0).toString(36);
  }
  const readSource = (img) => {
    try {
      const value = JSON.parse(img.getAttribute('data-slide-source'));
      return value && typeof value.h === 'string' ? value : null;
    } catch (e) { return null; }
  };
  async function redrawOne(img, resolveHtml) {
    const source = readSource(img);
    if (!source) return false;
    const html = await resolveHtml(source.h);
    const at = source.r ? { rank: source.r, total: source.t } : null;
    const key = stampOf(html) + '|' + stampOf(JSON.stringify([source.m, at]));
    let shot = redrawn.get(key);
    if (shot) { redrawn.delete(key); } else { shot = await SlidesEntry.blockSnapshot(html, { marginsMm: source.m }, at); }
    if (!shot) return false;
    redrawn.set(key, shot);
    if (redrawn.size > REDRAWN_KEEP) redrawn.delete(redrawn.keys().next().value);
    const was = img.getAttribute('data-slide-text') || '';
    const auto = (img.getAttribute('alt') || '') === blockAltOf(was);
    img.setAttribute('src', shot.src);
    if (shot.text) img.setAttribute('data-slide-text', shot.text); else img.removeAttribute('data-slide-text');
    if (shot.words && shot.words.length) img.setAttribute('data-slide-words', JSON.stringify(shot.words)); else img.removeAttribute('data-slide-words');
    if (auto) img.setAttribute('alt', blockAltOf(shot.text));
    return true;
  }
  // Redessine les diapositives en bloc de `root` (le HTML d'un document) qui gardent leur diapositive. `stale()` : vrai quand un rendu plus récent a pris la suite (le reste est laissé). Une à une : chaque
  // dessin tient un canevas de 1920 x 1080. Rend le nombre de blocs redessinés.
  async function fillBlocks(root, resolveHtml, stale) {
    let n = 0;
    for (const img of Array.from(root.querySelectorAll('img.editor-image[data-slide-source]'))) {
      if (stale && stale()) break;
      try { if (await redrawOne(img, resolveHtml)) n++; } catch (e) { console.warn('[SlideCopies] diapositive en bloc : redessin impossible', e); }
      // La diapositive n'a plus rien à faire dans ce HTML de sortie (HTML, Word...), où elle n'est qu'un poids de plus.
      img.removeAttribute('data-slide-source');
    }
    return n;
  }

  // Le bloc lié que la sélection désigne (l'image sélectionnée), ou null : { block: { node, pos }, from, name, n, gone } (comme `statusAt` d'une copie en texte).
  function blockStatusAt(state) {
    const { selection } = state;
    const node = selection.node;
    if (!node || node.type.name !== 'editorImage' || !isBlockLink(node.attrs.slideLink)) return null;
    const editor = EditorCore.getEditor();
    const plan = editor && !editor.isDestroyed && kit().libs ? blockPlanOf(editor, node.attrs.slideLink) : { action: 'missing', model: null };
    return { block: { node, pos: selection.from }, from: selection.from, name: plan.model ? plan.model.nom : '', n: plan.action === 'missing' ? 0 : plan.at + 1, gone: plan.action === 'missing' };
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
    const asBlock = blockStatusAt(state);
    if (asBlock) return asBlock;
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
    // Un bloc garde son image : seul le lien part (un seul Annuler le rend).
    if (status.block) {
      const { node, pos } = status.block;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { slideLink: null })).setMeta(SlideLinks.kit().OWN_META, 'detach'));
      say('slides.block.detached', { name: status.name });
      return true;
    }
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

  return { SOURCE_TYPE, createExtension, follow, followBlocks, fillBlocks, forOutput, insert, insertBlock, blockSourceOf, numberStamp, detach, statusAt, linkedFrom, copiesOf, blocksOf };
})();
