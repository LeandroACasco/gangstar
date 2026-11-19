# Gangstar · Crime City (port web personal)

Port para navegador del juego Java (J2ME) de 2006, hecho para jugarlo en PC y Android, con mejoras:

- **Movimiento suave**: la lógica corre a sus 10 ticks/s originales (ahora exactos; antes se atrasaba a ~9) y se dibujan cuadros intermedios interpolados a la frecuencia del monitor (60, 100, 144 Hz...).
- **Pantalla panorámica**: además de la original (240×320) se puede elegir Ancha (384), Panorámica (432) o Cine 16:9 (576 × 320), hasta 720, o **Automática** (se adapta a tu pantalla): se ve más ciudad a los costados. El HUD y los menús conservan su diseño original.
- **Velocidad del juego**: Normal, ×1,25 o ×1,5 (todo se acelera parejo, relojes de misión incluidos).
- **Controles**: WASD/flechas con diagonales en PC, control de consola, joystick táctil o skin de celular clásico.
- **Guardado en cualquier momento** (3 ranuras, F5/F9, exportable entre dispositivos), más **guardado automático** y el aviso «¿Seguir donde estabas?» al abrir.
- **Manejo asistido**: opción para seguir acelerando en las curvas; en modo experto se puede acelerar y doblar a la vez.
- **Menús al estilo del sitio de Gameloft**: cuatro pestañas (Controles · Pantalla · Juego · Partida), tema ciruela/atardecer/dorado y menús táctiles. El arte (logo, banderas, banner) es opcional y privado (ver abajo).
- **Contador de FPS** y vibración opcional en el celular.
- **Vista satelital**: el mapa de la pausa y el radar muestran la ciudad dibujada con las baldosas reales del juego (se puede apagar en el menú o con el botón 🛰 del mapa).
- **Trucos**: salud y munición infinitas, sin policía, dinero.
- **Español / English**.
- Instalable como app (PWA) y funciona sin conexión.

## Este repositorio no contiene el juego

Acá solo está el motor (un intérprete de Java/MIDP escrito en JavaScript) y la interfaz.
El juego y la traducción van en un archivo de datos privado (`gangstar-datos.zip`) que se carga
una vez en cada dispositivo y queda guardado solo ahí (IndexedDB). Nunca se sube a ningún servidor.

El arte de los menús (`art/*.webp`: logo, banner, banderas, etc.) tampoco está en el repo (`art/` está en `.gitignore`).
Se carga aparte con **Partida → Datos del juego → 🎨 Cargar arte del menú (.zip)** y queda en IndexedDB junto al paquete
de datos. Sin arte, los menús usan degradados y el título en texto.

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/jvm.js` | Intérprete de bytecode Java (CLDC) |
| `src/midp.js` | APIs del celular: pantalla, imágenes, teclas, sonido, guardado (RMS) |
| `src/inflate.js` | Descompresor (inflate) usado al leer los paquetes |
| `src/art.js` | Tema visual de los menús y carga del arte privado (`Art.theme()`) |
| `src/touchmenu.js` | Menús del juego controlables con el dedo |
| `src/sw.js` | Service worker (la versión se inyecta al compilar) |
| `src/audio.js` | Sintetizador MIDI + WAV con Web Audio |
| `src/gangstar.js` | Capa específica del juego: cuadros intermedios, ritmo de los ticks, velocidad, trucos |
| `src/wide.js` | Pantalla panorámica: reescribe las constantes de tamaño de pantalla del juego al cargarlo, acomoda el HUD y centra los menús |
| `src/savestate.js` | Guardado de estado completo |
| `src/satellite.js` | Vista satelital: dibuja la ciudad entera con las baldosas del juego y la muestra en el mapa y el radar |
| `src/shell.html` | Interfaz, controles, menús |
| `test/` | Pruebas con Playwright (necesitan `dist/gangstar.html` con el juego): `run.js` (pasos por teclas), `feat.js`/`full.js` (funciones), `mobile.js`, `pwa.js`, `save.js`, `smooth.js` (fluidez), `perf.js`/`prof*.js` (rendimiento), `soak.js` (larga duración) |
| `docs/` | App compilada que publica GitHub Pages |

## Compilar

```bash
python3 build.py app   # genera docs/ (y el paquete de datos privado si tenés game/gangstar.jar)
python3 build.py       # genera dist/gangstar.html, versión de un solo archivo con el juego adentro
```

Para probar otro ancho sin tocar el menú: `dist/gangstar.html?w=432`. Las pruebas de `test/` aceptan `GQ='?w=432'`.

## Cómo funciona la pantalla panorámica

El juego tiene el tamaño 240×320 escrito como constantes en su código (`sipush 240`, `bipush 120`, el búfer
de baldosas del mapa de 264×312, los mismos valores en punto fijo 24.8...). `wide.js` recorre el bytecode de
la clase `d` al cargarla y cambia esas constantes por un opcode propio del intérprete (`0xcb`) que lee el valor
de `VM.K`; el largo de las instrucciones no cambia, así que saltos y guardados siguen valiendo. Hay excepciones
por método (el descompresor, colores en `setColor`, dos temporizadores que valen 120, ids de textos) y los
menús se dibujan con los valores originales, corridos al centro. El ancho tiene que ser múltiplo de 24 (las
baldosas del mapa).

## Límites conocidos

- La lógica mueve todo una cantidad fija por tick: más de 10 ticks/s significa juego acelerado.
- Los guardados rápidos (ranuras) solo cargan en el mismo ancho en que se hicieron.
- Con respuesta rápida, una frenada en seco puede mostrar hasta medio paso de «pasada».

Uso personal. Gangstar es una marca de Gameloft.
