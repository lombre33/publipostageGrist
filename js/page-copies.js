// Les diapositives d'une page de document, qui restent liées à elle (demande du 22/10, lot 3 : « importer […] des pages de document dans des slides » ; cartes « Sens unique : la copie suit la source » et
// « Celle d'arrivée, avec une case »). Le volet « Importer » d'une présentation, avec un document pour source et la case « Garder liée » cochée, pose la page en diapositives qui la suivent. Le socle garde ici ce
// qui doit tenir même sans le code de l'extension « diapositives » : le repère, la synchro, le verrou et ce que les sorties en voient. Le volet qui pose les diapositives est dans extensions/diapositives/slide-import.js,
// leurs pastilles et leur menu dans slide-strip.js.
//  - Une PAGE est ce qui sépare deux sauts de page de premier niveau d'un document (SlideLinks.kit : slidesOf), et se retrouve par son numéro : le repère de la page (js/slide-links.js, nœud `slideLink` et son
//    `data-slide-id`, tiré au hasard à la pose du premier lien), un bloc vide de hauteur nulle posé dans le document source. Il finit sa page, juste avant le saut qui la ferme ; celui de la dernière page la commence
//    (un document ne finit pas sur un repère : l'éditeur rangerait un paragraphe vide dessous). Rien d'autre ne change dans le document : le repère s'ajoute au HTML enregistré (anchorPage), sans que le texte passe
//    par l'éditeur.
//  - Les DIAPOSITIVES d'une page portent chacune un repère à leur fin, avec le lien `data-link-page` : « modèle:jeton:page:rang:empreinte:mise en forme » (le numéro du document et son jeton, comme pour un tableau lié,
//    le numéro du repère de la page, le rang de la diapositive parmi celles de la page, l'empreinte de la page à la dernière synchro et si la mise en forme du document est gardée). C'est un lien à part de celui d'une
//    diapositive liée à une autre : rien du suivi, de l'envoi ni de la fenêtre « Demander » de js/slide-links.js ne le voit. Une page longue en fait plusieurs, que le lien groupe : toutes celles de la même page.
//  - La SYNCHRO (follow) : à l'ouverture de la présentation et à chaque lecture de l'enregistrement automatique, un groupe dont la page a changé depuis la dernière synchro la reprend, en une transaction hors de
//    l'historique qui ne rend pas la présentation « à enregistrer » (SlideLinks.isSyncTransaction). Autant de diapositives qu'avant : chacune garde sa place et ses propriétés (transition, fond, notes) et ne change que
//    ce qui diffère ; plus ou moins, ou des diapositives déplacées ou supprimées : le groupe se refait à la place de la première, les autres s'en vont. La page ne s'écrit jamais dans l'autre sens. Suivi des
//    modifications, écriture en direct, en-tête ou pied en cours : rien ne se synchronise.
//  - Le VERROU (createExtension) : le texte d'une diapositive du groupe ne s'écrit pas ici tant que son document existe ; la frappe, le collage et les commandes qui le changeraient sont refusés, et le coin d'état dit
//    pourquoi. Ses propriétés (transition, fond, notes) se règlent toujours, et la déplacer, la dupliquer (la copie arrive sans lien) ou la supprimer reste possible. « Détacher » (le menu ⋯ de sa miniature) libère
//    tout le groupe. Un lien dont le document ou la page n'existe plus laisse les diapositives en l'état.
//  - Dans le DOCUMENT SOURCE, le repère d'une page ne doit pas gêner l'écriture : Retour arrière et Suppr contre lui font comme s'il n'était pas là (il se retrouve juste après le bloc que la touche a travaillé), et
//    une transaction qui n'ôterait que lui est refusée (personne ne le voit).
//  - Les SORTIES : la Lecture, le PDF, le Word, les e-mails et les lots ne voient jamais les repères (js/slide-links.js : strip, js/slide-copies.js : forOutput). Celles d'une présentation fermée montrent ses diapositives
//    d'avant tant que la présentation n'a pas été ouverte : les mesurer demande la page de la présentation à l'écran.
// Les empreintes, la lecture des modèles et le remplacement d'un morceau de texte sont ceux de js/slide-links.js (SlideLinks.kit).
const PageCopies = (function () {
  const SOURCE_TYPE = 'document';
  const PROPS_NODE = 'slideProps';
  const LOCK_NOTICE_MS = 2500;

  const kit = () => SlideLinks.kit();
  const say = (key, vars, isError) => SlidesEntry.status(I18n.t(key, vars), !!isError);
  const emptyAttrs = () => Object.fromEntries(SlideLinks.ATTRS.map(name => [name, null]));
  const isProps = node => node.type.name === PROPS_NODE;

  // ---- Le lien d'une diapositive ----------------------------------------------------------------------------------------------------------------------

  // Le lien lu : { model, key, page, part, src, keep } (`page` : le numéro du repère de la page ; `part` : le rang de la diapositive parmi celles de la page ; `src` : l'empreinte de la page à la dernière synchro ;
  // `keep` : la mise en forme du document gardée), ou null quand le texte n'en est pas un.
  function parse(value) {
    if (!kit().pageOf(value)) return null;
    const [model, key, page, part, src, keep] = value.split(':');
    return { model: Number(model), key, page, part: Number(part), src, keep: keep === '1' };
  }
  const write = info => [info.model, info.key, info.page, info.part, info.src, info.keep ? 1 : 0].join(':');
  const groupId = info => info.model + ':' + info.page;
  const memberKey = info => groupId(info) + ':' + info.part;

  // Le document d'où vient la page de ce lien, s'il existe et que son jeton est celui du lien ; null sinon (supprimé, ou un lien venu d'un autre document).
  function sourceOf(info) {
    const model = Templates.byId(info.model);
    return model && (model.typeModele || SOURCE_TYPE) === SOURCE_TYPE && model.jeton === info.key ? model : null;
  }

  // ---- Les pages d'un document et leurs empreintes ------------------------------------------------------------------------------------------------

  // Le rang de la page qui porte chaque repère d'un document lu (SlideLinks.kit : parseModel). Une page peut en porter plusieurs (deux pages réunies par la suppression de leur saut).
  const idsCache = new WeakMap();
  function idsOf(parsed) {
    let ids = idsCache.get(parsed);
    if (!ids) {
      ids = new Map();
      parsed.slides.forEach((page, index) => page.tags.forEach(({ node }) => { if (node.attrs.slideId && !ids.has(node.attrs.slideId)) ids.set(node.attrs.slideId, index); }));
      idsCache.set(parsed, ids);
    }
    return ids;
  }
  const pageIdOf = (page) => { const tag = page.tags.find(({ node }) => node.attrs.slideId); return tag ? tag.node.attrs.slideId : null; };

  // L'empreinte d'une page : ses blocs sans les paragraphes vides qui la finissent (l'éditeur en range un sous un dernier bloc qui n'est pas un paragraphe : ils ne font pas deux versions).
  const isBlank = node => node.type.name === 'paragraph' && node.content.size === 0;
  const pageHashes = new WeakMap();
  function pageHash(page) {
    let hash = pageHashes.get(page);
    if (hash === undefined) {
      const nodes = page.nodes.map(entry => entry.node);
      let end = nodes.length;
      while (end > 0 && isBlank(nodes[end - 1])) end--;
      hash = kit().hashOfNodes(nodes.slice(0, end));
      pageHashes.set(page, hash);
    }
    return hash;
  }
  // L'empreinte du texte d'une diapositive du groupe : sans ses propriétés (transition, fond, notes), que la personne règle toujours, ni son repère.
  const contentHash = slide => kit().hashOfNodes(slide.nodes.map(entry => entry.node).filter(node => !isProps(node)));

  // ---- Les groupes d'une présentation ---------------------------------------------------------------------------------------------------------------

  // Les groupes du texte `doc` (un nœud de document ProseMirror) : les diapositives dont le repère porte le lien d'une même page, dans l'ordre. { id, model, key, page, members: [{ index, slide, tag, info,
  // key }] } (`index` : son rang dans le texte ; `key` : sa page et son rang dans cette page). Lus une fois par texte.
  const groupsCache = new WeakMap();
  function groupsOf(doc) {
    const kept = groupsCache.get(doc);
    if (kept) return kept;
    const byId = new Map();
    kit().slidesOf(doc).forEach((slide, index) => {
      const info = slide.tag ? parse(slide.tag.node.attrs.linkPage) : null;
      if (!info) return;
      const id = groupId(info);
      if (!byId.has(id)) byId.set(id, { id, model: info.model, key: info.key, page: info.page, members: [] });
      byId.get(id).members.push({ index, slide, tag: slide.tag, info, key: memberKey(info) });
    });
    const groups = Array.from(byId.values());
    groupsCache.set(doc, groups);
    return groups;
  }

  // ---- Ce qu'il y a à faire d'un groupe ---------------------------------------------------------------------------------------------------------------

  // { action, model, page, srcHash, at } pour le groupe `group` : 'missing' (le document n'existe plus, ou plus cette page : les diapositives restent en l'état), 'none' (la page est celle de la dernière synchro),
  // 'pull' (elle a changé : le groupe la reprend). `page` : la page lue (SlideLinks.kit : slidesOf), `at` : son rang dans le document.
  function planOf(editor, group) {
    const model = sourceOf(group.members[0].info);
    if (!model) return { action: 'missing', model: null };
    const parsed = kit().parseModel(editor, model);
    const at = idsOf(parsed).get(group.page);
    if (at === undefined) return { action: 'missing', model };
    const page = parsed.slides[at];
    const srcHash = pageHash(page);
    return { action: group.members.some(member => member.info.src !== srcHash) ? 'pull' : 'none', model, page, srcHash, at };
  }

  // La page `page` (SlideLinks.kit : slidesOf) en diapositives : ses blocs tels qu'ils passent d'un texte à l'autre, la conversion de extensions/diapositives/page-slides.js (les tailles d'une diapositive, une
  // page longue coupée entre deux blocs), puis la lecture de l'éditeur. Rend, pour chaque diapositive, la liste de ses blocs (une liste de listes), une diapositive au moins (une page vide arrive en un paragraphe vide).
  function convertPage(editor, page, keepFormat) {
    const { portable, libs } = kit();
    const nodes = portable(editor, page.nodes.map(entry => entry.node));
    const result = PageSlides.fromPage(HtmlSanitize.parseInert(Editor.getHTML(editor.schema.topNodeType.create(null, nodes))), { keepFormat });
    const slides = [[]];
    if (!result.blank) {
      libs.PMDOMParser.fromSchema(editor.schema).parse(HtmlSanitize.parseInert(result.html)).forEach((node) => {
        if (node.type.name === 'pageBreak') slides.push([]); else slides[slides.length - 1].push(node);
      });
    }
    const found = slides.filter(blocks => blocks.length);
    return found.length ? found : [[editor.schema.nodes.paragraph.create()]];
  }

  // Les blocs d'une diapositive du groupe : ceux de la page, ses propriétés quand la diapositive d'ici (`member`) en a, et son repère, avec le lien `info`.
  function nodesFor(editor, member, blocks, info) {
    const attrs = Object.assign(emptyAttrs(), member ? member.tag.node.attrs : {}, { linkPage: write(info) });
    const props = member ? member.slide.nodes.map(entry => entry.node).filter(isProps) : [];
    return [...props, ...blocks, editor.schema.nodes[kit().NODE].create(attrs)];
  }

  // Ce que le groupe `group` devient avec la page `plan.page` : { replaces: [{ from, to, nodes }], removed: [rangs] }. Autant de diapositives qu'avant, chacune à sa place : chacune prend les blocs de son rang
  // (seul ce qui diffère change, le curseur d'ailleurs reste où il est). Sinon la première prend toutes les diapositives de la page, et les autres s'en vont.
  function pullOf(editor, group, plan) {
    const first = group.members[0];
    const keep = first.info.keep;
    const slides = convertPage(editor, plan.page, keep);
    const info = part => ({ model: first.info.model, key: first.info.key, page: group.page, part, src: plan.srcHash, keep });
    const parts = new Set(group.members.map(member => member.info.part));
    if (group.members.length === slides.length && parts.size === slides.length && group.members.every(member => member.info.part < slides.length)) {
      return { replaces: group.members.map(member => ({ from: member.slide.start, to: member.slide.end, nodes: nodesFor(editor, member, slides[member.info.part], info(member.info.part)) })), removed: [] };
    }
    const run = [];
    slides.forEach((blocks, part) => {
      if (part) run.push(editor.schema.nodes.pageBreak.create());
      run.push(...nodesFor(editor, part ? null : first, blocks, info(part)));
    });
    return { replaces: [{ from: first.slide.start, to: first.slide.end, nodes: run }], removed: group.members.slice(1).map(member => member.index) };
  }

  // Pourquoi rien ne se synchronise maintenant : pas de présentation à l'écran, pas d'éditeur, suivi des modifications, écriture en direct, en-tête ou pied en cours, saisie en cours.
  function paused(editor) {
    if (!kit().libs || !editor || editor.isDestroyed || !SlidesEntry.presentationShown()) return true;
    if (Editor.isTrackChangesOn() || LiveEntry.isLive() || HeaderFooterPreview.getHfMode()) return true;
    return !!(editor.view && editor.view.composing);
  }

  // La conversion d'une page est dans l'extension « diapositives », qui peut ne pas être chargée encore (la présentation vient de s'ouvrir) : la synchro attend qu'elle le soit, une seule fois.
  let loading = null;
  function afterExtension(editor) {
    if (loading || !SlidesEntry.isAvailable()) return;
    loading = Extensions.ensure(SlidesEntry.ID).then(() => {
      loading = null;
      if (typeof PageSlides !== 'undefined' && EditorCore.getEditor() === editor) follow(editor);
    }).catch(() => { loading = null; });
  }

  // Les groupes de la présentation ouverte reprennent leur page, d'après les modèles du cache (relus par le passage de l'enregistrement automatique, ou à l'instant par la page) : à l'ouverture et à chaque
  // lecture. Une seule transaction, hors de l'historique (Annuler ne rend pas ce que personne n'a fait), qui ne rend pas la présentation « à enregistrer ». Rend { pulled: [numéros de groupe], name }, ou null
  // quand la synchro n'a pas lieu ou qu'il n'y a pas de groupe.
  const goneSeen = new WeakMap();
  function follow(editor) {
    if (paused(editor)) return null;
    const groups = groupsOf(editor.state.doc);
    if (!groups.length) return null;
    const plans = groups.map(group => ({ group, plan: planOf(editor, group) }));
    // Une page qui disparaît (ou revient) ne change pas le texte : les pastilles de la bande le disent quand même.
    const lost = plans.filter(entry => entry.plan.action === 'missing').map(entry => entry.group.id).join(',');
    if (lost !== (goneSeen.get(editor) || '')) { goneSeen.set(editor, lost); kit().changed(); }
    const stale = plans.filter(entry => entry.plan.action === 'pull');
    const done = { pulled: [], name: '' };
    if (!stale.length) return done;
    if (typeof PageSlides === 'undefined') { afterExtension(editor); return done; }
    const { state } = editor;
    const all = kit().slidesOf(state.doc);
    const replaces = [];
    const removed = new Set();
    stale.forEach(({ group, plan }) => {
      const pull = pullOf(editor, group, plan);
      replaces.push(...pull.replaces);
      pull.removed.forEach(index => removed.add(index));
      done.pulled.push(group.id);
      done.name = plan.model.nom;
    });
    // Les diapositives qui s'en vont, par suites : le saut de page qui suit la suite part avec elle (celui qui la précède, pour la dernière).
    const deletes = [];
    const gone = Array.from(removed).sort((a, b) => a - b);
    for (let i = 0; i < gone.length;) {
      let j = i;
      while (j + 1 < gone.length && gone[j + 1] === gone[j] + 1) j++;
      if (gone[j] < all.length - 1) deletes.push({ from: all[gone[i]].start, to: all[gone[j] + 1].start });
      else if (gone[i] > 0) deletes.push({ from: all[gone[i] - 1].end, to: all[gone[j]].end });
      i = j + 1;
    }
    // Du dernier au premier : remplacer ou ôter une suite ne déplace pas ce qui la précède.
    const tr = state.tr;
    [...replaces, ...deletes].sort((a, b) => b.from - a.from).forEach(op => (op.nodes ? kit().replaceSpan(tr, op.from, op.to, op.nodes) : tr.delete(op.from, op.to)));
    if (!tr.steps.length) return done;
    editor.view.dispatch(SlideLinks.markSync(tr));
    kit().changed();
    if (done.pulled.length === 1) say('slides.pagecopy.pulled', { name: done.name });
    else say('slides.pagecopy.pulledMany', { n: done.pulled.length });
    return done;
  }

  // ---- Poser les diapositives d'une page -----------------------------------------------------------------------------------------------------------

  // Le HTML d'un document avec le repère de sa page de rang `at` (sur `count` pages) : un élément de premier niveau de plus, rien d'autre ne change. Il finit sa page, juste avant le saut qui la ferme ; celui de la
  // dernière page la commence (le document ne finit pas sur un repère).
  function withMarker(html, at, count, id) {
    const { domAttrs } = kit();
    const body = HtmlSanitize.parseInert(html);
    const marker = body.ownerDocument.createElement('div');
    const attrs = domAttrs(Object.assign(emptyAttrs(), { slideId: id }));
    Object.keys(attrs).forEach(name => marker.setAttribute(name, attrs[name]));
    const breaks = Array.from(body.childNodes).filter(node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('page-break-marker'));
    if (at < count - 1) body.insertBefore(marker, breaks[at] || null);
    else if (breaks.length) breaks[breaks.length - 1].after(marker);
    else body.insertBefore(marker, body.firstChild);
    return body.innerHTML;
  }

  // L'import lié (la case « Garder liée » du volet Importer, avec un document pour source) : la page de rang `index` du document `id`, telle que la personne l'a vue (`seen` : le texte de la source qu'avait le
  // cache), reçoit son repère quand elle n'en a pas encore, écrit tout de suite dans le document (son texte seul, Templates.saveContent ; relu juste avant : un repère posé sur un cache en retard écraserait ce que
  // le document a changé depuis). Rien d'autre ne change dans le document : le HTML enregistré reçoit un élément de plus, relu avant d'être écrit pour que la page ne soit pas autre. Rend { link } : le lien du
  // repère des diapositives (sans mise en forme : le volet la dit) ; lève une Error dont `reason` est la clé de la raison (le document supprimé, ou changé depuis que la personne l'a vu).
  async function anchorPage(editor, id, index, seen) {
    const fail = (reason) => { const error = new Error(reason); error.reason = reason; throw error; };
    const { libs, parseHtml, blockedReason, newSlideId } = kit();
    if (!libs || !editor) fail('slides.link.failed');
    const blocked = blockedReason();
    if (blocked) fail(blocked);
    const wanted = parseHtml(editor, seen).slides[index];
    if (!wanted) fail('slides.link.changed');
    const wantedHash = pageHash(wanted);
    await Templates.loadAll();
    const model = Templates.byId(id);
    if (!model || (model.typeModele || SOURCE_TYPE) !== SOURCE_TYPE) fail('slides.link.gone');
    const key = model.jeton || await Templates.ensureToken(model.id);
    if (!key) fail('slides.link.failed');
    const parsed = parseHtml(editor, model.contenu);
    const at = parsed.slides[index] && pageHash(parsed.slides[index]) === wantedHash ? index : parsed.slides.findIndex(page => pageHash(page) === wantedHash);
    if (at < 0) fail('slides.link.changed');
    let page = pageIdOf(parsed.slides[at]);
    if (!page) {
      page = newSlideId();
      const html = withMarker(String(model.contenu || ''), at, parsed.slides.length, page);
      const check = parseHtml(editor, html);
      if (check.slides.length !== parsed.slides.length || pageHash(check.slides[at]) !== wantedHash || pageIdOf(check.slides[at]) !== page) fail('slides.link.failed');
      await Templates.saveContent(model.id, html);
    }
    return { link: { linkModel: model.id, linkKey: key, linkPage: page, srcHash: wantedHash, name: model.nom } };
  }

  // Juste après le collage de l'import lié, dans le même pas d'annulation : les `count` diapositives collées, à partir de celle de rang `first`, reçoivent leur repère et leur lien (`link` : celui d'anchorPage et
  // `keep`, la mise en forme du document gardée), chacune son rang.
  function tagImported(editor, first, count, link) {
    const { NODE, slidesOf } = kit();
    const slides = slidesOf(editor.state.doc);
    const tr = editor.state.tr;
    let tagged = 0;
    for (let k = count - 1; k >= 0; k--) {
      const slide = slides[first + k];
      if (!slide) continue;
      const info = { model: link.linkModel, key: link.linkKey, page: link.linkPage, part: k, src: link.srcHash, keep: !!link.keep };
      const tag = editor.schema.nodes[NODE].create(Object.assign(emptyAttrs(), slide.tag ? slide.tag.node.attrs : {}, { linkPage: write(info) }));
      if (slide.tag) tr.replaceWith(slide.tag.pos, slide.tag.pos + slide.tag.node.nodeSize, tag); else tr.insert(slide.end, tag);
      tagged++;
    }
    if (!tagged) return false;
    // Rangée dans l'événement d'historique du collage (le contrat de prosemirror-history, comme SlideLinks.tagImported) : un Ctrl+Z défait l'import lié en entier.
    editor.view.dispatch(tr.setMeta(kit().OWN_META, 'link').setMeta('appendedTransaction', tr));
    kit().changed();
    return true;
  }

  // Les pages du document `id` dont cette présentation porte déjà des diapositives liées (un lien par page et par présentation).
  function linkedFrom(editor, id) {
    const found = new Set();
    if (editor && !editor.isDestroyed) groupsOf(editor.state.doc).forEach((group) => { if (String(group.model) === String(id)) found.add(group.page); });
    return found;
  }

  // ---- Ce que l'interface en dit ------------------------------------------------------------------------------------------------------------------------

  // Ce que l'interface dit de la diapositive `slide` (SlideLinks.kit : slidesOf) du texte de l'éditeur, quand elle suit une page : { kind: 'page', mode: 'pull', name, n, missing, locked } (`name` : le document,
  // '' quand il n'existe plus ; `n` : le rang de la page, 0 quand elle n'existe plus ; `missing` : le document ou la page n'existe plus ; `locked` : le texte ne s'écrit pas ici).
  function infoOf(editor, slide) {
    const info = slide.tag ? parse(slide.tag.node.attrs.linkPage) : null;
    if (!info) return null;
    const group = groupsOf(editor.state.doc).find(candidate => candidate.id === groupId(info));
    const plan = group ? planOf(editor, group) : { action: 'missing', model: null };
    return { kind: 'page', mode: 'pull', name: plan.model ? plan.model.nom : '', n: plan.action === 'missing' ? 0 : plan.at + 1, missing: plan.action === 'missing', locked: !!plan.model, differs: false };
  }

  // « Détacher » : les diapositives de la page de la diapositive `index` gardent ce qu'elles montrent et ne la suivent plus (leur lien part, leur repère avec quand il ne porte rien d'autre), et s'écrivent de
  // nouveau. Un seul Annuler. Rend { slides, name } (combien en sont libérées, de quel document), ou faux sans rien changer (sous le suivi des modifications ou l'écriture en direct, ou si la diapositive ne suit rien).
  function detach(editor, index) {
    if (!editor || editor.isDestroyed || !editor.isEditable) return false;
    const blocked = kit().blockedReason();
    if (blocked) { say(blocked, null, true); return false; }
    const slide = kit().slidesOf(editor.state.doc)[index];
    const info = slide && slide.tag ? parse(slide.tag.node.attrs.linkPage) : null;
    const group = info && groupsOf(editor.state.doc).find(candidate => candidate.id === groupId(info));
    if (!group) return false;
    const tr = editor.state.tr;
    const { hasLink } = kit();
    group.members.slice().reverse().forEach(({ tag }) => {
      const attrs = Object.assign({}, tag.node.attrs, { linkPage: null });
      if (attrs.slideId || hasLink(attrs)) tr.setNodeMarkup(tag.pos, undefined, attrs); else tr.delete(tag.pos, tag.pos + tag.node.nodeSize);
    });
    editor.view.dispatch(tr.setMeta(kit().OWN_META, 'detach'));
    kit().changed();
    const model = sourceOf(group.members[0].info);
    return { slides: group.members.length, name: model ? model.nom : '' };
  }

  // ---- Le verrou ----------------------------------------------------------------------------------------------------------------------------------------

  // Les diapositives que le verrou protège dans le texte `doc` : celles dont le document existe. { member, key, hash }.
  function lockedOf(doc) {
    const out = [];
    groupsOf(doc).forEach((group) => {
      if (sourceOf(group.members[0].info)) group.members.forEach(member => out.push({ member, key: member.key, hash: contentHash(member.slide) }));
    });
    return out;
  }

  // Une transaction de la personne (frappe, collage, commande, geste de la bande) qui changerait le texte d'une diapositive du groupe est refusée ; la ligne d'état dit pourquoi, une fois de temps en temps. Passent :
  // ce module, un chargement, Annuler et Rétablir, ce que la page pose d'elle-même (hors de l'historique, ou rangé derrière une autre transaction : les images en calque qui suivent leur page), l'écriture en
  // direct d'une autre personne, ses propriétés (transition, fond, notes), et un geste qui emporte toute la diapositive (la déplacer, la supprimer) ; un repère ôté seul, non.
  let lockSaidAt = 0;
  function refuses(tr, state) {
    if (!tr.docChanged || !SlidesEntry.presentationShown() || HeaderFooterPreview.getHfMode()) return false;
    if (tr.getMeta(kit().OWN_META) || tr.getMeta('history$') || tr.getMeta('preventUpdate') || tr.getMeta('addToHistory') === false || tr.getMeta('appendedTransaction') || LiveEntry.isRemote(tr)) return false;
    const locked = lockedOf(state.doc);
    if (!locked.length) return false;
    const after = new Map();
    groupsOf(tr.doc).forEach(group => group.members.forEach(member => after.set(member.key, member)));
    let kept = null;
    const hit = locked.find(({ member, key, hash }) => {
      const now = after.get(key);
      if (!now) {
        // Le repère n'y est plus : la diapositive est partie en entier (rien de son texte ne reste), ou il en reste du texte sans lien.
        if (!kept) { kept = new Set(); tr.doc.forEach(node => kept.add(node)); }
        return member.slide.nodes.some(entry => !isProps(entry.node) && kept.has(entry.node));
      }
      return contentHash(now.slide) !== hash;
    });
    if (!hit) return false;
    if (Date.now() - lockSaidAt > LOCK_NOTICE_MS) {
      lockSaidAt = Date.now();
      say('slides.pagecopy.locked', { name: sourceOf(hit.member.info).nom }, true);
    }
    return true;
  }

  // ---- Le repère de la page, dans le document source ----------------------------------------------------------------------------------------

  // Un repère de page d'un document : un repère qui ne dit que le numéro de sa page (ni lien, ni copie en texte).
  function isPageMarker(node) {
    const { isTag, hasLink } = kit();
    return isTag(node) && !!node.attrs.slideId && !node.attrs.linkSpan && !node.attrs.linkPage && !hasLink(node.attrs);
  }
  // Une transaction qui n'ôterait d'un document que des repères de page, sans toucher à rien d'autre (une touche contre un repère que personne ne voit), est refusée : la page y perdrait son numéro et les
  // diapositives qui la suivent, leur source. Une sélection qui emporte du texte avec eux passe.
  function sparesMarkers(tr, state) {
    if (!tr.docChanged || SlidesEntry.presentationShown() || HeaderFooterPreview.getHfMode() || GridEditor.isActive()) return false;
    if (tr.getMeta('history$') || tr.getMeta('preventUpdate') || LiveEntry.isRemote(tr)) return false;
    const before = [];
    state.doc.forEach((node) => { if (isPageMarker(node)) before.push(node); });
    if (!before.length) return false;
    const after = new Set();
    tr.doc.forEach(node => after.add(node));
    if (before.every(node => after.has(node))) return false;
    const rest = (doc) => { const out = []; doc.forEach((node) => { if (!isPageMarker(node)) out.push(node); }); return out; };
    const was = rest(state.doc);
    const now = rest(tr.doc);
    return was.length === now.length && was.every((node, i) => node === now[i]);
  }

  // Retour arrière (`dir` -1) ou Suppr (1), le curseur au bord d'un bloc de premier niveau dont le voisin est le repère d'une page : la touche fait comme s'il n'était pas là (sans quoi elle l'emporterait, et
  // la page ne se joindrait plus à ce qui la précède ou la suit), et il revient juste après le bloc qu'elle a travaillé. Faux, la touche suit son cours, quand il n'y a pas de repère contre le curseur.
  function through(editor, dir) {
    if (!editor || editor.isDestroyed || SlidesEntry.presentationShown() || GridEditor.isActive() || HeaderFooterPreview.getHfMode()) return false;
    const { selection, doc } = editor.state;
    if (!selection.empty) return false;
    const $pos = selection.$head;
    if ($pos.depth < 1 || (dir < 0 ? $pos.parentOffset !== 0 : $pos.parentOffset !== $pos.parent.content.size)) return false;
    for (let d = 1; d < $pos.depth; d++) if ($pos.index(d) !== (dir < 0 ? 0 : $pos.node(d).childCount - 1)) return false;
    const neighbor = doc.maybeChild($pos.index(0) + dir);
    if (!neighbor || !isPageMarker(neighbor)) return false;
    const from = dir < 0 ? $pos.before(1) - neighbor.nodeSize : $pos.after(1);
    let moved = null;
    const attempt = ({ tr, state, commands }) => {
      const before = tr.doc;
      tr.delete(from, from + neighbor.nodeSize);
      // L'état que TipTap donne aux commandes de la chaîne garde le texte et la sélection d'avant : lire `tr` les rafraîchit, sans quoi la touche se calculerait avec le repère encore là.
      void state.tr;
      const steps = tr.steps.length;
      const done = dir < 0
        ? commands.first([() => commands.deleteSelection(), () => commands.joinBackward(), () => commands.selectNodeBackward()])
        : commands.first([() => commands.deleteSelection(), () => commands.joinForward(), () => commands.selectNodeForward()]);
      if (!done) return false;
      const $at = tr.doc.resolve(tr.mapping.slice(steps).map(from, -1));
      let where = $at.depth ? $at.after(1) : $at.pos;
      // Le texte ne finit pas sur un repère (l'éditeur rangerait un paragraphe vide dessous) : il se pose avant le dernier bloc.
      if (where >= tr.doc.content.size && tr.doc.childCount) where = tr.doc.content.size - tr.doc.lastChild.nodeSize;
      tr.insert(where, neighbor);
      // La touche n'a fait que déplacer la sélection (le saut de page contre le repère se sélectionne) : rien n'est écrit, ni dans l'historique ni vers « à enregistrer » ; la sélection se pose à part.
      moved = tr.doc.eq(before) ? tr.selection : null;
      if (moved) tr.setMeta('preventDispatch', true);
      return true;
    };
    // Rien que la touche puisse faire (le début du texte) : elle ne fait rien, plutôt que d'emporter le repère.
    if (!editor.can().chain().command(attempt).run()) return true;
    moved = null;
    const ran = editor.chain().command(attempt).run();
    if (ran && moved) {
      if (moved.node) editor.chain().setNodeSelection(moved.from).scrollIntoView().run();
      else editor.chain().setTextSelection({ from: moved.anchor, to: moved.head }).scrollIntoView().run();
    }
    return ran;
  }

  function createExtension(Extension, deps) {
    const { Plugin, PluginKey } = deps;
    return Extension.create({
      name: 'pageCopies',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('pageCopies'),
          filterTransaction(tr, state) { return !refuses(tr, state) && !sparesMarkers(tr, state); },
        })];
      },
      addKeyboardShortcuts() {
        return { Backspace: () => through(this.editor, -1), Delete: () => through(this.editor, 1) };
      },
    });
  }

  return { SOURCE_TYPE, createExtension, follow, anchorPage, tagImported, linkedFrom, infoOf, detach, groupsOf };
})();
