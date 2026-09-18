// Export "lien mailto" — SCAFFOLD, pas encore implémenté. Ce fichier existe
// pour fixer par écrit le périmètre fonctionnel discuté avec l'utilisateur
// (2026-09-09, même session que la migration V2/TipTap) avant tout code réel,
// pour le retrouver plus tard sans avoir à rejouer la discussion. Rien
// ci-dessous n'est câblé dans index.html/main.js pour l'instant.
//
// ============================================================================
// POURQUOI CETTE FEATURE (rappel du besoin)
// ============================================================================
// Le même éditeur (TipTap) et le même système de modèles doit permettre,
// EN PLUS de l'export PDF déjà existant, un onglet qui génère un lien
// `mailto:` (destinataires + objet + corps), pour un cas d'usage confirmé
// par l'utilisateur comme entrant dans la faisabilité du protocole mailto
// (pas un envoi programmatique par SMTP/API - explicitement écarté, cf. plus
// bas).
//
// ============================================================================
// CONTRAINTES DURES DU PROTOCOLE mailto: (non négociables, pas des limites
// d'implémentation - à ne pas re-questionner sans nouvelle info)
// ============================================================================
// 1) Le corps (`body=`) est TOUJOURS interprété en texte brut par le client
//    mail (Outlook, Gmail, Apple Mail, Thunderbird...) - aucun moyen de
//    signaler "ceci est du HTML" dans ce protocole. Des balises HTML
//    littérales (ex. "<b>gras</b>") s'afficheraient telles quelles chez le
//    destinataire, pas comme du gras. CONFIRMÉ avec l'utilisateur : aucune
//    mise en forme (gras/italique/souligné/barré/couleur/surlignage/police/
//    taille/alignement) ne peut donc survivre dans le corps - le rendu final
//    est nécessairement du texte plat.
// 2) Longueur totale de l'URL limitée (~2000 caractères tous champs compris -
//    to+cc+bcc+subject+body encodés - variable selon navigateur/client,
//    Outlook desktop étant le plus strict). Un modèle de plusieurs
//    paragraphes peut dépasser ce seuil facilement - prévoir un calcul de
//    longueur ET un avertissement utilisateur avant génération, pas juste au
//    moment de cliquer le lien.
// 3) Aucune pièce jointe possible via un lien `mailto:` - c'est une limite du
//    protocole, pas de l'implémentation. Si le besoin réel avait été
//    "envoyer le PDF généré en pièce jointe", mailto ne peut PAS le faire ;
//    confirmé que ce n'est PAS le besoin ici (juste préremplir un brouillon
//    destinataires+objet+corps texte).
//
// ============================================================================
// DÉCISIONS DE PÉRIMÈTRE ACTÉES AVEC L'UTILISATEUR
// ============================================================================
// - Modèles mailto stockés dans une TABLE GRIST À PART (pas mélangés avec la
//   table des modèles PDF) : un modèle PDF peut contenir tableaux/images/
//   2-colonnes qui n'ont aucun sens en mailto, et à l'inverse destinataires/
//   objet n'ont aucun sens pour un modèle PDF - les mélanger polluerait les
//   deux usages avec des champs non pertinents. Même pattern déjà en place
//   dans ce projet pour d'autres configs dédiées (cf. mémoire
//   project_cross_table_variable_links - règles de liaison inter-tables dans
//   leur propre table Grist).
// - Relation ASYMÉTRIQUE entre les deux éditeurs, explicitement voulue :
//   * Le contenu édité côté MAILTO peut être exporté en PDF aussi (réutilise
//     PdfExport.getNativePdfBlob tel quel - le contenu mailto est un
//     sous-ensemble strict de ce que pdf-export.js sait déjà rendre, aucun
//     changement attendu de ce côté).
//   * L'inverse est FAUX : un modèle PDF (potentiellement riche - tableaux,
//     images, 2-colonnes, mise en forme) ne peut pas être transformé en lien
//     mailto sans perte OU sans risque de dépasser la limite de longueur -
//     pas de bouton "exporter en mailto" prévu depuis l'éditeur PDF.
// - UI : MÊME toolbar TipTap que l'éditeur PDF, mais en mode "mailto" les
//   boutons suivants doivent être désactivés/grisés (aucun effet possible sur
//   le rendu final texte brut) :
//     image, tableau, 2-colonnes, saut de page, sommaire (numérotation avec
//     pages n'a aucun sens sans pagination),
//     gras/italique/souligné/barré, couleur de police, surlignage,
//     police, taille de police, alignement (centré/droite/justifié).
//   Restent utilisables : titres (H1-H6, le texte survit, juste la
//   hiérarchie visuelle disparaît), listes à puces/numérotées (dégradées en
//   "- "/"1. " texte brut), #Variable (résolution déjà partagée, transfère
//   sans changement).
// - Nouveaux champs UI attendus (onglet mailto) : Destinataires (à, cc, bcc ?
//   à trancher), Objet - tous deux avec support #Variable comme le nom de
//   fichier PDF actuel (cf. ReaderMode.resolveFilename, même mécanisme
//   réutilisable).
//
// ============================================================================
// CE QUI RESTE À DÉCIDER (pas encore tranché, à soulever avant de coder)
// ============================================================================
// - Schéma exact de la nouvelle table Grist (colonnes : nom, contenu HTML,
//   destinataires, cc ?, bcc ?, objet - et est-ce que cette table est créée/
//   gérée par le widget lui-même, comme les autres tables de config de ce
//   projet, ou attendue déjà présente ?).
// - Faut-il un avertissement/blocage si le lien dépasse la limite de longueur
//   sûre, ou juste un indicateur (compteur de caractères) laissant
//   l'utilisateur décider ?
// - Le sérialiseur texte-brut (HTML TipTap -> texte) est un morceau de code
//   entièrement nouveau, pas une extension de pdf-export.js - à concevoir
//   séparément (paragraphes -> lignes + ligne vide entre blocs, listes ->
//   préfixes, titres -> texte seul, saut de ligne dur -> %0D%0A à l'encodage
//   URL).
//
// ============================================================================
// SQUELETTE (non câblé, non testé)
// ============================================================================
const MailtoExport = (function () {
  // Limite pratique communément citée pour un lien mailto: multi-client
  // (Outlook desktop en particulier) - garder une marge sous le seuil "dur"
  // plutôt que de viser l'extrême limite au plus juste.
  const SAFE_URL_LENGTH = 2000;

  // Sérialise du HTML DÉJÀ RÉSOLU (plus aucune bulle #Variable/chip - passé par la même résolution
  // que le mode Lecture, ReaderMode.render(), avant d'arriver ici) en texte brut adapté à un corps
  // mailto. Sérialiseur séparé de pdf-export.js (pas une extension, cf. notes en tête de fichier) :
  // règles de dégradation actées avec l'utilisateur - paragraphes/titres -> une ligne, ligne vide
  // entre blocs ; listes -> préfixes "- "/"1. "/"[ ] " ; toute mise en forme (gras/couleur/police...)
  // ignorée, aucune ne pouvant survivre dans du texte brut (§ contraintes dures ci-dessus).
  function plainTextFromHtml(html) {
    const root = document.createElement('div');
    root.innerHTML = html || '';

    // Concatène le texte d'un nœud inline en ne gérant que <br> comme retour à la ligne dur - toute
    // mise en forme est délibérément ignorée (aucune ne peut survivre en texte brut).
    function inlineText(node) {
      let out = '';
      node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) { out += child.textContent; return; }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (child.tagName === 'BR') { out += '\n'; return; }
        // Note de bas de page : pas de page/pied de page en texte brut, la note est réinjectée
        // inline entre parenthèses plutôt que silencieusement perdue.
        if (child.classList && child.classList.contains('footnote-ref-marker')) {
          const text = (child.getAttribute('data-note-text') || '').trim();
          out += text ? ` (${text})` : '';
          return;
        }
        if (child.tagName === 'IMG') return; // aucune image possible en texte brut mailto
        if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') return; // jamais de contenu utilisateur, à ignorer partout où il peut apparaître
        out += inlineText(child);
      });
      return out;
    }

    // Une liste à puces/numérotée/à cases dégrade en préfixe texte (décision actée, cf. en-tête de
    // fichier) - les sous-listes imbriquées sont indentées de 2 espaces par niveau.
    function listItemsText(listEl, depth) {
      const ordered = listEl.tagName === 'OL';
      const isTaskList = listEl.getAttribute('data-type') === 'taskList';
      const indent = '  '.repeat(depth);
      const lines = [];
      let index = 0;
      Array.from(listEl.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        index++;
        let prefix;
        if (isTaskList) prefix = (li.getAttribute('data-checked') === 'true') ? '[x] ' : '[ ] ';
        else if (ordered) prefix = index + '. ';
        else prefix = '- ';
        const directText = Array.from(li.childNodes)
          .filter(n => !(n.nodeType === Node.ELEMENT_NODE && (n.tagName === 'UL' || n.tagName === 'OL')))
          .map(n => n.nodeType === Node.ELEMENT_NODE ? inlineText(n) : n.textContent)
          .join('').trim();
        lines.push(indent + prefix + directText);
        li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => { lines.push(...listItemsText(sub, depth + 1)); });
      });
      return lines;
    }

    const blocks = [];
    root.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) blocks.push(text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (tag === 'UL' || tag === 'OL') { blocks.push(listItemsText(node, 0).join('\n')); return; }
      if (/^H[1-6]$/.test(tag) || tag === 'P' || tag === 'BLOCKQUOTE') { blocks.push(inlineText(node).trim()); return; }
      if (tag === 'HR') { blocks.push('---'); return; }
      if (tag === 'IMG') return;
      // Balise jamais destinée à l'utilisateur (ex. <style> injecté par l'aperçu A4 paginé de
      // ReaderMode dans .reader-content) - à ignorer, jamais à extraire comme texte.
      if (tag === 'STYLE' || tag === 'SCRIPT') return;
      if (tag === 'TABLE') {
        // Dégradation minimale (le bouton Tableau est grisé en mode email - ce cas ne devrait
        // survenir qu'après un collage) : une ligne par ligne de tableau, cellules séparées par " | ".
        const rows = Array.from(node.querySelectorAll('tr')).map(tr =>
          Array.from(tr.querySelectorAll('td, th')).map(cell => inlineText(cell).trim()).join(' | ')
        );
        blocks.push(rows.join('\n'));
        return;
      }
      // Repli générique (zone 2-colonnes, autre bloc non prévu ci-dessus) : extrait le texte plutôt
      // que de le perdre silencieusement.
      const text = inlineText(node).trim();
      if (text) blocks.push(text);
    });

    return blocks.filter(b => b.length > 0).join('\n\n');
  }

  // Encode une liste d'adresses séparées par virgule individuellement (jamais la virgule elle-même,
  // qui doit rester le séparateur littéral attendu par les clients mail - Outlook bureau, client
  // cible retenu §0, inclus) plutôt qu'un encodeURIComponent global sur toute la chaîne.
  function encodeAddressList(value) {
    if (!value) return '';
    return value.split(',').map(a => a.trim()).filter(Boolean).map(a => encodeURIComponent(a)).join(',');
  }

  // Construit l'URL mailto: complète. to/cc/bcc/subject/bodyText sont attendus DÉJÀ RÉSOLUS
  // (#Variable substituées en amont, même mécanisme que ReaderMode côté PDF - réutilisé, pas
  // réécrit) - cette fonction ne fait qu'assembler et encoder.
  function buildMailtoUrl({ to, cc, bcc, subject, bodyText }) {
    const params = [];
    if (cc) params.push('cc=' + encodeAddressList(cc));
    if (bcc) params.push('bcc=' + encodeAddressList(bcc));
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    // CRLF requis par le protocole mailto: (RFC 6068) - Outlook bureau y est strict, un simple \n
    // ne suffit pas toujours.
    if (bodyText) params.push('body=' + encodeURIComponent(bodyText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')));
    const query = params.length ? '?' + params.join('&') : '';
    return 'mailto:' + encodeAddressList(to) + query;
  }

  // TODO: longueur de l'URL construite vs SAFE_URL_LENGTH - retourne de quoi
  // afficher un avertissement (pas un blocage dur, cf. décision à prendre).
  function checkUrlLength(url) {
    return { length: url.length, safe: url.length <= SAFE_URL_LENGTH, limit: SAFE_URL_LENGTH };
  }

  return { plainTextFromHtml, buildMailtoUrl, checkUrlLength };
})();
