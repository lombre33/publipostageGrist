#!/usr/bin/env node
// L'EXPORT d'une présentation en OpenDocument (js/odp-export.js, le type « OpenDocument » du menu d'export, js/main-export.js : `SINGLE_EXPORTS.odf` et `BATCH_EXPORTS.odpZip`) à la VRAIE souris, à la taille du
// panneau Grist (~700x400), hébergé par GFS (simulé par dev-tests/gfs-stub.js) avec les extensions « graphique » et « diapositives » : français clair, puis anglais sombre. dev-tests/scenarios-odp-export.js
// (groupe « odpExport ») vérifie, DANS la page, ce que le fichier écrit ; une page.evaluate ne déclenche ni un geste « trusted » ni un vrai téléchargement : c'est ici qu'on s'assure que
//  - dans une présentation, le type « OpenDocument » est proposé et se choisit d'un vrai clic (le type vaut « odf ») ;
//  - le bouton Exporter, « une seule ligne », télécharge un fichier .odp : un paquet dont « mimetype » (présentation OpenDocument) ouvre l'archive, que le moteur PowerPoint et le moteur OpenDocument ont été
//    demandés au réseau une seule fois chacun, et que l'état dit « OpenDocument généré. » puis ce qui n'est pas repris (un lien d'objet « dernière diapositive vue », qu'OpenDocument n'a pas) ;
//  - « Toutes les lignes de la vue (ZIP) » demande sa confirmation, puis rend l'archive des présentations (-export-odp.zip, un .odp par ligne) ;
//  - aucune erreur dans la console.
// Lancé par run-headless.mjs (groupe Node « odpExportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-odp-export-mouse.mjs
import { readFile } from 'node:fs/promises';
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';
import { chooseExportType, chooseExportLines, click } from './load-lib.mjs';

const t = await start({ name: 'verify-odp-export-mouse', port: Number(process.env.ODP_EXPORT_MOUSE_PORT || 9104) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGM4wcBANiJf56jmUc2jmkc1U0UzAAn6OJAPHK6LAAAAAElFTkSuQmCC';
const frame = (x, y, w, h, look, body) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${look}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${body}</div></div></div>`;
// Une présentation de deux diapositives : un titre, un texte avec une variable de la ligne, une forme, une image ; un bouton qui renvoie à la dernière diapositive vue (OpenDocument n'a pas cette action).
const DECK = [
  '<h1>Bonjour <span class="var-badge" data-table="PpDepart" data-column="Nom" data-key="PpDepart.Nom"></span></h1>',
  '<p>Une présentation <strong>exportée</strong> en OpenDocument.</p>',
  frame(60, 200, 260, 100, ' data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"', '<p>Dans une forme</p>'),
  frame(360, 200, 150, 40, ' data-ff-shape="rect" data-ff-fill="#e2e8f0" data-ff-link="pp:back"', '<p>Retour</p>'),
  BREAK,
  '<h2>Deux</h2>',
  `<p><img class="editor-image" alt="Un point rouge" src="data:image/png;base64,${RED_PNG}" style="width: 60px" data-layer="normal" data-wrap="inline"></p>`,
].join('').replace(/'/g, '&#39;');
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Deck', '${DECK}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
  stub.state.lastTableId = 'PpDepart';
  const people = stub.state.rows.PpDepart;
  [['Alice', 'Urgent'], ['Bob', 'Autre']].forEach(([nom, statut], i) => { people.id.push(i + 1); people.Nom.push(nom); people.Statut.push(statut); });`;
const TEXTS = {
  fr: { generated: /^OpenDocument généré\. Non repris : 1 action d’objet non reprise\.$/, zipName: /-export-odp\.zip$/i },
  en: { generated: /^OpenDocument generated\. Not carried over: 1 object action not carried over\.$/, zipName: /-export-odp\.zip$/i },
};

async function run(lang, scheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${scheme}] `;
  console.log(`\n${tag}export d'une présentation en OpenDocument`);
  const { page, requests } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme: scheme, width: WIDTH, height: HEIGHT });
  const errors = [];
  page.on('pageerror', error => errors.push('PAGEERROR ' + error));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await Promise.race([
    page.evaluate(id => window.__gfsStub.ouvrir({ fichier: { id: String(id), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), 7),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  const typeValue = () => page.evaluate(() => document.getElementById('v2-export-type').value);
  const statusText = () => page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
  const download = async (action, timeout = 120000) => { const [file] = await Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), action()]); return file; };
  const park = () => page.mouse.move(WIDTH - 40, HEIGHT - 60);

  check(tag + 'la présentation est ouverte : deux diapositives', await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length) === 2, await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length));
  check(tag + 'les moteurs de l\'export ne sont pas demandés avant le premier export', !requests.some(url => /\/js\/odp-export\.js/.test(url)), requests.filter(url => /odp-export|pptx-export/.test(url)));
  await chooseExportType(page, 'odf');
  await park();
  check(tag + 'un vrai clic sur « OpenDocument » dans une présentation le choisit : le type vaut « odf »', (await typeValue()) === 'odf', await typeValue());

  const single = await download(() => click(page, '#btn-export-pdf'));
  const bytes = single ? await readFile(await single.path()) : Buffer.alloc(0);
  check(tag + 'le bouton Exporter, « une seule ligne » : un fichier .odp est téléchargé, un paquet dont « mimetype » ouvre l\'archive',
    !!single && /\.odp$/i.test(single.suggestedFilename()) && bytes.subarray(0, 2).toString('latin1') === 'PK' && bytes.toString('latin1', 30, 85) === 'mimetypeapplication/vnd.oasis.opendocument.presentation', { name: single && single.suggestedFilename(), head: bytes.toString('latin1', 30, 85) });
  await sleep(600);
  check(tag + 'l\'état dit ce qui n\'est pas repris : l\'action « dernière diapositive vue »', T.generated.test(await statusText()), await statusText());
  check(tag + 'les moteurs PowerPoint et OpenDocument ont été demandés une fois chacun',
    requests.filter(url => /\/js\/odp-export\.js/.test(url)).length === 1 && requests.filter(url => /\/js\/pptx-export\.js/.test(url)).length === 1, requests.filter(url => /odp-export|pptx-export/.test(url)));
  await park();

  await chooseExportLines(page, 'zip');
  await park();
  const zipped = await download(async () => {
    await click(page, '#btn-export-pdf');
    await page.waitForSelector('#pp-dialog-modal .var-modal-primary', { state: 'visible', timeout: 30000 });
    await sleep(250);
    await click(page, '#pp-dialog-modal .var-modal-primary');
  }, 180000);
  const zipBytes = zipped ? await readFile(await zipped.path()) : Buffer.alloc(0);
  check(tag + '« Toutes les lignes de la vue (ZIP) » : la confirmation puis l\'archive des présentations (-export-odp.zip)', !!zipped && T.zipName.test(zipped.suggestedFilename()) && zipBytes.subarray(0, 2).toString('latin1') === 'PK', zipped && zipped.suggestedFilename());
  check(tag + 'l\'archive contient un .odp par ligne (deux lignes)', (zipBytes.toString('latin1').match(/\.odp/g) || []).length >= 2, (zipBytes.toString('latin1').match(/\.odp/g) || []).length);
  await sleep(600);
  check(tag + 'aucune erreur dans la console', !errors.length, errors.slice(0, 4));
  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
