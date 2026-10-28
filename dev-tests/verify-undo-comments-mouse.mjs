#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir défont les commentaires - publier un fil, y répondre, le supprimer, en refermer un sans message - à la VRAIE souris et au vrai clavier (page.mouse,
// page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre - suite de sa demande du 22/10 : « Il doit prendre en compte 100% des actions faites dans le
// widget ». Ce que dev-tests/scenarios-undo-comments.js ne peut pas voir depuis la page : le bouton « Commenter » et ceux du popup atteints et cliqués à la souris, la saisie au clavier dans le composeur,
// la marque PEINTE (surlignée) qui apparaît et disparaît, le popup qui reste dans le panneau, le clavier rendu à l'éditeur après Ctrl + Z.
//   1) un vrai « Commenter » puis « Publier » : une ligne Grist, la marque peinte ; UN Ctrl + Z au clavier retire la marque ET la ligne, ferme le popup et rend le clavier à l'éditeur ; UN Ctrl + Y remet les deux ;
//   2) un clic sur la marque rouvre le fil ; une réponse tapée et publiée : deux lignes ; le bouton Annuler de la barre la retire, le popup ouvert ne montre plus qu'un message et reste dans le panneau ; Rétablir la remet ;
//   3) « Supprimer » (vrai clic, vraie confirmation) retire la marque et les lignes ; UN Ctrl + Z les rend toutes, le fil se rouvre avec ses deux messages ; UN Ctrl + Y le supprime de nouveau ;
//   4) une frappe, puis « Commenter » et le × du popup sans rien publier : plus de marque, et le Ctrl + Z suivant défait la frappe, pas une marque sans fil ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoCommentsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-comments-mouse.mjs
import { open, stopServer, sleep, click, center } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_COMMENTS_MOUSE_PORT || 9153);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const FIRST = 'Un premier message';
const REPLY = 'Une réponse';
const CANCEL = '#pp-dialog-modal .pp-modal-actions button:first-of-type';
const OK = '#pp-dialog-modal .var-modal-primary';
const BADGE = { fr: 'Commentaire', en: 'Comment' };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Ce que la personne voit et ce que la table garde : les lignes, les marques peintes, le popup (ouvert, ses messages, dans le panneau), le focus.
const snap = page => page.evaluate(() => {
  const t = window.__gristStub.state.rows.Publipostage_Commentaires;
  const pop = document.getElementById('v2-comment-popup');
  const open = !!pop && pop.style.display !== 'none';
  const box = open ? pop.getBoundingClientRect() : null;
  const mark = document.querySelector('.tiptap .comment-mark');
  return {
    rows: t ? t.Texte.slice() : [],
    marks: document.querySelectorAll('.tiptap .comment-mark').length,
    painted: mark ? getComputedStyle(mark).backgroundColor : null,
    popupOpen: open,
    popupTexts: open ? Array.from(pop.querySelectorAll('.v2-comment-popup-text')).map(e => e.textContent) : [],
    popupInside: box ? box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight : null,
    badge: open ? pop.querySelector('.v2-comment-popup-badge').textContent : null,
    focusInEditor: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ProseMirror')),
    paragraphs: Array.from(document.querySelectorAll('.tiptap p')).map(p => p.textContent),
    canUndo: EditorCore.getEditor().can().undo(),
  };
});
const isPainted = c => !!c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';

