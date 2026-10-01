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

  // Fenêtre Réglages (audit UX/UI du 2026-09-29, défaut F2). Trois choses qu'un utilisateur voyait et qu'aucun test ne mesurait : la fenêtre, à 360 px,
  // était trop étroite pour ses six onglets, qui passaient sur deux lignes ; sur l'onglet Accès, « Fermer » sortait du panneau de 700x400 (il fallait
  // faire défiler la fenêtre entière, titre et onglets compris) ; et « Crédits » n'était plus atteignable. La mesure à la vraie souris, à 700x400, en
  // clair et en sombre, est dans verify-settings-window-mouse.mjs. Ce cas-ci garde ce que le harnais en page établit quelle que soit la taille de la
  // fenêtre du navigateur : la largeur, les six onglets sur une ligne et sans être coupés, un seul panneau visible à la fois (un `display` posé sur
  // .settings-panel battrait [hidden] et montrerait les six panneaux ensemble - piège déjà rencontré sur #v2-email-fields-row), le défilement porté par la
  // zone de contenu (.settings-body, celle de la base commune des fenêtres, qui contient le panneau affiché) et non par la fenêtre ni par les onglets, « Fermer »
  // sous cette zone et dans la fenêtre. Français et anglais : les libellés d'onglet sont dans les deux langues.
  cases.push({
    id: 'settings_window_holds_six_tabs_on_one_row_and_only_the_panel_scrolls',
    description: 'La fenêtre Réglages fait 480 px, ses six onglets tiennent sur une ligne sans être coupés (français et anglais), un seul panneau s\'affiche à la fois, le défilement est porté par la zone de contenu (le titre et les onglets n\'y sont pas) et « Fermer » reste sous elle, dans la fenêtre (audit du 2026-09-29, défaut F2)',
    run: async (h) => {
      const modal = document.getElementById('settings-modal');
      const content = modal.querySelector('.settings-modal-content');
      const tabs = Array.from(modal.querySelectorAll('.settings-tab'));
      const panels = Array.from(modal.querySelectorAll('.settings-panel'));
      const closeBtn = document.getElementById('settings-close');
      const expectedWidth = Math.min(480, window.innerWidth - 24);
      const problems = [];
      const checked = [];
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          await h.clickButton('v2-btn-settings');
          if (getComputedStyle(modal).display === 'none') { problems.push(lang + ' : la fenêtre ne s\'ouvre pas'); continue; }
          for (const tab of tabs) {
            const name = tab.getAttribute('data-settings-tab');
            tab.click();
            await h.sleep(20);
            const box = content.getBoundingClientRect();
            const closeBox = closeBtn.getBoundingClientRect();
            const shown = panels.filter(p => getComputedStyle(p).display !== 'none').map(p => p.getAttribute('data-settings-panel'));
            const panel = panels.find(p => p.getAttribute('data-settings-panel') === name);
            const panelBox = panel.getBoundingClientRect();
            const scroller = panel.closest('.settings-body');
            const tops = tabs.map(t => t.getBoundingClientRect().top);
            const row = { lang, name, width: Math.round(box.width), tabsSpread: Math.round(Math.max(...tops) - Math.min(...tops)), clippedTabs: tabs.filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.getAttribute('data-settings-tab')), shown: shown.join(','), scrollerOverflowY: scroller ? getComputedStyle(scroller).overflowY : 'aucune zone de contenu', tabsInScroller: !!scroller && tabs.some(t => scroller.contains(t)), windowOverflow: content.scrollHeight - content.clientHeight, closeOutside: closeBox.top < box.top - 1 || closeBox.bottom > box.bottom + 1 || closeBox.bottom > window.innerHeight + 1, closeUnderPanel: panelBox.bottom <= closeBox.top + 1, maxHeight: getComputedStyle(content).maxHeight };
            checked.push(row);
            if (Math.abs(box.width - expectedWidth) > 1) problems.push(lang + '/' + name + ' : largeur ' + row.width + ' au lieu de ' + expectedWidth);
            if (row.tabsSpread > 4) problems.push(lang + '/' + name + ' : les onglets passent sur plusieurs lignes (écart ' + row.tabsSpread + ' px)');
            if (row.clippedTabs.length) problems.push(lang + '/' + name + ' : onglet coupé (' + row.clippedTabs.join(',') + ')');
            if (row.shown !== name) problems.push(lang + '/' + name + ' : panneaux affichés « ' + row.shown + ' »');
            if (row.scrollerOverflowY !== 'auto') problems.push(lang + '/' + name + ' : la zone de contenu ne défile pas (overflow-y ' + row.scrollerOverflowY + ')');
            if (row.tabsInScroller) problems.push(lang + '/' + name + ' : les onglets défilent avec le contenu');
            if (row.windowOverflow > 1) problems.push(lang + '/' + name + ' : la fenêtre entière déborde de ' + row.windowOverflow + ' px');
            if (row.closeOutside) problems.push(lang + '/' + name + ' : « Fermer » hors de la fenêtre');
            if (!row.closeUnderPanel) problems.push(lang + '/' + name + ' : « Fermer » recouvre le panneau');
            if (Math.abs(parseFloat(row.maxHeight) - (window.innerHeight - 24)) > 1) problems.push(lang + '/' + name + ' : hauteur maximale ' + row.maxHeight + ' au lieu de ' + (window.innerHeight - 24) + 'px');
          }
          await h.clickButton('settings-close');
          if (getComputedStyle(modal).display !== 'none') problems.push(lang + ' : « Fermer » ne ferme pas la fenêtre');
        }
      } finally {
        I18n.setLang('fr');
        modal.style.display = 'none';
        tabs[0].click();
      }
      return { pass: problems.length === 0 && checked.length === 2 * tabs.length, notes: JSON.stringify({ expectedWidth, viewport: [window.innerWidth, window.innerHeight], problems: problems.slice(0, 8), sample: checked[0] }) };
    },
  });

  // --- Bascule portrait / paysage (js/orientation-toggle.js, bouton #btn-page-orientation à côté d'Aperçu A4) ---
  // Le bouton ne s'allume que pour les types listés dans OrientationToggle.TYPES (les modèles classiques, depuis que l'éditeur, la Lecture, le PDF et le
  // Word suivent l'orientation) ; ces cas règlent la liste le temps d'un scénario (vide pour simuler « aucun type accepté ») et remettent la liste,
  // l'orientation et la langue d'origine.
  const orientationButton = () => document.getElementById('btn-page-orientation');
  const maskImageOf = el => { const cs = getComputedStyle(el, '::before'); return cs.webkitMaskImage || cs.maskImage || ''; };
  async function restoreOrientationState(typesBefore) {
    OrientationToggle.TYPES.splice(0, OrientationToggle.TYPES.length, ...typesBefore);
    PageLayout.setOrientation('portrait');
    I18n.setLang('fr');
    OrientationToggle.sync();
  }

  cases.push({
    id: 'toolbar_orientation_button_next_to_a4_and_grayed_when_the_type_does_not_follow_it',
    description: 'Le bouton d\'orientation est à côté d\'Aperçu A4, visible et grisé (jamais retiré) pour un document et un email tant que leur type n\'est pas accepté, avec son info-bulle dans les deux langues ; cliquer ne change rien',
    run: async (h) => {
      const typesBefore = OrientationToggle.TYPES.slice();
      const problems = [];
      let signals = 0;
      const onSignal = () => { signals++; };
      document.addEventListener('pp:marginsChanged', onSignal);
      try {
        OrientationToggle.TYPES.splice(0, OrientationToggle.TYPES.length);
        for (const [name, goTo] of [['document', goToNewDocument], ['email', goToNewEmail]]) {
          await goTo(h);
          await h.sleep(60);
          const btn = orientationButton();
          if (!btn) { problems.push(name + ' : bouton absent'); continue; }
          const rect = btn.getBoundingClientRect();
          if (!(rect.width > 0 && rect.height > 0) || getComputedStyle(btn).display === 'none') problems.push(name + ' : bouton masqué');
          if (!btn.previousElementSibling || btn.previousElementSibling.id !== 'v2-a4-toggle') problems.push(name + ' : pas juste après Aperçu A4');
          if (!btn.disabled) problems.push(name + ' : pas grisé (disabled)');
          if (parseFloat(getComputedStyle(btn).opacity) > 0.5) problems.push(name + ' : opacité ' + getComputedStyle(btn).opacity);
          for (const lang of ['fr', 'en']) {
            I18n.setLang(lang);
            await h.sleep(30);
            const want = I18n.t('toolbar.orientation.unavailable');
            if (btn.getAttribute('aria-label') !== want || btn.getAttribute('data-tip') !== want) problems.push(name + '/' + lang + ' : info-bulle « ' + btn.getAttribute('data-tip') + ' » au lieu de « ' + want + ' »');
          }
          I18n.setLang('fr');
          btn.click();
          OrientationToggle.toggle();
          await h.sleep(60);
          if (PageLayout.getOrientation() !== 'portrait') problems.push(name + ' : le clic a changé l\'orientation');
        }
        if (signals !== 0) problems.push(signals + ' signal(aux) pp:marginsChanged alors que rien n\'a changé');
      } finally {
        document.removeEventListener('pp:marginsChanged', onSignal);
        await restoreOrientationState(typesBefore);
        await goToNewDocument(h);
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, typesBefore }) };
    },
  });

  cases.push({
    id: 'toolbar_orientation_button_toggles_the_page_and_signals_the_draft',
    description: 'Dès que le type du modèle est accepté, un vrai clic bascule l\'orientation de la page (icône, état enfoncé et info-bulle suivent), prévient l\'enregistrement automatique par pp:marginsChanged, et un second clic revient au portrait ; un modèle d\'un autre type la regrise',
    run: async (h) => {
      const typesBefore = OrientationToggle.TYPES.slice();
      const problems = [];
      let signals = 0;
      const onSignal = () => { signals++; };
      document.addEventListener('pp:marginsChanged', onSignal);
      try {
        OrientationToggle.TYPES.splice(0, OrientationToggle.TYPES.length, 'document');
        await goToNewDocument(h);
        await h.sleep(60);
        const btn = orientationButton();
        const state = () => ({ page: PageLayout.getOrientation(), data: btn.dataset.orientation, pressed: btn.getAttribute('aria-pressed'), active: btn.classList.contains('active'), label: btn.getAttribute('data-tip'), disabled: btn.disabled, mask: maskImageOf(btn) });
        const before = state();
        if (before.disabled) problems.push('grisé alors que le type est accepté');
        if (before.page !== 'portrait' || before.data !== 'portrait' || before.pressed !== 'false' || before.active) problems.push('état de départ : ' + JSON.stringify(before));
        if (before.label !== I18n.t('toolbar.orientation.portrait')) problems.push('info-bulle de départ : ' + before.label);
        if (before.mask.indexOf("width='12' height='18'") === -1) problems.push('icône de départ : pas une page haute');
        await h.clickButton('btn-page-orientation');
        await h.sleep(60);
        const landscape = state();
        if (landscape.page !== 'landscape' || landscape.data !== 'landscape' || landscape.pressed !== 'true' || !landscape.active) problems.push('après le clic : ' + JSON.stringify(landscape));
        if (landscape.label !== I18n.t('toolbar.orientation.landscape')) problems.push('info-bulle en paysage : ' + landscape.label);
        if (landscape.mask.indexOf("width='18' height='12'") === -1) problems.push('icône en paysage : pas une page large');
        if (PageLayout.getPageSizeMm().width !== 297) problems.push('PageLayout n\'a pas la page en paysage');
        if (signals !== 1) problems.push(signals + ' signal(aux) pp:marginsChanged après un clic (1 attendu)');
        await h.clickButton('btn-page-orientation');
        await h.sleep(60);
        const back = state();
        if (back.page !== 'portrait' || back.data !== 'portrait' || back.pressed !== 'false' || back.active) problems.push('après le second clic : ' + JSON.stringify(back));
        if (signals !== 2) problems.push(signals + ' signal(aux) après deux clics (2 attendus)');
        await goToNewEmail(h);
        await h.sleep(60);
        if (!btn.disabled) problems.push('un email reste dégrisé alors que son type n\'est pas accepté');
      } finally {
        document.removeEventListener('pp:marginsChanged', onSignal);
        await restoreOrientationState(typesBefore);
        await goToNewDocument(h);
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, signals }) };
    },
  });

  // Menu « Enregistrer » (retours d'Antoine du 01/10, points 5 et 6) : « Enregistrer sous » apparaît SOUS le bouton Enregistrer, et la bascule de l'enregistrement
  // automatique quitte la barre pour une ligne cochée du même menu. Ce que le harnais en page établit : la structure (plus aucun des deux anciens contrôles dans la
  // barre, un seul groupe à menu, pas d'info-bulle qui se superposerait au menu), l'accessibilité des lignes, le geste du bouton (un clic enregistre, sans prendre le
  // focus) et celui de « Enregistrer sous… » (copie sous le nom saisi). Le survol et le focus réels, à 700x400, sont dans verify-save-menu-mouse.mjs (saveMenuMouse).
  cases.push({
    id: 'save_menu_sits_under_the_save_button_and_replaces_the_two_old_controls',
    description: 'Le bouton Enregistrer ouvre un menu : « Enregistrer sous… » et la ligne cochée « Enregistrement automatique » (cochée par défaut) y sont, et le bouton « Enregistrer sous » comme la bascule de la barre n\'existent plus ; le titre du menu porte le raccourci, le bouton n\'a plus d\'info-bulle qui se superposerait',
    run: async (h) => {
      const group = document.getElementById('v2-save-group');
      const save = document.getElementById('btn-save');
      const flyout = document.getElementById('v2-save-flyout');
      const title = document.getElementById('v2-save-flyout-label');
      const saveAs = document.getElementById('v2-btn-save-as');
      const auto = document.getElementById('v2-btn-autosave');
      const structure = !!group && !!save && !!flyout && save.parentElement === group && flyout.parentElement === group && group.classList.contains('v2-hover-group');
      const gone = !document.getElementById('btn-save-as') && !document.getElementById('v2-autosave-toggle') && !document.getElementById('v2-toggle-autosave') && !document.querySelector('.autosave-toggle');
      const noTip = !save.hasAttribute('data-tip');
      const shortcut = /(Ctrl\+S|⌘S)/.test(save.getAttribute('aria-label') || '') && title.textContent === save.getAttribute('aria-label');
      const rows = !!saveAs && !!auto && saveAs.getAttribute('role') === 'menuitem' && auto.getAttribute('role') === 'menuitemcheckbox' && saveAs.tabIndex === 0 && auto.tabIndex === 0
        && saveAs.textContent.trim() === 'Enregistrer sous…' && auto.textContent.trim() === 'Enregistrement automatique' && flyout.getAttribute('role') === 'menu';
      const checkedByDefault = auto.getAttribute('aria-checked') === 'true';
      h.openFlyout('#v2-save-group');
      const sb = save.getBoundingClientRect(), ar = saveAs.getBoundingClientRect(), cr = auto.getBoundingClientRect(), fr = flyout.getBoundingClientRect();
      const below = ar.top >= sb.bottom - 1 && cr.top > ar.top && fr.left >= 0 && fr.right <= window.innerWidth;
      const tick = getComputedStyle(auto, '::after');
      const tickShown = tick.visibility === 'visible' && parseFloat(tick.width) > 0;
      const reachable = (() => { const el = document.elementFromPoint(ar.left + ar.width / 2, ar.top + ar.height / 2); return el === saveAs || saveAs.contains(el); })();
      flyout.style.display = ''; flyout.style.opacity = ''; flyout.style.visibility = ''; flyout.style.pointerEvents = '';
      const pass = structure && gone && noTip && shortcut && rows && checkedByDefault && below && tickShown && reachable;
      return { pass, notes: JSON.stringify({ structure, gone, noTip, shortcut, rows, checkedByDefault, below, tickShown, reachable, aria: save.getAttribute('aria-label'), title: title.textContent }) };
    },
  });

  cases.push({
    id: 'save_button_one_click_saves_and_does_not_take_the_focus',
    description: 'Un clic sur Enregistrer enregistre le modèle (un seul geste, aucun menu à ouvrir) et le bouton ne prend pas le focus (mousedown retenu) : le curseur reste dans le texte et le menu ne reste pas ouvert une fois la souris partie',
    run: async (h) => {
      await goToNewDocument(h);
      await h.sleep(30);
      Editor.setHTML('<p>Un seul clic</p>');
      const nameInput = document.getElementById('template-name');
      nameInput.hidden = false;
      nameInput.value = 'Un seul clic enregistre';
      await h.focusAtEnd();
      const save = document.getElementById('btn-save');
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      save.dispatchEvent(down);
      const focusKept = down.defaultPrevented;
      save.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      save.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await h.sleep(500);
      const rows = window.__gristStub.state.rows.Publipostage_Modeles;
      const at = rows.Nom.indexOf('Un seul clic enregistre');
      const stored = at !== -1 && String(rows.Contenu[at]).includes('Un seul clic');
      const status = document.getElementById('status-msg').textContent;
      const pass = focusKept && stored && /Enregistré à|Saved at/.test(status);
      return { pass, notes: JSON.stringify({ focusKept, stored, status }) };
    },
  });

  cases.push({
    id: 'save_button_still_closes_the_rename_field_and_saves_the_typed_name',
    description: 'Renommer puis cliquer Enregistrer : le champ de nom valide et se referme au clic (pas à l\'appui, où la barre se redessinerait sous la souris), le modèle est enregistré sous le nom tapé - retenir le focus sur le bouton ne doit pas laisser le champ ouvert',
    run: async (h) => {
      await goToNewDocument(h);
      await h.sleep(30);
      Editor.setHTML('<p>Renommage</p>');
      const nameInput = document.getElementById('template-name');
      nameInput.value = 'Avant renommage';
      await h.clickButton('btn-save');
      await h.sleep(500);
      document.getElementById('btn-rename-template').click();
      await h.sleep(50);
      const opened = !nameInput.hidden && document.activeElement === nameInput;
      nameInput.value = 'Après renommage';
      const save = document.getElementById('btn-save');
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      save.dispatchEvent(down);
      // à l'appui : le focus reste où il est (le champ ne se referme pas sous la souris, sinon la barre se redessine avant le relâchement)
      const heldOnMousedown = !nameInput.hidden && down.defaultPrevented;
      save.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      save.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await h.sleep(600);
      const closedOnClick = nameInput.hidden && document.activeElement !== nameInput;
      const rows = window.__gristStub.state.rows.Publipostage_Modeles;
      const saved = rows.Nom.includes('Après renommage') && !rows.Nom.includes('Avant renommage');
      const pass = opened && heldOnMousedown && closedOnClick && saved;
      return { pass, notes: JSON.stringify({ opened, heldOnMousedown, closedOnClick, saved, names: rows.Nom.slice(-3) }) };
    },
  });

  cases.push({
    id: 'save_as_row_copies_under_the_typed_name_and_the_keyboard_gets_the_focus_back',
    description: '« Enregistrer sous… » du menu crée une copie sous le nom saisi (l\'original reste), n\'écrit rien si la saisie est annulée, et au clavier (Entrée ou Espace sur la ligne) le focus passe d\'abord sur le bouton Enregistrer, d\'où la fenêtre le lui rend à sa fermeture',
    run: async (h) => {
      await goToNewDocument(h);
      await h.sleep(30);
      Editor.setHTML('<p>Contenu à copier</p>');
      const nameInput = document.getElementById('template-name');
      nameInput.hidden = false;
      nameInput.value = 'Original à copier';
      await h.clickButton('btn-save');
      await h.sleep(500);
      const rows = () => window.__gristStub.state.rows.Publipostage_Modeles;
      const originalId = Templates.getCurrentId();
      const countOf = (name) => rows().Nom.filter(n => n === name).length;
      const row = document.getElementById('v2-btn-save-as');
      let focusWhenAsked = null;
      const asked = h.stubDialogs({ prompt: () => { focusWhenAsked = document.activeElement && document.activeElement.id; return 'Copie du modèle'; } });
      let afterClick, afterCancel, afterKey, titleAsked;
      try {
        h.openFlyout('#v2-save-group');
        await h.clickButton('v2-btn-save-as');
        await h.sleep(600);
        afterClick = { copies: countOf('Copie du modèle'), originals: countOf('Original à copier'), select: document.getElementById('template-select').selectedOptions[0].textContent };
        titleAsked = asked.asked[0] && asked.asked[0].title;
        // saisie annulée : aucune écriture
        Dialogs.prompt = async () => null;
        const before = rows().Nom.length;
        await h.clickButton('v2-btn-save-as');
        await h.sleep(300);
        afterCancel = { same: rows().Nom.length === before };
        // clavier : Entrée sur la ligne focalisée (puis Espace)
        Dialogs.prompt = async () => { focusWhenAsked = document.activeElement && document.activeElement.id; return 'Copie au clavier'; };
        row.focus();
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await h.sleep(600);
        afterKey = { copies: countOf('Copie au clavier'), focus: focusWhenAsked };
        // Espace aussi, et une autre touche ne fait rien
        Dialogs.prompt = async () => 'Copie à l\'espace';
        row.focus();
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
        await h.sleep(300);
        const noneForA = countOf('Copie à l\'espace') === 0;
        const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        row.dispatchEvent(space);
        await h.sleep(600);
        afterKey.space = { copies: countOf('Copie à l\'espace'), noneForA, scrollPrevented: space.defaultPrevented };
      } finally {
        asked.restore();
        document.getElementById('v2-save-flyout').style.cssText = '';
      }
      const pass = afterClick.copies === 1 && afterClick.originals === 1 && /Copie du modèle/.test(afterClick.select) && afterCancel.same && afterKey.copies === 1
        && afterKey.focus === 'btn-save' && afterKey.space.copies === 1 && afterKey.space.noneForA && afterKey.space.scrollPrevented
        && /Enregistrer sous|Save as/.test(titleAsked || '') && originalId != null;
      return { pass, notes: JSON.stringify({ afterClick, afterCancel, afterKey, titleAsked, originalId }) };
    },
  });

  // Un clic de souris sur le bouton d'un menu au survol ne lui donne pas le focus (retours d'Antoine du 01/10, carte « Les deux » : « + », « Qualité PDF » et « Titre »
  // restaient ouverts une fois la souris partie, et le curseur quittait le texte). Mécanisme commun de js/editor-core.js, par délégation. Ce cas parcourt TOUS les groupes à menu
  // présents (découverte structurelle, y compris un groupe créé après coup) et vérifie l'appui retenu (mousedown annulé : seul geste que le harnais en page peut établir, un
  // évènement synthétique ne déplace jamais le focus), puis le champ de saisie rendu au clic. La vraie souris, à 700x400, est dans verify-menu-click-mouse.mjs (menuClickMouse).
  cases.push({
    id: 'toolbar_every_menu_button_refuses_the_focus_on_a_mouse_press_and_blurs_a_text_field_before_its_click',
    description: "Le bouton principal de chaque groupe à menu (« + », Enregistrer, Qualité PDF, Exporter, Titre, ...) retient le focus à l'appui de la souris, pas une ligne de menu ordinaire ni un bouton ordinaire ; un champ de saisie qui avait le focus le perd au clic, avant le gestionnaire du bouton, mais l'éditeur garde le sien",
    run: async (h) => {
      await goToNewDocument(h);
      const triggers = [...document.querySelectorAll('.v2-hover-group')].map(g => g.querySelector(':scope > button')).filter(Boolean);
      const press = (el) => { const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }); el.dispatchEvent(e); return e.defaultPrevented; };
      const notHeld = triggers.filter(t => !press(t)).map(t => t.id || t.className);
      const required = ['btn-new', 'btn-save', 'v2-btn-quality', 'btn-export-pdf', 'v2-heading-chip'];
      const missing = required.filter(id => !triggers.some(t => t.id === id));
      const rowHeld = press(document.getElementById('v2-btn-new-document')); // ligne en <span> d'un menu ordinaire : inchangée
      const plainHeld = press(document.getElementById('btn-delete')); // bouton ordinaire de la barre : inchangé
      const field = document.createElement('input');
      field.type = 'text';
      document.querySelector('.bar-row').appendChild(field);
      const quality = document.getElementById('v2-btn-quality');
      const seen = [];
      const record = () => seen.push(document.activeElement === field ? 'champ encore actif' : 'champ rendu');
      quality.addEventListener('click', record);
      let fieldBlurred, editorKept;
      try {
        field.focus();
        const focusedBefore = document.activeElement === field;
        await h.clickButton('v2-btn-quality');
        fieldBlurred = focusedBefore && document.activeElement !== field;
        await h.focusAtEnd();
        await h.clickButton('v2-btn-quality');
        editorKept = !!document.activeElement && !!document.activeElement.closest('.ProseMirror');
      } finally {
        quality.removeEventListener('click', record);
        field.remove();
      }
      const pass = triggers.length >= 5 && notHeld.length === 0 && missing.length === 0 && !rowHeld && !plainHeld
        && fieldBlurred && seen[0] === 'champ rendu' && editorKept;
      return { pass, notes: JSON.stringify({ triggers: triggers.length, notHeld, missing, rowHeld, plainHeld, fieldBlurred, seen, editorKept }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.toolbarChrome = cases;
})();
