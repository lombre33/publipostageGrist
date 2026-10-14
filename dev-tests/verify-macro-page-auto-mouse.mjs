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
//   5) le thème sombre et l'anglais (mêmes mesures) ; aucune erreur de page ;
//   6) les étiquettes du résumé (js/macro-editor.js:modelTags, réponse du 12/10 « Oui, dans le résumé ») : « Paysage » à droite du nom de l'annexe en paysage et rien à côté des modèles en portrait, entre le nom et le stylo,
//      entière, lisible (contraste de la charte), sans rien qui recouvre le stylo ni l'œil ; elle part avec « Paysage » ou « Portrait » imposé et revient avec « Selon chaque modèle » ; un nom très long se coupe par « … »
//      sans jamais couper « Grille » ni « Paysage », à 700 px comme à 360 px, sans défilement de côté.
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
  fr: { tagGrid: 'Grille', tagLandscape: 'Paysage', auto: 'Selon chaque modèle', portrait: 'Portrait', landscape: 'Paysage', buttonAuto: 'Page A4 selon chaque modèle (passer en paysage)', buttonLandscape: 'Page A4 en paysage (passer en portrait)', buttonPortrait: 'Page A4 en portrait (passer en paysage)' },
  en: { tagGrid: 'Grid', tagLandscape: 'Landscape', auto: 'Follow each template', portrait: 'Portrait', landscape: 'Landscape', buttonAuto: 'A4 page following each template (switch to landscape)', buttonLandscape: 'A4 page in landscape (switch to portrait)', buttonPortrait: 'A4 page in portrait (switch to landscape)' },
};

// Un macro-modèle composé dans la VRAIE fenêtre : le premier des modèles est la page de garde, chacun des autres le modèle par défaut d'une annexe. `specs` : { name, html, margins?, type? }.
async function composeFrom(page, macro, specs) {
  await page.evaluate(async ({ macro, specs }) => {
    const ids = [];
    for (const spec of specs) ids.push((await Templates.save(null, spec.name, spec.html, '', null, spec.margins || null, spec.type || 'document', null)).id);
    await Templates.loadAll();
    MacroEditor.openModal(null);
    document.getElementById('macro-editor-name').value = macro;
    const select = document.getElementById('macro-editor-cover');
    select.value = String(ids[0]);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    for (const id of ids.slice(1)) {
      document.getElementById('macro-editor-add-slot').click();
      const defaults = document.querySelectorAll('#macro-editor-slots .macro-slot-default-select');
      const annex = defaults[defaults.length - 1];
      annex.value = String(id);
      annex.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('macro-editor-save').click();
  }, { macro, specs });
  await page.waitForFunction(() => { const s = document.getElementById('macro-summary-container'); return !!s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(600);
  await fire(page, 'PbClients', 1);
}

const LANDSCAPE_PAGE = { top: 10, right: 10, bottom: 10, left: 10, orientation: 'landscape', format: 'A4' };
const GRID_HTML = '<table style="width: 200px;"><colgroup><col style="width: 200px;"></colgroup><tbody><tr data-row-height="28" style="height: 28px"><td colwidth="200"><p>Grille</p></td></tr></tbody></table>';

// Trois modèles (portrait, paysage, portrait) et le macro-modèle qui les assemble.
const composeMacro = page => composeFrom(page, MACRO, [
  { name: 'Garde sens', html: '<p>Texte de la garde portrait</p>' },
  { name: 'Annexe large', html: '<p>Texte de l\'annexe paysage</p>', margins: LANDSCAPE_PAGE },
  { name: 'Dernière sens', html: '<p>Texte de la dernière page portrait</p>' },
]);

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

// Le résumé du macro-modèle tel que la personne le voit : pour chaque modèle, son nom (et s'il est coupé), ses étiquettes (texte, place, couleurs, ce qui les recouvre), son stylo et son œil (ce qui les recouvre, et
// s'ils passent sous la pastille de zoom, collée au coin bas droit du panneau) ; le défilement du panneau. Chaque modèle est amené au milieu de la vue avant d'être mesuré, comme le ferait la personne en défilant :
// le panneau défile quand la liste dépasse sa hauteur, et le dernier modèle s'arrête au bout du défilement.
const summaryTags = page => page.evaluate(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const bgOf = el => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.99)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const hitOf = el => { const c = el.getBoundingClientRect(); const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2); return hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.split(' ')[0] : '') : null; };
  const onTop = el => { const c = el.getBoundingClientRect(); const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2); return !!hit && (hit === el || el.contains(hit)); };
  const panel = document.getElementById('macro-summary-container');
  const pillEl = document.querySelector('.pp-page-zoom');
  const pill = pillEl ? rect(pillEl) : null;
  const underPill = el => { const b = rect(el); return !!pill && b.left < pill.right && b.right > pill.left && b.top < pill.bottom && b.bottom > pill.top; };
  return {
    view: { w: innerWidth, h: innerHeight },
    panel: { box: rect(panel), scrollsSideways: panel.scrollWidth > panel.clientWidth + 1 },
    entries: Array.from(panel.querySelectorAll('.macro-summary-model')).map(entry => {
      entry.scrollIntoView({ block: 'center' });
      const name = entry.querySelector('.macro-summary-model-name'), edit = entry.querySelector('.macro-summary-edit'), eye = entry.querySelector('.macro-summary-eye');
      return {
        name: name.textContent, nameBox: rect(name), nameCut: name.scrollWidth > name.clientWidth + 1, nameFamily: getComputedStyle(name).fontFamily,
        box: rect(entry), partBox: rect(entry.closest('.macro-summary-part')),
        tags: Array.from(entry.querySelectorAll('.macro-summary-model-tag')).map(tag => ({
          text: tag.textContent, box: rect(tag), cut: tag.scrollWidth > tag.clientWidth + 1, color: getComputedStyle(tag).color, background: bgOf(tag), family: getComputedStyle(tag).fontFamily, onTop: onTop(tag),
        })),
        edit: { box: rect(edit), onTop: onTop(edit), hit: hitOf(edit), underPill: underPill(edit) }, eye: { box: rect(eye), onTop: onTop(eye), hit: hitOf(eye), underPill: underPill(eye) },
      };
    }),
  };
});

