// Piscina realista: vaso con mosaico, agua con refracción (transmission), color por profundidad,
// reflejo del cielo y dos capas de ondas que se mueven. El origen del grupo es el centro de la lámina de agua.
import * as THREE from 'three';
import { caja, unir, uvMundo } from './geo.js';

const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };

let ondasCache = null, mosaicoCache = null;
// mapa de normales de ondas: suma de ondas con direcciones aleatorias (repetible sin costuras)
function texOndas() {
  if (ondasCache) return ondasCache;
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d'), img = g.createImageData(n, n);
  const ondas = Array.from({ length: 9 }, (_, k) => {
    const kx = Math.round((hash(k, 1) - 0.5) * 10) || 1, ky = Math.round((hash(k, 2) - 0.5) * 10) || 2; // enteros: repetible
    return { kx, ky, f: hash(k, 3) * 6.28, a: 1 / (1 + k * 0.5) };
  });
  const alt = (x, y) => ondas.reduce((s, o) => s + o.a * Math.sin(((x * o.kx + y * o.ky) / n) * Math.PI * 2 + o.f), 0);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = alt(x + 1, y) - alt(x - 1, y), dy = alt(x, y + 1) - alt(x, y - 1);
    const v = new THREE.Vector3(-dx * 1.6, -dy * 1.6, 1).normalize(), i = (y * n + x) * 4;
    img.data[i] = (v.x * 0.5 + 0.5) * 255; img.data[i + 1] = (v.y * 0.5 + 0.5) * 255; img.data[i + 2] = (v.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (ondasCache = t);
}
// mosaico de vidrio 2,5 cm (512 px = 1 m): blancos y aguamarina con junta clara
function texMosaico() {
  if (mosaicoCache) return mosaicoCache;
  const n = 512, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d');
  g.fillStyle = '#d9e6e3'; g.fillRect(0, 0, n, n);
  const c = 32, tonos = ['#bfe3e4', '#a9d9dc', '#cdeceb', '#93cdd3', '#e3f1ef', '#b3dfe0'];
  for (let y = 0; y < n / c; y++) for (let x = 0; x < n / c; x++) {
    g.fillStyle = tonos[Math.floor(hash(x, y) * tonos.length)];
    g.fillRect(x * c + 2, y * c + 2, c - 4, c - 4);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (mosaicoCache = t);
}

// ancho (x), largo (z), prof: profundidad visible del vaso; borde: ancho de la piedra de remate
export function crearPiscina({ ancho, largo, prof = 1.2, borde = 0.32, materialBorde, ligero = false }) {
  const grupo = new THREE.Group();
  const mosaico = texMosaico();
  // el vaso se oscurece con la profundidad (colores por vértice)
  const mVaso = new THREE.MeshStandardMaterial({ map: mosaico, roughness: 0.25, vertexColors: true });
  const vaso = uvMundo(unir([
    caja(ancho, 0.05, largo, 0, -prof, 0),
    caja(0.05, prof, largo, -ancho / 2, -prof / 2, 0), caja(0.05, prof, largo, ancho / 2, -prof / 2, 0),
    caja(ancho, prof, 0.05, 0, -prof / 2, -largo / 2), caja(ancho, prof, 0.05, 0, -prof / 2, largo / 2),
  ]), 1);
  const p = vaso.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, -p.getY(i) / prof); const k = 1 - 0.45 * t; col.set([k * 0.92, k, k], i * 3); }
  vaso.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mVasoMesh = new THREE.Mesh(vaso, mVaso); mVasoMesh.receiveShadow = true;
  grupo.add(mVasoMesh);
  // franja de línea de agua (mosaico más oscuro)
  grupo.add(new THREE.Mesh(uvMundo(unir([caja(0.06, 0.16, largo, -ancho / 2 + 0.01, -0.1, 0), caja(0.06, 0.16, largo, ancho / 2 - 0.01, -0.1, 0), caja(ancho, 0.16, 0.06, 0, -0.1, -largo / 2 + 0.01), caja(ancho, 0.16, 0.06, 0, -0.1, largo / 2 - 0.01)]), 1), new THREE.MeshStandardMaterial({ map: mosaico, color: '#3f8c97', roughness: 0.2 })));
  // remate de piedra
  if (materialBorde) {
    const b = borde, e = 0.06;
    const remate = new THREE.Mesh(uvMundo(unir([
      caja(ancho + 2 * b, e, b, 0, 0.03 + e / 2, -largo / 2 - b / 2), caja(ancho + 2 * b, e, b, 0, 0.03 + e / 2, largo / 2 + b / 2),
      caja(b, e, largo, -ancho / 2 - b / 2, 0.03 + e / 2, 0), caja(b, e, largo, ancho / 2 + b / 2, 0.03 + e / 2, 0),
    ]), 1), materialBorde);
    remate.castShadow = remate.receiveShadow = true;
    grupo.add(remate);
  }
  // lámina de agua
  const ondas = texOndas();
  const n1 = ondas.clone(), n2 = ondas.clone();
  n1.repeat.set(ancho / 2.6, largo / 2.6); n2.repeat.set(ancho / 1.4, largo / 1.4);
  n1.needsUpdate = n2.needsUpdate = true;
  const mAgua = ligero
    ? new THREE.MeshPhysicalMaterial({ color: '#4aa9b8', transparent: true, opacity: 0.55, roughness: 0.03, metalness: 0, normalMap: n1, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 1, clearcoatRoughness: 0.02, clearcoatNormalMap: n2, clearcoatNormalScale: new THREE.Vector2(0.4, 0.4), depthWrite: false })
    : new THREE.MeshPhysicalMaterial({
      color: '#ffffff', transmission: 1, thickness: prof, ior: 1.333, roughness: 0.02, metalness: 0,
      attenuationColor: new THREE.Color('#2f9fae'), attenuationDistance: 0.9,
      normalMap: n1, normalScale: new THREE.Vector2(0.18, 0.18),
      clearcoat: 1, clearcoatRoughness: 0.0, clearcoatNormalMap: n2, clearcoatNormalScale: new THREE.Vector2(0.35, 0.35),
      specularIntensity: 1, envMapIntensity: 1.2,
    });
  const agua = new THREE.Mesh(new THREE.PlaneGeometry(ancho, largo).rotateX(-Math.PI / 2), mAgua);
  agua.position.y = -0.03;
  agua.userData.sinOclusion = true;
  grupo.add(agua);
  // luz subacuática para la noche
  const mLuz = new THREE.MeshBasicMaterial({ color: '#7fe3f0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const brillo = new THREE.Mesh(new THREE.PlaneGeometry(ancho * 0.96, largo * 0.96).rotateX(-Math.PI / 2), mLuz);
  brillo.position.y = -prof + 0.06;
  grupo.add(brillo);

  return {
    grupo, material: mAgua,
    animar(t) {
      n1.offset.set(t * 0.012, t * 0.007);
      n2.offset.set(-t * 0.009, t * 0.013);
    },
    noche(v) { mLuz.opacity = v * 0.55; },
  };
}
