// « PDF/A (archivage) » : le PDF d'une ligne passé en PDF/A-2b (ISO 19005-2, niveau B), le format que les archives, les cabinets comptables et les administrations demandent
// pour garder un document (une facture) lisible à l'identique des années plus tard. Chargé à la demande (moteur « archive » de js/export-engines.js), au seul moment où un PDF
// en a besoin : le type « PDF/A (archivage) » du menu Type d'export (js/main-export.js) et js/pdf-export.js (renderDocument), jamais à l'ouverture.
// Le PDF que pdfmake écrit remplit déjà presque toutes les règles de ce format (polices incorporées, ni script ni média, pas de chiffrement) : il manque la description XMP du document, qui
// dit « je suis du PDF/A-2b », et l'intention de rendu des couleurs (un profil sRGB, puisque pdfmake peint en RVB sans le dire). Cette conversion les ajoute APRÈS la mise en page, avec
// pdf-lib (celui du PDF unique, js/pdf-merge.js) : le contenu des pages n'est pas touché, le fichier pèse quelques ko de plus. Mesuré avec veraPDF 1.28.2 sur les vrais PDF de l'app
// (une ligne, filigrane et symboles de repli, image à transparence, PDF unique, lot ZIP) : conforme PDF/A-2b, et aussi 2u et 3b. Un PDF/A ne peut pas être chiffré : « PDF protégé » reste un
// type à part, et la conversion refuse un PDF chiffré plutôt que d'en livrer un qui ne l'est plus.
// Ce que cette conversion ne fait PAS : le PDF balisé pour les lecteurs d'écran (PDF/UA, une autre étude) ni la langue du document (aucun réglage de langue par document).
const PdfArchive = (function () {
  const PRODUCER = 'Publipostage+ (pdfmake, pdf-lib)';
  const PROFILE_NAME = 'sRGB IEC61966-2.1';

  // sRGB2014.icc du International Color Consortium (3 024 octets, profil v2 d'écran RVB, tel quel), l'intention de rendu qu'exige un PDF/A dont les couleurs sont en RVB. Son droit d'auteur est à l'ICC,
  // qui autorise de le copier, le distribuer et l'incorporer dans un logiciel sans restriction à condition de ne pas le modifier : NOTICE le cite. Encodé en base64 comme les polices de js/pdf-fonts.js.
  const PROFILE_BASE64 = [
    'AAAL0AAAAAACAAAAbW50clJHQiBYWVogB98AAgAPAAAAAAAAYWNzcAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAPbWAAEA' +
    'AAAA0y0AAAAAPQ6y3q6Tl76bZybOjApDzgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQZGVzYwAAAUQAAABjYlhZWgAA' +
    'AagAAAAUYlRSQwAAAbwAAAgMZ1RSQwAAAbwAAAgMclRSQwAAAbwAAAgMZG1kZAAACcgAAACIZ1hZWgAAClAAAAAUbHVtaQAACmQA' +
    'AAAUbWVhcwAACngAAAAkYmtwdAAACpwAAAAUclhZWgAACrAAAAAUdGVjaAAACsQAAAAMdnVlZAAACtAAAACHd3RwdAAAC1gAAAAU' +
    'Y3BydAAAC2wAAAA3Y2hhZAAAC6QAAAAsZGVzYwAAAAAAAAAJc1JHQjIwMTQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAAAkoAAAD4QAALbPY3VydgAA' +
    'AAAAAAQAAAAABQAKAA8AFAAZAB4AIwAoAC0AMgA3ADsAQABFAEoATwBUAFkAXgBjAGgAbQByAHcAfACBAIYAiwCQAJUAmgCfAKQA' +
    'qQCuALIAtwC8AMEAxgDLANAA1QDbAOAA5QDrAPAA9gD7AQEBBwENARMBGQEfASUBKwEyATgBPgFFAUwBUgFZAWABZwFuAXUBfAGD' +
    'AYsBkgGaAaEBqQGxAbkBwQHJAdEB2QHhAekB8gH6AgMCDAIUAh0CJgIvAjgCQQJLAlQCXQJnAnECegKEAo4CmAKiAqwCtgLBAssC' +
    '1QLgAusC9QMAAwsDFgMhAy0DOANDA08DWgNmA3IDfgOKA5YDogOuA7oDxwPTA+AD7AP5BAYEEwQgBC0EOwRIBFUEYwRxBH4EjASa' +
    'BKgEtgTEBNME4QTwBP4FDQUcBSsFOgVJBVgFZwV3BYYFlgWmBbUFxQXVBeUF9gYGBhYGJwY3BkgGWQZqBnsGjAadBq8GwAbRBuMG' +
    '9QcHBxkHKwc9B08HYQd0B4YHmQesB78H0gflB/gICwgfCDIIRghaCG4IggiWCKoIvgjSCOcI+wkQCSUJOglPCWQJeQmPCaQJugnP' +
    'CeUJ+woRCicKPQpUCmoKgQqYCq4KxQrcCvMLCwsiCzkLUQtpC4ALmAuwC8gL4Qv5DBIMKgxDDFwMdQyODKcMwAzZDPMNDQ0mDUAN' +
    'Wg10DY4NqQ3DDd4N+A4TDi4OSQ5kDn8Omw62DtIO7g8JDyUPQQ9eD3oPlg+zD88P7BAJECYQQxBhEH4QmxC5ENcQ9RETETERTxFt' +
    'EYwRqhHJEegSBxImEkUSZBKEEqMSwxLjEwMTIxNDE2MTgxOkE8UT5RQGFCcUSRRqFIsUrRTOFPAVEhU0FVYVeBWbFb0V4BYDFiYW' +
    'SRZsFo8WshbWFvoXHRdBF2UXiReuF9IX9xgbGEAYZRiKGK8Y1Rj6GSAZRRlrGZEZtxndGgQaKhpRGncanhrFGuwbFBs7G2Mbihuy' +
    'G9ocAhwqHFIcexyjHMwc9R0eHUcdcB2ZHcMd7B4WHkAeah6UHr4e6R8THz4faR+UH78f6iAVIEEgbCCYIMQg8CEcIUghdSGhIc4h' +
    '+yInIlUigiKvIt0jCiM4I2YjlCPCI/AkHyRNJHwkqyTaJQklOCVoJZclxyX3JicmVyaHJrcm6CcYJ0kneierJ9woDSg/KHEooijU' +
    'KQYpOClrKZ0p0CoCKjUqaCqbKs8rAis2K2krnSvRLAUsOSxuLKIs1y0MLUEtdi2rLeEuFi5MLoIuty7uLyQvWi+RL8cv/jA1MGww' +
    'pDDbMRIxSjGCMbox8jIqMmMymzLUMw0zRjN/M7gz8TQrNGU0njTYNRM1TTWHNcI1/TY3NnI2rjbpNyQ3YDecN9c4FDhQOIw4yDkF' +
    'OUI5fzm8Ofk6Njp0OrI67zstO2s7qjvoPCc8ZTykPOM9Ij1hPaE94D4gPmA+oD7gPyE/YT+iP+JAI0BkQKZA50EpQWpBrEHuQjBC' +
    'ckK1QvdDOkN9Q8BEA0RHRIpEzkUSRVVFmkXeRiJGZ0arRvBHNUd7R8BIBUhLSJFI10kdSWNJqUnwSjdKfUrESwxLU0uaS+JMKkxy' +
    'TLpNAk1KTZNN3E4lTm5Ot08AT0lPk0/dUCdQcVC7UQZRUFGbUeZSMVJ8UsdTE1NfU6pT9lRCVI9U21UoVXVVwlYPVlxWqVb3V0RX' +
    'klfgWC9YfVjLWRpZaVm4WgdaVlqmWvVbRVuVW+VcNVyGXNZdJ114XcleGl5sXr1fD19hX7NgBWBXYKpg/GFPYaJh9WJJYpxi8GND' +
    'Y5dj62RAZJRk6WU9ZZJl52Y9ZpJm6Gc9Z5Nn6Wg/aJZo7GlDaZpp8WpIap9q92tPa6dr/2xXbK9tCG1gbbluEm5rbsRvHm94b9Fw' +
    'K3CGcOBxOnGVcfByS3KmcwFzXXO4dBR0cHTMdSh1hXXhdj52m3b4d1Z3s3gReG54zHkqeYl553pGeqV7BHtje8J8IXyBfOF9QX2h' +
    'fgF+Yn7CfyN/hH/lgEeAqIEKgWuBzYIwgpKC9INXg7qEHYSAhOOFR4Wrhg6GcobXhzuHn4gEiGmIzokziZmJ/opkisqLMIuWi/yM' +
    'Y4zKjTGNmI3/jmaOzo82j56QBpBukNaRP5GokhGSepLjk02TtpQglIqU9JVflcmWNJaflwqXdZfgmEyYuJkkmZCZ/JpomtWbQpuv' +
    'nByciZz3nWSd0p5Anq6fHZ+Ln/qgaaDYoUehtqImopajBqN2o+akVqTHpTilqaYapoum/adup+CoUqjEqTepqaocqo+rAqt1q+ms' +
    'XKzQrUStuK4trqGvFq+LsACwdbDqsWCx1rJLssKzOLOutCW0nLUTtYq2AbZ5tvC3aLfguFm40blKucK6O7q1uy67p7whvJu9Fb2P' +
    'vgq+hL7/v3q/9cBwwOzBZ8Hjwl/C28NYw9TEUcTOxUvFyMZGxsPHQce/yD3IvMk6ybnKOMq3yzbLtsw1zLXNNc21zjbOts83z7jQ' +
    'OdC60TzRvtI/0sHTRNPG1EnUy9VO1dHWVdbY11zX4Nhk2OjZbNnx2nba+9uA3AXcit0Q3ZbeHN6i3ynfr+A24L3hROHM4lPi2+Nj' +
    '4+vkc+T85YTmDeaW5x/nqegy6LzpRunQ6lvq5etw6/vshu0R7ZzuKO6070DvzPBY8OXxcvH/8ozzGfOn9DT0wvVQ9d72bfb794r4' +
    'Gfio+Tj5x/pX+uf7d/wH/Jj9Kf26/kv+3P9t//9kZXNjAAAAAAAAAC5JRUMgNjE5NjYtMi0xIERlZmF1bHQgUkdCIENvbG91ciBT' +
    'cGFjZSAtIHNSR0IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAAAAAUAAAAAAAAG1lYXMAAAAAAAAAAQAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAlhZWiAAAAAAAAAAngAAAKQAAACHWFlaIAAAAAAAAG+iAAA49QAAA5BzaWcgAAAAAENSVCBkZXNjAAAA' +
    'AAAAAC1SZWZlcmVuY2UgVmlld2luZyBDb25kaXRpb24gaW4gSUVDIDYxOTY2LTItMQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWFlaIAAAAAAAAPbWAAEAAAAA0y10' +
    'ZXh0AAAAAENvcHlyaWdodCBJbnRlcm5hdGlvbmFsIENvbG9yIENvbnNvcnRpdW0sIDIwMTUAAHNmMzIAAAAAAAEMRAAABd////Mm' +
    'AAAHlAAA/Y////uh///9ogAAA9sAAMB1',
  ].join('');

  function profileBytes() {
    const binary = atob(PROFILE_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Un texte pour le XMP (du XML 1.0) : les caractères qu'il interdit (les contrôles hors tabulation et saut de ligne) s'en vont, les cinq réservés s'écrivent en entités. Le titre d'un PDF
  // est le nom du fichier, qui vient d'une cellule : n'importe quoi peut s'y trouver.
  function xmlText(value) {
    return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // Une date de l'XMP : ISO 8601 en UTC, à la seconde.
  const xmpDate = date => date.toISOString().replace(/\.\d+Z$/, 'Z');

  // Le flux XMP : ce que le document dit de lui (titre, outil, dates) - les mêmes valeurs que son dictionnaire d'informations, que PDF/A veut cohérent - et son identité PDF/A.
  function xmpPacket({ title, creator, created, modified }) {
    return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
      + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
      + '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>\n'
      + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + xmlText(title) + '</rdf:li></rdf:Alt></dc:title></rdf:Description>\n'
      + '<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>' + xmlText(PRODUCER) + '</pdf:Producer></rdf:Description>\n'
      + '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>' + xmlText(creator) + '</xmp:CreatorTool>'
      + '<xmp:CreateDate>' + xmpDate(created) + '</xmp:CreateDate><xmp:ModifyDate>' + xmpDate(modified) + '</xmp:ModifyDate></rdf:Description>\n'
      + '</rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>';
  }

  // Un identifiant de fichier au hasard (32 octets en hexadécimal, comme le /ID d'un PDF) : un PDF assemblé par pdf-lib n'en a pas, et PDF/A l'exige au trailer.
  function randomFileId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Le PDF (un Blob) passé en PDF/A-2b, rendu en Blob. Les pages, les polices, les liens, les signets et le titre restent ceux du PDF d'origine.
  // Lève une erreur si le PDF est chiffré ou illisible : jamais un PDF livré sans être du PDF/A.
  async function convert(blob) {
    await ExportEngines.ensure('merge');
    await PdfMerge.ensureLibLoaded();
    const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict, PDFRef } = window.PDFLib;
    // `updateMetadata: false` : pdf-lib ne réécrit ni le producteur ni les dates à l'ouverture ; elles sont posées ici, en connaissance de cause.
    const doc = await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false });
    const context = doc.context;
    const now = new Date();
    const created = doc.getCreationDate() || now;
    const modified = doc.getModificationDate() || now;
    doc.setProducer(PRODUCER);
    doc.setCreationDate(created);
    doc.setModificationDate(modified);
    // Un PDF déjà converti (une description et une intention de rendu déjà là) : elles sont retirées du fichier, pas seulement détachées du catalogue - pdf-lib écrit tous les objets qu'il a lus, et
    // deux conversions de suite laisseraient deux descriptions dans le fichier.
    const drop = value => { if (value instanceof PDFRef) context.delete(value); };
    drop(doc.catalog.get(PDFName.of('Metadata')));
    const oldIntents = doc.catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray);
    for (let i = 0; oldIntents && i < oldIntents.size(); i += 1) {
      const oldIntent = oldIntents.lookupMaybe(i, PDFDict);
      if (oldIntent) drop(oldIntent.get(PDFName.of('DestOutputProfile')));
      drop(oldIntents.get(i));
    }
    drop(doc.catalog.get(PDFName.of('OutputIntents')));
    const packet = xmpPacket({ title: doc.getTitle() || 'Document', creator: doc.getCreator() || 'Publipostage+', created, modified });
    // Le flux XMP n'est pas compressé (PDF/A le veut en clair, pour que n'importe quel outil lise la description sans décoder le fichier).
    const metadata = context.stream(new TextEncoder().encode(packet), { Type: 'Metadata', Subtype: 'XML' });
    doc.catalog.set(PDFName.of('Metadata'), context.register(metadata));
    const profile = context.flateStream(profileBytes(), { N: 3 });
    const intent = context.obj({
      Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of(PROFILE_NAME), Info: PDFString.of(PROFILE_NAME), DestOutputProfile: context.register(profile),
    });
    doc.catalog.set(PDFName.of('OutputIntents'), context.obj([context.register(intent)]));
    if (!context.trailerInfo.ID) {
      const id = randomFileId();
      context.trailerInfo.ID = context.obj([PDFHexString.of(id), PDFHexString.of(id)]);
    }
    // Sans flux d'objets : un PDF/A-2 les accepte, mais le PDF 1.3 de pdfmake n'en a jamais, et les outils d'archivage les plus anciens non plus.
    return new Blob([await doc.save({ useObjectStreams: false })], { type: 'application/pdf' });
  }

  return { convert, xmpPacket, PRODUCER };
})();