// Les étiquettes d'un modèle du résumé, bien posées : à droite du nom, avant le stylo, dans la ligne et dans le panneau, entières, rien dessus ; la police du nom.
const tagsWellPlaced = (entry, view) => entry.tags.every(t => t.box.w > 0 && t.box.left >= entry.nameBox.right - 0.5 && t.box.right <= entry.edit.box.left + 0.5
  && t.box.left >= entry.partBox.left && t.box.right <= entry.partBox.right + 0.5 && t.box.top >= entry.partBox.top - 0.5 && t.box.bottom <= entry.partBox.bottom + 0.5
  && t.box.right <= view.w && t.box.bottom <= view.h && !t.cut && t.onTop && t.family === entry.nameFamily);
const tagsOf = entry => entry.tags.map(t => t.text).join('+');

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
  // 1b) Le résumé : « Paysage » à droite du nom de l'annexe en paysage, rien à côté des deux modèles en portrait.
  const summary = await summaryTags(page);
  const entryOf = (list, name) => list.entries.find(e => e.name === name);
  await shot('resume');
  check(where + 'le résumé met « ' + T.tagLandscape + ' » à droite du nom de l\'annexe en paysage, et rien à côté des deux modèles en portrait',
    summary.entries.length === 3 && tagsOf(entryOf(summary, 'Annexe large')) === T.tagLandscape && tagsOf(entryOf(summary, 'Garde sens')) === '' && tagsOf(entryOf(summary, 'Dernière sens')) === '', summary.entries.map(e => [e.name, tagsOf(e)]));
  check(where + 'l\'étiquette est entre le nom et le stylo, dans sa ligne et dans le panneau, entière, de la police du nom, et rien ne la recouvre', summary.entries.every(e => tagsWellPlaced(e, summary.view)), summary.entries.map(e => e.tags.map(t => [t.box, t.cut, t.onTop, t.family])));
  const tagText = entryOf(summary, 'Annexe large').tags[0];
  const tagContrast = ratio(tagText.color, tagText.background);
  check(where + 'l\'étiquette a le contraste de la charte (>= 4,5:1)', tagContrast >= 4.5, { tagContrast, color: tagText.color, background: tagText.background });
  check(where + 'le panneau du résumé ne défile pas de côté, et le stylo et l\'œil de chaque modèle restent atteignables à la souris (rien ne les recouvre)',
    !summary.panel.scrollsSideways && summary.entries.every(e => e.edit.onTop && e.eye.onTop), { scrollsSideways: summary.panel.scrollsSideways, covered: summary.entries.filter(e => !e.edit.onTop || !e.eye.onTop).map(e => e.name) });
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
  const imposedSummary = await summaryTags(page);
  check(where + 'sous « ' + T.landscape + ' » imposé, le résumé n\'écrit « ' + T.tagLandscape + ' » nulle part (tous les modèles ont la page du macro-modèle)', imposedSummary.entries.length === 3 && imposedSummary.entries.every(e => e.tags.length === 0), imposedSummary.entries.map(e => [e.name, tagsOf(e)]));
  const landscapeSheets = await reading(page);
  check(where + 'la Lecture n\'a plus qu\'une feuille, paysage, avec les trois modèles dessus (le sens imposé, comme avant)', senses(landscapeSheets) === 'L' && /garde/.test(landscapeSheets[0].text) && /annexe/.test(landscapeSheets[0].text) && /dernière/.test(landscapeSheets[0].text), landscapeSheets);
  await chooseRow(page, 'auto');
  const back = await measure(page);
  check(where + '« ' + T.auto + ' » (vrai clic) le rétablit : bouton non allumé, ligne cochée, libellé d\'avant', back.button.pressed === 'false' && !back.button.active && back.button.data === 'auto' && back.button.label === T.buttonAuto && back.checked === 'auto,A4', { button: back.button, checked: back.checked });
  const backSummary = await summaryTags(page);
  check(where + 'avec « ' + T.auto + ' » rétabli, le résumé écrit de nouveau « ' + T.tagLandscape + ' » à droite de l\'annexe en paysage', tagsOf(entryOf(backSummary, 'Annexe large')) === T.tagLandscape && tagsOf(entryOf(backSummary, 'Garde sens')) === '' && tagsOf(entryOf(backSummary, 'Dernière sens')) === '', backSummary.entries.map(e => [e.name, tagsOf(e)]));
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
  const portraitSummary = await summaryTags(page);
  check(where + 'sous « ' + T.portrait + ' » imposé, le résumé n\'écrit pas non plus « ' + T.tagLandscape + ' » (l\'annexe a pourtant sa propre page en paysage)', portraitSummary.entries.length === 3 && portraitSummary.entries.every(e => e.tags.length === 0), portraitSummary.entries.map(e => [e.name, tagsOf(e)]));
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

