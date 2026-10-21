#!/usr/bin/env node
// Les mises en page de « Ajouter » (extensions/diapositives/slide-strip.js, carte du 21/10, « Menu de mises en page »), à la vraie souris et au vrai clavier, 700x400, français clair
// puis anglais sombre, l'app dans le cadre isolé de GFS, l'extension « diapositives » active, « Trois » à l'écran (trois diapositives).
//  LE MENU : « Ajouter » ouvre, à droite du bouton et dans le panneau, au-dessus de tout, cinq lignes (Vide, Titre, Titre et contenu, Deux colonnes, Titre de section), chacune avec
//   le dessin de sa page, lisibles (>= 4,5:1) ; un second clic, un appui ailleurs ou Échap le referment.
//  À LA SOURIS : chaque mise en page ajoute une diapositive après celle du curseur, avec ses blocs (titres, liste, zone à deux colonnes) et ses mots dans la langue de l'interface ;
//   le mot du titre est sélectionné (on écrit par-dessus) ; le clavier va au document ; un seul Ctrl+Z la retire. « Vide » ajoute un paragraphe vide, comme avant.
//  AU CLAVIER : Entrée sur « Ajouter » ouvre le menu, le clavier sur « Vide » ; ↓ et Entrée choisissent ; le clavier revient sur la miniature ajoutée. Échap rend le clavier à « Ajouter ».
//  ÉTEINTE : « Ajouter » n'ouvre rien et demande à GFS d'installer l'extension.
// Lancé par run-headless.mjs (groupe Node "slidesLayouts", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-layouts.mjs
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-layouts', port: Number(process.env.SLIDES_LAYOUTS_PORT || 8941) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(8, 'Trois', '<p>Un</p>${BR}<p>Deux</p>${BR}<p>Trois</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;
const TEXTS = {
  fr: {
    labels: ['Vide', 'Titre', 'Titre et contenu', 'Deux colonnes', 'Titre de section'],
    blocks: {
      title: ['h1 center:Titre de la présentation', 'p center:Sous-titre'],
      titleContent: ['h2:Titre', 'ul:Premier point|Deuxième point'],
      twoColumns: ['h2:Titre', 'columns:Colonne de gauche|Colonne de droite'],
      section: ['h1:Titre de la section', 'p:Quelques mots sur la section'],
    },
    selected: { title: 'Titre de la présentation', titleContent: 'Titre', twoColumns: 'Titre', section: 'Titre de la section' },
  },
  en: {
    labels: ['Blank', 'Title', 'Title and content', 'Two columns', 'Section header'],
    blocks: {
      title: ['h1 center:Presentation title', 'p center:Subtitle'],
      titleContent: ['h2:Title', 'ul:First point|Second point'],
      twoColumns: ['h2:Title', 'columns:Left column|Right column'],
      section: ['h1:Section title', 'p:A few words about the section'],
    },
    selected: { title: 'Presentation title', titleContent: 'Title', twoColumns: 'Title', section: 'Section title' },
  },
};

