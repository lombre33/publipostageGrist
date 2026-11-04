#!/usr/bin/env node
// La raison d'un grisé (js/lock-reasons.js) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist (~700x400) : dev-tests/scenarios-lock-reasons.js joue les cas
// DANS la page (click(), dispatchEvent) ; ici une personne survole un contrôle grisé, y appuie pour de bon et lit ce qu'elle voit : l'info-bulle (le `title` de ce qui est SOUS le pointeur,
// jamais d'un parent), le curseur « interdit », le coin d'état, et rien de plus (le document ne bouge pas, le menu du groupe grisé ne s'ouvre pas, l'appui sur la police n'ouvre pas son volet).
// Les contextes : un modèle email, un macro-modèle, une grille (barre et aperçu A4), le mode Lecture, la lecture seule par droits (réglage semé avant le démarrage, comme
// dev-tests/verify-access-rights-mouse.mjs), un bouton que le navigateur désactive (Page en email : l'info-bulle seule), le menu « Type d'export », Réglages > Raccourcis ; en français, puis en anglais.
// Lancé par run-headless.mjs (groupe Node "lockReasonsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-lock-reasons-mouse.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-lock-reasons-mouse', port: Number(process.env.LOCK_REASONS_MOUSE_PORT || 9441) });
const pause = ms => new Promise(r => setTimeout(r, ms));

// ---- gestes et lectures ---------------------------------------------------------------------------------------------------------------------------------------------
const boxOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
}, selector);
// La souris vient d'à côté et s'arrête au centre du contrôle.
async function goTo(page, selector) {
  const b = await boxOf(page, selector);
  if (!b || !b.w || !b.h) throw new Error('introuvable ou masqué : ' + selector);
  await page.mouse.move(Math.max(2, b.x - 30), Math.min(396, b.y + 45));
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await pause(350);
  return b;
}
async function pressAt(page, b) {
  await page.mouse.down();
  await page.mouse.up();
  await pause(250);
}
// Ce que la personne voit sous le pointeur : l'élément, celui qui porte l'info-bulle (le plus proche ancêtre à `title`), la raison posée, le curseur, la bulle de l'application.
const seen = (page, b) => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const tip = el.closest('[title]');
  const holder = el.closest('[data-pp-lock-reason]');
  const name = e => (e ? (e.id || e.className || e.tagName) : null);
  const tipped = holder && (holder.hasAttribute('data-tip') ? holder : holder.querySelector('[data-tip]'));
  return { under: name(el), tipHolder: name(tip), lockHolder: name(holder), sameHolder: !!tip && tip === holder, title: tip ? tip.getAttribute('title') : '', blocks: !!(holder && holder.hasAttribute('data-pp-lock-blocks')),
    cursor: getComputedStyle(el).cursor, appTipShown: tipped ? getComputedStyle(tipped, '::after').display !== 'none' : false };
}, { x: b.x, y: b.y });
const status = page => page.evaluate(() => document.getElementById('status-msg').textContent.trim());
const clearStatus = page => page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
const html = page => page.evaluate(() => Editor.getHTML());
const attr = (page, selector, name) => page.evaluate(([sel, n]) => { const el = document.querySelector(sel); return el ? el.getAttribute(n) : null; }, [selector, name]);
// Le groupe à survol ouvre sa ligne sans que la souris la quitte : elle descend dans le menu (comme hoverRow de dev-tests/load-lib.mjs) et s'arrête sur la ligne.
async function toRow(page, groupSelector, rowSelector) {
  const g = await goTo(page, groupSelector);
  await pause(450);
  const r = await boxOf(page, rowSelector);
  if (!r || !r.w || !r.h) throw new Error('ligne introuvable ou masquée : ' + rowSelector);
  const x = Math.min(Math.max(g.x, r.left + 6), r.right - 6);
  await page.mouse.move(x, g.y + 12, { steps: 2 });
  await page.mouse.move(x, r.y, { steps: 6 });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await pause(250);
  return r;
}
const clickRow = async (page, groupSelector, rowSelector) => { const r = await toRow(page, groupSelector, rowSelector); await pressAt(page, r); return r; };

