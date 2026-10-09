// Suite "sheetAssembly" - « Assemblage avant impression » (js/sheet-layout.js, js/sheet-assembly-dialog.js, js/pdf-merge.js:createSheets, js/main.js:onExportBatch 'pdfSheets' ; demande
// d'Antoine du 02/10, point 13 : « 4 A6 sur une A4, chacun prend une ligne dans l'ordre, une planche prête à imprimer », avec ou sans trait de coupe, sur A3 et A4).
// La géométrie est vérifiée sur ses nombres (SheetLayout, pure), la fenêtre sur ses réglages (SheetAssemblyDialog.open, les vraies cases), puis le fichier : la VRAIE ligne du menu est cliquée, le
// PDF téléchargé est intercepté et OUVERT par pdf.js - feuilles, place de chaque texte, traits de coupe (opérations tracées et pixels peints) -, jamais les objets intermédiaires.
(function () {
  const cases = [];
  const TABLE = 'SaClients';
  const ROW_ID = 'v2-btn-export-pdf-sheets';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit', 'Delta Moreau', 'Echo Laurent', 'Foxtrot Blanc'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const MM = 72 / 25.4;
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.05 : tolerance);
  const squash = s => String(s).replace(/\s+/g, '');
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });

  // --- La page du modèle ----------------------------------------------------------------------------------------------------------------------------------------------
  // Le format et le sens du modèle sont ceux de la page de chaque ligne : on les pose le temps d'un scénario puis on les rend (resetEditor ne les touche pas).
  async function withPage(format, orientation, fn) {
    const before = { format: PageLayout.getFormat(), orientation: PageLayout.getOrientation() };
    PageLayout.setFormat(format);
    PageLayout.setOrientation(orientation);
    try { return await fn(); } finally { PageLayout.setFormat(before.format); PageLayout.setOrientation(before.orientation); }
  }
  async function seed(h, bodyHtml, count) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text' });
    stub.setRows(TABLE, NAMES.slice(0, count || NAMES.length).map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await h.sleep(50);
    Editor.setHTML(bodyHtml);
    Editor.setHeaderFooterData(NO_HF);
    await h.sleep(80);
  }

  // --- La fenêtre -------------------------------------------------------------------------------------------------------------------------------------------------------
  const modal = () => document.getElementById('pp-sheets-modal');
  const isOpen = () => !!modal() && modal().style.display !== 'none';
  const radioInput = (name, value) => modal().querySelector(`input[name="${name}"][value="${value}"]`);
  const radioLabel = (name, value) => radioInput(name, value).closest('label');
  const checkedValue = name => { const r = Array.from(modal().querySelectorAll(`input[name="${name}"]`)).find(x => x.checked); return r ? r.value : null; };
  const pickRadio = (name, value) => radioInput(name, value).click();
  const pickSelect = (id, value) => { const s = document.getElementById(id); s.value = String(value); s.dispatchEvent(new Event('change', { bubbles: true })); };
  const okButton = () => modal().querySelector('.var-modal-actions .var-modal-primary');
  const cancelButton = () => modal().querySelector('.var-modal-actions button:not(.var-modal-primary)');
  // Tout ce que la fenêtre montre : réglages, résumé, notes visibles, dessin de la feuille d'aperçu.
  const state = () => ({
    sheet: checkedValue('pp-sheets-sheet'), orientation: checkedValue('pp-sheets-orientation'), marks: checkedValue('pp-sheets-marks'),
    cols: Number(document.getElementById('pp-sheets-cols').value), rows: Number(document.getElementById('pp-sheets-rows').value),
    colsMax: document.getElementById('pp-sheets-cols').options.length, rowsMax: document.getElementById('pp-sheets-rows').options.length,
    summary: modal().querySelector('.pp-sheets-summary').textContent,
    // Chaque indication sous son champ : l'échelle sous les traits de coupe (vide tant que les pages ne sont pas réduites), la règle de l'ordre sous les emplacements.
    scaled: document.getElementById('pp-sheets-scaled').hidden ? '' : document.getElementById('pp-sheets-scaled').textContent,
    hint: document.getElementById('pp-sheets-hint').textContent,
    // La marge laissée autour de chaque page : ce que dit le champ (la valeur appliquée), son plafond (mm) et s'il est grisé.
    margin: document.getElementById('pp-sheets-margin').value, marginMax: document.getElementById('pp-sheets-margin').max, marginDisabled: document.getElementById('pp-sheets-margin').disabled,
    okDisabled: okButton().disabled,
    svgSlots: modal().querySelectorAll('.pp-sheets-slot').length, svgMarks: modal().querySelectorAll('.pp-sheets-mark').length,
    viewBox: modal().querySelector('.pp-sheets-svg').getAttribute('viewBox'),
  });
  // Les emplacements de la feuille d'aperçu tels que la fenêtre les dessine (points : l'unité du viewBox).
  const previewSlots = () => Array.from(modal().querySelectorAll('.pp-sheets-slot')).map(r => ({ x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')), width: Number(r.getAttribute('width')), height: Number(r.getAttribute('height')) }));
  // Le champ de la marge : le texte change puis `input` part, comme à chaque touche (la fin de la saisie - Entrée, un autre champ - est `change`).
  const marginInput = () => document.getElementById('pp-sheets-margin');
  function typeMargin(value) { const f = marginInput(); f.value = String(value); f.dispatchEvent(new Event('input', { bubbles: true })); }
  function commitMargin() { marginInput().dispatchEvent(new Event('change', { bubbles: true })); }
  // La fenêtre est dessinée et affichée dès le retour de `open` ; la promesse rendue (le réglage, ou null) ne se résout qu'à « Générer », « Annuler » ou Échap : on ne l'attend donc jamais ici.
  function openDialog(opts) {
    return SheetAssemblyDialog.open(Object.assign({ count: 6, table: TABLE }, opts));
  }
  const forgetChoice = () => { try { localStorage.removeItem(SheetAssemblyDialog.STORAGE); } catch (e) { /* sans stockage, rien à oublier */ } };
  // Referme proprement une fenêtre restée ouverte par un scénario qui a échoué à mi-chemin.
  const closeIfOpen = () => { if (isOpen()) cancelButton().click(); };

  // --- Le fichier -------------------------------------------------------------------------------------------------------------------------------------------------------
  // Clique la ligne du menu, laisse `drive` répondre à la fenêtre (les clics de la personne ; sans lui : « Générer » tel quel), puis attend le téléchargement (ou, avec `expectDownload` faux, laisse
  // passer le temps qu'il faudrait). Le <a download> est intercepté et chaque message d'état noté.
  async function exportSheets(h, drive, expectDownload) {
    const downloads = [];
    const confirms = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    // La fenêtre de réglage tient lieu de confirmation : une seconde question (Dialogs.confirm) serait notée ici et refusée, au lieu d'attendre une personne.
    const dialogs = h.stubDialogs({ confirm: opts => { confirms.push(opts.message); return false; } });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    const statusEl = document.getElementById('status-msg');
    const statuses = [];
    const statusObserver = new MutationObserver(() => { if (statuses[statuses.length - 1] !== statusEl.textContent) statuses.push(statusEl.textContent); });
    statusObserver.observe(statusEl, { childList: true, characterData: true, subtree: true });
    let opened = false;
    let during = null;
    try {
      document.getElementById(ROW_ID).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!isOpen() && Date.now() - startedAt < 5000) await h.sleep(40);
      opened = isOpen();
      if (opened) {
        during = Object.fromEntries(['v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', ROW_ID].map(id => [id, document.getElementById(id).style.pointerEvents]));
        if (drive) await drive(); else okButton().click();
        if (expectDownload === false) await h.sleep(500);
        else { while (!downloads.length && Date.now() - startedAt < 60000) await h.sleep(100); await h.sleep(60); }
      } else await h.sleep(300);
    } finally {
      statusObserver.disconnect();
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
      closeIfOpen();
    }
    return { opened, during, downloads, confirms, statuses, status: statusEl.textContent };
  }

  async function toBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  // Chaque feuille du fichier : sa taille, ses textes (position réellement peinte, origine en haut à gauche) et ses traits tracés.
  async function readSheets(h, blob) {
    const b64 = await toBase64(blob);
    const truth = await h.extractPdfGroundTruth(b64);
    const strokes = await h.extractPdfLines(b64);
    return truth.pages.map((p, i) => ({ width: p.width, height: p.height, items: p.textItems, lines: strokes.pages[i].lines }));
  }
  async function pdfTitle(h, blob) {
    await h.ensurePdfJsLoaded();
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const meta = await doc.getMetadata();
    return meta && meta.info ? meta.info.Title : null;
  }
  // Une feuille du fichier rendue par pdf.js à l'échelle `scale` : de quoi lire les pixels peints (un trait de coupe se voit, ou non).
  async function renderSheet(h, blob, pageNumber, scale) {
    await h.ensurePdfJsLoaded();
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { ctx, scale };
  }
  // Le pixel le plus sombre (0 = noir, 255 = blanc) dans un carré de (2r+1) pixels autour de (x, y) en points.
  function darkest(rendered, x, y, r) {
    const px = Math.round(x * rendered.scale);
    const py = Math.round(y * rendered.scale);
    const data = rendered.ctx.getImageData(px - r, py - r, 2 * r + 1, 2 * r + 1).data;
    let min = 255;
    for (let i = 0; i < data.length; i += 4) min = Math.min(min, data[i], data[i + 1], data[i + 2]);
    return min;
  }

  // L'emplacement d'une planche où tombe un point (x, y) en points, ou -1 : la marge des traits de coupe n'en fait pas partie.
  function slotIndexAt(layout, x, y) {
    return layout.slots.findIndex(s => x >= s.x - 0.01 && x < s.x + s.width + 0.01 && y >= s.y - 0.01 && y < s.y + s.height + 0.01);
  }
  // Le texte de chaque emplacement d'une feuille du fichier, dans l'ordre de lecture, et ce qui est tombé hors de tout emplacement.
  function textBySlot(layout, sheetPage) {
    const perSlot = layout.slots.map(() => []);
    const stray = [];
    sheetPage.items.forEach(it => { const k = slotIndexAt(layout, it.x, it.y); if (k >= 0) perSlot[k].push(it); else stray.push(it.str); });
    return { texts: perSlot.map(items => items.slice().sort((a, b) => a.y - b.y || a.x - b.x).map(it => it.str).join(' ')), first: perSlot.map(items => items.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0] || null), stray };
  }

  // Indépendamment de SheetLayout (qui sert aussi à calculer l'attendu) : la page n° n (0, 1, 2...) de la table tombe sur la feuille floor(n / 4), dans le quart que l'ordre de lecture désigne -
  // k = n % 4 : gauche puis droite, haut puis bas (feuilles de 2 x 2). Un texte n'est repéré que par ce qu'il dit : `pageOf` rend le n° de page d'un texte, ou -1.
  function quarterProblems(sheets, pageOf, expectedChecked) {
    const problems = [];
    let checked = 0;
    sheets.forEach((sheet, s) => sheet.items.forEach(it => {
      const n = pageOf(it.str);
      if (n < 0) return;
      checked++;
      const k = n % 4;
      const left = it.x < sheet.width / 2;
      const top = it.y < sheet.height / 2;
      if (Math.floor(n / 4) !== s || left !== (k % 2 === 0) || top !== (k < 2)) {
        problems.push(`« ${it.str} » (page ${n + 1}) : feuille ${s + 1}, ${left ? 'gauche' : 'droite'} ${top ? 'haut' : 'bas'} au lieu de la feuille ${Math.floor(n / 4) + 1}, ${k % 2 === 0 ? 'gauche' : 'droite'} ${k < 2 ? 'haut' : 'bas'}`);
      }
    }));
    // Un contrôle qui ne regarde rien passe toujours : le nombre de textes vérifiés est lui-même vérifié.
    if (checked !== expectedChecked) problems.push(`${checked} texte(s) vérifié(s) au lieu de ${expectedChecked}`);
    return problems;
  }
  // Le n° de la ligne de la table (0, 1, 2...) dont un texte porte le prénom - le premier mot : pdf.js découpe « Alpha Durand » en deux textes -, ou -1.
  const nameIndex = str => NAMES.findIndex(name => squash(str).includes(squash(name.split(' ')[0])));

  // --- 1) La géométrie : combien de pages tiennent sur une feuille ----------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_geometry_how_many_pages_fit_each_sheet',
    description: 'SheetLayout.maxGrid : combien de pages entières tiennent sur une A4 ou une A3 dans chaque sens - 4 A6 sur une A4 portrait, 2 A5 sur une A4 paysage, 8 A6 sur une A3 paysage (un ajustement exact à 0,05 pt près, table des formats ou millimètres) ; une page trop grande n’en place aucune ; le meilleur sens d’une feuille et la feuille proposée d’abord',
    run: async () => {
      const bad = [];
      // [feuille, sens de la feuille, format de la page, colonnes, lignes] - 0 : la page n'entre pas dans ce sens.
      const EXPECTED = [
        ['A4', 'portrait', 'A6', 2, 2], ['A4', 'landscape', 'A6', 2, 1], ['A4', 'portrait', 'A5', 1, 1], ['A4', 'landscape', 'A5', 2, 1],
        ['A4', 'portrait', 'A4', 1, 1], ['A4', 'landscape', 'A4', 0, 0], ['A4', 'portrait', 'A3', 0, 0], ['A4', 'landscape', 'A3', 0, 0],
        ['A3', 'portrait', 'A6', 2, 2], ['A3', 'landscape', 'A6', 4, 2], ['A3', 'portrait', 'A5', 2, 2], ['A3', 'landscape', 'A5', 2, 1],
        ['A3', 'portrait', 'A4', 1, 1], ['A3', 'landscape', 'A4', 2, 1], ['A3', 'portrait', 'A3', 1, 1], ['A3', 'landscape', 'A3', 0, 0],
      ];
      // La page de deux façons : la table des formats en points (pdfmake) et les millimètres convertis (ce que PageLayout.getPageSizePt rend) - les deux doivent donner les mêmes nombres.
      const formats = PageLayout.getFormats();
      const pageOf = (format, how) => {
        if (how === 'table') return PageLayout.pageSizePtFor('portrait', format);
        const f = formats.find(x => x.id === format);
        return { width: f.widthMm * MM, height: f.heightMm * MM };
      };
      ['table', 'millimetres'].forEach(how => EXPECTED.forEach(([sheet, orientation, format, cols, rows]) => {
        const g = SheetLayout.maxGrid(SheetLayout.sheetSize(sheet, orientation), pageOf(format, how));
        const got = SheetLayout.slotCount(g) ? g.cols + 'x' + g.rows : '0';
        const want = cols * rows ? cols + 'x' + rows : '0';
        if (got !== want) bad.push(`${format} sur ${sheet} ${orientation} (${how}) : ${got} au lieu de ${want}`);
      }));
      const size = SheetLayout.sheetSize('A4', 'landscape');
      if (!near(size.width, 841.89) || !near(size.height, 595.28)) bad.push('A4 paysage : ' + JSON.stringify(size));
      // Le réglage proposé : l'A4 d'abord, le sens qui place le plus de pages, l'A3 seulement quand l'A4 n'en reçoit aucune.
      const pick = c => c && [c.sheet, c.orientation, c.cols, c.rows].join(' ');
      const best = {
        A6: pick(SheetLayout.best(pageOf('A6', 'table'))), A5: pick(SheetLayout.best(pageOf('A5', 'table'))),
        A4: pick(SheetLayout.best(pageOf('A4', 'table'))), A3: pick(SheetLayout.best(pageOf('A3', 'table'))),
        A6paysage: pick(SheetLayout.best({ width: 419.53, height: 297.64 })),
        trop: pick(SheetLayout.best({ width: 900, height: 1300 })),
      };
      const wantBest = { A6: 'A4 portrait 2 2', A5: 'A4 landscape 2 1', A4: 'A4 portrait 1 1', A3: 'A3 portrait 1 1', A6paysage: 'A4 landscape 2 2', trop: null };
      Object.keys(wantBest).forEach(k => { if (best[k] !== wantBest[k]) bad.push(`meilleur réglage pour ${k} : ${best[k]} au lieu de ${wantBest[k]}`); });
      // À égalité de pages, le sens de la page : un paysage (400 x 300 : 2 dans les deux sens) reste en paysage, un carré en portrait.
      const tieLandscape = pick(SheetLayout.bestOrientation('A4', { width: 400, height: 300 }));
      const tieSquare = pick(SheetLayout.bestOrientation('A4', { width: 100, height: 100 }));
      if (tieLandscape !== 'A4 landscape 2 1') bad.push('égalité, page paysage : ' + tieLandscape);
      if (tieSquare !== 'A4 portrait 5 8') bad.push('égalité, page carrée : ' + tieSquare);
      if (SheetLayout.bestOrientation('A4', { width: 900, height: 1300 }) !== null) bad.push('une page plus grande que la feuille a un sens');
      return result(bad);
    },
  });

  // --- 2) Les emplacements : ordre de lecture, jointifs, grille centrée ------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_geometry_slots_reading_order_touching_and_centered',
    description: 'SheetLayout.compute sans traits de coupe : les emplacements se suivent de gauche à droite puis de haut en bas, se touchent sans se chevaucher, gardent la taille de la page (rien de réduit) et la grille est centrée sur la feuille ; nombres bornés à 1 au moins ; nombre de feuilles = pages / emplacements, arrondi en haut',
    run: async () => {
      const bad = [];
      const sheet = SheetLayout.sheetSize('A4', 'portrait');
      const page = { width: 100, height: 150 };
      const layout = SheetLayout.compute({ sheet, page, cols: 3, rows: 4, marks: false });
      if (layout.count !== 12 || layout.slots.length !== 12 || layout.cols !== 3 || layout.rows !== 4) bad.push('compte : ' + layout.count + ' / ' + layout.slots.length);
      if (layout.scale !== 1 || layout.hasMarks || layout.cutMarks.length) bad.push('échelle ou traits sans traits demandés : ' + layout.scale + ' / ' + layout.cutMarks.length);
      const x0 = (sheet.width - 300) / 2;
      const y0 = (sheet.height - 600) / 2;
      if (!near(layout.x0, x0, 1e-9) || !near(layout.y0, y0, 1e-9)) bad.push(`grille non centrée : ${layout.x0}, ${layout.y0} au lieu de ${x0}, ${y0}`);
      layout.slots.forEach((s, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        if (s.index !== i || s.col !== col || s.row !== row) bad.push(`emplacement ${i} : col ${s.col}, ligne ${s.row}`);
        if (!near(s.x, x0 + col * 100, 1e-9) || !near(s.y, y0 + row * 150, 1e-9) || s.width !== 100 || s.height !== 150) bad.push(`emplacement ${i} : ${JSON.stringify(s)}`);
      });
      const [a, b, c, d] = [layout.slots[0], layout.slots[1], layout.slots[3], layout.slots[11]];
      if (!near(b.x, a.x + a.width, 1e-9) || !near(c.y, a.y + a.height, 1e-9) || b.y !== a.y || c.x !== a.x) bad.push('les emplacements ne se touchent pas');
      if (!(d.x + d.width <= sheet.width && d.y + d.height <= sheet.height)) bad.push('le dernier emplacement sort de la feuille');
      // Des nombres absurdes ne cassent rien : au moins 1 colonne et 1 ligne.
      const clamped = SheetLayout.compute({ sheet, page, cols: 0, rows: 'x', marks: false });
      if (clamped.cols !== 1 || clamped.rows !== 1 || clamped.count !== 1) bad.push('bornes : ' + clamped.cols + 'x' + clamped.rows);
      const counts = [SheetLayout.sheetCount(6, 4), SheetLayout.sheetCount(4, 4), SheetLayout.sheetCount(5, 4), SheetLayout.sheetCount(0, 4), SheetLayout.sheetCount(3, 0)];
      if (counts.join() !== '2,1,2,0,0') bad.push('nombre de feuilles : ' + counts.join());
      return result(bad);
    },
  });

  // --- 3) Les traits de coupe : sur la feuille, hors de la grille, et une échelle seulement quand il le faut ------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_geometry_crop_marks_stay_on_the_sheet_and_scale_only_when_needed',
    description: 'SheetLayout.compute avec traits de coupe : 4 A6 sur une A4 sont réduites à 93 % (7 mm de marge de chaque côté), 12 repères de 4 mm posés sur les lignes de coupe, hors de la grille et tous sur la feuille ; là où la feuille a la place (4 A6 sur une A3 portrait, une A4 sur une A3) l’échelle reste 1 ; 2 x (colonnes + 1) + 2 x (lignes + 1) repères',
    run: async () => {
      const bad = [];
      const zone = SheetLayout.MARK_ZONE;
      if (!near(SheetLayout.MARK.offset, 3 * MM, 1e-9) || !near(SheetLayout.MARK.length, 4 * MM, 1e-9) || SheetLayout.MARK.width !== 0.5 || !near(zone, 7 * MM, 1e-9)) bad.push('repères : ' + JSON.stringify(SheetLayout.MARK));
      const sheet = SheetLayout.sheetSize('A4', 'portrait');
      const a6 = PageLayout.pageSizePtFor('portrait', 'A6');
      const marked = SheetLayout.compute({ sheet, page: a6, cols: 2, rows: 2, marks: true });
      const wantScale = (sheet.width - 2 * zone) / (2 * a6.width);
      if (!near(marked.scale, wantScale, 1e-9) || Math.round(marked.scale * 100) !== 93) bad.push(`échelle : ${marked.scale} au lieu de ${wantScale}`);
      if (!marked.hasMarks || marked.cutMarks.length !== 12 || marked.markWidth !== 0.5) bad.push('repères : ' + marked.cutMarks.length);
      const grid = { left: marked.x0, top: marked.y0, right: marked.x0 + 2 * marked.cellWidth, bottom: marked.y0 + 2 * marked.cellHeight };
      const columns = [0, 1, 2].map(k => marked.x0 + k * marked.cellWidth);
      const rowsAt = [0, 1, 2].map(k => marked.y0 + k * marked.cellHeight);
      let vertical = 0;
      let horizontal = 0;
      const eps = 1e-6;
      marked.cutMarks.forEach((m, i) => {
        const inside = [m.x1, m.x2].every(x => x >= -eps && x <= sheet.width + eps) && [m.y1, m.y2].every(y => y >= -eps && y <= sheet.height + eps);
        if (!inside) bad.push(`repère ${i} hors de la feuille : ${JSON.stringify(m)}`);
        if (!near(Math.hypot(m.x2 - m.x1, m.y2 - m.y1), 4 * MM, 1e-6)) bad.push(`repère ${i} : longueur ${Math.hypot(m.x2 - m.x1, m.y2 - m.y1)}`);
        if (m.x1 === m.x2) {
          vertical++;
          const outside = Math.max(m.y1, m.y2) <= grid.top - SheetLayout.MARK.offset + eps || Math.min(m.y1, m.y2) >= grid.bottom + SheetLayout.MARK.offset - eps;
          if (!outside || !columns.some(x => near(x, m.x1, 1e-6))) bad.push(`repère vertical ${i} : ${JSON.stringify(m)}`);
        } else if (m.y1 === m.y2) {
          horizontal++;
          const outside = Math.max(m.x1, m.x2) <= grid.left - SheetLayout.MARK.offset + eps || Math.min(m.x1, m.x2) >= grid.right + SheetLayout.MARK.offset - eps;
          if (!outside || !rowsAt.some(y => near(y, m.y1, 1e-6))) bad.push(`repère horizontal ${i} : ${JSON.stringify(m)}`);
        } else bad.push(`repère ${i} en biais : ${JSON.stringify(m)}`);
      });
      if (vertical !== 6 || horizontal !== 6) bad.push(`repères : ${vertical} verticaux, ${horizontal} horizontaux`);
      // Sans traits de coupe : les mêmes pages, à leur taille, jointives et centrées.
      const plain = SheetLayout.compute({ sheet, page: a6, cols: 2, rows: 2, marks: false });
      if (plain.scale !== 1 || plain.cutMarks.length || !near(plain.cellWidth, a6.width, 1e-9) || !near(plain.x0, 0, 1e-9) || !near(plain.y0, (sheet.height - 2 * a6.height) / 2, 1e-9)) bad.push('sans traits : ' + JSON.stringify({ scale: plain.scale, x0: plain.x0, y0: plain.y0 }));
      // La place est là : aucune réduction, mais les repères sont tracés.
      const a3 = SheetLayout.sheetSize('A3', 'portrait');
      const roomy = SheetLayout.compute({ sheet: a3, page: a6, cols: 2, rows: 2, marks: true });
      if (roomy.scale !== 1 || roomy.cutMarks.length !== 12) bad.push(`4 A6 sur A3 : échelle ${roomy.scale}, ${roomy.cutMarks.length} repères`);
      const single = SheetLayout.compute({ sheet: a3, page: PageLayout.pageSizePtFor('portrait', 'A4'), cols: 1, rows: 1, marks: true });
      if (single.scale !== 1 || single.cutMarks.length !== 8) bad.push(`une A4 sur A3 : échelle ${single.scale}, ${single.cutMarks.length} repères`);
      // 4 x 2 A6 sur une A3 paysage : 2 x 5 + 2 x 3 repères, pages réduites à 96 %.
      const wide = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A3', 'landscape'), page: a6, cols: 4, rows: 2, marks: true });
      if (wide.cutMarks.length !== 16 || Math.round(wide.scale * 100) !== 96) bad.push(`8 A6 sur A3 paysage : ${wide.cutMarks.length} repères, échelle ${wide.scale}`);
      return result(bad);
    },
  });

  // --- 4) La fenêtre : réglages de départ et changements ---------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_dialog_defaults_and_choices',
    description: 'La fenêtre « Assemblage avant impression » pour des A6 : départ en A4 portrait, 2 x 2 emplacements, sans traits de coupe, résumé « 4 emplacements par feuille (2 × 2) : 6 lignes, au moins 2 feuilles A4. », focus sur la feuille cochée ; A3 repart du meilleur sens (4 x 2), le sens et chaque nombre se changent, « Avec » les traits ; « Générer » rend le réglage et ferme',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          const promise = openDialog({ count: 6 });
          const s0 = state();
          const want0 = { sheet: 'A4', orientation: 'portrait', marks: 'off', cols: 2, rows: 2, colsMax: 2, rowsMax: 2, svgSlots: 4, svgMarks: 0, okDisabled: false };
          Object.keys(want0).forEach(k => { if (s0[k] !== want0[k]) bad.push(`départ : ${k} = ${s0[k]} au lieu de ${want0[k]}`); });
          if (s0.summary !== '4 emplacements par feuille (2 × 2) : 6 lignes, au moins 2 feuilles A4.') bad.push('résumé : ' + s0.summary);
          if (s0.hint !== 'Un emplacement par page, dans l’ordre de la table.' || s0.scaled !== '') bad.push('notes : ' + JSON.stringify([s0.hint, s0.scaled]));
          if (modal().querySelector('h3').textContent !== 'Assemblage avant impression') bad.push('titre : ' + modal().querySelector('h3').textContent);
          if (document.activeElement !== radioInput('pp-sheets-sheet', 'A4')) bad.push('le focus n’est pas sur la feuille cochée : ' + (document.activeElement && (document.activeElement.name || document.activeElement.tagName)));
          if (s0.viewBox !== '0 0 595.28 841.89') bad.push('feuille d’aperçu : ' + s0.viewBox);
          // A3 : le meilleur sens pour elle (paysage) et tous ses emplacements.
          pickRadio('pp-sheets-sheet', 'A3');
          const s1 = state();
          if (s1.sheet !== 'A3' || s1.orientation !== 'landscape' || s1.cols !== 4 || s1.rows !== 2 || s1.svgSlots !== 8) bad.push('A3 : ' + JSON.stringify(s1));
          if (s1.summary !== '8 emplacements par feuille (4 × 2) : 6 lignes, au moins 1 feuille A3.') bad.push('résumé A3 : ' + s1.summary);
          // Portrait : tous les emplacements de ce sens.
          pickRadio('pp-sheets-orientation', 'portrait');
          const s2 = state();
          if (s2.orientation !== 'portrait' || s2.cols !== 2 || s2.rows !== 2 || s2.summary !== '4 emplacements par feuille (2 × 2) : 6 lignes, au moins 2 feuilles A3.') bad.push('A3 portrait : ' + JSON.stringify(s2));
          // Un nombre d'emplacements en largeur : une seule colonne, deux lignes.
          pickSelect('pp-sheets-cols', 1);
          const s3 = state();
          if (s3.cols !== 1 || s3.rows !== 2 || s3.svgSlots !== 2 || s3.summary !== '2 emplacements par feuille (1 × 2) : 6 lignes, au moins 3 feuilles A3.') bad.push('1 x 2 : ' + JSON.stringify(s3));
          // Revenir à l'A4 repart de son meilleur réglage, pas des nombres de la feuille d'avant.
          pickRadio('pp-sheets-sheet', 'A4');
          const s4 = state();
          if (s4.sheet !== 'A4' || s4.orientation !== 'portrait' || s4.cols !== 2 || s4.rows !== 2) bad.push('retour à l’A4 : ' + JSON.stringify(s4));
          pickRadio('pp-sheets-marks', 'on');
          const s5 = state();
          if (s5.marks !== 'on' || s5.svgMarks !== 12 || s5.scaled !== 'Pages réduites à 93 % pour laisser la place aux traits de coupe.') bad.push('avec traits : ' + JSON.stringify(s5));
          okButton().click();
          const got = await promise;
          if (!got || got.sheet !== 'A4' || got.orientation !== 'portrait' || got.cols !== 2 || got.rows !== 2 || got.marks !== true) bad.push('réglage rendu : ' + JSON.stringify(got && { sheet: got.sheet, orientation: got.orientation, cols: got.cols, rows: got.rows, marks: got.marks }));
          else if (!got.layout || got.layout.count !== 4 || !got.layout.hasMarks || Math.round(got.layout.scale * 100) !== 93 || got.layout.cutMarks.length !== 12) bad.push('planche rendue : ' + JSON.stringify(got.layout && { count: got.layout.count, scale: got.layout.scale, marks: got.layout.cutMarks.length }));
          if (isOpen()) bad.push('« Générer » ne ferme pas la fenêtre');
          // Une ligne, une feuille, un seul emplacement : les accords du résumé.
          const second = openDialog({ count: 1 });
          const one = state().summary;
          if (one !== '4 emplacements par feuille (2 × 2) : 1 ligne, au moins 1 feuille A4.') bad.push('une ligne : ' + one);
          cancelButton().click();
          await second;
        });
        await withPage('A4', 'portrait', async () => {
          forgetChoice();
          const promise = openDialog({ count: 6 });
          const single = state().summary;
          if (single !== '1 emplacement par feuille (1 × 1) : 6 lignes, au moins 6 feuilles A4.') bad.push('un emplacement : ' + single);
          cancelButton().click();
          await promise;
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 5) La fenêtre : ce qui ne tient pas est grisé, jamais retiré ------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_dialog_greys_what_does_not_fit_never_removes',
    description: 'Une page A3 ne tient pas sur une A4, une page A4 ne tient pas sur une A4 paysage : le choix reste affiché, grisé (classe, info-bulle qui dit pourquoi), un clic dessus ne change rien ; rien ne disparaît (deux feuilles, deux sens, deux choix de traits à chaque état)',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A3', 'portrait', async () => {
          const promise = openDialog({ count: 6 });
          const s = state();
          if (s.sheet !== 'A3' || s.orientation !== 'portrait' || s.cols !== 1 || s.rows !== 1 || s.colsMax !== 1 || s.rowsMax !== 1) bad.push('A3 : ' + JSON.stringify(s));
          if (s.summary !== '1 emplacement par feuille (1 × 1) : 6 lignes, au moins 6 feuilles A3.') bad.push('résumé : ' + s.summary);
          const a4 = radioInput('pp-sheets-sheet', 'A4');
          if (!a4 || !a4.disabled || !radioLabel('pp-sheets-sheet', 'A4').classList.contains('pp-sheets-option-off') || radioLabel('pp-sheets-sheet', 'A4').title !== 'Trop petite pour une page A3.') bad.push('la feuille A4 n’est pas grisée avec sa raison : ' + (a4 && a4.disabled) + ' / ' + (a4 && radioLabel('pp-sheets-sheet', 'A4').title));
          const land = radioInput('pp-sheets-orientation', 'landscape');
          if (!land || !land.disabled || !radioLabel('pp-sheets-orientation', 'landscape').classList.contains('pp-sheets-option-off') || radioLabel('pp-sheets-orientation', 'landscape').title !== 'Une page A3 n’y tient pas.') bad.push('le paysage n’est pas grisé avec sa raison : ' + (land && land.title));
          if (radioInput('pp-sheets-sheet', 'A3').disabled || radioInput('pp-sheets-orientation', 'portrait').disabled || radioLabel('pp-sheets-sheet', 'A3').title !== '') bad.push('un choix possible est grisé');
          a4.click();
          land.click();
          const after = state();
          if (after.sheet !== 'A3' || after.orientation !== 'portrait') bad.push('un clic sur un choix grisé a changé le réglage : ' + after.sheet + ' ' + after.orientation);
          // Avec les traits de coupe : 95 % (7 mm de chaque côté d'une page qui remplit la feuille).
          pickRadio('pp-sheets-marks', 'on');
          const marked = state();
          if (marked.scaled !== 'Pages réduites à 95 % pour laisser la place aux traits de coupe.' || marked.svgMarks !== 8) bad.push('A3 avec traits : ' + JSON.stringify(marked.scaled) + ' / ' + marked.svgMarks);
          const counts = [modal().querySelectorAll('input[name="pp-sheets-sheet"]').length, modal().querySelectorAll('input[name="pp-sheets-orientation"]').length, modal().querySelectorAll('input[name="pp-sheets-marks"]').length];
          if (counts.join() !== '2,2,2') bad.push('des choix ont disparu : ' + counts.join());
          cancelButton().click();
          await promise;
        });
        await withPage('A4', 'portrait', async () => {
          forgetChoice();
          const promise = openDialog({ count: 6 });
          const land = radioInput('pp-sheets-orientation', 'landscape');
          if (!land.disabled || !radioLabel('pp-sheets-orientation', 'landscape').classList.contains('pp-sheets-option-off') || radioLabel('pp-sheets-orientation', 'landscape').title !== 'Une page A4 n’y tient pas.') bad.push('A4 : le paysage n’est pas grisé avec sa raison');
          // L'A3, elle, reçoit deux A4 en paysage.
          pickRadio('pp-sheets-sheet', 'A3');
          const s = state();
          if (s.sheet !== 'A3' || s.orientation !== 'landscape' || s.cols !== 2 || s.rows !== 1 || s.summary !== '2 emplacements par feuille (2 × 1) : 6 lignes, au moins 3 feuilles A3.') bad.push('A4 sur A3 : ' + JSON.stringify(s));
          cancelButton().click();
          await promise;
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 6) La fenêtre : la note d'échelle et la feuille d'aperçu suivent le choix -----------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_dialog_scale_note_and_preview_follow_the_choice',
    description: 'La note « Pages réduites à N % » n’apparaît que si les traits de coupe obligent à réduire (A6 sur A4 : 93 %, sur A3 paysage : 96 %) et disparaît quand la place est là (A3 portrait, un seul emplacement, sans traits) ; la feuille d’aperçu dessine autant d’emplacements numérotés et de repères que le fichier en portera',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          const promise = openDialog({ count: 6 });
          const off = state();
          if (off.scaled !== '' || off.svgMarks !== 0 || off.svgSlots !== 4) bad.push('sans traits : ' + JSON.stringify(off.scaled) + ' / ' + off.svgMarks);
          const numbers = Array.from(modal().querySelectorAll('.pp-sheets-slot-number')).map(t => t.textContent).join();
          if (numbers !== '1,2,3,4') bad.push('numéros de l’aperçu : ' + numbers);
          pickRadio('pp-sheets-marks', 'on');
          const a4 = state();
          if (a4.scaled !== 'Pages réduites à 93 % pour laisser la place aux traits de coupe.' || a4.svgMarks !== 12) bad.push('A4 avec traits : ' + JSON.stringify(a4.scaled) + ' / ' + a4.svgMarks);
          pickRadio('pp-sheets-sheet', 'A3');
          const a3 = state();
          if (a3.scaled !== 'Pages réduites à 96 % pour laisser la place aux traits de coupe.' || a3.svgMarks !== 16 || a3.svgSlots !== 8 || a3.viewBox !== '0 0 1190.55 841.89') bad.push('A3 paysage avec traits : ' + JSON.stringify({ scaled: a3.scaled, marks: a3.svgMarks, slots: a3.svgSlots, box: a3.viewBox }));
          pickRadio('pp-sheets-orientation', 'portrait');
          const roomy = state();
          if (roomy.scaled !== '' || roomy.svgMarks !== 12 || roomy.viewBox !== '0 0 841.89 1190.55') bad.push('A3 portrait avec traits : ' + JSON.stringify({ scaled: roomy.scaled, marks: roomy.svgMarks, box: roomy.viewBox }));
          pickRadio('pp-sheets-sheet', 'A4');
          pickSelect('pp-sheets-cols', 1);
          pickSelect('pp-sheets-rows', 1);
          const one = state();
          if (one.svgSlots !== 1 || one.svgMarks !== 8 || one.scaled !== '' || one.summary !== '1 emplacement par feuille (1 × 1) : 6 lignes, au moins 6 feuilles A4.') bad.push('un seul emplacement : ' + JSON.stringify(one));
          cancelButton().click();
          await promise;
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 7) Le dernier choix est gardé, les emplacements repartent du maximum -----------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_dialog_remembers_sheet_orientation_and_marks_not_slot_counts',
    description: 'Le dernier choix (feuille, sens, traits de coupe) est gardé à « Générer » seulement et rouvert tel quel, les emplacements repartent du maximum ; un choix gardé qui ne convient plus à la page revient au meilleur réglage ; un stockage abîmé, inconnu ou refusé ne casse rien',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      const origGet = Storage.prototype.getItem;
      const origSet = Storage.prototype.setItem;
      try {
        await withPage('A6', 'portrait', async () => {
          let promise = openDialog({ count: 6 });
          pickRadio('pp-sheets-sheet', 'A3');
          pickRadio('pp-sheets-marks', 'on');
          pickSelect('pp-sheets-cols', 2);
          cancelButton().click();
          await promise;
          if (localStorage.getItem(SheetAssemblyDialog.STORAGE) !== null) bad.push('« Annuler » a gardé un choix');
          promise = openDialog({ count: 6 });
          pickRadio('pp-sheets-sheet', 'A3');
          pickRadio('pp-sheets-marks', 'on');
          pickSelect('pp-sheets-cols', 2);
          okButton().click();
          await promise;
          const stored = JSON.parse(localStorage.getItem(SheetAssemblyDialog.STORAGE) || 'null');
          if (!stored || Object.keys(stored).sort().join() !== 'margin,marks,orientation,sheet' || stored.sheet !== 'A3' || stored.orientation !== 'landscape' || stored.marks !== true || stored.margin !== 0) bad.push('choix gardé : ' + JSON.stringify(stored));
          promise = openDialog({ count: 6 });
          const again = state();
          if (again.sheet !== 'A3' || again.orientation !== 'landscape' || again.marks !== 'on' || again.cols !== 4 || again.rows !== 2) bad.push('rouverte : ' + JSON.stringify(again));
          cancelButton().click();
          await promise;
          // Stockage abîmé, feuille inconnue : le meilleur réglage, sans erreur.
          for (const raw of ['{oups', JSON.stringify({ sheet: 'A0', orientation: 'portrait', marks: false }), 'null', '12']) {
            localStorage.setItem(SheetAssemblyDialog.STORAGE, raw);
            promise = openDialog({ count: 6 });
            const s = state();
            if (s.sheet !== 'A4' || s.orientation !== 'portrait' || s.cols !== 2 || s.rows !== 2) bad.push(`stockage « ${raw} » : ${s.sheet} ${s.orientation} ${s.cols}x${s.rows}`);
            cancelButton().click();
            await promise;
          }
          // Stockage refusé (navigation privée) : la fenêtre s'ouvre, « Générer » rend le réglage.
          Storage.prototype.getItem = function () { throw new Error('stockage refusé'); };
          Storage.prototype.setItem = function () { throw new Error('stockage refusé'); };
          promise = openDialog({ count: 6 });
          const refused = state();
          okButton().click();
          const got = await promise;
          Storage.prototype.getItem = origGet;
          Storage.prototype.setItem = origSet;
          if (refused.sheet !== 'A4' || !got || got.layout.count !== 4) bad.push('stockage refusé : ' + refused.sheet + ' / ' + (got && got.layout.count));
        });
        // Un choix gardé pour une feuille où la page ne tient plus : le meilleur réglage de la page, les traits gardés.
        await withPage('A3', 'portrait', async () => {
          localStorage.setItem(SheetAssemblyDialog.STORAGE, JSON.stringify({ sheet: 'A3', orientation: 'landscape', marks: true }));
          const promise = openDialog({ count: 6 });
          const s = state();
          if (s.sheet !== 'A3' || s.orientation !== 'portrait' || s.marks !== 'on') bad.push('choix devenu impossible : ' + s.sheet + ' ' + s.orientation + ' traits ' + s.marks);
          cancelButton().click();
          await promise;
        });
      } finally {
        Storage.prototype.getItem = origGet;
        Storage.prototype.setItem = origSet;
        closeIfOpen();
        forgetChoice();
      }
      return result(bad);
    },
  });

  // --- 8) Annuler, Échap, Entrée, une seule fenêtre à la fois --------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_dialog_cancel_escape_enter_and_one_at_a_time',
    description: '« Annuler » et Échap ferment en rendant null (rien de gardé), le focus revient à l’élément d’avant ; Entrée sur un réglage valide ; une seconde demande pendant qu’une fenêtre est ouverte annule la première',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          const opener = document.getElementById('btn-export-pdf');
          opener.focus();
          let promise = openDialog({ count: 6 });
          pickRadio('pp-sheets-marks', 'on');
          cancelButton().click();
          let got = await promise;
          if (got !== null || isOpen() || localStorage.getItem(SheetAssemblyDialog.STORAGE) !== null) bad.push('Annuler : ' + JSON.stringify(got) + ' / ouverte ' + isOpen());
          if (document.activeElement !== opener) bad.push('le focus n’est pas revenu à l’élément d’avant : ' + (document.activeElement && (document.activeElement.id || document.activeElement.tagName)));
          promise = openDialog({ count: 6 });
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          got = await promise;
          if (got !== null || isOpen()) bad.push('Échap : ' + JSON.stringify(got) + ' / ouverte ' + isOpen());
          promise = openDialog({ count: 6 });
          radioInput('pp-sheets-orientation', 'portrait').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          got = await promise;
          if (!got || got.sheet !== 'A4' || isOpen()) bad.push('Entrée : ' + JSON.stringify(got && got.sheet) + ' / ouverte ' + isOpen());
          // Une seconde demande annule la première et ouvre la sienne.
          forgetChoice();
          const first = SheetAssemblyDialog.open({ count: 6, table: TABLE });
          await h.sleep(40);
          const second = SheetAssemblyDialog.open({ count: 2, table: TABLE });
          await h.sleep(60);
          const firstResult = await first;
          if (firstResult !== null || !isOpen() || state().summary !== '4 emplacements par feuille (2 × 2) : 2 lignes, au moins 1 feuille A4.') bad.push('seconde demande : première = ' + JSON.stringify(firstResult) + ', ouverte ' + isOpen() + ', ' + state().summary);
          okButton().click();
          const secondResult = await second;
          if (!secondResult || isOpen()) bad.push('seconde demande : réponse ' + JSON.stringify(secondResult && secondResult.sheet));
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 9) Les textes, en français et en anglais, les mots de la grille --------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_dialog_texts_in_french_and_english_and_grid_wording',
    description: 'Titre, libellés, choix, champ de la marge, boutons, résumé et note d’échelle en français puis en anglais (accords « 1 ligne » / « 6 lignes », « 1 row » / « 6 rows ») ; dans une grille, les lignes deviennent des « valeurs de la table », jamais des lignes',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      const previous = I18n.getLang();
      const labels = () => ({
        title: modal().querySelector('h3').textContent,
        labels: Array.from(modal().querySelectorAll('.pp-sheets-label')).map(l => l.textContent).join(),
        options: Array.from(modal().querySelectorAll('.pp-sheets-option span')).map(l => l.textContent).join(),
        slots: Array.from(modal().querySelectorAll('.pp-sheets-slot-field span')).map(l => l.textContent).join(),
        buttons: Array.from(modal().querySelectorAll('.var-modal-actions button')).map(b => b.textContent).join(),
        names: ['pp-sheets-cols', 'pp-sheets-rows'].map(id => document.getElementById(id).getAttribute('aria-labelledby')).join(),
        // La marge : la fin de sa phrase, à droite du champ, et le nom du champ (son libellé de ligne puis ce texte).
        margin: document.getElementById('pp-sheets-margin-text').textContent,
        marginName: document.getElementById('pp-sheets-margin').getAttribute('aria-labelledby'),
      });
      try {
        await withPage('A6', 'portrait', async () => {
          I18n.setLang('fr');
          let promise = openDialog({ count: 6 });
          pickRadio('pp-sheets-marks', 'on');
          const fr = Object.assign(labels(), { notes: [state().hint, state().scaled].filter(Boolean).join(' / ') });
          const wantFr = { title: 'Assemblage avant impression', labels: 'Feuille,Orientation,Traits de coupe,Marge,Emplacements', options: 'A4,A3,Portrait,Paysage,Sans,Avec', slots: 'en largeur,en hauteur', buttons: 'Annuler,Générer', margin: 'mm autour de chaque page', marginName: 'pp-sheets-margin-label pp-sheets-margin-text', notes: 'Un emplacement par page, dans l’ordre de la table. / Pages réduites à 93 % pour laisser la place aux traits de coupe.' };
          Object.keys(wantFr).forEach(k => { if (fr[k] !== wantFr[k]) bad.push(`français, ${k} : ${fr[k]}`); });
          if (!/^pp-sheets-slots-label pp-sheets-(cols|rows)-text$/.test(fr.names.split(',')[0]) || !/^pp-sheets-slots-label pp-sheets-(cols|rows)-text$/.test(fr.names.split(',')[1])) bad.push('noms accessibles des deux listes : ' + fr.names);
          cancelButton().click();
          await promise;
          // Une grille : « valeurs de la table ».
          promise = openDialog({ count: 3, grid: true });
          const grid = state().summary;
          if (grid !== '4 emplacements par feuille (2 × 2) : 3 valeurs de la table, au moins 1 feuille A4.' || /ligne/.test(grid)) bad.push('grille, français : ' + grid);
          cancelButton().click();
          await promise;
          promise = openDialog({ count: 1, grid: true });
          const gridOne = state().summary;
          if (gridOne !== '4 emplacements par feuille (2 × 2) : 1 valeur de la table, au moins 1 feuille A4.') bad.push('grille, une valeur : ' + gridOne);
          cancelButton().click();
          await promise;
          I18n.setLang('en');
          promise = openDialog({ count: 6 });
          pickRadio('pp-sheets-marks', 'on');
          const en = Object.assign(labels(), { summary: state().summary, notes: [state().hint, state().scaled].filter(Boolean).join(' / ') });
          const wantEn = { title: 'Assemble before printing', labels: 'Sheet,Orientation,Crop marks,Margin,Slots', options: 'A4,A3,Portrait,Landscape,Without,With', slots: 'across,down', buttons: 'Cancel,Generate', margin: 'mm around each page', marginName: 'pp-sheets-margin-label pp-sheets-margin-text', summary: '4 slots per sheet (2 × 2): 6 rows, at least 2 A4 sheets.', notes: 'One slot per page, in table order. / Pages reduced to 93% to leave room for the crop marks.' };
          Object.keys(wantEn).forEach(k => { if (en[k] !== wantEn[k]) bad.push(`anglais, ${k} : ${en[k]}`); });
          cancelButton().click();
          await promise;
          promise = openDialog({ count: 1 });
          const enOne = state().summary;
          if (enOne !== '4 slots per sheet (2 × 2): 1 row, at least 1 A4 sheet.') bad.push('anglais, une ligne : ' + enOne);
          cancelButton().click();
          await promise;
          promise = openDialog({ count: 3, grid: true });
          const enGrid = state().summary;
          if (enGrid !== '4 slots per sheet (2 × 2): 3 table values, at least 1 A4 sheet.' || /\brows?\b/.test(enGrid)) bad.push('grille, anglais : ' + enGrid);
          cancelButton().click();
          await promise;
        });
      } finally { I18n.setLang(previous); closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 10) Le fichier : quatre A6 par A4, sans traits de coupe ------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_pdf_four_a6_per_a4_rows_in_reading_order',
    description: '« Assemblage avant impression… » (A6 sur A4, sans traits de coupe), six lignes : un seul fichier « <table>-assemblage.pdf », deux feuilles A4 (quatre lignes puis deux), chaque ligne dans l’emplacement suivant - gauche à droite puis haut en bas -, à la taille d’une page A6 (marge de 28 pt au même endroit dans chaque case), rien dans la marge, aucun trait ; la fenêtre tient lieu de confirmation, le titre du PDF est la table, le message final compte lignes et feuilles',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          const res = await exportSheets(h);
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          if (dl.name !== TABLE + '-assemblage.pdf' || dl.blob.type !== 'application/pdf') bad.push('fichier : ' + dl.name + ' ' + dl.blob.type);
          if (res.confirms.length) bad.push('une seconde question a été posée : ' + JSON.stringify(res.confirms));
          if (res.status !== '6 lignes placées sur 2 feuilles — fichier téléchargé.' || res.status !== I18n.t('status.sheetsExportDone', { ok: 6, sheets: 2 })) bad.push('message final : ' + res.status);
          if (!res.statuses.includes(I18n.t('status.sheetsAssembling'))) bad.push('« Assemblage des feuilles... » jamais affiché : ' + JSON.stringify(res.statuses));
          const title = await pdfTitle(h, dl.blob);
          if (title !== TABLE) bad.push('titre du PDF : ' + title);
          const sheets = await readSheets(h, dl.blob);
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 2, rows: 2, marks: false });
          if (sheets.length !== 2) return bad.push('feuilles : ' + sheets.length);
          const offsets = [];
          sheets.forEach((sheet, s) => {
            if (!near(sheet.width, 595.28) || !near(sheet.height, 841.89)) bad.push(`feuille ${s + 1} : ${sheet.width} x ${sheet.height}`);
            if (sheet.lines.length) bad.push(`feuille ${s + 1} : ${sheet.lines.length} trait(s) sans traits de coupe demandés`);
            const placed = textBySlot(layout, sheet);
            if (placed.stray.length) bad.push(`feuille ${s + 1} : texte hors des emplacements : ${placed.stray.join(' | ')}`);
            placed.texts.forEach((text, k) => {
              const index = s * 4 + k;
              const want = index < NAMES.length ? squash(NAMES[index]) : '';
              if (squash(text) !== want) bad.push(`feuille ${s + 1}, emplacement ${k + 1} : « ${text} » au lieu de « ${want} »`);
              if (placed.first[k]) offsets.push({ x: placed.first[k].x - layout.slots[k].x, y: placed.first[k].y - layout.slots[k].y });
            });
          });
          quarterProblems(sheets, nameIndex, NAMES.length).forEach(p => bad.push(p));
          // Les pages gardent leur taille : la marge de 28 pt tombe au même endroit dans chacune des six cases.
          if (offsets.length !== 6 || offsets.some(o => !near(o.x, 28, 0.6) || !near(o.y, offsets[0].y, 0.3))) bad.push('texte décalé d’une case à l’autre : ' + JSON.stringify(offsets));
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 11) Le fichier : avec traits de coupe, pages réduites, repères tracés ---------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_pdf_with_crop_marks_scaled_pages_and_every_mark_painted',
    description: 'A6 sur A4 avec traits de coupe, six lignes : les pages sont réduites à 93 % (la marge de 28 pt devient 26 pt dans chaque case), chaque feuille - même la seconde, à moitié pleine - porte les 12 repères tracés à 0,5 pt en noir, aux positions de l’aperçu, hors de la grille et de tout texte ; relue aux pixels, chaque repère se voit et la marge entre deux repères reste blanche',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          let preview = null;
          const res = await exportSheets(h, async () => { pickRadio('pp-sheets-marks', 'on'); preview = state(); okButton().click(); });
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 2, rows: 2, marks: true });
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 2) return bad.push('feuilles : ' + sheets.length);
          if (preview.svgMarks !== layout.cutMarks.length || preview.svgSlots !== 4) bad.push(`l’aperçu montre ${preview.svgMarks} repères et ${preview.svgSlots} emplacements, la planche en demande ${layout.cutMarks.length} et 4`);
          const offsets = [];
          sheets.forEach((sheet, s) => {
            if (!near(sheet.width, 595.28) || !near(sheet.height, 841.89)) bad.push(`feuille ${s + 1} : ${sheet.width} x ${sheet.height}`);
            // Les repères : les mêmes positions que l'aperçu, 0,5 pt, noir.
            const used = new Set();
            let missing = 0;
            layout.cutMarks.forEach(m => {
              const at = sheet.lines.findIndex((l, i) => !used.has(i) && near(l.x1, m.x1, 0.02) && near(l.y1, m.y1, 0.02) && near(l.x2, m.x2, 0.02) && near(l.y2, m.y2, 0.02));
              if (at < 0) missing++; else used.add(at);
            });
            if (sheet.lines.length !== layout.cutMarks.length || missing) bad.push(`feuille ${s + 1} : ${sheet.lines.length} traits tracés, ${missing} repère(s) absents sur ${layout.cutMarks.length}`);
            const odd = sheet.lines.filter(l => l.width !== 0.5 || ![1, 3, 5].every(i => parseInt(l.color.slice(i, i + 2), 16) <= 0x50));
            if (odd.length) bad.push(`feuille ${s + 1} : ${odd.length} trait(s) ni noirs ni de 0,5 pt : ${JSON.stringify(odd[0])}`);
            const placed = textBySlot(layout, sheet);
            if (placed.stray.length) bad.push(`feuille ${s + 1} : texte hors des emplacements : ${placed.stray.join(' | ')}`);
            placed.texts.forEach((text, k) => {
              const index = s * 4 + k;
              const want = index < NAMES.length ? squash(NAMES[index]) : '';
              if (squash(text) !== want) bad.push(`feuille ${s + 1}, emplacement ${k + 1} : « ${text} » au lieu de « ${want} »`);
              if (placed.first[k]) offsets.push(placed.first[k].x - layout.slots[k].x);
            });
          });
          quarterProblems(sheets, nameIndex, NAMES.length).forEach(p => bad.push(p));
          // La marge de 28 pt est réduite comme la page (93 % -> 26,1 pt) : la page est réduite, pas rognée.
          const wantOffset = 28 * layout.scale;
          if (offsets.length !== 6 || offsets.some(o => !near(o, wantOffset, 0.4))) bad.push(`marge réduite : ${offsets.map(o => Math.round(o * 100) / 100).join()} au lieu de ${Math.round(wantOffset * 100) / 100}`);
          // Aux pixels : chaque repère se voit (sombre), et un point de la marge qui n'est sur aucun repère reste blanc.
          for (const s of [0, 1]) {
            const rendered = await renderSheet(h, dl.blob, s + 1, 3);
            const faint = layout.cutMarks.filter(m => darkest(rendered, (m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2, 3) > 170).length;
            if (faint) bad.push(`feuille ${s + 1} : ${faint} repère(s) invisibles aux pixels`);
            const blank = darkest(rendered, layout.x0 + layout.cellWidth / 2, layout.y0 - SheetLayout.MARK.offset - SheetLayout.MARK.length / 2, 3);
            if (blank < 250) bad.push(`feuille ${s + 1} : la marge n'est pas blanche entre les repères (${blank})`);
          }
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 12) Le fichier : une A3 en paysage, trois emplacements choisis ----------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_pdf_a3_landscape_with_chosen_slot_counts',
    description: 'Feuille A3 (paysage, choisie à la souris) et 3 x 1 emplacements pour des A6, six lignes : deux feuilles de 1190,55 x 841,89 pt, trois pages côte à côte au centre de chacune, les lignes dans l’ordre, la marge de 28 pt intacte (aucune réduction sans traits)',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          let summary = '';
          const res = await exportSheets(h, async () => { pickRadio('pp-sheets-sheet', 'A3'); pickSelect('pp-sheets-cols', 3); pickSelect('pp-sheets-rows', 1); summary = state().summary; okButton().click(); });
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          if (summary !== '3 emplacements par feuille (3 × 1) : 6 lignes, au moins 2 feuilles A3.') bad.push('résumé : ' + summary);
          if (res.status !== '6 lignes placées sur 2 feuilles — fichier téléchargé.') bad.push('message final : ' + res.status);
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A3', 'landscape'), page: PageLayout.getPageSizePt(), cols: 3, rows: 1, marks: false });
          if (!near(layout.x0, (1190.55 - 3 * 297.64) / 2, 0.02) || !near(layout.y0, (841.89 - 419.53) / 2, 0.02)) bad.push('grille attendue : ' + layout.x0 + ', ' + layout.y0);
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 2) return bad.push('feuilles : ' + sheets.length);
          sheets.forEach((sheet, s) => {
            if (!near(sheet.width, 1190.55) || !near(sheet.height, 841.89)) bad.push(`feuille ${s + 1} : ${sheet.width} x ${sheet.height}`);
            const placed = textBySlot(layout, sheet);
            if (placed.stray.length) bad.push(`feuille ${s + 1} : texte hors des emplacements : ${placed.stray.join(' | ')}`);
            placed.texts.forEach((text, k) => {
              const want = squash(NAMES[s * 3 + k]);
              if (squash(text) !== want) bad.push(`feuille ${s + 1}, emplacement ${k + 1} : « ${text} » au lieu de « ${want} »`);
              if (placed.first[k] && !near(placed.first[k].x - layout.slots[k].x, 28, 0.6)) bad.push(`feuille ${s + 1}, emplacement ${k + 1} : marge ${placed.first[k].x - layout.slots[k].x}`);
            });
          });
          // Indépendamment de SheetLayout : sur chaque feuille, les trois lignes se suivent de gauche à droite, à la même hauteur.
          sheets.forEach((sheet, s) => {
            const at = [0, 1, 2].map(k => sheet.items.find(it => nameIndex(it.str) === s * 3 + k));
            if (at.some(it => !it)) { bad.push(`feuille ${s + 1} : une ligne manque ${JSON.stringify(sheet.items.map(it => [it.str, Math.round(it.x), Math.round(it.y)]))}`); return; }
            if (!(at[0].x < at[1].x && at[1].x < at[2].x) || at.some(it => Math.abs(it.y - at[0].y) > 1)) bad.push(`feuille ${s + 1} : les lignes ne se suivent pas de gauche à droite à la même hauteur : ${JSON.stringify(at.map(it => [Math.round(it.x), Math.round(it.y)]))}`);
          });
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 13) Le fichier : une ligne de plusieurs pages prend plusieurs emplacements -------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_pdf_rows_with_several_pages_take_several_slots',
    description: 'Une ligne de deux pages (saut de page) prend deux emplacements : trois lignes donnent six pages, quatre sur la première feuille (ligne 1 page 1, ligne 1 page 2, ligne 2 page 1, ligne 2 page 2) et deux sur la seconde, les deux dernières cases restant vides',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>Bonjour ${badge('Nom')}</p><div class="page-break-marker">Saut de page</div><p>Suite pour ${badge('Nom')}</p>`, 3);
          const res = await exportSheets(h);
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          if (res.status !== '3 lignes placées sur 2 feuilles — fichier téléchargé.') bad.push('message final : ' + res.status);
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 2, rows: 2, marks: false });
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 2) return bad.push('feuilles : ' + sheets.length);
          const want = [
            ['Bonjour ' + NAMES[0], 'Suite pour ' + NAMES[0], 'Bonjour ' + NAMES[1], 'Suite pour ' + NAMES[1]],
            ['Bonjour ' + NAMES[2], 'Suite pour ' + NAMES[2], '', ''],
          ];
          sheets.forEach((sheet, s) => {
            const placed = textBySlot(layout, sheet);
            if (placed.stray.length) bad.push(`feuille ${s + 1} : texte hors des emplacements : ${placed.stray.join(' | ')}`);
            placed.texts.forEach((text, k) => { if (squash(text) !== squash(want[s][k])) bad.push(`feuille ${s + 1}, emplacement ${k + 1} : « ${text} » au lieu de « ${want[s][k]} »`); });
          });
          // Indépendamment de SheetLayout : « Bonjour » (page 1 de la ligne) à gauche, « Suite » (page 2) à droite ; la ligne n° i est sur la feuille floor(i / 2), en haut si i est pair.
          const seen = { bonjour: 0, suite: 0, named: 0 };
          sheets.forEach((sheet, s) => sheet.items.forEach(it => {
            const text = squash(it.str);
            if (/^Bonjour/.test(text)) { seen.bonjour++; if (!(it.x < sheet.width / 2)) bad.push(`feuille ${s + 1} : « ${it.str} » n’est pas dans la colonne de gauche`); }
            if (/^Suite/.test(text)) { seen.suite++; if (!(it.x > sheet.width / 2)) bad.push(`feuille ${s + 1} : « ${it.str} » n’est pas dans la colonne de droite`); }
            const row = nameIndex(it.str);
            if (row >= 0) {
              seen.named++;
              if (Math.floor(row / 2) !== s || (it.y < sheet.height / 2) !== (row % 2 === 0)) bad.push(`feuille ${s + 1} : « ${it.str} » (ligne ${row + 1}) n’est pas où l’ordre de lecture la met`);
            }
          }));
          // Un contrôle qui ne regarde rien passe toujours : trois « Bonjour », trois « Suite », six prénoms (un par page) doivent avoir été vérifiés.
          if (seen.bonjour !== 3 || seen.suite !== 3 || seen.named !== 6) bad.push('textes vérifiés : ' + JSON.stringify(seen));
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 13 bis) Le résumé annonce un minimum quand une ligne peut prendre plusieurs pages ------------------------------------------------------------------------------------------
  // B5 du 04/10 (rapport « cas d'usage ») : la fenêtre disait « 3 lignes sur 1 feuille A4 » pour un modèle de deux pages, dont le fichier a deux feuilles (et « 48 lignes sur 12 feuilles »
  // pour 22 feuilles réelles) : elle ne sait pas, avant de générer, combien de pages donne chaque ligne. Un nombre de feuilles que le fichier peut dépasser est donc dit « au moins ».
  cases.push({
    id: 'sheetassembly_summary_announces_a_minimum_when_a_row_can_take_several_pages',
    description: 'Une ligne de deux pages prend deux emplacements : pour trois lignes la fenêtre ne dit plus « sur 1 feuille » alors que le fichier en a 2, elle annonce « au moins 1 feuille A4 » (« at least 1 A4 sheet » en anglais, aussi pour des valeurs de grille) et la note parle d’un emplacement par page, pas par ligne ; un nombre exact ne serait permis que s’il égalait celui du fichier',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>Bonjour ${badge('Nom')}</p><div class="page-break-marker">Saut de page</div><p>Suite pour ${badge('Nom')}</p>`, 3);
          let fr = null;
          const res = await exportSheets(h, async () => { fr = state(); okButton().click(); });
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          const real = (await readSheets(h, dl.blob)).length;
          // Ce que la fenêtre promet : « au moins N feuilles » ne dépasse jamais le fichier, « sur N feuilles » (un nombre exact) doit l'égaler.
          const claim = summary => {
            const m = summary.match(/(\d+) (?:feuilles?|A[34] sheets?)/);
            const exact = !/au moins|at least/.test(summary);
            return m ? { sheets: Number(m[1]), exact } : null;
          };
          const said = claim(fr.summary);
          if (real !== 2) bad.push('le fichier devait avoir 2 feuilles : ' + real);
          if (!said) bad.push('nombre de feuilles introuvable dans le résumé : ' + fr.summary);
          else if (said.exact ? said.sheets !== real : said.sheets > real) bad.push('le résumé dit « ' + fr.summary + ' », le fichier a ' + real + ' feuilles');
          if (said && said.exact) bad.push('un nombre exact alors que chaque ligne peut prendre plusieurs pages : ' + fr.summary);
          if (!/emplacement par page/.test(fr.hint)) bad.push('la note ne dit pas qu’un emplacement est pris par page, non par ligne : ' + fr.hint);
          // Anglais, et une grille (« valeurs de la table ») : même promesse.
          I18n.setLang('en');
          try {
            openDialog({ count: 3 });
            const en = state();
            closeIfOpen();
            openDialog({ count: 3, grid: true });
            const gridEn = state();
            closeIfOpen();
            I18n.setLang('fr');
            openDialog({ count: 3, grid: true });
            const gridFr = state();
            closeIfOpen();
            if (!/at least \d+ A4 sheets?\.$/.test(en.summary) || !/slot per page/.test(en.hint)) bad.push('anglais : ' + JSON.stringify([en.summary, en.hint]));
            if (!/at least \d+ A4 sheets?\.$/.test(gridEn.summary) || /\brows?\b/.test(gridEn.summary)) bad.push('grille, anglais : ' + gridEn.summary);
            if (!/valeurs de la table, au moins \d+ feuilles? A4\.$/.test(gridFr.summary) || /ligne/.test(gridFr.summary)) bad.push('grille, français : ' + gridFr.summary);
          } finally { I18n.setLang('fr'); }
        });
      } finally { closeIfOpen(); forgetChoice(); I18n.setLang('fr'); }
      return result(bad);
    },
  });

  // --- 14) Annuler ne lance rien, la ligne et ses voisines sont grisées pendant la fenêtre ---------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_menu_row_cancel_downloads_nothing_and_locks_the_exports_while_open',
    description: 'Pendant que la fenêtre est ouverte, les trois lignes PDF du menu sont inactives (pas de second export par-dessus) ; « Annuler » et Échap ne téléchargent rien, ne chargent aucune bibliothèque (aucun message d’état), ne posent aucune seconde question, et rendent les lignes ; la ligne est dans le menu Exporter en PDF après « un seul PDF », en français et en anglais',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          const flyout = document.getElementById('v2-export-pdf-flyout');
          const ids = Array.from(flyout.querySelectorAll('.v2-hover-row')).map(r => r.id);
          if (ids.join() !== 'v2-btn-export-pdf-batch,v2-btn-export-pdf-merged,v2-btn-export-pdf-sheets') bad.push('lignes du menu : ' + ids.join());
          const row = document.getElementById(ROW_ID);
          if (row.textContent.trim() !== 'Assemblage avant impression…') bad.push('texte de la ligne : ' + row.textContent);
          I18n.setLang('en');
          const en = row.textContent.trim();
          I18n.setLang('fr');
          if (en !== 'Assemble before printing…' || row.textContent.trim() !== 'Assemblage avant impression…') bad.push('texte anglais : ' + en);
          const viaButton = await exportSheets(h, async () => { cancelButton().click(); }, false);
          if (!viaButton.opened || viaButton.downloads.length || viaButton.statuses.length || viaButton.confirms.length) bad.push('Annuler : ' + JSON.stringify({ opened: viaButton.opened, downloads: viaButton.downloads.length, statuses: viaButton.statuses, confirms: viaButton.confirms.length }));
          if (!viaButton.during || Object.values(viaButton.during).some(v => v !== 'none')) bad.push('lignes non verrouillées pendant la fenêtre : ' + JSON.stringify(viaButton.during));
          const after = ['v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', ROW_ID].map(id => document.getElementById(id).style.pointerEvents);
          if (after.some(v => v !== '')) bad.push('lignes restées verrouillées après Annuler : ' + after.join());
          const viaEscape = await exportSheets(h, async () => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }, false);
          if (!viaEscape.opened || viaEscape.downloads.length || viaEscape.statuses.length) bad.push('Échap : ' + JSON.stringify({ opened: viaEscape.opened, downloads: viaEscape.downloads.length, statuses: viaEscape.statuses }));
          if (localStorage.getItem(SheetAssemblyDialog.STORAGE) !== null) bad.push('un choix a été gardé sans « Générer »');
        });
      } finally { I18n.setLang('fr'); closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 15) Sans le droit d'exporter -----------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_menu_row_is_blocked_without_the_export_right',
    description: 'Sans le droit d’exporter (droits d’accès du document), un clic sur « Assemblage avant impression… » n’ouvre aucune fenêtre et ne télécharge rien ; les droits revenus, la ligne rouvre la fenêtre',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      const original = AccessRights.get;
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          AccessRights.get = () => ({ readOnly: false, canExport: false, canComment: true });
          const denied = await exportSheets(h, null, false);
          AccessRights.get = original;
          if (denied.opened || denied.downloads.length || denied.statuses.length) bad.push('droit retiré : ' + JSON.stringify({ opened: denied.opened, downloads: denied.downloads.length, statuses: denied.statuses }));
          const allowed = await exportSheets(h, async () => { cancelButton().click(); }, false);
          if (!allowed.opened) bad.push('droits revenus : la fenêtre ne s’ouvre pas');
        });
      } finally { AccessRights.get = original; closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 16) Une grille : « valeurs de la table » du résumé au message final ---------------------------------------------------------------------------------------------------
  async function enterGrid(h) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await h.sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(250);
  }
  cases.push({
    id: 'sheetassembly_grid_model_says_table_values_not_rows_and_places_them',
    description: 'Dans une grille, la fenêtre dit « 3 valeurs de la table » (jamais « lignes »), le message final « 3 valeurs placées sur 1 feuille » ; le fichier pose les trois valeurs dans les trois premiers emplacements d’une feuille A4 de quatre A6, le quatrième reste vide',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await h.resetEditor();
          const stub = window.__gristStub;
          stub.setVariables(TABLE, { Nom: 'Text' });
          stub.setRows(TABLE, NAMES.slice(0, 3).map((Nom, i) => ({ id: i + 1, Nom })));
          await GristAPI.refreshSchema();
          stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
          await h.sleep(100);
          await enterGrid(h);
          // Une nouvelle grille repart d'une page A4 : le format de la page se pose après elle.
          PageLayout.setFormat('A6');
          PageLayout.setOrientation('portrait');
          GridEditor.setActive(false);
          Editor.setHTML(`<table style="width: 240px;"><colgroup><col style="width: 240px;"></colgroup><tbody><tr data-row-height="30" style="height: 30px"><td colwidth="240"><p>${badge('Nom')}</p></td></tr></tbody></table>`);
          GridEditor.setActive(true);
          await h.sleep(250);
          let summary = '';
          const res = await exportSheets(h, async () => { summary = state().summary; okButton().click(); });
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          if (summary !== '4 emplacements par feuille (2 × 2) : 3 valeurs de la table, au moins 1 feuille A4.') bad.push('résumé : ' + summary);
          if (res.status !== '3 valeurs placées sur 1 feuille — fichier téléchargé.' || /ligne/.test(res.status)) bad.push('message final : ' + res.status);
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 2, rows: 2, marks: false });
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 1) return bad.push('feuilles : ' + sheets.length);
          const placed = textBySlot(layout, sheets[0]);
          placed.texts.forEach((text, k) => {
            const want = k < 3 ? squash(NAMES[k]) : '';
            if (squash(text) !== want) bad.push(`emplacement ${k + 1} : « ${text} » au lieu de « ${want} »`);
          });
        });
      } finally {
        try { await leaveGrid(h); } catch (e) { /* le modèle de départ reste celui de la grille : le scénario suivant repart de resetEditor */ }
        GridEditor.setActive(false);
        closeIfOpen();
        forgetChoice();
      }
      return result(bad);
    },
  });

  // --- 16) Un format libre (« Format libre… » du menu Page, dev-tests/scenarios-page-size.js) se place comme un format de la liste ----------------------------------------------------------
  // La page libre est posée par PageLayout.setPageSize (millimètres, dans le sens où on la voit : 70 x 37 est une étiquette en paysage, 100 x 150 une carte en portrait), avec les marges d'un
  // modèle neuf (celles de 3 mm d'une petite page viennent de cette même saisie) ; le format, le sens et les marges d'avant sont rétablis. Les nombres attendus sont calculés ICI à la main, en
  // points (70 mm = 198,43 pt, 37 mm = 104,88 pt ; l'A4 fait 595,28 x 841,89, l'A3 841,89 x 1190,55) : trois étiquettes font exactement la largeur de l'A4, six celle de l'A3 paysage.
  async function withFreePage(widthMm, heightMm, fn) {
    const before = { format: PageLayout.getFormat(), orientation: PageLayout.getOrientation() };
    PageLayout.setMarginsMm(null);
    if (!PageLayout.setPageSize(widthMm, heightMm)) throw new Error('setPageSize(' + widthMm + ', ' + heightMm + ') refusé');
    try { return await fn(); } finally { PageLayout.setFormat(before.format); PageLayout.setOrientation(before.orientation); PageLayout.setMarginsMm(null); }
  }

  cases.push({
    id: 'sheetassembly_free_format_geometry_and_dialog_defaults',
    description: 'Une page libre se place comme un format de la liste : 7 x 3,7 cm donne 24 emplacements (3 x 8) sur A4 portrait, 20 (4 x 5) en paysage, 44 (4 x 11) sur A3 portrait, 48 (6 x 8) en paysage ; 10 x 15 cm en donne 2 sur A4 et 4 sur A3 ; la fenêtre part de l’A4 et de son meilleur sens, de l’A3 seulement quand l’A4 ne reçoit rien (28 x 40 cm : A4 grisée avec sa raison, en centimètres), et dit « 24 emplacements par feuille (3 × 8) » ; avec traits de coupe, 93 % et 26 repères',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withFreePage(70, 37, async () => {
          const page = PageLayout.getPageSizePt();
          if (!near(page.width, 198.43, 0.02) || !near(page.height, 104.88, 0.02)) bad.push('page 7 x 3,7 cm : ' + page.width + ' x ' + page.height + ' pt');
          const grid = (sheet, orientation) => { const g = SheetLayout.maxGrid(SheetLayout.sheetSize(sheet, orientation), page); return g.cols + 'x' + g.rows; };
          const got = [grid('A4', 'portrait'), grid('A4', 'landscape'), grid('A3', 'portrait'), grid('A3', 'landscape')].join(' ');
          if (got !== '3x8 4x5 4x11 6x8') bad.push('grilles 7 x 3,7 cm (A4 portrait, A4 paysage, A3 portrait, A3 paysage) : ' + got + ' au lieu de 3x8 4x5 4x11 6x8');
          const best = SheetLayout.best(page);
          if (!best || best.sheet !== 'A4' || best.orientation !== 'portrait' || best.cols !== 3 || best.rows !== 8) bad.push('meilleur réglage : ' + JSON.stringify(best));
          const promise = openDialog({ count: 6 });
          const s0 = state();
          const want0 = { sheet: 'A4', orientation: 'portrait', marks: 'off', cols: 3, rows: 8, colsMax: 3, rowsMax: 8, svgSlots: 24, svgMarks: 0, okDisabled: false };
          Object.keys(want0).forEach(k => { if (s0[k] !== want0[k]) bad.push(`départ : ${k} = ${s0[k]} au lieu de ${want0[k]}`); });
          if (s0.summary !== '24 emplacements par feuille (3 × 8) : 6 lignes, au moins 1 feuille A4.') bad.push('résumé : ' + s0.summary);
          if (s0.scaled !== '' || s0.viewBox !== '0 0 595.28 841.89') bad.push('note ou feuille d’aperçu : ' + JSON.stringify([s0.scaled, s0.viewBox]));
          if (radioInput('pp-sheets-orientation', 'landscape').disabled || radioInput('pp-sheets-sheet', 'A3').disabled) bad.push('un choix possible est grisé');
          pickRadio('pp-sheets-orientation', 'landscape');
          const s1 = state();
          if (s1.orientation !== 'landscape' || s1.cols !== 4 || s1.rows !== 5 || s1.svgSlots !== 20 || s1.summary !== '20 emplacements par feuille (4 × 5) : 6 lignes, au moins 1 feuille A4.') bad.push('A4 paysage : ' + JSON.stringify(s1));
          pickRadio('pp-sheets-sheet', 'A3');
          const s2 = state();
          if (s2.sheet !== 'A3' || s2.orientation !== 'landscape' || s2.cols !== 6 || s2.rows !== 8 || s2.svgSlots !== 48 || s2.summary !== '48 emplacements par feuille (6 × 8) : 6 lignes, au moins 1 feuille A3.') bad.push('A3 : ' + JSON.stringify(s2));
          pickRadio('pp-sheets-orientation', 'portrait');
          const s3 = state();
          if (s3.cols !== 4 || s3.rows !== 11 || s3.svgSlots !== 44) bad.push('A3 portrait : ' + JSON.stringify(s3));
          // Traits de coupe sur l'A4 : 3 étiquettes en largeur remplissent la feuille, comme deux A6, donc 93 % ; quatre colonnes de coupe et neuf lignes, deux repères chacune.
          pickRadio('pp-sheets-sheet', 'A4');
          pickRadio('pp-sheets-marks', 'on');
          const s4 = state();
          if (s4.scaled !== 'Pages réduites à 93 % pour laisser la place aux traits de coupe.' || s4.svgMarks !== 26) bad.push('avec traits : ' + JSON.stringify([s4.scaled, s4.svgMarks]));
          cancelButton().click();
          await promise;
          forgetChoice();
          const one = openDialog({ count: 1 });
          if (state().summary !== '24 emplacements par feuille (3 × 8) : 1 ligne, au moins 1 feuille A4.') bad.push('une ligne : ' + state().summary);
          cancelButton().click();
          await one;
        });
        await withFreePage(100, 150, async () => {
          forgetChoice();
          const page = PageLayout.getPageSizePt();
          if (!near(page.width, 283.46, 0.02) || !near(page.height, 425.2, 0.02)) bad.push('page 10 x 15 cm : ' + page.width + ' x ' + page.height + ' pt');
          const promise = openDialog({ count: 6 });
          const a4 = state();
          if (a4.sheet !== 'A4' || a4.orientation !== 'portrait' || a4.cols !== 2 || a4.rows !== 1 || a4.summary !== '2 emplacements par feuille (2 × 1) : 6 lignes, au moins 3 feuilles A4.') bad.push('10 x 15 cm sur A4 : ' + JSON.stringify(a4));
          pickRadio('pp-sheets-sheet', 'A3');
          const a3 = state();
          if (a3.sheet !== 'A3' || a3.orientation !== 'portrait' || a3.cols !== 2 || a3.rows !== 2 || a3.svgSlots !== 4 || a3.summary !== '4 emplacements par feuille (2 × 2) : 6 lignes, au moins 2 feuilles A3.') bad.push('10 x 15 cm sur A3 : ' + JSON.stringify(a3));
          cancelButton().click();
          await promise;
        });
        // 28 x 40 cm : trop grande pour l'A4 dans les deux sens, l'A3 portrait en reçoit une ; la fenêtre part de l'A3, grise l'A4 et dit pourquoi dans la taille de la page.
        await withFreePage(280, 400, async () => {
          forgetChoice();
          const promise = openDialog({ count: 6 });
          const s = state();
          if (s.sheet !== 'A3' || s.orientation !== 'portrait' || s.cols !== 1 || s.rows !== 1 || s.svgSlots !== 1 || s.okDisabled || s.summary !== '1 emplacement par feuille (1 × 1) : 6 lignes, au moins 6 feuilles A3.') bad.push('28 x 40 cm : ' + JSON.stringify(s));
          const a4 = radioInput('pp-sheets-sheet', 'A4');
          if (!a4.disabled || radioLabel('pp-sheets-sheet', 'A4').title !== 'Trop petite pour une page 28 × 40 cm.') bad.push('la feuille A4 n’est pas grisée avec sa raison : ' + a4.disabled + ' / ' + radioLabel('pp-sheets-sheet', 'A4').title);
          const land = radioInput('pp-sheets-orientation', 'landscape');
          if (!land.disabled || radioLabel('pp-sheets-orientation', 'landscape').title !== 'Une page 28 × 40 cm n’y tient pas.') bad.push('le paysage n’est pas grisé avec sa raison : ' + land.disabled + ' / ' + radioLabel('pp-sheets-orientation', 'landscape').title);
          cancelButton().click();
          await promise;
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 17) Un format libre qui ne tient sur aucune feuille : la fenêtre le dit, rien n'est posé, rien n'est généré ---------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_free_format_that_fits_neither_sheet_says_so_and_generates_nothing',
    description: 'Une page de 40 x 50 cm ne tient ni sur l’A4 ni sur l’A3 : la fenêtre dit « Une page 40 × 50 cm ne tient ni sur A4 ni sur A3 : l’assemblage n’est pas possible. » (en anglais aussi), aucun emplacement ni repère n’est dessiné, aucune note de réduction même avec les traits de coupe, les deux feuilles et les deux sens restent affichés, grisés avec leur raison, « Générer » est grisé et un clic dessus ne ferme rien ; par la vraie ligne du menu, aucun fichier n’est téléchargé',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withFreePage(400, 500, async () => {
          const page = PageLayout.getPageSizePt();
          if (SheetLayout.best(page) !== null) bad.push('la page de 40 x 50 cm trouve une feuille : ' + JSON.stringify(SheetLayout.best(page)));
          const promise = openDialog({ count: 6 });
          const s0 = state();
          const sentence = 'Une page 40 × 50 cm ne tient ni sur A4 ni sur A3 : l’assemblage n’est pas possible.';
          if (s0.summary !== sentence || s0.scaled !== '' || !s0.okDisabled || s0.svgSlots !== 0 || s0.svgMarks !== 0) bad.push('départ : ' + JSON.stringify(s0));
          const counts = [modal().querySelectorAll('input[name="pp-sheets-sheet"]').length, modal().querySelectorAll('input[name="pp-sheets-orientation"]').length, modal().querySelectorAll('input[name="pp-sheets-marks"]').length];
          if (counts.join() !== '2,2,2') bad.push('des choix ont disparu : ' + counts.join());
          ['A4', 'A3'].forEach(sheet => {
            const input = radioInput('pp-sheets-sheet', sheet);
            if (!input.disabled || radioLabel('pp-sheets-sheet', sheet).title !== 'Trop petite pour une page 40 × 50 cm.') bad.push(`feuille ${sheet} : ${input.disabled} / ${radioLabel('pp-sheets-sheet', sheet).title}`);
          });
          ['portrait', 'landscape'].forEach(orientation => {
            const input = radioInput('pp-sheets-orientation', orientation);
            if (!input.disabled || radioLabel('pp-sheets-orientation', orientation).title !== 'Une page 40 × 50 cm n’y tient pas.') bad.push(`sens ${orientation} : ${input.disabled} / ${radioLabel('pp-sheets-orientation', orientation).title}`);
          });
          pickRadio('pp-sheets-marks', 'on');
          const marked = state();
          if (marked.summary !== sentence || marked.scaled !== '' || marked.svgSlots !== 0 || marked.svgMarks !== 0 || !marked.okDisabled) bad.push('avec traits de coupe : ' + JSON.stringify(marked));
          okButton().click();
          await h.sleep(150);
          if (!isOpen()) bad.push('« Générer » grisé a fermé la fenêtre');
          cancelButton().click();
          const closed = await promise;
          if (closed !== null) bad.push('Annuler ne rend pas null : ' + JSON.stringify(closed));
          // En anglais.
          I18n.setLang('en');
          try {
            const english = openDialog({ count: 6 });
            if (state().summary !== 'A 40 × 50 cm page fits on neither A4 nor A3: assembly is not possible.') bad.push('anglais : ' + state().summary);
            cancelButton().click();
            await english;
          } finally { I18n.setLang('fr'); }
          // La vraie ligne du menu : la fenêtre s'ouvre, rien ne part, aucun message d'assemblage.
          forgetChoice();
          await seed(h, `<p>${badge('Nom')}</p>`);
          const res = await exportSheets(h, undefined, false);
          if (!res.opened) bad.push('la ligne du menu n’ouvre pas la fenêtre');
          if (res.downloads.length !== 0 || res.confirms.length !== 0 || res.statuses.includes(I18n.t('status.sheetsAssembling'))) bad.push('quelque chose est parti : ' + JSON.stringify({ downloads: res.downloads.length, confirms: res.confirms, statuses: res.statuses }));
        });
      } finally { I18n.setLang('fr'); closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 18) Le fichier : étiquettes de 7 x 3,7 cm et cartes de 10 x 15 cm -----------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_pdf_free_format_labels_and_cards_fill_the_sheet_in_reading_order',
    description: 'Six lignes en étiquettes de 7 x 3,7 cm : une seule feuille A4 portrait, chaque nom dans son emplacement (3 x 8, de gauche à droite puis de haut en bas), la marge de 3 mm de la saisie intacte dans chaque case, aucun texte hors des emplacements ; avec traits de coupe, 26 repères tracés et les pages à 93 % ; six lignes en cartes de 10 x 15 cm : trois feuilles de deux cartes côte à côte',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withFreePage(70, 37, async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          const res = await exportSheets(h);
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('étiquettes : opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          if (res.status !== '6 lignes placées sur 1 feuille — fichier téléchargé.') bad.push('étiquettes, message final : ' + res.status);
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 3, rows: 8, marks: false });
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 1) return bad.push('étiquettes : feuilles ' + sheets.length);
          const sheet = sheets[0];
          if (!near(sheet.width, 595.28) || !near(sheet.height, 841.89)) bad.push(`étiquettes : feuille ${sheet.width} x ${sheet.height}`);
          if (sheet.lines.length) bad.push(`étiquettes : ${sheet.lines.length} trait(s) sans traits de coupe demandés`);
          const placed = textBySlot(layout, sheet);
          if (placed.stray.length) bad.push('étiquettes : texte hors des emplacements : ' + placed.stray.join(' | '));
          placed.texts.forEach((text, k) => {
            const want = k < NAMES.length ? squash(NAMES[k]) : '';
            if (squash(text) !== want) bad.push(`étiquettes, emplacement ${k + 1} : « ${text} » au lieu de « ${want} »`);
            // La marge de 3 mm (8,5 pt) : la même dans chacune des six cases occupées.
            if (placed.first[k] && !near(placed.first[k].x - layout.slots[k].x, 8.5, 0.6)) bad.push(`étiquettes, emplacement ${k + 1} : marge ${(placed.first[k].x - layout.slots[k].x).toFixed(2)} pt au lieu de 8,5`);
          });
          // Indépendamment de SheetLayout : les trois premières étiquettes se suivent de gauche à droite, la quatrième repart à gauche sous la première.
          const at = [0, 1, 2, 3].map(k => sheet.items.find(it => nameIndex(it.str) === k));
          if (at.some(it => !it) || !(at[0].x < at[1].x && at[1].x < at[2].x) || Math.abs(at[1].y - at[0].y) > 1 || Math.abs(at[2].y - at[0].y) > 1 || !(at[3].y > at[0].y + 50) || Math.abs(at[3].x - at[0].x) > 1) bad.push('étiquettes : l’ordre de lecture n’est pas gauche-droite puis le dessous : ' + JSON.stringify(at.map(it => it && [Math.round(it.x), Math.round(it.y)])));
        });
        // Avec traits de coupe : 3 colonnes et 8 lignes, les pages à 93 %.
        await withFreePage(70, 37, async () => {
          forgetChoice();
          await seed(h, `<p>${badge('Nom')}</p>`);
          const res = await exportSheets(h, async () => { pickRadio('pp-sheets-marks', 'on'); okButton().click(); });
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('avec traits : opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 3, rows: 8, marks: true });
          if (Math.round(layout.scale * 100) !== 93) bad.push('échelle attendue : ' + layout.scale);
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 1) return bad.push('avec traits : feuilles ' + sheets.length);
          // (3 + 1) colonnes de coupe et (8 + 1) lignes, deux repères chacune.
          if (sheets[0].lines.length !== 26) bad.push('repères tracés : ' + sheets[0].lines.length + ' au lieu de 26');
          const placed = textBySlot(layout, sheets[0]);
          if (placed.stray.length) bad.push('avec traits : texte hors des emplacements : ' + placed.stray.join(' | '));
          placed.texts.forEach((text, k) => {
            const want = k < NAMES.length ? squash(NAMES[k]) : '';
            if (squash(text) !== want) bad.push(`avec traits, emplacement ${k + 1} : « ${text} » au lieu de « ${want} »`);
          });
        });
        // Des cartes de 10 x 15 cm : deux par feuille A4 portrait, trois feuilles pour six lignes.
        await withFreePage(100, 150, async () => {
          forgetChoice();
          await seed(h, `<p>${badge('Nom')}</p>`);
          const res = await exportSheets(h);
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('cartes : opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          if (res.status !== '6 lignes placées sur 3 feuilles — fichier téléchargé.') bad.push('cartes, message final : ' + res.status);
          const layout = SheetLayout.compute({ sheet: SheetLayout.sheetSize('A4', 'portrait'), page: PageLayout.getPageSizePt(), cols: 2, rows: 1, marks: false });
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 3) return bad.push('cartes : feuilles ' + sheets.length);
          sheets.forEach((sheet, s) => {
            if (!near(sheet.width, 595.28) || !near(sheet.height, 841.89)) bad.push(`cartes, feuille ${s + 1} : ${sheet.width} x ${sheet.height}`);
            const placed = textBySlot(layout, sheet);
            if (placed.stray.length) bad.push(`cartes, feuille ${s + 1} : texte hors des emplacements : ${placed.stray.join(' | ')}`);
            placed.texts.forEach((text, k) => {
              const want = squash(NAMES[s * 2 + k]);
              if (squash(text) !== want) bad.push(`cartes, feuille ${s + 1}, emplacement ${k + 1} : « ${text} » au lieu de « ${want} »`);
            });
          });
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 19) La marge autour de chaque page : la géométrie ------------------------------------------------------------------------------------------------------------------
  // Les nombres attendus sont écrits ICI à partir de la définition, pas relus de SheetLayout : la case d'une page est la page réduite plus la marge de chaque côté ; l'échelle est le plus petit
  // rapport entre la place de la feuille (moins les 7 mm des repères de chaque côté) et ce que les cases demandent ; la marge compte deux fois entre deux pages et une fois au bord de la grille.
  cases.push({
    id: 'sheetassembly_geometry_margin_surrounds_each_page_and_shrinks_pages_only_when_needed',
    description: 'SheetLayout.compute avec une marge : 4 A6 sur une A4 avec 5 mm donnent des pages à 90 % (la case - page et marge - remplit la largeur de la feuille), 2 x 5 mm entre deux pages et 5 mm au bord, chaque page au centre de sa case ; une A4 sur A3 garde sa taille ; avec traits de coupe (3 mm) les repères passent au bord des cases, au milieu de l’espace entre deux pages ; une marge absente, nulle, négative ou illisible donne exactement la planche d’avant ; une marge trop grande est ramenée à maxMargin (les pages ne descendent pas sous la moitié de leur taille, tout reste sur la feuille)',
    run: async () => {
      const bad = [];
      const sheet = SheetLayout.sheetSize('A4', 'portrait');
      const a6 = PageLayout.pageSizePtFor('portrait', 'A6');
      const a4 = PageLayout.pageSizePtFor('portrait', 'A4');
      const zone = 7 * MM;
      const M = 5 * MM;
      // L'échelle d'après la définition : cols x rows pages de `page`, une marge de chaque côté de chacune, 7 mm autour de la grille avec les repères.
      const scaleFor = (page, cols, rows, margin, marks, onto) => Math.min(1, (onto.width - 2 * (marks ? zone : 0) - 2 * cols * margin) / (cols * page.width), (onto.height - 2 * (marks ? zone : 0) - 2 * rows * margin) / (rows * page.height));
      const inside = (s, on) => s.x >= -1e-6 && s.y >= -1e-6 && s.x + s.width <= on.width + 1e-6 && s.y + s.height <= on.height + 1e-6;

      // 4 A6 sur une A4, 5 mm, sans traits : 90 %, la case remplit la largeur, 5 mm au bord, 10 mm entre deux pages.
      const plain = SheetLayout.compute({ sheet, page: a6, cols: 2, rows: 2, marks: false, margin: M });
      const k = scaleFor(a6, 2, 2, M, false, sheet);
      if (!near(plain.scale, k, 1e-9) || Math.round(plain.scale * 100) !== 90) bad.push(`échelle : ${plain.scale} au lieu de ${k}`);
      if (!near(plain.margin, M, 1e-9)) bad.push('marge rendue : ' + plain.margin);
      const cellW = a6.width * k + 2 * M;
      const cellH = a6.height * k + 2 * M;
      const x0 = (sheet.width - 2 * cellW) / 2;
      const y0 = (sheet.height - 2 * cellH) / 2;
      if (!near(plain.cellWidth, cellW, 1e-6) || !near(plain.cellHeight, cellH, 1e-6) || !near(plain.x0, x0, 1e-6) || !near(plain.y0, y0, 1e-6)) bad.push(`cases : ${plain.cellWidth} x ${plain.cellHeight} depuis ${plain.x0}, ${plain.y0} au lieu de ${cellW} x ${cellH} depuis ${x0}, ${y0}`);
      plain.slots.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        if (!near(s.x, x0 + col * cellW + M, 1e-6) || !near(s.y, y0 + row * cellH + M, 1e-6) || !near(s.width, a6.width * k, 1e-6) || !near(s.height, a6.height * k, 1e-6)) bad.push(`emplacement ${i} : ${JSON.stringify(s)}`);
        if (!inside(s, sheet)) bad.push(`emplacement ${i} hors de la feuille`);
      });
      const [s0, s1, s2, s3] = plain.slots;
      if (!near(s1.x - (s0.x + s0.width), 2 * M, 1e-6) || !near(s3.x - (s2.x + s2.width), 2 * M, 1e-6)) bad.push('l’espace entre deux colonnes n’est pas le double de la marge');
      if (!near(s2.y - (s0.y + s0.height), 2 * M, 1e-6) || !near(s3.y - (s1.y + s1.height), 2 * M, 1e-6)) bad.push('l’espace entre deux lignes n’est pas le double de la marge');
      if (!near(s0.x, M, 1e-6) || !near(sheet.width - (s1.x + s1.width), M, 1e-6)) bad.push(`marge au bord gauche et droit : ${s0.x}, ${sheet.width - (s1.x + s1.width)}`);
      if (!near(s0.y, sheet.height - (s3.y + s3.height), 1e-6) || s0.y < M - 1e-6) bad.push(`marge en haut et en bas : ${s0.y}, ${sheet.height - (s3.y + s3.height)}`);
      if (!near(s0.width / s0.height, a6.width / a6.height, 1e-9)) bad.push('la page n’a plus ses proportions');

      // La place est là (4 A6 sur une A3 portrait) : aucune réduction, la marge de chaque côté, la grille centrée.
      const a3 = SheetLayout.sheetSize('A3', 'portrait');
      const roomy = SheetLayout.compute({ sheet: a3, page: a6, cols: 2, rows: 2, marks: false, margin: M });
      if (roomy.scale !== 1 || !near(roomy.slots[0].width, a6.width, 1e-9) || !near(roomy.slots[1].x - (roomy.slots[0].x + a6.width), 2 * M, 1e-6)) bad.push('4 A6 sur A3 avec marge : ' + JSON.stringify({ scale: roomy.scale, s0: roomy.slots[0], s1: roomy.slots[1] }));
      if (!near(roomy.slots[0].x - 0, a3.width - (roomy.slots[1].x + a6.width), 1e-6)) bad.push('4 A6 sur A3 avec marge : grille non centrée');

      // Une seule page A4 sur une feuille A4 avec 5 mm (le cas de l'imprimante qui ne va pas jusqu'au bord) : réduite à 95 %, au moins 5 mm de chaque côté, exactement 5 mm là où la page remplit la feuille.
      const solo = SheetLayout.compute({ sheet, page: a4, cols: 1, rows: 1, marks: false, margin: M });
      const ks = scaleFor(a4, 1, 1, M, false, sheet);
      const o = solo.slots[0];
      if (!near(solo.scale, ks, 1e-9) || !near(o.x, M, 1e-6) || !near(sheet.width - (o.x + o.width), M, 1e-6) || o.y < M - 1e-6 || !near(o.y, sheet.height - (o.y + o.height), 1e-6)) bad.push('une A4 sur A4 avec 5 mm : ' + JSON.stringify({ scale: solo.scale, want: ks, slot: o }));

      // Avec traits de coupe et 3 mm : les repères passent au bord des cases - au milieu de l'espace entre deux pages -, chaque morceau découpé garde sa marge.
      const m3 = 3 * MM;
      const marked = SheetLayout.compute({ sheet, page: a6, cols: 2, rows: 2, marks: true, margin: m3 });
      const km = scaleFor(a6, 2, 2, m3, true, sheet);
      if (!near(marked.scale, km, 1e-9) || Math.round(marked.scale * 100) !== 88) bad.push(`échelle avec traits et marge : ${marked.scale} au lieu de ${km}`);
      const cw = a6.width * km + 2 * m3;
      const ch = a6.height * km + 2 * m3;
      const gx0 = (sheet.width - 2 * cw) / 2;
      const gy0 = (sheet.height - 2 * ch) / 2;
      const xs = [0, 1, 2].map(c => gx0 + c * cw);
      const ys = [0, 1, 2].map(r => gy0 + r * ch);
      let vertical = 0;
      let horizontal = 0;
      marked.cutMarks.forEach((m, i) => {
        if (![m.x1, m.x2].every(x => x >= -1e-6 && x <= sheet.width + 1e-6) || ![m.y1, m.y2].every(y => y >= -1e-6 && y <= sheet.height + 1e-6)) bad.push(`repère ${i} hors de la feuille : ${JSON.stringify(m)}`);
        if (m.x1 === m.x2) {
          vertical++;
          const c = xs.findIndex(x => near(x, m.x1, 1e-6));
          if (c < 0) return bad.push(`repère vertical ${i} hors des lignes de coupe : ${m.x1}`);
          // La distance de la ligne de coupe à la page voisine est la marge, des deux côtés quand il y en a deux.
          if (c > 0 && !near(m.x1 - (marked.slots[c - 1].x + marked.slots[c - 1].width), m3, 1e-6)) bad.push(`ligne de coupe ${c} : ${m.x1 - (marked.slots[c - 1].x + marked.slots[c - 1].width)} de la page de gauche`);
          if (c < 2 && !near(marked.slots[c].x - m.x1, m3, 1e-6)) bad.push(`ligne de coupe ${c} : ${marked.slots[c].x - m.x1} de la page de droite`);
        } else if (m.y1 === m.y2) {
          horizontal++;
          const r = ys.findIndex(y => near(y, m.y1, 1e-6));
          if (r < 0) return bad.push(`repère horizontal ${i} hors des lignes de coupe : ${m.y1}`);
          if (r > 0 && !near(m.y1 - (marked.slots[(r - 1) * 2].y + marked.slots[(r - 1) * 2].height), m3, 1e-6)) bad.push(`ligne de coupe horizontale ${r} : trop loin de la page du dessus`);
          if (r < 2 && !near(marked.slots[r * 2].y - m.y1, m3, 1e-6)) bad.push(`ligne de coupe horizontale ${r} : trop loin de la page du dessous`);
        } else bad.push(`repère ${i} en biais`);
      });
      if (marked.cutMarks.length !== 12 || vertical !== 6 || horizontal !== 6) bad.push(`repères : ${marked.cutMarks.length} (${vertical} verticaux, ${horizontal} horizontaux)`);
      marked.slots.forEach((s, i) => { if (!inside(s, sheet)) bad.push(`avec traits, emplacement ${i} hors de la feuille`); });

      // Une marge absente, nulle, négative ou illisible : exactement la planche d'avant (aucun cas déjà vert ne bouge).
      ['sans traits', 'avec traits'].forEach((name, i) => {
        const base = { sheet, page: a6, cols: 2, rows: 2, marks: i === 1 };
        const want = JSON.stringify(SheetLayout.compute(base));
        [0, undefined, NaN, -4, 'x', null].forEach(v => {
          const got = JSON.stringify(SheetLayout.compute(Object.assign({}, base, { margin: v })));
          if (got !== want) bad.push(`marge ${String(v)} (${name}) : la planche change`);
        });
        if (SheetLayout.compute(base).margin !== 0) bad.push('marge d’une planche sans marge : ' + SheetLayout.compute(base).margin);
      });

      // Le plafond : celui qui ramène les pages à la moitié de leur taille ; au-delà, compute s'arrête là et tout reste sur la feuille.
      if (SheetLayout.MIN_SCALE !== 0.5) bad.push('MIN_SCALE : ' + SheetLayout.MIN_SCALE);
      const maxPlain = (sheet.width - 0.5 * 2 * a6.width) / (2 * 2);
      const maxMarked = (sheet.width - 2 * zone - 0.5 * 2 * a6.width) / (2 * 2);
      const gotMax = SheetLayout.maxMargin({ sheet, page: a6, cols: 2, rows: 2, marks: false });
      const gotMaxMarked = SheetLayout.maxMargin({ sheet, page: a6, cols: 2, rows: 2, marks: true });
      if (!near(gotMax, maxPlain, 1e-6) || !near(gotMaxMarked, maxMarked, 1e-6)) bad.push(`plafond : ${gotMax} / ${gotMaxMarked} au lieu de ${maxPlain} / ${maxMarked}`);
      const huge = SheetLayout.compute({ sheet, page: a6, cols: 2, rows: 2, marks: false, margin: 1000 * MM });
      if (!near(huge.margin, maxPlain, 1e-6) || !near(huge.scale, 0.5, 1e-9) || !huge.slots.every(s => inside(s, sheet))) bad.push('marge démesurée : ' + JSON.stringify({ margin: huge.margin, scale: huge.scale }));
      // Des étiquettes de 7 x 3,7 cm (3 x 8 sur une A4) : la hauteur est ce qui limite, le plafond le suit.
      const label = { width: 70 * MM, height: 37 * MM };
      const maxLabel = Math.min((sheet.width - 0.5 * 3 * label.width) / (2 * 3), (sheet.height - 0.5 * 8 * label.height) / (2 * 8));
      const labels = SheetLayout.compute({ sheet, page: label, cols: 3, rows: 8, marks: false, margin: 1000 * MM });
      if (!near(SheetLayout.maxMargin({ sheet, page: label, cols: 3, rows: 8, marks: false }), maxLabel, 1e-6) || !near(labels.scale, 0.5, 1e-9) || labels.slots.length !== 24 || !labels.slots.every(s => inside(s, sheet))) bad.push('étiquettes avec une marge démesurée : ' + JSON.stringify({ margin: labels.margin, want: maxLabel, scale: labels.scale }));
      // Rien n'est écrit à la place du plafond quand la marge tient : la valeur choisie est rendue telle quelle.
      if (!near(SheetLayout.compute({ sheet, page: a6, cols: 2, rows: 2, marks: false, margin: 2 * MM }).margin, 2 * MM, 1e-9)) bad.push('une marge qui tient est modifiée');
      return result(bad);
    },
  });

  // --- 20) La marge autour de chaque page : le champ de la fenêtre -------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sheetassembly_dialog_margin_field_applies_the_margin_and_stays_within_what_fits',
    description: 'Le champ « Marge » (mm) de la fenêtre : 0 au départ, nommé « Marge mm autour de chaque page », plafonné à ce que la feuille accepte (26,2 mm pour 4 A6 sur une A4) ; saisir 5 réduit les pages à 90 % avec la note « … pour laisser la place à la marge. » (traits de coupe : « … aux traits de coupe et à la marge. »), l’aperçu pose les pages à 5 mm du bord ; une valeur trop grande est ramenée au plafond DANS le champ, un changement d’emplacements qui réduit le plafond ramène la marge au nouveau ; le texte en cours de saisie n’est pas réécrit avant la fin ; la marge est gardée avec « Générer » (jamais avec Annuler), rendue dans le réglage, et un stockage sans marge, illisible, négatif ou démesuré ne casse rien ; grisé quand aucune page ne tient ; Entrée valide ; anglais',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      const previous = I18n.getLang();
      const noteOf = () => document.getElementById('pp-sheets-scaled');
      const Mmm = mm => mm * MM;
      try {
        await withPage('A6', 'portrait', async () => {
          const sheet = SheetLayout.sheetSize('A4', 'portrait');
          const a6 = PageLayout.pageSizePtFor('portrait', 'A6');
          // L'échelle d'après la définition (2 x 2 pages A6, 7 mm de repères de chaque côté avec les traits de coupe), et son pourcentage tel que la fenêtre le dit.
          const kOf = (marks, mm) => Math.min(1, (sheet.width - 2 * (marks ? 7 * MM : 0) - 4 * Mmm(mm)) / (2 * a6.width), (sheet.height - 2 * (marks ? 7 * MM : 0) - 4 * Mmm(mm)) / (2 * a6.height));
          const percentOf = (marks, mm) => Math.round(100 * kOf(marks, mm));
          let promise = openDialog({ count: 6 });
          // Le départ : un champ nombre à 0, ses deux textes, son nom accessible, son plafond.
          const s0 = state();
          const field = marginInput();
          if (!field || field.type !== 'number' || field.min !== '0' || field.step !== '0.5' || s0.margin !== '0' || s0.marginMax !== '26.2' || s0.marginDisabled) bad.push('départ : ' + JSON.stringify({ type: field && field.type, min: field && field.min, step: field && field.step, margin: s0.margin, max: s0.marginMax, disabled: s0.marginDisabled }));
          if (document.getElementById('pp-sheets-margin-label').textContent !== 'Marge' || document.getElementById('pp-sheets-margin-text').textContent !== 'mm autour de chaque page') bad.push('textes : ' + document.getElementById('pp-sheets-margin-label').textContent + ' / ' + document.getElementById('pp-sheets-margin-text').textContent);
          if (field.getAttribute('aria-labelledby') !== 'pp-sheets-margin-label pp-sheets-margin-text' || field.getAttribute('aria-describedby') !== 'pp-sheets-scaled') bad.push('noms accessibles : ' + field.getAttribute('aria-labelledby') + ' / ' + field.getAttribute('aria-describedby'));
          if (s0.scaled !== '') bad.push('une note sans marge ni traits : ' + s0.scaled);
          // 5 mm : 90 %, la note de la marge, l'aperçu pose les pages à 5 mm du bord et à 10 mm l'une de l'autre.
          typeMargin(5);
          const s1 = state();
          const rects = previewSlots();
          if (s1.margin !== '5' || s1.scaled !== `Pages réduites à ${percentOf(false, 5)} % pour laisser la place à la marge.` || percentOf(false, 5) !== 90) bad.push('5 mm : ' + JSON.stringify([s1.margin, s1.scaled]));
          if (s1.svgSlots !== 4 || s1.svgMarks !== 0 || s1.summary !== '4 emplacements par feuille (2 × 2) : 6 lignes, au moins 2 feuilles A4.') bad.push('5 mm : aperçu ou résumé : ' + JSON.stringify([s1.svgSlots, s1.svgMarks, s1.summary]));
          if (rects.length !== 4 || !near(rects[0].x, Mmm(5), 0.01) || !near(rects[1].x - (rects[0].x + rects[0].width), 2 * Mmm(5), 0.01) || !near(rects[0].width, a6.width * kOf(false, 5), 0.01)) bad.push('aperçu à 5 mm : ' + JSON.stringify(rects));
          // Avec les traits de coupe : la note des deux ; sans marge, celle des traits seuls ; sans rien, aucune.
          pickRadio('pp-sheets-marks', 'on');
          const both = state();
          if (both.scaled !== `Pages réduites à ${percentOf(true, 5)} % pour laisser la place aux traits de coupe et à la marge.` || both.svgMarks !== 12) bad.push('traits et marge : ' + JSON.stringify([both.scaled, both.svgMarks]));
          typeMargin(0);
          const marksOnly = state();
          if (marksOnly.margin !== '0' || marksOnly.scaled !== 'Pages réduites à 93 % pour laisser la place aux traits de coupe.') bad.push('traits seuls : ' + JSON.stringify([marksOnly.margin, marksOnly.scaled]));
          if (marksOnly.marginMax !== '22.7') bad.push('plafond avec traits : ' + marksOnly.marginMax);
          pickRadio('pp-sheets-marks', 'off');
          if (state().scaled !== '' || noteOf().hidden !== true) bad.push('une note sans marge ni traits');
          // Une saisie illisible ou négative : marge 0, le champ le dit (programmatique : il n'a pas le focus).
          typeMargin('-3');
          if (state().margin !== '0' || state().scaled !== '') bad.push('marge négative : ' + state().margin);
          typeMargin('abc');
          if (state().margin !== '0') bad.push('texte : ' + state().margin);
          // Trop grande : ramenée au plafond DANS le champ (26,2 mm, la valeur appliquée), pages à 50 %.
          typeMargin(99);
          const capped = state();
          if (capped.margin !== '26.2' || capped.scaled !== 'Pages réduites à 50 % pour laisser la place à la marge.') bad.push('99 mm : ' + JSON.stringify([capped.margin, capped.scaled]));
          // Le plafond suit les emplacements : 1 x 1 l'élargit (78,7 mm), 2 x 1 le ramène à 26,2 et la marge de 50 mm choisie entre-temps avec lui.
          pickSelect('pp-sheets-cols', 1);
          pickSelect('pp-sheets-rows', 1);
          const single = state();
          if (single.marginMax !== '78.7' || single.margin !== '26.2') bad.push('1 x 1 : ' + JSON.stringify([single.marginMax, single.margin]));
          typeMargin(50);
          if (state().margin !== '50') bad.push('50 mm sur 1 x 1 : ' + state().margin);
          pickSelect('pp-sheets-cols', 2);
          const narrowed = state();
          if (narrowed.marginMax !== '26.2' || narrowed.margin !== '26.2' || marginInput().value !== '26.2') bad.push('2 x 1 : ' + JSON.stringify([narrowed.marginMax, narrowed.margin, marginInput().value]));
          // Changer de feuille : l'A3 (paysage, 4 x 2) repart de tous ses emplacements, le plafond suit et une marge qui tient encore n'est pas touchée.
          typeMargin(10);
          pickRadio('pp-sheets-sheet', 'A3');
          const onA3 = state();
          if (onA3.margin !== '10' || onA3.marginMax !== '26.2' || onA3.cols !== 4 || onA3.rows !== 2) bad.push('A3 : ' + JSON.stringify([onA3.margin, onA3.marginMax, onA3.cols, onA3.rows]));
          pickRadio('pp-sheets-sheet', 'A4');
          // Le texte en cours de saisie n'est pas réécrit : « 3.25 » reste tel quel tant que le champ a le focus, la marge appliquée est 3,3 ; la fin de la saisie le dit.
          field.focus();
          typeMargin('3.25');
          const typingNote = state().scaled;
          if (field.value !== '3.25' || document.activeElement !== field) bad.push('le texte saisi a été réécrit : ' + field.value);
          commitMargin();
          if (field.value !== '3.3') bad.push('fin de saisie : ' + field.value);
          field.blur();
          if (typingNote !== `Pages réduites à ${Math.round(kOf(false, 3.3) * 100)} % pour laisser la place à la marge.`) bad.push('3,3 mm, note d’échelle : ' + typingNote);
          cancelButton().click();
          await promise;
          if (localStorage.getItem(SheetAssemblyDialog.STORAGE) !== null) bad.push('« Annuler » a gardé une marge');

          // « Générer » garde la marge et la rend dans le réglage, avec la planche calculée ; la fenêtre rouverte la reprend.
          promise = openDialog({ count: 6 });
          typeMargin(4.5);
          okButton().click();
          const got = await promise;
          const stored = JSON.parse(localStorage.getItem(SheetAssemblyDialog.STORAGE) || 'null');
          if (!stored || stored.margin !== 4.5) bad.push('marge gardée : ' + JSON.stringify(stored));
          if (!got || got.margin !== 4.5 || !got.layout || !near(got.layout.margin, Mmm(4.5), 1e-9) || !near(got.layout.slots[0].x, Mmm(4.5), 0.01)) bad.push('réglage rendu : ' + JSON.stringify(got && { margin: got.margin, layout: got.layout && got.layout.margin }));
          promise = openDialog({ count: 6 });
          if (state().margin !== '4.5') bad.push('rouverte : ' + state().margin);
          cancelButton().click();
          await promise;
          // Un stockage d'avant la marge (sans la clé), négatif, illisible, nul ou démesuré : 0, 0, 0, 0 et le plafond.
          for (const [margin, want] of [[undefined, '0'], [-3, '0'], ['x', '0'], [null, '0'], [0, '0'], [1e9, '26.2'], [7.25, '7.3']]) {
            localStorage.setItem(SheetAssemblyDialog.STORAGE, JSON.stringify(margin === undefined ? { sheet: 'A4', orientation: 'portrait', marks: false } : { sheet: 'A4', orientation: 'portrait', marks: false, margin }));
            promise = openDialog({ count: 6 });
            const s = state();
            if (s.margin !== want) bad.push(`stockage avec la marge ${margin === undefined ? '(absente)' : JSON.stringify(margin)} : ${s.margin} au lieu de ${want}`);
            cancelButton().click();
            await promise;
          }
          forgetChoice();
          // Entrée dans le champ valide la fenêtre, avec la marge saisie.
          promise = openDialog({ count: 6 });
          typeMargin(2);
          marginInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          const entered = await promise;
          if (!entered || entered.margin !== 2 || isOpen()) bad.push('Entrée : ' + JSON.stringify(entered && entered.margin) + ' / fenêtre ouverte ' + isOpen());
          forgetChoice();
          // L'anglais : le libellé, la phrase et les deux notes.
          I18n.setLang('en');
          promise = openDialog({ count: 6 });
          typeMargin(5);
          const en1 = state();
          pickRadio('pp-sheets-marks', 'on');
          const en2 = state();
          if (document.getElementById('pp-sheets-margin-label').textContent !== 'Margin' || document.getElementById('pp-sheets-margin-text').textContent !== 'mm around each page') bad.push('anglais, textes : ' + document.getElementById('pp-sheets-margin-label').textContent + ' / ' + document.getElementById('pp-sheets-margin-text').textContent);
          if (en1.scaled !== 'Pages reduced to 90% to leave room for the margin.' || en2.scaled !== `Pages reduced to ${percentOf(true, 5)}% to leave room for the crop marks and the margin.`) bad.push('anglais, notes : ' + JSON.stringify([en1.scaled, en2.scaled]));
          cancelButton().click();
          await promise;
          I18n.setLang('fr');
        });
        // Aucune page ne tient (un format libre de 40 x 50 cm) : le champ reste affiché, grisé, à 0 ; « Générer » aussi.
        await withFreePage(400, 500, async () => {
          const promise = openDialog({ count: 6 });
          const s = state();
          if (!s.marginDisabled || s.margin !== '0' || !s.okDisabled) bad.push('aucune page ne tient : ' + JSON.stringify({ disabled: s.marginDisabled, margin: s.margin, ok: s.okDisabled }));
          cancelButton().click();
          await promise;
        });
      } finally { I18n.setLang(previous); closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // --- 21) La marge autour de chaque page : le fichier ----------------------------------------------------------------------------------------------------------------------
  // Le fichier est lu par pdf.js. Une sortie sans marge sert de référence : la position d'un texte dans sa page (à la taille d'origine). Avec une marge, ce même texte doit tomber à la case + marge + (position de
  // référence x échelle) - les formules sont écrites ICI, pas relues de SheetLayout.
  cases.push({
    id: 'sheetassembly_pdf_margin_leaves_the_space_around_every_page_and_cuts_through_the_middle',
    description: 'A6 sur A4, six lignes, 5 mm : chaque nom tombe dans son quart de feuille, à la position de la page réduite (case + marge + position d’origine x échelle) - 10 mm entre deux pages, 5 mm au bord -, la marge de 28 pt devient 25 pt, aucun trait ; avec traits de coupe et 3 mm : les 12 repères de chaque feuille passent au bord des cases (aux positions de l’aperçu), le texte à l’échelle de la planche ; le message final et le nom du fichier sont ceux de toujours',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          const sheet = SheetLayout.sheetSize('A4', 'portrait');
          const a6 = PageLayout.pageSizePtFor('portrait', 'A6');
          // La référence : sans marge, quatre A6 à leur taille. La position du premier texte (« Alpha ») dans sa page.
          const ref = await exportSheets(h);
          if (!ref.opened || ref.downloads.length !== 1) return bad.push('référence : opened=' + ref.opened + ' téléchargements=' + ref.downloads.length);
          const refSheets = await readSheets(h, ref.downloads[0].blob);
          const refTop = (sheet.height - 2 * a6.height) / 2;
          const quadrant = (item, on) => (item.x < on.width / 2 ? 0 : 1) + (item.y < on.height / 2 ? 0 : 2);
          const firstOf = (page, q) => page.items.filter(it => nameIndex(it.str) >= 0 && quadrant(it, page) === q).sort((a, b) => a.y - b.y || a.x - b.x)[0] || null;
          const inPage = [];
          for (let q = 0; q < 4; q++) {
            const it = firstOf(refSheets[0], q);
            if (!it) return bad.push('référence : aucun texte dans le quart ' + (q + 1));
            inPage.push({ x: it.x - (q % 2) * a6.width, y: it.y - (refTop + Math.floor(q / 2) * a6.height) });
          }
          if (inPage.some(p => !near(p.x, inPage[0].x, 0.3) || !near(p.y, inPage[0].y, 0.3))) bad.push('référence : le texte n’est pas au même endroit dans les quatre pages : ' + JSON.stringify(inPage));
          const T = inPage[0];

          // 5 mm, sans traits de coupe.
          const M = 5 * MM;
          const k = Math.min(1, (sheet.width - 4 * M) / (2 * a6.width), (sheet.height - 4 * M) / (2 * a6.height));
          const cellW = a6.width * k + 2 * M;
          const cellH = a6.height * k + 2 * M;
          const gx = (sheet.width - 2 * cellW) / 2;
          const gy = (sheet.height - 2 * cellH) / 2;
          const res = await exportSheets(h, async () => { typeMargin(5); okButton().click(); });
          const dl = res.downloads[0];
          if (!res.opened || res.downloads.length !== 1 || !dl || !dl.blob) return bad.push('5 mm : opened=' + res.opened + ' téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses));
          if (dl.name !== TABLE + '-assemblage.pdf' || res.status !== '6 lignes placées sur 2 feuilles — fichier téléchargé.') bad.push('5 mm : ' + dl.name + ' / ' + res.status);
          const sheets = await readSheets(h, dl.blob);
          if (sheets.length !== 2) return bad.push('5 mm : feuilles ' + sheets.length);
          const offsets = [];
          sheets.forEach((page, s) => {
            if (!near(page.width, sheet.width) || !near(page.height, sheet.height)) bad.push(`5 mm, feuille ${s + 1} : ${page.width} x ${page.height}`);
            if (page.lines.length) bad.push(`5 mm, feuille ${s + 1} : ${page.lines.length} trait(s) sans traits de coupe demandés`);
            for (let q = 0; q < 4; q++) {
              const index = s * 4 + q;
              const it = firstOf(page, q);
              if (index >= NAMES.length) { if (it) bad.push(`5 mm, feuille ${s + 1} : un texte dans le quart ${q + 1} qui devrait rester vide`); continue; }
              if (!it) { bad.push(`5 mm, feuille ${s + 1} : rien dans le quart ${q + 1}`); continue; }
              if (nameIndex(it.str) !== index) bad.push(`5 mm, feuille ${s + 1}, quart ${q + 1} : « ${it.str} » au lieu de ${NAMES[index]}`);
              const wantX = gx + (q % 2) * cellW + M + k * T.x;
              const wantY = gy + Math.floor(q / 2) * cellH + M + k * T.y;
              if (!near(it.x, wantX, 0.7) || !near(it.y, wantY, 0.7)) bad.push(`5 mm, feuille ${s + 1}, quart ${q + 1} : texte en (${Math.round(it.x * 100) / 100}, ${Math.round(it.y * 100) / 100}) au lieu de (${Math.round(wantX * 100) / 100}, ${Math.round(wantY * 100) / 100})`);
              offsets.push(it.x - (gx + (q % 2) * cellW + M));
            }
          });
          quarterProblems(sheets, nameIndex, NAMES.length).forEach(p => bad.push(p));
          // La marge de 28 pt de la page est réduite comme elle : 90 % -> 25 pt (la page est réduite, pas rognée).
          if (offsets.length !== 6 || offsets.some(o => !near(o, 28 * k, 0.5))) bad.push(`marge de la page réduite : ${offsets.map(o => Math.round(o * 100) / 100).join()} au lieu de ${Math.round(28 * k * 100) / 100}`);

          // 3 mm avec traits de coupe : les 12 repères au bord des cases, le texte à l'échelle de la planche.
          const m3 = 3 * MM;
          const zone = 7 * MM;
          const k3 = Math.min(1, (sheet.width - 2 * zone - 4 * m3) / (2 * a6.width), (sheet.height - 2 * zone - 4 * m3) / (2 * a6.height));
          const cw = a6.width * k3 + 2 * m3;
          const ch = a6.height * k3 + 2 * m3;
          const hx = (sheet.width - 2 * cw) / 2;
          const hy = (sheet.height - 2 * ch) / 2;
          const layout = SheetLayout.compute({ sheet, page: a6, cols: 2, rows: 2, marks: true, margin: m3 });
          let preview = null;
          const resMarked = await exportSheets(h, async () => { pickRadio('pp-sheets-marks', 'on'); typeMargin(3); preview = state(); okButton().click(); });
          const dlMarked = resMarked.downloads[0];
          if (!resMarked.opened || resMarked.downloads.length !== 1 || !dlMarked || !dlMarked.blob) return bad.push('3 mm avec traits : opened=' + resMarked.opened + ' téléchargements=' + resMarked.downloads.length);
          const markedSheets = await readSheets(h, dlMarked.blob);
          if (markedSheets.length !== 2) return bad.push('3 mm avec traits : feuilles ' + markedSheets.length);
          if (!preview || preview.svgMarks !== 12 || preview.svgSlots !== 4 || preview.scaled !== `Pages réduites à ${Math.round(k3 * 100)} % pour laisser la place aux traits de coupe et à la marge.`) bad.push('3 mm avec traits, aperçu : ' + JSON.stringify(preview && [preview.svgMarks, preview.svgSlots, preview.scaled]));
          const xsCut = [0, 1, 2].map(c => hx + c * cw);
          markedSheets.forEach((page, s) => {
            const used = new Set();
            let missing = 0;
            layout.cutMarks.forEach(m => {
              const at = page.lines.findIndex((l, i) => !used.has(i) && near(l.x1, m.x1, 0.02) && near(l.y1, m.y1, 0.02) && near(l.x2, m.x2, 0.02) && near(l.y2, m.y2, 0.02));
              if (at < 0) missing++; else used.add(at);
            });
            if (page.lines.length !== 12 || missing) bad.push(`3 mm avec traits, feuille ${s + 1} : ${page.lines.length} traits tracés, ${missing} repère(s) absents sur 12`);
            // Chaque trait vertical est sur une ligne de coupe d'après la définition (bord de case), jamais au bord d'une page.
            const vertical = page.lines.filter(l => near(l.x1, l.x2, 0.001));
            if (vertical.length !== 6 || vertical.some(l => !xsCut.some(x => near(x, l.x1, 0.05)))) bad.push(`3 mm avec traits, feuille ${s + 1} : repères verticaux hors des lignes de coupe : ${vertical.map(l => Math.round(l.x1 * 100) / 100).join()} (lignes : ${xsCut.map(x => Math.round(x * 100) / 100).join()})`);
            for (let q = 0; q < 4; q++) {
              const index = s * 4 + q;
              const it = firstOf(page, q);
              if (index >= NAMES.length) continue;
              if (!it) { bad.push(`3 mm avec traits, feuille ${s + 1} : rien dans le quart ${q + 1}`); continue; }
              const wantX = hx + (q % 2) * cw + m3 + k3 * T.x;
              const wantY = hy + Math.floor(q / 2) * ch + m3 + k3 * T.y;
              if (!near(it.x, wantX, 0.7) || !near(it.y, wantY, 0.7)) bad.push(`3 mm avec traits, feuille ${s + 1}, quart ${q + 1} : texte en (${Math.round(it.x * 100) / 100}, ${Math.round(it.y * 100) / 100}) au lieu de (${Math.round(wantX * 100) / 100}, ${Math.round(wantY * 100) / 100})`);
            }
          });
          quarterProblems(markedSheets, nameIndex, NAMES.length).forEach(p => bad.push(p));
        });
      } finally { closeIfOpen(); forgetChoice(); }
      return result(bad);
    },
  });

  // La date du dernier export PDF (js/export-date.js, Réglages > Vue) : la planche est un export PDF comme les autres, chaque ligne posée sur une feuille est datée. Le réglage lui-même et
  // les refus de Grist sont dans la suite exportDate, les autres exports PDF dans pdfBatch.
  cases.push({
    id: 'sheetassembly_dates_every_placed_row_in_the_export_date_column',
    description: '« Assemblage avant impression… » : une fois la planche téléchargée, la colonne choisie pour la date du dernier export PDF reçoit l’instant de l’export pour chaque ligne posée sur une feuille, en une seule écriture ; l’état de fin ne change pas',
    run: async (h) => {
      const bad = [];
      forgetChoice();
      const stub = window.__gristStub;
      try {
        await withPage('A6', 'portrait', async () => {
          await seed(h, `<p>${badge('Nom')}</p>`);
          stub.setVariables(TABLE, { Nom: 'Text', Dernier: 'DateTime:Europe/Paris' });
          stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
          await GristAPI.refreshSchema();
          stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
          stub.setWidgetOptions({ dateDernierExport: 'Dernier' });
          await h.sleep(120);
          stub.clearActionLog();
          const from = Math.floor(Date.now() / 1000);
          const res = await exportSheets(h);
          const values = NAMES.map((_, i) => stub.getRow(TABLE, i + 1).Dernier);
          const writes = stub.getActionLog().filter(a => a[0] === 'BulkUpdateRecord' && a[1] === TABLE).map(a => a[2]);
          if (!res.opened || res.downloads.length !== 1) return bad.push('opened=' + res.opened + ' téléchargements=' + res.downloads.length);
          if (res.status !== I18n.t('status.sheetsExportDone', { ok: NAMES.length, sheets: 2 })) bad.push('message final : ' + res.status);
          if (!values.every(v => typeof v === 'number' && v >= from && v <= Math.floor(Date.now() / 1000)) || new Set(values).size !== 1) bad.push('valeurs : ' + JSON.stringify(values));
          if (JSON.stringify(writes) !== JSON.stringify([NAMES.map((_, i) => i + 1)])) bad.push('écritures : ' + JSON.stringify(writes));
        });
      } finally { closeIfOpen(); forgetChoice(); stub.setWidgetOptions(null); await h.sleep(60); }
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.sheetAssembly = cases;
})();