async function realClick(page, selector, wait = 300) {
  const c = await page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await sleep(wait);
}
async function key(page, combo, wait = 800) {
  await page.keyboard.press(combo);
  await sleep(wait);
}
// Un paragraphe sélectionné d'un triple clic (le menu « Enregistrer » est refermé : le pointeur est parti du bouton).
async function selectParagraph(page, index) {
  const c = await page.evaluate(i => {
    const e = document.querySelectorAll('.tiptap p')[i];
    const r = e.getBoundingClientRect();
    return { x: r.x + Math.min(r.width / 2, 120), y: r.y + r.height / 2 };
  }, index);
  await page.mouse.click(c.x, c.y, { clickCount: 3 });
  await sleep(150);
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    await page.evaluate(() => {
      Editor.setHTML('<p>Un paragraphe à commenter</p><p>Un second paragraphe</p>');
      document.getElementById('template-name').value = 'Annuler commentaires';
    });
    await click(page, '#btn-save');
    await sleep(900);
    // Le clic referme le menu du bouton Enregistrer, souris dessus ; le pointeur s'en éloigne avant de viser le texte.
    await page.mouse.move(40, 370, { steps: 4 });
    await sleep(300);

    console.log(`\n[${tag}] publier un fil`);
    await selectParagraph(page, 0);
    await realClick(page, '#v2-btn-comment', 500);
    await realClick(page, '.v2-comment-popup-reply', 200);
    await page.keyboard.type(FIRST);
    await realClick(page, '.v2-comment-popup-post', 700);
    let now = await snap(page);
    check(`${tag} : « Publier » écrit une ligne, la marque est peinte, le fil est ouvert dans le panneau`, same(now.rows, [FIRST]) && now.marks === 1 && isPainted(now.painted) && now.popupOpen && same(now.popupTexts, [FIRST]) && now.popupInside === true, now);

    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : UN Ctrl + Z au clavier retire la marque ET la ligne`, now.marks === 0 && same(now.rows, []), now);
    check(`${tag} : le popup du fil est fermé et le clavier est rendu à l'éditeur`, !now.popupOpen && now.focusInEditor, now);
    check(`${tag} : il ne reste rien à défaire derrière`, now.canUndo === false, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : UN Ctrl + Y remet la marque peinte et la ligne`, now.marks === 1 && isPainted(now.painted) && same(now.rows, [FIRST]) && !now.popupOpen, now);

    console.log(`\n[${tag}] répondre`);
    await realClick(page, '.tiptap .comment-mark', 500);
    now = await snap(page);
    check(`${tag} : un clic sur la marque rouvre le fil et son message`, now.popupOpen && same(now.popupTexts, [FIRST]) && now.popupInside === true, now);
    await realClick(page, '.v2-comment-popup-reply', 200);
    await page.keyboard.type(REPLY);
    await realClick(page, '.v2-comment-popup-post', 700);
    now = await snap(page);
    check(`${tag} : « Répondre » écrit la deuxième ligne, le fil montre les deux messages`, same(now.rows, [FIRST, REPLY]) && same(now.popupTexts, [FIRST, REPLY]), now);
    await realClick(page, '#v2-btn-undo', 700);
    now = await snap(page);
    check(`${tag} : le bouton Annuler de la barre retire la réponse seule (une ligne, la marque reste)`, same(now.rows, [FIRST]) && now.marks === 1, now);
    check(`${tag} : le popup resté ouvert ne montre plus que le premier message, dans le panneau`, now.popupOpen && same(now.popupTexts, [FIRST]) && now.popupInside === true, now);
    await realClick(page, '#v2-btn-redo', 700);
    now = await snap(page);
    check(`${tag} : le bouton Rétablir remet la réponse, ligne et popup`, same(now.rows, [FIRST, REPLY]) && same(now.popupTexts, [FIRST, REPLY]) && now.popupInside === true, now);

    console.log(`\n[${tag}] supprimer le fil`);
    await realClick(page, '.v2-comment-popup-delete', 500);
    await realClick(page, OK, 800);
    now = await snap(page);
    check(`${tag} : « Supprimer » (vrai clic, vraie confirmation) retire la marque et les deux lignes`, now.marks === 0 && same(now.rows, []) && !now.popupOpen, now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : UN Ctrl + Z rend la marque peinte ET les deux lignes`, now.marks === 1 && isPainted(now.painted) && same(now.rows, [FIRST, REPLY]), now);
    await realClick(page, '.tiptap .comment-mark', 500);
    now = await snap(page);
    check(`${tag} : le fil rendu se rouvre avec ses deux messages`, now.popupOpen && same(now.popupTexts, [FIRST, REPLY]) && now.badge === BADGE[lang], now);
    await realClick(page, '.v2-comment-popup-close', 300);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : UN Ctrl + Y le supprime de nouveau`, now.marks === 0 && same(now.rows, []), now);

    console.log(`\n[${tag}] un fil refermé sans message`);
    const c2 = await page.evaluate(() => { const r = document.querySelectorAll('.tiptap p')[1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(c2.x, c2.y);
    await page.keyboard.press('End');
    await page.keyboard.type(' fin');
    await sleep(900);
    await selectParagraph(page, 0);
    await realClick(page, '#v2-btn-comment', 500);
    now = await snap(page);
    check(`${tag} : « Commenter » pose la marque et ouvre le composeur`, now.marks === 1 && now.popupOpen && same(now.popupTexts, []), now);
    await realClick(page, '.v2-comment-popup-close', 400);
    now = await snap(page);
    check(`${tag} : refermé sans rien publier, la marque s'en va et aucune ligne n'est écrite`, now.marks === 0 && same(now.rows, []) && !now.popupOpen, now);
    await click(page, '.tiptap p:nth-of-type(2)');
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le Ctrl + Z suivant défait la frappe d'avant, pas une marque sans fil`, now.marks === 0 && now.paragraphs[1] === 'Un second paragraphe', now);

    const errors = realErrors(w);
    check(`${tag} : aucune erreur de page`, errors.length === 0, errors.slice(0, 3));
  } finally { await w.close(); }
}

try {
  await pass('fr', 'light', 'fr clair');
  await pass('en', 'dark', 'en sombre');
} catch (e) { failures++; console.log('ERREUR', e && e.stack || e); }
finally { await stopServer(); }
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
