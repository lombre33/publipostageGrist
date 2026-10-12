#!/usr/bin/env node
// Ligne « Selon chaque modèle » du menu Page d'un macro-modèle (js/orientation-toggle.js, js/page-layout.js:setOrientationAuto) à la VRAIE souris, dans le panneau de 700x400 d'Antoine - sa demande du
// 12/10 : « il faudrait qu'un macro modèle puisse contenir des modèles paysage, portrait et grille », carte « Chaque modèle, ou imposé ». Ce que dev-tests/scenarios-mixed-orientation.js ne peut pas voir depuis la page :
//   1) un macro-modèle composé dans la VRAIE fenêtre (page de garde portrait, une annexe paysage, une annexe portrait) se charge « Selon chaque modèle » : le bouton Page est dans le panneau, actif, non
//      allumé, son libellé le dit ; la Lecture a trois feuilles, portrait, paysage, portrait ;
//   2) le menu au survol (vraie souris) tient en entier dans le panneau : la ligne « Selon chaque modèle » est la première, cochée (Portrait et Paysage décochés), son texte entier, aucune ligne coupée ni
//      masquée, la dernière ligne atteignable ;
//   3) « Paysage » (vrai clic) impose le paysage : le bouton s'allume, la Lecture n'a plus qu'une feuille paysage (les trois modèles dessus) ; « Selon chaque modèle » (vrai clic) rend les trois sens d'avant ;
//      le clic sur le bouton, depuis « Selon chaque modèle », impose le paysage, le suivant le portrait ; la ligne se choisit aussi au clavier (Tab depuis le bouton, Entrée) ;
//   4) un modèle simple n'a pas la ligne (son menu reste celui d'avant), le macro-modèle la retrouve ;
//   5) le thème sombre et l'anglais (mêmes mesures) ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « macroPageAutoMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-macro-page-auto-mouse.mjs
// MACRO_PAGE_AUTO_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { open, stopServer, sleep, click, hoverRow, fire, mode, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.MACRO_PAGE_AUTO_PORT || 9022);
const SHOTS = process.env.MACRO_PAGE_AUTO_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const MACRO = 'Macro sens';
const SHEET_PX = { P: 793.71, L: 1122.52 };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

// Contrastes (WCAG) : même calcul que dev-tests/verify-macro-margins-note-mouse.mjs.
const rgbOf = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (fg, bg) => { const a = rgbOf(fg), b = rgbOf(bg); if (!a || !b) return 0; const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };

const TEXTS = {
  fr: { auto: 'Selon chaque modèle', portrait: 'Portrait', landscape: 'Paysage', buttonAuto: 'Page A4 selon chaque modèle (passer en paysage)', buttonLandscape: 'Page A4 en paysage (passer en portrait)', buttonPortrait: 'Page A4 en portrait (passer en paysage)' },
  en: { auto: 'Follow each template', portrait: 'Portrait', landscape: 'Landscape', buttonAuto: 'A4 page following each template (switch to landscape)', buttonLandscape: 'A4 page in landscape (switch to portrait)', buttonPortrait: 'A4 page in portrait (switch to landscape)' },
};

