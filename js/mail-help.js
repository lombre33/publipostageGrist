// Aide « L'email ne s'ouvre pas ? » (demande du 27/11 : des collègues sous Chrome, sans le Windows préparé par la DSI, n'arrivent pas à ouvrir les liens mailto ; leur messagerie est un webmail Zimbra) : une fenêtre qui dit,
// pour le poste de la personne, ce qu'il faut régler une fois pour que « Créer l'email » ouvre le brouillon. Le widget ne fait que préparer un lien `mailto:` ; c'est le poste (le navigateur pour un webmail, le logiciel
// installé sinon) qui l'ouvre, et le widget ne peut ni le voir ni le régler.
// - Ouverte par le « ? » à droite de « Créer l'email » (js/main.js), le lien « Aide » de Réglages > Email (js/settings.js) et celui de la fenêtre « Email trop long » (js/main-export.js) : `MailHelp.open()`.
// - Ce que le widget sait seul : le système et le navigateur (detect : l'agent du navigateur ; Windows 11 par `userAgentData` quand le navigateur le dit, jamais par supposition). Ce qu'il ne peut pas savoir : si la personne lit ses emails
//   dans un navigateur (webmail) ou dans un logiciel installé : une question, posée une fois, retenue sur ce poste (clé `pp_mail_help`, par PersonStore). Les deux listes déroulantes du poste sont préremplies et se corrigent.
// - Les étapes (stepsFor) dépendent des trois réponses (webmail ou logiciel, système, navigateur) ; chacune porte son titre, une phrase, des repères numérotés et, quand elle en a une, sa capture (img/mail-help/{fr,en}-<fichier>.png :
//   un vrai écran, repères numérotés posés par-dessus, dans la langue de l'interface ; un clic l'agrandit, comme celles du guide de la Lecture, js/reader-guide.js). Une étape sans capture n'est que du texte : aucune étape ne dépend
//   d'une image. Textes : js/i18n-texts-eml.js (clés `mailHelp.*`), français et anglais.
// - Sous les étapes : l'option « Webmail Zimbra » (Réglages > Email : plus rien à régler sur le poste) pour qui lit ses emails dans un webmail, puis deux encadrés pour tous : les pièces jointes (un lien d'email n'en porte pas ; l'export
//   « Email (.eml) » les porte) et la longueur du lien (l'avertissement « Email trop long »).
// - Honnêteté : l'export .eml avec pièces jointes n'a jamais été essayé dans un vrai logiciel de messagerie depuis ce dépôt ; l'encadré le dit. Les réglages de Windows et des navigateurs bougent d'une version à l'autre : les étapes nomment
//   ce qu'on cherche (« MAILTO », « mailto ») plutôt qu'un chemin de menus quand le chemin varie.
// Script classique (pas type="module"), même convention de portée globale que ReaderGuide ; js/main.js l'installe (MailHelp.wire).
const MailHelp = (function () {
  const el = Dom.el;

  const KIND_STORAGE = 'pp_mail_help';
  const KINDS = ['webmail', 'software'];
  const OSES = ['windows', 'mac', 'linux', 'other'];
  const BROWSERS = ['firefox', 'chrome', 'edge', 'safari', 'other'];
  const IMAGE_DIR = 'img/mail-help/';
  const IMAGE_VERSION = '1';

  // Les étapes : l'identifiant de leurs textes (mailHelp.step.<id>.*), le nombre de repères numérotés (une ligne de liste chacun) et, quand elle existe, la capture (fichier sans la langue, largeur réelle en pixels CSS : le fichier
  // est enregistré au double, pour les écrans à forte densité). Une étape SANS `shot` n'a pas de capture : ses repères sont une liste de gestes. Les captures de Windows, de Firefox et d'Edge restent à prendre : elles s'ajoutent ici.
  const STEPS = {
    winMailto: { marks: 3, lead: true },
    winSoftware: { marks: 3, lead: true },
    firefox: { marks: 3, lead: true },
    chrome: { marks: 3, lead: true, shot: { file: 'chrome', width: 707 } },
    edge: { marks: 3, lead: true },
    safariWeb: { marks: 0, lead: true },
    macMail: { marks: 0, lead: true },
    macSoftware: { marks: 0, lead: true },
    browserAsk: { marks: 0, lead: true },
    otherWeb: { marks: 0, lead: true },
    otherSoftware: { marks: 0, lead: true },
  };
  const OWN_STEP = { firefox: 'firefox', chrome: 'chrome', edge: 'edge' };

  let host = { openSettings: () => {} };
  let helpWindow = null;
  let refs = null;
  let chosenKind = null;
  // Ce que la fenêtre montre : le système, le navigateur (préremplis, corrigeables), la réponse « webmail ou logiciel ».
  let state = { os: 'other', browser: 'other', kind: '', windows11: false };

  // Le système et le navigateur d'après l'agent du navigateur. `env` (facultatif) : { userAgent, platform } à la place de `navigator`, pour les essais. Rend { os, browser }. Un navigateur dérivé de Chromium qui se dit Chrome (Brave) est
  // pris pour Chrome ; Opera, Vivaldi et le navigateur de Samsung (qui portent leur nom dans l'agent) sont « autre ».
  function detect(env) {
    const nav = env || (typeof navigator !== 'undefined' ? navigator : {});
    const ua = String(nav.userAgent || '');
    const platform = String(nav.platform || (nav.userAgentData && nav.userAgentData.platform) || '');
    let os = 'other';
    // Un téléphone ou une tablette (agent « iPhone », « iPad », « Android ») : « autre système », leurs agents se disent aussi Mac OS X ou Linux.
    if (/\b(?:iPhone|iPad|iPod|Android)\b/.test(ua)) os = 'other';
    else if (/^win/i.test(platform) || /\bWindows\b/.test(ua)) os = 'windows';
    else if (/^mac/i.test(platform) || /\b(?:Macintosh|Mac OS X)\b/.test(ua)) os = 'mac';
    else if (/^linux/i.test(platform) || /\b(?:X11|Linux)\b/.test(ua)) os = 'linux';
    let browser = 'other';
    if (/\bEdg(?:e|A|iOS)?\//.test(ua)) browser = 'edge';
    else if (/\b(?:OPR|Opera|Vivaldi|SamsungBrowser)\b/.test(ua)) browser = 'other';
    else if (/\b(?:Firefox|FxiOS)\//.test(ua)) browser = 'firefox';
    else if (/(?:Chrome|CriOS|Chromium)\//.test(ua)) browser = 'chrome';
    else if (/\bSafari\//.test(ua)) browser = 'safari';
    return { os, browser };
  }

  // Windows 11 : l'agent dit « Windows NT 10.0 » pour Windows 10 comme pour Windows 11, seule la version de la plate-forme (`userAgentData`, Chrome, Edge) les départage : 13 et plus, c'est Windows 11. Le navigateur peut refuser de la donner
  // (un widget dans un cadre isolé) : la réponse est alors fausse et la fenêtre dit « Windows » tout court.
  async function isWindows11() {
    const clientHints = typeof navigator !== 'undefined' ? navigator.userAgentData : null;
    if (!clientHints || typeof clientHints.getHighEntropyValues !== 'function') return false;
    try {
      const values = await clientHints.getHighEntropyValues(['platformVersion']);
      return parseInt(String(values.platformVersion || '').split('.')[0], 10) >= 13;
    } catch (e) { return false; }
  }

  // La réponse « webmail ou logiciel » : retenue sur ce poste ; '' tant qu'elle n'est pas donnée. Aussi gardée en mémoire : un stockage qui refuse la clé garde le choix jusqu'au rechargement.
  function getKind() {
    const stored = PersonStore.get(KIND_STORAGE);
    if (KINDS.indexOf(stored) !== -1) return stored;
    return KINDS.indexOf(chosenKind) !== -1 ? chosenKind : '';
  }
  function setKind(kind) {
    chosenKind = KINDS.indexOf(kind) !== -1 ? kind : null;
    if (chosenKind) PersonStore.set(KIND_STORAGE, chosenKind); else PersonStore.remove(KIND_STORAGE);
  }

  // Les identifiants des étapes de ce cas, dans l'ordre. Rien tant que la réponse « webmail ou logiciel » manque.
  function stepsFor(kind, os, browser) {
    const own = OWN_STEP[browser];
    if (kind === 'webmail') {
      if (os === 'windows') return ['winMailto', own || 'otherWeb'];
      if (os === 'mac') return [browser === 'safari' ? 'safariWeb' : (own || 'otherWeb'), 'macMail'];
      return [browser === 'safari' ? 'safariWeb' : (own || 'otherWeb')];
    }
    if (kind === 'software') {
      const ask = own ? ['browserAsk'] : [];
      if (os === 'windows') return ['winSoftware'].concat(ask);
      if (os === 'mac') return ['macSoftware'].concat(ask);
      return ['otherSoftware'].concat(ask);
    }
    return [];
  }

  const t = (key, params) => I18n.t(key, params);
  const browserName = browser => t('mailHelp.browser.' + browser);

  function heading(level, className, text) {
    const node = el('p', className, text);
    node.setAttribute('role', 'heading');
    node.setAttribute('aria-level', String(level));
    return node;
  }

  function buildShot(id, def, li) {
    const shot = Dom.button('mail-help-shot');
    shot.setAttribute('aria-pressed', 'false');
    shot.title = t('mailHelp.zoom');
    const img = document.createElement('img');
    img.src = IMAGE_DIR + I18n.getLang() + '-' + def.shot.file + '.png?v=' + IMAGE_VERSION;
    img.alt = t('mailHelp.step.' + id + '.alt');
    img.style.setProperty('--shot-w', String(def.shot.width));
    // Une capture qui ne se charge pas (fichier absent, réseau) n'enlève rien d'autre que son cadre : les repères restent écrits.
    img.addEventListener('error', () => shot.remove());
    shot.appendChild(img);
    shot.addEventListener('click', () => {
      const zoomed = li.classList.toggle('is-zoomed');
      shot.setAttribute('aria-pressed', String(zoomed));
      shot.title = t(zoomed ? 'mailHelp.unzoom' : 'mailHelp.zoom');
      shot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return shot;
  }

  function buildStep(id, index) {
    const def = STEPS[id];
    const params = { browser: browserName(state.browser) };
    const li = el('li', 'mail-help-step');
    li.dataset.step = id;
    const body = el('div', 'mail-help-step-body');
    body.appendChild(el('p', 'mail-help-eyebrow', t('mailHelp.step', { n: index + 1 })));
    body.appendChild(heading(3, 'mail-help-step-title', t('mailHelp.step.' + id + '.title', params)));
    if (def.lead) body.appendChild(el('p', 'mail-help-lead', t('mailHelp.step.' + id + '.lead', params)));
    if (def.marks) {
      const marks = el('ol', 'mail-help-marks');
      marks.setAttribute('role', 'list');
      for (let n = 1; n <= def.marks; n++) {
        const item = el('li', 'mail-help-mark-item');
        // Le chiffre n'est qu'un renvoi à la capture : la liste numérotée porte déjà l'ordre pour un lecteur d'écran.
        const badge = el('span', 'mail-help-mark', String(n));
        badge.setAttribute('aria-hidden', 'true');
        item.appendChild(badge);
        item.appendChild(el('span', 'mail-help-mark-text', t('mailHelp.step.' + id + '.mark' + n, params)));
        marks.appendChild(item);
      }
      body.appendChild(marks);
    }
    li.appendChild(body);
    if (def.shot) li.appendChild(buildShot(id, def, li));
    return li;
  }

  // Un encadré : titre et paragraphes (clés `mailHelp.<id>.title` et `mailHelp.<id>.p1`…).
  function buildCard(id, paragraphs, className) {
    const card = el('section', 'mail-help-card' + (className ? ' ' + className : ''));
    card.id = 'pp-mail-help-' + id;
    card.setAttribute('aria-labelledby', 'pp-mail-help-' + id + '-title');
    const title = heading(3, 'mail-help-card-title', t('mailHelp.' + id + '.title'));
    title.id = 'pp-mail-help-' + id + '-title';
    card.appendChild(title);
    for (let n = 1; n <= paragraphs; n++) card.appendChild(el('p', 'mail-help-card-text', t('mailHelp.' + id + '.p' + n)));
    return card;
  }

  // La partie qui suit les réponses : les étapes du cas (ou l'invitation à choisir), puis l'option Zimbra pour un webmail. Refaite à chaque réponse, sans toucher aux deux questions du dessus (le focus y reste).
  function renderCase() {
    const host_ = refs.caseHost;
    host_.textContent = '';
    const ids = stepsFor(state.kind, state.os, state.browser);
    if (!ids.length) {
      host_.appendChild(el('p', 'mail-help-pick', t('mailHelp.kind.pick')));
      return;
    }
    const steps = el('ol', 'mail-help-steps');
    steps.setAttribute('role', 'list');
    ids.forEach((id, index) => steps.appendChild(buildStep(id, index)));
    host_.appendChild(steps);
    if (state.kind === 'webmail') {
      const zimbra = buildCard('zimbra', 1, 'mail-help-card-accent');
      const button = Dom.button('mail-help-link', t('mailHelp.zimbra.button'));
      button.id = 'pp-mail-help-zimbra-button';
      button.addEventListener('click', () => goToSettings());
      zimbra.appendChild(button);
      host_.appendChild(zimbra);
    }
  }

  function option(select, value, label, selected) {
    const node = Dom.option(value, label);
    node.selected = selected;
    select.appendChild(node);
  }

  function buildDevice(detected) {
    const box = el('section', 'mail-help-device');
    box.setAttribute('aria-labelledby', 'pp-mail-help-device-title');
    const title = heading(3, 'mail-help-section-title', t('mailHelp.device.title'));
    title.id = 'pp-mail-help-device-title';
    box.appendChild(title);
    const osName = detected.os === 'windows' && state.windows11 ? t('mailHelp.os.windows11') : t('mailHelp.os.' + detected.os);
    box.appendChild(el('p', 'mail-help-note', t('mailHelp.device.detected', { os: osName, browser: browserName(detected.browser) })));
    const row = el('div', 'mail-help-selects');
    const field = (id, labelKey, values, nameKey, current, onPick) => {
      const wrap = el('div', 'mail-help-field');
      const label = el('label', 'mail-help-label', t(labelKey));
      label.htmlFor = id;
      const select = el('select', 'mail-help-select');
      select.id = id;
      values.forEach(value => option(select, value, t(nameKey + value), value === current));
      select.addEventListener('change', () => onPick(select.value));
      wrap.append(label, select);
      return wrap;
    };
    row.appendChild(field('pp-mail-help-os', 'mailHelp.device.os', OSES, 'mailHelp.os.', state.os, value => { state.os = value; renderCase(); }));
    row.appendChild(field('pp-mail-help-browser', 'mailHelp.device.browser', BROWSERS, 'mailHelp.browser.', state.browser, value => { state.browser = value; renderCase(); }));
    box.appendChild(row);
    return box;
  }

  function buildKind() {
    const box = el('section', 'mail-help-kind');
    box.setAttribute('aria-labelledby', 'pp-mail-help-kind-title');
    const title = heading(3, 'mail-help-section-title', t('mailHelp.kind.title'));
    title.id = 'pp-mail-help-kind-title';
    box.appendChild(title);
    KINDS.forEach(kind => {
      const label = el('label', 'mail-help-radio');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'pp-mail-help-kind';
      input.value = kind;
      input.id = 'pp-mail-help-kind-' + kind;
      input.checked = state.kind === kind;
      input.addEventListener('change', () => { if (input.checked) { state.kind = kind; setKind(kind); renderCase(); } });
      label.append(input, el('span', null, t('mailHelp.kind.' + kind)));
      box.appendChild(label);
    });
    return box;
  }

  function build(detected) {
    const root = el('section', 'mail-help');
    root.appendChild(el('p', 'mail-help-intro', t('mailHelp.intro')));
    root.appendChild(buildDevice(detected));
    root.appendChild(buildKind());
    refs.caseHost = el('div', 'mail-help-case');
    root.appendChild(refs.caseHost);
    renderCase();
    root.appendChild(buildCard('attachments', 3));
    root.appendChild(buildCard('length', 2));
    return root;
  }

  // « Réglages > Email » : la fenêtre d'aide se ferme ; Réglages s'ouvre sur l'onglet Email (il y reste ouvert si l'aide en vient : js/main.js:openEmailSettings).
  function goToSettings() {
    helpWindow.hide();
    host.openSettings();
  }

  // `section` (facultatif) : 'length' ou 'attachments' amène la fenêtre sur cet encadré (le lien de la fenêtre « Email trop long »).
  function open(options) {
    const opts = options || {};
    if (!helpWindow) {
      helpWindow = ModalBase.create({ id: 'pp-mail-help-modal', titleId: 'pp-mail-help-modal-title', size: 'lg', boxClass: 'pp-mail-help-box', actionsClass: 'var-modal-actions' });
      const close = Dom.button('var-modal-primary');
      close.id = 'pp-mail-help-close';
      close.addEventListener('click', () => helpWindow.hide());
      helpWindow.actions.appendChild(close);
      refs = { close, caseHost: null };
    }
    const detected = detect();
    state = { os: detected.os, browser: detected.browser, kind: getKind(), windows11: false };
    helpWindow.title.textContent = t('mailHelp.title');
    refs.close.textContent = t('common.close');
    helpWindow.body.textContent = '';
    helpWindow.body.appendChild(build(detected));
    helpWindow.show();
    if (opts.section) {
      const card = document.getElementById('pp-mail-help-' + opts.section);
      if (card) card.scrollIntoView({ block: 'start' });
    }
    // Windows 11 se sait après coup (réponse du navigateur) : la phrase « Détecté… » se corrige si la fenêtre est encore celle-ci.
    if (detected.os === 'windows') {
      isWindows11().then(yes => {
        if (!yes || !helpWindow.isOpen()) return;
        state.windows11 = true;
        const note = helpWindow.body.querySelector('.mail-help-device .mail-help-note');
        if (note) note.textContent = t('mailHelp.device.detected', { os: t('mailHelp.os.windows11'), browser: browserName(detected.browser) });
      });
    }
  }

  // `openSettings` : ouvre Réglages sur l'onglet Email (js/main.js).
  function wire(hooks) {
    host = Object.assign({ openSettings: () => {} }, hooks || {});
  }

  return { open, wire, detect, stepsFor, getKind, setKind, KINDS, OSES, BROWSERS, STEPS, STEP_IDS: Object.keys(STEPS) };
})();
