// Utilidades de geometría: cajas, cajas redondeadas y coordenadas de textura en metros reales.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function caja(w, h, d, x = 0, y = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
export function redonda(w, h, d, r = 0.04, x = 0, y = 0, z = 0) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)).translate(x, y, z);
}
export function cilindro(rt, rb, h, x = 0, y = 0, z = 0, seg = 16) {
  return new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
}
// Proyección "caja": cada cara toma el plano según su normal. metros = cuántos metros cubre una repetición.
export function uvMundo(g, metros = 1) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / metros; uv[i * 2 + 1] = v / metros;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
export function unir(lista, metros) {
  const g = mergeGeometries(lista.map((x) => (x.index ? x.toNonIndexed() : x)));
  return metros ? uvMundo(g, metros) : g;
}
export function malla(geo, mat, { sombra = true, recibe = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = sombra; m.receiveShadow = recibe;
  return m;
}
export { mergeGeometries };
