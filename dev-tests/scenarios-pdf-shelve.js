// Suite "pdfShelve" - ranger dans GFS les PDF que l'app exporte (consigne 043 de GFS, demande du porteur du 03/11 : « que des exports de Publipostage+ en PDF aillent directement se ranger parmi les fichiers, avec le choix d'écraser l'existant ou
// d'avoir une copie avec un (1) derrière le nom »). L'export a trois destinations (js/pdf-delivery.js) : « Télécharger » (l'origine), « Ranger dans GFS » et « Télécharger et ranger dans GFS ». Joué « hébergé » (HOSTED_GROUPS de dev-tests/run-headless.mjs) :
// la page s'ouvre avec `?gfs=0` et dev-tests/gfs-stub.js joue GFS, dont `ranger` (la fenêtre « Ce nom est déjà pris » y est une réponse écrite d'avance : `quandPris`). Ce que la suite garde :
//  1) la destination : « Télécharger » tant que la personne n'a rien choisi, le choix gardé par PersonStore (une valeur étrangère vaut l'origine), jamais autre chose que « Télécharger » sans GFS (seule, ou un GFS qui ne répond pas) ;
//  2) le nom et le lot : « .pdf » au bout, 200 signes au plus, un retour à la ligne devenu une espace ; un nom de lot de 64 signes au plus ;
//  3) le dépôt (PdfDelivery.deliver + GfsLink.deposit) : l'appel porte `fichier` (un File PDF), `nom`, `type: pdf`, `lot` et `suivants` - jamais de `dossier` -, un fichier à la fois, `suivants` qui décroît jusqu'à 0, les quatre réponses de GFS
//     (ajouté, remplacé, copie « (1) », refusé par la personne) et ce que chacune change au téléchargement et à la date du dernier export ;
//  4) rien ne se perd : un fichier que GFS n'a pas gardé est téléchargé comme avant (`GFS_ECHEC` : les suivants sont tentés ; `GFS_ANNULE`, `GFS_INCONNU`… : les appels s'arrêtent) et le coin d'état dit pourquoi ;
//  5) les phrases du coin d'état, en français et en anglais ;
//  6) le menu « Destination du PDF » du menu Exporter (le menu Type d'export, dont le bas est à 490 px, n'a pas la place d'y mettre trois lignes dans un panneau de 400) : trois lignes à cocher, montrées pour les deux PDF seulement, les deux qui rangent grisées sans GFS (leur clic explique et ne choisit rien), le choix gardé et défait par Ctrl + Z / Ctrl + Y ;
//  7) les VRAIS exports : le PDF d'une ligne, l'archive ZIP (un PDF par ligne, rangés un à un), le PDF réuni et l'assemblage en planches, rangés seuls ou avec leur téléchargement.
// Le vrai clic à la souris à 700 x 400 est dans dev-tests/verify-gfs-shelve.mjs.
(function () {
  const cases = [];
  const TABLE = 'PsClients';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const KEY = 'pp_export_destination';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const gfs = () => window.__gfsStub;
  const gristStub = () => window.__gristStub;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const byId = id => document.getElementById(id);
  const statusText = () => byId('status-msg').textContent;
  const statusIsError = () => byId('status-msg').className;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  // Un « PDF » pour les essais qui ne passent pas par le moteur : le début d'un vrai fichier, c'est tout ce que GFS contrôle (6.6, point 4).
  const pdfBlob = (label, extra) => new Blob(['%PDF-1.4\n% ' + label + '\n' + (extra || '') + '\n%%EOF'], { type: 'application/pdf' });
  const keyEvent = key => new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
  const ed = () => EditorCore.getEditor();

  // Le faux GFS qui sait ranger et la destination de départ (aucune : la personne n'a rien choisi).
  async function setup(h, destination) {
    await h.resetEditor();
    I18n.setLang('fr');
    const g = gfs();
    g.ranger = {};
    g.calls.length = 0;
    g.fichiers = [];
    g.rangerAppels = [];
    g.rangerEnCours = 0;
    g.rangerMax = 0;
    g.prochainFichier = 1;
    PdfDelivery.takeReport();
    PersonStore.remove(KEY);
    if (destination) PdfDelivery.choose(destination);
  }
  function finish() {
    PersonStore.remove(KEY);
    gfs().ranger = null;
    gfs().fichiers = [];
    I18n.setLang('fr');
    PdfDelivery.takeReport();
  }
  // Ce que le téléchargement a reçu : 'all' (tout) ou les noms du sous-ensemble.
  const downloadSpy = () => {
    const calls = [];
    return { calls, download: async subset => { calls.push(subset ? subset.map(f => f.name) : 'all'); } };
  };
  // Les fichiers qu'un export donne à PdfDelivery.deliver.
  const filesOf = labels => labels.map((label, i) => ({ name: label, blob: pdfBlob(label), rowId: i + 1 }));
  const keptNames = () => gfs().fichiers.map(f => f.nom);

  // --- 1) la destination ---
  cases.push({
    id: 'pdfshelve_destination_is_download_until_chosen_and_follows_the_stored_choice',
    description: 'Hébergée par un GFS qui répond, la destination est « Télécharger » tant que la personne n’a rien choisi, puis le choix gardé (« Ranger dans GFS », « les deux ») ; une valeur étrangère gardée vaut l’origine et un choix hors des trois n’écrit rien ; sans GFS (seule, ou un GFS qui ne répond pas) elle reste « Télécharger » quel que soit le choix gardé, qui revient avec GFS',
    run: async (h) => {
      await setup(h);
      const problems = [];
      const origin = { destination: PdfDelivery.destination(), chosen: PdfDelivery.chosen(), plan: PdfDelivery.plan(), stored: PersonStore.get(KEY) };
      check(problems, 'sans choix', origin, { destination: 'download', chosen: 'download', plan: { download: true, shelve: false }, stored: null });
      check(problems, 'GFS peut ranger', PdfDelivery.available(), true);
      const plans = {};
      ['gfs', 'both', 'download'].forEach((value) => {
        const wrote = PdfDelivery.choose(value);
        plans[value] = { wrote, stored: PersonStore.get(KEY), destination: PdfDelivery.destination(), plan: PdfDelivery.plan() };
      });
      check(problems, 'les trois choix', plans, {
        gfs: { wrote: true, stored: 'gfs', destination: 'gfs', plan: { download: false, shelve: true } },
        both: { wrote: true, stored: 'both', destination: 'both', plan: { download: true, shelve: true } },
        download: { wrote: true, stored: 'download', destination: 'download', plan: { download: true, shelve: false } },
      });
      PdfDelivery.choose('gfs');
      check(problems, 'un choix hors des trois n’écrit rien', [PdfDelivery.choose('zip'), PdfDelivery.choose(''), PdfDelivery.choose(undefined), PersonStore.get(KEY)], [false, false, false, 'gfs']);
      PersonStore.set(KEY, 'n’importe quoi');
      check(problems, 'valeur étrangère gardée', [PdfDelivery.chosen(), PdfDelivery.destination()], ['download', 'download']);
      PdfDelivery.choose('both');
      // Un GFS qui ne répond pas : l'app est hébergée mais ne peut rien ranger ; seule, de même.
      const realAnswering = GfsLink.isAnswering;
      const realHosted = GfsLink.hosted;
      try {
        GfsLink.isAnswering = () => false;
        check(problems, 'GFS muet', [PdfDelivery.available(), PdfDelivery.destination(), PdfDelivery.chosen(), PdfDelivery.plan()], [false, 'download', 'both', { download: true, shelve: false }]);
        GfsLink.isAnswering = realAnswering;
        GfsLink.hosted = false;
        check(problems, 'seule', [PdfDelivery.available(), PdfDelivery.destination(), PdfDelivery.chosen(), PdfDelivery.plan()], [false, 'download', 'both', { download: true, shelve: false }]);
      } finally {
        GfsLink.isAnswering = realAnswering;
        GfsLink.hosted = realHosted;
      }
      check(problems, 'le choix revient avec GFS', [PdfDelivery.destination(), PdfDelivery.plan()], ['both', { download: true, shelve: true }]);
      finish();
      return verdict(problems, { plans });
    },
  });

  // --- 2) le nom et le lot ---
  cases.push({
    id: 'pdfshelve_names_end_with_pdf_within_200_signs_and_the_lot_within_64',
    description: 'Le nom donné à GFS prend « .pdf » au bout (une fois, sans tenir compte de la casse), perd ses retours à la ligne et ne dépasse pas 200 signes ; le nom d’un lot porte la table et l’instant, 64 signes au plus, sans espace',
    run: async () => {
      const problems = [];
      check(problems, 'noms', ['Facture', 'Facture.pdf', 'Facture.PDF', 'a\nb\r\nc', '', '   ', null].map(PdfDelivery.nameFor), ['Facture.pdf', 'Facture.pdf', 'Facture.pdf', 'a b c.pdf', 'publipostage.pdf', 'publipostage.pdf', 'publipostage.pdf']);
      const long = PdfDelivery.nameFor('x'.repeat(300));
      check(problems, 'nom trop long', [long.length <= 200, /\.pdf$/.test(long), /^x+\.pdf$/.test(long)], [true, true, true]);
      const lot = PdfDelivery.lotFor('Mes factures 2026');
      const longLot = PdfDelivery.lotFor('T'.repeat(120));
      check(problems, 'lot', [/^Mes_factures_2026-\d{9,}$/.test(lot), longLot.length <= 64, /^T+-\d{9,}$/.test(longLot), PdfDelivery.lotFor('').indexOf('export-') === 0], [true, true, true, true]);
      return verdict(problems, { long: long.length, lot, longLot: longLot.length });
    },
  });

  // --- 3) le dépôt ---
  cases.push({
    id: 'pdfshelve_deposit_sends_a_pdf_file_with_its_name_and_nothing_else',
    description: 'GfsLink.deposit envoie `ranger` avec le seul fichier (un File PDF), son nom, `type: pdf`, `lot` et `suivants` - jamais un `dossier`, jamais un autre type -, rend { statut, id, nom } ; une erreur de GFS garde son code (GFS_ECHEC, GFS_REFUSE) et un GFS d’avant la consigne répond GFS_INCONNU',
    run: async (h) => {
      await setup(h);
      const problems = [];
      const first = await GfsLink.deposit({ fichier: pdfBlob('un'), nom: 'Un.pdf', lot: 'Lot-1', suivants: 2, dossier: 'Factures', type: 'zip', autre: 1 });
      const sent = gfs().calls.filter(c => c.nom === 'ranger').pop();
      check(problems, 'les champs envoyés', Object.keys(sent.args), ['fichier', 'nom', 'type', 'lot', 'suivants']);
      check(problems, 'le type reste pdf', sent.args.type, 'pdf');
      check(problems, 'la réponse', first, { statut: 'ajoute', id: '1', nom: 'Un.pdf' });
      await GfsLink.deposit({ fichier: pdfBlob('deux'), nom: 'Deux.pdf' });
      const bare = gfs().calls.filter(c => c.nom === 'ranger').pop();
      check(problems, 'sans lot ni suivants', Object.keys(bare.args), ['fichier', 'nom', 'type']);
      await GfsLink.deposit({ fichier: pdfBlob('trois'), nom: 'Trois.pdf', lot: '', suivants: -1 });
      check(problems, 'un lot vide et un rang négatif ne partent pas', Object.keys(gfs().calls.filter(c => c.nom === 'ranger').pop().args), ['fichier', 'nom', 'type']);
      const errors = [];
      gfs().ranger = { erreur: { code: 'GFS_ECHEC', message: 'Le serveur Grist a refusé le fichier.' } };
      await GfsLink.deposit({ fichier: pdfBlob('x'), nom: 'X.pdf' }).catch(e => errors.push({ code: e.code, message: e.message }));
      gfs().ranger = {};
      await GfsLink.deposit({ fichier: new Blob(['pas un pdf']), nom: 'Texte.pdf' }).catch(e => errors.push({ code: e.code, message: e.message }));
      gfs().ranger = null;
      await GfsLink.deposit({ fichier: pdfBlob('y'), nom: 'Y.pdf' }).catch(e => errors.push({ code: e.code, message: e.message }));
      check(problems, 'les erreurs gardent leur code', errors, [
        { code: 'GFS_ECHEC', message: 'Le serveur Grist a refusé le fichier.' },
        { code: 'GFS_REFUSE', message: 'ce fichier n’est pas un PDF' },
        { code: 'GFS_INCONNU', message: 'appel inconnu : ranger' },
      ]);
      finish();
      return verdict(problems, { first });
    },
  });

  cases.push({
    id: 'pdfshelve_gfs_only_shelves_without_downloading_and_dates_the_row',
    description: 'Avec « Ranger dans GFS », un PDF est donné à GFS sous son nom (File PDF, `suivants: 0`, sans lot) et n’est PAS téléchargé : le rapport dit un fichier ajouté, parti quelque part',
    run: async (h) => {
      await setup(h, 'gfs');
      const problems = [];
      const spy = downloadSpy();
      const report = await PdfDelivery.deliver(filesOf(['Facture A']), spy.download);
      check(problems, 'aucun téléchargement', spy.calls, []);
      check(problems, 'le fichier gardé', gfs().fichiers.map(f => [f.nom, f.taille > 0]), [['Facture A.pdf', true]]);
      const call = gfs().rangerAppels[0];
      check(problems, 'l’appel', { nom: call.nom, lot: call.lot, suivants: call.suivants, dossier: call.dossier, typeDeclare: call.typeDeclare, type: call.type, instance: call.instance }, { nom: 'Facture A.pdf', suivants: 0, typeDeclare: 'pdf', type: 'application/pdf', instance: 'File' });
      check(problems, 'le rapport', { shelved: report.shelved, total: report.total, counts: report.counts, downloaded: report.downloaded, fellBack: report.fellBack, delivered: Array.from(report.delivered), failed: report.failed.length }, { shelved: true, total: 1, counts: { ajoute: 1, remplace: 0, copie: 0, ignore: 0 }, downloaded: 0, fellBack: false, delivered: [0], failed: 0 });
      check(problems, 'la phrase', PdfDelivery.describe(report), { text: 'PDF rangé dans GFS.', note: '' });
      finish();
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfshelve_a_taken_name_is_answered_by_gfs_copy_replace_or_cancel',
    description: 'Un nom déjà pris : « Garder les deux » range « Nom (1).pdf » (copie), « Remplacer » garde l’identifiant et prend le nouveau contenu, « Annuler » n’écrit rien et le PDF n’est NI rangé NI téléchargé (la personne l’a refusé : il n’est parti nulle part) ; chaque phrase dit ce qui s’est passé',
    run: async (h) => {
      const problems = [];
      const outcomes = {};
      for (const answer of ['copie', 'remplace', 'ignore']) {
        await setup(h, 'gfs');
        gfs().ranger = { quandPris: answer };
        const spy = downloadSpy();
        await PdfDelivery.deliver(filesOf(['Facture A']), spy.download);
        const before = gfs().fichiers.map(f => ({ id: f.id, nom: f.nom, taille: f.taille }));
        const bigger = { name: 'Facture A', blob: pdfBlob('Facture A', 'plus long '.repeat(40)) };
        const report = await PdfDelivery.deliver([bigger], spy.download);
        outcomes[answer] = {
          counts: report.counts, delivered: Array.from(report.delivered), downloads: spy.calls, said: PdfDelivery.describe(report).text,
          kept: gfs().fichiers.map(f => ({ id: f.id, nom: f.nom, grew: f.taille > before[0].taille })),
        };
      }
      check(problems, 'garder les deux', outcomes.copie, { counts: { ajoute: 0, remplace: 0, copie: 1, ignore: 0 }, delivered: [0], downloads: [], said: 'PDF rangé dans GFS sous le nom « Facture A (1).pdf ».', kept: [{ id: 1, nom: 'Facture A.pdf', grew: false }, { id: 2, nom: 'Facture A (1).pdf', grew: true }] });
      check(problems, 'remplacer', outcomes.remplace, { counts: { ajoute: 0, remplace: 1, copie: 0, ignore: 0 }, delivered: [0], downloads: [], said: 'PDF rangé dans GFS, à la place de l’ancien.', kept: [{ id: 1, nom: 'Facture A.pdf', grew: true }] });
      check(problems, 'annuler', outcomes.ignore, { counts: { ajoute: 0, remplace: 0, copie: 0, ignore: 1 }, delivered: [], downloads: [], said: 'PDF non rangé : annulé dans GFS.', kept: [{ id: 1, nom: 'Facture A.pdf', grew: false }] });
      finish();
      return verdict(problems, outcomes);
    },
  });

  cases.push({
    id: 'pdfshelve_both_downloads_the_file_and_shelves_it',
    description: 'Avec « Télécharger et ranger dans GFS », le fichier est téléchargé comme avant ET rangé ; une réponse « Annuler » de GFS ne retire rien au téléchargement',
    run: async (h) => {
      await setup(h, 'both');
      const problems = [];
      const spy = downloadSpy();
      const report = await PdfDelivery.deliver(filesOf(['Facture A']), spy.download);
      check(problems, 'téléchargé une fois, tout', spy.calls, ['all']);
      check(problems, 'rangé', keptNames(), ['Facture A.pdf']);
      check(problems, 'le rapport', [report.downloaded, report.fellBack, Array.from(report.delivered)], [1, false, [0]]);
      gfs().ranger = { quandPris: 'ignore' };
      const second = downloadSpy();
      const refused = await PdfDelivery.deliver(filesOf(['Facture A']), second.download);
      check(problems, 'refusé chez GFS, téléchargé quand même', [second.calls, keptNames(), Array.from(refused.delivered), PdfDelivery.describe(refused).text], [['all'], ['Facture A.pdf'], [0], 'PDF non rangé : annulé dans GFS.']);
      finish();
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfshelve_a_batch_goes_one_file_at_a_time_in_one_lot_with_decreasing_followers',
    description: 'Cinq PDF d’un même export partent un à un (jamais deux appels en même temps), sous un même lot, leur `suivants` décroît de 4 à 0, les noms pris sont répondus par GFS (copie, remplacement, refus) et la phrase compte ce que GFS a gardé ; le téléchargement n’a pas lieu',
    run: async (h) => {
      await setup(h, 'gfs');
      const problems = [];
      // Deux noms déjà pris : le deuxième sera copié, le quatrième remplacé ; le cinquième est neuf.
      gfs().ranger = { delai: 25, quandPris: name => (name === 'B.pdf' ? 'copie' : 'remplace') };
      await PdfDelivery.deliver(filesOf(['B', 'D']), async () => {});
      gfs().rangerAppels = [];
      gfs().rangerMax = 0;
      const spy = downloadSpy();
      const lot = PdfDelivery.lotFor(TABLE);
      const progress = [];
      const report = await PdfDelivery.deliver(filesOf(['A', 'B', 'C', 'D', 'E']), spy.download, { lot, progress: (rank, total) => progress.push(rank + '/' + total) });
      check(problems, 'un fichier à la fois', gfs().rangerMax, 1);
      check(problems, 'même lot', gfs().rangerAppels.map(c => c.lot === lot), [true, true, true, true, true]);
      check(problems, 'suivants', gfs().rangerAppels.map(c => c.suivants), [4, 3, 2, 1, 0]);
      check(problems, 'l’ordre', gfs().rangerAppels.map(c => c.nom), ['A.pdf', 'B.pdf', 'C.pdf', 'D.pdf', 'E.pdf']);
      check(problems, 'le coin d’état suit', progress, ['1/5', '2/5', '3/5', '4/5', '5/5']);
      check(problems, 'les réponses', report.counts, { ajoute: 3, remplace: 1, copie: 1, ignore: 0 });
      check(problems, 'rien n’est téléchargé', spy.calls, []);
      check(problems, 'la phrase', PdfDelivery.describe(report, 0).text, '5 PDF rangés dans GFS (1 remplacé, 1 gardé en double).');
      check(problems, 'les fichiers de GFS', keptNames().sort(), ['A.pdf', 'B (1).pdf', 'B.pdf', 'C.pdf', 'D.pdf', 'E.pdf']);
      // Un lot à qui la personne dit non pour deux noms pris : les autres sont rangés, les deux refusés ne sont partis nulle part.
      gfs().ranger = { quandPris: 'ignore' };
      const refusing = await PdfDelivery.deliver(filesOf(['A', 'F', 'D']), spy.download);
      check(problems, 'deux refus', [refusing.counts, Array.from(refusing.delivered), spy.calls, PdfDelivery.describe(refusing, 0).text], [{ ajoute: 1, remplace: 0, copie: 0, ignore: 2 }, [1], [], '1 PDF rangé dans GFS, 2 non rangés (annulé dans GFS).']);
      finish();
      return verdict(problems, { progress });
    },
  });

  // --- 4) rien ne se perd ---
  cases.push({
    id: 'pdfshelve_a_file_gfs_did_not_keep_is_downloaded_and_the_status_says_why',
    description: 'Un fichier que GFS n’a pas gardé est téléchargé comme avant : `GFS_ECHEC` laisse les suivants être tentés (un seul téléchargement, le sous-ensemble), `GFS_ANNULE` (table des fichiers refusée) arrête les appels (les fichiers restants sont téléchargés sans être envoyés), un GFS d’avant la consigne (GFS_INCONNU) fait tout télécharger ; avec « les deux », rien ne change au téléchargement ; chaque cas dit pourquoi, en rouge au début',
    run: async (h) => {
      const problems = [];
      const four = () => filesOf(['A', 'B', 'C', 'D']);
      // GFS_ECHEC sur le deuxième : les deux suivants sont rangés, le deuxième est téléchargé seul.
      await setup(h, 'gfs');
      gfs().ranger = { erreurs: { 2: { code: 'GFS_ECHEC', message: 'Le serveur Grist a refusé le fichier (trop gros).' } } };
      let spy = downloadSpy();
      let report = await PdfDelivery.deliver(four(), spy.download);
      check(problems, 'échec isolé', { calls: gfs().rangerAppels.length, kept: keptNames(), downloads: spy.calls, stopped: report.stopped, delivered: Array.from(report.delivered).sort((a, b) => a - b), fellBack: report.fellBack }, { calls: 4, kept: ['A.pdf', 'C.pdf', 'D.pdf'], downloads: [['B']], stopped: '', delivered: [0, 1, 2, 3], fellBack: true });
      check(problems, 'sa phrase', PdfDelivery.describe(report, 0), { text: '3 PDF rangés dans GFS.', note: 'GFS n’a pas gardé 1 PDF (Le serveur Grist a refusé le fichier (trop gros)) : téléchargé.' });
      // GFS_ANNULE sur le deuxième : le troisième et le quatrième ne sont même pas envoyés ; trois fichiers sont téléchargés.
      await setup(h, 'gfs');
      gfs().ranger = { erreurs: { 2: { code: 'GFS_ANNULE', message: 'Création de la table refusée.' } } };
      spy = downloadSpy();
      report = await PdfDelivery.deliver(four(), spy.download);
      check(problems, 'accord refusé', { calls: gfs().rangerAppels.length, kept: keptNames(), downloads: spy.calls, stopped: report.stopped, skipped: report.skipped }, { calls: 2, kept: ['A.pdf'], downloads: [['B', 'C', 'D']], stopped: 'GFS_ANNULE', skipped: 2 });
      check(problems, 'sa phrase', PdfDelivery.describe(report, 0), { text: '1 PDF rangé dans GFS.', note: 'GFS n’a pas gardé 3 PDF (la table des fichiers n’a pas été créée) : téléchargés.' });
      // Un GFS d'avant la consigne 043 : tout est téléchargé, d'un coup, et un seul appel part.
      await setup(h, 'gfs');
      gfs().ranger = null;
      spy = downloadSpy();
      report = await PdfDelivery.deliver(four(), spy.download);
      check(problems, 'GFS ancien', { calls: gfs().calls.filter(c => c.nom === 'ranger').length, downloads: spy.calls, stopped: report.stopped, delivered: Array.from(report.delivered).sort((a, b) => a - b) }, { calls: 1, downloads: ['all'], stopped: 'GFS_INCONNU', delivered: [0, 1, 2, 3] });
      check(problems, 'sa phrase', PdfDelivery.describe(report, 0), { text: '', note: 'GFS n’a pas gardé 4 PDF (cette version de GFS ne range pas encore les fichiers) : téléchargés.' });
      // « Les deux » : le téléchargement d'office est tout, et la note ne dit pas « téléchargés ».
      await setup(h, 'both');
      gfs().ranger = { erreur: { code: 'GFS_REFUSE', message: 'Ce fichier n’est pas un PDF.' } };
      spy = downloadSpy();
      report = await PdfDelivery.deliver(filesOf(['A']), spy.download);
      check(problems, 'les deux, refus', { downloads: spy.calls, fellBack: report.fellBack, said: PdfDelivery.describe(report, 0) }, { downloads: ['all'], fellBack: false, said: { text: '', note: 'GFS n’a pas gardé 1 PDF (Ce fichier n’est pas un PDF).' } });
      finish();
      return verdict(problems, {});
    },
  });

  // --- 5) les phrases ---
  cases.push({
    id: 'pdfshelve_status_sentences_in_french_and_english',
    description: 'Les phrases du coin d’état pour un PDF (rangé, remplacé, copié, refusé), pour plusieurs (rangés, remplacés, gardés en double, non rangés, échecs) et pour ce que GFS n’a pas gardé, en français et en anglais',
    run: async () => {
      const problems = [];
      const base = { shelved: true, total: 1, counts: { ajoute: 0, remplace: 0, copie: 0, ignore: 0 }, copies: [], failed: [], skipped: 0, stopped: '', downloaded: 0, fellBack: false, delivered: new Set([0]) };
      const one = (status, copies) => Object.assign({}, base, { counts: Object.assign({}, base.counts, { [status]: 1 }), copies: copies || [] });
      const many = (counts, extra) => Object.assign({}, base, { total: 12, counts }, extra || {});
      const lost = (code, message, extra) => Object.assign({}, base, { failed: [{ index: 0, code, message }], fellBack: true, downloaded: 1 }, extra || {});
      const say = (report, rows) => PdfDelivery.describe(report, rows);
      const fr = {
        ajoute: say(one('ajoute')).text, remplace: say(one('remplace')).text, copie: say(one('copie', ['Facture (1).pdf'])).text, ignore: say(one('ignore')).text,
        many: say(many({ ajoute: 9, remplace: 2, copie: 1, ignore: 0 })).text, manyAll: say(many({ ajoute: 12, remplace: 0, copie: 0, ignore: 0 })).text,
        manyFailed: say(many({ ajoute: 10, remplace: 0, copie: 0, ignore: 0 }), 2).text, manyIgnored: say(many({ ajoute: 0, remplace: 0, copie: 0, ignore: 12 })).text,
        echec: say(lost('GFS_ECHEC', 'Pas de réponse du serveur.')).note, annule: say(lost('GFS_ANNULE', '')).note, inconnu: say(lost('GFS_INCONNU', 'appel inconnu : ranger')).note, reponse: say(lost('GFS_REPONSE', 'x')).note, vide: say(lost('', '')).note,
        none: say(Object.assign({}, base, { shelved: false })), nothing: say(null),
      };
      check(problems, 'français', fr, {
        ajoute: 'PDF rangé dans GFS.', remplace: 'PDF rangé dans GFS, à la place de l’ancien.', copie: 'PDF rangé dans GFS sous le nom « Facture (1).pdf ».', ignore: 'PDF non rangé : annulé dans GFS.',
        many: '12 PDF rangés dans GFS (2 remplacés, 1 gardé en double).'.replace('12', '12'), manyAll: '12 PDF rangés dans GFS.', manyFailed: '10 PDF rangés dans GFS, 2 échecs.', manyIgnored: '12 non rangés (annulé dans GFS).',
        echec: 'GFS n’a pas gardé 1 PDF (Pas de réponse du serveur) : téléchargé.', annule: 'GFS n’a pas gardé 1 PDF (la table des fichiers n’a pas été créée) : téléchargé.',
        inconnu: 'GFS n’a pas gardé 1 PDF (cette version de GFS ne range pas encore les fichiers) : téléchargé.', reponse: 'GFS n’a pas gardé 1 PDF (réponse illisible) : téléchargé.', vide: 'GFS n’a pas gardé 1 PDF (raison inconnue) : téléchargé.',
        none: { text: '', note: '' }, nothing: { text: '', note: '' },
      });
      I18n.setLang('en');
      const en = {
        ajoute: say(one('ajoute')).text, remplace: say(one('remplace')).text, copie: say(one('copie', ['Invoice (1).pdf'])).text, ignore: say(one('ignore')).text,
        many: say(many({ ajoute: 9, remplace: 2, copie: 1, ignore: 0 })).text, manyOne: say(many({ ajoute: 1, remplace: 0, copie: 1, ignore: 0 })).text, manyFailed: say(many({ ajoute: 10, remplace: 0, copie: 0, ignore: 0 }), 2).text,
        annule: say(lost('GFS_ANNULE', '')).note, three: say(lost('GFS_INCONNU', '', { failed: [{ index: 0, code: 'GFS_INCONNU', message: '' }], skipped: 2, stopped: 'GFS_INCONNU' })).note,
      };
      I18n.setLang('fr');
      check(problems, 'anglais', en, {
        ajoute: 'PDF saved to GFS.', remplace: 'PDF saved to GFS, replacing the old one.', copie: 'PDF saved to GFS as “Invoice (1).pdf”.', ignore: 'PDF not saved: canceled in GFS.',
        many: '12 PDFs saved to GFS (2 replaced, 1 kept as a copy).', manyOne: '2 PDFs saved to GFS (1 kept as a copy).', manyFailed: '10 PDFs saved to GFS, 2 failures.',
        annule: 'GFS did not keep 1 PDF (the files table was not created): downloaded instead.', three: 'GFS did not keep 3 PDFs (this version of GFS cannot save files yet): downloaded instead.',
      });
      return verdict(problems, {});
    },
  });

  // --- 6) le menu ---
  const FLYOUT = '#v2-export-pdf-flyout';
  const destRow = value => document.querySelector(FLYOUT + ' .v2-hover-row[data-destination="' + value + '"]');
  const destRows = () => ['download', 'gfs', 'both'].map(destRow);
  const hiddenIn = el => el.closest('[hidden]') !== null;
  const greyed = row => row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === 'true';
  const live = row => !row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === null;
  const activeValue = () => destRows().filter(r => r.getAttribute('aria-checked') === 'true').map(r => r.dataset.destination);
  const syncMenus = () => byId('v2-export-pdf-group').dispatchEvent(new Event('mouseenter'));
  const typeSelect = () => byId('v2-export-type');
  async function pickType(type) { typeSelect().value = type; syncMenus(); await sleep(20); }

  cases.push({
    id: 'pdfshelve_menu_shows_three_rows_for_the_two_pdf_types_only',
    description: 'Le menu Exporter porte « Destination du PDF » et ses trois lignes à cocher (Télécharger, Ranger dans GFS, Télécharger et ranger dans GFS), montrées pour PDF et PDF protégé seulement (cachées pour Word, Markdown, HTML), avec leurs noms français et anglais, leur rôle de case à cocher et le focus au clavier ; la ligne cochée est la destination qui s’applique, et le menu Type d’export n’en porte aucune',
    run: async (h) => {
      await setup(h);
      const problems = [];
      await pickType('pdf');
      const label = document.querySelector(FLYOUT + ' .v2-hover-flyout-label[data-i18n="destination.label"]');
      check(problems, 'PDF : l’intitulé et les trois lignes sont montrés', [destRows().map(r => !!r && !hiddenIn(r)), !hiddenIn(label), label.textContent, destRows().map(r => r.textContent)], [[true, true, true], true, 'Destination du PDF', ['Télécharger', 'Ranger dans GFS', 'Télécharger et ranger dans GFS']]);
      check(problems, 'PDF : la ligne cochée, sans choix', activeValue(), ['download']);
      check(problems, 'des cases à cocher comme les options de lignes du même menu : rôle, focus au clavier, coche devant, une seule cochée',
        [destRows().map(r => r.getAttribute('role')), destRows().map(r => r.getAttribute('tabindex')), destRows().map(r => r.getAttribute('aria-checked')), destRows().map(r => r.classList.contains('v2-hover-row-check-start'))],
        [['menuitemradio', 'menuitemradio', 'menuitemradio'], ['0', '0', '0'], ['true', 'false', 'false'], [true, true, true]]);
      check(problems, 'le menu Type d’export (déjà plein dans un panneau de 400 px) ne porte aucune ligne de destination', document.querySelectorAll('#v2-quality-flyout [data-destination]').length, 0);
      await pickType('pdfProtected');
      check(problems, 'PDF protégé : montrées', destRows().map(r => !hiddenIn(r)), [true, true, true]);
      const hidden = {};
      for (const type of ['docx', 'md', 'html', 'htmlFragment']) { await pickType(type); hidden[type] = destRows().map(hiddenIn); }
      check(problems, 'Word, Markdown, HTML : cachées', hidden, { docx: [true, true, true], md: [true, true, true], html: [true, true, true], htmlFragment: [true, true, true] });
      await pickType('pdf');
      PdfDelivery.choose('both');
      syncMenus();
      check(problems, 'la ligne cochée suit le choix gardé', activeValue(), ['both']);
      I18n.setLang('en');
      const english = destRows().map(r => I18n.t(r.getAttribute('data-i18n')));
      check(problems, 'anglais', [english, I18n.t('destination.label')], [['Download', 'Save to GFS', 'Download and save to GFS'], 'PDF destination']);
      finish();
      await pickType('pdf');
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfshelve_menu_greys_the_rows_that_shelve_without_gfs_and_a_click_explains',
    description: 'Sans GFS qui répond (un GFS muet, ou l’app seule), « Ranger dans GFS » et « Télécharger et ranger dans GFS » sont grisées (jamais retirées) avec leur raison en info-bulle, « Télécharger » reste active ; le clic sur une ligne grisée ouvre la fenêtre commune qui dit qu’il faut Grist Factory Suite, ne choisit rien et ne laisse pas de pas d’Annuler',
    run: async (h) => {
      await setup(h);
      const problems = [];
      await pickType('pdf');
      syncMenus();
      check(problems, 'avec GFS : rien de grisé', destRows().map(live), [true, true, true]);
      const realAnswering = GfsLink.isAnswering;
      const realNotice = Dialogs.notice;
      const notices = [];
      Dialogs.notice = async options => { notices.push({ title: options.title, message: options.message, closeLabel: options.closeLabel }); };
      const stepsBefore = ActionHistory.count();
      try {
        GfsLink.isAnswering = () => false;
        PdfDelivery.choose('gfs');
        syncMenus();
        check(problems, 'GFS muet : grisées', [greyed(destRow('gfs')), greyed(destRow('both')), live(destRow('download'))], [true, true, true]);
        check(problems, 'raison en info-bulle', [destRow('gfs').title, destRow('both').title, destRow('download').hasAttribute('title')], ['Disponible dans Grist Factory Suite', 'Disponible dans Grist Factory Suite', false]);
        check(problems, 'la ligne active est celle qui s’applique', activeValue(), ['download']);
        destRow('gfs').click(); await sleep(40);
        destRow('both').click(); await sleep(40);
        destRow('download').click(); await sleep(40);
        check(problems, 'la fenêtre qui explique, deux fois', notices.map(n => [n.title, n.message]), [
          ['Cette fonction demande Grist Factory Suite', I18n.t('destination.off.message')],
          ['Cette fonction demande Grist Factory Suite', I18n.t('destination.off.message')],
        ]);
        check(problems, 'le choix gardé n’a pas changé (« Télécharger » reste le choix qui s’applique, il est déjà gardé)', PersonStore.get(KEY), 'download');
      } finally {
        GfsLink.isAnswering = realAnswering;
        Dialogs.notice = realNotice;
      }
      check(problems, 'seul le clic sur « Télécharger » a laissé un pas', ActionHistory.count() - stepsBefore, 1);
      finish();
      syncMenus();
      return verdict(problems, { notices: notices.length });
    },
  });

  cases.push({
    id: 'pdfshelve_menu_choice_is_kept_for_the_person_and_undone_by_ctrl_z',
    description: 'Un clic sur « Ranger dans GFS » garde le choix pour la personne (pp_export_destination), allume la ligne et fait UN pas d’Annuler : Ctrl + Z rend « Télécharger » et le dit au coin d’état, Ctrl + Y remet « Ranger dans GFS » ; choisir ce qui est déjà choisi ne laisse pas de pas, et un choix changé depuis n’est jamais écrasé',
    run: async (h) => {
      await setup(h);
      const problems = [];
      await pickType('pdf');
      const said = value => I18n.t('status.settingSet', { setting: 'Destination du PDF', value });
      const press = async key => { ed().commands.focus('end'); await sleep(60); ed().view.dom.dispatchEvent(keyEvent(key)); await ActionHistory.whenIdle(); await sleep(120); };
      ActionHistory.reset();
      destRow('download').click(); await sleep(30);
      check(problems, 'choisir l’existant ne laisse pas de pas', ActionHistory.count(), 0);
      destRow('gfs').click(); await sleep(30);
      check(problems, 'le choix gardé', [PersonStore.get(KEY), PdfDelivery.destination(), activeValue(), ActionHistory.count()], ['gfs', 'gfs', ['gfs'], 1]);
      destRow('both').click(); await sleep(30);
      check(problems, 'un second choix', [PersonStore.get(KEY), activeValue(), ActionHistory.count()], ['both', ['both'], 2]);
      await press('z');
      syncMenus();
      check(problems, 'Ctrl + Z rend « Ranger dans GFS »', [PersonStore.get(KEY), activeValue(), statusText()], ['gfs', ['gfs'], said('Ranger dans GFS')]);
      await press('z');
      syncMenus();
      check(problems, 'Ctrl + Z encore rend « Télécharger »', [PersonStore.get(KEY), activeValue(), statusText()], ['download', ['download'], said('Télécharger')]);
      await press('y');
      syncMenus();
      check(problems, 'Ctrl + Y remet « Ranger dans GFS »', [PersonStore.get(KEY), activeValue(), statusText()], ['gfs', ['gfs'], said('Ranger dans GFS')]);
      // Un choix changé depuis (un autre onglet) n'est jamais écrasé : Ctrl + Y voudrait poser « les deux » sur autre chose que ce que le pas a laissé.
      PdfDelivery.choose('download');
      await press('y');
      check(problems, 'un choix changé depuis n’est pas écrasé', PersonStore.get(KEY), 'download');
      finish();
      ActionHistory.reset();
      syncMenus();
      return verdict(problems, { status: statusText() });
    },
  });

  cases.push({
    id: 'pdfshelve_menu_rows_answer_enter_and_space_and_a_greyed_row_explains_to_the_keyboard',
    description: 'Une ligne de destination qui a le focus se coche par Entrée ou Espace (un pas d’Annuler chacune, l’évènement est pris), une autre touche ne fait rien ; sans GFS qui répond, Entrée sur « Ranger dans GFS » ouvre la fenêtre qui explique, ne coche rien et ne laisse pas de pas',
    run: async (h) => {
      await setup(h);
      const problems = [];
      await pickType('pdf');
      const press = (row, key) => { row.focus(); const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); row.dispatchEvent(event); return event.defaultPrevented; };
      ActionHistory.reset();
      const enterTaken = press(destRow('both'), 'Enter'); await sleep(60);
      check(problems, 'Entrée sur « Télécharger et ranger dans GFS »', [enterTaken, PersonStore.get(KEY), activeValue(), ActionHistory.count()], [true, 'both', ['both'], 1]);
      const spaceTaken = press(destRow('download'), ' '); await sleep(60);
      check(problems, 'Espace sur « Télécharger »', [spaceTaken, PersonStore.get(KEY), activeValue(), ActionHistory.count()], [true, 'download', ['download'], 2]);
      const letterTaken = press(destRow('gfs'), 'a'); await sleep(60);
      check(problems, 'une autre touche ne fait rien', [letterTaken, PersonStore.get(KEY), activeValue(), ActionHistory.count()], [false, 'download', ['download'], 2]);
      const realAnswering = GfsLink.isAnswering;
      const realNotice = Dialogs.notice;
      const notices = [];
      Dialogs.notice = async options => { notices.push(options.title); };
      try {
        GfsLink.isAnswering = () => false;
        syncMenus();
        press(destRow('gfs'), 'Enter'); await sleep(60);
      } finally {
        GfsLink.isAnswering = realAnswering;
        Dialogs.notice = realNotice;
      }
      check(problems, 'sans GFS, Entrée sur la ligne grisée explique et ne coche rien', [notices, PersonStore.get(KEY), ActionHistory.count()], [['Cette fonction demande Grist Factory Suite'], 'download', 2]);
      finish();
      ActionHistory.reset();
      syncMenus();
      return verdict(problems, {});
    },
  });

  // --- 7) les vrais exports ---
  async function seed(h) {
    await h.resetEditor();
    gristStub().setVariables(TABLE, { Nom: 'Text' });
    gristStub().setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    gristStub().fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
    Editor.setHeaderFooterData(NO_HF);
    await sleep(80);
  }
  // Clique la VRAIE ligne du menu et attend `until` : les téléchargements (le <a download> intercepté, et le download de pdfmake), les messages d'état de tout l'export, les dates écrites.
  async function runExport(h, rowId, until, options) {
    const o = options || {};
    const downloads = [];
    const stamps = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const origStamp = ExportDate.stamp;
    const dialogs = h.stubDialogs({ confirm: () => true });
    await PdfExport.ensurePdfLibsLoaded();
    const origCreatePdf = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (docDefinition) {
      const generated = origCreatePdf.call(window.pdfMake, docDefinition);
      generated.download = function (name) { generated.getBlob(blob => downloads.push({ name, blob })); };
      return generated;
    };
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return undefined; }
      return origClick.call(this);
    };
    ExportDate.stamp = async (table, ids) => { stamps.push({ table, ids: Array.from(ids) }); return null; };
    const statusEl = byId('status-msg');
    const statuses = [];
    const observer = new MutationObserver(() => { if (statuses[statuses.length - 1] !== statusEl.textContent) statuses.push(statusEl.textContent); });
    observer.observe(statusEl, { childList: true, characterData: true, subtree: true });
    try {
      byId(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!until() && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(o.settle === undefined ? 120 : o.settle);
    } finally {
      observer.disconnect();
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
      window.pdfMake.createPdf = origCreatePdf;
      ExportDate.stamp = origStamp;
    }
    return { downloads, stamps, statuses, status: statusText(), error: statusIsError() };
  }
  // La fin de l'export : le dernier message d'état n'est plus un message de progression.
  const done = pattern => () => pattern.test(statusText());
  const pdfPages = async (h, blob) => {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    return pdf.numPages;
  };

  cases.push({
    id: 'pdfshelve_single_pdf_export_is_shelved_with_its_download_name_and_dates_the_row_when_it_went_somewhere',
    description: 'Le vrai bouton Exporter, PDF d’une ligne : « Télécharger » ne change rien (le PDF part comme avant, aucun appel à GFS) ; « Ranger dans GFS » donne à GFS un vrai PDF sous le nom du téléchargement et ne télécharge rien (coin d’état « PDF rangé dans GFS. », ligne datée) ; « les deux » fait les deux ; « Annuler » chez GFS ne date pas la ligne ; un GFS qui refuse fait télécharger le PDF avec sa raison en rouge',
    run: async (h) => {
      const problems = [];
      await seed(h);
      await setup(h);
      await seed(h);
      // Comme avant : le téléchargement seul.
      const plain = await runExport(h, 'btn-export-pdf', () => true, { settle: 1500 });
      const baseline = plain.downloads[0];
      check(problems, 'Télécharger : un PDF téléchargé, rien chez GFS, la ligne datée', [plain.downloads.length, gfs().calls.filter(c => c.nom === 'ranger').length, plain.stamps, plain.status], [1, 0, [{ table: TABLE, ids: [1] }], 'PDF généré.']);
      // Ranger dans GFS.
      PdfDelivery.choose('gfs');
      const shelved = await runExport(h, 'btn-export-pdf', done(/rangé dans GFS\.$/));
      const kept = gfs().fichiers[0];
      check(problems, 'Ranger : rien n’est téléchargé', shelved.downloads.length, 0);
      check(problems, 'Ranger : le fichier de GFS', [gfs().fichiers.length, kept && kept.nom, kept && String.fromCharCode.apply(null, Array.from(kept.octets.slice(0, 5))), baseline && baseline.name], [1, baseline.name, '%PDF-', baseline.name]);
      check(problems, 'Ranger : l’appel', [gfs().rangerAppels[0].instance, gfs().rangerAppels[0].type, gfs().rangerAppels[0].suivants, gfs().rangerAppels[0].lot, gfs().rangerAppels[0].dossier], ['File', 'application/pdf', 0, undefined, undefined]);
      check(problems, 'Ranger : le coin d’état et la date', [shelved.status, shelved.error, shelved.stamps, shelved.statuses.filter(s => /Rangement/.test(s))], ['PDF rangé dans GFS.', '', [{ table: TABLE, ids: [1] }], ['Rangement dans GFS…']]);
      // Les deux : le même nom est pris, GFS répond « Garder les deux ».
      PdfDelivery.choose('both');
      const both = await runExport(h, 'btn-export-pdf', done(/rangé dans GFS sous le nom .+ PDF généré\.$/));
      check(problems, 'Les deux : un téléchargement ET une copie', [both.downloads.length, both.downloads[0] && both.downloads[0].name, keptNamesOf(), both.status], [1, baseline.name, [baseline.name, baseline.name.replace(/\.pdf$/, '') + ' (1).pdf'], 'PDF rangé dans GFS sous le nom « ' + baseline.name.replace(/\.pdf$/, '') + ' (1).pdf ». PDF généré.']);
      check(problems, 'Les deux : le fichier téléchargé est un vrai PDF', both.downloads[0] && both.downloads[0].blob && (await pdfPages(h, both.downloads[0].blob)) >= 1, true);
      // « Annuler » chez GFS, rangé seul : ni fichier ni téléchargement, et la ligne n'est pas datée.
      PdfDelivery.choose('gfs');
      gfs().ranger = { quandPris: 'ignore' };
      const refused = await runExport(h, 'btn-export-pdf', done(/non rangé/));
      check(problems, 'Annuler chez GFS : rien nulle part, pas de date', [refused.downloads.length, gfs().fichiers.length, refused.stamps, refused.status], [0, 2, [], 'PDF non rangé : annulé dans GFS.']);
      // Un GFS qui refuse : le PDF est téléchargé comme avant, la raison en tête et en rouge, la ligne datée.
      gfs().ranger = { erreur: { code: 'GFS_ECHEC', message: 'Le serveur Grist ne répond pas.' } };
      const failed = await runExport(h, 'btn-export-pdf', done(/PDF généré\.$/));
      check(problems, 'GFS en échec : téléchargé, raison en rouge, date écrite', [failed.downloads.length, failed.status, failed.error, failed.stamps], [1, 'GFS n’a pas gardé 1 PDF (Le serveur Grist ne répond pas) : téléchargé. PDF généré.', 'error-msg', [{ table: TABLE, ids: [1] }]]);
      finish();
      return verdict(problems, { baseline: baseline && baseline.name });
    },
  });
  const keptNamesOf = () => gfs().fichiers.map(f => f.nom);

  cases.push({
    id: 'pdfshelve_zip_export_shelves_each_pdf_alone_under_one_lot_and_dates_only_the_rows_that_left',
    description: 'L’export de toutes les lignes (archive ZIP) : « Ranger dans GFS » donne chaque PDF SEUL (le nom de son entrée de l’archive), sous un même lot, `suivants` 2, 1, 0, un à un, et ne fabrique pas d’archive ; « les deux » télécharge l’archive ET range ; un échec isolé télécharge une archive des seuls PDF non gardés ; les lignes refusées chez GFS ne sont pas datées',
    run: async (h) => {
      const problems = [];
      await setup(h);
      await seed(h);
      const plain = await runExport(h, 'v2-btn-export-pdf-batch', () => true, { settle: 2500 });
      const zipOrder = Object.keys((await JSZip.loadAsync(await plain.downloads[0].blob.arrayBuffer())).files);
      const zipNames = zipOrder.slice().sort();
      check(problems, 'Télécharger : l’archive comme avant', [plain.downloads.map(d => d.name), zipNames.length, gfs().calls.filter(c => c.nom === 'ranger').length, plain.stamps[0] && plain.stamps[0].ids, plain.status], [[TABLE + '-export-pdf.zip'], 3, 0, [1, 2, 3], '3 PDF générés — archive ZIP téléchargée.']);
      // Ranger dans GFS seul.
      PdfDelivery.choose('gfs');
      gfs().ranger = { delai: 20 };
      const shelved = await runExport(h, 'v2-btn-export-pdf-batch', done(/rangés dans GFS\.$/));
      const calls = gfs().rangerAppels;
      check(problems, 'Ranger : pas d’archive, trois PDF', [shelved.downloads.length, keptNamesOf().slice().sort(), gfs().rangerMax], [0, zipNames, 1]);
      check(problems, 'Ranger : le lot et les suivants', [new Set(calls.map(c => c.lot)).size, /^PsClients-\d+$/.test(calls[0].lot), calls.map(c => c.suivants), calls.map(c => c.instance + ' ' + c.type)], [1, true, [2, 1, 0], ['File application/pdf', 'File application/pdf', 'File application/pdf']]);
      check(problems, 'Ranger : le coin d’état, les dates, la progression', [shelved.status, shelved.stamps[0] && shelved.stamps[0].ids, shelved.statuses.filter(s => /Rangement/.test(s))], ['3 PDF rangés dans GFS.', [1, 2, 3], ['Rangement dans GFS : 1/3…', 'Rangement dans GFS : 2/3…', 'Rangement dans GFS : 3/3…']]);
      // Les deux : les noms sont pris, GFS garde les deux ; l'archive est téléchargée.
      PdfDelivery.choose('both');
      gfs().ranger = { quandPris: 'copie' };
      const both = await runExport(h, 'v2-btn-export-pdf-batch', done(/archive ZIP téléchargée\.$/));
      check(problems, 'Les deux : l’archive ET trois copies', [both.downloads.map(d => d.name), keptNamesOf().length, both.status], [[TABLE + '-export-pdf.zip'], 6, '3 PDF rangés dans GFS (3 gardés en double). 3 PDF générés — archive ZIP téléchargée.']);
      // Un échec isolé (le deuxième PDF) : GFS garde deux PDF, l'archive téléchargée ne contient que le deuxième.
      PdfDelivery.choose('gfs');
      gfs().fichiers = [];
      gfs().rangerAppels = [];
      gfs().ranger = { erreurs: { 2: { code: 'GFS_ECHEC', message: 'Le serveur Grist ne répond pas.' } } };
      const failing = await runExport(h, 'v2-btn-export-pdf-batch', done(/archive ZIP téléchargée\.$/));
      const partial = failing.downloads[0] ? Object.keys((await JSZip.loadAsync(await failing.downloads[0].blob.arrayBuffer())).files) : [];
      check(problems, 'Échec isolé : l’archive ne garde que le PDF non rangé', [partial, keptNamesOf().length, failing.stamps[0] && failing.stamps[0].ids], [[zipOrder[1]], 2, [1, 2, 3]]);
      check(problems, 'Échec isolé : la raison en tête, en rouge', [failing.status.indexOf('GFS n’a pas gardé 1 PDF (Le serveur Grist ne répond pas) : téléchargé. 2 PDF rangés dans GFS.'), failing.error], [0, 'error-msg']);
      // Refus de la personne pour un nom : la ligne dont le PDF n'est parti nulle part n'est pas datée.
      gfs().rangerAppels = [];
      gfs().fichiers = [{ id: 90, nom: zipOrder[1], taille: 9, octets: new Uint8Array(9), lot: 'x' }];
      gfs().ranger = { quandPris: 'ignore' };
      const partlyRefused = await runExport(h, 'v2-btn-export-pdf-batch', done(/dans GFS/));
      check(problems, 'Un refus : une ligne sur trois non datée', [partlyRefused.downloads.length, partlyRefused.stamps[0] && partlyRefused.stamps[0].ids, partlyRefused.status], [0, [1, 3], '2 PDF rangés dans GFS, 1 non rangé (annulé dans GFS).']);
      finish();
      return verdict(problems, { zipNames });
    },
  });

  cases.push({
    id: 'pdfshelve_merged_pdf_and_sheets_are_shelved_as_one_file',
    description: 'Le PDF réuni (« Toutes les lignes de la vue en un seul PDF ») et l’assemblage avant impression sont rangés comme UN fichier (`<table>-export.pdf`, `<table>-assemblage.pdf`, sans lot), de vrais PDF de trois pages pour le premier, et téléchargés aussi avec « les deux » ; un seul appel part',
    run: async (h) => {
      const problems = [];
      await setup(h);
      await seed(h);
      PdfDelivery.choose('gfs');
      const merged = await runExport(h, 'v2-btn-export-pdf-merged', done(/rangé dans GFS\.$/));
      const file = gfs().fichiers[0];
      const pages = file ? await pdfPages(h, new Blob([file.octets], { type: 'application/pdf' })) : 0;
      check(problems, 'Réuni : un seul PDF rangé', [merged.downloads.length, keptNamesOf(), pages, gfs().rangerAppels.map(c => [c.lot, c.suivants])], [0, [TABLE + '-export.pdf'], NAMES.length, [[undefined, 0]]]);
      check(problems, 'Réuni : le coin d’état et les dates', [merged.status, merged.stamps[0] && merged.stamps[0].ids], ['PDF rangé dans GFS.', [1, 2, 3]]);
      // Les deux, avec un nom pris : le PDF réuni est téléchargé et gardé en double.
      PdfDelivery.choose('both');
      const both = await runExport(h, 'v2-btn-export-pdf-merged', done(/fichier téléchargé\.$/));
      check(problems, 'Réuni, les deux', [both.downloads.map(d => d.name), keptNamesOf(), both.status], [[TABLE + '-export.pdf'], [TABLE + '-export.pdf', TABLE + '-export (1).pdf'], 'PDF rangé dans GFS sous le nom « ' + TABLE + '-export (1).pdf ». 3 lignes réunies dans un seul PDF — fichier téléchargé.']);
      // L'assemblage sur planches : la fenêtre de réglage répond une grille 2 x 2 sur A4.
      const realOpen = SheetAssemblyDialog.open;
      SheetAssemblyDialog.open = async () => ({ layout: SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 2, rows: 2, marks: false }) });
      PdfDelivery.choose('gfs');
      gfs().fichiers = [];
      gfs().rangerAppels = [];
      let sheets;
      try { sheets = await runExport(h, 'v2-btn-export-pdf-sheets', done(/rangé dans GFS\.$/)); } finally { SheetAssemblyDialog.open = realOpen; }
      check(problems, 'Assemblage : un PDF de planches rangé', [sheets.downloads.length, keptNamesOf(), gfs().fichiers[0] ? String.fromCharCode.apply(null, Array.from(gfs().fichiers[0].octets.slice(0, 5))) : '', sheets.status, sheets.stamps[0] && sheets.stamps[0].ids], [0, [TABLE + '-assemblage.pdf'], '%PDF-', 'PDF rangé dans GFS.', [1, 2, 3]]);
      finish();
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfshelve_only_pdf_exports_are_shelved_and_a_download_only_choice_never_calls_gfs',
    description: 'Le Word, le Markdown, le HTML et l’impression par le navigateur ne se rangent jamais, quelle que soit la destination ; « Télécharger » n’appelle jamais `ranger` (le chemin d’avant, octet pour octet)',
    run: async (h) => {
      const problems = [];
      await setup(h, 'gfs');
      await seed(h);
      const calls = () => gfs().calls.filter(c => c.nom === 'ranger').length;
      typeSelect().value = 'docx';
      const docx = await runExport(h, 'btn-export-pdf', () => false, { settle: 2500 });
      typeSelect().value = 'md';
      const md = await runExport(h, 'btn-export-pdf', () => false, { settle: 1500 });
      typeSelect().value = 'pdf';
      check(problems, 'Word et Markdown : téléchargés, jamais rangés', [docx.downloads.map(d => /\.docx$/.test(d.name)), md.downloads.map(d => /\.md$/.test(d.name)), calls()], [[true], [true], 0]);
      PdfDelivery.choose('download');
      const plain = await runExport(h, 'btn-export-pdf', () => false, { settle: 2000 });
      check(problems, 'Télécharger : aucun appel à GFS', [plain.downloads.length, calls(), plain.status], [1, 0, 'PDF généré.']);
      finish();
      typeSelect().value = 'pdf';
      syncMenus();
      return verdict(problems, {});
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfShelve = cases;
})();
