// Installer un modèle de la galerie par le VRAI parcours (comme dev-tests/gallery-captures.mjs) puis poser ses lignes d'exemple : c'est de là que viennent les documents photographiés.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { openWidget, sleep, rectOf, click, clickMenuRow, ROOT } from './kit.mjs';
import { pathToFileURL } from 'node:url';
// Le dépôt vient de REPO_DIR (kit.mjs) : la bibliothèque de la galerie est lue là, pas à un chemin figé.
const { entryFiles, readJson } = await import(pathToFileURL(join(ROOT, 'dev-tests', 'gallery-captures-lib.mjs')).href);

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
export function makeImage(spec) {
  const file = join(tmpdir(), 'readme-img-' + Math.random().toString(36).slice(2) + '.png');
  const w = spec.width || 480, h = spec.height || 320;
  const r = sh('convert', ['-size', `${w}x${h}`, `gradient:${spec.from || '#1d4ed8'}-${spec.to || '#60a5fa'}`, '-gravity', 'center', '-fill', spec.color || 'white', '-pointsize', String(spec.pointsize || Math.round(Math.min(w, h) / 6)), '-annotate', '0', spec.label || '', file]);
  if (r.status !== 0) throw new Error('convert : ' + r.stderr);
  return readFileSync(file);
}

export function templateFiles(id) {
  const root = join(ROOT, 'templates-gallery');
  const entry = readJson(join(root, 'catalogue.json')).find((e) => e.id === id);
  if (!entry) throw new Error('modèle inconnu : ' + id);
  const files = entryFiles(root, entry);
  const pack = files.pack;
  const tables = pack.tables.map((t) => typeof t !== 'string' ? t : files.familyTables.tables.find((x) => x.id === t));
  const rows = Object.assign({}, files.familyExemple && files.familyExemple.rows, files.exemple.rows);
  const imageSpecs = Object.assign({}, files.familyExemple && files.familyExemple.images, files.exemple.images);
  return { entry, files, pack, tables, rows, imageSpecs, main: pack.main || tables[0].id, type: (pack.template && pack.template.type) || 'document' };
}

async function installFromGallery(page, name, W, H) {
  await clickMenuRow(page, '#btn-new', '#v2-btn-new-from-template', 500);
  await page.mouse.move(W / 2, H - 40, { steps: 6 });
  await page.waitForFunction(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, null, { timeout: 10000 });
  const card = await page.evaluate((n) => {
    const el = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card')).find((c) => c.querySelector('.tpl-gallery-card-name').textContent === n);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);
  if (!card) throw new Error('la carte « ' + name + ' » n’est pas dans la galerie');
  await page.mouse.move(card.x - 10, card.y - 5, { steps: 2 }); await page.mouse.move(card.x, card.y, { steps: 3 }); await page.mouse.click(card.x, card.y);
  await page.waitForFunction(() => { const b = document.getElementById('tpl-preview-use-pack'); return b && !b.hidden && getComputedStyle(document.getElementById('template-preview-modal')).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(400);
  await click(page, '#tpl-preview-use-pack', 500);
  const confirm = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const b = Array.from(ov.querySelectorAll('.pp-modal-actions button')).find((x) => x.textContent === 'Créer');
    if (!b) return { error: 'pas de bouton Créer' };
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!confirm || confirm.error) throw new Error('la question « Créer les tables du modèle ? » n’est pas là');
  await page.mouse.move(confirm.x - 8, confirm.y, { steps: 2 }); await page.mouse.click(confirm.x, confirm.y);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('template-gallery-modal')).display === 'none' && Templates.getCurrentId() != null, null, { timeout: 30000 });
  await sleep(900);
}

export async function fillRows(page, tables, rows) {
  await page.evaluate(({ tables, rows }) => {
    const stub = window.__gristStub;
    const day = (s) => Math.floor(Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s + (/Z$|[+-]\d\d:\d\d$/.test(s) ? '' : 'Z')) / 1000);
    tables.forEach((t) => {
      const list = (rows[t.id] || []).map((r) => {
        const out = { id: r.id };
        t.columns.forEach((c) => {
          let v = r[c.id]; if (v === undefined || (v === '' && c.type !== 'Text' && c.type !== 'Choice')) v = null;
          const ref = /^Ref:(.+)$/.exec(c.type);
          const refl = /^RefList:(.+)$/.exec(c.type);
          if (v !== null) {
            if (c.type === 'Date' || c.type === 'DateTime') v = typeof v === 'string' ? day(v) : v;
            else if (c.type === 'ChoiceList' || c.type === 'Attachments' || refl) v = ['L'].concat(v);
          }
          out[c.id] = v;
          if (ref || refl) {
            const targetRows = rows[(ref || refl)[1]] || [];
            const shown = (id) => { const row = targetRows.find((x) => x.id === id); const value = row ? row[c.show] : ''; return value == null ? '' : value; };
            const helper = ((stub.state.displayCols || {})[t.id] || {})[c.id] || ('gristHelper_Display' + c.id);
            out[helper] = v === null ? '' : (refl ? ['L'].concat(r[c.id].map(shown)) : shown(v));
          }
        });
        return out;
      });
      stub.setRows(t.id, list);
    });
  }, { tables: tables.map((t) => ({ id: t.id, columns: t.columns })), rows });
  await sleep(300);
}

export async function fire(page, table, rowId) {
  await page.evaluate(({ table, rowId }) => {
    const stub = window.__gristStub; const st = stub.state;
    const raw = stub.getRow(table, rowId);
    if (!raw) throw new Error('pas de ligne ' + rowId + ' dans ' + table);
    const display = st.displayCols[table] || {};
    const rec = { id: rowId };
    Object.keys(st.columns[table] || {}).forEach((col) => {
      if (col.indexOf('gristHelper_') === 0) return;
      if (display[col]) { const shown = raw[display[col]]; rec[col] = Array.isArray(shown) && shown[0] === 'L' ? shown.slice(1) : shown; }
      else rec[col] = raw[col];
      const type = String((st.columns[table] || {})[col] || '');
      if (/^(ChoiceList|Attachments|RefList)/.test(type) && Array.isArray(rec[col]) && rec[col][0] === 'L') rec[col] = rec[col].slice(1);
    });
    stub.fireRecord(rec, table);
  }, { table, rowId });
  await sleep(700);
}

// Un widget ouvert sur un modèle de la galerie, installé avec ses tables et ses lignes d'exemple ; la ligne `row` est envoyée au widget.
export async function openTemplate(id, opts = {}) {
  const t = templateFiles(id);
  const images = {};
  Object.keys(t.imageSpecs).forEach((k) => { images[k] = makeImage(t.imageSpecs[k]); });
  const width = opts.width || 1000, height = opts.height || 620;
  const w = await openWidget({ ...opts, width, height, images, hosted: t.type === 'presentation' || opts.hosted, extensions: opts.extensions || (t.type === 'presentation' ? ['diapositives'] : (t.files.exemple.extensions || [])) });
  await installFromGallery(w.page, t.entry.name, width, height);
  await fillRows(w.page, t.tables, t.rows);
  if (opts.row !== null) await fire(w.page, t.main, opts.row || 1);
  await w.page.evaluate((f) => document.documentElement.style.setProperty('--font-ui', f), "Roboto, 'Helvetica Neue', Arial, sans-serif");
  await sleep(500);
  return { ...w, t };
}
