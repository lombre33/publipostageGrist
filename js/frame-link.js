// LE LIEN d'un objet de diapositive (demande du 02/11, « Lien, puis aperçu animé d'affilée », second niveau : un bouton, une forme, une image de diapositive qui mène quelque part au clic, comme l'objet à lien
// de PowerPoint). Un cadre libre, une forme ou une ligne (js/free-frame.js) porte UN lien, dans `data-ff-link` ; le socle garde ici ce qui doit tenir sans l'extension « diapositives » : le réglage et son texte,
// ce que le diaporama (extensions/diapositives/slide-player.js, aussi dans sa fenêtre à part), la Lecture et l'éditeur en font. Rien ne se voit dans le document, le PDF ni le Word : un objet y est à sa place.
//  - Le LIEN : une adresse web, de courrier ou de téléphone (`https://…`, `mailto:…`, `tel:…`), un signet du document (`#slide-3`, js/anchors.js : une diapositive, un titre, un signet), ou une ACTION du diaporama
//    (`pp:next` la diapositive suivante, `pp:prev` la précédente, `pp:first` la première, `pp:last` la dernière, `pp:back` la dernière vue, `pp:end` la fin du diaporama). Tout autre texte (un `javascript:`,
//    une adresse relative, un signet mal écrit, une action inconnue) n'est pas un lien : `text` rend '' et le cadre n'en a pas. Le texte est relu à CHAQUE usage, jamais pris tel que le HTML l'a écrit.
//  - Au DIAPORAMA et à la LECTURE : un clic sur l'objet suit le lien (les liens du texte d'un objet passent avant) ; le pointeur y devient une main (css/free-frame.css). Dans l'ÉDITEUR, un objet qui a un lien
//    porte une petite chaîne dans son coin (une décoration, jamais dans le texte) et ne le suit pas : le clic y sélectionne l'objet, le lien s'essaie au diaporama.
//  - L'ANIMATION AU CLIC (demande du 02/11, « Lien, puis aperçu animé d'affilée », troisième niveau) : un lien qui mène à une diapositive (un signet, ou l'action suivante, précédente, première, dernière, dernière vue) peut
//    jouer l'effet que la personne a choisi au lieu de celui de la diapositive visée (`data-ff-link-trans="push r 700"` : l'effet, son côté, sa durée en ms ; `none` : aucun effet ; rien : celui de la diapositive visée).
//    Les effets, les côtés et les durées sont ceux de la transition d'une diapositive (js/slide-props.js, jouée par extensions/diapositives/slide-transitions.js) ; le texte est relu à chaque usage.
//  - Le HTML enregistré : `<div class="pp-free-frame" … data-ff-link="#slide-3">` ; un cadre sans lien s'écrit comme avant.
const FrameLink = (function () {
  const ATTR = 'data-ff-link';
  const TRANS_ATTR = 'data-ff-link-trans';
  const FRAME = '.pp-free-frame';
  const PREFIX = 'pp:';
  // Les actions du diaporama, dans l'ordre où la fenêtre « Lien… » les propose.
  const ACTIONS = ['next', 'prev', 'first', 'last', 'back', 'end'];
  const MAX = 2000;
  // Mêmes règles que HtmlSanitize.internalAnchorId et safeLinkHref (js/html-sanitize.js), recopiées : la fenêtre à part du diaporama ne charge pas ce fichier.
  const ANCHOR = /^#([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/;
  const WEB = /^(?:https?:|mailto:|tel:)\S+$/i;
  const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;

  // Le lien `raw` tel que l'éditeur sait le suivre, ou '' : aucun lien.
  function text(raw) {
    const value = typeof raw === 'string' ? raw.replace(CONTROLS, '').trim() : '';
    if (!value || value.length > MAX) return '';
    if (ANCHOR.test(value) || WEB.test(value)) return value;
    return value.indexOf(PREFIX) === 0 && ACTIONS.indexOf(value.slice(PREFIX.length)) !== -1 ? value : '';
  }
  // Ce que dit le lien : { kind: 'anchor', id } (un signet du document), { kind: 'action', action } ou { kind: 'url', url } ; null quand il n'y en a pas.
  function parse(raw) {
    const link = text(raw);
    if (!link) return null;
    if (link.charAt(0) === '#') return { kind: 'anchor', id: link.slice(1), link };
    if (link.indexOf(PREFIX) === 0) return { kind: 'action', action: link.slice(PREFIX.length), link };
    return { kind: 'url', url: link, link };
  }
  // Le lien `raw` mène-t-il à une diapositive, de sorte qu'un effet puisse l'accompagner ? Un signet (une diapositive, un titre : la page où il est) ou une action qui change de diapositive - pas une adresse, pas la fin du diaporama.
  const MOVES = ['next', 'prev', 'first', 'last', 'back'];
  function canAnimate(raw) {
    const found = parse(raw);
    return !!found && (found.kind === 'anchor' || (found.kind === 'action' && MOVES.indexOf(found.action) !== -1));
  }
  // L'animation `raw` d'un lien (`data-ff-link-trans`) telle que l'éditeur sait la jouer : '' (celle de la diapositive visée), 'none' (aucun effet) ou « effet côté durée » ("push r 700"), les valeurs ramenées à celles de
  // SlideProps.normalized (un effet inconnu : rien ; un côté ou une durée hors liste : le plus proche permis).
  function transText(raw) {
    const value = typeof raw === 'string' ? raw.replace(CONTROLS, ' ').trim().toLowerCase() : '';
    if (value === 'none') return 'none';
    const part = value.split(/\s+/);
    if (typeof SlideProps === 'undefined' || !SlideProps.KINDS || SlideProps.KINDS.indexOf(part[0]) === -1) return '';
    const a = SlideProps.normalized({ transition: part[0], from: part[1], dur: part[2] });
    return a.transition + ' ' + a.from + ' ' + a.dur;
  }
  // Ce que joue le diaporama : null (l'effet de la diapositive visée), { transition: '' } pour aucun effet, ou { transition, from, dur }.
  function transOf(raw) {
    const text = transText(raw);
    if (!text) return null;
    if (text === 'none') return { transition: '', from: 'r', dur: 0 };
    const part = text.split(' ');
    return { transition: part[0], from: part[1], dur: Number(part[2]) };
  }
  // Le lien qui fait l'action `name`, ou ''.
  const hrefOfAction = name => (ACTIONS.indexOf(name) !== -1 ? PREFIX + name : '');
  // L'action que dit le lien `raw` ('next'...), ou ''.
  const actionOf = (raw) => { const found = parse(raw); return found && found.kind === 'action' ? found.action : ''; };
  // L'adresse du signet que vise le lien `raw` (sans le dièse), ou ''.
  const anchorOf = (raw) => { const found = parse(raw); return found && found.kind === 'anchor' ? found.id : ''; };

  // L'objet à lien sous le point (x, y) de l'écran dans `root` (le document, ou l'arbre ombre du diaporama) : { el, link }, ou null. C'est l'objet le plus HAUT que le point touche qui décide, comme dans
  // PowerPoint : sans lien, un clic ne passe pas à celui qui est dessous ; le texte de la diapositive, lui, ne cache pas l'objet qu'il recouvre.
  function frameAt(root, x, y) {
    const stack = root && root.elementsFromPoint ? root.elementsFromPoint(x, y) : [];
    for (let i = 0; i < stack.length; i += 1) {
      const el = stack[i].closest ? stack[i].closest(FRAME) : null;
      if (!el) continue;
      const link = parse(el.getAttribute(ATTR));
      return link ? { el, link } : null;
    }
    return null;
  }

  // Ouvre une adresse déjà normalisée par un <a> synthétique cliqué, comme partout dans le widget (window.open se comporte moins bien dans l'iframe d'un widget Grist) ; faux quand ce n'est ni une adresse web,
  // ni un courrier, ni un téléphone. Une adresse web s'ouvre dans un nouvel onglet ; mailto: et tel: passent la main à l'application du système (dans le cadre isolé de GFS, eux aussi dans un nouvel onglet :
  // GfsLink.opensInNewTab, que la fenêtre à part du diaporama ne charge pas : elle n'est jamais dans ce cadre). Le lien du texte (js/link-dialog.js), l'objet à lien et le diaporama s'ouvrent donc du même geste.
  function openUrl(href) {
    if (!/^(?:https?|mailto|tel):/i.test(href || '')) return false;
    const a = document.createElement('a');
    a.href = href;
    if (/^https?:/i.test(href) || (typeof GfsLink !== 'undefined' && GfsLink.opensInNewTab(href))) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }

  // Le nom du lien `raw` pour une info-bulle : l'action (« Diapositive suivante »), le signet tel que la fenêtre « Lien… » le nomme (« 3. Les chiffres »), l'adresse ; « introuvable » quand le signet n'existe plus.
  function describe(ed, raw) {
    const found = parse(raw);
    if (!found) return '';
    if (found.kind === 'action') return I18n.t('hyperlink.action.' + found.action);
    if (found.kind === 'anchor') return Anchors.labelOf(ed, found.id) || I18n.t('hyperlink.tip.missingSlide');
    return found.url;
  }

  return { ATTR, TRANS_ATTR, PREFIX, ACTIONS, text, parse, hrefOfAction, actionOf, anchorOf, canAnimate, transText, transOf, frameAt, openUrl, describe };
})();
