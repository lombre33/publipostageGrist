// Ce que partagent les fenêtres d'une bulle (Condition, Boucle, Liste, Calcul, Autres attributs) : le texte de la bulle, quelques champs, l'aperçu en direct
// et le retour au nœud d'origine à l'enregistrement, et leur gabarit commun - une phrase d'introduction dont la suite est derrière « i » (intro), les réglages en
// lignes « étiquette à gauche, champ à droite » (form), ce qu'on règle rarement dans un repli « Plus d'options » (fold) et le résultat collé au bas de la fenêtre,
// avec son « Détail » (previewBox, setLine). Les règles de ce gabarit : css/variable-actions.css.
const VariableModal = (function () {
  const el = Dom.el;

  // La bulle comme le texte la montre : la touche de déclenchement, puis sa clé.
  const badgeText = node => Variables.triggerChar() + (node.attrs.key || node.attrs.varKey || '');
  const shorten = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);

  // Un champ et son libellé, reliés par `id`. Le texte du libellé se pose à l'ouverture, dans la langue du moment. `type` 'textarea' : un champ de plusieurs lignes.
  function labelledInput(id, className, type = 'text') {
    const label = el('label');
    label.htmlFor = id;
    const input = el(type === 'textarea' ? 'textarea' : 'input', className);
    if (type !== 'textarea') input.type = type;
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
  // dernière valeur » et leur indication. `onInput(clé, texte)` reçoit chaque frappe, sous la clé `separator` ou `lastSeparator`. Un retour à la ligne y est un « \n » du texte.
  function separatorFields(scope, onInput) {
    const classes = SEPARATOR_CLASSES[scope];
    const row = el('div', classes.row);
    // Des zones de texte d'une ligne (js/grow-text.js) : Maj+Entrée y pose un retour à la ligne - un séparateur peut mettre chaque valeur sur sa ligne.
    const sep = labelledInput(scope + '-sep', 'var-loop-sep-input', 'textarea');
    const last = labelledInput(scope + '-last', classes.last, 'textarea');
    GrowText.attach(sep.input, { lines: true });
    GrowText.attach(last.input, { lines: true });
    const hint = el('span', 'var-loop-hint');
    row.append(sep.label, sep.input, last.label, last.input, hint);
    sep.input.addEventListener('input', () => onInput('separator', sep.input.value));
    last.input.addEventListener('input', () => onInput('lastSeparator', last.input.value));
    return { row, sepLabel: sep.label, sepInput: sep.input, lastLabel: last.label, lastInput: last.input, hint };
  }

  // === Gabarit commun des fenêtres de bulle ===
  // L'introduction : la première phrase, puis un « i » qui montre la suite (« En édition, la bulle reste visible, en pointillés. ») : une explication qu'on lit une fois ne
  // pèse pas à chaque ouverture. `lead` : ce qui précède le texte (la bulle de la variable, ou rien) ; le texte entier reste dans le paragraphe, seule la suite est cachée -
  // les lecteurs d'écran la trouvent par le bouton, qui n'a pas de texte à lui. Une seule phrase : pas de « i ». `whole` : le texte reste entier (la Liste dit là ce qu'on lui demande).
  const FIRST_SENTENCE = /^[^]*?[.!?](?=\s+[A-ZÀ-ÝÉ])/;
  function setIntro(intro, lead, text, whole) {
    const found = whole ? null : FIRST_SENTENCE.exec(text);
    const first = found ? found[0] : text;
    const rest = text.slice(first.length);
    const nodes = [];
    if (lead) nodes.push(lead, document.createTextNode(' '));
    nodes.push(document.createTextNode(first));
    if (rest.trim()) {
      const more = el('span', 'var-intro-more', rest);
      more.id = (intro.id || (intro.id = 'var-intro-' + (++introCount))) + '-more';
      nodes.push(infoButton(more), more);
    }
    intro.replaceChildren(...nodes);
  }
  let introCount = 0;
  // Le « i » qui montre ou cache `more` (un élément déjà dans la fenêtre, avec un `id`) : cachée tant qu'on n'a pas cliqué. Le bouton n'a pas de texte à lui, son nom est son aria-label.
  function infoButton(more) {
    more.hidden = true;
    const info = el('button', 'var-info');
    info.type = 'button';
    info.setAttribute('aria-label', I18n.t('varModal.moreInfo'));
    info.setAttribute('aria-expanded', 'false');
    info.setAttribute('aria-controls', more.id);
    info.title = I18n.t('varModal.moreInfo');
    info.addEventListener('click', () => {
      more.hidden = !more.hidden;
      info.setAttribute('aria-expanded', more.hidden ? 'false' : 'true');
    });
    return info;
  }

  // Les réglages d'une fenêtre : une grille « étiquette à gauche, champ à droite », une ligne par décision. `row(label, controls, plain)` ajoute une ligne et rend son enveloppe (`.cell` : la case de droite) ;
  // `label` : l'élément de l'étiquette (un `<label>` relié à son champ, ou le `<div>` qui nomme un groupe de boutons) ; `plain` : la case ne porte que du texte (elle s'aligne sur la
  // première ligne de l'étiquette), pas un champ.
  function form(options) {
    const box = el('div', 'var-form');
    // `stacked` : l'étiquette au-dessus du champ, pour les choix trop larges pour la case de droite (les quatre boutons de la Liste).
    if (options && options.stacked) box.classList.add('is-stacked');
    return {
      box,
      row(label, controls, plain) {
        label.classList.remove('var-loop-label');
        label.classList.add('var-form-l');
        const cell = el('div', plain ? 'var-form-v' : 'var-form-v is-control');
        cell.append(...controls);
        const row = el('div', 'var-form-row');
        row.append(label, cell);
        row.cell = cell;
        box.appendChild(row);
        return row;
      },
    };
  }

  // Le repli « Plus d'options » : ce qui se règle rarement. Fermé, il dit ce qu'il contient (`what`, « séparateur, tri, si aucune ligne ») ; la fenêtre l'ouvre d'office quand un
  // des réglages qu'il contient n'est pas celui d'origine (`open`), pour qu'aucune valeur ne reste cachée. Un <details> : le clavier, les lecteurs d'écran et le Tab le connaissent.
  function fold(title, what) {
    const box = el('details', 'var-fold');
    const summary = el('summary');
    const titleEl = el('span', 'var-fold-title', title);
    const whatEl = el('em', null, what);
    summary.append(titleEl, whatEl);
    const body = el('div', 'var-fold-body');
    box.append(summary, body);
    return { box, body, summary, setTitle: (t, w) => { titleEl.textContent = t; whatEl.textContent = w; }, setOpen: open => { box.open = !!open; } };
  }

  // La zone d'aperçu, collée au bas de la zone qui défile : `count` lignes que les lecteurs d'écran annoncent à chaque changement. `detail` : la première ligne (`detail: { first: n }` : la ligne n) dit l'essentiel, les
  // suivantes ne se montrent qu'au clic sur « Détail » (la ligne qui compte les lignes de la table, par exemple) - une phrase de plus, avec les chiffres, reste là à qui la cherche.
  const DETAILS = new WeakMap();
  function previewBox(count, options) {
    const box = el('div', 'var-condition-debug var-result');
    box.setAttribute('aria-live', 'polite');
    const lines = Array.from({ length: count }, () => el('div', 'var-condition-debug-line'));
    box.append(...lines);
    if (options && options.detail) {
      // `detail.first` : l'indice de la ligne qui dit l'essentiel et porte « Détail » (la première par défaut) ; celles qui la suivent se replient.
      const firstIndex = options.detail.first || 0;
      // Le mot du bouton vient du CSS (`data-label`) : il n'ajoute rien au texte de la ligne qu'il termine, que lisent les lecteurs d'écran (son nom est son aria-label) et les essais.
      const more = el('button', 'var-result-more');
      const label = open => {
        const text = I18n.t(open ? 'varModal.detailHide' : 'varModal.detail');
        more.dataset.label = text;
        more.setAttribute('aria-label', text);
      };
      more.type = 'button';
      more.hidden = true;
      more.setAttribute('aria-expanded', 'false');
      label(false);
      more.addEventListener('click', () => {
        const open = box.classList.toggle('is-detail');
        label(open);
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      box.classList.add('has-detail');
      const rest = lines.slice(firstIndex + 1);
      rest.forEach(line => line.classList.add('is-detail-line'));
      DETAILS.set(box, { first: lines[firstIndex], more, rest });
    }
    return { box, lines };
  }

  // Une ligne d'aperçu. Sans `text` elle est cachée ; `good` (fond vert, coche) ne marque que les issues positives ; `important` : une ligne de détail qui se montre sans le
  // clic sur « Détail » (un avertissement).
  function setLine(line, text, good, important) {
    line.replaceChildren();
    line.hidden = !text;
    line.classList.toggle('is-good', !!good);
    line.classList.toggle('is-important', !!(text && important));
    if (!text) { syncDetail(line, false); return; }
    if (good) {
      const icon = el('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'flex:none; display:inline-flex; width:14px; height:14px; margin-top:2px;';
      Dom.setMarkup(icon, Icons.svg('acceptAll'));
      line.appendChild(icon);
    }
    // Le retour à la ligne d'un séparateur ou d'un texte « Avant » / « Après » (VariableFormat.LINE_BREAK) se lit « ↵ » : l'aperçu tient sur une ligne.
    line.appendChild(el('span', null, String(text).replace(/\u2028/g, '\u21b5')));
    syncDetail(line, true);
  }
  // Le bouton « Détail » vit dans la première ligne (son texte est remplacé à chaque calcul : il est reposé à chaque fois) ; il n'y a que s'il y a un détail à montrer.
  function syncDetail(line, filled) {
    const box = line.parentElement;
    const detail = box && DETAILS.get(box);
    if (!detail) return;
    const hasDetail = detail.rest.some(l => !l.hidden && !l.classList.contains('is-important'));
    detail.more.hidden = !hasDetail;
    if (line === detail.first && filled) line.appendChild(detail.more);
    else if (!detail.first.hidden && !detail.more.isConnected) detail.first.appendChild(detail.more);
  }

  // Le calcul de l'aperçu : `schedule()` le relance 250 ms après la dernière saisie, pour ne pas recalculer à chaque touche ; `begin()` en démarre un
  // et rend `outdated()`, vrai dès qu'un calcul plus récent ou `cancel()` l'a dépassé (son résultat est alors jeté) ; `cancel()` abandonne celui qui
  // est programmé ou en cours.
  function previewRunner(update) {
    let generation = 0;
    let timer = null;
    return {
      schedule() { clearTimeout(timer); timer = setTimeout(() => update(), 250); },
      begin() {
        clearTimeout(timer);
        const mine = ++generation;
        return () => mine !== generation;
      },
      cancel() { clearTimeout(timer); generation += 1; },
    };
  }

  // La fermeture commune des fenêtres d'une bulle : la fenêtre se cache, `reset()` remet le module à zéro (son état, ses minuteries), l'aperçu en cours
  // est abandonné, puis le clavier revient à l'éditeur d'où la fenêtre est partie (`editor`, null quand elle n'était pas ouverte sur un éditeur). La
  // bulle est toujours sélectionnée : rendre le focus à l'éditeur fait réapparaître sa barre flottante.
  function closeWindow(win, editor, previewRun, reset) {
    win.hide();
    reset();
    previewRun.cancel();
    if (editor) editor.view.focus();
  }

  // Le nœud dont la fenêtre est ouverte, retrouvé à la position capturée au clic, ou null s'il a bougé ou disparu depuis - alerte `lostKey`, rien
  // n'est écrit. Une bulle doit encore porter la même variable (un calcul, la même formule), une pastille « @ » la même fiche (table et ligne) et la même colonne. `tag` : le module, pour le journal.
  function nodeAtOrigin({ editor, pos, node: original }, lostKey, tag) {
    const node = editor.state.doc.nodeAt(pos);
    const name = original.type.name;
    const sameAttrs = keys => keys.every(key => node.attrs[key] === original.attrs[key]);
    const same = node && node.type.name === name
      && (name !== 'varBadge' || sameAttrs(['table', 'column']))
      && (name !== 'calcBadge' || sameAttrs(['formula']))
      && (name !== 'editorImage' || sameAttrs(['varTable', 'varColumn']))
      && (name !== 'mention' || sameAttrs(['table', 'row', 'column']));
    if (same) return node;
    console.warn('[' + tag + '] nœud introuvable à sa position d\'origine - rien n\'est écrit.');
    alert(I18n.t(lostKey));
    return null;
  }

  return { badgeText, shorten, labelledInput, separatorFields, setIntro, infoButton, form, fold, previewBox, setLine, previewRunner, closeWindow, nodeAtOrigin };
})();
