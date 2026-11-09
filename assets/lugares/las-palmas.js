// Lugar: ladera del Alto de Las Palmas sobre el valle de Aburrá (Medellín).
// El lote queda en una meseta en el origen; el valle cae hacia -x con la ciudad; la cordillera occidental al fondo.
import * as THREE from 'three';
import { crearTerreno, crearCiudad } from '../motor/terreno.js';
import { hash } from '../motor/vegetacion.js';
import { crearArbolesShader } from '../motor/arboles-shader.js';

function ruido(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < 5; i++) { t += ruido(x * f, z * f) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return t / n;
}
// crestas: ridged multifractal (skill procedural-landscapes) para filos y cañadas en las montañas
export function crestas(x, z) {
  let s = 0, amp = 0.5, f = 1, prev = 1;
  for (let i = 0; i < 5; i++) { let n = 1 - Math.abs(ruido(x * f, z * f) * 2 - 1); n = n * n * prev; s += n * amp; prev = n; amp *= 0.5; f *= 2.1; }
  return s;
}
const sig = (x) => 1 / (1 + Math.exp(-x));
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function altura(x, z) {
  const r = Math.hypot(x, z);
  const lejos = suave(92, 205, r); // meseta amplia para torre, piscina, cancha y parqueadero
  const valle = -260 * sig((-x - 260) / 110);
  const cordillera = sig((-x - 1950) / 160) * (330 * (0.6 + 0.6 * fbm(z / 420, 3.3)) + 120 * crestas(x / 520, z / 520));
  const cerros = sig((x - 420) / 160) * (190 + 80 * crestas(x / 420 + 7, z / 420)) + 120 * sig((z - 700) / 200) + cordillera;
  const n = (fbm(x / 260, z / 260) - 0.5) * 120 + (fbm(x / 60, z / 60) - 0.5) * 18;
  const fondoValle = sig((-x - 600) / 80);
  const ladera = sig((-x - 40) / 50) * sig((220 - Math.abs(z)) / 60);
  return lejos * (valle + cerros + n * (1 - 0.8 * fondoValle) * (1 - 0.75 * ladera));
}

const T = (h) => new THREE.Color(h);
const PASTO = T('#ffffff'), SECO = T('#f1e2b4'), SOMBRA = T('#b7c6a6'), CIUDAD = T('#b9aa98'), MONTE = T('#c3cbb8');
function tinte(x, z, y) {
  const c = PASTO.clone();
  c.lerp(SECO, suave(0.55, 0.8, fbm(x / 140 + 9, z / 140 - 4)) * 0.55);
  c.lerp(SOMBRA, suave(0.42, 0.75, fbm(x / 45, z / 45)) * 0.7);
  c.lerp(CIUDAD, suave(-185, -240, y));
  c.lerp(MONTE, suave(-1500, -2100, x) * 0.6);
  return c;
}
function tierra(x, z) {
  const r = Math.hypot(x, z);
  return 0.92 * (1 - suave(34, 56, r + (fbm(x / 12, z / 12) - 0.5) * 14));
}

// anilloLibre: [r0, r1] sin árboles (recorrido de la cámara)
export function crearPaisaje({ ligero = false, anilloLibre = null } = {}) {
  const grupo = new THREE.Group();
  const terreno = crearTerreno({ alturaFn: altura, tierraFn: tierra, tinteFn: tinte, seg: ligero ? 180 : 340 });
  grupo.add(terreno);

  const ciudad = crearCiudad({
    alturaFn: altura,
    cantidad: ligero ? 2500 : 6500,
    luces: ligero ? 4500 : 10000,
    dentro: (a, b) => {
      const x = -540 - a * 1150, z = (b - 0.5) * 3600;
      if (altura(x, z) > -170) return null;
      // manzanas: deja calles libres
      if (Math.abs(Math.sin(x / 31)) < 0.16 || Math.abs(Math.sin(z / 27)) < 0.16) return null;
      return { x, z };
    },
  });
  grupo.add(ciudad.edificios, ciudad.luces);

  // bosque por shader (una tarjeta por árbol): frondosos, pinos y arbustos, filtrados por altura y pendiente
  const pendiente = (x, z) => Math.hypot(altura(x + 2, z) - altura(x - 2, z), altura(x, z + 2) - altura(x, z - 2)) / 4;
  const bosque = (k) => {
    const ang = hash(k, 1.3) * Math.PI * 2;
    const r = 96 + Math.pow(hash(k, 7.7), 0.8) * 1000;
    if (anilloLibre && r > anilloLibre[0] && r < anilloLibre[1] && hash(k, 4.4) > 0.12) return null;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const y = altura(x, z);
    if (y < -165) return null;                       // ciudad
    if (pendiente(x, z) > 0.85) return null;         // roca
    if (fbm(x / 90, z / 90) < 0.42 + (r < 140 ? 0.08 : 0)) return null; // claros
    const t = hash(k, 2.2), tipo = t < 0.55 ? 0 : t < 0.85 ? 1 : 2;
    const alto = tipo === 0 ? 7 + hash(k, 3.1) * 6 : tipo === 1 ? 11 + hash(k, 3.1) * 8 : 1.6 + hash(k, 3.1) * 1.8;
    return { x, y, z, tipo, alto };
  };
  grupo.add(crearArbolesShader({ cantidad: ligero ? 6000 : 16000, pos: bosque, ligero }));

  return { grupo, lucesCiudad: ciudad.luces, nocheCiudad: ciudad.noche, altura, terreno: terreno.userData.uniformes };
}
