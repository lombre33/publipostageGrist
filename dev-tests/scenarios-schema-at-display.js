// Suite "schemaAtDisplay" - la passe de schéma EXACT à l'affichage d'un modèle (js/editor.js, setHTML : GristAPI.refreshSchema), lot « Lectures de fond » de « Tests de charge » (04/10).
//
// La passe exacte lit CHAQUE table du document en entier pour en connaître les colonnes (js/grist-api.js, exactColumnsByTable) : 43 lectures et 1,4 million de cases à chaque modèle affiché
// dans un document de 40 tables de 2 000 lignes. Elle ne sert, à cet endroit, qu'à valider les bulles #Variable du modèle (le rouge d'une table ou d'une colonne disparue). Désormais :
//  - aucune bulle rouge et une passe commencée il y a moins d'une minute : rien n'est relu (js/main.js demande déjà la même chose à l'ouverture) ;
//  - une bulle rouge : la passe repart, comme avant - le rouge peut venir d'un schéma périmé (une colonne ajoutée dans Grist depuis la dernière passe) ;
//  - une passe vieille de plus d'une minute : elle repart aussi.
// Les lectures se comptent en enveloppant grist.docApi.fetchTable le temps du cas.
(function () {
  const cases = [];
  const TABLE = 'SdClients';
  const stub = () => window.__gristStub;
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const isBroken = () => { const el = document.querySelector('.tiptap span.var-badge'); return !!el && el.classList.contains('var-badge-broken'); };

  // Les lectures de la table du cas (fetchTable), tant que le cas dure : une passe exacte en fait une.
  function watchReads() {
    const docApi = window.grist.docApi;
    const original = docApi.fetchTable;
    const state = { reads: 0, stop: () => { docApi.fetchTable = original; } };
    docApi.fetchTable = function (tableId) {
      if (tableId === TABLE) state.reads++;
      return original.apply(this, arguments);
    };
    return state;
  }

  function seedTable(columns) {
    stub().setVariables(TABLE, columns);
    stub().setRows(TABLE, [{ id: 1, Nom: 'Dupont', Ville: 'Lyon', Pays: 'France' }, { id: 2, Nom: 'Martin', Ville: 'Nantes', Pays: 'France' }]);
  }

  cases.push({
    id: 'schema_display_skips_the_exact_pass_when_no_bubble_is_red_and_the_last_pass_is_recent',
    description: "Afficher des modèles dont toutes les bulles sont valides, juste après une passe de schéma, ne relit aucune table : avant, chaque affichage lisait toutes les tables du document en entier",
    run: async (h) => {
      await h.resetEditor();
      seedTable({ Nom: 'Text', Ville: 'Text', Pays: 'Text' });
      await GristAPI.refreshSchema(); // une passe exacte toute fraîche
      const watch = watchReads();
      try {
        for (let i = 0; i < 3; i++) {
          Editor.setHTML('<p>Dossier de ' + badge('Nom') + ' (' + i + ')</p>');
          await h.sleep(300);
        }
        const broken = isBroken();
        return { pass: watch.reads === 0 && !broken, notes: 'lectures de la table pour trois affichages=' + watch.reads + ' (attendu 0), bulle rouge=' + broken };
      } finally { watch.stop(); }
    },
  });

  cases.push({
    id: 'schema_display_reruns_the_pass_when_a_bubble_is_red_so_a_column_added_since_is_found',
    description: "Une colonne ajoutée dans Grist depuis la dernière passe : la bulle qui la cite est rouge d'après le schéma en cache, la passe repart à l'affichage et la bulle cesse d'être rouge, comme avant",
    run: async (h) => {
      await h.resetEditor();
      seedTable({ Nom: 'Text', Ville: 'Text' });
      await GristAPI.refreshSchema();
      seedTable({ Nom: 'Text', Ville: 'Text', Pays: 'Text' }); // la colonne arrive après la passe
      const watch = watchReads();
      try {
        Editor.setHTML('<p>' + badge('Pays') + '</p>');
        const redAtOnce = isBroken(); // d'après le schéma en cache, avant toute lecture
        await h.sleep(400);
        const redAfter = isBroken();
        return { pass: redAtOnce && watch.reads >= 1 && !redAfter, notes: 'rouge tout de suite=' + redAtOnce + ' (attendu oui), lectures=' + watch.reads + ' (attendu au moins 1), rouge après la passe=' + redAfter + ' (attendu non)' };
      } finally { watch.stop(); }
    },
  });

  cases.push({
    id: 'schema_display_reruns_the_pass_when_the_last_one_is_older_than_a_minute',
    description: "Une passe vieille de plus d'une minute : l'affichage d'un modèle sans bulle rouge relit le schéma, comme avant (une colonne retirée de Grist se voit au plus une minute plus tard)",
    run: async (h) => {
      await h.resetEditor();
      seedTable({ Nom: 'Text', Ville: 'Text', Pays: 'Text' });
      await GristAPI.refreshSchema();
      const watch = watchReads();
      const realNow = Date.now;
      try {
        // Une minute et un peu plus plus tard, sans attendre : l'horloge saute le temps d'un affichage, jamais plus.
        Date.now = () => realNow.call(Date) + 61000;
        Editor.setHTML('<p>' + badge('Nom') + '</p>');
        await h.sleep(300);
        Date.now = realNow;
        return { pass: watch.reads >= 1, notes: 'lectures de la table après une minute=' + watch.reads + ' (attendu au moins 1)' };
      } finally {
        Date.now = realNow;
        watch.stop();
        await GristAPI.refreshSchema(); // l'horloge de la dernière passe repart de l'heure réelle
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.schemaAtDisplay = cases;
})();
