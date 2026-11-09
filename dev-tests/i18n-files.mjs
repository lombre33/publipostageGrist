// Les fichiers des textes de l'interface (refactorisation du 09/11, découpe 2) : js/i18n-texts-<domaine>.js portent les entrées { clé: { fr, en } }, js/i18n.js la langue et `t()`. Un essai qui lit
// « les textes » les lit ensemble : `i18nTexts()` rend leur texte, `I18N_FILES` leurs chemins (ceux qu'un essai de « clé sans usage » doit écarter de ses lecteurs).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './load-lib.mjs';

export const I18N_TEXT_FILES = readdirSync(join(ROOT, 'js')).filter(f => /^i18n-texts-[a-z]+\.js$/.test(f)).sort().map(f => 'js/' + f);
export const I18N_FILES = [...I18N_TEXT_FILES, 'js/i18n.js'];
export const i18nTexts = () => I18N_FILES.map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');
