#!/usr/bin/env node
// Tests purs (sans navigateur) du moteur et du canal de l'écriture en direct - extensions/edition/live-sync.js et live-channel.js (consigne GFS 012), cf. dev-tests/unit-harness.mjs.
// Yjs et y-protocols sont les VRAIS (miroir hors-ligne, dev-tests/offline-deps.sh) ; la table du direct est la fausse de dev-tests/fake-live-table.mjs, qui se comporte comme celle de Grist
// (lot appliqué en entier ou pas du tout, ligne absente refusée, revendication par BulkAddOrUpdateRecord sans mise à jour) ; l'horloge est fausse (dev-tests/fake-clock.mjs) : rien n'attend du vrai temps.
//  MOTEUR : fonder un salon / rejoindre / deux fondateurs en même temps (une seule gagne) / un salon abandonné refondé / une personne revenue d'un long sommeil ne republie rien (lignée) /
//   les frappes passent d'une personne à l'autre sans jamais repartir / compaction (une seule, même lignée, rien perdu) / présence (nom nettoyé, couleur de repli, départ) / la dernière personne
//   vide le salon (et pas celle qui voit quelqu'un arriver) / marqueur « enregistré » / panne d'écriture : rien n'est perdu / lignes supprimées à la main : ce qui manque est republié /
//   mises à jour en double ou dans le désordre / gros texte ;
//  CANAL (essai (b) exigé par GFS, consigne 012) : relecture toutes les 250 ms quand une autre personne est présente, 2 s seul, jamais sous 100 ms, plus du tout page cachée ni app inactive
//   (GFS_INACTIF), jamais de fetchTable quand la table du direct est celle de la section (prévenance de Grist), reprise après une panne, forme exacte des lots écrits.
// Lancer : node dev-tests/unit-live-sync.mjs
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createContext, loadScript, evalIn, check as rawCheck, summarizeAndExit } from './unit-harness.mjs';
import { LiveTable } from './fake-live-table.mjs';
import { FakeClock } from './fake-clock.mjs';

// Les détails d'un échec sont affichés en JSON (le chargeur commun n'écrit qu'un texte).
const check = (name, pass, notes) => rawCheck(name, pass, notes === undefined ? undefined : JSON.stringify(notes));
// Les paquets du direct ne sont pas dans la liste de l'app (package.json) : edition-live.json les porte, build.mjs les installe à part, dans edition-live-deps/.
const OFFLINE = join(dirname(fileURLToPath(import.meta.url)), '.offline-cache', 'edition-live-deps');
if (!existsSync(join(OFFLINE, 'node_modules', 'yjs'))) {
  console.log('  FAIL - Yjs absent : lancer dev-tests/offline-deps.sh (build.mjs installe aussi les paquets du direct, ceux de edition-live.json)');
  check('Yjs est installé dans le miroir hors-ligne', false);
  summarizeAndExit();
}
const requireFromCache = createRequire(join(OFFLINE, 'package.json'));
const Y = requireFromCache('yjs');
const protocol = requireFromCache('y-protocols/awareness');

// Le moteur et le canal, chargés comme le widget les charge (deux scripts classiques d'un même scope). Uint8Array est celui de ce processus : Yjs en reconnaît les instances.
const context = createContext({ btoa, atob, setTimeout, clearTimeout, Uint8Array });
loadScript(context, 'extensions/edition/live-sync.js');
loadScript(context, 'extensions/edition/live-channel.js');
const LiveSync = evalIn(context, 'LiveSync');
const LiveChannel = evalIn(context, 'LiveChannel');

