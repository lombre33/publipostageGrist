// Les polices d'un PDF (retour du 11/11 d'un agent de l'État : son texte en Marianne sortait en Roboto, sans un mot). Le PDF est fait dans le widget avec les polices qu'il embarque (Roboto, Arimo,
// Tinos, Gelasio, Cousine, Carlito : js/pdf-fonts.js et js/pdf-fonts-extra.js) ; aucune autre ne peut y entrer, leur licence ne permet pas de les copier d'ici. Avant ce module, tout autre nom retombait sur Roboto
// sans rien dire. Désormais :
//  - le PDF remplace une police qu'il n'a pas par la plus proche qu'il a (`substituteFor` : Cambria par Tinos, Consolas par Cousine, Arial Narrow par Arimo ; sinon Roboto), la même règle que l'import Word et
//    PowerPoint (ExportCommon.Ooxml.nearestFamily) ;
//  - à l'export, une fenêtre « Polices du document » (`review`) dit quelles polices du document seront remplacées et par quoi. Elle ne s'ouvre que s'il y en a une, ou si le document est écrit en Marianne ;
//  - Marianne a son bloc, seulement quand le document l'emploie : la police de l'État dont l'usage est réservé à l'administration (Système de Design de l'État). Avec GFS (extension « polices »,
//    extensions/polices/marianne.js), la personne peut l'inclure en déclarant, case cochée, avoir le droit de s'en servir ; elle est alors lue de jsDelivr le temps de l'export. Hors GFS, le bloc le dit et
//    Marianne est remplacée par Roboto.
// Un export qui ne passe pas par la fenêtre (PDF joint à une ligne, assemblage par GFS...) suit le plan de départ : le remplacement par la plus proche, jamais Marianne. Le plan choisi ne vaut que pour
// l'export qui l'a demandé : js/main-export.js le remet à zéro à sa fin (`reset`).
//    review(texts) -> Promise<plan | null>   texts : le HTML du document (et de ses en-têtes et pieds) ; null : la personne renonce. plan : { marianne }.
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

  const DEFAULT_PLAN = Object.freeze({ marianne: false });
  let plan = DEFAULT_PLAN;

  // La police du PDF qui remplace la famille `lower` (en minuscules) : celle du plan pour Marianne, la plus proche des six sinon, null quand il n'y en a pas (Roboto écrit alors le texte).
  function substituteFor(lower) {
    if (lower === MARIANNE) return plan.marianne ? 'Marianne' : null;
    const near = typeof ExportCommon !== 'undefined' && ExportCommon.Ooxml ? ExportCommon.Ooxml.nearestFamily(lower) : null;
    return near ? PDF_FAMILY[near.toLowerCase()] || null : null;
  }

  // Les familles que les textes nomment en premier (comme le PDF : la première de la liste), sans les noms génériques : { lower -> nom tel qu'écrit }.
  function familiesIn(texts) {
    const found = new Map();
    const pattern = /font-family\s*:\s*([^;"}<]+)/gi;
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

  // Ce qui change pour ces textes : { replaced: [{ name, family }], marianne }. Une famille que le PDF écrit telle quelle (ou par son équivalent de même chasse : Arial par Arimo...) n'est pas comptée.
  function scan(texts) {
    const replaced = [];
    let marianne = false;
    familiesIn(texts).forEach((name, lower) => {
      if (lower === MARIANNE) { marianne = true; return; }
      if (typeof PdfExport !== 'undefined' && PdfExport.hasEmbeddedFamily(lower)) return;
      replaced.push({ name, family: substituteFor(lower) || 'Roboto' });
    });
    return { replaced, marianne };
  }

  // « Tinos (proche de Times New Roman) », ou « Roboto ».
  const describe = family => (LIKE[family] ? I18n.t('pdfFonts.like', { family, like: LIKE[family] }) : family);

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
    const status = el('p', 'pp-fonts-status');
    status.setAttribute('role', 'status');
    choice.append(legend, useRoboto.wrap, include.wrap, consent.wrap, status);
    const rules = el('div', 'pp-fonts-rules');
    const rulesLabel = el('span', 'pp-fonts-rules-label');
    const rulesList = el('ul', 'pp-fonts-rules-list');
    const linkTypography = link(RULES.typography);
    const linkTerms = link(RULES.terms);
    [linkTypography, linkTerms].forEach((a) => { const item = el('li'); item.appendChild(a); rulesList.appendChild(item); });
    rules.append(rulesLabel, rulesList);
    marianne.append(marianneTitle, marianneText, noGfs, activate, choice, rules);

    win.body.append(intro, replaced, marianne);
    const { cancel, ok } = win.addButtons();
    refs = { intro, replaced, replacedTitle, replacedText, list, marianne, marianneTitle, marianneText, noGfs, activate, choice, legend, useRoboto, include, consent, status, rules, rulesLabel, linkTypography, linkTerms, cancel, ok };

    cancel.addEventListener('click', () => { if (current) current.finish(null); });
    win.body.addEventListener('change', () => { setStatus(''); render(); });
    ok.addEventListener('click', accept);
  }

  function setStatus(text, problem) {
    refs.status.textContent = text;
    refs.status.classList.toggle('is-problem', !!problem);
  }
  // La case de la déclaration ne sert qu'avec « Inclure » ; « Exporter » reste grisé tant que la déclaration manque.
  // Ce que la fenêtre dit de l'extension « polices » : active, le choix (Roboto / Inclure) ; sinon la phrase qui dit pourquoi il n'y est pas, et - dans GFS, qui répond - le bouton qui ouvre
  // la fenêtre d'installation de GFS pour la cocher. Rejouée à chaque événement `extensions` de GFS : cochée là-bas, la fenêtre ouverte montre le choix sans se refermer.
  function showAvailability() {
    if (!current || !refs || !current.found.marianne) return;
    const can = Extensions.isActive(EXTENSION);
    const askable = !can && GfsLink.hosted && GfsLink.isAnswering();
    const focusWasOnButton = document.activeElement === refs.activate;
    refs.noGfs.textContent = I18n.t(askable ? 'pdfFonts.marianne.needsExtension' : 'pdfFonts.marianne.needsGfs', { extension: Extensions.nameOf(EXTENSION) });
    refs.noGfs.hidden = can;
    refs.activate.textContent = I18n.t('pdfFonts.marianne.activate', { extension: Extensions.nameOf(EXTENSION) });
    refs.activate.hidden = !askable;
    refs.choice.hidden = !can;
    if (focusWasOnButton && can) refs.useRoboto.input.focus();
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

  // « Exporter le PDF » : sans Marianne, tel quel ; avec elle, d'abord son chargement (la fenêtre reste ouverte et le dit), et si elle ne vient pas la personne choisit Roboto ou réessaie.
  async function accept() {
    if (!current || refs.ok.disabled) return;
    if (!refs.include.input.checked) { current.finish(DEFAULT_PLAN); return; }
    const mine = ++token;
    refs.ok.disabled = true;
    refs.cancel.disabled = false;
    setStatus(I18n.t('pdfFonts.marianne.loading'));
    let result = { ok: false };
    try {
      await Extensions.ensure(EXTENSION);
      await ExportEngines.ensure('pdf');
      await PdfExport.ensurePdfLibsLoaded();
      result = await PolicesMarianne.load(window.pdfMake);
    } catch (e) { result = { ok: false, reason: 'engine' }; }
    if (mine !== token || !current) return;
    if (result.ok) { current.finish(Object.freeze({ marianne: true })); return; }
    setStatus(I18n.t('pdfFonts.marianne.failed'), true);
    render();
  }

  function open(found, canInclude) {
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
      win.show(() => (canInclude && found.marianne ? r.useRoboto.input : r.ok));
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
    if (!found.replaced.length && !found.marianne) return plan;
    const chosen = await open(found, found.marianne && Extensions.isActive(EXTENSION));
    if (!chosen) return null;
    plan = chosen;
    return plan;
  }

  const reset = () => { plan = DEFAULT_PLAN; };

  return { review, reset, substituteFor, scan, familiesIn, current: () => plan, RULES, EXTENSION };
})();
