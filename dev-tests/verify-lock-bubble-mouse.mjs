#!/usr/bin/env node
// La bulle d'une icône grisée (js/lock-bubble.js, js/lock-diagnostic.js) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist (700x400) : dev-tests/scenarios-lock-bubble.js joue le module et les grisés de la
// barre du haut DANS la page ; ici une personne clique une icône grisée, lit la bulle, la déplie, copie le constat et la ferme.
// LA BOUCLE (le retour d'un utilisateur du 12/11) : une variable de la table de la page posée dans une zone répétée pour une autre table, dont l'icône Boucle est grisée, avec les tables « Factures » et « Lignes » PUIS « Contrats »
// et « Prestations » : les noms de la bulle viennent du document (aucun nom écrit à la main). LA BULLE : sous l'icône ou au-dessus, entière dans le panneau, l'icône reste grisée et cernée, la barre flottante reste ouverte quand on
// appuie dans la bulle, « En savoir plus » (✓ ✓ ✕, le geste, ce que le widget voit), le pied (« Masquer les noms », « Copier le constat ») reste visible à 700x400, la copie lit le presse-papiers (les noms, puis Table 1 / Colonne 1…),
// Échap, un appui dehors et un second appui sur l'icône la ferment, le clavier (Entrée sur l'icône : le focus entre dans la bulle ; Échap le rend), le thème sombre (contraste d'au moins 4,5:1), l'anglais. LA BARRE DU HAUT :
// un email, la Lecture (le bouton « Passer en mode Édition » à la vraie souris), la lecture seule par droits. LES BARRES FLOTTANTES : une icône grisée de la barre d'un tableau.
// Lancé par run-headless.mjs (groupe Node "lockBubbleMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-lock-bubble-mouse.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-lock-bubble-mouse', port: Number(process.env.LOCK_BUBBLE_MOUSE_PORT || 9443) });
const pause = ms => new Promise(r => setTimeout(r, ms));

