// Le bandeau de la bêta figée (consigne 070 de Grist Factory Suite) : « Attention : widget en version bêta. Nous vous conseillons de migrer vers la version 1.1. »,
// un bouton « Découvrir les nouveautés » qui ouvre, dans un nouvel onglet, la page des nouveautés de la version 1 (nouveautes.html, à la racine du site, dans la langue du widget),
// et une croix qui le ferme.
//
// Ce fichier n'est pas de la bêta : la publication l'ajoute à beta/, avec sa feuille (css/beta-bandeau.css) et deux lignes de index.html (la feuille dans <head>, ce script
// après main.js). Tout le reste de beta/ est, octet pour octet, ce que porte l'étiquette v1.0.0-beta.1. Il ne demande à la bêta que sa langue (I18n.getLang, et I18n.onChange
// quand la personne la change dans Réglages) et se rabat sur celle de la page (<html lang>) si I18n n'est pas là. Rien n'est retenu : la croix ferme le bandeau jusqu'à la prochaine
// ouverture du widget, qui le remontre. La fenêtre des nouveautés ne s'ouvre jamais seule dans la bêta : seul le bouton mène à la version 1.
(function () {
  'use strict';
  if (document.getElementById('pp-beta-banner')) return;

  const NEWS_PAGE = '../nouveautes.html';
  const TEXTS = {
    fr: { lead: 'Attention :', rest: ' widget en version bêta. Nous vous conseillons de migrer vers la version 1.1.', news: 'Découvrir les nouveautés', newTab: 's’ouvre dans un nouvel onglet', close: 'Fermer le bandeau', region: 'Version bêta' },
    en: { lead: 'Attention:', rest: ' this widget is a beta version. We recommend migrating to version 1.1.', news: 'Discover what’s new', newTab: 'opens in a new tab', close: 'Close the banner', region: 'Beta version' },
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

  render();
  document.body.insertBefore(banner, document.body.firstChild);
  try {
    if (typeof I18n !== 'undefined' && typeof I18n.onChange === 'function') I18n.onChange(render);
  } catch (e) { /* la langue suivra au prochain chargement */ }
})();
