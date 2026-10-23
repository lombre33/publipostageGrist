#!/usr/bin/env node
// Le type « PDF protégé » du menu « Type d'export » au VRAI clic et à la vraie frappe, à 700x400 (le panneau de Grist), et les fichiers téléchargés relus par d'autres lecteurs que le
// navigateur (poppler : pdfinfo et pdftotext ; pypdf) : ce qu'Antoine fait et ce qu'une autre personne trouve en ouvrant le PDF. Demande d'Antoine du 12/10 : « Protection du PDF Ok pour
// le dev, proposer ca dans le choix des type d'export genre "pdf protégé" ».
//   1) le menu « Type d'export » à quatre types (PDF, PDF protégé, Word, Excel) et trois qualités : les sept lignes entières dans le panneau, sans texte coupé, atteignables, lisibles
//      (>= 4,5:1), en français clair puis en anglais sombre ; « PDF protégé » se choisit au clic (bouton du type allumé) ; « Impression navigateur », « un seul PDF » et « Assemblage »
//      y sont grisées - toujours lisibles -, avec leur raison, et un vrai clic dessus ne choisit rien ;
//   2) la fenêtre du mot de passe : entière dans le panneau, titre et boutons visibles, l'essentiel (les trois façons de donner le mot de passe, son champ, les trois autorisations) sans
//      défiler, le champ a le focus, tous les textes lisibles (>= 4,5:1) ; tout permis sans mot de passe grise « Exporter » et le dit ; Échap n'exporte rien ; rouverte, la fenêtre a ses
//      propriétés repliées et son contenu en haut ;
//   3) le PDF d'une ligne : le mot de passe (accentué) tapé au clavier, une autorisation retirée et les propriétés saisies à la souris, puis « Exporter » : le fichier est chiffré en
//      AES-256, poppler et pypdf le refusent sans mot de passe ou avec un mauvais, l'ouvrent avec le bon, y lisent le texte de la ligne, les autorisations (copier refusé) et les
//      propriétés ; sans mot de passe pour ouvrir, un PDF qui s'ouvre tout seul et ne porte que les autorisations ;
//   4) toutes les lignes de la vue (ZIP) : la fenêtre dit combien de PDF, l'archive contient un PDF chiffré par ligne, chacun s'ouvre avec le mot de passe et porte le texte de sa ligne ;
//   5) les trois façons de donner le mot de passe (demande d'Antoine du 12/10, « laisser 3 choix à l'utilisateur ») : « saisi à chaque export » ne s'écrit nulle part ; « le même pour tous,
//      enregistré dans le document » : la fenêtre dit où (table, colonne, ligne) et le risque, lisibles, le mot de passe tapé s'écrit AVANT l'export dans la colonne MotDePassePdf de la ligne
//      « Réglages du document » (une seule ligne, jamais dans le navigateur), se retrouve à la fenêtre suivante, ne se réécrit pas s'il ne change pas, se remplace, et ouvre les PDF d'une
//      ligne et d'un lot ; « un par ligne » : la liste avec recherche ne propose que les colonnes qui peuvent donner un mot de passe, le risque est dit, chaque PDF s'ouvre avec le mot de
//      passe de SA ligne (espaces autour retirés) et avec aucun autre, une cellule vide fait échouer sa ligne seule (jamais un PDF sans mot de passe), le dit dans le coin d'état et la
//      liste de fin de lot ; le tout en français clair et en anglais sombre ;
//   6) le mot de passe saisi n'est écrit nulle part (stockage du navigateur, journal des actions envoyées à Grist, document) ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « pdfProtectionMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pdf-protection-mouse.mjs
import { open, stopServer, sleep, click, hoverRow, clickHoverRow, chooseExportType, chooseExportLines, fire, pickTemplate, status, downloadOf as downloadOfLib } from './load-lib.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PDF_PROTECTION_PORT || 9011);
// Un export qui ne part pas fait échouer le script au bout de 90 s (la bibliothèque attend 10 minutes).
const downloadOf = (page, name, action, timeout = 90000) => downloadOfLib(page, name, action, timeout);
// `Mdp` est la colonne des mots de passe par ligne ; `Quand` et `Fait` (une date, une case à cocher) ne peuvent pas en donner un : la liste des colonnes ne doit pas les proposer.
const SPEC = { tables: [{ id: 'PbClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }, { id: 'Mdp', type: 'Text' }, { id: 'Quand', type: 'Date' }, { id: 'Fait', type: 'Bool' }] }], models: { count: 1, paragraphs: 2, table: 'PbClients', columns: ['Nom'] } };
const TYPE_MENU = '#v2-btn-quality';
const EXPORT_MENU = '#btn-export-pdf';
const TYPE_ROW = name => '#v2-quality-flyout .v2-hover-row[data-export-type="' + name + '"]';
const QUALITY_ROW = name => '#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]';
const LINES_ROW = name => '#v2-export-pdf-flyout .v2-hover-row[data-export-lines="' + name + '"]';
const OK = '#pp-protect-modal .pp-modal-actions .var-modal-primary';
const CANCEL = '#pp-protect-modal .pp-modal-actions button:not(.var-modal-primary)';
const PASSWORD = 'stub-token-Sésame-ÿ 42';
// Le mot de passe commun enregistré dans le document, puis son remplaçant ; les mots de passe par ligne (la deuxième cellule a des espaces autour, la troisième est vide).
const STORED = 'stub-token-Coffre-ÿ 7';
const STORED_NEXT = 'stub-token-Coffre-2';
const ROW_PASSWORDS = ['stub-token-Sésame-ÿ 1', '  stub-token-beta 2  ', ''];
const ROW_PASSWORD_1 = ROW_PASSWORDS[0];
const ROW_PASSWORD_2 = ROW_PASSWORDS[1].trim();
// Le texte que la bulle « Nom » de la première ligne donne dans le PDF (dev-tests/load-doc.js : table + colonne + mot + numéro de ligne).
const ROW_TEXTS = ['PbClients Nom alpha 1', 'PbClients Nom beta 2', 'PbClients Nom gamma 3'];

const WORDS = {
  fr: { types: ['PDF', 'PDF protégé', 'Word (bêta)', 'Excel'], qualities: ['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)'], title: 'PDF protégé', ok: 'Exporter', cancel: 'Annuler', cancelled: 'Export annulé.', done: 'PDF protégé généré.', lines: ['Une seule ligne', 'Toutes les lignes de la vue (ZIP)', 'Toutes les lignes de la vue en un seul PDF', 'Assemblage avant impression'] },
  en: { types: ['PDF', 'Protected PDF', 'Word (beta)', 'Excel'], qualities: ['Vector (default)', 'Browser print', 'Light (smaller images)'], title: 'Protected PDF', ok: 'Export', cancel: 'Cancel', cancelled: 'Export canceled.', done: 'Protected PDF generated.', lines: ['A single row', 'All rows of the view (ZIP)', 'All rows of the view as a single PDF', 'Assemble before printing'] },
};
// Les trois façons de donner le mot de passe : leurs noms, où le mot de passe commun s'écrit, les deux avertissements de risque et la raison d'un « Exporter » grisé.
const MODE_WORDS = {
  fr: {
    legend: 'Mot de passe du PDF', modes: ['Saisi à chaque export (recommandé)', 'Le même pour tous, enregistré dans le document', 'Un par ligne, lu dans une colonne'],
    where: 'Enregistré dans la table « Publipostage_Modeles », colonne « MotDePassePdf » (« Mot de passe des PDF protégés »), ligne « Réglages du document ».',
    storedRisk: 'Risque : ce mot de passe est écrit en clair dans le document. Toute personne qui l’ouvre peut le lire, sauf si des permissions avancées de Grist en réservent l’accès. Le saisir à chaque export est plus sûr.',
    columnRisk: 'Risque : les mots de passe sont écrits en clair dans la table « PbClients ». Toute personne qui ouvre le document peut les lire, sauf si des permissions avancées de Grist en réservent l’accès.',
    pick: 'Choisir la colonne des mots de passe.', columnLabel: 'Colonne des mots de passe', storedLabel: 'Mot de passe commun à tous les PDF',
    batchStored: '3 PDF protégés pour « PbClients », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.',
    batchColumn: '3 PDF protégés pour « PbClients », regroupés dans une archive ZIP, chacun avec le mot de passe de sa ligne et les mêmes autorisations.',
    empty: 'Pas de mot de passe pour cette ligne : la colonne « Mdp » est vide. Aucun PDF n’a été généré.',
    failures: '2 PDF protégés générés, 1 échec — archive ZIP téléchargée.', failTitle: 'Un document n’a pas été généré', failClose: 'Fermer',
  },
  en: {
    legend: 'PDF password', modes: ['Typed at each export (recommended)', 'Same for all, saved in the document', 'One per row, read from a column'],
    where: 'Saved in table “Publipostage_Modeles”, column “MotDePassePdf” (“Mot de passe des PDF protégés”), row “Réglages du document”.',
    storedRisk: 'Risk: this password is written in plain text in the document. Anyone who opens it can read it, unless advanced Grist permissions restrict access. Typing it at each export is safer.',
    columnRisk: 'Risk: the passwords are written in plain text in table “PbClients”. Anyone who opens the document can read them, unless advanced Grist permissions restrict access.',
    pick: 'Choose the password column.', columnLabel: 'Password column', storedLabel: 'Password shared by all the PDFs',
  },
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
// Sa place dans le panneau, l'essentiel sans défiler, ses textes (contraste) et ce qui est cliquable. `reach` : le champ du mode choisi (atteignable à la souris) ; `essentials` : ce qui doit
// se voir sans défiler le contenu (`outOfView` rend ceux qui n'y sont pas).
const dialogLayout = (page, { reach: mainField = '#pp-protect-password', essentials = [] } = {}) => page.evaluate(({ mainField, essentials }) => {
  const ov = document.getElementById('pp-protect-modal');
  const box = ov.querySelector('.pp-modal-box');
  const body = ov.querySelector('.pp-modal-body');
  const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const b = rect(box);
  const header = rect(ov.querySelector('.pp-modal-header'));
  const actions = rect(ov.querySelector('.pp-modal-actions'));
  const reach = sel => { const el = ov.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && el.contains(top); };
  const view = body.getBoundingClientRect();
  const inView = sel => { const el = ov.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= view.top - 1 && r.bottom <= view.bottom + 1; };
  return {
    outOfView: essentials.filter(sel => !inView(sel)),
    inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, height: Math.round(b.height), width: Math.round(b.width),
    titleShown: header.top >= 0 && header.bottom <= innerHeight, actionsShown: actions.bottom <= innerHeight && actions.top >= 0,
    scrolls: body.scrollHeight > body.clientHeight + 1, overflow: body.scrollHeight - body.clientHeight,
    okReachable: reach('.pp-modal-actions .var-modal-primary'), cancelReachable: reach('.pp-modal-actions button:not(.var-modal-primary)'), passwordReachable: reach(mainField),
    focus: document.activeElement && document.activeElement.id,
  };
}, { mainField, essentials });
// Ce qui se voit sans défiler quand le mot de passe est saisi à l'export : les trois façons de le donner, son champ et les trois autorisations (« Propriétés » peut être plus bas).
const TYPED_ESSENTIALS = ['#pp-protect-mode-typed', '#pp-protect-mode-stored', '#pp-protect-mode-column', '#pp-protect-password', '#pp-protect-print', '#pp-protect-copy', '#pp-protect-modify'];
const MODE_RADIOS = ['#pp-protect-mode-typed', '#pp-protect-mode-stored', '#pp-protect-mode-column'];
const STORED_ESSENTIALS = MODE_RADIOS.concat(['#pp-protect-stored', '#pp-protect-where', '#pp-protect-stored-risk']);
const COLUMN_ESSENTIALS = MODE_RADIOS.concat(['#pp-protect-panel-column .ss-trigger', '#pp-protect-column-hint', '#pp-protect-column-risk']);
const DIALOG_TEXTS = ['#pp-protect-title', 'label[for="pp-protect-password"]', '#pp-protect-show + span', '#pp-protect-password-hint', '#pp-protect-modal fieldset.pp-protect-modes legend', '#pp-protect-modal fieldset.pp-protect-rights legend',
  '#pp-protect-mode-typed + span', '#pp-protect-mode-stored + span', '#pp-protect-mode-column + span', '#pp-protect-print + span', '#pp-protect-copy + span', '#pp-protect-modify + span',
  '#pp-protect-rights-note', '.pp-protect-summary', '#pp-protect-password', '#pp-protect-modal .pp-modal-actions button:not(.var-modal-primary)'];
const STORED_TEXTS = ['label[for="pp-protect-stored"]', '#pp-protect-show-stored + span', '#pp-protect-stored', '#pp-protect-where', '#pp-protect-stored-risk strong', '#pp-protect-stored-risk span'];
const COLUMN_TEXTS = ['label[for="pp-protect-column"]', '#pp-protect-panel-column .ss-trigger', '#pp-protect-column-hint', '#pp-protect-column-risk strong', '#pp-protect-column-risk span'];
const dialogState = page => page.evaluate(() => ({
  title: document.getElementById('pp-protect-title').textContent, intro: document.getElementById('pp-protect-intro').hidden ? '' : document.getElementById('pp-protect-intro').textContent,
  ok: document.querySelector('#pp-protect-modal .pp-modal-actions .var-modal-primary').textContent, okDisabled: document.querySelector('#pp-protect-modal .pp-modal-actions .var-modal-primary').disabled,
  cancel: document.querySelector('#pp-protect-modal .pp-modal-actions button:not(.var-modal-primary)').textContent,
  nothing: document.getElementById('pp-protect-nothing').hidden ? '' : document.getElementById('pp-protect-nothing').textContent,
  print: document.getElementById('pp-protect-print').checked, copy: document.getElementById('pp-protect-copy').checked, modify: document.getElementById('pp-protect-modify').checked,
  password: document.getElementById('pp-protect-password').value,
  mode: (document.querySelector('input[name="pp-protect-mode"]:checked') || {}).value,
  stored: document.getElementById('pp-protect-stored').value, storedType: document.getElementById('pp-protect-stored').type, storedDisabled: document.getElementById('pp-protect-stored').disabled,
  storedStatus: document.getElementById('pp-protect-stored-status').hidden ? '' : document.getElementById('pp-protect-stored-status').textContent,
  where: document.getElementById('pp-protect-where').textContent.replace(/\s+/g, ' ').trim(), storedRisk: document.getElementById('pp-protect-stored-risk').textContent.replace(/\s+/g, ' ').trim(),
  error: document.getElementById('pp-protect-error').hidden ? '' : document.getElementById('pp-protect-error').textContent,
  column: document.getElementById('pp-protect-column').value, columnDisabled: document.getElementById('pp-protect-column').disabled,
  columnHint: document.getElementById('pp-protect-column-hint').textContent.replace(/\s+/g, ' ').trim(), columnRisk: document.getElementById('pp-protect-column-risk').textContent.replace(/\s+/g, ' ').trim(),
}));
// Le mode du mot de passe choisi à la vraie souris (sur son texte), puis le temps que la fenêtre se redessine.
const pickMode = async (page, mode) => { await click(page, `#pp-protect-mode-${mode} + span`); await sleep(500); };
// Le champ du mot de passe commun se libère quand la lecture du document est finie.
const storedReady = page => page.waitForFunction(() => { const f = document.getElementById('pp-protect-stored'); return !!f && !f.disabled; }, null, { timeout: 15000 });

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Le fichier s'ouvre-t-il avec ce mot de passe ? (poppler ; à défaut pypdf, où 1 et 2 disent qu'un mot de passe, celui pour ouvrir ou celui du propriétaire, a été accepté)
const opensWith = (file, password) => (POPPLER ? run('pdfinfo', ['-upw', password, file]).ok : PYPDF ? pypdf(file, password).right >= 1 : null);
const textWith = (file, password) => (POPPLER ? squash(run('pdftotext', ['-upw', password, file, '-']).out) : '');
// Ce que le document garde du mot de passe commun : les lignes réservées « Réglages du document » (il n'en faut qu'une) et la cellule de la colonne MotDePassePdf de la première.
const docPassword = page => page.evaluate(() => {
  const t = window.__gristStub.state.rows.Publipostage_Modeles;
  const at = (t.TypeModele || []).map((type, i) => (type === 'reglages' ? i : -1)).filter(i => i !== -1);
  return { rows: at.length, name: at.length ? t.Nom[at[0]] : null, password: at.length && t.MotDePassePdf ? t.MotDePassePdf[at[0]] : null, hasColumn: !!t.MotDePassePdf, listed: (t.TypeModele || []).filter(type => type !== 'reglages').length };
});
// Les écritures du mot de passe commun depuis le repère `from` (la longueur du journal à ce moment), et l'ordre « colonne créée, puis ligne » dans tout le journal.
const logLength = page => page.evaluate(() => window.__gristStub.getActionLog().length);
const passwordWrites = (page, from) => page.evaluate(from => window.__gristStub.getActionLog().slice(from).filter(a => a[1] === 'Publipostage_Modeles' && a[3] && typeof a[3] === 'object' && Object.prototype.hasOwnProperty.call(a[3], 'MotDePassePdf')).length, from);
const columnBeforeRow = page => page.evaluate(() => {
  const log = window.__gristStub.getActionLog();
  const col = log.findIndex(a => a[0] === 'AddVisibleColumn' && a[1] === 'Publipostage_Modeles' && a[2] === 'MotDePassePdf');
  const row = log.findIndex(a => a[0] === 'AddRecord' && a[1] === 'Publipostage_Modeles' && a[3] && 'MotDePassePdf' in a[3]);
  return { col, row };
});
// Le bouton Exporter n'est pas resté verrouillé (un export qui échoue le libère).
const exportUnlocked = page => page.evaluate(() => document.getElementById('btn-export-pdf').style.pointerEvents !== 'none');
// L'archive dépaquetée : les PDF qu'elle contient, par nom de fichier.
function unzipPdfs(zipFile, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const unzipped = run('unzip', ['-o', '-q', zipFile, '-d', dir]);
  const names = unzipped.ok ? readdirSync(dir).filter(f => /\.pdf$/.test(f)).sort() : [];
  return { dir, names, out: unzipped.out.slice(0, 120) };
}

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
  const layout = await dialogLayout(page, { reach: '#pp-protect-password', essentials: TYPED_ESSENTIALS });
  check(`${tag} : la fenêtre est entière dans le panneau 700x400 (${layout.width} x ${layout.height}), titre et boutons visibles et atteignables`, layout.inside && layout.titleShown && layout.actionsShown && layout.okReachable && layout.cancelReachable && layout.passwordReachable, layout);
  // Une seule ligne : l'essentiel (les trois façons de donner le mot de passe, le champ, les trois autorisations) se voit sans défiler, seules les propriétés peuvent être plus bas. Un lot ajoute sa
  // phrase (jusqu'à trois lignes) : le contenu peut défiler, le titre et les boutons restent en place.
  check(`${tag} : ${batch ? 'avec sa phrase de lot, le contenu peut défiler mais le titre et les boutons restent en place' : 'l\'essentiel (les trois façons de donner le mot de passe, le champ, les trois autorisations) se voit sans défiler'}`, batch ? layout.titleShown && layout.actionsShown : layout.outOfView.length === 0, layout);
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
  await clickIn(page, '#pp-protect-modal summary');
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
  // La fenêtre est la même d'une fois à l'autre : les propriétés (ouvertes et remplies tout à l'heure) sont repliées et le contenu est en haut, sinon elle s'ouvre là où l'autre a fini.
  const reopened = await page.evaluate(() => { const ov = document.getElementById('pp-protect-modal'); return { open: ov.querySelector('details.pp-protect-props').open, scrollTop: ov.querySelector('.pp-modal-body').scrollTop }; });
  check('la fenêtre rouverte a ses propriétés repliées et son contenu en haut, même après des propriétés saisies et un défilement', !reopened.open && reopened.scrollTop === 0, reopened);
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

  // Toutes les lignes de la vue (ZIP).
  console.log('\n[français, clair] Toutes les lignes de la vue (ZIP) en PDF protégé');
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

  // ---- Les trois façons de donner le mot de passe ----
  const MW = MODE_WORDS.fr;
  const nothingRow = async () => (await measure(page, ['#pp-protect-nothing']))[0];

  console.log('\n[français, clair] Les trois façons de donner le mot de passe');
  await chooseExportLines(page, 'one');
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(300);
  state = await dialogState(page);
  const modeRows = await measure(page, MODE_RADIOS.map(sel => sel + ' + span'));
  check(`la fenêtre propose les trois façons (${MW.modes.join(' | ')}), entières et lisibles (>= 4,5:1), « saisi à chaque export » cochée au départ`, wanted(modeRows, MW.modes) && entire(modeRows) && readable(modeRows) && state.mode === 'typed', { modes: modeRows.map(r => r.text), mode: state.mode });

  // -- Le même pour tous, enregistré dans le document --
  console.log('\n[français, clair] Le même mot de passe pour tous, enregistré dans le document');
  await pickMode(page, 'stored');
  await storedReady(page);
  state = await dialogState(page);
  const storedLayout = await dialogLayout(page, { reach: '#pp-protect-stored', essentials: STORED_ESSENTIALS });
  check('« le même pour tous » : la fenêtre est entière dans le panneau 700x400, titre et boutons atteignables ; les trois choix, le champ, l\'endroit et le risque se voient sans défiler',
    storedLayout.inside && storedLayout.titleShown && storedLayout.actionsShown && storedLayout.okReachable && storedLayout.cancelReachable && storedLayout.passwordReachable && storedLayout.outOfView.length === 0, storedLayout);
  check('« le même pour tous » : la fenêtre dit où le mot de passe s\'écrit (table, colonne, ligne)', state.where === MW.where, state.where);
  check('« le même pour tous » : la fenêtre dit le risque (en clair, lisible par toute personne qui ouvre le document sauf permissions avancées de Grist)', state.storedRisk === MW.storedRisk, state.storedRisk);
  const storedTexts = await measure(page, STORED_TEXTS);
  check('« le même pour tous » : le libellé, le champ, l\'endroit et le risque sont affichés et lisibles (>= 4,5:1)', storedTexts.every(t => !t.missing && t.shown) && readable(storedTexts), storedTexts.map(t => ({ sel: t.sel, shown: t.shown, contrast: t.contrast })));
  check('« le même pour tous » : le champ est vide et masqué (aucun mot de passe enregistré), libre, « Exporter » est libre', state.stored === '' && state.storedType === 'password' && !state.storedDisabled && !state.okDisabled && state.storedStatus === '', state);
  check('« le même pour tous » : le champ du mot de passe saisi (mode d\'avant) et celui-ci sont deux champs', state.password === '', state);

  await clickIn(page, '#pp-protect-stored');
  await page.keyboard.type(STORED);
  state = await dialogState(page);
  check('le mot de passe commun, tapé au clavier, est dans le champ et « Exporter » est libre', state.stored === STORED && !state.okDisabled, state);
  const storedOut = await downloadOf(page, 'protege-commun-1', async () => { await clickIn(page, OK); });
  await sleep(800);
  check('le téléchargement est un .pdf et l\'état dit « PDF protégé généré. »', /\.pdf$/.test(storedOut.suggested) && (await status(page)) === WORDS.fr.done, { file: storedOut.suggested, status: await status(page) });
  let kept = await docPassword(page);
  const order = await columnBeforeRow(page);
  check('le mot de passe est écrit dans le document : une seule ligne « Réglages du document », colonne MotDePassePdf, la colonne créée avant la ligne, aucun modèle de plus dans la liste',
    kept.rows === 1 && kept.name === 'Réglages du document' && kept.password === STORED && kept.hasColumn && order.col !== -1 && order.row !== -1 && order.col < order.row && kept.listed === 1, { kept, order });
  check('le mot de passe commun n\'est pas dans le stockage du navigateur', !(await page.evaluate(secret => JSON.stringify([Object.keys(localStorage).map(k => localStorage.getItem(k)), Object.keys(sessionStorage).map(k => sessionStorage.getItem(k))]).includes(secret), STORED)));
  if (POPPLER) {
    const info = run('pdfinfo', ['-upw', STORED, storedOut.file]);
    check('poppler : le PDF s\'ouvre avec le mot de passe commun (AES-256) ; ni sans mot de passe, ni avec celui saisi plus haut', info.ok && /algorithm:AES-256/.test(info.out) && !run('pdfinfo', [storedOut.file]).ok && !opensWith(storedOut.file, PASSWORD), info.out.split('\n').filter(l => /Encrypted|Error/.test(l)));
    check('poppler : avec le mot de passe commun, le texte de la ligne se lit', textWith(storedOut.file, STORED).includes(ROW_TEXTS[0]), textWith(storedOut.file, STORED).slice(0, 100));
  }
  if (PYPDF) {
    const seen = pypdf(storedOut.file, STORED);
    check('pypdf : chiffré, mauvais mot de passe et mot de passe vide refusés (0), le mot de passe commun accepté (1)', seen.encrypted === true && seen.wrong === 0 && seen.empty === 0 && seen.right === 1 && squash(seen.text || '').includes(ROW_TEXTS[0]), seen);
  }

  // Rouvert : le mode et le mot de passe reviennent (masqué) ; sans changement, rien n'est réécrit.
  await parkMouse(page);
  let mark = await logLength(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await storedReady(page);
  await sleep(300);
  state = await dialogState(page);
  check('la fenêtre suivante rouvre « le même pour tous » et retrouve le mot de passe enregistré, masqué', state.mode === 'stored' && state.stored === STORED && state.storedType === 'password' && !state.storedDisabled && !state.okDisabled, state);
  await click(page, '#pp-protect-show-stored');
  await sleep(150);
  const shownType = (await dialogState(page)).storedType;
  await click(page, '#pp-protect-show-stored');
  await sleep(150);
  check('« Afficher le mot de passe » le démasque à la vraie souris, puis le masque', shownType === 'text' && (await dialogState(page)).storedType === 'password', shownType);
  const unchanged = await downloadOf(page, 'protege-commun-2', async () => { await page.keyboard.press('Enter'); });
  await sleep(800);
  check('sans changement, Entrée exporte sans réécrire le mot de passe dans le document', (await passwordWrites(page, mark)) === 0 && (await docPassword(page)).password === STORED && !(await dialogOpen(page)), { writes: await passwordWrites(page, mark) });
  if (POPPLER) check('poppler : ce PDF s\'ouvre avec le même mot de passe commun', opensWith(unchanged.file, STORED), unchanged.file);

  // Changé : écrit avant l'export, la ligne du document est mise à jour (jamais une seconde).
  await parkMouse(page);
  mark = await logLength(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await storedReady(page);
  await sleep(300);
  await clickIn(page, '#pp-protect-stored');
  await page.keyboard.press('Control+A');
  await page.keyboard.type(STORED_NEXT);
  const replaced = await downloadOf(page, 'protege-commun-3', async () => { await clickIn(page, OK); });
  await sleep(800);
  kept = await docPassword(page);
  check('un nouveau mot de passe commun remplace l\'ancien dans le document : une seule ligne réservée, une seule écriture', kept.rows === 1 && kept.password === STORED_NEXT && (await passwordWrites(page, mark)) === 1, { kept, writes: await passwordWrites(page, mark) });
  if (POPPLER) check('poppler : le PDF s\'ouvre avec le nouveau mot de passe commun et plus avec l\'ancien', opensWith(replaced.file, STORED_NEXT) && !opensWith(replaced.file, STORED), replaced.file);

  // Le lot : tous les PDF avec le mot de passe commun.
  await chooseExportLines(page, 'zip');
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await storedReady(page);
  await sleep(300);
  state = await dialogState(page);
  check('le lot « le même pour tous » : la phrase dit « …avec le même mot de passe et les mêmes autorisations », le champ retrouve le mot de passe, le bouton dit « Générer »', state.intro === MW.batchStored && state.stored === STORED_NEXT && state.ok === 'Générer', state);
  const storedZip = await downloadOf(page, 'protege-commun-zip', async () => { await clickIn(page, OK); });
  await sleep(800);
  const storedPdfs = unzipPdfs(storedZip.file, 'pp-protect-stored-');
  check('l\'archive contient trois PDF', storedPdfs.names.length === 3, storedPdfs);
  if (POPPLER) check('poppler : chacun des trois PDF s\'ouvre avec le mot de passe commun, aucun avec l\'ancien ni sans mot de passe', storedPdfs.names.every(name => opensWith(join(storedPdfs.dir, name), STORED_NEXT) && !opensWith(join(storedPdfs.dir, name), STORED) && !run('pdfinfo', [join(storedPdfs.dir, name)]).ok), storedPdfs.names);
  await parkMouse(page);

  // -- Un par ligne, lu dans une colonne --
  console.log('\n[français, clair] Un mot de passe par ligne, lu dans une colonne');
  await page.evaluate(passwords => { const t = window.__gristStub.state.rows.PbClients; passwords.forEach((p, i) => { t.Mdp[i] = p; }); }, ROW_PASSWORDS);
  await chooseExportLines(page, 'one');
  await fire(page, 'PbClients', 1);
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(300);
  await pickMode(page, 'column');
  state = await dialogState(page);
  const columnLayout = await dialogLayout(page, { reach: '#pp-protect-panel-column .ss-trigger', essentials: COLUMN_ESSENTIALS });
  check('« un par ligne » : la fenêtre est entière dans le panneau 700x400, titre et boutons atteignables ; les trois choix, la liste, l\'aide et le risque se voient sans défiler',
    columnLayout.inside && columnLayout.titleShown && columnLayout.actionsShown && columnLayout.okReachable && columnLayout.cancelReachable && columnLayout.passwordReachable && columnLayout.outOfView.length === 0, columnLayout);
  const pickWarning = await nothingRow();
  check('« un par ligne » sans colonne choisie : « Exporter » est grisé et la phrase « ' + MW.pick + ' » le dit, entière et lisible (>= 4,5:1)', state.okDisabled && state.nothing === MW.pick && pickWarning.shown && pickWarning.inside && pickWarning.contrast >= 4.5, { state: { okDisabled: state.okDisabled, nothing: state.nothing }, pickWarning });
  check('« un par ligne » : la fenêtre dit le risque d\'un mot de passe en clair dans la table', state.columnRisk === MW.columnRisk, state.columnRisk);
  const columnTexts = await measure(page, COLUMN_TEXTS);
  check('« un par ligne » : le libellé, la liste, l\'aide et le risque sont affichés et lisibles (>= 4,5:1)', columnTexts.every(t => !t.missing && t.shown) && readable(columnTexts), columnTexts.map(t => ({ sel: t.sel, shown: t.shown, contrast: t.contrast })));
  await click(page, '#pp-protect-panel-column .ss-trigger');
  await sleep(500);
  const options = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-protect-panel-column .ss-option')).map(o => {
    const r = o.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: o.textContent.trim(), empty: o.classList.contains('is-empty'), inside: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && o.contains(top) };
  }));
  const choices = options.filter(o => !o.empty);
  check('la liste avec recherche ne propose que les colonnes qui peuvent donner un mot de passe, après « — Choisir une colonne — » : « Nom » et « Mdp », ni la date « Quand » ni la case « Fait »', options.length === 3 && options[0].empty && /Choisir une colonne/.test(options[0].text) && choices.length === 2 && /^Nom/.test(choices[0].text) && /^Mdp/.test(choices[1].text), options);
  check('les trois lignes de la liste sont entières dans le panneau et atteignables à la souris', options.every(o => o.inside && o.reachable), options);
  await page.keyboard.type('md');
  await sleep(300);
  await page.keyboard.press('Enter');
  await sleep(400);
  state = await dialogState(page);
  check('« md » tapé dans la recherche puis Entrée choisissent « Mdp » sans valider la fenêtre ; « Exporter » se libère', state.column === 'Mdp' && (await dialogOpen(page)) && !state.okDisabled && state.nothing === '', { column: state.column, okDisabled: state.okDisabled, nothing: state.nothing });
  const row1 = await downloadOf(page, 'protege-ligne-1', async () => { await clickIn(page, OK); });
  await sleep(800);
  check('le PDF de la ligne 1 est téléchargé et l\'état dit « PDF protégé généré. »', /\.pdf$/.test(row1.suggested) && (await status(page)) === WORDS.fr.done, { file: row1.suggested, status: await status(page) });
  if (POPPLER) {
    const info = run('pdfinfo', ['-upw', ROW_PASSWORD_1, row1.file]);
    check('poppler : le PDF de la ligne 1 s\'ouvre avec le mot de passe de sa cellule (accentué), chiffré en AES-256, et avec aucun autre (ni celui de la ligne 2, ni le commun)', info.ok && /algorithm:AES-256/.test(info.out) && !opensWith(row1.file, ROW_PASSWORD_2) && !opensWith(row1.file, STORED_NEXT) && !run('pdfinfo', [row1.file]).ok, info.out.split('\n').filter(l => /Encrypted|Error/.test(l)));
    check('poppler : avec ce mot de passe, le texte de la ligne 1 se lit', textWith(row1.file, ROW_PASSWORD_1).includes(ROW_TEXTS[0]), textWith(row1.file, ROW_PASSWORD_1).slice(0, 100));
  }
  if (PYPDF) {
    const seen = pypdf(row1.file, ROW_PASSWORD_1);
    check('pypdf : chiffré, mot de passe vide refusé (0), celui de la ligne 1 accepté (1)', seen.encrypted === true && seen.empty === 0 && seen.right === 1 && squash(seen.text || '').includes(ROW_TEXTS[0]), seen);
  }

  // La ligne 2 : sa cellule a des espaces autour, retirés.
  await fire(page, 'PbClients', 2);
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(500);
  state = await dialogState(page);
  check('la fenêtre se rouvre sur « un par ligne » avec la colonne « Mdp » de la fois d\'avant, « Exporter » libre', state.mode === 'column' && state.column === 'Mdp' && !state.okDisabled, { mode: state.mode, column: state.column, okDisabled: state.okDisabled });
  const row2 = await downloadOf(page, 'protege-ligne-2', async () => { await clickIn(page, OK); });
  await sleep(800);
  if (POPPLER) {
    check('poppler : le PDF de la ligne 2 s\'ouvre avec le mot de passe de SA cellule sans les espaces autour, pas avec celui de la ligne 1, ni avec les espaces', opensWith(row2.file, ROW_PASSWORD_2) && !opensWith(row2.file, ROW_PASSWORD_1) && !opensWith(row2.file, ROW_PASSWORDS[1]), row2.file);
    check('poppler : avec ce mot de passe, le texte de la ligne 2 se lit', textWith(row2.file, ROW_PASSWORD_2).includes(ROW_TEXTS[1]), textWith(row2.file, ROW_PASSWORD_2).slice(0, 100));
  }

  // La ligne 3 : sa cellule est vide, aucun PDF ne sort, sans mot de passe en particulier.
  await fire(page, 'PbClients', 3);
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(500);
  const none = await download(page, async () => { await clickIn(page, OK); await sleep(2200); }, 2400);
  check('la cellule de la ligne 3 est vide : aucun PDF n\'est téléchargé et l\'état dit laquelle et quelle colonne', none === null && (await status(page)) === MW.empty, { file: none && none.suggestedFilename(), status: await status(page) });
  check('le bouton Exporter se libère après cet échec', await exportUnlocked(page));
  await parkMouse(page);

  // Le lot : chaque PDF avec le mot de passe de sa ligne, la ligne sans mot de passe listée à la fin.
  await fire(page, 'PbClients', 1);
  await chooseExportLines(page, 'zip');
  await parkMouse(page);
  await click(page, EXPORT_MENU);
  await waitDialog(page);
  await sleep(500);
  state = await dialogState(page);
  check('le lot « un par ligne » : la phrase dit « …chacun avec le mot de passe de sa ligne… », la colonne « Mdp » est reprise, le bouton dit « Générer »', state.intro === MW.batchColumn && state.mode === 'column' && state.column === 'Mdp' && state.ok === 'Générer', { intro: state.intro, mode: state.mode, column: state.column, ok: state.ok });
  const columnIntro = (await measure(page, ['#pp-protect-intro']))[0];
  check('la phrase du lot « un par ligne » est entière et lisible (>= 4,5:1)', columnIntro.shown && columnIntro.inside && columnIntro.contrast >= 4.5, columnIntro);
  const columnZip = await downloadOf(page, 'protege-par-ligne-zip', async () => { await clickIn(page, OK); });
  await page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 30000 });
  await sleep(400);
  const failWindow = await page.evaluate(() => {
    const box = document.querySelector('#pp-dialog-modal .pp-modal-box');
    const r = box.getBoundingClientRect();
    return { title: document.getElementById('pp-dialog-title').textContent, message: document.getElementById('pp-dialog-message').textContent, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  });
  const failTexts = await measure(page, ['#pp-dialog-title', '#pp-dialog-message', '#pp-dialog-modal .pp-modal-actions button:first-of-type']);
  check('à la fin du lot, la fenêtre liste la ligne sans mot de passe avec sa raison (colonne « Mdp » vide), entière dans le panneau et lisible (>= 4,5:1)',
    failWindow.title === MW.failTitle && /contient 2 autres documents/.test(failWindow.message) && /ligne n° 3 : la colonne « Mdp » est vide : pas de mot de passe pour ce PDF/i.test(failWindow.message) && failWindow.inside && readable(failTexts) && failTexts[2].text === MW.failClose, { failWindow, contrast: failTexts.map(t => t.contrast) });
  await click(page, '#pp-dialog-modal .pp-modal-actions button:first-of-type');
  await sleep(500);
  check('l\'état de fin dit « ' + MW.failures + ' »', (await status(page)) === MW.failures, await status(page));
  const columnPdfs = unzipPdfs(columnZip.file, 'pp-protect-column-');
  check('l\'archive PbClients-export-pdf-protege.zip contient les deux PDF qui ont un mot de passe, pas la ligne 3', columnZip.suggested === 'PbClients-export-pdf-protege.zip' && same(columnPdfs.names, ['publipostage (2).pdf', 'publipostage.pdf']), { file: columnZip.suggested, names: columnPdfs.names });
  if (POPPLER && columnPdfs.names.length === 2) {
    const one = join(columnPdfs.dir, 'publipostage.pdf');
    const two = join(columnPdfs.dir, 'publipostage (2).pdf');
    check('poppler : le PDF de la ligne 1 s\'ouvre avec son mot de passe et pas avec celui de la ligne 2 ; celui de la ligne 2 avec le sien et pas avec celui de la ligne 1',
      opensWith(one, ROW_PASSWORD_1) && !opensWith(one, ROW_PASSWORD_2) && opensWith(two, ROW_PASSWORD_2) && !opensWith(two, ROW_PASSWORD_1), columnPdfs.names);
    check('poppler : chaque PDF porte le texte de sa ligne', textWith(one, ROW_PASSWORD_1).includes(ROW_TEXTS[0]) && textWith(two, ROW_PASSWORD_2).includes(ROW_TEXTS[1]), [textWith(one, ROW_PASSWORD_1).slice(0, 60), textWith(two, ROW_PASSWORD_2).slice(0, 60)]);
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
  const leaks = await page.evaluate(({ typed, stored, rowPasswords }) => {
    const dump = JSON.stringify([Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]), Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])]);
    const stub = window.__gristStub;
    const actions = JSON.stringify(stub.getActionLog());
    return {
      storage: [typed].concat(stored, rowPasswords).filter(secret => dump.includes(secret)),
      actions: [typed].concat(rowPasswords).filter(secret => actions.includes(secret)),
      rows: JSON.stringify(stub.state.rows).includes(typed),
      oldStored: JSON.stringify(stub.state.rows.Publipostage_Modeles).includes(stored[0]),
      kept: localStorage.getItem('pp_pdf_protection'),
    };
  }, { typed: PASSWORD, stored: [STORED, STORED_NEXT], rowPasswords: [ROW_PASSWORD_1, ROW_PASSWORD_2] });
  check('le mot de passe saisi n\'est ni dans le stockage du navigateur, ni dans les actions envoyées à Grist, ni dans le document', leaks.storage.indexOf(PASSWORD) === -1 && leaks.actions.indexOf(PASSWORD) === -1 && !leaks.rows, leaks);
  check('le mot de passe commun et ceux des lignes ne sont dans aucun stockage du navigateur ; ceux des lignes ne sont dans aucune action envoyée à Grist', leaks.storage.length === 0 && leaks.actions.length === 0, leaks);
  check('l\'ancien mot de passe commun a disparu du document (remplacé, pas ajouté)', !leaks.oldStored, leaks);
  check('seuls le mode, les droits, l\'auteur et la colonne des mots de passe (avec sa table) sont gardés dans le navigateur', JSON.stringify(Object.keys(JSON.parse(leaks.kept || '{}'))) === JSON.stringify(['mode', 'allowPrint', 'allowCopy', 'allowModify', 'author', 'passwordTable', 'passwordColumn']), leaks.kept);
  // Le seul message d'erreur attendu : la ligne 3 du lot, sans mot de passe, écrite une fois dans la console (la fenêtre de fin de lot la liste aussi).
  const rowFailure = e => /^console\.error: \[main\] export PDF en lot : échec pour la ligne 3 Error: Le mot de passe de la ligne \(colonne « Mdp »\) est inutilisable : empty\./.test(e);
  const frenchErrors = realErrors(w);
  check('aucune erreur de page (passe française), hormis l\'échec attendu de la ligne 3 écrit une fois dans la console', frenchErrors.filter(e => !rowFailure(e)).length === 0 && frenchErrors.filter(rowFailure).length === 1, frenchErrors);
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
  // Les deux autres façons de donner le mot de passe, en anglais sombre.
  console.log('\n[anglais, sombre] Les trois façons de donner le mot de passe');
  const MWE = MODE_WORDS.en;
  const modeRowsEn = await measure(page, MODE_RADIOS.map(sel => sel + ' + span'));
  const legendEn = (await measure(page, ['#pp-protect-modal fieldset.pp-protect-modes legend']))[0];
  state = await dialogState(page);
  check(`anglais, sombre : la légende « ${MWE.legend} » et les trois façons (${MWE.modes.join(' | ')}) sont entières et lisibles (>= 4,5:1), la première cochée`, legendEn.text === MWE.legend && wanted(modeRowsEn, MWE.modes) && entire(modeRowsEn) && readable(modeRowsEn) && legendEn.contrast >= 4.5 && state.mode === 'typed', { legend: legendEn.text, modes: modeRowsEn.map(r => r.text), mode: state.mode });
  await pickMode(page, 'stored');
  await storedReady(page);
  state = await dialogState(page);
  const storedLayoutEn = await dialogLayout(page, { reach: '#pp-protect-stored', essentials: STORED_ESSENTIALS });
  const storedTextsEn = await measure(page, STORED_TEXTS);
  check('anglais, sombre, « same for all » : la fenêtre est entière, les trois choix, le champ, l\'endroit et le risque se voient sans défiler, tous lisibles (>= 4,5:1)',
    storedLayoutEn.inside && storedLayoutEn.titleShown && storedLayoutEn.actionsShown && storedLayoutEn.okReachable && storedLayoutEn.passwordReachable && storedLayoutEn.outOfView.length === 0 && storedTextsEn.every(t => !t.missing && t.shown) && readable(storedTextsEn),
    { layout: storedLayoutEn, contrast: storedTextsEn.map(t => [t.sel, t.contrast]) });
  check('anglais, sombre : l\'endroit et le risque sont dits en anglais (ce document-ci n\'a pas encore de mot de passe enregistré : le champ est vide)', state.where === MWE.where && state.storedRisk === MWE.storedRisk && state.stored === '', { where: state.where, risk: state.storedRisk, stored: state.stored });
  check('anglais, sombre : le libellé du champ est « ' + MWE.storedLabel + ' »', (await page.evaluate(() => document.querySelector('label[for="pp-protect-stored"]').textContent)) === MWE.storedLabel);
  await pickMode(page, 'column');
  state = await dialogState(page);
  const columnLayoutEn = await dialogLayout(page, { reach: '#pp-protect-panel-column .ss-trigger', essentials: COLUMN_ESSENTIALS });
  const columnTextsEn = await measure(page, COLUMN_TEXTS);
  const pickEn = (await measure(page, ['#pp-protect-nothing']))[0];
  check('anglais, sombre, « one per row » : la fenêtre est entière, les trois choix, la liste, l\'aide et le risque se voient sans défiler, tous lisibles (>= 4,5:1)',
    columnLayoutEn.inside && columnLayoutEn.titleShown && columnLayoutEn.actionsShown && columnLayoutEn.okReachable && columnLayoutEn.passwordReachable && columnLayoutEn.outOfView.length === 0 && columnTextsEn.every(t => !t.missing && t.shown) && readable(columnTextsEn),
    { layout: columnLayoutEn, contrast: columnTextsEn.map(t => [t.sel, t.contrast]) });
  check('anglais, sombre : le risque est dit en anglais, « Export » est grisé et la phrase « ' + MWE.pick + ' » le dit, lisible', state.columnRisk === MWE.columnRisk && state.okDisabled && state.nothing === MWE.pick && pickEn.shown && pickEn.inside && pickEn.contrast >= 4.5, { risk: state.columnRisk, okDisabled: state.okDisabled, nothing: state.nothing, pickEn });
  check('anglais, sombre : le libellé de la liste est « ' + MWE.columnLabel + ' »', (await page.evaluate(() => document.querySelector('label[for="pp-protect-column"]').textContent)) === MWE.columnLabel);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Échap ferme la fenêtre et l\'état dit « Export canceled. »', !(await dialogOpen(page)) && (await status(page)) === WORDS.en.cancelled, await status(page));
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
