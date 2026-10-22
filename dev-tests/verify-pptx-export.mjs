#!/usr/bin/env node
// L'export PowerPoint (.pptx) d'une présentation (js/pptx-export.js ; SINGLE_EXPORTS.pptx et BATCH_EXPORTS.pptxZip de js/main.js ; SlidesEntry.outputHtml `keepProps` ; 5e fonction de la parité
// PowerPoint, après le fond, les formes, les traits, les notes et la rotation), à la vraie souris, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js),
// l'extension « diapositives » active. Le fichier est relu dans la page (JSZip) : chaque partie est du XML bien formé, a son type de contenu, chaque lien de paquet mène à une partie, chaque `r:id` existe.
//  LE MENU : la ligne « PowerPoint (bêta) » du menu « Type d'export » est grisée dans un document (un vrai clic dessus ne choisit rien), active dans une présentation ; un vrai clic la choisit
//   (liste cachée `pptx`, bouton du type allumé). Le moteur (js/pptx-export.js) n'est demandé au réseau qu'au premier export, une seule fois.
//  LE FICHIER (une seule ligne) : un .pptx de quatre diapositives de 960 x 540 points (12 192 000 x 6 858 000 EMU), sans dossier à part dans l'archive ; les variables sont remplacées par les valeurs de
//   la ligne ; le premier titre de chaque diapositive est son espace réservé « Titre » ; gras, italique, souligné, barré, couleur, surlignage, taille, alignement ; liens (adresse, diapositive visée par
//   un signet) ; puces, numérotation et niveaux ; tableau (colonnes, cases fusionnées dans les deux sens) ; image (dans l'archive, à sa taille) ; formes prédéfinies (rectangle, ellipse, bulle) à leur place,
//   leur fond, leur trait (le trait est centré sur le bord de la boîte : la boîte est rentrée d'une demi-épaisseur), tournées (`rot`, 60 000 par degré) ; traits fléchés (connecteur, retourné) ; le fond de la
//   diapositive ; sa transition (fondu, poussé, balayage : sorte, sens, durée) ; ses notes (le volet « Notes ») ; les noms des objets dans la langue de l'interface.
//  LE LOT : « Toutes les lignes (ZIP) » demande sa confirmation (« Annuler » n'exporte rien), « Générer » rend une archive d'un .pptx par ligne, chacun avec les valeurs de sa ligne.
//  LES AUTRES SORTIES : le HTML d'une présentation ne garde rien du repère de diapositive (ni transition, ni fond en attribut, ni notes) : `keepProps` ne vaut que pour le PowerPoint.
//  SANS LIGNE : aucune ligne sélectionnée, le bouton Exporter dit de cliquer sur une ligne et ne télécharge rien.
// Lancé par run-headless.mjs (groupe Node « pptxExport », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pptx-export.mjs
// PPTX_SHOTS=<dossier> : enregistre aussi les .pptx téléchargés (à ouvrir dans PowerPoint ou LibreOffice, à l'œil) ; sans lui, rien n'est écrit.
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';
import { chooseExportType, chooseExportLines, click, hoverRow, clickHoverRow, status as statusOf } from './load-lib.mjs';

const SHOTS = process.env.PPTX_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-pptx-export', port: Number(process.env.PPTX_EXPORT_PORT || 8987) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const ROWS = [['Alice', 'Urgent'], ['Bob', 'Autre'], ['Chloé', 'Urgent']];
const EMU = 12700;
const emu = pt => Math.round(pt * EMU);
const near = (a, b, tolerance = 1) => typeof a === 'number' && Math.abs(a - b) <= tolerance;

const TYPE_MENU = '#v2-btn-quality';
const EXPORT_MENU = '#btn-export-pdf';
const PPTX_ROW = '#v2-quality-flyout .v2-hover-row[data-export-type="pptx"]';
const CANCEL = '#pp-dialog-modal .pp-modal-actions button:first-of-type';
const CONFIRM = '#pp-dialog-modal .var-modal-primary';

