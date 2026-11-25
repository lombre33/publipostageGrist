#!/usr/bin/env node
// Le DÉPART ANTICIPÉ des bibliothèques de l'éditeur (index.html : `window.__earlyLibs`, 23/11, « explorer des pistes pour que l'ouverture soit encore plus rapide ») : TipTap et ProseMirror (les 21 import() de
// js/editor.js:importLibraries) ne partaient qu'à Editor.init, après les 280 scripts de la page ; ils partent maintenant dès les premiers scripts, pendant que ceux-ci arrivent et s'exécutent. Rien ne change à l'écran ;
// ce que les cas vérifient :
//  1. la liste d'index.html est EXACTEMENT celle de importLibraries (une adresse de plus dans l'une sans l'autre : un module chargé deux fois, ou jamais en avance) ;
//  2. les 21 modules sont arrivés et ce sont les MÊMES que ceux de l'éditeur (la classe `Editor` de TipTap de l'un est celle de l'autre : une seule adresse chacun, rien ne se charge deux fois) ;
//  3. le premier fichier de la copie figée de l'éditeur (vendor/editeur/) est demandé AVANT que js/editor.js s'exécute (l'ancien départ venait après main.js, donc après lui) ; l'éditeur démarre malgré cela et le document s'ouvre ;
//  4. une adresse qui échoue ne casse pas le démarrage anticipé (`.catch` sur chaque import) : le script reste un `try` qui n'écrit rien sur la page.
// Lancé par run-headless.mjs (groupe Node « earlyLibs », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-early-libs.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-early-libs', port: Number(process.env.EARLY_LIBS_PORT || 9217) });
const { check } = t;

// --- 1. La même liste ---
const indexHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
const editorJs = await readFile(join(ROOT, 'js/editor.js'), 'utf8');
const warm = indexHtml.match(/window\.__earlyLibs\s*=\s*\[([^\]]*)\]\.map\(function \(nom\) \{([\s\S]*?)\}\);/);
const earlyList = warm ? [...warm[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
const importBody = (editorJs.match(/async function importLibraries\(\) \{([\s\S]*?)\n  \}\n/) || [])[1] || '';
const editorList = [...importBody.matchAll(/\bimport\('([^']+)'\)/g)].map(m => m[1]);
check('le départ anticipé d\'index.html existe et nomme 21 bibliothèques', !!warm && earlyList.length === 21, { trouvées: earlyList.length });
check('la liste d\'index.html est celle de importLibraries (js/editor.js), au même ordre', editorList.length === 21 && JSON.stringify(earlyList) === JSON.stringify(editorList), { earlyList, editorList });
check('chaque import anticipé est suivi d\'un `.catch` (une adresse qui échoue ne fait pas de rejet sans gestionnaire) et le tout reste dans un `try`',
  !!warm && /\.catch\(function \(\) \{\}\)/.test(indexHtml.slice(warm.index, warm.index + warm[0].length + 80)) && /try \{\s*window\.__earlyLibs/.test(indexHtml));
const mapScript = indexHtml.indexOf('<script type="importmap">');
check('le départ vient après la carte d\'importation (sans elle, les adresses nues ne se résolvent pas) et avant js/editor.js',
  mapScript > 0 && indexHtml.indexOf('window.__earlyLibs') > mapScript && indexHtml.indexOf('window.__earlyLibs') < indexHtml.indexOf('<script src="js/editor.js'));

// --- 2 et 3. Dans la page ---
// js/editor.js note l'instant où il s'exécute (une ligne de plus au bout du fichier servi, le disque ne bouge pas).
const { page } = await t.openPage({
  hosted: true, stub: { extensions: [] }, seed: seedModels(), lang: 'fr', colorScheme: 'light',
  // Les instants où le navigateur commence à lire un fichier de la copie figée de l'éditeur : par un observateur, car le tampon de la page ne garde que 250 entrées (les 280 scripts le remplissent avant les bibliothèques d'avant).
  init: `window.__copyStarts = []; try { new PerformanceObserver(list => { list.getEntries().forEach(entry => { if (entry.name.indexOf('/vendor/editeur/') > 0) window.__copyStarts.push(entry.startTime); }); }).observe({ type: 'resource', buffered: true }); } catch (e) { /* sans observateur : le cas échoue, il ne devine pas */ }`,
  before: async (p) => {
    await p.route('**/js/editor.js*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()) + '\n;window.__editorJsRanAt = performance.now();\n' });
    });
  },
});
await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
const facts = await page.evaluate(async () => {
  const early = window.__earlyLibs || [];
  const settled = await Promise.allSettled(early);
  const libs = await Editor.loadLibraries();
  const core = settled[0] && settled[0].status === 'fulfilled' ? settled[0].value : null;
  const state = settled[15] && settled[15].status === 'fulfilled' ? settled[15].value : null;
  const model = settled[18] && settled[18].status === 'fulfilled' ? settled[18].value : null;
  const copyStarts = window.__copyStarts || [];
  return {
    count: early.length,
    fulfilled: settled.filter(item => item.status === 'fulfilled').length,
    sameCore: !!core && core.Editor === libs.TiptapEditor,
    sameState: !!state && state.EditorState === libs.EditorState,
    sameModel: !!model && model.DOMParser === libs.PMDOMParser,
    firstCopy: copyStarts.length ? Math.min(...copyStarts) : null,
    editorRanAt: window.__editorJsRanAt,
    editorWorks: !!EditorCore.getEditor() && !!document.querySelector('.ProseMirror'),
  };
});
check('les 21 modules anticipés sont arrivés', facts.count === 21 && facts.fulfilled === 21, facts);
check('ce sont les MÊMES modules que ceux de l\'éditeur (la classe Editor de TipTap, l\'EditorState et le DOMParser de ProseMirror sont les mêmes objets : rien ne se charge deux fois)', facts.sameCore && facts.sameState && facts.sameModel, facts);
check('le premier fichier de la copie figée de l\'éditeur (vendor/editeur/) est demandé AVANT que js/editor.js s\'exécute (au lieu d\'après main.js)', typeof facts.firstCopy === 'number' && typeof facts.editorRanAt === 'number' && facts.firstCopy < facts.editorRanAt, { premierFichierDeLaCopie: facts.firstCopy, editorJs: facts.editorRanAt });
check('l\'éditeur démarre et le document est là, comme avant', facts.editorWorks, facts);

await t.finish();
