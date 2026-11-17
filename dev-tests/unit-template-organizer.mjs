#!/usr/bin/env node
// Tests purs (sans navigateur) de js/template-organizer.js - cf. dev-tests/unit-harness.mjs pour
// pourquoi ce module n'est pas encore testé via dev-tests/run-headless.mjs.
// Lancer : node dev-tests/unit-template-organizer.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/template-organizer.js');

function view(templates, prefs, folders) {
  ctx.__TEMPLATES = templates;
  ctx.__PREFS = prefs;
  ctx.__FOLDERS = folders;
  return evalIn(ctx, 'TemplateOrganizer.buildView(__TEMPLATES, __PREFS, __FOLDERS)');
}

// 1. Sans aucune préférence : liste plate, alphabétique (corrige au passage l'absence de tri actuelle
// de refreshTemplateList - cf. planning/feature-rangement-tri-modeles.md §1), aucun épinglé.
{
  const templates = [{ id: 3, nom: 'CGV' }, { id: 1, nom: 'Attestation' }, { id: 2, nom: 'Contrat' }];
  const v = view(templates, {});
  const noms = v.tree.map((n) => n.nom);
  check('sans préférence : ordre alphabétique à plat', JSON.stringify(noms) === JSON.stringify(['Attestation', 'CGV', 'Contrat']), noms.join(','));
  check('sans préférence : aucun épinglé', v.pinned.length === 0);
  check('sans préférence : les noeuds sont bien de type modele', v.tree.every((n) => n.type === 'modele'));
}

// 2. Épinglage indépendant du dossier - un modèle épinglé ET classé apparaît aux deux endroits
// (planning §4.1 : "un modèle peut être à la fois épinglé et classé").
{
  const templates = [{ id: 1, nom: 'Facture standard' }, { id: 2, nom: 'CGV' }];
  const prefs = { 1: { epingle: true, dossier: 'Courriers' } };
  const v = view(templates, prefs);
  check('épinglé présent dans pinned', v.pinned.some((p) => p.id === 1));
  check('pinned garde le dossier réel (pas perdu)', (v.pinned.find((p) => p.id === 1) || {}).dossier === 'Courriers');
  const courriers = v.tree.find((n) => n.type === 'dossier' && n.nom === 'Courriers');
  check('épinglé présent AUSSI dans son dossier de l’arbre', !!courriers && courriers.enfants.some((e) => e.type === 'modele' && e.id === 1), JSON.stringify(v.tree));
  check('non-épinglé absent de pinned', !v.pinned.some((p) => p.id === 2));
}

// 3. Dossiers imbriqués - chemin "Factures/Clients A" (planning §7.1, Piste A).
{
  const templates = [{ id: 1, nom: 'Contrat de prestation' }];
  const prefs = { 1: { epingle: false, dossier: 'Factures/Clients A' } };
  const v = view(templates, prefs);
  const factures = v.tree.find((n) => n.type === 'dossier' && n.nom === 'Factures');
  const clientsA = factures && factures.enfants.find((n) => n.type === 'dossier' && n.nom === 'Clients A');
  const feuille = clientsA && clientsA.enfants.find((n) => n.type === 'modele' && n.id === 1);
  check('dossier imbriqué reconstruit (Factures > Clients A > modèle)', !!feuille, JSON.stringify(v.tree));
  check('chemin exposé sur le noeud dossier', !!factures && factures.chemin === 'Factures' && !!clientsA && clientsA.chemin === 'Factures/Clients A');
}

// 4. Tri : dossiers avant modèles à un même niveau, alphabétique dans chaque groupe.
{
  const templates = [{ id: 1, nom: 'Zèbre' }, { id: 2, nom: 'Alpha' }];
  const prefs = { 2: { epingle: false, dossier: 'ZDossier' } };
  const v = view(templates, prefs);
  check('les dossiers passent avant les modèles au même niveau', v.tree[0].type === 'dossier' && v.tree[1].type === 'modele', JSON.stringify(v.tree.map((n) => n.type)));
}

// 5. Chemin avec segments vides/espaces tolérés.
{
  const templates = [{ id: 1, nom: 'A' }];
  const prefs = { 1: { epingle: false, dossier: ' Factures / / 2024 ' } };
  const v = view(templates, prefs);
  const factures = v.tree.find((n) => n.nom === 'Factures');
  const annee = factures && factures.enfants.find((n) => n.nom === '2024');
  check('segments vides/espaces nettoyés du chemin', !!annee, JSON.stringify(v.tree));
}

