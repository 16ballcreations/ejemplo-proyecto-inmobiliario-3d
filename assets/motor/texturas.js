// Texturas PBR (Poly Haven, CC0): una sola instancia por mapa, compartida por todos los materiales.
// La escala la da la geometría (coordenadas en metros con uvMundo), no la textura.
import * as THREE from 'three';

const BASE = new URL('../tex/', import.meta.url).href;
const MAPAS = {
  ladrillo: ['color', 'normal', 'arm'], concreto: ['color', 'normal', 'arm'], pasto: ['color', 'normal'],
  roca: ['color', 'normal'], cesped: ['color', 'normal'],
  tierra: ['color', 'normal'], grava: ['color', 'normal'], asfalto: ['color', 'normal'],
  roble: ['color', 'normal', 'arm'], travertino: ['color', 'normal', 'arm'], microcemento: ['color', 'normal', 'arm'],
  estuco: ['color', 'normal'], tela: ['color', 'normal'], lino: ['color', 'normal'], cuero: ['color', 'normal'],
  deck: ['color', 'normal'], nogal: ['color'], teja: ['color', 'normal', 'arm'],
};

export const gestor = new THREE.LoadingManager();
const cargador = new THREE.TextureLoader(gestor);
const cache = new Map();
let anisotropia = 8;
export function configurarTexturas(renderer) { anisotropia = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }

export function textura(nombre, mapa) {
  const k = nombre + '_' + mapa;
  if (!cache.has(k)) {
    const t = cargador.load(BASE + k + '.webp');
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = mapa === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropia;
    cache.set(k, t);
  }
  return cache.get(k);
}

// Mapas listos para usar en un material: { map, normalMap, aoMap, roughnessMap, metalnessMap }
export function pbr(nombre, { normal = 1 } = {}) {
  const out = {};
  for (const m of MAPAS[nombre] || ['color']) {
    const t = textura(nombre, m);
    if (m === 'color') out.map = t;
    if (m === 'normal') { out.normalMap = t; out.normalScale = new THREE.Vector2(normal, normal); }
    if (m === 'arm') { out.aoMap = t; out.roughnessMap = t; out.metalnessMap = t; }
  }
  return out;
}

// avance de carga para la interfaz
gestor.onProgress = (url, n, total) => gestor.onAvance?.(n / total);
gestor.onLoad = () => gestor.onListo?.();
