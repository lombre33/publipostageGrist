// La fenêtre « Condition d'affichage » d'un bloc de texte avec un GROUPE : « Statut = En retard ET (Relance = Deuxième OU Relance = Mise en demeure) ».
// Le vrai widget, le modèle « Courrier de relance » de la galerie ; la condition du paragraphe est posée dans le document (c'est une donnée du modèle), puis la fenêtre s'ouvre
// à la vraie souris : clic sur l'étiquette du bloc, clic sur le bouton « Condition d'affichage » de sa barre flottante.
import { sleep, done, click, idle, shot, rectOf } from './kit.mjs';
import { openTemplate } from './gallery.mjs';
const W = 1280, H = 800;
const { page } = await openTemplate('courrier-relance', { width: W, height: H, row: 4 });
await idle(page);

const GROUP = { mode: 'all', rules: [
  { column: 'Statut', operator: '=', value: 'En retard' },
  { mode: 'any', rules: [{ column: 'Relance', operator: '=', value: 'Première' }, { column: 'Relance', operator: '=', value: 'Deuxième' }] },
] };
const OLD = '{"mode":"all","rules":[{"column":"Relance","operator":"=","value":"Deuxième"}]}';
const swapped = await page.evaluate(([oldJson, newJson]) => {
  const esc = (s) => s.replace(/"/g, '&quot;');
  const ed = EditorCore.getEditor();
  const html = ed.getHTML();
  const hits = html.split(esc(oldJson)).length - 1;
  if (!hits) return 'rien à remplacer';
  Editor.setHTML(html.split(esc(oldJson)).join(esc(newJson)));
  return 'remplacé ' + hits;
}, [OLD, JSON.stringify(GROUP)]);
console.log('condition :', swapped);
await sleep(800);
await idle(page);
await shot(page, 'c0-courrier-groupe');

// Le chip du bloc concerné, puis le bouton de condition de sa barre flottante.
const idx = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .conditional-text-tag')).findIndex((e) => /En retard/.test(e.textContent)));
console.log('index du chip :', idx);
await page.evaluate((i) => document.querySelectorAll('.tiptap .conditional-text-tag')[i].scrollIntoView({ block: 'center' }), idx);
await sleep(300);
const c = await page.evaluate((i) => { const r = document.querySelectorAll('.tiptap .conditional-text-tag')[i].getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, idx);
await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 }); await sleep(80); await page.mouse.click(c.x, c.y); await sleep(700);
await click(page, '.v2-varfmt-toolbar button[data-action="var-condition"]', 900, false);
const overlays = await page.evaluate(() => { const m = document.getElementById('var-condition-modal'); return m.id + ' > ' + Array.from(m.children).map((e) => e.tagName + '.' + e.className).join(' | '); });
console.log('fenêtres :', overlays);
await page.mouse.move(70, 700, { steps: 4 }); await sleep(500);
await shot(page, 'c1-condition-plein');
const box = await page.evaluate(() => { const r = document.getElementById('var-condition-modal').firstElementChild.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
console.log('boîte', JSON.stringify(box));
await shot(page, 'c2-condition-groupe', { clip: { x: Math.max(0, box.l - 40), y: Math.max(0, box.t - 40), width: box.w + 80, height: box.h + 80 } });
await done();
