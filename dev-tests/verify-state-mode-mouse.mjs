#!/usr/bin/env node
// Le mode « Identité de l'État » (js/state-mode.js, section de Réglages > Thème, fenêtre d'activation) à la VRAIE souris et au vrai clavier, dans le panneau de 700x400 de Grist, HÉBERGÉ (GFS simulé,
// dev-tests/gfs-stub.js), en français clair puis en anglais sombre. Ce que scenarios-state-mode.js ne voit pas depuis la page :
//   1) sans l'extension « etat » : la section est dans l'onglet Thème, entière dans la fenêtre des Réglages, son bouton GRISÉ (visible, atteignable, jamais retiré) avec la raison dans la phrase ; un vrai clic
//      demande à GFS d'installer « etat » et n'ouvre aucune fenêtre ; tous ses textes sont lisibles (>= 4,5:1) ;
//   2) l'extension cochée chez GFS pendant que Réglages est ouvert : la section se met à jour sans se fermer, le bouton se dégrise ;
//   3) cas A (instance et adresse en .gouv.fr) : un vrai clic ouvre la fenêtre PAR-DESSUS Réglages, entière dans le panneau, ses deux boutons au premier plan, les deux constats cochés, pas d'avertissement,
//      « Activer le mode » grisé tant que la qualité et la case manquent ; la déclaration à la souris allume le mode (la section le dit, le choix est gardé) ;
//   4) cas B (rien ne reconnaît la personne) : l'avertissement ambre se lit (>= 4,5:1) et la déclaration reste possible ;
//   5) cas C (« une autre structure ») : la case disparaît, la phrase s'affiche, « Activer le mode » reste grisé, Échap ferme sans rien garder ;
//   6) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « stateModeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-state-mode-mouse.mjs
// STATE_MODE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, stopServer, sleep, click } from './load-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.STATE_MODE_PORT || 9058);
const SHOTS = process.env.STATE_MODE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'EtatClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const KEY = 'pp_etat_declaration';
const MODAL = '#pp-etat-modal';
const OK = MODAL + ' .var-modal-primary';
const CANCEL = MODAL + ' .pp-modal-actions button:not(.var-modal-primary)';

let total = 0;
let failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const WORDS = {
  fr: { unavailable: 'Indisponible', off: 'Éteint', on: 'Activé', activate: 'Activer…', deactivate: 'Éteindre', okButton: 'Activer le mode', title: 'Identité de l’État (DSFR)', needsExt: 'extension « Identité de l’État »', warn: 'n’a pas pu reconnaître', other: 'n’est pas pour vous' },
  en: { unavailable: 'Unavailable', off: 'Off', on: 'On', activate: 'Turn on…', deactivate: 'Turn off', okButton: 'Turn the mode on', title: 'French State identity (DSFR)', needsExt: '“State identity” extension', warn: 'could not recognize', other: 'is not for you' },
};

const dialogOpen = page => page.evaluate(() => { const ov = document.getElementById('pp-etat-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; });
async function waitDialog(page, shown = true, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await dialogOpen(page)) === shown) return true; await sleep(100); }
  return false;
}
const setExtensions = async (page, list) => {
  await page.evaluate(l => window.__gfsStub.setExtensions(l), list);
  const want = list.includes('etat');
  for (let i = 0; i < 40; i++) { if ((await page.evaluate(() => Extensions.isActive('etat'))) === want) break; await sleep(60); }
  await sleep(200);
};
// Les constats fabriqués (la lecture réelle de l'hôte est dans dev-tests/unit-grist-api-core.mjs) : posés dans la page, relus à chaque ouverture de la fenêtre.
const setSignals = (page, host, email) => page.evaluate(({ host, email }) => {
  GristAPI.getInstanceHost = async () => host;
  GristAPI.peekCurrentUser = () => ({ email, name: '' });
}, { host, email });
const stored = page => page.evaluate(k => PersonStore.get(k), KEY);
const clearStore = page => page.evaluate((k) => { PersonStore.remove(k); StateMode.syncSettings(); }, KEY);

