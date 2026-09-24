(function () {
  window.root = window.root || {};

  window.root.codex = window.root.codex || {
    appTitle: "Codex",
    aiPersona:
      "Você é um arquivista profissional de worldbuilding. Você organiza fichas de personagens, organizações, lugares e itens, e tece a rede de relações entre eles com precisão. Você sempre responde em português do Brasil e nunca inventa fatos que contradigam o material fornecido.",
    maxSuggestions: 6,
    maxCatalog: 160,
    maxImagensPorFicha: 9,
    imageTipos: ["Retrato", "Corpo inteiro", "Expressões", "Traje", "Combate", "Alternativo", "Cenário"],
  };

  if (window.root.kv) return;

  var PREFIX = "codex-standalone";
  var LS_PREFIX = PREFIX + "::";
  var DB_NAME = PREFIX + "-db";
  var STORE = "kv";
  var memory = new Map();
  var idb = null;
  var driverPromise = null;

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req;
      try {
        if (!window.indexedDB) return reject(new Error("IndexedDB indisponível"));
        req = indexedDB.open(DB_NAME, 1);
      } catch (err) {
        return reject(err);
      }
      var settled = false;
      var settle = function (fn, arg) {
        if (settled) return;
        settled = true;
        fn(arg);
      };
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); };
        settle(resolve, db);
      };
      req.onerror = function () { settle(reject, req.error || new Error("Falha ao abrir IndexedDB")); };
      setTimeout(function () { settle(reject, new Error("IndexedDB demorou demais")); }, 4000);
    });
  }

  function tx(mode, fn) {
    return new Promise(function (resolve, reject) {
      var t;
      try {
        t = idb.transaction(STORE, mode);
      } catch (err) {
        return reject(err);
      }
      var holder = { v: null };
      t.oncomplete = function () { resolve(holder.v); };
      t.onerror = function () { reject(t.error || new Error("Erro no IndexedDB")); };
      t.onabort = function () { reject(t.error || new Error("Transação abortada")); };
      try {
        fn(t.objectStore(STORE), holder);
      } catch (err) {
        reject(err);
      }
    });
  }

  function reqValue(req, holder) {
    req.onsuccess = function () { holder.v = req.result === undefined ? null : req.result; };
  }

  var idbDriver = {
    name: "indexeddb",
    keys: function (folder) {
      var p = folder + "::";
      return tx("readonly", function (store, holder) {
        var req = store.getAllKeys();
        req.onsuccess = function () {
          holder.v = (req.result || [])
            .filter(function (k) { return typeof k === "string" && k.indexOf(p) === 0; })
            .map(function (k) { return k.slice(p.length); });
        };
      });
    },
    get: function (folder, key) {
      return tx("readonly", function (store, holder) {
        reqValue(store.get(folder + "::" + key), holder);
      });
    },
    getMany: function (folder, keys) {
      var self = this;
      return Promise.all(keys.map(function (k) { return self.get(folder, k); }));
    },
    set: function (folder, key, value) {
      return tx("readwrite", function (store) { store.put(value, folder + "::" + key); });
    },
    setMany: function (folder, pairs) {
      return tx("readwrite", function (store) {
        pairs.forEach(function (p) { store.put(p[1], folder + "::" + p[0]); });
      });
    },
    del: function (folder, key) {
      return tx("readwrite", function (store) { store.delete(folder + "::" + key); });
    },
    deleteMany: function (folder, keys) {
      return tx("readwrite", function (store) {
        keys.forEach(function (k) { store.delete(folder + "::" + k); });
      });
    },
  };

  var lsDriver = {
    name: "localstorage",
    keys: function (folder) {
      var p = LS_PREFIX + folder + "::";
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(p) === 0) out.push(k.slice(p.length));
      }
      return Promise.resolve(out);
    },
    get: function (folder, key) {
      var raw = localStorage.getItem(LS_PREFIX + folder + "::" + key);
      if (raw === null) return Promise.resolve(null);
      try { return Promise.resolve(JSON.parse(raw)); } catch (err) { return Promise.resolve(null); }
    },
    getMany: function (folder, keys) {
      var self = this;
      return Promise.all(keys.map(function (k) { return self.get(folder, k); }));
    },
    set: function (folder, key, value) {
      return new Promise(function (resolve, reject) {
        try {
          localStorage.setItem(LS_PREFIX + folder + "::" + key, JSON.stringify(value === undefined ? null : value));
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    setMany: function (folder, pairs) {
      var self = this;
      return pairs.reduce(function (chain, p) {
        return chain.then(function () { return self.set(folder, p[0], p[1]); });
      }, Promise.resolve());
    },
    del: function (folder, key) {
      localStorage.removeItem(LS_PREFIX + folder + "::" + key);
      return Promise.resolve();
    },
    deleteMany: function (folder, keys) {
      var self = this;
      return keys.reduce(function (chain, k) {
        return chain.then(function () { return self.del(folder, k); });
      }, Promise.resolve());
    },
  };

  var memDriver = {
    name: "memory",
    keys: function (folder) {
      var out = [];
      memory.forEach(function (v, k) { if (k.indexOf(folder + "::") === 0) out.push(k.slice(folder.length + 2)); });
      return Promise.resolve(out);
    },
    get: function (folder, key) {
      var v = memory.get(folder + "::" + key);
      return Promise.resolve(v === undefined ? null : v);
    },
    getMany: function (folder, keys) {
      var self = this;
      return Promise.all(keys.map(function (k) { return self.get(folder, k); }));
    },
    set: function (folder, key, value) {
      memory.set(folder + "::" + key, value);
      return Promise.resolve();
    },
    setMany: function (folder, pairs) {
      pairs.forEach(function (p) { memory.set(folder + "::" + p[0], p[1]); });
      return Promise.resolve();
    },
    del: function (folder, key) {
      memory.delete(folder + "::" + key);
      return Promise.resolve();
    },
    deleteMany: function (folder, keys) {
      keys.forEach(function (k) { memory.delete(folder + "::" + k); });
      return Promise.resolve();
    },
  };

  function driver() {
    if (driverPromise) return driverPromise;
    driverPromise = openIDB()
      .then(function (db) { idb = db; return idbDriver; })
      .catch(function () {
        try {
          localStorage.setItem(LS_PREFIX + "probe", "1");
          localStorage.removeItem(LS_PREFIX + "probe");
          return lsDriver;
        } catch (err) {
          return memDriver;
        }
      })
      .then(function (d) {
        window.root.storageBackend = d.name;
        return d;
      });
    return driverPromise;
  }

  function folderAPI(folder) {
    var api = {
      folder: folder,
      keys: function () { return driver().then(function (d) { return d.keys(folder); }); },
      get: function (key) { return driver().then(function (d) { return d.get(folder, key); }); },
      getMany: function (keys) { return driver().then(function (d) { return d.getMany(folder, keys); }); },
      set: function (key, value) { return driver().then(function (d) { return d.set(folder, key, value); }); },
      setMany: function (pairs) { return driver().then(function (d) { return d.setMany(folder, pairs); }); },
      delete: function (key) { return driver().then(function (d) { return d.del(folder, key); }); },
      deleteMany: function (keys) { return driver().then(function (d) { return d.deleteMany(folder, keys); }); },
    };
    api.values = function () {
      return api.keys().then(function (ks) { return api.getMany(ks); });
    };
    api.entries = function () {
      return api.keys().then(function (ks) {
        return api.getMany(ks).then(function (vs) {
          return ks.map(function (k, i) { return [k, vs[i]]; });
        });
      });
    };
    api.update = function (key, fn) {
      return api.get(key).then(function (v) {
        var next = fn(v);
        return api.set(key, next).then(function () { return next; });
      });
    };
    return api;
  }

  var cache = new Map();
  window.root.kv = new Proxy(
    {},
    {
      get: function (target, prop) {
        if (typeof prop !== "string") return undefined;
        if (!cache.has(prop)) cache.set(prop, folderAPI(prop));
        return cache.get(prop);
      },
      has: function () { return true; },
    }
  );
})();
