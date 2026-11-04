// Où va un PDF que l'app vient de fabriquer (consigne GFS 043, demande du porteur du 03/11 : « que des exports de Publipostage+ en PDF aillent directement se ranger parmi les fichiers, avec le choix d'écraser l'existant ou d'avoir
// une copie avec un (1) derrière le nom »). Trois destinations, au choix de la personne, la même pour tous ses documents :
//  - `download` (« Télécharger », l'ancien comportement et celui d'origine : la personne l'a tant qu'elle n'a rien choisi) ;
//  - `gfs` (« Ranger dans GFS ») : le PDF est donné à GFS (l'appel `ranger`, js/gfs-link.js:deposit), qui le garde parmi ses fichiers et pose lui-même à la personne la question du nom pris (Garder les deux, Remplacer ou Annuler) ;
//  - `both` (« Télécharger et ranger dans GFS ») : le fichier est téléchargé, comme avant, ET rangé.
// Le choix se garde par PersonStore (clé `pp_export_destination` : le navigateur seule, l'espace de GFS hébergée) et se défait comme les autres réglages de la personne (SettingsHistory). Seule, ou hébergée par un GFS qui ne répond pas, rien ne se range :
// l'export télécharge, comme toujours, « Ranger dans GFS » et « Télécharger et ranger dans GFS » sont grisés (jamais retirés) et leur clic explique (la fenêtre commune des fonctions qui demandent Grist Factory Suite) ; le choix gardé revient avec GFS
// (`destination()` rend alors `download`, `chosen()` le choix gardé). La destination ne touche que les PDF : Word, Excel, PowerPoint, Markdown, HTML et l'impression par le navigateur (qui ne fabrique pas de fichier) ne se rangent pas.
//
// `deliver(files, download, options)` est le seul chemin : js/pdf-export.js (le PDF d'une ligne, « PDF protégé » compris) et js/main.js (le PDF fusionné, l'assemblage avant impression et l'archive ZIP de PDF) lui donnent ce qu'ils ont fabriqué.
//  - `files` : [{ name, blob, rowId? }], le PDF ou chacun des PDF de l'export, `blob` un Blob ou une fonction qui en rend un. Pour une archive ZIP : chaque PDF part SEUL, avec le nom de son entrée de l'archive (GFS ne garde pas
//    d'archive, il garde des PDF) ; tous portent le même `lot` (`options.lot`, un nouveau à chaque export : `lotFor`) et leur `suivants` décroît jusqu'à 0, ce qui offre à la personne, chez GFS, la case « Faire pareil pour les suivants ».
//  - `download(subset)` : fait le téléchargement de l'export ; `subset` est absent quand tout se télécharge, ou la liste des seuls fichiers que le rangement n'a pas gardés (une archive ne reprend que ceux-là).
//  - `options.plan` : le plan (`plan()`) que l'appelant a déjà lu, pour que l'un et l'autre parlent du même export ; `options.progress(rang, total)` : appelé avant chaque dépôt (le coin d'état dit où en est le rangement).
//  - Un fichier à la fois : GFS prend les dépôts l'un après l'autre et chaque appel copie les octets dans le message, `deliver` attend donc la réponse avant d'envoyer le suivant. `GFS_ECHEC` (le serveur Grist refuse un fichier trop gros, ne répond
//    pas) laisse le suivant réussir ; toute autre erreur (`GFS_ANNULE`, la personne a refusé de créer la table des fichiers, et les fichiers suivants du même lot seraient refusés de même ; `GFS_REFUSE` ; `GFS_INCONNU`, un GFS qui ne sait pas ranger ;
//    `GFS_INACTIF` ; `GFS_LECTURE_SEULE` ; `GFS_ACCES`…) arrête les appels de cet export : les fichiers déjà rangés restent rangés.
//  - L'export ne se perd jamais : quand le rangement n'a pas gardé un fichier (erreur, appels arrêtés) et que la personne n'a pas choisi « Télécharger » aussi, ce fichier est téléchargé comme avant, et le coin d'état le dit. Un fichier que la
//    personne ne veut pas (`ignore`, « Annuler » chez GFS) n'est pas téléchargé : elle l'a refusé.
// Rend un rapport (`describe` en tire les phrases du coin d'état) : combien de fichiers rangés, remplacés, copiés (et sous quel nom), ignorés, ceux que GFS n'a pas gardés, ce qui a été téléchargé, et `delivered` - les rangs des fichiers qui sont
// partis quelque part, téléchargés ou rangés -, de quoi ne dater (js/export-date.js) que les lignes dont le PDF existe. `keep(rapport)` puis `takeReport()` le rendent une fois, pour le PDF d'une ligne (js/pdf-export.js ne rend que vrai ou faux).
const PdfDelivery = (function () {
  const KEY = 'pp_export_destination';
  const DESTINATIONS = ['download', 'gfs', 'both'];
  const ORIGIN = 'download';
  const NAME_MAX = 200;    // contrats 5.4, point 9 : le nom pour GFS, de 1 à 200 signes
  const LOT_MAX = 64;      // le nom d'un export en lot, de 1 à 64 signes
  const STATUSES = ['ajoute', 'remplace', 'copie', 'ignore'];
  let last = null;
  let progressHook = null;

  // Le choix gardé pour la personne (jamais autre chose qu'une des trois destinations : une valeur étrangère vaut l'origine).
  function chosen() {
    const raw = PersonStore.get(KEY);
    return DESTINATIONS.indexOf(raw) === -1 ? ORIGIN : raw;
  }
  // GFS peut ranger : l'app est hébergée et GFS a répondu (un `ranger` n'a pas de délai : sans réponse de GFS il attendrait pour toujours).
  const available = () => GfsLink.hosted && GfsLink.isAnswering();
  // La destination qui vaut maintenant : le choix gardé chez GFS, `download` partout ailleurs.
  const destination = () => (available() ? chosen() : ORIGIN);
  // Garde le choix (vrai quand le navigateur ou l'espace de GFS l'a retenu). Une valeur qui n'est pas une destination n'écrit rien.
  const choose = value => DESTINATIONS.indexOf(value) !== -1 && PersonStore.set(KEY, value);
  // Ce que l'export fait de ses PDF : les télécharge, les range, ou les deux.
  function plan() {
    const where = destination();
    return { download: where !== 'gfs', shelve: where !== 'download' };
  }

  // Le nom du PDF pour GFS : 1 à 200 signes, un retour à la ligne devenu une espace, « .pdf » au bout (GFS l'ajouterait, la longueur se compte avec lui).
  function nameFor(name) {
    const clean = String(name == null ? '' : name).replace(/[\r\n]+/g, ' ').trim().replace(/\.pdf$/i, '') || 'publipostage';
    return clean.slice(0, NAME_MAX - 4).trim() + '.pdf';
  }
  // Le nom d'un export en lot (64 signes au plus) : la table et l'instant, un nouveau à chaque export (GFS ne retient que le dernier lot de l'app).
  function lotFor(table) {
    const stamp = String(Math.floor(Date.now() / 1000));
    const base = String(table == null ? '' : table).replace(/\s+/g, '_').slice(0, LOT_MAX - stamp.length - 1) || 'export';
    return base + '-' + stamp;
  }
  // Le fichier que GFS reçoit : un `File` à son nom, de type PDF (un Blob pour un navigateur qui n'a pas le constructeur).
  async function fileOf(entry) {
    const blob = typeof entry.blob === 'function' ? await entry.blob() : entry.blob;
    return typeof File === 'function' ? new File([blob], nameFor(entry.name), { type: 'application/pdf' }) : blob;
  }

  async function deliver(files, download, options) {
    const given = options || {};
    const how = given.plan || plan();
    const report = {
      shelved: how.shelve, total: files.length, counts: { ajoute: 0, remplace: 0, copie: 0, ignore: 0 }, copies: [], failed: [], skipped: 0, stopped: '', downloaded: 0, fellBack: false, delivered: new Set(),
    };
    const outcome = new Array(files.length).fill('');   // le mot de GFS pour chaque fichier, 'failed' ou '' (pas essayé)
    if (how.shelve) {
      for (let i = 0; i < files.length; i += 1) {
        if (report.stopped) { report.skipped += 1; continue; }
        const tell = given.progress || progressHook;
        if (tell) tell(i + 1, files.length);
        try {
          const answer = await GfsLink.deposit({ fichier: await fileOf(files[i]), nom: nameFor(files[i].name), lot: files.length > 1 ? given.lot : undefined, suivants: files.length - 1 - i });
          if (STATUSES.indexOf(answer.statut) === -1) throw Object.assign(new Error('Réponse de GFS illisible : ranger'), { code: 'GFS_REPONSE' });
          outcome[i] = answer.statut;
          report.counts[answer.statut] += 1;
          if (answer.statut === 'copie') report.copies.push(answer.nom || nameFor(files[i].name));
          if (answer.statut !== 'ignore') report.delivered.add(i);
        } catch (e) {
          const code = e && typeof e.code === 'string' ? e.code : '';
          outcome[i] = 'failed';
          report.failed.push({ index: i, code, message: e && e.message ? String(e.message) : '' });
          if (code !== 'GFS_ECHEC') report.stopped = code || 'GFS_ECHEC';
        }
      }
    }
    // Ce qui se télécharge : tout, si la personne a choisi « Télécharger » (ou « les deux », ou si rien ne se range) ; sinon les seuls fichiers que le rangement n'a pas gardés.
    const rest = files.filter((file, i) => how.download || outcome[i] === 'failed' || outcome[i] === '');
    if (rest.length) {
      await download(rest.length === files.length ? undefined : rest);
      report.downloaded = rest.length;
      report.fellBack = !how.download;
      rest.forEach(file => report.delivered.add(files.indexOf(file)));
    }
    return report;
  }

  // Inscrit celui qui dit au coin d'état où en est le rangement (js/main.js) : `fn(rang, total)` avant chaque dépôt, quand l'appelant n'a pas donné le sien (`options.progress`). Un seul abonné.
  function onProgress(fn) { progressHook = typeof fn === 'function' ? fn : null; }

  // Garde le rapport d'un export pour son appelant, qui le reprend par `takeReport` : le PDF d'une ligne (js/pdf-export.js) ne rend que vrai ou faux. Rend le rapport.
  function keep(report) {
    last = report;
    return report;
  }
  // Le dernier rapport gardé, une seule fois (null s'il n'y en a pas : un export qui n'est pas un PDF n'en laisse pas).
  function takeReport() {
    const report = last;
    last = null;
    return report;
  }

  // Pourquoi GFS n'a pas gardé un fichier, en quelques mots : sa propre phrase (écrite dans la langue de la personne) pour la plupart des codes, la nôtre pour ceux qui demandent un mot de plus.
  function reasonOf(failure) {
    if (failure.code === 'GFS_ANNULE') return I18n.t('shelve.reason.annule');
    if (failure.code === 'GFS_INCONNU') return I18n.t('shelve.reason.inconnu');
    if (failure.code === 'GFS_REPONSE') return I18n.t('shelve.reason.reponse');
    return String(failure.message || '').trim().replace(/[.\s]+$/, '') || failure.code || I18n.t('shelve.reason.other');
  }

  // Les phrases du coin d'état pour un rapport : `text` ce que GFS a gardé (un PDF : rangé, remplacé, copié sous un autre nom, refusé par la personne ; plusieurs : leur nombre et ce qui a été remplacé ou gardé en double), `note` - en tête et en
  // rouge - ce que GFS n'a pas gardé et ce que l'app a fait à la place. `rowsFailed` : les lignes dont le PDF n'a pas pu être fabriqué, dites aussi quand rien ne se télécharge (la phrase de fin du téléchargement, qui les compte, n'est pas dite
  // alors). Vides quand rien ne se rangeait.
  function describe(report, rowsFailed) {
    const out = { text: '', note: '' };
    if (!report || !report.shelved) return out;
    const counts = report.counts;
    if (counts.ajoute + counts.remplace + counts.copie + counts.ignore) {
      if (report.total === 1) {
        const only = STATUSES.filter(status => counts[status])[0];
        out.text = I18n.t('shelve.one.' + only, { name: I18n.t('shelve.quoted', { name: report.copies[0] || '' }) });
      } else {
        const kept = counts.ajoute + counts.remplace + counts.copie;
        const detail = [];
        if (counts.remplace) detail.push(I18n.t('shelve.replaced', { n: counts.remplace }));
        if (counts.copie) detail.push(I18n.t('shelve.copied', { n: counts.copie }));
        const pieces = [];
        if (kept) pieces.push(I18n.t('shelve.kept', { n: kept }) + (detail.length ? ' (' + detail.join(', ') + ')' : ''));
        if (counts.ignore) pieces.push(I18n.t('shelve.ignored', { n: counts.ignore }));
        if (rowsFailed && !report.downloaded) pieces.push(I18n.t('shelve.rowsFailed', { failed: rowsFailed }));
        out.text = pieces.join(', ') + '.';
      }
    }
    const lost = report.failed.length + report.skipped;
    if (lost) {
      // La cause d'un arrêt est le dernier échec ; sans arrêt, le premier suffit à dire pourquoi.
      const cause = report.stopped ? report.failed[report.failed.length - 1] : report.failed[0];
      out.note = I18n.t(report.fellBack ? 'shelve.failedDownloaded' : 'shelve.failed', { n: lost, reason: reasonOf(cause) });
    }
    return out;
  }

  // --- Le menu « Destination du PDF » (les trois lignes de #v2-export-pdf-flyout, des cases à cocher comme les options de lignes ; js/main.js : wireExportMenus et syncExportMenus) ---

  // Le réglage de la personne, tel que SettingsHistory le défait et le rétablit.
  const SETTING = {
    read: chosen,
    write: value => choose(value),
    say: value => I18n.t('status.settingSet', { setting: I18n.t('destination.label'), value: I18n.t('destination.' + value) }),
  };

  // Les lignes du menu d'accord avec ce qui vaut maintenant : la ligne cochée est la destination qui s'applique ; les deux lignes qui rangent sont grisées, jamais retirées, quand GFS ne peut pas les faire (info-bulle : pourquoi).
  function sync(flyout) {
    const where = destination();
    const canShelve = available();
    flyout.querySelectorAll('.v2-hover-row[data-destination]').forEach(row => {
      const value = row.dataset.destination;
      const off = value !== 'download' && !canShelve;
      row.setAttribute('aria-checked', value === where ? 'true' : 'false');
      row.classList.toggle('v2-hover-row-disabled', off);
      if (off) { row.setAttribute('aria-disabled', 'true'); row.title = I18n.t('destination.off.tip'); }
      else { row.removeAttribute('aria-disabled'); row.removeAttribute('title'); }
    });
  }

  // Le clic sur une ligne. Grisée, il explique (la fenêtre commune : cette fonction demande Grist Factory Suite) ; sinon il garde le choix, un pas d'Annuler / Rétablir, et `after()` redessine les menus.
  async function pick(row, after) {
    const value = row.dataset.destination;
    if (DESTINATIONS.indexOf(value) === -1) return;
    if (value !== 'download' && !available()) {
      await Dialogs.notice({ title: I18n.t('extension.off.title'), message: I18n.t('destination.off.message'), closeLabel: I18n.t('common.close') });
      return;
    }
    SettingsHistory.track(SETTING, () => choose(value));
    after();
  }

  // Un clic, ou Entrée ou Espace sur la ligne (elle prend le focus, comme les options de lignes du même menu), choisit.
  function wire(flyout, after) {
    flyout.querySelectorAll('.v2-hover-row[data-destination]').forEach(row => {
      row.addEventListener('click', () => pick(row, after));
      row.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        pick(row, after);
      });
    });
  }

  return { KEY, DESTINATIONS, chosen, destination, available, choose, plan, lotFor, nameFor, deliver, onProgress, keep, takeReport, describe, sync, wire };
})();
