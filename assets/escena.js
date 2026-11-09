// Orquesta la página: scroll → progreso → motor (3D o video) + HUD + capítulos.
import { PROYECTO, CAPITULOS, AMBIENTES, etapaEn, pisosEn } from './datos.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const params = new URLSearchParams(location.search);
const modo = params.get('modo') === 'video' ? 'video' : '3d';
$$('.modo a').forEach((a) => a.classList.toggle('on', a.dataset.modo === modo));

const ligero = innerWidth < 760 || (matchMedia('(pointer: coarse)').matches && innerWidth < 1100);
const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;

const pista = $('[data-pista]');
const lienzo = $('[data-lienzo]');
const hud = Object.fromEntries($$('[data-hud]').map((el) => [el.dataset.hud, el]));
const caps = CAPITULOS.map((c) => ({ ...c, el: $(`[data-cap="${c.id}"]`) }));

let motor = null, cargaLista = false;
let objetivo = 0, suave = 0, visible = true, phAbierto = false;

async function iniciarMotor() {
  try {
    if (modo === 'video') {
      const { crearTorreVideo } = await import('./torre-video.js');
      motor = await crearTorreVideo($('[data-escenario]'), lienzo, { ligero, cargador: cargadorUI() });
    } else {
      const { crearTorre3D } = await import('./torre3d.js');
      const carga = cargadorUI();
      carga.mostrar('Cargando materiales y cielo');
      motor = crearTorre3D(lienzo, { ligero, alCargar: (f) => { carga.avance(f); if (f >= 1) cargaLista = true; } });
    }
  } catch (e) {
    console.error(e);
    return;
  }
  motor.redimensionar();
  if (params.has('fotos')) window.__motor = motor; // solo para capturas locales
  leerScroll(); suave = objetivo;
  motor.setProgreso(suave);
}

function cargadorUI() {
  const caja = $('[data-cargador]');
  return {
    mostrar(texto) { caja.hidden = false; $('[data-cargador-texto]').textContent = texto; },
    avance(f) {
      $('[data-cargador-pct]').textContent = Math.round(f * 100) + '%';
      $('[data-cargador-barra]').style.transform = `scaleX(${f})`;
      if (f >= 1) { caja.style.opacity = 0; setTimeout(() => (caja.hidden = true), 900); }
    },
  };
}

function leerScroll() {
  const r = pista.getBoundingClientRect();
  const recorrido = Math.max(1, r.height - innerHeight);
  objetivo = Math.min(1, Math.max(0, -r.top / recorrido));
}

function pintarHUD(p) {
  const pisos = Math.min(PROYECTO.pisos, Math.max(p < 0.1 ? 0 : 1, Math.ceil(pisosEn(p) - 0.01)));
  hud.piso.textContent = String(pisos).padStart(2, '0');
  hud.etapa.textContent = etapaEn(p);
  hud.barra.style.transform = `scaleX(${p})`;
  hud.pct.textContent = `Avance ${Math.round(p * 100)}%`;
  hud.grados.textContent = `órbita ${Math.round(p * 360)}°`;
  for (const c of caps) c.el.classList.toggle('on', p >= c.rango[0] && p < c.rango[1]);
}

function ciclo() {
  if (!phAbierto && (visible || Math.abs(suave - objetivo) > 0.0001)) {
    suave += (objetivo - suave) * (reducido ? 1 : 0.12);
    if (Math.abs(objetivo - suave) < 0.0002) suave = objetivo;
    pintarHUD(suave);
    motor?.setProgreso(suave);
  }
  requestAnimationFrame(ciclo);
}

addEventListener('scroll', leerScroll, { passive: true });
let anchoPrevio = innerWidth;
addEventListener('resize', () => {
  // en celular la barra del navegador cambia la altura: solo re-medimos si cambia el ancho o es un salto grande
  if (innerWidth !== anchoPrevio || !ligero) { anchoPrevio = innerWidth; motor?.redimensionar(); }
  leerScroll();
});

new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  document.querySelector('.barra').classList.toggle('solida', !e.isIntersecting && e.boundingClientRect.top < 0);
  $('[data-flotante]').classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0);
}).observe(pista);

// ---- penthouse ----
async function abrirPenthouse(e) {
  e?.preventDefault();
  if (phAbierto) return;
  phAbierto = true;
  motor?.pausar();
  const { abrirPenthouse } = await import('./penthouse.js');
  abrirPenthouse({
    ligero,
    alSalir(destino) {
      phAbierto = false;
      motor?.reanudar();
      const el = destino === 'contacto' ? $('#contacto') : $('#penthouse');
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    },
  });
}
$$('[data-abrir-ph]').forEach((b) => b.addEventListener('click', abrirPenthouse));

// ---- sección penthouse: lista y plano ----
const area = (r) => Math.round((r[2] - r[0]) * (r[3] - r[1]));
$('[data-lista-ambientes]').innerHTML = AMBIENTES.map((a) => `<li><span>${a.nombre}</span><b>${area(a.r)} m²</b></li>`).join('');

// ---- cifras que cuentan ----
const fmt = (n, d) => n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const contadores = new IntersectionObserver((es) => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    contadores.unobserve(e.target);
    const el = e.target, fin = parseFloat(el.dataset.cuenta), d = +(el.dataset.dec || 0);
    if (reducido) { el.textContent = fmt(fin, d); continue; }
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / 1400), v = fin * (1 - Math.pow(1 - k, 3));
      el.textContent = fmt(v, d);
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
}, { threshold: 0.6 });
$$('[data-cuenta]').forEach((el) => contadores.observe(el));

// ---- formulario de ejemplo: valida, pero no envía nada ----
const form = $('[data-formulario]');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  let ok = true;
  for (const el of form.querySelectorAll('[required]')) {
    const bien = el.checkValidity();
    el.setAttribute('aria-invalid', String(!bien));
    ok &&= bien;
  }
  const estado = $('[data-formulario-estado]');
  if (!ok) { estado.textContent = 'Revisa tu nombre y tu correo.'; return; }
  estado.textContent = `Gracias, ${form.nombre.value.split(' ')[0]}. Este es un sitio de ejemplo, así que la solicitud no se envió. En el sitio de tu proyecto, aquí llegaría a tu equipo de ventas.`;
  form.reset();
});

// ?grabar=300 → graba la versión 3D cuadro a cuadro (herramienta local para tomas de prueba)
async function grabar(n) {
  for (let t = 0; !cargaLista && t < 200; t++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < n; i++) {
    motor.setProgreso(i / (n - 1));
    const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));
    await fetch('/__cuadro?n=' + i, { method: 'POST', body: blob });
  }
  document.title = 'GRABADO ' + n;
}

iniciarMotor().then(() => {
  const n = +params.get('grabar');
  if (n > 1 && modo === '3d') { phAbierto = true; grabar(n); return; }
  requestAnimationFrame(ciclo);
});