// Un contrôle grisé : le survol dit pourquoi (info-bulle du contrôle lui-même, curseur « interdit », pas de seconde bulle de l'application), le vrai appui l'écrit dans le coin d'état.
// `natively` : un bouton que le navigateur désactive ne reçoit aucun clic, l'info-bulle seule (le coin d'état reste muet).
async function lockedControl(page, label, selector, reason, { natively = false, quietDocument = true, viaGroup = null } = {}) {
  const before = await html(page);
  const b = viaGroup ? await toRow(page, viaGroup, selector) : await goTo(page, selector);
  const s = await seen(page, b);
  t.check(`${label} : visible dans le panneau, le pointeur est sur le contrôle et son info-bulle dit pourquoi`, b.inside && !!s && s.sameHolder && reason.test(s.title) && s.blocks === !natively, { b, s });
  t.check(`${label} : curseur « interdit », pas de seconde info-bulle de l'application`, !!s && (natively || s.cursor === 'not-allowed') && !s.appTipShown, s);
  await clearStatus(page);
  await pressAt(page, b);
  const said = await status(page);
  if (natively) t.check(`${label} : le navigateur ne laisse pas cliquer, le coin d'état reste muet`, said === '', said);
  else t.check(`${label} : le vrai appui écrit la raison dans le coin d'état, la même que l'info-bulle`, !!s && said === s.title && reason.test(said), { said, title: s && s.title });
  if (quietDocument) t.check(`${label} : le document n'a pas bougé`, (await html(page)) === before);
  return { b, s, said };
}
// Un contrôle que le mode laisse actif ne dit rien.
async function quietControl(page, label, selector) {
  const r = await page.evaluate(sel => { const el = document.querySelector(sel); return el ? { reason: el.hasAttribute('data-pp-lock-reason'), blocks: el.hasAttribute('data-pp-lock-blocks') } : null; }, selector);
  t.check(`${label} : actif, sans raison`, !!r && !r.reason && !r.blocks, r);
}
// Nouveau modèle, à la vraie souris : « Nouvel email », « Nouvelle grille », « Nouveau document », « Nouveau macro-modèle » (sa fenêtre : un nom tapé, Enregistrer).
async function newTemplate(page, kind) {
  await clickRow(page, '#btn-new', '#v2-btn-new-' + kind);
  if (kind === 'macro') {
    await page.waitForSelector('#macro-editor-name', { state: 'visible', timeout: 5000 });
    const name = await boxOf(page, '#macro-editor-name');
    await page.mouse.click(name.x, name.y);
    await page.keyboard.type('Macro des raisons');
    const save = await boxOf(page, '#macro-editor-save');
    await page.mouse.click(save.x, save.y);
  }
  await pause(700);
  await page.mouse.move(350, 330);
}

