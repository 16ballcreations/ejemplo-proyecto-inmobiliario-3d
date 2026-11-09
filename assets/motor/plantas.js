// Plantas de primer plano: tallos + tarjetas de hoja con silueta (alpha), nervadura y variación de color.
// Una sola geometría de hojas por planta. Especies: 'olivo', 'aveParaiso', 'pasto'.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const cache = {};
function tex(nombre, w, h, dibujar) {
  if (cache[nombre]) return cache[nombre];
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); dibujar(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (cache[nombre] = t);
}
// hoja ancha con nervadura (ave del paraíso / platanillo)
const texHojaAncha = () => tex('ancha', 128, 384, (g, w, h) => {
  g.beginPath(); g.moveTo(w / 2, 4);
  g.bezierCurveTo(w * 1.02, h * 0.25, w * 0.98, h * 0.7, w / 2, h - 4);
  g.bezierCurveTo(w * 0.02, h * 0.7, -w * 0.02, h * 0.25, w / 2, 4);
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#2c4a26'); gr.addColorStop(0.5, '#4f7a3a'); gr.addColorStop(1, '#2f5229');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(200,220,170,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 6); g.stroke();
  g.strokeStyle = 'rgba(20,40,15,.35)'; g.lineWidth = 1.2;
  for (let y = 30; y < h - 20; y += 9) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w * 0.08, y + 26); g.moveTo(w / 2, y); g.lineTo(w * 0.92, y + 26); g.stroke(); }
});
// ramita de olivo: tallo con hojas lanceoladas verde plata
const texRamaOlivo = () => tex('olivo', 256, 256, (g, w, h) => {
  g.strokeStyle = '#5a4a38'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h - 4); g.quadraticCurveTo(w * 0.45, h / 2, w / 2, 10); g.stroke();
  for (let k = 0; k < 16; k++) {
    const t = 0.08 + (k / 16) * 0.88, y = h - 4 - t * (h - 14), x = w / 2 + (k % 2 ? 1 : -1) * 2;
    const a = (k % 2 ? -1 : 1) * (0.55 + hash(k, 1) * 0.4) - Math.PI / 2;
    g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.ellipse(0, -32, 7, 32, 0, 0, Math.PI * 2);
    g.fillStyle = hash(k, 2) > 0.5 ? '#6f8463' : '#869a78'; g.fill();
    g.strokeStyle = 'rgba(230,235,215,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -62); g.stroke();
    g.restore();
  }
});
// hoja de pasto ornamental
const texPasto = () => tex('pasto', 64, 512, (g, w, h) => {
  for (let k = 0; k < 5; k++) {
    const x = 10 + k * 11, curva = (hash(k, 3) - 0.5) * 30;
    g.beginPath(); g.moveTo(x - 3, h); g.quadraticCurveTo(x + curva, h / 2, x + curva * 1.4, 6); g.quadraticCurveTo(x + curva, h / 2, x + 3, h); g.closePath();
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#3e5a2a'); gr.addColorStop(1, hash(k, 4) > 0.5 ? '#a6b06a' : '#7d9450');
    g.fillStyle = gr; g.fill();
  }
});