// Les étiquettes devant un nom très long (une Grille en paysage porte les deux) : le nom se coupe par « … » et reste lisible en entier à l'info-bulle ; « Grille » et « Paysage » ne se coupent jamais, restent entre le nom et
// le stylo ; le panneau ne défile pas de côté. Largeur du panneau : celle de l'ouverture (700 px, puis 360 px).
async function runLayout(w, lang) {
  const page = w.page;
  const T = TEXTS[lang];
  const width = page.viewportSize().width;
  const where = width + ' px, ' + (lang === 'en' ? 'anglais' : 'français') + ' : ';
  const longName = 'Grille de présentation des résultats du trimestre pour la direction régionale';
  await composeFrom(page, 'Macro nom long', [
    { name: 'Garde longue', html: '<p>Garde</p>' },
    { name: longName, html: GRID_HTML, margins: LANDSCAPE_PAGE, type: 'grille' },
    { name: 'Grille simple', html: GRID_HTML, type: 'grille' },
    { name: 'Annexe large', html: '<p>Large</p>', margins: LANDSCAPE_PAGE },
  ]);
  const summary = await summaryTags(page);
  const byName = name => summary.entries.find(e => e.name === name);
  const got = JSON.stringify(summary.entries.map(e => [e.name, tagsOf(e)]));
  const wanted = JSON.stringify([['Garde longue', ''], [longName, T.tagGrid + '+' + T.tagLandscape], ['Grille simple', T.tagGrid], ['Annexe large', T.tagLandscape]]);
  check(where + 'une Grille en paysage porte « ' + T.tagGrid + ' » puis « ' + T.tagLandscape + ' », une Grille en portrait « ' + T.tagGrid + ' », un document en paysage « ' + T.tagLandscape + ' », le document en portrait rien', got === wanted, { got, wanted });
  check(where + 'toutes les étiquettes sont entre le nom et le stylo, dans leur ligne et dans le panneau, entières, de la police du nom, et rien ne les recouvre', summary.entries.every(e => tagsWellPlaced(e, summary.view)), summary.entries.map(e => [e.name, e.tags.map(t => [t.box.left, t.box.right, t.cut, t.onTop])]));
  const long = byName(longName);
  check(where + 'le nom très long se coupe par « … » mais reste visible (au moins 24 px) et se lit en entier à l\'info-bulle ; ses étiquettes ne sont pas coupées',
    long.nameCut && long.nameBox.w >= 24 && long.tags.length === 2 && long.tags.every(t => !t.cut), { nameCut: long.nameCut, nameW: long.nameBox.w, tags: long.tags.map(t => [t.text, t.cut]) });
  const title = await page.evaluate(name => { const el = Array.from(document.querySelectorAll('.macro-summary-model-name')).find(n => n.textContent === name); return el ? el.title : null; }, longName);
  check(where + 'l\'info-bulle du nom coupé est le nom en entier', title === longName, title);
  check(where + 'la ligne du modèle reste dans sa ligne du résumé (stylo et œil compris), le panneau ne défile pas de côté et rien ne recouvre le stylo ni l\'œil',
    !summary.panel.scrollsSideways && summary.entries.every(e => e.box.right <= e.partBox.right + 0.5 && e.edit.box.right <= e.partBox.right + 0.5 && e.eye.box.right <= e.partBox.right + 0.5 && e.edit.onTop && e.eye.onTop && !e.edit.underPill && !e.eye.underPill),
    { scrollsSideways: summary.panel.scrollsSideways, view: summary.view, out: summary.entries.filter(e => e.box.right > e.partBox.right + 0.5 || !e.edit.onTop || !e.eye.onTop || e.edit.underPill || e.eye.underPill).map(e => [e.name, e.box.right, e.partBox.right, e.edit.box, e.edit.onTop, e.edit.hit, e.edit.underPill, e.eye.box, e.eye.onTop, e.eye.hit, e.eye.underPill]) });
  const contrasts = summary.entries.flatMap(e => e.tags.map(t => [e.name + ' / ' + t.text, ratio(t.color, t.background)]));
  check(where + 'chaque étiquette a le contraste de la charte (>= 4,5:1)', contrasts.length === 4 && contrasts.every(c => c[1] >= 4.5), contrasts);
}

await scenario('1. Clair, français', {}, w => run(w, 'fr', 'light'));
await scenario('2. Sombre, anglais', { theme: 'dark', lang: 'en' }, w => run(w, 'en', 'dark'));
await scenario('3. Étiquettes et nom très long, 700 px, français', {}, w => runLayout(w, 'fr'));
await scenario('4. Étiquettes et nom très long, 360 px, anglais', { width: 360, lang: 'en' }, w => runLayout(w, 'en'));

await stopServer();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
