#!/usr/bin/env node
// L'ENREGISTREMENT D'UN DOCUMENT DANS UNE TABLE LOURDE ne relit pas la table (consigne 103 de GFS, demande 2, lot 3 : « la vérification de conflit lit la ligne du modèle ouvert ; rien ne relit la table entière après
// l'ouverture »). Sur le document du groupe `templatesLightOpen` (deux gros textes de 700 Ko : un million de signes et plus, la table est lue par la liste légère), dans la vraie page, le faux Grist de la page et le faux
// serveur de lecture légère (dev-tests/light-server.mjs, un vrai moteur SQL) répondant à `http://grist.test/**` :
//  1. une lettre tapée dans le document par défaut, l'enregistrement automatique l'écrit : la vérification de conflit a lu la LIGNE du document par son numéro (une requête SQL `WHERE id IN (1)`), la date que Grist
//     garde s'est relue pour cette ligne seule, et la table des modèles n'a JAMAIS été lue en entier (le faux Grist compte ses `fetchTable`) ;
//  2. quelqu'un d'autre enregistre ce document : la lettre suivante n'écrase pas son texte, le bandeau « modifié ailleurs » s'affiche, toujours sans lire la table ;
//  3. un gros document (700 Ko) ouvert puis modifié : écrit, sans lecture de la table ; le conflit se vérifie sur sa ligne (numéro 3) ;
//  4. les gestes qui lisaient la table : l'historique des versions (les jetons de tous les modèles), le mot de passe des PDF protégés (lu, écrit), la ligne qu'on supprime (lue, puis rendue) : par SQL ou par numéro ;
//  5. TÉMOIN : l'interrupteur « off » (la lecture d'avant) lit la table à chaque enregistrement : les contrôles ci-dessus ne sont pas aveugles ;
// Lancé par run-headless.mjs (groupe Node « templatesLightSave », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-templates-light-save.mjs
import { start, seedModels } from './gfs-page.mjs';
import { createLightServer, tablesFromStubState } from './light-server.mjs';

const t = await start({ name: 'verify-templates-light-save', port: Number(process.env.TEMPLATES_LIGHT_SAVE_PORT || 9227) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BASE = 'http://grist.test/api/docs/DOC1';
const TABLE = 'Publipostage_Modeles';

// Deux gros documents de 700 Ko chacun (quarante paragraphes de 17 Ko), comme dans verify-templates-light-open.mjs.
const heavy = word => Array.from({ length: 40 }, (_, i) => '<p>' + word + ' paragraphe ' + i + ' ' + 'mot '.repeat(4400) + '</p>').join('');
const SEED = seedModels() + `
  m.Contenu[1] = ${JSON.stringify(heavy('RAPPORT-B'))};
  m.Contenu[2] = ${JSON.stringify(heavy('DOSSIER-C'))};
  stub.state.tokenBaseUrl = ${JSON.stringify(BASE)};
`;

async function open({ light = 'auto' } = {}) {
  const holder = {};
  const opened = await t.openPage({
    hosted: false, lang: 'fr', colorScheme: 'light', seed: SEED,
    init: `window.__templatesLight = ${JSON.stringify(light)};`,
    before: async (page) => {
      holder.server = createLightServer(async () => tablesFromStubState(await page.evaluate(() => ({ rows: window.__gristStub.state.rows, columns: window.__gristStub.state.columns }))));
      await page.route('http://grist.test/**', async (route) => {
        let answer;
        try { answer = await holder.server.handle(route.request().url()); } catch (e) { answer = { status: 500, body: JSON.stringify({ error: String(e && e.message || e) }) }; }
        await route.fulfill({ status: answer.status, contentType: answer.noCors ? 'text/html' : 'application/json', headers: answer.noCors ? {} : { 'Access-Control-Allow-Origin': '*' }, body: answer.body });
      });
    },
  });
  return Object.assign(opened, { server: holder.server });
}
const wholeReads = app => app.evaluate(table => window.__gristStub.state.callOrder.filter(call => call === 'fetchTable ' + table).length, TABLE);
const sqlOf = server => server.log.filter(entry => entry.kind === 'sql').map(entry => entry.sql);
const text = app => app.evaluate(() => { const editor = EditorCore.getEditor(); return editor ? editor.getText() : ''; });
const waitText = (app, word) => app.waitForFunction(w => { const editor = EditorCore.getEditor(); return !!editor && editor.getText().includes(w); }, word, { timeout: 40000 });
const pick = (app, id) => app.evaluate((value) => { const select = document.getElementById('template-select'); select.value = String(value); select.dispatchEvent(new Event('change', { bubbles: true })); }, id);
const stored = (app, id) => app.evaluate(([table, n]) => { const m = window.__gristStub.state.rows[table]; return m.Contenu[m.id.indexOf(n)] || ''; }, [TABLE, id]);
const waitFor = async (test, ms, each = 150) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await test()) return true; await sleep(each); }
  return test();
};
// L'éditeur prend le focus au bout du texte (une présentation de 700 Ko défile longtemps : un clic à la souris viserait un endroit que le défilement n'a pas fini d'atteindre), puis une lettre au clavier.
async function typeAtEnd(page, app, letter) {
  await app.evaluate(() => { EditorCore.getEditor().commands.focus('end'); });
  await sleep(150);
  await page.keyboard.type(letter);
}
const bannerShown = app => app.evaluate(() => { const b = document.getElementById('autosave-conflict-banner'); return !!b && b.style.display !== 'none'; });

