#!/usr/bin/env node
// L'objet VIDÉO de Slides+ (js/video-frame.js, js/gfs-link.js : `lecteurs`, `player`, `onPlayerEvent` ; js/free-frame.js : `video`, `insertVideo` et la vue de nœud ; js/objects-menu.js : « Vidéo… » ; js/reader-mode.js et
// extensions/diapositives/slide-player.js : la lecture au clic ; css/free-frame.css ; demande du 06/11, point 7 des retours d'Antoine, carte « Comment faire lire un lecteur YouTube dans l'éditeur ? » : « GFS joue le lecteur
// au-dessus »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js : un GFS qui annonce `lecteurs` et tient les appels `lecteur.*`),
// l'extension « diapositives » active. Le vrai YouTube, le vrai Vimeo et le vrai GFS ne sont pas joints : le lecteur de l'essai est un cadre de couleur franche posé par le GFS simulé.
//  LE RÉGLAGE : `youtube:<11 signes>` / `vimeo:<chiffres>[/<clé>]`, `@<secondes>` pour le départ ; `parseLink` lit les adresses de ces deux sites (et le code « Intégrer ») et rien d'autre : un autre site, `javascript:`,
//   `data:`, des identifiants, un port, un identifiant mal formé, une balise ou un guillemet de trop ne donnent aucune vidéo. Le modèle ne garde que le réglage lu ; le HTML enregistré ne porte ni lecteur, ni calque.
//  L'ÉDITEUR : un calque (vignette ▶ et nom du site) sur chaque cadre vidéo, rien chargé chez le fournisseur avant le clic ; sans GFS qui sache jouer le site, le clic ouvre la vidéo sur son site (un onglet) ; avec lui,
//   l'app envoie `lecteur.afficher` (l'identifiant et le rectangle du calque, jamais une adresse), le suit au défilement (`deplacer`), l'efface quand un menu le recouvre (`masquer`) et le ferme (`fermer`) à Échap, au clic
//   ailleurs, hors de vue, au clic sur une autre vidéo, à la suppression du cadre ; un état `fin` ferme, un état `erreur` ouvre la vidéo sur son site.
//  LE MENU « OBJETS » : « Vidéo… » (ligne pleine sous « Tableau d'un modèle Grille… »), la fenêtre où l'on colle l'adresse, un cadre 16/9 posé sélectionné ; une adresse qui n'en est pas une est dite ; UN Ctrl+Z le retire.
//  LA LECTURE ET LE DIAPORAMA : la vignette est là, un clic lit la vidéo à sa place ; changer de page du diaporama, quitter la Lecture ou Échap ferme le lecteur ; les exports ne montrent que le titre du cadre (le PDF)
//   et le lien (le PowerPoint).
//  LE CADRE DE GFS : l'app dans un cadre isolé, le lecteur de GFS tombe sur le calque, rogné à la zone qui défile.
// Lancé par run-headless.mjs (groupe Node "videoFrame", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-video-frame.mjs
import { readFileSync } from 'node:fs';
import { start, seedModels, WIDTH, HEIGHT, hoverObjectsButton, OBJECTS_MENU } from './gfs-page.mjs';

