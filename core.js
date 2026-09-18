(function initDietCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DietCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const MEAL_IDS = ['b', 'l', 'd', 's'];
  const LEGACY_DEVICE = 'legacy';

  function cleanItems(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        k: Math.min(99999, Math.max(0, parseInt(item && item.k, 10) || 0)),
        f: String((item && item.f) || '').slice(0, 80),
      }))
      .filter((item) => item.k > 0 || item.f);
  }

  function cleanRevision(value, fallbackNumber = 0) {
    const n = Number(value && value.n);
    const device = String((value && value.d) || '').slice(0, 80);
    if (Number.isSafeInteger(n) && n >= 0 && device) return { n, d: device };
    return { n: fallbackNumber, d: LEGACY_DEVICE };
  }

  function sanitizeData(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [key, day] of Object.entries(raw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== 'object' || Array.isArray(day)) continue;
      const legacyStamp = Number(day.t);
      const fallback = Number.isSafeInteger(legacyStamp) && legacyStamp > 0 ? legacyStamp : 0;
      const clean = { t: 0, r: {} };
      for (const id of MEAL_IDS) {
        clean.r[id] = cleanRevision(day.r && day.r[id], fallback);
        clean.t = Math.max(clean.t, clean.r[id].n);
        const items = cleanItems(day[id]);
        if (items.length) clean[id] = items;
      }
      out[key] = clean;
    }
    return out;
  }

  function compareRevision(a, b) {
    const left = cleanRevision(a);
    const right = cleanRevision(b);
    if (left.n !== right.n) return left.n > right.n ? 1 : -1;
    if (left.d === right.d) return 0;
    return left.d > right.d ? 1 : -1;
  }

  function mergeData(localRaw, remoteRaw) {
    const local = sanitizeData(localRaw);
    const remote = sanitizeData(remoteRaw);
    const out = {};
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    for (const key of keys) {
      const localDay = local[key];
      const remoteDay = remote[key];
      const day = { t: 0, r: {} };
      for (const id of MEAL_IDS) {
        const useLocal = localDay && (!remoteDay || compareRevision(localDay.r[id], remoteDay.r[id]) > 0);
        const source = useLocal ? localDay : remoteDay;
        const revision = source ? source.r[id] : { n: 0, d: LEGACY_DEVICE };
        day.r[id] = { ...revision };
        day.t = Math.max(day.t, revision.n);
        if (source && source[id] && source[id].length) day[id] = source[id].map((item) => ({ ...item }));
      }
      out[key] = day;
    }
    return out;
  }

  function maxRevision(data) {
    let max = 0;
    for (const day of Object.values(data)) {
      for (const id of MEAL_IDS) max = Math.max(max, day.r[id].n);
    }
    return max;
  }

  function updateMeal(raw, key, mealId, items, deviceId) {
    if (!MEAL_IDS.includes(mealId)) throw new TypeError('Unknown meal');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new TypeError('Invalid date key');
    const device = String(deviceId || '').slice(0, 80);
    if (!device) throw new TypeError('Device ID is required');
    const out = sanitizeData(raw);
    const nextNumber = maxRevision(out) + 1;
    const day = out[key] || sanitizeData({ [key]: {} })[key];
    const clean = cleanItems(items);
    if (clean.length) day[mealId] = clean;
    else delete day[mealId];
    day.r[mealId] = { n: nextNumber, d: device };
    day.t = Math.max(...MEAL_IDS.map((id) => day.r[id].n));
    out[key] = day;
    return out;
  }

  function restoreMeals(raw, key, snapshotRaw, mealIds, deviceId) {
    let out = sanitizeData(raw);
    const snapshot = sanitizeData({ [key]: snapshotRaw || {} })[key];
    for (const id of new Set(mealIds || [])) {
      if (!MEAL_IDS.includes(id)) continue;
      const currentItems = out[key] && out[key][id] ? out[key][id] : [];
      const previousItems = snapshot[id] || [];
      if (JSON.stringify(currentItems) !== JSON.stringify(previousItems)) {
        out = updateMeal(out, key, id, previousItems, deviceId);
      }
    }
    return out;
  }

  function legacyFragmentPath(hash, pathname, search) {
    return /^#connect=/.test(String(hash || '')) ? `${pathname || ''}${search || ''}` : null;
  }

  function serializeData(raw) {
    const data = sanitizeData(raw);
    const keys = Object.keys(data).sort();
    const line = (key) => {
      const source = data[key];
      const day = { t: source.t, r: {} };
      for (const id of MEAL_IDS) day.r[id] = source.r[id];
      for (const id of MEAL_IDS) if (source[id] && source[id].length) day[id] = source[id];
      return `${JSON.stringify(key)}:${JSON.stringify(day)}`;
    };
    return `{\n${keys.map(line).join(',\n')}\n}\n`;
  }

  function validatePassphrase(value) {
    return Array.from(String(value || '').normalize('NFKC')).length >= 16;
  }

  return {
    MEAL_IDS,
    compareRevision,
    legacyFragmentPath,
    mergeData,
    restoreMeals,
    sanitizeData,
    serializeData,
    updateMeal,
    validatePassphrase,
  };
}));