// Les diapositives (leurs blocs, résumés : « h2:Titre », « ul:a|b », « columns:a|b », « p center:… »), la sélection, la diapositive du curseur, le menu et « Ajouter ».
function state(app) {
  return app.evaluate(() => {
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const ed = EditorCore.getEditor();
    const { doc, selection } = ed.state;
    const describe = (node) => {
      const align = node.attrs && node.attrs.textAlign === 'center' ? ' center' : '';
      if (node.type.name === 'heading') return 'h' + node.attrs.level + align + ':' + node.textContent;
      if (node.type.name === 'paragraph') return 'p' + align + ':' + node.textContent;
      if (node.type.name === 'bulletList') return 'ul:' + Array.from({ length: node.childCount }, (_, i) => node.child(i).textContent).join('|');
      if (node.type.name === 'twoColumnsZone') return 'columns:' + Array.from({ length: node.childCount }, (_, i) => node.child(i).textContent).join('|');
      return node.type.name + ':' + node.textContent;
    };
    const slides = SlideStrip.slidesOf(doc).map(s => s.nodes.map(e => describe(e.node)));
    const menu = document.querySelector('.pp-slide-layouts');
    const add = document.querySelector('.pp-slide-add');
    const items = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
    const active = document.activeElement;
    return {
      slides,
      selected: doc.textBetween(selection.from, selection.to),
      current: items.findIndex(i => i.getAttribute('aria-selected') === 'true'),
      menu: menu && menu.classList.contains('visible') ? {
        rect: rect(menu), labels: Array.from(menu.querySelectorAll('[data-action]')).map(b => b.textContent.trim()), icons: menu.querySelectorAll('[data-action] svg').length,
        role: menu.getAttribute('role'), focused: menu.contains(active) ? active.textContent.trim() : null,
      } : null,
      add: { rect: rect(add), expanded: add.getAttribute('aria-expanded'), haspopup: add.getAttribute('aria-haspopup') },
      focus: active === add ? 'add' : active && active.closest('.tiptap') ? 'editor' : active && active.classList.contains('pp-slide-item') ? 'item:' + items.indexOf(active) : (active && active.className) || '',
      viewport: { width: innerWidth, height: innerHeight },
      topMenu: (() => { if (!menu || !menu.classList.contains('visible')) return null; const r = menu.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 10); return !!hit && menu.contains(hit); })(),
    };
  });
}
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);

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
  const click = async (selector, index = 0, settle = 300) => {
    const c = await centerOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    const o = await offset();
    await page.mouse.move(c.x + o.x - 10, c.y + o.y);
    await page.mouse.move(c.x + o.x, c.y + o.y, { steps: 2 });
    await sleep(60);
    await page.mouse.click(c.x + o.x, c.y + o.y);
    await sleep(settle);
  };
  const clickAt = async (x, y, settle = 300) => { const o = await offset(); await page.mouse.move(x + o.x, y + o.y, { steps: 2 }); await page.mouse.click(x + o.x, y + o.y); await sleep(settle); };
  const press = async (key, settle = 250) => { await page.keyboard.press(key); await sleep(settle); };
  return { click, clickAt, press };
}

