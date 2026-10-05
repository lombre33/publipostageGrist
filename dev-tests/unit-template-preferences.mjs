#!/usr/bin/env node
// Tests purs (sans navigateur) de js/template-preferences.js - cf. dev-tests/unit-harness.mjs pour le
// contexte général. Faux grist.docApi : dev-tests/fake-grist-doc-api.mjs.
// Lancer : node dev-tests/unit-template-preferences.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';
import { FakeDocApi } from './fake-grist-doc-api.mjs';

const TABLE_NAME = 'Publipostage_PreferencesModeles';

// Une instance vm.createContext + loadScript par scénario : TemplatePreferences garde un état
// module-niveau (cache, cachedEmail, tableChecked) qui ne doit pas fuiter d'un scénario à l'autre,
// exactement comme un vrai rechargement de page recharge js/template-preferences.js à zéro.
function freshModule({ initialTables = [], email = 'a@exemple.fr', emailFails = false, docOptions, console } = {}) {
  const docApi = new FakeDocApi(initialTables, docOptions);
  const ctx = createContext(Object.assign({ grist: { docApi } }, console ? { console } : {}));
  // Le vrai js/grist-api.js (création de la table, file d'écriture) ; seule l'identification est simulée.
  loadScript(ctx, 'js/grist-api.js');
  evalIn(ctx, 'GristAPI').getCurrentUserEmail = async () => {
    if (emailFails) throw new Error('identification indisponible (test)');
    return email;
  };
  loadScript(ctx, 'js/template-preferences.js');
  return { ctx, docApi, run: (expr) => evalIn(ctx, expr) };
}

