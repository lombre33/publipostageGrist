// Suite "htmlSanitize" - le HTML qui ne vient pas de l'éditeur (une ligne de la table des modèles écrite par un autre collaborateur) : rien ne s'exécute, rien d'actif ne survit,
// tout ce que l'éditeur écrit reste (contrôle de sécurité du 04/10, rapport « controle-cyber-2026-10-04 », corrections 1 à 3, puis le style qui charge une ressource d'un autre site, avec la correction 4). Les charges n'ont qu'un effet : poser un témoin
// dans window.__hsHits ; le témoin posé, c'est que du code du document a couru.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hit = key => `window.__hsHits=window.__hsHits||{};window.__hsHits['${key}']=1`;
  const parentHit = key => `parent.__hsHits=parent.__hsHits||{};parent.__hsHits['${key}']=1`;
  // Pour une valeur d'attribut sans guillemets : window.__hsMark.nom() pose le témoin « nom ».
  window.__hsMark = new Proxy({}, { get: (_, key) => () => { window.__hsHits = window.__hsHits || {}; window.__hsHits[key] = 1; } });
  const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const hits = () => Object.keys(window.__hsHits || {});
  const normalized = html => new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  const PAYLOADS = {
    img_onerror: `<p>a</p><img src="x" onerror="${hit('img_onerror')}">`,
    script: `<p>b</p><script>${hit('script')}</script>`,
    svg_onload: `<p>c</p><svg onload="${hit('svg_onload')}"><circle r="1"></circle></svg>`,
    iframe_srcdoc: `<p>d</p><iframe srcdoc="${attr('<script>' + parentHit('iframe_srcdoc') + '</scr' + 'ipt>')}"></iframe>`,
    form_math_mutation: `<p>e</p><form><math><mtext></form><form><mglyph><style></math><img src onerror="${hit('form_math_mutation')}">`,
    noscript_attribute: `<p>f</p><noscript><p title="</noscript><img src=x onerror=__hsMark.noscript_attribute()>"></p></noscript>`,
    style_comment: `<p>g</p><style><!--</style><img src=x onerror="${hit('style_comment')}">--></style>`,
    template_content: `<p>h</p><template><img src=x onerror="${hit('template_content')}"></template>`,
    textarea_content: `<p>i</p><textarea><img src=x onerror=__hsMark.textarea_content()></textarea>`,
    object_embed: `<p>j</p><object data="https://exemple.invalid/a"></object><embed src="https://exemple.invalid/b">`,
    base_link: `<p>k</p><base href="https://exemple.invalid/"><link rel="stylesheet" href="https://exemple.invalid/c.css">`,
    javascript_src: `<p>l</p><img src="  java\tscript:${hit('javascript_src')}"><a href="javascript:${hit('javascript_href')}">m</a>`,
    event_attribute_case: `<p ONCLICK="${hit('upper')}" onmouseover="${hit('over')}">n</p>`,
  };
  const FORBIDDEN = 'script, style, template, noscript, iframe, object, embed, base, link, meta, svg, math, form, textarea, select, button';
  const activeScheme = value => /^(?:javascript|vbscript):/.test(value.slice(0, 80).replace(/[\u0000-\u0020]/g, '').toLowerCase());
  // Ce qui ne doit pas survivre : une balise active, un attribut qui court (on*, srcdoc, formaction), une adresse javascript:.
  const clutter = root => root.querySelectorAll(FORBIDDEN).length
    + Array.from(root.querySelectorAll('*')).filter(el => Array.from(el.attributes).some(a => /^on/i.test(a.name) || a.name === 'srcdoc' || a.name === 'formaction'
      || ((a.name === 'src' || a.name === 'href') && activeScheme(a.value)))).length;

  // Pose `html` dans la page comme le font la Lecture et les aperçus (innerHTML d'un div accroché), puis dit ce qui a couru et si l'adresse de base a changé.
  async function injectAndWatch(html) {
    window.__hsHits = {};
    const baseBefore = document.baseURI;
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await sleep(250);
    const result = { ran: hits(), baseChanged: document.baseURI !== baseBefore, forbidden: clutter(host) };
    host.remove();
    return result;
  }

  cases.push({
    id: 'hs_template_body_runs_nothing_when_opened',
    description: 'Le corps d\'un modèle écrit par un autre collaborateur directement dans la table, puis ouvert par la liste des modèles : aucun code ne court, le texte est là',
    run: async (h) => {
      await h.resetEditor();
      window.__hsHits = {};
      const saved = await Templates.save(null, 'Modèle du collègue', '<p>ok</p>', '', null, null, 'document', null);
      window.__gristStub.remoteWrite('Publipostage_Modeles', saved.id, { Contenu: '<p>Texte du collègue</p>' + PAYLOADS.img_onerror + PAYLOADS.iframe_srcdoc + PAYLOADS.form_math_mutation });
      await Templates.loadAll();
      const select = document.getElementById('template-select');
      const option = document.createElement('option');
      option.value = String(saved.id); option.textContent = 'Modèle du collègue';
      select.appendChild(option);
      select.value = String(saved.id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(1200);
      const html = Editor.getHTML();
      const result = { ran: hits(), text: /Texte du collègue/.test(html), clutter: clutter(new DOMParser().parseFromString(html, 'text/html').body) };
      option.remove();
      await h.resetEditor();
      return { pass: result.ran.length === 0 && result.text && result.clutter === 0, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'hs_editor_set_html_runs_nothing',
    description: 'Editor.setHTML : une image à gestionnaire d\'erreur dans le corps ne s\'exécute pas (ni au chargement, ni après), le reste du corps est chargé',
    run: async (h) => {
      await h.resetEditor();
      window.__hsHits = {};
      Editor.setHTML('<p>Avant</p><p>Après</p>' + PAYLOADS.img_onerror + PAYLOADS.form_math_mutation, null);
      await sleep(400);
      const html = Editor.getHTML();
      const result = { ran: hits(), kept: /Avant/.test(html) && /Après/.test(html), onerror: /onerror/i.test(html) };
      await h.resetEditor();
      return { pass: result.ran.length === 0 && result.kept && !result.onerror, notes: JSON.stringify(result) };
    },
  });

  Object.keys(PAYLOADS).forEach(name => {
    cases.push({
      id: 'hs_clean_neutralizes_' + name,
      description: 'HtmlSanitize.clean : la charge « ' + name + ' » posée dans la page ne fait rien courir, ne change pas l\'adresse de base, et le texte qui l\'entoure reste',
      run: async () => {
        const cleaned = HtmlSanitize.clean(PAYLOADS[name]);
        const result = await injectAndWatch(cleaned);
        const text = new DOMParser().parseFromString(cleaned, 'text/html').body.textContent;
        const lead = PAYLOADS[name].match(/<p[^>]*>([a-z])<\/p>/)[1];
        return { pass: result.ran.length === 0 && !result.baseChanged && result.forbidden === 0 && text.indexOf(lead) !== -1, notes: JSON.stringify({ ...result, text: text.slice(0, 40), cleaned: cleaned.slice(0, 160) }) };
      },
    });
  });

  cases.push({
    id: 'hs_clean_result_is_stable',
    description: 'HtmlSanitize.clean : nettoyer le résultat ne le change plus, pour chaque charge et pour du HTML mal formé',
    run: async () => {
      const messy = ['<p>un<p>deux<table><tr><td>x', '<b><p>gras</b>fin', '<a href="https://a.fr"><a href="https://b.fr">double</a></a>', '<table><p>texte<td>case', '<ul><li>a<ul><li>b</li></ul></li></ul>x</li>'];
      const unstable = Object.values(PAYLOADS).concat(messy).filter(html => { const once = HtmlSanitize.clean(html); return HtmlSanitize.clean(once) !== once; });
      return { pass: unstable.length === 0, notes: JSON.stringify(unstable) };
    },
  });

  cases.push({
    id: 'hs_clean_keeps_what_the_editor_writes',
    description: 'HtmlSanitize.clean ne change rien au HTML que l\'éditeur écrit : les modèles de la galerie rechargés puis relus, et toutes les balises et tous les attributs de l\'éditeur',
    run: async (h) => {
      await h.resetEditor();
      const changed = [];
      for (const dir of ['templates-gallery', 'templates-gallery-dev']) {
        const manifest = await (await fetch(dir + '/manifest.json')).json();
        for (const entry of manifest) {
          Editor.setHTML(await (await fetch(dir + '/' + entry.html)).text(), null);
          const html = Editor.getHTML();
          if (HtmlSanitize.clean(html) !== html) changed.push(entry.id);
        }
      }
      const everything = '<h1 style="text-align: center">Titre</h1>'
        + '<p>Texte <strong>gras</strong> <em>i</em> <u>s</u> <s>b</s> <code>c</code> <a href="https://exemple.fr/p?x=1&amp;y=2" target="_blank" rel="noopener noreferrer nofollow" title="lien">lien</a> '
        + '<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Note" contenteditable="false">1</sup></p>'
        + '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>fait</p></div></li></ul>'
        + '<ol start="3" data-number-style="decimal"><li><p>trois</p></li></ol><blockquote><p>cité</p></blockquote><pre><code>code</code></pre><hr>'
        + '<table style="min-width: 50px"><colgroup><col style="min-width: 25px"></colgroup><tbody><tr data-row-height="30" data-page-break-before="true"><th colspan="1" rowspan="1" data-colwidth="100"><p>h</p></th>'
        + '<td colspan="2" rowspan="1" data-tc-insertion="x"><p>c</p></td></tr></tbody></table>'
        + '<p><span class="var-badge" data-table="T" data-column="Nom" data-format="{&quot;a&quot;:1}" data-condition="{&quot;c&quot;:1}" data-loop="x" contenteditable="false">#Nom</span>'
        + '<ins data-id="i1">ajouté</ins><del data-id="d1">retiré</del><span class="comment-mark" data-comment-id="c1" id="c1">commenté</span>'
        + '<span data-type="chip" data-chip-kind="date" attrname="a" newvalue="b" previousvalue="c">x</span></p>'
        + '<img class="editor-image" src="data:image/png;base64,iVBORw0KGgo=" alt="Image" draggable="false" data-align="center" data-layer="behind" data-wrap="inline" data-page-index="1" data-page-left-pt="10" data-page-top-pt="20" data-repeat="true" data-qr-text="x" style="width: 120px">'
        + '<img src="https://exemple.fr/logo.png" alt="Logo">'
        + '<div class="callout" data-icon="info" data-color="blue" data-style="none" role="note" title="t"><p>Encadré</p></div>';
      const kept = HtmlSanitize.clean(everything);
      return { pass: changed.length === 0 && kept === normalized(everything), notes: JSON.stringify({ changed, differs: kept === normalized(everything) ? null : { kept: kept.slice(0, 300), want: normalized(everything).slice(0, 300) } }) };
    },
  });

  cases.push({
    id: 'hs_header_footer_loaded_from_a_template_drops_cadres_and_scripts',
    description: 'Un pied de page écrit dans le modèle par un autre collaborateur : le cadre à contenu intégré et la charge de mutation n\'arrivent pas dans le pied de page, le texte reste',
    run: async (h) => {
      await h.resetEditor();
      window.__hsHits = {};
      Editor.setHeaderFooterData({ ...NO_HF, enabled: true, header: { default: '<p>E</p>' + PAYLOADS.form_math_mutation, first: '' }, footer: { default: '<p>Pied de page</p>' + PAYLOADS.iframe_srcdoc + PAYLOADS.base_link, first: '' } });
      await sleep(400);
      const data = Editor.getHeaderFooterData();
      const zones = [data.header.default, data.footer.default];
      const result = { ran: hits(), text: /Pied de page/.test(data.footer.default), clutter: zones.map(z => clutter(new DOMParser().parseFromString(z, 'text/html').body)) };
      await h.resetEditor();
      return { pass: result.ran.length === 0 && result.text && result.clutter.every(n => n === 0), notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'hs_header_footer_read_from_the_column_is_filtered_at_the_source',
    description: 'En-tête et pied écrits dans la colonne HeaderFooter par un autre collaborateur : Templates les rend filtrés (quatre zones), avant la Lecture, les exports et les lots qui les lisent sans passer par l\'éditeur ; le texte, les bulles et les numéros de page restent, un contenu qui n\'est pas du texte devient vide, un JSON illisible donne la forme vide',
    run: async (h) => {
      await h.resetEditor();
      window.__hsHits = {};
      const saved = await Templates.save(null, 'Modèle du collègue (en-tête)', '<p>ok</p>', '', null, null, 'document', null);
      const badges = '<span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom">#Clients.Nom</span><span class="page-number-badge" data-format="page-n" contenteditable="false">Page 1</span>';
      const hostile = { ...NO_HF, enabled: true, differentFirstPage: true,
        header: { default: '<p>En-tête</p>' + badges + PAYLOADS.img_onerror, first: '<p>Première</p>' + PAYLOADS.script },
        footer: { default: '<p>Pied</p>' + PAYLOADS.iframe_srcdoc + PAYLOADS.javascript_src, first: '<p>Pied première</p>' + PAYLOADS.form_math_mutation } };
      window.__gristStub.remoteWrite('Publipostage_Modeles', saved.id, { HeaderFooter: JSON.stringify(hostile) });
      await Templates.loadAll();
      const hf = Templates.byId(saved.id).headerFooter;
      const zones = [hf.header.default, hf.header.first, hf.footer.default, hf.footer.first];
      const texts = ['En-tête', 'Première', 'Pied', 'Pied première'];
      const result = {
        ran: hits(),
        kept: zones.map((z, i) => z.indexOf(texts[i]) !== -1),
        clutter: zones.map(z => clutter(new DOMParser().parseFromString(z, 'text/html').body)),
        flags: [hf.enabled, hf.differentFirstPage],
        badges: [/data-key="Clients\.Nom"/.test(hf.header.default), /class="page-number-badge"[^>]*data-format="page-n"|data-format="page-n"[^>]*class="page-number-badge"/.test(hf.header.default)],
      };
      // Des zones qui ne sont pas du texte (un nombre, un objet, null) deviennent vides ; un JSON illisible donne la forme vide, sans exception.
      window.__gristStub.remoteWrite('Publipostage_Modeles', saved.id, { HeaderFooter: JSON.stringify({ enabled: true, header: { default: 42, first: { a: 1 } }, footer: null }) });
      await Templates.loadAll();
      const odd = Templates.byId(saved.id).headerFooter;
      window.__gristStub.remoteWrite('Publipostage_Modeles', saved.id, { HeaderFooter: '{pas du JSON' });
      await Templates.loadAll();
      const broken = Templates.byId(saved.id).headerFooter;
      result.odd = [odd.header.default, odd.header.first, odd.footer.default, odd.footer.first];
      result.broken = [broken.enabled, broken.header.default, broken.footer.default];
      await h.resetEditor();
      const pass = result.ran.length === 0 && result.kept.every(Boolean) && result.clutter.every(n => n === 0) && result.flags[0] === true && result.flags[1] === true
        && result.badges.every(Boolean) && result.odd.every(z => z === '') && result.broken[0] === false && result.broken[1] === '' && result.broken[2] === '';
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'hs_helpers_that_reread_html_do_it_inertly',
    description: 'Les aides qui relisent du HTML pour le réécrire ou en tirer du texte (numéros de page d\'un en-tête, texte brut d\'un e-mail, retrait ou réalignement des bulles d\'un modèle de la galerie) le font dans un contenu inerte : une image piégée n\'est pas chargée, son gestionnaire ne part pas ; le résultat reste ce qu\'il était',
    run: async () => {
      window.__hsHits = {};
      const trap = `<img src="x" onerror="${hit('helper_img')}">`;
      const pages = PageLayout.resolvePageNumberBadges('<p>Pied <span class="page-number-badge" data-format="n-slash-total">?</span></p>' + trap, 2, 5);
      const mail = MailtoExport.plainTextFromHtml('<p>Bonjour</p><p>Deuxième ligne</p>' + trap);
      const badge = '<span class="var-badge" data-table="Client" data-column="Nom" data-key="Client.Nom">#Client.Nom</span>';
      const stripped = TemplateGallery.stripVariableBadges('<p>Bonjour ' + badge + '</p>' + trap);
      const rebound = TemplateGallery.rebindVariableTable('<p>Bonjour ' + badge + '</p>' + trap, 'Client', 'Clients_2');
      await sleep(500);
      const result = {
        ran: hits(),
        pages: /2\/5/.test(pages) && !/\?/.test(pages.replace(/<img[^>]*>/g, '')),
        mail: mail === 'Bonjour\n\nDeuxième ligne',
        stripped: !/var-badge/.test(stripped) && /Bonjour/.test(stripped),
        rebound: /data-table="Clients_2"/.test(rebound) && /data-key="Clients_2\.Nom"/.test(rebound) && /#Clients_2\.Nom/.test(rebound),
      };
      return { pass: result.ran.length === 0 && result.pages && result.mail && result.stripped && result.rebound, notes: JSON.stringify({ result, pages, mail }) };
    },
  });

  cases.push({
    id: 'hs_reader_mode_neutralizes_the_mutation_and_cadre_payloads',
    description: 'Mode Lecture : le HTML brut d\'un modèle (celui d\'un macro-modèle va tel quel à la Lecture) ne fait rien courir et n\'y laisse ni cadre, ni balise de base',
    run: async (h) => {
      await h.resetEditor();
      window.__hsHits = {};
      const baseBefore = document.baseURI;
      const content = await h.renderReaderMode('<p>Lecture</p>' + PAYLOADS.form_math_mutation + PAYLOADS.iframe_srcdoc + PAYLOADS.base_link, NO_HF);
      await sleep(400);
      const result = { ran: hits(), text: /Lecture/.test(content.textContent), baseChanged: document.baseURI !== baseBefore, clutter: clutter(content) };
      document.getElementById('reader-container').style.display = '';
      document.getElementById('editor-container').style.display = '';
      return { pass: result.ran.length === 0 && result.text && !result.baseChanged && result.clutter === 0, notes: JSON.stringify(result) };
    },
  });

  // Un style qui charge une ressource (contrôle du 04/10, « Tout corriger » : « le filtre ne borne à aucun domaine les sources d'image/CSS ») : le navigateur contacte le site au simple affichage,
  // sans qu'aucune <img> ne le signale. [nom, style écrit, déclaration qui doit rester]. `u\72l(` est un url() écrit avec un échappement CSS.
  const STYLE_LOADS = [
    ['background', 'background: url(https://pixel.test/a.png) no-repeat; text-align: center', 'text-align: center'],
    ['list-style-image', 'list-style-image: url(\'//pixel.test/b.gif\'); color: rgb(1, 2, 3)', 'color: rgb(1, 2, 3)'],
    ['border-image', 'border-image: url(https://pixel.test/c.png) 30 round; width: 10px', 'width: 10px'],
    ['cursor', 'cursor: url(https://pixel.test/d.cur), auto; opacity: 0.5', 'opacity: 0.5'],
    ['filter', 'filter: url(https://pixel.test/e.svg#f); margin-top: 3px', 'margin-top: 3px'],
    ['image-set', 'background-image: image-set("https://pixel.test/f.png" 1x); height: 5px', 'height: 5px'],
    ['webkit-image-set', 'background-image: -webkit-image-set(url(https://pixel.test/g.png) 1x); height: 6px', 'height: 6px'],
    ['webkit-cross-fade', 'background-image: -webkit-cross-fade(url(https://pixel.test/h.png), url(https://pixel.test/i.png), 50%); height: 7px', 'height: 7px'],
    ['escaped', 'background-image: u\\72l(https://pixel.test/j.png); width: 7px', 'width: 7px'],
    ['custom-property', '--pixel: url(https://pixel.test/k.png); background-image: var(--pixel); width: 8px', 'width: 8px'],
    ['custom-property-escaped', '--pixel: u\\72l(https://pixel.test/l.png); background-image: var(--pixel); width: 9px', 'width: 9px'],
  ];
  const styleOf = html => { const p = new DOMParser().parseFromString(html, 'text/html').body.firstElementChild; return p.getAttribute('style') || ''; };

  cases.push({
    id: 'hs_clean_drops_style_declarations_that_load_a_resource',
    description: 'HtmlSanitize.clean : une déclaration de style qui charge une ressource (url(), image-set(), cross-fade(), un échappement u\\72l, une propriété personnalisée) est retirée, les autres déclarations du même style restent, et le résultat est stable',
    run: async () => {
      const bad = [];
      STYLE_LOADS.forEach(([name, style, keeps]) => {
        const raw = '<p style="' + attr(style) + '">texte</p>';
        const cleaned = HtmlSanitize.clean(raw);
        const left = styleOf(cleaned);
        if (/pixel\.test|url\s*\(|image-set|cross-fade|--pixel\s*:/i.test(left)) bad.push(name + ' : reste « ' + left + ' »');
        if (keeps && left.replace(/\s+/g, '').indexOf(keeps.replace(/\s+/g, '')) === -1) bad.push(name + ' : « ' + keeps + ' » a disparu (reste « ' + left + ' »)');
        if (HtmlSanitize.clean(cleaned) !== cleaned) bad.push(name + ' : résultat instable');
        if (cleaned.indexOf('texte') === -1) bad.push(name + ' : le texte a disparu');
      });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  cases.push({
    id: 'hs_clean_style_loading_a_resource_never_reaches_the_computed_style',
    description: 'Le navigateur ne voit plus rien à charger : posée dans la page, la version filtrée n\'a plus ni image de fond, ni image de puce, ni image de bordure, ni curseur ou filtre venus d\'un autre site (témoin : la version brute, elle, en a)',
    run: async () => {
      const properties = ['backgroundImage', 'listStyleImage', 'borderImageSource', 'cursor', 'filter'];
      const probe = html => {
        const host = document.createElement('div');
        host.style.cssText = 'position:absolute;left:-9999px;top:0';
        host.innerHTML = html;
        document.body.appendChild(host);
        const computed = Array.from(host.children).map(el => { const css = getComputedStyle(el); return properties.map(key => css[key]).join(' | '); }).join(' || ');
        host.remove();
        return computed;
      };
      const raw = STYLE_LOADS.map(([, style]) => '<p style="' + attr(style) + '">x</p>').join('');
      const cleaned = HtmlSanitize.clean(raw);
      const seenRaw = probe(raw);
      const seenCleaned = probe(cleaned);
      return { pass: /pixel\.test/.test(seenRaw) && !/pixel\.test/.test(seenCleaned), notes: JSON.stringify({ raw: seenRaw.slice(0, 200), cleaned: seenCleaned.slice(0, 200) }) };
    },
  });

  cases.push({
    id: 'hs_reader_mode_drops_style_resources',
    description: 'Mode Lecture : le style d\'un modèle qui charge une ressource d\'un autre site n\'y arrive pas (image de fond non posée), le reste du style et le texte restent',
    run: async (h) => {
      await h.resetEditor();
      let seen = null;
      try {
        const content = await h.renderReaderMode('<p id="fond" style="background-image: url(https://pixel.test/z.png); text-align: center">Lecture</p>', NO_HF);
        await sleep(200);
        const p = content.querySelector('p');
        const css = getComputedStyle(p);
        seen = { backgroundImage: css.backgroundImage, textAlign: css.textAlign, text: p.textContent };
      } finally {
        document.getElementById('reader-container').style.display = '';
        document.getElementById('editor-container').style.display = '';
      }
      return { pass: !!seen && seen.backgroundImage === 'none' && seen.textAlign === 'center' && seen.text === 'Lecture', notes: JSON.stringify(seen) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.htmlSanitize = cases;
})();
