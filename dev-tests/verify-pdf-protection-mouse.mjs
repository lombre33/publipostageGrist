#!/usr/bin/env node
// Le type « PDF protégé » du menu « Type d'export » au VRAI clic et à la vraie frappe, à 700x400 (le panneau de Grist), et les fichiers téléchargés relus par d'autres lecteurs que le
// navigateur (poppler : pdfinfo et pdftotext ; pypdf) : ce qu'Antoine fait et ce qu'une autre personne trouve en ouvrant le PDF. Demande d'Antoine du 12/10 : « Protection du PDF Ok pour
// le dev, proposer ca dans le choix des type d'export genre "pdf protégé" ».
//   1) le menu « Type d'export » à quatre types (PDF, PDF protégé, Word, Excel) et trois qualités : les sept lignes entières dans le panneau, sans texte coupé, atteignables, lisibles
//      (>= 4,5:1), en français clair puis en anglais sombre ; « PDF protégé » se choisit au clic (bouton du type allumé) ; « Impression navigateur », « un seul PDF » et « Assemblage »
//      y sont grisées - toujours lisibles -, avec leur raison, et un vrai clic dessus ne choisit rien ;
//   2) la fenêtre du mot de passe : entière dans le panneau, titre et boutons visibles, l'essentiel sans défiler, le champ a le focus, tous les textes lisibles (>= 4,5:1) ; tout permis
//      sans mot de passe grise « Exporter » et le dit ; Échap n'exporte rien ;
//   3) le PDF d'une ligne : le mot de passe (accentué) tapé au clavier, une autorisation retirée et les propriétés saisies à la souris, puis « Exporter » : le fichier est chiffré en
//      AES-256, poppler et pypdf le refusent sans mot de passe ou avec un mauvais, l'ouvrent avec le bon, y lisent le texte de la ligne, les autorisations (copier refusé) et les
//      propriétés ; sans mot de passe pour ouvrir, un PDF qui s'ouvre tout seul et ne porte que les autorisations ;
//   4) toutes les lignes (ZIP) : la fenêtre dit combien de PDF, l'archive contient un PDF chiffré par ligne, chacun s'ouvre avec le mot de passe et porte le texte de sa ligne ;
//   5) le mot de passe n'est écrit nulle part (stockage du navigateur, journal des actions envoyées à Grist) ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « pdfProtectionMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pdf-protection-mouse.mjs
import { open, stopServer, sleep, click, hoverRow, clickHoverRow, chooseExportType, chooseExportLines, fire, pickTemplate, status, downloadOf } from './load-lib.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PDF_PROTECTION_PORT || 9011);
const SPEC = { tables: [{ id: 'PbClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 2, table: 'PbClients', columns: ['Nom'] } };
const TYPE_MENU = '#v2-btn-quality';
const EXPORT_MENU = '#btn-export-pdf';
const TYPE_ROW = name => '#v2-quality-flyout .v2-hover-row[data-export-type="' + name + '"]';
const QUALITY_ROW = name => '#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]';
const LINES_ROW = name => '#v2-export-pdf-flyout .v2-hover-row[data-export-lines="' + name + '"]';
const OK = '#pp-protect-modal .pp-modal-actions .var-modal-primary';
const CANCEL = '#pp-protect-modal .pp-modal-actions button:not(.var-modal-primary)';
const PASSWORD = 'stub-token-Sésame-ÿ 42';
// Le texte que la bulle « Nom » de la première ligne donne dans le PDF (dev-tests/load-doc.js : table + colonne + mot + numéro de ligne).
const ROW_TEXTS = ['PbClients Nom alpha 1', 'PbClients Nom beta 2', 'PbClients Nom gamma 3'];

const WORDS = {
  fr: { types: ['PDF', 'PDF protégé', 'Word (bêta)', 'Excel'], qualities: ['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)'], title: 'PDF protégé', ok: 'Exporter', cancel: 'Annuler', cancelled: 'Export annulé.', done: 'PDF protégé généré.', lines: ['Une seule ligne', 'Toutes les lignes (ZIP)', 'Toutes les lignes en un seul PDF', 'Assemblage avant impression'] },
  en: { types: ['PDF', 'Protected PDF', 'Word (beta)', 'Excel'], qualities: ['Vector (default)', 'Browser print', 'Light (smaller images)'], title: 'Protected PDF', ok: 'Export', cancel: 'Cancel', cancelled: 'Export cancelled.', done: 'Protected PDF generated.', lines: ['A single row', 'All rows (ZIP)', 'All rows as a single PDF', 'Assemble before printing'] },
};

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const parkMouse = async page => { await page.mouse.move(690, 390, { steps: 3 }); await sleep(350); };

// ---- Ce qu'un menu ou une fenêtre montre : place dans le panneau, ce qui recouvre, texte coupé, contraste du texte sur son fond ----
const measure = (page, selectors) => page.evaluate(sels => {
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = c => {
    const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  return sels.map(sel => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const r = el.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0;
    const top = shown ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return {
      sel, text: el.textContent.trim(), shown, active: el.classList.contains('is-active'), title: el.getAttribute('title') || '',
      greyed: el.classList.contains('v2-hover-row-disabled') && el.getAttribute('aria-disabled') === 'true', live: !el.classList.contains('v2-hover-row-disabled') && !el.hasAttribute('aria-disabled'),
      ticked: el.getAttribute('aria-checked') === 'true',
      inside: shown && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && (el.contains(top) || top.contains(el)), cut: el.scrollWidth > el.clientWidth + 1,
      contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100,
    };
  });
}, selectors);
const entire = rows => rows.every(r => r.shown && r.inside && r.reachable && !r.cut);
const readable = rows => rows.every(r => r.contrast >= 4.5);
const wanted = (rows, texts) => rows.length === texts.length && rows.every((r, i) => r.text === texts[i]);
const labelsOf = (page, flyout) => page.evaluate(sel => Array.from(document.querySelectorAll(sel + ' .v2-hover-flyout-label')).filter(l => l.getBoundingClientRect().width > 0).map(l => l.textContent.trim()), flyout);
const typeValue = page => page.evaluate(() => document.getElementById('v2-export-type').value);
const qualityValue = page => page.evaluate(() => document.getElementById('v2-pdf-quality').value);
const linesValue = page => page.evaluate(() => document.getElementById('v2-export-lines').value);
const typeButtonLit = page => page.evaluate(() => document.getElementById('v2-btn-quality').classList.contains('active'));

// ---- La fenêtre du mot de passe ----
const dialogOpen = page => page.evaluate(() => { const ov = document.getElementById('pp-protect-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; });
async function waitDialog(page, shown = true, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await dialogOpen(page)) === shown) return true; await sleep(100); }
  return false;
}
// Sa place dans le panneau, l'essentiel sans défiler, ses textes (contraste) et ce qui est cliquable.
const dialogLayout = page => page.evaluate(() => {
  const ov = document.getElementById('pp-protect-modal');
  const box = ov.querySelector('.pp-modal-box');
  const body = ov.querySelector('.pp-modal-body');
  const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const b = rect(box);
  const header = rect(ov.querySelector('.pp-modal-header'));
  const actions = rect(ov.querySelector('.pp-modal-actions'));
  const reach = sel => { const el = ov.querySelector(sel); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && el.contains(top); };
  return {
    inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, height: Math.round(b.height), width: Math.round(b.width),
    titleShown: header.top >= 0 && header.bottom <= innerHeight, actionsShown: actions.bottom <= innerHeight && actions.top >= 0,
    scrolls: body.scrollHeight > body.clientHeight + 1, overflow: body.scrollHeight - body.clientHeight,
    okReachable: reach('.pp-modal-actions .var-modal-primary'), cancelReachable: reach('.pp-modal-actions button:not(.var-modal-primary)'), passwordReachable: reach('#pp-protect-password'),
    focus: document.activeElement && document.activeElement.id,
  };
});
const DIALOG_TEXTS = ['#pp-protect-title', 'label[for="pp-protect-password"]', '#pp-protect-show + span', '#pp-protect-password-hint', '#pp-protect-modal legend', '#pp-protect-print + span', '#pp-protect-copy + span', '#pp-protect-modify + span',
  '#pp-protect-rights-note', '.pp-protect-summary', '#pp-protect-password', '#pp-protect-modal .pp-modal-actions button:not(.var-modal-primary)'];
const dialogState = page => page.evaluate(() => ({
  title: document.getElementById('pp-protect-title').textContent, intro: document.getElementById('pp-protect-intro').hidden ? '' : document.getElementById('pp-protect-intro').textContent,
  ok: document.querySelector('#pp-protect-modal .pp-modal-actions .var-modal-primary').textContent, okDisabled: document.querySelector('#pp-protect-modal .pp-modal-actions .var-modal-primary').disabled,
  cancel: document.querySelector('#pp-protect-modal .pp-modal-actions button:not(.var-modal-primary)').textContent,
  nothing: document.getElementById('pp-protect-nothing').hidden ? '' : document.getElementById('pp-protect-nothing').textContent,
  print: document.getElementById('pp-protect-print').checked, copy: document.getElementById('pp-protect-copy').checked, modify: document.getElementById('pp-protect-modify').checked,
  password: document.getElementById('pp-protect-password').value,
}));

// ---- Les fichiers relus par d'autres lecteurs ----
const run = (cmd, args) => { try { return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { ok: false, out: String(e.stderr || '') + String(e.stdout || '') }; } };
const tool = name => run('which', [name]).ok;
const POPPLER = tool('pdfinfo') && tool('pdftotext');
const PYPDF = run('python3', ['-I', '-c', 'import pypdf']).ok;
const squash = s => String(s).replace(/\s+/g, ' ').trim();
// Ce que pypdf trouve : le fichier est-il chiffré, ce que rendent un mauvais mot de passe, un mot de passe vide et le bon (0 = refusé, 1 = mot de passe pour ouvrir, 2 = mot de passe
// propriétaire ; `password` absent : le bon est le mot de passe vide) et, ouvert, le texte de la première page et les propriétés. pypdf ne fait pas respecter les autorisations : il lit
// le texte d'un PDF dont la copie est refusée, ce que poppler ne fait pas.
const PYPDF_CODE = `
import json, sys
from pypdf import PdfReader
path, password = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None
r = PdfReader(path)
out = {'encrypted': r.is_encrypted}
if r.is_encrypted:
    out['wrong'] = int(PdfReader(path).decrypt('pas le bon'))
    out['empty'] = int(PdfReader(path).decrypt(''))
    r = PdfReader(path)
    out['right'] = int(r.decrypt(password if password is not None else ''))
try:
    meta = r.metadata
    def prop(key):
        try:
            return str(meta[key])
        except Exception:
            return None
    out['author'], out['subject'], out['keywords'], out['title'] = prop('/Author'), prop('/Subject'), prop('/Keywords'), prop('/Title')
    out['text'] = r.pages[0].extract_text()
except Exception as e:
    out['error'] = type(e).__name__
print(json.dumps(out))
`;
const pypdf = (file, password) => {
  const r = run('python3', ['-I', '-c', PYPDF_CODE, file].concat(password === undefined ? [] : [password]));
  try { return JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { return { parseError: r.out.slice(0, 200) }; }
};
// Un clic à la vraie souris sur un élément que le défilement de la fenêtre a pu sortir de la vue : amené dans la vue d'abord.
const clickIn = async (page, sel) => {
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'nearest' }), sel);
  await sleep(80);
  await click(page, sel);
};
// Un geste qui doit lancer un téléchargement : le fichier (ou null si rien n'arrive dans le délai).
const download = (page, action, timeout = 90000) => Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), action()]).then(([file]) => file);

