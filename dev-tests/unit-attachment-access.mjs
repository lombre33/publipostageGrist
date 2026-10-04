#!/usr/bin/env node
// Tests purs (sans navigateur) de l'accès aux pièces jointes : js/grist-api.js (GristAPI.getAttachmentDownloadUrl et GristAPI.hydrateAttachmentImages) - cf.
// dev-tests/unit-harness.mjs pour le contexte général. Contrôle de sécurité du 04/10 (rapport, §5.2), deux points que Antoine a acceptés (« 1) OK à traiter, 2) Ok à traiter ») :
//  1) le jeton d'accès à Grist est demandé en LECTURE SEULE : le widget ne fait que télécharger des pièces jointes, il n'en envoie aucune ;
//  2) l'identifiant d'une pièce jointe, écrit par le modèle (`data-attachment-id`), n'entre dans le chemin de l'adresse que s'il est un numéro : `..`, `/`, `?`, `#`, `@`, un blanc
//     au milieu, un signe, un exposant, des chiffres d'une autre écriture... ne donnent aucune adresse (et aucun jeton n'est demandé pour eux), et l'image garde son src au lieu
//     d'en recevoir un bricolé ou d'être vidée.
// Les adresses d'un identifiant valide restent ce qu'elles étaient (serveur de Grist, `/attachments/<numéro>/download?auth=<jeton>`), un seul jeton sert tout un rendu.
// Lancer : node dev-tests/unit-attachment-access.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const BASE = 'https://grist.exemple.test/o/docs/api/docs/abc123';

// Un contexte par scénario : GristAPI garde un état module-niveau (le jeton en cache) qui ne doit pas fuiter d'un scénario à l'autre, comme un rechargement de page. Le faux
// document ne sait que donner un jeton : il note les options de chaque demande.
function fresh() {
  const tokenRequests = [];
  const warnings = [];
  const grist = {
    docApi: { async getAccessToken(options) { tokenRequests.push(options); return { token: 'jeton-' + tokenRequests.length, baseUrl: BASE, ttlMsecs: 600000 }; } },
    ready() {}, onRecord() {}, onOptions() {}, async getOptions() { return null; },
  };
  const ctx = createContext({ grist, URL, console: { log() {}, warn: (...args) => warnings.push(args.map(String).join(' ')), error() {} } });
  loadScript(ctx, 'js/grist-api.js');
  return { ctx, run: (expr) => evalIn(ctx, expr), tokenRequests, warnings };
}

// Une exception dans un scénario (l'API qu'on teste n'existe pas sur l'ancien code) est un échec nommé, pas la fin du script : les scénarios suivants tournent quand même.
async function section(label, work) {
  try { await work(); } catch (e) { check(label + ' : aucune exception', false, e && e.message); }
}

// Des identifiants qu'un modèle piégé peut écrire : chacun doit être refusé.
const HOSTILE = [
  '..', '../..', '../../x', '1/../../records', '12/download?x=', '12?x=1', '12#', '12#x', '1/2', '/12', '12/', '\\12', '1\\2',
  '@evil.example', '//evil.example', 'evil.example', 'https://evil.example/x', '12@evil.example', 'x@evil.example/12',
  '%2e%2e', '%2e%2e%2f', '12%2f', '12%3f', '1 2', '1\n2', '1\t2', '-1', '+1', '1.5', '1e3', '0x10', '12abc', 'abc', "1'2", '1;2', '1&auth=x', '1,2',
  '١٢', '१२', '１２', '12\u0000', '‮21',
  '', ' ', null, undefined, false, NaN, Infinity, true, {}, [], [7], { toString() { return '7'; } },
];

