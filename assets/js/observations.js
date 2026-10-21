// Observations page: mounts the 3D map (statistics, rank and tables come from stats.js).
import { mountOrrery } from './orrery.js';

window.orrery = await mountOrrery(document.getElementById('orrery-root'));
