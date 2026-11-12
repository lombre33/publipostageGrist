#!/usr/bin/env node
// Un clic en dehors de la fenêtre d'un commentaire la referme (demande d'Antoine du 12/11 : « quand on a publié un commentaire, un clic en dehors de la fenêtre des commentaires devrait la fermer, là il faut le
// faire à la main »), à la VRAIE souris (page.mouse ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre. Ce que dev-tests/scenarios-comments.js ne voit pas depuis la
// page : un vrai clic dans le texte, sur la barre d'outils et sur le voile d'une fenêtre, le vrai pointeur qui quitte la fenêtre du fil.
//   1) un fil publié (« Commenter », texte tapé, « Publier ») : un clic dans le texte, hors de la fenêtre, la referme - la marque et la ligne Grist restent ;
//   2) un clic DANS la fenêtre (sur le message, sur l'en-tête) ne la referme pas ;
//   3) la protection du brouillon : un fil tout neuf qui attend son premier message (même texte déjà tapé) ne se ferme pas au clic dehors - sa marque reste ; une réponse commencée non plus, et son texte est gardé ;
//      la réponse vidée, le clic dehors referme de nouveau ;
//   4) « Supprimer » : un clic sur la confirmation (le voile, le cadre) ne referme pas la fenêtre du fil dessous, et « Annuler » de la confirmation non plus ;
//   5) un clic sur la marque d'un AUTRE fil bascule sur lui ; « Annuler » de la barre n'est pas un clic dehors (la fenêtre suit le fil défait), le clic dans le texte qui suit la referme ;
//   6) un clic droit dehors ne referme rien ;
//   7) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « commentOutsideClickMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-comment-outside-click-mouse.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.COMMENT_OUTSIDE_CLICK_PORT || 9167);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const FIRST = 'Un premier message';
const SECOND_THREAD = 'Le fil du second paragraphe';
const REPLY = 'Une réponse';
const DRAFT = 'Un brouillon pas publié';
const CANCEL = '#pp-dialog-modal .pp-modal-actions button:first-of-type';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Ce que la personne voit et ce que la table garde : les lignes, les marques, la fenêtre du fil (ouverte, ses messages, le texte tapé), la confirmation.
const snap = page => page.evaluate(() => {
  const t = window.__gristStub.state.rows.Publipostage_Commentaires;
  const pop = document.getElementById('v2-comment-popup');
  const open = !!pop && pop.style.display !== 'none';
  const reply = open ? pop.querySelector('.v2-comment-popup-reply') : null;
  const dialog = document.getElementById('pp-dialog-modal');
  return {
    rows: t ? t.Texte.slice() : [],
    marks: document.querySelectorAll('.tiptap .comment-mark').length,
    popupOpen: open,
    popupTexts: open ? Array.from(pop.querySelectorAll('.v2-comment-popup-text')).map(e => e.textContent) : [],
    typed: reply ? reply.value : null,
    confirmOpen: !!dialog && getComputedStyle(dialog).display !== 'none',
    paragraphs: Array.from(document.querySelectorAll('.tiptap p')).map(p => p.textContent),
  };
});

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
// Un clic dans le texte, hors de la fenêtre : au bout du paragraphe `index` (jamais sur une marque), le pointeur y arrive depuis la gauche.
async function clickInText(page, index, button = 'left') {
  const c = await page.evaluate(i => {
    const r = document.querySelectorAll('.tiptap p')[i].getBoundingClientRect();
    return { x: r.x + r.width - 8, y: r.y + r.height / 2 };
  }, index);
  await page.mouse.move(c.x - 40, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y, { button });
  await sleep(350);
}
async function selectParagraph(page, index) {
  const c = await page.evaluate(i => {
    const e = document.querySelectorAll('.tiptap p')[i];
    const r = e.getBoundingClientRect();
    return { x: r.x + Math.min(r.width / 2, 120), y: r.y + r.height / 2 };
  }, index);
  await page.mouse.click(c.x, c.y, { clickCount: 3 });
  await sleep(150);
}
// Un point de la marque `id` que rien ne recouvre (la fenêtre d'un autre fil peut être posée par-dessus sa plus grande part, à 700x400) : le pointeur y va, le clic vise bien la marque.
async function clickMark(page, id, wait = 500) {
  const c = await page.evaluate(markId => {
    const mark = Array.from(document.querySelectorAll('.tiptap .comment-mark')).find(m => m.getAttribute('data-comment-id') === markId);
    if (!mark) return null;
    for (const r of Array.from(mark.getClientRects())) {
      for (let x = r.left + 4; x < r.right - 2; x += 6) {
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === mark || mark.contains(hit))) return { x, y };
      }
    }
    return null;
  }, id);
  if (!c) return false;
  await page.mouse.move(c.x - 14, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 2 });
  await page.mouse.click(c.x, c.y);
  await sleep(wait);
  return true;
}
// La fenêtre du fil est posée où elle veut : un point de la page qui n'est pas sous elle, dans le paragraphe visé, pour que le clic vise vraiment « dehors ».
async function popupCoversText(page, index) {
  return page.evaluate(i => {
    const pop = document.getElementById('v2-comment-popup');
    if (!pop || pop.style.display === 'none') return false;
    const p = pop.getBoundingClientRect();
    const r = document.querySelectorAll('.tiptap p')[i].getBoundingClientRect();
    const x = r.x + r.width - 8, y = r.y + r.height / 2;
    return x >= p.left && x <= p.right && y >= p.top && y <= p.bottom;
  }, index);
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    await page.evaluate(() => {
      Editor.setHTML('<p>Un premier paragraphe à commenter, assez long pour que sa marque dépasse la fenêtre d\'un fil posée au-dessus du second paragraphe</p><p>Un second paragraphe à commenter aussi</p><p>Un troisième paragraphe pour cliquer dehors</p>');
      document.getElementById('template-name').value = 'Clic dehors commentaires';
    });
    await click(page, '#btn-save');
    await sleep(900);
    await page.mouse.move(40, 370, { steps: 4 });
    await sleep(300);

    console.log(`\n[${tag}] un fil publié se ferme au clic dehors`);
    await selectParagraph(page, 0);
    await realClick(page, '#v2-btn-comment', 500);
    let now = await snap(page);
    check(`${tag} : « Commenter » ouvre le composeur et pose la marque`, now.popupOpen && now.marks === 1 && same(now.popupTexts, []), now);
    await realClick(page, '.v2-comment-popup-reply', 200);
    await page.keyboard.type(FIRST);
    await realClick(page, '.v2-comment-popup-post', 700);
    now = await snap(page);
    check(`${tag} : « Publier » écrit la ligne et le fil reste affiché`, same(now.rows, [FIRST]) && now.popupOpen && same(now.popupTexts, [FIRST]), now);
    check(`${tag} : le troisième paragraphe n'est pas sous la fenêtre (le clic visera vraiment dehors)`, !(await popupCoversText(page, 2)));
    await clickInText(page, 2);
    now = await snap(page);
    check(`${tag} : un clic dans le texte, hors de la fenêtre, la referme`, !now.popupOpen, now);
    check(`${tag} : la marque et la ligne restent`, now.marks === 1 && same(now.rows, [FIRST]), now);

    console.log(`\n[${tag}] un clic dans la fenêtre ne la referme pas`);
    const firstMark = await page.evaluate(() => document.querySelector('.tiptap .comment-mark').getAttribute('data-comment-id'));
    await clickMark(page, firstMark);
    now = await snap(page);
    check(`${tag} : un clic sur la marque rouvre le fil`, now.popupOpen && same(now.popupTexts, [FIRST]), now);
    await realClick(page, '.v2-comment-popup-text', 300);
    now = await snap(page);
    check(`${tag} : un clic sur le message ne la referme pas`, now.popupOpen, now);
    await realClick(page, '.v2-comment-popup-badge', 300);
    now = await snap(page);
    check(`${tag} : un clic sur l'en-tête ne la referme pas`, now.popupOpen, now);

    console.log(`\n[${tag}] la protection du brouillon`);
    await realClick(page, '.v2-comment-popup-reply', 200);
    await page.keyboard.type(DRAFT);
    await clickInText(page, 2);
    now = await snap(page);
    check(`${tag} : une réponse commencée n'est pas perdue au clic dehors : la fenêtre reste, le texte tapé aussi`, now.popupOpen && now.typed === DRAFT, now);
    await realClick(page, '.v2-comment-popup-reply', 150);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await sleep(150);
    await clickInText(page, 2);
    now = await snap(page);
    check(`${tag} : la réponse vidée, le clic dehors referme la fenêtre`, !now.popupOpen && now.marks === 1 && same(now.rows, [FIRST]), now);

    // Un fil tout neuf, sans message : le fermer au clic dehors retirerait sa marque - il attend son premier message.
    await selectParagraph(page, 1);
    await realClick(page, '#v2-btn-comment', 500);
    now = await snap(page);
    check(`${tag} : un second « Commenter » ouvre un composeur et pose sa marque`, now.popupOpen && now.marks === 2 && same(now.popupTexts, []), now);
    await clickInText(page, 2);
    now = await snap(page);
    check(`${tag} : un fil tout neuf, vide, ne se ferme pas au clic dehors et garde sa marque`, now.popupOpen && now.marks === 2, now);
    await realClick(page, '.v2-comment-popup-reply', 200);
    await page.keyboard.type(DRAFT);
    await clickInText(page, 2);
    now = await snap(page);
    check(`${tag} : un premier message tapé mais pas publié reste là au clic dehors`, now.popupOpen && now.typed === DRAFT && now.marks === 2 && same(now.rows, [FIRST]), now);
    await realClick(page, '.v2-comment-popup-reply', 150);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(SECOND_THREAD);
    await realClick(page, '.v2-comment-popup-post', 700);
    now = await snap(page);
    check(`${tag} : une fois publié, le second fil est écrit et reste affiché`, same(now.rows, [FIRST, SECOND_THREAD]) && now.popupOpen && same(now.popupTexts, [SECOND_THREAD]), now);

    console.log(`\n[${tag}] un clic sur un AUTRE fil, la confirmation de « Supprimer »`);
    const reached = await clickMark(page, firstMark);
    check(`${tag} : un point de la marque du premier fil reste visible à côté de la fenêtre du second`, reached);
    now = await snap(page);
    check(`${tag} : un clic sur la marque du premier fil bascule la fenêtre sur lui`, now.popupOpen && same(now.popupTexts, [FIRST]), now);
    await realClick(page, '.v2-comment-popup-delete', 500);
    now = await snap(page);
    check(`${tag} : « Supprimer » ouvre la confirmation, la fenêtre du fil reste dessous`, now.confirmOpen && now.popupOpen, now);
    await realClick(page, '#pp-dialog-modal .pp-modal-box', 300);
    now = await snap(page);
    check(`${tag} : un clic dans la confirmation ne referme pas la fenêtre du fil`, now.confirmOpen && now.popupOpen, now);
    await realClick(page, CANCEL, 400);
    now = await snap(page);
    check(`${tag} : « Annuler » de la confirmation la ferme, le fil reste ouvert et entier`, !now.confirmOpen && now.popupOpen && same(now.rows, [FIRST, SECOND_THREAD]), now);

    console.log(`\n[${tag}] la barre d'outils, le clic droit`);
    await page.mouse.move(300, 380, { steps: 2 });
    await clickInText(page, 2, 'right');
    now = await snap(page);
    check(`${tag} : un clic droit dehors ne referme rien`, now.popupOpen, now);
    await realClick(page, '.v2-comment-popup-reply', 200);
    await page.keyboard.type(REPLY);
    await realClick(page, '.v2-comment-popup-post', 700);
    now = await snap(page);
    check(`${tag} : une réponse publiée écrit la ligne et le fil reste affiché`, now.rows.includes(REPLY) && now.popupOpen, now);
    await realClick(page, '#v2-btn-undo', 700);
    now = await snap(page);
    check(`${tag} : « Annuler » de la barre n'est pas un clic dehors : la fenêtre reste et montre le fil sans la réponse`, now.popupOpen && !now.rows.includes(REPLY) && same(now.popupTexts, [FIRST]), now);
    await clickInText(page, 2);
    now = await snap(page);
    check(`${tag} : un clic dans le texte la referme ensuite`, !now.popupOpen, now);

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
