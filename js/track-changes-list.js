// Suivi des modifications : la LISTE des modifications en attente (le volet « Modifications ») - une entrée par modification, dans l'ordre du document, avec ce qu'elle fait (ajout,
// suppression, remplacement, réglage), sur quoi (du texte, un objet, une colonne, une ligne), un extrait de ce qui est ajouté ou retiré et l'étendue qu'elle couvre. Script classique,
// chargé après js/track-changes-selection.js ; l'auteur et la date, qui viennent des métadonnées de js/track-changes.js, s'y ajoutent là (TrackChanges.suggestionEntries).
const TrackChangesList = (function () {
  const { suggestionMarksOf, CELL_NODE_TYPES: cellTypes } = TrackChangesCore;
  const { expandSuggestionIds } = TrackChangesSelection;

  const EXTRACT_MAX = 80;
  // Les espaces de largeur nulle (U+200B) que l'éditeur pose aux sauts de paragraphe suivis n'ont rien à montrer dans un extrait.
  const flat = text => text.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
  // Le début d'un texte, coupé à un mot près et fermé par « … » quand il est plus long.
  function shorten(text) {
    const clean = flat(text);
    if (clean.length <= EXTRACT_MAX) return clean;
    const cut = clean.slice(0, EXTRACT_MAX);
    const space = cut.lastIndexOf(' ');
    return (space > EXTRACT_MAX / 2 ? cut.slice(0, space) : cut) + '…';
  }

  // Ce que chaque identifiant porte dans le document : son étendue, ses marques, le texte ajouté et le texte retiré (gardés assez longs pour en tirer un extrait, pas plus : un
  // paragraphe supprimé entier ne doit pas être recopié), les objets (image, bulle...), les cases et les lignes de tableau, les réglages (marque `modification`).
  function scan(doc) {
    const records = new Map();
    const recordOf = (id) => {
      const key = String(id);
      if (!records.has(key)) {
        records.set(key, { id, from: null, to: null, inserted: '', deleted: '', objects: [], cells: 0, rows: 0, blocks: 0, hasInsertion: false, hasDeletion: false, hasModification: false, settings: [], onCell: false });
      }
      return records.get(key);
    };
    doc.descendants((node, pos) => {
      suggestionMarksOf(node).forEach((mark) => {
        if (mark.attrs.id == null) return;
        const record = recordOf(mark.attrs.id);
        record.from = record.from == null ? pos : Math.min(record.from, pos);
        record.to = Math.max(record.to == null ? 0 : record.to, pos + node.nodeSize);
        const kind = mark.type.name;
        const inCells = cellTypes.includes(node.type.name);
        if (kind === 'modification') {
          record.hasModification = true;
          // Seules la largeur d'une colonne et celle ou la hauteur d'une case fusionnée se résolvent avec d'autres cases (expandSuggestionIds) ; le fond d'une case reste une modification seule.
          if (inCells && ['colwidth', 'colspan', 'rowspan'].includes(mark.attrs.attrName)) record.onCell = true;
          const setting = mark.attrs.type === 'nodeType' ? 'nodeType' : mark.attrs.attrName;
          if (setting && !record.settings.includes(setting)) record.settings.push(setting);
          if (mark.attrs.type === 'nodeType' && !record.nodeType) record.nodeType = mark.attrs.newValue || node.type.name;
          if (mark.attrs.attrName === 'level' && mark.attrs.newValue != null) record.level = mark.attrs.newValue;
          return;
        }
        if (kind === 'insertion') record.hasInsertion = true; else record.hasDeletion = true;
        if (inCells) {
          record.onCell = true;
          if (node.type.name === 'tableRow') record.rows++; else record.cells++;
        } else if (node.isText) {
          const field = kind === 'insertion' ? 'inserted' : 'deleted';
          if (record[field].length < EXTRACT_MAX * 3) record[field] += node.text;
        } else if (node.isLeaf) {
          if (!record.objects.includes(node.type.name)) record.objects.push(node.type.name);
        } else {
          record.blocks++;
        }
      });
      return true;
    });
    return records;
  }

  // Ce que la modification fait : « insert », « delete », « replace » (du texte retiré et remis à la place, un gras suivi par exemple) ou « format » (un réglage seul : alignement,
  // interligne, fond d'une case...) ; et sur quoi : « text », « object », « column », « row » ou « block » (un paragraphe vide, un bloc sans texte).
  function describe(group) {
    const hasInsertion = group.some(r => r.hasInsertion);
    const hasDeletion = group.some(r => r.hasDeletion);
    const inserted = flat(group.map(r => r.inserted).join(' '));
    const deleted = flat(group.map(r => r.deleted).join(' '));
    // Un passage retiré et remis tel quel (un gras, une couleur : la bibliothèque suit une marque de caractère comme un remplacement) est une mise en forme, pas un remplacement.
    const reformatted = hasInsertion && hasDeletion && inserted !== '' && inserted === deleted;
    const action = reformatted ? 'format' : hasInsertion && hasDeletion ? 'replace' : hasInsertion ? 'insert' : hasDeletion ? 'delete' : 'format';
    const text = inserted !== '' || deleted !== '';
    const objects = group.some(r => r.objects.length);
    const rows = group.some(r => r.rows > 0);
    const cells = group.some(r => r.cells > 0);
    const subject = rows ? 'row' : cells ? 'column' : text ? 'text' : objects ? 'object' : 'block';
    return { action, subject };
  }

  // Les identifiants qui se résolvent ensemble (expandSuggestionIds) ne font qu'une entrée : une colonne ajoutée porte un identifiant par case, la largeur d'une colonne tirée
  // aussi. Le calcul n'est fait que pour ce qui touche un tableau, il lit tout le document à chaque fois.
  function collect(doc) {
    const records = scan(doc);
    const ordered = Array.from(records.values()).sort((a, b) => a.from - b.from);
    const seen = new Set();
    const entries = [];
    ordered.forEach((record) => {
      const key = String(record.id);
      if (seen.has(key)) return;
      const group = [record];
      seen.add(key);
      if (record.onCell) {
        expandSuggestionIds(doc, [record.id]).forEach((rawId, otherKey) => {
          if (seen.has(otherKey) || !records.has(otherKey)) return;
          seen.add(otherKey);
          group.push(records.get(otherKey));
        });
      }
      const { action, subject } = describe(group);
      const inserted = shorten(group.map(r => r.inserted).join(' '));
      const deleted = shorten(group.map(r => r.deleted).join(' '));
      let settings = [];
      group.forEach(r => r.settings.forEach((setting) => { if (!settings.includes(setting)) settings.push(setting); }));
      // Un bloc qui change de type (un titre, un bloc de code) porte une marque par attribut du nouveau type : seul le changement de type se dit.
      if (settings.includes('nodeType')) settings = ['nodeType'];
      const objects = [];
      group.forEach(r => r.objects.forEach((name) => { if (!objects.includes(name)) objects.push(name); }));
      const nodeType = group.map(r => r.nodeType).find(Boolean) || null;
      const level = group.map(r => r.level).find(value => value != null) || null;
      entries.push({
        id: String(record.id),
        ids: group.map(r => r.id),
        keys: group.map(r => String(r.id)),
        from: Math.min(...group.map(r => r.from)),
        to: Math.max(...group.map(r => r.to)),
        action, subject, inserted, deleted, settings, objects, nodeType, level,
        count: group.length,
      });
    });
    entries.sort((a, b) => a.from - b.from);
    return entries;
  }

  // L'entrée que la position `pos` touche (le curseur dans l'étendue d'une modification, bornes comprises), ou -1.
  function indexAt(entries, pos) {
    const inside = entries.findIndex(entry => pos >= entry.from && pos < entry.to);
    return inside !== -1 ? inside : entries.findIndex(entry => pos === entry.to);
  }

  // L'entrée où aller depuis `pos` : la suivante commence après la position, la précédente avant elle ; au bout de la liste on reprend de l'autre côté. Rend l'indice, ou -1 sans entrée.
  function neighbor(entries, pos, step) {
    if (!entries.length) return -1;
    if (step > 0) {
      const next = entries.findIndex(entry => entry.from > pos);
      return next === -1 ? 0 : next;
    }
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].from < pos) return i;
    return entries.length - 1;
  }

  // Les personnes derrière les modifications : une clé (leur adresse, leur nom à défaut d'adresse, en minuscules ; vide quand on ne les connaît pas) et une couleur. Une couleur par personne
  // PRÉSENTE : celle que son identité désigne (la même pour toutes les personnes qui ouvrent le document), la suivante libre quand deux identités tombent sur la même. Dix couleurs de même
  // luminosité (4,5:1 sur la page blanche, 3:1 sur le fond du volet en clair comme en sombre) : un point de couleur ne suffit jamais seul, le nom est toujours écrit à côté.
  const PEOPLE_COLORS = ['#3374db', '#bd5a21', '#a24cdf', '#178576', '#da2e76', '#18883d', '#9d6d1c', '#6f65e4', '#1b819a', '#5e8117'];
  const personKey = author => (author ? String(author.email || author.name || '').toLowerCase() : '');
  function hashOf(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return hash;
  }
  function assignColors(keys) {
    const colors = new Map();
    const taken = new Set();
    Array.from(new Set(keys)).filter(Boolean).sort().forEach((key) => {
      let index = hashOf(key) % PEOPLE_COLORS.length;
      for (let tries = 0; tries < PEOPLE_COLORS.length && taken.has(index); tries++) index = (index + 1) % PEOPLE_COLORS.length;
      taken.add(index);
      colors.set(key, PEOPLE_COLORS[index]);
    });
    return colors;
  }
  // Les personnes d'une liste d'entrées (avec `personKey`, `author`) : [{ key, name, email, color, count, ids }], dans l'ordre alphabétique de leur nom ; les modifications sans auteur
  // connu font une dernière « personne » de clé vide. Une modification dont l'auteur n'est pas encore lu (`authorPending`) n'est de personne.
  function peopleOf(entries) {
    const people = new Map();
    entries.forEach((entry) => {
      if (entry.authorPending) return;
      const key = entry.personKey || '';
      if (!people.has(key)) people.set(key, { key, name: key ? (entry.author.name || entry.author.email) : '', email: key ? entry.author.email : '', color: entry.color || null, count: 0 });
      people.get(key).count++;
    });
    return Array.from(people.values()).sort((a, b) => (a.key === '') - (b.key === '') || a.name.localeCompare(b.name));
  }

  return { collect, indexAt, neighbor, shorten, personKey, assignColors, peopleOf };
})();
