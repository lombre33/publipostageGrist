// Premier contact : ce que voit la personne quand le widget ne démarre pas comme prévu. Une seule fenêtre (js/modal-base.js), de quatre sortes :
//  - outside : le widget est ouvert seul dans un onglet, hors de Grist ; on dit où l'ajouter et à quelle adresse ;
//  - network : une adresse dont il dépend est bloquée par le réseau (pare-feu, proxy) ; on dit lesquelles autoriser ;
//  - slow : le démarrage dure plus de SLOW_MS sans erreur (un réseau qui laisse des requêtes sans réponse) ; mêmes adresses, et « Continuer d'attendre » ;
//  - error : une autre erreur a arrêté le démarrage ; le message technique et de quoi recharger.
// js/main.js l'appelle trois fois : start() en tête d'init(), ready() une fois le widget prêt, failed(erreur) quand init() échoue. Rien ne s'affiche avec
// `?dev` dans l'adresse : le widget se développe aussi hors de Grist. « Hors de Grist » veut dire une page sans cadre parent, à laquelle Grist n'a rien
// répondu (onOptions) au bout de OUTSIDE_WAIT_MS : le faux Grist des tests répond tout de suite, il n'est donc jamais pris pour un onglet seul. Les
// trois premières fenêtres n'ont pas de sortie par Échap (hors de Grist ou sans réseau, il n'y a rien d'autre à faire que suivre la consigne), la
// quatrième se ferme d'elle-même quand le widget est prêt.
const FirstContact = (function () {
  const el = Dom.el;

  const OUTSIDE_WAIT_MS = 1000;
  const SLOW_MS = 30000;
  const REPO = 'https://github.com/grist-factory/Publipostage-Plus';
  const PUBLIC_ADDRESS = 'https://grist-factory.github.io/Publipostage-Plus/'; // celle que le README donne à coller dans Grist
  const ANCHORS = { install: { fr: '#installation-dans-grist', en: '#installing-in-grist' }, limits: { fr: '#limites-connues', en: '#known-limitations' } };
  // Les adresses dont dépend le widget, avec ce qu'elles servent à faire (README, « Dépendances »).
  const HOSTS = [
    { host: 'esm.sh', why: 'firstContact.host.editor' },
    { host: 'docs.getgrist.com', why: 'firstContact.host.grist' },
    { host: 'cdnjs.cloudflare.com', why: 'firstContact.host.exports' },
    { host: 'cdn.jsdelivr.net', why: 'firstContact.host.exports' },
  ];
  const TEXTS = {
    outside: { title: 'firstContact.outside.title', intro: 'firstContact.outside.intro' },
    network: { title: 'firstContact.network.title', intro: 'firstContact.network.intro' },
    slow: { title: 'firstContact.slow.title', intro: 'firstContact.slow.intro' },
    error: { title: 'firstContact.error.title', intro: 'firstContact.error.intro' },
  };
  // Le message d'un module ou d'un script qui n'a pas pu être téléchargé, selon le navigateur : Chrome « Failed to fetch dynamically imported module »,
  // Firefox « error loading dynamically imported module », Safari « Importing a module script failed », un fetch refusé « Failed to fetch », « Load failed »
  // ou « NetworkError ».
  const DOWNLOAD_FAILED = /failed to fetch|error loading dynamically imported module|importing a module script failed|load failed|networkerror/i;

  let win = null;
  let refs = null;
  let started = false;
  let kind = null;         // la sorte de fenêtre ouverte, null : aucune
  let technical = '';      // le message d'erreur tel que le navigateur l'a donné
  let slowTimer = 0;
  let finished = false;    // ready() ou failed() a clos le démarrage : plus de fenêtre « lent » à attendre

  const devMode = () => { try { return new URLSearchParams(window.location.search).has('dev'); } catch (e) { return false; } };
  const alone = () => window.parent === window;
  const gristAnswered = () => GristAPI.getAccessLevel() !== null;
  // L'adresse du dossier de la page, celle à coller dans Grist : la même que celle où se trouve la personne (site public, copie hébergée ailleurs, serveur local),
  // sans le nom du fichier, les paramètres ni l'ancre. Une page ouverte depuis un fichier du disque (le dépôt téléchargé) n'a pas d'adresse que Grist puisse charger :
  // on donne alors celle du site public.
  const widgetAddress = () => (/^https?:$/.test(window.location.protocol) ? new URL('.', window.location.href).href : PUBLIC_ADDRESS);
  const repoLink = section => REPO + ANCHORS[section][I18n.getLang()];

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-first-contact-modal', titleId: 'pp-first-contact-title', size: 'md', boxClass: 'pp-first-contact-box', actionsClass: 'var-modal-actions',
      onEscape: keepWaiting,
    });
    win.body.classList.add('pp-first-contact-body');
    refs = win.addButtons();
    refs.cancel.addEventListener('click', keepWaiting);
    I18n.onChange(() => { if (kind) render(); });
  }

  function link(href, text) {
    const a = el('a', null, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function addressRow() {
    const row = el('div', 'pp-first-contact-address');
    const address = el('code', null, widgetAddress());
    row.append(address);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const copy = el('button', 'pp-first-contact-copy', I18n.t('firstContact.copy'));
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(address.textContent);
          copy.textContent = I18n.t('firstContact.copied');
        } catch (e) {
          window.getSelection().selectAllChildren(address); // presse-papiers refusé : l'adresse est sélectionnée, il reste Ctrl+C
        }
      });
      row.append(copy);
    }
    return row;
  }

  function outsideSteps() {
    const steps = el('ol');
    const first = el('li', null, I18n.t('firstContact.outside.step1'));
    first.append(addressRow());
    steps.append(first, el('li', null, I18n.t('firstContact.outside.step2')), el('li', null, I18n.t('firstContact.outside.step3')));
    return steps;
  }

  function hostsList() {
    const list = el('ul', 'pp-first-contact-hosts');
    HOSTS.forEach(({ host, why }) => {
      const item = el('li');
      item.append(el('code', null, host), document.createTextNode(' : ' + I18n.t(why)));
      list.append(item);
    });
    return list;
  }

  function technicalDetails() {
    const details = el('details', 'pp-first-contact-details');
    details.open = kind === 'error';
    details.append(el('summary', null, I18n.t('firstContact.technical')), el('pre', null, technical));
    return details;
  }

  function render() {
    const { cancel, ok } = refs;
    win.box.dataset.kind = kind;
    win.title.textContent = I18n.t(TEXTS[kind].title);
    win.body.replaceChildren(el('p', null, I18n.t(TEXTS[kind].intro)));
    if (kind === 'outside') win.body.append(outsideSteps());
    if (kind === 'network' || kind === 'slow') {
      win.body.append(hostsList());
      if (kind === 'network') win.body.append(el('p', null, I18n.t('firstContact.network.then')));
      const more = el('p');
      more.append(link(repoLink('limits'), I18n.t('firstContact.network.list')));
      win.body.append(more);
    }
    if (technical) win.body.append(technicalDetails());
    cancel.textContent = I18n.t('firstContact.keepWaiting');
    cancel.hidden = kind !== 'slow';
    ok.textContent = I18n.t(kind === 'outside' ? 'firstContact.outside.readme' : 'firstContact.reload');
    ok.onclick = kind === 'outside' ? () => window.open(repoLink('install'), '_blank', 'noopener,noreferrer') : () => window.location.reload();
  }

  function show(next, message) {
    kind = next;
    technical = message || '';
    ensure();
    render();
    win.show(refs.ok);
  }

  function close() {
    kind = null;
    if (win) win.hide();
  }

  function keepWaiting() {
    if (kind === 'slow') close();
  }

  function start() {
    if (started || devMode()) return;
    started = true;
    if (alone()) setTimeout(() => { if (!gristAnswered()) show('outside'); }, OUTSIDE_WAIT_MS);
    else if (typeof grist === 'undefined') show('network', 'The Grist API script did not load (https://docs.getgrist.com/grist-plugin-api.js).');
    armSlowTimer();
  }

  function armSlowTimer() {
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => { if (!kind) show('slow'); }, SLOW_MS);
  }

  // Le démarrage attend la réponse de la personne (js/table-consent.js : créer les tables du widget ?) : ce temps n'est pas une lenteur du réseau, la
  // fenêtre « chargement long » ne doit pas s'ouvrir par-dessus la question. resume() relance le compte à zéro.
  function pause() {
    if (started) clearTimeout(slowTimer);
  }

  function resume() {
    if (started && !finished && !kind) armSlowTimer();
  }

  function ready() {
    if (!started) return;
    finished = true;
    clearTimeout(slowTimer);
    if (kind === 'slow') close();
  }

  function failed(error) {
    if (!started || kind === 'outside') return;
    finished = true;
    clearTimeout(slowTimer);
    const message = String((error && error.message) || error || '');
    show(DOWNLOAD_FAILED.test(message) ? 'network' : 'error', message);
  }

  return { start, pause, resume, ready, failed };
})();
