(() => {
  'use strict';

  const STORE_KEY = 'diet.v1';
  const MEALS = [
    { id: 'b', name: '아침' },
    { id: 'l', name: '점심' },
    { id: 'd', name: '저녁' },
    { id: 's', name: '간식' },
  ];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  // data: { "YYYY-MM-DD": { b: [{k: 350, f: "토스트"}], l: [...], d: [...], s: [...] } }
  let data = load();
  let memoryOnly = false;

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('ko-KR');
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => { const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()); };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); return true; }
    catch { memoryOnly = true; return false; }
  }

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
      const day = data[key];
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
          const v = mealSum(day, meal.id);
          const has = day[meal.id] && day[meal.id].length;
          return `<span class="m m-${meal.id}${has ? '' : ' none'}"><i>${meal.name[0]}<span class="l2">${meal.name[1]}</span></i><b>${has ? fmt(v) : '–'}</b></span>`;
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
  let draft = null; // { b: [{k:'', f:''}], ... } — 화면용, 빈 줄 포함

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
    return Object.keys(out).length ? out : null;
  }

  function commit() {
    const day = fromDraft();
    if (day) data[editKey] = day; else delete data[editKey];
    const ok = persist();
    $('sheetTotal').textContent = fmt(daySum(day));
    $('saved').textContent = ok ? '자동 저장됨' : '이 브라우저는 저장소를 쓸 수 없어 창을 닫으면 사라집니다';
    renderMonth();
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
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
    $('saved').textContent = '';
    renderEditor();
    if (!sheet.open) sheet.showModal();
    const target = pickFocus();
    if (target) { target.focus({ preventScroll: false }); target.select(); }
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

  // ───────── 이벤트 ─────────
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

  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); }); // 바깥 누르면 닫기
  sheet.addEventListener('close', () => {
    const btn = editKey && document.querySelector(`.day[data-date="${editKey}"]`);
    editKey = null; draft = null;
    if (btn) btn.focus({ preventScroll: true });
  });

  // ───────── 백업 ─────────
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
      const incoming = JSON.parse(await file.text());
      const clean = {};
      for (const [key, day] of Object.entries(incoming)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== 'object') continue;
        const out = {};
        for (const { id } of MEALS) {
          if (!Array.isArray(day[id])) continue;
          const items = day[id]
            .map((it) => ({ k: Math.max(0, parseInt(it && it.k, 10) || 0), f: String((it && it.f) || '').slice(0, 80) }))
            .filter((it) => it.k > 0 || it.f);
          if (items.length) out[id] = items;
        }
        if (Object.keys(out).length) clean[key] = out;
      }
      const n = Object.keys(clean).length;
      if (!n) { alert('불러올 기록이 없는 파일입니다.'); return; }
      if (!confirm(`${n}일치 기록을 불러옵니다. 같은 날짜의 기존 기록은 파일 내용으로 바뀝니다.`)) return;
      data = { ...data, ...clean };
      persist();
      renderMonth();
    } catch {
      alert('백업 파일을 읽지 못했습니다. 이 페이지에서 저장한 .json 파일인지 확인해 주세요.');
    }
  });

  // 다른 탭에서 바뀌면 반영
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY && !sheet.open) { data = load(); renderMonth(); }
  });

  renderMonth();
})();
