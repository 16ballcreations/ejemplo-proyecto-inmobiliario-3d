// Renderizador común: tono fílmico, sombras suaves y postproceso (oclusión ambiental, bloom, viñeta).
// En celular se apaga lo caro (oclusión y bloom) y se baja la resolución.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { configurarTexturas } from './texturas.js';

const Acabado = {
  uniforms: { tDiffuse: { value: null }, vineta: { value: 0.32 }, calidez: { value: 0.03 }, grano: { value: 0.018 }, t: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float vineta, calidez, grano, t; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + t) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // leve curva en S y calidez en luces altas
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);
      c.rgb += vec3(calidez, calidez * 0.4, -calidez) * smoothstep(0.35, 1.0, dot(c.rgb, vec3(0.333)));
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - vineta * smoothstep(0.35, 0.95, d);
      c.rgb += (h(vUv * 931.0) - 0.5) * grano;
      gl_FragColor = c;
    }`,
};

export function crearRender(canvas, { ligero = false, oclusion = true, bloom = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: ligero, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ligero ? 1.25 : 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping; // respeta los colores de las fotos del cielo y las texturas
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = ligero ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  configurarTexturas(renderer);

  let composer = null, gtao = null, brillo = null, acabado = null, escena = null, camara = null;
  const usarPost = !ligero;

  function preparar(scene, camera) {
    escena = scene; camara = camera;
    if (!usarPost) return;
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (oclusion) {
      gtao = new GTAOPass(scene, camera, 2, 2);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // la oclusión no debe ver objetos marcados (p. ej. árboles en tarjeta: dibujaría cuadros)
      const renderGtao = gtao.render.bind(gtao);
      gtao.render = (...a) => {
        const ocultos = [];
        scene.traverse((o) => { if (o.userData.sinOclusion && o.visible) { o.visible = false; ocultos.push(o); } });
        renderGtao(...a);
        for (const o of ocultos) o.visible = true;
      };
      composer.addPass(gtao);
    }
    if (bloom) {
      brillo = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.35, 0.5, 0.86);
      composer.addPass(brillo);
    }
    composer.addPass(new OutputPass());
    acabado = new ShaderPass(Acabado);
    composer.addPass(acabado);
  }

  return {
    renderer,
    preparar,
    // radio de la oclusión en metros de escena (la torre usa más que un interior)
    oclusion({ mezcla, ...o }) { gtao?.updateGtaoMaterial(o); if (gtao && mezcla != null) gtao.blendIntensity = mezcla; },
    set bloom(v) { if (brillo) { brillo.strength = v; brillo.enabled = v > 0.01; } },
    set exposicion(v) { renderer.toneMappingExposure = v; },
    tamano(w, h) {
      renderer.setSize(w, h, false);
      composer?.setSize(w, h);
      composer?.setPixelRatio(renderer.getPixelRatio());
    },
    render() {
      if (composer) { acabado.uniforms.t.value = (acabado.uniforms.t.value + 1.37) % 100; composer.render(); }
      else renderer.render(escena, camara);
    },
    dispose() { composer?.dispose(); renderer.dispose(); },
  };
}