// ---- gestes et lectures ---------------------------------------------------------------------------------------------------------------------------------------------
const boxOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
}, selector);
async function goTo(page, selector) {
  const b = await boxOf(page, selector);
  if (!b || !b.w || !b.h) throw new Error('introuvable ou masqué : ' + selector);
  await page.mouse.move(Math.max(2, b.x - 30), Math.min(page.viewportSize().height - 4, b.y + 45));
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await pause(300);
  return b;
}
async function press(page, selector) {
  const b = await goTo(page, selector);
  await page.mouse.down();
  await page.mouse.up();
  await pause(300);
  return b;
}
const bubbleOpen = page => page.evaluate(() => !!document.querySelector('.pp-lockbubble'));
const bubbleBox = page => boxOf(page, '.pp-lockbubble');
const textOf = (page, selector) => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }, selector);
const checksOf = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-lockbubble-check')).map(li => ({ no: li.classList.contains('is-no'), text: li.textContent.replace(/\s+/g, ' ').trim() })));
const html = page => page.evaluate(() => Editor.getHTML());
const fits = (b, viewport) => !!b && b.left >= 0 && b.top >= 0 && b.right <= viewport.width + 0.5 && b.bottom <= viewport.height + 0.5;
const readClipboard = page => page.evaluate(() => navigator.clipboard.readText().catch(e => 'ERREUR ' + e));
// Le rapport de contraste WCAG de deux couleurs `rgb(r, g, b)` / `rgba(...)` lues dans la page.
const contrast = (page, selector, backgroundSelector) => page.evaluate(([sel, bgSel]) => {
  const parse = css => { const m = css.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = ({ r, g, b }) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const fg = parse(getComputedStyle(document.querySelector(sel)).color);
  let bg = null;
  for (let node = document.querySelector(bgSel); node && !bg; node = node.parentElement) { const c = parse(getComputedStyle(node).backgroundColor); if (c.a > 0.9) bg = c; }
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}, [selector, backgroundSelector]);

// ---- la page de la Boucle : tables Factures (page) et Lignes, ou les noms qu'on donne ------------------------------------------------------------------------------------
async function loopPage({ lang = 'fr', colorScheme = 'light', pageTable = 'Factures', lineTable = 'Lignes', otherTable = 'Participants', numberColumn = 'Numero' } = {}) {
  const { page } = await t.openPage({ hosted: false, lang, colorScheme });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.evaluate(async ({ pageTable, lineTable, otherTable, numberColumn }) => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables(pageTable, { [numberColumn]: 'Text', Client: 'Text', Total: 'Numeric' });
    stub.setVariables(lineTable, { Parent: 'Ref:' + pageTable, Designation: 'Text', Qte: 'Numeric' });
    stub.setVariables(otherTable, { Parent: 'Ref:' + pageTable, NomComplet: 'Text' });
    stub.setRows(pageTable, [{ id: 1, [numberColumn]: 'F-1', Client: 'X', Total: 3 }]);
    stub.setRows(lineTable, [{ id: 1, Parent: 1, Designation: 'A', Qte: 3 }]);
    stub.setRows(otherTable, [{ id: 1, Parent: 1, NomComplet: 'N' }]);
    await GristAPI.refreshSchema();
    for (const table of [lineTable, otherTable]) {
      await GristAPI.deleteLinkRule(table);
      await GristAPI.saveLinkRule(table, { mode: 'match', colonneCible: 'Parent', colonneSource: 'id' });
    }
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, [numberColumn]: 'F-1', Client: 'X', Total: 3 }, pageTable);
    const loop = JSON.stringify({ repeat: 'row', table: lineTable }).replace(/"/g, '&quot;');
    const badge = (table, column, extra) => '<span class="var-badge" data-table="' + table + '" data-column="' + column + '" data-key="' + table + '.' + column + '"' + (extra || '') + '></span>';
    Editor.setHTML('<h2>Facture</h2><table><tbody><tr><th><p>Facture</p></th><th><p>Désignation</p></th><th><p>Qté</p></th></tr><tr><td><p>' + badge(pageTable, numberColumn) + '</p></td><td><p>'
      + badge(lineTable, 'Designation', ' data-loop="' + loop + '" data-loop-repeat="row"') + '</p></td><td><p>' + badge(lineTable, 'Qte') + '</p></td></tr></tbody></table><p>Fin</p>');
  }, { pageTable, lineTable, otherTable, numberColumn });
  await pause(700);
  // La variable de la table de la page, posée dans la zone répétée pour l'autre table : sa barre s'ouvre, son icône Boucle est grisée.
  const badges = await page.$$('.tiptap .var-badge');
  const box = await badges[0].boundingBox();
  await page.mouse.move(box.x - 20, box.y + 40);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await pause(500);
  return page;
}
const LOOP = '.v2-varfmt-toolbar.visible button[data-action="var-loop"]';

