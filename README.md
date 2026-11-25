# Integrar el museo de Matemática y Física en un campus

Este módulo abre el museo de Matemática y Física desde una puerta, biblioteca u otro punto del campus virtual. Al cerrar la visita, vuelve a la escena del campus y recupera el foco del elemento que la abrió.

## Uso

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

Sustituye la URL de ejemplo por la del museo. Si el campus está en línea, la dirección del museo también debe poder abrirse desde los equipos de los estudiantes.

- `entrar: false` abre el álbum con la portada, las actividades y el archivo.
- `entrar: true` abre el recorrido de inmediato. Puedes indicar una `sala` (`promociones`, `tradiciones`, `universidad` o `campo`) o una `pieza` como `congreso`. Si se indica una pieza válida, esta determina la sala.
- El módulo devuelve `{ iframe, cerrar }`. Usa `cerrar()` si el campus necesita retirar la visita por su cuenta.

[ejemplo.html](./ejemplo.html) permite probar el flujo desde un servidor estático. Sírvelo por HTTP en localhost o por HTTPS, ábrelo e introduce la dirección del museo. El módulo se comunica con la visita y recibe la solicitud de regreso a la escena del campus.