// Les deux menus dans une langue et un thème : sept lignes, entières, lisibles ; le PDF protégé choisi au vrai clic ; ses lignes grisées.
async function menus(page, lang, tag) {
  const W = WORDS[lang];
  console.log(`\n[${tag}] Le menu « Type d'export » : quatre types et trois qualités`);
  await hoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  const types = await measure(page, ['pdf', 'pdfProtected', 'docx', 'xlsx'].map(TYPE_ROW));
  const qualities = await measure(page, ['native', 'browser-print', 'light'].map(QUALITY_ROW));
  check(`${tag} : quatre types (${W.types.join(', ')}) puis trois qualités (${W.qualities.join(', ')})`, wanted(types, W.types) && wanted(qualities, W.qualities), { types: types.map(r => r.text), qualities: qualities.map(r => r.text) });
  check(`${tag} : les sept lignes sont entières dans le panneau 700x400, sans texte coupé, atteignables à la souris`, entire([...types, ...qualities]), [...types, ...qualities].filter(r => !(r.shown && r.inside && r.reachable && !r.cut)));
  check(`${tag} : le texte des sept lignes est lisible, >= 4,5:1`, readable([...types, ...qualities]), [...types, ...qualities].map(r => r.contrast));
  check(`${tag} : « ${W.types[1]} » est active dans un document (comme les autres types, Excel seul est grisé)`, types[1].live && types[0].live && types[2].live && types[3].greyed, types.map(r => ({ text: r.text, live: r.live, greyed: r.greyed })));

  console.log(`\n[${tag}] Un vrai clic sur « ${W.types[1]} »`);
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('pdfProtected'));
  await sleep(300);
  check(`${tag} : le type vaut « pdfProtected » et le bouton du type est allumé`, (await typeValue(page)) === 'pdfProtected' && (await typeButtonLit(page)), { type: await typeValue(page), lit: await typeButtonLit(page) });
  await hoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  const withProtected = await measure(page, ['pdf', 'pdfProtected', 'docx', 'xlsx'].map(TYPE_ROW).concat(['native', 'browser-print', 'light'].map(QUALITY_ROW)));
  const labels = await labelsOf(page, '#v2-quality-flyout');
  check(`${tag} : la qualité du PDF reste montrée avec le PDF protégé (deux intitulés, trois lignes)`, labels.length === 2 && withProtected.slice(4).every(r => r.shown), { labels });
  check(`${tag} : « ${W.types[1]} » et « ${W.qualities[0]} » sont les lignes actives`, withProtected.filter(r => r.active).map(r => r.sel).join() === [TYPE_ROW('pdfProtected'), QUALITY_ROW('native')].join(), withProtected.filter(r => r.active).map(r => r.sel));
  const browser = withProtected[5];
  check(`${tag} : « ${W.qualities[1]} » est grisée, lisible (>= 4,5:1), entière, avec sa raison en info-bulle`, browser.greyed && browser.contrast >= 4.5 && browser.shown && browser.inside && browser.title.length > 20, browser);
  check(`${tag} : les autres qualités ne sont pas grisées et n'ont pas d'info-bulle`, withProtected[4].live && withProtected[6].live && !withProtected[4].title && !withProtected[6].title, [withProtected[4], withProtected[6]]);
  await clickHoverRow(page, TYPE_MENU, QUALITY_ROW('browser-print'));
  await sleep(250);
  check(`${tag} : un vrai clic sur « ${W.qualities[1]} » grisée ne choisit rien`, (await qualityValue(page)) === 'native', { quality: await qualityValue(page) });

  console.log(`\n[${tag}] Le menu « Exporter » du PDF protégé`);
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const lines = await measure(page, ['one', 'zip', 'merged', 'sheets'].map(LINES_ROW));
  check(`${tag} : quatre options (${W.lines.join(' | ')}), entières, atteignables, lisibles (>= 4,5:1)`, wanted(lines, W.lines) && entire(lines) && readable(lines), lines.map(r => ({ text: r.text, contrast: r.contrast })));
  check(`${tag} : « une seule ligne » et « ZIP » sont actives, « un seul PDF » et « assemblage » grisées avec leur raison`, lines[0].live && lines[1].live && lines[2].greyed && lines[3].greyed && lines[2].title.length > 20 && lines[3].title.length > 20 && !lines[0].title && !lines[1].title, lines.map(r => ({ text: r.text, greyed: r.greyed, title: r.title })));
  await clickHoverRow(page, EXPORT_MENU, LINES_ROW('merged'));
  await sleep(250);
  check(`${tag} : un vrai clic sur « ${W.lines[2]} » grisée ne coche rien (« une seule ligne » reste cochée), aucune fenêtre`, (await linesValue(page)) === 'one' && !(await dialogOpen(page)), { lines: await linesValue(page) });
  await parkMouse(page);
}

