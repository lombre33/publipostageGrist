// Les polices LIBRES que le PDF peut inclure à la demande (avec GFS : extension « polices », extensions/polices/libres.js). Cette liste dit seulement lesquelles sont connues : un nom de police se
// reconnaît ici sans charger l'extension (js/pdf-font-plan.js : la fenêtre « Polices du document » ; l'import Word et PowerPoint garde leur nom). Les fichiers ne sont lus qu'au oui de la personne.
// Chaque police est celle du paquet npm `@fontsource/<paquet>` (jsDelivr), sous-ensemble latin, à la version EXACTE ci-dessous, avec une licence libre (OFL, Apache, MIT) : la liste est ÉCRITE par
// `node outils/polices-libres.mjs --ecrire` (réseau), qui refuse toute licence non libre et relève l'empreinte SHA-384 de chaque fichier ; ne pas la modifier à la main.
//   `styles` : les graisses que le paquet porte - n normal, b gras, i italique, j gras italique ; une graisse absente est rendue par la plus proche (le gras par le normal...).
//   FreeFonts.find(nom) -> { name, slug, version, license, styles } | null    nom : en minuscules ou non, tel qu'écrit dans le texte.
const FreeFonts = (function () {
  const LIST = [
    // <generated:list>
    { name: 'Open Sans', slug: 'open-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Lato', slug: 'lato', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Montserrat', slug: 'montserrat', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Poppins', slug: 'poppins', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Inter', slug: 'inter', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Source Sans 3', slug: 'source-sans-3', version: '5.3.1', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Noto Sans', slug: 'noto-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Raleway', slug: 'raleway', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Nunito', slug: 'nunito', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Nunito Sans', slug: 'nunito-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Fira Sans', slug: 'fira-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'PT Sans', slug: 'pt-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Work Sans', slug: 'work-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'DM Sans', slug: 'dm-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Cabin', slug: 'cabin', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Oswald', slug: 'oswald', version: '5.3.0', license: 'OFL-1.1', styles: 'nb' },
    { name: 'Rubik', slug: 'rubik', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Mulish', slug: 'mulish', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Quicksand', slug: 'quicksand', version: '5.3.0', license: 'OFL-1.1', styles: 'nb' },
    { name: 'Karla', slug: 'karla', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'IBM Plex Sans', slug: 'ibm-plex-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Barlow', slug: 'barlow', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Roboto Condensed', slug: 'roboto-condensed', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Titillium Web', slug: 'titillium-web', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Josefin Sans', slug: 'josefin-sans', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Comic Neue', slug: 'comic-neue', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Roboto Slab', slug: 'roboto-slab', version: '5.3.0', license: 'Apache-2.0', styles: 'nb' },
    { name: 'Merriweather', slug: 'merriweather', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Lora', slug: 'lora', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Playfair Display', slug: 'playfair-display', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'PT Serif', slug: 'pt-serif', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Source Serif 4', slug: 'source-serif-4', version: '5.3.1', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Noto Serif', slug: 'noto-serif', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Libre Baskerville', slug: 'libre-baskerville', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Crimson Text', slug: 'crimson-text', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'EB Garamond', slug: 'eb-garamond', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Cormorant Garamond', slug: 'cormorant-garamond', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Caladea', slug: 'caladea', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'IBM Plex Serif', slug: 'ibm-plex-serif', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Roboto Mono', slug: 'roboto-mono', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Fira Code', slug: 'fira-code', version: '5.3.0', license: 'OFL-1.1', styles: 'nb' },
    { name: 'Source Code Pro', slug: 'source-code-pro', version: '5.3.1', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'JetBrains Mono', slug: 'jetbrains-mono', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'IBM Plex Mono', slug: 'ibm-plex-mono', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Inconsolata', slug: 'inconsolata', version: '5.3.0', license: 'OFL-1.1', styles: 'nb' },
    { name: 'Atkinson Hyperlegible', slug: 'atkinson-hyperlegible', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    { name: 'Lexend', slug: 'lexend', version: '5.3.0', license: 'OFL-1.1', styles: 'nb' },
    { name: 'OpenDyslexic', slug: 'opendyslexic', version: '5.3.0', license: 'OFL-1.1', styles: 'nbij' },
    // </generated:list>
  ];
  const byName = new Map(LIST.map(font => [font.name.toLowerCase(), font]));
  const find = name => byName.get(String(name || '').trim().toLowerCase()) || null;
  return { LIST, find };
})();
