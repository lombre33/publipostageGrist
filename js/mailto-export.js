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

  // TODO: sérialise un document TipTap (le root DOM, comme pdf-export.js
  // l'attend déjà) en texte brut adapté à un corps mailto - PAS une
  // extension de pdf-export.js, un sérialiseur séparé (cf. notes ci-dessus).
  function plainTextFromHtml(html) {
    throw new Error('MailtoExport.plainTextFromHtml: pas encore implémenté');
  }

  // TODO: construit l'URL mailto: complète (to/cc/bcc/subject/body encodés),
  // #Variable déjà résolues en amont (même mécanisme que ReaderMode.preview
  // côté PDF - à réutiliser, pas à réécrire).
  function buildMailtoUrl({ to, cc, bcc, subject, bodyText }) {
    throw new Error('MailtoExport.buildMailtoUrl: pas encore implémenté');
  }

  // TODO: longueur de l'URL construite vs SAFE_URL_LENGTH - retourne de quoi
  // afficher un avertissement (pas un blocage dur, cf. décision à prendre).
  function checkUrlLength(url) {
    return { length: url.length, safe: url.length <= SAFE_URL_LENGTH, limit: SAFE_URL_LENGTH };
  }

  return { plainTextFromHtml, buildMailtoUrl, checkUrlLength };
})();
