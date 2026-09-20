(() => {
  'use strict';

  const STORE_KEY = 'diet.v1';
  const SYNC_KEY = 'diet.sync.v1';
  const DEVICE_KEY = 'diet.device.v1';
  const VAULT_KEY = 'diet.vault.v1';
  const VAULT_DB = 'diet-vault';
  const VAULT_STORE = 'key';
  const VAULT_ID = 'wrap';
  const DATA_PATH = 'data.json';
  const MEALS = [
    { id: 'b', name: '아침' },
    { id: 'l', name: '점심' },
    { id: 'd', name: '저녁' },
    { id: 's', name: '간식' },
  ];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  // 성인 하루 평균은 2400~2700 kcal이다. 그 위쪽 끝을 넘긴 날만 빨간 테두리로 표시한다.
  const DAY_LIMIT = 2700;
  const { EXERCISE_ID, exerciseBurn, legacyFragmentPath, mergeData, restoreSections, sanitizeData, serializeData, updateExercise, updateMeal, validatePassphrase } = DietCore;

  const cleanLegacyPath = legacyFragmentPath(location.hash, location.pathname, location.search);
  if (cleanLegacyPath) history.replaceState(null, '', cleanLegacyPath);

  let deviceId = '';
  try {
    deviceId = localStorage.getItem(DEVICE_KEY) || '';
    if (!deviceId) {
      deviceId = crypto.randomUUID ? crypto.randomUUID() : `device-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
      localStorage.setItem(DEVICE_KEY, deviceId);
    }
  } catch {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
  }

  // data: { "YYYY-MM-DD": { t, r: { b/l/d/s/x: { n, d } }, b: [{k, f}], ..., x: { m, km } } }
  // r은 항목별 논리 revision이다(끼니 넷과 운동 x). 빈 항목의 revision은 삭제 tombstone 역할을 한다.
  let data = loadLocal();

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('ko-KR');
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => { const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadLocal() {
    try { return sanitizeData(JSON.parse(localStorage.getItem(STORE_KEY))); }
    catch { return {}; }
  }
  function persistLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); return true; }
    catch { return false; }
  }

  const hasEntries = (day) => !!day && (MEALS.some((m) => day[m.id] && day[m.id].length) || !!day[EXERCISE_ID]);
  const exerciseText = (ex) => [ex.m ? `${ex.m}분` : '', ex.km ? `${ex.km}km` : ''].filter(Boolean).join(' ');
  const mealSum = (day, id) => (day && day[id] ? day[id].reduce((a, it) => a + (it.k || 0), 0) : 0);
  const intakeSum = (day) => MEALS.reduce((a, m) => a + mealSum(day, m.id), 0);
  const netSum = (day) => intakeSum(day) - exerciseBurn(day); // 먹은 것에서 운동으로 쓴 만큼을 뺀다

  // ───────── 달력 ─────────
  const now = new Date();
  const view = { y: now.getFullYear(), m: now.getMonth() };

  function renderMonth() {
    const { y, m } = view;
    $('monthTitle').innerHTML = `${m + 1}월 <span class="yr">${y}</span>`;
    document.title = `식단 달력 · ${y}년 ${m + 1}월`;

    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const today = todayKey();
    const parts = [];
    let recorded = 0, monthTotal = 0, monthMax = 0;
    for (let d = 1; d <= count; d++) monthMax = Math.max(monthMax, netSum(data[keyOf(y, m, d)]));

    for (let i = 0; i < first; i++) parts.push('<div class="blank"></div>');
    for (let d = 1; d <= count; d++) {
      const key = keyOf(y, m, d);
      const day = hasEntries(data[key]) ? data[key] : null;
      const intake = intakeSum(day);
      const burn = exerciseBurn(day);
      const total = intake - burn;
      const over = intake > 0 && total > DAY_LIMIT;
      const dow = (first + d - 1) % 7;
      if (intake > 0) { recorded++; monthTotal += total; }

      const cls = ['day'];
      if (dow === 0) cls.push('sun');
      if (dow === 6) cls.push('sat');
      if (key === today) cls.push('today');
      if (over) cls.push('over');

      let meals = '';
      if (day) {
        meals = MEALS.map((meal) => {
          const has = day[meal.id] && day[meal.id].length;
          return `<span class="m m-${meal.id}${has ? '' : ' none'}"><i>${meal.name[0]}<span class="l2">${meal.name[1]}</span></i><b>${has ? fmt(mealSum(day, meal.id)) : ''}</b></span>`;
        }).join('');
        if (day[EXERCISE_ID]) meals += `<span class="m m-x"><i>운<span class="l2">동</span></i><b>${esc(exerciseText(day[EXERCISE_ID]))}</b></span>`;
      }
      const exLabel = day && day[EXERCISE_ID] ? `, 운동 ${exerciseText(day[EXERCISE_ID])}` + (burn ? ` ${burn} 킬로칼로리 소모` : '') : '';
      const sumLabel = intake > 0 ? `합계 ${total} 킬로칼로리${over ? ', 하루 평균 초과' : ''}` : '먹은 기록 없음';
      const label = `${m + 1}월 ${d}일 ${WEEKDAYS[dow]}요일, ` + (day ? `${sumLabel}${exLabel}` : '기록 없음');
      const barValue = total > 0 && monthMax > 0 ? Math.max(8, Math.round((total / monthMax) * 100)) : 0;
      parts.push(
        `<button type="button" class="${cls.join(' ')}" data-date="${key}" aria-label="${label}">` +
        `<span class="num"><span>${d}</span></span>` +
        `<span class="meals">${meals}</span>` +
        `<span class="sum${intake ? '' : ' empty'}">${fmt(intake ? total : 0)}</span>` +
        `<progress class="bar" max="100" value="${barValue}" aria-hidden="true"></progress>` +
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

  // ───────── 밀어서 달 넘기기 ─────────
  // 달력 아무 곳이나 누른 채 왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 이전 달. 세로 스크롤은 그대로 둔다.
  const cal = document.querySelector('.calendar');
  const daysEl = $('days');
  const SWIPE_MIN = 60; // 이만큼(px) 밀어야 넘어간다
  let swipe = null;
  let suppressClick = false;
  let sliding = false;

  function slideMonth(sign) { // sign: 민 방향. -1 왼쪽으로 밀기 → 다음 달, +1 오른쪽으로 밀기 → 이전 달 (책장 넘기듯)
    if (sliding) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { shiftMonth(-sign); resetSlide(); return; }
    sliding = true;
    daysEl.style.transition = 'transform .14s ease-in, opacity .14s ease-in';
    daysEl.style.transform = `translateX(${sign * 30}%)`;
    daysEl.style.opacity = '0';
    setTimeout(() => {
      shiftMonth(-sign);
      daysEl.style.transition = 'none';
      daysEl.style.transform = `translateX(${-sign * 30}%)`;
      void daysEl.offsetWidth; // 위치를 먼저 적용시킨 뒤 들어오는 움직임을 시작
      daysEl.style.transition = 'transform .22s cubic-bezier(.2, .8, .2, 1), opacity .22s';
      daysEl.style.transform = '';
      daysEl.style.opacity = '';
      setTimeout(() => { sliding = false; }, 220);
    }, 140);
  }
  function resetSlide() {
    daysEl.style.transition = 'transform .18s ease-out, opacity .18s';
    daysEl.style.transform = '';
    daysEl.style.opacity = '';
  }

  cal.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || sliding) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, dx: 0 };
  });
  cal.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.active) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipe.active = true;
        try { cal.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
      } else if (Math.abs(dy) > 12) { swipe = null; return; } // 세로 스크롤
      else return;
    }
    swipe.dx = dx;
    daysEl.style.transition = 'none';
    daysEl.style.transform = `translateX(${dx * 0.6}px)`;
    daysEl.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 400));
  });
  const endSwipe = (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const { active, dx } = swipe;
    swipe = null;
    if (!active) return;
    suppressClick = true; // 밀고 난 뒤 손을 뗀 자리의 날짜가 눌리지 않게
    setTimeout(() => { suppressClick = false; }, 80);
    if (e.type === 'pointerup' && Math.abs(dx) >= SWIPE_MIN) slideMonth(dx < 0 ? -1 : 1);
    else resetSlide();
  };
  cal.addEventListener('pointerup', endSwipe);
  cal.addEventListener('pointercancel', endSwipe);
  cal.addEventListener('click', (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
  }, true);

  // 트랙패드 두 손가락 가로 스크롤
  let wheelAcc = 0, wheelLock = 0;
  cal.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (Date.now() < wheelLock) return;
    wheelAcc += e.deltaX;
    if (Math.abs(wheelAcc) > 90) { slideMonth(wheelAcc > 0 ? -1 : 1); wheelAcc = 0; wheelLock = Date.now() + 700; }
  }, { passive: false });

  // ───────── 입력 창 ─────────
  const sheet = $('sheet');
  let editKey = null;
  let draft = null; // 화면용, 빈 줄 포함
  let snapshot = null;
  let touched = new Set();

  function toDraft(day) {
    const out = {};
    for (const { id } of MEALS) {
      const items = day && day[id] ? day[id] : [];
      out[id] = items.length ? items.map((it) => ({ k: it.k ? String(it.k) : '', f: it.f || '' })) : [{ k: '', f: '' }];
    }
    const ex = (day && day[EXERCISE_ID]) || null;
    out[EXERCISE_ID] = { m: ex && ex.m ? String(ex.m) : '', km: ex && ex.km ? String(ex.km) : '' };
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
  function exerciseFromDraft() {
    const ex = draft[EXERCISE_ID];
    return { m: parseInt(ex.m, 10) || 0, km: parseFloat(ex.km) || 0 };
  }
  // 거리는 소수점 한 개까지, 소수 둘째 자리까지만 받는다
  const cleanKm = (value) => {
    const [head, ...rest] = value.replace(/[^0-9.]/g, '').split('.');
    return rest.length ? `${head.slice(0, 3)}.${rest.join('').slice(0, 2)}` : head.slice(0, 3);
  };

  // 화면에 보여 줄 합계: 먹은 것 − 운동. 운동만 적은 날은 합계를 0으로 둔다.
  function draftDay() {
    const day = fromDraft();
    const ex = exerciseFromDraft();
    if (ex.m || ex.km) day[EXERCISE_ID] = ex;
    return day;
  }
  function paintTotal() {
    const day = draftDay();
    const intake = intakeSum(day);
    const burn = exerciseBurn(day);
    const total = intake - burn;
    const over = intake > 0 && total > DAY_LIMIT;
    $('sheetTotal').textContent = fmt(intake ? total : 0);
    const note = $('sheetNote');
    const parts = [];
    if (burn && intake) parts.push(`먹은 것 ${fmt(intake)} − 운동 ${fmt(burn)}`);
    else if (burn) parts.push(`운동으로 ${fmt(burn)} kcal 소모`);
    if (over) parts.push(`하루 평균 ${fmt(DAY_LIMIT)} kcal 넘음`);
    note.textContent = parts.join(' · ');
    note.dataset.over = over ? '1' : '';
  }

  function commit(mealId) {
    const day = fromDraft();
    touched.add(mealId);
    data = updateMeal(data, editKey, mealId, day[mealId] || [], deviceId);
    const ok = persistLocal();
    paintTotal();
    if (!ok && !cfg) $('saved').textContent = '이 브라우저는 저장소를 쓸 수 없어 창을 닫으면 사라집니다';
    renderMonth();
    markDirty();
  }

  function commitExercise() {
    touched.add(EXERCISE_ID);
    data = updateExercise(data, editKey, exerciseFromDraft(), deviceId);
    const ok = persistLocal();
    paintTotal(); // 운동을 고치면 합계도 달라진다
    if (!ok && !cfg) $('saved').textContent = '이 브라우저는 저장소를 쓸 수 없어 창을 닫으면 사라집니다';
    renderMonth();
    markDirty();
  }

  function renderEditor() {
    const date = parseKey(editKey);
    $('sheetDate').textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
    paintTotal();
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
    }).join('') + exerciseBlock();
  }

  function exerciseBlock() {
    const ex = draft[EXERCISE_ID];
    return `
      <div class="meal exercise">
        <div class="row ex">
          <span class="label">운동</span>
          <span class="unit">
            <input class="num" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" enterkeyhint="next"
                   placeholder="0" aria-label="운동한 시간(분)" value="${esc(ex.m)}" data-ex="m"><i>분</i>
          </span>
          <span class="unit">
            <input class="num" type="text" inputmode="decimal" maxlength="6" enterkeyhint="done"
                   placeholder="0" aria-label="운동한 거리(km)" value="${esc(ex.km)}" data-ex="km"><i>km</i>
          </span>
          <span></span>
        </div>
      </div>`;
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
    snapshot = data[key] ? JSON.stringify(data[key]) : null; // 닫기를 누르면 이 상태로 되돌린다
    touched = new Set();
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
  // 닫기: 이번에 열어서 고친 내용은 버리고 닫는다 (완료·바깥 누르기·Esc 는 저장된 그대로 닫음)
  $('cancelDay').addEventListener('click', () => {
    const current = data[editKey] ? JSON.stringify(data[editKey]) : null;
    if (current !== snapshot) {
      // 편집 중 서버에서 들어온 다른 끼니는 보존하고, 이 편집기에서 만진 끼니만 되돌린다.
      const before = snapshot ? JSON.parse(snapshot) : {};
      const restored = restoreSections(data, editKey, before, [...touched], deviceId);
      if (JSON.stringify(restored[editKey] || null) !== current) {
        data = restored;
        persistLocal();
        renderMonth();
        markDirty();
      }
    }
    sheet.close();
  });
  $('prevDay').addEventListener('click', () => shiftDay(-1));
  $('nextDay').addEventListener('click', () => shiftDay(1));

  $('mealsEdit').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.ex) {
      const clean = el.dataset.ex === 'm' ? el.value.replace(/[^0-9]/g, '').slice(0, 4) : cleanKm(el.value);
      if (clean !== el.value) el.value = clean;
      draft[EXERCISE_ID][el.dataset.ex] = el.value;
      commitExercise();
      return;
    }
    if (!el.dataset.field) return;
    if (el.dataset.field === 'k') {
      const clean = el.value.replace(/\D/g, '').slice(0, 5);
      if (clean !== el.value) el.value = clean;
    }
    draft[el.dataset.meal][+el.dataset.i][el.dataset.field] = el.value;
    commit(el.dataset.meal);
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
      commit(del.dataset.del);
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
  let state = cfg || hasVault() ? 'pending' : 'local';
  let stateMsg = '';
  let lastSynced = 0;

  function loadCfg() {
    // 이전 버전이 남긴 평문 토큰은 제거한다. 지금은 세션 저장소와 아래 보관함에만 둔다.
    try { localStorage.removeItem(SYNC_KEY); } catch { /* 무시 */ }
    try {
      const c = JSON.parse(sessionStorage.getItem(SYNC_KEY));
      return c && c.repo && c.token ? c : null;
    }
    catch { return null; }
  }
  function saveCfg(next) {
    cfg = next;
    try { next ? sessionStorage.setItem(SYNC_KEY, JSON.stringify(next)) : sessionStorage.removeItem(SYNC_KEY); } catch { /* 무시 */ }
    if (next) rememberCfg(next); else forgetCfg();
  }

  // ───────── 이 기기에 연결 기억해 두기 ─────────
  // 한 번 연결한 기기에서는 브라우저를 닫았다 열어도 다시 묻지 않는다. 토큰을 그냥 두지는 않고,
  // IndexedDB에 든 "꺼낼 수 없는(non-extractable)" 열쇠로 암호화해 localStorage에 넣는다.
  // 그 열쇠는 스크립트로도 읽어낼 수 없으므로, 저장된 문자열만 빼내서는 토큰을 풀지 못한다.
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  function hasVault() {
    try { return !!localStorage.getItem(VAULT_KEY); } catch { return false; }
  }

  function vaultStore(mode, run) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(VAULT_DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(VAULT_STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(VAULT_STORE, mode);
        const req = run(tx.objectStore(VAULT_STORE));
        tx.oncomplete = () => { db.close(); resolve(req ? req.result : null); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }

  async function vaultKey(create) {
    const found = await vaultStore('readonly', (store) => store.get(VAULT_ID));
    if (found || !create) return found || null;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await vaultStore('readwrite', (store) => store.put(key, VAULT_ID));
    return key;
  }

  async function rememberCfg(next) {
    try {
      const key = await vaultKey(true);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(next)));
      localStorage.setItem(VAULT_KEY, JSON.stringify({ v: 1, iv: toB64(iv), ct: toB64(ct) }));
    } catch { /* 기억해 두지 못하면 다음에 다시 물어보게 된다 */ }
  }

  async function recallCfg() {
    try {
      const saved = JSON.parse(localStorage.getItem(VAULT_KEY));
      if (!saved || saved.v !== 1) return null;
      const key = await vaultKey(false);
      if (!key) return null;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(saved.iv) }, key, fromB64(saved.ct));
      const found = JSON.parse(new TextDecoder().decode(plain));
      return found && found.repo && found.token ? found : null;
    } catch { return null; }
  }

  function forgetCfg() {
    try { localStorage.removeItem(VAULT_KEY); } catch { /* 무시 */ }
    vaultStore('readwrite', (store) => store.delete(VAULT_ID)).catch(() => { /* 무시 */ });
  }

  const b64encode = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

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
    try { return sanitizeData(JSON.parse(text)); }
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
        const before = serializeData(data);
        data = mergeData(data, remote);
        const merged = serializeData(data);
        if (merged !== before) { persistLocal(); renderMonth(); }
        if (merged === serializeData(remote)) { if (stamp === editStamp) dirty = false; break; }

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
      if (err.kind === 'auth') forgetCfg(); // 이 토큰으로는 다시 이을 수 없다
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

  // 연결 키: 토큰을 연결 키로 암호화한 connect.json을 공개 저장소에 두고 새 브라우저에서 잠금을 푼다.
  const KDF_ITER = 600000;
  let blob = null;   // 서버에 올라와 있는 connect.json
  let mode = 'token'; // token | pass | connected | make

  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function sealConfig(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt, KDF_ITER);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ r: cfg.repo, k: cfg.token })));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: KDF_ITER, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  }
  async function openConfig(pass) {
    const key = await deriveKey(pass, fromB64(blob.salt), blob.iter);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function setMode(next) {
    mode = next;
    $('syncHint').textContent = {
      connected: cfg ? `${cfg.repo} 저장소의 ${DATA_PATH} 에 기록을 저장하고 있습니다. 이 기기는 연결을 기억해 둡니다.` : '',
      pass: '연결 키를 입력하면 서버 기록이 나타납니다. 이 기기에는 연결이 기억되므로 다음부터는 묻지 않습니다.',
      token: '비공개 GitHub 저장소를 서버로 씁니다. 토큰은 이 기기에서만 풀 수 있게 암호화해 보관하며, 연결 끊기를 누르면 지워집니다.',
      make: '연결 키로 토큰을 암호화합니다. 암호문은 공개 저장소에 올라가므로, 짐작하기 어려운 16자 이상으로 정해 주세요.',
    }[next];
    $('syncFields').hidden = next !== 'token';
    $('ppFields').hidden = next !== 'pass';
    $('ppMake').hidden = next !== 'make';
    $('ppResult').hidden = true;
    $('syncDisconnect').hidden = next !== 'connected';
    $('ppStart').hidden = next !== 'connected';
    $('useToken').hidden = next !== 'pass';
    $('syncConnect').hidden = next === 'connected';
    $('syncConnect').textContent = next === 'make' ? '만들기' : '연결';
    $('syncConnect').disabled = false;
    $('syncError').textContent = '';
  }

  function openSettings() {
    setMode(cfg ? 'connected' : blob ? 'pass' : 'token');
    if (mode === 'token') { $('syncRepo').value = defaultRepo(); $('syncToken').value = ''; }
    $('ppInput').value = ''; $('ppNew').value = '';
    if (!dlg.open) dlg.showModal();
    if (mode === 'pass') $('ppInput').focus();
  }

  async function connectWithPass() {
    const pass = $('ppInput').value;
    if (!pass) { $('syncError').textContent = '연결 키를 입력해 주세요.'; return; }
    $('syncConnect').disabled = true;
    $('syncError').textContent = '확인 중…';
    let found;
    try { found = await openConfig(pass); }
    catch { $('syncError').textContent = '연결 키가 맞지 않습니다.'; $('syncConnect').disabled = false; $('ppInput').select(); return; }
    saveCfg({ repo: found.r, token: found.k });
    dlg.close();
    dirty = true;
    syncNow();
  }

  async function makePass() {
    if (!$('ppResult').hidden) { // 두 번째 누름: 복사
      try { await navigator.clipboard.writeText($('ppOut').value); $('syncError').textContent = '복사했습니다.'; }
      catch { $('ppOut').select(); $('syncError').textContent = '내용을 길게 눌러 복사해 주세요.'; }
      return;
    }
    const pass = $('ppNew').value;
    if (!validatePassphrase(pass)) { $('syncError').textContent = '16자 이상으로 정해 주세요.'; return; }
    $('syncConnect').disabled = true;
    $('syncError').textContent = '암호화 중…';
    try {
      $('ppOut').value = JSON.stringify(await sealConfig(pass));
      $('ppResult').hidden = false;
      $('syncConnect').textContent = '복사';
      $('syncError').textContent = '';
    } catch { $('syncError').textContent = '이 브라우저에서는 암호화를 쓸 수 없습니다.'; }
    $('syncConnect').disabled = false;
  }

  // 첫 방문 브라우저: connect.json이 있으면 연결 키부터 묻는다.
  async function offerPass() {
    try {
      const res = await fetch('connect.json', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      if (j && j.v === 1 && j.salt && j.iv && j.ct && j.iter >= 100000 && j.iter <= 5000000) blob = j;
    } catch { return; }
    if (!blob || cfg) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('diet.pp.later') === '1'; } catch { /* 무시 */ }
    if (!dismissed && !sheet.open && !dlg.open) openSettings();
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
  const primary = () => (mode === 'pass' ? connectWithPass() : mode === 'make' ? makePass() : mode === 'token' ? connect() : null);
  $('syncConnect').addEventListener('click', primary);
  $('syncForm').addEventListener('submit', (e) => { e.preventDefault(); primary(); });
  $('syncForm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); primary(); }
  });
  $('ppStart').addEventListener('click', () => { setMode('make'); $('ppNew').focus(); });
  $('useToken').addEventListener('click', () => { setMode('token'); $('syncRepo').value = defaultRepo(); $('syncToken').focus(); });
  dlg.addEventListener('close', () => { if (!cfg) { try { sessionStorage.setItem('diet.pp.later', '1'); } catch { /* 무시 */ } } });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('syncDisconnect').addEventListener('click', () => {
    if (!confirm('이 기기의 연결을 끊고 기억해 둔 토큰을 지웁니다. 서버와 이 기기의 기록은 지워지지 않습니다.')) return;
    saveCfg(null); remoteSha = null; clearTimeout(pushTimer);
    setState('local'); dlg.close();
  });
  // ───────── 백업 ─────────
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([serializeData(data)], { type: 'application/json' });
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
      const incoming = sanitizeData(JSON.parse(await file.text()));
      const days = Object.keys(incoming).filter((k) => hasEntries(incoming[k]));
      if (!days.length) { alert('불러올 기록이 없는 파일입니다.'); return; }
      if (!confirm(`${days.length}일치 기록을 불러옵니다. 같은 날짜의 기존 기록은 파일 내용으로 바뀝니다.`)) return;
      for (const k of days) {
        for (const { id } of MEALS) data = updateMeal(data, k, id, incoming[k][id] || [], deviceId);
        data = updateExercise(data, k, incoming[k][EXERCISE_ID] || null, deviceId);
      }
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

  // 기억해 둔 연결이 있으면 그대로 잇고, 없을 때만 연결 키를 묻는다.
  async function start() {
    if (!cfg && hasVault()) {
      const found = await recallCfg();
      if (found) saveCfg(found);
      else { forgetCfg(); setState('local'); }
    }
    if (cfg) syncNow();
    offerPass(); // connect.json은 연결돼 있어도 받아 둔다. 나중에 연결을 끊으면 연결 키 화면을 보여 줘야 한다.
  }

  renderMonth();
  paintStatus();
  start();
})();
