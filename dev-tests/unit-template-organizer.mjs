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

summarizeAndExit();
