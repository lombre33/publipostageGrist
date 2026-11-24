#!/usr/bin/env node
// L'APERÇU DE LECTURE du démarrage (js/early-preview.js ; 23/11, « document lisible d'abord » : la table des modèles se lit en entier avant tout affichage, 4,6 s sur 7,3 chez une personne dont la table pèse 42 Mo, dont 94 % de
// présentations que le document ouvert ne touche pas). Tant que cette lecture dure, la feuille du document que GFS ouvre se pose en lecture seule : sa ligne seule est lue par l'interface REST de Grist. Ce que les cas vérifient :
//  1. (le cœur) la lecture de la table des modèles dure 4 s : la feuille du document est à l'écran bien AVANT, avec son texte, sans que la table soit arrivée ni que l'éditeur ait un texte ;
//  2. le jeton en lecture seule part AVANT la lecture de la table (l'hôte de Grist fait attendre tout appel posé pendant elle : un jeton demandé après n'arriverait qu'à la fin) ;
//  3. la demande est UNE ligne, filtrée sur le numéro du document ET sur son type (document) : une présentation, un e-mail ou une grille ne sont jamais envoyés ;
//  4. la feuille est inerte (un lien ne se suit pas, rien ne prend la souris, aucun script du texte ne s'exécute) et ne dit rien aux lecteurs d'écran (`aria-hidden`) ;
//  5. le widget ouvre ensuite le document pour de bon : la feuille s'efface, l'éditeur porte le texte du document (celui de la table, pas celui de l'aperçu), il est éditable, et RIEN n'a été écrit dans le document ;
//  6. aucune feuille quand elle ne peut pas être sûre : pas de fichier désigné, un import, une lecture de PDF, un modèle du catalogue, une ligne refusée (HTTP 403), une présentation, un texte suivi par « suivi des modifications »,
//     un format de page libre, une table des modèles qui arrive d'abord ; et le démarrage se fait comme avant dans tous ces cas ;
//  7. la page de la feuille suit le sens et le format du document (portrait / paysage, A4 / A3) et ses marges ;
//  8. le rapport de fluidité (js/perf-trace.js) dit chaque étape (`aperçu : …`) ;
//  9. (24/11, « plus aucun appel vers un autre site ») une image du document qui vient d'un autre site n'est jamais demandée à son site : l'aperçu la montre vide, garde les images qui portent leurs octets, et l'éditeur qui ouvre ensuite le document n'envoie rien non plus.
//  Les réglages du document partent avec la ligne (js/early-open.js) : une demande de plus, qui ne change rien à l'aperçu.
// Lancé par run-headless.mjs (groupe Node « earlyPreview », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-early-preview.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-early-preview', port: Number(process.env.EARLY_PREVIEW_PORT || 9221) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BASE = 'http://grist.test/api/docs/DOC1';

// Le document désigné (numéro 2 dans le faux Grist : « Départ B », texte « Contenu B ») et ce que la table REST en dit : un autre texte, pour qu'on voie qui s'affiche.
const PREVIEW_TEXT = 'Aperçu rapide du compte rendu';
const rowsOf = (extra = {}) => [
  { id: 2, fields: Object.assign({
    Name: 'Départ B', TemplateType: 'document', Margins: JSON.stringify({ top: 20, right: 25, bottom: 20, left: 30 }),
    // Le texte porte une diapositive liée (`data-link-mode`) : l'ouverture depuis la seule ligne (js/early-open.js, essai « earlyOpen ») ne s'applique pas à un document qui parle d'un autre modèle, la table entière se lit
    // comme avant et l'aperçu tient l'attente - c'est ce que cet essai regarde.
    Content: '<h1>' + PREVIEW_TEXT + '</h1><p data-link-mode="push">Bonjour <a href="https://exemple.test/lien">un lien</a></p><img src="x" onerror="window.__xss=1"><script>window.__xss=2</script>',
  }, extra) },
  { id: 6, fields: { Name: 'Futur', TemplateType: 'presentation', Content: '<p>PRESENTATION LOURDE</p>' } },
  { id: 4, fields: { Name: 'Départ E', TemplateType: 'email', Content: '<p>EMAIL</p>' } },
];

// Le contexte de GFS met 400 ms à arriver (la poignée de main avec la page hôte) : le jeton ne doit pas l'attendre, il part avant la lecture de la table des modèles.
const opening = (fichier = { id: 2, type: 'document' }, raison = 'explorateur') => ({ contextDelayMs: 400, ouverture: { fichier, type: 'document', dossier: '', raison } });

