#!/usr/bin/env node
// Tests purs (sans navigateur) de LA LECTURE LÉGÈRE de la table des modèles (consigne 103 de GFS, demande 2 : « rien ne relit la table entière après l'ouverture ») : js/templates-light.js (le SQL de la liste, les
// colonnes, les paquets, la recherche d'impact) et js/templates.js (Templates.loadAll lit la liste par SQL, Templates.ensureLoaded lit un texte long par son numéro de ligne), contre un faux serveur qui répond comme Grist
// (dev-tests/light-server.mjs : un vrai moteur SQL). Ce que les cas vérifient :
//  1. le SQL : noms réels des colonnes (un document d'avant a les noms français), guillemets, colonnes absentes, ordre ;
//  2. une table lourde (lecture légère forcée) : la table n'est JAMAIS lue en entier ; les petits textes viennent avec la liste, les longs restent à lire (`chargee` faux, leur poids connu) ; un macro-modèle et les réglages
//     du document viennent toujours ; un texte long lu avant d'être chargé est noté (getUnloadedReads) ;
//  3. ensureLoaded : une lecture par numéros de ligne, partagée entre appels simultanés, rien de plus quand le texte est là ; un modèle dont la date a changé est relu, un modèle dont la date est la même garde son texte ;
//  4. les documents d'avant (noms français) passent par la même liste, sous les noms anglais ;
//  5. les replis : SQL refusé (403 : règles d'accès) -> lecture entière comme avant, sans réessayer avant dix minutes ; poids non calculable -> liste sans longueurs, tout se lit à la demande ; lecture par numéros refusée ->
//     lecture entière ; la table n'a pas la colonne d'une migration -> ajoutée, la liste relue ;
//  6. sans interrupteur (la production) : une table peu lourde se lit en entier comme avant (une sonde SQL, puis plus rien), une table lourde par la liste ;
//  7. la recherche d'impact (ensureCiting) ne lit que les modèles qui citent le mot (texte, en-tête et pied de page) ;
//  8. les liens entre modèles : un modèle qui en désigne un autre (declareReferences) se lit avec lui (ensureWithReferences, needsReading) ; onEntriesLoaded dit les numéros lus ; le seuil des essais (`__templatesLightSmall`)
//     met tout à lire à la demande ;
//  9. une ligne que ce widget écrit pendant qu'on la lit garde le texte écrit (la réponse est d'avant l'écriture), et la lecture finie la laisse chargée.
// Lancer : node dev-tests/unit-templates-light.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';
import { StartupDoc } from './startup-doc.mjs';
import { createLightServer, tablesFromStartupDoc, firewallRefuses } from './light-server.mjs';

const ENGLISH = { Name: 'Text', Content: 'Text', PdfFileName: 'Text', ModifiedAt: 'DateTime', HeaderFooter: 'Text', IsDefault: 'Bool', Margins: 'Text', TemplateType: 'Text', To: 'Text', Cc: 'Text', Bcc: 'Text', Subject: 'Text', Attachments: 'Text', TrackedChanges: 'Text', ModifiedBy: 'Text' };
const FRENCH = { Name: 'Nom', Content: 'Contenu', PdfFileName: 'NomFichierPDF', ModifiedAt: 'DateModif', HeaderFooter: 'HeaderFooter', IsDefault: 'EstParDefaut', Margins: 'Margins', TemplateType: 'TypeModele', To: 'Destinataires', Cc: 'Cc', Bcc: 'Cci', Subject: 'Objet', Attachments: 'PJ', TrackedChanges: 'SuiviModifications', ModifiedBy: 'ModifiePar' };
const BIG = '<p>' + 'x'.repeat(40 * 1024) + '</p>';

