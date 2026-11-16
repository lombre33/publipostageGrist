// Le style de l'État dans le DOCUMENT (lot 2 du mode « Identité de l'État », js/state-mode.js) : ce que le mode ajoute aux outils de mise en page quand il est allumé, jamais aux barres ni aux fenêtres de l'interface.
//  - Deux rangées de couleurs dans les menus de couleur (« Couleurs de l'État » : les bleus, le rouge Marianne et les gris ; « Alertes de l'État » : information, succès, attention, erreur), lues comme celles
//    du thème d'une présentation : sans croix, sans case « garder », chacune avec son nom au survol (js/color-store.js:rows). Valeurs lues dans `core.min.css` de @gouvfr/dsfr 1.15.4. Mode éteint, ni l'une ni l'autre :
//    la palette est celle d'avant, un modèle qui porte ces couleurs s'ouvre et s'enregistre à l'identique.
//  - Le bleu France clair (#6a6af4) fait 4,22:1 sur le blanc, sous les 4,5:1 de la charte : posé en couleur de TEXTE il est signalé dans le coin d'état (jamais refusé : c'est le bon bleu pour un filet ou une barre).
//  - « Appliquer le style de l'État » (menu Titre) : écrit les styles des six niveaux de titres DANS LE MODÈLE (js/heading-styles.js:setModelStyles) - Marianne (repli Arial), gris #161616, les tailles papier ci-dessous -
//    et rien d'autre : ni feuille de style globale, ni réglage du document, ni mise en forme à la main des titres. Un seul Ctrl + Z le défait. Grisée, avec sa raison au survol, tant que le mode n'est pas allumé.
// Le DSFR ne donne que des tailles d'écran (h1 2,5 rem, h2 2 rem, h3 1,75 rem, h4 1,5 rem, h5 et h6 1,25 rem) : les tailles en points d'un modèle A4 sont une proposition (corps 11 pt), à confirmer.
const StateStyle = (function () {
  // Marianne d'abord (le PDF la lit en première famille : js/pdf-font-plan.js), Arial derrière pour un poste qui ne l'a pas.
  const FONT = 'Marianne, arial, sans-serif';
  const INK = '#161616';
  // Les titres, du niveau 1 au niveau 6 : l'échelle du DSFR ramenée au papier.
  const HEADING_PT = { 1: 26, 2: 22, 3: 18, 4: 16, 5: 14, 6: 14 };
  // Le bleu France clair : barres et filets seulement.
  const LIGHT_BLUE = '#6a6af4';
  // Chaque couleur : [nom (clé `state.color.name.<nom>`), valeur].
  const BRAND = [
    ['blueFrance', '#000091'], ['blueFranceLight', LIGHT_BLUE], ['blueFrancePale', '#e3e3fd'], ['blueFranceFaint', '#f5f5fe'], ['redMarianne', '#e1000f'],
    ['greyTitle', '#161616'], ['greyText', '#3a3a3a'], ['greyMention', '#666666'], ['greyBackground', '#eeeeee'], ['greyPale', '#f6f6f6'],
  ];
  const ALERTS = [['info', '#0063cb'], ['success', '#18753c'], ['warning', '#b34000'], ['error', '#ce0500'], ['redText', '#c9191e']];

  // Où dire ce qui se passe (le coin d'état de la page, js/main.js) : `status(texte, erreur)`.
  let host = { status: () => {} };
  function wire(options) { host = Object.assign({}, host, options); }

  const isOn = () => typeof StateMode !== 'undefined' && StateMode.isOn();

  // Les rangées que les menus de couleur ajoutent au mode allumé (js/color-store.js:rows), au format de la rangée du thème : `readonly`, `names` (l'infobulle de chaque couleur). Aucune quand le mode est éteint.
  function rows() {
    if (!isOn()) return [];
    const row = (id, list, label, hint) => ({
      id, readonly: true, label, hint,
      colors: list.map(item => item[1]), names: list.map(item => I18n.t('state.color.name.' + item[0])),
    });
    return [
      row('state', BRAND, I18n.t('state.color.row'), I18n.t('state.color.row.hint')),
      row('state-alerts', ALERTS, I18n.t('state.color.alerts'), I18n.t('state.color.alerts.hint')),
    ];
  }

  // Le bleu France clair posé en couleur de texte (mode allumé) : le coin d'état le dit ; la couleur reste posée. Vrai quand l'avis a été donné.
  // L'avis part APRÈS la frappe de la couleur : le coin d'état se remet à dire l'état de l'enregistrement à chaque modification (js/main-autosave.js:updateSaveStatus), il effacerait un avis posé avant.
  function noteTextColor(color) {
    if (!isOn() || String(color || '').toLowerCase() !== LIGHT_BLUE) return false;
    setTimeout(() => host.status(I18n.t('state.color.lightBlueText'), false), 0);
    return true;
  }

  // Les styles des six niveaux de titres, au format de js/heading-styles.js ({ "1": { fontFamily, fontSize, color } … }).
  function headingStyles() {
    const styles = {};
    HeadingStyles.LEVELS.forEach((level) => { styles[level] = { fontFamily: FONT, fontSize: HEADING_PT[level] + 'pt', color: INK }; });
    return styles;
  }

  // Ce qui grise la ligne : le texte de la raison (vide quand elle est libre) et si l'extension manque (le clic ouvre alors la fenêtre d'installation de GFS).
  function lock() {
    if (typeof StateMode === 'undefined') return { reason: '', missing: false };
    if (!StateMode.isAvailable()) return { reason: StateMode.view().hint, missing: true };
    return StateMode.isOn() ? { reason: '', missing: false } : { reason: I18n.t('state.style.locked.off'), missing: false };
  }

  // La ligne « Appliquer le style de l'État » du menu Titre : libre mode allumé, grisée avec sa raison sinon (même grisage que les lignes de js/heading-styles.js:syncRows).
  function syncRow(row, editor) {
    if (!row) return;
    const { reason } = lock();
    const locked = !!reason || !editor || !editor.isEditable;
    row.setAttribute('aria-disabled', locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', locked);
    row.tabIndex = locked ? -1 : 0;
    const label = reason || I18n.t('state.style.apply.hint');
    if (row.title !== label) row.title = label;
  }

  // Le geste. Faux, sans rien changer, quand le mode n'est pas allumé, que l'éditeur n'est pas modifiable ou que les titres du modèle ont déjà ce style ; le coin d'état dit ce qui s'est passé.
  function applyToModel(editor) {
    if (!editor || !editor.isEditable || !isOn()) return false;
    const done = HeadingStyles.setModelStyles(editor, headingStyles());
    host.status(I18n.t(done ? 'state.style.status.applied' : 'state.style.status.same'), false);
    return done;
  }

  // Le clic sur la ligne : le geste quand elle est libre ; grisée, l'extension absente ouvre la fenêtre d'installation de GFS, le mode éteint le dit dans le coin d'état.
  async function onRow(editor) {
    const locked = lock();
    if (locked.missing) { await StateMode.explain(); return false; }
    if (locked.reason) { host.status(locked.reason, false); return false; }
    return applyToModel(editor);
  }

  return { FONT, INK, HEADING_PT, LIGHT_BLUE, BRAND, ALERTS, wire, rows, noteTextColor, headingStyles, syncRow, applyToModel, onRow };
})();
