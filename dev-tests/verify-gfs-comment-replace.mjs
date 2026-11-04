#!/usr/bin/env node
// Un PDF REMPLACÉ garde ses fils (consigne GFS 045, lot 4 : extensions/lecture-pdf/pdf-comments.js, pdf-anchor.js:relocate, pdf-view.js), 700x400, à la vraie souris et au vrai clavier. Un GFS simulé (dev-tests/gfs-stub.js, adresse
// `?gfs=0`) ouvre des PDF fabriqués ici (pdf-lib) sous le MÊME identifiant - c'est ce qui fait un PDF remplacé : la clé des fils ne change pas, le fichier si - ; le faux Grist (dev-tests/grist-stub.js) garde la table
// `Publipostage_Commentaires` (des fils déjà écrits au départ) et le journal de tout ce qui s'y écrit : ce script lit ce que la personne voit ET ce qui part dans le document.
//  LE PASSAGE SE RETROUVE : là où il était (le PDF n'a pas bougé), sinon par sa citation - sur la page où il était d'abord, puis sur les autres de proche en proche, le meilleur entourage départageant deux passages identiques - ;
//   page ajoutée avant, ligne ajoutée avant, PDF raccourci. La marque est sur le passage, à sa nouvelle place.
//  LE PASSAGE EST INTROUVABLE : le fil n'est pas effacé. Un bandeau en haut du PDF (« N commentaires sans passage », seulement quand il y en a) ouvre la liste de ces fils ; un clic sur l'un ouvre sa fenêtre, qui dit « Passage introuvable »,
//   garde la citation et la page d'avant, et laisse répondre, résoudre, rouvrir, supprimer - Annuler et Rétablir compris.
//  RIEN NE S'ÉCRIT : ouvrir un PDF remplacé, chercher les passages, les trouver ou non, ne touche jamais la table (l'ancre d'un fil reste celle de sa publication : une version qui rend le passage le retrouve) ; quitter le PDF
//   n'efface rien non plus.
// Lancé par run-headless.mjs (groupe Node "gfsCommentReplace", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-comment-replace.mjs
import { start } from './gfs-page.mjs';
import { pdfKit, linesPdf, sleep } from './gfs-pdf-kit.mjs';
import { TABLE, anchorIn, seedRows, rowsOf, RECORD_CALLS, callsOf, idle, boxOf, popupOf, waitPopup, waitPopupMessages, commentButton, tr, waitDialog, clickDialog, typeIn, press, threadsNow, closeThread, undoKey, gestures } from './gfs-pdf-threads-kit.mjs';