const t = await start({ name: 'verify-video-frame', port: Number(process.env.VIDEO_FRAME_PORT || 9397) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const PLAYERS = ['youtube', 'vimeo'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = 'class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"';
const MARK = (id, extra = '') => `<div ${PROPS} data-anchor="${id}"${extra}></div>`;
const WATCH_Y = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=90s';
const WATCH_V = 'https://vimeo.com/76979871/abcdef0123';
const FRAME = (x, y, w, h, text, { video = '', link = '', fill = '#f1f3f6', line = '#bfbfbf', lw = '0.75' } = {}) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-fill="${fill}" data-ff-line="${line}" data-ff-lw="${lw}"${video ? ` data-ff-video="${video}"` : ''}${link ? ` data-ff-link="${link}"` : ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${text}</p></div></div></div>`;
// Cinq cadres sur la diapositive 1 : Y (YouTube, départ à 90 s), V (Vimeo non listée), P (un `data-ff-video` piégé), Q (un identifiant YouTube trop court), N (un cadre sans vidéo) ; une 2e diapositive.
const SLIDES = [
  `${MARK('slide-1')}<h1>Accueil</h1><p>Bienvenue</p>${FRAME(300, 150, 360, 202.5, 'Ma vidéo', { video: 'youtube:dQw4w9WgXcQ@90', link: WATCH_Y })}${FRAME(40, 380, 192, 108, 'Autre vidéo', { video: 'vimeo:76979871/abcdef0123', link: WATCH_V })}${FRAME(720, 380, 192, 108, 'Piégé', { video: 'javascript:alert(1)', link: 'https://example.com/' })}${FRAME(40, 40, 160, 90, 'Trop court', { video: 'youtube:abc' })}${FRAME(720, 40, 160, 90, 'Sans vidéo')}`,
  `${MARK('slide-2')}<h2>Suite</h2><p>Deuxième diapositive</p>`,
].join(BR);
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Vidéos', '${SLIDES}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;
const [Y, V, P, Q, N] = [0, 1, 2, 3, 4];

const TEXTS = {
  fr: { row: 'Vidéo…', aria: 'YouTube.*Vimeo', dialog: 'Insérer une vidéo', invalid: /n’est pas une vidéo YouTube ou Vimeo/, play: 'Lire la vidéo YouTube', title: 'Vidéo YouTube', slide: n => `diapositive ${n}`, own: 'Ma vidéo' },
  en: { row: 'Video…', aria: 'YouTube.*Vimeo', dialog: 'Insert a video', invalid: /is not a YouTube or Vimeo video/, play: 'Play the YouTube video', title: 'YouTube video', slide: n => `slide ${n}`, own: 'Ma vidéo' },
};

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page, requests } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE, lecteurs: PLAYERS }, seed: SEED, lang, colorScheme });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  const key = async (name, wait = 250) => { await page.keyboard.press(name); await sleep(wait); };
  // Le menu « Lien et blocs de contenu » à la vraie souris : le volet s'ouvre au survol de l'icône, puis la main descend de l'icône sur la ligne (sans quitter le volet) et clique.
  const openBlocks = async () => {
    const c = await rectOf('#v2-btn-link');
    await page.mouse.move(c.x, c.y + 150);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await sleep(350);
    return c;
  };
  const chooseBlock = async (selector = '#v2-btn-video') => {
    const c = await openBlocks();
    const r = await rectOf(selector);
    const x = Math.min(Math.max(c.x, r.left + 8), r.right - 8);
    await page.mouse.move(x, r.y, { steps: 8 });
    await sleep(100);
    await page.mouse.click(x, r.y);
    await sleep(300);
  };
  const near = (a, b, tolerance = 1.5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 2; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  // Les ouvertures d'onglet (un <a target="_blank"> cliqué hors de l'éditeur et de la Lecture) sont gardées, jamais suivies.
  await page.evaluate(() => {
    window.__opened = [];
    document.addEventListener('click', (event) => {
      const a = event.target && event.target.closest ? event.target.closest('a[target="_blank"]') : null;
      if (a && !a.closest('.tiptap, #reader-container, .pp-slide-show-host')) { window.__opened.push(a.href); event.preventDefault(); }
    }, true);
  });
  const opened = () => page.evaluate(() => window.__opened.slice());
  const stubCalls = () => page.evaluate(() => window.__gfsStub.lecteurAppels.map(c => ({ nom: c.nom, args: c.args })));
  const stubNames = async () => (await stubCalls()).map(c => c.nom);
  const stubPlayer = () => page.evaluate(() => { const p = window.__gfsStub.lecteur; return p ? JSON.parse(JSON.stringify(p)) : null; });
  const refusals = () => page.evaluate(() => window.__gfsStub.lecteurRefus.length);
  const lastOf = async nom => (await stubCalls()).filter(c => c.nom === nom).pop() || null;
  const countOf = async nom => (await stubCalls()).filter(c => c.nom === nom).length;
  const framesOf = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach((node, pos) => {
      if (node.type.name !== 'freeFrame') return;
      const a = node.attrs;
      out.push({ pos, text: node.textContent.trim(), video: a.video || '', link: a.link || '', x: a.x, y: a.y, w: a.w, h: a.h, alt: a.alt || '', fill: a.fill, line: a.line, lw: a.lw });
    });
    return out;
  });
  const selected = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s && s.node && s.node.type.name === 'freeFrame' ? { video: s.node.attrs.video || '', link: s.node.attrs.link || '', text: s.node.textContent.trim(), alt: s.node.attrs.alt || '' } : null; });
  // Le cadre `index` de l'éditeur, amené à l'écran (le panneau est petit), et la mesure de son calque ; `at` : où le placer dans la zone qui défile ('center', 'start').
  const EDITOR_FRAMES = '#editor-container .ProseMirror .pp-free-frame';
  const showFrame = async (index, block = 'center') => {
    await page.evaluate(([i, where, sel]) => { const f = document.querySelectorAll(sel)[i]; f.querySelector(':scope > .pp-free-frame-box').scrollIntoView({ block: where, inline: 'center' }); }, [index, block, EDITOR_FRAMES]);
    await sleep(400);
    return videoBox(index);
  };
  const videoBox = index => page.evaluate(([i, sel]) => {
    const f = document.querySelectorAll(sel)[i];
    const v = f ? f.querySelector(':scope > .pp-free-frame-box > .pp-ff-video') : null;
    if (!v) return null;
    const r = v.getBoundingClientRect();
    const b = v.querySelector('.pp-ff-video-play');
    const q = b ? b.getBoundingClientRect() : null;
    const box = f.querySelector(':scope > .pp-free-frame-box').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, play: q && { x: q.left + q.width / 2, y: q.top + q.height / 2, width: q.width, height: q.height }, boxLeft: box.left, boxTop: box.top, boxWidth: box.width, boxHeight: box.height };
  }, [index, EDITOR_FRAMES]);
  // La zone qui défile de l'éditeur (le premier ancêtre qui coupe ce qui déborde), pour défiler à la molette.
  const scrollBy = (dy) => page.evaluate(([sel, delta]) => {
    const f = document.querySelectorAll(sel)[0];
    let n = f.parentElement;
    while (n && !/(auto|scroll)/.test(getComputedStyle(n).overflowY)) n = n.parentElement;
    if (!n) return null;
    n.scrollTop += delta;
    const r = n.getBoundingClientRect();
    return { top: n.scrollTop, left: r.left, topEdge: r.top, right: r.right, bottom: r.bottom };
  }, [EDITOR_FRAMES, dy]);
  const scroller = () => scrollBy(0);

  // --- 1. Le réglage.
  console.log('\n' + tag + '1) Le réglage : une vidéo YouTube ou Vimeo, jamais une adresse');
  const parsed = await page.evaluate(() => {
    const P = raw => { const v = VideoFrame.parseLink(raw); return v ? VideoFrame.encode(v) : null; };
    return {
      good: [
        P('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), P('https://youtu.be/dQw4w9WgXcQ?t=1m30s'), P('youtube.com/watch?v=dQw4w9WgXcQ&t=90'), P('https://www.youtube.com/embed/dQw4w9WgXcQ?start=7'),
        P('https://www.youtube.com/shorts/dQw4w9WgXcQ'), P('https://www.youtube.com/live/dQw4w9WgXcQ'), P('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), P('https://m.youtube.com/watch?v=dQw4w9WgXcQ#t=5s'),
        P('https://vimeo.com/76979871'), P('https://vimeo.com/76979871/ABCDEF0123'), P('https://player.vimeo.com/video/76979871?h=abcdef0123'), P('https://vimeo.com/channels/staffpicks/76979871#t=30s'), P('https://vimeo.com/showcase/123/video/76979871'),
        P('  https://youtu.be/dQw4w9WgXcQ  '), P('<iframe width="560" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc&amp;start=12" title="x" allowfullscreen></iframe>'), P('<iframe src="https://player.vimeo.com/video/76979871?h=abcdef0123&amp;badge=0"></iframe>'),
      ],
      bad: [
        '', '   ', null, undefined, 42, 'bonjour', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'https://evil.test/https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'ftp://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=court', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ"onload="x', 'https://www.youtube.com/watch?v=dQw4w9WgX<>', 'https://www.youtube.com/playlist?list=PL123', 'https://www.youtube.com/',
        'https://vimeo.com/', 'https://vimeo.com/abc', 'https://vimeo.com/76979871/<script>', 'https://player.vimeo.com/video/abc', '<script src="https://www.youtube.com/embed/dQw4w9WgXcQ"></script>', '<img src="https://youtu.be/dQw4w9WgXcQ">',
        'https://youtu.be/dQw4w9WgXcQ https://youtu.be/dQw4w9WgXcQ', 'x'.repeat(5000),
      ].map(raw => P(raw)),
      values: ['youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ@90', 'vimeo:76979871', 'vimeo:76979871/abcdef0123@5', ' youtube:dQw4w9WgXcQ ', 'youtube:short', 'youtube:dQw4w9WgXcQ@', 'youtube:dQw4w9WgXcQ@999999', 'dailymotion:x7tgad0', 'youtube:../../etc', 'youtube:dQw4w9WgXcQ/x', 'vimeo:1/zz', 'javascript:alert(1)', '', null, 42].map(raw => VideoFrame.valueOf(raw)),
      urls: ['youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ@90', 'vimeo:76979871', 'vimeo:76979871/abcdef0123@5', 'javascript:alert(1)', 'youtube:short'].map(raw => VideoFrame.watchUrl(raw)),
      normalized: { keep: FreeFrame.normalized({ video: 'youtube:dQw4w9WgXcQ@90' }).video, drop: FreeFrame.normalized({ video: 'javascript:alert(1)' }).video, line: FreeFrame.normalized({ shape: 'line', video: 'youtube:dQw4w9WgXcQ' }).video, shape: FreeFrame.normalized({ shape: 'rect', video: 'vimeo:76979871' }).video },
      api: ['decode', 'encode', 'valueOf', 'watchUrl', 'parseLink', 'host', 'fill', 'openDialog', 'canPlay', 'play', 'activate', 'stop', 'playing'].every(name => typeof VideoFrame[name] === 'function'),
    };
  });
  check(tag + 'les adresses de YouTube (watch, youtu.be, embed, shorts, live, nocookie, mobile, avec ou sans https, départ en secondes ou en « 1m30s ») et de Vimeo (page, chaîne, album, lecteur, clé d\'une vidéo non listée) donnent leur vidéo, le code « Intégrer » aussi (on n\'y lit que son src)',
    JSON.stringify(parsed.good) === JSON.stringify([
      'youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ@90', 'youtube:dQw4w9WgXcQ@90', 'youtube:dQw4w9WgXcQ@7',
      'youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ@5',
      'vimeo:76979871', 'vimeo:76979871/abcdef0123', 'vimeo:76979871/abcdef0123', 'vimeo:76979871@30', 'vimeo:76979871',
      'youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ@12', 'vimeo:76979871/abcdef0123',
    ]), parsed.good);
  check(tag + 'un autre site (ou un site qui ressemble), `javascript:`, `data:`, `file:`, un autre schéma, des identifiants ou un port dans l\'adresse, un identifiant mal formé ou piégé, une balise qui n\'est pas un cadre, deux adresses, un texte immense : aucune vidéo',
    parsed.bad.length === 28 && parsed.bad.every(v => v === null), parsed.bad);
  check(tag + '`valueOf` ne rend que la forme exacte (identifiant à 11 signes pour YouTube, chiffres et clé hexadécimale pour Vimeo, départ plafonné) et vide pour le reste', JSON.stringify(parsed.values) === JSON.stringify(['youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ@90', 'vimeo:76979871', 'vimeo:76979871/abcdef0123@5', 'youtube:dQw4w9WgXcQ', '', '', 'youtube:dQw4w9WgXcQ@359999', '', '', '', '', '', '', '', '']), parsed.values);
  check(tag + 'l\'adresse sur le site est montée d\'après l\'identifiant (watch?v=…&t=…s, vimeo.com/…#t=…s), vide pour un réglage invalide', JSON.stringify(parsed.urls) === JSON.stringify(['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s', 'https://vimeo.com/76979871', 'https://vimeo.com/76979871/abcdef0123#t=5s', '', '']), parsed.urls);
  check(tag + 'le cadre garde une vidéo valide, jette un réglage piégé ; une ligne n\'en porte pas, une forme oui ; l\'interface du module est là',
    parsed.normalized.keep === 'youtube:dQw4w9WgXcQ@90' && parsed.normalized.drop === '' && parsed.normalized.line === '' && parsed.normalized.shape === 'vimeo:76979871' && parsed.api, parsed.normalized);
  const frames = await framesOf();
  check(tag + 'le modèle garde la vidéo de Y (YouTube, départ 90 s) et de V (Vimeo, non listée), avec leur lien ; le réglage piégé (P) et l\'identifiant trop court (Q) sont jetés, le cadre sans vidéo (N) n\'en a pas',
    frames.length === 5 && frames[Y].video === 'youtube:dQw4w9WgXcQ@90' && frames[V].video === 'vimeo:76979871/abcdef0123' && frames[P].video === '' && frames[Q].video === '' && frames[N].video === ''
      && frames[Y].link === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s' && frames[V].link === WATCH_V, frames);
  const saved = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le texte enregistré porte `data-ff-video` sur les deux vidéos seulement, et ni lecteur, ni calque, ni vignette (<iframe>, <video>, <object>, <embed>, pp-ff-video) ; le réglage piégé n\'est pas réécrit',
    (saved.match(/data-ff-video="/g) || []).length === 2 && !/<iframe|<video|<object|<embed|pp-ff-video|javascript:/i.test(saved) && /data-ff-video="youtube:dQw4w9WgXcQ@90"/.test(saved) && /data-ff-video="vimeo:76979871\/abcdef0123"/.test(saved), (saved.match(/data-ff-video="[^"]*"/g) || []));

  // --- 2. L'éditeur : la vignette.
  console.log('\n' + tag + '2) L\'éditeur : la vignette, rien de chargé avant le clic');
  const hosts = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((f) => {
    const v = f.querySelector(':scope > .pp-free-frame-box > .pp-ff-video');
    const b = v ? v.querySelector('.pp-ff-video-play') : null;
    const n = v ? v.querySelector('.pp-ff-video-name') : null;
    const content = f.querySelector(':scope > .pp-free-frame-box > .pp-free-frame-content');
    return { has: !!v, provider: v ? v.dataset.provider : '', label: b ? b.getAttribute('aria-label') : '', name: n ? n.textContent : '', svg: !!(b && b.querySelector('svg')), fallback: content ? getComputedStyle(content).visibility : '', text: content ? content.textContent.trim() : '', iframes: f.querySelectorAll('iframe, video, object, embed, img').length };
  }), EDITOR_FRAMES);
  check(tag + 'Y et V ont chacun un calque (fournisseur, nom du site, bouton ▶ nommé « ' + T.play + ' » pour YouTube) ; P, Q et N n\'en ont pas',
    hosts.length === 5 && hosts[Y].has && hosts[Y].provider === 'youtube' && hosts[Y].name === 'YouTube' && hosts[Y].label === T.play && hosts[Y].svg && hosts[V].has && hosts[V].provider === 'vimeo' && hosts[V].name === 'Vimeo' && !hosts[P].has && !hosts[Q].has && !hosts[N].has, hosts);
  check(tag + 'le titre du cadre (« Ma vidéo ») reste dans le cadre sous le calque, lisible sans lui ; aucun cadre ne porte ni lecteur, ni image, ni balise vidéo',
    hosts[Y].text === 'Ma vidéo' && hosts[Y].fallback !== 'hidden' && hosts.every(h => h.iframes === 0), hosts);
  const yBox = await showFrame(Y);
  check(tag + 'le calque de Y couvre la boîte du cadre (à 2 px, trait compris) à la forme 16/9 ; le disque ▶ est carré, centré, entre 28 et 80 px',
    !!yBox && near(yBox.width, yBox.boxWidth, 2.5) && near(yBox.height, yBox.boxHeight, 2.5) && near(yBox.width / yBox.height, 16 / 9, 0.03) && !!yBox.play && near(yBox.play.width, yBox.play.height, 1) && yBox.play.width >= 28 && yBox.play.width <= 80 && near(yBox.play.x, yBox.x, 3) && near(yBox.play.y, yBox.y, 3), yBox);
  await leave();
  const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { cls: e ? String(e.className.baseVal !== undefined ? e.className.baseVal : e.className) : '', inPlay: !!e && !!e.closest('.pp-ff-video-play'), cursor: e ? getComputedStyle(e.closest('.pp-ff-video-play') || e).cursor : '' }; }, [yBox.play.x, yBox.play.y]);
  check(tag + 'sous la souris, le centre de Y est le bouton ▶ (la main)', hit.inPlay && hit.cursor === 'pointer', hit);
  const watching = requests.filter(url => /youtube|youtu\.be|ytimg|googlevideo|vimeo/i.test(url));
  check(tag + 'rien n\'a été demandé à YouTube ni à Vimeo avant le moindre clic (ni image, ni lecteur, ni script)', watching.length === 0, watching);
  check(tag + 'GFS n\'a reçu aucun appel `lecteur.*` avant le clic', (await stubCalls()).length === 0, await stubCalls());

  // --- 3. Le clic sans lecteur chez GFS : la vidéo s'ouvre sur son site.
  console.log('\n' + tag + '3) Le clic quand GFS ne sait pas jouer le site : la vidéo sur son site');
  await page.evaluate(() => window.__gfsStub.setLecteurs([]));
  await sleep(250);
  const y0 = await showFrame(Y);
  await reach(y0.play);
  await page.mouse.click(y0.play.x, y0.play.y);
  await sleep(300);
  let urls = await opened();
  check(tag + 'GFS annonce une liste vide : le clic sur ▶ de Y ouvre la vidéo sur YouTube (un onglet, au départ de 90 s), sans rien demander à GFS', urls.length === 1 && urls[0] === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s' && (await stubCalls()).length === 0, { urls, calls: await stubCalls() });
  await page.evaluate(() => window.__gfsStub.setLecteurs(['youtube']));
  await sleep(250);
  const vBox = await showFrame(V);
  await reach(vBox.play);
  await page.mouse.click(vBox.play.x, vBox.play.y);
  await sleep(300);
  urls = await opened();
  check(tag + 'GFS ne sait que YouTube : Vimeo n\'est jamais demandé, le clic sur ▶ de V ouvre vimeo.com (avec la clé de la vidéo non listée)', urls.length === 2 && urls[1] === WATCH_V && (await stubCalls()).length === 0, { urls, calls: await stubCalls() });
  await page.evaluate(() => window.__gfsStub.setLecteurs(undefined));
  await sleep(250);
  await showFrame(Y);
  const canNot = await page.evaluate(() => ({ list: GfsLink.players(), y: VideoFrame.canPlay('youtube') }));
  check(tag + 'un GFS d\'avant (sans `lecteurs`) : l\'app n\'a aucun lecteur à demander', canNot.list.length === 0 && canNot.y === false, canNot);
  await page.evaluate(() => window.__gfsStub.setLecteurs(['youtube', 'vimeo', 'dailymotion', 42]));
  await sleep(250);
  const listed = await page.evaluate(() => GfsLink.players());
  check(tag + 'un nom de site que l\'app ne connaît pas (dailymotion) n\'est pas gardé', JSON.stringify(listed) === JSON.stringify(['youtube', 'vimeo']), listed);

  // --- 4. Le lecteur de GFS par-dessus le calque.
  console.log('\n' + tag + '4) Le lecteur de GFS : où il tombe, comment il suit, quand il s\'arrête');
  const before = await showFrame(Y, 'start');
  const area = await scroller();
  await reach(before.play);
  await page.mouse.click(before.play.x, before.play.y);
  await sleep(350);
  const afficher = await lastOf('afficher');
  let player = await stubPlayer();
  check(tag + 'le clic sur ▶ de Y envoie UN `lecteur.afficher` : YouTube, l\'identifiant, le départ à 90 s, un id de l\'app', (await countOf('afficher')) === 1 && !!afficher && afficher.args.fournisseur === 'youtube' && afficher.args.video === 'dQw4w9WgXcQ' && afficher.args.debut === 90 && /^[a-z][a-z0-9_-]{0,63}$/.test(afficher.args.id), afficher);
  check(tag + 'ce que l\'app envoie ne contient jamais d\'adresse (ni « http », ni « :// », ni « www », ni la clé `adresse`) : l\'identifiant et des nombres', !!afficher && !/http|:\/\/|www\.|adresse|url/i.test(JSON.stringify(afficher.args)) && Object.keys(afficher.args).sort().join() === 'debut,fournisseur,id,rect,video,zone', afficher && Object.keys(afficher.args));
  const rectNow = await videoBox(Y);
  check(tag + 'le rectangle envoyé est celui du calque (à 1 px) ; la zone tient dans la fenêtre et dans la zone qui défile', !!afficher && near(afficher.args.rect.x, rectNow.left, 1) && near(afficher.args.rect.y, rectNow.top, 1) && near(afficher.args.rect.largeur, rectNow.width, 1) && near(afficher.args.rect.hauteur, rectNow.height, 1)
    && afficher.args.zone.x >= -0.5 && afficher.args.zone.y >= -0.5 && afficher.args.zone.x + afficher.args.zone.largeur <= WIDTH + 0.5 && afficher.args.zone.y + afficher.args.zone.hauteur <= HEIGHT + 0.5 && afficher.args.zone.x >= area.left - 1 && afficher.args.zone.y >= area.topEdge - 1 && afficher.args.zone.x + afficher.args.zone.largeur <= area.right + 1 && afficher.args.zone.y + afficher.args.zone.hauteur <= area.bottom + 1, { rect: afficher && afficher.args.rect, zone: afficher && afficher.args.zone, calque: rectNow, area });
  check(tag + 'GFS a accepté l\'appel (le lecteur est monté d\'après ses gabarits, youtube-nocookie.com, `start=90`) et n\'en a refusé aucun', !!player && player.fournisseur === 'youtube' && player.video === 'dQw4w9WgXcQ' && player.debut === 90 && /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=90/.test(player.adresse) && (await refusals()) === 0, { player, refus: await refusals() });
  check(tag + 'l\'app sait ce qui joue (`VideoFrame.playing`)', await page.evaluate(() => { const p = VideoFrame.playing(); return !!p && p.provider === 'youtube' && p.video === 'dQw4w9WgXcQ'; }));
  // Le défilement : le lecteur suit d'une image.
  const moved = await scrollBy(60);
  await sleep(350);
  const dep = await lastOf('deplacer');
  const after = await videoBox(Y);
  check(tag + 'l\'éditeur défile de 60 px : `lecteur.deplacer` envoie le nouveau rectangle du calque (il a monté de ' + Math.round(before.top - after.top) + ' px), sans autre `afficher`', !!dep && near(before.top - after.top, 60, 3) && near(dep.args.rect.y, after.top, 1) && dep.args.id === afficher.args.id && (await countOf('afficher')) === 1, { dep: dep && dep.args.rect, after: after.top, before: before.top, moved });
  const frozen = await countOf('deplacer');
  await sleep(500);
  check(tag + 'sans mouvement, rien n\'est renvoyé à GFS (pas un appel par image)', (await countOf('deplacer')) === frozen, { frozen, now: await countOf('deplacer') });
  // Une fenêtre ou un menu qui passe par-dessus : le lecteur s'efface sans s'arrêter, puis revient.
  await page.evaluate((box) => { const d = document.createElement('div'); d.id = 'test-cover'; d.style.cssText = `position:fixed;left:${box.x - 60}px;top:${box.y - 40}px;width:120px;height:80px;background:#222;z-index:9999`; document.body.appendChild(d); }, after);
  await sleep(350);
  const hidden = await lastOf('masquer');
  check(tag + 'un élément posé sur le calque (un menu, une fenêtre) : `lecteur.masquer { masque: true }`, le lecteur reste ouvert', !!hidden && hidden.args.masque === true && hidden.args.id === afficher.args.id && !!(await stubPlayer()) && (await stubPlayer()).masque === true, hidden);
  await page.evaluate(() => document.getElementById('test-cover').remove());
  await sleep(350);
  const shown = await lastOf('masquer');
  check(tag + 'l\'élément retiré : `masquer { masque: false }`, le lecteur revient', !!shown && shown.args.masque === false && (await stubPlayer()).masque === false, shown);
  // Un état de GFS.
  await page.evaluate(() => window.__gfsStub.post({ type: 'evenement', nom: 'lecteur', data: { id: 'zzz', etat: 'fin' } }));
  await page.evaluate(() => window.__gfsStub.post({ type: 'evenement', nom: 'lecteur', data: { id: window.__gfsStub.lecteur.id, etat: 'bizarre' } }));
  await sleep(200);
  check(tag + 'un état d\'un lecteur qui n\'est pas le sien, ou d\'une sorte inconnue, ne ferme rien', !!(await stubPlayer()) && (await countOf('fermer')) === 0, await stubCalls());
  await page.evaluate(() => window.__gfsStub.setEtatLecteur('lecture'));
  await sleep(200);
  check(tag + 'un état « lecture » ne ferme rien non plus', !!(await stubPlayer()) && (await countOf('fermer')) === 0);
  await page.evaluate(() => window.__gfsStub.setEtatLecteur('fin'));
  await sleep(250);
  check(tag + 'GFS dit « fin » : l\'app ferme le lecteur (`fermer`) sans ouvrir d\'onglet', (await countOf('fermer')) === 1 && !(await stubPlayer()) && (await opened()).length === 2, { calls: await stubNames(), opened: await opened() });
  // Échap.
  await showFrame(Y);
  let box = await videoBox(Y);
  await reach(box.play);
  await page.mouse.click(box.play.x, box.play.y);
  await sleep(350);
  const second = await lastOf('afficher');
  check(tag + 'un second clic sur ▶ rejoue (un autre id de l\'app)', (await countOf('afficher')) === 2 && second.args.id !== afficher.args.id && !!(await stubPlayer()), { first: afficher.args.id, second: second.args.id });
  await key('Escape', 300);
  check(tag + 'Échap ferme le lecteur', (await countOf('fermer')) === 2 && !(await stubPlayer()), await stubNames());
  // Un clic ailleurs dans l'app.
  await showFrame(Y);
  box = await videoBox(Y);
  await reach(box.play);
  await page.mouse.click(box.play.x, box.play.y);
  await sleep(350);
  const stillOn = !!(await stubPlayer());
  await leave();
  await page.mouse.move(60, 200);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(300);
  check(tag + 'un clic ailleurs dans l\'app (hors du lecteur) le ferme', stillOn && (await countOf('fermer')) === 3 && !(await stubPlayer()), await stubNames());
  // Un clic sur ▶ d'une autre vidéo : l'une remplace l'autre.
  const yAgain = await showFrame(Y);
  await reach(yAgain.play);
  await page.mouse.click(yAgain.play.x, yAgain.play.y);
  await sleep(300);
  const withY = await stubPlayer();
  await page.evaluate(() => window.__gfsStub.setLecteurs(['youtube', 'vimeo']));
  const vAgain = await showFrame(V);
  await reach(vAgain.play);
  await page.mouse.click(vAgain.play.x, vAgain.play.y);
  await sleep(350);
  const withV = await stubPlayer();
  const order = (await stubNames()).filter(n => n === 'afficher' || n === 'fermer').slice(-3);
  check(tag + 'lire Vimeo ferme le lecteur de YouTube puis monte celui de Vimeo (une seule vidéo à la fois) : la clé de la vidéo non listée suit dans l\'identifiant', !!withY && withY.fournisseur === 'youtube' && !!withV && withV.fournisseur === 'vimeo' && withV.video === '76979871/abcdef0123' && JSON.stringify(order) === JSON.stringify(['afficher', 'fermer', 'afficher']) && /^https:\/\/player\.vimeo\.com\/video\/76979871\?.*h=abcdef0123/.test(withV.adresse), { withY: withY && withY.fournisseur, withV, order });
  // Hors de vue : le lecteur s'efface, puis la lecture s'arrête.
  await scrollBy(4000);
  await sleep(500);
  const gone = await lastOf('masquer');
  const stillPlaying = !!(await stubPlayer());
  check(tag + 'la vidéo sortie de la zone qui défile : `masquer { masque: true }` tout de suite, le lecteur n\'est pas fermé aussitôt', !!gone && gone.args.masque === true && stillPlaying, { gone, stillPlaying });
  await sleep(2600);
  check(tag + 'restée hors de vue plus de deux secondes, la lecture s\'arrête (`fermer`, plus de lecteur chez GFS)', !(await stubPlayer()) && (await countOf('fermer')) === 5, await stubNames());
  // Supprimer le cadre qui joue ferme le lecteur ; Ctrl+Z rend le cadre.
  const y2 = await showFrame(Y);
  await reach(y2.play);
  await page.mouse.click(y2.play.x, y2.play.y);
  await sleep(350);
  const playingBeforeDelete = !!(await stubPlayer());
  await page.evaluate(() => { const ed = EditorCore.getEditor(); let at = -1; ed.state.doc.forEach((node, pos) => { if (at < 0 && node.type.name === 'freeFrame' && node.attrs.video && node.attrs.video.indexOf('youtube') === 0) at = pos; }); FreeFrame.select(ed, at); });
  await sleep(250);
  await key('Delete', 400);
  check(tag + 'supprimer le cadre qui joue ferme le lecteur', playingBeforeDelete && !(await stubPlayer()) && (await framesOf()).length === 4, { frames: (await framesOf()).length, calls: await stubNames() });
  await key('Control+z', 500);
  const restored = await framesOf();
  check(tag + 'UN Ctrl+Z rend le cadre, sa vidéo et sa vignette', restored.length === 5 && restored.some(f => f.video === 'youtube:dQw4w9WgXcQ@90') && (await videoBox(Y)) !== null, restored.map(f => f.video));
  // GFS dit « erreur » : la vidéo s'ouvre sur son site.
  const y3 = await showFrame(Y);
  await reach(y3.play);
  await page.mouse.click(y3.play.x, y3.play.y);
  await sleep(350);
  const openedBefore = (await opened()).length;
  await page.evaluate(() => window.__gfsStub.setEtatLecteur('erreur'));
  await sleep(300);
  urls = await opened();
  check(tag + 'GFS dit « erreur » (la vidéo refuse d\'être intégrée) : l\'app ferme le lecteur et ouvre la vidéo sur son site', !(await stubPlayer()) && urls.length === openedBefore + 1 && urls[urls.length - 1] === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s', { urls, player: await stubPlayer() });
  check(tag + 'de tout ce parcours, GFS n\'a refusé aucun appel de l\'app (identifiants, nombres, rectangles tous valides)', (await refusals()) === 0, await page.evaluate(() => window.__gfsStub.lecteurRefus));

  // --- 5. « Vidéo… » du menu « Lien et blocs de contenu » (demande d'Antoine du 07/11 : la ligne n'est plus dans « Objets », elle est la même en diapositive et en document) et la pose d'une vidéo.
  console.log('\n' + tag + '5) Le menu « Lien et blocs de contenu » : « ' + T.row + ' »');
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.chain().setTextSelection(1).focus().run(); });
  await leave();
  await hoverObjectsButton(page);
  const objects = await page.evaluate((sel) => Array.from(document.querySelector(sel).querySelectorAll('[data-action]')).map(b => b.dataset.action), OBJECTS_MENU);
  check(tag + 'le menu « Objets » ne propose plus la vidéo : ses quatre premières lignes sont le cadre de texte, le tableau, la vue d\'une diapositive et le tableau d\'un modèle Grille', objects.slice(0, 4).join() === 'textFrame,table,slideView,linkedTable' && objects.indexOf('video') === -1, objects);
  await leave();
  await openBlocks();
  const blocks = await page.evaluate(() => {
    const flyout = document.getElementById('v2-blocks-flyout');
    const row = document.getElementById('v2-btn-video');
    const r = row.getBoundingClientRect();
    const f = flyout.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 12, r.top + r.height / 2);
    const label = row.querySelector('span:not(.v2-menu-row-icon)');
    const ids = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(b => b.id);
    return { text: label.textContent.trim(), aria: row.getAttribute('aria-label'), icon: !!row.querySelector('.v2-menu-row-icon svg'), locked: row.classList.contains('v2-hf-locked'), inPanel: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, onTop: !!hit && row.contains(hit), flyoutBottom: f.bottom, ids, vh: innerHeight };
  });
  check(tag + '« ' + T.row + ' » est une ligne du menu « Lien et blocs de contenu » (après « Graphique de la page… »), avec son icône, entière dans le panneau de 700 x 400, au premier plan et active', blocks.text === T.row && blocks.icon && !blocks.locked && blocks.inPanel && blocks.onTop && blocks.ids.indexOf('v2-btn-video') === blocks.ids.indexOf('v2-btn-chart') + 1, blocks);
  check(tag + 'son nom pour un lecteur d\'écran dit YouTube et Vimeo', new RegExp(T.aria).test(blocks.aria), blocks.aria);
  // Grist ne laisse passer ni la lecture automatique ni le plein écran au lecteur de GFS (consigne 057, faits vérifiés 50) : rien, dans les textes de l'objet, ne promet une vidéo qui démarre seule, un plein écran, ni qu'UN clic la lit (le lecteur du site s'ouvre, la personne y lance la lecture).
  const texts = await page.evaluate(() => ['insert.video.row', 'insert.video.aria', 'video.dialog.title', 'video.dialog.label', 'video.dialog.message', 'video.dialog.placeholder', 'video.dialog.confirm', 'video.dialog.invalid', 'video.play', 'video.title'].map(k => I18n.t(k, { n: 1, provider: 'YouTube' })));
  check(tag + 'aucun texte de l\'objet vidéo ne promet une lecture automatique ni le plein écran, ni qu\'un clic lit la vidéo', texts.every(x => typeof x === 'string' && x.length > 0 && !/automati|auto-?play|plein[ -]écran|full[ -]?screen/i.test(x)) && !/ la lit\b|plays it/.test(texts.join(' ')), texts);
  await chooseBlock();
  await sleep(500);
  const dialog = () => page.evaluate(() => {
    const modal = document.getElementById('pp-dialog-modal');
    const input = document.getElementById('pp-dialog-input');
    const r = modal ? modal.getBoundingClientRect() : null;
    const box = modal ? modal.querySelector('.pp-dialog-box, .var-modal-box, [role="dialog"]') : null;
    const q = box ? box.getBoundingClientRect() : r;
    return { open: !!modal && !modal.hidden && getComputedStyle(modal).display !== 'none' && r.width > 0, title: document.getElementById('pp-dialog-title') ? document.getElementById('pp-dialog-title').textContent : '', message: document.getElementById('pp-dialog-message') ? document.getElementById('pp-dialog-message').textContent : '', value: input ? input.value : null, focus: !!input && document.activeElement === input, placeholder: input ? input.placeholder : '', in: !!q && q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight, menuOpen: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded') };
  });
  let dlg = await dialog();
  check(tag + 'la fenêtre « ' + T.dialog + ' » s\'ouvre, entière dans le panneau, le clavier dans son champ ; le menu s\'est refermé', dlg.open && dlg.title === T.dialog && dlg.focus && dlg.in && dlg.menuOpen === 'false' && /YouTube/.test(dlg.message) && /Vimeo/.test(dlg.message) && /youtube\.com/.test(dlg.placeholder), dlg);
  await key('Escape', 400);
  check(tag + 'Échap referme la fenêtre sans rien poser', !(await dialog()).open && (await framesOf()).length === 5, await framesOf());
  // Une adresse qui n'en est pas une : la fenêtre le dit, puis revient avec ce qu'on avait collé.
  await leave();
  await chooseBlock();
  await sleep(450);
  await page.keyboard.type('https://example.com/une-video.mp4');
  await key('Enter', 500);
  dlg = await dialog();
  const noticeText = dlg.message;
  check(tag + 'une adresse d\'un autre site est refusée en le disant (« ' + T.dialog + ' », YouTube ou Vimeo), rien n\'est posé', T.invalid.test(noticeText) && (await framesOf()).length === 5, { dlg, frames: (await framesOf()).length });
  await key('Enter', 500);
  dlg = await dialog();
  check(tag + 'la fenêtre revient avec l\'adresse collée, pour la corriger', dlg.open && dlg.value === 'https://example.com/une-video.mp4' && dlg.focus, dlg);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('https://youtu.be/9bZkp7q19f0?t=42');
  await key('Enter', 700);
  let list = await framesOf();
  const made = list.length === 6 ? list.find(f => !frames.some(g => g.pos === f.pos)) : null;
  const sel = await selected();
  check(tag + 'Entrée pose UNE vidéo : sélectionnée, avec son réglage (départ à 42 s), son lien sur YouTube, son titre « ' + T.title + ' » et son nom pour un lecteur d\'écran', list.length === 6 && !!made && made.video === 'youtube:9bZkp7q19f0@42' && made.link === 'https://www.youtube.com/watch?v=9bZkp7q19f0&t=42s' && made.text === T.title && made.alt === T.title && !!sel && sel.video === made.video, { made, sel });
  const pageSize = await page.evaluate(() => ({ w: PageLayout.getPageSizePt ? PageLayout.getPageSizePt().width : 960, h: PageLayout.getPageSizePt ? PageLayout.getPageSizePt().height : 540 }));
  check(tag + 'le cadre posé est large de 60 % de la page, au format 16/9, à la page, centré, en gris clair à fin trait', !!made && near(made.w, 0.6 * pageSize.w, 0.7) && near(made.h, made.w * 9 / 16, 0.7) && made.x >= 0 && made.y >= 0 && made.x + made.w <= pageSize.w + 0.5 && made.y + made.h <= pageSize.h + 0.5 && made.fill === '#f1f3f6' && made.line === '#bfbfbf' && made.lw === 0.75, { made, pageSize });
  const placed = await page.waitForFunction(() => Array.from(document.querySelectorAll('#editor-container .ProseMirror .pp-free-frame[data-ff-video] .pp-ff-video')).length === 3, null, { timeout: 4000 }).then(() => true).catch(() => false);
  check(tag + 'la vignette du cadre posé est là (trois vidéos dans le document)', placed, placed);
  await key('Control+z', 600);
  list = await framesOf();
  check(tag + 'UN Ctrl+Z retire la vidéo (cinq cadres) ; la vignette part avec elle', list.length === 5 && (await page.evaluate(() => document.querySelectorAll('#editor-container .ProseMirror .pp-ff-video').length)) === 2, { frames: list.length });
  await key('Control+y', 600);
  list = await framesOf();
  check(tag + 'UN Ctrl+Y la remet, avec son réglage', list.length === 6 && list.some(f => f.video === 'youtube:9bZkp7q19f0@42'), list.map(f => f.video));
  await key('Control+z', 500);
  // Le code « Intégrer » collé tel quel.
  await leave();
  await chooseBlock();
  await sleep(450);
  await page.keyboard.insertText('<iframe width="560" height="315" src="https://player.vimeo.com/video/76979871?h=abcdef0123&amp;badge=0" frameborder="0" allowfullscreen></iframe>');
  await key('Enter', 700);
  list = await framesOf();
  check(tag + 'le code « Intégrer » de Vimeo, collé tel quel, pose la vidéo (on n\'y lit que son adresse) : le cadre ne garde ni balise, ni attribut du code', list.length === 6 && list.some(f => f.video === 'vimeo:76979871/abcdef0123' && f.link === WATCH_V) && !/<iframe|frameborder/i.test(await page.evaluate(() => Editor.getHTML())), list.map(f => f.video));
  await key('Control+z', 500);
  // Au clavier : « Vidéo… » est un vrai bouton du menu « Lien et blocs de contenu » (Tab, Entrée) : Entrée ouvre la fenêtre, le clavier dans son champ.
  await leave();
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.chain().setTextSelection(1).focus().run(); document.querySelector('#v2-btn-link').focus(); });
  await sleep(250);
  await page.evaluate(() => document.querySelector('#v2-btn-video').focus());
  await sleep(150);
  await key('Enter', 600);
  dlg = await dialog();
  check(tag + 'Entrée sur « ' + T.row + ' » ouvre la fenêtre, le clavier dans son champ', dlg.open && dlg.focus && dlg.title === T.dialog, dlg);
  await key('Escape', 400);

  // --- 6. La Lecture.
  console.log('\n' + tag + '6) La Lecture');
  await leave();
  await click('#btn-mode-read');
  await sleep(1500);
  const inRead = () => page.evaluate(() => {
    const root = document.getElementById('reader-container');
    return Array.from(root.querySelectorAll('.pp-free-frame[data-ff-video]')).map((f) => {
      const v = f.querySelector(':scope > .pp-free-frame-box > .pp-ff-video');
      const b = v ? v.querySelector('.pp-ff-video-play') : null;
      const r = v ? v.getBoundingClientRect() : null;
      return { video: f.getAttribute('data-ff-video'), has: !!v, name: v ? v.querySelector('.pp-ff-video-name').textContent : '', label: b ? b.getAttribute('aria-label') : '', cursor: getComputedStyle(f.querySelector(':scope > .pp-free-frame-box')).cursor, click: b ? getComputedStyle(b).pointerEvents : '', rect: r && { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height } };
    });
  });
  const read = await inRead();
  check(tag + 'la Lecture montre la vignette des deux vidéos (YouTube, Vimeo) ; le cadre piégé et le cadre sans vidéo n\'en ont pas ; la main sur la vidéo ; le bouton ne prend pas la souris (le clic est celui du cadre)', read.length === 2 && read.every(v => v.has) && read[0].name === 'YouTube' && read[1].name === 'Vimeo' && read[0].label === T.play && read[0].cursor === 'pointer' && read[0].click === 'none', read);
  const readerBox = async (index) => {
    await page.evaluate((i) => { const f = document.querySelectorAll('#reader-container .pp-free-frame[data-ff-video]')[i]; f.querySelector(':scope > .pp-free-frame-box').scrollIntoView({ block: 'center', inline: 'nearest' }); }, index);
    await sleep(400);
    return (await inRead())[index].rect;
  };
  const rb = await readerBox(0);
  const nPlay = await countOf('afficher');
  const openedAtRead = (await opened()).length;
  await reach(rb);
  await page.mouse.click(rb.x, rb.y);
  await sleep(400);
  const readPlay = await lastOf('afficher');
  const rbNow = (await inRead())[0].rect;
  check(tag + 'un clic sur la vidéo, à la Lecture, monte le lecteur de GFS à sa place (le rectangle de la vignette, à 1 px), sans ouvrir d\'onglet', (await countOf('afficher')) === nPlay + 1 && !!readPlay && readPlay.args.fournisseur === 'youtube' && near(readPlay.args.rect.x, rbNow.left, 1) && near(readPlay.args.rect.y, rbNow.top, 1) && near(readPlay.args.rect.largeur, rbNow.width, 1) && (await opened()).length === openedAtRead, { readPlay: readPlay && readPlay.args, rbNow, opened: await opened() });
  await key('Escape', 300);
  check(tag + 'Échap ferme le lecteur', !(await stubPlayer()), await stubNames());
  await reach(rb);
  await page.mouse.click(rb.x, rb.y);
  await sleep(350);
  const playingInRead = !!(await stubPlayer());
  await leave();
  await click('#btn-mode-edit');
  await sleep(900);
  check(tag + 'revenu à l\'édition, la lecture s\'est arrêtée (le calque de la Lecture est parti) : plus de lecteur chez GFS', playingInRead && !(await stubPlayer()), { playingInRead, player: await stubPlayer() });
  // Le lien de la vidéo, à la Lecture, quand GFS ne sait rien jouer.
  await page.evaluate(() => window.__gfsStub.setLecteurs([]));
  await sleep(250);
  await click('#btn-mode-read');
  await sleep(1300);
  const rb2 = await readerBox(0);
  const openedBeforeRead = (await opened()).length;
  const callsBeforeRead = (await stubCalls()).length;
  await reach(rb2);
  await page.mouse.click(rb2.x, rb2.y);
  await sleep(350);
  urls = await opened();
  check(tag + 'GFS sans lecteur : le clic à la Lecture ouvre la vidéo sur YouTube, sans appel à GFS', urls.length === openedBeforeRead + 1 && urls[urls.length - 1] === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s' && (await stubCalls()).length === callsBeforeRead, { urls, calls: (await stubCalls()).length - callsBeforeRead });
  await page.evaluate(() => window.__gfsStub.setLecteurs(['youtube', 'vimeo']));
  await sleep(250);
  await leave();
  await click('#btn-mode-edit');
  await sleep(900);

  // --- 7. Le diaporama.
  console.log('\n' + tag + '7) Le diaporama');
  await leave();
  await click('.pp-slide-item', 0);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await sleep(1200);
  const inShow = () => page.evaluate(() => {
    const root = (document.querySelector('.pp-slide-show .pp-slide-show-host') || {}).shadowRoot;
    if (!root) return null;
    return Array.from(root.querySelectorAll('.pp-free-frame[data-ff-video]')).map((f) => {
      const v = f.querySelector(':scope > .pp-free-frame-box > .pp-ff-video');
      const r = v ? v.getBoundingClientRect() : null;
      return { video: f.getAttribute('data-ff-video'), has: !!v, rect: r && { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height } };
    });
  });
  const shows = await inShow();
  check(tag + 'le diaporama montre la vignette des deux vidéos de la 1re diapositive', !!shows && shows.length === 2 && shows.every(v => v.has && v.rect.width > 20), shows);
  const open1 = (await opened()).length;
  const afficherBefore = await countOf('afficher');
  await reach(shows[0].rect);
  await page.mouse.click(shows[0].rect.x, shows[0].rect.y);
  await sleep(450);
  const showPlay = await lastOf('afficher');
  const showNow = (await inShow())[0].rect;
  check(tag + 'un clic sur la vidéo, au diaporama, monte le lecteur de GFS à sa place (le rectangle de la vignette, à 1 px) sans passer à la diapositive suivante ni ouvrir d\'onglet',
    (await countOf('afficher')) === afficherBefore + 1 && !!showPlay && near(showPlay.args.rect.x, showNow.left, 1) && near(showPlay.args.rect.y, showNow.top, 1) && near(showPlay.args.rect.largeur, showNow.width, 1) && (await opened()).length === open1
      && await page.evaluate(() => SlideShow.state().index === 0), { showPlay: showPlay && showPlay.args.rect, showNow, opened: (await opened()).length - open1 });
  const closedBefore = await countOf('fermer');
  await key('ArrowRight', 300);
  check(tag + 'passer à la diapositive suivante ferme le lecteur tout de suite (le son ne passe pas sur la suite)', (await countOf('fermer')) === closedBefore + 1 && !(await stubPlayer()) && (await page.evaluate(() => SlideShow.state().index)) === 1, { calls: await stubNames(), state: await page.evaluate(() => SlideShow.state().index) });
  await key('ArrowLeft', 500);
  const back = await inShow();
  await reach(back[1].rect);
  await page.mouse.click(back[1].rect.x, back[1].rect.y);
  await sleep(400);
  const vimeoPlay = await lastOf('afficher');
  check(tag + 'revenu à la 1re diapositive, le clic sur la vidéo Vimeo monte le lecteur de Vimeo', !!vimeoPlay && vimeoPlay.args.fournisseur === 'vimeo' && vimeoPlay.args.video === '76979871/abcdef0123' && !vimeoPlay.args.debut && !!(await stubPlayer()), vimeoPlay);
  const closedBefore2 = await countOf('fermer');
  await key('Escape', 800);
  check(tag + 'Échap ferme le lecteur et le diaporama', (await countOf('fermer')) === closedBefore2 + 1 && !(await stubPlayer()) && !(await page.evaluate(() => !!document.querySelector('.pp-slide-show'))), await stubNames());

  // --- 8. Les exports : le titre du cadre, jamais la vignette.
  console.log('\n' + tag + '8) Les exports : un cadre et son titre');
  await leave();
  const [pdfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const pdfBytes = readFileSync(await pdfDownload.path());
  const pdf = await page.evaluate(async (data64) => {
    if (!window.pdfjsLib) {
      await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const raw = atob(data64);
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const content = await p.getTextContent();
      pages.push(content.items.map(it => it.str).join(' ').replace(/\s+/g, ' '));
    }
    return { numPages: doc.numPages, pages };
  }, pdfBytes.toString('base64'));
  check(tag + 'le PDF écrit les titres des cadres vidéo (« Ma vidéo », « Autre vidéo ») et rien de la vignette (ni « YouTube », ni « Vimeo »)', /Ma vidéo/.test(pdf.pages[0]) && /Autre vidéo/.test(pdf.pages[0]) && !/YouTube|Vimeo/.test(pdf.pages.join(' ')), pdf.pages);
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pptx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  const [pptxDownload] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), click('#btn-export-pdf')]);
  const pptxB64 = readFileSync(await pptxDownload.path()).toString('base64');
  const pptx = await page.evaluate(async (b64) => {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
    const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
    return { text: (slide1.match(/<a:t>[^<]*<\/a:t>/g) || []).join(' '), targets: (rels.match(/Target="https?:[^"]*"/g) || []), ext: /<p:(?:pic|graphicFrame)[^>]*>[\s\S]*?(?:youtube|vimeo)/i.test(slide1) };
  }, pptxB64);
  check(tag + 'le PowerPoint écrit les titres et le lien de chaque vidéo vers son site (YouTube, Vimeo), sans le texte de la vignette',
    /Ma vidéo/.test(pptx.text) && /Autre vidéo/.test(pptx.text) && !/YouTube|Vimeo/.test(pptx.text) && pptx.targets.some(x => /youtube\.com\/watch\?v=dQw4w9WgXcQ&amp;t=90s|youtube\.com\/watch\?v=dQw4w9WgXcQ&t=90s/.test(x)) && pptx.targets.some(x => /vimeo\.com\/76979871\/abcdef0123/.test(x)) && !pptx.ext, pptx);
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });

  {
  // --- 8b. La vidéo d'un DOCUMENT (demande d'Antoine du 07/11 : « les vidéos doivent aussi être dispo dans les documents », « comme une image on peut la bouger dans et sur le texte ») : « Vidéo… » du même menu,
  // une image du modèle (l'identifiant seul), vignette ▶, le lecteur de GFS à sa place, et tous les réglages d'une image : taille, habillage à gauche, devant le texte.
  console.log('\n' + tag + '8b) Dans un document : une vidéo qui se pose, se règle et se lit comme une image');
  await page.evaluate(() => window.__gfsStub.setLecteurs(['youtube', 'vimeo']));
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '1', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '1', null, { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  const FIRST = 'Avant la vidéo.';
  await page.evaluate(([first]) => {
    const ed = EditorCore.getEditor();
    ed.commands.setContent('<p>' + first + '</p><p>Après la vidéo : un texte assez long pour passer autour de l\'image quand elle est habillée à gauche, puis revenir dessous sur plusieurs lignes de suite, à la file.</p>');
    ed.chain().setTextSelection(first.length + 1).focus().run();
  }, [FIRST]);
  await sleep(300);
  const docVideos = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && node.attrs.video) out.push({ pos, video: node.attrs.video, src: node.attrs.src || '', alt: node.attrs.alt || '', width: node.attrs.width, wrap: node.attrs.wrap, align: node.attrs.align, layer: node.attrs.layer }); });
    return out;
  });
  const IMG = '#editor-container .ProseMirror .editor-image-video img';
  const PLAY = '#editor-container .ProseMirror .editor-image-video .editor-image-video-play';
  const docPlayer = async () => { await sleep(350); return { calls: await countOf('afficher'), last: await lastOf('afficher'), player: await stubPlayer() }; };
  await chooseBlock();
  await sleep(400);
  dlg = await dialog();
  check(tag + 'dans un document, « ' + T.row + ' » ouvre la même fenêtre (' + T.dialog + '), le clavier dans son champ', dlg.open && dlg.title === T.dialog && dlg.focus, dlg);
  await page.keyboard.type('https://youtu.be/9bZkp7q19f0?t=42');
  await key('Enter', 700);
  let docs = await docVideos();
  check(tag + 'Entrée pose UNE vidéo dans le texte : l\'image du modèle porte le réglage (départ à 42 s), sans adresse (`src`), sur sa ligne, centrée, large de 480 px, avec son titre pour texte alternatif',
    docs.length === 1 && docs[0].video === 'youtube:9bZkp7q19f0@42' && docs[0].src === '' && docs[0].wrap === 'block' && docs[0].align === 'center' && docs[0].width === '480px' && docs[0].alt === T.title && docs[0].layer === 'normal', docs);
  const savedHtml = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le modèle enregistré ne contient ni adresse, ni lecteur : ni `youtube.com`, ni <iframe>, <video>, <object>, <embed>, ni `src` sur l\'image de la vidéo', !/youtube\.com|youtu\.be|<iframe|<video|<object|<embed/i.test(savedHtml) && /<img[^>]*data-video="youtube:9bZkp7q19f0@42"/.test(savedHtml) && !/<img[^>]*data-video[^>]*\ssrc=/.test(savedHtml), savedHtml);
  await page.evaluate(() => { document.querySelector('#editor-container .ProseMirror .editor-image-video').scrollIntoView({ block: 'center' }); });
  await sleep(400);
  const box = await rectOf(IMG);
  const leaked = requests.filter(u => /youtube|youtu\.be|ytimg|vimeo|googlevideo/i.test(u));
  check(tag + 'la vignette (un rectangle gris, ▶ et le nom du site) est une image 16/9 dessinée dans l\'éditeur, entière dans le panneau, sans rien demander à YouTube', !!box && near(box.height / box.width, 9 / 16, 0.01) && box.left >= 0 && box.right <= WIDTH && box.top >= 0 && box.bottom <= HEIGHT && leaked.length === 0, { box, leaked });
  const playBox = await rectOf(PLAY);
  const label = await page.evaluate((sel) => document.querySelector(sel).getAttribute('aria-label'), PLAY);
  check(tag + 'le disque ▶ est un vrai bouton « ' + T.play + ' », au milieu de la vignette', !!playBox && label === T.play && near(playBox.x, box.x, 3) && Math.abs(playBox.y - box.y) < box.height * 0.1 && playBox.width >= 22, { playBox, label, box });
  const callsBefore = await countOf('afficher');
  await reach(playBox);
  await page.mouse.click(playBox.x, playBox.y);
  let got = await docPlayer();
  const sentBox = got.last && got.last.args && got.last.args.rect;
  check(tag + 'un clic sur ▶ demande le lecteur à GFS : YouTube, l\'identifiant seul (jamais une adresse), le départ à 42 s, à la place exacte de la vignette', got.calls === callsBefore + 1 && got.last.args.fournisseur === 'youtube' && got.last.args.video === '9bZkp7q19f0' && got.last.args.debut === 42
    && !!sentBox && near(sentBox.x, box.left, 2) && near(sentBox.y, box.top, 2) && near(sentBox.largeur, box.width, 2) && near(sentBox.hauteur, box.height, 2) && !/https?:|youtube\.com/i.test(JSON.stringify(got.last.args)), got);
  const noSelection = await page.evaluate(() => { const sel = EditorCore.getEditor().state.selection; return { node: !!sel.node, selectedClass: !!document.querySelector('.editor-image-selected') }; });
  check(tag + 'le clic sur ▶ lit la vidéo sans sélectionner l\'image', !noSelection.node && !noSelection.selectedClass, noSelection);
  await key('Escape', 400);
  check(tag + 'Échap ferme le lecteur', !(await stubPlayer()) && (await lastOf('fermer')) !== null, await stubNames());
  // Le reste de l'image se clique pour la sélectionner : ses poignées, sa barre ; aucun lecteur.
  const poster = await rectOf(IMG);
  await reach({ x: poster.left + 24, y: poster.top + 20 });
  await page.mouse.click(poster.left + 24, poster.top + 20);
  await sleep(450);
  const picked = await page.evaluate(() => { const sel = EditorCore.getEditor().state.selection; const bar = document.querySelector('.v2-image-toolbar'); return { node: sel.node ? sel.node.type.name : '', video: sel.node ? sel.node.attrs.video : '', cls: !!document.querySelector('.editor-image-video.editor-image-selected'), toolbar: !!bar && getComputedStyle(bar).display !== 'none', calls: window.__gfsStub.lecteurAppels.filter(c => c.nom === 'afficher').length }; });
  check(tag + 'un clic ailleurs sur la vignette sélectionne l\'image (barre des images affichée) et ne lit rien', picked.node === 'editorImage' && picked.video === 'youtube:9bZkp7q19f0@42' && picked.cls && picked.toolbar && picked.calls === callsBefore + 1, picked);
  // « Dans le texte » : habillée à gauche, le texte la contourne.
  await click('.v2-image-toolbar button[data-action="align-left"]');
  await sleep(450);
  docs = await docVideos();
  const wrapped = await page.evaluate(() => {
    const img = document.querySelector('#editor-container .ProseMirror .editor-image-video img').getBoundingClientRect();
    const second = document.querySelectorAll('#editor-container .ProseMirror > p')[1];
    const range = document.createRange();
    range.setStart(second.firstChild, 0); range.setEnd(second.firstChild, 5);
    const text = range.getBoundingClientRect();
    return { imgRight: img.right, imgTop: img.top, imgBottom: img.bottom, textLeft: text.left, textTop: text.top };
  });
  check(tag + 'habillée à gauche (barre des images), la vidéo laisse le texte la contourner : le début du paragraphe suivant est à sa droite', docs[0].align === 'left' && wrapped.textLeft >= wrapped.imgRight - 1 && wrapped.textTop < wrapped.imgBottom, { docs, wrapped });
  // Elle se redimensionne à la poignée, en gardant ses proportions.
  await click('.v2-image-toolbar button[data-action="align-center"]');
  await sleep(350);
  await page.evaluate(() => { document.querySelector('#editor-container .ProseMirror .editor-image-video').scrollIntoView({ block: 'center' }); });
  await sleep(300);
  const corner = await rectOf('#editor-container .ProseMirror .editor-image-video .editor-image-handle-se');
  const before = await rectOf(IMG);
  await reach(corner);
  await page.mouse.down();
  await page.mouse.move(corner.x - 60, corner.y - 20, { steps: 6 });
  await page.mouse.up();
  await sleep(450);
  const after = await rectOf(IMG);
  docs = await docVideos();
  check(tag + 'la poignée en bas à droite la réduit en gardant le 16/9, et le modèle garde la nouvelle largeur', after.width < before.width - 20 && near(after.height / after.width, 9 / 16, 0.01) && parseFloat(docs[0].width) < 480 && Math.abs(parseFloat(docs[0].width) * (before.width / 480) - after.width) < 4, { before, after, docs });
  // Devant le texte : elle sort du texte, son lecteur la suit toujours.
  await click('.v2-image-toolbar button[data-action="layer-front"]');
  await sleep(500);
  docs = await docVideos();
  const front = await rectOf(IMG);
  const playFront = await rectOf(PLAY);
  const frontBefore = await countOf('afficher');
  await reach(playFront);
  await page.mouse.click(playFront.x, playFront.y);
  got = await docPlayer();
  const frontSent = got.last && got.last.args && got.last.args.rect;
  check(tag + 'devant le texte (calque), la vidéo se lit toujours à sa place : le rectangle envoyé à GFS est celui de la vignette', docs[0].layer === 'front' && got.calls === frontBefore + 1 && !!frontSent && near(frontSent.x, front.left, 2) && near(frontSent.y, front.top, 2) && near(frontSent.largeur, front.width, 2), { docs, front, frontSent });
  await key('Escape', 400);
  await click('.v2-image-toolbar button[data-action="layer-normal"]');
  await sleep(400);
  // Annuler : un Ctrl+Z défait la pose d'une seconde vidéo en entier.
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.chain().setTextSelection(1).focus().run(); });
  await chooseBlock();
  await sleep(400);
  await page.keyboard.type('https://vimeo.com/76979871/abcdef0123');
  await key('Enter', 700);
  docs = await docVideos();
  const twoVideos = docs.map(d => d.video);
  await key('Control+z', 600);
  const afterUndo = (await docVideos()).map(d => d.video);
  await key('Control+y', 600);
  const afterRedo = (await docVideos()).map(d => d.video);
  check(tag + 'UN Ctrl+Z retire la seconde vidéo (Vimeo, avec sa clé), UN Ctrl+Y la remet', twoVideos.length === 2 && twoVideos.indexOf('vimeo:76979871/abcdef0123') >= 0 && afterUndo.length === 1 && afterUndo[0] === 'youtube:9bZkp7q19f0@42' && afterRedo.length === 2, { twoVideos, afterUndo, afterRedo });
  await key('Control+z', 500);
  // La Lecture : la vignette est là, un clic lit la vidéo à sa place, Entrée aussi ; sans GFS qui sache jouer le site, la vidéo s'ouvre sur son site.
  await leave();
  await click('#btn-mode-read');
  await sleep(1500);
  const readImg = () => page.evaluate(() => {
    const root = document.getElementById('reader-container');
    return Array.from(root.querySelectorAll('img[data-video]')).map(i => { const r = i.getBoundingClientRect(); return { video: i.getAttribute('data-video'), src: (i.getAttribute('src') || '').slice(0, 24), ready: i.hasAttribute('data-pp-video-ready'), role: i.getAttribute('role'), label: i.getAttribute('aria-label'), tab: i.getAttribute('tabindex'), x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height };
    });
  });
  await page.evaluate(() => { document.querySelector('#reader-container img[data-video]').scrollIntoView({ block: 'center' }); });
  await sleep(400);
  const reads = await readImg();
  check(tag + 'à la Lecture, la vidéo est une image avec sa vignette, un nom « ' + T.play + ' », focalisable ; rien n\'est demandé à YouTube', reads.length === 1 && reads[0].video === 'youtube:9bZkp7q19f0@42' && /^data:image\/svg\+xml/.test(reads[0].src) && reads[0].ready && reads[0].role === 'button' && reads[0].label === T.play && reads[0].tab === '0' && near(reads[0].height / reads[0].width, 9 / 16, 0.01) && !requests.some(u => /youtube|ytimg|googlevideo/i.test(u)), reads);
  const readBefore = await countOf('afficher');
  await reach(reads[0]);
  await page.mouse.click(reads[0].x, reads[0].y);
  got = await docPlayer();
  const readSent = got.last && got.last.args && got.last.args.rect;
  check(tag + 'un clic sur la vignette, à la Lecture, demande le lecteur de GFS à sa place (rectangle de la vignette, identifiant seul)', got.calls === readBefore + 1 && got.last.args.video === '9bZkp7q19f0' && got.last.args.debut === 42 && !!readSent && near(readSent.x, reads[0].left, 2) && near(readSent.largeur, reads[0].width, 2), { got, reads });
  await key('Escape', 400);
  await page.evaluate(() => document.querySelector('#reader-container img[data-video]').focus());
  await key('Enter', 400);
  got = await docPlayer();
  check(tag + 'au clavier, Entrée sur la vignette focalisée lit la vidéo aussi', got.calls === readBefore + 2 && !!got.player, got);
  await key('Escape', 400);
  await page.evaluate(() => window.__gfsStub.setLecteurs([]));
  await sleep(250);
  const openedBefore = (await opened()).length;
  await reach(reads[0]);
  await page.mouse.click(reads[0].x, reads[0].y);
  await sleep(350);
  const urlsRead = await opened();
  check(tag + 'GFS ne sait rien jouer : le clic sur la vignette ouvre la vidéo sur YouTube (au départ de 42 s), sans rien demander à GFS', urlsRead.length === openedBefore + 1 && urlsRead[urlsRead.length - 1] === 'https://www.youtube.com/watch?v=9bZkp7q19f0&t=42s' && (await countOf('afficher')) === readBefore + 2, { urlsRead });
  await page.evaluate(() => window.__gfsStub.setLecteurs(['youtube', 'vimeo']));
  await click('#btn-mode-edit');
  await sleep(800);
  }
  check(tag + 'aucune erreur de page pendant tout le parcours', errors.length === 0, errors);
  await page.close();
}