// tarjeta (plano) orientada: base en el origen, crece hacia +y local
function tarjeta(ancho, alto, pos, dir, giro, tinte) {
  const g = new THREE.PlaneGeometry(ancho, alto).translate(0, alto / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.rotateY(giro);
  g.applyQuaternion(q);
  g.translate(pos.x, pos.y, pos.z);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([tinte.r, tinte.g, tinte.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const matHojas = (map) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.75 });
const matTallo = new THREE.MeshStandardMaterial({ color: '#4d3d2e', roughness: 0.9 });

export function crearPlanta(tipo, { altura = 1.6, semilla = 1 } = {}) {
  const grupo = new THREE.Group();
  const hojas = [], tallos = [];
  const c = new THREE.Color();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  if (tipo === 'olivo') {
    // tronco retorcido en tramos, ramas abiertas y copa de ramitas
    let p = v(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const q = p.clone().add(v((hash(k, semilla) - 0.5) * 0.25, altura * 0.12, (hash(k, semilla + 1) - 0.5) * 0.25));
      const d = q.clone().sub(p), L = d.length();
      tallos.push(new THREE.CylinderGeometry(0.06 - k * 0.008, 0.075 - k * 0.008, L, 8).translate(0, L / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), d.normalize())).translate(p.x, p.y, p.z));
      p = q;
    }
    const centro = p.clone().add(v(0, altura * 0.18, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + semilla, fin = centro.clone().add(v(Math.cos(a) * 0.55, (hash(k, 7) - 0.3) * 0.4, Math.sin(a) * 0.55));
      const d = fin.clone().sub(p), L = d.length();
      tallos.push(new THREE.CylinderGeometry(0.02, 0.035, L, 6).translate(0, L / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), d.normalize())).translate(p.x, p.y, p.z));
    }
    for (let k = 0; k < 230; k++) {
      // puntos en un elipsoide de copa
      const u = hash(k, 1) * Math.PI * 2, w = Math.acos(2 * hash(k, 2) - 1), r = 0.55 + hash(k, 3) * 0.45;
      const pos = centro.clone().add(v(Math.sin(w) * Math.cos(u) * r * 0.85, Math.cos(w) * r * 0.45, Math.sin(w) * Math.sin(u) * r * 0.85));
      const dir = pos.clone().sub(centro).add(v(0, 0.4, 0));
      c.setHSL(0.24 + hash(k, 4) * 0.04, 0.18, 0.75 + hash(k, 5) * 0.25);
      hojas.push(tarjeta(0.32, 0.32, pos, dir, hash(k, 6) * 6.28, c));
    }
    const m = new THREE.Mesh(mergeGeometries(hojas), matHojas(texRamaOlivo()));
    m.castShadow = m.receiveShadow = true; grupo.add(m);
  } else if (tipo === 'aveParaiso') {
    for (let k = 0; k < 14; k++) {
      const a = hash(k, semilla) * Math.PI * 2, incl = 0.12 + hash(k, 2) * 0.35;
      const dir = v(Math.cos(a) * incl, 1, Math.sin(a) * incl);
      const L = altura * (0.55 + hash(k, 3) * 0.35);
      tallos.push(new THREE.CylinderGeometry(0.012, 0.018, L, 5).translate(0, L / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), dir.clone().normalize())));
      const tope = dir.clone().normalize().multiplyScalar(L);
      c.setHSL(0.27 + hash(k, 4) * 0.04, 0.35, 0.8 + hash(k, 5) * 0.2);
      hojas.push(tarjeta(0.26, altura * 0.42, tope, dir.clone().add(v(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5)), a + Math.PI / 2, c));
    }
    const m = new THREE.Mesh(mergeGeometries(hojas), matHojas(texHojaAncha()));
    m.castShadow = m.receiveShadow = true; grupo.add(m);
  } else {
    for (let k = 0; k < 26; k++) {
      const a = hash(k, semilla) * Math.PI * 2, incl = 0.25 + hash(k, 2) * 0.6;
      c.setHSL(0.2 + hash(k, 4) * 0.06, 0.3, 0.8 + hash(k, 5) * 0.2);
      hojas.push(tarjeta(0.12, altura * (0.7 + hash(k, 3) * 0.4), v(0, 0, 0), v(Math.cos(a) * incl, 1, Math.sin(a) * incl), a, c));
    }
    const m = new THREE.Mesh(mergeGeometries(hojas), matHojas(texPasto()));
    m.castShadow = true; m.receiveShadow = true; grupo.add(m);
  }
  if (tallos.length) { const t = new THREE.Mesh(mergeGeometries(tallos.map((g) => g.index ? g.toNonIndexed() : g)), matTallo); t.castShadow = true; grupo.add(t); }
  return grupo;
}
