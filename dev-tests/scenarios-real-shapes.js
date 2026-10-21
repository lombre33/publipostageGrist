// Suite "realShapes" - les formes que Grist envoie VRAIMENT, enregistrées dans un vrai Grist et rejouées ici sans labo (étude « angles morts des tests » du 21/10, carte « Les trois garde-fous »).
// Pourquoi : les tests fabriquaient eux-mêmes les cellules d'un faux Grist, et rien ne vérifiait qu'elles ressemblent aux vraies ; presque tous ne jouaient qu'UNE des deux façons dont Grist envoie une ligne
// (la ligne affichée de grist.onRecord, ou la ligne brute de fetchTable). Trois garde-fous :
//  1. le faux Grist refuse un type de colonne que Grist n'envoie jamais (dev-tests/grist-stub.js : « DateTime » seul, « Ref » seul...) ;
//  2. dev-tests/fixtures/real-grist-shapes.json garde les cellules MESURÉES dans un vrai Grist (grist-static 0.1.6, sondes labo-grist-reel/probe-types-matrix.mjs, probe-types-extra3.mjs et
//     probe-types-extra4.mjs, mises en fichier par record-shapes.mjs) : trois documents, une quarantaine de colonnes de tous les types, leurs lignes affichées (objets GristDate, GristDateTime, Reference,
//     RaisedException...) et brutes (secondes, ["L", …], ["E", …], id de Référence et colonne d'aide) ;
//  3. pour CHAQUE cellule enregistrée, le texte que le document écrit pour la ligne affichée est celui qu'il écrit pour la ligne brute (une ligne seule, un lot). Un écart d'aujourd'hui est noté dans KNOWN_GAPS,
//     avec les deux textes ; il disparaît de la liste quand on le corrige - le test échoue alors, pour qu'on l'en retire.
(function () {
  const cases = [];

  // Les classes ont le nom et les propriétés du vrai grist-plugin-api (objtypes.ts, GristData.ts), pas ceux que le widget a décidés.
  class Reference { constructor(tableId, rowId) { this.tableId = tableId; this.rowId = rowId; } toString() { return this.tableId + '[' + this.rowId + ']'; } }
  class GristDate extends Date { toString() { return this.toISOString().slice(0, 10); } }
  class GristDateTime extends Date { constructor(ms, timezone) { super(ms); this.timezone = timezone; } toString() { return this.toISOString(); } }
  class RaisedException {
    constructor(args) {
      const rest = args.slice();
      this.name = rest.shift(); this.message = rest.shift(); this.details = rest.shift();
      const input = rest.shift();
      this.user_input = input == null ? undefined : input.u;
    }
    toString() {
      switch (this.name) {
        case 'ZeroDivisionError': return '#DIV/0!';
        case 'UnmarshallableError': return this.details || '#' + this.name;
        case 'InvalidTypedValue': return `#Invalid ${this.message}: ${this.details}`;
        default: return '#' + this.name;
      }
    }
  }

  // La forme étiquetée par les sondes ({ $: 'Date', cls, iso, timezone }...) ramenée à l'objet que le widget reçoit.
  function revive(tagged) {
    if (tagged === null || typeof tagged !== 'object') return tagged;
    if (Array.isArray(tagged)) return tagged.map(revive);
    if (tagged.$ === 'undefined') return undefined;
    if (tagged.$ === 'Date') return tagged.cls === 'GristDate' ? new GristDate(Date.parse(tagged.iso)) : new GristDateTime(Date.parse(tagged.iso), tagged.timezone);
    if (tagged.$ === 'Reference') return new Reference(tagged.tableId, tagged.rowId);
    if (tagged.$ === 'RaisedException') {
      const user = revive(tagged.user_input);
      return new RaisedException([tagged.name, revive(tagged.message), revive(tagged.details), user === undefined ? undefined : { u: user }]);
    }
    throw new Error('forme enregistrée inconnue : ' + JSON.stringify(tagged));
  }
  // La ligne brute ne porte que du JSON : seul le marqueur « undefined » des sondes (la cellule absente d'un fetchTable de grist-static) devient null, comme le faux Grist le range.
  const rawOf = value => (value && typeof value === 'object' && !Array.isArray(value) && value.$ === 'undefined' ? null : value);

  const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
  async function textOf(table, column, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(`<p>${badge(table, column)}</p>`, table, record);
    return box.textContent.replace(/\s+/g, ' ').trim();
  }

  let fixturePromise = null;
  const fixture = () => (fixturePromise = fixturePromise || fetch('dev-tests/fixtures/real-grist-shapes.json').then(response => response.json()));

  // Un document enregistré posé dans le faux Grist : sa table cible (Produits) et sa table de la page (Clients) avec les lignes brutes ; rend les lignes affichées par id.
  async function load(h, doc) {
    await h.resetEditor();
    const stub = window.__gristStub;
    const produits = doc.tables.Produits;
    stub.setVariables('Produits', produits.colonnes);
    stub.setRows('Produits', produits.lignes);
    const clients = doc.tables.Clients;
    stub.setVariables('Clients', Object.assign({}, clients.colonnes, clients.typesAide), clients.choix, clients.aide, clients.visibles);
    const rawRows = [];
    const shownRows = {};
    doc.ids.forEach(id => {
      const raw = { id };
      const shown = { id };
      Object.keys(clients.cellules).forEach(column => {
        const cell = clients.cellules[column][id];
        if (!cell) return;
        raw[column] = rawOf(cell.brute);
        if (clients.aide[column]) raw[clients.aide[column]] = rawOf(cell.aide);
        shown[column] = revive(cell.affichee);
      });
      rawRows.push(raw);
      shownRows[id] = shown;
    });
    stub.setRows('Clients', rawRows);
    await GristAPI.refreshSchema();
    return shownRows;
  }

  // Les écarts d'aujourd'hui entre le texte de la ligne affichée et celui de la ligne brute : « document/colonne/ligne » -> { displayed, raw, why }. Un écart qui se ferme fait échouer le test
  // (retirer la ligne) ; un écart qui change de texte aussi.
  const KNOWN_GAPS = {};

  // Le texte que le document écrit, vérifié à la main une fois pour toutes (pas « les deux formes disent pareil » : « les deux disent juste »).
  const GOLDEN = {
    'types/Num/1': '1 234,5', 'types/Ent/1': '42', 'types/Oui/1': 'vrai', 'types/Oui/2': 'faux', 'types/Jour/1': '12/09/2026', 'types/Rdv/1': '12/09/2026', 'types/Rdv/4': '01/01/2027',
    'types/Choix/1': 'A', 'types/Tailles/1': 'M, L', 'types/Prod/1': 'Stylo', 'types/ProdNum/1': '2024', 'types/ProdDate/1': '12/09/2026', 'types/Prods/1': 'Stylo, Cahier',
    'types/Err/1': '#DIV/0!', 'types/ErrTxt/1': '#AttributeError', 'types/ListeVide/1': '',
    'formules-en-erreur/ErrNum/1': '#DIV/0!', 'formules-en-erreur/ErrNum/2': '12,5', 'formules-en-erreur/ErrDate/1': '#DIV/0!', 'formules-en-erreur/ErrDate/2': '12/09/2026',
    'formules-en-erreur/ErrDateTime/1': '#DIV/0!', 'formules-en-erreur/ErrRef/1': '#DIV/0!', 'formules-en-erreur/ErrRef/2': 'Stylo', 'formules-en-erreur/ErrRefDate/2': '01/03/2026',
    'references-plus/ProdId/1': '1', 'references-plus/ProdQuand/1': '12/09/2026', 'references-plus/ProdActif/1': 'vrai',
    'types/AnyJour/1': '12/09/2026', 'types/AnyJour/4': '31/12/2026', 'types/AnyDate/1': '12/09/2026 23:30', 'types/AnyDate/4': '01/01/2027 00:30',
  };

  cases.push({
    id: 'realshapes_the_stub_refuses_a_column_type_that_grist_never_sends',
    description: 'Garde-fou 1 : le faux Grist refuse, avant de rien changer, un type de colonne que Grist n\'envoie jamais (« DateTime » sans fuseau, « Ref » ou « RefList » sans table, un nom inventé) et accepte tous les types réels ; le message nomme la table, la colonne et le type',
    run: async (h) => {
      await h.resetEditor();
      const stub = window.__gristStub;
      const bad = [];
      const before = JSON.stringify(GristAPI.getTables());
      for (const type of ['DateTime', 'DateTime:', 'Ref', 'RefList', 'Ref:', 'Date:UTC', 'Datetime', 'Integer', 'text', 'Choice List', '', null]) {
        let message = null;
        try { stub.setVariables('GardeTypes', { Bonne: 'Text', Mauvaise: type }); } catch (e) { message = e.message; }
        if (message === null) bad.push({ type, refuse: false });
        else if (!message.includes('GardeTypes.Mauvaise')) bad.push({ type, message });
      }
      if (JSON.stringify(GristAPI.getTables()) !== before) bad.push({ etat: 'un type refusé a quand même créé la table' });
      const good = { A: 'Any', B: 'Attachments', C: 'Bool', D: 'Choice', E: 'ChoiceList', F: 'Date', G: 'DateTime:Europe/Paris', H: 'DateTime:UTC', I: 'DateTime:America/Argentina/Buenos_Aires', J: 'Id', K: 'Int', L: 'ManualSortPos', M: 'Numeric', N: 'PositionNumber', O: 'Text', P: 'Ref:Clients', Q: 'RefList:Clients' };
      try { stub.setVariables('GardeTypes', good); } catch (e) { bad.push({ accepte: false, message: e.message }); }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  cases.push({
    id: 'realshapes_every_recorded_cell_is_written_the_same_for_a_single_row_and_a_batch',
    description: 'Garde-fous 2 et 3 : pour chacune des cellules enregistrées dans un vrai Grist (quarante colonnes de tous les types, listes, Références vers un nombre, une date, un Oui / Non, cellules en erreur), le document écrit le même texte pour la ligne affichée (grist.onRecord) et pour la ligne brute (fetchTable) ; les écarts connus sont listés avec leurs deux textes, et un écart qui se ferme ou change fait échouer le test',
    run: async (h) => {
      const data = await fixture();
      const bad = [];
      const closed = [];
      const seen = [];
      let count = 0;
      for (const doc of data.documents) {
        const shownRows = await load(h, doc);
        const columns = Object.keys(doc.tables.Clients.cellules);
        for (const column of columns) {
          for (const id of doc.ids) {
            if (!doc.tables.Clients.cellules[column][id]) continue;
            count++;
            const key = doc.nom + '/' + column + '/' + id;
            const displayed = await textOf('Clients', column, Object.assign({}, shownRows[id]));
            const raw = await textOf('Clients', column, await GristAPI.fetchRowById('Clients', id));
            const known = KNOWN_GAPS[key];
            if (displayed === raw) {
              if (known) closed.push(key);
            } else if (!known) {
              bad.push({ cellule: key, affichee: displayed, brute: raw });
            } else {
              seen.push(key);
              if (known.displayed !== displayed || known.raw !== raw) bad.push({ ecartConnuChange: key, affichee: displayed, brute: raw, notes: known });
            }
            if (GOLDEN[key] !== undefined) {
              for (const [shape, text] of [['affichee', displayed], ['brute', raw]]) if (text !== GOLDEN[key]) bad.push({ attendu: key, forme: shape, got: text, expected: GOLDEN[key] });
            }
          }
        }
      }
      const lost = Object.keys(KNOWN_GAPS).filter(key => !seen.includes(key) && !closed.includes(key));
      return {
        pass: bad.length === 0 && closed.length === 0 && lost.length === 0 && count >= 180,
        notes: JSON.stringify({ cellules: count, nouveauxEcarts: bad, ecartsComblesARetirerDeKNOWN_GAPS: closed, ecartsIntrouvables: lost }),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.realShapes = cases;
})();
