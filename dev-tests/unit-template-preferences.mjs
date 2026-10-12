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

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
