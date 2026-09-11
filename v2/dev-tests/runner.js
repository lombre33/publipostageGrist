// Exécute les scénarios déclarés dans window.EditorTestSuites (un objet
// {groupName: [ {id, description, run(h) -> {pass, notes, ...} }, ... ]}) et
// produit un rapport plat. Chaque scénario est responsable de tout : mise en
// place (TestHelpers.resetEditor() d'abord), action, assertion, et renvoi
// d'un verdict - le runner ne fait qu'orchestrer + agréger, pour rester
// simple et ne jamais masquer une exception (une erreur JS dans un scénario
// est capturée et comptée comme un échec avec la pile d'appel en note, pas
// silencieusement avalée).
window.TestRunner = (function () {
  async function runGroup(groupName, cases) {
    const results = [];
    for (const c of cases) {
      let result;
      const startedAt = performance.now();
      try {
        result = await c.run(window.TestHelpers);
        if (!result || typeof result.pass !== 'boolean') {
          result = { pass: false, notes: 'Le scénario n\'a renvoyé aucun verdict exploitable ({pass:bool,...} attendu) - erreur de harnais, pas de l\'app.' };
        }
      } catch (e) {
        result = { pass: false, notes: 'Exception : ' + (e && e.stack || e) };
      }
      results.push(Object.assign({ group: groupName, id: c.id, description: c.description, ms: Math.round(performance.now() - startedAt) }, result));
    }
    return results;
  }

  async function runAll(suites) {
    const all = [];
    for (const groupName of Object.keys(suites)) {
      // eslint-disable-next-line no-await-in-loop
      const results = await runGroup(groupName, suites[groupName]);
      all.push(...results);
    }
    return all;
  }

  function report(results) {
    const byGroup = {};
    results.forEach(r => { (byGroup[r.group] = byGroup[r.group] || []).push(r); });
    let out = '';
    let totalPass = 0, totalFail = 0;
    Object.keys(byGroup).forEach(g => {
      const rs = byGroup[g];
      const pass = rs.filter(r => r.pass).length;
      totalPass += pass; totalFail += rs.length - pass;
      out += '\n## ' + g + ' (' + pass + '/' + rs.length + ')\n';
      rs.forEach(r => {
        out += (r.pass ? '  [OK] ' : '  [XX] ') + r.id + ' - ' + r.description + (r.notes ? '\n        ' + r.notes : '') + '\n';
      });
    });
    out = '# Rapport de test V2 - ' + totalPass + '/' + (totalPass + totalFail) + ' passés\n' + out;
    return out;
  }

  return { runGroup, runAll, report };
})();
