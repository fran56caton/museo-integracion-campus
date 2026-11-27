# Matemática y Física

Museo virtual de la Escuela Profesional de Matemática y Física de la Universidad Nacional Hermilio Valdizán, en Huánuco, Perú.

## Visitar el museo

Abre `dist/index.html` en un navegador moderno o sirve `dist/` con `python -m http.server 8740 --directory dist`. El museo funciona con sus archivos locales y conserva un recorrido alternativo cuando el navegador no dispone de WebGL 2.

- Explora los cuadros de portada con un gesto horizontal, las flechas o el selector de posición. Pulsa el cuadro central para abrir la ficha, o elige **Entrar a la sala** para verlo dentro del recorrido 3D.
- Usa las miniaturas, las flechas o el gesto horizontal para recorrer los cuadros de una sala.
- En la galería de promociones, elige un año para ir directamente a su foto.
- Selecciona un cuadro para acercarte y vuelve a pulsarlo para abrir su ficha.
- La visita guiada tiene cuatro paradas que puedes recorrer a tu ritmo. Las fichas del desfile, el congreso y la premiación tienen detalles interactivos. La ficha de los docentes campeones reúne la foto del equipo y la entrega del trofeo.
- Usa **Copiar enlace** para abrir una ficha directamente en la misma dirección del museo.
- El archivo permite buscar por año, actividad o lugar y filtrar fotografías y videos.
- Guarda recuerdos desde las fichas y encuéntralos en **Mi selección**. El navegador guarda esta selección en el dispositivo.

Las colecciones sin una fotografía identificada muestran una imagen rotulada como **Imagen de referencia**. La procedencia de las piezas figura en su ficha.

## Fotos aportadas por WhatsApp

El servicio de aportes incorpora fotos al museo mediante una bandeja privada de revisión. Recibe reenvíos enviados a un número de WhatsApp Cloud API configurado y admite importar fotos localmente.

```sh
python -m pip install -r aportes/requirements.txt
python aportes/servidor.py
```

- Museo con aportes aprobados en `http://127.0.0.1:8752/` y bandeja local en `http://127.0.0.1:8753/`.
- Importa fotos en JPG, PNG o WebP. El sistema sugiere una categoría según el pie de foto o etiquetas como `#danza`, `#desfile`, `#futbol` y `#cachimbeada`. Si hay varias actividades o faltan pistas, deja la categoría pendiente.
- Completa la ficha y confirma la autorización en la bandeja. Al aprobar, la foto aparece en el archivo y en su sala. Si la retiras, vuelve a revisión.
- Los aportes se guardan en `.museo-data/`. La base conserva las miniaturas y las versiones web, sin los metadatos del archivo original. El historial del chat y los números de teléfono quedan fuera del catálogo. Abrir el HTML directamente continúa mostrando la colección original.

### Conservar el grupo actual sin usar Meta

**Importación por lote.** En WhatsApp, abre el grupo, elige **Exportar chat** e incluye los archivos multimedia. Guarda el ZIP y selecciónalo en la bandeja. Si Android entrega el texto y las fotos como archivos separados, crea un ZIP con ellos o selecciona juntas las fotos en la bandeja. Los ZIP se procesan localmente, de hasta 80 MB cada uno. Solo se usan los pies de foto que se pueden asociar a un adjunto. La bandeja no guarda el archivo del chat ni las conversaciones independientes. Puedes marcar fotos de una misma actividad en **Incluir esta foto en el lote** y publicarlas juntas.

**Para cuentas de uso personal.** Sincroniza exclusivamente una carpeta de exportaciones elegidas del grupo con este equipo y activa el monitor de ZIP. El monitor importa automáticamente cada exportación cuando termina de copiarse. Las fotos sueltas de esa carpeta quedan fuera. Conviene usar una carpeta de destino nueva, por ejemplo:

```sh
python aportes/servidor.py --watch-zip-folder .museo-data/lotes-whatsapp
```

