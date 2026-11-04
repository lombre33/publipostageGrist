#!/usr/bin/env node
// Les fils de commentaires d'un PDF lu dans la Lecture (consigne GFS 045 : extensions/lecture-pdf/pdf-comments.js, js/comments.js `kit`, js/pdf-reading.js, js/main.js `applyPdfLocks`, js/action-history.js), 700x400, à la vraie
// souris et au vrai clavier. Un GFS simulé (dev-tests/gfs-stub.js, adresse `?gfs=0`) ouvre un PDF fabriqué ici (pdf-lib) ; le faux Grist (dev-tests/grist-stub.js) garde la table `Publipostage_Commentaires` et le journal de tout ce qui
// s'y écrit : ce script lit ce que la personne voit ET ce qui part dans le document.
//  RIEN NE S'ÉCRIT SANS FIL PUBLIÉ : ouvrir un PDF n'écrit rien (table d'avant sans les colonnes, ou sans table) ni ne demande rien ; « Commenter » pose une marque d'essai, l'abandonner (Échap, la croix) ne laisse rien.
//  LES GESTES : publier = UNE ligne (la clé du PDF, la page, la place du passage dans le texte de la page, la citation, le texte autour, « résolu » faux, jamais de ModeleId) ; répondre = une ligne sans ancre ; résoudre et rouvrir =
//   UNE écriture sur la ligne du premier message ; supprimer = toutes les lignes en un lot ; Annuler et Rétablir (Ctrl + Z, Ctrl + Y, les boutons) les défont et les refont, sans écraser une réponse d'une autre personne.
//  LA STRUCTURE : une table d'avant ne reçoit, au premier fil publié, que les colonnes qui lui manquent, en un seul lot ; un document sans table la voit créée avec toutes ses colonnes après l'accord de la personne ; Grist qui refuse
//   la structure : la raison est dite, rien n'est écrit, « Commenter » reste grisé pour ce PDF.
//  LES FILS D'AUTRUI : lus à l'ouverture du PDF, à l'ouverture d'un fil et après chaque geste ; les fils d'un autre PDF, d'un modèle ne se mêlent pas à ceux-ci, et réciproquement ; un PDF renommé garde les siens.
//  « COMMENTER » : actif pour un PDF qui a du texte ; grisé, avec SA raison, pour un PDF sans texte (et pour un document en lecture seule, par la sienne).
// Lancé par run-headless.mjs (groupe Node "gfsCommentThreads", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-comment-threads.mjs
import { start } from './gfs-page.mjs';
import { pdfKit, linesPdf, sleep } from './gfs-pdf-kit.mjs';
import { TABLE, MODEL_COLS, PDF_COLS, anchorIn, seedRows, rowsOf, columnsOf, RECORD_CALLS, callsOf, forgetCalls, allCalls, idle, boxOf, popupOf, waitPopup, waitPopupMessages, buttonState, commentButton, status, tr, dialogOf, waitDialog, clickDialog, clickComment, typeIn, press, publish, threadsNow, closeThread, undoKey, redoKey, gestures } from './gfs-pdf-threads-kit.mjs';

