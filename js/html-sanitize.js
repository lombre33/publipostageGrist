// Assainissement minimal du HTML avant toute insertion DOM (contenu potentiellement modifié EN DEHORS de l'éditeur - colonne Grist éditée par un autre
// collaborateur, gabarit importé - cf. AUDIT_CODE.md §3.2/§8.2). Retire <script>/attributs on*/URLs javascript: via un DOMParser inerte (rien ne charge/s'exécute).
//
// Toute page qui charge js/reader-mode.js doit charger ce fichier avant.
const HtmlSanitize = (function () {
  function clean(html) {
    if (!html) return html || '';
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    doc.querySelectorAll('script').forEach(el => el.remove());
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
  return { clean };
})();
