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
        const manifest = await (await fetch(dir + '/catalogue.json')).json();
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
        mail: mail === 'Bonjour\nDeuxième ligne',
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

  // Dom.inertTemplate et Dom.setMarkup (js/dom.js) : le seul endroit du widget qui lit une chaîne de balisage pour en faire des nœuds (audit externe du 21/10, point C-XSS-01).
  cases.push({
    id: 'hs_dom_markup_helper_reads_inertly_and_like_inner_html',
    description: 'Dom.setMarkup pose le balisage comme le faisait innerHTML (icônes, tableau, entités, style en tête, vide, null, racine d\'ombre, remplacement du contenu) et Dom.inertTemplate ne fait rien courir tant que le contenu n\'est pas posé ; un <script> posé ne court jamais',
    run: async () => {
      window.__hsHits = {};
      const samples = {
        icone: Icons.svg('trash'),
        icones: ['bold', 'alignLeft', 'linkedTable', 'more', 'varLinked', 'compareColumns', 'acceptAll', 'gridBreak', 'eye', 'eyeOff', 'edit'].map(name => Icons.svg(name)).join(''),
        entites: '<span class="a">x &amp; y &lt;b&gt;</span> texte',
        tableau: '<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table><p>après</p>',
        style_en_tete: '<style>.x{color:red}</style><p>a</p>',
        deux_blocs: '<p>un</p>\n<p>deux</p>',
        vide: '',
      };
      const same = {};
      for (const [name, html] of Object.entries(samples)) {
        const a = document.createElement('div');
        const b = document.createElement('div');
        Dom.setMarkup(a, html);
        b.innerHTML = html;
        same[name] = a.innerHTML === b.innerHTML && a.childNodes.length === b.childNodes.length;
      }
      const nullHost = document.createElement('div'); nullHost.innerHTML = '<i>avant</i>'; Dom.setMarkup(nullHost, null);
      const replaced = document.createElement('div'); replaced.innerHTML = '<i>avant</i><u>aussi</u>'; Dom.setMarkup(replaced, '<b>après</b>');
      const shadow = document.createElement('div').attachShadow({ mode: 'open' }); Dom.setMarkup(shadow, '<i>ombre</i>');
      // Lu, pas posé : aucune charge ne court (image à gestionnaire d'erreur, svg, cadre à contenu intégré...).
      const templates = Object.values(PAYLOADS).map(html => Dom.inertTemplate(html));
      await sleep(300);
      const ranWhileInert = hits();
      // Posé : un <script> lu par le balisage ne court jamais (comme avec innerHTML).
      const live = document.createElement('div');
      Dom.setMarkup(live, `<script>${hit('dom_script')}</script><p>texte</p>`);
      document.body.appendChild(live);
      await sleep(250);
      const scriptKept = live.querySelectorAll('script').length === 1;
      const ranWhenPlaced = hits();
      live.remove();
      const result = {
        same,
        nullHost: nullHost.innerHTML === '',
        replaced: replaced.innerHTML === '<b>après</b>',
        shadow: shadow.innerHTML === '<i>ombre</i>',
        parsed: templates.every(t => t instanceof HTMLTemplateElement && t.content.childNodes.length > 0),
        ranWhileInert,
        scriptKept,
        ranWhenPlaced,
      };
      const pass = Object.values(same).every(Boolean) && result.nullHost && result.replaced && result.shadow && result.parsed
        && ranWhileInert.length === 0 && scriptKept && ranWhenPlaced.length === 0;
      return { pass, notes: JSON.stringify(result) };
    },
  });

  // Point sécurité du 06/11 : les moteurs d'export Word, PDF et Excel lisaient leur HTML par `innerHTML` sur un nœud de la page (même détaché, le navigateur y charge les images et fait courir leur
  // `onerror`) en comptant sur le filtre posé en amont (ReaderMode.preview). Ils le lisent maintenant par Dom.setMarkup(HtmlSanitize.clean(...)) : si un chemin d'amont oubliait un jour de filtrer,
  // rien de ce HTML ne court. Le test simule cet oubli : ReaderMode.preview rend du HTML brut piégé, pour le corps et pour l'en-tête.
  cases.push({
    id: 'hs_export_engines_run_nothing_on_unfiltered_html',
    description: 'Word et PDF (corps, en-tête et pied) : du HTML brut piégé rendu par l\'amont ne fait rien courir (image à onerror, script, attribut on*), et le fichier est quand même fabriqué avec le texte',
    run: async () => {
      window.__hsHits = {};
      const trap = key => `<img src="x" onerror="${hit(key)}"><p onclick="${hit(key + '_click')}">piege</p><script>${hit(key + '_script')}</script>`;
      const HF = { enabled: true, differentFirstPage: false, header: { default: '<p>ZONE-HAUT</p>', first: '' }, footer: { default: '<p>ZONE-BAS</p>', first: '' } };
      const real = ReaderMode.preview;
      ReaderMode.preview = async (html) => (String(html).indexOf('ZONE-') !== -1 ? '<p>Zone propre</p>' + trap('zone') : '<p>Corps propre</p>' + trap('corps'));
      const out = {};
      try {
        await DocxExport.ensureDocxLibLoaded();
        const docx = await DocxExport.getDocxBlobForRecord('<p>a</p>', null, {}, '', HF, null);
        out.docxBytes = docx.blob.size;
        out.docxHits = hits().slice();
        window.__hsHits = {};
        const pdf = await PdfExport.getNativePdfBlobForRecord('<p>a</p>', null, {}, '', HF, undefined);
        out.pdfBytes = pdf.blob.size;
        await sleep(600);
        out.pdfHits = hits().slice();
      } catch (e) { out.error = String(e && e.message || e); } finally { ReaderMode.preview = real; }
      await sleep(300);
      return { pass: !out.error && out.docxBytes > 1000 && out.pdfBytes > 1000 && out.docxHits.length === 0 && out.pdfHits.length === 0, notes: JSON.stringify(out) };
    },
  });

  // --- colspan et rowspan : bornés partout (essai d'injection du 18/11 : un tableau à colspan="9999999", écrit dans un modèle ou collé, figeait l'éditeur, plantait le Word et figeait le PDF) ---
  // Les valeurs lues d'une case : 1 à 1 000, 1 pour tout ce qui n'est pas un entier positif. Les tests « figés avant » ne sont lancés qu'avec la borne : sur l'ancien code ils ne rendent pas la main.
  const GIANT = 9999999;
  const spanTable = (cellAttrs, rows) => '<p>avant</p><table><tbody>' + Array.from({ length: rows || 2 }, (_, r) => '<tr>' + [0, 1].map(c => `<td${r === 0 && c === 0 ? ' ' + cellAttrs : ''}><p>${'AB'[c]}${r + 1}</p></td>`).join('') + '</tr>').join('') + '</tbody></table><p>après</p>';
  const spansOfEditor = () => {
    const out = [];
    EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') out.push([node.attrs.colspan, node.attrs.rowspan]); });
    return out;
  };
  const withinMs = async (ms, work) => { const t0 = performance.now(); const value = await Promise.race([work(), sleep(ms).then(() => { throw new Error('délai de ' + ms + ' ms dépassé'); })]); return { value, ms: Math.round(performance.now() - t0) }; };

  cases.push({
    id: 'hs_table_spans_are_bounded_by_the_filter',
    description: 'HtmlSanitize.clean : le colspan et le rowspan d\'une case sont des entiers de 1 à 1 000 (9999999 devient 1000 ; « abc », 0, -3, vide, 1e9 deviennent 1), un rowspan ne dépasse pas les lignes du tableau, le résultat est stable ; spanValue en dit autant',
    run: async () => {
      const values = [[String(GIANT), 1000], ['abc', 1], ['0', 1], ['-3', 1], ['', 1], ['3', 3], ['2.7', 2], [' 5 ', 5], ['1e9', 1], ['1000', 1000], ['1001', 1000]];
      const read = (html, name) => Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('td, th')).map(c => c.getAttribute(name));
      // Les colspan, sur une ligne : le rectangle annoncé est celui que les cases couvrent, aucune limite de tableau n'entre en jeu.
      const oneRow = '<table><tbody><tr>' + values.map(([v]) => `<td colspan="${v}">x</td>`).join('') + `<th colspan="${GIANT}">h</th></tr></tbody></table>`;
      const cleanedCols = HtmlSanitize.clean(oneRow);
      const cols = read(cleanedCols, 'colspan');
      // Les rowspan, sur 1 005 lignes (un rowspan va jusqu'au bas du tableau, pas au-delà).
      const tall = '<table><tbody><tr>' + values.map(([v]) => `<td rowspan="${v}">x</td>`).join('') + `<th rowspan="${GIANT}">h</th></tr>` + '<tr><td>y</td></tr>'.repeat(1004) + '</tbody></table>';
      const cleanedRows = HtmlSanitize.clean(tall);
      const rows = read(cleanedRows, 'rowspan').slice(0, 12);
      // Un tableau d'une ligne : un rowspan ne peut pas la dépasser.
      const short = read(HtmlSanitize.clean('<table><tbody><tr><td rowspan="5">a</td><td>b</td></tr></tbody></table>'), 'rowspan');
      const expected = values.map(([, n]) => String(n)).concat(['1000']);
      const direct = [HtmlSanitize.spanValue(null), HtmlSanitize.spanValue(undefined), HtmlSanitize.spanValue('abc'), HtmlSanitize.spanValue(GIANT), HtmlSanitize.spanValue('7')];
      const stable = HtmlSanitize.clean(cleanedCols) === cleanedCols && HtmlSanitize.clean(cleanedRows) === cleanedRows;
      const pass = JSON.stringify(cols) === JSON.stringify(expected) && JSON.stringify(rows) === JSON.stringify(expected) && short[0] === '1'
        && JSON.stringify(direct) === JSON.stringify([1, 1, 1, 1000, 7]) && stable && HtmlSanitize.MAX_SPAN === 1000;
      return { pass, notes: JSON.stringify({ cols, rows, short, direct, stable }) };
    },
  });

  cases.push({
    id: 'hs_table_spans_one_wide_cell_does_not_widen_every_row',
    description: 'HtmlSanitize.clean : un colspan de 1000 dans la première ligne d\'un tableau de 200 lignes de deux cases est ramené à 2 (sinon chaque ligne recevait 998 cases en plus), alors que les fusions honnêtes ne bougent pas : titre sur toute la largeur, cellule sur deux lignes, page web aux lignes inégales',
    run: async () => {
      const row = n => '<tr>' + '<td>x</td>'.repeat(n) + '</tr>';
      const colspanOfFirst = html => new DOMParser().parseFromString(HtmlSanitize.clean(html), 'text/html').querySelector('td').getAttribute('colspan');
      const hostile = `<table><tbody><tr><td colspan="1000">titre</td></tr>${row(2).repeat(199)}</tbody></table>`;
      const title = `<table><tbody><tr><td colspan="6">titre</td></tr>${row(6).repeat(20)}</tbody></table>`;
      const wide = `<table><tbody><tr><td colspan="300">titre</td></tr>${row(300).repeat(3)}</tbody></table>`;
      const ragged = `<table><tbody><tr><td colspan="8">titre</td></tr>${row(8)}${row(5)}${row(8)}</tbody></table>`;
      const down = new DOMParser().parseFromString(HtmlSanitize.clean(`<table><tbody><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr><tr><td>d</td><td>e</td></tr></tbody></table>`), 'text/html').querySelector('td').getAttribute('rowspan');
      const got = { hostile: colspanOfFirst(hostile), title: colspanOfFirst(title), wide: colspanOfFirst(wide), ragged: colspanOfFirst(ragged), down };
      return { pass: got.hostile === '2' && got.title === '6' && got.wide === '300' && got.ragged === '8' && got.down === '2', notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'hs_table_spans_invalid_values_open_without_error',
    description: 'Editor.setHTML : un tableau dont une case porte un colspan ou un rowspan invalide (« abc », 0, -3) s\'ouvre sans erreur, la case compte pour 1 et le texte est gardé (avant : « No cell with offset… » et un éditeur vide)',
    run: async () => {
      const out = [];
      for (const attrs of ['colspan="abc"', 'rowspan="0"', 'colspan="-3"', 'rowspan="x"', 'colspan="" rowspan=""']) {
        let error = '';
        try { Editor.setHTML(spanTable(attrs), null); await sleep(150); } catch (e) { error = String(e && e.message || e).slice(0, 80); }
        const spans = error ? [] : spansOfEditor();
        const html = error ? '' : Editor.getHTML();
        out.push({ attrs, error, spans: JSON.stringify(spans), text: /A1/.test(html) && /B2/.test(html) && /après/.test(html) });
      }
      const pass = out.every(o => !o.error && o.text && JSON.parse(o.spans).length === 4 && JSON.parse(o.spans).every(([c, r]) => c === 1 && r === 1));
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'hs_table_spans_giant_values_open_and_paste_fast',
    description: 'Editor.setHTML et le collage : un tableau à colspan de 9999999, seul ou dans une première ligne de 200 lignes, s\'ouvre et se colle en moins de 4 secondes sans ajouter de milliers de cases, les cases valent 1000 au plus, le reste du document est là (avant : éditeur figé, 9 secondes pour 200 lignes, 89 pour 1 000)',
    run: async () => {
      const out = {};
      const countCells = () => spansOfEditor().length;
      const flat = '<p>avant</p><table><tbody><tr><td colspan="' + GIANT + '" rowspan="' + GIANT + '"><p>A1</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr></tbody></table><p>après</p>';
      const tall = '<p>avant</p><table><tbody><tr><td colspan="' + GIANT + '"><p>A1</p></td></tr>' + Array.from({ length: 199 }, (_, r) => `<tr><td><p>A${r + 2}</p></td><td><p>B${r + 2}</p></td></tr>`).join('') + '</tbody></table><p>après</p>';
      const paste = async (html) => {
        Editor.setHTML('<p>base</p>', null); await sleep(150);
        EditorCore.getEditor().commands.focus('end');
        const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', 'texte');
        document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        await sleep(300);
      };
      const flatOpen = await withinMs(8000, async () => { Editor.setHTML(flat, null); await sleep(150); return spansOfEditor(); });
      out.flatOpen = { ms: flatOpen.ms, cells: flatOpen.value.length, max: Math.max(...flatOpen.value.flat()) };
      const tallOpen = await withinMs(30000, async () => { Editor.setHTML(tall, null); await sleep(150); return spansOfEditor(); });
      out.tallOpen = { ms: tallOpen.ms, cells: tallOpen.value.length, first: tallOpen.value[0] };
      const flatPaste = await withinMs(8000, async () => { await paste(flat); return spansOfEditor(); });
      out.flatPaste = { ms: flatPaste.ms, cells: flatPaste.value.length };
      const tallPaste = await withinMs(30000, async () => { await paste(tall); return spansOfEditor(); });
      out.tallPaste = { ms: tallPaste.ms, cells: tallPaste.value.length };
      const html = Editor.getHTML();
      const pass = flatOpen.ms < 4000 && flatOpen.value.length <= 8 && out.flatOpen.max === 1000
        && tallOpen.ms < 4000 && tallOpen.value.length < 600 && tallOpen.value[0][0] === 2
        && flatPaste.ms < 4000 && flatPaste.value.length <= 8 && tallPaste.ms < 4000 && tallPaste.value.length < 600
        && /A1/.test(html) && /B200/.test(html) && /après/.test(html);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'hs_table_spans_exports_survive_giant_values',
    description: 'Word, PDF, ODT et Excel d\'un tableau à colspan et rowspan de 9999999 : chaque fichier est fabriqué en moins de 30 secondes, avec le texte du tableau (avant : Word plantait l\'onglet, le PDF se figeait, ODT et Excel levaient une erreur)',
    run: async () => {
      const html = spanTable(`colspan="${GIANT}" rowspan="${GIANT}"`);
      const HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
      const out = {};
      const make = async (name, work) => {
        try { const r = await withinMs(30000, work); out[name] = { ms: r.ms, bytes: r.value }; } catch (e) { out[name] = { error: String(e && e.message || e).slice(0, 100) }; }
      };
      await DocxExport.ensureDocxLibLoaded();
      await make('docx', async () => (await DocxExport.getDocxBlobForRecord(html, null, {}, '', HF, null)).blob.size);
      await make('odt', async () => (await OdtExport.getOdtBlobForRecord(html, null, {}, '', HF, null)).blob.size);
      await XlsxExport.ensureExcelLibLoaded();
      await make('xlsx', async () => (await XlsxExport.getXlsxBlobForRecord(html, null, {}, '', {})).blob.size);
      await PdfExport.ensurePdfLibsLoaded();
      await make('pdf', async () => (await PdfExport.getNativePdfBlobForRecord(html, null, {}, '', HF, undefined)).blob.size);
      const pass = ['docx', 'odt', 'xlsx', 'pdf'].every(k => out[k] && !out[k].error && out[k].bytes > 1000);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'hs_table_spans_imports_write_bounded_values',
    description: 'Import Word et PowerPoint : un gridSpan, un gridBefore ou un rowSpan de 9999999 donne un colspan ou un rowspan de 1000 au plus, une valeur illisible donne 1, le texte des cases est gardé',
    run: async () => {
      await ExportEngines.loadAll();
      await ExportCommon.ensureJsZipLoaded();
      const zipOf = async (parts) => { const z = new JSZip(); Object.entries(parts).forEach(([k, v]) => z.file(k, v)); return z.generateAsync({ type: 'arraybuffer' }); };
      const CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>';
      const rels = (type, target) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;
      const spansIn = html => (String(html).match(/(?:col|row)span="\d+"/g) || []);
      const out = {};
      const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
      const wc = (props, text) => `<w:tc><w:tcPr>${props}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
      const docx = `<?xml version="1.0"?><w:document ${W}><w:body><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w="3000"/><w:gridCol w="3000"/></w:tblGrid><w:tr><w:trPr><w:gridBefore w:val="${GIANT}"/></w:trPr>${wc(`<w:gridSpan w:val="${GIANT}"/>`, 'AA')}${wc('', 'BB')}</w:tr><w:tr>${wc('<w:gridSpan w:val="abc"/>', 'CC')}${wc('', 'DD')}</w:tr></w:tbl><w:p><w:r><w:t>fin</w:t></w:r></w:p></w:body></w:document>`;
      const word = await withinMs(20000, async () => DocxImport.fromBuffer(await zipOf({ '[Content_Types].xml': CT, '_rels/.rels': rels('officeDocument', 'word/document.xml'), 'word/document.xml': docx })));
      out.docx = { ms: word.ms, spans: spansIn(word.value.html), text: /AA/.test(word.value.html) && /CC/.test(word.value.html) };
      const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
      const tc = (attrs, t) => `<a:tc ${attrs}><a:txBody><a:bodyPr/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`;
      const slide = `<?xml version="1.0"?><p:sld ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="T"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="100000" y="100000"/><a:ext cx="6000000" cy="1000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="3000000"/><a:gridCol w="3000000"/></a:tblGrid><a:tr h="500000">${tc(`rowSpan="${GIANT}" gridSpan="${GIANT}"`, 'AA')}${tc('', 'BB')}</a:tr><a:tr h="500000">${tc('rowSpan="abc"', 'CC')}${tc('', 'DD')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`;
      const pres = `<?xml version="1.0"?><p:presentation ${P}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`;
      const slideRels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>';
      const pptx = await withinMs(20000, async () => PptxImport.fromBuffer(await zipOf({ '[Content_Types].xml': CT, '_rels/.rels': rels('officeDocument', 'ppt/presentation.xml'), 'ppt/presentation.xml': pres, 'ppt/_rels/presentation.xml.rels': slideRels, 'ppt/slides/slide1.xml': slide })));
      out.pptx = { ms: pptx.ms, spans: spansIn(pptx.value.html), text: /AA/.test(pptx.value.html) && /CC/.test(pptx.value.html) };
      const bounded = list => list.length > 0 && list.every(v => Number(v.replace(/\D/g, '')) >= 2 && Number(v.replace(/\D/g, '')) <= 1000);
      const pass = bounded(out.docx.spans) && out.docx.text && bounded(out.pptx.spans) && out.pptx.text;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'hs_table_spans_rejecting_a_tracked_change_stays_bounded',
    description: 'Suivi des modifications : « Refuser » le changement du colspan d\'une case dont l\'ancienne valeur enregistrée est 9999999 la remet à la largeur du tableau (2 ici), sans ajouter de cases aux autres lignes (avant : éditeur figé)',
    run: async () => {
      const mark = JSON.stringify({ id: 7, type: 'attr', attrName: 'colspan', previousValue: GIANT, newValue: 2 }).replace(/"/g, '&quot;');
      Editor.setHTML(`<p>avant</p><table><tbody><tr><td colspan="2" data-tc-modification="${mark}"><p>AA</p></td></tr><tr><td><p>BB</p></td><td><p>CC</p></td></tr></tbody></table><p>après</p>`, null);
      await sleep(200);
      const editor = EditorCore.getEditor();
      let marked = 0;
      editor.state.doc.descendants((node) => { if (node.marks.some(m => m.type.name === 'modification')) marked += 1; });
      const done = await withinMs(8000, async () => {
        const tr = editor.state.tr;
        TrackChangesResolve.resolveModifications(tr, new Set(['7']), false);
        editor.view.dispatch(tr);
        await sleep(200);
        return spansOfEditor();
      });
      return { pass: marked === 1 && done.value.length === 3 && done.value[0][0] === 2 && done.ms < 4000, notes: JSON.stringify({ marked, ms: done.ms, spans: done.value }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.htmlSanitize = cases;
})();