const DOC = 7;
const PERIOD = 250;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Une personne : sa session, son canal sur la table partagée, ses événements. `compactAt` plus bas pour que la compaction s'essaie avec peu de lignes.
function person(table, clock, name, extra = {}) {
  const channel = LiveChannel.create({
    grist: { docApi: table }, tableId: 'Publipostage_Direct', timers: clock.timersApi, now: () => clock.now(), floorMs: 0,
    isVisible: () => true, hasPeers: () => false,
  });
  const events = [];
  const session = LiveSync.createSession({
    Y, protocol, channel, doc: extra.doc === undefined ? DOC : extra.doc, field: 't', flushMs: 150, compactAt: extra.compactAt || 60,
    now: () => clock.now(), timers: clock.timersApi, random: () => 0.5, onEvent: (type, detail) => events.push({ type, detail }),
  });
  session.setUser({ name, color: extra.color || '#aa3300' });
  const text = () => session.ydoc.getText('t').toString();
  const type = (value, at) => session.ydoc.getText('t').insert(at === undefined ? session.ydoc.getText('t').length : at, value);
  const sync = async () => session.receive(await channel.read());
  return { name, table, clock, channel, session, events, text, type, sync, eventsOf: kind => events.filter(e => e.type === kind) };
}
const fillWith = value => (draft) => { draft.getText('t').insert(0, value); };

// Fonde (ou rejoint) puis allume le direct.
async function enter(p, fill, opts = {}) {
  const role = await p.session.open({ fill: fillWith(fill), confirmJoin: opts.confirmJoin });
  if (role) p.session.start();
  await p.clock.settle();
  return role;
}
// Laisse passer le temps assez pour que les frappes partent (flush 150 ms).
const flush = async (clock, ms = 400) => clock.advance(ms);

const room = (table, kind) => table.of(DOC, kind);
const long = n => 'abcdefghij'.repeat(Math.ceil(n / 10)).slice(0, n);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// MOTEUR

{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  const role = await enter(a, 'Bonjour');
  check('la première personne FONDE le salon : une seule ligne « s » (instantané) à son nom, avec la lignée (l\'heure de fondation)', role === 'founder' && room(table, 's').length === 1 && room(table, 's')[0].Client === a.session.me && room(table, 's')[0].T === clock.now(), { role, rows: table.rows.length });
  check('… son texte est celui de l\'éditeur au moment de fonder', a.text() === 'Bonjour', a.text());
  check('… et le salon est rangé sous le numéro du modèle (colonne Doc)', room(table).every(row => row.Doc === String(DOC)) && room(table).length >= 1, room(table).map(r => r.Doc));

  const b = person(table, clock, 'Bruno');
  const role2 = await enter(b, 'AUTRE TEXTE');
  check('la deuxième personne REJOINT : pas de nouvel instantané, et c\'est le texte du salon qu\'elle a (pas celui de son éditeur)', role2 === 'joiner' && room(table, 's').length === 1 && b.text() === 'Bonjour', { role2, text: b.text() });

  // Les frappes passent de l'une à l'autre.
  a.type(' le monde');
  await flush(clock);
  const writes = room(table, 'u');
  check('une frappe devient UNE ligne « u » (paquet de frappes) au nom de celui qui a tapé', writes.length === 1 && writes[0].Client === a.session.me && writes[0].Seq >= 1, writes);
  await b.sync();
  check('l\'autre personne la lit à la relecture suivante : même texte', b.text() === 'Bonjour le monde', b.text());
  await flush(clock, 1000);
  check('ce qui vient de la table ne repart JAMAIS dans la table (une seconde plus tard, aucune ligne « u » de la personne qui n\'a pas tapé)', room(table, 'u').length === 1 && room(table, 'u').every(row => row.Client === a.session.me), room(table, 'u').map(r => r.Client));
  b.type(' !', 0);
  await flush(clock);
  await a.sync();
  check('dans l\'autre sens aussi, et les deux textes sont les mêmes', a.text() === b.text() && a.text() === ' !Bonjour le monde', { a: a.text(), b: b.text() });

  // Deux personnes tapent au même endroit en même temps : tout est gardé, des deux côtés pareil.
  a.type('A1', 3);
  b.type('B1', 3);
  await flush(clock);
  await a.sync(); await b.sync();
  await flush(clock);
  await a.sync(); await b.sync();
  check('frappes simultanées au même endroit : rien n\'est perdu et les deux textes se rejoignent', a.text() === b.text() && a.text().includes('A1') && a.text().includes('B1'), { a: a.text(), b: b.text() });

  // Une mise à jour reçue deux fois, ou lignes dans le désordre : rien ne change.
  const before = a.text();
  const rows = await a.channel.read();
  a.session.receive(rows); a.session.receive(rows.slice().reverse());
  check('les mêmes lignes relues deux fois, ou dans le désordre, ne changent rien au texte', a.text() === before, { before, after: a.text() });
  a.session.dispose(); b.session.dispose();
}

