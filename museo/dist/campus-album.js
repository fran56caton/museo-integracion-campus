'use strict';

window.mountMuseumAlbum = ({
  pieces, byPiece, onOpen, onEnter, onCollection, isReduced, observeImages,
}) => {
  const byId = id => document.getElementById(id);
  const stage = byId('campus-stage');
  const photos = byId('campus-images');
  const strip = byId('campus-filmstrip');
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const button = className => {
    const control = make('button', className);
    control.type = 'button';
    return control;
  };
  const photo = (piece, useThumbnail, lazy) => {
    const image = make('img');
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.loading = lazy ? 'lazy' : 'eager';
    image.src = useThumbnail ? piece.thumb : piece.image;
    return image;
  };

  const chapters = [
    { id: 'danza', label: 'Danza', position: 'center 58%' },
    { id: 'promo-1992', label: 'Promoción 1992', position: 'center 66%' },
    { id: 'desfile', label: 'Desfile', position: 'center 57%' },
    { id: 'docentes-premiacion', label: 'Premiación', position: 'center 55%' },
    { id: 'congreso', label: 'Congreso', position: 'center 55%' },
    { id: 'grupo-encuentro', label: 'Pillco Mozo', position: 'center 64%' },
  ].flatMap(chapter => {
    const piece = byPiece.get(chapter.id);
    return piece ? [{ ...chapter, piece }] : [];
  });
  const chapterPieces = chapters.map(chapter => chapter.piece);
  const choices = chapters.map((chapter, index) => {
    const control = button('campus-slide');
    control.setAttribute('aria-label', chapter.piece.title);
    control.dataset.albumSlide = String(index);
    control.append(photo(chapter.piece, true, false), make('span', '', chapter.label));
    strip.append(control);
    return control;
  });
  let active = 0;
  let requested = 0;
  let request = 0;
  let gesture;

  function updateLabel() {
    const chapter = chapters[active];
    byId('campus-hero-category').textContent = chapter.piece.collection;
    byId('campus-hero-title').textContent = chapter.piece.title;
    for (const [i, control] of choices.entries()) {
      control.setAttribute('aria-current', String(i === active));
      control.tabIndex = i === active ? 0 : -1;
    }
    const selected = choices[active];
    const first = selected.offsetLeft;
    const last = first + selected.offsetWidth;
    if (first < strip.scrollLeft) strip.scrollLeft = first;
    else if (last > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = last - strip.clientWidth;
  }

  async function show(index, instant = false) {
    const next = ((index % chapters.length) + chapters.length) % chapters.length;
    const ticket = ++request;
    requested = next;
    byId('campus-slide-status').textContent = '';
    if (next === active) {
      stage.removeAttribute('aria-busy');
      return;
    }
    const chapter = chapters[next];
    const incoming = photo(chapter.piece, false, false);
    incoming.style.objectPosition = chapter.position;
    stage.setAttribute('aria-busy', 'true');
    try {
      await incoming.decode();
    } catch {
      incoming.src = chapter.piece.thumb;
      try {
        await incoming.decode();
      } catch {
        if (ticket !== request) return;
        requested = active;
        stage.removeAttribute('aria-busy');
        byId('campus-slide-status').textContent = 'La foto no se pudo cargar. Puedes seguir recorriendo el álbum.';
        return;
      }
    }
    if (ticket !== request) return;
    active = next;
    const previous = photos.lastElementChild;
    for (const animation of previous.getAnimations()) animation.cancel();
    if (instant || isReduced()) {
      photos.replaceChildren(incoming);
    } else {
      photos.replaceChildren(previous, incoming);
      const animation = incoming.animate([
        { opacity: .06, transform: 'scale(1.045)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 550, easing: 'cubic-bezier(.23,1,.32,1)' });
      animation.onfinish = () => previous.remove();
    }
    stage.removeAttribute('aria-busy');
    updateLabel();
  }

  function stageAction(control, action) {
    let touch;
    let handledAt = -Infinity;
    control.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' && event.isPrimary) {
        touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    });
    control.addEventListener('pointercancel', () => { touch = undefined; });
    control.addEventListener('pointerup', event => {
      if (event.pointerId !== touch?.id) return;
      const distance = Math.hypot(event.clientX - touch.x, event.clientY - touch.y);
      touch = undefined;
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      if (distance > 12 || !control.contains(hit)) return;
      handledAt = performance.now();
      action(control, false);
    });
    control.addEventListener('click', event => {
      if (event.detail && event.pointerType !== 'mouse' && performance.now() - handledAt < 650) return;
      action(control, !event.detail);
    });
  }

  byId('campus-slide-prev').addEventListener('click', event => show(requested - 1, !event.detail));
  byId('campus-slide-next').addEventListener('click', event => show(requested + 1, !event.detail));
  stageAction(byId('campus-hero-open'), control => onOpen(chapterPieces, active, control));
  stageAction(byId('campus-enter'), onEnter);
  strip.addEventListener('click', event => {
    const choice = event.target.closest('[data-album-slide]');
    if (choice) show(Number(choice.dataset.albumSlide), !event.detail);
  });
  function keyboard(event) {
    const destinations = { ArrowLeft: requested - 1, ArrowRight: requested + 1, Home: 0, End: chapters.length - 1 };
    if (!Object.hasOwn(destinations, event.key)) return;
    if (event.currentTarget === stage && event.target !== stage) return;
    event.preventDefault();
    const index = destinations[event.key];
    show(index, true);
    if (event.currentTarget === strip) choices[(index + chapters.length) % chapters.length].focus({ preventScroll: true });
  }
  stage.addEventListener('keydown', keyboard);
  strip.addEventListener('keydown', keyboard);
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button,a')) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointermove', event => {
    if (event.pointerId !== gesture?.id || gesture.captured) return;
    const dx = Math.abs(event.clientX - gesture.x);
    const dy = Math.abs(event.clientY - gesture.y);
    if (dx > 12 && dx > dy) {
      gesture.captured = true;
      if (event.pointerType !== 'touch') stage.setPointerCapture(event.pointerId);
    }
  });
  stage.addEventListener('pointercancel', () => { gesture = undefined; });
  stage.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = undefined;
    if (Math.abs(dx) >= 46 && Math.abs(dx) > Math.abs(dy) * 1.45) show(requested - Math.sign(dx));
  });

  const collections = new Map();
  for (const piece of pieces) {
    if (!collections.has(piece.collection)) collections.set(piece.collection, []);
    collections.get(piece.collection).push(piece);
  }
  const activities = [
    ['Danza', 'danza'], ['Desfiles', 'desfile'], ['Deportes', 'docentes-premiacion'],
    ['Congresos', 'congreso'], ['Aniversario de la carrera', 'aniversario-carrera'], ['Pillco Mozo', 'grupo-encuentro'],
  ];
  const mainGrid = byId('campus-activity-grid');
  const countLabel = items => items.length === 1 ? '1 recuerdo' : items.length + ' recuerdos';
  for (const [name, coverId] of activities) {
    const items = collections.get(name);
    if (!items?.length) continue;
    const cover = items.find(piece => piece.id === coverId && !piece.reference)
      ?? items.find(piece => !piece.reference && !piece.video) ?? items[0];
    const control = button('campus-activity');
    const media = make('span', 'campus-activity-photo');
    media.style.backgroundImage = 'url(' + JSON.stringify(cover.thumb) + ')';
    media.append(photo(cover, false, true));
    if (cover.reference) media.append(make('span', 'campus-reference', 'Imagen de referencia'));
    const label = make('span', 'campus-activity-label');
    const text = make('span');
    text.append(make('strong', '', name), make('small', '', countLabel(items)));
    const arrow = make('span', 'icon-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    label.append(text, arrow);
    control.append(media, label);
    control.addEventListener('click', () => onCollection(name));
    mainGrid.append(control);
  }
  const excluded = new Set(activities.map(([name]) => name));
  const extra = [...collections].filter(([name]) => !excluded.has(name))
    .sort(([a], [b]) => a.localeCompare(b, 'es'));
  for (const [name, items] of extra) {
    const control = button('campus-index-chip');
    control.append(make('span', '', name), make('small', '', String(items.length)));
    control.addEventListener('click', () => onCollection(name));
    byId('campus-activity-index').append(control);
  }
  byId('campus-more-activities').hidden = !extra.length;
  photos.firstElementChild.style.objectPosition = chapters[0].position;
  updateLabel();
  observeImages(mainGrid);

  return {
    get current() { return chapterPieces[active]; },
    showPiece(id) {
      const index = chapters.findIndex(chapter => chapter.id === id);
      if (index >= 0) show(index, true);
    },
  };
};
