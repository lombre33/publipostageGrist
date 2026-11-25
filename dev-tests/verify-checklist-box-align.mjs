#!/usr/bin/env node
// Retour d'interface du 19/11 : « les cases ne sont pas alignées avec le texte » (liste à cases), à la taille du panneau Grist (700x400), vraie souris pour le clic.
// Ce qui était faux : la case native garde, quel que soit le navigateur, ses 3 px de marge en haut et en bas ; avec les .2em de l'étiquette elle tombait 3,3 px sous le milieu de la ligne (styles « accent », le défaut),
// et chaque élément d'une ligne faisait 26,5 px au lieu des 19,9 px de la ligne (le PDF, lui, les pose à la hauteur de la ligne). Le style « classic », dessiné sans marge, était à 0,3 px du milieu mais faisait 23,5 px.
// Ce que la feuille fait maintenant : l'étiquette est une boîte de la hauteur de la case, posée sous le haut de la ligne de la moitié de ce que la ligne a de plus que la case, pour les trois styles, sans rien devoir à la ligne
// de base que le navigateur donne à une case native (la case est un bloc, ses marges de haut et de bas sont nulles ; celles de gauche et de droite sont écrites : 4 px et 3 px).
//  1. ÉDITEUR, les trois styles, case cochée ou non, texte d'une ligne et texte de plusieurs lignes, sous-case : le milieu de la case est au milieu de la PREMIÈRE ligne (0,5 px au plus) ; un élément d'une ligne n'est pas plus
//     haut que sa ligne ; la case est à 4 px (accent) ou 0 (classic) du bord, le texte à 28 ou 21 px : rien n'a bougé horizontalement ;
//  2. LECTURE (même feuille de style, HTML résolu par ReaderMode.render) : les mêmes mesures ;
//  3. la VRAIE SOURIS : un clic au milieu de la case, puis dans sa marge de gauche (celle de l'étiquette), coche et décoche l'élément, aux trois styles ; la case reste de 15 px ;
//  4. LE PDF (relu par pdf.js) : l'écart entre deux éléments d'une ligne est celui de l'éditeur, et le milieu de la case est à la même distance de la ligne de base du premier mot (0,4 pt au plus).
// Mesuré dans Chromium, le seul moteur de ces essais ; la mise en page n'emploie rien de propre à un moteur (pas de ligne de base de case, pas de marge par défaut) : à revoir sous Firefox si une capture dit le contraire.
// Lancé par run-headless.mjs (groupe Node "checklistBoxAlign", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-checklist-box-align.mjs
import { start } from './gfs-page.mjs';

