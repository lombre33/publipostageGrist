// Les champs e-mail du modèle (Objet, À, Cc, Cci) et la jauge de longueur du mailto: : lus dans leurs champs, basculés entre le gabarit brut (Édition) et les valeurs résolues (Lecture) sur les mêmes champs, le lien
// mailto: d'une ligne (buildMailtoForRecord) et la jauge, recalculée avec un délai à chaque changement. Sorti de js/main.js (refactorisation du 10/11, découpe 9) : le mode, la table, la ligne et le type du
// modèle y sont lus par des fonctions, le cache des gabarits bruts par un lecteur et un écriveur ; le reste lui est donné par `api`. Les corps sont ceux de main.js.
const MainEmail = (function () {
  function create(api) {
    const {
      EMAIL_FIELDS, currentDocumentHtml, emailCciInput, emailCciToggle, emailCharCounter, emailFieldsRow, getCurrentMode, getCurrentTableId, getCurrentTypeModele,
      getEmailFieldsRawCache, getLatestRecord, getLatestRecordTableId, readerContainer, renderReader, setEmailFieldsRawCache,
    } = api;

    // Résout Objet, À, Cc et Cci pour une ligne. Partagé par l'affichage en Lecture et par buildMailtoForRecord (jauge de longueur et création de
    // l'email), pour que ces résolutions ne divergent pas.
    async function resolveEmailFieldsForRecord(rawFields, tableId, record) {
      const [objet, destinataires, cc, cci] = await Promise.all([
        Variables.resolveTextVariables(rawFields.objet, tableId, record),
        Variables.resolveTextVariables(rawFields.destinataires, tableId, record),
        Variables.resolveTextVariables(rawFields.cc, tableId, record),
        Variables.resolveTextVariables(rawFields.cci, tableId, record),
      ]);
      return { objet, destinataires, cc, cci };
    }

    const eachEmailInput = fn => EMAIL_FIELDS.forEach(([key, input]) => { if (input) fn(input, key); });

    function getEmailFieldsFromInputs() {
      // En Lecture, les champs montrent des valeurs résolues, jamais ce qu'il faut enregistrer (Ctrl+S et l'enregistrement automatique ne regardent
      // pas le mode) : le cache tient les gabarits bruts, dans la même forme, tant qu'il n'est pas nul.
      if (getEmailFieldsRawCache()) return getEmailFieldsRawCache();
      return Object.fromEntries(EMAIL_FIELDS.map(([key, input]) => [key, input ? input.value.trim() : '']));
    }

    function wireCciToggle() {
      if (!emailCciToggle || !emailCciInput) return;
      emailCciToggle.addEventListener('click', () => {
        emailCciInput.hidden = !emailCciInput.hidden;
        emailCciToggle.classList.toggle('is-active', !emailCciInput.hidden);
        if (!emailCciInput.hidden) emailCciInput.focus();
      });
    }

    // Les champs d'e-mail (objet, destinataires, Cci…) repartent de ceux du modèle, vides pour un nouveau.
    function loadEmailFields(tpl) {
      if (emailFieldsRow) emailFieldsRow.hidden = getCurrentTypeModele() !== 'email';
      // Un changement de modèle invalide le cache des valeurs brutes (cf. updateEmailFieldsDisplay) : on repart d'un état brut pour ce modèle, et la
      // résolution est redemandée plus bas si l'on est en Lecture.
      setEmailFieldsRawCache(null);
      eachEmailInput((input, key) => { input.readOnly = false; input.value = tpl ? (tpl[key] || '') : ''; });
      if (emailCciInput) {
        // Contrairement au nom du fichier PDF, la Cci reste visible quand elle est déjà réglée.
        emailCciInput.hidden = !emailCciInput.value.trim();
        if (emailCciToggle) emailCciToggle.classList.toggle('is-active', !emailCciInput.hidden);
      }
    }

    // Bascule l'affichage d'Objet/À/Cc/Cci entre gabarit brut (édition) et valeurs résolues (lecture) sur les mêmes champs, jamais dupliqués (cf.
    // emailFieldsRawCache ci-dessus). La valeur résolue s'écrit par showText : un texte, que le champ ne relit pas comme un modèle. Sans ligne sélectionnée, les gabarits bruts restent affichés (rien à résoudre) plutôt qu'un champ vidé sans
    // explication.
    async function updateEmailFieldsDisplay() {
      if (!emailFieldsRow || getCurrentTypeModele() !== 'email') return;
      if (getCurrentMode() !== 'read') {
        if (!getEmailFieldsRawCache()) return; // déjà en état brut, rien à restaurer
        const raw = getEmailFieldsRawCache();
        setEmailFieldsRawCache(null);
        eachEmailInput((input, key) => { input.value = raw[key]; input.readOnly = false; });
        return;
      }
      if (!getEmailFieldsRawCache()) {
        setEmailFieldsRawCache(getEmailFieldsFromInputs());
        eachEmailInput(input => { input.readOnly = true; });
      }
      const record = getLatestRecord() || GristAPI.getCurrentRecord();
      if (!record) return;
      const tableId = getLatestRecordTableId() || GristAPI.getCurrentTableId() || getCurrentTableId();
      const raw = getEmailFieldsRawCache();
      const resolved = await resolveEmailFieldsForRecord(raw, tableId, record);
      // Repassé en édition (ou modèle changé) pendant la résolution : emailFieldsRawCache a déjà été traité par la branche ci-dessus, ne pas écraser
      // son travail avec ce résultat maintenant obsolète.
      if (getCurrentMode() !== 'read' || getEmailFieldsRawCache() !== raw) return;
      eachEmailInput((input, key) => { input.showText(resolved[key]); });
    }

    // L'URL mailto: de cette ligne : les champs résolus, et le corps lu dans le rendu de la Lecture (ReaderMode.render : mêmes bulles et chips que le
    // PDF). `stale` (facultatif) rend vrai quand un résultat plus récent a pris le relais : l'URL n'est alors pas construite (null).
    async function buildMailtoForRecord(record, tableId, stale) {
      const fields = await resolveEmailFieldsForRecord(getEmailFieldsFromInputs(), tableId, record);
      await renderReader(record, tableId);
      if (stale && stale()) return null;
      const content = readerContainer.querySelector('.reader-content');
      const bodyText = MailtoExport.plainTextFromHtml(content ? content.innerHTML : readerContainer.innerHTML);
      return MailtoExport.buildMailtoUrl({ to: fields.destinataires, cc: fields.cc, bcc: fields.cci, subject: fields.objet, bodyText, client: MailtoExport.getMailClient() });
    }

    // L'email d'UNE ligne parmi beaucoup (js/email-drafts.js : « Tous les emails… ») : les champs résolus, le texte du corps et le lien, comme buildMailtoForRecord - mêmes résolutions, même texte -, mais le corps est lu dans le
    // document résolu de la ligne (ReaderMode.resolvedHtml), pas dans #reader-container : la Lecture, la ligne affichée et la jauge ne sont pas touchées, et le rendu d'une ligne n'écarte pas celui d'une autre. L'appelant tient
    // une passe de lecture pour la série (GristAPI.withReadPass). Rend { fields: { objet, destinataires, cc, cci }, bodyText, url }.
    async function describeMailForRecord(record, tableId) {
      const fields = await resolveEmailFieldsForRecord(getEmailFieldsFromInputs(), tableId, record);
      const { html } = await ReaderMode.resolvedHtml(() => currentDocumentHtml(tableId, record, { anchors: true }), tableId, record);
      const bodyText = MailtoExport.plainTextFromHtml(html);
      const url = MailtoExport.buildMailtoUrl({ to: fields.destinataires, cc: fields.cc, bcc: fields.cci, subject: fields.objet, bodyText, client: MailtoExport.getMailClient() });
      return { fields, bodyText, url };
    }

    // Jauge de longueur mailto:, permanente, sur l'URL résolue (to+cc+cci+objet+corps) et non sur le gabarit tapé : un accent ou un retour à la ligne
    // coûte plus cher une fois encodé (cf. MailtoExport). Dépend de la ligne sélectionnée : appelée à chaque changement de ligne, de modèle ou de
    // contenu (avec un debounce, cf. scheduleEmailLengthGauge) ; jamais bloquante, seulement informative.
    let emailGaugeRunId = 0;
    async function updateEmailLengthGauge() {
      if (!emailCharCounter) return;
      if (getCurrentTypeModele() !== 'email') { emailCharCounter.hidden = true; return; }
      const runId = ++emailGaugeRunId;
      const record = getLatestRecord() || GristAPI.getCurrentRecord();
      if (!record) { emailCharCounter.hidden = true; return; }
      const tableId = getLatestRecordTableId() || GristAPI.getCurrentTableId() || getCurrentTableId();
      const url = await buildMailtoForRecord(record, tableId, () => runId !== emailGaugeRunId);
      if (url === null) return; // une résolution plus récente a déjà pris le relais
      const check = MailtoExport.checkUrlLength(url);
      emailCharCounter.hidden = false;
      emailCharCounter.classList.toggle('is-over-limit', !check.safe);
      emailCharCounter.textContent = I18n.t(check.safe ? 'email.charCount' : 'email.charCountOverLimit', { count: check.length, limit: check.limit });
    }
    let emailGaugeDebounceTimer = null;
    function scheduleEmailLengthGauge() {
      if (getCurrentTypeModele() !== 'email') return;
      if (emailGaugeDebounceTimer) clearTimeout(emailGaugeDebounceTimer);
      emailGaugeDebounceTimer = setTimeout(updateEmailLengthGauge, 500);
    }

    return {
      buildMailtoForRecord, describeMailForRecord, eachEmailInput, getEmailFieldsFromInputs, loadEmailFields, scheduleEmailLengthGauge, updateEmailFieldsDisplay,
      updateEmailLengthGauge, wireCciToggle,
    };
  }

  return { create };
})();
