# Gangstar · Crime City (port web personal)

Port para navegador del juego Java (J2ME) de 2006, hecho para jugarlo en PC y Android, con mejoras:

- **Movimiento suave**: la lógica corre a sus 10 ticks/s originales (ahora exactos; antes se atrasaba a ~9) y se dibujan cuadros intermedios interpolados a la frecuencia del monitor (60, 100, 144 Hz...).
- **Pantalla panorámica**: además de la original (240×320) se puede elegir Ancha (384), Panorámica (432) o Cine 16:9 (576 × 320): se ve más ciudad a los costados. El HUD y los menús conservan su diseño original.
- **Velocidad del juego**: Normal, ×1,25 o ×1,5 (todo se acelera parejo, relojes de misión incluidos).
- **Controles**: WASD/flechas con diagonales en PC, control de consola, joystick táctil o skin de celular clásico.
- **Guardado en cualquier momento** (3 ranuras, F5/F9, exportable entre dispositivos).
- **Trucos**: salud y munición infinitas, sin policía, dinero.
- **Español / English**.
- Instalable como app (PWA) y funciona sin conexión.

## Este repositorio no contiene el juego

Acá solo está el motor (un intérprete de Java/MIDP escrito en JavaScript) y la interfaz.
El juego y la traducción van en un archivo de datos privado (`gangstar-datos.zip`) que se carga
una vez en cada dispositivo y queda guardado solo ahí (IndexedDB). Nunca se sube a ningún servidor.

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/jvm.js` | Intérprete de bytecode Java (CLDC) |
| `src/midp.js` | APIs del celular: pantalla, imágenes, teclas, sonido, guardado (RMS) |
| `src/audio.js` | Sintetizador MIDI + WAV con Web Audio |
| `src/gangstar.js` | Capa específica del juego: cuadros intermedios, ritmo de los ticks, velocidad, trucos |
| `src/wide.js` | Pantalla panorámica: reescribe las constantes de tamaño de pantalla del juego al cargarlo, acomoda el HUD y centra los menús |
| `src/savestate.js` | Guardado de estado completo |
| `src/shell.html` | Interfaz, controles, menús |
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

Uso personal. Gangstar es una marca de Gameloft.
