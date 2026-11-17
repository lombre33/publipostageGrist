#!/usr/bin/env node
// « Quelle valeur je lis ? » (js/reading-value.js ; demande d'Antoine du 17/11 : « lorsque j'ai une liste et un export par valeur, ai-je une solution en mode lecture pour passer au suivant/précédent ? »),
// à la vraie souris et à 700x400, en clair, en sombre puis en anglais. Une variable de liste réglée « Un document par valeur » (js/list-split.js) fait sortir un document par valeur à l'export ; la Lecture
// montre maintenant celui d'UNE valeur, et une seconde pastille « ‹ Santé · valeur 1 sur 3 › » passe à la valeur d'avant ou d'après :
//   1) en Édition la pastille est cachée ; en Lecture d'une ligne qui fait trois documents elle dit « Santé · valeur 1 sur 3 », « précédente » grisée, et la Lecture n'écrit que « Santé » (pas « Social » ni « Sport ») ;
//      elle est posée à droite de la pastille des lignes, sur la même base, dans le coin bas gauche de la zone de lecture, sans la recouvrir ;
//   2) « suivante » (vrai clic) montre « Social » (valeur 2 sur 3), puis « Sport » où « suivante » est grisée ; « précédente » revient ; le texte lu est celui que l'export écrit pour cette valeur
//      (ListSplit.plan et ListSplit.pin, les mêmes appels que l'export), les en-têtes et pieds de page prennent la même valeur ;
//   3) la flèche des lignes (la pastille d'à côté) mène à une ligne d'une seule valeur ou à une liste vide : plus de pastille de valeur, la Lecture écrit la liste comme elle est réglée ; une autre ligne
//      de plusieurs valeurs repart de la première ; revenir à la première ligne aussi ;
//   4) la même ligne redessinée (une cellule change dans Grist) garde la valeur lue ;
//   5) deux listes réglées sur des colonnes différentes font un document par combinaison : « document 1 sur 6 » ;
//   6) une liste que rien ne règle « Un document par valeur » ne change rien : pas de pastille, la liste entière ;
//   7) la Lecture épurée et l'Édition ne la montrent pas ; elle devient presque transparente pendant le défilement ; dans un panneau étroit (330 px) elle passe au-dessus de la pastille des lignes ;
//   8) le modèle d'un e-mail n'est jamais découpé : pas de pastille, la liste entière ;
//   9) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « readingValueMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-reading-value-mouse.mjs
import { open, stopServer, sleep, click, fire } from './load-lib.mjs';

const PORT = Number(process.env.READING_VALUE_PORT || 9024);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const TABLE = 'RvDossiers';
const SPEC = { tables: [{ id: TABLE, rows: 4, columns: [{ id: 'Titre', type: 'Text' }, { id: 'Themes', type: 'ChoiceList', choices: ['Santé', 'Social', 'Sport'] }, { id: 'Langues', type: 'ChoiceList', choices: ['fr', 'en'] }] }], models: { count: 1, paragraphs: 2, table: TABLE, columns: ['Titre'], firstIsDefault: true } };
const ROWS = [
  { id: 1, Titre: 'Alpha', Themes: ['L', 'Santé', 'Social', 'Sport'], Langues: ['L', 'fr', 'en'] },
  { id: 2, Titre: 'Beta', Themes: ['L', 'Sport'], Langues: ['L', 'fr'] },
  { id: 3, Titre: 'Gamma', Themes: null, Langues: null },
  { id: 4, Titre: 'Delta', Themes: ['L', 'Santé', 'Social'], Langues: ['L', 'en'] },
];
const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