const t = await start({ name: 'verify-gfs-comment-replace', port: Number(process.env.GFS_COMMENT_REPLACE_PORT || 8924) });
const { check } = t;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le PDF d'origine (trois pages) et ses versions : une page de couverture ajoutée avant, une ligne ajoutée avant le passage, le passage supprimé, le passage rendu à deux endroits, un PDF raccourci, un scan, un gros PDF.
const P1 = ['Facture n° 2026-117', 'Client : Dupont SA', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €', 'Total TTC : 1 200 €'];
const P2 = ['Conditions de paiement', 'Paiement à 30 jours', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €'];
const P3 = ['Annexe', 'Merci de votre confiance'];
const text1 = P1.join(' ');
const text2 = P2.join(' ');
const text3 = P3.join(' ');
const PDFS = {
  v0: { name: 'devis.pdf', bytes: await linesPdf([P1, P2, P3]) },
  cover: { name: 'devis-couverture.pdf', bytes: await linesPdf([['Couverture', 'Devis et facture'], P1, P2, P3]) },
  line: { name: 'devis-ligne.pdf', bytes: await linesPdf([['Facture n° 2026-117', 'Référence : AB-12', 'Client : Dupont SA', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €', 'Total TTC : 1 200 €'], P2, P3]) },
  gone: { name: 'devis-sans-garantie.pdf', bytes: await linesPdf([['Facture n° 2026-117', 'Client : Dupont SA', 'Total HT : 1 000 €', 'Total TTC : 1 200 €'], ['Conditions de paiement', 'Paiement à 30 jours', 'Total HT : 1 000 €'], P3]) },
  far: { name: 'devis-remerciements.pdf', bytes: await linesPdf([['Facture n° 2026-117'], ['Conditions de paiement'], ['Annexe'], ['Remerciements', 'Merci de votre confiance'], ['Annexe', 'Merci de votre confiance']]) },
  short: { name: 'devis-court.pdf', bytes: await linesPdf([P1]) },
  scan: { name: 'devis-scan.pdf', bytes: await linesPdf([[], [], []]) },
  long: { name: 'gros-devis.pdf', bytes: await linesPdf(Array.from({ length: 150 }, (_, i) => ['Page ' + (i + 1), 'Texte de la page ' + (i + 1)])) },
};
const kit = pdfKit(t, PDFS);
const { LIB, open, marksOf, scrollToPage } = kit;
if (!LIB) {
  check('le fichier « pdfjs » du miroir hors-ligne est là (bash dev-tests/offline-deps.sh)', false);
  await t.finish();
}
const { openMark } = gestures(kit);

// Les fils déjà écrits au départ : « Garantie 12 mois » (page 1, avec la réponse d'une autre personne), « Paiement à 30 jours » (page 2), « Merci de votre confiance » (page 3).
const row = (id, who, said, when, extra) => ({ LectureId: 'pdf-7', CommentId: id, Auteur: who, Texte: said, CreeLe: when, ...extra });
const A = row('cm-a', 'ana@exemple.fr', 'À vérifier avec le client', '2026-11-02T09:00:00.000Z', { Resolu: false, ...anchorIn(text1, 'Garantie 12 mois', 1) });
const A2 = row('cm-a', 'luc@exemple.fr', 'C’est fait', '2026-11-02T10:00:00.000Z', {});
const B = row('cm-b', 'ana@exemple.fr', 'Délai accepté', '2026-11-02T11:00:00.000Z', { Resolu: false, ...anchorIn(text2, 'Paiement à 30 jours', 2) });
const C = row('cm-c', 'luc@exemple.fr', 'Remercier le client', '2026-11-02T12:00:00.000Z', { Resolu: false, ...anchorIn(text3, 'Merci de votre confiance', 3) });

// GFS remplace le PDF à l'écran par une autre version : même identifiant, autre fichier.
const askOpen = (page, key, id = 'pdf-7') => page.evaluate(({ src, id }) => window.__gfsStub.call('ouvrir', { fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: { id, fichier: window.__makeFile(src) } }), { src: kit.src(key), id });
const reopen = async (page, key, id = 'pdf-7', settle = true) => {
  await askOpen(page, key, id);
  await page.waitForFunction(name => PdfReading.info() && PdfReading.info().name === name && PdfView.pagesShown().includes(1), PDFS[key].name, { timeout: 40000 });
  if (settle) await idle(page);
};
// Ce que la personne voit du bandeau.
const barOf = page => page.evaluate(() => {
  const bar = document.querySelector('#reader-container .pp-pdf-bar');
  if (!bar) return null;
  const box = document.getElementById('reader-container').getBoundingClientRect();
  const r = bar.getBoundingClientRect();
  const panel = bar.querySelector('.pp-pdf-bar-panel');
  const button = bar.querySelector('.pp-pdf-bar-button');
  const p = panel.getBoundingClientRect();
  return {
    text: bar.querySelector('.pp-pdf-bar-text').textContent, expanded: button.getAttribute('aria-expanded'), panelHidden: panel.hidden, role: bar.getAttribute('role'), label: bar.getAttribute('aria-label'),
    rows: Array.from(panel.querySelectorAll('.pp-pdf-bar-row')).map(each => ({ id: each.getAttribute('data-comment-id'), quote: each.querySelector('.pp-pdf-bar-quote').textContent, meta: each.querySelector('.pp-pdf-bar-meta').textContent })),
    left: r.left, right: r.right, top: r.top, bottom: r.bottom, boxLeft: box.left, boxRight: box.right, boxTop: box.top, boxBottom: box.bottom,
    bg: getComputedStyle(bar).backgroundColor, ink: getComputedStyle(button).color, position: getComputedStyle(bar).position,
    panel: { top: p.top, bottom: p.bottom, client: panel.clientHeight, scroll: panel.scrollHeight }, focusOnButton: document.activeElement === button, focusOnRow: !!document.activeElement && document.activeElement.classList.contains('pp-pdf-bar-row'),
  };
});
const clickBar = async (page) => { const b = await boxOf(page, '#reader-container .pp-pdf-bar-button'); await page.mouse.click(b.x, b.y); await sleep(250); };
const clickRow = async (page, id) => { const b = await boxOf(page, '.pp-pdf-bar-row[data-comment-id="' + id + '"]'); await page.mouse.click(b.x, b.y); await waitPopup(page); await idle(page); };
// La marque d'un fil, une fois la page qui la porte amenée à l'écran.
const markOf = async (page, id, n) => {
  await scrollToPage(page, n, 50);
  await page.waitForFunction(id => !!document.querySelector('.pp-pdf-mark[data-comment-id="' + id + '"]'), id, { timeout: 15000 }).catch(() => {});
  await sleep(250);
  return marksOf(page, id);
};
const placed = async page => (await threadsNow(page)).map(x => [x.id, x.state, x.at ? x.at.page : null]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const lum = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const noWrites = async (page, before) => (await callsOf(page)).length === 0 && same(await rowsOf(page), before);

// ==================================================================================================================================================================================================
console.log('\n== Le PDF n’a pas changé : les fils sont à leur place, rien ne s’écrit, pas de bandeau ==');
{
  const o = await open('v0', { init: RECORD_CALLS, seed: seedRows([A, A2, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  check('les deux fils sont trouvés là où ils étaient : page 1 et page 2', same(await placed(page), [['cm-a', 'found', 1], ['cm-b', 'found', 2]]), await placed(page));
  const m = await markOf(page, 'cm-a', 1);
  check('… la marque du premier couvre « Garantie 12 mois »', m.length === 1 && m[0].text === 'Garantie 12 mois' && m[0].page === 1, m);
  check('… aucun bandeau : rien n’a perdu son passage', (await barOf(page)) === null);
  check('… et rien n’a été écrit', await noWrites(page, before));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Une page de couverture ajoutée avant : les fils suivent leur passage sur la page d’après ==');
{
  const o = await open('cover', { init: RECORD_CALLS, seed: seedRows([A, A2, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  check('« Garantie 12 mois » est maintenant page 2 et « Paiement à 30 jours » page 3 : les fils les y suivent', same(await placed(page), [['cm-a', 'found', 2], ['cm-b', 'found', 3]]), await placed(page));
  const a = await markOf(page, 'cm-a', 2);
  check('… la marque du premier est sur « Garantie 12 mois », page 2', a.length === 1 && a[0].text === 'Garantie 12 mois' && a[0].page === 2, a);
  const b = await markOf(page, 'cm-b', 3);
  check('… celle du second sur « Paiement à 30 jours », page 3', b.length === 1 && b[0].text === 'Paiement à 30 jours' && b[0].page === 3, b);
  check('… ni bandeau, ni écriture : l’ancre écrite dans la table reste celle de la publication (page 1 et page 2)', (await barOf(page)) === null && await noWrites(page, before) && before[0].Page === 1 && before[2].Page === 2, before.map(r => r.Page));
  await openMark(page, 'cm-a');
  check('un clic sur la marque ouvre le fil, comme avant : ses deux messages', same((await popupOf(page)).messages, ['À vérifier avec le client', 'C’est fait']) && !(await popupOf(page)).lost, await popupOf(page));
  await closeThread(page);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Une ligne ajoutée avant le passage, sur la même page : le fil le suit ==');
{
  const o = await open('line', { init: RECORD_CALLS, seed: seedRows([A]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  const thread = (await threadsNow(page))[0];
  const m = await markOf(page, 'cm-a', 1);
  check('le passage est page 1 mais plus à la même place du texte de la page : le fil a sa nouvelle place', thread.state === 'found' && thread.at.page === 1 && thread.at.debut !== A.Debut && thread.at.fin - thread.at.debut === 'Garantie 12 mois'.length, { thread, stored: A.Debut });
  check('… la marque est sur « Garantie 12 mois »', m.length === 1 && m[0].text === 'Garantie 12 mois', m);
  check('… rien n’est écrit', await noWrites(page, before));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Le passage n’existe plus : le fil reste, le bandeau le dit et le retrouve, sa fenêtre dit « Passage introuvable » ==');
{
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([A, A2, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  check('« Garantie 12 mois » n’est plus nulle part : son fil est « sans passage » ; celui de « Paiement à 30 jours » est trouvé', same(await placed(page), [['cm-a', 'lost', null], ['cm-b', 'found', 2]]), await placed(page));
  const bar = await barOf(page);
  check('un bandeau, seulement parce qu’un fil a perdu son passage : « 1 commentaire sans passage » (région nommée, liste fermée)', !!bar && bar.text === '1 commentaire sans passage' && bar.expanded === 'false' && bar.panelHidden && bar.role === 'region' && !!bar.label && bar.rows.length === 0, bar);
  check('… dans la colonne des pages, sur sa largeur (une carte, pas un trait), collé en haut', !!bar && bar.position === 'sticky' && bar.left >= bar.boxLeft && bar.right <= bar.boxRight && bar.right - bar.left >= 0.85 * (bar.boxRight - bar.boxLeft) && bar.top >= bar.boxTop && bar.top - bar.boxTop <= 40, bar);
  check('le fil sans passage n’a pas de marque ; l’autre a la sienne', (await marksOf(page, 'cm-a')).length === 0 && (await markOf(page, 'cm-b', 2)).length === 1);
  const scrolled = await barOf(page);
  check('… et il reste en vue en haut du panneau quand on défile (la page 2 est à l’écran)', !!scrolled && scrolled.top >= scrolled.boxTop && scrolled.top - scrolled.boxTop <= 40 && scrolled.bottom <= scrolled.boxBottom, scrolled);
  await scrollToPage(page, 1, 10);
  check('rien n’est écrit : ni la page d’avant du fil, ni son texte, ni son message (l’app ne le déplace pas et ne l’efface pas)', await noWrites(page, before));

  // Le bandeau : un clic sur lui ouvre la liste de ces fils.
  await clickBar(page);
  const open1 = await barOf(page);
  check('un clic sur le bandeau ouvre la liste : une ligne, la citation d’avant et la page où était le passage', open1.expanded === 'true' && !open1.panelHidden && same(open1.rows, [{ id: 'cm-a', quote: 'Garantie 12 mois', meta: 'page 1' }]), open1);
  await page.mouse.click(650, 380);   // ailleurs, sur la page
  await sleep(200);
  check('un clic ailleurs dans le panneau referme la liste (le bandeau reste)', (await barOf(page)).expanded === 'false' && (await barOf(page)).panelHidden && !!(await barOf(page)).text, await barOf(page));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => getComputedStyle(document.querySelector('.pp-pdf-bar')).display);
  await page.emulateMedia({ media: 'screen' });
  check('… et le bandeau ne s’imprime pas (le PDF imprimé n’a que ses pages)', printed === 'none', printed);
  await clickBar(page);
  await clickRow(page, 'cm-a');
  const win = await popupOf(page);
  check('un clic sur le fil l’ouvre : la liste se referme, la fenêtre dit « Passage introuvable », la citation, la page d’avant', (await barOf(page)).expanded === 'false' && win.open && !!win.lost && win.lost.title === 'Passage introuvable' && win.lost.quote === 'Garantie 12 mois' && win.lost.was === ' · il était page 1', { win, bar: await barOf(page) });
  check('… avec les messages du fil, la saisie, « Répondre », « Résoudre » et « Supprimer » (rien n’est retiré), tous à portée de la souris dans le panneau de 700x400', same(win.messages, ['À vérifier avec le client', 'C’est fait']) && !!win.post && !!win.resolve && !!win.del && win.left >= 0 && win.right <= 700 && win.top >= 0 && win.bottom <= 400 && [win.reply, win.post, win.resolve, win.del].every(b => b.y > win.top && b.y < win.bottom), win);
  check('… ouvrir le fil n’écrit rien non plus', await noWrites(page, before));

  // Répondre.
  await typeIn(page, 'Noté, je rappelle le client');
  await press(page, 'post');
  const reply = await callsOf(page);
  const replyFields = reply.length === 1 && reply[0].length === 1 ? reply[0][0][3] : null;
  check('répondre : UNE ligne de plus, sans ancre (ni page, ni passage, ni « résolu »), sur le fil', !!replyFields && replyFields.CommentId === 'cm-a' && replyFields.LectureId === 'pdf-7' && replyFields.Texte === 'Noté, je rappelle le client' && !('Page' in replyFields) && !('Citation' in replyFields) && !('Resolu' in replyFields) && !('ModeleId' in replyFields), reply);
  check('… la fenêtre montre trois messages et le fil est toujours « sans passage »', (await popupOf(page)).messages.length === 3 && (await popupOf(page)).lost && (await barOf(page)).text === '1 commentaire sans passage');

  // Résoudre, rouvrir : une écriture sur la ligne du premier message.
  const firstId = (await rowsOf(page))[0].id;
  await press(page, 'resolve');
  const resolved = (await callsOf(page)).slice(1);
  check('résoudre : UNE écriture, sur la ligne du premier message, qui ne change que « résolu »', resolved.length === 1 && resolved[0].length === 1 && same(resolved[0][0], ['UpdateRecord', TABLE, firstId, { Resolu: true }]), resolved);
  check('… la fenêtre dit « Résolu », garde sa note « Passage introuvable »', (await popupOf(page)).resolvedBadge && !!(await popupOf(page)).lost);
  await closeThread(page);
  await clickBar(page);
  check('… et la liste du bandeau le dit aussi : « page 1 · Résolu »', same((await barOf(page)).rows.map(r => r.meta), ['page 1 · Résolu']), await barOf(page));
  await clickRow(page, 'cm-a');
  await press(page, 'resolve');
  const reopened = (await callsOf(page)).slice(2);
  check('rouvrir : UNE écriture, sur la même ligne', reopened.length === 1 && same(reopened[0][0], ['UpdateRecord', TABLE, firstId, { Resolu: false }]) && !(await popupOf(page)).resolvedBadge, reopened);

  // Supprimer : toutes les lignes du fil, en un lot ; le bandeau s'en va avec le dernier fil sans passage.
  const p = await popupOf(page);
  await page.mouse.click(p.del.x, p.del.y);
  await waitDialog(page);
  await clickDialog(page, await tr(page, 'common.delete'));
  await idle(page);
  const del = (await callsOf(page)).slice(3);
  check('supprimer : l’app demande d’abord, puis UN lot qui retire TOUTES les lignes du fil (trois)', del.length === 1 && del[0].length === 3 && del[0].every(a => a[0] === 'RemoveRecord') && (await rowsOf(page)).length === 1, del);
  check('… la fenêtre se ferme, le bandeau s’en va (plus aucun fil sans passage), l’autre fil reste', !(await popupOf(page)).open && (await barOf(page)) === null && same((await threadsNow(page)).map(x => x.id), ['cm-b']));

  // Annuler (Ctrl + Z) rend le fil, toujours sans passage : le bandeau revient.
  await undoKey(page);
  await idle(page);
  check('Ctrl + Z rend le fil supprimé (ses trois lignes) : il est de nouveau « sans passage » et le bandeau revient', (await rowsOf(page)).length === 4 && same(await placed(page), [['cm-a', 'lost', null], ['cm-b', 'found', 2]]) && !!(await barOf(page)), { rows: (await rowsOf(page)).length, placed: await placed(page) });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Une version qui rend le passage le retrouve ; chaque PDF remplacé refait la recherche ; rien ne s’écrit ==');
{
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([A, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  check('la version sans « Garantie 12 mois » : le fil est « sans passage », avec son bandeau', same(await placed(page), [['cm-a', 'lost', null], ['cm-b', 'found', 2]]) && !!(await barOf(page)));
  await reopen(page, 'v0');
  const back = await markOf(page, 'cm-a', 1);
  check('GFS remplace le PDF par l’original : le fil retrouve son passage (page 1), sa marque est là, le bandeau s’en va', same(await placed(page), [['cm-a', 'found', 1], ['cm-b', 'found', 2]]) && back.length === 1 && back[0].text === 'Garantie 12 mois' && (await barOf(page)) === null, { placed: await placed(page), back, bar: await barOf(page) });
  await reopen(page, 'gone');
  check('… remplacé encore par la version sans le passage : il est de nouveau « sans passage » (la recherche se refait à chaque PDF ; rien n’avait été réécrit)', same(await placed(page), [['cm-a', 'lost', null], ['cm-b', 'found', 2]]) && !!(await barOf(page)), await placed(page));
  await reopen(page, 'cover');
  check('… puis par la version à couverture : il le retrouve page 2', same(await placed(page), [['cm-a', 'found', 2], ['cm-b', 'found', 3]]) && (await barOf(page)) === null, await placed(page));
  check('… et pendant tout ce temps, la table n’a pas bougé d’une ligne', await noWrites(page, before));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Plusieurs endroits possibles : le meilleur entourage décide ; un PDF raccourci ==');
{
  const o = await open('far', { init: RECORD_CALLS, seed: seedRows([C]) });
  const page = o.page;
  await idle(page);
  // « Merci de votre confiance » était page 3, après « Annexe ». La page 3 n’a plus que « Annexe » ; la page 4 l’a après « Remerciements », la page 5 après « Annexe » : c’est la 5e.
  check('le passage était page 3 ; la page 4 l’a avec un autre entourage, la page 5 avec le même : le fil va page 5', same(await placed(page), [['cm-c', 'found', 5]]), await placed(page));
  const m = await markOf(page, 'cm-c', 5);
  check('… sa marque est sur « Merci de votre confiance », page 5', m.length === 1 && m[0].text === 'Merci de votre confiance' && m[0].page === 5, m);
  await o.context.close();
}
{
  const o = await open('short', { init: RECORD_CALLS, seed: seedRows([A, B, C]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  check('un PDF raccourci à une page : le fil de la page 1 est trouvé, ceux des pages 2 et 3 (qui n’existent plus) sont sans passage', same(await placed(page), [['cm-a', 'found', 1], ['cm-b', 'lost', null], ['cm-c', 'lost', null]]), await placed(page));
  await clickBar(page);
  const bar = await barOf(page);
  check('le bandeau dit « 2 commentaires sans passage » (le pluriel), la liste suit l’ordre du PDF : page 2 puis page 3', bar.text === '2 commentaires sans passage' && same(bar.rows.map(r => [r.id, r.quote, r.meta]), [['cm-b', 'Paiement à 30 jours', 'page 2'], ['cm-c', 'Merci de votre confiance', 'page 3']]), bar);
  check('… rien n’est écrit', await noWrites(page, before));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Un fil résolu et sans passage ; un PDF remplacé par un scan ==');
{
  const resolvedA = { ...A, Resolu: true };
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([resolvedA]) });
  const page = o.page;
  await idle(page);
  await clickBar(page);
  check('un fil déjà résolu et sans passage reste dans la liste, dit « Résolu »', same((await barOf(page)).rows.map(r => r.meta), ['page 1 · Résolu']), await barOf(page));
  await clickRow(page, 'cm-a');
  const win = await popupOf(page);
  check('… sa fenêtre dit « Résolu » et propose « Rouvrir »', win.resolvedBadge && win.resolve.label === 'Rouvrir', win);
  await press(page, 'resolve');
  const calls = await callsOf(page);
  check('… « Rouvrir » écrit UNE ligne, « résolu » faux', calls.length === 1 && calls[0].length === 1 && calls[0][0][0] === 'UpdateRecord' && same(calls[0][0][3], { Resolu: false }), calls);
  await o.context.close();
}
{
  const o = await open('scan', { init: RECORD_CALLS, seed: seedRows([A, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  await page.waitForFunction(() => PdfView.hasText() === false, null, { timeout: 20000 });
  const button = await commentButton(page);
  check('le PDF remplacé par un scan : les deux fils sont sans passage, le bandeau le dit', same(await placed(page), [['cm-a', 'lost', null], ['cm-b', 'lost', null]]) && (await barOf(page)).text === '2 commentaires sans passage', await placed(page));
  check('… « Commenter » est grisé (un scan n’a pas de texte à sélectionner), avec sa raison', button.locked && button.title === await tr(page, 'pdf.locked.noText'), button);
  check('… et rien n’est écrit', await noWrites(page, before));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Un gros PDF : la recherche ne bloque pas la lecture ==');
{
  const o = await open('long', { init: RECORD_CALLS, seed: seedRows([A, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  check('150 pages sans le passage : les deux fils sont « sans passage » (toutes les pages ont été lues)', same(await placed(page), [['cm-a', 'lost', null], ['cm-b', 'lost', null]]) && (await barOf(page)).text === '2 commentaires sans passage', await placed(page));
  check('… la table n’a pas bougé', await noWrites(page, before));
  // Le moteur seul, dans la page : trois cents pages lues d’un trait rendent la main au navigateur entre elles (un minuteur posé avant a tourné), sans attente démesurée (un minuteur à zéro coûte 4 ms par page au plus : 1,2 s en tout).
  const timing = await page.evaluate(async () => {
    const pages = 300;
    const texts = Array.from({ length: pages }, (_, i) => ({ text: 'page ' + (i + 1) + ' sans le passage cherché' }));
    const anchor = { page: 150, debut: 10, fin: 25, citation: 'introuvable ici', avant: 'abc', apres: 'def' };
    let timerFired = false;
    setTimeout(() => { timerFired = true; }, 0);
    let calls = 0;
    const t0 = performance.now();
    const found = await PdfAnchor.relocate(anchor, pages, (n) => { calls++; return Promise.resolve(texts[n - 1]); }, {});
    return { found, calls, ms: performance.now() - t0, timerFired };
  });
  check('trois cents pages cherchées : le navigateur reprend la main entre elles (un minuteur posé avant a tourné) et la recherche ne s’éternise pas (moins de 3 s)', timing.found === null && timing.calls === 300 && timing.timerFired === true && timing.ms < 3000, timing);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Le PDF change pendant la recherche : la recherche d’avant ne dit rien du nouveau ==');
{
  const o = await open('v0', { init: RECORD_CALLS, seed: seedRows([A, B]) });   // le PDF qui charge l'extension
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  // La première page que la recherche du gros PDF lit n'arrive qu'au bout de 2,5 s : le PDF est remplacé pendant ce temps, et la recherche d'avant reprend après la relecture des fils du nouveau.
  await page.evaluate(() => {
    const original = PdfView.pageText;
    window.__slow = true;
    window.__slowSettled = false;
    PdfView.pageText = (n) => {
      if (!window.__slow) return original(n);
      window.__slow = false;
      return new Promise(resolve => setTimeout(() => { window.__slowSettled = true; resolve(original(n)); }, 2500));
    };
  });
  await reopen(page, 'long', 'pdf-7', false);
  await page.waitForFunction(() => window.__slow === false, null, { timeout: 20000 });
  check('le gros PDF est à l’écran et sa recherche est en route (ses fils attendent, ni trouvés ni perdus : pas de bandeau, pas de marque)', same(await placed(page), [['cm-a', 'pending', null], ['cm-b', 'pending', null]]) && (await barOf(page)) === null && (await marksOf(page, 'cm-a')).length === 0, await placed(page));
  await reopen(page, 'v0');
  check('remplacé par l’original avant qu’elle ait fini : les deux fils sont trouvés (page 1 et page 2), pas de bandeau', same(await placed(page), [['cm-a', 'found', 1], ['cm-b', 'found', 2]]) && (await barOf(page)) === null, { placed: await placed(page), bar: await barOf(page) });
  await page.waitForFunction(() => window.__slowSettled === true, null, { timeout: 20000 });
  await sleep(600);
  await idle(page);
  check('… et quand la recherche d’avant reprend, elle ne change rien : les fils sont toujours trouvés, toujours pas de bandeau, rien d’écrit', same(await placed(page), [['cm-a', 'found', 1], ['cm-b', 'found', 2]]) && (await barOf(page)) === null && await noWrites(page, before), { placed: await placed(page), bar: await barOf(page) });
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== La Lecture se redessine : le bandeau et les marques reviennent ==');
{
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([A, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  const first = await barOf(page);
  await page.evaluate(async () => { const container = document.getElementById('reader-container'); container.replaceChildren(); await PdfReading.render(container); });
  await page.waitForFunction(() => PdfView.isMounted() && PdfView.pagesShown().includes(1) && !!document.querySelector('#reader-container .pp-pdf-pages'), null, { timeout: 20000 });
  await idle(page);
  const again = await barOf(page);
  check('les pages sont reposées : le bandeau est de nouveau en tête, avec le même compte, liste fermée', !!first && !!again && again.text === first.text && again.expanded === 'false' && again.position === 'sticky', { first, again });
  const m = await markOf(page, 'cm-b', 2);
  check('… la marque du fil trouvé est revenue sur son passage, page 2', m.length === 1 && m[0].text === 'Paiement à 30 jours' && m[0].page === 2, m);
  check('… et rien n’est écrit', await noWrites(page, before));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== La liste ouverte se complète quand un autre fil perd son passage ==');
{
  const o = await open('v0', { init: RECORD_CALLS, seed: seedRows([A, B, C]) });
  const page = o.page;
  await idle(page);
  // Le verdict du troisième fil (celui de la page 3) n'est rendu qu'1,8 s après les autres : la liste a le temps de s'ouvrir avant.
  await page.evaluate(() => {
    const original = PdfAnchor.relocate;
    let calls = 0;
    PdfAnchor.relocate = async (...args) => {
      const found = await original(...args);
      if (++calls === 3) await new Promise(resolve => setTimeout(resolve, 1800));
      return found;
    };
  });
  await reopen(page, 'short', 'pdf-7', false);
  await page.waitForFunction(() => !!document.querySelector('#reader-container .pp-pdf-bar'), null, { timeout: 20000 });
  await clickBar(page);
  const one = await barOf(page);
  check('le premier fil sans passage ouvre le bandeau : « 1 commentaire sans passage », la liste ouverte n’a que lui', one.text === '1 commentaire sans passage' && one.expanded === 'true' && same(one.rows.map(r => r.id), ['cm-b']), one);
  await idle(page);
  const two = await barOf(page);
  check('le second perd son passage à son tour : la liste, restée ouverte, le montre (page 2 puis page 3)', two.text === '2 commentaires sans passage' && two.expanded === 'true' && !two.panelHidden && same(two.rows.map(r => r.id), ['cm-b', 'cm-c']), two);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== L’ancre d’un fil change dans le document : sa place est cherchée de nouveau ==');
{
  const o = await open('v0', { init: RECORD_CALLS, seed: seedRows([A, B]) });
  const page = o.page;
  await idle(page);
  const firstId = (await rowsOf(page))[0].id;
  const moved = anchorIn(text2, 'Paiement à 30 jours', 2);
  await page.evaluate(({ TABLE, firstId, moved }) => window.__gristStub.applyUserActions([['UpdateRecord', TABLE, firstId, moved]]), { TABLE, firstId, moved });
  await openMark(page, 'cm-b');   // ouvrir un fil relit la table
  await idle(page);
  const thread = (await threadsNow(page)).find(x => x.id === 'cm-a');
  check('une personne change le passage du premier fil dans la table : il est maintenant page 2, sur le nouveau passage (la place d’avant n’est pas gardée)', !!thread && thread.state === 'found' && thread.at.page === 2 && thread.citation === 'Paiement à 30 jours', thread);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Les fils sont lus avant que les pages ne soient posées : la pose lance la recherche ==');
{
  const o = await open('v0', { init: RECORD_CALLS, seed: seedRows([A, B]) });   // le PDF qui charge l'extension
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  // La pose des pages du PDF suivant n'a lieu qu'1,5 s plus tard : la table, elle, est lue tout de suite.
  await page.evaluate(() => {
    const original = PdfView.mount;
    PdfView.mount = async (...args) => { await new Promise(resolve => setTimeout(resolve, 1500)); return original(...args); };
  });
  const opening = askOpen(page, 'cover');
  await page.waitForFunction(() => PdfComments.threads().length === 2, null, { timeout: 20000 });
  const early = await page.evaluate(() => ({ mounted: PdfView.isMounted(), states: PdfComments.threads().map(t => t.state) }));
  check('les fils sont déjà lus mais les pages du PDF ne sont pas encore posées : ils attendent (ni trouvés ni perdus), pas de bandeau', early.mounted === false && same(early.states, ['pending', 'pending']) && (await barOf(page)) === null, early);
  await opening;
  await page.waitForFunction(() => PdfView.isMounted() && PdfView.pagesShown().includes(1), null, { timeout: 40000 });
  await idle(page);
  check('les pages sont posées : la pose lance la recherche, les deux fils sont trouvés (page 2 et page 3, la couverture s’ajoute), rien n’est écrit', same(await placed(page), [['cm-a', 'found', 2], ['cm-b', 'found', 3]]) && (await barOf(page)) === null && await noWrites(page, before), await placed(page));
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Au clavier ==');
{
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([A]) });
  const page = o.page;
  await idle(page);
  const view = await boxOf(page, '#reader-container .pp-pdf-page[data-page="1"]');
  await page.mouse.click(view.x, 330);   // un point de la page 1 qui est à l'écran (la page est plus haute que le panneau)
  // Le clic donne le focus aux pages (leur conteneur se tabule) ; la touche Tab suivante est le bandeau, avant la première page.
  await page.keyboard.press('Tab');
  check('le bandeau s’atteint au clavier : Tab depuis les pages tombe sur lui (c’est un bouton)', (await barOf(page)).focusOnButton, await barOf(page));
  await page.keyboard.press('Enter');
  await sleep(200);
  check('Entrée ouvre la liste', (await barOf(page)).expanded === 'true' && (await barOf(page)).rows.length === 1);
  await page.keyboard.press('Tab');
  check('Tab va à la première ligne de la liste', (await barOf(page)).focusOnRow, await barOf(page));
  await page.keyboard.press('Escape');
  await sleep(200);
  const closed = await barOf(page);
  check('Échap la referme et rend le focus au bandeau (la ligne qui l’avait disparaît avec la liste)', closed.expanded === 'false' && closed.panelHidden && closed.focusOnButton, closed);
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await waitPopup(page);
  const win = await popupOf(page);
  check('Entrée, Tab, Entrée : le fil s’ouvre (sa fenêtre dit « Passage introuvable »)', win.open && !!win.lost && same(win.messages, ['À vérifier avec le client']), win);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Six fils sans passage, 700x400 : la liste défile, chaque fil s’atteint à la souris ==');
{
  const rows = [A, B, C,
    row('cm-d', 'ana@exemple.fr', 'Quatrième', '2026-11-02T13:00:00.000Z', { Resolu: false, ...anchorIn(text1, 'Client : Dupont SA', 1) }),
    row('cm-e', 'ana@exemple.fr', 'Cinquième', '2026-11-02T14:00:00.000Z', { Resolu: false, ...anchorIn(text1, 'Total HT : 1 000 €', 1) }),
    row('cm-f', 'ana@exemple.fr', 'Sixième', '2026-11-02T15:00:00.000Z', { Resolu: false, ...anchorIn(text2, 'Conditions de paiement', 2) })];
  const o = await open('scan', { init: RECORD_CALLS, seed: seedRows(rows) });
  const page = o.page;
  await idle(page);
  await clickBar(page);
  const bar = await barOf(page);
  check('six fils sans passage : « 6 commentaires sans passage », la liste est contenue dans le panneau et défile', bar.text === '6 commentaires sans passage' && bar.rows.length === 6 && bar.panel.scroll > bar.panel.client && bar.panel.bottom <= bar.boxBottom, bar);
  // La liste suit l'ordre du PDF (page, puis date) : le dernier est le fil de la page 3.
  const unseen = await boxOf(page, '.pp-pdf-bar-row[data-comment-id="cm-c"]');
  await page.mouse.move(bar.left + 100, bar.panel.top + 20);
  await page.mouse.wheel(0, 400);
  await sleep(300);
  const last = await boxOf(page, '.pp-pdf-bar-row[data-comment-id="cm-c"]');
  const inside = await barOf(page);
  check('… à la molette, le dernier fil (page 3) vient dans la vue de la liste, qui reste dans le panneau', !!unseen && unseen.bottom > inside.panel.bottom && !!last && last.bottom <= inside.panel.bottom + 1 && last.top >= inside.panel.top - 1, { unseen, last, panel: inside.panel });
  await page.mouse.click(last.x, last.y);
  await waitPopup(page);
  const win = await popupOf(page);
  check('… un clic sur lui ouvre son fil, dans le panneau', win.open && same(win.messages, ['Remercier le client']) && win.left >= 0 && win.right <= 700 && win.top >= 0 && win.bottom <= 400, win);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Une autre personne supprime le fil pendant que la liste est ouverte ; le PDF quitte l’écran ==');
{
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([A, B]) });
  const page = o.page;
  await idle(page);
  await clickBar(page);
  const firstId = (await rowsOf(page))[0].id;
  await page.evaluate(({ TABLE, firstId }) => window.__gristStub.applyUserActions([['RemoveRecord', TABLE, firstId]]), { TABLE, firstId });
  await clickRow(page, 'cm-a').catch(() => {});
  await idle(page);
  await sleep(300);
  check('le fil a disparu du document (une autre personne) : à l’ouverture il se relit, la fenêtre se ferme et le bandeau s’en va', !(await popupOf(page)).open && (await barOf(page)) === null && same((await threadsNow(page)).map(x => x.id), ['cm-b']), { popup: await popupOf(page), bar: await barOf(page) });
  await o.context.close();
}
{
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([A, A2, B]) });
  const page = o.page;
  await idle(page);
  const before = await rowsOf(page);
  const left = await page.evaluate(async () => { PdfReading.close(); await PdfComments.whenIdle(); return { bar: !!document.querySelector('.pp-pdf-bar'), held: PdfView.barElement() !== null, threads: PdfComments.threads().length }; });
  check('le PDF quitte l’écran : le bandeau s’en va, plus aucun fil montré', same(left, { bar: false, held: false, threads: 0 }), left);
  check('… l’app ne touche à rien dans la table : les fils d’un PDF qui n’est plus à l’écran restent (pas de purge)', await noWrites(page, before) && before.length === 3);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== En anglais, thème sombre ==');
{
  const o = await open('gone', { init: RECORD_CALLS, seed: seedRows([A, B]), lang: 'en', colorScheme: 'dark' });
  const page = o.page;
  await idle(page);
  const bar = await barOf(page);
  check('le bandeau est dans la langue : « 1 comment without a passage »', !!bar && bar.text === '1 comment without a passage' && /passage/i.test(bar.label), bar);
  check('… sombre comme l’application, et lisible (contraste d’au moins 4,5)', !!bar && lum(bar.bg) < 0.1 && contrast(bar.bg, bar.ink) >= 4.5, { bg: bar && bar.bg, ink: bar && bar.ink, ratio: bar && contrast(bar.bg, bar.ink) });
  await clickBar(page);
  await clickRow(page, 'cm-a');
  const win = await popupOf(page);
  check('la fenêtre du fil est dans la langue : « Passage not found », la page d’avant, la citation', win.open && win.lost.title === 'Passage not found' && win.lost.was === ' · it was on page 1' && win.lost.quote === 'Garantie 12 mois', win);
  const colors = await page.evaluate(() => { const note = document.querySelector('#v2-comment-popup .pp-pdf-lost'); const box = document.getElementById('v2-comment-popup'); const c = sel => getComputedStyle(note.querySelector(sel)).color; return { popup: getComputedStyle(box).backgroundColor, note: getComputedStyle(note).backgroundColor, title: c('.pp-pdf-lost-title'), was: c('.pp-pdf-lost-page'), quote: c('.pp-pdf-lost-quote') }; });
  check('… sombre aussi, et lisible : titre, page d’avant et citation ont au moins 4,5 de contraste sur le fond de la note', lum(colors.popup) < 0.1 && lum(colors.note) < 0.1 && [colors.title, colors.was, colors.quote].every(ink => contrast(colors.note, ink) >= 4.5), colors);
  await o.context.close();
}

await t.finish();
