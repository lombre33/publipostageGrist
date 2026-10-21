// Briques d'interface communes aux fenêtres, barres et listes du widget. Chargé en premier : les autres modules en prennent `el` au début de leur
// portée, avant d'écrire la moindre ligne qui crée un élément.
const Dom = (function () {
  // Un élément `tag` avec sa classe CSS et son texte, quand ils sont donnés (du texte, jamais du HTML).
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Une <option> de liste déroulante, avec sa valeur et son texte.
  function option(value, text) {
    const node = el('option', null, text);
    node.value = value;
    return node;
  }

  // Un bouton qui ne valide jamais un formulaire (type="button"), avec sa classe CSS et son texte quand ils sont donnés.
  function button(className, text) {
    const node = el('button', className, text);
    node.type = 'button';
    return node;
  }

  // Un groupe de choix à une seule réponse (rôle radiogroup) : flèches pour passer de l'un à l'autre (le choix suit le focus, il n'y a donc rien à
  // « activer » : Entrée valide la fenêtre, `onEnter`), un seul arrêt de Tab par groupe (celui qui est choisi, ou le premier quand rien ne l'est).
  // `options` : [{ value, className, fill(bouton) }], `fill` posant le contenu du bouton. Rend le groupe, ses boutons et `check(value)`, qui coche le
  // bouton de cette valeur.
  function radioGroup({ className, labelId, options, onPick, onEnter }) {
    const group = el('div', className);
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', labelId);
    const buttons = options.map(option => {
      const button = el('button', option.className);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.value = option.value;
      if (option.fill) option.fill(button);
      button.addEventListener('click', () => onPick(option.value));
      return button;
    });
    group.append(...buttons);
    group.addEventListener('keydown', event => {
      const at = buttons.indexOf(document.activeElement);
      if (at < 0) return;
      if (event.key === 'Enter') { event.preventDefault(); onEnter(); return; }
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + step + buttons.length) % buttons.length;
      buttons[next].focus();
      onPick(options[next].value);
    });
    return {
      group,
      buttons,
      check(value) {
        const stop = buttons.find(b => b.dataset.value === value) || buttons[0];
        buttons.forEach(b => { b.setAttribute('aria-checked', b.dataset.value === value ? 'true' : 'false'); b.tabIndex = b === stop ? 0 : -1; });
      },
    };
  }

  // Le balisage (HTML) lu dans un <template>, inerte : rien ne se charge ni ne s'exécute tant que son contenu n'est pas posé dans la page, et un <script> lu
  // ainsi ne s'exécute jamais. C'est le seul endroit du widget où une chaîne de balisage calculée devient des nœuds (audit externe du 21/10, point C-XSS-01 :
  // quarante et une écritures de `innerHTML` éparpillées dans vingt-quatre fichiers, toutes fermées dans le fond, aucune lisible comme telle sans les relire) :
  // le reste passe par ici (garde : codeHygiene, section 28), donc par un seul endroit à relire. Deux obligations pour qui appelle : le balisage est celui du
  // widget (une icône de js/icons.js, un libellé de js/i18n.js) ou du HTML déjà nettoyé (HtmlSanitize.clean, ou nettoyé à la source : js/templates.js) ;
  // jamais le texte d'une cellule ou d'un nom venu de Grist tel quel, qui se pose avec `textContent`. Rend le <template> : son `content` est le fragment,
  // son `innerHTML` le balisage relu (ce que les aides qui réécrivent du HTML lisent).
  function inertTemplate(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template;
  }

  // Remplace le contenu de `target` (un élément, ou la racine d'ombre d'un hôte) par le balisage `html` : ce que faisait `target.innerHTML = html`.
  function setMarkup(target, html) {
    target.replaceChildren(inertTemplate(html).content);
  }

  return { el, option, button, radioGroup, inertTemplate, setMarkup };
})();