// --- 1. et 2. Le document par défaut : l'enregistrement, puis un conflit ---
{
  const { page, app, server } = await open();
  await sleep(1500);
  check('(préparation) la table est lue par la liste légère et le document par défaut est ouvert', (await app.evaluate(() => Templates.getLightState())) === 'light' && (await text(app)).includes('Contenu A'), await app.evaluate(() => Templates.getLightState()));
  await typeAtEnd(page, app, 'Z');
  const written = await waitFor(async () => (await stored(app, 1)).includes('ZContenu A') || (await stored(app, 1)).includes('Contenu AZ'), 20000);
  await sleep(600);
  check('la lettre tapée est enregistrée par l\'enregistrement automatique', written, await stored(app, 1));
  const sql = sqlOf(server);
  check('la vérification de conflit a lu la ligne du document par son numéro, pas la table (WHERE id IN (1))', sql.some(line => / WHERE id IN \(1\) ORDER BY "?manualSort"?, id$| WHERE id IN \(1\) ORDER BY id$/.test(line) && /FROM "Publipostage_Modeles"/.test(line)), sql.map(line => line.slice(-80)));
  check('la date que Grist garde s\'est relue pour cette ligne seule (SQL des dates)', sql.some(line => /AS "ModifiedAt" FROM "Publipostage_Modeles" WHERE id IN \(1\) ORDER BY id$/.test(line)), sql.map(line => line.slice(-90)));
  check('la table des modèles n\'a JAMAIS été lue en entier, ni à l\'ouverture ni à l\'enregistrement', (await wholeReads(app)) === 0, await wholeReads(app));

  // 2. Quelqu'un d'autre enregistre ce document : la lettre suivante n'écrase rien
  await app.evaluate(table => window.__gristStub.remoteWrite(table, 1, { Contenu: '<p>Version d\'une autre personne</p>', DateModif: new Date(Date.now() + 60000).toISOString() }), TABLE);
  await typeAtEnd(page, app, 'Y');
  const shown = await waitFor(() => bannerShown(app), 20000);
  check('un enregistrement fait ailleurs est signalé par le bandeau « modifié ailleurs » (la ligne relue a une autre date)', shown, await bannerShown(app));
  check('...le texte de l\'autre personne n\'a pas été écrasé', (await stored(app, 1)) === '<p>Version d\'une autre personne</p>', await stored(app, 1));
  check('...et la table n\'a toujours pas été lue en entier', (await wholeReads(app)) === 0, await wholeReads(app));
  const unloaded = await app.evaluate(() => Templates.getUnloadedReads());
  check('aucun module n\'a lu un texte avant qu\'il soit chargé (Templates.getUnloadedReads vide)', unloaded.length === 0, unloaded);
  await app.context().close();
}