// Deux personnes fondent EN MÊME TEMPS : une seule revendication gagne.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock, latencyMs: 30 });
  const a = person(table, clock, 'Alice');
  const b = person(table, clock, 'Bruno');
  const both = Promise.all([a.session.open({ fill: fillWith('TEXTE DE ALICE') }), b.session.open({ fill: fillWith('TEXTE DE BRUNO') })]);
  await clock.advance(300);
  const roles = await both;
  a.session.start(); b.session.start();
  await clock.advance(400);
  const winnerText = room(table, 's').length === 1 ? a.text() : null;
  check('deux fondateurs en même temps : UNE seule ligne « s » reste (la revendication est atomique)', room(table, 's').length === 1, room(table, 's').length);
  check('… l\'un est fondateur, l\'autre rejoint', roles.slice().sort().join() === 'founder,joiner', roles);
  check('… et les deux ont le texte du gagnant, jamais un mélange ni le texte du perdant', winnerText !== null && a.text() === b.text() && (a.text() === 'TEXTE DE ALICE' || a.text() === 'TEXTE DE BRUNO'), { a: a.text(), b: b.text() });
  a.session.dispose(); b.session.dispose();
}

// Un salon abandonné (rien n'a bougé depuis plus de dix minutes) est refondé, ses anciennes lignes partent dans le même lot.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const old = clock.now() - 11 * 60000;
  table.rows.push(
    { id: 1, Doc: String(DOC), Client: '111', Kind: 's', Seq: 1, Data: 'AAA=', T: old },
    { id: 2, Doc: String(DOC), Client: '111', Kind: 'u', Seq: 2, Data: 'AAA=', T: old },
    { id: 3, Doc: String(DOC), Client: '111', Kind: 'p', Seq: 3, Data: 'AAA=', T: old },
    { id: 4, Doc: '99', Client: '222', Kind: 's', Seq: 1, Data: 'AAA=', T: old },
  );
  const a = person(table, clock, 'Alice');
  const role = await enter(a, 'Neuf');
  check('un salon abandonné depuis plus de dix minutes est REFONDÉ (et non rejoint)', role === 'founder' && a.text() === 'Neuf', role);
  check('… ses anciennes lignes ont disparu, une seule ligne « s » est là, avec une nouvelle lignée', room(table).length === 1 && room(table, 's')[0].T === clock.now() && !table.rows.some(r => r.id >= 1 && r.id <= 3 && r.Client === '111'), room(table));
  check('… et le salon d\'un AUTRE modèle n\'a pas été touché', table.of(99).length === 1 && table.of(99)[0].Client === '222', table.of(99));
  a.session.dispose();
}

// Un salon vivant : « Annuler » de la fenêtre de confirmation ne change rien.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  await enter(a, 'Texte');
  const rowsBefore = JSON.stringify(table.rows);
  const b = person(table, clock, 'Bruno');
  const role = await b.session.open({ fill: fillWith('X'), confirmJoin: async () => false });
  check('quand la personne refuse de rejoindre le salon vivant, rien n\'est rejoint (open rend null) et rien ne change dans la table', role === null && JSON.stringify(table.rows) === rowsBefore && b.text() === '', { role, text: b.text() });
  a.session.dispose(); b.session.dispose();
}

// Une personne revenue d'un long sommeil ne republie rien dans un salon refondé (lignée).
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  await enter(a, 'Départ');
  a.type(' (frappé pendant le sommeil)');
  // Le temps passe sans que A ne fasse rien (sa minuterie ne tourne pas : onglet gelé) : on retire ses minuteries.
  clock.timers = clock.timers.filter(t => false);
  a.session.timer = null;
  clock.t += 15 * 60000;
  const b = person(table, clock, 'Bruno');
  const role = await enter(b, 'Texte de Bruno');
  check('quinze minutes plus tard, Bruno trouve le salon abandonné et le REFONDE', role === 'founder' && room(table, 's').length === 1 && room(table, 's')[0].T === clock.now(), role);
  a.session.receive(await a.channel.read());
  check('Alice, de retour, voit que le salon est une autre lignée : le direct s\'arrête (événement « replaced », raison « refounded »)', a.eventsOf('replaced').length === 1 && a.eventsOf('replaced')[0].detail.reason === 'refounded' && a.session.active === false, a.events);
  await a.session.flushNow();
  await flush(clock, 1000);
  await b.sync();
  check('… et ses frappes d\'avant le sommeil ne sont JAMAIS écrites dans le nouveau salon (aucune ligne d\'Alice, le texte de Bruno intact)', table.rows.every(row => row.Client !== a.session.me) && b.text() === 'Texte de Bruno', { text: b.text(), hers: table.rows.filter(row => row.Client === a.session.me).length });
  a.session.dispose(); b.session.dispose();
}

