// Le FORMAT RÉGIONAL dans lequel le DOCUMENT écrit ses dates et ses nombres (bug du 26/11 : « chez moi les dates s'affichent au format français, le même document chez une collègue au format anglais,
// je n'ai pas touché au formatage » ; sa remarque : « anglais, ce n'est pas forcément USA - ça peut être un Italien ou autre : il faut découpler complètement »). Avant, l'ordre du jour et du mois (« 12/09/2026 » ou
// « 09/12/2026 »), le nom du mois, le « 1er », le « à » / « at » entre la date et l'heure, les séparateurs d'un nombre et la place de sa devise suivaient la langue de l'INTERFACE de la personne qui ouvre le document
// - celle de son navigateur, ou de GFS -, jamais le document : le même modèle écrivait « 12/09/2026 » chez celui qui l'avait fait en français et « 09/12/2026 » chez une collègue au navigateur en anglais, dans la Lecture comme
// dans le PDF et l'e-mail qu'elle envoyait. Et l'anglais ne pouvait être qu'américain.
//
// Ce qui décide maintenant, dans l'ordre (VariableFormat.formatLocale, une locale de VariableFormat.REGIONS : « fr-FR », « en-GB », « it-IT »...) :
//  1. le réglage du document (Réglages > Langue > « Format des dates et des nombres du document »), gardé dans la ligne réservée aux réglages du document (Templates, clé `formatLocale`) : tout le monde l'obtient, quelle
//     que soit la langue de son interface, et ce n'est pas une langue : « English (United Kingdom) » écrit « 12/09/2026 » ;
//  2. la locale de Grist (Paramètres du document > Locale, `_grist_DocInfo.documentSettings.locale`) quand une personne en a choisi une que le widget sait écrire - « fr-FR », « en-GB », « it-IT »... Jamais « en-US » :
//     c'est ce que Grist met dans tout document neuf, ce n'est pas un choix, et un document qu'on y croirait américain sans que personne ne l'ait dit changerait d'écriture en silence ;
//  3. la langue de l'interface de la personne, comme avant (« Automatique » sans locale de Grist qui compte) : « fr-FR » pour le français, « en-US » pour l'anglais.
// Une variable de date ou de nombre AJOUTÉE garde la région du document à cet instant (attribut `locale` du nœud, `data-locale`, js/variables.js:insertVariable ; demande du 26/11 : « une fois une variable ajoutée,
// ça ne rechange pas après - sans bouger automatiquement ») : elle s'écrit dans cette région pour toujours (VariableFormat.withRegion), sans suivre ni le réglage du document, ni Grist, ni la langue de qui lit ; le
// réglage du document ne règle donc que les variables posées avant, les puces, les pastilles et les champs texte, et la région que les prochaines variables garderont.
// Un réglage de la variable (`style` « FR » / « US » d'un nombre) l'emporte toujours, comme avant. L'interface (textes, infobulles, messages) garde sa langue : seul ce que le document ÉCRIT change.
//   FormatLocale.choice() -> 'auto' | une locale de REGIONS : le choix écrit dans le document ('auto' : aucun)
//   FormatLocale.effective() -> une locale de REGIONS, ou null quand c'est celle de l'interface (la source de VariableFormat.formatLocale)
//   FormatLocale.nameOf(locale) / sampleOf(locale) -> le nom d'une région (« Français (Belgique) ») et ce qu'elle écrit pour le 12 septembre 2026 et le nombre 1234,5 (la liste « Région » de la barre d'une bulle)
//   FormatLocale.wirePanel() -> branche la section de Réglages > Langue (grisée en lecture seule), défaisable par Ctrl + Z (js/settings-history.js)
const FormatLocale = (function () {
  const KEY = 'formatLocale';
  const el = id => document.getElementById(id);
  const isReadOnly = () => typeof AccessRights !== 'undefined' && AccessRights.get().readOnly;
  const regions = () => VariableFormat.REGIONS;
  const nameOf = locale => (regions().find(region => region.locale === locale) || { name: locale }).name;

  function choice() {
    const value = typeof Templates !== 'undefined' ? Templates.getDocumentSetting(KEY) : undefined;
    return VariableFormat.isRegion(value) ? value : 'auto';
  }

  // La région que la locale de Grist désigne, pour une locale que le widget sait écrire ; null sinon. « en-US » ne désigne rien (la locale de tout document neuf) et « en » seul non plus ; une locale du même
  // pays ou de la même langue (« fr-CA », « fr ») prend la première région de sa langue, sauf l'anglais, qui n'est qu'exactement « en-GB ».
  function gristRegion() {
    const settings = typeof GristAPI !== 'undefined' ? GristAPI.getDocumentSettings() : null;
    const locale = settings && typeof settings.locale === 'string' ? settings.locale.replace('_', '-') : '';
    if (!locale || /^en-us$/i.test(locale)) return null;
    const exact = regions().find(region => region.locale.toLowerCase() === locale.toLowerCase());
    if (exact) return exact.locale;
    const language = locale.slice(0, 2).toLowerCase();
    if (language === 'en' || !/^[a-z]{2}(?:-|$)/i.test(locale)) return null;
    const sameLanguage = regions().find(region => region.locale.slice(0, 2) === language);
    return sameLanguage ? sameLanguage.locale : null;
  }

  function effective() {
    const chosen = choice();
    return chosen === 'auto' ? gristRegion() : chosen;
  }

  // Ce qu'une région écrit pour le 12 septembre 2026 et le nombre 1234,5 : l'exemple que montre chaque ligne de la liste, pour qu'on choisisse sur ce qu'on lit et non sur un nom de pays.
  function sampleOf(locale) {
    const day = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 8, 12)));
    const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5).replace(/[  ]/g, ' ');
    return day + ' · ' + number;
  }

  // Ce que la section dit sous la liste : pourquoi le document écrit comme il écrit.
  function hintText() {
    const chosen = choice();
    if (chosen !== 'auto') return I18n.t('settings.formatLocale.hintChosen', { name: nameOf(chosen) });
    const grist = gristRegion();
    if (grist) return I18n.t('settings.formatLocale.hintGrist', { name: nameOf(grist) });
    return I18n.t('settings.formatLocale.hintInterface', { name: nameOf(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR') });
  }

  function fillList(select) {
    if (select.options.length === regions().length + 1) return;
    select.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = I18n.t('settings.formatLocale.auto');
    select.appendChild(auto);
    regions().forEach((region) => {
      const option = document.createElement('option');
      option.value = region.locale;
      option.textContent = region.name + ' - ' + sampleOf(region.locale);
      select.appendChild(option);
    });
  }

  function render() {
    const select = el('settings-format-locale');
    if (!select) return;
    fillList(select);
    const locked = isReadOnly();
    select.value = choice();
    select.disabled = locked;
    const hint = el('settings-format-locale-hint');
    if (hint) hint.textContent = hintText();
    const lockedHint = el('settings-format-locale-locked');
    if (lockedHint) lockedHint.hidden = !locked;
  }

  // Pose le choix dans le document. Rend vrai quand Grist l'a écrit ; faux sinon (table refusée, droit d'écriture absent) : la liste revient alors sur ce que le document dit vraiment et la phrase le dit.
  function put(next) {
    const saved = Templates.updateDocumentSettings({ [KEY]: VariableFormat.isRegion(next) ? next : null });
    render();
    return saved.then((ok) => {
      render();
      const hint = el('settings-format-locale-hint');
      if (!ok && hint) hint.textContent = I18n.t('settings.formatLocale.failed');
      return ok;
    });
  }

  // Le choix tel que Ctrl + Z le défait (js/settings-history.js) : défaire ou rétablir l'écrit par la même écriture que le geste ; un refus de Grist se dit au lieu de faire croire que c'est fait.
  const SETTING = {
    read: choice,
    async write(value) {
      if (!(await put(value))) throw ActionHistory.conflict(I18n.t('settings.formatLocale.failed'));
    },
    say: value => I18n.t('status.settingSet', { setting: I18n.t('settings.formatLocale.title'), value: value === 'auto' ? I18n.t('settings.formatLocale.auto') : nameOf(value) }),
    locked: isReadOnly,
  };

  function wirePanel() {
    const select = el('settings-format-locale');
    if (!select) return;
    select.addEventListener('change', () => {
      if (isReadOnly()) { render(); return; }
      const value = select.value;
      SettingsHistory.track(SETTING, () => { put(value); });
    });
    // Relue à chaque ouverture des Réglages (la locale du document a pu changer dans Grist), et quand le document change ou que les droits changent, Réglages ouverts.
    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', render);
    document.addEventListener('pp:documentSettingsChanged', render);
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(render);
    render();
  }

  if (typeof VariableFormat !== 'undefined') VariableFormat.setFormatLocaleSource(effective);

  return { KEY, choice, effective, wirePanel, render, nameOf, sampleOf };
})();
