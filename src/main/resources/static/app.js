/* ==========================================================================
   baileyes/eyes — patterns UI · единый файл
   --------------------------------------------------------------------------
   Часть 1: ЯДРО (роутинг, темы, поиск, терминал, подсветка, UML-хелперы)
   Часть 2: все 21 паттерн (Strategy, State, Chains, Adapter, Bridge,
            Decorator, Facade, Factory, Circuit-breaker, ExceptionHandler,
            Logger-starter, Kafka-starter, api-composition,
            Transactional Outbox, Transactional Inbox, Rate Limiter,
            Retry + Jitter, Dead Letter Topic, Retry Topic, Backpressure, CQRS)
   ========================================================================== */

/* =========================================================================
   ЧАСТЬ 1. ЯДРО
   ========================================================================= */
(function (global) {
    'use strict';

    /* ----- Утилиты ----- */
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function pad(n, w) { w = w || 2; return String(n).padStart(w, '0'); }
    function uuid() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    function hashCode(str) {
        var h = 0, i;
        for (i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }
    function stamp(d) {
        d = d || new Date();
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
    }

    /* ----- Жизненный цикл таймеров (чтобы демо не писали в удалённый DOM) ----- */
    var _timers = [], _rafs = [], _cleanups = [];
    function later(ms, fn) { var id = setTimeout(function () { drop(_timers, id); fn(); }, ms); _timers.push(id); return id; }
    function every(ms, fn) { var id = setInterval(fn, ms); _timers.push(id); return id; }
    function frame(fn) { var id = requestAnimationFrame(fn); _rafs.push(id); return id; }
    function cancel(id) { clearTimeout(id); clearInterval(id); cancelAnimationFrame(id); drop(_timers, id); drop(_rafs, id); }
    function onLeave(fn) { _cleanups.push(fn); }
    function drop(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); }
    function teardown() {
        _timers.forEach(function (id) { clearTimeout(id); clearInterval(id); });
        _rafs.forEach(function (id) { cancelAnimationFrame(id); });
        _timers.length = 0; _rafs.length = 0;
        while (_cleanups.length) { try { _cleanups.pop()(); } catch (e) { /* */ } }
    }

    /* ----- Терминал ----- */
    function createTerminal(title, opts) {
        opts = opts || {};
        var wrap = document.createElement('div');
        wrap.className = 'term';
        wrap.innerHTML =
            '<div class="term-bar">' +
            '<span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>' +
            '<span class="term-title">' + esc(title || 'application console') + '</span>' +
            '<button class="term-clear" type="button" aria-label="Очистить лог">clear</button>' +
            '</div><div class="term-body" role="log" aria-live="polite" tabindex="0"></div>';
        var body = wrap.querySelector('.term-body');
        var empty = document.createElement('div');
        empty.className = 'term-empty'; empty.textContent = '// лог пуст — запустите демо';
        body.appendChild(empty);
        wrap.querySelector('.term-clear').addEventListener('click', clear);

        function clear() {
            body.innerHTML = '';
            empty = document.createElement('div');
            empty.className = 'term-empty';
            empty.textContent = '// лог очищен';
            body.appendChild(empty);
        }
        function append(html, levelClass) {
            if (empty && empty.parentNode) { body.innerHTML = ''; empty = null; }
            var line = document.createElement('div');
            line.className = 'term-line' + (levelClass ? ' ' + levelClass : '');
            line.innerHTML = html; body.appendChild(line);
            var near = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
            if (near || opts.forceScroll) body.scrollTop = body.scrollHeight;
            if (opts.maxLines && body.children.length > opts.maxLines) body.removeChild(body.firstChild);
            return line;
        }
        function log(msg, level, logger) {
            level = level || 'INFO';
            var head = '<span class="ts">' + stamp() + '</span> <span class="lv lv-' + level + '">' + level.padEnd(5, ' ') + '</span> ';
            if (logger) head += '<span class="lg">' + esc(logger).padEnd(22, ' ') + '</span>: ';
            return append(head + msg, 'l-' + level);
        }
        return {
            node: wrap, body: body, log: log, clear: clear,
            info: function (m, lg) { return log(m, 'INFO', lg); },
            warn: function (m, lg) { return log(m, 'WARN', lg); },
            error: function (m, lg) { return log(m, 'ERROR', lg); },
            debug: function (m, lg) { return log(m, 'DEBUG', lg); },
            ok: function (m, lg) { return log(m, 'OK', lg); },
            raw: function (html, cls) { return append(html, cls); }
        };
    }

    /* ----- Подсветка Java ----- */
    var JAVA_KEYWORDS = ('abstract assert boolean break byte case catch char class const continue default do double ' +
        'else enum extends final finally float for goto if implements import instanceof int interface long native new ' +
        'package private protected public return short static strictfp super switch synchronized this throw throws ' +
        'transient try var void volatile while record sealed permits yield').split(' ');
    var KW_SET = {}; JAVA_KEYWORDS.forEach(function (k) { KW_SET[k] = 1; });
    var TOKEN_RE = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\])*")|(@[A-Za-z_][\w.]*)|\b(\d[\d_]*(?:\.\d+)?[LlFfDd]?)\b|\b([A-Za-z_$][\w$]*)\b/g;

    function hlJava(src) {
        var out = '', last = 0, m;
        TOKEN_RE.lastIndex = 0;
        while ((m = TOKEN_RE.exec(src)) !== null) {
            out += esc(src.slice(last, m.index));
            if (m[1] != null) out += '<span class="tok-com">' + esc(m[1]) + '</span>';
            else if (m[2] != null) out += '<span class="tok-str">' + esc(m[2]) + '</span>';
            else if (m[3] != null) out += '<span class="tok-ann">' + esc(m[3]) + '</span>';
            else if (m[4] != null) out += '<span class="tok-num">' + esc(m[4]) + '</span>';
            else {
                var w = m[5];
                if (KW_SET[w]) out += '<span class="tok-kw">' + w + '</span>';
                else if (/^[A-Z]/.test(w)) out += '<span class="tok-cls">' + w + '</span>';
                else out += esc(w);
            }
            last = TOKEN_RE.lastIndex;
        }
        return out + esc(src.slice(last));
    }
    function hlJson(src) {
        return esc(src)
            .replace(/&quot;([^&]*?)&quot;(\s*:)/g, '<span class="j-key">&quot;$1&quot;</span>$2')
            .replace(/:\s*&quot;([\s\S]*?)&quot;/g, ': <span class="j-str">&quot;$1&quot;</span>')
            .replace(/\b(true|false)\b/g, '<span class="j-bool">$1</span>')
            .replace(/\bnull\b/g, '<span class="j-null">null</span>')
            .replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span class="j-num">$1</span>');
    }

    /* ----- UML-хелперы ----- */
    var umlSeq = 0;
    function Uml(w, h) { this.w = w; this.h = h; this.n = ++umlSeq; this.body = ''; }
    Uml.prototype.box = function (x, y, w, title, stereo, rows, kind) {
        var headH = stereo ? 32 : 22, rowH = 15;
        var h = headH + (rows && rows.length ? rows.length * rowH + 6 : 6);
        var cls = 'uml-box' + (kind ? ' ' + kind : '');
        var s = '<g><rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="5"/>';
        if (stereo) s += '<text class="uml-stereo" x="' + (x + w / 2) + '" y="' + (y + 13) + '" text-anchor="middle">' + esc(stereo) + '</text>';
        s += '<text class="uml-title' + (/interface|abstract/.test(stereo || '') ? ' i' : '') + '" x="' + (x + w / 2) + '" y="' + (y + (stereo ? 26 : 15)) + '" text-anchor="middle">' + esc(title) + '</text>';
        s += '<line class="uml-edge" x1="' + x + '" y1="' + (y + headH) + '" x2="' + (x + w) + '" y2="' + (y + headH) + '"/>';
        (rows || []).forEach(function (r, i) {
            s += '<text class="uml-row" x="' + (x + 9) + '" y="' + (y + headH + 12 + i * rowH) + '">' + esc(r) + '</text>';
        });
        this.body += s + '</g>';
        return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2 };
    };
    Uml.prototype.arrow = function (x1, y1, x2, y2, kind, label, lblDx, lblDy) {
        kind = kind || 'assoc';
        var n = this.n, dashed = (kind === 'impl' || kind === 'dep') ? ' dashed' : '';
        var spring = kind === 'spring' ? ' spring' : '';
        if (kind === 'spring') dashed = ' dashed';
        var markerEnd = '', markerStart = '';
        if (kind === 'impl' || kind === 'ext') markerEnd = ' marker-end="url(#' + n + '-tri)"';
        else if (kind === 'dep' || kind === 'assoc' || kind === 'spring') markerEnd = ' marker-end="url(#' + n + '-arr)"';
        if (kind === 'agg') markerStart = ' marker-start="url(#' + n + '-agg)"';
        if (kind === 'comp') markerStart = ' marker-start="url(#' + n + '-comp)"';
        var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / len, uy = dy / len;
        var sx = x1 + ux * 2, sy = y1 + uy * 2, ex = x2 - ux * 3, ey = y2 - uy * 3;
        var s = '<line class="uml-edge' + dashed + spring + '" x1="' + sx.toFixed(1) + '" y1="' + sy.toFixed(1) +
            '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '"' + markerStart + markerEnd + '/>';
        if (label) s += '<text class="uml-lbl" x="' + ((sx + ex) / 2 + (lblDx || 0)).toFixed(1) + '" y="' + ((sy + ey) / 2 + (lblDy || -5)).toFixed(1) + '" text-anchor="middle">' + esc(label) + '</text>';
        this.body += s;
    };
    Uml.prototype.html = function (ariaLabel, opts) {
        var n = this.n;
        var defs =
            '<defs>' +
            '<marker id="' + n + '-tri" class="mk-tri" markerWidth="14" markerHeight="13" refX="12.5" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L13,6 L1,11 z"/></marker>' +
            '<marker id="' + n + '-arr" class="mk-arr" markerWidth="13" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1.5 L11,6 L1,10.5"/></marker>' +
            '<marker id="' + n + '-agg" class="mk-agg" markerWidth="16" markerHeight="13" refX="1.5" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1.5,6 L8,1 L14.5,6 L8,11 z"/></marker>' +
            '<marker id="' + n + '-comp" class="mk-comp" markerWidth="16" markerHeight="13" refX="1.5" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1.5,6 L8,1 L14.5,6 L8,11 z"/></marker>' +
            '</defs>';
        return '<div class="uml-wrap"><svg class="uml" viewBox="0 0 ' + this.w + ' ' + this.h + '" width="' + this.w + '" role="img" aria-label="' + esc(ariaLabel || 'UML-диаграмма') + '" preserveAspectRatio="xMidYMid meet">' +
            defs + this.body + '</svg></div>' + (opts && opts.legend === false ? '' : legendHtml());
    };
    function legendHtml() {
        function l(path, cls, txt) {
            return '<span><svg width="42" height="12" viewBox="0 0 42 12" aria-hidden="true"><path class="lg-line ' + (cls || '') + '" d="' + path + '"/></svg>' + txt + '</span>';
        }
        return '<div class="uml-legend">' +
            l('M2,6 H40', '', 'ассоциация / вызов') +
            l('M2,6 H40', 'd', 'реализация интерфейса (..|>)') +
            '<span><svg width="42" height="12" viewBox="0 0 42 12" aria-hidden="true"><path class="lg-line" d="M2,6 H30"/><path d="M30,1 L40,6 L30,11 z" fill="var(--panel)" stroke="var(--uml-line)" stroke-width="1.2"/></svg>наследование</span>' +
            '<span><svg width="42" height="12" viewBox="0 0 42 12" aria-hidden="true"><path d="M2,6 L9,1 L16,6 L9,11 z" fill="var(--panel)" stroke="var(--uml-line)" stroke-width="1.2"/><path class="lg-line" d="M16,6 H40"/></svg>агрегация</span>' +
            '<span><svg width="42" height="12" viewBox="0 0 42 12" aria-hidden="true"><path d="M2,6 L9,1 L16,6 L9,11 z" fill="var(--uml-line)"/><path class="lg-line" d="M16,6 H40"/></svg>композиция</span>' +
            '</div>';
    }

    /* ----- Реестр паттернов ----- */
    var CATS = {
        creational:     { title: 'GoF · Creational',      desc: 'Порождающие: кто и как создаёт объекты',         color: 'var(--warn)'   },
        behavioral:     { title: 'GoF · Behavioral',      desc: 'Поведенческие: распределение ответственности',   color: 'var(--accent)' },
        structural:     { title: 'GoF · Structural',      desc: 'Структурные: композиция классов и объектов',     color: 'var(--violet)' },
        infrastructure: { title: 'Spring Infrastructure', desc: 'Инфраструктурные стартеры и аспекты',            color: 'var(--ok)'     },
        integration:    { title: 'Integration',           desc: 'Агрегация и согласованность микросервисов',      color: 'var(--err)'    },
        reliability:    { title: 'Reliability',           desc: 'Лимиты, повторы и изоляция сбоев',               color: 'var(--teal)'   },
        distributed:    { title: 'Distributed Data',      desc: 'Маршрутизация чтения и записи по репликам',      color: 'var(--pink)'   }
    };
    var patterns = [], byId = Object.create(null), displayCache = null;
    function registerPattern(id, def) { def.id = id; if (!def.category) def.category = 'behavioral'; byId[id] = def; patterns.push(def); displayCache = null; return def; }
    function displayPatterns() {
        if (displayCache) return displayCache;
        var list = [];
        Object.keys(CATS).forEach(function (catKey) {
            patterns.forEach(function (p) { if (p.category === catKey) list.push(p); });
        });
        patterns.forEach(function (p) { if (list.indexOf(p) < 0) list.push(p); });
        displayCache = list;
        return list;
    }
    function displayIndex(id) {
        var list = displayPatterns();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
        return -1;
    }

    /* ----- Тема ----- */
    var THEME_KEY = 'eyes-theme';
    function preferredTheme() {
        var saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
        if (saved === 'light' || saved === 'dark') return saved;
        return (global.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
        var btn = document.getElementById('themeToggle');
        if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    }

    /* ----- Рендер ----- */
    var view, breadcrumbs, sideNav;
    function crumb(items) {
        breadcrumbs.innerHTML = items.map(function (it, i) {
            var last = i === items.length - 1;
            var sep = i ? '<span class="sep" aria-hidden="true">/</span>' : '';
            if (last) return sep + '<span class="cur" aria-current="page">' + esc(it.label) + '</span>';
            return sep + '<a href="' + it.href + '">' + esc(it.label) + '</a>';
        }).join('');
    }
    function renderHome() {
        crumb([{ label: 'Главная', href: '#/' }]);
        document.title = 'patterns · baileyes/eyes';
        var totalClasses = patterns.reduce(function (a, p) { return a + (p.javaClasses ? p.javaClasses.length : 0); }, 0);
        view.innerHTML =
            '<section class="hero"><h1>Паттерны проектирования в Java&nbsp;Spring&nbsp;Boot</h1>' +
            '<p>Интерактивная визуализация репозитория <code>baileyes/eyes</code>: для каждого паттерна — суть, ' +
            'UML-структура реальных классов, работающее JS-демо логики и исходный Java-код. ' +
            'Фронтенд полностью статический: все демо работают в браузере без бэкенда.</p>' +
            '<div class="hero-stats"><span class="stat"><b>' + patterns.length + '</b> паттернов</span>' +
            '<span class="stat"><b>' + Object.keys(CATS).length + '</b> категорий</span>' +
            '<span class="stat"><b>' + totalClasses + '</b> Java-классов</span>' +
            '<span class="stat"><b>0</b> зависимостей</span></div></section>' +
            '<div id="groups"></div><div id="homeEmpty" class="empty" hidden>Ничего не найдено.</div>';
        var groupsHost = view.querySelector('#groups');
        Object.keys(CATS).forEach(function (catKey) {
            var list = patterns.filter(function (p) { return p.category === catKey; });
            if (!list.length) return;
            var cat = CATS[catKey];
            var sec = document.createElement('section');
            sec.className = 'group c-' + catKey;
            sec.innerHTML = '<div class="group-head"><h2><span class="dot" aria-hidden="true"></span>' + esc(cat.title) + '</h2>' +
                '<p>' + esc(cat.desc) + ' · ' + list.length + ' шт.</p></div><div class="grid">' + list.map(cardHtml).join('') + '</div>';
            groupsHost.appendChild(sec);
        });
        Array.prototype.forEach.call(view.querySelectorAll('.card'), function (c) {
            c.addEventListener('click', function () { location.hash = '#/' + c.getAttribute('data-id'); });
        });
        applySearch(document.getElementById('search').value);
        syncSidebar();
    }
    function cardHtml(p) {
        var idx = displayIndex(p.id) + 1, cat = CATS[p.category] || CATS.behavioral;
        var chips = (p.javaClasses || []).slice(0, 5).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('');
        var rest = (p.javaClasses || []).length - 5; if (rest > 0) chips += '<span class="chip more">+' + rest + '</span>';
        var blob = (p.id + ' ' + p.title + ' ' + p.subtitle + ' ' + (p.javaClasses || []).join(' ') + ' ' + cat.title).toLowerCase();
        return '<button type="button" class="card" data-id="' + p.id + '" data-search="' + esc(blob) + '" style="--dotc:' + cat.color + '" aria-label="' + esc(p.title) + '">' +
            '<div class="card-top"><span class="card-idx">' + pad(idx) + '</span><h3>' + esc(p.title) + '</h3></div>' +
            '<div class="sub" data-role="sub">' + esc(p.subtitle) + '</div><div class="chips">' + chips + '</div>' +
            '<span class="badge b-' + p.category + '">' + esc(cat.title) + '</span></button>';
    }
    function renderPattern(id) {
        var p = byId[id]; if (!p) { renderHome(); return; }
        var cat = CATS[p.category] || CATS.behavioral, order = displayPatterns(), idx = displayIndex(id);
        document.title = p.title + ' · patterns';
        crumb([{ label: 'Главная', href: '#/' }, { label: cat.title, href: '#/?cat=' + p.category }, { label: p.title, href: '#/' + p.id }]);
        view.innerHTML =
            '<header class="p-head"><div class="row"><span class="badge b-' + p.category + '">' + esc(cat.title) + '</span>' +
            '<span class="hash">#/' + esc(p.id) + '</span><span class="card-idx">паттерн ' + pad(idx + 1) + ' из ' + patterns.length + '</span></div>' +
            '<h1>' + esc(p.title) + '</h1><p class="sub">' + esc(p.subtitle) + '</p>' +
            '<div class="kv">' + (p.javaClasses || []).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div></header>' +
            '<nav class="toc"><a href="#sec-essence">① Суть</a><a href="#sec-structure">② Структура</a><a href="#sec-demo">③ Демо</a><a href="#sec-code">④ Код</a></nav>' +
            '<section class="section" id="sec-essence"><h2><span class="ic">①</span>Суть паттерна</h2><div class="lead">' + (p.essence || '') + '</div></section>' +
            '<section class="section" id="sec-structure"><h2><span class="ic">②</span>Структура классов</h2><div id="diagramHost"></div></section>' +
            '<section class="section" id="sec-demo"><h2><span class="ic">③</span>Интерактивное демо</h2><div id="demoHost" class="demo-grid"></div></section>' +
            '<section class="section" id="sec-code"><h2><span class="ic">④</span>Java-код</h2><div id="codeHost"></div></section>' +
            '<nav class="pager" id="pager"></nav><a class="pager-home" href="#/">← На главную</a>';
        var dh = view.querySelector('#diagramHost');
        if (typeof p.diagram === 'function') p.diagram(dh);
        var demoHost = view.querySelector('#demoHost');
        var ctx = {
            terminal: createTerminal, esc: esc, uuid: uuid, later: later, every: every,
            frame: frame, cancel: cancel, onLeave: onLeave, hashCode: hashCode,
            stamp: stamp, hlJson: hlJson, hlJava: hlJava, pattern: p, host: demoHost
        };
        if (typeof p.demo === 'function') p.demo(demoHost, ctx);
        renderCodeTabs(view.querySelector('#codeHost'), p.code || []);
        var prev = order[(idx - 1 + order.length) % order.length];
        var next = order[(idx + 1) % order.length];
        view.querySelector('#pager').innerHTML =
            '<a href="#/' + prev.id + '"><span class="dir">← предыдущий</span><span class="nm">' + esc(prev.title) + '</span></a>' +
            '<a class="next" href="#/' + next.id + '"><span class="dir">следующий →</span><span class="nm">' + esc(next.title) + '</span></a>';
        syncSidebar(); global.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function renderCodeTabs(host, files) {
        if (!files.length) { host.innerHTML = '<p class="hint">Код не задан.</p>'; return; }
        var tabsId = 'ct-' + (++umlSeq);
        host.innerHTML =
            '<div class="code-tabs" role="tablist">' +
            files.map(function (f, i) { return '<button type="button" role="tab" id="' + tabsId + '-t' + i + '" class="code-tab" aria-selected="' + (i === 0) + '" aria-controls="' + tabsId + '-p' + i + '" tabindex="' + (i === 0 ? 0 : -1) + '">' + esc(f.file) + '</button>'; }).join('') +
            '</div>' +
            files.map(function (f, i) {
                return '<div role="tabpanel" class="code-panel" id="' + tabsId + '-p' + i + '" aria-labelledby="' + tabsId + '-t' + i + '"' + (i ? ' hidden' : '') + ' tabindex="0">' +
                    '<div class="code-head"><span class="pkg">' + esc(f.pkg || '') + '</span><button type="button" class="copy-btn" data-i="' + i + '">copy</button></div>' +
                    '<pre class="code"><code>' + hlJava(f.src) + '</code></pre></div>';
            }).join('');
        var tabs = Array.prototype.slice.call(host.querySelectorAll('[role="tab"]'));
        function select(i, focus) {
            tabs.forEach(function (t, k) { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; host.querySelector('#' + tabsId + '-p' + k).hidden = (k !== i); });
            if (focus) tabs[i].focus();
        }
        tabs.forEach(function (t, i) {
            t.addEventListener('click', function () { select(i, false); });
            t.addEventListener('keydown', function (e) {
                var k = null;
                if (e.key === 'ArrowRight') k = (i + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') k = (i - 1 + tabs.length) % tabs.length;
                if (k !== null) { e.preventDefault(); select(k, true); }
            });
        });
        Array.prototype.forEach.call(host.querySelectorAll('.copy-btn'), function (btn) {
            btn.addEventListener('click', function () {
                var src = files[Number(btn.getAttribute('data-i'))].src;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(src).then(function () {
                        btn.textContent = 'скопировано'; btn.classList.add('done');
                        setTimeout(function () { btn.textContent = 'copy'; btn.classList.remove('done'); }, 1400);
                    });
                }
            });
        });
    }

    /* ----- Сайдбар, поиск ----- */
    function buildSidebar() {
        var html = '<a class="side-link" href="#/" data-home="1"><span class="n">⌂</span>Главная</a>';
        Object.keys(CATS).forEach(function (catKey) {
            var list = patterns.filter(function (p) { return p.category === catKey; });
            if (!list.length) return;
            html += '<div class="side-group"><h3>' + esc(CATS[catKey].title) + '</h3>';
            list.forEach(function (p) {
                html += '<a class="side-link" href="#/' + p.id + '" data-id="' + p.id + '" data-search="' +
                    esc((p.id + ' ' + p.title + ' ' + (p.javaClasses || []).join(' ')).toLowerCase()) + '">' +
                    '<span class="n">' + pad(displayIndex(p.id) + 1) + '</span>' + esc(p.title) + '</a>';
            });
            html += '</div>';
        });
        sideNav.innerHTML = html;
    }
    function syncSidebar() {
        var cur = currentHash();
        Array.prototype.forEach.call(sideNav.querySelectorAll('.side-link'), function (a) {
            var isCur = a.getAttribute('data-id') ? a.getAttribute('data-id') === cur : !cur;
            if (isCur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
    }
    function applySearch(q) {
        q = (q || '').trim().toLowerCase();
        Array.prototype.forEach.call(sideNav.querySelectorAll('.side-link[data-id]'), function (a) {
            a.classList.toggle('hidden', !!q && a.getAttribute('data-search').indexOf(q) < 0);
        });
        var cards = view.querySelectorAll('.card');
        if (!cards.length) return;
        Array.prototype.forEach.call(cards, function (c) {
            var hit = !q || c.getAttribute('data-search').indexOf(q) >= 0;
            c.classList.toggle('hidden', !hit);
            var sub = c.querySelector('[data-role="sub"]');
            var p = byId[c.getAttribute('data-id')];
            if (sub && p) sub.innerHTML = q && hit ? esc(p.subtitle).replace(new RegExp('(' + esc(q) + ')', 'gi'), '<mark>$1</mark>') : esc(p.subtitle);
        });
        Array.prototype.forEach.call(view.querySelectorAll('.group'), function (g) {
            g.style.display = g.querySelectorAll('.card:not(.hidden)').length ? '' : 'none';
        });
        var e = document.getElementById('homeEmpty'); if (e) e.hidden = !!view.querySelectorAll('.card:not(.hidden)').length;
    }
    function setSidebar(open) {
        var sb = document.getElementById('sidebar'), bd = document.getElementById('backdrop'), bg = document.getElementById('burger');
        sb.classList.toggle('open', open); bd.hidden = !open;
        requestAnimationFrame(function () { bd.classList.toggle('show', open); });
        bg.setAttribute('aria-expanded', String(open));
    }

    /* ----- Роутинг ----- */
    function currentHash() { return location.hash.replace(/^#\/?/, '').split('?')[0].trim(); }
    function route() {
        teardown(); setSidebar(false);
        var id = currentHash();
        if (!id || !byId[id]) renderHome(); else renderPattern(id);
    }
    function boot() {
        view = document.getElementById('view');
        breadcrumbs = document.getElementById('breadcrumbs');
        sideNav = document.getElementById('sideNav');
        applyTheme(preferredTheme());
        buildSidebar();
        document.getElementById('themeToggle').addEventListener('click', function () {
            applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
        });
        document.getElementById('burger').addEventListener('click', function () {
            setSidebar(!document.getElementById('sidebar').classList.contains('open'));
        });
        document.getElementById('backdrop').addEventListener('click', function () { setSidebar(false); });
        var searchInput = document.getElementById('search');
        searchInput.addEventListener('input', function () {
            if (currentHash() && byId[currentHash()]) { location.hash = '#/'; setTimeout(function () { applySearch(searchInput.value); }, 0); }
            else applySearch(searchInput.value);
        });
        document.addEventListener('keydown', function (e) {
            var tag = (e.target.tagName || '').toLowerCase();
            if (e.key === '/' && tag !== 'input' && tag !== 'textarea') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
            if (e.key === 'Escape') { if (document.activeElement === searchInput) { searchInput.value = ''; applySearch(''); } setSidebar(false); }
        });
        global.addEventListener('hashchange', route);
        route();
    }

    /* ----- Публичный API (для блока паттернов) ----- */
    global.App = {
        esc: esc, uuid: uuid, pad: pad, hashCode: hashCode, stamp: stamp,
        later: later, every: every, frame: frame, cancel: cancel, onLeave: onLeave,
        terminal: createTerminal, hlJava: hlJava, hlJson: hlJson, Uml: Uml,
        registerPattern: registerPattern, CATS: CATS
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window);


/* =========================================================================
   ЧАСТЬ 2. ВСЕ 21 ПАТТЕРН
   ========================================================================= */
(function (App) {
    'use strict';
    var esc = App.esc, Uml = App.Uml;
    function put(host, uml, caption) {
        host.innerHTML = uml.html() + (caption ? '<p class="hint uml-caption" style="margin-top:10px">' + caption + '</p>' : '');
    }

    /* ===== 1. STRATEGY ===== */
    App.registerPattern('strategy', {
        title: 'Strategy', subtitle: 'Map<Animals, AnimalStrategy> вместо switch: новая стратегия не меняет getAnimal()', category: 'behavioral',
        javaClasses: ['AnimalStrategy', 'CatStrategy', 'DogStrategy', 'AnimalContext', 'AnimalService', 'Cat', 'Dog', 'Animals'],
        essence: '<p><strong>Strategy</strong> заменяет ветвление по типу на объект-стратегию: ' +
            '<code>AnimalContext</code> хранит <code>Map&lt;Animals, AnimalStrategy&gt;</code> и делает один lookup — ' +
            '<code>strategies.get(type).getAnimal()</code>.</p>' +
            '<p><strong>Что это даёт:</strong> новая стратегия — это новый класс и регистрация в map, а <code>getAnimal()</code> не меняется. ' +
            'Стратегии тестируются отдельно, а неизвестный ключ даёт <code>IllegalArgumentException</code> → ' +
            '<a class="inline-link" href="#/exception-handler">HTTP 400</a>.</p>',
        diagram: function (host) {
            var u = new Uml(840, 400);
            u.box(20, 30, 250, 'AnimalContext', '@Service', ['- Map<Animals, AnimalStrategy> strategies', '- CatStrategy catStrategy', '- DogStrategy dogStrategy', '+ @PostConstruct init()', '+ getAnimal(Animals) : Object'], 'spring');
            u.box(360, 30, 210, 'AnimalStrategy', '«interface»', ['+ getAnimal() : Object'], 'iface');
            u.box(315, 160, 140, 'CatStrategy', '@Service', ['+ getAnimal() : Cat'], 'spring');
            u.box(475, 160, 140, 'DogStrategy', '@Service', ['+ getAnimal() : Dog'], 'spring');
            u.box(325, 275, 120, 'Cat', '@Entity', ['UUID id', 'String name', 'int age'], 'entity');
            u.box(485, 275, 120, 'Dog', '@Entity', ['UUID id', 'String name', 'int age'], 'entity');
            u.box(650, 30, 160, 'Animals', '«enum»', ['CAT', 'DOG']);
            u.arrow(270, 78, 360, 62, 'agg', 'strategies');
            u.arrow(370, 160, 420, 83, 'impl', '');
            u.arrow(540, 160, 500, 83, 'impl', '');
            u.arrow(385, 213, 385, 275, 'comp', 'new Cat()');
            u.arrow(545, 213, 545, 275, 'comp', 'new Dog()');
            put(host, u, 'Контекст не знает конкретный класс: <code>getAnimal(type)</code> = <code>strategies.get(type).getAnimal()</code>. Новая стратегия — новый класс, а не новая ветка switch.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<div class="strategy-switch" role="group" aria-label="Тип животного">' +
                '<button type="button" data-animal="CAT" aria-pressed="true">🐱 CAT</button>' +
                '<button type="button" data-animal="DOG" aria-pressed="false">🐶 DOG</button>' +
                '<button type="button" data-animal="BIRD" aria-pressed="false">🐦 BIRD</button>' +
                '</div>' +
                '<button class="btn strategy-call" type="button" data-call>getAnimal(Animals.CAT)</button>' +
                '<button class="btn ok" type="button" data-add-bird>+ BirdStrategy</button>' +
                '<button class="btn ghost" type="button" data-clear>очистить</button>' +
                '</div>' +
                '<div class="strategy-compare">' +
                '<section class="strategy-card bad">' +
                '<div class="sc-head"><span class="sc-tag">без паттерна</span><h3>switch внутри AnimalContext</h3></div>' +
                '<div class="switch-code" aria-label="Пример switch внутри контекста">' +
                '<div class="switch-line" data-case="CAT"><span class="kw">case</span> CAT: <span class="ret">return new Cat();</span></div>' +
                '<div class="switch-line" data-case="DOG"><span class="kw">case</span> DOG: <span class="ret">return new Dog();</span></div>' +
                '<div class="switch-line missing" data-case="BIRD"><span class="kw">case</span> BIRD: <span class="miss">← ветки нет</span></div>' +
                '<div class="switch-line" data-case="DEFAULT"><span class="kw">default</span>: <span class="ret">throw new IllegalArgumentException(...)</span></div>' +
                '</div>' +
                '<div class="sc-foot" id="stBefore">Каждый новый тип — правка этого метода.</div>' +
                '</section>' +
                '<section class="strategy-card good">' +
                '<div class="sc-head"><span class="sc-tag">со Strategy</span><h3>Map&lt;Animals, AnimalStrategy&gt;</h3></div>' +
                '<div class="slot-map strategy-slots" id="stSlots">' +
                '<div class="slot" data-slot="CAT"><div class="k">CAT →</div><div class="v">CatStrategy</div><div class="impl">getAnimal() → new Cat()</div></div>' +
                '<div class="slot" data-slot="DOG"><div class="k">DOG →</div><div class="v">DogStrategy</div><div class="impl">getAnimal() → new Dog()</div></div>' +
                '</div>' +
                '<div class="sc-foot" id="stAfter">getAnimal(type) = strategies.get(type).getAnimal()</div>' +
                '</section>' +
                '</div>' +
                '<p class="hint strategy-demo-note">BIRD — демонстрационное расширение: в репозитории сейчас CAT и DOG. Новая стратегия — это класс <code>BirdStrategy</code> и регистрация в map.</p>' +
                '<div class="two-col strategy-output">' +
                '<div class="panel"><h4>Результат getAnimal()</h4><div id="stResult" role="status" aria-live="polite"><p class="hint">Выберите тип и нажмите getAnimal(type).</p></div></div>' +
                '<div id="stTerm"></div>' +
                '</div>';
            var term = ctx.terminal('baileyes.eyes.strategy · AnimalService');
            host.querySelector('#stTerm').appendChild(term.node);
            var result = host.querySelector('#stResult');
            var slots = host.querySelector('#stSlots');
            var before = host.querySelector('#stBefore');
            var after = host.querySelector('#stAfter');
            var addBtn = host.querySelector('[data-add-bird]');
            var callBtn = host.querySelector('[data-call]');
            var clearBtn = host.querySelector('[data-clear]');
            var typeButtons = Array.prototype.slice.call(host.querySelectorAll('[data-animal]'));
            var selected = 'CAT', birdAdded = false;
            var DATA = {
                CAT: { strategy: 'CatStrategy', entity: 'Cat', emoji: '🐱' },
                DOG: { strategy: 'DogStrategy', entity: 'Dog', emoji: '🐶' },
                BIRD: { strategy: 'BirdStrategy', entity: 'Bird', emoji: '🐦' }
            };
            function setFoot(el, text, cls) {
                el.textContent = text;
                el.className = 'sc-foot' + (cls ? ' ' + cls : '');
            }
            function paint() {
                callBtn.textContent = 'getAnimal(Animals.' + selected + ')';
                typeButtons.forEach(function (b) {
                    b.setAttribute('aria-pressed', String(b.getAttribute('data-animal') === selected));
                });
                Array.prototype.forEach.call(host.querySelectorAll('.switch-line'), function (line) {
                    line.classList.toggle('active', line.getAttribute('data-case') === selected);
                });
                Array.prototype.forEach.call(host.querySelectorAll('.slot'), function (s) {
                    var on = s.getAttribute('data-slot') === selected;
                    s.classList.toggle('active', on);
                    if (on) { s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); }
                });
                if (selected === 'BIRD' && !birdAdded) {
                    setFoot(before, 'case BIRD отсутствует — без Strategy пришлось бы менять этот switch.', 'err');
                    setFoot(after, 'ключа BIRD в map нет — getAnimal() бросит IllegalArgumentException.', 'err');
                    return;
                }
                if (selected === 'BIRD' && birdAdded) {
                    setFoot(before, 'case BIRD всё ещё отсутствует: без Strategy контекст пришлось бы менять.', 'err');
                    setFoot(after, 'BirdStrategy зарегистрирована; getAnimal() не менялся.', 'ok');
                    return;
                }
                setFoot(before, 'Ветка найдена, но каждая новая ветка живёт здесь.', 'warn');
                setFoot(after, 'Lookup по map — без ветвления; getAnimal() не меняется.', 'ok');
            }
            function call() {
                var type = selected, d = DATA[type];
                term.info('getAnimalByType(Animals.' + type + ')', 'AnimalService');
                term.info('getAnimal(Animals.' + type + ')', 'AnimalContext');
                if (type === 'BIRD' && !birdAdded) {
                    term.error('IllegalArgumentException: Unknown animal type: BIRD', 'AnimalContext');
                    result.innerHTML = '<div class="result-card error"><div class="emoji">⛔</div><div class="meta">' +
                        '<span class="err-title">java.lang.IllegalArgumentException</span>' +
                        '<span>Unknown animal type: BIRD</span>' +
                        '<span>В map нет ключа BIRD — добавьте стратегию или верните <a href="#/exception-handler">HTTP 400</a>.</span></div></div>';
                    paint();
                    return;
                }
                term.debug('strategies.get(Animals.' + type + ') → ' + d.strategy, 'AnimalContext');
                term.info(d.strategy + '.getAnimal() → new ' + d.entity + '()', d.strategy);
                term.ok('result: ' + d.entity + ' (Object)', 'AnimalService');
                result.innerHTML = '<div class="result-card"><div class="emoji">' + d.emoji + '</div><div class="meta">' +
                    '<b>' + ctx.esc(d.entity) + '</b>' +
                    '<span>' + ctx.esc(d.strategy) + '.getAnimal() → new ' + ctx.esc(d.entity) + '()</span>' +
                    '<span>AnimalContext.getAnimal(Animals.' + ctx.esc(type) + ') → Object (' + ctx.esc(d.entity) + ')</span></div></div>';
                paint();
            }
            function addBird() {
                if (birdAdded) return;
                birdAdded = true;
                var slot = document.createElement('div');
                slot.className = 'slot new';
                slot.setAttribute('data-slot', 'BIRD');
                slot.innerHTML = '<span class="new-mark">new</span><div class="k">BIRD →</div><div class="v">BirdStrategy</div><div class="impl">getAnimal() → new Bird()</div>';
                slots.appendChild(slot);
                addBtn.disabled = true;
                addBtn.textContent = 'BirdStrategy добавлена';
                term.info('new BirdStrategy()', 'Spring');
                term.debug('strategies.put(Animals.BIRD, birdStrategy)', 'AnimalContext');
                term.ok('BirdStrategy зарегистрирована; getAnimal() не изменён', 'AnimalContext');
                selected = 'BIRD';
                result.innerHTML = '<p class="hint">Новая стратегия подключена. Нажмите getAnimal(Animals.BIRD).</p>';
                paint();
            }
            function reset() {
                selected = 'CAT';
                birdAdded = false;
                Array.prototype.forEach.call(slots.querySelectorAll('[data-slot="BIRD"]'), function (n) { n.parentNode.removeChild(n); });
                addBtn.disabled = false;
                addBtn.textContent = '+ BirdStrategy';
                result.innerHTML = '<p class="hint">Выберите тип и нажмите getAnimal(type).</p>';
                paint();
            }
            typeButtons.forEach(function (b) {
                b.addEventListener('click', function () {
                    selected = b.getAttribute('data-animal');
                    result.innerHTML = '<p class="hint">Нажмите getAnimal(Animals.' + selected + '), чтобы выполнить lookup.</p>';
                    paint();
                });
            });
            callBtn.addEventListener('click', call);
            addBtn.addEventListener('click', addBird);
            clearBtn.addEventListener('click', function () { reset(); term.clear(); });
            paint();
            term.info('AnimalContext initialized: strategies={CAT, DOG}', 'AnimalContext');
        },
        code: [
            { file: 'AnimalStrategy.java', pkg: 'baileyes.eyes.strategy.service', src:
                    `package baileyes.eyes.strategy.service;

public interface AnimalStrategy {

    Object getAnimal();
}` },
            { file: 'AnimalContext.java', pkg: 'baileyes.eyes.strategy.service.strategy', src:
                    `package baileyes.eyes.strategy.service.strategy;

import baileyes.eyes.strategy.enam.Animals;
import baileyes.eyes.strategy.service.AnimalStrategy;
import baileyes.eyes.strategy.service.strategy.subjects.CatStrategy;
import baileyes.eyes.strategy.service.strategy.subjects.DogStrategy;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AnimalContext {

    private static final String ERROR = "Unknown animal type: ";

    private final Map<Animals, AnimalStrategy> strategies = new HashMap<>();

    private final CatStrategy catStrategy;
    private final DogStrategy dogStrategy;

    @PostConstruct
    public void init() {
        strategies.put(Animals.CAT, catStrategy);
        strategies.put(Animals.DOG, dogStrategy);
    }

    public Object getAnimal(Animals animalType) {
        AnimalStrategy strategy = strategies.get(animalType);

        if (strategy != null) {
            return strategy.getAnimal();
        }

        throw new IllegalArgumentException(ERROR + animalType);
    }
}` },
            { file: 'CatStrategy.java', pkg: 'baileyes.eyes.strategy.service.strategy.subjects', src:
                    `package baileyes.eyes.strategy.service.strategy.subjects;

import baileyes.eyes.strategy.entity.Cat;
import baileyes.eyes.strategy.service.AnimalStrategy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CatStrategy implements AnimalStrategy {

    @Override
    public Cat getAnimal() {
        return new Cat();
    }
}` },
            { file: 'DogStrategy.java', pkg: 'baileyes.eyes.strategy.service.strategy.subjects', src:
                    `package baileyes.eyes.strategy.service.strategy.subjects;

import baileyes.eyes.strategy.entity.Dog;
import baileyes.eyes.strategy.service.AnimalStrategy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DogStrategy implements AnimalStrategy {

    @Override
    public Dog getAnimal() {
        return new Dog();
    }
}` },
            { file: 'AnimalService.java', pkg: 'baileyes.eyes.strategy.service.impl', src:
                    `package baileyes.eyes.strategy.service.impl;

import baileyes.eyes.strategy.enam.Animals;
import baileyes.eyes.strategy.service.strategy.AnimalContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AnimalService {

    private final AnimalContext context;

    public Object getAnimalByType(Animals animalType) {
        return context.getAnimal(animalType);
    }
}` },
            { file: 'Cat.java', pkg: 'baileyes.eyes.strategy.entity', src:
                    `package baileyes.eyes.strategy.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Cat {

    @Id
    private UUID id;
    private String name;
    private int age;
}` },
            { file: 'Dog.java', pkg: 'baileyes.eyes.strategy.entity', src:
                    `package baileyes.eyes.strategy.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Dog {

    @Id
    private UUID id;
    private String name;
    private int age;
}` },
            { file: 'Animals.java', pkg: 'baileyes.eyes.strategy.enam', src:
                    `package baileyes.eyes.strategy.enam;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum Animals {

    CAT("кот"),
    DOG("собака");

    private final String description;
}` }
        ]
    });

    /* ===== 2. STATE ===== */
    var STATE_NODES = [
        { id: 'UNDER_REVIEW',          x: 20,  y: 150, w: 200, h: 58, label: 'UNDER_REVIEW' },
        { id: 'AWAITING_CONFIRMATION', x: 265, y: 30,  w: 230, h: 58, label: 'AWAITING_CONFIRMATION' },
        { id: 'REVISION_REQUIRED',     x: 20,  y: 270, w: 230, h: 58, label: 'REVISION_REQUIRED' },
        { id: 'CONFIRMED',             x: 540, y: 150, w: 200, h: 58, label: 'CONFIRMED' },
        { id: 'REJECTED',              x: 540, y: 270, w: 200, h: 58, label: 'REJECTED' }
    ];
    var TRANSITIONS = {
        UNDER_REVIEW: {
            review:              { to: 'UNDER_REVIEW',          msg: 'Документ уже на рассмотрении.', deny: true },
            sendForConfirmation: { to: 'AWAITING_CONFIRMATION', msg: 'Документ отправлен на подтверждение.' },
            requestChanges:      { to: 'REVISION_REQUIRED',     msg: 'Документ отправлен на доработку.' },
            resubmit:            { to: 'UNDER_REVIEW',          msg: 'Документ уже на рассмотрении.', deny: true },
            confirm:             { to: 'UNDER_REVIEW',          msg: 'Сначала отправьте документ на подтверждение.', deny: true },
            reject:              { to: 'REJECTED',              msg: 'Документ отклонен.' }
        },
        AWAITING_CONFIRMATION: {
            review:              { to: 'UNDER_REVIEW',          msg: 'Документ возвращен на рассмотрение.' },
            sendForConfirmation: { to: 'AWAITING_CONFIRMATION', msg: 'Документ уже ждёт подтверждения.', deny: true },
            requestChanges:      { to: 'REVISION_REQUIRED',     msg: 'Документ отправлен на доработку.' },
            resubmit:            { to: 'AWAITING_CONFIRMATION', msg: 'Документ уже ждёт подтверждения.', deny: true },
            confirm:             { to: 'CONFIRMED',             msg: 'Документ подтвержден.' },
            reject:              { to: 'REJECTED',              msg: 'Документ отклонен.' }
        },
        REVISION_REQUIRED: {
            review:              { to: 'REVISION_REQUIRED',     msg: 'Документ на доработке; используйте resubmit().', deny: true },
            sendForConfirmation: { to: 'REVISION_REQUIRED',     msg: 'Сначала доработайте документ и отправьте его заново.', deny: true },
            requestChanges:      { to: 'REVISION_REQUIRED',     msg: 'Документ уже на доработке.', deny: true },
            resubmit:            { to: 'UNDER_REVIEW',          msg: 'Документ отправлен на повторное рассмотрение.' },
            confirm:             { to: 'REVISION_REQUIRED',     msg: 'Документ на доработке нельзя подтвердить.', deny: true },
            reject:              { to: 'REJECTED',              msg: 'Документ отклонен.' }
        },
        CONFIRMED: {
            review:              { to: 'CONFIRMED', msg: 'Документ уже подтвержден, изменение состояния невозможно.', deny: true },
            sendForConfirmation: { to: 'CONFIRMED', msg: 'Документ уже подтвержден.', deny: true },
            requestChanges:      { to: 'CONFIRMED', msg: 'Документ уже подтвержден, вернуть на доработку невозможно.', deny: true },
            resubmit:            { to: 'CONFIRMED', msg: 'Документ уже подтвержден.', deny: true },
            confirm:             { to: 'CONFIRMED', msg: 'Документ уже подтвержден, повторное подтверждение невозможно.', deny: true },
            reject:              { to: 'CONFIRMED', msg: 'Документ уже подтвержден, отклонение невозможно.', deny: true }
        },
        REJECTED: {
            review:              { to: 'REJECTED', msg: 'Документ отклонен, повторное рассмотрение невозможно.', deny: true },
            sendForConfirmation: { to: 'REJECTED', msg: 'Документ отклонен.', deny: true },
            requestChanges:      { to: 'REJECTED', msg: 'Документ отклонен, вернуть на доработку невозможно.', deny: true },
            resubmit:            { to: 'REJECTED', msg: 'Документ отклонен, повторная отправка невозможна.', deny: true },
            confirm:             { to: 'REJECTED', msg: 'Документ отклонен, его нельзя подтвердить.', deny: true },
            reject:              { to: 'REJECTED', msg: 'Документ уже отклонен.', deny: true }
        }
    };

    App.registerPattern('state', {
        title: 'State', subtitle: 'Пять состояний документа: состояние меняется внутри объекта, а не выбирается снаружи', category: 'behavioral',
        javaClasses: ['DocumentState', 'Document', 'DocumentService'],
        essence: '<p>Паттерн <strong>State</strong>: каждая константа enum <code>DocumentState</code> сама переопределяет ' +
            'переходы и возвращает следующее состояние. <code>Document</code> лишь делегирует вызов: ' +
            '<code>state = state.sendForConfirmation(this)</code>.</p>' +
            '<p><strong>Чем отличается от Strategy:</strong> стратегию выбирают снаружи и обычно не меняют, а состояние — часть ' +
            'объекта. После вызова <code>Document.state</code> заменяется, поэтому следующий вызов обрабатывает уже новое состояние. ' +
            'В жизненном цикле три нетерминальных состояния: <code>UNDER_REVIEW</code>, <code>AWAITING_CONFIRMATION</code> и ' +
            '<code>REVISION_REQUIRED</code>.</p>',
        diagram: function (host) {
            var u = new Uml(800, 210);
            u.box(20, 30, 230, 'Document', '@Component', ['- DocumentState state = UNDER_REVIEW', '+ review() : void', '+ sendForConfirmation() : void', '+ requestChanges() : void', '+ resubmit() : void', '+ confirm() : void', '+ reject() : void'], 'spring');
            u.box(330, 20, 250, 'DocumentState', '«enum» · abstract', ['UNDER_REVIEW', 'AWAITING_CONFIRMATION', 'REVISION_REQUIRED', 'CONFIRMED', 'REJECTED', '+ review / sendForConfirmation', '+ requestChanges / resubmit', '+ confirm / reject'], 'abs');
            u.box(640, 40, 145, 'DocumentService', '@Service', ['+ processDocument()'], 'spring');
            u.arrow(250, 92, 330, 92, 'assoc', 'state');
            u.arrow(640, 80, 580, 80, 'dep', 'вызывает');
            put(host, u, 'Enum с abstract-методами компилируется в набор анонимных подклассов. После вызова <code>Document.state</code> заменяется — следующий вызов идёт уже в новое состояние.');
        },
        demo: function (host, ctx) {
            var W = 760, H = 360;
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn" type="button" data-scenario>▶ Сценарий DocumentService</button>' +
                '<button class="btn ghost" type="button" data-reset>сброс</button>' +
                '<button class="btn ghost" type="button" data-clear>очистить лог</button>' +
                '</div>' +
                '<div class="state-hero" id="stHero">' +
                '<div class="state-hero-main">' +
                '<span class="state-kicker">Document.state</span>' +
                '<strong class="state-name" id="stName">UNDER_REVIEW</strong>' +
                '<p class="state-desc" id="stDesc">Документ поступил на рассмотрение: можно подтвердить или отклонить.</p>' +
                '<code class="state-call" id="stCall">Document.state = UNDER_REVIEW</code>' +
                '</div>' +
                '<div class="state-actions" id="stActions" role="group" aria-label="Действия из текущего состояния"></div>' +
                '</div>' +
                '<div class="state-stage">' +
                '<div class="panel state-graph-panel"><h3 class="panel-title">Граф состояний</h3><div class="state-wrap"><svg class="state-svg" id="stGraph" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Граф состояний документа"></svg></div><p class="hint state-graph-note" id="stGraphNote">Подсвечены переходы, доступные из текущего состояния.</p></div>' +
                '<div class="panel"><h3 class="panel-title">История состояний</h3><div class="state-history" id="stHistory"></div></div>' +
                '</div>' +
                '<div class="state-term" id="stTerm"></div>';
            var term = ctx.terminal('baileyes.eyes.state · DocumentService');
            host.querySelector('#stTerm').appendChild(term.node);
            var svg = host.querySelector('#stGraph');
            var hero = host.querySelector('#stHero');
            var heroName = host.querySelector('#stName');
            var heroDesc = host.querySelector('#stDesc');
            var heroCall = host.querySelector('#stCall');
            var actionsHost = host.querySelector('#stActions');
            var graphNote = host.querySelector('#stGraphNote');
            var historyHost = host.querySelector('#stHistory');
            var scenarioBtn = host.querySelector('[data-scenario]');
            var state = 'UNDER_REVIEW', busy = false, scenarioRunning = false, epoch = 0, history = [];
            var STATE_META = {
                UNDER_REVIEW: { desc: 'Документ на рассмотрении: отправьте его на подтверждение, верните на доработку или отклоните.', color: 'var(--accent)', soft: 'var(--accent-soft)' },
                AWAITING_CONFIRMATION: { desc: 'Документ ждёт подтверждения: можно подтвердить, вернуть на доработку, отклонить или вернуть на рассмотрение.', color: 'var(--violet)', soft: 'var(--violet-soft)' },
                REVISION_REQUIRED: { desc: 'Документ на доработке: отправьте его на повторное рассмотрение или отклоните.', color: 'var(--warn)', soft: 'var(--warn-soft)' },
                CONFIRMED: { desc: 'Терминальное состояние: документ подтверждён и больше не меняется.', color: 'var(--ok)', soft: 'var(--ok-soft)' },
                REJECTED: { desc: 'Терминальное состояние: документ отклонён; начните демо заново.', color: 'var(--err)', soft: 'var(--err-soft)' }
            };
            var ACTION_META = {
                review: { label: 'review()', color: 'var(--accent)' },
                sendForConfirmation: { label: 'sendForConfirmation()', color: 'var(--violet)' },
                requestChanges: { label: 'requestChanges()', color: 'var(--warn)' },
                resubmit: { label: 'resubmit()', color: 'var(--teal)' },
                confirm: { label: 'confirm()', color: 'var(--ok)' },
                reject: { label: 'reject()', color: 'var(--err)' }
            };
            function node(id) { for (var i = 0; i < STATE_NODES.length; i++) if (STATE_NODES[i].id === id) return STATE_NODES[i]; }
            function border(a, b) {
                var dx = b.cx - a.cx, dy = b.cy - a.cy;
                if (!dx && !dy) return { x: a.cx, y: a.cy };
                var sx = (a.w / 2) / Math.abs(dx || 1e-6), sy = (a.h / 2) / Math.abs(dy || 1e-6);
                var s = Math.min(sx, sy);
                return { x: a.cx + dx * s, y: a.cy + dy * s };
            }
            function drawGraph() {
                var s = '';
                STATE_NODES.forEach(function (n) { n.cx = n.x + n.w / 2; n.cy = n.y + n.h / 2; });
                var drawn = {};
                Object.keys(TRANSITIONS).forEach(function (from) {
                    Object.keys(TRANSITIONS[from]).forEach(function (act) {
                        var t = TRANSITIONS[from][act], key = from + '>' + t.to;
                        if (t.deny) return;
                        if (drawn[key]) return; drawn[key] = 1;
                        var a = node(from), b = node(t.to);
                        if (from === t.to) {
                            var selfActs = Object.keys(TRANSITIONS[from]).filter(function (k) { return TRANSITIONS[from][k].to === from; });
                            s += '<path class="st-edge" data-e="' + from + '|' + act + '" d="M' + (a.x + 26) + ',' + a.y + ' c -18,-40 ' + (a.w - 34) + ',-40 ' + (a.w - 52) + ',0" />';
                            s += '<text class="st-elbl" data-l="' + from + '|' + act + '" x="' + a.cx + '" y="' + (a.y - 7) + '">' + selfActs.join('/') + '()</text>';
                        } else {
                            var p1 = border(a, b), p2 = border(b, a);
                            var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                            var dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
                            var bend = 26, cx = mx - dy / len * bend, cy = my + dx / len * bend;
                            s += '<path class="st-edge" data-e="' + from + '|' + act + '" d="M' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1) + ' Q' + cx.toFixed(1) + ',' + cy.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1) + '" />';
                            var lx = (p1.x + 2 * cx + p2.x) / 4, ly = ((p1.y + 2 * cy + p2.y) / 4) - 4;
                            if (from === 'AWAITING_CONFIRMATION' && t.to === 'REVISION_REQUIRED') lx += 36;
                            s += '<text class="st-elbl" data-l="' + from + '|' + act + '" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '">' + act + '()</text>';
                        }
                    });
                });
                STATE_NODES.forEach(function (n) {
                    s += '<g class="st-node" data-n="' + n.id + '"><rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="9"/>' +
                        '<text x="' + n.cx + '" y="' + (n.cy + 4) + '">' + esc(n.label) + '</text></g>';
                });
                svg.innerHTML = s;
                paint();
            }
            function renderHistory() {
                if (!history.length) { historyHost.innerHTML = '<p class="hint">Пока действий не было.</p>'; return; }
                historyHost.innerHTML = history.map(function (e, i) {
                    return '<div class="state-event ' + (e.kind || 'move') + '">' +
                        '<span class="se-num">' + String(i + 1).padStart(2, '0') + '</span>' +
                        '<div class="se-body"><div class="se-top"><b>' + esc(e.act) + '</b><span class="se-flow">' + esc(e.from) + ' → ' + esc(e.to) + '</span></div>' +
                        '<div class="se-note">' + esc(e.msg) + '</div></div></div>';
                }).join('');
                historyHost.scrollTop = historyHost.scrollHeight;
            }
            function addEvent(act, from, to, deny, msg) {
                history.push({ act: act, from: from, to: to, deny: deny, kind: deny ? 'deny' : 'move', msg: msg });
                renderHistory();
            }
            function paint() {
                var meta = STATE_META[state] || STATE_META.UNDER_REVIEW;
                hero.style.setProperty('--state-color', meta.color);
                hero.style.setProperty('--state-soft', meta.soft);
                svg.style.setProperty('--state-color', meta.color);
                svg.style.setProperty('--state-soft', meta.soft);
                heroName.textContent = state;
                heroDesc.textContent = meta.desc;
                heroCall.textContent = 'Document.state = ' + state;
                Array.prototype.forEach.call(svg.querySelectorAll('.st-node'), function (g) { g.classList.toggle('current', g.getAttribute('data-n') === state); });
                Array.prototype.forEach.call(svg.querySelectorAll('.st-edge'), function (e) {
                    e.classList.toggle('out', e.getAttribute('data-e').split('|')[0] === state);
                });
                Array.prototype.forEach.call(svg.querySelectorAll('.st-elbl'), function (l) {
                    l.classList.toggle('out', l.getAttribute('data-l').split('|')[0] === state);
                });
                var available = Object.keys(TRANSITIONS[state]).filter(function (act) { return !TRANSITIONS[state][act].deny; });
                graphNote.textContent = available.length ? 'Подсвечены переходы, доступные из текущего состояния.' : 'Терминальное состояние: доступных переходов нет.';
                if (!available.length) {
                    actionsHost.innerHTML = '<p class="state-terminal">Терминальное состояние. Нажмите «сброс», чтобы начать заново.</p>';
                } else {
                    actionsHost.innerHTML = available.map(function (act) {
                        var t = TRANSITIONS[state][act], m = ACTION_META[act] || { label: act + '()', color: 'var(--accent)' };
                        return '<button class="state-act" type="button" data-act="' + act + '" style="--act-color:' + m.color + '">' +
                            '<span>' + m.label + '</span><span class="sa-to">→ ' + t.to + '</span></button>';
                    }).join('');
                    if (busy || scenarioRunning) Array.prototype.forEach.call(actionsHost.querySelectorAll('.state-act'), function (btn) { btn.disabled = true; });
                }
            }
            function setBusy(b) {
                busy = b;
                Array.prototype.forEach.call(host.querySelectorAll('.state-act'), function (btn) { btn.disabled = b; });
            }
            function flashEdge(from, act, on) {
                var e = svg.querySelector('[data-e="' + from + '|' + act + '"]');
                var l = svg.querySelector('[data-l="' + from + '|' + act + '"]');
                if (e) e.classList.toggle('hot', on); if (l) l.classList.toggle('hot', on);
            }
            function travel(from, act, done) {
                var path = svg.querySelector('[data-e="' + from + '|' + act + '"]');
                if (!path) { done(); return; }
                var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('r', '5.5'); dot.setAttribute('class', 'st-dot');
                svg.appendChild(dot);
                var len = path.getTotalLength(), t0 = performance.now(), dur = 700, raf;
                function step(now) {
                    var k = Math.min(1, (now - t0) / dur);
                    var pt = path.getPointAtLength(len * (0.1 + 0.9 * k));
                    dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
                    if (k < 1) raf = App.frame(step); else { dot.remove(); done(); }
                }
                raf = App.frame(step);
                ctx.onLeave(function () { cancelAnimationFrame(raf); if (dot.parentNode) dot.remove(); });
            }
            function apply(act, cb) {
                if (busy) return;
                var e = epoch, from = state, t = TRANSITIONS[from][act];
                setBusy(true);
                term.info('document.' + act + '()  →  state.' + act + '(document)', 'Document');
                if (t.deny) {
                    var n = svg.querySelector('[data-n="' + from + '"]');
                    if (n) { n.classList.remove('deny'); void n.offsetWidth; n.classList.add('deny'); }
                    hero.classList.remove('deny'); void hero.offsetWidth; hero.classList.add('deny');
                    heroCall.textContent = 'state = state.' + act + '(this) → без изменений';
                    term.warn(t.msg + '  (состояние не меняется: ' + from + ')', 'DocumentState.' + from);
                    addEvent(act + '()', from, from, true, t.msg);
                    ctx.later(600, function () {
                        if (e !== epoch) return;
                        if (n) n.classList.remove('deny');
                        hero.classList.remove('deny');
                        setBusy(false);
                        if (cb) cb();
                    });
                    return;
                }
                flashEdge(from, act, true);
                travel(from, act, function () {
                    if (e !== epoch) return;
                    term.info(t.msg, 'DocumentState.' + from);
                    term.debug('state: ' + from + ' → ' + t.to, 'Document');
                    state = t.to;
                    addEvent(act + '()', from, t.to, false, t.msg);
                    paint();
                    heroCall.textContent = 'state = state.' + act + '(this) → ' + t.to;
                    hero.classList.remove('changed'); void hero.offsetWidth; hero.classList.add('changed');
                    setBusy(false);
                    if (cb) cb();
                    ctx.later(360, function () {
                        if (e !== epoch) return;
                        flashEdge(from, act, false);
                        hero.classList.remove('changed');
                    });
                });
            }
            function scenario() {
                if (busy || scenarioRunning) return;
                reset(true);
                scenarioRunning = true;
                scenarioBtn.disabled = true;
                var e = epoch;
                term.info('=== DocumentService.processDocument() ===', 'DocumentService');
                var steps = [
                    function (n) { apply('sendForConfirmation', n); },
                    function (n) { apply('requestChanges', n); },
                    function (n) { apply('resubmit', n); },
                    function (n) { apply('sendForConfirmation', n); },
                    function (n) { apply('confirm', n); },
                    function (n) { apply('reject', n); }
                ];
                (function next(i) {
                    if (e !== epoch) return;
                    if (i >= steps.length) {
                        term.ok('=== сценарий завершён, итог: ' + state + ' ===', 'DocumentService');
                        scenarioRunning = false;
                        scenarioBtn.disabled = false;
                        setBusy(false);
                        return;
                    }
                    steps[i](function () {
                        if (e !== epoch) return;
                        ctx.later(650, function () {
                            if (e !== epoch) return;
                            next(i + 1);
                        });
                    });
                })(0);
            }
            function reset(silent) {
                epoch++;
                state = 'UNDER_REVIEW';
                scenarioRunning = false;
                scenarioBtn.disabled = false;
                setBusy(false);
                history = [{ act: 'new Document()', from: '—', to: 'UNDER_REVIEW', deny: false, kind: 'init', msg: 'Document создан, state=UNDER_REVIEW.' }];
                renderHistory();
                Array.prototype.forEach.call(svg.querySelectorAll('.hot, .deny'), function (n) { n.classList.remove('hot', 'deny'); });
                Array.prototype.forEach.call(svg.querySelectorAll('.st-dot'), function (n) { n.parentNode.removeChild(n); });
                hero.classList.remove('changed', 'deny');
                paint();
                if (!silent) { term.clear(); term.info('Document создан, state=UNDER_REVIEW', 'Document'); }
            }
            actionsHost.addEventListener('click', function (e) {
                if (scenarioRunning) return;
                var b = e.target.closest ? e.target.closest('[data-act]') : null;
                if (b && actionsHost.contains(b)) apply(b.getAttribute('data-act'));
            });
            host.querySelector('[data-scenario]').addEventListener('click', scenario);
            host.querySelector('[data-reset]').addEventListener('click', function () { reset(false); });
            host.querySelector('[data-clear]').addEventListener('click', function () { term.clear(); });
            drawGraph();
            reset(false);
        },
        code: [
            { file: 'DocumentState.java', pkg: 'baileyes.eyes.state.state.enam', src:
                    `package baileyes.eyes.state.state.enam;

import baileyes.eyes.state.dto.Document;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public enum DocumentState {

    UNDER_REVIEW {
        @Override public DocumentState review(Document d)              { return message("Документ уже на рассмотрении.", this); }
        @Override public DocumentState sendForConfirmation(Document d) { return message("Документ отправлен на подтверждение.", AWAITING_CONFIRMATION); }
        @Override public DocumentState requestChanges(Document d)      { return message("Документ отправлен на доработку.", REVISION_REQUIRED); }
        @Override public DocumentState resubmit(Document d)            { return message("Документ уже на рассмотрении.", this); }
        @Override public DocumentState confirm(Document d)             { return message("Сначала отправьте документ на подтверждение.", this); }
        @Override public DocumentState reject(Document d)              { return message("Документ отклонен.", REJECTED); }
    },
    AWAITING_CONFIRMATION {
        @Override public DocumentState review(Document d)              { return message("Документ возвращен на рассмотрение.", UNDER_REVIEW); }
        @Override public DocumentState sendForConfirmation(Document d) { return message("Документ уже ждёт подтверждения.", this); }
        @Override public DocumentState requestChanges(Document d)      { return message("Документ отправлен на доработку.", REVISION_REQUIRED); }
        @Override public DocumentState resubmit(Document d)            { return message("Документ уже ждёт подтверждения.", this); }
        @Override public DocumentState confirm(Document d)             { return message("Документ подтвержден.", CONFIRMED); }
        @Override public DocumentState reject(Document d)              { return message("Документ отклонен.", REJECTED); }
    },
    REVISION_REQUIRED {
        @Override public DocumentState review(Document d)              { return message("Документ на доработке; используйте resubmit().", this); }
        @Override public DocumentState sendForConfirmation(Document d) { return message("Сначала доработайте документ и отправьте его заново.", this); }
        @Override public DocumentState requestChanges(Document d)      { return message("Документ уже на доработке.", this); }
        @Override public DocumentState resubmit(Document d)            { return message("Документ отправлен на повторное рассмотрение.", UNDER_REVIEW); }
        @Override public DocumentState confirm(Document d)             { return message("Документ на доработке нельзя подтвердить.", this); }
        @Override public DocumentState reject(Document d)              { return message("Документ отклонен.", REJECTED); }
    },
    CONFIRMED {
        @Override public DocumentState review(Document d)              { return message("Документ уже подтвержден, изменение состояния невозможно.", this); }
        @Override public DocumentState sendForConfirmation(Document d) { return message("Документ уже подтвержден.", this); }
        @Override public DocumentState requestChanges(Document d)      { return message("Документ уже подтвержден, вернуть на доработку невозможно.", this); }
        @Override public DocumentState resubmit(Document d)            { return message("Документ уже подтвержден.", this); }
        @Override public DocumentState confirm(Document d)             { return message("Документ уже подтвержден, повторное подтверждение невозможно.", this); }
        @Override public DocumentState reject(Document d)              { return message("Документ уже подтвержден, отклонение невозможно.", this); }
    },
    REJECTED {
        @Override public DocumentState review(Document d)              { return message("Документ отклонен, повторное рассмотрение невозможно.", this); }
        @Override public DocumentState sendForConfirmation(Document d) { return message("Документ отклонен.", this); }
        @Override public DocumentState requestChanges(Document d)      { return message("Документ отклонен, вернуть на доработку невозможно.", this); }
        @Override public DocumentState resubmit(Document d)            { return message("Документ отклонен, повторная отправка невозможна.", this); }
        @Override public DocumentState confirm(Document d)             { return message("Документ отклонен, его нельзя подтвердить.", this); }
        @Override public DocumentState reject(Document d)              { return message("Документ уже отклонен.", this); }
    };

    private static DocumentState message(String message, DocumentState state) {
        log.info(message);
        return state;
    }

    public abstract DocumentState review(Document document);
    public abstract DocumentState sendForConfirmation(Document document);
    public abstract DocumentState requestChanges(Document document);
    public abstract DocumentState resubmit(Document document);
    public abstract DocumentState confirm(Document document);
    public abstract DocumentState reject(Document document);
}` },
            { file: 'Document.java', pkg: 'baileyes.eyes.state.dto', src:
                    `package baileyes.eyes.state.dto;

import baileyes.eyes.state.state.enam.DocumentState;
import lombok.Getter;
import lombok.Setter;
import org.springframework.stereotype.Component;

@Setter
@Getter
@Component
public class Document {

    private DocumentState state;

    public Document() {
        this.state = DocumentState.UNDER_REVIEW;
    }

    public void review()              { state = state.review(this); }
    public void sendForConfirmation() { state = state.sendForConfirmation(this); }
    public void requestChanges()      { state = state.requestChanges(this); }
    public void resubmit()            { state = state.resubmit(this); }
    public void confirm()             { state = state.confirm(this); }
    public void reject()              { state = state.reject(this); }
}` },
            { file: 'DocumentService.java', pkg: 'baileyes.eyes.state.state', src:
                    `package baileyes.eyes.state.state;

import baileyes.eyes.state.dto.Document;
import baileyes.eyes.state.state.enam.DocumentState;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentService {

    private final Document document;

    public void processDocument() {
        log.info("Запускаем обработку документа...");
        log.info("Документ до обработки: {}", document.getState());

        document.sendForConfirmation();
        log.info("После sendForConfirmation: {}", document.getState());

        document.requestChanges();
        log.info("После requestChanges: {}", document.getState());

        document.resubmit();
        log.info("После resubmit: {}", document.getState());

        document.sendForConfirmation();
        log.info("После повторного sendForConfirmation: {}", document.getState());

        document.confirm();
        log.info("После confirm: {}", document.getState());

        log.info("Пробуем reject в терминальном состоянии...");
        document.reject();
        log.info("После reject: {}", document.getState());
    }

    public void changeDocumentState(DocumentState newState) {
        document.setState(newState);
    }
}` }
        ]
    });

    /* ===== 3. CHAINS ===== */
    App.registerPattern('chains', {
        title: 'Chains (Chain of Responsibility)', subtitle: 'ProcessDataDto меняется на каждом звене; @ConditionalOnProperty выбирает состав цепочки', category: 'behavioral',
        javaClasses: ['ChainPart', 'ChainManager', 'VariantChainPart', 'VariantChainManager', 'AddressData', 'ProcessDataDto', 'NormalizeCityPart', 'StreetPart', 'ZipPart', 'AuditPart', 'GeoPart', 'PhonePart', 'DeliveryPart', 'SignaturePart'],
        essence: '<p><strong>Chain of Responsibility:</strong> <code>ChainManager</code> инжектит <code>List&lt;ChainPart&gt;</code>, ' +
            'Spring сортирует звенья по <code>@Order</code>, а менеджер передаёт DTO дальше: ' +
            '<code>process = chainPart.process(process)</code>. Каждое звено возвращает новый <code>ProcessDataDto</code>, ' +
            'поэтому в демо видно, как объект меняется на каждом этапе.</p>' +
            '<p><strong>Strategy внутри Chain:</strong> второй фрейм показывает <code>VariantChainManager</code> с ' +
            '<code>List&lt;VariantChainPart&gt;</code>. Состав списка выбирает <code>@ConditionalOnProperty(name = "chain.mode")</code>: ' +
            '<code>address</code> → звенья <code>1,3,5,7</code> (нормализация адреса), <code>delivery</code> → <code>2,4,6,8</code> ' +
            '(обогащение доставки). Менеджер и интерфейс не меняются — меняется стратегия сборки цепочки.</p>',
        diagram: function (host) {
            var u = new Uml(880, 500);
            u.box(20, 30, 240, 'ChainManager', '@Service', ['- List<ChainPart> chain', '+ addSomething(UUID, AddressData)', '+ run() : ProcessDataDto'], 'spring');
            u.box(330, 30, 210, 'ChainPart', '«interface»', ['+ process(ProcessDataDto<?>)'], 'iface');
            u.box(620, 30, 200, 'ProcessDataDto<T>', '@Builder', ['UUID id', 'T data'], 'entity');
            u.box(300, 160, 150, 'FirstChainPart', '@Order(1)', ['city → trim + capitalize'], 'spring');
            u.box(470, 160, 150, 'SecondChainPart', '@Order(2)', ['zip → digits', 'formatted'], 'spring');
            u.box(20, 310, 250, 'VariantChainManager', '@Service', ['- List<VariantChainPart> chain', '+ process(dto) : ProcessDataDto'], 'spring');
            u.box(330, 310, 200, 'VariantChainPart', '«interface»', ['+ process(ProcessDataDto<?>)'], 'iface');
            u.box(590, 235, 145, 'mode = address', '@ConditionalOnProperty', ['1 city', '3 street', '5 zip', '7 audit'], 'spring');
            u.box(590, 365, 145, 'mode = delivery', '@ConditionalOnProperty', ['2 geo', '4 phone', '6 delivery', '8 signature'], 'spring');
            u.arrow(260, 70, 330, 56, 'agg', 'chain');
            u.arrow(375, 160, 420, 83, 'impl', '');
            u.arrow(545, 160, 480, 83, 'impl', '');
            u.arrow(540, 55, 620, 55, 'dep', 'создаёт');
            u.arrow(270, 345, 330, 336, 'agg', 'chain');
            u.arrow(530, 336, 590, 290, 'dep', 'address', -22, -2);
            u.arrow(530, 336, 590, 420, 'dep', 'delivery', -24, 8);
            put(host, u, 'Сверху — обычная цепочка: каждое звено возвращает новый DTO. Снизу — та же идея, но состав <code>List&lt;VariantChainPart&gt;</code> ' +
                'выбирает Spring по property. Это Strategy на уровне сборки цепочки: менеджер не знает, какой набор звеньев ему достался.');
        },
        demo: function (host, ctx) {
            var ARROW = '<div class="pipe-arrow"><svg width="42" height="16"><path d="M0,8 H34" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M32,3 L41,8 L32,13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></div>';
            var BASE_PARTS = [
                { order: 1, name: 'FirstChainPart', note: 'city → trim + capitalize', changes: ['city'],
                    apply: function (d) { d.city = titleCity(d.city); } },
                { order: 2, name: 'SecondChainPart', note: 'zip → только цифры, собирает formatted', changes: ['zip', 'formatted'],
                    apply: function (d) {
                        d.zip = String(d.zip == null ? '' : d.zip).replace(/\D/g, '');
                        d.street = String(d.street == null ? '' : d.street).trim();
                        d.formatted = [d.city, d.street, d.zip].filter(function (x) { return !!x; }).join(', ');
                    } }
            ];
            var VARIANTS = {
                address: {
                    parts: [
                        { order: 1, name: 'NormalizeCityPart', note: 'city → trim + capitalize', changes: ['city'],
                            apply: function (d) { d.city = titleCity(d.city) || 'Moscow'; } },
                        { order: 3, name: 'StreetPart', note: 'заполняет street, если пусто', changes: ['street'],
                            apply: function (d) { if (!d.street) d.street = 'ул. Тверская, 1'; } },
                        { order: 5, name: 'ZipPart', note: 'заполняет zip, если пусто', changes: ['zip'],
                            apply: function (d) { if (!d.zip) d.zip = '125009'; } },
                        { order: 7, name: 'AuditPart', note: 'добавляет audit=checked', changes: ['audit'],
                            apply: function (d) { d.audit = 'checked'; } }
                    ]
                },
                delivery: {
                    parts: [
                        { order: 2, name: 'GeoPart', note: 'добавляет geo=RU', changes: ['geo'],
                            apply: function (d) { d.geo = 'RU'; } },
                        { order: 4, name: 'PhonePart', note: 'добавляет телефон получателя', changes: ['phone'],
                            apply: function (d) { d.phone = '+7 495 000-00-00'; } },
                        { order: 6, name: 'DeliveryPart', note: 'добавляет способ доставки', changes: ['delivery'],
                            apply: function (d) { d.delivery = 'courier'; } },
                        { order: 8, name: 'SignaturePart', note: 'добавляет подпись', changes: ['signature'],
                            apply: function (d) { d.signature = 'verified'; } }
                    ]
                }
            };
            var BASE_ENTRY = { city: '  moscow ', street: ' Tverskaya 1 ', zip: '101 000' };
            var VARIANT_ENTRY = { city: 'moscow', street: '', zip: '' };

            host.innerHTML =
                '<section class="chains-frame">' +
                '<div class="chains-frame-head">' +
                '<div><span class="chains-kicker">Frame 1 · базовая цепочка</span><h3>ChainManager → List&lt;ChainPart&gt; (@Order)</h3></div>' +
                '<span class="chains-pill">каждое звено возвращает новый DTO</span>' +
                '</div>' +
                '<div class="demo-controls chains-controls">' +
                '<div class="field"><label for="chBaseData">entry data (JSON)</label><input id="chBaseData" type="text" spellcheck="false"></div>' +
                '<button class="btn primary" type="button" data-send-base>▶ Отправить по цепочке</button>' +
                '<button class="btn ghost sm" type="button" data-reset-base>сброс</button>' +
                '</div>' +
                '<div class="panel chains-pipe-panel">' +
                '<div class="pipe chain-pipe" id="chBasePipe">' +
                '<div class="capsule" id="chBaseCap">ProcessDataDto</div>' +
                '<div class="pipe-node" data-node="0"><div class="ord">entry</div><div class="nm">ChainManager</div><div class="st" data-st>idle</div></div>' + ARROW +
                '<div class="pipe-node" data-node="1"><div class="ord">@Order(1)</div><div class="nm">FirstChainPart</div><div class="st" data-st>idle</div></div>' + ARROW +
                '<div class="pipe-node" data-node="2"><div class="ord">@Order(2)</div><div class="nm">SecondChainPart</div><div class="st" data-st>idle</div></div>' + ARROW +
                '<div class="pipe-node" data-node="3"><div class="ord">result</div><div class="nm">ProcessDataDto</div><div class="st" data-st>—</div></div>' +
                '</div>' +
                '<div class="order-note"><span class="tag">@Order(1)</span> FirstChainPart → <span class="tag">@Order(2)</span> SecondChainPart · Spring сортирует List&lt;ChainPart&gt; до инжекции</div>' +
                '</div>' +
                '<div class="chain-trace" id="chBaseTrace"></div>' +
                '<div class="panel chain-out-panel"><h4>Результат ProcessDataDto</h4><div class="data-out chain-out" id="chBaseOut" role="status" aria-live="polite">—</div></div>' +
                '</section>' +

                '<section class="chains-frame">' +
                '<div class="chains-frame-head">' +
                '<div><span class="chains-kicker">Frame 2 · Strategy внутри Chain</span><h3>VariantChainManager → List&lt;VariantChainPart&gt;</h3></div>' +
                '<span class="chains-pill">состав цепочки выбирает @ConditionalOnProperty</span>' +
                '</div>' +
                '<div class="demo-controls chains-controls">' +
                '<div class="strategy-switch chain-mode" role="group" aria-label="chain.mode">' +
                '<button type="button" data-mode="address" aria-pressed="true">chain.mode=address</button>' +
                '<button type="button" data-mode="delivery" aria-pressed="false">chain.mode=delivery</button>' +
                '</div>' +
                '<div class="field"><label for="chVarData">entry data (JSON)</label><input id="chVarData" type="text" spellcheck="false"></div>' +
                '<button class="btn primary" type="button" data-send-var>▶ Запустить активную цепочку</button>' +
                '<button class="btn ghost sm" type="button" data-reset-var>сброс</button>' +
                '</div>' +
                '<div class="chain-cond">' +
                '<code data-cond="address">@ConditionalOnProperty(name = "chain.mode", havingValue = "address", matchIfMissing = true)</code>' +
                '<code data-cond="delivery">@ConditionalOnProperty(name = "chain.mode", havingValue = "delivery")</code>' +
                '</div>' +
                '<p class="hint chain-hint">В реальном приложении property читается при старте контекста; переключатель в демо имитирует смену property и перезапуск.</p>' +
                '<div class="chain-beans">' +
                beanRow('address', VARIANTS.address.parts) +
                beanRow('delivery', VARIANTS.delivery.parts) +
                '</div>' +
                '<div class="panel chains-pipe-panel">' +
                '<div class="pipe chain-pipe" id="chVarPipe"></div>' +
                '<div class="order-note" id="chVarNote"></div>' +
                '</div>' +
                '<div class="chain-trace" id="chVarTrace"></div>' +
                '<div class="panel chain-out-panel"><h4>Результат VariantChainManager</h4><div class="data-out chain-out" id="chVarOut" role="status" aria-live="polite">—</div></div>' +
                '</section>' +
                '<div class="chains-term" id="chTerm"></div>';

            function beanRow(mode, parts) {
                return '<div class="chain-bean-row" data-bean-row="' + mode + '">' +
                    '<div class="cb-head"><span class="cb-mode">mode=' + mode + '</span><span class="cb-state" data-state>—</span></div>' +
                    '<div class="cb-items">' + parts.map(function (p) {
                        return '<span class="cb-item"><b>' + p.order + '</b> ' + p.name + '</span>';
                    }).join('') + '</div></div>';
            }
            function titleCity(v) {
                var s = String(v == null ? '' : v).trim().toLowerCase();
                return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
            }
            function n2(n) { return String(n).padStart(2, '0'); }
            function dtoHtml(data, changed) {
                var keys = Object.keys(data);
                if (!keys.length) return '<span class="cs-empty">—</span>';
                return keys.map(function (k) {
                    var chg = changed && changed.indexOf(k) >= 0;
                    return '<span class="cs-kv' + (chg ? ' chg' : '') + '">' +
                        '<span class="cs-k">' + esc(k) + '</span><span class="cs-c">:</span> ' +
                        '<span class="cs-v">' + esc(JSON.stringify(data[k])) + '</span></span>';
                }).join('');
            }
            function makeTrace(el, stages) {
                el.innerHTML = stages.map(function (s, i) {
                    return '<article class="chain-step" data-step="' + i + '">' +
                        '<div class="cs-top"><span class="cs-n">' + esc(s.n) + '</span><span class="cs-name">' + esc(s.name) + '</span>' +
                        '<span class="cs-ord">' + esc(s.ord) + '</span></div>' +
                        '<div class="cs-dto" data-dto><span class="cs-empty">—</span></div>' +
                        '<div class="cs-note">' + esc(s.note) + '</div></article>';
                }).join('');
            }
            function baseStages() {
                return [{ n: 'in', name: 'ChainManager', ord: 'entry', note: 'принимает entry data и создаёт ProcessDataDto' }]
                    .concat(BASE_PARTS.map(function (p) { return { n: n2(p.order), name: p.name, ord: '@Order(' + p.order + ')', note: p.note }; }))
                    .concat([{ n: 'out', name: 'ProcessDataDto', ord: 'result', note: 'итог цепочки' }]);
            }
            function variantStages(mode) {
                return [{ n: 'in', name: 'VariantChainManager', ord: 'entry', note: 'получает ProcessDataDto и List из активных звеньев' }]
                    .concat(VARIANTS[mode].parts.map(function (p) { return { n: n2(p.order), name: p.name, ord: '@Order(' + p.order + ')', note: p.note }; }))
                    .concat([{ n: 'out', name: 'ProcessDataDto', ord: 'result', note: 'итог выбранной цепочки' }]);
            }
            function setStage(el, i, data, changed) {
                var card = el.querySelector('[data-step="' + i + '"]');
                if (!card) return;
                card.querySelector('[data-dto]').innerHTML = dtoHtml(data, changed);
            }
            function resetTrace(el) {
                Array.prototype.forEach.call(el.querySelectorAll('.chain-step'), function (card) {
                    card.classList.remove('lit', 'done');
                    card.querySelector('[data-dto]').innerHTML = '<span class="cs-empty">—</span>';
                });
            }
            function nodesOf(pipe) { return Array.prototype.slice.call(pipe.querySelectorAll('.pipe-node')); }
            function setNode(n, txt, cls) {
                if (!n) return;
                n.querySelector('[data-st]').textContent = txt;
                n.classList.remove('lit', 'done');
                if (cls) n.classList.add(cls);
            }
            function resetNodes(pipe) {
                nodesOf(pipe).forEach(function (n) { setNode(n, 'idle'); });
                var last = nodesOf(pipe).slice(-1)[0];
                if (last) last.querySelector('[data-st]').textContent = '—';
            }
            function moveCap(pipe, cap, i) {
                var n = nodesOf(pipe)[i];
                if (!n || !cap) return;
                cap.classList.add('fly');
                cap.style.left = (n.offsetLeft + n.offsetWidth / 2 - cap.offsetWidth / 2) + 'px';
            }
            function readJson(input) {
                var raw = input.value.trim();
                if (!raw) return null;
                try {
                    var v = JSON.parse(raw);
                    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
                } catch (e) { return null; }
            }
            function clone(v) { return JSON.parse(JSON.stringify(v)); }

            var term = ctx.terminal('baileyes.eyes.chains · ChainManager');
            host.querySelector('#chTerm').appendChild(term.node);
            var baseInput = host.querySelector('#chBaseData');
            var varInput = host.querySelector('#chVarData');
            baseInput.value = JSON.stringify(BASE_ENTRY);
            varInput.value = JSON.stringify(VARIANT_ENTRY);

            var basePipe = host.querySelector('#chBasePipe');
            var baseCap = host.querySelector('#chBaseCap');
            var baseTrace = host.querySelector('#chBaseTrace');
            var baseOut = host.querySelector('#chBaseOut');
            var baseBtn = host.querySelector('[data-send-base]');
            var baseReset = host.querySelector('[data-reset-base]');

            var varPipe = host.querySelector('#chVarPipe');
            var varTrace = host.querySelector('#chVarTrace');
            var varOut = host.querySelector('#chVarOut');
            var varNote = host.querySelector('#chVarNote');
            var varBtn = host.querySelector('[data-send-var]');
            var varReset = host.querySelector('[data-reset-var]');
            var varCap = null;
            var modeButtons = Array.prototype.slice.call(host.querySelectorAll('[data-mode]'));
            var baseRunning = false, varRunning = false, varMode = 'address';

            makeTrace(baseTrace, baseStages());

            function setBaseRunning(v) {
                baseRunning = v;
                baseBtn.disabled = v;
                baseReset.disabled = v;
            }
            function setVarRunning(v) {
                varRunning = v;
                varBtn.disabled = v;
                varReset.disabled = v;
                modeButtons.forEach(function (b) { b.disabled = v; });
            }
            function execute(opts) {
                if (opts.isRunning()) return;
                var entry = readJson(opts.input);
                if (!entry) {
                    term.error('entry data: нужен JSON-объект', opts.termName);
                    return;
                }
                opts.setRunning(true);
                resetTrace(opts.trace);
                resetNodes(opts.pipe);
                opts.out.textContent = '—';
                var data = clone(entry);
                var parts = opts.parts;
                var nodes = nodesOf(opts.pipe);
                var id = ctx.uuid();
                opts.cap.textContent = 'DTO · ' + id.slice(0, 8);
                setStage(opts.trace, 0, data, []);
                opts.trace.querySelector('[data-step="0"]').classList.add('lit');
                moveCap(opts.pipe, opts.cap, 0);
                setNode(nodes[0], 'build', 'lit');
                term.info(opts.entryLog, opts.termName);
                var step = 0;
                function finish() {
                    setNode(nodes[0], 'done', 'done');
                    setNode(nodes[nodes.length - 1], 'готово', 'done');
                    moveCap(opts.pipe, opts.cap, nodes.length - 1);
                    setStage(opts.trace, parts.length + 1, data, []);
                    var res = opts.trace.querySelector('[data-step="' + (parts.length + 1) + '"]');
                    res.classList.add('done', 'lit');
                    opts.out.innerHTML = '<span class="seg b">' + esc(JSON.stringify(data)) + '</span>';
                    term.ok('chain finished: ' + JSON.stringify(data), opts.termName);
                    opts.setRunning(false);
                }
                function advance() {
                    if (step >= parts.length) { finish(); return; }
                    var part = parts[step], nodeIndex = step + 1;
                    setNode(nodes[0], 'done', 'done');
                    setNode(nodes[nodeIndex], 'processing…', 'lit');
                    moveCap(opts.pipe, opts.cap, nodeIndex);
                    term.info('@Order(' + part.order + ') ' + part.name + '.process(dto)', part.name);
                    ctx.later(650, function () {
                        part.apply(data);
                        setStage(opts.trace, nodeIndex, data, part.changes);
                        var card = opts.trace.querySelector('[data-step="' + nodeIndex + '"]');
                        card.classList.remove('lit');
                        card.classList.add('done');
                        var prev = opts.trace.querySelector('[data-step="' + step + '"]');
                        if (prev) { prev.classList.remove('lit'); prev.classList.add('done'); }
                        setNode(nodes[nodeIndex], 'done', 'done');
                        term.info(part.note + ' → ' + JSON.stringify(data), part.name);
                        step++;
                        ctx.later(300, advance);
                    });
                }
                ctx.later(450, advance);
            }

            function runBase() {
                execute({
                    input: baseInput, parts: BASE_PARTS, pipe: basePipe, cap: baseCap,
                    trace: baseTrace, out: baseOut, isRunning: function () { return baseRunning; },
                    setRunning: setBaseRunning, termName: 'ChainManager',
                    entryLog: 'addSomething(id, data) → chain = [FirstChainPart, SecondChainPart]'
                });
            }
            function renderVariant(mode) {
                var parts = VARIANTS[mode].parts;
                var html = '<div class="capsule" id="chVarCap">ProcessDataDto</div>' +
                    '<div class="pipe-node" data-node="0"><div class="ord">entry</div><div class="nm">VariantChainManager</div><div class="st" data-st>idle</div></div>';
                parts.forEach(function (p, i) {
                    html += ARROW + '<div class="pipe-node" data-node="' + (i + 1) + '"><div class="ord">@Order(' + p.order + ')</div>' +
                        '<div class="nm">' + p.name + '</div><div class="st" data-st>idle</div></div>';
                });
                html += ARROW + '<div class="pipe-node" data-node="' + (parts.length + 1) + '"><div class="ord">result</div>' +
                    '<div class="nm">ProcessDataDto</div><div class="st" data-st>—</div></div>';
                varPipe.innerHTML = html;
                varCap = host.querySelector('#chVarCap');
                makeTrace(varTrace, variantStages(mode));
                varOut.textContent = '—';
                varNote.innerHTML = 'Активные звенья: ' + parts.map(function (p) { return '@Order(' + p.order + ') ' + p.name; }).join(' → ');
            }
            function setMode(mode, quiet) {
                if (varRunning) return;
                varMode = mode;
                modeButtons.forEach(function (b) {
                    b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode));
                });
                Array.prototype.forEach.call(host.querySelectorAll('[data-cond]'), function (c) {
                    c.classList.toggle('on', c.getAttribute('data-cond') === mode);
                });
                Array.prototype.forEach.call(host.querySelectorAll('[data-bean-row]'), function (r) {
                    var on = r.getAttribute('data-bean-row') === mode;
                    r.classList.toggle('off', !on);
                    r.querySelector('[data-state]').textContent = on ? 'в ApplicationContext' : 'отфильтровано';
                });
                renderVariant(mode);
                if (!quiet) {
                    term.info('chain.mode=' + mode + ' → bean list: [' +
                        VARIANTS[mode].parts.map(function (p) { return p.order; }).join(', ') + ']', 'Spring');
                }
            }
            function runVariant() {
                execute({
                    input: varInput, parts: VARIANTS[varMode].parts, pipe: varPipe, cap: varCap,
                    trace: varTrace, out: varOut, isRunning: function () { return varRunning; },
                    setRunning: setVarRunning, termName: 'VariantChainManager',
                    entryLog: 'process(dto) → mode=' + varMode + ' → active @Order: [' +
                        VARIANTS[varMode].parts.map(function (p) { return p.order; }).join(', ') + ']'
                });
            }

            baseBtn.addEventListener('click', runBase);
            baseReset.addEventListener('click', function () {
                if (baseRunning) return;
                resetTrace(baseTrace); resetNodes(basePipe); baseOut.textContent = '—';
                baseCap.classList.remove('fly');
                term.info('base chain сброшена', 'ChainManager');
            });
            varBtn.addEventListener('click', runVariant);
            varReset.addEventListener('click', function () {
                if (varRunning) return;
                renderVariant(varMode);
                term.info('variant chain сброшена: mode=' + varMode, 'VariantChainManager');
            });
            modeButtons.forEach(function (b) {
                b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
            });

            setMode('address', true);
            term.info('ChainManager initialized: [FirstChainPart, SecondChainPart]', 'ChainManager');
            term.info('chain.mode=address → [NormalizeCityPart, StreetPart, ZipPart, AuditPart]', 'Spring');
        },
        code: [
            { file: 'ChainPart.java', pkg: 'baileyes.eyes.chains.parts', src:
                    `package baileyes.eyes.chains.parts;

import baileyes.eyes.chains.parts.dto.ProcessDataDto;

public interface ChainPart {

    ProcessDataDto<?> process(ProcessDataDto<?> previousData);
}` },
            { file: 'AddressData.java', pkg: 'baileyes.eyes.chains.parts.dto', src:
                    `package baileyes.eyes.chains.parts.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Setter @Getter @Builder @NoArgsConstructor @AllArgsConstructor
public class AddressData {

    private String city;
    private String street;
    private String zip;
    private String formatted;
    private String geo;
    private String phone;
    private String delivery;
    private String signature;
    private String audit;
}` },
            { file: 'ChainManager.java', pkg: 'baileyes.eyes.chains.parts', src:
                    `package baileyes.eyes.chains.parts;

import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j @Service @RequiredArgsConstructor
public class ChainManager {

    private final List<ChainPart> chain;

    public ProcessDataDto<?> addSomething(UUID id, ProcessDataDto<?> dto) {
        return run(ProcessDataDto.builder().id(id).data(dto.getData()).build());
    }

    private ProcessDataDto<?> run(ProcessDataDto<?> process) {
        ProcessDataDto<?> current = process;

        for (ChainPart part : chain) {
            log.info("{}: input {}", part.getClass().getSimpleName(), current.getData());
            current = part.process(current);
            log.info("{}: output {}", part.getClass().getSimpleName(), current.getData());
        }
        return current;
    }
}` },
            { file: 'FirstChainPart.java', pkg: 'baileyes.eyes.chains.parts.impl', src:
                    `package baileyes.eyes.chains.parts.impl;

import baileyes.eyes.chains.parts.ChainPart;
import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j @Order(1) @Component @RequiredArgsConstructor
public class FirstChainPart implements ChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        String city = data.getCity() == null ? "" : data.getCity().trim();
        if (!city.isEmpty()) {
            city = city.substring(0, 1).toUpperCase() + city.substring(1).toLowerCase();
        }
        data.setCity(city);

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'SecondChainPart.java', pkg: 'baileyes.eyes.chains.parts.impl', src:
                    `package baileyes.eyes.chains.parts.impl;

import baileyes.eyes.chains.parts.ChainPart;
import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j @Order(2) @Component @RequiredArgsConstructor
public class SecondChainPart implements ChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        String zip = data.getZip() == null ? "" : data.getZip().replaceAll("\\\\D", "");
        data.setZip(zip);
        data.setFormatted((data.getCity() + ", " + data.getStreet() + " " + zip).trim());

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'VariantChainPart.java', pkg: 'baileyes.eyes.chains.parts.variant', src:
                    `package baileyes.eyes.chains.parts.variant;

import baileyes.eyes.chains.parts.dto.ProcessDataDto;

public interface VariantChainPart {

    ProcessDataDto<?> process(ProcessDataDto<?> previousData);
}` },
            { file: 'VariantChainManager.java', pkg: 'baileyes.eyes.chains.parts.variant', src:
                    `package baileyes.eyes.chains.parts.variant;

import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j @Service @RequiredArgsConstructor
public class VariantChainManager {

    // Spring инжектит только те звенья, которые прошли @ConditionalOnProperty
    private final List<VariantChainPart> chain;

    public ProcessDataDto<?> process(ProcessDataDto<?> input) {
        ProcessDataDto<?> current = input;

        for (VariantChainPart part : chain) {
            log.info("{}: input {}", part.getClass().getSimpleName(), current.getData());
            current = part.process(current);
            log.info("{}: output {}", part.getClass().getSimpleName(), current.getData());
        }
        return current;
    }
}` },
            { file: 'NormalizeCityPart.java', pkg: 'baileyes.eyes.chains.parts.variant.address', src:
                    `package baileyes.eyes.chains.parts.variant.address;

import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import baileyes.eyes.chains.parts.variant.VariantChainPart;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j @Order(1) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "address", matchIfMissing = true)
public class NormalizeCityPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        String city = data.getCity() == null ? "" : data.getCity().trim();
        if (!city.isEmpty()) {
            city = city.substring(0, 1).toUpperCase() + city.substring(1).toLowerCase();
        }
        data.setCity(city);

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'StreetPart.java', pkg: 'baileyes.eyes.chains.parts.variant.address', src:
                    `package baileyes.eyes.chains.parts.variant.address;

// imports: AddressData, ProcessDataDto, VariantChainPart, lombok, ConditionalOnProperty, Order, Component

@Slf4j @Order(3) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "address", matchIfMissing = true)
public class StreetPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        if (data.getStreet() == null || data.getStreet().trim().isEmpty()) {
            data.setStreet("ул. Тверская, 1");
        }

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'ZipPart.java', pkg: 'baileyes.eyes.chains.parts.variant.address', src:
                    `package baileyes.eyes.chains.parts.variant.address;

// imports: AddressData, ProcessDataDto, VariantChainPart, lombok, ConditionalOnProperty, Order, Component

@Slf4j @Order(5) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "address", matchIfMissing = true)
public class ZipPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        if (data.getZip() == null || data.getZip().trim().isEmpty()) {
            data.setZip("125009");
        }

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'AuditPart.java', pkg: 'baileyes.eyes.chains.parts.variant.address', src:
                    `package baileyes.eyes.chains.parts.variant.address;

// imports: AddressData, ProcessDataDto, VariantChainPart, lombok, ConditionalOnProperty, Order, Component

@Slf4j @Order(7) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "address", matchIfMissing = true)
public class AuditPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        data.setAudit("checked");

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'GeoPart.java', pkg: 'baileyes.eyes.chains.parts.variant.delivery', src:
                    `package baileyes.eyes.chains.parts.variant.delivery;

import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import baileyes.eyes.chains.parts.variant.VariantChainPart;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j @Order(2) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "delivery")
public class GeoPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        data.setGeo("RU");

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'PhonePart.java', pkg: 'baileyes.eyes.chains.parts.variant.delivery', src:
                    `package baileyes.eyes.chains.parts.variant.delivery;

// imports: AddressData, ProcessDataDto, VariantChainPart, lombok, ConditionalOnProperty, Order, Component

@Slf4j @Order(4) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "delivery")
public class PhonePart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        data.setPhone("+7 495 000-00-00");

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'DeliveryPart.java', pkg: 'baileyes.eyes.chains.parts.variant.delivery', src:
                    `package baileyes.eyes.chains.parts.variant.delivery;

// imports: AddressData, ProcessDataDto, VariantChainPart, lombok, ConditionalOnProperty, Order, Component

@Slf4j @Order(6) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "delivery")
public class DeliveryPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        data.setDelivery("courier");

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` },
            { file: 'SignaturePart.java', pkg: 'baileyes.eyes.chains.parts.variant.delivery', src:
                    `package baileyes.eyes.chains.parts.variant.delivery;

// imports: AddressData, ProcessDataDto, VariantChainPart, lombok, ConditionalOnProperty, Order, Component

@Slf4j @Order(8) @Component @RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "delivery")
public class SignaturePart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        data.setSignature("verified");

        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}` }
        ]
    });

    /* ===== 4. ADAPTER ===== */
    App.registerPattern('adapter', {
        title: 'Adapter', subtitle: 'ToyAdapter и RoboToyAdapter приводят несовместимые legacy API к NewCatToy без изменений клиента', category: 'structural',
        javaClasses: ['NewCatToy', 'OldCatToy', 'RoboCatToy', 'ToyAdapter', 'RoboToyAdapter', 'AdapterConfig', 'AdapterService'],
        essence: '<p><strong>Зачем Adapter:</strong> клиенту нужен контракт <code>NewCatToy.play()</code>, а legacy-классы дают другие методы: ' +
            '<code>OldCatToy.playOldToy(mode)</code> и <code>RoboCatToy.start(program)</code>. Подставить их напрямую нельзя — интерфейсы несовместимы. ' +
            'При этом legacy-класс может быть чужой библиотекой или кодом, который нельзя менять.</p>' +
            '<p><strong>Что делает адаптер:</strong> реализует <code>NewCatToy</code> и переводит <code>play()</code> в вызов legacy-метода. ' +
            '<code>AdapterService</code> зависит только от <code>NewCatToy</code>, старые классы не меняются, а новый источник подключается новым адаптером.</p>',
        diagram: function (host) {
            var u = new Uml(860, 400);
            u.box(20, 30, 230, 'AdapterService', '@Service', ['- NewCatToy newCatToy', '+ playWithToy() : String'], 'spring');
            u.box(330, 30, 200, 'NewCatToy', '«interface» · target', ['+ play() : String'], 'iface');
            u.box(280, 150, 180, 'ToyAdapter', 'adapter · @Bean', ['- OldCatToy oldCatToy', '+ play() : String'], 'spring');
            u.box(500, 150, 190, 'RoboToyAdapter', 'adapter · @Bean', ['- RoboCatToy roboCatToy', '+ play() : String'], 'spring');
            u.box(280, 300, 180, 'OldCatToy', 'legacy API', ['+ playOldToy(mode)'], 'abs');
            u.box(490, 300, 200, 'RoboCatToy', 'legacy API', ['+ start(program)'], 'abs');
            u.arrow(250, 60, 330, 50, 'assoc', 'DI');
            u.arrow(360, 150, 400, 83, 'impl', '');
            u.arrow(580, 150, 470, 83, 'impl', '');
            u.arrow(360, 230, 360, 300, 'agg', 'playOldToy');
            u.arrow(590, 230, 590, 300, 'agg', 'start');
            put(host, u, 'Клиент видит только <code>NewCatToy</code>. <code>ToyAdapter</code> переводит <code>play() → playOldToy(mode)</code>, ' +
                '<code>RoboToyAdapter</code> — <code>play() → start(program)</code>. Legacy-классы не меняются.');
        },
        demo: function (host, ctx) {
            var ADAPTEES = {
                old: {
                    name: 'OldCatToy', field: 'oldCatToy', call: 'playOldToy("classic")',
                    adapter: 'ToyAdapter', result: 'Old toy plays in classic mode'
                },
                robo: {
                    name: 'RoboCatToy', field: 'roboCatToy', call: 'start("chase-laser")',
                    adapter: 'RoboToyAdapter', result: 'Robo-cat runs program: chase-laser'
                }
            };
            host.innerHTML =
                '<div class="demo-controls adapter-controls">' +
                '<div class="strategy-switch" role="group" aria-label="Режим демонстрации">' +
                '<button type="button" data-mode="with" aria-pressed="true">с Adapter</button>' +
                '<button type="button" data-mode="without" aria-pressed="false">без Adapter</button>' +
                '</div>' +
                '<div class="strategy-switch" role="group" aria-label="Adaptee">' +
                '<button type="button" data-adaptee="old" aria-pressed="true">OldCatToy</button>' +
                '<button type="button" data-adaptee="robo" aria-pressed="false">RoboCatToy</button>' +
                '</div>' +
                '<button class="btn primary" type="button" data-call>▶ AdapterService.playWithToy()</button>' +
                '<button class="btn ghost sm" type="button" data-clear>очистить</button>' +
                '</div>' +
                '<div class="adapter-compare">' +
                '<section class="adapter-card bad" id="adDirectCard">' +
                '<div class="sc-head"><span class="sc-tag">без Adapter</span><h3>клиент знает legacy API</h3></div>' +
                '<div class="adapter-code" id="adDirectCode"></div>' +
                '<div class="sc-foot warn" id="adDirectFoot"></div>' +
                '</section>' +
                '<section class="adapter-card good" id="adTargetCard">' +
                '<div class="sc-head"><span class="sc-tag">с Adapter</span><h3>клиент знает только NewCatToy</h3></div>' +
                '<div class="adapter-code" id="adTargetCode"></div>' +
                '<div class="sc-foot ok" id="adTargetFoot"></div>' +
                '</section>' +
                '</div>' +
                '<div class="adapter-benefits">' +
                '<div class="ab-item"><b>legacy не меняется</b><span>OldCatToy и RoboCatToy остаются как есть — даже если это чужая библиотека</span></div>' +
                '<div class="ab-item"><b>клиент не меняется</b><span>AdapterService зависит только от NewCatToy</span></div>' +
                '<div class="ab-item"><b>замена — новый адаптер</b><span>смени adaptee и не трогай клиентский код</span></div>' +
                '<div class="ab-item"><b>перевод изолирован</b><span>маппинг методов живёт в одном классе</span></div>' +
                '</div>' +
                '<div class="panel adapter-path-panel">' +
                '<h4>Путь вызова</h4>' +
                '<div class="pipe adapter-pipe" id="adPipe"></div>' +
                '<div class="adapter-translation" id="adTranslation"></div>' +
                '</div>' +
                '<div class="two-col adapter-bottom">' +
                '<div class="panel"><h4>Возврат playWithToy()</h4><div class="data-out" id="adOut" role="status" aria-live="polite">—</div></div>' +
                '<div id="adTerm"></div>' +
                '</div>';
            var term = ctx.terminal('baileyes.eyes.adapter · AdapterService');
            host.querySelector('#adTerm').appendChild(term.node);
            var pipe = host.querySelector('#adPipe');
            var translation = host.querySelector('#adTranslation');
            var out = host.querySelector('#adOut');
            var directCode = host.querySelector('#adDirectCode');
            var targetCode = host.querySelector('#adTargetCode');
            var directFoot = host.querySelector('#adDirectFoot');
            var targetFoot = host.querySelector('#adTargetFoot');
            var directCard = host.querySelector('#adDirectCard');
            var targetCard = host.querySelector('#adTargetCard');
            var callBtn = host.querySelector('[data-call]');
            var modeButtons = Array.prototype.slice.call(host.querySelectorAll('[data-mode]'));
            var adapteeButtons = Array.prototype.slice.call(host.querySelectorAll('[data-adaptee]'));
            var mode = 'with', adaptee = 'old', busy = false, epoch = 0, cap = null;

            function arrow(label) {
                return '<div class="pipe-arrow with-label"><span>' + esc(label) + '</span>' +
                    '<svg width="42" height="16"><path d="M0,8 H34" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
                    '<path d="M32,3 L41,8 L32,13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></div>';
            }
            function nodeHtml(i, ord, name, initial, cls) {
                return '<div class="pipe-node ' + (cls || '') + '" data-node="' + i + '" data-st0="' + esc(initial) + '">' +
                    '<div class="ord">' + esc(ord) + '</div><div class="nm">' + esc(name) + '</div>' +
                    '<div class="st" data-st>' + esc(initial) + '</div></div>';
            }
            function nodesOf() { return Array.prototype.slice.call(pipe.querySelectorAll('.pipe-node')); }
            function resetNodes() {
                Array.prototype.forEach.call(pipe.querySelectorAll('.pipe-node'), function (n) {
                    n.classList.remove('lit', 'done');
                    n.querySelector('[data-st]').textContent = n.getAttribute('data-st0');
                });
            }
            function setNode(n, text, cls) {
                if (!n) return;
                n.classList.remove('lit', 'done');
                if (text) n.querySelector('[data-st]').textContent = text;
                if (cls) n.classList.add(cls);
            }
            function moveCap(i) {
                var n = nodesOf()[i];
                if (!n || !cap) return;
                cap.classList.add('fly');
                cap.style.left = (n.offsetLeft + n.offsetWidth / 2 - cap.offsetWidth / 2) + 'px';
            }
            function directLines(d) {
                return [
                    '<span class="kw">class</span> AdapterService {',
                    '  <span class="kw">private final</span> ' + esc(d.name) + ' toy;',
                    '  <span class="kw">String</span> play() {',
                    '    <span class="bad">return toy.' + esc(d.call) + ';</span>',
                    '  }',
                    '}'
                ].join('\n');
            }
            function targetLines() {
                return [
                    '<span class="kw">class</span> AdapterService {',
                    '  <span class="kw">private final</span> NewCatToy toy;',
                    '  <span class="kw">String</span> play() {',
                    '    <span class="good">return toy.play();</span>',
                    '  }',
                    '}'
                ].join('\n');
            }
            function renderPath() {
                var d = ADAPTEES[adaptee];
                var html = '<div class="capsule" id="adCap">call</div>';
                var nodes, labels;
                if (mode === 'with') {
                    nodes = [
                        nodeHtml(0, 'client', 'AdapterService', 'call', ''),
                        nodeHtml(1, 'target', 'NewCatToy', 'interface', 'target-node'),
                        nodeHtml(2, 'adapter', d.adapter, 'translates', 'adapter-node'),
                        nodeHtml(3, 'adaptee', d.name, 'legacy', 'legacy-node'),
                        nodeHtml(4, 'result', 'String', '—', '')
                    ];
                    labels = ['play()', 'play()', d.call, 'return'];
                } else {
                    nodes = [
                        nodeHtml(0, 'client', 'AdapterService', 'call', ''),
                        nodeHtml(1, 'legacy', d.name, 'legacy', 'legacy-node'),
                        nodeHtml(2, 'result', 'String', '—', '')
                    ];
                    labels = [d.call, 'return'];
                }
                for (var i = 0; i < nodes.length; i++) {
                    html += nodes[i];
                    if (i < nodes.length - 1) html += arrow(labels[i]);
                }
                pipe.innerHTML = html;
                cap = host.querySelector('#adCap');
            }
            function renderTranslation() {
                var d = ADAPTEES[adaptee];
                var rows;
                if (mode === 'with') {
                    rows = [
                        ['клиент вызывает', 'newCatToy.play()'],
                        ['adapter переводит', d.adapter + '.play() → ' + d.field + '.' + d.call],
                        ['adaptee выполняет', d.name + '.' + d.call]
                    ];
                } else {
                    rows = [
                        ['клиент вызывает', d.field + '.' + d.call],
                        ['перевода нет', 'клиент сам знает ' + d.name],
                        ['adaptee выполняет', d.name + '.' + d.call]
                    ];
                }
                translation.innerHTML = rows.map(function (r) {
                    return '<div class="at-row"><span class="at-k">' + esc(r[0]) + '</span><code>' + esc(r[1]) + '</code></div>';
                }).join('');
            }
            function paint() {
                var d = ADAPTEES[adaptee];
                directCode.innerHTML = directLines(d);
                targetCode.innerHTML = targetLines();
                directFoot.textContent = mode === 'with'
                    ? 'замена ' + d.name + ' → правка AdapterService и его импортов'
                    : 'вызов работает, но клиент жёстко связан с ' + d.name;
                directFoot.className = 'sc-foot ' + (mode === 'with' ? 'warn' : 'err');
                targetFoot.textContent = mode === 'with'
                    ? d.adapter + ' переводит play() → ' + d.field + '.' + d.call
                    : 'адаптер не подключён: NewCatToy в этой схеме не участвует';
                targetFoot.className = 'sc-foot ' + (mode === 'with' ? 'ok' : 'warn');
                directCard.classList.toggle('is-active', mode === 'without');
                targetCard.classList.toggle('is-active', mode === 'with');
                renderPath();
                renderTranslation();
                resetNodes();
                out.textContent = '—';
            }
            function setBusy(v) {
                busy = v;
                callBtn.disabled = v;
                modeButtons.forEach(function (b) { b.disabled = v; });
                adapteeButtons.forEach(function (b) { b.disabled = v; });
            }
            function run() {
                if (busy) return;
                var e = ++epoch;
                var d = ADAPTEES[adaptee];
                var steps;
                setBusy(true);
                resetNodes();
                out.textContent = '—';
                cap.classList.remove('ret');
                cap.textContent = 'call';
                term.info('AdapterService.playWithToy()', 'AdapterService');
                if (mode === 'with') {
                    steps = [
                        { node: 0, st: 'call', log: ['newCatToy.play()', 'AdapterService'] },
                        { node: 1, st: 'accept', log: ['NewCatToy: принят вызов play()', 'NewCatToy'] },
                        { node: 2, st: 'translate', log: [d.adapter + ': play() → ' + d.field + '.' + d.call, d.adapter] },
                        { node: 3, st: 'execute', log: [d.name + ': выполняется ' + d.call, d.name] },
                        { node: 4, st: 'result', log: ['return "' + d.result + '"', 'AdapterService'] }
                    ];
                } else {
                    steps = [
                        { node: 0, st: 'direct', log: ['AdapterService знает ' + d.name + ' напрямую', 'AdapterService'] },
                        { node: 1, st: 'execute', log: [d.field + '.' + d.call, d.name] },
                        { node: 2, st: 'result', log: ['return "' + d.result + '"', 'AdapterService'] }
                    ];
                }
                (function next(i) {
                    if (e !== epoch) return;
                    if (i >= steps.length) {
                        cap.textContent = 'result';
                        cap.classList.add('ret');
                        moveCap(0);
                        out.innerHTML = '<span class="seg b">"' + esc(d.result) + '"</span>';
                        term.ok('return "' + d.result + '"', 'AdapterService');
                        if (mode === 'without') {
                            term.warn('работает, но клиент связан с ' + d.name + '; замена потребует правок AdapterService.', 'AdapterService');
                        }
                        ctx.later(650, function () {
                            if (e !== epoch) return;
                            cap.classList.remove('fly', 'ret');
                            setBusy(false);
                        });
                        return;
                    }
                    var s = steps[i], n = nodesOf()[s.node];
                    if (n) { n.classList.remove('lit', 'done'); n.classList.add('lit'); n.querySelector('[data-st]').textContent = s.st; }
                    moveCap(s.node);
                    term.info(s.log[0], s.log[1]);
                    ctx.later(620, function () {
                        if (e !== epoch) return;
                        if (n) { n.classList.remove('lit'); n.classList.add('done'); }
                        next(i + 1);
                    });
                })(0);
            }
            function setMode(m) {
                if (busy) return;
                mode = m;
                modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
                paint();
                if (m === 'without') {
                    term.warn('без Adapter клиент обязан импортировать конкретный legacy-класс', 'AdapterService');
                } else {
                    term.info('AdapterService зависит только от NewCatToy', 'AdapterService');
                }
            }
            function setAdaptee(a) {
                if (busy) return;
                adaptee = a;
                adapteeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-adaptee') === a)); });
                paint();
                var d = ADAPTEES[a];
                term.info('adaptee = ' + d.name + ' → ' + d.adapter, 'AdapterConfig');
                if (mode === 'with') {
                    term.ok('AdapterService не изменился: по-прежнему newCatToy.play()', 'AdapterService');
                } else {
                    term.warn('в режиме без Adapter клиенту придётся менять импорт и вызов для ' + d.name, 'AdapterService');
                }
            }
            callBtn.addEventListener('click', run);
            host.querySelector('[data-clear]').addEventListener('click', function () { term.clear(); });
            modeButtons.forEach(function (b) {
                b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
            });
            adapteeButtons.forEach(function (b) {
                b.addEventListener('click', function () { setAdaptee(b.getAttribute('data-adaptee')); });
            });
            paint();
            term.info('AdapterService depends on NewCatToy only', 'AdapterService');
            term.info('ToyAdapter maps play() → OldCatToy.playOldToy("classic")', 'ToyAdapter');
        },
        code: [
            { file: 'NewCatToy.java', pkg: 'baileyes.eyes.adapter.adapter', src:
                    `package baileyes.eyes.adapter.adapter;

public interface NewCatToy {

    String play();
}` },
            { file: 'OldCatToy.java', pkg: 'baileyes.eyes.adapter.adapter', src:
                    `package baileyes.eyes.adapter.adapter;

public class OldCatToy {

    public String playOldToy(String mode) {
        return "Old toy plays in " + mode + " mode";
    }
}` },
            { file: 'RoboCatToy.java', pkg: 'baileyes.eyes.adapter.adapter', src:
                    `package baileyes.eyes.adapter.adapter;

public class RoboCatToy {

    public String start(String program) {
        return "Robo-cat runs program: " + program;
    }
}` },
            { file: 'ToyAdapter.java', pkg: 'baileyes.eyes.adapter.adapter.impl', src:
                    `package baileyes.eyes.adapter.adapter.impl;

import baileyes.eyes.adapter.adapter.NewCatToy;
import baileyes.eyes.adapter.adapter.OldCatToy;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ToyAdapter implements NewCatToy {

    private static final String DEFAULT_MODE = "classic";

    private final OldCatToy oldCatToy;

    @Override
    public String play() {
        return oldCatToy.playOldToy(DEFAULT_MODE);
    }
}` },
            { file: 'RoboToyAdapter.java', pkg: 'baileyes.eyes.adapter.adapter.impl', src:
                    `package baileyes.eyes.adapter.adapter.impl;

import baileyes.eyes.adapter.adapter.NewCatToy;
import baileyes.eyes.adapter.adapter.RoboCatToy;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class RoboToyAdapter implements NewCatToy {

    private static final String DEFAULT_PROGRAM = "chase-laser";

    private final RoboCatToy roboCatToy;

    @Override
    public String play() {
        return roboCatToy.start(DEFAULT_PROGRAM);
    }
}` },
            { file: 'AdapterConfig.java', pkg: 'baileyes.eyes.adapter.config', src:
                    `package baileyes.eyes.adapter.config;

import baileyes.eyes.adapter.adapter.NewCatToy;
import baileyes.eyes.adapter.adapter.OldCatToy;
import baileyes.eyes.adapter.adapter.RoboCatToy;
import baileyes.eyes.adapter.adapter.impl.RoboToyAdapter;
import baileyes.eyes.adapter.adapter.impl.ToyAdapter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class AdapterConfig {

    @Bean
    public OldCatToy oldCatToy() { return new OldCatToy(); }

    @Bean
    public RoboCatToy roboCatToy() { return new RoboCatToy(); }

    @Bean
    @Primary
    public NewCatToy newCatToy(OldCatToy oldCatToy) {
        return new ToyAdapter(oldCatToy);
    }

    // второй адаптер — через @Qualifier("roboToyAdapter")
    @Bean
    public NewCatToy roboToyAdapter(RoboCatToy roboCatToy) {
        return new RoboToyAdapter(roboCatToy);
    }
}` },
            { file: 'AdapterService.java', pkg: 'baileyes.eyes.adapter.service', src:
                    `package baileyes.eyes.adapter.service;

import baileyes.eyes.adapter.adapter.NewCatToy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AdapterService {

    private final NewCatToy newCatToy;

    public String playWithToy() {
        return newCatToy.play();
    }
}` }
        ]
    });

    /* ===== 5. BRIDGE ===== */
    App.registerPattern('bridge', {
        title: 'Bridge', subtitle: 'BridgeService → List<Animal> → AnimalBehavior: новые животные и поведения не меняют сервис', category: 'structural',
        javaClasses: ['BridgeService', 'Animal', 'HappyCat', 'HappyDog', 'AnimalBehavior', 'CatBehavior', 'DogBehavior'],
        essence: '<p><strong>Bridge</strong> разделяет две иерархии: абстракцию (<code>Animal → HappyCat/HappyDog</code>) и реализацию поведения ' +
            '(<code>AnimalBehavior → CatBehavior/DogBehavior</code>). <code>Animal</code> хранит <code>protected AnimalBehavior behavior</code>, ' +
            'а Spring подставляет реализацию через <code>@Qualifier</code>.</p>' +
            '<p><strong>Что это даёт:</strong> <code>BridgeService</code> зависит только от <code>Animal</code> и перебирает ' +
            '<code>List&lt;Animal&gt;</code>, ничего не зная о котах, собаках и конкретном поведении. Новое животное или новое поведение ' +
            'добавляется отдельным классом, а не комбинацией подклассов.</p>',
        diagram: function (host) {
            var u = new Uml(880, 320);
            u.box(20, 30, 220, 'BridgeService', '@Service', ['- List<Animal> animals', '+ execute() : void'], 'spring');
            u.box(300, 30, 235, 'Animal', '«abstract class»', ['# AnimalBehavior behavior', '+ showBehavior() «abstract»'], 'abs');
            u.box(620, 30, 230, 'AnimalBehavior', '«interface»', ['+ performAction() : String'], 'iface');
            u.box(280, 175, 115, 'HappyCat', '@Component', ['+ showBehavior()'], 'spring');
            u.box(410, 175, 115, 'HappyDog', '@Component', ['+ showBehavior()'], 'spring');
            u.box(600, 175, 110, 'CatBehavior', '@Component', ['+ performAction()'], 'spring');
            u.box(725, 175, 120, 'DogBehavior', '@Component', ['+ performAction()'], 'spring');
            u.arrow(240, 60, 300, 55, 'agg', 'animals');
            u.arrow(337, 175, 370, 128, 'ext', '');
            u.arrow(467, 175, 450, 128, 'ext', '');
            u.arrow(655, 175, 700, 83, 'impl', '');
            u.arrow(785, 175, 760, 83, 'impl', '');
            u.arrow(535, 66, 620, 66, 'agg', 'behavior (BRIDGE)', -30, -9);
            put(host, u, 'Горизонтальная связь <code>Animal o— AnimalBehavior</code> — «мост». <code>BridgeService</code> работает только с <code>Animal</code>; ' +
                'новые животные и поведения не меняют сервис.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="bridge-stage">' +
                '<div class="axis"><h3>Абстракция</h3>' +
                '<button class="axis-item sel" data-ab="HappyCat"><div class="nm">HappyCat</div><div class="ds">extends Animal</div></button>' +
                '<button class="axis-item" data-ab="HappyDog"><div class="nm">HappyDog</div><div class="ds">extends Animal</div></button>' +
                '</div>' +
                '<div class="bridge-mid">' +
                '<svg width="120" height="72" viewBox="0 0 120 72"><path d="M4,36 H116" stroke="var(--accent)" stroke-width="3" stroke-dasharray="7 5" fill="none">' +
                '<animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite"/></path>' +
                '<circle cx="4" cy="36" r="4" fill="var(--accent)"/><circle cx="116" cy="36" r="4" fill="var(--violet)"/></svg>' +
                '<div class="wire">@Qualifier → protected behavior</div>' +
                '<button class="btn primary" type="button" data-show>showBehavior()</button>' +
                '</div>' +
                '<div class="axis"><h3>Реализация</h3>' +
                '<button class="axis-item sel" data-bh="CatBehavior"><div class="nm">CatBehavior</div><div class="ds">implements AnimalBehavior</div></button>' +
                '<button class="axis-item" data-bh="DogBehavior"><div class="nm">DogBehavior</div><div class="ds">implements AnimalBehavior</div></button>' +
                '</div>' +
                '</div>' +
                '<div class="panel" style="margin-top:14px"><h4>2 × 2 = 4 комбинации без 4 подклассов</h4><div class="combo-grid" id="brCombos"></div>' +
                '<p class="hint bridge-combo-note">Комбинации — это варианты wiring через <code>@Qualifier</code>. В текущем контексте <code>HappyCat</code> получает <code>catBehavior</code>, <code>HappyDog</code> — <code>dogBehavior</code>.</p></div>' +
                '<div class="panel bridge-service-panel">' +
                '<div class="bridge-service-head">' +
                '<div><span class="panel-title">BridgeService</span><h4>List&lt;Animal&gt; animals</h4></div>' +
                '<button class="btn primary" type="button" data-execute>▶ execute()</button>' +
                '</div>' +
                '<div class="bridge-service-body">' +
                '<div class="bridge-service-box"><div class="bs-title">BridgeService</div>' +
                '<div class="bs-code">for (Animal animal : animals) {\n    animal.showBehavior();\n}</div></div>' +
                '<div class="bs-arrow" aria-hidden="true">→</div>' +
                '<div class="bridge-service-rows" id="brServiceRows">' +
                '<div class="bs-row" data-row="0"><span class="bs-emoji">🐱</span><span class="bs-animal">HappyCat</span>' +
                '<span class="bs-behavior">CatBehavior</span><span class="bs-say">мурчит и трётся о ноги</span></div>' +
                '<div class="bs-row" data-row="1"><span class="bs-emoji">🐶</span><span class="bs-animal">HappyDog</span>' +
                '<span class="bs-behavior">DogBehavior</span><span class="bs-say">гавкает и виляет хвостом</span></div>' +
                '</div>' +
                '</div>' +
                '<p class="hint bridge-service-note">BridgeService зависит только от Animal и AnimalBehavior; сервис не меняется при добавлении нового животного или поведения.</p>' +
                '</div>' +
                '<div class="two-col" style="margin-top:14px">' +
                '<div class="panel bridge-out-panel"><h4>stdout</h4><div class="data-out bridge-stdout" id="brOut" role="status" aria-live="polite">—</div></div>' +
                '<div id="brTerm"></div>' +
                '</div>';
            var term = ctx.terminal('baileyes.eyes.bridge · console');
            host.querySelector('#brTerm').appendChild(term.node);
            var ab = 'HappyCat', bh = 'CatBehavior';
            var PHRASES = {
                CatBehavior: { emoji: '🐱', text: 'мурчит и трётся о ноги' },
                DogBehavior: { emoji: '🐶', text: 'гавкает и виляет хвостом' }
            };
            var SERVICE = [
                { animal: 'HappyCat', behavior: 'CatBehavior' },
                { animal: 'HappyDog', behavior: 'DogBehavior' }
            ];
            var combos = [['HappyCat', 'CatBehavior'], ['HappyCat', 'DogBehavior'], ['HappyDog', 'CatBehavior'], ['HappyDog', 'DogBehavior']];
            var combosHost = host.querySelector('#brCombos');
            var out = host.querySelector('#brOut');
            var showBtn = host.querySelector('[data-show]');
            var execBtn = host.querySelector('[data-execute]');
            var serviceRows = Array.prototype.slice.call(host.querySelectorAll('.bs-row'));
            var busy = false;
            function lineHtml(animal, phrase) {
                return '<div class="std-line"><span class="std-em">' + phrase.emoji + '</span> ' +
                    '<b>' + esc(animal) + ':</b> ' + esc(phrase.text) + '</div>';
            }
            function paint() {
                combosHost.innerHTML = combos.map(function (c) {
                    var live = c[0] === ab && c[1] === bh;
                    return '<div class="combo' + (live ? ' live' : '') + '">' + c[0] + ' × ' + c[1] +
                        '<em>' + (live ? '● активная пара' : '○ свободная комбинация') + '</em></div>';
                }).join('');
                Array.prototype.forEach.call(host.querySelectorAll('[data-ab]'), function (b) { b.classList.toggle('sel', b.getAttribute('data-ab') === ab); });
                Array.prototype.forEach.call(host.querySelectorAll('[data-bh]'), function (b) { b.classList.toggle('sel', b.getAttribute('data-bh') === bh); });
            }
            function setBusy(v) {
                busy = v;
                showBtn.disabled = v;
                execBtn.disabled = v;
            }
            Array.prototype.forEach.call(host.querySelectorAll('[data-ab]'), function (b) {
                b.addEventListener('click', function () { ab = b.getAttribute('data-ab'); paint(); term.debug('мост: абстракция = ' + ab, 'Spring'); });
            });
            Array.prototype.forEach.call(host.querySelectorAll('[data-bh]'), function (b) {
                b.addEventListener('click', function () { bh = b.getAttribute('data-bh'); paint(); term.debug('@Qualifier("' + bh.charAt(0).toLowerCase() + bh.slice(1) + '")', 'Spring'); });
            });
            showBtn.addEventListener('click', function () {
                if (busy) return;
                var phrase = PHRASES[bh];
                term.info(ab + '.showBehavior()', ab);
                term.debug('behavior = ' + bh + ' (AnimalBehavior)', 'Spring');
                out.textContent = '—';
                setBusy(true);
                ctx.later(320, function () {
                    term.info(bh + '.performAction() → ' + phrase.text + ' ' + phrase.emoji, bh);
                    term.raw('<span class="ansi-bright-cyan">' + esc(ab) + ': </span>' +
                        '<span class="ansi-green">' + esc(phrase.text + ' ' + phrase.emoji) + '</span>');
                    out.innerHTML = lineHtml(ab, phrase);
                    setBusy(false);
                });
            });
            execBtn.addEventListener('click', function () {
                if (busy) return;
                setBusy(true);
                out.textContent = '—';
                serviceRows.forEach(function (r) { r.classList.remove('on', 'done'); });
                term.info('BridgeService.execute()', 'BridgeService');
                term.debug('animals = [HappyCat, HappyDog]', 'BridgeService');
                var i = 0, html = '';
                (function next() {
                    if (i >= SERVICE.length) {
                        term.ok('BridgeService.execute() finished: ' + SERVICE.length + ' animals', 'BridgeService');
                        setBusy(false);
                        return;
                    }
                    var item = SERVICE[i], phrase = PHRASES[item.behavior], row = serviceRows[i];
                    row.classList.remove('done');
                    row.classList.add('on');
                    term.info(item.animal + '.showBehavior()', item.animal);
                    term.info(item.behavior + '.performAction() → ' + phrase.text + ' ' + phrase.emoji, item.behavior);
                    ctx.later(520, function () {
                        row.classList.remove('on');
                        row.classList.add('done');
                        html += lineHtml(item.animal, phrase);
                        out.innerHTML = html;
                        term.raw('<span class="ansi-bright-cyan">' + esc(item.animal) + ': </span>' +
                            '<span class="ansi-green">' + esc(phrase.text + ' ' + phrase.emoji) + '</span>');
                        i++;
                        next();
                    });
                })();
            });
            paint();
            term.info('BridgeService initialized: animals=[HappyCat, HappyDog]', 'BridgeService');
            term.info('HappyCat → catBehavior, HappyDog → dogBehavior', 'Spring');
        },
        code: [
            { file: 'Animal.java', pkg: 'baileyes.eyes.bridge.bridge', src:
                    `package baileyes.eyes.bridge.bridge;

public abstract class Animal {

    protected AnimalBehavior behavior;

    protected Animal(AnimalBehavior behavior) {
        this.behavior = behavior;
    }

    public abstract void showBehavior();
}` },
            { file: 'AnimalBehavior.java', pkg: 'baileyes.eyes.bridge.bridge', src:
                    `package baileyes.eyes.bridge.bridge;

public interface AnimalBehavior {

    String performAction();
}` },
            { file: 'HappyCat.java', pkg: 'baileyes.eyes.bridge.bridge.abstraction', src:
                    `package baileyes.eyes.bridge.bridge.abstraction;

import baileyes.eyes.bridge.bridge.Animal;
import baileyes.eyes.bridge.bridge.AnimalBehavior;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
public class HappyCat extends Animal {

    public HappyCat(@Qualifier("catBehavior") AnimalBehavior animalBehavior) {
        super(animalBehavior);
    }

    @Override
    public void showBehavior() {
        System.out.println("HappyCat: " + behavior.performAction());
    }
}` },
            { file: 'HappyDog.java', pkg: 'baileyes.eyes.bridge.bridge.abstraction', src:
                    `package baileyes.eyes.bridge.bridge.abstraction;

import baileyes.eyes.bridge.bridge.Animal;
import baileyes.eyes.bridge.bridge.AnimalBehavior;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
public class HappyDog extends Animal {

    public HappyDog(@Qualifier("dogBehavior") AnimalBehavior animalBehavior) {
        super(animalBehavior);
    }

    @Override
    public void showBehavior() {
        System.out.println("HappyDog: " + behavior.performAction());
    }
}` },
            { file: 'CatBehavior.java', pkg: 'baileyes.eyes.bridge.bridge.impl', src:
                    `package baileyes.eyes.bridge.bridge.impl;

import baileyes.eyes.bridge.bridge.AnimalBehavior;
import org.springframework.stereotype.Component;

@Component
public class CatBehavior implements AnimalBehavior {

    @Override
    public String performAction() {
        return "мурчит и трётся о ноги 🐱";
    }
}` },
            { file: 'DogBehavior.java', pkg: 'baileyes.eyes.bridge.bridge.impl', src:
                    `package baileyes.eyes.bridge.bridge.impl;

import baileyes.eyes.bridge.bridge.AnimalBehavior;
import org.springframework.stereotype.Component;

@Component
public class DogBehavior implements AnimalBehavior {

    @Override
    public String performAction() {
        return "гавкает и виляет хвостом 🐶";
    }
}` },
            { file: 'BridgeService.java', pkg: 'baileyes.eyes.bridge.service', src:
                    `package baileyes.eyes.bridge.service;

import baileyes.eyes.bridge.bridge.Animal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class BridgeService {

    private final List<Animal> animals;

    public void execute() {
        for (Animal animal : animals) {
            animal.showBehavior();
        }
    }
}` }
        ]
    });

    /* ===== 6. DECORATOR ===== */
    App.registerPattern('decorator', {
        title: 'Decorator', subtitle: 'BaseService + First/Second/ThirdDecorator: новые возможности в runtime без 2^N подклассов', category: 'structural',
        javaClasses: ['BaseService', 'BaseServiceDecorator', 'FirstDecorator', 'SecondDecorator', 'ThirdDecorator', 'RandomDataDTO'],
        essence: '<p><strong>Decorator</strong> оборачивает объект тем же интерфейсом: <code>BaseServiceDecorator</code> хранит ' +
            '<code>BaseService baseService</code>, вызывает <code>super.performAction()</code> и добавляет свой кусок результата. ' +
            'Поэтому <code>FirstDecorator</code>, <code>SecondDecorator</code> и <code>ThirdDecorator</code> вкладываются друг в друга в любом порядке.</p>' +
            '<p><strong>Что это даёт:</strong> <code>BaseService</code> не меняется, а комбинация возможностей собирается в runtime. ' +
            'Без Decorator для N независимых фич понадобилось бы до 2^N подклассов; с Decorator — N классов-обёрток. ' +
            '<code>performAction()</code> у чистой базы и <code>performDecoratedAction()</code> у башни дают разные результаты.</p>' +
            '<p><strong>Чем отличается от Proxy:</strong> Proxy реализует тот же интерфейс, но управляет вызовом (доступ, кэш, ленивая загрузка) ' +
            'и может вернуть замену. Decorator не меняет смысл вызова — он <b>расширяет</b> результат, добавляя данные на каждом слое.</p>',
        diagram: function (host) {
            var u = new Uml(820, 330);
            u.box(290, 15, 240, 'BaseService', '@Service', ['+ performAction() : RandomDataDTO', '+ performDecoratedAction()', '+ performDecoratedAction(first, second, third)'], 'spring');
            u.box(290, 130, 240, 'BaseServiceDecorator', '«abstract»', ['# BaseService baseService', '+ performAction()'], 'abs');
            u.box(60, 235, 190, 'FirstDecorator', 'extends', ['+ performAction()', 'concat(" First …")']);
            u.box(315, 235, 190, 'SecondDecorator', 'extends', ['+ performAction()', 'concat(" Second …")']);
            u.box(570, 235, 190, 'ThirdDecorator', 'extends', ['+ performAction()', 'concat(" Third …")']);
            u.arrow(410, 130, 410, 98, 'ext', 'extends');
            u.arrow(155, 235, 370, 198, 'ext', '');
            u.arrow(410, 235, 410, 198, 'ext', '');
            u.arrow(665, 235, 450, 198, 'ext', '');
            put(host, u, 'Декораторы — is-a BaseService и has-a BaseService. <code>BaseServiceDecorator</code> хранит <code>baseService</code> ' +
                'и вызывает <code>super.performAction()</code>, поэтому обёртки вкладываются произвольно.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls decorator-controls">' +
                '<label class="switch"><input type="checkbox" id="dcFirst" checked><span class="track"></span>+ FirstDecorator</label>' +
                '<label class="switch"><input type="checkbox" id="dcSecond" checked><span class="track"></span>+ SecondDecorator</label>' +
                '<label class="switch"><input type="checkbox" id="dcThird" checked><span class="track"></span>+ ThirdDecorator</label>' +
                '<button class="btn primary" type="button" data-run-decorated>▶ performDecoratedAction()</button>' +
                '<button class="btn" type="button" data-run-base>BaseService.performAction()</button>' +
                '<button class="btn ghost sm" type="button" data-clear>очистить</button>' +
                '</div>' +
                '<div class="decorator-stage">' +
                '<div class="panel decorator-tower-panel">' +
                '<div class="decorator-tower-head">' +
                '<div><span class="panel-title">Башня обёрток</span><h4>Каждый слой расширяет поведение</h4></div>' +
                '<span class="dc-dir">call ↓ · return ↑</span>' +
                '</div>' +
                '<div class="decorator-tower" id="dcTowerView"></div>' +
                '<div class="dc-ribbon-wrap">' +
                '<div class="dc-ribbon-head"><span>RandomDataDTO.data</span><span id="dcRibbonState">base only</span></div>' +
                '<div class="dc-ribbon" id="dcRibbon"><span class="dc-seg base">Base Service Data</span></div>' +
                '</div>' +
                '<p class="hint decorator-note">Внешняя обёртка вызывается первой, но добавляет данные последней.</p>' +
                '</div>' +
                '<div class="panel decorator-trace-panel">' +
                '<div class="decorator-tower-head">' +
                '<div><span class="panel-title">Трасса вызова</span><h4>Call вниз, return вверх</h4></div>' +
                '<span class="dc-dir" id="dcTraceState">idle</span>' +
                '</div>' +
                '<div class="decorator-stack" id="dcStack"></div>' +
                '</div>' +
                '</div>' +
                '<div class="two-col decorator-bottom">' +
                '<div class="decorator-compare">' +
                '<section class="decorator-card base" id="dcBaseCard">' +
                '<div class="sc-head"><span class="sc-tag">без обёрток</span><h3>BaseService.performAction()</h3></div>' +
                '<div class="decorator-code">return new RandomDataDTO("Base Service Data");</div>' +
                '<div class="dc-result" id="dcBaseResult">"Base Service Data"</div>' +
                '<div class="sc-foot">декораторы не участвуют — это чистая база</div>' +
                '</section>' +
                '<section class="decorator-card deco" id="dcDecoCard">' +
                '<div class="sc-head"><span class="sc-tag">с Decorator</span><h3 id="dcTower">BaseService</h3></div>' +
                '<div class="decorator-code">result = super.performAction();\nresult.setData(result.getData().concat(" …"));\nreturn result;</div>' +
                '<div class="dc-result" id="dcDecoResult">—</div>' +
                '<div class="sc-foot">башня собирается в runtime; BaseService не меняется</div>' +
                '</section>' +
                '</div>' +
                '<div class="panel decorator-term-panel"><h4>Лог вызова</h4><div id="dcTerm"></div></div>' +
                '</div>' +
                '<div class="decorator-benefits">' +
                '<div class="dc-benefit"><b>2^N вариантов без 2^N классов</b><span>3 фичи → 8 подклассов против 3 декораторов</span></div>' +
                '<div class="dc-benefit"><b>BaseService не меняется</b><span>каждая обёртка — отдельный класс</span></div>' +
                '<div class="dc-benefit"><b>Композиция в runtime</b><span>включай First/Second/Third чекбоксами</span></div>' +
                '<div class="dc-benefit"><b>Один класс — одна ответственность</b><span>каждый слой добавляет свой кусок данных</span></div>' +
                '</div>' +
                '<div class="panel proxy-compare-panel">' +
                '<div class="proxy-head">' +
                '<div><span class="panel-title">Decorator vs Proxy</span><h4>Один интерфейс — разный смысл</h4></div>' +
                '<div class="proxy-controls">' +
                '<div class="strategy-switch" role="group" aria-label="Режим Proxy">' +
                '<button type="button" data-proxy-mode="allow" aria-pressed="true">Proxy: allow</button>' +
                '<button type="button" data-proxy-mode="deny" aria-pressed="false">Proxy: deny</button>' +
                '</div>' +
                '<button class="btn primary" type="button" data-run-proxy>▶ Сравнить</button>' +
                '</div>' +
                '</div>' +
                '<div class="proxy-grid">' +
                '<div class="proxy-side deco">' +
                '<div class="proxy-title">Decorator · расширяет поведение</div>' +
                '<div class="proxy-flow">' +
                '<span class="px-chip" data-px-deco="client">Client</span><span class="px-arrow">→</span>' +
                '<span class="px-chip" data-px-deco="third">ThirdDecorator</span><span class="px-arrow">→</span>' +
                '<span class="px-chip" data-px-deco="second">SecondDecorator</span><span class="px-arrow">→</span>' +
                '<span class="px-chip" data-px-deco="first">FirstDecorator</span><span class="px-arrow">→</span>' +
                '<span class="px-chip" data-px-deco="base">BaseService</span>' +
                '</div>' +
                '<div class="proxy-code">super.performAction().concat(" First")...concat(" Third")</div>' +
                '<div class="proxy-result" id="pxDecoResult">—</div>' +
                '<div class="proxy-note">каждый слой добавляет данные — результат растёт</div>' +
                '</div>' +
                '<div class="proxy-side proxy">' +
                '<div class="proxy-title">Proxy · контролирует и заменяет</div>' +
                '<div class="proxy-flow">' +
                '<span class="px-chip" data-px-proxy="client">Client</span><span class="px-arrow">→</span>' +
                '<span class="px-chip gate" data-px-proxy="proxy">ProtectionProxy</span><span class="px-arrow">→</span>' +
                '<span class="px-chip" data-px-proxy="base">BaseService</span>' +
                '</div>' +
                '<div class="proxy-code">if (!allowed) return "Access denied"; return base.performAction();</div>' +
                '<div class="proxy-result" id="pxProxyResult">—</div>' +
                '<div class="proxy-note">proxy решает: пропустить вызов или вернуть замену</div>' +
                '</div>' +
                '</div>' +
                '<p class="hint proxy-summary">Decorator <b>расширяет</b> результат: к базе добавляются First/Second/Third. ' +
                'Proxy <b>управляет</b> вызовом: при deny BaseService не вызывается и возвращается замена. ' +
                'Оба реализуют один интерфейс, но Proxy не наращивает данные.</p>' +
                '</div>';
            var term = ctx.terminal('baileyes.eyes.decorator');
            host.querySelector('#dcTerm').appendChild(term.node);
            var towerView = host.querySelector('#dcTowerView');
            var ribbon = host.querySelector('#dcRibbon');
            var ribbonState = host.querySelector('#dcRibbonState');
            var stack = host.querySelector('#dcStack');
            var tower = host.querySelector('#dcTower');
            var traceState = host.querySelector('#dcTraceState');
            var baseResult = host.querySelector('#dcBaseResult');
            var decoResult = host.querySelector('#dcDecoResult');
            var baseCard = host.querySelector('#dcBaseCard');
            var decoCard = host.querySelector('#dcDecoCard');
            var f = host.querySelector('#dcFirst');
            var s = host.querySelector('#dcSecond');
            var t = host.querySelector('#dcThird');
            var runBaseBtn = host.querySelector('[data-run-base]');
            var runDecoBtn = host.querySelector('[data-run-decorated]');
            var busy = false;
            var STEP = 600;
            var decoChips = {}, proxyChips = {};
            Array.prototype.forEach.call(host.querySelectorAll('[data-px-deco]'), function (c) { decoChips[c.getAttribute('data-px-deco')] = c; });
            Array.prototype.forEach.call(host.querySelectorAll('[data-px-proxy]'), function (c) { proxyChips[c.getAttribute('data-px-proxy')] = c; });
            var pxDecoResult = host.querySelector('#pxDecoResult');
            var pxProxyResult = host.querySelector('#pxProxyResult');
            var proxyModeBtns = Array.prototype.slice.call(host.querySelectorAll('[data-proxy-mode]'));
            var proxyRunBtn = host.querySelector('[data-run-proxy]');
            var proxyMode = 'allow', proxyBusy = false;

            function towerName() {
                var name = 'BaseService';
                if (f.checked) name = 'FirstDecorator(' + name + ')';
                if (s.checked) name = 'SecondDecorator(' + name + ')';
                if (t.checked) name = 'ThirdDecorator(' + name + ')';
                return name;
            }
            function frameHtml(id, name, add, inner) {
                return '<div class="dc-frame dc-frame-' + id + '" data-l="' + id + '">' +
                    '<div class="dc-frame-head"><span class="dc-frame-name">' + esc(name) + '</span>' +
                    '<span class="dc-frame-add">' + esc(add) + '</span></div>' +
                    (inner ? '<div class="dc-frame-inner">' + inner + '</div>' : '') + '</div>';
            }
            function renderTower() {
                var inner = frameHtml('base', 'BaseService', 'return "Base Service Data"', '');
                if (f.checked) inner = frameHtml('first', 'FirstDecorator', '+ " First Decorator Data"', inner);
                if (s.checked) inner = frameHtml('second', 'SecondDecorator', '+ " Second Decorator Data"', inner);
                if (t.checked) inner = frameHtml('third', 'ThirdDecorator', '+ " Third Decorator Data"', inner);
                towerView.innerHTML = inner;
            }
            function setRibbon(parts, state) {
                ribbon.innerHTML = parts.map(function (p) {
                    return '<span class="dc-seg ' + p.kind + '">' + esc(p.text) + '</span>';
                }).join('');
                ribbonState.textContent = state;
            }
            function resetRibbon() {
                setRibbon([{ kind: 'base', text: 'Base Service Data' }], 'base only');
            }
            function clearFrames() {
                Array.prototype.forEach.call(towerView.querySelectorAll('.dc-frame'), function (fr) {
                    fr.classList.remove('active', 'skip', 'sweep');
                });
            }
            function clearActiveFrames() {
                Array.prototype.forEach.call(towerView.querySelectorAll('.dc-frame'), function (fr) {
                    fr.classList.remove('active');
                });
            }
            function activateFrame(layer) {
                Array.prototype.forEach.call(towerView.querySelectorAll('.dc-frame'), function (fr) { fr.classList.remove('active'); });
                var el = towerView.querySelector('[data-l="' + layer + '"]');
                if (!el) return;
                el.classList.add('active');
                el.classList.remove('sweep');
                void el.offsetWidth;
                el.classList.add('sweep');
                ctx.later(680, function () { el.classList.remove('sweep'); });
            }
            function layerLabel(layer) {
                if (layer === 'third') return 'ThirdDecorator';
                if (layer === 'second') return 'SecondDecorator';
                return 'FirstDecorator';
            }
            function layerWord(layer) {
                if (layer === 'third') return 'Third';
                if (layer === 'second') return 'Second';
                return 'First';
            }
            function setTraceState(text, cls) {
                traceState.textContent = text;
                traceState.className = 'dc-dir' + (cls ? ' ' + cls : '');
            }
            function buildSteps() {
                var steps = [];
                if (t.checked) steps.push({ kind: 'call', layer: 'third', title: 'ThirdDecorator.performAction()', detail: 'super.performAction() — идём внутрь' });
                if (s.checked) steps.push({ kind: 'call', layer: 'second', title: 'SecondDecorator.performAction()', detail: 'super.performAction() — идём внутрь' });
                if (f.checked) steps.push({ kind: 'call', layer: 'first', title: 'FirstDecorator.performAction()', detail: 'super.performAction() — идём внутрь' });
                steps.push({ kind: 'base', layer: 'base', title: 'BaseService.performAction()', detail: 'return new RandomDataDTO("Base Service Data")', value: 'Base Service Data' });
                var value = 'Base Service Data';
                if (f.checked) {
                    value += ' First Decorator Data';
                    steps.push({ kind: 'add', layer: 'first', title: 'FirstDecorator: return', detail: 'data.concat(" First Decorator Data")', value: value });
                }
                if (s.checked) {
                    value += ' Second Decorator Data';
                    steps.push({ kind: 'add', layer: 'second', title: 'SecondDecorator: return', detail: 'data.concat(" Second Decorator Data")', value: value });
                }
                if (t.checked) {
                    value += ' Third Decorator Data';
                    steps.push({ kind: 'add', layer: 'third', title: 'ThirdDecorator: return', detail: 'data.concat(" Third Decorator Data")', value: value });
                }
                return steps;
            }
            function stepHtml(step, i, active) {
                return '<div class="dc-step' + (i === active ? ' on' : '') + ' dc-step-' + step.kind + '" data-step="' + i + '">' +
                    '<span class="dc-n">' + (i + 1) + '</span>' +
                    '<div class="dc-body"><b>' + esc(step.title) + '</b><span>' + esc(step.detail) + '</span>' +
                    (step.value ? '<code>"' + esc(step.value) + '"</code>' : '') + '</div></div>';
            }
            function renderStack(steps, active) {
                stack.innerHTML = steps.map(function (step, i) { return stepHtml(step, i, active); }).join('');
            }
            function mark(i, cls) {
                var el = stack.querySelector('[data-step="' + i + '"]');
                if (!el) return;
                el.classList.remove('on', 'done');
                if (cls) el.classList.add(cls);
            }
            function resetCards() {
                baseCard.classList.remove('is-active');
                decoCard.classList.remove('is-active');
                baseResult.classList.remove('live');
                decoResult.classList.remove('live');
            }
            function render() {
                renderTower();
                tower.textContent = towerName();
                baseResult.textContent = '"Base Service Data"';
                decoResult.textContent = '—';
                resetCards();
                clearFrames();
                resetRibbon();
                renderStack(buildSteps(), -1);
                setTraceState('idle');
            }
            function setBusy(v) {
                busy = v;
                runBaseBtn.disabled = v;
                runDecoBtn.disabled = v;
                f.disabled = v;
                s.disabled = v;
                t.disabled = v;
            }
            function runBase() {
                if (busy) return;
                setBusy(true);
                resetCards();
                baseCard.classList.add('is-active');
                baseResult.classList.add('live');
                var steps = buildSteps();
                var baseIndex = 0;
                for (var k = 0; k < steps.length; k++) {
                    if (steps[k].kind === 'base') { baseIndex = k; break; }
                }
                renderStack(steps, -1);
                Array.prototype.forEach.call(stack.querySelectorAll('.dc-step'), function (el, i) {
                    if (steps[i].kind !== 'base') el.classList.add('skip');
                });
                var baseEl = stack.querySelector('[data-step="' + baseIndex + '"]');
                if (baseEl) baseEl.classList.add('on');
                clearFrames();
                Array.prototype.forEach.call(towerView.querySelectorAll('.dc-frame'), function (fr) {
                    if (fr.getAttribute('data-l') !== 'base') fr.classList.add('skip');
                });
                activateFrame('base');
                resetRibbon();
                setTraceState('base');
                term.info('BaseService.performAction()', 'BaseService');
                term.info('декораторы не вызываются: прямой вызов базы', 'BaseService');
                ctx.later(STEP, function () {
                    mark(baseIndex, 'done');
                    clearActiveFrames();
                    term.ok('return "Base Service Data"', 'BaseService');
                    setTraceState('done', 'ok');
                    setBusy(false);
                });
            }
            function runDecorated() {
                if (busy) return;
                setBusy(true);
                resetCards();
                decoCard.classList.add('is-active');
                decoResult.textContent = '—';
                var parts = [{ kind: 'base', text: 'Base Service Data' }];
                setRibbon(parts, 'base only');
                var steps = buildSteps();
                var finalValue = steps[steps.length - 1].value;
                renderStack(steps, -1);
                clearFrames();
                setTraceState('call ↓');
                term.info('BaseService.performDecoratedAction(first=' + f.checked + ', second=' + s.checked + ', third=' + t.checked + ')', 'BaseService');
                term.debug('tower = ' + tower.textContent, 'Demo');
                if (!f.checked && !s.checked && !t.checked) {
                    term.warn('башня пуста — вернётся только BaseService', 'Demo');
                }
                var i = 0;
                (function next() {
                    if (i >= steps.length) {
                        decoResult.textContent = '"' + finalValue + '"';
                        decoResult.classList.add('live');
                        setRibbon(parts, parts.map(function (p) { return p.kind; }).join(' + '));
                        clearActiveFrames();
                        term.ok('result = "' + finalValue + '"', 'BaseService');
                        setTraceState('done', 'ok');
                        setBusy(false);
                        return;
                    }
                    var step = steps[i];
                    mark(i, 'on');
                    activateFrame(step.layer);
                    if (step.kind === 'call') {
                        setTraceState('call ↓');
                        term.info(step.title, layerLabel(step.layer));
                    } else if (step.kind === 'base') {
                        setTraceState('return ↑');
                        term.info('BaseService.performAction() → "Base Service Data"', 'BaseService');
                        decoResult.textContent = '"Base Service Data"';
                        setRibbon(parts, 'base only');
                    } else {
                        setTraceState('return ↑');
                        var who = layerLabel(step.layer);
                        term.info(who + ': data.concat(" ' + layerWord(step.layer) + ' Decorator Data")', who);
                        parts.push({ kind: step.layer, text: layerWord(step.layer) + ' Decorator Data' });
                        decoResult.textContent = '"' + step.value + '"';
                        setRibbon(parts, parts.map(function (p) { return p.kind; }).join(' + '));
                    }
                    ctx.later(STEP, function () {
                        mark(i, 'done');
                        i++;
                        next();
                    });
                })();
            }
            function clearChip(chip) {
                if (!chip) return;
                chip.classList.remove('active', 'pass', 'blocked', 'dim');
            }
            function markChip(chip, cls) {
                if (!chip) return;
                clearChip(chip);
                if (cls) chip.classList.add(cls);
            }
            function clearProxy() {
                Object.keys(decoChips).forEach(function (k) { clearChip(decoChips[k]); });
                Object.keys(proxyChips).forEach(function (k) { clearChip(proxyChips[k]); });
                pxDecoResult.textContent = '—';
                pxProxyResult.textContent = '—';
            }
            function setPxDeco(parts) {
                pxDecoResult.innerHTML = parts.map(function (p) {
                    return '<span class="px-seg ' + p.kind + '">' + esc(p.text) + '</span>';
                }).join(' ');
            }
            function runProxyCompare() {
                if (proxyBusy) return;
                proxyBusy = true;
                proxyRunBtn.disabled = true;
                proxyModeBtns.forEach(function (b) { b.disabled = true; });
                clearProxy();
                var parts = [{ kind: 'base', text: 'Base Service Data' }];
                term.info('Decorator vs Proxy: сравнение', 'Demo');
                markChip(decoChips.client, 'active');
                markChip(proxyChips.client, 'active');
                ctx.later(300, function () {
                    markChip(decoChips.third, 'active');
                    markChip(proxyChips.proxy, 'active');
                });
                ctx.later(600, function () {
                    markChip(decoChips.second, 'active');
                });
                ctx.later(900, function () {
                    markChip(decoChips.first, 'active');
                });
                ctx.later(1200, function () {
                    markChip(decoChips.base, 'active');
                    setPxDeco(parts);
                    if (proxyMode === 'deny') {
                        markChip(proxyChips.proxy, 'blocked');
                        markChip(proxyChips.base, 'dim');
                        pxProxyResult.textContent = '⛔ Access denied';
                        term.warn('Proxy deny: BaseService не вызывается, возвращается замена', 'ProtectionProxy');
                    } else {
                        markChip(proxyChips.proxy, 'pass');
                        markChip(proxyChips.base, 'active');
                        pxProxyResult.textContent = '"Base Service Data"';
                        term.ok('Proxy allow: вызов проброшен в BaseService без изменений', 'ProtectionProxy');
                    }
                });
                ctx.later(1500, function () {
                    parts.push({ kind: 'first', text: 'First Decorator Data' });
                    setPxDeco(parts);
                    markChip(decoChips.first, 'pass');
                });
                ctx.later(1800, function () {
                    parts.push({ kind: 'second', text: 'Second Decorator Data' });
                    setPxDeco(parts);
                    markChip(decoChips.second, 'pass');
                });
                ctx.later(2100, function () {
                    parts.push({ kind: 'third', text: 'Third Decorator Data' });
                    setPxDeco(parts);
                    markChip(decoChips.third, 'pass');
                    markChip(decoChips.base, 'pass');
                    markChip(decoChips.client, 'pass');
                    markChip(proxyChips.client, 'pass');
                    if (proxyMode === 'allow') markChip(proxyChips.base, 'pass');
                    term.ok('Decorator: результат расширен тремя слоями', 'ThirdDecorator');
                    proxyBusy = false;
                    proxyRunBtn.disabled = false;
                    proxyModeBtns.forEach(function (b) { b.disabled = false; });
                });
            }
            function setProxyMode(mode) {
                if (proxyBusy) return;
                proxyMode = mode;
                proxyModeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-proxy-mode') === mode)); });
                term.debug('Proxy mode = ' + mode, 'ProtectionProxy');
            }
            f.addEventListener('change', function () { render(); term.debug('FirstDecorator ' + (f.checked ? 'on' : 'off') + '; tower = ' + tower.textContent, 'Demo'); });
            s.addEventListener('change', function () { render(); term.debug('SecondDecorator ' + (s.checked ? 'on' : 'off') + '; tower = ' + tower.textContent, 'Demo'); });
            t.addEventListener('change', function () { render(); term.debug('ThirdDecorator ' + (t.checked ? 'on' : 'off') + '; tower = ' + tower.textContent, 'Demo'); });
            runBaseBtn.addEventListener('click', runBase);
            runDecoBtn.addEventListener('click', runDecorated);
            proxyRunBtn.addEventListener('click', runProxyCompare);
            proxyModeBtns.forEach(function (b) {
                b.addEventListener('click', function () { setProxyMode(b.getAttribute('data-proxy-mode')); });
            });
            host.querySelector('[data-clear]').addEventListener('click', function () { term.clear(); });
            render();
            term.info('BaseService ready; decorators are optional wrappers', 'BaseService');
            term.info('tower = ' + tower.textContent, 'Demo');
            term.info('Proxy comparison: allow/deny — управление вызовом, а не расширение', 'ProtectionProxy');
        },
        code: [
            { file: 'BaseService.java', pkg: 'baileyes.eyes.decorator.service', src:
                    `package baileyes.eyes.decorator.service;

import baileyes.eyes.decorator.dto.RandomDataDTO;
import baileyes.eyes.decorator.service.decorator.impl.FirstDecorator;
import baileyes.eyes.decorator.service.decorator.impl.SecondDecorator;
import baileyes.eyes.decorator.service.decorator.impl.ThirdDecorator;
import org.springframework.stereotype.Service;

@Service
public class BaseService {

    public RandomDataDTO performAction() {
        return new RandomDataDTO("Base Service Data");
    }

    public RandomDataDTO performDecoratedAction() {
        return performDecoratedAction(true, true, true);
    }

    public RandomDataDTO performDecoratedAction(boolean withFirst, boolean withSecond, boolean withThird) {
        BaseService service = this;

        if (withFirst) {
            service = new FirstDecorator(service);
        }
        if (withSecond) {
            service = new SecondDecorator(service);
        }
        if (withThird) {
            service = new ThirdDecorator(service);
        }

        return service.performAction();
    }
}` },
            { file: 'BaseServiceDecorator.java', pkg: 'baileyes.eyes.decorator.service.decorator', src:
                    `package baileyes.eyes.decorator.service.decorator;

import baileyes.eyes.decorator.dto.RandomDataDTO;
import baileyes.eyes.decorator.service.BaseService;

public abstract class BaseServiceDecorator extends BaseService {

    protected BaseService baseService;

    protected BaseServiceDecorator(BaseService baseService) {
        this.baseService = baseService;
    }

    @Override
    public RandomDataDTO performAction() {
        return baseService.performAction();
    }
}` },
            { file: 'FirstDecorator.java', pkg: 'baileyes.eyes.decorator.service.decorator.impl', src:
                    `package baileyes.eyes.decorator.service.decorator.impl;

import baileyes.eyes.decorator.dto.RandomDataDTO;
import baileyes.eyes.decorator.service.BaseService;
import baileyes.eyes.decorator.service.decorator.BaseServiceDecorator;

public class FirstDecorator extends BaseServiceDecorator {

    public FirstDecorator(BaseService baseService) {
        super(baseService);
    }

    @Override
    public RandomDataDTO performAction() {
        RandomDataDTO result = super.performAction();
        result.setData(result.getData().concat(" First Decorator Data"));
        return result;
    }
}` },
            { file: 'SecondDecorator.java', pkg: 'baileyes.eyes.decorator.service.decorator.impl', src:
                    `package baileyes.eyes.decorator.service.decorator.impl;

import baileyes.eyes.decorator.dto.RandomDataDTO;
import baileyes.eyes.decorator.service.BaseService;
import baileyes.eyes.decorator.service.decorator.BaseServiceDecorator;

public class SecondDecorator extends BaseServiceDecorator {

    public SecondDecorator(BaseService baseService) {
        super(baseService);
    }

    @Override
    public RandomDataDTO performAction() {
        RandomDataDTO result = super.performAction();
        result.setData(result.getData().concat(" Second Decorator Data"));
        return result;
    }
}` },
            { file: 'ThirdDecorator.java', pkg: 'baileyes.eyes.decorator.service.decorator.impl', src:
                    `package baileyes.eyes.decorator.service.decorator.impl;

import baileyes.eyes.decorator.dto.RandomDataDTO;
import baileyes.eyes.decorator.service.BaseService;
import baileyes.eyes.decorator.service.decorator.BaseServiceDecorator;

public class ThirdDecorator extends BaseServiceDecorator {

    public ThirdDecorator(BaseService baseService) {
        super(baseService);
    }

    @Override
    public RandomDataDTO performAction() {
        RandomDataDTO result = super.performAction();
        result.setData(result.getData().concat(" Third Decorator Data"));
        return result;
    }
}` },
            { file: 'RandomDataDTO.java', pkg: 'baileyes.eyes.decorator.dto', src:
                    `package baileyes.eyes.decorator.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Setter @Getter @Builder @NoArgsConstructor @AllArgsConstructor
public class RandomDataDTO {

    private String data;
}` }
        ]
    });

    /* ===== 7. FACADE ===== */
    App.registerPattern('facade', {
        title: 'Facade + async composition', subtitle: 'Facade.performTasks() = taskA.thenCombine(taskB): итог = max(A, B), а не сумма', category: 'structural',
        javaClasses: ['Facade', 'SubsystemA', 'SubsystemB', 'AsyncService', 'CustomAsyncConfig'],
        essence: '<p><strong>Facade</strong> — единая точка входа к группе подсистем: клиент вызывает <code>asyncService.executeAsyncTasks()</code>, ' +
            'а фасад сам запускает <code>SubsystemA</code> и <code>SubsystemB</code>, объединяет результаты через ' +
            '<code>taskA.thenCombine(taskB, ...)</code> и отдаёт один <code>CompletableFuture</code>.</p>' +
            '<ul class="facade-why">' +
            '<li><b>Меньше знаний у клиента:</b> один вызов вместо знания двух подсистем, порядка запуска и правил слияния.</li>' +
            '<li><b>Слабая связанность:</b> клиент зависит от фасада, а не от <code>SubsystemA/B</code> — подсистему можно заменить или разделить.</li>' +
            '<li><b>Композиция в одном месте:</b> параллельность, объединение результатов и обработка ошибок живут внутри фасада.</li>' +
            '<li><b>Производительность:</b> подсистемы запускаются параллельно, поэтому итог — <code>max(A, B)</code>, а не сумма.</li>' +
            '</ul>',
        diagram: function (host) {
            var u = new Uml(820, 250);
            u.box(20, 30, 210, 'AsyncService', '@Service @Async', ['+ executeAsyncTasks()'], 'spring');
            u.box(300, 25, 210, 'Facade', '@Component', ['+ performTasks() : CompletableFuture<String>'], 'spring');
            u.box(250, 150, 150, 'SubsystemA', '@Component', ['+ performTaskA()', 'sleep(2000)'], 'spring');
            u.box(430, 150, 150, 'SubsystemB', '@Component', ['+ performTaskB()', 'sleep(2000)'], 'spring');
            u.box(620, 25, 180, 'CustomAsyncConfig', '@Configuration', ['taskExecutor'], 'spring');
            u.arrow(230, 58, 300, 58, 'assoc', 'DI');
            u.arrow(360, 96, 320, 150, 'assoc', 'taskA');
            u.arrow(450, 96, 505, 150, 'assoc', 'taskB');
            put(host, u, 'Фасад — единая точка входа, скрывает и подсистемы, и композицию CompletableFuture.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls facade-controls">' +
                '<div class="field facade-dur"><label for="fcDurA">SubsystemA · <b id="fcDurAVal">2000 ms</b></label>' +
                '<input type="range" id="fcDurA" min="500" max="3000" step="250" value="2000"></div>' +
                '<div class="field facade-dur"><label for="fcDurB">SubsystemB · <b id="fcDurBVal">1500 ms</b></label>' +
                '<input type="range" id="fcDurB" min="500" max="3000" step="250" value="1500"></div>' +
                '<label class="switch"><input type="checkbox" id="fcSeq"><span class="track"></span>последовательно</label>' +
                '<button class="btn primary" type="button" data-run>▶ Facade.performTasks()</button>' +
                '<button class="btn ghost sm" type="button" data-clear>очистить</button>' +
                '</div>' +
                '<div class="two-col facade-top">' +
                '<div class="panel facade-client-panel">' +
                '<div class="facade-run-head"><div><span class="panel-title">Что делает клиент</span><h4>Фасад прячет подсистемы и их склейку</h4></div></div>' +
                '<div class="facade-client-grid">' +
                '<div class="facade-client-card bad">' +
                '<div class="fcc-head"><span>без Facade</span><b>3 шага</b></div>' +
                '<div class="facade-code">var a = subsystemA.performTaskA();\nvar b = subsystemB.performTaskB();\nreturn a.thenCombine(b, (x, y) -&gt; x + " | " + y);</div>' +
                '<div class="fcc-foot">клиент знает 2 подсистемы, порядок вызовов, слияние и обработку ошибок</div>' +
                '</div>' +
                '<div class="facade-client-card good" id="fcClientGood">' +
                '<div class="fcc-head"><span>с Facade</span><b>1 вызов</b></div>' +
                '<div class="facade-code">return asyncService\n    .executeAsyncTasks();</div>' +
                '<div class="fcc-foot">клиент знает только фасад; подсистемы можно менять внутри</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="panel facade-term-panel"><h4>Лог фасада</h4><div id="fcTerm"></div></div>' +
                '</div>' +
                '<div class="panel facade-run-panel">' +
                '<div class="facade-run-head"><div><span class="panel-title">Выполнение</span><h4>Параллельно итог = max(A, B), последовательно = A + B</h4></div>' +
                '<span class="facade-badge ok" id="fcModeBadge">parallel · max(A, B)</span></div>' +
                '<div class="facade-gantt" id="fcGantt"></div>' +
                '<div class="facade-metrics">' +
                '<div class="fm"><span>SubsystemA</span><b id="fcMsA">0 ms</b></div>' +
                '<div class="fm"><span>SubsystemB</span><b id="fcMsB">0 ms</b></div>' +
                '<div class="fm"><span>Итого</span><b id="fcTotal">—</b></div>' +
                '<div class="fm win"><span>Выигрыш</span><b id="fcWin">—</b></div>' +
                '</div>' +
                '<div class="factory-out" id="fcOut" role="status" aria-live="polite"><p class="hint">Фасад сам запускает A и B, ждёт обе и возвращает один результат. Подвиньте ползунки: параллельный итог равен <b>max(A, B)</b>, а не сумме.</p></div>' +
                '</div>' +
                '<div class="decorator-benefits">' +
                '<div class="dc-benefit"><b>1 вызов вместо N</b><span>клиент не собирает подсистемы вручную</span></div>' +
                '<div class="dc-benefit"><b>Скрывает сложность</b><span>порядок, параллельность и merge — внутри фасада</span></div>' +
                '<div class="dc-benefit"><b>Слабая связанность</b><span>меняем SubsystemA/B, клиент не меняется</span></div>' +
                '<div class="dc-benefit"><b>Итог = max(A, B)</b><span>A и B идут параллельно, а не складываются во времени</span></div>' +
                '</div>';
            var term = ctx.terminal('baileyes.eyes.facade');
            host.querySelector('#fcTerm').appendChild(term.node);
            var durA = 2000, durB = 1500, running = false;
            var durAEl = host.querySelector('#fcDurA'), durBEl = host.querySelector('#fcDurB');
            var durAVal = host.querySelector('#fcDurAVal'), durBVal = host.querySelector('#fcDurBVal');
            var seq = host.querySelector('#fcSeq'), out = host.querySelector('#fcOut');
            var gantt = host.querySelector('#fcGantt'), badge = host.querySelector('#fcModeBadge');
            var goodCard = host.querySelector('#fcClientGood');
            var msA = host.querySelector('#fcMsA'), msB = host.querySelector('#fcMsB');
            var totalEl = host.querySelector('#fcTotal'), winEl = host.querySelector('#fcWin');
            var runBtn = host.querySelector('[data-run]');
            var barA, barB, barTotal;

            function isParallel() { return !seq.checked; }
            function ratio() { return (durA + durB) / Math.max(durA, durB); }
            function ratioText() { return ratio().toFixed(1).replace(/\.0$/, '') + '×'; }
            function sum() { return durA + durB; }
            function plan() {
                var parallel = isParallel();
                return {
                    parallel: parallel,
                    max: sum(),
                    total: parallel ? Math.max(durA, durB) : sum(),
                    bStart: parallel ? 0 : durA
                };
            }
            function renderGantt() {
                var p = plan();
                gantt.innerHTML =
                    '<div class="facade-row"><span class="nm">SubsystemA</span><div class="facade-track"><i class="facade-bar a" id="fcBarA"></i></div></div>' +
                    '<div class="facade-row"><span class="nm">SubsystemB</span><div class="facade-track"><i class="facade-bar b" id="fcBarB"></i></div></div>' +
                    '<div class="facade-row"><span class="nm">Facade total</span><div class="facade-track"><i class="facade-bar total" id="fcBarTotal"></i></div></div>' +
                    '<div class="facade-axis">' +
                    '<span class="start">0</span>' +
                    '<span class="mid" style="left:' + (durA / p.max * 100) + '%">' + durA + ' ms</span>' +
                    '<span class="end">' + p.max + ' ms</span>' +
                    '</div>';
                barA = gantt.querySelector('#fcBarA');
                barB = gantt.querySelector('#fcBarB');
                barTotal = gantt.querySelector('#fcBarTotal');
                resetBars();
            }
            function resetBars() {
                if (!barA) return;
                var p = plan();
                barA.style.left = '0%';
                barA.style.width = '0%';
                barB.style.left = (p.bStart / p.max * 100) + '%';
                barB.style.width = '0%';
                barTotal.style.left = '0%';
                barTotal.style.width = '0%';
                msA.textContent = durA + ' ms';
                msB.textContent = durB + ' ms';
                totalEl.textContent = p.total + ' ms';
                winEl.textContent = p.parallel ? ratioText() : '1×';
                badge.textContent = p.parallel ? 'parallel · max(A, B)' : 'sequential · A + B';
                badge.className = 'facade-badge ' + (p.parallel ? 'ok' : 'warn');
            }
            function setBusy(v) {
                running = v;
                runBtn.disabled = v;
                durAEl.disabled = v;
                durBEl.disabled = v;
                seq.disabled = v;
            }
            function run() {
                if (running) return;
                setBusy(true);
                out.innerHTML = '';
                resetBars();
                goodCard.classList.add('is-active');
                var p = plan();
                var aStart = 0, bStart = p.bStart;
                term.info('asyncService.executeAsyncTasks() → Facade.performTasks()', 'Client');
                term.info('SubsystemA.performTaskA() · ' + durA + ' ms' + (p.parallel ? ', параллельно с B' : ''), 'Facade');
                term.info('SubsystemB.performTaskB() · ' + durB + ' ms' + (p.parallel ? ', параллельно с A' : ', после A'), 'Facade');
                var t0 = performance.now();
                var iv = ctx.every(50, function () {
                    var e = performance.now() - t0;
                    var pA = Math.min(Math.max(0, e - aStart), durA);
                    var pB = Math.min(Math.max(0, e - bStart), durB);
                    var pT = Math.min(e, p.total);
                    barA.style.width = (pA / p.max * 100) + '%';
                    barB.style.width = (pB / p.max * 100) + '%';
                    barTotal.style.width = (pT / p.max * 100) + '%';
                    msA.textContent = Math.round(pA) + ' ms';
                    msB.textContent = Math.round(pB) + ' ms';
                    totalEl.textContent = Math.round(pT) + ' ms';
                    winEl.textContent = p.parallel ? ratioText() : '1×';
                });
                ctx.later(p.total, function () {
                    ctx.cancel(iv);
                    var elapsed = Math.round(performance.now() - t0);
                    barA.style.width = (durA / p.max * 100) + '%';
                    barB.style.width = (durB / p.max * 100) + '%';
                    barTotal.style.width = (p.total / p.max * 100) + '%';
                    msA.textContent = durA + ' ms';
                    msB.textContent = durB + ' ms';
                    totalEl.textContent = elapsed + ' ms';
                    winEl.textContent = p.parallel ? ratioText() : '1×';
                    goodCard.classList.remove('is-active');
                    term.ok('thenCombine → "Result A | Result B" · ' + elapsed + ' ms', 'Facade');
                    var saving = Math.round((p.max - elapsed) / p.max * 100);
                    out.innerHTML = '<div class="merge-out">"Result from Subsystem A | Result from Subsystem B"</div>' +
                        '<p class="hint">' + (p.parallel
                            ? 'Фасад дождался самой долгой подсистемы: <b>' + elapsed + ' ms</b> = max(' + durA + ', ' + durB + ') вместо <b>' + p.max + ' ms</b> суммы. Экономия ~' + saving + '%.'
                            : 'Последовательный запуск: A + B = <b>' + elapsed + ' ms</b>. Но клиент всё равно не знает, как устроена оркестрация внутри фасада.') + '</p>';
                    setBusy(false);
                });
            }

            function onSlide() {
                if (running) return;
                durA = Number(durAEl.value);
                durB = Number(durBEl.value);
                durAVal.textContent = durA + ' ms';
                durBVal.textContent = durB + ' ms';
                renderGantt();
                out.innerHTML = '<p class="hint">A = <b>' + durA + ' ms</b>, B = <b>' + durB + ' ms</b>. Параллельно итог будет <b>max = ' + Math.max(durA, durB) + ' ms</b>, последовательно — <b>' + sum() + ' ms</b>.</p>';
            }
            function onMode() {
                if (running) return;
                renderGantt();
                out.innerHTML = '<p class="hint">' + (isParallel()
                    ? 'Параллельно: фасад запускает A и B одновременно и ждёт самую долгую.'
                    : 'Последовательно: фасад ждёт A, затем запускает B.') + '</p>';
            }
            durAEl.addEventListener('input', onSlide);
            durBEl.addEventListener('input', onSlide);
            seq.addEventListener('change', onMode);
            runBtn.addEventListener('click', run);
            host.querySelector('[data-clear]').addEventListener('click', function () { term.clear(); });
            renderGantt();
        },
        code: [
            { file: 'Facade.java', pkg: 'baileyes.eyes.facade', src:
                    `package baileyes.eyes.facade;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Component @RequiredArgsConstructor
public class Facade {

    private final SubsystemA subsystemA;
    private final SubsystemB subsystemB;

    public CompletableFuture<String> performTasks() {
        CompletableFuture<String> taskA = subsystemA.performTaskA();
        CompletableFuture<String> taskB = subsystemB.performTaskB();
        return taskA.thenCombine(taskB, (a, b) -> a + " | " + b);
    }
}` },
            { file: 'SubsystemA.java', pkg: 'baileyes.eyes.facade', src:
                    `package baileyes.eyes.facade;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Slf4j @Component
public class SubsystemA {
    public CompletableFuture<String> performTaskA() {
        return CompletableFuture.supplyAsync(() -> {
            try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            return "Result from Subsystem A";
        });
    }
}` }
        ]
    });

    /* ===== 8. FACTORY ===== */
    App.registerPattern('factory', {
        title: 'Factory Method + Abstract Factory', subtitle: 'Factory Method — один продукт; Abstract Factory — согласованная пара CatToy + DogToy', category: 'creational',
        javaClasses: ['PetToy', 'BallToy', 'RopeToy', 'ToyFactory', 'BallToyFactory', 'RopeToyFactory', 'CatToy', 'DogToy', 'PetToyFactory', 'FirstTypeToyFactory', 'ScratcherChewToyFactory', 'CatBall', 'DogBone', 'CatScratcher', 'DogChewToy'],
        essence: '<p><strong>Factory Method</strong> оставляет решение о конкретном продукте подклассу: ' +
            '<code>ToyFactory.someOperation()</code> вызывает <code>createToy()</code> и работает только с интерфейсом <code>PetToy</code>.</p>' +
            '<p><strong>Abstract Factory</strong> создаёт семейство: <code>PetToyFactory</code> объявляет <code>createCatToy()</code> и ' +
            '<code>createDogToy()</code>, а <code>FirstTypeToyFactory</code> / <code>ScratcherChewToyFactory</code> возвращают совместимую пару <code>CatToy + DogToy</code>.</p>',
        diagram: function (host) {
            var fm = new Uml(840, 330);
            fm.box(310, 20, 220, 'ToyFactory', '«abstract»', ['+ createToy() : PetToy', '+ someOperation() : void'], 'abs');
            fm.box(100, 145, 200, 'BallToyFactory', '', ['+ createToy() : PetToy'], '');
            fm.box(540, 145, 200, 'RopeToyFactory', '', ['+ createToy() : PetToy'], '');
            fm.box(320, 145, 200, 'PetToy', '«interface»', ['+ use() : void'], 'iface');
            fm.box(100, 255, 200, 'BallToy', '', ['+ use() : void'], '');
            fm.box(540, 255, 200, 'RopeToy', '', ['+ use() : void'], '');
            fm.arrow(200, 145, 370, 88, 'ext', '');
            fm.arrow(640, 145, 470, 88, 'ext', '');
            fm.arrow(200, 188, 200, 255, 'dep', 'createToy()', 48, 0);
            fm.arrow(640, 188, 640, 255, 'dep', 'createToy()', 48, 0);
            fm.arrow(200, 255, 380, 198, 'impl', '');
            fm.arrow(640, 255, 460, 198, 'impl', '');

            var af = new Uml(900, 445);
            af.box(340, 20, 220, 'PetToyFactory', '«interface»', ['+ createCatToy() : CatToy', '+ createDogToy() : DogToy'], 'iface');
            af.box(100, 135, 260, 'FirstTypeToyFactory', '', ['+ createCatToy() → CatBall', '+ createDogToy() → DogBone'], '');
            af.box(540, 135, 280, 'ScratcherChewToyFactory', '', ['+ createCatToy() → CatScratcher', '+ createDogToy() → DogChewToy'], '');
            af.box(120, 255, 220, 'CatToy', '«interface»', ['+ use() : void'], 'iface');
            af.box(560, 255, 220, 'DogToy', '«interface»', ['+ use() : void'], 'iface');
            af.box(40, 365, 160, 'CatBall', '', ['+ use() : void'], '');
            af.box(240, 365, 180, 'CatScratcher', '', ['+ use() : void'], '');
            af.box(520, 365, 160, 'DogBone', '', ['+ use() : void'], '');
            af.box(720, 365, 170, 'DogChewToy', '', ['+ use() : void'], '');
            af.arrow(230, 135, 390, 88, 'impl', '');
            af.arrow(690, 135, 510, 88, 'impl', '');
            af.arrow(120, 365, 190, 308, 'impl', '');
            af.arrow(330, 365, 280, 308, 'impl', '');
            af.arrow(600, 365, 610, 308, 'impl', '');
            af.arrow(805, 365, 720, 308, 'impl', '');

            host.innerHTML =
                '<div class="uml-stack">' +
                '<div class="uml-block"><h3 class="uml-block-title">Factory Method <span>один продукт, решение в подклассе</span></h3>' +
                fm.html('Factory Method: ToyFactory, BallToyFactory, RopeToyFactory и PetToy', { legend: false }) +
                '<p class="hint">Подклассы возвращают <code>PetToy</code>; <code>someOperation()</code> не знает, какой именно продукт получит.</p></div>' +
                '<div class="uml-block"><h3 class="uml-block-title">Abstract Factory <span>семейство CatToy + DogToy</span></h3>' +
                af.html('Abstract Factory: PetToyFactory, два семейства и четыре продукта') +
                '<p class="hint"><code>FirstTypeToyFactory</code> создаёт <code>CatBall + DogBone</code>, <code>ScratcherChewToyFactory</code> — <code>CatScratcher + DogChewToy</code>.</p></div>' +
                '</div>';
        },
        demo: function (host, ctx) {
            var arrow = '<svg width="58" height="16" aria-hidden="true"><path d="M0,8 H50" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
                '<path d="M48,3 L57,8 L48,13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';
            host.innerHTML =
                '<div class="mini-tabs" role="tablist" aria-label="Режим демонстрации">' +
                '<button class="mini-tab" type="button" role="tab" id="fTabFm" aria-selected="true" aria-controls="fPaneFm" tabindex="0">Factory Method</button>' +
                '<button class="mini-tab" type="button" role="tab" id="fTabAf" aria-selected="false" aria-controls="fPaneAf" tabindex="-1">Abstract Factory</button>' +
                '</div>' +
                '<div class="mini-panel" id="fPaneFm" role="tabpanel" aria-labelledby="fTabFm" tabindex="0">' +
                '<div class="demo-controls align-end">' +
                '<div class="field"><label for="fmFactory">ToyFactory</label>' +
                '<select id="fmFactory"><option value="BallToyFactory">BallToyFactory</option><option value="RopeToyFactory">RopeToyFactory</option></select></div>' +
                '<button class="btn primary" type="button" data-fm>someOperation()</button>' +
                '<button class="btn ghost" type="button" data-fmclear>очистить</button>' +
                '</div>' +
                '<div class="panel">' +
                '<div class="pipe factory-pipe" id="fmFlow">' +
                '<div class="pipe-node" data-fm-node="service"><div class="ord">client</div><div class="nm">ToyProductionService</div><div class="st">execute()</div></div>' +
                '<div class="pipe-arrow with-label" data-fm-arrow="new"><span>new</span>' + arrow + '</div>' +
                '<div class="pipe-node" data-fm-node="factory"><div class="ord">creator</div><div class="nm" id="fmNodeFactory">BallToyFactory</div><div class="st">extends ToyFactory</div></div>' +
                '<div class="pipe-arrow with-label" data-fm-arrow="create"><span>createToy()</span>' + arrow + '</div>' +
                '<div class="pipe-node" data-fm-node="product"><div class="ord">product : PetToy</div><div class="nm" id="fmNodeProduct"><span class="factory-wait">—</span></div><div class="st" id="fmNodeUse">ожидает вызова</div></div>' +
                '</div>' +
                '<div class="factory-out" id="fmOut" role="status" aria-live="polite"><p class="hint">Выберите фабрику и нажмите <code>someOperation()</code>: вызов <code>createToy()</code> уйдёт в подкласс, а вернётся <code>PetToy</code>.</p></div>' +
                '</div>' +
                '<div class="factory-term" id="fmTerm"></div>' +
                '</div>' +
                '<div class="mini-panel" id="fPaneAf" role="tabpanel" aria-labelledby="fTabAf" tabindex="0" hidden>' +
                '<div class="demo-controls align-end">' +
                '<div class="field"><label for="afFactory">PetToyFactory</label>' +
                '<select id="afFactory"><option value="FirstTypeToyFactory">FirstTypeToyFactory</option><option value="ScratcherChewToyFactory">ScratcherChewToyFactory</option></select></div>' +
                '<button class="btn primary" type="button" data-af>execute()</button>' +
                '<button class="btn ghost" type="button" data-afclear>очистить</button>' +
                '</div>' +
                '<div class="panel">' +
                '<div class="af-stage">' +
                '<div class="pipe-node af-factory" data-af-node="factory"><div class="ord">abstract factory</div><div class="nm" id="afNodeFactory">FirstTypeToyFactory</div><div class="st">implements PetToyFactory</div></div>' +
                '<div class="af-pair">' +
                '<div class="af-family-note" id="afFamilyNote">пара ещё не создана</div>' +
                '<div class="af-line"><div class="pipe-arrow with-label" data-af-arrow="cat"><span>createCatToy()</span>' + arrow + '</div>' +
                '<div class="pipe-node af-product empty" data-af-product="cat"><div class="ord">CatToy</div><div class="nm" data-af-cls>—</div><div class="st" data-af-use>ожидает вызова</div></div></div>' +
                '<div class="af-line"><div class="pipe-arrow with-label" data-af-arrow="dog"><span>createDogToy()</span>' + arrow + '</div>' +
                '<div class="pipe-node af-product empty" data-af-product="dog"><div class="ord">DogToy</div><div class="nm" data-af-cls>—</div><div class="st" data-af-use>ожидает вызова</div></div></div>' +
                '</div>' +
                '</div>' +
                '<div class="factory-out" id="afOut" role="status" aria-live="polite"><p class="hint">Выберите семейство и нажмите <code>execute()</code>: одна фабрика создаст оба продукта, и пара всегда будет из одного семейства.</p></div>' +
                '</div>' +
                '<div class="factory-term" id="afTerm"></div>' +
                '</div>';

            var tabs = [host.querySelector('#fTabFm'), host.querySelector('#fTabAf')];
            var panes = [host.querySelector('#fPaneFm'), host.querySelector('#fPaneAf')];
            function selectTab(i, focus) {
                tabs.forEach(function (t, k) {
                    t.setAttribute('aria-selected', String(k === i));
                    t.tabIndex = k === i ? 0 : -1;
                    panes[k].hidden = k !== i;
                });
                if (focus) tabs[i].focus();
            }
            tabs.forEach(function (t, i) {
                t.addEventListener('click', function () { selectTab(i, false); });
                t.addEventListener('keydown', function (e) {
                    var next = null;
                    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
                    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
                    else if (e.key === 'Home') next = 0;
                    else if (e.key === 'End') next = tabs.length - 1;
                    if (next !== null) { e.preventDefault(); selectTab(next, true); }
                });
            });

            var fmTerm = ctx.terminal('baileyes.eyes.factory · Factory Method');
            host.querySelector('#fmTerm').appendChild(fmTerm.node);
            var afTerm = ctx.terminal('baileyes.eyes.factory · Abstract Factory');
            host.querySelector('#afTerm').appendChild(afTerm.node);

            var FM = {
                BallToyFactory: { product: 'BallToy', emoji: '⚽', use: 'Playing with BallToy' },
                RopeToyFactory: { product: 'RopeToy', emoji: '🪢', use: 'Playing with RopeToy' }
            };
            var fmService = host.querySelector('[data-fm-node="service"]');
            var fmFactoryNode = host.querySelector('[data-fm-node="factory"]');
            var fmProductNode = host.querySelector('[data-fm-node="product"]');
            var fmArrowNew = host.querySelector('[data-fm-arrow="new"]');
            var fmArrowCreate = host.querySelector('[data-fm-arrow="create"]');
            var fmNodeFactory = host.querySelector('#fmNodeFactory');
            var fmNodeProduct = host.querySelector('#fmNodeProduct');
            var fmNodeUse = host.querySelector('#fmNodeUse');
            var fmOut = host.querySelector('#fmOut');
            var fmSelect = host.querySelector('#fmFactory');
            var fmRunBtn = host.querySelector('[data-fm]');
            var fmClearBtn = host.querySelector('[data-fmclear]');
            var fmHint = fmOut.innerHTML;
            var fmToken = 0, fmBusy = false;

            function fmClearNodes() {
                [fmService, fmFactoryNode, fmProductNode].forEach(function (n) { n.classList.remove('lit', 'done'); });
                [fmArrowNew, fmArrowCreate].forEach(function (a) { a.classList.remove('lit'); });
            }
            function fmIdle() {
                fmToken++;
                fmBusy = false;
                fmRunBtn.disabled = false;
                fmClearNodes();
                fmNodeProduct.innerHTML = '<span class="factory-wait">—</span>';
                fmNodeUse.textContent = 'ожидает вызова';
                fmOut.innerHTML = fmHint;
            }
            function fmSyncFactory() {
                fmNodeFactory.textContent = fmSelect.value;
            }
            function fmRun() {
                if (fmBusy) return;
                fmIdle();
                fmBusy = true;
                fmRunBtn.disabled = true;
                var token = ++fmToken;
                var f = fmSelect.value, t = FM[f];
                fmService.classList.add('lit');
                fmTerm.info('ToyProductionService.execute()', 'ToyProductionService');
                ctx.later(180, function () {
                    if (token !== fmToken) return;
                    fmService.classList.remove('lit'); fmService.classList.add('done');
                    fmFactoryNode.classList.add('lit');
                    fmArrowNew.classList.add('lit');
                    fmTerm.debug('ToyFactory factory = new ' + f + '()', 'ToyProductionService');
                });
                ctx.later(430, function () {
                    if (token !== fmToken) return;
                    fmFactoryNode.classList.remove('lit'); fmFactoryNode.classList.add('done');
                    fmArrowNew.classList.remove('lit');
                    fmArrowCreate.classList.add('lit');
                    fmProductNode.classList.add('lit');
                    fmNodeProduct.innerHTML = '<span class="factory-emoji">' + t.emoji + '</span> ' + t.product;
                    fmNodeUse.textContent = 'createToy() → new ' + t.product + '()';
                    fmTerm.debug('factory.someOperation()', 'ToyFactory');
                    fmTerm.info('createToy() → new ' + t.product + '()', f);
                });
                ctx.later(780, function () {
                    if (token !== fmToken) return;
                    fmArrowCreate.classList.remove('lit');
                    fmProductNode.classList.remove('lit'); fmProductNode.classList.add('done');
                    fmNodeUse.textContent = 'use() → ' + t.use;
                    fmOut.innerHTML = '<div class="result-card factory-result"><div class="emoji">' + t.emoji + '</div>' +
                        '<div class="meta"><b>' + ctx.esc(t.product) + '</b>' +
                        '<span>PetToy.use() → ' + ctx.esc(t.use) + '</span>' +
                        '<span>создан ' + ctx.esc(f) + '.createToy()</span></div></div>';
                    fmTerm.ok(t.product + '.use(): ' + t.use, t.product);
                    fmBusy = false;
                    fmRunBtn.disabled = false;
                });
            }
            fmSyncFactory();
            fmRunBtn.addEventListener('click', fmRun);
            fmClearBtn.addEventListener('click', function () { fmIdle(); fmTerm.clear(); });
            fmSelect.addEventListener('change', function () { fmIdle(); fmSyncFactory(); });

            var AF = {
                FirstTypeToyFactory: {
                    cat: { cls: 'CatBall', emoji: '🐱', use: 'Playing with Cat Ball' },
                    dog: { cls: 'DogBone', emoji: '🦴', use: 'Playing with Dog Bone' }
                },
                ScratcherChewToyFactory: {
                    cat: { cls: 'CatScratcher', emoji: '🧶', use: 'Using Cat Scratcher' },
                    dog: { cls: 'DogChewToy', emoji: '🐕', use: 'Using Dog Chew Toy' }
                }
            };
            var afFactoryNode = host.querySelector('[data-af-node="factory"]');
            var afFactoryName = host.querySelector('#afNodeFactory');
            var afFamilyNote = host.querySelector('#afFamilyNote');
            var afCards = {
                cat: host.querySelector('[data-af-product="cat"]'),
                dog: host.querySelector('[data-af-product="dog"]')
            };
            var afCls = { cat: afCards.cat.querySelector('[data-af-cls]'), dog: afCards.dog.querySelector('[data-af-cls]') };
            var afUse = { cat: afCards.cat.querySelector('[data-af-use]'), dog: afCards.dog.querySelector('[data-af-use]') };
            var afArrows = { cat: host.querySelector('[data-af-arrow="cat"]'), dog: host.querySelector('[data-af-arrow="dog"]') };
            var afOut = host.querySelector('#afOut');
            var afSelect = host.querySelector('#afFactory');
            var afRunBtn = host.querySelector('[data-af]');
            var afClearBtn = host.querySelector('[data-afclear]');
            var afHint = afOut.innerHTML;
            var afToken = 0, afBusy = false;

            function afClearState() {
                afFactoryNode.classList.remove('lit', 'done');
                [afArrows.cat, afArrows.dog].forEach(function (a) { a.classList.remove('lit'); });
                ['cat', 'dog'].forEach(function (k) {
                    afCards[k].classList.remove('lit', 'done');
                    afCards[k].classList.add('empty');
                    afCls[k].textContent = '—';
                    afUse[k].textContent = 'ожидает вызова';
                });
                afFamilyNote.classList.remove('on');
                afFamilyNote.textContent = 'пара ещё не создана';
                afOut.innerHTML = afHint;
            }
            function afIdle() {
                afToken++;
                afBusy = false;
                afRunBtn.disabled = false;
                afClearState();
            }
            function afSyncFactory() {
                afFactoryName.textContent = afSelect.value;
            }
            function afRun() {
                if (afBusy) return;
                afIdle();
                afBusy = true;
                afRunBtn.disabled = true;
                var token = ++afToken;
                var f = afSelect.value, t = AF[f];
                afFactoryNode.classList.add('lit');
                afTerm.info('PetToyFactoryService.execute()', 'PetToyFactoryService');
                afTerm.debug('PetToyFactory factory = new ' + f + '()', 'PetToyFactoryService');
                ctx.later(260, function () {
                    if (token !== afToken) return;
                    afFactoryNode.classList.remove('lit'); afFactoryNode.classList.add('done');
                    ['cat', 'dog'].forEach(function (k) {
                        var p = t[k];
                        afCards[k].classList.remove('empty'); afCards[k].classList.add('lit');
                        afCls[k].innerHTML = '<span class="factory-emoji">' + p.emoji + '</span> ' + p.cls;
                        afUse[k].textContent = 'use() → ' + p.use;
                        afArrows[k].classList.add('lit');
                    });
                    afFamilyNote.classList.add('on');
                    afFamilyNote.textContent = 'семейство ' + f;
                    afTerm.info('createCatToy() → new ' + t.cat.cls + '()', f);
                    afTerm.info('createDogToy() → new ' + t.dog.cls + '()', f);
                });
                ctx.later(680, function () {
                    if (token !== afToken) return;
                    ['cat', 'dog'].forEach(function (k) {
                        afArrows[k].classList.remove('lit');
                        afCards[k].classList.remove('lit'); afCards[k].classList.add('done');
                    });
                    afOut.innerHTML = '<div class="result-card factory-result"><div class="emoji">' + t.cat.emoji + ' ' + t.dog.emoji + '</div>' +
                        '<div class="meta"><b>' + ctx.esc(f) + '</b>' +
                        '<span>CatToy → ' + ctx.esc(t.cat.cls) + ': ' + ctx.esc(t.cat.use) + '</span>' +
                        '<span>DogToy → ' + ctx.esc(t.dog.cls) + ': ' + ctx.esc(t.dog.use) + '</span></div></div>';
                    afTerm.ok(t.cat.cls + '.use(): ' + t.cat.use, t.cat.cls);
                    afTerm.ok(t.dog.cls + '.use(): ' + t.dog.use, t.dog.cls);
                    afBusy = false;
                    afRunBtn.disabled = false;
                });
            }
            afSyncFactory();
            afRunBtn.addEventListener('click', afRun);
            afClearBtn.addEventListener('click', function () { afIdle(); afTerm.clear(); });
            afSelect.addEventListener('change', function () { afIdle(); afSyncFactory(); });
        },
        code: [
            { file: 'PetToy.java', pkg: 'baileyes.eyes.factory.factory.service', src:
                    `package baileyes.eyes.factory.factory.service;

public interface PetToy {

    void use();
}` },
            { file: 'ToyFactory.java', pkg: 'baileyes.eyes.factory.factory.service', src:
                    `package baileyes.eyes.factory.factory.service;

public abstract class ToyFactory {

    public abstract PetToy createToy();

    public void someOperation() {
        PetToy toy = createToy();
        toy.use();
    }
}` },
            { file: 'BallToyFactory.java', pkg: 'baileyes.eyes.factory.factory.service.impl.creator', src:
                    `package baileyes.eyes.factory.factory.service.impl.creator;

import baileyes.eyes.factory.factory.service.PetToy;
import baileyes.eyes.factory.factory.service.ToyFactory;
import baileyes.eyes.factory.factory.service.impl.BallToy;

public class BallToyFactory extends ToyFactory {

    @Override
    public PetToy createToy() {
        return new BallToy();
    }
}` },
            { file: 'RopeToyFactory.java', pkg: 'baileyes.eyes.factory.factory.service.impl.creator', src:
                    `package baileyes.eyes.factory.factory.service.impl.creator;

import baileyes.eyes.factory.factory.service.PetToy;
import baileyes.eyes.factory.factory.service.ToyFactory;
import baileyes.eyes.factory.factory.service.impl.RopeToy;

public class RopeToyFactory extends ToyFactory {

    @Override
    public PetToy createToy() {
        return new RopeToy();
    }
}` },
            { file: 'CatToy.java', pkg: 'baileyes.eyes.factory.abstractfactory.service', src:
                    `package baileyes.eyes.factory.abstractfactory.service;

public interface CatToy {

    void use();
}` },
            { file: 'DogToy.java', pkg: 'baileyes.eyes.factory.abstractfactory.service', src:
                    `package baileyes.eyes.factory.abstractfactory.service;

public interface DogToy {

    void use();
}` },
            { file: 'PetToyFactory.java', pkg: 'baileyes.eyes.factory.abstractfactory.service', src:
                    `package baileyes.eyes.factory.abstractfactory.service;

public interface PetToyFactory {

    CatToy createCatToy();
    DogToy createDogToy();
}` },
            { file: 'FirstTypeToyFactory.java', pkg: 'baileyes.eyes.factory.abstractfactory.service.impl.factory', src:
                    `package baileyes.eyes.factory.abstractfactory.service.impl.factory;

import baileyes.eyes.factory.abstractfactory.service.CatToy;
import baileyes.eyes.factory.abstractfactory.service.DogToy;
import baileyes.eyes.factory.abstractfactory.service.PetToyFactory;
import baileyes.eyes.factory.abstractfactory.service.impl.CatBall;
import baileyes.eyes.factory.abstractfactory.service.impl.DogBone;

public class FirstTypeToyFactory implements PetToyFactory {

    @Override
    public CatToy createCatToy() {
        return new CatBall();
    }

    @Override
    public DogToy createDogToy() {
        return new DogBone();
    }
}` },
            { file: 'ScratcherChewToyFactory.java', pkg: 'baileyes.eyes.factory.abstractfactory.service.impl.factory', src:
                    `package baileyes.eyes.factory.abstractfactory.service.impl.factory;

import baileyes.eyes.factory.abstractfactory.service.CatToy;
import baileyes.eyes.factory.abstractfactory.service.DogToy;
import baileyes.eyes.factory.abstractfactory.service.PetToyFactory;
import baileyes.eyes.factory.abstractfactory.service.impl.CatScratcher;
import baileyes.eyes.factory.abstractfactory.service.impl.DogChewToy;

public class ScratcherChewToyFactory implements PetToyFactory {

    @Override
    public CatToy createCatToy() {
        return new CatScratcher();
    }

    @Override
    public DogToy createDogToy() {
        return new DogChewToy();
    }
}` },
            { file: 'ToyProductionService.java', pkg: 'baileyes.eyes.factory.factory.service', src:
                    `package baileyes.eyes.factory.factory.service;

import baileyes.eyes.factory.factory.service.impl.creator.BallToyFactory;
import baileyes.eyes.factory.factory.service.impl.creator.RopeToyFactory;
import org.springframework.stereotype.Service;

@Service
public class ToyProductionService {

    public void execute() {
        rope();
        ball();
    }

    private void rope() {
        ToyFactory ropeFactory = new RopeToyFactory();
        ropeFactory.someOperation();
    }

    private void ball() {
        ToyFactory ballFactory = new BallToyFactory();
        ballFactory.someOperation();
    }
}` },
            { file: 'PetToyFactoryService.java', pkg: 'baileyes.eyes.factory.abstractfactory.service.impl.factory.service', src:
                    `package baileyes.eyes.factory.abstractfactory.service.impl.factory.service;

import baileyes.eyes.factory.abstractfactory.service.CatToy;
import baileyes.eyes.factory.abstractfactory.service.DogToy;
import baileyes.eyes.factory.abstractfactory.service.PetToyFactory;
import baileyes.eyes.factory.abstractfactory.service.impl.factory.FirstTypeToyFactory;
import org.springframework.stereotype.Service;

@Service
public class PetToyFactoryService {

    public void execute() {
        PetToyFactory factory = new FirstTypeToyFactory();
        cat(factory);
        dog(factory);
    }

    private void dog(PetToyFactory factory) {
        DogToy dogToy = factory.createDogToy();
        dogToy.use();
    }

    private void cat(PetToyFactory factory) {
        CatToy catToy = factory.createCatToy();
        catToy.use();
    }
}` }
        ]
    });

    /* ===== 9. CIRCUIT-BREAKER ===== */
    App.registerPattern('circuit-breaker', {
        title: 'Circuit-breaker starter', subtitle: 'CircuitBreakerAspect авто-оборачивает service-методы; поле CircuitBreaker отдаёт управление сервису', category: 'infrastructure',
        javaClasses: ['CircuitBreakerAspect', 'Resilience4jConfig'],
        essence: '<p><strong>Зачем Circuit Breaker:</strong> после серии ошибок downstream-сервиса breaker переходит в <code>OPEN</code> и ' +
            'начинает быстро отдавать <code>CallNotPermittedException</code>, не добивая упавший сервис. Через wait-duration — <code>HALF_OPEN</code> ' +
            'и несколько пробных вызовов, затем <code>CLOSED</code>.</p>' +
            '<p><strong>Что делает аспект:</strong> <code>CircuitBreakerAspect</code> оборачивает service-методы в <code>defaultCircuitBreaker</code>. ' +
            'Но если в классе уже есть поле <code>CircuitBreaker</code>, аспект делает <code>pjp.proceed()</code> и не навязывает default-политику: ' +
            'сервис сам вызывает свой breaker с собственными порогами. Именно это показывает переключатель в демо.</p>',
        diagram: function (host) {
            var u = new Uml(880, 320);
            u.box(20, 30, 270, 'CircuitBreakerAspect', '@Aspect @Component', ['- CircuitBreakerRegistry registry', '+ @Around wrapWithCircuitBreaker', '- usesInjectedCircuitBreaker()'], 'spring');
            u.box(350, 30, 230, 'Resilience4jConfig', '@Configuration', ['+ defaultCircuitBreaker()', '+ userDataCircuitBreaker()'], 'spring');
            u.box(630, 30, 220, 'CircuitBreakerRegistry', 'resilience4j', ['+ circuitBreaker(name)'], 'iface');
            u.box(20, 200, 230, 'TargetService', '*.service', ['+ doWork()'], 'spring');
            u.box(310, 200, 300, 'UserDataService', '*.service · есть поле', ['- CircuitBreaker userDataCircuitBreaker', '+ doWork()'], 'spring');
            u.arrow(290, 60, 350, 60, 'dep', '');
            u.arrow(580, 60, 630, 60, 'assoc', 'DI');
            u.arrow(150, 120, 150, 200, 'dep', 'wraps default');
            u.arrow(230, 120, 380, 200, 'dep', 'pjp.proceed()', -10, 8);
            put(host, u, 'Аспект оборачивает только сервисы без поля <code>CircuitBreaker</code>. Если поле есть — сервис сам вызывает нужный breaker, ' +
                'а аспект не создаёт второй слой защиты.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" type="button" data-call>вызвать service.method()</button>' +
                '<button class="btn" type="button" data-burst>10 вызовов подряд</button>' +
                '<label class="switch"><input type="checkbox" id="cbFail"><span class="track"></span>метод падает</label>' +
                '<label class="switch"><input type="checkbox" id="cbInjected"><span class="track"></span>сервис сам держит CircuitBreaker</label>' +
                '<span class="cb-help" tabindex="0" role="button" aria-expanded="false" aria-label="Аспект проверяет поля класса. Если есть поле CircuitBreaker, аспект не оборачивает метод в defaultCircuitBreaker, а делает pjp.proceed. Сервис сам вызывает свой breaker.">?' +
                '<span class="cb-help-body">Аспект проверяет declared fields класса. Если есть поле типа <code>CircuitBreaker</code>, он не навязывает <code>defaultCircuitBreaker</code> и не оборачивает метод второй раз. Сервис сам решает, какой breaker и какие пороги использовать.</span></span>' +
                '<button class="btn ghost sm" type="button" data-reset>сброс</button>' +
                '</div>' +
                '<p class="hint cb-hint" id="cbHint"></p>' +
                '<div class="breaker-stage">' +
                '<div class="panel breaker-box" id="cbBox">' +
                '<h3>Рубильник</h3>' +
                '<div class="cb-active" id="cbActive"></div>' +
                '<svg class="brk-svg" viewBox="0 0 200 150">' +
                '<rect class="brk-body" x="20" y="24" width="160" height="104" rx="10"/>' +
                '<circle cx="60" cy="96" r="7" fill="var(--uml-line)"/>' +
                '<circle cx="150" cy="52" r="7" fill="var(--uml-line)"/>' +
                '<line class="brk-lever" x1="60" y1="96" x2="150" y2="52"/>' +
                '<circle class="brk-lamp" cx="100" cy="42" r="9"/>' +
                '<text x="100" y="122" text-anchor="middle" class="uml-lbl" id="cbName">defaultCircuitBreaker</text>' +
                '</svg>' +
                '<div class="brk-state" id="cbState">CLOSED</div>' +
                '<div class="waitbar"><i id="cbWait"></i></div>' +
                '<div class="cb-config" id="cbConfig"></div>' +
                '</div>' +
                '<div class="breaker-metrics">' +
                '<div class="panel cb-card" id="cbCardDefault">' +
                '<div class="cb-card-head"><span class="cb-name">defaultCircuitBreaker</span><span class="cb-role">aspect</span><em data-active></em></div>' +
                '<div class="metrics" id="cbMetricsDefault"></div>' +
                '</div>' +
                '<div class="panel cb-card" id="cbCardService">' +
                '<div class="cb-card-head"><span class="cb-name">userDataCircuitBreaker</span><span class="cb-role service">service</span><em data-active></em></div>' +
                '<div class="metrics" id="cbMetricsService"></div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="panel cb-how">' +
                '<div class="two-col">' +
                '<div class="cb-how-col">' +
                '<span class="cb-how-tag">без поля CircuitBreaker</span>' +
                '<b>aspect оборачивает сам</b>' +
                '<code>defaultCircuitBreaker.executeCallable(pjp::proceed)</code>' +
                '<p>Работают пороги default-конфига: failureRate 90%, min calls 3, window 5.</p>' +
                '</div>' +
                '<div class="cb-how-col">' +
                '<span class="cb-how-tag">есть поле CircuitBreaker</span>' +
                '<b>aspect пропускает вызов</b>' +
                '<code>if (usesInjectedCircuitBreaker(type)) return pjp.proceed();</code>' +
                '<code>userDataService: userDataCircuitBreaker.executeCallable(...)</code>' +
                '<p>Сервис сам выбирает breaker и пороги: failureRate 50%, min calls 5, window 10.</p>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<p class="hint cb-demo-note">Таймеры wait-duration в демо замедлены для наглядности: в Java-конфиге default — 0.5 с, userData — 1 с.</p>' +
                '<div id="cbTerm" style="margin-top:14px"></div>';
            var term = ctx.terminal('CircuitBreakerAspect');
            host.querySelector('#cbTerm').appendChild(term.node);
            var box = host.querySelector('#cbBox');
            var stateEl = host.querySelector('#cbState');
            var nameEl = host.querySelector('#cbName');
            var activeEl = host.querySelector('#cbActive');
            var configEl = host.querySelector('#cbConfig');
            var waitBar = host.querySelector('#cbWait');
            var hintEl = host.querySelector('#cbHint');
            var cbInjected = host.querySelector('#cbInjected');
            var cbFail = host.querySelector('#cbFail');
            var cardDefault = host.querySelector('#cbCardDefault');
            var cardService = host.querySelector('#cbCardService');
            var metricsDefault = host.querySelector('#cbMetricsDefault');
            var metricsService = host.querySelector('#cbMetricsService');
            var cbHelp = host.querySelector('.cb-help');

            function newBreaker(key, name, role, cfg) {
                return {
                    key: key, name: name, role: role, cfg: cfg,
                    state: 'CLOSED', windowBuf: [], success: 0, failed: 0, notPermitted: 0,
                    openedAt: 0, halfDone: 0, halfFail: 0, waitTimer: null, waitPct: 0
                };
            }
            var DEFAULTS = {
                default: { name: 'defaultCircuitBreaker', role: 'aspect', cfg: { window: 5, minCalls: 3, failureRate: 90, wait: 4000, halfOpenPermitted: 2 } },
                service: { name: 'userDataCircuitBreaker', role: 'service', cfg: { window: 10, minCalls: 5, failureRate: 50, wait: 5000, halfOpenPermitted: 3 } }
            };
            var B = {};
            function resetBreakers() {
                if (B.default && B.default.waitTimer) ctx.cancel(B.default.waitTimer);
                if (B.service && B.service.waitTimer) ctx.cancel(B.service.waitTimer);
                B = {
                    default: newBreaker('default', DEFAULTS.default.name, DEFAULTS.default.role, DEFAULTS.default.cfg),
                    service: newBreaker('service', DEFAULTS.service.name, DEFAULTS.service.role, DEFAULTS.service.cfg)
                };
            }
            resetBreakers();
            function activeBreaker() { return cbInjected.checked ? B.service : B.default; }
            function failureRate(b) {
                if (!b.windowBuf.length) return 0;
                return Math.round(b.windowBuf.filter(function (x) { return !x; }).length / b.windowBuf.length * 100);
            }
            function metric(k, v, c) {
                return '<div class="metric"><div class="k">' + k + '</div><div class="v ' + c + '">' + v + '</div></div>';
            }
            function metricsHtml(b) {
                var fr = failureRate(b);
                return metric('failureRate', fr + '%', fr >= b.cfg.failureRate ? 'bad' : 'good') +
                    metric('buffered', b.windowBuf.length + '/' + b.cfg.window, '') +
                    metric('success', b.success, 'good') +
                    metric('failed', b.failed, b.failed ? 'bad' : '') +
                    metric('notPermitted', b.notPermitted, b.notPermitted ? 'warnc' : '') +
                    metric('state', b.state, b.state === 'OPEN' ? 'bad' : (b.state === 'HALF_OPEN' ? 'warnc' : 'good'));
            }
            function chip(k, v) { return '<span class="cb-chip"><b>' + k + '</b>' + v + '</span>'; }
            function paint() {
                var injected = cbInjected.checked;
                var b = activeBreaker();
                box.className = 'panel breaker-box state-' + b.state;
                stateEl.textContent = b.state;
                nameEl.textContent = b.name;
                waitBar.style.width = (b.waitPct * 100).toFixed(1) + '%';
                activeEl.innerHTML = injected
                    ? '<span class="cb-mode service">service</span> UserDataService → ' + b.name + ' <em>aspect bypassed</em>'
                    : '<span class="cb-mode aspect">aspect</span> ' + b.name + ' <em>@Around</em>';
                configEl.innerHTML = chip('window', b.cfg.window) + chip('min calls', b.cfg.minCalls) +
                    chip('failureRate', b.cfg.failureRate + '%') + chip('wait', (b.cfg.wait / 1000) + ' s') +
                    chip('half-open', b.cfg.halfOpenPermitted);
                metricsDefault.innerHTML = metricsHtml(B.default);
                metricsService.innerHTML = metricsHtml(B.service);
                cardDefault.classList.toggle('is-active', b === B.default);
                cardService.classList.toggle('is-active', b === B.service);
                cardDefault.classList.toggle('is-off', b !== B.default);
                cardService.classList.toggle('is-off', b !== B.service);
                cardDefault.querySelector('[data-active]').textContent = b === B.default ? 'используется' : 'не используется';
                cardService.querySelector('[data-active]').textContent = b === B.service ? 'используется' : 'не используется';
                hintEl.innerHTML = injected
                    ? 'Аспект увидел поле <code>CircuitBreaker</code> и сделал <code>pjp.proceed()</code>. Сервис сам вызывает <code>userDataCircuitBreaker</code> — со своими порогами и метриками.'
                    : 'Аспект автоматически оборачивает service-методы в <code>defaultCircuitBreaker</code>. Включите «сервис сам держит CircuitBreaker», чтобы увидеть, как аспект уступает управление сервису.';
            }
            function to(b, ns, reason) {
                if (b.state === ns) return;
                b.state = ns;
                if (ns === 'OPEN') {
                    b.openedAt = Date.now();
                    b.halfDone = 0;
                    b.halfFail = 0;
                    b.waitPct = 0;
                    term.error('[' + b.name + '] → OPEN: failureRate=' + failureRate(b) + '% (' + reason + ')', 'CB');
                    startWait(b);
                } else if (ns === 'HALF_OPEN') {
                    term.warn('[' + b.name + '] → HALF_OPEN: пробные вызовы', 'CB');
                } else {
                    b.windowBuf = [];
                    term.ok('[' + b.name + '] → CLOSED', 'CB');
                }
                if (b === activeBreaker()) paint();
            }
            function startWait(b) {
                if (b.waitTimer) ctx.cancel(b.waitTimer);
                var t0 = Date.now();
                b.waitTimer = ctx.every(120, function () {
                    var p = (Date.now() - t0) / b.cfg.wait;
                    b.waitPct = Math.min(1, p);
                    if (b === activeBreaker()) waitBar.style.width = (b.waitPct * 100).toFixed(1) + '%';
                    if (p >= 1) {
                        ctx.cancel(b.waitTimer);
                        b.waitTimer = null;
                        b.waitPct = 0;
                        to(b, 'HALF_OPEN', 'wait');
                    }
                });
                ctx.onLeave(function () { if (b.waitTimer) ctx.cancel(b.waitTimer); });
            }
            function call() {
                var injected = cbInjected.checked, fails = cbFail.checked;
                var b = activeBreaker();
                if (b.state === 'OPEN') {
                    var left = b.cfg.wait - (Date.now() - b.openedAt);
                    if (left > 0) {
                        b.notPermitted++;
                        term.error('[' + b.name + '] CallNotPermittedException: ' + (left / 1000).toFixed(1) + ' s left', 'CB');
                        paint();
                        return;
                    }
                    to(b, 'HALF_OPEN', 'wait');
                }
                if (b.state === 'HALF_OPEN') {
                    b.halfDone++;
                    if (fails) {
                        b.halfFail++;
                        b.failed++;
                        term.error('[' + b.name + '] probe failed', 'Target');
                    } else {
                        b.success++;
                        term.ok('[' + b.name + '] probe success', 'Target');
                    }
                    if (b.halfDone >= b.cfg.halfOpenPermitted) {
                        var okRate = (b.halfDone - b.halfFail) / b.halfDone * 100;
                        to(b, okRate >= (100 - b.cfg.failureRate) ? 'CLOSED' : 'OPEN', 'probe');
                    } else paint();
                    return;
                }
                if (injected) {
                    term.debug('aspect: usesInjectedCircuitBreaker()=true → pjp.proceed()', 'CBAspect');
                    term.info('UserDataService: userDataCircuitBreaker.executeCallable(...)', 'Service');
                } else {
                    term.info('aspect: defaultCircuitBreaker.executeCallable(pjp::proceed)', 'CBAspect');
                }
                if (fails) {
                    b.failed++;
                    b.windowBuf.push(false);
                    term.error('RuntimeException: downstream timeout', 'Target');
                } else {
                    b.success++;
                    b.windowBuf.push(true);
                    term.ok('TargetService.doWork() = ok', 'Target');
                }
                if (b.windowBuf.length > b.cfg.window) b.windowBuf.shift();
                paint();
                if (b.windowBuf.length >= b.cfg.minCalls && failureRate(b) >= b.cfg.failureRate) to(b, 'OPEN', 'threshold');
            }
            host.querySelector('[data-call]').addEventListener('click', call);
            host.querySelector('[data-burst]').addEventListener('click', function () {
                var n = 0, iv = ctx.every(180, function () { call(); if (++n >= 10) ctx.cancel(iv); });
            });
            cbInjected.addEventListener('change', function () {
                paint();
                term.info('usesInjectedCircuitBreaker() = ' + cbInjected.checked, 'CBAspect');
                term.info(cbInjected.checked
                    ? 'aspect: pjp.proceed(); теперь работает userDataCircuitBreaker'
                    : 'aspect: снова оборачивает в defaultCircuitBreaker', 'CBAspect');
            });
            cbHelp.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = cbHelp.classList.toggle('open');
                cbHelp.setAttribute('aria-expanded', String(open));
            });
            host.querySelector('[data-reset]').addEventListener('click', function () {
                resetBreakers();
                waitBar.style.width = '0%';
                paint();
                term.clear();
            });
            paint();
            term.info('CircuitBreakerAspect initialized: defaultCircuitBreaker + userDataCircuitBreaker', 'CB');
            term.info('Переключатель «сервис сам держит CircuitBreaker» показывает ветку usesInjectedCircuitBreaker()', 'CB');
        },
        code: [
            { file: 'CircuitBreakerAspect.java', pkg: 'baileyes.eyes.circuitbreaker', src:
                    `package baileyes.eyes.circuitbreaker;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Aspect @Component @RequiredArgsConstructor
public class CircuitBreakerAspect {

    private final CircuitBreakerRegistry registry;
    private final ConcurrentMap<Class<?>, Boolean> cache = new ConcurrentHashMap<>();

    @Pointcut("within(ru.your.project.*.service..*) && !@annotation(CircuitBreaker)")
    public void serviceMethods() {}

    @Around("serviceMethods()")
    public Object wrapWithCircuitBreaker(ProceedingJoinPoint pjp) throws Throwable {
        Class<?> type = pjp.getTarget().getClass();
        if (usesInjectedCircuitBreaker(type)) {
            return pjp.proceed();
        }
        return registry.circuitBreaker("defaultCircuitBreaker").executeCallable(pjp::proceed);
    }

    private boolean usesInjectedCircuitBreaker(Class<?> type) {
        return cache.computeIfAbsent(type, c ->
            Arrays.stream(c.getDeclaredFields())
                  .map(Field::getType)
                  .anyMatch(CircuitBreaker.class::isAssignableFrom));
    }
}` }
        ]
    });

    /* ===== 10. EXCEPTION HANDLER ===== */
    App.registerPattern('exception-handler', {
        title: 'GlobalExceptionHandler', subtitle: '@RestControllerAdvice + @ExceptionHandler: единый JSON вместо стектрейса; @Order решает конфликты', category: 'infrastructure',
        javaClasses: ['GlobalExceptionHandler', 'SecurityExceptionHandler', 'ConflictingSecurityExceptionHandler', 'ErrorResponse'],
        essence: '<p><strong>Суть:</strong> контроллер бросает исключение, <code>@RestControllerAdvice</code> перехватывает его глобально, ' +
            'а <code>@ExceptionHandler(тип)</code> выбирает HTTP-статус и тело <code>ErrorResponse</code>. Клиент получает единый JSON ' +
            'вместо стектрейса.</p>' +
            '<p><strong>Конфликт handler-ов:</strong> если два advice ловят <code>SecurityException</code>, побеждает более приоритетный. ' +
            '<code>@Order(Integer.MIN_VALUE)</code> гарантирует, что важная security-логика не будет перекрыта случайным хендлером коллеги.</p>' +
            '<p><strong>suppressed:</strong> вторичные исключения (например, при закрытии ресурсов в try-with-resources) добавляются к primary через ' +
            '<code>addSuppressed()</code>. <code>buildErrorResponseEntity</code> дописывает их в message и стек, не меняя HTTP-статус.</p>',
        diagram: function (host) {
            var u = new Uml(880, 470);
            u.box(270, 20, 310, 'GlobalExceptionHandler', '@RestControllerAdvice', ['+ handleMissingParams', '+ handleValidationExceptions', '+ handleBadRequestExceptions', '+ handleNullPointerExceptions', '+ handleOther'], 'spring');
            u.box(20, 30, 200, 'MissingServletRequestParameterException', '→ 400', []);
            u.box(20, 110, 200, 'IllegalArgumentException', '→ 400', []);
            u.box(20, 190, 200, 'RuntimeException', '→ 500', []);
            u.box(640, 30, 200, 'ErrorResponse', 'body', ['String message'], 'entity');
            u.box(20, 295, 200, 'SecurityException', 'runtime', ['token expired'], 'abs');
            u.box(260, 270, 300, 'SecurityExceptionHandler', '@Order(Integer.MIN_VALUE)', ['+ handleSecurity → 403', 'audit + no details leaked'], 'spring');
            u.box(260, 370, 300, 'ConflictingSecurityExceptionHandler', '@Order(100)', ['+ handleSecurity → 500', 'leaks ex.getMessage()'], 'abs');
            u.arrow(220, 49, 270, 60, 'dep', '');
            u.arrow(220, 129, 270, 110, 'dep', '');
            u.arrow(220, 209, 270, 160, 'dep', '');
            u.arrow(580, 60, 640, 60, 'dep', 'body');
            u.arrow(220, 315, 260, 300, 'dep', 'MIN', -10, 0);
            u.arrow(220, 315, 260, 400, 'dep', '100', -10, 8);
            put(host, u, 'Обычные исключения идут в <code>GlobalExceptionHandler</code>. Для <code>SecurityException</code> есть два advice: ' +
                'с <code>@Order(Integer.MIN_VALUE)</code> и <code>@Order(100)</code>; побеждает первый. <code>suppressed</code> — вторичные причины, ' +
                'которые не затирают primary.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls ex-controls">' +
                '<div class="field"><span class="lbl">что бросить</span>' +
                '<select id="exKind" style="min-width:290px" aria-label="Что бросить">' +
                '<option value="success">успех 200</option>' +
                '<option value="missing">MissingServletRequestParameterException</option>' +
                '<option value="validation">MethodArgumentNotValidException</option>' +
                '<option value="illegal" selected>IllegalArgumentException</option>' +
                '<option value="npe">NullPointerException</option>' +
                '<option value="security">SecurityException</option>' +
                '<option value="other">RuntimeException</option>' +
                '</select></div>' +
                '<label class="switch"><input type="checkbox" id="exSup"><span class="track"></span>+ suppressed</label>' +
                '<span class="cb-help" tabindex="0" role="button" aria-expanded="false" aria-label="Suppressed — вторичные исключения, которые Java прикрепляет к primary через addSuppressed. Например, при закрытии ресурсов в try-with-resources. Хендлер дописывает их в message, чтобы не потерять причины. HTTP-статус остаётся от primary.">?' +
                '<span class="cb-help-body">Suppressed — вторичные исключения, которые Java прикрепляет к primary через <code>addSuppressed()</code>. Например, при закрытии ресурсов в try-with-resources. Хендлер дописывает их в message, чтобы не потерять причины. HTTP-статус остаётся от primary.</span></span>' +
                '<label class="switch"><input type="checkbox" id="exOrder" checked><span class="track"></span>@Order(Integer.MIN_VALUE)</label>' +
                '<span class="cb-help" tabindex="0" role="button" aria-expanded="false" aria-label="Order на RestControllerAdvice задаёт приоритет advice-классов. Integer.MIN_VALUE — максимальный приоритет. Если два advice ловят SecurityException, победит тот, у кого приоритет выше.">?' +
                '<span class="cb-help-body"><code>@Order</code> на <code>@RestControllerAdvice</code> задаёт приоритет advice-классов. <code>Integer.MIN_VALUE</code> — максимальный приоритет. Если два advice ловят <code>SecurityException</code>, победит тот, у кого приоритет выше.</span></span>' +
                '<button class="btn primary" type="button" data-send>POST /api/demo</button>' +
                '<button class="btn ghost sm" type="button" data-clear>очистить</button>' +
                '</div>' +
                '<p class="hint ex-hint" id="exHint"></p>' +
                '<div class="call-chain ex-flow">' +
                '<span class="cc-node">Controller</span><span class="cc-arr">→</span>' +
                '<span class="cc-node">@RestControllerAdvice</span><span class="cc-arr">→</span>' +
                '<span class="cc-node">@ExceptionHandler</span><span class="cc-arr">→</span>' +
                '<span class="cc-node">ResponseEntity + ErrorResponse</span>' +
                '</div>' +
                '<div class="panel ex-map-panel">' +
                '<div class="ex-map-head"><h3>Карта handler-ов</h3><span>самый конкретный handler; при конфликте — @Order</span></div>' +
                '<div class="ex-map" id="exMap"></div>' +
                '</div>' +
                '<div class="http-split ex-http">' +
                '<div class="stack-col">' +
                '<div class="panel"><h4>Запрос</h4><pre class="json ex-req" id="exReq"></pre></div>' +
                '<div id="exTerm"></div>' +
                '</div>' +
                '<div class="panel" style="padding:0">' +
                '<div class="ex-resp-head"><h4>Ответ</h4><div class="ex-match" id="exMatch">—</div></div>' +
                '<div class="http-resp" style="border:none">' +
                '<div class="http-status" id="exStatus"></div>' +
                '<pre class="json ex-body" id="exBody">{ }</pre>' +
                '<div class="stack ex-stack" id="exStack"></div>' +
                '</div></div>' +
                '</div>' +
                '<div class="panel ex-sup-panel">' +
                '<div class="ex-sup-head"><h4>suppressed: вторичные причины</h4><span class="ex-sup-state" id="exSupState">выключено</span></div>' +
                '<div class="ex-sup-grid">' +
                '<div class="ex-sup-col primary" id="exSupPrimary"></div>' +
                '<div class="ex-sup-col" id="exSup1"><span class="ex-sup-tag">suppressed #1</span><b>IOException: connection reset</b><p>вторичная причина, не затирает primary</p></div>' +
                '<div class="ex-sup-col" id="exSup2"><span class="ex-sup-tag">suppressed #2</span><b>TimeoutException</b><p>тоже сохраняется в ответе</p></div>' +
                '</div>' +
                '<p class="hint ex-sup-note">Java добавляет suppressed через <code>addSuppressed()</code> — например, когда закрытие ресурса падает во время try-with-resources. Хендлер дописывает их в message и stack, но HTTP-статус остаётся от primary.</p>' +
                '</div>' +
                '<div class="panel ex-order-panel">' +
                '<div class="ex-order-head"><h4>Конфликт handler-ов: SecurityException</h4><span class="ex-order-state" id="exOrderState"></span></div>' +
                '<div class="ex-order-grid">' +
                '<div class="ex-handler good" id="exGood">' +
                '<div class="ex-handler-top"><b>SecurityExceptionHandler</b><span class="ex-order-badge">@Order(Integer.MIN_VALUE)</span></div>' +
                '<div class="ex-handler-body"><code>@ExceptionHandler(SecurityException.class)</code><span>403 Forbidden · "Access denied. Security event logged." · no details leaked</span></div>' +
                '<div class="ex-handler-winner" data-winner>победитель</div>' +
                '</div>' +
                '<div class="ex-handler bad" id="exBad">' +
                '<div class="ex-handler-top"><b>ConflictingSecurityExceptionHandler</b><span class="ex-order-badge">@Order(100)</span></div>' +
                '<div class="ex-handler-body"><code>@ExceptionHandler(SecurityException.class)</code><span>500 Internal Server Error · leaks ex.getMessage() · bad logic</span></div>' +
                '<div class="ex-handler-winner" data-winner>перекрыт</div>' +
                '</div>' +
                '</div>' +
                '<p class="hint">Оба advice ловят <code>SecurityException</code>. <code>@Order(Integer.MIN_VALUE)</code> гарантирует, что правильный handler победит, ' +
                'даже если другой разработчик добавит свой с плохой логикой.</p>' +
                '</div>' +
                '<div id="exTerm" class="ex-term"></div>';
            var term = ctx.terminal('GlobalExceptionHandler');
            host.querySelector('#exTerm').appendChild(term.node);
            var reqEl = host.querySelector('#exReq'), stEl = host.querySelector('#exStatus');
            var bodyEl = host.querySelector('#exBody'), stackEl = host.querySelector('#exStack');
            var matchEl = host.querySelector('#exMatch'), mapEl = host.querySelector('#exMap');
            var hintEl = host.querySelector('#exHint');
            var kindEl = host.querySelector('#exKind'), supEl = host.querySelector('#exSup'), orderEl = host.querySelector('#exOrder');
            var supState = host.querySelector('#exSupState');
            var supPrimary = host.querySelector('#exSupPrimary');
            var sup1 = host.querySelector('#exSup1'), sup2 = host.querySelector('#exSup2');
            var orderState = host.querySelector('#exOrderState');
            var goodCard = host.querySelector('#exGood'), badCard = host.querySelector('#exBad');
            var lastKind = null, lastSent = false;

            var CASES = {
                success: { status: 200, name: null, msg: null, handler: '—', advice: '—', order: '—' },
                missing: { status: 400, name: 'MissingServletRequestParameterException', msg: 'Missing request parameter: individualId', handler: 'handleMissingParams', advice: 'GlobalExceptionHandler', order: 'default' },
                validation: { status: 400, name: 'MethodArgumentNotValidException', msg: 'Validation error: name must not be blank', handler: 'handleValidationExceptions', advice: 'GlobalExceptionHandler', order: 'default' },
                illegal: { status: 400, name: 'IllegalArgumentException', msg: 'The provided argument is invalid: Unknown animal type: UNKNOWN', handler: 'handleBadRequestExceptions', advice: 'GlobalExceptionHandler', order: 'default' },
                npe: { status: 500, name: 'NullPointerException', msg: 'Internal server error: null', handler: 'handleNullPointerExceptions', advice: 'GlobalExceptionHandler', order: 'default' },
                security: { status: 403, name: 'SecurityException', msg: 'Access denied: token expired', handler: 'handleSecurity', advice: 'SecurityExceptionHandler', order: 'Integer.MIN_VALUE' },
                other: { status: 500, name: 'RuntimeException', msg: 'Internal server error: unexpected failure', handler: 'handleOther', advice: 'GlobalExceptionHandler', order: 'default' }
            };
            function securityWinner() {
                return orderEl.checked
                    ? { status: 403, name: 'SecurityException', msg: 'Access denied. Security event logged.', handler: 'handleSecurity', advice: 'SecurityExceptionHandler', order: 'Integer.MIN_VALUE', leaked: false }
                    : { status: 500, name: 'SecurityException', msg: 'Security error: /admin: token expired', handler: 'handleSecurity', advice: 'ConflictingSecurityExceptionHandler', order: '100', leaked: true };
            }
            function currentCase() {
                var kind = kindEl.value;
                if (kind === 'security') return securityWinner();
                return CASES[kind];
            }
            function badge(s) {
                var cls = s < 300 ? '2' : (s < 500 ? '4' : '5');
                return '<span class="status-badge s-' + cls + 'xx">' + s + '</span>';
            }
            function statusText(s) {
                return s === 200 ? 'OK' : (s === 400 ? 'Bad Request' : (s === 403 ? 'Forbidden' : 'Internal Server Error'));
            }
            function suppressedLines() {
                return ['java.io.IOException: connection reset', 'TimeoutException'];
            }
            function paintMap() {
                var kind = kindEl.value;
                var win = securityWinner();
                var rows = [
                    ['missing', 'MissingServletRequestParameterException', 400, 'GlobalExceptionHandler.handleMissingParams'],
                    ['validation', 'MethodArgumentNotValidException', 400, 'GlobalExceptionHandler.handleValidationExceptions'],
                    ['illegal', 'IllegalArgumentException', 400, 'GlobalExceptionHandler.handleBadRequestExceptions'],
                    ['npe', 'NullPointerException', 500, 'GlobalExceptionHandler.handleNullPointerExceptions'],
                    ['security', 'SecurityException', win.status, win.advice + '.handleSecurity @Order(' + win.order + ')'],
                    ['other', 'RuntimeException', 500, 'GlobalExceptionHandler.handleOther']
                ];
                mapEl.innerHTML = rows.map(function (r) {
                    var live = r[0] === kind;
                    var statusCls = r[2] < 300 ? '2' : (r[2] < 500 ? '4' : '5');
                    return '<div class="ex-map-row' + (live ? ' is-live' : '') + '" data-k="' + r[0] + '">' +
                        '<span class="ex-map-ex">' + esc(r[1]) + '</span>' +
                        '<span class="ex-map-status s-' + statusCls + 'xx">' + r[2] + '</span>' +
                        '<span class="ex-map-handler">' + esc(r[3]) + '</span></div>';
                }).join('');
            }
            function paintOrder() {
                var on = orderEl.checked;
                orderState.textContent = on
                    ? '@Order(Integer.MIN_VALUE) включён — побеждает безопасный handler'
                    : '@Order выключен — может победить конфликтующий handler';
                orderState.className = 'ex-order-state ' + (on ? 'ok' : 'warn');
                goodCard.classList.toggle('winner', on);
                goodCard.classList.toggle('shadowed', !on);
                badCard.classList.toggle('winner', !on);
                badCard.classList.toggle('shadowed', on);
                goodCard.querySelector('[data-winner]').textContent = on ? 'победитель' : 'перекрыт';
                badCard.querySelector('[data-winner]').textContent = on ? 'перекрыт' : 'победитель — опасно';
            }
            function paintSuppressedPreview() {
                var c = currentCase();
                var on = supEl.checked;
                supState.textContent = on ? '2 вторичные причины' : 'выключено';
                supState.className = 'ex-sup-state ' + (on ? 'on' : 'off');
                sup1.classList.toggle('on', on);
                sup2.classList.toggle('on', on);
                if (kindEl.value === 'success') {
                    supPrimary.innerHTML = '<span class="ex-sup-tag">primary</span><b>—</b><p>исключения нет</p>';
                } else {
                    supPrimary.innerHTML = '<span class="ex-sup-tag">primary</span><b>' + esc(c.name) + '</b><p>' + esc(c.msg) + ' · определяет HTTP-статус</p>';
                }
            }
            function paintHint() {
                var kind = kindEl.value;
                if (kind === 'security') {
                    hintEl.innerHTML = 'SecurityException ловят два advice. <code>@Order(Integer.MIN_VALUE)</code> у правильного handler-а гарантирует 403 и безопасный ответ; конфликтующий handler остаётся перекрытым.';
                } else {
                    hintEl.innerHTML = 'Spring ищет самый конкретный <code>@ExceptionHandler</code>. Если несколько advice ловят одно исключение, порядок решает <code>@Order</code>.';
                }
            }
            function paintAll() {
                paintMap();
                paintOrder();
                paintSuppressedPreview();
                paintHint();
            }
            function resetView() {
                lastSent = false;
                stEl.textContent = '—';
                bodyEl.textContent = '{ }';
                stackEl.textContent = '';
                matchEl.textContent = '—';
                reqEl.textContent = 'POST /api/demo HTTP/1.1\nContent-Type: application/json\n\n{ }';
            }
            function send() {
                var kind = kindEl.value, withSup = supEl.checked;
                var c = currentCase();
                lastKind = kind;
                lastSent = true;
                reqEl.textContent = 'POST /api/demo HTTP/1.1\nContent-Type: application/json\n\n{\n  "scenario": "' + kind + '"\n}';
                stackEl.textContent = '';
                matchEl.textContent = '—';
                if (kind === 'success') {
                    ctx.later(220, function () {
                        term.ok('handled successfully → 200 OK', 'DemoController');
                        stEl.innerHTML = badge(200) + ' OK';
                        bodyEl.innerHTML = App.hlJson('{\n  "status": "OK"\n}');
                        matchEl.innerHTML = '<span class="ex-match-ok">exception не брошен</span>';
                    });
                    return;
                }
                ctx.later(240, function () {
                    var message = c.msg;
                    var sups = suppressedLines();
                    if (withSup) message += sups.map(function (s) { return '\nSuppressed: ' + s; }).join('');
                    stEl.innerHTML = badge(c.status) + ' ' + statusText(c.status);
                    bodyEl.innerHTML = App.hlJson('{\n  "message": "' + message.replace(/\n/g, '\\n') + '"\n}');
                    stackEl.textContent = c.name + ': ' + c.msg + (withSup
                        ? sups.map(function (s) { return '\n\tSuppressed: ' + s; }).join('')
                        : '');
                    matchEl.innerHTML = '<span class="ex-match-handler">' + esc(c.handler) + '</span>' +
                        '<span>' + esc(c.advice) + '</span>' +
                        '<span>@Order(' + esc(c.order) + ')</span>' +
                        '<span>suppressed: ' + (withSup ? sups.length : 0) + '</span>';
                    term.error(c.name + ': ' + c.msg, c.advice);
                    if (kind === 'security') {
                        if (orderEl.checked) {
                            term.info('Spring выбрал SecurityExceptionHandler: @Order(Integer.MIN_VALUE) выше, чем @Order(100)', 'ExceptionHandlerResolver');
                            term.ok('403 Forbidden · audit logged · детали не раскрыты', 'Security');
                        } else {
                            term.error('Победил ConflictingSecurityExceptionHandler: @Order(100) перекрыл правильный handler', 'ExceptionHandlerResolver');
                            term.warn('500 + утечка ex.getMessage(): /admin: token expired', 'Security');
                        }
                    }
                    if (withSup) {
                        term.info('getSuppressed().length = ' + sups.length + ' → дописаны в message, статус не изменён', c.advice);
                    }
                    term.ok('→ ' + c.status + ' ' + statusText(c.status) + ' · ErrorResponse{message}', 'ResponseEntity');
                    paintMap();
                });
            }
            kindEl.addEventListener('change', function () {
                resetView();
                paintAll();
            });
            supEl.addEventListener('change', function () {
                paintSuppressedPreview();
                if (lastSent && lastKind !== 'success') {
                    send();
                }
            });
            orderEl.addEventListener('change', function () {
                paintAll();
                if (lastSent && lastKind === 'security') {
                    send();
                }
            });
            host.querySelector('[data-send]').addEventListener('click', send);
            host.querySelector('[data-clear]').addEventListener('click', function () {
                term.clear();
                resetView();
            });
            Array.prototype.forEach.call(host.querySelectorAll('.cb-help'), function (h) {
                h.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var open = h.classList.toggle('open');
                    h.setAttribute('aria-expanded', String(open));
                });
            });
            paintAll();
            reqEl.textContent = 'POST /api/demo HTTP/1.1\nContent-Type: application/json\n\n{ }';
            stEl.textContent = '—';
            term.info('GlobalExceptionHandler ready: @RestControllerAdvice + @ExceptionHandler', 'GlobalExceptionHandler');
            term.info('suppressed и @Order можно включить в контролах выше', 'Demo');
        },
        code: [
            { file: 'GlobalExceptionHandler.java', pkg: 'baileyes.eyes.exceptionhandler.handler', src:
                    `package baileyes.eyes.exceptionhandler.handler;

import java.util.Arrays;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MissingServletRequestParameterException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<ErrorResponse> handleMissingParams(MissingServletRequestParameterException ex) {
        return build(HttpStatus.BAD_REQUEST, "Missing request parameter: " + ex.getParameterName(), ex);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<ErrorResponse> handleBadRequestExceptions(IllegalArgumentException ex) {
        return build(HttpStatus.BAD_REQUEST, "The provided argument is invalid: " + ex.getMessage(), ex);
    }

    @ExceptionHandler(NullPointerException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ResponseEntity<ErrorResponse> handleNullPointerExceptions(NullPointerException ex) {
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Null Pointer Error: " + ex.getMessage(), ex);
    }

    @ExceptionHandler(Throwable.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ResponseEntity<ErrorResponse> handleOther(Throwable ex) {
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error: " + ex.getMessage(), ex);
    }

    private ResponseEntity<ErrorResponse> build(HttpStatus status, String message, Throwable ex) {
        String fullMessage = Arrays.stream(ex.getSuppressed())
            .map(s -> "\\nSuppressed: " + s)
            .collect(Collectors.joining("", message, ""));

        return ResponseEntity.status(status).body(new ErrorResponse(fullMessage));
    }
}` },
            { file: 'SecurityExceptionHandler.java', pkg: 'baileyes.eyes.exceptionhandler.handler', src:
                    `package baileyes.eyes.exceptionhandler.handler;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
@Order(Integer.MIN_VALUE)
public class SecurityExceptionHandler {

    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ResponseEntity<ErrorResponse> handleSecurity(SecurityException ex) {
        log.warn("Security violation: {}", ex.getMessage());

        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(new ErrorResponse("Access denied. Security event logged."));
    }
}` },
            { file: 'ConflictingSecurityExceptionHandler.java', pkg: 'baileyes.eyes.exceptionhandler.handler', src:
                    `package baileyes.eyes.exceptionhandler.handler;

import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Демонстрационный конфликтующий advice: ловит тот же SecurityException,
 * но с плохой логикой — отдаёт 500 и раскрывает детали ошибки.
 */
@RestControllerAdvice
@Order(100)
public class ConflictingSecurityExceptionHandler {

    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ResponseEntity<ErrorResponse> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("Security error: " + ex.getMessage()));
    }
}` },
            { file: 'ErrorResponse.java', pkg: 'baileyes.eyes.exceptionhandler.handler', src:
                    `package baileyes.eyes.exceptionhandler.handler;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter @Setter @NoArgsConstructor
public class ErrorResponse {

    private String message;

    public ErrorResponse(String message) {
        this.message = message;
    }
}` }
        ]
    });

    /* ===== 11. LOGGER-STARTER ===== */
    App.registerPattern('logger-starter', {
        title: 'Logger-starter', subtitle: 'AspectLogger красит HTTP-логи по методу: GET — зелёный, POST — жёлтый, DELETE — красный', category: 'infrastructure',
        javaClasses: ['AspectLogger', 'LogColor', 'LoggerConfig', 'DemoController', 'DemoService'],
        essence: '<p><strong>AspectLogger</strong> — аспект из стартера: перехватывает пакеты <code>..controller..*</code> и <code>..service..*</code> ' +
            'и пишет <code>[START]</code> / <code>[END]</code> с аргументами, результатом и временем. Бизнес-код не меняется — достаточно подключить зависимость.</p>' +
            '<p><strong>Зачем цвета:</strong> строка окрашивается по смыслу. <code>GET</code> — зелёный, <code>POST</code> — жёлтый, ' +
            '<code>DELETE</code> — красный, вызовы service — синие, исключения — ярко-красные. Ошибку и опасную операцию видно сразу, ' +
            'не читая каждую строку лога.</p>',
        diagram: function (host) {
            var u = new Uml(880, 300);
            u.box(20, 20, 260, 'AspectLogger', '@Aspect @Component', ['+ logController() «@Around»', '+ logService() «@Around»', '- logExecution(…)', '- httpInfo(…): GET/POST/DELETE'], 'spring');
            u.box(330, 20, 210, 'LogColor', 'ANSI-константы', ['GREEN · YELLOW · RED', 'BLUE · MAGENTA · CYAN'], 'abs');
            u.box(590, 20, 250, 'LoggerConfig', '@AutoConfiguration', ['@Bean AspectLogger'], 'spring');
            u.box(20, 175, 260, 'DemoController', '@RestController', ['+ users() «GET»', '+ create() «POST»', '+ delete() «DELETE»'], 'spring');
            u.box(330, 175, 210, 'DemoService', '@Service', ['+ findAll()', '+ create()', '+ delete()'], 'spring');
            u.arrow(280, 55, 330, 55, 'dep', '');
            u.arrow(540, 55, 590, 55, 'dep', '');
            u.arrow(150, 130, 150, 170, 'dep', '');
            u.arrow(250, 130, 400, 170, 'dep', '');
            put(host, u, 'Бизнес-код не изменён: аспект перехватывает <code>within(*..controller..*)</code> и ' +
                '<code>within(*..service..*)</code>, а цвет строки выбирает по HTTP-методу контроллера.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="logger-controls">' +
                '<div class="logger-methods" role="group" aria-label="HTTP-запросы">' +
                '<button class="btn logger-method get" type="button" data-run="GET"><b>GET</b><span>/users</span></button>' +
                '<button class="btn logger-method post" type="button" data-run="POST"><b>POST</b><span>/orders</span></button>' +
                '<button class="btn logger-method del" type="button" data-run="DELETE"><b>DELETE</b><span>/orders/42</span></button>' +
                '<button class="btn logger-method error" type="button" data-run="ERROR"><b>GET</b><span>/orders/404</span></button>' +
                '<span class="logger-press">← нажмите кнопку, чтобы проверить</span>' +
                '</div>' +
                '<div class="logger-switches">' +
                '<label class="switch"><input type="checkbox" id="lgColor" checked><span class="track"></span>ANSI-цвета</label>' +
                '<label class="switch"><input type="checkbox" id="lgAspect" checked><span class="track"></span>AspectLogger</label>' +
                '<button class="btn ghost sm" type="button" data-clear>очистить</button>' +
                '</div>' +
                '</div>' +
                '<div class="two-col logger-top">' +
                '<div class="panel logger-flow-panel">' +
                '<div class="logger-run-head"><div><span class="panel-title">HTTP-запрос</span><h4>Что попадёт в лог</h4></div><span class="logger-status" id="lgStatus">idle</span></div>' +
                '<div class="logger-endpoint">' +
                '<span class="logger-verb get" id="lgVerb">GET</span>' +
                '<code class="logger-path" id="lgPath">/users</code>' +
                '<span class="logger-code" id="lgHttp">—</span>' +
                '</div>' +
                '<div class="call-chain" id="lgChain">' +
                '<span class="cc-node" data-n="ctrl">DemoController</span><span class="cc-arr">→</span>' +
                '<span class="cc-node" data-n="svc">DemoService</span>' +
                '</div>' +
                '<div class="logger-metrics">' +
                '<div><span>запросов</span><b id="lgCount">0</b></div>' +
                '<div><span>ошибок</span><b id="lgErrors">0</b></div>' +
                '<div><span>последний</span><b id="lgLast">—</b></div>' +
                '</div>' +
                '<p class="hint logger-note" id="lgNote">Цвет строки = смысл операции: GET — зелёный, POST — жёлтый, DELETE — красный.</p>' +
                '</div>' +
                '<div class="panel logger-legend-panel">' +
                '<div class="logger-run-head"><div><span class="panel-title">Цветовая схема</span><h4>Зачем красить логи</h4></div></div>' +
                '<ul class="logger-legend">' +
                '<li><span class="lg-chip get">GET</span><span>успешное чтение — зелёный</span></li>' +
                '<li><span class="lg-chip post">POST</span><span>изменение данных — жёлтый</span></li>' +
                '<li><span class="lg-chip del">DELETE</span><span>удаление — красный</span></li>' +
                '<li><span class="lg-chip err">[ERROR]</span><span>исключение — ярко-красный</span></li>' +
                '<li><span class="lg-chip svc">[START] service</span><span>внутренние вызовы — синий</span></li>' +
                '</ul>' +
                '<p class="hint logger-note">Выключите ANSI-цвета: строки станут одинаковыми, и нужный запрос придётся искать по тексту.</p>' +
                '</div>' +
                '</div>' +
                '<div class="panel logger-term-panel"><h4>Консоль</h4><div id="lgTerm"></div></div>' +
                '<div class="decorator-benefits">' +
                '<div class="dc-benefit"><b>Цвет = HTTP-метод</b><span>GET / POST / DELETE различаются с первого взгляда</span></div>' +
                '<div class="dc-benefit"><b>Ошибки не теряются</b><span>ERROR всегда ярко-красный, даже в длинном логе</span></div>' +
                '<div class="dc-benefit"><b>Монохром по запросу</b><span>ANSI можно выключить для файлов и CI</span></div>' +
                '<div class="dc-benefit"><b>Бизнес-код не меняется</b><span>аспект подключается зависимостью стартера</span></div>' +
                '</div>';
            var term = ctx.terminal('AspectLogger · colored console');
            host.querySelector('#lgTerm').appendChild(term.node);
            var colorOn = host.querySelector('#lgColor');
            var aspectOn = host.querySelector('#lgAspect');
            var statusEl = host.querySelector('#lgStatus');
            var verbEl = host.querySelector('#lgVerb');
            var pathEl = host.querySelector('#lgPath');
            var httpEl = host.querySelector('#lgHttp');
            var countEl = host.querySelector('#lgCount');
            var errEl = host.querySelector('#lgErrors');
            var lastEl = host.querySelector('#lgLast');
            var note = host.querySelector('#lgNote');
            var runBtns = Array.prototype.slice.call(host.querySelectorAll('[data-run]'));
            var nodeCtrl = host.querySelector('[data-n="ctrl"]');
            var nodeSvc = host.querySelector('[data-n="svc"]');
            var running = false, count = 0, errCount = 0;
            var EP = {
                GET: { verb: 'GET', path: '/users', cls: 'get', color: 'green', ctrl: 'users()', args: '[]', svc: 'findAll()', result: '[user-1, user-2]', status: '200 OK' },
                POST: { verb: 'POST', path: '/orders', cls: 'post', color: 'yellow', ctrl: 'create(CreateOrderRequest)', args: '[payload]', svc: 'create(payload)', result: 'order-1001', status: '201 Created' },
                DELETE: { verb: 'DELETE', path: '/orders/42', cls: 'del', color: 'red', ctrl: 'delete(42)', args: '[42]', svc: 'delete(42)', result: 'void', status: '204 No Content' },
                ERROR: { verb: 'GET', path: '/orders/404', cls: 'err', color: 'green', ctrl: 'order(404)', args: '[404]', svc: 'findById(404)', result: '', status: '404 Not Found' }
            };
            function colored(text, color) {
                if (!colorOn.checked) return esc(text);
                return '<span class="ansi-' + color + '">' + esc(text) + '</span>';
            }
            function line(color, text) {
                term.raw('<span class="ts">' + ctx.stamp() + '</span> ' + colored(text, color));
            }
            function plain(text) {
                term.raw('<span class="ts">' + ctx.stamp() + '</span> ' + esc(text));
            }
            function lit(which, on, fail) {
                var e = which === 'svc' ? nodeSvc : nodeCtrl;
                e.classList.toggle('lit', !!on);
                e.classList.toggle('fail', !!fail);
            }
            function setBusy(v) {
                running = v;
                runBtns.forEach(function (b) { b.disabled = v; });
            }
            function showEp(ep) {
                verbEl.textContent = ep.verb;
                verbEl.className = 'logger-verb ' + ep.cls;
                pathEl.textContent = ep.path;
            }
            function finish(ep, ms, isError) {
                httpEl.textContent = ep.status;
                httpEl.className = 'logger-code ' + ep.cls;
                lastEl.textContent = ep.status;
                statusEl.textContent = isError ? 'error' : 'done';
                statusEl.className = 'logger-status ' + (isError ? 'err' : 'ok');
                if (!aspectOn.checked) {
                    note.textContent = 'AspectLogger выключен: в логе только строка запроса, без [START]/[END] и времени.';
                } else if (!colorOn.checked) {
                    note.textContent = ep.verb + ' ' + ep.path + ' → ' + ep.status + ' за ' + ms + ' ms; цвет выключен — все строки одинаковые.';
                } else if (isError) {
                    note.textContent = 'Ошибка выделена ярко-красным: в длинном логе её видно без чтения текста.';
                } else {
                    note.textContent = ep.verb + ' ' + ep.path + ' → ' + ep.status + ' за ' + ms + ' ms; строка окрашена по HTTP-методу.';
                }
                lit('ctrl', false);
                lit('svc', false);
                setBusy(false);
            }
            function run(kind) {
                if (running) return;
                var ep = EP[kind];
                setBusy(true);
                showEp(ep);
                httpEl.textContent = '…';
                httpEl.className = 'logger-code';
                statusEl.textContent = 'running';
                statusEl.className = 'logger-status busy';
                lit('ctrl', false);
                lit('svc', false);
                count++;
                if (kind === 'ERROR') errCount++;
                countEl.textContent = count;
                errEl.textContent = errCount;

                if (!aspectOn.checked) {
                    plain(ep.verb + ' ' + ep.path + ' → ' + ep.status);
                    ctx.later(220, function () { finish(ep, 0, kind === 'ERROR'); });
                    return;
                }

                var t0 = performance.now();
                lit('ctrl', true);
                line(ep.color, '[START] ' + ep.verb + ' ' + ep.path + ' · DemoController.' + ep.ctrl + ' args=' + ep.args);
                ctx.later(280, function () {
                    lit('ctrl', false);
                    lit('svc', true);
                    line('blue', '[START] service DemoService.' + ep.svc + ' args=' + ep.args);
                    ctx.later(380, function () {
                        if (kind === 'ERROR') {
                            lit('svc', true, true);
                            line('bright-red', '[ERROR] service DemoService.' + ep.svc + ' threw OrderNotFoundException: order 404 not found');
                            ctx.later(240, function () {
                                var total = Math.round(performance.now() - t0);
                                line('bright-red', '[END]   ' + ep.verb + ' ' + ep.path + ' → ' + ep.status + ' took ' + total + 'ms');
                                finish(ep, total, true);
                            });
                            return;
                        }
                        var inner = Math.round(performance.now() - t0 - 280);
                        lit('svc', false);
                        line('blue', '[END]   service DemoService.' + ep.svc + ' → ' + ep.result + ' took ' + inner + 'ms');
                        ctx.later(200, function () {
                            var total = Math.round(performance.now() - t0);
                            line(ep.color, '[END]   ' + ep.verb + ' ' + ep.path + ' → ' + ep.status + ' took ' + total + 'ms');
                            finish(ep, total, false);
                        });
                    });
                });
            }
            runBtns.forEach(function (b) {
                b.addEventListener('click', function () { run(b.getAttribute('data-run')); });
            });
            host.querySelector('[data-clear]').addEventListener('click', function () { term.clear(); });
            colorOn.addEventListener('change', function () {
                note.textContent = colorOn.checked
                    ? 'Цвет включён: методы, ошибки и service-вызовы различаются с первого взгляда.'
                    : 'Цвет выключен: все строки одинаковые — нужный запрос придётся искать по тексту.';
            });
            aspectOn.addEventListener('change', function () {
                note.textContent = aspectOn.checked
                    ? 'AspectLogger включён: в лог попадут [START]/[END], аргументы и время.'
                    : 'AspectLogger выключен: остаётся только строка запроса, без деталей выполнения.';
            });
            showEp(EP.GET);
            line('bright-blue', 'AspectLogger registered · controller: GET→green POST→yellow DELETE→red · service→blue');
        },
        code: [
            { file: 'AspectLogger.java', pkg: 'baileyes.eyes.loggerstarter.logger', src:
                    `package baileyes.eyes.loggerstarter.logger;

import static baileyes.eyes.loggerstarter.color.LogColor.BLUE;
import static baileyes.eyes.loggerstarter.color.LogColor.BRIGHT_RED;
import static baileyes.eyes.loggerstarter.color.LogColor.CYAN;
import static baileyes.eyes.loggerstarter.color.LogColor.GREEN;
import static baileyes.eyes.loggerstarter.color.LogColor.MAGENTA;
import static baileyes.eyes.loggerstarter.color.LogColor.RED;
import static baileyes.eyes.loggerstarter.color.LogColor.YELLOW;
import static baileyes.eyes.loggerstarter.color.LogColor.paint;

import java.lang.reflect.Method;
import java.util.Arrays;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

@Slf4j
@Aspect
@Component
public class AspectLogger {

    @Pointcut("within(*..controller..*)")
    private void catchController() {
    }

    @Pointcut("within(*..service..*)")
    private void catchService() {
    }

    @Around("catchController()")
    public Object logController(ProceedingJoinPoint joinPoint) throws Throwable {
        HttpInfo http = httpInfo(joinPoint);
        return logExecution(joinPoint, http.label(), http.color);
    }

    @Around("catchService()")
    public Object logService(ProceedingJoinPoint joinPoint) throws Throwable {
        return logExecution(joinPoint, "service", BLUE);
    }

    private Object logExecution(ProceedingJoinPoint joinPoint, String tag, String color) throws Throwable {
        String name = joinPoint.getSignature().getDeclaringType().getSimpleName()
            + "." + joinPoint.getSignature().getName() + "()";
        long start = System.currentTimeMillis();

        log.info(paint(color, "[START] " + tag + " " + name
            + " args=" + Arrays.toString(joinPoint.getArgs())));

        try {
            Object result = joinPoint.proceed();
            long took = System.currentTimeMillis() - start;
            log.info(paint(color, "[END]   " + tag + " " + name
                + " -> " + result + " took " + took + "ms"));
            return result;
        } catch (Throwable throwable) {
            long took = System.currentTimeMillis() - start;
            log.error(paint(BRIGHT_RED, "[ERROR] " + tag + " " + name + " threw "
                + throwable.getClass().getSimpleName() + ": " + throwable.getMessage()
                + " after " + took + "ms"));
            throw throwable;
        }
    }

    private HttpInfo httpInfo(ProceedingJoinPoint joinPoint) {
        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();

        GetMapping get = method.getAnnotation(GetMapping.class);
        if (get != null) {
            return new HttpInfo("GET", firstPath(get.value()), GREEN);
        }
        PostMapping post = method.getAnnotation(PostMapping.class);
        if (post != null) {
            return new HttpInfo("POST", firstPath(post.value()), YELLOW);
        }
        DeleteMapping delete = method.getAnnotation(DeleteMapping.class);
        if (delete != null) {
            return new HttpInfo("DELETE", firstPath(delete.value()), RED);
        }
        PutMapping put = method.getAnnotation(PutMapping.class);
        if (put != null) {
            return new HttpInfo("PUT", firstPath(put.value()), MAGENTA);
        }
        PatchMapping patch = method.getAnnotation(PatchMapping.class);
        if (patch != null) {
            return new HttpInfo("PATCH", firstPath(patch.value()), CYAN);
        }
        return new HttpInfo("HTTP", "", BLUE);
    }

    private String firstPath(String[] values) {
        return values.length == 0 ? "" : values[0];
    }

    private static final class HttpInfo {

        private final String verb;
        private final String path;
        private final String color;

        private HttpInfo(String verb, String path, String color) {
            this.verb = verb;
            this.path = path;
            this.color = color;
        }

        private String label() {
            return path.isEmpty() ? verb : verb + " " + path;
        }
    }
}` },
            { file: 'LogColor.java', pkg: 'baileyes.eyes.loggerstarter.color', src:
                    `package baileyes.eyes.loggerstarter.color;

public final class LogColor {

    public static final String RESET = "\\u001B[0m";
    public static final String YELLOW = "\\u001B[33m";
    public static final String RED = "\\u001B[31m";
    public static final String BLUE = "\\u001B[34m";
    public static final String GREEN = "\\u001B[32m";
    public static final String MAGENTA = "\\u001B[35m";
    public static final String CYAN = "\\u001B[36m";
    public static final String BRIGHT_RED = "\\u001B[91m";

    private LogColor() {
        throw new UnsupportedOperationException("Utility class");
    }

    public static String paint(String color, String log) {
        return color + log + RESET;
    }

    public static String paintGreen(String log) {
        return paint(GREEN, log);
    }

    public static String paintYellow(String log) {
        return paint(YELLOW, log);
    }

    public static String paintRed(String log) {
        return paint(RED, log);
    }
}` },
            { file: 'DemoController.java', pkg: 'baileyes.eyes.loggerstarter.demo.controller', src:
                    `package baileyes.eyes.loggerstarter.demo.controller;

import baileyes.eyes.loggerstarter.demo.service.DemoService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/demo")
@RequiredArgsConstructor
public class DemoController {

    private final DemoService demoService;

    @GetMapping("/users")
    public List<String> users() {
        return demoService.findAll();
    }

    @PostMapping("/orders")
    public String create(@RequestBody String payload) {
        return demoService.create(payload);
    }

    @DeleteMapping("/orders/{id}")
    public void delete(@PathVariable long id) {
        demoService.delete(id);
    }

    @GetMapping("/orders/{id}")
    public String order(@PathVariable long id) {
        return demoService.findById(id);
    }
}` },
            { file: 'DemoService.java', pkg: 'baileyes.eyes.loggerstarter.demo.service', src:
                    `package baileyes.eyes.loggerstarter.demo.service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class DemoService {

    private final Map<Long, String> orders = new ConcurrentHashMap<>();

    public List<String> findAll() {
        return List.of("user-1", "user-2");
    }

    public String create(String payload) {
        long id = orders.size() + 1L;
        orders.put(id, payload);
        return "order-" + id;
    }

    public void delete(long id) {
        orders.remove(id);
    }

    public String findById(long id) {
        String order = orders.get(id);
        if (order == null) {
            throw new OrderNotFoundException(id);
        }
        return order;
    }

    public static class OrderNotFoundException extends RuntimeException {

        public OrderNotFoundException(long id) {
            super("order " + id + " not found");
        }
    }
}` },
            { file: 'LoggerConfig.java', pkg: 'baileyes.eyes.loggerstarter.config', src:
                    `package baileyes.eyes.loggerstarter.config;

import baileyes.eyes.loggerstarter.logger.AspectLogger;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class LoggerConfig {

    @Bean
    public AspectLogger logger() {
        return new AspectLogger();
    }
}` }
        ]
    });

    /* ===== 12. KAFKA-STARTER ===== */
    App.registerPattern('kafka-starter', {
        title: 'Kafka-starter', subtitle: 'acks, ISR, партиции, broadcast и миграция версий consumer-ов', category: 'infrastructure',
        javaClasses: ['KafkaProducerServiceImpl', 'KafkaConsumerServiceImpl', 'KafkaProducerConfiguration', 'KafkaConsumerConfiguration', 'KafkaTopicConfig', 'BroadcastOrderConsumer', 'OrderEventConsumerOld', 'OrderEventConsumerNew'],
        essence: '<p><strong>Producer:</strong> <code>sendIdempotentMessage</code> + транзакции; <code>acks=all</code> ждёт все ISR, ' +
            '<code>min.insync.replicas</code> не даёт подтвердить запись при слишком маленьком ISR. <code>acks=0</code> — at-most-once, ' +
            '<code>acks=all + idempotence</code> — exactly-once для producer-сессии.</p>' +
            '<p><strong>Partitions:</strong> партиция — единица параллелизма. В одной consumer group партиция достаётся максимум одному consumer-у; ' +
            'если consumers больше партиций, лишние простаивают.</p>' +
            '<p><strong>Broadcast:</strong> без общего <code>group.id</code> (или с уникальным group на инстанс) каждый consumer читает все партиции. ' +
            'Это fan-out, а не распределение работы. Для миграции ConsumerOld/ConsumerNew можно временно держать две группы на одном топике.</p>',
        diagram: function (host) {
            var u = new Uml(880, 320);
            u.box(20, 30, 220, 'KafkaProducerServiceImpl', '@Service', ['+ sendIdempotentMessage(…)', 'acks=all · idempotence'], 'spring');
            u.box(300, 30, 260, 'agreements-topic', 'Kafka topic', ['partitions = 3', 'replication.factor = 3', 'min.insync.replicas = 2'], 'entity');
            u.box(620, 30, 220, 'Consumer group', '@KafkaListener', ['group.id = orders', '1 partition → 1 consumer'], 'spring');
            u.box(20, 190, 220, 'KafkaProducerConfiguration', '@Configuration', ['producerFactory()', 'kafkaTemplate()'], 'spring');
            u.box(300, 190, 260, 'KafkaConsumerConfiguration', '@Configuration', ['ConsumerFactory', 'read_committed'], 'spring');
            u.box(620, 190, 220, 'Old / New / Broadcast', 'listeners', ['orders-v1 · orders-v2', 'unique group = fan-out'], 'spring');
            u.arrow(240, 60, 300, 60, 'dep', 'send');
            u.arrow(560, 60, 620, 60, 'dep', 'poll');
            u.arrow(130, 120, 130, 190, 'impl', '');
            u.arrow(430, 120, 430, 190, 'impl', '');
            u.arrow(730, 120, 730, 190, 'impl', '');
            put(host, u, 'Партиции задают параллелизм, consumer group — распределение партиций. Уникальный group на инстанс превращает consumer в broadcast.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<section class="kf-frame">' +
                '<div class="kf-frame-head"><div><span class="kf-kicker">Frame 1 · delivery</span><h3>ACKs, ISR и отказы</h3></div><span class="kf-pill">acks + min.insync.replicas</span></div>' +
                '<div class="demo-controls kf-controls">' +
                '<div class="field"><label for="kfAcks">acks</label><select id="kfAcks"><option value="0">0 · fire-and-forget</option><option value="1">1 · leader</option><option value="all" selected>-1 · all ISR</option></select></div>' +
                '<div class="field"><label for="kfMinIsr">min.insync.replicas</label><select id="kfMinIsr"><option value="1">1</option><option value="2" selected>2</option></select></div>' +
                '<label class="switch"><input type="checkbox" id="kfIdem" checked><span class="track"></span>idempotence=true</label>' +
                '<div class="field"><label for="kfScenario">сценарий</label><select id="kfScenario">' +
                '<option value="ok">всё доступно</option>' +
                '<option value="followerDown">follower down (ISR=2)</option>' +
                '<option value="isrLow">ISR &lt; min.insync.replicas</option>' +
                '<option value="leaderDown">leader down</option>' +
                '<option value="topicMissing">топик не создан</option>' +
                '<option value="producerCrash">producer crash</option>' +
                '<option value="consumerCrash">consumer crash</option>' +
                '</select></div>' +
                '<button class="btn primary" type="button" data-kf-send>▶ send message</button>' +
                '<button class="btn ghost sm" type="button" data-kf-clear>очистить лог</button>' +
                '</div>' +
                '<div class="kf-delivery">' +
                '<div class="kf-node producer" id="kfProducer"><span>producer</span><b>KafkaProducer</b><small data-acks>acks=all</small></div>' +
                '<div class="kf-topic-panel">' +
                '<div class="kf-topic-title">agreements-topic <span>partition 0 · RF=3</span></div>' +
                '<div class="kf-replicas" id="kfReplicas">' +
                '<div class="kf-replica leader" data-r="0"><b>B1</b><span>leader</span><em>ISR</em></div>' +
                '<div class="kf-replica" data-r="1"><b>B2</b><span>follower</span><em>ISR</em></div>' +
                '<div class="kf-replica" data-r="2"><b>B3</b><span>follower</span><em>ISR</em></div>' +
                '</div>' +
                '<div class="kf-topic-foot"><span id="kfIsr">ISR: 3/3</span><span id="kfOffset">offset: —</span></div>' +
                '</div>' +
                '<div class="kf-node consumer" id="kfConsumer"><span>consumer</span><b>@KafkaListener</b><small>group=orders</small></div>' +
                '</div>' +
                '<div class="kf-result"><div class="data-out kf-delivery-out" id="kfOut">—</div><div class="kf-badges" id="kfSemantics"></div></div>' +
                '<p class="hint">acks=0 — не ждём подтверждения; acks=1 — ждём leader; acks=all — ждём все ISR. Если ISR &lt; min.insync.replicas, acks=all даёт NotEnoughReplicasException.</p>' +
                '</section>' +

                '<section class="kf-frame">' +
                '<div class="kf-frame-head"><div><span class="kf-kicker">Frame 2 · partitions</span><h3>Партиции vs consumer-ы в одной группе</h3></div><span class="kf-pill">1 partition → максимум 1 consumer</span></div>' +
                '<div class="demo-controls kf-controls">' +
                '<div class="field"><label for="kfParts">partitions</label><select id="kfParts"><option>3</option><option>4</option><option>6</option></select></div>' +
                '<div class="field"><label for="kfConsumers">consumers in group</label><select id="kfConsumers"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option><option>6</option></select></div>' +
                '<div class="field"><label for="kfPartKey">partition key</label><select id="kfPartKey">' +
                '<option value="">без ключа · round-robin</option>' +
                '<option value="order-42">order-42</option>' +
                '<option value="order-43">order-43</option>' +
                '<option value="user-7">user-7</option>' +
                '</select></div>' +
                '</div>' +
                '<div class="kf-rebalance-bar">' +
                '<button class="btn primary" type="button" data-kf-rebalance>↻ пересобрать группу</button>' +
                '<button class="btn" type="button" data-kf-part-send>▶ отправить сообщение</button>' +
                '<span class="kf-rebalance-state ok" id="kfRebalanceState">STABLE</span>' +
                '</div>' +
                '<div class="kf-part-status" id="kfPartStatus">—</div>' +
                '<div class="kf-assignment" id="kfAssignment"></div>' +
                '<div class="kf-rule">Одна партиция в группе достаётся <b>только одному</b> consumer-у. Два consumer-а не могут читать одну партицию одновременно.</div>' +
                '<p class="hint" id="kfAssignNote"></p>' +
                '<p class="hint kf-rebalance-note" id="kfRebalanceNote">Пока группа стабильна, consumers читают свои партиции. Нажмите «пересобрать группу», чтобы увидеть rebalance.</p>' +
                '<p class="hint kf-partition-note">Без ключа сообщения распределяются по партициям (round-robin). С ключом Kafka делает <code>hash(key) % partitions</code>: одинаковые ключи всегда попадают в одну партицию и читаются в FIFO-порядке.</p>' +
                '</section>' +

                '<section class="kf-frame">' +
                '<div class="kf-frame-head"><div><span class="kf-kicker">Frame 3 · broadcast</span><h3>Без общей consumer group</h3></div><span class="kf-pill">каждый инстанс читает всё</span></div>' +
                '<div class="demo-controls kf-controls">' +
                '<div class="strategy-switch" role="group" aria-label="Режим consumer group">' +
                '<button type="button" data-kf-groupmode="shared" aria-pressed="true">shared group</button>' +
                '<button type="button" data-kf-groupmode="unique" aria-pressed="false">unique group / broadcast</button>' +
                '</div>' +
                '<button class="btn" type="button" data-kf-add-consumer>+ consumer instance</button>' +
                '<button class="btn primary" type="button" data-kf-bc-send>▶ отправить событие</button>' +
                '<button class="btn ghost sm" type="button" data-kf-bc-reset>reset</button>' +
                '</div>' +
                '<div class="kf-broadcast" id="kfBroadcast"></div>' +
                '<div class="kf-code" id="kfGroupCode"></div>' +
                '<p class="hint" id="kfGroupNote"></p>' +
                '</section>' +

                '<section class="kf-frame">' +
                '<div class="kf-frame-head"><div><span class="kf-kicker">Frame 4 · versioning</span><h3>ConsumerOld / ConsumerNew: миграция API</h3></div><span class="kf-pill">same topic · разные обработчики</span></div>' +
                '<div class="demo-controls kf-controls">' +
                '<div class="strategy-switch" role="group" aria-label="Фаза миграции">' +
                '<button type="button" data-kf-phase="old" aria-pressed="true">100% Old</button>' +
                '<button type="button" data-kf-phase="both" aria-pressed="false">Old + New</button>' +
                '<button type="button" data-kf-phase="new" aria-pressed="false">100% New</button>' +
                '</div>' +
                '<button class="btn primary" type="button" data-kf-next>▶ следующее сообщение</button>' +
                '</div>' +
                '<div class="kf-version-grid">' +
                '<div class="kf-version old" id="kfOldCard"><div class="kf-version-head"><b>ConsumerOld</b><span>group=orders-v1</span></div>' +
                '<div class="kf-version-code">amount → legacy DTO\n(total = amount)</div><div class="kf-version-out" id="kfOldOut">—</div></div>' +
                '<div class="kf-version new" id="kfNewCard"><div class="kf-version-head"><b>ConsumerNew</b><span>group=orders-v2</span></div>' +
                '<div class="kf-version-code">amount + currency → new DTO\n(totalCents = amount * 100)</div><div class="kf-version-out" id="kfNewOut">—</div></div>' +
                '</div>' +
                '<div class="kf-version-msg" id="kfVersionMsg">—</div>' +
                '<p class="hint" id="kfVersionNote"></p>' +
                '</section>' +
                '<div id="kfTerm" class="kf-term"></div>';
            var term = ctx.terminal('Kafka starter');
            host.querySelector('#kfTerm').appendChild(term.node);

            /* ---------- Frame 1: delivery ---------- */
            var kfAcks = host.querySelector('#kfAcks'), kfMinIsr = host.querySelector('#kfMinIsr');
            var kfIdem = host.querySelector('#kfIdem'), kfScenario = host.querySelector('#kfScenario');
            var kfProducer = host.querySelector('#kfProducer'), kfConsumer = host.querySelector('#kfConsumer');
            var kfReplicas = host.querySelector('#kfReplicas'), kfIsr = host.querySelector('#kfIsr');
            var kfOffset = host.querySelector('#kfOffset'), kfOut = host.querySelector('#kfOut');
            var kfSemantics = host.querySelector('#kfSemantics'), kfAckLabel = host.querySelector('[data-acks]');
            var kfOffsetCount = 42;
            function repl(i) { return kfReplicas.querySelector('[data-r="' + i + '"]'); }
            function clearReplicas() {
                Array.prototype.forEach.call(kfReplicas.querySelectorAll('.kf-replica'), function (r) {
                    r.className = 'kf-replica';
                    r.querySelector('em').textContent = 'ISR';
                });
            }
            function setScenario() {
                var s = kfScenario.value;
                clearReplicas();
                repl(0).classList.add('leader');
                repl(1).classList.add('follower');
                repl(2).classList.add('follower');
                var isr = 3;
                if (s === 'followerDown') {
                    repl(2).classList.add('down');
                    repl(2).querySelector('em').textContent = 'down';
                    isr = 2;
                } else if (s === 'isrLow') {
                    repl(1).classList.add('down');
                    repl(2).classList.add('down');
                    repl(1).querySelector('em').textContent = 'down';
                    repl(2).querySelector('em').textContent = 'down';
                    isr = 1;
                } else if (s === 'leaderDown') {
                    repl(0).classList.add('down');
                    repl(0).querySelector('em').textContent = 'down';
                    repl(1).classList.add('leader');
                    repl(1).querySelector('span').textContent = 'leader';
                    isr = 2;
                } else if (s === 'topicMissing') {
                    Array.prototype.forEach.call(kfReplicas.querySelectorAll('.kf-replica'), function (r) {
                        r.classList.add('down');
                        r.querySelector('em').textContent = 'no topic';
                    });
                    isr = 0;
                }
                if (s !== 'leaderDown' && s !== 'topicMissing') {
                    repl(1).querySelector('span').textContent = 'follower';
                    repl(1).classList.remove('leader');
                }
                kfIsr.textContent = 'ISR: ' + isr + '/3';
                kfIsr.dataset.isr = isr;
            }
            function semantics() {
                var ack = kfAcks.value, idem = kfIdem.checked, s = kfScenario.value;
                if (s === 'consumerCrash') return 'at-least-once · redelivery';
                if (ack === '0') return 'at-most-once';
                if (ack === 'all' && idem) return 'exactly-once (producer session)';
                return 'at-least-once';
            }
            function paintDeliveryBadges() {
                kfAckLabel.textContent = 'acks=' + kfAcks.value;
                var isr = kfIsr.dataset.isr || '3';
                kfSemantics.innerHTML =
                    '<span class="kf-badge">acks=' + esc(kfAcks.value) + '</span>' +
                    '<span class="kf-badge">ISR ' + esc(isr) + '/3</span>' +
                    '<span class="kf-badge">min.insync=' + esc(kfMinIsr.value) + '</span>' +
                    '<span class="kf-badge ' + (semantics().indexOf('exactly') >= 0 ? 'ok' : (semantics().indexOf('most') >= 0 ? 'warn' : '')) + '">' + esc(semantics()) + '</span>';
            }
            function deliveryResult(msg, cls) {
                kfOut.innerHTML = '<span class="' + (cls || '') + '">' + esc(msg) + '</span>';
            }
            function sendDelivery() {
                var ack = kfAcks.value, minIsr = Number(kfMinIsr.value), idem = kfIdem.checked;
                var sc = kfScenario.value, isr = Number(kfIsr.dataset.isr || 3);
                setScenario();
                isr = Number(kfIsr.dataset.isr || 0);
                kfProducer.classList.remove('active', 'err');
                kfConsumer.classList.remove('active', 'err');
                Array.prototype.forEach.call(kfReplicas.querySelectorAll('.kf-replica'), function (r) { r.classList.remove('ack'); });
                kfProducer.classList.add('active');
                term.info('send(topic=agreements-topic, partition=0, key=order-42)', 'KafkaProducer');
                term.debug('acks=' + ack + ', min.insync.replicas=' + minIsr + ', idempotence=' + idem, 'ProducerConfig');
                if (sc === 'topicMissing') {
                    ctx.later(500, function () {
                        kfProducer.classList.add('err');
                        term.error('UnknownTopicOrPartitionException: agreements-topic', 'Producer');
                        deliveryResult('UnknownTopicOrPartitionException: topic не создан', 'err');
                        paintDeliveryBadges();
                    });
                    return;
                }
                if (sc === 'producerCrash') {
                    ctx.later(450, function () {
                        kfProducer.classList.add('err');
                        term.error('KafkaProducerException: producer closed / transaction aborted', 'Producer');
                        deliveryResult('KafkaProducerException: producer crash', 'err');
                        paintDeliveryBadges();
                    });
                    return;
                }
                if (ack === 'all' && minIsr > isr) {
                    ctx.later(650, function () {
                        kfProducer.classList.add('err');
                        term.error('NotEnoughReplicasException: ISR=' + isr + ', min.insync.replicas=' + minIsr, 'Producer');
                        deliveryResult('NotEnoughReplicasException: ISR=' + isr + ' < min.insync=' + minIsr, 'err');
                        paintDeliveryBadges();
                    });
                    return;
                }
                if (ack === '1') {
                    repl(0).classList.add('ack');
                } else if (ack === 'all') {
                    var idx = 0;
                    function ackReplica() {
                        var reps = Array.prototype.slice.call(kfReplicas.querySelectorAll('.kf-replica:not(.down)'));
                        if (idx < reps.length) { reps[idx].classList.add('ack'); idx++; ctx.later(160, ackReplica); }
                    }
                    ackReplica();
                }
                ctx.later(ack === '0' ? 320 : (ack === '1' ? 560 : 820), function () {
                    kfOffsetCount++;
                    kfOffset.textContent = 'offset: ' + kfOffsetCount;
                    kfProducer.classList.remove('active');
                    kfReplicas.classList.add('delivered');
                    term.ok('delivered offset=' + kfOffsetCount + ' · acks=' + ack + ' · ISR=' + isr + '/3', 'Producer');
                    if (sc === 'consumerCrash') {
                        kfConsumer.classList.add('err');
                        term.error('consumer crash before commit → offset not committed', 'Consumer');
                        deliveryResult('delivered offset=' + kfOffsetCount + '; consumer упал до commit → redelivery', 'warnc');
                    } else {
                        kfConsumer.classList.add('active');
                        term.info('@KafkaListener received partition=0 offset=' + kfOffsetCount, 'Consumer');
                        deliveryResult('delivered offset=' + kfOffsetCount + ' · consumer group=orders', 'ok');
                    }
                    paintDeliveryBadges();
                    term.debug('semantics: ' + semantics(), 'Delivery');
                });
            }
            kfAcks.addEventListener('change', function () { paintDeliveryBadges(); });
            kfMinIsr.addEventListener('change', function () { paintDeliveryBadges(); });
            kfIdem.addEventListener('change', function () { paintDeliveryBadges(); });
            kfScenario.addEventListener('change', function () { setScenario(); kfOffset.textContent = 'offset: —'; kfOut.textContent = '—'; paintDeliveryBadges(); });
            host.querySelector('[data-kf-send]').addEventListener('click', sendDelivery);
            host.querySelector('[data-kf-clear]').addEventListener('click', function () { term.clear(); kfOut.textContent = '—'; });
            setScenario(); paintDeliveryBadges();

            /* ---------- Frame 2: partitions ---------- */
            var kfParts = host.querySelector('#kfParts'), kfConsumers = host.querySelector('#kfConsumers');
            var kfPartKey = host.querySelector('#kfPartKey');
            var kfAssignment = host.querySelector('#kfAssignment'), kfAssignNote = host.querySelector('#kfAssignNote');
            var kfRebalanceState = host.querySelector('#kfRebalanceState');
            var kfRebalanceNote = host.querySelector('#kfRebalanceNote');
            var kfPartStatus = host.querySelector('#kfPartStatus');
            var kfRebalanceBtn = host.querySelector('[data-kf-rebalance]');
            var kfPartSendBtn = host.querySelector('[data-kf-part-send]');
            var rebalancing = false, partSending = false, pendingPartMessage = null, partSeq = 0;
            var kfPartQueues = {}, kfLastByConsumer = {}, noKeySeq = 0;
            function plural(n, one, few, many) {
                var m10 = n % 10, m100 = n % 100;
                if (m10 === 1 && m100 !== 11) return one;
                if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
                return many;
            }
            function setRebalanceState(text, cls) {
                kfRebalanceState.textContent = text;
                kfRebalanceState.className = 'kf-rebalance-state ' + (cls || '');
            }
            function resetPartitionMessages() {
                kfPartQueues = {};
                kfLastByConsumer = {};
                noKeySeq = 0;
            }
            function queueHtml(i, o) {
                var q = kfPartQueues[i] || [];
                if (!q.length) return '<span class="kf-msg-empty">queue empty</span>';
                return q.map(function (m) {
                    return '<span class="kf-msg-chip c' + o + '">' + esc(m.text) + (m.key ? ' · ' + esc(m.key) : '') + '</span>';
                }).join('');
            }
            function renderAssignment(reb) {
                var parts = Number(kfParts.value), cons = Number(kfConsumers.value);
                var active = Math.min(parts, cons);
                var owner = [];
                for (var i = 0; i < parts; i++) owner.push(i % active);
                var left = owner.map(function (o, i) {
                    var ownerHtml = reb
                        ? '<span class="kf-owner rebalancing">…</span>'
                        : '<span class="kf-owner c' + o + '">C' + (o + 1) + '</span>';
                    return '<div class="kf-p-block" data-p="' + i + '"' + (reb ? '' : ' data-owner="' + o + '"') + '>' +
                        '<div class="kf-p-row"><span class="kf-p-id">P' + i + '</span>' + ownerHtml + '</div>' +
                        '<div class="kf-p-msgs" data-msgs="' + i + '">' + queueHtml(i, o) + '</div></div>';
                }).join('');
                var right = '';
                for (var c = 0; c < cons; c++) {
                    var mine = [];
                    for (var p = 0; p < parts; p++) if (owner[p] === c) mine.push('P' + p);
                    var last = kfLastByConsumer[c] || '—';
                    right += '<div class="kf-c-card c' + (c % 6) + (reb ? ' rebalancing' : '') + (mine.length ? '' : ' idle') + '" data-c="' + c + '"><b>C' + (c + 1) + '</b>' +
                        '<span>' + (reb ? 'rebalancing…' : (mine.length ? mine.join(', ') : 'idle')) + '</span>' +
                        '<em>' + (reb ? 'партиции перераспределяются' : (mine.length ? mine.length + ' ' + plural(mine.length, 'партиция', 'партиции', 'партиций') : 'нет партиций')) + '</em>' +
                        '<div class="kf-c-last">last: ' + esc(last) + '</div></div>';
                }
                kfAssignment.innerHTML = '<svg class="kf-links" id="kfLinks" aria-hidden="true"></svg>' +
                    '<div class="kf-assign-col"><h4>Partitions</h4>' + left + '</div>' +
                    '<div class="kf-link-space" aria-hidden="true"></div>' +
                    '<div class="kf-assign-col"><h4>Consumers · group=orders</h4>' + right + '</div>';
                kfAssignment.classList.toggle('rebalancing', !!reb);
                Array.prototype.forEach.call(kfAssignment.querySelectorAll('.kf-p-msgs'), function (q) {
                    q.scrollLeft = q.scrollWidth;
                });
                drawLinks();
                if (reb) {
                    kfAssignNote.textContent = 'Rebalance in progress: consumers не читают сообщения — они заняты перераспределением партиций.';
                    kfRebalanceNote.textContent = 'Consumer не принимает сообщения во время ребалансировки: он занят перераспределением. Сообщения ждут в топике.';
                    return;
                }
                var note;
                if (cons > parts) {
                    var idle = cons - parts;
                    note = idle + ' ' + plural(idle, 'consumer', 'consumer-а', 'consumer-ов') + ' простаивают: партиций меньше, чем consumer-ов. Лишние инстансы не получают работу.';
                } else if (parts > cons) {
                    note = 'У каждого consumer-а несколько партиций: ' + parts + ' partitions / ' + cons + ' consumers. Партиция — единица параллелизма.';
                } else {
                    note = 'Идеально: по одной партиции на consumer, все загружены.';
                }
                kfAssignNote.textContent = note;
                kfRebalanceNote.textContent = 'Пока группа стабильна, consumers читают свои партиции. Нажмите «пересобрать группу», чтобы увидеть rebalance.';
            }
            function drawLinks() {
                var svg = host.querySelector('#kfLinks');
                if (!svg) return;
                if (rebalancing) { svg.innerHTML = ''; return; }
                var cr = kfAssignment.getBoundingClientRect();
                if (!cr.width || !cr.height) return;
                var blocks = kfAssignment.querySelectorAll('.kf-p-block[data-owner]');
                var cards = kfAssignment.querySelectorAll('.kf-c-card');
                var out = '';
                Array.prototype.forEach.call(blocks, function (block) {
                    var owner = Number(block.getAttribute('data-owner'));
                    var card = cards[owner];
                    if (!card) return;
                    var row = block.querySelector('.kf-p-row') || block;
                    var rr = block.getBoundingClientRect(), rowR = row.getBoundingClientRect(), rc = card.getBoundingClientRect();
                    var x1 = rr.right - cr.left, y1 = rowR.top + rowR.height / 2 - cr.top;
                    var x2 = rc.left - cr.left, y2 = rc.top + rc.height / 2 - cr.top;
                    var mid = (x1 + x2) / 2;
                    var cls = 'c' + (owner % 6);
                    var p = block.getAttribute('data-p');
                    out += '<path class="kf-link ' + cls + '" data-p="' + p + '" data-c="' + owner + '" d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) +
                        ' C' + mid.toFixed(1) + ',' + y1.toFixed(1) + ' ' + mid.toFixed(1) + ',' + y2.toFixed(1) +
                        ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) + '"/>';
                    out += '<circle class="kf-link-dot ' + cls + '" cx="' + x1.toFixed(1) + '" cy="' + y1.toFixed(1) + '" r="3.2"/>';
                    out += '<circle class="kf-link-dot ' + cls + '" cx="' + x2.toFixed(1) + '" cy="' + y2.toFixed(1) + '" r="3.2"/>';
                });
                svg.setAttribute('viewBox', '0 0 ' + cr.width + ' ' + cr.height);
                svg.innerHTML = out;
            }
            function deliverPartMessage(key, msg) {
                var parts = Number(kfParts.value);
                var partition = key ? Math.abs(ctx.hashCode(key)) % parts : (noKeySeq++ % parts);
                var target = kfAssignment.querySelector('.kf-p-block[data-p="' + partition + '"]');
                if (!target) { partSending = false; kfPartSendBtn.disabled = false; kfRebalanceBtn.disabled = false; return; }
                var start = kfPartSendBtn.getBoundingClientRect();
                var end = target.getBoundingClientRect();
                var chip = document.createElement('div');
                chip.className = 'kf-fly-msg';
                chip.textContent = msg + (key ? ' · ' + key : '');
                document.body.appendChild(chip);
                chip.style.left = (start.left + start.width / 2) + 'px';
                chip.style.top = (start.top + start.height / 2) + 'px';
                requestAnimationFrame(function () {
                    chip.style.left = (end.left + end.width / 2) + 'px';
                    chip.style.top = (end.top + end.height / 2) + 'px';
                });
                ctx.onLeave(function () { if (chip.parentNode) chip.remove(); });
                ctx.later(600, function () {
                    if (chip.parentNode) chip.remove();
                    var q = kfPartQueues[partition] || (kfPartQueues[partition] = []);
                    q.push({ text: msg, key: key });
                    var active = Math.min(parts, Number(kfConsumers.value));
                    var owner = partition % active;
                    kfLastByConsumer[owner] = msg;
                    renderAssignment(false);
                    var path = kfAssignment.querySelector('.kf-link[data-p="' + partition + '"]');
                    if (path) { path.classList.add('hot'); ctx.later(700, function () { path.classList.remove('hot'); }); }
                    var card = kfAssignment.querySelector('.kf-c-card[data-c="' + owner + '"]');
                    if (card) { card.classList.add('received'); ctx.later(700, function () { card.classList.remove('received'); }); }
                    var block = kfAssignment.querySelector('.kf-p-block[data-p="' + partition + '"]');
                    if (block) { block.classList.add('delivered'); ctx.later(700, function () { block.classList.remove('delivered'); }); }
                    var keyInfo = key
                        ? 'key=' + key + ' → hash % ' + parts + ' = P' + partition
                        : 'без ключа → round-robin';
                    kfPartStatus.className = 'kf-part-status ok';
                    kfPartStatus.textContent = '✔ ' + msg + ' → P' + partition + ' (' + keyInfo + ') · FIFO offset ' + (q.length - 1);
                    term.info(msg + ' → partition ' + partition + ' · ' + keyInfo + ' · offset ' + (q.length - 1), 'Producer');
                    partSending = false;
                    kfPartSendBtn.disabled = false;
                    kfRebalanceBtn.disabled = false;
                });
            }
            function rebalance() {
                if (rebalancing || partSending) return;
                rebalancing = true;
                kfRebalanceBtn.disabled = true;
                kfParts.disabled = true;
                kfConsumers.disabled = true;
                setRebalanceState('REBALANCING…', 'busy');
                kfPartStatus.className = 'kf-part-status warn';
                kfPartStatus.textContent = 'consumer group rebalancing: consumers paused';
                renderAssignment(true);
                term.warn('rebalance started: consumers не читают сообщения, партиции перераспределяются', 'GroupCoordinator');
                ctx.later(1400, function () {
                    rebalancing = false;
                    kfRebalanceBtn.disabled = false;
                    kfParts.disabled = false;
                    kfConsumers.disabled = false;
                    setRebalanceState('STABLE', 'ok');
                    renderAssignment(false);
                    term.ok('rebalance complete: consumers resumed', 'GroupCoordinator');
                    if (pendingPartMessage) {
                        var pending = pendingPartMessage;
                        pendingPartMessage = null;
                        kfPartStatus.className = 'kf-part-status warn';
                        kfPartStatus.textContent = 'rebalance готов · отправляем ' + pending.msg;
                        ctx.later(200, function () {
                            partSending = true;
                            kfPartSendBtn.disabled = true;
                            kfRebalanceBtn.disabled = true;
                            deliverPartMessage(pending.key, pending.msg);
                        });
                    } else {
                        kfPartStatus.className = 'kf-part-status';
                        kfPartStatus.textContent = 'rebalance завершён';
                    }
                });
            }
            function sendPartMessage() {
                partSeq++;
                var msg = 'order-' + partSeq;
                var key = kfPartKey.value;
                if (rebalancing) {
                    pendingPartMessage = { key: key, msg: msg };
                    kfPartStatus.className = 'kf-part-status warn';
                    kfPartStatus.textContent = '⏳ ' + msg + ' → consumer busy rebalancing, сообщение ждёт в топике';
                    term.warn('message waits: consumer group is rebalancing', 'Consumer');
                    return;
                }
                if (partSending) return;
                partSending = true;
                kfPartSendBtn.disabled = true;
                kfRebalanceBtn.disabled = true;
                deliverPartMessage(key, msg);
            }
            kfParts.addEventListener('change', function () { if (!rebalancing) { resetPartitionMessages(); renderAssignment(false); kfPartStatus.textContent = '—'; } });
            kfConsumers.addEventListener('change', function () { if (!rebalancing) { resetPartitionMessages(); renderAssignment(false); kfPartStatus.textContent = '—'; } });
            kfPartKey.addEventListener('change', function () {
                if (!rebalancing) {
                    kfPartStatus.className = 'kf-part-status';
                    kfPartStatus.textContent = kfPartKey.value
                        ? 'ключ ' + kfPartKey.value + ': все сообщения с этим ключом пойдут в одну партицию'
                        : 'без ключа: round-robin по партициям';
                }
            });
            kfRebalanceBtn.addEventListener('click', rebalance);
            kfPartSendBtn.addEventListener('click', sendPartMessage);
            renderAssignment(false);
            if (window.ResizeObserver) {
                var kfResizeObserver = new ResizeObserver(function () { ctx.frame(drawLinks); });
                kfResizeObserver.observe(kfAssignment);
                ctx.onLeave(function () { kfResizeObserver.disconnect(); });
            }
            window.addEventListener('resize', drawLinks);
            ctx.onLeave(function () { window.removeEventListener('resize', drawLinks); });

            /* ---------- Frame 3: broadcast ---------- */
            var kfGroupMode = 'shared', kfBcConsumers = 3, kfBcSeq = 0;
            var kfBroadcast = host.querySelector('#kfBroadcast'), kfGroupCode = host.querySelector('#kfGroupCode');
            var kfGroupNote = host.querySelector('#kfGroupNote');
            var kfGroupBtns = Array.prototype.slice.call(host.querySelectorAll('[data-kf-groupmode]'));
            function renderBroadcast() {
                var html = '';
                for (var c = 0; c < kfBcConsumers; c++) {
                    var parts = kfGroupMode === 'unique' ? 'P0, P1, P2' : (c < 3 ? 'P' + c : 'idle');
                    html += '<div class="kf-bc-card c' + (c % 6) + (parts === 'idle' ? ' idle' : '') + '" data-bc="' + c + '">' +
                        '<div class="kf-bc-head"><b>consumer-' + (c + 1) + '</b><span>' + (kfGroupMode === 'unique' ? 'group=' + (c + 1) + '-uuid' : 'group=orders') + '</span></div>' +
                        '<div class="kf-bc-parts">' + parts.split(', ').map(function (p) { return '<span class="kf-p-chip">' + p + '</span>'; }).join('') + '</div>' +
                        '<div class="kf-bc-last" data-last>—</div></div>';
                }
                kfBroadcast.innerHTML = html;
                kfGroupCode.textContent = kfGroupMode === 'shared'
                    ? 'group.id = "orders"  // партиции делятся между инстансами\nconsumer.subscribe(List.of("order-events"));'
                    : 'group.id = appId + "-" + UUID.randomUUID();  // своя группа на инстанс\nconsumer.subscribe(List.of("order-events"));\n\n// null group возможен только с manual assign:\nconsumer.assign(allPartitions); // без rebalance и auto-commit';
                kfGroupNote.textContent = kfGroupMode === 'shared'
                    ? 'Shared group: партиции делятся между инстансами, нагрузка распределяется. Это не broadcast.'
                    : 'Unique group на каждый инстанс: каждый consumer читает ВСЕ партиции. Это fan-out/broadcast: кэши, инвалидация, аудит. Не для распределения работы.';
                kfGroupBtns.forEach(function (b) {
                    b.setAttribute('aria-pressed', String(b.getAttribute('data-kf-groupmode') === kfGroupMode));
                });
            }
            function sendBroadcast() {
                kfBcSeq++;
                var msg = 'event-' + kfBcSeq;
                var touched = [];
                Array.prototype.forEach.call(kfBroadcast.querySelectorAll('[data-bc]'), function (card, c) {
                    var sharedPart = kfBcSeq % 3;
                    var gets = kfGroupMode === 'unique' || c === sharedPart;
                    if (gets) {
                        var last = card.querySelector('[data-last]');
                        last.textContent = msg + ' · partition ' + (kfGroupMode === 'unique' ? 'P0/P1/P2' : 'P' + sharedPart);
                        card.classList.remove('lit'); void card.offsetWidth; card.classList.add('lit');
                        touched.push('consumer-' + (c + 1));
                    }
                });
                term.info('published ' + msg + ' → ' + (kfGroupMode === 'unique' ? 'все инстансы' : touched.join(', ')), 'Kafka');
            }
            kfGroupBtns.forEach(function (b) {
                b.addEventListener('click', function () { kfGroupMode = b.getAttribute('data-kf-groupmode'); renderBroadcast(); term.debug('group mode = ' + kfGroupMode, 'KafkaConsumer'); });
            });
            host.querySelector('[data-kf-add-consumer]').addEventListener('click', function () {
                if (kfBcConsumers >= 5) return;
                kfBcConsumers++;
                renderBroadcast();
                term.info('new consumer instance started · group=' + (kfGroupMode === 'unique' ? 'unique' : 'orders'), 'KafkaConsumer');
            });
            host.querySelector('[data-kf-bc-send]').addEventListener('click', sendBroadcast);
            host.querySelector('[data-kf-bc-reset]').addEventListener('click', function () {
                kfBcConsumers = 3; kfBcSeq = 0; renderBroadcast();
            });
            renderBroadcast();

            /* ---------- Frame 4: versioning ---------- */
            var kfPhase = 'old', kfMsgSeq = 0;
            var kfOldCard = host.querySelector('#kfOldCard'), kfNewCard = host.querySelector('#kfNewCard');
            var kfOldOut = host.querySelector('#kfOldOut'), kfNewOut = host.querySelector('#kfNewOut');
            var kfVersionMsg = host.querySelector('#kfVersionMsg'), kfVersionNote = host.querySelector('#kfVersionNote');
            var kfPhaseBtns = Array.prototype.slice.call(host.querySelectorAll('[data-kf-phase]'));
            function renderVersioning() {
                var oldOn = kfPhase === 'old' || kfPhase === 'both';
                var newOn = kfPhase === 'both' || kfPhase === 'new';
                kfOldCard.classList.toggle('off', !oldOn);
                kfNewCard.classList.toggle('off', !newOn);
                kfOldCard.classList.toggle('on', oldOn);
                kfNewCard.classList.toggle('on', newOn);
                kfPhaseBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-kf-phase') === kfPhase)); });
                if (kfPhase === 'old') kfVersionNote.textContent = 'ConsumerOld в group=orders-v1. Новый consumer ещё не запущен.';
                else if (kfPhase === 'both') kfVersionNote.textContent = 'Обе группы (orders-v1 и orders-v2) читают один топик и видят все сообщения. Сравниваем обработку; это фаза миграции.';
                else kfVersionNote.textContent = 'ConsumerNew в group=orders-v2. Старую группу orders-v1 можно выключать после проверки.';
            }
            function nextVersionMessage() {
                kfMsgSeq++;
                var amount = 100 + kfMsgSeq * 10;
                var payload = '{"id":' + kfMsgSeq + ',"type":"ORDER","amount":' + amount + ',"currency":"RUB"}';
                kfVersionMsg.textContent = payload;
                var oldOn = kfPhase === 'old' || kfPhase === 'both';
                var newOn = kfPhase === 'both' || kfPhase === 'new';
                if (oldOn) {
                    kfOldOut.textContent = 'legacy v1: order #' + kfMsgSeq + ' · total=' + amount + ' (amount)';
                    term.info('ConsumerOld processed order #' + kfMsgSeq + ' (amount=' + amount + ')', 'ConsumerOld');
                } else {
                    kfOldOut.textContent = '— consumer не запущен';
                }
                if (newOn) {
                    kfNewOut.textContent = 'v2: order #' + kfMsgSeq + ' · totalCents=' + (amount * 100) + ' · RUB';
                    term.info('ConsumerNew processed order #' + kfMsgSeq + ' (amount=' + amount + ', currency=RUB)', 'ConsumerNew');
                } else {
                    kfNewOut.textContent = '— consumer не запущен';
                }
            }
            kfPhaseBtns.forEach(function (b) {
                b.addEventListener('click', function () {
                    kfPhase = b.getAttribute('data-kf-phase');
                    renderVersioning();
                    term.debug('migration phase = ' + kfPhase, 'Demo');
                });
            });
            host.querySelector('[data-kf-next]').addEventListener('click', nextVersionMessage);
            renderVersioning();
            setScenario(); paintDeliveryBadges();
            term.info('Kafka starter ready: delivery, partitions, broadcast, consumer versioning', 'Kafka');
        },
        code: [
            { file: 'KafkaProducerConfiguration.java', pkg: 'baileyes.eyes.kafkastarter.config', src:
                    `package baileyes.eyes.kafkastarter.config;

import java.util.HashMap;
import java.util.Map;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class KafkaProducerConfiguration {

    @Bean
    public KafkaProducer<Object, Object> kafkaIdempotentProducer() {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
        properties.put(ProducerConfig.ACKS_CONFIG, "all");
        properties.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 1);
        properties.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "orders-tx-1");

        KafkaProducer<Object, Object> producer = new KafkaProducer<>(properties);
        producer.initTransactions();
        return producer;
    }
}` },
            { file: 'KafkaConsumerConfiguration.java', pkg: 'baileyes.eyes.kafkastarter.config', src:
                    `package baileyes.eyes.kafkastarter.config;

import java.util.HashMap;
import java.util.Map;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;

public class KafkaConsumerConfiguration {

    public ConsumerFactory<String, String> jsonConsumerFactory() {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, "orders");
        properties.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");
        return new DefaultKafkaConsumerFactory<>(properties);
    }
}` },
            { file: 'KafkaProducerServiceImpl.java', pkg: 'baileyes.eyes.kafkastarter.service.impl', src:
                    `package baileyes.eyes.kafkastarter.service.impl;

import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerRecord;

@RequiredArgsConstructor
public class KafkaProducerServiceImpl<K, V> {

    private final KafkaProducer<K, V> producer;

    public void sendIdempotentMessage(String topic, int partition, K key, V message) {
        try {
            producer.beginTransaction();
            producer.send(new ProducerRecord<>(topic, partition, key, message));
            producer.commitTransaction();
        } catch (RuntimeException ex) {
            producer.abortTransaction();
            throw ex;
        }
    }
}` },
            { file: 'BroadcastOrderConsumer.java', pkg: 'baileyes.eyes.kafkastarter.listener', src:
                    `package baileyes.eyes.kafkastarter.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class BroadcastOrderConsumer {

    @KafkaListener(
        topics = "order-events",
        groupId = "\${spring.application.name}-\${random.uuid}"
    )
    public void consume(String payload) {
        log.info("Broadcast instance received: {}", payload);
    }
}` },
            { file: 'OrderEventConsumerOld.java', pkg: 'baileyes.eyes.kafkastarter.listener', src:
                    `package baileyes.eyes.kafkastarter.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class OrderEventConsumerOld {

    @KafkaListener(topics = "order-events", groupId = "orders-v1")
    public void consume(String payload) {
        log.info("ConsumerOld v1: {}", payload);
    }
}` },
            { file: 'OrderEventConsumerNew.java', pkg: 'baileyes.eyes.kafkastarter.listener', src:
                    `package baileyes.eyes.kafkastarter.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class OrderEventConsumerNew {

    @KafkaListener(topics = "order-events", groupId = "orders-v2")
    public void consume(String payload) {
        log.info("ConsumerNew v2: {}", payload);
    }
}` }
        ]
    });

    /* ===== 13. API-COMPOSITION ===== */
    App.registerPattern('api-composition', {
        title: 'api-composition (BFF)', subtitle: 'CompositeController → AgreementFacade: параллельные CompletableFuture', category: 'integration',
        javaClasses: ['CompositeController', 'AgreementFacade', 'ConcurrentAgreementsService', 'DmsAgreementsService', 'PropertyAgreementsService', 'TravelAgreementsService', 'DmsClient', 'PropertyClient', 'TravelClient', 'UserClient', 'CommonDto', 'DmsAgreementDto', 'PropertyAgreementDto', 'TravelAgreementDto', 'PropertyType'],
        essence: '<p>API Composition: <code>GET /api/v1/agg/getAgreementsByIndividualId</code> возвращает ' +
            '<code>CompletableFuture&lt;ResponseEntity&lt;Map&lt;String, List&lt;CommonDto&gt;&gt;&gt;&gt;</code>. ' +
            '<code>AgreementFacade</code> запускает параллельно DMS/Property/Travel/User, результат склеивается в карту по типам. ' +
            'При падении одного источника — partial result.</p>',
        diagram: function (host) {
            var u = new Uml(860, 320);
            u.box(15, 15, 250, 'CompositeController', '@RestController /api/v1/agg', ['+ getAgreementsByIndividualId(UUID)', '→ CompletableFuture<ResponseEntity<…>>'], 'spring');
            u.box(320, 15, 250, 'AgreementFacade', '@Service', ['+ getAgreementsByIndividualId(UUID)', '→ CompletableFuture<Map<String, List<CommonDto>>>'], 'spring');
            u.box(620, 15, 225, 'ConcurrentAgreementsService<T>', '«interface»', ['+ getAgreements(UUID) : CompletableFuture<List<T>>'], 'iface');
            u.box(300, 140, 165, 'DmsAgreementsService', '@Service', ['+ getAgreements(UUID)'], 'spring');
            u.box(480, 140, 175, 'PropertyAgreementsService', '@Service', ['+ getAgreements(UUID)'], 'spring');
            u.box(670, 140, 175, 'TravelAgreementsService', '@Service', ['+ getAgreements(UUID)'], 'spring');
            u.box(300, 230, 165, 'DmsClient', '@FeignClient', []);
            u.box(480, 230, 175, 'PropertyClient', '@FeignClient', []);
            u.box(670, 230, 175, 'TravelClient', '@FeignClient', []);
            u.arrow(265, 55, 320, 55, 'assoc', 'DI');
            u.arrow(385, 140, 420, 92, 'impl', '');
            u.arrow(560, 140, 500, 92, 'impl', '');
            u.arrow(740, 140, 560, 92, 'impl', '');
            put(host, u, 'CompletableFuture.allOf → склейка в Map<String, List<CommonDto>>.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<div class="field" style="flex:1 1 320px"><span class="lbl">individualId</span>' +
                '<div style="display:flex;gap:7px"><input id="acId" type="text" style="flex:1 1 auto">' +
                '<button class="btn sm" data-rand>случайный UUID</button></div></div>' +
                '<button class="btn primary" data-get>GET /api/v1/agg/getAgreementsByIndividualId</button>' +
                '<label class="switch"><input type="checkbox" id="acFail"><span class="track"></span>TravelClient падает</label>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="panel"><h4>Feign-вызовы (параллельно)</h4><div class="svc-grid" id="acSvc"></div></div>' +
                '<div class="two-col" style="margin-top:14px">' +
                '<div class="panel" style="padding:0"><div style="padding:13px"><h4>Map&lt;String, List&lt;CommonDto&gt;&gt;</h4></div>' +
                '<div class="json-view" id="acJson" style="margin:9px 13px 13px">—</div>' +
                '<div id="acPartial" style="padding:0 13px 13px"></div></div>' +
                '<div id="acTerm"></div></div>';
            var term = ctx.terminal('AgreementFacade');
            host.querySelector('#acTerm').appendChild(term.node);
            var svcGrid = host.querySelector('#acSvc'), jsonEl = host.querySelector('#acJson'), partial = host.querySelector('#acPartial');
            var SERVICES = [
                { id: 'DmsClient', role: 'DmsAgreementsService', base: 620 },
                { id: 'PropertyClient', role: 'PropertyAgreementsService', base: 900 },
                { id: 'TravelClient', role: 'TravelAgreementsService', base: 760 },
                { id: 'UserClient', role: 'DmsServiceClient', base: 410 }
            ];
            function renderSvc() {
                svcGrid.innerHTML = SERVICES.map(function (s) {
                    return '<div class="svc" data-s="' + s.id + '"><div class="nm">' + s.id + '</div>' +
                        '<div class="rl">' + esc(s.role) + '</div><div class="bar"><i></i></div>' +
                        '<div class="stt" data-stt>idle</div></div>';
                }).join('');
            }
            function rnd(min, max) { return min + Math.random() * (max - min); }
            host.querySelector('[data-rand]').addEventListener('click', function () { host.querySelector('#acId').value = ctx.uuid(); });
            if (!host.querySelector('#acId').value) host.querySelector('#acId').value = ctx.uuid();
            host.querySelector('[data-get]').addEventListener('click', function () {
                var individualId = host.querySelector('#acId').value.trim() || ctx.uuid();
                var travelFails = host.querySelector('#acFail').checked;
                renderSvc(); partial.innerHTML = ''; jsonEl.textContent = '…'; term.clear();
                term.info('GET /api/v1/agg/getAgreementsByIndividualId?individualId=' + individualId, 'CompositeController');
                var t0 = performance.now(), results = {}, pending = SERVICES.length;
                SERVICES.forEach(function (s) {
                    var el = svcGrid.querySelector('[data-s="' + s.id + '"]');
                    var bar = el.querySelector('.bar > i'), stt = el.querySelector('[data-stt]');
                    var dur = Math.round(s.base + rnd(-140, 260));
                    var failing = (s.id === 'TravelClient' && travelFails);
                    el.classList.add('busy');
                    stt.innerHTML = '<span class="spinner"></span>Feign… ~' + dur + 'ms';
                    var iv = ctx.every(45, function () {
                        bar.style.width = Math.min(100, (performance.now() - t0) / dur * 100) + '%';
                    });
                    ctx.later(dur, function () {
                        ctx.cancel(iv); bar.style.width = '100%';
                        el.classList.remove('busy');
                        if (failing) { el.classList.add('fail'); stt.textContent = '✖ 503'; term.error('FeignException: 503 → degrading', s.id); results[s.id] = null; }
                        else { el.classList.add('done'); stt.textContent = '✔ ' + Math.round(performance.now() - t0) + 'ms'; term.ok(s.id + ' in ' + Math.round(performance.now() - t0) + 'ms', s.id); results[s.id] = buildData(s.id, individualId); }
                        if (--pending === 0) compose(t0, results, individualId);
                    });
                });
            });
            function buildData(id, individualId) {
                var sid = individualId.slice(0, 8);
                if (id === 'DmsClient') return { section: 'ДМС', items: [{ agreementId: 'DMS-' + sid + '-01', individualId: individualId, type: 'DMS', programName: 'ДМС Стандарт' }] };
                if (id === 'PropertyClient') return { section: 'Имущество', items: [{ agreementId: 'PROP-' + sid, individualId: individualId, propertyType: 'APARTMENT' }] };
                if (id === 'TravelClient') return { section: 'Travel', items: [{ agreementId: 'TRV-' + sid, individualId: individualId, destination: 'Турция' }] };
                return { section: 'User', items: [{ individualId: individualId, lastName: 'Иванов' }] };
            }
            function compose(t0, results, individualId) {
                var total = Math.round(performance.now() - t0);
                term.info('CompletableFuture.allOf().join() → ' + total + ' ms', 'AgreementFacade');
                var map = {};
                var degraded = [];
                if (results.DmsClient) map['ДМС'] = results.DmsClient.items;
                if (results.PropertyClient) map['Имущество'] = results.PropertyClient.items;
                if (results.TravelClient) map['Travel'] = results.TravelClient.items;
                else degraded.push('Travel');
                var response = { individualId: individualId, agreements: map };
                jsonEl.innerHTML = App.hlJson(JSON.stringify(response, null, 2));
                if (degraded.length) {
                    partial.innerHTML = '<div class="partial">⚠ ' + degraded.join(', ') + ' недоступен — partial result (HTTP 200).</div>';
                } else partial.innerHTML = '<div class="note ok" style="margin:0 13px 13px">Все источники ответили.</div>';
                term.ok('ResponseEntity.ok → HTTP 200 · total=' + total + 'ms', 'CompositeController');
            }
            host.querySelector('[data-clear]').addEventListener('click', function () { term.clear(); jsonEl.textContent = '—'; partial.innerHTML = ''; renderSvc(); });
            renderSvc();
        },
        code: [
            { file: 'AgreementFacade.java', pkg: 'baileyes.eyes.apicomposition', src:
                    `package baileyes.eyes.apicomposition;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Slf4j @Service @RequiredArgsConstructor
public class AgreementFacade {

    private final DmsAgreementsService dmsAgreementsService;
    private final PropertyAgreementsService propertyAgreementsService;
    private final TravelAgreementsService travelAgreementsService;

    public CompletableFuture<Map<String, List<CommonDto>>> getAgreementsByIndividualId(UUID individualId) {
        CompletableFuture<List<CommonDto>> dms = dmsAgreementsService.getAgreements(individualId);
        CompletableFuture<List<CommonDto>> property = propertyAgreementsService.getAgreements(individualId);
        CompletableFuture<List<CommonDto>> travel = travelAgreementsService.getAgreements(individualId);

        return CompletableFuture.allOf(dms, property, travel)
            .thenApply(v -> {
                Map<String, List<CommonDto>> result = new HashMap<>();
                result.put("ДМС", safeJoin(dms));
                result.put("Имущество", safeJoin(property));
                result.put("Travel", safeJoin(travel));
                return result;
            });
    }

    private List<CommonDto> safeJoin(CompletableFuture<List<CommonDto>> future) {
        try { return future.join(); }
        catch (Exception e) { log.warn("Degraded: {}", e.getMessage()); return List.of(); }
    }
}` },
            { file: 'CompositeController.java', pkg: 'baileyes.eyes.apicomposition', src:
                    `package baileyes.eyes.apicomposition;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/v1/agg")
@RequiredArgsConstructor
public class CompositeController {

    private final AgreementFacade agreementFacade;

    @GetMapping("/getAgreementsByIndividualId")
    public CompletableFuture<ResponseEntity<Map<String, List<CommonDto>>>> getAgreementsByIndividualId(
            @RequestParam UUID individualId) {
        return agreementFacade.getAgreementsByIndividualId(individualId)
                .thenApply(ResponseEntity::ok);
    }
}` }
        ]
    });

    /* ===== 14. TRANSACTIONAL OUTBOX ===== */
    App.registerPattern('transactional-outbox', {
        title: 'Transactional Outbox', subtitle: '@Transactional: orders + outbox_event → relay → Kafka · at-least-once', category: 'integration',
        javaClasses: ['OrderService', 'OutboxEvent', 'OutboxStatus', 'OutboxEventRepository', 'OutboxRelay', 'OutboxEventPublisher', 'KafkaOutboxEventPublisher', 'Order', 'OrderRepository'],
        essence: '<p><strong>Transactional Outbox</strong> устраняет dual-write problem: заказ и событие для Kafka сохраняются в <em>одной</em> локальной транзакции. ' +
            'Публикация вынесена в <code>OutboxRelay</code>: если брокер недоступен, бизнес-транзакция всё равно коммитится, событие остаётся в <code>PENDING</code> и уйдёт позже. ' +
            'Гарантия доставки — at-least-once, поэтому потребитель должен дедуплицировать сообщения (см. Transactional Inbox).</p>',
        diagram: function (host) {
            var u = new Uml(880, 250);
            u.box(20, 20, 260, 'OrderService', '@Service @Transactional', ['+ createOrder(customerId, amount)', '- save order + outbox event'], 'spring');
            u.box(350, 20, 250, 'OutboxEventRepository', 'Spring Data', ['+ save(event)', '+ findTop100ByStatusOrderByCreatedAtAsc'], 'iface');
            u.box(660, 20, 210, 'OutboxRelay', '@Scheduled', ['+ publishPendingEvents()', '- publish + mark PUBLISHED'], 'spring');
            u.box(20, 150, 260, 'OrderRepository', 'Spring Data', ['+ save(order)'], 'iface');
            u.box(350, 150, 250, 'OutboxEvent', '@Entity', ['id, aggregateId, eventType', 'payload, status, attempts'], 'entity');
            u.box(660, 150, 210, 'KafkaOutboxEventPublisher', '@Component', ['+ publish(event)', 'KafkaTemplate<String, String>'], 'spring');
            u.arrow(150, 88, 150, 150, 'dep', 'save order');
            u.arrow(280, 55, 350, 55, 'dep', 'save event');
            u.arrow(475, 88, 475, 150, 'dep', 'PENDING rows');
            u.arrow(660, 55, 600, 55, 'dep', 'poll');
            u.arrow(765, 88, 765, 150, 'dep', 'publish');
            put(host, u, 'Событие живёт в БД до подтверждения брокером: потерять его при падении приложения нельзя.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-order>POST /api/orders</button>' +
                '<button class="btn" data-relay>relay pending</button>' +
                '<label class="switch"><input type="checkbox" id="obDown"><span class="track"></span>broker down</label>' +
                '<label class="switch"><input type="checkbox" id="obFail"><span class="track"></span>сбой COMMIT</label>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="tx-stage">' +
                '<div class="panel tx-boundary" id="obTx">' +
                '<div class="tx-head"><h4>Local DB · одна транзакция</h4><span class="tx-badge">@Transactional</span></div>' +
                '<div class="tx-tables">' +
                '<div class="db-card"><h5>orders</h5><div class="table-scroll"><table class="db-table" id="obOrders"><thead><tr><th>order_id</th><th>amount</th><th>status</th></tr></thead><tbody></tbody></table></div><div class="db-empty" id="obOrdersEmpty">пусто</div></div>' +
                '<div class="db-card"><h5>outbox_event</h5><div class="table-scroll"><table class="db-table" id="obEvents"><thead><tr><th>event_id</th><th>type</th><th>status</th></tr></thead><tbody></tbody></table></div><div class="db-empty" id="obEventsEmpty">пусто</div></div>' +
                '</div>' +
                '<div class="tx-state" id="obTxState">idle</div>' +
                '</div>' +
                '<div class="relay-col">' +
                '<div class="panel"><h4>OutboxRelay · @Scheduled</h4>' +
                '<div class="relay-flow">' +
                '<span class="relay-node" id="obNodePoll">poll PENDING</span><span class="relay-arrow">→</span>' +
                '<span class="relay-node" id="obNodePub">publish</span><span class="relay-arrow">→</span>' +
                '<span class="relay-node" id="obNodeSent">mark PUBLISHED</span>' +
                '</div>' +
                '<div class="topic-box" id="obTopic">order-events · 0 events</div>' +
                '<div class="hint" id="obRelayNote"></div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div id="obTerm" style="margin-top:14px"></div>' +
                '<p class="hint">Выключите <b>broker down</b> — relay сам дошлёт накопленные события. Включите <b>сбой COMMIT</b> — order и outbox_event исчезнут вместе: запись остаётся атомарной.</p>';
            var term = ctx.terminal('OrderService · OutboxRelay');
            host.querySelector('#obTerm').appendChild(term.node);
            var tx = host.querySelector('#obTx'), txState = host.querySelector('#obTxState');
            var ordersBody = host.querySelector('#obOrders tbody'), eventsBody = host.querySelector('#obEvents tbody');
            var ordersEmpty = host.querySelector('#obOrdersEmpty'), eventsEmpty = host.querySelector('#obEventsEmpty');
            var topic = host.querySelector('#obTopic'), relayNote = host.querySelector('#obRelayNote');
            var orders = [], events = [], published = 0, epoch = 0, creating = false, relayBusy = false, retryTimer = null;
            function short(id) { return String(id).slice(0, 8); }
            function renderOrders() {
                ordersBody.innerHTML = orders.map(function (o) {
                    return '<tr><td>' + esc(short(o.id)) + '</td><td>' + esc(o.amount) + '</td><td><span class="tx-pill created">' + esc(o.status) + '</span></td></tr>';
                }).join('');
                ordersEmpty.hidden = orders.length > 0;
            }
            function renderEvents() {
                eventsBody.innerHTML = events.map(function (e) {
                    var label = e.status + (e.attempts ? ' · ' + e.attempts + '×' : '');
                    return '<tr><td>' + esc(short(e.id)) + '</td><td>' + esc(e.type) + '</td><td><span class="tx-pill ' + (e.status === 'PUBLISHED' ? 'published' : 'pending') + '">' + esc(label) + '</span></td></tr>';
                }).join('');
                eventsEmpty.hidden = events.length > 0;
            }
            function setTx(state, text) {
                tx.classList.remove('active', 'committed', 'rolledback');
                if (state) tx.classList.add(state);
                txState.textContent = text;
            }
            function flash(node) {
                if (!node) return;
                node.classList.add('lit');
                ctx.later(650, function () { node.classList.remove('lit'); });
            }
            function nextPending() {
                for (var i = 0; i < events.length; i++) if (events[i].status === 'PENDING') return events[i];
                return null;
            }
            function relay() {
                if (relayBusy) return;
                var event = nextPending();
                if (!event) { relayNote.textContent = 'нет PENDING-событий'; return; }
                if (host.querySelector('#obDown').checked) {
                    relayNote.innerHTML = '<span style="color:var(--warn)">broker недоступен: событие остаётся в PENDING, retry через 2 с</span>';
                    if (!retryTimer) retryTimer = ctx.later(2000, function () { retryTimer = null; relay(); });
                    return;
                }
                var myEpoch = epoch;
                relayBusy = true;
                relayNote.textContent = '';
                flash(host.querySelector('#obNodePoll'));
                term.info('poll PENDING: ' + event.type + ' event_id=' + short(event.id), 'OutboxRelay');
                ctx.later(320, function () {
                    if (myEpoch !== epoch) return;
                    flash(host.querySelector('#obNodePub'));
                    term.info('publish topic=order-events key=' + short(event.aggregateId), 'OutboxRelay');
                    ctx.later(460, function () {
                        if (myEpoch !== epoch) return;
                        event.status = 'PUBLISHED';
                        published++;
                        flash(host.querySelector('#obNodeSent'));
                        renderEvents();
                        topic.textContent = 'order-events · ' + published + ' event(s)';
                        term.ok('offset=' + published + ' → outbox_event.status=PUBLISHED', 'OutboxRelay');
                        relayBusy = false;
                        ctx.later(320, function () { if (myEpoch === epoch) relay(); });
                    });
                });
            }
            function createOrder() {
                if (creating) return;
                creating = true;
                var myEpoch = epoch;
                var order = { id: ctx.uuid(), amount: (49 + Math.floor(Math.random() * 50)) + '.00', status: 'CREATED' };
                var event = { id: ctx.uuid(), aggregateId: order.id, type: 'OrderCreated', status: 'PENDING', attempts: 0 };
                setTx('active', 'BEGIN · insert order + insert outbox');
                term.info('BEGIN', 'OrderService');
                term.info('INSERT INTO orders (id=' + short(order.id) + ', amount=' + order.amount + ')', 'OrderService');
                term.info('INSERT INTO outbox_event (id=' + short(event.id) + ', type=OrderCreated)', 'OrderService');
                orders.push(order); events.push(event); renderOrders(); renderEvents();
                ctx.later(520, function () {
                    if (myEpoch !== epoch) return;
                    if (host.querySelector('#obFail').checked) {
                        orders.pop(); events.pop(); renderOrders(); renderEvents();
                        setTx('rolledback', 'ROLLED BACK · COMMIT failed');
                        term.error('COMMIT failed: simulated DB error → order и outbox_event откатились', 'OrderService');
                    } else {
                        setTx('committed', 'COMMITTED · order + outbox event');
                        term.ok('COMMIT: order + outbox_event в одной транзакции', 'OrderService');
                        ctx.later(450, function () { if (myEpoch === epoch) relay(); });
                    }
                    creating = false;
                });
            }
            function clearAll() {
                epoch++;
                creating = false; relayBusy = false;
                if (retryTimer) { ctx.cancel(retryTimer); retryTimer = null; }
                orders = []; events = []; published = 0;
                renderOrders(); renderEvents(); setTx('', 'idle');
                topic.textContent = 'order-events · 0 events';
                relayNote.textContent = '';
                term.clear();
            }
            host.querySelector('[data-order]').addEventListener('click', createOrder);
            host.querySelector('[data-relay]').addEventListener('click', relay);
            host.querySelector('[data-clear]').addEventListener('click', clearAll);
            host.querySelector('#obDown').addEventListener('change', function (e) {
                if (!e.target.checked) {
                    if (retryTimer) { ctx.cancel(retryTimer); retryTimer = null; }
                    relay();
                }
            });
            renderOrders(); renderEvents();
        },
        code: [
            { file: 'OrderService.java', pkg: 'baileyes.eyes.transactionaloutbox.service', src:
                    `package baileyes.eyes.transactionaloutbox.service;

import baileyes.eyes.transactionaloutbox.entity.Order;
import baileyes.eyes.transactionaloutbox.entity.OrderStatus;
import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;
import baileyes.eyes.transactionaloutbox.entity.OutboxStatus;
import baileyes.eyes.transactionaloutbox.event.OrderCreatedEvent;
import baileyes.eyes.transactionaloutbox.repository.OrderRepository;
import baileyes.eyes.transactionaloutbox.repository.OutboxEventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public Order createOrder(String customerId, BigDecimal amount) {
        UUID orderId = UUID.randomUUID();
        Instant now = Instant.now();

        Order order = new Order();
        order.setId(orderId);
        order.setCustomerId(customerId);
        order.setAmount(amount);
        order.setStatus(OrderStatus.CREATED);
        order.setCreatedAt(now);
        orderRepository.save(order);

        UUID eventId = UUID.randomUUID();
        OrderCreatedEvent payload =
            new OrderCreatedEvent(eventId, orderId, customerId, amount, now);

        OutboxEvent event = new OutboxEvent();
        event.setId(eventId);
        event.setAggregateId(orderId);
        event.setEventType("OrderCreated");
        event.setPayload(toJson(payload));
        event.setStatus(OutboxStatus.PENDING);
        event.setCreatedAt(now);
        outboxEventRepository.save(event);

        return order;
    }

    private String toJson(OrderCreatedEvent payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize OrderCreatedEvent", e);
        }
    }
}` },
            { file: 'OutboxEvent.java', pkg: 'baileyes.eyes.transactionaloutbox.entity', src:
                    `package baileyes.eyes.transactionaloutbox.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import javax.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
    name = "outbox_event",
    indexes = @Index(name = "ix_outbox_status_created", columnList = "status, created_at")
)
@Getter @Setter @NoArgsConstructor
public class OutboxEvent {

    @Id
    private UUID id;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Lob
    @Column(nullable = false)
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OutboxStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 1000)
    private String lastError;
}` },
            { file: 'OutboxRelay.java', pkg: 'baileyes.eyes.transactionaloutbox.service', src:
                    `package baileyes.eyes.transactionaloutbox.service;

import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;
import baileyes.eyes.transactionaloutbox.entity.OutboxStatus;
import baileyes.eyes.transactionaloutbox.publisher.OutboxEventPublisher;
import baileyes.eyes.transactionaloutbox.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class OutboxRelay {

    private final OutboxEventRepository outboxEventRepository;
    private final OutboxEventPublisher publisher;

    @Scheduled(fixedDelayString = "\${outbox.relay.fixed-delay-ms:2000}")
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> batch = outboxEventRepository
            .findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING);

        for (OutboxEvent event : batch) {
            try {
                publisher.publish(event);
                event.setStatus(OutboxStatus.PUBLISHED);
                event.setPublishedAt(Instant.now());
                event.setLastError(null);
            } catch (Exception e) {
                event.setAttempts(event.getAttempts() + 1);
                event.setLastError(e.getMessage());
                log.warn("Outbox event {} is still PENDING, attempt {}",
                    event.getId(), event.getAttempts(), e);
            }
        }
    }
}` },
            { file: 'KafkaOutboxEventPublisher.java', pkg: 'baileyes.eyes.transactionaloutbox.publisher', src:
                    `package baileyes.eyes.transactionaloutbox.publisher;

import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Slf4j @Component @RequiredArgsConstructor
public class KafkaOutboxEventPublisher implements OutboxEventPublisher {

    static final String TOPIC = "order-events";

    private final KafkaTemplate<String, String> kafkaTemplate;

    @Override
    public void publish(OutboxEvent event) throws Exception {
        kafkaTemplate
            .send(TOPIC, event.getAggregateId().toString(), event.getPayload())
            .get(5, TimeUnit.SECONDS);

        log.info("Published outbox event {} type={}", event.getId(), event.getEventType());
    }
}` }
        ]
    });

    /* ===== 15. TRANSACTIONAL INBOX ===== */
    App.registerPattern('transactional-inbox', {
        title: 'Transactional Inbox', subtitle: 'INSERT-first: PK messageId — барьер идемпотентности · проекция в той же транзакции', category: 'integration',
        javaClasses: ['OrderEventConsumer', 'OrderEventHandler', 'InboxMessage', 'InboxMessageRepository', 'OrderProjection', 'OrderProjectionRepository', 'OrderCreatedEvent', 'DuplicateInboxMessageException'],
        essence: '<p><strong>Transactional Inbox</strong> делает consumer идемпотентным через <em>insert-first</em>. ' +
            'Первым шагом handler пытается вставить сообщение в <code>inbox_message</code>, где <code>messageId</code> — первичный ключ/unique key. ' +
            'Если событие уже обработано, INSERT отклоняется БД, бизнес-изменение не выполняется, а listener подтверждает offset. ' +
            'Для нового сообщения INSERT inbox и обновление проекции коммитятся одной транзакцией; при падении до <code>COMMIT</code> откатываются оба изменения, и Kafka повторяет доставку.</p>',
        diagram: function (host) {
            var u = new Uml(880, 330);
            u.box(20, 20, 210, 'Kafka topic', 'order-events', ['at-least-once'], 'spring');
            u.box(280, 20, 230, 'OrderEventConsumer', '@KafkaListener', ['+ onOrderCreated(record)'], 'spring');
            u.box(560, 20, 290, 'OrderEventHandler', '@Service @Transactional', ['+ handle(payload)', '1. INSERT inbox_message', '2. UPSERT order_projection'], 'spring');
            u.box(280, 150, 230, 'InboxMessageRepository', 'Spring Data', ['+ saveAndFlush(message)', '+ unique PK message_id'], 'iface');
            u.box(560, 150, 290, 'OrderProjectionRepository', 'Spring Data', ['+ save(projection)'], 'iface');
            u.box(280, 250, 230, 'InboxMessage', '@Entity · PK messageId', ['messageId — unique key', 'eventType, payload'], 'entity');
            u.box(560, 250, 290, 'OrderProjection', '@Entity', ['orderId, customerId, amount', 'status, updatedAt'], 'entity');
            u.arrow(230, 55, 280, 55, 'dep', 'consume');
            u.arrow(510, 55, 560, 55, 'dep', 'handle');
            u.arrow(395, 103, 395, 150, 'dep', '1. INSERT');
            u.arrow(705, 103, 705, 150, 'dep', '2. UPSERT');
            u.arrow(395, 203, 395, 250, 'dep', '');
            u.arrow(705, 203, 705, 250, 'dep', '');
            put(host, u, 'Дубль отклоняется уже на INSERT в inbox_message: до обновления бизнес-проекции дело не доходит.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-publish>publish OrderCreated</button>' +
                '<button class="btn" data-redeliver>redeliver last</button>' +
                '<label class="switch"><input type="checkbox" id="ibFail"><span class="track"></span>сбой consumer до COMMIT</label>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="tx-stage">' +
                '<div class="panel">' +
                '<h4>Kafka · order-events</h4>' +
                '<div class="metrics" id="ibStats"></div>' +
                '<div class="broker-stack" id="ibBroker"><div class="db-empty">сообщений нет</div></div>' +
                '</div>' +
                '<div class="panel tx-boundary" id="ibTx">' +
                '<div class="tx-head"><h4>Consumer transaction</h4><span class="tx-badge">@Transactional</span></div>' +
                '<div class="tx-tables">' +
                '<div class="db-card"><h5>inbox_message</h5><div class="table-scroll"><table class="db-table" id="ibInbox"><thead><tr><th>message_id</th><th>event</th></tr></thead><tbody></tbody></table></div><div class="db-empty" id="ibInboxEmpty">пусто</div></div>' +
                '<div class="db-card"><h5>order_projection</h5><div class="table-scroll"><table class="db-table" id="ibProjection"><thead><tr><th>order_id</th><th>amount</th><th>status</th></tr></thead><tbody></tbody></table></div><div class="db-empty" id="ibProjectionEmpty">пусто</div></div>' +
                '</div>' +
                '<div class="tx-state" id="ibTxState">idle</div>' +
                '</div>' +
                '</div>' +
                '<div id="ibTerm" style="margin-top:14px"></div>' +
                '<p class="hint">Нажмите <b>redeliver last</b>: consumer снова начнёт с INSERT в <code>inbox_message</code>, БД отклонит дубль по PK <code>message_id</code>, и проекция не изменится. ' +
                'Включите <b>сбой consumer до COMMIT</b> — inbox-запись и проекция откатятся, offset не закоммитится, и доставку можно повторить.</p>';
            var term = ctx.terminal('OrderEventHandler · inbox transaction');
            host.querySelector('#ibTerm').appendChild(term.node);
            var tx = host.querySelector('#ibTx'), txState = host.querySelector('#ibTxState');
            var brokerEl = host.querySelector('#ibBroker'), statsEl = host.querySelector('#ibStats');
            var inboxBody = host.querySelector('#ibInbox tbody'), projectionBody = host.querySelector('#ibProjection tbody');
            var inboxEmpty = host.querySelector('#ibInboxEmpty'), projectionEmpty = host.querySelector('#ibProjectionEmpty');
            var messages = [], inbox = {}, projections = {}, last = null, queue = [], busy = false;
            var received = 0, deduped = 0, committed = 0, epoch = 0;
            function short(id) { return String(id).slice(0, 8); }
            function setTx(state, text) {
                tx.classList.remove('active', 'committed', 'rolledback', 'duplicate');
                if (state) tx.classList.add(state);
                txState.textContent = text;
            }
            function renderStats() {
                function m(k, v, c) { return '<div class="metric"><div class="k">' + k + '</div><div class="v ' + c + '">' + v + '</div></div>'; }
                statsEl.innerHTML = m('received', received, '') + m('deduped', deduped, deduped ? 'warnc' : '') + m('committed', committed, committed ? 'good' : '');
            }
            function statusPill(status) {
                var cls = status === 'ACK' ? 'published' : status === 'DUPLICATE' ? 'dup' : status === 'RETRY' ? 'retry' : status === 'PROCESSING' ? 'busy' : 'pending';
                return '<span class="tx-pill ' + cls + '">' + esc(status) + '</span>';
            }
            function renderBroker() {
                if (!messages.length) { brokerEl.innerHTML = '<div class="db-empty">сообщений нет</div>'; return; }
                brokerEl.innerHTML = messages.slice().reverse().map(function (m) {
                    var rowCls = m.status === 'ACK' ? 'ok' : m.status === 'RETRY' ? 'err' : '';
                    return '<div class="broker-msg ' + rowCls + '">' +
                        '<div class="bm-top"><span class="bm-id">offset ' + m.offset + ' · ' + short(m.id) + '</span>' + statusPill(m.status) + '</div>' +
                        '<div class="bm-body">OrderCreated · order ' + short(m.orderId) + ' · ' + esc(m.amount) + '</div>' +
                        (m.attempts > 1 ? '<div class="bm-note">delivery attempt ' + m.attempts + '</div>' : '') +
                        '</div>';
                }).join('');
            }
            function renderInbox() {
                var inboxRows = Object.keys(inbox).map(function (k) {
                    var m = inbox[k];
                    return '<tr><td>' + esc(short(m.messageId)) + '</td><td>' + esc(m.type) + '</td></tr>';
                });
                inboxBody.innerHTML = inboxRows.join('');
                inboxEmpty.hidden = inboxRows.length > 0;

                var projectionRows = Object.keys(projections).map(function (k) {
                    var p = projections[k];
                    return '<tr><td>' + esc(short(p.orderId)) + '</td><td>' + esc(p.amount) + '</td><td><span class="tx-pill created">' + esc(p.status) + '</span></td></tr>';
                });
                projectionBody.innerHTML = projectionRows.join('');
                projectionEmpty.hidden = projectionRows.length > 0;
            }
            function drain() {
                if (busy || !queue.length) return;
                deliver(queue.shift());
            }
            function deliver(msg) {
                busy = true;
                var myEpoch = epoch;
                msg.status = 'PROCESSING';
                msg.attempts++;
                renderBroker();
                term.info('@KafkaListener received messageId=' + short(msg.id) + ' offset=' + msg.offset, 'OrderEventConsumer');
                setTx('active', 'BEGIN · INSERT inbox_message первым');
                term.info('BEGIN', 'OrderEventHandler');
                term.info('INSERT INTO inbox_message (message_id=' + short(msg.id) + ')', 'OrderEventHandler');
                ctx.later(320, function () {
                    if (myEpoch !== epoch) return;
                    if (inbox[msg.id]) {
                        msg.status = 'DUPLICATE';
                        deduped++;
                        busy = false;
                        renderBroker(); renderStats();
                        setTx('duplicate', 'DUPLICATE KEY · INSERT отклонён');
                        term.error('duplicate key value violates unique constraint "inbox_message_pkey"', 'OrderEventHandler');
                        term.warn('offset acknowledged; order_projection не изменён', 'OrderEventConsumer');
                        drain();
                        return;
                    }
                    inbox[msg.id] = { messageId: msg.id, orderId: msg.orderId, type: 'OrderCreated' };
                    renderInbox();
                    term.ok('INSERT inbox_message → OK: message_id новый, барьер пройден', 'OrderEventHandler');
                    ctx.later(280, function () {
                        if (myEpoch !== epoch) return;
                        projections[msg.orderId] = { orderId: msg.orderId, amount: msg.amount, status: 'CREATED' };
                        renderInbox();
                        term.info('UPSERT order_projection (order_id=' + short(msg.orderId) + ')', 'OrderEventHandler');
                        ctx.later(430, function () {
                            if (myEpoch !== epoch) return;
                            if (host.querySelector('#ibFail').checked) {
                                delete inbox[msg.id]; delete projections[msg.orderId]; renderInbox();
                                msg.status = 'RETRY'; busy = false;
                                renderBroker(); setTx('rolledback', 'ROLLED BACK · consumer threw');
                                term.error('RuntimeException до COMMIT → ROLLBACK; offset не закоммичен', 'OrderEventHandler');
                                term.warn('Kafka доставит сообщение повторно — нажмите redeliver last', 'OrderEventConsumer');
                            } else {
                                msg.status = 'ACK'; committed++; busy = false;
                                renderBroker(); renderStats();
                                setTx('committed', 'COMMITTED · inbox + projection');
                                term.ok('COMMIT: inbox_message + order_projection; offset acknowledged', 'OrderEventHandler');
                            }
                            drain();
                        });
                    });
                });
            }
            function publish() {
                var msg = { id: ctx.uuid(), orderId: ctx.uuid(), amount: (49 + Math.floor(Math.random() * 50)) + '.00', status: 'READY', attempts: 0, offset: messages.length };
                var myEpoch = epoch;
                messages.push(msg); last = msg; received++;
                renderBroker(); renderStats();
                term.info('producer: OrderCreated offset=' + msg.offset + ' key=' + short(msg.orderId), 'Kafka');
                ctx.later(380, function () {
                    if (myEpoch !== epoch) return;
                    queue.push(msg); drain();
                });
            }
            function redeliver() {
                if (!last) { term.warn('сначала опубликуйте сообщение', 'Kafka'); return; }
                if (busy) { term.warn('consumer ещё обрабатывает предыдущее сообщение', 'Kafka'); return; }
                term.info('broker redelivery: messageId=' + short(last.id) + ' (at-least-once)', 'Kafka');
                queue.push(last); drain();
            }
            function clearAll() {
                epoch++;
                messages = []; inbox = {}; projections = {}; last = null; queue = []; busy = false;
                received = deduped = committed = 0;
                renderBroker(); renderInbox(); renderStats(); setTx('', 'idle');
                term.clear();
            }
            host.querySelector('[data-publish]').addEventListener('click', publish);
            host.querySelector('[data-redeliver]').addEventListener('click', redeliver);
            host.querySelector('[data-clear]').addEventListener('click', clearAll);
            renderBroker(); renderInbox(); renderStats();
        },
        code: [
            { file: 'OrderEventHandler.java', pkg: 'baileyes.eyes.transactionalinbox.service', src:
                    `package baileyes.eyes.transactionalinbox.service;

import baileyes.eyes.transactionalinbox.entity.InboxMessage;
import baileyes.eyes.transactionalinbox.entity.OrderProjection;
import baileyes.eyes.transactionalinbox.event.OrderCreatedEvent;
import baileyes.eyes.transactionalinbox.exception.DuplicateInboxMessageException;
import baileyes.eyes.transactionalinbox.repository.InboxMessageRepository;
import baileyes.eyes.transactionalinbox.repository.OrderProjectionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Slf4j @Service @RequiredArgsConstructor
public class OrderEventHandler {

    private final InboxMessageRepository inboxMessageRepository;
    private final OrderProjectionRepository orderProjectionRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void handle(String payload) {
        OrderCreatedEvent event = read(payload);
        String messageId = event.getEventId().toString();

        InboxMessage message = new InboxMessage();
        message.setMessageId(messageId);
        message.setAggregateId(event.getOrderId());
        message.setEventType("OrderCreated");
        message.setPayload(payload);
        message.setReceivedAt(Instant.now());

        try {
            // Первым делом INSERT в inbox_message.
            // PK/unique по message_id — барьер идемпотентности.
            inboxMessageRepository.saveAndFlush(message);
        } catch (DataIntegrityViolationException e) {
            throw new DuplicateInboxMessageException(messageId, e);
        }

        OrderProjection projection = new OrderProjection();
        projection.setOrderId(event.getOrderId());
        projection.setCustomerId(event.getCustomerId());
        projection.setAmount(event.getAmount());
        projection.setStatus("CREATED");
        projection.setUpdatedAt(Instant.now());
        orderProjectionRepository.save(projection);
    }

    private OrderCreatedEvent read(String payload) {
        try {
            return objectMapper.readValue(payload, OrderCreatedEvent.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Cannot deserialize OrderCreatedEvent", e);
        }
    }
}` },
            { file: 'OrderEventConsumer.java', pkg: 'baileyes.eyes.transactionalinbox.listener', src:
                    `package baileyes.eyes.transactionalinbox.listener;

import baileyes.eyes.transactionalinbox.exception.DuplicateInboxMessageException;
import baileyes.eyes.transactionalinbox.service.OrderEventHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j @Component @RequiredArgsConstructor
public class OrderEventConsumer {

    private final OrderEventHandler orderEventHandler;

    @KafkaListener(topics = "order-events", groupId = "order-inbox")
    public void onOrderCreated(ConsumerRecord<String, String> record) {
        try {
            orderEventHandler.handle(record.value());
            log.info("Kafka message applied: partition={}, offset={}",
                record.partition(), record.offset());
        } catch (DuplicateInboxMessageException e) {
            log.info("Duplicate message {} skipped: partition={}, offset={}",
                e.getMessageId(), record.partition(), record.offset());
        }
    }
}` },
            { file: 'DuplicateInboxMessageException.java', pkg: 'baileyes.eyes.transactionalinbox.exception', src:
                    `package baileyes.eyes.transactionalinbox.exception;

import lombok.Getter;

@Getter
public class DuplicateInboxMessageException extends RuntimeException {

    private final String messageId;

    public DuplicateInboxMessageException(String messageId, Throwable cause) {
        super("Message " + messageId + " already exists in inbox_message", cause);
        this.messageId = messageId;
    }
}` },
            { file: 'InboxMessage.java', pkg: 'baileyes.eyes.transactionalinbox.entity', src:
                    `package baileyes.eyes.transactionalinbox.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import javax.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "inbox_message")
@Getter @Setter @NoArgsConstructor
public class InboxMessage {

    @Id
    @Column(name = "message_id", nullable = false, updatable = false)
    private String messageId;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Lob
    @Column(nullable = false)
    private String payload;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;
}` }
        ]
    });

    /* ===== 16. RATE LIMITER ===== */
    App.registerPattern('rate-limiter', {
        title: 'Rate Limiter', subtitle: 'Token bucket: burst + refill → 429 и Retry-After · local / Redis', category: 'reliability',
        javaClasses: ['RateLimit', 'TokenBucket', 'InMemoryRateLimiter', 'RedisRateLimiter', 'RateLimitAspect', 'RateLimitExceededException'],
        essence: '<p><strong>Rate Limiter</strong> ограничивает скорость запросов на ключ: пользователя, IP или tenant. ' +
            'Token bucket разрешает короткий burst в пределах <code>capacity</code>, а затем пополняет токены со скоростью <code>refillTokens / refillPeriod</code>. ' +
            'Пустой bucket → <code>429 Too Many Requests</code> и <code>Retry-After</code>. В одном инстансе достаточно <code>ConcurrentHashMap</code>, в кластере — атомарный token bucket в Redis (Lua).</p>',
        diagram: function (host) {
            var u = new Uml(880, 250);
            u.box(20, 20, 240, 'RateLimiterController', '@RestController', ['+ GET /api/limited/ping', '@RateLimit(capacity = 5)'], 'spring');
            u.box(330, 20, 220, 'RateLimitAspect', '@Aspect @Around', ['+ enforce(pjp, limit)', 'key = user / IP / tenant'], 'spring');
            u.box(620, 20, 230, 'RateLimit', 'annotation', ['capacity, refillTokens', 'refillPeriodSeconds'], 'abs');
            u.box(20, 150, 240, 'InMemoryRateLimiter', '@Component', ['ConcurrentHashMap<String, TokenBucket>', '+ tryAcquire(key)'], 'spring');
            u.box(330, 150, 220, 'RateLimiter', '«interface»', ['+ tryAcquire(key, limit)'], 'iface');
            u.box(620, 150, 230, 'RedisRateLimiter', '@Component', ['+ Lua token bucket', 'atomic across pods'], 'spring');
            u.arrow(260, 55, 330, 55, 'dep', '@RateLimit');
            u.arrow(550, 55, 620, 55, 'dep', '');
            u.arrow(440, 88, 440, 150, 'dep', 'delegate');
            u.arrow(330, 190, 260, 190, 'impl', '');
            u.arrow(550, 190, 620, 190, 'impl', '');
            put(host, u, 'Лимитер выбирается по ключу и режиму: in-memory для одного pod, Redis — для всего кластера.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-one>1 request</button>' +
                '<button class="btn" data-burst>burst 10</button>' +
                '<button class="btn" data-reset>refill / reset</button>' +
                '<label class="switch"><input type="checkbox" id="rlRedis"><span class="track"></span>Redis (distributed)</label>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="rl-stage">' +
                '<div class="panel rl-bucket">' +
                '<h4>Token bucket · capacity 5 · refill 1/s</h4>' +
                '<div class="rl-tokens" id="rlTokens"></div>' +
                '<div class="rl-status" id="rlStatus">idle</div>' +
                '<p class="hint">1 токен = 1 запрос. Пустой bucket → <b>429</b> + <code>Retry-After: 1</code>.</p>' +
                '</div>' +
                '<div class="panel"><h4>HTTP / limiter</h4><div class="metrics" id="rlStats"></div>' +
                '<div class="data-out" id="rlOut" style="margin-top:10px">—</div><div id="rlTerm" style="margin-top:12px"></div></div>' +
                '</div>';
            var term = ctx.terminal('RateLimiter · token bucket');
            host.querySelector('#rlTerm').appendChild(term.node);
            var capacity = 5, tokens = capacity, allowed = 0, denied = 0, epoch = 0;
            var tokensEl = host.querySelector('#rlTokens'), statusEl = host.querySelector('#rlStatus');
            var statsEl = host.querySelector('#rlStats'), outEl = host.querySelector('#rlOut');
            function redisMode() { return host.querySelector('#rlRedis').checked; }
            function metric(k, v, c) { return '<div class="metric"><div class="k">' + k + '</div><div class="v ' + c + '">' + v + '</div></div>'; }
            function render() {
                var html = '';
                for (var i = 0; i < capacity; i++) html += '<span class="rl-token' + (i >= tokens ? ' spent' : '') + '"></span>';
                tokensEl.innerHTML = html;
                statsEl.innerHTML =
                    metric('allowed', allowed, 'good') +
                    metric('denied', denied, denied ? 'bad' : '') +
                    metric('tokens', tokens, tokens ? 'good' : 'warnc') +
                    metric('limiter', redisMode() ? 'Redis' : 'memory', '');
            }
            function callOne() {
                var limiter = redisMode() ? 'RedisRateLimiter' : 'InMemoryRateLimiter';
                if (tokens > 0) {
                    tokens--; allowed++;
                    statusEl.textContent = '200 OK · token consumed';
                    statusEl.className = 'rl-status ok';
                    outEl.innerHTML = '<span class="status-badge s-2xx">200</span> OK · X-RateLimit-Remaining: ' + tokens;
                    term.ok('tryAcquire → true · tokens=' + tokens, limiter);
                } else {
                    denied++;
                    statusEl.textContent = '429 Too Many Requests · Retry-After: 1';
                    statusEl.className = 'rl-status err';
                    outEl.innerHTML = '<span class="status-badge s-4xx">429</span> Too Many Requests · Retry-After: 1';
                    term.error('tryAcquire → false · bucket empty', limiter);
                }
                render();
            }
            function burst() {
                var myEpoch = epoch, i = 0;
                var iv = ctx.every(90, function () {
                    if (myEpoch !== epoch) { ctx.cancel(iv); return; }
                    callOne();
                    if (++i >= 10) ctx.cancel(iv);
                });
            }
            function reset() {
                epoch++;
                tokens = capacity; allowed = 0; denied = 0;
                statusEl.textContent = 'idle'; statusEl.className = 'rl-status';
                outEl.textContent = '—';
                term.clear(); render();
                term.info('bucket reset: tokens=' + tokens, 'RateLimiter');
            }
            host.querySelector('[data-one]').addEventListener('click', callOne);
            host.querySelector('[data-burst]').addEventListener('click', burst);
            host.querySelector('[data-reset]').addEventListener('click', reset);
            host.querySelector('[data-clear]').addEventListener('click', reset);
            host.querySelector('#rlRedis').addEventListener('change', function () {
                term.info('limiter switched to ' + (redisMode() ? 'Redis Lua' : 'in-memory token bucket'), 'RateLimiter');
                render();
            });
            ctx.every(1000, function () {
                if (tokens < capacity) {
                    tokens++;
                    term.debug('refill +1 token', redisMode() ? 'RedisRateLimiter' : 'InMemoryRateLimiter');
                    render();
                }
            });
            render();
        },
        code: [
            { file: 'TokenBucket.java', pkg: 'baileyes.eyes.ratelimiter.service', src:
                    `package baileyes.eyes.ratelimiter.service;

public class TokenBucket {

    private final int capacity;
    private final int refillTokens;
    private final long refillPeriodNanos;

    private double tokens;
    private long lastRefillNanos;

    public TokenBucket(int capacity, int refillTokens, int refillPeriodSeconds) {
        this.capacity = capacity;
        this.refillTokens = refillTokens;
        this.refillPeriodNanos = refillPeriodSeconds * 1_000_000_000L;
        this.tokens = capacity;
        this.lastRefillNanos = System.nanoTime();
    }

    public synchronized boolean tryConsume() {
        refill();
        if (tokens < 1.0d) {
            return false;
        }
        tokens -= 1.0d;
        return true;
    }

    private void refill() {
        long now = System.nanoTime();
        long elapsed = now - lastRefillNanos;
        if (elapsed < refillPeriodNanos) {
            return;
        }
        double replenished = (double) elapsed / refillPeriodNanos * refillTokens;
        if (replenished >= 1.0d) {
            tokens = Math.min(capacity, tokens + replenished);
            lastRefillNanos = now;
        }
    }
}` },
            { file: 'RateLimitAspect.java', pkg: 'baileyes.eyes.ratelimiter.aspect', src:
                    `package baileyes.eyes.ratelimiter.aspect;

import baileyes.eyes.ratelimiter.annotation.RateLimit;
import baileyes.eyes.ratelimiter.exception.RateLimitExceededException;
import baileyes.eyes.ratelimiter.service.InMemoryRateLimiter;
import baileyes.eyes.ratelimiter.service.RedisRateLimiter;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect @Component @RequiredArgsConstructor
public class RateLimitAspect {

    private final InMemoryRateLimiter inMemoryRateLimiter;
    private final RedisRateLimiter redisRateLimiter;

    @Around("@annotation(limit)")
    public Object enforce(ProceedingJoinPoint pjp, RateLimit limit) throws Throwable {
        String key = limit.key().isEmpty()
            ? pjp.getSignature().toShortString()
            : limit.key();

        boolean allowed = limit.distributed()
            ? redisRateLimiter.tryAcquire(key, limit)
            : inMemoryRateLimiter.tryAcquire(key, limit);

        if (!allowed) {
            throw new RateLimitExceededException(key);
        }
        return pjp.proceed();
    }
}` },
            { file: 'RedisRateLimiter.java', pkg: 'baileyes.eyes.ratelimiter.service', src:
                    `package baileyes.eyes.ratelimiter.service;

import baileyes.eyes.ratelimiter.annotation.RateLimit;
import java.util.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RedisRateLimiter implements RateLimiter {

    private static final String LUA_TOKEN_BUCKET = String.join("\\n",
        "local key = KEYS[1]",
        "local capacity = tonumber(ARGV[1])",
        "local tokens = tonumber(redis.call('HGET', key, 'tokens') or capacity)",
        "local ts = tonumber(redis.call('HGET', key, 'ts') or ARGV[4])",
        "local elapsed = math.max(0, tonumber(ARGV[4]) - ts)",
        "tokens = math.min(capacity, tokens + elapsed / tonumber(ARGV[3]) * tonumber(ARGV[2]))",
        "local allowed = 0",
        "if tokens >= 1 then tokens = tokens - 1; allowed = 1 end",
        "redis.call('HMSET', key, 'tokens', tokens, 'ts', ARGV[4])",
        "redis.call('PEXPIRE', key, tonumber(ARGV[3]) * 2)",
        "return allowed"
    );

    private static final DefaultRedisScript<Long> TOKEN_BUCKET_SCRIPT =
        new DefaultRedisScript<>(LUA_TOKEN_BUCKET, Long.class);

    private final StringRedisTemplate redisTemplate;

    @Override
    public boolean tryAcquire(String key, RateLimit limit) {
        Long allowed = redisTemplate.execute(
            TOKEN_BUCKET_SCRIPT,
            Collections.singletonList("rate-limit:" + key),
            String.valueOf(limit.capacity()),
            String.valueOf(limit.refillTokens()),
            String.valueOf(limit.refillPeriodSeconds() * 1000L),
            String.valueOf(System.currentTimeMillis())
        );
        return allowed != null && allowed == 1L;
    }
}` }
        ]
    });

    /* ===== 17. RETRY + JITTER ===== */
    App.registerPattern('retry-jitter', {
        title: 'Retry + Jitter', subtitle: 'Exponential backoff + full jitter против retry storm', category: 'reliability',
        javaClasses: ['Retryable', 'RetryPolicy', 'ExponentialBackoff', 'RetryExecutor', 'RetryableAspect', 'RetryExhaustedException'],
        essence: '<p><strong>Retry + Jitter</strong> — это не просто «повторить три раза». Без задержки и jitter все клиенты повторяют запрос одновременно и добивают уже перегруженный сервис. ' +
            'Экспоненциальная задержка <code>base × 2^attempt</code> даёт сервису время восстановиться, а <em>full jitter</em> — случайный разброс <code>[0, delay]</code> — разносит повторы по времени. ' +
            'Повторять можно только идемпотентные операции, иначе появятся дубликаты.</p>',
        diagram: function (host) {
            var u = new Uml(880, 250);
            u.box(20, 20, 240, 'RetryableAspect', '@Aspect @Around', ['+ retry(pjp, retryable)', 'maxAttempts, jitter'], 'spring');
            u.box(330, 20, 220, 'RetryExecutor', '@Component', ['+ execute(Supplier, policy)', 'loop attempts'], 'spring');
            u.box(620, 20, 230, 'ExponentialBackoff', '@Component', ['+ delayMillis(attempt)', 'full jitter'], 'spring');
            u.box(20, 150, 240, 'RetryPolicy', '@Builder', ['maxAttempts, baseDelayMs', 'maxDelayMs, jitter'], 'entity');
            u.box(330, 150, 220, 'TargetService', 'downstream', ['+ call()'], 'spring');
            u.box(620, 150, 230, 'RetryExhaustedException', 'RuntimeException', ['attempts, cause'], 'entity');
            u.arrow(260, 55, 330, 55, 'dep', 'execute');
            u.arrow(550, 55, 620, 55, 'dep', 'delay');
            u.arrow(260, 190, 330, 55, 'dep', 'policy');
            u.arrow(440, 88, 440, 150, 'dep', 'invoke');
            u.arrow(550, 190, 620, 190, 'dep', 'after max attempts');
            put(host, u, 'Jitter не уменьшает число попыток — он разносит их во времени, чтобы клиенты не били синхронно.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-run>simulate 5 clients</button>' +
                '<label class="switch"><input type="checkbox" id="rjJitter" checked><span class="track"></span>full jitter</label>' +
                '<div class="field"><span class="lbl">clients</span><select id="rjClients"><option>3</option><option selected>5</option><option>8</option></select></div>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="panel"><h4>Retry timeline · 4 attempts · base 200 ms</h4>' +
                '<div class="gantt" id="rjChart"></div><div class="order-note" id="rjNote"><span class="tag">jitter</span> выключите jitter и запустите снова</div></div>' +
                '<div id="rjTerm" style="margin-top:14px"></div>';
            var term = ctx.terminal('RetryExecutor · exponential backoff');
            host.querySelector('#rjTerm').appendChild(term.node);
            var chart = host.querySelector('#rjChart'), note = host.querySelector('#rjNote');
            var base = 200, maxDelay = 2000, attempts = 4, totalMs = 3600;
            function delayFor(attempt, jitter) {
                var exp = Math.min(maxDelay, base * Math.pow(2, attempt - 1));
                return jitter ? Math.floor(Math.random() * (exp + 1)) : exp;
            }
            function run() {
                var clients = Number(host.querySelector('#rjClients').value);
                var jitter = host.querySelector('#rjJitter').checked;
                var rows = [], allTimes = [], maxConcurrent = 0;
                for (var c = 1; c <= clients; c++) {
                    var times = [0], t = 0;
                    for (var attempt = 1; attempt < attempts; attempt++) {
                        t += delayFor(attempt, jitter);
                        times.push(t);
                    }
                    allTimes.push(times);
                    rows.push('<div class="gantt-row"><div class="hint" style="font-family:var(--mono);font-size:10.5px">client-' + c + '</div><div class="gantt-track">' +
                        times.map(function (ms, i) {
                            var left = Math.min(98, ms / totalMs * 100);
                            return '<i class="gantt-bar ' + (i % 2 ? 'gb-b' : 'gb-a') + '" title="attempt ' + (i + 1) + ' @ ' + ms + ' ms" style="left:' + left.toFixed(2) + '%;width:1.3%;padding:0"></i>';
                        }).join('') + '</div></div>');
                }
                for (var bucket = 0; bucket < totalMs; bucket += 50) {
                    var count = 0;
                    allTimes.forEach(function (times) {
                        times.forEach(function (ms) { if (ms >= bucket && ms < bucket + 50) count++; });
                    });
                    if (count > maxConcurrent) maxConcurrent = count;
                }
                chart.innerHTML = rows.join('');
                note.innerHTML = '<span class="tag">' + (jitter ? 'full jitter: ON' : 'full jitter: OFF') + '</span> ' +
                    'клиентов: ' + clients + ' · одновременных retry в пике: <b>' + maxConcurrent + '</b>' +
                    (jitter ? ' · нагрузка размазана' : ' · retry storm');
                term.info('RetryPolicy(maxAttempts=' + attempts + ', baseDelay=' + base + 'ms, jitter=' + jitter + ')', 'RetryExecutor');
                term.info('clients=' + clients + ' · max simultaneous retries=' + maxConcurrent, 'RetryExecutor');
                if (!jitter) term.warn('без jitter клиенты повторяют синхронно — retry storm', 'RetryExecutor');
                else term.ok('jitter разносит повторы во времени', 'RetryExecutor');
            }
            function clear() {
                chart.innerHTML = '';
                note.innerHTML = '<span class="tag">jitter</span> выключите jitter и запустите снова';
                term.clear();
            }
            host.querySelector('[data-run]').addEventListener('click', run);
            host.querySelector('[data-clear]').addEventListener('click', clear);
        },
        code: [
            { file: 'ExponentialBackoff.java', pkg: 'baileyes.eyes.retryjitter.retry', src:
                    `package baileyes.eyes.retryjitter.retry;

import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

@Component
public class ExponentialBackoff {

    public long delayMillis(int attempt, RetryPolicy policy) {
        long exponential = policy.getBaseDelayMs()
            * (1L << Math.min(attempt - 1, 20));
        long capped = Math.min(exponential, policy.getMaxDelayMs());

        if (!policy.isJitter()) {
            return capped;
        }
        return ThreadLocalRandom.current().nextLong(0, capped + 1);
    }
}` },
            { file: 'RetryExecutor.java', pkg: 'baileyes.eyes.retryjitter.retry', src:
                    `package baileyes.eyes.retryjitter.retry;

import baileyes.eyes.retryjitter.exception.RetryExhaustedException;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j @Component @RequiredArgsConstructor
public class RetryExecutor {

    private final ExponentialBackoff backoff;

    public <T> T execute(Supplier<T> action, RetryPolicy policy) {
        RuntimeException lastError = null;

        for (int attempt = 1; attempt <= policy.getMaxAttempts(); attempt++) {
            try {
                return action.get();
            } catch (RuntimeException e) {
                lastError = e;
                if (attempt == policy.getMaxAttempts()) {
                    break;
                }
                long delay = backoff.delayMillis(attempt, policy);
                log.warn("Attempt {}/{} failed. Retry in {} ms",
                    attempt, policy.getMaxAttempts(), delay);
                sleep(delay);
            }
        }
        throw new RetryExhaustedException(policy.getMaxAttempts(), lastError);
    }

    private void sleep(long delayMs) {
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Retry interrupted", e);
        }
    }
}` },
            { file: 'RetryableAspect.java', pkg: 'baileyes.eyes.retryjitter.aspect', src:
                    `package baileyes.eyes.retryjitter.aspect;

import baileyes.eyes.retryjitter.annotation.Retryable;
import baileyes.eyes.retryjitter.retry.RetryExecutor;
import baileyes.eyes.retryjitter.retry.RetryPolicy;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect @Component @RequiredArgsConstructor
public class RetryableAspect {

    private final RetryExecutor retryExecutor;

    @Around("@annotation(retryable)")
    public Object retry(ProceedingJoinPoint pjp, Retryable retryable) throws Throwable {
        RetryPolicy policy = RetryPolicy.builder()
            .maxAttempts(retryable.maxAttempts())
            .baseDelayMs(retryable.baseDelayMs())
            .maxDelayMs(retryable.maxDelayMs())
            .jitter(retryable.jitter())
            .build();

        return retryExecutor.execute(() -> {
            try {
                return pjp.proceed();
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
        }, policy);
    }
}` }
        ]
    });

    /* ===== 18. DEAD LETTER TOPIC ===== */
    App.registerPattern('dead-letter-topic', {
        title: 'Dead Letter Topic', subtitle: 'Poison message → retries в consumer → orders.DLT → replay', category: 'reliability',
        javaClasses: ['KafkaConsumerConfig', 'OrderListener', 'DlqListener', 'DlqReplayService', 'OrderEvent'],
        essence: '<p><strong>Dead Letter Topic</strong> не даёт «ядовитому» сообщению блокировать partition навсегда. ' +
            '<code>DefaultErrorHandler</code> делает несколько повторных попыток, после чего <code>DeadLetterPublishingRecoverer</code> отправляет запись в <code>orders.DLT</code>. ' +
            'DLT — это карантин: ошибку можно разобрать, исправить и вручную вернуть сообщение в основной топик. Важно не глотать сообщение молча и хранить причину ошибки/заголовки.</p>',
        diagram: function (host) {
            var u = new Uml(880, 270);
            u.box(20, 20, 210, 'orders', 'topic · partition 0', ['normal + poison'], 'spring');
            u.box(280, 20, 240, 'OrderListener', '@KafkaListener', ['+ onOrder(record)', 'throws exception'], 'spring');
            u.box(580, 20, 270, 'DefaultErrorHandler', 'FixedBackOff(1s, 2)', ['+ retry 2 times', '+ recoverer'], 'spring');
            u.box(580, 160, 270, 'DeadLetterPublishingRecoverer', 'DLT recoverer', ['→ orders.DLT'], 'spring');
            u.box(280, 160, 240, 'DlqListener', '@KafkaListener', ['+ onDeadLetter(record)'], 'spring');
            u.box(20, 160, 210, 'DlqReplayService', '@Service', ['+ replay(deadLetter)'], 'spring');
            u.arrow(230, 55, 280, 55, 'dep', 'consume');
            u.arrow(520, 55, 580, 55, 'dep', 'error');
            u.arrow(715, 88, 715, 160, 'dep', 'after retries');
            u.arrow(580, 190, 520, 190, 'dep', 'monitor');
            u.arrow(280, 190, 230, 190, 'dep', 'replay');
            u.arrow(125, 160, 125, 88, 'dep', 'back to orders', 0, -7);
            put(host, u, 'DLT — терминальный карантин, а не бесконечный retry. Replay должен быть осознанной операцией.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-publish>publish normal</button>' +
                '<button class="btn" data-poison>publish poison</button>' +
                '<button class="btn" data-replay>replay DLT (fixed)</button>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="broker" id="dlqBroker" style="grid-template-columns:1fr 1fr 1fr">' +
                '<div class="part" data-col="main"><div class="ph"><span>orders · p0</span><span data-cnt>0</span></div><div data-list></div></div>' +
                '<div class="part" data-col="consumer"><div class="ph"><span>OrderListener</span><span data-cnt>idle</span></div><div id="dlqConsumer" class="data-out">—</div></div>' +
                '<div class="part" data-col="dlt"><div class="ph"><span>orders.DLT</span><span data-cnt>0</span></div><div data-list></div></div>' +
                '</div>' +
                '<div class="two-col" style="margin-top:14px"><div class="panel"><h4>DLT payload</h4><div class="data-out" id="dlqOut">—</div></div><div id="dlqTerm"></div></div>';
            var term = ctx.terminal('OrderListener · DefaultErrorHandler · DLT');
            host.querySelector('#dlqTerm').appendChild(term.node);
            var broker = host.querySelector('#dlqBroker');
            var mainCol = broker.querySelector('[data-col="main"]'), dltCol = broker.querySelector('[data-col="dlt"]');
            var consumerEl = host.querySelector('#dlqConsumer'), outEl = host.querySelector('#dlqOut');
            var mainQueue = [], dlt = [], busy = false, epoch = 0, processed = 0;
            function short(id) { return String(id).slice(0, 8); }
            function renderQueue(col, items, emptyText) {
                var list = col.querySelector('[data-list]');
                col.querySelector('[data-cnt]').textContent = items.length;
                list.innerHTML = items.length
                    ? items.map(function (m) { return '<div class="msg">offset ' + m.offset + ' · ' + short(m.id) + ' · ' + m.payload + '</div>'; }).join('')
                    : '<div class="db-empty">' + emptyText + '</div>';
            }
            function render() {
                renderQueue(mainCol, mainQueue, 'пусто');
                renderQueue(dltCol, dlt, 'пусто');
                if (!busy) consumerEl.textContent = 'idle';
            }
            function complete() {
                busy = false;
                render();
                drain();
            }
            function process(msg) {
                if (epoch !== msg.epoch) return;
                if (!msg.poison) {
                    consumerEl.textContent = 'processing ' + short(msg.id) + '…';
                    term.info('Received order key=' + short(msg.id) + ' offset=' + msg.offset, 'OrderListener');
                    ctx.later(420, function () {
                        if (epoch !== msg.epoch) return;
                        processed++;
                        term.ok('Order ' + short(msg.id) + ' processed', 'OrderListener');
                        complete();
                    });
                    return;
                }
                var attempt = 0;
                function tryOnce() {
                    if (epoch !== msg.epoch) return;
                    attempt++;
                    consumerEl.innerHTML = '<span style="color:var(--warn)">poison ' + short(msg.id) + '</span><br>attempt ' + attempt + '/3';
                    term.warn('Attempt ' + attempt + '/3 failed: IllegalStateException: poison message', 'OrderListener');
                    if (attempt < 3) {
                        ctx.later(650, tryOnce);
                    } else {
                        dlt.push(msg);
                        outEl.innerHTML = '<span class="seg d1">' + esc(msg.payload) + '</span><br><span style="color:var(--faint);font-size:10px">reason: IllegalStateException · original offset ' + msg.offset + '</span>';
                        term.error('DLT: ' + short(msg.id) + ' → orders.DLT after 3 attempts', 'DeadLetterPublishingRecoverer');
                        consumerEl.textContent = 'idle · partition unblocked';
                        complete();
                    }
                }
                term.info('Received poison key=' + short(msg.id) + ' offset=' + msg.offset, 'OrderListener');
                tryOnce();
            }
            function drain() {
                if (busy || !mainQueue.length) return;
                busy = true;
                process(mainQueue.shift());
            }
            function publish(poison) {
                var msg = { id: ctx.uuid(), offset: processed + mainQueue.length + dlt.length, payload: poison ? '{"poison":true}' : '{"order":"ok"}', poison: poison, epoch: epoch };
                mainQueue.push(msg);
                render();
                term.info('produced ' + (poison ? 'poison' : 'normal') + ' message offset=' + msg.offset, 'Kafka');
                drain();
            }
            function replay() {
                if (!dlt.length) { term.warn('DLT пуст — нечего восстанавливать', 'DlqReplayService'); return; }
                var msg = dlt.shift();
                msg.poison = false;
                msg.epoch = epoch;
                mainQueue.push(msg);
                outEl.textContent = '—';
                render();
                term.ok('replayed DLT message ' + short(msg.id) + ' → orders (fixed)', 'DlqReplayService');
                drain();
            }
            function clearAll() {
                epoch++;
                mainQueue = []; dlt = []; busy = false; processed = 0;
                consumerEl.textContent = 'idle'; outEl.textContent = '—';
                render(); term.clear();
            }
            host.querySelector('[data-publish]').addEventListener('click', function () { publish(false); });
            host.querySelector('[data-poison]').addEventListener('click', function () { publish(true); });
            host.querySelector('[data-replay]').addEventListener('click', replay);
            host.querySelector('[data-clear]').addEventListener('click', clearAll);
            render();
        },
        code: [
            { file: 'KafkaConsumerConfig.java', pkg: 'baileyes.eyes.deadletter.config', src:
                    `package baileyes.eyes.deadletter.config;

import org.apache.kafka.common.TopicPartition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaConsumerConfig {

    public static final String DLT_TOPIC = "orders.DLT";

    @Bean
    public DefaultErrorHandler errorHandler(KafkaTemplate<String, String> kafkaTemplate) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
            kafkaTemplate,
            (record, ex) -> new TopicPartition(DLT_TOPIC, record.partition())
        );
        return new DefaultErrorHandler(recoverer, new FixedBackOff(1000L, 2L));
    }
}` },
            { file: 'OrderListener.java', pkg: 'baileyes.eyes.deadletter.listener', src:
                    `package baileyes.eyes.deadletter.listener;

import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j @Component
public class OrderListener {

    @KafkaListener(topics = "orders", groupId = "order-dlq")
    public void onOrder(ConsumerRecord<String, String> record) {
        if (record.value().contains("\\"poison\\":true")) {
            throw new IllegalStateException("Poison message: " + record.key());
        }
        log.info("Order {} processed", record.key());
    }
}` },
            { file: 'DlqReplayService.java', pkg: 'baileyes.eyes.deadletter.service', src:
                    `package baileyes.eyes.deadletter.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j @Service @RequiredArgsConstructor
public class DlqReplayService {

    private final KafkaTemplate<String, String> kafkaTemplate;

    public void replay(ConsumerRecord<String, String> deadLetter) {
        kafkaTemplate.send("orders", deadLetter.key(), deadLetter.value());
        log.info("Replayed DLT message key={} back to orders", deadLetter.key());
    }
}` }
        ]
    });

    /* ===== 19. RETRY TOPIC ===== */
    App.registerPattern('retry-topic', {
        title: 'Retry Topic', subtitle: 'Non-blocking retries: orders → retry-0/1/2 → orders.DLT', category: 'reliability',
        javaClasses: ['OrderListener', 'OrderEvent'],
        essence: '<p><strong>Retry Topic</strong> — это неблокирующий retry для Kafka. Вместо <code>Thread.sleep()</code> внутри consumer-потока сообщение перекладывается в отдельный topic на нужную задержку: ' +
            '<code>orders-retry-0</code>, <code>orders-retry-1</code>, <code>orders-retry-2</code>. Основной partition продолжает обрабатывать другие сообщения. ' +
            'Когда попытки закончились, сообщение уходит в <code>orders.DLT</code>. Spring Kafka умеет создавать эту цепочку через <code>@RetryableTopic</code>.</p>',
        diagram: function (host) {
            var u = new Uml(880, 260);
            u.box(20, 20, 200, 'orders', 'main topic', ['partition 0'], 'spring');
            u.box(280, 20, 230, 'OrderListener', '@RetryableTopic', ['attempts = 4', 'backoff 1s × 2'], 'spring');
            u.box(570, 20, 290, 'orders-retry-0/1/2', 'retry topics', ['delays 1s / 2s / 4s', 'non-blocking'], 'spring');
            u.box(20, 160, 200, 'main consumer', 'continues', ['processes other messages'], 'spring');
            u.box(280, 160, 230, '@DltHandler', 'terminal', ['orders.DLT'], 'spring');
            u.box(570, 160, 290, 'orders.DLT', 'dead letter topic', ['manual replay / alerting'], 'spring');
            u.arrow(220, 55, 280, 55, 'dep', 'consume');
            u.arrow(510, 55, 570, 55, 'dep', 'on failure');
            u.arrow(715, 88, 715, 160, 'dep', 'after attempts');
            u.arrow(570, 190, 510, 190, 'dep', '');
            u.arrow(280, 190, 220, 190, 'dep', '');
            u.arrow(120, 88, 120, 160, 'dep', 'no blocking');
            put(host, u, 'Retry topic держит задержку в Kafka, а не в памяти consumer-потока.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-poison>publish poison</button>' +
                '<button class="btn" data-normal>publish normal</button>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="panel" style="position:relative;overflow:visible"><h4>Non-blocking retry chain</h4>' +
                '<div class="pipe" id="rtPipe">' +
                '<div class="capsule" id="rtCap">order</div>' +
                '<div class="pipe-node" data-node="0"><div class="ord">main</div><div class="nm">orders</div><div class="st" data-st>idle</div></div>' +
                '<div class="pipe-arrow"><svg width="42" height="16"><path d="M0,8 H34" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M32,3 L41,8 L32,13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></div>' +
                '<div class="pipe-node" data-node="1"><div class="ord">delay 1s</div><div class="nm">orders-retry-0</div><div class="st" data-st>idle</div></div>' +
                '<div class="pipe-arrow"><svg width="42" height="16"><path d="M0,8 H34" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M32,3 L41,8 L32,13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></div>' +
                '<div class="pipe-node" data-node="2"><div class="ord">delay 2s</div><div class="nm">orders-retry-1</div><div class="st" data-st>idle</div></div>' +
                '<div class="pipe-arrow"><svg width="42" height="16"><path d="M0,8 H34" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M32,3 L41,8 L32,13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></div>' +
                '<div class="pipe-node" data-node="3"><div class="ord">delay 4s</div><div class="nm">orders-retry-2</div><div class="st" data-st>idle</div></div>' +
                '<div class="pipe-arrow"><svg width="42" height="16"><path d="M0,8 H34" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M32,3 L41,8 L32,13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></div>' +
                '<div class="pipe-node" data-node="4"><div class="ord">terminal</div><div class="nm">orders.DLT</div><div class="st" data-st>idle</div></div>' +
                '</div>' +
                '<div class="order-note"><span class="tag">@RetryableTopic</span> attempts=4 · SUFFIX_WITH_INDEX_VALUE · dltTopicSuffix=".DLT"</div>' +
                '</div>' +
                '<div class="two-col" style="margin-top:14px"><div class="panel"><h4>Main consumer</h4><div class="data-out" id="rtMain">—</div></div><div id="rtTerm"></div></div>';
            var term = ctx.terminal('OrderListener · retry topics');
            host.querySelector('#rtTerm').appendChild(term.node);
            var pipe = host.querySelector('#rtPipe'), cap = host.querySelector('#rtCap'), mainOut = host.querySelector('#rtMain');
            var nodes = Array.prototype.slice.call(pipe.querySelectorAll('.pipe-node'));
            var epoch = 0, normalCount = 0;
            function short(id) { return String(id).slice(0, 8); }
            function setSt(i, txt, cls) {
                var n = nodes[i]; if (!n) return;
                n.querySelector('[data-st]').textContent = txt;
                n.classList.remove('lit', 'done');
                if (cls) n.classList.add(cls);
            }
            function moveTo(i) {
                var n = nodes[i]; if (!n) return;
                cap.classList.add('fly');
                cap.style.left = (n.offsetLeft + n.offsetWidth / 2 - cap.offsetWidth / 2) + 'px';
            }
            function reset() {
                epoch++;
                nodes.forEach(function (_, i) { setSt(i, 'idle'); });
                cap.classList.remove('fly');
                mainOut.textContent = '—';
            }
            function publishNormal() {
                normalCount++;
                var id = ctx.uuid();
                mainOut.innerHTML = '<span class="seg b">order-' + short(id) + ' processed</span>';
                term.ok('main consumer processed order-' + short(id) + ' · normal', 'OrderListener');
            }
            function publishPoison() {
                var id = ctx.uuid();
                reset();
                var myEpoch = epoch;
                cap.textContent = 'poison · ' + short(id);
                term.info('produced poison order-' + short(id) + ' → orders', 'Kafka');
                ctx.later(60, function () { moveTo(0); });
                setSt(0, 'processing…', 'lit');
                ctx.later(500, function () {
                    if (myEpoch !== epoch) return;
                    setSt(0, 'failed', '');
                    term.warn('attempt 1 failed: IllegalStateException → orders-retry-0 (1s)', 'OrderListener');
                    moveTo(1); setSt(1, 'waiting 1s', 'lit');
                    ctx.later(350, function () {
                        if (myEpoch !== epoch) return;
                        publishNormal();
                        term.ok('main consumer is free: processed another order while poison is in retry-0', 'OrderListener');
                    });
                    ctx.later(900, function () {
                        if (myEpoch !== epoch) return;
                        setSt(1, 'failed', '');
                        term.warn('attempt 2 failed → orders-retry-1 (2s)', 'OrderListener');
                        moveTo(2); setSt(2, 'waiting 2s', 'lit');
                    });
                    ctx.later(1900, function () {
                        if (myEpoch !== epoch) return;
                        setSt(2, 'failed', '');
                        term.warn('attempt 3 failed → orders-retry-2 (4s)', 'OrderListener');
                        moveTo(3); setSt(3, 'waiting 4s', 'lit');
                    });
                    ctx.later(3300, function () {
                        if (myEpoch !== epoch) return;
                        setSt(3, 'failed', '');
                        term.error('all attempts exhausted → orders.DLT', 'OrderListener');
                        moveTo(4); setSt(4, 'DLT', 'done');
                        cap.textContent = 'DLT · ' + short(id);
                    });
                });
            }
            host.querySelector('[data-poison]').addEventListener('click', publishPoison);
            host.querySelector('[data-normal]').addEventListener('click', publishNormal);
            host.querySelector('[data-clear]').addEventListener('click', function () { reset(); term.clear(); });
            ctx.later(80, function () { moveTo(0); });
        },
        code: [
            { file: 'OrderListener.java', pkg: 'baileyes.eyes.retrytopic.listener', src:
                    `package baileyes.eyes.retrytopic.listener;

import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.kafka.retrytopic.TopicSuffixingStrategy;
import org.springframework.retry.annotation.Backoff;
import org.springframework.stereotype.Component;

@Slf4j @Component
public class OrderListener {

    @RetryableTopic(
        attempts = "4",
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 8000),
        topicSuffixingStrategy = TopicSuffixingStrategy.SUFFIX_WITH_INDEX_VALUE,
        dltTopicSuffix = ".DLT",
        autoCreateTopics = "true"
    )
    @KafkaListener(topics = "orders", groupId = "order-retry-topic")
    public void onOrder(ConsumerRecord<String, String> record) {
        log.info("Processing key={} from topic={}", record.key(), record.topic());
        if (record.value().contains("\\"poison\\":true")) {
            throw new IllegalStateException("Poison message: " + record.key());
        }
    }

    @DltHandler
    public void onDlt(ConsumerRecord<String, String> record) {
        log.error("DLT after all retries: key={}, value={}",
            record.key(), record.value());
    }
}` },
            { file: 'OrderEvent.java', pkg: 'baileyes.eyes.retrytopic.dto', src:
                    `package baileyes.eyes.retrytopic.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class OrderEvent {

    private String orderId;
    private String payload;
    private boolean poison;
}` }
        ]
    });

    /* ===== 20. BACKPRESSURE ===== */
    App.registerPattern('backpressure', {
        title: 'Backpressure', subtitle: 'Bounded queue + rejection policy: Abort / CallerRuns / Discard', category: 'reliability',
        javaClasses: ['BackpressureProperties', 'ExecutorConfig', 'BoundedQueueService', 'BackpressureController', 'SubmitResult'],
        essence: '<p><strong>Backpressure</strong> — это способ сказать продюсеру «медленнее», когда consumer не успевает. ' +
            'Bounded queue + ограниченный pool не дают памяти и latency расти бесконечно. Когда очередь заполнена, политика выбирает судьбу задачи: ' +
            '<code>AbortPolicy</code> → <code>429/503</code>, <code>CallerRunsPolicy</code> → продюсер выполняет задачу сам, <code>DiscardOldestPolicy</code> → выбрасывает старую задачу. ' +
            'Главное — метрика глубины очереди и явный ответ клиенту, а не молчаливое накопление.</p>',
        diagram: function (host) {
            var u = new Uml(880, 250);
            u.box(20, 20, 230, 'BackpressureController', '@RestController', ['+ POST /api/jobs', '202 / 429 / Retry-After'], 'spring');
            u.box(300, 20, 240, 'BoundedQueueService', '@Service', ['+ submit(jobId)', '+ queueSize()'], 'spring');
            u.box(590, 20, 260, 'ThreadPoolExecutor', 'core=2 · max=2', ['ArrayBlockingQueue(8)', 'AbortPolicy'], 'spring');
            u.box(300, 150, 240, 'BackpressureProperties', '@ConfigurationProperties', ['queueCapacity = 8', 'processingDelayMs = 800'], 'entity');
            u.box(590, 150, 260, 'RejectedExecutionException', 'queue full', ['→ HTTP 429', 'Retry-After: 1'], 'entity');
            u.arrow(250, 55, 300, 55, 'dep', 'submit');
            u.arrow(540, 55, 590, 55, 'dep', 'execute');
            u.arrow(420, 88, 420, 150, 'dep', 'config');
            u.arrow(540, 190, 590, 190, 'dep', 'full');
            put(host, u, 'Очередь ограничена — это и есть backpressure. Без границы отказ откладывается до OOM.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-burst>send 20 jobs</button>' +
                '<button class="btn" data-one>send 1 job</button>' +
                '<div class="field"><span class="lbl">rejection policy</span><select id="bpPolicy">' +
                '<option value="abort">AbortPolicy</option>' +
                '<option value="caller">CallerRunsPolicy</option>' +
                '<option value="oldest">DiscardOldestPolicy</option>' +
                '<option value="discard">DiscardPolicy</option>' +
                '</select></div>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="rl-stage">' +
                '<div class="panel"><h4>Bounded queue · capacity 8 · workers 2</h4>' +
                '<div class="queue-grid" id="bpQueue"></div><div class="metrics" id="bpStats"></div></div>' +
                '<div class="panel"><h4>HTTP / executor</h4><div class="rl-status" id="bpStatus">idle</div>' +
                '<div class="data-out" id="bpOut" style="margin-top:10px">—</div><div id="bpTerm" style="margin-top:12px"></div></div>' +
                '</div>';
            var term = ctx.terminal('BackpressureController · ThreadPoolExecutor');
            host.querySelector('#bpTerm').appendChild(term.node);
            var capacity = 8, workers = 2;
            var queueEl = host.querySelector('#bpQueue'), statsEl = host.querySelector('#bpStats');
            var statusEl = host.querySelector('#bpStatus'), outEl = host.querySelector('#bpOut');
            var active = 0, queue = [], accepted = 0, rejected = 0, dropped = 0, processed = 0, epoch = 0;
            function policy() { return host.querySelector('#bpPolicy').value; }
            function metric(k, v, c) { return '<div class="metric"><div class="k">' + k + '</div><div class="v ' + c + '">' + v + '</div></div>'; }
            function render() {
                var slots = '';
                for (var i = 0; i < capacity; i++) {
                    var filled = i < queue.length;
                    slots += '<div class="qslot' + (filled ? ' filled' : '') + '">' + (filled ? queue[i].replace('job-', 'J') : '·') + '</div>';
                }
                queueEl.innerHTML = slots;
                statsEl.innerHTML =
                    metric('accepted', accepted, 'good') +
                    metric('processed', processed, processed ? 'good' : '') +
                    metric('rejected', rejected, rejected ? 'bad' : '') +
                    metric('dropped', dropped, dropped ? 'warnc' : '') +
                    metric('queue', queue.length + '/' + capacity, queue.length >= capacity ? 'warnc' : '') +
                    metric('active', active + '/' + workers, active === workers ? 'warnc' : '');
            }
            function finish(jobId) {
                active--;
                processed++;
                term.ok('worker finished ' + jobId, 'ThreadPoolExecutor');
                if (queue.length) {
                    var next = queue.shift();
                    start(next);
                }
                render();
            }
            function start(jobId) {
                active++;
                render();
                term.info('worker start ' + jobId + ' · active=' + active, 'ThreadPoolExecutor');
                var myEpoch = epoch;
                ctx.later(900, function () {
                    if (myEpoch !== epoch) return;
                    finish(jobId);
                });
            }
            function enqueue(jobId) {
                if (active < workers) {
                    accepted++;
                    statusEl.textContent = '202 Accepted · worker started';
                    statusEl.className = 'rl-status ok';
                    outEl.innerHTML = '<span class="status-badge s-2xx">202</span> ' + jobId + ' accepted';
                    start(jobId);
                    render();
                    return;
                }
                if (queue.length < capacity) {
                    accepted++;
                    queue.push(jobId);
                    statusEl.textContent = '202 Accepted · queued';
                    statusEl.className = 'rl-status ok';
                    outEl.innerHTML = '<span class="status-badge s-2xx">202</span> ' + jobId + ' queued · depth=' + queue.length;
                    term.info('enqueued ' + jobId + ' · queue=' + queue.length + '/' + capacity, 'ThreadPoolExecutor');
                    render();
                    return;
                }
                var p = policy();
                if (p === 'abort') {
                    rejected++;
                    statusEl.textContent = '429 Too Many Requests · queue full';
                    statusEl.className = 'rl-status err';
                    outEl.innerHTML = '<span class="status-badge s-4xx">429</span> ' + jobId + ' rejected · Retry-After: 1';
                    term.error('RejectedExecutionException: queue full → ' + jobId, 'ThreadPoolExecutor');
                } else if (p === 'caller') {
                    accepted++;
                    statusEl.textContent = 'CallerRunsPolicy · producer executes task inline';
                    statusEl.className = 'rl-status';
                    outEl.innerHTML = '<span class="status-badge s-2xx">202</span> ' + jobId + ' executed by caller thread';
                    term.warn('CallerRunsPolicy: producer thread runs ' + jobId + ' inline', 'ThreadPoolExecutor');
                } else if (p === 'oldest') {
                    var droppedJob = queue.shift();
                    queue.push(jobId);
                    accepted++; dropped++;
                    statusEl.textContent = 'DiscardOldestPolicy · dropped ' + droppedJob;
                    statusEl.className = 'rl-status';
                    outEl.innerHTML = '<span class="status-badge s-2xx">202</span> ' + jobId + ' accepted · dropped ' + droppedJob;
                    term.warn('DiscardOldestPolicy: dropped ' + droppedJob + ', enqueued ' + jobId, 'ThreadPoolExecutor');
                } else {
                    dropped++;
                    statusEl.textContent = 'DiscardPolicy · new task dropped';
                    statusEl.className = 'rl-status err';
                    outEl.innerHTML = '<span class="status-badge s-4xx">DROP</span> ' + jobId + ' silently discarded';
                    term.warn('DiscardPolicy: dropped new ' + jobId, 'ThreadPoolExecutor');
                }
                render();
            }
            function burst() {
                var myEpoch = epoch;
                for (var i = 0; i < 20; i++) {
                    (function (n) {
                        ctx.later(n * 10, function () {
                            if (myEpoch !== epoch) return;
                            enqueue('job-' + n);
                        });
                    })(i);
                }
                term.info('producer burst: 20 jobs', 'Kafka');
            }
            function clearAll() {
                epoch++;
                active = 0; queue = []; accepted = 0; rejected = 0; dropped = 0; processed = 0;
                statusEl.textContent = 'idle'; statusEl.className = 'rl-status'; outEl.textContent = '—';
                render(); term.clear();
            }
            host.querySelector('[data-burst]').addEventListener('click', burst);
            host.querySelector('[data-one]').addEventListener('click', function () { enqueue('job-' + (accepted + rejected + dropped + 1)); });
            host.querySelector('[data-clear]').addEventListener('click', clearAll);
            render();
        },
        code: [
            { file: 'BoundedQueueService.java', pkg: 'baileyes.eyes.backpressure.service', src:
                    `package baileyes.eyes.backpressure.service;

import baileyes.eyes.backpressure.dto.SubmitResult;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j @Service @RequiredArgsConstructor
public class BoundedQueueService {

    private final ThreadPoolExecutor executor;

    public SubmitResult submit(String jobId) {
        try {
            executor.execute(() -> process(jobId));
            return SubmitResult.accepted(jobId, executor.getQueue().size());
        } catch (RejectedExecutionException e) {
            log.warn("Job {} rejected: queue full, active={}",
                jobId, executor.getActiveCount());
            return SubmitResult.rejected(jobId, executor.getQueue().size());
        }
    }

    private void process(String jobId) {
        try {
            Thread.sleep(800L);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        log.info("Job {} processed", jobId);
    }
}` },
            { file: 'ExecutorConfig.java', pkg: 'baileyes.eyes.backpressure.config', src:
                    `package baileyes.eyes.backpressure.config;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ExecutorConfig {

    @Bean(destroyMethod = "shutdown")
    public ThreadPoolExecutor orderExecutor() {
        return new ThreadPoolExecutor(
            2, 2,
            60L, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(8),
            new ThreadPoolExecutor.AbortPolicy()
        );
    }
}` },
            { file: 'BackpressureController.java', pkg: 'baileyes.eyes.backpressure.controller', src:
                    `package baileyes.eyes.backpressure.controller;

import baileyes.eyes.backpressure.dto.JobRequest;
import baileyes.eyes.backpressure.dto.SubmitResult;
import baileyes.eyes.backpressure.service.BoundedQueueService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
@RequiredArgsConstructor
public class BackpressureController {

    private final BoundedQueueService queueService;

    @PostMapping
    public ResponseEntity<SubmitResult> submit(@RequestBody JobRequest request) {
        SubmitResult result = queueService.submit(request.getId());
        if (!result.isAccepted()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, "1")
                .body(result);
        }
        return ResponseEntity.accepted().body(result);
    }
}` }
        ]
    });

    /* ===== 21. CQRS + READ/WRITE SPLITTING ===== */
    App.registerPattern('cqrs', {
        title: 'CQRS + read/write splitting', subtitle: 'PostgreSQL StatefulSet: primary ← writes, headless Service + replicas ← reads', category: 'distributed',
        javaClasses: ['ReadWriteRoutingDataSource', 'DataSourceConfig', 'OrderCommandService', 'OrderQueryService', 'Order', 'OrderRepository', 'OrderController'],
        essence: '<p><strong>CQRS</strong> разделяет команды и запросы. В полном CQRS у чтения и записи разные модели/проекции; здесь показан <em>CQRS-lite</em> — физическое read/write splitting. ' +
            'Обычная <code>@Transactional</code>-транзакция идёт на primary, а <code>@Transactional(readOnly = true)</code> — на реплики через <code>ReadWriteRoutingDataSource</code> и <code>LazyConnectionDataSourceProxy</code>. ' +
            'Headless Service даёт стабильные DNS-имена pod-ов, но не балансирует реплики: для чтения нужен отдельный read-service/оператор. Помните про replication lag, read-your-writes и failover primary.</p>',
        diagram: function (host) {
            var u = new Uml(880, 340);
            u.box(20, 20, 240, 'OrderController', '@RestController', ['+ POST /orders', '+ GET /orders'], 'spring');
            u.box(320, 20, 240, 'OrderCommandService', '@Transactional', ['+ create(request)'], 'spring');
            u.box(320, 140, 240, 'OrderQueryService', '@Transactional(readOnly=true)', ['+ findAll()', '+ findById()'], 'spring');
            u.box(620, 20, 240, 'ReadWriteRoutingDataSource', 'AbstractRoutingDataSource', ['readOnly ? replica : primary', 'LazyConnectionDataSourceProxy'], 'spring');
            u.box(20, 250, 220, 'postgres-0', 'PRIMARY', ['read + write'], 'entity');
            u.box(300, 250, 220, 'postgres-1', 'REPLICA', ['read only'], 'entity');
            u.box(580, 250, 280, 'postgres-2', 'REPLICA', ['postgres-0.postgres-headless', 'headless: stable pod DNS'], 'entity');
            u.arrow(260, 55, 320, 55, 'dep', 'command');
            u.arrow(260, 110, 320, 170, 'dep', 'query');
            u.arrow(560, 55, 620, 55, 'dep', 'route');
            u.arrow(560, 180, 620, 100, 'dep', 'route');
            u.arrow(620, 88, 130, 250, 'dep', 'write');
            u.arrow(660, 88, 410, 250, 'dep', 'read');
            u.arrow(720, 88, 720, 250, 'dep', 'read');
            put(host, u, 'Это CQRS-lite: разделён трафик, но модель данных одна. Full CQRS разделяет ещё и read/write models.');
        },
        demo: function (host, ctx) {
            host.innerHTML =
                '<div class="demo-controls">' +
                '<button class="btn primary" data-write>POST /orders · write</button>' +
                '<button class="btn" data-read>GET /orders · replica</button>' +
                '<button class="btn" data-read-primary>GET · read-your-writes</button>' +
                '<label class="switch"><input type="checkbox" id="cqLag" checked><span class="track"></span>replication lag 2s</label>' +
                '<label class="switch"><input type="checkbox" id="cqDown"><span class="track"></span>primary down</label>' +
                '<button class="btn ghost sm" data-clear>очистить</button>' +
                '</div>' +
                '<div class="cqrs-stage">' +
                '<div class="panel"><h4>PostgreSQL StatefulSet · headless service</h4>' +
                '<div class="pg-grid" id="cqPods">' +
                '<div class="pg-pod primary" data-pod="0"><div class="nm">postgres-0</div><div class="role">primary</div><div class="hint">read + write</div></div>' +
                '<div class="pg-pod replica" data-pod="1"><div class="nm">postgres-1</div><div class="role">replica</div><div class="hint">read only</div></div>' +
                '<div class="pg-pod replica" data-pod="2"><div class="nm">postgres-2</div><div class="role">replica</div><div class="hint">read only</div></div>' +
                '</div>' +
                '<div class="pg-lag"><div class="hint">replication lag</div><div class="bar"><i id="cqLagBar"></i></div></div>' +
                '<div class="hint" style="margin-top:8px">postgres-0.postgres-headless · postgres-1... · postgres-2...</div>' +
                '</div>' +
                '<div class="panel"><h4>ReadWriteRoutingDataSource</h4>' +
                '<div class="cqrs-route"><span class="route write">@Transactional → primary</span><span class="route read">@Transactional(readOnly) → replica</span></div>' +
                '<div class="metrics" id="cqStats"></div>' +
                '<div class="json-view" id="cqOut" style="margin-top:10px;max-height:160px">—</div>' +
                '<div id="cqTerm" style="margin-top:12px"></div></div>' +
                '</div>';
            var term = ctx.terminal('OrderController · ReadWriteRoutingDataSource');
            host.querySelector('#cqTerm').appendChild(term.node);
            var pods = Array.prototype.slice.call(host.querySelectorAll('.pg-pod'));
            var statsEl = host.querySelector('#cqStats'), outEl = host.querySelector('#cqOut'), lagBar = host.querySelector('#cqLagBar');
            var primary = [], replicas = [[], []], writes = 0, replicaReads = 0, consistentReads = 0, stale = 0;
            var roundRobin = 0, epoch = 0;
            function metric(k, v, c) { return '<div class="metric"><div class="k">' + k + '</div><div class="v ' + c + '">' + v + '</div></div>'; }
            function lagOn() { return host.querySelector('#cqLag').checked; }
            function primaryDown() { return host.querySelector('#cqDown').checked; }
            function short(id) { return String(id).slice(0, 8); }
            function flash(index) {
                var p = pods[index]; if (!p) return;
                p.classList.add('lit');
                ctx.later(550, function () { p.classList.remove('lit'); });
            }
            function renderStats() {
                statsEl.innerHTML =
                    metric('writes', writes, writes ? 'good' : '') +
                    metric('replica reads', replicaReads, '') +
                    metric('consistent', consistentReads, '') +
                    metric('stale', stale, stale ? 'bad' : '');
            }
            function show(data) {
                outEl.innerHTML = ctx.hlJson(JSON.stringify(data, null, 2));
            }
            function replicate(order, myEpoch) {
                if (myEpoch !== epoch) return;
                replicas[0].push(order);
                replicas[1].push(order);
                lagBar.style.width = '0%';
                flash(1); flash(2);
                term.info('WAL replay → postgres-1/postgres-2', 'PostgreSQL');
            }
            function write() {
                if (primaryDown()) {
                    term.error('SQLException: primary is down → 503', 'OrderCommandService');
                    show({ status: 503, error: 'primary unavailable' });
                    return;
                }
                var myEpoch = epoch;
                var order = { id: ctx.uuid(), amount: '99.00' };
                primary.push(order); writes++;
                flash(0);
                term.info('BEGIN → primary · INSERT order ' + short(order.id), 'OrderCommandService');
                term.ok('COMMIT on postgres-0', 'PostgreSQL');
                show({ server: 'postgres-0', operation: 'write', orderId: order.id });
                if (lagOn()) {
                    lagBar.style.width = '100%';
                    term.warn('replication lag: 2s — replicas ещё не видели запись', 'PostgreSQL');
                    ctx.later(2000, function () { replicate(order, myEpoch); });
                } else {
                    replicate(order, myEpoch);
                }
                renderStats();
            }
            function read() {
                var myEpoch = epoch;
                roundRobin = (roundRobin + 1) % 2;
                var idx = roundRobin;
                var rows = replicas[idx];
                replicaReads++;
                flash(idx + 1);
                term.info('@Transactional(readOnly=true) → postgres-' + (idx + 1), 'OrderQueryService');
                show({ server: 'postgres-' + (idx + 1), operation: 'read', rows: rows });
                if (rows.length < primary.length) {
                    stale++;
                    term.warn('stale read: replica has ' + rows.length + '/' + primary.length + ' rows', 'PostgreSQL');
                } else {
                    term.ok('read consistent: ' + rows.length + ' rows', 'PostgreSQL');
                }
                renderStats();
            }
            function readPrimary() {
                consistentReads++;
                flash(0);
                term.info('@Transactional → postgres-0 (read-your-writes)', 'OrderQueryService');
                show({ server: 'postgres-0', operation: 'consistent read', rows: primary });
                term.ok('fresh read from primary avoids replication lag', 'PostgreSQL');
                renderStats();
            }
            function clearAll() {
                epoch++;
                primary = []; replicas = [[], []]; writes = 0; replicaReads = 0; consistentReads = 0; stale = 0;
                lagBar.style.width = '0%'; outEl.textContent = '—';
                renderStats(); term.clear();
            }
            host.querySelector('[data-write]').addEventListener('click', write);
            host.querySelector('[data-read]').addEventListener('click', read);
            host.querySelector('[data-read-primary]').addEventListener('click', readPrimary);
            host.querySelector('[data-clear]').addEventListener('click', clearAll);
            renderStats();
        },
        code: [
            { file: 'ReadWriteRoutingDataSource.java', pkg: 'baileyes.eyes.cqrs.datasource', src:
                    `package baileyes.eyes.cqrs.datasource;

import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class ReadWriteRoutingDataSource extends AbstractRoutingDataSource {

    public static final String PRIMARY = "primary";
    public static final String REPLICA = "replica";

    @Override
    protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
            ? REPLICA
            : PRIMARY;
    }
}` },
            { file: 'DataSourceConfig.java', pkg: 'baileyes.eyes.cqrs.config', src:
                    `package baileyes.eyes.cqrs.config;

import baileyes.eyes.cqrs.datasource.ReadWriteRoutingDataSource;
import com.zaxxer.hikari.HikariDataSource;
import java.util.HashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;

@Configuration
public class DataSourceConfig {

    @Bean
    @Primary
    public DataSource dataSource(
        @Qualifier("primaryDataSource") DataSource primary,
        @Qualifier("replicaDataSource") DataSource replica
    ) {
        Map<Object, Object> targets = new HashMap<>();
        targets.put(ReadWriteRoutingDataSource.PRIMARY, primary);
        targets.put(ReadWriteRoutingDataSource.REPLICA, replica);

        ReadWriteRoutingDataSource routing = new ReadWriteRoutingDataSource();
        routing.setTargetDataSources(targets);
        routing.setDefaultTargetDataSource(primary);
        routing.afterPropertiesSet();

        return new LazyConnectionDataSourceProxy(routing);
    }
}` },
            { file: 'OrderCommandService.java', pkg: 'baileyes.eyes.cqrs.service', src:
                    `package baileyes.eyes.cqrs.service;

import baileyes.eyes.cqrs.dto.CreateOrderRequest;
import baileyes.eyes.cqrs.entity.Order;
import baileyes.eyes.cqrs.repository.OrderRepository;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OrderCommandService {

    private final OrderRepository orderRepository;

    @Transactional
    public Order create(CreateOrderRequest request) {
        Order order = new Order();
        order.setId(UUID.randomUUID());
        order.setCustomerId(request.getCustomerId());
        order.setAmount(request.getAmount());
        order.setCreatedAt(Instant.now());
        return orderRepository.save(order);
    }
}` },
            { file: 'OrderQueryService.java', pkg: 'baileyes.eyes.cqrs.service', src:
                    `package baileyes.eyes.cqrs.service;

import baileyes.eyes.cqrs.entity.Order;
import baileyes.eyes.cqrs.repository.OrderRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OrderQueryService {

    private final OrderRepository orderRepository;

    @Transactional(readOnly = true)
    public List<Order> findAll() {
        return orderRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Order findById(UUID id) {
        return orderRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Order not found: " + id));
    }
}` }
        ]
    });

})(window.App);