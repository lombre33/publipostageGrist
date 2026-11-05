// Suite "pdfFontStyles" - le maigre, le gras, l'italique et le gras italique d'une police du PDF sont QUATRE polices dans le fichier (retour d'Antoine du 05/11 : sur une carte, le poste, qui n'est pas en
// gras dans le modèle, sortait en gras dans le PDF et l'assemblage avant impression ; la Lecture, elle, le montrait maigre). Cause : Arimo-Bold, Arimo-BoldItalic, Gelasio-Bold et Gelasio-BoldItalic
// (js/pdf-fonts-extra.js), instanciées en statique avec fonttools, portaient le nom PostScript de leur maigre (« Arimo-Regular », « Arimo-Italic », « Gelasio-Regular », « Gelasio-Italic ») ; pdfkit ne
// charge qu'une police par nom PostScript dans un document, la première lue servait donc pour les deux : un texte en Arial dont la première ligne est en gras sortait TOUT en gras, un texte dont la première
// ligne est maigre perdait tous ses gras. Les essais d'avant ne lisaient que les objets pdfmake (`bold: true` était bien posé), jamais les polices du fichier : ceux-ci lisent les octets du PDF
// (les noms de polices écrits, et la police que pdf.js voit derrière chaque mot). Le script dev-tests/fix-pdf-font-names.py rend leur nom aux polices (`--check` : rien ne change, sort en 1 si un nom est faux).
(function () {
  const cases = [];
  const FAMILIES = ['Arimo', 'Tinos', 'Cousine', 'Gelasio', 'Carlito'];
  const STYLES = { Regular: {}, Bold: { bold: true }, Italic: { italics: true }, BoldItalic: { bold: true, italics: true } };
  const NOHF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  // Les noms de police écrits dans les octets d'un PDF (le marqueur « ABCDEF+ » de sous-ensemble retiré), sans doublon, triés.
  const baseFontsOf = base64 => Array.from(new Set((atob(base64).match(/\/BaseFont\s*\/[A-Za-z0-9+\-_]+/g) || []).map(s => s.replace(/^\/BaseFont\s*\//, '').replace(/^[A-Z]{6}\+/, '')))).sort();

  async function pdfBase64(content) {
    await PdfExport.ensurePdfLibsLoaded();
    return new Promise(resolve => window.pdfMake.createPdf({ content }).getBase64(resolve));
  }

  // Pour chaque mot peint, la police que le fichier lui donne : { text, font (l'identifiant de pdf.js), size }, dans l'ordre de peinture.
  async function paintedRuns(h, base64) {
    await h.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    const list = await page.getOperatorList();
    const OPS = window.pdfjsLib.OPS;
    const runs = [];
    let font = null;
    for (let i = 0; i < list.fnArray.length; i++) {
      if (list.fnArray[i] === OPS.setFont) font = list.argsArray[i][0];
      else if (list.fnArray[i] === OPS.showText) {
        const text = list.argsArray[i][0].map(glyph => glyph.unicode || '').join('');
        if (text.trim()) runs.push({ text: text.trim(), font });
      }
    }
    return runs;
  }

  // Les trois tables de la carte d'Antoine (Badge -> Annuaire_simplifie -> Structure) et le lien qui relie l'annuaire à la page.
  async function withBadgeCard(h, body) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('Structure', { Nom: 'Text' });
    stub.setVariables('Annuaire_simplifie', { NomPrenom: 'Text', poste: 'Text', Structure: 'Ref:Structure', gristHelper_Display: 'Any' }, null, { Structure: 'gristHelper_Display' });
    stub.setVariables('Badge', { prenom_nom: 'Ref:Annuaire_simplifie', gristHelper_Display: 'Any' }, null, { prenom_nom: 'gristHelper_Display' });
    stub.setRows('Structure', [{ id: 3, Nom: 'Pole numerique (PN)' }]);
    stub.setRows('Annuaire_simplifie', [{ id: 7, NomPrenom: 'Jean MICHEL', poste: 'Direction', Structure: 3, gristHelper_Display: 'Pole numerique (PN)' }]);
    stub.setRows('Badge', [{ id: 1, prenom_nom: 7, gristHelper_Display: 'Jean MICHEL' }]);
    await GristAPI.refreshSchema();
    await GristAPI.saveLinkRule('Annuaire_simplifie', { mode: 'match', colonneCible: 'id', colonneSource: 'prenom_nom' });
    await GristAPI.refreshSchema();
    try { return await body(); } finally { await GristAPI.deleteLinkRule('Annuaire_simplifie'); }
  }
  const BADGE = (table, column) => `<span class="var-badge" contenteditable="false" data-table="${table}" data-column="${column}" data-key="${table}.${column}">#${table}.${column}</span>`;
  const LINE = (size, color, inner, bold) => `<p><span style="font-family: Arial; font-size: ${size}pt; color: ${color};">${bold ? '<strong>' + inner + '</strong>' : inner}</span></p>`;

  FAMILIES.forEach(family => {
    ['bold first', 'regular first'].forEach(order => {
      cases.push({
        id: 'pdffontstyles_' + family.toLowerCase() + '_has_four_distinct_fonts_' + order.replace(' ', '_'),
        description: family + ' : le maigre, le gras, l\'italique et le gras italique donnent quatre polices dans le PDF, que le premier texte du document soit en gras ou maigre (avant, le gras d\'Arimo et de Gelasio avait le nom du maigre : une seule des deux entrait dans le fichier)',
        run: async () => {
          const names = Object.keys(STYLES);
          const sequence = order === 'bold first' ? names.slice().reverse() : names;
          const base64 = await pdfBase64(sequence.map(style => Object.assign({ text: style + ' ', font: family }, STYLES[style])));
          const found = baseFontsOf(base64).filter(name => name.indexOf(family + '-') === 0);
          const want = names.map(style => family + '-' + style).sort();
          return { pass: JSON.stringify(found) === JSON.stringify(want), notes: JSON.stringify({ found, want }) };
        },
      });
    });
  });

  cases.push({
    id: 'pdffontstyles_a_name_in_bold_first_does_not_turn_the_job_title_bold',
    description: 'La carte d\'Antoine : le nom (Arial gras 16 pt) est la première ligne, le poste (Arial maigre 11 pt) la deuxième, la structure (gras 11 pt) la troisième, chacun dans une variable résolue par la vraie chaîne Badge -> Annuaire -> Structure ; dans le PDF, le poste est peint avec la police MAIGRE, le nom et la structure avec le gras (avant : une seule police pour les trois, le gras, et le poste sortait en gras)',
    run: (h) => withBadgeCard(h, async () => {
      const html = LINE(16, 'rgb(0, 176, 240)', BADGE('Badge', 'prenom_nom'), true) + LINE(11, 'rgb(75, 85, 99)', BADGE('Annuaire_simplifie', 'poste')) + LINE(11, 'rgb(75, 85, 99)', BADGE('Annuaire_simplifie', 'Structure'), true);
      const rows = await GristAPI.fetchTableRows('Badge');
      const pdf = await h.exportPdfContent(html, NOHF, undefined, { tableId: 'Badge', record: rows[0] });
      const runs = await paintedRuns(h, pdf.base64);
      const fontOf = text => (runs.find(run => run.text.indexOf(text) !== -1) || {}).font;
      const name = fontOf('MICHEL'), job = fontOf('Direction'), unit = fontOf('numerique');
      const names = baseFontsOf(pdf.base64).filter(n => n.indexOf('Arimo-') === 0);
      const pass = !!name && !!job && !!unit && name !== job && name === unit && names.join() === 'Arimo-Bold,Arimo-Regular';
      return { pass, notes: JSON.stringify({ name, job, unit, names, runs }) };
    }),
  });

  cases.push({
    id: 'pdffontstyles_a_regular_line_first_keeps_the_bold_lines_bold',
    description: 'Le même document commencé par une ligne maigre : les lignes en gras restent en gras dans le PDF (avant : la première police lue, ici le maigre, servait aussi pour le gras, et le PDF n\'avait plus un seul gras)',
    run: (h) => withBadgeCard(h, async () => {
      const html = LINE(11, 'rgb(75, 85, 99)', BADGE('Annuaire_simplifie', 'poste')) + LINE(16, 'rgb(0, 176, 240)', BADGE('Badge', 'prenom_nom'), true) + LINE(11, 'rgb(75, 85, 99)', BADGE('Annuaire_simplifie', 'Structure'), true);
      const rows = await GristAPI.fetchTableRows('Badge');
      const pdf = await h.exportPdfContent(html, NOHF, undefined, { tableId: 'Badge', record: rows[0] });
      const runs = await paintedRuns(h, pdf.base64);
      const fontOf = text => (runs.find(run => run.text.indexOf(text) !== -1) || {}).font;
      const job = fontOf('Direction'), name = fontOf('MICHEL'), unit = fontOf('numerique');
      const pass = !!name && !!job && !!unit && job !== name && name === unit;
      return { pass, notes: JSON.stringify({ job, name, unit, runs }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfFontStyles = cases;
})();
