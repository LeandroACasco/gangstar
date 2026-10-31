# Gangstar · Crime City (port web personal)

Port para navegador del juego Java (J2ME) de 2006, hecho para jugarlo en PC y Android, con mejoras:

- **60 fps**: la lógica corre a sus 10 ticks/s originales y se dibujan cuadros intermedios interpolados.
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
| `src/gangstar.js` | Capa específica del juego: 60 fps, trucos |
| `src/savestate.js` | Guardado de estado completo |
| `src/shell.html` | Interfaz, controles, menús |
| `docs/` | App compilada que publica GitHub Pages |

## Compilar

```bash
python3 build.py app   # genera docs/ (y el paquete de datos privado si tenés game/gangstar.jar)
python3 build.py       # genera dist/gangstar.html, versión de un solo archivo con el juego adentro
```

Uso personal. Gangstar es una marca de Gameloft.