// Le salon a disparu (tout a été supprimé).
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  await enter(a, 'Texte');
  table.rows = [];
  a.session.receive(await a.channel.read());
  check('un salon disparu arrête le direct (raison « gone »), sans rien réécrire', a.eventsOf('replaced').length === 1 && a.eventsOf('replaced')[0].detail.reason === 'gone' && table.rows.length === 0, a.events);
  a.session.dispose();
}

// Compaction : les lignes « u » se fondent dans l'instantané, avec la même lignée, sans rien perdre.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice', { compactAt: 10 });
  await enter(a, '');
  const lineage = room(table, 's')[0].T;
  for (let i = 0; i < 14; i++) { a.type('x' + i + ';'); await flush(clock, 200); a.session.receive(await a.channel.read()); }
  await flush(clock, 4000);
  const afterRows = room(table, 'u').length;
  check('au-delà du seuil, la compaction remplace les lignes « u » : il en reste moins que de paquets écrits', afterRows < 10, afterRows);
  check('… il reste UNE ligne « s », de la même lignée', room(table, 's').length === 1 && room(table, 's')[0].T === lineage, room(table, 's').map(r => r.T));
  const late = person(table, clock, 'Claire');
  await enter(late, 'ignoré');
  check('quelqu\'un qui arrive après la compaction a tout le texte', late.text() === a.text() && late.text().includes('x0;') && late.text().includes('x13;'), { late: late.text().slice(0, 60), a: a.text().slice(0, 60) });
  a.session.dispose(); late.session.dispose();
}

// Deux compactions en même temps : une seule passe (Grist refuse la seconde), rien n'est perdu.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice', { compactAt: 1000 });
  const b = person(table, clock, 'Bruno', { compactAt: 1000 });
  await enter(a, 'base');
  await enter(b, 'x');
  for (let i = 0; i < 4; i++) { a.type(' a' + i); await flush(clock, 200); }
  await b.sync();
  await a.sync();
  const results = await Promise.all([a.session.compact(), b.session.compact()]);
  check('deux compactions simultanées : une réussit, l\'autre est refusée par Grist (lignes déjà supprimées)', results.slice().sort().join() === 'false,true', results);
  const late = person(table, clock, 'Claire');
  await enter(late, 'ignoré');
  check('… et le texte est intact pour qui arrive ensuite', late.text() === a.text() && late.text() === 'base a0 a1 a2 a3', { late: late.text(), a: a.text() });
  a.session.dispose(); b.session.dispose(); late.session.dispose();
}

// Présence : nom, couleur, départ.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice', { color: '#aa3300' });
  const b = person(table, clock, 'x', { color: 'red; background:url(//evil/x)' });
  b.session.setUser({ name: '<img src=x onerror=alert(1)>\u0007\n' + 'z'.repeat(100), color: 'red; background:url(//evil/x)' });
  await enter(a, 'Texte');
  await enter(b, 'x');
  await flush(clock, 800);
  await a.sync();
  const seen = a.session.peers();
  check('Alice voit Bruno (une présence apparaît à la relecture)', seen.length === 1, seen);
  check('son nom arrive nettoyé : plus de caractère de contrôle, soixante caractères au plus (l\'affichage le met en texte, jamais en HTML)', seen.length === 1 && seen[0].name.length <= 60 && !/[\u0000-\u001f]/.test(seen[0].name), seen);
  check('sa couleur, qui n\'est pas hexadécimale, devient un gris de repli', seen.length === 1 && seen[0].color === '#6b6b6b', seen);
  await b.session.stop();
  await a.sync();
  check('quand Bruno éteint le direct, il disparaît de la liste d\'Alice à la relecture suivante', a.session.peers().length === 0, a.session.peers());
  a.session.dispose(); b.session.dispose();
}

