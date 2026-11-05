// Rechercher / Remplacer avec une expression régulière : la barre (champ, compteur, Aa, mot entier, .*, remplacer) et les occurrences surlignées dans le document.
// Le vrai widget, le modèle « Contrat de prestation de services » de la galerie en Édition, la vraie souris et le vrai clavier.
import { sleep, done, click, idle, shot, rectOf } from './kit.mjs';
import { openTemplate } from './gallery.mjs';
const W = 880, H = 760;
const { page } = await openTemplate('contrat-prestation-services', { width: W, height: H, row: 1 });
await idle(page);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });
await click(page, '#v2-btn-find', 700, false);
await page.waitForSelector('#pp-find-bar', { state: 'visible', timeout: 10000 });
const inputSel = '#pp-find-bar input[type="text"], #pp-find-bar input:not([type]), #pp-find-bar input[type="search"]';
const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-find-bar input')).map((i) => i.id + '|' + i.type + '|' + (i.placeholder || '')));
console.log('champs :', inputs.join(' ; '));
// Les options : expression régulière, puis la saisie.
await click(page, '#pp-find-regex', 300, false);
const field = await page.evaluate(() => { const i = document.querySelector('#pp-find-bar input'); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.move(field.x - 20, field.y, { steps: 3 }); await page.mouse.click(field.x, field.y);
await page.keyboard.type('(Prestataire|Client)', { delay: 60 });
await sleep(700);
await click(page, '#pp-find-toggle-replace', 500, false);
const repl = await rectOf(page, '#pp-find-replacement');
await page.mouse.move(repl.x - 20, repl.y, { steps: 3 }); await page.mouse.click(repl.x, repl.y);
await page.keyboard.type('$1 (Partie)', { delay: 60 });
await sleep(500);
await page.mouse.move(70, 700, { steps: 5 }); await sleep(500);
await shot(page, 'r0-recherche-plein');
const bar = await rectOf(page, '#pp-find-bar');
console.log('barre', JSON.stringify(bar));
await shot(page, 'r1-recherche', { clip: { x: 0, y: Math.max(0, bar.t - 8), width: W, height: 470 } });
await done();
