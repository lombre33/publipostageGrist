// L'import d'un fichier dans le widget : Excel, Markdown, PowerPoint et Word, par le menu « + » (le sélecteur de fichier s'ouvre dans le clic) et par le « Nouveau > Importer » de GFS
// (js/gfs-open.js, consigne GFS 035 : GFS ouvre le sélecteur lui-même et donne le fichier). Sorti de js/main.js (refactorisation du 09/11, découpe 5) : rien de modifiable n'est partagé avec
// lui, ce qu'il en tire (la question « Enregistrer / Abandonner / Annuler », le coin d'état, le chargement d'un modèle dans l'éditeur...) lui est donné par `api`. Les corps sont ceux de main.js.
const MainImport = (function () {
  function create(api) {
    const { askBeforeLeaving, hasEditsToConfirmBeforeLeaving, isReadOnly, loadTemplateIntoEditor, markAutosaveDirty, onSave, refocusEditorIfLost, setStatus, templateNameInput, templateSelect, updateSaveStatus } = api;

    // « Nouveau > Importer » demandé par GFS (js/gfs-open.js, consigne GFS 035) : GFS a ouvert le sélecteur de fichier lui-même (le cadre isolé de l'app n'a pas le geste de la personne) et donne le fichier choisi, que
    // `valeur` nomme : `excel` (une grille), `markdown` (un document), `powerpoint` (une présentation, l'extension « diapositives » étant active), `word` (un document). Il est lu par le chemin de la ligne du même nom du menu « + » - mêmes
    // lectures, mêmes refus et mêmes phrases du coin d'état, même question d'enregistrement après une lecture réussie, même résultat : un modèle sans nom et pas encore enregistré, rien d'écrit avant son premier
    // « Enregistrer » - sans le sélecteur. true : le modèle importé est à l'écran ; false : le document est en lecture seule, la valeur est inconnue, le fichier est refusé, ou la personne a annulé.
    // `word` (choix du porteur du 07/11) n'est proposé par GFS qu'une fois qu'il le déclare dans `actions.importer` de son manifeste : tant qu'il ne le fait pas, aucune valeur `word` n'arrive, et rien ne change.
    async function importFileFromGfs(kind, file) {
      if (isReadOnly()) return false;
      switch (kind) {
        case 'excel': return importXlsxFile(file);
        case 'markdown': return importMdFile(file);
        case 'powerpoint': return importPptxFile(file);
        case 'word': return importDocxFile(file);
        default: return false;
      }
    }

    // Import d'un classeur Excel (js/grid-xlsx-import.js). Le sélecteur de fichier doit s'ouvrir dans le clic ; le classeur est lu ensuite et, s'il a
    // plusieurs feuilles visibles, une liste avec recherche demande laquelle devient la grille. On ne demande de quitter le modèle courant (s'il a des
    // modifications non enregistrées) qu'après ce choix : « Annuler » dans le sélecteur, une liste fermée, un fichier illisible ou une feuille vide ne
    // coûtent rien. Le résultat est une nouvelle grille, sans nom et pas encore enregistrée, comme « Nouvelle grille ».
    const XLSX_IMPORT_ERRORS = { oldFormat: 'status.xlsxImportOldFormat', unreadable: 'status.xlsxImportUnreadable', empty: 'status.xlsxImportEmpty', tooBig: 'status.xlsxImportTooBig', fileTooBig: 'status.xlsxImportFileTooBig' };
    const importMegabytes = bytes => (Math.ceil(bytes / 104857.6) / 10).toLocaleString(I18n.getLang()); // vers le haut : « 100,1 Mo (au plus 100 Mo) », jamais « 100 Mo (au plus 100 Mo) »
    function onImportXlsx() {
      if (isReadOnly()) return;
      GridXlsxImport.chooseFile(importXlsxFile);
    }

    // Le classeur choisi, par le sélecteur du menu « + » ou donné par GFS (importFileFromGfs). true : la grille importée est à l'écran (et le compte rendu de ce qui n'a pas été repris, s'il y en a un, a été lu) ; false : le classeur est refusé (l'erreur est dite dans le coin d'état), la liste
    // des feuilles a été fermée ou la personne a répondu « Annuler » à la question d'enregistrement : rien n'a changé.
    async function importXlsxFile(file) {
      setStatus(I18n.t('status.xlsxImporting'));
      const imported = await readXlsxForImport(file);
      if (!imported) return false;
      if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) { updateSaveStatus(); return false; }
      openImportedGrid(imported);
      await tellXlsxImportReport(imported.report);
      return true;
    }

    // Ce que l'import n'a pas repris tel quel, une ligne par genre ; rien à dire quand tout est arrivé. Comme celui de l'import PowerPoint (tellPptxImportReport).
    async function tellXlsxImportReport(report) {
      if (!report || !report.length) return;
      const lines = report.map(item => '• ' + I18n.t('xlsx.import.report.' + item.key, { n: item.n }));
      await Dialogs.notice({ title: I18n.t('xlsx.import.reportTitle'), message: I18n.t('xlsx.import.reportIntro') + '\n' + lines.join('\n') });
      refocusEditorIfLost();
    }

    // Lit le classeur et construit la grille. null : la liste des feuilles a été fermée sans choix, ou le classeur est refusé (l'erreur est dite
    // dans le coin d'état) ; dans les deux cas rien d'autre ne se passe.
    async function readXlsxForImport(file) {
      let chosen = null; // la feuille choisie, quand le classeur en a plusieurs : une erreur la nomme
      try {
        const book = await GridXlsxImport.openFile(file);
        let index = 0;
        if (book.sheets.length > 1) {
          // Sous le « + » : c'est de là que la personne est partie. Elle recouvre le coin d'état, qui n'a rien à dire pendant ce temps (« Lecture… »
          // serait faux, la lecture est finie) ; refermée sans choix, la liste ne change rien : le coin d'état redit l'état du modèle en cours.
          setStatus('');
          const picked = await GridXlsxImport.chooseSheet(book.sheets, { anchor: () => document.getElementById('btn-new').getBoundingClientRect() });
          if (picked === null) { updateSaveStatus(); refocusEditorIfLost(); return null; }
          index = picked;
          chosen = book.sheets[index].name;
        }
        return book.build(index, { lang: I18n.getLang() });
      } catch (e) {
        reportXlsxImportError(e, chosen);
        return null;
      }
    }

    function reportXlsxImportError(e, chosen) {
      console.warn('[main] import Excel impossible', e); // une erreur de la personne (mauvais fichier), pas du widget
      const key = e && e.code === 'empty' && chosen !== null ? 'status.xlsxImportEmptySheet' : (XLSX_IMPORT_ERRORS[e && e.code] || XLSX_IMPORT_ERRORS.unreadable);
      setStatus(I18n.t(key, { sheet: chosen, rows: e && e.rows, cols: e && e.cols, maxRows: e && e.maxRows, maxCols: e && e.maxCols, maxCells: e && e.maxCells, size: e && e.size ? importMegabytes(e.size) : '', max: e && e.max ? importMegabytes(e.max) : '' }), true);
    }

    function openImportedGrid(imported) {
      // Une nouvelle grille, sans nom et pas encore enregistrée, comme « Nouvelle grille ».
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, nom: '', contenu: imported.html, typeModele: GridEditor.TYPE, marginsMm: null, suiviModifications: null, headerFooter: null }, GridEditor.TYPE);
      markAutosaveDirty();
      const counts = { rows: imported.rows, cols: imported.cols };
      setStatus(imported.sheetCount > 1
        ? I18n.t('status.xlsxImportedSheet', Object.assign({ sheet: imported.sheetName, index: imported.sheetIndex + 1, total: imported.sheetCount }, counts))
        : I18n.t('status.xlsxImported', counts));
    }

    // Import d'un fichier Markdown (js/markdown-import.js), « Importer un Markdown… » du menu « + », sur le modèle de l'import d'un classeur : le sélecteur s'ouvre dans
    // le clic, le fichier est lu et converti ensuite, et ce n'est qu'après (un fichier refusé ne coûte rien) qu'on demande de quitter le modèle courant s'il a des
    // modifications non enregistrées. Le résultat est un nouveau document, sans nom et pas encore enregistré, comme « Nouveau document » ; l'en-tête et le pied de page
    // que le fichier porte (ceux que l'export Markdown écrit) deviennent ceux du document.
    const MD_IMPORT_ACCEPT = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain';
    const MD_IMPORT_ERRORS = { unreadable: 'status.mdImportUnreadable', empty: 'status.mdImportEmpty', tooBig: 'status.mdImportTooBig', library: 'status.mdImportLibrary' };
    function onImportMd() {
      if (isReadOnly()) return;
      GridXlsxImport.chooseFile(importMdFile, MD_IMPORT_ACCEPT);
    }

    // Le fichier Markdown choisi, par le sélecteur du menu « + » ou donné par GFS (importFileFromGfs). true : le document importé est à l'écran ; false : le fichier est refusé (l'erreur est dite dans le coin d'état) ou la
    // personne a répondu « Annuler » à la question d'enregistrement : rien n'a changé.
    async function importMdFile(file) {
      setStatus(I18n.t('status.mdImporting'));
      const imported = await readMdForImport(file);
      if (!imported) return false;
      if (hasEditsToConfirmBeforeLeaving()) {
        updateSaveStatus(); // la lecture est finie : « Lecture… » serait faux pendant la question
        if (!(await askBeforeLeaving())) return false;
      }
      openImportedDocument(imported);
      return true;
    }

    // Lit le fichier et construit le document. null : le fichier est refusé (l'erreur est dite dans le coin d'état) ; rien d'autre ne se passe.
    async function readMdForImport(file) {
      try {
        return await MarkdownImport.fromFile(file);
      } catch (e) {
        reportMdImportError(e);
        return null;
      }
    }

    function reportMdImportError(e) {
      console.warn('[main] import Markdown impossible', e); // une erreur de la personne (mauvais fichier) ou du réseau, pas du widget
      const megabytes = bytes => (Math.ceil(bytes / 104857.6) / 10).toLocaleString(I18n.getLang()); // vers le haut : « 10,1 Mo (au plus 10 Mo) », jamais « 10 Mo (au plus 10 Mo) »
      const key = MD_IMPORT_ERRORS[e && e.code] || MD_IMPORT_ERRORS.unreadable;
      setStatus(I18n.t(key, { size: e && e.size ? megabytes(e.size) : '', max: e && e.max ? megabytes(e.max) : '' }), true);
    }

    function openImportedDocument(imported) {
      // Un nouveau document, sans nom et pas encore enregistré, comme « Nouveau document ».
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, nom: '', contenu: imported.html, typeModele: 'document', marginsMm: null, suiviModifications: null, headerFooter: imported.headerFooter }, 'document');
      markAutosaveDirty();
      setStatus(mdImportedStatus(imported));
    }

    // Ce que le coin d'état dit d'un Markdown importé : les images locales qui n'ont pas été reprises et les {{Table.Colonne}} qui ne sont pas des variables de ce document
    // (laissées en texte), en une phrase quand il y a les deux (le coin d'état coupe ce qui dépasse, à droite).
    function mdImportedStatus(imported) {
      const images = imported.skippedImages || 0;
      const variables = imported.unknownVariables || 0;
      if (images && variables) return I18n.t('status.mdImportedImagesVariables', { images, variables });
      if (variables) return I18n.t('status.mdImportedVariables', { n: variables });
      return images ? I18n.t('status.mdImportedImages', { n: images }) : I18n.t('status.mdImported');
    }

    // Import d'un fichier PowerPoint (js/pptx-import.js), « Importer un PowerPoint… » du menu « + », sur le modèle des deux imports d'au-dessus : le sélecteur s'ouvre dans le clic, le fichier est lu ensuite, et ce n'est
    // qu'après (un fichier refusé ne coûte rien) qu'on demande de quitter le modèle courant s'il a des modifications non enregistrées. Le résultat est une nouvelle présentation, sans nom et pas encore enregistrée, comme
    // « Nouvelle présentation », avec la page des diapositives du fichier ; ce que l'éditeur n'a pas pu reprendre tel quel est dit dans une fenêtre. Une présentation est l'extension « diapositives » : sans elle, la ligne est
    // grisée et son clic explique, comme celui de « Nouvelle présentation ».
    const PPTX_IMPORT_ACCEPT = '.pptx,.ppsx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const PPTX_IMPORT_ERRORS = { unreadable: 'status.pptxImportUnreadable', legacy: 'status.pptxImportLegacy', empty: 'status.pptxImportEmpty', tooBig: 'status.pptxImportTooBig', library: 'status.pptxImportLibrary' };
    function onImportPptx() {
      if (isReadOnly()) return;
      if (!SlidesEntry.isAvailable()) { SlidesEntry.ensureFor(SlidesEntry.TYPE); return; }
      GridXlsxImport.chooseFile(importPptxFile, PPTX_IMPORT_ACCEPT);
    }

    // Le fichier PowerPoint choisi, par le sélecteur du menu « + » ou donné par GFS (importFileFromGfs). true : la présentation importée est à l'écran (et le rapport de ce qui n'a pas été repris, s'il y en a un, a été
    // lu) ; false : l'extension « diapositives » manque ou ne se charge pas (la fenêtre qui l'explique s'est ouverte, comme au clic de la ligne grisée), le fichier est refusé (l'erreur est dite dans le coin d'état) ou la
    // personne a répondu « Annuler » à la question d'enregistrement : rien n'a changé.
    // La lecture d'un gros fichier avance par tranches (js/pptx-import.js : la page répond pendant ce temps) : un second import lancé en route est refusé en le disant, et le compteur du coin d'état
    // suit les diapositives lues. La pose dans l'éditeur se fait aussi par tranches (js/import-placing.js). Tout du long un voile verrouille le panneau et dit où en est l'import - lecture, mise en place,
    // enregistrement - avec une barre ; il n'apparaît qu'après une demi-seconde (un petit fichier ne le voit pas), se retire devant la question d'enregistrement, et porte « Annuler l'import » tant que le
    // fichier se lit (rien n'a encore changé).
    let pptxImporting = false;
    // La part de la barre de chaque étape : la lecture est de loin la plus longue (150 diapositives de photos : 14 s de lecture, 5 de mise en place).
    const PPTX_STEP_READ = 0.65;
    const PPTX_STEP_PLACE = 0.3;
    async function importPptxFile(file) {
      if (pptxImporting) { setStatus(I18n.t('status.pptxImportBusy'), true); return false; }
      pptxImporting = true;
      const progress = ImportPlacing.begin();
      try {
        // Le code de l'extension (la bande des diapositives) arrive avant que la présentation s'ouvre : un échec le dit, et rien n'a changé.
        if (!(await SlidesEntry.ensureFor(SlidesEntry.TYPE))) return false;
        const reading = I18n.t('status.pptxImporting');
        setStatus(reading);
        progress.update(reading, 0);
        PerfTrace.mark('import PowerPoint : lecture', { octets: file.size });
        const run = { cancelled: false, fraction: 0 };
        progress.allowCancel(() => {
          run.cancelled = true;
          progress.allowCancel(null);
          progress.update(I18n.t('importPlacing.cancelling'), run.fraction);
        });
        const imported = await readPptxForImport(file, progress, run);
        progress.allowCancel(null);
        if (run.cancelled && imported) { setStatus(I18n.t('status.pptxImportCancelled')); return false; } // « Annuler » arrivé avec la dernière diapositive : rien n'est posé
        if (!imported) return false;
        PerfTrace.mark('import PowerPoint : lu', { diapositives: imported.slideCount, texteMo: Math.round(ImportPlacing.slidesOf(imported).reduce((sum, text) => sum + text.length, 0) / 104857.6) / 10 });
        if (hasEditsToConfirmBeforeLeaving()) {
          progress.suspend();
          updateSaveStatus(); // la lecture est finie : « Lecture… » serait faux pendant la question
          if (!(await askBeforeLeaving())) return false;
        }
        PerfTrace.mark('import PowerPoint : mise en place');
        await placeImportedPresentation(imported, progress, file);
        PerfTrace.mark('import PowerPoint : en place');
        progress.end();
        await tellPptxImportReport(imported.report);   // la fenêtre du rapport prend le focus et le rend à l'éditeur en se fermant
        return true;
      } finally {
        progress.end();
        // Le voile, la question « Modifications non enregistrées » ou un fichier refusé ne rendent pas le focus à l'éditeur : c'est ici qu'il le retrouve, jamais avant la fenêtre du rapport (la reprise du focus
        // de l'éditeur est différée d'une image, elle passerait devant le bouton « Fermer »).
        refocusEditorIfLost();
        pptxImporting = false;
      }
    }

    // Rend la main au navigateur le temps d'une image (le message d'état posé juste avant se peint) ; ne dépasse jamais 100 ms (un onglet caché ne peint rien).
    function afterPaint() {
      return new Promise((resolve) => {
        let done = false;
        const go = () => { if (!done) { done = true; resolve(); } };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0));
        setTimeout(go, 100);
      });
    }

    // Lit le fichier et construit la présentation. null : le fichier est refusé (l'erreur est dite dans le coin d'état) ou l'import est annulé ; rien d'autre ne se passe.
    async function readPptxForImport(file, progress, run) {
      try {
        await ExportEngines.ensure('pptxImport').catch((e) => { throw Object.assign(new Error('moteur d’import indisponible'), { code: 'library', cause: e }); });
        return await PptxImport.fromFile(file, {
          shouldStop: () => run.cancelled,
          onProgress: ({ done, total }) => {
            const text = I18n.t('status.pptxImportingProgress', { done, total });
            setStatus(text);
            run.fraction = PPTX_STEP_READ * done / Math.max(total, 1);
            if (!run.cancelled) progress.update(text, run.fraction);
          },
        });
      } catch (e) {
        if (e && e.code === 'cancelled') { setStatus(I18n.t('status.pptxImportCancelled')); return null; }
        reportPptxImportError(e);
        return null;
      }
    }

    function reportPptxImportError(e) {
      console.warn('[main] import PowerPoint impossible', e); // une erreur de la personne (mauvais fichier) ou du réseau, pas du widget
      const key = PPTX_IMPORT_ERRORS[e && e.code] || PPTX_IMPORT_ERRORS.unreadable;
      setStatus(I18n.t(key, { size: e && e.size ? importMegabytes(e.size) : '', max: e && e.max ? importMegabytes(e.max) : '' }), true);
    }

    // Une nouvelle présentation, sans nom et pas encore enregistrée, comme « Nouvelle présentation » ; sa page est celle des diapositives du fichier (taille, sens, marges). Les premières diapositives se posent par
    // le chemin habituel (type, page, bande), les autres À LA SUITE, une à une, la page reprenant la main entre deux (ImportPlacing) ; chaque texte est libéré dès que sa diapositive est posée.
    // Un gros fichier (HEAVY_FILE_BYTES, 15 Mo) est enregistré dans Grist DÈS QUE sa mise en place est finie, sous le nom du fichier (10/11, « enregistrer le modèle au fil de l'import ») : le modèle est
    // dans la liste avant que quoi que ce soit d'autre se passe, et l'enregistrement automatique prend le relais. Un fichier ordinaire garde son parcours : la personne nomme puis enregistre.
    const baseNameOf = fileName => String(fileName || '').replace(/\.[^.]*$/, '').trim();
    async function placeImportedPresentation(imported, progress, file) {
      const keepName = file && file.size >= PptxImport.HEAVY_FILE_BYTES ? baseNameOf(file.name) : '';
      const texts = ImportPlacing.slidesOf(imported);
      const total = texts.length;
      const note = (placed) => {
        const text = I18n.t('status.pptxPlacingProgress', { done: placed, total });
        setStatus(text);
        progress.update(text, PPTX_STEP_READ + PPTX_STEP_PLACE * placed / Math.max(total, 1));
      };
      note(0);
      await afterPaint();
      templateSelect.value = '';
      // Les premières diapositives (ou, si elles sont énormes, le début de la première) par le chemin habituel, le reste par pas : ImportPlacing.takeFirst.
      const head = ImportPlacing.takeFirst(texts);
      loadTemplateIntoEditor({ id: null, nom: keepName, contenu: head.first, typeModele: SlidesEntry.TYPE, marginsMm: imported.page, suiviModifications: null, headerFooter: null }, SlidesEntry.TYPE);
      note(head.started);
      // Un très gros texte (masqué derrière le voile pendant la pose) se met en page d'un coup à la fin, quelques secondes : le voile le dit avant (`closing`).
      const closing = () => {
        const text = I18n.t('status.pptxClosing');
        setStatus(text);
        progress.update(text, PPTX_STEP_READ + PPTX_STEP_PLACE, true);
      };
      const failed = head.pieces.length ? await ImportPlacing.appendSlides(head.pieces, () => {}, { covered: progress.isShown, markers: head.leads, tail: head.first, onStep: info => note(Math.min(total, head.started + info.markers)), onClosing: closing }) : 0;
      if (failed) {
        const item = imported.report.find(entry => entry.key === 'unreadable');
        if (item) item.n += failed; else imported.report.push({ key: 'unreadable', n: failed });
      }
      markAutosaveDirty();
      setStatus(I18n.t('status.pptxImported', { n: imported.slideCount }));
      if (!keepName) return;
      const saving = I18n.t('importPlacing.saving');
      setStatus(saving);
      progress.update(saving, PPTX_STEP_READ + PPTX_STEP_PLACE);
      // le texte du document s'écrit d'avance, par tranches : l'enregistrement le trouve prêt ; s'il échoue, l'enregistrement le refait lui-même, d'un bloc
      await ImportPlacing.prepareSave().catch(error => console.warn('[main] import PowerPoint : texte non préparé d’avance', error));
      await onSave();     // dit lui-même son échec dans le coin d'état (tables refusées, Grist qui refuse, erreur) : le modèle reste alors « à enregistrer »
      PerfTrace.mark('import PowerPoint : enregistré', { id: Templates.getCurrentId() });
      if (Templates.getCurrentId() != null) setStatus(I18n.t('status.pptxImportedSaved', { n: imported.slideCount, name: templateNameInput ? templateNameInput.value : keepName }));
    }

    // Ce que l'import n'a pas repris tel quel, une ligne par genre d'objet ; rien à dire quand tout est arrivé.
    async function tellPptxImportReport(report) {
      if (!report || !report.length) return;
      const lines = report.map(item => '• ' + I18n.t('pptx.import.report.' + item.key, { n: item.n, max: PptxImport.MAX_SLIDES }));
      await Dialogs.notice({ title: I18n.t('pptx.import.reportTitle'), message: I18n.t('pptx.import.reportIntro') + '\n' + lines.join('\n') });
      refocusEditorIfLost();
    }

    // Import d'un fichier Word (js/docx-import.js), « Importer un Word… » du menu « + », sur le modèle de l'import PowerPoint : le sélecteur s'ouvre dans le clic, le fichier est lu ensuite, et ce n'est qu'après (un fichier
    // refusé ne coûte rien) qu'on demande de quitter le modèle courant s'il a des modifications non enregistrées. Le résultat est un nouveau document, sans nom et pas encore enregistré, avec la page, les en-têtes
    // et les pieds de page du fichier ; ce que l'éditeur n'a pas pu reprendre tel quel est dit dans une fenêtre, une ligne par genre.
    const DOCX_IMPORT_ACCEPT = '.docx,.docm,.dotx,.dotm,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const DOCX_IMPORT_ERRORS = { unreadable: 'status.docxImportUnreadable', legacy: 'status.docxImportLegacy', empty: 'status.docxImportEmpty', tooBig: 'status.docxImportTooBig', library: 'status.docxImportLibrary' };
    function onImportDocx() {
      if (isReadOnly()) return;
      GridXlsxImport.chooseFile(importDocxFile, DOCX_IMPORT_ACCEPT);
    }

    // Le fichier Word choisi, par le sélecteur du menu « + » ou donné par GFS (importFileFromGfs). true : le document importé est à l'écran (et le compte rendu de ce qui n'a pas été repris, s'il y en a un, a été lu) ; false : le fichier est refusé (l'erreur
    // est dite dans le coin d'état) ou la personne a répondu « Annuler » à la question d'enregistrement : rien n'a changé.
    async function importDocxFile(file) {
      setStatus(I18n.t('status.docxImporting'));
      const imported = await readDocxForImport(file);
      if (!imported) return false;
      if (hasEditsToConfirmBeforeLeaving()) {
        updateSaveStatus(); // la lecture est finie : « Lecture… » serait faux pendant la question
        if (!(await askBeforeLeaving())) return false;
      }
      openImportedDocx(imported);
      await tellDocxImportReport(imported.report);
      return true;
    }

    // Lit le fichier et construit le document. null : le fichier est refusé (l'erreur est dite dans le coin d'état) ; rien d'autre ne se passe.
    async function readDocxForImport(file) {
      try {
        await ExportEngines.ensure('docxImport').catch((e) => { throw Object.assign(new Error('moteur d’import indisponible'), { code: 'library', cause: e }); });
        return await DocxImport.fromFile(file);
      } catch (e) {
        reportDocxImportError(e);
        return null;
      }
    }

    function reportDocxImportError(e) {
      console.warn('[main] import Word impossible', e); // une erreur de la personne (mauvais fichier) ou du réseau, pas du widget
      const key = DOCX_IMPORT_ERRORS[e && e.code] || DOCX_IMPORT_ERRORS.unreadable;
      setStatus(I18n.t(key, { size: e && e.size ? importMegabytes(e.size) : '', max: e && e.max ? importMegabytes(e.max) : '' }), true);
    }

    function openImportedDocx(imported) {
      // Un nouveau document, sans nom et pas encore enregistré, comme « Nouveau document » ; sa page (format, sens, marges) et ses en-têtes et pieds de page sont ceux du fichier.
      templateSelect.value = '';
      // Les modifications suivies du fichier (auteur et date) restent en attente de validation ; ses commentaires sont marqués dans le texte, leurs messages attendent le premier enregistrement (ils vont dans la table
      // des fils, qui a besoin du numéro du modèle : adoptStaged, plus bas).
      loadTemplateIntoEditor({ id: null, nom: '', contenu: imported.html, typeModele: 'document', marginsMm: imported.page, suiviModifications: imported.suiviModifications || null, headerFooter: imported.headerFooter }, 'document');
      Comments.stageImported(imported.comments);
      markAutosaveDirty();
      setStatus(I18n.t('status.docxImported'));
    }

    // Ce que l'import n'a pas repris tel quel, une ligne par genre ; rien à dire quand tout est arrivé.
    async function tellDocxImportReport(report) {
      if (!report || !report.length) return;
      const lines = report.map(item => '• ' + I18n.t('docx.import.report.' + item.key, { n: item.n }));
      await Dialogs.notice({ title: I18n.t('docx.import.reportTitle'), message: I18n.t('docx.import.reportIntro') + '\n' + lines.join('\n') });
      refocusEditorIfLost();
    }

    return { importFileFromGfs, onImportDocx, onImportMd, onImportPptx, onImportXlsx };
  }

  return { create };
})();
