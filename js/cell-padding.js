// Les marges internes des cases d'un tableau (retour d'un utilisateur du 26/11 : « un espacement assez grand au niveau des bordures, ce qui génère des tableaux trop grands quand on a pas mal de données »).
// Trois niveaux, un réglage PAR TABLEAU (menu « Bordures » de la barre du tableau, GridEditor.setCellPadding) et un niveau DE DÉPART pour les tableaux que la personne insère ensuite (Réglages > Thème > Tableaux,
// PersonStore `pp_table_padding`) :
//   - « Normal » : le rendu d'avant, 4 px en haut et en bas, 6 px sur les côtés. C'est l'absence de marque : un tableau que personne n'a réglé garde le même HTML et le même rendu partout.
//   - « Compact » : 1 px et 3 px ; « Large » : 8 px et 12 px.
// Le réglage est la marque `data-cell-padding="compact|large"` du `<table>` (attribut `cellPadding` du nœud, js/grid-editor.js:withTableAttributes), comme le quadrillage : css/editor-v2.css la lit pour l'éditeur, la
// Lecture et les zones d'en-tête et de pied ; le PDF et le PowerPoint relisent la marge sur la première case mesurée, ils la suivent donc sans rien savoir d'elle ; l'HTML, l'e-mail, l'ODT et le Word la lisent ici.
// Les chiffres de chaque niveau sont écrits ICI, une fois, pour que chaque sortie ait les mêmes (la CSS de css/editor-v2.css, dont les variables `--pp-cell-pad-*` les redisent, les suit à la main : l'essai `table_padding_compact_and_large_change_the_cells_and_the_row_and_normal_gives_it_back` les compare).
const CellPadding = (function () {
  const STORAGE = 'pp_table_padding';
  const ATTR = 'data-cell-padding';
  const COMPACT = 'compact';
  const NORMAL = 'normal';
  const LARGE = 'large';
  const LEVELS = [COMPACT, NORMAL, LARGE];

  // Les marges de chaque niveau, en px d'écran : `y` en haut et en bas, `x` à gauche et à droite. « Normal » est celui de css/editor-v2.css avant ce réglage : ne jamais le changer ici sans changer la CSS.
  const PX = {
    [COMPACT]: { y: 1, x: 3 },
    [NORMAL]: { y: 4, x: 6 },
    [LARGE]: { y: 8, x: 12 },
  };
  const PT_PER_PX = 0.75;
  const TWIP_PER_PT = 20;
  const CM_PER_PT = 2.54 / 72;

  // Le niveau qu'une valeur dit, ou null pour « Normal » (et pour tout ce qu'on ne connaît pas : une marque abîmée ne casse rien).
  function normalize(value) {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return text === COMPACT || text === LARGE ? text : null;
  }
  // Le niveau d'un tableau (un élément `<table>` ou son attribut), toujours l'un des trois.
  function levelOf(tableOrValue) {
    const value = tableOrValue && typeof tableOrValue === 'object' && tableOrValue.getAttribute ? tableOrValue.getAttribute(ATTR) : tableOrValue;
    return normalize(value) || NORMAL;
  }
  const pxOf = level => PX[levelOf(level)];
  // Les attributs HTML du nœud : rien pour « Normal ».
  const markAttrs = value => (normalize(value) ? { [ATTR]: normalize(value) } : {});

  // La marge d'une case de tableau dans le Word : les chiffres du niveau, « Normal » compris (4 px en haut et en bas, 6 px sur les côtés, comme l'éditeur, le PDF et l'ODT). Avant la campagne « Fiabiliser les
  // exports » du 27/11, « Normal » n'écrivait rien et gardait les marges de Word (rien en haut ni en bas, 7,2 px sur les côtés) : chaque ligne était 8 px plus basse que dans l'éditeur et le PDF, et une feuille
  // d'émargement de 14 lignes tenait 9 lignes sur sa première page en Word, 7 dans le PDF (carte du 27/11 : « comme l'éditeur et le PDF »).
  function wordMargins(level) {
    const twip = px => Math.round(px * PT_PER_PX * TWIP_PER_PT);
    const { y, x } = PX[levelOf(level)];
    return { top: twip(y), bottom: twip(y), left: twip(x), right: twip(x) };
  }
  // La somme des marges gauche et droite d'une case de ce niveau, en twips : ce que la largeur d'une colonne garde pour son texte.
  function wordSideTwip(level) {
    const margins = wordMargins(level);
    return margins.left + margins.right;
  }

  // Les marges d'une case de l'OpenDocument texte, en centimètres (« 0.106cm ») : celles d'avant pour « Normal ».
  function odtMargins(level) {
    const { y, x } = pxOf(level);
    const cm = px => (Math.round(px * PT_PER_PX * CM_PER_PT * 1000) / 1000) + 'cm';
    return { top: cm(y), bottom: cm(y), left: cm(x), right: cm(x) };
  }
  // La marge d'une case de l'HTML et de l'e-mail : la valeur de `padding` en ligne.
  function cssPadding(level) {
    const { y, x } = pxOf(level);
    return y + 'px ' + x + 'px';
  }

  // Le niveau de départ des tableaux que la personne insère : sa préférence (propre à ce navigateur, ou à l'espace de GFS), « Normal » sans choix.
  const startLevel = () => levelOf(PersonStore.get(STORAGE));
  // Garde le choix (vrai quand le navigateur ou l'espace de GFS l'a retenu) ; une valeur qui n'est pas l'un des trois niveaux n'écrit rien.
  const setStartLevel = level => LEVELS.indexOf(level) !== -1 && PersonStore.set(STORAGE, level);
  // Le libellé de chaque niveau et son info-bulle (clés écrites en entier : l'outil qui cherche les textes sans usage ne lit pas une clé qu'on assemble).
  const LEVEL_KEYS = { [COMPACT]: 'table.paddingCompact', [NORMAL]: 'table.paddingNormal', [LARGE]: 'table.paddingLarge' };
  const LEVEL_TIP_KEYS = { [COMPACT]: 'table.paddingCompactTip', [NORMAL]: 'table.paddingNormalTip', [LARGE]: 'table.paddingLargeTip' };
  // Le réglage de départ tel que SettingsHistory le défait et le rétablit (le coin d'état dit ce qui vient de changer).
  const START_SETTING = {
    read: startLevel,
    write: setStartLevel,
    say: value => I18n.t('status.settingSet', { setting: I18n.t('settings.tablePadding.title'), value: I18n.t(LEVEL_KEYS[levelOf(value)]) }),
  };
  // Les attributs d'un tableau neuf d'après le niveau de départ : rien pour « Normal ».
  const startAttrs = () => ({ cellPadding: normalize(startLevel()) });

  return { STORAGE, ATTR, COMPACT, NORMAL, LARGE, LEVELS, LEVEL_KEYS, LEVEL_TIP_KEYS, PX, normalize, levelOf, pxOf, markAttrs, wordMargins, wordSideTwip, odtMargins, cssPadding, startLevel, setStartLevel, startAttrs, START_SETTING };
})();
