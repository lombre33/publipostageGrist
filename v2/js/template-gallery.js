// Galerie de templates (feature "Créer à partir d'un template", v2/js/main.js
// wireTemplateGalleryModal) — catalogue statique versionné dans ce dépôt
// (v2/templates-gallery/), servi par GitHub Pages en même origine que le
// reste de l'app (aucun souci CORS, contrairement au cas des images externes
// insérées manuellement dans un modèle).
const TemplateGallery = (function () {
  // Les chemins d'un manifest.json (entry.html/entry.screenshot/entry.schema)
  // sont relatifs au DOSSIER du manifeste (v2/templates-gallery/), pas à la
  // page qui charge ce module (v2/index.html) - fetch() résolvant les URL
  // relatives par rapport à la page courante, il faut préfixer chaque chemin
  // d'entrée avec ce dossier avant de le récupérer (constaté par un test
  // réel en navigateur : un simple `fetch(entry.html)` retombait un niveau
  // trop haut, 404).
  const BASE = 'templates-gallery/';
  let manifestCache = null;

  function resolveUrl(relPath) { return BASE + relPath; }

  async function loadManifest() {
    if (manifestCache) return manifestCache;
    const res = await fetch(BASE + 'manifest.json');
    manifestCache = await res.json();
    return manifestCache;
  }

  async function fetchHtml(entry) {
    return (await fetch(resolveUrl(entry.html))).text();
  }

  // Le badge #Variable (<span class="var-badge" data-key="...">#key</span>,
  // posé par createVarBadgeNode dans v2/js/editor.js) devient du texte brut
  // "#key" — utilisé pour le mode "Modèle vierge" : un template unique sert
  // aux deux modes (vide / + data), pas deux fichiers HTML à maintenir en
  // double pour un même visuel (cf. plan). No-op si le template n'a aucune
  // variable.
  function stripVariableBadges(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('span.var-badge').forEach(el => {
      el.replaceWith(document.createTextNode('#' + (el.dataset.key || '')));
    });
    return root.innerHTML;
  }

  // Parse le texte "Code View" natif de Grist (copié-collé tel quel par le
  // contributeur du template depuis un document Grist où il a construit une
  // table d'exemple pour valider les bons types) :
  //   @grist.UserTable
  //   class NomTable:
  //     Colonne = grist.Text()
  // Ne gère QUE cette syntaxe précise (classe + attributs `Col = grist.Type(...)`),
  // pas du Python arbitraire — c'est un format machine-généré par Grist, pas
  // une entrée libre.
  const PY_TYPE_TO_GRIST_TYPE = {
    Text: 'Text', Numeric: 'Numeric', Int: 'Int', Bool: 'Bool',
    Date: 'Date', DateTime: 'DateTime', Choice: 'Choice', ChoiceList: 'ChoiceList',
    Attachments: 'Attachments', Any: 'Any',
  };
  function parseGristSchema(text) {
    const classMatch = text.match(/^class\s+(\w+)\s*:/m);
    const tableName = classMatch ? classMatch[1] : null;
    const columns = [];
    const lineRe = /^\s*(\w+)\s*=\s*grist\.(\w+)\(([^)]*)\)/gm;
    let m;
    while ((m = lineRe.exec(text))) {
      const [, colId, pyType, args] = m;
      let type;
      if (pyType === 'Reference' || pyType === 'ReferenceList') {
        const target = (args.match(/['"]([^'"]+)['"]/) || [])[1] || '';
        type = (pyType === 'Reference' ? 'Ref:' : 'RefList:') + target;
      } else {
        type = PY_TYPE_TO_GRIST_TYPE[pyType] || 'Text';
      }
      columns.push({ id: colId, type });
    }
    return { tableName, columns };
  }

  async function fetchSchema(entry) {
    if (!entry.schema) return null;
    const text = await (await fetch(resolveUrl(entry.schema))).text();
    return parseGristSchema(text);
  }

  return { loadManifest, fetchHtml, fetchSchema, stripVariableBadges, parseGristSchema, resolveUrl };
})();
