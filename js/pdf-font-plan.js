// Les polices d'un PDF (retour du 11/11 d'un agent de l'État : son texte en Marianne sortait en Roboto, sans un mot). Le PDF est fait dans le widget avec les polices qu'il embarque (Roboto, Arimo,
// Tinos, Gelasio, Cousine, Carlito : js/pdf-fonts.js et js/pdf-fonts-extra.js) ; aucune autre ne peut y entrer, leur licence ne permet pas de les copier d'ici. Avant ce module, tout autre nom retombait sur Roboto
// sans rien dire. Désormais :
//  - le PDF remplace une police qu'il n'a pas par la plus proche qu'il a (`substituteFor` : Cambria par Tinos, Consolas par Cousine, Arial Narrow par Arimo ; sinon Roboto), la même règle que l'import Word et
//    PowerPoint (ExportCommon.Ooxml.nearestFamily) ;
//  - à l'export, une fenêtre « Polices du document » (`review`) dit quelles polices du document seront remplacées et par quoi. Elle ne s'ouvre que s'il y en a une, ou si le document est écrit en Marianne ;
//  - les polices LIBRES (js/free-fonts.js : Open Sans, Lato, Inter...) ont leur bloc, seulement quand le document en emploie : avec GFS (extension « polices », extensions/polices/libres.js) la personne peut les
//    inclure d'une case, cochée au départ (leur licence permet de les copier : rien à déclarer), lues de jsDelivr le temps de l'export ; hors GFS le bloc le dit et la plus proche les remplace ;
//  - Marianne a son bloc, seulement quand le document l'emploie : la police de l'État dont l'usage est réservé à l'administration (Système de Design de l'État). Avec GFS (extension « polices »,
//    extensions/polices/marianne.js), la personne peut l'inclure en déclarant, case cochée, avoir le droit de s'en servir ; elle est alors lue de jsDelivr le temps de l'export. Hors GFS, le bloc le dit et
//    Marianne est remplacée par Roboto.
// Un export qui ne passe pas par la fenêtre (PDF joint à une ligne, assemblage par GFS...) suit le plan de départ : le remplacement par la plus proche, jamais Marianne. Le plan choisi ne vaut que pour
// l'export qui l'a demandé : js/main-export.js le remet à zéro à sa fin (`reset`).
//    review(texts) -> Promise<plan | null>   texts : le HTML du document (et de ses en-têtes et pieds) ; null : la personne renonce. plan : { marianne, free } (free : les noms, en minuscules, des polices libres incluses).
// L'éditeur dit la même chose AVANT l'export (js/pdf-font-notice.js : un message à l'ouverture, un moyen de les remplacer, une pastille sur « Police ») : il s'appuie sur `scan` pour la liste et sur `likeOf` pour la police de
// l'éditeur qui correspond à celle que le PDF écrit (Tinos : « Times New Roman »), sans rien changer à cette fenêtre.
const PdfFontPlan = (function () {
  const el = Dom.el;
  const EXTENSION = 'polices';
  const MARIANNE = 'marianne';
  // Les adresses des règles de l'État sur la police : la page de la typographie de la marque de l'État (celle que citent les modalités du DSFR) et le texte des modalités d'utilisation du DSFR.
  const RULES = {
    typography: 'https://www.info.gouv.fr/marque-de-letat/la-typographie',
    terms: 'https://github.com/GouvernementFR/dsfr/blob/main/doc/legal/cgu.md',
  };
  // Ce que le texte nomme sans nommer de police.
  const GENERIC = /^(?:sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|inherit|initial|unset|revert|revert-layer|math|emoji|fangsong)$/i;
  // La police du PDF qui répond à chaque famille de l'éditeur (celle qu'ExportCommon.Ooxml.nearestFamily donne) et la famille dont elle a la chasse.
  const PDF_FAMILY = { 'arial': 'Arimo', 'times new roman': 'Tinos', 'georgia': 'Gelasio', 'courier new': 'Cousine', 'calibri': 'Carlito' };
  const LIKE = { Arimo: 'Arial', Tinos: 'Times New Roman', Gelasio: 'Georgia', Cousine: 'Courier New', Carlito: 'Calibri' };

  const DEFAULT_PLAN = Object.freeze({ marianne: false, free: Object.freeze([]) });
  let plan = DEFAULT_PLAN;

  // Les familles que le PDF écrit telles quelles : Roboto et celles que son moteur sait sous un équivalent de même chasse (js/pdf-export.js : FONT_FAMILY_MAP). Le moteur ne se charge qu'au premier export (js/export-engines.js)
  // alors que l'éditeur relève les polices dès l'ouverture (js/pdf-font-notice.js) : tant qu'il n'est pas là, cette liste en tient lieu ; une fois chargé, c'est lui qui décide (l'essai `pdfFontsEditor` compare les deux).
  const WRITTEN_AS_IS = Object.freeze(['roboto', 'arial', 'helvetica', 'times new roman', 'times', 'georgia', 'courier new', 'courier', 'calibri']);
  const writtenAsIs = lower => (typeof PdfExport !== 'undefined' ? PdfExport.hasEmbeddedFamily(lower) : WRITTEN_AS_IS.indexOf(lower) !== -1);

  // La plus proche des six polices du PDF pour la famille `lower` (en minuscules), null quand il n'y en a pas (Roboto écrit alors le texte).
  function closestFor(lower) {
    const near = typeof ExportCommon !== 'undefined' && ExportCommon.Ooxml ? ExportCommon.Ooxml.nearestFamily(lower) : null;
    return near ? PDF_FAMILY[near.toLowerCase()] || null : null;
  }
  // La police du PDF qui remplace la famille `lower` (en minuscules) : celle du plan pour Marianne et pour une police libre incluse, la plus proche des six sinon, null quand il n'y en a pas.
  function substituteFor(lower) {
    if (lower === MARIANNE) return plan.marianne ? 'Marianne' : null;
    if (plan.free.includes(lower)) { const font = FreeFonts.find(lower); if (font) return font.name; }
    return closestFor(lower);
  }

  // Les familles que les textes nomment en premier (comme le PDF : la première de la liste), sans les noms génériques : { lower -> nom tel qu'écrit }. Un objet (l'en-tête et le pied) est lu écrit en JSON, dont les guillemets
  // d'attribut deviennent des « ' » avant la lecture : la valeur s'arrête donc aussi à « > », sinon `style="font-family: Cambria">texte` nommait la police « Cambria'>texte ».
  function familiesIn(texts) {
    const found = new Map();
    const pattern = /font-family\s*:\s*([^;"}<>]+)/gi;
    (texts || []).forEach((raw) => {
      if (raw == null) return;
      const text = (typeof raw === 'string' ? raw : JSON.stringify(raw)).replace(/&quot;|&#0?34;|\\u0022|\\"/g, "'");
      let match;
      while ((match = pattern.exec(text))) {
        const first = match[1].split(',')[0].trim().replace(/^['"]+|['"]+$/g, '').trim();
        const lower = first.toLowerCase();
        if (!first || GENERIC.test(first) || /^var\(/.test(lower) || found.has(lower)) continue;
        found.set(lower, first);
      }
    });
    return found;
  }

  // Ce qui change pour ces textes : { replaced: [{ name, family }], free: [{ name, slug, license, family }], marianne }. Une famille que le PDF écrit telle quelle (ou par son équivalent de même
  // chasse : Arial par Arimo...) n'est pas comptée ; une police libre de js/free-fonts.js va dans `free` (avec la police qui la remplace sans GFS), les autres dans `replaced`.
  function scan(texts) {
    const replaced = [];
    const free = [];
    let marianne = false;
    familiesIn(texts).forEach((name, lower) => {
      if (lower === MARIANNE) { marianne = true; return; }
      if (writtenAsIs(lower)) return;
      const font = typeof FreeFonts !== 'undefined' ? FreeFonts.find(lower) : null;
      if (font) free.push(Object.assign({}, font, { family: closestFor(lower) || 'Roboto' }));
      else replaced.push({ name, family: closestFor(lower) || 'Roboto' });
    });
    return { replaced, free, marianne };
  }

  // « Tinos (proche de Times New Roman) », ou « Roboto ».
  const describe = family => (LIKE[family] ? I18n.t('pdfFonts.like', { family, like: LIKE[family] }) : family);
  // La police du menu de l'éditeur que le PDF écrit sous ce nom : « Times New Roman » pour Tinos, « Roboto » quand le PDF n'a rien de plus proche (Roboto elle-même ou une autre police du PDF sans équivalent).
  const likeOf = family => LIKE[family] || 'Roboto';
  // La première famille d'une valeur de `font-family` (« 'Cambria', serif » -> « Cambria »), comme `familiesIn` la lit dans le texte.
  const firstFamilyOf = value => String(value == null ? '' : value).replace(/&quot;|&#0?34;|\\u0022|\\"/g, "'").split(',')[0].trim().replace(/^['"]+|['"]+$/g, '').trim();

  // === La fenêtre ===

  let win = null;
  let refs = null;
  let current = null;   // { finish(plan | null) }
  let token = 0;        // un chargement de Marianne qui revient après la fermeture de la fenêtre est ignoré

  function check(id, name) {
    const wrap = el('label', 'pp-fonts-check');
    const input = el('input');
    input.type = name ? 'radio' : 'checkbox';
    input.id = id;
    if (name) input.name = name;
    const text = el('span');
    wrap.append(input, text);
    return { wrap, input, text };
  }

  function link(href) {
    const anchor = el('a', 'pp-fonts-link');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-fonts-modal', titleId: 'pp-fonts-title', size: 'md', boxClass: 'pp-fonts-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(null); else win.hide(); },
    });
    const intro = el('p', 'pp-fonts-intro');

    const replaced = el('section', 'pp-fonts-section');
    const replacedTitle = el('h4', 'pp-fonts-heading');
    const replacedText = el('p', 'pp-fonts-text');
    const list = el('ul', 'pp-fonts-list');
    replaced.append(replacedTitle, replacedText, list);

    const free = el('section', 'pp-fonts-section');
    const freeTitle = el('h4', 'pp-fonts-heading');
    const freeText = el('p', 'pp-fonts-text');
    const freeList = el('ul', 'pp-fonts-list');
    const freeNote = el('p', 'pp-fonts-text pp-fonts-free-note');
    const freeActivate = el('button', 'pp-fonts-free-activate');
    freeActivate.type = 'button';
    freeActivate.addEventListener('click', onActivate);
    const freeUse = check('pp-fonts-free');
    free.append(freeTitle, freeText, freeList, freeNote, freeActivate, freeUse.wrap);

    const marianne = el('section', 'pp-fonts-section');
    const marianneTitle = el('h4', 'pp-fonts-heading');
    const marianneText = el('p', 'pp-fonts-text');
    const noGfs = el('p', 'pp-fonts-text pp-fonts-note');
    // Dans GFS, l'extension se coche dans sa fenêtre d'installation (Extensions.explain) : le bouton l'ouvre depuis ici, la fenêtre se met à jour quand GFS dit qu'elle est active.
    const activate = el('button', 'pp-fonts-activate');
    activate.type = 'button';
    activate.addEventListener('click', onActivate);
    const choice = el('fieldset', 'pp-fonts-choice');
    const legend = el('legend', 'pp-fonts-legend');
    const useRoboto = check('pp-fonts-roboto', 'pp-fonts-marianne');
    const include = check('pp-fonts-include', 'pp-fonts-marianne');
    const consent = check('pp-fonts-consent');
    consent.wrap.classList.add('pp-fonts-consent');
    choice.append(legend, useRoboto.wrap, include.wrap, consent.wrap);
    // Ce que dit le chargement (« Téléchargement… », « n'a pas pu être chargée ») : une ligne pour toute la fenêtre.
    const status = el('p', 'pp-fonts-status');
    status.setAttribute('role', 'status');
    const rules = el('div', 'pp-fonts-rules');
    const rulesLabel = el('span', 'pp-fonts-rules-label');
    const rulesList = el('ul', 'pp-fonts-rules-list');
    const linkTypography = link(RULES.typography);
    const linkTerms = link(RULES.terms);
    [linkTypography, linkTerms].forEach((a) => { const item = el('li'); item.appendChild(a); rulesList.appendChild(item); });
    rules.append(rulesLabel, rulesList);
    marianne.append(marianneTitle, marianneText, noGfs, activate, choice, rules);

    win.body.append(intro, replaced, free, marianne, status);
    const { cancel, ok } = win.addButtons();
    refs = { intro, replaced, replacedTitle, replacedText, list, free, freeTitle, freeText, freeList, freeNote, freeActivate, freeUse, marianne, marianneTitle, marianneText, noGfs, activate, choice, legend, useRoboto, include, consent, status, rules, rulesLabel, linkTypography, linkTerms, cancel, ok };

    cancel.addEventListener('click', () => { if (current) current.finish(null); });
    win.body.addEventListener('change', () => { setStatus(''); render(); });
    ok.addEventListener('click', accept);
  }

  function setStatus(text, problem) {
    refs.status.textContent = text;
    refs.status.classList.toggle('is-problem', !!problem);
  }
  // Les lignes du bloc des polices libres : avec l'extension, le nom et la licence ; sans elle, ce qui les remplace dans le PDF.
  function fillFreeRows(found, can) {
    refs.freeList.textContent = '';
    found.free.forEach((font) => {
      const item = el('li', 'pp-fonts-row');
      if (can) item.append(el('span', 'pp-fonts-name', font.name), document.createTextNode(' '), el('span', 'pp-fonts-to', I18n.t('pdfFonts.free.licensed', { license: font.license })));
      else {
        const arrow = el('span', 'pp-fonts-arrow', '→');
        arrow.setAttribute('aria-hidden', 'true');
        item.append(el('span', 'pp-fonts-name', font.name), document.createTextNode(' '), arrow, document.createTextNode(' '), el('span', 'pp-fonts-to', describe(font.family)));
      }
      refs.freeList.appendChild(item);
    });
  }

  // Ce que la fenêtre dit de l'extension « polices » : active, le choix de Marianne (Roboto / Inclure) et la case des polices libres ; sinon la phrase qui dit pourquoi ils n'y sont pas, et - dans GFS,
  // qui répond - le bouton qui ouvre la fenêtre d'installation de GFS pour la cocher. Rejouée à chaque événement `extensions` de GFS : cochée là-bas, la fenêtre ouverte montre le choix sans se refermer.
  function showAvailability() {
    if (!current || !refs) return;
    const found = current.found;
    const can = Extensions.isActive(EXTENSION);
    const askable = !can && GfsLink.hosted && GfsLink.isAnswering();
    const focusWasOnButton = document.activeElement === refs.activate || document.activeElement === refs.freeActivate;
    const name = Extensions.nameOf(EXTENSION);
    if (found.marianne) {
      refs.noGfs.textContent = I18n.t(askable ? 'pdfFonts.marianne.needsExtension' : 'pdfFonts.marianne.needsGfs', { extension: name });
      refs.noGfs.hidden = can;
      refs.activate.textContent = I18n.t('pdfFonts.marianne.activate', { extension: name });
      refs.activate.hidden = !askable;
      refs.choice.hidden = !can;
    }
    if (found.free.length) {
      const wasHidden = refs.freeUse.wrap.hidden;
      refs.freeNote.textContent = I18n.t(askable ? 'pdfFonts.free.needsExtension' : 'pdfFonts.free.needsGfs', { extension: name });
      refs.freeNote.hidden = can;
      refs.freeActivate.textContent = I18n.t('pdfFonts.marianne.activate', { extension: name });
      refs.freeActivate.hidden = !askable;
      refs.freeUse.wrap.hidden = !can;
      if (can && wasHidden) refs.freeUse.input.checked = true;
      fillFreeRows(found, can);
    }
    if (focusWasOnButton && can) (found.marianne ? refs.useRoboto.input : refs.freeUse.input).focus();
  }

  // Le bouton n'est pas grisé pendant la demande (un bouton grisé perd le focus, et deux clics ne posent qu'une demande chez GFS : GfsLink.install).
  async function onActivate() {
    await Extensions.explain(EXTENSION, 'pdfFonts.marianne.feature');
    showAvailability();
  }

  function render() {
    const { include, consent, ok } = refs;
    consent.input.disabled = !include.input.checked;
    if (!include.input.checked) consent.input.checked = false;
    ok.disabled = include.input.checked && !consent.input.checked;
  }

  // « Exporter le PDF » : sans Marianne ni police libre incluse, tel quel ; sinon d'abord leur chargement (la fenêtre reste ouverte et le dit), et si une ne vient pas la personne décoche ou réessaie.
  async function accept() {
    if (!current || refs.ok.disabled) return;
    const found = current.found;
    const wantMarianne = found.marianne && !refs.choice.hidden && refs.include.input.checked;
    const wantFree = found.free.length > 0 && !refs.freeUse.wrap.hidden && refs.freeUse.input.checked;
    if (!wantMarianne && !wantFree) { current.finish(DEFAULT_PLAN); return; }
    const mine = ++token;
    refs.ok.disabled = true;
    refs.cancel.disabled = false;
    setStatus(I18n.t('pdfFonts.loading'));
    let problem = '';
    try {
      await Extensions.ensure(EXTENSION);
      await ExportEngines.ensure('pdf');
      await PdfExport.ensurePdfLibsLoaded();
      if (wantMarianne) {
        const result = await PolicesMarianne.load(window.pdfMake);
        if (!result.ok) problem = I18n.t('pdfFonts.marianne.failed');
      }
      if (!problem && wantFree) {
        const result = await PolicesLibres.load(window.pdfMake, found.free);
        if (!result.ok) problem = I18n.t('pdfFonts.free.failed', { font: result.font || '' });
      }
    } catch (e) { problem = I18n.t(wantMarianne ? 'pdfFonts.marianne.failed' : 'pdfFonts.free.failed', { font: '' }); }
    if (mine !== token || !current) return;
    if (!problem) { current.finish(Object.freeze({ marianne: wantMarianne, free: Object.freeze(wantFree ? found.free.map(font => font.name.toLowerCase()) : []) })); return; }
    setStatus(problem, true);
    render();
  }

  function open(found) {
    ensure();
    if (current) current.finish(null);
    token++;
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        if (current && current.stop) current.stop();
        current = null;
        token++;
        win.hide();
        resolve(value);
      };
      current = { finish, found };
      const stop = Extensions.onChange(showAvailability);
      current.stop = stop;
      const r = refs;
      win.title.textContent = I18n.t('pdfFonts.title');
      r.intro.textContent = I18n.t('pdfFonts.intro');
      r.replaced.hidden = !found.replaced.length;
      r.replacedTitle.textContent = I18n.t('pdfFonts.replaced.title');
      r.replacedText.textContent = I18n.t('pdfFonts.replaced.text');
      r.list.textContent = '';
      found.replaced.forEach(({ name, family }) => {
        const item = el('li', 'pp-fonts-row');
        const arrow = el('span', 'pp-fonts-arrow', '→');
        arrow.setAttribute('aria-hidden', 'true');
        item.append(el('span', 'pp-fonts-name', name), document.createTextNode(' '), arrow, document.createTextNode(' '), el('span', 'pp-fonts-to', describe(family)));
        r.list.appendChild(item);
      });
      r.free.hidden = !found.free.length;
      r.freeTitle.textContent = I18n.t('pdfFonts.free.title');
      r.freeText.textContent = I18n.t('pdfFonts.free.text');
      r.freeUse.text.textContent = I18n.t('pdfFonts.free.include');
      r.freeUse.input.checked = false;
      r.freeUse.wrap.hidden = true;
      r.marianne.hidden = !found.marianne;
      r.marianneTitle.textContent = I18n.t('pdfFonts.marianne.title');
      r.marianneText.textContent = I18n.t('pdfFonts.marianne.text');
      showAvailability();
      r.legend.textContent = I18n.t('pdfFonts.marianne.legend');
      r.useRoboto.text.textContent = I18n.t('pdfFonts.marianne.replace');
      r.include.text.textContent = I18n.t('pdfFonts.marianne.include');
      r.consent.text.textContent = I18n.t('pdfFonts.marianne.consent');
      r.useRoboto.input.checked = true;
      r.include.input.checked = false;
      r.consent.input.checked = false;
      r.rulesLabel.textContent = I18n.t('pdfFonts.marianne.rules');
      r.linkTypography.textContent = I18n.t('pdfFonts.marianne.link.typography');
      r.linkTerms.textContent = I18n.t('pdfFonts.marianne.link.terms');
      r.cancel.textContent = I18n.t('common.cancel');
      r.ok.textContent = I18n.t('pdfFonts.export');
      r.cancel.disabled = false;
      setStatus('');
      render();
      const can = Extensions.isActive(EXTENSION);
      win.show(() => (can && found.marianne ? r.useRoboto.input : can && found.free.length ? r.freeUse.input : r.ok));
      // Le focus donné au choix de Marianne (plus bas dans la fenêtre) la fait défiler : on la rend en haut, où se lisent la phrase et les polices remplacées.
      win.body.scrollTop = 0;
    });
  }

  // La fenêtre, quand le document a de quoi la justifier ; rend le plan choisi (DEFAULT_PLAN quand rien ne se demande), ou null si la personne renonce.
  async function review(texts) {
    plan = DEFAULT_PLAN;
    if (typeof ModalBase === 'undefined') return plan;
    await ExportEngines.ensure('pdf');
    const found = scan(texts);
    if (!found.replaced.length && !found.free.length && !found.marianne) return plan;
    const chosen = await open(found);
    if (!chosen) return null;
    plan = chosen;
    return plan;
  }

  const reset = () => { plan = DEFAULT_PLAN; };

  return { review, reset, substituteFor, scan, familiesIn, likeOf, firstFamilyOf, describe, writtenAsIs, WRITTEN_AS_IS, current: () => plan, RULES, EXTENSION };
})();
