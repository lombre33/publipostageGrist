// Macro-modèle aux modèles de sens différents : portrait, paysage (et grille) dans un même document, chacun sur des pages de SON sens (demande d'Antoine, 12/10 : « il faudrait qu'un macro
// modèle puisse contenir des modèles paysage, portrait et grille » ; carte « Dans un macro-modèle, qui décide du sens des pages ? », réponse « Chaque modèle, ou imposé » : le bouton Page du
// macro-modèle propose « Selon chaque modèle », « Portrait » et « Paysage »).
//
// Le HTML assemblé dit lui-même le sens de chaque modèle (js/page-sections.js) : le saut de page qui ouvre un modèle porte `data-page-orientation="portrait|landscape"`, et un repère vide
// `page-section-start` ouvre le premier. Toutes les sorties (la Lecture, le PDF, le Word, l'impression navigateur) lisent ces repères de la même façon ; sans eux (un document ordinaire, un
// macro-modèle au sens imposé), rien ne change. Ce fichier écrit les repères À LA MAIN, à dessein : il épingle le contrat du HTML assemblé, du côté de la sortie ; l'assemblage lui-même (les
// repères que `MacroTemplates` pose) a ses scénarios plus bas dans le groupe, une fois l'interrupteur en place.
//
// Lot 1 (PDF) : le sens de chaque section est lu par `js/pdf-export.js` (`prepareSections`, `visitSection`, `visitPageBreak`, `turnPage`) : la mise en page se fait dans la largeur de la page où le
// bloc tombe, pdfmake tourne la page au saut (`pageOrientation` sur le premier bloc de la section), l'en-tête, le pied et le filigrane suivent la page qu'ils habillent, et rien ne reste de l'un
// à l'autre des exports. Le format et les marges ne changent jamais d'une section à l'autre (ceux du macro-modèle pour tous ses modèles, choix du 09/10) : seul le sens tourne.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.mixedOrientation = (function () {
  const PORTRAIT_PT = { width: 595.28, height: 841.89 };
  const LANDSCAPE_PT = { width: 841.89, height: 595.28 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const WITH_HF = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '' } };
  const HF_WORDS = /^(EN-TETE|EN-|TETE|PIED|\d+\/\d+)$/;
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  // --- Le HTML assemblé d'un macro-modèle aux sens mêlés, écrit à la main ---
  const start = sense => '<div class="page-section-start" contenteditable="false" data-page-orientation="' + sense + '"></div>';
  const slotBreak = (rank, sense) => '<div class="page-break-marker" contenteditable="false" data-macro-slot="' + rank + '" data-page-orientation="' + sense + '">Saut de page</div>';
  // `slots` : [{ sense, html }], un modèle chacun.
  const assemble = slots => start(slots[0].sense) + slots.map((slot, rank) => (rank ? slotBreak(rank, slot.sense) : '') + slot.html).join('');
  const slot = (sense, html) => ({ sense, html });

  // --- Les modèles ---
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + i + ' du modèle de test.</p>').join('');
  const longParagraph = tag => '<p>' + tag + ' ' + Array.from({ length: 70 }, (_, i) => 'mot' + i).join(' ') + '</p>';
  const tableOf = tag => '<table><tbody><tr><td><p>' + tag + 'a</p></td><td><p>' + tag + 'b</p></td><td><p>' + tag + 'c</p></td></tr></tbody></table>';
  const zoneOf = tag => '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>' + tag + 'G</p></div><div class="two-columns-column"><p>' + tag + 'D</p></div></div>';
  // Une image en calque posée par sa grille de page (à `left` pt du coin du contenu, `top` pt sous lui), seule sur sa ligne.
  const layerImage = (left, top) => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; left: 100px; top: 100px; z-index: 5;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="' + left + '" data-page-top-pt="' + top + '"></p>';
  const rightFloat = tag => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 120px; height: 80px;" data-align="right" data-wrap="square">' + tag + ' ' + Array.from({ length: 40 }, (_, i) => 'mot' + i).join(' ') + '</p>';

  // --- Le PDF, relu par pdf.js ---
  const words = text => text.split(/\s+/).filter(Boolean);
  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  async function pdfPages(h, html, hf, margins) {
    const result = await h.exportPdfContent(html, hf || null, margins || PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    const pages = gt.pages.map(page => ({
      sense: page.width > page.height ? 'landscape' : 'portrait',
      width: page.width, height: page.height, items: page.textItems, images: page.images,
      words: page.textItems.flatMap(item => words(item.str)),
    }));
    return { result, pages, sizes: pages.map(page => (page.sense === 'landscape' ? 'L' : 'P')).join('') };
  }
  const bodyWords = page => page.words.filter(word => !HF_WORDS.test(word));
  // La taille réelle de chaque page, contre celle du sens attendu (A4 : le format du macro-modèle ne change pas).
  function sizeProblems(pages, expected) {
    const problems = [];
    pages.forEach((page, i) => {
      const want = expected[i] === 'L' ? LANDSCAPE_PT : PORTRAIT_PT;
      if (!near(page.width, want.width, 1) || !near(page.height, want.height, 1)) problems.push('page ' + (i + 1) + ' : ' + page.width.toFixed(1) + ' x ' + page.height.toFixed(1) + ' pt au lieu de ' + want.width + ' x ' + want.height);
    });
    return problems;
  }
  // Le mot repère de chaque modèle dit sur quelle page il tombe : la liste, page par page, des repères présents.
  const tagsOn = (page, tags) => tags.filter(tag => page.words.indexOf(tag) !== -1);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });

  // La page du document d'avant les scénarios : A4 portrait, marges par défaut (les scénarios n'y touchent pas, mais un groupe d'avant a pu la laisser autrement).
  async function plainPage(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(150);
  }

  return [
    // ---------- Le lecteur des repères ----------
    {
      id: 'mixed_sections_the_reader_of_markers_splits_runs_of_equal_sense',
      description: 'PageSections : un document sans repère n\'est pas une suite de sections ; le repère de départ dit le sens du premier modèle, un saut de page qui garde le sens reste dans sa section, un changement de sens ouvre la suivante (le saut en est le premier nœud), un repère illisible ne compte pas',
      async run() {
        const problems = [];
        const parse = html => { const root = document.createElement('div'); root.innerHTML = html; return root; };
        const shape = sections => sections.map(s => s.orientation[0] + ':' + s.nodes.filter(n => n.nodeType === 1).map(n => (n.classList.contains('page-break-marker') ? '|' + (n.getAttribute('data-macro-slot') || '') : n.textContent)).join(','));
        const plainBreak = '<div class="page-break-marker" contenteditable="false" data-macro-slot="1">Saut de page</div>';
        if (PageSections.hasSenses('<p>texte</p>' + plainBreak)) problems.push('un saut de page de macro-modèle SANS repère de sens est pris pour un document aux sens mêlés');
        if (PageSections.hasSenses(parse('<p>texte</p>' + plainBreak))) problems.push('(nœuds) un saut de page sans repère de sens est pris pour un repère');
        const mixed = parse(assemble([slot('portrait', '<p>A</p>'), slot('portrait', '<p>B</p>'), slot('landscape', '<p>C</p>'), slot('landscape', '<p>D</p>'), slot('portrait', '<p>E</p>')]));
        if (!PageSections.hasSenses(mixed) || !PageSections.hasSenses(mixed.innerHTML)) problems.push('un document aux sens mêlés n\'est pas reconnu');
        const sections = PageSections.split(mixed.childNodes, 'portrait');
        if (shape(sections).join(' ') !== 'p:A,|1,B l:|2,C,|3,D p:|4,E') problems.push('découpage : ' + shape(sections).join(' ') + ' au lieu de « p:A,|1,B l:|2,C,|3,D p:|4,E »');
        // Le premier modèle en paysage : la section de départ prend le sens du repère, pas celui de la page de base.
        const landscapeFirst = PageSections.split(parse(assemble([slot('landscape', '<p>A</p>'), slot('portrait', '<p>B</p>')])).childNodes, 'portrait');
        if (shape(landscapeFirst).join(' ') !== 'l:A p:|1,B') problems.push('premier modèle en paysage : ' + shape(landscapeFirst).join(' '));
        // Un modèle vide au départ : le repère seul ouvre une section vide, pour que la première page suive son sens.
        const onlyStart = PageSections.split(parse(start('landscape')).childNodes, 'portrait');
        if (onlyStart.length !== 1 || onlyStart[0].orientation !== 'landscape' || onlyStart[0].nodes.length) problems.push('repère de départ seul : ' + JSON.stringify(onlyStart.map(s => s.orientation)));
        // Des espaces devant le repère de départ (le HTML assemblé en garde parfois) n'ouvrent pas une section de plus.
        const spaced = PageSections.split(parse('\n  ' + assemble([slot('landscape', '<p>A</p>')])).childNodes, 'portrait');
        if (spaced.length !== 1 || spaced[0].orientation !== 'landscape') problems.push('espaces devant le repère de départ : ' + JSON.stringify(spaced.map(s => s.orientation)));
        // Un sens illisible ne change rien : le saut reste dans sa section.
        const unreadable = PageSections.split(parse(start('portrait') + '<p>A</p><div class="page-break-marker" data-macro-slot="1" data-page-orientation="diagonal">Saut de page</div><p>B</p>').childNodes, 'portrait');
        if (unreadable.length !== 1) problems.push('un sens illisible ouvre une section : ' + unreadable.length);
        // Les sens employés, dans l'ordre, et le sens du départ lu sans analyser tout le document.
        if (PageSections.sensesIn(mixed.innerHTML).join() !== 'portrait,landscape') problems.push('sensesIn : ' + PageSections.sensesIn(mixed.innerHTML).join());
        if (PageSections.firstSenseOf(assemble([slot('landscape', '<p>A</p>')])) !== 'landscape' || PageSections.firstSenseOf(assemble([slot('portrait', '<p>A</p>')])) !== 'portrait' || PageSections.firstSenseOf('<p>A</p>') !== null) problems.push('firstSenseOf : ' + [PageSections.firstSenseOf(assemble([slot('landscape', '<p>A</p>')])), PageSections.firstSenseOf('<p>A</p>')].join(' / '));
        // Le repère de départ fabriqué par PageSections est celui que ce fichier écrit à la main : le contrat du HTML assemblé.
        if (PageSections.startHtml('landscape') !== start('landscape') || PageSections.startHtml('portrait') !== start('portrait')) problems.push('startHtml : ' + PageSections.startHtml('landscape'));
        const stripped = parse(assemble([slot('landscape', '<p>A</p>')]));
        PageSections.stripStart(stripped);
        if (stripped.querySelector('.page-section-start') || stripped.textContent !== 'A') problems.push('stripStart laisse le repère de départ');
        return verdict(problems, { decoupage: shape(sections).join(' ') });
      },
    },

    // ---------- Le PDF ----------
    {
      id: 'mixed_pdf_each_template_has_pages_of_its_own_sense',
      description: 'PDF : portrait, paysage, portrait, paysage dans un macro-modèle aux sens mêlés : quatre pages, chacune de la taille de son sens (A4), le texte de chaque modèle sur la sienne, l\'en-tête sur chacune, le pied « n/total » qui continue (1/4 à 4/4) et au bas de chaque page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo')), slot('portrait', lines(3, 'Charlie')), slot('landscape', lines(3, 'Delta'))]);
        const { pages, sizes } = await pdfPages(h, html, WITH_HF);
        if (sizes !== 'PLPL') problems.push('sens des pages : ' + sizes + ' au lieu de PLPL');
        problems.push(...sizeProblems(pages, 'PLPL'));
        const tags = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
        pages.forEach((page, i) => {
          if (tagsOn(page, tags).join() !== tags[i]) problems.push('page ' + (i + 1) + ' : les modèles posés sont « ' + tagsOn(page, tags).join(' ') + ' » au lieu de « ' + tags[i] + ' »');
          if (bodyWords(page).length !== 18) problems.push('page ' + (i + 1) + ' : ' + bodyWords(page).length + ' mots de corps au lieu de 18 (trois lignes de six mots)');
          const head = page.items.find(item => item.str.indexOf('EN-') === 0);
          if (!head) problems.push('page ' + (i + 1) + ' : pas d\'en-tête');
          const foot = page.items.find(item => item.str.indexOf('PIED') === 0);
          if (!foot) problems.push('page ' + (i + 1) + ' : pas de pied');
          else if (!near(page.height - foot.y, 73, 12)) problems.push('page ' + (i + 1) + ' : le pied est à ' + (page.height - foot.y).toFixed(0) + ' pt du bas de SA page (73 attendus)');
        });
        const feet = pages.map(page => (page.items.map(item => item.str.trim()).find(str => /^\d+\/\d+$/.test(str)) || '-'));
        if (feet.join(' ') !== '1/4 2/4 3/4 4/4') problems.push('pieds : ' + feet.join(' ') + ' au lieu de 1/4 2/4 3/4 4/4');
        return verdict(problems, { sens: sizes, pieds: feet.join(' ') });
      },
    },
    {
      id: 'mixed_pdf_starts_in_the_sense_of_the_first_template',
      description: 'PDF : le document commence dans le sens de son premier modèle (paysage, puis portrait ; un seul modèle paysage), sans page blanche devant, et la définition du document le dit',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const runs = [
          ['paysage puis portrait', [slot('landscape', lines(3, 'Alpha')), slot('portrait', lines(3, 'Bravo'))], 'LP'],
          ['un seul modèle paysage', [slot('landscape', lines(3, 'Alpha'))], 'L'],
          ['un seul modèle portrait', [slot('portrait', lines(3, 'Alpha'))], 'P'],
        ];
        for (const [label, slots, expected] of runs) {
          const { pages, sizes, result } = await pdfPages(h, assemble(slots), NO_HF);
          summary[label] = sizes;
          if (sizes !== expected) problems.push(label + ' : ' + sizes + ' au lieu de ' + expected);
          problems.push(...sizeProblems(pages, expected).map(p => label + ', ' + p));
          pages.forEach((page, i) => { if (!bodyWords(page).length) problems.push(label + ', page ' + (i + 1) + ' blanche'); });
          const first = result.docDefinition.pageOrientation;
          if (first !== (expected[0] === 'L' ? 'landscape' : 'portrait')) problems.push(label + ' : la définition du document commence en « ' + first + ' »');
        }
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_templates_of_the_same_sense_follow_each_other_without_turning',
      description: 'PDF : des modèles de même sens à la suite (portrait, portrait, paysage, paysage, portrait) gardent leur saut de page ordinaire entre eux et ne tournent la page qu\'à un changement de sens : cinq pages PPLLP, pieds 1/5 à 5/5, aucune blanche',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(3, 'Alpha')), slot('portrait', lines(3, 'Bravo')), slot('landscape', lines(3, 'Charlie')), slot('landscape', lines(3, 'Delta')), slot('portrait', lines(3, 'Echo'))]);
        const { pages, sizes } = await pdfPages(h, html, WITH_HF);
        if (sizes !== 'PPLLP') problems.push('sens des pages : ' + sizes + ' au lieu de PPLLP');
        problems.push(...sizeProblems(pages, 'PPLLP'));
        const tags = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
        pages.forEach((page, i) => { if (tagsOn(page, tags).join() !== tags[i]) problems.push('page ' + (i + 1) + ' : « ' + tagsOn(page, tags).join(' ') + ' » au lieu de « ' + tags[i] + ' »'); });
        const feet = pages.map(page => (page.items.map(item => item.str.trim()).find(str => /^\d+\/\d+$/.test(str)) || '-'));
        if (feet.join(' ') !== '1/5 2/5 3/5 4/5 5/5') problems.push('pieds : ' + feet.join(' '));
        return verdict(problems, { sens: sizes, pieds: feet.join(' ') });
      },
    },
    {
      id: 'mixed_pdf_a_long_template_flows_over_several_pages_of_its_sense',
      description: 'PDF : un modèle paysage plus long qu\'une page coule sur plusieurs pages PAYSAGE (leur hauteur est celle du paysage, plus basse), puis le modèle portrait suivant reprend une page portrait ; aucun mot perdu',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('landscape', lines(60, 'Bravo')), slot('portrait', lines(3, 'Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (!/^L{2,}P$/.test(sizes)) problems.push('sens des pages : ' + sizes + ' (des pages paysage puis une page portrait attendues)');
        const bravo = pages.reduce((sum, page) => sum + page.words.filter(w => w === 'Bravo').length, 0);
        const charlie = pages.reduce((sum, page) => sum + page.words.filter(w => w === 'Charlie').length, 0);
        if (bravo !== 60 || charlie !== 3) problems.push('mots perdus ou en double : ' + bravo + ' lignes de Bravo (60) et ' + charlie + ' de Charlie (3)');
        const last = pages[pages.length - 1];
        if (!last || last.sense !== 'portrait' || tagsOn(last, ['Bravo', 'Charlie']).join() !== 'Charlie') problems.push('la dernière page n\'est pas celle du modèle portrait seul');
        pages.slice(0, -1).forEach((page, i) => {
          const lowest = Math.max(...page.items.map(item => item.y));
          if (lowest > LANDSCAPE_PT.height) problems.push('page ' + (i + 1) + ' : du texte à ' + lowest.toFixed(0) + ' pt, plus bas que la page paysage (' + LANDSCAPE_PT.height + ' pt)');
        });
        return verdict(problems, { sens: sizes });
      },
    },
    {
      id: 'mixed_pdf_text_wraps_to_the_width_of_its_page',
      description: 'PDF : le même long paragraphe revient à la ligne à la largeur de SA page : bord droit du texte à la marge droite d\'une page portrait (≤ 567 pt) et vers celle d\'une page paysage (> 700 pt, ≤ 814 pt)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', longParagraph('Alpha')), slot('landscape', longParagraph('Bravo')), slot('portrait', longParagraph('Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const right = page => Math.max(...page.items.map(item => item.x + item.width));
        const edges = pages.map(right);
        const marginRight = PageLayout.getMarginsPt().right;
        pages.forEach((page, i) => {
          const limit = page.width - marginRight;
          if (edges[i] > limit + 1) problems.push('page ' + (i + 1) + ' : le texte va jusqu\'à ' + edges[i].toFixed(0) + ' pt, au-delà de la marge droite (' + limit.toFixed(0) + ' pt)');
          if (edges[i] < limit - 60) problems.push('page ' + (i + 1) + ' : le texte s\'arrête à ' + edges[i].toFixed(0) + ' pt, loin de la marge droite (' + limit.toFixed(0) + ' pt) : mis en page dans une autre largeur');
        });
        return verdict(problems, { sens: sizes, bordsDroits: edges.map(e => Math.round(e)).join(' ') });
      },
    },
    {
      id: 'mixed_pdf_tables_and_two_column_zones_follow_the_width_of_their_page',
      description: 'PDF : un tableau de trois cases et une zone à deux colonnes tiennent la largeur de leur page (cases au tiers et aux deux tiers de la largeur utile, deuxième colonne à la moitié), en portrait comme en paysage',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', tableOf('TA') + zoneOf('ZA')), slot('landscape', tableOf('TB') + zoneOf('ZB')), slot('portrait', tableOf('TC') + zoneOf('ZC'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const margins = PageLayout.getMarginsPt();
        const summary = {};
        pages.forEach((page, i) => {
          const content = page.width - margins.left - margins.right;
          const x = str => { const item = page.items.find(it => it.str === str); return item ? (item.x - margins.left) / content : null; };
          const tag = ['A', 'B', 'C'][i];
          const cells = [x('T' + tag + 'a'), x('T' + tag + 'b'), x('T' + tag + 'c')];
          const zone = x('Z' + tag + 'D');
          summary['page ' + (i + 1)] = { cases: cells.map(c => (c == null ? null : Math.round(c * 100) / 100)), colonne: zone == null ? null : Math.round(zone * 100) / 100 };
          if (cells.some(c => c == null)) { problems.push('page ' + (i + 1) + ' : cases du tableau introuvables'); return; }
          if (!near(cells[0], 0.01, 0.02) || !near(cells[1], 0.343, 0.025) || !near(cells[2], 0.675, 0.025)) problems.push('page ' + (i + 1) + ' : cases à ' + cells.map(c => c.toFixed(2)).join(' / ') + ' de la largeur utile (0,01 / 0,34 / 0,68 attendus)');
          if (zone == null || !near(zone, 0.525, 0.03)) problems.push('page ' + (i + 1) + ' : deuxième colonne à ' + (zone == null ? 'rien' : zone.toFixed(2)) + ' de la largeur utile (0,52 attendu)');
        });
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_layer_images_and_floating_images_stay_on_their_own_page',
      description: 'PDF : l\'image en calque d\'un modèle garde sa position de page (à sa marge + sa grille) sur la page de son sens, et une image flottante à droite touche la marge droite de SA page, en portrait comme en paysage',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(2, 'Alpha') + layerImage(150, 20) + rightFloat('Alpha')), slot('landscape', lines(2, 'Bravo') + layerImage(700, 50) + rightFloat('Bravo')), slot('portrait', lines(2, 'Charlie') + layerImage(400, 50))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const m = PageLayout.getMarginsPt();
        const wantLayer = [[150, 20], [700, 50], [400, 50]];
        const summary = {};
        pages.forEach((page, i) => {
          const layer = page.images.find(img => near(img.width, 30, 2));
          const floating = page.images.find(img => near(img.width, 90, 2));
          summary['page ' + (i + 1)] = { calque: layer ? Math.round(layer.x) + ',' + Math.round(layer.y) : null, flottante: floating ? Math.round(floating.x + floating.width) : null };
          if (!layer) problems.push('page ' + (i + 1) + ' : l\'image en calque n\'est pas peinte sur sa page (' + page.images.length + ' image(s) peinte(s))');
          else if (!near(layer.x, m.left + wantLayer[i][0], 3) || !near(layer.y, m.top + wantLayer[i][1], 3)) problems.push('page ' + (i + 1) + ' : image en calque à ' + layer.x.toFixed(0) + ', ' + layer.y.toFixed(0) + ' pt au lieu de ' + (m.left + wantLayer[i][0]) + ', ' + (m.top + wantLayer[i][1]));
          if (i < 2) {
            if (!floating) problems.push('page ' + (i + 1) + ' : l\'image flottante n\'est pas peinte');
            else if (!near(floating.x + floating.width, page.width - m.right, 2)) problems.push('page ' + (i + 1) + ' : l\'image flottante finit à ' + (floating.x + floating.width).toFixed(0) + ' pt, sa marge droite est à ' + (page.width - m.right).toFixed(0) + ' pt');
          }
        });
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_header_and_footer_are_laid_out_for_the_page_they_dress',
      description: 'PDF : l\'en-tête (un tableau de deux cases) et le pied (aligné à droite, avec « n/total ») sont mis en page dans la largeur de chaque page : la case de droite de l\'en-tête est plus loin à droite sur une page paysage, le pied finit à la marge droite de sa page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const hf = {
          enabled: true, differentFirstPage: false,
          header: { default: '<table><tbody><tr><td><p>GAUCHE</p></td><td><p>DROITE</p></td></tr></tbody></table>', first: '' },
          footer: { default: '<p style="text-align: right">PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '' },
        };
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, hf);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const m = PageLayout.getMarginsPt();
        const rightCell = pages.map(page => { const item = page.items.find(it => it.str === 'DROITE'); return item ? item.x : null; });
        if (rightCell.some(x => x == null)) problems.push('case de droite de l\'en-tête introuvable : ' + rightCell.join(' '));
        else {
          const ratio = pages.map((page, i) => (rightCell[i] - m.left) / (page.width - m.left - m.right));
          ratio.forEach((r, i) => { if (!near(r, 0.5, 0.04)) problems.push('page ' + (i + 1) + ' : la case de droite de l\'en-tête commence à ' + r.toFixed(2) + ' de la largeur utile (0,5 attendu)'); });
          if (!(rightCell[1] - rightCell[0] > 100)) problems.push('la case de droite n\'est pas plus loin sur la page paysage : ' + rightCell.map(x => Math.round(x)).join(' / '));
        }
        pages.forEach((page, i) => {
          const numbers = page.items.filter(item => /^\d+\/\d+$/.test(item.str.trim()));
          const last = numbers[numbers.length - 1];
          if (!last) problems.push('page ' + (i + 1) + ' : pas de « n/total » au pied');
          else if (!near(last.x + last.width, page.width - m.right, 4)) problems.push('page ' + (i + 1) + ' : le pied finit à ' + (last.x + last.width).toFixed(0) + ' pt, la marge droite est à ' + (page.width - m.right).toFixed(0) + ' pt');
        });
        return verdict(problems, { casesDeDroite: rightCell.map(x => Math.round(x)).join(' / ') });
      },
    },
    {
      id: 'mixed_pdf_watermark_is_drawn_for_each_page_size',
      description: 'PDF : le filigrane du macro-modèle est dessiné à la taille de chaque page (595 x 842 pt sur une page portrait, 842 x 595 pt sur une page paysage), le même pour toutes les pages de même sens',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const margins = Object.assign({}, PageLayout.getMarginsPt(), { watermark: { text: 'CONFIDENTIEL' } });
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie'))]);
        const { result, sizes } = await pdfPages(h, html, NO_HF, margins);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const background = result.docDefinition.background;
        if (typeof background !== 'function') problems.push('pas de fond de page pour le filigrane');
        else {
          const svgOf = (page, size) => { const nodes = background(page, size) || []; return nodes.map(node => node.svg || '').find(svg => svg.indexOf('CONFIDENTIEL') !== -1) || ''; };
          const sizeOfSvg = svg => { const w = /width="([\d.]+)"/.exec(svg); const hgt = /height="([\d.]+)"/.exec(svg); return w && hgt ? [parseFloat(w[1]), parseFloat(hgt[1])] : null; };
          const portrait = sizeOfSvg(svgOf(1, { width: PORTRAIT_PT.width, height: PORTRAIT_PT.height, orientation: 'portrait' }));
          const landscape = sizeOfSvg(svgOf(2, { width: LANDSCAPE_PT.width, height: LANDSCAPE_PT.height, orientation: 'landscape' }));
          const portraitAgain = sizeOfSvg(svgOf(3, { width: PORTRAIT_PT.width, height: PORTRAIT_PT.height, orientation: 'portrait' }));
          if (!portrait || !near(portrait[0], PORTRAIT_PT.width, 0.5) || !near(portrait[1], PORTRAIT_PT.height, 0.5)) problems.push('filigrane d\'une page portrait : ' + JSON.stringify(portrait));
          if (!landscape || !near(landscape[0], LANDSCAPE_PT.width, 0.5) || !near(landscape[1], LANDSCAPE_PT.height, 0.5)) problems.push('filigrane d\'une page paysage : ' + JSON.stringify(landscape));
          if (!portraitAgain || !near(portraitAgain[0], PORTRAIT_PT.width, 0.5)) problems.push('filigrane de la page portrait qui suit : ' + JSON.stringify(portraitAgain));
        }
        return verdict(problems, { sens: sizes });
      },
    },
    {
      id: 'mixed_pdf_an_empty_template_keeps_its_page_and_a_last_empty_one_opens_none',
      description: 'PDF : un modèle paysage VIDE entre deux modèles portrait ouvre quand même sa page (blanche, paysage : « deux sauts de suite laissent une page blanche », choix du 09/10) ; un dernier modèle vide n\'ouvre aucune page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const middle = await pdfPages(h, assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', ''), slot('portrait', lines(2, 'Charlie'))]), NO_HF);
        summary.milieu = middle.sizes;
        if (middle.sizes !== 'PLP') problems.push('modèle vide au milieu : ' + middle.sizes + ' au lieu de PLP');
        else if (middle.pages[1].words.length) problems.push('la page du modèle vide n\'est pas blanche : ' + middle.pages[1].words.join(' '));
        const last = await pdfPages(h, assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', '')]), NO_HF);
        summary.fin = last.sizes;
        if (last.sizes !== 'P') problems.push('dernier modèle vide : ' + last.sizes + ' au lieu de P');
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_table_of_contents_and_numbered_headings_cross_sections',
      description: 'PDF : le sommaire du premier modèle (portrait) donne la bonne page à un titre d\'un modèle paysage et à un titre du modèle portrait qui suit, et la numérotation des titres continue d\'un modèle à l\'autre',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const heading = tag => '<h1>' + tag + 'titre</h1><p>' + tag + ' texte.</p>';
        const html = assemble([slot('portrait', '<div class="toc-marker"></div>' + heading('Alpha')), slot('landscape', heading('Bravo')), slot('portrait', heading('Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') { problems.push('sens des pages : ' + sizes + ' au lieu de PLP'); return verdict(problems, { sens: sizes }); }
        // Le sommaire est sur la page 1 : pour chaque titre, la ligne « titre ...... n » finit par son numéro de page.
        const page1 = pages[0];
        const lineOf = name => {
          const items = page1.items.filter(item => item.str.indexOf(name) !== -1);
          if (!items.length) return null;
          const y = items[0].y;
          return page1.items.filter(item => near(item.y, y, 2)).sort((a, b) => a.x - b.x).map(item => item.str.trim()).join(' ');
        };
        const entries = ['Alphatitre', 'Bravotitre', 'Charlietitre'].map(lineOf);
        const wantPages = ['1', '2', '3'];
        entries.forEach((entry, i) => {
          if (!entry) problems.push('le sommaire n\'a pas « ' + ['Alpha', 'Bravo', 'Charlie'][i] + 'titre »');
          else if (!new RegExp('(^|\\s)' + wantPages[i] + '$').test(entry)) problems.push('sommaire : « ' + entry + ' » (page ' + wantPages[i] + ' attendue en fin de ligne)');
        });
        return verdict(problems, { sens: sizes, sommaire: entries });
      },
    },
    {
      id: 'mixed_pdf_nothing_changes_without_markers_and_nothing_leaks_between_exports',
      description: 'PDF : un macro-modèle au sens imposé (des sauts de page de modèle SANS repère de sens) garde toutes ses pages dans le sens des marges, portrait comme paysage ; et un export aux sens mêlés ne laisse rien derrière lui : l\'export suivant, ordinaire, retrouve le sens de ses marges',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const imposed = '<div class="page-break-marker" contenteditable="false" data-macro-slot="1">Saut de page</div>';
        const imposedDoc = lines(2, 'Alpha') + imposed + lines(2, 'Bravo') + imposed.replace('"1"', '"2"') + lines(2, 'Charlie');
        const portraitMargins = PageLayout.getMarginsPt();
        const landscapeMargins = Object.assign({}, portraitMargins, { orientation: 'landscape' });
        summary.imposePortrait = (await pdfPages(h, imposedDoc, NO_HF, portraitMargins)).sizes;
        summary.imposePaysage = (await pdfPages(h, imposedDoc, NO_HF, landscapeMargins)).sizes;
        if (summary.imposePortrait !== 'PPP') problems.push('macro-modèle imposé portrait : ' + summary.imposePortrait);
        if (summary.imposePaysage !== 'LLL') problems.push('macro-modèle imposé paysage : ' + summary.imposePaysage);
        // Un export aux sens mêlés qui commence en paysage, puis des exports ordinaires dans chaque sens.
        const mixed = await pdfPages(h, assemble([slot('landscape', lines(2, 'Alpha')), slot('portrait', lines(2, 'Bravo'))]), WITH_HF, portraitMargins);
        summary.mele = mixed.sizes;
        if (mixed.sizes !== 'LP') problems.push('aux sens mêlés : ' + mixed.sizes);
        const afterPortrait = await pdfPages(h, lines(2, 'Alpha'), WITH_HF, portraitMargins);
        const afterLandscape = await pdfPages(h, lines(2, 'Alpha'), WITH_HF, landscapeMargins);
        summary.apresPortrait = afterPortrait.sizes;
        summary.apresPaysage = afterLandscape.sizes;
        if (afterPortrait.sizes !== 'P') problems.push('export portrait ordinaire après un export mêlé : ' + afterPortrait.sizes);
        if (afterLandscape.sizes !== 'L') problems.push('export paysage ordinaire après un export mêlé : ' + afterLandscape.sizes);
        problems.push(...sizeProblems(afterPortrait.pages, 'P').map(p => 'après un export mêlé, ' + p));
        problems.push(...sizeProblems(afterLandscape.pages, 'L').map(p => 'après un export mêlé, ' + p));
        // L'export mêlé lui-même, refait : même résultat (rien ne reste d'une passe à l'autre).
        const again = await pdfPages(h, assemble([slot('landscape', lines(2, 'Alpha')), slot('portrait', lines(2, 'Bravo'))]), WITH_HF, portraitMargins);
        if (again.sizes !== 'LP') problems.push('le même export mêlé, refait : ' + again.sizes);
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_a_mixed_macro_exported_in_a_batch_has_the_same_pages',
      description: 'PDF en lot : le PDF d\'une ligne (getNativePdfBlobForRecord, celui que le ZIP de lot range) d\'un macro-modèle aux sens mêlés a les mêmes pages que l\'export d\'une seule ligne : PLP, chacune à sa taille',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie'))]);
        const { result } = await pdfPages(h, html, WITH_HF);
        if (!result.blob || !result.blob.size) return verdict(['aucun PDF produit'], {});
        const base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(result.blob); });
        const gt = await h.extractPdfGroundTruth(base64);
        const sizes = gt.pages.map(page => (page.width > page.height ? 'L' : 'P')).join('');
        if (sizes !== 'PLP') problems.push('le PDF téléchargé (le premier calcul) : ' + sizes + ' au lieu de PLP');
        problems.push(...sizeProblems(gt.pages.map(page => ({ width: page.width, height: page.height })), 'PLP'));
        return verdict(problems, { sens: sizes });
      },
    },
  ];
})();