async function main() {
  // 1. Migration depuis un document créé AVANT la fonctionnalité (aucune table au démarrage) - exigence
  // explicite du coordinateur (2026-09-20) : la table doit être créée à la volée, sans échouer.
  {
    const { docApi, run } = freshModule({ initialTables: [] });
    const cache = await run('TemplatePreferences.loadForCurrentUser()');
    check('migration : la table est créée quand elle n’existait pas', docApi.tables.has(TABLE_NAME));
    check('migration : une seule AddTable émise', docApi.addTableCalls === 1);
    check('migration : cache vide sur une table neuve', Object.keys(cache).length === 0);
  }

  // 2. Idempotence sur un document créé APRÈS la fonctionnalité (la table existe déjà) - ne doit PAS la
  // recréer (AddTable une deuxième fois planterait sur un vrai document Grist).
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    check('idempotence : aucune AddTable quand la table existe déjà', docApi.addTableCalls === 0);
  }

  // 2bis. La même instance de module ne réémet pas non plus AddTable sur un deuxième appel (ensureTableExists mémorise tableChecked).
  {
    const { docApi, run } = freshModule({ initialTables: [] });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('TemplatePreferences.setPinned(1, true)');
    check('idempotence : un seul AddTable même après plusieurs appels', docApi.addTableCalls === 1);
  }

  // 3. Aller-retour setPinned/setFolder : indépendants l'un de l'autre (patch ne touche que le champ fourni).
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('TemplatePreferences.setPinned(5, true)');
    await run('TemplatePreferences.setFolder(5, "Factures")');
    const pinned = await run('TemplatePreferences.isPinned(5)');
    const folder = await run('TemplatePreferences.getFolder(5)');
    check('setFolder après setPinned : épingle conservée', pinned === true);
    check('setFolder après setPinned : dossier bien posé', folder === 'Factures');
    const row = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 5);
    check('la ligne Grist sous-jacente porte les deux colonnes', row.Epingle === true && row.Dossier === 'Factures');

    await run('TemplatePreferences.setPinned(5, false)');
    const folderAfterUnpin = await run('TemplatePreferences.getFolder(5)');
    check('setPinned(false) après setFolder : dossier NON effacé', folderAfterUnpin === 'Factures');
  }

  // 4. Isolation par utilisateur : les préférences d'un autre utilisateur, même sur le même modèle, ne
  // doivent JAMAIS apparaître dans le cache de l'utilisateur courant.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], email: 'a@exemple.fr' });
    // Préremplissage direct du faux docApi AVANT le premier appel du module (simule des préférences
    // déjà écrites par un autre utilisateur sur un document partagé).
    docApi.seedRows(TABLE_NAME, [
      { Utilisateur: 'a@exemple.fr', ModeleId: 1, Epingle: true, Dossier: '' },
      { Utilisateur: 'b@exemple.fr', ModeleId: 1, Epingle: false, Dossier: 'Confidentiel' },
    ]);
    const cache = await run('TemplatePreferences.loadForCurrentUser()');
    check('isolation : la préférence de l’utilisateur courant est chargée', cache[1] && cache[1].epingle === true);
    check('isolation : le dossier de l’AUTRE utilisateur ne fuite pas', cache[1].dossier !== 'Confidentiel');
  }

  // 5. Repli anonyme silencieux (identification indisponible) : ni loadForCurrentUser() ni setPinned()
  // ne doivent lever - même politique que js/comments.js (Auteur='' plutôt que de bloquer l'action).
  // L'écriture doit rester lisible dans la MÊME session anonyme (round-trip), pas juste "ne pas planter".
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], emailFails: true });
    let threwOnLoad = false;
    let cache;
    try { cache = await run('TemplatePreferences.loadForCurrentUser()'); } catch (e) { threwOnLoad = true; }
    check('repli anonyme : loadForCurrentUser ne lève pas', !threwOnLoad);
    check('repli anonyme : cache vide au départ', cache && Object.keys(cache).length === 0);

    let writeError = null;
    try { await run('TemplatePreferences.setPinned(1, true)'); } catch (e) { writeError = e; }
    check('repli anonyme : setPinned ne lève pas non plus', !writeError, writeError && writeError.message);
    const row = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 1);
    check('repli anonyme : la ligne Grist est écrite avec Utilisateur vide', row && row.Utilisateur === '', row);

    // Round-trip : une nouvelle session (nouveau module, même document) tout aussi anonyme doit
    // retrouver cette même préférence "anonyme partagée" - sans quoi épingler puis rouvrir l'arbre
    // "oublierait" l'épingle qu'on vient de poser.
    const second = freshModule({ initialTables: [TABLE_NAME], emailFails: true });
    second.docApi.rows[TABLE_NAME] = docApi.rows[TABLE_NAME];
    const reloaded = await second.run('TemplatePreferences.loadForCurrentUser()');
    check('repli anonyme : relu dans une session anonyme suivante (round-trip)', reloaded[1] && reloaded[1].epingle === true, reloaded);
  }

  // 6. Chemins de dossier normalisés à l'écriture (espaces/segments vides), et dossier vidé -> null (pas
  // une chaîne vide qui polluerait TemplateOrganizer.splitPath).
  {
    const { run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('TemplatePreferences.setFolder(1, "  Factures / / 2024 ")');
    check('normalisation à l’écriture', await run('TemplatePreferences.getFolder(1)') === 'Factures/2024');
    await run('TemplatePreferences.setFolder(1, "")');
    check('dossier vidé -> null (pas une chaîne vide)', await run('TemplatePreferences.getFolder(1)') === null);
  }

  // 7. Dossier replié par défaut (29/09) : une ligne d'état par (utilisateur × dossier), ModeleId 0, qui ne fuit ni dans le cache des modèles, ni
  // dans les dossiers proposés, mise à jour SUR PLACE, isolée par utilisateur.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    docApi.seedRows(TABLE_NAME, [
      { Utilisateur: 'b@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Factures', Replie: true },
    ]);
    await run('TemplatePreferences.loadForCurrentUser()');
    check('état de dossier : la ligne d’une AUTRE personne est ignorée', await run('TemplatePreferences.isFolderCollapsed("Factures")') === false);
    await run('TemplatePreferences.setFolderCollapsed("Factures", true)');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Utilisateur === 'a@exemple.fr');
    check('état de dossier : une ligne écrite (ModeleId 0, Dossier, Replie vrai)', rows.length === 1 && rows[0].Dossier === 'Factures' && rows[0].Replie === true, rows);
    check('état de dossier : jamais dans getCached()', (await run('Object.keys(TemplatePreferences.getCached())')).length === 0);
    check('état de dossier : jamais dans les dossiers proposés', (await run('TemplatePreferences.listFolders()')).length === 0);
    await run('TemplatePreferences.setFolderCollapsed("Factures", false)');
    const after = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Utilisateur === 'a@exemple.fr');
    check('état de dossier : repasser à « déplié » met la MÊME ligne à jour (pas de doublon)', after.length === 1 && after[0].Replie === false, after);
    await run('TemplatePreferences.setFolderCollapsed("  Factures / / 2024 ", true)');
    check('état de dossier : le chemin est normalisé comme celui des modèles', await run('TemplatePreferences.isFolderCollapsed("Factures/2024")') === true);
    check('état de dossier : un dossier vide ("") n’écrit rien', (await run('TemplatePreferences.setFolderCollapsed("", true)')) === null);
    // relu par une nouvelle session
    const second = freshModule({ initialTables: [TABLE_NAME] });
    second.docApi.rows[TABLE_NAME] = docApi.rows[TABLE_NAME];
    await second.run('TemplatePreferences.loadForCurrentUser()');
    check('état de dossier : relu après rechargement', await second.run('TemplatePreferences.isFolderCollapsed("Factures/2024")') === true
      && await second.run('TemplatePreferences.isFolderCollapsed("Factures")') === false);
    check('état de dossier : relu, jamais dans getCached() ni dans les dossiers proposés (les lignes d’état ne sont pas des modèles)',
      (await second.run('Object.keys(TemplatePreferences.getCached())')).length === 0 && (await second.run('TemplatePreferences.listFolders()')).length === 0);
  }

  // 8. Colonne Replie absente (document créé avant la fonction) : ajoutée UNE fois, avant toute écriture, même pour deux dossiers réglés en
  // même temps avec une vraie latence (sinon deux AddVisibleColumn simultanés donnent Replie et Replie2).
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { withReplie: false, latencyMs: 8 } });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('Promise.all([TemplatePreferences.setFolderCollapsed("A", true), TemplatePreferences.setFolderCollapsed("B", true)])');
    check('colonne absente : ajoutée une seule fois, sans « Replie2 »', docApi.addedColumns.length === 1 && docApi.addedColumns[0] === 'Replie', docApi.addedColumns);
    const firstColumn = docApi.journal.indexOf('AddVisibleColumn'), firstRecord = docApi.journal.indexOf('AddRecord');
    check('colonne absente : ajoutée AVANT la première écriture de ligne', firstColumn !== -1 && firstRecord !== -1 && firstColumn < firstRecord, docApi.journal);
    check('colonne absente : les deux dossiers sont bien enregistrés', docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Replie === true).length === 2);
  }

  // 9. Clics rapides : une seule ligne, dernier état gagnant ; un refus de Grist rend l'état confirmé sans bloquer les écritures suivantes.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { latencyMs: 8 } });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('Promise.all([TemplatePreferences.setFolderCollapsed("R", true), TemplatePreferences.setFolderCollapsed("R", false), TemplatePreferences.setFolderCollapsed("R", true)])');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Dossier === 'R');
    check('rafale : une seule ligne pour le dossier, dernier état gagnant', rows.length === 1 && rows[0].Replie === true && await run('TemplatePreferences.isFolderCollapsed("R")') === true, rows);

    docApi.failNext = true;
    let refused = null;
    try { await run('TemplatePreferences.setFolderCollapsed("S", true)'); } catch (e) { refused = e; }
    check('refus de Grist : l’erreur remonte à l’appelant', !!refused);
    check('refus de Grist : l’état affiché revient à l’état confirmé', await run('TemplatePreferences.isFolderCollapsed("S")') === false);
    await run('TemplatePreferences.setFolderCollapsed("S", true)');
    check('refus de Grist : la file n’est pas bloquée, l’écriture suivante réussit', docApi.rows[TABLE_NAME].some((r) => r.Dossier === 'S' && r.Replie === true));
  }

  // 10. Table lue avec des rangées mais sans ses colonnes (règle d'accès qui les cache, lecture partielle : la forme que l'audit externe du 04/10 a rencontrée pour les autres
  // tables du widget) : aucune préférence, et aucune erreur écrite dans la console - avant, une TypeError (le cache restait vide, avec une erreur). Dossier et Epingle absents seuls
  // se lisent vides, la ligne reste lue.
  {
    const errors = [];
    const spyConsole = { log() {}, warn() {}, error: (...a) => errors.push(a.join(' ')) };
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], console: spyConsole });
    docApi.fetchTable = async () => ({ id: [1, 2, 3] });
    const cache = await run('TemplatePreferences.loadForCurrentUser()');
    check('lecture sans colonnes : aucune erreur dans la console (avant : TypeError)', errors.length === 0, errors);
    check('lecture sans colonnes : aucune préférence, le cache est vide', cache && Object.keys(cache).length === 0, cache);
    check('lecture sans colonnes : les dossiers proposés sont vides', (await run('TemplatePreferences.listFolders()')).length === 0);

    const partial = freshModule({ initialTables: [TABLE_NAME], console: spyConsole });
    partial.docApi.fetchTable = async () => ({ id: [7], Utilisateur: ['a@exemple.fr'], ModeleId: [3] });
    const kept = await partial.run('TemplatePreferences.loadForCurrentUser()');
    check('lecture sans Dossier ni Epingle : la ligne de la personne est lue, non épinglée, sans dossier', errors.length === 0 && kept[3] && kept[3].rowId === 7 && kept[3].epingle === false && kept[3].dossier === null, kept);
  }

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
