// Assainissement minimal du HTML avant toute insertion DOM (innerHTML/
// outerHTML/document.write) d'un contenu qui peut avoir été modifié EN
// DEHORS de l'éditeur (colonne Grist Contenu/HeaderFooter éditée
// directement via l'UI/API Grist par un autre collaborateur du document,
// gabarit importé) - cf. AUDIT_CODE.md §3.2/§8.2. Retire les vecteurs
// d'exécution de script (balises <script>, attributs on*, URLs
// javascript:) via un parsing DOMParser (document inerte : aucune image
// ne charge, aucun script ne s'exécute pendant le parsing lui-même), sans
// toucher au reste de la mise en forme.
//
// Partagé V1/V2 (comme js/reader-mode.js, qui en dépend) : toute page qui
// charge reader-mode.js doit charger ce fichier AVANT.
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
