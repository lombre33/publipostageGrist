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

  cases.push({
    id: 'toolbar_header_footer_zones_locked_in_email_mode',
    description: 'En mode email, les zones cliquables d\'en-tête/pied de page restent visibles mais deviennent inertes et grisées - un en-tête/pied n\'a aucun sens dans un mailto: (retour d\'Antoine 2026-09-19)',
    run: async (h) => {
      // resetEditor() (appelé par un scénario précédent de ce même groupe) retire .a4-preview de
      // #editor-container pour les scénarios qui ont besoin de la largeur large habituelle (cf. son
      // commentaire dans dev-tests/helpers.js) - sans elle, renderPaginationOverlay() se coupe court
      // (aucune zone de marge créée), exactement le piège que ce commentaire signale déjà.
      document.getElementById('editor-container').classList.add('a4-preview');
      await goToNewEmail(h);
      Editor.refreshPaginationPreview();
      await h.sleep(200);
      const topInEmail = document.querySelector('#editor-container .v2-page-edge-top');
      const lockedInEmail = topInEmail.classList.contains('v2-hf-locked');
      // Lire les valeurs MAINTENANT (pas garder la référence CSSStyleDeclaration) : goToNewDocument()
      // plus bas peut recréer/détacher cette zone (clearPaginationOverlay), et getComputedStyle sur un
      // élément détaché renvoie des chaînes vides pour tout, faussant silencieusement l'assertion.
      const pointerEventsInEmail = getComputedStyle(topInEmail).pointerEvents;
      const opacityInEmail = getComputedStyle(topInEmail).opacity;
      topInEmail.click();
      await h.sleep(30);
      const blockedInEmail = !HeaderFooterPreview.isEditingHeaderFooter();
      await goToNewDocument(h);
      Editor.refreshPaginationPreview();
      await h.sleep(200);
      const topInDocument = document.querySelector('#editor-container .v2-page-edge-top');
      const unlockedInDocument = !topInDocument.classList.contains('v2-hf-locked');
      topInDocument.click();
      await h.sleep(30);
      const enterableInDocument = HeaderFooterPreview.isEditingHeaderFooter();
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      const pass = lockedInEmail && pointerEventsInEmail === 'none' && blockedInEmail && unlockedInDocument && enterableInDocument;
      return { pass, notes: JSON.stringify({ lockedInEmail, pointerEventsInEmail, opacityInEmail, blockedInEmail, unlockedInDocument, enterableInDocument }) };
    },
  });

  // --- Régression 2026-09-28 : l'info-bulle [data-tip] d'un bouton à menu (survol OU clic) s'affichait PAR-DESSUS son propre menu déroulant pendant qu'il
  // est ouvert (retour Antoine, bouton "image" - déjà réglé une fois au cas par cas pour #v2-btn-quality/#btn-export-pdf en leur retirant data-tip, cf.
  // .v2-hover-flyout-label dans editor-v2.css). Corrigé par un mécanisme COMMUN (aria-expanded posé sur le déclencheur par js/editor-core.js -
  // wireHoverGroupTooltipSuppression pour le survol, wireDropdownButton/closeDropdownPanel pour les panneaux flottants - + une seule règle CSS dans
  // css/toolbar-v2.css) plutôt qu'un correctif par bouton. Les deux cas ci-dessous DÉCOUVRENT les boutons à menu depuis le DOM
  // ([aria-haspopup][aria-expanded], posé par ce même mécanisme sur chaque déclencheur), jamais une liste figée d'ids - tout futur bouton à menu suivant
  // la même convention (survol dans un .v2-hover-group, ou aria-expanded posé à l'ouverture/fermeture) est donc couvert automatiquement.

  cases.push({
    id: 'toolbar_menu_tooltip_css_rule_suppresses_on_aria_expanded',
    description: 'Le mécanisme lui-même, isolé de tout widget réel : la règle CSS commune masque bien le RENDU de [data-tip]::after dès que aria-expanded="true" est posé sur un bouton quelconque (#v2-btn-bold, qui n\'ouvre aucun menu), et le laisse s\'afficher normalement sinon',
    run: async (h) => {
      await h.resetEditor();
      const btn = document.getElementById('v2-btn-bold');
      btn.focus();
      await h.sleep(600); // laisse passer le délai de .35s de la transition avant de lire l'opacité calculée (cf. css/toolbar-v2.css)
      const beforeOpacity = getComputedStyle(btn, '::after').opacity;
      btn.setAttribute('aria-expanded', 'true');
      await h.sleep(20);
      const duringOpacity = getComputedStyle(btn, '::after').opacity;
      btn.removeAttribute('aria-expanded');
      await h.sleep(600); // même délai de transition qu'au-dessus : redevenir visible repasse par le .35s de la règle de base, pas par notre override
      const afterOpacity = getComputedStyle(btn, '::after').opacity;
      btn.blur();
      const pass = beforeOpacity === '1' && duringOpacity === '0' && afterOpacity === '1';
      return { pass, notes: JSON.stringify({ beforeOpacity, duringOpacity, afterOpacity }) };
    },
  });

  cases.push({
    id: 'toolbar_every_menu_trigger_hides_its_tooltip_while_open',
    description: 'Pour CHAQUE bouton à menu réellement présent sur la page (découverte dynamique via [aria-haspopup][aria-expanded]), l\'info-bulle associée (la sienne, ou celle d\'un ANCÊTRE qui la porte à sa place - ex. #v2-size-stepper) est masquée à l\'écran tant que son menu est ouvert, et réapparaît normalement une fois refermé',
    run: async (h) => {
      await goToNewDocument(h);
      await h.sleep(30);
      const triggers = Array.from(document.querySelectorAll('[aria-haspopup][aria-expanded]'));
      const details = [];
      // Au moins les groupes au survol (titre/alignement/liste/image) et les panneaux flottants (police/taille/couleurs) doivent être détectés - une liste
      // vide signalerait que le mécanisme n'a pas été câblé (wireToolbar()/TemplateTreeSelect.attach() pas encore appelés), pas un vrai succès.
      let pass = triggers.length >= 6;
      for (const trigger of triggers) {
        // `:hover` ne peut pas être déclenché par dispatchEvent dans ce harnais (cf. openFlyout plus haut/dev-tests/helpers.js) - mouseenter/mouseleave
        // sont les VRAIS évènements DOM que wireHoverGroupTooltipSuppression (js/editor-core.js) écoute pour ce même mécanisme. Les boutons à menu au
        // clic (panneaux flottants, TemplateTreeSelect) basculent, eux, sur le même geste répété (mousedown+click), comme un utilisateur qui rouvre puis
        // referme le même bouton.
        const group = trigger.closest('.v2-hover-group');
        // `:hover` ne s'active jamais ici (ni via dispatchEvent, ni donc via group.matches(':hover')) - un simple booléen local remplace l'état réel que
        // le navigateur tiendrait tout seul en conditions normales.
        let hovered = false;
        const toggle = () => {
          if (group) { hovered = !hovered; group.dispatchEvent(new MouseEvent(hovered ? 'mouseenter' : 'mouseleave', { bubbles: false })); return; }
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        };
        const tipHost = trigger.closest('[data-tip]');
        toggle();
        await h.sleep(20);
        const expandedDuring = trigger.getAttribute('aria-expanded');
        // Une info-bulle native `title` n'apparaît pas dans le DOM et n'aurait donc rien de testable en rendu ici - sans objet aujourd'hui (tout ce
        // mécanisme repose sur [data-tip]), documenté au cas où un futur bouton à menu l'utiliserait à la place.
        const opacityDuring = tipHost ? getComputedStyle(tipHost, '::after').opacity : null;
        toggle();
        await h.sleep(20);
        const expandedAfter = trigger.getAttribute('aria-expanded');
        const entryPass = expandedDuring === 'true' && expandedAfter === 'false' && (tipHost === null || opacityDuring === '0');
        details.push({ id: trigger.id || trigger.className, hasTip: !!tipHost, expandedDuring, opacityDuring, expandedAfter });
        if (!entryPass) pass = false;
      }
      return { pass, notes: JSON.stringify({ triggerCount: triggers.length, details }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.toolbarChrome = cases;
})();
