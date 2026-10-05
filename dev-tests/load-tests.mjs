#!/usr/bin/env node
// Banc de charge : le VRAI widget (index.html) dans Chromium à 700x400, face à des documents Grist de plus en plus gros (faux Grist de dev-tests/grist-stub.js, document fabriqué
// par dev-tests/load-doc.js), pour trouver ce qui casse (plafond, coupe muette, erreur), ce qui ralentit, et ce que le widget lit dans Grist à chaque geste (un fetchTable ramène la table ENTIÈRE).
// Ce n'est PAS une suite de non-régression : il mesure et signale (LENT = au-delà du budget indiqué, CASSE = un résultat faux) ; il sort 0 sauf si --strict. Hors de la passe ciblée et de la suite complète
// de run-headless.mjs (qui ne le lance que s'il est nommé : « load »).
// Usage :
//   node dev-tests/load-tests.mjs                 # toutes les sections (long : plusieurs dizaines de minutes)
//   node dev-tests/load-tests.mjs schema reads    # seulement ces sections
//   node dev-tests/load-tests.mjs schema --quick  # volumes réduits (essai de fumée)
//   node dev-tests/load-tests.mjs --out /tmp/charge.json --strict
// Sections : schema (tables et colonnes), reads (ce que chaque geste lit), batch (exports en lot), templates (nombre de modèles), content (taille d'un modèle), linked (bulles d'une autre table), zones (en-tête et pied de page),
//   loops (boucles sur les lignes liées), macro (macro-modèles), lists (listes d'interface), limits (plafonds fixes : collage d'un tableur, import Excel),
//   values (listes de valeurs, un document par valeur), internal (droits d'accès, commentaires), suivi (suggestions de suivi), sommaire (titres et sommaire)
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { open, Report, tablesSpec, columnsMix, timed, timedPaint, sleep, click, clickHoverRow, pickTemplate, fire, mode, downloadOf, exportBatchOf, status, stopServer } from './load-lib.mjs';

const argv = process.argv.slice(2);
const flags = { quick: false, strict: false, out: null };
const wanted = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--quick') flags.quick = true;
  else if (argv[i] === '--strict') flags.strict = true;
  else if (argv[i] === '--out') flags.out = argv[++i];
  else wanted.push(argv[i]);
}
const q = (full, quick) => (flags.quick ? quick : full);
const fmt = n => n.toLocaleString('fr-FR');

async function withWidget(spec, fn, opts) {
  const w = await open(Object.assign({ spec }, opts || {}));
  try { return await fn(w); } finally { await w.close(); }
}

// ===================================================================================================================================================
// schema : tables et colonnes - la liste « # », les listes de colonnes, l'ouverture
// ===================================================================================================================================================
async function schema(r) {
  const shapes = [
    { name: '40 tables x 17 col. (680)', tables: tablesSpec({ tables: 40, cols: 17, rows: 20 }), last: 'Table40.Col017', first: 'Table01.Col001' },
    { name: '1 table x 700 col.', tables: [{ id: 'Large', rows: 20, columns: columnsMix(700) }], last: 'Large.Col700', first: 'Large.Col001' },
    { name: '200 tables x 20 col. (4 000)', tables: tablesSpec({ tables: 200, cols: 20, rows: 5 }), last: 'Table200.Col020', first: 'Table001.Col001' },
    { name: '1 table x 5 000 col.', tables: [{ id: 'Huge', rows: 5, columns: columnsMix(5000) }], last: 'Huge.Col5000', first: 'Huge.Col0001' },
  ].slice(0, q(4, 2));
  for (const shape of shapes) {
    await withWidget({ tables: shape.tables }, async w => {
      const { page } = w;
      const total = await page.evaluate(() => GristAPI.getAllVariables().length);
      r.rec('schema', `${shape.name} : ouverture jusqu'à « prêt »`, w.ready - (w.seedMs || 0), { budget: 4000 });
      r.rec('schema', `${shape.name} : variables connues`, total, { unit: 'var.' });
      // L'instantané du schéma que le widget garde dans le navigateur pour retrouver un renommage (js/schema-renames.js, localStorage « pp_schema_ ») : posé, et de quel poids ?
      const snap = await page.evaluate(() => { try { return Object.keys(localStorage).filter(k => k.indexOf('pp_schema_') === 0 && k !== 'pp_schema_index').map(k => localStorage.getItem(k).length); } catch (e) { return []; } });
      r.rec('schema', `${shape.name} : instantané du schéma gardé dans le navigateur`, Math.round((snap[0] || 0) / 1024), { unit: 'Ko', ok: snap.length > 0, note: snap.length ? '' : 'aucun instantané posé (quota ou stockage refusé)' });
      // La liste « # » à la vraie frappe : combien de lignes, en combien de temps ; la dernière clé est-elle atteignable par la recherche.
      await page.evaluate(() => {
        window.__t = { key: 0, listAt: 0, count: 0 };
        document.addEventListener('keydown', e => { if (e.key === '#' && !window.__t.key) window.__t.key = performance.now(); }, true);
        new MutationObserver(() => { const n = document.querySelectorAll('.ac-items .ac-item').length; if (n && !window.__t.listAt) { window.__t.listAt = performance.now(); window.__t.count = n; } })
          .observe(document.body, { childList: true, subtree: true });
        EditorCore.getEditor().commands.focus('end');
      });
      await page.keyboard.type('#');
      await sleep(1500);
      const t = await page.evaluate(() => { const items = document.querySelectorAll('.ac-items .ac-item'); return Object.assign({}, window.__t, { rendered: items.length }); });
      r.rec('schema', `${shape.name} : liste « # » - lignes posées`, t.rendered, { unit: 'lignes', ok: t.rendered >= total, note: t.rendered >= total ? 'toutes les variables' : `${t.rendered} sur ${total} : coupe muette` });
      r.rec('schema', `${shape.name} : liste « # » - frappe -> liste posée`, t.listAt - t.key, { budget: 500 });
      // Chercher la dernière clé : la liste doit la proposer en tête.
      const tq = await page.evaluate(async key => {
        const t0 = performance.now();
        const item = () => { const el = document.querySelector('.ac-items .ac-item'); return el ? el.textContent : ''; };
        return { t0, item: item() };
      }, shape.last);
      void tq;
      const query = shape.last.toLowerCase().replace(/^[^.]*\./, ''); // la colonne seule : « col017 »
      const tk = Date.now();
      await page.keyboard.type(query, { delay: 0 });
      await page.waitForFunction(q => { const el = document.querySelector('.ac-items .ac-item'); return !!el && el.textContent.toLowerCase().includes(q); }, query, { timeout: 15000 }).catch(() => {});
      const found = await page.evaluate(() => { const items = Array.from(document.querySelectorAll('.ac-items .ac-item')); return { n: items.length, first: items[0] ? items[0].textContent : '', all: items.map(i => i.textContent) }; });
      const reaches = found.all.some(t => t.toLowerCase().includes(shape.last.toLowerCase()));
      r.rec('schema', `${shape.name} : chercher « ${query} » - temps jusqu'au résultat`, Date.now() - tk, { budget: 1500, note: `${found.n} ligne(s)` });
      r.rec('schema', `${shape.name} : la dernière clé (${shape.last}) est proposée`, reaches ? 1 : 0, { unit: '', ok: reaches });
      await page.keyboard.press('Escape');
    });
  }
  // Noms accentués ou en capitales (identifiants Grist « Prénom », « SOCIÉTÉ ») : la liste « # » les trouve sans accent ni casse, comme l'attend la personne qui tape.
  await withWidget({ tables: [{ id: 'Élèves', rows: 5, columns: [{ id: 'Prénom', type: 'Text' }, { id: 'Numéro_de_téléphone', type: 'Text' }, { id: 'SOCIÉTÉ', type: 'Text' }] }] }, async w => {
    const { page } = w;
    for (const [typed, expected] of [['prenom', 'Élèves.Prénom'], ['telephone', 'Élèves.Numéro_de_téléphone'], ['societe', 'Élèves.SOCIÉTÉ'], ['eleves', 'Élèves.Prénom']]) {
      await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.clearContent(); ed.commands.focus('end'); });
      await sleep(300);
      await page.keyboard.type('#' + typed, { delay: 20 });
      await sleep(700);
      const items = await page.evaluate(() => Array.from(document.querySelectorAll('.ac-items .ac-item')).map(i => i.textContent));
      const hit = items.some(t => t.includes(expected.split('.')[1]) && t.includes(expected.split('.')[0]));
      r.rec('schema', `noms accentués : « #${typed} » propose ${expected}`, hit ? 1 : 0, { unit: '', ok: hit, note: hit ? '' : `lignes : ${items.slice(0, 4).join(' | ')}` });
      await page.keyboard.press('Escape');
    }
  });
}


