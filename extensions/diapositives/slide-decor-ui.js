// La fenêtre « Décor… » du thème d'une présentation (extension « diapositives » de Grist Factory Suite ; carte « Quel décor le thème pose-t-il sur toutes les diapositives ? », option « Décor réglé dans le thème », 02/11, fil
// « Ajouter un thème de présentation »). La fenêtre « Thème… » (slide-theme-ui.js) l'ouvre par son bouton « Décor… » : elle règle le décor du BROUILLON du thème, rien d'autre. Le décor lui-même (ses données, sa
// géométrie, sa peinture à l'écran et dans chaque sortie) est du socle, js/slide-theme.js.
//  - Quatre réglages : un bandeau de couleur sur un bord (à gauche, en haut ou en bas ; fin, moyen ou épais ; sa couleur est un RÉGLAGE du thème, pas un #rrggbb : le bandeau suit les couleurs du thème), un logo dans
//    un coin (une image de la personne, ramenée à un poids que la page du modèle peut garder), le numéro de la diapositive et un texte de pied (en bas, à gauche, au centre ou à droite ; au même endroit, ils font
//    « texte · 3 »), et une case « pas sur la première diapositive » pour le numéro et le pied.
//  - Un aperçu de la diapositive suit chaque geste. « Appliquer » rend le décor à la fenêtre « Thème… », qui le garde dans son brouillon (rien n'est écrit tant que son « Appliquer » n'est pas cliqué) ; « Annuler »
//    (ou Échap) ne change rien ; « Tout retirer » vide le décor du brouillon.
//  - Le logo : le sélecteur de fichier du navigateur (PNG, JPEG, GIF, WEBP, SVG ou BMP, 10 Mo au plus), puis l'image est redessinée plus petite (jamais agrandie) jusqu'à ce que son adresse de données tienne dans
//    SlideTheme.LOGO_SRC_MAX : en PNG pour garder la transparence, en JPEG quand le PNG reste trop lourd et que l'image est opaque. Un SVG passe par la même voie, donc rastérisé : il n'est jamais gardé tel quel (il peut porter un script).
// Styles : extensions/diapositives/slide-decor-ui.css.
const SlideDecorUi = (function () {
  const el = Dom.el;
  const t = (key, params) => I18n.t(key, params);
  // La page de l'aperçu : une diapositive 16:9 (le papier de la fenêtre « Thème… » l'est aussi), à l'échelle près.
  const NOMINAL_PAGE = Object.freeze({ width: 960, height: 540 });
  const FILE_MAX_MB = 10;
  const SIDES = [480, 384, 300, 240, 192, 150, 120, 96];     // le grand côté du logo, du plus net au plus léger : le premier dont l'adresse de données tient dans SlideTheme.LOGO_SRC_MAX
  const JPEG_QUALITY = 0.85;
  const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp';
  const BAND_COLOR_LABEL_ID = 'pp-slide-decor-band-color';
  const BLANK = Object.freeze({ edge: '', bsize: 'medium', bcolor: 'accent1', logo: null, lpos: 'tr', lsize: 'medium', npos: '', ftext: '', fpos: 'bl', skipFirst: false });

  let win = null;
  let refs = null;
  let state = null;                  // { theme, work, onApply } : le thème du brouillon (couleurs et polices de l'aperçu), ce que la fenêtre règle, ce qu'« Appliquer » rend

  // --- Le décor et ce que la fenêtre en règle ---

  // Les réglages de la fenêtre pour un décor (celui du thème, ou rien).
  function workOf(decor) {
    const d = decor || {};
    return {
      edge: d.band ? d.band.edge : BLANK.edge, bsize: d.band ? d.band.size : BLANK.bsize, bcolor: d.band ? d.band.color : BLANK.bcolor,
      logo: d.logo ? { src: d.logo.src, w: d.logo.w, h: d.logo.h } : null, lpos: d.logo ? d.logo.pos : BLANK.lpos, lsize: d.logo ? d.logo.size : BLANK.lsize,
      npos: d.number ? d.number.pos : BLANK.npos, ftext: d.footer ? d.footer.text : BLANK.ftext, fpos: d.footer ? d.footer.pos : BLANK.fpos,
      skipFirst: !!d.skipFirst,
    };
  }
  // Le décor borné (SlideTheme.normalizeDecor) que ces réglages font, ou null quand il n'y a rien à montrer.
  function decorOf(work) {
    const raw = {};
    if (work.edge) raw.band = { edge: work.edge, size: work.bsize, color: work.bcolor };
    if (work.logo) raw.logo = { src: work.logo.src, w: work.logo.w, h: work.logo.h, pos: work.lpos, size: work.lsize };
    if (work.npos) raw.number = { pos: work.npos };
    if (work.ftext.trim()) raw.footer = { text: work.ftext, pos: work.fpos };
    if (work.skipFirst) raw.skipFirst = true;
    return SlideTheme.normalizeDecor(raw);
  }
  // Une phrase qui dit ce que le décor contient (l'infobulle du bouton « Décor… »).
  function summary(decor) {
    if (!decor) return t('slides.decor.summary.none');
    const parts = ['band', 'logo', 'number', 'footer'].filter(part => decor[part]).map(part => t('slides.decor.summary.' + part));
    return t('slides.decor.summary', { parts: parts.join(', ') });
  }
  // Peint le décor de la diapositive de ce rang (à partir de 0) sur un papier d'aperçu (la fenêtre « Thème… » et celle-ci) : le décor de `theme` à l'échelle du papier (CSS : --pp-decor-scale), derrière son contenu.
  function paintDecor(paper, theme, rank) {
    paper.querySelectorAll(':scope > .pp-slide-decor').forEach(node => node.remove());
    const items = SlideTheme.decorItems(theme, NOMINAL_PAGE, rank);
    if (items.length) paper.prepend(SlideTheme.decorElement(items, 1));
  }

  // --- Le logo ---

  const hasAlpha = (canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let at = 3; at < data.length; at += 4) if (data[at] < 255) return true;
    return false;
  };
  // Le logo { src, w, h } fait d'un fichier image, ou { error } : 'fileTooBig' (plus de 10 Mo), 'unreadable' (le navigateur ne sait pas la lire) ou 'tooBig' (même très réduite, elle ne tient pas dans le poids d'un logo).
  async function logoFrom(file) {
    if (!file || file.size > FILE_MAX_MB * 1024 * 1024) return { error: 'fileTooBig' };
    let image;
    try { image = await ImageIo.load(file); } catch (e) { return { error: 'unreadable' }; }
    const naturalW = image.naturalWidth || 512;
    const naturalH = image.naturalHeight || 512;
    for (let at = 0; at < SIDES.length; at++) {
      const scale = Math.min(1, SIDES[at] / Math.max(naturalW, naturalH));
      const w = Math.max(1, Math.round(naturalW * scale));
      const h = Math.max(1, Math.round(naturalH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(image, 0, 0, w, h);
      const png = canvas.toDataURL('image/png');
      if (png.length <= SlideTheme.LOGO_SRC_MAX) return { logo: { src: png, w, h } };
      // Une image sans un pixel transparent (une photo) tient mieux en JPEG ; une transparente reste en PNG et rapetisse encore.
      if (!hasAlpha(canvas)) {
        const jpeg = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        if (jpeg.length <= SlideTheme.LOGO_SRC_MAX) return { logo: { src: jpeg, w, h } };
      }
    }
    return { error: 'tooBig' };
  }
  async function importLogo(file) {
    const asked = state;
    const result = await logoFrom(file);
    if (!state || state !== asked) return;      // la fenêtre a été fermée (ou rouverte) pendant la lecture : le résultat n'est plus le sien
    if (result.error) { say(t('slides.decor.logo.' + result.error, { max: FILE_MAX_MB })); return; }
    state.work.logo = result.logo;
    say('');
    render();
  }

  // --- La fenêtre ---

  const setOptions = (select, pairs) => {
    const keep = select.value;
    select.replaceChildren(...pairs.map(pair => Dom.option(pair[0], pair[1])));
    select.value = pairs.some(pair => pair[0] === keep) ? keep : pairs[0][0];
  };
  const say = (text) => { if (refs) refs.status.textContent = text; };

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-slide-decor', titleId: 'pp-slide-decor-title', size: 'lg', boxClass: 'pp-slide-decor-box', actionsClass: 'var-modal-actions', onEscape: close });
    const intro = el('p', 'pp-slide-decor-intro');
    intro.id = 'pp-slide-decor-intro';
    win.box.setAttribute('aria-describedby', intro.id);

    // L'aperçu : la diapositive du brouillon (son fond, ses couleurs, ses polices) et le décor par-dessus.
    const paper = el('div', 'pp-slide-theme-paper is-large');
    paper.setAttribute('aria-hidden', 'true');
    const sampleTitle = el('div', 'pp-slide-theme-sample-title');
    const sampleText = el('div', 'pp-slide-theme-sample-text');
    paper.append(sampleTitle, sampleText);
    const side = el('div', 'pp-slide-decor-side');
    side.append(paper);

    const form = el('div', 'pp-slide-decor-form');
    const labels = {};
    const addRow = (name, controls) => {
      const label = el('span', 'pp-slide-decor-row-label');
      label.id = 'pp-slide-decor-row-' + name;
      const group = el('div', 'pp-slide-decor-controls');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-labelledby', label.id);
      group.append(...controls);
      form.append(label, group);
      labels[name] = label;
    };
    const makeSelect = (name, set) => {
      const select = el('select', 'pp-slide-decor-select');
      select.dataset.field = name;
      select.addEventListener('change', () => { if (!state) return; set(select.value); render(); });
      return select;
    };

    // Le bandeau : le bord, l'épaisseur, la couleur (huit réglages du thème : les titres, le texte et les six accents).
    const edge = makeSelect('edge', (value) => { state.work.edge = value; });
    const bsize = makeSelect('bsize', (value) => { state.work.bsize = value; });
    const bandColorLabel = el('span', 'pp-slide-decor-hidden');
    bandColorLabel.id = BAND_COLOR_LABEL_ID;
    const swatches = Dom.radioGroup({
      className: 'pp-slide-decor-swatches', labelId: BAND_COLOR_LABEL_ID, onPick: (slot) => { if (state) { state.work.bcolor = slot; render(); } }, onEnter: commit,
      options: SlideTheme.BAND_COLORS.map(slot => ({ value: slot, className: 'pp-slide-decor-swatch', fill(button) { button.dataset.slot = slot; } })),
    });
    addRow('band', [edge, bsize, bandColorLabel, swatches.group]);

    // Le logo : l'image, son coin, sa taille.
    const logoPick = Dom.button('pp-slide-decor-tool');
    logoPick.addEventListener('click', () => GridXlsxImport.chooseFile(importLogo, ACCEPT));
    const logoClear = Dom.button('pp-slide-decor-tool');
    logoClear.addEventListener('click', () => { if (!state) return; state.work.logo = null; say(''); render(); logoPick.focus(); });
    const lpos = makeSelect('lpos', (value) => { state.work.lpos = value; });
    const lsize = makeSelect('lsize', (value) => { state.work.lsize = value; });
    addRow('logo', [logoPick, logoClear, lpos, lsize]);

    // Le numéro et le texte de pied.
    const npos = makeSelect('npos', (value) => { state.work.npos = value; });
    addRow('number', [npos]);
    const ftext = el('input', 'pp-slide-decor-input');
    ftext.type = 'text';
    ftext.maxLength = SlideTheme.FOOTER_MAX;
    ftext.autocomplete = 'off';
    ftext.spellcheck = false;
    ftext.addEventListener('input', () => { if (!state) return; state.work.ftext = ftext.value; render(); });
    ftext.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } });
    const fpos = makeSelect('fpos', (value) => { state.work.fpos = value; });
    addRow('footer', [ftext, fpos]);

    const skipLabel = el('label', 'pp-slide-decor-check');
    const skip = el('input');
    skip.type = 'checkbox';
    skip.addEventListener('change', () => { if (!state) return; state.work.skipFirst = skip.checked; render(); });
    const skipText = el('span');
    skipLabel.append(skip, skipText);
    form.append(skipLabel);

    const columns = el('div', 'pp-slide-decor-columns');
    columns.append(side, form);
    const status = el('div', 'pp-slide-decor-status');
    status.setAttribute('role', 'status');
    win.body.append(intro, columns, status);

    const { first: clearButton, cancel, ok } = win.addButtons('var-modal-danger pp-slide-decor-clear');
    clearButton.addEventListener('click', () => { if (!state) return; state.work = workOf(null); say(''); render(); });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', commit);

    refs = { intro, paper, sampleTitle, sampleText, labels, edge, bsize, bandColorLabel, swatches, logoPick, logoClear, lpos, lsize, npos, ftext, fpos, skip, skipText, status, clearButton, cancel, ok };
  }

  // Les textes de la fenêtre, dans la langue du moment (relus à chaque ouverture).
  function fill() {
    win.title.textContent = t('slides.decor.title');
    refs.intro.textContent = t('slides.decor.intro');
    refs.sampleTitle.textContent = t('slides.theme.sampleTitle');
    refs.sampleText.textContent = t('slides.theme.sampleText');
    ['band', 'logo', 'number', 'footer'].forEach((name) => { refs.labels[name].textContent = t('slides.decor.' + name); });
    refs.bandColorLabel.textContent = t('slides.decor.band.color');
    setOptions(refs.edge, [['', t('slides.decor.none')], ['left', t('slides.decor.edge.left')], ['top', t('slides.decor.edge.top')], ['bottom', t('slides.decor.edge.bottom')]]);
    setOptions(refs.bsize, [['thin', t('slides.decor.thickness.thin')], ['medium', t('slides.decor.thickness.medium')], ['thick', t('slides.decor.thickness.thick')]]);
    setOptions(refs.lpos, SlideTheme.CORNERS.map(corner => [corner, t('slides.decor.corner.' + corner)]));
    setOptions(refs.lsize, [['small', t('slides.decor.logo.small')], ['medium', t('slides.decor.logo.medium')], ['large', t('slides.decor.logo.large')]]);
    setOptions(refs.npos, [['', t('slides.decor.none')]].concat(SlideTheme.FOOT_SPOTS.map(spot => [spot, t('slides.decor.spot.' + spot)])));
    setOptions(refs.fpos, SlideTheme.FOOT_SPOTS.map(spot => [spot, t('slides.decor.spot.' + spot)]));
    refs.edge.setAttribute('aria-label', t('slides.decor.band.edge'));
    refs.bsize.setAttribute('aria-label', t('slides.decor.band.thickness'));
    refs.lpos.setAttribute('aria-label', t('slides.decor.logo.pos'));
    refs.lsize.setAttribute('aria-label', t('slides.decor.logo.size'));
    refs.npos.setAttribute('aria-label', t('slides.decor.number'));
    refs.fpos.setAttribute('aria-label', t('slides.decor.footer.pos'));
    refs.ftext.setAttribute('aria-label', t('slides.decor.footer'));
    refs.ftext.placeholder = t('slides.decor.footer.placeholder');
    refs.logoClear.textContent = t('slides.decor.logo.remove');
    refs.skipText.textContent = t('slides.decor.skipFirst');
    refs.clearButton.textContent = t('slides.decor.clear');
    refs.cancel.textContent = t('common.cancel');
    refs.ok.textContent = t('slides.theme.apply');
  }

  // Ce que la fenêtre montre pour les réglages du moment : l'aperçu (le thème du brouillon avec ce décor) et l'état de chaque champ. Un champ sans objet (l'épaisseur sans bandeau, le coin sans logo) est grisé, pas retiré.
  function render() {
    const { work, theme } = state;
    const decor = decorOf(work);
    const shown = SlideTheme.normalize(Object.assign({}, theme, { decor }));
    const vars = SlideTheme.cssVars(shown);
    Object.keys(vars).forEach(name => refs.paper.style.setProperty(name, vars[name]));
    paintDecor(refs.paper, shown, 1);

    refs.edge.value = work.edge;
    refs.bsize.value = work.bsize;
    refs.bsize.disabled = !work.edge;
    refs.swatches.check(work.bcolor);
    refs.swatches.buttons.forEach((button) => {
      const slot = button.dataset.slot;
      const label = t('slides.theme.slot.' + slot) + ' · ' + theme.colors[slot].toUpperCase();
      button.style.setProperty('--chip', theme.colors[slot]);
      button.setAttribute('aria-label', label);
      button.title = label;
      button.disabled = !work.edge;
    });
    refs.logoPick.textContent = work.logo ? t('slides.decor.logo.change') : t('slides.decor.logo.choose');
    refs.logoClear.hidden = !work.logo;
    refs.lpos.value = work.lpos;
    refs.lsize.value = work.lsize;
    refs.lpos.disabled = refs.lsize.disabled = !work.logo;
    refs.npos.value = work.npos;
    if (refs.ftext.value !== work.ftext) refs.ftext.value = work.ftext;
    refs.fpos.value = work.fpos;
    refs.fpos.disabled = !work.ftext.trim();
    const hasText = !!work.npos || !!work.ftext.trim();
    refs.skip.checked = work.skipFirst;
    refs.skip.disabled = !hasText;
    refs.skip.parentElement.title = hasText ? '' : t('slides.decor.skipFirst.needs');
  }

  // Ouvre la fenêtre sur le décor de `theme` (le thème du brouillon de la fenêtre « Thème… », normalisé). `onApply(decor)` reçoit le décor choisi (ou null : aucun) quand on clique « Appliquer ».
  function open(options) {
    const theme = SlideTheme.normalize(options && options.theme) || SlideTheme.original();
    ensure();
    fill();
    state = { theme, work: workOf(theme.decor), onApply: options && options.onApply };
    say('');
    render();
    win.show(() => refs.edge);
  }
  function close() {
    if (!win || !win.isOpen()) return;
    state = null;
    win.hide();
  }
  function commit() {
    if (!state) return;
    const { work, onApply } = state;
    const decor = decorOf(work);
    close();
    if (onApply) onApply(decor);
  }

  return { open, close, isOpen: () => !!win && win.isOpen(), paintDecor, summary, logoFrom, workOf, decorOf };
})();
