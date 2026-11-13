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
const AU_KM = 149597870.7;
const MOON_A = 384400 / AU_KM * AU;  // the Moon's mean distance from Earth, in scene units

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
	planets: { Sun: 'Sunce', Mercury: 'Merkur', Venus: 'Venera', Earth: 'Zemlja', Moon: 'Mjesec', Mars: 'Mars', Phobos: 'Fobos', Jupiter: 'Jupiter',
		Europa: 'Europa', Saturn: 'Saturn', Titan: 'Titan', Uranus: 'Uran', Neptune: 'Neptun' },
	flyHint: 'Kliknite za približavanje', km: (n) => n.toLocaleString('hr-HR') + ' km',
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
	planets: { Sun: 'Sun', Mercury: 'Mercury', Venus: 'Venus', Earth: 'Earth', Moon: 'Moon', Mars: 'Mars', Phobos: 'Phobos', Jupiter: 'Jupiter',
		Europa: 'Europa', Saturn: 'Saturn', Titan: 'Titan', Uranus: 'Uranus', Neptune: 'Neptune' },
	flyHint: 'Click to zoom in', km: (n) => n.toLocaleString('en-US') + ' km',
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

// How the Sun and planets are drawn. km: real radius (sets the order of sizes); pole: IAU north pole
// (right ascension, declination, degrees), so each axis and Saturn's rings tilt the real way;
// spin: direction and relative speed of the slow turn while time is playing (minus = retrograde).
// Moons: of = the planet they go round; they turn with their orbit, one face always towards it (spin 0);
// shape = relative radii of an elongated one (long axis towards the planet, short along the pole).
const BODY = {
	Sun: { km: 695700, pole: [286.13, 63.87], spin: 0.12, color: '#ffc45c' },
	Mercury: { km: 2440, pole: [281.01, 61.41], spin: 0.3, color: '#b3aaa2' },
	Venus: { km: 6052, pole: [272.76, 67.16], spin: -0.2, color: '#e8cf93' },
	Earth: { km: 6371, pole: [0, 90], spin: 1, color: '#4f8fe8' },
	Moon: { km: 1737.4, of: 'Earth', pole: [269.99, 66.54], spin: 0, color: '#aaa59d' },
	Mars: { km: 3390, pole: [317.68, 52.89], spin: 1, color: '#d8693a' },
	Phobos: { km: 11.08, of: 'Mars', spin: 0, color: '#7d7066', shape: [1.22, 0.81, 0.99] },
	Jupiter: { km: 69911, pole: [268.06, 64.5], spin: 1.6, color: '#d6b08a' },
	Europa: { km: 1560.8, of: 'Jupiter', spin: 0, color: '#e6dcc8' },
	Saturn: { km: 58232, pole: [40.59, 83.54], spin: 1.5, color: '#e3cf98', ring: [1.24, 2.27] },
	Titan: { km: 2574.7, of: 'Saturn', spin: 0, color: '#d8a258' },
	Uranus: { km: 25362, pole: [257.31, -15.18], spin: -1.1, color: '#a4e2ea' },
	Neptune: { km: 24622, pole: [299.36, 43.46], spin: 1.1, color: '#4f72e6' },
};
const OBLIQUITY = 23.4393 * DEG;
// IAU pole (RA, Dec) -> unit vector in scene coordinates (ecliptic plane = XZ, ecliptic north = +Y).
function poleVector([ra, dec]) {
	const x = Math.cos(dec * DEG) * Math.cos(ra * DEG), y = Math.cos(dec * DEG) * Math.sin(ra * DEG), z = Math.sin(dec * DEG);
	const ye = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY), ze = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
	return new THREE.Vector3(x, ze, -ye).normalize();
}
// Sizes. At true scale every planet would be far smaller than a pixel in the opening view (Earth is 0.00009 AU
// across), so each body is drawn larger than life, squeezed the same way for all of them: radius^0.35. The order
// Sun > Jupiter > Saturn > Uranus ≈ Neptune > Earth ≈ Venus > Mars > Mercury stays and the Sun stays clearly the
// biggest (it is 285 times Mercury's size and drawn 7 times). On screen a body never shrinks below a few pixels
// when you zoom out, stops growing at a set size when you zoom in, and is never drawn smaller than it really is,
// so a close-up shows it at its true size and the moons at their real distances. In the opening view on a 1080p
// screen the Sun is about 60 px across, Earth about 12 and Mercury 8. A moon is only drawn in a close-up of its
// planet (see placeBodies()), where at its real size it would be a pixel or less: there it is 9 to 12 px across,
// the bigger moons a little bigger. radius and trueR in scene units (1 AU = 10), minPx / maxPx in screen pixels.
function sizing(name) {
	const km = BODY[name].km, trueR = km / AU_KM * AU, f = km / BODY.Earth.km;
	if (name === 'Sun') return { radius: 1.4, trueR, minPx: 11, maxPx: 50 };
	const radius = 1.4 * Math.pow(km / BODY.Sun.km, 0.35);
	if (BODY[name].of) return { radius, trueR, minPx: 2.5, maxPx: 4 + 2.5 * Math.sqrt(f) };
	return { radius, trueR, minPx: 3.6 * Math.pow(f, 0.35), maxPx: 12 * Math.pow(f, 0.35) };
}

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

