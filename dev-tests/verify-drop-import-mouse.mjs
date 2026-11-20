#!/usr/bin/env node
// Déposer un fichier sur la page pour l'importer (js/drop-import.js, js/main-import.js:importDroppedFile ; audit « confort d'usage » du 12/11, idée 9), à 700x400, en clair, en sombre puis en anglais. Le dépôt vient d'un
// vrai événement de glisser-déposer (DataTransfer avec un vrai fichier, dispatchEvent dragenter / dragover / drop : Playwright n'a pas de glisser depuis le bureau) ; les clics sur la fenêtre sont de la vraie souris :
//   1) un fichier survole la page : le voile « Déposez le fichier pour l'importer » s'allume et ne reçoit pas de clic ; il s'éteint en quittant ; une image seule ne l'allume pas ;
//   2) aucun document ouvert (texte vide) : un Markdown déposé s'ouvre comme nouveau document, sans question, enregistré dans Grist sous le nom du fichier (comme le tableur déposé) ;
//   3) un document déjà ouvert : la fenêtre « Nouveau document / Remplacer celui-ci / Ajouter après / Insérer ici » s'ouvre (focus sur « Nouveau document ») ;
//      « Ajouter après » met le texte du fichier à la fin, « Insérer ici » au curseur, « Remplacer celui-ci » à la place du texte (le nom du modèle reste) ; Ctrl+Z défait chacun ; « Annuler » ne change rien ;
//   4) un fichier d'un genre inconnu dit son refus dans le coin d'état, sans rien changer ; le navigateur n'ouvre pas le fichier ;
//   5) un tableur OpenDocument (.ods) déposé sur un document ouvert devient une grille, sans la question « Remplacer… » ;
//   6) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « dropImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-drop-import-mouse.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.DROP_IMPORT_PORT || 9022);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const SPEC = { tables: [{ id: 'DrClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 1, table: 'DrClients', columns: ['Nom'], firstIsDefault: true } };
const MD = '# Titre du fichier\n\nTexte importé du Markdown.\n';

// Un glisser-déposer réel pour le navigateur : un DataTransfer portant un vrai File.
async function dragFile(page, { name, type, content, phase }) {
  return page.evaluate(({ name, type, content, phase }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], name, { type }));
    const fire = kind => { const e = new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: transfer }); document.body.dispatchEvent(e); return e; };
    if (phase === 'enter') { fire('dragenter'); const over = fire('dragover'); return { overPrevented: over.defaultPrevented }; }
    if (phase === 'leave') { fire('dragleave'); return {}; }
    fire('dragenter');
    const over = fire('dragover');
    const drop = fire('drop');
    return { overPrevented: over.defaultPrevented, dropPrevented: drop.defaultPrevented };
  }, { name, type, content, phase });
}
const hintOn = page => page.evaluate(() => { const h = document.getElementById('pp-drop-hint'); return !!h && h.classList.contains('is-on') && getComputedStyle(h).display !== 'none'; });
const doc = page => page.evaluate(() => ({ text: EditorCore.getEditor().getText({ blockSeparator: '|' }), name: document.getElementById('template-name').value, status: document.getElementById('status-msg').textContent, modal: Array.from(document.querySelectorAll('.pp-modal')).some(m => m.getClientRects().length > 0) }));
// Les lignes de la table des documents dans Grist (le faux Grist du test) : ce que l'import y a écrit, relu.
const stored = page => page.evaluate(() => { const t = window.__gristStub.state.rows.Publipostage_Modeles; return t.id.map((id, i) => ({ id, name: t.Nom[i], length: String(t.Contenu[i] || '').length })); });
const dialog = page => page.evaluate(() => {
  const m = Array.from(document.querySelectorAll('.pp-modal')).find(x => x.getClientRects().length > 0);
  if (!m) return null;
  return { title: (m.querySelector('.pp-modal-title') || {}).textContent, buttons: Array.from(m.querySelectorAll('button')).map(b => b.textContent.trim()), focus: document.activeElement && document.activeElement.textContent.trim() };
});
async function clickDialogButton(page, text) {
  const r = await page.evaluate(label => {
    const m = Array.from(document.querySelectorAll('.pp-modal')).find(x => x.getClientRects().length > 0);
    const b = Array.from(m.querySelectorAll('button')).find(x => x.textContent.trim() === label);
    const box = b.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, text);
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.mouse.click(r.x, r.y);
  await sleep(900);
}
async function ctrlZ(page) { await page.keyboard.press('Control+z'); await sleep(400); }
async function seed(page) {
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setContent('<p>Début du texte</p><p>Fin du texte</p>'); ed.commands.focus('start'); });
  await sleep(600);
}

