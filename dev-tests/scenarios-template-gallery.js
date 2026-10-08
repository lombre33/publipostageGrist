// Suite "templateGallery" - galerie « Créer à partir d'un modèle » (js/template-gallery.js, câblée par js/main.js:wireTemplateGalleryModal).
//
// Les trois modèles de templates-gallery-dev/ (« Test — … », « Vitrine des fonctionnalités ») ne servent qu'au protocole de test manuel : le dossier reste
// publié sur Pages, mais la galerie ne le lit que si l'adresse du widget contient `?dev`. Un utilisateur ordinaire ne les voit donc jamais, ni dans la
// liste renvoyée par loadManifest, ni dans la grille de la fenêtre, et son navigateur ne demande même pas le manifeste de dev.
//
// L'adresse se change ici par history.replaceState (sans rechargement) ; chaque scénario la remet comme il l'a trouvée.
(function () {
  const cases = [];
  const DEV_IDS = ['test-mise-en-page', 'test-images-tableaux', 'vitrine-fonctionnalites'];
  const DEV_NAMES = ['Test — Texte & mise en page', 'Test — Images, tableaux & 2 colonnes', 'Vitrine des fonctionnalités'];

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }

  // Pose la partie « ? » de l'adresse et rend la fonction qui remet l'ancienne.
  function setSearch(search) {
    const before = window.location.search;
    history.replaceState(null, '', window.location.pathname + search + window.location.hash);
    return () => history.replaceState(null, '', window.location.pathname + before + window.location.hash);
  }

  // Enregistre les adresses demandées à fetch le temps d'un scénario.
  function recordFetches() {
    const original = window.fetch;
    const urls = [];
    window.fetch = function (input) {
      urls.push(typeof input === 'string' ? input : (input && input.url) || String(input));
      return original.apply(this, arguments);
    };
    return { urls, stop: () => { window.fetch = original; } };
  }

  const ids = entries => entries.map(e => e.id);
  const asksForDev = urls => urls.some(u => u.indexOf('templates-gallery-dev/') !== -1);

  cases.push({
    id: 'gallery_dev_templates_are_not_loaded_without_dev_in_the_address',
    description: 'Sans ?dev : loadManifest ne renvoie que les modèles de templates-gallery/ et n’interroge jamais templates-gallery-dev/',
    run: async () => {
      const restore = setSearch('');
      const rec = recordFetches();
      try {
        const entries = await TemplateGallery.loadManifest();
        const got = ids(entries);
        const leaked = got.filter(id => DEV_IDS.indexOf(id) !== -1);
        const fromDevFolder = entries.filter(e => e.__base === 'templates-gallery-dev/').length;
        const pass = got.length >= 4 && leaked.length === 0 && fromDevFolder === 0 && !asksForDev(rec.urls);
        return { pass, notes: JSON.stringify({ got, leaked, fromDevFolder, asked: rec.urls }) };
      } finally { rec.stop(); restore(); }
    },
  });

  cases.push({
    id: 'gallery_dev_templates_load_with_dev_in_the_address_and_follow_it_when_it_changes',
    description: '?dev (seul, avec une valeur ou au milieu d’autres paramètres) ajoute les trois modèles de test ; sans lui, ils repartent ; ?devices ne compte pas',
    run: async () => {
      const results = {};
      const restoreAll = setSearch('');
      try {
        for (const [label, search] of [['dev', '?dev'], ['devValeur', '?dev=1'], ['milieu', '?a=1&dev&b=2']]) {
          const restore = setSearch(search);
          const got = ids(await TemplateGallery.loadManifest());
          restore();
          results[label] = { withAll: DEV_IDS.every(id => got.indexOf(id) !== -1), count: got.length };
        }
        // Le cache ne fige pas le réglage : après un chargement avec ?dev, l'adresse sans ?dev redonne la liste sans les modèles de test.
        results.retour = ids(await TemplateGallery.loadManifest()).filter(id => DEV_IDS.indexOf(id) !== -1).length;
        const restoreOther = setSearch('?devices=1');
        results.autreNom = ids(await TemplateGallery.loadManifest()).filter(id => DEV_IDS.indexOf(id) !== -1).length;
        restoreOther();
        // Les modèles de test gardent leur dossier de base : ce sont leurs vignettes et leur HTML qui en dépendent.
        const restoreDev = setSearch('?dev');
        const entries = await TemplateGallery.loadManifest();
        restoreDev();
        const vitrine = entries.find(e => e.id === 'vitrine-fonctionnalites');
        results.base = vitrine ? TemplateGallery.resolveUrl(vitrine.html, vitrine) : null;
        const pass = results.dev.withAll && results.devValeur.withAll && results.milieu.withAll
          && results.dev.count === results.devValeur.count && results.dev.count === results.milieu.count
          && results.retour === 0 && results.autreNom === 0
          && results.base === 'templates-gallery-dev/vitrine-fonctionnalites/template.html';
        return { pass, notes: JSON.stringify(results) };
      } finally { restoreAll(); }
    },
  });

  cases.push({
    id: 'gallery_window_lists_only_real_templates_without_dev_and_still_opens_a_card',
    description: 'La fenêtre « Créer à partir d’un modèle », ouverte sans ?dev, ne montre aucune carte de test ; les vrais modèles y sont et s’ouvrent',
    run: async () => {
      const restore = setSearch('');
      const open = document.getElementById('v2-btn-new-from-template');
      const modal = document.getElementById('template-gallery-modal');
      try {
        open.click();
        const shown = await waitFor(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, 5000);
        const names = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card-name')).map(n => n.textContent.trim());
        const leaked = names.filter(n => DEV_NAMES.indexOf(n) !== -1);
        const tags = Array.from(document.querySelectorAll('#tpl-gallery-tags .tpl-gallery-tag')).map(t => t.textContent.trim());
        const testTag = tags.filter(t => t === 'test' || t === 'démo' || t === 'vitrine');
        // Une vraie carte s'ouvre toujours en aperçu.
        const firstCard = document.querySelector('#tpl-gallery-grid .tpl-gallery-card');
        if (firstCard) firstCard.click();
        const preview = await waitFor(() => {
          const p = document.getElementById('template-preview-modal');
          return p && p.style.display !== 'none' && document.getElementById('tpl-preview-tiptap').innerHTML.length > 20;
        }, 5000);
        const pass = shown && names.length >= 4 && leaked.length === 0 && testTag.length === 0 && preview;
        return { pass, notes: JSON.stringify({ shown, names, leaked, tags, preview }) };
      } finally {
        const closePreview = document.getElementById('tpl-preview-close');
        if (closePreview) closePreview.click();
        if (modal) modal.style.display = 'none';
        restore();
      }
    },
  });

  cases.push({
    id: 'gallery_card_shows_manifest_text_as_text_and_the_preview_is_filtered',
    description: 'Un manifeste dont le nom et les mots-clés portent du HTML : la fiche les montre comme du texte (aucune balise ajoutée, rien ne court) ; l\'aperçu du modèle passe par le filtre (ni balise active, ni gestionnaire, ni lien javascript:) et garde le texte',
    run: async () => {
      const restore = setSearch('');
      const NAME = 'Facture <img src="x" onerror="window.__galleryHit=1"> & Cie';
      const TAG = '<b>promo</b>';
      const realFetchHtml = TemplateGallery.fetchHtml;
      const modal = document.getElementById('template-gallery-modal');
      window.__galleryHit = 0;
      TemplateGallery.fetchHtml = async () => '<p>Texte du modèle</p><img src="x" onerror="window.__galleryHit=2"><script>window.__galleryHit=3</script><a href="javascript:window.__galleryHit=4">lien</a>';
      let entry = null;
      let kept = null;
      try {
        document.getElementById('v2-btn-new-from-template').click();
        await waitFor(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, 5000);
        // Le tableau du manifeste est celui de la fenêtre (gardé en cache par TemplateGallery) : la première entrée prend un nom et un mot-clé piégés, la grille est redessinée.
        entry = (await TemplateGallery.loadManifest())[0];
        kept = { name: entry.name, tags: entry.tags };
        entry.name = NAME;
        entry.tags = [TAG];
        const search = document.getElementById('tpl-gallery-search');
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(200);
        const card = document.querySelector('#tpl-gallery-grid .tpl-gallery-card');
        const nameEl = card && card.querySelector('.tpl-gallery-card-name');
        const tagEls = card ? Array.from(card.querySelectorAll('.tpl-gallery-card-tags > span')) : [];
        const shot = card && card.querySelector(':scope > img');
        const cardResult = { name: nameEl && nameEl.textContent, nameChildren: nameEl ? nameEl.children.length : -1, tags: tagEls.map(t => t.textContent), tagChildren: tagEls.map(t => t.children.length),
          alt: shot && shot.getAttribute('alt'), imgs: card ? card.querySelectorAll('img').length : -1 };
        if (card) card.click();
        const previewed = await waitFor(() => document.getElementById('tpl-preview-tiptap').textContent.indexOf('Texte du modèle') !== -1, 5000);
        await sleep(400);
        const pv = document.getElementById('tpl-preview-tiptap');
        const preview = { text: previewed, scripts: pv.querySelectorAll('script').length, handlers: Array.from(pv.querySelectorAll('*')).filter(el => Array.from(el.attributes).some(a => /^on/i.test(a.name))).length,
          jsHref: Array.from(pv.querySelectorAll('a')).filter(a => /^javascript:/i.test(a.getAttribute('href') || '')).length, hit: window.__galleryHit };
        const pass = cardResult.name === NAME && cardResult.nameChildren === 0 && cardResult.tags.length === 1 && cardResult.tags[0] === TAG && cardResult.tagChildren[0] === 0
          && cardResult.alt === NAME && cardResult.imgs === 1 && preview.text && preview.scripts === 0 && preview.handlers === 0 && preview.jsHref === 0 && preview.hit === 0;
        return { pass, notes: JSON.stringify({ cardResult, preview }) };
      } finally {
        TemplateGallery.fetchHtml = realFetchHtml;
        if (entry && kept) { entry.name = kept.name; entry.tags = kept.tags; }
        const closePreview = document.getElementById('tpl-preview-close');
        if (closePreview) closePreview.click();
        if (modal) modal.style.display = 'none';
        delete window.__galleryHit;
        restore();
      }
    },
  });

  cases.push({
    id: 'gallery_search_finds_words_in_any_order_ignoring_accents_case_and_separators',
    description: 'La recherche suit la recherche par nom du widget (SearchSelect.nameMatcher) : « validé budget » (autre ordre), « VALIDE   budget » (sans accent, en capitales, espaces en trop) et « facture client 2 » (pour Facture_client-2) retrouvent leur modèle ; deux mots de deux modèles différents ne retrouvent rien ; le mot-clé choisi se combine avec elle ; vider la recherche rend la grille',
    run: async () => {
      const restore = setSearch('');
      const modal = document.getElementById('template-gallery-modal');
      const search = document.getElementById('tpl-gallery-search');
      const BUDGET = 'Budget validé';
      const INVOICE = 'Facture_client-2';
      let entries = [];
      let kept = [];
      try {
        document.getElementById('v2-btn-new-from-template').click();
        await waitFor(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, 5000);
        // Les deux premières entrées du manifeste (celui de la fenêtre, gardé en cache par TemplateGallery) prennent un nom d'essai ; leurs mots-clés restent ceux de ces modèles.
        entries = (await TemplateGallery.loadManifest()).slice(0, 2);
        kept = entries.map(e => e.name);
        entries[0].name = BUDGET;
        entries[1].name = INVOICE;
        const shown = async (text) => {
          search.value = text;
          search.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(60);
          const names = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card-name')).map(n => n.textContent.trim());
          return { budget: names.indexOf(BUDGET) !== -1, invoice: names.indexOf(INVOICE) !== -1, count: names.length, emptyMessage: !!document.querySelector('#tpl-gallery-grid .tpl-gallery-empty') };
        };
        const otherOrder = await shown('validé budget');
        const plain = await shown('  VALIDE   budget ');
        const separators = await shown('facture client 2');
        const mixed = await shown('budget facture');
        // Un mot-clé que seule la première entrée porte garde sa règle : la recherche s'y ajoute.
        const ownTag = (entries[0].tags || []).find(t => (entries[1].tags || []).indexOf(t) === -1);
        const chip = Array.from(document.querySelectorAll('#tpl-gallery-tags .tpl-gallery-tag')).find(t => t.textContent.trim() === ownTag);
        if (chip) chip.click();
        const withTag = await shown('validé budget');
        const withTagOther = await shown('facture client 2');
        document.querySelector('#tpl-gallery-tags .tpl-gallery-tag').click(); // « Tous »
        const cleared = await shown('');
        const pass = !!chip && otherOrder.budget && !otherOrder.invoice && plain.budget && !plain.invoice && separators.invoice && !separators.budget
          && !mixed.budget && !mixed.invoice && withTag.budget && !withTag.invoice && !withTagOther.invoice && !withTagOther.budget && cleared.count >= 4;
        return { pass, notes: JSON.stringify({ ownTag, chip: !!chip, otherOrder, plain, separators, mixed, withTag, withTagOther, cleared }) };
      } finally {
        entries.forEach((e, i) => { e.name = kept[i]; });
        const allChip = document.querySelector('#tpl-gallery-tags .tpl-gallery-tag');
        if (allChip) allChip.click();
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        if (modal) modal.style.display = 'none';
        restore();
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateGallery = cases;
})();
