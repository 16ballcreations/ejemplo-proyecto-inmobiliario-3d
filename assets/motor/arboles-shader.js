// Vegetación por shader: cada árbol es UNA tarjeta (2 triángulos) que mira a la cámara.
// La copa, el tronco, los huecos entre hojas y el relieve (normales) se dibujan en el fragment shader,
// así miles de árboles cuestan casi nada en polígonos y siguen recibiendo sol, sombra y bruma.
// Especies: 0 frondoso (copa de bultos), 1 pino (pisos triangulares), 2 arbusto.
import * as THREE from 'three';

const GLSL_COMUN = /* glsl */`
  varying vec2 vQ; varying float vTipo; varying float vSemilla;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * ruido(p); p *= 2.07; a *= 0.5; } return s; }
  // Devuelve: x = cobertura (0..1), yzw = normal local (x derecha, y arriba, z hacia la cámara). esTronco en la salida.
  vec4 forma(vec2 q, float tipo, float sem, out float esTronco, out float ao) {
    esTronco = 0.0; ao = 1.0;
    vec2 j = vec2(h21(vec2(sem, 1.0)), h21(vec2(sem, 2.0))) - 0.5;
    if (tipo < 0.5) {
      // tronco
      float wt = 0.03 * (1.25 - q.y);
      if (q.y < 0.42 && abs(q.x - 0.5 + (q.y - 0.2) * j.x * 0.1) < wt) { esTronco = 1.0; ao = 0.55 + q.y; return vec4(1.0, (q.x - 0.5) / wt * 0.8, 0.0, 0.6); }
      // copa: bultos esféricos; gana el más cercano a la cámara
      vec3 C[6];
      C[0] = vec3(0.50 + j.x * 0.06, 0.64, 0.30); C[1] = vec3(0.30, 0.54 + j.y * 0.05, 0.20); C[2] = vec3(0.70, 0.53, 0.21);
      C[3] = vec3(0.40 + j.y * 0.05, 0.80, 0.19); C[4] = vec3(0.62, 0.82 + j.x * 0.04, 0.17); C[5] = vec3(0.52, 0.47, 0.20);
      float mejor = -1.0; vec3 n = vec3(0.0); float bordeRuido = (fbm(q * 9.0 + sem * 7.3) - 0.5) * 0.32;
      for (int k = 0; k < 6; k++) {
        vec2 d = (q - C[k].xy) / C[k].z;
        float r2 = dot(d, d);
        float lim = 1.0 + bordeRuido;
        if (r2 < lim * lim) {
          float hgt = sqrt(max(0.0, 1.0 - r2 / (lim * lim)));
          float prof = hgt * C[k].z + C[k].y * 0.15;
          if (prof > mejor) { mejor = prof; n = vec3(d / lim, hgt); }
        }
      }
      if (mejor < 0.0) return vec4(0.0);
      // textura de hojas: relieve fino y huecos
      float hojas = fbm(q * 34.0 + sem * 3.1);
      n.xy += (vec2(fbm(q * 40.0 + 3.0), fbm(q * 40.0 - 5.0)) - 0.5) * 0.9;
      float hueco = smoothstep(0.36, 0.30, hojas) * smoothstep(0.55, 0.95, length(n.xy));
      ao = 0.55 + 0.45 * smoothstep(0.35, 0.9, q.y) * (0.6 + 0.4 * n.z);
      return vec4(1.0 - hueco, normalize(n));
    } else if (tipo < 1.5) {
      // pino: tronco y pisos triangulares superpuestos
      float wt = 0.022 * (1.3 - q.y);
      if (q.y < 0.3 && abs(q.x - 0.5) < wt) { esTronco = 1.0; ao = 0.5; return vec4(1.0, 0.0, 0.0, 1.0); }
      float mejor = -1.0; vec3 n = vec3(0.0);
      for (int k = 0; k < 6; k++) {
        float fk = float(k);
        float y0 = 0.16 + fk * 0.13, alto = 0.24 - fk * 0.012, w = 0.40 - fk * 0.062;
        float t = (q.y - y0) / alto;
        if (t < 0.0 || t > 1.0) continue;
        float ancho = w * (1.0 - t) * (0.88 + 0.24 * fbm(vec2(q.x * 30.0, fk * 3.0 + sem)));
        float dx = (q.x - 0.5) / max(ancho, 0.001);
        if (abs(dx) < 1.0) { float prof = 1.0 - abs(dx) + fk * 0.01; if (prof > mejor) { mejor = prof; n = vec3(dx * 0.85, 0.35 + 0.4 * t, sqrt(max(0.05, 1.0 - dx * dx))); ao = 0.45 + 0.55 * t; } }
      }
      if (mejor < 0.0) return vec4(0.0);
      n.xy += (vec2(fbm(q * 50.0), fbm(q * 50.0 + 9.0)) - 0.5) * 0.7;
      return vec4(1.0, normalize(n));
    } else {
      // arbusto: una masa baja
      vec2 d = (q - vec2(0.5, 0.42)) / vec2(0.46, 0.38);
      float lim = 1.0 + (fbm(q * 8.0 + sem) - 0.5) * 0.35;
      float r2 = dot(d, d);
      if (r2 > lim * lim) return vec4(0.0);
      vec3 n = vec3(d / lim, sqrt(max(0.0, 1.0 - r2 / (lim * lim))));
      n.xy += (vec2(fbm(q * 30.0), fbm(q * 30.0 + 4.0)) - 0.5) * 0.8;
      ao = 0.5 + 0.5 * smoothstep(0.1, 0.8, q.y);
      return vec4(1.0, normalize(n));
    }
  }
`;

