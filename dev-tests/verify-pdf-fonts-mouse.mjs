#!/usr/bin/env node
// La fenêtre « Polices du document » (js/pdf-font-plan.js) à la VRAIE souris, à 700x400 (le panneau de Grist), hébergée (GFS simulé, dev-tests/gfs-stub.js) : ce que voit et clique une agente de l'État qui
// exporte en PDF un texte écrit en Marianne. Retour du 11/11 : son texte sortait en Roboto, sans un mot.
//   1) sans GFS (extension « polices » inactive) : la fenêtre s'ouvre en haut (la phrase puis les polices remplacées d'abord), entière dans le panneau, ses deux boutons au premier plan, la phrase qui dit
//      qu'inclure Marianne demande Grist Factory Suite, aucun choix ni case ; « Exporter le PDF » (vrai clic) donne un PDF où Cambria est en Tinos et Marianne en Roboto, et rien n'a été demandé à jsDelivr ;
//   2) avec GFS : la fenêtre s'ouvre en haut AUSSI (le focus donné au choix de Marianne, plus bas, ne la défile pas : vu à la main le 12/11, le début était hors de vue), le choix Roboto/Inclure, la case de
//      déclaration et les deux liens des règles de l'État se lisent en défilant ; « Inclure » grise « Exporter le PDF » tant que la case n'est pas cochée ; tous les textes lisibles (>= 4,5:1) ;
//   3) Échap n'exporte rien (« Export annulé ») et ne lit rien chez jsDelivr ; un document sans police à dire n'ouvre aucune fenêtre ;
//   4) le même en anglais, thème sombre ; aucune erreur de page.
// La vraie Marianne n'est JAMAIS lue ici (sa licence) : l'essai ne coche pas « Inclure » jusqu'au bout ; l'inclusion de bout en bout est jouée par le groupe pdfFontPlan, avec de faux fichiers.
// Lancé par run-headless.mjs (groupe Node « pdfFontsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pdf-fonts-mouse.mjs
import { open, stopServer, sleep, click, fire, pickTemplate, status, downloadOf as downloadOfLib } from './load-lib.mjs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PDF_FONTS_PORT || 9031);
const downloadOf = (page, name, action, timeout = 90000) => downloadOfLib(page, name, action, timeout);
const SPEC = { tables: [{ id: 'PbClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 2, table: 'PbClients', columns: ['Nom'] } };
const MODAL = '#pp-fonts-modal';
const OK = MODAL + ' .var-modal-primary';
const CANCEL = MODAL + ' .pp-modal-actions button:not(.var-modal-primary)';
const DOC_HTML = '<p><span style="font-family: Marianne;">Texte en Marianne : été, œuvre</span></p><p><span style="font-family: Cambria;">Cambria devient Tinos</span></p>';
const PLAIN_HTML = '<p><span style="font-family: Arial;">Arial est dans le PDF</span></p>';
const WORDS = {
  fr: { cancelled: 'Export annulé.', needsExt: 'Inclure Marianne demande l’extension « Polices » de Grist Factory Suite', activate: 'Activer l’extension « Polices »…', roboto: 'Remplacer Marianne par Roboto', include: 'Inclure Marianne dans le PDF' },
  en: { cancelled: 'Export canceled.', needsExt: 'Including Marianne requires the “Fonts” extension of Grist Factory Suite', activate: 'Turn on the “Fonts” extension…', roboto: 'Replace Marianne with Roboto', include: 'Include Marianne in the PDF' },
};

let total = 0;
let failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const dialogOpen = page => page.evaluate(() => { const ov = document.getElementById('pp-fonts-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; });
async function waitDialog(page, shown = true, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await dialogOpen(page)) === shown) return true; await sleep(100); }
  return false;
}
const setDocument = (page, html) => page.evaluate((h) => { Editor.setHTML(h); }, html);
const setExtensions = async (page, list) => {
  await page.evaluate(l => window.__gfsStub.setExtensions(l), list);
  const want = list.includes('polices');
  for (let i = 0; i < 40; i++) { if ((await page.evaluate(() => Extensions.isActive('polices'))) === want) break; await sleep(60); }
  await sleep(150);
};

// Ce que la fenêtre montre : sa place dans le panneau, le défilement de son corps, ce qui est vu (dans la partie visible du corps) et lisible.
const seen = page => page.evaluate(() => {
  const ov = document.getElementById('pp-fonts-modal');
  const box = ov.querySelector('.pp-modal-box');
  const body = ov.querySelector('.pp-modal-body');
  const b = box.getBoundingClientRect();
  const bodyBox = body.getBoundingClientRect();
  const visibleInBody = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= bodyBox.top - 0.5 && r.bottom <= bodyBox.bottom + 0.5; };
  const shownNode = el => !!el && el.getBoundingClientRect().width > 0 && !el.closest('[hidden]');
  const onTop = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (el === t || el.contains(t)); };
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = c => {
    const [r, g, bl] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const ratio = (a, c) => { const la = lum(a), lb = lum(c); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const texts = Array.from(ov.querySelectorAll('.pp-fonts-intro, .pp-fonts-text, .pp-fonts-row, .pp-fonts-legend, .pp-fonts-choice label, .pp-fonts-note, .pp-fonts-activate, .pp-fonts-link, .pp-modal-title, h3')).filter(shownNode);
  const rows = Array.from(ov.querySelectorAll('.pp-fonts-row')).filter(shownNode);
  const ok = ov.querySelector('.var-modal-primary');
  const cancel = ov.querySelector('.pp-modal-actions button:not(.var-modal-primary)');
  return {
    inPanel: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, boxH: Math.round(b.height),
    scrollTop: body.scrollTop, scrolls: body.scrollHeight > body.clientHeight + 1,
    title: (ov.querySelector('h3') || {}).textContent || '',
    firstRowSeen: rows.length ? visibleInBody(rows[0]) : false, rows: rows.map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    okSeen: shownNode(ok) && onTop(ok), cancelSeen: shownNode(cancel) && onTop(cancel), okDisabled: !!ok.disabled,
    choice: shownNode(ov.querySelector('.pp-fonts-choice')), roboto: !!ov.querySelector('#pp-fonts-roboto') && shownNode(ov.querySelector('#pp-fonts-roboto')), include: !!ov.querySelector('#pp-fonts-include') && shownNode(ov.querySelector('#pp-fonts-include')),
    links: Array.from(ov.querySelectorAll('.pp-fonts-link')).filter(shownNode).map(a => a.getAttribute('href')),
    allText: ov.textContent.replace(/\s+/g, ' '),
    noGfsShown: shownNode(ov.querySelector('.pp-fonts-note')),
    activateShown: shownNode(ov.querySelector('.pp-fonts-activate')), activateText: (ov.querySelector('.pp-fonts-activate') || {}).textContent || '', focusId: (document.activeElement && document.activeElement.id) || '',
    lowest: texts.map(el => ({ t: el.textContent.trim().slice(0, 30), c: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100 })).filter(x => x.c < 4.5),
    texts: texts.length,
  };
});
// Amène un élément de la fenêtre dans la partie visible du corps (comme la molette), puis le rend cliquable à la vraie souris.
async function reveal(page, selector) {
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'nearest' }), selector);
  await sleep(120);
}
async function pdfFontsOf(file) { try { return execFileSync('pdffonts', [file], { encoding: 'utf8' }); } catch (e) { return 'pdffonts: ' + String(e.message).slice(0, 120); } }

