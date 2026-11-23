#!/usr/bin/env node
// L'ÉCRAN D'ATTENTE du démarrage (index.html : `<html class="pp-opening">`, css/first-contact.css, js/first-contact.js:endOpeningScreen ; 23/11, « le chargement initial de Publipostage+ depuis GFS : encore 2 secondes, il faudrait
// qqch de plus instantané ») : tant que le premier document n'est pas à l'écran, une feuille aux lignes grises qui pulse recouvre le plan de travail au lieu d'un grand blanc. Ce que les cas vérifient :
//  1. la page porte la classe dès son HTML (rien à attendre : ni script, ni Grist) et son premier affichage vient AVANT l'arrivée du moindre script (les fichiers de js/ sont retenus 2,5 s) ;
//  2. l'écran recouvre le plan de travail (feuille et fond de page), sans texte, sans bloquer un clic (`pointer-events: none` : le point central du plan de travail rend l'éditeur, pas l'écran), et il pulse ;
//  3. « réduire les animations » le fige (aucune animation) ;
//  4. le premier document à l'écran le retire (la classe n'est plus sur <html>, aucune feuille ne reste) ;
//  5. une erreur de démarrage le retire aussi (jamais une feuille grise qui masque le message d'erreur), et un minuteur de 60 s le retire quoi qu'il arrive.
// Lancé par run-headless.mjs (groupe Node « openingScreen », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-opening-screen.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-opening-screen', port: Number(process.env.OPENING_SCREEN_PORT || 9220) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const indexHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
const firstContactJs = await readFile(join(ROOT, 'js/first-contact.js'), 'utf8');
check('index.html pose la classe `pp-opening` sur <html> dans son HTML même (aucun script à attendre)', /<html[^>]*class="pp-opening"/.test(indexHtml));
check('le retrait est fait par ready(), par failed() et par un minuteur de 60 s (js/first-contact.js)',
  /function ready\(\) \{\s*endOpeningScreen\(\);/.test(firstContactJs) && /function failed\(error\) \{\s*endOpeningScreen\(\);/.test(firstContactJs) && /OPENING_SCREEN_MAX_MS = 60000/.test(firstContactJs) && /setTimeout\(endOpeningScreen, OPENING_SCREEN_MAX_MS\)/.test(firstContactJs));

// --- 1. Le premier affichage vient avant les scripts ---
const early = await t.openPage({
  hosted: true, stub: { extensions: [] }, seed: seedModels(), lang: 'fr', colorScheme: 'light', ready: false,
  before: async (p) => { await p.route('**/js/**', async (route) => { await sleep(2500); await route.continue(); }); },
});
const first = await early.page.evaluate(() => {
  const paint = performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint' || entry.name === 'first-paint');
  const firstScript = performance.getEntriesByType('resource').filter(entry => /\/js\//.test(entry.name)).map(entry => entry.responseEnd).sort((a, b) => a - b)[0];
  return { paintAt: paint ? Math.round(paint.startTime) : null, firstScriptAt: Math.round(firstScript || 0) };
});
check('le premier affichage vient AVANT l\'arrivée du moindre script (retenus 2,5 s) : la personne voit la page sans attendre le code', first.paintAt !== null && first.firstScriptAt > 2000 && first.paintAt < first.firstScriptAt - 500, first);
await early.context.close();

// --- 2, 3, 4 et 5. Dans une page qui a fini de démarrer ---
const { page } = await t.openPage({ hosted: true, stub: { extensions: [] }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
const done = await page.evaluate(() => document.documentElement.classList.contains('pp-opening'));
check('le premier document à l\'écran (widget prêt) a retiré la classe : plus de feuille grise', done === false);
const look = await page.evaluate(() => {
  document.documentElement.classList.add('pp-opening');
  const container = document.getElementById('editor-container');
  const after = getComputedStyle(container, '::after');
  const before = getComputedStyle(container, '::before');
  const rect = container.getBoundingClientRect();
  const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return {
    afterPosition: after.position, afterEvents: after.pointerEvents, afterAnimation: after.animationName, afterContent: after.content, afterWidth: parseFloat(after.width), afterBackground: after.backgroundImage.slice(0, 60),
    beforePosition: before.position, beforeEvents: before.pointerEvents, beforeContent: before.content,
    centerIsContainerOrEditor: !!center && (container.contains(center) || center === container), containerWidth: rect.width,
  };
});
check('l\'écran est une feuille posée sur le plan de travail (fond de page + feuille à lignes grises), sans texte', look.afterPosition === 'absolute' && look.beforePosition === 'absolute' && look.afterContent === '""' && look.beforeContent === '""' && /repeating-linear-gradient/.test(look.afterBackground) && look.afterWidth > 300 && look.afterWidth <= 794, look);
check('il laisse passer les clics (le centre du plan de travail rend l\'éditeur, pas l\'écran)', look.afterEvents === 'none' && look.beforeEvents === 'none' && look.centerIsContainerOrEditor, look);
check('la feuille pulse', look.afterAnimation === 'pp-opening-pulse', look);
await page.emulateMedia({ reducedMotion: 'reduce' });
const still = await page.evaluate(() => getComputedStyle(document.getElementById('editor-container'), '::after').animationName);
check('« réduire les animations » la fige (aucune animation)', still === 'none', { still });
await page.emulateMedia({ reducedMotion: 'no-preference' });
const failed = await page.evaluate(() => { FirstContact.failed(new Error('essai')); return document.documentElement.classList.contains('pp-opening'); });
check('une erreur de démarrage retire l\'écran (jamais une feuille grise qui masque le message)', failed === false);
const gone = await page.evaluate(() => getComputedStyle(document.getElementById('editor-container'), '::after').content);
check('sans la classe, plus rien n\'est posé sur le plan de travail', gone === 'none' || gone === 'normal', { gone });

await t.finish();
