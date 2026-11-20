#!/usr/bin/env node
// LES PAGES D'UN DOCUMENT IMPORTÉES « GARDER LIÉES » DANS UNE PRÉSENTATION NE FONT PAS DIRE « MODIFIÉ AILLEURS » AU DOCUMENT OUVERT (20/11, un document qui contient une diapositive liée : « Ce document a été
// modifié ailleurs pendant votre édition » alors qu'une autre personne était sur le Grist). L'import lié d'une page de document (js/page-copies.js:anchorPage) écrit dans la ligne du document le repère de la
// page (un élément `pp-slide-link`, rien d'autre) ; le document ouvert ailleurs voyait sa ligne changer : le bandeau, « Recharger la dernière version » qui perd ce qu'on vient de taper, ou « Enregistrer »
// qui efface le repère de la source (le lien de la présentation ne retrouve plus sa page). `SlideLinks.adopt` ne prenait ce repère que pour une présentation : il le prend aussi pour un document.
// L'app hébergée par GFS (extension « diapositives »), 700x400, vrai clavier. « Doc » (un document de trois pages) est à l'écran :
//  - sans frappe ici : le repère de la page 2 écrit ailleurs est adopté : aucun bandeau, la page 2 le porte ;
//  - avec une frappe dans la page 3 : aucun bandeau, la frappe gardée, le repère sur la page 2 ; l'enregistrement qui suit écrit le texte tapé ET le repère ;
//  - les trois repères d'un coup : aucun bandeau ;
//  - un mot changé ailleurs (pas le repère seul) pendant une frappe ici : le bandeau reste, comme toujours ;
//  - un repère qui arrive avec une page de plus (le nombre de pages change) : le bandeau reste.
// Lancé par run-headless.mjs (groupe Node « pageAdopt », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-adopt.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-page-adopt', port: Number(process.env.PAGE_ADOPT_PORT || 9153) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Doc', '<p>Page un</p>${BR}<p>Page deux</p>${BR}<p>Page trois</p>', false, 'document');
  stub.state.nextRowId.Publipostage_Modeles = 8;
