// Guide de la Lecture sans ligne (demande d'Antoine du 2026-10-04 : « en mode lecture, quand le widget n'a pas le select by de configuré, il affiche "Aucune ligne sélectionnée" : il faudrait guider
// l'utilisateur proprement sur ce qu'il faut faire, avec du texte et des captures d'écran, au lieu de ce message »).
// - Quand : js/reader-mode.js:render() n'a aucune ligne à montrer. Widget relié à une autre vue (GristAPI.getLinkState() = 'linked') : rien à régler, il reste un clic à faire, donc le court message d'avant
//   (« Aucune ligne sélectionnée » et son indication). Sinon - « Sélectionner par » vide ('unlinked'), ou version de Grist qui ne le dit pas ('unknown') - le guide : trois étapes (mettre le tableau sur la
//   page, relier le widget par « Sélectionner par », cliquer sur une ligne), chacune avec sa capture aux repères numérotés. Dans l'état 'unknown' une dernière ligne dit quoi faire si le widget est déjà relié.
// - Il se tient à jour sans recharger : Grist renvoie les options du widget dès que son lien change (GristAPI.onLinkStateChange, js/grist-api.js), la langue de l'interface aussi (I18n.onChange) ; et il
//   cède la place au document dès qu'une ligne arrive (js/reader-mode.js remplace tout le contenu du conteneur de la Lecture).
// - Les captures (img/reader-guide/{fr,en}-{1,2,3}.png) viennent d'un vrai Grist (son interface réelle, un document d'exemple « Factures »), dans la langue de l'interface du widget, repères numérotés et
//   flèche ajoutés par-dessus. À refaire, avec IMAGE_VERSION montée, si Grist déplace ces réglages.
// - Dans le panneau de 700×400, le guide défile (le conteneur de la Lecture défile déjà) : les captures s'y lisent à 66 % de leur taille, un clic sur l'une l'affiche à sa taille réelle, un second la rétrécit.
// Script classique (pas type="module"), même convention de portée globale que CleanReading ; js/reader-mode.js l'appelle (ReaderGuide.render).
const ReaderGuide = (function () {
  const IMAGE_DIR = 'img/reader-guide/';
  const IMAGE_VERSION = '1';
  // Une étape : l'identifiant de ses textes (readerGuide.<id>.*), le nombre de repères numérotés de sa capture (une ligne de liste chacun), si elle s'ouvre sur une phrase, et la largeur réelle de sa capture
  // en pixels CSS (le fichier est enregistré au double, pour les écrans à forte densité).
  const STEPS = [
    { id: 'add', marks: 3, lead: true, width: 470 },
    { id: 'link', marks: 3, lead: true, width: 240 },
    { id: 'pick', marks: 2, lead: false, width: 282 },
  ];
  let wired = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  // Titres : des <p role="heading">, pas des <h2>/<h3> - css/style.css peint tout titre du conteneur de la Lecture en gris-bleu foncé (les titres du document, sur la page blanche), invisible sur le fond
  // sombre du plan de travail en thème sombre.
  function heading(level, className, text) {
    const node = el('p', className, text);
    node.setAttribute('role', 'heading');
    node.setAttribute('aria-level', String(level));
    return node;
  }

  function buildShot(step, number, li) {
    const shot = el('button', 'reader-guide-shot');
    shot.type = 'button';
    shot.setAttribute('aria-pressed', 'false');
    shot.title = I18n.t('readerGuide.zoom');
    const img = document.createElement('img');
    img.src = IMAGE_DIR + I18n.getLang() + '-' + number + '.png?v=' + IMAGE_VERSION;
    img.alt = I18n.t('readerGuide.' + step.id + '.alt');
    img.style.setProperty('--shot-w', String(step.width));
    shot.appendChild(img);
    shot.addEventListener('click', () => {
      const zoomed = li.classList.toggle('is-zoomed');
      shot.setAttribute('aria-pressed', String(zoomed));
      shot.title = I18n.t(zoomed ? 'readerGuide.unzoom' : 'readerGuide.zoom');
      // La capture change de place (à droite du texte -> sous le texte, et inversement) : dans un panneau de 400 px de haut elle sortirait de l'écran sous le doigt de qui vient de cliquer.
      // On la garde visible, sans animation (même geste pour qui préfère les mouvements réduits).
      shot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return shot;
  }

  function buildStep(step, index) {
    const li = el('li', 'reader-guide-step');
    const body = el('div', 'reader-guide-step-body');
    body.appendChild(el('p', 'reader-guide-eyebrow', I18n.t('readerGuide.step', { n: index + 1 })));
    body.appendChild(heading(3, 'reader-guide-step-title', I18n.t('readerGuide.' + step.id + '.title')));
    if (step.lead) body.appendChild(el('p', 'reader-guide-lead', I18n.t('readerGuide.' + step.id + '.lead')));
    const marks = el('ol', 'reader-guide-marks');
    marks.setAttribute('role', 'list');
    for (let n = 1; n <= step.marks; n++) {
      const item = el('li', 'reader-guide-mark-item');
      // Le chiffre du repère n'est qu'un renvoi à la capture : la liste numérotée porte déjà l'ordre pour un lecteur d'écran.
      const badge = el('span', 'reader-guide-mark', String(n));
      badge.setAttribute('aria-hidden', 'true');
      item.appendChild(badge);
      item.appendChild(el('span', 'reader-guide-mark-text', I18n.t('readerGuide.' + step.id + '.mark' + n)));
      marks.appendChild(item);
    }
    body.appendChild(marks);
    li.appendChild(body);
    li.appendChild(buildShot(step, index + 1, li));
    return li;
  }

  function buildGuide(state) {
    const root = el('section', 'reader-guide');
    root.setAttribute('aria-labelledby', 'reader-guide-title');
    const title = heading(2, 'reader-guide-title', I18n.t('readerGuide.title'));
    title.id = 'reader-guide-title';
    root.appendChild(title);
    root.appendChild(el('p', 'reader-guide-intro', I18n.t('readerGuide.intro')));
    const steps = el('ol', 'reader-guide-steps');
    steps.setAttribute('role', 'list');
    STEPS.forEach((step, index) => steps.appendChild(buildStep(step, index)));
    root.appendChild(steps);
    if (state === 'unknown') root.appendChild(el('p', 'reader-guide-unsure', I18n.t('readerGuide.unsure')));
    return root;
  }

  // Pas de .error-msg : ne rien avoir sélectionné n'est pas une erreur, juste un clic qui manque.
  function buildMessage() {
    const empty = el('div', 'reader-empty');
    empty.appendChild(el('p', 'reader-empty-title', I18n.t('reader.empty.title')));
    empty.appendChild(el('p', 'reader-empty-hint', I18n.t('reader.empty.hint')));
    return empty;
  }

  const showsEmptyState = container => !!container.querySelector(':scope > .reader-guide, :scope > .reader-empty');

  // Rafraîchi seulement tant que le conteneur montre encore cet état : une ligne arrivée entre-temps l'a déjà remplacé par le document.
  function wire() {
    if (wired) return;
    wired = true;
    const refresh = () => {
      const container = document.getElementById('reader-container');
      if (container && showsEmptyState(container)) render(container);
    };
    GristAPI.onLinkStateChange(refresh);
    I18n.onChange(refresh);
  }

  function render(container) {
    wire();
    container.innerHTML = '';
    const state = GristAPI.getLinkState();
    container.appendChild(state === 'linked' ? buildMessage() : buildGuide(state));
  }

  return { render };
})();
