// Terreno genérico con texturas reales: pasto y tierra mezclados por vértice, tinte por manchas y bruma.
import * as THREE from 'three';
import { pbr } from './texturas.js';

// alturaFn(x, z) → y ; tierraFn(x, z) → 0..1 (cuánto es tierra/obra) ; tinteFn(x, z, y) → THREE.Color
export function crearTerreno({ alturaFn, tierraFn = () => 0, tinteFn, tam = 5200, seg = 260, repetir = 26 }) {
  const geo = new THREE.PlaneGeometry(tam, tam, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const uvs = geo.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * tam / repetir, uvs.getY(i) * tam / repetir);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3), mez = new Float32Array(pos.count);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = alturaFn(x, z);
    pos.setY(i, y);
    c.copy(tinteFn ? tinteFn(x, z, y) : c.set('#ffffff'));
    col.set([c.r, c.g, c.b], i * 3);
    mez[i] = tierraFn(x, z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aTierra', new THREE.BufferAttribute(mez, 1));
  geo.computeVertexNormals();

  const pasto = pbr('pasto');
  const tierra = pbr('tierra');
  const roca = pbr('roca');
  const cesped = pbr('cesped');
  const mat = new THREE.MeshStandardMaterial({ ...pasto, vertexColors: true, roughness: 0.97, metalness: 0 });
  mat.normalScale = new THREE.Vector2(0.8, 0.8);
  // obra: 1 = lote en tierra (construcción), 0 = jardín terminado. cesped: radio de prado cuidado alrededor del origen.
  const uniformes = { mapaTierra: { value: tierra.map }, mapaRoca: { value: roca.map }, mapaCesped: { value: cesped.map }, obra: { value: 1 }, radioCesped: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniformes);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTierra; varying float vTierra; varying vec3 vPosW; varying vec3 vNorW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTierra = aTierra; vPosW = (modelMatrix * vec4(position, 1.0)).xyz; vNorW = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D mapaTierra, mapaRoca, mapaCesped; uniform float obra, radioCesped;
        varying float vTierra; varying vec3 vPosW; varying vec3 vNorW;
        float hT(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rT(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hT(i), hT(i + vec2(1, 0)), u.x), mix(hT(i + vec2(0, 1)), hT(i + vec2(1, 1)), u.x), u.y); }
        float fT(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * rT(p); p *= 2.03; a *= 0.5; } return s; }`)
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        // dos escalas del pasto para romper la repetición
        vec3 lejos = texture2D(map, vMapUv * 0.137).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, lejos, 0.45);
        // variación macro por ruido (manchas de pasto seco y más verde), sin costo de polígonos
        float macro = fT(vPosW.xz * 0.012);
        diffuseColor.rgb *= mix(vec3(0.82, 0.9, 0.78), vec3(1.12, 1.06, 0.88), macro);
        // roca donde la pendiente es fuerte (regla de pendiente de la skill de paisajes procedurales)
        float pendiente = 1.0 - vNorW.y + (fT(vPosW.xz * 0.05) - 0.5) * 0.18;
        vec3 rocaC = texture2D(mapaRoca, vMapUv * 0.35).rgb * vec3(1.05, 1.0, 0.95);
        diffuseColor.rgb = mix(diffuseColor.rgb, rocaC, smoothstep(0.30, 0.48, pendiente));
        // prado cuidado alrededor del proyecto terminado
        float r = length(vPosW.xz);
        float prado = (1.0 - smoothstep(radioCesped - 12.0, radioCesped, r + (fT(vPosW.xz * 0.08) - 0.5) * 10.0)) * step(1.0, radioCesped);
        diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(mapaCesped, vPosW.xz * 0.25).rgb * vec3(0.95, 1.05, 0.85), prado * 0.85);
        // tierra de obra (desaparece al terminar)
        vec3 tierraC = texture2D(mapaTierra, vMapUv * 0.55).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, tierraC, clamp(vTierra * obra, 0.0, 1.0));
      `);
  };
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.userData.uniformes = uniformes;
  return m;
}

// Ciudad en el fondo del valle: bloques instanciados (ladrillo, concreto, techos) y luces de noche
export function crearCiudad({ alturaFn, dentro, cantidad = 6000, luces = 9000, semilla = 1 }) {
  const h = (a, b) => { const s = Math.sin((a + semilla) * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // fachadas por shader: pisos y ventanas en coordenadas de mundo, cubierta oscura, y de noche algunas ventanas encendidas
  const usoNoche = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, emissive: '#ffb871', emissiveIntensity: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.noche = usoNoche;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vPw; varying vec3 vNw;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vPw = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vNw = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float noche; varying vec3 vPw; varying vec3 vNw;
        float hC(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float techo = step(0.5, vNw.y);
        float eje = abs(vNw.x) > abs(vNw.z) ? vPw.z : vPw.x;
        vec2 celda = vec2(eje / 3.4, vPw.y / 3.0);
        vec2 f = fract(celda);
        float ventana = step(0.22, f.x) * step(f.x, 0.82) * step(0.3, f.y) * step(f.y, 0.85) * (1.0 - techo);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.38, ventana);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.31, 0.3), techo * 0.8);
        float enc = step(0.62, hC(floor(celda) + floor(vPw.xz / 40.0)));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= ventana * enc * noche;`);
  };
  const edif = new THREE.InstancedMesh(geo, mat, cantidad);
  const paleta = ['#8a5a46', '#93624c', '#7f5242', '#a0705a', '#b9b2a6', '#9d978c', '#cfc9bd', '#77574a'].map((x) => new THREE.Color(x));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(), p = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let k = 0; n < cantidad && k < cantidad * 10; k++) {
    const r = dentro(h(k, 1), h(k, 2));
    if (!r) continue;
    const { x, z } = r;
    const y = alturaFn(x, z);
    const alto = h(k, 3) < 0.025 ? 26 + h(k, 4) * 34 : 5 + Math.pow(h(k, 5), 2.2) * 16;
    const lado = 7 + h(k, 6) * 11;
    q.setFromAxisAngle(eje, (Math.round(h(k, 7) * 4) * Math.PI) / 2 + 0.35);
    e.set(lado, alto, lado * (0.6 + h(k, 8) * 0.8));
    p.set(x, y - 1, z);
    m4.compose(p, q, e);
    edif.setMatrixAt(n, m4);
    edif.setColorAt(n, paleta[Math.floor(h(k, 9) * paleta.length)]);
    n++;
  }
  edif.count = n;
  edif.receiveShadow = true;
  edif.userData.noche = usoNoche;

  const lp = [], lc = [], c = new THREE.Color();
  for (let k = 0; lp.length / 3 < luces && k < luces * 8; k++) {
    const r = dentro(h(k, 11), h(k, 12));
    if (!r) continue;
    const y = alturaFn(r.x, r.z);
    lp.push(r.x, y + 2 + h(k, 13) * 20, r.z);
    const t = h(k, 14);
    c.set(t < 0.65 ? '#ffb15c' : t < 0.9 ? '#ffe2a8' : '#cfe3ff');
    lc.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  const puntos = new THREE.Points(g, new THREE.PointsMaterial({
    size: 2.2, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  return { edificios: edif, luces: puntos, noche: usoNoche };
}