const t = await start({ name: 'verify-checklist-box-align', port: Number(process.env.CHECKLIST_BOX_ALIGN_PORT || 9735) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const STYLES = [['accentStrike', ''], ['accentPlain', 'accentPlain'], ['classic', 'classic']];
const SHORT = 'Payment and money process';
const LONG = 'Payment and money process (Site Controle K) why 2 year ? several paiement ? '.repeat(4).trim();
// Le HTML d'une liste de chaque style : un élément d'une ligne non coché, un d'une ligne coché, un de plusieurs lignes avec une sous-case.
const LIST = (style, withLabel) => {
  const item = (checked, text, nested = '') => `<li data-type="taskItem" data-checked="${checked}">${withLabel ? `<label><input type="checkbox"${checked ? ' checked' : ''}><span></span></label><div>` : ''}<p>${text}</p>${nested}${withLabel ? '</div>' : ''}</li>`;
  const list = items => `<ul data-type="taskList"${style ? ` data-tasklist-style="${style}"` : ''}>${items}</ul>`;
  return list(item(false, SHORT) + item(true, SHORT) + item(false, LONG, list(item(false, 'loan and sell ?'))));
};

// Ce que la page sait mesurer d'une feuille (`root` : `.tiptap` ou `.reader-content`) : pour chaque élément de liste à cases, l'écart du milieu de sa case au milieu de sa première ligne, sa hauteur, la place de la case et du texte.
function installProbe() {
  window.__box = {
    measure(root) {
      const zoom = EditorCore.layoutZoom(root);
      return Array.from(root.querySelectorAll('ul[data-type="taskList"] li')).map(li => {
        const input = li.querySelector(':scope > label > input');
        const p = li.querySelector(':scope > div > p');
        const l = li.getBoundingClientRect(), i = input.getBoundingClientRect(), q = p.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(p).lineHeight);
        return {
          style: li.parentElement.getAttribute('data-tasklist-style') || 'accentStrike', checked: li.getAttribute('data-checked'),
          lines: Math.round(q.height / zoom / line),
          off: +(((i.top + i.height / 2) - (q.top + line * zoom / 2)) / zoom).toFixed(2),
          liHeight: +(l.height / zoom).toFixed(2), line: +line.toFixed(2),
          boxSide: +(i.width / zoom).toFixed(2), boxLeft: +((i.left - l.left) / zoom).toFixed(2), textLeft: +((q.left - l.left) / zoom).toFixed(2),
        };
      });
    },
  };
}

function judge(where, rows) {
  for (const [style] of STYLES) {
    const mine = rows.filter(r => r.style === style);
    const worst = Math.max(...mine.map(r => Math.abs(r.off)));
    check(`${where} · ${style} : le milieu de la case est au milieu de la première ligne (${worst.toFixed(2)} px d'écart au plus, 0,5 px permis ; ${mine.length} éléments : deux d'une ligne, un de plusieurs, une sous-case)`, mine.length === 4 && worst <= 0.5, mine.map(r => r.off));
    const single = mine.filter(r => r.lines === 1);
    const tallest = Math.max(...single.map(r => r.liHeight - r.line));
    check(`${where} · ${style} : un élément d'une ligne est aussi haut que sa ligne (${tallest.toFixed(2)} px de plus au plus, 0,3 px permis)`, tallest <= 0.3, single.map(r => [r.liHeight, r.line]));
    const accent = style !== 'classic';
    const wantBox = accent ? 4 : 0, wantText = accent ? 28 : 21;
    const moved = Math.max(...mine.map(r => Math.max(Math.abs(r.boxLeft - wantBox), Math.abs(r.textLeft - wantText), Math.abs(r.boxSide - 15))));
    check(`${where} · ${style} : la case de 15 px est à ${wantBox} px du bord et le texte à ${wantText} px (rien n'a bougé : ${moved.toFixed(2)} px d'écart au plus, 0,3 px permis)`, moved <= 0.3, mine.map(r => [r.boxLeft, r.textLeft, r.boxSide]));
  }
}

// 1. Éditeur.
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  await app.evaluate(installProbe);
  const rows = [];
  for (const [style, attr] of STYLES) {
    await app.evaluate(html => { EditorCore.getEditor().commands.setContent(html); }, LIST(attr, false));
    await sleep(300);
    rows.push(...await app.evaluate(() => window.__box.measure(document.querySelector('#editor-container .tiptap'))));
  }
  judge('éditeur', rows);

  // 3. La vraie souris : au milieu de la case, puis dans sa marge de gauche.
  for (const [style, attr] of STYLES) {
    await app.evaluate(html => { EditorCore.getEditor().commands.setContent(html); }, LIST(attr, false));
    await sleep(300);
    const spot = which => app.evaluate(which => {
      const li = document.querySelector('#editor-container .tiptap ul[data-type="taskList"] > li');
      const r = li.querySelector('input').getBoundingClientRect();
      return { x: which === 'box' ? r.left + r.width / 2 : r.left - 0.5 - (parseFloat(getComputedStyle(li.querySelector('input')).marginLeft) > 1 ? 1 : 0), y: r.top + r.height / 2, side: r.width };
    }, which);
    const checked = () => app.evaluate(() => document.querySelector('#editor-container .tiptap ul[data-type="taskList"] > li').getAttribute('data-checked'));
    const click = async where => { const p = await spot(where); await app.mouse.move(p.x - 10, p.y); await app.mouse.move(p.x, p.y, { steps: 3 }); await app.mouse.click(p.x, p.y); await sleep(250); return p; };
    const before = await checked();
    const p1 = await click('box');
    const afterBox = await checked();
    await click('box');
    const back = await checked();
    check(`vraie souris · ${style} : un clic au milieu de la case coche l'élément, un second le décoche`, before === 'false' && afterBox === 'true' && back === 'false', { before, afterBox, back });
    if (style !== 'classic') {
      await click('margin');
      const afterMargin = await checked();
      check(`vraie souris · ${style} : un clic dans la marge de gauche de la case (celle de l'étiquette) la coche aussi`, afterMargin === 'true', afterMargin);
    }
    const side = (p1.side / (await app.evaluate(() => EditorCore.layoutZoom(document.querySelector('#editor-container .tiptap'))))).toFixed(2);
    check(`vraie souris · ${style} : la case fait toujours 15 px de côté (${side} px)`, Math.abs(Number(side) - 15) <= 0.1, side);
  }
  await app.close();
}

// 2. Lecture : le HTML d'une liste, tel que l'éditeur l'écrit (étiquette, case et petit rien), passé par ReaderMode.render.
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  await app.evaluate(installProbe);
  const rows = [];
  for (const [style, attr] of STYLES) {
    await app.evaluate(async html => {
      const hf = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
      document.getElementById('editor-container').style.display = 'block';
      document.getElementById('reader-container').style.display = 'block';
      await ReaderMode.render(html, 'Table1', {}, hf);
    }, LIST(attr, true));
    await sleep(250);
    rows.push(...await app.evaluate(() => window.__box.measure(document.querySelector('#reader-container .reader-content'))));
  }
  judge('Lecture', rows);
  await app.close();
}

