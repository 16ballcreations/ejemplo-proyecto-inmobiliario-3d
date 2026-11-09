// Arrayán · datos del proyecto (demo de 16 Ball Creations).
// Todo lo que se ve en la página sale de aquí: cambiar el proyecto = cambiar este archivo.
export const PROYECTO = {
  nombre: 'Arrayán',
  bajada: 'Residencias en la montaña',
  lugar: 'Alto de Las Palmas · Medellín',
  pisos: 24,
  alturaBasamento: 6,     // m, lobby de doble altura
  alturaPiso: 3.6,        // m, pisos tipo
  alturaPH: 5.4,          // m, penthouse
  ancho: 22, fondo: 22,   // m, planta tipo
  m2PH: 360,
  vista: 270,             // grados de vista al valle
};

// cota de coronamiento (m sobre el terreno)
export const COTA = PROYECTO.alturaBasamento + (PROYECTO.pisos - 1) * PROYECTO.alturaPiso + PROYECTO.alturaPH;
export const Y_PH = PROYECTO.alturaBasamento + (PROYECTO.pisos - 1) * PROYECTO.alturaPiso; // piso del penthouse

// Línea de tiempo del scroll (0–1). obra: 0 terreno → 1 torre terminada.
export const ETAPAS = [
  { desde: 0.00, nombre: 'Terreno y cimentación' },
  { desde: 0.10, nombre: 'Estructura' },
  { desde: 0.55, nombre: 'Fachada de ladrillo y vidrio' },
  { desde: 0.78, nombre: 'Penthouse y cubierta' },
  { desde: 0.80, nombre: 'Urbanismo y amenidades' },
  { desde: 0.92, nombre: 'Arrayán al anochecer' },
];

// capítulos de texto sobre la escena: [desde, hasta]
export const CAPITULOS = [
  { id: 'c0', rango: [-1, 0.06] },
  { id: 'c1', rango: [0.09, 0.24] },
  { id: 'c2', rango: [0.30, 0.48] },
  { id: 'c3', rango: [0.56, 0.72] },
  { id: 'c4', rango: [0.77, 0.83] },
  { id: 'c6', rango: [0.85, 0.93] },
  { id: 'c5', rango: [0.95, 9] },
];

// Penthouse: ambientes (rectángulos x0,z0,x1,z1 en metros, origen en el centro de la planta)
export const AMBIENTES = [
  { id: 'sala',    nombre: 'Sala de doble altura', corto: 'Sala',    r: [-7, -1, 1, 9],  texto: 'Ventanal de piso a techo hacia el valle y chimenea de piedra.', mira: [-1, -0.45] },
  { id: 'comedor', nombre: 'Comedor y bar',        corto: 'Comedor', r: [-7, -9, 1, -1], texto: 'Mesa para ocho, bar de nogal y salida directa a la terraza.', mira: [-1, -0.6] },
  { id: 'cocina',  nombre: 'Cocina con isla',      corto: 'Cocina',  r: [1, 3, 9, 9],    texto: 'Isla de 4 m, despensa oculta y vista a los cerros orientales.', mira: [-1, -0.55] },
  { id: 'estudio', nombre: 'Estudio',              corto: 'Estudio', r: [4, -1, 9, 3],   texto: 'Un rincón en silencio, con luz de la mañana.', mira: [1, -0.45] },
  { id: 'suite',   nombre: 'Suite principal',      corto: 'Suite',   r: [1, -9, 9, -1],  texto: 'Esquina suroriente, vestier iluminado y baño con tina al paisaje.', mira: [-0.65, 0.76] },
  { id: 'terraza', nombre: 'Terraza con piscina',  corto: 'Terraza', r: [-11, -9, -7, 9], texto: 'Piscina de borde infinito suspendida sobre el valle de Aburrá.', mira: [-0.4, 1] },
];

// puntos de llegada de cada ambiente (x, z)
export const LLEGADAS = {
  sala: [0.5, 8.2], comedor: [-0.2, -2.2], cocina: [8.1, 6.6], estudio: [4.6, 2.3], suite: [7.9, -6.0], terraza: [-7.9, -8.2],
};

// Acabados intercambiables
export const ACABADOS = {
  piso: [
    { id: 'roble', nombre: 'Roble natural' },
    { id: 'travertino', nombre: 'Travertino' },
    { id: 'microcemento', nombre: 'Microcemento' },
  ],
  mesones: [
    { id: 'marmol', nombre: 'Mármol blanco' },
    { id: 'nero', nombre: 'Nero Marquina' },
    { id: 'roble', nombre: 'Roble natural' },
  ],
};

export function etapaEn(p) {
  let e = ETAPAS[0];
  for (const x of ETAPAS) if (p >= x.desde) e = x;
  return e.nombre;
}

// Avance de obra → pisos con estructura (float, 0–24)
export function pisosEn(p) {
  if (p < 0.10) return 0;
  if (p >= 0.78) return PROYECTO.pisos;
  return ((p - 0.10) / 0.68) * PROYECTO.pisos;
}

// Planta del penthouse: segmentos [x0, z0, x1, z1]
export const PLANTA = {
  interior: [-7, -9, 9, 9],
  vidrios: [[9, -9, 9, 9], [-7, 9, 9, 9], [-7, -9, 9, -9], [-7, -9, -7, -5], [-7, 5, -7, 9]],
  barandas: [[-11, -9, -11, 9], [-11, 9, -7, 9], [-11, -9, -7, -9]],
  muros: [
    [1, -9, 1, -3.2], [1, -2, 1, -1],      // suite, con puerta hacia el comedor
    [1, -1, 9, -1],                         // suite / núcleo y estudio
    [1, -1, 1, 3], [4, -1, 4, 3], [1, 3, 4, 3], // núcleo (ascensor)
    [4, 3, 6, 3], [7.6, 3, 9, 3],           // estudio / cocina, con paso
  ],
  nucleo: [1, -1, 4, 3],
  piscina: [-10.6, -6.5, -8.6, 5.5],
  alto: 4.2,
};