// Attend que le widget ne lise plus rien dans Grist (aucun fetchTable ni applyUserActions nouveau pendant `idleMs`).
async function settle(page, idleMs = 700, maxMs = 120000) {
  const t0 = Date.now();
  let last = -1;
  let since = Date.now();
  while (Date.now() - t0 < maxMs) {
    const n = await page.evaluate(() => window.__LOAD.fetch.calls * 1000 + window.__LOAD.apply.calls);
    if (n !== last) { last = n; since = Date.now(); }
    else if (Date.now() - since >= idleMs) return Date.now() - t0 - idleMs;
    await sleep(100);
  }
  return Date.now() - t0;
}
const cellsM = n => (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M';

// ===================================================================================================================================================
// reads : ce que chaque geste lit dans Grist (un fetchTable = la table entière) selon la taille du document
// ===================================================================================================================================================
async function reads(r) {
  const docs = [
    { name: '40 tables x 17 col. x 200 lignes', tables: tablesSpec({ tables: 40, cols: 17, rows: i => (i === 0 ? 10 : 200) }) },
    { name: '40 tables x 17 col. x 2 000 lignes', tables: tablesSpec({ tables: 40, cols: 17, rows: i => (i === 0 ? 10 : 2000) }) },
    { name: '40 tables x 17 col. x 10 000 lignes', tables: tablesSpec({ tables: 40, cols: 17, rows: i => (i === 0 ? 10 : 10000) }) },
  ].slice(0, q(3, 2));
  for (const doc of docs) {
    const cols = doc.tables[0].columns.map(c => c.id);
    const spec = { tables: doc.tables, models: { count: 3, paragraphs: 10, table: 'Table01', columns: cols } };
    await withWidget(spec, async w => {
      const { page } = w;
      const step = async (label, action, { budgetMs = null } = {}) => {
        await w.resetStats();
        const t0 = Date.now();
        await action();
        const idle = await settle(page);
        const s = await w.stats();
        r.rec('reads', `${doc.name} : ${label}`, s.fetchCells, { unit: 'cases lues', note: `${s.fetchCalls} lecture(s) de table, ${fmt(s.fetchRows)} lignes, ${Date.now() - t0 - 700} ms` });
        return s;
      };
      const open0 = await w.stats();
      r.rec('reads', `${doc.name} : ouverture (au repos)`, open0.fetchCells, { unit: 'cases lues', note: `${open0.fetchCalls} lecture(s), prêt en ${w.ready - (w.seedMs || 0)} ms` });
      await step('choisir un autre modèle', () => pickTemplate(page, 'Modèle 0002'));
      await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
      await step('premier « # » de la saisie', async () => { await page.keyboard.type('#'); });
      await page.keyboard.press('Escape');
      await step('choisir une ligne (édition)', () => fire(page, 'Table01', 3));
      await step('passer en Lecture', () => mode(page, 'read'));
      await step('autre ligne en Lecture', () => fire(page, 'Table01', 4));
      await step('PDF d’une ligne', async () => { await downloadOf(page, 'one', () => click(page, '#btn-export-pdf')); });
      await step('Word d’une ligne', async () => { await downloadOf(page, 'one', () => clickHoverRow(page, '#v2-btn-quality', '#v2-btn-export-docx')); });
      const t0 = Date.now();
      await w.resetStats();
      await exportBatchOf(page, 'pdfZip', 'lot');
      const s = await w.stats();
      r.rec('reads', `${doc.name} : lot PDF de 10 lignes - cases lues PAR LIGNE`, Math.round(s.fetchCells / 10), { unit: 'cases lues', note: `${Math.round(s.fetchCalls / 10)} lecture(s) par ligne, ${Date.now() - t0} ms le lot` });
    });
  }
}


// Surveille le fil principal pendant une opération longue : plus grand arrêt (écart d'un minuteur de 100 ms), plus haut tas JS.
async function startMonitor(page) {
  await page.evaluate(() => {
    const mon = window.__mon = { maxStall: 0, heapMax: 0, last: performance.now() };
    mon.timer = setInterval(() => {
      const now = performance.now();
      mon.maxStall = Math.max(mon.maxStall, now - mon.last - 100);
      mon.last = now;
      if (performance.memory) mon.heapMax = Math.max(mon.heapMax, performance.memory.usedJSHeapSize);
    }, 100);
  });
}
async function stopMonitor(page) {
  return page.evaluate(() => { clearInterval(window.__mon.timer); return { maxStallMs: Math.round(window.__mon.maxStall), heapMaxMb: Math.round(window.__mon.heapMax / 1048576) }; });
}
function zipEntries(file) { const out = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8' }); return (out.stdout || '').trim().split('\n').filter(Boolean).length; }
function pdfPages(file) { const out = spawnSync('pdfinfo', [file], { encoding: 'utf8' }); const m = /Pages:\s+(\d+)/.exec(out.stdout || ''); return m ? Number(m[1]) : 0; }

// ===================================================================================================================================================
// batch : exports en lot - le coût par ligne du rendu lui-même (un document d'une seule table, donc sans le coût de lecture de `reads`), la mémoire, les arrêts du fil principal
// ===================================================================================================================================================
async function batch(r) {
  const sizes = q([50, 200, 500, 1000], [20, 60]);
  const kinds = [['pdfZip', 'ZIP de PDF'], ['pdfMerged', 'PDF unique'], ['docxZip', 'ZIP de Word'], ['pdfSheets', 'PDF assemblé en feuilles']];
  for (const [kind, label] of kinds) {
    for (const n of sizes) {
      if (kind === 'docxZip' && n > 500) continue;
      if ((kind === 'pdfMerged' || kind === 'pdfSheets') && n > 500) continue;
      const cols = columnsMix(12);
      const spec = { tables: [{ id: 'Table01', rows: n, columns: cols }], models: { count: 1, paragraphs: 12, table: 'Table01', columns: cols.map(c => c.id) } };
      await withWidget(spec, async w => {
        const { page } = w;
        await pickTemplate(page, 'Modèle 0001'); await sleep(800);
        await fire(page, 'Table01', 1);
        await w.resetStats();
        await startMonitor(page);
        const t0 = Date.now();
        let out = null;
        try { out = await exportBatchOf(page, kind, 'lot-' + kind + '-' + n, { timeout: 1800000 }); } catch (e) { r.rec('batch', `${label} ${n} lignes`, e.message.split('\n')[0], { unit: '', ok: false }); }
        const mon = await stopMonitor(page);
        if (!out) return;
        const total = Date.now() - t0;
        const s = await w.stats();
        const asPdf = kind === 'pdfMerged' || kind === 'pdfSheets';
        const entries = asPdf ? pdfPages(out.file) : zipEntries(out.file);
        const complete = kind === 'pdfMerged' ? entries >= n : kind === 'pdfSheets' ? entries >= Math.ceil(n / 4) && entries <= n : entries === n;
        r.rec('batch', `${label} ${fmt(n)} lignes : durée`, total, { note: `${Math.round(total / n)} ms par ligne` });
        r.rec('batch', `${label} ${fmt(n)} lignes : fichier`, Math.round(out.size / 1024), { unit: 'Ko', note: `${Math.round(out.size / n)} o par ligne` });
        r.rec('batch', `${label} ${fmt(n)} lignes : ${asPdf ? 'pages' : 'fichiers dans l’archive'}`, entries, { unit: '', ok: complete, note: complete ? (kind === 'pdfSheets' ? `${n} pages assemblées sur ${entries} feuilles` : '') : `attendu ${n}` });
        r.rec('batch', `${label} ${fmt(n)} lignes : plus haut tas JS`, mon.heapMaxMb, { unit: 'Mo', budget: 1500 });
        r.rec('batch', `${label} ${fmt(n)} lignes : plus long arrêt de la page`, mon.maxStallMs, { budget: 3000, note: 'fil principal bloqué (la page ne répond plus)' });
        r.rec('batch', `${label} ${fmt(n)} lignes : cases lues par ligne`, Math.round(s.fetchCells / n), { unit: 'cases', note: `${(s.fetchCalls / n).toFixed(1)} lecture(s) de table par ligne` });
        await rm(out.file, { force: true });
      });
    }
  }
  await batchLogo(r);
  await batchLatency(r);
}


// Un lot dont chaque PDF porte un logo de 300 Ko (la plupart des modèles d'entreprise en ont un) : chaque fichier du ZIP embarque l'image, et tout le ZIP se construit en mémoire.
async function batchLogo(r) {
  for (const n of q([500], [40])) {
    const cols = columnsMix(12);
    const spec = { tables: [{ id: 'Table01', rows: n, columns: cols }], models: { count: 1, paragraphs: 12, table: 'Table01', columns: cols.map(c => c.id), logoKb: 300 } };
    const label = `ZIP de PDF ${fmt(n)} lignes, logo de 300 Ko`;
    await withWidget(spec, async w => {
      const { page } = w;
      await pickTemplate(page, 'Modèle 0001'); await sleep(800);
      await fire(page, 'Table01', 1);
      await w.resetStats();
      await startMonitor(page);
      const t0 = Date.now();
      let out = null;
      try { out = await exportBatchOf(page, 'pdfZip', 'lot-logo-' + n, { timeout: 1800000 }); } catch (e) { r.rec('batch', label, e.message.split('\n')[0], { unit: '', ok: false }); }
      const mon = await stopMonitor(page);
      if (!out) return;
      const total = Date.now() - t0;
      const entries = zipEntries(out.file);
      r.rec('batch', `${label} : durée`, total, { note: `${Math.round(total / n)} ms par ligne` });
      r.rec('batch', `${label} : fichier`, Math.round(out.size / 1024), { unit: 'Ko', note: `${Math.round(out.size / n / 1024)} Ko par ligne` });
      r.rec('batch', `${label} : fichiers dans l’archive`, entries, { unit: '', ok: entries === n, note: entries === n ? '' : `attendu ${n}` });
      r.rec('batch', `${label} : plus haut tas JS`, mon.heapMaxMb, { unit: 'Mo', budget: 1500, note: `${Math.round(mon.heapMaxMb / n * 10) / 10} Mo par ligne` });
      r.rec('batch', `${label} : plus long arrêt de la page`, mon.maxStallMs, { budget: 3000, note: 'fil principal bloqué (la page ne répond plus)' });
      await rm(out.file, { force: true });
    });
  }
}

// Le même lot si chaque lecture de Grist coûte 100 ms d'attente (réseau et serveur) : le lot paie ses 3 lectures de table par ligne l'une après l'autre.
async function batchLatency(r) {
  for (const n of q([200], [20])) {
    const cols = columnsMix(12);
    const spec = { latency: 100, tables: [{ id: 'Table01', rows: n, columns: cols }], models: { count: 1, paragraphs: 12, table: 'Table01', columns: cols.map(c => c.id) } };
    await withWidget(spec, async w => {
      const { page } = w;
      await pickTemplate(page, 'Modèle 0001'); await sleep(800);
      await fire(page, 'Table01', 1);
      await w.resetStats();
      const t0 = Date.now();
      const out = await exportBatchOf(page, 'pdfZip', 'lot-latence', { timeout: 1800000 });
      const total = Date.now() - t0;
      const s = await w.stats();
      r.rec('batch', `ZIP de PDF ${fmt(n)} lignes, 100 ms d'attente par lecture : durée`, total, { note: `${Math.round(total / n)} ms par ligne (sans attente : voir plus haut), ${(s.fetchCalls / n).toFixed(1)} lecture(s) de table par ligne` });
      await rm(out.file, { force: true });
    });
  }
}

// ===================================================================================================================================================
// content : la taille d'UN modèle (pages, bulles, tableau, images) - chargement, frappe, Lecture, PDF, Word
// ===================================================================================================================================================
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
// Construit dans la page le HTML d'un modèle : `pages` pages de texte (17 paragraphes de 240 signes par page, soit une page A4 en PDF), `bubbles` bulles réparties, un tableau de `tableRows` lignes, `images` images.
const BUILD_DOC = `
  const { pages = 0, bubbles = 0, tableRows = 0, tableCols = 6, images = 0, lorem, cols, table, headings = 0 } = arg;
  const badge = (c) => '<span class="var-badge" data-table="' + table + '" data-column="' + c + '" data-key="' + table + '.' + c + '"></span>';
  let html = '';
  const paragraphs = pages * 17;
  const perPara = paragraphs ? Math.ceil(bubbles / paragraphs) : 0;
  let placed = 0;
  for (let p = 0; p < paragraphs; p++) {
    let line = '';
    for (let b = 0; b < perPara && placed < bubbles; b++, placed++) line += ' ' + badge(cols[placed % cols.length]);
    html += (headings && p % Math.max(1, Math.floor(paragraphs / headings)) === 0 ? '<h2>Titre ' + p + '</h2>' : '') + '<p>Paragraphe ' + (p + 1) + '. ' + lorem + line + '</p>';
  }
  if (!paragraphs && bubbles) { for (let b = 0; b < bubbles; b++) html += '<p>' + badge(cols[b % cols.length]) + '</p>'; }
  if (tableRows) {
    html += '<table><tbody><tr>' + Array.from({ length: tableCols }, (_, c) => '<th><p>Colonne ' + (c + 1) + '</p></th>').join('') + '</tr>';
    for (let r = 0; r < tableRows; r++) html += '<tr>' + Array.from({ length: tableCols }, (_, c) => '<td><p>Ligne ' + (r + 1) + ' case ' + (c + 1) + '</p></td>').join('') + '</tr>';
    html += '</tbody></table>';
  }
  for (let i = 0; i < images; i++) html += '<p><img class="editor-image" alt="Image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" style="width: 80px" data-layer="normal" data-wrap="inline"></p>';
  return html;`;

async function measureTyping(page, keys = 24) {
  await page.evaluate(() => {
    window.__lt = [];
    try { window.__ltObs && window.__ltObs.disconnect(); window.__ltObs = new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))); window.__ltObs.observe({ entryTypes: ['longtask'] }); } catch (e) { /* longtask indisponible */ }
    const ed = EditorCore.getEditor();
    ed.commands.focus(Math.max(1, Math.floor(ed.state.doc.content.size / 2)));
  });
  await sleep(300);
  await page.evaluate(() => { window.__lt.length = 0; });
  const t0 = Date.now();
  for (let i = 0; i < keys; i++) await page.keyboard.press(i % 7 === 6 ? ' ' : 'a');
  const perKey = (Date.now() - t0) / keys;
  await sleep(1200); // les traitements différés de la frappe (pagination, mise en page) passent dans les tâches longues
  const lt = await page.evaluate(() => window.__lt.slice());
  return { perKey, longTaskTotal: lt.reduce((a, b) => a + b, 0), longTaskMax: lt.reduce((a, b) => Math.max(a, b), 0) };
}