function orbitPath(o, fine) {  // fine: many more points, for the highlighted orbit, so it runs through its dot even up close
	const e = o.e, q = o.q != null ? o.q : o.a * (1 - e);
	if (e < 1 && o.a * (1 + e) <= R_MAX) {
		const N = fine ? 4096 : e > 0.85 ? 360 : 200;
		const pts = new Float32Array(N * 3), b = o.a * Math.sqrt(1 - e * e);
		for (let k = 0; k < N; k++) {
			const E = (k / N) * TAU;
			toScene(o.R, o.a * (Math.cos(E) - e), b * Math.sin(E), pts, 3 * k);
		}
		return { pts, closed: true };
	}
	const N = fine ? 2400 : 240, p = q * (1 + e);
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

// The Moon around Earth: the Astronomical Almanac's low-precision lunar theory, good to a few tenths of a degree.
// Writes the position relative to Earth (scene units) into out, a Vector3, and returns the distance in km.
function moonPosition(jd, out) {
	const T = (jd - J2000) / 36525, s = (a, b) => Math.sin((a + b * T) * DEG), c = (a, b) => Math.cos((a + b * T) * DEG);
	const lon = (218.32 + 481267.881 * T + 6.29 * s(134.9, 477198.85) - 1.27 * s(259.2, -413335.38) + 0.66 * s(235.7, 890534.23)
		+ 0.21 * s(269.9, 954397.7) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.6, 966404.05)) * DEG;
	const lat = (5.13 * s(93.3, 483202.03) + 0.28 * s(228.2, 960400.87) - 0.28 * s(318.3, 6003.18) - 0.17 * s(217.6, -407332.2)) * DEG;
	const par = 0.9508 + 0.0518 * c(134.9, 477198.85) + 0.0095 * c(259.2, -413335.38) + 0.0078 * c(235.7, 890534.23) + 0.0028 * c(269.9, 954397.7);
	const km = 6378.14 / Math.sin(par * DEG), r = km / AU_KM * AU;
	out.set(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon));  // ecliptic -> scene, as in toScene()
	return km;
}

// Phobos, Europa and Titan: circular orbits fitted to JPL Horizons positions for 2026-2031 (ecliptic J2000), within
// 2°, 1° and 3.5° of where they really are. jd0: the fit's epoch; th0, n: angle along the orbit at jd0 (rad) and
// its change per day; a: orbit radius (km); e1, e2: the orbit plane, e1 at angle 0 (ecliptic unit vectors).
const MOONS = {
	Phobos: { jd0: 2461954.5, th0: 0.024913, n: 19.7020501299, a: 9376, e1: [-0.813838, -0.450369, 0.367200], e2: [0.374654, -0.889710, -0.260866] },
	Europa: { jd0: 2461954.5, th0: 0.000131, n: 1.7693254621, a: 671100, e1: [0.672705, -0.739854, -0.009178], e2: [0.739699, 0.672164, 0.032261] },
	Titan: { jd0: 2461954.5, th0: 6.224352, n: 0.3940493723, a: 1221870, e1: [0.230758, 0.855372, -0.463778], e2: [-0.969019, 0.245157, -0.029991] },
};
function moonOrbitAt(m, jd, out) {  // position relative to the planet, scene units
	const th = m.th0 + m.n * (jd - m.jd0), c = Math.cos(th), s = Math.sin(th), r = m.a / AU_KM * AU;
	out.set(r * (c * m.e1[0] + s * m.e2[0]), r * (c * m.e1[2] + s * m.e2[2]), -r * (c * m.e1[1] + s * m.e2[1]));  // ecliptic -> scene
	return out;
}
for (const name in MOONS) {  // the orbit's pole, in scene coordinates: the moon's axis, as it keeps one face to its planet
	const { e1: a, e2: b } = MOONS[name];
	BODY[name].axis = new THREE.Vector3(a[1] * b[2] - a[2] * b[1], a[0] * b[1] - a[1] * b[0], -(a[2] * b[0] - a[0] * b[2])).normalize();
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
function coronaTexture() {  // glow around the Sun's disc; the sprite is 4x the disc radius, so the limb is at 0.5
	const c = document.createElement('canvas'); c.width = c.height = 256;
	const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
	grd.addColorStop(0, 'rgba(255,214,140,0)'); grd.addColorStop(0.46, 'rgba(255,214,140,0)');
	grd.addColorStop(0.5, 'rgba(255,206,120,0.55)'); grd.addColorStop(0.64, 'rgba(255,170,80,0.18)');
	grd.addColorStop(1, 'rgba(255,140,40,0)');
	g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- planet surfaces
// Painted in the browser from noise, so there are no images to download. A map is painted a few rows at a
// time while the browser is idle (the body shows its plain colour until then), so the page never stalls,
// and only as sharp as the body's size on screen needs: 256 px wide in the opening view, painted again at
// 512, 1024 or 2048 when you zoom in close (see sharpen() in the viewer).
const idle = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 150 })
	: (f) => setTimeout(() => { const t0 = performance.now(); f({ timeRemaining: () => Math.max(0, 8 - (performance.now() - t0)), didTimeout: false }); }, 16);
