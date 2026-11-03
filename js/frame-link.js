// LE LIEN d'un objet de diapositive (demande du 02/11, « Lien, puis aperçu animé d'affilée », second niveau : un bouton, une forme, une image de diapositive qui mène quelque part au clic, comme l'objet à lien
// de PowerPoint). Un cadre libre, une forme ou une ligne (js/free-frame.js) porte UN lien, dans `data-ff-link` ; le socle garde ici ce qui doit tenir sans l'extension « diapositives » : le réglage et son texte,
// ce que le diaporama (extensions/diapositives/slide-player.js, aussi dans sa fenêtre à part), la Lecture et l'éditeur en font. Rien ne se voit dans le document, le PDF ni le Word : un objet y est à sa place.
//  - Le LIEN : une adresse web, de courrier ou de téléphone (`https://…`, `mailto:…`, `tel:…`), un signet du document (`#slide-3`, js/anchors.js : une diapositive, un titre, un signet), ou une ACTION du diaporama
//    (`pp:next` la diapositive suivante, `pp:prev` la précédente, `pp:first` la première, `pp:last` la dernière, `pp:back` la dernière vue, `pp:end` la fin du diaporama). Tout autre texte (un `javascript:`,
//    une adresse relative, un signet mal écrit, une action inconnue) n'est pas un lien : `text` rend '' et le cadre n'en a pas. Le texte est relu à CHAQUE usage, jamais pris tel que le HTML l'a écrit.
//  - Au DIAPORAMA et à la LECTURE : un clic sur l'objet suit le lien (les liens du texte d'un objet passent avant) ; le pointeur y devient une main (css/free-frame.css). Dans l'ÉDITEUR, un objet qui a un lien
//    porte une petite chaîne dans son coin (une décoration, jamais dans le texte) et ne le suit pas : le clic y sélectionne l'objet, le lien s'essaie au diaporama.
//  - Le HTML enregistré : `<div class="pp-free-frame" … data-ff-link="#slide-3">` ; un cadre sans lien s'écrit comme avant.
const FrameLink = (function () {
  const ATTR = 'data-ff-link';
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

  return { ATTR, PREFIX, ACTIONS, text, parse, hrefOfAction, actionOf, anchorOf, frameAt, openUrl, describe };
})();
