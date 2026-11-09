# Arrayán · Residencias en la montaña: sitio de ejemplo

Sitio de **ejemplo** de [16 Ball Creations](https://16ballcreations.com) para enseñar a constructoras cómo podría
lanzarse un proyecto inmobiliario: la torre **se construye mientras el visitante baja**, y al final se puede
**entrar al penthouse en 3D**, caminarlo y cambiar acabados.

Publicado en https://16ballcreations.github.io/ejemplo-proyecto-inmobiliario-3d/

> **Arrayán es un proyecto ficticio.** La torre, el lote, las cifras, los precios y la ubicación exacta son inventados
> (Alto de Las Palmas, Medellín, como escenario). No hay datos de contacto: el formulario valida pero no envía nada y
> muestra un aviso. La página lleva `noindex, nofollow` y una franja arriba que dice que es un ejemplo hecho por
> 16 Ball Creations. Todo lo que se ve se genera en el navegador: no hay fotos de stock.

Inspirado en el concepto de la demo «constructora3d» de Latitud Nómade, con marca, contenido y código propios.

## Luz y sombras (por qué todo se ve «apoyado»)

- **Una sola fuente manda:** el sol del atardecer entra por el ventanal del poniente y proyecta las sombras de la perfilería,
  los muebles y las plantas. En el lote, su sombra se abre a todo el terreno cuando aparecen las amenidades.
- **Luz rebotada del propio interior** (`motor/luz.js`, `crearSonda`): el ambiente del penthouse se captura desde adentro,
  así los espacios son más claros hacia las ventanas y más oscuros hacia los muros. El agua sigue reflejando el cielo.
- **Cada luz sale de una lámpara que se ve:** colgantes de la isla y aro del comedor (con sombra), lámpara de pie y
  lámparas de noche. Los downlights del techo se ven apagados porque aún es de día.
- **Sombras de contacto** (`sombraContacto`) bajo cada mueble, además de la oclusión ambiental (GTAO).

## Dos versiones de la portada

- **B · 3D en vivo** (`/` o `?modo=3d`): todo se genera en el navegador con three.js.
- **A · Video IA** (`?modo=video`): tomas de video encadenadas que avanzan con el scroll. Ver `media/GUION-TOMAS.md`.
  Hoy usa tomas de prueba renderizadas desde la versión B (`?grabar=300`).

## Arquitectura (pensada para reusar en otros proyectos, p. ej. una casa)

```
assets/motor/      lo común a cualquier proyecto
  render.js        renderizador + postproceso (oclusión GTAO, bloom, viñeta); en celular se apaga lo caro
  cielo.js         cielo fotográfico: 4 panorámicas reales mezcladas según la hora, alineadas con el sol
  texturas.js      texturas PBR (color, relieve, rugosidad) con una instancia por mapa
  geo.js           cajas, cajas redondeadas y coordenadas de textura en metros (uvMundo)
  terreno.js       terreno por shader (pasto, roca en pendientes, prado, tierra de obra) y ciudad con fachadas por shader
  arboles-shader.js naturaleza por shader: cada árbol es UNA tarjeta; copa, tronco, huecos y relieve en el fragment shader
  vegetacion.js    árboles y arbustos 3D de reserva
  plantas.js       plantas de primer plano con hojas reales (olivo, ave del paraíso, pasto ornamental)
  agua.js          piscinas: vaso con mosaico, agua con refracción y ondas animadas, remate de piedra, luz nocturna
assets/lugares/    la geografía de cada sitio (las-palmas.js: meseta, valle de Aburrá, cordillera con crestas)
assets/torre3d.js  el proyecto: torre, obra, grúa y la línea de tiempo del scroll
assets/urbanismo.js vía de acceso demarcada, retorno, parqueadero con carros, cancha de tenis, piscina y paisajismo
assets/penthouse.js recorrido interior: muebles, acabados, plano, controles
assets/datos.js    todos los datos del proyecto (pisos, alturas, ambientes, planta, acabados)
```

Para un proyecto nuevo: un archivo en `lugares/` (dónde está), uno como `torre3d.js` (qué se construye) y su `datos.js`.

## Texturas y cielos

De [Poly Haven](https://polyhaven.com), licencia **CC0** (uso libre, también comercial, sin atribución obligatoria).
Se descargan y optimizan con:

```bash
node herramientas/descargar-texturas.mjs
```

Los originales quedan en `fuentes/` (no se publican); los WebP livianos en `assets/tex/` y `assets/cielo/`.
El mármol de los mesones se genera por código (losa continua sin juntas).

## Skill de referencia

La naturaleza por shader y el terreno siguen la skill `procedural-landscapes` (CK42BB, MIT), instalada en
`~/.claude/skills/procedural-landscapes/`: reglas de material por pendiente, ruido de crestas (ridged multifractal),
vegetación instanciada filtrada por altura y pendiente, y presupuestos de polígonos.

## Herramientas locales (solo con `herramientas/servir.mjs`)

- `?grabar=300` graba la versión 3D cuadro a cuadro en `media/_cuadros/` para armar tomas de prueba con ffmpeg.
- `?fotos` expone `window.__motor` (para `__motor.setProgreso(0.875)` y capturar el lienzo) y, con el penthouse abierto, `window.__fotoPH('sala')`, que devuelve un render del ambiente (galería en `assets/renders/`).

## Ver en local

```bash
node herramientas/servir.mjs 4380
```