// 6. Deux modèles de même nom dans deux dossiers différents ne se mélangent pas.
{
  const templates = [{ id: 1, nom: 'Modèle' }, { id: 2, nom: 'Modèle' }];
  const prefs = { 1: { epingle: false, dossier: 'A' }, 2: { epingle: false, dossier: 'B' } };
  const v = view(templates, prefs);
  const a = v.tree.find((n) => n.nom === 'A');
  const b = v.tree.find((n) => n.nom === 'B');
  check('deux dossiers distincts gardent chacun leur propre modèle', a.enfants.length === 1 && a.enfants[0].id === 1 && b.enfants.length === 1 && b.enfants[0].id === 2);
}

// 7. Les trois types de modèle (document/email/macro, cf. js/templates.js) traversent la vue sans
// distinction de traitement - seul le rendu (pas ce module) les distingue (relais coordinateur 2026-09-20).
{
  const templates = [
    { id: 1, nom: 'Lettre', typeModele: 'document' },
    { id: 2, nom: 'Relance', typeModele: 'email' },
    { id: 3, nom: 'Dossier client', typeModele: 'macro' },
  ];
  const prefs = { 3: { epingle: true, dossier: null } };
  const v = view(templates, prefs);
  const byId = (id) => v.tree.find((n) => n.type === 'modele' && n.id === id);
  check('typeModele conservé sur un modèle document', byId(1).typeModele === 'document');
  check('typeModele conservé sur un modèle email', byId(2).typeModele === 'email');
  check('typeModele conservé sur un modèle macro', byId(3).typeModele === 'macro');
  check('typeModele conservé aussi côté épinglés', v.pinned.find((p) => p.id === 3).typeModele === 'macro');
}

// 8. typeModele absent (donnée ancienne/incomplète) : ne casse pas, retombe sur 'document' - même
// défaut que js/templates.js:189.
{
  const templates = [{ id: 1, nom: 'Ancien modèle' }];
  const v = view(templates, {});
  check('typeModele par défaut = document quand absent', v.tree[0].typeModele === 'document');
}

// 9. Régression du 2026-09-28 (Antoine : "l'enregistrement d'un modèle ne fonctionne pas") - une ligne
// Grist réelle avec Nom vide/null (cellule effacée directement dans la grille, jamais passée par la
// validation "Nom du modèle requis" de js/main.js:onSave) faisait planter byName() (a.nom.localeCompare
// sur null) EN PLEIN TRI, DANS TOUS les groupes (racine, pinned, chaque dossier) - pas seulement celui
// de la ligne sale. Cette exception remonte sans filet à travers template-tree-select.js:render()/
// attach() jusqu'à main.js:init(), qui n'a lui-même aucun try/catch : tout ce que init() branche APRÈS
// TemplateTreeSelect.attach() (bouton Enregistrer, Ctrl+S, l'auto-save, le statut "Prêt") ne s'exécute
// alors jamais - un candidat sérieux pour expliquer À LA FOIS le "plus de dropdown" ET "l'enregistrement
// ne marche pas" d'un seul coup.
{
  const templates = [{ id: 1, nom: 'Modèle propre' }, { id: 2, nom: null }, { id: 3, nom: undefined }, { id: 4, nom: '' }];
  const prefs = { 2: { epingle: true, dossier: null } };
  let threw = null;
  let v;
  try { v = view(templates, prefs); } catch (e) { threw = e; }
  check('une ligne Nom vide/null/undefined ne fait plus planter le tri', !threw, threw && threw.message);
  check('les 4 lignes apparaissent quand même dans l’arbre', v && v.tree.length === 4, v && JSON.stringify(v.tree));
  check('la ligne épinglée à Nom null apparaît aussi dans pinned', v && v.pinned.some((p) => p.id === 2));
}