// La fenêtre ouverte par le bouton Exporter : place, textes, focus.
async function dialogChecks(page, lang, tag, { batch = false, rights = { print: true, copy: true, modify: false } } = {}) {
  const W = WORDS[lang];
  const layout = await dialogLayout(page);
  check(`${tag} : la fenêtre est entière dans le panneau 700x400 (${layout.width} x ${layout.height}), titre et boutons visibles et atteignables`, layout.inside && layout.titleShown && layout.actionsShown && layout.okReachable && layout.cancelReachable && layout.passwordReachable, layout);
  // Une seule ligne : tout l'essentiel tient sans défiler. Un lot ajoute sa phrase (jusqu'à trois lignes) : le contenu peut défiler, le titre et les boutons restent en place.
  check(`${tag} : ${batch ? 'avec sa phrase de lot, le contenu peut défiler mais le titre et les boutons restent en place' : 'l\'essentiel tient sans défiler'}`, batch ? layout.titleShown && layout.actionsShown : !layout.scrolls, layout);
  check(`${tag} : le champ du mot de passe a le focus`, layout.focus === 'pp-protect-password', layout);
  const texts = await measure(page, DIALOG_TEXTS);
  check(`${tag} : le titre, les libellés, l'aide, les cases, le champ et « ${W.cancel} » sont lisibles (>= 4,5:1)`, texts.every(t => !t.missing) && readable(texts), texts.map(t => ({ sel: t.sel, contrast: t.contrast })));
  const state = await dialogState(page);
  check(`${tag} : titre « ${W.title} », bouton « ${batch ? (lang === 'fr' ? 'Générer' : 'Generate') : W.ok} », droits ${JSON.stringify(rights)} (ceux de la fois d'avant, ou imprimer et copier permis au départ)`,
    state.title === W.title && state.ok === (batch ? (lang === 'fr' ? 'Générer' : 'Generate') : W.ok) && state.cancel === W.cancel && state.print === rights.print && state.copy === rights.copy && state.modify === rights.modify && !state.okDisabled, state);
  return state;
}

