// L'ouverture du document que GFS désigne SANS lire la table des modèles entière d'abord (24/11 : « ça ne sera pas tenable de tout lire en mémoire dès que GFS aura des centaines de dossiers... quand on lance PP sur un
// document, ne lire que celui-là, de la manière la plus efficace possible »). La table `Publipostage_Templates` porte les noms ET les contenus : chez une personne elle pèse 42 Mo, dont 94 % de présentations, et sa lecture
// (4,6 s sur 7,3) tient tout le démarrage, jusqu'au document qu'elle n'a pas besoin de lire. Ici, la ligne du document désigné et celle des réglages du document, lues par l'interface REST de Grist (js/early-preview.js, une
// demande chacune, le jeton en lecture seule), prennent la place du cache des modèles (Templates.seedPartial) : le document s'ouvre depuis lui, et la table entière se lit ensuite, en fond (`finish`, à la fin du démarrage).
//
// Quand cela se fait : GFS désigne un fichier (ni import, ni lecture de PDF, ni modèle du catalogue), la ligne est un DOCUMENT (pas une présentation, une grille, un e-mail ni un macro-modèle : leurs liens vers d'autres
// modèles se lisent dans toute la table), son texte ne porte aucun lien vers un autre modèle (tableau lié à une grille, diapositive liée, copie de diapositive ou de page), la table a ses colonnes d'aujourd'hui (une table
// d'avant les noms anglais passe par la migration de la lecture entière), les réglages du document ont été lus, et la personne n'est pas revenue d'un changement de langue (le modèle qu'elle rouvre est celui du fragment de
// l'adresse, et il n'est pas forcément la ligne désignée). Au moindre doute, le démarrage est celui d'avant : la table entière se lit tout de suite, comme avant.
//
// Ce que le cache partiel ne sait pas : les autres documents. Tout geste qui s'en sert (la liste, « Organiser », le ★, l'e-mail lié, un nom à rendre unique, un autre document que GFS demande d'ouvrir) l'attend
// (Templates.whenComplete), et toute écriture aussi. Le rapport de fluidité (js/perf-trace.js) dit les étapes (`modèles : cache partiel`, `modèles : liste complète`, `ouverture : …`).
const EarlyOpen = (function () {
  // Un texte qui parle d'un autre modèle : tableau lié (js/linked-table.js, `data-linked-…`), diapositive liée (js/slide-links.js, `data-link-…`), copie de diapositive ou de page (js/slide-copies.js, js/page-copies.js,
  // `data-slide-…`). Large à dessein : un faux positif ouvre le document comme avant, un faux négatif lui ferait chercher un modèle que le cache partiel n'a pas.
  const OTHER_MODELS = /\bdata-(?:linked|link|slide|page)-[a-z-]+\s*=/i;
  // Au plus ce temps pour que la ligne arrive : au-delà, la table entière se lit sans elle (une ligne qui n'arrive pas ne doit pas retarder la lecture d'avant de plus que cela).
  const ROW_WAIT_MS = 2500;
  // 'idle' : pas décidé ; 'partial' : le document s'ouvre depuis son cache ; 'full' : la table entière se lit, comme avant.
  let plan = 'idle';

  const trace = (label, extra) => { if (typeof PerfTrace !== 'undefined') { try { PerfTrace.mark(label, extra); } catch (e) { /* le rapport ne doit rien casser */ } } };

  // Un rechargement voulu par l'app (changement de langue : `#pp-open=<id>`) rouvre le modèle de l'adresse, avant celui que GFS désigne (js/main.js) : pas de cache partiel, ce modèle n'y est pas forcément.
  const reopens = () => /^#pp-open=/.test(String(location.hash || ''));

  const waitFor = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]);

  // La raison pour laquelle le cache partiel ne convient pas, ou '' quand il convient (la ligne est posée) : `row` est ce que EarlyPreview.row() a rendu.
  async function seedFrom(row) {
    if (!row) return 'pas de ligne désignée';
    if (reopens()) return 'rechargement qui rouvre un modèle';
    if (row.tpl.typeModele !== 'document') return 'pas un document';
    if (OTHER_MODELS.test(row.tpl.contenu || '')) return 'texte lié à un autre modèle';
    const settings = await waitFor(row.settings, ROW_WAIT_MS);
    if (!settings) return 'réglages du document illisibles';
    return Templates.seedPartial(row.record, settings) ? '' : 'ligne sans les colonnes d’aujourd’hui';
  }

  // Le cache qui sert au démarrage : la même promesse que Templates.loadAll() (la liste des modèles), prête dès que le document est lu quand le cache partiel convient, après la table entière sinon.
  async function startupTemplates() {
    let reason = '';
    try {
      // GFS dit le type du fichier qu'il désigne : une présentation, une grille, un e-mail ou un macro-modèle ne s'ouvre pas depuis sa seule ligne, et la table entière n'attend pas la demande de sa ligne (jeton compris).
      await GfsLink.ready;
      const asked = GfsLink.opening();
      const kind = asked && asked.fichier && asked.fichier.type;
      reason = kind && kind !== 'document' ? 'GFS désigne un fichier de type ' + kind : await seedFrom(await waitFor(EarlyPreview.row(), ROW_WAIT_MS));
    } catch (e) { reason = 'erreur : ' + ((e && e.message) || e); }
    if (!reason) {
      plan = 'partial';
      trace('ouverture : le document seul', { ms: Math.round(performance.now()) });
      return Templates.getCached();
    }
    plan = 'full';
    trace('ouverture : la table entière', { raison: reason });
    return Templates.loadAll();
  }

  // À la fin du démarrage : la table entière se lit, en fond, et prend la place du cache partiel (js/main.js redessine alors la liste). Rien quand la table entière est déjà lue.
  function finish() {
    if (plan !== 'partial' || Templates.isComplete()) return;
    Templates.loadAll().catch((e) => { console.warn('[EarlyOpen] la liste des documents n’a pas pu être lue', e); });
  }

  return { startupTemplates, finish, plan: () => plan };
})();