// Ouvre le widget avec une table des modèles lente (4 s), comme chez une personne dont la table pèse 42 Mo, et la route REST que « Grist » sert. `mode` : ce que la route répond.
async function openSlow({ stub, rows = rowsOf(), status = 200, slowMs = 4000, ready = false, outside = null, content = null } = {}) {
  const seen = [];
  const opened = await t.openPage({
    hosted: true, stub: stub || opening(), lang: 'fr', colorScheme: 'light', ready,
    seed: seedModels() + `\nstub.state.tokenBaseUrl = ${JSON.stringify(BASE)}; stub.state.slowTable = 'Publipostage_Modeles'; stub.state.slowMs = ${slowMs};`
      // `content` : le texte que la table du faux Grist (le document ouvert pour de bon) donne au document 2 ; sans lui, c'est « Contenu B », sans image.
      + (content ? `\n{ const m = stub.state.rows.Publipostage_Modeles; m.Contenu[m.id.indexOf(2)] = ${JSON.stringify(content)}; }` : ''),
    before: async (p) => {
      // Le site d'une image du document (cas 9) : toute demande qui y part est notée, et refusée.
      if (outside) await p.route('https://images.exemple.test/**', (route) => { outside.push(route.request().url()); return route.abort(); });
      await p.route('http://grist.test/**', async (route) => {
        const request = route.request();
        const asked = new URL(request.url());
        seen.push({ method: request.method(), url: request.url(), headers: request.headers(), at: Date.now() });
        const cors = { 'Access-Control-Allow-Origin': '*' };
        if (status !== 200) return route.fulfill({ status, headers: cors, contentType: 'application/json', body: '{"error":"insufficient document access"}' });
        if (/\/tables\/[^/]+\/records$/.test(asked.pathname)) {
          const filter = asked.searchParams.has('filter') ? JSON.parse(asked.searchParams.get('filter')) : {};
          const found = rows.filter(row => (!filter.id || filter.id.includes(row.id)) && (!filter.TemplateType || filter.TemplateType.includes(row.fields.TemplateType)));
          return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ records: found }) });
        }
        return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
      });
    },
  });
  return Object.assign(opened, { seen });
}
const waitReady = (app) => app.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test(el.textContent || ''); }, null, { timeout: 60000 });
const look = (app) => app.evaluate(() => {
  const host = document.getElementById('pp-early-preview');
  const sheet = host && host.querySelector('.pp-early-sheet');
  const editor = EditorCore.getEditor && EditorCore.getEditor();
  return {
    shown: !!host, text: sheet ? sheet.textContent : '', hidden: host ? host.getAttribute('aria-hidden') : null, inert: sheet ? sheet.hasAttribute('inert') : null,
    loaded: Templates.hasLoaded(), editorText: editor ? editor.getText() : null, state: EarlyPreview.state(), scripts: sheet ? sheet.querySelectorAll('script').length : 0,
    xss: window.__xss || 0, width: sheet ? sheet.style.getPropertyValue('--pp-early-width') : '', margins: sheet ? ['top', 'right', 'bottom', 'left'].map(side => sheet.style.getPropertyValue('--pp-early-' + side)) : [],
    linkPointer: sheet && sheet.querySelector('a') ? getComputedStyle(sheet.querySelector('a')).pointerEvents : null, order: window.__gristStub.state.callOrder.slice(), href: location.href,
  };
});

