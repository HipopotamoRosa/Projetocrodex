export function createEmitter() {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt).delete(fn);
    },
    emit(evt, payload) {
      const set = map.get(evt);
      if (set) for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error(err); }
      }
      const all = map.get("*");
      if (all) for (const fn of [...all]) {
        try { fn({ evt, payload }); } catch (err) { console.error(err); }
      }
    },
  };
}
