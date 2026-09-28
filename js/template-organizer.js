// Construit la vue "épinglés + arbre de dossiers" du sélecteur de modèles à partir des modèles
// (Templates.getCached()) et des préférences de l'utilisateur courant (TemplatePreferences.getCached()).
// Fonction pure, sans accès DOM ni Grist : testable sans navigateur (dev-tests/unit-template-organizer.mjs).
// planning/feature-rangement-tri-modeles.md §7.1 (Piste A/B) décrit le rendu qui consomme cette vue.
// typeModele (document/email/macro, cf. js/templates.js) traverse la vue sans interprétation : sert
// uniquement au rendu (icône/libellé distincts par type) - jamais supposer que Contenu est du HTML ici,
// ce module ne lit jamais Contenu.
const TemplateOrganizer = (function () {
  // "  Factures / / 2024 " -> ["Factures", "2024"] - mêmes règles de nettoyage que
  // TemplatePreferences.normalizeFolderPath, dupliquées ici pour rester utilisable sans dépendre de
  // ce module (ex. tests isolés) ; les deux DOIVENT rester en accord si l'une évolue.
  function splitPath(path) {
    return path ? String(path).split('/').map((s) => s.trim()).filter(Boolean) : [];
  }

  // (a.nom || '') : une ligne Grist réelle peut avoir Nom vide/null (cellule effacée directement dans la
  // grille, jamais passée par la validation "Nom du modèle requis" de js/main.js:onSave) - avant ce garde,
  // .localeCompare sur null plantait ici en plein tri, qui casse TOUT le rendu de l'arbre (bug réel trouvé
  // le 2026-09-28 en creusant "l'enregistrement d'un modèle ne fonctionne pas" chez Antoine : attach()
  // (js/template-tree-select.js) appelle render() -> buildView() -> byName() SANS filet, donc l'exception
  // remonte jusqu'à main.js:init(), qui n'a lui-même aucun try/catch autour de son propre appel - tout ce
  // qui vient après (branchement d'Enregistrer, Ctrl+S, l'auto-save, et le statut "Prêt") ne s'exécute
  // alors jamais.
  function byName(a, b) { return (a.nom || '').localeCompare(b.nom || '', 'fr'); }

  // { pinned: [{id, nom, dossier}], tree: [noeud, ...] } où noeud est
  // { type: 'dossier', nom, chemin, enfants: [noeud, ...] } ou { type: 'modele', id, nom }.
  // À chaque niveau : dossiers d'abord, puis modèles, alphabétique dans chaque groupe (convention
  // explorateur de fichiers, cf. planning §7.1).
  function buildView(templates, preferences) {
    preferences = preferences || {};
    templates = templates || [];

    const pinned = templates
      .filter((t) => preferences[t.id] && preferences[t.id].epingle)
      .map((t) => ({ id: t.id, nom: t.nom, typeModele: t.typeModele || 'document', dossier: (preferences[t.id] && preferences[t.id].dossier) || null }))
      .sort(byName);

    const root = { enfants: {}, modeles: [] };
    function folderNode(segments) {
      let node = root;
      const acc = [];
      segments.forEach((seg) => {
        acc.push(seg);
        if (!node.enfants[seg]) node.enfants[seg] = { nom: seg, chemin: acc.join('/'), enfants: {}, modeles: [] };
        node = node.enfants[seg];
      });
      return node;
    }
    templates.forEach((t) => {
      const dossier = (preferences[t.id] && preferences[t.id].dossier) || null;
      folderNode(splitPath(dossier)).modeles.push({ id: t.id, nom: t.nom, typeModele: t.typeModele || 'document' });
    });

    function toSortedList(node) {
      const dossiers = Object.keys(node.enfants)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map((key) => {
          const child = node.enfants[key];
          return { type: 'dossier', nom: child.nom, chemin: child.chemin, enfants: toSortedList(child) };
        });
      const modeles = node.modeles.slice().sort(byName).map((m) => ({ type: 'modele', id: m.id, nom: m.nom, typeModele: m.typeModele }));
      return dossiers.concat(modeles);
    }

    return { pinned, tree: toSortedList(root) };
  }

  return { buildView, splitPath };
})();
