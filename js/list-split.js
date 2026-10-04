// « Un document par valeur » : une variable de liste (colonne Liste de choix ou Liste de références) réglée ainsi dans sa fenêtre « Liste » (js/variable-list.js, format.list.perValue) fait sortir de chaque ligne un
// document par valeur de la liste, tout le reste du document identique (demande d'Antoine du 04/10 : « deux pdf s'il y a deux éléments dans la liste, un avec la première valeur et l'autre avec le deuxième »).
//
// Le modèle n'est jamais rendu autrement : pour le document n° k, la bulle réglée est réécrite en « La k-ième » (le réglage d'affichage de la fenêtre « Liste »), puis tout le chemin ordinaire (ReaderMode.preview, Word,
// Excel, en-têtes et pieds de page) la lit comme n'importe quelle bulle. Aucune ligne n'est copiée, aucun état global : le document à rendre est une chaîne de HTML. La Lecture et l'e-mail ne passent pas ici, ils écrivent
// la liste comme elle est réglée.
//
// Les listes à découper se comptent par colonne (table + colonne) : deux bulles réglées sur la même colonne prennent la même valeur dans un même document ; deux colonnes différentes donnent un document par combinaison.
// Une liste sans valeur ne découpe rien : la ligne garde son document, la bulle écrit ce que son réglage écrit d'une liste vide (rien).
const ListSplit = (function () {
  // Le mot qui marque, dans le HTML d'un modèle, une bulle réglée ainsi (data-format="{…"perValue":true…}") : sans lui, rien n'est lu, rien n'est calculé et l'export reste ce qu'il était.
  const MARKER = 'perValue';
  const LABEL_JOIN = ' - ';

  function hasMarker(parts) { return parts.some(part => typeof part === 'string' && part.indexOf(MARKER) !== -1); }
  function keyOf(table, column) { return table + '\u0001' + column; }
  function hasPins(variant) { return !!variant && !!variant.pins && Object.keys(variant.pins).length > 0; }

  // Les morceaux de HTML d'un document à exporter : le corps, puis les quatre zones d'en-tête et de pied de page (celles que l'export lit : rien quand les en-têtes et pieds sont coupés).
  function partsOf(html, headerFooterData) {
    const hf = headerFooterData && headerFooterData.enabled ? headerFooterData : null;
    const zone = name => (hf && hf[name]) || {};
    return [html, zone('header').default, zone('header').first, zone('footer').default, zone('footer').first];
  }

  // Le plan d'une ligne : `groups` (une entrée par colonne à découper, avec ses valeurs écrites) et `variants` (un par document, dans l'ordre du document : la première liste change le plus lentement), chacun
  // { pins: { <table+colonne>: rang de la valeur, à partir de 1 }, label: valeurs écrites, jointes par « - » }. Sans bulle réglée, ou sans valeur, un seul document, sans épingle : l'export ordinaire.
  async function plan(parts, tableId, record) {
    const single = () => ({ groups: [], variants: [{ pins: {}, label: '' }] });
    if (!hasMarker(parts)) return single();
    const badges = await ReaderMode.splitBadges(parts, tableId, record);
    if (!badges.length) return single();
    const groups = [];
    for (const badge of badges) {
      const key = keyOf(badge.table, badge.column);
      if (groups.some(group => group.key === key)) continue;
      const read = await Variables.resolveListTexts(badge.table, badge.column, tableId, record, badge.format);
      groups.push({ key, table: badge.table, column: badge.column, texts: read.error ? [] : read.texts });
    }
    let variants = [{ pins: {}, labels: [] }];
    for (const group of groups) {
      if (!group.texts.length) continue;
      variants = variants.flatMap(variant => group.texts.map((text, i) => ({ pins: Object.assign({}, variant.pins, { [group.key]: i + 1 }), labels: variant.labels.concat(text) })));
    }
    return { groups, variants: variants.map(variant => ({ pins: variant.pins, label: variant.labels.join(LABEL_JOIN) })) };
  }

  // Le HTML du document n° k : les bulles réglées « Un document par valeur » dont la colonne est épinglée prennent le réglage « La k-ième » (leur autre format, nombre ou date, reste). Sans épingle, la même chaîne.
  // <template> : un document inerte (ni image chargée, ni script lancé) qui garde les cases de tableau en place.
  function pin(html, variant) {
    if (!html || !hasPins(variant) || html.indexOf(MARKER) === -1) return html;
    const holder = document.createElement('template');
    holder.innerHTML = html;
    let changed = false;
    holder.content.querySelectorAll('.var-badge[data-format]').forEach(badge => {
      let format = null;
      try { format = JSON.parse(badge.getAttribute('data-format')); } catch (e) { return; }
      if (!format || !format.list || format.list.perValue !== true) return;
      const index = variant.pins[keyOf(badge.getAttribute('data-table'), badge.getAttribute('data-column'))];
      if (!index) return;
      badge.setAttribute('data-format', JSON.stringify(Object.assign({}, format, { list: { pick: 'nth', index } })));
      changed = true;
    });
    return changed ? holder.innerHTML : html;
  }
  // Même réécriture pour les quatre zones d'en-tête et de pied de page (la même valeur que le corps). Sans épingle, ou en-têtes coupés, le même objet.
  function pinHeaderFooter(data, variant) {
    if (!data || !data.enabled || !hasPins(variant)) return data;
    const zone = z => (z ? { default: pin(z.default, variant), first: pin(z.first, variant) } : z);
    return Object.assign({}, data, { header: zone(data.header), footer: zone(data.footer) });
  }

  return { MARKER, hasMarker, partsOf, plan, pin, pinHeaderFooter };
})();
