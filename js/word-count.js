// Le compteur « 35 mots · 206 signes · 1 page » (audit « confort d'usage » du 12/11, idée 10) : une petite pastille discrète, en bas à gauche du document, qui compte ce que la personne a écrit. Cachée au départ : une case de
// Réglages > Thème > Saisie l'allume (préférence de ce navigateur, PersonStore `pp_word_count`). Affichage seulement : rien n'est écrit dans le document, rien d'ajouté à la mise en page.
//  - les mots et les signes (espaces comprises) sont ceux du TEXTE du modèle, tel qu'il est écrit : une bulle de variable compte pour un mot et aucun signe (sa valeur n'est connue qu'en Lecture) ;
//  - les pages sont celles de l'aperçu A4 (une de plus que de coutures, js/page-chip.js:pageOf) ; sans aperçu, le compteur ne dit pas les pages ;
//  - en Édition seulement ; elle se met à jour une demi-seconde après la dernière frappe ou le dernier changement de pagination.
const WordCount = (function () {
  const STORAGE = 'pp_word_count';
  const LEAF = '\u0001'; // une bulle, un atome : un mot, aucun signe
  const DELAY_MS = 500;
  const GAP = 3;
  let enabled = false;
  let chip = null;
  let editor = null;
  let timer = 0;

  const readEnabled = () => PersonStore.get(STORAGE) === 'on';
  const isOn = () => enabled;
  function setOn(on) {
    const kept = PersonStore.set(STORAGE, on ? 'on' : 'off');
    enabled = readEnabled();
    refresh();
    return kept;
  }

  // { words, signs } du texte de l'éditeur : les blocs séparés par un saut de ligne (qui ne compte pas comme un signe).
  function countText(text) {
    const words = text.replace(new RegExp(LEAF, 'g'), ' x ').split(/\s+/).filter(Boolean).length;
    const signs = text.replace(new RegExp('[' + LEAF + '\\n]', 'g'), '').length;
    return { words, signs };
  }
  function measure() {
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', LEAF);
    return countText(text);
  }

  function label(words, signs, pages) {
    const parts = [
      I18n.t('wordCount.words', { n: words }),
      I18n.t('wordCount.signs', { n: signs }),
    ];
    if (pages) parts.push(I18n.t('wordCount.pages', { n: pages }));
    return parts.join(' · ');
  }

  function place(container) {
    const box = container.getBoundingClientRect();
    const root = document.documentElement;
    chip.style.left = Math.round(box.left + container.clientLeft + GAP + 5) + 'px';
    chip.style.bottom = Math.round(root.clientHeight - (box.top + container.clientTop + container.clientHeight) + GAP + (container.offsetHeight - container.clientHeight - container.clientTop * 2)) + 'px';
  }

  function refresh() {
    clearTimeout(timer);
    timer = 0;
    if (!chip || !editor) return;
    const container = document.getElementById('editor-container');
    const showing = enabled && !!container && container.getClientRects().length > 0 && !editor.isDestroyed;
    chip.hidden = !showing;
    if (!showing) return;
    const { words, signs } = measure();
    const sheet = container.classList.contains('a4-preview');
    const pages = sheet ? container.querySelectorAll('.v2-page-seam-divider').length + 1 : 0;
    const text = label(words, signs, pages);
    if (chip.textContent !== text) chip.textContent = text;
    place(container);
  }
  function schedule() {
    if (!enabled || timer) return;
    timer = setTimeout(refresh, DELAY_MS);
  }

  function wire(tiptap) {
    if (chip) return;
    editor = tiptap;
    enabled = readEnabled();
    chip = Dom.el('div', 'pp-word-count');
    chip.id = 'pp-word-count';
    chip.setAttribute('role', 'status'); // lu à la demande (pas annoncé : aria-live éteint) : un repère nommé pour l'audit
    chip.setAttribute('aria-live', 'off');
    chip.hidden = true;
    document.body.appendChild(chip);
    editor.on('update', schedule);
    const container = document.getElementById('editor-container');
    if (container) {
      // Les coutures de la pagination se refont à chaque changement de mise en page : le nombre de pages suit, une demi-seconde plus tard.
      if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe(container, { childList: true, subtree: true });
      if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(container);
    }
    // Édition <-> Lecture : le compteur ne se montre qu'en Édition.
    ['btn-mode-edit', 'btn-mode-read'].forEach(id => { const button = document.getElementById(id); if (button) button.addEventListener('click', () => setTimeout(refresh, 300)); });
    refresh();
  }

  return { wire, isOn, setOn, refresh, countText };
})();
