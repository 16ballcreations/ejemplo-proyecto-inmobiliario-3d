// Versión B · la torre se construye en 3D, en vivo, según el avance del scroll.
// Usa el motor común (render con postproceso, cielo fotográfico, texturas PBR) y el lugar «Las Palmas».
import * as THREE from 'three';
import { PROYECTO, COTA, pisosEn } from './datos.js';
import { crearRender } from './motor/render.js';
import { crearCieloFoto } from './motor/cielo.js';
import { pbr, gestor } from './motor/texturas.js';
import { caja, redonda, cilindro, unir, malla, uvMundo } from './motor/geo.js';
import { geoFrondoso, geoArbusto, sembrar, hash } from './motor/vegetacion.js';
import { crearPaisaje, altura } from './lugares/las-palmas.js';
import { crearUrbanismo } from './urbanismo.js';
import { crearPiscina } from './motor/agua.js';

const { ancho: W, fondo: D, alturaBasamento: HB, alturaPiso: HP, alturaPH: HPH, pisos: N } = PROYECTO;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mezcla = (a, b, t) => a + (b - a) * t;
const facil = (t) => t * t * (3 - 2 * t);
const tramo = (p, a, b) => clamp((p - a) / (b - a));

// ---------- texturas de interiores (lo que se ve tras el vidrio) ----------
function texInteriores() {
  const w = 1024, h = 128, cv = document.createElement('canvas'), em = document.createElement('canvas');
  cv.width = em.width = w; cv.height = em.height = h;
  const g = cv.getContext('2d'), e = em.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, w, h);
  const cuartos = 22;
  for (let k = 0; k < cuartos; k++) {
    const x0 = (k * w) / cuartos, cw = w / cuartos;
    const t = hash(k, 3);
    // fondo del cuarto: oscuro, un poco cálido o frío, con cielo raso más claro arriba
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `hsl(${30 + t * 20}, 12%, ${26 + t * 10}%)`);
    gr.addColorStop(0.18, `hsl(${30 + t * 20}, 10%, ${15 + t * 6}%)`);
    gr.addColorStop(1, `hsl(${25 + t * 20}, 10%, ${9 + t * 5}%)`);
    g.fillStyle = gr; g.fillRect(x0, 0, cw, h);
    // cortinas en algunos
    if (hash(k, 5) > 0.6) { g.fillStyle = 'rgba(225,215,200,.55)'; g.fillRect(x0 + cw * (hash(k, 6) > 0.5 ? 0 : 0.55), 6, cw * 0.45, h - 6); }
    // muebles: siluetas bajas
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0 + cw * 0.15, h * 0.72, cw * 0.5, h * 0.28);
    // de noche: algunos cuartos encendidos (cálidos), con caída de luz hacia abajo
    if (hash(k, 7) > 0.55) {
      const le = e.createLinearGradient(0, 0, 0, h);
      const tono = hash(k, 8) > 0.85 ? '210,225,255' : '255,196,130';
      le.addColorStop(0, `rgba(${tono},1)`); le.addColorStop(0.5, `rgba(${tono},.55)`); le.addColorStop(1, `rgba(${tono},.25)`);
      e.fillStyle = le; e.fillRect(x0 + 2, 0, cw - 4, h);
      if (hash(k, 5) > 0.6) { e.fillStyle = 'rgba(255,220,170,.8)'; e.fillRect(x0 + cw * (hash(k, 6) > 0.5 ? 0 : 0.55), 6, cw * 0.45, h - 6); }
    }
    // separación entre cuartos
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0, 0, 3, h); e.fillStyle = '#000'; e.fillRect(x0, 0, 3, h);
  }
  const a = new THREE.CanvasTexture(cv), b = new THREE.CanvasTexture(em);
  for (const t of [a, b]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; }
  return [a, b];
}
function texReticula() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 9; g.strokeRect(4, 4, 120, 120);
  g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 128); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function texCartel(texto) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#2b2622'; g.fillRect(0, 0, 1024, 96);
  g.fillStyle = '#efe8dc'; g.font = '300 58px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '18px';
  g.fillText(texto, 512, 52);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function crearTorre3D(canvas, { ligero = false, alCargar } = {}) {
  const motor = crearRender(canvas, { ligero });
  motor.oclusion({ radius: 3.2, distanceExponent: 1.6, thickness: 6, scale: 1.2 });
  const scene = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(36, 1, 1, 40000);
  motor.preparar(scene, camara);

  // ---------- cielo, luz y paisaje ----------
  const cielo = crearCieloFoto({ ligero, gestor });
  scene.add(cielo.malla);
  const sol = new THREE.DirectionalLight('#fff1dc', 3);
  sol.castShadow = true;
  sol.shadow.mapSize.set(ligero ? 2048 : 4096, ligero ? 2048 : 4096);
  Object.assign(sol.shadow.camera, { left: -75, right: 75, top: 115, bottom: -30, near: 50, far: 900 });
  sol.shadow.bias = -0.00025; sol.shadow.normalBias = 0.04;
  scene.add(sol, sol.target);
  const hemi = new THREE.HemisphereLight('#cfdcef', '#4a3d2c', 0.6);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2('#b3bcbe', 0.00056);

  const paisaje = crearPaisaje({ ligero, anilloLibre: [128, 262] });
  scene.add(paisaje.grupo);

  // ---------- materiales ----------
  const mLadrillo = new THREE.MeshStandardMaterial({ ...pbr('ladrillo'), roughness: 1 });
  const mConcreto = new THREE.MeshStandardMaterial({ ...pbr('concreto'), color: '#d9d4cc' });
  const mConcretoObra = new THREE.MeshStandardMaterial({ ...pbr('concreto'), color: '#b7b1a8' });
  const [interior, interiorLuz] = texInteriores();
  interior.repeat.set(1 / 22, 1 / HP); interiorLuz.repeat.copy(interior.repeat);
  const mVidrio = new THREE.MeshPhysicalMaterial({
    map: interior, emissiveMap: interiorLuz, emissive: '#ffffff', emissiveIntensity: 0,
    roughness: 0.55, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25,
  });
  const mAluminio = new THREE.MeshStandardMaterial({ color: '#3a3936', metalness: 0.8, roughness: 0.35 });
  const mBaranda = new THREE.MeshPhysicalMaterial({ color: '#b9c7cc', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.28, envMapIntensity: 1.5, depthWrite: false });
  const mFormaleta = new THREE.MeshStandardMaterial({ map: pbr('nogal').map, color: '#e7c79c', roughness: 0.8 });
  const mMalla = new THREE.MeshStandardMaterial({ color: '#4f7a52', roughness: 1, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
  const mHierro = new THREE.MeshStandardMaterial({ color: '#4a3226', metalness: 0.6, roughness: 0.7 });
  const mAgua = new THREE.MeshPhysicalMaterial({ color: '#2c93a6', roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, emissive: '#0d5f6e', emissiveIntensity: 0.15, envMapIntensity: 1.4 });
  const mDeck = new THREE.MeshStandardMaterial({ ...pbr('deck'), roughness: 0.8 });
  const mGrava = new THREE.MeshStandardMaterial({ ...pbr('grava'), roughness: 1 });
  const mAsfalto = new THREE.MeshStandardMaterial({ ...pbr('asfalto'), roughness: 0.95, color: '#9a9690' });
  const mTravertino = new THREE.MeshStandardMaterial({ ...pbr('travertino'), roughness: 0.6 });
  const mFarol = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffd39a', emissiveIntensity: 0 });
  const mLobby = new THREE.MeshStandardMaterial({ color: '#2a2420', emissive: '#ffc98a', emissiveIntensity: 0.15, roughness: 0.6 });

  // ---------- obra: excavación ----------
  const torre = new THREE.Group();
  scene.add(torre);
  const hueco = malla(uvMundo(caja(40, 8, 36, 0, -4.02, 0), 3), new THREE.MeshStandardMaterial({ ...pbr('tierra'), color: '#9c8b74' }));
  torre.add(hueco);

  // ---------- basamento: ladrillo, lobby vidriado y marquesina ----------
  const basamento = new THREE.Group();
  basamento.add(malla(unir([caja(34, 1.4, 30, 0, 0.7, 0), caja(34, 1.3, 30, 0, HB - 0.65, 0), caja(1.4, HB, 30, -16.3, HB / 2, 0), caja(1.4, HB, 30, 16.3, HB / 2, 0)], 1.05), mLadrillo));
  const lobbyG = unir([caja(31.2, HB - 2.7, 0.1, 0, (HB - 2.7) / 2 + 1.4, 14.95), caja(31.2, HB - 2.7, 0.1, 0, (HB - 2.7) / 2 + 1.4, -14.95)]);
  basamento.add(malla(lobbyG, mLobby, { sombra: false }));
  basamento.add(malla(unir([caja(31.4, HB - 2.7, 0.06, 0, (HB - 2.7) / 2 + 1.4, 15.02), caja(31.4, HB - 2.7, 0.06, 0, (HB - 2.7) / 2 + 1.4, -15.02)]), mVidrio));
  const marquesina = new THREE.Group();
  marquesina.add(malla(uvMundo(caja(12, 0.45, 7, 0, HB - 1.6, 18.4), 2.5), mConcreto));
  marquesina.add(malla(unir([cilindro(0.18, 0.18, HB - 1.8, -5, (HB - 1.8) / 2, 21.4), cilindro(0.18, 0.18, HB - 1.8, 5, (HB - 1.8) / 2, 21.4)]), mAluminio));
  const cartel = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.75), new THREE.MeshStandardMaterial({ map: texCartel('ARRAYÁN'), roughness: 0.5 }));
  cartel.position.set(0, HB - 1.6, 21.91);
  marquesina.add(cartel);
  basamento.add(marquesina);
  torre.add(basamento);

  // ---------- pisos ----------
  const pisos = [];
  let piscinaPH = null;
  const geoArb = geoArbusto();
  for (let i = 1; i <= N; i++) {
    const esPH = i === N;
    const h = esPH ? HPH : HP;
    const y0 = HB + (i - 1) * HP;
    const g = new THREE.Group();
    g.position.y = y0;
    const lado = i % 2;

    // losa (borde de concreto a la vista) con balcones alternados al sur y al poniente
    const losaP = [caja(W, 0.38, D, 0, 0.19, 0)];
    if (!esPH) {
      losaP.push(caja(W / 2, 0.32, 2.4, lado ? W / 4 : -W / 4, 0.16, D / 2 + 1.2));
      losaP.push(caja(2.4, 0.32, D / 2, -W / 2 - 1.2, 0.16, lado ? -D / 4 : D / 4));
    } else losaP.push(caja(W + 8, 0.4, D + 8, -2, 0.2, 2));
    const losa = malla(unir(losaP, 2.5), mConcreto);

    // columnas
    const cols = [];
    for (const cx of [-W / 2 + 0.6, -W / 6, W / 6, W / 2 - 0.6]) for (const cz of [-D / 2 + 0.6, -D / 6, D / 6, D / 2 - 0.6]) {
      if (Math.abs(cx) < W / 2 - 1 && Math.abs(cz) < D / 2 - 1) continue;
      cols.push(caja(0.7, h - 0.38, 0.7, cx, (h - 0.38) / 2, cz));
    }
    const columnas = malla(unir(cols, 2), mConcretoObra);
    columnas.position.y = 0.38;
    // hierros en espera sobre las columnas del piso en obra
    const hierros = [];
    for (const c of cols) { const b = new THREE.Box3().setFromBufferAttribute(c.attributes.position); for (let k = 0; k < 4; k++) hierros.push(caja(0.03, 1.2, 0.03, b.min.x + 0.15 + (k % 2) * 0.4, h + 0.25, b.min.z + 0.15 + (k > 1 ? 0.4 : 0))); }
    const espera = malla(unir(hierros), mHierro, { sombra: false });
    // formaleta perimetral del piso en obra
    const formaleta = malla(unir([caja(W + 0.4, 1.0, 0.08, 0, h + 0.1, D / 2 + 0.2), caja(W + 0.4, 1.0, 0.08, 0, h + 0.1, -D / 2 - 0.2), caja(0.08, 1.0, D + 0.4, W / 2 + 0.2, h + 0.1, 0), caja(0.08, 1.0, D + 0.4, -W / 2 - 0.2, h + 0.1, 0)], 1.2), mFormaleta);

    // fachada
    const fach = new THREE.Group();
    const inset = esPH ? 2.2 : 0.75, hv = h - 0.45;
    const vid = [
      caja(W - inset * 2, hv, 0.1, 0, hv / 2 + 0.38, D / 2 - inset), caja(W - inset * 2, hv, 0.1, 0, hv / 2 + 0.38, -D / 2 + inset),
      caja(0.1, hv, D - inset * 2, W / 2 - inset, hv / 2 + 0.38, 0), caja(0.1, hv, D - inset * 2, -W / 2 + inset, hv / 2 + 0.38, 0),
    ];
    const gv = unir(vid, 1);
    // cada piso usa otro tramo de la tira de interiores
    const uv = gv.attributes.uv, desfase = hash(i, 2) * 22;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) + desfase, uv.getY(k) - 0.38);
    fach.add(malla(gv, mVidrio, { sombra: false }));
    const perf = [];
    const nb = esPH ? 12 : 9;
    for (let k = 0; k <= nb; k++) {
      const t = -W / 2 + inset + (k * (W - inset * 2)) / nb;
      perf.push(caja(0.07, hv, 0.12, t, hv / 2 + 0.38, D / 2 - inset + 0.06), caja(0.07, hv, 0.12, t, hv / 2 + 0.38, -D / 2 + inset - 0.06));
      perf.push(caja(0.12, hv, 0.07, W / 2 - inset + 0.06, hv / 2 + 0.38, t), caja(0.12, hv, 0.07, -W / 2 + inset - 0.06, hv / 2 + 0.38, t));
    }
    fach.add(malla(unir(perf), mAluminio, { sombra: false }));
    if (!esPH) {
      const aletas = [];
      const n = 9;
      for (let k = 0; k <= n; k++) {
        const t = -W / 2 + 0.3 + (k * (W - 0.6)) / n;
        aletas.push(caja(0.36, h - 0.38, 0.72, t, (h - 0.38) / 2, D / 2 - 0.36), caja(0.36, h - 0.38, 0.72, t, (h - 0.38) / 2, -D / 2 + 0.36));
        aletas.push(caja(0.72, h - 0.38, 0.36, W / 2 - 0.36, (h - 0.38) / 2, t), caja(0.72, h - 0.38, 0.36, -W / 2 + 0.36, (h - 0.38) / 2, t));
      }
      const al = malla(unir(aletas, 1.05), mLadrillo);
      al.position.y = 0.38;
      fach.add(al);
      const bx = lado ? W / 4 : -W / 4, bz = lado ? -D / 4 : D / 4;
      fach.add(malla(unir([caja(W / 2, 1.05, 0.04, bx, 0.84, D / 2 + 2.36), caja(0.04, 1.05, D / 2, -W / 2 - 2.36, 0.84, bz)]), mBaranda, { sombra: false }));
      fach.add(malla(unir([caja(W / 2, 0.06, 0.08, bx, 1.38, D / 2 + 2.36), caja(0.08, 0.06, D / 2, -W / 2 - 2.36, 1.38, bz)]), mAluminio, { sombra: false }));
      // jardineras con arbustos en los balcones
      const jard = [caja(W / 2 - 1, 0.5, 0.5, bx, 0.57, D / 2 + 1.95)];
      fach.add(malla(unir(jard, 1), mConcreto));
      const arb = sembrar(geoArb, 5, (k) => (k < 5 ? { x: bx - W / 4 + 1.6 + k * 2.2, y: 0.95, z: D / 2 + 1.95, escala: 0.38 } : null), { sombra: false });
      fach.add(arb);
    } else {
      // penthouse: marco oscuro, cubierta volada, pérgola de madera, deck y piscina
      fach.add(malla(uvMundo(caja(W - inset * 2 + 1.6, 0.55, D - inset * 2 + 1.6, 0, h + 0.1, 0), 2.5), mConcreto));
      fach.add(malla(unir([caja(0.04, 1.05, D + 8, -W / 2 - 5.98, 1.05, 2), caja(W + 8, 1.05, 0.04, -2, 1.05, D / 2 + 5.98)]), mBaranda, { sombra: false }));
      fach.add(malla(unir([caja(0.08, 0.06, D + 8, -W / 2 - 5.98, 1.6, 2), caja(W + 8, 0.06, 0.08, -2, 1.6, D / 2 + 5.98)]), mAluminio, { sombra: false }));
      fach.add(malla(uvMundo(caja(6, 0.05, D + 7, -W / 2 - 3, 0.43, 2.2), 2), mDeck));
      // piscina elevada en la terraza del penthouse, con el mismo vaso y agua del interior
      fach.add(malla(unir([caja(3.6, 0.5, 0.3, -W / 2 - 3.4, 0.68, -6.65), caja(3.6, 0.5, 0.3, -W / 2 - 3.4, 0.68, 8.65), caja(0.3, 0.5, 15, -W / 2 - 5.05, 0.68, 1), caja(0.3, 0.5, 15, -W / 2 - 1.75, 0.68, 1)], 1.2), mTravertino));
      piscinaPH = crearPiscina({ ancho: 3, largo: 15, prof: 0.48, borde: 0.3, materialBorde: mTravertino, ligero });
      piscinaPH.grupo.position.set(-W / 2 - 3.4, 0.93, 1);
      fach.add(piscinaPH.grupo);
      const perg = [];
      for (let k = 0; k < 18; k++) perg.push(caja(0.12, 0.22, 6.5, -W / 2 - 3, h - 0.3, -6 + k * 0.9));
      perg.push(caja(0.25, h - 0.6, 0.25, -W / 2 - 5.8, (h - 0.6) / 2 + 0.4, -6), caja(0.25, h - 0.6, 0.25, -W / 2 - 5.8, (h - 0.6) / 2 + 0.4, 9));
      fach.add(malla(unir(perg, 1.5), mFormaleta));
      // cubierta: equipos y antepecho
      fach.add(malla(uvMundo(caja(6, 1.8, 4, 3, h + 1.2, 2), 2), mConcretoObra));
    }
    const malla_ = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, h, D + 1.6), mMalla);
    malla_.position.y = h / 2 + 0.38;

    g.add(losa, columnas, espera, formaleta, fach, malla_);
    torre.add(g);
    pisos.push({ g, losa, columnas, espera, formaleta, fach, malla: malla_, y0, h });
  }

  // ---------- grúa torre ----------
  const ret = texReticula();
  const matGrua = (rx, ry) => { const t = ret.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ color: '#e5a823', roughness: 0.55, metalness: 0.2, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide }); };
  const grua = new THREE.Group();
  grua.position.set(W / 2 + 7.5, 0, -4);
  const mMastil = matGrua(1, 1);
  const mastil = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2).translate(0, 0.5, 0), mMastil);
  const baseGrua = malla(uvMundo(caja(6, 1.2, 6, 0, 0.6, 0), 2), mConcreto);
  const cabeza = new THREE.Group();
  const pluma = new THREE.Mesh(new THREE.BoxGeometry(56, 1.8, 1.8).translate(-18, 0, 0), matGrua(28, 1));
  const contra = new THREE.Mesh(new THREE.BoxGeometry(15, 1.5, 2.4).translate(13.5, -0.1, 0), matGrua(7, 1));
  const lastre = malla(unir([caja(1.2, 2.8, 2.6, 17.5, -1.6, 0), caja(1.2, 2.8, 2.6, 18.8, -1.6, 0), caja(1.2, 2.8, 2.6, 20.1, -1.6, 0)], 1.5), mConcreto);
  const cabina = malla(redonda(2.4, 2.3, 2.4, 0.2, 0, -1.7, 1.9), new THREE.MeshStandardMaterial({ color: '#f0c33c', roughness: 0.4 }));
  const vidCab = malla(caja(0.05, 1.2, 1.8, -1.22, -1.4, 1.9), mVidrio, { sombra: false });
  const punta = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 1.4).translate(0, 3.5, 0), matGrua(1, 4));
  const carro = malla(caja(1.6, 0.6, 2, -30, -1.1, 0), mAluminio);
  const cable = malla(caja(0.05, 1, 0.05, -30, -0.5, 0), mAluminio, { sombra: false });
  const gancho = malla(redonda(0.9, 1.1, 0.6, 0.12, -30, 0, 0), new THREE.MeshStandardMaterial({ color: '#d23b2a', roughness: 0.5 }));
  const baliza = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshStandardMaterial({ color: '#ff3b2a', emissive: '#ff2a1a', emissiveIntensity: 2 }));
  baliza.position.set(0, 7.2, 0);
  cabeza.add(pluma, contra, lastre, cabina, vidCab, punta, carro, cable, gancho, baliza);
  grua.add(baseGrua, mastil, cabeza);
  grua.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(grua);

  // ascensor de obra adosado a la fachada norte
  const elevador = new THREE.Group();
  elevador.position.set(-3, 0, -D / 2 - 1.6);
  const mastilEl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9).translate(0, 0.5, 0), matGrua(1, 1));
  const jaula = malla(redonda(2.6, 2.6, 1.8, 0.08, 1.8, 1.3, 0), new THREE.MeshStandardMaterial({ color: '#d0a640', roughness: 0.6 }));
  elevador.add(mastilEl, jaula);
  scene.add(elevador);

  // ---------- obra: cerramiento, campamento, materiales, mixer ----------
  const obra = new THREE.Group();
  const cercoG = new THREE.Group();
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    if (a > 1.25 && a < 1.85) continue;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.2), mMalla);
    p.position.set(Math.cos(a) * 47, 1.1, Math.sin(a) * 47);
    p.rotation.y = -a + Math.PI / 2;
    cercoG.add(p);
  }
  obra.add(cercoG);
  const colores = ['#2f5d8a', '#e1ddd3', '#e1ddd3', '#406b3c', '#b3412e'];
  for (let k = 0; k < 7; k++) {
    const a = 2.25 + k * 0.24 + hash(k, 4) * 0.08, rr = 34 + hash(k, 8) * 6;
    const c = malla(redonda(6, 2.6, 2.4, 0.06), new THREE.MeshStandardMaterial({ color: colores[k % 5], roughness: 0.5, metalness: 0.3 }));
    c.position.set(Math.cos(a) * rr, 1.3 + (k === 2 ? 2.6 : 0), Math.sin(a) * rr);
    c.rotation.y = -a + (hash(k, 6) - 0.5) * 0.3;
    const vent = malla(caja(2.4, 1, 0.04, 0, 0.2, 1.22), mVidrio, { sombra: false }); c.add(vent);
    obra.add(c);
  }
  // estibas de ladrillo, atados de varilla, formaleta y arena
  for (let k = 0; k < 10; k++) {
    const a = 3.4 + k * 0.13, rr = 26 + hash(k, 3) * 8;
    const est = malla(uvMundo(caja(1.2, 1.0, 1.0, 0, 0.5, 0), 1.05), mLadrillo);
    est.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); est.rotation.y = a;
    obra.add(est);
  }
  for (let k = 0; k < 5; k++) {
    const a = 4.9 + k * 0.1;
    const v = malla(caja(0.6, 0.3, 9, 0, 0.15 + (k % 2) * 0.3, 0), mHierro);
    v.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30); v.rotation.y = a + 1.2;
    obra.add(v);
  }
  const arena = new THREE.Mesh(new THREE.ConeGeometry(4, 2.4, 20), new THREE.MeshStandardMaterial({ ...pbr('tierra'), color: '#d9c3a0' }));
  arena.position.set(-24, 1.2, -22); arena.castShadow = arena.receiveShadow = true;
  obra.add(arena);
  // mixer de concreto
  const mixer = new THREE.Group();
  mixer.add(malla(redonda(2.4, 2.6, 2.5, 0.25, 3.6, 1.9, 0), new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.4 })));
  mixer.add(malla(caja(8.4, 0.5, 2.3, 0, 0.95, 0), mAluminio));
  const tambor = malla(new THREE.CylinderGeometry(1.0, 1.4, 4.6, 20).rotateZ(Math.PI / 2 - 0.25).translate(-1.2, 2.6, 0), new THREE.MeshStandardMaterial({ color: '#d84a2b', roughness: 0.45, metalness: 0.2 }));
  mixer.add(tambor);
  for (const x of [-3, -1.6, 3.4]) for (const z of [-1.05, 1.05]) mixer.add(malla(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16).rotateX(Math.PI / 2).translate(x, 0.5, z), mAluminio));
  mixer.position.set(8, 0, 32); mixer.rotation.y = -0.4;
  obra.add(mixer);
  scene.add(obra);

  // ---------- urbanismo y amenidades: vía, retorno, parqueadero, tenis, piscina, paisajismo ----------
  const urbanismo = crearUrbanismo({ alturaFn: altura, ligero, mVidrio });
  scene.add(urbanismo.grupo, urbanismo.fijo);

  // ---------- estado ----------
  let progreso = -1, ancho = 1, alto = 1;

  function aplicar(p) {
    const pb = tramo(p, 0.03, 0.1);
    hueco.visible = p < 0.06;
    basamento.visible = pb > 0;
    basamento.scale.y = Math.max(0.001, facil(pb));
    marquesina.visible = p > 0.74;

    const b = pisosEn(p);
    let tope = HB * pb, enObra = -1;
    for (let i = 0; i < N; i++) {
      const P = pisos[i];
      const s = clamp(b - i);
      const fFin = p >= 0.78 ? 1 : clamp((b - i - 3) / 1.2);
      P.g.visible = s > 0;
      if (s <= 0) continue;
      P.losa.position.y = (1 - facil(clamp(s * 3))) * 3;
      P.columnas.scale.y = Math.max(0.001, facil(clamp(s * 1.6 - 0.35)));
      P.fach.visible = fFin > 0;
      P.fach.scale.y = Math.max(0.001, facil(fFin));
      P.malla.visible = s > 0.3 && fFin < 1 && p < 0.78;
      const activo = s < 1 && p < 0.78;
      P.espera.visible = activo || (s >= 1 && clamp(b - i - 1) <= 0 && p < 0.78);
      P.formaleta.visible = P.espera.visible;
      if (activo) enObra = i;
      tope = P.y0 + P.h * s;
    }

    // grúa y ascensor crecen con la obra y se retiran al final
    const hG = Math.max(28, tope + 18);
    mastil.scale.y = hG; mMastil.alphaMap.repeat.set(1, hG / 2); mMastil.alphaMap.needsUpdate = false;
    cabeza.position.y = hG;
    cabeza.rotation.y = p * Math.PI * 3.2 + 0.6;
    const caida = Math.max(2, hG - tope - 3);
    cable.scale.y = caida; cable.position.y = -caida / 2 - 1.2;
    gancho.position.y = -caida - 1.6;
    carro.position.x = -30 + Math.sin(p * 40) * 6; cable.position.x = gancho.position.x = carro.position.x;
    grua.visible = p < 0.8;
    const hE = Math.max(4, tope - 2);
    mastilEl.scale.y = hE + 3; jaula.position.y = (Math.sin(p * 60) * 0.5 + 0.5) * hE;
    elevador.visible = p > 0.12 && p < 0.8;
    obra.visible = p < 0.8;
    // el lote pasa de tierra a jardín y aparecen las amenidades
    paisaje.terreno.obra.value = 1 - facil(tramo(p, 0.78, 0.86));
    paisaje.terreno.radioCesped.value = p > 0.78 ? 92 : 0;

    // hora: tarde → atardecer → anochecer → (algo de) noche; el sol gira con la cámara
    // el atardecer dura hasta mostrar las amenidades; la noche llega en el cierre
    const hora = p < 0.3 ? 0 : p < 0.84 ? mezcla(0, 1, facil(tramo(p, 0.3, 0.84))) : p < 0.96 ? mezcla(1, 2, facil(tramo(p, 0.91, 0.96))) : mezcla(2, 2.55, tramo(p, 0.95, 1));
    const sitio = facil(tramo(p, 0.79, 0.85)) * (1 - facil(tramo(p, 0.91, 0.96)));
    // en la vista de sitio el sol queda detrás de la cámara para iluminar las amenidades
    // una vuelta completa en sentido norte → poniente → sur → oriente: la vista de sitio cae al sur (se ve todo el lote)
    // y el cierre vuelve al oriente, mirando al valle con la ciudad encendida
    const ang = THREE.MathUtils.degToRad(28 + 360 * (1 - p));
    // azimut de la cámara en la convención del sol (x = sen θ, z = cos θ)
    const azCam = THREE.MathUtils.radToDeg(Math.atan2(Math.cos(ang), Math.sin(ang)));
    // el sol termina detrás de la torre vista desde la cámara final; en la vista de sitio, detrás de la cámara
    const base = mezcla(95, 232, facil(tramo(p, 0, 0.95)));
    const dif = ((azCam + 15 - base + 540) % 360) - 180;
    const azim = base + dif * sitio * 0.9;
    const { elev, dirSol, colorBruma } = cielo.setHora(hora, azim);
    // la sombra del sol cubre la torre durante la obra y se abre a todo el lote cuando aparecen las amenidades
    const lote = facil(tramo(p, 0.76, 0.84));
    sol.target.position.set(0, mezcla(40, 0, lote), 0);
    sol.position.copy(dirSol).multiplyScalar(500).add(sol.target.position);
    const ext = mezcla(75, 125, lote);
    Object.assign(sol.shadow.camera, { left: -ext, right: ext, top: mezcla(115, 125, lote), bottom: mezcla(-30, -125, lote) });
    sol.shadow.camera.updateProjectionMatrix();
    const dia = clamp((elev + 1) / 14);
    sol.intensity = 3.4 * Math.pow(dia, 0.8);
    sol.color.setHSL(mezcla(0.045, 0.1, dia), mezcla(0.95, 0.35, dia), mezcla(0.6, 0.9, dia));
    hemi.intensity = mezcla(0.12, 1.05, dia);
    hemi.color.setHSL(mezcla(0.66, 0.58, dia), 0.4, mezcla(0.45, 0.82, dia));
    scene.fog.color.copy(colorBruma);
    scene.environmentIntensity = mezcla(0.22, 1.15, dia);
    const env = cielo.ambiente(motor.renderer, hora, azim);
    if (env) scene.environment = env;
    motor.exposicion = mezcla(1.25, 1.0, dia);

    const noche = 1 - clamp((elev + 1.5) / 7);
    paisaje.lucesCiudad.material.opacity = clamp(noche * 1.1);
    paisaje.nocheCiudad.value = noche * 2.2;
    mVidrio.emissiveIntensity = clamp((p - 0.9) / 0.06) * 1.6;
    mLobby.emissiveIntensity = mezcla(0.15, 2.2, noche);
    urbanismo.actualizar(p, noche, tramo(p, 0.8, 0.88));
    piscinaPH?.noche(noche);
    motor.bloom = 0.15 + noche * 0.55;

    // cámara: una órbita de dron completa, subiendo con la obra
    const vertical = alto > ancho;
    // «vista de sitio»: entre 0.80 y 0.94 la cámara se abre y baja la mirada para mostrar el lote completo
    const radio = (mezcla(165, 190, facil(p)) + sitio * 45) * (vertical ? 1.3 : 1);
    const camY = mezcla(mezcla(60, COTA * 0.9, facil(clamp(p * 1.15))), 135, sitio);
    camara.position.set(Math.cos(ang) * radio, camY, Math.sin(ang) * radio);
    const mira = Math.max(mezcla(32, 16, clamp(p * 4)), Math.min(COTA * 0.6, tope * 0.62 + 8));
    camara.lookAt(-sitio * 8, mezcla(mira, 2, sitio) - (vertical ? COTA * 0.22 * (1 - sitio) : 0), sitio * 4);
  }

  // re-render cuando terminan de llegar texturas y cielo
  let pedido = false;
  const pedirRender = () => { if (pedido) return; pedido = true; requestAnimationFrame(() => { pedido = false; if (progreso >= 0) { aplicar(progreso); motor.render(); } }); };
  gestor.onAvance = (f) => { alCargar?.(f); pedirRender(); };
  gestor.onListo = () => { alCargar?.(1); if (progreso >= 0) { aplicar(progreso); motor.render(); } };

  return {
    setProgreso(p) {
      if (Math.abs(p - progreso) < 0.00005) return;
      progreso = p;
      aplicar(p);
      motor.render();
    },
    redimensionar() {
      const r = canvas.getBoundingClientRect();
      ancho = Math.max(2, r.width); alto = Math.max(2, r.height);
      motor.tamano(ancho, alto);
      camara.aspect = ancho / alto;
      camara.fov = alto > ancho ? 50 : 36;
      camara.updateProjectionMatrix();
      if (progreso >= 0) { aplicar(progreso); motor.render(); }
    },
    renderizar() { motor.render(); },
    // solo para revisión local: renderiza desde una cámara libre con el estado actual de la obra
    vistaLibre(px, py, pz, tx, ty, tz) { camara.position.set(px, py, pz); camara.lookAt(tx, ty, tz); motor.render(); },
    destruir() { motor.dispose(); cielo.dispose(); },
    pausar() {}, reanudar() {},
  };
}
