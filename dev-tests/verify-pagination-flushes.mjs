#!/usr/bin/env node
// La mise en page des coutures du rendu d'impression et du diaporama (js/reader-mode.js:placeSimpleSeamsAtOnce, EditorCore.placeReservesAtOnce) dans un VRAI Chromium - 20/11, le départ d'un diaporama
// de 79 diapositives met 25 à 35 s sous Firefox 153 (1 à 2 s sous Chromium) : le moteur y refait le style et la mise en page de TOUT l'arbre ombre à chaque feuille de style posée, réécrite ou retirée
// (1,5 s à chaque lecture qui suit, 100 000 nœuds ; un attribut, une marge en ligne, un bloc ajouté : 2 ms - la sonde du rapport de fluidité du 20/11 13:50).
//   1) UNE MISE EN PAGE PAR COUPURE : `toLayoutY` lit `clientTop` et `scrollTop` du conteneur (la mise en page), et chaque `seam.style.top` la défaisait - 77 mises en page pour 79 diapositives. Les hauteurs
//      se lisent maintenant toutes avant la première écriture : le nombre de mises en page de tout le rendu ne dépend plus du nombre de coupures (mesuré par `Performance.getMetrics`, `LayoutCount`, avec 20
//      puis 80 diapositives : le second ne coûte pas quatre fois plus) ; les coutures sont toujours aux mêmes places (une entre deux pages : 81 pages, 80 coutures, pour 80 sauts).
//   2) LES MARGES SE MESURENT EN LIGNE : le rendu d'impression et du diaporama pose les réserves des coupures sur le style des blocs le temps du calcul (aucune feuille de style posée, réécrite ni retirée par suite
//      de coupures), puis écrit la feuille des règles d'un coup. Ce que ça donne est EXACTEMENT ce que donne la feuille seule (`ReaderMode.useInlineMargins(false)`) : la même feuille de pagination, le même HTML (aucune
//      marge en ligne ne reste), chaque bloc à la même place - avec l'arrondi du moteur que le calcul prévoit mal (`round60` sous Chromium, qui rogne les suites comme Firefox le fait), avec un bloc qui a déjà sa marge en
//      ligne (il reste à la feuille) et avec une réserve que la feuille ne tiendrait pas (une règle de la page plus forte : la mise en page se refait à la feuille).
//   3) LE SUIVI DU LAG (js/perf-trace.js, temporaire) : le rendu laisse dans le rapport une ligne par suite de coupures posées d'un coup (combien, combien tenues, l'arrondi du moteur, ce qu'ont coûté les
//      lectures avant et après chaque écriture), une ligne pour toute la mise en page et une ligne pour les temps du rendu (résolution, pose, images et polices, mise en page).
// Lancé par run-headless.mjs (groupe Node « paginationFlushes », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pagination-flushes.mjs
import { open, stopServer, sleep } from './load-lib.mjs';

