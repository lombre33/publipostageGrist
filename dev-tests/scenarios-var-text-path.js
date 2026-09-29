// Suite "varTextPath" - chemins de références dans les champs texte : Objet, À, Cc, Cci du mode email et nom du fichier PDF (retour d'Antoine du 2026-09-29,
// carte « Oui, l'ajouter » : #Projet.Accompagnateur.Email doit se résoudre là aussi, comme dans le corps du modèle - cf. scenarios-var-path.js). Ces champs sont
// de simples <input> sans bulle : Variables.findTextVariables scanne le texte, une clé de colonne Référence se prolonge par « .Colonne » de la ligne qu'elle
// désigne, et le reste (fin de phrase, « .pdf ») demeure du texte. Un seul scan pour tous les champs (Variables.resolveTextVariables, ReaderMode.resolveFilename).
(function () {
  const cases = [];

  const RECORD_1 = { id: 1, Titre: 'Notif 1', Projet: 'Projet Alpha' };
  const RECORD_2 = { id: 2, Titre: 'Notif 2', Projet: 'Projet Beta' };
  const PAGE = 'TpNotifications';

  // La page est sur TpNotifications, dont Projet est une Référence vers TpProjet (liée par sa règle, seule règle du document). TpProjet a DEUX Références vers
  // le même annuaire (Accompagnateur, Porteur) ; l'annuaire a lui-même une Référence (Service). Aucune règle pour l'annuaire ni pour les services.
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('TpServices', { Nom: 'Text' });
    stub.setRows('TpServices', [{ id: 3, Nom: 'Juridique' }, { id: 4, Nom: 'Fiscal' }]);
    stub.setVariables('TpAnnuaire', { NomPrenom: 'Text', Email: 'Text', Service: 'Ref:TpServices', gristHelper_Display: 'Text' }, null, { Service: 'gristHelper_Display' });
    stub.setRows('TpAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Email: 'jean.dupont@ex.fr', Service: 3, gristHelper_Display: 'Juridique' },
      { id: 8, NomPrenom: 'Martin Anne', Email: 'anne.martin@ex.fr', Service: 0, gristHelper_Display: '' },
      // Une adresse avec un caractère interdit dans un nom de fichier : le nom du PDF le remplace, le champ À le garde tel quel.
      { id: 9, NomPrenom: 'Durand Paul', Email: 'durand:paul@ex.fr', Service: 4, gristHelper_Display: 'Fiscal' },
    ]);
    stub.setVariables('TpProjet', {
      Nom: 'Text', Statut: 'Text', Accompagnateur: 'Ref:TpAnnuaire', Porteur: 'Ref:TpAnnuaire', gristHelper_Display: 'Text', gristHelper_Display2: 'Text',
    }, null, { Accompagnateur: 'gristHelper_Display', Porteur: 'gristHelper_Display2' });
    stub.setRows('TpProjet', [
      { id: 1, Nom: 'Projet Alpha', Statut: 'En cours', Accompagnateur: 7, Porteur: 8, gristHelper_Display: 'Dupont Jean', gristHelper_Display2: 'Martin Anne' },
      { id: 2, Nom: 'Projet Beta', Statut: 'Clos', Accompagnateur: 0, Porteur: 9, gristHelper_Display: '', gristHelper_Display2: 'Durand Paul' },
      // Accompagnateur 99 : la ligne référencée n'existe plus.
      { id: 3, Nom: 'Projet Gamma', Statut: 'En cours', Accompagnateur: 99, Porteur: 7, gristHelper_Display: '', gristHelper_Display2: 'Dupont Jean' },
    ]);
    stub.setVariables(PAGE, { Titre: 'Text', Projet: 'Ref:TpProjet', gristHelper_Display: 'Text' }, null, { Projet: 'gristHelper_Display' });
    stub.setRows(PAGE, [
      { id: 1, Titre: 'Notif 1', Projet: 1, gristHelper_Display: 'Projet Alpha' },
      { id: 2, Titre: 'Notif 2', Projet: 2, gristHelper_Display: 'Projet Beta' },
      { id: 3, Titre: 'Notif 3', Projet: 3, gristHelper_Display: 'Projet Gamma' },
    ]);
    await GristAPI.refreshSchema();
    for (const t of ['TpProjet', 'TpAnnuaire', 'TpServices']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('TpProjet', { mode: 'match', colonneCible: 'id', colonneSource: 'Projet' });
    window.__gristStub.fireRecord(Object.assign({}, RECORD_1), PAGE);
    await h.sleep(50);
  }

  const text = (value, record) => Variables.resolveTextVariables(value, PAGE, record || RECORD_1);
  const filename = (template, record) => ReaderMode.resolveFilename(template, PAGE, record || RECORD_1);

  cases.push({
    id: 'vartextpath_email_fields_resolve_a_reference_path',
    description: 'Objet, À, Cc et Cci : #TpProjet.Accompagnateur.Email donne l’email de l’accompagnateur du projet et #TpProjet.Porteur.Email celui du porteur (autre Référence vers le même annuaire), sans règle de liaison pour l’annuaire',
    run: async (h) => {
      await seed(h);
      const to = await text('#TpProjet.Accompagnateur.Email');
      const cc = await text('#TpProjet.Porteur.Email; #TpProjet.Accompagnateur.Email');
      const subject = await text('Suivi de #TpProjet.Nom par #TpProjet.Accompagnateur.NomPrenom.');
      const rules = ['TpAnnuaire', 'TpServices'].map(t => GristAPI.getLinkRule(t));
      const pass = to === 'jean.dupont@ex.fr' && cc === 'anne.martin@ex.fr; jean.dupont@ex.fr' && subject === 'Suivi de Projet Alpha par Dupont Jean.' && rules.every(r => !r);
      return { pass, notes: JSON.stringify({ to, cc, subject, rules }) };
    },
  });

  cases.push({
    id: 'vartextpath_two_hops_and_path_from_the_page_table',
    description: 'Un chemin de deux références (#TpProjet.Accompagnateur.Service.Nom) et un chemin qui part de la table de la page (#TpNotifications.Projet.Accompagnateur.Email) se résolvent aussi',
    run: async (h) => {
      await seed(h);
      const service = await text('#TpProjet.Accompagnateur.Service.Nom');
      const fromPage = await text('#TpNotifications.Projet.Accompagnateur.Email');
      const pass = service === 'Juridique' && fromPage === 'jean.dupont@ex.fr';
      return { pass, notes: JSON.stringify({ service, fromPage }) };
    },
  });

  cases.push({
    id: 'vartextpath_plain_keys_and_dots_of_the_text_are_unchanged',
    description: 'Une clé simple garde son sens (#TpProjet.Accompagnateur = le nom), et un point qui n’est pas suivi d’une colonne de la table atteinte reste du texte : fin de phrase, « .pdf », colonne inconnue, deux variables collées',
    run: async (h) => {
      await seed(h);
      const got = {
        reference: await text('#TpProjet.Accompagnateur'),
        sentence: await text('Projet #TpProjet.Nom.'),
        extension: await text('#TpProjet.Nom.pdf'),
        unknownColumn: await text('#TpProjet.Accompagnateur.Inconnue'),
        trailingDot: await text('#TpProjet.Accompagnateur.'),
        adjacent: await text('#TpProjet.Nom#TpProjet.Statut'),
        noVariable: await text('Bonjour, voir #inconnue.Email'),
      };
      const expected = {
        reference: 'Dupont Jean', sentence: 'Projet Projet Alpha.', extension: 'Projet Alpha.pdf', unknownColumn: 'Dupont Jean.Inconnue', trailingDot: 'Dupont Jean.',
        adjacent: 'Projet AlphaEn cours', noVariable: 'Bonjour, voir #inconnue.Email',
      };
      return { pass: JSON.stringify(got) === JSON.stringify(expected), notes: JSON.stringify({ got, expected }) };
    },
  });

  cases.push({
    id: 'vartextpath_empty_or_missing_reference_gives_empty_text',
    description: 'Une référence vide (accompagnateur non renseigné) ou vers une ligne disparue laisse la place vide, sans message d’erreur dans l’objet ni dans l’adresse ; même chose pour la ligne d’un export en lot (fetchTable)',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const template = 'A=#TpProjet.Accompagnateur.Email|P=#TpProjet.Porteur.Email';
      const live = [await text(template), await text(template, RECORD_2)];
      const batch = [];
      for (const row of rows) batch.push(await text(template, row));
      const pass = JSON.stringify(live) === JSON.stringify(['A=jean.dupont@ex.fr|P=anne.martin@ex.fr', 'A=|P=durand:paul@ex.fr'])
        && JSON.stringify(batch) === JSON.stringify(['A=jean.dupont@ex.fr|P=anne.martin@ex.fr', 'A=|P=durand:paul@ex.fr', 'A=|P=jean.dupont@ex.fr']);
      return { pass, notes: JSON.stringify({ live, batch }) };
    },
  });

  cases.push({
    id: 'vartextpath_pdf_filename_resolves_a_path_and_sanitizes',
    description: 'Le nom du PDF résout aussi #TpProjet.Accompagnateur.Email (le caractère interdit d’une valeur devient « _ »), pour la ligne affichée comme pour chaque ligne d’un export en lot ; un nom sans variable ne change pas',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const template = 'Suivi_#TpProjet.Porteur.Email';
      const live = [await filename(template), await filename(template, RECORD_2)];
      const batch = [];
      for (const row of rows) batch.push(await filename(template, row));
      const plain = await filename('Courrier');
      const empty = await filename('');
      const pass = JSON.stringify(live) === JSON.stringify(['Suivi_anne.martin@ex.fr', 'Suivi_durand_paul@ex.fr'])
        && JSON.stringify(batch) === JSON.stringify(['Suivi_anne.martin@ex.fr', 'Suivi_durand_paul@ex.fr', 'Suivi_jean.dupont@ex.fr']) && plain === 'Courrier' && empty === 'publipostage';
      return { pass, notes: JSON.stringify({ live, batch, plain, empty }) };
    },
  });

  cases.push({
    id: 'vartextpath_follows_the_configured_trigger_char',
    description: 'La touche de déclenchement choisie dans les Réglages vaut pour les chemins comme pour les clés simples, dans les champs email comme dans le nom du PDF',
    run: async (h) => {
      await seed(h);
      let storage = true;
      let viaText;
      let viaFilename;
      let leftover;
      try {
        localStorage.setItem('pp_trigger_char', '$');
        viaText = await text('$TpProjet.Accompagnateur.Email');
        viaFilename = await filename('Suivi_$TpProjet.Accompagnateur.Email');
        leftover = await text('#TpProjet.Nom');
      } catch (e) { storage = false; } finally {
        try { localStorage.removeItem('pp_trigger_char'); } catch (e) { /* rien à remettre */ }
      }
      const pass = storage && viaText === 'jean.dupont@ex.fr' && viaFilename === 'Suivi_jean.dupont@ex.fr' && leftover === '#TpProjet.Nom';
      return { pass, notes: JSON.stringify({ storage, viaText, viaFilename, leftover }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varTextPath = cases;
})();
