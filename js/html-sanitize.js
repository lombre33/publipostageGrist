// Assainissement minimal du HTML avant toute insertion DOM (contenu potentiellement modifié EN DEHORS de l'éditeur - colonne Grist éditée par un autre
// collaborateur, gabarit importé - cf. AUDIT_CODE.md §3.2/§8.2). Retire <script>/attributs on*/URLs javascript: via un DOMParser inerte (rien ne charge/s'exécute).
// Les liens (<a href>) ne gardent que http(s):, mailto: et tel: (safeLinkHref).
//
// Toute page qui charge js/reader-mode.js doit charger ce fichier avant.
const HtmlSanitize = (function () {
  // Les liens ne mènent qu'à une page web, une adresse e-mail ou un numéro (ce que la fenêtre « Lien » de l'éditeur sait écrire, js/link-dialog.js) : l'adresse d'un lien, ou null.
  // Les exports (PDF, Word, e-mail) s'en servent aussi pour savoir quel lien garder.
  function safeLinkHref(href) {
    const value = String(href || '').trim();
    return /^(?:https?:|mailto:|tel:)/i.test(value) ? value : null;
  }
  function clean(html) {
    if (!html) return html || '';
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    doc.querySelectorAll('script').forEach(el => el.remove());
    // Tout autre href d'un <a> (data:, vbscript:, adresse relative...) est retiré : le texte du lien reste, sans cible.
    doc.querySelectorAll('a[href]').forEach(a => {
      const safe = safeLinkHref(a.getAttribute('href'));
      if (safe) a.setAttribute('href', safe); else a.removeAttribute('href');
    });
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.indexOf('on') === 0) { el.removeAttribute(attr.name); return; }
        if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return doc.body.innerHTML;
  }
  return { clean, safeLinkHref };
})();