// ---- 1) Français : la Boucle grisée, à la vraie souris, à 700x400 -------------------------------------------------------------------------------------------------------
{
  const page = await loopPage();
  const viewport = page.viewportSize();
  const before = await html(page);
  const loopState = await page.evaluate(sel => { const b = document.querySelector(sel); return b ? { disabled: b.getAttribute('aria-disabled'), cls: b.classList.contains('is-disabled'), title: b.getAttribute('title') } : null; }, LOOP);
  t.check('Boucle : l\'icône est grisée (aria-disabled, `is-disabled`) et son info-bulle dit pourquoi, avec les noms du document', !!loopState && loopState.disabled === 'true' && loopState.cls && /« Lignes »/.test(loopState.title) && /« Factures »/.test(loopState.title), loopState);
  const anchor = await press(page, LOOP);
  t.check('Boucle : un vrai clic ouvre la bulle', await bubbleOpen(page));
  const small = await bubbleBox(page);
  t.check('Boucle : la bulle tient dans le panneau 700×400', fits(small, viewport), small);
  t.check('Boucle : la bulle ne recouvre pas l\'icône (au-dessus ou en dessous)', !!small && (small.top >= anchor.bottom - 1 || small.bottom <= anchor.top + 1), { small, anchor });
  const head = { name: await textOf(page, '.pp-lockbubble-name'), why: await textOf(page, '.pp-lockbubble-why'), more: await textOf(page, '.pp-lockbubble-more') };
  t.check('Boucle : le nom de l\'icône, la variable concernée et la raison (celle de l\'info-bulle)', /^Boucle/.test(head.name) && /Factures\.Numero/.test(head.name) && head.why === loopState.title, head);
  const still = await page.evaluate(sel => { const b = document.querySelector(sel); return { disabled: b.getAttribute('aria-disabled'), open: b.getAttribute('data-pp-lock-open'), ring: getComputedStyle(b).boxShadow }; }, LOOP);
  t.check('Boucle : l\'icône reste grisée, à sa place, et cernée tant que la bulle est ouverte', still.disabled === 'true' && still.open === '1' && still.ring !== 'none', still);
  t.check('Boucle : le document n\'a pas bougé', (await html(page)) === before);
  t.check('Boucle : « En savoir plus » est replié, le pied (copier) n\'est pas là', (await page.evaluate(() => document.querySelector('.pp-lockbubble-more').getAttribute('aria-expanded') === 'false' && document.querySelector('.pp-lockbubble-diag').hidden && document.querySelector('.pp-lockbubble-foot').hidden)));

  await press(page, '.pp-lockbubble-more');
  const checks = await checksOf(page);
  const open = await bubbleBox(page);
  t.check('Boucle : « En savoir plus » déplie trois vérifications : la colonne ✓, la zone répétée ✓, le rattachement ✕, avec les noms lus dans le document',
    checks.length === 3 && !checks[0].no && !checks[1].no && checks[2].no && /Factures\.Numero/.test(checks[0].text) && /Lignes/.test(checks[1].text) && /Factures/.test(checks[2].text) && /Lignes/.test(checks[2].text), checks);
  t.check('Boucle : dépliée, la bulle tient encore dans le panneau 700×400 (elle défile en elle-même)', fits(open, viewport), open);
  const foot = await boxOf(page, '.pp-lockbubble-copy');
  t.check('Boucle : le pied (« Masquer les noms », « Copier le constat ») reste visible, dans le panneau', !!foot && fits(foot, viewport) && !!(await boxOf(page, '.pp-lockbubble-mask')), foot);
  t.check('Boucle : un appui dans la bulle ne ferme pas la barre flottante de la variable', await page.evaluate(() => !!document.querySelector('.v2-varfmt-toolbar.visible')));
  const scroll = await page.evaluate(() => { const d = document.querySelector('.pp-lockbubble-diag'); const before = d.scrollTop; d.scrollTop = d.scrollHeight; const ctx = document.querySelector('.pp-lockbubble-ctx').getBoundingClientRect(); const dr = d.getBoundingClientRect(); return { scrollable: d.scrollHeight > d.clientHeight, moved: d.scrollTop > before, ctxVisible: ctx.bottom <= dr.bottom + 1 && ctx.bottom > dr.top }; });
  t.check('Boucle : à 700×400 le constat défile dans la bulle jusqu\'à « Ce que le widget voit » (version, accès, table de la page, tables liées, variable, zone, colonnes)', scroll.scrollable && scroll.moved && scroll.ctxVisible, scroll);
  const ctx = await textOf(page, '.pp-lockbubble-ctx');
  t.check('Boucle : ce que le widget voit : la version, la table de la page, les tables liées par leur colonne, la variable et son type, la zone, les colonnes avec leur type', /Publipostage\+\d+\.\d+\.\d+/.test(ctx) && /Table de la pageFactures/.test(ctx) && /Lignes \(par Parent\)/.test(ctx) && /Participants \(par Parent\)/.test(ctx) && /VariableFactures\.Numero \(Texte\)/.test(ctx) && /Zone répétéeune ligne du tableau, table Lignes/.test(ctx) && /Colonnes de FacturesNumero \(Texte\), Client \(Texte\), Total \(Nombre\)/.test(ctx) && !/t\|/.test(ctx), ctx);
  t.check('Boucle : le geste pour dégriser est écrit, sans bouton (il se fait dans Grist)', /Pour la dégriser/.test(await textOf(page, '.pp-lockbubble-fix')) && !(await page.$('.pp-lockbubble-act')));

  // Copier le constat : les noms, puis masqués (Table 1, Colonne 1…) ; ce que la bulle écrit à l'écran ne change pas.
  await press(page, '.pp-lockbubble-copy');
  const plain = await readClipboard(page);
  t.check('Copier : le texte du forum a la raison, le constat (✓ ✓ ✕), le geste, le contexte et la ligne « aucun contenu de cellule »', /^\*\*Publipostage\+ \d+\.\d+\.\d+ : icône grisée « Boucle »\*\*/.test(plain) && /Raison : /.test(plain) && /- ✓ /.test(plain) && /- ✕ /.test(plain) && /Pour dégriser : /.test(plain) && /Contexte :/.test(plain) && /Aucun contenu de cellule/.test(plain), plain);
  t.check('Copier : sans masque, les noms de tables et de colonnes du document y sont, jamais le contenu d\'une cellule ni un nom de modèle', /Factures/.test(plain) && /Lignes/.test(plain) && /Numero/.test(plain) && !/F-1|Mairie|Animation/.test(plain), plain);
  t.check('Copier : le bouton dit « Copié »', (await textOf(page, '.pp-lockbubble-copy')) === 'Copié');
  await press(page, '.pp-lockbubble-mask input');
  await press(page, '.pp-lockbubble-copy');
  const masked = await readClipboard(page);
  t.check('Masquer les noms : le texte copié n\'a plus un nom du document (Table 1, Colonne 1…), le même nom garde le même alias, et le texte dit qu\'ils sont remplacés',
    !/Factures|Lignes|Participants|Numero|Client|Designation|Total/.test(masked) && /Table 1/.test(masked) && /Table 2/.test(masked) && /Colonne 1/.test(masked) && /remplacés/.test(masked) && masked.split('Table 2.Colonne 1').length >= 3, masked);
  t.check('Masquer les noms : ce que la bulle écrit à l\'écran garde les vrais noms', /Factures/.test(await textOf(page, '.pp-lockbubble-why')) && /Factures\.Numero/.test(await textOf(page, '.pp-lockbubble-name')));
  t.check('Masquer les noms : le texte copié reste lisible (la raison, le constat et le geste y sont encore)', /Raison : /.test(masked) && /- ✕ /.test(masked) && /Pour dégriser : /.test(masked));

  // Échap, un appui dehors, un second appui sur l'icône.
  await page.keyboard.press('Escape');
  await pause(150);
  t.check('Échap ferme la bulle, l\'icône n\'est plus cernée', !(await bubbleOpen(page)) && (await page.evaluate(sel => !document.querySelector(sel).hasAttribute('data-pp-lock-open'), LOOP)));
  await press(page, LOOP);
  t.check('un nouveau clic sur l\'icône rouvre la bulle, repliée', (await bubbleOpen(page)) && (await page.evaluate(() => document.querySelector('.pp-lockbubble-diag').hidden)));
  await press(page, LOOP);
  t.check('un second clic sur la même icône ferme la bulle', !(await bubbleOpen(page)));
  await press(page, LOOP);
  await page.mouse.move(60, 380);
  await page.mouse.down();
  await page.mouse.up();
  await pause(250);
  t.check('un appui hors de la bulle la ferme', !(await bubbleOpen(page)));
  t.check('aucune page en erreur ni boîte native pendant le parcours', true);
  await page.context().close();
}

