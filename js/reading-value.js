// « Quelle valeur je lis ? » (demande du 17/11 : « lorsque j'ai une liste et un export par valeur, ai-je une solution en mode lecture pour passer au suivant/précédent ? ») : quand une variable de liste est réglée
// « Un document par valeur » (js/list-split.js), l'export sort un document par valeur de la liste ; la Lecture, elle, écrivait la liste entière. Elle montre maintenant, pour une ligne qui fait plusieurs documents,
// le document d'UNE valeur - celui que l'export sortira, la bulle réglée écrit sa k-ième valeur, les en-têtes et pieds de page aussi (ListSplit.pin et ListSplit.pinHeaderFooter, les mêmes appels que l'export) - et
// une seconde pastille « ‹ Santé · valeur 1 sur 2 › » passe à la valeur d'avant ou d'après, à côté de la pastille des lignes (js/reading-line.js). Elle ne montre qu'une ligne qui fait au moins deux documents :
// une liste d'une seule valeur ou vide, un modèle sans bulle réglée ainsi, ne changent rien (rien n'est lu de plus, la Lecture écrit la liste comme elle est réglée). Plusieurs listes réglées sur des colonnes différentes
// font un document par combinaison : la pastille compte alors des documents (« document 4 sur 6 »).
// La valeur lue est celle de la ligne : une autre ligne ou un autre modèle repart de la première ; un nouveau rendu de la même ligne (une cellule changée dans Grist) garde la valeur, si elle existe encore.
// Elle n'est jamais dans le document, ni dans le PDF, ni à l'impression, et la Lecture épurée ne la montre pas (mêmes règles que la pastille des lignes : css/page-zoom.css). Affichage seulement : rien n'est écrit.
//  ReadingValue.turn(...) : le rendu de la Lecture (js/main-reader.js) y passe son HTML ; ReadingValue.refresh() montre ou cache la pastille après un rendu, un changement de ligne ou de mode ;
//  ReadingValue.clear() quand la Lecture ne montre pas un document de la ligne (PDF à l'écran, e-mail, aucune ligne).
const ReadingValue = (function () {
  const QUIET = 'is-quiet';
  const QUIET_MS = 900;   // le temps qu'elle reste transparente après le dernier défilement
  const NAME_MAX = 18;
  const GAP = 4;
  const ZOOM_RESERVE = 64; // la place que garde la pastille de zoom, dans le coin bas droit de la zone de lecture
  let host = null;
  let chip = null;
  let label = null;
  let prev = null;
  let next = null;
  let quietTimer = 0;
  let turns = 0;          // un rendu à la fois : le plus récent gagne
  let shown = null;       // ce que le dernier rendu montre : { index, count, label, many } ; null = un seul document
  let picked = { key: '', index: 0 }; // la valeur choisie, pour la ligne et le modèle de `key`

  const shorten = text => (text.length > NAME_MAX ? text.slice(0, NAME_MAX - 1).trimEnd() + '…' : text);

  // Le rendu de la Lecture pour une ligne : `turn.pin(html)` rend le HTML de la valeur lue (le même, sans plan, quand la ligne fait un seul document) et `turn.headerFooterData()` les en-têtes et pieds de
  // page de cette valeur (à lire après `pin`). `key` dit de quelle ligne et de quel modèle il s'agit : une autre ligne repart de la première valeur. Le plan lit des tables de Grist : `pin` est appelée dans le
  // passage de lecture du rendu (ReaderMode.render), comme le HTML d'un macro-modèle.
  function turn(tableId, record, headerFooterData, key) {
    const mine = ++turns;
    let variant = null;
    return {
      async pin(html) {
        const parts = ListSplit.partsOf(html, headerFooterData);
        variant = null;
        if (!ListSplit.hasMarker(parts)) { if (mine === turns) shown = null; return html; }
        let plan = null;
        try { plan = await ListSplit.plan(parts, tableId, record); }
        catch (e) { console.error('[ReadingValue] plan « un document par valeur » impossible', e); }
        if (!plan || plan.variants.length < 2) { if (mine === turns) shown = null; return html; }
        const count = plan.variants.length;
        const index = Math.max(0, Math.min(picked.key === key ? picked.index : 0, count - 1));
        variant = plan.variants[index];
        if (mine === turns) {
          picked = { key, index };
          shown = { index, count, label: variant.label, many: plan.groups.filter(group => group.texts.length > 0).length > 1 };
        }
        return ListSplit.pin(html, variant);
      },
      headerFooterData: () => (variant ? ListSplit.pinHeaderFooter(headerFooterData, variant) : headerFooterData),
    };
  }

  // La Lecture ne montre pas un document de la ligne : plus de valeur à nommer, et un rendu en cours n'en posera plus.
  function clear() {
    turns++;
    shown = null;
    refresh();
  }

  function hide() { if (chip) chip.hidden = true; }

  // À côté de la pastille des lignes quand elle est là et qu'il reste de la place avant le coin du zoom, sinon juste au-dessus ; dans le coin quand elle est cachée.
  function place(container) {
    const at = ReadingLine.slot(container);
    const line = document.getElementById('pp-reading-line');
    let left = at.left;
    let bottom = at.bottom;
    if (line && !line.hidden && line.getClientRects().length > 0) {
      const lineBox = line.getBoundingClientRect();
      if (lineBox.right + GAP + chip.offsetWidth <= container.getBoundingClientRect().right - ZOOM_RESERVE) left = Math.round(lineBox.right + GAP);
      else bottom = Math.round(at.bottom + line.offsetHeight + GAP);
    }
    chip.style.left = left + 'px';
    chip.style.bottom = bottom + 'px';
  }

  function show(container) {
    const name = shown.label;
    const position = I18n.t(shown.many ? 'readingValue.positionMany' : 'readingValue.position', { n: shown.index + 1, total: shown.count });
    const text = name ? shorten(name) + ' · ' + position : position;
    if (label.textContent !== text) label.textContent = text;
    chip.title = (name ? name + ' · ' + position : position) + '\n' + I18n.t('readingValue.hint');
    chip.setAttribute('aria-label', name ? name + ' · ' + position : position);
    prev.disabled = shown.index <= 0;
    next.disabled = shown.index >= shown.count - 1;
    chip.hidden = false;
    place(container);
  }

  // Montre ou cache la pastille d'après ce que la Lecture affiche : un document de plusieurs valeurs, dans la zone de lecture visible.
  function refresh() {
    if (!chip) return;
    const container = document.getElementById('reader-container');
    const reading = !!container && container.getClientRects().length > 0;
    if (!reading || !shown) { hide(); return; }
    show(container);
  }

  async function step(delta) {
    if (!shown) return;
    const index = picked.index + delta;
    if (index < 0 || index >= shown.count) return;
    picked = { key: picked.key, index };
    try { await host.rerender(); }
    catch (e) {
      console.error('[ReadingValue] la Lecture n’a pas pu changer de valeur', e);
      host.setStatus(I18n.t('readingValue.failed'), true);
    }
  }

  // Elle s'efface presque pendant que le document défile (et ne gêne plus aucun clic), puis revient.
  function onScroll() {
    chip.classList.add(QUIET);
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => chip.classList.remove(QUIET), QUIET_MS);
  }

  function makeButton(icon, key, delta) {
    const button = Dom.button('pp-reading-line-btn');
    Dom.setMarkup(button, Icons.svg(icon));
    button.setAttribute('aria-label', I18n.t(key));
    button.title = I18n.t(key);
    button.addEventListener('click', () => step(delta));
    return button;
  }

  // `options` : { rerender, setStatus } - `rerender()` redessine la Lecture de la ligne (js/main-reader.js:renderReader) ; `setStatus(texte, erreur)` le coin d'état.
  function wire(options) {
    if (chip) return;
    host = options;
    chip = Dom.el('div', 'pp-reading-line pp-reading-value');
    chip.id = 'pp-reading-value';
    chip.setAttribute('role', 'group');
    chip.hidden = true;
    prev = makeButton('chevronLeft', 'readingValue.prev', -1);
    label = Dom.el('span', 'pp-reading-line-label');
    next = makeButton('chevronRight', 'readingValue.next', 1);
    chip.append(prev, label, next);
    document.body.appendChild(chip);
    const container = document.getElementById('reader-container');
    if (container) container.addEventListener('scroll', onScroll, { passive: true });
    if (typeof ResizeObserver === 'function') {
      const watched = new ResizeObserver(() => { const box = document.getElementById('reader-container'); if (!chip.hidden && box) place(box); });
      if (container) watched.observe(container);
      const line = document.getElementById('pp-reading-line');
      if (line) watched.observe(line); // son nom change de largeur d'une ligne à l'autre, et elle se cache ou se montre : la place d'à côté bouge
    }
  }

  return { wire, turn, clear, refresh };
})();
