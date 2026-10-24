#!/usr/bin/env node
// Les liens vers une autre diapositive (js/slide-props.js, js/anchors.js, js/pptx-import.js ; demande du 24/10, « Import PowerPoint sans perte », chantier 10, lot 10b1) : un lien de PowerPoint vers une
// autre diapositive devient un lien vers le signet de cette diapositive (`#slide-3`), que porte son repère caché (`data-anchor`, `data-anchor-name`). Ce test joue la partie de l'éditeur et de la Lecture
// à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  L'ÉDITEUR : Ctrl+clic sur un lien mène à la diapositive visée (elle monte en haut de la zone qui défile, le curseur est dans son premier texte) ; la liste « Dans ce document » de la fenêtre « Lien… »
//   propose les diapositives qui ont un signet, sous leur nom ; le signet suit sa diapositive quand on lui pose une transition (un repère qui dit un signet n'est pas un repère vide) ; deux diapositives
//   qui portent la même adresse (une copie) n'en gardent qu'une.
//  LA LECTURE : le clic sur le lien amène la diapositive visée en haut de la zone qui défile, sans quitter la page.
// Lancé par run-headless.mjs (groupe Node "slideAnchor", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-anchor.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-anchor', port: Number(process.env.SLIDE_ANCHOR_PORT || 9171) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const MARK = (n, name) => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden" data-anchor="slide-${n}" data-anchor-name="${name}"></div>`;
const FILL = n => Array.from({ length: 12 }, (_, i) => `<p>Texte ${n}.${i + 1}</p>`).join('');
// Trois diapositives hautes : la première porte les liens ; la deuxième et la troisième, leur signet.
const THREE = lang => `<h1>Un</h1><p><a href="#slide-3">Aller</a> et <a href="#slide-2">Deux</a></p>${FILL(1)}${BR}${MARK(2, lang === 'en' ? 'Slide 2' : 'Diapositive 2')}<h2>Titre deux</h2>${FILL(2)}${BR}${MARK(3, lang === 'en' ? 'Slide 3' : 'Diapositive 3')}<h2>Titre trois</h2>${FILL(3)}`;
// Deux diapositives qui portent la même adresse (une copie) : seule la première la garde.
const TWINS = `${MARK(2, 'Diapositive 2')}<h1>Jumelle un</h1>${FILL(1)}${BR}${MARK(2, 'Diapositive 2')}<h2>Jumelle deux</h2>${FILL(2)}`;
const SEED = lang => seedModels({ record: RECORD }) + `
  add(7, 'Liens', '${THREE(lang)}', false, 'presentation');
  add(8, 'Jumelles', '${TWINS}', false, 'presentation');
  add(9, 'Transition', '${THREE(lang)}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, options = {}) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y, options);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, click, leave, reach };
}

// L'endroit d'un texte de l'éditeur (ou de la Lecture) à l'écran, après l'avoir fait défiler dans la vue : { x, y }.
const placeOf = (page, text, root) => page.evaluate(([word, scope]) => {
  const host = document.querySelector(scope);
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent.trim() === word) {
      n.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = document.createRange(); r.selectNodeContents(n);
      const b = r.getBoundingClientRect();
      return { x: b.left + Math.min(b.width / 2, 20), y: b.top + b.height / 2 };
    }
  }
  return null;
}, [text, root]);

// Où est la diapositive visée : le haut de son repère (éditeur) ou de son bloc d'adresse (Lecture), mesuré dans la zone qui défile.
const topOf = (page, selector, scroller) => page.evaluate(([sel, scr]) => {
  const el = document.querySelector(sel);
  const box = document.querySelector(scr);
  if (!el || !box) return null;
  return { gap: Math.round(el.getBoundingClientRect().top - box.getBoundingClientRect().top), height: el.getBoundingClientRect().height };
}, [selector, scroller]);

const caretSlide = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const pos = ed.state.selection.from;
  const slides = SlideProps.slidesOf(ed.state.doc);
  const index = slides.findIndex(slide => pos >= slide.start && pos <= slide.end);
  const parent = ed.state.selection.$from.parent;
  return { index, text: parent.textContent };
});

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED(lang), lang, colorScheme });
  const { rectOf, click, leave, reach } = toolsOf(page);
  const unsaved = () => page.evaluate(() => LiveEntry.hasUnsavedEdits());
  const open = async (id, slides) => {
    if (await unsaved()) { await leave(); await click('#btn-save'); await sleep(1000); await leave(); }
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  const SCROLLER = '#editor-container';

  // 1) Ctrl+clic sur un lien vers une diapositive : elle monte en haut de la zone qui défile, le curseur entre dans son premier texte.
  console.log('\n' + tag + '1) Ctrl+clic dans l\'éditeur');
  await open(7, 3);
  const markers = await page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').body.querySelectorAll('div.pp-slide-props')).map(m => m.getAttribute('data-anchor')));
  check(tag + 'les trois diapositives sont ouvertes, les deux dernières portent leur signet dans leur repère', same(markers, ['slide-2', 'slide-3']), markers);
  const found = await page.evaluate(() => ({ two: !!Anchors.find(EditorCore.getEditor(), 'slide-2'), three: !!Anchors.find(EditorCore.getEditor(), 'slide-3'), label: Anchors.labelOf(EditorCore.getEditor(), 'slide-3') }));
  check(tag + 'Anchors retrouve les deux diapositives, la seconde sous son nom', found.two && found.three && /^(Diapositive|Slide) 3$/.test(found.label), found);
  const link = await placeOf(page, 'Aller', '.tiptap');
  await sleep(250);
  const where = await placeOf(page, 'Aller', '.tiptap');
  await page.mouse.move(where.x - 5, where.y);
  await page.keyboard.down('Control');
  await page.mouse.click(where.x, where.y);
  await page.keyboard.up('Control');
  await sleep(500);
  const target = await topOf(page, '.tiptap .pp-slide-props[data-anchor="slide-3"]', SCROLLER);
  const caret = await caretSlide(page);
  check(tag + 'Ctrl+clic sur « Aller » amène la 3e diapositive en haut de la zone qui défile', !!target && target.gap >= -4 && target.gap <= 60 && !!link, target);
  check(tag + 'et le curseur est dans le premier texte de la 3e diapositive', caret.index === 2 && /Titre trois/.test(caret.text), caret);
  await leave();

  // 2) La liste « Dans ce document » de la fenêtre « Lien… ».
  console.log('\n' + tag + '2) La liste « Dans ce document »');
  const targets = await page.evaluate(() => Anchors.targets(EditorCore.getEditor()).bookmarks.map(b => b.id + ':' + b.name + ':' + b.snippet));
  check(tag + 'les deux diapositives sont des signets nommés, sans extrait de texte', targets.length === 2 && /^slide-2:(Diapositive|Slide) 2:$/.test(targets[0]) && /^slide-3:(Diapositive|Slide) 3:$/.test(targets[1]), targets);

  // 3) Une transition posée sur une diapositive qui a un signet : le signet reste, dans le même repère.
  console.log('\n' + tag + '3) Le signet suit sa diapositive');
  await open(9, 3);
  await page.evaluate(() => SlideProps.applyTransition(EditorCore.getEditor(), [1], { transition: 'fade', from: 'r', dur: 700 }));
  await sleep(400);
  const kept = await page.evaluate(() => {
    const body = new DOMParser().parseFromString(Editor.getHTML(), 'text/html').body;
    return Array.from(body.querySelectorAll('div.pp-slide-props')).map(m => [m.getAttribute('data-anchor'), m.getAttribute('data-trans')].join(':'));
  });
  check(tag + 'la 2e diapositive garde `slide-2` et reçoit sa transition dans le même repère', same(kept, ['slide-2:fade', 'slide-3:']), kept);
  await page.evaluate(() => SlideProps.applyTransition(EditorCore.getEditor(), [1], { transition: '', from: 'r', dur: 700 }));
  await sleep(400);
  const back = await page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').body.querySelectorAll('div.pp-slide-props')).map(m => m.getAttribute('data-anchor')));
  check(tag + 'sans effet, le repère reste : un signet n\'est pas un repère vide', same(back, ['slide-2', 'slide-3']), back);

  // 4) Deux diapositives de même adresse : une seule la garde.
  console.log('\n' + tag + '4) Une copie ne double pas l\'adresse');
  await open(8, 2);
  await page.evaluate(() => EditorCore.getEditor().commands.insertContentAt(EditorCore.getEditor().state.doc.content.size, '<p>x</p>'));
  await sleep(400);
  const twins = await page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').body.querySelectorAll('div.pp-slide-props')).map(m => m.getAttribute('data-anchor') || '-'));
  check(tag + 'la première garde `slide-2`, la seconde n\'a plus d\'adresse', twins[0] === 'slide-2' && (twins.length === 1 || twins[1] === '-'), twins);

  // 5) La Lecture : le clic sur le lien amène la diapositive visée en haut de la zone qui défile.
  console.log('\n' + tag + '5) La Lecture');
  await open(7, 3);
  await click('#btn-mode-read');
  await sleep(1500);
  const reader = await page.evaluate(() => ({ shown: !!document.querySelector('.reader-content'), anchors: Array.from(document.querySelectorAll('.reader-content [data-anchor]')).map(e => e.getAttribute('data-anchor') + ':' + e.tagName + ':' + Math.round(e.getBoundingClientRect().height)) }));
  check(tag + 'la Lecture porte un bloc d\'adresse vide par diapositive visée, sans hauteur', reader.shown && same(reader.anchors, ['slide-2:DIV:0', 'slide-3:DIV:0']), reader);
  const spot = await placeOf(page, 'Aller', '.reader-content');
  await sleep(250);
  const readerSpot = await placeOf(page, 'Aller', '.reader-content');
  await page.mouse.move(readerSpot.x - 5, readerSpot.y);
  await page.mouse.click(readerSpot.x, readerSpot.y);
  await sleep(600);
  const readerTarget = await topOf(page, '.reader-content [data-anchor="slide-3"]', '#reader-container');
  check(tag + 'un clic sur « Aller » amène la 3e diapositive en haut de la zone qui défile, sans quitter la Lecture', !!spot && !!readerTarget && readerTarget.gap >= -4 && readerTarget.gap <= 60 && (await page.evaluate(() => getComputedStyle(document.getElementById('reader-container')).display !== 'none')), readerTarget);
  await click('#btn-mode-edit');
  await sleep(500);


  // 6) Le diaporama : un clic sur le lien mène à la diapositive visée (un autre clic passerait à la suivante).
  console.log('\n' + tag + '6) Le diaporama');
  await open(7, 3);
  await click('.pp-slide-item', 0);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await sleep(900);
  const counter = () => page.evaluate(() => (document.querySelector('.pp-slide-show-counter') || {}).textContent || '');
  const inShow = (selector, text) => page.evaluate(([sel, word]) => {
    const host = document.getElementById('pp-slide-show-stage');
    const scope = host && host.shadowRoot ? host.shadowRoot : document;
    const el = Array.from(scope.querySelectorAll(sel)).find(node => !word || node.textContent.trim() === word);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, inside: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth };
  }, [selector, text]);
  const before = await counter();
  const showLink = await inShow('a[data-link-anchor="slide-3"]', 'Aller');
  check(tag + 'le diaporama montre la 1re diapositive, avec son lien « Aller »', !!showLink && showLink.inside && /^1\b/.test(before.replace(/\D*/, '')), { before, showLink });
  if (showLink) {
    await page.mouse.move(showLink.x - 8, showLink.y);
    await page.mouse.click(showLink.x, showLink.y);
    await sleep(900);
  }
  const heading = await inShow('h2', 'Titre trois');
  const after = await counter();
  check(tag + 'un clic sur « Aller » amène la 3e diapositive (son titre est à l\'écran), pas la suivante', !!heading && heading.inside && after !== before, { before, after, heading });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);

  // 7) Les exports d'une ligne, au vrai bouton « Exporter » : le PDF, le Word et le HTML reçoivent le bloc d'adresse de la diapositive visée (sans lui, leurs liens vers une diapositive ne mènent nulle part) ; le Markdown, non (un lien y reste du texte).
  console.log('\n' + tag + '7) Les exports');
  await open(7, 3);
  await page.evaluate(async () => {
    await ExportEngines.ensure(['pdf', 'docx', 'html', 'md']);
    window.__exported = [];
    [['pdf', PdfExport], ['docx', DocxExport], ['html', HtmlExport], ['md', MarkdownExport]].forEach(([name, engine]) => {
      engine.exportCurrentRecord = async (...args) => { window.__exported.push({ name, html: String(args[0]) }); return true; };
    });
  });
  const exportAs = async (type) => {
    await page.evaluate(([kind]) => { window.__exported.length = 0; document.querySelector('#v2-export-pdf-flyout [data-export-type="' + kind + '"], #v2-quality-flyout [data-export-type="' + kind + '"]').click(); }, [type]);
    await leave();
    await click('#btn-export-pdf');
    await page.waitForFunction(() => window.__exported.length > 0, null, { timeout: 15000 }).catch(() => {});
    await sleep(300);
    return page.evaluate(() => window.__exported.map(item => ({ name: item.name, anchors: (item.html.match(/class="pp-slide-anchor"/g) || []).length, ids: Array.from(item.html.matchAll(/pp-slide-anchor"[^>]*data-anchor="([^"]+)"/g)).map(m => m[1]) })));
  };
  for (const [type, engine, wanted] of [['pdf', 'pdf', true], ['docx', 'docx', true], ['html', 'html', true], ['md', 'md', false]]) {
    const got = await exportAs(type);
    check(tag + `l'export ${type} d'une ligne ${wanted ? 'reçoit' : 'ne reçoit pas'} le bloc d'adresse des diapositives visées`, got.length === 1 && got[0].name === engine && (wanted ? got[0].ids.slice().sort().join() === 'slide-2,slide-3' : got[0].anchors === 0), got);
  }
  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