// --- 3. Un gros document ouvert puis modifié ---
{
  const { page, app, server } = await open();
  await sleep(1500);
  await pick(app, 3);
  await waitText(app, 'DOSSIER-C paragraphe 39');
  await sleep(500);
  await typeAtEnd(page, app, 'Q');
  const written = await waitFor(async () => (await stored(app, 3)).includes('Q</p>') || (await stored(app, 3)).includes('mot Q'), 30000);
  await sleep(600);
  check('un gros document (700 Ko) ouvert, modifié : l\'enregistrement automatique l\'écrit', written, (await stored(app, 3)).slice(-60));
  const sql = sqlOf(server);
  check('sa vérification de conflit lit sa ligne (numéro 3), pas la table', sql.some(line => / WHERE id IN \(3\) ORDER BY/.test(line)), sql.map(line => line.slice(-70)));
  check('...la date relue est celle de cette ligne seule', sql.some(line => /AS "ModifiedAt" FROM "Publipostage_Modeles" WHERE id IN \(3\) ORDER BY id$/.test(line)), sql.map(line => line.slice(-90)));
  check('...la table n\'a JAMAIS été lue en entier', (await wholeReads(app)) === 0, await wholeReads(app));

  // 4. Les gestes qui lisaient la table
  const reads0 = await wholeReads(app);
  const versions = await app.evaluate(async () => { try { const opened = await VersionsStore.open(3); return { token: typeof opened.token, entries: Array.isArray(opened.entries) }; } catch (e) { return { error: String(e && e.message || e) }; } });
  check('l\'historique des versions lit les jetons de tous les modèles par SQL (le numéro, le jeton quand la table en a), sans lire la table', !versions.error && sqlOf(server).some(line => /^SELECT id(, "[^"]+" AS "Token")? FROM "Publipostage_Modeles" ORDER BY id$/.test(line)) && (await wholeReads(app)) === reads0, JSON.stringify([versions, reads0, await wholeReads(app), sqlOf(server).map(line => line.slice(-70))]));
  const password = await app.evaluate(async () => {
    const before = await Templates.readPdfPassword();
    const wrote = await Templates.writePdfPassword('s3cret');
    const after = await Templates.readPdfPassword();
    return { before, wrote, after };
  });
  check('le mot de passe des PDF protégés se lit et s\'écrit par la ligne des réglages seule, sans lire la table', password.before.ok === true && password.before.password === '' && password.wrote === true && password.after.password === 's3cret' && (await wholeReads(app)) === reads0, JSON.stringify([password, reads0, await wholeReads(app)]));
  const row = await app.evaluate(async () => {
    const snapshot = await Templates.snapshotRow(3);
    return snapshot ? { id: snapshot.id, hasText: String(snapshot.values.Content || '').includes('DOSSIER-C paragraphe 39'), name: snapshot.values.Name } : null;
  });
  check('la ligne qu\'on s\'apprête à supprimer se lit par son numéro, avec tout son texte (c\'est ce qu\'Annuler rendra)', !!row && row.id === 3 && row.hasText === true && server.log.some(entry => entry.kind === 'records' && JSON.stringify(entry.ids) === '[3]') && (await wholeReads(app)) === reads0, JSON.stringify([row, reads0, await wholeReads(app)]));
  const unloaded = await app.evaluate(() => Templates.getUnloadedReads());
  check('aucun module n\'a lu un texte avant qu\'il soit chargé (Templates.getUnloadedReads vide)', unloaded.length === 0, unloaded);
  await app.context().close();
}

// --- 5. TÉMOIN : l'interrupteur « off » lit la table à chaque enregistrement ---
{
  const { page, app, server } = await open({ light: 'off' });
  await sleep(1500);
  const before = await wholeReads(app);
  await typeAtEnd(page, app, 'W');
  const written = await waitFor(async () => (await stored(app, 1)).includes('W'), 20000);
  await sleep(600);
  const after = await wholeReads(app);
  check('TÉMOIN : « off » (la lecture d\'avant) lit la table en entier à l\'enregistrement, et ne pose aucune requête SQL', written && after > before && server.log.filter(entry => entry.kind === 'sql').length === 0, JSON.stringify({ written, before, after, sql: server.log.length }));
  await app.context().close();
}

await t.finish();