// La personne clique dans son texte avant d'aller aux Réglages : le menu qu'elle vient d'utiliser se referme quand le focus part.
async function park(page) {
  await click(page, '.tiptap p');
  await sleep(250);
}
async function openThemeTab(page) {
  await park(page);
  await click(page, '#v2-btn-settings');
  await sleep(250);
  await click(page, '.settings-tab[data-settings-tab="theme"]');
  await sleep(200);
  await page.evaluate(() => document.getElementById('settings-etat-button').scrollIntoView({ block: 'center' }));
  await sleep(200);
}
async function closeSettings(page) { await click(page, '#settings-close'); await sleep(200); }

const PAGE_HELPERS = `
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = c => { const [r, g, b] = (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100; };
`;
// La section de Réglages : où elle est, son bouton (grisé ? atteignable ? à quelle opacité), ses textes et leur contraste.
const sectionState = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const box = document.querySelector('#settings-modal .modal-content, #settings-modal .pp-modal-box') || document.getElementById('settings-modal');
  const boxRect = box.getBoundingClientRect();
  const button = document.getElementById('settings-etat-button');
  const br = button.getBoundingClientRect();
  const top = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
  const texts = ['settings-etat-title', 'settings-etat-state', 'settings-etat-hint'].map(id => document.getElementById(id)).concat(Array.from(document.querySelectorAll('[aria-labelledby="settings-etat-title"] .settings-panel-intro')));
  return {
    inTheme: !!button.closest('[data-settings-panel="theme"]'),
    inside: br.left >= boxRect.left - 1 && br.right <= boxRect.right + 1 && br.top >= boxRect.top - 1 && br.bottom <= boxRect.bottom + 1,
    reachable: !!top && button.contains(top), text: button.textContent.trim(), kind: button.dataset.kind, ariaDisabled: button.getAttribute('aria-disabled'), disabledProp: button.disabled,
    opacity: Number(getComputedStyle(button).opacity), state: document.getElementById('settings-etat-state').textContent, hint: document.getElementById('settings-etat-hint').textContent, title: button.title,
    lowest: texts.map(el => ({ t: el.textContent.trim().slice(0, 30), c: ratio(getComputedStyle(el).color, opaque(el)) })).filter(x => x.c < 4.5),
  };
})()`);
// La fenêtre d'activation : sa place dans le panneau, ses boutons au premier plan, les constats, l'avertissement, la case, et la lisibilité de chaque texte montré.
const windowState = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const ov = document.getElementById('pp-etat-modal');
  const box = ov.querySelector('.pp-modal-box');
  const body = ov.querySelector('.pp-modal-body');
  const b = box.getBoundingClientRect();
  const shownNode = el => !!el && el.getBoundingClientRect().width > 0 && !el.closest('[hidden]');
  const onTop = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (el === t || el.contains(t)); };
  const ok = ov.querySelector('.var-modal-primary');
  const cancel = ov.querySelector('.pp-modal-actions button:not(.var-modal-primary)');
  const texts = Array.from(ov.querySelectorAll('.pp-etat-lead, .pp-etat-heading, .pp-etat-signal-label, .pp-etat-signal-detail, .pp-etat-small, .pp-etat-warn, .pp-etat-info, .pp-etat-legend, .pp-etat-check, .pp-etat-rules-label, .pp-etat-link, h3')).filter(shownNode);
  const dots = Array.from(ov.querySelectorAll('.pp-etat-dot')).filter(shownNode);
  const settings = document.getElementById('settings-modal');
  return {
    inPanel: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, boxH: Math.round(b.height), scrollTop: body.scrollTop, scrolls: body.scrollHeight > body.clientHeight + 1,
    title: (ov.querySelector('h3') || {}).textContent || '', okSeen: shownNode(ok) && onTop(ok), cancelSeen: shownNode(cancel) && onTop(cancel), okDisabled: !!ok.disabled, okText: ok.textContent,
    states: Array.from(ov.querySelectorAll('.pp-etat-signal')).map(r => r.dataset.state), warn: shownNode(ov.querySelector('.pp-etat-warn')), warnText: ov.querySelector('.pp-etat-warn').textContent,
    info: shownNode(ov.querySelector('.pp-etat-info')), infoText: ov.querySelector('.pp-etat-info').textContent, consentShown: shownNode(ov.querySelector('#pp-etat-consent')), consent: ov.querySelector('#pp-etat-consent').checked,
    checkedQuality: Array.from(ov.querySelectorAll('input[name="pp-etat-quality"]')).filter(r => r.checked).map(r => r.value), qualities: ov.querySelectorAll('input[name="pp-etat-quality"]').length,
    aboveSettings: !settings || getComputedStyle(settings).display === 'none' || Number(getComputedStyle(ov).zIndex || 0) >= Number(getComputedStyle(settings).zIndex || 0),
    links: Array.from(ov.querySelectorAll('.pp-etat-link')).filter(shownNode).map(a => a.getAttribute('href')),
    lowest: texts.map(el => ({ t: el.textContent.trim().slice(0, 30), c: ratio(getComputedStyle(el).color, opaque(el)) })).filter(x => x.c < 4.5),
    dotsLow: dots.map(el => ({ t: el.textContent, c: ratio(getComputedStyle(el).color, opaque(el)) })).filter(x => x.c < 3), texts: texts.length,
  };
})()`);
// Amène un élément de la fenêtre dans la partie visible du corps (comme la molette), puis le rend cliquable à la vraie souris.
async function reveal(page, selector) {
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'nearest' }), selector);
  await sleep(120);
}
async function waitSignals(page) {
  for (let i = 0; i < 100; i++) {
    const done = await page.evaluate(() => { const rows = document.querySelectorAll('#pp-etat-modal .pp-etat-signal'); return rows.length === 2 && Array.from(rows).every(r => r.dataset.state !== 'checking'); });
    if (done) return;
    await sleep(60);
  }
}