const PORT = Number(process.env.PAGINATION_FLUSHES_PORT || 8994);
let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name + (process.env.VERBOSE && notes !== undefined ? ' ' + JSON.stringify(notes) : ''));
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const w = await open({ spec: { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] }, port: PORT, settleMs: 1200 });
try {
  const cdp = await w.context.newCDPSession(w.page);
  await cdp.send('Performance.enable');
  const metric = async name => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === name).value;
  // Un document de `n` pages : un paragraphe puis un saut de page de présentation (`data-slide-break`) - la forme du diaporama, où toutes les coupures sont simples.
  //   options.inline : marges en ligne (défaut) ou à la feuille ; options.rounding : l'arrondi que le calcul suppose d'abord ; options.ownMargin : le rang d'un saut qui a déjà sa marge en ligne ;
  //   options.strong : une règle de la page, plus forte que la feuille, qui rend une marge de saut inopérante.
  const stageOf = (n, options = {}) => w.page.evaluate(async ([n, options]) => {
    const html = Array.from({ length: n }, (_, i) => '<p>Diapositive ' + (i + 1) + '</p><div class="page-break-marker" data-slide-break="true"' + (options.ownMargin === i ? ' style="margin-bottom: 9px"' : '') + '></div>').join('');
    const marks = PerfTrace.events().length;
    let rule = null;
    if (options.strong) { rule = document.createElement('style'); rule.textContent = '#reader-container .reader-content > .page-break-marker:nth-child(6):nth-child(6):nth-child(6) { margin-bottom: 40px; }'; document.head.appendChild(rule); }
    const wasInline = ReaderMode.useInlineMargins(options.inline !== false);
    EditorCore.reserveRoundingName(options.rounding || 'floor64');
    let job;
    try { job = await PrintExport.stage(html, null, null, null, {}); } finally { ReaderMode.useInlineMargins(wasInline); EditorCore.reserveRoundingName('floor64'); if (rule) rule.remove(); }
    const wrapper = job.stage.querySelector('.reader-content');
    const top = wrapper.getBoundingClientRect().top;
    const sheetEl = job.stage.querySelector('style.v2-pagination-style');
    const out = {
      windows: job.windows.length,
      sheet: sheetEl ? sheetEl.textContent : '',
      seams: job.stage.querySelectorAll('.v2-pagination-overlay > *').length,
      html: job.stage.innerHTML,
      tops: Array.from(wrapper.children).filter(el => el.tagName !== 'STYLE').map(el => Math.round((el.getBoundingClientRect().top - top) * 1000) / 1000),
      leftovers: wrapper.querySelectorAll('[style*="margin-bottom"]').length,
      labels: PerfTrace.events().slice(marks).filter(e => e.kind === 'mark' && /^(pagination|rendu d’impression) : /.test(e.label)).map(e => e.label),
    };
    if (window.__job) window.__job.dispose();
    window.__job = job;
    return out;
  }, [n, options]);
  const layouts = async n => {
    await w.page.evaluate(() => { if (window.__job) { window.__job.dispose(); window.__job = null; } });
    await sleep(300);
    const before = await metric('LayoutCount');
    const out = await stageOf(n);
    return Object.assign(out, { layouts: Math.round(await metric('LayoutCount') - before) });
  };
  const sameLayout = (a, b) => a.sheet === b.sheet && a.html === b.html && a.windows === b.windows && a.seams === b.seams && JSON.stringify(a.tops) === JSON.stringify(b.tops);

  console.log('\n1) une mise en page par coupure');
  const small = await layouts(20);
  const big = await layouts(80);
  console.log('  (20 diapositives :', small.layouts, 'mises en page ;', '80 :', big.layouts + ')');
  check('20 diapositives : 20 pages et la dernière (celle qui suit le saut final), une couture entre deux', small.windows === 21 && small.seams === 20, { windows: small.windows, seams: small.seams });
  check('80 diapositives : 81 pages, une couture entre deux', big.windows === 81 && big.seams === 80, { windows: big.windows, seams: big.seams });
  check('80 diapositives ne demandent pas 4 fois plus de mises en page que 20', big.layouts < small.layouts * 2 + 12, { small: small.layouts, big: big.layouts });
  check('moins d\'une mise en page pour 3 coupures (c\'était une par coupure)', big.layouts < 79 / 3, big.layouts);

  console.log('\n2) les marges se mesurent en ligne, la feuille donne les mêmes places');
  const inline = await stageOf(40);
  const sheet = await stageOf(40, { inline: false });
  console.log('  (' + inline.windows + ' pages ; ' + inline.labels.filter(l => /suite de/.test(l)).length + ' suite(s) en ligne, ' + sheet.labels.filter(l => /suite de/.test(l)).length + ' à la feuille)');
  check('en ligne : les suites de coupures se mesurent sur le style des blocs', inline.labels.some(l => /^pagination : suite de 40 coupures dès la 1e, 39 posées .* écriture\(s\) en ligne /.test(l)) && inline.labels.some(l => /\(1 mesurées en ligne\)/.test(l)), inline.labels.slice(0, 2));
  check('à la feuille : les suites écrivent des feuilles, rien en ligne', sheet.labels.some(l => /écriture\(s\) de feuille /.test(l)) && sheet.labels.some(l => /\(0 mesurées en ligne\)/.test(l)), sheet.labels.slice(0, 2));
  check('la feuille de pagination est celle de la mesure à la feuille, mot pour mot (39 règles de réserve)', inline.sheet === sheet.sheet && (inline.sheet.match(/margin-bottom/g) || []).length >= 39, { rules: (inline.sheet.match(/margin-bottom/g) || []).length });
  check('le HTML du rendu est le même, aucune marge en ligne n\'y reste, et chaque bloc est à la même place', sameLayout(inline, sheet) && inline.leftovers === 0, { leftovers: inline.leftovers, same: inline.html === sheet.html });
  const roundedInline = await stageOf(40, { rounding: 'round60' });
  const roundedSheet = await stageOf(40, { inline: false, rounding: 'round60' });
  console.log('  (arrondi supposé « round60 », que Chromium n\'applique pas : ' + roundedInline.labels.filter(l => /suite de/.test(l)).length + ' suites)');
  check('un arrondi mal prévu (les suites rognées comme sous Firefox) : en ligne ou à la feuille, mêmes places et même feuille', sameLayout(roundedInline, roundedSheet) && roundedInline.leftovers === 0 && sameLayout(roundedInline, inline), roundedInline.labels.filter(l => /suite de/.test(l)).slice(0, 3));
  const ownInline = await stageOf(40, { ownMargin: 5 });
  const ownSheet = await stageOf(40, { inline: false, ownMargin: 5 });
  check('un saut qui a déjà sa marge en ligne : la suite reste à la feuille, mêmes places qu\'à la feuille, sa marge intacte', sameLayout(ownInline, ownSheet) && /<div class="page-break-marker"[^>]*style="margin-bottom: 9px"/.test(ownInline.html) && ownInline.labels.some(l => /\(0 mesurées en ligne\)/.test(l)), { same: sameLayout(ownInline, ownSheet) });
  const strongInline = await stageOf(40, { strong: true });
  const strongSheet = await stageOf(40, { inline: false, strong: true });
  check('une règle de la page plus forte que la feuille : la mise en page se refait à la feuille, mêmes places et même feuille qu\'à la feuille', sameLayout(strongInline, strongSheet) && strongInline.leftovers === 0 && strongInline.labels.some(l => /refaite à la feuille/.test(l)), { relayout: strongInline.labels.some(l => /refaite à la feuille/.test(l)), labels: strongInline.labels.slice(0, 4) });

  console.log('\n3) le suivi du lag');
  const trace = await w.page.evaluate(() => PerfTrace.events().filter(e => e.kind === 'mark' && /^(pagination|rendu d’impression) : /.test(e.label)).map(e => e.label));
  check('une ligne pour toute la mise en page, avec ses suites', trace.some(l => /^pagination : \d+ suites ou coupures seules, \d+ suites d’un coup \(\d+ mesurées en ligne\), \d+ coupures une à une \(\d+ ms\) ; mise en page entière \d+ ms$/.test(l)), trace.slice(-3));
  check('une ligne pour les temps du rendu', trace.some(l => /^rendu d’impression : résolution \d+ ms, pose dans la page \d+ ms, images et polices \d+ ms, mise en page \d+ ms \(\d+ fois\), le reste \(tailles relues, images en attente\) -?\d+ ms$/.test(l)), trace.slice(-2));
  const errors = w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
  check('aucune erreur dans la page', errors.length === 0, errors);
} catch (e) {
  check('le scénario va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await w.close();
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
