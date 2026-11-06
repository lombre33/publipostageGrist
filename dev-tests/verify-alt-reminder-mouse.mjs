#!/usr/bin/env node
// Le rappel « images sans texte alternatif » à l'export (js/alt-reminder.js, réglage Réglages > Thème > Accessibilité, js/settings.js, js/main.js:withExportLock) à la VRAIE souris et au vrai clavier,
// dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre. Ce que scenarios-alt-text.js ne voit pas depuis la page :
//  1) la section « Accessibilité » est dans l'onglet Thème, entière dans la fenêtre des Réglages, sa case atteignable à la souris, éteinte au départ, ses textes lisibles (>= 4,5:1) ; un vrai clic
//     la coche et le choix est gardé (pp_alt_reminder) ; la fenêtre se ferme ;
//  2) éteint, le bouton Exporter en Word rend le fichier sans rien demander ;
//  3) allumé, le même bouton ouvre la question : titre, nombre d'images, trois boutons entiers dans le panneau, atteignables et lisibles ; « Annuler » n'exporte rien et le coin d'état dit « Export
//     annulé » ; « Exporter quand même » rend le .docx ; « Décrire la première » n'exporte rien, sélectionne l'image et ouvre la fenêtre du texte alternatif ;
//  4) le PDF ne pose pas la question (il n'écrit pas de texte alternatif) ;
//  5) un lot « toutes les lignes (ZIP) » en Word ne la pose qu'UNE fois pour ses deux lignes ; « Annuler » arrête tout le lot, sans archive ;
//  6) un document dont toutes les images sont décrites n'en pose aucune ; décocher la case rend le silence.
// Lancé par run-headless.mjs (groupe Node « altReminderMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-alt-reminder-mouse.mjs
// ALT_REMINDER_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { open, sleep, click, chooseExportType, chooseExportLines, fire, confirmDialog, status } from './load-lib.mjs';

const PORT = Number(process.env.ALT_REMINDER_PORT || 9050);
const SHOTS = process.env.ALT_REMINDER_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'AltrClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const image = extra => `<img class="editor-image" src="${DATA}" style="width: 120px"${extra || ''}>`;
const TWO_MISSING = '<p>Bonjour.</p><p>' + image(' alt="Image"') + '</p><p>' + image(' alt="Le plan de la salle"') + '</p><p>' + image() + '</p>';
const DESCRIBED = '<p>Bonjour.</p><p>' + image(' alt="Le plan de la salle"') + '</p><p>' + image(' alt="" data-decorative="true"') + '</p>';
const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const download = (page, action, timeout = 60000) => Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), action()]).then(([file]) => file);
const nameOf = file => (file ? file.suggestedFilename() : null);

// Ce que la fenêtre d'une question montre : texte, boutons (place, ce qui les recouvre, contraste) et si la boîte tient dans le panneau sans défiler.
const dialogState = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-dialog-modal');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100; };
  const box = overlay.querySelector('.modal-content');
  const rect = box.getBoundingClientRect();
  const message = overlay.querySelector('.pp-dialog-message');
  const buttons = Array.from(overlay.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && b.getClientRects().length > 0).map((b) => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent.trim(), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && b.contains(top), cut: b.scrollWidth > b.clientWidth + 1, contrast: ratio(getComputedStyle(b).color, opaque(b)), focused: document.activeElement === b };
  });
  return {
    title: overlay.querySelector('h3').textContent, message: message.textContent, buttons,
    inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, scrolls: box.scrollHeight > box.clientHeight + 1,
    messageContrast: ratio(getComputedStyle(message).color, opaque(message)),
  };
});
const waitDialog = async (page, open = true) => { for (let i = 0; i < 120; i++) { const shown = await page.evaluate(() => { const o = document.getElementById('pp-dialog-modal'); return !!o && getComputedStyle(o).display !== 'none'; }); if (shown === open) return true; await sleep(50); } return false; };
const clickDialogButton = async (page, text) => {
  const pos = await page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).find(x => !x.hidden && x.textContent.trim() === label);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, text);
  if (!pos) throw new Error('bouton introuvable : ' + text);
  await page.mouse.move(pos.x - 15, pos.y); await page.mouse.move(pos.x, pos.y, { steps: 3 }); await sleep(60);
  await page.mouse.click(pos.x, pos.y);
  await sleep(200);
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const altWindowOpen = page => page.evaluate(() => { const m = document.getElementById('pp-alt-modal'); return !!m && m.style.display !== 'none'; });
const selectedImageIndex = page => page.evaluate(() => {
  const sel = EditorCore.getEditor().state.selection;
  if (!sel.node || sel.node.type.name !== 'editorImage') return -1;
  let index = -1, n = -1;
  EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') { n++; if (pos === sel.from) index = n; } });
  return index;
});
const stored = page => page.evaluate(() => PersonStore.get('pp_alt_reminder'));
const setDocument = (page, html) => page.evaluate(({ html, hf }) => { Editor.setHTML(html); Editor.setHeaderFooterData(hf); }, { html, hf: NO_HF });
const countAsked = page => page.evaluate(() => window.__reminderAsks.length);

