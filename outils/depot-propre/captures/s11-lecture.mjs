// Le menu « Mode lecture » (Lecture simple / Lecture épurée, au survol du bouton) et la Lecture épurée : le document seul dans tout le panneau.
// Le vrai widget, le modèle « Contrat de prestation de services » de la galerie ; la vraie souris.
import { sleep, done, click, clickMenuRow, hoverMenuRow, idle, shot, rectOf } from './kit.mjs';
import { openTemplate } from './gallery.mjs';
const W = 1280, H = 800;
const { page } = await openTemplate('contrat-prestation-services', { width: W, height: H, row: 1 });
await idle(page);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });

// 1. Le menu au survol du bouton « Mode lecture ».
await hoverMenuRow(page, '#btn-mode-read', null, 700);
await shot(page, 'm0-mode-lecture-plein');
const fl = await page.evaluate(() => { const f = document.getElementById('v2-read-flyout').getBoundingClientRect(), b = document.getElementById('btn-mode-read').getBoundingClientRect(); return { l: Math.min(f.left, b.left), r: Math.max(f.right, b.right), b: f.bottom }; });
console.log('menu', JSON.stringify(fl));
await shot(page, 'm1-mode-lecture', { clip: { x: Math.max(0, fl.l - 190), y: 0, width: fl.r - fl.l + 380, height: fl.b + 150 } });

// 2. « Lecture épurée » cochée, puis le bouton : le document seul.
await clickMenuRow(page, '#btn-mode-read', '#v2-btn-clean-reading', 600);
await page.mouse.move(70, 700, { steps: 5 }); await sleep(500);
await click(page, '#btn-mode-read', 1800, false);
await idle(page, 70, 700);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });
await shot(page, 'm2-lecture-epuree');
await done();
