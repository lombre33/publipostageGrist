// Vue « épinglés + arbre de dossiers » du sélecteur de modèles, à partir des modèles (Templates.getCached()) et des préférences de la personne
// (TemplatePreferences.getCached()).
// Fonction pure, sans DOM ni Grist (dev-tests/unit-template-organizer.mjs) ; rendu : planning/feature-rangement-tri-modeles.md §7.1.
// `typeModele` (document, email, macro) traverse la vue sans interprétation : il ne sert qu'au rendu (icône, libellé). Le module ne lit jamais
// Contenu.
const TemplateOrganizer = (function () {
  // " Factures / / 2024 " -> ["Factures", "2024"]. Mêmes règles que TemplatePreferences.normalizeFolderPath, recopiées pour rester utilisable seul
  // (tests isolés) : les deux évoluent ensemble.
  function splitPath(path) {
    return path ? String(path).split('/').map((s) => s.trim()).filter(Boolean) : [];
  }

  // Nom peut être null ou d'un type non textuel (colonne Nom pas en Texte) : String(x ?? '') évite un plantage de localeCompare, qui casserait tout
  // le rendu de l'arbre.
  function byName(a, b) { return String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'fr'); }

  // { pinned: [{id, nom, dossier}], tree: [noeud, ...] } ; noeud = { type: 'dossier', nom, chemin, enfants } ou { type: 'modele', id, nom }.
  // À chaque niveau : dossiers d'abord, puis modèles, par ordre alphabétique dans chaque groupe.
  function buildView(templates, preferences) {
    preferences = preferences || {};
    templates = templates || [];

    const pinned = templates
      .filter((t) => preferences[t.id] && preferences[t.id].epingle)
      .map((t) => ({ id: t.id, nom: t.nom, typeModele: t.typeModele || 'document', dossier: (preferences[t.id] && preferences[t.id].dossier) || null }))
      .sort(byName);

    // Object.create(null) : un dossier nommé « constructor » ou « __proto__ » ne doit pas retrouver une propriété héritée d'Object.prototype (même
    // piège que byName).
    const root = { enfants: Object.create(null), modeles: [] };
    function folderNode(segments) {
      let node = root;
      const acc = [];
      segments.forEach((seg) => {
        acc.push(seg);
        if (!node.enfants[seg]) node.enfants[seg] = { nom: seg, chemin: acc.join('/'), enfants: Object.create(null), modeles: [] };
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
