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
  // .v2-hover-flyout-label dans editor-v2.css - généralisé à Titre/Alignement/Liste/Image de la même façon). Corrigé par un mécanisme COMMUN (aria-expanded
  // posé sur le déclencheur - délégation document dans js/editor-core.js pour tout .v2-hover-group au survol/focus, wireDropdownButton/closeDropdownPanel
  // pour les panneaux flottants au clic - + deux règles CSS séparées dans css/toolbar-v2.css) plutôt qu'un correctif par bouton.
  //
  // Trois cas, pour trois affirmations distinctes :
  // 1. La règle CSS elle-même (cas direct [data-tip][aria-expanded]) fonctionne, en isolation d'un widget réel.
  // 2. La règle CSS :has() (cas où data-tip est porté par un ANCÊTRE, ex. #v2-size-stepper) fonctionne aussi, en isolation.
  // 3. CHAQUE bouton à menu réellement présent sur la page (découverte STRUCTURELLE, pas une liste figée d'ids - y compris un .v2-hover-group créé
  //    dynamiquement APRÈS le chargement, ex. #v2-hf-pagenum-group) bascule bien aria-expanded via son VRAI geste d'ouverture/fermeture ; pour ceux dont
  //    le data-tip est porté directement par le déclencheur, on vérifie en plus le RENDU (opacité calculée), avec un vrai `:focus-visible` établi au
  //    préalable pour que l'assertion soit falsifiable (sans focus réel, l'opacité de repos est déjà 0 - cf. piège relevé en relecture, la vérifier une
  //    fois n'aurait rien prouvé).

  cases.push({
    id: 'toolbar_menu_tooltip_css_rule_suppresses_direct',
    description: 'Cas direct, isolé de tout widget réel : la règle CSS masque bien le RENDU de [data-tip]::after dès que aria-expanded="true" est posé sur le bouton lui-même (#v2-btn-bold, qui n\'ouvre aucun menu), et le laisse s\'afficher normalement sinon',
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
    id: 'toolbar_menu_tooltip_css_rule_suppresses_has_ancestor',
    description: 'Cas :has(), isolé sur un élément fabriqué pour l\'occasion : quand data-tip est porté par un ANCÊTRE du bouton qui ouvre réellement le menu (ex. #v2-size-stepper), la règle masque bien le RENDU de son ::after dès que aria-expanded="true" est posé sur ce DESCENDANT - #v2-size-stepper lui-même ne peut jamais recevoir le focus (seuls ses boutons enfants le peuvent), donc ce cas ne peut pas être vérifié avec un `:focus-visible` réel comme le cas direct ci-dessus ; on établit la référence "afficherait normalement" en focusant directement l\'élément fabriqué (qui, lui, porte le data-tip sur l\'élément focusé)',
    run: async (h) => {
      const probe = document.createElement('span');
      probe.setAttribute('data-tip', 'Sonde');
      probe.tabIndex = -1;
      const child = document.createElement('button');
      child.type = 'button';
      probe.appendChild(child);
      document.getElementById('v2-toolbar').appendChild(probe);
      try {
        probe.focus();
        await h.sleep(600);
        const beforeOpacity = getComputedStyle(probe, '::after').opacity;
        child.setAttribute('aria-expanded', 'true');
        await h.sleep(20);
        const duringOpacity = getComputedStyle(probe, '::after').opacity;
        child.setAttribute('aria-expanded', 'false');
        await h.sleep(600);
        const afterOpacity = getComputedStyle(probe, '::after').opacity;
        const pass = beforeOpacity === '1' && duringOpacity === '0' && afterOpacity === '1';
        return { pass, notes: JSON.stringify({ beforeOpacity, duringOpacity, afterOpacity }) };
      } finally {
        probe.remove();
      }
    },
  });

  cases.push({
    id: 'toolbar_every_menu_trigger_toggles_aria_expanded_while_open',
    description: 'Pour CHAQUE bouton à menu réellement présent sur la page (découverte structurelle - tout .v2-hover-group, y compris un créé dynamiquement comme #v2-hf-pagenum-group, + tout [aria-haspopup] posé par wireDropdownButton/TemplateTreeSelect), aria-expanded bascule bien via son VRAI geste d\'ouverture/fermeture ; quand le bouton porte lui-même son data-tip, l\'info-bulle est en plus vérifiée en RENDU (avec un vrai :focus-visible établi au préalable, seule façon de rendre l\'assertion falsifiable)',
    run: async (h) => {
      await goToNewDocument(h);
      await h.sleep(30);
      // Révèle #v2-hf-pagenum-group (injecté à la demande par header-footer-preview.js, absent tant qu'on n'est jamais entré en édition d'en-tête/pied) -
      // sans ce pas, le test ne prouverait la délégation que sur des groupes déjà présents au chargement, pas sur le cas qui l'a motivée.
      document.getElementById('editor-container').classList.add('a4-preview');
      Editor.refreshPaginationPreview();
      await h.sleep(200);
      document.querySelector('#editor-container .v2-page-edge-top').click();
      await h.sleep(30);
      const hfPagenumPresent = !!document.getElementById('v2-hf-pagenum-group');
      // La suite du test tourne PENDANT que la pastille en-tête/pied est encore affichée (donc #v2-hf-pagenum-group encore dans le DOM) - la sortir avant
      // le balayage aurait exclu exactement le groupe qui devait prouver la délégation, en ne gardant qu'un `hfPagenumPresent` qui ne prouve rien de plus
      // qu'un aller-retour sans conséquence.

      const hoverTriggers = Array.from(document.querySelectorAll('.v2-hover-group')).map(g => g.querySelector(':scope > button')).filter(Boolean);
      const clickTriggers = Array.from(document.querySelectorAll('[aria-haspopup]'));
      const triggers = Array.from(new Set([...hoverTriggers, ...clickTriggers]));
      const pagenumTriggerIncluded = triggers.includes(document.getElementById('v2-hf-btn-pagenum'));
      const details = [];
      // Au moins les groupes au survol (titre/alignement/liste/image/qualité/export/nouveau) et les panneaux flottants (police/taille/couleurs) doivent
      // être détectés - un compte trop bas signalerait que ce test tourne avant que le DOM/le câblage ne soit prêt, pas un vrai succès.
      let pass = hfPagenumPresent && pagenumTriggerIncluded && triggers.length >= 6;
      for (const trigger of triggers) {
        const group = trigger.closest('.v2-hover-group');
        // `:hover` ne s'active jamais via dispatchEvent dans ce harnais (cf. openFlyout plus haut/dev-tests/helpers.js) - mouseover/mouseout sont les
        // VRAIS évènements DOM que la délégation de js/editor-core.js écoute pour ce même mécanisme. Les boutons à menu au clic (panneaux flottants,
        // TemplateTreeSelect) basculent, eux, sur le même geste répété (mousedown+click), comme un utilisateur qui rouvre puis referme le même bouton.
        const toggle = (opening) => {
          if (group) { group.dispatchEvent(new MouseEvent(opening ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget: document.body })); return; }
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        };
        // Seul un bouton qui porte LUI-MÊME son data-tip, ET vit dans le PÉRIMÈTRE du système d'info-bulle (.bar-row/#v2-toolbar, css/toolbar-v2.css),
        // peut établir une référence "afficherait normalement" falsifiable ici. Deux exclusions distinctes : (1) :focus-visible ne s'applique qu'à
        // l'élément focusé, jamais à un ancêtre - le cas ancêtre, ex. #v2-size-stepper, est couvert séparément et en isolation ci-dessus, seule façon de
        // le vérifier sans un vrai survol souris que ce harnais ne peut pas simuler ; (2) #v2-hf-btn-pagenum porte un data-tip mais vit dans la pastille
        // en-tête/pied (#editor-container, injectée par header-footer-preview.js), HORS de ce périmètre - son ::after est donc gouverné par la seule
        // autre règle générique en jeu, le point d'accent de .v2-hover-group (opacity: .55, editor-v2.css), jamais par le système d'info-bulle. Bug
        // préexistant sans rapport avec ce correctif (son data-tip n'a jamais affiché d'info-bulle, chevauchement ou non) - non traité ici, mais un
        // bouton hors périmètre ne doit pas non plus faire échouer CE test sur une assertion qui ne peut mécaniquement pas tenir.
        const inTooltipScope = !!trigger.closest('.bar-row, #v2-toolbar');
        const ownTip = (trigger.hasAttribute('data-tip') && inTooltipScope) ? trigger : null;
        let beforeOpacity = null;
        if (ownTip) { trigger.focus(); await h.sleep(600); beforeOpacity = getComputedStyle(ownTip, '::after').opacity; }
        toggle(true);
        await h.sleep(20);
        const expandedDuring = trigger.getAttribute('aria-expanded');
        const opacityDuring = ownTip ? getComputedStyle(ownTip, '::after').opacity : null;
        toggle(false);
        await h.sleep(ownTip ? 600 : 20); // laisse le temps à l'info-bulle de redevenir visible (transition de la règle de base) avant de la relire
        const expandedAfter = trigger.getAttribute('aria-expanded');
        // Lue AVANT le blur() : le bouton est encore réellement :focus-visible juste après la fermeture (l'utilisateur n'a pas bougé le focus), l'info-
        // bulle doit donc redevenir visible ici - blur() plus bas n'est qu'un nettoyage pour le bouton suivant, pas une étape de la vérification.
        const afterOpacity = ownTip ? getComputedStyle(ownTip, '::after').opacity : null;
        if (ownTip) trigger.blur();
        const entryPass = expandedDuring === 'true' && expandedAfter === 'false'
          && (!ownTip || (beforeOpacity === '1' && opacityDuring === '0' && afterOpacity === '1'));
        details.push({ id: trigger.id || trigger.className, ownTip: !!ownTip, beforeOpacity, expandedDuring, opacityDuring, expandedAfter, afterOpacity });
        if (!entryPass) pass = false;
      }
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      return { pass, notes: JSON.stringify({ hfPagenumPresent, pagenumTriggerIncluded, triggerCount: triggers.length, details }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.toolbarChrome = cases;
})();
