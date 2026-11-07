// Mise en forme conditionnelle (demande du 05/11) : une variable, un calcul, une puce (date, heure, email, nom, n° de ligne), un bloc de texte conditionnel ou une valeur dans la phrase prend une couleur de
// texte, un fond, du gras, de l'italique, du souligné ou du barré selon la ligne affichée - « en rouge quand le montant dépasse 1 000 ». Le réglage est facultatif :
// sans lui, rien ne change dans la lecture ni dans les exports.
//
// Il vit dans l'attribut `condStyle` du nœud (`data-cond-style` dans le HTML enregistré) : { rules: [{ condition, style }] }. `condition` est celle d'une bulle ({ mode,
// rules }, js/condition-rules.js, mêmes lignes Colonne / Opérateur / Valeur et mêmes groupes) ; `style` : { color, fill, bold, italic, underline, strike } - couleurs en
// « #rrggbb », indicateurs à vrai (un indicateur faux ne s'écrit pas). Les règles se lisent dans l'ordre, comme celles de Grist : la couleur du texte et le fond de la
// dernière règle vraie l'emportent, le gras, l'italique, le souligné et le barré s'additionnent.
//
// « Comme dans Grist » (variables seulement) : `grist: true` dans le même réglage - { grist: true, rules: […] }. La bulle suit alors, EN DIRECT, la mise en forme conditionnelle de sa
// colonne dans Grist (GristAPI.getColumnConditionalRules : chaque règle de la colonne, dans l'ordre, avec le style qu'elle pose ; le verdict d'une ligne est lu dans la colonne
// d'aide de la règle, `gristHelper_ConditionalRule…`, que Grist calcule lui-même - ses formules sont du Python, le widget ne les rejoue pas). Les règles de Grist passent d'abord,
// celles du widget par-dessus : la couleur et le fond des secondes l'emportent, les traits s'additionnent. Une bulle qui lit plusieurs lignes (table liée en « plusieurs »,
// liste de références) n'a pas de mise en forme de Grist : une seule mise en forme ne dirait rien de chaque valeur. Ne sont pas reprises : la mise en forme conditionnelle
// d'un champ de la vue (réglage propre à une page de Grist), les couleurs des choix d'une colonne Choix, le style de base de la colonne.
//
// Résolution : js/reader-mode.js appelle `prepare` une fois, avant les conditions d'affichage des blocs, des valeurs et des cases - la Lecture, le PDF, le Word, l'Excel, le
// HTML, l'e-mail et les en-têtes et pieds passent donc tous par là. Un bloc ou une valeur dont la condition d'affichage est remplie garde sa mise en forme : son contenu est
// enveloppé de <span style="…"> (le style en ligne que lisent le PDF, le Word et l'Excel, comme pour un texte coloré) avant que le cadre soit défait. Une bulle de variable ou de
// calcul est remplacée par sa valeur : `prepare` pose le style sur la bulle (`data-pp-cond-css`) et `carry` l'enveloppe autour de la valeur écrite (ReaderMode.putValue) - une
// valeur qui n'écrit rien (bulle masquée, vide) n'est pas enveloppée, les espaces autour d'elle se règlent comme avant (js/space-gap.js).
const ConditionalStyle = (function () {
  const ATTR = 'data-cond-style';
  // Le style calculé pour la ligne, posé sur la bulle par `prepare` et lu par `carry` : jamais enregistré, il n'existe que dans le HTML en cours de résolution.
  const COMPUTED_ATTR = 'data-pp-cond-css';
  // Au plus ce nombre de règles par élément : une fenêtre de 700 × 400 ne montre pas davantage sans que la liste devienne un tableau de bord.
  const MAX_RULES = 8;
  const FLAGS = ['bold', 'italic', 'underline', 'strike'];
  // Une case de tableau et une ligne : le réglage d'une ligne vaut pour chacune de ses cases (`prepare`), celui d'une case passe par-dessus.
  const CELL_SELECTOR = 'td, th';
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  // Les éléments dont le contenu contient d'autres blocs : leur mise en forme descend jusqu'au texte (`dress`).
  const CONTAINER_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'DIV', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION',
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'SECTION']);

  // Un style réduit à ce que le widget sait écrire : couleurs valides en minuscules, indicateurs vrais ; null sans rien à écrire.
  function cleanStyle(style) {
    if (!style || typeof style !== 'object') return null;
    const clean = {};
    ['color', 'fill'].forEach(key => { if (typeof style[key] === 'string' && HEX_COLOR.test(style[key])) clean[key] = style[key].toLowerCase(); });
    FLAGS.forEach(key => { if (style[key] === true) clean[key] = true; });
    return Object.keys(clean).length ? clean : null;
  }

  // Le réglage sous sa forme enregistrée : une copie neuve, sans les règles dont la condition n'a aucune ligne complète ou dont le style est vide, au plus MAX_RULES, avec
  // `grist: true` quand « Comme dans Grist » est coché ; null quand il n'en reste rien.
  function normalize(spec) {
    const source = spec && Array.isArray(spec.rules) ? spec.rules : [];
    const rules = [];
    for (const rule of source) {
      const condition = ConditionRules.plainCondition(rule && rule.condition);
      const style = cleanStyle(rule && rule.style);
      if (condition && style && rules.length < MAX_RULES) rules.push({ condition, style });
    }
    if (spec && spec.grist === true) return { grist: true, rules };
    return rules.length ? { rules } : null;
  }

  // Le réglage d'un attribut JSON (`data-cond-style`), null s'il manque, n'est pas lisible ou ne garde aucune règle.
  function parse(raw) {
    if (!raw) return null;
    try { return normalize(JSON.parse(raw)); } catch (e) { return null; }
  }

  // Les styles des règles vraies, dans l'ordre, en un seul : comme Grist (CombinedStyle), la couleur et le fond d'une règle plus loin dans la liste prennent la place
  // de ceux des précédentes, les indicateurs s'additionnent. null sans style.
  function combine(styles) {
    const out = {};
    styles.forEach(style => {
      if (!style) return;
      if (style.color) out.color = style.color;
      if (style.fill) out.fill = style.fill;
      FLAGS.forEach(key => { if (style[key]) out[key] = true; });
    });
    return Object.keys(out).length ? out : null;
  }

  // Le style en ligne d'un style : ce que lisent la Lecture, le PDF, le Word, l'Excel et le HTML (couleur, fond, gras, italique, soulignement et barré).
  function cssOf(style) {
    if (!style) return '';
    const parts = [];
    if (style.color) parts.push('color:' + style.color);
    if (style.fill) parts.push('background-color:' + style.fill);
    if (style.bold) parts.push('font-weight:bold');
    if (style.italic) parts.push('font-style:italic');
    const lines = [];
    if (style.underline) lines.push('underline');
    if (style.strike) lines.push('line-through');
    if (lines.length) parts.push('text-decoration:' + lines.join(' '));
    return parts.join(';');
  }

  // Les règles de `spec` (la forme de `normalize`) lues pour la ligne `record`, en parallèle : { verdicts, style } - `verdicts[i]` vrai quand la règle i est remplie (une
  // condition illisible ou en erreur ne l'est pas), `style` ce que donnent les règles remplies une fois combinées (null sans règle remplie). `opts` : celles de
  // ConditionRules.conditionHolds (`loop`, `fetchRows`).
  async function evaluate(spec, tableId, record, opts) {
    const rules = spec ? spec.rules : [];
    const verdicts = await Promise.all(rules.map(async rule => {
      try { return await ConditionRules.conditionHolds(rule.condition, tableId, record, opts); }
      catch (e) { console.error('[ConditionalStyle] échec de l\'évaluation d\'une règle de mise en forme', e); return false; }
    }));
    return { verdicts, style: combine(rules.filter((rule, at) => verdicts[at]).map(rule => rule.style)) };
  }

  // Les règles de Grist de la colonne où mène la colonne `path` d'une bulle (« Colonne » ou « Référence.Colonne ») à partir de `table` : [{ helper, style }], null quand cette
  // colonne n'a aucune mise en forme conditionnelle dans Grist (ou que le chemin ne mène nulle part).
  function gristRulesOf(table, path) {
    const end = GristAPI.resolveColumnPath(table, path);
    return (end && GristAPI.getColumnConditionalRules(end.table, end.column)) || null;
  }

  // La mise en forme de Grist de la bulle `table` / `path` pour la ligne `record` : { rules, verdicts, style, why }. `rules` : celles de Grist (null sans règle) ; `verdicts[i]`
  // vrai quand la règle i est remplie sur la ligne ; `style` : leur combinaison (null sans règle remplie) ; `why` : 'multi' quand la bulle lit plusieurs lignes, 'noRow' quand
  // aucune ligne n'est liée, 'failed' quand la ligne ne se lit pas - toujours sans style, jamais d'exception. `opts` : celles de Variables.resolveRows (`loop`, `fetchRows`).
  async function gristStyleOf(table, path, tableId, record, opts) {
    const rules = gristRulesOf(table, path);
    const none = why => ({ rules, verdicts: [], style: null, why });
    if (!rules || !record) return none(null);
    try {
      const hops = String(path).split('.');
      hops.pop();
      const found = await Variables.resolveRows(table, hops, tableId, record, opts);
      if (found.error) return none('failed');
      if (found.multi) return none('multi');
      const row = found.rows[0];
      if (!row) return none('noRow');
      const verdicts = rules.map(rule => row[rule.helper] === true);
      return { rules, verdicts, style: combine(rules.filter((rule, at) => verdicts[at]).map(rule => rule.style)), why: null };
    } catch (e) {
      console.error('[ConditionalStyle] échec de la lecture de la mise en forme de Grist', e);
      return none('failed');
    }
  }

  // Le style que donne `spec` à la bulle / au bloc pour la ligne `record` : { style, verdicts (ceux des règles du widget), grist (gristStyleOf, null sans « Comme dans Grist ») }.
  // `source` : { table, column } d'une bulle de variable, null pour tout le reste (« Comme dans Grist » n'a de sens que sur une variable). Grist d'abord, les règles du widget
  // par-dessus (combine).
  async function resolve(spec, source, tableId, record, opts) {
    const grist = spec.grist && source && source.table && source.column ? await gristStyleOf(source.table, source.column, tableId, record, opts) : null;
    const own = await evaluate(spec, tableId, record, opts);
    return { style: combine([grist && grist.style, own.style]), verdicts: own.verdicts, grist };
  }

  // Le style que prend l'élément `el` pour la ligne `record` : la ligne du tour d'une zone répétée est celle que lit une condition (LoopRules.bindingOf). null quand
  // aucune règle n'est vraie.
  async function styleFor(el, tableId, record) {
    const spec = parse(el.getAttribute(ATTR));
    if (!spec) return null;
    const binding = LoopRules.bindingOf(el);
    return (await resolve(spec, sourceElement(el), tableId, record, binding ? { loop: binding } : undefined)).style;
  }

  // La variable que « Comme dans Grist » suit pour `el` : la bulle elle-même, ou la PREMIÈRE bulle de variable d'une case de tableau (une ligne n'en a pas : la mise en forme de
  // Grist est celle d'une colonne, une ligne en lit plusieurs). null sinon.
  function sourceElement(el) {
    const badge = el.matches('.var-badge') ? el : (el.matches(CELL_SELECTOR) ? el.querySelector('.var-badge') : null);
    return badge ? { table: badge.getAttribute('data-table'), column: badge.getAttribute('data-column') } : null;
  }

  // Enveloppe le contenu de `el` dans un <span style> : chaque suite de texte et d'éléments en ligne qui se touchent, à tous les étages (un paragraphe, un élément de
  // liste, une case de tableau). Une suite que d'espaces n'est pas enveloppée.
  function dress(el, css) {
    const doc = el.ownerDocument;
    let run = [];
    const flush = () => {
      if (run.some(node => node.nodeType === 1 || (node.textContent || '').trim() !== '')) {
        const span = doc.createElement('span');
        span.setAttribute('style', css);
        run[0].before(span);
        run.forEach(node => span.appendChild(node));
      }
      run = [];
    };
    Array.from(el.childNodes).forEach(child => {
      if (child.nodeType === 1 && CONTAINER_TAGS.has(child.tagName)) { flush(); dress(child, css); } else run.push(child);
    });
    flush();
  }

  // Pose le style `style` sur une case de tableau : le fond remplit toute la case (le style en ligne `background-color` que lisent la Lecture et les exports, à la place du fond posé à la
  // main), la couleur et les traits suivent le texte (`dress`) - une couleur posée à la main sur un mot reste la sienne, le span de la règle est autour d'elle.
  function dressCell(cell, style) {
    if (!style) return;
    if (style.fill) cell.style.backgroundColor = style.fill;
    const css = cssOf(Object.assign({}, style, { fill: null }));
    if (css) dress(cell, css);
  }

  // Calcule la mise en forme de chaque élément de `root` qui en a une et la pose : sur la bulle (variable ou calcul) pour `carry`, autour du contenu pour un bloc et une valeur
  // conditionnels, sur la case pour une case de tableau, et sur chaque case d'une ligne (la ligne d'abord, la règle de la case par-dessus : elle est plus précise). À appeler avant la
  // résolution des blocs et des valeurs (js/reader-mode.js:resolveConditionalNodes) : leur cadre en est encore là.
  async function prepare(root, tableId, record) {
    if (!root) return;
    const elements = Array.from(root.querySelectorAll('[' + ATTR + ']'));
    if (!elements.length) return;
    const styles = await Promise.all(elements.map(el => styleFor(el, tableId, record)));
    const cells = new Map();
    const slot = cell => { if (!cells.has(cell)) cells.set(cell, {}); return cells.get(cell); };
    elements.forEach((el, at) => {
      if (el.matches('tr')) { Array.from(el.children).filter(child => child.matches(CELL_SELECTOR)).forEach(cell => { slot(cell).row = styles[at]; }); return; }
      if (el.matches(CELL_SELECTOR)) { slot(el).own = styles[at]; return; }
      const css = cssOf(styles[at]);
      if (!css) return;
      if (el.matches('.var-badge, .calc-badge, .smart-chip, .mention-chip')) el.setAttribute(COMPUTED_ATTR, css);
      else dress(el, css);
    });
    cells.forEach((found, cell) => dressCell(cell, combine([found.row, found.own])));
  }

  // La valeur `node` qui prend la place de `badge` : enveloppée de la mise en forme que `prepare` a calculée pour la bulle, sauf si elle n'écrit rien. Rend le nœud à poser.
  function carry(badge, node) {
    const css = badge.getAttribute && badge.getAttribute(COMPUTED_ATTR);
    if (!css || !node) return node;
    const writes = node.nodeType === 1 ? (node.textContent.trim() !== '' || !!node.querySelector('img')) : (node.textContent || '').trim() !== '';
    if (!writes) return node;
    const span = badge.ownerDocument.createElement('span');
    span.setAttribute('style', css);
    span.appendChild(node);
    return span;
  }

  // Les réglages qui citent une colonne (les conditions de chaque règle), pour que le suivi des renommages de Grist (js/schema-renames.js) les lise : une copie de `spec`
  // dont chaque condition est passée par `map(condition)` -> { condition, count }. Rend { spec, count } ; le même objet quand rien n'a changé.
  function rewriteConditions(spec, map) {
    if (!spec || !Array.isArray(spec.rules)) return { spec, count: 0 };
    let count = 0;
    const rules = spec.rules.map(rule => {
      if (!rule || !rule.condition) return rule;
      const next = map(rule.condition);
      count += next.count;
      return next.count ? Object.assign({}, rule, { condition: next.condition }) : rule;
    });
    return count ? { spec: Object.assign({}, spec, { rules }), count } : { spec, count: 0 };
  }

  // Vrai quand le réglage a au moins une règle complète ou « Comme dans Grist » coché (le bouton de la barre s'allume).
  const isSet = spec => !!normalize(spec);

  return { ATTR, MAX_RULES, FLAGS, normalize, cleanStyle, parse, combine, cssOf, evaluate, gristRulesOf, gristStyleOf, resolve, styleFor, prepare, carry, rewriteConditions, isSet };
})();
