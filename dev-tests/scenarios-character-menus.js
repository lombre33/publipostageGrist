// Suite "characterMenus" - les menus « Souligné » et « Aa » (js/character-format.js : `wireMenus`, index.html), à la place de la fenêtre « Caractère… » du menu Alignement. Demande d'Antoine du 04/11 : « la partie caractère n'a pas
// sa place dans le menu alignement [...] ne pas passer par une popup mais un menu d'outils », « exposant et indice » dans ce menu, « les soulignements dans le bouton souligner, avec une première ligne par défaut du
// soulignage classique et après en dessous les autres options » ; cartes « Placer le menu « Caractère », avec exposant et indice, à quel endroit ? » : « A - Bouton « Aa » après Barré ».
// Ces cas jouent, DANS la page, ce que la souris ne peut pas mesurer seule : le placement (le bouton « Aa » juste après Barré, la ligne « Caractère… » et ses deux icônes partis des menus Alignement et « Lien et blocs »),
// chaque ligne qui s'applique tout de suite et se défait en UN Annuler, l'espacement (pas de 0,5 pt, bornes, valeur saisie, saisie fausse), l'état que le menu montre (coche, tiret quand la sélection est partagée, « Aa » enfoncé),
// les soulignements (la ligne active retire, une autre remplace), le style de frappe d'un curseur seul, les verrous (email : seuls l'exposant et l'indice restent ; macro-modèle : tout le menu ; Lecture) et l'anglais.
// Les réglages eux-mêmes (HTML, Lecture, PDF, Word, PowerPoint) sont à scenarios-character-format.js ; la vraie souris et le vrai clavier à 700 x 400 : verify-character-format-mouse.mjs (groupe Node "characterFormatMouse").
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const byId = id => document.getElementById(id);
  const ed = () => EditorCore.getEditor();
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  const say = () => byId('status-msg').textContent.trim();
  const clearSaid = () => { byId('status-msg').textContent = ''; };
  const checked = id => (byId(id) ? byId(id).getAttribute('aria-checked') : null);
  const blocks = id => !!byId(id) && byId(id).hasAttribute('data-pp-lock-blocks');

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  // La place d'un mot dans le document : { from, to }.
  function wordRange(word) {
    let found = null;
    ed().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const i = node.text.indexOf(word);
      if (i !== -1) found = { from: pos + i, to: pos + i + word.length };
    });
    return found;
  }
  async function select(fromWord, toWord) {
    const a = wordRange(fromWord);
    const b = toWord ? wordRange(toWord) : a;
    ed().commands.setTextSelection({ from: a.from, to: b.to });
    await sleep(100);
  }
  // Le groupe est « survolé » : le menu relit l'état du texte, comme à l'ouverture par la souris (le :hover du CSS ne s'active pas par dispatchEvent).
  const enter = id => byId(id).dispatchEvent(new MouseEvent('mouseenter'));
  // Le dessin d'une icône tel que le navigateur le relit (jamais la chaîne de js/icons.js).
  const drawing = svg => (svg ? svg.innerHTML : '');
  const fromIcons = name => { const box = document.createElement('div'); Dom.setMarkup(box, Icons.svg(name)); return drawing(box.querySelector('svg')); };
  const drawn = id => { const el = byId(id); return drawing(el && el.querySelector('svg')); };
  async function goToNew(h, kind) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-' + kind);
    await sleep(kind === 'macro' ? 200 : 300);
    if (kind === 'macro') {
      byId('macro-editor-name').value = 'Macro des caractères';
      byId('macro-editor-save').click();
      await sleep(400);
    }
  }
  // La saisie de l'espacement comme une personne : le champ prend le focus, reçoit le texte (événement `input`), puis Entrée.
  function typeSpacing(text, key) {
    const input = byId('v2-char-spacing-val');
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (key) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    return input;
  }

  cases.push({
    id: 'cm_aa_follows_strike_and_the_window_row_and_the_icons_left_their_old_menus',
    description: 'Le bouton « Aa » est juste après Barré, suivi d\'un filet puis du groupe Alignement ; son menu a le titre « Caractère », Exposant et Indice (mêmes identifiants, icônes enfoncées par aria-pressed), puis Petites capitales, Ombre, Contour et Espacement ; la ligne « Caractère… » n\'est plus dans le menu Alignement, ni la fenêtre, ni les deux icônes dans « Lien et blocs de contenu »',
    run: async (h) => {
      await h.resetEditor();
      const strike = byId('v2-btn-strike');
      const group = byId('v2-char-group');
      const main = byId('v2-btn-char-main');
      const flyout = byId('v2-char-flyout');
      const order = Array.from(flyout.children).map(el => el.id || el.className.replace('v2-hover-', ''));
      const alignText = byId('v2-align-group').textContent;
      const facts = {
        afterStrike: strike.nextElementSibling === group && group.nextElementSibling.classList.contains('v2-sep') && group.nextElementSibling.nextElementSibling === byId('v2-align-group'),
        icon: drawn('v2-btn-char-main') === fromIcons('character') && fromIcons('character').length > 0,
        mainAria: /Caractère/.test(main.getAttribute('aria-label')) && /survoler/.test(main.getAttribute('aria-label')) && !main.hasAttribute('data-tip'),
        title: flyout.querySelector('.v2-hover-flyout-label').textContent === 'Caractère',
        order,
        supSub: ['v2-btn-superscript', 'v2-btn-subscript'].map(id => { const el = byId(id); return !!el && el.closest('#v2-char-flyout .v2-hover-icon-row') !== null && !!el.querySelector('svg') && el.getAttribute('aria-pressed') === 'false' && !!el.getAttribute('data-tip'); }),
        notInBlocks: !byId('v2-blocks-flyout').querySelector('.v2-hover-icon-row, #v2-btn-superscript, #v2-btn-subscript'),
        gone: !byId('v2-btn-character') && !byId('pp-charfmt-modal') && typeof CharacterFormat.open === 'undefined' && !/Caractère/.test(alignText),
      };
      const pass = facts.afterStrike && facts.icon && facts.mainAria && facts.title
        && JSON.stringify(order) === JSON.stringify(['flyout-label', 'icon-row', 'hsep', 'v2-btn-char-smallcaps', 'v2-btn-char-shadow', 'v2-btn-char-stroke', 'hsep', 'v2-char-spacing'])
        && facts.supSub.every(Boolean) && facts.notInBlocks && facts.gone;
      return { pass, notes: JSON.stringify(facts) };
    },
  });

  cases.push({
    id: 'cm_underline_button_keeps_its_click_and_its_menu_lists_the_kinds_with_the_classic_one_first',
    description: 'Le bouton Souligné reste le bouton du soulignement classique (clic, Ctrl+U) et s\'ouvre en menu au survol : la première ligne est « Souligné » avec sa touche, puis un filet, puis Double, Pointillé, Tireté et Ondulé, chacune dessinée comme son trait',
    run: async (h) => {
      await setDoc(h, '<p>Un deux trois</p>');
      const group = byId('v2-underline-group');
      const button = byId('v2-btn-underline');
      const flyout = byId('v2-underline-flyout');
      const rows = Array.from(flyout.querySelectorAll('.v2-hover-row')).map(el => el.dataset.underline);
      const hint = byId('v2-underline-single').getAttribute('data-keyhint');
      const styles = Object.fromEntries(rows.map(kind => { const s = getComputedStyle(byId('v2-underline-' + kind).querySelector('.v2-underline-sample')); return [kind, s.textDecorationLine + '/' + s.textDecorationStyle]; }));
      await select('deux');
      byId('v2-btn-underline').click();
      await sleep(80);
      const afterClick = written();
      byId('v2-btn-underline').click();
      await sleep(80);
      const afterSecond = written();
      const facts = {
        first: button === group.firstElementChild && flyout.parentElement === group,
        rows,
        label: flyout.querySelector('.v2-hover-flyout-label').textContent,
        sepAfterFirst: byId('v2-underline-single').nextElementSibling.classList.contains('v2-hover-hsep'),
        hint,
        styles,
        // Comme les autres boutons à menu au survol, Souligné ne porte pas d'info-bulle (le menu le nomme, sa première ligne dit la touche) ; son nom et sa touche vont aux lecteurs d'écran.
        tip: button.hasAttribute('data-tip'),
        aria: [button.getAttribute('aria-label'), button.getAttribute('aria-keyshortcuts'), byId('v2-underline-single').getAttribute('aria-keyshortcuts')],
        clickToggles: /<u>deux<\/u>/.test(afterClick) && !/<u>/.test(afterSecond),
      };
      const pass = facts.first && JSON.stringify(rows) === JSON.stringify(['single', 'double', 'dotted', 'dashed', 'wavy']) && facts.label === 'Soulignement' && facts.sepAfterFirst
        && /^(Ctrl|⌘)\+?U$/i.test(hint || '') && facts.tip === false && facts.aria[0] === 'Souligné' && /U/i.test(facts.aria[1] || '') && /U/i.test(facts.aria[2] || '') && facts.clickToggles
        && styles.single === 'underline/solid' && styles.double === 'underline/double' && styles.dotted === 'underline/dotted' && styles.dashed === 'underline/dashed' && styles.wavy === 'underline/wavy';
      return { pass, notes: JSON.stringify(facts) };
    },
  });

  cases.push({
    id: 'cm_each_row_applies_at_once_and_is_one_undo',
    description: 'Chaque ligne du menu s\'applique tout de suite au texte choisi, sans fenêtre ni Valider, et un seul Annuler la défait (un Rétablir la remet) : petites capitales, ombre, contour, un pas d\'espacement, un soulignement double',
    run: async (h) => {
      await setDoc(h, '<p>Un deux trois</p>');
      await select('deux');
      const probes = [
        ['v2-btn-char-smallcaps', /font-variant: small-caps/],
        ['v2-btn-char-shadow', /text-shadow/],
        ['v2-btn-char-stroke', /-webkit-text-stroke/],
        ['v2-char-spacing-plus', /letter-spacing: 0\.5pt/],
        ['v2-underline-double', /<u style="text-decoration-style: double;">deux<\/u>/],
      ];
      const out = {};
      for (const [id, probe] of probes) {
        const before = written();
        byId(id).click();
        await sleep(80);
        const after = written();
        ed().commands.undo();
        await sleep(60);
        const undone = written();
        ed().commands.redo();
        await sleep(60);
        out[id] = { applied: probe.test(after) && after !== before, oneUndo: undone === before, redo: written() === after };
        ed().commands.undo();
        await sleep(40);
      }
      const modalOpen = !!byId('pp-charfmt-modal');
      const pass = probes.every(([id]) => out[id].applied && out[id].oneUndo && out[id].redo) && !modalOpen;
      return { pass, notes: JSON.stringify({ out, modalOpen }) };
    },
  });

  cases.push({
    id: 'cm_spacing_steps_by_half_a_point_stays_in_bounds_and_takes_a_typed_value',
    description: 'L\'espacement : « + » et « − » avancent de 0,5 pt (le champ le dit avec la virgule en français), restent entre −50 et 500 pt, une valeur saisie (2,5 puis Entrée) s\'applique et rend le focus au texte, un champ vidé retire l\'espacement, une saisie fausse ou hors bornes se dit (rouge et info-bulle) sans rien changer',
    run: async (h) => {
      await setDoc(h, '<p>Un deux trois</p>');
      await select('deux');
      const spacing = () => { const m = /letter-spacing: (-?[\d.]+)pt/.exec(written()); return m ? Number(m[1]) : 0; };
      const out = {};
      byId('v2-char-spacing-plus').click();
      byId('v2-char-spacing-plus').click();
      byId('v2-char-spacing-plus').click();
      await sleep(80);
      out.plus3 = spacing();
      out.field = byId('v2-char-spacing-val').value;
      for (let i = 0; i < 4; i++) byId('v2-char-spacing-minus').click();
      await sleep(80);
      out.minus4 = spacing();
      // Les bornes : 499,8 + 0,5 = 500, un pas de plus ne change plus rien ; −49,8 − 0,5 = −50.
      CharacterFormat.apply(ed(), { letterSpacing: 499.8 });
      byId('v2-char-spacing-plus').click();
      const top = spacing();
      const htmlTop = written();
      byId('v2-char-spacing-plus').click();
      out.top = [top, written() === htmlTop];
      CharacterFormat.apply(ed(), { letterSpacing: -49.8 });
      byId('v2-char-spacing-minus').click();
      const bottom = spacing();
      const htmlBottom = written();
      byId('v2-char-spacing-minus').click();
      out.bottom = [bottom, written() === htmlBottom];
      // Une valeur saisie, comme on la tape en français.
      enter('v2-char-group');
      const input = typeSpacing('2,5', 'Enter');
      await sleep(80);
      out.typed = spacing();
      out.focusBack = !!document.activeElement && document.activeElement.classList.contains('ProseMirror');
      out.fieldAfter = input.value;
      // Une saisie qui n'est pas un nombre : rien n'est posé, le champ le dit puis reprend la valeur du texte quand on le quitte.
      const before = written();
      typeSpacing('abc');
      out.invalid = [input.getAttribute('aria-invalid'), input.title];
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(60);
      out.invalidKept = written() === before;
      input.dispatchEvent(new Event('blur'));
      out.invalidRestored = [input.value, input.hasAttribute('aria-invalid')];
      typeSpacing('600', 'Enter');
      await sleep(60);
      out.outOfRange = [input.getAttribute('aria-invalid') === 'true' && /500/.test(input.title), written() === before];
      input.dispatchEvent(new Event('blur'));
      // Un champ vidé : « aucun ».
      typeSpacing('', 'Enter');
      await sleep(80);
      out.cleared = [spacing(), /letter-spacing/.test(written()), /<span/.test(written())];
      const pass = out.plus3 === 1.5 && out.field === '1,5' && out.minus4 === -0.5 && out.top[0] === 500 && out.top[1] && out.bottom[0] === -50 && out.bottom[1]
        && out.typed === 2.5 && out.focusBack && out.fieldAfter === '2,5' && out.invalid[0] === 'true' && out.invalid[1] === I18n.t('charFormat.error.number') && out.invalidKept && out.invalidRestored[0] === '2,5' && out.invalidRestored[1] === false
        && out.outOfRange[0] && out.outOfRange[1] && out.cleared[0] === 0 && !out.cleared[1] && !out.cleared[2];
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cm_spacing_typed_then_left_applies_on_change_and_the_editor_does_not_take_the_focus_back',
    description: 'L\'espacement tapé puis quitté sans Entrée (l\'évènement `change` que le champ reçoit au départ du focus : un clic dans un autre champ, la touche Tab) s\'applique au texte sans que l\'éditeur reprenne le focus - la personne arrive où elle allait, et Ctrl + Z reste au champ tant qu\'elle y est ; un champ où rien n\'a été tapé ne pose rien',
    run: async (h) => {
      await setDoc(h, '<p>Un deux trois</p>');
      await select('deux');
      const spacing = () => { const m = /letter-spacing: (-?[\d.]+)pt/.exec(written()); return m ? Number(m[1]) : 0; };
      const out = {};
      // Le champ n'a le focus que si son menu est affiché (un champ caché ne le prend pas) : le :hover du CSS ne s'active pas par un évènement, le menu est montré à la main.
      const flyout = byId('v2-char-flyout');
      flyout.style.display = 'flex';
      const input = typeSpacing('3');
      out.focused = document.activeElement === input;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(80);
      out.applied = spacing();
      out.focusStayed = document.activeElement === input;
      // Un `change` sans rien de tapé depuis la dernière validation ne repose rien.
      const before = written();
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(60);
      out.idle = written() === before;
      // Ce que la personne vise ensuite (un autre champ de la page) prend le focus : l'éditeur ne le lui reprend pas.
      const other = document.createElement('input');
      document.body.appendChild(other);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      other.focus();
      await sleep(60);
      out.leftFor = document.activeElement === other;
      other.remove();
      flyout.style.display = '';
      const pass = out.focused && out.applied === 3 && out.focusStayed && out.idle && out.leftFor;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cm_menu_shows_the_state_of_the_text_with_a_dash_when_it_is_shared_and_aa_is_pressed',
    description: 'À l\'ouverture, le menu montre le texte visé : une coche quand tout le texte a le réglage, un tiret (aria-checked « mixed ») quand une partie seulement, rien sinon ; l\'espacement commun (ou vide quand il diffère) ; « Aa » est enfoncé quand le texte porte un des réglages ; une ligne « mixte » le pose partout, un second clic le retire',
    run: async (h) => {
      await setDoc(h, '<p><span style="font-variant: small-caps; letter-spacing: 1pt">Un</span> deux <span style="font-variant: small-caps; text-shadow: 1.5pt 1.5pt 2pt #00000066; letter-spacing: 2pt">trois</span></p>');
      const read = () => ({ caps: checked('v2-btn-char-smallcaps'), shadow: checked('v2-btn-char-shadow'), stroke: checked('v2-btn-char-stroke'), spacing: byId('v2-char-spacing-val').value, placeholder: byId('v2-char-spacing-val').placeholder, aa: byId('v2-btn-char-main').classList.contains('is-active') });
      const out = {};
      await select('Un');
      enter('v2-char-group');
      out.un = read();
      await select('deux');
      enter('v2-char-group');
      out.deux = read();
      await select('Un', 'deux');
      enter('v2-char-group');
      out.unDeux = read();
      await select('trois');
      enter('v2-char-group');
      out.trois = read();
      await select('Un', 'trois');
      enter('v2-char-group');
      out.all = read();
      byId('v2-btn-char-smallcaps').click();
      await sleep(80);
      out.allCaps = checked('v2-btn-char-smallcaps');
      const htmlOn = (written().match(/font-variant: small-caps/g) || []).length;
      byId('v2-btn-char-smallcaps').click();
      await sleep(80);
      out.allCapsOff = [checked('v2-btn-char-smallcaps'), (written().match(/font-variant: small-caps/g) || []).length];
      const pass = out.un.caps === 'true' && out.un.shadow === 'false' && out.un.spacing === '1' && out.un.aa
        && out.deux.caps === 'false' && out.deux.spacing === '0' && !out.deux.aa
        && out.unDeux.caps === 'mixed' && out.unDeux.spacing === '' && out.unDeux.placeholder === '—' && out.unDeux.aa
        && out.trois.caps === 'true' && out.trois.shadow === 'true' && out.trois.spacing === '2'
        && out.all.caps === 'mixed' && out.all.shadow === 'mixed' && out.all.stroke === 'false'
        && out.allCaps === 'true' && htmlOn >= 1 && out.allCapsOff[0] === 'false' && out.allCapsOff[1] === 0;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cm_underline_rows_check_the_kind_the_active_row_removes_and_another_replaces',
    description: 'Les soulignements : la ligne du trait que porte le texte est cochée (aucune quand il diffère), un clic sur elle retire le soulignement, un clic sur une autre remplace le trait sans toucher aux autres réglages ; « Souligné » (la première ligne) pose le trait simple ; le bouton, lui, retire tout soulignement comme Ctrl+U',
    run: async (h) => {
      await setDoc(h, '<p>Un <u style="text-decoration-style: double">deux</u> <u>trois</u> <span style="font-variant: small-caps">quatre</span></p>');
      const rows = () => ['single', 'double', 'dotted', 'dashed', 'wavy'].map(kind => checked('v2-underline-' + kind)).join(',');
      const out = {};
      await select('deux');
      enter('v2-underline-group');
      out.double = [rows(), byId('v2-btn-underline').classList.contains('is-active')];
      byId('v2-underline-double').click();
      await sleep(80);
      out.removed = [/<u[^>]*>deux<\/u>/.test(written()), rows()];
      await select('trois');
      enter('v2-underline-group');
      out.single = rows();
      byId('v2-underline-wavy').click();
      await sleep(80);
      out.wavy = [/<u style="text-decoration-style: wavy;">trois<\/u>/.test(written()), rows()];
      byId('v2-underline-single').click();
      await sleep(80);
      out.backToSingle = [/<u>trois<\/u>/.test(written()), rows()];
      byId('v2-underline-single').click();
      await sleep(80);
      out.singleRemoved = [/<u>trois<\/u>/.test(written()), rows()];
      await select('Un', 'trois');
      enter('v2-underline-group');
      out.shared = rows();
      byId('v2-underline-dotted').click();
      await sleep(80);
      out.allDotted = [(written().match(/text-decoration-style: dotted/g) || []).length, rows()];
      byId('v2-btn-underline').click();
      await sleep(80);
      out.buttonRemoves = [/<u/.test(written()), rows()];
      // Les autres réglages sont intacts.
      await select('quatre');
      byId('v2-underline-double').click();
      await sleep(80);
      out.keepsCaps = /<span style="font-variant: small-caps;"><u style="text-decoration-style: double;">quatre<\/u><\/span>/.test(written());
      const pass = out.double[0] === 'false,true,false,false,false' && out.double[1] === true && out.removed[0] === false && out.removed[1] === 'false,false,false,false,false'
        && out.single === 'true,false,false,false,false' && out.wavy[0] && out.wavy[1] === 'false,false,false,false,true' && out.backToSingle[0] && out.backToSingle[1] === 'true,false,false,false,false'
        && !out.singleRemoved[0] && out.singleRemoved[1] === 'false,false,false,false,false' && out.shared === 'false,false,false,false,false' && out.allDotted[0] === 1 && out.buttonRemoves[0] === false && out.keepsCaps;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cm_cursor_alone_sets_the_typing_style',
    description: 'Le curseur seul (rien de sélectionné) : une ligne du menu règle le style de frappe, et le texte tapé ensuite porte le réglage ; exposant et indice du même menu aussi',
    run: async (h) => {
      await setDoc(h, '<p>Un deux</p>');
      const at = wordRange('Un').to;
      ed().commands.setTextSelection(at);
      await sleep(60);
      byId('v2-btn-char-smallcaps').click();
      byId('v2-char-spacing-plus').click();
      await sleep(80);
      ed().commands.insertContent('xy');
      await sleep(80);
      const html = written();
      const typed = /<span style="letter-spacing: 0\.5pt; font-variant: small-caps;">xy<\/span>/.test(html);
      ed().commands.setTextSelection(wordRange('deux').to);
      byId('v2-btn-superscript').click();
      await sleep(60);
      ed().commands.insertContent('z');
      await sleep(60);
      const sup = /<sup>z<\/sup>/.test(written());
      return { pass: typed && sup, notes: JSON.stringify({ typed, sup, html }) };
    },
  });

  cases.push({
    id: 'cm_email_keeps_superscript_and_subscript_the_macro_template_and_reading_lock_the_menu',
    description: 'Dans un modèle email le soulignement et les lignes Petites capitales, Ombre, Contour et Espacement sont grisés avec la raison de l\'email (que leur clic écrit dans le coin d\'état, sans rien changer) alors qu\'Exposant et Indice restent actifs ; dans un macro-modèle tout le menu « Aa » est grisé ; en mode Lecture aussi, avec sa raison ; le document de nouveau, plus rien n\'est grisé',
    run: async (h) => {
      await h.resetEditor();
      const aaRows = ['v2-btn-char-smallcaps', 'v2-btn-char-shadow', 'v2-btn-char-stroke', 'v2-char-spacing'];
      const quiet = ids => ids.filter(id => blocks(id) || byId(id).hasAttribute('data-pp-lock-reason'));
      const out = {};
      await goToNew(h, 'document');
      out.document = quiet(['v2-underline-group', 'v2-char-group', 'v2-btn-superscript'].concat(aaRows));
      await goToNew(h, 'email');
      Editor.setHTML('<p>Un deux</p>');
      await sleep(120);
      const email = I18n.t('lock.email');
      out.emailSilent = ['v2-underline-group'].concat(aaRows).filter(id => byId(id).getAttribute('title') !== email || !blocks(id));
      out.emailFree = quiet(['v2-char-group', 'v2-btn-superscript', 'v2-btn-subscript']);
      await select('Un');
      clearSaid();
      const before = written();
      byId('v2-btn-char-shadow').click();
      byId('v2-char-spacing-plus').click();
      byId('v2-underline-double').click();
      out.emailSaid = say();
      out.emailKept = written() === before;
      byId('v2-btn-superscript').click();
      await sleep(80);
      out.emailSup = /<sup>/.test(written());
      await goToNew(h, 'macro');
      const macro = I18n.t('lock.macro');
      out.macro = [byId('v2-char-group').getAttribute('title') === macro, blocks('v2-char-group')];
      clearSaid();
      byId('v2-btn-superscript').click();
      out.macroSaid = say();
      await goToNew(h, 'document');
      Editor.setHTML('<p>Un deux</p>');
      await sleep(120);
      byId('btn-mode-read').click();
      await sleep(250);
      const reading = I18n.t('lock.readMode');
      out.read = [byId('v2-char-group').getAttribute('title') === reading, byId('v2-underline-group').getAttribute('title') === reading, byId('v2-char-group').classList.contains('pp-access-locked')];
      byId('btn-mode-edit').click();
      await sleep(250);
      out.back = quiet(['v2-underline-group', 'v2-char-group', 'v2-btn-superscript'].concat(aaRows));
      const pass = out.document.length === 0 && out.emailSilent.length === 0 && out.emailFree.length === 0 && out.emailSaid === email && out.emailKept && out.emailSup
        && out.macro[0] && out.macro[1] && out.macroSaid === macro && out.read.every(Boolean) && out.back.length === 0;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cm_menus_texts_follow_the_interface_language',
    lang: 'en',
    description: 'La page qui démarre en anglais : le menu « Aa » (Character, Small capitals, Shadow, Outline, Spacing, Superscript, Subscript), le menu Underline (Underline, Double, Dotted, Dashed, Wavy) et leurs noms accessibles sont en anglais, le champ d\'espacement écrit son point décimal',
    run: async (h) => {
      await setDoc(h, '<p>Hello world</p>');
      await select('Hello');
      byId('v2-char-spacing-plus').click();
      byId('v2-char-spacing-plus').click();
      byId('v2-char-spacing-plus').click();
      await sleep(80);
      const text = id => byId(id).textContent.trim();
      const sample = kind => byId('v2-underline-' + kind).querySelector('.v2-underline-sample').textContent.trim();
      const out = {
        lang: I18n.getLang(),
        main: byId('v2-btn-char-main').getAttribute('aria-label'),
        title: byId('v2-char-flyout').querySelector('.v2-hover-flyout-label').textContent,
        rows: ['v2-btn-char-smallcaps', 'v2-btn-char-shadow', 'v2-btn-char-stroke'].map(text),
        spacing: byId('v2-char-spacing').querySelector('.v2-char-spacing-label').textContent,
        field: byId('v2-char-spacing-val').value,
        steps: [byId('v2-char-spacing-minus').getAttribute('aria-label'), byId('v2-char-spacing-plus').getAttribute('aria-label')],
        tips: [byId('v2-btn-superscript').getAttribute('data-tip'), byId('v2-btn-subscript').getAttribute('data-tip')],
        underlineTitle: byId('v2-underline-flyout').querySelector('.v2-hover-flyout-label').textContent,
        underline: ['single', 'double', 'dotted', 'dashed', 'wavy'].map(sample),
        underlineAria: byId('v2-underline-wavy').getAttribute('aria-label'),
      };
      const pass = out.lang === 'en' && /^Character: superscript, subscript, small capitals, shadow, outline and spacing/.test(out.main) && out.title === 'Character'
        && JSON.stringify(out.rows) === JSON.stringify(['Small capitals', 'Shadow', 'Outline']) && out.spacing === 'Spacing' && out.field === '1.5'
        && out.steps[0] === 'Condense the letters' && out.steps[1] === 'Spread the letters' && out.tips[0] === 'Superscript' && out.tips[1] === 'Subscript'
        && out.underlineTitle === 'Underline' && JSON.stringify(out.underline) === JSON.stringify(['Underline', 'Double', 'Dotted', 'Dashed', 'Wavy']) && out.underlineAria === 'Wavy underline';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.characterMenus = cases;
})();
