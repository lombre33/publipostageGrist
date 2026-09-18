// Galerie de templates (feature "Créer à partir d'un template", js/main.js wireTemplateGalleryModal) — catalogue statique versionné dans ce dépôt
// (templates-gallery/), servi par GitHub Pages en même origine que le reste de l'app (aucun souci CORS, contrairement aux images externes d'un modèle).
const TemplateGallery = (function () {
  // Les chemins d'un manifest.json sont relatifs au dossier du manifeste, pas à la page qui charge ce module - fetch() résolvant les URL par rapport à la
  // page courante, chaque chemin doit être préfixé de ce dossier.
  const BASE = 'templates-gallery/';
  // Catalogue SÉPARÉ pour les modèles de test/démo (« Test — … », « Vitrine des fonctionnalités »), qui n'ont rien à faire devant un utilisateur final mais
  // servent au protocole de test manuel (cf. dev-tests/PROTOCOLE_TEST_MANUEL.md). Dossier à part précisément pour qu'un déploiement live puisse ne PAS le
  // publier : son absence est un cas normal, pas une erreur (cf. loadManifest ci-dessous, qui l'ignore alors en silence).
  const DEV_BASE = 'templates-gallery-dev/';
  let manifestCache = null;

  // Chaque entrée porte son propre dossier de base depuis loadManifest() : les chemins d'un manifeste sont relatifs à SON dossier, et il y en a
  // maintenant deux. Repli sur BASE pour une entrée construite à la main (tests) qui n'aurait pas de __base.
  function resolveUrl(relPath, entry) { return ((entry && entry.__base) || BASE) + relPath; }

  // {cache:'no-store'} : ces fichiers de contenu n'ont pas de ?v=X.Y comme les .js/.css de index.html, rien ne force sinon un navigateur/CDN GitHub Pages à
  // en récupérer une version fraîche.
  async function fetchNoStore(url) { return fetch(url, { cache: 'no-store' }); }

  // Lit un manifeste et tague chaque entrée avec son dossier de base. `optional` couvre le catalogue de dev : absent d'un déploiement live, un 404 (ou
  // un JSON invalide servi à sa place par certains hébergeurs) ne doit surtout pas vider la galerie des vrais modèles.
  async function loadOneManifest(base, optional) {
    try {
      const res = await fetchNoStore(base + 'manifest.json');
      if (!res.ok) { if (optional) return []; throw new Error('HTTP ' + res.status); }
      const entries = await res.json();
      if (!Array.isArray(entries)) { if (optional) return []; throw new Error('manifeste mal formé'); }
      return entries.map(e => Object.assign({}, e, { __base: base, __dev: !!optional }));
    } catch (e) {
      if (optional) { console.info('[TemplateGallery] pas de catalogue de dev (' + base + ') - normal sur un déploiement live.'); return []; }
      throw e;
    }
  }

  async function loadManifest() {
    if (manifestCache) return manifestCache;
    const [prod, dev] = await Promise.all([loadOneManifest(BASE, false), loadOneManifest(DEV_BASE, true)]);
    manifestCache = prod.concat(dev);
    return manifestCache;
  }

  async function fetchHtml(entry) {
    return (await fetchNoStore(resolveUrl(entry.html, entry))).text();
  }

  // Optionnel - la plupart des templates n'ont pas d'en-tête/pied. Même forme que Editor.getHeaderFooterData()/setHeaderFooterData().
  async function fetchHeaderFooter(entry) {
    if (!entry.headerFooter) return null;
    return (await fetchNoStore(resolveUrl(entry.headerFooter, entry))).json();
  }

  // Retire entièrement le badge #Variable (pas de texte de substitution), pour le mode "Modèle vierge" : un template unique sert aux deux modes (vide / +
  // data), pas deux fichiers HTML à maintenir en double. Sans table de données derrière, "#key" en texte ne représenterait plus rien.
  function stripVariableBadges(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('span.var-badge').forEach(el => el.remove());
    return root.innerHTML;
  }

  // Parse le "Code View" natif de Grist (`@grist.UserTable` / `class Nom:` / `Col = grist.Type()`) - ne gère que cette syntaxe machine-générée précise, pas
  // du Python arbitraire.
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
    const text = await (await fetchNoStore(resolveUrl(entry.schema, entry))).text();
    return parseGristSchema(text);
  }

  // Les badges #Variable d'un template "+ data" portent en dur le nom de table tiré du schema.py à l'authoring. La table réellement créée par useWithData()
  // (js/main.js) peut porter un autre nom (modifié dans le prompt, ou renommé par Grist en cas de collision) - sans ce réalignement elles pointeraient vers une table inexistante.
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

  return { loadManifest, fetchHtml, fetchHeaderFooter, fetchSchema, stripVariableBadges, parseGristSchema, rebindVariableTable, resolveUrl };
})();
