#!/usr/bin/env node
// Les images lourdes hors du texte le temps d'un rendu (js/heavy-images.js, extensions/diapositives/slide-show.js et slide-window.js ; 11/11, un PowerPoint de 29 Mo : « l'ouverture du diaporama dans un
// nouvel onglet prend une éternité » - le texte de 38 Mo, dont 97 % de photos, était relu cinq fois et écrit quatre avant la première diapositive, puis envoyé en entier à la fenêtre). L'app est dans le
// cadre isolé de GFS (sans `allow-same-origin`, plein écran refusé : le diaporama part dans une fenêtre à part), à la vraie souris, 700x400, la politique de sécurité du contenu respectée.
//  `HeavyImages.lighten` : une image lourde d'une balise <img> devient une adresse `blob:` qui rend les mêmes octets ; deux fois la même image, un seul fichier ; une image légère, un texte qui cite un
//   attribut `src="data:…"` en toutes lettres, un base64 mal écrit, une autre balise que <img> restent tels quels ; rien à alléger : null ; `release()` rend les adresses.
//  LA FENÊTRE À PART : le rendu envoyé ne porte plus aucune image lourde dans son texte (il est plus court que la plus petite d'entre elles ne l'était), leurs fichiers partent à part, un par image
//   différente ; la fenêtre les montre, chargées, à la même taille que le panneau ; l'image légère reste écrite dans le texte ; les adresses de l'app sont libérées dès l'envoi ; le texte de l'éditeur n'a
//   pas changé et rien n'est enregistré ; la fenêtre rechargée retrouve ses images.
//  LE PANNEAU (interrupteur « Plein écran » décoché) : les images lourdes y sont montrées par leur adresse courte, chargées, et libérées à la sortie.
//  LA VUE INTERVENANT : la console montre la diapositive en cours et la suivante avec leurs images chargées, la fenêtre aussi ; tout est libéré à la sortie.
//  LE RAPPORT DE FLUIDITÉ (js/perf-trace.js, temporaire) garde les étapes du départ - départ, fenêtre demandée, fenêtre prête, rendu envoyé, première diapositive - pour la fenêtre comme pour le panneau.
// Lancé par run-headless.mjs (groupe Node "heavyImages", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-heavy-images.mjs
import zlib from 'node:zlib';
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-heavy-images', port: Number(process.env.HEAVY_IMAGES_PORT || 9443), popupBlocker: true });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