// Une ligne de présence qui disparaît de la table (nettoyée à la compaction, supprimée à la main) : la personne s'en va tout de suite de la liste des autres.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  const b = person(table, clock, 'Bruno');
  await enter(a, 'Texte');
  await enter(b, 'x');
  await flush(clock, 800);
  await a.sync();
  const before = a.session.peers().length;
  table.rows = table.rows.filter(row => !(row.Kind === 'p' && row.Client === b.session.me));
  await a.sync();
  check('la ligne de présence de Bruno disparaît de la table : Alice ne le voit plus dès la relecture suivante (sans attendre trente secondes)', before === 1 && a.session.peers().length === 0, { before, after: a.session.peers().length });
  a.session.dispose(); b.session.dispose();
}

// La dernière personne vide le salon ; celle qui voit quelqu'un arriver ne le vide pas.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  table.rows.push({ id: 1, Doc: '99', Client: '222', Kind: 's', Seq: 1, Data: 'AAA=', T: clock.now() });
  const a = person(table, clock, 'Alice');
  const b = person(table, clock, 'Bruno');
  await enter(a, 'Texte');
  await enter(b, 'x');
  await flush(clock, 800);
  await a.sync(); await b.sync();
  await a.session.stop();
  check('Alice part, Bruno est encore là : le salon reste (il garde son instantané)', room(table, 's').length === 1, room(table).length);
  await b.session.stop();
  check('Bruno part le dernier : toutes les lignes du salon sont supprimées', room(table).length === 0, room(table).map(r => r.Kind));
  check('… et le salon d\'un autre modèle est intact', table.of(99).length === 1, table.of(99));
  a.session.dispose(); b.session.dispose();
}
{
  // Alice éteint pendant que Bruno vient d'arriver : sa lecture neuve voit la présence de Bruno, elle ne vide rien.
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  await enter(a, 'Texte');
  await flush(clock, 500);
  const b = person(table, clock, 'Bruno');
  await enter(b, 'x');
  await flush(clock, 500);   // Bruno a écrit sa présence ; Alice ne l'a pas encore lue
  await a.session.stop();
  check('une personne arrivée un instant avant le départ d\'Alice est vue (lecture neuve) : le salon n\'est pas vidé', room(table, 's').length === 1 && b.text() === 'Texte', room(table).map(r => r.Kind));
  a.session.dispose(); b.session.dispose();
}

// Marqueur « enregistré ».
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  const b = person(table, clock, 'Bruno');
  await enter(a, 'Texte');
  await enter(b, 'x');
  const token = a.session.saveToken();
  await a.session.publishSaved(token, '1790000123');
  await b.sync();
  const saved = b.eventsOf('saved');
  check('l\'enregistrement d\'Alice est annoncé à Bruno : la date reçue dans Grist et l\'état du texte', saved.length === 1 && saved[0].detail.modified === '1790000123' && typeof saved[0].detail.stateVector === 'string', saved);
  check('Bruno, qui a le même texte, sait que ce qu\'il voit est enregistré', b.session.isAtState(saved[0].detail.stateVector) === true, null);
  b.type(' en plus');
  check('… dès qu\'il tape, ce n\'est plus l\'état enregistré', b.session.isAtState(saved[0].detail.stateVector) === false, null);
  check('Alice n\'est pas prévenue de son propre enregistrement', a.eventsOf('saved').length === 0, a.events);
  a.session.dispose(); b.session.dispose();
}

// Panne d'écriture : rien n'est perdu, les frappes repartent.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  const b = person(table, clock, 'Bruno');
  await enter(a, 'Texte');
  await enter(b, 'x');
  table.failNext = 'réseau coupé (essai)';
  a.type(' un');
  await flush(clock, 300);
  check('une écriture refusée est signalée (événement « error ») et les frappes sont gardées', a.eventsOf('error').length >= 1 && a.session.pending.length >= 1, { errors: a.eventsOf('error').length, pending: a.session.pending.length });
  a.type(' deux');
  await flush(clock, 3000);
  await b.sync();
  check('elles repartent d\'elles-mêmes, dans l\'ordre, avec les suivantes : Bruno a tout', b.text() === 'Texte un deux' && a.session.pending.length === 0, { text: b.text() });
  a.session.dispose(); b.session.dispose();
}

