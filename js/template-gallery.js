// Galerie de modèles (« Créer à partir d'un modèle », js/main.js wireTemplateGalleryModal) : catalogue statique versionné dans templates-gallery/,
// servi par GitHub Pages en même origine que l'app (pas de CORS, contrairement aux images externes d'un modèle).
const TemplateGallery = (function () {
  // Les chemins d'un manifest.json sont relatifs à son dossier, pas à la page (fetch() résout par rapport à la page courante) : chaque chemin est
  // préfixé de ce dossier.
  const BASE = 'templates-gallery/';
  // Catalogue séparé pour les modèles de test et de démonstration (« Test — … », « Vitrine des fonctionnalités »), utilisés par le protocole de test
  // manuel (dev-tests/PROTOCOLE_TEST_MANUEL.md). Jamais chargé sans `?dev` dans l'adresse du widget ; un déploiement qui ne le publie pas est un cas
  // normal (loadOneManifest l'ignore alors en silence).
  const DEV_BASE = 'templates-gallery-dev/';
  let manifestCache = null;
  let manifestCacheWithDev = false;

  function devCatalogueWanted() {
    try { return new URLSearchParams(window.location.search).has('dev'); }
    catch (e) { return false; }
  }

  // Chaque entrée porte le dossier de base de son manifeste (loadManifest) : il y en a deux. Repli sur BASE pour une entrée construite à la main
  // (tests) sans __base.
  function resolveUrl(relPath, entry) { return ((entry && entry.__base) || BASE) + relPath; }

  // cache: 'no-store' : ces fichiers n'ont pas de ?v= comme les .js/.css de index.html, rien ne forcerait sinon le navigateur ou le CDN de GitHub
  // Pages à les rafraîchir.
  async function fetchNoStore(url) { return fetch(url, { cache: 'no-store' }); }

  // Lit un manifeste et tague chaque entrée avec son dossier de base. `optional` (catalogue de dev) : absent d'un déploiement live, un 404 (ou un
  // JSON invalide servi à sa place par certains hébergeurs) ne doit pas vider la galerie des vrais modèles.
  async function loadOneManifest(base, optional) {
    try {
      const res = await fetchNoStore(base + 'manifest.json');
      if (!res.ok) { if (optional) return []; throw new Error('HTTP ' + res.status); }
      const entries = await res.json();
      if (!Array.isArray(entries)) { if (optional) return []; throw new Error('manifeste mal formé'); }
      return entries.map(e => Object.assign({}, e, { __base: base }));
    } catch (e) {
      if (optional) { console.info('[TemplateGallery] pas de catalogue de dev (' + base + ') - normal sur un déploiement live.'); return []; }
      throw e;
    }
  }

  async function loadManifest() {
    const withDev = devCatalogueWanted();
    if (manifestCache && manifestCacheWithDev === withDev) return manifestCache;
    const [prod, dev] = await Promise.all([loadOneManifest(BASE, false), withDev ? loadOneManifest(DEV_BASE, true) : []]);
    manifestCache = prod.concat(dev);
    manifestCacheWithDev = withDev;
    return manifestCache;
  }

  async function fetchHtml(entry) {
    return (await fetchNoStore(resolveUrl(entry.html, entry))).text();
  }

  // Optionnel (la plupart des modèles n'ont pas d'en-tête ni de pied). Même forme que Editor.getHeaderFooterData() / setHeaderFooterData().
  async function fetchHeaderFooter(entry) {
    if (!entry.headerFooter) return null;
    return (await fetchNoStore(resolveUrl(entry.headerFooter, entry))).json();
  }

  // Retire entièrement le badge #Variable (pas de texte de substitution) pour le mode « Modèle vierge » : un seul fichier sert aux deux modes (vide,
  // avec données). Sans table derrière, « #key » en texte ne représenterait rien.
  function stripVariableBadges(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('span.var-badge').forEach(el => el.remove());
    return root.innerHTML;
  }

  // Parse le « Code View » natif de Grist (`@grist.UserTable`, `class Nom:`, `Col = grist.Type()`) : cette seule syntaxe générée par machine, pas du
  // Python arbitraire.
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

  // Les badges #Variable d'un modèle « avec données » portent le nom de table du schema.py d'écriture. La table créée par useWithData() (js/main.js)
  // peut en porter un autre (modifié dans le prompt, ou renommé par Grist en cas de collision) : sans ce réalignement, elles pointeraient vers une
  // table inexistante.
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