let w = null;
try {
  // ---- Passe 1 : français, clair. Les menus, la fenêtre, les fichiers ----
  w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme: 'light', lang: 'fr' });
  let { page } = w;
  await pickTemplate(page, 'Modèle 0001');
  await fire(page, 'PbClients', 1);
  await menus(page, 'fr', 'français, clair');

  console.log('\n[français, clair] La fenêtre du mot de passe (Exporter, PDF protégé, une seule ligne)');
  await click(page, EXPORT_MENU);
  check('le bouton Exporter pose la fenêtre « PDF protégé »', await waitDialog(page), 'fenêtre absente');
  await sleep(300);
  await dialogChecks(page, 'fr', 'français, clair');
  // Tout permis, sans mot de passe : rien n'est protégé.
  await click(page, '#pp-protect-modify');
  await sleep(150);
  let state = await dialogState(page);
  const warning = (await measure(page, ['#pp-protect-nothing']))[0];
  check('tout permis sans mot de passe : « Exporter » est grisé et la phrase dit pourquoi, entière et lisible (>= 4,5:1)', state.okDisabled && /^Rien n’est protégé/.test(state.nothing) && warning.shown && warning.inside && warning.contrast >= 4.5, { state, warning });
  await click(page, OK);
  await sleep(300);
  check('un vrai clic sur « Exporter » grisé ne ferme pas la fenêtre', await dialogOpen(page));
  // Échap : rien n'est exporté.
  const escaped = await download(page, async () => { await page.keyboard.press('Escape'); await sleep(1500); }, 1800);
  check('Échap ferme la fenêtre, n\'exporte rien et le dit', !(await dialogOpen(page)) && escaped === null && (await status(page)) === WORDS.fr.cancelled, { file: escaped && escaped.suggestedFilename(), status: await status(page) });
  await parkMouse(page);

  console.log('\n[français, clair] Un PDF protégé : mot de passe accentué, « copier » retiré, propriétés saisies');
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(300);
  // Le groupe des propriétés, à la souris, puis la frappe.
  await click(page, '#pp-protect-modal summary');
  await sleep(250);
  const opened = await dialogLayout(page);
  check('le groupe « Propriétés du PDF » ouvert : la fenêtre reste entière, titre et boutons en place, « Exporter » atteignable', opened.inside && opened.titleShown && opened.actionsShown && opened.okReachable, opened);
  await clickIn(page, '#pp-protect-author');
  await page.keyboard.type('Anne Durand');
  await clickIn(page, '#pp-protect-subject');
  await page.keyboard.type('Courrier');
  await clickIn(page, '#pp-protect-keywords');
  await page.keyboard.type('test, pdf');
  await clickIn(page, '#pp-protect-password');
  await page.keyboard.type(PASSWORD);
  await clickIn(page, '#pp-protect-copy');
  await sleep(150);
  state = await dialogState(page);
  check('mot de passe, droits et propriétés saisis à la vraie souris et au clavier', state.password === PASSWORD && state.print && !state.copy && !state.modify && !state.okDisabled, state);
  const single = await downloadOf(page, 'protege-une-ligne', async () => { await clickIn(page, OK); });
  await sleep(500);
  check('le téléchargement est un .pdf et l\'état dit « PDF protégé généré. »', /\.pdf$/.test(single.suggested) && (await status(page)) === WORDS.fr.done, { file: single.suggested, status: await status(page) });
  check('la fenêtre s\'est refermée et le champ du mot de passe est vide', !(await dialogOpen(page)) && (await page.evaluate(() => document.getElementById('pp-protect-password').value)) === '');
  if (POPPLER) {
    const without = run('pdfinfo', [single.file]);
    const wrong = run('pdfinfo', ['-upw', 'pas le bon', single.file]);
    const right = run('pdfinfo', ['-upw', PASSWORD, single.file]);
    check('poppler : sans mot de passe ou avec un mauvais, le fichier est refusé', !without.ok && /password/i.test(without.out) && !wrong.ok && /password/i.test(wrong.out), { without: without.out.trim(), wrong: wrong.out.trim() });
    check('poppler : avec le bon mot de passe, il s\'ouvre, chiffré en AES-256 (imprimer permis, copier refusé, modifier refusé)', right.ok && /Encrypted:\s+yes \(print:yes copy:no change:no addNotes:no algorithm:AES-256\)/.test(right.out), right.out.split('\n').filter(l => /Encrypted|Error/.test(l)));
    check('poppler : auteur, sujet, mots-clés et titre relus', right.ok && /Author:\s+Anne Durand/.test(right.out) && /Subject:\s+Courrier/.test(right.out) && /Keywords:\s+test, pdf/.test(right.out) && /Title:\s+publipostage/.test(right.out), right.out.split('\n').filter(l => /Author|Subject|Keywords|Title/.test(l)));
    const text = run('pdftotext', ['-upw', PASSWORD, single.file, '-']);
    check('poppler : le texte de la ligne se lit avec le mot de passe', text.ok && squash(text.out).includes(ROW_TEXTS[0]), squash(text.out).slice(0, 120));
    check('poppler : sans mot de passe, le texte ne se lit pas', !run('pdftotext', [single.file, '-']).ok);
  } else console.log('  (poppler absent : pdfinfo et pdftotext non vérifiés)');
  if (PYPDF) {
    const seen = pypdf(single.file, PASSWORD);
    check('pypdf : chiffré, mauvais mot de passe et mot de passe vide refusés (0), le bon accepté (1 = mot de passe pour ouvrir)', seen.encrypted === true && seen.wrong === 0 && seen.empty === 0 && seen.right === 1, seen);
    check('pypdf : le texte de la ligne, l\'auteur, le sujet et les mots-clés se relisent', squash(seen.text || '').includes(ROW_TEXTS[0]) && seen.author === 'Anne Durand' && seen.subject === 'Courrier' && seen.keywords === 'test, pdf', seen);
  } else console.log('  (pypdf absent : non vérifié)');

  // Sans mot de passe pour ouvrir : seulement les autorisations (imprimer retiré).
  console.log('\n[français, clair] Sans mot de passe : le fichier s\'ouvre tout seul et ne porte que les autorisations');
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(300);
  state = await dialogState(page);
  check('la fenêtre se rouvre avec les droits et l\'auteur de la fois d\'avant, sans mot de passe', state.password === '' && state.print && !state.copy && !state.modify, state);
  await click(page, '#pp-protect-print');
  await click(page, '#pp-protect-copy');
  await sleep(150);
  state = await dialogState(page);
  check('sans mot de passe, imprimer retiré et copier permis : « Exporter » est libre', !state.okDisabled && !state.print && state.copy, state);
  const rightsOnly = await downloadOf(page, 'protege-droits-seuls', async () => { await page.keyboard.press('Enter'); });
  await sleep(500);
  if (POPPLER) {
    const free = run('pdfinfo', [rightsOnly.file]);
    check('poppler : le fichier s\'ouvre sans mot de passe et porte les autorisations (imprimer refusé, copier permis)', free.ok && /Encrypted:\s+yes \(print:no copy:yes change:no addNotes:no algorithm:AES-256\)/.test(free.out), free.out.split('\n').filter(l => /Encrypted|Error/.test(l)));
    const text = run('pdftotext', [rightsOnly.file, '-']);
    check('poppler : le texte se lit sans mot de passe', text.ok && squash(text.out).includes(ROW_TEXTS[0]), squash(text.out).slice(0, 120));
  }
  if (PYPDF) {
    const seen = pypdf(rightsOnly.file);
    check('pypdf : chiffré, il s\'ouvre avec un mot de passe vide et se lit', seen.encrypted === true && seen.empty === 1 && seen.right === 1 && squash(seen.text || '').includes(ROW_TEXTS[0]), seen);
  }
  await parkMouse(page);

  // Toutes les lignes (ZIP).
  console.log('\n[français, clair] Toutes les lignes (ZIP) en PDF protégé');
  await chooseExportLines(page, 'zip');
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  check('le bouton Exporter pose la fenêtre du lot', await waitDialog(page), 'fenêtre absente');
  await sleep(300);
  state = await dialogChecks(page, 'fr', 'français, clair, lot', { batch: true, rights: { print: false, copy: true, modify: false } });
  check('la phrase du lot dit « 3 PDF protégés pour « PbClients », regroupés dans une archive ZIP… »', state.intro === '3 PDF protégés pour « PbClients », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.', state.intro);
  const intro = (await measure(page, ['#pp-protect-intro']))[0];
  check('la phrase du lot est entière et lisible (>= 4,5:1)', intro.shown && intro.inside && intro.contrast >= 4.5, intro);
  await page.keyboard.type(PASSWORD);
  const zipOut = await downloadOf(page, 'protege-zip', async () => { await click(page, OK); });
  await sleep(600);
  check('l\'archive s\'appelle PbClients-export-pdf-protege.zip et l\'état dit « 3 PDF protégés générés — archive ZIP téléchargée. »', zipOut.suggested === 'PbClients-export-pdf-protege.zip' && (await status(page)) === '3 PDF protégés générés — archive ZIP téléchargée.', { file: zipOut.suggested, status: await status(page) });
  const dir = mkdtempSync(join(tmpdir(), 'pp-protect-zip-'));
  const unzipped = run('unzip', ['-o', '-q', zipOut.file, '-d', dir]);
  const pdfs = unzipped.ok ? readdirSync(dir).filter(f => /\.pdf$/.test(f)).sort() : [];
  check('l\'archive contient trois PDF', pdfs.length === 3, { pdfs, out: unzipped.out.slice(0, 120) });
  if (POPPLER) {
    const rows = ROW_TEXTS.map((text, i) => ({ file: join(dir, ['publipostage.pdf', 'publipostage (2).pdf', 'publipostage (3).pdf'][i]), text }));
    const results = rows.map(r => ({ without: run('pdfinfo', [r.file]), info: run('pdfinfo', ['-upw', PASSWORD, r.file]), text: run('pdftotext', ['-upw', PASSWORD, r.file, '-']), want: r.text }));
    check('poppler : chacun des trois PDF est refusé sans mot de passe et chiffré en AES-256', results.every(r => !r.without.ok && r.info.ok && /algorithm:AES-256/.test(r.info.out)), results.map(r => ({ without: r.without.ok, info: r.info.out.split('\n').filter(l => /Encrypted/.test(l)) })));
    check('poppler : avec le mot de passe, chaque PDF donne le texte de sa ligne', results.every(r => r.text.ok && squash(r.text.out).includes(r.want)), results.map(r => squash(r.text.out).slice(0, 80)));
  }
  await parkMouse(page);

  // Retour au PDF : tout redevient actif.
  console.log('\n[français, clair] Retour au PDF');
  await chooseExportLines(page, 'one');
  await clickHoverRow(page, TYPE_MENU, TYPE_ROW('pdf'));
  await sleep(300);
  await hoverRow(page, TYPE_MENU, TYPE_ROW('docx'));
  const back = await measure(page, ['native', 'browser-print', 'light'].map(QUALITY_ROW));
  await hoverRow(page, EXPORT_MENU, LINES_ROW('one'));
  const backLines = await measure(page, ['one', 'zip', 'merged', 'sheets'].map(LINES_ROW));
  check('retour au PDF : les trois qualités et les quatre options redeviennent actives, sans info-bulle, le bouton du type est éteint',
    back.every(r => r.live && !r.title) && backLines.every(r => r.live && !r.title) && !(await typeButtonLit(page)), { back: back.map(r => [r.live, r.title]), lines: backLines.map(r => [r.live, r.title]) });
  await parkMouse(page);

  // Le mot de passe n'est écrit nulle part.
  console.log('\n[français, clair] Le mot de passe n\'est écrit nulle part');
  const leaks = await page.evaluate(secret => {
    const dump = JSON.stringify([Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]), Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])]);
    const stub = window.__gristStub;
    return { storage: dump.includes(secret), actions: JSON.stringify(stub.getActionLog()).includes(secret), rows: JSON.stringify(stub.state.rows).includes(secret), kept: localStorage.getItem('pp_pdf_protection') };
  }, PASSWORD);
  check('ni le stockage du navigateur, ni les actions envoyées à Grist, ni le document ne contiennent le mot de passe', !leaks.storage && !leaks.actions && !leaks.rows, leaks);
  check('seuls les droits et l\'auteur sont gardés dans le navigateur', JSON.stringify(Object.keys(JSON.parse(leaks.kept || '{}'))) === JSON.stringify(['allowPrint', 'allowCopy', 'allowModify', 'author']), leaks.kept);
  check('aucune erreur de page (passe française)', realErrors(w).length === 0, realErrors(w));
  await w.close();
  w = null;

  // ---- Passe 2 : anglais, thème sombre. Les menus, la fenêtre, un export ----
  w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme: 'dark', lang: 'en' });
  ({ page } = w);
  await pickTemplate(page, 'Modèle 0001');
  await fire(page, 'PbClients', 1);
  await menus(page, 'en', 'anglais, sombre');
  console.log('\n[anglais, sombre] La fenêtre du mot de passe');
  await click(page, EXPORT_MENU);
  check('le bouton Export pose la fenêtre « Protected PDF »', await waitDialog(page), 'fenêtre absente');
  await sleep(300);
  await dialogChecks(page, 'en', 'anglais, sombre');
  await click(page, '#pp-protect-modify');
  await sleep(150);
  state = await dialogState(page);
  const warningEn = (await measure(page, ['#pp-protect-nothing']))[0];
  check('tout permis sans mot de passe : « Export » est grisé et la phrase anglaise le dit, lisible (>= 4,5:1)', state.okDisabled && /^Nothing is protected/.test(state.nothing) && warningEn.shown && warningEn.inside && warningEn.contrast >= 4.5, { state, warningEn });
  await click(page, '#pp-protect-modify');
  await click(page, '#pp-protect-password');
  await page.keyboard.type('secret-en-1');
  const enOut = await downloadOf(page, 'protege-en', async () => { await click(page, OK); });
  await sleep(500);
  check('l\'état dit « Protected PDF generated. »', (await status(page)) === WORDS.en.done, await status(page));
  if (POPPLER) {
    const info = run('pdfinfo', ['-upw', 'secret-en-1', enOut.file]);
    check('poppler : le PDF s\'ouvre avec le mot de passe, chiffré en AES-256 (imprimer et copier permis, modifier refusé)', info.ok && /Encrypted:\s+yes \(print:yes copy:yes change:no addNotes:no algorithm:AES-256\)/.test(info.out), info.out.split('\n').filter(l => /Encrypted|Error/.test(l)));
  }
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Échap ferme la fenêtre et l\'état dit « Export cancelled. »', !(await dialogOpen(page)) && (await status(page)) === WORDS.en.cancelled, await status(page));
  check('aucune erreur de page (passe anglaise)', realErrors(w).length === 0, realErrors(w));
  await w.close();
  w = null;
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
