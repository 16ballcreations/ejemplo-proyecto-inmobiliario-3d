// Cielo fotográfico: cuatro panorámicas reales (Poly Haven, CC0) de la misma serie, mezcladas según la hora.
// Todas se giran juntas para que el sol de la foto coincida con la luz direccional de la escena.
import * as THREE from 'three';

const BASE = new URL('../cielo/', import.meta.url).href;
export const CIELOS = [
  // u del sol en la foto, elevación del sol (°), color del horizonte (para la bruma)
  { id: 'tarde',     uSol: 0.6025, elev: 19,  horizonte: '#b3bcbe' },
  { id: 'atardecer', uSol: 0.5752, elev: 8,   horizonte: '#aeaab0' },
  { id: 'anochecer', uSol: 0.5947, elev: -3,  horizonte: '#8a7a8a' },
  { id: 'noche',     uSol: 0.6201, elev: -9,  horizonte: '#262a36' },
];

const vert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // siempre al fondo
  }`;
const frag = /* glsl */`
  uniform sampler2D t0, t1, t2, t3;
  uniform vec4 peso;      // mezcla de las cuatro fotos
  uniform vec4 giro;      // desplazamiento u de cada foto
  uniform float brillo;
  varying vec3 vDir;
  vec3 muestra(sampler2D t, float g, vec3 d) {
    float u = atan(d.z, d.x) / 6.2831853 + 0.5 + g;
    float v = asin(clamp(d.y, 0.0015, 1.0)) / 1.5707963;
    return texture2D(t, vec2(fract(u), v)).rgb;
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 c = vec3(0.0);
    if (peso.x > 0.001) c += peso.x * muestra(t0, giro.x, d);
    if (peso.y > 0.001) c += peso.y * muestra(t1, giro.y, d);
    if (peso.z > 0.001) c += peso.z * muestra(t2, giro.z, d);
    if (peso.w > 0.001) c += peso.w * muestra(t3, giro.w, d);
    gl_FragColor = vec4(c * brillo, 1.0);
    #include <colorspace_fragment>
  }`;

export function crearCieloFoto({ ligero = false, gestor } = {}) {
  const cargador = new THREE.TextureLoader(gestor);
  const tex = CIELOS.map((c) => {
    const t = cargador.load(BASE + c.id + (ligero ? '_m' : '') + '.webp');
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearFilter; // sin mipmaps: evita la costura del equirectangular
    t.generateMipmaps = false;
    return t;
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      t0: { value: tex[0] }, t1: { value: tex[1] }, t2: { value: tex[2] }, t3: { value: tex[3] },
      peso: { value: new THREE.Vector4(1, 0, 0, 0) }, giro: { value: new THREE.Vector4() }, brillo: { value: 1 },
    },
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
  });
  const malla = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  malla.scale.setScalar(20000);
  malla.frustumCulled = false;
  malla.renderOrder = -1;

  const horizontes = CIELOS.map((c) => new THREE.Color(c.horizonte));
  const colorBruma = new THREE.Color();
  const dirSol = new THREE.Vector3();

  // hora: 0 tarde → 1 atardecer → 2 anochecer → 3 noche (con decimales). azim: azimut del sol en grados.
  function setHora(hora, azim) {
    const p = [0, 0, 0, 0];
    const i = Math.min(2, Math.floor(hora)), f = Math.min(1, hora - i);
    p[i] = 1 - f; p[i + 1] = f;
    mat.uniforms.peso.value.set(...p);
    // A = atan2(z, x) del sol, con la misma convención que solEn()
    const A = Math.PI / 2 - THREE.MathUtils.degToRad(azim);
    mat.uniforms.giro.value.set(...CIELOS.map((c) => c.uSol - 0.5 - A / (Math.PI * 2)));
    colorBruma.setRGB(0, 0, 0);
    p.forEach((w, k) => colorBruma.add(horizontes[k].clone().multiplyScalar(w)));
    const elev = CIELOS.reduce((s, c, k) => s + c.elev * p[k], 0);
    const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim);
    dirSol.setFromSphericalCoords(1, phi, theta);
    return { elev, dirSol, colorBruma };
  }

  // reflejos: el ambiente se recalcula desde el propio cielo solo cuando cambia lo suficiente
  let pmrem = null, envActual = null, claveEnv = '';
  const escenaEnv = new THREE.Scene();
  const mallaEnv = new THREE.Mesh(malla.geometry, mat);
  mallaEnv.scale.setScalar(100);
  escenaEnv.add(mallaEnv);
  function ambiente(renderer, hora, azim) {
    const clave = Math.round(hora * 6) + ':' + Math.round(azim / 15);
    if (clave === claveEnv && envActual) return envActual;
    if (!tex.every((t) => t.image)) return envActual;
    claveEnv = clave;
    pmrem ||= new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(escenaEnv, 0, 0.1, 1000);
    envActual?.dispose();
    envActual = rt;
    return rt;
  }

  return { malla, setHora, ambiente: (r, h, a) => ambiente(r, h, a)?.texture, texturas: tex, dispose() { tex.forEach((t) => t.dispose()); pmrem?.dispose(); } };
}