`;
const ID2 = 'k3m8x2abq';

async function openDoc() {
  const A = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const { page } = A;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && !!EditorCore.getEditor() && /Page trois/.test(EditorCore.getEditor().state.doc.textContent), null, { timeout: 15000 });
  await sleep(1000);
  return page;
}
const typeAfter = async (page, text, typed) => {
  await page.evaluate((whole) => {
    const editor = EditorCore.getEditor();
    let at = -1;
    editor.state.doc.descendants((node, pos) => { if (at < 0 && node.isTextblock && node.textContent === whole) at = pos + node.nodeSize - 1; });
    editor.chain().focus().setTextSelection(at).run();
  }, text);
  await sleep(200);
  await page.keyboard.type(typed, { delay: 30 });
  await sleep(300);
};
// La ligne de « Doc » telle qu'une autre page l'écrirait : le repère (numéro de page) à la fin de la page `n`, ou un mot changé, ou une page de plus.
const writeElsewhere = (page, { tags, replace, extraPage }) => page.evaluate(({ id, slides, replace, extraPage }) => {
  const stub = window.__gristStub;
  const editor = EditorCore.getEditor();
  let html = stub.getRow('Publipostage_Modeles', 7).Contenu;
  if (slides.length) {
    const parts = html.split('<div class="page-break-marker"');
    slides.forEach((slide) => {
      const node = editor.schema.nodes.slideLink.create(Object.assign(Object.fromEntries(SlideLinks.ATTRS.map(name => [name, null])), { slideId: slide === 2 ? id : id + slide }));
      parts[slide - 1] += Editor.getHTML(editor.schema.topNodeType.create(null, [node]));
    });
    html = parts.join('<div class="page-break-marker"');
  }
  if (replace) html = html.split(replace[0]).join(replace[1]);
  if (extraPage) html += '<div class="page-break-marker" contenteditable="false">Saut de page</div><p>Page quatre</p>';
  stub.remoteWrite('Publipostage_Modeles', 7, { Contenu: html, DateModif: new Date().toISOString() });
  return html;
}, { id: ID2, slides: tags || [], replace: replace || null, extraPage: !!extraPage });
const view = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const pages = SlideLinks.kit().slidesOf(editor.state.doc);
  return {
    texts: pages.map(s => s.nodes.map(e => e.node.textContent).join('')),
    ids: pages.map(s => (s.tag ? s.tag.node.attrs.slideId : null)),
    banner: document.getElementById('autosave-conflict-banner').style.display !== 'none',
    status: document.getElementById('status-msg').textContent,
    stored: window.__gristStub.getRow('Publipostage_Modeles', 7).Contenu,
  };
});
// Attend que la lecture de l'enregistrement automatique ait vu le changement : le bandeau, ou la date adoptée.
const settle = async (page) => {
  await page.waitForFunction(() => document.getElementById('autosave-conflict-banner').style.display !== 'none' || /Enregistré à/.test(document.getElementById('status-msg').textContent), null, { timeout: 25000 }).catch(() => {});
  await sleep(1500);
};

// --- Sans frappe ici : le repère est adopté.
{
  const page = await openDoc();
  await writeElsewhere(page, { tags: [2] });
  await page.waitForFunction(() => SlideLinks.kit().slidesOf(EditorCore.getEditor().state.doc).some(s => s.tag), null, { timeout: 40000 }).catch(() => {});
  await sleep(800);
  const v = await view(page);
  check('rien de tapé ici : le repère de la page 2 écrit ailleurs est adopté, sans bandeau (repères : ' + JSON.stringify(v.ids) + ')', !v.banner && v.ids[1] === ID2 && !v.ids[0] && !v.ids[2], v);
}

// --- Une frappe dans la page 3 : le repère arrive sur la 2, la frappe est gardée, l'enregistrement écrit les deux.
{
  const page = await openDoc();
  await typeAfter(page, 'Page trois', ' ici');
  await writeElsewhere(page, { tags: [2] });
  await settle(page);
  const v = await view(page);
  check('une frappe dans la page 3 pendant que le repère de la 2 est écrit ailleurs : aucun bandeau « modifié ailleurs »', !v.banner, v);
  check('la frappe est gardée, la page 2 porte le repère', v.texts[2] === 'Page trois ici' && v.ids[1] === ID2 && !v.ids[0] && !v.ids[2], v);
  await page.evaluate(() => { document.getElementById('btn-save') && document.getElementById('btn-save').click(); });
  await page.waitForFunction(() => /Page trois ici/.test(window.__gristStub.getRow('Publipostage_Modeles', 7).Contenu), null, { timeout: 15000 }).catch(() => {});
  const saved = await view(page);
  check('l’enregistrement qui suit écrit le texte tapé ET le repère (le lien de la présentation retrouve sa page)', /Page trois ici/.test(saved.stored) && saved.stored.includes('data-slide-id="' + ID2 + '"'), saved.stored.slice(0, 400));
}

// --- Les trois repères d'un coup, pendant une frappe dans la 2.
{
  const page = await openDoc();
  await typeAfter(page, 'Page deux', ' ici');
  await writeElsewhere(page, { tags: [1, 2, 3] });
  await settle(page);
  const v = await view(page);
  check('les trois repères arrivent d’un coup pendant une frappe dans la 2 : aucun bandeau, la frappe gardée, les trois pages numérotées', !v.banner && v.texts[1] === 'Page deux ici' && v.ids.every(Boolean) && new Set(v.ids).size === 3, v);
}

// --- Un autre changement (un mot de la page 2) : le bandeau reste.
{
  const page = await openDoc();
  await typeAfter(page, 'Page trois', ' ici');
  await writeElsewhere(page, { replace: ['Page deux', 'Page autre'] });
  await settle(page);
  const v = await view(page);
  check('un mot changé ailleurs dans la page 2, pendant une frappe ici : le bandeau « modifié ailleurs » s’ouvre toujours', v.banner, v);
}

// --- Un repère qui arrive avec une page de plus : le bandeau reste.
{
  const page = await openDoc();
  await typeAfter(page, 'Page trois', ' ici');
  await writeElsewhere(page, { tags: [2], extraPage: true });
  await settle(page);
  const v = await view(page);
  check('une page de plus écrite ailleurs avec le repère : le bandeau « modifié ailleurs » s’ouvre toujours', v.banner, v);
}

await t.finish();