// --- 9. Dans le cadre isolé de GFS : où le lecteur tombe, vu de la page de GFS.
async function runFramed() {
  const tag = '[fr framed] ';
  console.log('\n' + tag + '9) Dans le cadre isolé de GFS : le lecteur par-dessus le cadre de l\'app');
  const { page, app } = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, lecteurs: PLAYERS }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const near = (a, b, tolerance = 1.5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await app.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await app.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length === 2, null, { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  const ctx = await app.evaluate(() => ({ origin: window.origin, players: GfsLink.players(), hosted: GfsLink.hosted }));
  check(tag + 'l\'app est dans un cadre à origine opaque, hébergée, et sait que GFS joue YouTube et Vimeo', ctx.origin === 'null' && ctx.hosted && JSON.stringify(ctx.players) === JSON.stringify(['youtube', 'vimeo']), ctx);
  await app.evaluate((sel) => { const f = document.querySelectorAll(sel)[0]; f.querySelector(':scope > .pp-free-frame-box').scrollIntoView({ block: 'start', inline: 'center' }); }, '#editor-container .ProseMirror .pp-free-frame');
  await sleep(500);
  const calque = () => app.evaluate(() => { const v = document.querySelector('#editor-container .ProseMirror .pp-free-frame .pp-ff-video'); const r = v.getBoundingClientRect(); const b = v.querySelector('.pp-ff-video-play').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right, px: b.left + b.width / 2, py: b.top + b.height / 2 }; });
  const scrollerOf = () => app.evaluate(() => { let n = document.querySelector('#editor-container .ProseMirror .pp-free-frame').parentElement; while (n && !/(auto|scroll)/.test(getComputedStyle(n).overflowY)) n = n.parentElement; const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  const c0 = await calque();
  await page.mouse.move(c0.px - 10, c0.py);
  await page.mouse.move(c0.px, c0.py, { steps: 2 });
  await sleep(100);
  await page.mouse.click(c0.px, c0.py);
  await sleep(600);
  const overlay = () => page.evaluate(() => {
    const o = document.getElementById('gfs-lecteur');
    if (!o) return null;
    const r = o.getBoundingClientRect();
    const f = o.firstChild.getBoundingClientRect();
    const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e === o || (!!e && o.contains(e)); };
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, visibility: getComputedStyle(o).visibility, inner: { left: f.left, top: f.top, width: f.width, height: f.height }, centre: hit(r.left + r.width / 2, r.top + r.height / 2), adresse: o.firstChild.getAttribute('data-adresse'), sandbox: o.firstChild.getAttribute('sandbox'), referrer: o.firstChild.getAttribute('referrerpolicy') };
  });
  let o = await overlay();
  check(tag + 'le lecteur de GFS est posé par-dessus le cadre de l\'app, sur le calque (à 1,5 px), visible, et c\'est lui que la souris atteint en son centre', !!o && o.visibility === 'visible' && near(o.left, c0.left, 1.5) && near(o.top, c0.top, 1.5) && near(o.width, c0.width, 1.5) && near(o.height, c0.height, 1.5) && o.centre, { o, c0 });
  check(tag + 'GFS monte l\'adresse lui-même (youtube-nocookie.com, départ à 90 s), dans un cadre à origine propre (allow-same-origin) et à référent, comme le contrat le demande', !!o && /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=90/.test(o.adresse) && /allow-same-origin/.test(o.sandbox) && o.referrer === 'strict-origin-when-cross-origin', o);
  await page.screenshot({ path: '/tmp/video-frame-framed.png' });
  // Défiler : le lecteur suit, rogné par le haut de la zone qui défile.
  const area = await scrollerOf();
  await app.evaluate((sel) => { let n = document.querySelector(sel).parentElement; while (n && !/(auto|scroll)/.test(getComputedStyle(n).overflowY)) n = n.parentElement; n.scrollTop += 90; }, '#editor-container .ProseMirror .pp-free-frame');
  await sleep(500);
  const c1 = await calque();
  o = await overlay();
  const topExpected = Math.max(c1.top, area.top);
  const bottomExpected = Math.min(c1.bottom, area.bottom);
  check(tag + 'l\'éditeur défile de 90 px : le lecteur suit le calque, rogné à la zone qui défile (il ne déborde ni sur la barre d\'outils, ni sous la zone)', !!o && near(c0.top - c1.top, 90, 4) && near(o.top, topExpected, 1.5) && near(o.bottom, bottomExpected, 1.5) && o.top >= area.top - 1.5 && o.bottom <= area.bottom + 1.5 && o.visibility === 'visible', { o, c1, area, topExpected, bottomExpected });
  // Tout en haut hors zone : caché.
  await app.evaluate((sel) => { let n = document.querySelector(sel).parentElement; while (n && !/(auto|scroll)/.test(getComputedStyle(n).overflowY)) n = n.parentElement; n.scrollTop += 4000; }, '#editor-container .ProseMirror .pp-free-frame');
  await sleep(500);
  o = await overlay();
  check(tag + 'la vidéo sortie de la zone qui défile : le lecteur est caché (pas rogné à rien en laissant le son), sans être fermé aussitôt', !!o && o.visibility === 'hidden', o);
  await sleep(2600);
  o = await overlay();
  check(tag + 'deux secondes plus tard, le lecteur de GFS est retiré', o === null, o);
  check(tag + 'aucune erreur de page pendant tout le parcours', errors.length === 0, errors);
  await page.close();
}

const only = process.env.VIDEO_FRAME_ONLY || '';
if (!only || only === 'fr') await run('fr', 'light');
if (!only || only === 'en') await run('en', 'dark');
if (!only || only === 'framed') await runFramed();
await t.finish();