const chipOf = (page, id) => page.evaluate(chipId => {
  const el = document.getElementById(chipId);
  if (!el) return null;
  const shown = !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const buttons = Array.from(el.querySelectorAll('button'));
  const box = el.getBoundingClientRect();
  return { shown, text: el.textContent, prevOff: buttons[0].disabled, nextOff: buttons[1].disabled, opacity: Number(getComputedStyle(el).opacity), pe: getComputedStyle(el).pointerEvents, left: box.left, right: box.right, top: box.top, bottom: box.bottom, title: el.title };
}, id);
const value = page => chipOf(page, 'pp-reading-value');
const line = page => chipOf(page, 'pp-reading-line');
const readerText = page => page.evaluate(() => (document.getElementById('reader-container').textContent || '').replace(/\s+/g, ' ').trim());
const status = page => page.evaluate(() => ({ text: document.getElementById('status-msg').textContent, error: document.getElementById('status-msg').classList.contains('error-msg') }));
async function clickArrow(page, chipId, which) {
  const r = await page.evaluate(({ chipId, index }) => {
    const b = document.querySelectorAll('#' + chipId + ' button')[index].getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, { chipId, index: which === 'next' ? 1 : 0 });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.mouse.click(r.x, r.y);
  await sleep(900);
}
const nextValue = (page) => clickArrow(page, 'pp-reading-value', 'next');
const prevValue = (page) => clickArrow(page, 'pp-reading-value', 'prev');
const nextRow = (page) => clickArrow(page, 'pp-reading-line', 'next');
const prevRow = (page) => clickArrow(page, 'pp-reading-line', 'prev');

// Le modèle : une variable de la colonne, en bulle « Un document par valeur » ou non.
const attr = (name, v) => ` ${name}="${JSON.stringify(v).replace(/"/g, '&quot;')}"`;
const badge = (column, format) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${format ? attr('data-format', format) : ''}></span>`;
const PER = { list: { perValue: true } };
const bodyOf = (themes, langues) => `<p>Dossier ${badge('Titre')} : thème ${badge('Themes', themes)}</p>` + (langues === undefined ? '' : `<p>Langue ${badge('Langues', langues)}</p>`);

async function setModel(page, body, hf) {
  await page.evaluate(({ body, hf }) => { Editor.setHTML(body); Editor.setHeaderFooterData(hf); }, { body, hf: hf || NO_HF });
  await sleep(200);
}
async function toReading(page) {
  await click(page, '#btn-mode-read');
  await sleep(1200);
}
async function toEdit(page) {
  await click(page, '#btn-mode-edit');
  await sleep(900);
}

async function run(lang, scheme, w) {
  const L = `${scheme}/${lang}`;
  const fr = lang === 'fr';
  const page = w.page;
  const pos = (n, total) => (fr ? `valeur ${n} sur ${total}` : `value ${n} of ${total}`);
  const doc = (n, total) => (fr ? `document ${n} sur ${total}` : `document ${n} of ${total}`);
  const row = (n, total) => (fr ? `ligne ${n} sur ${total}` : `row ${n} of ${total}`);
  await page.evaluate(({ table, rows }) => {
    const stub = window.__gristStub;
    stub.setVariables(table, { Titre: 'Text', Themes: 'ChoiceList', Langues: 'ChoiceList' });
    stub.setRows(table, rows);
  }, { table: TABLE, rows: ROWS });
  await page.evaluate(() => GristAPI.refreshSchema());
  await fire(page, TABLE, 1);
  await sleep(300);
  // Un pied de page qui écrit la même liste : il prend la valeur lue, comme à l'export.
  const HF = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>Pied ${badge('Themes', PER)}</p>`, first: '' } };
  await setModel(page, bodyOf(PER), HF);

  let c = await value(page);
  check(`${L} : en Édition, la pastille de valeur est cachée`, !c || !c.shown, c);

  await toReading(page);
  c = await value(page);
  let l = await line(page);
  check(`${L} : en Lecture, la pastille dit « Santé · ${pos(1, 3)} », « précédente » grisée, « suivante » active`, !!c && c.shown && c.text === `Santé · ${pos(1, 3)}` && c.prevOff && !c.nextOff, c);
  let text = await readerText(page);
  check(`${L} : la Lecture n'écrit que la première valeur`, text.includes('Dossier Alpha : thème Santé') && !text.includes('Social') && !text.includes('Sport'), text.slice(0, 160));
  check(`${L} : la pastille des lignes est toujours là (« ${row(1, 4)} »)`, !!l && l.shown && l.text === `Alpha · ${row(1, 4)}`, l);
  check(`${L} : la pastille de valeur est à droite de celle des lignes, sur la même base, sans la recouvrir`, !!c && !!l && c.left >= l.right && Math.abs(c.bottom - l.bottom) <= 1 && c.left - l.right < 12, { c, l });
  check(`${L} : son info-bulle nomme la valeur et dit ce que la Lecture montre`, !!c && c.title.startsWith(`Santé · ${pos(1, 3)}`) && c.title.split('\n').length === 2, c && c.title);

  await nextValue(page);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : « suivante » dit « Social · ${pos(2, 3)} », les deux flèches actives`, !!c && c.text === `Social · ${pos(2, 3)}` && !c.prevOff && !c.nextOff, c);
  check(`${L} : la Lecture n'écrit que « Social »`, text.includes('thème Social') && !text.includes('Santé') && !text.includes('Sport'), text.slice(0, 160));
  await nextValue(page);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : à la dernière valeur, « suivante » est grisée (« Sport · ${pos(3, 3)} »)`, !!c && c.text === `Sport · ${pos(3, 3)}` && c.nextOff && !c.prevOff, c);
  check(`${L} : la Lecture n'écrit que « Sport »`, text.includes('thème Sport') && !text.includes('Santé') && !text.includes('Social'), text.slice(0, 160));
  await prevValue(page);
  c = await value(page);
  check(`${L} : « précédente » revient à « Social · ${pos(2, 3)} »`, !!c && c.text === `Social · ${pos(2, 3)}`, c);

  // Le même document que l'export : le plan de la ligne et sa réécriture, ceux de js/main-export.js (currentRecordDocument), puis la même résolution que la Lecture.
  const exported = await page.evaluate(async ({ table }) => {
    const record = GristAPI.getCurrentRecord();
    const html = await currentDocumentHtmlForTest();
    const hf = Editor.getHeaderFooterData();
    const plan = await ListSplit.plan(ListSplit.partsOf(html, hf), table, record);
    const out = [];
    for (const variant of plan.variants) {
      const resolved = await ReaderMode.resolvedHtml(() => ListSplit.pin(html, variant), table, record);
      const footer = ListSplit.pinHeaderFooter(hf, variant).footer.default;
      const foot = await ReaderMode.resolvedHtml(() => footer, table, record);
      const holder = document.createElement('div');
      holder.innerHTML = resolved.html;
      const footHolder = document.createElement('div');
      footHolder.innerHTML = foot.html;
      out.push({ body: holder.textContent.replace(/\s+/g, ' ').trim(), footer: footHolder.textContent.replace(/\s+/g, ' ').trim() });
    }
    return out;
    async function currentDocumentHtmlForTest() { return SlidesEntry.outputHtml('document', Editor.getHTML(), { theme: PageLayout.getTheme(), anchors: true }); }
  }, { table: TABLE });
  check(`${L} : le plan de l'export compte les mêmes trois documents, et le pied de page de chacun écrit sa valeur`, exported.length === 3 && exported.map(e => e.footer).join('|') === 'Pied Santé|Pied Social|Pied Sport', exported);
  check(`${L} : le texte lu à la valeur 2 est celui que l'export écrit pour elle`, !!exported[1] && text !== undefined && (await readerText(page)).startsWith(exported[1].body), { got: (await readerText(page)).slice(0, 80), want: exported[1] && exported[1].body });
  const turn = await page.evaluate(async () => {
    const record = GristAPI.getCurrentRecord();
    const hf = Editor.getHeaderFooterData();
    const t = ReadingValue.turn(GristAPI.getCurrentTableId(), record, hf, 'essai');
    const pinned = await t.pin(Editor.getHTML());
    const data = t.headerFooterData();
    return { footerPinned: /"index":1/.test(data.footer.default) || /&quot;index&quot;:1/.test(data.footer.default), bodyPinned: pinned !== Editor.getHTML() };
  });
  check(`${L} : les en-têtes et pieds de page de la Lecture prennent la valeur du corps`, turn.bodyPinned && turn.footerPinned, turn);

  // Une autre ligne : une seule valeur, puis aucune.
  await nextRow(page);
  c = await value(page);
  l = await line(page);
  text = await readerText(page);
  check(`${L} : la ligne suivante n'a qu'une valeur : plus de pastille de valeur, la liste écrite comme réglée`, (!c || !c.shown) && !!l && l.text === `Beta · ${row(2, 4)}` && text.includes('thème Sport'), { c, l, text: text.slice(0, 100) });
  await nextRow(page);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : la ligne d'après a une liste vide : pas de pastille de valeur`, (!c || !c.shown) && text.includes('Dossier Gamma'), { c, text: text.slice(0, 100) });
  await nextRow(page);
  c = await value(page);
  l = await line(page);
  check(`${L} : la ligne 4 fait deux documents : la pastille revient, à la première valeur (« Santé · ${pos(1, 2)} »)`, !!c && c.shown && c.text === `Santé · ${pos(1, 2)}` && !!l && l.text === `Delta · ${row(4, 4)}`, { c, l });
  check(`${L} : à sa droite, comme avant`, !!c && !!l && c.left >= l.right, { c, l });
  await nextValue(page);
  c = await value(page);
  check(`${L} : « suivante » mène à « Social · ${pos(2, 2)} » et se grise`, !!c && c.text === `Social · ${pos(2, 2)}` && c.nextOff && !c.prevOff, c);

  // La même ligne redessinée (une cellule change dans Grist) garde la valeur lue.
  await page.evaluate(() => {
    const stub = window.__gristStub;
    stub.setRows('RvDossiers', [
      { id: 1, Titre: 'Alpha', Themes: ['L', 'Santé', 'Social', 'Sport'], Langues: ['L', 'fr', 'en'] },
      { id: 2, Titre: 'Beta', Themes: ['L', 'Sport'], Langues: ['L', 'fr'] },
      { id: 3, Titre: 'Gamma', Themes: null, Langues: null },
      { id: 4, Titre: 'Delta bis', Themes: ['L', 'Santé', 'Social'], Langues: ['L', 'en'] },
    ]);
  });
  await fire(page, TABLE, 4);
  await sleep(1000);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : une cellule changée sur la même ligne garde la valeur lue (« Social · ${pos(2, 2)} »)`, !!c && c.text === `Social · ${pos(2, 2)}` && text.includes('Dossier Delta bis : thème Social'), { c, text: text.slice(0, 100) });

  // Revenir à la ligne 1 repart de la première valeur.
  await prevRow(page);
  await prevRow(page);
  await prevRow(page);
  c = await value(page);
  l = await line(page);
  check(`${L} : revenir à la ligne 1 repart de la première valeur (« Santé · ${pos(1, 3)} »)`, !!c && c.text === `Santé · ${pos(1, 3)}` && !!l && l.text === `Alpha · ${row(1, 4)}`, { c, l });

  // Défilement : presque transparente et sans clic, puis elle revient.
  await page.evaluate(() => { const r = document.getElementById('reader-container'); const filler = document.createElement('div'); filler.id = 'rv-filler'; filler.style.height = '2000px'; r.appendChild(filler); r.scrollTop = 0; });
  await sleep(300);
  await page.mouse.move(350, 200);
  await page.mouse.wheel(0, 300);
  await sleep(250);
  c = await value(page);
  check(`${L} : pendant le défilement, la pastille devient presque transparente et ne reçoit plus de clic`, !!c && c.opacity < 0.5 && c.pe === 'none', c);
  await sleep(1700);
  c = await value(page);
  check(`${L} : puis elle revient`, !!c && c.opacity === 1 && c.pe !== 'none', c);
  await page.evaluate(() => { const f = document.getElementById('rv-filler'); if (f) f.remove(); });

  // Un panneau étroit : la pastille de valeur passe au-dessus de celle des lignes plutôt que sous le coin du zoom.
  await page.setViewportSize({ width: 330, height: 400 });
  await sleep(700);
  c = await value(page);
  l = await line(page);
  check(`${L} : dans un panneau de 330 px elle passe au-dessus de la pastille des lignes, au même bord gauche`, !!c && !!l && c.shown && c.bottom <= l.top + 1 && Math.abs(c.left - l.left) <= 1, { c, l });
  await page.setViewportSize({ width: 700, height: 400 });
  await sleep(700);
  c = await value(page);
  l = await line(page);
  check(`${L} : le panneau élargi, elle revient à droite de la pastille des lignes`, !!c && !!l && c.left >= l.right && Math.abs(c.bottom - l.bottom) <= 1, { c, l });

  // Deux listes : un document par combinaison.
  await toEdit(page);
  await setModel(page, bodyOf(PER, PER), NO_HF);
  await toReading(page);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : deux listes réglées font un document par combinaison : « Santé - fr · ${doc(1, 6)} »`, !!c && c.shown && c.text === `Santé - fr · ${doc(1, 6)}` && text.includes('thème Santé') && text.includes('Langue fr'), { c, text: text.slice(0, 100) });
  await nextValue(page);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : la deuxième combinaison est « Santé - en »`, !!c && c.text === `Santé - en · ${doc(2, 6)}` && text.includes('thème Santé') && text.includes('Langue en'), { c, text: text.slice(0, 100) });
  await nextValue(page);
  c = await value(page);
  check(`${L} : puis « Social - fr » (la première liste change le plus lentement)`, !!c && c.text === `Social - fr · ${doc(3, 6)}`, c);

  // Une liste que rien ne règle : la liste entière, pas de pastille.
  await toEdit(page);
  await setModel(page, bodyOf(undefined), NO_HF);
  await toReading(page);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : sans réglage « Un document par valeur », la Lecture écrit toute la liste et n'a pas de pastille de valeur`, (!c || !c.shown) && text.includes('Santé, Social, Sport'), { c, text: text.slice(0, 100) });

  // La Lecture épurée ne la montre pas.
  await toEdit(page);
  await setModel(page, bodyOf(PER), NO_HF);
  await toReading(page);
  c = await value(page);
  check(`${L} : le modèle réglé de nouveau, la pastille revient et garde la place lue (« Sport · ${pos(3, 3)} », la combinaison 3 n'existant plus)`, !!c && c.shown && c.text === `Sport · ${pos(3, 3)}`, c);
  await prevValue(page);
  await prevValue(page);
  c = await value(page);
  check(`${L} : « précédente » deux fois revient à « Santé · ${pos(1, 3)} »`, !!c && c.text === `Santé · ${pos(1, 3)}` && c.prevOff, c);
  await toEdit(page);
  await page.evaluate(() => CleanReading.choose('clean'));
  await click(page, '#btn-mode-read');
  await sleep(1200);
  c = await value(page);
  check(`${L} : la Lecture épurée ne la montre pas`, !c || !c.shown, c);
  await page.evaluate(() => CleanReading.exit());
  await sleep(900);
  await page.evaluate(() => CleanReading.choose('read'));
  await toEdit(page);
  c = await value(page);
  check(`${L} : de retour en Édition, la pastille est cachée`, !c || !c.shown, c);

  // Le modèle d'un e-mail n'est jamais découpé.
  await page.evaluate(() => document.getElementById('v2-btn-new-email').click());
  await sleep(1200);
  await setModel(page, bodyOf(PER), NO_HF);
  await toReading(page);
  c = await value(page);
  text = await readerText(page);
  check(`${L} : le modèle d'un e-mail écrit la liste comme réglée : pas de pastille de valeur`, (!c || !c.shown) && text.includes('Santé, Social, Sport'), { c, text: text.slice(0, 120) });
}

let w = null;
const errors = [];
try {
  for (const [scheme, lang] of [['light', 'fr'], ['dark', 'fr'], ['light', 'en']]) {
    console.log(`\n[${scheme} / ${lang}]`);
    w = await open({ spec: SPEC, port: PORT, settleMs: 2000, theme: scheme, lang });
    await run(lang, scheme, w);
    errors.push(...w.errors);
    await w.close();
    w = null;
  }
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  failed++;
  total++;
  console.log('  FAIL - exception : ' + (e && e.stack || e));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failed) + '/' + total + ' passés');
process.exit(failed ? 1 : 0);
