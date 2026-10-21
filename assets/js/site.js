// Shared page behaviour: footer year, theme switch, headshot fallback, live numbers.
// Elements with data-bind="rank.observer.count" (etc.) are filled from data/*.json;
// the numbers written in the HTML stay as the fallback when the JSON can't load.
(function () {
	'use strict';

	var html = document.documentElement;

	document.querySelectorAll('[data-year]').forEach(function (el) {
		el.textContent = new Date().getFullYear();
	});

	// Theme switch in the top-right corner: the NASA theme is native for every visitor;
	// dark only when they switch to it (remembered per browser). The <head> of each page sets
	// data-theme before paint; ?theme=light / ?theme=logbook preview the other looks.
	(function () {
		var stored = function () { try { return localStorage.getItem('theme'); } catch (e) { return null; } };
		var forced = new URLSearchParams(location.search).get('theme');
		if (!html.dataset.theme) html.dataset.theme = forced || stored() || 'nasa';
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'theme-toggle';
		function paint() {
			var isDark = html.dataset.theme === 'dark';
			btn.innerHTML = isDark ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>' : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
			btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
			btn.title = btn.getAttribute('aria-label');
		}
		btn.addEventListener('click', function () {
			var next = html.dataset.theme === 'dark' ? 'nasa' : 'dark';
			html.dataset.theme = next;
			html.style.colorScheme = next === 'dark' ? 'dark' : 'light';
			try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
			paint();
		});
		paint();
		document.body.appendChild(btn);
	})();

	// Portrait: use assets/images/headshot.jpg when present, otherwise an astrophoto.
	document.querySelectorAll('img[data-fallback]').forEach(function (img) {
		function useFallback() {
			if (img.dataset.fellBack) return;
			img.dataset.fellBack = '1';
			img.src = img.dataset.fallback;
			img.alt = img.dataset.fallbackAlt || '';
			var cap = img.parentElement.querySelector('figcaption');
			if (cap && img.dataset.fallbackCaption) {
				cap.textContent = img.dataset.fallbackCaption;
				cap.hidden = false;
			}
		}
		img.addEventListener('error', useFallback);
		if (img.complete && img.naturalWidth === 0) useFallback();
	});

	// Social links whose URL hasn't been filled in yet (href="") stay hidden.
	document.querySelectorAll('a[data-social][href=""]').forEach(function (a) {
		a.closest('li').hidden = true;
	});

	// Figures whose image hasn't been added yet stay hidden instead of showing a broken icon.
	document.querySelectorAll('img[data-optional]').forEach(function (img) {
		function hide() { var fig = img.closest('figure'); if (fig) fig.hidden = true; }
		img.addEventListener('error', hide);
		if (img.complete && img.naturalWidth === 0) hide();
	});

	var bound = document.querySelectorAll('[data-bind]');
	if (!bound.length) return;

	var fmt = function (n) { return typeof n === 'number' ? n.toLocaleString('en-US') : n; };
	var ordinal = function (n) {
		var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	};

	function lookup(data, path) {
		var parts = path.split('.');
		var root = parts.shift();
		if (root === 'rank') {
			var r = data.rank;
			if (!r) return undefined;
			if (parts[0] === 'station') {
				var m = (r.station.ranks || []).filter(function (x) { return x.metric === parts.slice(1).join('.'); })[0];
				return m && m.rank;
			}
			if (parts[0] === 'fu') {  // Višnjan's follow-up placing in the last complete year
				return r.station.followup_year ? r.station.followup_year[parts[1]] : undefined;
			}
			if (parts[0] === 'observer' && parts[1] === 'top' && r.observer) {
				return Math.max(1, Math.ceil(100 * r.observer.rank / r.observer.of));
			}
			return parts.reduce(function (o, k) { return o == null ? o : o[k]; }, r);
		}
		if (root === 'obs') {
			return parts.reduce(function (o, k) { return o == null ? o : o[k]; }, data.obs);
		}
	}

	var wantsObs = Array.prototype.some.call(bound, function (el) { return el.dataset.bind.indexOf('obs.') === 0; });
	var getJSON = function (url) {
		return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
	};
	Promise.all([getJSON('data/rank.json'), wantsObs ? getJSON('data/observations.json') : null]).then(function (res) {
		var data = { rank: res[0], obs: res[1] };
		bound.forEach(function (el) {
			var v = lookup(data, el.dataset.bind);
			if (v === undefined || v === null) return;
			// data-ordinal: 5 -> "5th"; data-raw: no thousands separator (years)
			el.textContent = el.hasAttribute('data-ordinal') ? ordinal(v) : el.hasAttribute('data-raw') ? String(v) : fmt(v);
		});
	});
})();
