// Le secours que GFS donne au lien de l'app (js/gfs-link.js : `secours(id, version?)`) - consigne 108 de GFS (contrats 5.2 point 14, kit 0.31.0 : `GfsLink.secours`). Pour chaque bibliothèque que l'app charge par un CDN, GFS garde une copie
// (même version, sa propre empreinte, de son site) que l'app essaie quand le CDN échoue ou ne répond pas (js/export-common.js : loadScriptOnce, par le chargeur du kit) : `secours: { id: { version, src, integrite, forme } }` dans le contexte, puis
// dans l'événement `extensions` - la même forme que `natives`, mais sans lien avec le choix de la personne (elle n'a rien choisi).
//
// Node seul, sans navigateur (dev-tests/unit-harness.mjs) : le VRAI js/gfs-link.js, lu dans un contexte `vm` dont `window` est un faux cadre (un parent qui note les messages et un écouteur qu'on joue).
//  1. seule (pas de `gfs=` dans l'adresse) : `secours()` rend null, rien ne part, rien n'écoute ;
//  2. hébergée : null avant le contexte ; le contexte qui porte `secours` donne la copie telle que GFS la donne, en copie (changer ce qu'on a reçu ne change rien) ; le contexte sans la clé (un GFS d'avant) : null partout ;
//  3. la version : sans version demandée, la copie ; avec celle de la copie, la copie ; avec une autre, null (une copie d'une autre version ne vaut pas celle de la liste de l'app) ;
//  4. la forme lue : une entrée complète est gardée ; sans empreinte, d'un autre algorithme, au nom illisible, sans adresse, avec une version qui n'est pas un texte, ou qui n'est pas un objet : écartée ; une forme inconnue vaut « script », « module » est gardée ;
//  5. l'événement `extensions` : remplace les copies, les retire quand la clé manque ; un secours qui change SEUL ne rappelle personne (`onChange` : il ne change rien à ce que l'app charge), un changement de bibliothèque ou de copie figée si ;
//  6. un message d'un autre cadre ou d'un autre contrat est ignoré, une réponse à un appel qui n'existe pas ne change rien ;
//  7. le lien d'avant la consigne (sans `secours`) : la vérification de la forme échoue - ce que cet essai doit prouver (GFS_LINK_FILE=… pour l'essayer sur un autre état du lien).
//
// Lancer : node dev-tests/unit-gfs-link-secours.mjs
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.GFS_LINK_FILE || join(ROOT, 'js', 'gfs-link.js');
const SOURCE = readFileSync(FILE, 'utf8');
const GFS = 'https://gfs.example';

function load(search = '?gfs=0') {
  const sent = [];
  const listeners = [];
  const parent = { postMessage: (message, origin) => { sent.push({ message: JSON.parse(JSON.stringify(message)), origin }); } };
  const window = { location: { search }, parent, addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); } };
  const context = createContext({ window, console: { ...console, warn() {} }, setTimeout: () => 0, clearTimeout: () => {}, URLSearchParams, Blob, File });
  vm.runInContext(SOURCE, context, { filename: FILE });
  const deliver = (data, { source = parent, origin = GFS } = {}) => listeners.forEach(fn => fn({ data, source, origin }));
  return { sent, listeners, deliver, parent, GfsLink: vm.runInContext('GfsLink', context) };
}
// Ce que le lien rend, ou de quoi voir que le lien d'avant la consigne n'a pas la fonction.
const spareOf = (link, id, version) => (typeof link.GfsLink.secours === 'function' ? link.GfsLink.secours(id, version) : 'PAS DE secours()');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = (id, change) => Object.assign({ version: '1.2.3', src: `${GFS}/vendor/${id}/1.2.3/${id}.js`, integrite: 'sha384-' + 'A'.repeat(64), forme: 'script' }, change || {});

// Un lien hébergé dont le contexte est arrivé avec `data`.
async function hostedWith(data) {
  const link = load();
  link.deliver({ gfs: 0, type: 'reponse', id: link.sent[0].message.id, data });
  await link.GfsLink.ready;
  return link;
}
const context = (extra = {}) => Object.assign({ langue: 'fr', stockage: {} }, extra);

// 1. Seule.
{
  const link = load('');
  check('seule : secours() existe et rend null', spareOf(link, 'pdf-lib') === null, JSON.stringify(spareOf(link, 'pdf-lib')));
  check('seule : rien ne part, rien n\'écoute', link.sent.length === 0 && link.listeners.length === 0);
}

