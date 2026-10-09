#!/usr/bin/env node
// Mention « les marges du macro-modèle priment » de l'onglet Marges (js/settings.js:setMacroMode) à la VRAIE souris, dans le panneau de 700x400 d'Antoine - sa demande du 09/10 : « peut-être indiquer
// quelque part dans l'UI, peut-être dans l'onglet Marges d'un macro-modèle, que ça prend le pas sur les marges des modèles assemblés ». Ce que dev-tests/scenarios-macro-modeles.js ne peut pas voir depuis la page :
//   1) avec un modèle simple : Réglages (vrai clic), onglet Marges (vrai clic) : la mention ne prend aucune place (cachée, pas retirée), les quatre champs sont à l'écran, entiers ;
//   2) avec un macro-modèle chargé : la mention est là, sous l'introduction et au-dessus des champs, entière (aucune ligne coupée, aucun débord), dans la fenêtre et dans l'écran, les quatre champs restent
//      à l'écran et saisissables (vrai clic, vraie frappe : la mention ne les recouvre pas), le texte a le contraste de la charte (F5, >= 4,5:1) ;
//   3) le thème sombre et l'anglais (mêmes mesures) ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « macroMarginsNoteMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-macro-margins-note-mouse.mjs
// MACRO_MARGINS_NOTE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.MACRO_MARGINS_NOTE_PORT || 8997);
const SHOTS = process.env.MACRO_MARGINS_NOTE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Contrastes (WCAG) : même calcul que dev-tests/verify-macro-submodel-mouse.mjs.
const rgbOf = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (fg, bg) => { const a = rgbOf(fg), b = rgbOf(bg); if (!a || !b) return 0; const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };

const TEXTS = {
  fr: 'Macro-modèle : ces marges priment sur celles des modèles assemblés, dans l’aperçu comme dans les exports. Les marges propres à un modèle ne servent que lorsqu’on l’ouvre seul.',
  en: 'Macro template: these margins take precedence over those of the assembled templates, in the preview and in the exports. A template’s own margins only apply when it is opened on its own.',
};

// Un macro-modèle composé comme par une personne : deux modèles, puis la VRAIE fenêtre de composition (page de garde = le premier), enregistrée et chargée.
async function loadMacro(page) {
  await page.evaluate(async () => {
    const cover = await Templates.save(null, 'Garde marges', '<p>Page de garde</p>', '', null, null, 'document', null);
    await Templates.save(null, 'Annexe marges', '<p>Autre page</p>', '', null, null, 'document', null);
    await Templates.loadAll();
    MacroEditor.openModal(null);
    document.getElementById('macro-editor-name').value = 'Macro marges';
    const select = document.getElementById('macro-editor-cover');
    select.value = String(cover.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('macro-editor-save').click();
  });
  await page.waitForFunction(() => { const s = document.getElementById('macro-summary-container'); return !!s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(600);
}

// Ce que la personne voit dans l'onglet Marges, mesuré dans la page.
const measure = page => page.evaluate(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const note = document.getElementById('settings-margins-macro-note');
  const panel = note.closest('.settings-panel');
  const box = document.querySelector('#settings-modal .pp-modal-box');
  const intro = panel.querySelector('.settings-panel-intro');
  const grid = panel.querySelector('.settings-margins-grid');
  const inputs = ['top', 'right', 'bottom', 'left'].map(side => document.getElementById('settings-margin-' + side));
  const bgOf = el => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.99)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const style = getComputedStyle(note);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  return {
    shown: !note.hidden && style.display !== 'none' && note.getBoundingClientRect().height > 0,
    text: note.textContent,
    note: rect(note), box: rect(box), intro: rect(intro), grid: rect(grid),
    inputs: inputs.map(rect),
    clipped: note.scrollHeight > note.clientHeight + 1 || note.scrollWidth > note.clientWidth + 1,
    lines: Math.round(note.getBoundingClientRect().height / lineHeight),
    color: style.color, background: bgOf(note),
    view: { w: innerWidth, h: innerHeight },
  };
});

async function openMargins(page) {
  await click(page, '#v2-btn-settings');
  await sleep(500);
  await click(page, '.settings-tab[data-settings-tab="pageMargins"]');
  await sleep(400);
}
async function closeSettings(page) {
  await click(page, '#settings-close');
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

// Un modèle simple d'abord, puis le macro-modèle : mêmes mesures dans la langue et le thème donnés.
async function run(w, lang, theme) {
  const page = w.page;
  const where = (theme === 'dark' ? 'sombre' : 'clair') + ', ' + (lang === 'en' ? 'anglais' : 'français') + ' : ';
  await openMargins(page);
  const plain = await measure(page);
  check(where + 'modèle simple : la mention ne prend aucune place', !plain.shown && plain.note.h === 0, { shown: plain.shown, h: plain.note.h });
  check(where + 'modèle simple : les quatre champs sont entiers à l\'écran', plain.inputs.every(r => r.top >= plain.box.top && r.bottom <= plain.box.bottom && r.bottom <= plain.view.h), plain.inputs);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/simple-${theme}-${lang}.png` });
  await closeSettings(page);

  await loadMacro(page);
  await openMargins(page);
  const m = await measure(page);
  check(where + 'macro-modèle : la mention est affichée', m.shown, { shown: m.shown });
  check(where + 'macro-modèle : le texte est celui de la langue', m.text === TEXTS[lang], m.text);
  check(where + 'macro-modèle : la mention est entière (aucune ligne coupée, aucun débord)', !m.clipped && m.note.right <= m.box.right && m.note.left >= m.box.left, { clipped: m.clipped, note: m.note, box: m.box });
  check(where + 'macro-modèle : la mention est dans la fenêtre et dans l\'écran', m.note.top >= m.box.top && m.note.bottom <= m.box.bottom && m.note.bottom <= m.view.h, { note: m.note, box: m.box, view: m.view });
  check(where + 'macro-modèle : sous l\'introduction et au-dessus des champs', m.note.top >= m.intro.bottom - 0.5 && m.note.bottom <= m.grid.top + 0.5, { intro: m.intro, note: m.note, grid: m.grid });
  check(where + 'macro-modèle : les quatre champs restent entiers à l\'écran', m.inputs.every(r => r.top >= m.box.top && r.bottom <= m.box.bottom && r.bottom <= m.view.h), { inputs: m.inputs, box: m.box });
  const contrast = ratio(m.color, m.background);
  check(where + 'macro-modèle : le texte a le contraste de la charte (>= 4,5:1)', contrast >= 4.5, { contrast, color: m.color, background: m.background });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/macro-${theme}-${lang}.png` });
  // Les champs restent saisissables : un vrai clic dans « Haut », une vraie frappe, la valeur du brouillon change (la mention ne recouvre rien).
  await click(page, '#settings-margin-top');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('33');
  await sleep(300);
  const typed = await page.evaluate(() => ({ field: document.getElementById('settings-margin-top').value, draft: PageLayout.getMarginsMm().top }));
  check(where + 'macro-modèle : « Haut » se saisit à la vraie souris et au vrai clavier', typed.field === '33' && Math.abs(typed.draft - 33) < 0.01, typed);
  await closeSettings(page);
}

await scenario('1. Clair, français', {}, w => run(w, 'fr', 'light'));
await scenario('2. Sombre, anglais', { theme: 'dark', lang: 'en' }, w => run(w, 'en', 'dark'));

await stopServer();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
