#!/usr/bin/env node
// La présentation commerciale de la galerie (templates-gallery/proposition-commerciale, js/template-gallery-modal.js, js/template-pack.js, js/slides-entry.js), dans GFS simulé, à la vraie souris,
// 700x400, français clair puis anglais sombre.
//  EXTENSION « diapositives » ÉTEINTE : la carte est dans la galerie avec sa vignette ; son aperçu montre ses captures ; « Utiliser ce modèle » et « Créer avec sa table » restent, grisés
//   (aria-disabled) avec leur raison au survol ; leur clic demande l'extension à GFS (`installer`) et ne crée rien (ni table, ni modèle, aucune question).
//  GFS L'ALLUME PENDANT L'APERÇU (événement `extensions`) : les deux boutons redeviennent utilisables sans rouvrir l'aperçu.
//  FRANÇAIS : « Créer avec sa table », puis « Créer » à la question : la table Contacts est créée vide, le modèle est enregistré sous le type « presentation » avec sa page 16:9 en paysage et
//   s'ouvre : trente diapositives dans la bande, aucune qui déborde. ANGLAIS : « Sales presentation », « Use this template » : la même présentation, sans table.
// Lancé par run-headless.mjs (groupe Node "slidesGallery", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-gallery.mjs
// SLIDES_GALLERY_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels } from './gfs-page.mjs';

const SHOTS = process.env.SLIDES_GALLERY_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slides-gallery', port: Number(process.env.SLIDES_GALLERY_PORT || 8946) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SLIDES = 30;

const TEXTS = {
  fr: { card: 'Présentation commerciale', reason: 'Demande l’extension Diapositives (Grist Factory Suite)', create: 'Créer', question: 'Créer les tables du modèle ?' },
  en: { card: 'Sales presentation', reason: 'Needs the Slides extension (Grist Factory Suite)', create: 'Create', question: 'Create the template’s tables?' },
};

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

function toolsOf(page) {
  const centerOf = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, selector);
  const clickAt = async (c) => { await page.mouse.move(c.x - 12, c.y - 4, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(80); await page.mouse.click(c.x, c.y); };
  const click = async (selector, wait = 400) => {
    const c = await centerOf(selector);
    if (!c) throw new Error('introuvable : ' + selector);
    await clickAt(c); await sleep(wait);
  };
  // Le menu « + » ouvert au survol, puis tout droit sous le bouton jusqu'à la ligne : le menu reste ouvert.
  const openGallery = async () => {
    const plus = await centerOf('#btn-new');
    await page.mouse.move(plus.x - 25, plus.y); await page.mouse.move(plus.x, plus.y, { steps: 4 }); await sleep(600);
    const row = await centerOf('#v2-btn-new-from-template');
    await page.mouse.move(plus.x, row.y, { steps: 10 }); await page.mouse.move(row.x, row.y, { steps: 4 }); await sleep(150);
    await page.mouse.click(row.x, row.y);
    await page.waitForFunction(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, null, { timeout: 8000 });
  };
  const card = name => page.evaluate((n) => {
    const el = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card')).find(c => c.querySelector('.tpl-gallery-card-name').textContent === n);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const img = el.querySelector(':scope > img');
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && el.contains(top), thumb: !!img && img.complete && img.naturalWidth > 0 };
  }, name);
  const clickDialog = async (label, wait = 600) => {
    const b = await page.evaluate((l) => {
      const modal = document.getElementById('pp-dialog-modal');
      const btn = modal && Array.from(modal.querySelectorAll('button')).find(x => x.textContent.trim() === l && x.getBoundingClientRect().width > 0);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, label);
    if (!b) throw new Error('bouton absent : ' + label);
    await clickAt(b); await sleep(wait);
  };
  return { centerOf, click, openGallery, card, clickDialog };
}

