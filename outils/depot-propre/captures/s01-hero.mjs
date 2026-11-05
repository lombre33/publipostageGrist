// Les images du 1er message : l'Édition, la Lecture et les exports d'un même document de la galerie, avec une ligne d'exemple.
import { openTemplate } from './gallery.mjs';
import { shot, sleep, done, click, hoverMenuRow, rectOf } from './kit.mjs';
const W = 1280, H = 800;
const ID = process.argv[2] || 'contrat-prestation-services';
const { page } = await openTemplate(ID, { width: W, height: H });
const idle = async () => { await page.evaluate(() => { const s = document.getElementById('status-msg'); s.textContent = I18n.t('status.ready'); s.className = ''; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await page.mouse.move(70, 620, { steps: 3 }); await sleep(400); };
await idle();
const EDIT_TOP = Number(process.env.EDIT_TOP || 0), READ_TOP = Number(process.env.READ_TOP || 0);
await page.evaluate((t) => { document.getElementById('editor-container').scrollTop = t; }, EDIT_TOP);
await sleep(400);
await shot(page, `h1-edition-${ID}`);
await click(page, '#btn-mode-read', 1500);
await page.evaluate((t) => { document.getElementById('reader-container').scrollTop = t; }, READ_TOP);
await page.mouse.move(70, 620, { steps: 4 }); await sleep(500);
await shot(page, `h2-lecture-${ID}`);
await done();
