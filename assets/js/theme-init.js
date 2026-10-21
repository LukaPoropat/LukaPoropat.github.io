// Loaded in <head> before the page paints: NASA theme by default, dark if the visitor chose it,
// ?theme=light / ?theme=logbook to preview the other looks. (A file, not inline, so the CSP can forbid inline scripts.)
(function () {
	try {
		var q = new URLSearchParams(location.search).get('theme'), s = localStorage.getItem('theme'), t = q || s || 'nasa';
		document.documentElement.setAttribute('data-theme', t);
		document.documentElement.style.colorScheme = t === 'dark' ? 'dark' : 'light';
	} catch (e) { /* storage blocked: keep the default theme */ }
})();