// ---- 1) Français, une personne qui peut tout modifier ---------------------------------------------------------------------------------------------------------------------
{
  const { page } = await t.openPage({ hosted: false, lang: 'fr', seed: seedModels() });
  await newTemplate(page, 'document');
  await quietControl(page, 'document : gras', '#v2-btn-bold');
  await quietControl(page, 'document : tableau', '#v2-btn-table');

  // Un modèle email : mise en forme, groupe Titre, police, tableau ; Annuler reste libre.
  await newTemplate(page, 'email');
  await page.evaluate(() => Editor.setHTML('<p>Bonjour</p>'));
  await pause(100);
  await lockedControl(page, 'email : Gras', '#v2-btn-bold', /email/i);
  await lockedControl(page, 'email : Tableau', '#v2-btn-table', /email/i);
  await lockedControl(page, 'email : Sommaire', '#v2-btn-toc', /email/i);
  await quietControl(page, 'email : Annuler', '#v2-btn-undo');
  await quietControl(page, 'email : Lien et blocs', '#v2-btn-link');
  // Le groupe Titre grisé n'ouvre pas son menu au survol, l'appui sur la police n'ouvre pas son volet.
  {
    const b = await goTo(page, '#v2-heading-chip');
    await pause(500);
    const shut = await page.evaluate(() => ({ flyout: getComputedStyle(document.getElementById('v2-heading-flyout')).display, expanded: document.getElementById('v2-heading-chip').getAttribute('aria-expanded') }));
    t.check('email : le survol du groupe Titre grisé n\'ouvre pas son menu (aria-expanded reste « false »)', shut.flyout === 'none' && shut.expanded !== 'true', shut);
    await clearStatus(page);
    await pressAt(page, b);
    t.check('email : l\'appui sur le groupe Titre dit pourquoi et ne l\'ouvre pas', /email/i.test(await status(page)) && (await attr(page, '#v2-heading-chip', 'aria-expanded')) !== 'true');
    const font = await goTo(page, '#v2-font-chip');
    await page.mouse.down();
    const pressed = await page.evaluate(() => document.getElementById('v2-font-chip').getAttribute('aria-expanded'));
    await page.mouse.up();
    t.check('email : l\'appui sur la police grisée n\'ouvre pas son volet', font.inside && pressed !== 'true', pressed);
  }
  // Page : le bouton que le navigateur désactive (info-bulle seule).
  await lockedControl(page, 'email : bouton Page', '#btn-page-orientation', /email/i, { natively: true, quietDocument: true });

  // Une grille : la barre (tableau) et l'aperçu A4 (la case de l'étiquette).
  await newTemplate(page, 'grid');
  await lockedControl(page, 'grille : Tableau', '#v2-btn-table', /grille/i);
  await lockedControl(page, 'grille : Citation (menu « Lien et blocs »)', '#v2-btn-citation', /grille/i, { quietDocument: false, viaGroup: '#v2-blocks-group' });
  {
    const checkedBefore = await page.evaluate(() => document.getElementById('v2-toggle-a4-preview').checked);
    const r = await lockedControl(page, 'grille : Aperçu A4', '#v2-a4-toggle', /feuille/i, { quietDocument: false });
    const checkedAfter = await page.evaluate(() => document.getElementById('v2-toggle-a4-preview').checked);
    t.check('grille : le clic sur l\'aperçu A4 dit pourquoi sans changer la case', checkedBefore === checkedAfter && !!r.s, { checkedBefore, checkedAfter });
  }
  await quietControl(page, 'grille : Gras', '#v2-btn-bold');

  // Un macro-modèle : le texte et la recherche.
  await newTemplate(page, 'macro');
  await lockedControl(page, 'macro-modèle : Recherche', '#v2-btn-find', /macro-modèle/i, { quietDocument: false });
  await lockedControl(page, 'macro-modèle : Gras', '#v2-btn-bold', /macro-modèle/i, { quietDocument: false });
  await quietControl(page, 'macro-modèle : Annuler', '#v2-btn-undo');

  // Le mode Lecture : chaque bouton de la barre grisé dit « mode lecture », Édition les rend.
  await newTemplate(page, 'document');
  await page.evaluate(() => Editor.setHTML('<p>Un texte à lire</p>'));
  await pause(100);
  {
    const read = await goTo(page, '#btn-mode-read');
    await pressAt(page, read);
    await pause(500);
    await lockedControl(page, 'Lecture : Gras', '#v2-btn-bold', /lecture/i, { quietDocument: false });
    await lockedControl(page, 'Lecture : Tableau', '#v2-btn-table', /lecture/i, { quietDocument: false });
    const edit = await goTo(page, '#btn-mode-edit');
    await pressAt(page, edit);
    await pause(500);
    await quietControl(page, 'après la Lecture : Gras', '#v2-btn-bold');
  }

  // Le menu « Type d'export » : une ligne grisée dit pourquoi et ne change pas le type ; en PDF protégé, « Impression navigateur » (montrée, grisée) dit pourquoi elle ne chiffre pas.
  // Hors PDF, les trois lignes de qualité sont masquées (elles portent « PDF seulement », que personne n'y lit) : rien à survoler.
  {
    const row = type => `#v2-quality-flyout .v2-hover-row[data-export-type="${type}"]`;
    const r = await toRow(page, '#v2-btn-quality', row('pptx'));
    const s = await seen(page, r);
    t.check('Type d\'export : « PowerPoint » (grisé hors présentation) est entier dans le panneau et dit « présentation seulement »', r.inside && !!s && s.sameHolder && /présentation/i.test(s.title) && s.cursor === 'not-allowed', { r, s });
    await clearStatus(page);
    await pressAt(page, r);
    t.check('Type d\'export : le vrai clic sur « PowerPoint » écrit la raison et garde le type', /présentation/i.test(await status(page)) && (await page.evaluate(() => document.getElementById('v2-export-type').value)) === 'pdf');
    await clickRow(page, '#v2-btn-quality', row('pdfProtected'));
    const q = await toRow(page, '#v2-btn-quality', '#v2-quality-flyout .v2-hover-row[data-quality="browser-print"]');
    const sq = await seen(page, q);
    t.check('Type d\'export : en PDF protégé, « Impression navigateur » est entière dans le panneau et dit pourquoi elle n\'est pas disponible', q.inside && !!sq && sq.sameHolder && /protégé/i.test(sq.title) && sq.cursor === 'not-allowed', { q, sq });
    await clearStatus(page);
    await pressAt(page, q);
    t.check('Type d\'export : le vrai clic sur « Impression navigateur » écrit la raison et garde la qualité', /protégé/i.test(await status(page)) && (await page.evaluate(() => document.getElementById('v2-pdf-quality').value)) === 'native');
    await clickRow(page, '#v2-btn-quality', row('pdf'));
  }

  // Réglages > Raccourcis : « Par défaut » (bouton désactivé par le navigateur) dit qu'il n'y a rien à remettre.
  {
    await page.mouse.move(350, 385);   // le volet « Type d'export » encore ouvert recouvre le bouton Réglages : la souris le quitte d'abord
    await pause(500);
    const settings = await goTo(page, '#v2-btn-settings');
    await pressAt(page, settings);
    await page.waitForSelector('#settings-modal .settings-tab[data-settings-tab="shortcuts"]', { state: 'visible', timeout: 5000 });
    await pause(300);
    const tab = await goTo(page, '#settings-modal .settings-tab[data-settings-tab="shortcuts"]');
    await pressAt(page, tab);
    await page.waitForSelector('#settings-keys-list .settings-key-row', { state: 'visible', timeout: 5000 });
    await pause(300);
    await lockedControl(page, 'Raccourcis : « Tout remettre par défaut »', '#settings-keys-reset-all', /rien à remettre/i, { natively: true });
    await lockedControl(page, 'Raccourcis : « Par défaut » d\'une ligne', '#settings-keys-list .settings-key-row .settings-key-reset', /rien à remettre/i, { natively: true });
  }
  t.check('aucune boîte native ouverte pendant le parcours en français', true);
  await page.context().close();
}