// 2. Hébergée : le contexte.
{
  const link = load();
  check('hébergée, avant le contexte : null', spareOf(link, 'pdf-lib') === null);
  const given = copy('pdf-lib');
  link.deliver({ gfs: 0, type: 'reponse', id: link.sent[0].message.id, data: context({ secours: { 'pdf-lib': given, plotly: copy('plotly', { version: '2.13.2' }) } }) });
  await link.GfsLink.ready;
  check('le contexte porte `secours` : la copie est donnée telle que GFS la donne', same(spareOf(link, 'pdf-lib'), given), JSON.stringify(spareOf(link, 'pdf-lib')));
  check('une bibliothèque que GFS ne donne pas : null', spareOf(link, 'jszip') === null && spareOf(link, 'inconnue') === null);
  const mutable = spareOf(link, 'pdf-lib');
  if (mutable && typeof mutable === 'object') { mutable.src = 'https://autre.example/x.js'; mutable.version = '9'; }
  check('c\'est une copie : changer ce qu\'on a reçu ne change rien', same(spareOf(link, 'pdf-lib'), given), JSON.stringify(spareOf(link, 'pdf-lib')));
  check('ce que GFS donne n\'envoie rien à GFS', link.sent.length === 1, link.sent.length);

  const none = await hostedWith(context());
  check('le contexte sans la clé `secours` (un GFS d\'avant la 108) : null', spareOf(none, 'pdf-lib') === null);
  const empty = await hostedWith(context({ secours: {} }));
  check('le contexte avec `secours: {}` : null', spareOf(empty, 'pdf-lib') === null);
  const wrongKind = await hostedWith(context({ secours: 'pas un objet' }));
  const listKind = await hostedWith(context({ secours: [copy('pdf-lib')] }));
  check('`secours` qui n\'est pas un objet de copies (un texte, une liste) : rien n\'est cru', spareOf(wrongKind, 'pdf-lib') === null && spareOf(listKind, 'pdf-lib') === null && spareOf(listKind, '0') === null);
}

// 3. La version.
{
  const link = await hostedWith(context({ secours: { 'pdf-lib': copy('pdf-lib', { version: '1.17.1' }) } }));
  check('sans version demandée : la copie', spareOf(link, 'pdf-lib') && spareOf(link, 'pdf-lib').version === '1.17.1');
  check('avec la version de la copie (celle de la liste de l\'app) : la copie', String((spareOf(link, 'pdf-lib', '1.17.1') || {}).src).endsWith('/pdf-lib.js'));
  check('avec une autre version : null (une copie d\'une autre version ne vaut pas celle de la liste)', spareOf(link, 'pdf-lib', '1.17.0') === null && spareOf(link, 'pdf-lib', '') === null);
}

// 4. La forme.
{
  const data = {
    'pdf-lib': copy('pdf-lib'),
    'jszip': { version: '1', src: `${GFS}/jszip.js`, forme: 'script' },                                       // sans empreinte
    'marked': copy('marked', { integrite: 'md5-abcdef==' }),                                                  // un autre algorithme
    'Excel': copy('exceljs'),                                                                                 // un nom illisible (majuscule)
    'qrcode-generator': copy('qrcode-generator', { version: 5 }),                                             // une version qui n'est pas un texte
    'docx-charts': copy('docx-charts', { src: '' }),                                                          // sans adresse
    'pdfmake': 'pas un objet',
    'exceljs': copy('exceljs', { forme: 'inconnue' }),                                                        // une forme inconnue : `script`
    'docx': copy('docx', { forme: 'module' }),                                                                // `module` est gardée telle quelle
  };
  const link = await hostedWith(context({ secours: data }));
  check('l\'entrée complète est gardée', same(spareOf(link, 'pdf-lib'), data['pdf-lib']), JSON.stringify(spareOf(link, 'pdf-lib')));
  const dropped = ['jszip', 'marked', 'Excel', 'qrcode-generator', 'docx-charts', 'pdfmake'].filter(id => spareOf(link, id) !== null);
  check('sans empreinte, d\'un autre algorithme, au nom illisible, avec une version qui n\'est pas un texte, sans adresse, ou qui n\'est pas un objet : écartée (null)', dropped.length === 0, dropped.join(', '));
  check('une forme inconnue vaut « script », « module » est gardée', spareOf(link, 'exceljs') && spareOf(link, 'exceljs').forme === 'script' && spareOf(link, 'docx') && spareOf(link, 'docx').forme === 'module', JSON.stringify({ exceljs: spareOf(link, 'exceljs'), docx: spareOf(link, 'docx') }));
}

