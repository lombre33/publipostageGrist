// Commentaires : la LISTE des fils d'un document (l'onglet « Commentaires » du volet de js/track-changes-pane.js) - une entrée par fil, dans l'ordre du texte, avec le passage commenté, son état (en
// cours ou résolu), le nombre de messages, qui a ouvert le fil et le dernier mot. Script classique, chargé avant js/comments.js, qui lui donne le document et les messages (Comments.listThreads).
const CommentsList = (function () {
  const EXTRACT_MAX = 80;
  // Les espaces de largeur nulle et les retours à la ligne n'ont rien à montrer dans un extrait.
  const flat = text => text.replace(/​/g, '').replace(/\s+/g, ' ').trim();
  // Le début d'un texte, coupé à un mot près et fermé par « … » quand il est plus long.
  function shorten(text) {
    const clean = flat(text);
    if (clean.length <= EXTRACT_MAX) return clean;
    const cut = clean.slice(0, EXTRACT_MAX);
    const space = cut.lastIndexOf(' ');
    return (space > EXTRACT_MAX / 2 ? cut.slice(0, space) : cut) + '…';
  }

  // Les fils que le document porte : ceux dont une marque `commentMark` s'y trouve (un fil dont la marque est partie avec son texte n'a plus de place, ses messages restent dans la table
  // sans rien à montrer). `threads` : { [id du fil]: [{ auteur, texte, creeLe }, ...] } trié par date, comme le garde js/comments.js. Rend [{ id, from, to, resolved, quote, objects, messages,
  // count, first, last }] dans l'ordre du texte : `quote` le passage commenté (abrégé), `objects` les objets en ligne commentés sans texte (une variable, une note), `first` et `last` le premier
  // et le dernier message (null sans message : un fil que l'on est en train d'écrire, ou dont les messages ne sont pas lus).
  function collect(doc, threads) {
    const records = new Map();
    doc.descendants((node, pos) => {
      if (!node.isInline) return true;
      node.marks.forEach((mark) => {
        if (mark.type.name !== 'commentMark' || mark.attrs.id == null) return;
        const key = String(mark.attrs.id);
        if (!records.has(key)) records.set(key, { id: key, from: pos, to: pos + node.nodeSize, resolved: !!mark.attrs.resolved, text: '', end: null, objects: [] });
        const record = records.get(key);
        record.from = Math.min(record.from, pos);
        record.to = Math.max(record.to, pos + node.nodeSize);
        if (node.isText) {
          if (record.text.length < EXTRACT_MAX * 3) record.text += (record.end !== null && record.end !== pos ? ' ' : '') + node.text;
          record.end = pos + node.nodeSize;
        } else if (!record.objects.includes(node.type.name)) {
          record.objects.push(node.type.name);
        }
      });
      return true;
    });
    const known = threads || {};
    return Array.from(records.values()).sort((a, b) => a.from - b.from).map((record) => {
      const messages = known[record.id] || [];
      return {
        id: record.id, from: record.from, to: record.to, resolved: record.resolved, quote: shorten(record.text), objects: record.objects,
        messages, count: messages.length, first: messages[0] || null, last: messages[messages.length - 1] || null,
      };
    });
  }

  return { collect, shorten };
})();
