// Ce que les essais des fils de commentaires d'un PDF ont en commun (verify-gfs-comment-threads.mjs : publier, répondre, résoudre, supprimer, Annuler ; verify-gfs-comment-replace.mjs : le PDF remplacé et le passage introuvable) :
// le faux Grist qui garde la table `Publipostage_Commentaires` et le journal de tout ce qui s'y écrit, ce que la personne voit (la fenêtre d'un fil, le coin d'état, les fenêtres de l'app) et ses gestes, à la vraie souris et au
// vrai clavier de Playwright. Les PDF et la main sur leur texte viennent de dev-tests/gfs-pdf-kit.mjs.
import { sleep } from './gfs-pdf-kit.mjs';

export const anchorIn = (text, passage, page) => { const debut = text.indexOf(passage); return { Page: page, Debut: debut, Fin: debut + passage.length, Citation: passage, Avant: text.slice(Math.max(0, debut - 24), debut), Apres: text.slice(debut + passage.length, debut + passage.length + 24) }; };

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le faux Grist : la table des commentaires et ce qui s'y écrit.
export const TABLE = 'Publipostage_Commentaires';
export const MODEL_COLS = ['ModeleId', 'CommentId', 'Auteur', 'Texte', 'CreeLe'];
export const PDF_COLS = ['LectureId', 'Page', 'Debut', 'Fin', 'Citation', 'Avant', 'Apres', 'Resolu'];
// Des lignes déjà dans la table (écrites par « d'autres personnes » ou par un modèle) au démarrage ; `columns` : celles que la table a en plus des cinq d'avant.
export const seedRows = (rows, columns = PDF_COLS) => `
  const table = stub.state.rows.${TABLE};
  ${JSON.stringify(columns)}.forEach(c => { if (!table[c]) table[c] = table.id.map(() => null); });
  ${JSON.stringify(rows)}.forEach((row) => {
    const id = stub.state.nextRowId.${TABLE} || (table.id.length + 1);
    table.id.push(id);
    Object.keys(table).forEach((k) => { if (k !== 'id') table[k].push(Object.prototype.hasOwnProperty.call(row, k) ? row[k] : null); });
    stub.state.nextRowId.${TABLE} = id + 1;
  });`;
export const rowsOf = page => page.evaluate((TABLE) => {
  const table = window.__gristStub.state.rows[TABLE];
  if (!table) return null;
  return table.id.map((id, i) => { const row = { id }; Object.keys(table).forEach((k) => { if (k !== 'id') row[k] = table[k][i]; }); return row; });
}, TABLE);
export const columnsOf = page => page.evaluate((TABLE) => { const table = window.__gristStub.state.rows[TABLE]; return table ? Object.keys(table).filter(k => k !== 'id') : null; }, TABLE);
// Ce que l'app a écrit : chaque appel d'`applyUserActions` (un lot), tel que le document le reçoit.
export const RECORD_CALLS = `
  window.__calls = [];
  document.addEventListener('DOMContentLoaded', () => {
    const original = grist.docApi.applyUserActions.bind(grist.docApi);
    grist.docApi.applyUserActions = (actions, options) => { window.__calls.push(actions.map(a => [a[0], a[1], a[2], a[3] && typeof a[3] === 'object' && !Array.isArray(a[3]) ? a[3] : null])); return original(actions, options); };
  });`;
