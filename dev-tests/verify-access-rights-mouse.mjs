#!/usr/bin/env node
// Droits par personne (js/access-rights.js) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400) :
// dev-tests/scenarios-access-rights.js tourne DANS la page (dispatchEvent, .click(), Range posé à la main) et pose le réglage après le démarrage. Ici,
// le réglage existe AVANT le démarrage (options du widget semées comme Grist les enverrait), puis une personne en lecture seule qui peut commenter
// sélectionne du texte en glissant la souris dans le mode Lecture, clique Commenter, tape son message et clique Publier.
// Lancé par run-headless.mjs (groupe Node "accessRightsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-access-rights-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ACCESS_RIGHTS_MOUSE_PORT || 8898);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-var-toolbar-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(PORT, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${PORT}`;

const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-access-rights-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
if (OFFLINE) {
  await page.route('**://esm.sh/**', async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
    if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
  });
  for (const [re, rel] of UMD_ROUTES) {
    await page.route(re, async route => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: await readFile(join(CACHE, rel), 'utf8'),
    }));
  }
  await page.addInitScript(() => {
    Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} });
  });
  await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
}


// Semé avant le démarrage (grist-stub.js appelle window.__preSeedGristStub avant le premier fetchTable de GristAPI.init) : réglage du widget, ligne de
// droits de la personne, email renvoyé par l'identification, modèle par défaut à ouvrir.
await page.addInitScript(() => {
  window.__preSeedGristStub = (stub) => {
    stub.setVariables('Clients', { Nom: 'Text' });
    stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
    stub.setVariables('Droits', { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    stub.setRows('Droits', [{ id: 1, Email: 'lecteur@exemple.fr', LectureSeule: true, Export: false, Commentaires: true }]);
    stub.setUserEmail('lecteur@exemple.fr');
    stub.state.options = { droitsAcces: { table: 'Droits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' } };
    const m = stub.state.rows.Publipostage_Modeles;
    m.id.push(1); m.Nom.push('Contrat');
    m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p><p>Second paragraphe du modèle.</p>');
    m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
    stub.state.nextRowId.Publipostage_Modeles = 2;
  };
});

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

// 1) Démarrage : les droits sont connus avant le premier affichage - le widget s'ouvre directement en Lecture, verrouillé.
const startup = await page.evaluate(() => ({
  status: document.getElementById('status-msg').textContent,
  readerShown: document.getElementById('reader-container').style.display,
  editorShown: document.getElementById('editor-container').style.display,
  rights: AccessRights.get(),
}));
check('au démarrage : statut « lecture seule », mode Lecture affiché, éditeur caché',
  /lecture seule/i.test(startup.status) && startup.readerShown === 'block' && startup.editorShown === 'none' && startup.rights.readOnly, startup);

await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
await page.waitForFunction(() => {
  const c = document.querySelector('#reader-container .reader-content');
  return !!c && (c.textContent || '').indexOf('Dupont') !== -1;
}, null, { timeout: 10000 });

async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}

// 2) Vrais clics sur des commandes grisées : Mode édition et Exporter en PDF ne font rien.
await page.evaluate(() => {
  window.__exportCalls = 0;
  PdfExport.exportCurrentRecord = async () => { window.__exportCalls++; };
});
const editBtn = await hitTest('#btn-mode-edit');
if (editBtn.found) await page.mouse.click(editBtn.x, editBtn.y);
const pdfBtn = await hitTest('#btn-export-pdf');
if (pdfBtn.found) await page.mouse.click(pdfBtn.x, pdfBtn.y);
await page.waitForTimeout(400);
const afterLockedClicks = await page.evaluate(() => ({
  readerShown: document.getElementById('reader-container').style.display,
  exportCalls: window.__exportCalls,
  editGreyed: getComputedStyle(document.getElementById('btn-mode-edit')).opacity,
}));
check('vrai clic sur Mode édition et Exporter en PDF grisés : rien ne se passe',
  editBtn.found && pdfBtn.found && afterLockedClicks.readerShown === 'block' && afterLockedClicks.exportCalls === 0 && Number(afterLockedClicks.editGreyed) < 0.5,
  { editBtn, pdfBtn, afterLockedClicks });

// 3) Sélection à la souris de « le contrat » dans le mode Lecture (glisser d'un bout à l'autre du texte).
const textBox = await page.evaluate(() => {
  const content = document.querySelector('#reader-container .reader-content');
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const i = node.data.indexOf('le contrat');
    if (i === -1) continue;
    const r = document.createRange();
    r.setStart(node, i); r.setEnd(node, i + 1);
    const first = r.getBoundingClientRect();
    r.setStart(node, i + 'le contrat'.length - 1); r.setEnd(node, i + 'le contrat'.length);
    const last = r.getBoundingClientRect();
    // Fin du glisser dans la moitié gauche de l'espace qui suit : le curseur s'y place juste après le « t », pas avant.
    r.setStart(node, i + 'le contrat'.length); r.setEnd(node, i + 'le contrat'.length + 1);
    const next = r.getBoundingClientRect();
    return { x1: first.left + 0.5, x2: (last.right + (next.left + next.right) / 2) / 2, y: (first.top + first.bottom) / 2, bottom: last.bottom };
  }
  return null;
});
check('« le contrat » visible dans le mode Lecture à 700x400', !!textBox && textBox.bottom <= 400 && textBox.x2 <= 700, textBox);
if (textBox) {
  await page.mouse.move(textBox.x1, textBox.y);
  await page.mouse.down();
  await page.mouse.move(textBox.x2, textBox.y, { steps: 8 });
  await page.mouse.up();
}
await page.waitForTimeout(150);
const selectedText = await page.evaluate(() => String(window.getSelection()));
check('la sélection à la souris couvre « le contrat »', selectedText.trim() === 'le contrat', selectedText);