// La personne clique dans son texte avant d'aller aux Réglages : le menu « Exporter » qu'elle vient d'utiliser reste ouvert tant que le focus y est (focus-within), il se referme quand le focus part.
const park = async (page) => {
  await click(page, '.tiptap p');
  for (let i = 0; i < 40; i++) {
    const open = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-hover-flyout')).some(f => getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().height > 0));
    if (!open) break;
    await sleep(50);
  }
  await sleep(150);
};
async function openThemeTab(page) {
  await park(page);
  await click(page, '#v2-btn-settings');
  await sleep(250);
  await click(page, '.settings-tab[data-settings-tab="theme"]');
  await sleep(200);
  await page.evaluate(() => document.getElementById('settings-alt-reminder').scrollIntoView({ block: 'center' }));
  await sleep(150);
}
const sectionState = page => page.evaluate(() => {
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100; };
  const box = document.querySelector('#settings-modal .modal-content, #settings-modal .pp-modal-box') || document.getElementById('settings-modal');
  const boxRect = box.getBoundingClientRect();
  const read = (id) => {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2);
    return { text: el.textContent.trim(), inside: r.left >= boxRect.left - 1 && r.right <= boxRect.right + 1 && r.top >= boxRect.top - 1 && r.bottom <= boxRect.bottom + 1, visible: r.width > 0 && r.height > 0, reachable: !!top && (el.contains(top) || top.contains(el)), contrast: ratio(getComputedStyle(el).color, opaque(el)) };
  };
  const input = document.getElementById('settings-alt-reminder');
  const ir = input.getBoundingClientRect();
  const topAt = document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2);
  return {
    title: read('settings-accessibility-title'), hint: read('settings-alt-reminder-hint'), labelText: input.closest('label').textContent.trim(),
    box: { inside: ir.left >= boxRect.left && ir.right <= boxRect.right && ir.top >= boxRect.top && ir.bottom <= boxRect.bottom, reachable: topAt === input, checked: input.checked },
    inTheme: !!input.closest('[data-settings-panel="theme"]'), described: input.getAttribute('aria-describedby') === 'settings-alt-reminder-hint',
  };
});
async function closeSettings(page) { await click(page, '#settings-close'); await sleep(200); }
async function toggleReminder(page, want) {
  await openThemeTab(page);
  const before = (await sectionState(page)).box.checked;
  if (before !== want) { await click(page, '#settings-alt-reminder'); await sleep(200); }

  await closeSettings(page);
}

const WORDS = {
  fr: { title: 'Images sans texte alternatif', two: '2 images n’ont pas de texte alternatif', cancel: 'Annuler', anyway: 'Exporter quand même', describe: 'Décrire la première', cancelled: 'Export annulé.', section: 'Accessibilité' },
  en: { title: 'Images without alternative text', two: '2 images have no alternative text', cancel: 'Cancel', anyway: 'Export anyway', describe: 'Describe the first one', cancelled: 'Export canceled.', section: 'Accessibility' },
};