// Des lignes supprimées à la main : ce qui manque est republié.
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  await enter(a, 'Texte');
  a.type(' important');
  await flush(clock, 400);
  a.session.receive(await a.channel.read());
  table.rows = table.rows.filter(row => row.Kind !== 'u');
  a.session.receive(await a.channel.read());
  await flush(clock, 3000);
  const late = person(table, clock, 'Claire');
  await enter(late, 'ignoré');
  check('quelqu\'un supprime à la main les lignes de frappes : Alice republie ce que la table a perdu, la nouvelle arrivée a le texte entier', late.text() === 'Texte important', late.text());
  a.session.dispose(); late.session.dispose();
}

// Gros texte (la conversion en texte base64 se fait par morceaux).
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const a = person(table, clock, 'Alice');
  await enter(a, long(400000));
  const b = person(table, clock, 'Bruno');
  await enter(b, '');
  check('un texte de 400 000 caractères passe par la table et arrive entier', b.text().length === 400000 && b.text() === a.text(), b.text().length);
  a.session.dispose(); b.session.dispose();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// CANAL (essai (b) de GFS)

const channelOf = (table, clock, extra = {}) => LiveChannel.create(Object.assign({
  grist: { docApi: table }, tableId: 'Publipostage_Direct', timers: clock.timersApi, now: () => clock.now(),
  isVisible: () => true, hasPeers: () => false, sectionTable: () => 'Clients',
}, extra));
const gaps = log => log.slice(1).map((t, i) => t - log[i]);
const medianOf = values => values.slice().sort((x, y) => x - y)[Math.floor(values.length / 2)];