// 10. Régression du 2026-09-28, signalée par Antoine après le correctif du scénario 9 ("fond bleu au clic,
// dropdown cassé") : (a.nom || '') protège '' et null, mais PAS un Nom non-nullish et non-string (colonne
// Nom d'un type autre que Texte, ou valeur d'erreur Grist sur une formule) - .localeCompare n'existe que
// sur les chaînes, donc byName() plantait quand même. Coercition explicite en chaîne (String(x ?? '')) des
// deux côtés de la comparaison.
{
  const templates = [
    { id: 1, nom: 'Modèle propre' },
    { id: 2, nom: 42 },
    { id: 3, nom: true },
    { id: 4, nom: { error: 'ERROR: colonne invalide' } },
  ];
  const prefs = { 2: { epingle: true, dossier: null } };
  let threw = null;
  let v;
  try { v = view(templates, prefs); } catch (e) { threw = e; }
  check('un Nom nombre/booléen/objet ne fait plus planter le tri', !threw, threw && threw.message);
  check('les 4 lignes apparaissent quand même dans l’arbre (nom non-string)', v && v.tree.length === 4, v && JSON.stringify(v.tree));
  check('la ligne épinglée à Nom nombre apparaît aussi dans pinned', v && v.pinned.some((p) => p.id === 2));
}

// 11. Régression du 2026-09-28 (même signalement) : un dossier nommé comme une propriété héritée
// d'Object.prototype ('constructor', 'toString', '__proto__'...) était lu comme "déjà créé" par
// folderNode() sur un accumulateur { } ordinaire (node.enfants[seg] retrouvait la propriété héritée au
// lieu d'undefined), réutilisait cette valeur native à la place d'un vrai noeud {enfants,modeles}, et
// plantait plus loin faute de ces champs. Object.create(null) enlève ce prototype partagé.
{
  const templates = [
    { id: 1, nom: 'Facture A' },
    { id: 2, nom: 'Facture B' },
    { id: 3, nom: 'Facture C' },
    { id: 4, nom: 'Facture D' },
  ];
  const prefs = {
    1: { epingle: false, dossier: 'constructor' },
    2: { epingle: false, dossier: 'toString' },
    3: { epingle: false, dossier: '__proto__' },
    4: { epingle: false, dossier: 'hasOwnProperty' },
  };
  let threw = null;
  let v;
  try { v = view(templates, prefs); } catch (e) { threw = e; }
  check('un dossier nommé comme Object.prototype ne fait plus planter le rangement', !threw, threw && threw.message);
  const dossierNoms = v ? v.tree.filter((n) => n.type === 'dossier').map((n) => n.nom).sort() : [];
  check('les 4 dossiers-pièges sont bien créés comme de vrais dossiers', JSON.stringify(dossierNoms) === JSON.stringify(['__proto__', 'constructor', 'hasOwnProperty', 'toString']), dossierNoms.join(','));
  const protoFolder = v && v.tree.find((n) => n.nom === '__proto__');
  check('chaque dossier-piège garde bien son modèle dedans', protoFolder && protoFolder.enfants.length === 1 && protoFolder.enfants[0].id === 3, protoFolder && JSON.stringify(protoFolder));
}

// 10. Consigne 072, point b (17/11) : un dossier qui n'a que sa ligne d'état (créé vide dans GFS) figure dans l'arbre comme un dossier vide ; un dossier imbriqué sans modèle
// fait aussi exister ses parents ; un dossier déjà porté par un modèle n'est pas doublé ; sans la liste des dossiers (appel d'avant), rien ne change.
{
  const templates = [{ id: 1, nom: 'Facture' }, { id: 2, nom: 'Contrat' }];
  const prefs = { 1: { epingle: false, dossier: 'Factures' } };
  const v = view(templates, prefs, ['Factures', 'Vide', 'Archives/2024', 'Archives/2024/Clients']);
  const names = (nodes) => nodes.filter((n) => n.type === 'dossier').map((n) => n.nom);
  check('dossier sans modèle : il figure dans l\u2019arbre, avec ceux qui ont des modèles, par ordre alphabétique', JSON.stringify(names(v.tree)) === JSON.stringify(['Archives', 'Factures', 'Vide']), JSON.stringify(names(v.tree)));
  const vide = v.tree.find((n) => n.nom === 'Vide');
  check('dossier sans modèle : un dossier d\u2019arbre de type dossier, chemin et enfants vides', !!vide && vide.type === 'dossier' && vide.chemin === 'Vide' && Array.isArray(vide.enfants) && vide.enfants.length === 0, JSON.stringify(vide));
  const archives = v.tree.find((n) => n.nom === 'Archives');
  const a2024 = archives && archives.enfants.find((n) => n.nom === '2024');
  check('dossier imbriqué sans modèle : ses parents existent, chacun avec son chemin', !!a2024 && archives.chemin === 'Archives' && a2024.chemin === 'Archives/2024' && a2024.enfants.length === 1 && a2024.enfants[0].chemin === 'Archives/2024/Clients', JSON.stringify(archives));
  const factures = v.tree.find((n) => n.nom === 'Factures');
  check('un dossier déjà porté par un modèle n\u2019est pas doublé', v.tree.filter((n) => n.nom === 'Factures').length === 1 && factures.enfants.length === 1 && factures.enfants[0].id === 1, JSON.stringify(factures));
  check('les modèles sans dossier restent à la racine, après les dossiers', v.tree[v.tree.length - 1].type === 'modele' && v.tree[v.tree.length - 1].id === 2);
  check('un dossier sans modèle n\u2019entre pas dans les épinglés', v.pinned.length === 0);
  const without = view(templates, prefs);
  check('sans la liste des dossiers (appel d\u2019avant) : seuls les dossiers des modèles', JSON.stringify(names(without.tree)) === JSON.stringify(['Factures']), JSON.stringify(names(without.tree)));
  const odd = view(templates, prefs, ['', null, '  /  ', 'constructor', '__proto__']);
  check('chemins vides ignorés, noms-pièges acceptés (Object.prototype)', JSON.stringify(names(odd.tree)) === JSON.stringify(['__proto__', 'constructor', 'Factures']), JSON.stringify(names(odd.tree)));
}

