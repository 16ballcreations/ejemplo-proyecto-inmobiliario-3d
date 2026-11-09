// Urbanismo y amenidades de Arrayán: vía de acceso con demarcación, retorno frente al lobby, estacionamiento con carros,
// cancha de tenis reglamentaria, piscina con deck y paisajismo. Todo sobre la meseta del lote (y = 0 hasta r ≈ 92 m).
import * as THREE from 'three';
import { pbr } from './motor/texturas.js';
import { caja, redonda, cilindro, unir, uvMundo } from './motor/geo.js';
import { crearArbolesShader } from './motor/arboles-shader.js';
import { hash } from './motor/vegetacion.js';
import { crearPiscina } from './motor/agua.js';
import { crearPlanta } from './motor/plantas.js';

const malla = (geo, mat, sombra = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = sombra; m.receiveShadow = true; return m; };

// ---------- texturas por código ----------
function lienzo(w, h, dibujar) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  dibujar(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// Cancha de tenis: 36,58 × 18,29 m de superficie; juego de dobles 23,77 × 10,97 m. 40 px por metro.
function texCancha() {
  const K = 40, W = 18.29 * K, H = 36.58 * K;
  return lienzo(Math.round(W), Math.round(H), (g) => {
    g.fillStyle = '#3f6b4f'; g.fillRect(0, 0, W, H);
    const x0 = (W - 10.97 * K) / 2, y0 = (H - 23.77 * K) / 2;
    g.fillStyle = '#2f5d86'; g.fillRect(x0 - 0.6 * K, y0 - 1.2 * K, 10.97 * K + 1.2 * K, 23.77 * K + 2.4 * K);
    // grano de la superficie
    for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(255,255,255,${hash(k, 1) * 0.04})`; g.fillRect(hash(k, 2) * W, hash(k, 3) * H, 2, 2); }
    g.strokeStyle = '#f4f4ef'; g.lineWidth = 0.05 * K;
    g.strokeRect(x0, y0, 10.97 * K, 23.77 * K);                    // dobles
    const s = 1.37 * K;
    g.beginPath(); g.moveTo(x0 + s, y0); g.lineTo(x0 + s, y0 + 23.77 * K); g.moveTo(x0 + 10.97 * K - s, y0); g.lineTo(x0 + 10.97 * K - s, y0 + 23.77 * K); g.stroke(); // sencillos
    const ys = 6.4 * K, cy = H / 2;
    g.beginPath(); g.moveTo(x0 + s, cy - ys); g.lineTo(x0 + 10.97 * K - s, cy - ys); g.moveTo(x0 + s, cy + ys); g.lineTo(x0 + 10.97 * K - s, cy + ys); g.stroke(); // saque
    g.beginPath(); g.moveTo(W / 2, cy - ys); g.lineTo(W / 2, cy + ys); g.stroke(); // central
    g.beginPath(); g.moveTo(W / 2, y0); g.lineTo(W / 2, y0 + 0.3 * K); g.moveTo(W / 2, y0 + 23.77 * K); g.lineTo(W / 2, y0 + 23.77 * K - 0.3 * K); g.stroke();
  });
}
function texMalla(ancho = 64) {
  const cv = document.createElement('canvas'); cv.width = cv.height = ancho;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, ancho, ancho);
  g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, ancho / 2); g.lineTo(ancho / 2, 0); g.lineTo(ancho, ancho / 2); g.lineTo(ancho / 2, ancho); g.closePath(); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// ---------- cinta (vía, andén) que sigue una curva y el terreno ----------
function cinta(puntos, ancho, alturaFn, elevar = 0.12, desplazar = 0) {
  const curva = new THREE.CatmullRomCurve3(puntos);
  const L = curva.getLength(), N = Math.max(8, Math.round(L / 1.5));
  const pts = curva.getSpacedPoints(N);
  const pos = [], uv = [], ci = [], idx = [];
  let acum = 0;
  for (let k = 0; k <= N; k++) {
    const a = pts[k], b = pts[Math.min(N, k + 1)], c = pts[Math.max(0, k - 1)];
    const d = new THREE.Vector3().subVectors(b, c).normalize();
    const nrm = new THREE.Vector3(-d.z, 0, d.x);
    if (k > 0) acum += a.distanceTo(pts[k - 1]);
    for (const lado of [0, 1]) {
      const off = desplazar + (lado - 0.5) * ancho;
      const v = a.clone().addScaledVector(nrm, off);
      v.y = alturaFn(v.x, v.z) + elevar;
      pos.push(v.x, v.y, v.z);
      uv.push((lado * ancho) / 4, acum / 4);
      ci.push(lado, acum);
    }
    if (k < N) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCinta', new THREE.Float32BufferAttribute(ci, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, curva };
}
// asfalto con demarcación dibujada en el shader (bordes blancos, central amarilla discontinua)
function materialVia(base, { central = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.92, color: '#d9d4cc' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.conCentral = { value: central ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCinta; varying vec2 vCinta;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCinta = aCinta;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCinta; uniform float conCentral;').replace('#include <map_fragment>', `#include <map_fragment>
      float u = vCinta.x, v = vCinta.y;
      float borde = step(u, 0.035) * step(0.02, u) + step(0.965, u) * step(u, 0.98);
      float centro = conCentral * step(abs(u - 0.5), 0.011) * step(fract(v / 9.0), 0.55);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), borde * 0.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.75, 0.2), centro * 0.9);`);
  };
  return m;
}

// ---------- carros ----------
function geosCarro() {
  // carrocería baja con capó largo, cabina de vidrio retrasada y techo del color del carro; ruedas que asoman bajo el chasís
  const cuerpo = unir([redonda(4.5, 0.55, 1.84, 0.2, 0, 0.58, 0), redonda(2.3, 0.07, 1.5, 0.035, -0.32, 1.35, 0)]);
  const cabina = redonda(2.5, 0.52, 1.62, 0.24, -0.28, 1.08, 0);
  const ruedas = unir([[-1.45, -0.84], [-1.45, 0.84], [1.45, -0.84], [1.45, 0.84]].map(([x, z]) => new THREE.CylinderGeometry(0.35, 0.35, 0.24, 18).rotateX(Math.PI / 2).translate(x, 0.35, z)));
  return { cuerpo, cabina, ruedas };
}

export function crearUrbanismo({ alturaFn, ligero = false, mVidrio }) {
  const grupo = new THREE.Group(), fijo = new THREE.Group();
  const mTravertino = new THREE.MeshStandardMaterial({ ...pbr('travertino'), roughness: 0.6 });
  const mConcreto = new THREE.MeshStandardMaterial({ ...pbr('concreto'), color: '#d6d0c6' });
  const mAsfalto = pbr('asfalto');
  const mDeck = new THREE.MeshStandardMaterial({ ...pbr('deck'), roughness: 0.8 });
  const mNegro = new THREE.MeshStandardMaterial({ color: '#23211f', metalness: 0.6, roughness: 0.45 });
  const mBlanco = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.5 });
  const mLona = new THREE.MeshStandardMaterial({ ...pbr('lino'), color: '#efe4cf', roughness: 1, side: THREE.DoubleSide });
  const mFarol = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffd39a', emissiveIntensity: 0 });
  const mCharco = new THREE.MeshBasicMaterial({ color: '#ffb769', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: lienzo(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }) });
  const faroles = [], cabezas = [], charcos = [];
  const farol = (x, z, alto = 5, giro = 0) => {
    faroles.push(cilindro(0.07, 0.1, alto, x, alto / 2, z, 8), caja(1.1, 0.06, 0.08, x + Math.cos(giro) * 0.5, alto, z + Math.sin(giro) * 0.5));
    cabezas.push(redonda(0.55, 0.12, 0.28, 0.04, x + Math.cos(giro) * 1.0, alto - 0.05, z + Math.sin(giro) * 1.0));
    charcos.push([x + Math.cos(giro) * 1.0, z + Math.sin(giro) * 1.0, alto * 1.3]);
  };

  // ---- vía de acceso: sube desde el valle hasta el retorno del lobby ----
  const ruta = [new THREE.Vector3(0, 0, 30)];
  for (let k = 1; k <= 30; k++) { const t = k / 30; ruta.push(new THREE.Vector3(Math.sin(t * 3.0) * 46 * t * t, 0, 30 + t * 300)); }
  const via = cinta(ruta, 7.4, alturaFn, 0.14);
  const viaM = malla(via.geo, materialVia(mAsfalto), false);
  fijo.add(viaM);
  const anden = (lado) => malla(uvMundo(cinta(ruta.slice(0, 12), 2.2, alturaFn, 0.3, lado * 4.85).geo, 2), mConcreto, false);
  grupo.add(anden(1), anden(-1));
  const pv = via.curva.getSpacedPoints(30);
  pv.forEach((p, k) => { if (k % 2 === 0 && k < 26) { const lado = k % 4 === 0 ? 1 : -1; const d = via.curva.getTangentAt(k / 30); const nx = -d.z * lado, nz = d.x * lado; farol(p.x + nx * 4.4, p.z + nz * 4.4, 6, Math.atan2(-nz, -nx)); } });

  // ---- retorno frente al lobby: anillo con isla ajardinada ----
  const anillo = [];
  for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; anillo.push(new THREE.Vector3(Math.cos(a) * 13, 0, 36 + Math.sin(a) * 8.5)); }
  const ret = cinta(anillo, 6, alturaFn, 0.16);
  grupo.add(malla(ret.geo, materialVia(mAsfalto, { central: false }), false));
  grupo.add(malla(uvMundo(new THREE.CylinderGeometry(1, 1, 0.45, 48).scale(9.6, 1, 5.1).translate(0, 0.22, 36), 2), mConcreto));
  // plaza de llegada en travertino, bajo la marquesina
  grupo.add(malla(uvMundo(caja(46, 0.2, 13, 0, 0.1, 21.5), 3), mTravertino, false));
  grupo.add(malla(uvMundo(caja(48, 0.2, 48, 0, 0.08, 0), 3), mTravertino, false));

  // ---- estacionamiento al oriente ----
  const PX0 = 24, PX1 = 66, PZ0 = 4, PZ1 = 46;
  const lote = malla(uvMundo(caja(PX1 - PX0, 0.2, PZ1 - PZ0, (PX0 + PX1) / 2, 0.12, (PZ0 + PZ1) / 2), 4), new THREE.MeshStandardMaterial({ ...mAsfalto, roughness: 0.92, color: '#d9d4cc' }), false);
  grupo.add(lote);
  grupo.add(malla(uvMundo(caja(14, 0.2, 6, 17, 0.12, 40), 4), new THREE.MeshStandardMaterial({ ...mAsfalto, roughness: 0.92, color: '#d9d4cc' }), false));
  const lineas = [], celdas = [];
  for (const fila of [{ z: PZ0 + 2.6, dir: 1 }, { z: PZ0 + 19.5, dir: -1 }, { z: PZ0 + 22.5, dir: 1 }, { z: PZ1 - 2.6, dir: -1 }]) {
    for (let k = 0; k <= 14; k++) {
      const x = PX0 + 3 + k * 2.65;
      lineas.push(caja(0.12, 0.02, 5, x, 0.23, fila.z));
      if (k < 14) celdas.push({ x: x + 1.32, z: fila.z, dir: fila.dir });
    }
  }
  grupo.add(malla(unir(lineas), mBlanco, false));
  grupo.add(malla(uvMundo(caja(PX1 - PX0 - 4, 0.25, 1.2, (PX0 + PX1) / 2, 0.24, PZ0 + 21), 2), mConcreto)); // separador central
  const { cuerpo, cabina, ruedas } = geosCarro();
  const ocupadas = celdas.filter((c, k) => hash(k, 3) > 0.32);
  const colores = ['#f2f2f0', '#c9cacb', '#1e2124', '#8a8f94', '#7a1f1f', '#2c3e5c', '#f2f2f0', '#3b3e42', '#d8d5cc'];
  const iCuerpo = new THREE.InstancedMesh(cuerpo, new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }), ocupadas.length);
  const iCabina = new THREE.InstancedMesh(cabina, mVidrio, ocupadas.length);
  const iRuedas = new THREE.InstancedMesh(ruedas, mNegro, ocupadas.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0);
  ocupadas.forEach((c, k) => {
    q.setFromAxisAngle(eje, Math.PI / 2 * c.dir + (hash(k, 9) - 0.5) * 0.06);
    v.set(c.x + (hash(k, 7) - 0.5) * 0.2, 0.22, c.z);
    m4.compose(v, q, e);
    for (const im of [iCuerpo, iCabina, iRuedas]) im.setMatrixAt(k, m4);
    iCuerpo.setColorAt(k, new THREE.Color(colores[Math.floor(hash(k, 11) * colores.length)]));
  });
  for (const im of [iCuerpo, iCabina, iRuedas]) { im.castShadow = true; im.receiveShadow = true; grupo.add(im); }
  for (let k = 0; k < 4; k++) farol(PX0 + 6 + k * 11, PZ0 + 21, 7, Math.PI / 2);

  // ---- cancha de tenis al nororiente ----
  const TX = 42, TZ = -38, CW = 18.29, CL = 36.58;
  const cancha = new THREE.Mesh(new THREE.PlaneGeometry(CW, CL).rotateX(-Math.PI / 2).translate(TX, 0.26, TZ), new THREE.MeshStandardMaterial({ map: texCancha(), roughness: 0.75 }));
  cancha.receiveShadow = true;
  grupo.add(cancha, malla(uvMundo(caja(CW + 1, 0.22, CL + 1, TX, 0.12, TZ), 2), mConcreto, false));
  // red
  const tRed = texMalla(16); tRed.repeat.set(160, 9);
  // la red cruza la cancha a lo ancho (eje x)
  const red = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 0.92).translate(TX, 0.72, TZ), new THREE.MeshStandardMaterial({ color: '#1b1b1b', alphaMap: tRed, alphaTest: 0.4, side: THREE.DoubleSide }));
  grupo.add(red, malla(unir([caja(12.8, 0.07, 0.06, TX, 1.15, TZ), cilindro(0.05, 0.05, 1.07, TX - 6.4, 0.78, TZ, 8), cilindro(0.05, 0.05, 1.07, TX + 6.4, 0.78, TZ, 8)]), mBlanco));
  // malla perimetral 3,6 m con postes
  const tCerco = texMalla(48);
  const cerco = new THREE.MeshStandardMaterial({ color: '#2c3a30', alphaMap: tCerco, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 });
  const lados = [[CW, 0, -CL / 2], [CW, 0, CL / 2], [CL, Math.PI / 2, -CW / 2], [CL, Math.PI / 2, CW / 2]];
  const postes = [];
  for (const [L, rot, off] of lados) {
    const g = new THREE.PlaneGeometry(L, 3.6).translate(0, 1.8 + 0.22, 0);
    const t = tCerco.clone(); t.repeat.set(L * 6, 3.6 * 6); t.needsUpdate = true;
    const pared = new THREE.Mesh(g, cerco.clone()); pared.material.alphaMap = t;
    pared.rotation.y = rot;
    if (rot === 0) pared.position.set(TX, 0, TZ + off); else pared.position.set(TX + off, 0, TZ);
    pared.castShadow = true;
    grupo.add(pared);
    const n = Math.round(L / 3);
    for (let k = 0; k <= n; k++) { const t2 = -L / 2 + (k * L) / n; postes.push(rot === 0 ? cilindro(0.04, 0.04, 3.7, TX + t2, 1.85 + 0.2, TZ + off, 6) : cilindro(0.04, 0.04, 3.7, TX + off, 1.85 + 0.2, TZ + t2, 6)); }
  }
  grupo.add(malla(unir(postes), mNegro));
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const x = TX + sx * (CW / 2 + 0.4), z = TZ + sz * (CL / 4);
    faroles.push(cilindro(0.09, 0.12, 9, x, 4.5, z, 8));
    cabezas.push(redonda(0.9, 0.4, 0.5, 0.05, x - sx * 0.3, 9, z));
    charcos.push([TX + sx * CW * 0.25, TZ + sz * CL * 0.22, 14]);
  }

  // ---- piscina al poniente, mirando al valle ----
  const DX0 = -62, DX1 = -37, DZ0 = -18, DZ1 = 18; // deck a la medida de la piscina; alrededor, prado
  const PW = 10, PL = 25, PXc = -50, PZc = 0;
  // deck elevado 0,5 m: marco alrededor del vaso
  const deck = [
    caja(DX1 - DX0, 0.5, PZc - PL / 2 - DZ0, (DX0 + DX1) / 2, 0.25, (DZ0 + PZc - PL / 2) / 2),
    caja(DX1 - DX0, 0.5, DZ1 - (PZc + PL / 2), (DX0 + DX1) / 2, 0.25, (DZ1 + PZc + PL / 2) / 2),
    caja(PXc - PW / 2 - DX0, 0.5, PL, (DX0 + PXc - PW / 2) / 2, 0.25, PZc),
    caja(DX1 - (PXc + PW / 2), 0.5, PL, (DX1 + PXc + PW / 2) / 2, 0.25, PZc),
  ];
  grupo.add(malla(unir(deck, 2.6), mTravertino));
  // vaso con mosaico y agua real (refracción, ondas, reflejo del cielo); remate de travertino
  const piscina = crearPiscina({ ancho: PW, largo: PL, prof: 0.46, borde: 0.4, materialBorde: mTravertino, ligero });
  piscina.grupo.position.set(PXc, 0.5, PZc);
  grupo.add(piscina.grupo);
  // baranda de vidrio al borde del valle
  grupo.add(malla(caja(0.04, 1.1, DZ1 - DZ0, DX0 + 0.3, 1.05, 0), mVidrio, false), malla(caja(0.07, 0.05, DZ1 - DZ0, DX0 + 0.3, 1.62, 0), mNegro, false));
  // asoleadoras de teca con colchoneta, mirando a la piscina y al valle (oeste): espaldar al este
  const marcos = [], colchones = [], espaldares = [], lonas = [], palos = [];
  for (let k = 0; k < 7; k++) {
    const z = -10.5 + k * 3.5, x = PXc + PW / 2 + 4.6;
    marcos.push(redonda(2.0, 0.2, 0.78, 0.03, x, 0.62, z));
    colchones.push(redonda(1.9, 0.1, 0.72, 0.05, x - 0.05, 0.76, z));
    espaldares.push(redonda(0.1, 0.66, 0.72, 0.05).rotateZ(-0.5).translate(x + 0.85, 1.02, z));
    if (k % 2 === 1) { lonas.push(new THREE.ConeGeometry(1.7, 0.5, 12, 1, true).translate(x + 0.2, 3.1, z + 1.75)); palos.push(cilindro(0.03, 0.03, 2.6, x + 0.2, 1.8, z + 1.75, 6)); }
  }
  grupo.add(malla(unir(marcos, 1), mDeck), malla(unir([...colchones, ...espaldares]), mLona), malla(unir(lonas), mLona), malla(unir(palos), mNegro));
  // pérgola de madera al sur del deck con sala exterior mirando a la piscina
  const pergola = [];
  for (let k = 0; k < 17; k++) pergola.push(caja(0.1, 0.22, 4.2, -55 + k * 0.62, 3.4, -15.8));
  pergola.push(caja(10.2, 0.25, 0.18, -50, 3.2, -17.8), caja(10.2, 0.25, 0.18, -50, 3.2, -13.8));
  for (const x of [-55, -45]) for (const z of [-17.8, -13.8]) pergola.push(cilindro(0.11, 0.11, 2.75, x, 1.87, z, 8));
  grupo.add(malla(unir(pergola, 1.5), mDeck));
  grupo.add(malla(unir([redonda(4.6, 0.4, 0.95, 0.1, -50, 0.72, -16.9), redonda(4.6, 0.55, 0.25, 0.1, -50, 1.12, -17.35), redonda(0.9, 0.4, 0.95, 0.1, -53.2, 0.72, -15.6), redonda(0.9, 0.4, 0.95, 0.1, -46.8, 0.72, -15.6)]), mLona));
  grupo.add(malla(uvMundo(redonda(1.6, 0.3, 0.9, 0.04, -50, 0.66, -15.2), 1), mTravertino));
  // materas con pasto ornamental en las esquinas del deck
  for (const [x, z] of [[-60.6, -16.6], [-60.6, 16.6], [-38.4, 16.6], [-38.4, -12.2]]) {
    grupo.add(malla(uvMundo(redonda(1.1, 0.7, 1.1, 0.06, x, 0.85, z), 1), mConcreto));
    const pl = crearPlanta('pasto', { altura: 1.1, semilla: Math.abs(x + z) }); pl.position.set(x, 1.2, z); pl.scale.setScalar(1.4); grupo.add(pl);
  }

  // ---- faroles y su luz en el piso ----
  grupo.add(malla(unir(faroles), mNegro), malla(unir(cabezas), mFarol, false));
  const geoCharco = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const iCharco = new THREE.InstancedMesh(geoCharco, mCharco, charcos.length);
  charcos.forEach(([x, z, r], k) => { m4.compose(v.set(x, alturaFn(x, z) + 0.35, z), q.identity(), e.set(r, 1, r)); iCharco.setMatrixAt(k, m4); });
  e.set(1, 1, 1);
  iCharco.renderOrder = 2;
  grupo.add(iCharco);

  // ---- paisajismo: árboles y setos (por shader) ----
  const libres = (x, z) => {
    if (Math.abs(x) < 26 && Math.abs(z) < 26) return false;                 // torre y plaza
    if (x > PX0 - 3 && x < PX1 + 3 && z > PZ0 - 3 && z < PZ1 + 3) return false; // parqueadero
    if (x > TX - CW / 2 - 3 && x < TX + CW / 2 + 3 && z > TZ - CL / 2 - 3 && z < TZ + CL / 2 + 3) return false; // tenis
    if (x > DX0 - 1 && x < DX1 + 2 && z > DZ0 - 2 && z < DZ1 + 2) return false; // piscina
    if (Math.abs(x) < 9 && z > 26) return false;                            // vía
    if (Math.hypot(x / 16, (z - 36) / 11) < 1.1) return false;              // retorno
    return true;
  };
  const sitio = [];
  for (let k = 0; sitio.length < 140 && k < 5000; k++) {
    const a = hash(k, 1) * Math.PI * 2, r = 20 + hash(k, 2) * 70, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!libres(x, z)) continue;
    const t = hash(k, 3);
    sitio.push({ x, y: alturaFn(x, z), z, tipo: t < 0.6 ? 0 : t < 0.75 ? 1 : 2, alto: t < 0.6 ? 6 + hash(k, 4) * 4 : t < 0.75 ? 9 + hash(k, 4) * 5 : 1.4 + hash(k, 4) });
  }
  // setos al borde del parqueadero y la cancha
  for (let k = 0; k < 18; k++) sitio.push({ x: PX0 - 1.5, y: 0, z: PZ0 + 1 + k * 2.4, tipo: 2, alto: 1.3 });
  for (let k = 0; k < 16; k++) sitio.push({ x: TX - CW / 2 - 2, y: 0, z: TZ - CL / 2 + 1 + k * 2.3, tipo: 2, alto: 1.5 });
  for (let k = 0; k < 6; k++) sitio.push({ x: (hash(k, 8) - 0.5) * 14, y: 0.45, z: 36 + (hash(k, 9) - 0.5) * 6, tipo: k < 2 ? 0 : 2, alto: k < 2 ? 5 : 1.4 });
  grupo.add(crearArbolesShader({ cantidad: sitio.length, pos: (k) => sitio[k] || null, ligero }));

  return {
    grupo,
    // aparece con la fase de urbanismo; de noche se encienden faroles y luces en el piso
    actualizar(p, noche, tramo) {
      const t = tramo;
      grupo.visible = t > 0;
      grupo.scale.y = Math.max(0.001, Math.min(1, t * 1.6));
      mFarol.emissiveIntensity = noche * 5;
      mCharco.opacity = noche * 0.5;
      piscina.noche(noche);
    },
    // la vía de acceso existe desde la obra
    fijo,
  };
}
