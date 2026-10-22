// Suite "undoDisplay" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi CE QUE LA PAGE MONTRE d'un réglage du document (suite de scenarios-undo-page.js : demande d'Antoine du 22/10,
// « Il doit prendre en compte 100% des actions faites dans le widget »). Un réglage du document qui vit dans le texte (ProseMirror) revient avec l'historique, mais ce que la page en lit à côté - une
// valeur posée sur la racine de l'éditeur, un menu - ne revenait pas. Ici : la numérotation des titres. Le nœud `headingNumberingConfig` revenait avec Ctrl + Z, mais `data-heading-style` (que le CSS
// des titres et le sommaire lisent) et le menu « Titre » gardaient la numérotation défaite : les titres restaient numérotés à l'écran alors que le document ne l'était plus.
//
// Les attendus sont ceux de la personne qui défait : UN Ctrl + Z (ou le bouton Annuler) rend les titres, le sommaire et le menu d'avant, UN Ctrl + Y les rend de nouveau ; la numérotation reste là pendant
// l'écriture d'un en-tête ou d'un pied (l'éditeur ne contient alors que la zone) ; un document chargé par n'importe quel chemin montre sa numérotation, menu compris.
// Le même parcours à la vraie souris et au vrai clavier, dans le panneau de 700x400 : verify-undo-display-mouse.mjs (undoDisplayMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoDisplay = (function () {
  const cases = [];
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts).
  function press(key, shiftKey) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, shiftKey: !!shiftKey, bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const undo = () => press('z');
  const redo = () => press('y');
  const enter = (zone, variant) => HeaderFooterPreview.enterHeaderFooterMode(zone, variant || 'default');
  const done = () => Editor.exitHeaderFooterModeIfActive();

  // La numérotation des titres telle que la personne la voit, par tous les chemins qui la montrent : le nœud du document, la racine de l'éditeur (CSS), le menu caché, le bouton allumé de son panneau.
  function shown() {
    return {
      node: Editor.getHeadingNumberingStyle(),
      root: ed().view.dom.dataset.headingStyle || 'none',
      menu: byId('v2-heading-numbering-select').value,
      lit: Array.from(document.querySelectorAll('#v2-numbering-seg [data-num]')).filter(b => b.classList.contains('active')).map(b => b.dataset.num),
    };
  }
  const agree = style => ({ node: style, root: style, menu: style, lit: [style] });
  // Une zone d'en-tête ou de pied ouverte : l'éditeur ne contient que son texte, sans le nœud de numérotation du corps ; seul ce que la page affiche reste.
  const display = style => ({ root: style, menu: style, lit: [style] });
  const displayed = () => { const { root, menu, lit } = shown(); return { root, menu, lit }; };
  // Les lignes du sommaire de l'éditeur : le texte numéroté que le sommaire dessine.
  const summary = () => Array.from(ed().view.dom.querySelectorAll('.toc-entry-preview')).map(line => line.textContent);
  const NUMBERED = {
    none: ['Un', 'Deux'], numeric: ['1) Un', 'a) Deux'], alpha: ['a) Un', 'I) Deux'], roman: ['I) Un', '1) Deux'],
  };
  // Un clic sur le bouton de numérotation du panneau « Titre » (c'est lui qui pose le réglage).
  function choose(style) { document.querySelector('#v2-numbering-seg [data-num="' + style + '"]').click(); }
  // La commande de l'historique groupe les gestes voisins faits à moins de 500 ms : deux réglages à la suite doivent être deux pas.
  const apart = h => h.sleep(620);

  async function fresh(h) {
    await h.resetEditor();
    Editor.setHTML('<h1>Un</h1><p>texte</p><h2>Deux</h2><div class="toc-marker"></div>');
    Editor.setHeaderFooterData(null);
    await h.sleep(250);
  }
  async function leave(h) {
    done();
    Editor.setHeaderFooterData(null);
    await h.resetEditor();
  }

  cases.push({
    id: 'undo_display_numbering_ctrl_z_gives_back_the_headings_the_menu_and_the_summary',
    description: 'Deux réglages de numérotation puis Ctrl + Z, Ctrl + Z, Ctrl + Y, Ctrl + Y : le nœud, la racine de l\'éditeur, le menu, le bouton allumé et le sommaire suivent chaque pas',
    run: async (h) => {
      const problems = [];
      await fresh(h);
      check(problems, 'au départ', shown(), agree('none'));
      check(problems, 'au départ, le sommaire', summary(), NUMBERED.none);
      choose('numeric');
      await apart(h);
      check(problems, 'après « 1) »', shown(), agree('numeric'));
      check(problems, 'après « 1) », le sommaire', summary(), NUMBERED.numeric);
      choose('alpha');
      await h.sleep(60);
      check(problems, 'après « a) »', shown(), agree('alpha'));
      check(problems, 'après « a) », le sommaire', summary(), NUMBERED.alpha);
      undo();
      await h.sleep(60);
      check(problems, 'Ctrl + Z rend « 1) »', shown(), agree('numeric'));
      check(problems, 'Ctrl + Z rend « 1) », le sommaire', summary(), NUMBERED.numeric);
      undo();
      await h.sleep(60);
      check(problems, 'un second Ctrl + Z rend les titres sans numéro', shown(), agree('none'));
      check(problems, 'un second Ctrl + Z, le sommaire', summary(), NUMBERED.none);
      redo();
      await h.sleep(60);
      check(problems, 'Ctrl + Y rend « 1) »', shown(), agree('numeric'));
      check(problems, 'Ctrl + Y rend « 1) », le sommaire', summary(), NUMBERED.numeric);
      redo();
      await h.sleep(60);
      check(problems, 'un second Ctrl + Y rend « a) »', shown(), agree('alpha'));
      check(problems, 'un second Ctrl + Y, le sommaire', summary(), NUMBERED.alpha);
      await leave(h);
      return verdict(problems, 'numerotation : nœud, racine, menu, bouton et sommaire suivent Annuler et Rétablir');
    },
  });

  cases.push({
    id: 'undo_display_numbering_the_undo_and_redo_buttons_do_the_same',
    description: 'Les boutons Annuler et Rétablir de la barre rendent la numérotation comme Ctrl + Z et Ctrl + Y',
    run: async (h) => {
      const problems = [];
      await fresh(h);
      choose('roman');
      await h.sleep(60);
      check(problems, 'après « I) »', shown(), agree('roman'));
      byId('v2-btn-undo').click();
      await h.sleep(80);
      check(problems, 'le bouton Annuler rend les titres sans numéro', shown(), agree('none'));
      check(problems, 'le bouton Annuler, le sommaire', summary(), NUMBERED.none);
      byId('v2-btn-redo').click();
      await h.sleep(80);
      check(problems, 'le bouton Rétablir rend « I) »', shown(), agree('roman'));
      check(problems, 'le bouton Rétablir, le sommaire', summary(), NUMBERED.roman);
      await leave(h);
      return verdict(problems, 'les boutons de la barre rendent la numérotation');
    },
  });

  cases.push({
    id: 'undo_display_numbering_stays_while_a_header_or_footer_is_open_and_comes_back_in_order',
    description: 'Pendant l\'écriture d\'un en-tête (l\'éditeur ne contient que la zone) la numérotation du corps reste affichée ; après « Terminer », Ctrl + Z défait la séance puis la numérotation',
    run: async (h) => {
      const problems = [];
      await fresh(h);
      choose('numeric');
      await apart(h);
      enter('header');
      await h.sleep(120);
      check(problems, 'la zone d\'en-tête ouverte, la numérotation du corps est toujours là', displayed(), display('numeric'));
      const state = ed().state;
      ed().view.dispatch(state.tr.insertText('Rapport', 1).setMeta('closeHistory$', true));
      await h.sleep(60);
      check(problems, 'après une frappe dans la zone', displayed(), display('numeric'));
      done();
      await h.sleep(160);
      check(problems, 'après « Terminer »', shown(), agree('numeric'));
      undo();
      await h.sleep(80);
      check(problems, 'un premier Ctrl + Z défait la séance de l\'en-tête, la numérotation reste', shown(), agree('numeric'));
      check(problems, 'l\'en-tête est défait', Editor.getHeaderFooterData().header.default.replace(/<[^>]*>/g, ''), '');
      undo();
      await h.sleep(80);
      check(problems, 'un second Ctrl + Z défait la numérotation', shown(), agree('none'));
      check(problems, 'un second Ctrl + Z, le sommaire', summary(), NUMBERED.none);
      await leave(h);
      return verdict(problems, 'numérotation et en-tête : l\'ordre des gestes, rien ne bouge pendant la zone');
    },
  });

  cases.push({
    id: 'undo_display_numbering_follows_a_document_loaded_by_any_path',
    description: 'Un document chargé par Editor.setHTML avec sa numérotation : la racine, le menu et le bouton allumé la montrent, puis un document sans numérotation les remet à zéro',
    run: async (h) => {
      const problems = [];
      await h.resetEditor();
      Editor.setHTML('<div class="heading-numbering-config" data-style="roman"></div><h1>Un</h1><h2>Deux</h2><div class="toc-marker"></div>');
      await h.sleep(250);
      check(problems, 'un document en chiffres romains', shown(), agree('roman'));
      check(problems, 'un document en chiffres romains, le sommaire', summary(), NUMBERED.roman);
      Editor.setHTML('<h1>Un</h1><h2>Deux</h2><div class="toc-marker"></div>');
      await h.sleep(250);
      check(problems, 'un document sans numérotation', shown(), agree('none'));
      check(problems, 'un document sans numérotation, le sommaire', summary(), NUMBERED.none);
      await leave(h);
      return verdict(problems, 'la numérotation suit le document chargé');
    },
  });

  return cases;
})();
