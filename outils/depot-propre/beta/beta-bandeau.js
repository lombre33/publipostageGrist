// Le bandeau de la bêta figée (consigne 070 de Grist Factory Suite) : « Attention : widget en version bêta. Nous vous conseillons de migrer vers la version 1.2. » (le numéro est celui de la dernière
// version, posé à la publication : voir LATEST plus bas), un bouton « Découvrir les nouveautés » qui ouvre, dans un nouvel onglet, la page des nouveautés de la version 1 (nouveautes.html, à la racine
// du site, dans la langue du widget), et une croix qui le ferme.
//
// Ce fichier n'est pas de la bêta : la publication l'ajoute à beta/, avec sa feuille (css/beta-bandeau.css) et deux lignes de index.html (la feuille dans <head>, ce script
// après main.js). Tout le reste de beta/ est, octet pour octet, ce que porte l'étiquette v1.0.0-beta.1. Il ne demande à la bêta que sa langue (I18n.getLang, et I18n.onChange
// quand la personne la change dans Réglages) et se rabat sur celle de la page (<html lang>) si I18n n'est pas là. Rien n'est retenu : la croix ferme le bandeau jusqu'à la prochaine
// ouverture du widget, qui le remontre. La fenêtre des nouveautés ne s'ouvre jamais seule dans la bêta : seul le bouton mène à la version 1.
//
// La MÊME feuille et le MÊME script portent aussi la fenêtre « Il est temps de passer à la version 1.2 » (demande du porteur, 26/11), plus bas : à CHAQUE ouverture de la bêta, une carte sur un voile
// dit que la compatibilité avec les documents d'avant est assurée pour le moment (de moins en moins quand on attend), que la sécurité et l'entretien ne vont qu'à la dernière version, et donne l'adresse
// de cette version. Rien n'est retenu non plus : « Continuer avec la bêta » (ou Échap) la ferme jusqu'à la prochaine ouverture.
(function () {
  'use strict';
  if (document.getElementById('pp-beta-banner')) return;

  const NEWS_PAGE = '../nouveautes.html';
  // Le numéro de la dernière version : X.Y, sans le correctif (1.2 pour la 1.2.0 comme pour la 1.2.3). Ce fichier est un MODÈLE : le repère de la ligne suivante n'est pas un numéro, la publication
  // (outils/depot-propre/beta-bandeau.mjs) le remplace par celui de la version qui part, d'après son js/version.js, et controles.mjs refuse une bêta qui annonce un autre numéro. Il ne s'écrit jamais ici à la main.
  const LATEST = '{{VERSION_COURANTE}}';
  const TEXTS = {
    fr: { lead: 'Attention :', rest: ' widget en version bêta. Nous vous conseillons de migrer vers la version ' + LATEST + '.', news: 'Découvrir les nouveautés', newTab: 's’ouvre dans un nouvel onglet', close: 'Fermer le bandeau', region: 'Version bêta' },
    en: { lead: 'Attention:', rest: ' this widget is a beta version. We recommend migrating to version ' + LATEST + '.', news: 'Discover what’s new', newTab: 'opens in a new tab', close: 'Close the banner', region: 'Beta version' },
  };
  // La fenêtre « passez à la version X.Y » : les mots de la demande du porteur du 26/11 (il est temps de passer à la dernière version ; la rétrocompatibilité est assurée pour le moment, de moins en moins
  // plus on attend ; la sécurité et la maintenabilité), en mots de tous les jours, validés par lui le 26/11. Le numéro suit une espace insécable : il ne passe jamais seul à la ligne.
  const UPGRADE_TEXTS = {
    fr: {
      title: 'Il est temps de passer à la version ' + LATEST,
      compat: 'Vos documents et vos modèles s’ouvrent encore dans la version ' + LATEST + ' : cette compatibilité est assurée pour le moment. Plus vous attendez, moins elle le sera.',
      care: 'La bêta est figée : elle ne reçoit plus de correctifs de sécurité et devient de plus en plus difficile à maintenir. Seule la version ' + LATEST + ' reste à jour.',
      how: 'Dans Grist, remplacez l’adresse du widget par celle de la dernière version :',
      news: 'Découvrir les nouveautés', newTab: 's’ouvre dans un nouvel onglet', keep: 'Continuer avec la bêta',
    },
    en: {
      title: 'Time to move to version ' + LATEST,
      compat: 'Your documents and templates still open in version ' + LATEST + ': this compatibility is guaranteed for now. The longer you wait, the less it will be.',
      care: 'The beta is frozen: it no longer receives security fixes and is getting harder to maintain. Only version ' + LATEST + ' stays up to date.',
      how: 'In Grist, replace the widget address with the one of the latest version:',
      news: 'Discover what’s new', newTab: 'opens in a new tab', keep: 'Continue with the beta',
    },
  };

  function currentLang() {
    try {
      if (typeof I18n !== 'undefined' && typeof I18n.getLang === 'function') return I18n.getLang() === 'en' ? 'en' : 'fr';
    } catch (e) { /* I18n pas prêt : la langue de la page */ }
    return /^en/i.test(document.documentElement.lang || '') ? 'en' : 'fr';
  }

  // Une icône au trait (jamais d'emoji) : le dessin est écrit en nœuds SVG, la couleur est celle du texte qui l'entoure.
  function icon(className, shapes) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    shapes.forEach(([tag, attrs]) => {
      const shape = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(name => shape.setAttribute(name, attrs[name]));
      svg.appendChild(shape);
    });
    return svg;
  }

  const banner = document.createElement('div');
  banner.id = 'pp-beta-banner';
  banner.setAttribute('role', 'region');

  const info = icon('pp-beta-banner-icon', [['circle', { cx: '8', cy: '8', r: '6.5' }], ['path', { d: 'M8 7.4v3.4' }], ['path', { d: 'M8 5v.01' }]]);

  const text = document.createElement('p');
  text.className = 'pp-beta-banner-text';
  const lead = document.createElement('strong');
  const rest = document.createElement('span');
  text.appendChild(lead);
  text.appendChild(rest);

  const link = document.createElement('a');
  link.className = 'pp-beta-banner-link';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pp-beta-banner-close';
  close.appendChild(icon('pp-beta-banner-cross', [['path', { d: 'M4 4l8 8M12 4l-8 8' }]]));
  close.addEventListener('click', () => { banner.remove(); });

  banner.appendChild(info);
  banner.appendChild(text);
  banner.appendChild(link);
  banner.appendChild(close);

  function render() {
    const lang = currentLang();
    const t = TEXTS[lang];
    banner.setAttribute('aria-label', t.region);
    lead.textContent = t.lead;
    rest.textContent = t.rest;
    link.textContent = t.news;
    link.href = NEWS_PAGE + '?lang=' + lang;
    link.setAttribute('aria-label', t.news + ' (' + t.newTab + ')');
    close.setAttribute('aria-label', t.close);
  }

  // ---- La fenêtre « passez à la version X.Y » : un voile qui couvre la page (rien derrière ne reçoit la souris, Tab ne sort pas de la carte), la carte, l'adresse de la dernière version (celle du dossier
  // au-dessus de beta/, comme le garde-fou) et deux boutons. Elle s'ouvre à chaque chargement de la bêta et ne retient rien (ni stockage, ni cookie) : la fermer la rend à la prochaine ouverture.
  // Le garde-fou (js/beta-garde.js) passe avant : devant un document déjà mis à jour par la version 1 il dit déjà d'ouvrir la dernière version, sur une couche pleine page ; la fenêtre ne s'ouvre alors
  // pas, et s'il le dit pendant qu'elle est ouverte c'est lui qui la retire.
  let upgrade = null;
  function renderUpgrade() {
    if (!upgrade) return;
    const lang = currentLang();
    const t = UPGRADE_TEXTS[lang];
    const r = upgrade.refs;
    r.title.textContent = t.title;
    r.compat.textContent = t.compat;
    r.care.textContent = t.care;
    r.how.textContent = t.how;
    r.news.textContent = t.news;
    r.news.href = NEWS_PAGE + '?lang=' + lang;
    r.news.setAttribute('aria-label', t.news + ' (' + t.newTab + ')');
    r.keep.textContent = t.keep;
  }
  // `restoreFocus` faux quand le garde-fou la retire : le focus est alors à sa couche, pas à ce qu'il y avait avant la fenêtre, et c'est elle qui garde le reste de la page inerte (attribut `inert`) :
  // la fenêtre ne rend alors rien, elle ne rend que ce qu'elle a elle-même rendu inerte.
  function closeUpgrade(restoreFocus) {
    if (!upgrade) return;
    const { root, back, onKey, watcher, inerted } = upgrade;
    upgrade = null;
    document.removeEventListener('keydown', onKey, true);
    watcher.disconnect();
    root.remove();
    if (restoreFocus) inerted.forEach((node) => node.removeAttribute('inert'));
    try { if (restoreFocus && back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true }); } catch (e) { /* le focus reste où il est */ }
  }
  function showUpgrade() {
    if (upgrade || document.getElementById('pp-beta-upgrade') || document.getElementById('pp-beta-guard') || !document.body) return;
    const root = document.createElement('div');
    root.id = 'pp-beta-upgrade';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'pp-beta-upgrade-title');
    const card = document.createElement('div');
    card.className = 'pp-beta-upgrade-card';
    card.tabIndex = -1;
    const title = document.createElement('h2');
    title.className = 'pp-beta-upgrade-title';
    title.id = 'pp-beta-upgrade-title';
    const compat = document.createElement('p');
    compat.className = 'pp-beta-upgrade-text';
    const care = document.createElement('p');
    care.className = 'pp-beta-upgrade-text';
    const how = document.createElement('p');
    how.className = 'pp-beta-upgrade-text';
    const address = document.createElement('a');
    address.className = 'pp-beta-upgrade-address';
    address.target = '_blank';
    address.rel = 'noopener noreferrer';
    try { address.href = new URL('../', location.href).href; } catch (e) { address.href = '../'; }
    address.textContent = address.href;
    const actions = document.createElement('div');
    actions.className = 'pp-beta-upgrade-actions';
    const news = document.createElement('a');
    news.className = 'pp-beta-upgrade-news';
    news.target = '_blank';
    news.rel = 'noopener noreferrer';
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'pp-beta-upgrade-keep';
    keep.addEventListener('click', () => closeUpgrade(true));
    actions.appendChild(news);
    actions.appendChild(keep);
    [title, compat, care, how, address, actions].forEach(node => card.appendChild(node));
    root.appendChild(card);
    // Échap ferme ; Tab et Maj+Tab restent entre le lien des nouveautés, l'adresse et le bouton (rien de la bêta, derrière le voile, ne s'atteint au clavier).
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeUpgrade(true); return; }
      if (event.key !== 'Tab') return;
      const stops = [address, news, keep];
      const at = stops.indexOf(document.activeElement);
      const next = at === -1 ? (event.shiftKey ? stops.length - 1 : 0) : (at + (event.shiftKey ? stops.length - 1 : 1)) % stops.length;
      event.preventDefault();
      stops[next].focus();
    };
    // Derrière le voile, plus rien ne se lit ni ne s'atteint (ni à la souris, ni au clavier, ni à la voix) : `inert` sur le reste de la page, comme le garde-fou, y compris ce que la bêta y ajoute pendant que la fenêtre
    // est ouverte (ses propres fenêtres, ses bulles) ; on ne rend que ce qu'on a marqué.
    const inerted = Array.from(document.body.children).filter((node) => node.tagName !== 'SCRIPT' && !node.hasAttribute('inert'));
    inerted.forEach((node) => node.setAttribute('inert', ''));
    // Le garde-fou se déclenche après coup (il lit la liste des tables) : sa couche pleine page dit déjà d'ouvrir la dernière version, la fenêtre s'efface devant elle.
    const watcher = new MutationObserver((records) => {
      if (document.getElementById('pp-beta-guard')) { closeUpgrade(false); return; }
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node !== root && node.tagName !== 'SCRIPT' && !node.hasAttribute('inert')) { node.setAttribute('inert', ''); inerted.push(node); }
      }));
    });
    upgrade = { root, refs: { title, compat, care, how, news, keep }, back: document.activeElement, onKey, watcher, inerted };
    renderUpgrade();
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    watcher.observe(document.body, { childList: true });
    try { card.focus({ preventScroll: true }); } catch (e) { /* le focus reste où il était */ }
  }

  render();
  document.body.insertBefore(banner, document.body.firstChild);
  showUpgrade();
  try {
    if (typeof I18n !== 'undefined' && typeof I18n.onChange === 'function') I18n.onChange(() => { render(); renderUpgrade(); });
  } catch (e) { /* la langue suivra au prochain chargement */ }
})();
