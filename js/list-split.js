// « Un document par valeur » : une variable de liste (colonne Liste de choix ou Liste de références) réglée ainsi dans sa fenêtre « Liste »
// (js/variable-list.js, format.list.perValue) fait sortir de chaque ligne un document par valeur de la liste, tout le reste du document identique
// (deux PDF s'il y a deux éléments dans la liste, l'un avec la première valeur et l'autre avec la deuxième).
//
// Le modèle n'est jamais rendu autrement : pour le document n° k, la bulle réglée est réécrite en « La k-ième » (le réglage d'affichage de la fenêtre
// « Liste »), puis tout le chemin ordinaire (ReaderMode.preview, Word, Excel, en-têtes et pieds de page) la lit comme n'importe quelle bulle. Aucune
// ligne n'est copiée, aucun état global : le document à rendre est une chaîne de HTML. La Lecture passe par ici pour la valeur qu'elle montre
// (js/reading-value.js, une pastille passe d'une valeur à l'autre) ; l'e-mail n'y passe pas, il écrit la liste comme elle est réglée.
//
// Les listes à découper se comptent par colonne (table + colonne) : deux bulles réglées sur la même colonne prennent la même valeur dans un même
// document ; deux colonnes différentes donnent un document par combinaison. Une liste sans valeur ne découpe rien : la ligne garde son document, la
// bulle écrit ce que son réglage écrit d'une liste vide (rien).
// Les bulles qui lisent les LIGNES d'une même liste de références (#Projets.Partenaires.Nom_complet, #Projets.Partenaires.Ville : Variables.rowListOf) forment UNE liste, même si leurs colonnes
// diffèrent : un document par ligne de la liste (un partenaire), la k-ième ligne pour chacune, vide comprise - un partenaire sans deuxième ligne d'adresse n'en décale pas les suivants. Sans cela,
// cinq variables d'un même partenaire donnaient un document par combinaison (le produit des listes, 32 documents pour 2 partenaires) et celles de la deuxième ligne ne suivaient pas la première.
const ListSplit = (function () {
  // Le mot qui marque, dans le HTML d'un modèle, une bulle réglée ainsi (data-format="{…"perValue":true…}") : sans lui, rien n'est lu, rien n'est
  // calculé et l'export reste ce qu'il était.
  const MARKER = 'perValue';
  const LABEL_JOIN = ' - ';

  function hasMarker(parts) { return parts.some(part => typeof part === 'string' && part.indexOf(MARKER) !== -1); }
  function keyOf(table, column) { return table + '\u0001' + column; }
  // Le groupe d'une bulle : la liste de références qu'elle lit ligne par ligne (`rows` : la même clé pour toutes les colonnes de cette liste, le rang est celui de la LIGNE), sinon sa colonne (le rang est
  // celui de la valeur écrite).
  function groupOf(table, column) {
    const list = Variables.rowListOf(table, column);
    return list ? { key: keyOf(table, list), rows: true } : { key: keyOf(table, column), rows: false };
  }
  function hasPins(variant) { return !!variant && !!variant.pins && Object.keys(variant.pins).length > 0; }

  // Les morceaux de HTML d'un document à exporter : le corps, puis les quatre zones d'en-tête et de pied de page (celles que l'export lit : rien
  // quand les en-têtes et pieds sont coupés).
  function partsOf(html, headerFooterData) {
    const hf = headerFooterData && headerFooterData.enabled ? headerFooterData : null;
    const zone = name => (hf && hf[name]) || {};
    return [html, zone('header').default, zone('header').first, zone('footer').default, zone('footer').first];
  }

  // Le plan d'une ligne : `groups` (une entrée par liste à découper, avec ses valeurs écrites) et `variants` (un par document, dans l'ordre du
  // document : la première liste change le plus lentement), chacun { pins: { <clé de la liste>: rang de la valeur, ou de la ligne d'une liste de références, à partir de 1 }, label: valeurs
  // écrites, jointes par « - » }. Sans bulle réglée, ou sans valeur, un seul document, sans épingle : l'export ordinaire.
  async function plan(parts, tableId, record) {
    const single = () => ({ groups: [], variants: [{ pins: {}, label: '' }] });
    if (!hasMarker(parts)) return single();
    const badges = await ReaderMode.splitBadges(parts, tableId, record);
    if (!badges.length) return single();
    const groups = [];
    for (const badge of badges) {
      const { key, rows } = groupOf(badge.table, badge.column);
      const group = groups.find(g => g.key === key);
      if (!group) {
        groups.push({ key, table: badge.table, column: badge.column, rows, members: [badge], texts: [], ranks: [] });
        continue;
      }
      // Une autre colonne de la même liste de références : ses lignes se lisent aussi, une seule fois par colonne.
      if (rows && !group.members.some(member => member.column === badge.column)) group.members.push(badge);
    }
    for (const group of groups) {
      if (!group.rows) {
        const badge = group.members[0];
        const read = await Variables.resolveListTexts(badge.table, badge.column, tableId, record, badge.format);
        group.texts = read.error ? [] : read.texts;
        group.ranks = group.texts.map((text, i) => i + 1);
        continue;
      }
      // Une liste de références : la ligne de rang k existe quand une des colonnes lues y écrit quelque chose ; son étiquette est le premier texte écrit, dans l'ordre du document.
      const reads = await Promise.all(group.members.map(badge => Variables.resolveRowTexts(badge.table, badge.column, tableId, record, badge.format)));
      const lines = Math.max(0, ...reads.map(read => (read.error ? 0 : read.texts.length)));
      for (let k = 0; k < lines; k++) {
        const text = reads.map(read => (read.error ? '' : read.texts[k] || '')).find(t => t !== '');
        if (text === undefined) continue;
        group.ranks.push(k + 1);
        group.texts.push(text);
      }
    }
    let variants = [{ pins: {}, labels: [] }];
    for (const group of groups) {
      if (!group.texts.length) continue;
      variants = variants.flatMap(variant => group.texts.map((text, i) => ({ pins: Object.assign({}, variant.pins, { [group.key]: group.ranks[i] }), labels: variant.labels.concat(text) })));
    }
    return { groups: groups.map(group => ({ key: group.key, table: group.table, column: group.column, texts: group.texts })), variants: variants.map(variant => ({ pins: variant.pins, label: variant.labels.join(LABEL_JOIN) })) };
  }

  // Le HTML du document n° k : les bulles réglées « Un document par valeur » dont la colonne est épinglée prennent le réglage « La k-ième » (leur
  // autre format, nombre ou date, reste). Sans épingle, la même chaîne. Le HTML vient du document : il est lu dans un document inerte et filtré
  // (HtmlSanitize.parseInert, comme le fait ReaderMode.preview pour tout ce qu'il rend), puis relu en texte.
  function pin(html, variant) {
    if (!html || !hasPins(variant) || html.indexOf(MARKER) === -1) return html;
    const holder = HtmlSanitize.parseInert(html);
    let changed = false;
    holder.querySelectorAll('.var-badge[data-format]').forEach(badge => {
      let format = null;
      try { format = JSON.parse(badge.getAttribute('data-format')); } catch (e) { return; }
      if (!format || !format.list || format.list.perValue !== true) return;
      const { key, rows } = groupOf(badge.getAttribute('data-table'), badge.getAttribute('data-column'));
      const index = variant.pins[key];
      if (!index) return;
      badge.setAttribute('data-format', JSON.stringify(Object.assign({}, format, { list: rows ? { pick: 'nth', index, row: true } : { pick: 'nth', index } })));
      changed = true;
    });
    return changed ? holder.innerHTML : html;
  }
  // Même réécriture pour les quatre zones d'en-tête et de pied de page (la même valeur que le corps). Sans épingle, ou en-têtes coupés, le même
  // objet.
  function pinHeaderFooter(data, variant) {
    if (!data || !data.enabled || !hasPins(variant)) return data;
    const zone = z => (z ? { default: pin(z.default, variant), first: pin(z.first, variant) } : z);
    return Object.assign({}, data, { header: zone(data.header), footer: zone(data.footer) });
  }

  return { hasMarker, hasPins, partsOf, plan, pin, pinHeaderFooter };
})();