function rng(seed) {
	return () => {
		seed = (seed + 0x6D2B79F5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const lerp = (a, b, t) => a + (b - a) * t;
function fbmNoise(seed) {  // smooth 3D value noise summed over octaves, 0..1
	const r = rng(seed), perm = new Uint8Array(512), val = new Float32Array(256), p = [];
	for (let i = 0; i < 256; i++) { p.push(i); val[i] = r(); }
	for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
	for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
	function n(x, y, z) {
		const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
		let u = x - xi, v = y - yi, w = z - zi;
		u *= u * (3 - 2 * u); v *= v * (3 - 2 * v); w *= w * (3 - 2 * w);
		const Y = yi & 255, Y1 = (yi + 1) & 255, Z = zi & 255, Z1 = (zi + 1) & 255;
		const a = perm[xi & 255], b = perm[(xi + 1) & 255];
		const aa = perm[a + Y], ab = perm[a + Y1], ba = perm[b + Y], bb = perm[b + Y1];
		return lerp(lerp(lerp(val[perm[aa + Z]], val[perm[ba + Z]], u), lerp(val[perm[ab + Z]], val[perm[bb + Z]], u), v),
			lerp(lerp(val[perm[aa + Z1]], val[perm[ba + Z1]], u), lerp(val[perm[ab + Z1]], val[perm[bb + Z1]], u), v), w);
	}
	return (x, y, z, oct) => {
		let s = 0, amp = 1, f = 1, norm = 0;
		for (let k = 0; k < oct; k++) { s += amp * n(x * f + 17.3 * k, y * f, z * f); norm += amp; amp *= 0.5; f *= 2.07; }
		return s / norm;
	};
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function mixTo(out, a, b, t) {  // out = a..b at t (clamped); out may be a
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t;
}
const spot = (lat, lon, lat0, lon0, h, w) => {  // inside an oval feature: < 1
	const dl = (lat - lat0) / h, dn = Math.atan2(Math.sin(lon - lon0), Math.cos(lon - lon0)) / w;
	return dl * dl + dn * dn;
};
// Each look paints one point of the surface: (x, y, z) on the unit sphere (y = north), lat/lon in radians.
// k: extra noise octaves for the sharper maps (1 at 512 px, 2 at 1024, 3 at 2048), so zooming in shows finer detail.
const LOOKS = {
	Sun(k) {
		const G = fbmNoise(11), S = fbmNoise(12), A = hex('#fff2c4'), B = hex('#ffb547'), C = hex('#e8741c');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, A, B, (G(x * 16, y * 16, z * 16, 3 + k) - 0.3) * 1.7);   // granulation
			const s = S(x * 3, y * 3, z * 3, 2);
			if (s > 0.6) mixTo(out, out, C, (s - 0.6) * 2.2);              // warmer active regions
		};
	},
	Mercury(k) {
		const N = fbmNoise(21), M = fbmNoise(22), A = hex('#5c5651'), B = hex('#bdb4aa'), W = hex('#ece6dd');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, A, B, N(x * 3, y * 3, z * 3, 5 + k) * 1.3 - 0.15);
			const c = M(x * 10, y * 10, z * 10, 2);
			if (c > 0.66) mixTo(out, out, W, (c - 0.66) * 2.4);          // bright young craters
			else if (c < 0.3) mixTo(out, out, A, (0.3 - c) * 1.7);       // dark crater floors
		};
	},
	Venus(k) {
		const N = fbmNoise(31), W = fbmNoise(32), A = hex('#f5e6bb'), B = hex('#c79e5e');
		return (x, y, z, lat, lon, out) => {
			const w = W(x * 1.5, y * 1.5, z * 1.5, 3) * 1.6;
			mixTo(out, A, B, N(x * 2 + w, y * 5, z * 2 + w, 4 + k) * 1.25 - 0.15);  // swirled cloud bands
		};
	},
	Earth(k) {
		const H = fbmNoise(41), V = fbmNoise(42), C = fbmNoise(43);
		// oceans a little brighter than the real ones, the way the air makes Earth look from space
		const deep = hex('#1a4f9f'), shallow = hex('#3f8fe6'), green = hex('#3c7535'), dry = hex('#b29a63'),
			ice = hex('#f2f6fb'), cloud = hex('#ffffff');
		return (x, y, z, lat, lon, out) => {
			const h = H(x * 1.7, y * 1.7, z * 1.7, 5 + k), al = Math.abs(lat);
			if (h < 0.53) mixTo(out, deep, shallow, (h - 0.3) / 0.23);
			else mixTo(out, green, dry, V(x * 3, y * 3, z * 3, 3) * 1.5 - 0.45 + (al < 0.5 ? 0.3 : 0) + (h - 0.53) * 1.2);
			if (al > 1.18 + H(x * 4, y * 4, z * 4, 2) * 0.2) mixTo(out, out, ice, 0.92);   // polar ice
			const c = C(x * 2.6, y * 5, z * 2.6, 4 + k);
			if (c > 0.54) mixTo(out, out, cloud, (c - 0.54) * 2.6);                      // clouds
		};
	},
	Mars(k) {
		const N = fbmNoise(51), D = fbmNoise(52), A = hex('#743620'), B = hex('#d27c48'), cap = hex('#f5f0ea');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, A, B, N(x * 2.5, y * 2.5, z * 2.5, 5 + k) * 1.4 - 0.2);
			const d = D(x * 1.6, y * 1.6, z * 1.6, 3);
			if (d < 0.4) mixTo(out, out, A, (0.4 - d) * 2.3);                             // dark plains
			if (Math.abs(lat) > 1.32 + d * 0.12) mixTo(out, out, cap, 0.92);                // polar caps
		};
	},
	Jupiter(k) {
		const T = fbmNoise(61), S = fbmNoise(62), light = hex('#f2e8d2'), belt = hex('#b5835a'),
			warm = hex('#dba166'), red = hex('#c2513a');
		return (x, y, z, lat, lon, out) => {
			const b = Math.sin((y * 6.5 + T(x * 3, y * 3, z * 3, 4 + k) * 0.9) * Math.PI);
			mixTo(out, light, belt, b * 0.5 + 0.5);
			mixTo(out, out, warm, S(x * 5, y * 12, z * 5, 3 + k) * 0.7 - 0.2);
			const r = spot(lat, lon, -0.384, 1.2, 0.08, 0.17);                               // Great Red Spot
			if (r < 1.6) mixTo(out, out, red, (1.6 - r) * 1.2);
		};
	},
	Saturn(k) {
		const T = fbmNoise(71), A = hex('#f4e7c2'), B = hex('#cdab70'), C = hex('#e2c58c');
		return (x, y, z, lat, lon, out) => {
			const b = Math.sin((y * 5.5 + T(x * 2.5, y * 2.5, z * 2.5, 3 + k) * 0.4) * Math.PI);
			mixTo(out, A, B, b * 0.28 + 0.42);
			mixTo(out, out, C, T(x * 6, y * 14, z * 6, 2) * 0.6 - 0.15);
		};
	},
	Uranus() {
		const T = fbmNoise(81), A = hex('#c9f3f5'), B = hex('#8ed2dc');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, A, B, 0.5 + 0.35 * Math.sin((y * 4 + T(x * 2, y * 2, z * 2, 2) * 0.3) * Math.PI));
		};
	},
	Neptune(k) {
		const T = fbmNoise(91), A = hex('#5f86f2'), B = hex('#2b48b0'), dark = hex('#18266f'), white = hex('#eef3ff');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, A, B, 0.5 + 0.45 * Math.sin((y * 6 + T(x * 2.5, y * 2.5, z * 2.5, 4 + k) * 0.7) * Math.PI));
			if (spot(lat, lon, -0.35, 4, 0.09, 0.2) < 1) mixTo(out, out, dark, 0.8);         // Great Dark Spot
			const c = T(x * 6, y * 16, z * 6, 2);
			if (c > 0.68) mixTo(out, out, white, (c - 0.68) * 2.6);                         // bright cloud streaks
		};
	},
	Moon(k) {
		const N = fbmNoise(101), M = fbmNoise(102), C = fbmNoise(103), lo = hex('#77736d'), hi = hex('#c8c4bc'),
			mare = hex('#55524d'), fresh = hex('#f0eee9');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, lo, hi, N(x * 4, y * 4, z * 4, 5 + k) * 1.3 - 0.15);
			const m = M(x * 1.3, y * 1.3, z * 1.3, 3) + x * 0.1;                             // dark maria, mostly on the side facing Earth (x < 0)
			if (m < 0.45) mixTo(out, out, mare, (0.45 - m) * 3);
			const c = C(x * 11, y * 11, z * 11, 2);
			if (c > 0.68) mixTo(out, out, fresh, (c - 0.68) * 2.5);                       // bright young craters
		};
	},
	Phobos(k) {
		const N = fbmNoise(111), C = fbmNoise(112), A = hex('#463e38'), B = hex('#8a7d71');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, A, B, N(x * 3, y * 3, z * 3, 5 + k) * 1.4 - 0.2);
			const c = C(x * 7, y * 7, z * 7, 2);
			if (c < 0.32) mixTo(out, out, A, (0.32 - c) * 2.5);                           // crater floors
		};
	},
	Europa(k) {
		const N = fbmNoise(121), Q = fbmNoise(122), ice = hex('#f1ebe0'), tan = hex('#c9a77f'), crack = hex('#8f5a3c');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, ice, tan, N(x * 2, y * 2, z * 2, 4 + k) * 1.4 - 0.35);
			const q = Math.abs(Q(x * 3, y * 3, z * 3, 3 + k) - 0.5);
			if (q < 0.025) mixTo(out, out, crack, (0.025 - q) * 28);                         // reddish cracks in the ice
		};
	},
	Titan(k) {
		const N = fbmNoise(131), A = hex('#e0ad62'), B = hex('#b77b3a');
		return (x, y, z, lat, lon, out) => {
			mixTo(out, A, B, 0.45 + 0.25 * Math.sin(y * 3) + (N(x * 2, y * 4, z * 2, 3 + k) - 0.5) * 0.5);  // orange haze, faint bands
		};
	},
};
function paintSurface(name, w, done) {  // equirectangular map, w x w/2, handed to done() as a canvas
	const h = w / 2, c = document.createElement('canvas'); c.width = w; c.height = h;
	const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data, out = [0, 0, 0], paint = LOOKS[name](Math.log2(w / 256));
	let j = 0;
	const step = (dl) => {  // as many rows as the idle time allows (about 1500 pixels if the browser stays busy)
		for (let rows = 0; j < h && (dl.timeRemaining() > 2 || (dl.didTimeout && rows * w < 1536)); rows++, j++) {
			const lat = Math.PI / 2 - (j + 0.5) / h * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
			for (let i = 0, o = 4 * j * w; i < w; i++, o += 4) {
				const lon = (i + 0.5) / w * TAU;
				paint(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, lon, out);
				d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = 255;
			}
		}
		if (j < h) { idle(step); return; }
		g.putImageData(img, 0, 0);
		done(c);
	};
	idle(step);
}
function canvasMap(canvas, maxAniso) {
	const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
}
function ringMesh([inner, outer], maxAniso) {  // Saturn's rings: C ring, bright B ring, Cassini division, A ring
	const geo = new THREE.RingGeometry(inner, outer, 160, 1);
	const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
	const c = document.createElement('canvas'); c.width = 512; c.height = 4;
	const g = c.getContext('2d');
	for (let i = 0; i < 512; i++) {
		const r = inner + (outer - inner) * (i + 0.5) / 512;  // planet radii
		const a = r < 1.53 ? 0.22 : r < 1.95 ? 0.86 : r < 2.03 ? 0.05 : r < 2.2 ? 0.62 : r < 2.22 ? 0.1 : 0.55;
		g.globalAlpha = a * (0.88 + 0.12 * Math.sin(i * 1.9));
		g.fillStyle = r < 1.53 ? '#a9997a' : r < 1.95 ? '#e3d0a4' : '#cdb991';
		g.fillRect(i, 0, 1, 4);
	}
	const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
	const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
	mesh.rotation.x = -Math.PI / 2;  // into the planet's equatorial plane
	return mesh;
}
function sunMaterial(map) {  // unlit, darker towards the limb like the real Sun
	return new THREE.ShaderMaterial({
		transparent: true,  // drawn after the orbit lines, see makeBody()
		uniforms: { map: { value: map } },
		vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
			'void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal);\n' +
			'vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
		fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
			'void main() { float mu = max(dot(normalize(vN), normalize(vV)), 0.0);\n' +
			'gl_FragColor = vec4(texture2D(map, vUv).rgb * (0.5 + 0.5 * pow(mu, 0.55)), 1.0);\n' +
			'#include <colorspace_fragment>\n}',
	});
}
function planetMaterial(map, rim) {  // lit by the Sun, with a thin rim of the planet's colour so the night side keeps its outline
	const m = new THREE.MeshLambertMaterial({ map, transparent: true }), color = { value: new THREE.Color(rim).multiplyScalar(0.45) };
	m.onBeforeCompile = (s) => {
		s.uniforms.rim = color;
		s.fragmentShader = 'uniform vec3 rim;\n' + s.fragmentShader.replace('#include <opaque_fragment>',
			'outgoingLight += rim * pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);\n\t#include <opaque_fragment>');
	};
	return m;
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
	// Draw only when something changed (camera, time, filters, selection, a finished planet map),
	// so a map that is just sitting on the page costs no GPU time.
	let dirty = true;
	const invalidate = () => { dirty = true; };
	controls.addEventListener('change', invalidate);
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
	let focus = null, flight = null;  // the body the camera flew to and now follows, and the flight there (see flyTo())
	const focusAt = new THREE.Vector3(), shift = new THREE.Vector3(), turn = new THREE.Quaternion();
	const FLIGHT_MS = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1600;

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

	// --- Sun and planets: lit 3D spheres (the Sun lights the planets; a little ambient light keeps night sides readable)
	scene.add(new THREE.AmbientLight(0xc8d2e6, 0.35));
	scene.add(new THREE.PointLight(0xfff2dc, 3.2, 0, 0));
	const maxAniso = renderer.capabilities.getMaxAnisotropy();
	const sphereGeo = new THREE.SphereGeometry(1, 64, 32);  // shared by the Sun, the planets and the moons
	const UP = new THREE.Vector3(0, 1, 0);
	const flatMap = (name) => {  // the body's plain colour until its surface is painted
		const c = document.createElement('canvas'); c.width = c.height = 1;
		const g = c.getContext('2d'); g.fillStyle = BODY[name].color; g.fillRect(0, 0, 1, 1);
		return canvasMap(c, 1);
	};
	// Draw order: the orbit lines and object markers first, then the Sun, planets and moons on top of them (a planet
	// is never lost in the haze of orbits, and its own orbit line, which runs through its centre, never crosses its
	// face), then Saturn's rings, the Sun's glow and the highlighted orbit.
	function makeBody(name, material) {  // group (position, size) > tilt (axis) > sphere (turns) [+ rings]
		const def = BODY[name], spinner = new THREE.Mesh(sphereGeo, material), tilt = new THREE.Group();
		tilt.quaternion.setFromUnitVectors(UP, def.axis || poleVector(def.pole));
		spinner.renderOrder = 1;
		if (def.shape) spinner.scale.fromArray(def.shape);
		tilt.add(spinner);
		if (def.ring) tilt.add(Object.assign(ringMesh(def.ring, maxAniso), { renderOrder: 2 }));
		const group = new THREE.Group();
		group.add(tilt);
		scene.add(group);
		return Object.assign({ name, group, spinner, spin: def.spin, screenR: 0, sx: 0, sy: 0, front: true, mapW: 0, painting: false,
			tiltInv: tilt.quaternion.clone().invert() }, sizing(name));
	}
	// Paint a body's map as sharp as its disc now needs: a map 5x as wide as the disc's radius in pixels has
	// about one texel per pixel across the middle of the disc. Maps only ever get sharper, up to 2048 px wide.
	function sharpen(b) {
		const need = 5 * b.screenR * renderer.getPixelRatio();
		if (b.painting || b.mapW >= 2048 || (b.mapW && need <= b.mapW)) return;
		const w = need > 1024 ? 2048 : need > 512 ? 1024 : need > 256 ? 512 : 256;
		b.painting = true;
		paintSurface(b.name, w, (canvas) => {
			const m = b.spinner.material, old = m.uniforms ? m.uniforms.map.value : m.map, tex = canvasMap(canvas, maxAniso);
			if (m.uniforms) m.uniforms.map.value = tex; else m.map = tex;
			old.dispose();
			b.mapW = w; b.painting = false;
			invalidate();
		});
	}
	const sun = makeBody('Sun', sunMaterial(flatMap('Sun')));
	sun.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: coronaTexture(), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
	sun.glow.renderOrder = 2;
	scene.add(sun.glow);

	// --- faint ecliptic rings every AU out to 5 AU
	for (let r = 1; r <= 5; r++) {
		const pts = [];
		for (let k = 0; k <= 128; k++) pts.push(new THREE.Vector3(Math.cos(k / 128 * TAU) * r * AU, 0, Math.sin(k / 128 * TAU) * r * AU));
		scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
			new THREE.LineBasicMaterial({ color: 0x5a6b85, transparent: true, opacity: 0.08, depthWrite: false })));
	}

	// --- planets, each with its orbit in its own colour
	const labelLayer = $('.label-layer');
	const planetLabel = (name) => {
		const label = document.createElement('div');
		label.className = 'planet-label' + (name === 'Earth' ? ' earth' : '');
		label.textContent = L.planets[name];
		labelLayer.appendChild(label);
		return label;
	};
	const planetObjs = PLANETS.map((p) => {
		const name = p[0], st = planetState(p, J2000);
		const pts = new Float32Array(512 * 3), b = st.a * Math.sqrt(1 - st.e * st.e);
		for (let k = 0; k < 512; k++) { const E = k / 512 * TAU; toScene(st.R, st.a * (Math.cos(E) - st.e), b * Math.sin(E), pts, 3 * k); }
		const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
		scene.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: BODY[name].color, transparent: true, opacity: name === 'Earth' ? 0.6 : 0.32, depthWrite: false })));
		const body = makeBody(name, planetMaterial(flatMap(name), BODY[name].color));
		return Object.assign(body, { def: p, label: planetLabel(name), labelW: 0, labelH: 17, labelOn: true, pos: new Float32Array(3) });
	});
	const byPlanet = Object.fromEntries(planetObjs.map((p) => [p.name, p]));

	// --- the moons. The Moon on its real path around Earth (one month of it), with its distance from Earth on its
	// label; Phobos, Europa and Titan on their orbits. Each shows once you are close enough to tell it apart from its
	// planet (click the planet).
	const moonPathMat = new THREE.LineBasicMaterial({ color: 0xaab3c0, transparent: true, opacity: 0.45, depthWrite: false });
	const moon = Object.assign(makeBody('Moon', planetMaterial(flatMap('Moon'), BODY.Moon.color)),
		{ label: planetLabel('Moon'), labelW: 0, labelH: 17, labelOn: true, rel: new THREE.Vector3(), a: MOON_A, km: 0, shownKm: 0 });
	const moonKm = document.createElement('span');  // the distance, in figures of one width so the label keeps its size
	moonKm.className = 'km';
	moonKm.textContent = ' · ' + L.km(384400);
	moon.label.appendChild(moonKm);
	const MOON_PATH = 160;
	const moonPath = moon.path = new THREE.LineLoop(new THREE.BufferGeometry(), moonPathMat);
	moonPath.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOON_PATH * 3), 3));
	moonPath.frustumCulled = false;
	scene.add(moonPath);
	let moonPathJd = -Infinity;
	const moonAt = new THREE.Vector3();
	function traceMoonPath(jd) {  // one sidereal month centred on jd, relative to Earth
		const arr = moonPath.geometry.attributes.position.array;
		for (let k = 0; k < MOON_PATH; k++) {
			moonPosition(jd + (k / MOON_PATH - 0.5) * 27.3217, moonAt);
			arr[3 * k] = moonAt.x; arr[3 * k + 1] = moonAt.y; arr[3 * k + 2] = moonAt.z;
		}
		moonPath.geometry.attributes.position.needsUpdate = true;
		moonPathJd = jd;
	}
	const moons = [moon, ...Object.keys(MOONS).map((name) => {
		const orbit = MOONS[name], pts = [];
		for (let k = 0; k < 128; k++) pts.push(moonOrbitAt(orbit, orbit.jd0 + k / 128 * TAU / orbit.n, new THREE.Vector3()));
		const path = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), moonPathMat);
		path.frustumCulled = false;
		scene.add(path);
		return Object.assign(makeBody(name, planetMaterial(flatMap(name), BODY[name].color)),
			{ label: planetLabel(name), labelW: 0, labelH: 17, labelOn: true, rel: new THREE.Vector3(), a: orbit.a / AU_KM * AU, orbit, path });
	})];
	const toPlanet = new THREE.Vector3();

	const bodies = [sun, ...planetObjs, ...moons], labelled = [...planetObjs, ...moons];
	const byLabel = Object.fromEntries(labelled.map((p) => [p.name, p]));
	const measureLabels = () => {  // each label is shown while it is measured (a hidden one has no size); the next frame hides it again
		labelled.forEach((p) => { p.label.style.display = ''; p.labelOn = true; p.labelW = p.label.offsetWidth; p.labelH = p.label.offsetHeight || 17; });
		invalidate();
	};
	measureLabels();
	if (document.fonts) document.fonts.ready.then(measureLabels);
	const disc = discTexture();

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
	selRing.renderOrder = 4;
	scene.add(selRing);

	// --- highlighted orbit (fat line)
	const hlMat = new LineMaterial({ color: 0xffffff, linewidth: 2.2, transparent: true, opacity: 0.95, depthWrite: false });
	let hlLine = null;
	function highlight(k) {
		if (hlLine) { scene.remove(hlLine); hlLine.geometry.dispose(); hlLine = null; }
		invalidate();
		if (k < 0) return;
		const p = orbitPath(objs[k], true), arr = Array.from(p.pts);
		if (p.closed) arr.push(p.pts[0], p.pts[1], p.pts[2]);
		const g = new LineGeometry(); g.setPositions(arr);
		hlLine = new Line2(g, hlMat); hlLine.computeLineDistances();
		hlLine.renderOrder = 3;
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
			const st = planetState(p, state.jd), E = keplerE(st.M, st.e), pl = planetObjs[k];
			toScene(st.R, st.a * (Math.cos(E) - st.e), st.a * Math.sqrt(1 - st.e * st.e) * Math.sin(E), pl.pos, 0);
			pl.group.position.set(pl.pos[0], pl.pos[1], pl.pos[2]);
		});
		for (const m of moons) {
			const planet = byPlanet[BODY[m.name].of].group.position;
			if (m === moon) m.km = moonPosition(state.jd, m.rel); else moonOrbitAt(m.orbit, state.jd, m.rel);
			m.group.position.copy(planet).add(m.rel);
			m.path.position.copy(planet);
			toPlanet.copy(m.rel).negate().applyQuaternion(m.tiltInv);
			m.spinner.rotation.y = Math.atan2(-toPlanet.z, toPlanet.x);  // the same face towards its planet
		}
		if (focus && !flight) {  // keep following the body we flew to
			shift.copy(focus.group.position).sub(focusAt);
			camera.position.add(shift); controls.target.add(shift);
			focusAt.copy(focus.group.position);
		}
		invalidate();
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
	$('input.orbits').addEventListener('change', (e) => { orbitLines.visible = e.target.checked; invalidate(); });

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
		unfocus();
		const v = views[name];
		// Narrow (portrait) viewports see less horizontally: back the camera off to compensate.
		const aspect = canvasHost.clientWidth / Math.max(1, canvasHost.clientHeight);
		const f = Math.max(1, 1.2 / aspect);
		camera.position.set(v[0] * f, v[1] * f, v[2] * f);
		controls.target.set(0, 0, 0);
		controls.update();
		invalidate();
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
		else if (e.key === 'Escape') { if (focus) { setView('inner'); return e.preventDefault(); } select(-1); }  // out of a close-up first
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
	// The Sun, planet or moon under the pointer: on its disc, or within 8 px of a small one.
	function bodyAt(x, y) {
		let best = null, bestD = 1;
		for (const b of bodies) {
			if (!b.group.visible || !b.front) continue;
			const d = Math.hypot(b.sx - x, b.sy - y) / Math.max(b.screenR + 3, 8);
			if (d < bestD) { best = b; bestD = d; }
		}
		return best;
	}
	// Fly to a body and keep following it. The camera ends up on the body's sunlit side, 28° above its orbit (and at
	// least 25° out of the plane of a planet's moon or rings, so they are seen open): for a planet with a moon far
	// enough out to see the moon's whole orbit, for the others close enough to see the body at its real size, about
	// a quarter of the map tall. The view buttons fly back out to the whole Solar System.
	function flyTo(b) {
		const p = b.group.position, dir = b === sun ? camera.position.clone().sub(controls.target) : new THREE.Vector3(-p.x, 0, -p.z).applyAxisAngle(UP, 50 * DEG);
		dir.y = 0;
		if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
		dir.normalize().multiplyScalar(Math.cos(28 * DEG)).setY(Math.sin(28 * DEG));
		const sat = moons.find((m) => BODY[m.name].of === b.name);
		const pole = sat && sat.orbit ? BODY[sat.name].axis : BODY[b.name].ring ? poleVector(BODY[b.name].pole) : null;
		if (pole) {
			const k = dir.dot(pole);
			if (Math.abs(k) < Math.sin(25 * DEG)) dir.addScaledVector(pole, -k).normalize().multiplyScalar(Math.cos(25 * DEG)).addScaledVector(pole, (k < 0 ? -1 : 1) * Math.sin(25 * DEG));
		}
		const d1 = sat ? orbitInView(sat, dir) : 9 * b.trueR;
		const dir0 = camera.position.clone().sub(controls.target), d0 = dir0.length();
		focus = b;
		flight = { t0: performance.now(), from: controls.target.clone(), dir0: dir0.normalize(), d0, d1, turn: new THREE.Quaternion().setFromUnitVectors(dir0, dir) };
		controls.minDistance = 3 * b.trueR;
		controls.enabled = false;
		invalidate();
	}
	// The camera distance at which a moon's whole orbit (seen from direction dir) fits the map between the controls
	// at the top and at the bottom (on a phone those cover a third of the map).
	function orbitInView(m, dir) {
		if (m === moon) traceMoonPath(state.jd);
		const arr = m.path.geometry.attributes.position.array, t = Math.tan(camera.fov * DEG / 2), q = new THREE.Vector3();
		const f = dir.clone().negate(), r = new THREE.Vector3().crossVectors(f, UP), u = new THREE.Vector3();
		if (r.lengthSq() < 1e-12) r.set(1, 0, 0);
		u.crossVectors(r.normalize(), f);
		const box = canvasHost.getBoundingClientRect(), half = viewH / 2;
		const free = (px) => 0.92 * t * Math.max(0.25 * half, half - px) / half;  // tan of the free angle above / below the middle
		const side = 0.85 * t * viewW / viewH, top = free($('.hud-top').getBoundingClientRect().bottom - box.top),
			bottom = free(box.bottom - $('.hud-bottom').getBoundingClientRect().top);
		let d = 0;
		for (let i = 0; i < arr.length; i += 3) {  // camera at the planet + dir * d: depth = q.f + d, across = q.r, up = q.u
			q.fromArray(arr, i);
			const depth = q.dot(f), y = q.dot(u);
			d = Math.max(d, Math.abs(q.dot(r)) / side - depth, y > 0 ? y / top - depth : -y / bottom - depth);
		}
		return d;
	}
	function unfocus() {
		focus = null; flight = null;
		controls.enabled = true; controls.minDistance = 2;
	}
	let downAt = null;
	renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
	renderer.domElement.addEventListener('pointermove', (e) => {
		const near = nearestMarker(e.clientX, e.clientY), { x, y } = near, b = bodyAt(x, y), k = b ? -1 : near.k;
		if (k !== state.hover) {
			state.hover = k;
			if (state.selected < 0) highlight(k);
		}
		if (b || k >= 0) {
			const o = objs[k];
			tip.replaceChildren();
			const s = document.createElement('strong'); s.textContent = b ? L.planets[b.name] : displayName(o);
			const d = document.createElement('span'); d.textContent = b ? L.flyHint : `${classLabel(o)} · ${L.firstObs} ${o.first}`;
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
		const { k, x, y } = nearestMarker(e.clientX, e.clientY), b = bodyAt(x, y);
		if (b) flyTo(b); else select(k);
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
			unfocus();
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
	let viewW = 1, viewH = 1;
	function resize() {
		viewW = Math.max(1, canvasHost.clientWidth); viewH = Math.max(1, canvasHost.clientHeight);
		renderer.setSize(viewW, viewH, false);
		camera.aspect = viewW / viewH; camera.updateProjectionMatrix();
		hlMat.resolution.set(viewW, viewH);
		invalidate();
	}
	new ResizeObserver(resize).observe(canvasHost);
	resize();

	let onScreen = true;
	new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; if (onScreen) invalidate(); }).observe(root);

	// Size every body for the current view (see sizing()), note where it lands on screen (and sharpen the
	// map of one in view), hide a planet that would sit inside the Sun's enlarged disc when zoomed far out,
	// and show a moon only once its orbit is clearly wider than its planet's disc.
	const scr = new THREE.Vector3();
	function placeBodies() {
		// the near clipping plane follows the zoom, so a close-up of a body at its real size is not cut off
		const near = Math.min(0.01, Math.max(1e-9, camera.position.distanceTo(controls.target) * 0.02));
		if (Math.abs(near / camera.near - 1) > 0.1) { camera.near = near; camera.updateProjectionMatrix(); }
		camera.updateMatrixWorld();  // the controls have only just moved the camera; labels must not lag a frame
		const k = 2 * Math.tan(camera.fov * DEG / 2) / viewH, grow = Math.min(1.25, Math.max(0.8, viewH / 800));
		for (const b of bodies) {
			const upp = camera.position.distanceTo(b.group.position) * k;  // scene units per pixel at the body
			const r = Math.max(b.trueR, Math.min(Math.max(b.radius, b.minPx * grow * upp), b.maxPx * grow * upp));
			b.group.scale.setScalar(r);
			b.screenR = r / upp;
			scr.copy(b.group.position).project(camera);
			b.front = scr.z < 1;
			b.sx = (scr.x + 1) / 2 * viewW; b.sy = (1 - scr.y) / 2 * viewH;
			if (!b.mapW || (b.front && b.sx > -b.screenR && b.sx < viewW + b.screenR && b.sy > -b.screenR && b.sy < viewH + b.screenR)) sharpen(b);
		}
		sun.glow.scale.setScalar(sun.group.scale.x * 4);
		for (const p of planetObjs) p.group.visible = p.group.position.length() > sun.group.scale.x + p.group.scale.x + 0.3;
		for (const m of moons) {
			const planet = byPlanet[BODY[m.name].of];
			m.group.visible = m.path.visible = planet.group.visible && m.a / planet.group.scale.x > 1.6 + 8 / planet.screenR;
		}
		if (moonPath.visible && Math.abs(state.jd - moonPathJd) > 0.25) traceMoonPath(state.jd);
	}
	// Labels beside each planet and moon (on its left near the right edge of the map), most important first; one
	// that would overlap another label or the Sun, or not fit inside the map, is left out.
	const LABEL_ORDER = ['Earth', 'Moon', 'Jupiter', 'Europa', 'Saturn', 'Titan', 'Mars', 'Phobos', 'Venus', 'Uranus', 'Neptune', 'Mercury'];
	const taken = [];
	function placeLabels() {
		taken.length = 0;
		taken.push([sun.sx - sun.screenR, sun.sy - sun.screenR, sun.sx + sun.screenR, sun.sy + sun.screenR]);
		for (const name of LABEL_ORDER) {
			const p = byLabel[name], gap = p.screenR * (BODY[name].ring ? BODY[name].ring[1] : 1) + 5, y = p.sy - p.labelH / 2;  // Saturn's: past its rings
			let x = p.sx + gap;
			if (x + p.labelW > viewW) x = p.sx - gap - p.labelW;
			const box = [x, y, x + p.labelW, y + p.labelH];
			const on = p.group.visible && p.front && x >= 0 && box[2] <= viewW && y >= 0 && box[3] <= viewH
				&& !taken.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]);
			if (on) { taken.push(box); p.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
			if (on !== p.labelOn) { p.label.style.display = on ? '' : 'none'; p.labelOn = on; }
		}
		const km = Math.round(moon.km / 100) * 100;  // the Moon's distance from Earth, to the nearest 100 km
		if (moon.labelOn && km !== moon.shownKm) { moon.shownKm = km; moonKm.textContent = ' · ' + L.km(km); }
	}

	applyFilters();
	syncTimeUi();
	let last = performance.now();
	function frame(now) {
		requestAnimationFrame(frame);
		const dt = Math.min(0.1, (now - last) / 1000); last = now;
		if (!onScreen) return;
		if (state.playing) {
			state.jd += state.speed * dt;
			if (state.jd > maxJd) state.jd = minJd;
			updatePositions();
			syncTimeUi();
			for (const b of bodies) b.spinner.rotation.y += b.spin * 0.4 * dt;
		}
		if (flight) {  // on the way to a body: the target glides to it while the camera turns and zooms in evenly
			const s = FLIGHT_MS ? Math.min(1, (now - flight.t0) / FLIGHT_MS) : 1, e = s < 0.5 ? 4 * s * s * s : 1 - (2 - 2 * s) ** 3 / 2;
			controls.target.lerpVectors(flight.from, focus.group.position, e);
			shift.copy(flight.dir0).applyQuaternion(turn.identity().slerp(flight.turn, e)).multiplyScalar(flight.d0 ** (1 - e) * flight.d1 ** e);
			camera.position.copy(controls.target).add(shift);
			focusAt.copy(focus.group.position);
			if (s === 1) { flight = null; controls.enabled = true; }
			dirty = true;
		}
		if (controls.update()) dirty = true;
		if (!dirty) return;
		dirty = false;
		placeBodies();
		renderer.render(scene, camera);
		placeLabels();
	}
	requestAnimationFrame(frame);

	// Render the current view to a JPEG data URL (used to make the research-page teaser).
	function snapshot(quality = 0.88) {
		controls.update();
		placeBodies();
		scene.background = new THREE.Color('#0b0e14');
		renderer.render(scene, camera);
		const url = renderer.domElement.toDataURL('image/jpeg', quality);
		scene.background = null;
		invalidate();
		return url;
	}
	return { select, state, snapshot, setView, flyTo, camera, controls, sun, moon, planets: byPlanet,
		moons: Object.fromEntries(moons.map((m) => [m.name, m])), redraw: invalidate };
}
