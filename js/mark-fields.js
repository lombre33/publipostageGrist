// « Repérer les champs » (audit « confort d'usage » du 12/11, idée 6) : pour relire une lettre avant un lot, on voit d'un coup d'œil ce qui vient de Grist. Une ligne du menu du bouton Mode lecture (comme « Lecture simple »
// et « Lecture épurée », mais une case à part : elle ne change pas ce que fait le bouton) allume la classe `pp-mark-fields` sur <body> ; css/mark-fields.css teinte alors, dans la Lecture, les valeurs écrites par les
// bulles et montre une valeur vide comme un petit « vide » entouré. Affichage seulement : la mise en page ne bouge pas (rien d'ajouté au flux : la teinte est un fond, le « vide » est un pseudo-élément en ligne,
// seul sur une valeur sans texte), et ni le PDF, ni les autres exports, ni l'impression, ni le contrôle d'avant lot ne le voient. Un état d'affichage de la session, comme le zoom : éteint au départ, ni gardé d'une
// ouverture du widget à l'autre, ni dans Annuler.
const MarkFields = (function () {
  const BODY_CLASS = 'pp-mark-fields';
  const ROW = 'v2-btn-mark-fields';
  const EMPTY_LABEL_VAR = '--pp-fields-empty';
  let on = false;

  function isOn() { return on; }
  function sync() {
    document.body.classList.toggle(BODY_CLASS, on);
    const row = document.getElementById(ROW);
    if (row) row.setAttribute('aria-checked', on ? 'true' : 'false');
    // Le mot « vide » vient de la langue de l'interface : posé en variable CSS, que le pseudo-élément lit.
    document.body.style.setProperty(EMPTY_LABEL_VAR, JSON.stringify(I18n.t('markFields.empty')));
  }
  function set(value) { on = !!value; sync(); return on; }
  function toggle() { return set(!on); }

  function wire() {
    const row = document.getElementById(ROW);
    if (row) {
      // Même geste que les autres lignes du menu (js/clean-reading.js:wire) : l'appui ne prend pas le focus (le menu au survol resterait ouvert), Entrée et Espace font ce que fait le clic.
      row.addEventListener('mousedown', event => event.preventDefault());
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      });
    }
    sync();
  }

  return { wire, isOn, set, toggle };
})();
