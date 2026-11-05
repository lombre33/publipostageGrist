// « Assemblage avant impression… » : des badges A6 posés sur une feuille A4, traits de coupe, marge autour de chaque page ; l'aperçu de la fenêtre montre ce que le PDF portera.
// Le vrai widget, le modèle « Badge d'événement » de la galerie. Le choix se fait dans le menu Exporter (ligne « Assemblage avant impression »), puis le bouton Exporter ouvre la fenêtre.
import { sleep, done, click, clickMenuRow, idle, shot, rectOf } from './kit.mjs';
import { openTemplate } from './gallery.mjs';
const W = 1280, H = 800;
const { page } = await openTemplate('badge-evenement', { width: W, height: H, row: 1 });
await idle(page);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });
await shot(page, 'a0-badge');
await clickMenuRow(page, '#btn-export-pdf', '#v2-export-lines-sheets', 600);
await page.mouse.move(70, 700, { steps: 5 }); await sleep(400);
await click(page, '#btn-export-pdf', 1200, false);
await page.waitForSelector('#pp-sheets-modal .pp-sheets-box', { state: 'visible', timeout: 15000 });
await sleep(800);
// Traits de coupe « Avec », marge de 5 mm : l'aperçu les montre.
const withMarks = await page.evaluate(() => { const i = document.querySelector('#pp-sheets-modal input[type="radio"][value="on"]'); const l = i.closest('label') || i; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.move(withMarks.x - 20, withMarks.y, { steps: 3 }); await page.mouse.click(withMarks.x, withMarks.y); await sleep(400);
const mg = await rectOf(page, '#pp-sheets-margin');
await page.mouse.move(mg.x - 20, mg.y, { steps: 3 }); await page.mouse.click(mg.x, mg.y); await page.keyboard.press('Control+a'); await page.keyboard.type('5'); await sleep(500);
// Pas d'Entrée : elle valide la fenêtre (et lance l'export). Un clic sur le titre quitte le champ, qui dit alors la marge appliquée.
const ttl = await rectOf(page, '#pp-sheets-title'); await page.mouse.move(ttl.x + 200, ttl.y, { steps: 3 }); await page.mouse.click(ttl.x + 200, ttl.y); await sleep(500);
await page.mouse.move(8, H - 8, { steps: 4 }); await sleep(400);
const box = await rectOf(page, '#pp-sheets-modal .pp-sheets-box');
console.log('boîte', JSON.stringify(box));
await shot(page, 'a1-assemblage-plein');
await shot(page, 'a2-assemblage', { clip: { x: Math.max(0, box.l - 40), y: Math.max(0, box.t - 40), width: box.w + 80, height: box.h + 80 } });
await done();
