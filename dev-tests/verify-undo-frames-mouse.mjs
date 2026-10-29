#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les gestes de la BARRE DE L'OBJET d'une diapositive (js/free-frame.js : `reorder`, `duplicate`, `remove`, `patch` des menus de couleur) - suite de la demande du 22/10 (« Il doit
// prendre en compte 100% des actions faites dans le widget ») : le premier plan, l'arrière-plan, « Dupliquer », « Supprimer », le fond et le trait d'une forme. Chaque geste est UNE transaction de l'éditeur ; ce que ce script ajoute, ce sont les
// Ctrl + Z que rien n'essayait (dev-tests/undo-ledger.json : ces six contrôles étaient en attente, lot 2g). À la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js),
// l'extension « diapositives » active.
//   1) « Premier plan » : l'objet passe devant les autres ; UN Ctrl + Z le rend à sa place, la sélection (et sa barre) le suit ; UN Ctrl + Y le remet devant ; sur l'objet déjà devant, le bouton ne laisse aucun pas ;
//   2) « Arrière-plan » : même parcours ;
//   3) « Dupliquer » : la copie est ajoutée devant, décalée, sélectionnée ; UN Ctrl + Z la retire, UN Ctrl + Y la rend au même endroit ;
//   4) « Supprimer » : l'objet disparaît ; UN Ctrl + Z le rend tel quel (texte, position, taille, rang), UN Ctrl + Y le supprime de nouveau ;
//   5) le fond d'une forme (menu de la pastille, une couleur puis « Sans remplissage ») : UN pas par choix ;
//   6) le trait d'une forme : la couleur choisie apporte l'épaisseur d'une forme neuve, les deux se défont d'un seul Ctrl + Z ;
//   7) l'enchaînement (premier plan, dupliquer, supprimer) : trois Ctrl + Z dans l'ordre inverse, trois Ctrl + Y dans l'ordre, puis les boutons de la barre ;
//   8) du texte, un objet supprimé : deux Ctrl + Z dans l'ordre inverse.
// Lancé par run-headless.mjs (groupe Node « undoFramesMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-frames-mouse.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-undo-frames-mouse', port: Number(process.env.UNDO_FRAMES_MOUSE_PORT || 9161) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const FRAME = (x, y, w, h, name) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${name}</p></div></div></div>`;
// Une diapositive commence par ses objets (le dernier est devant), puis son texte : c'est là que `headRange` de js/free-frame.js les range et que « Premier plan » et « Dupliquer » les posent.
const SLIDE = `${FRAME(40, 100, 220, 60, 'Alpha')}${FRAME(300, 100, 220, 60, 'Bravo')}${FRAME(40, 200, 220, 60, 'Charlie')}<h2>Titre</h2>`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Cadres', '${SLIDE}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;
const TEXTS = {
  fr: { front: 'Premier plan', back: 'Arrière-plan', duplicate: 'Dupliquer', delete: 'Supprimer' },
  en: { front: 'Bring to front', back: 'Send to back', duplicate: 'Duplicate', delete: 'Delete' },
};

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const rectOf = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selector);
  // Le vrai clic : la souris vient d'à côté, s'arrête, clique.
  const click = async (selector) => {
    const c = await rectOf(selector);
    if (!c) { check(tag + 'introuvable : ' + selector, false); return null; }
    await page.mouse.move(c.x - 6, c.y);
    await page.mouse.move(c.x, c.y, { steps: 2 });
    await sleep(80);
    await page.mouse.click(c.x, c.y);
    await sleep(350);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  const key = async (combo) => { await page.keyboard.press(combo); await sleep(450); };
  const open = async (id) => {
    await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id), sleep(20000)]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('#editor-container .pp-free-frame'), null, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  // Les objets de la diapositive, dans l'ordre du document (le dernier est devant) : texte, mesures, fond et trait.
  const frames = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach((node) => {
      if (node.type.name === 'freeFrame') out.push({ text: node.textContent, x: node.attrs.x, y: node.attrs.y, w: node.attrs.w, h: node.attrs.h, fill: node.attrs.fill || '', line: node.attrs.line || '', lw: node.attrs.lw || 0 });
    });
    return out;
  });
  const order = async () => (await frames()).map(f => f.text).join(' ');
  const frameNamed = async name => (await frames()).find(f => f.text === name) || null;
  const selectFrame = async (name) => {
    await page.evaluate((n) => {
      const ed = EditorCore.getEditor();
      let at = -1;
      ed.state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame' && node.textContent === n && at < 0) at = pos; });
      if (at < 0) return;
      FreeFrame.select(ed, at);
      const dom = ed.view.nodeDOM(at);
      if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'center', inline: 'center' });
    }, name);
    await sleep(400);
  };
  // L'objet sélectionné (son texte), et si sa barre est montrée.
  const selected = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s.node && s.node.type.name === 'freeFrame' ? s.node.textContent : null; });
  const barShown = () => page.evaluate(() => { const b = document.querySelector('.v2-frame-toolbar'); return !!b && b.classList.contains('visible') && b.getBoundingClientRect().width > 0; });
  const bar = action => `.v2-frame-toolbar [data-action="${action}"]`;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Le fond et le trait d'un objet (vides quand l'objet manque : un échec noté, pas une exception).
  const fillOf = f => ((f && f.fill) || '').toLowerCase();
  const lineOf = f => ((f && f.line) || '').toLowerCase();
  // Un menu de couleur de la barre : on n'en rouvre un que fermé (le bouton bascule) ; la souris quitte la barre d'abord (un volet resté ouvert sous elle prendrait le clic).
  const menuOpen = () => page.evaluate(() => !!document.querySelector('.v2-color-dropdown.visible'));
  const pickColor = async (which, color) => {
    if (await menuOpen()) await click(`#v2-frame-${which === 'fill' ? 'line' : 'fill'}-open[aria-expanded="true"], #v2-frame-${which}-open[aria-expanded="true"]`);
    await leave();
    await click(`#v2-frame-${which}-open`);
    await click(color ? `.v2-color-dropdown.visible [data-color="${color}"]` : '.v2-color-dropdown.visible [data-action="none"]');
  };

  await open(7);
  const start0 = await frames();
  const startOrder = start0.map(f => f.text).join(' ');
  console.log('\n' + tag + '0) Le départ');
  check(tag + 'trois objets dans l\'ordre du document, aucun fond ni trait', startOrder === 'Alpha Bravo Charlie' && start0.every(f => !f.fill && !f.line), start0);

  console.log('\n' + tag + '1) « ' + T.front + ' »');
  await selectFrame('Alpha');
  check(tag + 'la barre de l\'objet est montrée avec « ' + T.front + ' » atteignable', (await barShown()) && !!(await rectOf(bar('front'))), await barShown());
  await click(bar('front'));
  check(tag + 'un vrai clic met Alpha devant (dernier du document) et le garde sélectionné', (await order()) === 'Bravo Charlie Alpha' && (await selected()) === 'Alpha', { order: await order(), selected: await selected() });
  await key('Control+z');
  check(tag + 'UN Ctrl + Z rend Alpha à sa place, sélectionné, sa barre montrée', (await order()) === 'Alpha Bravo Charlie' && same(await frames(), start0) && (await selected()) === 'Alpha' && await barShown(), { order: await order(), selected: await selected(), bar: await barShown() });
  await key('Control+y');
  check(tag + 'UN Ctrl + Y le remet devant, toujours sélectionné', (await order()) === 'Bravo Charlie Alpha' && (await selected()) === 'Alpha', { order: await order(), selected: await selected() });
  await key('Control+z');
  await selectFrame('Charlie');
  await click(bar('front'));
  check(tag + 'sur l\'objet déjà devant, « ' + T.front + ' » ne change rien', (await order()) === 'Alpha Bravo Charlie', await order());

  console.log('\n' + tag + '2) « ' + T.back + ' »');
  await selectFrame('Charlie');
  await click(bar('back'));
  check(tag + 'un vrai clic met Charlie derrière (premier du document) et le garde sélectionné', (await order()) === 'Charlie Alpha Bravo' && (await selected()) === 'Charlie', { order: await order(), selected: await selected() });
  await key('Control+z');
  check(tag + 'UN Ctrl + Z rend Charlie à sa place, sélectionné', (await order()) === 'Alpha Bravo Charlie' && same(await frames(), start0) && (await selected()) === 'Charlie' && await barShown(), { order: await order(), selected: await selected() });
  await key('Control+y');
  check(tag + 'UN Ctrl + Y le remet derrière', (await order()) === 'Charlie Alpha Bravo' && (await selected()) === 'Charlie', { order: await order(), selected: await selected() });
  await key('Control+z');

  console.log('\n' + tag + '3) « ' + T.duplicate + ' »');
  await selectFrame('Bravo');
  await click(bar('duplicate'));
  const duplicated = await frames();
  check(tag + 'un vrai clic ajoute une copie de Bravo devant, décalée, et la sélectionne', duplicated.length === 4 && duplicated[3].text === 'Bravo' && duplicated[3].x === 312 && duplicated[3].y === 112 && (await selected()) === 'Bravo', { frames: duplicated, selected: await selected() });
  await key('Control+z');
  check(tag + 'UN Ctrl + Z retire la copie : trois objets, comme au départ, Bravo sélectionné et sa barre montrée', same(await frames(), start0) && (await selected()) === 'Bravo' && await barShown(), { frames: await frames(), selected: await selected(), bar: await barShown() });
  await key('Control+y');
  check(tag + 'UN Ctrl + Y rend la copie au même endroit', same(await frames(), duplicated), await frames());
  await key('Control+z');

  console.log('\n' + tag + '4) « ' + T.delete + ' »');
  await selectFrame('Alpha');
  await click(bar('delete'));
  check(tag + 'un vrai clic supprime Alpha, et lui seul', (await order()) === 'Bravo Charlie', await order());
  await key('Control+z');
  check(tag + 'UN Ctrl + Z rend Alpha tel quel (texte, position, taille, rang), sélectionné, sa barre montrée', same(await frames(), start0) && (await selected()) === 'Alpha' && await barShown(), { frames: await frames(), selected: await selected(), bar: await barShown() });
  await key('Control+y');
  check(tag + 'UN Ctrl + Y le supprime de nouveau', (await order()) === 'Bravo Charlie', await order());
  await key('Control+z');

  console.log('\n' + tag + '5) Le fond');
  await selectFrame('Alpha');
  await pickColor('fill', '#ef4444');
  let alpha = await frameNamed('Alpha');
  check(tag + 'une pastille choisie au vrai clic pose le fond d\'Alpha', fillOf(alpha) === '#ef4444', alpha);
  await key('Control+z');
  alpha = await frameNamed('Alpha');
  check(tag + 'UN Ctrl + Z retire le fond', !!alpha && fillOf(alpha) === '', alpha);
  await key('Control+y');
  alpha = await frameNamed('Alpha');
  check(tag + 'UN Ctrl + Y le rend', fillOf(alpha) === '#ef4444', alpha);
  await pickColor('fill', null);
  alpha = await frameNamed('Alpha');
  check(tag + '« Sans remplissage » retire le fond', !!alpha && fillOf(alpha) === '', alpha);
  await key('Control+z');
  alpha = await frameNamed('Alpha');
  check(tag + 'UN Ctrl + Z rend le fond rouge', fillOf(alpha) === '#ef4444', alpha);
  await key('Control+z');
  check(tag + 'le Ctrl + Z suivant rend l\'objet comme au départ', same(await frames(), start0), await frames());

  console.log('\n' + tag + '6) Le trait');
  await selectFrame('Bravo');
  await pickColor('line', '#1d4ed8');
  let bravo = await frameNamed('Bravo');
  check(tag + 'une pastille choisie au vrai clic pose le trait de Bravo, avec une épaisseur', lineOf(bravo) === '#1d4ed8' && !!bravo && bravo.lw > 0, bravo);
  await key('Control+z');
  bravo = await frameNamed('Bravo');
  check(tag + 'UN Ctrl + Z retire le trait ET l\'épaisseur que la couleur avait apportée', !!bravo && lineOf(bravo) === '' && bravo.lw === 0, bravo);
  await key('Control+y');
  bravo = await frameNamed('Bravo');
  check(tag + 'UN Ctrl + Y rend le trait et son épaisseur', lineOf(bravo) === '#1d4ed8' && !!bravo && bravo.lw > 0, bravo);
  await key('Control+z');
  check(tag + 'revenu au départ', same(await frames(), start0), await frames());

  console.log('\n' + tag + '7) L\'enchaînement');
  // Des gestes faits à moins de 500 ms l'un de l'autre se groupent dans l'historique de l'éditeur, comme des frappes : une personne qui enchaîne trois clics prend son temps.
  await selectFrame('Alpha');
  await click(bar('front'));
  const afterFront = await frames();
  await sleep(700);
  await click(bar('duplicate'));
  const afterDuplicate = await frames();
  await sleep(700);
  await click(bar('delete'));
  const afterDelete = await frames();
  check(tag + 'premier plan, dupliquer, supprimer : Bravo Charlie Alpha, puis la copie, puis la copie retirée', afterFront.map(f => f.text).join(' ') === 'Bravo Charlie Alpha' && afterDuplicate.map(f => f.text).join(' ') === 'Bravo Charlie Alpha Alpha' && same(afterDelete, afterFront), { afterFront, afterDuplicate, afterDelete });
  await key('Control+z');
  check(tag + 'Ctrl + Z 1 : la copie supprimée revient', same(await frames(), afterDuplicate), await frames());
  await key('Control+z');
  check(tag + 'Ctrl + Z 2 : la copie est retirée', same(await frames(), afterFront), await frames());
  await key('Control+z');
  check(tag + 'Ctrl + Z 3 : Alpha reprend sa place', same(await frames(), start0), await frames());
  await key('Control+y');
  await key('Control+y');
  await key('Control+y');
  check(tag + 'trois Ctrl + Y rendent le tout, dans l\'ordre', same(await frames(), afterDelete), await frames());
  await click('#v2-btn-undo');
  await sleep(500);
  check(tag + 'le bouton Annuler de la barre rend l\'objet supprimé', same(await frames(), afterDuplicate), await frames());
  await click('#v2-btn-redo');
  await sleep(500);
  check(tag + 'le bouton Rétablir de la barre le supprime de nouveau', same(await frames(), afterDelete), await frames());
  await key('Control+z');
  await key('Control+z');
  await key('Control+z');
  check(tag + 'trois Ctrl + Z : de nouveau au départ', same(await frames(), start0), await frames());

  console.log('\n' + tag + '8) Du texte, un objet supprimé');
  await selectFrame('Alpha');
  await click(bar('delete'));
  await sleep(700);
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await sleep(200);
  await page.keyboard.type(' RANG');
  await sleep(700);
  const slideText = () => page.evaluate(() => { let t = ''; EditorCore.getEditor().state.doc.forEach((node) => { if (node.type.name !== 'freeFrame') t += node.textContent; }); return t; });
  check(tag + 'Alpha supprimé, puis du texte tapé après les objets', (await order()) === 'Bravo Charlie' && /RANG/.test(await slideText()), { order: await order(), text: await slideText() });
  await key('Control+z');
  check(tag + 'UN Ctrl + Z défait le texte seul, l\'objet reste supprimé', !/RANG/.test(await slideText()) && (await order()) === 'Bravo Charlie', { text: await slideText(), order: await order() });
  await key('Control+z');
  check(tag + 'le Ctrl + Z suivant rend l\'objet supprimé', same(await frames(), start0), await frames());
  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
