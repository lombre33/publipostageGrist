// Onglet "Code HTML" (mode avancé) : édition directe du HTML brut du modèle,
// isolée de l'éditeur Quill classique. AUCUN aller-retour garanti avec ce
// dernier n'est tenté ici (cf. dev-tests/README.md / mémoire projet : Quill
// ne préserve que les formats pour lesquels il a un attributor enregistré -
// tout le reste, police hors liste, structure non reconnue, est
// silencieusement perdu dès qu'on repasse en édition classique). L'aperçu
// réutilise le mode "Lecture" déjà existant (cf. main.js:getActiveHtml/
// renderReader) plutôt que de dupliquer un second système d'aperçu ici.
const HtmlSourceTab = (function () {
  let textarea = null;
  let initialized = false;

  function init() {
    textarea = document.getElementById('html-source-textarea');
  }

  // Appelé une seule fois par modèle chargé (main.js:loadTemplateIntoEditor,
  // onNew) - PAS à chaque bascule vers ce mode (cf. ensureInitialized) :
  // changer de modèle réinitialise cette vue comme toutes les autres, mais un
  // aller-retour Code HTML <-> Lecture <-> Code HTML sur le MÊME modèle en
  // cours d'édition ne doit jamais écraser silencieusement ce que
  // l'utilisateur vient de taper ici.
  function reset(html) {
    if (!textarea) return;
    textarea.value = html || '';
    initialized = true;
  }

  // Assure un contenu de départ la toute première fois qu'on affiche ce mode
  // pour un document (ex. widget qui vient de démarrer, avant le premier
  // chargement explicite de modèle) - sans effet les fois suivantes.
  function ensureInitialized(html) {
    if (!initialized) reset(html);
  }

  // Neutralise ce qui pourrait s'exécuter/s'appliquer globalement une fois
  // injecté via innerHTML ailleurs dans l'app (aperçu en mode Lecture, export
  // raster) : un <script> ou un attribut on* taperait dans la session d'un
  // AUTRE utilisateur ouvrant ce même document Grist partagé ; un <style>
  // tapé à la main s'appliquerait GLOBALEMENT au document réel de l'app (pas
  // seulement à l'aperçu), sans le moindre sandboxing par iframe. Jamais
  // appliqué au texte affiché DANS le textarea lui-même - seule la copie
  // utilisée ailleurs (aperçu/export/sauvegarde, cf. getSanitizedHtml) est
  // nettoyée.
  function sanitizeHtml(html) {
    const root = document.createElement('div');
    root.innerHTML = html || '';
    root.querySelectorAll('script, style').forEach(node => node.remove());
    root.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.indexOf('on') === 0) { node.removeAttribute(attr.name); return; }
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
      });
    });
    return root.innerHTML;
  }

  // Point d'accès UNIQUE utilisé par main.js (getActiveHtml) pour
  // aperçu/export/sauvegarde tant que ce mode est actif - lit toujours la
  // valeur ACTUELLE du textarea (jamais une copie mise en cache).
  function getSanitizedHtml() {
    return sanitizeHtml(textarea ? textarea.value : '');
  }

  return { init, reset, ensureInitialized, getSanitizedHtml, sanitizeHtml };
})();
