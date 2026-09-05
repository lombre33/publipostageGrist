// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l'export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
// + poignée de redimensionnement pour .two-columns-zone (v1.8.3)
// + isolation du picker d'alignement (v1.8.4 - fix/two-columns-align)
const Editor = (function () {
  let quill = null;
  }

  function getQuill() { return quill; }
  function getHTML() { return quill.root.innerHTML; }
  function setHTML(html) { quill.root.innerHTML = html || ''; quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); }

  return { init, getQuill, getHTML, setHTML };
})();
