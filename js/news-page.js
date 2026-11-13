// La page des nouveautés (nouveautes.html, consigne 070 de GFS) : la fenêtre que la version 1 ouvre dans le widget (js/whats-new.js), ouverte seule sur sa page. Le bouton « Découvrir les nouveautés » du bandeau de
// la bêta figée la lance dans un nouvel onglet, dans la langue de son widget (?lang=fr ou ?lang=en : js/i18n.js). Un seul code pour la bêta et la version 1 : le carrousel, ses textes et ses images sont ceux du widget,
// rien n'en est recopié. Fermée, la fenêtre laisse la page, qui dit où elle en est et rouvre la fenêtre au clic.
// Cette page n'est pas le widget : pas de Grist, pas de GFS, et rien n'est retenu de la personne. `js/whats-new.js` écrit « 1.0 vue » (clé pp_news_seen) dans PersonStore quand la fenêtre se ferme ; ici PersonStore ne garde
// rien (ni lecture, ni écriture), si bien que fermer la fenêtre de cette page ne change pas ce que le widget fera à l'ouverture suivante. Le thème choisi dans le widget (Réglages > Thème) est seulement lu.
const PersonStore = Object.freeze({
  ready: Promise.resolve(),
  get: () => null,
  set: () => false,
  remove: () => false,
});

(function () {
  const t = (key, vars) => I18n.t(key, vars);
  const byId = id => document.getElementById(id);

  // Le thème du widget, s'il a été choisi (clair ou sombre) ; sinon celui du système (css/style.css). Lu seulement : cette page n'écrit rien dans le navigateur.
  try {
    const theme = localStorage.getItem('pp_theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* stockage refusé : le thème du système */ }

  document.title = t('news.page.title');
  byId('news-page-title').textContent = t('news.title', { version: WhatsNew.VERSION });
  byId('news-page-lead').textContent = t('news.page.lead');
  byId('news-page-done').textContent = t('news.page.done');
  const again = byId('news-page-again');
  again.textContent = t('news.open');
  again.addEventListener('click', () => WhatsNew.open());
  // Le focus part du bouton, et y revient à la fermeture de la fenêtre (js/modal-base.js rend le focus d'où la fenêtre est partie) : au clavier, Entrée la rouvre.
  again.focus();
  WhatsNew.open();
})();
