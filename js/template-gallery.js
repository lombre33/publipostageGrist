// Galerie de templates (feature "Créer à partir d'un template", js/main.js
// wireTemplateGalleryModal) — catalogue statique versionné dans ce dépôt
// (templates-gallery/), servi par GitHub Pages en même origine que le
// reste de l'app (aucun souci CORS, contrairement au cas des images externes
// insérées manuellement dans un modèle).
const TemplateGallery = (function () {
  // Les chemins d'un manifest.json (entry.html/entry.screenshot/entry.schema)
  // sont relatifs au DOSSIER du manifeste (templates-gallery/), pas à la
  // page qui charge ce module (index.html) - fetch() résolvant les URL
  // relatives par rapport à la page courante, il faut préfixer chaque chemin
  // d'entrée avec ce dossier avant de le récupérer (constaté par un test
  // réel en navigateur : un simple `fetch(entry.html)` retombait un niveau
  // trop haut, 404).
  const BASE = 'templates-gallery/';
  let manifestCache = null;

  function resolveUrl(relPath) { return BASE + relPath; }

  // {cache:'no-store'} sur le manifeste/le HTML/le schéma d'un template :
  // ce sont des fichiers de contenu (pas de ?v=X.Y comme les .js/.css de
  // index.html, cf. mémoire project_browser_cache_trap), donc rien ne
  // force autrement un navigateur/CDN GitHub Pages à en récupérer une
  // version fraîche - vécu en conditions réelles : un push corrigeant
  // template.html serait resté invisible à qui l'avait déjà chargé une fois.
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

  // Le badge #Variable (<span class="var-badge" data-key="...">#key</span>,
  // posé par createVarBadgeNode dans js/editor.js) est entièrement retiré
  // (pas de texte de substitution) — utilisé pour le mode "Modèle vierge" :
  // un template unique sert aux deux modes (vide / + data), pas deux
  // fichiers HTML à maintenir en double pour un même visuel (cf. plan).
  // Retiré au complet plutôt que converti en texte "#key" (essayé d'abord,
  // rejeté par l'utilisateur : sans table de données derrière, ce texte ne
  // représente plus rien et ne doit laisser AUCUNE trace visible). No-op si
  // le template n'a aucune variable.
  function stripVariableBadges(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('span.var-badge').forEach(el => el.remove());
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
    const text = await (await fetchNoStore(resolveUrl(entry.schema))).text();
    return parseGristSchema(text);
  }

  // Les badges #Variable d'un template "+ data" portent en dur le nom de
  // table tiré du schema.py au moment où le template a été authoré
  // (ex. data-table="Facture_Simple"). Mais la table RÉELLEMENT créée par
  // useWithData() (js/main.js) peut porter un autre nom : l'utilisateur
  // peut le modifier dans le prompt, ou Grist peut le renommer lui-même en
  // cas de collision avec une table existante - sans ce réalignement, les
  // variables pointeraient vers une table qui n'existe pas (marquées
  // "cassées" par refreshVariableBadgeValidity dès le premier chargement,
  // alors que la table existe bel et bien, juste sous un autre nom). No-op
  // si les deux noms sont déjà identiques.
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
