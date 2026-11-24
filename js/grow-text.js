// Le champ texte d'UNE ligne qui grandit au clic quand son texte ne tient plus (demande du 24/11 : « champs titre PDF à agrandir au clic comme les emails. À généraliser sur les champs
// similaires », réponse à la carte : « Oui, tous ces champs ») : le texte du QR code (js/qr-code.js), la formule d'un calcul (js/variable-calc.js) et celle du tableau croisé (js/pivot-window.js), qui sont des
// champs de saisie simple (la liste « # » de js/variables.js : `initFilenameInput`), pas des champs à bulles (js/field-editor.js, dont le nom du PDF et les champs des fenêtres de condition et de boucle suivent la même règle).
//
//   GrowText.create(className)  une zone de texte (<textarea>) prête : une ligne, la classe `className` en plus de `pp-grow-text` ;
//   GrowText.attach(textarea)   le même comportement sur une zone de texte que l'appelant a créée (`VariableModal.labelledInput(…, 'textarea')`).
//
// Fermé - sans le focus, ou texte qui tient - le champ est ce qu'était l'<input> : une ligne de 30 px où le texte ne passe pas à la ligne et montre son début. Avec le focus ET un texte qui ne tient plus sur la
// ligne, il passe sur plusieurs lignes (cinq au plus, puis il défile) : la fenêtre qui le porte défile, ce qui est dessous descend. Il ne porte jamais de retour à la ligne : Entrée, que la fenêtre prend pour valider,
// n'en pose pas, et un texte collé les perd. Les règles de dessin sont dans css/field-editor.css (« Le champ de saisie simple qui s'agrandit »).
const GrowText = (function () {
  const MAX_HEIGHT = 110; // cinq lignes de 20 px, 8 px de marge intérieure et la bordure ; au-delà, le champ défile

  function attach(box) {
    if (!box || box.dataset.growText) return box;
    box.dataset.growText = '1';
    box.classList.add('pp-grow-text');
    box.rows = 1;
    box.setAttribute('aria-multiline', 'false'); // un lecteur d'écran lit toujours un champ d'une ligne

    // Mesure le texte sur la ligne fermée (sans passage à la ligne : `scrollWidth` est sa largeur entière), puis ouvre le champ s'il a le focus et qu'il ne tient pas.
    function fit() {
      const wasOpen = box.classList.contains('is-open');
      const scrolled = box.scrollTop;
      box.classList.remove('is-open');
      box.style.height = '';
      const clipped = box.scrollWidth > box.clientWidth + 1;
      const open = document.activeElement === box && clipped;
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
      if (/[\r\n]/.test(box.value)) {
        const caret = box.selectionStart;
        box.value = box.value.replace(/\r\n|[\r\n]/g, ' ');
        box.setSelectionRange(caret, caret);
      }
      fit();
    });
    // Entrée ne pose pas de retour à la ligne (la fenêtre la prend pour valider : leur écouteur de touche passe tel quel).
    box.addEventListener('beforeinput', event => {
      if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') event.preventDefault();
    });
    // Un texte collé sur plusieurs lignes tient sur une : les retours à la ligne deviennent des espaces.
    box.addEventListener('paste', event => {
      const text = event.clipboardData && event.clipboardData.getData('text');
      if (!text || !/[\r\n]/.test(text)) return;
      event.preventDefault();
      const start = box.selectionStart, end = box.selectionEnd;
      box.setRangeText(text.replace(/\r\n|[\r\n]/g, ' '), start, end, 'end');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    box.addEventListener('focus', fit);
    box.addEventListener('blur', fit);
    window.addEventListener('resize', () => { if (box.classList.contains('is-open')) fit(); });
    return box;
  }

  function create(className) {
    const box = document.createElement('textarea');
    box.className = className || '';
    return attach(box);
  }

  return { create, attach };
})();