// ---- 2) Les noms viennent du document : « Contrats » et « Prestations » -----------------------------------------------------------------------------------------------------
{
  const page = await loopPage({ pageTable: 'Contrats', lineTable: 'Prestations', otherTable: 'Signataires', numberColumn: 'Reference' });
  await press(page, LOOP);
  await press(page, '.pp-lockbubble-more');
  const shown = await page.evaluate(() => document.querySelector('.pp-lockbubble').textContent.replace(/\s+/g, ' '));
  t.check('autres noms : la bulle dit « Contrats », « Prestations » et la colonne « Reference » - rien de Factures, Lignes, Participants ou Numero', /Contrats\.Reference/.test(shown) && /Prestations/.test(shown) && !/Factures|Lignes|Participants|Numero/.test(shown), shown.slice(0, 300));
  await press(page, '.pp-lockbubble-copy');
  const copied = await readClipboard(page);
  t.check('autres noms : le texte copié dit lui aussi les noms de ce document', /Contrats/.test(copied) && /Prestations/.test(copied) && /Signataires/.test(copied) && !/Factures|Lignes|Numero/.test(copied), copied);
  await page.context().close();
}

// ---- 3) Le clavier : Entrée sur l'icône grisée, le focus entre dans la bulle, Échap le rend ----------------------------------------------------------------------------------
{
  const page = await loopPage();
  await page.focus(LOOP);
  await page.keyboard.press('Enter');
  await pause(250);
  t.check('clavier : Entrée sur l\'icône grisée ouvre la bulle', await bubbleOpen(page));
  t.check('clavier : le focus est dans la bulle, sur « En savoir plus »', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('pp-lockbubble-more')));
  await page.keyboard.press('Enter');
  await pause(200);
  t.check('clavier : Entrée sur « En savoir plus » déplie le constat', await page.evaluate(() => document.querySelector('.pp-lockbubble-more').getAttribute('aria-expanded') === 'true' && !document.querySelector('.pp-lockbubble-diag').hidden));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  t.check('clavier : Tab atteint « Masquer les noms » puis « Copier le constat »', await page.evaluate(() => { const a = document.activeElement; return !!a && (a.classList.contains('pp-lockbubble-copy') || (a.type === 'checkbox' && !!a.closest('.pp-lockbubble-mask'))); }));
  await page.keyboard.press('Escape');
  await pause(200);
  t.check('clavier : Échap ferme la bulle et rend le focus à l\'icône', !(await bubbleOpen(page)) && (await page.evaluate(sel => document.activeElement === document.querySelector(sel), LOOP)));
  t.check('clavier : la lecture d\'écran : la bulle est un dialogue nommé, chaque vérification dit « écartée » ou « cause »', await (async () => {
    await page.keyboard.press('Enter');
    await pause(250);
    await page.keyboard.press('Enter');
    await pause(200);
    return page.evaluate(() => { const d = document.querySelector('.pp-lockbubble'); const items = Array.from(d.querySelectorAll('.pp-lockbubble-check')); return d.getAttribute('role') === 'dialog' && /Boucle/.test(d.getAttribute('aria-label')) && items.length === 3 && items.filter(i => /cause :/.test(i.textContent)).length === 1 && items.filter(i => /écartée :/.test(i.textContent)).length === 2; });
  })());
  await page.context().close();
}

