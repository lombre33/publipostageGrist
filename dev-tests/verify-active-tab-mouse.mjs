#!/usr/bin/env node
// L'onglet CHOISI sous la VRAIE souris, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre : les onglets de la fenêtre Réglages et ceux de la liste « # »
// (Variables / Puces). Sous la souris, le bleu de l'onglet choisi passe sur le gris du survol : 4,02:1 en clair et 4,43:1 en sombre avant la correction du 12/10 (carte « Rendre plus lisible
// l'onglet choisi quand la souris passe dessus ? », réponse « Corriger »), sous les 4,5:1 que le widget s'impose.
//   1) Réglages : l'onglet choisi au départ, puis un autre choisi au vrai clic, sont survolés, peints de leur gris de survol, bleus, toujours soulignés (le liseré de l'onglet choisi) et lisibles (>= 4,5:1) ;
//   2) liste « # » : l'onglet choisi (Variables), puis l'autre (Puces) choisi au vrai clic, de même ;
//   3) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « activeTabMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-active-tab-mouse.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.ACTIVE_TAB_MOUSE_PORT || 9011);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const SETTINGS_TAB = name => `#settings-modal .settings-tab[data-settings-tab="${name}"]`;
const AC_TAB = name => `#autocomplete-box .ac-tab[data-tab="${name}"]`;

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Un onglet sous la souris : la souris le rejoint par la gauche (le survol repart de zéro), puis on lit ce que l'écran en montre. Le contraste de son texte se mesure sur le fond de SON survol,
// jamais sur celui de la fenêtre derrière.
async function hoveredTab(page, selector) {
  const at = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  if (!at) return { sel: selector, missing: true };
  await page.mouse.move(at.x - 25, at.y, { steps: 3 });
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await sleep(300);
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [r, g, b] = rgb(cs.color);
    const la = lum(cs.color), lb = lum(cs.backgroundColor);
    return {
      sel, text: el.textContent.trim(), hovered: el.matches(':hover'), active: el.classList.contains('active'), painted: !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor),
      blue: b > r && b > g, underlined: /inset/.test(cs.boxShadow), color: cs.color, background: cs.backgroundColor,
      contrast: Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100,
    };
  }, selector);
}
const readable = s => !s.missing && s.hovered && s.active && s.painted && s.blue && s.underlined && s.contrast >= 4.5;

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    const what = 'sous la souris : sur son gris de survol, bleu, souligné, lisible (>= 4,5:1)';

    console.log(`\n[${tag}] Les onglets des Réglages`);
    await click(page, '#v2-btn-settings');
    await sleep(700);
    const atStart = await hoveredTab(page, SETTINGS_TAB('language'));
    check(`${tag} : Réglages, l'onglet choisi au départ (« ${atStart.text} »), ${what}`, readable(atStart), atStart);
    await click(page, SETTINGS_TAB('pageMargins'));
    await sleep(300);
    const clicked = await hoveredTab(page, SETTINGS_TAB('pageMargins'));
    check(`${tag} : Réglages, l'onglet choisi au vrai clic (« ${clicked.text} »), ${what}`, readable(clicked), clicked);
    await click(page, '#settings-close');
    await sleep(500);

    console.log(`\n[${tag}] Les onglets de la liste « # »`);
    await click(page, '.tiptap p');
    await sleep(300);
    await page.keyboard.type('#');
    await sleep(900);
    const variables = await hoveredTab(page, AC_TAB('variables'));
    check(`${tag} : liste « # », l'onglet choisi au départ (« ${variables.text} »), ${what}`, readable(variables), variables);
    await click(page, AC_TAB('chips'));
    await sleep(300);
    const chips = await hoveredTab(page, AC_TAB('chips'));
    check(`${tag} : liste « # », l'onglet choisi au vrai clic (« ${chips.text} »), ${what}`, readable(chips), chips);

    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair');
  await pass('en', 'dark', 'anglais, sombre');
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