async function run(lang, theme) {
  const tag = lang === 'fr' ? 'FR clair' : 'EN sombre';
  const words = WORDS[lang];
  console.log(`\n[${tag}] 700x400, vraie souris`);
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  const page = w.page;
  await page.evaluate(() => { const real = Dialogs.choose; window.__reminderAsks = []; Dialogs.choose = (o) => { if (/alt|Alt/.test(String(o && o.title)) || /alternat/i.test(String(o && o.title))) window.__reminderAsks.push(o.title); return real(o); }; });
  await setDocument(page, TWO_MISSING);
  await fire(page, 'AltrClients', 1);

  // 1) La section dans l'onglet Thème.
  await openThemeTab(page);
  const section = await sectionState(page);
  check('la section « ' + words.section + ' » est dans l\'onglet Thème, son titre et son texte d\'aide sont entiers dans la fenêtre, lisibles (>= 4,5:1)',
    section.inTheme && section.title.text === words.section && section.title.visible && section.title.inside && section.hint.visible && section.hint.inside && section.hint.contrast >= 4.5 && section.title.contrast >= 4.5 && section.described, section);
  check('la case est entière dans la fenêtre, atteignable à la souris, décochée au départ ; le PDF est dit hors sujet dans l\'aide', section.box.inside && section.box.reachable && section.box.checked === false && /PDF/.test(section.hint.text), section);
  await shot(page, `${lang}-1-reglages-accessibilite`);
  await closeSettings(page);

  // 2) Éteint : l'export Word rend son fichier, sans question.
  await chooseExportType(page, 'docx');
  const off = await download(page, () => click(page, '#btn-export-pdf'));
  check('éteint, Exporter en Word rend le .docx sans rien demander', /\.docx$/i.test(nameOf(off) || '') && !(await dialogState(page)) && (await countAsked(page)) === 0, { file: nameOf(off), asked: await countAsked(page) });
  await sleep(500);

  // 3) Allumé.
  await toggleReminder(page, true);
  check('un vrai clic sur la case l\'allume et le choix est gardé (pp_alt_reminder)', (await stored(page)) === 'on', await stored(page));
  const none = await download(page, async () => { await click(page, '#btn-export-pdf'); await waitDialog(page, true); }, 800);
  const asked = await dialogState(page);
  check('allumé, Exporter en Word pose la question : titre, nombre d\'images (2 : celle de l\'ancien « Image » et celle sans texte), rien n\'est téléchargé',
    !!asked && asked.title === words.title && asked.message.startsWith(words.two) && none === null, asked);
  check('la question tient dans le panneau sans défiler : trois boutons entiers, atteignables, lisibles, sans texte coupé ; le texte est lisible',
    !!asked && asked.inside && !asked.scrolls && asked.buttons.map(b => b.text).join('|') === [words.cancel, words.describe, words.anyway].join('|')
      && asked.buttons.every(b => b.inside && b.reachable && !b.cut && b.contrast >= 4.5) && asked.messageContrast >= 4.5, asked);
  check('le focus arrive sur « ' + words.describe + ' » (Entrée d\'un réflexe mène à la correction, pas à l\'export)', !!asked && asked.buttons.find(b => b.focused) && asked.buttons.find(b => b.focused).text === words.describe, asked && asked.buttons);
  await shot(page, `${lang}-2-question`);
  await clickDialogButton(page, words.cancel);
  await sleep(300);
  check('« ' + words.cancel + ' » : rien n\'est exporté et le coin d\'état le dit', !(await dialogState(page)) && (await status(page)).includes(words.cancelled), await status(page));

  const through = await download(page, async () => { await click(page, '#btn-export-pdf'); await waitDialog(page, true); await clickDialogButton(page, words.anyway); });
  check('« ' + words.anyway + ' » : le .docx est téléchargé', /\.docx$/i.test(nameOf(through) || ''), nameOf(through));
  await sleep(500);

  const describing = await download(page, async () => { await click(page, '#btn-export-pdf'); await waitDialog(page, true); await clickDialogButton(page, words.describe); }, 1200);
  await sleep(300);
  const selected = await selectedImageIndex(page);
  check('« ' + words.describe + ' » : rien n\'est exporté, la première image sans texte (la 1re : « Image » d\'avant) est sélectionnée et la fenêtre du texte alternatif s\'ouvre', describing === null && selected === 0 && (await altWindowOpen(page)), { selected, window: await altWindowOpen(page) });
  await shot(page, `${lang}-3-fenetre-du-texte-alternatif`);
  await page.keyboard.press('Escape');
  await sleep(250);
  check('Échap ferme la fenêtre du texte alternatif', !(await altWindowOpen(page)));

  // 4) Le PDF ne pose pas la question.
  await chooseExportType(page, 'pdf');
  const asksBeforePdf = await countAsked(page);
  const pdf = await download(page, () => click(page, '#btn-export-pdf'), 90000);
  check('allumé, Exporter en PDF rend le .pdf sans question (le PDF n\'écrit pas de texte alternatif)', /\.pdf$/i.test(nameOf(pdf) || '') && (await countAsked(page)) === asksBeforePdf && !(await dialogState(page)), { file: nameOf(pdf) });
  await sleep(500);

  // 5) Un lot : une seule question pour les deux lignes.
  await chooseExportType(page, 'docx');
  await chooseExportLines(page, 'zip');
  const before = await countAsked(page);
  const batch = await download(page, async () => {
    await click(page, '#btn-export-pdf');
    await confirmDialog(page);
    await waitDialog(page, true);
    await sleep(300);
    await clickDialogButton(page, words.anyway);
  }, 120000);
  const after = await countAsked(page);
  check('« Toutes les lignes (ZIP) » : la question n\'est posée qu\'UNE fois pour les deux lignes, et l\'archive est téléchargée', /\.zip$/i.test(nameOf(batch) || '') && after - before === 1, { file: nameOf(batch), asks: after - before });
  await sleep(800);
  const beforeCancel = await countAsked(page);
  const cancelledBatch = await download(page, async () => {
    await click(page, '#btn-export-pdf');
    await confirmDialog(page);
    await waitDialog(page, true);
    await sleep(300);
    await clickDialogButton(page, words.cancel);
    await sleep(1200);
  }, 3000);
  check('« ' + words.cancel + ' » sur la question d\'un lot arrête tout le lot : aucune archive, aucune seconde question, le coin d\'état le dit',
    cancelledBatch === null && (await countAsked(page)) - beforeCancel === 1 && !(await dialogState(page)) && (await status(page)).includes(words.cancelled), { asks: (await countAsked(page)) - beforeCancel, status: await status(page) });
  await chooseExportLines(page, 'one');

  // 6) Tout est décrit : silence ; décoché : silence.
  await setDocument(page, DESCRIBED);
  await fire(page, 'AltrClients', 1);
  const asksBeforeDescribed = await countAsked(page);
  const described = await download(page, () => click(page, '#btn-export-pdf'));
  check('allumé, un document dont les images sont décrites ou décoratives s\'exporte sans question', /\.docx$/i.test(nameOf(described) || '') && (await countAsked(page)) === asksBeforeDescribed && !(await dialogState(page)), { file: nameOf(described) });
  await sleep(500);
  await setDocument(page, TWO_MISSING);
  await fire(page, 'AltrClients', 1);
  await toggleReminder(page, false);
  check('décocher la case à la souris est gardé (pp_alt_reminder = off)', (await stored(page)) === 'off', await stored(page));
  const silent = await download(page, () => click(page, '#btn-export-pdf'));
  check('décochée, la case rend le silence : le même document s\'exporte sans question', /\.docx$/i.test(nameOf(silent) || '') && (await countAsked(page)) === asksBeforeDescribed && !(await dialogState(page)), { file: nameOf(silent) });

  const problems = realErrors(w);
  check('aucune erreur de page', problems.length === 0, problems);
  await w.close();
}

await run('fr', 'light');
await run('en', 'dark');
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