// Une valeur lue dans la page qui ne bouge plus pendant `quietMs` (la mise en page se termine après le chargement : sans attente, on lit un état intermédiaire).
async function stableCount(page, fn, quietMs = 800, maxMs = 180000) {
  const code = '(' + fn.toString() + ')()';
  let last = null;
  let since = Date.now();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const n = await page.evaluate(code);
    if (n !== last) { last = n; since = Date.now(); } else if (Date.now() - since >= quietMs) return n;
    await sleep(150);
  }
  return last;
}

// Attend que le fil principal de la page soit libre `freeMs` d'affilée. La Lecture, puis le retour à l'éditeur, lancent chacun une mise en page REPOUSSÉE après que le texte est à
// l'écran : sans cette attente elle bloquerait le geste suivant (un PDF, par exemple) et se compterait dans sa durée. Renvoie le temps attendu, sans la fenêtre libre finale.
async function freeMain(page, freeMs = 1500, maxMs = 300000) {
  const t0 = Date.now();
  const step = 300;
  let free = 0;
  while (Date.now() - t0 < maxMs) {
    const late = await page.evaluate(ms => new Promise(res => { const t = performance.now(); setTimeout(() => res(performance.now() - t - ms), ms); }), step);
    free = late < 120 ? free + step : 0;
    if (free >= freeMs) return Date.now() - t0 - freeMs;
  }
  return Date.now() - t0;
}

// La Lecture : { ms (texte à l'écran, lectures de Grist finies), freeMs (page de nouveau libre), backMs (retour à l'éditeur, page libre) }.
async function readerMs(page) {
  await page.evaluate(() => { document.getElementById('reader-container').innerHTML = ''; });
  const t0 = Date.now();
  await page.evaluate(() => document.getElementById('btn-mode-read').click());
  await page.waitForFunction(() => { const rc = document.querySelector('#reader-container .reader-content'); return !!rc && rc.textContent.length > 0; }, null, { timeout: 300000 });
  await settle(page, 400);
  const ms = Date.now() - t0 - 400;
  const freeMs = ms + await freeMain(page);
  const t1 = Date.now();
  await page.evaluate(() => document.getElementById('btn-mode-edit').click());
  await freeMain(page);
  return { ms, freeMs, backMs: Date.now() - t1 - 1500 };
}

async function content(r) {
  const cols = columnsMix(12);
  const spec = { tables: [{ id: 'Table01', rows: 50, columns: cols }] };
  const colIds = cols.map(c => c.id);
  const scenarios = [
    ...q([1, 10, 30, 60, 120], [1, 10]).map(pages => ({ label: `${pages} page(s) de texte`, arg: { pages } })),
    ...q([100, 500, 2000], [100, 500]).map(bubbles => ({ label: `${fmt(bubbles)} bulles sur 10 pages`, arg: { pages: 10, bubbles } })),
    ...q([100, 500, 1000, 1500, 2000], [100]).map(rows => ({ label: `tableau de ${fmt(rows)} lignes x 6`, arg: { tableRows: rows } })),
    ...q([20, 100, 400], [20]).map(images => ({ label: `${images} images`, arg: { images } })),
  ];
  await withWidget(spec, async w => {
    const { page } = w;
    await fire(page, 'Table01', 1);
    for (const sc of scenarios) {
      const arg = Object.assign({ lorem: LOREM, cols: colIds, table: 'Table01' }, sc.arg);
      const built = await page.evaluate(({ code, arg }) => { const h = new Function('arg', code)(arg); return h.length; }, { code: BUILD_DOC, arg });
      const set = await timedPaint(page, `const html = new Function('arg', ${JSON.stringify(BUILD_DOC)})(arg); Editor.setHTML(html); await new Promise(r => setTimeout(r, 50)); return html.length;`, arg);
      const seams = await stableCount(page, () => document.querySelectorAll('#editor-container .v2-page-band').length + 1);
      r.rec('content', `${sc.label} : chargement dans l'éditeur`, set.ms, { budget: 3000, note: `${fmt(built)} caractères, ${seams} page(s) affichée(s)` });
      const typing = await measureTyping(page);
      r.rec('content', `${sc.label} : frappe (par touche, au milieu)`, typing.perKey, { budget: 150, note: `tâches longues : ${Math.round(typing.longTaskTotal)} ms au total, ${Math.round(typing.longTaskMax)} ms au plus` });
      const ser = await timed(page, 'const h = Editor.getHTML(); return h.length;');
      r.rec('content', `${sc.label} : sérialisation (enregistrement automatique)`, ser.ms, { budget: 500 });
      if (sc.arg.pages !== undefined && sc.arg.pages >= q(30, 10)) {
        // Ctrl+F : la première lettre tapée cherche dans tout le document (aucun plafond de correspondances) ; au-delà de 500 résultats, seuls ceux de l'écran et de ses abords sont surlignés.
        const fr = await timedPaint(page, 'const ed = EditorCore.getEditor(); const t0 = performance.now(); const n = FindReplace.findMatches(ed.state.doc, arg.q, {}).length; const scan = performance.now() - t0; FindReplace.open(); FindReplace.setQuery(arg.q); return { n, scan, marked: document.querySelectorAll(".tiptap .pp-find-match").length };', { q: 'e' });
        r.rec('content', `${sc.label} : Ctrl+F, première lettre « e » tapée`, fr.ms, { budget: 500, note: `${fmt(fr.value.n)} correspondances, ${fmt(fr.value.marked)} surlignées, balayage seul ${Math.round(fr.value.scan)} ms` });
        const typingFind = await measureTyping(page);
        r.rec('content', `${sc.label} : frappe (par touche, au milieu) avec la recherche ouverte`, typingFind.perKey, { budget: 150, note: `tâches longues : ${Math.round(typingFind.longTaskTotal)} ms au total, ${Math.round(typingFind.longTaskMax)} ms au plus` });
        await page.evaluate(() => { FindReplace.setQuery(''); FindReplace.close(); });
        await sleep(300);
      }
      const rd = await readerMs(page);
      r.rec('content', `${sc.label} : Lecture`, rd.ms, { budget: 5000, note: 'texte à l’écran' });
      r.rec('content', `${sc.label} : Lecture - page de nouveau libre`, rd.freeMs, { budget: 10000, note: 'fil principal libre : mise en page de la Lecture finie' });
      r.rec('content', `${sc.label} : retour de la Lecture à l'éditeur (page libre)`, rd.backMs, { budget: 5000 });
      if (sc.arg.pages === undefined || sc.arg.pages <= q(120, 10)) {
        const pdf = await downloadOf(page, 'content', () => click(page, '#btn-export-pdf'), 900000);
        r.rec('content', `${sc.label} : PDF`, pdf.ms, { budget: 30000, note: `${pdfPages(pdf.file)} page(s), ${Math.round(pdf.size / 1024)} Ko` });
        // Une coupe muette se verrait ici : la fin du document est-elle écrite dans le fichier ?
        const endMark = sc.arg.pages !== undefined ? 'Paragraphe ' + (sc.arg.pages * 17) + '.' : (sc.arg.tableRows ? 'Ligne ' + sc.arg.tableRows + ' case 6' : null);
        if (endMark) { const found = pdfText(pdf.file).includes(endMark); r.rec('content', `${sc.label} : PDF - la fin du document est écrite`, found ? 1 : 0, { unit: '', ok: found, note: '« ' + endMark + ' »' }); }
        await rm(pdf.file, { force: true });
        if (sc.arg.pages !== undefined && sc.arg.pages <= q(120, 10)) {
          const docx = await downloadOf(page, 'content', () => clickHoverRow(page, '#v2-btn-quality', '#v2-btn-export-docx'), 900000);
          r.rec('content', `${sc.label} : Word`, docx.ms, { budget: 30000, note: `${Math.round(docx.size / 1024)} Ko` });
          if (endMark) { const found = docxText(docx.file).includes(endMark); r.rec('content', `${sc.label} : Word - la fin du document est écrite`, found ? 1 : 0, { unit: '', ok: found, note: '« ' + endMark + ' »' }); }
          await rm(docx.file, { force: true });
        }
      }
      r.rec('content', `${sc.label} : tas JS`, await w.heapMb(), { unit: 'Mo', budget: 1000 });
    }
  });
}