// 11. « Supprimer » sur un dossier vide (« Organiser mes modèles ») : findFolder retrouve un dossier de l'arbre par son chemin, à toute profondeur ; un dossier sans modèle ni sous-dossier a une liste
// `enfants` vide, un dossier qui porte un modèle ou un sous-dossier non ; un modèle n'est jamais pris pour un dossier.
{
  const templates = [{ id: 1, nom: 'Facture' }, { id: 2, nom: 'Contrat' }];
  const prefs = { 1: { epingle: false, dossier: 'Factures/Clients' } };
  const v = view(templates, prefs, ['Vide', 'Archives/2024', 'Factures/Clients', 'Factures/Brouillons']);
  const findIn = (tree, path) => { ctx.__TREE = tree; ctx.__PATH = path; try { return evalIn(ctx, 'TemplateOrganizer.findFolder(__TREE, __PATH)'); } catch (e) { return 'ERREUR : ' + e.message; } };
  const find = (path) => findIn(v.tree, path);
  // Les enfants d'un résultat, ou une liste vide : rien ne plante quand la fonction manque (essai joué sur l'ancien code : chaque vérification rend son verdict).
  const kids = (node) => (node && Array.isArray(node.enfants) ? node.enfants : []);
  const vide = find('Vide');
  check('dossier vide : trouvé à la racine, sans enfant', !!vide && vide.type === 'dossier' && vide.chemin === 'Vide' && kids(vide).length === 0 && Array.isArray(vide.enfants), JSON.stringify(vide));
  const brouillons = find('Factures/Brouillons');
  check('dossier vide imbriqué : trouvé par son chemin complet, sans enfant', !!brouillons && brouillons.chemin === 'Factures/Brouillons' && kids(brouillons).length === 0 && Array.isArray(brouillons.enfants), JSON.stringify(brouillons));
  const factures = find('Factures');
  check('dossier qui en contient d’autres : trouvé, il n’est pas vide', !!factures && kids(factures).length === 2, JSON.stringify(factures));
  const clients = find('Factures/Clients');
  check('dossier qui porte un modèle : trouvé, il n’est pas vide', !!clients && kids(clients).length === 1 && kids(clients)[0].type === 'modele', JSON.stringify(clients));
  const archives = find('Archives');
  check('dossier parent implicite (seul son fils existe) : trouvé, il n’est pas vide', !!archives && kids(archives).length === 1 && kids(archives)[0].chemin === 'Archives/2024', JSON.stringify(archives));
  check('chemin inconnu : null', find('Inconnu') === null && find('Factures/Inconnu') === null && find('') === null);
  check('un modèle n’est pas un dossier : « Facture » et « Contrat » ne se trouvent pas', find('Facture') === null && find('Contrat') === null);
  check('arbre absent ou vide : null, sans lever', findIn(undefined, 'Vide') === null && findIn([], 'Vide') === null);
}

summarizeAndExit();
