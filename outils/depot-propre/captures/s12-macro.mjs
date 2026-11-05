// Un macro-modèle qui mêle une page de garde en portrait, une annexe en paysage et des conditions en portrait : son résumé (les modèles assemblés) puis sa Lecture, pages côte à côte.
// Le vrai widget ; les trois modèles et le macro-modèle sont écrits avec Templates.save (le chemin de « Enregistrer »), la page se règle comme le bouton Page le fait (colonne Margins).
import { openWidget, sleep, done, click, idle, shot, rectOf } from './kit.mjs';
const W = 1280, H = 1150;
const m = (orientation, auto = false) => JSON.stringify({ top: 20, right: 20, bottom: 20, left: 20, orientation, format: 'A4', ...(auto ? { orientationAuto: true } : {}) });
const cover = '<h1 style="text-align: center">Rénovation de l’éclairage</h1><p style="text-align: center">Boutique Atelier Lumière, 12 rue des Tisserands, Lyon</p><p></p><p style="text-align: center"><strong>Dossier de chantier</strong></p><p style="text-align: center">Document remis à Maison Berthier &amp; Associés le 4 novembre 2026</p><p></p><p>Ce dossier réunit le planning des interventions et les conditions générales applicables à la commande.</p><p></p><h2>Sommaire</h2><ul><li><p>Annexe 1 : planning des interventions</p></li><li><p>Annexe 2 : conditions générales</p></li></ul><p></p><p></p><h2>Récapitulatif de la commande</h2><table><tbody><tr><th colwidth="330" style="background-color: #e6edfb"><p><strong>Désignation</strong></p></th><th colwidth="50" style="background-color: #e6edfb"><p><strong>Qté</strong></p></th><th colwidth="110" style="background-color: #e6edfb"><p><strong>Total HT</strong></p></th></tr><tr><td colwidth="330"><p>Plafonniers opale, salle principale</p></td><td colwidth="50"><p>8</p></td><td colwidth="110"><p>1 696,00 €</p></td></tr><tr><td colwidth="330"><p>Projecteurs LED extérieurs, IP65</p></td><td colwidth="50"><p>6</p></td><td colwidth="110"><p>593,40 €</p></td></tr><tr><td colwidth="330"><p>Guirlandes lumineuses 20 m</p></td><td colwidth="50"><p>4</p></td><td colwidth="110"><p>256,00 €</p></td></tr><tr><td colwidth="330"><p>Pose et raccordement</p></td><td colwidth="50"><p>14 h</p></td><td colwidth="110"><p>770,00 €</p></td></tr></tbody></table><p></p><p>Contact : Camille Martin, Atelier Lumière — chantiers@atelier-lumiere.example</p>';
const cell = (w, t, bold = false) => `<td colwidth="${w}"><p>${bold ? `<strong>${t}</strong>` : t}</p></td>`;
const plan = '<h1>Planning des interventions</h1><table><tbody>'
  + `<tr>${['Lot|260', 'Semaine 49|120', 'Semaine 50|120', 'Semaine 51|120', 'Responsable|200'].map((x) => { const [t, w] = x.split('|'); return `<th colwidth="${w}" style="background-color: #e6edfb"><p><strong>${t}</strong></p></th>`; }).join('')}</tr>`
  + [['Dépose des anciens luminaires', 'Lun – Mar', '', '', 'Dan Roux'], ['Pose des appliques et suspensions', 'Mer – Ven', 'Lun – Mar', '', 'Camille Martin'], ['Raccordement et tests', '', 'Mer – Jeu', '', 'Dan Roux'], ['Réception du chantier', '', '', 'Mer', 'Camille Martin'], ['Levée des réserves', '', '', 'Ven', 'Dan Roux'], ['Remise du dossier des ouvrages exécutés', '', '', 'Ven', 'Camille Martin']]
    .map((r) => `<tr>${r.map((t, i) => cell([260, 120, 120, 120, 200][i], t)).join('')}</tr>`).join('')
  + '</tbody></table><p></p><p>Les dates sont confirmées 48 heures avant chaque intervention.</p>';
