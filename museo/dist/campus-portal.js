/**
 * Monta el museo en una vista del campus y devuelve el foco a su puerta al cerrar.
 * El campus decide cuándo mostrar el contenedor y cómo retomar su propia escena.
 */
export function abrirMuseo({
  contenedor, urlMuseo, sala, pieza, entrar = true, alCerrar,
}) {
  if (!(contenedor instanceof HTMLElement)) throw new TypeError('Selecciona un contenedor del campus.');

  const url = new URL(urlMuseo, window.location.href);
  const supported = address => address.protocol === 'https:' ||
    (address.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname));
  if (!supported(url) || !supported(window.location) || url.username || url.password) {
    throw new TypeError('Sirve el campus y el museo por HTTPS, o usa localhost para el desarrollo.');
  }

  url.searchParams.set('modo', 'campus');
  url.searchParams.set('origenCampus', window.location.origin);
  url.hash = '';
  const trigger = document.activeElement;
  const iframe = document.createElement('iframe');
  iframe.title = 'Galería de recuerdos de Matemática y Física';
  iframe.src = url.href;
  iframe.allow = 'clipboard-write';
  iframe.referrerPolicy = 'no-referrer';
  iframe.style.cssText = 'display:block;width:100%;height:100%;border:0';
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('message', receive);
    iframe.remove();
    alCerrar?.();
    if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  function receive(event) {
    if (event.source !== iframe.contentWindow || event.origin !== url.origin || event.data?.version !== 1) return;
    if (event.data.type === 'museo:listo') {
      iframe.contentWindow.postMessage({ type: 'museo:entrada', version: 1, sala, pieza, entrar }, url.origin);
    } else if (event.data.type === 'museo:salir') {
      close();
    }
  }

  window.addEventListener('message', receive);
  contenedor.append(iframe);
  return { iframe, cerrar: close };
}
