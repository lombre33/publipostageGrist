// Suite "landmarks" - repères de la page et noms des champs (audit externe de la bêta, 04/10 : « tout le contenu de la page doit être dans un repère », points D-RGAA-region et F-RGAA-04 « 11 champs sans étiquette »).
// Les repères : la barre du haut est le repère « banner », et l'éditeur, le résumé d'un macro-modèle, la carte de l'accès (Édition sans l'accès complet au document) et la Lecture sont chacun le repère « main » - un seul est à l'écran à la fois
// (js/main.js, syncEditorVisibilityForMode), donc la page n'a jamais deux repères principaux visibles. Les noms : chaque champ que le contrôle statique (dev-tests/verify-code-hygiene.mjs, section 15) lit dans index.html porte un nom dans la langue de l'interface.
// Ici, DANS la page : les repères en Édition, en Lecture (vrais boutons de mode) et sous la carte de l'accès, le contenu visible hors de tout repère (ce que reproche la règle « region » d'axe-core : un élément posé à la racine
// de la page, comme la pastille du zoom, doit lui aussi être un repère nommé), et les noms appliqués par I18n en français puis en anglais.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const el = id => document.getElementById(id);
  const shown = node => !!node && getComputedStyle(node).display !== 'none';
  // Les conteneurs qui portent le repère « main » : js/main.js (syncEditorVisibilityForMode) n'en montre qu'un à la fois. Un conteneur de plus ajouté à la page est à mettre ici ET à brancher sur cette fonction.
  const MAIN_IDS = ['editor-container', 'macro-summary-container', 'access-guide-container', 'reader-container'];
  const visibleMains = () => Array.from(document.querySelectorAll('[role="main"]')).filter(shown).map(node => node.id);
  const LANDMARK = '[role="banner"], [role="main"], [role="navigation"], [role="complementary"], [role="contentinfo"], [role="search"], [role="region"][aria-label]';
  const inRead = () => shown(el('reader-container')) && !shown(el('editor-container'));
  const inEdit = () => shown(el('editor-container')) && !shown(el('reader-container'));
  // Du contenu visible (du texte, un bouton, un champ, une image) qui n'est dans aucun repère et n'en est pas un : on descend depuis <body> et on s'arrête à chaque repère.
  const SKIP = ['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META', 'TITLE'];
  function looseContent() {
    const found = [];
    (function walk(node) {
      if (SKIP.indexOf(node.tagName) !== -1 || node.hidden || node.getAttribute('aria-hidden') === 'true') return;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (node.matches(LANDMARK)) return;
      const ownText = Array.from(node.childNodes).some(child => child.nodeType === 3 && child.textContent.trim() !== '');
      if (ownText || node.matches('button, input, select, textarea, a[href], img')) { found.push(node.id || node.className || node.tagName); return; }
      Array.from(node.children).forEach(walk);
    })(document.body);
    return found;
  }
  async function backToEdit() { if (!inEdit()) { el('btn-mode-edit').click(); await waitFor(inEdit, 4000); await sleep(200); } }

  // Le nom qu'un lecteur d'écran donnerait au champ : aria-label, puis aria-labelledby, puis <label for>, puis <label> englobante, puis title. Objet, À, Cc, Cci et le nom du
  // PDF sont des éditeurs d'une ligne (js/field-editor.js) : le champ de texte est la zone de saisie (role="textbox") que leur élément contient, et c'est elle qui porte le nom.
  function nameOf(host) {
    const field = host.classList.contains('pp-field-editor') ? host.querySelector('[role="textbox"]') : host;
    if (!field) return '';
    const own = (field.getAttribute('aria-label') || '').trim();
    if (own) return own;
    const by = field.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\s+/).map(id => (el(id) || {}).textContent || '').join(' ').trim();
      if (text) return text;
    }
    const wrap = field.closest('label');
    if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
    return (field.getAttribute('title') || '').trim();
  }

  cases.push({
    id: 'landmarks_banner_for_the_top_bar_and_one_main_at_a_time',
    description: 'La barre du haut (titre, boutons, état, logo) est le seul repère « banner » ; l\'éditeur, le résumé d\'un macro-modèle, la carte de l\'accès et la Lecture sont les quatre repères « main », jamais visibles ensemble : un seul à l\'écran en Édition, un seul en Lecture ; la barre d\'état, le logo, la case « Aperçu A4 » et le texte édité sont tous dans un repère ; la pastille du zoom est un repère nommé, et rien de visible ne reste hors repère, ni en Édition ni en Lecture',
    run: async (h) => {
      await h.resetEditor();
      I18n.setLang('fr');
      await backToEdit();
      const banners = Array.from(document.querySelectorAll('[role="banner"]')).map(node => node.id);
      const bar = el('toolbar-top');
      const inBanner = ['template-select', 'v2-a4-toggle', 'status-msg', 'v2-brand-logo'].map(id => ({ id, in: !!el(id) && bar.contains(el(id)) }));
      const mains = Array.from(document.querySelectorAll('[role="main"]')).map(node => node.id).sort();
      const edit = visibleMains();
      const looseEdit = looseContent();
      const editorInMain = !!document.querySelector('#editor-container[role="main"] .ProseMirror');
      const outside = ['v2-a4-toggle', 'status-msg', 'v2-brand-logo'].map(id => el(id)).concat([document.querySelector('.ProseMirror')]).filter(node => !node || !node.closest(LANDMARK)).map(node => (node && (node.id || node.className)) || 'absent');
      el('btn-mode-read').click();
      const reading = await waitFor(inRead, 5000);
      await sleep(300);
      const read = visibleMains();
      const looseRead = looseContent();
      await backToEdit();
      const back = visibleMains();
      const got = { banners, inBanner, mains, edit, editorInMain, outside, looseEdit, looseRead, reading, read, back };
      const pass = banners.length === 1 && banners[0] === 'toolbar-top' && inBanner.every(x => x.in)
        && JSON.stringify(mains) === JSON.stringify(MAIN_IDS.slice().sort()) && edit.length === 1 && edit[0] === 'editor-container' && editorInMain && outside.length === 0 && looseEdit.length === 0 && looseRead.length === 0
        && reading && read.length === 1 && read[0] === 'reader-container' && back.length === 1 && back[0] === 'editor-container';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // Sans l'accès complet au document, Grist refuse au widget la lecture et l'écriture des modèles : la carte « Donnez l'accès complet à ce widget » (js/reader-guide.js, renderAccess) prend la place de l'éditeur dans
  // #access-guide-container (js/main.js, syncAccessGuide). Elle est alors le seul repère « main » à l'écran et son contenu y est ; la Lecture garde le sien, et l'accès complet rend le document.
  cases.push({
    id: 'landmarks_access_card_is_the_one_main_while_the_editor_lacks_access',
    description: 'Sans l\'accès complet (« aucun » ou « lecture de la table »), la carte de l\'accès est le seul repère « main » à l\'écran en Édition, son contenu est dans ce repère et rien de visible ne reste hors repère ; la Lecture n\'a que le sien ; l\'accès complet rend le document, dont l\'éditeur redevient le seul repère « main »',
    run: async (h) => {
      await h.resetEditor();
      I18n.setLang('fr');
      await backToEdit();
      const stub = window.__gristStub;
      const cardShown = () => shown(el('access-guide-container'));
      const got = { levels: {} };
      try {
        for (const level of ['none', 'read table']) {
          stub.setAccessLevel(level);
          const appeared = await waitFor(cardShown, 4000);
          await sleep(200);
          got.levels[level] = { appeared, visible: visibleMains(), cardInMain: !!document.querySelector('#access-guide-container[role="main"] > .reader-guide'), loose: looseContent() };
        }
        el('btn-mode-read').click();
        await waitFor(() => shown(el('reader-container')), 5000);
        await sleep(300);
        got.read = visibleMains();
        el('btn-mode-edit').click();
        got.cardBack = await waitFor(cardShown, 4000);
        await sleep(200);
        got.visibleBack = visibleMains();
      } finally {
        stub.setAccessLevel('full');
      }
      got.editorBack = await waitFor(inEdit, 4000);
      await sleep(200);
      got.full = visibleMains();
      got.cardGone = !cardShown() && !el('access-guide-container').firstElementChild;
      got.mains = Array.from(document.querySelectorAll('[role="main"]')).map(node => node.id).sort();
      const only = (list, id) => !!list && list.length === 1 && list[0] === id;
      const cardOk = level => { const x = got.levels[level]; return !!x && x.appeared && only(x.visible, 'access-guide-container') && x.cardInMain && x.loose.length === 0; };
      const pass = cardOk('none') && cardOk('read table') && only(got.read, 'reader-container') && got.cardBack && only(got.visibleBack, 'access-guide-container')
        && got.editorBack && only(got.full, 'editor-container') && got.cardGone && JSON.stringify(got.mains) === JSON.stringify(MAIN_IDS.slice().sort());
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'landmarks_fields_are_named_in_french_and_in_english',
    description: 'Les onze champs que l\'audit trouvait sans nom en ont un, appliqué par I18n dans la langue de l\'interface : nom du modèle, nom de fichier PDF, objet, À, Cc et Cci de l\'e-mail, recherches de la galerie et de la fenêtre « Organiser », caractère déclencheur ; les deux listes de colonnes de la fenêtre des liens ont leur étiquette (<label for>)',
    run: async (h) => {
      await h.resetEditor();
      const FIELDS = [
        ['template-name', 'Nom du modèle', 'Template name'],
        ['pdf-filename-template', 'Nom de fichier PDF (variables #… autorisées)', 'PDF file name (#… variables allowed)'],
        ['v2-email-subject', 'Objet', 'Subject'],
        ['v2-email-to', 'À', 'To'],
        ['v2-email-cc', 'Cc', 'Cc'],
        ['v2-email-cci', 'Copie cachée', 'Bcc'],
        ['tpl-gallery-search', 'Rechercher un modèle…', 'Search for a template…'],
        ['template-organize-search', 'Rechercher un modèle…', 'Search for a template…'],
        ['settings-trigger-char', 'Caractère qui ouvre le panneau #Variable/Puces en cours de frappe.', 'Character that opens the #Variable/Chips panel while typing.'],
      ];
      const got = { fr: {}, en: {}, labels: {} };
      I18n.setLang('fr');
      await sleep(150);
      FIELDS.forEach(([id, fr]) => { got.fr[id] = el(id) ? nameOf(el(id)) : 'absent'; });
      I18n.setLang('en');
      await sleep(150);
      FIELDS.forEach(([id, , en]) => { got.en[id] = el(id) ? nameOf(el(id)) : 'absent'; });
      I18n.setLang('fr');
      ['link-config-col-source', 'link-config-col-cible'].forEach(id => { const label = document.querySelector('label[for="' + id + '"]'); got.labels[id] = !!label && label.id === id.replace('col-', 'table-') + '-name'; });
      const wrong = FIELDS.filter(([id, fr, en]) => got.fr[id] !== fr || got.en[id] !== en).map(([id]) => id);
      const pass = wrong.length === 0 && Object.values(got.labels).every(Boolean);
      return { pass, notes: JSON.stringify({ wrong, got }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.landmarks = cases;
})();
