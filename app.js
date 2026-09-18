(() => {
  'use strict';

  const STORE_KEY = 'diet.v1';
  const SYNC_KEY = 'diet.sync.v1';
  const DATA_PATH = 'data.json';
  const MEALS = [
    { id: 'b', name: '아침' },
    { id: 'l', name: '점심' },
    { id: 'd', name: '저녁' },
    { id: 's', name: '간식' },
  ];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  // data: { "YYYY-MM-DD": { t: 수정시각(ms), b: [{k: 350, f: "토스트"}], l, d, s } }
  // 끼니가 하나도 없고 t 만 있는 날은 "지웠음" 표시 — 다른 기기에서 되살아나지 않게 한다.
  let data = loadLocal();

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('ko-KR');
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => { const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadLocal() {
    try { return sanitize(JSON.parse(localStorage.getItem(STORE_KEY))); }
    catch { return {}; }
  }
  function persistLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); return true; }
    catch { return false; }
  }

  // 외부에서 들어온 값(서버, 백업 파일)을 정해진 모양으로 다듬는다
  function sanitize(raw, stampMissing) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, day] of Object.entries(raw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== 'object') continue;
      const clean = { t: Number(day.t) > 0 ? Number(day.t) : (stampMissing || 0) };
      for (const { id } of MEALS) {
        if (!Array.isArray(day[id])) continue;
        const items = day[id]
          .map((it) => ({ k: Math.min(99999, Math.max(0, parseInt(it && it.k, 10) || 0)), f: String((it && it.f) || '').slice(0, 80) }))
          .filter((it) => it.k > 0 || it.f);
        if (items.length) clean[id] = items;
      }
      out[key] = clean;
    }
    return out;
  }

  const hasMeals = (day) => !!day && MEALS.some((m) => day[m.id] && day[m.id].length);
  const mealSum = (day, id) => (day && day[id] ? day[id].reduce((a, it) => a + (it.k || 0), 0) : 0);
  const daySum = (day) => MEALS.reduce((a, m) => a + mealSum(day, m.id), 0);

  // ───────── 달력 ─────────
  const now = new Date();
  const view = { y: now.getFullYear(), m: now.getMonth() };

  function renderMonth() {
    const { y, m } = view;
    $('monthTitle').textContent = `${y}년 ${m + 1}월`;
    document.title = `식단 달력 · ${y}년 ${m + 1}월`;

    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const today = todayKey();
    const parts = [];
    let recorded = 0, monthTotal = 0;

    for (let i = 0; i < first; i++) parts.push('<div class="blank"></div>');
    for (let d = 1; d <= count; d++) {
      const key = keyOf(y, m, d);
      const day = hasMeals(data[key]) ? data[key] : null;
      const total = daySum(day);
      const dow = (first + d - 1) % 7;
      if (total > 0) { recorded++; monthTotal += total; }

      const cls = ['day'];
      if (dow === 0) cls.push('sun');
      if (dow === 6) cls.push('sat');
      if (key === today) cls.push('today');

      let meals = '';
      if (day) {
        meals = MEALS.map((meal) => {
          const has = day[meal.id] && day[meal.id].length;
          return `<span class="m m-${meal.id}${has ? '' : ' none'}"><i>${meal.name[0]}<span class="l2">${meal.name[1]}</span></i><b>${has ? fmt(mealSum(day, meal.id)) : '–'}</b></span>`;
        }).join('');
      }
      const label = `${m + 1}월 ${d}일 ${WEEKDAYS[dow]}요일, ` + (day ? `합계 ${total} 킬로칼로리` : '기록 없음');
      parts.push(
        `<button type="button" class="${cls.join(' ')}" data-date="${key}" aria-label="${label}">` +
        `<span class="num"><span>${d}</span></span>` +
        `<span class="meals">${meals}</span>` +
        `<span class="sum${day ? '' : ' empty'}">${day ? fmt(total) : '0'}</span>` +
        `</button>`
      );
    }
    const tail = (7 - ((first + count) % 7)) % 7;
    for (let i = 0; i < tail; i++) parts.push('<div class="blank"></div>');
    $('days').innerHTML = parts.join('');

    $('summary').innerHTML = recorded
      ? `기록한 날 <b>${recorded}일</b>, 하루 평균 <b>${fmt(Math.round(monthTotal / recorded))} kcal</b>`
      : '날짜를 누르면 바로 입력할 수 있습니다.';
  }

  function shiftMonth(delta) {
    const d = new Date(view.y, view.m + delta, 1);
    view.y = d.getFullYear(); view.m = d.getMonth();
    renderMonth();
  }

  // ───────── 입력 창 ─────────
  const sheet = $('sheet');
  let editKey = null;
  let draft = null; // 화면용, 빈 줄 포함

  function toDraft(day) {
    const out = {};
    for (const { id } of MEALS) {
      const items = day && day[id] ? day[id] : [];
      out[id] = items.length ? items.map((it) => ({ k: it.k ? String(it.k) : '', f: it.f || '' })) : [{ k: '', f: '' }];
    }
    return out;
  }
  function fromDraft() {
    const out = {};
    for (const { id } of MEALS) {
      const items = draft[id]
        .map((it) => ({ k: parseInt(it.k, 10) || 0, f: it.f.trim() }))
        .filter((it) => it.k > 0 || it.f);
      if (items.length) out[id] = items;
    }
    return out;
  }

  function commit() {
    const day = fromDraft();
    if (hasMeals(day) || data[editKey]) data[editKey] = { t: Date.now(), ...day };
    const ok = persistLocal();
    $('sheetTotal').textContent = fmt(daySum(day));
    if (!ok && !cfg) $('saved').textContent = '이 브라우저는 저장소를 쓸 수 없어 창을 닫으면 사라집니다';
    renderMonth();
    markDirty();
  }

  function renderEditor() {
    const date = parseKey(editKey);
    $('sheetDate').textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
    $('sheetTotal').textContent = fmt(daySum(fromDraft()));
    $('mealsEdit').innerHTML = MEALS.map((meal) => {
      const rows = draft[meal.id].map((it, i) => `
        <div class="row m-${meal.id}">
          <span class="label">${i === 0 ? meal.name : ''}</span>
          <input class="kcal" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" enterkeyhint="next"
                 placeholder="kcal" aria-label="${meal.name} 칼로리" value="${esc(it.k)}"
                 data-meal="${meal.id}" data-i="${i}" data-field="k">
          <input class="food" type="text" maxlength="80" enterkeyhint="next"
                 placeholder="무엇을 먹었나요" aria-label="${meal.name}에 먹은 것" value="${esc(it.f)}"
                 data-meal="${meal.id}" data-i="${i}" data-field="f">
          ${i === 0
            ? `<button type="button" class="icon" data-add="${meal.id}" aria-label="${meal.name} 줄 추가">+</button>`
            : `<button type="button" class="icon" data-del="${meal.id}" data-i="${i}" aria-label="이 줄 지우기">×</button>`}
        </div>`).join('');
      return `<div class="meal">${rows}</div>`;
    }).join('');
  }

  // 누르자마자 입력: 오늘이면 지금 시간대의 끼니, 아니면 아침부터 첫 빈칸
  function pickFocus() {
    let start = 0;
    if (editKey === todayKey()) {
      const h = new Date().getHours();
      start = h < 11 ? 0 : h < 16 ? 1 : h < 21 ? 2 : 3;
    }
    for (let n = 0; n < MEALS.length; n++) {
      const id = MEALS[(start + n) % MEALS.length].id;
      if (!draft[id][0].k) return sheet.querySelector(`input[data-meal="${id}"][data-i="0"][data-field="k"]`);
    }
    return sheet.querySelector(`input[data-meal="${MEALS[start].id}"][data-field="k"]`);
  }

  function openDay(key) {
    editKey = key;
    draft = toDraft(data[key]);
    renderEditor();
    paintStatus();
    if (!sheet.open) sheet.showModal();
    const target = pickFocus();
    if (target) { target.focus(); target.select(); }
  }

  function shiftDay(delta) {
    const d = parseKey(editKey);
    d.setDate(d.getDate() + delta);
    if (d.getFullYear() !== view.y || d.getMonth() !== view.m) {
      view.y = d.getFullYear(); view.m = d.getMonth();
      renderMonth();
    }
    openDay(keyOf(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  $('days').addEventListener('click', (e) => {
    const btn = e.target.closest('.day');
    if (btn) openDay(btn.dataset.date);
  });
  $('prevMonth').addEventListener('click', () => shiftMonth(-1));
  $('nextMonth').addEventListener('click', () => shiftMonth(1));
  $('todayBtn').addEventListener('click', () => {
    const t = new Date(); view.y = t.getFullYear(); view.m = t.getMonth(); renderMonth();
  });
  $('prevDay').addEventListener('click', () => shiftDay(-1));
  $('nextDay').addEventListener('click', () => shiftDay(1));

  $('mealsEdit').addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset.field) return;
    if (el.dataset.field === 'k') {
      const clean = el.value.replace(/\D/g, '').slice(0, 5);
      if (clean !== el.value) el.value = clean;
    }
    draft[el.dataset.meal][+el.dataset.i][el.dataset.field] = el.value;
    commit();
  });

  $('mealsEdit').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const del = e.target.closest('[data-del]');
    if (add) {
      const id = add.dataset.add;
      draft[id].push({ k: '', f: '' });
      renderEditor();
      sheet.querySelector(`input[data-meal="${id}"][data-i="${draft[id].length - 1}"][data-field="k"]`).focus();
    } else if (del) {
      draft[del.dataset.del].splice(+del.dataset.i, 1);
      renderEditor();
      commit();
    }
  });

  // Enter: 다음 칸으로, 마지막 칸이면 완료
  $('mealsEdit').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || !e.target.dataset.field) return;
    e.preventDefault();
    const inputs = [...sheet.querySelectorAll('.meals-edit input')];
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) { next.focus(); next.select(); } else sheet.close();
  });

  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  sheet.addEventListener('close', () => {
    const btn = editKey && document.querySelector(`.day[data-date="${editKey}"]`);
    editKey = null; draft = null;
    if (btn) btn.focus({ preventScroll: true });
    if (dirty) syncNow(); // 완료를 누르면 기다리지 않고 바로 서버로
  });

  // ───────── 서버 동기화 (비공개 GitHub 저장소의 data.json) ─────────
  let cfg = loadCfg();          // { repo: "owner/name", token }
  let remoteSha = null;
  let dirty = false;
  let editStamp = 0;
  let syncing = false;
  let again = false;
  let pushTimer = null;
  let state = cfg ? 'pending' : 'local';
  let stateMsg = '';
  let lastSynced = 0;

  function loadCfg() {
    try { const c = JSON.parse(localStorage.getItem(SYNC_KEY)); return c && c.repo && c.token ? c : null; }
    catch { return null; }
  }
  function saveCfg(next) {
    cfg = next;
    try { next ? localStorage.setItem(SYNC_KEY, JSON.stringify(next)) : localStorage.removeItem(SYNC_KEY); } catch { /* 무시 */ }
  }

  const b64encode = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  // 날짜순, 하루 한 줄 — 저장소에서 변경 이력을 보기 좋게
  function serialize(obj) {
    const keys = Object.keys(obj).sort();
    const line = (k) => {
      const day = obj[k];
      const ordered = { t: day.t || 0 };
      for (const { id } of MEALS) if (day[id] && day[id].length) ordered[id] = day[id];
      return `${JSON.stringify(k)}:${JSON.stringify(ordered)}`;
    };
    return `{\n${keys.map(line).join(',\n')}\n}\n`;
  }

  // 날짜별로 더 나중에 고친 쪽을 택한다 (같으면 서버)
  function merge(local, remote) {
    const out = { ...remote };
    for (const [k, day] of Object.entries(local)) {
      if (!out[k] || (day.t || 0) > (out[k].t || 0)) out[k] = day;
    }
    return out;
  }

  class SyncError extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(`https://api.github.com${path}`, {
        ...options,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.headers || {}),
        },
      });
    } catch { throw new SyncError('offline', '인터넷에 연결되지 않았습니다'); }
    if (res.status === 401) throw new SyncError('auth', '토큰이 만료됐거나 잘못됐습니다');
    return res;
  }

  async function pullRemote() {
    const url = `/repos/${cfg.repo}/contents/${DATA_PATH}`;
    const res = await api(url);
    if (res.status === 404) { remoteSha = null; return {}; }
    if (res.status === 403) throw new SyncError('auth', '토큰에 이 저장소 읽기 권한이 없습니다');
    if (!res.ok) throw new SyncError('error', `서버에서 읽지 못했습니다 (${res.status})`);
    const meta = await res.json();
    remoteSha = meta.sha;
    let text;
    if (meta.content) text = b64decode(meta.content);
    else { // 1MB 넘는 파일은 본문을 따로 받아야 한다
      const raw = await api(url, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!raw.ok) throw new SyncError('error', `서버에서 읽지 못했습니다 (${raw.status})`);
      text = await raw.text();
    }
    try { return sanitize(JSON.parse(text)); }
    catch { throw new SyncError('error', `${DATA_PATH} 내용이 손상돼 덮어쓰지 않고 멈췄습니다`); }
  }

  async function syncNow() {
    if (!cfg) return;
    if (syncing) { again = true; return; }
    clearTimeout(pushTimer);
    syncing = true;
    setState('syncing');
    try {
      for (let attempt = 0; ; attempt++) {
        const stamp = editStamp;
        const remote = await pullRemote();
        const before = serialize(data);
        data = merge(data, remote);
        const merged = serialize(data);
        if (merged !== before) { persistLocal(); renderMonth(); }
        if (merged === serialize(remote)) { if (stamp === editStamp) dirty = false; break; }

        const res = await api(`/repos/${cfg.repo}/contents/${DATA_PATH}`, {
          method: 'PUT',
          body: JSON.stringify({ message: `식단 기록 ${todayKey()}`, content: b64encode(merged), ...(remoteSha ? { sha: remoteSha } : {}) }),
        });
        if (res.ok) {
          remoteSha = (await res.json()).content.sha;
          if (stamp === editStamp) dirty = false;
          break;
        }
        if ((res.status === 409 || res.status === 422) && attempt < 3) continue; // 다른 기기가 먼저 저장함 → 다시 받아 합친다
        if (res.status === 403 || res.status === 404) throw new SyncError('auth', '토큰에 이 저장소 쓰기 권한(Contents: Read and write)이 없습니다');
        throw new SyncError('error', `서버에 저장하지 못했습니다 (${res.status})`);
      }
      lastSynced = Date.now();
      setState(dirty ? 'pending' : 'synced');
    } catch (err) {
      setState(err.kind || 'error', err.message);
    } finally {
      syncing = false;
      if (again || (dirty && state === 'pending')) { again = false; schedulePush(); }
    }
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 2000);
  }
  function markDirty() {
    dirty = true; editStamp++;
    if (!cfg) { paintStatus(); return; }
    if (!syncing) setState('pending');
    schedulePush();
  }

  function setState(next, msg) { state = next; stateMsg = msg || ''; paintStatus(); }
  function paintStatus() {
    const clock = lastSynced ? new Date(lastSynced).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
    const text = {
      local: '이 기기에만 저장됩니다. 동기화를 설정하면 다른 기기에서도 보입니다.',
      pending: '서버에 저장 대기 중…',
      syncing: '서버와 동기화 중…',
      synced: `서버에 저장됨 ${clock}`,
      offline: '오프라인 — 이 기기에 저장해 두었다가 연결되면 서버로 보냅니다',
      auth: `${stateMsg}. 동기화 설정에서 다시 연결해 주세요.`,
      error: `${stateMsg}. 잠시 뒤 다시 시도합니다.`,
    }[state];
    const el = $('syncStatus');
    el.textContent = text;
    el.dataset.state = state;
    $('saved').textContent = state === 'local' ? (dirty ? '이 기기에 저장됨' : '') : text;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && cfg && !sheet.open) syncNow(); // 다른 기기에서 넣은 기록 받아오기
  });
  window.addEventListener('online', () => { if (cfg) syncNow(); });
  window.addEventListener('pagehide', () => { if (cfg && dirty) syncNow(); });
  setInterval(() => { if (cfg && state === 'error') syncNow(); }, 30000);

  // ───────── 동기화 설정 ─────────
  const dlg = $('syncDlg');
  const defaultRepo = () => {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    return m ? `${m[1]}/diet-data` : '';
  };

  function openSettings() {
    const on = !!cfg;
    $('syncHint').textContent = on
      ? `${cfg.repo} 저장소의 ${DATA_PATH} 에 기록을 저장하고 있습니다.`
      : '비공개 GitHub 저장소를 서버로 씁니다. 저장소와 토큰을 한 번만 넣으면 이 기기가 연결됩니다. 토큰은 이 기기에만 보관됩니다.';
    $('syncFields').hidden = on;
    $('syncConnect').hidden = on;
    $('syncDisconnect').hidden = !on;
    $('syncLink').hidden = !on;
    $('syncError').textContent = '';
    if (!on) { $('syncRepo').value = defaultRepo(); $('syncToken').value = ''; }
    if (!dlg.open) dlg.showModal();
  }

  async function connect() {
    const repo = $('syncRepo').value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    const token = $('syncToken').value.trim();
    const fail = (msg) => { $('syncError').textContent = msg; $('syncConnect').disabled = false; };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail('저장소를 "사용자이름/저장소이름" 형식으로 적어 주세요.');
    if (!token) return fail('토큰을 붙여 넣어 주세요.');
    $('syncConnect').disabled = true;
    $('syncError').textContent = '확인 중…';
    const prev = cfg;
    cfg = { repo, token };
    try {
      const res = await api(`/repos/${repo}`);
      if (res.status === 404 || res.status === 403) throw new SyncError('auth', '저장소를 찾을 수 없습니다. 이름과, 토큰의 Repository access 에 이 저장소가 들어 있는지 확인해 주세요.');
      if (!res.ok) throw new SyncError('error', `확인하지 못했습니다 (${res.status}).`);
      const info = await res.json();
      if (!info.private && !confirm('공개 저장소입니다. 식단 기록을 누구나 볼 수 있게 됩니다. 그래도 연결할까요?')) { cfg = prev; return fail(''); }
    } catch (err) { cfg = prev; return fail(err.message); }
    saveCfg({ repo, token });
    $('syncConnect').disabled = false;
    dlg.close();
    dirty = true; // 이 기기에 있던 기록도 서버로 올린다
    syncNow();
  }

  $('syncBtn').addEventListener('click', openSettings);
  $('syncCancel').addEventListener('click', () => dlg.close());
  $('syncConnect').addEventListener('click', connect);
  $('syncForm').addEventListener('submit', (e) => { e.preventDefault(); if (!cfg) connect(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('syncDisconnect').addEventListener('click', () => {
    if (!confirm('이 기기의 연결을 끊습니다. 서버와 이 기기의 기록은 지워지지 않습니다.')) return;
    saveCfg(null); remoteSha = null; clearTimeout(pushTimer);
    setState('local'); dlg.close();
  });
  $('syncLink').addEventListener('click', async () => {
    const payload = b64encode(JSON.stringify({ r: cfg.repo, k: cfg.token })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const link = `${location.origin}${location.pathname}#connect=${payload}`;
    try { await navigator.clipboard.writeText(link); $('syncError').textContent = '복사했습니다. 다른 기기에서 이 링크를 열면 바로 연결됩니다. 토큰이 들어 있으니 본인에게만 보내세요.'; }
    catch { prompt('이 링크를 복사해 다른 기기에서 여세요. 토큰이 들어 있으니 본인에게만 보내세요.', link); }
  });

  // 다른 기기용 링크로 들어온 경우
  (function adoptLink() {
    const m = location.hash.match(/^#connect=([\w-]+)$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search); // 토큰이 주소창·기록에 남지 않게
    try {
      const { r, k } = JSON.parse(b64decode(m[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (r && k) { saveCfg({ repo: r, token: k }); dirty = true; state = 'pending'; }
    } catch { /* 잘못된 링크는 무시 */ }
  })();

  // ───────── 백업 ─────────
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([serialize(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diet-backup-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = sanitize(JSON.parse(await file.text()));
      const days = Object.keys(incoming).filter((k) => hasMeals(incoming[k]));
      if (!days.length) { alert('불러올 기록이 없는 파일입니다.'); return; }
      if (!confirm(`${days.length}일치 기록을 불러옵니다. 같은 날짜의 기존 기록은 파일 내용으로 바뀝니다.`)) return;
      const t = Date.now();
      for (const k of days) data[k] = { ...incoming[k], t };
      persistLocal();
      renderMonth();
      markDirty();
    } catch {
      alert('백업 파일을 읽지 못했습니다. 이 페이지에서 저장한 .json 파일인지 확인해 주세요.');
    }
  });

  // 같은 브라우저의 다른 탭에서 바뀌면 반영
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY && !sheet.open) { data = loadLocal(); renderMonth(); }
  });

  renderMonth();
  paintStatus();
  if (cfg) syncNow();
})();
