// Un tableau de document « comme dans une grille » : sa barre flottante (lignes, colonnes, fusion, fond, bordures, alignement vertical, répéter la ligne) et le menu des bordures.
// Le vrai widget, un modèle de démonstration (Devis) semé avant le démarrage ; tout le reste est fait à la vraie souris.
import { openWidget, seedModel, idle, shot, sleep, done, click, rectOf } from './kit.mjs';
const W = 1280, H = 800;
const fill = 'background-color: #e6edfb';
const th = (t, w, align = '') => `<th colwidth="${w}" style="${fill}"><p${align ? ` style="text-align: ${align}"` : ''}><strong>${t}</strong></p></th>`;
const td = (t, w, align = '', bold = false) => `<td colwidth="${w}"><p${align ? ` style="text-align: ${align}"` : ''}>${bold ? `<strong>${t}</strong>` : t}</p></td>`;
const widths = [270, 70, 100, 110];
const row = (a, b, c, d, bold = false) => `<tr>${td(a, widths[0], '', bold)}${td(b, widths[1], 'center', bold)}${td(c, widths[2], 'right', bold)}${td(d, widths[3], 'right', bold)}</tr>`;
const html = [
  '<h1>Devis n° D-2026-0042</h1>',
  '<p>Éclairage de la salle des fêtes — Association « Les Amis du Rhône »</p>',
  '<p></p>',
  '<p>Madame, Monsieur,</p>',
  '<p>Suite à notre visite du 12 octobre, nous vous proposons le chiffrage ci-dessous pour le remplacement de l’éclairage de la salle principale et des extérieurs. Les prix s’entendent hors taxes, pose comprise.</p>',
  '<p>Ce devis reprend le métré relevé sur place et les références du catalogue de l’automne.</p>',
  '<p>Les luminaires sont garantis deux ans, les ampoules un an. Les anciens plafonniers sont déposés et repris sans frais.</p>',
  '<p>Le chantier est prévu la semaine du 7 décembre, en deux interventions d’une demi-journée ; la salle reste utilisable entre les deux. Le détail du chiffrage :</p>',
  '<p></p>',
  '<table><tbody>',
  `<tr>${th('Désignation', widths[0])}${th('Qté', widths[1], 'center')}${th('PU HT', widths[2], 'right')}${th('Total HT', widths[3], 'right')}</tr>`,
  row('Plafonnier opale, salle principale', '8', '212,00 €', '1 696,00 €'),
  row('Projecteur LED extérieur, IP65', '6', '98,90 €', '593,40 €'),
  row('Guirlande lumineuse 20 m', '4', '64,00 €', '256,00 €'),
  row('Pose et raccordement', '14 h', '55,00 €', '770,00 €'),
  row('Total HT', '', '', '3 315,40 €', true),
  '</tbody></table>',
  '<p></p>',
  '<p>Devis valable 30 jours. Acompte de 30 % à la commande.</p>',
].join('');
const { page } = await openWidget({ width: W, height: H, seed: seedModel({ name: 'Devis', html, dateModif: 1793778900 }) });
await sleep(900);
await click(page, '#btn-set-default-template', 400);
await idle(page, 70, 700);
await shot(page, 't0-tableau-repos');

// Le curseur dans la case « 98,90 € » : la barre flottante du tableau apparaît.
const cell = await page.evaluate(() => { const cells = Array.from(document.querySelectorAll('.tiptap table td')); const c = cells.find((e) => /98,90/.test(e.textContent)); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.move(cell.x - 30, cell.y - 20, { steps: 3 }); await page.mouse.move(cell.x, cell.y, { steps: 4 }); await sleep(100); await page.mouse.click(cell.x, cell.y); await sleep(700);
await page.mouse.move(70, 700, { steps: 4 }); await sleep(400);
await shot(page, 't1-tableau-barre');
const bar = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-floating-toolbar')).filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => e.className + ' ' + JSON.stringify(e.getBoundingClientRect())));
console.log('barres :', bar.join('\n'));
// Le menu « Bordures ».
await click(page, '#v2-table-borders-btn', 700, false);
await page.mouse.move(70, 700, { steps: 4 }); await sleep(400);
await shot(page, 't2-tableau-bordures');
const union = await page.evaluate(() => {
  const els = [document.querySelector('.tiptap table'), document.querySelector('.v2-table-toolbar'), Array.from(document.querySelectorAll('.v2-color-dropdown')).find((e) => e.getBoundingClientRect().width > 0)].filter(Boolean);
  const rs = els.map((e) => e.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), r = Math.max(...rs.map((x) => x.right)), b = Math.max(...rs.map((x) => x.bottom));
  return { l, t, r, b, n: els.length, parts: rs.map((x) => [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]) };
});
console.log('union', JSON.stringify(union));
const y0 = Math.max(76, union.t - 22);
await shot(page, 't3-tableau-bordures-crop', { clip: { x: 215, y: y0, width: 660, height: union.b + 22 - y0 } });
await done();
