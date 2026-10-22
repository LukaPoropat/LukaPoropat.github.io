// Interactive 3D map of every asteroid and comet observed (data/observations.json).
// Orbits come from JPL SBDB osculating elements; positions are propagated with Kepler's
// equation (two-body, good to a few degrees over years, which is plenty for a map).
// Three.js r170 is self-hosted in assets/vendor/three (from the npm package, integrity-checked).
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { Line2 } from '../vendor/three/addons/lines/Line2.js';
import { LineMaterial } from '../vendor/three/addons/lines/LineMaterial.js';
import { LineGeometry } from '../vendor/three/addons/lines/LineGeometry.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const GAUSS_K = 0.01720209895;  // rad/day for a = 1 AU
const AU = 10;                  // scene units per AU
const R_MAX = 45;               // AU: open / very long orbits are drawn out to here
const J2000 = 2451545.0;
const LD_PER_AU = 389.17;

// Page language (<html lang>) and path back to the site root (Croatian pages live in hr/).
const HR = document.documentElement.lang === 'hr';
const ROOT = document.documentElement.getAttribute('data-root') || '';
const L = HR ? {
	au: 'AJ', nea: 'Asteroidi blizu Zemlje', pha: 'Potencijalno opasni', comet: 'Kometi', other: 'Ostalo',
	interstellar: 'Međuzvjezdani komet', firstObs: 'prvi put opažen', firstSeen: 'Prvi put opažen ',
	pause: 'Pauza', play: 'Pokreni', noData: 'Podaci o opažanjima nisu se mogli učitati.',
	noWebgl: 'WebGL nije dostupan u ovom pregledniku.',
	aria: (n) => `3D karta Sunčevog sustava: putanje asteroida i kometa promatranih i mjerenih sa Zvjezdarnice Višnjan (ukupno ${n}).`,
	hazard: ' · potencijalno opasan', m1: 'Ukupna mag. M1', H: 'Aps. magnituda H', diam: 'Promjer', measured: 'izmjereno',
	a: 'Velika poluos', q: 'Perihel q', e: 'Ekscentricitet', i: 'Inklinacija', P: 'Ophodno vrijeme', yr: 'god.',
	moid: 'MOID sa Zemljom', first: 'Prvi put opažen', last: 'Zadnji put opažen', ff: 'Potvrda', ffVal: 'prva stanica koja je potvrdila',
	mpecs: (n) => `MPEC-ovi (${n}): `,
	CLASS: { APO: 'Asteroid blizu Zemlje (Apollo)', ATE: 'Asteroid blizu Zemlje (Aten)', AMO: 'Asteroid blizu Zemlje (Amor)',
		IEO: 'Asteroid blizu Zemlje (Atira)', MCA: 'Presijeca Marsovu putanju', IMB: 'Asteroid unutarnjeg glavnog pojasa',
		MBA: 'Asteroid glavnog pojasa', OMB: 'Asteroid vanjskog glavnog pojasa', TJN: 'Jupiterov trojanac', CEN: 'Kentaur',
		TNO: 'Transneptunski objekt', PAA: 'Parabolični asteroid', HYA: 'Hiperbolični asteroid', AST: 'Asteroid',
		JFc: 'Komet Jupiterove obitelji', JFC: 'Komet Jupiterove obitelji', HTC: 'Komet Halleyjeva tipa', ETc: 'Komet Enckeova tipa',
		CTc: 'Komet Chironova tipa', COM: 'Dugoperiodični komet', PAR: 'Parabolični komet', HYP: 'Hiperbolični komet' }
} : {
	au: 'AU', nea: 'Near-Earth asteroids', pha: 'Potentially hazardous', comet: 'Comets', other: 'Other',
	interstellar: 'Interstellar comet', firstObs: 'first observed', firstSeen: 'First seen ',
	pause: 'Pause', play: 'Play', noData: 'Could not load the observation data.',
	noWebgl: 'WebGL is not available in this browser.',
	aria: (n) => `3D map of the Solar System showing the orbits of ${n} asteroids and comets observed from Višnjan Observatory.`,
	hazard: ' · potentially hazardous', m1: 'Total mag. M1', H: 'Abs. magnitude H', diam: 'Diameter', measured: 'measured',
	a: 'Semi-major axis', q: 'Perihelion q', e: 'Eccentricity', i: 'Inclination', P: 'Period', yr: 'yr',
	moid: 'Earth MOID', first: 'First observed', last: 'Last observed', ff: 'Follow-up', ffVal: 'first station to confirm',
	mpecs: (n) => `MPECs (${n}): `,
	CLASS: { APO: 'Apollo near-Earth asteroid', ATE: 'Aten near-Earth asteroid', AMO: 'Amor near-Earth asteroid',
		IEO: 'Atira near-Earth asteroid', MCA: 'Mars-crosser', IMB: 'Inner main-belt asteroid', MBA: 'Main-belt asteroid',
		OMB: 'Outer main-belt asteroid', TJN: 'Jupiter trojan', CEN: 'Centaur', TNO: 'Trans-Neptunian object',
		PAA: 'Parabolic asteroid', HYA: 'Hyperbolic asteroid', AST: 'Asteroid', JFc: 'Jupiter-family comet',
		JFC: 'Jupiter-family comet', HTC: 'Halley-type comet', ETc: 'Encke-type comet', CTc: 'Chiron-type comet',
		COM: 'Long-period comet', PAR: 'Parabolic comet', HYP: 'Hyperbolic comet' }
};

