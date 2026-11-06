// Le rappel « images sans texte alternatif » à l'export (choix du 06/11 : « un réglage à activer, genre accessibilité : s'il est activé on prévient à l'export, sinon on ne prévient pas »).
// Éteint (au départ), rien ne change : aucune question, aucun repère sur l'image dans l'éditeur. Allumé (Réglages > Thème > Accessibilité, une préférence de la personne : js/person-store.js, clé
// `pp_alt_reminder`), un export Word, PowerPoint, HTML ou Markdown - les formats qui écrivent le texte alternatif - compte d'abord les images du document qui n'en ont pas et le dit une fois :
// une fenêtre (Dialogs.choose) offre de décrire la première image ou d'exporter quand même, « Annuler » arrête l'export. Le PDF, l'Excel et l'impression n'y passent pas : le PDF de pdfmake n'écrit
// aucune structure, donc aucun texte alternatif à rappeler.
// Une image compte quand elle n'est ni décorative ni décrite (js/alt-text.js : l'ancien texte « Image » ne décrit rien) ; le texte à #colonnes compte comme décrit - il se remplit à chaque ligne.
// Les images du corps comme celles de l'en-tête et du pied de page exportés. Les objets de diapositive (cadres, formes, traits) ne comptent pas : leur texte les décrit, et une forme de décor n'a
// pas à être signalée à chaque export.
// Un lancement d'export (un clic, un lot entier : js/main.js:withExportLock) ne pose la question qu'une fois : la réponse « exporter quand même » vaut pour tout le lot, « Annuler » l'arrête en entier
// (la même erreur d'annulation que la fenêtre des images d'un autre site : js/external-images.js). Sans lancement ouvert, chaque appel demande pour lui seul.
//   AltReminder.isOn() / setOn(vrai|faux) -> la préférence ; setOn rend vrai quand elle est retenue (stockage indisponible : faux, rien ne change)
//   AltReminder.beginRun() / endRun()    -> un lancement d'export (js/main.js:withExportLock)
//   AltReminder.confirmExport(html, headerFooterData) -> Promise<void> ; rejette (ExternalImages.isCancel) quand la personne annule ou va décrire l'image ; appelé par les quatre exports qui écrivent le texte alternatif
//   AltReminder.missingIn(fragments) -> le nombre d'images à décrire dans ces morceaux de HTML (le corps, puis l'en-tête et le pied)
const AltReminder = (function () {
  const STORAGE = 'pp_alt_reminder';

  const isOn = () => PersonStore.get(STORAGE) === 'on';
  const setOn = on => PersonStore.set(STORAGE, on ? 'on' : 'off');

  // Lu dans un document inerte (DOMParser) : un innerHTML sur un nœud de la page ferait déjà charger les images.
  function missingIn(fragments) {
    let count = 0;
    fragments.forEach((html) => {
      if (!html) return;
      new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img.editor-image').forEach((img) => {
        const look = AltText.ofImage(img);
        if (!look.decorative && !look.text) count++;
      });
    });
    return count;
  }

  // La première image à décrire dans l'éditeur à l'écran (le HTML exporté peut venir d'ailleurs : un macro-modèle, un autre modèle de la ligne) : sa place, sinon null - le bouton « Décrire »
  // n'est alors pas proposé. Pas d'éditeur modifiable ou caché (la Lecture) : rien à montrer.
  function firstInEditor() {
    const ed = EditorCore.getEditor();
    if (!ed || !ed.isEditable || ed.view.dom.getClientRects().length === 0) return null;
    let found = null;
    ed.state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type.name === 'editorImage' && !AltText.isDescribed(node.attrs)) found = pos;
      return true;
    });
    return found;
  }

  // Sélectionne l'image, la montre, et ouvre la fenêtre du texte alternatif sur elle.
  function describeAt(pos) {
    const ed = EditorCore.getEditor();
    if (!ed) return;
    ed.chain().setNodeSelection(pos).scrollIntoView().run();
    AltText.open();
  }

  // La question : vrai pour « exporter quand même », faux pour tout le reste (la fenêtre annulée, « Décrire »).
  async function ask(count) {
    const first = firstInEditor();
    const choices = [{ value: 'export', label: I18n.t('altReminder.exportAnyway') }];
    if (first !== null) choices.unshift({ value: 'describe', label: I18n.t('altReminder.describe', { count }), primary: true });
    const picked = await Dialogs.choose({ title: I18n.t('altReminder.title'), message: I18n.t('altReminder.message', { count }), choices });
    if (picked === 'describe') describeAt(first);
    return picked === 'export';
  }

  let run = null;                          // lancement en cours : { asked: la question posée (une promesse) }
  let memo = { key: null, count: 0 };      // dernier HTML compté : un lot rend le même modèle ligne après ligne

  function beginRun() { run = { asked: null }; }
  function endRun() { run = null; }

  async function confirmExport(html, headerFooterData) {
    if (!isOn()) return;
    const scope = run || { asked: null };
    // Déjà posée dans ce lancement : la réponse vaut pour la suite, sans relire le HTML.
    if (scope.asked) {
      if (!(await scope.asked)) throw ExternalImages.cancelError();
      return;
    }
    const fragments = ExternalImages.fragmentsOf(html, headerFooterData);
    const key = fragments.join('\u0000');
    if (memo.key !== key) memo = { key, count: missingIn(fragments) };
    if (!memo.count) return;
    scope.asked = ask(memo.count);
    if (!(await scope.asked)) throw ExternalImages.cancelError();
  }

  return { isOn, setOn, beginRun, endRun, confirmExport, missingIn };
})();
