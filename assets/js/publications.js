// Publications page: highlight list (comets and PHAs) and the searchable MPEC table.
(function () {
	'use strict';
	var plural = function (n, forms) { return n === 1 ? forms[0] : forms[1]; };  // [one, other]
	var T = {
		months: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'],
		date: function (y, m, d) { return y + ' ' + m + ' ' + d; },
		circular: 'Minor Planet Electronic Circular',
		kFirst: 'First to follow up', kFirstSub: 'circulars where Višnjan confirmed the object first',
		kMpecs: 'MPECs crediting me',
		badgeLong: '1st follow-up', badge: '1st', badgeTitle: 'Višnjan was the first station to follow it up',
		more: function (n) { return n + ' more in the complete list below.'; }, none: 'None yet.',
		count: function (n) { return fmt(n) + ' ' + plural(n, ['circular', 'circulars']); }, prev: '‹ Prev', next: 'Next ›',
		page: function (a, b) { return 'Page ' + a + ' of ' + b; }, comet: 'Comet ',
		TYPES: { 'NEA (H>22)': 'NEA, small (H > 22)', 'NEA (18>H>22)': 'NEA, medium (H 18–22)', 'NEAl18': 'NEA, large (H < 18)',
			'PHAg18': 'PHA (H > 18)', 'PHAl18': 'PHA, large (H < 18)', 'Unusual': 'Unusual orbit', 'Comet': 'Comet', '': 'Other' }
	};
	var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
	var safeUrl = function (u) { return /^https:\/\//.test(u || '') ? u : 'https://www.minorplanetcenter.net/mpec/RecentMPECs.html'; };
	var niceDate = function (d) { var p = d.split('-'); return T.date(p[0], T.months[+p[1] - 1], +p[2]); };
	function el(tag, attrs, text) {
		var e = document.createElement(tag);
		if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
		if (text != null) e.textContent = text;
		return e;
	}
	function kpi(host, label, value, sub) {
		var d = el('div', { class: 'kpi' });
		d.append(el('div', { class: 'kpi-label' }, label), el('div', { class: 'kpi-value' }, value));
		if (sub) d.appendChild(el('div', { class: 'kpi-sub' }, sub));
		host.insertBefore(d, host.firstChild);
	}
	// MPEC Watch object-type codes -> readable labels
	var typeName = function (t) { return T.TYPES[t || ''] || t; };
	// MPEC titles are upper-case ("COMET C/2026 H2 (Leonard)", "OBSERVATIONS AND ORBITS OF COMETS ...").
	function prettyTitle(t) {
		if (/^COMET /.test(t)) return T.comet + t.slice(6);
		if (/^[A-Z]{3,} [A-Z]+ [A-Z]+/.test(t)) {  // prose titles only, not designations like 3I/ATLAS
			return (t.charAt(0) + t.slice(1).toLowerCase()).replace(/\ba\//g, 'A/');
		}
		return t;
	}

	fetch('data/observations.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (data) {
		var mpecs = data.mpecs, S = data.summary;
		var host = document.getElementById('pub-kpis');
		kpi(host, T.kFirst, fmt(S.first_followups), T.kFirstSub);
		kpi(host, T.kMpecs, fmt(S.mpecs), (S.first_mpec || '').slice(0, 4) + '–' + (S.last_mpec || '').slice(0, 4));

		// highlights: comets and PHAs, newest first, one entry per circular
		var hl = document.getElementById('highlights-list');
		var cats = {};
		data.objects.forEach(function (o) { o.mpecs.forEach(function (id) { cats[id] = cats[id] || o.cat; }); });
		var interstellar = function (m) { return /\b\dI\//.test(m.t); };
		var picks = mpecs.filter(function (m) { return m.ty === 'Comet' || /^PHA/.test(m.ty) || cats[m.id] === 'pha'; });
		picks.sort(function (a, b) { return interstellar(b) - interstellar(a); });  // interstellar first, then newest
		picks.slice(0, 40).forEach(function (m) {
			var p = el('p', { class: 'ds-ref' });
			var a = el('a', { href: safeUrl(m.u), target: '_blank', rel: 'noopener' });
			var icon = el('i', { class: interstellar(m) ? 'fa-solid fa-star' : m.ty === 'Comet' ? 'fa-solid fa-meteor' : 'fa-solid fa-triangle-exclamation', 'aria-hidden': 'true' });
			a.append(icon, el('strong', null, 'MPEC ' + m.id), document.createTextNode(': ' + prettyTitle(m.t) + '. ' + T.circular + ', ' + niceDate(m.d) + '.'));
			p.appendChild(a);
			if (m.ff) { p.append(' '); p.appendChild(el('span', { class: 'badge-ff', title: T.badgeTitle }, T.badgeLong)); }
			hl.appendChild(p);
		});
		if (picks.length > 40) hl.appendChild(el('p', { class: 'source-note' }, T.more(picks.length - 40)));
		if (!picks.length) hl.appendChild(el('p', null, T.none));

		// table
		var yearSel = document.getElementById('pub-year'), typeSel = document.getElementById('pub-type');
		Array.from(new Set(mpecs.map(function (m) { return m.d.slice(0, 4); }))).sort().reverse().forEach(function (y) { yearSel.appendChild(el('option', { value: y }, y)); });
		Array.from(new Set(mpecs.map(function (m) { return m.ty || ''; }))).sort().forEach(function (t) { typeSel.appendChild(el('option', { value: t || 'Other' }, typeName(t))); });
		var state = { q: '', year: 'all', type: 'all', ff: false, page: 0 }, per = 30;
		var tbody = document.querySelector('#pub-table tbody'), pager = document.getElementById('pub-pager');
		function render() {
			var q = state.q.toLowerCase();
			var list = mpecs.filter(function (m) {
				return (state.year === 'all' || m.d.slice(0, 4) === state.year) && (state.type === 'all' || (m.ty || 'Other') === state.type) &&
					(!state.ff || m.ff) && (!q || m.id.toLowerCase().indexOf(q) >= 0 || m.t.toLowerCase().indexOf(q) >= 0);
			});
			var pages = Math.max(1, Math.ceil(list.length / per));
			state.page = Math.min(state.page, pages - 1);
			tbody.replaceChildren();
			list.slice(state.page * per, state.page * per + per).forEach(function (m) {
				var tr = el('tr');
				var c = el('td'); c.appendChild(el('a', { href: safeUrl(m.u), target: '_blank', rel: 'noopener' }, 'MPEC ' + m.id));
				var o = el('td', null, prettyTitle(m.t));
				if (m.ff) { o.append(' '); o.appendChild(el('span', { class: 'badge-ff', title: T.badgeTitle }, T.badge)); }
				tr.append(c, o, el('td', null, m.d), el('td', null, typeName(m.ty)));
				tbody.appendChild(tr);
			});
			document.getElementById('pub-count').textContent = T.count(list.length);
			pager.replaceChildren();
			var prev = el('button', { type: 'button' }, T.prev), next = el('button', { type: 'button' }, T.next);
			prev.disabled = state.page === 0; next.disabled = state.page >= pages - 1;
			prev.addEventListener('click', function () { state.page--; render(); });
			next.addEventListener('click', function () { state.page++; render(); });
			pager.append(prev, el('span', null, T.page(state.page + 1, pages)), next);
		}
		document.getElementById('pub-search').addEventListener('input', function (e) { state.q = e.target.value; state.page = 0; render(); });
		yearSel.addEventListener('change', function () { state.year = yearSel.value; state.page = 0; render(); });
		typeSel.addEventListener('change', function () { state.type = typeSel.value; state.page = 0; render(); });
		document.getElementById('pub-ff').addEventListener('change', function (e) { state.ff = e.target.checked; state.page = 0; render(); });
		render();
	});
})();
