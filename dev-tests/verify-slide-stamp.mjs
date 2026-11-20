#!/usr/bin/env node
// LA LIAISON D'UNE DIAPOSITIVE NUMÉROTE TOUTE LA SOURCE UNE FOIS (20/11, « l'import dans le document depuis un ppt très lourd en cliquant garder lié est très longue/laggy ») : js/slide-links.js `anchorSource`.
// Avant : chaque liaison relisait la table des modèles entière et réécrivait le texte entier de la source (30 Mo lus, 30 Mo écrits, par diapositive liée) pour y poser le numéro d'UNE diapositive. Maintenant :
//  - la première liaison numérote TOUTES les diapositives qui n'ont pas de numéro, en une seule écriture du texte de la source (rien d'autre n'y change) ;
//  - la suivante, dont la diapositive porte déjà son numéro (à elle seule) et dont le jeton est connu, ne lit ni n'écrit rien ;
//  - un numéro porté par deux diapositives (une diapositive dupliquée dans Slides+ en copie le repère) est refait pour celle qu'on lie : le lien ne suit pas la première des deux ;
//  - une source changée depuis que la personne l'a vue (sa diapositive n'est plus celle-là) refuse toujours : « changée depuis ».
// L'app hébergée par GFS (extension « diapositives »), 700x400, français clair : « Devis » (un document) est à l'écran, « Offre » (une présentation de trois diapositives, sans repère ni jeton) est lue.
// Lancé par run-headless.mjs (groupe Node « slideStamp », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-stamp.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-stamp', port: Number(process.env.SLIDE_STAMP_PORT || 9148) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Devis', '<p>Bonjour,</p><p>Cordialement</p>', false, 'document');
  add(8, 'Offre', '<h1>Un</h1><p>Texte un</p>${BR}<h1>Deux</h1><p>Texte deux</p>${BR}<h1>Trois</h1><p>Texte trois</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 9;
`;
const INIT = `try { localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) {}`;
const A = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'] }, seed: SEED, lang: 'fr', colorScheme: 'light', init: INIT });
const { page } = A;
await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && !!EditorCore.getEditor(), null, { timeout: 15000 });
await sleep(800);

// Les lectures de la table des modèles et les écritures de son texte, comptées depuis `reset`.
await page.evaluate(() => {
  window.__n = { reads: 0, writes: 0 };
  const docApi = grist.docApi;
  const fetchTable = docApi.fetchTable.bind(docApi);
  docApi.fetchTable = (table) => { if (table === 'Publipostage_Modeles') window.__n.reads++; return fetchTable(table); };
  const apply = docApi.applyUserActions.bind(docApi);
  docApi.applyUserActions = (actions, ...rest) => { if (Array.isArray(actions) && actions.some(a => a && a[3] && Object.values(a[3]).some(v => typeof v === 'string' && v.length > 100 && /Texte (un|deux|trois)/.test(v)))) window.__n.writes++; return apply(actions, ...rest); };
});
const reset = () => page.evaluate(() => { window.__n.reads = 0; window.__n.writes = 0; });
const counted = () => page.evaluate(() => Object.assign({}, window.__n));
// La présentation « Offre » : ses numéros de diapositive (dans l'ordre) et ses titres, d'après sa ligne dans Grist.
const stored = () => page.evaluate(() => {
  const html = window.__gristStub.getRow('Publipostage_Modeles', 8).Contenu;
  const parts = html.split('<div class="page-break-marker"');
  return { html, ids: parts.map((part) => { const m = part.match(/data-slide-id="([a-z0-9]+)"/); return m ? m[1] : null; }), texts: parts.map(part => (part.match(/Texte (un|deux|trois)/) || [''])[0]) };
});
// anchorSource comme le volet l'appelle : `seen` est le texte de la source qu'avait le cache.
const anchor = (index, seen) => page.evaluate(async ({ index, seen }) => {
  const editor = EditorCore.getEditor();
  if (seen === undefined) { await Templates.loadAll(); seen = Templates.byId(8).contenu; }
  try {
    const out = await SlideLinks.anchorSource(editor, 8, index, seen);
    return { slide: out.link.linkSlide, key: out.link.linkKey, model: out.link.linkModel, html: out.html };
  } catch (error) { return { error: error.reason || String(error) }; }
}, { index, seen });

// --- La première liaison : la diapositive 2, tout est numéroté.
await reset();
const first = await anchor(1);
let s = await stored();
let n = await counted();
check('la première liaison (diapositive 2) rend le numéro de la diapositive 2 et le jeton de « Offre »', !first.error && first.slide === s.ids[1] && !!first.key && first.model === 8, { first: first.error || first.slide, ids: s.ids });
check('TOUTES les diapositives de la source ont leur numéro, tous différents', s.ids.every(Boolean) && new Set(s.ids).size === 3, s.ids);
check('une seule écriture du texte de la source (lecture comprise : l’appel a relu la table pour ne rien écraser)', n.writes === 1 && n.reads >= 1, n);
check('le texte de la source n’a pas bougé : mêmes trois diapositives, mêmes mots', s.texts.join('|') === 'Texte un|Texte deux|Texte trois' && s.html.split('page-break-marker').length === 3 && s.html.includes('<h1>Un</h1>') && s.html.includes('<h1>Trois</h1>'), s.texts);
check('la diapositive rendue est la diapositive 2 sans repère', first.html.includes('Deux') && first.html.includes('Texte deux') && !first.html.includes('pp-slide-link'), first.html);

// --- La seconde : le numéro existe, le jeton aussi : rien ne se lit, rien ne s'écrit.
await reset();
const second = await anchor(2, await page.evaluate(() => Templates.byId(8).contenu));
n = await counted();
check('la liaison suivante (diapositive 3) ne lit ni n’écrit la table : le numéro de la diapositive 3 était déjà là', !second.error && second.slide === s.ids[2] && n.reads === 0 && n.writes === 0, { second: second.error || second.slide, n });
const again = await anchor(1, await page.evaluate(() => Templates.byId(8).contenu));
check('la diapositive 2 liée une seconde fois rend le même numéro, sans lecture ni écriture', !again.error && again.slide === first.slide && (await counted()).writes === 0, again.error || again.slide);

// --- Une diapositive dupliquée dans Slides+ copie le repère : la 3 porte celui de la 1.
await page.evaluate(() => {
  const stub = window.__gristStub;
  const html = stub.getRow('Publipostage_Modeles', 8).Contenu;
  const parts = html.split('<div class="page-break-marker"');
  const idOf = part => (part.match(/data-slide-id="([a-z0-9]+)"/) || [])[1];
  parts[2] = parts[2].split(idOf(parts[2])).join(idOf(parts[0]));
  stub.remoteWrite('Publipostage_Modeles', 8, { Contenu: parts.join('<div class="page-break-marker"'), DateModif: new Date().toISOString() });
});
const dupBefore = await stored();
await reset();
const dup = await anchor(2);
s = await stored();
n = await counted();
check('un numéro porté par deux diapositives (la 3 copie celui de la 1) : la liaison de la 3 reçoit un numéro à elle', !dup.error && dup.slide !== dupBefore.ids[0] && dup.slide === s.ids[2], { dup: dup.error || dup.slide, before: dupBefore.ids, after: s.ids });
check('la diapositive 1 garde le sien, les trois sont différents, une seule écriture', s.ids[0] === dupBefore.ids[0] && s.ids.every(Boolean) && new Set(s.ids).size === 3 && n.writes === 1, { ids: s.ids, n });

// --- Une source changée depuis que la personne l'a vue (le cache l'a relue : l'autosave le fait toutes les 15 s à 3 min) : refusée.
const changed = await page.evaluate(async () => {
  const editor = EditorCore.getEditor();
  await Templates.loadAll();
  const seen = Templates.byId(8).contenu;
  window.__gristStub.remoteWrite('Publipostage_Modeles', 8, { Contenu: seen.split('Texte deux').join('Texte deux autre'), DateModif: new Date().toISOString() });
  await Templates.loadAll();
  try { await SlideLinks.anchorSource(editor, 8, 1, seen); return { ok: true }; } catch (error) { return { reason: error.reason || String(error) }; }
});
check('la diapositive 2 changée dans la source depuis que la personne l’a vue : « changée depuis », rien n’est lié', changed.reason === 'slides.link.changed', changed);

await t.finish();
