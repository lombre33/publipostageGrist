// L'enregistrement automatique du modèle ouvert : le passage qui revient toutes les 2,5 s (AUTOSAVE_INTERVAL_MS) et celui du repos, la détection d'un conflit avec ce qu'une autre personne a
// enregistré, le bandeau qui le dit, le coin d'état (« Enregistré à… », « Modifications non enregistrées »), le réglage « Enregistrement automatique » et ce qui sert à l'écriture avec
// l'enregistrement manuel (saveScreenAs, linkedSendFor, noteKnownState). Sorti de js/main.js (refactorisation du 10/11, découpe 8) : l'état qu'il partage avec l'enregistrement et la sortie d'un
// modèle est l'objet `persist` de main.js (découpe 7), donné par `api` ; le type du modèle et le nom du titre sont lus par des fonctions. Les corps sont ceux de main.js.
const MainAutosave = (function () {
  function create(api) {
    const {
      adoptTableName, conflictBanner, conflictReloadBtn, followLinkedModels, getCurrentTypeModele, getEmailFieldsFromInputs, getPdfFilenameTemplate,
      getTitleNameBase, isExportRunning, isReadOnly, loadTemplateIntoEditor, persist, refreshTemplateList, setStatus, setTitleNameBase, statusMsg,
      templateNameInput,
    } = api;

    // Écrit dans Grist le modèle tel que l'écran le montre : `html` (celui de l'éditeur par défaut), ses en-têtes, sa page, son type et ses champs
    // email. `alsoWrite` : les modèles Grille que les tableaux liés du document ont changé, écrits dans le même lot (js/linked-table.js:prepareSend).
    // Le nom ne part que pour un modèle neuf et quand la personne l'a changé ici (le crayon, « Enregistrer sous… », la galerie) : celui du titre, tel qu'il a été lu dans la table à l'ouverture, ne repart pas, et la table garde
    // le nom que GFS ou une autre personne lui a donné depuis (consigne GFS 029). Ce qui part devient le nom que le titre tient de la table.
    function saveScreenAs(id, nom, suiviModifications, html = Editor.getHTML(), alsoWrite = null) {
      const written = id != null && getTitleNameBase() !== null && nom === getTitleNameBase() ? null : nom;
      const epoch = persist.autosaveEpoch;
      return Templates.save(id, written, html, getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm(), getCurrentTypeModele(), getEmailFieldsFromInputs(), suiviModifications, alsoWrite).then(saved => {
        if (written !== null && epoch === persist.autosaveEpoch) setTitleNameBase(written); // un autre modèle ouvert pendant l'écriture a pris le sien (showTemplateNames)
        return saved;
      });
    }

    // Les tableaux liés que le document a changé et pas leur modèle partent avec son enregistrement (js/linked-table.js:prepareSend, lot 6c-2b) : null quand rien ne part (un macro-modèle n'a rien
    // dans l'éditeur), sinon le HTML à écrire avec la base d'après et ce qui s'écrit dans les modèles. À prendre dans le même bloc synchrone que la lecture du document, après le dernier `await`.
    // Les diapositives liées d'une présentation que seule elle a changées partent de même vers leur source (js/slide-links.js:prepareSend), dans le même lot.
    function linkedSendFor(isMacro) {
      if (isMacro) return null;
      const editor = EditorCore.getEditor();
      const tables = LinkedTable.prepareSend(editor);
      const slides = SlideLinks.prepareSend(editor, tables ? tables.doc : null);
      if (!tables || !slides) return tables || slides;
      return {
        html: slides.html,
        writes: tables.writes.concat(slides.writes),
        commit() { tables.commit(); slides.commit(); },
        announce() { tables.announce(); slides.announce(); },
      };
    }
    // Ce que ce widget vient de lire ou d'écrire du modèle `id` (le cache, à jour après une écriture) : une présentation ouverte ailleurs dont seules des diapositives à repère changent prend
    // l'envoi sans bandeau de conflit (js/slide-links.js:adopt).
    function noteKnownState(id) { SlideLinks.noteKnown(id == null ? null : Templates.byId(id)); }

    // Attend la fin du passage de l'enregistrement automatique en cours (aucun autre ne part tant que restoringVersion ou leavePromptOpen est vrai) : il écrirait sinon l'ancien écran après la
    // restauration, ou le texte que la question de départ demande d'abandonner. `limitMs` : la question de départ n'attend pas plus que cela un Grist qui ne répond pas.
    async function whenAutosaveTickDone(limitMs = AUTOSAVE_TICK_WATCHDOG_MS) {
      const giveUpAt = Date.now() + limitMs;
      while (persist.autosaveTickPending && Date.now() - persist.autosaveTickStartedAt < AUTOSAVE_TICK_WATCHDOG_MS && Date.now() < giveUpAt) await new Promise(resolve => setTimeout(resolve, 40));
    }

    // Enregistrement automatique
    // Enregistre le modèle en cours toutes les AUTOSAVE_INTERVAL_MS, mais seulement s'il y a eu une modification depuis le dernier enregistrement
    // (autosaveDirty) et qu'un modèle existant est chargé : jamais de création automatique, un modèle tout neuf passe d'abord par un Enregistrer manuel
    // (cf. onSave). Il réduit la fenêtre de perte en cas de fermeture inattendue, sans remplacer Enregistrer, et la fenêtre de collision si quelqu'un
    // modifie le même modèle en même temps.
    // Détection de conflit : à chaque vérification, le DateModif présent dans Grist est comparé à celui que ce widget a écrit en dernier
    // (autosaveLastKnownDateModif). Un écart révèle qu'une autre personne (ou un autre onglet) a enregistré ce modèle entre-temps : l'enregistrement
    // automatique se gèle (il n'écrase plus rien) et un bandeau propose de recharger. Un Enregistrer manuel reste possible pendant ce temps et tranche
    // en faveur de la version locale (cf. onSave) : un choix conscient, jamais fait à la place de la personne.
    const AUTOSAVE_INTERVAL_MS = 2500;
    // Au repos (rien à enregistrer), le passage ne relit la table des modèles que toutes les AUTOSAVE_IDLE_INTERVAL_MS : la relire en entier, contenus
    // compris (816 Ko pour 14 modèles avec images), toutes les 2,5 s pour n'y rien trouver chargerait Grist en continu. Dès qu'il y a quelque chose à
    // enregistrer, chaque passage relit avant d'écrire, comme toujours : la protection contre un écrasement ne change pas, seul un enregistrement fait
    // ailleurs pendant que rien ne bouge est signalé plus tard (15 s au plus, davantage pour une table lourde : voir plus bas).
    const AUTOSAVE_IDLE_INTERVAL_MS = 15000;
    // Une table des modèles lourde ne se relit pas à ce rythme : vingt modèles de 1,6 Mo (images comprises), relus quatre fois par minute,
    // c'étaient 118 Mo par minute pour ne rien trouver. L'attente suit le poids de la dernière lecture (Templates.getLoadedChars), une
    // milliseconde pour AUTOSAVE_IDLE_CHARS_PER_MS caractères (3 Mo : 30 s), sans dépasser AUTOSAVE_IDLE_MAX_INTERVAL_MS ; une table de moins de
    // 1,5 Mo garde ses 15 s.
    const AUTOSAVE_IDLE_MAX_INTERVAL_MS = 180000;
    const AUTOSAVE_IDLE_CHARS_PER_MS = 100;
    function autosaveIdleIntervalMs() {
      const byWeight = Math.ceil(Templates.getLoadedChars() / AUTOSAVE_IDLE_CHARS_PER_MS);
      return Math.min(AUTOSAVE_IDLE_MAX_INTERVAL_MS, Math.max(AUTOSAVE_IDLE_INTERVAL_MS, byWeight));
    }
    // Un modèle LOURD - une présentation de 30 Mo importée, ou un document plein de photos : son texte pèse des dizaines de millions de signes - ne s'enregistre pas toutes les 2,5 s. Chaque passage relit la
    // table des modèles, reconstruit le texte entier, l'écrit et relit sa date : plusieurs secondes de page prise (mesuré sur 150 diapositives de photos : 4 s sur 5), pendant lesquelles la frappe n'arrive plus et que
    // la mémoire de la page gonfle de plusieurs centaines de Mo. Un tel modèle laisse donc une milliseconde par millier de signes entre deux passages (8 s pour 8 millions de signes, 30 s au plus), et attend que la
    // personne ait cessé de taper (AUTOSAVE_QUIET_MS) tant que cela ne dure pas plus de AUTOSAVE_QUIET_MAX_DEFER_MS. Un modèle plus léger ne passe jamais par ici : son rythme (2,5 s) ne change pas.
    const AUTOSAVE_HEAVY_CHARS = 8 * 1000 * 1000;
    const AUTOSAVE_HEAVY_CHARS_PER_MS = 1000;
    const AUTOSAVE_HEAVY_MAX_GAP_MS = 30000;
    const AUTOSAVE_QUIET_MS = 1500;
    const AUTOSAVE_QUIET_MAX_DEFER_MS = 45000;
    let typingDeferredSince = 0;
    // Le poids du modèle ouvert : le texte que le cache de js/templates.js tient de lui (lu ou écrit par ce widget).
    function openModelChars() {
      const open = Templates.byId(Templates.getCurrentId());
      return open && typeof open.contenu === 'string' ? open.contenu.length : 0;
    }
    // Ce passage doit-il attendre ? Seulement pour un modèle lourd à enregistrer : trop tôt après le passage précédent, ou la personne est en train de taper (un passage reporté trop longtemps part quand même).
    function heavyPassMustWait(now) {
      const chars = openModelChars();
      if (chars < AUTOSAVE_HEAVY_CHARS) { typingDeferredSince = 0; return false; }
      const gap = Math.min(AUTOSAVE_HEAVY_MAX_GAP_MS, Math.ceil(chars / AUTOSAVE_HEAVY_CHARS_PER_MS));
      if (now - persist.autosaveLastCheckAt < gap - AUTOSAVE_INTERVAL_MS / 2) return true;
      if (now - persist.autosaveLastEditAt < AUTOSAVE_QUIET_MS) {
        if (!typingDeferredSince) typingDeferredSince = now;
        if (now - typingDeferredSince < AUTOSAVE_QUIET_MAX_DEFER_MS) return true;
      }
      typingDeferredSince = 0;
      return false;
    }
    // Préférence par navigateur (comme la touche de déclenchement #Variable, cf. js/settings.js), pas par document : chacun choisit s'il veut
    // l'enregistrement automatique, indépendamment des autres personnes qui ouvrent le même widget.
    const AUTOSAVE_ENABLED_STORAGE = 'pp_autosave_enabled';

    const autosaveRefused = () => persist.autosaveRefusedEpoch === persist.autosaveEpoch;
    const AUTOSAVE_TICK_WATCHDOG_MS = 60000;

    // Le réglage est gardé par js/person-store.js (le navigateur, ou GFS quand elle héberge le widget).
    function isAutosaveEnabled() {
      return PersonStore.get(AUTOSAVE_ENABLED_STORAGE) !== 'false'; // absent = activé par défaut ; stockage indisponible (navigation privée, quota) : lu absent, donc activé, plutôt que figé désactivé
    }

    function setAutosaveEnabled(enabled) {
      PersonStore.set(AUTOSAVE_ENABLED_STORAGE, enabled ? 'true' : 'false'); // non retenu (stockage indisponible) : actif pour cette session
    }

    // Aspect du bouton Enregistrer d'après ce réglage : bleu et blanc enregistrement automatique allumé, noir et blanc coupé. Deux classes le disent :
    // celle du bouton, et celle de <html> (pp-autosave-off), que le <head> d'index.html pose avant le premier affichage (le stockage du navigateur : chez GFS
    // il est refusé, l'espace de l'app n'arrive qu'avec le contexte) ; posée ici, à la fin du chargement des scripts, elle arriverait après un premier affichage
    // en bleu suivi d'un fondu vers le noir chez qui a coupé l'enregistrement automatique. Remise à l'heure au début d'init, à chaque clic de la ligne du menu,
    // quand un autre onglet change le réglage et quand l'espace de GFS arrive (PersonStore.onLoaded, dans init).
    function syncSaveButtonLook() {
      const off = !isAutosaveEnabled();
      document.documentElement.classList.toggle('pp-autosave-off', off);
      const saveBtn = document.getElementById('btn-save');
      if (saveBtn) saveBtn.classList.toggle('is-autosave-off', off);
    }

    function markAutosaveDirty() { persist.autosaveEditVersion++; persist.autosaveLastEditAt = performance.now(); persist.autosaveDirty = true; persist.autosaveSettingsDirty = true; updateSaveStatus(); }
    // Du texte tapé ici, ou reçu d'une autre personne de l'écriture en direct : à enregistrer, sans que ce soit un réglage de cette personne.
    function markTextDirty() { persist.autosaveEditVersion++; persist.autosaveLastEditAt = performance.now(); persist.autosaveDirty = true; updateSaveStatus(); }
    // Une écriture vient de partir avec l'état de l'éditeur tel qu'il était à la version `editVersion` : ce qui a été tapé depuis reste « à
    // enregistrer » pour le passage suivant.
    function noteSaved(editVersion) { if (editVersion === persist.autosaveEditVersion) { persist.autosaveDirty = false; persist.autosaveSettingsDirty = false; } }

    function resetAutosaveState(tpl) {
      persist.autosaveEpoch++;
      persist.autosaveDirty = false;
      persist.autosaveSettingsDirty = false;
      persist.conflictDeferredFor = null;
      persist.autosaveLastKnownDateModif = tpl ? tpl.dateModif : null;
      SlideLinks.noteKnown(tpl);
      persist.autosaveLastCheckAt = performance.now();
      hideConflictBanner();
      updateSaveStatus();
    }

    // Coin d'état de la barre d'outils (#status-msg, setStatus). Sans cette fonction, il garderait le dernier message (« Modèle enregistré. », « PDF
    // généré. », une erreur…) même après de nouvelles frappes jamais enregistrées, sans rien dire que ce message est devenu faux. Appelée après chaque
    // frappe (markAutosaveDirty) et après chaque enregistrement ou rechargement, elle fait dire au coin l'état actuel plutôt que le dernier événement :
    // « Enregistré à HH:MM » seulement quand tout ce qui a été tapé est en base, rien sinon (brouillon jamais enregistré, frappe en attente, conflit
    // non résolu) ; avec l'enregistrement automatique coupé, une frappe en attente le dit.
    function updateSaveStatus() {
      // Un PDF à l'écran (js/pdf-reading.js) n'a ni enregistrement ni modèle sans nom à signaler : le coin d'état dit le PDF.
      if (PdfReading.isActive()) { const pdf = PdfReading.info(); setStatus(I18n.t('pdf.status.opened', { name: pdf.name, n: pdf.pages })); return; }
      // Lecture seule (js/access-rights.js) : rien ne s'enregistre pour cette personne, « Enregistré à… » ou « modèle non enregistré » n'auraient pas
      // de sens.
      if (isReadOnly()) { setStatus(I18n.t('status.readOnly')); return; }
      // Aucun modèle enregistré (pas encore de ligne Grist) : autosaveTick ne peut rien faire tant que ça dure (il ne crée jamais de modèle, cf. son
      // « if (!id) return »). Un statut vide laisserait croire que tout est protégé. Même alerte que templateNameRequired (onSave) : même cause, pas
      // encore de nom ni de ligne.
      if (!Templates.getCurrentId()) { setStatus(I18n.t('status.unsavedTemplateWarning'), true); return; }
      // Grist a refusé d'écrire dans ce modèle (autosaveRefusedEpoch) : le coin le redit tant que ce qui est tapé n'est pas enregistré, au lieu de se vider comme avant une écriture qui va partir (rien ne repart tout seul).
      if (persist.autosaveDirty && autosaveRefused()) { setStatus(I18n.t('status.saveRefused'), true); return; }
      // Enregistrement automatique coupé (son réglage ne se voit plus que dans le menu d'Enregistrer) : rien ne partira tout seul, ce qui vient d'être
      // tapé n'est que dans l'éditeur, et le coin d'état le dit jusqu'au prochain Enregistrer. Seulement dans ce cas : avec l'enregistrement
      // automatique actif, le délai avant le passage suivant ne dure que 2,5 s et le coin reste vide. Avant le test de DateModif : un modèle sans date
      // connue doit pourtant le dire.
      if (persist.autosaveDirty && !persist.autosaveConflictActive && !isAutosaveEnabled()) {
        setStatus(I18n.t('status.unsavedChanges'));
        statusMsg.classList.add('is-unsaved');
        return;
      }
      if (!persist.autosaveLastKnownDateModif) { setStatus(''); return; }
      if (persist.autosaveDirty || persist.autosaveConflictActive) { setStatus(''); return; }
      setStatus(I18n.t('status.savedAt', { time: formatSaveTime(persist.autosaveLastKnownDateModif) }));
    }

    // autosaveLastKnownDateModif vient de Templates.save et loadAll, qui relisent DateModif par fetchTable : Grist rend une colonne DateTime en
    // secondes entières depuis l'epoch, jamais en millisecondes (dev-tests/grist-stub.js reproduit ce comportement), et non en chaîne ISO comme celle
    // qu'on envoie. new Date(secondes) les prendrait pour des millisecondes et afficherait une heure quasi figée.
    // Mais readBackDateModif (js/templates.js) retombe sur la chaîne ISO d'origine quand la relecture échoue : multipliée par 1000, elle donne NaN, et
    // new Date(NaN).toLocaleTimeString() renvoie « Invalid Date » sans lever (le catch ci-dessous ne l'attrape pas). Les deux représentations doivent
    // donc être gérées.
    function formatSaveTime(dateModif) {
      try {
        const modified = typeof dateModif === 'number' ? new Date(dateModif * 1000) : new Date(dateModif);
        if (isNaN(modified.getTime())) return '';
        return modified.toLocaleTimeString(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) { return ''; }
    }

    function showConflictBanner(remoteTpl) {
      persist.autosaveConflictActive = true;
      persist.autosaveConflictTpl = remoteTpl;
      if (conflictBanner) conflictBanner.style.display = '';
    }

    function hideConflictBanner() {
      persist.autosaveConflictActive = false;
      persist.autosaveConflictTpl = null;
      if (conflictBanner) conflictBanner.style.display = 'none';
    }

    // Le modèle a-t-il été réécrit par quelqu'un d'autre ? Sa date dans Grist n'est ni celle que ce widget connaît (autosaveLastKnownDateModif) ni
    // celle de sa dernière écriture (Templates.lastWritten : un enregistrement fait par ce widget dont l'état d'ici n'est pas encore à jour, comme un
    // macro-modèle enregistré par sa fenêtre).
    function changedElsewhere(remoteTpl) {
      const known = persist.autosaveLastKnownDateModif;
      if (!remoteTpl || !known || !remoteTpl.dateModif) return false;
      if (Templates.sameDateModif(remoteTpl.dateModif, known)) return false;
      return !Templates.sameDateModif(remoteTpl.dateModif, Templates.lastWritten(remoteTpl.id));
    }

    // Relit la table des modèles et rend { remoteTpl } (la ligne de `id`, absente si le modèle a été supprimé), ou null quand cette lecture ne prouve
    // rien : elle a croisé une écriture de CE widget (la lecture tombe entre l'écriture et la relecture de sa date, ou revient avec l'état d'avant :
    // Grist lent, cf. Templates.getWriteSeq), ou un autre modèle a été chargé pendant ce temps (la ligne relue n'est plus celle de l'écran). Une
    // lecture abandonnée ne perd rien : le passage suivant relit l'état d'alors. Lève si la lecture échoue.
    async function readRemoteTemplate(id, epoch) {
      if (Templates.isWriting()) return null;
      const seq = Templates.getWriteSeq();
      const fresh = await Templates.loadAll();
      if (epoch !== persist.autosaveEpoch || seq !== Templates.getWriteSeq()) return null;
      return { remoteTpl: fresh.find(t => String(t.id) === String(id)) };
    }

    // Un seul passage à la fois : avec Grist lent, un passage (relire la table, écrire, relire la date) dure plus que l'intervalle, et chaque passage
    // de plus s'empilerait, relisant la table pendant que le précédent écrit : jusqu'à trois écritures simultanées, et le faux conflit « modifié
    // ailleurs » que ce chevauchement produit chez une personne seule. Le passage suivant est simplement sauté : un passage lit l'état du moment, il
    // n'y a rien à rattraper.
    async function autosaveTick() {
      if (persist.autosaveTickPending && Date.now() - persist.autosaveTickStartedAt < AUTOSAVE_TICK_WATCHDOG_MS) return;
      persist.autosaveTickPending = true;
      persist.autosaveTickStartedAt = Date.now();
      const startedAt = persist.autosaveTickStartedAt;
      try { await runAutosaveTick(); }
      finally { if (persist.autosaveTickStartedAt === startedAt) persist.autosaveTickPending = false; }
    }

    // Les cas où un passage ne fait rien du tout, avant même de lire la table.
    function autosaveTickBlocked() {
      if (persist.leavePromptOpen || persist.restoringVersion) return true;
      if (ImportPlacing.isFilling()) return true; // un gros modèle se remplit par morceaux (js/main.js:fillOpenedPresentation) : l'éditeur n'a pas encore tout son texte, rien ne s'écrit avant la fin
      if (!isAutosaveEnabled()) return true;  // coupé par la personne (cf. wireSaveMenu) : ni vérification de conflit ni écriture en arrière-plan
      if (isExportRunning()) return true; // évite toute contention Grist avec un export en cours
      if (persist.autosaveConflictActive) return true; // gelé tant que l'utilisateur n'a pas choisi (recharger, ou Enregistrer manuellement pour garder sa version)
      // Écriture en direct : UNE personne enregistre le modèle pour tout le monde (js/live-entry.js) ; les autres n'écrivent que ce qui leur est propre (un réglage).
      if (LiveEntry.blocksAutosave(persist.autosaveSettingsDirty)) return true;
      return false;
    }

    // Ce qu'un passage écrit, une fois sûr qu'il y a quelque chose à écrire : le nom saisi et le genre du modèle. null : rien à écrire.
    function autosaveWriteTarget(remoteTpl) {
      const nom = templateNameInput ? templateNameInput.value.trim() : '';
      if (!nom) return null; // même garde que le bouton Enregistrer manuel
      // Un macro-modèle n'a rien dans l'éditeur (Editor.getHTML() est toujours vide, cf. loadMacroIntoEditor) : son Contenu est sa composition,
      // réécrite telle que Grist vient de la rendre (remoteTpl, relu plus haut). Sans cela, renommer le macro-modèle ou changer son nom de PDF ou ses
      // marges remplacerait sa composition par un paragraphe vide en moins de 3 s. Macro-modèle introuvable dans Grist (supprimé ailleurs) : rien n'est
      // écrit, jamais une composition inventée.
      const isMacro = getCurrentTypeModele() === 'macro';
      if (isMacro && !remoteTpl) return null;
      return { nom, isMacro };
    }

    // L'écriture d'un passage. `epoch` : le modèle choisi quand le passage a commencé ; `editVersion` : l'état de l'édition lu avant de lire quoi que ce
    // soit.
    async function writeAutosave(id, { nom, isMacro }, remoteTpl, epoch, editVersion, synced) {
      try {
        const suiviModifications = isMacro ? null : await Editor.getSuiviModificationsForSave();
        // un autre modèle a été choisi pendant l'attente de l'identification : l'éditeur n'est plus celui dont `id` est la ligne (cf. onSave)
        if (epoch !== persist.autosaveEpoch) return;
        // La question « Enregistrer / Abandonner / Annuler » s'est ouverte depuis le départ de ce passage (leavePromptOpen n'est regardé qu'au départ) : rien n'est écrit, ce qui attend reste à demander,
        // et le passage suivant l'écrira si la personne reste.
        if (persist.leavePromptOpen) return;
        // Les modèles viennent d'être relus par ce passage : les tableaux liés que le document a changé et pas leur modèle partent dans le même lot que sa ligne.
        const send = linkedSendFor(isMacro);
        const token = isMacro ? null : LiveEntry.saveToken(); // l'état du texte juste avant qu'il soit lu (écriture en direct)
        const contenu = isMacro ? remoteTpl.contenu : (send ? send.html : Editor.getHTML());
        const { dateModif } = await saveScreenAs(id, nom, suiviModifications, contenu, send ? send.writes : null);
        LiveEntry.published(token, dateModif);
        // Un autre modèle chargé pendant l'écriture (autosaveEpoch) a son propre état : rien de ceci ne lui appartient.
        if (epoch === persist.autosaveEpoch) {
          persist.autosaveLastKnownDateModif = dateModif;
          noteSaved(editVersion);
          if (send) send.commit();
          noteKnownState(id);
          updateSaveStatus();
          LinkedTable.tell(synced, send); // « Enregistré à… » ne doit pas effacer ce que la synchro et l'envoi viennent de dire
        }
      } catch (e) {
        // Un refus de Grist (règle d'accès) n'est pas une panne : redemander la même écriture n'y change rien. Le passage s'arrête pour ce modèle (autosaveRefusedEpoch), le coin d'état le dit, et un Enregistrer à la main
        // redemande. Un modèle chargé pendant l'écriture (autosaveEpoch) n'est pas celui qui a été refusé : ni arrêt ni message pour lui.
        if (GristAPI.isAccessRefusal(e)) {
          console.warn('[main] auto-save : Grist refuse l’écriture (règle d’accès)', e);
          if (epoch === persist.autosaveEpoch) { persist.autosaveRefusedEpoch = epoch; setStatus(I18n.t('status.saveRefused'), true); }
          return;
        }
        console.error('[main] auto-save : échec d’enregistrement', e);
        // autosaveDirty reste vrai : retenté au passage suivant. Affiché, pas seulement journalisé : un échec répété doit se voir dans le coin d'état
        // plutôt que de laisser croire que tout est enregistré.
        setStatus(I18n.t('status.autosaveError'), true);
      }
    }

    async function runAutosaveTick() {
      if (autosaveTickBlocked()) return;
      const id = Templates.getCurrentId();
      if (!id) return; // aucune ligne à mettre à jour - jamais de création automatique
      // Au repos, une lecture toutes les autosaveIdleIntervalMs(), à une demi-période près (un passage un peu en avance lit déjà, au lieu de
      // repousser la lecture d'une période de plus).
      const checkStartedAt = performance.now();
      // Un modèle que Grist a refusé d'écrire (autosaveRefused) attend comme un modèle au repos : ce qui est tapé ne peut pas partir, le relire à chaque passage ne servirait qu'à charger Grist.
      if ((!persist.autosaveDirty || autosaveRefused()) && checkStartedAt - persist.autosaveLastCheckAt < autosaveIdleIntervalMs() - AUTOSAVE_INTERVAL_MS / 2) return;
      if (persist.autosaveDirty && !autosaveRefused() && heavyPassMustWait(checkStartedAt)) return; // un modèle lourd : espacé, et pas pendant la frappe (voir AUTOSAVE_HEAVY_CHARS)
      const epoch = persist.autosaveEpoch;
      let remote;
      try { remote = await readRemoteTemplate(id, epoch); }
      catch (e) { console.error('[main] auto-save : vérification de conflit impossible', e); return; }
      if (!remote) return; // lecture sans valeur (cf. readRemoteTemplate) : rien à comparer ce coup-ci, le passage suivant relira
      persist.autosaveLastCheckAt = checkStartedAt;
      adoptTableName(); // un nom donné ailleurs depuis l'ouverture (GFS) : le titre le prend avant que ce passage n'écrive
      const remoteTpl = remote.remoteTpl;
      if (changedElsewhere(remoteTpl)) {
        // Une personne du direct vient d'enregistrer : sa date est annoncée dans la seconde (adoptLiveSave), le conflit n'est dit qu'au passage d'après, une fois par date inconnue. Le passage suivant relit.
        const seen = String(remoteTpl.dateModif);
        if (LiveEntry.expectsAnnouncement() && persist.conflictDeferredFor !== seen) { persist.conflictDeferredFor = seen; persist.autosaveLastCheckAt = -Infinity; return; }
        // Une présentation dont seules des diapositives à repère ont changé (l'envoi d'une présentation qui les a importées) les prend sans bandeau : sa date devient celle que ce widget connaît, et
        // ce qui était à enregistrer l'est toujours (js/slide-links.js:adopt).
        if (!SlideLinks.adopt(EditorCore.getEditor(), remoteTpl)) { showConflictBanner(remoteTpl); return; }
        persist.autosaveLastKnownDateModif = remoteTpl.dateModif;
      }
      // Les modèles viennent d'être relus : les tableaux liés du document suivent les leurs, document modifié ou non, en lecture seule aussi (rien n'est écrit).
      const synced = followLinkedModels();
      if (!persist.autosaveDirty) return;
      if (autosaveRefused()) return; // Grist a refusé d'écrire dans ce modèle : rien ne repart tout seul (autosaveRefusedEpoch)
      // Lecture seule : la vérification de conflit ci-dessus garde son bandeau (le modèle a changé ailleurs), mais rien n'est écrit. Un commentaire
      // posé en Lecture passe par saveReaderCommentAnchors, jamais par ici.
      if (isReadOnly()) return;
      // getHTML() renverrait le fragment d'en-tête ou de pied chargé, pas le document principal (cf. header-footer-preview.js) : on saute ce passage
      // plutôt que de forcer la sortie de ce mode toutes les 2 à 3 s, bien plus gênant que d'attendre le suivant.
      if (Editor.isEditingHeaderFooter()) return;
      const editVersion = persist.autosaveEditVersion; // Avant de lire quoi que ce soit : ce qui est modifié après reste « à enregistrer » (cf. noteSaved)
      const target = autosaveWriteTarget(remoteTpl);
      if (target) await writeAutosave(id, target, remoteTpl, epoch, editVersion, synced);
    }

    function startAutosaveLoop() {
      if (persist.autosaveTimer) return;
      persist.autosaveTimer = setInterval(autosaveTick, AUTOSAVE_INTERVAL_MS);
    }

    function wireAutosaveConflictBanner() {
      if (!conflictReloadBtn) return;
      conflictReloadBtn.addEventListener('click', () => {
        if (!persist.autosaveConflictTpl) return;
        const tpl = persist.autosaveConflictTpl;
        loadTemplateIntoEditor(tpl);
        refreshTemplateList();
        setStatus(I18n.t('status.autosaveConflictReloaded'));
      });
    }

    return {
      AUTOSAVE_ENABLED_STORAGE, AUTOSAVE_TICK_WATCHDOG_MS, changedElsewhere, hideConflictBanner, isAutosaveEnabled, linkedSendFor, markAutosaveDirty,
      markTextDirty, noteKnownState, noteSaved, readRemoteTemplate, resetAutosaveState, saveScreenAs, setAutosaveEnabled, showConflictBanner, startAutosaveLoop,
      syncSaveButtonLook, updateSaveStatus, whenAutosaveTickDone, wireAutosaveConflictBanner,
    };
  }

  return { create };
})();