// ---- 2) Français, une personne en lecture seule (droits semés avant le démarrage) --------------------------------------------------------------------------------------------
{
  const seed = `
    stub.setVariables('Clients', { Nom: 'Text' });
    stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
    stub.setVariables('Droits', { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    stub.setRows('Droits', [{ id: 1, Email: 'lecteur@exemple.fr', LectureSeule: true, Export: false, Commentaires: true }]);
    stub.setUserEmail('lecteur@exemple.fr');
    stub.state.options = { droitsAcces: { table: 'Droits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' } };
    const m = stub.state.rows.Publipostage_Modeles;
    m.id.push(1); m.Nom.push('Contrat');
    m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>');
    m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
    stub.state.nextRowId.Publipostage_Modeles = 2;`;
  const { page } = await t.openPage({ hosted: false, lang: 'fr', seed });
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await pause(600);
  const reading = await page.evaluate(() => document.getElementById('reader-container').style.display);
  t.check('lecture seule : le widget s\'ouvre en Lecture', reading === 'block', reading);
  await lockedControl(page, 'lecture seule : Mode édition', '#btn-mode-edit', /lecture seule/i, { quietDocument: false });
  t.check('lecture seule : après l\'appui, la Lecture reste affichée', (await page.evaluate(() => document.getElementById('reader-container').style.display)) === 'block');
  await lockedControl(page, 'lecture seule : Exporter en PDF', '#btn-export-pdf', /export/i, { quietDocument: false });
  await lockedControl(page, 'lecture seule : Gras', '#v2-btn-bold', /lecture seule/i, { quietDocument: false });
  await quietControl(page, 'lecture seule (commentaires permis) : Commenter', '#v2-btn-comment');
  await page.context().close();
}

// ---- 3) Anglais ---------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const { page } = await t.openPage({ hosted: false, lang: 'en', seed: seedModels() });
  await newTemplate(page, 'email');
  await page.evaluate(() => Editor.setHTML('<p>Hello</p>'));
  await pause(100);
  const r = await lockedControl(page, 'email (anglais) : Gras', '#v2-btn-bold', /^Unavailable in an email template/);
  t.check('email (anglais) : l\'info-bulle et le coin d\'état sont en anglais, sans reste de français', !!r.s && !/[éèàçù]/.test(r.s.title) && !/modèle|indisponible/i.test(r.s.title), r.s);
  await newTemplate(page, 'grid');
  await lockedControl(page, 'grille (anglais) : Tableau', '#v2-btn-table', /^Unavailable in a grid/);
  await page.context().close();
}

await t.finish();
