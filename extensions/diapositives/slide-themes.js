// Les thèmes prêts d'une présentation (extension « diapositives » de Grist Factory Suite ; demande du 02/11, fil « Ajouter un thème de présentation ») : ceux que la fenêtre « Thème… » propose à côté de « Aspect d'origine »
// (aucun thème). Des données seulement : le thème lui-même, sa lecture, ce qu'il fait à l'écran et dans les exports sont du socle (js/slide-theme.js) ; le nom de chacun est un texte de js/i18n.js (`slides.theme.preset.<id>`).
//  - Chaque thème est choisi pour se lire : le texte et les titres ont au moins 4,5:1 de contraste (WCAG 2) sur le fond, ce que dev-tests/scenarios-slide-theme.js vérifie ;
//  - leurs polices sont les six du menu de police (les seules que le PDF, le Word et le PowerPoint savent écrire), deux par thème : une pour les titres, une pour le texte ;
//  - tous ont le fond blanc : le fond propre à un thème (une page foncée) viendra avec le décor commun des diapositives.
// « Hélianthe » est celui de la proposition commerciale de la galerie : le bleu nuit des titres, le turquoise du bandeau et l'orange du filet de sa première diapositive.
// Les thèmes du DOCUMENT (carte « où garder le thème », 02/11) : « Enregistrer comme thème » (la fenêtre js `slide-theme-ui.js`) range le thème du brouillon, sous le nom qu'on lui donne, dans la liste du document, que toutes
// ses présentations retrouvent à la suite des thèmes prêts. Comme les couleurs du document (js/color-store.js) et les mises en forme du pinceau (js/format-slots.js), la liste vit dans la ligne réservée aux réglages du document
// de la table des modèles (Templates.getDocumentSettings, clé `themes`), sans table de plus et sans clé `pp_*` : le changement vaut tout de suite, l'écriture dans Grist suit (Templates.updateDocumentSettings). Le geste se range
// dans Ctrl + Z avec les actions du document (SettingsHistory) : défaire ne remet que ce que le geste avait posé, jamais par-dessus le geste d'une autre personne. La liste est relue d'un JSON qu'une autre version ou une autre
// personne a pu écrire : tout est revu à la lecture (`cleanSaved`), et ce qui ne tient pas debout n'est pas un thème. Un thème gardé a toujours un nom (40 caractères au plus, unique à la casse près) ; la liste en garde
// SAVED_MAX au plus, dans l'ordre où on les a rangés.
const SlideThemes = (function () {
  const make = (id, colors, fonts) => ({ id, theme: { colors: Object.assign({ bg: '#ffffff' }, colors), fonts } });

  const LIST = [
    make('ocean', { text: '#1e2a35', title: '#0b3c5d', accent1: '#1d70b8', accent2: '#00a3a3', accent3: '#5aa9e6', accent4: '#f2a541', accent5: '#6c8ead', accent6: '#3bb273' }, { title: 'Roboto', body: 'Roboto' }),
    make('helianthe', { text: '#2a3b49', title: '#0d2e43', accent1: '#048189', accent2: '#d9742a', accent3: '#0d2e43', accent4: '#f2b45a', accent5: '#6aa7a9', accent6: '#8a9ba8' }, { title: 'Roboto', body: 'Roboto' }),
    make('forest', { text: '#1f2a24', title: '#1e5631', accent1: '#2e7d32', accent2: '#8aab3c', accent3: '#4f8a8b', accent4: '#d9a441', accent5: '#8d6e63', accent6: '#a3b18a' }, { title: 'Georgia', body: 'Calibri' }),
    make('burgundy', { text: '#2b2226', title: '#7a1f3d', accent1: '#7a1f3d', accent2: '#c2185b', accent3: '#d98880', accent4: '#b08968', accent5: '#6d4c41', accent6: '#e0b0a0' }, { title: 'Georgia', body: 'Calibri' }),
    make('sun', { text: '#2b2118', title: '#b45309', accent1: '#d97706', accent2: '#f59e0b', accent3: '#dc2626', accent4: '#0891b2', accent5: '#65a30d', accent6: '#7c3aed' }, { title: 'Calibri', body: 'Calibri' }),
    make('slate', { text: '#333b45', title: '#2b3440', accent1: '#4a6fa5', accent2: '#8a9ba8', accent3: '#b0bec5', accent4: '#607d8b', accent5: '#455a64', accent6: '#cfd8dc' }, { title: 'Arial', body: 'Arial' }),
    make('editorial', { text: '#1f2937', title: '#111827', accent1: '#b91c1c', accent2: '#6b7280', accent3: '#9ca3af', accent4: '#374151', accent5: '#d1d5db', accent6: '#4b5563' }, { title: 'Times New Roman', body: 'Arial' }),
  ];

  // Le thème prêt qui a ces couleurs et ces polices (le nom gardé dans le modèle ne compte pas : une fois le thème choisi, le modèle porte ses propres réglages), ou null.
  function find(theme) {
    const wanted = SlideTheme.normalize(theme);
    if (!wanted) return null;
    const key = item => JSON.stringify([item.colors, item.fonts]);
    return LIST.find(preset => key(SlideTheme.normalize(preset.theme)) === key(wanted)) || null;
  }
  const byId = id => LIST.find(preset => preset.id === id) || null;
  // Le nom à montrer d'un thème : celui du thème prêt qu'il est (dans la langue du moment), à défaut le nom que le modèle lui a gardé, à défaut « Personnalisé » ; « Sans thème » pour aucun.
  function nameOf(theme) {
    const normalized = SlideTheme.normalize(theme);
    if (!normalized) return I18n.t('slides.theme.none');
    const preset = find(normalized);
    return preset ? I18n.t('slides.theme.preset.' + preset.id) : (normalized.name || I18n.t('slides.theme.custom'));
  }

  // --- Les thèmes du document ---
  const SAVED_MAX = 12;
  // Le poids de la liste, en caractères de son JSON : le logo d'un thème (son décor) y est une adresse de données, jusqu'à SlideTheme.LOGO_SRC_MAX caractères, et la liste s'écrit d'un bloc dans la ligne des réglages du document.
  // `save` refuse ('heavy') ce qui la ferait passer au-dessus ; la lecture, elle, garde tout ce qui est écrit.
  const SAVED_CHARS_MAX = 360000;
  const NAME_MAX = SlideTheme.NAME_MAX;
  const cleanName = text => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '');
  const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();
  // La liste telle qu'elle doit être : des thèmes revus (SlideTheme.normalize) qui ont un nom, un nom par thème, SAVED_MAX au plus.
  function cleanSaved(raw) {
    const list = [];
    (Array.isArray(raw) ? raw : []).forEach((item) => {
      const theme = SlideTheme.normalize(item);
      const name = theme ? cleanName(theme.name) : '';
      if (!name || list.some(kept => sameName(kept.name, name))) return;
      list.push(Object.assign({}, theme, { name }));
    });
    return list.slice(0, SAVED_MAX);
  }
  const saved = () => cleanSaved(Templates.getDocumentSettings().themes);
  const savedByName = name => saved().find(theme => sameName(theme.name, name)) || null;
  const isReadOnly = () => typeof AccessRights !== 'undefined' && AccessRights.get().readOnly;
  // Un nom que la liste n'a pas encore : `base`, puis « base 2 », « base 3 »… (le nom reste dans NAME_MAX caractères).
  function freeName(base) {
    const root = cleanName(base) || I18n.t('slides.theme.save.default');
    const list = saved();
    if (!list.some(theme => sameName(theme.name, root))) return root;
    for (let n = 2; n < 100; n++) {
      const suffix = ' ' + n;
      const name = cleanName(root.slice(0, NAME_MAX - suffix.length)) + suffix;
      if (!list.some(theme => sameName(theme.name, name))) return name;
    }
    return root;
  }

  // Le réglage du document pour l'historique d'Annuler / Rétablir (js/settings-history.js) : lire, poser (en attendant que Grist l'ait écrit : un refus lève un conflit, rien n'est faussement dit « fait »), dire.
  const namesOf = list => list.map(theme => I18n.t('slides.theme.quoted', { name: theme.name })).join(', ');
  const DOCUMENT_SETTING = {
    read: saved,
    async write(list) {
      const next = cleanSaved(list);
      const done = await Templates.updateDocumentSettings({ themes: next.length ? next : null });
      if (!done) throw ActionHistory.conflict(I18n.t('slides.theme.saved.failed'));
    },
    say: list => I18n.t('slides.theme.saved.now', { names: namesOf(list) || I18n.t('slides.theme.saved.none') }),
    locked: isReadOnly,
  };
  // `host.status(texte, erreur)` : le coin d'état de la page, pour un refus de Grist qui arrive après coup.
  let host = { status: () => {} };
  function wire(options) { host = Object.assign({}, host, options); }
  // Pose la liste (le changement vaut tout de suite pour les lecteurs, Grist suit) ; un seul pas de Ctrl + Z.
  function put(list) {
    SettingsHistory.track(DOCUMENT_SETTING, () => {
      const next = cleanSaved(list);
      Templates.updateDocumentSettings({ themes: next.length ? next : null }).then((done) => { if (!done) host.status(I18n.t('slides.theme.saved.failed'), true); });
    });
  }

  // Range `theme` sous `name` : 'added' (un thème de plus), 'replaced' (le thème de ce nom est remplacé, à sa place dans la liste), 'full' (SAVED_MAX thèmes, aucun de ce nom), 'heavy' (la liste passerait SAVED_CHARS_MAX :
  // des logos trop nombreux), 'locked' (compte en lecture seule) ou 'invalid' (pas de thème, ou pas de nom).
  function save(theme, name) {
    const clean = cleanName(name);
    const normalized = SlideTheme.normalize(Object.assign({}, theme, { name: clean }));
    if (!normalized || !clean) return 'invalid';
    if (isReadOnly()) return 'locked';
    const list = saved();
    const at = list.findIndex(item => sameName(item.name, clean));
    if (at < 0 && list.length >= SAVED_MAX) return 'full';
    const next = list.slice();
    if (at < 0) next.push(normalized); else next[at] = normalized;
    if (JSON.stringify(next).length > SAVED_CHARS_MAX) return 'heavy';
    put(next);
    return at < 0 ? 'added' : 'replaced';
  }
  // Retire le thème de ce nom de la liste : vrai s'il y était (et si le compte peut écrire).
  function remove(name) {
    if (isReadOnly()) return false;
    const list = saved();
    const next = list.filter(item => !sameName(item.name, name));
    if (next.length === list.length) return false;
    put(next);
    return true;
  }

  return { LIST, find, byId, nameOf, SAVED_MAX, SAVED_CHARS_MAX, cleanName, saved, savedByName, freeName, save, remove, isReadOnly, wire };
})();
