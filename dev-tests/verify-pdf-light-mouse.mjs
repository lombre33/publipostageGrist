#!/usr/bin/env node
// La qualité « Léger » du bouton PDF au VRAI clic, à 700x400 (le panneau de Grist) : ce qu'Antoine voit et fait, pas un état interne.
//   1) le menu Qualité : trois lignes seulement (Vectoriel, Impression navigateur, Léger), aucune grisée, entières dans le panneau - en français et en anglais ; plus de « Basse qualité »
//      ni d'« Ultra HD » (retirées à sa demande du 09/10) ;
//   2) un vrai clic sur « Léger » la choisit (liste cachée, ligne active, une seule) ;
//   3) le vrai clic sur le bouton PDF, en « Léger » puis en « Vectoriel », sur un courrier à photo lourde : deux PDF téléchargés, celui de « Léger » de moins du sixième du poids, le
//      message d'état « PDF généré. » et aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « pdfLightMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pdf-light-mouse.mjs
import { stat } from 'node:fs/promises';
import { open, stopServer, sleep, click, clickHoverRow, hoverRow, fire, status } from './load-lib.mjs';

const PORT = Number(process.env.PDF_LIGHT_PORT || 8994);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const QUALITY_ROW = name => '#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]';
const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Ce que le menu montre : chaque ligne de qualité, son texte, son état et sa place dans le panneau.
const menuRows = page => page.evaluate(() => Array.from(document.querySelectorAll('#v2-quality-flyout .v2-hover-row[data-quality]')).map(row => {
  const r = row.getBoundingClientRect();
  return {
    quality: row.dataset.quality, text: row.textContent.trim(), greyed: row.classList.contains('v2-hover-row-disabled') || row.getAttribute('aria-disabled') === 'true',
    active: row.classList.contains('is-active'), inside: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    cut: row.scrollWidth > row.clientWidth + 1,
  };
}));
const picked = page => page.evaluate(() => document.getElementById('v2-pdf-quality').value);

let w = null;
try {
  w = await open({ spec: SPEC, port: PORT, settleMs: 1500 });
  const { page } = w;

  console.log('\n1) Le menu Qualité PDF à 700x400');
  await hoverRow(page, '#v2-btn-quality', QUALITY_ROW('light'));
  const fr = await menuRows(page);
  check('trois lignes, dans cet ordre : Vectoriel, Impression navigateur, Léger', JSON.stringify(fr.map(r => r.quality)) === JSON.stringify(['native', 'browser-print', 'light']), fr.map(r => r.quality));
  check('les textes français : « Vectoriel (par défaut) », « Impression navigateur », « Léger (images réduites) »',
    JSON.stringify(fr.map(r => r.text)) === JSON.stringify(['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)']), fr.map(r => r.text));
  check('aucune ligne grisée, aucune « bientôt », ni « Basse qualité » ni « Ultra HD »', fr.every(r => !r.greyed && !/bient[oô]t|ultra|basse/i.test(r.text)), fr);
  check('chaque ligne est entière dans le panneau, sans texte coupé', fr.every(r => r.inside && !r.cut), fr);
  check('au départ, « Vectoriel » est la ligne choisie, seule', fr.filter(r => r.active).map(r => r.quality).join() === 'native' && (await picked(page)) === 'native', fr.filter(r => r.active));

  await page.evaluate(() => I18n.setLang('en'));
  await sleep(200);
  await hoverRow(page, '#v2-btn-quality', QUALITY_ROW('light'));
  const en = await menuRows(page);
  check('les textes anglais : « Vector (default) », « Browser print », « Light (smaller images) », entiers dans le panneau',
    JSON.stringify(en.map(r => r.text)) === JSON.stringify(['Vector (default)', 'Browser print', 'Light (smaller images)']) && en.every(r => r.inside && !r.cut && !r.greyed), en);
  await page.evaluate(() => I18n.setLang('fr'));
  await sleep(200);

  console.log('\n2) Un vrai clic sur « Léger » la choisit');
  await clickHoverRow(page, '#v2-btn-quality', QUALITY_ROW('light'));
  await sleep(150);
  await hoverRow(page, '#v2-btn-quality', QUALITY_ROW('light'));
  const chosen = await menuRows(page);
  check('la liste cachée vaut « light », seule la ligne « Léger » est active', (await picked(page)) === 'light' && chosen.filter(r => r.active).map(r => r.quality).join() === 'light', chosen.filter(r => r.active));

  console.log('\n3) Le vrai clic sur le bouton PDF, « Léger » puis « Vectoriel »');
  // Une photo qui pèse (JPEG de 1800 x 1200 posé sur 360 px) dans un courrier : le poids du PDF en dépend presque seul.
  const html = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800; canvas.height = 1200;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(1800, 1200);
    let seed = 7;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296 - 0.5) * 70;
      const x = (i / 4) % 1800;
      pixels.data[i] = 140 + 100 * Math.sin(x / 90) + noise; pixels.data[i + 1] = 120 + noise; pixels.data[i + 2] = 100 - noise; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return '<p>Bonjour, voici votre courrier avec sa photo.</p><p><img class="editor-image" src="' + canvas.toDataURL('image/jpeg', 0.9) + '" alt="" style="width: 360px;"></p>';
  });
  await page.evaluate(({ html, hf }) => { Editor.setHTML(html); Editor.setHeaderFooterData(hf); }, { html, hf: NO_HF });
  await fire(page, 'PbClients', 1);
  const sizeOfDownload = async download => ({ name: download.suggestedFilename(), size: (await stat(await download.path())).size });
  const [lightDownload] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), click(page, '#btn-export-pdf')]);
  const light = await sizeOfDownload(lightDownload);
  await sleep(300);
  const doneMessage = await status(page);
  const expectedDone = await page.evaluate(() => I18n.t('status.pdfGenerated'));
  await clickHoverRow(page, '#v2-btn-quality', QUALITY_ROW('native'));
  check('« Vectoriel » est de nouveau la ligne choisie', (await picked(page)) === 'native');
  const [nativeDownload] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), click(page, '#btn-export-pdf')]);
  const native = await sizeOfDownload(nativeDownload);
  check('deux PDF téléchargés (.pdf), celui de « Léger » de moins du sixième du poids de celui de « Vectoriel »', /\.pdf$/.test(light.name) && /\.pdf$/.test(native.name) && native.size > 300 * 1024 && light.size < native.size / 6, { light, native });
  check('le message d\'état après l\'export en « Léger » : « ' + expectedDone + ' »', doneMessage === expectedDone, doneMessage);
  check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