// Un PNG de bruit (incompressible) : 64 x 64 points font plus de 12 Ko, donc plus de 16 000 caractères en base64.
function noisePng(width, height, seed) {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  let x = seed;
  for (let i = 0; i < raw.length; i += 1) { x = (x * 1103515245 + 12345) & 0x7fffffff; raw[i] = i % row === 0 ? 0 : (x >> 16) & 255; }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const HEAVY_A = 'data:image/png;base64,' + noisePng(64, 64, 7).toString('base64');
const HEAVY_B = 'data:image/png;base64,' + noisePng(72, 48, 99).toString('base64');
const SMALL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const img = (src, width) => `<p><img class="editor-image" src="${src}" alt="" style="width: ${width}px;"></p>`;
// Trois diapositives : A ; A de nouveau et B ; l'image légère.
const DECK = `<h2>Un</h2>${img(HEAVY_A, 128)}${BR}<h2>Deux</h2>${img(HEAVY_A, 64)}${img(HEAVY_B, 144)}${BR}<h2>Trois</h2>${img(SMALL, 40)}`;
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(8, 'Photos', ${JSON.stringify(DECK)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 10;
`;

function toolsOf(tab) {
  const { page, app } = tab;
  let shift = null;
  const offset = async () => {
    if (!shift) {
      const frame = app === page ? null : await app.frameElement();
      const box = frame ? await frame.boundingBox() : null;
      shift = box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
    }
    return shift;
  };
  const centerOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [selector, index]);
  const click = async (selector, index = 0, settle = 250) => {
    const c = await centerOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    const o = await offset();
    await page.mouse.move(c.x + o.x - 10, c.y + o.y);
    await page.mouse.move(c.x + o.x, c.y + o.y, { steps: 2 });
    await sleep(80);
    await page.mouse.click(c.x + o.x, c.y + o.y);
    await sleep(settle);
  };
  return { click };
}
const saves = app => app.evaluate(() => window.__gristStub.countSaves('Publipostage_Modeles'));
const open = async (tab, id, slides) => {
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, count]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === count;
  }, [id, slides], { timeout: 15000 }).catch(() => {});
  await sleep(800);
};
async function playAndCatch(A, a, wait = 15000) {
  const caught = A.page.waitForEvent('popup', { timeout: wait }).catch(() => null);
  await a.click('.pp-slide-show-open', 0, 150);
  return caught;
}
const waitCounter = target => target.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 20000 }).catch(() => {});
// Les images du rendu que `target` (la fenêtre, ou le cadre de l'app) porte dans le conteneur d'identifiant `hostId` : l'adresse (son début), la largeur demandée, chargée ou non, sa taille naturelle.
const imagesIn = (target, hostId) => target.evaluate(async (id) => {
  const host = document.getElementById(id);
  const root = host && host.shadowRoot ? host.shadowRoot : null;
  if (!root) return null;
  const list = Array.from(root.querySelectorAll('img.editor-image'));
  await Promise.all(list.map(node => (node.complete ? null : new Promise((resolve) => { node.addEventListener('load', resolve, { once: true }); node.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 5000); }))));
  return list.map(node => ({ scheme: (node.getAttribute('src') || '').split(':')[0], src: node.getAttribute('src') || '', asked: parseFloat(node.style.width) || 0, natural: [node.naturalWidth, node.naturalHeight], complete: node.complete }));
}, hostId);
// Une adresse `blob:` se lit-elle encore depuis `target` ?
const readable = (target, urls) => target.evaluate(list => Promise.all(list.map(url => fetch(url).then(r => r.ok, () => false))), urls);
// Les étapes du diaporama que le rapport de fluidité a gardées, sans leur préfixe.
const showMarks = app => app.evaluate(() => PerfTrace.events().filter(e => e.kind === 'mark' && e.label.indexOf('diaporama : ') === 0).map(e => e.label.slice('diaporama : '.length)));
const expected = [
  { asked: 128, natural: [64, 64] },
  { asked: 64, natural: [64, 64] },
  { asked: 144, natural: [72, 48] },
  { asked: 40, natural: [4, 4] },
];
const asExpected = (list) => !!list && list.length === 4 && list.every((image, i) => image.complete && image.asked === expected[i].asked && image.natural[0] === expected[i].natural[0] && image.natural[1] === expected[i].natural[1]);
const schemes = list => (list || []).map(image => image.scheme).join(' ');

async function unit(app) {
  const seen = await app.evaluate(async ([heavyA, heavyB, small]) => {
    if (typeof HeavyImages === 'undefined') return { missing: true };
    const tag = (src, extra) => '<p><img class="editor-image" ' + (extra || '') + 'src="' + src + '" alt=""></p>';
    const bytesOf = async url => new Uint8Array(await (await fetch(url)).arrayBuffer());
    const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
    const out = {};
    // Une image lourde : une adresse courte, les mêmes octets.
    const one = HeavyImages.lighten('<h2>Un</h2>' + tag(heavyA) + '<p>fin</p>');
    out.one = one ? { shorter: one.html.length < 400, blob: /<img class="editor-image" src="blob:[^"]+" alt="">/.test(one.html), noData: one.html.indexOf('data:image') === -1, images: one.images.length, type: one.images[0].blob.type,
      bytes: same(await bytesOf(one.images[0].url), await bytesOf(heavyA)), kept: one.html.indexOf('<h2>Un</h2>') === 0 && one.html.endsWith('<p>fin</p>') } : null;
    // La même deux fois et une autre : deux fichiers, trois adresses.
    const three = HeavyImages.lighten(tag(heavyA) + tag(heavyB) + tag(heavyA));
    const urls = three ? Array.from(three.html.matchAll(/src="(blob:[^"]+)"/g)).map(found => found[1]) : [];
    out.three = three ? { images: three.images.length, urls: urls.length, firstIsThird: urls[0] === urls[2] && urls[0] !== urls[1] } : null;
    // Ce qui reste tel quel.
    const quoted = '<p>on écrit src="' + heavyA + '" dans un texte</p>';
    const broken = tag('data:image/png;base64,' + '!'.repeat(9000));
    const video = '<p><video class="editor-image" src="' + heavyA + '"></video></p>';
    const mixed = tag(small) + quoted + broken + video + tag(heavyB);
    const kept = HeavyImages.lighten(mixed);
    out.kept = kept ? { images: kept.images.length, small: kept.html.indexOf(tag(small)) === 0, quoted: kept.html.indexOf(quoted) !== -1, broken: kept.html.indexOf(broken) !== -1, video: kept.html.indexOf(video) !== -1,
      onlyLast: /<img class="editor-image" src="blob:[^"]+" alt=""><\/p>$/.test(kept.html) } : null;
    // Rien à alléger.
    out.none = [HeavyImages.lighten(''), HeavyImages.lighten(null), HeavyImages.lighten(tag(small).repeat(400)), HeavyImages.lighten(quoted + broken + video)].map(value => value === null);
    // Libérer.
    if (one) {
      const before = await fetch(one.images[0].url).then(r => r.ok, () => false);
      one.release();
      one.release();
      const after = await fetch(one.images[0].url).then(r => r.ok, () => false);
      out.release = { before, after };
    } else {
      out.release = { before: null, after: null };
    }
    if (three) three.release();
    if (kept) kept.release();
    return out;
  }, [HEAVY_A, HEAVY_B, SMALL]);
  check('HeavyImages existe', !seen.missing, seen);
  if (seen.missing) return;
  check('une image lourde d’une balise <img> devient une adresse courte qui rend les mêmes octets, le reste du texte ne bouge pas',
    !!seen.one && seen.one.shorter && seen.one.blob && seen.one.noData && seen.one.images === 1 && seen.one.type === 'image/png' && seen.one.bytes && seen.one.kept, seen.one);
  check('deux fois la même image et une autre : deux fichiers, la même adresse pour la même image', !!seen.three && seen.three.images === 2 && seen.three.urls === 3 && seen.three.firstIsThird, seen.three);
  check('une image légère, un texte qui cite `src="data:…"`, un base64 mal écrit et une balise <video> restent tels quels ; seule la vraie image lourde change',
    !!seen.kept && seen.kept.images === 1 && seen.kept.small && seen.kept.quoted && seen.kept.broken && seen.kept.video && seen.kept.onlyLast, seen.kept);
  check('rien à alléger (texte vide, images légères seulement, rien de lisible) : null', seen.none.every(Boolean), seen.none);
  check('`release()` rend les adresses : elles ne se lisent plus (appelée deux fois sans erreur)', seen.release.before === true && seen.release.after === false, seen.release);
}

async function run() {
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: 'fr' }, seed: SEED, lang: 'fr', colorScheme: 'light', popups: true, bypassCSP: false });
  const { page, app, context } = A;
  const a = toolsOf(A);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  context.on('page', p => p.on('pageerror', e => errors.push(String(e.message).slice(0, 200))));

  await unit(app);

  await open(A, 8, 3);
  const htmlBefore = await app.evaluate(() => Editor.getHTML());
  const savesBefore = await saves(app);
  check('le texte de l’éditeur porte ses trois images lourdes en entier', htmlBefore.split('data:image/png;base64,').length === 5 && htmlBefore.length > HEAVY_A.length * 2 + HEAVY_B.length, { length: htmlBefore.length });
  // Ce que l'app emballe pour la fenêtre : la taille du rendu, les images à part, ce qui reste écrit dans le texte.
  await app.evaluate(() => {
    window.__packs = [];
    const original = SlideWindow.pack;
    SlideWindow.pack = function (...args) {
      const payload = original.apply(this, args);
      const images = Array.isArray(payload.images) ? payload.images : null;
      window.__packs.push({ v: payload.v, scope: payload.scope.length, data: payload.scope.split('data:image/png;base64,').length - 1, blobs: payload.scope.split('src="blob:').length - 1,
        images: images ? images.length : -1, files: images ? images.every(image => image.blob instanceof Blob && image.blob.type === 'image/png' && /^blob:/.test(image.url)) : false,
        sizes: images ? images.map(image => image.blob.size) : [], urls: images ? images.map(image => image.url) : [] });
      return payload;
    };
  });

  // --- La fenêtre à part.
  const popup = await playAndCatch(A, a);
  check('le ▶ ouvre la fenêtre à part', !!popup, {});
  if (!popup) { await context.close(); return; }
  await waitCounter(popup);
  await sleep(600);
  const pack = (await app.evaluate(() => window.__packs))[0] || {};
  const lightest = Math.min(HEAVY_A.length, HEAVY_B.length);
  check('le rendu envoyé ne porte plus aucune image lourde dans son texte : il est plus court que la plus petite d’entre elles, et seule l’image légère y reste écrite',
    pack.scope > 0 && pack.scope < lightest && pack.data === 1 && pack.blobs === 3, { scope: pack.scope, lightest, data: pack.data, blobs: pack.blobs });
  check('les fichiers des images lourdes partent à part, un par image différente (deux pour trois images), aux octets de l’image',
    pack.v === 2 && pack.images === 2 && pack.files && pack.sizes.slice().sort((x, y) => x - y).join() === [noisePng(64, 64, 7).length, noisePng(72, 48, 99).length].sort((x, y) => x - y).join(), { v: pack.v, images: pack.images, files: pack.files, sizes: pack.sizes });
  const shown = await imagesIn(popup, 'pp-slide-show-stage');
  check('la fenêtre montre les quatre images, chargées, à leur taille : les trois lourdes par une adresse à elle, la légère telle qu’elle est écrite', asExpected(shown) && schemes(shown) === 'blob blob blob data', shown && shown.map(image => [image.scheme, image.asked, image.natural, image.complete]));
  check('les adresses de la fenêtre ne sont pas celles de l’app (chaque page nomme ses fichiers)', !!shown && shown.slice(0, 3).every(image => pack.urls.indexOf(image.src) === -1) && shown[0].src === shown[1].src && shown[0].src !== shown[2].src, {});
  check('les adresses de l’app sont libérées dès l’envoi', (await readable(app, pack.urls)).every(ok => ok === false), {});
  check('rien ne reste dans la page de l’app : ni diaporama, ni rendu', await app.evaluate(() => !document.querySelector('.pp-slide-show') && !document.getElementById('pp-slide-show-stage')), {});
  check('le texte de l’éditeur n’a pas changé, rien n’est enregistré', (await app.evaluate(() => Editor.getHTML())) === htmlBefore && (await saves(app)) === savesBefore, {});
  // Le rapport de fluidité (js/perf-trace.js, temporaire) porte les étapes du départ, dans l'ordre : de quoi lire chez la personne où part le temps.
  const marks = await showMarks(app);
  const at = label => marks.indexOf(label);
  check('le rapport de fluidité porte les étapes du départ vers la fenêtre : départ, fenêtre demandée, fenêtre prête et rendu envoyé, première diapositive',
    at('départ') === 0 && at('fenêtre demandée') === 1 && at('fenêtre prête') > 1 && at('rendu envoyé à la fenêtre') > 1 && at('première diapositive dans la fenêtre') === marks.length - 1 && marks.length === 5, marks);
  // Rechargée, la fenêtre redemande son rendu : les fichiers sont toujours là.
  await popup.reload();
  await waitCounter(popup);
  await sleep(600);
  const again = await imagesIn(popup, 'pp-slide-show-stage');
  check('la fenêtre rechargée retrouve ses images, chargées', asExpected(again) && schemes(again) === 'blob blob blob data', again && again.map(image => [image.scheme, image.natural, image.complete]));
  await popup.close().catch(() => {});
  await sleep(700);

  // --- Le panneau : l'interrupteur « Plein écran » décoché.
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);
  const none = await playAndCatch(A, a, 1500);
  await waitCounter(app);
  await sleep(600);
  const inPanel = await imagesIn(app, 'pp-slide-show-stage');
  check('interrupteur décoché : le diaporama se joue dans le panneau, aucune fenêtre', !none && context.pages().length === 1, { pages: context.pages().length });
  check('le panneau montre les quatre images, chargées, à leur taille, les lourdes par leur adresse courte', asExpected(inPanel) && schemes(inPanel) === 'blob blob blob data', inPanel && inPanel.map(image => [image.scheme, image.asked, image.natural, image.complete]));
  const panelMarks = (await showMarks(app)).slice(-3);
  check('le rapport de fluidité porte les étapes du départ dans le panneau', panelMarks.join(' | ') === 'départ | dans le panneau | première diapositive dans le panneau', panelMarks);
  const panelUrls = inPanel ? inPanel.slice(0, 3).map(image => image.src) : [];
  check('tant que le diaporama est là, ses images se lisent', (await readable(app, panelUrls)).every(Boolean), {});
  await page.keyboard.press('Escape');
  await sleep(600);
  check('à la sortie (Échap), les adresses sont libérées', panelUrls.length === 3 && (await readable(app, panelUrls)).every(ok => ok === false) && (await app.evaluate(() => !document.querySelector('.pp-slide-show'))), {});
  // L'interrupteur revient coché.
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="fullscreen"]', 0, 250);

  // --- La vue intervenant : la fenêtre joue, le panneau est la console (la diapositive en cours et la suivante).
  await a.click('.pp-slide-show-more', 0, 250);
  await a.click('.pp-show-menu [data-action="speaker"]', 0, 250);
  const screen = await playAndCatch(A, a);
  check('vue intervenant : le ▶ ouvre la fenêtre du diaporama', !!screen, {});
  if (screen) {
    await waitCounter(screen);
    await app.waitForFunction(() => { const next = document.getElementById('pp-slide-speaker-next'); return !!next && !!next.shadowRoot && !!next.shadowRoot.querySelector('img.editor-image'); }, null, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    const onScreen = await imagesIn(screen, 'pp-slide-show-stage');
    const current = await imagesIn(app, 'pp-slide-show-stage');
    const upcoming = await imagesIn(app, 'pp-slide-speaker-next');
    check('la fenêtre de la vue intervenant montre les quatre images chargées', asExpected(onScreen) && schemes(onScreen) === 'blob blob blob data', onScreen && onScreen.map(image => [image.scheme, image.natural, image.complete]));
    check('la console montre la diapositive en cours et la suivante avec leurs images chargées', asExpected(current) && asExpected(upcoming) && schemes(current) === 'blob blob blob data' && schemes(upcoming) === 'blob blob blob data',
      { current: current && current.map(image => [image.scheme, image.natural, image.complete]), upcoming: upcoming && upcoming.map(image => [image.scheme, image.natural, image.complete]) });
    const consoleUrls = current ? current.slice(0, 3).map(image => image.src) : [];
    await page.keyboard.press('Escape');
    await sleep(900);
    check('à la sortie de la console, ses adresses sont libérées et la fenêtre est fermée', consoleUrls.length === 3 && (await readable(app, consoleUrls)).every(ok => ok === false) && screen.isClosed(), { closed: screen.isClosed() });
  }
  check('le texte de l’éditeur n’a toujours pas changé, rien n’est enregistré', (await app.evaluate(() => Editor.getHTML())) === htmlBefore && (await saves(app)) === savesBefore, {});
  check('aucune erreur de page pendant ces essais', errors.length === 0, errors);
  await context.close();
}

await run();
await t.finish();
