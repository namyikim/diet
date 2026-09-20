(function initDietCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DietCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const MEAL_IDS = ['b', 'l', 'd', 's'];
  const EXERCISE_ID = 'x';
  const SECTION_IDS = [...MEAL_IDS, EXERCISE_ID]; // 병합 단위. 끼니 넷과 운동 기록.
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

  // 운동: 시간(분)과 거리(km). 둘 다 비어 있으면 기록이 없는 것으로 본다.
  function cleanExercise(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const minutes = Math.min(1440, Math.max(0, parseInt(value.m, 10) || 0));
    const rawKm = Number.parseFloat(value.km);
    const km = Number.isFinite(rawKm) ? Math.min(999, Math.max(0, Math.round(rawKm * 100) / 100)) : 0;
    if (!minutes && !km) return null;
    return { m: minutes, km };
  }

  const cleanSection = (id, value) => (id === EXERCISE_ID ? cleanExercise(value) : cleanItems(value));
  const hasSection = (id, content) => (id === EXERCISE_ID ? !!content : !!(content && content.length));
  const copySection = (id, content) => (id === EXERCISE_ID ? { ...content } : content.map((item) => ({ ...item })));

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
      for (const id of SECTION_IDS) {
        // 운동을 모르던 기록에는 r.x가 없다. 0으로 시작해 다른 기기의 첫 입력이 이기게 둔다.
        clean.r[id] = cleanRevision(day.r && day.r[id], id === EXERCISE_ID ? 0 : fallback);
        clean.t = Math.max(clean.t, clean.r[id].n);
        const content = cleanSection(id, day[id]);
        if (hasSection(id, content)) clean[id] = content;
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
      for (const id of SECTION_IDS) {
        const useLocal = localDay && (!remoteDay || compareRevision(localDay.r[id], remoteDay.r[id]) > 0);
        const source = useLocal ? localDay : remoteDay;
        const revision = source ? source.r[id] : { n: 0, d: LEGACY_DEVICE };
        day.r[id] = { ...revision };
        day.t = Math.max(day.t, revision.n);
        if (source && hasSection(id, source[id])) day[id] = copySection(id, source[id]);
      }
      out[key] = day;
    }
    return out;
  }

  function maxRevision(data) {
    let max = 0;
    for (const day of Object.values(data)) {
      for (const id of SECTION_IDS) max = Math.max(max, day.r[id].n);
    }
    return max;
  }

  function updateSection(raw, key, sectionId, content, deviceId) {
    if (!SECTION_IDS.includes(sectionId)) throw new TypeError('Unknown section');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new TypeError('Invalid date key');
    const device = String(deviceId || '').slice(0, 80);
    if (!device) throw new TypeError('Device ID is required');
    const out = sanitizeData(raw);
    const nextNumber = maxRevision(out) + 1;
    const day = out[key] || sanitizeData({ [key]: {} })[key];
    const clean = cleanSection(sectionId, content);
    if (hasSection(sectionId, clean)) day[sectionId] = clean;
    else delete day[sectionId];
    day.r[sectionId] = { n: nextNumber, d: device };
    day.t = Math.max(...SECTION_IDS.map((id) => day.r[id].n));
    out[key] = day;
    return out;
  }

  function updateMeal(raw, key, mealId, items, deviceId) {
    if (!MEAL_IDS.includes(mealId)) throw new TypeError('Unknown meal');
    return updateSection(raw, key, mealId, items, deviceId);
  }

  function updateExercise(raw, key, exercise, deviceId) {
    return updateSection(raw, key, EXERCISE_ID, exercise, deviceId);
  }

  function restoreSections(raw, key, snapshotRaw, sectionIds, deviceId) {
    let out = sanitizeData(raw);
    const snapshot = sanitizeData({ [key]: snapshotRaw || {} })[key];
    for (const id of new Set(sectionIds || [])) {
      if (!SECTION_IDS.includes(id)) continue;
      const current = (out[key] && out[key][id]) || null;
      const previous = snapshot[id] || null;
      if (JSON.stringify(current) !== JSON.stringify(previous)) {
        out = updateSection(out, key, id, previous, deviceId);
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
      for (const id of SECTION_IDS) day.r[id] = source.r[id];
      for (const id of SECTION_IDS) if (hasSection(id, source[id])) day[id] = source[id];
      return `${JSON.stringify(key)}:${JSON.stringify(day)}`;
    };
    return `{\n${keys.map(line).join(',\n')}\n}\n`;
  }

  function validatePassphrase(value) {
    return Array.from(String(value || '').normalize('NFKC')).length >= 16;
  }

  return {
    EXERCISE_ID,
    MEAL_IDS,
    SECTION_IDS,
    compareRevision,
    legacyFragmentPath,
    mergeData,
    restoreSections,
    sanitizeData,
    serializeData,
    updateExercise,
    updateMeal,
    validatePassphrase,
  };
}));