// ===================================================================================================================================================
// templates : le nombre et le poids des modèles enregistrés - ouverture, liste, rangement, enregistrement automatique (qui relit TOUTE la table des modèles)
// ===================================================================================================================================================
async function templates(r) {
  const mb = chars => Math.round(chars / 1048576 * 10) / 10;
  const scenarios = [
    ...q([50, 200, 1000], [50, 200]).map(count => ({ label: `${fmt(count)} modèles de 7 Ko`, models: { count, paragraphs: 20, extraChars: 4000, folders: Math.max(3, Math.round(count / 12)), depth: 2, pinned: 5 } })),
    ...q([20, 60], [20]).map(count => ({ label: `${count} modèles de 1,6 Mo (4 images de 400 Ko chacun)`, models: { count, paragraphs: 10, images: 4, imageChars: 400000, folders: 4, depth: 1, pinned: 2 } })),
  ];
  for (const sc of scenarios) {
    const tables = tablesSpec({ tables: 2, cols: 10, rows: 20 });
    const cols = tables[0].columns.map(c => c.id);
    const spec = { tables, models: Object.assign({ table: 'Table01', columns: cols }, sc.models) };
    await withWidget(spec, async w => {
      const { page } = w;
      const count = sc.models.count;
      const start = await w.stats();
      r.rec('templates', `${sc.label} : ouverture jusqu'à « prêt »`, w.ready - (w.seedMs || 0), { budget: 5000, note: `${mb(start.modelChars)} Mo de modèles lus à l'ouverture (${start.fetchCalls} lectures de tables)` });
      // La liste des modèles : combien de lignes, en combien de temps.
      const t0 = Date.now();
      await click(page, '.tts-trigger');
      await page.waitForFunction(() => document.querySelectorAll('.tts-popup .tts-row-leaf').length > 0, null, { timeout: 60000 });
      const openMs = Date.now() - t0;
      const rowsShown = await page.evaluate(() => ({ leaves: document.querySelectorAll('.tts-popup .tts-row-leaf').length, folders: document.querySelectorAll('.tts-popup .tts-row-folder').length, search: !!document.querySelector('.tts-popup input[type=search], .tts-popup input[type=text]') }));
      r.rec('templates', `${sc.label} : liste des modèles - ouverture`, openMs, { budget: 1000, note: `${rowsShown.leaves} modèles et ${rowsShown.folders} dossiers posés, champ de recherche dans la liste : ${rowsShown.search ? 'oui' : 'non'}` });
      r.rec('templates', `${sc.label} : liste des modèles - tous présents`, rowsShown.leaves, { unit: 'lignes', ok: rowsShown.leaves >= count, note: rowsShown.leaves >= count ? '' : `${rowsShown.leaves} sur ${count}` });
      // Choisir le dernier modèle du dernier dossier.
      await page.keyboard.press('Escape'); await sleep(300);
      const last = 'Modèle ' + String(count).padStart(4, '0');
      await w.resetStats();
      const tp = Date.now();
      await pickTemplate(page, last);
      r.rec('templates', `${sc.label} : choisir un modèle`, Date.now() - tp - 700, { budget: 3000, note: `${mb((await w.stats()).modelChars)} Mo de modèles relus` });
      // Au repos : combien l'enregistrement automatique relit-il en une minute ? L'attente suit le poids de la table (js/main.js, autosaveIdleIntervalMs : 15 s, une milliseconde pour 100 caractères
      // lus, 3 minutes au plus) : le budget est le nombre de lectures que cette attente laisse passer en une minute, plus une.
      const loadedChars = await page.evaluate(() => Templates.getLoadedChars());
      const expectedWaitMs = Math.min(180000, Math.max(15000, Math.ceil(loadedChars / 100)));
      await w.resetStats();
      await sleep(q(31000, 16000));
      const idle = await w.stats();
      const idleSeconds = q(31, 16);
      r.rec('templates', `${sc.label} : au repos, lectures de la table des modèles par minute`, Math.round(idle.fetchCalls / idleSeconds * 60 * 10) / 10, { unit: 'lectures/min', budget: Math.ceil(60000 / expectedWaitMs) + 1, note: `${mb(idle.modelChars / idleSeconds * 60)} Mo par minute, rien d'écrit (${idle.applyCalls} écriture(s)) ; table de ${mb(loadedChars)} Mo : attente prévue ${Math.round(expectedWaitMs / 1000)} s` });
      // En tapant : un passage de l'enregistrement automatique relit tout, écrit le modèle, relit encore.
      await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
      await w.resetStats();
      await page.keyboard.type('x');
      await page.waitForFunction(() => window.__LOAD.apply.calls > 0, null, { timeout: 60000 }).catch(() => {});
      await settle(page, 1500);
      const dirty = await w.stats();
      r.rec('templates', `${sc.label} : un passage d'enregistrement automatique - Mo de modèles relus`, mb(dirty.modelChars), { unit: 'Mo', note: `${dirty.fetchCalls} lecture(s) de la table, ${mb(dirty.applyChars)} Mo écrits`, budget: 20 });
      const heap = await w.heapMb();
      r.rec('templates', `${sc.label} : tas JS`, heap, { unit: 'Mo', budget: 1000 });
    });
  }
}

// ===================================================================================================================================================
// linked : les bulles d'une AUTRE table (la fiche client d'une facture) - la table liée est-elle relue à chaque bulle ? (Lecture : lectures partagées ; exports : aucune mémoire)
// ===================================================================================================================================================
function invoiceTables({ invoices, clients, lines = 0, clientCols = 12 }) {
  const tables = [
    { id: 'Factures', rows: invoices, columns: [{ id: 'Numero', type: 'Text' }, { id: 'Client', type: 'Ref:Clients', shows: 'Col001' }, { id: 'Montant', type: 'Numeric' }, { id: 'Date', type: 'Date' }] },
    { id: 'Clients', rows: clients, columns: columnsMix(clientCols) },
  ];
  if (lines) tables.push({ id: 'Lignes', rows: lines, columns: [{ id: 'Facture', type: 'Ref:Factures', constant: 1 }, { id: 'Designation', type: 'Text' }, { id: 'Qte', type: 'Int' }, { id: 'Prix', type: 'Numeric' }, { id: 'Montant', type: 'Numeric' }] });
  return tables;
}
// Lectures d'une table depuis le dernier resetStats : { calls, cells, all } (all = toutes tables confondues).
async function readsOf(w, table) { const s = await w.stats(); const t = (s.byTable && s.byTable[table]) || { calls: 0, cells: 0 }; return { calls: t.calls, cells: t.cells, all: s.fetchCells, allCalls: s.fetchCalls }; }
// La Lecture, une fois : durée jusqu'au texte attendu (null : jamais venu), puis retour en édition.
async function readOnce(page, expect, timeout = 300000, limit = 20000) {
  await page.evaluate(() => { document.getElementById('reader-container').innerHTML = ''; });
  const t0 = Date.now();
  await page.evaluate(() => document.getElementById('btn-mode-read').click());
  let ok = true;
  try { await page.waitForFunction(e => { const rc = document.querySelector('#reader-container .reader-content'); return !!rc && (!e || rc.textContent.includes(e)); }, expect || null, { timeout }); } catch (e) { ok = false; }
  const ms = Date.now() - t0;
  await settle(page, 400);
  const freeMs = ms + await freeMain(page);
  const text = await page.evaluate(() => (document.querySelector('#reader-container') || { textContent: '' }).textContent);
  const t1 = Date.now();
  await page.evaluate(() => document.getElementById('btn-mode-edit').click());
  await freeMain(page);
  return { ms, ok, text: text.slice(0, limit), freeMs, backMs: Date.now() - t1 - 1500 };
}

async function linked(r) {
  const cases = q([[200, 1, 10], [200, 15, 10], [2000, 15, 10], [10000, 15, 10], [10000, 60, 10], [2000, 15, 10000]], [[200, 15, 10], [2000, 15, 10], [2000, 15, 2000]]);
  for (const [clients, bubbles, invoices] of cases) {
    const tables = invoiceTables({ invoices, clients });
    const spec = { tables, models: { count: 1, paragraphs: bubbles, table: 'Clients', columns: tables[1].columns.map(c => c.id) } };
    const label = `${fmt(clients)} clients (12 col.), ${fmt(invoices)} factures, modèle de ${bubbles} bulle(s) de la fiche client`;
    await withWidget(spec, async w => {
      const { page } = w;
      await pickTemplate(page, 'Modèle 0001'); await sleep(800);
      await fire(page, 'Factures', 3);
      const expect = await page.evaluate(() => { const st = window.__gristStub; const inv = st.getRow('Factures', 3); return st.getRow('Clients', inv.Client).Col001; });
      // Lecture (lectures partagées le temps d'un rendu).
      await w.resetStats();
      const rd = await readOnce(page, expect);
      const lec = await readsOf(w, 'Clients');
      r.rec('linked', `${label} : Lecture - lectures de la table Clients`, lec.calls, { unit: 'lecture(s)', budget: 2, note: `${rd.ms} ms, ${fmt(lec.all)} cases lues en tout` });
      r.rec('linked', `${label} : Lecture - la valeur de la fiche client est écrite`, rd.ok ? 1 : 0, { unit: '', ok: rd.ok, note: rd.ok ? '' : `« ${expect} » absent après ${rd.ms} ms` });
      // Autre ligne de la page, toujours en Lecture : la table de la page est relue en entier pour y trouver la référence du client.
      if (invoices > 100) {
        await page.evaluate(() => document.getElementById('btn-mode-read').click());
        await sleep(1500);
        await w.resetStats();
        const t1 = Date.now();
        await fire(page, 'Factures', 4);
        await settle(page);
        const nxt = await w.stats();
        const fa = (nxt.byTable.Factures || { calls: 0, cells: 0 });
        r.rec('linked', `${label} : autre ligne en Lecture - cases lues`, nxt.fetchCells, { unit: 'cases lues', note: `${nxt.fetchCalls} lecture(s) de table dont ${fa.calls} de Factures (${fmt(fa.cells)} cases), ${Date.now() - t1 - 700} ms` });
        await page.evaluate(() => document.getElementById('btn-mode-edit').click());
        await sleep(600);
      }
      // PDF de la ligne courante : aucune mémoire d'une bulle à l'autre.
      await w.resetStats();
      const pdf = await downloadOf(page, 'linked', () => click(page, '#btn-export-pdf'));
      await settle(page);
      const one = await readsOf(w, 'Clients');
      r.rec('linked', `${label} : PDF d'une ligne - lectures de la table Clients`, one.calls, { unit: 'lecture(s)', budget: 2, note: `${fmt(one.all)} cases lues en tout, ${one.allCalls} lectures de tables` });
      r.rec('linked', `${label} : PDF d'une ligne - durée`, pdf.ms, { budget: 8000 });
      await rm(pdf.file, { force: true });
      // Lot : les 10 factures (pas pour une table de page de plusieurs milliers de lignes : le lot les prendrait toutes).
      if (invoices > 100) return;
      await w.resetStats();
      const t0 = Date.now();
      let out = null;
      try { out = await exportBatchOf(page, 'pdfZip', 'linked-lot', { timeout: 900000 }); } catch (e) { r.rec('linked', `${label} : lot de 10 PDF`, e.message.split('\n')[0], { unit: '', ok: false }); }
      if (out) {
        await settle(page);
        const b = await readsOf(w, 'Clients');
        r.rec('linked', `${label} : lot de 10 PDF - lectures de Clients PAR LIGNE`, Math.round(b.calls / 10 * 10) / 10, { unit: 'lecture(s)', budget: 2, note: `${Math.round((Date.now() - t0) / 10)} ms par ligne, ${fmt(Math.round(b.all / 10))} cases lues par ligne` });
        await rm(out.file, { force: true });
      }
    });
  }
}