async function main() {
  // 1. Le jeton : lecture seule, demandé une seule fois pour plusieurs adresses.
  await section('jeton', async () => {
    const { run, tokenRequests } = fresh();
    const first = await run('GristAPI.getAttachmentDownloadUrl(7)');
    const second = await run('GristAPI.getAttachmentDownloadUrl(8)');
    check('jeton : demandé en lecture seule (readOnly: true), jamais en écriture', tokenRequests.length >= 1 && tokenRequests.every((o) => o && o.readOnly === true), JSON.stringify(tokenRequests));
    check('jeton : un seul pour deux adresses du même rendu', tokenRequests.length === 1, tokenRequests.length);
    check('adresse : le serveur de Grist, le numéro de la pièce jointe, le jeton', first === BASE + '/attachments/7/download?auth=jeton-1' && second === BASE + '/attachments/8/download?auth=jeton-1', first + ' | ' + second);
  });

  // 2. Les identifiants valides : un numéro, sous forme de nombre ou de texte, blancs autour permis (rien de plus ne change).
  await section('identifiants valides', async () => {
    const { run } = fresh();
    const expected = (id) => BASE + '/attachments/' + id + '/download?auth=jeton-1';
    check('identifiant valide : un nombre', await run('GristAPI.getAttachmentDownloadUrl(12)') === expected(12));
    check('identifiant valide : un texte de chiffres', await run('GristAPI.getAttachmentDownloadUrl("345")') === expected(345));
    check('identifiant valide : des blancs autour sont ignorés', await run('GristAPI.getAttachmentDownloadUrl(" 6 \\n")') === expected(6));
    check('aucun identifiant : aucune adresse (comme avant)', await run('GristAPI.getAttachmentDownloadUrl("")') === '' && await run('GristAPI.getAttachmentDownloadUrl()') === '' && await run('GristAPI.getAttachmentDownloadUrl(0)') === '');
  });

  // 3. Les identifiants d'un modèle piégé : aucune adresse, aucun jeton demandé.
  await section('identifiants refusés', async () => {
    const { ctx, run, tokenRequests } = fresh();
    const accepted = [];
    for (let i = 0; i < HOSTILE.length; i++) {
      ctx.candidate = HOSTILE[i];
      const url = await run('GristAPI.getAttachmentDownloadUrl(candidate)');
      if (url !== '') accepted.push(String(typeof HOSTILE[i] === 'string' ? JSON.stringify(HOSTILE[i]) : typeof HOSTILE[i]) + ' -> ' + url);
    }
    check('identifiants refusés : ' + HOSTILE.length + ' identifiants piégés ou sans sens, aucune adresse pour aucun', accepted.length === 0, accepted.slice(0, 3).join(' ; '));
    check('identifiants refusés : aucun jeton n\'est demandé pour eux', tokenRequests.length === 0, tokenRequests.length);
    // Et un identifiant valide juste après sort une adresse : le refus ne casse rien.
    check('identifiants refusés : un identifiant valide ensuite sort son adresse, sur le serveur de Grist', await run('GristAPI.getAttachmentDownloadUrl(7)') === BASE + '/attachments/7/download?auth=jeton-1');
  });

  // 4. Toute adresse sortie reste sur le serveur de Grist, sous son chemin d'API (tous les identifiants essayés, valides ou non).
  await section('serveur', async () => {
    const { ctx, run } = fresh();
    const base = new URL(BASE);
    const offenders = [];
    const candidates = HOSTILE.concat([1, 7, '42', ' 5 ']);
    for (let i = 0; i < candidates.length; i++) {
      ctx.candidate = candidates[i];
      const url = await run('GristAPI.getAttachmentDownloadUrl(candidate)');
      if (!url) continue;
      const parsed = new URL(url);
      if (parsed.origin !== base.origin || !/^\/o\/docs\/api\/docs\/abc123\/attachments\/\d+\/download$/.test(parsed.pathname) || [...parsed.searchParams.keys()].join() !== 'auth') offenders.push(url);
    }
    check('serveur : toute adresse sortie est celle de Grist, au chemin /attachments/<numéro>/download, avec le seul paramètre auth', offenders.length === 0, offenders.slice(0, 3).join(' ; '));
  });

  // 5. Les images d'une Lecture : un identifiant refusé laisse le src tel quel et le dit dans la console, les autres images reçoivent leur adresse.
  await section('images', async () => {
    const { ctx, run, tokenRequests, warnings } = fresh();
    const image = (id, src) => ({ dataset: { attachmentId: id }, src });
    const valid = image('7', ''), blanks = image(' 9 ', ''), hostile = image('../../x', 'https://evil.example/p.png'), slash = image('1/2', ''), empty = image('', 'https://autre.example/a.png');
    ctx.root = { querySelectorAll: () => [valid, hostile, blanks, slash, empty] };
    await run('GristAPI.hydrateAttachmentImages(root)');
    // Les images d'une page s'hydratent en parallèle : chacune qui trouve le cache vide demande son jeton (comportement d'avant, inchangé) ; le numéro du jeton n'est donc pas comparé.
    const addressOf = (id) => new RegExp('^' + BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/attachments/' + id + '/download\\?auth=jeton-\\d+$');
    check('images : une pièce jointe valide reçoit son adresse', addressOf(7).test(valid.src), valid.src);
    check('images : un identifiant entouré de blancs reçoit son adresse', addressOf(9).test(blanks.src), blanks.src);
    check('images : un identifiant refusé laisse le src tel quel (ni vidé, ni adresse bricolée)', hostile.src === 'https://evil.example/p.png' && slash.src === '', hostile.src + ' | ' + slash.src);
    check('images : une image sans identifiant n\'est pas touchée', empty.src === 'https://autre.example/a.png', empty.src);
    check('images : chaque identifiant refusé est dit dans la console', warnings.filter((w) => /refus/.test(w)).length === 2, JSON.stringify(warnings));
    check('images : des jetons en lecture seule, au plus un par image valide (aucun pour les images refusées ni sans identifiant)', tokenRequests.length >= 1 && tokenRequests.length <= 2 && tokenRequests.every((o) => o && o.readOnly === true), JSON.stringify(tokenRequests));
  });

  summarizeAndExit();
}

main();
