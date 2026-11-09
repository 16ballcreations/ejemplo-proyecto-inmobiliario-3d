// Recorrido 3D del penthouse: se camina, se salta entre ambientes y se cambian acabados en vivo.
// Usa el motor común: oclusión ambiental, cielo fotográfico, texturas PBR reales y muebles con bordes redondeados.
import * as THREE from 'three';
import { AMBIENTES, LLEGADAS, ACABADOS, PLANTA, Y_PH, PROYECTO } from './datos.js';
import { crearRender } from './motor/render.js';
import { crearCieloFoto } from './motor/cielo.js';
import { pbr, gestor } from './motor/texturas.js';
import { caja, redonda, cilindro, uvMundo, unir } from './motor/geo.js';
import { geoArbusto, geoFrondoso, sembrar, hash } from './motor/vegetacion.js';
import { crearPaisaje } from './lugares/las-palmas.js';
import { planoSVG } from './plano.js';
import { crearPiscina } from './motor/agua.js';
import { crearPlanta } from './motor/plantas.js';
import { sombraContacto, crearSonda } from './motor/luz.js';

const OJO = 1.62, RADIO = 0.32;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- mármol en losa continua (sin juntas), generado por código ----------
function marmol(base, veta, vetaSuave, semilla = 1) {
  const n = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  // nubes suaves de fondo
  for (let k = 0; k < 90; k++) {
    const x = hash(k, semilla) * n, y = hash(k, semilla + 1) * n, r = 60 + hash(k, semilla + 2) * 220;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, vetaSuave); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.12; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // vetas: trazos largos diagonales que se ramifican
  const trazo = (x, y, a, largo, ancho, alfa, color) => {
    g.strokeStyle = color; g.globalAlpha = alfa; g.lineWidth = ancho; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < largo; s++) {
      a += (hash(s + x, y + semilla) - 0.5) * 0.22;
      x += Math.cos(a) * 9; y += Math.sin(a) * 9;
      g.lineTo(x, y);
      if (hash(s, x) > 0.985 && ancho > 0.8) { g.stroke(); trazo(x, y, a + (hash(s, 2) - 0.5) * 1.4, largo * 0.4, ancho * 0.55, alfa * 0.8, color); g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  g.filter = 'blur(1.4px)';
  for (let k = 0; k < 7; k++) trazo(hash(k, 11) * n * 1.2 - n * 0.1, -20, 1.0 + hash(k, 12) * 0.6, 160, 2.5 + hash(k, 13) * 3, 0.55, veta);
  g.filter = 'blur(0.6px)';
  for (let k = 0; k < 16; k++) trazo(hash(k, 21) * n, hash(k, 22) * n, hash(k, 23) * 6.28, 70, 0.9, 0.35, veta);
  g.filter = 'none'; g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}


// obra de arte abstracta en tonos tierra (lienzo por código)
function cuadro(semilla, w = 512, h = 360) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#ece4d6'; g.fillRect(0, 0, w, h);
  const tonos = ['#b5653f', '#d9a46b', '#5d6b57', '#2f2a26', '#c9b8a0', '#8e4a2f'];
  for (let k = 0; k < 7; k++) {
    g.globalAlpha = 0.55 + hash(k, semilla) * 0.4;
    g.fillStyle = tonos[(k + semilla) % tonos.length];
    const x = hash(k, semilla + 1) * w, y = hash(k, semilla + 2) * h, rx = 40 + hash(k, semilla + 3) * 160, ry = 30 + hash(k, semilla + 4) * 120;
    g.beginPath(); g.ellipse(x, y, rx, ry, hash(k, semilla + 5) * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 0.8; g.strokeStyle = '#2f2a26'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(w * 0.1, h * 0.7); g.bezierCurveTo(w * 0.4, h * 0.2, w * 0.6, h * 0.9, w * 0.9, h * 0.35); g.stroke();
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- interfaz ----------
function crearUI() {
  const raiz = document.createElement('div');
  raiz.className = 'ph3d';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-label', 'Recorrido 3D del penthouse');
  raiz.innerHTML = `
    <canvas class="ph3d__lienzo"></canvas>
    <div class="ph3d__barra">
      <button type="button" class="ph3d__tecla" data-salir><kbd>Esc</kbd> Salir del recorrido</button>
      <button type="button" class="ph3d__pildora" data-plano><kbd>Espacio</kbd> Plano y acabados</button>
      <span class="marca">ARRAYÁN</span>
    </div>
    <div class="ph3d__ficha" data-ficha><p class="antetitulo">Piso 24</p><h3></h3><p class="ph3d__m2"></p><p class="ph3d__txt"></p></div>
    <div class="ph3d__mini" data-mini aria-hidden="true">${planoSVG({ numeros: false, etiquetas: false, jugador: true })}<button type="button" data-plano>Plano completo <kbd>Espacio</kbd></button></div>
    <nav class="ph3d__saltos" aria-label="Ambientes">${AMBIENTES.map((a, i) => `<button type="button" data-ir="${a.id}"><b>${i + 1}</b> ${a.corto}</button>`).join('')}</nav>
    <div class="ph3d__palanca" data-palanca aria-hidden="true"><i></i></div>
    <div class="ph3d__intro" data-intro>
      <div>
        <p class="antetitulo">Penthouse · piso 24 · cota +94,2 m</p>
        <h2>Entra al <em>penthouse</em>.</h2>
        <p>Camina por el último piso de Arrayán: sala de doble altura, cocina con isla, suite principal y una terraza con piscina sobre el valle.</p>
        <div class="ph3d__botones"><button type="button" class="boton boton--claro boton--grande" data-entrar>Entrar al penthouse</button><button type="button" class="boton boton--linea boton--grande" data-salir>Volver al sitio</button></div>
        <p class="ph3d__ayuda">Arrastra para mirar · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas para caminar · <kbd>Shift</kbd> para correr · <kbd>Espacio</kbd> plano · <kbd>1</kbd>–<kbd>6</kbd> saltar de ambiente · <kbd>Esc</kbd> salir</p>
      </div>
    </div>
    <div class="ph3d__modal" data-modal hidden>
      <div class="ph3d__panel">
        <div class="plano"><p class="antetitulo">Plano interactivo</p><h3>Penthouse</h3>${planoSVG({ numeros: true })}<p class="nota">Toca un ambiente o un número para ir.</p></div>
        <div class="acabados">
          <p class="antetitulo">Acabados</p>
          <p class="acabados__grupo">Pisos</p><div class="muestras" data-grupo="piso"></div>
          <p class="acabados__grupo">Mesones e isla</p><div class="muestras" data-grupo="mesones"></div>
          <div class="acabados__botones">
            <button type="button" class="boton boton--claro boton--grande" data-cerrar-modal>Seguir recorriendo <kbd>Espacio</kbd></button>
            <button type="button" class="boton boton--linea boton--grande" data-agendar>Agendar visita privada</button>
            <button type="button" class="boton boton--linea boton--grande" data-salir>Salir del recorrido <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(raiz);
  return raiz;
}

export function abrirPenthouse({ ligero = false, alSalir }) {
  const ui = crearUI();
  const $ = (s) => ui.querySelector(s);
  const lienzo = $('.ph3d__lienzo');
  document.documentElement.style.overflow = 'hidden';

  const motor = crearRender(lienzo, { ligero });
  motor.oclusion({ radius: 1.1, distanceExponent: 1.3, thickness: 1.6, scale: 1.35, samples: 16, mezcla: 1 });
  const scene = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(68, 1, 0.05, 40000);
  camara.rotation.order = 'YXZ';
  motor.preparar(scene, camara);

  // atardecer sobre el valle: el sol entra por la terraza (poniente, -x)
  const HORA = 0.9, AZIM = 252;
  const cielo = crearCieloFoto({ ligero, gestor });
  scene.add(cielo.malla);
  const { dirSol, colorBruma } = cielo.setHora(HORA, AZIM);
  scene.fog = new THREE.FogExp2(colorBruma, 0.0006);
  const paisaje = crearPaisaje({ ligero });
  scene.add(paisaje.grupo);
  paisaje.lucesCiudad.material.opacity = 0.3;
  const sol = new THREE.DirectionalLight('#ffbf86', 3.4);
  sol.position.copy(dirSol).multiplyScalar(60).add(new THREE.Vector3(0, Y_PH, 0));
  sol.target.position.set(0, Y_PH, 0);
  sol.castShadow = true;
  sol.shadow.mapSize.set(ligero ? 1024 : 2048, ligero ? 1024 : 2048);
  Object.assign(sol.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 160 });
  sol.shadow.bias = -0.0003; sol.shadow.normalBias = 0.02;
  // relleno mínimo: casi toda la luz ambiente sale de la sonda del interior (ver capturarAmbiente)
  const relleno = new THREE.HemisphereLight('#e6e2dc', '#b9ab99', 0.45);
  scene.add(sol, sol.target, relleno);
  scene.environmentIntensity = 0.6;
  // dos ambientes: el del cielo (para el agua y el exterior) y el del interior (para todo lo demás)
  let envCielo = null, envInterior = null;
  const ocultarEnSonda = []; // agua y vidrios: su brillo especular del sol no debe quedar «pintado» en el ambiente
  const sonda = ligero ? null : crearSonda(motor.renderer);
  const capturarAmbiente = () => {
    envCielo = cielo.ambiente(motor.renderer, HORA, AZIM) || envCielo;
    if (!envCielo) return;
    piscina.material.envMap = envCielo; piscina.material.needsUpdate = true;
    if (!sonda) { scene.environment = envCielo; scene.environmentIntensity = 0.95; relleno.intensity = 0.7; return; }
    // la sonda ve el interior iluminado por el cielo (un rebote) y desde ahí ilumina el resto
    scene.environment = envCielo; scene.environmentIntensity = 0.9;
    envInterior = sonda.capturar(scene, new THREE.Vector3(-2.5, Y_PH + 1.5, 0.5), ocultarEnSonda);
    scene.environment = envInterior; scene.environmentIntensity = 1.7;
  };
  motor.exposicion = 1.12;
  motor.bloom = 0.2;

  // ---------- casa ----------
  const casa = new THREE.Group();
  casa.position.y = Y_PH;
  scene.add(casa);
  // agrega una pieza (geometría ya ubicada) con coordenadas de textura en metros
  const pieza = (geo, mat, metros = 1, sombra = true) => {
    const m = new THREE.Mesh(uvMundo(geo, metros), mat);
    m.castShadow = sombra; m.receiveShadow = true;
    casa.add(m);
    return m;
  };
  // pieza centrada que se ubica y gira sobre su propio centro
  const piezaEn = (geo, mat, x, y, z, [rx, ry, rz] = [0, 0, 0], metros = 1) => {
    const m = new THREE.Mesh(uvMundo(geo, metros), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = m.receiveShadow = true;
    casa.add(m);
    return m;
  };
  const M = (nombre, extra = {}) => new THREE.MeshStandardMaterial({ ...pbr(nombre), ...extra });

  const [ix0, iz0, ix1, iz1] = PLANTA.interior;
  const AL = PLANTA.alto;
  const mYeso = M('estuco', { color: '#f3efe9', roughness: 0.95 });
  const mNogal = M('nogal', { roughness: 0.5 });
  const mBoucle = M('tela', { color: '#f1ebe1', roughness: 1 });
  const mLino = M('lino', { color: '#f6f2ea', roughness: 1 });
  const mLinoArena = M('lino', { color: '#cdbb9f', roughness: 1 });
  const mLinoSalvia = M('lino', { color: '#8c9a84', roughness: 1 });
  const mCuero = M('cuero', { color: '#9a5d36', roughness: 0.5 });
  const mPiedra = M('concreto', { color: '#5c554e', roughness: 0.9 });
  const mTravertino = M('travertino', { roughness: 0.55 });
  const mLaton = new THREE.MeshStandardMaterial({ color: '#b48d55', metalness: 1, roughness: 0.28 });
  const mNegro = new THREE.MeshStandardMaterial({ color: '#1f1c1a', metalness: 0.6, roughness: 0.4 });
  const mVidrio = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 1, specularIntensity: 0 }); // sin «segundo sol» reflejado en los vidrios
  const mAgua = new THREE.MeshPhysicalMaterial({ color: '#2b98ad', roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, emissive: '#0c5a68', emissiveIntensity: 0.35 });
  const mDeck = M('deck', { roughness: 0.8 });
  const mPorcelana = new THREE.MeshPhysicalMaterial({ color: '#f6f4f0', roughness: 0.15, clearcoat: 1 });
  const mLuz = new THREE.MeshBasicMaterial({ color: '#ffe2b6' });
  const mFuego = new THREE.MeshBasicMaterial({ color: '#ff9a4a' });
  const mMaceta = M('concreto', { color: '#c9b9a6', roughness: 0.9 });
  const mLadrillo = M('ladrillo');

  // fuste de la torre bajo el penthouse (para que al asomarse se vea el edificio)
  const fuste = new THREE.Mesh(uvMundo(caja(PROYECTO.ancho, Y_PH - 0.4, PROYECTO.fondo, 0, -(Y_PH - 0.4) / 2 - 0.4, 0), 1.05), mLadrillo);
  casa.add(fuste);

  // pisos: uno por acabado (se alterna la visibilidad); escala de cada textura en metros
  const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
  const pisos = {
    roble: pieza(caja(ix1 - ix0, 0.03, iz1 - iz0, cx, 0, cz), M('roble', { roughness: 0.55 }), 2.4, false),
    travertino: pieza(caja(ix1 - ix0, 0.03, iz1 - iz0, cx, 0, cz), M('travertino', { roughness: 0.35 }), 2.6, false),
    microcemento: pieza(caja(ix1 - ix0, 0.03, iz1 - iz0, cx, 0, cz), M('microcemento', { color: '#d8d2c8' }), 3, false),
  };
  pieza(caja(4, 0.03, 18, -9, 0, 0), mDeck, 1.6, false);
  pieza(caja(24, 0.5, 22, -1, -0.27, 0), M('concreto', { color: '#b9b2a8' }), 3, false);
  // cielo raso blanco: recibe el rebote del piso, así que se le suma un poco de luz propia para que no se vea café
  pieza(caja(ix1 - ix0, 0.3, iz1 - iz0, cx, AL + 0.15, cz), M('estuco', { color: '#fbf8f3', roughness: 0.95, emissive: '#4a443d', emissiveIntensity: 0.9 }), 3, false);
  pieza(caja(ix1 - ix0 + 0.8, 0.5, iz1 - iz0 + 0.8, cx, AL + 0.55, cz), M('concreto', { color: '#4a4540' }), 3);
  // luces empotradas y una franja de luz perimetral
  const spots = [];
  for (let x = ix0 + 1.5; x < ix1; x += 2.5) for (let z = iz0 + 1.5; z < iz1; z += 2.5) spots.push(cilindro(0.06, 0.06, 0.02, x, AL - 0.01, z, 12));
  // aros de los downlights: metal claro con el difusor apenas encendido
  casa.add(new THREE.Mesh(unir(spots), new THREE.MeshStandardMaterial({ color: '#d8d2c8', emissive: '#ffe2b6', emissiveIntensity: 0.25, roughness: 0.4 })));

  // vidrios de piso a techo con perfilería negra
  const perfiles = [];
  for (const [a, b, c, d] of PLANTA.vidrios) {
    const L = Math.hypot(c - a, d - b), horiz = b === d;
    const v = new THREE.Mesh(caja(horiz ? L : 0.03, AL, horiz ? 0.03 : L, (a + c) / 2, AL / 2, (b + d) / 2), mVidrio);
    casa.add(v); ocultarEnSonda.push(v);
    const n = Math.round(L / 1.6);
    for (let k = 0; k <= n; k++) { const t = k / n; perfiles.push(caja(0.05, AL, 0.07, a + (c - a) * t, AL / 2, b + (d - b) * t)); }
    perfiles.push(caja(horiz ? L : 0.07, 0.06, horiz ? 0.07 : L, (a + c) / 2, 0.03, (b + d) / 2));
  }
  pieza(unir(perfiles), mNegro, 1);
  for (const [a, b, c, d] of PLANTA.barandas) {
    const L = Math.hypot(c - a, d - b), horiz = b === d;
    casa.add(new THREE.Mesh(caja(horiz ? L : 0.03, 1.1, horiz ? 0.03 : L, (a + c) / 2, 0.55, (b + d) / 2), mVidrio));
    pieza(caja(horiz ? L : 0.06, 0.05, horiz ? 0.06 : L, (a + c) / 2, 1.12, (b + d) / 2), mNegro);
  }
  for (const [a, b, c, d] of PLANTA.muros) {
    const L = Math.hypot(c - a, d - b), horiz = b === d;
    pieza(caja(horiz ? L + 0.16 : 0.16, AL, horiz ? 0.16 : L + 0.16, (a + c) / 2, AL / 2, (b + d) / 2), mYeso, 2.5);
  }
  const [nx0, nz0, nx1, nz1] = PLANTA.nucleo;
  pieza(caja(nx1 - nx0 - 0.2, AL - 0.02, nz1 - nz0 - 0.2, (nx0 + nx1) / 2, AL / 2, (nz0 + nz1) / 2), mNogal, 1.2);

  // piscina elevada (0,5 m) con vaso de mosaico y agua real; muro de travertino alrededor
  const [px0, pz0, px1, pz1] = PLANTA.piscina;
  const pcx = (px0 + px1) / 2, pcz = (pz0 + pz1) / 2, pw = px1 - px0, pl = pz1 - pz0, ph = 0.5;
  pieza(unir([
    caja(pw + 0.6, ph, 0.3, pcx, ph / 2, pz0 - 0.15), caja(pw + 0.6, ph, 0.3, pcx, ph / 2, pz1 + 0.15),
    caja(0.3, ph, pl, px0 - 0.15, ph / 2, pcz), caja(0.3, ph, pl, px1 + 0.15, ph / 2, pcz),
  ]), mTravertino, 1.2);
  const piscina = crearPiscina({ ancho: pw, largo: pl, prof: ph - 0.02, borde: 0.34, materialBorde: mTravertino, ligero });
  piscina.grupo.position.set(pcx, ph, pcz);
  casa.add(piscina.grupo); ocultarEnSonda.push(piscina.grupo);

  // ---------- mobiliario ----------
  const mesones = { marmol: [], nero: [], roble: [] };
  const matMeson = {
    marmol: new THREE.MeshPhysicalMaterial({ map: marmol('#efebe5', '#8f877d', 'rgba(170,160,150,1)', 3), roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.14 }),
    nero: new THREE.MeshPhysicalMaterial({ map: marmol('#151413', '#e8e2d8', 'rgba(70,66,62,1)', 7), roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
    roble: M('roble', { roughness: 0.45 }),
  };
  const meson = (geo) => { for (const k of Object.keys(mesones)) mesones[k].push(pieza(geo.clone(), matMeson[k], k === 'roble' ? 2.4 : 2.8)); };

  // sala: el sofá en L mira al valle (de espaldas a la cocina), las poltronas lo enfrentan y la mesa de centro queda al medio
  pieza(redonda(4.4, 0.02, 4.8, 0.01, -2.75, 0.02, 4.9), mLinoArena, 1.2, false);
  // tramo principal (a lo largo de z, mirando al oeste)
  pieza(unir([redonda(1.05, 0.4, 4.6, 0.1, -0.85, 0.22, 5.1), redonda(0.28, 0.62, 4.6, 0.12, -0.4, 0.52, 5.1)]), mBoucle, 1);
  for (let k = 0; k < 3; k++) {
    const z = 3.4 + k * 1.42;
    pieza(redonda(0.86, 0.16, 1.38, 0.07, -0.95, 0.5, z), mBoucle);
    piezaEn(redonda(0.2, 0.42, 1.25, 0.09), mBoucle, -0.62, 0.8, z, [0, 0, -0.18]);
  }
  // retorno (a lo largo de x, al norte, mirando al sur)
  pieza(unir([redonda(2.9, 0.4, 1.05, 0.1, -2.85, 0.22, 6.95), redonda(2.9, 0.62, 0.28, 0.12, -2.85, 0.52, 7.4)]), mBoucle, 1);
  for (let k = 0; k < 2; k++) {
    const x = -3.65 + k * 1.42;
    pieza(redonda(1.38, 0.16, 0.86, 0.07, x, 0.5, 6.9), mBoucle);
    piezaEn(redonda(1.25, 0.42, 0.2, 0.09), mBoucle, x, 0.8, 7.17, [-0.18, 0, 0]);
  }
  piezaEn(redonda(0.5, 0.36, 0.14, 0.06), mLinoSalvia, -0.66, 0.84, 6.7, [0, -0.5, -0.2]);
  piezaEn(redonda(0.5, 0.36, 0.14, 0.06), mLinoArena, -1.4, 0.84, 7.1, [-0.2, 0.3, 0]);
  piezaEn(redonda(0.46, 0.34, 0.13, 0.06), mLinoArena, -0.66, 0.82, 3.1, [0, 0.4, -0.2]);
  // mesa de centro y mesa auxiliar de travertino
  pieza(unir([cilindro(0.62, 0.62, 0.06, -2.7, 0.38, 4.8, 40), cilindro(0.42, 0.42, 0.35, -2.7, 0.17, 4.8, 32)]), mTravertino, 1);
  pieza(unir([cilindro(0.3, 0.3, 0.05, -0.9, 0.5, 2.25, 32), cilindro(0.18, 0.18, 0.48, -0.9, 0.24, 2.25, 24)]), mTravertino, 1);
  // libros y un cuenco sobre la mesa de centro
  pieza(unir([redonda(0.34, 0.05, 0.26, 0.01, -2.85, 0.44, 4.7), redonda(0.3, 0.04, 0.22, 0.01, -2.83, 0.485, 4.72)]), new THREE.MeshStandardMaterial({ color: '#d9cfbf', roughness: 0.8 }));
  pieza(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(-2.4, 0.57, 4.95), new THREE.MeshPhysicalMaterial({ color: '#2b2622', roughness: 0.3, clearcoat: 1, side: THREE.DoubleSide }));
  // poltronas de cuero al sur, enfrentando el sofá
  for (const [x, z] of [[-3.55, 2.55], [-2.0, 2.45]]) {
    const pol = new THREE.Group();
    const p = (g, m) => { const e = new THREE.Mesh(uvMundo(g, 1), m); e.castShadow = e.receiveShadow = true; pol.add(e); };
    p(redonda(0.86, 0.22, 0.82, 0.1, 0, 0.36, 0), mCuero);
    p(redonda(0.86, 0.5, 0.14, 0.07, 0, 0.62, -0.38), mCuero);
    p(redonda(0.12, 0.3, 0.8, 0.05, -0.42, 0.55, 0), mCuero); p(redonda(0.12, 0.3, 0.8, 0.05, 0.42, 0.55, 0), mCuero);
    for (const sx of [-0.36, 0.36]) for (const sz of [-0.34, 0.34]) p(cilindro(0.018, 0.018, 0.26, sx, 0.13, sz, 8), mLaton);
    pol.position.set(x, 0, z);
    // el frente (+z local) apunta a la mesa de centro
    pol.rotation.y = Math.atan2(-2.7 - x, 4.8 - z);
    casa.add(pol);
  }
  // lámpara de pie de latón en la esquina del sofá
  pieza(unir([cilindro(0.16, 0.16, 0.03, -4.75, 0.015, 7.8, 24), cilindro(0.012, 0.012, 1.55, -4.75, 0.8, 7.8, 8)]), mLaton);
  casa.add(new THREE.Mesh(cilindro(0.18, 0.24, 0.3, -4.75, 1.68, 7.8, 24), new THREE.MeshStandardMaterial({ color: '#f3e7d2', emissive: '#ffd9a6', emissiveIntensity: 1.2, side: THREE.DoubleSide })));
  // chimenea: muro de piedra con fuego
  pieza(caja(0.38, AL, 2.8, 0.82, AL / 2, 1), mPiedra, 1.5);
  casa.add(new THREE.Mesh(caja(0.05, 0.42, 1.5, 0.62, 0.56, 1), mFuego));
  pieza(caja(0.42, 0.06, 1.9, 0.6, 0.32, 1), mNegro);
  const fuego = new THREE.PointLight('#ff8a3c', 5, 7, 2); fuego.position.set(0.2, 0.6, 1); casa.add(fuego);

  // comedor: mesa de nogal sobre dos pedestales de travertino, sillas de lino con patas de latón, lámpara colgante
  pieza(redonda(3.4, 0.07, 1.15, 0.025, -3, 0.75, -5), mNogal, 1.4);
  pieza(unir([redonda(0.36, 0.7, 0.75, 0.04, -4.1, 0.36, -5), redonda(0.36, 0.7, 0.75, 0.04, -1.9, 0.36, -5)]), mTravertino, 1);
  for (let k = 0; k < 8; k++) {
    const x = -4.3 + (k % 4) * 0.86, lado = k < 4 ? -1 : 1, z = -5 + lado * 0.92;
    const s = new THREE.Group();
    const p = (g, m) => { const e = new THREE.Mesh(uvMundo(g, 1), m); e.castShadow = e.receiveShadow = true; s.add(e); };
    p(redonda(0.48, 0.09, 0.46, 0.04, 0, 0.47, 0), mLinoArena);
    p(redonda(0.46, 0.42, 0.07, 0.035, 0, 0.74, -0.22), mLinoArena); // espaldar detrás (el frente es +z local)
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.19, 0.19]) p(cilindro(0.014, 0.014, 0.44, sx, 0.22, sz, 8), mLaton);
    s.position.set(x, 0, z); s.rotation.y = lado > 0 ? Math.PI : 0; // las del norte miran al sur y viceversa: todas hacia la mesa
    casa.add(s);
  }
  // centro de mesa: jarrones de cerámica y un cuenco
  const mCeramica = new THREE.MeshPhysicalMaterial({ color: '#e8e1d6', roughness: 0.55, clearcoat: 0.3 });
  pieza(new THREE.LatheGeometry([[0, 0], [0.09, 0.01], [0.12, 0.12], [0.07, 0.3], [0.05, 0.36], [0.06, 0.38]].map(([a, b]) => new THREE.Vector2(a, b)), 24).translate(-3.35, 0.785, -5), mCeramica);
  pieza(new THREE.LatheGeometry([[0, 0], [0.07, 0.01], [0.09, 0.08], [0.05, 0.22], [0.045, 0.24]].map(([a, b]) => new THREE.Vector2(a, b)), 24).translate(-3.15, 0.785, -4.9), new THREE.MeshPhysicalMaterial({ color: '#7d5a44', roughness: 0.5, clearcoat: 0.3 }));
  pieza(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(-2.6, 0.985, -5), mCeramica);
  pieza(unir([cilindro(0.005, 0.005, 1.6, -3, AL - 0.8, -5, 6)]), mNegro, 1, false);
  casa.add(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 10, 64).rotateX(Math.PI / 2).translate(-3, AL - 1.6, -5), mLaton));
  casa.add(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.012, 8, 64).rotateX(Math.PI / 2).translate(-3, AL - 1.62, -5), mLuz));
  // obra grande sobre el muro del comedor (lado oeste del muro de la suite)
  pieza(redonda(0.05, 1.35, 2.0, 0.01, 0.9, 2.0, -6.2), mNegro, 1, false);
  casa.add(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.25).rotateY(-Math.PI / 2).translate(0.87, 2.0, -6.2), new THREE.MeshStandardMaterial({ map: cuadro(8, 512, 340), roughness: 0.85 })));
  // bar de nogal con mesón
  pieza(redonda(0.62, 0.98, 3.4, 0.02, 0.55, 0.49, -6.6), mNogal, 1.2);
  meson(caja(0.66, 0.04, 3.44, 0.55, 1.0, -6.6));

  // cocina: isla con mesón en cascada, mueble bajo y alacena, butacos de cuero, lámparas de vidrio
  pieza(redonda(3.8, 0.86, 1.0, 0.02, 5, 0.43, 6), mNogal, 1.2);
  meson(caja(4.2, 0.05, 1.2, 5, 0.905, 6));
  meson(caja(0.05, 0.9, 1.2, 2.925, 0.45, 6));
  meson(caja(0.05, 0.9, 1.2, 7.075, 0.45, 6));
  pieza(redonda(2.7, 0.86, 0.62, 0.02, 2.55, 0.43, 3.45), mNogal, 1.2);
  meson(caja(2.75, 0.04, 0.68, 2.55, 0.9, 3.45));
  pieza(redonda(2.7, 0.95, 0.38, 0.02, 2.55, 2.15, 3.32), mNogal, 1.2);
  // poceta bajo mesón con grifería de latón (en la isla, del lado de la cocina)
  pieza(redonda(0.7, 0.02, 0.42, 0.04, 6.1, 0.935, 5.85), new THREE.MeshStandardMaterial({ color: '#2a2826', metalness: 0.4, roughness: 0.3 }));
  pieza(unir([cilindro(0.018, 0.022, 0.32, 6.1, 1.09, 5.58, 12), new THREE.TorusGeometry(0.12, 0.016, 8, 16, Math.PI).rotateY(Math.PI / 2).translate(6.1, 1.25, 5.7), cilindro(0.012, 0.012, 0.06, 6.1, 1.2, 5.82, 8)]), mLaton);
  // estufa de inducción y horno en el mueble bajo
  pieza(redonda(0.78, 0.012, 0.52, 0.02, 2.2, 0.925, 3.45), new THREE.MeshPhysicalMaterial({ color: '#0e0e0f', roughness: 0.08, clearcoat: 1 }));
  pieza(caja(0.62, 0.5, 0.02, 2.2, 0.5, 3.765), new THREE.MeshPhysicalMaterial({ color: '#141414', roughness: 0.1, clearcoat: 1 }));
  pieza(caja(0.5, 0.02, 0.03, 2.2, 0.73, 3.79), mLaton);
  // columna de nevera y despensa en nogal
  pieza(redonda(0.8, 2.6, 0.64, 0.02, 4.35, 1.3, 3.36), mNogal, 1.2);
  pieza(unir([caja(0.02, 0.7, 0.03, 4.0, 1.4, 3.69), caja(0.02, 0.5, 0.03, 4.0, 0.55, 3.69)]), mLaton);
  // frutero y tabla de picar sobre la isla
  pieza(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(4.3, 1.13, 6.1), new THREE.MeshPhysicalMaterial({ color: '#2b2622', roughness: 0.3, clearcoat: 1 }));
  for (let k = 0; k < 5; k++) pieza(new THREE.SphereGeometry(0.055, 16, 10).translate(4.22 + (k % 3) * 0.08, 1.02 + (k > 2 ? 0.06 : 0), 6.06 + (k % 2) * 0.08), new THREE.MeshStandardMaterial({ color: ['#e2a13a', '#c9472b', '#e8c547', '#9bb04a', '#d5832e'][k], roughness: 0.45 }));
  pieza(redonda(0.55, 0.025, 0.35, 0.01, 5.2, 0.945, 6.2), M('roble', { roughness: 0.6 }), 0.6);
  for (const x of [3.9, 5, 6.1]) {
    pieza(redonda(0.4, 0.07, 0.4, 0.03, x, 0.74, 6.95), mCuero);
    pieza(unir([cilindro(0.016, 0.016, 0.72, x, 0.37, 6.95, 8), new THREE.TorusGeometry(0.16, 0.01, 6, 24).rotateX(Math.PI / 2).translate(x, 0.28, 6.95)]), mLaton);
  }
  for (const x of [4, 5, 6]) {
    casa.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16).translate(x, 2.55, 6), new THREE.MeshStandardMaterial({ color: '#fff4e2', emissive: '#ffd59a', emissiveIntensity: 1.6 })));
    pieza(cilindro(0.004, 0.004, AL - 2.72, x, (AL + 2.72) / 2, 6, 4), mNegro, 1, false);
  }

  // estudio: escritorio de nogal, silla de cuero, biblioteca
  pieza(redonda(1.8, 0.05, 0.8, 0.02, 7.6, 0.75, 1.6), mNogal, 1.2);
  pieza(unir([caja(0.04, 0.72, 0.7, 6.75, 0.37, 1.6), caja(0.04, 0.72, 0.7, 8.45, 0.37, 1.6)]), mNegro);
  pieza(redonda(0.55, 0.12, 0.52, 0.05, 7.6, 0.48, 0.9), mCuero);
  pieza(redonda(0.55, 0.45, 0.08, 0.04, 7.6, 0.78, 0.66), mCuero);
  pieza(cilindro(0.025, 0.025, 0.42, 7.6, 0.21, 0.9, 8), mLaton);
  // biblioteca abierta: fondo, costados, entrepaños y mueble bajo; los libros se apoyan en cada entrepaño
  const [bx0, bx1, bz] = [4.3, 8.7, -0.72], entrepanos = [0.84, 1.32, 1.8];
  pieza(unir([
    caja(bx1 - bx0, 2.2, 0.03, (bx0 + bx1) / 2, 1.1, bz - 0.165),
    caja(0.04, 2.2, 0.36, bx0 + 0.02, 1.1, bz), caja(0.04, 2.2, 0.36, bx1 - 0.02, 1.1, bz),
    caja(0.03, 1.5, 0.34, 6.5, 1.45, bz),
    redonda(bx1 - bx0, 0.7, 0.36, 0.01, (bx0 + bx1) / 2, 0.35, bz),
    ...entrepanos.map((y) => caja(bx1 - bx0, 0.03, 0.34, (bx0 + bx1) / 2, y - 0.015, bz)),
    caja(bx1 - bx0, 0.04, 0.36, (bx0 + bx1) / 2, 2.18, bz),
  ]), mNogal, 1.2);
  const colores = ['#8e3b22', '#e8dcc8', '#33423a', '#c79f56', '#2b2a33', '#6d7f8c'];
  const lomos = colores.map(() => []);
  entrepanos.forEach((y, f) => {
    for (let x = bx0 + 0.1 + hash(f, 9) * 0.3; x < bx1 - 0.15;) {
      if (Math.abs(x - 6.5) < 0.08) { x += 0.12; continue; }
      // grupos de libros con huecos; de vez en cuando uno acostado o un objeto
      if (hash(x * 7, f) < 0.16) { x += 0.25 + hash(x, f) * 0.3; continue; }
      const w = 0.03 + hash(x, f + 3) * 0.035, h = 0.2 + hash(x, f + 5) * 0.12, dd = 0.17 + hash(x, f + 7) * 0.06;
      const k = Math.floor(hash(x * 3, f + 11) * colores.length);
      lomos[k].push(caja(w, h, dd, x + w / 2, y + h / 2, bz + 0.02));
      x += w + 0.004;
    }
  });
  lomos.forEach((lista, k) => lista.length && pieza(unir(lista), new THREE.MeshStandardMaterial({ color: colores[k], roughness: 0.8 })));
  // un jarrón y una pila de libros acostados
  pieza(new THREE.LatheGeometry([[0, 0], [0.06, 0.01], [0.08, 0.1], [0.04, 0.24], [0.045, 0.26]].map(([u, v]) => new THREE.Vector2(u, v)), 20).translate(7.9, 1.32, bz + 0.02), new THREE.MeshPhysicalMaterial({ color: '#e8e1d6', roughness: 0.55, clearcoat: 0.3 }));
  pieza(unir([caja(0.26, 0.04, 0.2, 5.2, 1.82, bz + 0.02), caja(0.24, 0.035, 0.19, 5.21, 1.858, bz + 0.02)]), new THREE.MeshStandardMaterial({ color: '#d9cfbf', roughness: 0.8 }));

  // suite: cama con cabecero tapizado en canales, mesas de noche, tina exenta
  for (let k = 0; k < 9; k++) pieza(redonda(0.3, 1.35, 0.16, 0.08, 3.8 + k * 0.3, 0.95, -1.18), mLinoSalvia);
  pieza(redonda(2.2, 0.32, 2.25, 0.03, 5, 0.16, -2.35), mNogal, 1.2);
  pieza(redonda(2.05, 0.26, 2.1, 0.08, 5, 0.45, -2.4), mLino);
  pieza(redonda(2.1, 0.07, 1.25, 0.03, 5, 0.6, -2.95), mLinoArena);
  for (const x of [4.45, 5.55]) piezaEn(redonda(0.8, 0.16, 0.42, 0.07), mLino, x, 0.68, -1.55, [-0.35, 0, 0]);
  for (const x of [3.4, 6.6]) {
    pieza(redonda(0.55, 0.5, 0.45, 0.03, x, 0.25, -1.5), mNogal, 1.2);
    pieza(cilindro(0.06, 0.08, 0.32, x, 0.66, -1.5, 16), mTravertino);
    casa.add(new THREE.Mesh(cilindro(0.15, 0.18, 0.18, x, 0.9, -1.5, 24), new THREE.MeshStandardMaterial({ color: '#f3e7d2', emissive: '#ffd9a6', emissiveIntensity: 1.1 })));
  }
  // tapete bajo la cama, banca de cuero a los pies y cuadro sobre el cabecero
  pieza(redonda(3.2, 0.02, 3.4, 0.01, 5, 0.02, -2.9), mLinoArena, 1.2, false);
  pieza(unir([redonda(1.6, 0.12, 0.45, 0.05, 5, 0.46, -3.85), cilindro(0.02, 0.02, 0.4, 4.3, 0.2, -3.85, 8), cilindro(0.02, 0.02, 0.4, 5.7, 0.2, -3.85, 8)]), mCuero);
  pieza(redonda(1.7, 1.15, 0.05, 0.01, 5, 2.45, -1.12), mNegro, 1, false);
  casa.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05).rotateY(Math.PI).translate(5, 2.45, -1.15), new THREE.MeshStandardMaterial({ map: cuadro(3), roughness: 0.85 })));
  pieza(redonda(1.8, 0.58, 0.85, 0.25, 7.6, 0.29, -7.8), mPorcelana);
  const aguaTina = new THREE.Mesh(redonda(1.55, 0.02, 0.62, 0.01, 7.6, 0.5, -7.8), piscina.material);
  casa.add(aguaTina); ocultarEnSonda.push(aguaTina);
  pieza(redonda(0.9, 0.4, 0.9, 0.14, 2.2, 0.22, -7.6), mBoucle);

  // terraza: asoleadoras de teca orientadas al valle (oeste): espaldar al este, pies hacia la vista
  for (const z of [6.7, 8.1]) {
    pieza(redonda(2.0, 0.18, 0.78, 0.03, -9.5, 0.28, z), mDeck, 1);
    pieza(redonda(1.9, 0.1, 0.72, 0.05, -9.55, 0.42, z), mLino);
    piezaEn(redonda(0.1, 0.62, 0.72, 0.05), mLino, -8.6, 0.68, z, [0, 0, -0.45]);
  }
  pieza(unir([cilindro(0.22, 0.22, 0.04, -9.5, 0.42, 7.4, 24), cilindro(0.03, 0.03, 0.4, -9.5, 0.2, 7.4, 8)]), mTravertino);
  // plantas: materas de concreto con ave del paraíso (adentro) y pasto ornamental (afuera); olivo en la terraza
  const materas = [[-6.4, 8.4, 'aveParaiso'], [-6.4, -8.4, 'aveParaiso'], [8.4, 8.4, 'aveParaiso'], [8.4, -0.4, 'pasto'], [-10.5, 8.6, 'pasto'], [1.6, -8.4, 'aveParaiso']];
  materas.forEach(([x, z, tipo], k) => {
    pieza(redonda(0.6, 0.55, 0.6, 0.06, x, 0.28, z), mMaceta, 1);
    pieza(caja(0.5, 0.02, 0.5, x, 0.555, z), M('tierra'), 1, false);
    const pl = crearPlanta(tipo, { altura: tipo === 'pasto' ? 0.9 : 1.7, semilla: k + 1 });
    pl.position.set(x, 0.56, z); casa.add(pl);
  });
  pieza(redonda(1.2, 0.7, 1.2, 0.08, -10.3, 0.35, -8.0), mMaceta, 1);
  const olivo = crearPlanta('olivo', { altura: 2.6, semilla: 3 });
  olivo.position.set(-10.3, 0.7, -8.0); casa.add(olivo);

  // ---------- luz artificial: cada luz sale de una lámpara que se ve ----------
  // colgantes de la isla y aro del comedor: luz hacia abajo con sombra (la mesa y la isla se «posan» en su charco de luz)
  const foco = (x, y, z, intensidad, angulo, sombra) => {
    const l = new THREE.SpotLight('#ffd3a1', intensidad, 7, angulo, 0.85, 2);
    l.position.set(x, y, z); l.target.position.set(x, 0, z);
    if (sombra && !ligero) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.radius = 4; }
    casa.add(l, l.target);
    return l;
  };
  foco(5, 2.3, 6, 9, 1.0, true);
  foco(-3, AL - 1.66, -5, 7, 1.1, true);
  // lámpara de pie, mesas de noche y biblioteca: luz puntual pequeña y cálida
  const bombillo = (x, y, z, intensidad, alcance) => { const l = new THREE.PointLight('#ffc98e', intensidad, alcance, 2); l.position.set(x, y, z); casa.add(l); };
  bombillo(-4.75, 1.62, 7.8, 2.2, 5);
  for (const x of [3.4, 6.6]) bombillo(x, 0.92, -1.5, 0.9, 3);

  // ---------- sombras de contacto: cada mueble se apoya en el piso ----------
  const sc = (x, z, w, d, o = {}) => casa.add(sombraContacto(x, z, w, d, o));
  // sala
  sc(-0.82, 5.1, 1.25, 4.75, { opacidad: 0.55 });
  sc(-2.85, 6.98, 3.05, 1.2, { opacidad: 0.55 });
  for (const [x, z] of [[-3.55, 2.55], [-2.0, 2.45]]) sc(x, z, 0.92, 0.88, { giro: Math.atan2(-2.7 - x, 4.8 - z), opacidad: 0.45 });
  sc(-2.7, 4.8, 1.25, 1.25, { forma: 'circ', opacidad: 0.4 });
  sc(-0.9, 2.25, 0.6, 0.6, { forma: 'circ', opacidad: 0.5 });
  sc(-4.75, 7.8, 0.36, 0.36, { forma: 'circ', opacidad: 0.5 });
  // comedor: la mesa da una sombra amplia y suave; cada pedestal y cada silla, la suya
  sc(-3, -5, 3.4, 1.15, { opacidad: 0.32 });
  for (const x of [-4.1, -1.9]) sc(x, -5, 0.4, 0.8, { opacidad: 0.55 });
  for (let k = 0; k < 8; k++) sc(-4.3 + (k % 4) * 0.86, -5 + (k < 4 ? -1 : 1) * 0.92, 0.5, 0.48, { opacidad: 0.42 });
  sc(0.55, -6.6, 0.66, 3.45, { opacidad: 0.5 });
  // cocina
  sc(5, 6, 4.2, 1.2, { opacidad: 0.5 });
  sc(2.55, 3.45, 2.75, 0.68, { opacidad: 0.5 });
  sc(4.35, 3.36, 0.82, 0.66, { opacidad: 0.55 });
  for (const x of [3.9, 5, 6.1]) sc(x, 6.95, 0.36, 0.36, { forma: 'circ', opacidad: 0.45 });
  // estudio
  sc(7.6, 1.6, 1.8, 0.8, { opacidad: 0.3 });
  sc(7.6, 0.85, 0.55, 0.55, { forma: 'circ', opacidad: 0.4 });
  sc(6.5, -0.72, 4.4, 0.4, { opacidad: 0.5 });
  // suite
  sc(5, -2.4, 2.25, 2.3, { opacidad: 0.6 });
  for (const x of [3.4, 6.6]) sc(x, -1.5, 0.58, 0.48, { opacidad: 0.55 });
  sc(5, -3.85, 1.6, 0.45, { opacidad: 0.35 });
  sc(7.6, -7.8, 1.85, 0.9, { opacidad: 0.5 });
  sc(2.2, -7.6, 0.92, 0.92, { opacidad: 0.5 });
  // terraza y piscina
  for (const z of [6.7, 8.1]) sc(-9.5, z, 2.0, 0.78, { opacidad: 0.45 });
  sc(-9.5, 7.4, 0.44, 0.44, { forma: 'circ', opacidad: 0.4 });
  sc(pcx, pcz, pw + 0.65, pl + 0.65, { opacidad: 0.4 });
  for (const [x, z] of materas) sc(x, z, 0.62, 0.62, { opacidad: 0.55 });
  sc(-10.3, -8.0, 1.22, 1.22, { opacidad: 0.55 });

  // el ambiente del interior se captura cuando terminan de llegar las texturas (y al cambiar el piso)
  gestor.onAvance = null;
  gestor.onListo = capturarAmbiente;
  capturarAmbiente();
  setTimeout(capturarAmbiente, 1200);

  // ---------- acabados ----------
  const elegido = { piso: 'roble', mesones: 'marmol' };
  function aplicarAcabados() {
    for (const [k, m] of Object.entries(pisos)) m.visible = k === elegido.piso;
    for (const [k, lista] of Object.entries(mesones)) lista.forEach((m) => (m.visible = k === elegido.mesones));
    for (const g of ['piso', 'mesones']) ui.querySelectorAll(`[data-grupo="${g}"] button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === elegido[g])));
  }
  const muestra = (id) => (matMeson[id] && id !== 'roble' ? matMeson[id].map.image.toDataURL('image/jpeg', 0.7) : new URL(`./tex/${id}_color.webp`, import.meta.url).href);
  for (const g of ['piso', 'mesones']) {
    ui.querySelector(`[data-grupo="${g}"]`).innerHTML = ACABADOS[g].map((a) => `<button type="button" data-id="${a.id}" aria-pressed="false"><img src="${muestra(a.id)}" alt=""><span>${a.nombre}</span></button>`).join('');
    ui.querySelector(`[data-grupo="${g}"]`).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      elegido[g] = b.dataset.id; aplicarAcabados(); capturarAmbiente();
    });
  }
  aplicarAcabados();

  // ---------- colisiones ----------
  const segmentos = [...PLANTA.muros, ...PLANTA.vidrios, ...PLANTA.barandas,
    [px0, pz0, px1, pz0], [px1, pz0, px1, pz1], [px0, pz1, px1, pz1], [px0, pz0, px0, pz1]];
  function resolver(p) {
    for (let it = 0; it < 2; it++) for (const [a, b, c, d] of segmentos) {
      const dx = c - a, dz = d - b, L2 = dx * dx + dz * dz;
      const t = clamp(((p.x - a) * dx + (p.z - b) * dz) / L2, 0, 1);
      const qx = a + dx * t, qz = b + dz * t;
      const ex = p.x - qx, ez = p.z - qz, dist = Math.hypot(ex, ez);
      const min = RADIO + 0.1;
      if (dist < min && dist > 1e-6) { p.x = qx + (ex / dist) * min; p.z = qz + (ez / dist) * min; }
    }
  }

  // ---------- control ----------
  const pos = new THREE.Vector3(...[LLEGADAS.sala[0], 0, LLEGADAS.sala[1]]);
  let yaw = 0, pitch = -0.02;
  const yawDe = ([dx, dz]) => Math.atan2(-dx, -dz);
  yaw = yawDe(AMBIENTES[0].mira);
  const teclas = new Set();
  let viaje = null, palanca = { x: 0, y: 0 };
  let activo = false, modalAbierto = false, ambienteActual = '';

  function ir(id) {
    const a = AMBIENTES.find((x) => x.id === id); if (!a) return;
    const [x, z] = LLEGADAS[id];
    let dy = yawDe(a.mira) - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    viaje = { t0: performance.now(), dur: 900, de: pos.clone(), a: new THREE.Vector3(x, 0, z), yaw0: yaw, dyaw: dy, pitch0: pitch };
    cerrarModal();
  }

  let arrastre = null;
  lienzo.addEventListener('pointerdown', (e) => { if (!activo) return; arrastre = { x: e.clientX, y: e.clientY, id: e.pointerId }; lienzo.setPointerCapture(e.pointerId); });
  lienzo.addEventListener('pointermove', (e) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const k = e.pointerType === 'touch' ? 0.006 : 0.0042;
    yaw += (e.clientX - arrastre.x) * k; pitch = clamp(pitch + (e.clientY - arrastre.y) * k, -1.1, 1.1);
    arrastre.x = e.clientX; arrastre.y = e.clientY; viaje = null;
  });
  const soltar = () => (arrastre = null);
  lienzo.addEventListener('pointerup', soltar); lienzo.addEventListener('pointercancel', soltar);

  const pal = $('[data-palanca]'), palPunto = pal.querySelector('i');
  let palId = null;
  pal.addEventListener('pointerdown', (e) => { palId = e.pointerId; pal.setPointerCapture(palId); mover(e); });
  pal.addEventListener('pointermove', (e) => e.pointerId === palId && mover(e));
  const finPal = () => { palId = null; palanca = { x: 0, y: 0 }; palPunto.style.transform = ''; };
  pal.addEventListener('pointerup', finPal); pal.addEventListener('pointercancel', finPal);
  function mover(e) {
    const r = pal.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    palanca = { x, y }; viaje = null;
    palPunto.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.type === 'keyup') { teclas.delete(e.code); return; }
    if (e.code === 'Escape') { e.preventDefault(); modalAbierto ? cerrarModal() : salir(); return; }
    if (e.code === 'Space') { e.preventDefault(); if (activo) modalAbierto ? cerrarModal() : abrirModal(); else entrar(); return; }
    if (/^Digit[1-6]$/.test(e.code) && activo) { ir(AMBIENTES[+e.code.slice(5) - 1].id); return; }
    if (activo && !modalAbierto) { teclas.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); }
  }
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  const limpiarTeclas = () => teclas.clear();
  addEventListener('blur', limpiarTeclas);

  // ---------- UI ----------
  const modal = $('[data-modal]');
  function abrirModal() { modalAbierto = true; teclas.clear(); modal.hidden = false; modal.querySelector('[data-cerrar-modal]').focus(); marcarAmbiente(); }
  function cerrarModal() { modalAbierto = false; modal.hidden = true; }
  function entrar() { activo = true; ui.classList.add('activo'); $('[data-intro]').classList.add('fuera'); setTimeout(() => $('[data-intro]').remove(), 600); lienzo.focus?.(); }
  ui.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-ir]');
    if (!t) return;
    if (t.matches('[data-entrar]')) entrar();
    else if (t.matches('[data-salir]')) salir();
    else if (t.matches('[data-plano]')) abrirModal();
    else if (t.matches('[data-cerrar-modal]')) cerrarModal();
    else if (t.matches('[data-agendar]')) salir('contacto');
    else if (t.dataset.ir) ir(t.dataset.ir);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(); });
  ui.querySelectorAll('.plano [data-ir]').forEach((g) => g.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(g.dataset.ir); }));

  const ficha = $('[data-ficha]');
  const jugador = $('[data-mini] .jugador');
  function ambienteEn(x, z) { return AMBIENTES.find((a) => x >= a.r[0] && x <= a.r[2] && z >= a.r[1] && z <= a.r[3]); }
  function marcarAmbiente() {
    ui.querySelectorAll('[data-ir]').forEach((el) => el.classList.toggle('on', el.dataset.ir === ambienteActual));
  }
  function actualizarFicha() {
    const a = ambienteEn(pos.x, pos.z);
    jugador.setAttribute('transform', `translate(${pos.x} ${pos.z}) rotate(${(-yaw * 180) / Math.PI})`);
    if (!a || a.id === ambienteActual) return;
    ambienteActual = a.id;
    const area = Math.round((a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
    ficha.querySelector('h3').textContent = a.nombre;
    ficha.querySelector('.ph3d__m2').textContent = `${area} m²`;
    ficha.querySelector('.ph3d__txt').textContent = a.texto;
    ficha.classList.remove('on'); void ficha.offsetWidth; ficha.classList.add('on');
    marcarAmbiente();
  }

  // ---------- ciclo ----------
  let t0 = performance.now(), raf = 0, vivo = true;
  const adelante = new THREE.Vector3(), derecha = new THREE.Vector3();
  function paso(t) {
    if (!vivo) return;
    const dt = Math.min(0.05, (t - t0) / 1000); t0 = t;
    piscina.animar(t / 1000);
    if (viaje) {
      const k = clamp((t - viaje.t0) / viaje.dur, 0, 1), e = k * k * (3 - 2 * k);
      pos.lerpVectors(viaje.de, viaje.a, e);
      yaw = viaje.yaw0 + viaje.dyaw * e; pitch = viaje.pitch0 * (1 - e) + 0.02 * e;
      if (k >= 1) viaje = null;
    } else if (activo && !modalAbierto) {
      let f = 0, s = 0;
      if (teclas.has('KeyW') || teclas.has('ArrowUp')) f += 1;
      if (teclas.has('KeyS') || teclas.has('ArrowDown')) f -= 1;
      if (teclas.has('KeyD')) s += 1;
      if (teclas.has('KeyA')) s -= 1;
      if (teclas.has('ArrowLeft')) yaw += 1.8 * dt;
      if (teclas.has('ArrowRight')) yaw -= 1.8 * dt;
      f -= palanca.y; s += palanca.x;
      if (f || s) {
        const v = (teclas.has('ShiftLeft') || teclas.has('ShiftRight') ? 5.2 : 2.6) * dt;
        adelante.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        derecha.set(Math.cos(yaw), 0, -Math.sin(yaw));
        const m = Math.hypot(f, s) > 1 ? Math.hypot(f, s) : 1;
        pos.addScaledVector(adelante, (f / m) * v).addScaledVector(derecha, (s / m) * v);
        resolver(pos);
      }
    } else if (!activo) {
      yaw += dt * 0.05; // la vista gira despacio detrás de la portada
    }
    camara.position.set(pos.x, Y_PH + OJO, pos.z);
    camara.rotation.set(pitch, yaw, 0);
    actualizarFicha();
    motor.render();
    raf = requestAnimationFrame(paso);
  }

  function redimensionar() {
    motor.tamano(innerWidth, innerHeight);
    camara.aspect = innerWidth / innerHeight;
    camara.fov = innerWidth < innerHeight ? 80 : 68;
    camara.updateProjectionMatrix();
  }
  addEventListener('resize', redimensionar);
  redimensionar();
  raf = requestAnimationFrame(paso);
  requestAnimationFrame(() => ui.classList.add('on'));
  $('[data-entrar]').focus();

  // Solo en local con ?fotos: captura un render de cada ambiente (para la galería de la página)
  if (new URLSearchParams(location.search).has('fotos')) {
    window.__fotoPH = (id, fov = 62, alturaOjo = OJO) => {
      const a = AMBIENTES.find((x) => x.id === id);
      const [x, z] = LLEGADAS[id];
      pos.set(x, 0, z); yaw = yawDe(a.mira); pitch = -0.04; viaje = null;
      camara.fov = fov; camara.updateProjectionMatrix();
      camara.position.set(pos.x, Y_PH + alturaOjo, pos.z);
      camara.rotation.set(pitch, yaw, 0);
      motor.render();
      return lienzo.toDataURL('image/jpeg', 0.92);
    };
    window.__escenaPH = { scene, motor, piscina, capturarAmbiente, THREE };
  }

  function salir(destino) {
    if (!vivo) return;
    vivo = false;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
    removeEventListener('resize', redimensionar); removeEventListener('blur', limpiarTeclas);
    document.documentElement.style.overflow = '';
    ui.classList.remove('on');
    alSalir?.(destino);
    setTimeout(() => {
      scene.traverse((o) => { o.geometry?.dispose(); });
      gestor.onAvance = gestor.onListo = null;
      sonda?.dispose(); cielo.dispose(); motor.dispose(); motor.renderer.forceContextLoss();
      ui.remove();
    }, 450);
  }
}