// ===================================================================================================================================================
// loops : une boucle sur les lignes liées d'une facture (lignes d'un tableau), SOMME - Lecture, PDF
// ===================================================================================================================================================
const LOOP_DOC = `
  const attr = (n, v) => ' ' + n + '="' + JSON.stringify(v).replace(/"/g, '&quot;') + '"';
  const badge = (t, c, loop) => '<span class="var-badge" data-table="' + t + '" data-column="' + c + '" data-key="' + t + '.' + c + '"' + (loop ? attr('data-loop', loop) + ' data-loop-repeat="' + loop.repeat + '"' : '') + '></span>';
  const calc = f => '<span class="calc-badge" data-formula="' + f.replace(/"/g, '&quot;') + '"></span>';
  const cell = (c, tag) => '<' + (tag || 'td') + '><p>' + c + '</p></' + (tag || 'td') + '>';
  if (arg.kind === 'inline') return '<h1>Facture ' + badge('Factures', 'Numero') + '</h1><p>Produits : ' + badge('Lignes', 'Designation', { repeat: 'inline', table: 'Lignes', empty: 'hide', separator: ', ', lastSeparator: ' et ' }) + '.</p>';
  const loop = { repeat: 'row', table: 'Lignes', empty: 'header' };
  return '<h1>Facture ' + badge('Factures', 'Numero') + '</h1><p>Client : ' + badge('Factures', 'Client') + '</p>'
    + '<table><tbody><tr>' + ['Désignation', 'Qté', 'Prix', 'Montant'].map(h => cell(h, 'th')).join('') + '</tr>'
    + '<tr>' + cell(badge('Lignes', 'Designation', loop)) + cell(badge('Lignes', 'Qte')) + cell(badge('Lignes', 'Prix')) + cell(badge('Lignes', 'Montant')) + '</tr></tbody></table>'
    + '<p>Total : ' + calc('SUM({Lignes.Prix} * {Lignes.Qte})') + '</p>';`;