// Un document dont la table des modèles porte les noms anglais ou, `legacy`, ceux d'avant ; `without` : des colonnes qu'elle n'a pas ; `extra` : des lignes de plus.
function makeDoc({ legacy = false, without = [], big = BIG, extra = [] } = {}) {
  const doc = new StartupDoc();
  const name = column => (legacy ? FRENCH[column] : column);
  const table = legacy ? 'Publipostage_Modeles' : 'Publipostage_Templates';
  const types = {};
  Object.keys(ENGLISH).filter(column => !without.includes(column)).forEach((column) => { types[name(column)] = ENGLISH[column]; });
  doc.addTable(table, types);
  const add = (spec) => {
    const row = {};
    Object.keys(spec).filter(column => !without.includes(column)).forEach((column) => { row[name(column)] = spec[column]; });
    return doc.addRow(table, row);
  };
  add({ Name: 'Petit', Content: '<p>petit</p>', IsDefault: true, ModifiedAt: 1790000001, TemplateType: 'document', Margins: '{"top":10}' });
  add({ Name: 'Gros', Content: big, ModifiedAt: 1790000002, TemplateType: 'document', HeaderFooter: '{"enabled":true}', ModifiedBy: 'Ada <ada@exemple.fr>' });
  add({ Name: 'Macro', Content: JSON.stringify({ slots: [{ type: 'fixed', modeleId: 2 }] }), ModifiedAt: 1790000003, TemplateType: 'macro' });
  add({ Name: 'Réglages du document', Content: JSON.stringify({ couleur: 'bleu' }), TemplateType: 'reglages' });
  add({ Name: 'Courrier', Content: '<p>bonjour</p>', ModifiedAt: 1790000005, TemplateType: 'email', To: 'ada@exemple.fr', Subject: 'Sujet' });
  add({ Name: 'Accentué', Content: '<p>' + 'é'.repeat(10000) + '</p>', ModifiedAt: 1790000006, TemplateType: 'document' });
  extra.forEach(add);
  doc.resetLog();
  return { doc, table, name };
}

// Un contexte par scénario (GristAPI et Templates gardent un état de module). `light` : 'force' | 'off' | null (la production : le poids décide).
function fresh(doc, server, { legacy = false, light = 'force', small, scripts } = {}) {
  const clock = { now: 1700000000000 };
  class FakeDate extends Date { static now() { return clock.now; } }
  const warnings = [];
  const errors = [];
  doc.getAccessToken = async () => ({ token: 'stub-token', baseUrl: 'http://grist.test/api/docs/D1', ttlMsecs: 600000 });
  const globals = {
    __schemaNames: legacy ? 'legacy' : 'english',
    grist: { docApi: doc, ready() {}, onRecord() {}, onOptions() {}, async getOptions() { return null; } },
    console: { log() {}, warn(...a) { warnings.push(a.join(' ')); }, error(...a) { errors.push(a.join(' ')); warnings.push(a.join(' ')); } },
    Date: FakeDate, setTimeout: () => 0, clearTimeout() {}, performance: { now: () => 0 }, AbortController, URL, HtmlSanitize: { clean: html => html },
    fetch: async (url) => { const answer = await server.handle(String(url)); if (answer.noCors) throw new TypeError('Failed to fetch'); return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, text: async () => answer.body }; },
  };
  if (light) globals.__templatesLight = light;
  if (typeof small === 'number') globals.__templatesLightSmall = small;
  const ctx = createContext(globals);
  (scripts || ['js/schema-columns.js', 'js/grist-api.js', 'js/templates-light.js', 'js/templates.js']).forEach(script => loadScript(ctx, script));
  return { ctx, clock, warnings, errors, run: expr => evalIn(ctx, expr) };
}
const sqlCalls = server => server.log.filter(entry => entry.kind === 'sql');
const recordCalls = server => server.log.filter(entry => entry.kind === 'records');
const byName = (templates, name) => templates.find(template => template.nom === name);

