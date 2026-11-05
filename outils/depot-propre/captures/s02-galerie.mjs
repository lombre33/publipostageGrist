// La fenêtre « Créer à partir d’un modèle… » (galerie de 22 modèles), ouverte par le vrai parcours : menu « + », ligne « Créer à partir d’un modèle… ».
// Deux images : la fenêtre entière (g-galerie-top, avec ses puces de catégories, dont « Présentation » qui renvoie vers GFS) et la grille seule, recadrée sous la rangée de puces (g-galerie-grille).
import { openWidget, shot, sleep, done, click, clickMenuRow, rectOf } from './kit.mjs';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 800);
const { page } = await openWidget({ width: W, height: H });
await clickMenuRow(page, '#btn-new', '#v2-btn-new-from-template', 800);
await page.waitForFunction(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, null, { timeout: 10000 });
await page.mouse.move(W - 40, H - 30, { steps: 6 });
await sleep(1200);
await shot(page, 'g-galerie-top');
// Quelques infos sur la fenêtre
const geo = await page.evaluate(() => {
  const m = document.getElementById('template-gallery-modal');
  const box = m.querySelector('.var-modal-box, .pp-modal-box, [class*=box]');
  const r = box.getBoundingClientRect();
  const grid = document.getElementById('tpl-gallery-grid');
  const first = grid.querySelector('.tpl-gallery-card').getBoundingClientRect();
  const chips = Array.from(m.querySelectorAll('button, [role="tab"], [role="radio"], .tpl-gallery-chip')).filter((b) => /^(Tous|Vente|Administratif|Événement|Impression|Stock|Métier|Présentation)$/.test((b.textContent || '').trim())).map((b) => b.getBoundingClientRect().bottom);
  return { cards: grid.querySelectorAll('.tpl-gallery-card').length, l: r.left, t: r.top, w: r.width, h: r.height, firstTop: first.top, chipsBottom: chips.length ? Math.max(...chips) : null };
});
console.log(JSON.stringify(geo));
// La grille seule : de 10 px au-dessus de la première rangée de cartes au bas de la fenêtre, avec 20 px de fond de chaque côté.
const y0 = Math.floor(geo.firstTop - 10), y1 = Math.min(H, Math.ceil(geo.t + geo.h + 20));
await shot(page, 'g-galerie-grille', { clip: { x: Math.max(0, geo.l - 20), y: y0, width: Math.min(W - Math.max(0, geo.l - 20), geo.w + 40), height: y1 - y0 } });
await done();
