# Arrayán · guion de tomas para la versión A (video IA)

La versión A reemplaza la torre 3D por **tomas de video generadas con IA** que se "frotan" con el scroll.
Hoy `manifest.json` apunta a tomas de **prueba** renderizadas desde la versión 3D (`prueba_*.mp4`):
sirven para probar el motor; hay que reemplazarlas por las de IA.

## Cómo se hace (método de cuadros clave encadenados)

Un solo video de 360° no sale coherente de una IA. Se arma por tramos:

1. **Generar 6 imágenes fijas** (cuadros clave) del mismo lote, misma luz base, cámara en dron a ~150 m del edificio y ~35 m de alto,
   girando 72° entre una y otra. Cada imagen muestra una etapa de obra más avanzada.
2. **Generar 5 videos imagen-a-video** con cuadro inicial y cuadro final: la toma N empieza en el cuadro clave N y termina en el N+1.
   Así el último cuadro de una toma es el primero de la siguiente y el scroll no "salta".
3. Revisar que el edificio conserve forma, número de pisos y ladrillo entre tomas. Si una toma se deforma, se regenera solo esa.
4. Codificar (abajo) y anotar duración y bytes en `manifest.json`.

## Biblia visual (va en todos los prompts)

> Torre residencial de 24 pisos en una ladera de montaña verde sobre Medellín, Colombia (Alto de Las Palmas).
> Planta cuadrada de 22 m, aletas verticales de ladrillo cocido rojizo, vidrio de piso a techo, balcones alternados,
> basamento de ladrillo de 6 m, penthouse de vidrio con terraza y piscina. Al fondo, el valle de Aburrá con la ciudad.
> Fotografía de arquitectura con dron, lente 35 mm, luz natural, realista, sin texto, sin personas en primer plano.

## Cuadros clave

| # | Órbita | Obra | Luz |
|---|--------|------|-----|
| K0 | 0° (desde el oriente, mirando al valle) | Lote limpio, excavación, grúa torre amarilla montada, contenedores | Tarde, sol alto y cálido |
| K1 | 72° | Basamento terminado + 6 pisos de estructura en concreto, malla verde arriba | Tarde |
| K2 | 144° | 14 pisos; los 10 de abajo ya con ladrillo y vidrio, los de arriba en concreto con malla verde | Tarde dorada |
| K3 | 216° | 22 pisos, fachada casi completa, grúa en lo alto | Hora dorada |
| K4 | 288° | Torre completa con penthouse; grúa retirada; jardín en el basamento | Atardecer naranja |
| K5 | 360° (= K0) | Torre completa, luces encendidas en ventanas al azar, ciudad iluminada en el valle | Hora azul |

Prompt por cuadro: *biblia visual* + «vista aérea orbitando a {órbita}°, etapa de obra: {obra}, luz: {luz}».

## Tomas (imagen a video)

| Toma | Inicio → fin | Duración | Movimiento |
|------|--------------|----------|------------|
| T0 | K0 → K1 | 3–4 s | órbita lenta a la derecha 72°, la estructura crece |
| T1 | K1 → K2 | 3–4 s | órbita 72°, suben pisos, aparece la fachada |
| T2 | K2 → K3 | 3–4 s | órbita 72°, sube la cámara con el edificio |
| T3 | K3 → K4 | 3–4 s | órbita 72°, se completa el penthouse, sale la grúa |
| T4 | K4 → K5 | 3–4 s | órbita 72°, cae la noche, se encienden las luces |

Pedir: cámara estable, sin cortes, sin zoom brusco, el edificio en el centro del cuadro, 16:9, 1080p o más, 24–30 fps.

## Codificación (obligatoria para que el scroll sea fluido)

Cuadros clave cada 12 cuadros y sin cuadros B, para que el navegador salte rápido a cualquier cuadro:

```bash
ffmpeg -i T0.mp4 -vf "scale=1920:1080" -c:v libx264 -preset slow -crf 21 -g 12 -bf 0 -pix_fmt yuv420p -movflags +faststart -an t0_1080.mp4
ffmpeg -i T0.mp4 -vf "scale=854:480" -c:v libx264 -preset slow -crf 24 -g 12 -bf 0 -pix_fmt yuv420p -movflags +faststart -an t0_480.mp4
ffmpeg -i T0.mp4 -vf "crop=ih*9/16:ih,scale=720:1280" -c:v libx264 -preset slow -crf 24 -g 12 -bf 0 -pix_fmt yuv420p -movflags +faststart -an t0_v.mp4
```

Luego, en `manifest.json`, cada toma lleva `src`, `dur` (segundos) y `bytes` (para la barra de carga), en tres listas:
`escritorio`, `movil` y `vertical`.