// Le texte d'un PDF, blancs réduits à un espace (une case étroite coupe sa phrase sur deux lignes).
function docxText(file) { const out = spawnSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); return (out.stdout || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' '); }
function pdfText(file) { const out = spawnSync('pdftotext', [file, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); return (out.stdout || '').replace(/\s+/g, ' '); }

async function loops(r) {
  const plans = [
    ...q([10, 100, 500, 2000], [10, 100]).map(lines => ({ kind: 'row', lines })),
    ...q([100, 2000], [100]).map(lines => ({ kind: 'inline', lines })),
  ];
  for (const plan of plans) {
    const tables = [
      { id: 'Factures', rows: 3, columns: [{ id: 'Numero', type: 'Text' }, { id: 'Client', type: 'Text' }] },
      { id: 'Lignes', rows: plan.lines, columns: [{ id: 'Facture', type: 'Ref:Factures', constant: 1 }, { id: 'Designation', type: 'Text' }, { id: 'Qte', type: 'Int' }, { id: 'Prix', type: 'Numeric' }, { id: 'Montant', type: 'Numeric' }] },
    ];
    const spec = { tables, links: [{ table: 'Lignes', mode: 'match', target: 'Facture', source: 'id' }] };
    const label = plan.kind === 'row' ? `facture de ${fmt(plan.lines)} lignes (boucle sur les lignes du tableau)` : `${fmt(plan.lines)} produits dans une phrase (boucle « dans la phrase »)`;
    await withWidget(spec, async w => {
      const { page } = w;
      await fire(page, 'Factures', 1);
      const html = await page.evaluate(({ code, arg }) => new Function('arg', code)(arg), { code: LOOP_DOC, arg: plan });
      await page.evaluate(h => { Editor.setHTML(h); }, html);
      await sleep(800);
      const last = await page.evaluate(n => window.__gristStub.getRow('Lignes', n).Designation, plan.lines);
      await w.resetStats();
      const rd = await readOnce(page, last, 600000);
      r.rec('loops', `${label} : Lecture`, rd.ms, { budget: 5000, note: rd.ok ? 'dernière ligne écrite' : 'la dernière ligne n’est jamais écrite' });
      r.rec('loops', `${label} : Lecture - page de nouveau libre`, rd.freeMs, { budget: 10000, note: `retour à l'éditeur : ${rd.backMs} ms` });
      r.rec('loops', `${label} : Lecture - la dernière ligne est écrite`, rd.ok ? 1 : 0, { unit: '', ok: rd.ok });
      const lec = await w.stats();
      r.rec('loops', `${label} : Lecture - cases lues`, lec.fetchCells, { unit: 'cases lues', note: `${lec.fetchCalls} lecture(s) de table` });
      await w.resetStats();
      const pdf = await downloadOf(page, 'loop', () => click(page, '#btn-export-pdf'), 900000);
      const text = pdfText(pdf.file);
      const found = text.includes(last);
      r.rec('loops', `${label} : PDF`, pdf.ms, { budget: 20000, note: `${pdfPages(pdf.file)} page(s), ${Math.round(pdf.size / 1024)} Ko` });
      r.rec('loops', `${label} : PDF - la dernière ligne est écrite`, found ? 1 : 0, { unit: '', ok: found });
      const exp = await w.stats();
      r.rec('loops', `${label} : PDF - cases lues`, exp.fetchCells, { unit: 'cases lues', note: `${exp.fetchCalls} lecture(s) de table` });
      await rm(pdf.file, { force: true });
      r.rec('loops', `${label} : tas JS`, await w.heapMb(), { unit: 'Mo', budget: 1000 });
    });
  }
}

// ===================================================================================================================================================
// macro : un macro-modèle (positions fixes et positions à règles) - Lecture, PDF, lot
// ===================================================================================================================================================
async function macro(r) {
  const plans = q([[5, 0, 'Numero'], [20, 5, 'Numero'], [20, 5, 'Clients.Col001'], [50, 10, 'Clients.Col001']], [[5, 0, 'Numero'], [20, 5, 'Clients.Col001']]);
  for (const [slots, rules, column] of plans) {
    const tables = invoiceTables({ invoices: 10, clients: 2000 });
    const spec = { tables, models: { count: 20, paragraphs: 8, table: 'Factures', columns: ['Numero'], macro: { slots, rules, column } } };
    const label = `macro-modèle de ${slots} position(s)${rules ? `, ${rules} règle(s) chacune sur ${column === 'Numero' ? 'la table de la page' : 'la fiche client (autre table)'}` : ' fixes'}`;
    await withWidget(spec, async w => {
      const { page } = w;
      await pickTemplate(page, 'Macro A'); await sleep(800);
      await fire(page, 'Factures', 3);
      await w.resetStats();
      const rd = await readOnce(page, 'Paragraphe 1 du modèle');
      const lec = await w.stats();
      r.rec('macro', `${label} : Lecture`, rd.ms, { budget: 5000, note: `${lec.fetchCalls} lecture(s) de table, ${fmt(lec.fetchCells)} cases lues` });
      r.rec('macro', `${label} : Lecture - le document est assemblé`, rd.ok ? 1 : 0, { unit: '', ok: rd.ok });
      await w.resetStats();
      const pdf = await downloadOf(page, 'macro', () => click(page, '#btn-export-pdf'), 900000);
      await settle(page);
      const one = await w.stats();
      r.rec('macro', `${label} : PDF d'une ligne - lectures de table`, one.fetchCalls, { unit: 'lecture(s)', budget: 10, note: `${pdf.ms} ms, ${pdfPages(pdf.file)} page(s), ${fmt(one.fetchCells)} cases lues` });
      await rm(pdf.file, { force: true });
      await w.resetStats();
      const t0 = Date.now();
      let out = null;
      try { out = await exportBatchOf(page, 'pdfZip', 'macro-lot', { timeout: 1200000 }); } catch (e) { r.rec('macro', `${label} : lot de 10 PDF`, e.message.split('\n')[0], { unit: '', ok: false }); }
      if (out) {
        await settle(page);
        const b = await w.stats();
        r.rec('macro', `${label} : lot de 10 PDF - lectures de table PAR LIGNE`, Math.round(b.fetchCalls / 10), { unit: 'lecture(s)', budget: 10, note: `${Math.round((Date.now() - t0) / 10)} ms par ligne, ${fmt(Math.round(b.fetchCells / 10))} cases lues par ligne` });
        await rm(out.file, { force: true });
      }
    });
  }
}

// ===================================================================================================================================================
// lists : les listes de l'interface à gros volume - colonne d'une règle (toutes les tables à plat), valeurs d'une Référence, abréviations, formats de page
// ===================================================================================================================================================
// Ouvre la fenêtre « Condition » sur une bulle de la page et rend ce qu'elle montre : durée d'ouverture, nombre d'options du champ Colonne.
const OPEN_CONDITION = `
  const ed = EditorCore.getEditor();
  let pos = -1;
  ed.state.doc.descendants((node, p) => { if (pos < 0 && node.type.name === 'varBadge') pos = p; });
  const t0 = performance.now();
  VariableCondition.open(ed, pos);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sel = document.querySelector('.macro-rule-column');
  return { ms: performance.now() - t0, options: sel ? sel.options.length : -1, values: sel ? Array.from(sel.options).map(o => o.value).slice(0, 3) : [] };`;
// Ouvre la liste avec recherche de `selector` (le champ natif masqué) et rend les lignes posées, la ligne « Encore N », la durée.
async function openSearchList(page, nativeSelector) {
  const trigger = await page.evaluate(sel => { const s = document.querySelector(sel); const t = s && s.parentElement && s.parentElement.querySelector('.ss-trigger'); if (!t) return null; const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, nativeSelector);
  if (!trigger) return null;
  const t0 = Date.now();
  await page.mouse.move(trigger.x - 10, trigger.y); await page.mouse.move(trigger.x, trigger.y, { steps: 2 });
  await page.mouse.click(trigger.x, trigger.y);
  await page.waitForFunction(() => !!document.querySelector('.ss-panel .ss-option'), null, { timeout: 60000 }).catch(() => {});
  const ms = Date.now() - t0;
  const out = await page.evaluate(() => { const rows = document.querySelectorAll('.ss-panel .ss-option').length; const more = document.querySelector('.ss-panel .ss-more'); return { rows, more: more ? more.textContent : '' }; });
  return Object.assign({ ms }, out);
}

async function lists(r) {
  // --- 1. la colonne d'une règle (macro-modèle, condition) : une liste à plat de toutes les colonnes de toutes les tables
  const shapes = [
    { name: '40 tables x 17 col. (680 colonnes)', tables: tablesSpec({ tables: 40, cols: 17, rows: 5 }) },
    { name: '200 tables x 20 col. (4 000 colonnes)', tables: tablesSpec({ tables: 200, cols: 20, rows: 3 }) },
    { name: '1 table x 5 000 col.', tables: [{ id: 'Huge', rows: 3, columns: columnsMix(5000) }] },
  ].slice(0, q(3, 2));
  for (const shape of shapes) {
    await withWidget({ tables: shape.tables }, async w => {
      const { page } = w;
      const first = shape.tables[0];
      await fire(page, first.id, 1);
      await page.evaluate(({ t, c }) => { Editor.setHTML('<p><span class="var-badge" data-table="' + t + '" data-column="' + c + '" data-key="' + t + '.' + c + '"></span></p>'); }, { t: first.id, c: first.columns[0].id });
      await sleep(600);
      const total = shape.tables.reduce((n, t) => n + t.columns.length, 0);
      const open = await timed(page, OPEN_CONDITION);
      r.rec('lists', `${shape.name} : fenêtre « Condition » - ouverture`, open.ms, { budget: 1500, note: `${open.value.options} option(s) dans le champ Colonne` });
      const list = await openSearchList(page, '.macro-rule-column');
      if (list) {
        r.rec('lists', `${shape.name} : liste des colonnes d'une règle - ouverture`, list.ms, { budget: 1000, note: `${list.rows} ligne(s) posée(s)${list.more ? ', « ' + list.more + ' »' : ''}` });
        r.rec('lists', `${shape.name} : liste des colonnes d'une règle - affichage borné`, list.rows, { unit: 'lignes', ok: list.rows <= total && (list.rows >= Math.min(total, 500) || list.more !== ''), note: list.more ? 'la suite est annoncée' : 'tout est posé' });
      } else r.rec('lists', `${shape.name} : liste des colonnes d'une règle`, 'liste introuvable', { unit: '', ok: false });
      await page.keyboard.press('Escape');
      await page.evaluate(() => { try { VariableCondition.close(); } catch (e) { /* déjà fermée */ } });
    });
  }

  // --- 2. le champ Valeur d'une colonne Référence : toutes les valeurs de la table liée
  for (const n of q([1000, 10000, 50000], [1000, 10000])) {
    const tables = [
      { id: 'Factures', rows: 10, columns: [{ id: 'Numero', type: 'Text' }, { id: 'Client', type: 'Ref:Clients', shows: 'Col001' }] },
      { id: 'Clients', rows: n, columns: columnsMix(12) },
    ];
    await withWidget({ tables }, async w => {
      const { page } = w;
      await fire(page, 'Factures', 1);
      await page.evaluate(() => { Editor.setHTML('<p><span class="var-badge" data-table="Factures" data-column="Numero" data-key="Factures.Numero"></span></p>'); });
      await sleep(600);
      await timed(page, OPEN_CONDITION);
      await w.resetStats();
      const t0 = Date.now();
      const picked = await page.evaluate(() => {
        const sel = document.querySelector('.macro-rule-column');
        const target = Array.from(sel.options).map(o => o.value).find(v => v === 'Client' || /(^|\.)Client$/.test(v));
        if (!target) return { ok: false, options: Array.from(sel.options).map(o => o.value).slice(0, 10) };
        sel.value = target;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, target };
      });
      if (!picked.ok) { r.rec('lists', `${fmt(n)} clients : colonne Client introuvable dans la fenêtre`, JSON.stringify(picked.options), { unit: '', ok: false }); return; }
      const filled = await page.waitForFunction(() => { const s = document.querySelector('.macro-rule-value-wrap select'); return !!s && s.options.length > 2; }, null, { timeout: 120000 }).then(() => true).catch(() => false);
      const fillMs = Date.now() - t0;
      await settle(page, 300);
      const reads = await w.stats();
      const optionCount = await page.evaluate(() => { const s = document.querySelector('.macro-rule-value-wrap select'); return s ? s.options.length : -1; });
      r.rec('lists', `${fmt(n)} valeurs de la table liée : champ Valeur prêt`, fillMs, { budget: 3000, ok: filled, note: `${fmt(optionCount)} option(s) créées, ${fmt(reads.fetchCells)} cases lues` });
      if (filled) {
        const list = await openSearchList(page, '.macro-rule-value-wrap select');
        if (list) {
          r.rec('lists', `${fmt(n)} valeurs de la table liée : liste - ouverture`, list.ms, { budget: 1000, note: `${list.rows} ligne(s) posée(s)${list.more ? ', « ' + list.more + ' »' : ''}` });
          // La dernière valeur est-elle atteignable par la recherche ?
          const lastValue = await page.evaluate(count => window.__gristStub.getRow('Clients', count).Col001, n);
          await page.keyboard.type(lastValue, { delay: 0 });
          await sleep(1500);
          const found = await page.evaluate(v => Array.from(document.querySelectorAll('.ss-panel .ss-option')).some(o => o.textContent.includes(v)), lastValue);
          r.rec('lists', `${fmt(n)} valeurs de la table liée : la dernière valeur est trouvée en tapant`, found ? 1 : 0, { unit: '', ok: found });
        }
      }
      await page.keyboard.press('Escape');
      await page.evaluate(() => { try { VariableCondition.close(); } catch (e) { /* déjà fermée */ } });
    });
  }

  // --- 3. les abréviations (Réglages > Raccourcis) : lecture, liste de suggestions (plafonnée), onglet Réglages
  for (const n of q([200, 2000], [200])) {
    const abbreviations = Array.from({ length: n }, (_, i) => ({ Utilisateur: '', Abreviation: 'ab' + String(i + 1).padStart(4, '0'), Texte: 'Texte de l’abréviation numéro ' + (i + 1) + ', assez long pour une ligne.' }));
    await withWidget({ tables: [{ id: 'Table01', rows: 5, columns: columnsMix(6) }], abbreviations }, async w => {
      const { page } = w;
      const loaded = await timed(page, 'TextExpansion.reset(); const l = await TextExpansion.load(true); return l.length;');
      r.rec('lists', `${fmt(n)} abréviations : lecture`, loaded.ms, { budget: 1000, note: `${fmt(loaded.value)} abréviation(s) chargée(s)` });
      r.rec('lists', `${fmt(n)} abréviations : toutes chargées`, loaded.value, { unit: 'abréviations', ok: loaded.value === n });
      const cap = await page.evaluate(() => ({ none: TextExpansion.filterEntries('').length, prefix: TextExpansion.filterEntries('ab').length, narrow: TextExpansion.filterEntries('ab1').length }));
      r.rec('lists', `${fmt(n)} abréviations : suggestions après le déclencheur seul`, cap.none, { unit: 'lignes', ok: cap.none >= Math.min(n, 50), note: n > 50 ? `plafond de 50 sur ${fmt(n)} (js/text-expansion.js:149), sans « Encore N » : les autres ne s'atteignent qu'en tapant plus de lettres` : '' });
      // L'onglet Réglages > Raccourcis : les n lignes sont posées d'un coup.
      const t0 = Date.now();
      await page.evaluate(() => { document.getElementById('v2-btn-settings').click(); });
      await sleep(600);
      await page.evaluate(() => { document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').click(); });
      await page.waitForFunction(n => document.querySelectorAll('.settings-expansion-row').length >= Math.min(n, 1), n, { timeout: 120000 }).catch(() => {});
      await settle(page, 300);
      const rowsPosed = await page.evaluate(() => document.querySelectorAll('.settings-expansion-row').length);
      r.rec('lists', `${fmt(n)} abréviations : onglet Réglages > Raccourcis`, Date.now() - t0 - 900, { budget: 1500, note: `${fmt(rowsPosed)} ligne(s) dans le DOM` });
    });
  }

  // --- 4. les formats de page enregistrés
  for (const n of q([200, 2000], [200])) {
    const formats = Array.from({ length: n }, (_, i) => ({ Nom: 'Format ' + (i + 1), Largeur: 100 + (i % 200), Hauteur: 150 + (i % 300) }));
    await withWidget({ tables: [{ id: 'Table01', rows: 5, columns: columnsMix(6) }], formats }, async w => {
      const { page } = w;
      const loaded = await timed(page, 'SavedPageFormats.reset(); const l = await SavedPageFormats.load(true); const t0 = performance.now(); const items = SavedPageFormats.list(); return { n: l.length, listMs: performance.now() - t0, shown: items.length };');
      r.rec('lists', `${fmt(n)} formats de page enregistrés : lecture`, loaded.ms, { budget: 1000, note: `${fmt(loaded.value.n)} format(s), liste triée en ${Math.round(loaded.value.listMs)} ms` });
      r.rec('lists', `${fmt(n)} formats de page enregistrés : tous chargés`, loaded.value.n, { unit: 'formats', ok: loaded.value.n === n });
    });
  }
}

// ===================================================================================================================================================
// limits : les plafonds fixes du code - collage d'un tableur, import .xlsx
// ===================================================================================================================================================
async function limits(r) {
  const tables = [{ id: 'Table01', rows: 5, columns: columnsMix(6) }];
  await withWidget({ tables }, async w => {
    const { page } = w;
    // --- collage d'un tableau de tableur (HTML du presse-papiers) : plafond de 3 000 lignes (js/grid-table.js:15), au-delà le collage reste tel quel et la personne en est prévenue (fenêtre, `GridTable.setTooBigHandler`)
    for (const rows of q([1000, 2999, 3000, 3001, 6000], [1000, 3001])) {
      const res = await page.evaluate(n => {
        const body = Array.from({ length: n }, (_, i) => '<tr><td>Ligne ' + (i + 1) + '</td><td>B</td><td>C</td></tr>').join('');
        const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta name=ProgId content=Excel.Sheet></head><body><table>' + body + '</table></body></html>';
        const t0 = performance.now();
        const model = GridTable.fromClipboardHtml(html);
        const ms = performance.now() - t0;
        // Le vrai rappel (la fenêtre de js/main.js) est mis de côté le temps de la mesure : seul le nombre de prévenus compte ici.
        const told = [];
        const before = GridTable.setTooBigHandler(info => told.push(info));
        const t1 = performance.now();
        const cleaned = GridTable.cleanPastedDocumentHtml(html);
        const cleanMs = performance.now() - t1;
        GridTable.setTooBigHandler(before);
        return { ms, model: !!model, rows: model && model.rows ? model.rows.length : null, rewritten: cleaned !== html, cleanMs, told: told.length };
      }, rows);
      r.rec('limits', `collage d'un tableur de ${fmt(rows)} lignes : analyse`, res.ms, { budget: 2000, note: res.model ? `${res.rows} ligne(s) reconnue(s)` : 'plafond dépassé : collé tel quel, SANS nettoyage (la personne en est prévenue)' });
      r.rec('limits', `collage d'un tableur de ${fmt(rows)} lignes : nettoyé comme un tableur`, res.rewritten ? 1 : 0, { unit: '', ok: rows <= 3000 ? res.rewritten && res.told === 0 : !res.rewritten && res.told === 1, note: res.rewritten ? '' : res.told === 1 ? 'collé tel quel, la personne en est prévenue' : 'collé tel quel (silencieux)' });
    }
    // --- import d'un classeur .xlsx dans une grille : 1 000 lignes, 100 colonnes, 5 000 cases (js/grid-xlsx-import.js:23-25), refus annoncé par un message
    const plans = q([[1000, 5], [1001, 5], [50, 100], [51, 100], [60, 101]], [[1001, 5], [51, 100]]);
    for (const [rows, cols] of plans) {
      const res = await page.evaluate(async ({ rows, cols }) => {
        await ExportEngines.ensure('xlsx'); // le moteur ne se charge qu'au premier export ou import (js/export-engines.js)
        await XlsxExport.ensureExcelLibLoaded();
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Feuille');
        for (let r = 1; r <= rows; r++) { const row = ws.getRow(r); for (let c = 1; c <= cols; c++) row.getCell(c).value = 'L' + r + 'C' + c; row.commit(); }
        const buffer = await wb.xlsx.writeBuffer();
        const t0 = performance.now();
        try { const model = await GridXlsxImport.fromArrayBuffer(buffer, { lang: 'fr' }); return { ok: true, ms: performance.now() - t0, kb: Math.round(buffer.byteLength / 1024), keys: Object.keys(model || {}).slice(0, 6) }; }
        catch (e) { return { ok: false, code: e.code, ms: performance.now() - t0, kb: Math.round(buffer.byteLength / 1024) }; }
      }, { rows, cols });
      const allowed = rows <= 1000 && cols <= 100 && rows * cols <= 5000;
      r.rec('limits', `import Excel de ${fmt(rows)} lignes x ${cols} colonnes (${fmt(rows * cols)} cases)`, res.ms, { budget: 5000, ok: res.ok === allowed, note: res.ok ? `importé (${res.kb} Ko)` : `refusé : ${res.code} (annoncé par un message d'état)` });
    }
  });
}


// ===================================================================================================================================================
// zones : l'en-tête et le pied de page d'un modèle (quatre zones) - chaque zone est résolue comme un morceau de document
// ===================================================================================================================================================
async function zones(r) {
  for (const n of q([300, 3000], [300])) {
    for (const hf of [false, true]) {
      const cols = columnsMix(12);
      const spec = { tables: [{ id: 'Table01', rows: n, columns: cols }], models: { count: 1, paragraphs: 12, table: 'Table01', columns: cols.map(c => c.id), hf } };
      const label = `${fmt(n)} lignes, ${hf ? 'avec en-tête et pied de page (4 zones)' : 'sans en-tête ni pied'}`;
      await withWidget(spec, async w => {
        const { page } = w;
        await pickTemplate(page, 'Modèle 0001'); await sleep(800);
        await fire(page, 'Table01', 3);
        await w.resetStats();
        const rd = await readOnce(page, null);
        const lec = await w.stats();
        r.rec('zones', `${label} : Lecture - lectures de table`, lec.fetchCalls, { unit: 'lecture(s)', note: `${fmt(lec.fetchCells)} cases lues, ${rd.ms} ms` });
        await w.resetStats();
        const pdf = await downloadOf(page, 'zones', () => click(page, '#btn-export-pdf'));
        await settle(page);
        const one = await w.stats();
        r.rec('zones', `${label} : PDF d'une ligne - lectures de table`, one.fetchCalls, { unit: 'lecture(s)', budget: 6, note: `${fmt(one.fetchCells)} cases lues, ${pdf.ms} ms` });
        await rm(pdf.file, { force: true });
        if (n <= 300) {
          await w.resetStats();
          const t0 = Date.now();
          const out = await exportBatchOf(page, 'pdfZip', 'zones-lot', { timeout: 900000 });
          await settle(page);
          const b = await w.stats();
          r.rec('zones', `${label} : lot de ${n} PDF - lectures de table PAR LIGNE`, Math.round(b.fetchCalls / n * 10) / 10, { unit: 'lecture(s)', budget: 6, note: `${Math.round((Date.now() - t0) / n)} ms par ligne, ${fmt(Math.round(b.fetchCells / n))} cases lues par ligne` });
          await rm(out.file, { force: true });
        }
      });
    }
  }
}


// ===================================================================================================================================================
// values : une liste de valeurs dans une ligne (Liste de choix) - tout écrire dans le texte, puis « Un document par valeur » (un document par valeur, produit de plusieurs listes)
// ===================================================================================================================================================
const badgeHtml = (table, column, format) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${format ? ` data-format="${JSON.stringify(format).replace(/"/g, '&quot;')}"` : ''}></span>`;
const valueNames = n => Array.from({ length: n }, (_, i) => 'Valeur ' + String(i + 1).padStart(5, '0'));
const distinctValues = text => new Set(text.match(/Valeur \d{5}/g) || []).size;

async function values(r) {
  // 1. toute la liste écrite dans le texte (réglage d'origine : tout afficher, séparés)
  for (const n of q([50, 500, 5000], [50, 500])) {
    const choices = valueNames(n);
    const spec = { tables: [{ id: 'Dossiers', rows: 3, columns: [{ id: 'Titre', type: 'Text' }, { id: 'Themes', type: 'ChoiceList', choices, listLen: n }] }] };
    const label = `liste de ${fmt(n)} valeurs écrite dans le texte`;
    await withWidget(spec, async w => {
      const { page } = w;
      await fire(page, 'Dossiers', 1);
      const html = `<p>Dossier ${badgeHtml('Dossiers', 'Titre')}</p><p>Thèmes : ${badgeHtml('Dossiers', 'Themes')}</p>`;
      const t0 = Date.now();
      await page.evaluate(h => { Editor.setHTML(h); }, html);
      await sleep(500);
      const last = choices[(1 + n - 1) % n]; // la dernière valeur de la ligne 1 (colonne 1 : décalage 1)
      const rd = await readOnce(page, last, 300000, 1e7);
      const inRead = distinctValues(rd.text);
      r.rec('values', `${label} : Lecture`, rd.ms, { budget: 5000, note: `${fmt(inRead)} valeur(s) sur ${fmt(n)} écrites` });
      r.rec('values', `${label} : Lecture - page de nouveau libre`, rd.freeMs, { budget: 10000, note: `retour à l'éditeur : ${rd.backMs} ms` });
      r.rec('values', `${label} : Lecture - toutes les valeurs sont écrites`, inRead === n ? 1 : 0, { unit: '', ok: inRead === n, note: `${fmt(inRead)} sur ${fmt(n)}` });
      const pdf = await downloadOf(page, 'values', () => click(page, '#btn-export-pdf'), 600000);
      const inPdf = distinctValues(pdfText(pdf.file));
      r.rec('values', `${label} : PDF`, pdf.ms, { budget: 20000, note: `${pdfPages(pdf.file)} page(s), ${Math.round(pdf.size / 1024)} Ko, ${fmt(inPdf)} valeur(s) sur ${fmt(n)}` });
      r.rec('values', `${label} : PDF - toutes les valeurs sont écrites`, inPdf === n ? 1 : 0, { unit: '', ok: inPdf === n, note: `${fmt(inPdf)} sur ${fmt(n)}` });
      await rm(pdf.file, { force: true });
    });
  }
  // 2. « Un document par valeur » : une ligne dont la liste porte n valeurs sort n documents (un seul fichier PDF = un ZIP)
  for (const n of q([20, 100, 300], [20, 60])) {
    const choices = valueNames(n);
    const spec = { tables: [{ id: 'Dossiers', rows: 3, columns: [{ id: 'Titre', type: 'Text' }, { id: 'Themes', type: 'ChoiceList', choices, listLen: n }] }] };
    const label = `un document par valeur, liste de ${fmt(n)} valeurs`;
    await withWidget(spec, async w => {
      const { page } = w;
      await fire(page, 'Dossiers', 1);
      const html = `<p>Dossier ${badgeHtml('Dossiers', 'Titre')} : ${badgeHtml('Dossiers', 'Themes', { list: { perValue: true } })}</p>`;
      await page.evaluate(h => { Editor.setHTML(h); }, html);
      await sleep(800);
      await w.resetStats();
      const zip = await downloadOf(page, 'pervalue', () => click(page, '#btn-export-pdf'), 900000);
      await settle(page);
      const st = await w.stats();
      const files = zipEntries(zip.file);
      r.rec('values', `${label} : ZIP d'une ligne - durée`, zip.ms, { budget: 60000, note: `${fmt(Math.round(zip.ms / n))} ms par document, ${Math.round(zip.size / 1024)} Ko` });
      r.rec('values', `${label} : ZIP d'une ligne - fichiers dans l'archive`, files, { unit: 'fichier(s)', ok: files === n, note: files === n ? 'un par valeur' : `attendu : ${n}` });
      r.rec('values', `${label} : ZIP d'une ligne - lectures de table PAR DOCUMENT`, Math.round(st.fetchCalls / n * 10) / 10, { unit: 'lecture(s)', budget: 6, note: `${fmt(Math.round(st.fetchCells / n))} cases lues par document` });
      r.rec('values', `${label} : tas JS`, await w.heapMb(), { unit: 'Mo', budget: 1000 });
      await rm(zip.file, { force: true });
    });
  }
  // 3. deux listes réglées ainsi : un document par COMBINAISON (le produit des deux longueurs)
  for (const n of q([20], [10])) {
    const choices = valueNames(n);
    const spec = { tables: [{ id: 'Dossiers', rows: 3, columns: [{ id: 'Titre', type: 'Text' }, { id: 'Themes', type: 'ChoiceList', choices, listLen: n }, { id: 'Langues', type: 'ChoiceList', choices, listLen: n }] }] };
    const label = `deux listes de ${fmt(n)} valeurs, un document par valeur`;
    await withWidget(spec, async w => {
      const { page } = w;
      await fire(page, 'Dossiers', 1);
      const per = { list: { perValue: true } };
      const html = `<p>Dossier ${badgeHtml('Dossiers', 'Titre')} : ${badgeHtml('Dossiers', 'Themes', per)} / ${badgeHtml('Dossiers', 'Langues', per)}</p>`;
      await page.evaluate(h => { Editor.setHTML(h); }, html);
      await sleep(800);
      await w.resetStats();
      const zip = await downloadOf(page, 'pervalue2', () => click(page, '#btn-export-pdf'), 1800000);
      const files = zipEntries(zip.file);
      r.rec('values', `${label} : ZIP d'une ligne - fichiers dans l'archive`, files, { unit: 'fichier(s)', ok: files === n * n, note: `${n} x ${n} = ${fmt(n * n)} attendus` });
      r.rec('values', `${label} : ZIP d'une ligne - durée`, zip.ms, { budget: 120000, note: `${Math.round(zip.ms / Math.max(1, files))} ms par document` });
      await rm(zip.file, { force: true });
    });
  }
}