const cg = '<h1>Conditions générales</h1><p><strong>Article 1 – Paiement.</strong> Acompte de 30 % à la commande, solde à la réception du chantier, sous 30 jours.</p><p><strong>Article 2 – Garantie.</strong> Les luminaires sont garantis deux ans, les ampoules un an.</p><p><strong>Article 3 – Reprise.</strong> Les anciens luminaires sont déposés et repris sans frais.</p><p><strong>Article 4 – Délais.</strong> Les dates d’intervention du planning sont données à titre indicatif ; tout changement est confirmé par écrit 48 heures à l’avance.</p><p><strong>Article 5 – Réception.</strong> La réception a lieu en présence du client ; les réserves éventuelles sont consignées au procès-verbal et levées dans les quinze jours.</p><p><strong>Article 6 – Litiges.</strong> Tout litige relève du tribunal de commerce de Lyon.</p>';
const slots = JSON.stringify({ slots: [{ type: 'fixed', modeleId: '1' }, { type: 'conditional', rules: [], defaultModeleId: '2' }, { type: 'conditional', rules: [], defaultModeleId: '3' }] });
const rows = [
  ['Couverture du dossier', cover, m('portrait'), 'document', false],
  ['Annexe : planning', plan, m('landscape'), 'document', false],
  ['Conditions générales', cg, m('portrait'), 'document', false],
  ['Dossier de chantier', slots, m('portrait', true), 'macro', true],
];
const seed = `const t = stub.state.rows.Publipostage_Modeles; t.TypeModele = [];
  ${JSON.stringify(rows)}.forEach((r, i) => { t.id.push(i + 1); t.Nom.push(r[0]); t.Contenu.push(r[1]); t.NomFichierPDF.push(''); t.HeaderFooter.push(''); t.DateModif.push(1793778900); t.Margins.push(r[2]); t.EstParDefaut.push(r[4]); t.TypeModele.push(r[3]); });
  stub.state.nextRowId.Publipostage_Modeles = 5;
  stub.setVariables('Chantiers', { Nom: 'Text' }); stub.setRows('Chantiers', [{ id: 1, Nom: 'Boutique Atelier Lumière' }]);`;
const { page } = await openWidget({ width: W, height: H, seed });
await sleep(800);
console.log('cache', JSON.stringify(await page.evaluate(() => ({ cached: Templates.getCached().map((t) => [t.id, t.nom, t.typeModele, t.estParDefaut]), cols: Object.keys(window.__gristStub.state.rows.Publipostage_Modeles), nom: window.__gristStub.state.rows.Publipostage_Modeles.Nom, cur: Templates.getCurrentId() }))));
await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Boutique Atelier Lumière' }, 'Chantiers'));
await sleep(800);
await page.evaluate(() => { const s = document.getElementById('template-select'); s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(1500);
console.log('courant', await page.evaluate(() => Templates.getCurrentId()));
await click(page, '#btn-set-default-template', 500);
await idle(page, 70, 700);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });
await shot(page, 'k0-macro-resume');
const sum = await rectOf(page, '.macro-summary-box');
console.log('résumé', JSON.stringify(sum));
await shot(page, 'k0b-macro-resume', { clip: { x: Math.max(0, sum.l - 40), y: Math.max(0, sum.t - 30), width: sum.w + 80, height: sum.h + 60 } });
await click(page, '#btn-mode-read', 2200, false);
await idle(page, 70, 700);
await shot(page, 'k1-macro-lecture');
// Le zoom : Ctrl + moins, au vrai clavier, jusqu'à 50 %.
for (let i = 0; i < 12; i += 1) {
  const z = await page.evaluate(() => (document.getElementById('pp-page-zoom') || {}).textContent || '');
  const n = Number((/(\d+)\s*%/.exec(z) || [])[1]); if (n && n <= 50) break;
  await page.keyboard.press('Control+Minus'); await sleep(350);
}
console.log('zoom', await page.evaluate(() => (document.getElementById('pp-page-zoom') || {}).textContent));
await idle(page, 70, 900);
await shot(page, 'k2-macro-lecture-zoom');
await shot(page, 'k3-macro-lecture', { clip: { x: 340, y: 74, width: 600, height: H - 74 } });
const pg = await page.evaluate(() => { const els = Array.from(document.querySelectorAll('.reader-content .page, #reader-container .page, .reader-page, .pp-page-sheet')); return els.length; });
console.log('pages', pg);
await done();
