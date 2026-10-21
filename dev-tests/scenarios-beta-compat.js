// Suite "betaCompat" - le jeu figé de la compatibilité avec la bêta (21/10, étude « Compatibilité avec la bêta », carte « Le jeu figé et le labo avant l'envoi »).
// La bêta (grist-factory/Publipostage-Plus 9261da6, étiquette v1.0.0-beta.1) est déployée sur de nombreux documents : les modèles qu'elle a enregistrés doivent s'ouvrir, se modifier et
// s'exporter avec chaque version qui suit. `dev-tests/beta-compat-set.json` en garde une mesure légère, que rejouent les lots qui touchent l'éditeur (schéma, HTML enregistré) ou les exports
// (PDF, Word, e-mail) :
//  1) 90 des 2 637 textes HTML que les tests de la bêta passent à l'éditeur (chaque balise, attribut et style relevés, chacune des 85 séries de tests) : l'éditeur les relit et les réécrit
//     comme la bêta, au caractère près ; le tableau collé d'Excel à case fusionnée bordée est le seul écart voulu (la V1 pose le trait partagé sur les cases voisines) ;
//  2) 13 jeux d'en-tête et de pied de page : relus comme la bêta les relisait ;
//  3) les 13 modèles d'usage du 04/10 (facture, bulletin, badge, émargement et sa grille, quittance, fiche recette, bon de commande, étiquette, inventaire, bon de mouvement, e-mail de
//     réapprovisionnement, valorisation du stock en grille) : ouverts comme la bêta (HTML réécrit, en-tête et pied, marges), puis exportés SANS données (chaque bulle devient son texte,
//     « #Factures.Numero », chaque bloc conditionnel s'ouvre ; voir `withoutData`) : le PDF page par page (le texte de chaque ligne), le Word (chaque paragraphe, les tableaux, la page, l'en-tête
//     et le pied) et les lignes du lien « Créer l'email ».
// Les sorties de la section 3 sont celles de la V1 le jour du gel, pas celles de la bêta : elles ne disent pas que la V1 fait comme la bêta (ce qui change exprès est au CHANGELOG), elles
// disent que la V1 ne bouge pas sans qu'on le veuille. Un écart n'est pas forcément un défaut : le lot qui le cause le dit au CHANGELOG, puis refige (README, « Jeu figé de la bêta »).
// Ce que ce jeu ne voit pas (les données d'un vrai Grist : dates, boucles, liaisons de tables, lecture du document, Word converti en PDF) est mesuré par le labo avant chaque envoi au dépôt
// public (outils/depot-propre/README.md).
(function () {
  const cases = [];
  const SET_URL = 'dev-tests/beta-compat-set.json';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const CLOSED_HEADER_FOOTER = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const names = list => list.map(item => item.name);

  let setPromise = null;
  function loadSet() {
    if (!setPromise) {
      setPromise = fetch(SET_URL, { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error(SET_URL + ' : ' + response.status);
        return response.json();
      });
    }
    return setPromise;
  }

  // Où deux textes commencent à différer, avec un peu de contexte : une note situe l'écart, elle ne recopie pas 16 Ko.
  function firstDifference(got, want) {
    const a = String(got);
    const b = String(want);
    let at = 0;
    while (at < a.length && at < b.length && a[at] === b[at]) at++;
    const around = text => text.slice(Math.max(0, at - 40), at + 90);
    return { at, got: around(a), want: around(b), lengths: [a.length, b.length] };
  }

  // Les écarts d'une série de textes ou de listes de lignes : ceux du début, avec leur nombre.
  function verdict(mismatches, total) {
    return { pass: mismatches.length === 0, notes: mismatches.length ? mismatches.length + ' écart(s) sur ' + total + ' : ' + JSON.stringify(mismatches.slice(0, 3)) : total + ' relus à l\'identique' };
  }

  // La page telle que le widget la montre : l'éditeur sur l'aperçu A4 (la classe que le bouton « Aperçu format A4 » pose, jamais posée toute seule dans ce harnais). Le HTML qu'il relit en
  // dépend : la largeur d'un tableau qui prend toute la page s'écrit en px d'après la page (721 px ou 1016 px pour la même feuille d'émargement, avec ou sans l'aperçu), et la bêta
  // a écrit les siens dans l'aperçu.
  async function startPage(h) {
    await h.resetEditor();
    document.getElementById('editor-container').classList.add('a4-preview');
  }
  async function endPage(h) {
    PageLayout.setMarginsMm(null);
    await h.resetEditor();
  }

  // Un document rouvert : la page repart d'un en-tête et d'un pied fermés, l'éditeur reçoit le HTML, puis relit ce qu'il enregistrerait.
  async function reopen(html) {
    Editor.exitHeaderFooterModeIfActive();
    Editor.setHeaderFooterData(CLOSED_HEADER_FOOTER);
    Editor.setHTML(html);
    await sleep(140);
    return Editor.getHTML();
  }

  // Un modèle ouvert comme le widget l'ouvre (js/main.js:loadContentIntoEditor) : les marges et le sens de la page d'abord (les zones à deux colonnes et les tableaux qui prennent toute la
  // page mesurent d'après eux), sans l'aperçu A4 pour une grille, puis le HTML, puis l'en-tête et le pied. Rend ce que l'éditeur enregistrerait.
  async function openModel(model, html) {
    Editor.exitHeaderFooterModeIfActive();
    PageLayout.setMarginsMm(model.margins);
    document.getElementById('editor-container').classList.toggle('a4-preview', model.kind !== 'grille');
    Editor.setHTML(html);
    Editor.setHeaderFooterData(model.headerFooter || CLOSED_HEADER_FOOTER);
    await sleep(200);
    return Editor.getHTML();
  }

  // Le modèle sans ses données. Un export sans table à lire écrit « [ERREUR: table courante indisponible] » à la place de chaque bulle, et ce texte-là, long et coupé en tout petits morceaux
  // dans les colonnes étroites, ne ressemble à rien de ce qu'une personne exporte. Chaque bulle (variable, calcul, valeur selon une condition, puce) devient donc son texte (« #Factures.Numero »,
  // « = #Quittances.Loyer + #Quittances.Charges ») et chaque bloc conditionnel s'ouvre : la mise en page, les tableaux, les colonnes et les zones sortent comme elles sortent avec des données, au
  // texte près. Les numéros de page restent des champs. Ce que les données changent (boucles, dates, liaisons, pagination d'un long document) est mesuré par le labo avant chaque envoi.
  function withoutData(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    box.querySelectorAll('.var-badge, .calc-badge, .conditional-value, .smart-chip').forEach(el => el.replaceWith(document.createTextNode(el.textContent)));
    box.querySelectorAll('.conditional-text').forEach(el => el.replaceWith(...el.childNodes));
    return box.innerHTML;
  }
  function headerFooterWithoutData(headerFooter) {
    if (!headerFooter) return null;
    const zone = html => (html ? withoutData(html) : html);
    return {
      enabled: headerFooter.enabled,
      differentFirstPage: headerFooter.differentFirstPage,
      header: { default: zone(headerFooter.header.default), first: zone(headerFooter.header.first) },
      footer: { default: zone(headerFooter.footer.default), first: zone(headerFooter.footer.first) },
    };
  }

  // Les lignes de texte de chaque page d'un PDF, lues dans les octets du fichier (pdf.js) : les morceaux d'une même ligne (à 2 pt près en hauteur), de gauche à droite, un espace quand le
  // vide qui les sépare dépasse 1 pt.
  function pdfPageLines(groundTruth) {
    return groundTruth.pages.map((page) => {
      const items = page.textItems.slice().sort((a, b) => a.y - b.y || a.x - b.x);
      const lines = [];
      items.forEach((item) => {
        const last = lines[lines.length - 1];
        if (last && Math.abs(item.y - last.y) <= 2) last.items.push(item);
        else lines.push({ y: item.y, items: [item] });
      });
      return lines.map((line) => {
        let text = '';
        let end = null;
        line.items.sort((a, b) => a.x - b.x).forEach((item) => {
          if (end !== null && item.x - end > 1) text += ' ';
          text += item.str;
          end = item.x + item.width;
        });
        return text.replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
    });
  }

  // Le Word d'un modèle, lu dans le fichier généré : chaque paragraphe (tableaux compris), la largeur et le nombre de lignes de chaque tableau du corps, la page (taille, marges,
  // première page différente) et le texte de chaque en-tête et pied.
  async function wordOutline(h, html, headerFooter) {
    const docx = await h.exportDocxParts(html, headerFooter, PageLayout.getMarginsTwip());
    const zones = {};
    Object.keys(docx.parts).filter(name => /^word\/(header|footer)\d*\.xml$/.test(name)).sort().forEach((name) => {
      zones[name.slice(5, -4)] = h.docxParagraphs(docx.part(name)).map(p => p.text);
    });
    return {
      paragraphs: h.docxParagraphs(docx.doc).map(p => p.text),
      tables: h.docxTables(docx.doc).map(t => ({ columns: t.gridCols, rows: t.rows.length })),
      page: h.docxSectionProps(docx.doc),
      zones,
    };
  }

  // Les sorties d'un modèle, sans données : le PDF (pas pour un e-mail), le Word (ni pour un e-mail ni pour une grille, qui ne se génère pas en Word) ou les lignes de l'e-mail.
  // Elles partent du HTML que la bêta réécrit (`out`), celui qu'un modèle enregistré par la bêta porte.
  async function modelOutputs(h, model) {
    PageLayout.setMarginsMm(model.margins);
    const outputs = {};
    if (model.kind === 'email') {
      outputs.email = MailtoExport.plainTextFromHtml(model.out).split('\n');
      return outputs;
    }
    const html = withoutData(model.out);
    const headerFooter = headerFooterWithoutData(model.headerFooter);
    const pdf = await h.exportPdfContent(html, headerFooter, PageLayout.getMarginsPt(), null, model.kind === 'grille');
    outputs.pdf = { pages: pdfPageLines(await h.extractPdfGroundTruth(pdf.base64)) };
    if (model.kind !== 'grille') outputs.docx = await wordOutline(h, html, headerFooter);
    return outputs;
  }

  // Les sorties des 13 modèles, calculées une fois par page (le PDF et le Word pèsent) pour les trois cas qui les comparent.
  let outputsPromise = null;
  function allModelOutputs(h) {
    if (!outputsPromise) {
      outputsPromise = (async () => {
        const set = await loadSet();
        const byName = {};
        for (const model of set.models) {
          try { byName[model.name] = await modelOutputs(h, model); } catch (e) { byName[model.name] = { error: String(e && e.message || e).slice(0, 300) }; }
        }
        PageLayout.setMarginsMm(null);
        return byName;
      })();
    }
    return outputsPromise;
  }

  // Compare une sortie à la figée, modèle par modèle : `part` dit laquelle (pdf, docx, email) ; une sortie absente du jeu doit l'être aussi de la page.
  async function compareOutputs(h, part) {
    const set = await loadSet();
    const got = await allModelOutputs(h);
    const mismatches = [];
    let total = 0;
    set.models.forEach((model) => {
      const outputs = got[model.name];
      if (outputs.error) { mismatches.push({ name: model.name, error: outputs.error }); return; }
      if (model[part] === undefined && outputs[part] === undefined) return;
      total++;
      if (same(outputs[part], model[part])) return;
      const gotText = JSON.stringify(outputs[part]);
      mismatches.push(Object.assign({ name: model.name }, firstDifference(gotText === undefined ? 'absent' : gotText, JSON.stringify(model[part]) || 'absent')));
    });
    return verdict(mismatches, total);
  }

  cases.push({
    id: 'beta_compat_set_is_whole',
    description: 'Jeu figé de la bêta : le fichier se lit et porte 90 documents dont le tableau collé d\'Excel, 13 jeux d\'en-tête et de pied et les 13 modèles d\'usage (dont une grille et un e-mail) avec leurs sorties figées',
    run: async () => {
      const set = await loadSet();
      const problems = [];
      const need = (ok, text) => { if (!ok) problems.push(text); };
      need(set.documents.length >= 90, 'moins de 90 documents : ' + set.documents.length);
      need(set.documents.every(d => typeof d.html === 'string' && d.html.length > 0 && Number.isInteger(d.id) && d.group), 'un document sans identifiant, série ou HTML');
      need(set.documents.some(d => d.id === 2618 && d.note), 'le tableau collé d\'Excel (2618) et sa note manquent');
      need(new Set(set.documents.map(d => d.group)).size >= 76, 'moins de 76 séries de tests d\'origine : ' + new Set(set.documents.map(d => d.group)).size);
      need(set.headerFooters.length >= 13 && set.headerFooters.every(d => d.data && d.data.header), 'moins de 13 jeux d\'en-tête et de pied');
      need(set.models.length === 13, 'les modèles d\'usage ne sont pas 13 : ' + set.models.length);
      need(['document', 'grille', 'email'].every(kind => set.models.some(m => m.kind === kind)), 'un genre de modèle manque (document, grille, e-mail)');
      need(set.models.every(m => m.html && m.out), 'un modèle sans HTML d\'entrée ou de sortie');
      need(set.models.filter(m => m.kind === 'document').every(m => m.pdf && m.pdf.pages.length && m.docx && m.docx.paragraphs.length), 'un document sans PDF ou sans Word figé');
      need(set.models.filter(m => m.kind === 'grille').every(m => m.pdf && m.pdf.pages.length && !m.docx), 'une grille sans PDF figé, ou avec un Word');
      need(set.models.filter(m => m.kind === 'email').every(m => Array.isArray(m.email) && m.email.length > 3 && !m.pdf), 'un e-mail sans ses lignes figées');
      return { pass: problems.length === 0, notes: problems.length ? problems.join(' ; ') : set.documents.length + ' documents, ' + set.headerFooters.length + ' jeux d\'en-tête et de pied, ' + set.models.length + ' modèles : ' + names(set.models).join(', ') };
    },
  });

  cases.push({
    id: 'beta_compat_documents_the_beta_wrote_reopen_and_save_the_same_html',
    description: 'Jeu figé de la bêta : les 90 documents de test de la bêta, rouverts dans l\'éditeur, se relisent au caractère près comme la bêta les relisait (le HTML qu\'un modèle enregistré porte ne change pas à l\'ouverture)',
    run: async (h) => {
      await startPage(h);
      const set = await loadSet();
      const mismatches = [];
      for (const doc of set.documents) {
        const got = await reopen(doc.html);
        const want = doc.out === undefined ? doc.html : doc.out;
        if (got !== want) mismatches.push(Object.assign({ id: doc.id, group: doc.group }, firstDifference(got, want)));
      }
      await endPage(h);
      return verdict(mismatches, set.documents.length);
    },
  });

  cases.push({
    id: 'beta_compat_header_footer_sets_read_back_as_the_beta_read_them',
    description: 'Jeu figé de la bêta : les 13 jeux d\'en-tête et de pied, posés puis relus par l\'éditeur, reviennent comme la bêta les rendait (normalisation comprise)',
    run: async (h) => {
      await startPage(h);
      const set = await loadSet();
      const mismatches = [];
      for (const item of set.headerFooters) {
        Editor.exitHeaderFooterModeIfActive();
        Editor.setHeaderFooterData(item.data);
        await sleep(40);
        const got = Editor.getHeaderFooterData();
        const want = item.out === undefined ? item.data : item.out;
        if (!same(got, want)) mismatches.push(Object.assign({ id: item.id, group: item.group }, firstDifference(JSON.stringify(got), JSON.stringify(want))));
      }
      await endPage(h);
      return verdict(mismatches, set.headerFooters.length);
    },
  });

  cases.push({
    id: 'beta_compat_usage_models_reopen_and_save_the_html_the_beta_saved',
    description: 'Jeu figé de la bêta : les 13 modèles d\'usage, reçus tels que la bêta les avait, se rouvrent et se relisent comme la bêta les réécrivait, puis cette forme réécrite se relit sans changer (le modèle qu\'on enregistre, puis qu\'on rouvre, reste le même)',
    run: async (h) => {
      await startPage(h);
      const set = await loadSet();
      const mismatches = [];
      for (const model of set.models) {
        const first = await openModel(model, model.html);
        if (first !== model.out) mismatches.push(Object.assign({ name: model.name, step: 'ouverture' }, firstDifference(first, model.out)));
        const second = await openModel(model, model.out);
        if (second !== model.out) mismatches.push(Object.assign({ name: model.name, step: 'deuxième ouverture' }, firstDifference(second, model.out)));
      }
      await endPage(h);
      return verdict(mismatches, set.models.length);
    },
  });

  cases.push({
    id: 'beta_compat_usage_models_keep_their_header_footer_and_margins',
    description: 'Jeu figé de la bêta : l\'en-tête et le pied de page, la taille et le sens de la page et les marges d\'un modèle d\'usage ressortent de l\'éditeur comme la bêta les avait posés',
    run: async (h) => {
      await startPage(h);
      const set = await loadSet();
      const mismatches = [];
      for (const model of set.models) {
        PageLayout.setMarginsMm(model.margins);
        Editor.exitHeaderFooterModeIfActive();
        Editor.setHeaderFooterData(model.headerFooter || CLOSED_HEADER_FOOTER);
        await sleep(40);
        const headerFooter = Editor.getHeaderFooterData();
        if (!same(headerFooter, model.headerFooter || CLOSED_HEADER_FOOTER)) mismatches.push({ name: model.name, part: 'en-tête et pied', got: headerFooter, want: model.headerFooter });
        if (model.margins) {
          const got = PageLayout.getMarginsMm();
          const keys = ['top', 'right', 'bottom', 'left', 'orientation', 'format'];
          if (!keys.every(key => got[key] === model.margins[key])) mismatches.push({ name: model.name, part: 'marges', got: keys.map(key => got[key]), want: keys.map(key => model.margins[key]) });
        }
      }
      await endPage(h);
      return verdict(mismatches, set.models.length);
    },
  });

  cases.push({
    id: 'beta_compat_usage_models_pdf_pages_and_text_are_the_frozen_ones',
    description: 'Jeu figé de la bêta : le PDF de chaque modèle d\'usage (document ou grille), sans données, garde le même nombre de pages et le même texte ligne par ligne (un modèle de la bêta ne tombe pas une page plus loin sans que ce soit voulu)',
    run: async (h) => {
      await startPage(h);
      const result = await compareOutputs(h, 'pdf');
      await endPage(h);
      return result;
    },
  });

  cases.push({
    id: 'beta_compat_usage_models_word_paragraphs_tables_and_page_are_the_frozen_ones',
    description: 'Jeu figé de la bêta : le Word de chaque modèle d\'usage (document), sans données, garde les mêmes paragraphes, les mêmes tableaux (colonnes et lignes), la même page (taille, marges) et les mêmes en-tête et pied',
    run: async (h) => {
      await startPage(h);
      const result = await compareOutputs(h, 'docx');
      await endPage(h);
      return result;
    },
  });

  cases.push({
    id: 'beta_compat_email_model_lines_are_the_frozen_ones',
    description: 'Jeu figé de la bêta : le lien « Créer l\'email » d\'un modèle d\'e-mail de la bêta écrit les lignes de l\'éditeur, une pour une (paragraphes collés comme dans l\'éditeur, aucune ligne vide de plus)',
    run: async (h) => {
      await startPage(h);
      const result = await compareOutputs(h, 'email');
      await endPage(h);
      return result;
    },
  });

  // Le fichier du jeu, refigé : le texte à écrire dans dev-tests/beta-compat-set.json avec les sorties de CETTE page (`pdf`, `docx`, `email` de chaque modèle). Les entrées et les sorties de
  // la bêta (`html`, `out`, `headerFooter`, `margins`) restent ce qu'elles sont : c'est la bêta qu'elles figent. À lancer par `--probe` (README, « Jeu figé de la bêta »).
  window.BetaCompat = {
    format: set => JSON.stringify(set, null, 1) + '\n',
    async freeze() {
      const h = window.TestHelpers;
      await startPage(h);
      const set = JSON.parse(JSON.stringify(await loadSet()));
      for (const model of set.models) {
        delete model.pdf; delete model.docx; delete model.email;
        Object.assign(model, await modelOutputs(h, model));
      }
      await endPage(h);
      return window.BetaCompat.format(set);
    },
  };

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.betaCompat = cases;
})();
