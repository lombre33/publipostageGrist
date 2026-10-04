// Ce que partagent les fenêtres d'une bulle (Condition, Boucle, Liste, Autres attributs) : le texte de la bulle, quelques champs, l'aperçu en direct
// et le retour au nœud d'origine à l'enregistrement.
const VariableModal = (function () {
  const el = Dom.el;

  // La bulle comme le texte la montre : la touche de déclenchement, puis sa clé.
  const badgeText = node => Variables.triggerChar() + (node.attrs.key || '');
  const shorten = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);

  // Un champ et son libellé, reliés par `id`. Le texte du libellé se pose à l'ouverture, dans la langue du moment.
  function labelledInput(id, className, type = 'text') {
    const label = el('label');
    label.htmlFor = id;
    const input = el('input', className);
    input.type = type;
    input.id = id;
    return { label, input };
  }

  // Les classes de chaque fenêtre, écrites en toutes lettres pour que les règles de css/variable-actions.css et css/variable-list.css se retrouvent
  // dans le code.
  const SEPARATOR_CLASSES = {
    'var-loop': { row: 'var-loop-seps', last: 'var-loop-last-input' },
    'var-list': { row: 'var-loop-seps var-list-seps', last: 'var-list-last-input' },
  };
  // Les deux séparateurs d'une suite de valeurs - boucle en ligne (`scope` 'var-loop') ou liste (`scope` 'var-list') : « Séparateur », « Avant la
  // dernière valeur » et leur indication. `onInput(clé, texte)` reçoit chaque frappe, sous la clé `separator` ou `lastSeparator`.
  function separatorFields(scope, onInput) {
    const classes = SEPARATOR_CLASSES[scope];
    const row = el('div', classes.row);
    const sep = labelledInput(scope + '-sep', 'var-loop-sep-input');
    const last = labelledInput(scope + '-last', classes.last);
    const hint = el('span', 'var-loop-hint');
    row.append(sep.label, sep.input, last.label, last.input, hint);
    sep.input.addEventListener('input', () => onInput('separator', sep.input.value));
    last.input.addEventListener('input', () => onInput('lastSeparator', last.input.value));
    return { row, sepLabel: sep.label, sepInput: sep.input, lastLabel: last.label, lastInput: last.input, hint };
  }

  // La zone d'aperçu : `count` lignes que les lecteurs d'écran annoncent à chaque changement.
  function previewBox(count) {
    const box = el('div', 'var-condition-debug');
    box.setAttribute('aria-live', 'polite');
    const lines = Array.from({ length: count }, () => el('div', 'var-condition-debug-line'));
    box.append(...lines);
    return { box, lines };
  }

  // Une ligne d'aperçu. Sans `text` elle est cachée ; `good` (fond vert, coche) ne marque que les issues positives.
  function setLine(line, text, good) {
    line.replaceChildren();
    line.hidden = !text;
    line.classList.toggle('is-good', !!good);
    if (!text) return;
    if (good) {
      const icon = el('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'flex:none; display:inline-flex; width:14px; height:14px; margin-top:2px;';
      icon.innerHTML = Icons.svg('acceptAll');
      line.appendChild(icon);
    }
    line.appendChild(el('span', null, text));
  }

  // Le calcul de l'aperçu : `schedule()` le relance 250 ms après la dernière saisie, pour ne pas recalculer à chaque touche ; `begin()` en démarre un
  // et rend `outdated()`, vrai dès qu'un calcul plus récent ou `cancel()` l'a dépassé (son résultat est alors jeté) ; `cancel()` abandonne celui qui
  // est programmé ou en cours.
  function previewRunner(update) {
    let generation = 0;
    let timer = null;
    return {
      schedule() { clearTimeout(timer); timer = setTimeout(update, 250); },
      begin() {
        clearTimeout(timer);
        const mine = ++generation;
        return () => mine !== generation;
      },
      cancel() { clearTimeout(timer); generation += 1; },
    };
  }

  // Le nœud dont la fenêtre est ouverte, retrouvé à la position capturée au clic, ou null s'il a bougé ou disparu depuis - alerte `lostKey`, rien
  // n'est écrit. Une bulle doit encore porter la même variable. `tag` : le module, pour le journal.
  function nodeAtOrigin({ editor, pos, node: original }, lostKey, tag) {
    const node = editor.state.doc.nodeAt(pos);
    const same = node && node.type.name === original.type.name
      && (original.type.name !== 'varBadge' || (node.attrs.table === original.attrs.table && node.attrs.column === original.attrs.column));
    if (same) return node;
    console.warn('[' + tag + '] nœud introuvable à sa position d\'origine - rien n\'est écrit.');
    alert(I18n.t(lostKey));
    return null;
  }

  return { badgeText, shorten, labelledInput, separatorFields, previewBox, setLine, previewRunner, nodeAtOrigin };
})();
