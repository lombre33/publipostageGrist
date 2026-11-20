#!/usr/bin/env node
// La mise en page des coutures du rendu d'impression et du diaporama (js/reader-mode.js:placeSimpleSeamsAtOnce, EditorCore.placeReservesAtOnce) dans un VRAI Chromium - 20/11, le départ d'un diaporama
// de 79 diapositives met 27 s sous Firefox (1 à 2 s sous Chromium) : le moteur y refait le calcul de tout l'arbre à chaque fois que la page lui redemande la mise en page après une écriture.
//   1) UNE MISE EN PAGE PAR COUPURE : `toLayoutY` lit `clientTop` et `scrollTop` du conteneur (la mise en page), et chaque `seam.style.top` la défaisait - 77 mises en page pour 79 diapositives. Les hauteurs
//      se lisent maintenant toutes avant la première écriture : le nombre de mises en page de tout le rendu ne dépend plus du nombre de coupures (mesuré par `Performance.getMetrics`, `LayoutCount`, avec 20
//      puis 80 diapositives : le second ne coûte pas quatre fois plus) ; les coutures sont toujours aux mêmes places (une entre deux pages : 81 pages, 80 coutures, pour 80 sauts).
//   2) LE SUIVI DU LAG (js/perf-trace.js, temporaire) : le rendu laisse dans le rapport une ligne par suite de coupures posées d'un coup (combien, combien tenues, l'arrondi du moteur, ce qu'ont coûté les
//      lectures avant et après chaque écriture de feuille) et une ligne pour toute la mise en page ; la sonde (`ReaderMode.probeFlushCosts`) nomme chaque sorte d'écriture et laisse le document EXACTEMENT
//      comme il était (le même HTML, la même feuille de pagination).
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
  const stageOf = n => w.page.evaluate(async (n) => {
    const html = Array.from({ length: n }, (_, i) => '<p>Diapositive ' + (i + 1) + '</p><div class="page-break-marker" data-slide-break="true"></div>').join('');
    window.__before = performance.now();
    const job = await PrintExport.stage(html, null, null, null, {});
    const out = {
      windows: job.windows.length,
      sheet: job.stage.querySelector('style.v2-pagination-style') ? job.stage.querySelector('style.v2-pagination-style').textContent.length : 0,
      seams: job.stage.querySelectorAll('.v2-pagination-overlay > *').length,
      ms: Math.round(performance.now() - window.__before),
    };
    window.__job = job;
    return out;
  }, n);
  const layouts = async n => {
    await w.page.evaluate(() => { if (window.__job) { window.__job.dispose(); window.__job = null; } });
    await sleep(300);
    const before = await metric('LayoutCount');
    const out = await stageOf(n);
    return Object.assign(out, { layouts: Math.round(await metric('LayoutCount') - before) });
  };

  console.log('\n1) une mise en page par coupure');
  const small = await layouts(20);
  const big = await layouts(80);
  console.log('  (20 diapositives :', small.layouts, 'mises en page ;', '80 :', big.layouts + ')');
  check('20 diapositives : 20 pages et la dernière (celle qui suit le saut final), une couture entre deux', small.windows === 21 && small.seams === 20, small);
  check('80 diapositives : 81 pages, une couture entre deux', big.windows === 81 && big.seams === 80, big);
  check('80 diapositives ne demandent pas 4 fois plus de mises en page que 20', big.layouts < small.layouts * 2 + 12, { small: small.layouts, big: big.layouts });
  check('moins d\'une mise en page pour 3 coupures (c\'était une par coupure)', big.layouts < 79 / 3, big.layouts);

  console.log('\n2) le suivi du lag');
  const trace = await w.page.evaluate(() => PerfTrace.events().filter(e => e.kind === 'mark' && /^pagination : /.test(e.label)).map(e => e.label));
  console.log('  (' + trace.length + ' lignes ; la dernière : ' + (trace[trace.length - 1] || '').slice(0, 160) + ')');
  check('une ligne par suite de coupures posées d\'un coup', trace.some(l => /^pagination : suite de 80 coupures dès la 1e, 79 posées \(tenues 79, exactes 79, arrondi \w+\)/.test(l)), trace.slice(0, 3));
  check('une ligne pour toute la mise en page, avec ses suites', trace.some(l => /^pagination : \d+ suites ou coupures seules, \d+ suites d’un coup, \d+ coupures une à une \(\d+ ms\) ; mise en page entière \d+ ms$/.test(l)), trace.slice(-2));
  const probe = await w.page.evaluate(() => {
    const stage = window.__job.stage;
    const wrapper = stage.querySelector('.reader-content');
    const before = stage.innerHTML;
    const sheetBefore = wrapper.querySelector('style.v2-pagination-style').textContent;
    const line = ReaderMode.probeFlushCosts(stage, wrapper);
    return { line, same: stage.innerHTML === before, sheetSame: wrapper.querySelector('style.v2-pagination-style').textContent === sheetBefore, probes: stage.querySelectorAll('.pp-probe-style, .pp-probe-block, [data-pp-probe]').length };
  });
  console.log('  (' + probe.line + ')');
  check('la sonde nomme chaque sorte d\'écriture', /rien \d+ ; attribut posé \d+ ; attribut retiré \d+ ; marge en ligne posée \d+ ; marge en ligne retirée \d+ ; feuille ajoutée \d+ ; feuille réécrite, règle sans effet \d+ ; feuille réécrite, marge d’un bloc \d+ ; feuille retirée \d+ ; bloc ajouté \d+ ; bloc retiré \d+$/.test(probe.line), probe.line);
  check('la sonde laisse le document exactement comme il était', probe.same && probe.sheetSame && probe.probes === 0, probe);
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
