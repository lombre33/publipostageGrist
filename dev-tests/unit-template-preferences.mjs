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
function freshModule({ initialTables = [], email = 'a@exemple.fr', emailFails = false } = {}) {
  const docApi = new FakeDocApi(initialTables);
  const ctx = createContext({
    grist: { docApi },
    GristAPI: {
      async getCurrentUserEmail() {
        if (emailFails) throw new Error('identification indisponible (test)');
        return email;
      },
    },
  });
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

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