// ===================================================================================================================================================
// internal : les tables que le widget garde dans le document - droits d'accès (relus toutes les 10 s, moins souvent quand la table est grosse), commentaires (relus à l'affichage d'un modèle commenté)
// ===================================================================================================================================================
async function internal(r) {
  // droits d'accès : la table des droits est relue en entier dès qu'un réglage existe, toutes les 10 s - une milliseconde par case lue au-delà, 3 minutes au plus (js/access-rights.js refreshDelayMs)
  for (const n of q([100, 5000, 50000], [100, 5000])) {
    const spec = {
      tables: [{ id: 'Table01', rows: 5, columns: columnsMix(6) }],
      rights: { table: 'Droits', rows: n, columns: ['Email', 'LectureSeule', 'Export'] },
      userEmail: 'personne@exemple.fr',
      options: { droitsAcces: { table: 'Droits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export' } },
    };
    const label = `table des droits de ${fmt(n)} lignes`;
    await withWidget(spec, async w => {
      const { page } = w;
      await sleep(1500);
      const once = await page.evaluate(async () => { const t0 = performance.now(); await AccessRights.refresh(); return Math.round(performance.now() - t0); });
      r.rec('internal', `${label} : un calcul des droits`, once, { budget: 1000 });
      await w.resetStats();
      const WINDOW_MS = 31000;
      await sleep(WINDOW_MS);
      const s = await w.stats();
      const t = (s.byTable && s.byTable.Droits) || { calls: 0, cells: 0 };
      const perMin = Math.round(t.calls * 60000 / WINDOW_MS * 10) / 10;
      // Une lecture = n lignes x 4 colonnes (id compris) ; l'attente est d'une milliseconde par case, entre 10 s et 3 minutes : le budget est ce qu'elle laisse passer en une minute, plus une lecture.
      const expectedWaitMs = Math.min(180000, Math.max(10000, n * 4));
      r.rec('internal', `${label} : au repos, lectures de la table des droits par minute`, perMin, { unit: 'lectures/min', budget: Math.ceil(60000 / expectedWaitMs) + 1, note: `${fmt(Math.round(t.cells * 60000 / WINDOW_MS))} cases lues par minute ; attente prévue ${Math.round(expectedWaitMs / 1000)} s` });
    });
  }
  // commentaires : Publipostage_Commentaires est lue en entière à l'affichage d'un modèle qui porte une marque de commentaire (js/comments.js loadForTemplate, carriesCommentMarks), tous modèles confondus
  for (const n of q([1000, 10000], [1000])) {
    const cols = columnsMix(6);
    const rows = Array.from({ length: n }, (_, i) => ({ ModeleId: 1 + (i % 20), CommentId: 'c' + i, Auteur: 'Auteur ' + (i % 15), Texte: 'Commentaire ' + i + ' ' + 'texte '.repeat(12), CreeLe: 1700000000 + i }));
    const spec = {
      tables: [{ id: 'Table01', rows: 5, columns: cols }],
      models: { count: 20, paragraphs: 10, table: 'Table01', columns: cols.map(c => c.id) },
      internal: [{ table: 'Publipostage_Commentaires', columns: ['ModeleId', 'CommentId', 'Auteur', 'Texte', 'CreeLe'], rows }],
    };
    const label = `${fmt(n)} commentaires dans le document (20 modèles)`;
    await withWidget(spec, async w => {
      const { page } = w;
      await w.resetStats();
      await pickTemplate(page, 'Modèle 0003');
      await sleep(600);
      const s = await w.stats();
      const t = (s.byTable && s.byTable.Publipostage_Commentaires) || { calls: 0, cells: 0 };
      r.rec('internal', `${label} : choisir un modèle sans marque de commentaire - lectures de la table des commentaires`, t.calls, { unit: 'lecture(s)', budget: 0, note: `${fmt(t.cells)} cases lues (un modèle sans marque n'a aucun fil à relire)` });
      // Sans la ligne du modèle, loadForTemplate ne sait pas s'il porte une marque : il lit, comme pour un modèle commenté - tous les commentaires du document, pas ceux du modèle.
      const ms = await page.evaluate(async () => { const t0 = performance.now(); await Comments.loadForTemplate(Templates.getCurrentId()); return Math.round(performance.now() - t0); });
      r.rec('internal', `${label} : charger les commentaires d'un modèle commenté`, ms, { budget: 1000 });
    });
  }
}

