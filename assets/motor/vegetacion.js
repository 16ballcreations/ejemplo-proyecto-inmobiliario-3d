// Vegetación instanciada: árboles de copa compuesta, pinos escalonados y arbustos.
// Cada especie es una sola geometría con colores por vértice (más oscuro adentro y abajo) y variación por instancia.
import * as THREE from 'three';
import { mergeGeometries as unirG } from 'three/addons/utils/BufferGeometryUtils.js';
const mergeGeometries = (l) => unirG(l.map((g) => (g.index ? g.toNonIndexed() : g)));

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }

// Deforma una esfera para que parezca follaje (bultos) y le pinta oclusión por altura
function copa(r, semilla, detalle = 1) {
  const g = new THREE.IcosahedronGeometry(r, detalle);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.78 + 0.32 * hash(Math.round(v.x * 7) + semilla, Math.round(v.y * 7 + v.z * 5));
    v.multiplyScalar(n); v.y *= 0.82;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function pintar(g, oscuro, claro, y0, y1) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    c.copy(oscuro).lerp(claro, Math.pow(t, 0.8));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const TRONCO_OSC = new THREE.Color('#3b2c22'), TRONCO = new THREE.Color('#5a4535');

export function geoFrondoso() {
  const tronco = pintar(new THREE.CylinderGeometry(0.16, 0.26, 4.2, 6).translate(0, 2.1, 0), TRONCO_OSC, TRONCO, 0, 4);
  const partes = [];
  const bultos = [[0, 5.6, 0, 2.6], [1.5, 4.9, 0.4, 1.8], [-1.3, 5.0, -0.6, 1.9], [0.3, 4.7, 1.5, 1.7], [-0.4, 6.6, -0.3, 1.8], [0.9, 6.1, -1.2, 1.6]];
  bultos.forEach(([x, y, z, r], k) => partes.push(copa(r, k * 13).translate(x, y, z)));
  const hojas = pintar(mergeGeometries(partes), new THREE.Color('#1d2e17'), new THREE.Color('#9fb878'), 3.2, 8.2);
  return mergeGeometries([tronco, hojas]);
}
export function geoPino() {
  const tronco = pintar(new THREE.CylinderGeometry(0.14, 0.24, 3, 6).translate(0, 1.5, 0), TRONCO_OSC, TRONCO, 0, 3);
  const pisos = [];
  for (let k = 0; k < 5; k++) {
    const r = 2.6 - k * 0.45, h = 3.4 - k * 0.3, y = 2.4 + k * 1.75;
    const g = new THREE.ConeGeometry(r, h, 9, 2, false);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 0.85 + 0.25 * hash(i + k * 31, k); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
    g.computeVertexNormals();
    pisos.push(g.translate(0, y + h / 2, 0));
  }
  const hojas = pintar(mergeGeometries(pisos), new THREE.Color('#121f14'), new THREE.Color('#5d7a4c'), 2, 12);
  return mergeGeometries([tronco, hojas]);
}
export function geoArbusto() {
  const partes = [copa(0.9, 3).translate(0, 0.6, 0), copa(0.7, 9).translate(0.7, 0.5, 0.2), copa(0.65, 17).translate(-0.6, 0.45, -0.3)];
  return pintar(mergeGeometries(partes), new THREE.Color('#1f3019'), new THREE.Color('#8fae62'), -0.2, 1.4);
}

const matVeg = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
const TONOS = ['#ffffff', '#f2f5e6', '#e7efd2', '#fff1d9', '#dfe8d8', '#f6ecc8'].map((x) => new THREE.Color(x));

// Reparte vegetación según una función de densidad. pos(k) → {x, y, z, escala} o null.
export function sembrar(geo, cantidad, pos, { sombra = true } = {}) {
  const m = new THREE.InstancedMesh(geo, matVeg(), cantidad);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let k = 0; n < cantidad && k < cantidad * 12; k++) {
    const r = pos(k);
    if (!r) continue;
    q.setFromAxisAngle(eje, hash(k, 9.9) * 6.28);
    const e = r.escala;
    s.set(e, e * (0.85 + hash(k, 5.5) * 0.35), e);
    v.set(r.x, r.y - 0.3, r.z);
    mat.compose(v, q, s);
    m.setMatrixAt(n, mat);
    m.setColorAt(n, TONOS[k % TONOS.length]);
    n++;
  }
  m.count = n;
  m.castShadow = sombra; m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}
export { hash };
