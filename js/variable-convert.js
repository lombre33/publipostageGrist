// « Convertir le texte en variables » (demande du 26/11, cartes « Où mettre le bouton » et « Table sans lien » : bouton dans le menu au survol d'« Insérer une variable », bulle orange pour une table pas encore
// liée). Du texte collé de l'extérieur (un tableau Word, un autre document) porte les noms de variables en toutes lettres, « #Projets.Total_Fonctionnement_2026 » : on sélectionne une zone, une ligne du menu
// du bouton « Insérer une variable » bascule en vraies bulles tous les textes de cette zone qui ont le bon format. Rien ne se fait tout seul, à cause des vrais hashtags (« #Budget2026 » reste du texte).
//
//  - Ce qui est reconnu est ce que reconnaît déjà le reste du widget pour un champ texte (Variables.findTextVariables) : la plus longue clé « Table.Colonne » qui existe, prolongée par les colonnes de la ligne
//    qu'une Référence désigne (« #Projets.Accompagnateur.Email »), un point de fin de phrase qui reste du texte. Une table ou une colonne qui n'existe pas : le texte reste tel quel et se compte (« colonne introuvable »).
//  - Seuls les textes ENTIÈREMENT dans la sélection sont convertis ; une sélection de cases (CellSelection) se lit case par case. Le texte d'un bloc de code, sous la marque « code » ou en suppression suivie, n'est jamais lu.
//  - La bulle posée est celle que pose la liste « # » (varBadge, avec la région du document pour une date ou un nombre, sans autre réglage), avec la mise en forme du texte remplacé (gras, couleur, lien...) ; une colonne Pièces jointes devient l'image liée
//    que la liste « # » pose pour elle (Variables.becomesImage). Une table sans lien avec la page n'ouvre aucune fenêtre : sa bulle est orange (Editor.markBadgeValidity), à lier ensuite par « Tables liées ».
//  - Une seule transaction : un Annuler défait tout. Le suivi des modifications allumé : la ligne est grisée (une bulle ne se propose pas en suppression et insertion, comme pour « Remplacer »).
//  - La ligne est grisée, avec sa raison, sans sélection ou sans rien à convertir dedans (`syncRow`) : rien ne disparaît. Une fois faite, `pp:variablesConverted` porte { converted, left } et js/main.js le dit dans le coin d'état.
const VariableConvert = (function () {
  // Le texte sous ces marques n'est jamais lu : du code, ou une suppression que le suivi n'a pas encore résolue.
  const SKIPPED_MARKS = ['code', 'deletion'];
  // Au-delà, la grisée « rien à convertir » ne balaie plus la sélection à chaque changement (toute la page sélectionnée : le clic le fera) : la ligne reste dégrisée.
  const PRESCAN_MAX = 200000;
  const WORD = /^[\p{L}\p{N}_]+/u;
  const KEY_START = /^\.[\p{L}\p{N}_]/u;

  const isSkippedText = node => node.marks.some(mark => SKIPPED_MARKS.indexOf(mark.type.name) !== -1);

  // Les suites de texte d'un bloc : { text, segments } où chaque segment dit où un morceau du texte commence dans le document. Deux textes voisins que la mise en forme sépare (« #Projets.Total_ » en
  // gras puis « Fonctionnement_2026 ») n'en font qu'une ; un nœud de la ligne (une bulle, une image) ou un texte à ne pas lire la coupe. Les nœuds en ligne qui portent du texte (une valeur conditionnelle)
  // se lisent à leur tour.
  function runsOf(parent, start, out) {
    let run = null;
    const flush = () => { if (run) out.push(run); run = null; };
    parent.forEach((child, offset) => {
      const pos = start + offset;
      if (child.isText && !isSkippedText(child)) {
        if (!run) run = { text: '', segments: [] };
        run.segments.push({ at: run.text.length, pos, len: child.text.length });
        run.text += child.text;
        return;
      }
      flush();
      if (!child.isText && child.isInline && !child.isAtom && child.content.size) runsOf(child, pos + 1, out);
    });
    flush();
  }
  // La position du document du signe `index` du texte d'une suite (index = longueur du texte : sa fin).
  function posAt(run, index) {
    for (const segment of run.segments) if (index <= segment.at + segment.len) return segment.pos + (index - segment.at);
    return null;
  }

  // Les parties non vides de la sélection : une par case pour une sélection de cases, une seule sinon.
  const rangesOf = state => state.selection.ranges.map(range => ({ from: range.$from.pos, to: range.$to.pos })).filter(range => range.to > range.from);

  // Toutes les suites de texte des blocs que touche la sélection, dans l'ordre où le document les rencontre.
  function runsIn(doc, ranges) {
    const seen = new Set();
    const runs = [];
    ranges.forEach(({ from, to }) => {
      doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.spec.code) return false;
        if (!node.inlineContent) return true;
        if (!seen.has(pos)) { seen.add(pos); runsOf(node, pos + 1, runs); }
        return false;
      });
    });
    return runs;
  }

  // Le texte qui a la forme d'une clé, « #Table.… », d'une table qui existe mais dont la colonne n'existe pas : il reste du texte, et la phrase du coin d'état le compte. Un hashtag
  // ordinaire (« #Budget2026 ») ou une adresse (« page#partie.2 ») n'a pas de table de ce nom : jamais compté.
  function leftIn(run, found, ranges) {
    const trigger = Variables.triggerChar();
    const tables = GristAPI.getTables();
    let count = 0;
    for (let at = run.text.indexOf(trigger); at !== -1; at = run.text.indexOf(trigger, at + 1)) {
      if (found.some(variable => at >= variable.start && at < variable.end)) continue;
      const pos = posAt(run, at);
      if (!ranges.some(range => pos >= range.from && pos < range.to)) continue;
      const rest = run.text.slice(at + 1);
      const word = WORD.exec(rest);
      if (word && tables.indexOf(word[0]) !== -1 && KEY_START.test(rest.slice(word[0].length))) count += 1;
    }
    return count;
  }

  // Ce qu'une conversion ferait : { matches: [{ from, to, table, column, key }] dans l'ordre du document, left : textes de forme « #Table.Colonne » restés tels quels }.
  function scanNow(state) {
    const ranges = rangesOf(state);
    const matches = [];
    let left = 0;
    runsIn(state.doc, ranges).forEach(run => {
      const found = Variables.findTextVariables(run.text);
      found.forEach(variable => {
        const from = posAt(run, variable.start);
        const to = posAt(run, variable.end);
        if (from == null || to == null || !ranges.some(range => from >= range.from && to <= range.to)) return;
        matches.push({ from, to, table: variable.table, column: variable.column, key: run.text.slice(variable.start + 1, variable.end) });
      });
      left += leftIn(run, found, ranges);
    });
    matches.sort((a, b) => a.from - b.from);
    return { matches, left };
  }

  // Le même balayage pour la grisée, gardé tant que le document, la sélection et les colonnes sont les mêmes : la barre se relit à chaque changement de sélection.
  let memo = null;
  function scan(state) {
    const ranges = rangesOf(state);
    const size = ranges.reduce((total, range) => total + range.to - range.from, 0);
    if (size > PRESCAN_MAX) return { matches: null, left: 0 };
    const key = ranges.map(range => range.from + '-' + range.to).join(',') + '|' + GristAPI.getAllVariables().length + '|' + Variables.triggerChar();
    if (memo && memo.doc === state.doc && memo.key === key) return memo.result;
    const result = scanNow(state);
    memo = { doc: state.doc, key, result };
    return result;
  }

  const trackingOn = () => typeof Editor !== 'undefined' && !!Editor.isTrackChangesOn && Editor.isTrackChangesOn();

  // `locked` : la clé de la raison du grisé, ou null.
  function status(editor) {
    if (!editor || !editor.state) return { locked: 'varConvert.nothing' };
    const state = editor.state;
    if (!rangesOf(state).length) return { locked: 'varConvert.noSelection' };
    if (trackingOn()) return { locked: 'varConvert.tracking' };
    const found = scan(state);
    if (found.matches && !found.matches.length) return { locked: 'varConvert.nothing' };
    return { locked: null };
  }

  // La ligne du menu à l'état de la sélection : grisée par aria-disabled et `v2-hover-row-disabled`, avec sa raison pour info-bulle (comme « Paragraphe… »).
  function syncRow(row, editor) {
    if (!row || !editor) return;
    const s = status(editor);
    row.setAttribute('aria-disabled', s.locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!s.locked);
    row.tabIndex = s.locked ? -1 : 0;
    if (s.locked) { row.title = I18n.t(s.locked); row.setAttribute('data-pp-bar-reason', s.locked); } else { row.removeAttribute('title'); row.removeAttribute('data-pp-bar-reason'); }
  }

  // Le nœud qui prend la place du texte `match`, ou null quand l'endroit ne l'accepte pas. La bulle garde les marques du premier signe remplacé (une marque de lien n'est pas « inclusive », insertContent la
  // perdrait) ; une colonne Pièces jointes devient l'image que la liste « # » pose.
  function nodeFor(editor, doc, match) {
    const item = { table: match.table, column: match.column, key: match.key };
    const image = Variables.becomesImage(editor, item);
    const type = image ? doc.type.schema.nodes.editorImage : doc.type.schema.nodes.varBadge;
    if (!type) return null;
    const $from = doc.resolve(match.from);
    const $to = doc.resolve(match.to);
    if (!$from.sameParent($to) || !$from.parent.canReplaceWith($from.index(), $to.indexAfter(), type)) return null;
    if (image) return type.create(Variables.attachmentImageNode(item).attrs);
    const after = $from.nodeAfter;
    const marks = after && after.isText ? $from.parent.type.allowedMarks(after.marks.filter(mark => SKIPPED_MARKS.indexOf(mark.type.name) === -1)) : [];
    return type.create(Object.assign({ table: match.table, column: match.column, key: match.key }, Variables.bubbleStamp(editor, item)), null, marks);
  }

  // Convertit la sélection, en une transaction. Rend { converted, left } (`left` : les textes de forme « #Table.Colonne » restés tels quels, colonne introuvable, plus ceux que leur endroit refuse), ou null sans
  // rien changer quand la ligne est grisée.
  function run(editor) {
    if (!editor || !editor.isEditable || status(editor).locked) return null;
    const state = editor.state;
    const { matches, left } = scanNow(state);
    const tr = state.tr;
    let converted = 0;
    let refused = 0;
    for (let i = matches.length - 1; i >= 0; i--) {
      const node = nodeFor(editor, state.doc, matches[i]);
      if (!node) { refused += 1; continue; }
      tr.replaceWith(matches[i].from, matches[i].to, node);
      converted += 1;
    }
    if (!converted) return null;
    editor.view.dispatch(tr);
    editor.view.focus();
    const result = { converted, left: left + refused };
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('pp:variablesConverted', { detail: result }));
    return result;
  }

  return { status, syncRow, run, scanNow };
})();