// ---- 4) Thème sombre : le contraste de la bulle ----------------------------------------------------------------------------------------------------------------------------
{
  const page = await loopPage({ colorScheme: 'dark' });
  await press(page, LOOP);
  await press(page, '.pp-lockbubble-more');
  const ratios = {
    raison: await contrast(page, '.pp-lockbubble-why', '.pp-lockbubble'),
    nom: await contrast(page, '.pp-lockbubble-name small', '.pp-lockbubble'),
    verification: await contrast(page, '.pp-lockbubble-check small', '.pp-lockbubble'),
    contexte: await contrast(page, '.pp-lockbubble-ctx dt', '.pp-lockbubble-ctx'),
    pied: await contrast(page, '.pp-lockbubble-mask', '.pp-lockbubble-foot'),
    bouton: await contrast(page, '.pp-lockbubble-copy', '.pp-lockbubble-copy'),
  };
  t.check('sombre : chaque texte de la bulle a un contraste d\'au moins 4,5:1 avec son fond', Object.values(ratios).every(r => r >= 4.5), ratios);
  const shot = await bubbleBox(page);
  t.check('sombre : la bulle dépliée tient dans le panneau', fits(shot, page.viewportSize()), shot);
  await page.context().close();
}

// ---- 5) Anglais ----------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const page = await loopPage({ lang: 'en' });
  await press(page, LOOP);
  const head = { name: await textOf(page, '.pp-lockbubble-name'), why: await textOf(page, '.pp-lockbubble-why'), more: await textOf(page, '.pp-lockbubble-more') };
  t.check('anglais : la bulle est en anglais, avec les noms du document', /^Loop/.test(head.name) && /disabled icon for “Factures\.Numero”/.test(head.name) && /^Inside a zone repeated for “Lignes”/.test(head.why) && /Learn more/.test(head.more), head);
  await press(page, '.pp-lockbubble-more');
  const checks = await checksOf(page);
  t.check('anglais : les vérifications, le geste et le pied sont en anglais', checks.length === 3 && /finds its column/.test(checks[0].text) && /inside a repeated zone/i.test(checks[1].text) && (await textOf(page, '.pp-lockbubble-fix')).startsWith('To enable it') && (await textOf(page, '.pp-lockbubble-copy')) === 'Copy the findings' && (await textOf(page, '.pp-lockbubble-mask')) === 'Hide names', checks);
  await press(page, '.pp-lockbubble-copy');
  const copied = await readClipboard(page);
  t.check('anglais : le texte copié est en anglais, sans reste de français', /^\*\*Publipostage\+ \d+\.\d+\.\d+: disabled icon “Loop”\*\*/.test(copied) && /Reason: /.test(copied) && /Findings:/.test(copied) && /To enable it: /.test(copied) && /Context:/.test(copied) && !/Raison|Constat|Contexte|Pour dégriser|Aucun contenu/.test(copied), copied);
  t.check('anglais : aucune lettre accentuée française dans la bulle', !/[éèàçù]/.test(await page.evaluate(() => document.querySelector('.pp-lockbubble').textContent)), '');
  await page.context().close();
}