// L'aperçu : ouvert ou non, ses captures, ses deux boutons (grisés ou non, leur raison, au premier plan dans le panneau).
const preview = page => page.evaluate(() => {
  const modal = document.getElementById('template-preview-modal');
  const open = !!modal && getComputedStyle(modal).display !== 'none';
  const button = (id) => {
    const b = document.getElementById(id);
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { hidden: b.hidden, disabled: b.getAttribute('aria-disabled'), title: b.title, label: b.textContent.trim(), onTop: !!top && b.contains(top), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
  };
  return { open, captures: document.querySelectorAll('#tpl-preview-captures img').length, empty: button('tpl-preview-use-empty'), pack: button('tpl-preview-use-pack') };
});
const dialogOpen = page => page.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0 ? m.querySelector('#pp-dialog-title').textContent : ''; });
const doc = page => page.evaluate(() => {
  const st = window.__gristStub.state;
  return { contacts: st.tables.indexOf('Contacts') !== -1, contactRows: st.rows.Contacts ? st.rows.Contacts.id.length : 0, models: st.rows.Publipostage_Modeles.id.length, current: Templates.getCurrentId() };
});
// Le modèle ouvert : sa ligne dans la table des modèles, sa page, la bande des diapositives.
const opened = page => page.evaluate(() => {
  const id = Templates.getCurrentId();
  const row = id != null ? window.__gristStub.getRow('Publipostage_Modeles', id) : null;
  let margins = null;
  try { margins = row && row.Margins ? JSON.parse(row.Margins) : null; } catch (e) { margins = 'illisible'; }
  const strip = document.querySelector('.pp-slide-strip');
  const overflow = Array.from(document.querySelectorAll('.pp-slide-overflow')).filter(e => e.getBoundingClientRect().width > 0);
  return {
    name: document.getElementById('template-name').value, type: row && row.TypeModele, format: margins && margins.format, orientation: margins && margins.orientation,
    label: PageLayout.getFormatLabel(), slides: strip && !strip.hidden ? strip.querySelectorAll('.pp-slide-item').length : 0, overflow: overflow.length,
    text: document.querySelector('.ProseMirror').textContent,
  };
});
const installCalls = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer').map(c => JSON.stringify(c.args)));

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ['graphique'] }, seed: seedModels(), lang, colorScheme });
  const { click, openGallery, card, clickDialog } = toolsOf(page);
  const before = await doc(page);

  // --- La carte et son aperçu, l'extension éteinte.
  await openGallery();
  await card(T.card);
  // La vignette se charge une fois la carte à l'écran.
  await page.waitForFunction((n) => {
    const el = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card')).find(x => x.querySelector('.tpl-gallery-card-name').textContent === n);
    const img = el && el.querySelector(':scope > img');
    return !!img && img.complete && img.naturalWidth > 0;
  }, T.card, { timeout: 5000 }).catch(() => {});
  const c = await card(T.card);
  check(tag + 'la carte « ' + T.card + ' » est dans la galerie, avec sa vignette, au premier plan', !!c && c.onTop && c.thumb, c);
  if (!c) { await page.context().close(); return; }
  await page.mouse.move(c.x - 10, c.y - 5, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
  await page.waitForFunction(() => document.querySelectorAll('#tpl-preview-captures img').length > 0, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  let p = await preview(page);
  check(tag + 'l’aperçu s’ouvre sur ses cinq captures', p.open && p.captures === 5, p);
  check(tag + 'extension éteinte : « Utiliser ce modèle » et « Créer avec sa table » restent, grisés, avec la raison « ' + T.reason + ' » au survol, au premier plan dans le panneau',
    !p.empty.hidden && !p.pack.hidden && p.empty.disabled === 'true' && p.pack.disabled === 'true' && p.empty.title === T.reason && p.pack.title === T.reason
    && p.empty.onTop && p.pack.onTop && p.empty.inPanel && p.pack.inPanel, p);
  await snap(page, `apercu-eteint-${lang}`);

  // --- Le clic grisé demande l'extension à GFS et ne crée rien.
  await click('#tpl-preview-use-pack', 700);
  await click('#tpl-preview-use-empty', 700);
  const calls = await installCalls(page);
  let now = await doc(page);
  check(tag + 'leur clic demande l’extension « diapositives » à GFS (installer), deux fois, sans question ni fenêtre',
    calls.length === 2 && calls.every(a => /diapositives/.test(a)) && (await dialogOpen(page)) === '', calls);
  check(tag + 'rien n’est créé : ni table Contacts, ni modèle ; l’aperçu reste ouvert',
    !now.contacts && now.models === before.models && now.current === before.current && (await preview(page)).open, now);

  // --- GFS allume l'extension pendant l'aperçu : les boutons suivent.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique', 'diapositives']));
  await sleep(600);
  p = await preview(page);
  check(tag + 'GFS allume l’extension : les deux boutons redeviennent utilisables, sans raison, l’aperçu toujours ouvert',
    p.open && p.empty.disabled === 'false' && p.pack.disabled === 'false' && p.empty.title === '' && p.pack.title === '', p);

  if (lang === 'fr') {
    // --- « Créer avec sa table », la question, « Créer ».
    await click('#tpl-preview-use-pack', 800);
    const title = await dialogOpen(page);
    check(tag + 'la question « ' + T.question + ' » s’ouvre', title === T.question, title);
    await clickDialog(T.create, 1500);
  } else {
    await click('#tpl-preview-use-empty', 1500);
  }
  await page.waitForFunction((n) => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && s.querySelectorAll('.pp-slide-item').length >= n; }, SLIDES, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  now = await doc(page);
  const o = await opened(page);
  check(tag + (lang === 'fr' ? 'la table Contacts est créée, vide' : '« Use this template » ne crée aucune table'), lang === 'fr' ? now.contacts && now.contactRows === 0 : !now.contacts, now);
  check(tag + 'le modèle est enregistré sous le nom de la carte, type « presentation », page 16:9 en paysage, et s’ouvre',
    now.models === before.models + 1 && now.current != null && o.name === T.card && o.type === 'presentation' && o.format === '190.5x338.7' && o.orientation === 'landscape' && o.label === '16:9', { now, o });
  check(tag + 'la bande montre ses ' + SLIDES + ' diapositives, aucune ne déborde, le texte est celui du modèle',
    o.slides === SLIDES && o.overflow === 0 && /Mieux piloter/.test(o.text) && /Merci de votre/.test(o.text), { slides: o.slides, overflow: o.overflow });
  await snap(page, `ouverte-${lang}`);
  await page.context().close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