export const callsOf = async (page) => (await page.evaluate(() => window.__calls)).map(call => call.filter(a => a[1] === TABLE)).filter(call => call.length);
export const forgetCalls = page => page.evaluate(() => { window.__calls.length = 0; });
export const allCalls = page => page.evaluate(() => window.__calls);
export const idle = async (page) => { for (let i = 0; i < 3; i++) { await page.evaluate(async () => { await PdfComments.whenIdle(); await ActionHistory.whenIdle(); }); await sleep(120); } };

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Ce que la personne voit : la fenêtre d'un fil (la même que celle d'un modèle), la barre, le coin d'état, les fenêtres de l'app.
export const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
export const popupOf = page => page.evaluate(() => {
  const box = document.getElementById('v2-comment-popup');
  if (!box || getComputedStyle(box).display === 'none') return { open: false };
  const q = s => box.querySelector(s);
  const center = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, label: el.textContent, disabled: !!el.disabled }; };
  const r = box.getBoundingClientRect();
  return {
    open: true, left: r.left, top: r.top, right: r.right, bottom: r.bottom, bg: getComputedStyle(box).backgroundColor,
    badge: q('.v2-comment-popup-badge') ? q('.v2-comment-popup-badge').textContent : null, resolvedBadge: !!q('.v2-comment-popup-badge.is-resolved'),
    messages: Array.from(box.querySelectorAll('.v2-comment-popup-message .v2-comment-popup-text')).map(m => m.textContent),
    reply: center(q('.v2-comment-popup-reply')), replyValue: q('.v2-comment-popup-reply') ? q('.v2-comment-popup-reply').value : null, placeholder: q('.v2-comment-popup-reply') ? q('.v2-comment-popup-reply').placeholder : null,
    post: center(q('.v2-comment-popup-post')), resolve: center(q('.v2-comment-popup-resolve')), del: center(q('.v2-comment-popup-delete')), close: center(q('.v2-comment-popup-close')),
    focusedIsReply: !!q('.v2-comment-popup-reply') && document.activeElement === q('.v2-comment-popup-reply'),
    lost: q('.pp-pdf-lost') ? { title: q('.pp-pdf-lost-title').firstChild.textContent, was: q('.pp-pdf-lost-page') ? q('.pp-pdf-lost-page').textContent : null, quote: q('.pp-pdf-lost-quote') ? q('.pp-pdf-lost-quote').textContent : null } : null,
  };
});
export const waitPopup = (page, shown = true) => page.waitForFunction((shown) => { const b = document.getElementById('v2-comment-popup'); return (!!b && getComputedStyle(b).display !== 'none') === shown; }, shown, { timeout: 10000 });
export const waitPopupMessages = (page, n) => page.waitForFunction((n) => document.querySelectorAll('#v2-comment-popup .v2-comment-popup-message').length === n, n, { timeout: 10000 });
export const buttonState = (id) => `(() => { const b = document.getElementById('${id}'); if (!b) return null; return { locked: b.classList.contains('pp-pdf-locked'), accessLocked: b.classList.contains('pp-access-locked'), aria: b.getAttribute('aria-disabled'), title: b.getAttribute('title') }; })()`;
export const commentButton = page => page.evaluate(buttonState('v2-btn-comment'));
export const status = page => page.evaluate(() => ({ text: document.getElementById('status-msg').textContent, cls: document.getElementById('status-msg').className }));
export const tr = (page, key, params) => page.evaluate(([key, params]) => I18n.t(key, params), [key, params || null]);
export const dialogOf = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  return { open: true, title: ov.querySelector('h3').textContent, message: (document.getElementById('pp-dialog-message') || {}).textContent || '', buttons };
});
export const waitDialog = page => page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 15000 });
export const clickDialog = async (page, label) => {
  const d = await dialogOf(page);
  const b = d.open && d.buttons.find(x => x.label === label);
  if (!b) throw new Error('bouton « ' + label + ' » absent : ' + JSON.stringify(d));
  await page.mouse.click(b.x, b.y);
  await sleep(400);
};

// Les gestes de la personne. « Commenter » : sélectionner à la souris puis cliquer le bouton de la barre (ou Ctrl + Alt + M) ; l'ancre est celle que la sélection donnait juste avant.
export const clickComment = async (page) => { const c = await boxOf(page, '#v2-btn-comment'); await page.mouse.click(c.x, c.y); };
export const typeIn = async (page, words) => {
  const p = await popupOf(page);
  await page.mouse.click(p.reply.x, p.reply.y);
  await page.keyboard.type(words);
};
export const press = async (page, which) => {
  const p = await popupOf(page);
  const c = p[which];
  if (!c) throw new Error('bouton absent : ' + which + ' ' + JSON.stringify(p));
  await page.mouse.click(c.x, c.y);
  await idle(page);
};
export const publish = async (page, words) => { await typeIn(page, words); await press(page, 'post'); };
export const threadsNow = page => page.evaluate(() => PdfComments.threads());
// La croix de la fenêtre (Échap ne ferme que depuis la saisie, qui n'a le focus qu'à l'ouverture d'un fil neuf).
export const closeThread = async (page) => { const p = await popupOf(page); await page.mouse.click(p.close.x, p.close.y); await waitPopup(page, false); };
export const undoKey = async (page) => { await page.keyboard.press('Control+z'); await idle(page); await sleep(250); await idle(page); };
export const redoKey = async (page) => { await page.keyboard.press('Control+y'); await idle(page); await sleep(250); await idle(page); };

// Les gestes de la personne sur le texte du PDF à l'écran : `kit` est ce que dev-tests/gfs-pdf-kit.mjs:pdfKit rend.
export function gestures(kit) {
  const { selectOnLine, anchorNow, marksOf } = kit;
  const commentSelection = async (page, n, starts, a, b, how = 'button') => {
    await selectOnLine(page, n, starts, a, b);
    const anchor = await anchorNow(page);
    if (how === 'button') await clickComment(page); else await page.keyboard.press('Control+Alt+m');
    await waitPopup(page);
    return anchor;
  };

  const openMark = async (page, id) => {
    // La personne fait défiler jusqu'au passage commenté (la souris ne va que là où elle peut aller), puis le clique.
    await page.evaluate((id) => { const mark = document.querySelector('.pp-pdf-mark[data-comment-id="' + id + '"]'); if (mark) mark.scrollIntoView({ block: 'center' }); }, id);
    await sleep(250);
    const m = (await marksOf(page, id))[0];
    if (!m) throw new Error('marque absente : ' + id);
    await page.mouse.click((m.left + m.right) / 2, (m.top + m.bottom) / 2);
    await waitPopup(page);
    await idle(page);
  };

  const seenMarks = async (page) => (await marksOf(page)).map(m => m.id);

  return { commentSelection, openMark, seenMarks };
}
