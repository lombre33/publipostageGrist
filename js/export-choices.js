// Les réglages d'export de la personne, gardés par modèle : le type d'export (PDF, Word, Excel), la qualité du PDF et « une seule ligne / toutes les lignes »
// (demande du 12/10 : « sauvegardés par personne et par modèle »). Les trois listes cachées de la barre (#v2-export-type, #v2-pdf-quality, #v2-export-lines)
// restent ce que js/main.js lit pour exporter ; ce module les remet à ce que la personne avait choisi pour le modèle qui s'ouvre, et garde ce qu'elle choisit ensuite.
//  - Un modèle sans choix repart de l'origine (la première option de chaque liste : PDF, vectoriel, une seule ligne) : les réglages d'un modèle ne passent pas
//    au suivant. Un modèle déjà vu pendant la session retrouve ses réglages sans relire Grist.
//  - La table des préférences de la personne (js/template-preferences.js) les garde d'un ordinateur à l'autre, comme les épingles. Un compte en lecture seule ne
//    les garde que pour la session : rien n'est écrit, aucune table n'est créée (`canSave`). Sans table - la personne a refusé de la créer -, il en va de même.
//  - Un modèle pas encore enregistré n'a pas d'identifiant : ses réglages restent à l'écran, et sont écrits à son premier enregistrement (`adopt`) ; la copie
//    « Enregistrer sous » emporte ceux de l'écran (`detach`, puis `adopt`).
//  - Rien ne parle à Grist avant un choix de la personne. La lecture du démarrage finit après l'ouverture du premier modèle : ce qu'elle apporte (`refresh`)
//    ne remplace jamais un choix déjà fait dans la session pour ce modèle.
// Script classique (pas type="module"), même convention de portée globale que PageZoom ; js/main.js le câble (wire) et lui annonce chaque modèle chargé
// (useTemplate) et chaque choix (remember).
const ExportChoices = (function () {
  // Le champ, la liste cachée qui le porte. La valeur d'origine est celle de la première option de la liste (index.html), écrite une seule fois.
  const FIELDS = [
    { field: 'type', id: 'v2-export-type' },
    { field: 'quality', id: 'v2-pdf-quality' },
    { field: 'lines', id: 'v2-export-lines' },
  ];

  // canSave : la personne peut-elle écrire dans le document ; onApplied : les menus à redessiner quand un réglage lu après coup change l'écran.
  let host = { canSave: () => true, onApplied: () => {} };
  const session = new Map();   // identifiant du modèle -> ses réglages ({ type, quality, lines, touched })
  let currentId = null;        // le modèle ouvert ; null tant qu'il n'est pas enregistré
  let current = null;          // ses réglages
  let opened = false;          // un modèle a été annoncé

  function listOf(item) { return document.getElementById(item.id); }
  function originOf(item) {
    const list = listOf(item);
    return list && list.options.length ? list.options[0].value : '';
  }
  function known(item, value) {
    const list = listOf(item);
    return !!list && Array.prototype.some.call(list.options, option => option.value === value);
  }

  function fresh() {
    const settings = { touched: false };
    FIELDS.forEach(item => { settings[item.field] = originOf(item); });
    return settings;
  }

  // Ce que la table a gardé pour ce modèle, sans ce que les listes ne connaissent pas (une valeur étrangère vaut l'origine).
  function stored(id) {
    const settings = fresh();
    const saved = TemplatePreferences.getExportChoices(id);
    if (saved) FIELDS.forEach(item => { if (saved[item.field] && known(item, saved[item.field])) settings[item.field] = saved[item.field]; });
    return settings;
  }

  function show(settings) {
    FIELDS.forEach(item => { const list = listOf(item); if (list) list.value = settings[item.field]; });
  }

  // Ce qui s'écrit : une chaîne vide pour le réglage d'origine, qui n'écrit pas de ligne tant que rien d'autre ne change.
  function forTable(settings) {
    const out = {};
    FIELDS.forEach(item => { out[item.field] = settings[item.field] === originOf(item) ? '' : settings[item.field]; });
    return out;
  }

  function save() {
    if (currentId == null || !host.canSave()) return;
    TemplatePreferences.setExportChoices(currentId, forTable(current))
      .catch(e => console.error('[export-choices] écriture impossible, les réglages restent ceux de la session', e));
  }

  function wire(options) { host = Object.assign({}, host, options); }

  // Un modèle s'ouvre (tpl = null : un nouveau modèle, pas encore enregistré). Les listes cachées prennent ses réglages ; les menus se redessinent avec le
  // type du modèle (syncExportRowsForModelType), un peu plus loin dans son chargement : rien n'est redessiné ici.
  function useTemplate(tpl) {
    opened = true;
    currentId = tpl && tpl.id != null ? Number(tpl.id) : null;
    if (currentId == null) {
      current = fresh();
    } else {
      current = session.get(currentId);
      if (!current) { current = stored(currentId); session.set(currentId, current); }
    }
    show(current);
  }

  // La personne vient de choisir une valeur dans la liste cachée `listId`.
  function remember(listId, value) {
    const item = FIELDS.find(f => f.id === listId);
    if (!item || !current || !known(item, value)) return;
    current[item.field] = value;
    current.touched = true;
    save();
  }

  // Les préférences de la personne viennent d'être lues : les modèles vus avant la fin de la lecture, que la personne n'a pas touchés, prennent ce qu'elle
  // avait gardé pour eux.
  function refresh() {
    if (!opened) return;
    let redraw = false;
    session.forEach((settings, id) => {
      if (settings.touched) return;
      const saved = stored(id);
      FIELDS.forEach(item => {
        if (settings[item.field] === saved[item.field]) return;
        settings[item.field] = saved[item.field];
        if (settings === current) redraw = true;
      });
    });
    if (redraw) { show(current); host.onApplied(); }
  }

  // Le modèle de l'écran est enregistré sous cet identifiant (premier enregistrement d'un nouveau modèle, ou copie) : ses réglages lui sont gardés.
  function adopt(id) {
    const wanted = Number(id);
    if (!opened || !current || !(wanted >= 1) || currentId === wanted) return;
    if (currentId != null) current = Object.assign({}, current);
    currentId = wanted;
    session.set(wanted, current);
    save();
  }

  // « Enregistrer sous » : la copie n'a pas encore d'identifiant, et ce que la personne choisit d'ici son enregistrement ne doit pas toucher le modèle d'origine.
  function detach() {
    if (!opened || !current) return;
    current = Object.assign({}, current);
    currentId = null;
  }

  // Oublie ce que la session a vu : pour les essais, qui repartent d'une page où les identifiants se répètent. Un vrai document n'en a pas besoin.
  function reset() {
    session.clear();
    currentId = null;
    current = null;
    opened = false;
  }

  return { wire, useTemplate, remember, refresh, adopt, detach, reset };
})();
