// Une fausse horloge pour les essais Node : `now()`, `setTimeout` et `clearTimeout` qui n'avancent que lorsque l'essai le dit (`advance(ms)`), minuteries rejouées dans l'ordre. Entre deux
// minuteries, les promesses en attente (lectures et écritures du faux Grist) se terminent d'elles-mêmes : `settle()` laisse passer les micro-tâches.
export class FakeClock {
  constructor(start = 1800000000000) {
    this.t = start;
    this.timers = [];
    this.next = 0;
  }

  now() { return this.t; }

  setTimeout(fn, ms = 0) {
    const id = ++this.next;
    this.timers.push({ id, at: this.t + Math.max(0, Number(ms) || 0), fn });
    return id;
  }

  clearTimeout(id) { this.timers = this.timers.filter(timer => timer.id !== id); }

  // Laisse se terminer tout ce qui n'attend que des promesses déjà résolues.
  async settle() {
    for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve));
  }

  // Avance de `ms` en rejouant les minuteries échues, dans l'ordre de leur échéance (puis de leur création).
  async advance(ms) {
    const target = this.t + ms;
    for (;;) {
      await this.settle();
      const due = this.timers.filter(timer => timer.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter(timer => timer !== due);
      this.t = Math.max(this.t, due.at);
      due.fn();
    }
    this.t = target;
    await this.settle();
  }

  // Les mêmes fonctions, au format que prennent le moteur et le canal.
  get timersApi() { return { setTimeout: (fn, ms) => this.setTimeout(fn, ms), clearTimeout: id => this.clearTimeout(id) }; }
}