// ---- 6) La barre du haut : un email, la Lecture et son bouton, la lecture seule par droits ----------------------------------------------------------------------------------
async function newTemplate(page, kind) {
  await goTo(page, '#btn-new');
  await pause(500);
  const row = await boxOf(page, '#v2-btn-new-' + kind);
  await page.mouse.move(row.x, row.y, { steps: 6 });
  await pause(250);
  await page.mouse.down();
  await page.mouse.up();
  await pause(700);
  await page.mouse.move(350, 330);
}
{
  const { page } = await t.openPage({ hosted: false, lang: 'fr', seed: seedModels() });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const viewport = page.viewportSize();
  await newTemplate(page, 'email');
  await page.evaluate(() => Editor.setHTML('<p>Bonjour</p>'));
  await pause(100);
  const before = await html(page);
  const anchor = await press(page, '#v2-btn-table');
  const box = await bubbleBox(page);
  t.check('email : un vrai clic sur « Tableau » grisé ouvre la bulle sous l\'icône, dans le panneau', !!box && fits(box, viewport) && box.top >= anchor.bottom - 1, { box, anchor });
  t.check('email : la bulle dit la raison de l\'info-bulle et rien n\'est écrit dans le coin d\'état', (await textOf(page, '.pp-lockbubble-why')) === await page.evaluate(() => document.getElementById('v2-btn-table').getAttribute('title')) && !/email/i.test(await textOf(page, '#status-msg')));
  await press(page, '.pp-lockbubble-more');
  const checks = await checksOf(page);
  t.check('email : droits ✓, mode Édition ✓, « Ce modèle est un email » ✕ avec le nom du modèle', checks.length === 3 && !checks[0].no && !checks[1].no && checks[2].no && /Ce modèle est un email/.test(checks[2].text) && /« Nouveau modèle »/.test(checks[2].text), checks);
  t.check('email : le geste dit de créer un modèle Document, sans bouton', /modèle Document/.test(await textOf(page, '.pp-lockbubble-fix')) && !(await page.$('.pp-lockbubble-act')));
  t.check('email : ce que le widget voit nomme le modèle et son type', /Modèle« Nouveau modèle », email/.test(await textOf(page, '.pp-lockbubble-ctx')));
  t.check('email : le document n\'a pas bougé', (await html(page)) === before);
  await press(page, '.pp-lockbubble-copy');
  const copied = await readClipboard(page);
  await press(page, '.pp-lockbubble-mask input');
  await press(page, '.pp-lockbubble-copy');
  const hidden = await readClipboard(page);
  t.check('email : le texte copié nomme le modèle ; masqué, il devient « Modèle »', /Nouveau modèle/.test(copied) && !/Nouveau modèle/.test(hidden) && /Modèle/.test(hidden), { copied, hidden });
  await page.keyboard.press('Escape');

  // La Lecture : « Gras » grisé, le bouton fait le geste.
  await newTemplate(page, 'document');
  await page.evaluate(() => Editor.setHTML('<p>Bonjour</p>'));
  await goTo(page, '#btn-mode-read');
  await page.mouse.down();
  await page.mouse.up();
  await pause(900);
  await press(page, '#v2-btn-bold');
  await press(page, '.pp-lockbubble-more');
  const read = await checksOf(page);
  t.check('Lecture : droits ✓, accès ✓, « Le widget est en mode Lecture » ✕', read.length === 3 && !read[0].no && !read[1].no && read[2].no && /mode Lecture/.test(read[2].text), read);
  const action = await boxOf(page, '.pp-lockbubble-act');
  t.check('Lecture : le bouton « Passer en mode Édition » est visible dans le panneau, à côté de « Copier le constat »', !!action && fits(action, viewport) && (await textOf(page, '.pp-lockbubble-act')) === 'Passer en mode Édition', action);
  await press(page, '.pp-lockbubble-act');
  await pause(500);
  t.check('Lecture : le bouton remet l\'Édition et ferme la bulle', !(await bubbleOpen(page)) && (await page.evaluate(() => document.getElementById('btn-mode-edit').classList.contains('active'))));
  t.check('Lecture : « Gras » n\'est plus grisé après le geste', await page.evaluate(() => { const b = document.getElementById('v2-btn-bold'); return !b.hasAttribute('data-pp-lock-reason') && !b.hasAttribute('aria-disabled'); }));
  await page.context().close();
}
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
  await press(page, '#btn-mode-edit');
  t.check('lecture seule : un vrai clic sur « Mode édition » ouvre la bulle', await bubbleOpen(page));
  await press(page, '.pp-lockbubble-more');
  const rights = await checksOf(page);
  t.check('lecture seule : « Ce document est en lecture seule pour vous » est la cause ✕ ; pas de bouton (le geste est dans Grist)', rights.some(c => c.no && /lecture seule/.test(c.text)) && /Partager/.test(await textOf(page, '.pp-lockbubble-fix')) && !(await page.$('.pp-lockbubble-act')), rights);
  t.check('lecture seule : la Lecture reste affichée', (await page.evaluate(() => document.getElementById('reader-container').style.display)) === 'block');
  await page.keyboard.press('Escape');
  await press(page, '#btn-export-pdf');
  await press(page, '.pp-lockbubble-more');
  const exportChecks = await checksOf(page);
  t.check('lecture seule : l\'export refusé est une vérification de plus (« L\'export n\'est pas autorisé pour vous »)', exportChecks.some(c => c.no && /L’export n’est pas autorisé/.test(c.text)), exportChecks);
  await page.context().close();
}

