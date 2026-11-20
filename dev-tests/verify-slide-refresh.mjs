#!/usr/bin/env node
// « METTRE À JOUR MAINTENANT » SUR UNE DIAPOSITIVE LIÉE DANS UN DOCUMENT (20/11, « je peux ajouter un bouton Mettre à jour maintenant sur la diapositive liée si tu veux » : « oui stp »).
// js/slide-copies.js `updateNow` et le bouton de la barre flottante de la copie (js/floating-toolbars.js, `copy-refresh`) : sans attendre le passage suivant de l'enregistrement automatique (de 15 secondes à plus
// de 3 minutes), la table des modèles est relue à l'instant et la copie en texte reprend sa diapositive. L'enregistrement automatique est coupé : seul le bouton relit.
// L'app hébergée par GFS (extension « diapositives »), 700x400, vraie souris, français clair puis anglais sombre. Le document « Devis » est à l'écran avec la première diapositive de « Offre » en copie liée.
//  LA BARRE : le curseur dans la copie, la barre propose « Mettre à jour maintenant » (un bouton d'icône, nommé, avec son info-bulle) avant « Détacher » ; il tient dans la fenêtre.
//  DÉJÀ À JOUR : un clic dit que la diapositive est à jour, rien ne change.
//  UN CHANGEMENT : « Offre » réécrite ailleurs (un mot changé dans la diapositive 1), la copie garde l'ancien texte tant qu'on ne clique pas (rien ne relit) ; un clic la met à jour sur-le-champ, le coin d'état le dit.
//  SANS SA DIAPOSITIVE : la diapositive retirée de « Offre », la barre dit qu'elle n'existe plus et le bouton se retire (« Détacher » reste).
//  PAS EN SUIVI DES MODIFICATIONS : le clic dit qu'il n'y a pas de mise à jour pendant le suivi, la copie ne change pas.
// Lancé par run-headless.mjs (groupe Node « slideRefresh », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-refresh.mjs
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-refresh', port: Number(process.env.SLIDE_REFRESH_PORT || 9147) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Devis', '<p>Bonjour,</p><p>Cordialement</p>', false, 'document');
  add(8, 'Offre', '<p>Un texte</p>${BR}<p>Deux texte</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 9;
`;
// Autosave coupé : seul le bouton relit la table des modèles.
const INIT = `try { localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) {}`;
const TEXTS = {
  fr: {
    refresh: 'Mettre à jour maintenant', detach: 'Détacher', bar: 'Suit la diapositive 1 de « Offre »', barGone: 'Sa diapositive d’origine n’existe plus',
    upToDate: 'La diapositive 1 de « Offre » est déjà à jour.', pulled: 'Le texte lié à « Offre » a pris la dernière version de sa diapositive.',
    off: 'Pas de mise à jour pendant le suivi des modifications ou l’écriture en direct.',
  },
  en: {
    refresh: 'Update now', detach: 'Detach', bar: 'Follows slide 1 of “Offre”', barGone: 'Its original slide no longer exists',
    upToDate: 'Slide 1 of “Offre” is already up to date.', pulled: 'The text linked to “Offre” took the latest version of its slide.',
    off: 'No update while changes are tracked or during live writing.',
  },
};

async function openDocument(lang, colorScheme) {
  const A = await t.openPage({ hosted: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, init: INIT });
  const { page } = A;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && !!EditorCore.getEditor(), null, { timeout: 15000 });
  await sleep(800);
  // La diapositive 1 de « Offre » en copie liée, après le premier paragraphe : les pas du volet « Diapositive d'une présentation… » (« En texte », « Garder liée »).
  const placed = await page.evaluate(async () => {
    await Templates.loadAll();
    const editor = EditorCore.getEditor();
    let at = -1;
    editor.state.doc.descendants((node, pos) => { if (at < 0 && node.isTextblock && node.textContent === 'Bonjour,') at = pos + node.nodeSize - 1; });
    editor.chain().focus().setTextSelection(at).run();
    const source = Templates.byId(8);
    const { html, link } = await SlideLinks.anchorSource(editor, 8, 0, source.contenu);
    return SlideCopies.insert(editor, { html, link, keepFormat: false });
  });
  await sleep(500);
  return { page, placed };
}
const view = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const blocks = [];
  editor.state.doc.forEach((node) => blocks.push(node.type.name + ':' + node.textContent));
  const bar = document.querySelector('.v2-copy-toolbar');
  const refresh = bar && bar.querySelector('.v2-copy-refresh');
  const detach = bar && bar.querySelector('.v2-copy-detach');
  const rect = el => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null; };
  return {
    blocks,
    barShown: !!bar && getComputedStyle(bar).display !== 'none' && !!bar.getClientRects().length,
    barText: bar ? (bar.querySelector('.v2-copy-name') || {}).textContent : null,
    refresh: rect(refresh), refreshTitle: refresh ? refresh.title : null, refreshLabel: refresh ? refresh.getAttribute('aria-label') : null, refreshHidden: refresh ? refresh.hidden : null,
    detach: rect(detach), detachText: detach ? detach.textContent.trim() : null,
    bounds: { w: window.innerWidth, h: window.innerHeight },
    status: document.getElementById('status-msg').textContent,
  };
});
const clickText = async (page, text) => {
  const c = await page.evaluate((whole) => {
    const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
    if (!block) return null;
    block.scrollIntoView({ block: 'center' });
    const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, node.textContent.length);
    const r = range.getBoundingClientRect();
    return { x: r.right - 1, y: r.top + r.height / 2 };
  }, text);
  if (!c) throw new Error('texte introuvable : ' + text);
  await sleep(200);
  await page.mouse.move(c.x - 10, c.y);
  await page.mouse.move(c.x, c.y, { steps: 2 });
  await page.mouse.click(c.x, c.y);
  await sleep(500);
};
const clickRefresh = async (page) => {
  const v = await view(page);
  if (!v.refresh) throw new Error('bouton « Mettre à jour maintenant » introuvable');
  await page.mouse.move(v.refresh.x - 8, v.refresh.y - 8);
  await page.mouse.move(v.refresh.x, v.refresh.y, { steps: 3 });
  await sleep(120);
  await page.mouse.click(v.refresh.x, v.refresh.y);
};
// « Offre » telle qu'une autre page l'écrirait : un mot changé dans la diapositive 1 (le repère reste), ou sa diapositive 1 retirée.
const writeElsewhere = (page, { replace, dropFirst }) => page.evaluate(({ replace, dropFirst }) => {
  const stub = window.__gristStub;
  let html = stub.getRow('Publipostage_Modeles', 8).Contenu;
  if (replace) html = html.split(replace[0]).join(replace[1]);
  if (dropFirst) { const at = html.indexOf('<div class="page-break-marker"'); html = html.slice(html.indexOf('</div>', at) + '</div>'.length); }
  stub.remoteWrite('Publipostage_Modeles', 8, { Contenu: html, DateModif: new Date().toISOString() });
}, { replace: replace || null, dropFirst: !!dropFirst });
const waitStatus = (page, text) => page.waitForFunction(s => document.getElementById('status-msg').textContent.includes(s), text, { timeout: 15000 }).then(() => true, () => false);

for (const [lang, scheme] of [['fr', 'light'], ['en', 'dark']]) {
  const X = TEXTS[lang];
  const tag = lang + ' : ';
  const { page, placed } = await openDocument(lang, scheme);
  check(tag + 'la diapositive 1 de « Offre » est posée en copie liée dans « Devis »', placed && !placed.blank, placed);

  // --- La barre : le bouton, nommé, devant « Détacher ».
  await clickText(page, 'Un texte');
  let v = await view(page);
  check(tag + 'le curseur dans la copie : la barre dit « ' + X.bar + ' » et propose « ' + X.refresh + ' »', v.barShown && v.barText === X.bar && !!v.refresh, v);
  check(tag + 'le bouton a son nom (« ' + X.refresh + ' ») et une info-bulle', v.refreshLabel === X.refresh && !!v.refreshTitle && v.refreshTitle !== v.refreshLabel, v);
  check(tag + 'le bouton est avant « ' + X.detach + ' » et assez grand pour le doigt (≥ 24 px), la barre tient dans la fenêtre', !!v.refresh && !!v.detach && v.refresh.right <= v.detach.left + 1 && v.refresh.width >= 24 && v.refresh.height >= 24 && v.detach.right <= v.bounds.w, v);
  const ratio = await contrastOf(page, '.v2-copy-refresh');
  check(tag + 'l’icône est lisible sur la barre (contraste ≥ 3:1, une icône) : ' + ratio, ratio >= 3, ratio);

  // --- Déjà à jour.
  await clickRefresh(page);
  const said = await waitStatus(page, X.upToDate);
  v = await view(page);
  check(tag + 'rien n’a changé côté « Offre » : un clic dit « ' + X.upToDate + ' »', said && v.blocks.includes('paragraph:Un texte'), v);

  // --- Un changement fait ailleurs : la copie le garde tant qu'on ne clique pas, le clic la met à jour.
  await writeElsewhere(page, { replace: ['Un texte', 'Un texte changé'] });
  await sleep(1500);
  v = await view(page);
  check(tag + '« Offre » réécrite ailleurs, aucune lecture : la copie garde l’ancien texte', v.blocks.includes('paragraph:Un texte') && !v.blocks.includes('paragraph:Un texte changé'), v);
  await clickRefresh(page);
  const pulled = await waitStatus(page, X.pulled);
  v = await view(page);
  check(tag + 'un clic sur « ' + X.refresh + ' » : la copie prend « Un texte changé » sur-le-champ et le coin d’état le dit', pulled && v.blocks.includes('paragraph:Un texte changé') && !v.blocks.includes('paragraph:Un texte'), v);
  check(tag + 'la barre reste sur la copie, le bouton aussi', v.barShown && !!v.refresh, v);

  // --- Le suivi des modifications : pas de mise à jour.
  await writeElsewhere(page, { replace: ['Un texte changé', 'Un texte encore changé'] });
  const tracked = await page.evaluate(() => { Editor.setTrackChanges(true); return Editor.isTrackChangesOn(); });
  if (tracked) {
    await clickText(page, 'Un texte changé');
    await clickRefresh(page);
    const off = await waitStatus(page, X.off);
    v = await view(page);
    check(tag + 'sous le suivi des modifications : « ' + X.off + ' », la copie ne change pas', off && v.blocks.includes('paragraph:Un texte changé'), v);
    await page.evaluate(() => Editor.setTrackChanges(false));
    await sleep(400);
  } else {
    check(tag + 'le suivi des modifications s’allume (cas non joué)', false, { tracked });
  }

  // --- Sa diapositive retirée de « Offre » : la barre le dit, le bouton se retire.
  await writeElsewhere(page, { dropFirst: true });
  await page.evaluate(() => Templates.loadAll());
  await clickText(page, 'Un texte changé');
  await page.evaluate(() => { const editor = EditorCore.getEditor(); editor.view.dispatch(editor.state.tr.setMeta('pp-refresh-bar', true)); });
  await sleep(500);
  v = await view(page);
  check(tag + 'sa diapositive d’origine retirée : la barre dit « ' + X.barGone + ' », le bouton « ' + X.refresh + ' » est retiré et « ' + X.detach + ' » reste', v.barShown && v.barText === X.barGone && !v.refresh && v.refreshHidden === true && !!v.detach, v);
}

await t.finish();