// 4. Le PDF, relu par pdf.js : l'écart entre deux éléments d'une ligne (premiers mots, en pt) est celui de l'éditeur, et le milieu de la case est à la même distance de la ligne de base du premier mot (la case est peinte par pdf.js à
// l'échelle 16 et son encre mesurée aux pixels ; côté éditeur, un petit inline-block vide posé au début de la ligne donne la ligne de base).
{
  const { page: app } = await t.openPage({ hosted: false, colorScheme: 'light' });
  await app.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js' });
  for (const [style, attr] of STYLES) {
    const item = word => `<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>${word}</p></div></li>`;
    const list = items => `<ul data-type="taskList"${attr ? ` data-tasklist-style="${attr}"` : ''}>${items}</ul>`;
    const result = await app.evaluate(async ({ three, one }) => {
      await ExportEngines.loadAll();
      await PdfExport.ensurePdfLibsLoaded();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      const pdfPage = async html => {
        const blob = (await PdfExport.getNativePdfBlobForRecord(html, null, {}, '', null)).blob;
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        const page = await pdf.getPage(1);
        return { page, vp1: page.getViewport({ scale: 1 }), items: (await page.getTextContent()).items };
      };
      const wordIn = (view, name) => view.items.find(i => i.str && i.str.trim() === name);
      const long = await pdfPage(three);
      const pdfPitch = [wordIn(long, 'Alpha').transform[5] - wordIn(long, 'Beta').transform[5], wordIn(long, 'Beta').transform[5] - wordIn(long, 'Gamma').transform[5]];
      // La case d'un élément seul : l'encre à gauche de son mot.
      const single = await pdfPage(one);
      const alpha = wordIn(single, 'Alpha');
      const tx = alpha.transform[4], ty = single.vp1.height - alpha.transform[5], scale = 16;
      const rx0 = tx - 30, ry0 = ty - 20, rw = 32, rh = 28;
      const cv = document.createElement('canvas'); cv.width = rw * scale; cv.height = rh * scale;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await single.page.render({ canvasContext: ctx, viewport: single.page.getViewport({ scale }), transform: [1, 0, 0, 1, -rx0 * scale, -ry0 * scale] }).promise;
      const W = cv.width, H = cv.height, d = ctx.getImageData(0, 0, W, H).data;
      const textLeft = Math.round((tx - rx0) * scale);
      let y0 = H, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < textLeft - 2 * scale; x++) { const i = (y * W + x) * 4; if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 235) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
      const pdfBelow = ry0 + (y0 + y1 + 1) / 2 / scale - ty;
      // L'éditeur : les trois mêmes éléments.
      EditorCore.getEditor().commands.setContent(three.replace(/<label>.*?<\/label>/g, '').replace(/<div>|<\/div>/g, ''));
      await new Promise(r => setTimeout(r, 300));
      const root = document.querySelector('#editor-container .tiptap');
      const zoom = EditorCore.layoutZoom(root);
      const lis = Array.from(root.querySelectorAll('ul[data-type="taskList"] > li'));
      const tops = lis.map(li => li.getBoundingClientRect().top);
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0';
      const first = lis[0].querySelector('p');
      first.insertBefore(probe, first.firstChild);
      const baseline = probe.getBoundingClientRect().bottom;
      probe.remove();
      const box = lis[0].querySelector('input').getBoundingClientRect();
      return { pdfPitch, editorPitch: [(tops[1] - tops[0]) / zoom * 0.75, (tops[2] - tops[1]) / zoom * 0.75], pdfBelow, editorBelow: ((box.top + box.height / 2) - baseline) / zoom * 0.75 };
    }, { three: list(item('Alpha') + item('Beta') + item('Gamma')), one: list(item('Alpha')) });
    const worst = Math.max(...result.pdfPitch.map((v, i) => Math.abs(v - result.editorPitch[i])));
    check(`PDF · ${style} : l'écart entre deux éléments d'une ligne est celui de l'éditeur (${result.pdfPitch.map(v => v.toFixed(2)).join(' et ')} pt contre ${result.editorPitch.map(v => v.toFixed(2)).join(' et ')} pt ; ${worst.toFixed(2)} pt d'écart au plus, 0,4 pt permis)`, worst <= 0.4, result);
    const gap = Math.abs(result.pdfBelow - result.editorBelow);
    check(`PDF · ${style} : le milieu de la case est à la même distance de la ligne de base du premier mot que dans l'éditeur (${result.pdfBelow.toFixed(2)} pt contre ${result.editorBelow.toFixed(2)} pt ; ${gap.toFixed(2)} pt d'écart, 0,4 pt permis)`, gap <= 0.4, result);
  }
  await app.close();
}

await t.finish();
