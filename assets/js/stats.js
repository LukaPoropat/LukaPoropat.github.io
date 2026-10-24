// Observations page: world rank, KPI tiles, charts, facts and the object table.
// Charts are plain SVG: thin bars with 4px rounded data-ends, hairline grid, selective
// labels, per-bar tooltips and a table view for every chart.
// Text follows <html lang> (English or Croatian); data paths follow data-root.
(function () {
	'use strict';

	var HR = document.documentElement.lang === 'hr';
	var ROOT = document.documentElement.getAttribute('data-root') || '';
	// Croatian noun forms depend on the number: [one, few (2-4), many]; English: [one, other]
	var plural = function (n, forms) {
		if (!HR) return n === 1 ? forms[0] : forms[forms.length - 1];
		var a = n % 10, b = n % 100;
		return a === 1 && b !== 11 ? forms[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? forms[1] : forms[2];
	};

	var T = HR ? {
		au: 'AJ', mpecWatch: 'MPEC Watcha', jahn: 'MPEC statistike Josta Jahna', year: 'Godina', klass: 'Razred', colMpecs: 'Broj MPEC-ova', colObjects: 'Broj objekata', toDate: 'do sada',
		mpecs: ['MPEC', 'MPEC-a', 'MPEC-ova'], objects: ['objekt', 'objekta', 'objekata'],
		asTable: 'Prikaži kao tablicu', asChart: 'Prikaži kao grafikon',
		topWorld: 'Prikaži svjetskih top 200', aroundMe: 'Prikaži opažače oko mene',
		topTitle: 'Svjetski top 200', aroundTitle: 'Opažači oko mene na ljestvici',
		moveTitle: function (d, date) {
			if (d === null) return 'izvan prvih 400 na dan ' + date;
			if (d === 0) return 'bez promjene u odnosu na ' + date;
			return (d > 0 ? 'napredak od ' : 'pad od ') + Math.abs(d) + ' mjesta u odnosu na ' + date;
		},
		moveNew: 'novo',
		moveLegend: function (date, rebuilt) {
			return '▲ napredak · ▼ pad · – bez promjene, u usporedbi s poretkom na dan ' + date +
				(rebuilt ? ' (rekonstruiranim iz MPEC cirkulara objavljenih nakon toga)' : '') + '.';
		},
		kpiMpecs: 'MPEC-ovi u kojima sam naveden',
		kpiObjects: 'Promatrani i mjereni objekti', kpiObjectsSub: function (n) { return n + ' s putanjom na karti'; },
		kpiNea: 'Asteroidi blizu Zemlje', kpiNeaSub: function (n) { return 'uklj. ' + fmt(n) + ' ' + plural(n, ['potencijalno opasan', 'potencijalno opasna', 'potencijalno opasnih']); },
		kpiComets: 'Kometi', kpiFirst: 'Prvi u potvrdi', kpiFirstSub: 'MPEC-ovi u kojima je L01 prvi potvrdio objekt',
		kpiSince: 'Opažam od', kpiSinceSub: function (d) { return 'prvi MPEC ' + d; },
		pha: 'Potencijalno opasni', comets: 'Kometi', other: 'Ostalo',
		fVisitor: 'Međuzvjezdani posjetitelj', fVisitorNote: function (d) { return 'Objekt iz drugog zvjezdanog sustava na hiperboličnoj putanji; opažen ' + d + '.'; },
		fSmall: 'Najmanji objekt', fSmallNote: function (a, b, d) { return 'Promjera otprilike ' + a + '–' + b + ' m, opažen ' + d + '.'; },
		fClose: 'Putanja najbliža Zemlji', fCloseNote: function (ld) { return 'Najmanja udaljenost presjeka putanja (MOID): ' + ld + ' udaljenosti Mjeseca.'; },
		fMost: 'Najpraćeniji', fMostNote: function (a, b) { return 'Opažan od ' + a + ' do ' + b + '.'; },
		fBig: 'Najveći objekt', fFar: 'Najudaljeniji perihel', observed: function (c, d) { return c + ', opažen ' + d + '.'; },
		fFirst: 'Prvi objekt', fFirstNote: 'Prvi objekt u MPEC-u u kojem sam naveden.',
		asteroid: 'Asteroid', object: 'Objekt', interstellar: 'Međuzvjezdani komet', comet: 'Komet',
		note: ['Podaci: MPEC-ovi Centra za mala tijela Sunčeva sustava IAU-a (popis cirkulara za L01 s ', ' i iz ', '), putanje iz ',
			'JPL-ove baze malih tijela', '. Generirano ', ' skriptom ', '.'],
		firstBadge: '1.', firstTitle: 'Višnjan je prvi potvrdio ovaj objekt',
		count: function (n) { return fmt(n) + ' ' + plural(n, ['objekt', 'objekta', 'objekata']); }, prev: '‹ Prethodna', next: 'Sljedeća ›',
		page: function (a, b) { return 'Stranica ' + a + ' od ' + b; },
		CLASS: { APO: 'Apollo', ATE: 'Aten', AMO: 'Amor', IEO: 'Atira', MCA: 'Presijeca Marsovu putanju', IMB: 'Unutarnji glavni pojas',
			MBA: 'Glavni pojas', OMB: 'Vanjski glavni pojas', TJN: 'Jupiterov trojanac', CEN: 'Kentaur', TNO: 'Transneptunski objekt',
			PAA: 'Parabolični asteroid', HYA: 'Hiperbolični asteroid', AST: 'Asteroid', JFc: 'Komet Jupiterove obitelji',
			JFC: 'Komet Jupiterove obitelji', HTC: 'Komet Halleyjeva tipa', ETc: 'Komet Enckeova tipa', CTc: 'Komet Chironova tipa',
			COM: 'Dugoperiodični komet', PAR: 'Parabolični komet', HYP: 'Hiperbolični komet' }
	} : {
		au: 'AU', mpecWatch: 'MPEC Watch', jahn: 'Jost Jahn\'s MPEC statistics', year: 'Year', klass: 'Class', colMpecs: 'MPECs', colObjects: 'Objects', toDate: 'to date',
		mpecs: ['MPEC', 'MPECs'], objects: ['object', 'objects'],
		asTable: 'Show as table', asChart: 'Show as chart',
		topWorld: 'Show world top 200', aroundMe: 'Show observers around me',
		topTitle: 'World top 200', aroundTitle: 'Observers ranked around me',
		moveTitle: function (d, date) {
			if (d === null) return 'not in the top 400 on ' + date;
			if (d === 0) return 'no change since ' + date;
			var n = Math.abs(d);
			return (d > 0 ? 'up ' : 'down ') + n + (n === 1 ? ' place' : ' places') + ' since ' + date;
		},
		moveNew: 'new',
		moveLegend: function (date, rebuilt) {
			return '▲ moved up · ▼ moved down · – no change, compared with the ranking on ' + date +
				(rebuilt ? ' (rebuilt from the MPECs published since)' : '') + '.';
		},
		kpiMpecs: 'MPECs crediting me',
		kpiObjects: 'Objects observed', kpiObjectsSub: function (n) { return n + ' with orbits on the map'; },
		kpiNea: 'Near-Earth asteroids', kpiNeaSub: function (n) { return 'incl. ' + fmt(n) + ' potentially hazardous'; },
		kpiComets: 'Comets', kpiFirst: 'First to follow up', kpiFirstSub: 'MPECs where L01 confirmed first',
		kpiSince: 'Observing since', kpiSinceSub: function (d) { return 'first MPEC ' + d; },
		pha: 'Potentially hazardous', comets: 'Comets', other: 'Other',
		fVisitor: 'Interstellar visitor', fVisitorNote: function (d) { return 'An object from another star system, on a hyperbolic orbit; observed ' + d + '.'; },
		fSmall: 'Smallest object', fSmallNote: function (a, b, d) { return 'Roughly ' + a + '–' + b + ' m across, observed ' + d + '.'; },
		fClose: 'Closest orbit to Earth', fCloseNote: function (ld) { return 'Minimum orbit intersection distance: ' + ld + ' lunar distances.'; },
		fMost: 'Most followed', fMostNote: function (a, b) { return 'Observed from ' + a + ' to ' + b + '.'; },
		fBig: 'Largest object', fFar: 'Most distant perihelion', observed: function (c, d) { return c + ', observed ' + d + '.'; },
		fFirst: 'First object', fFirstNote: 'The first object in an MPEC crediting me.',
		asteroid: 'Asteroid', object: 'Object', interstellar: 'Interstellar comet', comet: 'Comet',
		note: ['Data: IAU Minor Planet Center MPECs (list of L01 circulars from ', ' and ', '), orbits from the ',
			'JPL Small-Body Database', '. Generated ', ' by ', '.'],
		firstBadge: '1st', firstTitle: 'Višnjan was the first station to follow it up',
		count: function (n) { return fmt(n) + ' ' + plural(n, ['object', 'objects']); }, prev: '‹ Prev', next: 'Next ›',
		page: function (a, b) { return 'Page ' + a + ' of ' + b; },
		CLASS: { APO: 'Apollo', ATE: 'Aten', AMO: 'Amor', IEO: 'Atira', MCA: 'Mars-crosser', IMB: 'Inner main belt',
			MBA: 'Main belt', OMB: 'Outer main belt', TJN: 'Jupiter trojan', CEN: 'Centaur', TNO: 'TNO', PAA: 'Parabolic asteroid',
			HYA: 'Hyperbolic asteroid', AST: 'Asteroid', JFc: 'Jupiter-family comet', JFC: 'Jupiter-family comet',
			HTC: 'Halley-type comet', ETc: 'Encke-type comet', CTc: 'Chiron-type comet', COM: 'Long-period comet',
			PAR: 'Parabolic comet', HYP: 'Hyperbolic comet' }
	};

	// theme-aware: the light/dark steps live in main.css (--series-*)
	var SERIES = { nea: 'var(--series-1)', pha: 'var(--series-2)', comet: 'var(--series-3)', other: 'var(--series-other)' };
	var GROUP = { apollo: 'nea', aten: 'nea', amor: 'nea', atira: 'nea', pha: 'pha', comet: 'comet', other: 'other' };
	var CLASS = T.CLASS;
	var SVGNS = 'http://www.w3.org/2000/svg';
	var tip = document.getElementById('chart-tip');

	var fmt = function (n) { return Number(n).toLocaleString(HR ? 'hr-HR' : 'en-US'); };
	var person = function (s) { return s.replace(/\.(?=\S)/g, '. '); };
	var ALIAS = { 'C/2025 N1 (ATLAS)': '3I/ATLAS (C/2025 N1)' };  // interstellar designation
	var objName = function (o) { var n = (o.name || o.id).replace(/^\((.*)\)$/, '$1'); return ALIAS[n] || n; };
	var isInterstellar = function (o) { return o.e != null && o.e > 1.2; };
	function el(tag, attrs, text) {
		var e = document.createElement(tag);
		if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
		if (text != null) e.textContent = text;
		return e;
	}
	function svg(tag, attrs) {
		var e = document.createElementNS(SVGNS, tag);
		Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
		return e;
	}
	function mpecUrl(id) {
		var m = /^(\d{4})-([A-Z])(\d+)$/.exec(id);
		if (!m) return 'https://www.minorplanetcenter.net/mpec/RecentMPECs.html';
		var cent = { 18: 'I', 19: 'J', 20: 'K' }[m[1].slice(0, 2)], yy = m[1].slice(2), n = Number(m[3]);
		var B = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		var num = n < 100 ? String(n).padStart(2, '0') : B[Math.floor(n / 10)] + (n % 10);
		return 'https://www.minorplanetcenter.net/mpec/' + cent + yy + '/' + cent + yy + m[2] + num + '.html';
	}
	window.mpecUrl = mpecUrl;

	function showTip(evt, value, label) {
		tip.replaceChildren(el('strong', null, value), el('span', null, label));
		tip.style.display = 'block';
		var x = Math.min(evt.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
		tip.style.left = x + 'px';
		tip.style.top = (evt.clientY + 14) + 'px';
	}
	function hideTip() { tip.style.display = 'none'; }

	// path for a bar with a 4px rounded data-end, square at the baseline
	function columnPath(x, y, w, h) {
		var r = Math.min(4, w / 2, h);
		return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
			'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
	}
	function barPath(x, y, w, h) {
		var r = Math.min(4, h / 2, w);
		return 'M' + x + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
			'V' + (y + h - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) + 'H' + x + 'Z';
	}
	function niceStep(max) {
		var raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
		return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
	}
	var compact = function (v) { return v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'K' : String(v); };

	function tableView(card, head, rows) {
		var body = card.querySelector('.chart-body');
		var btn = card.querySelector('[data-table-toggle]');
		var chart = body.firstChild;
		var table = el('table', { class: 'data-table' });
		var tr = el('tr');
		head.forEach(function (h, i) { tr.appendChild(el('th', i ? { class: 'num' } : null, h)); });
		table.appendChild(el('thead')).appendChild(tr);
		var tb = table.appendChild(el('tbody'));
		rows.forEach(function (r) {
			var row = el('tr');
			r.forEach(function (c, i) { row.appendChild(el('td', i ? { class: 'num' } : null, i ? fmt(c) : c)); });
			tb.appendChild(row);
		});
		table.hidden = true;
		body.appendChild(table);
		btn.addEventListener('click', function () {
			var showTable = table.hidden;
			table.hidden = !showTable; chart.style.display = showTable ? 'none' : '';
			btn.textContent = showTable ? T.asChart : T.asTable;
		});
	}

	// Render at the container's real pixel width (so 24px bars stay 24px) and redraw on resize.
	function mountChart(card, draw) {
		var body = card.querySelector('.chart-body');
		var holder = el('div');
		body.insertBefore(holder, body.firstChild);
		var render = function () { holder.replaceChildren(draw(Math.max(300, Math.round(body.clientWidth)))); };
		render();
		var t;
		window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(render, 150); });
	}

	function columnChart(card, rows, color, unit, col) {
		mountChart(card, function (W) { return drawColumns(W, rows, color, unit); });
		tableView(card, [T.year, col], rows.map(function (r) { return [r.label + (r.note ? ' (' + r.note + ')' : ''), r.value]; }));
	}

	function drawColumns(W, rows, color, unit) {
		var H = 240, padL = 40, padB = 26, padT = 22;
		var plotH = H - padB - padT, plotW = W - padL - 6;
		var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
		var step = niceStep(max), top = Math.ceil(max / step) * step;
		var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img',
			'aria-label': rows.map(function (r) { return r.label + ': ' + r.value; }).join(', ') });
		for (var t = 0; t <= top; t += step) {
			var y = padT + plotH - t / top * plotH;
			s.appendChild(svg('line', { x1: padL, x2: W - 6, y1: y, y2: y, class: t ? 'grid' : 'baseline' }));
			var tx = svg('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end' }); tx.textContent = compact(t); s.appendChild(tx);
		}
		var slot = plotW / rows.length, bw = Math.min(24, slot * 0.55);
		var maxIdx = rows.reduce(function (b, r, i) { return r.value > rows[b].value ? i : b; }, 0);
		rows.forEach(function (r, i) {
			var x = padL + i * slot + (slot - bw) / 2, h = r.value / top * plotH, y = padT + plotH - h;
			var hit = svg('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH + padB, fill: 'transparent', class: 'hit', tabindex: 0 });
			var bar = svg('path', { d: columnPath(x, y, bw, Math.max(h, 0.5)), style: 'fill:' + color, class: 'bar' });
			var lab = svg('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }); lab.textContent = r.label;
			var label = r.label + (r.note ? ' (' + r.note + ')' : '');
			var on = function (e) { bar.classList.add('is-hot'); showTip(e, fmt(r.value) + ' ' + plural(r.value, unit), label); };
			hit.addEventListener('pointermove', on);
			hit.addEventListener('pointerleave', function () { bar.classList.remove('is-hot'); hideTip(); });
			hit.addEventListener('focus', function () {
				var b = hit.getBoundingClientRect(); on({ clientX: b.left + b.width / 2, clientY: b.top + 20 });
			});
			hit.addEventListener('blur', function () { bar.classList.remove('is-hot'); hideTip(); });
			s.append(bar, lab, hit);
			if (i === maxIdx || i === rows.length - 1) {
				var v = svg('text', { x: x + bw / 2, y: y - 7, 'text-anchor': 'middle', class: 'value' });
				v.textContent = fmt(r.value) + (r.note && i === rows.length - 1 ? '*' : ''); s.appendChild(v);
			}
		});
		return s;
	}

	function barChart(card, rows, unit, col) {
		mountChart(card, function (W) { return drawBars(W, rows, unit); });
		tableView(card, [T.klass, col], rows.map(function (r) { return [r.label, r.value]; }));
	}

	function drawBars(W, rows, unit) {
		var rowH = 34, padL = 150, padR = 56, H = rows.length * rowH + 8;
		var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
		var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img',
			'aria-label': rows.map(function (r) { return r.label + ': ' + r.value; }).join(', ') });
		s.appendChild(svg('line', { x1: padL, x2: padL, y1: 0, y2: H - 4, class: 'baseline' }));
		rows.forEach(function (r, i) {
			var y = i * rowH + 8, bh = 18, w = Math.max(2, r.value / max * (W - padL - padR));
			var lab = svg('text', { x: padL - 10, y: y + 13, 'text-anchor': 'end' }); lab.textContent = r.label;
			var bar = svg('path', { d: barPath(padL + 1, y, w, bh), style: 'fill:' + r.color, class: 'bar' });
			var val = svg('text', { x: padL + w + 8, y: y + 13, class: 'value' }); val.textContent = fmt(r.value);
			var hit = svg('rect', { x: 0, y: y - 6, width: W, height: rowH, fill: 'transparent', class: 'hit', tabindex: 0 });
			var on = function (e) { bar.classList.add('is-hot'); showTip(e, fmt(r.value) + ' ' + plural(r.value, unit), r.label); };
			hit.addEventListener('pointermove', on);
			hit.addEventListener('pointerleave', function () { bar.classList.remove('is-hot'); hideTip(); });
			hit.addEventListener('focus', function () { var b = hit.getBoundingClientRect(); on({ clientX: b.left + padL, clientY: b.top + 10 }); });
			hit.addEventListener('blur', function () { bar.classList.remove('is-hot'); hideTip(); });
			s.append(lab, bar, val, hit);
		});
		return s;
	}

	function kpi(host, label, value, sub) {
		var d = el('div', { class: 'kpi' });
		d.append(el('div', { class: 'kpi-label' }, label), el('div', { class: 'kpi-value' }, value));
		if (sub) d.appendChild(el('div', { class: 'kpi-sub' }, sub));
		host.appendChild(d);
	}

	// ------------------------------------------------------------- rank
	function renderRank(rank) {
		if (!rank || !rank.observer) return;
		var o = rank.observer;
		document.getElementById('rank-marker').style.left = (100 * (o.rank - 1) / (o.of - 1)).toFixed(2) + '%';
		document.getElementById('rank-date').textContent = rank.generated.slice(0, 10);
		var table = document.getElementById('rank-table'), tbody = table.querySelector('tbody');
		var since = o.compared_to;  // last month's ranking, for the arrows
		table.classList.toggle('no-move', !since);
		if (since) document.getElementById('rank-legend').textContent = T.moveLegend(since, o.compared_reconstructed);
		var showingTop = false;
		// ▲ green: moved up, ▼ red: moved down, – grey: same place as a month ago
		function move(r) {
			var td = el('td', { class: 'move' });
			if (!since || r.prev === undefined) return td;
			var d = r.prev === null ? null : r.prev - r.rank;
			var kind = d === null || d > 0 ? 'up' : d < 0 ? 'down' : 'same';
			var text = d === null ? '▲ ' + T.moveNew : d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + (-d) : '–';
			td.append(el('span', { class: 'mv mv-' + kind, title: T.moveTitle(d, since), 'aria-hidden': 'true' }, text),
				el('span', { class: 'visually-hidden' }, T.moveTitle(d, since)));
			return td;
		}
		function fill(list) {
			tbody.replaceChildren();
			list.forEach(function (r) {
				var tr = el('tr', r.name === rank.name ? { class: 'is-me' } : null);
				tr.append(el('td', { class: 'num' }, r.rank), move(r), el('td', null, person(r.name)),
					el('td', { class: 'num' }, fmt(r.count)), el('td', null, r.stations.join(', ')));
				tbody.appendChild(tr);
			});
		}
		fill(o.neighbours);
		var btn = document.getElementById('rank-toggle');
		btn.addEventListener('click', function () {
			showingTop = !showingTop;
			fill(showingTop ? o.top : o.neighbours);
			table.parentNode.classList.toggle('is-long', showingTop);  // 200 rows scroll inside the box
			table.parentNode.scrollTop = 0;
			btn.textContent = showingTop ? T.aroundMe : T.topWorld;
			document.getElementById('rank-title').textContent = showingTop ? T.topTitle : T.aroundTitle;
		});
	}

	// ------------------------------------------------------------- observations
	function renderObs(data) {
		var S = data.summary, objs = data.objects;
		var count = function (f) { return objs.filter(f).length; };
		var neas = count(function (o) { return GROUP[o.cat] === 'nea' || o.cat === 'pha'; });
		var phas = count(function (o) { return o.cat === 'pha'; });
		var comets = count(function (o) { return o.cat === 'comet'; });
		var host = document.getElementById('obs-kpis');
		kpi(host, T.kpiMpecs, fmt(S.mpecs));  // one total: measuring counts as observing
		kpi(host, T.kpiObjects, fmt(S.objects), T.kpiObjectsSub(fmt(S.with_orbit)));
		kpi(host, T.kpiNea, fmt(neas), T.kpiNeaSub(phas));
		kpi(host, T.kpiComets, fmt(comets));
		kpi(host, T.kpiFirst, fmt(S.first_followups), T.kpiFirstSub);
		if (S.first_mpec) kpi(host, T.kpiSince, S.first_mpec.slice(0, 4), T.kpiSinceSub(S.first_mpec));

		// per-year columns
		var years = Object.keys(S.mpecs_by_year).sort();
		var thisYear = String(new Date().getFullYear());
		columnChart(document.getElementById('chart-years'), years.map(function (y) {
			return { label: y, value: S.mpecs_by_year[y], note: y === thisYear ? T.toDate : '' };
		}), SERIES.nea, T.mpecs, T.colMpecs);

		// classes
		var classes = [
			['Apollo', function (o) { return o.cat === 'apollo'; }, SERIES.nea],
			['Amor', function (o) { return o.cat === 'amor'; }, SERIES.nea],
			['Aten', function (o) { return o.cat === 'aten'; }, SERIES.nea],
			['Atira', function (o) { return o.cat === 'atira'; }, SERIES.nea],
			[T.pha, function (o) { return o.cat === 'pha'; }, SERIES.pha],
			[T.comets, function (o) { return o.cat === 'comet'; }, SERIES.comet],
			[T.other, function (o) { return o.cat === 'other'; }, SERIES.other],
		].map(function (c) { return { label: c[0], value: count(c[1]), color: c[2] }; }).filter(function (r) { return r.value > 0; });
		barChart(document.getElementById('chart-classes'), classes, T.objects, T.colObjects);

		// facts
		var facts = document.getElementById('facts');
		function fact(label, o, value, note) {
			if (!o) return;
			var d = el('div', { class: 'fact' });
			var v = el('div', { class: 'fact-value' });
			var a = el('a', { href: '#orrery', 'data-object': o.id }, objName(o));
			a.addEventListener('click', function () { window.dispatchEvent(new CustomEvent('orrery:select', { detail: o.id })); });
			v.appendChild(a);
			if (value) v.appendChild(document.createTextNode(' · ' + value));
			d.append(el('div', { class: 'fact-label' }, label), v, el('div', { class: 'fact-note' }, note));
			facts.appendChild(d);
		}
		var asts = objs.filter(function (o) { return o.cat !== 'comet' && o.H != null; });
		var by = function (list, key, dir) { return list.slice().sort(function (a, b) { return dir * (a[key] - b[key]); })[0]; };
		var dec = function (x, n) { return HR ? x.toFixed(n).replace('.', ',') : x.toFixed(n); };
		var visitor = by(objs.filter(isInterstellar), 'e', -1);
		if (visitor) fact(T.fVisitor, visitor, 'e = ' + dec(visitor.e, 2), T.fVisitorNote(visitor.first));
		var small = by(asts, 'H', -1);
		if (small) {
			var d = function (p) { return 1329 / Math.sqrt(p) * Math.pow(10, -small.H / 5) * 1000; };
			fact(T.fSmall, small, 'H = ' + dec(small.H, 1), T.fSmallNote(Math.round(d(0.25)), Math.round(d(0.05)), small.first));
		}
		var close = by(objs.filter(function (o) { return o.moid != null; }), 'moid', 1);
		if (close) fact(T.fClose, close, dec(close.moid, 5) + ' ' + T.au, T.fCloseNote(dec(close.moid * 389.17, 2)));
		var most = objs.slice().sort(function (a, b) { return b.mpecs.length - a.mpecs.length || b.nobs - a.nobs; })[0];
		if (!visitor && most && most.mpecs.length > 2) fact(T.fMost, most, most.mpecs.length + ' ' + plural(most.mpecs.length, T.mpecs), T.fMostNote(most.first, most.last));
		var big = by(asts, 'H', 1);
		if (big) fact(T.fBig, big, 'H = ' + dec(big.H, 1), T.observed(CLASS[big.cls] || T.asteroid, big.first));
		var far = by(objs.filter(function (o) { return o.q != null; }), 'q', -1);
		if (far) fact(T.fFar, far, 'q = ' + dec(far.q, 2) + ' ' + T.au, T.observed(CLASS[far.cls] || T.object, far.first));
		var first = objs.slice().sort(function (a, b) { return a.first < b.first ? -1 : 1; })[0];
		if (first) fact(T.fFirst, first, first.first, T.fFirstNote);

		var note = document.getElementById('data-note'), N = T.note;
		note.append(N[0],
			el('a', { href: 'https://sbnmpc.astro.umd.edu/mpecwatch/byStation/station_L01.html', target: '_blank', rel: 'noopener' }, T.mpecWatch),
			N[1], el('a', { href: 'https://mpec.jostjahn.de/', target: '_blank', rel: 'noopener' }, T.jahn),
			N[2], el('a', { href: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html', target: '_blank', rel: 'noopener' }, N[3]),
			N[4] + String(data.generated).slice(0, 10) + N[5], el('a', { href: ROOT + 'tools/build_observations.py' }, 'tools/build_observations.py'), N[6]);

		objectTable(objs);
	}

	// ------------------------------------------------------------- object table
	function objectTable(objs) {
		var rows = objs.map(function (o) {
			var cls = isInterstellar(o) ? T.interstellar : o.cat === 'pha' ? (CLASS[o.cls] || '') + ' · PHA' : (CLASS[o.cls] || (o.cat === 'comet' ? T.comet : T.other));
			return { o: o, name: objName(o), cls: cls,
				H: o.H, moid: o.moid, first: o.first, n: o.mpecs.length, group: GROUP[o.cat] || o.cat };
		});
		var state = { q: '', type: 'all', sort: 'first', dir: -1, page: 0 }, per = 25;
		var tbody = document.querySelector('#obj-table tbody'), pager = document.getElementById('obj-pager');
		var dec = function (x, n) { return HR ? x.toFixed(n).replace('.', ',') : x.toFixed(n); };
		function render() {
			var q = state.q.toLowerCase();
			var list = rows.filter(function (r) {
				return (state.type === 'all' || r.group === state.type) && (!q || r.name.toLowerCase().indexOf(q) >= 0 || r.o.id.toLowerCase().indexOf(q) >= 0);
			});
			list.sort(function (a, b) {
				var x = a[state.sort], y = b[state.sort];
				if (x == null) return 1; if (y == null) return -1;
				return (x < y ? -1 : x > y ? 1 : 0) * state.dir;
			});
			var pages = Math.max(1, Math.ceil(list.length / per));
			state.page = Math.min(state.page, pages - 1);
			tbody.replaceChildren();
			list.slice(state.page * per, state.page * per + per).forEach(function (r) {
				var tr = el('tr');
				var nameTd = el('td');
				var dot = el('span', { class: 'dot', 'aria-hidden': 'true' }); dot.style.background = SERIES[r.group];
				var a = el('a', { href: '#orrery' }, r.name);
				a.addEventListener('click', function () { window.dispatchEvent(new CustomEvent('orrery:select', { detail: r.o.id })); });
				nameTd.append(dot, a);
				if (r.o.ff) { nameTd.append(' '); nameTd.appendChild(el('span', { class: 'badge-ff', title: T.firstTitle }, T.firstBadge)); }
				var mp = el('td', { class: 'num' });
				mp.appendChild(el('a', { href: mpecUrl(r.o.mpecs[r.o.mpecs.length - 1]), target: '_blank', rel: 'noopener' }, String(r.n)));
				tr.append(nameTd, el('td', null, r.cls), el('td', { class: 'num' }, r.H != null ? dec(r.H, 1) : '–'),
					el('td', { class: 'num' }, r.moid != null ? dec(r.moid, 4) : '–'), el('td', null, r.first), mp);
				tbody.appendChild(tr);
			});
			document.getElementById('obj-count').textContent = T.count(list.length);
			pager.replaceChildren();
			var prev = el('button', { type: 'button' }, T.prev), next = el('button', { type: 'button' }, T.next);
			prev.disabled = state.page === 0; next.disabled = state.page >= pages - 1;
			prev.addEventListener('click', function () { state.page--; render(); });
			next.addEventListener('click', function () { state.page++; render(); });
			pager.append(prev, el('span', null, T.page(state.page + 1, pages)), next);
		}
		document.getElementById('obj-search').addEventListener('input', function (e) { state.q = e.target.value; state.page = 0; render(); });
		document.getElementById('obj-class').addEventListener('change', function (e) { state.type = e.target.value; state.page = 0; render(); });
		document.querySelectorAll('#obj-table [data-sort]').forEach(function (b) {
			b.addEventListener('click', function () {
				var k = b.dataset.sort;
				state.dir = state.sort === k ? -state.dir : (k === 'name' || k === 'cls' ? 1 : -1);
				state.sort = k; render();
			});
		});
		render();
	}

	var get = function (u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
	Promise.all([get(ROOT + 'data/rank.json'), get(ROOT + 'data/observations.json')]).then(function (res) {
		renderRank(res[0]);
		if (res[1]) renderObs(res[1]);
	});
})();