const open = async (tab, id, count) => {
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, c]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === c;
  }, [id, count], { timeout: 15000 }).catch(() => {});
  await sleep(800);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const START = [['p:Un'], ['p:Deux'], ['p:Trois']];

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 8, 3);
  await a.click('.pp-slide-strip .pp-slide-thumb', 1);
  let s = await state(app);
  check(tag + 'trois diapositives, le curseur sur la deuxième ; « Ajouter » annonce un menu', same(s.slides, START) && s.current === 1 && s.add.haspopup === 'menu' && s.add.expanded === 'false', s);

  // --- Le menu.
  await a.click('.pp-slide-add');
  s = await state(app);
  const m = s.menu;
  check(tag + '« Ajouter » ouvre le menu : cinq mises en page, chacune avec son dessin, à droite du bouton, dans le panneau, au-dessus de tout',
    !!m && same(m.labels, T.labels) && m.icons === 5 && m.role === 'menu' && s.add.expanded === 'true' && m.rect.left >= s.add.rect.right && m.rect.left - s.add.rect.right <= 12
      && m.rect.top >= 0 && m.rect.bottom <= s.viewport.height && m.rect.right <= s.viewport.width && s.topMenu,
    { menu: m, add: s.add, viewport: s.viewport, top: s.topMenu });
  const ratio = await contrastOf(app, '.pp-slide-layouts [data-action="titleContent"] span');
  check(tag + 'ses lignes se lisent (>= 4,5:1)', ratio >= 4.5, ratio);
  await a.click('.pp-slide-add');
  s = await state(app);
  check(tag + 'un second clic sur « Ajouter » le referme, sans rien ajouter', !s.menu && s.add.expanded === 'false' && same(s.slides, START), { menu: s.menu, slides: s.slides });
  await a.click('.pp-slide-add');
  await a.clickAt(560, 230);
  s = await state(app);
  check(tag + 'un appui dans le document le referme, sans rien ajouter', !s.menu && same(s.slides, START), { menu: s.menu, slides: s.slides });

  // --- Chaque mise en page, à la souris : après la diapositive du curseur, le mot du titre sélectionné, un Ctrl+Z.
  for (const layout of ['title', 'titleContent', 'twoColumns', 'section']) {
    await a.click('.pp-slide-strip .pp-slide-thumb', 1);
    await a.click('.pp-slide-add');
    await a.click(`.pp-slide-layouts.visible [data-action="${layout}"]`, 0, 700);
    s = await state(app);
    check(tag + `« ${T.labels[['blank', 'title', 'titleContent', 'twoColumns', 'section'].indexOf(layout)]} » : une diapositive après la deuxième, avec ses blocs et ses mots, le titre sélectionné, le clavier au document`,
      s.slides.length === 4 && same(s.slides[2], T.blocks[layout]) && same(s.slides[1], ['p:Deux']) && same(s.slides[3], ['p:Trois']) && s.current === 2 && s.selected === T.selected[layout]
        && s.focus === 'editor' && !s.menu, { slides: s.slides, selected: s.selected, current: s.current, focus: s.focus });
    if (layout === 'titleContent') {
      await page.keyboard.type('Plan');
      await sleep(300);
      s = await state(app);
      check(tag + 'ce qu’on tape remplace le mot du titre', same(s.slides[2], ['h2:Plan', T.blocks.titleContent[1]]), s.slides[2]);
      await a.press('Control+z', 500);
    }
    await a.press('Control+z', 700);
    s = await state(app);
    check(tag + `un seul Ctrl+Z retire la diapositive « ${layout} »`, same(s.slides, START), s.slides);
  }

  // --- « Vide » : comme avant.
  await a.click('.pp-slide-strip .pp-slide-thumb', 2);
  await a.click('.pp-slide-add');
  await a.click('.pp-slide-layouts.visible [data-action="blank"]', 0, 700);
  s = await state(app);
  check(tag + '« ' + T.labels[0] + ' » : un paragraphe vide après la troisième, le curseur dedans', same(s.slides, [...START, ['p:']]) && s.current === 3 && s.selected === '' && s.focus === 'editor', s);
  await a.press('Control+z', 700);

  // --- Au clavier.
  await app.evaluate(() => document.querySelector('.pp-slide-add').focus());
  await a.press('Enter', 400);
  s = await state(app);
  const firstFocus = s.menu && s.menu.focused;
  await a.press('ArrowDown');
  await a.press('ArrowDown');
  await a.press('ArrowDown');
  s = await state(app);
  const thirdDown = s.menu && s.menu.focused;
  await a.press('Enter', 700);
  s = await state(app);
  // Dernière du texte, la zone à deux colonnes est suivie du paragraphe vide que l'éditeur garde après elle, pour écrire dessous.
  check(tag + 'au clavier : Entrée sur « Ajouter » ouvre le menu, le clavier sur « ' + T.labels[0] + ' » ; ↓ ↓ ↓ mène à « ' + T.labels[3] + ' », Entrée l’ajoute ; le clavier est sur sa miniature',
    firstFocus === T.labels[0] && thirdDown === T.labels[3] && s.slides.length === 4 && same(s.slides[3], [...T.blocks.twoColumns, 'p:']) && s.focus === 'item:3' && !s.menu,
    { firstFocus, thirdDown, slides: s.slides, focus: s.focus });
  await a.press('Control+z', 700);
  await app.evaluate(() => document.querySelector('.pp-slide-add').focus());
  await a.press('Enter', 400);
  await a.press('Escape', 300);
  s = await state(app);
  check(tag + 'Échap referme le menu et rend le clavier à « Ajouter », sans rien ajouter', !s.menu && s.focus === 'add' && s.slides.length === 3, { menu: s.menu, focus: s.focus, slides: s.slides.length });

  // --- Éteinte : rien ne s'ouvre, GFS est prié d'installer.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => document.querySelector('.pp-slide-add').getAttribute('aria-disabled') === 'true', null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  await a.click('.pp-slide-add');
  s = await state(app);
  const installs = await gfsCalls(page, 'installer');
  check(tag + 'extension éteinte : « Ajouter » n’ouvre pas le menu, il demande à GFS d’installer « diapositives », rien ne change',
    !s.menu && installs.length === 1 && installs[0].extension === 'diapositives' && s.slides.length === 3, { menu: s.menu, installs });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
