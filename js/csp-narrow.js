// LA POLITIQUE SE REFERME AU SEUL SERVEUR DE GRIST (24/11, « plus aucun appel externe dans la politique »).
// La politique d'index.html ne peut pas nommer le serveur de Grist de la personne (chaque instance a le sien : le service en ligne de Grist, celui d'un ministère, celui d'une mairie...) : pour les pièces jointes et
// la lecture légère du document elle ouvre `https:` dans `img-src` et `connect-src`, ce que GFS accepte (règle S3, l'exception du serveur de Grist, dite dans « Adresses que l'app appelle ») mais qui laisse,
// dans le navigateur, n'importe quel hôte en https. Dès que l'adresse du serveur est connue (le jeton d'accès qu'il donne la porte : js/grist-api.js:getAccessTokenCached), ce module pose une SECONDE
// balise de politique. Deux politiques s'appliquent ENSEMBLE (ce que chacune permet, le navigateur ne le permet que si les deux le permettent) : la seconde ne peut que resserrer la première, jamais l'élargir.
// Elle remplace `https:` par cette seule origine dans `img-src` et `connect-src` ; tout le reste de ces deux directives (`'self'`, `data:`, `blob:`, les deux dossiers de polices de jsDelivr) est repris tel quel.
// Après elle, une image ou une connexion vers un autre hôte est refusée par le navigateur, et le relais des appels bloqués de GFS (kit) le voit passer.
//  - UNE SEULE FOIS par page : l'intersection de deux origines différentes ne laisserait plus aucun serveur. La première est celle que l'app emploie pour tout (le jeton donne la même adresse à la lecture,
//    aux pièces jointes et à l'envoi d'un PDF) ; une autre origine ensuite n'est pas ajoutée (et l'app, elle, n'en change pas).
//  - Seule une origine https simple est prise (un nom d'hôte et un port éventuel) : ni chemin, ni joker, ni identifiant, ni `;`, ni espace, ni hôte numérique entre crochets. Sinon rien n'est posé et `https:` reste, comme avant.
//  - Rien ne change pour ce qui est déjà chargé : seules les demandes suivantes sont jugées. L'app ne montre aucune image du document ni ne lit rien avant d'avoir ce jeton.
//  - Une page sans balise de politique, ou dont `img-src` et `connect-src` n'ouvrent pas `https:` : rien à resserrer, rien n'est posé.
//    CspNarrow.toGristServer(origin) -> vrai quand la seconde balise vient d'être posée
//    CspNarrow.origin()              -> l'origine retenue, '' tant que rien n'est posé
// Script classique, sans dépendance : rien d'autre que le navigateur.
const CspNarrow = (function () {
  const ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;
  const NARROWED = ['img-src', 'connect-src'];
  let kept = '';

  // La balise de la politique d'index.html (la première) : jamais celle que ce module pose.
  function pagePolicy() {
    const metas = Array.from(document.querySelectorAll('meta[http-equiv]'));
    return metas.find(meta => /^content-security-policy$/i.test(meta.getAttribute('http-equiv') || '') && !meta.hasAttribute('data-pp-narrowed')) || null;
  }

  // Les sources d'une directive dans le texte d'une politique ; null quand elle n'y est pas.
  function sourcesOf(content, name) {
    for (const part of content.split(';')) {
      const words = part.trim().split(/\s+/);
      if (words[0] && words[0].toLowerCase() === name) return words.slice(1);
    }
    return null;
  }

  function toGristServer(origin) {
    try {
      if (kept || typeof origin !== 'string' || !ORIGIN.test(origin) || !document.head) return false;
      const page = pagePolicy();
      if (!page) return false;
      const wanted = origin.toLowerCase();
      const content = page.getAttribute('content') || '';
      const parts = [];
      NARROWED.forEach((name) => {
        const sources = sourcesOf(content, name);
        if (sources && sources.includes('https:')) parts.push(name + ' ' + sources.map(source => (source === 'https:' ? wanted : source)).join(' '));
      });
      if (!parts.length) return false;
      const meta = document.createElement('meta');
      meta.setAttribute('http-equiv', 'Content-Security-Policy');
      meta.setAttribute('content', parts.join('; '));
      meta.setAttribute('data-pp-narrowed', wanted);
      document.head.appendChild(meta);
      kept = wanted;
      return true;
    } catch (e) {
      return false;
    }
  }

  return { toGristServer, origin: () => kept };
})();
