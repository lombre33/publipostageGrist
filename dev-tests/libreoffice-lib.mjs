// LibreOffice pour les bancs d'export (campagne « Fiabiliser les exports », 27/11) : rend un .docx ou un .odt en PDF, avec la MÊME Roboto que celle de pdfmake (extraite de `pdfMake.vfs` de la page :
// sans elle LibreOffice retombe sur DejaVu, plus large, et ne coupe plus les lignes au même endroit, ce qui n'a rien à voir avec nos fichiers).
// Limite : LibreOffice n'est pas Word ; le rendu dit à quelle page tombe chaque ligne, pas l'écart d'un demi-millimètre.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from './real-widget-kit.mjs';

export function haveLibreOffice() { const r = sh('soffice', ['--version']); return !r.error && r.status === 0; }

// Écrit les Roboto du PDF dans `<work>/lo-fonts/ttf` et une configuration fontconfig qui les ajoute aux polices du système.
export async function installPdfFonts(page, work) {
  const dir = join(work, 'lo-fonts');
  const ttf = join(dir, 'ttf');
  mkdirSync(ttf, { recursive: true });
  const fonts = await page.evaluate(() => {
    const vfs = (window.pdfMake && window.pdfMake.vfs) || {};
    const out = {};
    Object.keys(vfs).filter((k) => /^Roboto-.*\.ttf$/.test(k)).forEach((k) => { out[k] = vfs[k]; });
    return out;
  });
  const names = Object.keys(fonts);
  if (!names.length) throw new Error('pdfMake.vfs ne donne aucune Roboto : exporter un PDF avant');
  names.forEach((k) => writeFileSync(join(ttf, k), Buffer.from(fonts[k], 'base64')));
  const conf = join(dir, 'fonts.conf');
  writeFileSync(conf, '<?xml version="1.0"?>\n<fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>' + ttf + '</dir><cachedir>' + join(dir, 'cache') + '</cachedir></fontconfig>\n');
  return { conf, count: names.length };
}

// `.docx` / `.odt` -> `.pdf` à côté du fichier. Un profil LibreOffice à part par appel (deux soffice en même temps sur un même profil se battent).
export function convertToPdf(file, { work, fontConf, profile = 'lo-profile', timeoutMs = 120000 }) {
  // Un dossier de sortie par extension : « facture.docx » et « facture.odt » donnent tous deux « facture.pdf ».
  const ext = (file.match(/\.([^./]+)$/) || [, 'x'])[1];
  const outDir = join(work, 'lo-out-' + ext);
  mkdirSync(outDir, { recursive: true });
  const base = file.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
  const out = join(outDir, base + '.pdf');
  if (existsSync(out)) rmSync(out);
  const env = Object.assign({}, process.env, fontConf ? { FONTCONFIG_FILE: fontConf } : {});
  const r = sh('soffice', ['--headless', '--norestore', '-env:UserInstallation=file://' + join(work, profile), '--convert-to', 'pdf', '--outdir', outDir, file], { env, timeout: timeoutMs });
  if (!existsSync(out)) throw new Error('LibreOffice n\'a rien produit pour ' + base + ' : ' + String(r.stderr || r.stdout || r.error || '').slice(0, 300));
  return out;
}
