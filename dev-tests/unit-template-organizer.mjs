#!/usr/bin/env node
// Tests purs (sans navigateur) de js/template-organizer.js - cf. dev-tests/unit-harness.mjs pour
// pourquoi ce module n'est pas encore testé via dev-tests/run-headless.mjs.
// Lancer : node dev-tests/unit-template-organizer.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/template-organizer.js');

function view(templates, prefs) {
  ctx.__TEMPLATES = templates;
  ctx.__PREFS = prefs;
  return evalIn(ctx, 'TemplateOrganizer.buildView(__TEMPLATES, __PREFS)');
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

summarizeAndExit();