async function main() {
  // === 1. js/templates-light.js : les demandes ===
  {
    const { run } = fresh(new StartupDoc(), createLightServer(() => ({})));
    const map = { table: 'Publipostage_Modeles', columns: new Map([['Name', 'Nom'], ['Content', 'Contenu'], ['TemplateType', 'TypeModele'], ['To', 'Destinataires'], ['manualSort', 'manualSort']]) };
    run('globalThis.__map = ' + JSON.stringify({ table: map.table, columns: Array.from(map.columns) }) + '; __map.columns = new Map(__map.columns)');
    const sql = run('TemplatesLight.listSql(__map)');
    check('listSql : le nom réel de la table, entre guillemets', sql.includes('FROM "Publipostage_Modeles"'), sql);
    check('listSql : une colonne de l\'ancien nom est rendue sous son nom anglais', sql.includes('"Nom" AS "Name"') && sql.includes('"TypeModele" AS "TemplateType"') && sql.includes('"Destinataires" AS "To"'), sql);
    check('listSql : une colonne que le document n\'a pas est NULL (rien ne casse)', sql.includes('NULL AS "Token"') && sql.includes('NULL AS "Notice"') && sql.includes('0 AS "Notice__len"'), sql);
    check('listSql : un long texte ne vient que s\'il est court ou d\'un type qui vient toujours, sa longueur en octets toujours', /iif\("TypeModele" IN \('macro', 'reglages'\) OR COALESCE\(length\(CAST\("Contenu" AS BLOB\)\), 0\) <= 16384, "Contenu", NULL\) AS "Content"/.test(sql) && sql.includes('COALESCE(length(CAST("Contenu" AS BLOB)), 0) AS "Content__len"') && !/CASE|WHEN/i.test(sql), sql);
    check('listSql : dans l\'ordre de la table', /ORDER BY "manualSort", id$/.test(sql), sql);
    const bare = run('TemplatesLight.listSql(__map, { weights: false })');
    check('listSql sans longueurs : aucun texte long n\'est lu côté Grist, hors types qui viennent toujours', !bare.includes('CAST') && !bare.includes('__len') && bare.includes('iif("TypeModele" IN (\'macro\', \'reglages\'), "Contenu", NULL) AS "Content"'), bare);
    check('quoteName double les guillemets, quoteText les apostrophes', run("TemplatesLight.quoteName('a\"b')") === '"a""b"' && run('TemplatesLight.quoteText("l\'été")') === "'l''été'");
    check('citingSql : instr sur le texte et l\'en-tête, mots entre apostrophes', /instr\("Contenu", 'Mes'\) > 0/.test(run("TemplatesLight.citingSql(__map, ['Mes'])") || '') && run('TemplatesLight.citingSql(__map, [])') === null);
    // Le pare-feu devant le Grist de la DINUM refuse `case when`, `or 1=1`, `drop table` (faits vérifiés 136 de GFS), un `substr(…) <> …` et des sous-requêtes côte à côte (173, 174) : aucun SQL de ce module n'en porte, et le faux
    // pare-feu du faux serveur (dev-tests/light-server.mjs) sait refuser chacune de ces formes, pour que ce contrôle ait une raison d'être.
    const built = {
      listSql: sql,
      'listSql sans longueurs': bare,
      'listSql au seuil de 0 octet': run('TemplatesLight.listSql(__map, { smallBytes: 0 })'),
      citingSql: run("TemplatesLight.citingSql(__map, ['Mes', \"l'été\", 'Publipostage_Templates'])"),
    };
    Object.keys(built).forEach((label) => { check('le pare-feu de la DINUM ne refuserait pas ' + label + ' (ni case/when, ni or 1=1, ni drop, ni <>, ni substr, ni sous-requête, ni ; ni --)', typeof built[label] === 'string' && built[label].startsWith('SELECT ') && !firewallRefuses(built[label]), built[label]); });
    check('le faux pare-feu refuse chacune des formes que la DINUM refuse (case when, or 1=1, drop table, substr(…) <>, sous-requêtes) et laisse passer iif, instr, COALESCE, length(CAST…), IN, NOT LIKE, !=', [
      'SELECT CASE WHEN a THEN b END FROM "T"', 'SELECT 1 FROM "T" WHERE a = 1 OR 1=1', 'SELECT 1; DROP TABLE "T"', 'SELECT 1 FROM "T" WHERE substr(a, 1, 11) <> \'x\'', 'SELECT (SELECT 1) * (SELECT 2)',
    ].every(text => firewallRefuses(text)) && [
      'SELECT iif(a IN (\'x\', \'y\') OR COALESCE(length(CAST(b AS BLOB)), 0) <= 16384, b, NULL) AS "B" FROM "T" WHERE c NOT LIKE \'g%\' AND d != \'m\' AND instr(b, \'w\') > 0 ORDER BY id',
    ].every(text => !firewallRefuses(text)));
    check('utf8Length : octets d\'un texte (2 + 3 + 4)', run("TemplatesLight.utf8Length('é€😀')") === 9);
    const chunks = run('TemplatesLight.chunkIds([1, 2, 3, 4, 5], id => (id === 3 ? 30 * 1024 * 1024 : 5 * 1024 * 1024))');
    check('chunkIds : une ligne plus lourde que le paquet part seule, l\'ordre est gardé', JSON.stringify(chunks) === '[[1,2],[3],[4,5]]', JSON.stringify(chunks));
    check('chunkIds : au plus 50 lignes par paquet', run('TemplatesLight.chunkIds(Array.from({ length: 120 }, (_, i) => i + 1), () => 1)').map(chunk => chunk.length).join() === '50,50,20');
  }

  // === 2. Une table lourde (lecture légère forcée) : jamais lue en entier ===
  {
    const { doc, table } = makeDoc();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run, warnings } = fresh(doc, server);
    const templates = await run('Templates.loadAll()');
    check('liste légère : la table des modèles n\'est pas lue en entier', doc.readsOf(table) === 0, doc.readsOf(table));
    check('liste légère : une seule requête SQL', sqlCalls(server).length === 1 && recordCalls(server).length === 0, server.log.map(entry => entry.kind));
    check('liste légère : les cinq modèles (la ligne des réglages n\'en est pas un)', templates.length === 5 && templates.map(template => template.nom).join('|') === 'Petit|Gros|Macro|Courrier|Accentué', templates.map(template => template.nom));
    const petit = byName(templates, 'Petit');
    check('un texte court vient avec la liste : chargé, rien à lire', petit.chargee === true && petit.contenu === '<p>petit</p>' && petit.estParDefaut === true && petit.dateModif === 1790000001 && petit.marginsMm.top === 10, JSON.stringify(petit));
    const gros = byName(templates, 'Gros');
    check('un texte long reste à lire : pas chargé, son poids connu', gros.chargee === false && gros.poids.Content === BIG.length && gros.poids.HeaderFooter === '{"enabled":true}'.length, JSON.stringify(gros.poids));
    check('un texte long : ses champs courts sont là (nom, date, auteur)', gros.nom === 'Gros' && gros.dateModif === 1790000002 && gros.modifiePar === 'Ada <ada@exemple.fr>');
    check('un texte long lu avant d\'être chargé est vide, et noté', gros.contenu === '' && run('Templates.getUnloadedReads()').length === 1 && run('Templates.getUnloadedReads()')[0].field === 'contenu' && warnings.some(line => line.includes('ensureLoaded')), JSON.stringify(run('Templates.getUnloadedReads()')));
    const macro = byName(templates, 'Macro');
    check('un macro-modèle vient toujours en entier (ses emplacements)', macro.chargee === true && macro.macroSlots.slots.length === 1 && macro.macroSlots.slots[0].modeleId === 2, JSON.stringify(macro.macroSlots));
    check('les réglages du document sont lus avec la liste', run("Templates.getDocumentSetting('couleur')") === 'bleu');
    const accentue = byName(templates, 'Accentué');
    check('le seuil se compte en octets : 10 000 « é » pèsent 20 000 octets, au-dessus de 16 384', accentue.chargee === false && accentue.poids.Content === 20000 + '<p></p>'.length, JSON.stringify(accentue.poids));
    check('Templates.getLightState() dit « light »', run('Templates.getLightState()') === 'light');
    check('le poids de la table est la somme des textes longs, en octets', run('Templates.getLoadedChars()') > BIG.length + 20000 && run('Templates.getLoadWeights().light') === true);

    // 3. ensureLoaded
    run('Templates.clearUnloadedReads()');
    const before = recordCalls(server).length;
    const both = await Promise.all([run('Templates.ensureLoaded([2])'), run('Templates.ensureLoaded([2])')]);
    check('ensureLoaded : le texte long est lu par son numéro de ligne, une seule fois pour deux appels simultanés', both.every(Boolean) && recordCalls(server).length === before + 1 && JSON.stringify(recordCalls(server)[before].ids) === '[2]', JSON.stringify(recordCalls(server).map(entry => entry.ids)));
    check('ensureLoaded : l\'entrée est complète (texte, en-tête, chargée), la table toujours pas lue en entier', gros.chargee === true && gros.contenu === BIG && gros.headerFooter.enabled === true && doc.readsOf(table) === 0);
    check('ensureLoaded : rien à relire quand le texte est là', (await run('Templates.ensureLoaded([1, 2, 3])')) === true && recordCalls(server).length === before + 1);
    check('ensureLoaded : l\'identifiant d\'un modèle inconnu ne lit rien', (await run('Templates.ensureLoaded([99, null])')) === true && recordCalls(server).length === before + 1);
    check('rien n\'a été lu avant d\'être chargé après le chargement', run('Templates.getUnloadedReads()').length === 0);

    // La liste suivante : la date n'a pas changé, le texte reste ; elle a changé, il est à relire
    const sqlBefore = sqlCalls(server).length;
    const again = await run('Templates.loadAll()');
    check('liste suivante, même date : le modèle chargé garde son texte et son objet', byName(again, 'Gros') === gros && gros.chargee === true && gros.contenu === BIG && sqlCalls(server).length === sqlBefore + 1 && doc.readsOf(table) === 0);
    const row = doc.tables[table].rows.find(r => r.id === 2);
    row.ModifiedAt = 1790000999;
    row.Content = '<p>autre</p>' + 'y'.repeat(20000);
    const changed = await run('Templates.loadAll()');
    const goros = byName(changed, 'Gros');
    check('liste suivante, date changée ailleurs : le texte est à relire (pas chargé, date nouvelle)', goros.chargee === false && goros.dateModif === 1790000999, JSON.stringify([goros.chargee, goros.dateModif]));
    await run('Templates.ensureLoaded([2])');
    check('… et il se relit : le texte de l\'autre personne', byName(run('Templates.getCached()'), 'Gros').contenu.startsWith('<p>autre</p>'));
    check('la table n\'a toujours pas été lue en entier', doc.readsOf(table) === 0);
    run('Templates.clearUnloadedReads()');

    // ensureLoaded fresh : relit même un modèle chargé
    row.Content = '<p>encore</p>';
    row.ModifiedAt = 1790001000;
    await run('Templates.ensureLoaded([2], { fresh: true })');
    check('ensureLoaded { fresh } : relit la ligne telle que Grist la garde maintenant', byName(run('Templates.getCached()'), 'Gros').contenu === '<p>encore</p>' && byName(run('Templates.getCached()'), 'Gros').dateModif === 1790001000);

    // Un texte réécrit SANS changer la date (la passe des renommages) : la liste qui suit ne garde pas l'ancien texte chargé, une fois seulement
    run('Templates.clearUnloadedReads()');
    row.Content = '<p>renommé</p>' + 'z'.repeat(20000);   // la date reste 1790001000 : c'est ce que fait la passe de js/schema-renames.js
    const silent = await run('Templates.loadAll()');
    check('sans la marque, une réécriture qui ne change pas la date laisse l\'ancien texte au cache (le défaut que la marque corrige)', byName(silent, 'Gros').chargee === true && byName(silent, 'Gros').contenu === '<p>encore</p>', JSON.stringify([byName(silent, 'Gros').chargee, String(byName(silent, 'Gros').contenu).slice(0, 20)]));
    run('Templates.noteRewritten([2])');
    const marked = await run('Templates.loadAll()');
    check('noteRewritten : la liste qui suit ne garde pas le texte chargé de cette ligne (même date)', byName(marked, 'Gros').chargee === false && byName(marked, 'Gros').dateModif === 1790001000, JSON.stringify([byName(marked, 'Gros').chargee, byName(marked, 'Gros').dateModif]));
    await run('Templates.ensureLoaded([2])');
    check('… et la lecture suivante rapporte le texte réécrit, sans lire la table en entier', byName(run('Templates.getCached()'), 'Gros').contenu.startsWith('<p>renommé</p>') && doc.readsOf(table) === 0);
    const settled = await run('Templates.loadAll()');
    check('la marque s\'efface avec la première liste lue après l\'écriture : la suivante garde de nouveau le texte chargé', byName(settled, 'Gros').chargee === true && byName(settled, 'Gros').contenu.startsWith('<p>renommé</p>'));
    run('Templates.clearUnloadedReads()');
  }

  // === 4. Un document d'avant (noms français) ===
  {
    const { doc, table } = makeDoc({ legacy: true });
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server, { legacy: true });
    const templates = await run('Templates.loadAll()');
    check('document d\'avant : la liste légère traduit les noms (Nom, Contenu, TypeModele...)', templates.length === 5 && byName(templates, 'Petit').contenu === '<p>petit</p>' && byName(templates, 'Courrier').typeModele === 'email' && byName(templates, 'Courrier').destinataires === 'ada@exemple.fr', JSON.stringify(templates.map(template => template.nom)));
    check('document d\'avant : la table française n\'est jamais lue en entier, le SQL parle d\'elle', doc.readsOf(table) === 0 && sqlCalls(server)[0].sql.includes('FROM "Publipostage_Modeles"'));
    const gros = byName(templates, 'Gros');
    check('document d\'avant : le texte long reste à lire', gros.chargee === false && gros.poids.Content === BIG.length);
    await run('Templates.ensureLoaded([2])');
    check('document d\'avant : lu par son numéro de ligne, sous les noms anglais', gros.contenu === BIG && gros.chargee === true && recordCalls(server)[0].table === 'Publipostage_Modeles' && doc.readsOf(table) === 0);
    check('document d\'avant : le ★ et les réglages passent aussi', run('Templates.getDefaultId()') === 1 && run("Templates.getDocumentSetting('couleur')") === 'bleu');
  }

  // === 5. Les replis ===
  {
    // SQL refusé par les règles d'accès : lecture entière, comme avant, sans réessayer tout de suite
    const { doc, table } = makeDoc();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    server.state.refuseSql = 403;
    const { run, clock } = fresh(doc, server);
    const templates = await run('Templates.loadAll()');
    check('SQL refusé (403) : la table se lit en entier, tous les modèles sont chargés', templates.length === 5 && templates.every(template => template.chargee === true) && doc.readsOf(table) === 1 && byName(templates, 'Gros').contenu === BIG, doc.readsOf(table));
    check('SQL refusé : l\'état est « refused », une seule requête essayée', run('Templates.getLightState()') === 'refused' && sqlCalls(server).length === 1);
    await run('Templates.loadAll()');
    check('SQL refusé : la lecture suivante ne retente pas (dix minutes)', sqlCalls(server).length === 1 && doc.readsOf(table) === 2);
    clock.now += 11 * 60 * 1000;
    server.state.refuseSql = null;
    await run('Templates.loadAll()');
    check('SQL refusé : après dix minutes, la liste légère est essayée de nouveau', sqlCalls(server).length === 2 && run('Templates.getLightState()') === 'light');
  }
  {
    // Le pare-feu de la DINUM refuse le SQL (403 sans en-tête CORS : le navigateur ne dit que « réseau ») : la lecture entière, comme pour un refus des droits, sans second essai sans longueurs
    const { doc, table } = makeDoc();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    server.state.refuseSql = 'firewall';
    const { run } = fresh(doc, server);
    const templates = await run('Templates.loadAll()');
    check('pare-feu : la table se lit en entier, tous les modèles sont chargés', templates.length === 5 && templates.every(template => template.chargee === true) && doc.readsOf(table) === 1 && byName(templates, 'Gros').contenu === BIG, doc.readsOf(table));
    check('pare-feu : l\'état est « refused », une seule requête essayée (une erreur réseau ne se retente pas sans longueurs)', run('Templates.getLightState()') === 'refused' && sqlCalls(server).length === 1 && sqlCalls(server)[0].status === 403, sqlCalls(server).length);
  }
  {
    // Les longueurs ne se calculent pas dans le temps de Grist (interruption) : la liste sans longueurs, tout se lit à la demande
    const { doc, table } = makeDoc();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    server.state.failWeights = true;
    const { run } = fresh(doc, server);
    const templates = await run('Templates.loadAll()');
    check('poids non calculable : deux requêtes (avec, puis sans longueurs), la table pas lue en entier', sqlCalls(server).length === 2 && doc.readsOf(table) === 0 && run('Templates.getLightState()') === 'light', sqlCalls(server).length);
    const petit = byName(templates, 'Petit');
    check('poids non calculable : les textes ne sont pas connus, tout se lit à la demande (hors macro et réglages)', petit.chargee === false && petit.poids === null && byName(templates, 'Macro').chargee === true && run("Templates.getDocumentSetting('couleur')") === 'bleu');
    check('poids non calculable : la table est tenue pour lourde', run('Templates.getLoadedChars()') >= 8 * 1000 * 1000);
    await run('Templates.ensureLoaded([1])');
    check('poids non calculable : un modèle se lit par son numéro', petit.chargee === true && petit.contenu === '<p>petit</p>' && recordCalls(server).length === 1);
  }
  {
    // La lecture par numéros est refusée : la lecture entière sert
    const { doc, table } = makeDoc();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    server.state.refuseRecords = 403;
    const { run } = fresh(doc, server);
    const templates = await run('Templates.loadAll()');
    const ok = await run('Templates.ensureLoaded([2])');
    check('lecture par numéros refusée : la lecture entière donne le texte', ok === true && byName(templates, 'Gros').contenu === BIG && byName(templates, 'Gros').chargee === true && doc.readsOf(table) === 1, doc.readsOf(table));
  }
  {
    // Une colonne d'une migration manque : ajoutée, puis la liste relue avec elle
    const { doc, table } = makeDoc({ without: ['Subject', 'TrackedChanges'] });
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server);
    const templates = await run('Templates.loadAll()');
    const added = doc.actions.filter(action => action[0] === 'AddVisibleColumn').map(action => action[2]).sort();
    check('colonnes manquantes : ajoutées par les métadonnées, la table jamais lue en entier', JSON.stringify(added) === '["Subject","TrackedChanges"]' && doc.readsOf(table) === 0, JSON.stringify(added));
    check('colonnes manquantes : la liste est relue avec les colonnes (deux requêtes SQL), les modèles sont là', sqlCalls(server).length === 2 && templates.length === 5, sqlCalls(server).length);
    check('colonnes manquantes : la requête relue nomme les colonnes ajoutées', sqlCalls(server)[1].sql.includes('"Subject" AS "Subject"') && !sqlCalls(server)[0].sql.includes('"Subject" AS "Subject"'));
    await run('Templates.loadAll()');
    check('colonnes manquantes : la lecture suivante n\'ajoute plus rien', doc.actions.filter(action => action[0] === 'AddVisibleColumn').length === 2);
  }
  {
    // Une table qui n'existe pas encore : la lecture entière la crée (comme avant)
    const doc = new StartupDoc();
    doc.resetLog();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server);
    const templates = await run('Templates.loadAll()');
    check('document sans table des modèles : pas de requête SQL, la table est créée, aucun modèle', templates.length === 0 && sqlCalls(server).length === 0 && doc.actions.some(action => action[0] === 'AddTable'));
  }

  // === 6. Sans interrupteur (la production) : le poids décide ===
  {
    const { doc, table } = makeDoc({ big: '<p>' + 'x'.repeat(20 * 1024) + '</p>' });
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server, { light: null });
    await run('Templates.loadAll()');
    check('table peu lourde : une sonde SQL, puis la lecture entière comme avant', sqlCalls(server).length === 1 && doc.readsOf(table) === 1 && run('Templates.getLightState()') === 'whole', JSON.stringify([sqlCalls(server).length, doc.readsOf(table)]));
    check('table peu lourde : tous les modèles sont chargés', run('Templates.getCached()').every(template => template.chargee === true));
    await run('Templates.loadAll()');
    check('table peu lourde : la lecture suivante ne sonde plus', sqlCalls(server).length === 1 && doc.readsOf(table) === 2);
  }
  {
    const { doc, table } = makeDoc({ big: '<p>' + 'x'.repeat(1200 * 1000) + '</p>' });
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server, { light: null });
    await run('Templates.loadAll()');
    check('table lourde (1,2 M de signes) : la liste légère, la table jamais lue en entier', run('Templates.getLightState()') === 'light' && doc.readsOf(table) === 0 && run('Templates.getCached()').filter(template => template.chargee === false).length === 2, run('Templates.getLightState()'));
  }
  {
    const { doc, table } = makeDoc();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server, { light: 'off' });
    await run('Templates.loadAll()');
    check('interrupteur « off » : rien ne change (lecture entière, aucune requête)', server.log.length === 0 && doc.readsOf(table) === 1 && run('Templates.getLightState()') === 'unknown');
  }

  // === 7. La recherche d'impact ne lit que ce qui cite ===
  {
    const other = '<p>' + 'z'.repeat(30 * 1024) + '</p>';
    const { doc } = makeDoc({ extra: [{ Name: 'Cite', Content: '<p>{{Ma_Table}}</p>' + other, ModifiedAt: 1790000007, TemplateType: 'document' }, { Name: 'Ne cite pas', Content: other, ModifiedAt: 1790000008, TemplateType: 'document' }] });
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server);
    await run('Templates.loadAll()');
    const ok = await run("Templates.ensureCiting(['Ma_Table'])");
    const loaded = run('Templates.getCached()').filter(template => template.chargee === true).map(template => template.nom).sort();
    check('ensureCiting : seul le modèle qui cite le mot est lu', ok === true && recordCalls(server).length === 1 && JSON.stringify(recordCalls(server)[0].ids) === '[7]' && byName(run('Templates.getCached()'), 'Cite').chargee === true && byName(run('Templates.getCached()'), 'Ne cite pas').chargee === false, JSON.stringify(loaded));
    await run('Templates.ensureAllLoaded()');
    check('ensureAllLoaded : tous les autres se lisent, en une demande par paquet', run('Templates.getCached()').every(template => template.chargee === true) && recordCalls(server).length === 2, recordCalls(server).length);
  }

  // === 8. Les liens entre modèles, l'écouteur, le seuil des essais ===
  {
    const other = '<p>' + 'z'.repeat(30 * 1024) + '</p>';
    const { doc } = makeDoc({ extra: [{ Name: 'Renvoie', Content: '<p>ref=2</p>' + other, ModifiedAt: 1790000007, TemplateType: 'document' }] });
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server);
    await run('Templates.loadAll()');
    run("Templates.declareReferences(html => (String(html).match(/ref=\\d+/g) || []).map(text => Number(text.slice(4))))");
    run('globalThis.__seen = []; Templates.onEntriesLoaded(ids => __seen.push(ids.join()))');
    check('needsReading : un modèle dont le texte n\'est pas lu est à lire', run('Templates.needsReading(Templates.byId(7))') === true);
    check('needsReading : un modèle chargé qui ne désigne rien n\'a rien à lire', run('Templates.needsReading(Templates.byId(1))') === false);
    await run('Templates.ensureLoaded([7])');
    check('un modèle lu seul : ce qu\'il désigne reste à lire (needsReading)', run('Templates.byId(7).chargee') === true && run('Templates.byId(2).chargee') === false && run('Templates.needsReading(Templates.byId(7))') === true);
    check('referencedIds : le numéro que le texte désigne', JSON.stringify(run('Templates.referencedIds(Templates.byId(7))')) === '["2"]', JSON.stringify(run('Templates.referencedIds(Templates.byId(7))')));
    check('referencedIds : le macro-modèle désigne les modèles de ses emplacements', JSON.stringify(run('Templates.referencedIds(Templates.byId(3))')) === '["2"]');
    check('onEntriesLoaded : appelé à l\'arrivée du modèle lu, avec son numéro', JSON.stringify(run('__seen')) === '["7"]', JSON.stringify(run('__seen')));
    check('ensureWithReferences : le modèle et celui qu\'il désigne sont lus', (await run('Templates.ensureWithReferences([7])')) === true && run('Templates.byId(2).chargee') === true && run('Templates.needsReading(Templates.byId(7))') === false && JSON.stringify(run('__seen')) === '["7","2"]', JSON.stringify(run('__seen')));
    check('ensureWithReferences : le macro-modèle lit les modèles de ses emplacements', (await run('Templates.ensureWithReferences([3])')) === true && run('Templates.needsReading(Templates.byId(3))') === false);
    check('ensureLoaded sans rien à lire n\'appelle personne', (await run('Templates.ensureLoaded([1, 2, 7])')) === true && JSON.stringify(run('__seen')) === '["7","2"]');
    check('une lecture à la demande ne rend aucun champ « pas chargé » lu à vide', run('Templates.getUnloadedReads()').length === 0);
  }
  {
    const { run } = fresh(new StartupDoc(), createLightServer(() => ({})));
    run('globalThis.__map = { table: "T", columns: new Map([["Content", "Contenu"], ["HeaderFooter", "EntetePied"], ["TemplateType", "Type"], ["Name", "Nom"]]) }');
    const citing = run("TemplatesLight.citingSql(__map, ['Mes', \"l'été\"])") || '';
    check('citingSql : le texte puis l\'en-tête et le pied de page, chaque mot, apostrophes doublées', /instr\("Contenu", 'Mes'\) > 0 OR instr\("Contenu", 'l''été'\) > 0 OR instr\("EntetePied", 'Mes'\) > 0/.test(citing) && /ORDER BY id$/.test(citing), citing);
    const lazy = run('TemplatesLight.listSql(__map, { smallBytes: 0 })');
    check('listSql : un seuil de 0 octet (les essais) ne laisse venir que les types toujours courts', lazy.includes('<= 0, "Contenu", NULL) AS "Content"') && !lazy.includes('<= 16384'), lazy);
  }
  {
    const { doc, table } = makeDoc();
    const server = createLightServer(() => tablesFromStartupDoc(doc));
    const { run } = fresh(doc, server, { small: 0 });
    const templates = await run('Templates.loadAll()');
    check('seuil des essais à 0 : tout texte non vide est à lire, sauf macro-modèle et réglages', templates.filter(template => template.chargee === false).map(template => template.nom).join('|') === 'Petit|Gros|Courrier|Accentué' && byName(templates, 'Macro').chargee === true && doc.readsOf(table) === 0, templates.map(template => template.nom + ':' + template.chargee).join(' '));
    check('seuil à 0 : un texte lu avant d\'être chargé est noté', byName(templates, 'Petit').contenu === '' && run('Templates.getUnloadedReads()').length === 1);
    run('Templates.clearUnloadedReads()');
    check('seuil à 0 : tout se lit à la demande, en une demande par paquet', (await run('Templates.ensureAllLoaded()')) === true && byName(run('Templates.getCached()'), 'Petit').contenu === '<p>petit</p>' && recordCalls(server).length === 1, recordCalls(server).length);
  }

  // === 9. Une ligne que ce widget écrit pendant qu'on la lit garde ce qu'il a écrit ===
  {
    const { doc } = makeDoc();
    const stale = tablesFromStartupDoc(doc);   // la table AVANT l'écriture : la réponse qui arrive après elle
    const server = createLightServer(() => stale);
    const { run } = fresh(doc, server);
    await run('Templates.loadAll()');
    server.state.delayMs = 40;
    const reading = run('Templates.ensureLoaded([2])');
    await run("Templates.saveContent(2, '<p>écrit pendant la lecture</p>')");
    check('la ligne est écrite pendant que sa lecture est en route (l\'entrée garde le texte écrit, pas encore chargée en entier)', run('Templates.byId(2).contenu') === '<p>écrit pendant la lecture</p>' && run('Templates.byId(2).chargee') === false);
    await reading;
    check('la réponse qui arrive après l\'écriture n\'efface pas le texte écrit (elle est d\'avant)', run('Templates.byId(2).contenu') === '<p>écrit pendant la lecture</p>', run('Templates.byId(2).contenu'));
    check('...elle remplit ce que l\'écriture n\'a pas posé (l\'en-tête) et l\'entrée est chargée : un module qui la demande ne la relit pas sans fin', run('Templates.byId(2).headerFooter.enabled') === true && run('Templates.byId(2).chargee') === true && run('Templates.needsReading(Templates.byId(2))') === false);
    check('...sans un seul champ lu avant d\'être chargé', run('Templates.getUnloadedReads()').length === 0, run('Templates.getUnloadedReads()'));
  }

  summarizeAndExit();
}

main().catch((error) => { console.error(error); process.exit(1); });