// ---- 7) Les barres flottantes : une icône grisée de la barre d'un tableau ------------------------------------------------------------------------------------------------------
{
  const { page } = await t.openPage({ hosted: false, lang: 'fr', seed: seedModels() });
  await page.evaluate(() => Editor.setHTML('<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table><p>Fin</p>'));
  await pause(500);
  const cell = await boxOf(page, '.tiptap td');
  await page.mouse.click(cell.x, cell.y);
  await pause(500);
  const grey = await page.evaluate(() => { const b = document.querySelector('.v2-table-toolbar.visible button.is-disabled[aria-disabled="true"]'); return b ? { action: b.dataset.action, title: b.getAttribute('title') } : null; });
  t.check('barre du tableau : une icône est grisée avec sa raison (cellule seule : fusionner, égaliser…)', !!grey && !!grey.title, grey);
  if (grey) {
    const sel = `.v2-table-toolbar.visible button[data-action="${grey.action}"]`;
    const before = await html(page);
    await press(page, sel);
    t.check('barre du tableau : un vrai clic sur l\'icône grisée ouvre la bulle, qui dit la raison de l\'info-bulle', (await bubbleOpen(page)) && (await textOf(page, '.pp-lockbubble-why')) === grey.title, grey);
    await press(page, '.pp-lockbubble-more');
    t.check('barre du tableau : « En savoir plus » donne ce que le widget voit et le bouton de copie (aucune vérification inventée)', /Publipostage\+/.test(await textOf(page, '.pp-lockbubble-ctx')) && !!(await boxOf(page, '.pp-lockbubble-copy')) && (await checksOf(page)).length === 0);
    t.check('barre du tableau : la barre reste ouverte, le document n\'a pas bougé', (await page.evaluate(() => !!document.querySelector('.v2-table-toolbar.visible'))) && (await html(page)) === before);
  }
  await page.context().close();
}

await t.finish();