**Recepción automática desde Android.** Usa una cuenta normal de WhatsApp dedicada al museo, incorporada al grupo y sin otros chats con fotos. Activa la descarga automática de fotos en el teléfono y sincroniza en un solo sentido la carpeta de imágenes con una carpeta dedicada en este equipo. El inicio de la sincronización depende de la comunicación entre el teléfono y el equipo. El museo puede vigilar esa carpeta en Python 3.12 o posterior:

```sh
python aportes/servidor.py --watch-folder .museo-data/entrada
```

El monitor incorpora fotos a revisión cuando terminan de copiarse y deduplica al reiniciar. WhatsApp guarda las imágenes en una carpeta compartida y la sincronización de archivos por sí sola no identifica al grupo, por eso el origen debe estar aislado de los chats personales. Las fotos sincronizadas no conservan su pie de WhatsApp. Si la carpeta está organizada en subcarpetas `danza`, `desfile` o `futbol`, el nombre de la subcarpeta sirve como sugerencia de actividad.

[Exportar un chat en WhatsApp](https://faq.whatsapp.com/1180414079177245/) · [Configurar descarga automática](https://faq.whatsapp.com/366146522333492/) · [Ejemplo de sincronización programada](https://foldersync.io/docs/help/scheduling/)

**Revisión de fotos históricas.** El museo compara los aportes con las fotos de la exposición y con los aportes ya aprobados. Omite archivos idénticos y muestra las coincidencias visuales probables en **Posible foto repetida**, para que un cambio de compresión o de resolución no pase desapercibido. Las coincidencias visuales quedan a revisión.

### Conectar WhatsApp Cloud API

Configura estas variables de entorno en el servicio:

| Variable | Valor |
| --- | --- |
| `WHATSAPP_TOKEN` | Token de Meta con el permiso `whatsapp_business_messaging`. |
| `WHATSAPP_APP_SECRET` | Secreto de la aplicación de Meta para validar la firma de cada entrega. |
| `WHATSAPP_VERIFY_TOKEN` | Valor elegido para verificar el endpoint en Meta. |
| `WHATSAPP_PHONE_ID` | ID del número receptor en Meta. |
| `WHATSAPP_GRAPH_VERSION` | Versión de Graph API configurada para la aplicación. |
| `WHATSAPP_SENDERS` | Números internacionales sin `+` o IDs de usuario Business de los remitentes autorizados, separados por comas. |
| `WHATSAPP_GROUPS` | Opcional. IDs de grupos creados mediante la API oficial y autorizados para aportar, separados por comas. |

Meta debe poder llegar a `/webhook/whatsapp` por HTTPS. Expón esa ruta mediante un proxy y suscribe el número receptor al campo `messages`. Mantén la bandeja en una interfaz local y aplica al museo el acceso privado antes de alojar los aportes. El servicio usa almacenamiento persistente y requiere que el proceso esté en ejecución para recibir fotos. La publicación estática de `dist/` no ejecuta el receptor.

Para mantener un grupo normal de WhatsApp, reenvía al número receptor solo las fotos elegidas. [Documentación de Groups API de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/) · [Cómo reenviar contenido multimedia](https://faq.whatsapp.com/982833196228708/)

## Desarrollo

```sh
npm ci
npm run build
```

`scene.js` contiene la arquitectura, iluminación, enfoque y selección de cuadros para Three.js. `dist/museo.js` controla portada, navegación, visor y recorrido. `dist/catalogo.js` es el catálogo. El sitio es estático y todos los archivos se sirven desde `dist/`, con rutas relativas.

## Referencias de diseño

- [Art Museum](https://github.com/adrianwongstudio/art-museum), por la cámara con puntos de visita y el catálogo accesible.
- [Virtual Gallery](https://github.com/blueice9191/virtual-gallery), por la señalización espacial y el recorrido guiado.
- [Painted Paths](https://www.studio10b.com/projects/art-gallery/process/), por la integración entre sala y fichas de obra.

El código de la exposición, su composición visual y la arquitectura de sus salas son propios de este proyecto. Three.js se distribuye junto a su aviso de licencia en `dist/spatial.js.LEGAL.txt`.

## Integrar el museo en otro campus

El museo tiene una entrada independiente en [modo campus](http://127.0.0.1:8752/?modo=campus), con un álbum interactivo, acceso por actividad, promociones y el archivo completo. El campus conserva su escena, sesión y avatar mientras el estudiante visita la galería.

### Integración web

1. Sirve el museo y el campus por HTTPS. En desarrollo puedes probar ambos desde localhost o 127.0.0.1.
2. Copia [campus-portal.js](dist/campus-portal.js) a tu proyecto. El módulo abre el museo en un iframe y devuelve el foco al elemento que lo abrió al cerrar.
3. Desde la interacción de tu puerta, biblioteca o portal, llama a `abrirMuseo`. Dale al contenedor un ancho y alto explícitos. El campus puede pausar sus controles mientras ese contenedor está visible.

```html
<button id="puerta-museo">Entrar al museo</button>
<div id="vista-museo" style="position: fixed; inset: 0; z-index: 1000" hidden></div>

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
        urlMuseo: 'http://127.0.0.1:8752/',
        sala: 'tradiciones',
        entrar: false,
        alCerrar: () => { vista.hidden = true; },
      });
    } catch (error) {
      vista.hidden = true;
      throw error;
    }
  });
</script>
```

Con `entrar: false` el estudiante empieza en el álbum y elige cuándo entrar al recorrido. Usa `entrar: true` para llevarlo directamente a la sala. Puedes pasar `sala` con los valores `promociones`, `tradiciones`, `universidad` o `campo`. Para llegar directamente al cuadro de un recuerdo, pasa su ID en `pieza`, por ejemplo `'congreso'`. El recuerdo determina su sala. Sustituye la URL de desarrollo por la URL del museo en tu despliegue.

Si tu campus usa una vista web propia, puedes abrir la URL con `?modo=campus`. El puente entre ventanas requiere un iframe. Para implementarlo desde otro entorno, añade `origenCampus` con el origen exacto del campus y usa estos mensajes de versión 1.

| Dirección | Tipo | Datos |
|---|---|---|
| Museo → campus | `museo:listo` | El museo puede recibir la entrada |
| Campus → museo | `museo:entrada` | `sala`, `pieza` y `entrar` son opcionales |
| Museo → campus | `museo:salir` | El estudiante ha pedido regresar al campus |

El módulo verifica la ventana emisora y su origen. La integración solo intercambia los identificadores de la sala o pieza y la orden de apertura. Los aportes del archivo histórico requieren servir el museo con el backend de aportes y su base de datos.

## Actualizar el museo alojado en Vercel

La visita en Vercel consulta una copia de solo lectura de las fichas aprobadas. El catálogo incluye los videos de la tabla local `published_videos`. Cada video usa su ID como nombre para el MP4, el póster WebP y la miniatura `-mini.webp` en `dist/recientes/`. Conserva esa carpeta y la base local al preparar otra publicación. La bandeja se usa en la computadora para aprobar nuevas fotos. Tras los cambios, vuelve a preparar y desplegar la visita.

```powershell
python aportes/preparar_vercel.py
Push-Location .museo-data/vercel-release
npx vercel deploy --prebuilt --prod
Pop-Location
```

La primera vez, vincula ese directorio al proyecto de Vercel con `npx vercel link`. Los archivos generados se guardan en `.museo-data/`. El enlace privado termina en `/visita/<llave>/`. Usa el enlace completo como `urlMuseo` en el campus y compártelo con quienes tengan permiso de ver el archivo. La llave se guarda en `.museo-data/vercel-access.key` y se reutiliza al volver a publicar.