// Validated categorical slots (dark surface) + neutral for "other".
const CATS = {
	nea: { label: L.nea, color: '#3987e5' },
	pha: { label: L.pha, color: '#c93838' },
	comet: { label: L.comet, color: '#c98500' },
	other: { label: L.other, color: '#8a8f98' },
};
const CAT_OF = { apollo: 'nea', aten: 'nea', amor: 'nea', atira: 'nea', pha: 'pha', comet: 'comet', other: 'other' };
const ALIAS = { 'C/2025 N1 (ATLAS)': '3I/ATLAS (C/2025 N1)' };  // interstellar objects get their nI/ name
const displayName = (o) => { const n = (o.name || o.id).replace(/^\((.*)\)$/, '$1'); return ALIAS[n] || n; };
const classLabel = (o) => (o.e > 1.2 ? L.interstellar : CLASS_NAMES[o.cls] || CATS[o.group].label);
const CLASS_NAMES = L.CLASS;

// JPL "Keplerian elements for approximate positions of the major planets" (1800-2050):
// a [AU], e, I, L, long. perihelion, long. node [deg] at J2000 and their rates per century.
const PLANETS = [
	['Mercury', [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
	['Venus', [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
	['Earth', [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
	['Mars', [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
	['Jupiter', [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
	['Saturn', [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
	['Uranus', [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
	['Neptune', [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
];

// ---------------------------------------------------------------- orbital mechanics
const jdNow = () => Date.now() / 86400000 + 2440587.5;
const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
const isoDate = (jd) => jdToDate(jd).toISOString().slice(0, 10);
const dateToJd = (s) => Date.parse(s + 'T00:00:00Z') / 86400000 + 2440587.5;

function rotation(i, node, peri) {
	const cO = Math.cos(node), sO = Math.sin(node), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(peri), sw = Math.sin(peri);
	return [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, sw * si, cw * si];
}

// Orbital-plane (x', y') -> ecliptic -> scene (ecliptic plane = XZ, north pole = +Y).
function toScene(R, xp, yp, out, o) {
	const x = R[0] * xp + R[1] * yp, y = R[2] * xp + R[3] * yp, z = R[4] * xp + R[5] * yp;
	out[o] = x * AU; out[o + 1] = z * AU; out[o + 2] = -y * AU;
}

function keplerE(M, e) {
	M = ((M % TAU) + TAU) % TAU;
	if (M > Math.PI) M -= TAU;
	let E = e < 0.8 ? M : (M >= 0 ? Math.PI : -Math.PI);
	for (let k = 0; k < 60; k++) {
		const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
		E -= dE;
		if (Math.abs(dE) < 1e-11) break;
	}
	return E;
}

function keplerH(M, e) {
	let H = Math.asinh(M / e);
	for (let k = 0; k < 80; k++) {
		const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
		H -= dH;
		if (Math.abs(dH) < 1e-11) break;
	}
	return H;
}

function bodyPosition(o, jd, out, off) {
	const e = o.e;
	if (e < 0.99999) {
		const a = o.a > 0 ? o.a : o.q / (1 - e);
		const n = GAUSS_K / Math.pow(a, 1.5);
		const M = (o.ma != null && o.epoch) ? o.ma * DEG + n * (jd - o.epoch) : n * (jd - o.tp);
		const E = keplerE(M, e);
		toScene(o.R, a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), out, off);
	} else if (e > 1.00001) {
		const A = o.q / (e - 1);
		const H = keplerH(GAUSS_K / Math.pow(A, 1.5) * (jd - o.tp), e);
		toScene(o.R, A * (e - Math.cosh(H)), A * Math.sqrt(e * e - 1) * Math.sinh(H), out, off);
	} else { // parabolic: Barker's equation
		const W = 3 * GAUSS_K * (jd - o.tp) / Math.sqrt(2 * o.q ** 3);
		const Y = Math.cbrt(W / 2 + Math.sqrt(W * W / 4 + 1));
		const s = Y - 1 / Y, r = o.q * (1 + s * s), nu = 2 * Math.atan(s);
		toScene(o.R, r * Math.cos(nu), r * Math.sin(nu), out, off);
	}
}

function orbitPath(o) {
	const e = o.e, q = o.q != null ? o.q : o.a * (1 - e);
	if (e < 1 && o.a * (1 + e) <= R_MAX) {
		const N = e > 0.85 ? 360 : 200;
		const pts = new Float32Array(N * 3), b = o.a * Math.sqrt(1 - e * e);
		for (let k = 0; k < N; k++) {
			const E = (k / N) * TAU;
			toScene(o.R, o.a * (Math.cos(E) - e), b * Math.sin(E), pts, 3 * k);
		}
		return { pts, closed: true };
	}
	const N = 240, p = q * (1 + e);
	let numax = Math.acos(Math.max(-1, Math.min(1, (p / R_MAX - 1) / e)));
	if (e >= 1) numax = Math.min(numax, Math.acos(-1 / e) - 1e-3);
	const pts = new Float32Array(N * 3);
	for (let k = 0; k < N; k++) {
		const nu = -numax + 2 * numax * k / (N - 1), r = p / (1 + e * Math.cos(nu));
		toScene(o.R, r * Math.cos(nu), r * Math.sin(nu), pts, 3 * k);
	}
	return { pts, closed: false };
}

function planetState(p, jd) {
	const T = (jd - J2000) / 36525, el = p[1].map((v, k) => v + p[2][k] * T);
	const [a, e, I, L, varpi, node] = el;
	return { a, e, R: rotation(I * DEG, node * DEG, (varpi - node) * DEG), M: (L - varpi) * DEG };
}

function sizeRange(H) {
	if (H == null) return null;
	const d = (p) => 1329 / Math.sqrt(p) * Math.pow(10, -H / 5); // km
	const lo = d(0.25), hi = d(0.05);
	const f = (km) => km >= 1 ? km.toFixed(km < 10 ? 1 : 0) + ' km' : Math.round(km * 1000) + ' m';
	return '≈ ' + f(lo) + ' – ' + f(hi);
}

// ---------------------------------------------------------------- textures
function discTexture() {
	const c = document.createElement('canvas'); c.width = c.height = 64;
	const g = c.getContext('2d');
	g.fillStyle = '#000'; g.beginPath(); g.arc(32, 32, 31, 0, TAU); g.fill();       // 2px surface ring
	g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.fill();
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ringTexture() {
	const c = document.createElement('canvas'); c.width = c.height = 64;
	const g = c.getContext('2d');
	g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 26, 0, TAU); g.stroke();
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture() {
	const c = document.createElement('canvas'); c.width = c.height = 128;
	const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grd.addColorStop(0, 'rgba(255,248,225,1)'); grd.addColorStop(0.12, 'rgba(255,214,140,0.95)');
	grd.addColorStop(0.35, 'rgba(255,166,70,0.28)'); grd.addColorStop(1, 'rgba(255,140,40,0)');
	g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- viewer
export async function mountOrrery(root, dataUrl = ROOT + 'data/observations.json') {
	const $ = (sel) => root.querySelector(sel);
	const canvasHost = $('.canvas-host');
	let data;
	try {
		data = await fetch(dataUrl, { cache: 'no-cache' }).then((r) => r.json());
	} catch (err) {
		$('.loading').textContent = L.noData;
		return;
	}
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	if (!renderer.getContext()) { $('.loading').textContent = L.noWebgl; return; }
	$('.loading').remove();
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	canvasHost.appendChild(renderer.domElement);
	renderer.domElement.setAttribute('role', 'img');

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 30000);
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.minDistance = 2;
	controls.maxDistance = 1200;
	controls.zoomSpeed = 0.8;
	// Don't hijack page scrolling: the wheel zooms only after the map was clicked
	// (until the pointer leaves) or with Ctrl/Cmd held. One-finger vertical swipes scroll the page.
	renderer.domElement.style.touchAction = 'pan-y';
	let engaged = false;
	const hint = $('.zoom-hint');
	let hintTimer = 0;
	canvasHost.addEventListener('pointerdown', () => { engaged = true; }, true);
	canvasHost.addEventListener('pointerleave', () => { engaged = false; });
	canvasHost.addEventListener('wheel', (e) => {
		controls.enableZoom = engaged || e.ctrlKey || e.metaKey;
		if (!controls.enableZoom && hint) {
			hint.classList.add('show');
			clearTimeout(hintTimer);
			hintTimer = setTimeout(() => hint.classList.remove('show'), 1400);
		}
	}, { capture: true, passive: true });

	const state = { jd: jdNow(), playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 7,
		cats: { nea: true, pha: true, comet: true, other: true }, year: 'all', ffOnly: false, showOrbits: true,
		hover: -1, selected: -1 };

	// --- objects with usable elements
	const all = data.objects;
	const objs = all.filter((o) => o.e != null && o.i != null && o.om != null && o.w != null && (o.a != null || o.q != null));
	objs.forEach((o) => {
		o.R = rotation(o.i * DEG, o.om * DEG, o.w * DEG);
		if (o.q == null) o.q = o.a * (1 - o.e);
		o.group = CAT_OF[o.cat] || 'other';
		o.year = (o.first || '').slice(0, 4);
	});
	root.querySelector('canvas').setAttribute('aria-label',
		L.aria(objs.length));

	// --- background stars
	{
		const n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
		for (let k = 0; k < n; k++) {
			const u = Math.random() * 2 - 1, th = Math.random() * TAU, r = 9000, s = Math.sqrt(1 - u * u);
			pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], 3 * k);
			const b = 0.25 + Math.random() * 0.45; col.set([b, b, b * 1.05], 3 * k);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		g.setAttribute('color', new THREE.BufferAttribute(col, 3));
		scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
	}

	// --- Sun
	const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
	sun.scale.set(3.2, 3.2, 1);
	scene.add(sun);

	// --- faint ecliptic rings every AU out to 5 AU
	for (let r = 1; r <= 5; r++) {
		const pts = [];
		for (let k = 0; k <= 128; k++) pts.push(new THREE.Vector3(Math.cos(k / 128 * TAU) * r * AU, 0, Math.sin(k / 128 * TAU) * r * AU));
		scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
			new THREE.LineBasicMaterial({ color: 0x5a6b85, transparent: true, opacity: 0.08, depthWrite: false })));
	}

	// --- planets
	const labelLayer = $('.label-layer');
	const planetObjs = PLANETS.map((p) => {
		const st = planetState(p, J2000);
		const pts = new Float32Array(256 * 3), b = st.a * Math.sqrt(1 - st.e * st.e);
		for (let k = 0; k < 256; k++) { const E = k / 256 * TAU; toScene(st.R, st.a * (Math.cos(E) - st.e), b * Math.sin(E), pts, 3 * k); }
		const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
		const isEarth = p[0] === 'Earth';
		scene.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xc9d1dc, transparent: true, opacity: isEarth ? 0.55 : 0.22, depthWrite: false })));
		const label = document.createElement('div');
		label.className = 'planet-label' + (isEarth ? ' earth' : '');
		label.textContent = p[0];
		labelLayer.appendChild(label);
		return { def: p, label, pos: new Float32Array(3) };
	});
	const planetGeom = new THREE.BufferGeometry();
	planetGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLANETS.length * 3), 3));
	const planetCol = new Float32Array(PLANETS.length * 3);
	PLANETS.forEach((p, k) => planetCol.set(p[0] === 'Earth' ? [0.55, 0.78, 1] : [0.86, 0.88, 0.92], 3 * k));
	planetGeom.setAttribute('color', new THREE.BufferAttribute(planetCol, 3));
	const disc = discTexture();
	scene.add(new THREE.Points(planetGeom, new THREE.PointsMaterial({ size: 11, sizeAttenuation: false, vertexColors: true, map: disc, alphaTest: 0.4, transparent: true })));

	// --- observed orbits: one merged LineSegments, visibility via the index buffer
	const paths = objs.map(orbitPath);
	let vCount = 0;
	paths.forEach((p) => { p.start = vCount; p.n = p.pts.length / 3; vCount += p.n; });
	const orbitPos = new Float32Array(vCount * 3), orbitCol = new Float32Array(vCount * 3);
	const tmpC = new THREE.Color();
	paths.forEach((p, k) => {
		orbitPos.set(p.pts, p.start * 3);
		tmpC.set(CATS[objs[k].group].color);
		for (let v = 0; v < p.n; v++) orbitCol.set([tmpC.r, tmpC.g, tmpC.b], (p.start + v) * 3);
	});
	const orbitGeom = new THREE.BufferGeometry();
	orbitGeom.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3));
	orbitGeom.setAttribute('color', new THREE.BufferAttribute(orbitCol, 3));
	// Additive blending: overlapping orbits stack up, so the densest regions glow towards white.
	const baseOpacity = objs.length > 600 ? 0.2 : objs.length > 250 ? 0.26 : 0.32;
	const orbitMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: baseOpacity, depthWrite: false, blending: THREE.AdditiveBlending });
	const orbitLines = new THREE.LineSegments(orbitGeom, orbitMat);
	orbitLines.frustumCulled = false;
	scene.add(orbitLines);

	// --- object markers
	const ptsPos = new Float32Array(objs.length * 3), ptsCol = new Float32Array(objs.length * 3);
	const ptsGeom = new THREE.BufferGeometry();
	ptsGeom.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3));
	ptsGeom.setAttribute('color', new THREE.BufferAttribute(ptsCol, 3));
	const markers = new THREE.Points(ptsGeom, new THREE.PointsMaterial({ size: objs.length > 600 ? 7 : 8, sizeAttenuation: false, vertexColors: true, map: disc, alphaTest: 0.4, transparent: true, depthWrite: false }));
	markers.frustumCulled = false;
	scene.add(markers);

	// --- ring around the selected object
	const selPos = new Float32Array(3);
	const selGeom = new THREE.BufferGeometry();
	selGeom.setAttribute('position', new THREE.BufferAttribute(selPos, 3));
	const selRing = new THREE.Points(selGeom, new THREE.PointsMaterial({ size: 24, sizeAttenuation: false, map: ringTexture(), transparent: true, depthTest: false }));
	selRing.frustumCulled = false;
	selRing.visible = false;
	scene.add(selRing);

	// --- highlighted orbit (fat line)
	const hlMat = new LineMaterial({ color: 0xffffff, linewidth: 2.2, transparent: true, opacity: 0.95, depthWrite: false });
	let hlLine = null;
	function highlight(k) {
		if (hlLine) { scene.remove(hlLine); hlLine.geometry.dispose(); hlLine = null; }
		if (k < 0) return;
		const p = paths[k], arr = Array.from(p.pts);
		if (p.closed) arr.push(p.pts[0], p.pts[1], p.pts[2]);
		const g = new LineGeometry(); g.setPositions(arr);
		hlLine = new Line2(g, hlMat); hlLine.computeLineDistances();
		scene.add(hlLine);
	}

	// --- filtering
	let visible = [];
	function applyFilters() {
		visible = [];
		let segs = 0;
		objs.forEach((o, k) => {
			const ok = state.cats[o.group] && (state.year === 'all' || o.year === state.year) && (!state.ffOnly || o.ff);
			if (ok) { visible.push(k); segs += paths[k].closed ? paths[k].n : paths[k].n - 1; }
		});
		const idx = new Uint32Array(segs * 2);
		let w = 0;
		visible.forEach((k) => {
			const p = paths[k], last = p.closed ? p.n : p.n - 1;
			for (let v = 0; v < last; v++) { idx[w++] = p.start + v; idx[w++] = p.start + ((v + 1) % p.n); }
		});
		orbitGeom.setIndex(new THREE.BufferAttribute(idx, 1));
		visible.forEach((k, j) => { tmpC.set(CATS[objs[k].group].color); ptsCol.set([tmpC.r, tmpC.g, tmpC.b], 3 * j); });
		ptsGeom.attributes.color.needsUpdate = true;
		ptsGeom.setDrawRange(0, visible.length);
		$('.count-visible').textContent = visible.length.toLocaleString(HR ? 'hr-HR' : 'en-US');
		updatePositions();
	}

	function updatePositions() {
		visible.forEach((k, j) => bodyPosition(objs[k], state.jd, ptsPos, 3 * j));
		ptsGeom.attributes.position.needsUpdate = true;
		selRing.visible = state.selected >= 0;
		if (selRing.visible) {
			bodyPosition(objs[state.selected], state.jd, selPos, 0);
			selGeom.attributes.position.needsUpdate = true;
		}
		PLANETS.forEach((p, k) => {
			const st = planetState(p, state.jd), E = keplerE(st.M, st.e);
			toScene(st.R, st.a * (Math.cos(E) - st.e), st.a * Math.sqrt(1 - st.e * st.e) * Math.sin(E), planetObjs[k].pos, 0);
			planetGeom.attributes.position.array.set(planetObjs[k].pos, 3 * k);
		});
		planetGeom.attributes.position.needsUpdate = true;
	}

	// --- HUD: chips
	const chipHost = $('.chips');
	Object.entries(CATS).forEach(([key, c]) => {
		const n = objs.filter((o) => o.group === key).length;
		if (!n) return;
		const b = document.createElement('button');
		b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', 'true');
		const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = c.color;
		const t = document.createElement('span'); t.textContent = c.label;
		const cnt = document.createElement('span'); cnt.className = 'n'; cnt.textContent = n.toLocaleString(HR ? 'hr-HR' : 'en-US');
		b.append(sw, t, cnt);
		b.addEventListener('click', () => {
			state.cats[key] = !state.cats[key];
			b.setAttribute('aria-pressed', String(state.cats[key]));
			applyFilters();
		});
		chipHost.appendChild(b);
	});

	const yearSel = $('select.year');
	[...new Set(objs.map((o) => o.year))].filter(Boolean).sort().forEach((y) => {
		const opt = document.createElement('option'); opt.value = y; opt.textContent = L.firstSeen + y + (HR ? '.' : ''); yearSel.appendChild(opt);
	});
	yearSel.addEventListener('change', () => { state.year = yearSel.value; applyFilters(); });
	$('input.ff').addEventListener('change', (e) => { state.ffOnly = e.target.checked; applyFilters(); });
	$('input.orbits').addEventListener('change', (e) => { orbitLines.visible = e.target.checked; });

	// search
	const list = $('datalist');
	const byName = new Map();
	objs.forEach((o, k) => {
		const label = displayName(o);
		byName.set(label.toLowerCase(), k); byName.set(o.id.toLowerCase(), k);
		const opt = document.createElement('option'); opt.value = label; list.appendChild(opt);
	});
	// Show one object: clear the filters that could hide it, then select and fly to it.
	function focusObject(k) {
		Object.keys(state.cats).forEach((c) => { state.cats[c] = true; });
		chipHost.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'true'));
		state.year = 'all'; yearSel.value = 'all'; state.ffOnly = false; $('input.ff').checked = false;
		applyFilters();
		select(k, true);
	}
	$('input[type=search]').addEventListener('change', (e) => {
		const k = byName.get(e.target.value.trim().toLowerCase());
		if (k != null) focusObject(k);
	});
	window.addEventListener('orrery:select', (e) => {
		const k = objs.findIndex((o) => o.id === e.detail);
		if (k >= 0) focusObject(k);
	});

	// --- time controls
	const slider = $('input.time');
	const minJd = dateToJd(((data.summary && data.summary.first_mpec) || '2017-01-01').slice(0, 4) + '-01-01');
	const maxJd = jdNow() + 5 * 365.25;
	slider.min = String(Math.floor(minJd)); slider.max = String(Math.ceil(maxJd)); slider.step = '1';
	const dateEl = $('.date');
	let lastLabel = '';
	function syncTimeUi() {
		const s = isoDate(state.jd);
		if (s !== lastLabel) { dateEl.textContent = s; lastLabel = s; slider.value = String(state.jd); }
	}
	slider.addEventListener('input', () => { state.jd = Number(slider.value); updatePositions(); syncTimeUi(); });
	const playBtn = $('button.play');
	const setPlay = (on) => {
		state.playing = on;
		playBtn.innerHTML = on ? `<i class="fa-solid fa-pause" aria-hidden="true"></i> ${L.pause}` : `<i class="fa-solid fa-play" aria-hidden="true"></i> ${L.play}`;
	};
	setPlay(state.playing);
	playBtn.addEventListener('click', () => setPlay(!state.playing));
	$('button.today').addEventListener('click', () => { state.jd = jdNow(); updatePositions(); syncTimeUi(); });
	$('select.speed').addEventListener('change', (e) => { state.speed = Number(e.target.value); });

	// --- camera presets
	const views = { inner: [0, 26, 42], belt: [0, 60, 95], outer: [0, 260, 420], top: [0, 70, 0.01] };
	function setView(name) {
		const v = views[name];
		// Narrow (portrait) viewports see less horizontally: back the camera off to compensate.
		const aspect = canvasHost.clientWidth / Math.max(1, canvasHost.clientHeight);
		const f = Math.max(1, 1.2 / aspect);
		camera.position.set(v[0] * f, v[1] * f, v[2] * f);
		controls.target.set(0, 0, 0);
		controls.update();
	}
	root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
	setView('inner');

	// --- keyboard: arrows rotate, +/- zoom, space plays/pauses (when the map has focus)
	renderer.domElement.tabIndex = 0;
	renderer.domElement.addEventListener('keydown', (e) => {
		const off = camera.position.clone().sub(controls.target);
		const sph = new THREE.Spherical().setFromVector3(off);
		const step = 5 * DEG;
		if (e.key === 'ArrowLeft') sph.theta -= step;
		else if (e.key === 'ArrowRight') sph.theta += step;
		else if (e.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
		else if (e.key === 'ArrowDown') sph.phi = Math.min(Math.PI - 0.05, sph.phi + step);
		else if (e.key === '+' || e.key === '=') sph.radius = Math.max(controls.minDistance, sph.radius * 0.85);
		else if (e.key === '-' || e.key === '_') sph.radius = Math.min(controls.maxDistance, sph.radius / 0.85);
		else if (e.key === ' ') setPlay(!state.playing);
		else if (e.key === 'Escape') select(-1);
		else return;
		e.preventDefault();
		camera.position.copy(controls.target).add(off.setFromSpherical(sph));
		controls.update();
	});

	// --- hover & selection (nearest marker in screen space)
	const tip = $('.tip');
	const panel = $('.panel');
	const v3 = new THREE.Vector3();
	function nearestMarker(clientX, clientY) {
		const rect = renderer.domElement.getBoundingClientRect();
		const x = clientX - rect.left, y = clientY - rect.top;
		let best = -1, bestD = 14 * 14;
		for (let j = 0; j < visible.length; j++) {
			v3.set(ptsPos[3 * j], ptsPos[3 * j + 1], ptsPos[3 * j + 2]).project(camera);
			if (v3.z > 1) continue;
			const sx = (v3.x + 1) / 2 * rect.width, sy = (1 - v3.y) / 2 * rect.height;
			const d = (sx - x) ** 2 + (sy - y) ** 2;
			if (d < bestD) { bestD = d; best = visible[j]; }
		}
		return { k: best, x, y };
	}
	let downAt = null;
	renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
	renderer.domElement.addEventListener('pointermove', (e) => {
		const { k, x, y } = nearestMarker(e.clientX, e.clientY);
		if (k !== state.hover) {
			state.hover = k;
			if (state.selected < 0) highlight(k);
		}
		if (k >= 0) {
			const o = objs[k];
			tip.replaceChildren();
			const s = document.createElement('strong'); s.textContent = displayName(o);
			const d = document.createElement('span'); d.textContent = `${classLabel(o)} · ${L.firstObs} ${o.first}`;
			tip.append(s, d);
			tip.style.display = 'block';
			tip.style.left = Math.min(x + 14, renderer.domElement.clientWidth - tip.offsetWidth - 8) + 'px';
			tip.style.top = (y + 14) + 'px';
			renderer.domElement.style.cursor = 'pointer';
		} else {
			tip.style.display = 'none';
			renderer.domElement.style.cursor = '';
		}
	});
	renderer.domElement.addEventListener('pointerleave', () => { tip.style.display = 'none'; if (state.selected < 0) highlight(-1); state.hover = -1; });
	renderer.domElement.addEventListener('click', (e) => {
		if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // it was a drag
		const { k } = nearestMarker(e.clientX, e.clientY);
		select(k);
	});
	panel.querySelector('.close').addEventListener('click', () => select(-1));

	const num = (x, n) => (HR ? x.toFixed(n).replace('.', ',') : x.toFixed(n));
	function row(dl, label, value) {
		if (value == null || value === '') return;
		const dt = document.createElement('dt'); dt.textContent = label;
		const dd = document.createElement('dd'); dd.textContent = value;
		dl.append(dt, dd);
	}
	function select(k, fly) {
		state.selected = k;
		highlight(k);
		orbitMat.opacity = k >= 0 ? baseOpacity * 0.45 : baseOpacity;
		updatePositions();
		if (k < 0) { panel.classList.remove('open'); return; }
		const o = objs[k];
		panel.querySelector('h4').textContent = displayName(o);
		const cls = panel.querySelector('.cls'); cls.replaceChildren();
		const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = CATS[o.group].color;
		const ct = document.createElement('span');
		ct.textContent = classLabel(o) + (o.cat === 'pha' ? L.hazard : '');
		cls.append(dot, ct);
		const dl = panel.querySelector('dl'); dl.replaceChildren();
		if (o.H != null) row(dl, o.group === 'comet' ? L.m1 : L.H, num(o.H, 1));
		if (o.H != null && o.group !== 'comet') row(dl, L.diam, o.diam ? `${o.diam} km (${L.measured})` : sizeRange(o.H));
		if (o.a != null && o.e < 1) row(dl, L.a, num(o.a, 3) + ' ' + L.au);
		row(dl, L.q, num(o.q, 3) + ' ' + L.au);
		row(dl, L.e, num(o.e, 3));
		row(dl, L.i, num(o.i, 2) + '°');
		if (o.a != null && o.e < 1) row(dl, L.P, num(Math.pow(o.a, 1.5), 2) + ' ' + L.yr);
		if (o.moid != null) row(dl, L.moid, `${num(o.moid, 4)} ${L.au} (${num(o.moid * LD_PER_AU, 1)} LD)`);
		row(dl, L.first, o.first);
		if (o.last && o.last !== o.first) row(dl, L.last, o.last);
		if (o.ff) row(dl, L.ff, L.ffVal);
		const m = panel.querySelector('.mpecs'); m.replaceChildren();
		const lbl = document.createElement('div'); lbl.textContent = L.mpecs(o.mpecs.length);
		m.appendChild(lbl);
		o.mpecs.slice(0, 10).forEach((id, n) => {
			const a = document.createElement('a');
			a.href = mpecUrl(id); a.target = '_blank'; a.rel = 'noopener'; a.textContent = id;
			m.append(a, document.createTextNode(n < Math.min(o.mpecs.length, 10) - 1 ? ', ' : (o.mpecs.length > 10 ? ' …' : '')));
		});
		panel.querySelector('a.sbdb').href = 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=' + encodeURIComponent(o.id);
		panel.querySelector('a.mpc').href = 'https://minorplanetcenter.net/db_search/show_object?object_id=' + encodeURIComponent(o.id);
		panel.classList.add('open');
		if (fly) {
			const j = visible.indexOf(k);
			if (j >= 0) {
				const target = new THREE.Vector3(ptsPos[3 * j], ptsPos[3 * j + 1], ptsPos[3 * j + 2]);
				controls.target.copy(target.multiplyScalar(0.5));
				camera.position.set(controls.target.x, controls.target.y + 30, controls.target.z + 46);
				controls.update();
			}
		}
	}

	// MPEC "2024-C11" -> https://www.minorplanetcenter.net/mpec/K24/K24C11.html
	function mpecUrl(id) {
		const m = /^(\d{4})-([A-Z])(\d+)$/.exec(id);
		if (!m) return 'https://www.minorplanetcenter.net/mpec/RecentMPECs.html';
		const cent = { 18: 'I', 19: 'J', 20: 'K' }[m[1].slice(0, 2)], yy = m[1].slice(2), n = Number(m[3]);
		const B = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		const num = n < 100 ? String(n).padStart(2, '0') : B[Math.floor(n / 10)] + (n % 10);
		return `https://www.minorplanetcenter.net/mpec/${cent}${yy}/${cent}${yy}${m[2]}${num}.html`;
	}
	mountOrrery.mpecUrl = mpecUrl;

	// --- render loop
	function resize() {
		const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h; camera.updateProjectionMatrix();
		hlMat.resolution.set(w, h);
	}
	new ResizeObserver(resize).observe(canvasHost);
	resize();

	let onScreen = true;
	new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; }).observe(root);

	applyFilters();
	syncTimeUi();
	let last = performance.now();
	const proj = new THREE.Vector3();
	function frame(now) {
		requestAnimationFrame(frame);
		const dt = Math.min(0.1, (now - last) / 1000); last = now;
		if (!onScreen) return;
		if (state.playing) {
			state.jd += state.speed * dt;
			if (state.jd > maxJd) state.jd = minJd;
			updatePositions();
			syncTimeUi();
		}
		controls.update();
		renderer.render(scene, camera);
		const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
		planetObjs.forEach((p) => {
			proj.set(p.pos[0], p.pos[1], p.pos[2]).project(camera);
			const on = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
			p.label.style.display = on ? '' : 'none';
			if (on) p.label.style.transform = `translate(${((proj.x + 1) / 2 * w + 9).toFixed(1)}px, ${((1 - proj.y) / 2 * h - 7).toFixed(1)}px)`;
		});
	}
	requestAnimationFrame(frame);

	// Render the current view to a JPEG data URL (used to make the research-page teaser).
	function snapshot(quality = 0.88) {
		controls.update();
		scene.background = new THREE.Color('#0b0e14');
		renderer.render(scene, camera);
		const url = renderer.domElement.toDataURL('image/jpeg', quality);
		scene.background = null;
		return url;
	}
	return { select, state, snapshot, setView };
}