let w = null;
const jsdelivr = [];
try {
  w = await open({
    spec: SPEC, port: PORT, settleMs: 1500, theme: 'light', lang: 'fr',
    onPage: async (page) => {
      await page.addInitScript({ path: join(ROOT, 'dev-tests', 'gfs-stub.js') });
      await page.addInitScript(() => { history.replaceState(null, '', location.pathname + '?gfs=0'); });
      page.on('request', (request) => { if (/cdn\.jsdelivr\.net\/npm\/@gouvfr/.test(request.url())) jsdelivr.push(request.url()); });
    },
  });
  let page = w.page;
  await page.evaluate(() => GfsLink.ready.then(() => Extensions.loadAll()));
  await pickTemplate(page, 'Modèle 0001');
  await fire(page, 'PbClients', 1);

  // ---- 1) Sans GFS ----
  await setExtensions(page, ['graphique']);
  await setDocument(page, DOC_HTML);
  await sleep(300);
  await click(page, '#btn-export-pdf');
  check('sans l\'extension : la fenêtre « Polices du document » s\'ouvre', await waitDialog(page));
  await sleep(300);
  let s = await seen(page);
  check('sans GFS : entière dans le panneau 700x400, ses deux boutons au premier plan', s.inPanel && s.okSeen && s.cancelSeen, { inPanel: s.inPanel, ok: s.okSeen, cancel: s.cancelSeen, h: s.boxH });
  check('sans GFS : ouverte en haut, la première police remplacée se lit sans défiler (« Cambria → Tinos »)', s.scrollTop === 0 && s.firstRowSeen && /Cambria → Tinos/.test(s.rows.join(' ')), { top: s.scrollTop, rows: s.rows });
  check('sans l\'extension : la phrase dit qu\'inclure Marianne demande l\'extension « Polices » de Grist Factory Suite, le bouton pour l\'activer est là, sans choix ni case', s.noGfsShown && s.allText.includes(WORDS.fr.needsExt) && s.activateShown && s.activateText === WORDS.fr.activate && !s.choice && !s.roboto && !s.include, { shown: s.noGfsShown, activate: s.activateText, choice: s.choice });
  check('sans GFS : tous les textes sont lisibles (>= 4,5:1)', s.texts > 0 && s.lowest.length === 0, s.lowest);
  const noGfs = await downloadOf(page, 'polices-sans-gfs', async () => { await click(page, OK); });
  check('sans GFS : « Exporter le PDF » (vrai clic) télécharge le PDF', noGfs.size > 1000 && /\.pdf$/.test(noGfs.file), noGfs);
  const noGfsFonts = await pdfFontsOf(noGfs.file);
  check('sans GFS : Cambria est écrit en Tinos, Marianne en Roboto, aucune Marianne dans le PDF', /Tinos/.test(noGfsFonts) && /Roboto/.test(noGfsFonts) && !/Marianne/.test(noGfsFonts), noGfsFonts);
  check('sans GFS : rien n\'a été demandé à jsDelivr', jsdelivr.length === 0, jsdelivr);

  // ---- 1 bis) Le bouton « Activer l'extension » : un vrai clic ouvre la fenêtre d'installation de GFS ; cochée là-bas, la fenêtre ouverte montre le choix ----
  await setDocument(page, DOC_HTML);
  await sleep(300);
  await click(page, '#btn-export-pdf');
  check('le bouton d\'activation : la fenêtre s\'ouvre', await waitDialog(page));
  await sleep(300);
  await reveal(page, '.pp-fonts-activate');
  s = await seen(page);
  const asksBefore = await page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer').length);
  await click(page, '.pp-fonts-activate');
  let asksAfter = asksBefore;
  for (let i = 0; i < 60 && asksAfter === asksBefore; i++) { await sleep(60); asksAfter = await page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer').length); }
  check('un vrai clic sur « Activer l\'extension « Polices »… » demande à GFS sa fenêtre d\'installation (appel installer pour « polices »)', asksAfter === asksBefore + 1 && await page.evaluate(() => { const calls = window.__gfsStub.calls.filter(c => c.nom === 'installer'); return calls[calls.length - 1].args.extension === 'polices'; }), { asksBefore, asksAfter });
  await setExtensions(page, ['graphique', 'polices']);
  await sleep(300);
  s = await seen(page);
  check('l\'extension cochée dans GFS : la fenêtre ouverte montre le choix Roboto / Inclure, sans la phrase ni le bouton, et ne s\'est pas fermée', (await dialogOpen(page)) && s.choice && s.roboto && s.include && !s.noGfsShown && !s.activateShown, { open: await dialogOpen(page), choice: s.choice, note: s.noGfsShown, button: s.activateShown });
  check('le focus est passé du bouton au choix « Remplacer Marianne par Roboto »', s.focusId === 'pp-fonts-roboto', s.focusId);
  await page.keyboard.press('Escape');
  check('Échap ferme la fenêtre (rien n\'est exporté)', await waitDialog(page, false));

  // ---- 2) Avec GFS ----
  await setExtensions(page, ['graphique', 'polices']);
  await setDocument(page, DOC_HTML);
  await sleep(300);
  await click(page, '#btn-export-pdf');
  check('avec GFS : la fenêtre s\'ouvre', await waitDialog(page));
  await sleep(300);
  s = await seen(page);
  check('avec GFS : entière dans le panneau 700x400, ses deux boutons au premier plan', s.inPanel && s.okSeen && s.cancelSeen, { inPanel: s.inPanel, ok: s.okSeen, cancel: s.cancelSeen, h: s.boxH });
  check('avec GFS : ouverte EN HAUT bien que le focus soit sur le choix de Marianne, plus bas (la première police remplacée se lit)', s.scrolls && s.scrollTop === 0 && s.firstRowSeen, { top: s.scrollTop, scrolls: s.scrolls, firstRowSeen: s.firstRowSeen });
  check('avec GFS : le choix Roboto / Inclure est là, la phrase « demande Grist Factory Suite » n\'est pas montrée', s.choice && s.roboto && s.include && !s.noGfsShown, { choice: s.choice, noGfs: s.noGfsShown });
  check('avec GFS : tous les textes sont lisibles (>= 4,5:1)', s.texts > 0 && s.lowest.length === 0, s.lowest);
  await reveal(page, '#pp-fonts-include');
  await click(page, '#pp-fonts-include');
  await sleep(200);
  s = await seen(page);
  check('« Inclure Marianne » : « Exporter le PDF » est grisé tant que la case n\'est pas cochée', s.okDisabled, s);
  await reveal(page, '#pp-fonts-consent');
  await click(page, '#pp-fonts-consent');
  await sleep(200);
  s = await seen(page);
  check('la case cochée dégrise « Exporter le PDF » ; les deux liens des règles de l\'État sont là', !s.okDisabled && s.links.length === 2 && s.links.every(href => /^https:\/\//.test(href)), { disabled: s.okDisabled, links: s.links });
  check('rien n\'a encore été demandé à jsDelivr (avant le oui)', jsdelivr.length === 0, jsdelivr);

  // ---- 3) Échap et le document sans police à dire ----
  await page.keyboard.press('Escape');
  check('Échap ferme la fenêtre', await waitDialog(page, false));
  check('Échap : l\'état dit « Export annulé. » et rien n\'est lu chez jsDelivr', (await status(page)) === WORDS.fr.cancelled && jsdelivr.length === 0, { status: await status(page), jsdelivr });
  await setDocument(page, PLAIN_HTML);
  await sleep(300);
  const plain = await downloadOf(page, 'polices-rien-a-dire', async () => { await click(page, '#btn-export-pdf'); });
  check('un document sans police à dire : aucune fenêtre, le PDF part tout de suite', !(await dialogOpen(page)) && plain.size > 1000, plain);
  check('aucune erreur de page (passe française)', realErrors(w).length === 0, realErrors(w));
  await w.close();
  w = null;

  // ---- 4) En anglais, thème sombre ----
  w = await open({
    spec: SPEC, port: PORT, settleMs: 1500, theme: 'dark', lang: 'en',
    onPage: async (p) => {
      await p.addInitScript({ path: join(ROOT, 'dev-tests', 'gfs-stub.js') });
      await p.addInitScript(() => { history.replaceState(null, '', location.pathname + '?gfs=0'); });
      p.on('request', (request) => { if (/cdn\.jsdelivr\.net\/npm\/@gouvfr/.test(request.url())) jsdelivr.push(request.url()); });
    },
  });
  page = w.page;
  await page.evaluate(() => GfsLink.ready.then(() => Extensions.loadAll()));
  await pickTemplate(page, 'Modèle 0001');
  await fire(page, 'PbClients', 1);
  await setExtensions(page, ['graphique']);
  await setDocument(page, DOC_HTML);
  await sleep(300);
  await click(page, '#btn-export-pdf');
  check('anglais, sombre, sans l\'extension : la fenêtre s\'ouvre', await waitDialog(page));
  await sleep(300);
  s = await seen(page);
  check('anglais, sombre, sans l\'extension : la phrase et le bouton « Turn on the “Fonts” extension… » se lisent (>= 4,5:1), sans choix', s.allText.includes(WORDS.en.needsExt) && s.activateShown && s.activateText === WORDS.en.activate && !s.choice && s.lowest.length === 0, { activate: s.activateText, lowest: s.lowest });
  await page.keyboard.press('Escape');
  await waitDialog(page, false);
  await setExtensions(page, ['graphique', 'polices']);
  await setDocument(page, DOC_HTML);
  await sleep(300);
  await click(page, '#btn-export-pdf');
  check('anglais, sombre : la fenêtre s\'ouvre', await waitDialog(page));
  await sleep(300);
  s = await seen(page);
  check('anglais, sombre : entière dans le panneau, ouverte en haut, boutons au premier plan', s.inPanel && s.scrollTop === 0 && s.firstRowSeen && s.okSeen && s.cancelSeen, { inPanel: s.inPanel, top: s.scrollTop, first: s.firstRowSeen, ok: s.okSeen, cancel: s.cancelSeen });
  check('anglais, sombre : « Replace Marianne with Roboto » et « Include Marianne in the PDF » se lisent, titre « Document fonts »', s.allText.includes(WORDS.en.roboto) && s.allText.includes(WORDS.en.include) && /Document fonts/i.test(s.title), { title: s.title });
  check('anglais, sombre : tous les textes sont lisibles (>= 4,5:1)', s.texts > 0 && s.lowest.length === 0, s.lowest);
  await page.keyboard.press('Escape');
  check('anglais, sombre : Échap annule (« Export canceled. »)', (await waitDialog(page, false)) && (await status(page)) === WORDS.en.cancelled, await status(page));
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
