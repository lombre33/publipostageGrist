#!/usr/bin/env node
// Tests purs (sans navigateur) de js/native-libs.js : d'où se charge chaque bibliothèque native de l'app, la copie figée de GFS ou le CDN, fonction par fonction (consigne GFS 065, contrats de GFS 5.2 point 12 et 2.6
// point 14) - cf. dev-tests/unit-harness.mjs pour le contexte général. Un faux `GfsLink.native` rend les copies que le test fixe, un faux `ExportCommon.loadScriptOnce` note chaque script demandé (et en refuse ceux que
// le test dit) ; les versions, adresses et empreintes attendues se lisent dans package.json et bibliotheques/catalogue.json, jamais écrites ici : une version montée dans la liste ne casse pas l'essai. Pour chacune des
// sept fonctions (pdf, pdf-assemblage, zip, word, excel, markdown, qr) :
//  1) aucune copie (le défaut, une app seule, un GFS d'avant) : TOUT par le CDN de l'app, chaque bibliothèque avec son empreinte, sans rien dire ;
//  2) une copie de CHAQUE bibliothèque, à la version de la liste : TOUT par la copie de GFS (son adresse, son empreinte telle que GFS la donne), aucun CDN, sans rien dire ;
//  3) la personne a choisi la copie mais une bibliothèque de la fonction n'en a pas, ou une copie est d'une autre version que la liste, ou n'est pas de forme `script` : TOUT par le CDN, et la page le sait (`pp:nativeFallback`,
//     raison `ecart`) - jamais une version que la liste n'a pas, jamais un mélange ;
//  4) une copie qui ne se charge pas (réseau, fausse empreinte) : le CDN la remplace, ainsi que le reste de l'appel, et la page le sait (raison `echec`, la bibliothèque dite) ; si le CDN échoue aussi, l'appel échoue ;
//  5) la décision se prend UNE fois par appel (un choix qui change entre deux fichiers d'une même fonction n'en mélange pas) et se relit à chaque appel (le nouveau choix vaut au chargement suivant) ;
//  6) l'autre sens (consigne GFS 108) : chaque bibliothèque qui se charge par le CDN reçoit, en second argument de `ExportCommon.loadScriptOnce`, la copie de GFS qu'`GfsLink.secours(id, version de la liste)` donne (null : un GFS
//     d'avant, une autre version, une forme qui n'est pas `script`, une app seule) ; une copie figée choisie par la personne se charge SANS secours (le chemin copie puis CDN est celui d'avant), et le CDN qui la remplace après son
//     échec ne reprend pas la même adresse.
// Lancer : node dev-tests/unit-native-libs.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const CATALOGUE = JSON.parse(readFileSync(join(ROOT, 'bibliotheques', 'catalogue.json'), 'utf8')).bibliotheques;
const versionOf = id => LIST.dependencies[LIST.gfs.bibliotheques[id].paquet];
const cdnOf = (id) => { const entry = CATALOGUE.find(item => item.id === id); return { src: entry.cdn.src, integrity: entry.cdn.integrite }; };
// La copie que GFS donnerait de `id` (son adresse, son empreinte à lui) ; `change` y défait quelque chose.
const copyOf = (id, change) => Object.assign({ version: versionOf(id), src: `https://gfs.test/vendor/${id}/${versionOf(id)}/${id}.js`, integrite: `sha384-copie-${id}`.replace(/[^A-Za-z0-9+/=-]/g, ''), forme: 'script' }, change || {});
const asked = copy => ({ src: copy.src, integrity: copy.integrite });

const FUNCTIONS = {
  'pdf': ['pdfmake', 'pdfmake-polices'],
  'pdf-assemblage': ['pdf-lib'],
  'zip': ['jszip'],
  'word': ['docx', 'docx-charts'],
  'excel': ['exceljs'],
  'markdown': ['marked'],
  'qr': ['qrcode-generator'],
};

