window.MediaStore = (() => {
  const prefix = 'mediaplay.';
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(prefix + key, JSON.stringify(value));
  const incognito = () => read('incognito', false);
  const setIncognito = value => write('incognito', !!value);
  const favorites = () => read('favorites', []);
  const isFavorite = path => favorites().includes(path);
  const toggleFavorite = path => {
    if (incognito()) return isFavorite(path);
    const values = favorites();
    const next = values.includes(path) ? values.filter(v => v !== path) : [...values, path];
    write('favorites', next);
    return next.includes(path);
  };
  const history = () => read('history', []);
  const saveProgress = (item, position, duration, completed = false) => {
    if (incognito()) return;
    const values = history().filter(v => v.path !== item.path);
    values.unshift({
      ...item,
      position,
      duration,
      completed,
      updated: Date.now()
    });
    write('history', values.slice(0, 100));
  };
  const clearHistory = () => write('history', []);
  const removeHistory = path => write('history', history().filter(v => v.path !== path));
  const playlists = () => read('playlists', []);
  const savePlaylists = value => {
    if (!incognito()) write('playlists', value);
  };
  const prefs = () => read('prefs', {});
  const savePrefs = value => write('prefs', value);
  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('mediaplay', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('thumbnails')) db.createObjectStore('thumbnails');
      if (!db.objectStoreNames.contains('background')) db.createObjectStore('background');
      if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks');
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const dbGet = async (store, key) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  const dbSet = async (store, key, value) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };
  const dbDelete = async (store, key) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };
  const exportData = () => ({
    favorites: read('favorites', []),
    history: read('history', []),
    playlists: read('playlists', []),
    prefs: read('prefs', {}),
  });
  const importData = data => {
    if (incognito()) return;
    ['favorites', 'history', 'playlists', 'prefs'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(data, key)) write(key, data[key]);
    });
  };
  return {
    read,
    write,
    incognito,
    setIncognito,
    favorites,
    isFavorite,
    toggleFavorite,
    history,
    saveProgress,
    clearHistory,
    removeHistory,
    playlists,
    savePlaylists,
    prefs,
    savePrefs,
    exportData,
    importData,
    openDb,
    dbGet,
    dbSet,
    dbDelete
  };
})();