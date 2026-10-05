// Guide de la Lecture sans ligne : en mode Lecture, quand le widget n'a pas de « Sélectionner par » configuré, il guide la personne sur ce qu'il faut
// faire, avec du texte et des captures d'écran, plutôt que d'afficher « Aucune ligne sélectionnée ».
// - Quand : js/reader-mode.js:render() n'a aucune ligne à montrer. Widget relié à une autre vue (GristAPI.getLinkState() = 'linked') : rien à régler,
//   il reste un clic à faire, donc le court message (« Aucune ligne sélectionnée » et son indication), sauf sans accès (GristAPI.getAccessLevel() =
//   'none') : Grist n'envoie alors aucune ligne, même avec une ligne cliquée, et ce message serait faux ; la carte se réduit à l'étape de l'accès
//   complet. Sinon (« Sélectionner par » vide, 'unlinked', ou version de Grist qui ne le dit pas, 'unknown'), le guide : quatre étapes (donner
//   l'accès complet au widget, mettre le tableau sur la page, relier le widget par « Sélectionner par », cliquer sur une ligne), chacune avec sa
//   capture aux repères numérotés. Sans l'accès complet, Grist n'envoie aucune ligne au widget. La dernière étape dit d'abord d'ajouter une ligne
//   quand le tableau est vide. Dans l'état 'unknown', une dernière ligne dit quoi faire si le widget est déjà relié.
// - Il se tient à jour sans recharger : Grist renvoie les options du widget dès que son lien ou son accès change (GristAPI.onLinkStateChange et
//   onAccessLevelChange, js/grist-api.js), la langue de l'interface aussi (I18n.onChange) ; et il cède la place au document dès qu'une ligne arrive
//   (js/reader-mode.js remplace tout le contenu du conteneur de la Lecture).
// - Les captures (img/reader-guide/{fr,en}-{1,2,3,4}.png, le numéro est celui de l'étape : 1 accès, 2 tableau sur la page, 3 « Sélectionner par », 4
//   ligne choisie) viennent d'un vrai Grist (son interface réelle, un document d'exemple « Factures »), dans la langue de l'interface du widget,
//   repères numérotés et flèche ajoutés par-dessus. À refaire, avec IMAGE_VERSION montée, si Grist déplace ces réglages.
// - Dans le panneau de 700×400, le guide défile (le conteneur de la Lecture défile déjà) : les captures s'y lisent à 66 % de leur taille, un clic sur
//   l'une l'affiche à sa taille réelle, un second la rétrécit.
// - L'éditeur sans accès complet (renderAccess, appelé par js/main.js:syncEditorVisibilityForMode) : la même carte, réduite à l'étape de l'accès, dans
//   #access-guide-container à la place du document. Sans l'accès complet ('none', ou 'read table' qui ne lit que la table liée) Grist refuse au widget
//   toute lecture et toute écriture hors de cette table (WidgetFrame.ts, grist-core : GristDocAPI exige l'accès complet) : ni la liste des modèles ni
//   l'enregistrement ne marchent, et l'éditeur n'avait à montrer que « Échec de l'enregistrement ». Seule l'introduction change (celle de la Lecture
//   parle d'une ligne) ; le titre, la phrase, les trois repères et la capture sont les mêmes. Grist reconstruit le cadre du widget à chaque changement
//   d'accès : la carte disparaît avec le rechargement, js/main.js n'a pas à rouvrir quoi que ce soit.
// Script classique (pas type="module"), même convention de portée globale que CleanReading ; js/reader-mode.js l'appelle (ReaderGuide.render).
const ReaderGuide = (function () {
  const el = Dom.el;

  const IMAGE_DIR = 'img/reader-guide/';
  const IMAGE_VERSION = '2';
  // Une étape : l'identifiant de ses textes (readerGuide.<id>.*), le nombre de repères numérotés de sa capture (une ligne de liste chacun), si elle
  // s'ouvre sur une phrase, et la largeur réelle de sa capture en pixels CSS (le fichier est enregistré au double, pour les écrans à forte densité).
  // La phrase d'une étape reçoit {next} : le numéro de l'étape suivante (« Déjà fait ? Passez à l'étape 2 »).
  const STEPS = [
    { id: 'access', marks: 3, lead: true, width: 244 },
    { id: 'add', marks: 3, lead: true, width: 470 },
    { id: 'link', marks: 3, lead: true, width: 240 },
    { id: 'pick', marks: 2, lead: true, width: 282 },
  ];
  let wired = false;
  // La carte de l'éditeur vit dans son propre conteneur (index.html), à côté de #reader-container : la Lecture garde son contenu quand on repasse en
  // Édition, les deux cartes peuvent donc exister ensemble - d'où un autre identifiant de titre.
  const EDITOR_CONTAINER_ID = 'access-guide-container';
  // Niveaux d'accès (settings.accessLevel de Grist) qui ne suffisent pas à l'éditeur. Liste fermée : un niveau que ce code ne connaît pas ne fait jamais
  // apparaître la carte.
  const EDITOR_INSUFFICIENT_ACCESS = ['none', 'read table'];
  const editorLacksAccess = () => EDITOR_INSUFFICIENT_ACCESS.indexOf(GristAPI.getAccessLevel()) !== -1;

  // Titres : des <p role="heading">, pas des <h2>/<h3> - css/style.css peint tout titre du conteneur de la Lecture en gris-bleu foncé (les titres du
  // document, sur la page blanche), invisible sur le fond sombre du plan de travail en thème sombre.
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
      // La capture change de place (à droite du texte -> sous le texte, et inversement) : dans un panneau de 400 px de haut elle sortirait de l'écran
      // sous le doigt de qui vient de cliquer. On la garde visible, sans animation (même geste pour qui préfère les mouvements réduits).
      shot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return shot;
  }

  // `alone` : l'étape est seule dans sa carte (l'accès complet d'un widget relié) - ni « Étape n » ni titre, la carte porte déjà le titre de l'étape,
  // et une phrase d'appui à elle (readerGuide.<id>Only.lead : « Passez à l'étape 2 » n'aurait pas de sens).
  function buildStep(step, index, alone) {
    const li = el('li', 'reader-guide-step');
    const body = el('div', 'reader-guide-step-body');
    if (!alone) {
      body.appendChild(el('p', 'reader-guide-eyebrow', I18n.t('readerGuide.step', { n: index + 1 })));
      body.appendChild(heading(3, 'reader-guide-step-title', I18n.t('readerGuide.' + step.id + '.title')));
    }
    if (step.lead) body.appendChild(el('p', 'reader-guide-lead', I18n.t('readerGuide.' + step.id + (alone ? 'Only' : '') + '.lead', { next: index + 2 })));
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

  // Widget relié sans accès complet : la même carte réduite à l'étape de l'accès, sous le titre de cette étape et une phrase qui dit pourquoi aucune
  // ligne n'arrive. `editor` : la carte de l'éditeur, dont l'introduction dit ce que l'accès manquant empêche là (lire et enregistrer les modèles).
  function buildAccessOnly(editor) {
    const step = STEPS.find(s => s.id === 'access');
    const titleId = editor ? 'access-guide-title' : 'reader-guide-title';
    const root = el('section', 'reader-guide');
    root.setAttribute('aria-labelledby', titleId);
    const title = heading(2, 'reader-guide-title', I18n.t('readerGuide.' + step.id + '.title'));
    title.id = titleId;
    root.appendChild(title);
    root.appendChild(el('p', 'reader-guide-intro', I18n.t(editor ? 'readerGuide.accessEditor.intro' : 'readerGuide.accessOnly.intro')));
    const steps = el('ol', 'reader-guide-steps');
    steps.setAttribute('role', 'list');
    steps.appendChild(buildStep(step, STEPS.indexOf(step), true));
    root.appendChild(steps);
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
    GristAPI.onAccessLevelChange(refresh);
    I18n.onChange(refresh);
    // La carte de l'éditeur n'a que la langue à suivre : sa venue et son départ, c'est js/main.js qui les décide (mode, type du modèle).
    I18n.onChange(() => {
      const container = document.getElementById(EDITOR_CONTAINER_ID);
      if (container && container.querySelector(':scope > .reader-guide')) renderAccess(container);
    });
  }

  function render(container) {
    wire();
    container.innerHTML = '';
    const state = GristAPI.getLinkState();
    if (state !== 'linked') container.appendChild(buildGuide(state));
    else container.appendChild(GristAPI.getAccessLevel() === 'none' ? buildAccessOnly() : buildMessage());
  }

  // L'éditeur sans accès complet : la carte de l'accès, seule, dans `container` (#access-guide-container).
  function renderAccess(container) {
    wire();
    container.innerHTML = '';
    container.appendChild(buildAccessOnly(true));
  }

  return { render, renderAccess, editorLacksAccess };
})();
