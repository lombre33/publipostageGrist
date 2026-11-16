// Le mode « Identité de l'État » (DSFR) : des couleurs, des styles, des modèles et un contrôle qui reprennent l'identité visuelle de l'État, RÉSERVÉS à l'administration (étude du 13/11, premier lot : le socle).
// Le droit de s'en servir ne se prouve pas par le code : le mode le rend DÉLIBÉRÉ (une déclaration datée, sur un texte versionné), SIGNALÉ (le widget constate l'instance et l'adresse, et avertit quand rien ne colle)
// et LIMITÉ (sans Grist Factory Suite, ou sans l'extension « etat », tout est grisé). Trois verrous, qui ne prouvent rien chacun :
//  1. l'extension `etat` est active chez GFS (js/extensions.js) ;
//  2. deux constats, jamais bloquants (l'adresse a des faux négatifs : académies, opérateurs, prestataires) : l'hôte de l'instance (GristAPI.getInstanceHost) et l'adresse de la personne (GristAPI.peekCurrentUser, sinon
//     la sonde des commentaires : GristAPI.getCurrentUserEmail) sont-ils en .gouv.fr ? Les deux : la fenêtre le dit. Sinon : un avertissement ambre, et la déclaration reste possible ;
//  3. la déclaration : la qualité de la personne, dans une liste fermée, et une case. « Une autre structure » (collectivité, association, entreprise, particulier) n'active rien.
// La déclaration est une préférence de la PERSONNE (js/person-store.js, clé `pp_etat_declaration` : dans ce navigateur, ou dans l'espace de GFS), jamais un état du document : aucun modèle ne garde de trace du mode, et un
// modèle qui porte du style de l'État s'ouvre et se réenregistre à l'identique, mode éteint ou non. Le texte de la déclaration est versionné (TEXT_VERSION : v1 = les modalités d'utilisation du DSFR du 20 juillet 2026) :
// quand la version change, la déclaration gardée ne vaut plus et la fenêtre se rouvre à la demande suivante.
// Le mode n'écrit rien d'autre : ses outils (palette, styles, modèles, contrôle) viendront des lots suivants et ne se montreront que `isOn()`. Jamais « officiel » ni « conforme au DSFR », nulle part.
//   StateMode.isAvailable()       l'extension `etat` est active chez GFS (sinon tout est grisé)
//   StateMode.isDeclared()        une déclaration valable (qualité activable, texte de la version en vigueur) est gardée
//   StateMode.isOn()              le mode est allumé : disponible, déclaré, allumé
//   StateMode.setOn(vrai|faux)    allume (seulement avec une déclaration valable) ou éteint ; rend vrai quand le choix est retenu
//   StateMode.open()              la fenêtre d'activation ; Promise<vrai> quand la personne a déclaré (le mode est alors allumé), faux sinon
//   StateMode.signals()           Promise<{ host, hostState, email, emailState, recognized }>, états 'ok' | 'no' | 'unknown' ; ne lève jamais
//   StateMode.onChange(fn)        `fn()` à chaque changement de l'état (déclaration, allumage) ; rend la fonction qui l'arrête
//   StateMode.mountSettings()     branche la section « Identité de l'État » de Réglages > Thème ; StateMode.syncSettings() la remet à jour (à l'ouverture de Réglages, à chaque événement de GFS)
const StateMode = (function () {
  const el = Dom.el;
  const EXTENSION = 'etat';
  const STORAGE = 'pp_etat_declaration';
  const TEXT_VERSION = 1;
  // Les qualités qui peuvent allumer le mode ; la dernière réponse de la liste (`OTHER`) l'écarte.
  const QUALITIES = ['etat', 'operateur', 'prestataire'];
  const OTHER = 'autre';
  // Les règles que la déclaration dit avoir lues : la page de la marque de l'État (info.gouv.fr) et le texte des modalités d'utilisation du DSFR de la version 1.15.4.
  const RULES = {
    brand: 'https://www.info.gouv.fr/marque-de-letat',
    terms: 'https://github.com/GouvernementFR/dsfr/blob/main/doc/legal/cgu.md',
  };
  const GOUV_HOST = /(?:^|\.)gouv\.fr$/i;
  const GOUV_MAIL = /@(?:[a-z0-9-]+\.)*gouv\.fr$/i;
  const subscribers = [];

  // === L'état gardé ===

  // { v, quality, date, on } tel que gardé, ou null (rien, illisible, ou qui n'est pas une déclaration).
  function read() {
    const raw = PersonStore.get(STORAGE);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return { v: Number(parsed.v) || 0, quality: typeof parsed.quality === 'string' ? parsed.quality : '', date: typeof parsed.date === 'string' ? parsed.date : '', on: parsed.on === true };
    } catch (e) { return null; }
  }
  const write = record => PersonStore.set(STORAGE, JSON.stringify({ v: record.v, quality: record.quality, date: record.date, on: record.on === true }));
  function notify() {
    subscribers.slice().forEach((fn) => { try { fn(); } catch (e) { console.warn('[StateMode] abonné en échec', e); } });
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.push(fn);
    return () => { const at = subscribers.indexOf(fn); if (at !== -1) subscribers.splice(at, 1); };
  }

  const isAvailable = () => Extensions.isActive(EXTENSION);
  // Une déclaration gardée dont la qualité peut allumer le mode et dont le texte est celui de la version en vigueur.
  function validRecord() {
    const record = read();
    return record && record.v === TEXT_VERSION && QUALITIES.indexOf(record.quality) !== -1 ? record : null;
  }
  const isDeclared = () => !!validRecord();
  // Une déclaration qu'une version plus récente du texte a rendue caduque (la qualité, elle, était activable).
  const staleRecord = () => { const record = read(); return record && record.v !== TEXT_VERSION && QUALITIES.indexOf(record.quality) !== -1 ? record : null; };
  function isOn() {
    const record = validRecord();
    return isAvailable() && !!record && record.on;
  }

  // Allume (il faut une déclaration valable, et l'extension) ou éteint ; la déclaration reste gardée. Vrai quand le choix est retenu.
  function setOn(on) {
    const record = validRecord();
    if (on && (!record || !isAvailable())) return false;
    if (!on && !record) return true;
    if (record.on === !!on) return true;
    const kept = write({ v: record.v, quality: record.quality, date: record.date, on: !!on });
    if (kept) notify();
    return kept;
  }

  // Le jour de la déclaration, à la date locale : 2026-11-16.
  function today() {
    const now = new Date();
    const two = n => String(n).padStart(2, '0');
    return now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate());
  }
  function declare(quality) {
    if (QUALITIES.indexOf(quality) === -1) return false;
    const kept = write({ v: TEXT_VERSION, quality, date: today(), on: true });
    if (kept) notify();
    return kept;
  }
  // « 16 novembre 2026 » / « 16 November 2026 » ; le texte tel quel quand la date n'est pas lisible.
  function dateText(iso) {
    const day = new Date(String(iso) + 'T12:00:00');
    return isNaN(day.getTime()) ? String(iso) : day.toLocaleDateString(I18n.getLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // === Les constats ===

  let emailReader = null;
  // L'adresse de la personne : celle que la session connaît déjà (rien n'est écrit), sinon la sonde des commentaires. '' quand elle est illisible (compte Lecteur, pas le droit d'écrire, refus de la table).
  async function readEmail() {
    const kept = GristAPI.peekCurrentUser().email;
    if (kept) return kept;
    if (!emailReader) emailReader = GristAPI.createUserEmailCache(() => GristAPI.getCurrentUserEmail());
    try { return (await emailReader.get()) || ''; } catch (e) { return ''; }
  }
  async function readHost() {
    try { return (await GristAPI.getInstanceHost()) || ''; } catch (e) { return ''; }
  }
  // Ce que le widget constate : l'hôte de l'instance et l'adresse, chacun 'ok' (en .gouv.fr), 'no' (ailleurs) ou 'unknown' (illisible) ; `recognized` quand les deux sont 'ok'. Rien de cela ne prouve un droit.
  async function signals() {
    const [host, email] = await Promise.all([readHost(), readEmail()]);
    const hostState = host ? (GOUV_HOST.test(host) ? 'ok' : 'no') : 'unknown';
    const emailState = email ? (GOUV_MAIL.test(email) ? 'ok' : 'no') : 'unknown';
    return { host, hostState, email, emailState, recognized: hostState === 'ok' && emailState === 'ok' };
  }

  // === La fenêtre d'activation ===

  let win = null;
  let refs = null;
  let current = null;   // { finish(vrai | faux) }
  let token = 0;        // des constats qui reviennent après la fermeture de la fenêtre sont ignorés

  function check(id, name) {
    const wrap = el('label', 'pp-etat-check');
    const input = el('input');
    input.type = name ? 'radio' : 'checkbox';
    input.id = id;
    if (name) { input.name = name; input.value = id.replace(/^pp-etat-quality-/, ''); }
    const text = el('span');
    wrap.append(input, text);
    return { wrap, input, text };
  }
  function link(href) {
    const anchor = el('a', 'pp-etat-link');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function signalRow() {
    const row = el('div', 'pp-etat-signal');
    const dot = el('span', 'pp-etat-dot');
    dot.setAttribute('aria-hidden', 'true');
    const body = el('div', 'pp-etat-signal-body');
    const label = el('strong', 'pp-etat-signal-label');
    const detail = el('span', 'pp-etat-signal-detail');
    body.append(label, detail);
    row.append(dot, body);
    return { row, dot, label, detail };
  }

  function ensureWindow() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-etat-modal', titleId: 'pp-etat-title', size: 'md', boxClass: 'pp-etat-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(false); else win.hide(); },
    });
    const lead = el('p', 'pp-etat-lead');
    const signalsBox = el('section', 'pp-etat-signals');
    const signalsTitle = el('h4', 'pp-etat-heading');
    const host = signalRow();
    const mail = signalRow();
    const signalsNote = el('p', 'pp-etat-small');
    signalsBox.append(signalsTitle, host.row, mail.row, signalsNote);
    const warn = el('p', 'pp-etat-warn');
    warn.setAttribute('role', 'note');
    const choice = el('fieldset', 'pp-etat-choice');
    const legend = el('legend', 'pp-etat-legend');
    const radios = QUALITIES.concat([OTHER]).map(name => check('pp-etat-quality-' + name, 'pp-etat-quality'));
    choice.append(legend, ...radios.map(radio => radio.wrap));
    const other = el('p', 'pp-etat-info');
    other.setAttribute('role', 'note');
    const consent = check('pp-etat-consent');
    consent.wrap.classList.add('pp-etat-consent');
    const rules = el('div', 'pp-etat-rules');
    const rulesLabel = el('span', 'pp-etat-rules-label');
    const rulesList = el('ul', 'pp-etat-rules-list');
    const linkBrand = link(RULES.brand);
    const linkTerms = link(RULES.terms);
    [linkBrand, linkTerms].forEach((a) => { const item = el('li'); item.appendChild(a); rulesList.appendChild(item); });
    rules.append(rulesLabel, rulesList);
    const notice = el('p', 'pp-etat-small');
    const status = el('p', 'pp-etat-status');
    status.setAttribute('role', 'status');
    win.body.append(lead, signalsBox, warn, choice, other, consent.wrap, rules, notice, status);
    const { cancel, ok } = win.addButtons();
    refs = { lead, signalsTitle, host, mail, signalsNote, warn, legend, radios, other, consent, rules, rulesLabel, linkBrand, linkTerms, notice, status, cancel, ok };

    cancel.addEventListener('click', () => { if (current) current.finish(false); });
    win.body.addEventListener('change', () => { setStatus(''); render(); });
    ok.addEventListener('click', accept);
  }

  function setStatus(text, problem) {
    refs.status.textContent = text;
    refs.status.classList.toggle('is-problem', !!problem);
  }
  const chosen = () => { const radio = refs.radios.find(r => r.input.checked); return radio ? radio.input.value : ''; };

  // « Une autre structure » écarte la case et ferme la porte ; une qualité activable demande la case. « Activer le mode » reste grisé tant que la déclaration n'est pas complète.
  function render() {
    const quality = chosen();
    const isOther = quality === OTHER;
    refs.other.hidden = !isOther;
    refs.consent.wrap.hidden = isOther;
    if (isOther) refs.consent.input.checked = false;
    refs.ok.disabled = !(QUALITIES.indexOf(quality) !== -1 && refs.consent.input.checked);
  }

  // Le texte de chaque constat, par état : 'ok' (en .gouv.fr), 'no' (ailleurs), 'unknown' (illisible).
  const SIGNAL_TEXT = {
    host: { ok: 'etat.signal.host.ok', no: 'etat.signal.host.no', unknown: 'etat.signal.host.unknown' },
    email: { ok: 'etat.signal.email.ok', no: 'etat.signal.email.no', unknown: 'etat.signal.email.unknown' },
  };
  function showSignal(part, titleKey, state, which, vars) {
    part.label.textContent = I18n.t(titleKey);
    part.detail.textContent = state === 'checking' ? I18n.t('etat.signal.checking') : I18n.t(SIGNAL_TEXT[which][state], vars);
    part.dot.textContent = state === 'ok' ? '✓' : state === 'no' ? '!' : '?';
    part.dot.className = 'pp-etat-dot is-' + state;
    part.row.dataset.state = state;
  }
  function renderSignals(found) {
    const domain = found.email ? found.email.split('@').pop() : '';
    showSignal(refs.host, 'etat.signal.host', found.hostState, 'host', { host: found.host });
    showSignal(refs.mail, 'etat.signal.email', found.emailState, 'email', { domain });
    refs.warn.hidden = found.recognized;
  }

  // « Activer le mode » : la déclaration est gardée avec la qualité, la date et la version du texte, et le mode s'allume. Un navigateur qui refuse de la garder la laisse éteinte, et la fenêtre le dit.
  function accept() {
    if (!current || refs.ok.disabled) return;
    if (!declare(chosen())) { setStatus(I18n.t('etat.failed'), true); return; }
    current.finish(true);
  }

  function open() {
    ensureWindow();
    if (current) current.finish(false);
    token++;
    const mine = token;
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        current = null;
        token++;
        win.hide();
        resolve(value);
      };
      current = { finish };
      const r = refs;
      const before = staleRecord();
      win.title.textContent = I18n.t('etat.title');
      r.lead.textContent = I18n.t('etat.lead');
      r.signalsTitle.textContent = I18n.t('etat.signals.title');
      r.signalsNote.textContent = I18n.t('etat.signals.note');
      showSignal(r.host, 'etat.signal.host', 'checking');
      showSignal(r.mail, 'etat.signal.email', 'checking');
      r.warn.textContent = I18n.t('etat.warn');
      r.warn.hidden = true;
      r.legend.textContent = I18n.t('etat.quality.legend');
      QUALITIES.concat([OTHER]).forEach((name, index) => {
        r.radios[index].text.textContent = I18n.t('etat.quality.' + name);
        r.radios[index].input.checked = !!before && before.quality === name;
      });
      r.other.textContent = I18n.t('etat.other.info');
      r.consent.text.textContent = I18n.t('etat.consent');
      r.consent.input.checked = false;
      r.rulesLabel.textContent = I18n.t('etat.rules.label');
      r.linkBrand.textContent = I18n.t('etat.link.brand');
      r.linkTerms.textContent = I18n.t('etat.link.terms');
      r.notice.textContent = I18n.t('etat.notice');
      r.cancel.textContent = I18n.t('common.cancel');
      r.ok.textContent = I18n.t('etat.activate');
      setStatus('');
      render();
      win.show(() => r.radios[0].input);
      win.body.scrollTop = 0;
      signals().then((found) => { if (mine === token && current) renderSignals(found); });
    });
  }

  // Le clic sur le mode grisé : hébergé par GFS, sa fenêtre d'installation ; seul, la fenêtre qui dit qu'il faut passer par GFS (Extensions.explain).
  const explain = () => Extensions.explain(EXTENSION, 'etat.feature');

  // === La section de Réglages > Thème ===

  // Le texte de la qualité déclarée, à la suite de « avec votre déclaration (… ) ».
  const qualityText = quality => I18n.t('etat.quality.short.' + quality);
  // Ce que la section montre, d'après l'état en vigueur : { kind, state, hint, button, disabled }.
  function view() {
    if (!isAvailable()) {
      const askable = GfsLink.hosted && GfsLink.isAnswering();
      return {
        kind: 'unavailable', state: I18n.t('settings.etat.state.unavailable'),
        hint: I18n.t(askable ? 'settings.etat.hint.needsExtension' : 'settings.etat.hint.needsGfs', { extension: Extensions.nameOf(EXTENSION) }),
        button: I18n.t('settings.etat.button.activate'), disabled: true,
      };
    }
    const valid = validRecord();
    if (valid && valid.on) {
      return {
        kind: 'on', state: I18n.t('settings.etat.state.on', { date: dateText(valid.date) }),
        hint: I18n.t('settings.etat.hint.on', { quality: qualityText(valid.quality) }),
        button: I18n.t('settings.etat.button.deactivate'), disabled: false,
      };
    }
    if (valid) {
      return {
        kind: 'declared', state: I18n.t('settings.etat.state.off'),
        hint: I18n.t('settings.etat.hint.offDeclared', { date: dateText(valid.date) }),
        button: I18n.t('settings.etat.button.resume'), disabled: false,
      };
    }
    const stale = staleRecord();
    if (stale) {
      return {
        kind: 'renew', state: I18n.t('settings.etat.state.renew'),
        hint: I18n.t('settings.etat.hint.renew', { date: dateText(stale.date) }),
        button: I18n.t('settings.etat.button.renew'), disabled: false,
      };
    }
    return { kind: 'off', state: I18n.t('settings.etat.state.off'), hint: I18n.t('settings.etat.hint.off'), button: I18n.t('settings.etat.button.activate'), disabled: false };
  }

  // Le réglage que Ctrl + Z défait (js/settings-history.js) : allumé ou éteint. La déclaration, elle, est un engagement : elle n'est jamais défaite.
  const SETTING = {
    read: () => (isOn() ? 'on' : 'off'),
    write: (value) => { if (!setOn(value === 'on')) throw ActionHistory.conflict(I18n.t('history.settingChanged')); },
    say: value => I18n.t('status.settingSet', { setting: I18n.t('settings.etat.title'), value: I18n.t('settings.etat.' + value) }),
    locked: () => !isAvailable(),
  };

  function syncSettings() {
    const button = document.getElementById('settings-etat-button');
    if (!button) return;
    const shown = view();
    const state = document.getElementById('settings-etat-state');
    const hint = document.getElementById('settings-etat-hint');
    if (state) state.textContent = shown.state;
    if (hint) hint.textContent = shown.hint;
    button.textContent = shown.button;
    button.dataset.kind = shown.kind;
    // Grisé, jamais retiré, atteignable au clavier : la raison est dans la phrase du dessous (et au survol), le clic ouvre l'explication.
    button.setAttribute('aria-disabled', shown.disabled ? 'true' : 'false');
    button.classList.toggle('is-disabled', shown.disabled);
    button.title = shown.disabled ? shown.hint : '';
  }

  // Le geste du bouton : grisé, il explique ; allumé, il éteint ; déjà déclaré, il rallume ; sinon la fenêtre s'ouvre, et ce qu'elle allume est UN pas d'Annuler.
  async function onButton() {
    if (!isAvailable()) { await explain(); syncSettings(); return; }
    const before = SETTING.read();
    if (isOn()) SettingsHistory.track(SETTING, () => setOn(false));
    else if (isDeclared()) SettingsHistory.track(SETTING, () => setOn(true));
    else {
      await open();
      SettingsHistory.record(SETTING, before, SETTING.read());
    }
    syncSettings();
  }

  let mounted = false;
  function mountSettings() {
    const button = document.getElementById('settings-etat-button');
    if (!button || mounted) return;
    mounted = true;
    button.addEventListener('click', onButton);
    onChange(syncSettings);
    Extensions.onChange(syncSettings);
    PersonStore.onLoaded(syncSettings);   // hébergé : l'espace de GFS arrive après le démarrage, la déclaration qu'il garde avec lui
    syncSettings();
  }

  return { isAvailable, isDeclared, isOn, setOn, open, signals, onChange, mountSettings, syncSettings, view, explain, TEXT_VERSION, QUALITIES, STORAGE, RULES, EXTENSION };
})();
