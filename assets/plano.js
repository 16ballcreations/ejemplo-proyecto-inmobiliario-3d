// Plano SVG del penthouse, generado desde los datos (sirve para la sección, el modal y el minimapa).
import { AMBIENTES, PLANTA, LLEGADAS } from './datos.js';

const seg = ([a, b, c, d]) => `M${a} ${b}L${c} ${d}`;

export function planoSVG({ numeros = true, etiquetas = true, jugador = false } = {}) {
  const [ix0, iz0, ix1, iz1] = PLANTA.interior;
  const [px0, pz0, px1, pz1] = PLANTA.piscina;
  const [nx0, nz0, nx1, nz1] = PLANTA.nucleo;
  const salas = AMBIENTES.map((a, i) => {
    const [x0, z0, x1, z1] = a.r;
    const [lx, lz] = LLEGADAS[a.id];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    return `<g class="amb" data-ir="${a.id}" tabindex="${numeros ? 0 : -1}" role="${numeros ? 'button' : 'presentation'}" aria-label="${a.nombre}">
      <rect x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}"/>
      ${etiquetas ? `<text x="${cx}" y="${cz}" class="et">${a.corto.toUpperCase()}</text>` : ''}
      ${numeros ? `<circle cx="${lx}" cy="${lz}" r=".55" class="num"/><text x="${lx}" y="${lz + 0.22}" class="numt">${i + 1}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg viewBox="-12 -10 22 20" class="svgplano" xmlns="http://www.w3.org/2000/svg">
    <style>
      .svgplano .amb rect{fill:rgba(239,232,220,.04);stroke:none;transition:fill .2s}
      .svgplano .amb[data-ir]:hover rect,.svgplano .amb.on rect{fill:rgba(198,107,64,.16)}
      .svgplano .amb{cursor:${numeros ? 'pointer' : 'default'};outline:none}
      .svgplano .et{font:600 .62px 'Instrument Sans',sans-serif;fill:#c9c1b4;text-anchor:middle;letter-spacing:.06px}
      .svgplano .num{fill:#c66b40}.svgplano .numt{font:600 .62px 'Instrument Sans',sans-serif;fill:#fff;text-anchor:middle}
    </style>
    <rect x="-11" y="-9" width="4" height="18" fill="rgba(141,158,120,.12)"/>
    <rect x="${px0}" y="${pz0}" width="${px1 - px0}" height="${pz1 - pz0}" rx=".3" fill="#3fa7b8" opacity=".7"/>
    <rect x="${ix0}" y="${iz0}" width="${ix1 - ix0}" height="${iz1 - iz0}" fill="rgba(239,232,220,.03)"/>
    ${salas}
    <rect x="${nx0}" y="${nz0}" width="${nx1 - nx0}" height="${nz1 - nz0}" fill="rgba(239,232,220,.12)"/>
    <text x="${(nx0 + nx1) / 2}" y="${(nz0 + nz1) / 2 + 0.2}" class="et" style="font-size:.45px">ASCENSOR</text>
    <path d="${PLANTA.vidrios.map(seg).join('')}" stroke="#7fb6c9" stroke-width=".14" fill="none"/>
    <path d="${PLANTA.barandas.map(seg).join('')}" stroke="#7fb6c9" stroke-width=".08" stroke-dasharray=".3 .2" fill="none"/>
    <path d="${PLANTA.muros.map(seg).join('')}" stroke="#efe8dc" stroke-width=".22" stroke-linecap="square" fill="none"/>
    ${jugador ? '<g class="jugador"><path d="M0 -1.4 L.75 0 L-.75 0Z" fill="rgba(198,107,64,.55)"/><circle r=".42" fill="#e3936a" stroke="#fff" stroke-width=".12"/></g>' : ''}
  </svg>`;
}
