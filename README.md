# Museo de Matemática y Física

Este es el repositorio público de la aplicación completa del museo. Incluye la galería web y el recorrido 3D, la bandeja de aportes, el servidor de archivo y la integración con el campus.

- [Código completo del museo](./museo/)
- [Conector para el campus](./campus-portal.js)
- [Ejemplo de integración](./ejemplo.html)
- [Documentación del servidor y del despliegue](./museo/README.md)

## Probar la aplicación completa

Desde la raíz del repositorio, con Python 3.12 o posterior:

```sh
cd museo
python -m pip install -r aportes/requirements.txt
python aportes/servidor.py
```

Abre [el museo local](http://127.0.0.1:8752/), [la entrada del campus](http://127.0.0.1:8752/?modo=campus) o [la bandeja de edición](http://127.0.0.1:8753/). Esta copia pública incluye imágenes y videos de demostración. El servidor inicializa la base local para los aportes que importes.

Para recompilar las escenas después de modificar el código JavaScript, ejecuta esto en el directorio del museo:

```sh
npm ci
npm run build
```

Los recursos de demostración ya vienen en la copia pública. Puedes regenerar los que falten ejecutando `python generar_demo.py` con Pillow y FFmpeg instalados. El script conserva los archivos que ya existan.

## Incorporar el museo al campus

1. Copia [campus-portal.js](./campus-portal.js) al proyecto del campus.
2. Configura una URL del museo accesible desde el campus. En producción, usa HTTPS en los dos sitios. El ejemplo también admite localhost para desarrollo.
3. Llama a `abrirMuseo` cuando el estudiante interactúe con la puerta. El contenedor debe tener ancho y alto. El campus puede pausar sus controles mientras ese contenedor está visible.

```html
<button type="button" id="puerta-museo">Entrar al museo</button>
<div id="vista-museo" style="position:fixed;inset:0;z-index:1000" hidden></div>

<script type="module">
  import { abrirMuseo } from './campus-portal.js';

  const puerta = document.querySelector('#puerta-museo');
  const vista = document.querySelector('#vista-museo');

  puerta.addEventListener('click', () => {
    if (!vista.hidden) return;
    vista.hidden = false;
    try {
      abrirMuseo({
        contenedor: vista,
        urlMuseo: 'https://museo.example.org/',
        entrar: false,
        alCerrar() { vista.hidden = true; },
      });
    } catch (error) {
      vista.hidden = true;
      throw error;
    }
  });
</script>
```

Sustituye la URL de ejemplo por la del museo. Para mostrar el archivo real en el campus, usa la URL completa de acceso de Vercel que te comparta el responsable del museo. La visita alojada se publica en modo de consulta. La bandeja local permite preparar nuevas fotos para la siguiente publicación.

- `entrar: false` abre el álbum con la portada, las actividades y el archivo.
- `entrar: true` abre el recorrido de inmediato. Puedes indicar una `sala` (`promociones`, `tradiciones`, `universidad` o `campo`) o una `pieza` como `congreso`. Si se indica una pieza válida, esta determina la sala.
- El módulo devuelve `{ iframe, cerrar }`. Usa `cerrar()` si el campus necesita retirar la visita por su cuenta.

[ejemplo.html](./ejemplo.html) permite probar el flujo desde un servidor estático. Sírvelo por HTTP en localhost o por HTTPS, ábrelo e introduce la dirección del museo. El módulo se comunica con la visita y recibe la solicitud de regreso a la escena del campus.