// Un contexte neuf : le tableau de js/native-libs.js, un GfsLink dont les copies sont celles de `state.natives`, un chargeur qui note ce qu'on lui demande.
function fresh({ withGfsLink = true, withSecours = true } = {}) {
  const loads = [];
  const rescues = [];   // pour chaque appel de `loadScriptOnce`, dans le même ordre que `loads` : le nombre d'arguments et le secours reçu (consigne 108)
  const asks = [];      // chaque question posée à `GfsLink.secours` : [id, version]
  const events = [];
  const state = { natives: {}, secours: {}, fail: new Set(), afterLoad: null };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const globals = {
    document: { dispatchEvent(event) { events.push({ type: event.type, detail: JSON.parse(JSON.stringify(event.detail)) }); return true; } },
    CustomEvent,
    ExportCommon: {
      async loadScriptOnce(lib, rescue) {
        loads.push({ src: lib.src, integrity: lib.integrity });
        rescues.push(arguments.length < 2 ? { argc: arguments.length } : { argc: arguments.length, rescue: rescue === null || rescue === undefined ? rescue : JSON.parse(JSON.stringify(rescue)) });
        if (state.afterLoad) state.afterLoad(lib);
        if (state.fail.has(lib.src)) throw new Error('Échec de chargement du script : ' + lib.src);
      },
    },
  };
  if (withGfsLink) {
    globals.GfsLink = { native: id => (state.natives[id] ? Object.assign({}, state.natives[id]) : null) };
    if (withSecours) {
      globals.GfsLink.secours = (id, version) => {
        asks.push([id, version]);
        const entry = state.secours[id];
        return entry && (version === undefined || entry.version === version) ? Object.assign({}, entry) : null;
      };
    }
  }
  const ctx = createContext(globals);
  loadScript(ctx, 'js/native-libs.js');
  const load = async (...ids) => { ctx.__ids = ids; return evalIn(ctx, 'NativeLibs.load(...__ids)'); };
  const reset = () => { loads.length = 0; rescues.length = 0; asks.length = 0; events.length = 0; state.fail.clear(); state.afterLoad = null; };
  return { ctx, state, loads, rescues, asks, events, load, reset };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const reject = async (promise) => { try { await promise; return null; } catch (e) { return String(e && e.message); } };

async function main() {
  // 0. Le tableau lui-même : les sept fonctions, chaque bibliothèque dans une seule, la version, l'adresse et l'empreinte de la liste et du catalogue.
  {
    const { ctx } = fresh();
    ctx.__fns = FUNCTIONS;
    check('tableau : les sept fonctions de la consigne 076, dans l\'ordre, avec leurs bibliothèques', same(evalIn(ctx, 'NativeLibs.functions()'), Object.keys(FUNCTIONS)) && Object.keys(FUNCTIONS).every((fn) => { ctx.__fn = fn; return same(evalIn(ctx, 'NativeLibs.librariesOf(__fn)'), FUNCTIONS[fn]); }), JSON.stringify(evalIn(ctx, 'NativeLibs.functions()')));
    const all = Object.values(FUNCTIONS).flat();
    const wrong = all.filter((id) => {
      ctx.__id = id;
      return evalIn(ctx, 'NativeLibs.versionOf(__id)') !== versionOf(id) || !same(evalIn(ctx, 'NativeLibs.cdnOf(__id)'), cdnOf(id)) || evalIn(ctx, 'NativeLibs.functionOf(__id)') !== Object.keys(FUNCTIONS).find(fn => FUNCTIONS[fn].includes(id));
    });
    check('tableau : la version, l\'adresse et l\'empreinte de chacune des neuf bibliothèques sont celles de la liste et du catalogue, et sa fonction est la bonne', all.length === 9 && wrong.length === 0, wrong.join(', '));
    check('tableau : `cdnOf` rend une copie (la changer ne change pas le tableau) et ignore ce qui n\'est pas une bibliothèque du tableau',
      (() => { ctx.__id = 'marked'; const first = evalIn(ctx, 'NativeLibs.cdnOf(__id)'); first.src = 'x'; return evalIn(ctx, 'NativeLibs.cdnOf(__id)').src !== 'x'; })() && evalIn(ctx, "NativeLibs.cdnOf('constructor')") === null && evalIn(ctx, "NativeLibs.versionOf('toString')") === null && evalIn(ctx, "NativeLibs.functionOf('__proto__')") === null && same(evalIn(ctx, "NativeLibs.librariesOf('hasOwnProperty')"), []), '');
  }

  for (const [fn, ids] of Object.entries(FUNCTIONS)) {
    // 1. Aucune copie : tout par le CDN, sans rien dire.
    {
      const t = fresh();
      await t.load(...ids);
      check(`${fn} : aucune copie (le défaut) : chaque bibliothèque se charge par son CDN, avec son empreinte, dans l'ordre, et rien n'est dit`, same(t.loads, ids.map(cdnOf)) && t.events.length === 0, JSON.stringify({ loads: t.loads, events: t.events }));
      t.reset();
      t.state.natives = {};
      await t.load(...ids);
      check(`${fn} : « {} » (la personne a laissé la fonction au CDN) : le CDN, et rien n'est dit`, same(t.loads, ids.map(cdnOf)) && t.events.length === 0, JSON.stringify(t.loads));
      const alone = fresh({ withGfsLink: false });
      await alone.load(...ids);
      check(`${fn} : sans GfsLink (une app seule) : le CDN, et rien n'est dit`, same(alone.loads, ids.map(cdnOf)) && alone.events.length === 0, JSON.stringify(alone.loads));
    }
    // 2. Une copie de chaque bibliothèque à la version de la liste : tout par la copie.
    {
      const t = fresh();
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      await t.load(...ids);
      check(`${fn} : une copie de chaque bibliothèque, à la version de la liste : tout se charge par la copie de GFS (son adresse, son empreinte), aucun CDN, et rien n'est dit`,
        same(t.loads, ids.map(id => asked(copyOf(id)))) && t.events.length === 0, JSON.stringify({ loads: t.loads, events: t.events }));
    }
    // 3. La personne a choisi la copie, mais elle ne convient pas : tout par le CDN, et la page le sait.
    const cases = [];
    if (ids.length > 1) ids.forEach(missing => cases.push([`${missing} n'a pas de copie`, Object.fromEntries(ids.filter(id => id !== missing).map(id => [id, copyOf(id)]))]));
    ids.forEach(id => cases.push([`la copie de ${id} est d'une autre version que la liste`, Object.fromEntries(ids.map(other => [other, other === id ? copyOf(other, { version: '0.0.1' }) : copyOf(other)]))]));
    ids.forEach(id => cases.push([`la copie de ${id} n'est pas de forme « script »`, Object.fromEntries(ids.map(other => [other, other === id ? copyOf(other, { forme: 'module' }) : copyOf(other)]))]));
    for (const [label, natives] of cases) {
      const t = fresh();
      t.state.natives = natives;
      await t.load(...ids);
      check(`${fn} : ${label} : tout par le CDN (jamais un mélange), et la page le sait une fois (raison « ecart »)`,
        same(t.loads, ids.map(cdnOf)) && same(t.events, [{ type: 'pp:nativeFallback', detail: { fonction: fn, raison: 'ecart', bibliotheque: null } }]), JSON.stringify({ loads: t.loads, events: t.events }));
    }
    // 4. Une copie qui ne se charge pas : le CDN la remplace, ainsi que le reste de l'appel ; la page le sait.
    for (let at = 0; at < ids.length; at += 1) {
      const t = fresh();
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      t.state.fail.add(copyOf(ids[at]).src);
      await t.load(...ids);
      const expected = [...ids.slice(0, at).map(id => asked(copyOf(id))), asked(copyOf(ids[at])), ...ids.slice(at).map(cdnOf)];
      check(`${fn} : la copie de ${ids[at]} ne se charge pas : le CDN la remplace${at < ids.length - 1 ? ' et reprend le reste de l\'appel (le réseau de GFS ne répond pas : inutile de le reprendre fichier par fichier)' : ''}, et la page le sait (raison « echec », ${ids[at]})`,
        same(t.loads, expected) && same(t.events, [{ type: 'pp:nativeFallback', detail: { fonction: fn, raison: 'echec', bibliotheque: ids[at] } }]), JSON.stringify({ loads: t.loads, events: t.events }));
    }
    {
      const t = fresh();
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      t.state.fail.add(copyOf(ids[0]).src);
      t.state.fail.add(cdnOf(ids[0]).src);
      const message = await reject(t.load(...ids));
      check(`${fn} : la copie ET le CDN de ${ids[0]} échouent : l'appel échoue avec l'erreur du CDN (le chargeur appelant la dit comme avant)`, /Échec de chargement du script : https:\/\/cdn/.test(message || '') && t.events.length === 1 && t.events[0].detail.raison === 'echec', JSON.stringify({ message, events: t.events }));
    }
    // 5. La décision se prend une fois par appel ; le nouveau choix vaut à l'appel suivant.
    if (ids.length > 1) {
      const t = fresh();
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      t.state.afterLoad = () => { t.state.natives = {}; };   // la personne repasse la fonction au CDN pendant que le premier fichier se charge
      await t.load(...ids);
      check(`${fn} : un choix qui change entre deux fichiers du même appel ne les mélange pas (la décision est prise une fois, à l'appel : toutes par la copie)`, same(t.loads, ids.map(id => asked(copyOf(id)))) && t.events.length === 0, JSON.stringify(t.loads));
    }
    {
      const t = fresh();
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      await t.load(...ids);
      t.state.natives = {};
      await t.load(...ids);
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      await t.load(...ids);
      check(`${fn} : le choix se relit à chaque appel : copie, puis CDN, puis copie`, same(t.loads, [...ids.map(id => asked(copyOf(id))), ...ids.map(cdnOf), ...ids.map(id => asked(copyOf(id)))]), JSON.stringify(t.loads));
    }
  }

  // 6. Les appels que le code ne fait pas, mais qu'une erreur de frappe ferait : rien n'est chargé, la raison se lit.
  {
    const t = fresh();
    const mixed = await reject(t.load('pdfmake', 'jszip'));
    const unknown = await reject(t.load('inconnue'));
    const none = await reject(t.load());
    const proto = await reject(t.load('constructor'));
    check('appels refusés : deux fonctions dans un même appel, une bibliothèque inconnue, aucune bibliothèque, un nom du prototype : rien n\'est demandé au chargeur', !!mixed && !!unknown && !!none && !!proto && t.loads.length === 0, JSON.stringify({ mixed, unknown, none, proto, loads: t.loads }));
  }
  // 7. La décision seule (`decide`), lue par la page et les essais.
  {
    const t = fresh();
    const decide = (fn) => { t.ctx.__fn = fn; return JSON.parse(JSON.stringify(evalIn(t.ctx, 'NativeLibs.decide(__fn)'))); };
    check('decide : sans copie, « cdn » sans rien à dire', same(decide('pdf'), { source: 'cdn', say: null }), JSON.stringify(decide('pdf')));
    t.state.natives = { pdfmake: copyOf('pdfmake') };
    check('decide : une copie sur deux, « cdn » avec « ecart »', same(decide('pdf'), { source: 'cdn', say: 'ecart' }), JSON.stringify(decide('pdf')));
    t.state.natives = { pdfmake: copyOf('pdfmake'), 'pdfmake-polices': copyOf('pdfmake-polices') };
    const whole = decide('pdf');
    check('decide : une copie de chaque, à la version de la liste : « copie »', whole.source === 'copie' && whole.say === null, JSON.stringify(whole));
  }

  // 8. Le secours du CDN (consigne 108) : le second argument de chaque chargement par le CDN.
  for (const [fn, ids] of Object.entries(FUNCTIONS)) {
    const spares = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
    const secondArgument = (t, expected) => t.rescues.length === expected.length && t.rescues.every((call, at) => same(call, expected[at]));
    {
      const t = fresh();
      t.state.secours = spares;
      await t.load(...ids);
      check(`${fn} : au CDN avec un secours chez GFS : chaque bibliothèque se charge par son CDN avec la copie de GFS (même version que la liste) en secours, et rien n'est dit`,
        same(t.loads, ids.map(cdnOf)) && secondArgument(t, ids.map(id => ({ argc: 2, rescue: copyOf(id) }))) && t.events.length === 0, JSON.stringify({ loads: t.loads, rescues: t.rescues }));
      check(`${fn} : GfsLink.secours est interrogé pour chaque bibliothèque, avec la version de la liste`, same(t.asks, ids.map(id => [id, versionOf(id)])), JSON.stringify(t.asks));
    }
    {
      const t = fresh();
      await t.load(...ids);
      check(`${fn} : au CDN sans secours chez GFS (un GFS d'avant la 108) : le secours est null pour chaque bibliothèque, le CDN se charge comme avant`, same(t.loads, ids.map(cdnOf)) && secondArgument(t, ids.map(() => ({ argc: 2, rescue: null }))), JSON.stringify(t.rescues));
      const noFunction = fresh({ withSecours: false });
      await noFunction.load(...ids);
      check(`${fn} : un lien sans GfsLink.secours (le lien d'avant la consigne) : secours null, sans plantage`, same(noFunction.loads, ids.map(cdnOf)) && secondArgument(noFunction, ids.map(() => ({ argc: 2, rescue: null }))), JSON.stringify(noFunction.rescues));
      const alone = fresh({ withGfsLink: false });
      await alone.load(...ids);
      check(`${fn} : sans GfsLink (une app seule) : secours null`, same(alone.loads, ids.map(cdnOf)) && secondArgument(alone, ids.map(() => ({ argc: 2, rescue: null }))), JSON.stringify(alone.rescues));
    }
    {
      const gap = fresh();
      gap.state.secours = Object.fromEntries(ids.map(id => [id, copyOf(id, { version: '0.0.1' })]));
      await gap.load(...ids);
      const asModule = fresh();
      asModule.state.secours = Object.fromEntries(ids.map(id => [id, copyOf(id, { forme: 'module' })]));
      await asModule.load(...ids);
      check(`${fn} : un secours d'une autre version que la liste, ou de forme « module », n'est jamais donné au chargeur (null) ; le CDN se charge comme avant`,
        same(gap.loads, ids.map(cdnOf)) && secondArgument(gap, ids.map(() => ({ argc: 2, rescue: null }))) && same(asModule.loads, ids.map(cdnOf)) && secondArgument(asModule, ids.map(() => ({ argc: 2, rescue: null }))), JSON.stringify({ gap: gap.rescues, asModule: asModule.rescues }));
    }
    {
      // La copie que la personne a choisie : chargée SANS secours (un seul argument), et GfsLink.secours n'est pas même interrogé : le chemin copie puis CDN est celui d'avant.
      const t = fresh();
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      t.state.secours = spares;
      await t.load(...ids);
      check(`${fn} : la copie choisie par la personne se charge sans secours (un seul argument), GfsLink.secours n'est pas interrogé`, same(t.loads, ids.map(id => asked(copyOf(id)))) && secondArgument(t, ids.map(() => ({ argc: 1 }))) && t.asks.length === 0, JSON.stringify({ rescues: t.rescues, asks: t.asks }));
    }
    for (let at = 0; at < ids.length; at += 1) {
      // La copie choisie échoue : le CDN la remplace et reprend le reste de l'appel ; le secours de GFS est la MÊME copie que celle qui vient d'échouer : il n'est pas redonné pour cette bibliothèque (la même adresse, la même réponse), il l'est pour les suivantes.
      const t = fresh();
      t.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      t.state.secours = spares;
      t.state.fail.add(copyOf(ids[at]).src);
      await t.load(...ids);
      const expected = [...ids.slice(0, at + 1).map(() => ({ argc: 1 })), ...ids.slice(at).map(id => ({ argc: 2, rescue: id === ids[at] ? null : copyOf(id) }))];
      check(`${fn} : la copie choisie de ${ids[at]} échoue : le CDN la remplace sans reprendre la même adresse en secours${at < ids.length - 1 ? ', et le reste de l\'appel au CDN a son secours' : ''}`, secondArgument(t, expected), JSON.stringify(t.rescues));
      const other = fresh();
      other.state.natives = Object.fromEntries(ids.map(id => [id, copyOf(id)]));
      other.state.secours = Object.fromEntries(ids.map(id => [id, copyOf(id, { src: copyOf(id).src + '?secours' })]));
      other.state.fail.add(copyOf(ids[at]).src);
      await other.load(...ids);
      const expectedOther = [...ids.slice(0, at + 1).map(() => ({ argc: 1 })), ...ids.slice(at).map(id => ({ argc: 2, rescue: copyOf(id, { src: copyOf(id).src + '?secours' }) }))];
      check(`${fn} : la copie choisie de ${ids[at]} échoue, le secours de GFS est une autre adresse : le CDN la remplace avec ce secours`, secondArgument(other, expectedOther), JSON.stringify(other.rescues));
    }
  }
}

main().then(summarizeAndExit);