// ===================================================================================================================================================
// suivi : un modèle revu par plusieurs personnes (suggestions du mode suivi) - chargement, Lecture « comme accepté », PDF
// ===================================================================================================================================================
async function suivi(r) {
  for (const n of q([100, 500, 2000], [100, 500])) {
    const label = `${fmt(n)} suggestions de suivi (ajouts et suppressions)`;
    await withWidget({ tables: [{ id: 'Table01', rows: 5, columns: columnsMix(6) }] }, async w => {
      const { page } = w;
      await fire(page, 'Table01', 1);
      let html = '';
      for (let i = 0; i < n; i++) html += `<p>Clause ${i + 1} : texte ancien <del data-id="${2 * i + 1}">retiré${i + 1}</del> <ins data-id="${2 * i + 2}">ajouté${i + 1}</ins> et la suite de la clause.</p>`;
      const t0 = Date.now();
      await page.evaluate(h => { Editor.setHTML(h); }, html);
      await page.waitForFunction(() => /Clause 1 /.test(document.querySelector('.tiptap').textContent), null, { timeout: 120000 });
      const ms = Date.now() - t0;
      r.rec('suivi', `${label} : chargement dans l'éditeur`, ms, { budget: 3000 });
      const kept = await page.evaluate(() => document.querySelectorAll('.tiptap ins, .tiptap del').length);
      r.rec('suivi', `${label} : suggestions gardées par l'éditeur`, kept, { unit: 'marque(s)', ok: kept === 2 * n, note: `${2 * n} attendues` });
      const rd = await readOnce(page, 'ajouté' + n, 300000, 1e7);
      const leaked = (rd.text.match(/retiré\d+/g) || []).length;
      r.rec('suivi', `${label} : Lecture (comme accepté)`, rd.ms, { budget: 5000, note: rd.ok ? 'dernier ajout écrit' : 'le dernier ajout manque' });
      r.rec('suivi', `${label} : Lecture - page de nouveau libre`, rd.freeMs, { budget: 10000, note: `retour à l'éditeur : ${rd.backMs} ms` });
      r.rec('suivi', `${label} : Lecture - le texte supprimé n'apparaît plus`, leaked === 0 ? 1 : 0, { unit: '', ok: leaked === 0, note: `${leaked} suppression(s) encore écrite(s)` });
      const pdf = await downloadOf(page, 'suivi', () => click(page, '#btn-export-pdf'), 600000);
      const text = pdfText(pdf.file);
      const pdfOk = text.includes('ajouté' + n) && !/retiré\d+/.test(text);
      r.rec('suivi', `${label} : PDF`, pdf.ms, { budget: 20000, note: `${pdfPages(pdf.file)} page(s), ${Math.round(pdf.size / 1024)} Ko` });
      r.rec('suivi', `${label} : PDF - ajouts écrits, suppressions absentes`, pdfOk ? 1 : 0, { unit: '', ok: pdfOk });
      await rm(pdf.file, { force: true });
    });
  }
}

// ===================================================================================================================================================
// sommaire : un document à titres et son sommaire - chargement, Lecture, PDF
// ===================================================================================================================================================
async function sommaire(r) {
  for (const n of q([100, 400, 1000], [100, 400])) {
    const label = `${fmt(n)} titres et un sommaire`;
    await withWidget({ tables: [{ id: 'Table01', rows: 5, columns: columnsMix(6) }] }, async w => {
      const { page } = w;
      await fire(page, 'Table01', 1);
      let html = '<div class="toc-marker">Sommaire</div>';
      for (let i = 0; i < n; i++) html += (i % 5 === 0 ? `<h1>Chapitre ${Math.floor(i / 5) + 1}</h1>` : `<h2>Section ${i + 1}</h2>`) + `<p>Texte de la section ${i + 1}, quelques mots pour remplir la page.</p>`;
      const t0 = Date.now();
      await page.evaluate(h => { Editor.setHTML(h); }, html);
      await page.waitForFunction(() => document.querySelectorAll('.tiptap h1, .tiptap h2').length > 0, null, { timeout: 120000 });
      const ms = Date.now() - t0;
      const pages = await stableCount(page, () => document.querySelectorAll('#editor-container .v2-page-band').length + 1);
      r.rec('sommaire', `${label} : chargement dans l'éditeur`, ms, { budget: 3000, note: `${pages} bande(s) de page affichée(s)` });
      const rd = await readOnce(page, 'Texte de la section ' + n + ',', 300000);
      r.rec('sommaire', `${label} : Lecture`, rd.ms, { budget: 5000, note: rd.ok ? 'dernière section écrite' : 'la dernière section manque' });
      r.rec('sommaire', `${label} : Lecture - page de nouveau libre`, rd.freeMs, { budget: 10000, note: `retour à l'éditeur : ${rd.backMs} ms` });
      const pdf = await downloadOf(page, 'sommaire', () => click(page, '#btn-export-pdf'), 600000);
      const text = pdfText(pdf.file);
      const inToc = (text.match(new RegExp('Section ' + n + '(?!\\d)', 'g')) || []).length; // une fois dans le sommaire, une fois en titre
      r.rec('sommaire', `${label} : PDF`, pdf.ms, { budget: 20000, note: `${pdfPages(pdf.file)} page(s), ${Math.round(pdf.size / 1024)} Ko` });
      r.rec('sommaire', `${label} : PDF - le dernier titre est dans le sommaire ET dans le corps`, inToc >= 2 ? 1 : 0, { unit: '', ok: inToc >= 2, note: `${inToc} occurrence(s)` });
      await rm(pdf.file, { force: true });
    });
  }
}

const SECTIONS = { schema, reads, batch, content, templates, linked, zones, loops, macro, lists, limits, values, internal, suivi, sommaire };

const sections = wanted.length ? wanted : Object.keys(SECTIONS);
for (const s of sections) if (!SECTIONS[s]) { console.error(`Section inconnue : ${s}. Sections : ${Object.keys(SECTIONS).join(', ')}`); process.exit(2); }
const report = new Report('Tests de charge');
for (const s of sections) {
  console.log(`\n=== ${s} ===`);
  const t0 = Date.now();
  try { await SECTIONS[s](report); } catch (e) { report.rec(s, 'EXCEPTION', e.message, { unit: '', ok: false }); console.error(e.stack); }
  console.log(`(${s} : ${Math.round((Date.now() - t0) / 1000)} s)`);
}
if (flags.out) await report.save(flags.out);
console.log(`\n=== ${report.rows.length} mesures, ${report.flagged.length} signalée(s) ===`);
await stopServer();
process.exit(flags.strict && report.flagged.length ? 1 : 0);