// ---- La présentation de l'essai : quatre diapositives (le repère de chacune dit sa transition, son fond, ses notes) -----------------------------------------------------------------------------
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGM4wcBANiJf56jmUc2jmkc1U0UzAAn6OJAPHK6LAAAAAElFTkSuQmCC';
const PROPS = attrs => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0"${attrs}></div>`;
const FRAME = (x, y, w, h, rot, look, body) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${rot === null ? '' : ` data-ff-rot="${rot}"`}${look || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${body}</div></div></div>`;
const LINE = (x, y, w, h, extra) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"${extra || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
const RECT = ' data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"';
const ELLIPSE = ' data-ff-shape="ellipse" data-ff-fill="#fde68a" data-ff-line="#b45309" data-ff-lw="2"';
const BUBBLE = ' data-ff-shape="wedgeRoundRectCallout" data-ff-fill="#dcfce7" data-ff-line="#15803d" data-ff-lw="1.5"';
const sz = (pt, text) => `<span style="font-size: ${pt}pt;">${text}</span>`;
const CHIP = '<span class="var-badge" data-table="PpDepart" data-column="Nom" data-key="PpDepart.Nom"></span>';
const NOTES_ATTR = 'Première ligne des notes&#10;Deuxième ligne avec une apostrophe &#39; et un &amp;amp; et un &amp;lt;';
const NOTES = ['Première ligne des notes', 'Deuxième ligne avec une apostrophe \' et un &amp; et un &lt;'];
// Les cadres de la 3e diapositive : leurs mesures (points) et leur trait, dont dépendent la boîte et la rotation écrites.
const F = {
  rect: { x: 60, y: 60, w: 260, h: 120, lw: 1.5 },
  ellipse: { x: 380, y: 60, w: 220, h: 120, lw: 2, rot: 30 },
  bubble: { x: 640, y: 50, w: 240, h: 120 },
  lineBoth: { x: 60, y: 260, w: 300, h: 0, lw: 3 },
  lineFlip: { x: 420, y: 240, w: 200, h: 80, lw: 3 },
  magenta: { x: 700, y: 260, w: 180, h: 100, rot: 90 },
  text: { x: 60, y: 360, w: 300, h: 120, rot: 330 },
};
const SLIDE1 = [
  PROPS(` data-trans="push" data-trans-from="l" data-trans-dur="900" data-bg="#fff7e6" data-notes="${NOTES_ATTR}"`),
  `<h1 style="text-align: center;">${sz(44, 'Titre un')}</h1>`,
  `<p>${sz(20, `Pour ${CHIP}, <strong>gras</strong>, <em>italique</em>, <u>souligné</u>, <s>barré</s>, <a href="https://example.org/a">un lien</a>, <span style="color:#c00000">rouge</span>, <span style="background-color:#fef08a">surligné</span>`)}</p>`,
  `<ul><li><p>${sz(20, 'Premier')}</p></li><li><p>${sz(20, 'Deuxième')}</p><ul><li><p>${sz(20, 'Sous-point')}</p></li></ul></li></ul>`,
  `<ol><li><p>${sz(20, 'Un')}</p></li><li><p>${sz(20, 'Deux')}</p></li></ol>`,
  `<p>${sz(20, 'Vers la <a href="#bk1">diapositive quatre</a>.')}</p>`,
  BR,
].join('');
const SLIDE2 = [
  PROPS(' data-trans="fade" data-trans-from="r" data-trans-dur="500"'),
  '<h2>Tableau</h2>',
  '<table><tbody><tr><th colspan="2"><p>Entête</p></th></tr><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>D</p></td></tr></tbody></table>',
  `<p>Image : <img class="editor-image" alt="Image" src="data:image/png;base64,${RED_PNG}" style="width: 60px" data-layer="normal" data-wrap="inline"> dans le texte.</p>`,
  BR,
].join('');
const SLIDE3 = [
  FRAME(F.rect.x, F.rect.y, F.rect.w, F.rect.h, null, RECT, '<p>Rectangle avec <strong>texte</strong></p>'),
  FRAME(F.ellipse.x, F.ellipse.y, F.ellipse.w, F.ellipse.h, F.ellipse.rot, ELLIPSE, '<p style="text-align:center">Ellipse à 30°</p>'),
  FRAME(F.bubble.x, F.bubble.y, F.bubble.w, F.bubble.h, null, BUBBLE, '<p>Bulle de dialogue</p>'),
  LINE(F.lineBoth.x, F.lineBoth.y, F.lineBoth.w, F.lineBoth.h, ' data-ff-head="triangle" data-ff-tail="triangle"'),
  LINE(F.lineFlip.x, F.lineFlip.y, F.lineFlip.w, F.lineFlip.h, ' data-ff-flip="v" data-ff-tail="triangle"'),
  FRAME(F.magenta.x, F.magenta.y, F.magenta.w, F.magenta.h, F.magenta.rot, ' data-ff-shape="rect" data-ff-fill="#be185d"', '<p></p>'),
  FRAME(F.text.x, F.text.y, F.text.w, F.text.h, F.text.rot, '', '<p style="text-align:right">À droite <span style="background-color:#fef08a">surligné</span></p>'),
  BR,
].join('');
const SLIDE4 = [
  PROPS(' data-trans="wipe" data-trans-from="t" data-trans-dur="1200"'),
  '<h2>Fin</h2>',
  `<p data-anchor="bk1" data-anchor-name="Cible">${sz(20, 'Cible du signet')}</p>`,
].join('');
const DECK = (SLIDE1 + SLIDE2 + SLIDE3 + SLIDE4).replace(/'/g, '&#39;');
// Les trois lignes de la table, et la table de CE widget (`lastTableId`, que fetchSelectedTable lit) : sans elle la vue n'affiche aucune ligne et le lot demande « Quelles lignes exporter ? ».
const rowsSeed = `
  stub.state.lastTableId = 'PpDepart';
  const people = stub.state.rows.PpDepart;
  ${JSON.stringify(ROWS)}.forEach(([nom, statut], i) => { people.id.push(i + 1); people.Nom.push(nom); people.Statut.push(statut); });`;
const SEED = (record) => seedModels({ record }) + `
  add(7, 'Présentation', '${DECK}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
  ${rowsSeed}
`;

// Les mots de chaque langue.
const TEXTS = {
  fr: {
    row: 'PowerPoint (bêta)', generated: 'PowerPoint généré.', batchDone: '3 PowerPoint générés — archive ZIP téléchargée.', confirm: /chacune des 3 lignes de « PpDepart »/,
    noRow: 'Aucune ligne n’est sélectionnée. Cliquez sur une ligne dans Grist, puis exportez en PowerPoint.',
    names: { title: 'Titre', text: 'Zone de texte', picture: 'Image', table: 'Tableau', shape: 'Forme', line: 'Connecteur droit' },
  },
  en: {
    row: 'PowerPoint (beta)', generated: 'PowerPoint generated.', batchDone: '3 PowerPoint files generated — ZIP archive downloaded.', confirm: /each of the 3 rows in “PpDepart”/,
    noRow: 'No row is selected. Click a row in Grist, then export to PowerPoint.',
    names: { title: 'Title', text: 'Text box', picture: 'Picture', table: 'Table', shape: 'Shape', line: 'Straight connector' },
  },
};

// ---- Ce qui se lit DANS la page : un .pptx (base64) ouvert, vérifié comme un paquet OPC, résumé --------------------------------------------------------------------------------------------------
async function inspectPptx(b64) {
  await ExportCommon.ensureJsZipLoaded();
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  const out = { names, folders: Object.keys(zip.files).filter(n => zip.files[n].dir), malformed: [], noType: [], badOverrides: [], brokenTargets: [], duplicateRelIds: [], missingRelIds: [] };
  const docs = {};
  for (const n of names) {
    if (!/\.(xml|rels)$/i.test(n)) continue;
    const doc = new DOMParser().parseFromString(await zip.file(n).async('string'), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) out.malformed.push(n); else docs[n] = doc;
  }
  const attr = (el, name) => (el ? el.getAttribute(name) : null);
  const first = (el, name) => (el ? el.getElementsByTagName(name)[0] || null : null);
  const kids = (el, name) => Array.from(el ? el.children : []).filter(c => c.tagName === name);
  const colorOf = el => attr(first(el, 'a:srgbClr'), 'val');
  const textsOf = el => Array.from(el.getElementsByTagName('a:p')).map(p => Array.from(p.getElementsByTagName('a:t')).map(x => x.textContent).join(''));
  // Les types de contenu : chaque partie en a un (un type par extension, ou le sien).
  const types = docs['[Content_Types].xml'];
  const defaults = {};
  const overrides = {};
  if (types) {
    Array.from(types.getElementsByTagName('Default')).forEach(d => { defaults[d.getAttribute('Extension').toLowerCase()] = d.getAttribute('ContentType'); });
    Array.from(types.getElementsByTagName('Override')).forEach(o => { overrides[o.getAttribute('PartName')] = o.getAttribute('ContentType'); });
  }
  names.filter(n => n !== '[Content_Types].xml').forEach(n => {
    const ext = (n.match(/\.([^./]+)$/) || [])[1];
    if (!overrides['/' + n] && !(ext && defaults[ext.toLowerCase()])) out.noType.push(n);
  });
  out.badOverrides = Object.keys(overrides).filter(p => !names.includes(p.slice(1)));
  out.contentTypes = overrides;
  out.defaults = defaults;
  // Les liens du paquet : chaque cible interne est une partie du fichier, chaque identifiant n'y est qu'une fois.
  const resolve = (base, target) => {
    if (target.startsWith('/')) return target.slice(1);
    const stack = [];
    (base + target).split('/').forEach(part => { if (part === '..') stack.pop(); else if (part && part !== '.') stack.push(part); });
    return stack.join('/');
  };
  const rels = {};
  for (const n of names.filter(x => /\.rels$/.test(x))) {
    const m = n.match(/^(.*)_rels\/(.*)\.rels$/);
    if (!m || !docs[n]) continue;
    const list = {};
    Array.from(docs[n].getElementsByTagName('Relationship')).forEach((r) => {
      const id = r.getAttribute('Id');
      if (list[id]) out.duplicateRelIds.push(n + '#' + id);
      const external = r.getAttribute('TargetMode') === 'External';
      const target = external ? r.getAttribute('Target') : resolve(m[1], r.getAttribute('Target'));
      if (!external && !names.includes(target)) out.brokenTargets.push(n + ' -> ' + target);
      list[id] = { type: r.getAttribute('Type').split('/').pop(), target, external };
    });
    rels[m[1] + m[2]] = list;
  }
  Object.keys(docs).forEach((n) => {
    if (/\.rels$/.test(n) || n === '[Content_Types].xml') return;
    Array.from(docs[n].getElementsByTagName('*')).forEach(el => Array.from(el.attributes).forEach((a) => {
      if (/^r:(id|embed|link)$/.test(a.name) && !(rels[n] && rels[n][a.value])) out.missingRelIds.push(n + ' ' + a.name + '=' + a.value);
    }));
  });
  // La présentation : la taille des diapositives, leur ordre, leur identifiant.
  const pres = docs['ppt/presentation.xml'];
  const sldSz = first(pres, 'p:sldSz');
  out.size = sldSz ? { cx: Number(attr(sldSz, 'cx')), cy: Number(attr(sldSz, 'cy')) } : null;
  const ids = pres ? Array.from(pres.getElementsByTagName('p:sldId')).map(s => ({ id: Number(attr(s, 'id')), rid: attr(s, 'r:id') })) : [];
  out.slideIds = ids.map(s => s.id);
  out.slidePaths = ids.map(s => (rels['ppt/presentation.xml'] && rels['ppt/presentation.xml'][s.rid] ? rels['ppt/presentation.xml'][s.rid].target : null));
  out.hasNotesMaster = !!first(pres, 'p:notesMasterId');
  out.title = docs['docProps/core.xml'] ? (first(docs['docProps/core.xml'], 'dc:title') || {}).textContent : null;
  out.slides = out.slidePaths.map((path) => {
    const doc = docs[path];
    const r = rels[path] || {};
    if (!doc) return { path, missing: true };
    const info = { path };
    info.bg = doc.getElementsByTagName('p:bg')[0] ? colorOf(doc.getElementsByTagName('p:bg')[0]) : null;
    const tr = first(doc, 'p:transition');
    const effect = tr ? tr.children[0] : null;
    info.transition = tr ? { kind: effect ? effect.tagName : null, dir: attr(effect, 'dir'), spd: attr(tr, 'spd'), dur: attr(tr, 'p14:dur') } : null;
    const ids2 = Array.from(doc.getElementsByTagName('p:cNvPr')).map(e => attr(e, 'id'));
    info.duplicateIds = ids2.filter((v, i) => ids2.indexOf(v) !== i);
    info.shapes = Array.from(doc.getElementsByTagName('p:sp')).map((sp) => {
      const spPr = first(sp, 'p:spPr');
      const xfrm = first(spPr, 'a:xfrm');
      const off = first(xfrm, 'a:off');
      const ext = first(xfrm, 'a:ext');
      const ln = kids(spPr, 'a:ln')[0];
      const ph = first(sp, 'p:ph');
      const runs = Array.from(sp.getElementsByTagName('a:r')).map((run) => {
        const rPr = first(run, 'a:rPr');
        const link = first(rPr, 'a:hlinkClick');
        const rel = link && r[attr(link, 'r:id')] ? r[attr(link, 'r:id')] : null;
        return {
          t: first(run, 'a:t').textContent, b: attr(rPr, 'b'), i: attr(rPr, 'i'), u: attr(rPr, 'u'), strike: attr(rPr, 'strike'), sz: attr(rPr, 'sz'),
          color: rPr ? colorOf(kids(rPr, 'a:solidFill')[0]) : null, highlight: rPr ? colorOf(first(rPr, 'a:highlight')) : null,
          link: link ? { action: attr(link, 'action'), type: rel && rel.type, target: rel && rel.target, external: rel && rel.external } : null,
        };
      });
      const paras = Array.from(sp.getElementsByTagName('a:p')).map((p) => {
        const pPr = first(p, 'a:pPr');
        const bullet = pPr && first(pPr, 'a:buChar') ? 'char' : (pPr && first(pPr, 'a:buAutoNum') ? 'num:' + attr(first(pPr, 'a:buAutoNum'), 'type') : (pPr && first(pPr, 'a:buNone') ? 'none' : null));
        return { text: Array.from(p.getElementsByTagName('a:t')).map(x => x.textContent).join(''), algn: attr(pPr, 'algn'), lvl: attr(pPr, 'lvl'), bullet };
      });
      return {
        name: attr(first(sp, 'p:cNvPr'), 'name'), title: !!ph && attr(ph, 'type') === 'title', txBox: attr(first(sp, 'p:cNvSpPr'), 'txBox') === '1',
        prst: attr(first(spPr, 'a:prstGeom'), 'prst'), rot: attr(xfrm, 'rot'), x: Number(attr(off, 'x')), y: Number(attr(off, 'y')), cx: Number(attr(ext, 'cx')), cy: Number(attr(ext, 'cy')),
        fill: colorOf(kids(spPr, 'a:solidFill')[0]), line: ln ? { w: attr(ln, 'w'), color: colorOf(ln), none: !!first(ln, 'a:noFill') && !kids(ln, 'a:solidFill').length } : null,
        paras, runs, text: paras.map(p => p.text).join('\n'),
      };
    });
    info.lines = Array.from(doc.getElementsByTagName('p:cxnSp')).map((c) => {
      const xfrm = first(c, 'a:xfrm');
      const ln = first(c, 'a:ln');
      return {
        name: attr(first(c, 'p:cNvPr'), 'name'), x: Number(attr(first(xfrm, 'a:off'), 'x')), y: Number(attr(first(xfrm, 'a:off'), 'y')), cx: Number(attr(first(xfrm, 'a:ext'), 'cx')), cy: Number(attr(first(xfrm, 'a:ext'), 'cy')),
        flipH: attr(xfrm, 'flipH'), flipV: attr(xfrm, 'flipV'), rot: attr(xfrm, 'rot'), w: attr(ln, 'w'), color: colorOf(ln), head: attr(first(ln, 'a:headEnd'), 'type'), tail: attr(first(ln, 'a:tailEnd'), 'type'),
      };
    });
    info.pictures = Array.from(doc.getElementsByTagName('p:pic')).map((p) => {
      const rid = attr(first(p, 'a:blip'), 'r:embed');
      const xfrm = first(p, 'a:xfrm');
      const media = rid && r[rid] ? r[rid].target : null;
      return {
        name: attr(first(p, 'p:cNvPr'), 'name'), media, mediaThere: !!media && names.includes(media), x: Number(attr(first(xfrm, 'a:off'), 'x')), y: Number(attr(first(xfrm, 'a:off'), 'y')),
        cx: Number(attr(first(xfrm, 'a:ext'), 'cx')), cy: Number(attr(first(xfrm, 'a:ext'), 'cy')),
      };
    });
    info.tables = Array.from(doc.getElementsByTagName('p:graphicFrame')).map((g) => {
      const tbl = first(g, 'a:tbl');
      return {
        name: attr(first(g, 'p:cNvPr'), 'name'), cols: tbl ? tbl.getElementsByTagName('a:gridCol').length : 0,
        rows: tbl ? Array.from(tbl.getElementsByTagName('a:tr')).map(tr => kids(tr, 'a:tc').map(tc => ({ text: textsOf(tc).join('\n'), gridSpan: attr(tc, 'gridSpan'), rowSpan: attr(tc, 'rowSpan'), hMerge: attr(tc, 'hMerge'), vMerge: attr(tc, 'vMerge') }))) : [],
      };
    });
    const noteRel = Object.values(r).find(x => x.type === 'notesSlide');
    const body = noteRel && docs[noteRel.target]
      ? Array.from(docs[noteRel.target].getElementsByTagName('p:sp')).find(sp => attr(first(sp, 'p:ph'), 'type') === 'body') : null;
    info.notes = body ? textsOf(body) : null;
    info.jumpTargets = Object.values(r).filter(x => x.type === 'slide').map(x => x.target);
    return info;
  });
  return out;
}

async function installInspector(page) {
  await page.evaluate((source) => { window.__inspectPptx = (0, eval)('(' + source + ')'); }, inspectPptx.toString());
}
const inspect = (page, bytes) => page.evaluate(b64 => window.__inspectPptx(b64), bytes.toString('base64'));
// Une archive d'un .pptx par ligne : chacun relu comme un fichier seul, avec le nom qu'il porte dans l'archive.
const inspectArchive = (page, bytes) => page.evaluate(async (b64) => {
  await ExportCommon.ensureJsZipLoaded();
  const outer = await JSZip.loadAsync(b64, { base64: true });
  const files = [];
  for (const name of Object.keys(outer.files).filter(n => !outer.files[n].dir)) {
    const inner = await outer.file(name).async('base64');
    files.push(Object.assign({ entry: name }, await window.__inspectPptx(inner)));
  }
  return files;
}, bytes.toString('base64'));

// ---- Les gestes ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const download = (page, action, timeout = 90000) => Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), action()]).then(([file]) => file);
const bytesOf = async file => (file ? readFileSync(await file.path()) : null);
const nameOf = file => (file ? file.suggestedFilename() : null);
const typeValue = page => page.evaluate(() => document.getElementById('v2-export-type').value);
const typeButtonLit = page => page.evaluate(() => document.getElementById('v2-btn-quality').classList.contains('active'));
const rowState = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { text: el.textContent.trim(), greyed: el.classList.contains('v2-hover-row-disabled') && el.getAttribute('aria-disabled') === 'true', live: !el.classList.contains('v2-hover-row-disabled') && !el.hasAttribute('aria-disabled'), shown: r.width > 0 && r.height > 0, inside: r.top >= 0 && r.bottom <= innerHeight };
}, selector);
const dialogState = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return null;
  return { message: ov.querySelector('.pp-dialog-message').textContent };
});
async function openModel(page, id) {
  await Promise.race([
    page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length >= 4; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
}
const loadedEngine = (requests) => requests.filter(u => /\/js\/pptx-export\.js/.test(u)).length;
const park = async page => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };

async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  console.log(`\n${tag}Présentation de quatre diapositives, ligne « Alice » sélectionnée`);
  const { page, requests, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED(RECORD), lang, colorScheme, width: WIDTH, height: HEIGHT });
  await installInspector(page);
  const keep = async (file, name) => { if (SHOTS && file) await writeFile(join(SHOTS, `${lang}-${name}`), await bytesOf(file)); };

  // 1) Le menu : grisé dans un document, actif dans une présentation.
  console.log(`\n${tag}1) Le menu « Type d'export »`);
  await hoverRow(page, TYPE_MENU, '#v2-quality-flyout .v2-hover-row[data-export-type="docx"]');
  const inDocument = await rowState(page, PPTX_ROW);
  check(tag + `dans un document, la ligne « ${T.row} » est dans le menu, grisée et entière dans le panneau`, !!inDocument && inDocument.text === T.row && inDocument.greyed && inDocument.shown && inDocument.inside, inDocument);
  await clickHoverRow(page, TYPE_MENU, PPTX_ROW);
  await sleep(300);
  check(tag + 'un vrai clic sur la ligne grisée ne choisit rien (le type reste PDF, le bouton éteint)', (await typeValue(page)) === 'pdf' && !(await typeButtonLit(page)), { type: await typeValue(page) });
  await park(page);
  await openModel(page, 7);
  await hoverRow(page, TYPE_MENU, '#v2-quality-flyout .v2-hover-row[data-export-type="docx"]');
  const inDeck = await rowState(page, PPTX_ROW);
  check(tag + `dans une présentation, la ligne « ${T.row} » est active (ni grisée, ni désactivée), entière dans le panneau`, !!inDeck && inDeck.live && !inDeck.greyed && inDeck.shown && inDeck.inside, inDeck);
  check(tag + 'avant tout export, le moteur PowerPoint n\'est ni demandé au réseau ni chargé', loadedEngine(requests) === 0 && (await page.evaluate(() => typeof PptxExport)) === 'undefined', { loaded: loadedEngine(requests) });
  await clickHoverRow(page, TYPE_MENU, PPTX_ROW);
  await sleep(300);
  check(tag + 'un vrai clic sur la ligne la choisit : la liste cachée dit « pptx » et le bouton du type est allumé', (await typeValue(page)) === 'pptx' && (await typeButtonLit(page)), { type: await typeValue(page), lit: await typeButtonLit(page) });
  await park(page);

  // 2) Une seule ligne.
  console.log(`\n${tag}2) Le bouton Exporter, une seule ligne`);
  const file = await download(page, () => click(page, EXPORT_MENU), 120000);
  await keep(file, 'une-ligne.pptx');
  const bytes = await bytesOf(file);
  check(tag + 'un fichier .pptx est téléchargé', !!file && /\.pptx$/i.test(nameOf(file)) && !!bytes && bytes.length > 4000 && bytes.slice(0, 2).toString() === 'PK', { name: nameOf(file), size: bytes && bytes.length });
  await sleep(500);
  check(tag + `l'état dit « ${T.generated} »`, (await statusOf(page)).trim() === T.generated, await statusOf(page));
  check(tag + 'le moteur n\'a été demandé qu\'une fois, au premier export', loadedEngine(requests) === 1 && (await page.evaluate(() => typeof PptxExport)) === 'object', { loaded: loadedEngine(requests) });
  const pptx = bytes ? await inspect(page, bytes) : null;
  check(tag + 'le fichier se lit : quatre diapositives, aucune partie manquante', !!pptx && pptx.slides.length === 4 && pptx.slides.every(s => !s.missing), pptx && pptx.slides.map(s => s.path));
  if (!pptx) return { page, natives, requests };

  // Les noms des objets, dans la langue de l'interface.
  const slide1 = pptx.slides[0], slide2 = pptx.slides[1], slide3 = pptx.slides[2], slide4 = pptx.slides[3];
  const title1 = slide1.shapes.find(s => s.title);
  const nameOk = (name, kind) => new RegExp('^' + T.names[kind] + ' \\d+$').test(name || '');
  check(tag + `les objets portent leur nom dans la langue de l'interface (« ${T.names.title} », « ${T.names.text} », « ${T.names.picture} », « ${T.names.table} », « ${T.names.shape} », « ${T.names.line} » suivis de leur numéro)`,
    !!title1 && nameOk(title1.name, 'title') && slide1.shapes.some(s => s.txBox && nameOk(s.name, 'text')) && nameOk(slide2.pictures[0] && slide2.pictures[0].name, 'picture') && nameOk(slide2.tables[0] && slide2.tables[0].name, 'table')
      && slide3.shapes.some(s => s.prst === 'rect' && nameOk(s.name, 'shape')) && slide3.lines.length === 2 && slide3.lines.every(l => nameOk(l.name, 'line')),
    { title: title1 && title1.name, shapes: slide3.shapes.map(s => s.name), lines: slide3.lines.map(l => l.name) });
  if (!full) return { page, natives, requests };

  // Le paquet.
  check(tag + 'aucune partie mal formée (XML de chaque partie et de chaque liste de liens)', pptx.malformed.length === 0, pptx.malformed);
  check(tag + 'les parties de base y sont : types de contenu, liens, présentation, masque, mise en page, thèmes, propriétés, notes (maître et une page), quatre diapositives, une image',
    ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml',
      'ppt/theme/theme1.xml', 'ppt/notesMasters/notesMaster1.xml', 'ppt/notesSlides/notesSlide1.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide3.xml', 'ppt/slides/slide4.xml', 'ppt/media/image1.png']
      .every(n => pptx.names.includes(n)), pptx.names);
  check(tag + 'l\'archive n\'a que des parties : aucune entrée de dossier (« ppt/ », « _rels/ »…)', pptx.folders.length === 0, pptx.folders);
  check(tag + 'chaque partie a son type de contenu, aucun type ne vise une partie absente, les diapositives et leurs notes ont les leurs',
    pptx.noType.length === 0 && pptx.badOverrides.length === 0 && pptx.contentTypes['/ppt/slides/slide1.xml'] === 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
      && pptx.contentTypes['/ppt/notesSlides/notesSlide1.xml'] === 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml' && /presentation\.main\+xml$/.test(pptx.contentTypes['/ppt/presentation.xml'] || '') && pptx.defaults.png === 'image/png',
    { noType: pptx.noType, badOverrides: pptx.badOverrides });
  check(tag + 'chaque lien du paquet mène à une partie du fichier, aucun identifiant de lien en double, aucun `r:id` sans lien', pptx.brokenTargets.length === 0 && pptx.duplicateRelIds.length === 0 && pptx.missingRelIds.length === 0,
    { broken: pptx.brokenTargets, duplicates: pptx.duplicateRelIds, missing: pptx.missingRelIds });
  check(tag + 'quatre diapositives de 960 x 540 points (12 192 000 x 6 858 000 EMU), identifiées dans l\'ordre à partir de 256, le maître des notes déclaré',
    JSON.stringify(pptx.size) === JSON.stringify({ cx: 12192000, cy: 6858000 }) && JSON.stringify(pptx.slideIds) === JSON.stringify([256, 257, 258, 259]) && pptx.hasNotesMaster
      && pptx.slidePaths.every((p, i) => p === `ppt/slides/slide${i + 1}.xml`), { size: pptx.size, ids: pptx.slideIds, paths: pptx.slidePaths });
  check(tag + 'les objets de chaque diapositive ont un identifiant à eux (aucun en double)', pptx.slides.every(s => s.duplicateIds.length === 0), pptx.slides.map(s => s.duplicateIds));

  // La diapositive 1 : titre, texte, listes, liens, fond, transition, notes.
  console.log(`\n${tag}3) La diapositive 1 : titre, texte mis en forme, listes, liens`);
  const body1 = slide1.shapes.find(s => s.txBox && /Alice/.test(s.text));
  check(tag + 'le premier titre est l\'espace réservé « Titre », centré, en gras à 44 points ; sa boîte est à la marge gauche, de la largeur du texte (904 points)',
    !!title1 && title1.text === 'Titre un' && title1.paras[0].algn === 'ctr' && title1.runs[0].b === '1' && title1.runs[0].sz === '4400' && near(title1.x / EMU, 28, 0.5) && near(title1.cx / EMU, 904, 2),
    title1 && { text: title1.text, algn: title1.paras[0].algn, run: title1.runs[0], x: title1.x / EMU, w: title1.cx / EMU });
  check(tag + 'la variable est remplacée par la valeur de la ligne (« Alice »), rien de la variable n\'est écrit', !!body1 && /Pour Alice,/.test(body1.text) && !/PpDepart|\{\{|var-badge/.test(slide1.shapes.map(s => s.text).join(' ')), body1 && body1.text);
  const run = text => (body1 ? body1.runs.find(r => r.t === text) : null) || {};
  check(tag + 'gras, italique, souligné, barré, couleur et surlignage sont des attributs du texte (b, i, u, strike, couleur, surlignage)',
    run('gras').b === '1' && run('italique').i === '1' && run('souligné').u === 'sng' && run('barré').strike === 'sngStrike' && run('rouge').color === 'C00000' && run('surligné').highlight === 'FEF08A', body1 && body1.runs.map(r => [r.t, r.b, r.i, r.u, r.strike, r.color, r.highlight]));
  const link = run('un lien');
  check(tag + 'un lien d\'adresse est un lien externe vers son adresse, du bleu des liens et souligné', !!link.link && link.link.type === 'hyperlink' && link.link.external === true && link.link.target === 'https://example.org/a' && link.u === 'sng' && link.color === '0563C1', link);
  const jump = slide1.shapes.flatMap(s => s.runs).find(r => r.t === 'diapositive quatre');
  check(tag + 'un lien vers un signet est un saut vers la diapositive qui le porte (action hlinksldjump, vers la diapositive 4)',
    !!jump && !!jump.link && jump.link.action === 'ppaction://hlinksldjump' && jump.link.type === 'slide' && jump.link.target === 'ppt/slides/slide4.xml', jump);
  const bullets = slide1.shapes.flatMap(s => s.paras).filter(p => /^(Premier|Deuxième|Sous-point|Un|Deux)$/.test(p.text));
  const bulletOf = text => (bullets.find(p => p.text === text) || {});
  check(tag + 'les puces sont des puces (niveau 0, puis niveau 1 pour le sous-point), la liste numérotée numérote « 1. 2. » (arabicPeriod)',
    bulletOf('Premier').bullet === 'char' && bulletOf('Premier').lvl === '0' && bulletOf('Sous-point').bullet === 'char' && bulletOf('Sous-point').lvl === '1' && bulletOf('Un').bullet === 'num:arabicPeriod' && bulletOf('Deux').bullet === 'num:arabicPeriod',
    bullets);
  check(tag + 'le fond de la diapositive est sa couleur (FFF7E6), la transition un poussé qui vient de la gauche (sens « r ») en 900 ms',
    slide1.bg === 'FFF7E6' && !!slide1.transition && slide1.transition.kind === 'p:push' && slide1.transition.dir === 'r' && slide1.transition.dur === '900', { bg: slide1.bg, transition: slide1.transition });
  check(tag + 'les notes sont le volet « Notes » de la diapositive : une ligne par paragraphe, apostrophe, « &amp; » et « &lt; » écrits tels quels', !!slide1.notes && JSON.stringify(slide1.notes) === JSON.stringify(NOTES), slide1.notes);

  // La diapositive 2 : titre, tableau, image, fondu.
  console.log(`\n${tag}4) La diapositive 2 : tableau, image, fondu`);
  const table = slide2.tables[0];
  check(tag + 'le tableau a deux colonnes et trois lignes ; l\'entête couvre les deux colonnes (gridSpan 2, case suivante fusionnée), « A » couvre deux lignes (rowSpan 2, case dessous fusionnée)',
    !!table && table.cols === 2 && table.rows.length === 3 && table.rows[0][0].gridSpan === '2' && table.rows[0][1].hMerge === '1' && table.rows[1][0].rowSpan === '2' && table.rows[2][0].vMerge === '1', table);
  check(tag + 'le texte des cases est là (« Entête », « A », « B », « D »)', !!table && table.rows[0][0].text === 'Entête' && table.rows[1][0].text === 'A' && table.rows[1][1].text === 'B' && table.rows[2][1].text === 'D', table && table.rows);
  const picture = slide2.pictures[0];
  check(tag + 'l\'image est dans l\'archive (ppt/media/image1.png) et sa taille est celle de l\'écran : 60 px, soit 45 points (571 500 EMU) de côté', !!picture && picture.media === 'ppt/media/image1.png' && picture.mediaThere && picture.cx === emu(45) && picture.cy === emu(45), picture);
  check(tag + 'le titre de la diapositive 2 est son espace réservé « Titre » (« Tableau »), le fondu dure 500 ms et n\'a pas de sens',
    slide2.shapes.some(s => s.title && s.text === 'Tableau') && !!slide2.transition && slide2.transition.kind === 'p:fade' && slide2.transition.dir === null && slide2.transition.dur === '500' && slide2.bg === null && slide2.notes === null, { transition: slide2.transition, bg: slide2.bg, notes: slide2.notes });

  // La diapositive 3 : formes, traits, rotation. La boîte d'une forme à trait est rentrée d'une demi-épaisseur.
  console.log(`\n${tag}5) La diapositive 3 : formes prédéfinies, traits fléchés, rotation`);
  const shape = prst => slide3.shapes.find(s => s.prst === prst && s.paras.length) || {};
  const rect = slide3.shapes.find(s => s.prst === 'rect' && /Rectangle/.test(s.text)) || {};
  check(tag + 'le rectangle est un « rect » rempli de D9E2F3, au trait 2F5597 de 1,5 point, à sa place (60 ; 60) et de sa taille (260 x 120), rentré d\'une demi-épaisseur de trait (0,75 point)',
    rect.prst === 'rect' && rect.fill === 'D9E2F3' && !!rect.line && rect.line.color === '2F5597' && rect.line.w === String(emu(1.5)) && rect.x === emu(F.rect.x + 0.75) && rect.y === emu(F.rect.y + 0.75) && rect.cx === emu(F.rect.w - 1.5) && rect.cy === emu(F.rect.h - 1.5) && !rect.rot, rect);
  const ellipse = shape('ellipse');
  check(tag + 'l\'ellipse est une « ellipse » tournée de 30° (rot 1 800 000), à sa place (rentrée d\'un point : trait de 2 points), la forme n\'est pas déplacée par la rotation',
    ellipse.prst === 'ellipse' && ellipse.rot === String(30 * 60000) && ellipse.fill === 'FDE68A' && ellipse.x === emu(F.ellipse.x + 1) && ellipse.y === emu(F.ellipse.y + 1) && ellipse.cx === emu(F.ellipse.w - 2) && ellipse.cy === emu(F.ellipse.h - 2), ellipse);
  const bubble = shape('wedgeRoundRectCallout');
  check(tag + 'la bulle de dialogue est la forme « wedgeRoundRectCallout » de PowerPoint, avec son texte', bubble.prst === 'wedgeRoundRectCallout' && /Bulle de dialogue/.test(bubble.text) && bubble.fill === 'DCFCE7', bubble);
  const magenta = slide3.shapes.find(s => s.fill === 'BE185D') || {};
  check(tag + 'la forme pleine sans trait est tournée de 90° (rot 5 400 000), sans trait (`ln` vide), à sa place exacte (700 ; 260) en 180 x 100',
    magenta.rot === String(90 * 60000) && !!magenta.line && magenta.line.none && magenta.x === emu(F.magenta.x) && magenta.y === emu(F.magenta.y) && magenta.cx === emu(F.magenta.w) && magenta.cy === emu(F.magenta.h), magenta);
  const turned = slide3.shapes.find(s => /À droite/.test(s.text)) || {};
  check(tag + 'le cadre de texte à 330° est une zone de texte tournée de 19 800 000, texte aligné à droite, mot surligné (FEF08A)',
    turned.txBox === true && turned.rot === String(330 * 60000) && turned.paras[0].algn === 'r' && turned.runs.some(r => r.t === 'surligné' && r.highlight === 'FEF08A'), turned);
  const [both, flipped] = slide3.lines;
  check(tag + 'les deux traits sont des connecteurs droits de 3 points bleus (2F5597) ; le premier va de (60 ; 260) sur 300 points avec une pointe aux deux bouts',
    !!both && both.w === String(emu(3)) && both.color === '2F5597' && both.x === emu(F.lineBoth.x) && both.y === emu(F.lineBoth.y) && both.cx === emu(F.lineBoth.w) && both.cy === 0 && both.head === 'triangle' && both.tail === 'triangle' && !both.flipV && !both.flipH, both);
  check(tag + 'le second est retourné verticalement (flipV), pointe à la fin seulement', !!flipped && flipped.flipV === '1' && !flipped.flipH && flipped.head === null && flipped.tail === 'triangle' && flipped.cx === emu(F.lineFlip.w) && flipped.cy === emu(F.lineFlip.h), flipped);
  check(tag + 'la diapositive 3, sans repère, n\'a ni fond, ni transition, ni notes', slide3.bg === null && slide3.transition === null && slide3.notes === null, { bg: slide3.bg, transition: slide3.transition, notes: slide3.notes });

  // La diapositive 4.
  console.log(`\n${tag}6) La diapositive 4 : balayage venu du haut`);
  check(tag + 'le balayage vient du haut (sens « d ») en 1 200 ms ; le titre « Fin » et le texte du signet sont là', !!slide4.transition && slide4.transition.kind === 'p:wipe' && slide4.transition.dir === 'd' && slide4.transition.dur === '1200'
    && slide4.shapes.some(s => s.title && s.text === 'Fin') && slide4.shapes.some(s => /Cible du signet/.test(s.text)), slide4.transition);
  check(tag + 'seule la diapositive 1 a des notes : une page de notes, pas plus', pptx.names.filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length === 1, pptx.names.filter(n => /notesSlide/.test(n)));
  check(tag + 'le titre du document est celui du fichier (pas vide)', typeof pptx.title === 'string' && pptx.title.length > 0, pptx.title);

  // Un deuxième export : le moteur n'est pas rechargé.
  const again = await download(page, () => click(page, EXPORT_MENU), 120000);
  check(tag + 'un second export rend un second fichier, sans redemander le moteur', !!again && /\.pptx$/i.test(nameOf(again)) && loadedEngine(requests) === 1, { name: nameOf(again), loaded: loadedEngine(requests) });
  await sleep(600);
  return { page, natives, requests, keep };
}

// Le lot : une archive d'un .pptx par ligne.
async function batch(lang, page, keep) {
  const T = TEXTS[lang];
  const tag = `[${lang}] `;
  console.log(`\n${tag}7) « Toutes les lignes (ZIP) » : la confirmation, puis une archive d'un PowerPoint par ligne`);
  await chooseExportLines(page, 'zip');
  await park(page);
  const asked = await download(page, async () => {
    await click(page, EXPORT_MENU);
    await page.waitForSelector(CONFIRM, { state: 'visible', timeout: 30000 });
    await sleep(300);
  }, 2500);
  const dialog = await dialogState(page);
  check(tag + 'le bouton Exporter demande d\'abord sa confirmation (trois lignes de la table), sans rien télécharger', !!dialog && T.confirm.test(dialog.message) && asked === null, { dialog, file: nameOf(asked) });
  if (dialog) await click(page, CANCEL);
  const afterCancel = await download(page, async () => { await sleep(1500); }, 1500);
  check(tag + '« Annuler » ferme la fenêtre et n\'exporte rien', !(await dialogState(page)) && afterCancel === null, { file: nameOf(afterCancel) });
  await park(page);
  const zip = await download(page, async () => {
    await click(page, EXPORT_MENU);
    await page.waitForSelector(CONFIRM, { state: 'visible', timeout: 30000 });
    await sleep(300);
    await click(page, CONFIRM);
  }, 180000);
  if (keep) await keep(zip, 'lot.zip');
  const archive = await bytesOf(zip);
  check(tag + '« Générer » rend l\'archive des PowerPoint (…-export-pptx.zip)', !!zip && /-export-pptx\.zip$/i.test(nameOf(zip)) && !!archive && archive.length > 4000, { name: nameOf(zip) });
  await sleep(600);
  check(tag + `l'état dit « ${T.batchDone} »`, (await statusOf(page)).trim() === T.batchDone, await statusOf(page));
  const files = archive ? await inspectArchive(page, archive) : [];
  check(tag + 'l\'archive a trois .pptx de noms différents, un par ligne', files.length === 3 && files.every(f => /\.pptx$/i.test(f.entry)) && new Set(files.map(f => f.entry)).size === 3, files.map(f => f.entry));
  check(tag + 'chacun est un fichier complet (quatre diapositives, rien de mal formé, aucun lien cassé)', files.length === 3 && files.every(f => f.slides.length === 4 && f.malformed.length === 0 && f.brokenTargets.length === 0 && f.noType.length === 0 && f.missingRelIds.length === 0),
    files.map(f => ({ entry: f.entry, slides: f.slides.length, malformed: f.malformed, broken: f.brokenTargets })));
  const intro = f => ((f.slides[0].shapes.find(s => s.txBox && /^Pour /.test(s.text)) || {}).text || '');
  check(tag + 'chaque fichier porte les valeurs de SA ligne (Alice, Bob, Chloé), pas celles de la ligne sélectionnée', files.length === 3 && ROWS.every(([nom]) => files.filter(f => new RegExp('^Pour ' + nom + ',').test(intro(f))).length === 1), files.map(intro));
  check(tag + 'les notes, le fond et les transitions sont dans chacun', files.length === 3 && files.every(f => f.slides[0].bg === 'FFF7E6' && f.slides[0].notes && f.slides[0].notes.length === 2 && f.slides[0].transition && f.slides[0].transition.kind === 'p:push' && f.slides[3].transition && f.slides[3].transition.kind === 'p:wipe'), files.map(f => f.slides[0].transition));
  await chooseExportLines(page, 'one');
  await park(page);
}

// Les autres sorties d'une présentation ne gardent rien du repère de diapositive.
async function otherOutputs(lang, page) {
  const tag = `[${lang}] `;
  console.log(`\n${tag}8) Le HTML d'une présentation : ni transition, ni notes`);
  await chooseExportType(page, 'html');
  await park(page);
  const html = await download(page, () => click(page, EXPORT_MENU), 90000);
  const text = html ? (await bytesOf(html)).toString('utf8') : '';
  check(tag + 'le HTML rendu a le texte de la présentation (le titre, la valeur de la ligne), sans repère de diapositive, sans transition, sans notes',
    !!html && /Titre un/.test(text) && /Alice/.test(text) && !/pp-slide-props|data-trans|data-notes|Première ligne des notes/.test(text), { name: nameOf(html), props: /pp-slide-props|data-trans|data-notes/.test(text) });
  await sleep(500);
  await chooseExportType(page, 'pptx');
  await park(page);
}

// Sans ligne sélectionnée.
async function withoutRow(lang) {
  const T = TEXTS[lang];
  const tag = `[${lang}] `;
  console.log(`\n${tag}9) Sans ligne sélectionnée`);
  const { page, natives } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED(null), lang, colorScheme: 'light', width: WIDTH, height: HEIGHT });
  await openModel(page, 7);
  await chooseExportType(page, 'pptx');
  await park(page);
  const file = await download(page, async () => { await click(page, EXPORT_MENU); await sleep(1200); }, 2500);
  check(tag + 'le bouton Exporter dit de cliquer sur une ligne (la phrase du PowerPoint) et ne télécharge rien', file === null && natives.some(n => n.includes(T.noRow)), { natives, file: nameOf(file) });
}

console.log('=== verify-pptx-export : français, clair ===');
const fr = await run('fr', 'light', true);
if (fr.page) {
  await batch('fr', fr.page, fr.keep);
  await otherOutputs('fr', fr.page);
}
await withoutRow('fr');
console.log('\n=== verify-pptx-export : anglais, sombre ===');
const en = await run('en', 'dark', false);
if (en.page) await batch('en', en.page, null);
await withoutRow('en');
await t.finish();