// Trois modèles (portrait, paysage, portrait) et le macro-modèle qui les assemble, composé dans la VRAIE fenêtre : une page de garde, deux annexes dont le modèle par défaut est fixé.
async function composeMacro(page) {
  await page.evaluate(async macro => {
    const landscape = { top: 10, right: 10, bottom: 10, left: 10, orientation: 'landscape', format: 'A4' };
    const cover = await Templates.save(null, 'Garde sens', '<p>Texte de la garde portrait</p>', '', null, null, 'document', null);
    const wide = await Templates.save(null, 'Annexe large', '<p>Texte de l\'annexe paysage</p>', '', null, landscape, 'document', null);
    const last = await Templates.save(null, 'Dernière sens', '<p>Texte de la dernière page portrait</p>', '', null, null, 'document', null);
    await Templates.loadAll();
    MacroEditor.openModal(null);
    document.getElementById('macro-editor-name').value = macro;
    const select = document.getElementById('macro-editor-cover');
    select.value = String(cover.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    for (const id of [wide.id, last.id]) {
      document.getElementById('macro-editor-add-slot').click();
      const defaults = document.querySelectorAll('#macro-editor-slots .macro-slot-default-select');
      const annex = defaults[defaults.length - 1];
      annex.value = String(id);
      annex.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('macro-editor-save').click();
  }, MACRO);
  await page.waitForFunction(() => { const s = document.getElementById('macro-summary-container'); return !!s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(600);
  await fire(page, 'PbClients', 1);
}

// Le bouton Page et son menu, tels que la personne les voit.
const measure = page => page.evaluate(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const btn = document.getElementById('btn-page-orientation');
  const flyout = document.getElementById('v2-page-flyout');
  const style = getComputedStyle(flyout);
  const bgOf = el => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.99)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const rows = Array.from(flyout.querySelectorAll('.v2-hover-row')).map(row => {
    const name = row.querySelector('.v2-page-row-name');
    return {
      key: row.getAttribute('data-page-orientation') || row.getAttribute('data-page-format') || row.id,
      text: name ? name.textContent : row.textContent,
      checked: row.getAttribute('aria-checked'), box: rect(row), cut: name ? name.scrollWidth > name.clientWidth + 1 : false,
      color: getComputedStyle(row).color, background: bgOf(row),
    };
  });
  const c = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
  return {
    button: { box: rect(btn), disabled: btn.disabled, pressed: btn.getAttribute('aria-pressed'), data: btn.dataset.orientation, label: btn.getAttribute('aria-label'), active: btn.classList.contains('active'), reachable: hit === btn },
    flyout: { shown: style.display !== 'none' && style.visibility !== 'hidden' && flyout.getBoundingClientRect().height > 0, box: rect(flyout), scrolls: flyout.scrollHeight > flyout.clientHeight + 1 },
    rows, checked: rows.filter(r => r.checked === 'true').map(r => r.key).join(','),
    view: { w: innerWidth, h: innerHeight },
  };
});

// La Lecture : une feuille par suite de modèles de même sens (largeur en pixels de mise en page, hors zoom du panneau), ce que chaque feuille dit.
const sheetsOf = page => page.evaluate(() => Array.from(document.querySelectorAll('#reader-container > .reader-content')).map(el => {
  const r = el.getBoundingClientRect();
  return { width: Math.round(r.width / EditorCore.layoutZoom(el) * 100) / 100, text: el.textContent.replace(/\s+/g, ' ').trim() };
}));
const senses = sheets => sheets.map(s => (near(s.width, SHEET_PX.L, 2) ? 'L' : near(s.width, SHEET_PX.P, 2) ? 'P' : '?')).join('');
async function reading(page) {
  await mode(page, 'read');
  await sleep(500);
  const sheets = await sheetsOf(page);
  await mode(page, 'edit');
  return sheets;
}

// Un choix du menu à la vraie souris : survol du bouton, glissé jusqu'à la ligne, clic.
async function chooseRow(page, key) {
  const row = `#v2-page-flyout [data-page-orientation="${key}"]`;
  const r = await hoverRow(page, '#btn-page-orientation', row);
  await page.mouse.click(r.x, r.y);
  await sleep(450);
  // La souris quitte le menu : il se referme, la mesure suivante part d'un état neutre.
  await page.mouse.move(350, 250);
  await sleep(300);
}

async function scenario(title, options, fn) {
  console.log('\n' + title);
  let w = null;
  try {
    w = await open(Object.assign({ spec: SPEC, port: PORT, settleMs: 1200 }, options));
    await fn(w);
    check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
  } catch (e) {
    check(title + ' : le scénario va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    if (w) await w.close();
  }
}

async function run(w, lang, theme) {
  const page = w.page;
  const T = TEXTS[lang];
  const where = (theme === 'dark' ? 'sombre' : 'clair') + ', ' + (lang === 'en' ? 'anglais' : 'français') + ' : ';
  const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${theme}-${lang}.png` }); };

  await composeMacro(page);

  // 1) Le macro-modèle neuf : « Selon chaque modèle ».
  const first = await measure(page);
  check(where + 'le bouton Page est dans le panneau, actif, non allumé, et dit « selon chaque modèle »',
    !first.button.disabled && first.button.pressed === 'false' && !first.button.active && first.button.data === 'auto' && first.button.label === T.buttonAuto
      && first.button.box.left >= 0 && first.button.box.right <= first.view.w && first.button.box.top >= 0 && first.button.box.bottom <= first.view.h && first.button.reachable, first.button);
  const sheets = await reading(page);
  check(where + 'la Lecture a trois feuilles : portrait, paysage, portrait (une par suite de modèles de même sens)', senses(sheets) === 'PLP' && /garde/.test(sheets[0].text) && /annexe/.test(sheets[1].text) && /dernière/.test(sheets[2].text), sheets);

  // 2) Le menu au survol, en entier dans le panneau.
  await hoverRow(page, '#btn-page-orientation', '#v2-page-flyout [data-page-orientation="auto"]');
  const open1 = await measure(page);
  await shot('menu');
  check(where + 'le menu s\'ouvre au survol et la première ligne est « ' + T.auto + ' », cochée, Portrait et Paysage décochés',
    open1.flyout.shown && open1.rows[0].key === 'auto' && open1.rows[0].text === T.auto && open1.rows[0].checked === 'true'
      && open1.rows.filter(r => r.key === 'portrait' || r.key === 'landscape').every(r => r.checked === 'false') && open1.checked === 'auto,A4', { shown: open1.flyout.shown, rows: open1.rows.map(r => r.key + ':' + r.text + ':' + r.checked) });
  check(where + 'le texte de la ligne est entier (rien de coupé)', open1.rows.every(r => !r.cut), open1.rows.filter(r => r.cut).map(r => r.key));
  check(where + 'toutes les lignes du menu sont dans le panneau (la dernière, « Filigrane », est atteignable sans défiler)',
    open1.flyout.box.top >= 0 && open1.flyout.box.bottom <= open1.view.h && open1.flyout.box.left >= 0 && open1.flyout.box.right <= open1.view.w
      && open1.rows.every(r => r.box.top >= open1.flyout.box.top - 0.5 && r.box.bottom <= open1.flyout.box.bottom + 0.5 && r.box.bottom <= open1.view.h), { flyout: open1.flyout.box, view: open1.view });
  const autoRow = open1.rows[0];
  const contrast = ratio(autoRow.color, autoRow.background);
  check(where + 'la ligne a le contraste de la charte (>= 4,5:1)', contrast >= 4.5, { contrast, color: autoRow.color, background: autoRow.background });
  await page.mouse.move(350, 250);
  await sleep(300);

  // 3) « Paysage » (vrai clic) : tout en paysage ; « Selon chaque modèle » (vrai clic) : les sens d'avant ; le bouton, depuis « Selon chaque modèle », impose le paysage.
  await chooseRow(page, 'landscape');
  const imposed = await measure(page);
  check(where + '« ' + T.landscape + ' » (vrai clic) impose le paysage : le bouton s\'allume, la ligne est cochée seule', imposed.button.pressed === 'true' && imposed.button.active && imposed.button.data === 'landscape' && imposed.button.label === T.buttonLandscape && imposed.checked === 'landscape,A4', { button: imposed.button, checked: imposed.checked });
  const landscapeSheets = await reading(page);
  check(where + 'la Lecture n\'a plus qu\'une feuille, paysage, avec les trois modèles dessus (le sens imposé, comme avant)', senses(landscapeSheets) === 'L' && /garde/.test(landscapeSheets[0].text) && /annexe/.test(landscapeSheets[0].text) && /dernière/.test(landscapeSheets[0].text), landscapeSheets);
  await chooseRow(page, 'auto');
  const back = await measure(page);
  check(where + '« ' + T.auto + ' » (vrai clic) le rétablit : bouton non allumé, ligne cochée, libellé d\'avant', back.button.pressed === 'false' && !back.button.active && back.button.data === 'auto' && back.button.label === T.buttonAuto && back.checked === 'auto,A4', { button: back.button, checked: back.checked });
  check(where + 'la Lecture retrouve portrait, paysage, portrait', senses(await reading(page)) === 'PLP');
  await click(page, '#btn-page-orientation');
  await sleep(450);
  await page.mouse.move(350, 250);
  await sleep(300);
  const clicked = await measure(page);
  check(where + 'le clic sur le bouton, depuis « ' + T.auto + ' », impose le paysage', clicked.button.pressed === 'true' && clicked.button.data === 'landscape' && clicked.checked === 'landscape,A4', { button: clicked.button, checked: clicked.checked });
  await click(page, '#btn-page-orientation');
  await sleep(450);
  const portrait = await measure(page);
  check(where + 'un second clic impose le portrait (comme avant), la ligne « ' + T.portrait + ' » est cochée', portrait.button.pressed === 'false' && portrait.button.data === 'portrait' && portrait.button.label === T.buttonPortrait && portrait.checked === 'portrait,A4', { button: portrait.button, checked: portrait.checked });
  const portraitSheets = await reading(page);
  check(where + 'la Lecture n\'a plus qu\'une feuille, portrait, avec les trois modèles dessus', senses(portraitSheets) === 'P' && /garde/.test(portraitSheets[0].text) && /annexe/.test(portraitSheets[0].text) && /dernière/.test(portraitSheets[0].text), portraitSheets);

  // Au clavier : le focus sur le bouton montre le menu, Tab arrive sur sa première ligne, Entrée la choisit.
  await page.focus('#btn-page-orientation');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => { const e = document.activeElement; return e ? e.getAttribute('data-page-orientation') : null; });
  check(where + 'Tab, depuis le bouton, arrive sur la ligne « ' + T.auto + ' » (la première du menu)', focused === 'auto', focused);
  await page.keyboard.press('Enter');
  await sleep(450);
  const keyboard = await measure(page);
  check(where + 'Entrée la choisit : le macro-modèle suit de nouveau chaque modèle', keyboard.button.data === 'auto' && keyboard.checked === 'auto,A4', { button: keyboard.button, checked: keyboard.checked });
  await page.mouse.move(350, 250);
  await sleep(300);

  // L'enregistrement automatique écrit la page avec le macro-modèle (colonne Margins, clé orientationAuto) ; le cache des modèles est relu par son passage suivant, relu ici comme lui avant de quitter le macro-modèle.
  await sleep(3200);
  const written = await page.evaluate(async () => {
    const row = window.__gristStub.getRow('Publipostage_Modeles', Templates.getCurrentId());
    await Templates.loadAll();
    return row.Margins;
  });
  check(where + 'l\'enregistrement automatique écrit « ' + T.auto + ' » avec le macro-modèle (clé orientationAuto de sa colonne Margins)', JSON.parse(written).orientationAuto === true && JSON.parse(written).orientation === 'portrait', written);

  // 4) Un modèle simple n'a pas la ligne ; le macro-modèle la retrouve.
  check(where + 'le modèle simple est ouvert', !!(await pickTemplate(page, 'Garde sens')));
  await hoverRow(page, '#btn-page-orientation', '#v2-page-flyout [data-page-orientation="portrait"]');
  const plain = await measure(page);
  check(where + 'un modèle simple : le menu n\'a pas la ligne, le bouton garde son libellé d\'avant', !plain.rows.some(r => r.key === 'auto') && plain.button.data === 'portrait' && plain.button.label === T.buttonPortrait && plain.checked === 'portrait,A4', { rows: plain.rows.map(r => r.key), button: plain.button, checked: plain.checked });
  await page.mouse.move(350, 250);
  await sleep(300);
  check(where + 'le macro-modèle est rouvert', !!(await pickTemplate(page, MACRO)));
  await hoverRow(page, '#btn-page-orientation', '#v2-page-flyout [data-page-orientation="auto"]');
  const again = await measure(page);
  check(where + 'le macro-modèle retrouve la ligne, cochée (son réglage est écrit avec lui)', again.rows[0].key === 'auto' && again.checked === 'auto,A4' && again.button.data === 'auto', { rows: again.rows.map(r => r.key), button: again.button, checked: again.checked });
  await page.mouse.move(350, 250);
  await sleep(300);
}

await scenario('1. Clair, français', {}, w => run(w, 'fr', 'light'));
await scenario('2. Sombre, anglais', { theme: 'dark', lang: 'en' }, w => run(w, 'en', 'dark'));

await stopServer();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
