/* ===== 记账本 · 逻辑 =====
 * 数据保存在浏览器 localStorage，不需要注册登录。
 * 记录结构：{ id, amount, category, note, date: 'YYYY-MM-DD', createdAt }
 */
(function () {
  'use strict';

  var STORE_KEY = 'expense_records_v1';

  var CATEGORIES = [
    { key: 'food',      name: '餐饮', icon: '🍜', color: '#ff8a4c' },
    { key: 'transport', name: '交通', icon: '🚌', color: '#4c9aff' },
    { key: 'shopping',  name: '购物', icon: '🛍️', color: '#e86ba8' },
    { key: 'home',      name: '居住', icon: '🏠', color: '#7c6cf0' },
    { key: 'fun',       name: '娱乐', icon: '🎮', color: '#38c1a0' },
    { key: 'health',    name: '医疗', icon: '💊', color: '#f0b429' },
    { key: 'other',     name: '其他', icon: '📦', color: '#9aa4b8' }
  ];

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function $(id) { return document.getElementById(id); }

  /* ---------- 工具 ---------- */

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseDateStr(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function todayStr() { return toDateStr(new Date()); }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatMoney(n) {
    var fixed = (Math.round(n * 100) / 100).toFixed(2);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '¥' + parts.join('.');
  }

  // 把输入框里的文字变成金额；不合法返回 null
  function parseAmount(raw) {
    var s = String(raw == null ? '' : raw).replace(/[\s,，¥￥]/g, '');
    if (!s) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var n = Number(s);
    if (!isFinite(n) || n <= 0) return null;
    return Math.round(n * 100) / 100;
  }

  function getCategory(key) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) return CATEGORIES[i];
    }
    return CATEGORIES[CATEGORIES.length - 1];
  }

  function sumOf(list) {
    return list.reduce(function (s, r) { return s + r.amount; }, 0);
  }

  /* ---------- 存储 ---------- */

  function readRecords() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.filter(function (r) {
        return r && typeof r.amount === 'number' && isFinite(r.amount) && r.amount > 0
          && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date);
      }).map(function (r) {
        return {
          id: r.id || newId(),
          amount: Math.round(r.amount * 100) / 100,
          category: typeof r.category === 'string' ? r.category : 'other',
          note: typeof r.note === 'string' ? r.note : '',
          date: r.date,
          createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now()
        };
      });
    } catch (e) {
      return [];
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(records));
      return true;
    } catch (e) {
      showHint('保存失败：浏览器存储空间不足或已被禁用');
      return false;
    }
  }

  /* ---------- 状态 ---------- */

  var records = [];
  var now = new Date();
  var viewYear = now.getFullYear();
  var viewMonth = now.getMonth() + 1;   // 1-12
  var selectedCategory = 'food';
  var undoHandler = null;
  var toastTimer = null;

  /* ---------- 渲染：顶部 ---------- */

  function monthKey() { return viewYear + '-' + pad2(viewMonth); }

  function monthRecords() {
    var prefix = monthKey() + '-';
    return records.filter(function (r) { return r.date.indexOf(prefix) === 0; });
  }

  function renderHero() {
    $('monthText').textContent = viewYear + '年' + viewMonth + '月';

    var list = monthRecords();
    var total = sumOf(list);
    $('monthTotal').textContent = formatMoney(total);

    var today = todayStr();
    var todayList = records.filter(function (r) { return r.date === today; });
    $('todayTotal').textContent = '今日 ' + formatMoney(sumOf(todayList));
    $('monthCount').textContent = list.length + ' 笔';

    // 不允许翻到未来的月份
    var isCurrent = (viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1);
    $('nextMonth').disabled = isCurrent;
  }

  /* ---------- 渲染：分类占比 ---------- */

  function renderBars() {
    var wrap = $('bars');
    wrap.textContent = '';

    var list = monthRecords();
    var total = sumOf(list);

    if (!list.length) {
      $('statsEmpty').hidden = false;
      return;
    }
    $('statsEmpty').hidden = true;

    var sums = {};
    list.forEach(function (r) {
      sums[r.category] = (sums[r.category] || 0) + r.amount;
    });

    var rows = Object.keys(sums).map(function (k) {
      return { cat: getCategory(k), amount: sums[k] };
    }).sort(function (a, b) { return b.amount - a.amount; });

    rows.forEach(function (row) {
      var pct = total > 0 ? (row.amount / total) * 100 : 0;

      var box = document.createElement('div');
      box.className = 'bar-row';

      var head = document.createElement('div');
      head.className = 'bar-head';

      var name = document.createElement('span');
      name.className = 'bar-name';
      var dot = document.createElement('span');
      dot.className = 'bar-dot';
      dot.style.background = row.cat.color;
      var nameText = document.createElement('span');
      nameText.textContent = row.cat.name;
      name.appendChild(dot);
      name.appendChild(nameText);

      var val = document.createElement('span');
      val.className = 'bar-val';
      val.textContent = formatMoney(row.amount);
      var em = document.createElement('em');
      em.textContent = Math.round(pct) + '%';
      val.appendChild(em);

      head.appendChild(name);
      head.appendChild(val);

      var track = document.createElement('div');
      track.className = 'bar-track';
      var fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = Math.max(pct, 2) + '%';
      fill.style.background = row.cat.color;
      track.appendChild(fill);

      box.appendChild(head);
      box.appendChild(track);
      wrap.appendChild(box);
    });
  }

  /* ---------- 渲染：明细 ---------- */

  function dateLabel(dateStr) {
    var d = parseDateStr(dateStr);
    var base = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (dateStr === todayStr()) return '今天 · ' + base;
    var y = new Date();
    y.setDate(y.getDate() - 1);
    if (dateStr === toDateStr(y)) return '昨天 · ' + base;
    return base + ' · ' + WEEK[d.getDay()];
  }

  function groupByDate(list) {
    var map = {};
    var keys = [];
    list.forEach(function (r) {
      if (!map[r.date]) { map[r.date] = []; keys.push(r.date); }
      map[r.date].push(r);
    });
    keys.sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); }); // 日期倒序
    return keys.map(function (d) {
      var items = map[d].slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
      return { date: d, items: items, total: sumOf(items) };
    });
  }

  function buildDeleteIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M4.6 6h10.8M8.2 6V4.4h3.6V6M6.2 6l.6 9.3c0 .5.4.9.9.9h4.6c.5 0 .9-.4.9-.9L13.8 6');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function createRecordRow(r) {
    var cat = getCategory(r.category);

    var row = document.createElement('div');
    row.className = 'record';

    var icon = document.createElement('div');
    icon.className = 'rec-icon';
    icon.textContent = cat.icon;
    icon.style.background = hexToSoft(cat.color);
    icon.setAttribute('aria-hidden', 'true');

    var main = document.createElement('div');
    main.className = 'rec-main';

    var title = document.createElement('div');
    title.className = 'rec-title';
    title.textContent = r.note || cat.name;

    var sub = document.createElement('div');
    sub.className = 'rec-sub';
    sub.textContent = r.note ? cat.name : '';

    main.appendChild(title);
    if (r.note) main.appendChild(sub);

    var amount = document.createElement('div');
    amount.className = 'rec-amount';
    amount.textContent = formatMoney(r.amount);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'rec-del';
    del.setAttribute('aria-label', '删除这笔记录');
    del.appendChild(buildDeleteIcon());
    del.addEventListener('click', function () { deleteRecord(r.id); });

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(amount);
    row.appendChild(del);
    return row;
  }

  function hexToSoft(hex) {
    var h = String(hex).replace('#', '');
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',0.13)';
  }

  function renderList() {
    var wrap = $('list');
    wrap.textContent = '';

    var list = monthRecords();
    var emptyEl = $('emptyState');

    if (!list.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    var groups = groupByDate(list);
    var frag = document.createDocumentFragment();

    groups.forEach(function (g) {
      var group = document.createElement('div');
      group.className = 'day-group';

      var head = document.createElement('div');
      head.className = 'day-head';

      var dateEl = document.createElement('span');
      dateEl.className = 'day-date';
      dateEl.textContent = dateLabel(g.date);

      var sumEl = document.createElement('span');
      sumEl.className = 'day-sum';
      sumEl.textContent = formatMoney(g.total);

      head.appendChild(dateEl);
      head.appendChild(sumEl);
      group.appendChild(head);

      g.items.forEach(function (r) {
        group.appendChild(createRecordRow(r));
      });

      frag.appendChild(group);
    });

    wrap.appendChild(frag);
  }

  function renderAll() {
    renderHero();
    renderBars();
    renderList();
  }

  /* ---------- 分类选择 ---------- */

  function renderChips() {
    var wrap = $('categoryChips');
    wrap.textContent = '';

    CATEGORIES.forEach(function (c) {
      var isActive = c.key === selectedCategory;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (isActive ? ' is-active' : '');
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');

      var dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.background = c.color;

      var label = document.createElement('span');
      label.textContent = c.name;

      btn.appendChild(dot);
      btn.appendChild(label);
      btn.addEventListener('click', function () {
        selectedCategory = c.key;
        renderChips();
      });

      wrap.appendChild(btn);
    });
  }

  /* ---------- 提示 ---------- */

  function showHint(message) {
    var el = $('addHint');
    el.textContent = message || '';
    el.classList.toggle('is-show', !!message);
  }

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function showToast(text, onUndo) {
    $('toastText').textContent = text;
    undoHandler = onUndo || null;
    $('toastAction').hidden = !onUndo;
    $('toast').hidden = false;
    // 触发过渡
    void $('toast').offsetWidth;
    $('toast').classList.add('is-show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').classList.remove('is-show');
    undoHandler = null;
    setTimeout(function () {
      if (!$('toast').classList.contains('is-show')) $('toast').hidden = true;
    }, 240);
  }

  /* ---------- 业务操作 ---------- */

  function addRecord(event) {
    event.preventDefault();

    var amount = parseAmount($('amountInput').value);
    if (amount === null) {
      showHint('请输入正确的金额，比如 12.5');
      shake($('amountRow'));
      $('amountInput').focus();
      return;
    }

    var date = $('dateInput').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayStr();

    var record = {
      id: newId(),
      amount: amount,
      category: selectedCategory,
      note: $('noteInput').value.trim(),
      date: date,
      createdAt: Date.now()
    };

    records.push(record);
    if (!saveRecords()) return;

    // 如果记的是别的月份，自动跳到那个月，避免"记了却看不到"
    var parts = date.split('-');
    viewYear = Number(parts[0]);
    viewMonth = Number(parts[1]);

    $('amountInput').value = '';
    $('noteInput').value = '';
    showHint('');
    renderAll();

    showToast('已记一笔 ' + formatMoney(amount), null);
    $('amountInput').focus();
  }

  function deleteRecord(id) {
    var index = -1;
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === id) { index = i; break; }
    }
    if (index < 0) return;

    var removed = records[index];
    records.splice(index, 1);
    saveRecords();
    renderAll();

    showToast('已删除 ' + formatMoney(removed.amount), function () {
      records.splice(Math.min(index, records.length), 0, removed);
      saveRecords();
      renderAll();
      hideToast();
      showToast('已恢复', null);
    });
  }

  function shiftMonth(delta) {
    var y = viewYear;
    var m = viewMonth + delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }

    var currentY = now.getFullYear();
    var currentM = now.getMonth() + 1;
    if (y > currentY || (y === currentY && m > currentM)) return;   // 不翻到未来

    viewYear = y;
    viewMonth = m;
    renderAll();
  }

  /* ---------- 事件绑定 ---------- */

  function bindEvents() {
    $('addForm').addEventListener('submit', addRecord);

    $('amountInput').addEventListener('focus', function () {
      $('amountRow').classList.add('is-focus');
    });
    $('amountInput').addEventListener('blur', function () {
      $('amountRow').classList.remove('is-focus');
    });
    $('amountInput').addEventListener('input', function () {
      if (this.value.trim()) showHint('');
    });

    $('prevMonth').addEventListener('click', function () { shiftMonth(-1); });
    $('nextMonth').addEventListener('click', function () { shiftMonth(1); });

    $('toastAction').addEventListener('click', function () {
      if (undoHandler) undoHandler();
    });

    // 其它标签页改动时同步
    window.addEventListener('storage', function (event) {
      if (event.key === STORE_KEY) {
        records = readRecords();
        renderAll();
      }
    });
  }

  /* ---------- 启动 ---------- */

  function init() {
    records = readRecords();
    $('dateInput').value = todayStr();
    $('dateInput').max = todayStr();
    renderChips();
    bindEvents();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
