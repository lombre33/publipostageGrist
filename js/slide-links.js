// Les diapositives liées d'une présentation (demande du 21/10, « Réutiliser », sa troisième fonction : importer une diapositive d'une autre présentation « en direct », dans les
// deux sens, avec l'option de bloquer un côté ; cartes du 21/10 : « Case du volet », « À la frappe », « Demander »). Le socle garde ici ce qui doit tenir même sans le code de
// l'extension « diapositives » : le repère caché, ses garde-fous, la synchro et ce que la Lecture et les exports en voient. L'interface (la case « Garder liée » du volet Importer, les
// lignes du menu ⋯ d'une miniature, ses pastilles, la fenêtre « Demander ») est dans extensions/diapositives/, qui se branche par `wire`.
//  - Le REPÈRE : un bloc vide de hauteur nulle à la fin de la diapositive (nœud `slideLink`, js/editor-nodes.js ; <div class="pp-slide-link"> dans le HTML enregistré). Une diapositive
//    importée d'ailleurs le porte avec son lien : le numéro et le jeton de la présentation source (`data-link-model`, `data-link-key` : le jeton dit de quel modèle il s'agit, comme pour un
//    tableau lié, js/linked-table.js), le numéro de la diapositive dans la source (`data-link-slide`), la base (`data-link-base` : les empreintes des deux côtés à la dernière synchro) et
//    le sens (`data-link-mode`). La diapositive source porte le sien, avec son numéro (`data-slide-id`, tiré au hasard à la pose du premier lien, qui ne change plus) : elle se retrouve
//    après un déplacement. Une diapositive peut être les deux à la fois.
//  - Les SENS, dans les mots de la demande : « Dans les deux sens » (both) ; « Suit la source » (pull) : la diapositive d'ici ne s'écrit pas, elle prend celle de la source ; « Envoie
//    à la source » (push) : celle de la source ne s'écrit plus là-bas (son repère porte `data-slide-lock`, le numéro de la présentation qui l'envoie) et prend celle d'ici.
//  - La SYNCHRO (planOf) : à l'ouverture de la présentation et à chaque lecture de l'enregistrement automatique (follow), une diapositive que seule la source a changée prend celle de la
//    source, sans entrer dans l'historique ni rendre la présentation « à enregistrer » (ouvrir n'écrit rien) ; une diapositive que seule cette présentation a changée part avec son
//    enregistrement, dans le même lot que sa ligne (prepareSend, `alsoWrite` de Templates.save : jamais l'une sans l'autre) ; les deux ont changé : rien ne bouge et la fenêtre
//    « Demander » de l'extension montre les deux versions (resolve tranche). Quand un côté est bloqué, son sens tranche : la source gagne en « Suit la source », cette présentation en
//    « Envoie à la source ». Écrire la source quand elle est ouverte ailleurs réécrit sa ligne : quand rien d'autre n'y a changé que des diapositives à repère, la page qui l'a ouverte
//    les prend sans bandeau de conflit, sa frappe ailleurs gardée (adopt).
//  - « À LA FRAPPE » (carte du 21/10) : deux présentations ouvertes se suivent pendant la frappe, par la table du direct de l'extension « édition » (js/slide-links-live.js porte la table et
//    ses messages ; ce module, ce qu'ils font au texte). Chaque page publie ses diapositives partagées qui changent (liveOut) ; ce qu'elle reçoit (liveIn) est, côté diapositive liée, la
//    dernière version de la source, que planOf préfère au cache tant que l'enregistrement de la source ne l'a pas rattrapée (overlays), et, côté source, la version d'une présentation qui
//    l'a importée, prise quand elle part de ce que la source montre. Rien n'entre dans l'historique, et le reste suit les règles de la synchro.
//  - Ce que COMPARENT les empreintes (slideHash) : le contenu de la diapositive tel que l'éditeur le relit de son HTML (l'aller-retour d'un enregistrement ou d'un envoi : ce que le
//    HTML ne garde pas, comme la hauteur d'une image posée par son style, ne fait pas deux versions), sans son repère, sans les marques de commentaire (le fil d'un commentaire est
//    celui de la présentation où il est posé), sans les images répétées sur toutes les pages (le fond des pages d'une présentation), sans la page ni la place à l'écran des images en
//    calque (leur place sur la page, en points, compte) ni la largeur des colonnes des tableaux (la page les retaille d'elle-même).
//  - Les GARDE-FOUS (createExtension) : un collage ne lie jamais (le repère ne se colle pas : une copie n'est pas un lien) ; une diapositive dupliquée garde sa copie sans lien ; un
//    repère effacé avec le texte de sa diapositive revient à la fin de celle-ci tant qu'elle est là ; le texte d'une diapositive bloquée refuse la frappe, le collage et les commandes
//    (ses images en calque suivent toujours sa page ; la déplacer ou la supprimer reste possible). Suivi des modifications, écriture en direct, en-tête ou pied en cours : rien ne se
//    synchronise.
//  - La COPIE EN TEXTE d'une diapositive, dans un document (demande du 22/10, lot 3) : le même repère, avec `data-link-span` (le nombre de blocs du document qui sont la copie, juste avant lui)
//    et `data-link-keep` (la mise en forme d'origine gardée) ; js/slide-copies.js en porte la synchro, le verrou, la barre et les sorties, et emprunte à ce module sa lecture des présentations
//    (kit). Une copie ne suit que dans un sens : « Suit la source ».
//  - Les SORTIES : la Lecture, le PDF, le Word, le diaporama, les e-mails et les lots ne voient jamais le repère (forOutput, par js/slides-entry.js:outputHtml), et celles d'une
//    présentation fermée lisent la diapositive de la source quand seule la source l'a changée, comme le fera l'éditeur à l'ouverture.
const SlideLinks = (function () {
  const NODE = 'slideLink';
  const CLASS = 'pp-slide-link';
  const TYPE = 'presentation';
  // Marque les transactions que ce module écrit (synchro, envoi, pose, réparation) : le garde-fou les laisse passer.
  const OWN_META = 'ppSlideLink';
  const MODES = ['both', 'pull', 'push'];
  const ATTRS = ['slideId', 'linkModel', 'linkKey', 'linkSlide', 'linkBase', 'linkMode', 'slideLock', 'linkSpan', 'linkKeep'];
  const DOM_ATTRS = {
    slideId: 'data-slide-id', linkModel: 'data-link-model', linkKey: 'data-link-key', linkSlide: 'data-link-slide', linkBase: 'data-link-base', linkMode: 'data-link-mode',
    slideLock: 'data-slide-lock', linkSpan: 'data-link-span', linkKeep: 'data-link-keep',
  };
  // Le repère ne prend aucune place : la pagination le lit comme un bloc de hauteur nulle à sa place (js/header-footer-preview.js le compte pour rien), jamais comme un bloc caché dont
  // le navigateur ne donne pas la position.
  const STYLE = 'display:block;height:0;margin:0;padding:0;border:0;overflow:hidden';
  const LOCK_NOTICE_MS = 2500;

  let libs = null;   // { PMDOMParser, EditorState } de ProseMirror (js/editor.js)
  function configure(deps) { libs = deps; }
  // Ce que l'extension prête au module (extensions/diapositives/) : la fenêtre « Demander » (`ask(conflicts)`), replacer les images en calque d'une diapositive qui vient de prendre
  // celle de la source (`settle(indexes)`), et ce que les miniatures doivent redessiner (`changed()`). Sans elle, les conflits se disent sur la ligne d'état.
  let ui = { ask: null, settle() {}, changed() {} };
  function wire(callbacks) { ui = Object.assign({}, ui, callbacks); }
  const say = (key, vars, isError) => SlidesEntry.status(I18n.t(key, vars), !!isError);

  // ---- Le repère dans le HTML -------------------------------------------------------------------------------------------------------------------------

  function idOf(value) {
    const n = Number(value);
    return value != null && value !== '' && Number.isInteger(n) && n > 0 ? n : null;
  }
  function keyOf(value) {
    const text = String(value == null ? '' : value);
    return /^[A-Za-z0-9]{8,64}$/.test(text) ? text : null;
  }
  function slideIdOf(value) {
    const text = String(value == null ? '' : value);
    return /^[a-z0-9]{8,24}$/.test(text) ? text : null;
  }
  function baseOf(value) {
    const text = String(value == null ? '' : value);
    return /^[a-z0-9]{8,12}\.[a-z0-9]{8,12}$/.test(text) ? text : null;
  }
  function parseBase(value) {
    const text = baseOf(value);
    if (!text) return null;
    const [doc, src] = text.split('.');
    return { doc, src };
  }
  const makeBase = (docHash, srcHash) => docHash + '.' + srcHash;
  const modeOf = value => (MODES.includes(value) ? value : 'both');
  function newSlideId() {
    return Array.from(crypto.getRandomValues(new Uint32Array(3)), word => word.toString(36).padStart(7, '0')).join('').slice(0, 16);
  }

  // Les attributs du repère lus dans son <div> : un lien incomplet (sans modèle, jeton ou diapositive) n'est pas un lien.
  function attrsOfEl(el) {
    const read = name => el.getAttribute(DOM_ATTRS[name]);
    const attrs = {
      slideId: slideIdOf(read('slideId')), linkModel: idOf(read('linkModel')), linkKey: keyOf(read('linkKey')), linkSlide: slideIdOf(read('linkSlide')),
      linkBase: baseOf(read('linkBase')), linkMode: null, slideLock: idOf(read('slideLock')), linkSpan: idOf(read('linkSpan')), linkKeep: read('linkKeep') === 'true' ? true : null,
    };
    if (attrs.linkModel && attrs.linkKey && attrs.linkSlide) attrs.linkMode = modeOf(read('linkMode'));
    else Object.assign(attrs, { linkModel: null, linkKey: null, linkSlide: null, linkBase: null, linkSpan: null, linkKeep: null });
    if (!attrs.slideId) attrs.slideLock = null;
    return attrs;
  }
  // Le <div> que l'éditeur écrit pour le repère : ses attributs non vides, rien de visible.
  function domAttrs(attrs) {
    const out = { class: CLASS, contenteditable: 'false', 'aria-hidden': 'true', style: STYLE };
    ATTRS.forEach((name) => { if (attrs[name] != null) out[DOM_ATTRS[name]] = String(attrs[name]); });
    return out;
  }
  const hasLink = attrs => !!(attrs && attrs.linkModel && attrs.linkKey && attrs.linkSlide);
  const isTag = node => !!node && node.type.name === NODE;
  // Ce qui dit de quel repère il s'agit, d'un état à l'autre du texte : son lien, sinon son numéro de diapositive source.
  const tagKey = attrs => (hasLink(attrs) ? 'l:' + attrs.linkModel + ':' + attrs.linkSlide : (attrs.slideId ? 's:' + attrs.slideId : ''));

  // Le HTML sans repère : ce que reçoivent la Lecture et les exports. Le HTML qui n'en a pas est rendu tel quel, sans être relu.
  function strip(html) {
    const text = String(html == null ? '' : html);
    if (text.indexOf(CLASS) === -1) return text;
    const body = HtmlSanitize.parseInert(text);
    const found = body.querySelectorAll('div.' + CLASS);
    if (!found.length) return text;
    found.forEach(el => el.remove());
    return body.innerHTML;
  }

  // ---- Les diapositives d'un texte et leurs empreintes ------------------------------------------------------------------------------------------------

  // Celles du texte `doc` (un nœud de document ProseMirror), dans l'ordre : { start, end, nodes, tag, tags } (`nodes` : ses blocs sans repère, { node, pos } ; `tag` : son premier repère,
  // `tags` : tous, d'ordinaire un seul).
  function slidesOf(doc) {
    const found = [];
    let slide = { start: 0, nodes: [], tag: null, tags: [] };
    doc.forEach((node, pos) => {
      if (node.type.name === 'pageBreak') {
        found.push(Object.assign(slide, { end: pos }));
        slide = { start: pos + node.nodeSize, nodes: [], tag: null, tags: [] };
        return;
      }
      if (isTag(node)) {
        slide.tags.push({ node, pos });
        if (!slide.tag) slide.tag = { node, pos };
        return;
      }
      slide.nodes.push({ node, pos });
    });
    found.push(Object.assign(slide, { end: doc.content.size }));
    return found;
  }

  // Une empreinte de 53 bits (cyrb53) d'un texte, en base 36 sur 11 signes : de quoi voir qu'une diapositive n'est plus la même, pas de quoi se protéger de quelqu'un.
  function hashOf(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(11, '0');
  }

  const isRepeatedJson = json => json.type === 'editorImage' && PageLayer.isRepeatedAttrs(json.attrs);
  const isLayerJson = json => json.type === 'editorImage' && !!json.attrs && !!json.attrs.layer && json.attrs.layer !== 'normal' && json.attrs.pageLeftPt != null && json.attrs.pageTopPt != null;
  // Un bloc tel que l'empreinte le lit (voir l'en-tête) : un JSON de ProseMirror, recopié là où il change (`toJSON` rend les attributs du nœud eux-mêmes : on les remplace, on ne les écrit
  // pas). Un paragraphe qui ne portait qu'une image répétée disparaît avec elle ; rend null pour ce qui ne compte pas.
  function comparable(json) {
    if (json.type === NODE || isRepeatedJson(json)) return null;
    const out = Object.assign({}, json);
    if (out.marks) {
      const marks = out.marks.filter(mark => mark.type !== 'commentMark');
      if (marks.length) out.marks = marks; else delete out.marks;
    }
    if (isLayerJson(out)) out.attrs = Object.assign({}, out.attrs, { pageIndex: null, top: null, left: null });
    if (out.attrs && out.attrs.colwidth) out.attrs = Object.assign({}, out.attrs, { colwidth: null });
    if (out.content) {
      const content = out.content.map(comparable).filter(Boolean);
      if (!content.length && out.content.length) return null;
      out.content = content;
    }
    return out;
  }
  // Les blocs que le HTML du bloc `node` rend une fois relu, comme au chargement d'un modèle (parseHtml).
  function roundTrip(node) {
    const schema = node.type.schema;
    const html = Editor.getHTML(schema.topNodeType.create(null, [node]));
    const out = [];
    libs.PMDOMParser.fromSchema(schema).parse(HtmlSanitize.parseInert(html)).forEach(child => out.push(child));
    return out;
  }
  // L'empreinte d'un bloc, gardée par nœud (un nœud ne change pas : la frappe ailleurs ne coûte rien), et celle d'une diapositive, faite de celles de ses blocs.
  const nodeHashes = new WeakMap();
  function nodeHash(node) {
    let hash = nodeHashes.get(node);
    if (hash === undefined) {
      const json = node.type.name === NODE ? [] : roundTrip(node).map(child => comparable(child.toJSON())).filter(Boolean);
      hash = json.length ? hashOf(JSON.stringify(json.length === 1 ? json[0] : json)) : '';
      nodeHashes.set(node, hash);
    }
    return hash;
  }
  const hashOfNodes = nodes => hashOf(nodes.map(nodeHash).filter(Boolean).join('.'));
  const slideHash = slide => hashOfNodes(slide.nodes.map(entry => entry.node));

  // Les blocs d'une diapositive tels qu'ils passent d'une présentation à l'autre : sans repère, sans marques de commentaire, sans images répétées (elles restent le fond des pages de
  // leur présentation) ; les images en calque gardent leur page, que l'appelant ramène sur celle de leur nouvelle place.
  function portable(editor, nodes) {
    const schema = editor.schema;
    const clean = (json) => {
      if (json.type === NODE || isRepeatedJson(json)) return null;
      const out = Object.assign({}, json);
      if (out.marks) {
        const marks = out.marks.filter(mark => mark.type !== 'commentMark');
        if (marks.length) out.marks = marks; else delete out.marks;
      }
      if (out.content) {
        const content = out.content.map(clean).filter(Boolean);
        if (!content.length && out.content.length && out.type === 'paragraph') return null;
        out.content = content;
      }
      return out;
    };
    const kept = nodes.map(node => clean(node.toJSON())).filter(Boolean).map(json => schema.nodeFromJSON(json));
    return kept.length ? kept : [schema.nodes.paragraph.create()];
  }
  // La première page des images en calque de `nodes` (les blocs d'une diapositive), ou null quand elle n'en a pas.
  function firstLayerPage(nodes) {
    let first = null;
    nodes.forEach(node => node.descendants((child) => {
      const a = child.attrs;
      if (child.type.name === 'editorImage' && a.layer && a.layer !== 'normal' && Number.isFinite(a.pageIndex) && !PageLayer.isRepeatedAttrs(a)) first = first == null ? a.pageIndex : Math.min(first, a.pageIndex);
      return true;
    }));
    return first;
  }
  // Les blocs `nodes`, leurs images en calque passées de la page `from` (la première de leur diapositive d'avant) à la page `to`, au même rang ; leur place à l'écran est relue à
  // l'ouverture (HeaderFooterPreview.reconcileLayerImagesWithGrid), celle d'une première page tout de suite.
  function movedLayers(editor, nodes, from, to) {
    if (from == null || to == null || from === to) return nodes;
    const shift = (json) => {
      const out = Object.assign({}, json);
      if (isLayerJson(out) && Number.isFinite(out.attrs.pageIndex) && !PageLayer.isRepeatedAttrs(out.attrs)) {
        const pageIndex = Math.max(0, out.attrs.pageIndex - from + to);
        out.attrs = Object.assign({}, out.attrs, { pageIndex });
        if (pageIndex === 0) out.attrs.top = Math.round(out.attrs.pageTopPt * PageLayer.PT_TO_PX);
      }
      if (out.content) out.content = out.content.map(shift);
      return out;
    };
    return nodes.map(node => editor.schema.nodeFromJSON(shift(node.toJSON())));
  }

  // Le texte d'un modèle, lu comme au chargement d'un modèle (HTML assaini, schéma de l'éditeur : js/track-changes.js:loadTrackedDocument), coupé en diapositives. Lu une fois tant que
  // son contenu ne change pas : la synchro le relit à chaque passage. { doc, slides, byId } (`byId` : le numéro d'une diapositive source -> son rang).
  const parsedModels = new Map();
  function parseHtml(editor, html) {
    const doc = libs.PMDOMParser.fromSchema(editor.schema).parse(HtmlSanitize.parseInert(String(html || '')));
    const slides = slidesOf(doc);
    const byId = new Map();
    slides.forEach((slide, index) => {
      const id = slide.tag && slide.tag.node.attrs.slideId;
      if (id && !byId.has(id)) byId.set(id, index);
    });
    return { doc, slides, byId };
  }
  function parseModel(editor, model) {
    const contenu = String(model.contenu || '');
    const kept = parsedModels.get(String(model.id));
    if (kept && kept.contenu === contenu && kept.schema === editor.schema) return kept.parsed;
    const parsed = parseHtml(editor, contenu);
    parsedModels.set(String(model.id), { contenu, schema: editor.schema, parsed });
    return parsed;
  }

  // La présentation source d'un lien, si elle existe et que son jeton est celui du lien ; null sinon (supprimée, ou un lien venu d'un autre document).
  function sourceOf(attrs) {
    if (!hasLink(attrs)) return null;
    const model = Templates.byId(attrs.linkModel);
    return model && model.typeModele === TYPE && model.jeton === attrs.linkKey ? model : null;
  }
  // Les numéros des diapositives source qu'une présentation envoie (« Envoie à la source »), lus dans son texte enregistré, une fois tant qu'il ne change pas.
  const pushedBy = new Map();
  const PUSH_TAG = /<div\b[^>]*\sdata-link-slide="([a-z0-9]{8,24})"[^>]*>/g;
  function pushesOf(model) {
    const contenu = String(model.contenu || '');
    const kept = pushedBy.get(String(model.id));
    if (kept && kept.contenu === contenu) return kept.ids;
    const ids = new Set();
    if (contenu.indexOf(CLASS) !== -1) {
      for (const match of contenu.matchAll(PUSH_TAG)) if (match[0].indexOf('data-link-mode="push"') !== -1) ids.add(match[1]);
    }
    pushedBy.set(String(model.id), { contenu, ids });
    return ids;
  }
  // La présentation qui bloque une diapositive source (« Envoie à la source »), tant qu'elle existe et l'envoie toujours ; null sinon : le verrou tombe avec elle, ou quand elle la
  // détache ou change de sens (son enregistrement suffit, sans rien écrire ici).
  function lockerOf(attrs) {
    if (!attrs || !attrs.slideId || !attrs.slideLock) return null;
    const model = Templates.byId(attrs.slideLock);
    return model && model.typeModele === TYPE && !Templates.isCurrent(model.id) && pushesOf(model).has(attrs.slideId) ? model : null;
  }

  // ---- Ce qu'il y a à faire d'une diapositive liée ------------------------------------------------------------------------------------------------------

  // { action, model, parsed, at, remote, docHash, srcHash } pour la diapositive `slide` de cette présentation, liée par `attrs` ; `action` :
  //  - 'missing' : la source n'existe plus, ou plus cette diapositive : rien ne bouge (le menu ⋯ le dit, « Détacher » garde la copie) ;
  //  - 'none' : rien n'a bougé depuis la dernière synchro ;
  //  - 'rebase' : les deux disent la même chose, mais la base n'est pas à jour : seule la base s'écrit ;
  //  - 'pull' : la diapositive prend celle de la source ;
  //  - 'push' : elle part à la source avec l'enregistrement de cette présentation ;
  //  - 'differs' : les deux ont changé (ou la base manque et elles diffèrent), dans les deux sens : rien ne bouge, la personne choisit.
  // La version d'une diapositive source arrivée par la table du direct (« À la frappe », liveIn) : 'modèle:diapositive' -> { nodes, hash, at, cached }. Elle passe avant le cache tant
  // que l'enregistrement de la source ne l'a pas rattrapée (le cache dit la même chose) ni dépassée (le cache a changé depuis qu'elle est arrivée : `cached`, ce qu'il disait alors), au
  // plus OVERLAY_MS : une page fermée avant d'enregistrer n'a laissé que ce qu'elle avait enregistré.
  const OVERLAY_MS = 30000;
  const overlays = new Map();
  function overlayFor(attrs, cachedHash) {
    const key = attrs.linkModel + ':' + attrs.linkSlide;
    const found = overlays.get(key);
    if (!found) return null;
    if (found.cached === undefined) found.cached = cachedHash;
    if (found.hash === cachedHash || found.cached !== cachedHash || Date.now() - found.at > OVERLAY_MS) {
      overlays.delete(key);
      return null;
    }
    return found;
  }
  // Les versions qu'une diapositive liée d'ici a publiées pendant la frappe (liveOut) : 'modèle:diapositive' -> empreintes, les GIVEN_MAX dernières. Une source qui montre l'une d'elles
  // l'a prise d'ici : la base avance à cette version (ce que la diapositive a changé depuis part avec l'enregistrement, sans demander).
  const GIVEN_MAX = 64;
  const given = new Map();
  function noteGiven(key, hash) {
    const list = given.get(key) || [];
    if (list[list.length - 1] === hash) return;
    list.push(hash);
    if (list.length > GIVEN_MAX) list.shift();
    given.set(key, list);
  }
  function effectiveBase(attrs, srcHash) {
    const base = parseBase(attrs.linkBase);
    if (base && base.src === srcHash) return base;
    const list = given.get(attrs.linkModel + ':' + attrs.linkSlide);
    return list && list.includes(srcHash) ? { doc: srcHash, src: srcHash } : base;
  }

  function planOf(editor, slide, attrs) {
    const model = sourceOf(attrs);
    if (!model) return { action: 'missing', model: null };
    const parsed = parseModel(editor, model);
    const at = parsed.byId.get(attrs.linkSlide);
    if (at === undefined) return { action: 'missing', model };
    let remote = parsed.slides[at];
    const docHash = slideHash(slide);
    let srcHash = slideHash(remote);
    const overlay = overlayFor(attrs, srcHash);
    if (overlay) {
      remote = Object.assign({}, remote, { nodes: overlay.nodes });
      srcHash = overlay.hash;
    }
    const base = effectiveBase(attrs, srcHash);
    const plan = action => ({ action, model, parsed, at, remote, docHash, srcHash, base });
    if (docHash === srcHash) return plan(base && base.doc === docHash && base.src === srcHash ? 'none' : 'rebase');
    const mode = attrs.linkMode;
    if (mode === 'pull') return plan('pull');
    if (mode === 'push') return plan('push');
    if (!base) return plan('differs');
    const docMoved = docHash !== base.doc;
    const srcMoved = srcHash !== base.src;
    if (docMoved && srcMoved) return plan('differs');
    if (!docMoved && !srcMoved) return plan('none');
    return plan(docMoved ? 'push' : 'pull');
  }

  // Pourquoi rien ne se synchronise maintenant : pas de présentation à l'écran, pas d'éditeur, suivi des modifications, écriture en direct, en-tête ou pied en cours, saisie en cours.
  function paused(editor) {
    if (!libs || !editor || editor.isDestroyed || !SlidesEntry.presentationShown()) return true;
    if (Editor.isTrackChangesOn() || LiveEntry.isLive() || HeaderFooterPreview.getHfMode()) return true;
    return !!(editor.view && editor.view.composing);
  }
  // Les diapositives liées du texte de l'éditeur, avec leur rang.
  function linkedSlides(doc) {
    return slidesOf(doc).map((slide, index) => ({ slide, index, attrs: slide.tag ? slide.tag.node.attrs : null })).filter(entry => hasLink(entry.attrs));
  }

  // ---- Le texte suit la source ------------------------------------------------------------------------------------------------------------------------

  // Remplace, dans `tr`, la diapositive `slide` (de `from` à `to`) par les blocs `nodes`, en ne touchant que ce qui diffère : le curseur et la sélection d'ailleurs dans la diapositive
  // restent où ils sont (une version qui arrive pendant que la personne lit ou tape dans une autre diapositive). Rien quand tout est pareil.
  function replaceSpan(tr, from, to, nodes) {
    const Fragment = tr.doc.content.constructor;
    const before = tr.doc.slice(from, to).content;
    const after = Fragment.fromArray(nodes);
    const start = before.findDiffStart(after);
    if (start == null) return;
    let { a: endA, b: endB } = before.findDiffEnd(after);
    const overlap = start - Math.min(endA, endB);
    if (overlap > 0) { endA += overlap; endB += overlap; }
    tr.replace(from + start, from + endA, tr.doc.type.create(null, after).slice(start, endB));
  }
  // Les blocs `incoming` (ceux d'une autre présentation, portable) à la place de ceux de la diapositive `slide` du texte `doc` : leurs images en calque sur la page de celle-ci, ses images
  // répétées gardées (elles sont le fond des pages d'ici) et son repère à la fin, tel qu'il est.
  function arrivingNodes(editor, doc, slide, incoming) {
    const own = [];
    slide.nodes.forEach(({ node }) => node.descendants((child) => { if (child.type.name === 'editorImage' && PageLayer.isRepeatedAttrs(child.attrs)) own.push(child); return true; }));
    const from = firstLayerPage(incoming);
    const to = firstLayerPage(slide.nodes.map(entry => entry.node));
    const moved = movedLayers(editor, incoming, from, to != null ? to : (from != null ? slidesOf(doc).findIndex(s => s.start === slide.start) : null));
    const tags = slide.tags.map(entry => entry.node);
    return { moved, nodes: own.length ? [doc.type.schema.nodes.paragraph.create(null, own), ...moved, ...tags] : [...moved, ...tags] };
  }
  // Remplace, dans `tr`, les blocs de la diapositive `slide` par ceux de la source (`plan.remote`) ; son repère prend sa nouvelle base. Rend la base posée.
  function replaceWithSource(editor, tr, slide, plan) {
    const { moved, nodes } = arrivingNodes(editor, tr.doc, slide, portable(editor, plan.remote.nodes.map(entry => entry.node)));
    const base = makeBase(hashOfNodes(moved), plan.srcHash);
    replaceSpan(tr, slide.start, slide.end, nodes);
    const now = slidesOf(tr.doc).find(s => s.start === slide.start);
    if (now && now.tag) tr.setNodeAttribute(now.tag.pos, 'linkBase', base);
    return base;
  }

  // Les diapositives liées du document ouvert suivent leur source, d'après les modèles du cache (relus par le passage de l'enregistrement automatique, ou à l'instant par la page) : à
  // l'ouverture (`loading` : les désaccords déjà dits se redisent) et à chaque lecture. Une seule transaction, hors de l'historique (Annuler ne rend pas ce que personne n'a fait), qui ne
  // rend pas la présentation « à enregistrer » (isSyncTransaction). Puis l'extension replace les images en calque arrivées, demande ce qui a changé des deux côtés et redessine ses
  // pastilles : la présentation ouverte est maintenant le modèle courant, et les modèles relus ont pu poser ou lever un verrou. Rend { pulled: [rangs], conflicts: [{ index, name }] },
  // ou null quand la synchro n'a pas lieu.
  // `quiet` : la synchro d'une version arrivée pendant la frappe (liveIn) ne dit rien sur la ligne d'état, qui changerait à chaque lettre.
  const noted = new Set();
  function follow(editor, loading, quiet) {
    if (loading) noted.clear();
    const done = paused(editor) ? null : followNow(editor, quiet);
    ui.changed();
    return done;
  }
  function followNow(editor, quiet) {
    const entries = linkedSlides(editor.state.doc);
    if (!entries.length) return null;
    const tr = editor.state.tr;
    const done = { pulled: [], conflicts: [] };
    // Du dernier au premier : remplacer une diapositive ne déplace pas celles d'avant.
    for (let i = entries.length - 1; i >= 0; i--) {
      const { slide, index, attrs } = entries[i];
      const plan = planOf(editor, slide, attrs);
      if (plan.action === 'pull') {
        replaceWithSource(editor, tr, slide, plan);
        done.pulled.unshift(index);
        done.name = plan.model.nom;
      } else if (plan.action === 'rebase') {
        tr.setNodeAttribute(slide.tag.pos, 'linkBase', makeBase(plan.docHash, plan.srcHash));
      } else if (plan.action === 'differs') {
        const signature = [attrs.linkModel, attrs.linkSlide, plan.docHash, plan.srcHash].join('|');
        if (noted.has(signature)) continue;
        noted.add(signature);
        done.conflicts.unshift({ index, name: plan.model.nom });
      }
    }
    if (tr.steps.length) editor.view.dispatch(tr.setMeta(OWN_META, 'sync').setMeta('addToHistory', false));
    if (done.pulled.length) {
      ui.settle(done.pulled);
      if (!quiet && done.pulled.length === 1) say('slides.link.pulled', { n: done.pulled[0] + 1, name: done.name });
      else if (!quiet) say('slides.link.pulledMany', { n: done.pulled.length });
    }
    if (done.conflicts.length) {
      if (ui.ask) ui.ask(done.conflicts);
      else say('slides.link.differs', { n: done.conflicts[0].index + 1, name: done.conflicts[0].name });
    }
    return done;
  }

  // La transaction de la synchro ou de l'envoi (la base qui avance une fois Grist d'accord), ou une que la page pose derrière elle, ne rend pas la présentation « à enregistrer ».
  const quiet = tr => tr.getMeta(OWN_META) === 'sync' || tr.getMeta(OWN_META) === 'send';
  function isSyncTransaction(tr) {
    if (!tr || !tr.getMeta) return false;
    if (quiet(tr)) return true;
    const root = tr.getMeta('appendedTransaction');
    return !!root && root !== tr && !!root.getMeta && quiet(root);
  }

  // ---- La source suit le texte ------------------------------------------------------------------------------------------------------------------------

  // Le texte de la présentation `model` après `edits` ([{ at, nodes?, lock }] : la diapositive de rang `at` prend les blocs `nodes` quand il y en a ; son repère prend le verrou `lock`,
  // le numéro de la présentation qui l'envoie, ou null), tel que l'éditeur l'écrirait. Lu sur son texte enregistré (le cache, relu par le passage qui enregistre).
  function rewriteSource(editor, model, parsed, edits) {
    const tr = libs.EditorState.create({ doc: parsed.doc }).tr;
    edits.slice().sort((a, b) => b.at - a.at).forEach((edit) => {
      const slide = parsed.slides[edit.at];
      const tagNode = slide.tag.node;
      const tag = tagNode.type.create(Object.assign({}, tagNode.attrs, { slideLock: edit.lock || null }));
      if (edit.nodes) {
        const own = [];
        slide.nodes.forEach(({ node }) => node.descendants((child) => { if (child.type.name === 'editorImage' && PageLayer.isRepeatedAttrs(child.attrs)) own.push(child); return true; }));
        const from = firstLayerPage(edit.nodes);
        const to = firstLayerPage(slide.nodes.map(entry => entry.node));
        const moved = movedLayers(editor, edit.nodes, from, to != null ? to : (from != null ? edit.at : null));
        const nodes = own.length ? [tr.doc.type.schema.nodes.paragraph.create(null, own), ...moved, tag] : [...moved, tag];
        tr.replaceWith(slide.start, slide.end, nodes);
      } else {
        // Le verrou seul : le repère change, la diapositive pas.
        tr.replaceWith(slide.tag.pos, slide.tag.pos + tagNode.nodeSize, tag);
      }
    });
    return Editor.getHTML(tr.doc);
  }

  // Y a-t-il une diapositive à envoyer, d'après les modèles du cache ? js/main.js relit les modèles avant un Enregistrer à la main quand c'est le cas : un envoi sur un cache dont on n'est
  // pas sûr écraserait une source changée ailleurs entre-temps.
  function hasPending(editor) {
    if (paused(editor)) return false;
    return linkedSlides(editor.state.doc).some(({ slide, attrs }) => {
      const plan = planOf(editor, slide, attrs);
      return plan.action === 'push' || !!lockChange(plan, attrs);
    });
  }
  // Le verrou que le repère de la diapositive source doit prendre pour ce lien : le numéro de cette présentation en « Envoie à la source », rien sinon (un verrou posé par elle tombe). Rend
  // { lock } quand il change, null quand il est bon (ou que la source n'est pas là).
  function lockChange(plan, attrs) {
    if (!plan.remote || !plan.remote.tag) return null;
    const self = idOf(Templates.getCurrentId());
    if (!self) return null;
    const current = plan.remote.tag.node.attrs.slideLock;
    if (attrs.linkMode === 'push') return current === self ? null : { lock: self };
    return current === self ? { lock: null } : null;
  }

  // La présentation va s'enregistrer : chaque diapositive que seule elle a changée (planOf : 'push') part avec elle, et le verrou de chaque source suit le sens de son lien. `startDoc` : le
  // texte qu'a préparé l'envoi des tableaux liés (js/main.js:linkedSendFor), ou rien. Rend null quand rien ne part, sinon { html, writes, commit, announce } (comme
  // js/linked-table.js:prepareSend) :
  //  - `html` : la présentation telle qu'elle s'écrira, AVEC la base d'après l'envoi sur chaque diapositive partie ; la base de l'éditeur, elle, n'avance qu'une fois Grist d'accord (un lot
  //    refusé ne laisse rien de changé : la diapositive reste à envoyer au passage suivant) ;
  //  - `writes` : [{ id, contenu }], le texte de chaque source réécrit, dans le même lot que la ligne de la présentation (Templates.save, `alsoWrite`) ;
  //  - `commit()`, `announce()` : la base avance, la ligne d'état dit les sources mises à jour.
  // La moitié « source » de la base est prise sur la diapositive telle que la source la rendra à la lecture (son texte réécrit, relu comme le fait parseModel).
  function prepareSend(editor, startDoc) {
    if (paused(editor)) return null;
    const byModel = new Map();
    const sends = [];
    linkedSlides(editor.state.doc).forEach(({ slide, attrs }) => {
      const plan = planOf(editor, slide, attrs);
      if (!plan.remote) return;
      const push = plan.action === 'push';
      const lock = lockChange(plan, attrs);
      if (!push && !lock) return;
      if (!byModel.has(plan.model.id)) byModel.set(plan.model.id, { model: plan.model, parsed: plan.parsed, edits: [] });
      const current = plan.remote.tag.node.attrs.slideLock;
      byModel.get(plan.model.id).edits.push({ at: plan.at, nodes: push ? portable(editor, slide.nodes.map(entry => entry.node)) : null, lock: lock ? lock.lock : current });
      if (push) sends.push({ model: plan.model.id, slideId: attrs.linkSlide, key: tagKey(attrs), pos: slide.tag.pos, from: attrs.linkBase, docHash: plan.docHash });
    });
    if (!byModel.size) return null;
    const writes = [];
    const names = [];
    byModel.forEach(({ model, parsed, edits }) => {
      const contenu = rewriteSource(editor, model, parsed, edits);
      writes.push({ id: model.id, contenu });
      if (edits.some(edit => edit.nodes)) names.push(model.nom);
      const stored = parseHtml(editor, contenu);
      sends.filter(send => send.model === model.id).forEach((send) => {
        const at = stored.byId.get(send.slideId);
        send.to = makeBase(send.docHash, at === undefined ? send.docHash : slideHash(stored.slides[at]));
      });
    });
    // Sur le texte de l'éditeur, ou sur celui que l'envoi des tableaux liés vient de préparer (`startDoc` : ses attributs seuls ont changé, les places sont les mêmes).
    const tr = startDoc ? libs.EditorState.create({ doc: startDoc }).tr : editor.state.tr;
    sends.forEach(({ pos, to }) => tr.setNodeAttribute(pos, 'linkBase', to));
    return {
      html: Editor.getHTML(tr.doc),
      writes,
      commit() {
        if (editor.isDestroyed) return;
        const settled = editor.state.tr;
        const now = new Map(linkedSlides(editor.state.doc).map(entry => [tagKey(entry.attrs), entry]));
        sends.forEach(({ key, from, to }) => {
          const found = now.get(key);
          if (found && found.attrs.linkBase === from) settled.setNodeAttribute(found.slide.tag.pos, 'linkBase', to);
        });
        if (settled.steps.length) editor.view.dispatch(settled.setMeta(OWN_META, 'send').setMeta('addToHistory', false));
      },
      announce() {
        if (names.length === 1) say('slides.link.pushed', { name: names[0] });
        else if (names.length > 1) say('slides.link.pushedMany', { n: names.length });
      },
    };
  }

  // ---- La source ouverte ici voit sa ligne réécrite par l'envoi d'une autre -----------------------------------------------------------------------------

  // Ce que ce widget a lu ou écrit en dernier de la présentation ouverte (js/main.js : à son ouverture et après chaque enregistrement) : son texte et ses autres réglages.
  let known = null;
  const settingsOf = tpl => JSON.stringify([tpl.nom, tpl.nomFichierPDF, tpl.headerFooter, tpl.marginsMm, tpl.typeModele]);
  function noteKnown(tpl) {
    const next = tpl && tpl.typeModele === TYPE ? { id: String(tpl.id), contenu: String(tpl.contenu || ''), settings: settingsOf(tpl) } : null;
    // Une autre présentation à l'écran : les versions arrivées pour celle d'avant ne la concernent plus.
    if (!next || !known || known.id !== next.id) { incoming.clear(); taken.clear(); republish.clear(); given.clear(); }
    known = next;
  }

  // La ligne de la présentation ouverte a changé ailleurs (js/main.js, avant le bandeau de conflit) : quand seuls son texte et, dans son texte, seules des diapositives à repère ont changé
  // depuis ce que ce widget en connaît (l'envoi d'une présentation qui les a importées), elles prennent leur nouvelle version ici, sans bandeau, dans une transaction hors de
  // l'historique, et ce que la personne a changé ailleurs reste à enregistrer. Une diapositive qu'elle a changée ici aussi, dans le même temps, garde sa version et la fenêtre
  // « Demander » propose l'autre (resolveIncoming). Vrai quand c'est fait : js/main.js prend la date de la ligne pour la sienne ; faux, et le bandeau s'ouvre comme toujours.
  const incoming = new Map();   // numéro d'une diapositive source -> la version arrivée que la personne n'a pas encore prise (« Demander »)
  function adopt(editor, remoteTpl) {
    if (paused(editor) || !known || !remoteTpl || String(remoteTpl.id) !== known.id || remoteTpl.typeModele !== TYPE) return false;
    if (settingsOf(remoteTpl) !== known.settings) return false;
    const before = parseHtml(editor, known.contenu);
    const after = parseHtml(editor, remoteTpl.contenu);
    const here = slidesOf(editor.state.doc);
    if (before.slides.length !== after.slides.length || here.length !== before.slides.length) return false;
    const idOfSlide = slide => (slide.tag && slide.tag.node.attrs.slideId) || null;
    const changed = [];
    for (let i = 0; i < after.slides.length; i++) {
      const was = before.slides[i];
      const now = after.slides[i];
      const tagText = slide => (slide.tag ? JSON.stringify(slide.tag.node.attrs) : '');
      if (slideHash(was) === slideHash(now) && tagText(was) === tagText(now)) continue;
      // Ce qui change ailleurs que dans une diapositive à repère n'est pas un envoi : le bandeau.
      const id = idOfSlide(now);
      if (!id || (idOfSlide(was) && idOfSlide(was) !== id)) return false;
      // La diapositive d'ici doit être la même que celle d'avant : son numéro, ou, sans numéro encore (celui que l'envoi vient de poser), son texte inchangé.
      const slide = here[i];
      if (idOfSlide(was) ? idOfSlide(slide) !== id : slideHash(slide) !== slideHash(was)) return false;
      changed.push(i);
    }
    const tr = editor.state.tr;
    const taken = [];
    const asked = [];
    changed.slice().reverse().forEach((i) => {
      const slide = here[i];
      const now = after.slides[i];
      const tagAttrs = Object.assign({}, slide.tag ? slide.tag.node.attrs : {}, { slideId: now.tag.node.attrs.slideId, slideLock: now.tag.node.attrs.slideLock });
      const tag = now.tag.node.type.create(tagAttrs);
      const editedHere = slideHash(slide) !== slideHash(before.slides[i]);
      const same = slideHash(slide) === slideHash(now);
      if (editedHere && !same) {
        // Changée ici aussi : elle garde sa version, la fenêtre propose l'autre.
        incoming.set(tagAttrs.slideId, now);
        asked.unshift({ index: i, incoming: true });
        if (slide.tag) tr.replaceWith(slide.tag.pos, slide.tag.pos + slide.tag.node.nodeSize, tag);
        else tr.insert(slide.end, tag);
        return;
      }
      if (same) {
        if (slide.tag) tr.replaceWith(slide.tag.pos, slide.tag.pos + slide.tag.node.nodeSize, tag);
        else tr.insert(slide.end, tag);
        return;
      }
      tr.replaceWith(slide.start, slide.end, [...portable(editor, now.nodes.map(entry => entry.node)), tag]);
      taken.unshift(i);
    });
    if (tr.steps.length) editor.view.dispatch(tr.setMeta(OWN_META, 'sync').setMeta('addToHistory', false));
    noteKnown(remoteTpl);
    if (taken.length) {
      ui.settle(taken);
      if (taken.length === 1) say('slides.link.received', { n: taken[0] + 1 });
      else say('slides.link.receivedMany', { n: taken.length });
    }
    if (asked.length) {
      if (ui.ask) ui.ask(asked);
      else say('slides.link.differsHere', { n: asked[0].index + 1 });
    }
    ui.changed();
    return true;
  }

  // ---- « À la frappe » : ce que la table du direct apporte et emporte -----------------------------------------------------------------------------------

  // Les diapositives que cette page partage pendant la frappe, dans le texte `doc` : chaque diapositive liée qui écrit vers sa source (« Dans les deux sens », « Envoie à la source ») sur le
  // canal de sa source, chaque diapositive source sur celui de cette présentation. [{ key, channel, id, side, slide }] (`key` : 'canal:diapositive', `side` : 'target' ou 'source').
  function sharedOf(doc) {
    const self = idOf(Templates.getCurrentId());
    const out = [];
    slidesOf(doc).forEach((slide) => {
      const attrs = slide.tag ? slide.tag.node.attrs : null;
      if (!attrs) return;
      if (hasLink(attrs) && attrs.linkMode !== 'pull') out.push({ key: attrs.linkModel + ':' + attrs.linkSlide, channel: attrs.linkModel, id: attrs.linkSlide, side: 'target', slide });
      if (attrs.slideId && self) out.push({ key: self + ':' + attrs.slideId, channel: self, id: attrs.slideId, side: 'source', slide });
    });
    return out;
  }
  // Les canaux que cette page écoute : celui de chaque source de ses diapositives liées (« Suit la source » compris) et le sien quand elle a des diapositives source.
  function liveChannels(editor) {
    const channels = new Set();
    if (!libs || !editor || editor.isDestroyed) return channels;
    const self = idOf(Templates.getCurrentId());
    slidesOf(editor.state.doc).forEach((slide) => {
      const attrs = slide.tag ? slide.tag.node.attrs : null;
      if (!attrs) return;
      if (hasLink(attrs) && sourceOf(attrs)) channels.add(attrs.linkModel);
      if (attrs.slideId && self) channels.add(self);
    });
    return channels;
  }
  // L'empreinte de chaque diapositive partagée du texte `doc` : 'canal:diapositive' -> empreinte.
  function liveHashes(doc) {
    return libs ? new Map(sharedOf(doc).map(entry => [entry.key, slideHash(entry.slide)])) : new Map();
  }
  // Ce que la page publie : [{ key, channel, id, side, hash, from, html, force }]. `from` : pour une diapositive liée, la version de la source sur laquelle elle a été tapée (la moitié
  // « source » de sa base) ; pour une diapositive source gardée contre celle d'une autre page, celle-ci ; `html` : ses blocs tels qu'ils passent d'une présentation à l'autre
  // (portable) ; `force` : à republier même sans changement (« Garder celle d'ici »).
  const republish = new Map();   // 'canal:diapositive' -> la version écartée ('' pour une diapositive liée)
  function liveOut(editor) {
    if (paused(editor)) return [];
    return sharedOf(editor.state.doc).filter(entry => entry.side === 'source' || sourceOf(entry.slide.tag.node.attrs)).map((entry) => {
      const hash = slideHash(entry.slide);
      const plan = entry.side === 'target' ? planOf(editor, entry.slide, entry.slide.tag.node.attrs) : null;
      if (plan) noteGiven(entry.key, hash);
      const nodes = portable(editor, entry.slide.nodes.map(e => e.node));
      const force = republish.has(entry.key);
      const over = force ? republish.get(entry.key) : '';
      republish.delete(entry.key);
      return { key: entry.key, channel: entry.channel, id: entry.id, side: entry.side, hash, from: plan ? (plan.base ? plan.base.src : '') : over, html: Editor.getHTML(editor.schema.topNodeType.create(null, nodes)), force };
    });
  }
  // Ce qu'une autre page (`client`, qui montre la présentation `sender`) publie sur le canal `channel` : [{ id, html, from }]. Une diapositive liée d'ici garde la version arrivée de sa
  // source (overlays) et la synchro fait le reste ; elle la prend tout de suite quand la source l'a tapée sur ce qu'elle montre (`from`). Une diapositive source d'ici prend la version d'une présentation qui l'a importée quand celle-ci part de ce qu'elle montre (`from`), ou que cette même page continue de taper
  // sur la version qu'elle a déjà donnée ici (taken), et toujours quand cette présentation la bloque ici (« Envoie à la source ») ; sinon elle garde la sienne et la fenêtre « Demander »
  // propose l'autre. Faux quand la synchro n'a pas lieu maintenant (la version attend son tour).
  const taken = new Map();   // 'canal:diapositive' d'une diapositive source d'ici -> { client, hash } : la dernière version prise d'une autre page
  function liveIn(editor, channel, client, entries, sender) {
    if (paused(editor)) return false;
    const self = idOf(Templates.getCurrentId());
    if (sender === self) return true;
    const byId = new Map();
    entries.forEach((entry) => {
      const parsed = parseHtml(editor, entry.html);
      if (parsed.slides.length === 1) byId.set(entry.id, { slide: parsed.slides[0], from: entry.from });
    });
    const slides = slidesOf(editor.state.doc);
    const tr = editor.state.tr;
    const applied = [];
    const asked = [];
    let follows = false;
    for (let i = slides.length - 1; i >= 0; i--) {
      const slide = slides[i];
      const attrs = slide.tag ? slide.tag.node.attrs : null;
      if (!attrs) continue;
      if (hasLink(attrs) && attrs.linkModel === channel && sender === channel && byId.has(attrs.linkSlide)) {
        const { slide: found, from } = byId.get(attrs.linkSlide);
        const there = slideHash(found);
        overlays.set(channel + ':' + attrs.linkSlide, { nodes: found.nodes, hash: there, at: Date.now() });
        if (attrs.linkMode !== 'push' && from && from === slideHash(slide) && from !== there && sourceOf(attrs)) {
          const nodes = portable(editor, found.nodes.map(e => e.node));
          replaceWithSource(editor, tr, slide, { remote: found, srcHash: there });
          if (firstLayerPage(nodes) != null) applied.unshift(i);
        }
        follows = true;
      }
      if (!attrs.slideId || channel !== self || !byId.has(attrs.slideId)) continue;
      const key = self + ':' + attrs.slideId;
      const { slide: found, from } = byId.get(attrs.slideId);
      const here = slideHash(slide);
      const there = slideHash(found);
      const last = taken.get(key);
      if (here !== there) {
        if (here === from || (last && last.client === client && last.hash === here) || lockerOf(attrs)) {
          const nodes = portable(editor, found.nodes.map(e => e.node));
          replaceSpan(tr, slide.start, slide.end, arrivingNodes(editor, tr.doc, slide, nodes).nodes);
          if (firstLayerPage(nodes) != null) applied.unshift(i);
        } else {
          incoming.set(attrs.slideId, found);
          asked.unshift({ index: i, incoming: true });
          continue;
        }
      }
      incoming.delete(attrs.slideId);
      taken.set(key, { client, hash: there });
    }
    if (tr.steps.length) editor.view.dispatch(tr.setMeta(OWN_META, 'sync').setMeta('addToHistory', false));
    if (applied.length) ui.settle(applied);
    if (follows) follow(editor, false, true);
    else ui.changed();
    if (asked.length) {
      if (ui.ask) ui.ask(asked);
      else say('slides.link.differsHere', { n: asked[0].index + 1 });
    }
    return true;
  }

  // ---- Les sorties d'une présentation fermée ----------------------------------------------------------------------------------------------------------

  // Le HTML d'une présentation tel que la Lecture et les exports le reçoivent : sans repère, et, quand l'éditeur est là, chaque diapositive liée que seule sa source a changée depuis la
  // dernière synchro prend celle de la source, comme le fera l'éditeur à l'ouverture (« Suit la source » : toujours). Le HTML sans repère est rendu tel quel, sans être relu.
  function forOutput(html) {
    const text = String(html == null ? '' : html);
    if (text.indexOf(CLASS) === -1) return text;
    const editor = EditorCore.getEditor();
    if (!libs || !editor || editor.isDestroyed || text.indexOf(DOM_ATTRS.linkSlide) === -1) return strip(text);
    const parsed = parseHtml(editor, text);
    const tr = libs.EditorState.create({ doc: parsed.doc }).tr;
    let changed = false;
    for (let i = parsed.slides.length - 1; i >= 0; i--) {
      const slide = parsed.slides[i];
      const attrs = slide.tag ? slide.tag.node.attrs : null;
      if (!hasLink(attrs)) continue;
      const plan = planOf(editor, slide, attrs);
      if (plan.action !== 'pull') continue;
      replaceWithSource(editor, tr, slide, plan);
      changed = true;
    }
    return strip(changed ? Editor.getHTML(tr.doc) : text);
  }

  // ---- Les gestes de l'interface ----------------------------------------------------------------------------------------------------------------------

  // Ce que l'interface dit de la diapositive `slide` (ou de rang `index`) du texte de l'éditeur, ou null quand elle n'est liée à rien :
  //  - { kind: 'target', mode, name, missing, locked, differs } : elle vient d'une autre présentation (`name`, '' quand la source n'existe plus : `missing`) ; `locked` : « Suit la source » ;
  //  - { kind: 'source', name, differs } : une autre présentation la lui envoie et la bloque ici (`name` : celle-là) ;
  //  - `differs` : elle a changé ici et dans sa source depuis la dernière synchro (planOf : 'differs'), ou une version arrivée attend que la personne choisisse (adopt).
  function infoOf(editor, slide) {
    const attrs = slide && slide.tag ? slide.tag.node.attrs : null;
    if (!attrs) return null;
    const waiting = !!attrs.slideId && incoming.has(attrs.slideId);
    if (hasLink(attrs)) {
      const plan = planOf(editor, slide, attrs);
      return { kind: 'target', mode: attrs.linkMode, name: plan.model ? plan.model.nom : '', missing: plan.action === 'missing', locked: attrs.linkMode === 'pull' && plan.action !== 'missing', differs: plan.action === 'differs' || waiting };
    }
    const locker = lockerOf(attrs);
    if (locker) return { kind: 'source', name: locker.nom, differs: waiting };
    return waiting ? { kind: 'source', name: '', differs: true } : null;
  }
  function infoAt(editor, index) {
    return editor ? infoOf(editor, slidesOf(editor.state.doc)[index]) : null;
  }
  // La même chose pour chaque diapositive du texte de l'éditeur, dans l'ordre (les pastilles de la bande) ; [] quand le texte n'a aucun repère.
  function infoList(editor) {
    if (!editor || !libs) return [];
    const slides = slidesOf(editor.state.doc);
    if (!slides.some(slide => slide.tag)) return [];
    return slides.map(slide => infoOf(editor, slide));
  }
  // Une transaction que la page pose d'elle-même derrière la synchro (les images en calque arrivées, slide-strip.js) : hors de l'historique, sans rendre la présentation « à enregistrer ».
  const markSync = tr => tr.setMeta(OWN_META, 'sync').setMeta('addToHistory', false);
  // Ce que les gestes de l'interface rendent impossible maintenant (clé de la raison), ou null.
  function blockedReason() {
    if (Editor.isTrackChangesOn()) return 'slides.link.offTracked';
    if (LiveEntry.isLive()) return 'slides.link.offLive';
    return null;
  }
  // Un geste sur le repère de la diapositive `index` : `change(attrs)` rend ses nouveaux attributs (null : il part). Un seul Annuler ; la présentation devient « à enregistrer », et
  // l'enregistrement qui suit écrit ce que le geste demande à la source (son verrou).
  function editTag(editor, index, change) {
    const slide = slidesOf(editor.state.doc)[index];
    if (!slide || !slide.tag || blockedReason()) return false;
    const next = change(Object.assign({}, slide.tag.node.attrs));
    const tr = editor.state.tr;
    if (next && (next.slideId || hasLink(next))) tr.setNodeMarkup(slide.tag.pos, undefined, next);
    else tr.delete(slide.tag.pos, slide.tag.pos + slide.tag.node.nodeSize);
    editor.view.dispatch(tr.setMeta(OWN_META, 'edit'));
    ui.changed();
    return true;
  }
  // Le sens du lien de la diapositive `index` : 'both', 'pull' ou 'push'. Le lien garde sa base : ce qui avait changé d'un côté part, ou arrive, au passage suivant selon le nouveau sens.
  const setMode = (editor, index, mode) => editTag(editor, index, attrs => (hasLink(attrs) ? Object.assign(attrs, { linkMode: modeOf(mode) }) : attrs));
  // « Détacher » : la diapositive garde ce qu'elle montre et n'est plus liée. Sur une diapositive que cette présentation importe, le lien part (le verrou qu'elle posait sur la source
  // tombe dès que cette présentation s'enregistre : lockerOf) ; sur une diapositive source bloquée par une autre, son numéro et son verrou partent : cette autre présentation ne la
  // retrouve plus et garde sa copie.
  function detach(editor, index) {
    return editTag(editor, index, (attrs) => {
      if (hasLink(attrs)) return Object.assign(attrs, { linkModel: null, linkKey: null, linkSlide: null, linkBase: null, linkMode: null });
      return Object.assign(attrs, { slideId: null, slideLock: null });
    });
  }

  // Les deux versions d'une diapositive en désaccord, pour la fenêtre « Demander » : { here, there, name } (le HTML de chacune, sans repère ; `name` : la présentation d'en face), ou
  // null quand il n'y a plus de désaccord.
  function versionsAt(editor, index) {
    const slide = slidesOf(editor.state.doc)[index];
    if (!slide) return null;
    const htmlOf = nodes => strip(Editor.getHTML(editor.schema.topNodeType.create(null, portable(editor, nodes))));
    const ownId = slide.tag ? slide.tag.node.attrs.slideId : null;
    if (ownId && incoming.has(ownId)) {
      const now = incoming.get(ownId);
      const locker = lockerOf(slide.tag.node.attrs);
      return { here: htmlOf(slide.nodes.map(e => e.node)), there: htmlOf(now.nodes.map(e => e.node)), name: locker ? locker.nom : '', incoming: true };
    }
    const attrs = slide.tag ? slide.tag.node.attrs : null;
    if (!hasLink(attrs)) return null;
    const plan = planOf(editor, slide, attrs);
    if (!plan.remote || plan.docHash === plan.srcHash) return null;
    return { here: htmlOf(slide.nodes.map(e => e.node)), there: htmlOf(plan.remote.nodes.map(e => e.node)), name: plan.model.nom, incoming: false };
  }
  // Le choix de la fenêtre « Demander » pour la diapositive `index` : 'here' garde celle d'ici (elle part à la source avec l'enregistrement qui suit, ou, version arrivée ici, elle reste
  // et s'enregistre) ; 'there' prend l'autre (un Ctrl+Z la rend). Vrai quand c'est fait.
  function resolve(editor, index, choice) {
    const slide = slidesOf(editor.state.doc)[index];
    if (!slide || blockedReason()) return false;
    const tr = editor.state.tr;
    const ownId = slide.tag ? slide.tag.node.attrs.slideId : null;
    if (ownId && incoming.has(ownId)) {
      const now = incoming.get(ownId);
      incoming.delete(ownId);
      if (choice === 'there') tr.replaceWith(slide.start, slide.end, [...portable(editor, now.nodes.map(e => e.node)), ...(slide.tag ? [slide.tag.node] : [])]);
      else {
        // Celle d'ici part aussi à la page qui envoyait l'autre, pendant la frappe (liveOut), comme tapée sur la sienne : elle la prend sans demander.
        republish.set(Templates.getCurrentId() + ':' + ownId, slideHash(now));
        return true;
      }
    } else {
      const attrs = slide.tag ? slide.tag.node.attrs : null;
      if (!hasLink(attrs)) return false;
      const plan = planOf(editor, slide, attrs);
      if (!plan.remote) return false;
      // « Garder celle d'ici » : la base dit que seule celle d'ici a changé (planOf : 'push') ; « Prendre celle de la source » : elle la prend.
      if (choice === 'there') replaceWithSource(editor, tr, slide, plan);
      else {
        tr.setNodeAttribute(slide.tag.pos, 'linkBase', makeBase(hashOf('kept:' + plan.docHash), plan.srcHash));
        republish.set(attrs.linkModel + ':' + attrs.linkSlide, '');
      }
    }
    editor.view.dispatch(tr.setMeta(OWN_META, 'edit'));
    if (choice === 'there') ui.settle([index]);
    ui.changed();
    return true;
  }

  // L'import lié (la case « Garder liée » du volet Importer) : la diapositive de rang `index` de la présentation `id`, telle que la personne l'a vue (`seen` : le texte de la source
  // qu'avait le cache), reçoit son numéro de diapositive source quand elle n'en a pas encore, écrit tout de suite dans la source (son texte seul, Templates.saveContent ; relu juste avant :
  // un repère posé sur un cache en retard écraserait ce que la source a changé depuis). Rend { html, link } : la diapositive à importer et le lien de son repère (sans base : tagImported la
  // prend sur ce que le collage a posé) ; lève une Error dont `reason` est la clé de la raison (la source supprimée, ou changée depuis que la personne l'a vue).
  async function anchorSource(editor, id, index, seen) {
    const fail = (reason) => { const error = new Error(reason); error.reason = reason; throw error; };
    if (!libs || !editor) fail('slides.link.failed');
    const blocked = blockedReason();
    if (blocked) fail(blocked);
    const before = parseHtml(editor, seen);
    const wanted = before.slides[index];
    if (!wanted) fail('slides.link.changed');
    const wantedHash = slideHash(wanted);
    await Templates.loadAll();
    const model = Templates.byId(id);
    if (!model || model.typeModele !== TYPE) fail('slides.link.gone');
    const key = model.jeton || await Templates.ensureToken(model.id);
    if (!key) fail('slides.link.failed');
    const parsed = parseHtml(editor, model.contenu);
    let at = parsed.slides[index] && slideHash(parsed.slides[index]) === wantedHash ? index : parsed.slides.findIndex(slide => slideHash(slide) === wantedHash);
    if (at < 0) fail('slides.link.changed');
    let slide = parsed.slides[at];
    let slideId = slide.tag && slide.tag.node.attrs.slideId;
    if (!slideId) {
      slideId = newSlideId();
      const tr = libs.EditorState.create({ doc: parsed.doc }).tr;
      const attrs = slide.tag ? Object.assign({}, slide.tag.node.attrs, { slideId }) : Object.assign(Object.fromEntries(ATTRS.map(name => [name, null])), { slideId });
      const tag = editor.schema.nodes[NODE].create(attrs);
      if (slide.tag) tr.replaceWith(slide.tag.pos, slide.tag.pos + slide.tag.node.nodeSize, tag); else tr.insert(slide.end, tag);
      await Templates.saveContent(model.id, Editor.getHTML(tr.doc));
    }
    const nodes = portable(editor, slide.nodes.map(entry => entry.node));
    const html = strip(Editor.getHTML(editor.schema.topNodeType.create(null, nodes)));
    return { html, link: { linkModel: model.id, linkKey: key, linkSlide: slideId, linkMode: 'both', srcHash: slideHash(slide), name: model.nom } };
  }
  // Juste après le collage de l'import lié, dans le même pas d'annulation : la diapositive `index` du texte de l'éditeur reçoit son repère, avec la base prise sur ce que le collage a posé.
  function tagImported(editor, index, link) {
    const slide = slidesOf(editor.state.doc)[index];
    if (!slide) return false;
    const attrs = Object.assign(Object.fromEntries(ATTRS.map(name => [name, null])), slide.tag ? slide.tag.node.attrs : {}, {
      linkModel: link.linkModel, linkKey: link.linkKey, linkSlide: link.linkSlide, linkMode: modeOf(link.linkMode), linkBase: makeBase(slideHash(slide), link.srcHash),
    });
    const tag = editor.schema.nodes[NODE].create(attrs);
    const tr = editor.state.tr;
    if (slide.tag) tr.replaceWith(slide.tag.pos, slide.tag.pos + slide.tag.node.nodeSize, tag); else tr.insert(slide.end, tag);
    // Rangée dans l'événement d'historique du collage (le contrat de prosemirror-history, comme js/editor.js:dispatchColumnWidthFix) : un Ctrl+Z défait l'import lié en entier.
    editor.view.dispatch(tr.setMeta(OWN_META, 'link').setMeta('appendedTransaction', tr));
    ui.changed();
    return true;
  }
  // La présentation `id` porte-t-elle déjà, dans le texte de l'éditeur, un lien vers sa diapositive `slideId` ? (Un lien par diapositive source et par présentation.)
  function linkedFrom(editor, id) {
    const found = new Set();
    if (editor) linkedSlides(editor.state.doc).forEach(({ attrs }) => { if (String(attrs.linkModel) === String(id)) found.add(attrs.linkSlide); });
    return found;
  }
  // Le numéro de diapositive source de chaque diapositive de `html` (le texte d'une présentation), dans l'ordre ; null pour une diapositive sans numéro.
  function slideIdsOf(editor, html) {
    if (!libs || !editor) return [];
    return parseHtml(editor, html).slides.map(slide => (slide.tag && slide.tag.node.attrs.slideId) || null);
  }

  // ---- Les garde-fous ----------------------------------------------------------------------------------------------------------------------------------

  // Les diapositives bloquées du texte `doc` : celles qui suivent leur source (« Suit la source », la source là) et celles qu'une autre présentation envoie ici (« Envoie à la source »).
  // { key, hash } pour chacune.
  function lockedOf(doc) {
    const out = [];
    slidesOf(doc).forEach((slide) => {
      const attrs = slide.tag ? slide.tag.node.attrs : null;
      if (!attrs) return;
      if ((hasLink(attrs) && attrs.linkMode === 'pull' && sourceOf(attrs)) || lockerOf(attrs)) out.push({ key: tagKey(attrs), hash: slideHash(slide), attrs });
    });
    return out;
  }
  // Une transaction de la personne (frappe, collage, commande, geste de la bande) qui changerait le texte d'une diapositive bloquée est refusée ; la ligne d'état dit pourquoi, une fois de
  // temps en temps. Passent : ce module, un chargement, Annuler et Rétablir, ce que la page pose d'elle-même (hors de l'historique, ou rangé derrière une autre transaction : les images
  // en calque qui suivent leur page), une transaction venue d'une autre personne (écriture en direct), et un geste qui emporte toute la diapositive (déplacer, supprimer).
  let lockSaidAt = 0;
  function refuses(tr, state) {
    if (!tr.docChanged || !SlidesEntry.presentationShown() || HeaderFooterPreview.getHfMode()) return false;
    if (tr.getMeta(OWN_META) || tr.getMeta('history$') || tr.getMeta('preventUpdate') || tr.getMeta('addToHistory') === false || tr.getMeta('appendedTransaction') || LiveEntry.isRemote(tr)) return false;
    const locked = lockedOf(state.doc);
    if (!locked.length) return false;
    const after = new Map();
    slidesOf(tr.doc).forEach((slide) => { if (slide.tag) after.set(tagKey(slide.tag.node.attrs), slide); });
    const hit = locked.find(({ key, hash }) => after.has(key) && slideHash(after.get(key)) !== hash);
    if (!hit) return false;
    if (Date.now() - lockSaidAt > LOCK_NOTICE_MS) {
      lockSaidAt = Date.now();
      const locker = lockerOf(hit.attrs);
      if (locker) say('slides.link.lockedHere', { name: locker.nom }, true);
      else say('slides.link.lockedPull', { name: sourceOf(hit.attrs).nom }, true);
    }
    return true;
  }

  // Après une transaction : un repère par diapositive et un lien par diapositive source. Un repère qui vient d'arriver en double (une diapositive dupliquée, rendue par Annuler, glissée) perd
  // ce que le repère déjà là garde, où qu'il soit par rapport à la copie : son numéro de diapositive source, son lien ; un repère qui n'a plus rien part. Deux repères dans une même
  // diapositive (le saut de page entre deux diapositives effacé) n'en font plus qu'un, le premier. Un repère effacé avec le texte de sa diapositive revient à la fin de la diapositive de
  // même rang, quand leur nombre n'a pas changé (rien n'a été supprimé en entier). Rien à faire quand aucun repère n'est là ni avant ni après.
  function tidy(trs, oldState, state) {
    if (!trs.some(tr => tr.docChanged) || trs.every(tr => tr.getMeta('preventUpdate'))) return null;
    if (!SlidesEntry.presentationShown() || HeaderFooterPreview.getHfMode()) return null;
    const before = slidesOf(oldState.doc);
    const after = slidesOf(state.doc);
    const tagsBefore = before.reduce((n, slide) => n + slide.tags.length, 0);
    const tagsAfter = after.reduce((n, slide) => n + slide.tags.length, 0);
    if (!tagsBefore && !tagsAfter) return null;
    // Où sont allés les repères d'avant : leur place dans le texte d'après, par numéro de diapositive source et par lien.
    const maps = [];
    trs.forEach(t => t.mapping.maps.forEach(map => maps.push(map)));
    const mapPos = pos => maps.reduce((at, map) => map.map(at, 1), pos);
    const placeById = new Map();
    const placeByLink = new Map();
    before.forEach(slide => slide.tags.forEach(({ node, pos }) => {
      const at = mapPos(pos);
      if (node.attrs.slideId) placeById.set(node.attrs.slideId, at);
      if (hasLink(node.attrs)) placeByLink.set(tagKey(node.attrs), at);
    }));
    const firsts = [];
    const changes = [];   // { pos, node, attrs (null : le repère part) }, dans le texte d'après
    after.forEach(slide => slide.tags.forEach((tag, k) => { if (k) changes.push({ pos: tag.pos, node: tag.node, attrs: null }); else firsts.push(tag); }));
    const holders = (keyOf) => {
      const found = new Map();
      firsts.forEach(({ node, pos }) => {
        const key = keyOf(node.attrs);
        if (!key) return;
        if (!found.has(key)) found.set(key, []);
        found.get(key).push(pos);
      });
      return found;
    };
    const byId = holders(attrs => attrs.slideId);
    const byLink = holders(attrs => (hasLink(attrs) ? tagKey(attrs) : null));
    const keeper = (found, places, key) => {
      const list = found.get(key);
      return list.find(pos => pos === places.get(key)) ?? list[0];
    };
    firsts.forEach(({ node, pos }) => {
      const attrs = Object.assign({}, node.attrs);
      if (attrs.slideId && keeper(byId, placeById, attrs.slideId) !== pos) Object.assign(attrs, { slideId: null, slideLock: null });
      if (hasLink(attrs) && keeper(byLink, placeByLink, tagKey(attrs)) !== pos) Object.assign(attrs, { linkModel: null, linkKey: null, linkSlide: null, linkBase: null, linkMode: null });
      if (!attrs.slideId && !hasLink(attrs)) changes.push({ pos, node, attrs: null });
      else if (!ATTRS.every(name => attrs[name] === node.attrs[name])) changes.push({ pos, node, attrs });
    });
    // Les repères perdus avec le texte de leur diapositive (pas par ce module), quand rien n'a été supprimé en entier.
    const restored = [];
    if (!trs.some(t => t.getMeta(OWN_META)) && before.length === after.length) {
      const alive = new Set();
      after.forEach(slide => slide.tags.forEach(({ node }) => alive.add(tagKey(node.attrs))));
      before.forEach((slide, index) => {
        if (slide.tag && !alive.has(tagKey(slide.tag.node.attrs)) && !after[index].tags.length) restored.push({ pos: after[index].end, node: slide.tag.node });
      });
    }
    if (!changes.length && !restored.length) return null;
    const tr = state.tr.setMeta(OWN_META, 'tidy');
    changes.sort((a, b) => b.pos - a.pos).forEach(({ pos, node, attrs }) => {
      if (attrs) tr.setNodeMarkup(pos, undefined, attrs);
      else tr.delete(pos, pos + node.nodeSize);
    });
    restored.sort((a, b) => b.pos - a.pos).forEach(({ pos, node }) => tr.insert(tr.mapping.map(pos), node));
    return tr;
  }

  // Un collage ne lie jamais : les repères qu'il porte (une diapositive copiée, du texte copié avec le sien) restent dehors.
  function withoutTags(slice) {
    let found = false;
    slice.content.descendants((node) => { if (isTag(node)) found = true; return !found; });
    if (!found) return slice;
    const Fragment = slice.content.constructor;
    const Slice = slice.constructor;
    const clean = (fragment) => {
      const kept = [];
      fragment.forEach((node) => { if (!isTag(node)) kept.push(node.isLeaf ? node : node.copy(clean(node.content))); });
      return Fragment.fromArray(kept);
    };
    return new Slice(clean(slice.content), slice.openStart, slice.openEnd);
  }

  function createExtension(Extension, deps) {
    const { Plugin, PluginKey } = deps;
    return Extension.create({
      name: 'slideLinks',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('slideLinks'),
          filterTransaction(tr, state) { return !refuses(tr, state); },
          appendTransaction(trs, oldState, newState) { return tidy(trs, oldState, newState); },
          props: { transformPasted: slice => withoutTags(slice) },
        })];
      },
    });
  }

  return {
    NODE, CLASS, ATTRS, MODES, configure, wire, attrsOfEl, domAttrs, strip, forOutput, createExtension, isSyncTransaction, follow, hasPending, prepareSend, noteKnown, adopt,
    infoAt, infoList, markSync, blockedReason, setMode, detach, versionsAt, resolve, anchorSource, tagImported, linkedFrom, slideIdsOf, hashOf, liveChannels, liveHashes, liveOut, liveIn,
    wantsRepublish: () => republish.size > 0,
    // Ce que js/slide-copies.js (la copie en texte d'une diapositive, dans un document) emprunte au module : la lecture d'une présentation et de ses diapositives, leurs empreintes, ce qui passe
    // d'un texte à l'autre. Une fonction, pour que `libs` soit lu à l'usage (il est posé à la création de l'éditeur).
    kit: () => ({ libs, slidesOf, parseModel, slideHash, hashOfNodes, portable, replaceSpan, makeBase, parseBase, hasLink, isTag, OWN_META, TYPE, NODE, CLASS, blockedReason, attrsOfEl }),
  };
})();
