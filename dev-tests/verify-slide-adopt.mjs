#!/usr/bin/env node
// UNE DIAPOSITIVE LIÉE DEPUIS UN DOCUMENT NE FAIT PAS DIRE « MODIFIÉ AILLEURS » À LA PRÉSENTATION OUVERTE (20/11, « en ayant mis "gardé lié", j'ai voulu changer un mot côté slides+, et au bout de quelques secondes
// ce message d'erreur : Ce document a été modifié ailleurs pendant votre édition. C'est assez grave. Les diapos liées en lecture seule ne doivent pas venir impacter le document source sur slides+ »).
// « Garder liée » écrit dans la ligne de la source le numéro de la diapositive liée (son repère, js/slide-links.js:anchorSource) ; la présentation ouverte ailleurs (Slides+) voit alors sa ligne changer pendant
// qu'on y tape : `SlideLinks.adopt` prend ce repère sans bandeau, mais refusait quand la personne avait tapé dans CETTE diapositive (sa version n'était plus celle d'avant) : le bandeau, et « Recharger la dernière
// version » qui perd ce qu'elle venait de taper. Désormais, quand l'autre page n'a posé que le repère, il se pose sur la diapositive d'ici, tapée ou non, et rien ne se demande.
// L'app hébergée par GFS (extension « diapositives »), 700x400, vrai clavier. « Source » (3 diapositives) est à l'écran, sans repère :
//  - sans frappe ici : la ligne réécrite avec le repère de la diapositive 2 est adoptée : aucun bandeau, la diapositive 2 porte le repère ;
//  - avec une frappe dans la diapositive 2 (« Deux texte ici », pas encore enregistrée) : aucun bandeau, la frappe est gardée, la diapositive 2 porte le repère, aucune fenêtre « Demander » ; l'enregistrement
//    qui suit écrit les deux (le texte tapé et le repère) ;
//  - une frappe dans la diapositive 3 pendant que le repère arrive sur la 2 : même résultat ;
//  - une AUTRE modification de l'autre page (un mot changé dans la diapositive 2, pas le repère seul) pendant une frappe ici : le bandeau reste, comme toujours.
// Lancé par run-headless.mjs (groupe Node « slideAdopt », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-adopt.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-adopt', port: Number(process.env.SLIDE_ADOPT_PORT || 9146) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Source', '<p>Un texte</p>${BR}<p>Deux texte</p>${BR}<p>Trois texte</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 8;
`;
const ID2 = 'k3m8x2abq';

async function openSource() {
  const A = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const { page } = A;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === '7' && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === 3;
  }, null, { timeout: 15000 });
  await sleep(1000);
  return page;
}
// Le curseur au bout du texte `text` (un bloc de l'éditeur), puis `typed` au clavier.
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
// La ligne de « Source » telle qu'une autre page l'écrirait : son repère (numéro de diapositive) à la fin de la diapositive `n`, ou un mot changé.
const writeElsewhere = (page, { tag, replace }) => page.evaluate(({ id, slide, replace }) => {
  const stub = window.__gristStub;
  const editor = EditorCore.getEditor();
  let html = stub.getRow('Publipostage_Modeles', 7).Contenu;
  if (slide) {
    const node = editor.schema.nodes.slideLink.create(Object.assign(Object.fromEntries(SlideLinks.ATTRS.map(name => [name, null])), { slideId: id }));
    const tagHtml = Editor.getHTML(editor.schema.topNodeType.create(null, [node]));
    const parts = html.split('<div class="page-break-marker"');
    parts[slide - 1] += tagHtml;
    html = parts.join('<div class="page-break-marker"');
  }
  if (replace) html = html.split(replace[0]).join(replace[1]);
  stub.remoteWrite('Publipostage_Modeles', 7, { Contenu: html, DateModif: new Date().toISOString() });
  return html;
}, { id: ID2, slide: tag, replace: replace || null });
const view = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const slides = SlideStrip.slidesOf(editor.state.doc);
  const ids = slides.map((s) => { const tag = s.nodes.find(e => e.node.type.name === 'slideLink'); return tag ? tag.node.attrs.slideId : null; });
  const ask = document.getElementById('pp-slide-link-ask');
  return {
    texts: slides.map(s => s.nodes.map(e => e.node.textContent).join('')), ids,
    banner: document.getElementById('autosave-conflict-banner').style.display !== 'none',
    ask: !!ask && ask.style.display !== 'none',
    status: document.getElementById('status-msg').textContent,
    stored: window.__gristStub.getRow('Publipostage_Modeles', 7).Contenu,
    saves: window.__gristStub.countSaves('Publipostage_Modeles'),
  };
});
// Attend que la lecture de l'enregistrement automatique ait vu le changement : le bandeau, ou la date adoptée.
const settle = async (page) => {
  await page.waitForFunction(() => document.getElementById('autosave-conflict-banner').style.display !== 'none' || /Enregistré à/.test(document.getElementById('status-msg').textContent), null, { timeout: 25000 }).catch(() => {});
  await sleep(1500);
};

// --- Sans frappe ici : le repère est adopté.
{
  const page = await openSource();
  await writeElsewhere(page, { tag: 2 });
  await page.waitForFunction(() => SlideStrip.slidesOf(EditorCore.getEditor().state.doc).some(s => s.nodes.some(e => e.node.type.name === 'slideLink')), null, { timeout: 30000 }).catch(() => {});
  await sleep(800);
  const v = await view(page);
  check('rien de tapé ici : le repère de la diapositive 2 écrit ailleurs est adopté, sans bandeau (repères : ' + JSON.stringify(v.ids) + ')', !v.banner && v.ids[1] === ID2 && !v.ids[0] && !v.ids[2], v);
}

// --- Une frappe dans la diapositive 2 : le repère arrive sur elle, la frappe est gardée, aucun bandeau.
{
  const page = await openSource();
  await typeAfter(page, 'Deux texte', ' ici');
  await writeElsewhere(page, { tag: 2 });
  await settle(page);
  const v = await view(page);
  check('une frappe dans la diapositive 2 (« ' + v.texts[1] + ' ») pendant que son repère est écrit ailleurs : aucun bandeau « modifié ailleurs »', !v.banner, v);
  check('la frappe est gardée, la diapositive 2 porte le repère, aucune fenêtre « Demander »', v.texts[1] === 'Deux texte ici' && v.ids[1] === ID2 && !v.ask, v);
  await page.evaluate(() => { document.getElementById('btn-save') && document.getElementById('btn-save').click(); });
  await page.waitForFunction(() => /Deux texte ici/.test(window.__gristStub.getRow('Publipostage_Modeles', 7).Contenu), null, { timeout: 15000 }).catch(() => {});
  const saved = await view(page);
  check('l’enregistrement qui suit écrit le texte tapé ET le repère', /Deux texte ici/.test(saved.stored) && saved.stored.includes('data-slide-id="' + ID2 + '"'), saved.stored.slice(0, 400));
}

// --- Une frappe dans la diapositive 3 : même résultat pour le repère de la 2.
{
  const page = await openSource();
  await typeAfter(page, 'Trois texte', ' ici');
  await writeElsewhere(page, { tag: 2 });
  await settle(page);
  const v = await view(page);
  check('une frappe dans la diapositive 3 pendant que le repère arrive sur la 2 : aucun bandeau, la frappe gardée, le repère sur la 2', !v.banner && v.texts[2] === 'Trois texte ici' && v.ids[1] === ID2 && !v.ids[0] && !v.ids[2], v);
}

// --- Un autre changement de l'autre page (un mot de la diapositive 2) : le bandeau reste, comme toujours.
{
  const page = await openSource();
  await typeAfter(page, 'Trois texte', ' ici');
  await writeElsewhere(page, { replace: ['Deux texte', 'Deux autre texte'] });
  await settle(page);
  const v = await view(page);
  check('un mot changé ailleurs dans la diapositive 2, pendant une frappe ici : le bandeau « modifié ailleurs » s’ouvre toujours', v.banner, v);
}

await t.finish();
