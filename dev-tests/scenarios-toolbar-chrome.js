// Suite "toolbarChrome" - état du chrome de la barre d'outils (bandeau email, bouton "Créer l'email",
// bouton "modèle par défaut", logo) que la suite historique ne couvrait pas du tout (toutes les autres
// suites portent sur l'éditeur/les exports, jamais sur .bar-row/#v2-toolbar eux-mêmes). Ajoutée suite au
// retour d'Antoine du 2026-09-19 : deux bugs visuels réels sur les boutons "Créer l'email"/"+ Cci"
// n'avaient été repérés par aucun test automatisé.
//
// Limite connue et assumée : ce harnais seede l'état Grist (__gristStub) APRÈS que main.js:init() a déjà
// tourné une première fois sur une page vierge (cf. run-headless.mjs - page.goto puis page.addScriptTag),
// donc un scénario ne peut pas rejouer "le widget démarre avec tel modèle déjà marqué comme défaut" - ça
// demanderait de seeder AVANT le chargement de la page, que le harnais ne permet pas aujourd'hui. Les cas
// ci-dessous vérifient donc le comportement à l'exécution (survol/clic réels), pas la séquence de
// démarrage elle-même.
(function () {
  const cases = [];

  // La propriété .hidden reflète seulement l'ATTRIBUT posé par le JS, pas le rendu réel : une règle CSS
  // auteur qui fixe `display` sur l'élément (ex. #v2-email-fields-row { display:flex }) gagne contre la
  // règle native [hidden]{display:none} de la feuille UA, quelle que soit la spécificité, car l'origine
  // auteur l'emporte toujours sur l'origine UA - l'élément reste donc VISUELLEMENT affiché même avec
  // hidden=true. C'est exactement le bug du 2026-09-19 (bandeau email/bouton "Créer l'email" jamais
  // masqués en réalité, alors que tous les tests qui ne vérifiaient QUE .hidden passaient au vert) - voir
  // le commentaire dans css/toolbar-v2.css à côté de #v2-email-fields-row[hidden]. Un scénario de ce
  // fichier ne doit donc plus jamais asserter `.hidden` seul : toujours via ce helper, qui vérifie le
  // rendu réel en plus de l'attribut.
  function isVisuallyHidden(el) {
    return el.hidden && getComputedStyle(el).display === 'none';
  }
  function isVisuallyShown(el) {
    return !el.hidden && getComputedStyle(el).display !== 'none';
  }

  // Ramène le widget en mode document propre via le VRAI chemin UI (survol "Nouveau" -> clic "Nouveau
  // document"), plutôt que d'appeler une fonction interne - un scénario de chrome doit passer par les
  // mêmes gestes qu'un utilisateur, sinon il peut passer au vert sur un bug qui bloque justement ce geste
  // (c'est très exactement ce qu'Antoine reproche : "je ne peux plus créer de nouveau document").
  async function goToNewDocument(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
  }
  async function goToNewEmail(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-email');
  }

  cases.push({
    id: 'toolbar_email_ui_hidden_on_fresh_load',
    description: 'Au tout premier chargement (aucun modèle, aucun défaut), le bandeau email/le bouton Créer l\'email/le compteur restent masqués - UI de base clean par défaut',
    run: async (h) => {
      const emailRow = document.getElementById('v2-email-fields-row');
      const btnCreateEmail = document.getElementById('btn-create-email');
      const charCounter = document.getElementById('v2-email-char-counter');
      const pass = isVisuallyHidden(emailRow) && isVisuallyHidden(btnCreateEmail) && isVisuallyHidden(charCounter);
      return { pass, notes: JSON.stringify({ emailRowDisplay: getComputedStyle(emailRow).display, btnCreateEmailDisplay: getComputedStyle(btnCreateEmail).display, charCounterDisplay: getComputedStyle(charCounter).display }) };
    },
  });

  cases.push({
    id: 'toolbar_new_document_button_reachable_and_works',
    description: 'Le bouton "Nouveau document" du flyout est réellement cliquable (pas recouvert par un autre élément, notamment le logo) et crée bien un document vide',
    run: async (h) => {
      await h.resetEditor();
      EditorCore.getEditor().commands.setContent('<p>Contenu à jeter</p>');
      await h.sleep(30);
      h.openFlyout('#v2-new-template-group');
      const btn = document.getElementById('v2-btn-new-document');
      const rect = btn.getBoundingClientRect();
      const elAtCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const reachable = elAtCenter === btn || btn.contains(elAtCenter);
      await h.clickButton('v2-btn-new-document');
      const html = EditorCore.getEditor().getHTML();
      const pass = reachable && !html.includes('Contenu à jeter');
      return { pass, notes: JSON.stringify({ reachable, elAtCenter: elAtCenter ? (elAtCenter.id || elAtCenter.className) : null, htmlAfter: html }) };
    },
  });

  cases.push({
    id: 'toolbar_new_email_shows_fields_and_create_button',
    description: '"Nouvel email" affiche le bandeau Objet/À/Cc/Cci, le bouton "Créer l\'email", et verrouille (grise) la mise en forme sans la faire disparaître',
    run: async (h) => {
      await goToNewEmail(h);
      await h.sleep(30);
      const emailRow = document.getElementById('v2-email-fields-row');
      const btnCreateEmail = document.getElementById('btn-create-email');
      const boldBtn = document.getElementById('v2-btn-bold');
      const stillInDom = document.body.contains(boldBtn);
      const pass = isVisuallyShown(emailRow) && isVisuallyShown(btnCreateEmail) && stillInDom && boldBtn.classList.contains('v2-hf-locked');
      return { pass, notes: JSON.stringify({ emailRowDisplay: getComputedStyle(emailRow).display, btnCreateEmailDisplay: getComputedStyle(btnCreateEmail).display, stillInDom, boldLocked: boldBtn.classList.contains('v2-hf-locked') }) };
    },
  });

  cases.push({
    id: 'toolbar_new_document_after_email_hides_everything_back',
    description: 'Depuis un modèle email, "Nouveau document" masque de nouveau le bandeau/le bouton et déverrouille la mise en forme (aucun résidu visuel de l\'état email précédent)',
    run: async (h) => {
      await goToNewEmail(h);
      await h.sleep(30);
      await goToNewDocument(h);
      await h.sleep(30);
      const emailRow = document.getElementById('v2-email-fields-row');
      const btnCreateEmail = document.getElementById('btn-create-email');
      const boldBtn = document.getElementById('v2-btn-bold');
      const pass = isVisuallyHidden(emailRow) && isVisuallyHidden(btnCreateEmail) && !boldBtn.classList.contains('v2-hf-locked');
      return { pass, notes: JSON.stringify({ emailRowDisplay: getComputedStyle(emailRow).display, btnCreateEmailDisplay: getComputedStyle(btnCreateEmail).display, boldLocked: boldBtn.classList.contains('v2-hf-locked') }) };
    },
  });

  cases.push({
    id: 'toolbar_default_template_button_disabled_in_email_mode',
    description: 'Le bouton "Modèle par défaut" est grisé (disabled) sur un modèle email - un modèle email ne doit jamais pouvoir devenir le modèle de démarrage (retour d\'Antoine 2026-09-19)',
    run: async (h) => {
      await goToNewEmail(h);
      await h.sleep(30);
      document.getElementById('template-name').hidden = false;
      document.getElementById('template-name').value = 'EmailPourDefaut';
      await h.clickButton('btn-save');
      await h.sleep(200);
      const disabledOnEmail = document.getElementById('btn-set-default-template').disabled;
      await goToNewDocument(h);
      await h.sleep(30);
      document.getElementById('template-name').hidden = false;
      document.getElementById('template-name').value = 'DocPourDefaut';
      await h.clickButton('btn-save');
      await h.sleep(200);
      const enabledOnDocument = !document.getElementById('btn-set-default-template').disabled;
      return { pass: disabledOnEmail && enabledOnDocument, notes: JSON.stringify({ disabledOnEmail, enabledOnDocument }) };
    },
  });

  cases.push({
    id: 'toolbar_create_email_and_cci_buttons_no_phantom_square',
    description: 'Régression 2026-09-19 : "Créer l\'email" (fond accent + icône) et "+ Cci" (texte pur) ne doivent plus hériter du carré plein générique de #toolbar-top button::before',
    run: async (h) => {
      await goToNewEmail(h);
      await h.sleep(30);
      const createBtn = document.getElementById('btn-create-email');
      const cciBtn = document.getElementById('v2-btn-toggle-cci');
      const createBefore = getComputedStyle(createBtn, '::before');
      const cciBefore = getComputedStyle(cciBtn, '::before');
      const createCs = getComputedStyle(createBtn);
      const cciCs = getComputedStyle(cciBtn);
      const createHasIcon = (createBefore.webkitMaskImage || createBefore.maskImage || 'none') !== 'none';
      const cciHasNoPhantom = cciBefore.content === 'none';
      const createIsAccent = createCs.backgroundColor === 'rgb(47, 111, 237)' && createCs.color === 'rgb(255, 255, 255)';
      const cciHasBorder = cciCs.borderColor !== 'rgba(0, 0, 0, 0)';
      const pass = createHasIcon && cciHasNoPhantom && createIsAccent && cciHasBorder;
      return { pass, notes: JSON.stringify({ createHasIcon, cciHasNoPhantom, createIsAccent, createBg: createCs.backgroundColor, createColor: createCs.color, cciHasBorder, cciBorder: cciCs.borderColor }) };
    },
  });

  cases.push({
    id: 'toolbar_logo_never_overlaps_bar_row_content',
    description: 'Régression 2026-09-19 : le logo Grist Factory (sorti du flux, épinglé en haut à droite) ne doit chevaucher aucun bouton de .bar-row, même à une largeur étroite (panneau Grist réduit)',
    run: async (h) => {
      const prevWidth = document.body.style.width;
      document.documentElement.style.width = '340px';
      document.body.style.width = '340px';
      await h.sleep(50);
      const logo = document.getElementById('v2-brand-logo');
      const barRow = document.querySelector('.bar-row');
      const lr = logo.getBoundingClientRect();
      const overlapping = Array.from(barRow.children).filter(el => {
        if (el === logo) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return !(r.right < lr.left || r.left > lr.right || r.bottom < lr.top || r.top > lr.bottom);
      }).map(el => el.id || el.className);
      document.documentElement.style.width = '';
      document.body.style.width = prevWidth;
      await h.sleep(30);
      return { pass: overlapping.length === 0, notes: JSON.stringify({ overlapping, logoRect: lr }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.toolbarChrome = cases;
})();