// mismo cálculo de billboard para el material y para la sombra
const VERT_BILLBOARD = /* glsl */`
  vec3 baseW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
  // mira a la cámara en horizontal y se inclina hacia ella en vertical (así no se aplasta vista desde un dron)
  vec3 aCam3 = normalize(cameraPosition - baseW + vec3(1e-4, 0.0, 0.0));
  vec3 aCam = normalize(vec3(aCam3.x, 0.0, aCam3.z) + vec3(1e-4, 0.0, 0.0));
  vec3 derechaW = normalize(cross(vec3(0.0, 1.0, 0.0), aCam));
  vec3 arribaW = normalize(mix(vec3(0.0, 1.0, 0.0), normalize(cross(aCam3, derechaW)), 0.72));
  vec3 wpos = baseW + derechaW * position.x * sx + arribaW * position.y * sy;
  vec4 mvPosition = viewMatrix * vec4(wpos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vQ = uv; vTipo = aTipo; vSemilla = aSemilla;
`;

export function crearArbolesShader({ cantidad, pos, ligero = false }) {
  // tarjeta de 1 × 1 con la base en y = 0; el ancho y alto reales van en la escala de cada instancia
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const tipos = new Float32Array(cantidad), semillas = new Float32Array(cantidad);
  geo.setAttribute('aTipo', new THREE.InstancedBufferAttribute(tipos, 1));
  geo.setAttribute('aSemilla', new THREE.InstancedBufferAttribute(semillas, 1));

  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, side: THREE.DoubleSide, alphaToCoverage: true, transparent: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTipo; attribute float aSemilla;\nvarying vec2 vQ; varying float vTipo; varying float vSemilla;\nvarying vec3 vDerV; varying vec3 vArrV; varying vec3 vCamV;')
      .replace('#include <project_vertex>', VERT_BILLBOARD + `
        vDerV = normalize((viewMatrix * vec4(derechaW, 0.0)).xyz);
        vArrV = normalize((viewMatrix * vec4(arribaW, 0.0)).xyz);
        vCamV = normalize((viewMatrix * vec4(normalize(cross(derechaW, arribaW)), 0.0)).xyz);`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(wpos, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMUN + '\nvarying vec3 vDerV; varying vec3 vArrV; varying vec3 vCamV;\nvec4 gForma; float gTronco; float gAO;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        gForma = forma(vQ, vTipo, vSemilla, gTronco, gAO);
        if (gForma.x < 0.02) discard;`)
      .replace('#include <color_fragment>', `
        // verdes profundos y poco saturados; cada árbol con su tono
        float var = h21(vec2(vSemilla, 9.0));
        vec3 hoja = vTipo > 0.5 && vTipo < 1.5 ? mix(vec3(0.07, 0.12, 0.08), vec3(0.11, 0.16, 0.10), var)
                  : vTipo > 1.5 ? mix(vec3(0.12, 0.17, 0.08), vec3(0.18, 0.21, 0.10), var)
                  : mix(vec3(0.11, 0.17, 0.07), vec3(0.20, 0.24, 0.10), var);
        // las puntas al sol, más cálidas; el interior, más oscuro
        hoja = mix(hoja * 0.5, hoja * vec3(1.02, 0.98, 0.82), gAO);
        vec3 colorF = mix(hoja, vec3(0.16, 0.12, 0.09) * (0.6 + 0.4 * gAO), gTronco);
        #ifdef USE_INSTANCING_COLOR
          colorF *= vColor;
        #endif
        diffuseColor.rgb = colorF;
        diffuseColor.a = clamp(gForma.x * 1.5, 0.0, 1.0);`)
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = 1.0;
        vec3 normal = normalize(vDerV * gForma.y + vArrV * gForma.z + vCamV * gForma.w);
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gAO;');
  };

  // sombra con la misma silueta
  const prof = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  prof.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTipo; attribute float aSemilla;\nvarying vec2 vQ; varying float vTipo; varying float vSemilla;')
      .replace('#include <project_vertex>', VERT_BILLBOARD);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMUN)
      .replace('void main() {', 'void main() {\n float tT, aT; vec4 fS = forma(vQ, vTipo, vSemilla, tT, aT); if (fS.x < 0.5) discard;');
  };

  const m = new THREE.InstancedMesh(geo, mat, cantidad);
  m.customDepthMaterial = prof;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
  const TONOS = ['#ffffff', '#eef2e6', '#f7f1e2', '#e6ece2', '#fff8ec', '#e2e8dc'];
  let n = 0;
  for (let k = 0; n < cantidad && k < cantidad * 14; k++) {
    const r = pos(k);
    if (!r) continue;
    const tipo = r.tipo ?? 0;
    const alto = r.alto, ancho = r.alto * (tipo === 1 ? 0.55 : tipo === 2 ? 1.5 : 1.05);
    s.set(ancho, alto, ancho);
    v.set(r.x, r.y - 0.25, r.z);
    m4.compose(v, q, s);
    m.setMatrixAt(n, m4);
    m.setColorAt(n, c.set(TONOS[k % TONOS.length]));
    tipos[n] = tipo; semillas[n] = (k * 0.6180339) % 1 * 100;
    n++;
  }
  m.count = n;
  m.castShadow = !ligero; m.receiveShadow = true;
  m.frustumCulled = false;
  m.userData.sinOclusion = true; // la oclusión ambiental no ve tarjetas
  return m;
}
