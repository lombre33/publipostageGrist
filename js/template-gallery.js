// Galerie de templates (feature "Créer à partir d'un template", js/main.js
// wireTemplateGalleryModal) — catalogue statique versionné dans ce dépôt
// (templates-gallery/), servi par GitHub Pages en même origine que le
// reste de l'app (aucun souci CORS, contrairement au cas des images externes
// insérées manuellement dans un modèle).
const TemplateGallery = (function () {
  // Les chemins d'un manifest.json sont relatifs au dossier du manifeste,
  // pas à la page qui charge ce module - fetch() résolvant les URL par
  // rapport à la page courante, chaque chemin doit être préfixé de ce dossier.
  const BASE = 'templates-gallery/';
  let manifestCache = null;

  function resolveUrl(relPath) { return BASE + relPath; }

  // {cache:'no-store'} : ces fichiers de contenu n'ont pas de ?v=X.Y comme
  // les .js/.css de index.html, rien ne force sinon un navigateur/CDN
  // GitHub Pages à en récupérer une version fraîche.
  async function fetchNoStore(url) { return fetch(url, { cache: 'no-store' }); }

  async function loadManifest() {
    if (manifestCache) return manifestCache;
    const res = await fetchNoStore(BASE + 'manifest.json');
    manifestCache = await res.json();
    return manifestCache;
  }

  async function fetchHtml(entry) {
    return (await fetchNoStore(resolveUrl(entry.html))).text();
  }

  // Retire entièrement le badge #Variable (pas de texte de substitution),
  // pour le mode "Modèle vierge" : un template unique sert aux deux modes
  // (vide / + data), pas deux fichiers HTML à maintenir en double. Sans
  // table de données derrière, "#key" en texte ne représenterait plus rien.
  function stripVariableBadges(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('span.var-badge').forEach(el => el.remove());
    return root.innerHTML;
  }

  // Parse le "Code View" natif de Grist (`@grist.UserTable` / `class Nom:` /
  // `Col = grist.Type()`) - ne gère que cette syntaxe machine-générée précise,
  // pas du Python arbitraire.
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
    const text = await (await fetchNoStore(resolveUrl(entry.schema))).text();
    return parseGristSchema(text);
  }

  // Les badges #Variable d'un template "+ data" portent en dur le nom de
  // table tiré du schema.py à l'authoring. La table réellement créée par
  // useWithData() (js/main.js) peut porter un autre nom (modifié dans le
  // prompt, ou renommé par Grist en cas de collision) - sans ce réalignement
  // les variables pointeraient vers une table inexistante.
  function rebindVariableTable(html, fromTable, toTable) {
    if (!fromTable || !toTable || fromTable === toTable) return html;
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('span.var-badge[data-table="' + fromTable + '"]').forEach(el => {
      el.setAttribute('data-table', toTable);
      const key = el.getAttribute('data-key') || '';
      if (key.indexOf(fromTable + '.') === 0) {
        const newKey = toTable + key.slice(fromTable.length);
        el.setAttribute('data-key', newKey);
        el.textContent = '#' + newKey;
      }
    });
    return root.innerHTML;
  }

  return { loadManifest, fetchHtml, fetchSchema, stripVariableBadges, parseGristSchema, rebindVariableTable, resolveUrl };
})();
