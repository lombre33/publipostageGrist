// Les deux menus d'export : « Type d'export » (survol du bouton du document) et « Exporter » (survol du bouton bleu : une ligne, toutes les lignes en ZIP, un seul PDF, assemblage).
// Le vrai widget, le modèle « Facture » de la galerie en Lecture, la vraie souris. Le menu reste ouvert tant que la souris est dessus : la capture se fait pendant le survol.
import { sleep, done, click, idle, shot, hoverMenuRow, rectOf } from './kit.mjs';
import { openTemplate } from './gallery.mjs';
const W = 1280, H = 800;
const { page } = await openTemplate('facture', { width: W, height: H, row: 1 });
await idle(page);
await click(page, '#btn-mode-read', 1800, false);
await idle(page, 70, 700);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });
await shot(page, 'e0-facture-lecture');

const crop = async (name, flySel, btnSel) => {
  const r = await page.evaluate(([f, b]) => {
    const fl = document.querySelector(f).getBoundingClientRect(), bt = document.querySelector(b).getBoundingClientRect();
    return { l: Math.min(fl.left, bt.left), t: 0, r: Math.max(fl.right, bt.right), b: fl.bottom };
  }, [flySel, btnSel]);
  console.log(name, JSON.stringify(r));
  await shot(page, name, { clip: { x: Math.max(0, r.l - 150), y: 0, width: Math.min(W, r.r + 150) - Math.max(0, r.l - 150), height: r.b + 24 } });
};

// 1. « Type d'export » : au survol du bouton du document.
await hoverMenuRow(page, '#v2-btn-quality', null, 700);
await shot(page, 'e1-type-export-plein');
await crop('e2-type-export', '#v2-quality-flyout', '#v2-btn-quality');
await page.mouse.move(70, 700, { steps: 6 }); await sleep(500);

// 2. « Exporter » : au survol du bouton bleu.
await hoverMenuRow(page, '#btn-export-pdf', null, 700);
await shot(page, 'e3-exporter-plein');
await crop('e4-exporter', '#v2-export-pdf-flyout', '#btn-export-pdf');
await done();