async function run(lang, scheme, w) {
  const L = `${scheme}/${lang}`;
  const fr = lang === 'fr';
  const page = w.page;
  const T = {
    hint: fr ? 'Déposez le fichier pour l’importer' : 'Drop the file to import it',
    leave: fr ? 'Ne pas enregistrer' : 'Don\u2019t save',
    nw: fr ? 'Nouveau document' : 'New document', rep: fr ? 'Remplacer celui-ci' : 'Replace this one', aft: fr ? 'Ajouter après' : 'Add after', ins: fr ? 'Insérer ici' : 'Insert here', cancel: fr ? 'Annuler' : 'Cancel',
  };

  await seed(page);
  await dragFile(page, { name: 'note.md', type: '', content: MD, phase: 'enter' });
  await sleep(200);
  const hint = await page.evaluate(() => { const h = document.getElementById('pp-drop-hint'); return { on: h.classList.contains('is-on'), text: h.textContent, pe: getComputedStyle(h).pointerEvents }; });
  check(`${L} : un fichier qui survole la page allume le voile « ${T.hint} », sans clic possible dessus`, hint.on && hint.text === T.hint && hint.pe === 'none', hint);
  await dragFile(page, { name: 'note.md', type: '', content: MD, phase: 'leave' });
  await sleep(200);
  check(`${L} : il s'éteint quand le fichier quitte la page`, !(await hintOn(page)));
  await dragFile(page, { name: 'photo.png', type: 'image/png', content: 'x', phase: 'enter' });
  check(`${L} : une image seule n'allume pas le voile (l'éditeur la reçoit)`, !(await hintOn(page)));
  await page.evaluate(() => document.dispatchEvent(new DragEvent('dragend', { bubbles: true })));

  // Aucun texte : nouveau document, sans question.
  await page.evaluate(() => { EditorCore.getEditor().commands.setContent('<p></p>'); });
  await sleep(500);
  const emptyDrop = await dragFile(page, { name: 'note.md', type: '', content: MD, phase: 'drop' });
  await sleep(1200);
  // Le texte vidé à la main est une modification non enregistrée : la question habituelle du menu « + » (quitter le modèle ?) passe avant, mais jamais la question « Nouveau / Remplacer… ».
  let first = await dialog(page);
  const askedLeave = !!first && first.buttons.includes(T.leave) && !first.buttons.includes(T.rep);
  if (askedLeave) await clickDialogButton(page, T.leave); else await sleep(300);
  await sleep(1200);
  let d = await doc(page);
  check(`${L} : sans texte ouvert, un Markdown déposé devient le document (sans la question Remplacer / Ajouter)`, emptyDrop.dropPrevented && !d.modal && d.text.includes('Texte importé du Markdown') && (askedLeave || !first), { emptyDrop, first, d });
  const savedLine = name => fr ? `Enregistré dans Grist sous « ${name} ». ` : `Saved to Grist as “${name}”. `;
  const rows1 = await stored(page);
  check(`${L} : le Markdown déposé est ENREGISTRÉ dans Grist sous le nom du fichier « note » (une ligne, relue dans la table), et le coin d'état commence par l'enregistrement`, rows1.some(r => r.name === 'note' && r.length > 20) && d.status.startsWith(savedLine('note')), { rows1, status: d.status });

  // Un document ouvert : la fenêtre.
  await seed(page);
  await page.evaluate(() => { document.getElementById('template-name').value = 'Mon modèle'; });
  await dragFile(page, { name: 'note.md', type: '', content: MD, phase: 'drop' });
  await sleep(900);
  const dlg = await dialog(page);
  check(`${L} : un document déjà ouvert : la fenêtre propose Nouveau document / Remplacer / Ajouter après / Insérer, le focus sur « ${T.nw} »`, !!dlg && [T.cancel, T.nw, T.rep, T.aft, T.ins].every(b => dlg.buttons.includes(b)) && dlg.focus === T.nw, dlg);

  await clickDialogButton(page, T.cancel);
  d = await doc(page);
  check(`${L} : « ${T.cancel} » ne change rien`, !d.modal && d.text === 'Début du texte|Fin du texte', d);

  await dragFile(page, { name: 'note.md', type: '', content: MD, phase: 'drop' });
  await sleep(700);
  await clickDialogButton(page, T.aft);
  d = await doc(page);
  check(`${L} : « ${T.aft} » met le texte du fichier à la fin`, d.text.startsWith('Début du texte|Fin du texte') && d.text.includes('Texte importé du Markdown') && d.text.indexOf('Texte importé') > d.text.indexOf('Fin du texte'), d);
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await ctrlZ(page);
  d = await doc(page);
  check(`${L} : Ctrl+Z retire ce qui vient d'être ajouté`, d.text === 'Début du texte|Fin du texte', d);

  await seed(page);
  await dragFile(page, { name: 'note.md', type: '', content: MD, phase: 'drop' });
  await sleep(700);
  await clickDialogButton(page, T.ins);
  d = await doc(page);
  check(`${L} : « ${T.ins} » met le texte du fichier au curseur (avant « Début »)`, d.text.includes('Texte importé du Markdown') && d.text.indexOf('Texte importé') < d.text.indexOf('Début du texte'), d);
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await ctrlZ(page);
  d = await doc(page);
  check(`${L} : Ctrl+Z retire ce qui vient d'être inséré`, d.text === 'Début du texte|Fin du texte', d);

  await seed(page);
  await dragFile(page, { name: 'note.md', type: '', content: MD, phase: 'drop' });
  await sleep(700);
  await clickDialogButton(page, T.rep);
  d = await doc(page);
  check(`${L} : « ${T.rep} » met le fichier à la place du texte, le nom du modèle reste`, d.text.includes('Texte importé du Markdown') && !d.text.includes('Début du texte') && d.name === 'Mon modèle', d);
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await ctrlZ(page);
  d = await doc(page);
  check(`${L} : Ctrl+Z rend le texte d'avant`, d.text === 'Début du texte|Fin du texte', d);

  await seed(page);
  const unknown = await dragFile(page, { name: 'archive.rar', type: 'application/vnd.rar', content: 'rar', phase: 'drop' });
  await sleep(500);
  d = await doc(page);
  check(`${L} : un fichier d'un genre inconnu est refusé dans le coin d'état, rien ne change, le navigateur ne l'ouvre pas`, unknown.dropPrevented && /archive\.rar/.test(d.status) && d.text === 'Début du texte|Fin du texte', { unknown, d });

  // Une présentation OpenDocument (.odp) déposée : jamais la question « Nouveau / Remplacer / Ajouter / Insérer » non plus. Ce widget seul n'a pas l'extension « diapositives » : la fenêtre qui explique ce qu'il
  // faut s'ouvre, le document ne bouge pas (l'import réussi d'une présentation est vérifié par dev-tests/verify-odp-import-mouse.mjs).
  await seed(page);
  await page.addScriptTag({ url: '/dev-tests/scenarios-odp-import.js' });
  const deckDrop = await page.evaluate(async () => {
    const F = window.OdpFixtures;
    const buffer = await F.odp({ pages: [F.page('Un', F.frameText(F.paragraph('Bonjour'), { box: { x: 2, y: 2, w: 10, h: 2 } }))] });
    const transfer = new DataTransfer();
    transfer.items.add(new File([buffer], 'bilan.odp', { type: 'application/vnd.oasis.opendocument.presentation' }));
    const fire = kind => { const e = new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: transfer }); document.body.dispatchEvent(e); return e; };
    fire('dragenter');
    fire('dragover');
    return { dropPrevented: fire('drop').defaultPrevented };
  });
  await sleep(1500);
  const askedDeck = await dialog(page);
  const askedDeckTitle = await page.evaluate(() => (document.getElementById('pp-dialog-title') || {}).textContent || '');
  check(`${L} : un .odp déposé sur un document ouvert ne pose pas la question « ${T.rep} » : la fenêtre qui explique l'extension « diapositives » s'ouvre`, deckDrop.dropPrevented && !!askedDeck && !askedDeck.buttons.includes(T.rep) && !askedDeck.buttons.includes(T.nw) && /Grist Factory Suite/.test(askedDeckTitle), askedDeck);
  if (askedDeck) await clickDialogButton(page, fr ? 'Fermer' : 'Close');
  d = await doc(page);
  check(`${L} : le document est le même après le dépôt d'une présentation sans l'extension`, d.text === 'Début du texte|Fin du texte' && !d.modal, d);

  // Un tableur OpenDocument déposé sur un document ouvert : toujours une nouvelle grille, sans la question « Nouveau / Remplacer / Ajouter / Insérer » (qui ne vaut que pour du texte). Le fichier est fabriqué dans
  // la page avec les briques de dev-tests/scenarios-ods-import.js ; la grille neuve passe par la question habituelle du menu « + » (quitter le modèle ?) puisque le texte a des modifications non enregistrées.
  await seed(page);
  await page.addScriptTag({ url: '/dev-tests/scenarios-ods-import.js' });
  const sheetDrop = await page.evaluate(async () => {
    const F = window.OdsFixtures;
    const buffer = await F.ods({ sheets: [F.sheet('S', [F.row([F.text('Nom'), F.text('Âge')]), F.row([F.text('Ana'), F.num('31', 31)])])] });
    const transfer = new DataTransfer();
    transfer.items.add(new File([buffer], 'chiffres.ods', { type: 'application/vnd.oasis.opendocument.spreadsheet' }));
    const fire = kind => { const e = new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: transfer }); document.body.dispatchEvent(e); return e; };
    fire('dragenter');
    fire('dragover');
    return { dropPrevented: fire('drop').defaultPrevented };
  });
  await sleep(1500);
  const askedSheet = await dialog(page);
  check(`${L} : un .ods déposé sur un document ouvert ne pose pas la question « ${T.rep} » : seule celle du menu « + » (quitter le modèle ?) vient`, sheetDrop.dropPrevented && !!askedSheet && askedSheet.buttons.includes(T.leave) && !askedSheet.buttons.includes(T.rep), askedSheet);
  if (askedSheet) await clickDialogButton(page, T.leave);
  await sleep(1500);
  const grid = await page.evaluate(() => ({ active: GridEditor.isActive(), text: EditorCore.getEditor().state.doc.textContent }));
  check(`${L} : le tableur déposé devient une grille (nom, âge, Ana, 31)`, grid.active && /Nom/.test(grid.text) && /Ana/.test(grid.text) && /31/.test(grid.text), grid);
  const rows2 = await stored(page);
  check(`${L} : la grille déposée est ENREGISTRÉE dans Grist sous le nom du fichier « chiffres » (une ligne de plus, relue)`, rows2.some(r => r.name === 'chiffres' && r.length > 20) && rows2.length === rows1.length + 1, { rows1: rows1.map(r => r.name), rows2: rows2.map(r => r.name) });

}

let w = null;
const errors = [];
try {
  for (const [scheme, lang] of [['light', 'fr'], ['dark', 'fr'], ['light', 'en']]) {
    console.log(`\n[${scheme} / ${lang}]`);
    w = await open({ spec: SPEC, port: PORT, settleMs: 2000, theme: scheme, lang, storage: { pp_autosave_enabled: 'false' } }); // enregistrement automatique coupé : une modification reste « à enregistrer » (sinon son « Enregistré à… » recouvre le message d'un refus)
    await run(lang, scheme, w);
    errors.push(...w.errors);
    await w.close();
    w = null;
  }
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  failed++;
  total++;
  console.log('  FAIL - exception : ' + (e && e.stack || e));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failed) + '/' + total + ' passés');
process.exit(failed ? 1 : 0);