// 4) Bouton Commenter : atteignable à 700x400, vrai clic -> marque posée sur ce texte et composeur ouvert dans le panneau.
const commentBtn = await hitTest('#v2-btn-comment');
check('bouton Commenter visible, non recouvert et actif à 700x400', commentBtn.found && commentBtn.inViewport && commentBtn.onTop, commentBtn);
if (commentBtn.found) await page.mouse.click(commentBtn.x, commentBtn.y);
await page.waitForFunction(() => { const p = document.getElementById('v2-comment-popup'); return !!p && p.style.display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(200);
const afterComment = await page.evaluate(() => {
  const marks = [];
  EditorCore.getEditor().state.doc.descendants(n => { if (n.isText && n.marks.some(m => m.type.name === 'commentMark')) marks.push(n.text); });
  const readerMark = document.querySelector('#reader-container .comment-mark');
  return { marks, readerMark: readerMark ? readerMark.textContent : null, focused: document.activeElement && document.activeElement.className };
});
check('vrai clic sur Commenter : marque posée exactement sur « le contrat », visible en Lecture, saisie prête',
  JSON.stringify(afterComment.marks) === '["le contrat"]' && afterComment.readerMark === 'le contrat' && /v2-comment-popup-reply/.test(afterComment.focused || ''), afterComment);
const markHit = await hitTest('#reader-container .comment-mark');
check('le texte commenté est surligné à sa place dans le mode Lecture', markHit.found && markHit.onTop, markHit);
const popupBox = await hitTest('#v2-comment-popup');
check('fenêtre du commentaire entièrement dans le panneau', popupBox.found && popupBox.inViewport, popupBox);

// 5) Taper puis vrai clic sur Publier : modèle enregistré avec sa marque, fil enregistré au nom de la personne.
await page.keyboard.type('Clause à revoir');
const postBtn = await hitTest('#v2-comment-popup .v2-comment-popup-post');
check('Publier visible et non recouvert', postBtn.found && postBtn.inViewport && postBtn.onTop, postBtn);
if (postBtn.found) await page.mouse.click(postBtn.x, postBtn.y);
await page.waitForTimeout(800);
const saved = await page.evaluate(() => {
  const s = window.__gristStub;
  const row = s.getRow('Publipostage_Modeles', 1);
  const t = s.state.rows.Publipostage_Commentaires;
  return {
    contenu: row.Contenu,
    thread: t.id.map((id, i) => ({ texte: t.Texte[i], auteur: t.Auteur[i], commentId: t.CommentId[i] })),
    popupText: document.getElementById('v2-comment-popup').textContent,
  };
});
const savedMark = /<span data-comment-id="([^"]+)" data-resolved="false" class="comment-mark">le contrat<\/span>/.exec(saved.contenu);
check('Publier (vrai clic) : modèle enregistré avec la marque, fil enregistré au nom de la personne',
  !!savedMark && saved.thread.length === 1 && saved.thread[0].commentId === savedMark[1] && saved.thread[0].texte === 'Clause à revoir'
  && saved.thread[0].auteur === 'lecteur@exemple.fr' && saved.popupText.indexOf('Clause à revoir') !== -1, saved);
// Le popup se replace quand sa hauteur change (js/comments.js:renderPopup) : il doit rester collé à la marque du mode Lecture, juste dessous ou juste
// dessus (écart de 6px, ViewportFit.placePopup) - pas à celle de l'éditeur masqué, sans position, qui l'envoyait dans le coin haut gauche.
const afterPost = await page.evaluate(() => {
  const pop = document.getElementById('v2-comment-popup').getBoundingClientRect();
  const mark = document.querySelector('#reader-container .comment-mark').getBoundingClientRect();
  return { popTop: pop.top, popBottom: pop.bottom, popLeft: pop.left, markTop: mark.top, markBottom: mark.bottom, markLeft: mark.left };
});
check('après Publier, la fenêtre du commentaire reste collée au texte commenté',
  Math.min(Math.abs(afterPost.popTop - (afterPost.markBottom + 6)), Math.abs(afterPost.popBottom - (afterPost.markTop - 6))) <= 2, afterPost);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