{
  // Une autre personne est présente et la page est visible : toutes les 250 ms.
  const clock = new FakeClock();
  const table = new LiveTable({ clock, latencyMs: 20 });
  table.rows.push({ id: 1, Doc: '7', Client: '5', Kind: 's', Seq: 1, Data: 'AAA=', T: 1 }, { id: 2, Doc: '7', Client: '5', Kind: 'u', Seq: 2, Data: 'AAA=', T: 2 });
  const channel = channelOf(table, clock, { hasPeers: () => true });
  const received = [];
  channel.connect(rows => received.push(rows.length));
  await clock.advance(5000);
  const g = gaps(table.fetchLog);
  check('une autre personne est présente (page visible) : la table est relue toutes les 250 ms (de début en début de lecture)', table.fetchLog.length >= 19 && table.fetchLog.length <= 21 && medianOf(g) === PERIOD && Math.max(...g) <= PERIOD + 1, { n: table.fetchLog.length, median: medianOf(g), max: Math.max(...g) });
  check('… et chaque lecture rend le rappel de connect avec la LISTE COMPLÈTE des lignes (ici deux)', received.length >= table.fetchLog.length - 1 && received.every(n => n === 2), { received: received.length, reads: table.fetchLog.length });
  channel.disconnect();
}
{
  const clock = new FakeClock();
  const table = new LiveTable({ clock, latencyMs: 20 });
  const channel = channelOf(table, clock, { hasPeers: () => false });
  channel.connect(() => {});
  await clock.advance(10000);
  const g = gaps(table.fetchLog);
  check('seul : la table est relue toutes les 2 s', table.fetchLog.length >= 5 && table.fetchLog.length <= 6 && medianOf(g) === 2000, { n: table.fetchLog.length, median: medianOf(g) });
  channel.disconnect();
}
{
  // Quelqu'un arrive : la lecture qui voit sa présence fait passer de 2 s à 250 ms (c'est à la lecture que le moteur l'apprend, jamais entre deux).
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  let peers = false;
  const channel = channelOf(table, clock, { hasPeers: () => peers });
  channel.connect((rows) => { if (rows.some(row => row.Kind === 'p')) peers = true; });
  await clock.advance(4100);
  const slow = table.fetchLog.length;
  table.rows.push({ id: 1, Doc: '7', Client: '5', Kind: 'p', Seq: 1, Data: 'AAA=', T: clock.now() });
  await clock.advance(4000);
  const g = gaps(table.fetchLog.slice(slow - 1));
  check('seul, la table est relue toutes les 2 s ; la lecture qui découvre une présence passe la suivante à 250 ms', slow === 3 && g.length >= 8 && g[0] === 2000 && g.slice(1).every(x => x === PERIOD), { slow, gaps: g.slice(0, 6) });
  channel.disconnect();
}
{
  // Page cachée : plus aucune lecture ; de nouveau visible : reprise tout de suite.
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  let visible = false;
  const channel = channelOf(table, clock, { hasPeers: () => true, isVisible: () => visible });
  channel.connect(() => {});
  await clock.advance(6000);
  check('page cachée : AUCUNE lecture de la table', table.fetchLog.length === 0, table.fetchLog.length);
  visible = true;
  channel.poke();
  await clock.advance(10);
  check('de nouveau visible (poke) : la lecture reprend aussitôt', table.fetchLog.length === 1, table.fetchLog.length);
  await clock.advance(1000);
  check('… puis au rythme de 250 ms', table.fetchLog.length >= 4 && table.fetchLog.length <= 6, table.fetchLog.length);
  visible = false;
  const seenBefore = table.fetchLog.length;
  await clock.advance(3000);
  check('cachée de nouveau : la relecture s\'arrête (au plus la lecture déjà programmée)', table.fetchLog.length <= seenBefore + 1, { before: seenBefore, after: table.fetchLog.length });
  channel.disconnect();
}
{
  // Jamais sous 100 ms, même si on insiste.
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const channel = channelOf(table, clock, { hasPeers: () => true });
  channel.connect(() => {});
  for (let i = 0; i < 40; i++) { channel.poke(); await clock.advance(7); }
  const direct = channel.read();
  await clock.advance(300);
  await direct;
  const reads = table.fetchLog.slice();
  const g = gaps(reads);
  check('même poussée sans cesse (poke, lectures directes), deux débuts de lecture ne sont jamais à moins de 100 ms', reads.length >= 3 && Math.min(...g) >= 100, { n: reads.length, min: Math.min(...g) });
  channel.disconnect();
}
{
  // Quand la table du direct est celle de la section : la prévenance de Grist, aucun fetchTable.
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  table.rows.push({ id: 1, Doc: '7', Client: '5', Kind: 's', Seq: 1, Data: 'AAA=', T: 1 });
  let notify = null;
  const grist = { docApi: table, onRecords: (callback) => { notify = callback; } };
  const channel = LiveChannel.create({ grist, tableId: 'Publipostage_Direct', timers: clock.timersApi, now: () => clock.now(), isVisible: () => true, hasPeers: () => true, sectionTable: () => 'Publipostage_Direct' });
  const received = [];
  channel.connect(rows => received.push(rows.map(r => r.id)));
  await clock.advance(5000);
  check('la section est liée à la table du direct : AUCUN fetchTable, même avec du monde (5 s)', table.fetchLog.length === 1 && channel.isPushed() === true, { reads: table.fetchLog.length });
  check('… (la seule lecture est celle d\'abonnement, faite par fetchSelectedTable de la section)', received.length === 1 && same(received[0], [1]), received);
  notify([{ id: 1, Doc: '7', Client: '5', Kind: 's', Seq: 1, Data: 'AAA=', T: 1 }, { id: 2, Doc: '7', Client: '5', Kind: 'u', Seq: 2, Data: 'AAA=', T: 2 }]);
  check('Grist prévient (onRecords) : le rappel reçoit la liste complète des lignes, sans relecture', received.length === 2 && same(received[1], [1, 2]) && table.fetchLog.length === 1, received);
  channel.disconnect();
  notify([{ id: 9, Doc: '7', Client: '5', Kind: 'u', Seq: 9, Data: 'AAA=', T: 9 }]);
  check('déconnecté, une prévenance de plus ne fait plus rien', received.length === 2, received);
}
{
  // GFS_INACTIF : la relecture s'arrête, elle reprend quand l'app redevient active et qu'on la relance.
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  let inactive = 0;
  const channel = channelOf(table, clock, { hasPeers: () => true, onInactive: () => { inactive++; } });
  channel.connect(() => {});
  await clock.advance(600);
  table.inactive = true;
  await clock.advance(600);
  const countBefore = table.fetchLog.length;
  await clock.advance(5000);
  check('l\'app n\'est plus l\'app active (GFS_INACTIF) : la relecture s\'arrête et le dit une fois', inactive === 1 && table.fetchLog.length === countBefore, { inactive, before: countBefore, after: table.fetchLog.length });
  table.inactive = false;
  channel.poke();
  await clock.advance(600);
  check('l\'app redevient active (poke) : la relecture reprend', table.fetchLog.length > countBefore, table.fetchLog.length);
  channel.disconnect();
}
{
  // Une lecture en échec : de plus en plus lent (1, 2, 4, 8 s), puis normal.
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const errors = [];
  let failing = true;
  const real = table.fetchTable.bind(table);
  table.fetchTable = async () => { if (failing) { table.fetchLog.push(clock.now()); throw new Error('réseau'); } return real(); };
  const channel = channelOf(table, clock, { hasPeers: () => true, onError: e => errors.push(e.message) });
  channel.connect(() => {});
  await clock.advance(20000);
  const g = gaps(table.fetchLog);
  check('lectures en échec : la pause s\'allonge (1 s, 2 s, 4 s, puis 8 s), l\'erreur est signalée à chaque fois', same(g.slice(0, 4), [1000, 2000, 4000, 8000]) && errors.length === table.fetchLog.length, { gaps: g, errors: errors.length });
  failing = false;
  await clock.advance(20000);
  const after = gaps(table.fetchLog.slice(-6));
  check('la panne finie, la relecture reprend son rythme (250 ms)', after.slice(-3).every(x => x === PERIOD), after);
  channel.disconnect();
}
{
  // La forme exacte des lots écrits.
  const clock = new FakeClock();
  const table = new LiveTable({ clock });
  const channel = channelOf(table, clock, {});
  await channel.write({
    removes: [4, 5],
    adds: [{ Doc: '7', Client: '1', Kind: 'u', Seq: 2, Data: 'QQ==', T: 10 }],
    claims: [{ require: { Doc: '7', Kind: 's' }, fields: { Client: '1', Seq: 1, Data: 'QQ==', T: 9 } }].map(c => c),
    upserts: [{ require: { Doc: '7', Client: '1', Kind: 'p' }, fields: { Seq: 3, Data: 'Qg==', T: 11 } }],
  }).catch(() => {});
  const sent = table.writeLog[0].actions;
  check('lot : suppressions d\'abord, puis ajouts, revendications, mises à jour par clé', sent.map(a => a[0]).join() === 'BulkRemoveRecord,BulkAddRecord,BulkAddOrUpdateRecord,BulkAddOrUpdateRecord', sent.map(a => a[0]));
  check('… BulkAddRecord porte des numéros nuls et les six colonnes en colonnes', same(sent[1][2], [null]) && same(Object.keys(sent[1][3]), ['Doc', 'Client', 'Kind', 'Seq', 'Data', 'T']) && same(sent[1][3].Seq, [2]), sent[1]);
  check('… la revendication n\'écrase jamais une ligne qui existe (update: false), la mise à jour par clé oui', sent[2][4].update === false && same(sent[2][2], { Doc: ['7'], Kind: ['s'] }) && !('update' in sent[3][4]), { claim: sent[2][4], upsert: sent[3][4] });
}
{
  // Une colonne du direct manque : prepare() l'ajoute (on n'écrit jamais dans une colonne absente).
  const clock = new FakeClock();
  const table = new LiveTable({ clock, columns: ['Doc', 'Client', 'Kind', 'Seq', 'Data'] });
  const channel = channelOf(table, clock, { floorMs: 0 });
  const repaired = await channel.prepare();
  check('une table du direct sans la colonne T : prepare() ajoute la colonne manquante (et seulement elle)', repaired === true && table.columns.includes('T') && table.writeLog[0].actions.length === 1 && table.writeLog[0].actions[0][2] === 'T', table.writeLog.map(w => w.actions));
  const again = await channel.prepare();
  check('une table complète n\'est pas retouchée', again === false && table.writeLog.length === 1, again);
}

summarizeAndExit();
