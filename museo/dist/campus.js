'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('modo') !== 'campus') return;

  function trustedOrigin(value) {
    try {
      const origin = new URL(value);
      const supported = origin.protocol === 'https:' ||
        (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
      return supported && !origin.username && !origin.password &&
        origin.pathname === '/' && !origin.search && !origin.hash ? origin.origin : '';
    } catch {
      return '';
    }
  }

  const embedded = window.parent !== window;
  const origin = embedded ? trustedOrigin(params.get('origenCampus') ?? location.origin) : '';
  const entry = document.getElementById('entrada-campus');
  const back = document.getElementById('campus-back');
  const id = value => typeof value === 'string' && /^[a-z0-9-]{1,110}$/.test(value) ? value : '';

  function notify(type) {
    if (origin) window.parent.postMessage({ type, version: 1 }, origin);
  }

  document.body.dataset.campus = embedded ? 'embedded' : 'demo';
  document.querySelector('a.skip').href = '#entrada-campus';
  document.title = 'Lo que vivimos · Matemática y Física';
  entry.hidden = false;
  if (origin) {
    document.getElementById('campus-back-label').textContent = 'Volver al campus';
    back.addEventListener('click', event => {
      event.preventDefault();
      notify('museo:salir');
    });
    window.addEventListener('message', event => {
      const data = event.data;
      if (event.source !== window.parent || event.origin !== origin ||
        data?.type !== 'museo:entrada' || data.version !== 1) return;
      window.dispatchEvent(new CustomEvent('museo-campus-entry', {
        detail: { roomId: id(data.sala), pieceId: id(data.pieza), enter: data.entrar === true },
      }));
    });
  }

  window.museumCampus = Object.freeze({
    embedded: Boolean(origin),
    ready: () => notify('museo:listo'),
    exit: () => notify('museo:salir'),
  });
})();
