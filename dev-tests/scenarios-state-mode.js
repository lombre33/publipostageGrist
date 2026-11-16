// Suite "stateMode" - le mode « Identité de l'État » (DSFR), premier lot : le socle (js/state-mode.js, extension `etat` de js/extensions.js, GristAPI.getInstanceHost, la section de Réglages > Thème).
// Demande d'Antoine (13/11, lancée le 16/11) : un mode DSFR à activer à la main, avec une validation que la personne a le droit de le faire. Le droit ne se prouve pas : trois verrous (l'extension chez GFS, deux constats
// qui avertissent sans bloquer - l'instance et l'adresse en .gouv.fr -, une déclaration de qualité dans une liste fermée), et « une autre structure » n'active rien. Quatre décisions d'Antoine : sans GFS tout est
// grisé ; rien ne reconnaît la personne : on avertit puis on la laisse déclarer ; le bloc-marque vient plus tard ; backlog prêt à dev.
// Joué « hébergé » (dev-tests/gfs-stub.js) : l'extension `etat` est active ou non selon `setExtensions`. Les constats (GristAPI.getInstanceHost, GristAPI.peekCurrentUser) sont remplacés par des valeurs fabriquées :
// la lecture réelle de l'hôte a son essai dans dev-tests/unit-grist-api-core.mjs. Le même parcours à la vraie souris dans le panneau de 700x400 : dev-tests/verify-state-mode-mouse.mjs (stateModeMouse).
(function () {
  const cases = [];
  const KEY = 'pp_etat_declaration';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const overlay = () => document.getElementById('pp-etat-modal');
  const isOpen = () => !!overlay() && overlay().style.display !== 'none';
  const waitOpen = async () => { for (let i = 0; i < 100 && !isOpen(); i++) await sleep(30); return isOpen(); };
  const waitClosed = async () => { for (let i = 0; i < 100 && isOpen(); i++) await sleep(30); return !isOpen(); };
  const pick = selector => overlay().querySelector(selector);
  const okButton = () => pick('.var-modal-primary');
  const cancelButton = () => pick('.pp-modal-actions button:not(.var-modal-primary)');
  const radio = name => pick('#pp-etat-quality-' + name);
  const consent = () => pick('#pp-etat-consent');
  const button = () => document.getElementById('settings-etat-button');
  const hint = () => document.getElementById('settings-etat-hint').textContent;
  const stateText = () => document.getElementById('settings-etat-state').textContent;
  const shown = node => !!node && !node.hidden && !node.closest('[hidden]');
  const signalStates = () => Array.from(overlay().querySelectorAll('.pp-etat-signal')).map(row => row.dataset.state);
  // Les constats sont lus en tâche de fond après l'ouverture : on attend qu'aucun ne soit « en cours ».
  const waitSignals = async () => { for (let i = 0; i < 100 && (signalStates().length !== 2 || signalStates().includes('checking')); i++) await sleep(30); return signalStates(); };
  const stored = () => PersonStore.get(KEY);
  const clean = () => { PersonStore.remove(KEY); StateMode.syncSettings(); };

  async function withExtensions(list, fn) {
    const stub = window.__gfsStub;
    const before = stub.extensions.slice();
    stub.setExtensions(list);
    for (let i = 0; i < 60 && Extensions.isActive('etat') !== list.includes('etat'); i++) await sleep(30);
    try { return await fn(); } finally { stub.setExtensions(before); await sleep(60); clean(); }
  }
  // Les constats fabriqués : l'hôte de l'instance et l'adresse de la personne (la session la connaît déjà, ou ne la lit pas : '').
  async function withSignals(fake, fn) {
    const kept = { host: GristAPI.getInstanceHost, peek: GristAPI.peekCurrentUser, mail: GristAPI.getCurrentUserEmail };
    GristAPI.getInstanceHost = async () => fake.host;
    GristAPI.peekCurrentUser = () => ({ email: fake.email || '', name: '' });
    GristAPI.getCurrentUserEmail = async () => { throw new Error('illisible (essai)'); };
    try { return await fn(); } finally { GristAPI.getInstanceHost = kept.host; GristAPI.peekCurrentUser = kept.peek; GristAPI.getCurrentUserEmail = kept.mail; }
  }
  // Ouvre la fenêtre par le bouton de Réglages, comme la personne.
  async function openByButton() {
    button().click();
    return waitOpen();
  }
  // La déclaration complète, par la fenêtre ouverte.
  async function declareIn(quality) {
    radio(quality).click();
    consent().click();
    okButton().click();
    return waitClosed();
  }
  const ed = () => EditorCore.getEditor();
  const keyEvent = key => new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
  const settle = async () => { await ActionHistory.whenIdle(); await sleep(120); };
  async function undo() { ed().commands.focus('end'); await sleep(60); ed().view.dom.dispatchEvent(keyEvent('z')); await settle(); }
  async function redo() { ed().commands.focus('end'); await sleep(60); ed().view.dom.dispatchEvent(keyEvent('y')); await settle(); }

  const GOUV = { host: 'grist.numerique.gouv.fr', email: 'agent@interieur.gouv.fr' };

  cases.push({
    id: 'statemode_etat_is_a_known_extension_with_nothing_to_load',
    description: 'L’extension « etat » est au registre de GFS, son nom suit la langue ; active, elle se charge sans rien demander (son code viendra avec le bloc-marque) ; inactive, elle refuse',
    run: async () => {
      const bad = [];
      if (!Extensions.isKnown('etat')) bad.push('« etat » inconnue du registre');
      if (Extensions.nameOf('etat') !== I18n.t('extension.etat.name') || !Extensions.nameOf('etat') || Extensions.nameOf('etat') === 'etat') bad.push('nom=' + Extensions.nameOf('etat'));
      await withExtensions(['graphique'], async () => {
        let refused = false;
        try { await Extensions.ensure('etat'); } catch (e) { refused = true; }
        if (!refused) bad.push('inactive : ensure ne refuse pas');
      });
      await withExtensions(['graphique', 'etat'], async () => {
        let error = '';
        try { await Extensions.ensure('etat'); } catch (e) { error = String(e && e.message); }
        if (error) bad.push('active : ensure refuse (' + error + ')');
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statemode_everything_is_greyed_without_the_extension',
    description: 'Sans l’extension : le bouton de Réglages est grisé (aria-disabled, jamais retiré), la raison est dans la phrase et au survol, le mode ne s’allume pas même avec une déclaration gardée (qui reste intacte), et le clic demande à GFS d’installer « etat »',
    run: async () => withExtensions(['graphique'], async () => {
      const bad = [];
      clean();
      const view = StateMode.view();
      if (view.kind !== 'unavailable') bad.push('kind=' + view.kind);
      const b = button();
      if (!b) return result(['le bouton de la section est absent']);
      if (b.getAttribute('aria-disabled') !== 'true' || !b.classList.contains('is-disabled')) bad.push('bouton non grisé : ' + b.className + ' ' + b.getAttribute('aria-disabled'));
      if (b.disabled) bad.push('le bouton ne doit pas être `disabled` (il reste atteignable au clavier et explique au clic)');
      if (!b.title || b.title !== hint()) bad.push('raison au survol=' + JSON.stringify(b.title) + ' phrase=' + JSON.stringify(hint()));
      if (!hint().includes(Extensions.nameOf('etat'))) bad.push('la phrase ne nomme pas l’extension : ' + hint());
      if (stateText() !== I18n.t('settings.etat.state.unavailable')) bad.push('état=' + stateText());
      // Une déclaration valable gardée ne rend rien « allumé » quand l’extension est éteinte, et n’est pas effacée.
      const record = JSON.stringify({ v: StateMode.TEXT_VERSION, quality: 'etat', date: '2026-11-01', on: true });
      PersonStore.set(KEY, record);
      if (StateMode.isOn()) bad.push('allumé sans l’extension');
      if (StateMode.setOn(true)) bad.push('setOn(true) a réussi sans l’extension');
      if (stored() !== record) bad.push('la déclaration gardée a changé : ' + stored());
      // Le clic explique : GFS reçoit la demande d’installation de « etat ».
      window.__gfsStub.calls.length = 0;
      b.click();
      for (let i = 0; i < 60 && !window.__gfsStub.calls.some(c => c.nom === 'installer'); i++) await sleep(30);
      const call = window.__gfsStub.calls.find(c => c.nom === 'installer');
      if (!call || !call.args || call.args.extension !== 'etat') bad.push('installer(etat) non demandé : ' + JSON.stringify(window.__gfsStub.calls));
      if (isOpen()) bad.push('la fenêtre d’activation s’ouvre sans l’extension');
      return result(bad);
    }),
  });

  cases.push({
    id: 'statemode_case_a_recognised_instance_and_address',
    description: 'Cas A (maquette 1) : instance et adresse en .gouv.fr, les deux constats sont cochés, pas d’avertissement ; la déclaration reste obligatoire (aucune qualité choisie, case vide, « Activer le mode » grisé) ; Annuler ne garde rien ; l’adresse n’est jamais écrite en entier',
    run: async () => withExtensions(['graphique', 'etat'], () => withSignals(GOUV, async () => {
      const bad = [];
      clean();
      if (!(await openByButton())) return result(['la fenêtre ne s’ouvre pas']);
      const states = await waitSignals();
      if (!same(states, ['ok', 'ok'])) bad.push('constats=' + states.join());
      if (shown(pick('.pp-etat-warn'))) bad.push('avertissement montré pour une personne reconnue');
      if (Array.from(overlay().querySelectorAll('input[name="pp-etat-quality"]')).length !== 4) bad.push('qualités=' + overlay().querySelectorAll('input[name="pp-etat-quality"]').length);
      if (Array.from(overlay().querySelectorAll('input[name="pp-etat-quality"]')).some(r => r.checked)) bad.push('une qualité est cochée d’avance');
      if (consent().checked) bad.push('la case est cochée d’avance');
      if (!okButton().disabled) bad.push('« Activer le mode » n’est pas grisé avant la déclaration');
      const text = overlay().textContent;
      if (!text.includes('interieur.gouv.fr') || text.includes('agent@') || text.includes('agent')) bad.push('adresse montrée : ' + text.slice(0, 400));
      if (!overlay().querySelector('a[href^="https://www.info.gouv.fr/"]') || !overlay().querySelector('a[href*="GouvernementFR/dsfr"]')) bad.push('les deux liens des règles manquent');
      if (!text.includes(I18n.t('etat.notice'))) bad.push('la phrase « Ce widget n’est pas un service de l’État » manque');
      cancelButton().click();
      if (!(await waitClosed())) bad.push('Annuler ne ferme pas');
      if (stored() !== null) bad.push('Annuler a gardé quelque chose : ' + stored());
      if (StateMode.isOn() || StateMode.isDeclared()) bad.push('allumé ou déclaré après Annuler');
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_case_b_nothing_recognises_the_person_warns_then_lets_declare',
    description: 'Cas B (maquette 1) : ni l’instance ni l’adresse ne sont en .gouv.fr (adresse illisible) : un avertissement ambre, et la déclaration reste possible (on ne bloque pas : académies, opérateurs, prestataires) ; une déclaration complète allume le mode et garde qualité, date et version du texte',
    run: async () => withExtensions(['graphique', 'etat'], () => withSignals({ host: 'docs.getgrist.com', email: '' }, async () => {
      const bad = [];
      clean();
      if (!(await openByButton())) return result(['la fenêtre ne s’ouvre pas']);
      const states = await waitSignals();
      if (!same(states, ['no', 'unknown'])) bad.push('constats=' + states.join());
      if (!shown(pick('.pp-etat-warn'))) bad.push('pas d’avertissement');
      if (!shown(pick('.pp-etat-warn')) || !pick('.pp-etat-warn').textContent.includes('.gouv.fr')) bad.push('avertissement=' + pick('.pp-etat-warn').textContent);
      // La case seule ne suffit pas, la qualité seule non plus.
      radio('prestataire').click();
      if (!okButton().disabled) bad.push('OK actif avec la qualité seule');
      consent().click();
      if (okButton().disabled) bad.push('OK grisé avec la déclaration complète');
      consent().click();
      if (!okButton().disabled) bad.push('OK actif avec la case décochée');
      consent().click();
      okButton().click();
      if (!(await waitClosed())) bad.push('la fenêtre ne se ferme pas');
      const keep = JSON.parse(stored() || 'null');
      if (!keep || keep.v !== StateMode.TEXT_VERSION || keep.quality !== 'prestataire' || keep.on !== true || !/^\d{4}-\d\d-\d\d$/.test(keep.date)) bad.push('déclaration gardée=' + stored());
      if (!StateMode.isOn() || !StateMode.isDeclared()) bad.push('le mode ne s’allume pas');
      if (button().dataset.kind !== 'on' || button().textContent !== I18n.t('settings.etat.button.deactivate') || !stateText().includes('·')) bad.push('section=' + button().dataset.kind + ' / ' + stateText() + ' / ' + button().textContent);
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_one_of_two_signals_missing_still_warns',
    description: 'L’instance en .gouv.fr mais une adresse d’ailleurs (ou l’inverse) : l’avertissement paraît quand même, les constats disent lequel manque',
    run: async () => withExtensions(['graphique', 'etat'], async () => {
      const bad = [];
      for (const [fake, want] of [[{ host: 'grist.numerique.gouv.fr', email: 'personne@exemple.fr' }, ['ok', 'no']], [{ host: 'docs.getgrist.com', email: 'agent@interieur.gouv.fr' }, ['no', 'ok']]]) {
        await withSignals(fake, async () => {
          clean();
          if (!(await openByButton())) { bad.push('fenêtre fermée'); return; }
          const states = await waitSignals();
          if (!same(states, want)) bad.push(JSON.stringify(fake) + ' : constats=' + states.join());
          if (!shown(pick('.pp-etat-warn'))) bad.push(JSON.stringify(fake) + ' : pas d’avertissement');
          cancelButton().click();
          await waitClosed();
        });
      }
      return result(bad);
    }),
  });

  cases.push({
    id: 'statemode_case_c_another_body_activates_nothing',
    description: 'Cas C (maquette 1) : « une autre structure » ferme la porte : la case de déclaration disparaît, « Activer le mode » reste grisé, la phrase l’explique, rien n’est écrit ; Échap ferme sans rien garder',
    run: async () => withExtensions(['graphique', 'etat'], () => withSignals(GOUV, async () => {
      const bad = [];
      clean();
      if (!(await openByButton())) return result(['la fenêtre ne s’ouvre pas']);
      await waitSignals();
      radio('autre').click();
      if (!shown(pick('.pp-etat-info'))) bad.push('la phrase d’explication ne paraît pas');
      if (shown(consent())) bad.push('la case de déclaration reste montrée');
      if (!okButton().disabled) bad.push('« Activer le mode » actif pour une autre structure');
      okButton().click();
      await sleep(80);
      if (!isOpen()) bad.push('un clic sur le bouton grisé a fermé la fenêtre');
      if (stored() !== null || StateMode.isOn()) bad.push('quelque chose est gardé : ' + stored());
      // Une case cochée avant de changer d’avis ne reste pas cochée pour une autre structure.
      radio('etat').click();
      consent().click();
      radio('autre').click();
      if (consent().checked) bad.push('la case reste cochée pour une autre structure');
      radio('etat').click();
      if (consent().checked) bad.push('la case revient cochée quand on retourne à une qualité activable (elle doit être redonnée)');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      if (!(await waitClosed())) bad.push('Échap ne ferme pas la fenêtre');
      if (stored() !== null || StateMode.isOn()) bad.push('Échap a gardé quelque chose : ' + stored());
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_turning_off_keeps_the_declaration_and_turning_on_does_not_ask_again',
    description: 'Éteindre garde la déclaration (qualité, date) : « Rallumer » n’ouvre aucune fenêtre ; chaque bascule est un seul geste du bouton',
    run: async () => withExtensions(['graphique', 'etat'], () => withSignals(GOUV, async () => {
      const bad = [];
      clean();
      await openByButton();
      await waitSignals();
      await declareIn('operateur');
      const first = JSON.parse(stored());
      if (!StateMode.isOn() || button().dataset.kind !== 'on') bad.push('pas allumé après la déclaration : ' + button().dataset.kind);
      button().click();   // Éteindre
      await sleep(80);
      const off = JSON.parse(stored());
      if (StateMode.isOn() || !StateMode.isDeclared()) bad.push('éteindre doit garder la déclaration : on=' + StateMode.isOn() + ' déclaré=' + StateMode.isDeclared());
      if (!off || off.on !== false || off.quality !== first.quality || off.date !== first.date || off.v !== first.v) bad.push('déclaration changée en éteignant : ' + stored());
      if (button().dataset.kind !== 'declared' || button().textContent !== I18n.t('settings.etat.button.resume')) bad.push('bouton éteint=' + button().dataset.kind + ' / ' + button().textContent);
      if (!hint().includes('2026') && !hint().includes(String(new Date().getFullYear()))) bad.push('phrase sans la date : ' + hint());
      button().click();   // Rallumer : aucune fenêtre
      await sleep(150);
      if (isOpen()) bad.push('« Rallumer » rouvre la fenêtre');
      if (!StateMode.isOn() || button().dataset.kind !== 'on') bad.push('pas rallumé : ' + button().dataset.kind);
      const back = JSON.parse(stored());
      if (!back || back.quality !== first.quality || back.date !== first.date) bad.push('rallumer a changé la déclaration : ' + stored());
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_a_new_text_version_asks_again',
    description: 'Quand la version du texte de la déclaration change, la déclaration gardée ne vaut plus : le mode est éteint, la section dit « À renouveler », la fenêtre se rouvre avec l’ancienne qualité mais une case vide, et la nouvelle déclaration porte la version en vigueur',
    run: async () => withExtensions(['graphique', 'etat'], () => withSignals(GOUV, async () => {
      const bad = [];
      clean();
      PersonStore.set(KEY, JSON.stringify({ v: 0, quality: 'operateur', date: '2026-05-01', on: true }));
      StateMode.syncSettings();
      if (StateMode.isDeclared() || StateMode.isOn()) bad.push('une déclaration d’une autre version vaut encore');
      if (button().dataset.kind !== 'renew' || button().textContent !== I18n.t('settings.etat.button.renew') || stateText() !== I18n.t('settings.etat.state.renew')) bad.push('section=' + button().dataset.kind + ' / ' + button().textContent + ' / ' + stateText());
      if (StateMode.setOn(true)) bad.push('setOn(true) réussit avec une version périmée');
      if (!(await openByButton())) return result(bad.concat(['la fenêtre ne se rouvre pas']));
      await waitSignals();
      if (!radio('operateur').checked) bad.push('l’ancienne qualité n’est pas proposée');
      if (consent().checked || !okButton().disabled) bad.push('la case doit être redonnée : case=' + consent().checked + ' ok grisé=' + okButton().disabled);
      consent().click();
      okButton().click();
      await waitClosed();
      const keep = JSON.parse(stored());
      if (!keep || keep.v !== StateMode.TEXT_VERSION || keep.quality !== 'operateur' || !StateMode.isOn()) bad.push('nouvelle déclaration=' + stored());
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_ctrl_z_turns_the_mode_off_and_ctrl_y_back_on',
    description: 'Le geste du bouton est dans Ctrl + Z : activer par la fenêtre, éteindre et rallumer sont chacun UN pas ; défaire rend l’état d’avant sans effacer la déclaration (un engagement n’est jamais défait), refaire le repose ; une fenêtre annulée ne laisse aucun pas',
    run: async () => withExtensions(['graphique', 'etat'], () => withSignals(GOUV, async () => {
      const bad = [];
      clean();
      ActionHistory.reset();
      // Une fenêtre annulée ne laisse rien à défaire.
      await openByButton();
      await waitSignals();
      cancelButton().click();
      await waitClosed();
      await settle();
      if (ActionHistory.count() !== 0) bad.push('un pas après une fenêtre annulée : ' + ActionHistory.count());
      // Activer par la fenêtre : un pas.
      await openByButton();
      await waitSignals();
      await declareIn('etat');
      await settle();
      if (!StateMode.isOn()) bad.push('pas allumé');
      await undo();
      if (StateMode.isOn() || !StateMode.isDeclared()) bad.push('Ctrl+Z : on=' + StateMode.isOn() + ' déclaré=' + StateMode.isDeclared() + ' (éteint, déclaration gardée attendus)');
      if (button().dataset.kind !== 'declared') bad.push('section après Ctrl+Z=' + button().dataset.kind);
      await redo();
      if (!StateMode.isOn()) bad.push('Ctrl+Y ne rallume pas');
      // Éteindre par le bouton : un pas.
      button().click();
      await settle();
      if (StateMode.isOn()) bad.push('éteindre ne marche pas');
      await undo();
      if (!StateMode.isOn()) bad.push('Ctrl+Z ne rallume pas ce que le bouton a éteint');
      if (document.getElementById('status-msg').textContent.indexOf(I18n.t('settings.etat.title')) === -1) bad.push('le coin d’état ne nomme pas le réglage : ' + document.getElementById('status-msg').textContent);
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_never_writes_in_the_document',
    description: 'Aucun état du mode n’est écrit dans le document ni dans Grist : déclarer, éteindre et rallumer ne laissent aucune action sur le document, et le HTML d’un modèle qui porte du style de l’État (couleur du DSFR, Marianne) est identique avant et après',
    run: async (h) => withExtensions(['graphique', 'etat'], () => withSignals(GOUV, async () => {
      const bad = [];
      clean();
      const html = '<p><span style="color: #000091; font-family: Marianne, arial, sans-serif;">Texte aux couleurs de l’État</span></p>';
      Editor.setHTML(html);
      await sleep(100);
      const before = Editor.getHTML();
      const actions = window.__gristStub.getActionLog().length;
      await openByButton();
      await waitSignals();
      await declareIn('etat');
      button().click();
      await sleep(60);
      button().click();
      await sleep(120);
      if (Editor.getHTML() !== before) bad.push('le HTML du modèle a changé : ' + Editor.getHTML().slice(0, 200));
      if (window.__gristStub.getActionLog().length !== actions) bad.push('le mode a écrit dans le document : ' + JSON.stringify(window.__gristStub.getActionLog().slice(actions)).slice(0, 300));
      if (!/#000091|rgb\(0, 0, 145\)/.test(Editor.getHTML()) || Editor.getHTML().indexOf('Marianne') === -1) bad.push('le style de l’État a disparu : ' + Editor.getHTML().slice(0, 200));
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_signals_read_gouv_fr_strictly',
    description: 'Les constats lisent « .gouv.fr » à la lettre : grist.numerique.gouv.fr et gouv.fr oui ; evil-gouv.fr, gouv.fr.evil.com et un hôte vide non ; l’adresse suit la même règle sur son domaine (casse comprise) ; rien d’illisible ne lève',
    run: async () => {
      const bad = [];
      const hosts = [['grist.numerique.gouv.fr', 'ok'], ['gouv.fr', 'ok'], ['GRIST.GOUV.FR', 'ok'], ['evil-gouv.fr', 'no'], ['gouv.fr.evil.com', 'no'], ['docs.getgrist.com', 'no'], ['', 'unknown']];
      for (const [host, want] of hosts) {
        await withSignals({ host, email: 'a@interieur.gouv.fr' }, async () => { const got = (await StateMode.signals()).hostState; if (got !== want) bad.push('hôte « ' + host + ' » : ' + got + ' au lieu de ' + want); });
      }
      const mails = [['a@interieur.gouv.fr', 'ok'], ['a@gouv.fr', 'ok'], ['A@X.GOUV.FR', 'ok'], ['a@evilgouv.fr', 'no'], ['a@gouv.fr.evil.com', 'no'], ['a@gmail.com', 'no'], ['', 'unknown']];
      for (const [email, want] of mails) {
        await withSignals({ host: 'grist.numerique.gouv.fr', email }, async () => { const got = (await StateMode.signals()).emailState; if (got !== want) bad.push('adresse « ' + email + ' » : ' + got + ' au lieu de ' + want); });
      }
      await withSignals(GOUV, async () => { if (!(await StateMode.signals()).recognized) bad.push('instance et adresse en .gouv.fr : non reconnue'); });
      await withSignals({ host: 'grist.numerique.gouv.fr', email: '' }, async () => { if ((await StateMode.signals()).recognized) bad.push('adresse illisible : reconnue'); });
      return result(bad);
    },
  });

  cases.push({
    id: 'statemode_a_refused_storage_keeps_the_mode_off_and_says_so',
    description: 'Un navigateur qui refuse de garder la déclaration : la fenêtre reste ouverte et le dit, rien n’est allumé ni gardé',
    run: async () => withExtensions(['graphique', 'etat'], () => withSignals(GOUV, async () => {
      const bad = [];
      clean();
      const kept = PersonStore.set;
      await openByButton();
      await waitSignals();
      PersonStore.set = () => false;
      try {
        radio('etat').click();
        consent().click();
        okButton().click();
        await sleep(100);
      } finally { PersonStore.set = kept; }
      if (!isOpen()) bad.push('la fenêtre se ferme malgré le refus');
      const status = pick('.pp-etat-status');
      if (!status || status.textContent !== I18n.t('etat.failed')) bad.push('message=' + (status && status.textContent));
      if (StateMode.isOn() || stored() !== null) bad.push('allumé ou gardé malgré le refus');
      cancelButton().click();
      await waitClosed();
      return result(bad);
    })),
  });

  cases.push({
    id: 'statemode_texts_exist_in_both_languages',
    description: 'Chaque texte du mode existe en français et en anglais, avec les mêmes variables ; le mode ne dit jamais « officiel » ni « conforme »',
    run: async () => {
      const bad = [];
      const keys = ['settings.etat.title', 'settings.etat.intro', 'settings.etat.state.unavailable', 'settings.etat.state.off', 'settings.etat.state.on', 'settings.etat.state.renew', 'settings.etat.button.activate', 'settings.etat.button.deactivate', 'settings.etat.button.resume', 'settings.etat.button.renew',
        'settings.etat.hint.needsGfs', 'settings.etat.hint.needsExtension', 'settings.etat.hint.off', 'settings.etat.hint.offDeclared', 'settings.etat.hint.on', 'settings.etat.hint.renew', 'settings.etat.on', 'settings.etat.off', 'etat.feature', 'etat.title', 'etat.lead', 'etat.signals.title', 'etat.signal.host',
        'etat.signal.host.ok', 'etat.signal.host.no', 'etat.signal.host.unknown', 'etat.signal.email', 'etat.signal.email.ok', 'etat.signal.email.no', 'etat.signal.email.unknown', 'etat.signal.checking', 'etat.signals.note', 'etat.warn', 'etat.quality.legend', 'etat.quality.etat', 'etat.quality.operateur',
        'etat.quality.prestataire', 'etat.quality.autre', 'etat.quality.short.etat', 'etat.quality.short.operateur', 'etat.quality.short.prestataire', 'etat.other.info', 'etat.consent', 'etat.rules.label', 'etat.link.brand', 'etat.link.terms', 'etat.notice', 'etat.activate', 'etat.failed', 'extension.etat.name'];
      const lang = I18n.getLang();
      const words = {};
      for (const code of ['fr', 'en']) {
        I18n.setLang(code);
        words[code] = keys.map(key => I18n.t(key, { date: 'D', host: 'H', domain: 'M', quality: 'Q', extension: 'E' }));
      }
      I18n.setLang(lang);
      keys.forEach((key, i) => {
        if (!words.fr[i] || !words.en[i] || words.fr[i] === key || words.en[i] === key) bad.push('texte manquant : ' + key);
        if (words.fr[i] === words.en[i] && !/^(etat\.signal\.host|extension\.etat\.name)/.test(key) && !/\{|…@/.test(words.fr[i])) bad.push('identique dans les deux langues : ' + key);
        if (/\{[a-z]+\}/.test(words.fr[i] + words.en[i])) bad.push('variable non remplacée : ' + key);
      });
      const all = words.fr.concat(words.en).join(' ').toLowerCase();
      if (/officiel|official|conforme au dsfr|dsfr[- ]compliant|compliant with the dsfr/.test(all.replace(/ne certifie aucun document conforme|does not certify any document as compliant|ce widget n’est pas un service de l’état[^.]*\./g, ''))) bad.push('un texte dit « officiel » ou « conforme »');
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.stateMode = cases;
})();
