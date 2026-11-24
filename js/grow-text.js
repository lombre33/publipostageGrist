// Le champ texte d'UNE ligne qui grandit au clic quand son texte ne tient plus (demande du 24/11 : « champs titre PDF à agrandir au clic comme les emails. À généraliser sur les champs
// similaires », réponse à la carte : « Oui, tous ces champs ») : le texte du QR code (js/qr-code.js), la formule d'un calcul (js/variable-calc.js) et celle du tableau croisé (js/pivot-window.js), qui sont des
// champs de saisie simple (la liste « # » de js/variables.js : `initFilenameInput`), pas des champs à bulles (js/field-editor.js, dont le nom du PDF et les champs des fenêtres de condition et de boucle suivent la même règle).
//
//   GrowText.create(className)             une zone de texte (<textarea>) prête : une ligne, la classe `className` en plus de `pp-grow-text` ;
//   GrowText.attach(textarea, { lines })   le même comportement sur une zone de texte que l'appelant a créée (`VariableModal.labelledInput(…, 'textarea')`) ;
//   GrowText.refresh(textarea)             à rappeler quand l'appelant a posé `value` lui-même (la fenêtre qui s'ouvre sur un texte déjà réglé).
//
// Fermé - sans le focus, ou texte qui tient - le champ est ce qu'était l'<input> : une ligne de 30 px où le texte ne passe pas à la ligne et montre son début. Avec le focus ET un texte qui ne tient plus sur la
// ligne, il passe sur plusieurs lignes (cinq au plus, puis il défile) : la fenêtre qui le porte défile, ce qui est dessous descend. Il ne porte jamais de retour à la ligne : Entrée, que la fenêtre prend pour valider,
// n'en pose pas, et un texte collé les perd. Les règles de dessin sont dans css/field-editor.css (« Le champ de saisie simple qui s'agrandit »).
//
// `{ lines: true }` (demande du 24/11 : un retour à la ligne dans « Texte avant » / « Texte après » et dans les séparateurs d'une liste ou d'une boucle) : le champ garde ses règles, mais
// MAJ+ENTRÉE y pose un retour à la ligne (un « \n » dans la valeur) ; Entrée seule n'en pose toujours pas, et un texte collé garde les siens. Un champ qui en porte un reste ouvert, même sans le
// focus : un second texte caché sur une ligne fermée ne se verrait pas.
const GrowText = (function () {
  const MAX_HEIGHT = 110; // cinq lignes de 20 px, 8 px de marge intérieure et la bordure ; au-delà, le champ défile

  function attach(box, options) {
    if (!box || box.dataset.growText) return box;
    box.dataset.growText = '1';
    const lines = !!(options && options.lines);
    box.classList.add('pp-grow-text');
    box.rows = 1;
    box.setAttribute('aria-multiline', lines ? 'true' : 'false'); // sans `lines`, un lecteur d'écran lit toujours un champ d'une ligne

    // Mesure le texte sur la ligne fermée (sans passage à la ligne : `scrollWidth` est sa largeur entière), puis ouvre le champ s'il a le focus et qu'il ne tient pas.
    function fit() {
      const wasOpen = box.classList.contains('is-open');
      const scrolled = box.scrollTop;
      box.classList.remove('is-open');
      box.style.height = '';
      const clipped = box.scrollWidth > box.clientWidth + 1;
      // Un retour à la ligne tapé ne tient jamais sur la ligne fermée : le champ reste ouvert, avec ou sans le focus.
      const open = (lines && box.value.indexOf('\n') !== -1) || (document.activeElement === box && clipped);
      if (open) {
        box.classList.add('is-open');
        box.style.height = 'auto';
        box.style.height = Math.min(box.scrollHeight + 2, MAX_HEIGHT) + 'px';
        // Le curseur à la fin de ce qu'on tape reste en vue quand le champ défile ; ailleurs, le défilement d'avant est gardé.
        box.scrollTop = box.selectionEnd >= box.value.length ? box.scrollHeight : (wasOpen ? scrolled : 0);
        // La fenêtre qui le porte défile pour garder le champ entier à l'écran (le bas du champ ouvert descend sous le bas visible de la fenêtre).
        if (!wasOpen || box.selectionEnd >= box.value.length) box.scrollIntoView({ block: 'nearest' });
      } else {
        // Refermé : la ligne montre le début du texte.
        box.scrollTop = 0;
        box.scrollLeft = 0;
      }
    }

    box.addEventListener('input', () => {
      // Aucun retour à la ligne : une valeur qui en porte (glisser-déposer, pose par un script) les remplace par une espace.
      if (!lines && /[\r\n]/.test(box.value)) {
        const caret = box.selectionStart;
        box.value = box.value.replace(/\r\n|[\r\n]/g, ' ');
        box.setSelectionRange(caret, caret);
      }
      fit();
    });
    // Entrée ne pose pas de retour à la ligne (la fenêtre la prend pour valider : leur écouteur de touche passe tel quel). Avec `lines`, seul le geste de Maj+Entrée en pose un (`allowBreak`).
    let allowBreak = false;
    box.addEventListener('beforeinput', event => {
      if (allowBreak) return;
      if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') event.preventDefault();
    });
    if (lines) {
      box.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
        event.preventDefault();
        // Le retour tient dans la longueur permise du champ (`maxLength` compte un retour pour un signe) : au-delà, rien ne s'écrit, comme pour une lettre.
        if (box.maxLength >= 0 && box.value.length - (box.selectionEnd - box.selectionStart) + 1 > box.maxLength) return;
        const start = box.selectionStart, end = box.selectionEnd, was = box.value;
        // `insertText` garde la frappe dans l'historique du champ (Ctrl+Z la défait) ; si le navigateur n'écrit rien, la valeur est posée à la main.
        allowBreak = true;
        try { document.execCommand('insertText', false, '\n'); } catch (e) { /* posé à la main ci-dessous */ }
        allowBreak = false;
        if (box.value === was) { box.setRangeText('\n', start, end, 'end'); box.dispatchEvent(new Event('input', { bubbles: true })); }
      });
    }
    // Un texte collé sur plusieurs lignes tient sur une : les retours à la ligne deviennent des espaces (avec `lines`, ils restent).
    box.addEventListener('paste', event => {
      if (lines) return;
      const text = event.clipboardData && event.clipboardData.getData('text');
      if (!text || !/[\r\n]/.test(text)) return;
      event.preventDefault();
      const start = box.selectionStart, end = box.selectionEnd;
      box.setRangeText(text.replace(/\r\n|[\r\n]/g, ' '), start, end, 'end');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    box.addEventListener('focus', fit);
    box.addEventListener('blur', fit);
    box.addEventListener('growtext:refit', fit);
    window.addEventListener('resize', () => { if (box.classList.contains('is-open')) fit(); });
    // La fenêtre qui porte le champ s'ouvre sur sa valeur : le champ est mesuré dès qu'il a une largeur (la fenêtre était cachée, il n'en avait aucune).
    if (lines && typeof ResizeObserver !== 'undefined') {
      let width = 0;
      new ResizeObserver(() => { if (box.clientWidth !== width) { width = box.clientWidth; fit(); } }).observe(box);
    }
    return box;
  }
  function refresh(box) {
    if (box && box.dataset.growText) box.dispatchEvent(new Event('growtext:refit'));
  }

  function create(className) {
    const box = document.createElement('textarea');
    box.className = className || '';
    return attach(box);
  }

  return { create, attach, refresh };
})();
