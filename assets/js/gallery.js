// Gallery page: AstroBin images from data/gallery.json in a grid, with a lightbox.
(function () {
	'use strict';
	var HR = document.documentElement.lang === 'hr';
	var ROOT = document.documentElement.getAttribute('data-root') || '';
	var grid = document.getElementById('gallery');
	var box = document.getElementById('lightbox');
	var img = box.querySelector('img');
	var items = [];
	var current = 0;
	var months = HR ? ['siječanj', 'veljača', 'ožujak', 'travanj', 'svibanj', 'lipanj', 'srpanj', 'kolovoz', 'rujan', 'listopad', 'studeni', 'prosinac']
		: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function nice(d) { var p = d.split('-'); return months[+p[1] - 1] + ' ' + p[0] + (HR ? '.' : ''); }

	function show(i) {
		current = (i + items.length) % items.length;
		var it = items[current];
		img.src = ROOT + it.src;
		img.alt = it.title;
		box.querySelector('.lb-title').textContent = it.title;
		box.querySelector('.lb-date').textContent = nice(it.date);
		box.querySelector('.lb-link').href = it.url;
		if (!box.open) box.showModal();
	}
	box.addEventListener('click', function (e) {
		var step = e.target.closest('[data-step]');
		if (step) return show(current + Number(step.dataset.step));
		if (e.target.closest('[data-close]') || e.target === box) box.close();
	});
	box.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight') show(current + 1);
		if (e.key === 'ArrowLeft') show(current - 1);
	});

	fetch(ROOT + 'data/gallery.json').then(function (r) { return r.json(); }).then(function (list) {
		items = list;
		list.forEach(function (it, i) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'gallery-item';
			var im = document.createElement('img');
			im.src = ROOT + it.thumb;
			im.alt = it.title;
			im.loading = 'lazy';
			im.width = 640;
			im.height = Math.round(640 * it.h / it.w);
			var t = document.createElement('span');
			t.textContent = it.title;
			var d = document.createElement('small');
			d.textContent = nice(it.date);
			b.append(im, t, d);
			b.addEventListener('click', function () { show(i); });
			grid.appendChild(b);
		});
	});
})();
