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
function freshModule({ initialTables = [], email = 'a@exemple.fr', emailFails = false, emailDeclinesFirst = false, emailCalls, docOptions, console } = {}) {
  const docApi = new FakeDocApi(initialTables, docOptions);
  const ctx = createContext(Object.assign({ grist: { docApi } }, console ? { console } : {}));
  // Le vrai js/grist-api.js (création de la table, file d'écriture) ; seule l'identification est simulée.
  loadScript(ctx, 'js/schema-columns.js');
  loadScript(ctx, 'js/grist-api.js');
  let declined = emailDeclinesFirst;
  evalIn(ctx, 'GristAPI').getCurrentUserEmail = async () => {
    if (emailCalls) emailCalls.n++;
    if (emailFails) throw new Error('identification indisponible (test)');
    if (declined) {
      declined = false; // la première demande tombe sur la question « Créer les tables ? », la personne refuse ; la suivante, elle accepte
      throw Object.assign(new Error('Création des tables du widget refusée par la personne.'), { tablesDeclined: true });
    }
    return email;
  };
  loadScript(ctx, 'js/template-preferences.js');
  return { ctx, docApi, run: (expr) => evalIn(ctx, expr) };
}

// Une expression qui lève (une fonction que l'ancien code n'a pas : refresh) compte comme une vérification qui échoue, pas comme un arrêt du script.
async function attempt(run, expr) {
  try { return await run(expr); } catch (e) { return 'ERREUR : ' + (e && e.message); }
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

  // 2ter. L'adresse de la personne n'est demandée qu'une fois par module, avec ou sans identification : un échec (repli anonyme) n'est pas retenté.
  {
    const emailCalls = { n: 0 };
    const { run } = freshModule({ initialTables: [TABLE_NAME], emailCalls });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('TemplatePreferences.setPinned(1, true)');
    await run('TemplatePreferences.setFolder(1, "Factures")');
    await run('TemplatePreferences.setFolderCollapsed("Factures", true)');
    check('identification : l\'adresse n\'est demandée qu\'une fois pour toutes les lectures et écritures', emailCalls.n === 1, String(emailCalls.n));
  }
  {
    const emailCalls = { n: 0 };
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], emailFails: true, emailCalls });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('TemplatePreferences.setPinned(1, true)');
    await run('TemplatePreferences.setFolderCollapsed("Factures", true)');
    const row = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 1);
    check('identification impossible : une seule tentative, les écritures se font au nom de personne', emailCalls.n === 1 && !!row && row.Utilisateur === '', emailCalls.n + ' ' + JSON.stringify(row));
  }
  // 2quater. Le refus de créer la table d'identification n'est pas gardé comme une identification impossible : la personne qui accepte à l'action
  // suivante est reconnue, ses épingles ne vont pas au repli anonyme (partagé) ; une fois reconnue, plus aucune demande.
  {
    const emailCalls = { n: 0 };
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], emailDeclinesFirst: true, emailCalls });
    const cache = await run('TemplatePreferences.loadForCurrentUser()');
    const readWhileDeclined = { calls: emailCalls.n, kept: Object.keys(cache).length };
    await run('TemplatePreferences.setPinned(1, true)');
    await run('TemplatePreferences.setFolder(1, "Factures")');
    const row = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 1);
    check('refus de l\'identification : la lecture se fait au nom de personne (aucune préférence) après une seule demande', readWhileDeclined.kept === 0 && readWhileDeclined.calls === 1, JSON.stringify(readWhileDeclined));
    check('refus de l\'identification : l\'action suivante demande de nouveau l\'adresse, puis la garde (deux demandes en tout)', emailCalls.n === 2, String(emailCalls.n));
    check('refus de l\'identification : la ligne écrite ensuite est au nom de la personne, pas du repli anonyme', !!row && row.Utilisateur === 'a@exemple.fr' && row.Epingle === true && row.Dossier === 'Factures', JSON.stringify(row));
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

  // 7. Dossier replié par défaut (29/09) : une ligne d'état par (utilisateur × dossier), ModeleId 0, qui ne fuit pas dans le cache des modèles, mise à jour
  // SUR PLACE, isolée par utilisateur. Depuis la consigne 072 (17/11, décision du porteur : « un dossier existe tant qu'une ligne le nomme »), elle fait aussi
  // exister son dossier : listFolders() le donne, sans modèle dedans - avant, elle n'y figurait « jamais ».
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
    check('état de dossier : son dossier existe (consigne 072) : il figure dans les dossiers proposés, sans modèle', JSON.stringify(await run('TemplatePreferences.listFolders()')) === JSON.stringify(['Factures']));
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
    check('état de dossier : relu, jamais dans getCached() (les lignes d’état ne sont pas des modèles), mais ses dossiers existent (consigne 072)',
      (await second.run('Object.keys(TemplatePreferences.getCached())')).length === 0
      && JSON.stringify(await second.run('TemplatePreferences.listFolders()')) === JSON.stringify(['Factures', 'Factures/2024']));
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

  // 11. Réglages d'export (12/10, « par personne et modèle ») : type d'export, qualité du PDF et lignes exportées, trois colonnes Text de la ligne (personne × modèle),
  // vides tant que la personne n'a rien changé. Écrits, relus par une autre session, isolés par personne, sur la MÊME ligne que l'épingle (jamais deux lignes).
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    docApi.seedRows(TABLE_NAME, [
      { Utilisateur: 'b@exemple.fr', ModeleId: 7, Epingle: false, Dossier: '', TypeExport: 'xlsx', QualitePdf: 'light', LignesExport: 'workbook' },
    ]);
    await run('TemplatePreferences.loadForCurrentUser()');
    check('réglages d’export : ceux d’une AUTRE personne ne fuient pas', await run('TemplatePreferences.getExportChoices(7)') === null);
    await run('TemplatePreferences.setExportChoices(7, { type: "docx", quality: "", lines: "zip" })');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 7 && r.Utilisateur === 'a@exemple.fr');
    check('réglages d’export : une ligne à la personne, avec ses trois colonnes (vide = réglage d’origine)', rows.length === 1 && rows[0].TypeExport === 'docx' && rows[0].QualitePdf === '' && rows[0].LignesExport === 'zip' && rows[0].Epingle === false && rows[0].Dossier === '', rows);
    check('réglages d’export : relus tels quels', JSON.stringify(await run('TemplatePreferences.getExportChoices(7)')) === JSON.stringify({ type: 'docx', quality: '', lines: 'zip' }));
    check('réglages d’export : la ligne ne change ni les épingles ni les dossiers proposés', await run('TemplatePreferences.isPinned(7)') === false && (await run('TemplatePreferences.listFolders()')).length === 0);
    await run('TemplatePreferences.setPinned(7, true)');
    await run('TemplatePreferences.setExportChoices(7, { type: "xlsx" })');
    const same = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 7 && r.Utilisateur === 'a@exemple.fr');
    check('réglages d’export : l’épingle et les réglages partagent la ligne (pas de doublon), chacun garde sa valeur', same.length === 1 && same[0].Epingle === true && same[0].TypeExport === 'xlsx' && same[0].LignesExport === 'zip', same);
    // une autre session (autre ordinateur) relit les mêmes lignes
    const second = freshModule({ initialTables: [TABLE_NAME] });
    second.docApi.rows[TABLE_NAME] = docApi.rows[TABLE_NAME];
    await second.run('TemplatePreferences.loadForCurrentUser()');
    check('réglages d’export : relus par une nouvelle session', JSON.stringify(await second.run('TemplatePreferences.getExportChoices(7)')) === JSON.stringify({ type: 'xlsx', quality: '', lines: 'zip' }) && await second.run('TemplatePreferences.isPinned(7)') === true);
    // épingler d’abord, régler ensuite : la même ligne aussi
    const { docApi: d2, run: r2 } = freshModule({ initialTables: [TABLE_NAME] });
    await r2('TemplatePreferences.loadForCurrentUser()');
    await r2('TemplatePreferences.setPinned(4, true)');
    await r2('TemplatePreferences.setExportChoices(4, { quality: "light" })');
    const pinFirst = d2.rows[TABLE_NAME].filter((r) => r.ModeleId === 4);
    check('réglages d’export : épinglé d’abord, la ligne de l’épingle reçoit les réglages (une seule ligne)', pinFirst.length === 1 && pinFirst[0].Epingle === true && pinFirst[0].QualitePdf === 'light', pinFirst);
  }

  // 12. Le réglage d'origine n'écrit rien : ni ligne pour un modèle sans choix, ni écriture quand rien ne change ; revenir à l'origine efface la valeur (vide) sans supprimer la ligne.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('TemplatePreferences.setExportChoices(8, { type: "", quality: "", lines: "" })');
    check('origine : aucune ligne écrite pour un modèle dont rien n’a changé', docApi.rows[TABLE_NAME].length === 0 && await run('TemplatePreferences.getExportChoices(8)') === null);
    await run('TemplatePreferences.setExportChoices(8, { type: "docx" })');
    const writes = docApi.journal.length;
    await run('TemplatePreferences.setExportChoices(8, { type: "docx" })');
    check('origine : redire le même réglage n’écrit rien', docApi.journal.length === writes);
    await run('TemplatePreferences.setExportChoices(8, { type: "" })');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 8);
    check('origine : revenir à l’origine met la MÊME ligne à jour (vide), sans doublon', rows.length === 1 && rows[0].TypeExport === '', rows);
    check('origine : un modèle sans identifiant (nouveau, 0, texte) n’écrit rien', (await run('TemplatePreferences.setExportChoices(null, { type: "docx" })')) === null && (await run('TemplatePreferences.setExportChoices(0, { type: "docx" })')) === null && docApi.rows[TABLE_NAME].length === 1);
  }

  // 13. Seul ce qui change est écrit : une session qui a lu la table avant qu'un autre ordinateur règle le type ne le remet pas à l'origine en réglant autre chose.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'a@exemple.fr', ModeleId: 6, Epingle: false, Dossier: '', TypeExport: '', QualitePdf: '', LignesExport: '' }]);
    await run('TemplatePreferences.loadForCurrentUser()');
    docApi.rows[TABLE_NAME][0].TypeExport = 'xlsx'; // l'autre ordinateur vient d'écrire
    await run('TemplatePreferences.setExportChoices(6, { type: "", quality: "", lines: "zip" })');
    const row = docApi.rows[TABLE_NAME][0];
    check('diff : seule la colonne changée est écrite (le type réglé ailleurs reste)', row.LignesExport === 'zip' && row.TypeExport === 'xlsx', row);
  }

  // 14. Document créé avant la fonction (colonnes absentes) : lu sans erreur, les trois colonnes sont ajoutées UNE fois, en une action, AVANT la première écriture de ligne, même pour
  // deux modèles réglés en même temps avec une vraie latence ; une épingle ne les ajoute pas.
  {
    const errors = [];
    const spyConsole = { log() {}, warn() {}, error: (...a) => errors.push(a.join(' ')) };
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { withExportColumns: false, latencyMs: 8 }, console: spyConsole });
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'a@exemple.fr', ModeleId: 2, Epingle: true, Dossier: '' }]);
    await run('TemplatePreferences.loadForCurrentUser()');
    check('ancien document : lu sans erreur, les réglages se lisent vides', errors.length === 0 && JSON.stringify(await run('TemplatePreferences.getExportChoices(2)')) === JSON.stringify({ type: '', quality: '', lines: '' }), errors);
    await run('TemplatePreferences.setPinned(3, true)');
    check('ancien document : épingler n’ajoute aucune colonne', docApi.addedColumns.length === 0, docApi.addedColumns);
    await run('Promise.all([TemplatePreferences.setExportChoices(2, { type: "docx" }), TemplatePreferences.setExportChoices(3, { lines: "zip" })])');
    check('ancien document : chaque colonne ajoutée une seule fois, sans « 2 »', JSON.stringify(docApi.addedColumns) === JSON.stringify(['TypeExport', 'QualitePdf', 'LignesExport']), docApi.addedColumns);
    const firstColumn = docApi.journal.indexOf('AddVisibleColumn');
    const firstExportWrite = docApi.journal.lastIndexOf('AddVisibleColumn');
    check('ancien document : les trois colonnes sont ajoutées dans une même action, avant toute écriture des réglages', firstColumn !== -1 && firstExportWrite === firstColumn + 2 && docApi.journal.slice(firstColumn, firstColumn + 3).every((t) => t === 'AddVisibleColumn'), docApi.journal);
    const r2 = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 2), r3 = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 3);
    check('ancien document : les deux modèles sont bien réglés', r2.TypeExport === 'docx' && r3.LignesExport === 'zip' && r3.Epingle === true, [r2, r3]);
  }

  // 15. Rafale : plusieurs choix de suite sur un modèle = une seule ligne, le dernier réglage de chaque champ gagne.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { latencyMs: 8 } });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('Promise.all([TemplatePreferences.setExportChoices(9, { type: "docx" }), TemplatePreferences.setExportChoices(9, { type: "xlsx" }), TemplatePreferences.setExportChoices(9, { type: "docx", lines: "zip" })])');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 9);
    check('rafale : une seule ligne, le dernier réglage de chaque champ gagne', rows.length === 1 && rows[0].TypeExport === 'docx' && rows[0].LignesExport === 'zip', rows);
  }

  // 16. Table refusée : la personne a répondu « Ne pas créer » au démarrage. Un choix de menu n'écrit rien et ne repose AUCUNE question (la question appartient aux gestes qui écrivent
  // dans le document : Enregistrer...) ; le réglage reste à l'écran, côté js/export-choices.js.
  {
    const { docApi, run } = freshModule({ initialTables: [] });
    await run('globalThis.asked = 0; globalThis.gestures = 0; GristAPI.setTableConsent({ ask: async () => { asked++; return false; }, gesture: () => gestures })');
    await run('TemplatePreferences.loadForCurrentUser()');
    const askedAtLoad = await run('asked');
    await run('gestures = 3'); // la personne a fait un geste depuis son refus : un geste qui écrit dans le document reposerait la question
    const result = await run('TemplatePreferences.setExportChoices(5, { type: "docx" })');
    check('table refusée : le réglage n’écrit rien, ni table ni ligne', result === null && !docApi.tables.has(TABLE_NAME) && docApi.addTableCalls === 0 && docApi.journal.length === 0, docApi.journal);
    check('table refusée : aucune question reposée pour un choix de menu', askedAtLoad === 1 && await run('asked') === 1, [askedAtLoad, await run('asked')]);
    check('table refusée : rien à relire', await run('TemplatePreferences.getExportChoices(5)') === null);
  }

  // 17. Écriture refusée par Grist : l'erreur remonte, et l'écriture suivante reprend ce qui n'avait pas passé (le type voulu avant l'échec n'est pas perdu).
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    docApi.failNext = true;
    let refused = null;
    try { await run('TemplatePreferences.setExportChoices(5, { type: "docx" })'); } catch (e) { refused = e; }
    check('écriture refusée : l’erreur remonte à l’appelant', !!refused);
    check('écriture refusée : rien n’est dit gardé', await run('TemplatePreferences.getExportChoices(5)') === null);
    await run('TemplatePreferences.setExportChoices(5, { lines: "zip" })');
    const row = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 5);
    check('écriture refusée : la suivante reprend le type voulu avant l’échec, avec le nouveau réglage', !!row && row.TypeExport === 'docx' && row.LignesExport === 'zip', row);
  }

  // 18. Identification impossible (repli anonyme) : comme les épingles, les réglages vont à la personne « vide » et se relisent dans la session anonyme suivante.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], emailFails: true });
    await run('TemplatePreferences.loadForCurrentUser()');
    await run('TemplatePreferences.setExportChoices(1, { type: "xlsx" })');
    const row = docApi.rows[TABLE_NAME].find((r) => r.ModeleId === 1);
    check('repli anonyme : le réglage est écrit avec Utilisateur vide', !!row && row.Utilisateur === '' && row.TypeExport === 'xlsx', row);
    const second = freshModule({ initialTables: [TABLE_NAME], emailFails: true });
    second.docApi.rows[TABLE_NAME] = docApi.rows[TABLE_NAME];
    await second.run('TemplatePreferences.loadForCurrentUser()');
    check('repli anonyme : relu dans la session anonyme suivante', JSON.stringify(await second.run('TemplatePreferences.getExportChoices(1)')) === JSON.stringify({ type: 'xlsx', quality: '', lines: '' }));
  }

  // 19. Un choix fait avant la fin de la lecture du démarrage l'attend (c'est elle qui dit si la table est là et quelles lignes existent) : pas de doublon de ligne.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { latencyMs: 8 } });
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'a@exemple.fr', ModeleId: 3, Epingle: true, Dossier: '', TypeExport: '', QualitePdf: '', LignesExport: '' }]);
    await run('Promise.all([TemplatePreferences.loadForCurrentUser(), TemplatePreferences.setExportChoices(3, { type: "docx" })])');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 3);
    check('lecture en cours : le choix attend la lecture, la ligne existante est mise à jour (pas de doublon)', rows.length === 1 && rows[0].TypeExport === 'docx' && rows[0].Epingle === true, rows);
  }

  // 20. Consigne 072 (17/11, GFS range aussi dans cette table), point a : une ligne qu'une AUTRE connexion écrit pendant que le widget est ouvert n'est pas dans le cache
  // chargé au démarrage. refresh() la relit (à chaque ouverture de la liste et de « Organiser ») ; une écriture qui ne connaît pas la ligne la cherche dans la table avant
  // d'en ajouter une (sinon elle doublerait celle de GFS : GFS les met à jour toutes et lit la première, ce widget lit la dernière). Sur l'ancien code : pas de refresh,
  // et deux lignes pour le même modèle.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    docApi.seedRows(TABLE_NAME, [
      { Utilisateur: 'a@exemple.fr', ModeleId: 4, Epingle: true, Dossier: 'DepuisGFS' },
      { Utilisateur: 'b@exemple.fr', ModeleId: 9, Epingle: true, Dossier: 'Autre personne' },
    ]);
    check('relecture : avant, la ligne écrite par GFS n’est pas connue (cache du démarrage)', await run('TemplatePreferences.getFolder(4)') === null && await run('TemplatePreferences.isPinned(4)') === false);
    check('relecture : refresh() rend vrai quand le rangement a changé', await attempt(run, 'TemplatePreferences.refresh()') === true);
    check('relecture : la ligne de GFS est lue (dossier et épingle)', await run('TemplatePreferences.getFolder(4)') === 'DepuisGFS' && await run('TemplatePreferences.isPinned(4)') === true);
    check('relecture : la ligne d’une autre personne reste ignorée', await run('TemplatePreferences.getFolder(9)') === null);
    check('relecture : rien de neuf, refresh() rend faux', await attempt(run, 'TemplatePreferences.refresh()') === false);
  }
  {
    // Le même modèle écrit par GFS puis épinglé ici SANS relecture avant : une seule ligne, mise à jour (avant : une seconde ligne).
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'a@exemple.fr', ModeleId: 5, Epingle: false, Dossier: 'Rangé par GFS' }]);
    await run('TemplatePreferences.setPinned(5, true)');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 5);
    check('doublon : épingler un modèle que GFS vient de ranger met sa ligne à jour, sans en ajouter une seconde', rows.length === 1 && rows[0].Epingle === true && rows[0].Dossier === 'Rangé par GFS', rows);
    check('doublon : le cache garde le dossier de GFS et l’épingle', await run('TemplatePreferences.getFolder(5)') === 'Rangé par GFS' && await run('TemplatePreferences.isPinned(5)') === true);
  }
  {
    // Un réglage d'export sur un modèle que GFS vient de ranger : même garde (la ligne est cherchée avant d'en ajouter une).
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    await run('TemplatePreferences.loadForCurrentUser()');
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'a@exemple.fr', ModeleId: 7, Epingle: false, Dossier: 'Rangé par GFS', TypeExport: '', QualitePdf: '', LignesExport: '' }]);
    await run('TemplatePreferences.setExportChoices(7, { type: "docx" })');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 7);
    check('doublon : un réglage d’export sur un modèle que GFS vient de ranger met sa ligne à jour', rows.length === 1 && rows[0].TypeExport === 'docx' && rows[0].Dossier === 'Rangé par GFS', rows);
  }
  {
    // Deux lignes déjà là pour le même modèle (GFS lit la première, ce widget la dernière) : un rangement les met TOUTES à jour, les deux lectures disent la même chose.
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    docApi.seedRows(TABLE_NAME, [
      { Utilisateur: 'a@exemple.fr', ModeleId: 6, Epingle: false, Dossier: 'X' },
      { Utilisateur: 'a@exemple.fr', ModeleId: 6, Epingle: false, Dossier: 'Y' },
    ]);
    await run('TemplatePreferences.loadForCurrentUser()');
    check('deux lignes : la dernière fait foi à la lecture', await run('TemplatePreferences.getFolder(6)') === 'Y');
    await run('TemplatePreferences.setFolder(6, "Z")');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 6);
    check('deux lignes : un rangement met les deux à jour (GFS lit la première, ce widget la dernière)', rows.length === 2 && rows.every((r) => r.Dossier === 'Z'), rows);
  }
  {
    // La relecture n'écrase pas un geste dont l'écriture n'est pas finie : l'interrupteur d'un dossier posé juste avant reste à l'écran, et la table n'a qu'une ligne.
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { latencyMs: 8 } });
    await run('TemplatePreferences.loadForCurrentUser()');
    await attempt(run, 'Promise.all([TemplatePreferences.setFolderCollapsed("P", true), TemplatePreferences.refresh()])');
    const rows = docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Dossier === 'P');
    check('relecture pendant un geste : l’état du dossier voulu reste, une seule ligne écrite', await run('TemplatePreferences.isFolderCollapsed("P")') === true && rows.length === 1 && rows[0].Replie === true, rows);
    // Plusieurs appels simultanés ne font qu'une lecture.
    let reads = 0;
    const realFetch = docApi.fetchTable.bind(docApi);
    docApi.fetchTable = async (t) => { reads++; return realFetch(t); };
    await attempt(run, 'Promise.all([TemplatePreferences.refresh(), TemplatePreferences.refresh(), TemplatePreferences.refresh()])');
    check('relecture : trois appels à la fois, une seule lecture de la table', reads === 1, reads);
  }
  {
    // Une lecture qui échoue ne lève pas et ne vide rien ; une table refusée par la personne n'est jamais lue.
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME] });
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'a@exemple.fr', ModeleId: 3, Epingle: true, Dossier: 'Garde' }]);
    await run('TemplatePreferences.loadForCurrentUser()');
    docApi.fetchTable = async () => { throw new Error('lecture refusée (test)'); };
    const errors = [];
    run('globalThis.console = { log() {}, warn() {}, error: (...a) => globalThis.__errors.push(a.join(" ")) }; globalThis.__errors = []');
    const changed = await attempt(run, 'TemplatePreferences.refresh()');
    check('relecture en échec : rend faux, sans lever, et garde ce que l’écran montre', changed === false && await run('TemplatePreferences.getFolder(3)') === 'Garde');
    check('relecture en échec : l’erreur est journalisée', (await run('globalThis.__errors')).length === 1);
    void errors;
    const declined = freshModule({ initialTables: [] });
    await declined.run('GristAPI.setTableConsent({ ask: async () => false, gesture: () => 0 })');
    await declined.run('TemplatePreferences.loadForCurrentUser()');
    check('table refusée : refresh() ne lit ni n’écrit rien et rend faux', await attempt(declined.run, 'TemplatePreferences.refresh()') === false && declined.docApi.journal.length === 0);
  }

  // 21. Consigne 072, point b : un dossier qui n'a que sa ligne d'état (ModeleId 0, celle que GFS écrit pour « Nouveau dossier ») existe : listFolders() le donne, replié ou
  // non d'après Replie, sans qu'il entre dans getCached() (ce n'est pas un modèle). Une ligne d'état d'une autre personne n'en fait pas un dossier ; un état pas encore écrit non plus.
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { latencyMs: 8 } });
    docApi.seedRows(TABLE_NAME, [
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Vide déplié', Replie: false },
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Vide replié', Replie: true },
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: ' Parent / Enfant ' },
      { Utilisateur: 'a@exemple.fr', ModeleId: 2, Epingle: false, Dossier: 'Plein' },
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Plein', Replie: false },
      { Utilisateur: 'b@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Chez un autre', Replie: false },
    ]);
    await run('TemplatePreferences.loadForCurrentUser()');
    check('dossier sans modèle : sa ligne d’état le fait exister (listFolders), une fois, avec le chemin normalisé',
      JSON.stringify(await run('TemplatePreferences.listFolders()')) === JSON.stringify(['Parent/Enfant', 'Plein', 'Vide déplié', 'Vide replié']), await run('TemplatePreferences.listFolders()'));
    check('dossier sans modèle : la ligne d’état d’une autre personne n’en fait pas un dossier', !(await run('TemplatePreferences.listFolders()')).includes('Chez un autre'));
    check('dossier sans modèle : replié ou non d’après Replie', await run('TemplatePreferences.isFolderCollapsed("Vide replié")') === true && await run('TemplatePreferences.isFolderCollapsed("Vide déplié")') === false);
    check('dossier sans modèle : jamais dans getCached() (ce n’est pas un modèle)', JSON.stringify(Object.keys(await run('TemplatePreferences.getCached()'))) === JSON.stringify(['2']));
    // Un geste dont la ligne n'est pas encore écrite ne fait pas encore exister le dossier : aucune ligne ne le nomme.
    const pending = run('TemplatePreferences.setFolderCollapsed("Pas encore écrit", true)');
    check('dossier sans modèle : un état pas encore écrit ne le fait pas exister', !(await run('TemplatePreferences.listFolders()')).includes('Pas encore écrit'));
    await pending;
    check('dossier sans modèle : écrit, il existe', (await run('TemplatePreferences.listFolders()')).includes('Pas encore écrit'));
  }

  // 22. Défaire le geste qui a posé la ligne d'état d'un dossier doit la retirer (sinon Ctrl + Z laisserait un dossier vide là où il n'y en avait pas, consigne 072 point b) :
  // hasFolderState dit si une ligne d'état nomme le dossier (pour la personne), clearFolderState la retire (toutes ses lignes : GFS lit la première, ce widget la dernière).
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { latencyMs: 4 } });
    docApi.seedRows(TABLE_NAME, [
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Venu de GFS', Replie: true },
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Deux lignes', Replie: false },
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Deux lignes', Replie: true },
      { Utilisateur: 'a@exemple.fr', ModeleId: 2, Epingle: false, Dossier: 'Avec modèle' },
      { Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Avec modèle', Replie: false },
      { Utilisateur: 'a@exemple.fr', ModeleId: 3, Epingle: false, Dossier: 'Sans ligne d’état' },
      { Utilisateur: 'b@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Venu de GFS', Replie: false },
    ]);
    await run('TemplatePreferences.loadForCurrentUser()');
    const stateRows = (folder, who = 'a@exemple.fr') => docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Dossier === folder && r.Utilisateur === who);
    check('ligne d’état : un dossier venu de GFS en a une', await attempt(run, 'TemplatePreferences.hasFolderState("Venu de GFS")') === true);
    check('ligne d’état : un dossier qui n’est nommé que par un modèle n’en a pas', await attempt(run, 'TemplatePreferences.hasFolderState("Sans ligne d’état")') === false);
    check('ligne d’état : un dossier inconnu ou vide n’en a pas', await attempt(run, 'TemplatePreferences.hasFolderState("Inconnu")') === false && await attempt(run, 'TemplatePreferences.hasFolderState("")') === false);

    const before = docApi.journal.length;
    check('retirer : un dossier sans ligne d’état n’écrit rien et rend faux', await attempt(run, 'TemplatePreferences.clearFolderState("Sans ligne d’état")') === false && docApi.journal.length === before);
    check('retirer : la ligne d’état est retirée, le dossier n’existe plus', await attempt(run, 'TemplatePreferences.clearFolderState("Venu de GFS")') === true && stateRows('Venu de GFS').length === 0
      && !(await run('TemplatePreferences.listFolders()')).includes('Venu de GFS') && await attempt(run, 'TemplatePreferences.hasFolderState("Venu de GFS")') === false && await run('TemplatePreferences.isFolderCollapsed("Venu de GFS")') === false);
    check('retirer : la ligne d’une autre personne reste', stateRows('Venu de GFS', 'b@exemple.fr').length === 1);
    check('retirer : les deux lignes d’un même dossier partent ensemble', await attempt(run, 'TemplatePreferences.clearFolderState("Deux lignes")') === true && stateRows('Deux lignes').length === 0 && !(await run('TemplatePreferences.listFolders()')).includes('Deux lignes'));
    check('retirer : un dossier qui porte un modèle reste (seule sa ligne d’état part)', await attempt(run, 'TemplatePreferences.clearFolderState("Avec modèle")') === true && stateRows('Avec modèle').length === 0
      && (await run('TemplatePreferences.listFolders()')).includes('Avec modèle') && await run('TemplatePreferences.getFolder(2)') === 'Avec modèle' && docApi.rows[TABLE_NAME].some((r) => r.ModeleId === 2));
    check('retirer : le dossier d’un modèle n’est plus listé comme dossier vide', !String(await attempt(run, 'TemplatePreferences.listStateFolders()')).includes('Avec modèle') && Array.isArray(await attempt(run, 'TemplatePreferences.listStateFolders()')));

    // Le geste posé puis défait : la ligne écrite par ce widget part aussi, et un geste suivant en écrit une neuve (sans viser la ligne retirée).
    await run('TemplatePreferences.setFolderCollapsed("Posé ici", true)');
    check('geste posé : la ligne existe et le dossier aussi', await attempt(run, 'TemplatePreferences.hasFolderState("Posé ici")') === true && stateRows('Posé ici').length === 1 && (await run('TemplatePreferences.listFolders()')).includes('Posé ici'));
    check('geste défait : la ligne retirée, le dossier disparu', await attempt(run, 'TemplatePreferences.clearFolderState("Posé ici")') === true && stateRows('Posé ici').length === 0 && !(await run('TemplatePreferences.listFolders()')).includes('Posé ici') && await run('TemplatePreferences.isFolderCollapsed("Posé ici")') === false);
    await run('TemplatePreferences.setFolderCollapsed("Posé ici", true)');
    check('geste rétabli : une ligne neuve est écrite, une seule', stateRows('Posé ici').length === 1 && stateRows('Posé ici')[0].Replie === true && await run('TemplatePreferences.isFolderCollapsed("Posé ici")') === true);

    // Deux clics de suite sur l'interrupteur d'un dossier neuf, le second avant la fin de l'écriture du premier : la ligne va exister (hasFolderState le dit, pour que défaire le
    // second geste rende « replié » et non « aucune ligne »), sans faire encore exister le dossier (listStateFolders attend la ligne écrite).
    const first = run('TemplatePreferences.setFolderCollapsed("Deux clics", true)');
    check('geste en file : un dossier replié dont l’écriture n’est pas finie compte déjà comme nommé par une ligne d’état', await attempt(run, 'TemplatePreferences.hasFolderState("Deux clics")') === true);
    check('geste en file : il ne fait pas encore exister le dossier vide', !String(await attempt(run, 'TemplatePreferences.listStateFolders()')).includes('Deux clics'));
    await first;
    await attempt(run, 'TemplatePreferences.clearFolderState("Deux clics")');
    check('geste en file : retiré, plus rien ne le nomme', await attempt(run, 'TemplatePreferences.hasFolderState("Deux clics")') === false && stateRows('Deux clics').length === 0);

    // Un geste encore en file, puis son retrait : le retrait passe après l'écriture (même file), sans ligne orpheline.
    const queued = run('TemplatePreferences.setFolderCollapsed("En file", true)');
    const cleared = attempt(run, 'TemplatePreferences.clearFolderState("En file")');
    await queued;
    check('retirer pendant l’écriture : le retrait attend le geste, aucune ligne ne reste', await cleared === true && stateRows('En file').length === 0 && !(await run('TemplatePreferences.listFolders()')).includes('En file'));
  }

  // 23. Créer un dossier vide (« Nouveau dossier » de « Organiser mes modèles », consigne 072 de GFS) : la même ligne d'état que GFS écrit pour le sien (ModeleId 0, Dossier = le chemin, Epingle faux,
  // pas de Replie), lue avant d'être écrite (GFS a pu la poser entre-temps), une seule par dossier, retirée par clearFolderState (« Supprimer »).
  {
    const { docApi, run } = freshModule({ initialTables: [TABLE_NAME], docOptions: { latencyMs: 4 } });
    await run('TemplatePreferences.loadForCurrentUser()');
    const stateRows = (folder, who = 'a@exemple.fr') => docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Dossier === folder && r.Utilisateur === who);
    const created = await attempt(run, 'TemplatePreferences.createFolderState("Neuf")');
    check('créer : une ligne est écrite et la réponse le dit', created === true && stateRows('Neuf').length === 1, JSON.stringify(created));
    const row = stateRows('Neuf')[0] || {};
    check('créer : la ligne est celle de GFS (personne, ModeleId 0, Epingle faux, le chemin) et ne porte pas Replie', row.Utilisateur === 'a@exemple.fr' && row.ModeleId === 0 && row.Epingle === false && row.Dossier === 'Neuf' && !('Replie' in row), JSON.stringify(row));
    check('créer : le dossier existe, vide et déplié', (await attempt(run, 'TemplatePreferences.listStateFolders()')).includes?.('Neuf') && (await run('TemplatePreferences.listFolders()')).includes('Neuf')
      && await attempt(run, 'TemplatePreferences.hasFolderState("Neuf")') === true && await run('TemplatePreferences.isFolderCollapsed("Neuf")') === false);
    const before = docApi.journal.length;
    check('créer deux fois : la seconde n’écrit rien et rend faux', await attempt(run, 'TemplatePreferences.createFolderState("Neuf")') === false && stateRows('Neuf').length === 1
      && docApi.journal.slice(before).every((type) => type !== 'AddRecord'));

    // GFS pose la ligne pendant que le widget est ouvert : créer le même dossier relit la table et n'en ajoute pas une seconde.
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'a@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Posé par GFS' }]);
    check('créer un dossier que GFS vient d’écrire : rien n’est ajouté, le dossier est connu', await attempt(run, 'TemplatePreferences.createFolderState("Posé par GFS")') === false && stateRows('Posé par GFS').length === 1
      && (await run('TemplatePreferences.listStateFolders()')).includes('Posé par GFS'));
    // La ligne d'une autre personne ne dit rien de ce dossier pour celle-ci.
    docApi.seedRows(TABLE_NAME, [{ Utilisateur: 'b@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Chez l’autre' }]);
    check('créer un dossier que seule une autre personne a : sa ligne à elle est écrite', await attempt(run, 'TemplatePreferences.createFolderState("Chez l’autre")') === true && stateRows('Chez l’autre').length === 1 && stateRows('Chez l’autre', 'b@exemple.fr').length === 1);
    check('créer : un chemin se normalise, un chemin vide n’écrit rien', await attempt(run, 'TemplatePreferences.createFolderState("  Factures / / Clients ")') === true && stateRows('Factures/Clients').length === 1
      && await attempt(run, 'TemplatePreferences.createFolderState("  / ")') === false && await attempt(run, 'TemplatePreferences.createFolderState("")') === false && docApi.rows[TABLE_NAME].every((r) => r.Dossier !== ''));

    // Supprimer : la ligne part, le dossier avec elle ; recréer en pose une neuve.
    check('supprimer un dossier créé : la ligne est retirée, le dossier n’existe plus', await attempt(run, 'TemplatePreferences.clearFolderState("Neuf")') === true && stateRows('Neuf').length === 0
      && !(await run('TemplatePreferences.listFolders()')).includes('Neuf') && await attempt(run, 'TemplatePreferences.hasFolderState("Neuf")') === false);
    check('recréer après suppression : une ligne neuve, une seule', await attempt(run, 'TemplatePreferences.createFolderState("Neuf")') === true && stateRows('Neuf').length === 1);

    // « Replié par défaut » : la colonne Replie est ajoutée quand elle manque, avant la ligne, et la ligne la porte.
    const old = freshModule({ initialTables: [TABLE_NAME], docOptions: { withReplie: false } });
    await old.run('TemplatePreferences.loadForCurrentUser()');
    const oldRows = (folder) => old.docApi.rows[TABLE_NAME].filter((r) => r.ModeleId === 0 && r.Dossier === folder);
    check('créer sans Replie dans le document : aucune colonne ajoutée (la ligne n’en a pas besoin)', await attempt(old.run, 'TemplatePreferences.createFolderState("Sans colonne")') === true && oldRows('Sans colonne').length === 1 && old.docApi.addedColumns.length === 0);
    check('créer replié dans un document sans Replie : la colonne est ajoutée UNE fois, la ligne la porte', await attempt(old.run, 'TemplatePreferences.createFolderState("Replié d’emblée", true)') === true
      && old.docApi.addedColumns.join() === 'Replie' && oldRows('Replié d’emblée').length === 1 && oldRows('Replié d’emblée')[0].Replie === true && await old.run('TemplatePreferences.isFolderCollapsed("Replié d’emblée")') === true);

    // Une écriture refusée par Grist : rien n'est montré, et la suivante réussit.
    docApi.failNext = true;
    const quiet = await attempt(run, 'TemplatePreferences.createFolderState("Refusé").then(() => "écrit", (e) => "refusé : " + e.message)');
    check('écriture refusée : l’erreur remonte, aucun dossier n’apparaît', /refusé/.test(String(quiet)) && stateRows('Refusé').length === 0 && !(await run('TemplatePreferences.listFolders()')).includes('Refusé') && await attempt(run, 'TemplatePreferences.hasFolderState("Refusé")') === false, String(quiet));
    check('écriture refusée : la suivante réussit, une seule ligne', await attempt(run, 'TemplatePreferences.createFolderState("Refusé")') === true && stateRows('Refusé').length === 1);

    // Dans l'ordre de la file : créer puis supprimer aussitôt ne laisse aucune ligne ; créer puis replier aussitôt fait UNE ligne repliée.
    const made = attempt(run, 'TemplatePreferences.createFolderState("Aussitôt")');
    const gone = attempt(run, 'TemplatePreferences.clearFolderState("Aussitôt")');
    check('créer puis supprimer aussitôt : aucune ligne ne reste', await made === true && await gone === true && stateRows('Aussitôt').length === 0);
    const made2 = attempt(run, 'TemplatePreferences.createFolderState("Aussitôt 2")');
    const folded = run('TemplatePreferences.setFolderCollapsed("Aussitôt 2", true)').catch(() => null); // sur l'ancien code, l'écriture refusée armée plus haut tombe ici : le verdict suit
    await made2; await folded;
    check('créer puis replier aussitôt : UNE ligne, repliée', stateRows('Aussitôt 2').length === 1 && stateRows('Aussitôt 2')[0].Replie === true && await run('TemplatePreferences.isFolderCollapsed("Aussitôt 2")') === true);
  }

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