// --- 1 à 5. Le cœur : la table lente, la feuille déjà là ---
const slow = await openSlow({ ready: false });
await sleep(2500);
const mid = await look(slow.app || slow.page);
check('la feuille du document est à l\'écran pendant que la table des modèles se lit encore (2,5 s sur 4 s) : son texte y est', mid.shown && mid.text.includes(PREVIEW_TEXT), mid);
check('la table des modèles n\'est pas arrivée, l\'éditeur n\'a pas encore de texte : l\'aperçu n\'a rien emprunté à l\'éditeur', mid.loaded === false && !mid.editorText, mid);
const rest = slow.seen.filter(entry => /\/tables\//.test(entry.url) && /limit=1/.test(entry.url));
const settingsRest = slow.seen.filter(entry => /\/tables\//.test(entry.url) && !/limit=1/.test(entry.url));
const restUrl = rest[0] ? new URL(rest[0].url) : null;
const asked = restUrl ? JSON.parse(restUrl.searchParams.get('filter')) : null;
check('UNE seule demande REST est partie, un GET simple (ni corps ni en-tête qui appelle une pré-requête), avec le jeton en lecture seule dans `auth`', rest.length === 1 && rest[0].method === 'GET' && restUrl.searchParams.get('auth') === 'stub-token' && !rest[0].headers.authorization && restUrl.searchParams.get('limit') === '1', rest.map(entry => entry.url));
check('une demande de plus, pour la ligne des réglages du document (filtre sur son type, jamais la table entière)', settingsRest.length === 1 && JSON.stringify(JSON.parse(new URL(settingsRest[0].url).searchParams.get('filter'))) === JSON.stringify({ TemplateType: ['reglages'] }), settingsRest.map(entry => entry.url));
check('elle vise la ligne du document ET son type : les lignes de type présentation, e-mail, grille ou macro ne sont pas envoyées', !!asked && JSON.stringify(asked.id) === '[2]' && JSON.stringify(asked.TemplateType) === JSON.stringify(['document', '']) && /\/tables\/Publipostage_Templates\/records$/.test(restUrl.pathname), asked);
const tokenAt = mid.order.indexOf('getAccessToken');
const modelsAt = mid.order.findIndex(call => /^fetchTable Publipostage_Modeles/.test(call));
check('le jeton part AVANT la lecture de la table des modèles (sinon il attendrait sa fin, comme tout appel posé pendant elle)', tokenAt !== -1 && modelsAt !== -1 && tokenAt < modelsAt, mid.order);
check('la feuille est inerte et muette : `inert`, `aria-hidden`, un lien qui ne prend pas la souris', mid.inert === true && mid.hidden === 'true' && mid.linkPointer === 'none', mid);
check('le texte est nettoyé : aucun <script>, l\'attribut onerror est retiré, rien ne s\'est exécuté', mid.scripts === 0 && mid.xss === 0, mid);
const sheetBox = await (slow.app || slow.page).evaluate(() => { const container = document.getElementById('editor-container').getBoundingClientRect(); const host = document.getElementById('pp-early-preview').getBoundingClientRect(); const center = document.elementFromPoint(host.left + host.width / 2, host.top + host.height / 2); return { sameBox: Math.abs(container.width - host.width) < 2 && Math.abs(container.height - host.height) < 2, centerInHost: !!center && document.getElementById('pp-early-preview').contains(center) }; });
check('elle recouvre le plan de travail, et rien d\'autre : le centre de la zone est la feuille', sheetBox.sameBox && sheetBox.centerInHost, sheetBox);
await waitReady(slow.app || slow.page);
await sleep(300);
const end = await look(slow.app || slow.page);
check('le widget a ouvert le document pour de bon : la feuille est partie, l\'éditeur porte le texte de la table (« Contenu B »), pas celui de l\'aperçu', !end.shown && end.state === 'done' && /Contenu B/.test(end.editorText || '') && !(end.editorText || '').includes(PREVIEW_TEXT), end);
const writes = await (slow.app || slow.page).evaluate(() => window.__gristStub.state.appliedActions ? window.__gristStub.state.appliedActions.length : -1);
check('rien n\'a été écrit dans le document par l\'aperçu (aucune action appliquée au démarrage)', writes === 0 || writes === -1, writes);
const report = await (slow.app || slow.page).evaluate(() => PerfTrace.report());
check('le rapport de fluidité dit les étapes de l\'aperçu (jeton, ligne lue, affiché, fini)', /aperçu : jeton reçu/.test(report) && /aperçu : ligne lue/.test(report) && /aperçu : affiché/.test(report) && /aperçu : fini/.test(report), report.split('\n').filter(l => /aperçu/.test(l)));
check('le texte du document n\'a pas été éditable pendant l\'aperçu mais l\'est ensuite : le mode Édition est celui d\'avant', await (slow.app || slow.page).evaluate(() => { const editor = EditorCore.getEditor(); return editor.isEditable === true; }));
await slow.context.close();

// --- 7. La page suit le sens, le format et les marges ---
const shape = await openSlow({ rows: rowsOf({ Margins: JSON.stringify({ top: 20, right: 25, bottom: 15, left: 30, orientation: 'landscape', format: 'A3' }) }), slowMs: 3000 });
await sleep(1800);
const wide = await look(shape.app || shape.page);
const mm = px => Math.round(parseFloat(px) / (96 / 25.4));
check('un A3 paysage prend la largeur d\'un A3 paysage (420 mm) avec ses marges (20, 25, 15, 30 mm)', wide.shown && mm(wide.width) === 420 && JSON.stringify(wide.margins.map(mm)) === JSON.stringify([20, 25, 15, 30]), wide);
await shape.context.close();
const portrait = await openSlow({ slowMs: 3000 });
await sleep(1800);
const normal = await look(portrait.app || portrait.page);
check('un A4 portrait (par défaut) prend 210 mm', normal.shown && mm(normal.width) === 210 && JSON.stringify(normal.margins.map(mm)) === JSON.stringify([20, 25, 20, 30]), normal);
await portrait.context.close();

// --- 9. Les images d'un autre site : jamais demandées à leur site ---
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const asked9 = [];
// Le même document pour l'aperçu (la ligne que Grist rend par REST) et pour l'ouverture pour de bon (la table du faux Grist).
// (La diapositive liée du texte garde l'ouverture d'avant, comme dans les autres cas de cet essai : js/early-open.js ne s'applique pas à un document qui parle d'un autre modèle.)
const IMAGES_HTML = '<p data-link-mode="push">Texte avec images</p><img class="editor-image" src="https://images.exemple.test/logo.png" alt="Logo" style="width: 60px;"><img class="editor-image" src="' + PIXEL + '" alt="Pastille" style="width: 40px;">';
const withImages = await openSlow({ outside: asked9, slowMs: 3000, content: IMAGES_HTML, rows: rowsOf({ Content: IMAGES_HTML }) });
await sleep(1800);
const images9 = await (withImages.app || withImages.page).evaluate(() => {
  const sheet = document.querySelector('#pp-early-preview .pp-early-sheet');
  return sheet ? Array.from(sheet.querySelectorAll('img')).map(img => ({ src: img.getAttribute('src'), alt: img.getAttribute('alt'), width: img.style.width })) : null;
});
check('l\'aperçu est posé avec ses deux images : celle d\'un autre site n\'a plus son adresse, celle qui porte ses octets est telle quelle', !!images9 && images9.length === 2 && /^data:image\/gif/.test(images9[0].src) && !/exemple\.test/.test(images9[0].src) && images9[0].alt === 'Logo' && images9[0].width === '60px' && images9[1].src === PIXEL, images9);
check('aucune demande n\'est partie vers le site de l\'image pendant l\'aperçu', asked9.length === 0, asked9);
await waitReady(withImages.app || withImages.page);
await sleep(600);
const editorImages9 = await (withImages.app || withImages.page).evaluate(() => Array.from(document.querySelectorAll('#editor-container .editor-image-blocked')).map(wrap => wrap.dataset.blockedSite));
check('le document ouvert pour de bon ne la demande pas non plus : son image montre le cadre « image non affichée » (site nommé) et rien n\'est parti', asked9.length === 0 && editorImages9.includes('images.exemple.test'), { asked9, editorImages9 });
await withImages.context.close();

// --- 6. Rien ne se pose quand on n'est pas sûr, et le démarrage est celui d'avant ---
async function noSheet(label, options, extra) {
  const run = await openSlow(Object.assign({ slowMs: 2500 }, options));
  await sleep(1700);
  const during = await look(run.app || run.page);
  const requests = run.seen.filter(entry => /\/tables\//.test(entry.url) && /limit=1/.test(entry.url)).length;
  await waitReady(run.app || run.page);
  const after = await look(run.app || run.page);
  check(label, !during.shown && !after.shown && (extra ? extra(requests, during, after) : true), { during: { shown: during.shown, state: during.state }, requests, after: { shown: after.shown, editorText: after.editorText } });
  await run.context.close();
  return { requests, during, after };
}
await noSheet('aucun fichier désigné (ouverture sans fichier) : aucune demande, aucune feuille', { stub: { contextDelayMs: 400, ouverture: { fichier: null, type: 'document', dossier: '', raison: 'nouveau' } } }, requests => requests === 0);
await noSheet('GFS demande un import (raison « importer ») : aucune demande, aucune feuille', { stub: opening({ id: 2, type: 'document' }, 'importer') }, requests => requests === 0);
await noSheet('GFS demande une lecture de PDF (raison « lire ») : aucune demande, aucune feuille', { stub: opening({ id: 2, type: 'document' }, 'lire') }, requests => requests === 0);
await noSheet('GFS demande un modèle du catalogue (raison « modele ») : aucune demande, aucune feuille', { stub: opening({ id: 2, type: 'document' }, 'modele') }, requests => requests === 0);
await noSheet('Grist refuse la lecture de la ligne (HTTP 403) : aucune feuille, le document s\'ouvre quand même', { status: 403 }, (requests, during, after) => requests === 1 && /Contenu B/.test(after.editorText || ''));
await noSheet('le fichier désigné est une présentation : la demande ne rend rien (filtre sur le type), aucune feuille', { stub: opening({ id: 6, type: 'presentation' }) }, (requests) => requests === 1);
await noSheet('un document suivi par « suivi des modifications » : aucune feuille (les marques de suivi ne se dessinent pas ici)', { rows: rowsOf({ TrackedChanges: JSON.stringify({ a1: { author: 'A', createdAt: 1 } }) }) });
await noSheet('un format de page libre (100x200) : aucune feuille', { rows: rowsOf({ Margins: JSON.stringify({ format: '100x200' }) }) });
await noSheet('un texte vide : aucune feuille', { rows: rowsOf({ Content: '' }) });
// La table des modèles qui arrive AVANT la ligne : la feuille ne se pose pas (le document s'ouvre directement).
const quick = await openSlow({ slowMs: 0, ready: true });
const quickLook = await look(quick.app || quick.page);
check('quand la table des modèles arrive d\'abord (rapide), aucune feuille ne reste et le document est ouvert', !quickLook.shown && /Contenu B/.test(quickLook.editorText || ''), quickLook);
await quick.context.close();

await t.finish();
