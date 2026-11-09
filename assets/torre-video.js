// Versión A · la torre en video IA: varias tomas encadenadas que se "frotan" con el scroll.
// Las tomas viven en media/ y se describen en media/manifest.json (ver media/GUION-TOMAS.md).
// Compositor de un solo canvas: solo pinta cuando hay un cuadro decodificado, así nunca se ve negro.

export async function crearTorreVideo(escenario, lienzo, { ligero = false, cargador } = {}) {
  let manifiesto = null;
  try {
    const r = await fetch('media/manifest.json', { cache: 'no-store' });
    if (r.ok) manifiesto = await r.json();
  } catch {}
  const vertical = innerHeight > innerWidth;
  const lista = manifiesto && (ligero ? (vertical ? manifiesto.vertical : manifiesto.movil) : manifiesto.escritorio);
  if (!lista?.length) return avisoSinVideos(escenario);

  const fps = manifiesto.fps || 30;
  let inicio = 0;
  const tomas = lista.map((t) => { const o = { ...t, a: inicio }; inicio += t.dur; return o; });
  const total = inicio;
  const ctx = lienzo.getContext('2d', { alpha: false });
  const vids = tomas.map(() => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
    escenario.appendChild(v);
    return v;
  });
  const listos = [];
  let activa = 0, progreso = 0, dibujado = '';

  // descarga secuencial con avance real en bytes
  cargador?.mostrar('Cargando la obra en alta definición');
  const bytesTotal = tomas.reduce((s, t) => s + (t.bytes || 0), 0);
  let vistos = 0;
  (async () => {
    for (let i = 0; i < tomas.length; i++) {
      try {
        const res = await fetch(tomas[i].src);
        const lector = res.body.getReader(), partes = [];
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          partes.push(value); vistos += value.byteLength;
          if (bytesTotal) cargador?.avance(Math.min(0.99, vistos / bytesTotal));
        }
        const v = vids[i];
        v.src = URL.createObjectURL(new Blob(partes, { type: 'video/mp4' }));
        v.addEventListener('loadeddata', () => { listos[i] = true; if (i === activa) pintar(); }, { once: true });
        v.addEventListener('seeked', () => { if (i === activa) pintar(); });
        v.load();
      } catch (e) { console.warn('toma', i, e); }
      if (!bytesTotal) cargador?.avance((i + 1) / tomas.length);
    }
    cargador?.avance(1);
  })();

  function pintar() {
    const v = vids[activa];
    if (!listos[activa] || v.seeking || v.readyState < 2) return;
    const clave = activa + ':' + v.currentTime.toFixed(3) + ':' + lienzo.width;
    if (clave === dibujado) return;
    const vw = v.videoWidth, vh = v.videoHeight, cw = lienzo.width, ch = lienzo.height;
    const s = Math.max(cw / vw, ch / vh), sw = cw / s, sh = ch / s;
    ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, cw, ch);
    dibujado = clave;
  }

  function buscar() {
    const T = Math.min(total - 0.001, Math.max(0, progreso * total));
    let i = tomas.findIndex((t) => T >= t.a && T < t.a + t.dur);
    if (i < 0) i = tomas.length - 1;
    // si la toma que toca aún no llegó, seguimos mostrando la última que sí tenemos
    if (!listos[i]) { for (let k = i; k >= 0; k--) if (listos[k]) { i = k; break; } }
    if (!listos[i]) return;
    activa = i;
    const local = Math.min(tomas[i].dur - 0.5 / fps, Math.max(0, T - tomas[i].a));
    const v = vids[i];
    if (!v.seeking && Math.abs(v.currentTime - local) > 0.45 / fps) v.currentTime = local;
    else pintar();
  }

  return {
    setProgreso(p) { progreso = p; buscar(); },
    redimensionar() {
      const r = lienzo.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      lienzo.width = Math.round(r.width * dpr); lienzo.height = Math.round(r.height * dpr);
      dibujado = ''; buscar();
    },
    // mientras el penthouse está abierto devolvemos los decodificadores; el canvas conserva el último cuadro
    pausar() { vids.forEach((v) => v.pause()); },
    reanudar() { buscar(); },
    destruir() { vids.forEach((v) => { URL.revokeObjectURL(v.src); v.remove(); }); },
  };
}

function avisoSinVideos(escenario) {
  const div = document.createElement('div');
  div.className = 'aviso-video';
  div.innerHTML = `<div><p class="antetitulo">Versión A · video IA</p><h3>Las tomas aún no están.</h3>
    <p>Esta versión reproduce videos generados con IA. Cuando estén en <code>media/</code> y descritos en <code>media/manifest.json</code>, la torre aparece aquí. Mientras tanto, mira la <a href="?modo=3d">versión 3D en vivo</a>.</p></div>`;
  escenario.querySelector('canvas').after(div);
  return { setProgreso() {}, redimensionar() {}, pausar() {}, reanudar() {}, destruir() {} };
}