async function run(lang, theme) {
  const tag = lang === 'fr' ? 'FR clair' : 'EN sombre';
  const words = WORDS[lang];
  let w = null;
  try {
    w = await open({
      spec: SPEC, port: PORT, settleMs: 1500, theme, lang,
      onPage: async (page) => {
        await page.addInitScript({ path: join(ROOT, 'dev-tests', 'gfs-stub.js') });
        await page.addInitScript(() => { history.replaceState(null, '', location.pathname + '?gfs=0'); });
      },
    });
    const page = w.page;
    await page.evaluate(() => GfsLink.ready.then(() => Extensions.loadAll()));

    // ---- 1) Sans l'extension : tout grisé ----
    await setExtensions(page, ['graphique']);
    await setSignals(page, 'grist.numerique.gouv.fr', 'agent@interieur.gouv.fr');
    await clearStore(page);
    await openThemeTab(page);
    let s = await sectionState(page);
    check(tag + ' : sans l\'extension, la section est dans l\'onglet Thème, entière dans Réglages, son bouton atteignable', s.inTheme && s.inside && s.reachable, { inTheme: s.inTheme, inside: s.inside, reachable: s.reachable });
    check(tag + ' : le bouton est grisé (aria-disabled, opacité réduite, jamais retiré ni `disabled`) et dit « ' + words.activate + ' »', s.ariaDisabled === 'true' && !s.disabledProp && s.opacity < 0.9 && s.text === words.activate && s.kind === 'unavailable', s);
    check(tag + ' : l\'état dit « ' + words.unavailable + ' », la phrase nomme l\'extension et la raison est au survol', s.state === words.unavailable && s.hint.includes(words.needsExt) && s.title === s.hint, { state: s.state, hint: s.hint, title: s.title });
    check(tag + ' : tous les textes de la section sont lisibles (>= 4,5:1)', s.lowest.length === 0, s.lowest);
    await shot(page, tag.replace(' ', '-') + '-1-grise');
    await page.evaluate(() => { window.__gfsStub.calls.length = 0; });
    await click(page, '#settings-etat-button');
    for (let i = 0; i < 40 && !(await page.evaluate(() => window.__gfsStub.calls.some(c => c.nom === 'installer'))); i++) await sleep(60);
    const call = await page.evaluate(() => window.__gfsStub.calls.find(c => c.nom === 'installer') || null);
    check(tag + ' : un vrai clic demande à GFS d\'installer « etat » et n\'ouvre aucune fenêtre', !!call && call.args && call.args.extension === 'etat' && !(await dialogOpen(page)), { call });

    // ---- 2) L'extension cochée chez GFS pendant que Réglages est ouvert ----
    await setExtensions(page, ['graphique', 'etat']);
    s = await sectionState(page);
    check(tag + ' : l\'extension cochée chez GFS dégrise le bouton sans fermer Réglages (« ' + words.off + ' », « ' + words.activate + ' »)', s.ariaDisabled === 'false' && s.opacity === 1 && s.state === words.off && s.text === words.activate && s.kind === 'off' && s.title === '', s);
    check(tag + ' : tous les textes de la section restent lisibles', s.lowest.length === 0, s.lowest);

    // ---- 3) Cas A : instance et adresse en .gouv.fr ----
    await click(page, '#settings-etat-button');
    check(tag + ' : cas A - un vrai clic ouvre la fenêtre d\'activation', await waitDialog(page));
    await waitSignals(page);
    await sleep(200);
    let d = await windowState(page);
    check(tag + ' : cas A - entière dans le panneau 700x400, ses deux boutons au premier plan, par-dessus Réglages, titre « ' + words.title + ' »', d.inPanel && d.okSeen && d.cancelSeen && d.aboveSettings && d.title === words.title, { inPanel: d.inPanel, ok: d.okSeen, cancel: d.cancelSeen, above: d.aboveSettings, title: d.title, h: d.boxH });
    check(tag + ' : cas A - les deux constats sont cochés, pas d\'avertissement, quatre qualités, aucune cochée d\'avance, case vide', JSON.stringify(d.states) === '["ok","ok"]' && !d.warn && d.qualities === 4 && d.checkedQuality.length === 0 && !d.consent, d);
    check(tag + ' : cas A - « ' + words.okButton + ' » grisé tant que la déclaration manque', d.okDisabled && d.okText === words.okButton, { disabled: d.okDisabled, text: d.okText });
    check(tag + ' : cas A - tous les textes de la fenêtre sont lisibles (>= 4,5:1) et les pastilles >= 3:1', d.texts > 0 && d.lowest.length === 0 && d.dotsLow.length === 0, { lowest: d.lowest, dots: d.dotsLow });
    check(tag + ' : cas A - les deux liens des règles sont là (info.gouv.fr et le texte du DSFR)', d.links.length === 2 && /^https:\/\/www\.info\.gouv\.fr\//.test(d.links[0]) && /GouvernementFR\/dsfr/.test(d.links[1]), d.links);
    await shot(page, tag.replace(' ', '-') + '-2-cas-a');
    await reveal(page, '#pp-etat-quality-operateur');
    await click(page, '#pp-etat-quality-operateur');
    await reveal(page, '#pp-etat-consent');
    d = await windowState(page);
    check(tag + ' : cas A - la qualité seule ne suffit pas (« ' + words.okButton + ' » reste grisé)', d.okDisabled && d.checkedQuality.join() === 'operateur', d);
    await click(page, '#pp-etat-consent');
    d = await windowState(page);
    check(tag + ' : cas A - qualité et case : « ' + words.okButton + ' » se dégrise', !d.okDisabled && d.consent, { disabled: d.okDisabled, consent: d.consent });
    await click(page, OK);
    check(tag + ' : cas A - un vrai clic sur « ' + words.okButton + ' » ferme la fenêtre', await waitDialog(page, false));
    await sleep(200);
    const kept = JSON.parse((await stored(page)) || 'null');
    check(tag + ' : cas A - la déclaration est gardée (version, qualité, date, allumé)', !!kept && kept.v === 1 && kept.quality === 'operateur' && kept.on === true && /^\d{4}-\d\d-\d\d$/.test(kept.date), kept);
    s = await sectionState(page);
    check(tag + ' : cas A - la section dit « ' + words.on + ' » et propose « ' + words.deactivate + ' », Réglages est resté ouvert', s.state.startsWith(words.on) && s.text === words.deactivate && s.kind === 'on' && s.inside, s);
    check(tag + ' : cas A - tous les textes de la section restent lisibles allumée', s.lowest.length === 0, s.lowest);
    await shot(page, tag.replace(' ', '-') + '-3-allume');
    await click(page, '#settings-etat-button');
    await sleep(200);
    s = await sectionState(page);
    check(tag + ' : un vrai clic sur « ' + words.deactivate + ' » éteint le mode, la déclaration reste gardée', s.kind === 'declared' && !(await dialogOpen(page)) && JSON.parse(await stored(page)).on === false, s);

    // ---- 4) Cas B : rien ne reconnaît la personne ----
    await clearStore(page);
    await setSignals(page, 'docs.getgrist.com', '');
    await click(page, '#settings-etat-button');
    check(tag + ' : cas B - la fenêtre s\'ouvre', await waitDialog(page));
    await waitSignals(page);
    await sleep(200);
    d = await windowState(page);
    check(tag + ' : cas B - les constats disent « hors .gouv.fr » et « illisible », l\'avertissement ambre paraît (« ' + words.warn + ' »)', JSON.stringify(d.states) === '["no","unknown"]' && d.warn && d.warnText.includes(words.warn), { states: d.states, warn: d.warn });
    check(tag + ' : cas B - tous les textes, avertissement compris, sont lisibles (>= 4,5:1)', d.texts > 0 && d.lowest.length === 0 && d.dotsLow.length === 0, { lowest: d.lowest, dots: d.dotsLow });
    check(tag + ' : cas B - la fenêtre tient dans le panneau, boutons au premier plan', d.inPanel && d.okSeen && d.cancelSeen, { inPanel: d.inPanel, ok: d.okSeen, cancel: d.cancelSeen });
    await shot(page, tag.replace(' ', '-') + '-4-cas-b');
    await reveal(page, '#pp-etat-quality-prestataire');
    await click(page, '#pp-etat-quality-prestataire');
    await reveal(page, '#pp-etat-consent');
    await click(page, '#pp-etat-consent');
    await click(page, OK);
    check(tag + ' : cas B - la déclaration est possible malgré l\'avertissement : le mode s\'allume', (await waitDialog(page, false)) && JSON.parse(await stored(page)).quality === 'prestataire', await stored(page));

    // ---- 5) Cas C : une autre structure ----
    await clearStore(page);
    await setSignals(page, 'grist.numerique.gouv.fr', 'agent@interieur.gouv.fr');
    await click(page, '#settings-etat-button');
    check(tag + ' : cas C - la fenêtre s\'ouvre', await waitDialog(page));
    await waitSignals(page);
    await reveal(page, '#pp-etat-quality-autre');
    await click(page, '#pp-etat-quality-autre');
    await sleep(150);
    d = await windowState(page);
    check(tag + ' : cas C - « une autre structure » : la phrase paraît (« ' + words.other + ' »), la case disparaît, « ' + words.okButton + ' » reste grisé', d.info && d.infoText.includes(words.other) && !d.consentShown && d.okDisabled, { info: d.info, consent: d.consentShown, disabled: d.okDisabled });
    check(tag + ' : cas C - tous les textes sont lisibles (>= 4,5:1)', d.lowest.length === 0, d.lowest);
    await shot(page, tag.replace(' ', '-') + '-5-cas-c');
    await page.keyboard.press('Escape');
    check(tag + ' : cas C - Échap ferme sans rien garder, le mode reste éteint', (await waitDialog(page, false)) && (await stored(page)) === null && (await sectionState(page)).kind === 'off', await stored(page));
    await closeSettings(page);
    check(tag + ' : aucune erreur de page', realErrors(w).length === 0, realErrors(w));
  } catch (e) {
    check(tag + ' : le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    if (w) await w.close();
  }
}

try {
  await run('fr', 'light');
  await run('en', 'dark');
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
