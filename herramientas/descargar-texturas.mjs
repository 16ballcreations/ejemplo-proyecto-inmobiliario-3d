// Descarga texturas y cielos CC0 de Poly Haven (https://polyhaven.com, licencia CC0) y los deja livianos para la web.
// Uso: node herramientas/descargar-texturas.mjs   (requiere ffmpeg en el PATH)
// Originales en fuentes/ (no se publican). Resultado en assets/tex/*.webp y assets/cielo/*.webp
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const FUENTES = join(raiz, 'fuentes'), TEX = join(raiz, 'assets', 'tex'), CIELO = join(raiz, 'assets', 'cielo');

// nombre local → [id de Poly Haven, mapas]
const TEXTURAS = {
  ladrillo: ['red_brick_03', ['Diffuse', 'nor_gl', 'arm']],
  concreto: ['brushed_concrete', ['Diffuse', 'nor_gl', 'arm']],
  pasto: ['aerial_grass_rock', ['Diffuse', 'nor_gl']],
  roca: ['aerial_rocks_02', ['Diffuse', 'nor_gl']],
  cesped: ['leafy_grass', ['Diffuse', 'nor_gl']],
  tierra: ['dirt_aerial_02', ['Diffuse', 'nor_gl']],
  grava: ['gravel_floor_02', ['Diffuse', 'nor_gl']],
  asfalto: ['asphalt_02', ['Diffuse', 'nor_gl']],
  roble: ['wood_floor', ['Diffuse', 'nor_gl', 'arm']],
  travertino: ['marble_01', ['Diffuse', 'nor_gl', 'arm']],
  microcemento: ['concrete_floor_01', ['Diffuse', 'nor_gl', 'arm']],
  estuco: ['painted_plaster_wall', ['Diffuse', 'nor_gl']],
  tela: ['velour_velvet', ['Diffuse', 'nor_gl']],
  lino: ['rough_linen', ['Diffuse', 'nor_gl']],
  teja: ['clay_roof_tiles_02', ['Diffuse', 'nor_gl', 'arm']],
  cuero: ['leather_white', ['Diffuse', 'nor_gl']],
  deck: ['wood_floor_deck', ['Diffuse', 'nor_gl']],
  nogal: ['walnut_veneer', ['Diffuse']],
};
// cielos de la misma serie (mismo lugar a distintas horas) para mezclarlos con el scroll
const CIELOS = {
  tarde: 'qwantani_late_afternoon_puresky',
  atardecer: 'qwantani_sunset_puresky',
  anochecer: 'qwantani_dusk_2_puresky',
  noche: 'qwantani_night_puresky',
};
const SUFIJO = { Diffuse: 'color', nor_gl: 'normal', arm: 'arm' };

const existe = (p) => access(p).then(() => true, () => false);
async function bajar(url, destino) {
  if (await existe(destino)) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await writeFile(destino, Buffer.from(await r.arrayBuffer()));
  console.log('  ↓', destino.split(/[\\/]/).pop());
}
const ff = (...a) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);

await Promise.all([FUENTES, TEX, CIELO].map((d) => mkdir(d, { recursive: true })));

for (const [nombre, [id, mapas]] of Object.entries(TEXTURAS)) {
  console.log(nombre, '←', id);
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const m of mapas) {
    const src = join(FUENTES, `${id}_${m}_1k.jpg`);
    const archivo = files[m] || (m === 'Diffuse' && (files.col_1 || files.col_2)); // algunas telas traen variantes de color
    await bajar(archivo['1k'].jpg.url, src);
    // telas y cuero en gris: el color lo pone el material (así se pueden teñir)
    const subir = { tela: 2.0, lino: 1.25, cuero: 1.35, estuco: 1.08, asfalto: 1.9 }[nombre];
    const gris = m === 'Diffuse' && subir ? ['-vf', `hue=s=0,lutrgb=r=val*${subir}:g=val*${subir}:b=val*${subir}`] : [];
    ff('-i', src, ...gris, '-c:v', 'libwebp', '-quality', m === 'Diffuse' ? '82' : '88', join(TEX, `${nombre}_${SUFIJO[m]}.webp`));
  }
}
// el mármol de vetas (losa continua) se genera por código en assets/motor/texturas.js

for (const [nombre, id] of Object.entries(CIELOS)) {
  console.log('cielo', nombre, '←', id);
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const src = join(FUENTES, `${id}.jpg`);
  await bajar(files.tonemapped.url, src);
  // solo la mitad superior (el cielo puro no tiene suelo): escritorio 6144×1536 y celular 3072×768
  ff('-i', src, '-vf', 'crop=iw:ih/2:0:0,scale=6144:1536', '-c:v', 'libwebp', '-quality', '80', join(CIELO, `${nombre}.webp`));
  ff('-i', src, '-vf', 'crop=iw:ih/2:0:0,scale=3072:768', '-c:v', 'libwebp', '-quality', '78', join(CIELO, `${nombre}_m.webp`));
  // miniatura para ubicar el sol
  ff('-i', src, '-vf', 'crop=iw:ih/2:0:0,scale=512:128,format=gray', '-f', 'rawvideo', join(FUENTES, `${nombre}.gray`));
}
console.log('listo');
