// Les exports du widget : le verrou anti-double-export, l'export d'une ligne (PDF, Word, Excel, PowerPoint, Markdown, HTML), « Créer un e-mail », les menus d'export (lignes grisées selon le type du
// modèle), les exports en lot (planche de jobs, destination, ZIP) et leur fin, et le rangement dans GFS (js/pdf-delivery.js). Sorti de js/main.js (refactorisation du 09/11, découpe 6) : le verrou
// est à lui (`isExportRunning` le dit au reste), le type du modèle et la table à l'écran lui sont prêtés en lecture (`getCurrentTypeModele`, `getCurrentTableId`), le reste de ce qu'il tire de
// main.js lui est donné par `api`. Les corps sont ceux de main.js.
const MainExport = (function () {
  function create(api) {
    const { buildMailtoForRecord, currentDocumentHtml, getCurrentMacroSlots, getCurrentTableId, getCurrentTypeModele, getEmailFields, getPdfFilenameTemplate, perModelOption, setStatus, templateNameInput } = api;

    // Verrou anti-double-export : pdf-export.js numérote les notes de bas de page dans un état de module partagé, que deux exports en parallèle
    // corrompraient en silence. Tous les contrôles d'export (EXPORT_CONTROL_IDS) sont désactivés pendant toute opération, pas seulement celui cliqué.
    let exportOperationInProgress = false;
    // `v2-btn-export-pdf-batch` est un <span> (ligne de menu au survol), pas un <button> - `.disabled` n'a aucun effet dessus (propriété réservée aux
    // contrôles de formulaire) ; `pointer-events`/`opacity` fonctionnent sur n'importe quel élément.
    function setExportControlLocked(el, locked) {
      if (!el) return;
      if ('disabled' in el) el.disabled = locked;
      el.style.pointerEvents = locked ? 'none' : '';
      el.style.opacity = locked ? '.5' : '';
    }
    // Un bouton grisé perd le focus (le navigateur le rend au corps de la page) : sans ce rappel, le clavier repartirait du début de la page à la fin
    // d'un export ou quand la fenêtre « Email trop long » se referme (elle n'a alors plus d'élément d'origine à retrouver). Seul un focus posé au
    // clavier (cadre de focus visible) est rendu : à la souris rien ne change. Rien n'est rendu si le focus est allé ailleurs pendant l'export ; un
    // élément resté actif mais masqué (le bouton de la fenêtre qui vient de se fermer) n'est pas un focus déplacé.
    function keyboardFocusedElement() {
      const el = document.activeElement;
      return el && el !== document.body && el.matches(':focus-visible') ? el : null;
    }
    function restoreKeyboardFocus(el) {
      if (!el || !el.isConnected) return;
      const now = document.activeElement;
      const movedElsewhere = now && now !== document.body && now !== el && now.getClientRects().length > 0;
      if (!movedElsewhere) el.focus({ preventScroll: true });
    }
    // Les contrôles qu'un export en cours grise : tous les exports et « Créer l'email », pour qu'on ne lance pas un second export par-dessus le
    // premier.
    const EXPORT_CONTROL_IDS = ['btn-export-pdf', 'v2-btn-export-pdf', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-pdf-sheets', 'v2-btn-export-docx', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx',
      'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single', 'btn-create-email'];
    function withExportLock(fn) {
      return async (...args) => {
        // Un gros modèle qui se remplit par morceaux (js/main.js:fillOpenedPresentation) n'a pas encore tout son texte : l'export attend la fin.
        if (ImportPlacing.isFilling()) await ImportPlacing.whenFilled();
        if (exportOperationInProgress || !AccessRights.get().canExport) return;
        exportOperationInProgress = true;
        const controls = EXPORT_CONTROL_IDS.map(id => document.getElementById(id));
        const keyboardFocus = keyboardFocusedElement();
        OrientationToggle.setBusy(true);
        controls.forEach(el => setExportControlLocked(el, true));
        // Un clic = un lancement (un lot entier compris) : les sites d'images déjà acceptés ne sont pas redemandés, un refus arrête tout
        // (js/external-images.js).
        ExternalImages.beginRun();
        // Réglage « Accessibilité » : le rappel des images sans texte alternatif ne se pose qu'une fois par lancement (js/alt-reminder.js).
        AltReminder.beginRun();
        ExportCommon.resetUnreadImages();
        try {
          await fn(...args);
        } finally {
          ExternalImages.endRun();
          AltReminder.endRun();
          exportOperationInProgress = false;
          OrientationToggle.setBusy(false);
          controls.forEach(el => setExportControlLocked(el, false));
          restoreKeyboardFocus(keyboardFocus);
        }
      };
    }

    // L'état de fin d'un export réussi : son texte, précédé - quand des images n'ont pas pu être lues et manquent dans le fichier
    // (ExportCommon.noteUnreadImage) - de leur nombre, en tête : le coin d'état coupe ce qui dépasse, à droite. Le fichier est bien produit : ce n'est
    // pas une erreur (pas de rouge), mais la personne n'a plus à ouvrir le fichier pour s'en apercevoir.
    function setExportDoneStatus(text, note) {
      const unread = ExportCommon.unreadImageCount();
      const done = unread ? I18n.t('status.imagesUnread', { n: unread }) + ' ' + text : text;
      // `note` : ce qui n'a pas pu se faire après l'export (stampExportDate), en tête et en rouge - le coin d'état coupe à droite, et le fichier, lui, est bien produit.
      setStatus(note ? note + ' ' + done : done, !!note);
    }

    // La date du dernier export PDF (js/export-date.js), écrite une fois le fichier produit pour ces lignes. Rend ce qu'il faut dire quand elle n'a pas pu l'être,
    // '' sinon (rien à écrire, écrite, ou compte Lecteur). Tout nouveau chemin d'export PDF l'appelle après son téléchargement.
    async function stampExportDate(tableId, rowIds) {
      const problem = await ExportDate.stamp(tableId, rowIds);
      return problem ? I18n.t('status.exportDate.' + problem.reason, { column: problem.column }) : '';
    }

    // Les exports qui écrivent la cible d'une diapositive que vise un lien (le PDF, le Word, le HTML : js/pdf-export.js, js/docx-export.js, js/html-export.js) ont son bloc d'adresse (SlideProps.forOutput,
    // option `anchors`), comme l'impression par le navigateur (`slideAnchors` : js/print-export.js en fait une destination) ; le Markdown, le tableur, l'e-mail et le PowerPoint (qui écrit les liens lui-même) n'en ont pas : un lien y reste du texte.
    const writesSlideAnchors = spec => !!spec.slideAnchors || (spec.engines || []).some(engine => engine === 'pdf' || engine === 'docx' || engine === 'html');

    // Le document de la ligne courante pour un export seul : { html, headerFooterData } - ceux du modèle, avec la valeur de chaque liste réglée « Un
    // document par valeur » (js/list-split.js) quand elle n'en a qu'une -, ou { split } quand la ligne fait plusieurs documents : l'appelant passe
    // alors à l'archive d'onExportBatch (PDF, Word ou Excel, un fichier par valeur). Sans liste ainsi réglée, le HTML et les en-têtes du modèle, tels
    // quels.
    async function currentRecordDocument(tableId, record, options) {
      const html = await currentDocumentHtml(tableId, record, options);
      const headerFooterData = Editor.getHeaderFooterData();
      const plan = await ListSplit.plan(ListSplit.partsOf(html, headerFooterData), tableId, record);
      if (plan.variants.length > 1) return { split: { record, plan, html } };
      return { html: ListSplit.pin(html, plan.variants[0]), headerFooterData: ListSplit.pinHeaderFooter(headerFooterData, plan.variants[0]) };
    }

    // Les champs de document d'un PDF/A (PdfExport.prepareRecord) : aucun mot de passe ni droit, seulement la marque qui fait passer le PDF fini en PDF/A-2b (js/pdf-archive.js).
    const ARCHIVE_DOC_FIELDS = Object.freeze({ archive: true });

    // Les exports d'une seule ligne : le lot que prend son document quand « Un document par valeur » le découpe, l'alerte sans ligne, les textes du
    // coin d'état et l'export lui-même (`doc` : { html, headerFooterData }, cf. currentRecordDocument), et `stampsExportDate` pour le PDF seul : la date de son dernier
    // export s'écrit dans la colonne choisie (js/export-date.js). Word n'a ni sélecteur de qualité ni autre mode
    // (cf. en-tête de js/docx-export.js). Le type choisi dans le menu « Type d'export » (selectedExportType) décide lequel part au bouton Exporter. Excel exporte le tableau d'une grille, sans en-tête ni pied de page ni marges du document : la feuille
    // reprend l'orientation et les marges de PageLayout. `engines` : les moteurs de js/export-engines.js que `run` appelle, chargés au premier export. Le PDF d'une
    // présentation ne demande jamais « Exporter quand même ? » pour une page blanche : chacune est une diapositive (SlidesEntry.showsEveryPage).
    const SINGLE_EXPORTS = {
      pdf: {
        engines: ['pdf'],
        batch: 'pdfZip', noRecord: 'alert.noRecordForExport', generating: 'status.pdfGenerating', generated: 'status.pdfGenerated', failed: 'status.pdfGenerationError',
        stampsExportDate: true,
        run: (doc, tableId, record) => PdfExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt(), undefined, pdfImageQuality(), undefined, SlidesEntry.showsEveryPage(getCurrentTypeModele())),
      },
      // « PDF protégé » (type du menu Type d'export) : le même PDF vectoriel, chiffré avec le mot de passe, les autorisations et les propriétés que la fenêtre
      // (js/pdf-protection-dialog.js) vient de fixer, avant tout le reste (`protect`). « Impression navigateur » n'a pas de sens ici (le navigateur imprime, il ne chiffre pas) :
      // la qualité « Léger » seule s'applique. Un document découpé « Un document par valeur » reste un lot protégé (une archive ZIP).
      pdfProtected: {
        engines: ['pdf'], protect: true,
        batch: 'pdfProtectedZip', noRecord: 'alert.noRecordForExport', generating: 'status.pdfGenerating', generated: 'status.pdfProtectedGenerated', failed: 'status.pdfGenerationError',
        stampsExportDate: true,
        run: (doc, tableId, record, protection) => PdfExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt(), undefined, pdfImageQuality(), PdfProtection.docFields(protection), SlidesEntry.showsEveryPage(getCurrentTypeModele())),
      },
      // « PDF/A (archivage) » (type du menu Type d'export) : le même PDF vectoriel, passé en PDF/A-2b une fois rendu (js/pdf-archive.js), le format que les archives et les cabinets comptables demandent pour une facture. « Impression
      // navigateur » n'a pas de sens ici (le navigateur imprime un PDF ordinaire) ; « Léger » s'applique. Un PDF/A ne se chiffre pas : « PDF protégé » reste un type à part. Un document découpé « Un document par valeur » reste un lot (une archive ZIP).
      pdfArchive: {
        engines: ['pdf', 'archive'],
        batch: 'pdfArchiveZip', noRecord: 'alert.noRecordForExport', generating: 'status.pdfGenerating', generated: 'status.pdfArchiveGenerated', failed: 'status.pdfGenerationError',
        stampsExportDate: true,
        run: (doc, tableId, record) => PdfExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt(), undefined, pdfImageQuality(), ARCHIVE_DOC_FIELDS, SlidesEntry.showsEveryPage(getCurrentTypeModele())),
      },
      // « Impression navigateur » (qualité du bouton PDF) : la Lecture, imprimée par le navigateur (js/print-export.js), sans moteur à charger. Un document
      // découpé « Un document par valeur » reste un lot : le lot PDF (archive ZIP), une impression ne faisant qu'un document.
      print: {
        engines: [], slideAnchors: true,
        batch: 'pdfZip', noRecord: 'alert.noRecordForExport', generating: 'status.printPreparing', generated: 'status.printStarted', failed: 'status.printFailed',
        run: (doc, tableId, record) => PrintExport.printRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData),
      },
      docx: {
        engines: ['docx'],
        batch: 'docxZip', noRecord: 'alert.noRecordForExportDocx', generating: 'status.docxGenerating', generated: 'status.docxGenerated', failed: 'status.docxGenerationError',
        run: (doc, tableId, record) => DocxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsTwip()),
      },
      xlsx: {
        engines: ['xlsx'],
        batch: 'xlsxZip', noRecord: 'alert.noRecordForExportXlsx', generating: 'status.xlsxGenerating', generated: 'status.xlsxGenerated', failed: 'status.xlsxGenerationError',
        run: (doc, tableId, record) => XlsxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate()),
      },
      // PowerPoint (js/pptx-export.js) : la présentation, une diapositive du fichier par diapositive, objets modifiables ; `keepProps` : le HTML garde le repère de chaque diapositive, d'où viennent sa transition, son fond et ses notes.
      pptx: {
        engines: ['pptx'], keepProps: true,
        batch: 'pptxZip', noRecord: 'alert.noRecordForExportPptx', generating: 'status.pptxGenerating', generated: 'status.pptxGenerated', failed: 'status.pptxGenerationError',
        run: (doc, tableId, record) => PptxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt()),
      },
      // Markdown (js/markdown-export.js) : le texte du document, sans marges ni pages ; comme le Word, il est fait pour un document, pas pour une grille.
      md: {
        engines: ['md'],
        batch: 'mdZip', noRecord: 'alert.noRecordForExportMd', generating: 'status.mdGenerating', generated: 'status.mdGenerated', failed: 'status.mdGenerationError',
        run: (doc, tableId, record) => MarkdownExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData),
      },
      // HTML (js/html-export.js) : le texte du document qui coule comme une page web, ni pages ni marges. `html` : le fichier complet à déposer sur un site ; `htmlFragment` : le contenu
      // seul à coller dans un bloc de page (`fragment`). Comme le Word et le Markdown, ils ne font que des documents.
      html: {
        engines: ['html'],
        batch: 'htmlZip', noRecord: 'alert.noRecordForExportHtml', generating: 'status.htmlGenerating', generated: 'status.htmlGenerated', failed: 'status.htmlGenerationError',
        run: (doc, tableId, record) => HtmlExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData),
      },
      htmlFragment: {
        engines: ['html'],
        batch: 'htmlFragmentZip', noRecord: 'alert.noRecordForExportHtml', generating: 'status.htmlGenerating', generated: 'status.htmlGenerated', failed: 'status.htmlGenerationError',
        run: (doc, tableId, record) => HtmlExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, { fragment: true }),
      },
      // Email (.eml) (js/eml-export.js) : un modèle email écrit en fichier de message à ouvrir dans la messagerie - la mise en forme du modèle, ses images et les pièces jointes du champ PJ -, en brouillon à relire
      // et à envoyer. `describe` : la phrase de fin quand des adresses n'en sont pas (laissées de côté).
      eml: {
        engines: ['html'],
        batch: 'emlZip', noRecord: 'alert.noRecordForExportEml', generating: 'status.emlGenerating', generated: 'status.emlGenerated', failed: 'status.emlGenerationError',
        run: (doc, tableId, record) => EmlExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, getEmailFields()),
        describe: result => (result && result.skipped && result.skipped.length ? I18n.t('status.emlGeneratedSkipped', { count: result.skipped.length, list: result.skipped.join(', ') }) : ''),
      },
    };

    // Les réglages de « PDF protégé » pour la ligne affichée : ceux de la fenêtre tels quels, sauf pour « Un par ligne », où le mot de passe est celui de la cellule de CETTE ligne. La ligne
    // de l'écran (grist.onRecord) ne porte que les colonnes affichées : la ligne se relit en entier dans Grist, colonne des mots de passe comprise. Lève l'erreur de
    // PdfProtection.settingsForRow (`passwordProblem`, `column`) quand la cellule ne donne pas un mot de passe utilisable.
    async function protectionForRecord(protection, tableId, record) {
      if (protection.mode !== 'column') return protection;
      return PdfProtection.settingsForRow(protection, await GristAPI.fetchRowById(tableId, record.id, true));
    }

    async function exportRecordAs(kind) {
      const spec = SINGLE_EXPORTS[kind];
      Editor.exitHeaderFooterModeIfActive();
      const record = GristAPI.getCurrentRecord();
      if (!record) { alert(exportText(spec.noRecord)); return; }
      // « PDF protégé » : la fenêtre du mot de passe d'abord, avant « Génération en cours… » - y renoncer ne lance rien. Elle vaut aussi pour le lot que découpe « Un document par valeur ».
      const tableId = getCurrentTableId() || GristAPI.getCurrentTableId();
      let protection;
      if (spec.protect) {
        protection = await PdfProtectionDialog.open({ table: tableId });
        if (!protection) { setStatus(I18n.t('status.exportCancelled')); return; }
      }
      setStatus(I18n.t(spec.generating));
      try {
        // « Un par ligne » : le mot de passe de CETTE ligne, lu maintenant ; sa cellule inutilisable arrête l'export avant tout travail (jamais un PDF sans le mot de passe attendu).
        if (protection) protection = await protectionForRecord(protection, tableId, record);
        const doc = await currentRecordDocument(tableId, record, { keepProps: !!spec.keepProps, anchors: writesSlideAnchors(spec) });
        if (doc.split) { await onExportBatch(spec.batch, doc.split, { protection }); return; }
        await ExportEngines.ensure(spec.engines);
        PdfDelivery.takeReport();   // un rapport resté d'un export d'avant ne dit rien de celui-ci
        const saved = await spec.run(doc, tableId, record, protection);
        // « Annuler » sur la fenêtre des pages blanches (le PDF seul, js/pdf-export.js) : rien n'est enregistré, et la ligne n'est pas datée.
        if (saved === false) { setStatus(I18n.t('status.exportCancelled')); return; }
        // Le PDF a pu être rangé dans GFS au lieu d'être téléchargé, ou en plus (js/pdf-delivery.js) : le coin d'état le dit, et la ligne n'est datée que si le fichier est parti quelque part (la personne qui refuse le nom chez GFS n'a pas de PDF).
        const delivery = PdfDelivery.takeReport();
        const said = PdfDelivery.describe(delivery);
        const gone = !delivery || !delivery.shelved || delivery.delivered.size > 0;
        const problem = spec.stampsExportDate && gone ? await stampExportDate(tableId, [record.id]) : '';
        const generated = (spec.describe && spec.describe(saved)) || I18n.t(spec.generated);
        setExportDoneStatus(said.text ? (delivery.downloaded ? said.text + ' ' + generated : said.text) : generated, [said.note, problem].filter(Boolean).join(' '));
      } catch (e) {
        // « Annuler » sur la fenêtre des images d'un site externe (js/external-images.js) : un choix, pas une erreur.
        if (ExternalImages.isCancel(e)) { setStatus(I18n.t('status.exportCancelled')); return; }
        // « Un par ligne » : la cellule de mot de passe de cette ligne ne sert pas (vide, trop longue...) - la phrase dit laquelle et quelle colonne, rien n'a été généré.
        if (e && e.passwordProblem) { setStatus(I18n.t('status.pdfPasswordProblem.' + e.passwordProblem, { column: e.column }), true); return; }
        // Une image du document illisible ou incomplète (un PNG tronqué) : pdfmake ne peut pas la mettre dans le PDF ; la phrase dit quoi faire, plutôt que l'échec sans cause.
        if (e && e.imageProblem) { console.error(e); setStatus(I18n.t('status.pdfImageProblem'), true); return; }
        // Une pièce jointe du champ PJ illisible (.eml) : la phrase donne le nom du fichier, aucun email n'est généré sans la pièce attendue.
        if (e && e.attachmentProblem) { console.error(e); setStatus(e.message, true); return; }
        // Un document de plus de PrintExport.MAX_PAGES pages : l'impression navigateur le refuse (son coût croît avec le carré du nombre de pages) ; ce n'est
        // pas une panne, la phrase dit quoi choisir à la place.
        if (PrintExport.isTooLong(e)) { setStatus(I18n.t('status.printTooLong', { n: e.pages, max: PrintExport.MAX_PAGES }), true); return; }
        console.error(e);
        setStatus(I18n.t(spec.failed), true);
      }
    }
    // Le type d'export (menu du bouton à gauche d'Exporter, ex-« Qualité PDF ») : PDF, PDF protégé, PDF/A, Word, Excel, Markdown, Markdown (modèle), HTML ou HTML (contenu à coller), gardé dans la liste cachée
    // #v2-export-type comme la qualité du PDF l'est dans #v2-pdf-quality. Word, Markdown et HTML n'ont de sens que pour un document (un macro-modèle compris) et Excel que pour une
    // grille ; « Markdown (modèle) » écrit le contenu du modèle ouvert (ses variables comprises), donc ni une grille ni un macro-modèle, qui n'a pas de contenu à lui : un type
    // que le modèle ouvert ne sait pas faire n'est pas proposé (ligne grisée) et le bouton Exporter retombe sur le PDF, jamais sur une erreur.
    function exportTypeAvailable(type) {
      const grid = GridEditor.isGridType(getCurrentTypeModele());
      return type === 'pdf' || type === 'pdfProtected' || type === 'pdfArchive' || ((type === 'docx' || type === 'md' || type === 'html' || type === 'htmlFragment') && !grid) || (type === 'xlsx' && grid)
        || (type === 'mdTemplate' && !grid && getCurrentTypeModele() !== 'macro') || (type === 'pptx' && getCurrentTypeModele() === 'presentation') || (type === 'eml' && getCurrentTypeModele() === 'email');
    }
    // Pourquoi une ligne du menu « Type d'export » est grisée pour le modèle ouvert (js/lock-reasons.js) : PowerPoint ne sert qu'une présentation, Excel qu'une grille, un tableau seul ne s'écrit ni en Word, ni en Markdown, ni en HTML,
    // un macro-modèle n'a pas de texte à écrire en Markdown.
    function exportTypeReason(type) {
      if (type === 'pptx') return I18n.t('lock.exportPptx');
      if (type === 'xlsx') return I18n.t('lock.exportXlsx');
      if (type === 'eml') return I18n.t('lock.exportEml');
      if (type === 'mdTemplate' && getCurrentTypeModele() === 'macro') return I18n.t('lock.exportMacroMd');
      return GridEditor.isGridType(getCurrentTypeModele()) ? I18n.t('lock.exportNotGrid') : '';
    }
    function selectedExportType() {
      const select = document.getElementById('v2-export-type');
      const type = select ? select.value : 'pdf';
      return exportTypeAvailable(type) ? type : 'pdf';
    }
    // La qualité du PDF : « Impression navigateur » imprime la Lecture par le navigateur, toute autre ligne garde le PDF vectoriel. Les lots (toutes les
    // lignes, PDF fusionné, planches) restent vectoriels et suivent « Léger » comme le PDF d'une ligne : il ne change que le poids des images (PdfExport,
    // ImageIo.lighten), jamais la page.
    function selectedPdfQuality() {
      const select = document.getElementById('v2-pdf-quality');
      return select ? select.value : 'native';
    }
    // Ce que le moteur PDF reçoit de la qualité choisie : 'light' ramène les images à leur définition, toute autre ligne les reprend telles quelles.
    function pdfImageQuality() {
      return selectedPdfQuality() === 'light' ? 'light' : 'native';
    }
    const onExportPdf = () => exportRecordAs(selectedPdfQuality() === 'browser-print' ? 'print' : 'pdf');
    const onExportPdfProtected = () => exportRecordAs('pdfProtected');
    const onExportPdfArchive = () => exportRecordAs('pdfArchive');
    const onExportDocx = () => exportRecordAs('docx');
    const onExportPptx = () => exportRecordAs('pptx');
    const onExportXlsx = () => exportRecordAs('xlsx');
    const onExportMd = () => exportRecordAs('md');
    const onExportHtml = () => exportRecordAs('html');
    const onExportHtmlFragment = () => exportRecordAs('htmlFragment');
    const onExportEml = () => exportRecordAs('eml');
    // « Markdown (modèle) » : le modèle ouvert tel que l'éditeur le montre, ses variables écrites {{Table.Colonne}} et le reste de ses éléments de fusion en HTML en ligne
    // (js/markdown-export.js:exportTemplate), pour que l'import le relise intact. Ni ligne, ni valeur : rien à lire dans Grist, un seul fichier nommé d'après le modèle.
    async function onExportMdTemplate() {
      Editor.exitHeaderFooterModeIfActive();
      setStatus(I18n.t('status.mdGenerating'));
      try {
        await ExportEngines.ensure(['md']);
        await MarkdownExport.exportTemplate(SlideLinks.strip(Editor.getHTML()), Editor.getHeaderFooterData(), sanitizeFilenamePart(templateNameInput ? templateNameInput.value : ''));
        setExportDoneStatus(I18n.t('status.mdTemplateGenerated'));
      } catch (e) {
        console.error(e);
        setStatus(I18n.t('status.mdGenerationError'), true);
      }
    }
    // Les lignes que le bouton Exporter exporte (options du menu du bouton Exporter, demande du 12/10) : « une seule ligne » (la ligne affichée) ou
    // toutes les lignes de la table - un ZIP (un fichier par ligne), un seul PDF, l'assemblage avant impression, ou pour Excel un seul classeur. L'option cochée est
    // gardée dans la liste cachée #v2-export-lines. Chaque type n'a que ses lots (EXPORT_BATCH_OF) : une option que le type ne connaît pas (le PDF unique après un
    // passage à Word, le classeur unique après un retour au PDF) retombe sur « toutes les lignes (ZIP) » sans toucher au choix gardé, qui revient avec son type.
    const EXPORT_BATCH_OF = {
      pdf: { zip: 'pdfZip', merged: 'pdfMerged', sheets: 'pdfSheets' },
      // Le PDF protégé n'a ni PDF unique ni planche : pdf-lib, qui assemble des PDF, ne sait pas les chiffrer (lignes grisées dans le menu Exporter).
      pdfProtected: { zip: 'pdfProtectedZip' },
      // Le PDF/A a le PDF unique (réuni, puis passé en PDF/A d'un coup) mais pas la planche : elle est faite pour l'impression (ligne grisée dans le menu Exporter).
      pdfArchive: { zip: 'pdfArchiveZip', merged: 'pdfArchiveMerged' },
      docx: { zip: 'docxZip' },
      pptx: { zip: 'pptxZip' },
      xlsx: { zip: 'xlsxZip', workbook: 'xlsxSingle' },
      md: { zip: 'mdZip' },
      html: { zip: 'htmlZip' },
      htmlFragment: { zip: 'htmlFragmentZip' },
      eml: { zip: 'emlZip' },
      // Le modèle n'est pas une ligne : un seul fichier, jamais de lot (le menu Exporter ne propose rien d'autre que le dire).
      mdTemplate: {},
    };
    const EXPORT_LINES = ['one', 'zip', 'merged', 'sheets', 'workbook'];
    function selectedExportLines(type) {
      const select = document.getElementById('v2-export-lines');
      const lines = select ? select.value : 'one';
      if (EXPORT_LINES.indexOf(lines) === -1 || lines === 'one') return 'one';
      if (EXPORT_BATCH_OF[type][lines]) return lines;
      return EXPORT_BATCH_OF[type].zip ? 'zip' : 'one';
    }
    // Le bouton Exporter (et Alt+P) : ce que le menu coche, dans le type choisi - la ligne affichée, ou tout un lot (avec sa confirmation, comme avant).
    const onExport = () => {
      const type = selectedExportType();
      const lines = selectedExportLines(type);
      if (lines !== 'one') return onExportBatch(EXPORT_BATCH_OF[type][lines]);
      return ({ pdf: onExportPdf, pdfProtected: onExportPdfProtected, pdfArchive: onExportPdfArchive, docx: onExportDocx, pptx: onExportPptx, xlsx: onExportXlsx, md: onExportMd, mdTemplate: onExportMdTemplate, html: onExportHtml, htmlFragment: onExportHtmlFragment, eml: onExportEml })[type]();
    };

    // Mode email (planning/feature-email-mode.md) : construit l'URL mailto: de la ligne courante et l'ouvre par un <a> synthétique plutôt que
    // window.location.href, dont le comportement dans l'iframe sandboxée d'un widget Grist est moins prévisible. Le corps réutilise la résolution du
    // mode Lecture (ReaderMode.render : mêmes bulles et chips que le PDF) plutôt que de la dupliquer ; renderReader() ne fait que mettre à jour
    // #reader-container, jamais visible tant que currentMode reste 'edit' (cf. switchMode).
    async function onCreateEmail() {
      Editor.exitHeaderFooterModeIfActive();
      const record = GristAPI.getCurrentRecord();
      if (!record) { alert(I18n.t('alert.noRecordForEmail')); return; }
      const tableId = getCurrentTableId() || GristAPI.getCurrentTableId();
      setStatus(I18n.t('status.emailGenerating'));
      try {
        const url = await buildMailtoForRecord(record, tableId);
        const check = MailtoExport.checkUrlLength(url);
        if (!check.safe && !(await Dialogs.confirm({
          title: I18n.t('dialog.emailTooLong.title'), message: I18n.t('confirm.emailTooLong', { length: check.length, limit: check.limit }), confirmLabel: I18n.t('common.continue'),
        }))) {
          setStatus('');
          return;
        }
        const link = document.createElement('a');
        link.href = url;
        // Dans le cadre isolé de GFS, un lien mailto: suivi dans le cadre le ferait mourir : nouvel onglet (consigne GFS 011). Seule, rien ne change.
        if (GfsLink.opensInNewTab(url)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        document.body.appendChild(link);
        link.click();
        link.remove();
        setStatus(I18n.t('status.emailCreated'));
      } catch (e) {
        console.error('[main] échec de la création de l’email', e);
        setStatus(I18n.t('status.emailCreationError'), true);
      }
    }

    // Dans une grille, « lignes » devient « valeurs de la table » : une ligne y est déjà une ligne de la grille. Les autres types de modèle gardent
    // leurs mots. Chaque texte concerné a sa variante « …Grid » ici ; `exportText` choisit selon le type du modèle affiché.
    const GRID_WORDING = {
      'toolbar.exportPdfBatch': 'toolbar.exportPdfBatchGrid',
      'toolbar.exportPdfMerged': 'toolbar.exportPdfMergedGrid',
      'exportLines.zip': 'exportLines.zipGrid',
      'exportLines.merged': 'exportLines.mergedGrid',
      'dialog.batchExport.title': 'dialog.batchExport.titleGrid',
      'confirm.batchExport': 'confirm.batchExportGrid',
      'confirm.mergedExport': 'confirm.mergedExportGrid',
      'status.cannotReadRows': 'status.cannotReadRowsGrid',
      'status.noRowsInTable': 'status.noRowsInTableGrid',
      'status.mergedExportDone': 'status.mergedExportDoneGrid',
      'status.mergedExportDoneWithFailures': 'status.mergedExportDoneWithFailuresGrid',
      'status.sheetsExportDone': 'status.sheetsExportDoneGrid',
      'status.sheetsExportDoneWithFailures': 'status.sheetsExportDoneWithFailuresGrid',
      'alert.noRecordForExport': 'alert.noRecordForExportGrid',
    };
    function exportText(key, vars) {
      return I18n.t(GridEditor.isGridType(getCurrentTypeModele()) && GRID_WORDING[key] ? GRID_WORDING[key] : key, vars);
    }

    // Les exports qui n'ont de sens que pour un seul genre de modèle : Word pour un document, Excel pour une grille. La ligne de l'autre genre reste
    // dans la page, grisée (même masquée) ; son clic ne fait rien (cf. onExportRow, au câblage des boutons). Les deux lignes PDF « toutes les lignes » et
    // leurs options du menu Exporter prennent aussi les mots de la grille. Les menus
    // d'export suivent ensuite (syncExportMenus) : le type Word ou Excel que le nouveau modèle ne sait pas faire revient au PDF.
    function syncExportRowsForModelType() {
      const grid = GridEditor.isGridType(getCurrentTypeModele());
      const grey = (id, off) => {
        const row = document.getElementById(id);
        if (!row) return;
        row.classList.toggle('v2-hover-row-disabled', off);
        if (off) row.setAttribute('aria-disabled', 'true'); else row.removeAttribute('aria-disabled');
      };
      ['v2-btn-export-docx', 'v2-btn-export-docx-batch'].forEach(id => grey(id, grid));
      ['v2-btn-export-xlsx', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single'].forEach(id => grey(id, !grid));
      [['v2-btn-export-pdf-batch', 'toolbar.exportPdfBatch'], ['v2-btn-export-pdf-merged', 'toolbar.exportPdfMerged'],
        ['v2-export-lines-zip', 'exportLines.zip'], ['v2-export-lines-merged', 'exportLines.merged']].forEach(([id, key]) => {
        const row = document.getElementById(id);
        if (!row) return;
        const wanted = grid ? GRID_WORDING[key] : key;
        row.textContent = I18n.t(wanted);
      });
      syncExportMenus();
    }

    // Les deux menus d'export d'accord avec le type choisi, l'option de lignes cochée et le genre du modèle ouvert (on grise ou on masque ce qui ne s'applique
    // pas, les lignes restent dans la page) :
    // - menu « Type d'export » (#v2-quality-flyout) : la ligne du type choisi est active ; Word ou Excel, que le modèle ne sait pas faire, est grisé ; la qualité du
    //   PDF (intitulé, filet et trois lignes : `data-export-for="pdf pdfProtected pdfArchive"`) n'est montrée que pour les trois PDF - demande du 12/10 -, la qualité choisie est gardée
    //   et revient avec le PDF (hors des PDF ses lignes sont aussi grisées : un clic dessus ne choisit rien). En PDF protégé et en PDF/A, « Impression navigateur » reste montrée mais grisée
    //   (`data-export-grey-for` : le navigateur imprime, il ne chiffre pas et ne fait pas de PDF/A) et la ligne active est celle qui s'applique, « Vectoriel » si c'était l'impression ;
    // - menu « Exporter » (#v2-export-pdf-flyout) : seules les options du type choisi sont montrées (`data-export-for`, une liste de types) et celle que le bouton
    //   Exporter lance, selectedExportLines, est cochée (`aria-checked`). Une option que le type montre sans pouvoir la faire est grisée, avec sa raison en info-bulle
    //   (`data-export-grey-for` : le PDF unique et l'assemblage en PDF protégé, que pdf-lib assemble sans pouvoir les chiffrer). Sous les options de lignes, pour les deux PDF seulement, la
    //   destination du PDF (intitulé, filet et trois lignes `data-destination`) : `PdfDelivery.sync` coche celle qui s'applique et grise, avec sa raison, les deux qui rangent dans GFS quand GFS
    //   n'héberge pas l'app ou ne répond pas. Elle est dans ce menu et non dans celui du type, dont le bas est à 490 px pour un panneau de 400 ;
    // - le bouton du type est allumé quand ce n'est pas le PDF, pour qu'on sache avant de cliquer sur Exporter que le fichier ne sera pas un PDF.
    // Un type que le modèle ne sait pas faire revient au PDF pour de bon (la liste cachée est remise), de sorte que le modèle suivant ne le retrouve pas.
    function syncExportMenus() {
      const typeSelect = document.getElementById('v2-export-type');
      const qualitySelect = document.getElementById('v2-pdf-quality');
      const typeFlyout = document.getElementById('v2-quality-flyout');
      const exportFlyout = document.getElementById('v2-export-pdf-flyout');
      const typeButton = document.getElementById('v2-btn-quality');
      if (!typeSelect || !qualitySelect || !typeFlyout || !exportFlyout || !typeButton) return;
      if (!exportTypeAvailable(typeSelect.value)) typeSelect.value = 'pdf';
      const type = typeSelect.value;
      // Une ligne grisée dit pourquoi : en info-bulle au survol et, au clic, dans le coin d'état (js/lock-reasons.js, cause « mode »). Une ligne qui ne l'est pas n'en porte pas.
      const grey = (row, off, reason) => {
        row.classList.toggle('v2-hover-row-disabled', off);
        if (off) row.setAttribute('aria-disabled', 'true'); else row.removeAttribute('aria-disabled');
        LockReasons.set(row, 'mode', off && reason ? reason : '');
      };
      typeFlyout.querySelectorAll('.v2-hover-row[data-export-type]').forEach(row => {
        row.classList.toggle('is-active', row.dataset.exportType === type);
        grey(row, !exportTypeAvailable(row.dataset.exportType), exportTypeReason(row.dataset.exportType));
      });
      // `reasons` : pour chaque type que la ligne grise (`data-export-grey-for`), la clé de la phrase qui dit pourquoi.
      const greyedFor = (row, reasons) => ((row.dataset.exportGreyFor || '').split(' ').indexOf(type) !== -1 && reasons[type] ? I18n.t(reasons[type]) : '');
      const pdfType = type === 'pdf' || type === 'pdfProtected' || type === 'pdfArchive';
      // Le navigateur imprime un PDF ordinaire : ni chiffré ni PDF/A. Pour ces deux types la ligne « Impression navigateur » est grisée et la ligne active est « Vectoriel ».
      const printOff = type === 'pdfProtected' || type === 'pdfArchive';
      typeFlyout.querySelectorAll('.v2-hover-row[data-quality]').forEach(row => {
        const applied = printOff && qualitySelect.value === 'browser-print' ? 'native' : qualitySelect.value;
        row.classList.toggle('is-active', pdfType && row.dataset.quality === applied);
        const notForType = greyedFor(row, { pdfProtected: 'quality.protectedOff', pdfArchive: 'quality.archiveOff' });
        grey(row, !pdfType || !!notForType, notForType || I18n.t('lock.exportPdfOnly'));
      });
      // Où va le PDF (js/pdf-delivery.js) : télécharger, ranger dans GFS ou les deux ; les deux lignes qui rangent sont grisées sans GFS.
      PdfDelivery.sync(exportFlyout);
      [typeFlyout, exportFlyout].forEach(flyout => flyout.querySelectorAll('[data-export-for]').forEach(el => {
        el.hidden = el.dataset.exportFor.split(' ').indexOf(type) === -1;
      }));
      const lines = selectedExportLines(type);
      // La case « Joindre à la ligne » (js/row-attachment.js) : grisée, avec sa raison, sans colonne utilisable, en lecture seule ou pour un PDF qui réunit plusieurs lignes.
      RowAttachment.sync(exportFlyout, lines);
      exportFlyout.querySelectorAll('.v2-hover-row[data-export-lines]').forEach(row => {
        row.setAttribute('aria-checked', row.dataset.exportLines === lines ? 'true' : 'false');
        const linesOff = greyedFor(row, { pdfProtected: 'exportLines.protectedOff', pdfArchive: 'exportLines.archiveOff' });
        grey(row, !!linesOff, linesOff);
      });
      typeButton.classList.toggle('active', type !== 'pdf');
      // Le type d'export décide si l'éditeur d'un modèle email écrit le texte brut du lien mailto: ou la mise en forme d'un .eml (js/main.js:syncEmailEditorMode).
      document.dispatchEvent(new CustomEvent('pp:exportTypeSynced', { detail: { type } }));
    }

    // Caractères invalides dans un nom de fichier ZIP ou Windows : une valeur de cellule comme « Dupont/Fils » casserait l'arborescence du ZIP si elle
    // n'était pas filtrée.
    function sanitizeFilenamePart(name) {
      return String(name || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
    }

    // Ajoute un suffixe « (2) », « (3) »… si ce nom a déjà servi dans ce lot : deux lignes peuvent résoudre au même nom (gabarit sans variable, ou
    // variable identique), et la seconde écraserait la première dans le ZIP.
    function uniqueZipFilename(baseName, usedNames) {
      let name = baseName;
      let n = 2;
      while (usedNames.has(name)) { name = baseName + ' (' + n + ')'; n++; }
      usedNames.add(name);
      return name;
    }

    // Export en lot : une ligne = un fichier, regroupés dans une archive ZIP (PDF, DOCX ou classeur Excel), ou mis bout à bout dans un seul PDF
    // (js/pdf-merge.js : même rendu par ligne que le ZIP, une nouvelle page par ligne) ou un seul classeur Excel (une feuille par ligne,
    // js/xlsx-export.js). Lit les lignes de la vue Grist, ou toute la table via docApi (cf. readBatchRows).
    // Ce qui change d'un export à l'autre : ses textes (clés i18n), le nom des fichiers, la fonction qui rend une ligne et ses marges (points pour le
    // PDF, twips pour le DOCX, aucune pour l'Excel dont la feuille reprend la page du modèle) et ses bibliothèques (`loadLibs` : l'archive ZIP n'a
    // besoin que de JSZip, ~0,1 Mo, pas du lot PDF de ~4 Mo). Le reste (lecture des lignes, confirmation, boucle, archive, téléchargement) est commun.
    // - `single` : pas de blob par ligne, le classeur unique reçoit une feuille par ligne.
    // - `grid` : le genre de modèle que l'export sait faire (faux : un document, Word ; vrai : une grille, Excel ; absent : les deux, PDF). Une ligne
    //   dont « Modèle selon la ligne » désigne un modèle d'un autre genre n'est pas générée (comptée en échec).
    // - `pageOptions` : la page d'une feuille Excel, lue sur les réglages de page posés (ceux de l'écran, ou ceux du modèle d'une ligne, cf.
    //   templateSource).
    // - `engines` : les moteurs de js/export-engines.js que l'export appelle. Ils ne se chargent qu'au premier export, et avant tout le reste : le plan du
    //   lot lit déjà la page de l'Excel, et la fenêtre des planches la géométrie des feuilles.
    const PDF_BATCH = {
      label: 'PDF', loading: 'status.loadingPdfLibs', loadError: 'status.pdfLibsLoadError', progress: 'status.batchExportProgress', noFile: 'status.exportError',
      engines: ['pdf'], margins: () => PageLayout.getMarginsPt(),
      // La date du dernier export PDF s'écrit pour les lignes du fichier (js/export-date.js) : les trois lots PDF, ZIP, PDF unique et planche.
      stampsExportDate: true,
      // Le fichier d'un lot PDF peut se ranger dans GFS (js/pdf-delivery.js) au lieu de se télécharger, ou en plus : le PDF unique et la planche d'un bloc, l'archive ZIP PDF par PDF.
      shelvable: true,
      // Le PDF d'une ligne sait si son modèle est une grille (un lot « Modèle selon la ligne » peut mêler grilles et documents), et la qualité du menu Type d'export
      // choisie au départ du lot (`imageQuality`, cf. openBatchSink) : 'light' ramène les images à leur définition.
      // `docFields` : ceux d'un PDF protégé (js/pdf-protection.js), absents d'un PDF ordinaire. Le PDF d'une présentation ne signale aucune page blanche : chacune est une diapositive
      // (SlidesEntry.showsEveryPage).
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins, _pageOptions, typeModele, imageQuality, docFields) => PdfExport.getNativePdfBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins, GridEditor.isGridType(typeModele), imageQuality, docFields, SlidesEntry.showsEveryPage(typeModele)),
    };
    const BATCH_EXPORTS = {
      pdfZip: Object.assign({}, PDF_BATCH, {
        confirm: 'confirm.batchExport', done: 'status.batchExportDone', doneWithFailures: 'status.batchExportDoneWithFailures',
        entryExt: '.pdf', fileSuffix: '-export-pdf.zip',
        loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await ExportCommon.ensureJsZipLoaded(); },
      }),
      // « PDF protégé » en lot : les PDF d'une archive ZIP, chacun chiffré avec le même mot de passe (`protect` : la fenêtre js/pdf-protection-dialog.js tient lieu de confirmation).
      pdfProtectedZip: Object.assign({}, PDF_BATCH, {
        protect: true, confirm: 'confirm.batchExport', done: 'status.batchExportDoneProtected', doneWithFailures: 'status.batchExportDoneWithFailuresProtected',
        entryExt: '.pdf', fileSuffix: '-export-pdf-protege.zip',
        loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await ExportCommon.ensureJsZipLoaded(); },
      }),
      // « PDF/A (archivage) » en lot : les PDF d'une archive ZIP, chacun passé en PDF/A-2b (`archive` : openBatchSink pose `{ archive: true }` sur chaque ligne, js/pdf-export.js).
      pdfArchiveZip: Object.assign({}, PDF_BATCH, {
        archive: true, engines: ['pdf', 'archive'], confirm: 'confirm.batchExport', done: 'status.batchExportDoneArchive', doneWithFailures: 'status.batchExportDoneWithFailuresArchive',
        entryExt: '.pdf', fileSuffix: '-export-pdfa.zip',
        loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await ExportCommon.ensureJsZipLoaded(); },
      }),
      pdfMerged: Object.assign({}, PDF_BATCH, {
        confirm: 'confirm.mergedExport', done: 'status.mergedExportDone', doneWithFailures: 'status.mergedExportDoneWithFailures',
        splitDone: 'status.splitMergedDone', splitDoneWithFailures: 'status.splitMergedDoneWithFailures',
        merged: true, fileSuffix: '-export.pdf', engines: ['pdf', 'merge'],
        loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
      }),
      // « PDF/A (archivage) » en un seul PDF : les mêmes PDF par ligne que le PDF unique, réunis par pdf-lib, puis le fichier entier passé en PDF/A-2b d'un coup (`archive`, openBatchSink :
      // la réunion ne garde pas la description XMP des PDF d'origine, c'est donc le fichier réuni qui se convertit, une seule fois).
      pdfArchiveMerged: Object.assign({}, PDF_BATCH, {
        archive: true, confirm: 'confirm.mergedExport', done: 'status.mergedExportDoneArchive', doneWithFailures: 'status.mergedExportDoneWithFailuresArchive',
        splitDone: 'status.splitMergedDoneArchive', splitDoneWithFailures: 'status.splitMergedDoneWithFailuresArchive',
        merged: true, fileSuffix: '-export-pdfa.pdf', engines: ['pdf', 'merge', 'archive'],
        loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
      }),
      // Assemblage avant impression (js/sheet-assembly-dialog.js, js/sheet-layout.js) : les mêmes PDF par ligne que le PDF unique, posés sur des
      // feuilles A4 ou A3 (js/pdf-merge.js:createSheets). La fenêtre de réglage tient lieu de confirmation (`sheets`) ; le fichier sort sous le nom
      // `<table>-assemblage.pdf`.
      pdfSheets: Object.assign({}, PDF_BATCH, {
        done: 'status.sheetsExportDone', doneWithFailures: 'status.sheetsExportDoneWithFailures',
        splitDone: 'status.splitSheetsDone', splitDoneWithFailures: 'status.splitSheetsDoneWithFailures',
        merged: true, sheets: true, fileSuffix: '-assemblage.pdf', engines: ['pdf', 'merge', 'sheets'],
        loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
      }),
      docxZip: {
        label: 'DOCX', confirm: 'confirm.batchExportDocx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressDocx',
        noFile: 'status.exportErrorDocx', done: 'status.batchExportDoneDocx', doneWithFailures: 'status.batchExportDoneWithFailuresDocx',
        entryExt: '.docx', fileSuffix: '-export-docx.zip', margins: () => PageLayout.getMarginsTwip(), grid: false, engines: ['docx'],
        loadLibs: () => ExportCommon.ensureJsZipLoaded(),
        renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => DocxExport.getDocxBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
      },
      // Un fichier .pptx par ligne, dans une archive ZIP (js/pptx-export.js) : la page du modèle est celle des diapositives, `keepProps` garde le repère de chacune (transition, fond, notes).
      pptxZip: {
        label: 'PowerPoint', confirm: 'confirm.batchExportPptx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressPptx',
        noFile: 'status.exportErrorPptx', done: 'status.batchExportDonePptx', doneWithFailures: 'status.batchExportDoneWithFailuresPptx',
        entryExt: '.pptx', fileSuffix: '-export-pptx.zip', margins: () => PageLayout.getMarginsPt(), grid: false, engines: ['pptx'], keepProps: true,
        loadLibs: () => ExportCommon.ensureJsZipLoaded(),
        renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => PptxExport.getPptxBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
      },
      xlsxZip: {
        label: 'Excel', confirm: 'confirm.batchExportXlsx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
        noFile: 'status.exportErrorXlsx', done: 'status.batchExportDoneXlsx', doneWithFailures: 'status.batchExportDoneWithFailuresXlsx',
        entryExt: '.xlsx', fileSuffix: '-export-xlsx.zip', grid: true, engines: ['xlsx'], pageOptions: () => XlsxExport.pageOptionsFromLayout(),
        loadLibs: async () => { await ExportCommon.ensureJsZipLoaded(); await XlsxExport.ensureExcelLibLoaded(); },
        renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins, pageOptions) => XlsxExport.getXlsxBlobForRecord(html, tableId, row, filenameTemplate, pageOptions || undefined),
      },
      // Un fichier .md par ligne, dans une archive ZIP : ni marges ni page, le texte seul (js/markdown-export.js) ; comme le Word, il ne fait que des documents.
      mdZip: {
        label: 'Markdown', confirm: 'confirm.batchExportMd', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressMd',
        noFile: 'status.exportErrorMd', done: 'status.batchExportDoneMd', doneWithFailures: 'status.batchExportDoneWithFailuresMd',
        entryExt: '.md', fileSuffix: '-export-md.zip', grid: false, engines: ['md'],
        loadLibs: () => ExportCommon.ensureJsZipLoaded(),
        renderRow: (html, tableId, row, filenameTemplate, headerFooterData) => MarkdownExport.getMarkdownBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData),
      },
      // Un fichier .html par ligne, dans une archive ZIP : le fichier complet à déposer (`htmlZip`) ou le contenu seul à coller (`htmlFragmentZip`, dont les fichiers portent « -fragment »).
      // Ni marges ni page (js/html-export.js) ; comme le Word et le Markdown, ils ne font que des documents.
      htmlZip: {
        label: 'HTML', confirm: 'confirm.batchExportHtml', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressHtml',
        noFile: 'status.exportErrorHtml', done: 'status.batchExportDoneHtml', doneWithFailures: 'status.batchExportDoneWithFailuresHtml',
        entryExt: '.html', fileSuffix: '-export-html.zip', grid: false, engines: ['html'],
        loadLibs: () => ExportCommon.ensureJsZipLoaded(),
        renderRow: (html, tableId, row, filenameTemplate, headerFooterData) => HtmlExport.getHtmlBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData),
      },
      htmlFragmentZip: {
        label: 'HTML', confirm: 'confirm.batchExportHtml', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressHtml',
        noFile: 'status.exportErrorHtml', done: 'status.batchExportDoneHtml', doneWithFailures: 'status.batchExportDoneWithFailuresHtml',
        entryExt: '-fragment.html', fileSuffix: '-export-html-fragment.zip', grid: false, engines: ['html'],
        loadLibs: () => ExportCommon.ensureJsZipLoaded(),
        renderRow: (html, tableId, row, filenameTemplate, headerFooterData) => HtmlExport.getHtmlBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, { fragment: true }),
      },
      // Un fichier .eml par ligne, dans une archive ZIP (js/eml-export.js) : le champ PJ de chaque ligne en pièces jointes. Les champs du modèle de la ligne (`doc.source.email`, le dernier argument) sont ceux du modèle qui fait son document.
      emlZip: {
        label: 'Email', confirm: 'confirm.batchExportEml', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressEml',
        noFile: 'status.exportErrorEml', done: 'status.batchExportDoneEml', doneWithFailures: 'status.batchExportDoneWithFailuresEml',
        entryExt: '.eml', fileSuffix: '-export-eml.zip', grid: false, engines: ['html'],
        loadLibs: () => ExportCommon.ensureJsZipLoaded(),
        renderRow: (html, tableId, row, filenameTemplate, headerFooterData, _margins, _pageOptions, _typeModele, _imageQuality, _docFields, emailFields) => EmlExport.getEmlBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, emailFields),
      },
      xlsxSingle: {
        label: 'Excel', confirm: 'confirm.singleWorkbookExport', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
        noFile: 'status.exportErrorXlsx', done: 'status.singleWorkbookDone', doneWithFailures: 'status.singleWorkbookDoneWithFailures',
        splitDone: 'status.splitSingleWorkbookDone', splitDoneWithFailures: 'status.splitSingleWorkbookDoneWithFailures',
        single: true, fileSuffix: '-export.xlsx', grid: true, engines: ['xlsx'], pageOptions: () => XlsxExport.pageOptionsFromLayout(),
        loadLibs: () => XlsxExport.ensureExcelLibLoaded(),
      },
    };

    // Les documents d'un export en lot, dans l'ordre : un par ligne, ou un par valeur d'une liste réglée « Un document par valeur » (js/list-split.js ;
    // un macro-modèle assemble ici le HTML de chaque ligne, gardé pour le rendu). Sans bulle réglée ainsi dans le modèle, ses en-têtes ni ses modèles,
    // rien n'est lu ni calculé de plus : un document par ligne, `variant` nul. Une ligne dont le plan échoue garde son document. Chaque document garde
    // sa `source` : le modèle qui le fait (voir ci-dessous).
    async function planExportJobs(rows, { tableId, sourceOf, templatesCache }) {
      const jobs = [];
      for (const row of rows) {
        const source = await sourceOf(row);
        if (!sourceMaySplit(source, templatesCache)) { jobs.push({ row, source, variant: null }); continue; }
        let rowHtml;
        let plan = null;
        try {
          rowHtml = await sourceRowHtml(source, tableId, row, templatesCache);
          plan = await ListSplit.plan(ListSplit.partsOf(rowHtml, source.headerFooterData), tableId, row);
        } catch (e) {
          console.error('[main] export en lot : plan « un document par valeur » impossible pour la ligne', row.id, e);
        }
        if (!plan) { jobs.push({ row, source, variant: null }); continue; }
        plan.variants.forEach(variant => jobs.push({ row, source, rowHtml, variant }));
      }
      return jobs;
    }

    // Ce qu'un export en lot lit du modèle qui fait le document d'une ligne, sa « source » : son HTML (pour un macro-modèle, sa composition, assemblée
    // ligne par ligne car le choix des annexes dépend des valeurs de chaque ligne, cf. MacroTemplates), ses en-têtes et pieds de page, ses marges (dans
    // l'unité du moteur de l'export), le nom de ses fichiers, son genre. Celle du modèle ouvert est lue une fois pour tout le lot ; sans « Modèle selon
    // la ligne » (js/row-template.js), toutes les lignes l'ont. Avec lui, une ligne que ses règles envoient vers un autre modèle a la source de ce
    // modèle (rowSourceResolver).
    function openTemplateSource(cfg) {
      const isMacro = getCurrentTypeModele() === 'macro';
      return {
        typeModele: getCurrentTypeModele(), isMacro, html: isMacro ? null : SlidesEntry.outputHtml(getCurrentTypeModele(), Editor.getHTML(), { keepProps: !!cfg.keepProps, anchors: writesSlideAnchors(cfg), theme: PageLayout.getTheme() }), macroSlots: isMacro ? getCurrentMacroSlots() : null, perModelSense: isMacro && PageLayout.isOrientationAuto(), anchors: writesSlideAnchors(cfg),
        headerFooterData: Editor.getHeaderFooterData(), filenameTemplate: getPdfFilenameTemplate(), margins: cfg.margins ? cfg.margins() : null, pageOptions: null,
        email: getCurrentTypeModele() === 'email' ? getEmailFields() : null,
      };
    }

    // La source d'un autre modèle de la liste, tel qu'il est enregistré : rien n'est chargé dans l'éditeur ni changé à l'écran. Sa page est lue par les
    // fonctions de l'écran (PageLayout borne les marges et les convertit) : posée le temps de la lecture et rendue aussitôt, sans `await` entre les
    // deux - ni l'une ni l'autre n'est jamais affichée. Ses en-têtes et pieds passent par l'export comme ceux de l'écran (leur HTML y est assaini). Une présentation sans format à elle a la page
    // d'une diapositive, comme à l'écran, et ses sauts de page marqués comme ceux de l'écran (js/slides-entry.js).
    function templateSource(tpl, cfg) {
      const isMacro = tpl.typeModele === 'macro';
      const onScreen = PageLayout.getMarginsMm();
      let margins = null;
      let pageOptions = null;
      let perModelSense = false;
      PageLayout.setMarginsMm(SlidesEntry.pageFor(tpl.typeModele, tpl.marginsMm));
      try {
        margins = cfg.margins ? cfg.margins() : null;
        pageOptions = cfg.pageOptions ? cfg.pageOptions() : null;
        perModelSense = isMacro && PageLayout.isOrientationAuto();
      } finally { PageLayout.setMarginsMm(onScreen); }
      return {
        typeModele: tpl.typeModele || 'document', isMacro, html: isMacro ? null : SlidesEntry.outputHtml(tpl.typeModele, LinkedTable.resolveHtml(EditorCore.getEditor(), tpl.contenu || ''), { keepProps: !!cfg.keepProps, anchors: writesSlideAnchors(cfg), theme: tpl.marginsMm && tpl.marginsMm.theme, stored: tpl.marginsMm || null }), macroSlots: isMacro ? (tpl.macroSlots || { slots: [] }) : null, perModelSense, anchors: writesSlideAnchors(cfg),
        headerFooterData: tpl.headerFooter, filenameTemplate: String(tpl.nomFichierPDF || '').trim(), margins, pageOptions,
        email: tpl.typeModele === 'email' ? { objet: tpl.objet, destinataires: tpl.destinataires, cc: tpl.cc, cci: tpl.cci, pj: tpl.pj } : null,
      };
    }

    // La source de chaque ligne d'un lot. Sans « Modèle selon la ligne » : celle du modèle ouvert, tout de suite, rien n'est lu de plus. Avec lui :
    // celle du modèle que ses règles donnent à cette ligne (RowTemplate.pick : les mêmes règles que quand la ligne s'ouvre à l'écran). Aucune ne la
    // désigne et le réglage garde le modèle ouvert, ou le modèle désigné est déjà ouvert : celui de l'écran, avec ce qu'il n'a pas encore enregistré.
    function rowSourceResolver(tableId, cfg, openSource) {
      if (!RowTemplate.isActive()) return async () => openSource;
      const byTemplate = new Map();
      return async row => {
        let id = null;
        try { id = await RowTemplate.pick(row, tableId); }
        catch (e) { console.error('[main] export en lot : modèle de la ligne impossible à choisir, celui de l’écran est gardé', row.id, e); }
        if (id == null || Templates.isCurrent(id)) return openSource;
        if (!byTemplate.has(id)) {
          const tpl = Templates.byId(id);
          byTemplate.set(id, tpl ? templateSource(tpl, cfg) : openSource);
        }
        return byTemplate.get(id);
      };
    }

    // Le HTML brut du document de cette ligne pour cette source (un macro-modèle : ses annexes, choisies avec les valeurs de la ligne).
    function sourceRowHtml(source, tableId, row, templatesCache) {
      return source.isMacro ? MacroTemplates.buildConcatenatedHtml(source.macroSlots, tableId, row, templatesCache, Object.assign(perModelOption(source.perModelSense), { anchors: !!source.anchors })) : source.html;
    }

    // Cette source peut-elle se découper en plusieurs documents (« Un document par valeur ») ? Sans bulle réglée ainsi dans le modèle, ses en-têtes ni
    // ses modèles (ceux de la liste, pour un macro-modèle), non : le plan n'est même pas calculé. Une fois par source.
    function sourceMaySplit(source, templatesCache) {
      if (source.maySplit === undefined) {
        const footerParts = ListSplit.partsOf('', source.headerFooterData).slice(1);
        source.maySplit = ListSplit.hasMarker(footerParts) || (source.isMacro ? templatesCache.some(tpl => ListSplit.hasMarker([tpl.contenu])) : ListSplit.hasMarker([source.html]));
      }
      return source.maySplit;
    }

    // Les lignes d'un export en lot : celles de la vue Grist - ses filtres, son tri -, celles de la vue d'à côté à laquelle le widget est relié par « Sélectionner par » (ses filtres
    // enregistrés, js/view-source.js), ou toute la table (docApi, forme brute), au choix quand la vue n'en montre qu'une partie (js/batch-scope.js) ; ou `only.record` seul. null : rien à
    // exporter, ou la personne renonce ; le coin d'état dit pourquoi dans le premier cas. Sinon { rows, linked } : `linked` est le nom de la vue d'à côté dont viennent les lignes, '' sinon.
    async function readBatchRows(cfg, tableId, only) {
      if (only) return { rows: [only.record], linked: '' };
      let rows;
      try { rows = await GristAPI.fetchTableRows(tableId); }
      catch (e) {
        console.error('[main] export ' + cfg.label + ' en lot : échec de lecture de la table', e);
        setStatus(exportText('status.cannotReadRows'), true);
        return null;
      }
      if (!rows.length) { setStatus(exportText('status.noRowsInTable', { table: tableId }), true); return null; }
      const linked = await ViewSource.linkedRows(tableId, rows);
      const picked = await BatchScope.pick(rows, await BatchScope.viewRowIds(tableId), { table: tableId, grid: GridEditor.isGridType(getCurrentTypeModele()), linked });
      return picked && { rows: picked.rows, linked: picked.linked || '' };
    }

    // Au-delà de ce nombre de documents, l'export d'une seule ligne que « Un document par valeur » découpe demande d'abord (deux listes de 20
    // valeurs en font 400, deux de 100 en font 10 000, dans une archive construite en mémoire).
    const SPLIT_CONFIRM_FROM = 50;

    // L'accord avant un export en lot : `{}`, ou `{ layout }` pour les planches, qui se règlent dans leur propre fenêtre (feuille, emplacements, traits
    // de coupe) : elle tient lieu de confirmation. Un export seul n'en demande pas, son clic vaut accord, sauf quand sa ligne fait plus de
    // SPLIT_CONFIRM_FROM documents. null : la personne renonce.
    async function confirmBatch(cfg, { only, tableId, rowCount, jobCount, splitting, protection, linkedView, confirmed }) {
      // Un lot « PDF protégé » : la fenêtre du mot de passe tient lieu de confirmation (elle dit combien de PDF partent). Un document que « Un document par valeur » découpe l'a
      // déjà posée au départ de l'export (exportRecordAs, `protection`) : ici seule la question de ses nombreux documents peut encore se poser.
      if (cfg.protect && !protection) {
        const asked = await PdfProtectionDialog.open({ batch: true, count: jobCount, table: tableId, grid: GridEditor.isGridType(getCurrentTypeModele()) });
        if (!asked) setStatus(I18n.t('status.exportCancelled'));
        return asked ? { protection: asked } : null;
      }
      const setup = cfg.protect ? { protection } : {};
      if (only) {
        if (jobCount <= SPLIT_CONFIRM_FROM) return setup;
        const proceed = await Dialogs.confirm({ title: I18n.t('varList.split.label'), message: I18n.t('confirm.splitExport', { documents: jobCount }), confirmLabel: I18n.t('common.generate') });
        // « Génération en cours… » (exportRecordAs) ne doit pas rester affiché derrière un renoncement.
        if (!proceed) setStatus(I18n.t('status.exportCancelled'));
        return proceed ? setup : null;
      }
      if (cfg.sheets) return (await SheetAssemblyDialog.open({ count: jobCount, table: tableId, grid: GridEditor.isGridType(getCurrentTypeModele()) })) || null;
      // La fenêtre du contrôle d'avant lot vient de demander « Générer quand même » ou « sans ces lignes » : une seconde confirmation de suite ne ferait que répéter la question.
      if (confirmed) return setup;
      const note = (splitting ? '\n\n' + I18n.t('confirm.splitNote', { documents: jobCount }) : '') + (linkedView ? '\n\n' + I18n.t('confirm.linkedViewNote', { name: linkedView }) : '');
      const proceed = await Dialogs.confirm({ title: exportText('dialog.batchExport.title'), message: exportText(cfg.confirm, { count: rowCount, table: tableId }) + note, confirmLabel: I18n.t('common.generate') });
      return proceed ? setup : null;
    }

    // Où un export en lot range ses documents : une archive ZIP (un fichier par document), un PDF unique (`merged`, ou `sheets` : posés sur des
    // planches) ou un classeur Excel unique (`single`). `add` reçoit le document tout prêt et rend, pour un PDF, `{ blankPages }` - les pages blanches de ce document ;
    // `finish` rend le fichier, `finishing` dit ce qui se passe pendant ce temps. `sheetCount` ne se lit qu'une fois `finish` terminé.
    async function openBatchSink(cfg, tableId, sheetSetup) {
      if (cfg.single) {
        const workbook = await XlsxExport.createSingleWorkbook();
        return {
          add: doc => workbook.appendRecord(doc.html, tableId, doc.row, doc.source.filenameTemplate, doc.valueName, doc.source.pageOptions || undefined),
          finish: () => workbook.toBlob(),
          finishing: 'status.xlsxAssembling',
        };
      }
      // La qualité choisie au départ de l'export vaut pour tout le lot : un changement de ligne dans le menu pendant qu'il tourne n'y change rien.
      const imageQuality = pdfImageQuality();
      // Un lot protégé : le mot de passe et les autorisations de la fenêtre pour chaque PDF - le mot de passe de sa ligne en mode « Un par ligne », et c'est cette ligne qui échoue, jamais
      // le lot, quand sa cellule ne sert pas -, chacun avec son propre mot de passe « propriétaire » tiré au hasard.
      const protection = sheetSetup && sheetSetup.protection;
      // Un lot PDF/A : chaque PDF d'une archive ZIP est passé en PDF/A par sa ligne (js/pdf-export.js) ; les lignes d'un PDF unique, elles, restent ordinaires - c'est le fichier réuni qui se convertit à la fin (`finish`).
      const rowFields = protection ? doc => PdfProtection.docFields(PdfProtection.settingsForRow(protection, doc.row)) : (cfg.archive && !cfg.merged ? () => ARCHIVE_DOC_FIELDS : () => undefined);
      const render = doc => cfg.renderRow(doc.html, tableId, doc.row, doc.source.filenameTemplate, doc.headerFooterData, doc.source.margins, doc.source.pageOptions, doc.source.typeModele, imageQuality, rowFields(doc), doc.source.email);
      if (cfg.merged) {
        const pdf = await (cfg.sheets ? PdfMerge.createSheets(tableId, sheetSetup.layout) : PdfMerge.create(tableId));
        return {
          add: async doc => {
            const { blob, blankPages } = await render(doc);
            await pdf.append(blob);
            return { blankPages };
          },
          finish: async () => (cfg.archive ? PdfArchive.convert(await pdf.toBlob()) : pdf.toBlob()),
          finishing: cfg.sheets ? 'status.sheetsAssembling' : (cfg.archive ? 'status.pdfArchiveMerging' : 'status.pdfMerging'),
          sheetCount: () => (cfg.sheets ? pdf.sheetCount : 0),
        };
      }
      const zip = new JSZip();
      const usedNames = new Set();
      // Les PDF de l'archive, un à un, avec la ligne de chacun : GFS garde des PDF, pas des archives (PdfDelivery les range l'un après l'autre). Les lots qui ne sont pas des PDF n'en gardent rien.
      const files = [];
      return {
        add: async doc => {
          const { blob, filename, blankPages } = await render(doc);
          const base = (sanitizeFilenamePart(filename) || ('document-' + doc.row.id)) + (doc.valueName ? ' - ' + doc.valueName : '');
          const entry = uniqueZipFilename(base, usedNames) + cfg.entryExt;
          zip.file(entry, blob);
          if (cfg.shelvable) files.push({ name: entry, blob, rowId: doc.row.id });
          return { blankPages };
        },
        // Sans argument, l'archive entière ; avec `subset` (des éléments de `files`), l'archive de ces seuls fichiers : ce que GFS n'a pas gardé.
        finish: subset => {
          if (!subset) return zip.generateAsync({ type: 'blob' });
          const part = new JSZip();
          subset.forEach(file => part.file(file.name, file.blob));
          return part.generateAsync({ type: 'blob' });
        },
        files,
        finishing: 'status.zipCompressing',
      };
    }

    // `only` (facultatif) : la ligne courante seule - { record, plan, html } -, quand son document se découpe en plusieurs (« Un document par valeur »,
    // js/list-split.js) : une archive de ses documents, sans lire la table ni demander confirmation (le clic d'un export seul vaut accord), nommée
    // comme la ligne.
    // `preset` (facultatif) : ce que l'export seul a déjà demandé avant de partir en lot - { protection }, les réglages de la fenêtre « PDF protégé ».
    async function onExportBatch(kind, only, preset) {
      const cfg = BATCH_EXPORTS[kind];
      Editor.exitHeaderFooterModeIfActive();
      const tableId = getCurrentTableId() || GristAPI.getCurrentTableId();
      if (!tableId) { setStatus(I18n.t('status.currentTableNotFound'), true); return; }
      try {
        await ExportEngines.ensure(cfg.engines);
      } catch (e) {
        console.error('[main] export ' + cfg.label + ' en lot : échec de chargement du moteur', e);
        setStatus(I18n.t(cfg.loadError), true);
        return;
      }
      const picked = await readBatchRows(cfg, tableId, only);
      if (!picked) return;
      const { linked } = picked;
      let rows = picked.rows;

      const planned = await planBatchJobs(cfg, tableId, only, rows);
      const { openSource, templatesCache } = planned;
      let { jobs, splitting } = planned;
      // Le contrôle des lignes d'avant lot : une fenêtre seulement quand une ligne a un problème. « Générer sans ces lignes » retire ces lignes du lot, que la confirmation compte ensuite.
      const checked = await precheckBatch(cfg, tableId, only, jobs, { openSource, templatesCache });
      if (!checked) return;
      if (checked.jobs !== jobs) {
        jobs = checked.jobs;
        const kept = new Set(jobs.map(job => job.row.id));
        rows = rows.filter(row => kept.has(row.id));
        splitting = jobs.some(job => ListSplit.hasPins(job.variant));
      }
      const sheetSetup = await confirmBatch(cfg, { only, tableId, rowCount: rows.length, jobCount: jobs.length, splitting, protection: preset && preset.protection, linkedView: linked, confirmed: checked.confirmed });
      if (!sheetSetup) return;

      // Ni JSZip ni le lot PDF ne sont chargés d'office au démarrage du widget : `JSZip` n'existe pas tant que ceci n'a pas été attendu au moins une
      // fois.
      setStatus(I18n.t(cfg.loading));
      try {
        await cfg.loadLibs();
      } catch (e) {
        console.error('[main] export ' + cfg.label + ' en lot : échec de chargement des bibliothèques', e);
        setStatus(I18n.t(cfg.loadError), true);
        return;
      }

      const sink = await openBatchSink(cfg, tableId, sheetSetup);
      const { ok, failed, cancelled, stoppedAt, failures, blankRows, exportedIds } = await runBatchJobs(cfg, sink, jobs, { tableId, openSource, templatesCache });
      // « Arrêter » (la pastille du lot) dit où le lot s'est arrêté ; « Annuler » sur une fenêtre, simplement que l'export est annulé. Dans les deux cas rien n'est téléchargé ni daté.
      if (cancelled) { setStatus(stoppedAt === null ? I18n.t('status.exportCancelled') : I18n.t('status.batchStopped', { done: stoppedAt, total: jobs.length })); return; }
      // Les lignes en échec, listées avec leur raison une fois le fichier téléchargé (ou, quand aucune n'a pu l'être, tout de suite) : la fenêtre se
      // referme avant que l'export libère ses contrôles.
      if (!ok) { setStatus(I18n.t(cfg.noFile), true); await BatchFailures.show(failures, { ok, format: cfg.label }); return; }

      await finishBatchExport(cfg, sink, { only, tableId, rows, openSource, splitting, ok, failed, exportedIds });
      await BatchFailures.show(failures, { ok, format: cfg.label });
      // Les PDF qui ont des pages blanches sont dans le fichier téléchargé : la fin du lot dit lesquels, pour les corriger et les refaire.
      await BatchFailures.showBlankPages(blankRows);
    }

    // Les documents à générer : un par ligne, ou un par valeur quand « Un document par valeur » découpe. Rend aussi ce que leur génération relit
    // (le modèle ouvert, le cache des modèles) et si l'un d'eux est un découpage.
    async function planBatchJobs(cfg, tableId, only, rows) {
      // Pas de HTML unique pour tout le lot : pour un macro-modèle, le choix des annexes dépend des valeurs de chaque ligne (cf. MacroTemplates), donc
      // la concaténation est refaite ligne par ligne dans la boucle de runBatchJobs ; un modèle normal garde le même gabarit pour toutes les lignes,
      // seule la résolution des #Variable change. Pas de modèle unique non plus quand « Modèle selon la ligne » est réglé : chaque ligne a la source
      // du modèle que ses règles lui donnent (rowSourceResolver), comme à l'écran.
      const templatesCache = LinkedTable.resolveTemplates(EditorCore.getEditor(), Templates.getCached());
      const openSource = openTemplateSource(cfg);
      const sourceOf = only ? async () => openSource : rowSourceResolver(tableId, cfg, openSource);
      // Compté avant la confirmation : « Un document par valeur » fait plus de documents que de lignes.
      const jobs = only ? only.plan.variants.map(variant => ({ row: only.record, source: openSource, rowHtml: only.html, variant }))
        : await planExportJobs(rows, { tableId, sourceOf, templatesCache });
      const splitting = jobs.some(job => ListSplit.hasPins(job.variant));
      return { openSource, templatesCache, jobs, splitting };
    }

    // Le contrôle d'avant lot (js/batch-precheck.js) : les lignes sont parcourues sans rien générer, et la fenêtre ne s'ouvre que s'il y a un problème. Rend { jobs, confirmed } - les documents à générer (sans
    // les lignes que la personne a laissées de côté) et `confirmed` : la fenêtre vient de poser la question, la confirmation ordinaire ne la redemande pas - ou null : la personne annule ou arrête le contrôle (le coin
    // d'état le dit). Un export d'une seule ligne (`only`) et un lot d'un seul document ne sont pas contrôlés : la ligne est celle que la personne voit.
    async function precheckBatch(cfg, tableId, only, jobs, { openSource, templatesCache }) {
      if (only || jobs.length < 2) return { jobs, confirmed: false };
      const nameOf = cfg.merged || cfg.single ? null : async job => {
        if (!job.source.filenameTemplate) return null;
        const filename = sanitizeFilenamePart(await ReaderMode.resolveFilename(job.source.filenameTemplate, tableId, job.row));
        const valueName = job.variant && job.variant.label ? sanitizeFilenamePart(job.variant.label) : '';
        return { base: (filename || ('document-' + job.row.id)) + (valueName ? ' - ' + valueName : ''), empty: !filename };
      };
      const { problems, stopped } = await BatchPrecheck.scan(jobs, {
        tableId, nameOf,
        htmlOf: async job => ListSplit.pin(job.rowHtml !== undefined ? job.rowHtml : await sourceRowHtml(job.source, tableId, job.row, templatesCache), job.variant),
        wrongKindOf: job => wrongKindOf(cfg, openSource, job.source),
        onProgress: (current, total) => setStatus(I18n.t('batchPrecheck.progress', { current, total })),
      });
      // « Contrôle avant l'export : 3/3… » ne reste pas affiché derrière la fenêtre qui suit (ni derrière un « Annuler » : la ligne d'état est vide, comme avant ce contrôle).
      setStatus(stopped ? I18n.t('status.batchPrecheckStopped') : '');
      if (stopped) return null;
      if (!problems.length) return { jobs, confirmed: false };
      const rowCount = new Set(jobs.map(job => job.row.id)).size;
      const rowNameOf = async problem => {
        const job = jobs[problem.jobIndex];
        return job.source.filenameTemplate ? sanitizeFilenamePart(await ReaderMode.resolveFilename(job.source.filenameTemplate, tableId, job.row)) : '';
      };
      const { action, leftOut } = await BatchPrecheck.review(problems, { total: jobs.length, rowCount, format: cfg.label, rowNameOf });
      if (action === 'cancel') { setStatus(I18n.t('status.exportCancelled')); return null; }
      return { jobs: leftOut.size ? jobs.filter(job => !leftOut.has(job.row.id)) : jobs, confirmed: true };
    }

    // Le genre de modèle que cet export ne fait pas pour ce document (« Modèle selon la ligne » peut envoyer une ligne vers une grille dans un export Word, vers un document dans un export Excel) : 'document'
    // (la ligne a un modèle de grille, l'export ne fait que des documents), 'grid' (l'inverse), null (rien à dire : le modèle de l'écran, ou du bon genre).
    function wrongKindOf(cfg, openSource, source) {
      if (source === openSource || cfg.grid == null || cfg.grid === GridEditor.isGridType(source.typeModele)) return null;
      return cfg.grid ? 'document' : 'grid';
    }

    // Génère les documents un par un dans `sink`. cancelled : « Annuler » sur la fenêtre des images d'un site externe a arrêté tout le lot ;
    // failed : le nombre de lignes que leur modèle ou une erreur a empêché de générer, et failures : ces lignes mêmes, de quoi les reconnaître et la
    // raison, pour la fenêtre de fin de lot (js/batch-failures.js) ; blankRows : les lignes dont le PDF a des pages blanches, dans le fichier mais à revoir, pour la même
    // fenêtre ; exportedIds : les identifiants des lignes dont tous les documents sont dans le fichier, celles dont la
    // date du dernier export s'écrit (vide quand le lot est annulé).
    async function runBatchJobs(cfg, sink, jobs, { tableId, openSource, templatesCache }) {
      let ok = 0;
      let cancelled = false;
      const failedJobs = [];
      const blankJobs = [];
      const doneRows = new Set();
      const failedRows = new Set();
      // Un lot de documents rapides (Word, Excel, Markdown, HTML : une dizaine de ms par ligne, les lectures d'une même passe étant gardées en mémoire) ne rendait jamais la main : toute la boucle tenait la page
      // (4,7 s pour 500 documents Word), « n/500 » ne se dessinait pas et aucun clic ne passait. Après 40 ms de travail d'affilée la page respire, et se repeint au moins toutes les 250 ms.
      const pace = WorkPacer.create();
      // « Arrêter » (js/batch-progress.js) abandonne tout le lot, comme « Annuler » sur la fenêtre des images d'un site externe : `stoppedAt` dit combien de documents étaient faits ou en échec.
      const progress = BatchProgress.begin({ key: cfg.progress, total: jobs.length });
      let stoppedAt = null;
      try {
        for (let i = 0; i < jobs.length; i++) {
          await pace();
          if (progress && progress.stopped()) { cancelled = true; stoppedAt = i; break; }
          const { row, variant, source } = jobs[i];
          setStatus(I18n.t(cfg.progress, { current: i + 1, total: jobs.length }));
          if (progress) progress.update(i + 1);
          const valueName = variant && variant.label ? sanitizeFilenamePart(variant.label) : '';
          // Le modèle d'une ligne (« Modèle selon la ligne ») peut ne pas être du genre de cet export - une grille en Word, un document en Excel : la
          // ligne n'est pas générée, comme celle qui échoue.
          const wrongKind = wrongKindOf(cfg, openSource, source);
          if (wrongKind) {
            console.error('[main] export ' + cfg.label + ' en lot : le modèle de la ligne ' + row.id + ' (' + source.typeModele + ') ne se génère pas dans ce format');
            failedJobs.push({ row, source, valueName, wrongKind });
            failedRows.add(row.id);
            continue;
          }
          try {
            // Le document de cette valeur : les bulles réglées « Un document par valeur » y écrivent leur k-ième valeur (js/list-split.js) ; sans
            // découpage, le HTML et les en-têtes sont ceux de la ligne, tels quels.
            const html = ListSplit.pin(jobs[i].rowHtml !== undefined ? jobs[i].rowHtml : await sourceRowHtml(source, tableId, row, templatesCache), variant);
            const added = await sink.add({ row, source, html, headerFooterData: ListSplit.pinHeaderFooter(source.headerFooterData, variant), valueName });
            ok++;
            doneRows.add(row.id);
            if (added && added.blankPages && added.blankPages.length) blankJobs.push({ row, source, valueName, pages: added.blankPages });
          } catch (e) {
            // « Annuler » sur la fenêtre des images d'un site externe arrête tout le lot, pas seulement cette ligne : rien n'est téléchargé.
            if (ExternalImages.isCancel(e)) { cancelled = true; break; }
            console.error('[main] export ' + cfg.label + ' en lot : échec pour la ligne', row.id, e);
            failedJobs.push({ row, source, valueName, message: e && e.message, passwordProblem: e && e.passwordProblem, column: e && e.column });
            failedRows.add(row.id);
          }
        }
        // « Arrêter » cliqué pendant le dernier document : la personne a voulu tout abandonner, le fichier ne part pas.
        if (!cancelled && progress && progress.stopped()) { cancelled = true; stoppedAt = jobs.length; }
      } finally { if (progress) progress.end(); }
      // Une ligne dont un document a échoué n'est pas datée, même si les autres sont dans le fichier (« Un document par valeur ») : la date dirait « exporté » d'une ligne
      // dont le PDF manque.
      const exportedIds = cancelled ? [] : Array.from(doneRows).filter(id => !failedRows.has(id));
      return { ok, failed: failedJobs.length, cancelled, stoppedAt, failures: cancelled ? [] : await describeBatchFailures(failedJobs, tableId), blankRows: cancelled ? [] : await describeBatchFailures(blankJobs, tableId), exportedIds };
    }

    // Les lignes en échec (ou aux pages blanches : `pages`) telles que la fenêtre de fin de lot les liste (js/batch-failures.js) : leur n°, le nom que leur fichier aurait porté - celui du
    // modèle de la ligne, suivi de la valeur d'un « Un document par valeur » -, la raison. Une seule passe de lecture pour toutes (GristAPI.withReadPass),
    // avant le téléchargement : la fenêtre s'ouvre aussitôt après. Le nom n'est qu'un repère : illisible, la ligne se reconnaît à son n°.
    function describeBatchFailures(failedJobs, tableId) {
      if (!failedJobs.length) return [];
      return GristAPI.withReadPass(async () => {
        const failures = [];
        for (const { row, source, valueName, wrongKind, message, pages, passwordProblem, column } of failedJobs) {
          let name = '';
          try {
            if (source && source.filenameTemplate) name = sanitizeFilenamePart(await ReaderMode.resolveFilename(source.filenameTemplate, tableId, row));
          } catch (e) { name = ''; }
          failures.push({ id: row.id, name: valueName ? (name ? name + ' - ' : '') + valueName : name, wrongKind, message, pages, passwordProblem, column });
        }
        return failures;
      });
    }

    // La fin d'un export en lot : le fichier assemblé est téléchargé, le coin d'état dit combien de documents (et de planches) il contient.
    // Un lot PDF (`shelvable`) peut aussi, ou à la place, se ranger dans GFS (js/pdf-delivery.js) : le PDF unique ou la planche d'un bloc, l'archive PDF par PDF. Le coin d'état dit alors ce que GFS a gardé, et les lignes ne sont datées
    // que si leur PDF est parti quelque part (téléchargé ou rangé).
    async function finishBatchExport(cfg, sink, { only, tableId, rows, openSource, splitting, ok, failed, exportedIds }) {
      // Archive d'un export seul : nommée comme la ligne ; sinon comme la table.
      const baseName = async () => (only ? (sanitizeFilenamePart(await ReaderMode.resolveFilename(openSource.filenameTemplate, tableId, rows[0])) || sanitizeFilenamePart(tableId)) : sanitizeFilenamePart(tableId));
      // La jointure à la ligne ne vaut que pour un PDF par ligne (l'archive ZIP) : un PDF réuni ou posé sur des planches n'a pas de ligne à lui (la case du menu est grisée alors).
      const how = cfg.shelvable ? Object.assign(PdfDelivery.plan(), cfg.merged ? { attach: false } : {}) : { download: true, shelve: false, attach: false };
      let delivery = null;
      let stampIds = exportedIds;
      if (!how.shelve && !how.attach) {
        setStatus(I18n.t(sink.finishing));
        const outBlob = await sink.finish();
        ExportCommon.downloadBlob(outBlob, (await baseName()) + cfg.fileSuffix);
      } else {
        // Rangé seul, une archive ne se fabrique pas : chaque PDF part tel quel.
        if (how.download || cfg.merged) setStatus(I18n.t(sink.finishing));
        const base = await baseName();
        let merged = null;
        const files = cfg.merged ? [{ name: base + cfg.fileSuffix, blob: async () => merged || (merged = await sink.finish()) }] : sink.files;
        delivery = await PdfDelivery.deliver(files, async subset => {
          ExportCommon.downloadBlob(cfg.merged ? await files[0].blob() : await sink.finish(subset), base + cfg.fileSuffix);
        }, { plan: how, lot: PdfDelivery.lotFor(tableId), table: tableId });
        // Un seul fichier (réuni ou posé sur des planches) : ses lignes sont datées s'il est parti ; une archive : les lignes dont chaque PDF est parti.
        if (cfg.merged) stampIds = delivery.delivered.size ? exportedIds : [];
        else {
          const missing = new Set();
          files.forEach((file, i) => { if (!delivery.delivered.has(i)) missing.add(file.rowId); });
          stampIds = exportedIds.filter(id => !missing.has(id));
        }
      }
      const note = cfg.stampsExportDate ? await stampExportDate(tableId, stampIds) : '';
      const sheets = sink.sheetCount ? sink.sheetCount() : 0;
      const useSplitTexts = splitting && cfg.splitDone;
      const doneKey = failed ? (useSplitTexts ? cfg.splitDoneWithFailures : cfg.doneWithFailures) : (useSplitTexts ? cfg.splitDone : cfg.done);
      // Rien n'est téléchargé quand tout est rangé : la phrase « archive ZIP téléchargée » ne serait pas vraie, celle de GFS dit ce qu'il a gardé.
      const said = PdfDelivery.describe(delivery, failed);
      const usual = exportText(doneKey, { ok, failed, sheets });
      setExportDoneStatus(said.text ? (delivery.downloaded ? said.text + ' ' + usual : said.text) : usual, [said.note, note].filter(Boolean).join(' '));
    }

    const isExportRunning = () => exportOperationInProgress;

    return { isExportRunning, onCreateEmail, onExport, onExportBatch, onExportDocx, onExportPdf, onExportXlsx, selectedExportType, syncExportMenus, syncExportRowsForModelType, withExportLock };
  }

  return { create };
})();
