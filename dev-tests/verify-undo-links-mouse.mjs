#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent les RÈGLES DE LIAISON entre tables, à la vraie souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair
// puis en anglais sombre - suite de sa demande du 22/10 (« Il doit prendre en compte 100% des actions faites dans le widget ») et de sa réponse du 27/10 (« Oui, tout, Réglages compris »). Ce que
// dev-tests/scenarios-undo-links.js ne peut pas voir depuis la page : le vrai clic sur le crayon et la corbeille de « Tables liées », les colonnes choisies dans les vraies listes avec recherche de la fenêtre de la clé, la clé
// ouverte par la vraie frappe d'une variable (« # »), les boutons de la fenêtre atteignables dans 700x400, la touche frappée par le clavier lui-même.
//   1) le crayon de « Tables liées » : les deux colonnes changées aux vraies listes, « Valider » cliqué ; la fenêtre refermée, UN Ctrl + Z rend les anciennes colonnes, UN Ctrl + Y les nouvelles, puis les boutons de la barre ;
//   2) la corbeille de « Tables liées » et le bouton « Supprimer » de la confirmation : Ctrl + Z rend le lien (le panneau le montre), Ctrl + Y le retire, les boutons de la barre aussi ;
//   3) une variable d'une autre table frappée après « # », sans lien réglé : la clé s'ouvre, « Valider » la règle devinée ; Ctrl + Z défait d'abord la variable, le suivant le lien (le texte d'avant ne bouge pas), Ctrl + Y rend le tout dans l'ordre ;
//   4) du texte, la corbeille, du texte : trois Ctrl + Z dans l'ordre inverse, trois Ctrl + Y dans l'ordre ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoLinksMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-links-mouse.mjs
import { open, stopServer, sleep, click, pickTemplate, fire } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_LINKS_MOUSE_PORT || 9159);
// Une page sur Dossiers ; Annuaire est la table que Dossiers.Responsable désigne ; Contacts (pas encore liée) référence Dossiers par Dossier : la règle devinée à l'ouverture de sa fenêtre est « Dossier = Auto ».
const SPEC = {
  models: { count: 2, paragraphs: 2 },
  tables: [
    { id: 'Annuaire', rows: 3, columns: [{ id: 'NomPrenom', type: 'Text' }, { id: 'Telephone', type: 'Text' }] },
    { id: 'Dossiers', rows: 3, columns: [{ id: 'Titre', type: 'Text' }, { id: 'Statut', type: 'Text' }, { id: 'Responsable', type: 'Ref:Annuaire' }] },
    { id: 'Contacts', rows: 3, columns: [{ id: 'Dossier', type: 'Ref:Dossiers' }, { id: 'Role', type: 'Text' }, { id: 'Fonction', type: 'Text' }, { id: 'Nom', type: 'Text' }] },
  ],
};
const DIALOG_OK = '#pp-dialog-modal .var-modal-primary';
const LINKS = 'Publipostage_LiensTables';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Les liens de la table des liens tels que Grist les garde : « table de la page|table liée|mode|colonne de la table liée|colonne de la page » ('*' : le lien commun) ; les écritures qu'elle a reçues.
const rules = page => page.evaluate(table => {
  const t = window.__gristStub.state.rows[table];
  if (!t) return [];
  return t.id.map((id, i) => [(t.TableSource && t.TableSource[i]) || '*', t.TableCible[i], t.Mode[i], t.ColonneCible[i], t.ColonneSource[i]].join('|'));
}, LINKS);
const linkWrites = page => page.evaluate(table => window.__gristStub.getActionLog().filter(action => action[1] === table).map(action => action[0]), LINKS);
const clearWrites = page => page.evaluate(() => window.__gristStub.clearActionLog());
const forget = page => page.evaluate(() => { if (typeof ActionHistory !== 'undefined') ActionHistory.reset(); });
const status = page => page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
const said = (page, key, link) => page.evaluate(({ key, link }) => I18n.t(key, { link }), { key, link });
const text = page => page.evaluate(() => EditorCore.getEditor().getText());
const inEditor = page => page.evaluate(() => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ProseMirror')));
const displayed = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; }, selector);
const badges = page => page.evaluate(() => { const keys = []; EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') keys.push(node.attrs.table + '.' + node.attrs.column); }); return keys; });
const panelLabels = page => page.evaluate(() => Array.from(document.querySelectorAll('#link-rules-list .link-rule-label')).map(label => label.textContent));
const selectValues = page => page.evaluate(() => [document.getElementById('link-config-col-cible').value, document.getElementById('link-config-col-source').value]);
const rowIdLabel = page => page.evaluate(() => I18n.t('linkConfig.rowId'));
async function key(page, combo, wait = 900) {
  await page.keyboard.press(combo);
  await sleep(wait);
}
async function toEnd(page) {
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await sleep(200);
}
// Un contrôle atteignable : dans le panneau, et rien d'autre à son centre.
const reach = (page, selector) => page.evaluate(sel => {
  const e = document.querySelector(sel);
  if (!e) return { found: false };
  const r = e.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === e || e.contains(top)) };
}, selector);
const reachable = async (page, selector) => { const r = await reach(page, selector); return r.found && r.inViewport && r.onTop; };
// Le vrai clic sur un élément que la page désigne (`find`, évaluée dans la page) : ramené en vue d'abord, puis le pointeur y va et clique.
async function clickWhere(page, find, arg) {
  const pos = await page.evaluate(({ src, arg }) => {
    const element = (new Function('arg', 'return (' + src + ')(arg)'))(arg);
    if (!element) return null;
    element.scrollIntoView({ block: 'nearest' });
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { src: find.toString(), arg });
  if (!pos) throw new Error('introuvable : ' + find.toString());
  await page.mouse.move(pos.x - 20, pos.y);
  await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(pos.x, pos.y);
}
// Une colonne choisie dans l'une des deux listes avec recherche de la fenêtre de la clé (`which` : 'source', la table de la page, ou 'cible', la table liée) comme le fait la personne : clic sur le champ, frappe du nom, clic sur la ligne au nom exact.
async function pickColumn(page, which, name) {
  const scope = '#link-config-modal .link-config-bridge-col:' + (which === 'source' ? 'first-child' : 'last-child');
  await clickWhere(page, s => document.querySelector(s + ' .ss-trigger'), scope);
  await sleep(150);
  await page.keyboard.type(name);
  await sleep(120);
  await clickWhere(page, ({ scope, name }) => Array.from(document.querySelectorAll(scope + ' .ss-panel:not([hidden]) .ss-option')).find(row => row.querySelector('.ss-name').textContent === name), { scope, name });
  await sleep(250);
}
// « Tables liées » ouverte au vrai clic de la barre, et refermée au vrai clic de son bouton.
async function openPanel(page) {
  await click(page, '#btn-link-rules');
  await sleep(500);
}
async function closePanel(page) {
  await click(page, '#link-rules-close');
  await sleep(400);
}
// Un lien posé sans passer par l'écran (le point de départ d'une partie) : ni pas à défaire, ni écriture comptée.
async function seedLink(page, rule) {
  await page.evaluate(async rule => { await GristAPI.saveLinkRule(rule.table, rule.rule); }, rule);
  await forget(page);
  await clearWrites(page);
}
const clearLinks = page => page.evaluate(async () => { for (const table of ['Annuaire', 'Contacts', 'Dossiers']) await GristAPI.deleteLinkRule(table); });

async function phase(lang, theme) {
  const tag = `${lang}/${theme}`;
  const w = await open({ spec: SPEC, port: PORT, theme, lang });
  const { page } = w;
  console.log(`\n=== Ctrl + Z et les règles de liaison, vraie souris et vrai clavier, 700x400, ${lang === 'fr' ? 'français clair' : 'anglais sombre'} ===`);
  try {
    await pickTemplate(page, 'Modèle 0001');
    await fire(page, 'Dossiers', 1);
    const auto = await rowIdLabel(page);
    const labelA = `Dossiers → Contacts : Dossier = ${auto}`;
    const labelB = 'Dossiers → Contacts : Role = Titre';
    const ROW_A = 'Dossiers|Contacts|match|Dossier|id';
    const ROW_B = 'Dossiers|Contacts|match|Role|Titre';
    check(`${tag} 0 : la page est sur Dossiers, aucun lien au départ`, (await page.evaluate(() => GristAPI.getCurrentTableId())) === 'Dossiers' && (await rules(page)).length === 0, await rules(page));

    // --- 1) le crayon de « Tables liées » ---
    await seedLink(page, { table: 'Contacts', rule: { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id', tableSource: 'Dossiers' } });
    await openPanel(page);
    check(`${tag} 1 : « Tables liées » montre le lien, la corbeille et le crayon sont atteignables`, JSON.stringify(await panelLabels(page)) === JSON.stringify([labelA]) && await reachable(page, '#link-rules-list .link-rule-btn-edit') && await reachable(page, '#link-rules-list .link-rule-btn-delete'), { labels: await panelLabels(page) });
    await clickWhere(page, () => document.querySelector('#link-rules-list .link-rule-btn-edit'));
    await sleep(600);
    check(`${tag} 1 : le vrai clic sur le crayon ouvre la clé, ses boutons sont atteignables`, await displayed(page, '#link-config-modal') && await reachable(page, '#link-config-confirm') && await reachable(page, '#link-config-cancel'), await reach(page, '#link-config-confirm'));
    await pickColumn(page, 'cible', 'Role');
    await pickColumn(page, 'source', 'Titre');
    check(`${tag} 1 : les deux colonnes sont choisies aux vraies listes`, JSON.stringify(await selectValues(page)) === JSON.stringify(['Role', 'Titre']), await selectValues(page));
    await click(page, '#link-config-confirm');
    await sleep(700);
    check(`${tag} 1 : « Valider » met le lien à jour : la table et une seule écriture`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_B]) && JSON.stringify(await linkWrites(page)) === '["UpdateRecord"]', { rules: await rules(page), writes: await linkWrites(page) });
    check(`${tag} 1 : le panneau, resté ouvert, montre le nouveau lien`, await displayed(page, '#link-rules-modal') && JSON.stringify(await panelLabels(page)) === JSON.stringify([labelB]), await panelLabels(page));
    await closePanel(page);
    await clearWrites(page);
    await key(page, 'Control+z');
    check(`${tag} 1 : Ctrl + Z rend les anciennes colonnes, par une seule écriture`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]) && JSON.stringify(await linkWrites(page)) === '["UpdateRecord"]', { rules: await rules(page), writes: await linkWrites(page) });
    check(`${tag} 1 : le coin d'état nomme le lien rendu`, (await status(page)) === await said(page, 'status.linkRestored', labelA), await status(page));
    check(`${tag} 1 : le clavier est rendu à l'éditeur`, await inEditor(page));
    await key(page, 'Control+y');
    check(`${tag} 1 : Ctrl + Y rend les nouvelles colonnes`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_B]) && (await status(page)) === await said(page, 'status.linkRestored', labelB), { rules: await rules(page), status: await status(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 1 : le bouton Annuler de la barre rend les anciennes colonnes`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]), await rules(page));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 1 : le bouton Rétablir de la barre rend les nouvelles`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_B]), await rules(page));
    await openPanel(page);
    check(`${tag} 1 : « Tables liées » rouverte montre le lien rétabli`, JSON.stringify(await panelLabels(page)) === JSON.stringify([labelB]), await panelLabels(page));
    await closePanel(page);

    // --- 2) la corbeille de « Tables liées » ---
    await forget(page);
    await clearWrites(page);
    await openPanel(page);
    await clickWhere(page, () => document.querySelector('#link-rules-list .link-rule-btn-delete'));
    await sleep(500);
    check(`${tag} 2 : la confirmation s'ouvre, son bouton est atteignable`, await reachable(page, DIALOG_OK), await reach(page, DIALOG_OK));
    await click(page, DIALOG_OK);
    await sleep(800);
    check(`${tag} 2 : « Supprimer » retire le lien : la table et une seule écriture`, JSON.stringify(await rules(page)) === '[]' && JSON.stringify(await linkWrites(page)) === '["RemoveRecord"]', { rules: await rules(page), writes: await linkWrites(page) });
    await closePanel(page);
    await clearWrites(page);
    await key(page, 'Control+z');
    check(`${tag} 2 : Ctrl + Z rend le lien tel qu'il était, par une seule écriture`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_B]) && JSON.stringify(await linkWrites(page)) === '["AddRecord"]', { rules: await rules(page), writes: await linkWrites(page) });
    check(`${tag} 2 : le coin d'état nomme le lien rendu`, (await status(page)) === await said(page, 'status.linkRestored', labelB), await status(page));
    await openPanel(page);
    check(`${tag} 2 : « Tables liées » montre le lien rendu`, JSON.stringify(await panelLabels(page)) === JSON.stringify([labelB]), await panelLabels(page));
    await closePanel(page);
    await key(page, 'Control+y');
    check(`${tag} 2 : Ctrl + Y retire le lien de nouveau`, JSON.stringify(await rules(page)) === '[]' && (await status(page)) === await said(page, 'status.linkRemoved', labelB), { rules: await rules(page), status: await status(page) });
    await click(page, '#v2-btn-undo');
    await sleep(900);
    check(`${tag} 2 : le bouton Annuler de la barre rend le lien`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_B]), await rules(page));
    await click(page, '#v2-btn-redo');
    await sleep(900);
    check(`${tag} 2 : le bouton Rétablir de la barre le retire`, JSON.stringify(await rules(page)) === '[]', await rules(page));

    // --- 3) la clé ouverte par une variable frappée après « # » ---
    await clearLinks(page);
    await forget(page);
    await clearWrites(page);
    await toEnd(page);
    await page.keyboard.type(' AVANT');
    await sleep(700);
    await page.keyboard.type(' #Fonction');
    await sleep(900);
    await clickWhere(page, () => Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(item => /Fonction/.test(item.textContent)));
    await sleep(700);
    check(`${tag} 3 : la variable d'une table pas liée ouvre la clé, la règle devinée est « Dossier = Auto », les boutons sont atteignables`, await displayed(page, '#link-config-modal') && JSON.stringify(await selectValues(page)) === JSON.stringify(['Dossier', 'id']) && await reachable(page, '#link-config-confirm'), { shown: await displayed(page, '#link-config-modal'), values: await selectValues(page) });
    await click(page, '#link-config-confirm');
    await sleep(800);
    check(`${tag} 3 : « Valider » écrit le lien (une écriture) et la variable est posée`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]) && JSON.stringify(await linkWrites(page)) === '["AddRecord"]' && JSON.stringify(await badges(page)) === '["Contacts.Fonction"]', { rules: await rules(page), writes: await linkWrites(page), badges: await badges(page) });
    await toEnd(page);
    await page.keyboard.type(' APRES');
    await sleep(700);
    await clearWrites(page);
    await key(page, 'Control+z');
    check(`${tag} 3 : 1er Ctrl + Z : le texte d'après seul`, !/APRES/.test(await text(page)) && JSON.stringify(await badges(page)) === '["Contacts.Fonction"]' && JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]), { text: await text(page), badges: await badges(page), rules: await rules(page) });
    await key(page, 'Control+z');
    check(`${tag} 3 : 2e Ctrl + Z : la variable seule, le lien reste`, (await badges(page)).length === 0 && JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]) && JSON.stringify(await linkWrites(page)) === '[]', { badges: await badges(page), rules: await rules(page), writes: await linkWrites(page) });
    await key(page, 'Control+z');
    check(`${tag} 3 : 3e Ctrl + Z : le lien est retiré (une écriture), le coin d'état le nomme`, JSON.stringify(await rules(page)) === '[]' && JSON.stringify(await linkWrites(page)) === '["RemoveRecord"]' && (await status(page)) === await said(page, 'status.linkRemoved', labelA), { rules: await rules(page), writes: await linkWrites(page), status: await status(page) });
    check(`${tag} 3 : le texte d'avant est encore là`, / AVANT/.test(await text(page)), await text(page));
    await key(page, 'Control+y');
    check(`${tag} 3 : 1er Ctrl + Y : le lien revient, la variable pas encore`, JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]) && (await badges(page)).length === 0 && (await status(page)) === await said(page, 'status.linkRestored', labelA), { rules: await rules(page), badges: await badges(page), status: await status(page) });
    await key(page, 'Control+y');
    check(`${tag} 3 : 2e Ctrl + Y : la variable`, JSON.stringify(await badges(page)) === '["Contacts.Fonction"]' && JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]), { badges: await badges(page), rules: await rules(page) });
    await key(page, 'Control+y');
    check(`${tag} 3 : 3e Ctrl + Y : le texte d'après`, / APRES/.test(await text(page)), await text(page));

    // --- 4) l'ordre avec le texte ---
    await clearLinks(page);
    await seedLink(page, { table: 'Contacts', rule: { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id', tableSource: 'Dossiers' } });
    await toEnd(page);
    await page.keyboard.type(' RANG');
    await sleep(700);
    await openPanel(page);
    await clickWhere(page, () => document.querySelector('#link-rules-list .link-rule-btn-delete'));
    await sleep(500);
    await click(page, DIALOG_OK);
    await sleep(800);
    await closePanel(page);
    await toEnd(page);
    await page.keyboard.type(' ORDRE');
    await sleep(700);
    check(`${tag} 4 : le texte, le lien retiré, le texte`, / RANG/.test(await text(page)) && / ORDRE/.test(await text(page)) && JSON.stringify(await rules(page)) === '[]', { text: await text(page), rules: await rules(page) });
    await key(page, 'Control+z');
    check(`${tag} 4 : 1er Ctrl + Z : le second texte seul`, !/ ORDRE/.test(await text(page)) && / RANG/.test(await text(page)) && JSON.stringify(await rules(page)) === '[]', { text: await text(page), rules: await rules(page) });
    await key(page, 'Control+z');
    check(`${tag} 4 : 2e Ctrl + Z : le lien seul`, / RANG/.test(await text(page)) && JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]), { text: await text(page), rules: await rules(page) });
    await key(page, 'Control+z');
    check(`${tag} 4 : 3e Ctrl + Z : le premier texte`, !/ RANG/.test(await text(page)) && JSON.stringify(await rules(page)) === JSON.stringify([ROW_A]), { text: await text(page), rules: await rules(page) });
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    check(`${tag} 4 : 2e Ctrl + Y : le premier texte et le lien retiré`, / RANG/.test(await text(page)) && !/ ORDRE/.test(await text(page)) && JSON.stringify(await rules(page)) === '[]', { text: await text(page), rules: await rules(page) });
    await key(page, 'Control+y');
    check(`${tag} 4 : 3e Ctrl + Y : le second texte`, / ORDRE/.test(await text(page)) && JSON.stringify(await rules(page)) === '[]', { text: await text(page), rules: await rules(page) });

    check(`${tag} 5 : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await phase('fr', 'light');
  await phase('en', 'dark');
} finally {
  await stopServer();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
