// Le contrôle des lignes avant un export en lot (choix du 11/11 : « Auto, seulement si problème »). Avant de générer 300 documents, le lot est parcouru une fois SANS fabriquer un seul fichier : chaque ligne est lue
// comme l'export la lira (ReaderMode.inspect : les mêmes bulles, sans images, codes QR ni mise en page) et la fenêtre ne s'ouvre que s'il y a de quoi la remplir. Rien à signaler : l'export continue comme avant, sans un clic de plus.
// Ce qui est signalé (ce que la personne voit mal en ouvrant le fichier fini) :
//  - `wrongKind` : « Modèle selon la ligne » envoie la ligne vers un modèle que cet export ne fait pas (une grille en Word, un document en Excel) : elle n'est pas générée ;
//  - `error` : une bulle dont le document écrirait un message d'erreur (colonne ou table disparue, ligne introuvable, calcul faux) ;
//  - `image` : une pièce jointe que le document ne dessinerait pas (ce n'est pas une image : une note à sa place ; ou sans fiche dans Grist : supprimée) ;
//  - `broken` : une variable cassée du modèle (colonne, table ou chemin disparus : le rouge de l'éditeur) que le document écrit vide, sans un mot - une ligne de la liste pour tout le lot, sans ligne de table (`rowId` nul) ;
//  - `nameEmpty` : le nom du fichier que le modèle donne est vide (le fichier prend le nom « document-n° »), `nameDuplicate` : le même nom qu'une ligne plus haut (un « (2) » est ajouté). Seulement pour une archive ZIP dont
//    le modèle a un nom de fichier : sans nom choisi, tous les fichiers s'appellent pareil par défaut, ce n'est pas un problème à signaler ; un PDF unique ou une planche n'ont pas de noms.
// Les trois premiers rendent le document faux ou absent (`blocking`) : « Générer sans ces lignes » les laisse de côté. Les deux noms ne gênent pas le document, mais ouvrent la fenêtre eux aussi (« nom en double » faisait partie
// de ce que la personne a demandé de contrôler) ; ils ne sont jamais écartés : « Générer quand même » est alors le seul choix.
//   BatchPrecheck.scan(jobs, { tableId, htmlOf(job), wrongKindOf(job), nameOf(job)?, onProgress?(current, total) }) -> Promise<{ problems, stopped }>
//    jobs : ceux de l'export ([{ row, source, variant, rowHtml? }]) ; htmlOf(job) : le HTML que l'export écrirait pour ce document (async) ; wrongKindOf(job) : 'grid', 'document' ou null (le genre que cet export ne fait pas) ;
//    nameOf(job) : { base, empty } - le nom du fichier sans extension, tel que l'archive le prend, et vrai quand le modèle n'en donne aucun -, ou null/absent : les noms ne comptent pas (rien n'est comparé).
//    problems : [{ rowId, jobIndex, kind, blocking, key?, text?, name?, other? }] dans l'ordre des documents ; stopped : « Arrêter » cliqué sur la pastille (js/batch-progress.js) : le contrôle s'arrête, l'export aussi.
//    Les lignes sont lues par séries de CHUNK documents dans une même passe de lecture (GristAPI.withReadPass) : chaque table n'est lue qu'une fois par série, pas une fois par ligne.
//   BatchPrecheck.review(problems, { total, rowCount, format, rowNameOf? }) -> Promise<{ action: 'go' | 'skip' | 'cancel', leftOut: Set<number> }>
//    total : le nombre de documents du lot, rowCount : celui de ses lignes (un document par valeur fait plus de documents que de lignes) ; rowNameOf(problem) : le nom que le fichier de la ligne aurait (async), un repère de plus que son n°.
//    La fenêtre : la liste des problèmes (cent au plus), « Annuler » (action 'cancel', Échap compris, le focus y arrive), « Générer sans ces lignes » (action 'skip', seulement quand des lignes rendent leur document faux et qu'il
//    en reste d'autres : `leftOut` = les identifiants de ces lignes) et « Générer quand même » (action 'go'). Aucun problème : la fenêtre ne s'ouvre pas, action 'go'.
const BatchPrecheck = (function () {
  const CHUNK = 25;
  // Au-delà, la liste dit combien d'autres problèmes la suivent : la fenêtre reste lisible quand tout un lot a le même défaut.
  const MAX_LISTED = 100;
  // Le texte d'une erreur de bibliothèque ou de variable peut être long : coupé, pour que chaque ligne se lise d'un coup d'œil.
  const MAX_TEXT = 120;

  const clip = text => {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    return flat.length > MAX_TEXT ? flat.slice(0, MAX_TEXT - 1) + '…' : flat;
  };

  async function scan(jobs, { tableId, htmlOf, wrongKindOf, nameOf, onProgress }) {
    const problems = [];
    const pace = WorkPacer.create();
    const progress = BatchProgress.begin({ key: 'batchPrecheck.progress', total: jobs.length });
    const firstRowOfName = new Map();
    const brokenSeen = new Set();
    let seen = 0;
    let known = 0;
    const unknownImages = [];
    let stopped = false;
    try {
      for (let start = 0; start < jobs.length && !stopped; start += CHUNK) {
        await GristAPI.withReadPass(async () => {
          for (let i = start; i < Math.min(jobs.length, start + CHUNK); i++) {
            await pace();
            if (progress && progress.stopped()) { stopped = true; return; }
            if (progress) progress.update(i + 1);
            if (onProgress) onProgress(i + 1, jobs.length);
            const job = jobs[i];
            const rowId = job.row.id;
            const wrongKind = wrongKindOf(job);
            if (wrongKind) { problems.push({ rowId, jobIndex: i, kind: 'wrongKind', blocking: true, wrongKind }); continue; }
            try {
              const found = await ReaderMode.inspect(await htmlOf(job), tableId, job.row);
              // Une variable cassée l'est dans tout le lot : une seule ligne de la liste, pas une par document (ni une ligne de la table : rien à écarter).
              found.broken.forEach(b => {
                if (brokenSeen.has(b.key)) return;
                brokenSeen.add(b.key);
                problems.push({ rowId: null, jobIndex: i, kind: 'broken', blocking: false, key: b.key, reason: b.reason });
              });
              found.errors.forEach(e => problems.push({ rowId, jobIndex: i, kind: 'error', blocking: true, key: e.key, text: e.text, calc: !!e.calc }));
              found.images.forEach(image => {
                const problem = { rowId, jobIndex: i, kind: 'image', blocking: true, key: image.key, name: image.name, reason: image.reason };
                // Sans fiche : ne vaut un problème qu'une fois le total connu (la table des pièces jointes est-elle lisible ?).
                if (image.reason === 'unknown') unknownImages.push(problem); else problems.push(problem);
              });
              seen += found.seen;
              known += found.known;
            } catch (e) {
              // Une ligne que le contrôle n'a pas pu lire n'est pas un problème : l'export la tentera, et la fenêtre de fin de lot dira son échec s'il y en a un.
              console.error('[BatchPrecheck] ligne illisible pour le contrôle', rowId, e);
            }
            const naming = nameOf ? await nameOf(job) : null;
            if (naming) {
              if (naming.empty) problems.push({ rowId, jobIndex: i, kind: 'nameEmpty', blocking: false, name: naming.base });
              else if (firstRowOfName.has(naming.base)) problems.push({ rowId, jobIndex: i, kind: 'nameDuplicate', blocking: false, name: naming.base, other: firstRowOfName.get(naming.base) });
              else firstRowOfName.set(naming.base, rowId);
            }
          }
        });
      }
    } finally { if (progress) progress.end(); }
    // Aucune pièce jointe du lot n'a de fiche : la table des pièces jointes de Grist est illisible (accès, réseau), `unknown` ne prouve rien - le même repli que la Lecture, qui tient alors toute pièce pour une image.
    if (known > 0) unknownImages.forEach(problem => problems.push(problem));
    problems.sort((a, b) => a.jobIndex - b.jobIndex);
    return { problems, stopped };
  }

  function reasonText(problem, format) {
    switch (problem.kind) {
      case 'wrongKind': return I18n.t('batchFailures.wrongKind.' + problem.wrongKind, { format });
      case 'broken': return I18n.t('batchPrecheck.reason.broken.' + problem.reason, { key: problem.key });
      case 'error': return I18n.t(problem.calc ? 'batchPrecheck.reason.errorCalc' : 'batchPrecheck.reason.error', { key: clip(problem.key), text: clip(problem.text) });
      case 'image': return I18n.t('batchPrecheck.reason.image.' + problem.reason, { key: problem.key, name: clip(problem.name) });
      case 'nameEmpty': return I18n.t('batchPrecheck.reason.nameEmpty', { name: problem.name });
      default: return I18n.t('batchPrecheck.reason.nameDuplicate', { other: problem.other });
    }
  }

  const lineText = (problem, format) => (problem.kind === 'broken'
    ? I18n.t('batchPrecheck.line.broken', { reason: reasonText(problem, format) })
    : I18n.t('batchFailures.line', { row: rowLabel(problem), reason: reasonText(problem, format) }));

  const rowLabel = problem => (problem.rowName
    ? I18n.t('batchFailures.row.named', { name: problem.rowName, id: problem.rowId })
    : I18n.t('batchFailures.row.unnamed', { id: problem.rowId }));

  async function review(problems, { total, rowCount, format = '', rowNameOf } = {}) {
    if (!problems || !problems.length) return { action: 'go', leftOut: new Set() };
    const blockingRows = new Set(problems.filter(problem => problem.blocking).map(problem => problem.rowId));
    const rows = new Set(problems.filter(problem => problem.rowId != null).map(problem => problem.rowId));
    const brokenCount = problems.filter(problem => problem.kind === 'broken').length;
    const canSkip = blockingRows.size > 0 && blockingRows.size < (rowCount || Infinity);
    const listed = problems.slice(0, MAX_LISTED);
    // Les noms des fichiers des lignes listées : une seule passe de lecture pour toutes (le nom n'est qu'un repère : illisible, la ligne se reconnaît à son n°).
    if (rowNameOf) await GristAPI.withReadPass(async () => { for (const problem of listed) { try { problem.rowName = await rowNameOf(problem); } catch (e) { problem.rowName = ''; } } });
    const lines = listed.map(problem => lineText(problem, format));
    if (problems.length > MAX_LISTED) lines.push(I18n.t('batchPrecheck.more', { n: problems.length - MAX_LISTED }));
    const intro = [rows.size ? I18n.t('batchPrecheck.intro', { n: rows.size, total }) : '', brokenCount ? I18n.t('batchPrecheck.introBroken', { n: brokenCount }) : '', I18n.t('batchPrecheck.introNothing'), canSkip ? I18n.t('batchPrecheck.introSkip') : ''].filter(Boolean).join(' ');
    const choices = [];
    if (canSkip) choices.push({ value: 'skip', label: I18n.t('batchPrecheck.skip') });
    choices.push({ value: 'go', label: I18n.t('batchPrecheck.go') });
    const answer = await Dialogs.choose({ title: I18n.t('batchPrecheck.title', { n: rows.size + brokenCount }), message: intro + '\n\n' + lines.join('\n'), choices });
    if (answer === 'go') return { action: 'go', leftOut: new Set() };
    if (answer === 'skip') return { action: 'skip', leftOut: blockingRows };
    return { action: 'cancel', leftOut: new Set() };
  }

  return { scan, review };
})();