// 5. L'événement `extensions`.
{
  const link = await hostedWith(context({ secours: { 'pdf-lib': copy('pdf-lib') } }));
  let changes = 0;
  link.GfsLink.onChange(() => { changes += 1; });
  const send = data => link.deliver({ gfs: 0, type: 'evenement', nom: 'extensions', data });
  send({ extensions: [], bibliotheques: {}, secours: { 'pdf-lib': copy('pdf-lib') } });
  check('le même secours de nouveau : rien ne change, personne n\'est rappelé', same(spareOf(link, 'pdf-lib'), copy('pdf-lib')) && changes === 0, changes);
  send({ extensions: [], bibliotheques: {}, secours: { 'pdf-lib': copy('pdf-lib', { src: `${GFS}/vendor/pdf-lib/autre.js` }), jszip: copy('jszip') } });
  check('un secours qui change seul : les copies sont remplacées, l\'abonné de `onChange` n\'est pas rappelé (rien à recharger : ce que l\'app charge ne change pas)', String((spareOf(link, 'pdf-lib') || {}).src).endsWith('/autre.js') && !!spareOf(link, 'jszip') && changes === 0, JSON.stringify({ changes, pdf: spareOf(link, 'pdf-lib') }));
  send({ extensions: [], bibliotheques: {} });
  check('l\'événement sans la clé `secours` retire les copies (comme `natives`), sans rappeler personne', spareOf(link, 'pdf-lib') === null && spareOf(link, 'jszip') === null && changes === 0, JSON.stringify({ changes, pdf: spareOf(link, 'pdf-lib') }));
  send({ extensions: [], bibliotheques: {}, secours: { 'pdf-lib': copy('pdf-lib') } });
  send({ extensions: ['graphique'], bibliotheques: { plotly: { src: `${GFS}/plotly.js`, integrite: 'sha384-' + 'B'.repeat(64), forme: 'script' } }, secours: { 'pdf-lib': copy('pdf-lib') } });
  check('un changement de bibliothèque (ou de copie figée) rappelle l\'abonné, une fois, et ne touche pas aux copies de secours', changes === 1 && same(spareOf(link, 'pdf-lib'), copy('pdf-lib')), JSON.stringify({ changes, pdf: spareOf(link, 'pdf-lib') }));
  send({ extensions: ['graphique'], bibliotheques: { plotly: { src: `${GFS}/plotly.js`, integrite: 'sha384-' + 'B'.repeat(64), forme: 'script' } }, natives: { jszip: copy('jszip') }, secours: {} });
  check('une copie figée qui change rappelle l\'abonné ; les secours vides', changes === 2 && spareOf(link, 'pdf-lib') === null, JSON.stringify({ changes }));
}

// 6. Ce qui n'est pas de GFS.
{
  const link = await hostedWith(context({ secours: { 'pdf-lib': copy('pdf-lib') } }));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'extensions', data: { extensions: [], bibliotheques: {}, secours: { 'pdf-lib': copy('pdf-lib', { src: 'https://intrus.example/x.js' }) } } }, { source: { postMessage() {} } });
  link.deliver({ gfs: 7, type: 'evenement', nom: 'extensions', data: { extensions: [], bibliotheques: {}, secours: { 'pdf-lib': copy('pdf-lib', { src: 'https://intrus.example/x.js' }) } } });
  check('un événement d\'un autre cadre ou d\'un autre contrat est ignoré', same(spareOf(link, 'pdf-lib'), copy('pdf-lib')), JSON.stringify(spareOf(link, 'pdf-lib')));
  link.deliver({ gfs: 0, type: 'reponse', id: 99, data: { secours: { 'pdf-lib': copy('pdf-lib', { src: 'https://intrus.example/x.js' }) } } });
  check('une réponse à un appel qui n\'existe pas ne change rien', same(spareOf(link, 'pdf-lib'), copy('pdf-lib')), JSON.stringify(spareOf(link, 'pdf-lib')));
}

summarizeAndExit();
