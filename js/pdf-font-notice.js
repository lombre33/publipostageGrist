// Les polices que le PDF ne peut pas écrire, dites dans l'éditeur (consigne 090 de GFS, demande du porteur du 19/11 : « pour les polices présentes à l'import qui ne peuvent pas être exportées, le message n'est qu'à l'export :
// cela crée un décalage entre la vue éditeur et le reste »). La fenêtre « Polices du document » (js/pdf-font-plan.js : `review`) garde son rôle à l'export, sans rien changer ; ce module dit la même chose AVANT, trois fois :
//  1. un bandeau fin entre la barre d'outils et le texte (#pdf-fonts-bar), qui nomme les polices et ce que le PDF écrira à leur place (les mots `pdfFonts.like` de la fenêtre d'export) ; il paraît à l'ouverture d'un document
//     (import compris : Editor.setHTML le signale par `documentLoaded`) et se ferme ; « Remplacer… » ouvre la fenêtre de remplacement ;
//  2. un moyen de les changer : pour chaque police, une liste (celle que le PDF écrit en premier - « Times New Roman » pour Tinos -, puis les six polices du menu de l'éditeur) et un bouton « Remplacer » qui change cette
//     police PARTOUT d'un coup - le texte, les tableaux, les listes, les cadres, l'en-tête et le pied - en UN seul pas de l'historique Annuler (HistoryMarkers : le geste de l'en-tête et du pied se range dans l'événement du
//     texte). Rien n'est remplacé sans ce geste ;
//  3. une pastille sur le bouton « Police » (#v2-font-chip), qui reste tant que le document en contient, s'éteint quand il n'y en a plus (après un remplacement, ou parce que le texte a été supprimé) et se rallume à chaque
//     ouverture : elle se calcule sur le contenu, jamais sur ce que l'import a dit. L'information ne tient pas à la couleur : l'infobulle et le nom accessible du bouton disent le nombre.
// Ce qui compte comme « ne peut pas être écrit » (choix retenu sur la carte du 19/11) : ce que `PdfFontPlan.scan` met dans `replaced` (Cambria, Consolas... : le PDF écrit la plus proche). Les polices libres et Marianne, que le PDF sait
// inclure AVEC GFS (extension « polices »), ne comptent que quand l'extension manque : là, le PDF les remplace aussi ; avec elle, la personne choisit à l'export (fenêtre « Polices du document ») et l'éditeur ne tranche pas pour elle.
// Le relevé lit ce que le remplacement sait changer : les marques de texte `textStyle` du document (tableaux, listes, cadres, légendes compris) et le brouillon de l'en-tête et du pied. Une police qui ne s'écrit nulle part ailleurs
// (le thème d'une présentation, le style des titres) reste dite à l'export, comme avant. Le relevé suit la frappe d'une demi-seconde, jamais pendant l'édition de l'en-tête et du pied (l'éditeur y montre une zone, pas le document).
//    PdfFontNotice.wire(editor)            : branche l'éditeur (js/main-live.js) ; PdfFontNotice.documentLoaded() : un document vient de se charger (js/editor.js:setHTML)
//    PdfFontNotice.scanNow() -> list       : refait le relevé tout de suite ; list : [{ name, key, family, to }] (name : le nom écrit dans le texte ; family : la police du PDF ; to : la police de l'éditeur qui lui répond)
//    PdfFontNotice.replaceFont(key, to)    : remplace la police `key` (en minuscules) par `to` partout, en un pas d'historique ; rend le nombre de passages changés (0 : rien, ou geste refusé : blockedReason())
//    PdfFontNotice.blockedReason()         : la clé du texte qui dit pourquoi le remplacement est grisé (lecture seule, en-tête ou pied en cours d'écriture, suivi des modifications actif), ou null
// Un macro-modèle (26/11, « je travaille depuis des semaines et je n'ai jamais eu d'avertissement ») : son éditeur est vide (js/main.js:loadMacroIntoEditor, `Editor.setHTML('')`) et son résumé prend la place du texte, donc le bandeau
// y est caché (css/pdf-fonts.css) et le relevé du document ne lit que son en-tête et son pied. Or le PDF écrit les modèles qu'il assemble, et la fenêtre d'export les lit. Le résumé (js/macro-editor.js) dit donc les polices de ces modèles,
// avec le même relevé et les mêmes mots, et le modèle qui les contient (son stylo l'ouvre : le bandeau et « Remplacer… » y sont) :
//    PdfFontNotice.scanModels(models)      : [{ name, key, family, to, models }] pour des modèles { id, nom, contenu } (`models` : leurs noms, dans l'ordre) ; rien n'est lu deux fois (mémorisé par modèle tant que son texte ne change pas)
//    PdfFontNotice.describeFonts(list)     : la phrase du bandeau (« Dans le PDF, 2 polices seront remplacées : … ») pour une liste de polices
//    PdfFontNotice.describeModels(list)    : la même, avec le nom du modèle de chaque police (« …, dans « Lettre » »), pour le résumé d'un macro-modèle
const PdfFontNotice = (function () {
  const el = Dom.el;
  const DELAY_MS = 450;
  const SEPARATOR = ' · ';
  // Les six polices du menu de l'éditeur (js/slide-theme.js:FONTS, les mêmes que js/main-toolbar.js:FONT_FAMILY_PRESETS) : celles que le PDF, le Word et le PowerPoint savent écrire.
  const FALLBACK_FONTS = ['Roboto', 'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Calibri'];
  const editorFonts = () => (typeof SlideTheme !== 'undefined' && SlideTheme.FONTS ? SlideTheme.FONTS.map(font => font.name) : FALLBACK_FONTS);

  let editor = null;
  let wired = false;
  let timer = 0;
  let list = [];            // ce que le PDF remplace dans le document : [{ name, key, family, to }]
  let seen = null;          // la clé de la liste d'avant : le dessin n'est refait que si elle change
  let armed = false;        // un document vient de se charger : le premier relevé qui le lit décide si le bandeau paraît ; une police qui arrive ensuite (un collage) n'allume que la pastille
  let barOpen = false;      // le bandeau est ouvert pour ce document : il se ferme quand la personne le ferme, ou quand il n'y a plus de police à dire ; il ne revient qu'à l'ouverture suivante
  let refs = null;          // le bandeau, le bouton « Police » et sa pastille
  let base = null;          // l'infobulle et le nom accessible du bouton « Police » quand rien n'est à dire
  let win = null;           // la fenêtre de remplacement
  let swap = null;
  let note = '';            // la phrase que la fenêtre garde sous sa liste (ce que le dernier remplacement a fait)
  let shownReason = null;   // la raison de grisé que la fenêtre dit en ce moment (une clé de texte, ou null)

  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const lowerOf = name => String(name || '').toLowerCase();

  // === Le relevé ===

  // Les polices d'écriture (`fontFamily` de la marque `textStyle`) d'un nœud et de tout ce qu'il contient, dans l'ordre où elles paraissent la première fois (celui d'un parcours du document de haut en bas). Mémorisées PAR NŒUD :
  // ProseMirror ne recrée que les nœuds qu'une frappe touche (le paragraphe, ses parents jusqu'au document) et partage tous les autres, de sorte qu'un relevé refait après une lettre ne relit que ce chemin et reprend la réponse
  // de chaque frère au lieu de parcourir tous les nœuds du texte (20/11 : `typing_letter_walks_the_whole_document_a_bounded_number_of_times`). Un nœud ne change jamais : sa réponse mémorisée est toujours juste.
  const NO_FONTS = Object.freeze([]);
  const fontsOfNode = new WeakMap();
  function fontsIn(node) {
    const known = fontsOfNode.get(node);
    if (known) return known;
    let found = NO_FONTS;
    const add = (value) => {
      if (found === NO_FONTS) found = [];
      if (!found.includes(value)) found.push(value);
    };
    if (node.isInline) {
      node.marks.forEach((mark) => {
        const value = mark.type.name === 'textStyle' ? mark.attrs.fontFamily : null;
        if (value) add(value);
      });
    }
    node.content.forEach((child) => { fontsIn(child).forEach(add); });
    // Une feuille (un texte, une image) se relit en un instant : seuls les nœuds qui en contiennent d'autres sont mémorisés.
    if (node.childCount) fontsOfNode.set(node, found);
    return found;
  }

  // Ce que le relevé lit, dans la forme que `PdfFontPlan.scan` comprend (du texte contenant `font-family: …`, ou l'objet de l'en-tête et du pied qu'il met en texte) : chaque valeur distincte des marques de texte du document,
  // puis le brouillon de l'en-tête et du pied. Pas le HTML entier : ce qui se relève est ce qui se remplace.
  function textsOfDocument() {
    const texts = fontsIn(editor.state.doc).map(value => 'font-family: ' + String(value).replace(/"/g, "'"));
    texts.push(HeaderFooterPreview.getHeaderFooterData());
    return texts;
  }

  // Ce que le PDF remplace parmi les polices relevées par `PdfFontPlan.scan` (`found`), dans la forme du bandeau : [{ name, family, key, to }].
  function entriesOf(found) {
    const entries = found.replaced.map(({ name, family }) => ({ name, family }));
    // Sans l'extension « polices », le PDF remplace aussi Marianne (par Roboto) et les polices libres (par la plus proche) : rien à choisir à l'export, c'est dit ici. Avec elle, c'est la personne qui choisit, à l'export.
    if (!Extensions.isActive(PdfFontPlan.EXTENSION)) {
      found.free.forEach((font) => { entries.push({ name: font.name, family: font.family }); });
      if (found.marianne) entries.push({ name: 'Marianne', family: 'Roboto' });
    }
    return entries.map(entry => Object.assign(entry, { key: lowerOf(entry.name), to: PdfFontPlan.likeOf(entry.family) }));
  }

  function scanDocument() {
    return entriesOf(PdfFontPlan.scan(textsOfDocument()));
  }

  // === Les modèles d'un macro-modèle ===

  // Le relevé d'un modèle (`PdfFontPlan.scan` de son texte) tant que son texte ne change pas : le résumé se redessine pour un œil, un crayon, une extension, et un texte de plusieurs mégaoctets ne se relit pas pour autant. Un
  // texte sans « font-family » n'a rien à relever (le relevé le dit sans le parcourir).
  const modelScans = new Map();
  function scanOfModel(id, text) {
    if (!text || text.indexOf('font-family') === -1) return null;
    const known = modelScans.get(id);
    if (known && known.text === text) return known.found;
    const found = PdfFontPlan.scan([text]);
    modelScans.set(id, { text, found });
    return found;
  }

  // Les polices que le PDF remplace dans ces modèles, dans l'ordre où elles paraissent (les modèles dans l'ordre donné), chacune avec les noms des modèles qui l'écrivent. Le même relevé que le document de l'éditeur (`entriesOf`),
  // sur le texte enregistré de chaque modèle : ce que la fenêtre d'export lit du macro-modèle assemblé.
  function scanModels(models) {
    const merged = new Map();
    (models || []).forEach((model) => {
      if (!model) return;
      const found = scanOfModel(String(model.id), typeof model.contenu === 'string' ? model.contenu : '');
      if (!found) return;
      entriesOf(found).forEach((entry) => {
        const known = merged.get(entry.key);
        if (!known) merged.set(entry.key, Object.assign(entry, { models: [model.nom] }));
        else if (!known.models.includes(model.nom)) known.models.push(model.nom);
      });
    });
    return Array.from(merged.values());
  }

  // Le brouillon de l'en-tête et du pied n'est le document que hors de l'édition de ses zones : pendant elle, l'éditeur montre une zone et la liste d'avant reste dite.
  function scanNow() {
    clearTimeout(timer);
    timer = 0;
    if (!wired || !editor || editor.isDestroyed) return list;
    syncSwapReason();
    if (HeaderFooterPreview.isEditingHeaderFooter()) return list;
    // Un gros fichier qui se pose par morceaux n'est relevé qu'une fois posé.
    if (typeof ImportPlacing !== 'undefined' && ImportPlacing.isFilling()) { schedule(); return list; }
    const next = scanDocument();
    const key = next.map(font => font.key + '>' + font.to).join('|');
    const changed = key !== seen;
    const wasOpen = barOpen;
    list = next;
    seen = key;
    if (!list.length) barOpen = false;
    if (armed) { armed = false; if (list.length) barOpen = true; }
    if (changed || barOpen !== wasOpen) render();
    return list;
  }
  // La fenêtre ouverte dit toujours la raison du moment (suivi des modifications posé ou coupé, en-tête en écriture, lecture seule) : sans changement de la liste, elle n'est redessinée que si cette raison a changé.
  function syncSwapReason() {
    if (win && win.isOpen() && blockedReason() !== shownReason) renderSwap();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scanNow, DELAY_MS);
  }

  // Un document vient de se charger (ouverture, import, un autre modèle) : le bandeau de celui d'avant se retire, et le nouveau se montrera dès que le relevé trouve une police.
  function documentLoaded() {
    armed = true;
    barOpen = false;
    if (!wired) return;
    seen = null;
    paintBar();
    schedule();
  }

  // === Ce que l'écran en dit ===

  const describe = font => font.name + ' → ' + PdfFontPlan.describe(font.family);
  // La phrase du bandeau pour une liste de polices (« Dans le PDF, 2 polices seront remplacées : Cambria → Tinos (proche de Times New Roman) · … »), et la même avec, pour chaque police, le modèle qui l'écrit.
  const describeFonts = fonts => I18n.t('pdfFonts.bar.text', { n: fonts.length, list: fonts.map(describe).join(SEPARATOR) });
  const describeModels = fonts => I18n.t('pdfFonts.bar.text', {
    n: fonts.length,
    list: fonts.map(font => I18n.t('pdfFonts.macro.item', { font: describe(font), models: (font.models || []).map(name => I18n.t('pdfFonts.macro.model', { name })).join(', ') })).join(SEPARATOR),
  });

  function paintChip() {
    const n = list.length;
    refs.flag.hidden = n === 0;
    const sentence = n ? I18n.t('pdfFonts.chip', { n }) : '';
    refs.chip.setAttribute('data-tip', sentence ? base.tip + SEPARATOR + sentence : base.tip);
    refs.chip.setAttribute('aria-label', sentence ? base.label + SEPARATOR + sentence : base.label);
  }

  function paintBar() {
    const shown = barOpen && list.length > 0;
    refs.bar.hidden = !shown;
    if (!shown) return;
    // Hors de la barre d'outils, le [data-tip] ne joue pas (css/toolbar-v2.css) : la ligne coupée par « … » se lit en entier au survol par un title natif, comme la languette du panneau du haut (css/bar-fold.css).
    const text = describeFonts(list);
    setText(refs.text, text);
    refs.text.title = text;
  }

  function render() {
    if (!refs) return;
    paintChip();
    paintBar();
    if (win && win.isOpen()) renderSwap();
  }

  // === Le remplacement ===

  // Pourquoi le remplacement est grisé (la clé du texte), ou null : un modèle en lecture seule, l'en-tête ou le pied en cours d'écriture (l'éditeur montre alors une zone, pas le document) et le suivi des modifications (un
  // remplacement partout y serait des centaines de suggestions).
  function blockedReason() {
    if (!editor || editor.isDestroyed || !editor.isEditable) return 'pdfFonts.swap.readOnly';
    if (HeaderFooterPreview.isEditingHeaderFooter()) return 'pdfFonts.swap.headerFooter';
    if (typeof Editor !== 'undefined' && Editor.isTrackChangesOn()) return 'pdfFonts.swap.tracking';
    return null;
  }

  // Les passages de texte du document écrits dans la police `key` : leur marque `textStyle` reprend toutes ses autres valeurs (taille, couleur...) avec la police neuve. Tout part dans UNE transaction, qui ouvre son propre
  // événement de l'historique (`closeHistory$` : pas de groupage avec la frappe d'avant).
  function replaceInDocument(key, to) {
    const { state } = editor;
    const type = state.schema.marks.textStyle;
    if (!type) return 0;
    const tr = state.tr;
    let runs = 0;
    state.doc.descendants((node, pos) => {
      if (!node.isInline) return;
      const mark = node.marks.find(m => m.type === type && m.attrs.fontFamily && lowerOf(PdfFontPlan.firstFamilyOf(m.attrs.fontFamily)) === key);
      if (!mark) return;
      tr.addMark(pos, pos + node.nodeSize, type.create(Object.assign({}, mark.attrs, { fontFamily: to })));
      runs += 1;
    });
    if (!runs) return 0;
    editor.view.dispatch(tr.setMeta('closeHistory$', true));
    return runs;
  }

  // Une déclaration `font-family` du HTML d'une zone, valeur entière (les guillemets peuvent être écrits `&quot;`), remplacée quand sa première famille est `key`.
  const DECLARATION = /font-family\s*:\s*((?:&quot;|&#0?34;|[^;"}<>])+)/gi;
  function rewriteHtml(html, key, to) {
    let changed = false;
    const out = String(html).replace(DECLARATION, (whole, value) => {
      if (lowerOf(PdfFontPlan.firstFamilyOf(value)) !== key) return whole;
      changed = true;
      return 'font-family: ' + to;
    });
    return changed ? out : html;
  }

  // L'en-tête et le pied : le brouillon de leurs zones, réécrit par le chemin que l'historique utilise pour le rendre (HeaderFooterPreview.restore : seules les zones qui diffèrent changent). Vrai si une zone a changé.
  function replaceInHeaderFooter(key, to) {
    const before = HeaderFooterPreview.snapshot();
    const after = JSON.parse(JSON.stringify(before));
    let changed = false;
    ['header', 'footer'].forEach((zone) => {
      ['default', 'first'].forEach((variant) => {
        const html = after[zone] && after[zone][variant];
        if (typeof html !== 'string' || !html) return;
        const next = rewriteHtml(html, key, to);
        if (next === html) return;
        after[zone][variant] = next;
        changed = true;
      });
    });
    return changed && HeaderFooterPreview.restore(after, before);
  }

  // Remplace la police `key` (en minuscules) par `to` dans tout le document. UN pas d'historique : le texte y ouvre son événement, le repère de l'en-tête et du pied (`headerFooter`) s'y range (HistoryMarkers.conclude), et
  // Annuler rend les deux d'un coup. Rend le nombre de passages changés (l'en-tête et le pied comptent pour un).
  function replaceFont(key, to) {
    const wanted = String(to == null ? '' : to).trim();
    if (!wanted || blockedReason()) return 0;
    const name = lowerOf(key);
    let runs = 0;
    let zones = false;
    HistoryMarkers.track('headerFooter', () => {
      runs = replaceInDocument(name, wanted);
      zones = replaceInHeaderFooter(name, wanted);
    });
    // Comme l'Annuler de l'en-tête et du pied (js/history-markers.js) : la page se redessine, et le modèle est marqué modifié (sans texte changé, rien d'autre ne le dirait à l'enregistrement automatique).
    if (zones) {
      Editor.refreshLayout();
      document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
    }
    scanNow();
    return runs + (zones ? 1 : 0);
  }

  // === La fenêtre de remplacement ===

  // Les polices proposées pour `font` : celle que le PDF écrit d'abord (marquée « comme le PDF »), puis les autres du menu de l'éditeur.
  function choicesFor(font) {
    const out = [{ value: font.to, label: I18n.t('pdfFonts.swap.suggest', { font: font.to }) }];
    editorFonts().forEach((name) => { if (name !== font.to) out.push({ value: name, label: name }); });
    return out;
  }

  function ensureSwap() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-font-swap-modal', titleId: 'pp-font-swap-title', size: 'md', boxClass: 'pp-fonts-box', actionsClass: 'var-modal-actions' });
    const intro = el('p', 'pp-fonts-intro');
    const rows = el('ul', 'pp-fonts-list pp-fontswap-list');
    const status = el('p', 'pp-fonts-status pp-fontswap-status');
    status.setAttribute('role', 'status');
    win.body.append(intro, rows, status);
    const close = Dom.button('var-modal-primary');
    win.actions.appendChild(close);
    close.addEventListener('click', () => win.hide());
    swap = { intro, rows, status, close };
  }

  function renderSwap() {
    const hadFocus = win.box.contains(document.activeElement) && document.activeElement !== swap.close;
    win.title.textContent = I18n.t('pdfFonts.swap.title');
    setText(swap.intro, I18n.t('pdfFonts.swap.intro'));
    setText(swap.close, I18n.t('common.close'));
    const reason = blockedReason();
    shownReason = reason;
    swap.rows.textContent = '';
    list.forEach((font) => {
      const row = el('li', 'pp-fonts-row pp-fontswap-row');
      const arrow = el('span', 'pp-fonts-arrow', '→');
      arrow.setAttribute('aria-hidden', 'true');
      const select = el('select', 'pp-fontswap-select');
      select.setAttribute('aria-label', I18n.t('pdfFonts.swap.with', { font: font.name }));
      choicesFor(font).forEach((choice) => {
        const option = el('option', null, choice.label);
        option.value = choice.value;
        select.appendChild(option);
      });
      const apply = Dom.button('pp-fontswap-apply');
      apply.textContent = I18n.t('pdfFonts.swap.apply');
      apply.dataset.font = font.key;
      // Grisé, jamais retiré : la raison est au survol (title), au lecteur d'écran (aria-disabled) et écrite sous la liste.
      if (reason) { apply.setAttribute('aria-disabled', 'true'); apply.title = I18n.t(reason); }
      apply.addEventListener('click', () => {
        if (blockedReason()) return;
        const to = select.value;
        const changed = replaceFont(font.key, to);
        note = changed ? I18n.t('pdfFonts.swap.done', { from: font.name, to }) : '';
        renderSwap();
      });
      row.append(el('span', 'pp-fonts-name', font.name), document.createTextNode(' '), arrow, document.createTextNode(' '), select, document.createTextNode(' '), apply);
      swap.rows.appendChild(row);
    });
    if (!list.length) swap.rows.appendChild(el('li', 'pp-fonts-row', I18n.t('pdfFonts.swap.none')));
    const sentence = [reason ? I18n.t(reason) : '', note].filter(Boolean).join(' ');
    setText(swap.status, sentence);
    // Le bouton cliqué n'existe plus (sa police est remplacée) : le focus passe au champ suivant, ou à « Fermer », au lieu de tomber sur la page.
    if (hadFocus && !win.box.contains(document.activeElement)) (swap.rows.querySelector('select') || swap.close).focus();
  }

  function openSwap() {
    ensureSwap();
    scanNow();
    note = '';
    renderSwap();
    win.show(() => swap.rows.querySelector('select') || swap.close);
  }

  // === Le câblage ===

  function wire(tiptap) {
    if (wired || !tiptap) return;
    const banner = document.getElementById('pdf-fonts-bar');
    const chip = document.getElementById('v2-font-chip');
    const flag = document.getElementById('v2-font-chip-flag');
    if (!banner || !chip || !flag) return;
    wired = true;
    editor = tiptap;
    refs = { bar: banner, chip, flag, text: banner.querySelector('.pp-fonts-bar-text'), swap: banner.querySelector('.pp-fonts-bar-swap'), close: banner.querySelector('.pp-fonts-bar-close') };
    base = { tip: chip.getAttribute('data-tip') || I18n.t('font.family'), label: chip.getAttribute('aria-label') || I18n.t('font.family') };
    refs.swap.addEventListener('click', openSwap);
    refs.close.addEventListener('click', () => {
      barOpen = false;
      paintBar();
      // Le bouton fermé emportait le focus : il retourne au texte.
      if (!editor.isDestroyed) editor.commands.focus();
    });
    // 'transaction' et non 'update' : le chargement d'un modèle ne déclenche pas 'update', et c'est lui qui fait paraître le bandeau. Seul un texte qui change compte.
    editor.on('transaction', ({ transaction }) => { if (transaction.docChanged) schedule(); });
    HeaderFooterPreview.onStoriesChange(schedule);
    Extensions.onChange(schedule);
    scanNow();
  }

  return { wire, documentLoaded, scanNow, replaceFont, openSwap, blockedReason, scanModels, describeFonts, describeModels, fonts: () => list.slice(), isBarShown: () => !!refs && !refs.bar.hidden };
})();
