#!/usr/bin/env node
// Tests purs (sans navigateur) de js/loop-rules.js : ce qu'une bulle peut parcourir (`sourceFor`). Le vrai js/grist-api.js (lecture du type d'une
// Référence), dont seuls le schéma et les règles de liaison sont simulés. cf. dev-tests/unit-harness.mjs.
// Lancer : node dev-tests/unit-loop-rules.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const TYPES = {
  'Factures.Lignes': 'RefList:Lignes',
  'Factures.Soi': 'RefList:Factures',
  'Factures.Client': 'Ref:Clients',
  'Factures.Nom': 'Text',
  'Factures.Vide': 'RefList:',
  'Factures.Casse': 'reflist:Lignes',
};
const RULES = {
  Lignes: { mode: 'match', colonneCible: 'Facture' },
  Clients: { mode: 'match', colonneCible: 'id' },
  Taches: { mode: 'row' },
};

const ctx = createContext({ grist: { docApi: {} } });
loadScript(ctx, 'js/grist-api.js');
const api = evalIn(ctx, 'GristAPI');
api.getColumnType = (table, column) => TYPES[table + '.' + column];
api.getLinkRule = table => RULES[table] || null;
loadScript(ctx, 'js/loop-rules.js');
const sourceFor = (attrs, page) => JSON.parse(JSON.stringify(evalIn(ctx, 'LoopRules').sourceFor(attrs, page)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Une colonne Liste de références de la page : la boucle parcourt la table visée, en lisant la liste dans la ligne courante.
check('liste de références de la page : la table visée, avec la colonne qui porte la liste',
  same(sourceFor({ table: 'Factures', column: 'Lignes' }, 'Factures'), { table: 'Lignes', via: { table: 'Factures', column: 'Lignes' } }));
check('liste de références vers la table de la page elle-même : écartée', sourceFor({ table: 'Factures', column: 'Soi' }, 'Factures') === null);
check('référence simple (pas une liste) : écartée', sourceFor({ table: 'Factures', column: 'Client' }, 'Factures') === null);
check('liste de références sans table visée : écartée', sourceFor({ table: 'Factures', column: 'Vide' }, 'Factures') === null);
check('type écrit autrement (casse) : écarté', sourceFor({ table: 'Factures', column: 'Casse' }, 'Factures') === null);
check('colonne ordinaire de la page : écartée', sourceFor({ table: 'Factures', column: 'Nom' }, 'Factures') === null);
check('colonne inconnue de la page : écartée', sourceFor({ table: 'Factures', column: 'Inconnue' }, 'Factures') === null);
check('colonne en chemin (Ref.Colonne) : écartée', sourceFor({ table: 'Factures', column: 'Client.Nom' }, 'Factures') === null);

// Une autre table liée par une règle « match » qui peut trouver plusieurs lignes.
check('autre table liée par « match » sur une colonne : parcourue, sans colonne de liste', same(sourceFor({ table: 'Lignes', column: 'Prix' }, 'Factures'), { table: 'Lignes', via: null }));
check('autre table liée par « match » sur l\'identifiant de ligne (une seule ligne) : écartée', sourceFor({ table: 'Clients', column: 'Nom' }, 'Factures') === null);
check('autre table liée sans « match » : écartée', sourceFor({ table: 'Taches', column: 'Nom' }, 'Factures') === null);
check('autre table sans règle : écartée', sourceFor({ table: 'Autre', column: 'Nom' }, 'Factures') === null);

check('attributs ou page absents : écarté', sourceFor(null, 'Factures') === null && sourceFor({ column: 'Lignes' }, 'Factures') === null
  && sourceFor({ table: 'Factures', column: 'Lignes' }, '') === null);

summarizeAndExit();