const t = await start({ name: 'verify-gfs-comment-threads', port: Number(process.env.GFS_COMMENT_THREADS_PORT || 8923) });
const { check } = t;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Les PDF des essais : une facture de trois pages, un autre PDF (autre texte), des pages minuscules (une sélection qui déborde), un scan.
const P1 = ['Facture n° 2026-117', 'Client : Dupont SA', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €', 'Total TTC : 1 200 €'];
const P2 = ['Conditions de paiement', 'Paiement à 30 jours', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €'];
const P3 = ['Annexe', 'Merci de votre confiance'];
const SMALL = [320, 70];
const PDFS = {
  facture: { name: 'facture.pdf', bytes: await linesPdf([P1, P2, P3]) },
  autre: { name: 'autre.pdf', bytes: await linesPdf([['Devis 2026-9', 'Remise de 5 % sur le matériel'], ['Livraison sous 8 jours']]) },
  small: { name: 'petites-pages.pdf', bytes: await linesPdf(Array.from({ length: 4 }, (_, i) => ['Page ' + (i + 1) + ' alpha beta gamma', 'Page ' + (i + 1) + ' epsilon zeta eta']), { size: SMALL, fontSize: 12, gap: 22, top: 25 }) },
  scan: { name: 'scan.pdf', bytes: await linesPdf([[], []]) },
};
const kit = pdfKit(t, PDFS);
const { LIB, open, selectOnLine, anchorNow, marksOf, linesOf, drag } = kit;
if (!LIB) {
  check('le fichier « pdfjs » du miroir hors-ligne est là (bash dev-tests/offline-deps.sh)', false);
  await t.finish();
}

// Le texte d'une page comme l'ancre le voit (le rendu de PdfAnchor.pageText : les lignes mises bout à bout, une espace entre elles), pour poser des fils d'« une autre personne » à la bonne place.
const text1 = P1.join(' ');
const text2 = P2.join(' ');
const { commentSelection, openMark, seenMarks } = gestures(kit);

// ==================================================================================================================================================================================================
console.log('\n== Ouvrir un PDF n’écrit rien et ne demande rien : ni table, ni colonne, ni question ==');
{
  // Une table d'avant : ses cinq colonnes, sans celles des PDF.
  const o = await open('facture', { init: RECORD_CALLS });
  const page = o.page;
  await idle(page);
  const calls = await allCalls(page);
  const touching = calls.flat().filter(a => a[1] === TABLE);
  check('une table d’avant (cinq colonnes) : l’ouverture du PDF n’écrit rien dans la table des commentaires, ne crée ni table ni colonne', touching.length === 0 && same(await columnsOf(page), MODEL_COLS), { touching, columns: await columnsOf(page) });
  check('… elle ne pose aucune question, aucune fenêtre n’est ouverte, aucun fil n’est montré', !(await dialogOf(page)).open && (await threadsNow(page)).length === 0 && (await marksOf(page)).length === 0);
  const button = await commentButton(page);
  check('« Commenter » n’est pas grisé pour un PDF qui a du texte (ni par le PDF, ni par les droits)', !!button && !button.locked && !button.accessLocked && button.aria !== 'true', button);
  await o.context.close();
}
{
  // Un document sans table des commentaires du tout.
  const o = await open('facture', { init: RECORD_CALLS, seed: `stub.dropTable('${TABLE}');` });
  const page = o.page;
  await idle(page);
  const calls = (await allCalls(page)).flat().filter(a => a[1] === TABLE);
  check('un document sans table des commentaires : l’ouverture du PDF ne la crée pas et ne pose aucune question', calls.length === 0 && (await columnsOf(page)) === null && !(await dialogOf(page)).open && (await threadsNow(page)).length === 0, { calls });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Commenter : une marque d’essai et la fenêtre, RIEN d’écrit avant le premier message publié ; l’abandonner ne laisse rien ==');
{
  const o = await open('facture', { init: RECORD_CALLS });
  const page = o.page;
  // Sans texte sélectionné.
  await clickComment(page);
  await sleep(300);
  const none = await status(page);
  check('« Commenter » sans passage sélectionné : aucune fenêtre, le coin d’état le dit (en erreur), rien n’est écrit', !(await popupOf(page)).open && none.text === await tr(page, 'comments.selectTextFirst') && none.cls === 'error-msg' && (await callsOf(page)).length === 0, none);

  const anchor = await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  const p = await popupOf(page);
  const marks = await marksOf(page);
  check('un passage sélectionné à la souris puis « Commenter » : la fenêtre du fil s’ouvre (dans le panneau, la saisie a le focus, « Publier » est là, pas de « Résoudre » ni de « Supprimer »), la sélection laisse place à la marque d’essai',
    p.open && p.left >= 0 && p.top >= 0 && p.right <= 700 && p.bottom <= 400 && !!p.reply && !!p.post && !p.resolve && !p.del && p.messages.length === 0 && marks.length === 1 && marks[0].text === anchor.citation && (await page.evaluate(() => window.getSelection().isCollapsed)), { p, marks, anchor });
  await sleep(100);
  check('… la saisie a le focus', (await popupOf(page)).focusedIsReply);
  check('… et RIEN n’est écrit : pas une action dans la table, aucune colonne ajoutée', (await callsOf(page)).length === 0 && same(await columnsOf(page), MODEL_COLS) && (await rowsOf(page)).length === 0);

  // Abandon par Échap : la marque d’essai s’en va, rien n’a été écrit.
  await page.keyboard.press('Escape');
  await waitPopup(page, false);
  check('Échap dans la saisie : la fenêtre se ferme, la marque d’essai s’en va, rien n’a été écrit', (await marksOf(page)).length === 0 && (await callsOf(page)).length === 0 && (await rowsOf(page)).length === 0);

  // Abandon par la croix.
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await typeIn(page, 'brouillon');
  const q = await popupOf(page);
  await page.mouse.click(q.close.x, q.close.y);
  await waitPopup(page, false);
  check('la croix, même avec un brouillon tapé : la fenêtre se ferme, la marque d’essai s’en va, rien n’a été écrit', (await marksOf(page)).length === 0 && (await callsOf(page)).length === 0 && same(await columnsOf(page), MODEL_COLS) && (await threadsNow(page)).length === 0);

  // « Publier » sans rien taper : rien non plus.
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await press(page, 'post');
  check('« Publier » sans texte : rien n’est écrit, la fenêtre reste ouverte', (await popupOf(page)).open && (await callsOf(page)).length === 0);
  await closeThread(page);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Publier le premier message : UNE ligne, avec l’ancre ; les colonnes qui manquent arrivent avec lui, en un seul lot ==');
let publishedRows = null;   // ce que le document garde après ce parcours : repris plus loin comme « une autre personne » qui ouvre le même document
let publishedAnchor = null;
{
  const o = await open('facture', { init: RECORD_CALLS });
  const page = o.page;
  const anchor = await commentSelection(page, 1, 'Garantie', 0.0, 0.46, 'keyboard');   // Ctrl + Alt + M, la touche de « Commenter la sélection »
  check('Ctrl + Alt + M ouvre la fenêtre du fil sur le passage sélectionné, comme le bouton', (await popupOf(page)).open && (await marksOf(page)).length === 1 && anchor && anchor.citation.startsWith('Garantie'), anchor);
  await publish(page, 'Premier message');
  const calls = await callsOf(page);
  const columns = await columnsOf(page);
  const rows = await rowsOf(page);
  const thread = (await threadsNow(page))[0];
  check('le premier message : UN lot qui ajoute les huit colonnes des PDF (et rien que celles-là), puis UN lot d’une seule ligne',
    calls.length === 2 && calls[0].length === 8 && calls[0].every(a => a[0] === 'AddColumn') && same(calls[0].map(a => a[2]), PDF_COLS) && calls[1].length === 1 && calls[1][0][0] === 'AddRecord', calls);
  check('… la table a les cinq colonnes d’avant puis les huit des PDF', same(columns, MODEL_COLS.concat(PDF_COLS)), columns);
  const row = rows && rows[0];
  const fields = calls[1] && calls[1][0][3];
  check('… la ligne : la clé du PDF, la page, la place et le texte du passage, le texte autour, « résolu » faux, l’auteur, le message, la date - jamais un ModeleId',
    !!row && rows.length === 1 && row.LectureId === 'pdf-7' && row.CommentId === thread.id && row.Page === 1 && row.Debut === anchor.debut && row.Fin === anchor.fin && row.Citation === anchor.citation && row.Avant === anchor.avant && row.Apres === anchor.apres
      && row.Resolu === false && row.Texte === 'Premier message' && !!row.CreeLe && !row.ModeleId && !('ModeleId' in fields), { row, fields, anchor });
  const p = await popupOf(page);
  const marks = await marksOf(page);
  check('la fenêtre montre le message publié, avec « Répondre », « Résoudre » et « Supprimer » ; la saisie est vide ; la marque est celle du fil publié, non résolue',
    p.open && same(p.messages, ['Premier message']) && !!p.post && !!p.resolve && !!p.del && p.replyValue === '' && marks.length === 1 && marks[0].id === thread.id && marks[0].resolved === 'false', { p, marks, thread });
  publishedRows = rows;
  publishedAnchor = anchor;

  // Un second fil, ailleurs : les colonnes sont là, rien ne s'ajoute de plus.
  await closeThread(page);
  await forgetCalls(page);
  await commentSelection(page, 2, 'Paiement', 0.0, 0.5);
  await publish(page, 'Second fil');
  const next = await callsOf(page);
  check('un second fil sur une autre page : une seule ligne de plus, aucune colonne ajoutée', next.length === 1 && next[0].length === 1 && next[0][0][0] === 'AddRecord' && (await rowsOf(page)).length === 2 && (await rowsOf(page))[1].Page === 2, next);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Répondre, résoudre, rouvrir, supprimer : chaque geste est UNE écriture (ou un lot), sur la bonne ligne ==');
{
  const o = await open('facture', { init: RECORD_CALLS });
  const page = o.page;
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await publish(page, 'Question');
  const id = (await threadsNow(page))[0].id;
  // La fenêtre se ferme, la marque rouvre le fil à la souris.
  await closeThread(page);
  check('Échap ferme la fenêtre d’un fil publié, sa marque reste', (await seenMarks(page)).join() === id);
  await forgetCalls(page);
  await openMark(page, id);
  check('un clic sur la marque ouvre le fil : son message, son statut « actif », la saisie vide', same((await popupOf(page)).messages, ['Question']) && (await popupOf(page)).resolvedBadge === false);
  const writesAtOpen = await callsOf(page);
  check('… ouvrir un fil n’écrit rien', writesAtOpen.length === 0, writesAtOpen);

  // Répondre.
  await publish(page, 'Réponse');
  const reply = await callsOf(page);
  const rows = await rowsOf(page);
  check('répondre : UNE ligne de plus, qui ne porte que la clé du PDF, le fil, l’auteur, le texte et la date - ni page, ni passage, ni « résolu »',
    reply.length === 1 && reply[0].length === 1 && reply[0][0][0] === 'AddRecord' && same(Object.keys(reply[0][0][3]).sort(), ['Auteur', 'CommentId', 'CreeLe', 'LectureId', 'Texte']) && rows.length === 2 && !rows[1].Citation && !rows[1].Page && rows[1].Resolu === null, reply);
  check('… la fenêtre montre les deux messages, dans l’ordre', same((await popupOf(page)).messages, ['Question', 'Réponse']));

  // Résoudre.
  await forgetCalls(page);
  await press(page, 'resolve');
  const resolve = await callsOf(page);
  const firstId = (await rowsOf(page))[0].id;
  check('résoudre : UNE écriture, sur la ligne du premier message, qui ne change que « résolu »', resolve.length === 1 && resolve[0].length === 1 && same(resolve[0][0], ['UpdateRecord', TABLE, firstId, { Resolu: true }]), resolve);
  const resolvedMark = (await marksOf(page, id))[0];
  const resolvedPopup = await popupOf(page);
  check('… la marque passe à « résolu » (sans fond), la fenêtre dit « Résolu » et propose « Rouvrir »', resolvedMark.resolved === 'true' && resolvedMark.bg === 'rgba(0, 0, 0, 0)' && resolvedPopup.resolvedBadge && resolvedPopup.resolve.label === await tr(page, 'comments.reopen'), { resolvedMark, resolvedPopup: resolvedPopup.resolve });
  check('… les autres lignes ne bougent pas (la réponse n’a ni « résolu » ni ancre)', (await rowsOf(page))[1].Resolu === null && (await rowsOf(page))[0].Resolu === true);

  // Rouvrir.
  await forgetCalls(page);
  await press(page, 'resolve');
  const reopen = await callsOf(page);
  check('rouvrir : UNE écriture, sur la même ligne', reopen.length === 1 && reopen[0].length === 1 && same(reopen[0][0], ['UpdateRecord', TABLE, firstId, { Resolu: false }]) && (await marksOf(page, id))[0].resolved === 'false', reopen);

  // Supprimer le fil.
  await forgetCalls(page);
  const p = await popupOf(page);
  await page.mouse.click(p.del.x, p.del.y);
  await waitDialog(page);
  const ask = await dialogOf(page);
  check('supprimer : l’app demande d’abord (sa fenêtre, rien n’est encore écrit)', ask.open && (await callsOf(page)).length === 0 && (await rowsOf(page)).length === 2, ask);
  await clickDialog(page, await tr(page, 'common.delete'));
  await idle(page);
  const del = await callsOf(page);
  check('… confirmé : UN lot qui retire TOUTES les lignes du fil', del.length === 1 && del[0].length === 2 && del[0].every(a => a[0] === 'RemoveRecord') && (await rowsOf(page)).length === 0, del);
  check('… la marque et la fenêtre s’en vont', (await marksOf(page)).length === 0 && !(await popupOf(page)).open && (await threadsNow(page)).length === 0);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Annuler et Rétablir (Ctrl + Z, Ctrl + Y, les boutons) couvrent publier, répondre, résoudre, supprimer ==');
{
  const o = await open('facture', { init: RECORD_CALLS });
  const page = o.page;
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await publish(page, 'Un');
  const id = (await threadsNow(page))[0].id;
  await publish(page, 'Deux');
  await press(page, 'resolve');
  const p = await popupOf(page);
  await page.mouse.click(p.del.x, p.del.y);
  await waitDialog(page);
  await clickDialog(page, await tr(page, 'common.delete'));
  await idle(page);
  const state = async () => { const rows = await rowsOf(page); return { rows: rows.length, resolved: rows.length ? rows[0].Resolu : null, marks: (await marksOf(page)).map(m => m.resolved) }; };
  check('quatre gestes faits (publier, répondre, résoudre, supprimer) : plus rien dans la table, plus de marque', same(await state(), { rows: 0, resolved: null, marks: [] }), await state());
  const focus = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  const undoButton = await page.evaluate(buttonState('v2-btn-undo'));
  check('l’éditeur est caché derrière le PDF : Annuler est pourtant proposé (le bouton est actif), le focus n’est dans aucun champ', undoButton.aria !== 'true' && !undoButton.accessLocked && focus !== 'TEXTAREA' && focus !== 'INPUT', { undoButton, focus });

  await undoKey(page);
  check('Ctrl + Z défait la suppression : les deux messages sont revenus (résolus), la marque aussi', same(await state(), { rows: 2, resolved: true, marks: ['true'] }), await state());
  await undoKey(page);
  check('Ctrl + Z de nouveau : le fil est rouvert (« résolu » faux)', same(await state(), { rows: 2, resolved: false, marks: ['false'] }), await state());
  await undoKey(page);
  check('… puis la réponse est retirée', same(await state(), { rows: 1, resolved: false, marks: ['false'] }), await state());
  await undoKey(page);
  check('… puis le fil lui-même : la table est vide, la marque s’en va, la fenêtre est fermée', same(await state(), { rows: 0, resolved: null, marks: [] }) && !(await popupOf(page)).open, await state());
  await redoKey(page);
  check('Ctrl + Y rétablit la publication', same(await state(), { rows: 1, resolved: false, marks: ['false'] }), await state());
  await redoKey(page);
  await redoKey(page);
  check('… la réponse, puis « résolu »', same(await state(), { rows: 2, resolved: true, marks: ['true'] }), await state());
  await redoKey(page);
  check('… puis la suppression', same(await state(), { rows: 0, resolved: null, marks: [] }), await state());

  // Les boutons de la barre, à la souris.
  const bUndo = await boxOf(page, '#v2-btn-undo');
  await page.mouse.click(bUndo.x, bUndo.y);
  await idle(page);
  await sleep(250);
  await idle(page);
  check('le bouton Annuler de la barre défait aussi (la suppression)', same(await state(), { rows: 2, resolved: true, marks: ['true'] }), await state());
  const bRedo = await boxOf(page, '#v2-btn-redo');
  await page.mouse.click(bRedo.x, bRedo.y);
  await idle(page);
  await sleep(250);
  await idle(page);
  check('… et le bouton Rétablir la refait', same(await state(), { rows: 0, resolved: null, marks: [] }), await state());
  const said = await status(page);
  check('le coin d’état dit ce qui vient d’être rétabli', said.text.length > 0 && said.cls !== 'error-msg', said);
  // Le PDF quitte l'écran : ses actions d'Annuler / Rétablir s'oublient (elles visaient des fils qui ne sont plus montrés ; rien n'est rejoué sur un autre document).
  const held = await page.evaluate(() => ActionHistory.count());
  await page.evaluate(() => PdfReading.close());
  await idle(page);
  const kept = await page.evaluate(() => ActionHistory.count());
  check('le PDF quitte l’écran : ses actions d’Annuler / Rétablir s’oublient (plus rien à défaire)', held > 0 && kept === 0, { held, kept });
  await o.context.close();
}
{
  // Annuler la publication d'un fil qui a reçu, depuis, la réponse d'une autre personne : rien n'est défait.
  const o = await open('facture', { init: RECORD_CALLS });
  const page = o.page;
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await publish(page, 'Un');
  const id = (await threadsNow(page))[0].id;
  await page.evaluate(({ TABLE, id }) => window.__gristStub.applyUserActions([['AddRecord', TABLE, null, { LectureId: 'pdf-7', CommentId: id, Auteur: 'autre@exemple.fr', Texte: 'Réponse d’une autre personne', CreeLe: new Date().toISOString() }]]), { TABLE, id });
  await closeThread(page);
  await undoKey(page);
  const said = await status(page);
  check('annuler la publication d’un fil qui a reçu la réponse d’une autre personne : rien n’est défait (deux lignes restent), le coin d’état dit pourquoi', (await rowsOf(page)).length === 2 && said.text === await tr(page, 'pdf.comment.hasReplies') && said.cls === 'error-msg', { rows: (await rowsOf(page)).length, said });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Les fils des autres : lus à l’ouverture, à l’ouverture d’un fil et après un geste ; ni mêlés aux autres PDF ni aux modèles ==');
{
  const A = { LectureId: 'pdf-7', CommentId: 'cm-a', Auteur: 'ana@exemple.fr', Texte: 'À vérifier avec le client', CreeLe: '2026-11-02T09:00:00.000Z', Resolu: false, ...anchorIn(text1, 'Garantie 12 mois', 1) };
  const A2 = { LectureId: 'pdf-7', CommentId: 'cm-a', Auteur: 'luc@exemple.fr', Texte: 'C’est fait', CreeLe: '2026-11-02T10:00:00.000Z' };
  const B = { LectureId: 'pdf-7', CommentId: 'cm-b', Auteur: 'ana@exemple.fr', Texte: 'Délai accepté', CreeLe: '2026-11-02T11:00:00.000Z', Resolu: true, ...anchorIn(text2, 'Paiement à 30 jours', 2) };
  const OTHER_PDF = { LectureId: 'pdf-8', CommentId: 'cm-c', Auteur: 'ana@exemple.fr', Texte: 'Fil d’un autre PDF', CreeLe: '2026-11-02T12:00:00.000Z', Resolu: false, ...anchorIn(text1, 'Garantie 12 mois', 1) };
  const MODEL = { ModeleId: 1, CommentId: 'cm-model', Auteur: 'ana@exemple.fr', Texte: 'Fil d’un modèle', CreeLe: '2026-11-02T13:00:00.000Z' };
  const seed = seedRows([A, A2, B, OTHER_PDF, MODEL]);
  const o = await open('facture', { init: RECORD_CALLS, seed });
  const page = o.page;
  await idle(page);
  const found = (await threadsNow(page)).map(x => [x.id, x.messages, x.resolved, x.page]).sort();
  check('à l’ouverture : les fils de CE PDF (deux), avec leurs messages et leur état - pas celui d’un autre PDF, pas celui d’un modèle', same(found, [['cm-a', 2, false, 1], ['cm-b', 1, true, 2]]), found);
  check('… l’ouverture n’a rien écrit', (await callsOf(page)).length === 0);
  const m1 = await marksOf(page, 'cm-a');
  check('le passage du premier fil est surligné, sur sa page, avec son texte', m1.length === 1 && m1[0].text === 'Garantie 12 mois' && m1[0].page === 1 && m1[0].resolved === 'false', m1);
  await page.evaluate(() => document.querySelector('#reader-container .pp-pdf-page[data-page="2"]').scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => !!document.querySelector('.pp-pdf-mark[data-comment-id="cm-b"]'), null, { timeout: 15000 });
  const m2 = await marksOf(page, 'cm-b');
  check('… celui de la page 2 aussi, résolu', m2.length === 1 && m2[0].text === 'Paiement à 30 jours' && m2[0].page === 2 && m2[0].resolved === 'true', m2);

  // Le fil d'une autre personne s'ouvre, une réponse de plus arrive pendant ce temps : elle se montre à l'ouverture suivante.
  await openMark(page, 'cm-b');
  check('le fil d’une autre personne s’ouvre à la souris : son message, son état « résolu »', same((await popupOf(page)).messages, ['Délai accepté']) && (await popupOf(page)).resolvedBadge);
  await closeThread(page);
  await page.evaluate(({ TABLE }) => window.__gristStub.applyUserActions([['AddRecord', TABLE, null, { LectureId: 'pdf-7', CommentId: 'cm-b', Auteur: 'luc@exemple.fr', Texte: 'Merci, vu', CreeLe: '2026-11-03T08:00:00.000Z' }]]), { TABLE });
  await openMark(page, 'cm-b');
  await waitPopupMessages(page, 2).catch(() => {});
  check('une réponse écrite entre-temps par une autre personne se montre à l’ouverture du fil (les fils sont relus à l’ouverture)', same((await popupOf(page)).messages, ['Délai accepté', 'Merci, vu']), (await popupOf(page)).messages);
  await closeThread(page);

  // Une réponse qu'on est en train de taper ne se perd pas quand les fils sont relus : la fenêtre se redessine avec les nouveaux messages, la saisie garde son texte, le focus et le curseur. La relecture est ralentie pour
  // que la personne ait le temps de commencer à écrire (dans le vrai Grist elle prend quelques centaines de millisecondes).
  await page.evaluate(({ TABLE }) => window.__gristStub.applyUserActions([['AddRecord', TABLE, null, { LectureId: 'pdf-7', CommentId: 'cm-b', Auteur: 'ana@exemple.fr', Texte: 'Dernière nouvelle', CreeLe: '2026-11-03T09:00:00.000Z' }]]), { TABLE });
  await page.evaluate(() => {
    window.__fetchTable = grist.docApi.fetchTable.bind(grist.docApi);
    grist.docApi.fetchTable = async (...args) => { await new Promise(resolve => setTimeout(resolve, 1200)); return window.__fetchTable(...args); };
  });
  await page.evaluate(() => { const mark = document.querySelector('.pp-pdf-mark[data-comment-id="cm-b"]'); if (mark) mark.scrollIntoView({ block: 'center' }); });
  await sleep(250);
  const slowMark = (await marksOf(page, 'cm-b'))[0];
  await page.mouse.click((slowMark.left + slowMark.right) / 2, (slowMark.top + slowMark.bottom) / 2);
  await waitPopup(page);
  await typeIn(page, 'Ma réponse');
  const beforeRead = (await popupOf(page)).messages.length;
  await waitPopupMessages(page, 3);
  const afterRead = await popupOf(page);
  check('une réponse en cours de frappe survit à la relecture des fils : la fenêtre montre les nouveaux messages (2 puis 3), la saisie garde son texte et le focus', beforeRead === 2 && afterRead.messages.length === 3 && afterRead.replyValue === 'Ma réponse' && afterRead.focusedIsReply, { beforeRead, afterRead });
  await page.keyboard.type(' suite');
  check('… et la frappe continue là où elle en était', (await popupOf(page)).replyValue === 'Ma réponse suite', await popupOf(page));
  await page.evaluate(() => { grist.docApi.fetchTable = window.__fetchTable; });
  await closeThread(page);

  // Le fil d'un modèle ne voit pas les fils des PDF.
  const model = await page.evaluate(async () => {
    PdfReading.close();
    await Comments.loadForTemplate(1);
    await Comments.whenIdle();
    return { model: Comments.snapshot('cm-model').messages.length, pdf: Comments.snapshot('cm-a').messages.length + Comments.snapshot('cm-b').messages.length + Comments.snapshot('cm-c').messages.length };
  });
  check('et réciproquement : la lecture des fils d’un modèle ne voit que le sien (un message), aucun fil de PDF', model.model === 1 && model.pdf === 0, model);
  await o.context.close();
}
{
  // « Une autre personne » ouvre le même document : ce que la première session a écrit (ses lignes) suffit à retrouver le fil, au même endroit.
  const seed = seedRows(publishedRows.map((row) => { const { id, ...rest } = row; return rest; }), MODEL_COLS.concat(PDF_COLS).filter(c => !MODEL_COLS.includes(c)));
  const o = await open('facture', { seed });
  const page = o.page;
  await idle(page);
  const thread = (await threadsNow(page))[0];
  const mark = (await marksOf(page))[0];
  check('une autre session, qui n’a que la table : le fil publié plus haut est là, avec son message, son passage et sa page', !!thread && thread.messages === 1 && thread.page === 1 && thread.citation === publishedAnchor.citation && !!mark && mark.text === publishedAnchor.citation, { thread, mark });
  await openMark(page, thread.id);
  check('… son message se lit', same((await popupOf(page)).messages, ['Premier message']));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Un PDF renommé garde ses fils (la clé est l’identifiant de GFS) ; un autre PDF n’a pas les siens ==');
{
  const A = { LectureId: 'pdf-7', CommentId: 'cm-a', Auteur: 'ana@exemple.fr', Texte: 'À vérifier', CreeLe: '2026-11-02T09:00:00.000Z', Resolu: false, ...anchorIn(text1, 'Garantie 12 mois', 1) };
  const o = await open('facture', { seed: seedRows([A]) });
  const page = o.page;
  await idle(page);
  const before = (await threadsNow(page)).map(x => x.id);
  // GFS rouvre le même PDF (même identifiant) sous un autre nom.
  const reopen = (name, id) => page.evaluate(({ src, name, id }) => window.__gfsStub.call('ouvrir', { fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: { id, fichier: window.__makeFile(Object.assign({}, src, { name })) } }), { src: kit.src('facture'), name, id });
  await reopen('facture-renommee.pdf', 'pdf-7');
  await page.waitForFunction(() => PdfReading.info() && PdfReading.info().name === 'facture-renommee.pdf' && PdfView.pagesShown().includes(1), null, { timeout: 30000 });
  await idle(page);
  const after = (await threadsNow(page)).map(x => x.id);
  await page.evaluate(() => document.querySelector('#reader-container .pp-pdf-page[data-page="1"]').scrollIntoView({ block: 'center' }));
  await sleep(500);
  check('le même PDF sous un autre nom (même identifiant) : ses fils sont là, ses marques aussi', same(before, ['cm-a']) && same(after, ['cm-a']) && (await marksOf(page, 'cm-a')).length === 1, { before, after });
  await reopen('facture.pdf', 'pdf-9');
  await page.waitForFunction(() => PdfReading.info() && PdfReading.info().id === 'pdf-9', null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  await idle(page);
  check('un autre PDF (un autre identifiant), même texte : aucun fil de l’autre, aucune marque', (await threadsNow(page)).length === 0 && (await marksOf(page)).length === 0, await threadsNow(page));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Une sélection qui déborde de la page : coupée, et le coin d’état le dit ==');
{
  const o = await open('small', { init: RECORD_CALLS });
  const page = o.page;
  await page.waitForFunction(() => PdfView.pagesShown().includes(2), null, { timeout: 20000 });
  const [from, to] = await linesOf(page, [[1, 'Page 1 alpha'], [2, 'Page 2 alpha']]);
  await drag(page, { x: from.left + 30, y: from.y }, { x: to.left + to.width * 0.5, y: to.y });
  const anchor = await anchorNow(page);
  await clickComment(page);
  await waitPopup(page);
  const said = await status(page);
  check('commencée page 1, finie page 2 : le coin d’état dit qu’un commentaire ne couvre qu’une page', !!anchor && anchor.clipped === true && anchor.page === 1 && said.text === await tr(page, 'pdf.comment.clipped'), { anchor, said });
  await publish(page, 'Débord');
  const row = (await rowsOf(page))[0];
  const textOne = await page.evaluate(() => PdfView.pageText(1).then(s => s.text));
  check('… le fil publié est de la page 1, coupé à la fin du texte de la page 1', !!row && row.Page === 1 && row.Fin === textOne.length && row.Debut === anchor.debut, { row, length: textOne.length });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Un PDF sans texte ne se commente pas : « Commenter » grisé, avec sa raison, rien d’écrit ==');
{
  const o = await open('scan', { init: RECORD_CALLS });
  const page = o.page;
  await page.waitForFunction(() => PdfView.hasText() === false, null, { timeout: 20000 });
  await sleep(300);
  const button = await commentButton(page);
  const reason = await tr(page, 'pdf.locked.noText');
  const others = await Promise.all(['pdf.locked.edit', 'pdf.locked.template', 'pdf.locked.export', 'pdf.locked.structure', 'pdf.locked.comment'].map(k => tr(page, k)));
  check('un scan : « Commenter » est grisé et dit sa raison (le PDF n’a pas de texte), qui n’est celle d’aucun autre grisé', button.locked && button.aria === 'true' && button.title === reason && !others.includes(button.title), { button, reason });
  const c = await boxOf(page, '#v2-btn-comment');
  await page.mouse.click(c.x, c.y);
  await sleep(400);
  const said = await status(page);
  check('un clic dessus ne fait rien (aucune fenêtre, rien d’écrit) et le coin d’état dit la raison', !(await popupOf(page)).open && (await allCalls(page)).flat().filter(a => a[1] === TABLE).length === 0 && said.text === reason, said);
  await page.keyboard.press('Control+Alt+m');
  await sleep(300);
  check('Ctrl + Alt + M n’ouvre rien non plus', !(await popupOf(page)).open && (await marksOf(page)).length === 0);
  await o.context.close();
}
{
  // Un document en lecture seule : « Commenter » est grisé par les droits, avec sa raison à lui - jamais celle du PDF sans texte.
  const o = await open('facture', { search: '&readonly=true' });
  const page = o.page;
  await idle(page);
  const button = await commentButton(page);
  const noText = await tr(page, 'pdf.locked.noText');
  check('un document en lecture seule : « Commenter » reste grisé, mais par les droits (sa raison n’est pas celle d’un PDF sans texte)', !!button && (button.accessLocked || button.aria === 'true') && button.title !== noText && !button.locked, button);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Grist refuse la structure : la raison est dite, rien n’est écrit, « Commenter » reste grisé pour ce PDF ==');
{
  const o = await open('facture', { init: RECORD_CALLS });
  const page = o.page;
  await page.evaluate(() => window.__gristStub.denyStructure(true));
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await publish(page, 'Refusé');
  await waitDialog(page);
  const d = await dialogOf(page);
  const refusedTitle = await tr(page, 'pdf.comment.structureRefused.title');
  check('Grist refuse d’ajouter les colonnes : l’app le dit dans sa fenêtre, avec la raison que Grist a donnée', d.open && d.title === refusedTitle && /Blocked by access rules/.test(d.message), d);
  const received = await page.evaluate((TABLE) => window.__gristStub.getActionLog().filter(a => a[1] === TABLE), TABLE);
  const tried = await callsOf(page);
  check('… rien n’a été écrit : le document n’a reçu aucune action, la table est celle d’avant ; l’app n’a tenté qu’UN lot (les colonnes), jamais la ligne du fil', received.length === 0 && same(await columnsOf(page), MODEL_COLS) && (await rowsOf(page)).length === 0 && tried.length === 1 && tried[0].every(a => a[0] === 'AddColumn'), { received, tried: tried.map(call => call.map(a => a[0])) });
  await clickDialog(page, await tr(page, 'common.close'));
  const button = await commentButton(page);
  const said = await status(page);
  check('« Commenter » reste grisé pour ce PDF, avec cette raison', button.locked && button.aria === 'true' && button.title === await tr(page, 'pdf.locked.structure') && said.text === await tr(page, 'pdf.locked.structure'), { button, said });
  await closeThread(page);
  await sleep(200);
  // La personne rouvre le PDF une fois la structure permise : la tentative se refait, et réussit.
  await page.evaluate(() => window.__gristStub.denyStructure(false));
  await page.evaluate(({ src }) => window.__gfsStub.call('ouvrir', { fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: { id: 'pdf-7', fichier: window.__makeFile(src) } }), { src: kit.src('facture') });
  await sleep(1000);
  await page.waitForFunction(() => PdfView.pagesShown().includes(1), null, { timeout: 20000 });
  const again = await commentButton(page);
  check('rouvrir le PDF une fois la structure permise : « Commenter » est de nouveau actif', !again.locked, again);
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await publish(page, 'Cette fois');
  check('… et le fil s’écrit (huit colonnes, une ligne)', same(await columnsOf(page), MODEL_COLS.concat(PDF_COLS)) && (await rowsOf(page)).length === 1);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Les colonnes qui manquent : seulement celles-là ; une table absente est créée avec toutes ses colonnes, après l’accord de la personne ==');
{
  // Une table qui a déjà deux des colonnes des PDF.
  const o = await open('facture', { init: RECORD_CALLS, seed: seedRows([], ['LectureId', 'Page']) });
  const page = o.page;
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await publish(page, 'Partiel');
  const calls = await callsOf(page);
  check('une table qui a déjà deux colonnes des PDF : le premier fil n’ajoute que les six qui manquent, en un lot, puis écrit sa ligne', calls.length === 2 && same(calls[0].map(a => a[2]), ['Debut', 'Fin', 'Citation', 'Avant', 'Apres', 'Resolu']) && calls[1].length === 1 && (await rowsOf(page)).length === 1, calls);
  await o.context.close();
}
{
  // Un document dont la table n'existe pas, mais où d'autres tables du widget sont là : la personne a déjà dit oui, la table est créée sans question.
  const o = await open('facture', { init: RECORD_CALLS, seed: `stub.dropTable('${TABLE}');` });
  const page = o.page;
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await publish(page, 'Sans table');
  const calls = (await allCalls(page)).flat().filter(a => a[1] === TABLE);
  const created = calls.find(a => a[0] === 'AddTable');
  const rows = await rowsOf(page);
  check('une table absente (les autres tables du widget sont là) : créée avec ses treize colonnes, sans question, puis la ligne du fil', !!created && !(await dialogOf(page)).open && same(created[2], undefined) === false && rows && rows.length === 1 && same((await columnsOf(page)), MODEL_COLS.concat(PDF_COLS)), { created, columns: await columnsOf(page) });
  await o.context.close();
}
{
  // Un document tout neuf : aucune table du widget. Le démarrage pose la question « Créer les tables ? » ; la personne répond « Ne pas créer » et lit son PDF. Au premier fil publié la question se repose (un geste a eu lieu depuis le refus) :
  // « Ne pas créer » n'écrit rien, « Créer » écrit la table et le fil.
  const names = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_Commentaires'];
  const o = await t.openPage({ seed: names.map(name => `stub.dropTable('${name}');`).join('\n'), stub: kit.GFS(), init: kit.INIT + kit.startReading('facture') + RECORD_CALLS, ready: false });
  const page = o.page;
  await waitDialog(page);
  const startup = await dialogOf(page);
  check('un document sans aucune table du widget : le démarrage pose la question « Créer les tables ? »', startup.open && startup.title === await tr(page, 'tableConsent.title'), startup);
  await clickDialog(page, await tr(page, 'tableConsent.decline'));
  await kit.settled(page);
  await idle(page);
  await page.evaluate(() => window.__gristStub.clearActionLog());
  await forgetCalls(page);
  check('« Ne pas créer » : le PDF se lit quand même, aucune table n’existe, « Commenter » n’est pas grisé', (await columnsOf(page)) === null && !(await commentButton(page)).locked && (await threadsNow(page)).length === 0);
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  await typeIn(page, 'Premier fil');
  const p = await popupOf(page);
  await page.mouse.click(p.post.x, p.post.y);
  await waitDialog(page);
  const ask = await dialogOf(page);
  check('au premier fil publié la question se repose, avant toute écriture', ask.open && ask.title === await tr(page, 'tableConsent.title') && (await page.evaluate(() => window.__gristStub.getActionLog())).length === 0, ask);
  await clickDialog(page, await tr(page, 'tableConsent.decline'));
  await idle(page);
  const said = await status(page);
  const q = await popupOf(page);
  check('« Ne pas créer » : rien n’est écrit, le coin d’état le dit, la fenêtre du fil reste ouverte avec son brouillon', (await page.evaluate(() => window.__gristStub.getActionLog())).length === 0 && said.text === await tr(page, 'pdf.comment.declined') && q.open && q.replyValue === 'Premier fil', { said, popup: q });
  await page.mouse.click(q.post.x, q.post.y);
  await waitDialog(page);
  await clickDialog(page, await tr(page, 'tableConsent.create'));
  await idle(page);
  const log = (await page.evaluate(() => window.__gristStub.getActionLog())).filter(a => a[1] === TABLE);
  const created = log.find(a => a[0] === 'AddTable');
  const rows = await rowsOf(page);
  check('« Créer » : la table est créée avec ses treize colonnes (celles des modèles, puis celles des PDF), puis la ligne du fil est écrite', !!created && same(created[2].map(c => c.id), MODEL_COLS.concat(PDF_COLS)) && !!rows && rows.length === 1 && rows[0].Texte === 'Premier fil' && rows[0].LectureId === 'pdf-7' && rows[0].Page === 1, { created: created && created[2].map(c => c.id), rows });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== En anglais, thème sombre, 700x400 : la fenêtre du fil est dans la langue, dans le panneau, lisible ==');
{
  const o = await open('facture', { lang: 'en', colorScheme: 'dark' });
  const page = o.page;
  await commentSelection(page, 1, 'Garantie', 0.0, 0.46);
  const p = await popupOf(page);
  const placeholder = await tr(page, 'comments.firstMessagePlaceholder');
  const post = await tr(page, 'comments.post');
  check('en anglais : la saisie et « Post » sont dans la langue, la fenêtre est dans le panneau', p.open && p.placeholder === placeholder && p.post.label === post && /Post/i.test(post) && p.left >= 0 && p.right <= 700 && p.top >= 0 && p.bottom <= 400, { p, placeholder, post });
  const lum = (css) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(css); return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : 255; };
  check('thème sombre : le fond de la fenêtre est sombre (comme celle d’un modèle)', lum(p.bg) < 90, p.bg);
  await publish(page, 'Hello');
  const q = await popupOf(page);
  check('… publié, elle propose « Reply », « Resolve », « Delete thread » dans la langue', q.post.label === await tr(page, 'comments.reply') && q.resolve.label === await tr(page, 'comments.resolve') && q.del.label === await tr(page, 'comments.deleteThread') && q.resolve.label === 'Resolve', { post: q.post.label, resolve: q.resolve.label, del: q.del.label });
  const marks = await marksOf(page);
  check('… la marque se voit sur le thème sombre (trait ambre)', marks.length === 1 && marks[0].border === 'rgb(240, 195, 109)', marks);
  const noText = await tr(page, 'pdf.locked.noText');
  check('… et la raison d’un PDF sans texte est dite en anglais', /no text/i.test(noText), noText);
  await o.context.close();
}

await t.finish();
