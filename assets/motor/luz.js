// Luz con correlación: que cada objeto se vea apoyado y que la luz venga de donde se ve que viene.
// - sombraContacto: oclusión suave bajo cada mueble (lo que hace que no «flote»).
// - sondaInterior: el ambiente (reflejos y luz rebotada) se toma del propio interior, no del cielo exterior,
//   así un espacio se ilumina más hacia las ventanas y menos hacia los muros y el techo.
import * as THREE from 'three';

const texturas = {};
// rectángulo (o círculo) negro con bordes difuminados; el núcleo ocupa el 62 % central
function texSombra(forma) {
  if (texturas[forma]) return texturas[forma];
  const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d');
  g.filter = 'blur(9px)';
  g.fillStyle = '#000';
  if (forma === 'circ') { g.beginPath(); g.arc(n / 2, n / 2, n * 0.31, 0, Math.PI * 2); g.fill(); }
  else { g.beginPath(); g.roundRect(n * 0.19, n * 0.19, n * 0.62, n * 0.62, n * 0.06); g.fill(); }
  // segunda pasada más ceñida: el contacto mismo es más oscuro que la penumbra
  g.filter = 'blur(4px)'; g.globalAlpha = 0.55;
  if (forma === 'circ') { g.beginPath(); g.arc(n / 2, n / 2, n * 0.27, 0, Math.PI * 2); g.fill(); }
  else { g.beginPath(); g.roundRect(n * 0.23, n * 0.23, n * 0.54, n * 0.54, n * 0.04); g.fill(); }
  const t = new THREE.CanvasTexture(cv);
  return (texturas[forma] = t);
}
const materiales = {};
function matSombra(forma, opacidad) {
  const k = forma + opacidad.toFixed(2);
  return (materiales[k] ||= new THREE.MeshBasicMaterial({
    map: texSombra(forma), color: '#000', transparent: true, opacity: Math.min(0.85, opacidad * 1.3), depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
  }));
}

// w, d: huella del objeto en metros (la penumbra se extiende alrededor)
export function sombraContacto(x, z, w, d, { giro = 0, opacidad = 0.5, y = 0.036, forma = 'rect' } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w / 0.62, d / 0.62).rotateX(-Math.PI / 2), matSombra(forma, opacidad));
  m.position.set(x, y, z); m.rotation.y = giro;
  m.renderOrder = -1;
  m.userData.sinOclusion = true;
  return m;
}

// Captura el ambiente desde un punto del interior y lo convierte en luz de ambiente (PMREM).
export function crearSonda(renderer, { tamano = 256 } = {}) {
  const rt = new THREE.WebGLCubeRenderTarget(tamano, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubo = new THREE.CubeCamera(0.05, 2000, rt);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let previo = null;
  return {
    capturar(scene, posicion, ocultar = []) {
      cubo.position.copy(posicion);
      const vis = ocultar.map((o) => o.visible);
      ocultar.forEach((o) => (o.visible = false));
      cubo.update(renderer, scene);
      ocultar.forEach((o, i) => (o.visible = vis[i]));
      const env = pmrem.fromCubemap(rt.texture);
      previo?.dispose();
      previo = env;
      return env.texture;
    },
    dispose() { previo?.dispose(); rt.dispose(); pmrem.dispose(); },
  };
}
