'use strict';

const { rooms, pieces: originalPieces, pending } = window.MUSEUM;
const contributions = window.MUSEUM_APORTES ?? [];
const illustratedCollections = new Set(contributions.map(piece => piece.collection));
const pieces = [...contributions, ...originalPieces.filter(piece => !piece.reference || !illustratedCollections.has(piece.collection))];
const referenceReplacements = new Map(originalPieces
  .filter(piece => piece.reference && illustratedCollections.has(piece.collection))
  .map(piece => [piece.id, contributions.find(item => item.collection === piece.collection)]));
const eventDateFormat = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' });
const $ = id => document.getElementById(id);
const campus = window.museumCampus;
const byPiece = new Map(pieces.map(piece => [piece.id, piece]));
const byRoom = new Map(rooms.map(room => [room.id, room]));
const byRoomPieces = new Map(rooms.map(room => [room.id, pieces.filter(piece => piece.room === room.id)]));
const promotionPieces = byRoomPieces.get('promociones');
promotionPieces.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
const campusPieces = byRoomPieces.get('universidad');
const ceremony = campusPieces.findIndex(piece => piece.id === 'docentes-premiacion');
const team = campusPieces.findIndex(piece => piece.id === 'docentes-equipo');
campusPieces.splice(team + 1, 0, ...campusPieces.splice(ceremony, 1));
const reducedPreference = matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = 'cubic-bezier(.23,1,.32,1)';
const easeInOut = 'cubic-bezier(.77,0,.175,1)';
const guideStops = [
  { id: 'desfile', title: 'La carrera en las calles', note: 'Acércate al estandarte que sostiene la delegación de Matemática y Física.' },
  { id: 'congreso', title: 'De Huánuco a Huancayo', note: 'Mira las credenciales y los cuadernos que muestra la delegación en el XI Congreso.' },
  { id: 'docentes-premiacion', title: 'De la cancha al trofeo', note: 'Abre la pieza para alternar entre la foto del equipo docente y la de la premiación.' },
  { id: 'pasacalle', title: 'El aniversario en movimiento', note: 'Reproduce el video del pasacalle por el 65.º aniversario de la Facultad de Ciencias de la Educación.' },
];
const guidedPieces = guideStops.map(stop => byPiece.get(stop.id));
const details = {
  desfile: { label: 'Ver el estandarte', note: 'El estandarte identifica a la UNHEVAL, a la Facultad de Ciencias de la Educación y a la Escuela Profesional de Matemática y Física.', point: [42, 64] },
  congreso: { label: 'Ver materiales del congreso', note: 'En las credenciales y los cuadernos se distingue el número XI, correspondiente a la edición del congreso en Huancayo.', point: [46, 54] },
  'docentes-premiacion': { label: 'Ver el trofeo', note: 'En la premiación, el equipo docente levanta el trofeo frente a la pancarta de las Olimpiadas Deportivas UNHEVAL 2026.', point: [50, 30] },
};
const teamStory = [
  { id: 'docentes-equipo', label: 'En la cancha' },
  { id: 'docentes-premiacion', label: 'La premiación' },
];

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function button(className, content) {
  const control = element('button', className, content);
  control.type = 'button';
  return control;
}

function photo(piece, thumbnail = false) {
  const img = element('img');
  img.src = thumbnail ? piece.thumb : piece.image;
  img.alt = thumbnail ? '' : piece.alt;
  img.decoding = 'async';
  if (thumbnail) img.loading = 'lazy';
  return img;
}

function cardImage(piece, label, className) {
  const wrapper = element('span', 'card-photo');
  wrapper.append(photo(piece, true));
  if (label) wrapper.append(element('span', className, label));
  return wrapper;
}

const revealObserver = new IntersectionObserver(entries => {
  for (const { target, intersectionRatio } of entries) {
    if (intersectionRatio < .24) continue;
    revealObserver.unobserve(target);
    const reveal = () => {
      if (motionReduced() || target.closest('button')?.matches(':focus-visible')) return;
      const bounds = target.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= innerHeight) return;
      target.animate([
        { transform: 'scale(1.085)', opacity: .8 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration: 470, easing: easeOut });
    };
    if (target.complete) reveal();
    else target.addEventListener('load', reveal, { once: true });
  }
}, { threshold: .25 });

function revealImages(container) {
  for (const image of container.querySelectorAll('img')) revealObserver.observe(image);
}

const featurePieces = ['danza', 'congreso', 'docentes-premiacion'].map(id => byPiece.get(id));
const featureGrid = $('feature-grid');
for (const piece of featurePieces) {
  const control = button('feature-card');
  control.dataset.memory = piece.id;
  const info = element('span', 'feature-caption');
  const arrow = element('span', 'icon-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  info.append(element('span', 'mono', piece.collection), element('strong', '', piece.title), arrow);
  control.append(cardImage(piece), info);
  featureGrid.append(control);
}
revealImages(featureGrid);

const promotionYears = [...new Set(promotionPieces.map(piece => piece.year).filter(Number.isInteger))];
const roomList = $('room-list');
const mapList = $('tour-room-list');
for (const room of rooms) {
  const control = button('room-card');
  const image = cardImage(byPiece.get(room.cover), '↗');
  image.lastChild.setAttribute('aria-hidden', 'true');
  control.dataset.tour = room.id;
  const description = room.id === 'promociones' && promotionYears.length > 1
    ? `Una pared de generaciones, de ${promotionYears[0]} a ${promotionYears.at(-1)}.`
    : room.description;
  control.append(image, element('strong', '', room.title), element('small', '', description));
  roomList.append(control);

  const marker = button('', room.title);
  marker.dataset.tour = room.id;
  mapList.append(marker);
}

const promotions = new Map(promotionPieces.filter(piece => Number.isInteger(piece.year)).map(piece => [piece.year, piece]));
const yearList = $('year-list');
const tourYears = $('tour-year-list');
for (const [year, piece] of promotions) {
  for (const list of [yearList, tourYears]) {
    const control = button('year-stop');
    if (list !== tourYears) control.append(photo(piece, true));
    const label = element('span', '', String(year));
    if (list === yearList) {
      const arrow = element('span', 'icon-arrow');
      arrow.setAttribute('aria-hidden', 'true');
      label.append(arrow);
    }
    control.append(label);
    control.setAttribute('aria-label', `Visitar promoción ${year}`);
    control.dataset.tour = 'promociones';
    control.dataset.pieceTarget = piece.id;
    control.dataset.year = year;
    list.append(control);
  }
}

revealImages(roomList);
revealImages(yearList);

const yearPrev = $('year-prev');
const yearNext = $('year-next');
function syncYearArrows() {
  const end = yearList.scrollWidth - yearList.clientWidth;
  yearPrev.setAttribute('aria-disabled', String(yearList.scrollLeft <= 2));
  yearNext.setAttribute('aria-disabled', String(yearList.scrollLeft >= end - 2));
}
function scrollYears(direction, event) {
  if (event.currentTarget.getAttribute('aria-disabled') === 'true') return;
  yearList.scrollBy({
    left: direction * yearList.clientWidth * .78,
    behavior: event.detail && !motionReduced() ? 'smooth' : 'instant',
  });
}
yearPrev.addEventListener('click', event => scrollYears(-1, event));
yearNext.addEventListener('click', event => scrollYears(1, event));
yearList.addEventListener('scroll', syncYearArrows, { passive: true });
new ResizeObserver(syncYearArrows).observe(yearList);

const heroItems = ['desfile', 'congreso', 'promo-1992', 'danza', 'docentes-premiacion', 'grupo-encuentro', 'promo-2008'].map(id => byPiece.get(id));
let heroIndex = 0;
const exhibition = $('exhibition');
const heroReel = $('hero-reel');
const heroThumbnails = heroItems.map((piece, index) => {
  const control = button('hero-thumbnail');
  control.setAttribute('aria-label', `Fotografía ${index + 1} de ${heroItems.length}. ${piece.title}`);
  control.dataset.heroThumbnail = index;
  const thumbnail = photo(piece, true);
  thumbnail.loading = 'eager';
  control.append(thumbnail);
  heroReel.append(control);
  return control;
});
revealImages(heroReel);
const firstPrint = $('exhibition-prints').firstElementChild;
const exhibitPrints = heroItems.map((piece, index) => {
  if (!index) return firstPrint;
  const control = button('exhibit-print');
  control.dataset.exhibit = index;
  const image = photo(piece, true);
  image.loading = 'eager';
  image.draggable = false;
  control.append(image);
  $('exhibition-prints').append(control);
  return control;
});
let exhibitionDrag;
let ignoreExhibitClick = false;
let exhibitInView = false;
let exhibitPlaying = false;
let exhibitTimer;
const playExhibit = $('hero-play');

function scheduleExhibit() {
  clearTimeout(exhibitTimer);
  if (!exhibitPlaying || !exhibitInView || document.hidden || document.querySelector('dialog[open]')) return;
  exhibitTimer = setTimeout(() => {
    selectExhibit(heroIndex + 1);
    scheduleExhibit();
  }, 5800);
}

function setExhibitPlaying(playing) {
  exhibitPlaying = playing;
  playExhibit.setAttribute('aria-pressed', String(playing));
  scheduleExhibit();
}

playExhibit.addEventListener('click', () => setExhibitPlaying(!exhibitPlaying));
new IntersectionObserver(([entry]) => {
  exhibitInView = entry.intersectionRatio >= .37;
  scheduleExhibit();
}, { threshold: .38 }).observe(exhibition);
document.addEventListener('visibilitychange', scheduleExhibit);

function printOffset(index) {
  const half = Math.floor(exhibitPrints.length / 2);
  return (index - heroIndex + half + exhibitPrints.length) % exhibitPrints.length - half;
}

function drawExhibition(dragOffset = 0) {
  for (const [index, control] of exhibitPrints.entries()) {
    const offset = printOffset(index);
    const space = Math.abs(offset);
    control.dataset.side = Math.sign(offset);
    control.dataset.distance = space;
    control.style.setProperty('--position', offset);
    control.style.setProperty('--distance', space);
    control.style.setProperty('--drag', dragOffset + 'px');
    control.style.zIndex = space ? 10 - space : 20;
  }
}

function selectExhibit(index, instant = false) {
  const previous = heroIndex;
  const focused = exhibitPrints.includes(document.activeElement);
  heroIndex = (index + heroItems.length) % heroItems.length;
  const piece = heroItems[heroIndex];
  const image = exhibitPrints[heroIndex].querySelector('img');
  if (!image.dataset.full && !image.src.endsWith(piece.image)) {
    const print = new Image();
    image.dataset.full = 'pending';
    print.src = piece.image;
    print.decode().then(() => {
      image.src = print.src;
    }).catch(() => {
      delete image.dataset.full;
    });
  }
  exhibition.classList.toggle('exhibition-instant', instant || motionReduced());
  drawExhibition();
  if (!instant && !motionReduced() && previous !== heroIndex) {
    image.getAnimations().forEach(animation => animation.cancel());
    image.animate([
      { transform: 'scale(1.09)', opacity: .78 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 590, easing: easeOut });
  }
  for (const [i, control] of exhibitPrints.entries()) {
    const active = i === heroIndex;
    const reached = Math.abs(printOffset(i)) <= 1;
    control.tabIndex = active ? 0 : -1;
    control.setAttribute('aria-label', active ? 'Abrir ' + piece.title : 'Enfocar ' + heroItems[i].title);
    control.setAttribute('aria-current', String(active));
    control.inert = !reached;
    heroThumbnails[i].tabIndex = active ? 0 : -1;
    heroThumbnails[i].setAttribute('aria-current', String(active));
  }
  $('hero-title').textContent = piece.title;
  $('hero-category').textContent = piece.collection;
  $('hero-count').textContent = String(heroIndex + 1).padStart(2, '0') + ' / ' + String(heroItems.length).padStart(2, '0');
  $('hero-progress').style.setProperty('--progress', (heroIndex + 1) / heroItems.length);
  const thumbnail = heroThumbnails[heroIndex];
  const thumbnailStart = thumbnail.offsetLeft;
  const thumbnailEnd = thumbnailStart + thumbnail.offsetWidth;
  if (thumbnailStart < heroReel.scrollLeft) heroReel.scrollLeft = thumbnailStart;
  else if (thumbnailEnd > heroReel.scrollLeft + heroReel.clientWidth) {
    heroReel.scrollLeft = thumbnailEnd - heroReel.clientWidth;
  }
  if (focused) exhibitPrints[heroIndex].focus({ preventScroll: true });
}

function moveExhibit(direction, event) {
  setExhibitPlaying(false);
  selectExhibit(heroIndex + direction, event.type === 'keydown' || event.detail === 0);
}
$('hero-prev').addEventListener('click', event => moveExhibit(-1, event));
$('hero-next').addEventListener('click', event => moveExhibit(1, event));
$('hero-open').addEventListener('click', event => openViewer(heroItems, heroIndex, event.currentTarget));
heroReel.addEventListener('click', event => {
  const control = event.target.closest('[data-hero-thumbnail]');
  if (control) {
    setExhibitPlaying(false);
    selectExhibit(Number(control.dataset.heroThumbnail), !event.detail);
  }
});
heroReel.addEventListener('keydown', event => {
  const targets = { ArrowLeft: heroIndex - 1, ArrowRight: heroIndex + 1, Home: 0, End: heroItems.length - 1 };
  if (!Object.hasOwn(targets, event.key)) return;
  event.preventDefault();
  setExhibitPlaying(false);
  selectExhibit(targets[event.key], true);
  heroThumbnails[heroIndex].focus({ preventScroll: true });
});
exhibition.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    moveExhibit(event.key === 'ArrowLeft' ? -1 : 1, event);
  } else if (event.key === 'Enter' && event.target === exhibition) {
    event.preventDefault();
    openViewer(heroItems, heroIndex, exhibition);
  }
});
exhibition.addEventListener('click', event => {
  const control = event.target.closest('[data-exhibit]');
  if (!control || (ignoreExhibitClick && event.detail)) return;
  setExhibitPlaying(false);
  const index = Number(control.dataset.exhibit);
  if (index === heroIndex) openViewer(heroItems, index, control);
  else selectExhibit(index, !event.detail);
});
exhibition.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  ignoreExhibitClick = false;
  exhibitionDrag = { id: event.pointerId, start: event.clientX, y: event.clientY, active: false };
});
exhibition.addEventListener('pointermove', event => {
  if (event.pointerId !== exhibitionDrag?.id) return;
  const delta = event.clientX - exhibitionDrag.start;
  if (!exhibitionDrag.active) {
    if (Math.abs(delta) < 10 || Math.abs(delta) < Math.abs(event.clientY - exhibitionDrag.y)) return;
    exhibitionDrag.active = true;
    setExhibitPlaying(false);
    exhibition.setPointerCapture(event.pointerId);
    exhibition.classList.add('exhibition-instant', 'is-dragging');
  }
  if (!motionReduced()) drawExhibition(Math.max(-150, Math.min(delta * .62, 150)));
});
function endExhibitDrag(event) {
  if (event.pointerId !== exhibitionDrag?.id) return;
  const gesture = exhibitionDrag;
  exhibitionDrag = undefined;
  if (!gesture.active) return;
  const delta = event.clientX - gesture.start;
  const step = event.type === 'pointerup' && Math.abs(delta) > 40 ? -Math.sign(delta) : 0;
  ignoreExhibitClick = true;
  exhibition.classList.remove('is-dragging');
  selectExhibit(heroIndex + step);
}
exhibition.addEventListener('pointerup', endExhibitDrag);
exhibition.addEventListener('pointercancel', endExhibitDrag);
exhibition.addEventListener('lostpointercapture', event => {
  if (event.target === exhibition) endExhibitDrag(event);
});
exhibition.addEventListener('pointerleave', () => {
  if (!exhibitionDrag?.active) exhibitionDrag = undefined;
});

const search = $('search');
const collection = $('collection');
const format = $('format');
const archiveGrid = $('archive-grid');
const pageSize = 12;
let archiveResults = [];
let visibleCount = 0;
let onlySaved = false;
let saved = new Set();
const savedKey = 'unheval-museo-guardados';
try {
  const stored = JSON.parse(localStorage.getItem(savedKey) || '[]');
  if (Array.isArray(stored)) saved = new Set(stored.filter(id => byPiece.has(id)));
} catch {
  // The selection still works in this tab if storage is unavailable.
}
const collectionNames = [...new Set([...pieces.map(piece => piece.collection), ...pending])]
  .sort((a, b) => a.localeCompare(b, 'es'));
for (const name of ['', ...collectionNames]) {
  const option = element('option', '', name || 'Todas');
  option.value = name;
  collection.append(option);
}

function normalize(value) {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function addArchivePage() {
  const next = archiveResults.slice(visibleCount, visibleCount + pageSize);
  for (const piece of next) {
    const control = button('archive-card');
    control.dataset.piece = piece.id;
    const tag = piece.reference ? 'Imagen de referencia' : piece.video ? '▶ Video' : '';
    control.append(cardImage(piece, tag, piece.reference ? 'play-tag reference-mark' : 'play-tag'), element('span', 'mono', piece.collection), element('strong', '', piece.title));
    archiveGrid.append(control);
    revealImages(control);
  }
  visibleCount += next.length;
  $('more').hidden = visibleCount >= archiveResults.length;
  return next[0];
}

function renderArchive() {
  const words = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
  archiveResults = pieces.filter(piece => {
    if (onlySaved && !saved.has(piece.id)) return false;
    if (collection.value && collection.value !== piece.collection) return false;
    if (format.value && format.value !== (piece.video ? 'video' : 'foto')) return false;
    const searchable = normalize([piece.title, piece.description, piece.collection, piece.year, piece.eventDate, byRoom.get(piece.room).title].join(' '));
    return words.every(word => searchable.includes(word));
  });
  for (const image of archiveGrid.querySelectorAll('img')) revealObserver.unobserve(image);
  archiveGrid.replaceChildren();
  visibleCount = 0;
  $('results-count').textContent = `${archiveResults.length} ${archiveResults.length === 1 ? 'recuerdo' : 'recuerdos'}`;
  $('clear-filters').hidden = !(words.length || collection.value || format.value);
  if (archiveResults.length === 0) {
    const awaiting = pending.includes(collection.value) || pending.some(name => normalize(name) === normalize(search.value.trim()));
    const message = onlySaved && saved.size === 0 ? 'Abre una foto o un video y pulsa «Guardar recuerdo» para añadirlo aquí.'
      : awaiting ? 'Aún no hay fotografías identificadas para esta colección.' : 'No encontramos recuerdos con esos filtros.';
    archiveGrid.append(element('p', 'empty', message));
  }
  addArchivePage();
}

$('saved-only').addEventListener('click', () => {
  onlySaved = !onlySaved;
  $('saved-only').setAttribute('aria-pressed', String(onlySaved));
  renderArchive();
});
$('saved-count').textContent = saved.size;

search.addEventListener('input', renderArchive);
collection.addEventListener('change', renderArchive);
format.addEventListener('change', renderArchive);
$('clear-filters').addEventListener('click', () => {
  search.value = collection.value = format.value = '';
  renderArchive();
  search.focus();
});
$('more').addEventListener('click', () => {
  const first = addArchivePage();
  if (first) archiveGrid.querySelector(`[data-piece="${first.id}"]`).focus();
});

const tour = $('tour');
const viewer = $('viewer');
const viewport = $('room-viewport');
const camera = $('camera');
const rail = $('wall-rail');
const pieceMedia = $('piece-media');
const zoom = $('piece-zoom');
const framePitch = 356;
let motionOverride = null;
let roomId = rooms[0].id;
let frameIndex = 0;
let cameraCenter = 0;
let cameraTilt = 0;
let drag = null;
let suppressClick = false;
let tourTrigger;
let viewerTrigger;
let viewerItems = [];
let viewerIndex = 0;
let spatial;
let loadingScene;
let sceneRequest = 0;
let portalAnimation;
let guideIndex = -1;
let previousFragment = '';
const seek = $('frame-seek');
const overviewControl = $('tour-overview');
const mapControl = $('tour-map-toggle');
let overview = false;
let draggingFrame = 0;

function showTourMap(open) {
  tour.classList.toggle('map-open', open);
  mapControl.setAttribute('aria-expanded', String(open));
}

mapControl.addEventListener('click', () => {
  showTourMap(!tour.classList.contains('map-open'));
});

overviewControl.addEventListener('click', event => {
  overview = !overview;
  overviewControl.setAttribute('aria-pressed', String(overview));
  overviewControl.querySelector('.tour-action-label').textContent = overview ? 'Centrar cuadro' : 'Vista general';
  moveCamera(!event.detail);
  focusSpatial(!event.detail || motionReduced());
});

function enableSpatial() {
  if (loadingScene || !('WebGL2RenderingContext' in window)) return;
  const script = document.createElement('script');
  script.src = 'spatial.js?v=8';
  script.onload = () => {
    try {
      spatial = window.createMuseumScene(viewport, (index, isCurrent) => {
        if (!viewport.classList.contains('spatial') || portalAnimation) return;
        if (!isCurrent) stopGuided();
        if (isCurrent) openFrame(viewport);
        else selectFrame(index);
      }, () => {
        spatial = undefined;
        viewport.classList.remove('spatial');
        $('tour-mode').textContent = 'Galería interactiva';
        moveCamera(true);
      });
      if (!spatial) return;
      spatial.toggle(tour.open && !viewer.open);
      spatial.build(roomId, byRoomPieces.get(roomId));
      focusSpatial(true);
    } catch (error) {
      viewport.classList.remove('spatial');
      console.warn('La vista 3D no está disponible en este dispositivo.', error);
    }
  };
  loadingScene = true;
  document.head.append(script);
}

function stopGuided() {
  if (guideIndex < 0) return;
  guideIndex = -1;
  $('tour-map-content').hidden = false;
  $('guide-panel').hidden = true;
}

function goToStop(index, trigger, keyboard) {
  const stop = guideStops[index];
  const piece = byPiece.get(stop.id);
  const startedInside = tour.open;
  guideIndex = index;
  $('tour-map-content').hidden = true;
  $('guide-panel').hidden = false;
  showTourMap(true);
  $('guide-position').textContent = `Parada ${index + 1} de ${guideStops.length}`;
  $('guide-title').textContent = stop.title;
  $('guide-note').textContent = stop.note;
  $('guide-prev').disabled = index === 0;
  $('guide-next').textContent = index === guideStops.length - 1 ? 'Finalizar' : 'Siguiente';
  enterRoom(piece.room, piece.id, trigger, keyboard, { retainFocus: startedInside });
  if (!startedInside || trigger?.matches('[data-guide]')) $('guide-next').focus({ preventScroll: true });
}

function exitGuide() {
  stopGuided();
  $('tour-map-content').querySelector('[data-guide]').focus({ preventScroll: true });
}

$('guide-prev').addEventListener('click', event => {
  goToStop(guideIndex - 1, event.currentTarget, !event.detail);
  if (guideIndex === 0) $('guide-next').focus({ preventScroll: true });
});
$('guide-next').addEventListener('click', event => {
  if (guideIndex === guideStops.length - 1) return exitGuide();
  goToStop(guideIndex + 1, event.currentTarget, !event.detail);
});
$('guide-exit').addEventListener('click', exitGuide);

function motionReduced() { return motionOverride ?? reducedPreference.matches; }

function syncMotion() {
  $('tour-motion').setAttribute('aria-pressed', String(motionReduced()));
  document.documentElement.classList.toggle('motion-off', motionReduced());
  if (motionReduced()) portalAnimation?.finish();
  focusSpatial(motionReduced());
}

$('tour-motion').addEventListener('click', () => {
  motionOverride = !motionReduced();
  syncMotion();
  moveCamera(true);
});
reducedPreference.addEventListener('change', syncMotion);
syncMotion();

function worldScale() {
  const layout = Math.min(1.16, viewport.clientWidth / 510, viewport.clientHeight / 515);
  return overview ? layout * .74 : layout;
}

function moveCamera(instant = false) {
  if (!tour.open) return;
  const scale = worldScale();
  camera.classList.toggle('instant', instant || motionReduced());
  camera.style.transform = `translate3d(0,-18px,0) rotateY(${motionReduced() ? 0 : cameraTilt}deg) scale3d(${scale},${scale},${scale}) translate3d(${-cameraCenter}px,0,0)`;
}

function frameCenter(index) {
  return (index - (byRoomPieces.get(roomId).length - 1) / 2) * framePitch;
}

function focusSpatial(instant) {
  if (!spatial) return;
  const ready = spatial.focus(frameIndex, instant, overview);
  if (viewport.classList.contains('spatial') || !ready) return;
  const request = ++sceneRequest;
  ready.then(() => {
    if (request !== sceneRequest || !spatial) return;
    if (!tour.open) return;
    viewport.classList.add('spatial');
    $('tour-mode').textContent = 'Recorrido 3D';
  });
}

function selectFrame(index, instant = false) {
  const items = byRoomPieces.get(roomId);
  frameIndex = Math.max(0, Math.min(items.length - 1, index));
  cameraCenter = frameCenter(frameIndex);
  cameraTilt = motionReduced() ? 0 : 3 * Math.sign((items.length - 1) / 2 - frameIndex);
  for (const [i, frame] of [...rail.children].entries()) {
    frame.tabIndex = i === frameIndex ? 0 : -1;
    frame.setAttribute('aria-current', String(i === frameIndex));
    const image = frame.querySelector('img[data-src]');
    if (image && Math.abs(i - frameIndex) <= 2) {
      image.src = image.dataset.src;
      delete image.dataset.src;
    }
  }
  $('frame-position').textContent = `${frameIndex + 1} de ${items.length}`;
  $('frame-title').textContent = items[frameIndex].title;
  seek.max = items.length;
  seek.value = frameIndex + 1;
  seek.setAttribute('aria-valuetext', items[frameIndex].title);
  $('frame-prev').disabled = frameIndex === 0;
  $('frame-next').disabled = frameIndex === items.length - 1;
  const reel = $('room-reel');
  for (const [i, control] of Array.from(reel.children).entries()) {
    control.setAttribute('aria-current', String(i === frameIndex));
  }
  const selected = reel.children[frameIndex];
  if (selected && tour.open) {
    reel.scrollTo({
      left: selected.offsetLeft - (reel.clientWidth - selected.offsetWidth) / 2,
      behavior: instant || motionReduced() ? 'instant' : 'smooth',
    });
  }
  if (roomId === 'promociones') {
    for (const year of tourYears.children) {
      const active = Number(year.dataset.year) === items[frameIndex].year;
      year.setAttribute('aria-current', String(active));
      if (active && tour.open) {
        const start = year.offsetLeft - tourYears.offsetLeft;
        const x = start + (year.offsetWidth - tourYears.clientWidth) / 2;
        if (Math.abs(tourYears.scrollLeft - x) > 14) {
          tourYears.scrollTo({ left: x, behavior: instant || motionReduced() ? 'instant' : 'smooth' });
        }
      }
    }
  }
  moveCamera(instant);
  focusSpatial(instant || motionReduced());
}

function renderRoom() {
  viewport.classList.remove('spatial');
  $('tour-mode').textContent = 'Galería interactiva';
  tour.dataset.room = roomId;
  $('tour-room-title').textContent = byRoom.get(roomId).title;
  $('tour-years').hidden = roomId !== 'promociones';
  for (const marker of mapList.children) marker.setAttribute('aria-current', String(marker.dataset.tour === roomId));
  rail.replaceChildren();
  $('room-reel').replaceChildren();
  const roomPieces = byRoomPieces.get(roomId);
  viewport.style.setProperty('--wall-width', `${Math.max(6600, roomPieces.length * framePitch + 800)}px`);
  for (const [index, piece] of roomPieces.entries()) {
    const frame = button('frame');
    frame.dataset.frame = String(index);
    const image = element('img');
    image.alt = '';
    image.decoding = 'async';
    image.dataset.src = piece.thumb;
    const mount = element('span', 'frame-photo');
    mount.append(image);
    frame.append(element('span', 'frame-spot'), mount, element('span', 'frame-label', piece.title));
    rail.append(frame);
    const preview = button('reel-preview');
    preview.dataset.preview = index;
    preview.setAttribute('aria-label', piece.title);
    preview.append(photo(piece, true));
    $('room-reel').append(preview);
  }
  spatial?.build(roomId, roomPieces);
}

function enterRoom(id, target, trigger, keyboard, options = {}) {
  const alreadyOpen = tour.open;
  const keepRoom = alreadyOpen && id === roomId;
  const { portal, retainFocus } = options;
  if (portal) {
    tour.classList.add('portal-arrival');
    viewport.classList.add('portal-pending');
  }
  roomId = id;
  if (!keepRoom) renderRoom();
  if (!alreadyOpen) {
    setExhibitPlaying(false);
    tourTrigger = trigger;
    tour.showModal();
    spatial?.toggle(true);
    if (!portal) enableSpatial();
  }
  const items = byRoomPieces.get(id);
  const index = target ? items.findIndex(piece => piece.id === target) : 0;
  selectFrame(index, !keepRoom || keyboard);
  if (!retainFocus && (!alreadyOpen || target)) viewport.focus({ preventScroll: true });
  if (portal) playEntrance(portal, items[frameIndex]);
  else if (!keepRoom && !motionReduced() && !keyboard) {
    viewport.getAnimations().forEach(animation => animation.cancel());
    viewport.animate([{ opacity: .58 }, { opacity: 1 }], { duration: 245, easing: easeOut });
  }
}

function playEntrance(origin, piece) {
  const image = photo(piece);
  const finish = () => {
    portalAnimation = undefined;
    image.remove();
    viewport.classList.remove('portal-pending');
    enableSpatial();
  };
  const target = rail.children[frameIndex]?.querySelector('img')?.getBoundingClientRect();
  if (!target?.width || !target.height) return finish();
  image.alt = '';
  image.className = 'portal-photo';
  image.style.cssText = `left:${target.left}px;top:${target.top}px;width:${target.width}px;height:${target.height}px`;
  tour.append(image);
  const x = origin.left - target.left;
  const y = origin.top - target.top;
  const scaleX = origin.width / target.width;
  const scaleY = origin.height / target.height;
  portalAnimation = image.animate([
    { transform: `translate(${x}px,${y}px) scale(${scaleX},${scaleY})`, opacity: 1 },
    { transform: 'none', opacity: 1, offset: .84 },
    { transform: 'none', opacity: 0 },
  ], { duration: 800, easing: easeInOut });
  portalAnimation.onfinish = finish;
  portalAnimation.oncancel = finish;
  viewport.animate([{ opacity: .18 }, { opacity: 1 }], { duration: 760, easing: easeOut });
}

new ResizeObserver(() => moveCamera(true)).observe(viewport);
const closeTour = $('tour-close');
if (campus?.embedded) {
  closeTour.setAttribute('aria-label', 'Volver al campus');
  closeTour.querySelector('.tour-action-label').textContent = 'Volver al campus';
}
closeTour.addEventListener('click', () => {
  tour.close();
  campus?.exit();
});
tour.addEventListener('cancel', () => campus?.exit());
tour.addEventListener('close', () => {
  portalAnimation?.cancel();
  tour.classList.remove('portal-arrival', 'campus-arrival');
  showTourMap(false);
  stopGuided();
  spatial?.toggle(false);
  tourTrigger?.focus({ preventScroll: true });
});
$('frame-prev').addEventListener('click', event => { stopGuided(); selectFrame(frameIndex - 1, !event.detail); });
$('frame-next').addEventListener('click', event => { stopGuided(); selectFrame(frameIndex + 1, !event.detail); });
seek.addEventListener('input', () => { stopGuided(); selectFrame(Number(seek.value) - 1, true); });
$('frame-open').addEventListener('click', event => openFrame(event.currentTarget));

viewport.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    stopGuided();
    selectFrame(frameIndex + (event.key === 'ArrowRight' ? 1 : -1), true);
    if (event.target !== viewport) rail.children[frameIndex].focus({ preventScroll: true });
  }
  if (event.key === 'Enter' && event.target === viewport) {
    event.preventDefault();
    openFrame(viewport);
  }
});

viewport.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (!event.isPrimary || event.button !== 0) return;
  drag = { id: event.pointerId, start: event.clientX, y: event.clientY, center: cameraCenter, moved: false, distance: 0 };
});

viewport.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  const distance = event.clientX - drag.start;
  if (!drag.moved && (Math.abs(distance) < 10 || Math.abs(distance) < Math.abs(event.clientY - drag.y))) return;
  if (!drag.moved) {
    drag.moved = true;
    stopGuided();
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('dragging');
  }
  drag.distance = distance;
  const max = frameCenter(byRoomPieces.get(roomId).length - 1);
  const scale = worldScale() || 1;
  cameraCenter = Math.max(-max - 65, Math.min(max + 65, drag.center - distance / scale));
  cameraTilt = Math.max(-10, Math.min(10, -distance / 24));
  if (!motionReduced() && !draggingFrame) draggingFrame = requestAnimationFrame(() => {
    draggingFrame = 0;
    moveCamera(true);
    spatial?.preview((cameraCenter - frameCenter(frameIndex)) / framePitch * 3.78, frameIndex);
  });
});

function stopDrag(event) {
  if (!drag || drag.id !== event.pointerId) return;
  if (drag.moved) {
    cancelAnimationFrame(draggingFrame);
    draggingFrame = 0;
    const last = byRoomPieces.get(roomId).length - 1;
    const nearest = Math.round(cameraCenter / framePitch + last / 2);
    const threshold = Math.min(58, viewport.clientWidth * .15);
    const nudge = nearest === frameIndex && Math.abs(drag.distance) > threshold ? -Math.sign(drag.distance) : 0;
    const next = event.type === 'pointerup' ? nearest + nudge : frameIndex;
    suppressClick = true;
    viewport.classList.remove('dragging');
    selectFrame(next);
  }
  drag = null;
}

viewport.addEventListener('pointerup', stopDrag);
viewport.addEventListener('pointercancel', stopDrag);
viewport.addEventListener('lostpointercapture', event => {
  if (event.target === viewport) stopDrag(event);
});
viewport.addEventListener('pointerleave', event => {
  if (drag && !drag.moved) stopDrag(event);
});

function openFrame(trigger) {
  const items = byRoomPieces.get(roomId);
  if (guideIndex >= 0 && items[frameIndex].id === guideStops[guideIndex].id) {
    openViewer(guidedPieces, guideIndex, trigger);
  } else {
    openViewer(items, frameIndex, trigger);
  }
}

function pieceLink(piece) {
  const url = new URL(location.href);
  url.hash = `pieza=${piece.id}`;
  return url;
}

function saveFragment(url) {
  if (url.href !== location.href) history.replaceState(history.state, '', url);
}

function openViewer(items, index, trigger) {
  setExhibitPlaying(false);
  if (!items[index]) return;
  spatial?.toggle(false);
  viewerItems = items;
  viewerIndex = index;
  if (!viewer.open) {
    previousFragment = location.hash.startsWith('#pieza=') ? '' : location.hash;
    viewerTrigger = trigger;
  }
  renderPiece();
  if (!viewer.open) viewer.showModal();
  $('piece-close').focus({ preventScroll: true });
}

function toggleDetail(event) {
  const control = $('detail-toggle');
  const active = control.getAttribute('aria-expanded') !== 'true';
  control.setAttribute('aria-expanded', String(active));
  $('detail-note').hidden = !active;
  const marker = pieceMedia.querySelector('.photo-point');
  marker?.setAttribute('aria-pressed', String(active));
  pieceMedia.classList.toggle('detail-active', active);
  if (active && event.currentTarget === marker) {
    $('detail-note').scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}
$('detail-toggle').addEventListener('click', toggleDetail);

function renderPrint(piece, detail) {
  const print = element('div', 'viewer-print');
  const image = photo(piece);
  const sizePrint = () => {
    if (image.naturalHeight) print.style.setProperty('--ratio', image.naturalWidth / image.naturalHeight);
  };
  image.addEventListener('load', sizePrint, { once: true });
  sizePrint();
  print.append(image);
  if (detail) {
    const marker = button('photo-point');
    marker.style.left = `${detail.point[0]}%`;
    marker.style.top = `${detail.point[1]}%`;
    marker.setAttribute('aria-label', detail.label);
    marker.setAttribute('aria-controls', 'detail-note');
    marker.setAttribute('aria-pressed', 'false');
    marker.addEventListener('click', toggleDetail);
    print.append(marker);
  }
  pieceMedia.append(print);
}

function pickStory(id) {
  const piece = byPiece.get(id);
  if (viewerItems !== byRoomPieces.get(piece.room)) {
    viewerItems = teamStory.map(item => byPiece.get(item.id));
  }
  viewerIndex = viewerItems.indexOf(piece);
  if (tour.open && guideIndex < 0) selectFrame(byRoomPieces.get(roomId).indexOf(piece), true);
  renderPiece();
  $('piece-story').querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
}

function renderPiece(direction = 0) {
  const piece = viewerItems[viewerIndex];
  syncSaveButton(piece.id);
  saveFragment(pieceLink(piece));
  $('share-status').textContent = '';
  $('share-address').hidden = true;
  $('piece-room').textContent = piece.collection;
  $('piece-title').textContent = piece.title;
  const description = $('piece-description');
  description.textContent = piece.description;
  description.hidden = !piece.description;
  const eventDate = $('piece-date');
  eventDate.hidden = !piece.eventDate;
  if (piece.eventDate) {
    eventDate.dateTime = piece.eventDate;
    eventDate.textContent = eventDateFormat.format(new Date(piece.eventDate));
  }
  const type = piece.reference ? 'Imagen de referencia' : piece.video ? 'Video' : 'Imagen';
  $('piece-position').textContent = `${type} · ${viewerIndex + 1} de ${viewerItems.length}`;
  const source = $('piece-source');
  source.textContent = piece.source;
  source.removeAttribute('href');
  if (piece.url) {
    source.href = piece.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
  }
  pieceMedia.replaceChildren();
  pieceMedia.classList.remove('zoomed', 'detail-active');
  const detail = details[piece.id];
  $('piece-detail').hidden = !detail;
  $('detail-toggle').textContent = detail?.label ?? '';
  $('detail-toggle').setAttribute('aria-expanded', 'false');
  $('detail-note').textContent = detail?.note ?? '';
  $('detail-note').hidden = true;
  const story = $('piece-story');
  story.hidden = !teamStory.some(item => item.id === piece.id);
  story.replaceChildren();
  if (!story.hidden) {
    for (const item of teamStory) {
      const control = button('', item.label);
      control.setAttribute('aria-pressed', String(item.id === piece.id));
      control.addEventListener('click', () => pickStory(item.id));
      story.append(control);
    }
  }
  zoom.hidden = !!piece.video;
  zoom.setAttribute('aria-pressed', 'false');
  zoom.textContent = 'Ampliar foto';
  if (piece.video) {
    const video = element('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = piece.image;
    video.src = piece.video;
    video.setAttribute('aria-label', piece.title);
    pieceMedia.append(video);
  } else {
    renderPrint(piece, detail);
    if (direction && !motionReduced()) {
      pieceMedia.firstElementChild.animate([
        { opacity: .68, transform: `translateX(${direction * 12}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ], { duration: 190, easing: easeOut });
    }
  }
  $('piece-prev').disabled = viewerIndex <= 0;
  $('piece-next').disabled = viewerIndex >= viewerItems.length - 1;
}

function changePiece(delta, animate = false) {
  const next = viewerIndex + delta;
  if (next < 0 || next >= viewerItems.length) return;
  viewerIndex = next;
  if (tour.open && viewerItems === guidedPieces) {
    goToStop(next, null, true);
  } else if (tour.open && viewerItems === byRoomPieces.get(roomId)) {
    selectFrame(next, true);
  }
  renderPiece(animate ? delta : 0);
}

let viewerSwipe;
pieceMedia.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' || !event.isPrimary || pieceMedia.classList.contains('zoomed')) return;
  if (event.target.closest('video, button')) return;
  viewerSwipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
pieceMedia.addEventListener('pointercancel', () => { viewerSwipe = undefined; });
pieceMedia.addEventListener('pointerup', event => {
  if (event.pointerId !== viewerSwipe?.id) return;
  const dx = event.clientX - viewerSwipe.x;
  const dy = event.clientY - viewerSwipe.y;
  viewerSwipe = undefined;
  if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) changePiece(-Math.sign(dx), true);
});

$('piece-close').addEventListener('click', () => viewer.close());
$('piece-save').addEventListener('click', () => {
  const { id } = viewerItems[viewerIndex];
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  try {
    localStorage.setItem(savedKey, JSON.stringify([...saved]));
  } catch {
    // Keep the selection in memory even when the browser blocks storage.
  }
  syncSaveButton(id);
  $('saved-count').textContent = saved.size;
  if (onlySaved) renderArchive();
});

function syncSaveButton(id) {
  const selected = saved.has(id);
  const control = $('piece-save');
  control.setAttribute('aria-pressed', String(selected));
  control.textContent = selected ? 'Recuerdo guardado' : 'Guardar recuerdo';
}
$('piece-prev').addEventListener('click', event => changePiece(-1, !!event.detail));
$('piece-next').addEventListener('click', event => changePiece(1, !!event.detail));
zoom.addEventListener('click', () => {
  const enabled = pieceMedia.classList.toggle('zoomed');
  zoom.textContent = enabled ? 'Restablecer foto' : 'Ampliar foto';
  zoom.setAttribute('aria-pressed', String(enabled));
  if (enabled) pieceMedia.scrollLeft = (pieceMedia.scrollWidth - pieceMedia.clientWidth) / 2;
  else pieceMedia.scrollTo(0, 0);
});
$('piece-share').addEventListener('click', async () => {
  const address = pieceLink(viewerItems[viewerIndex]).href;
  const status = $('share-status');
  const publicAddress = new URL(address);
  if (campus) {
    publicAddress.searchParams.delete('modo');
    publicAddress.searchParams.delete('origenCampus');
  }
  try {
    await navigator.clipboard.writeText(publicAddress.href);
    if (viewer.open && location.href === address) status.textContent = 'Enlace copiado.';
  } catch {
    if (!viewer.open || location.href !== address) return;
    $('share-address').hidden = false;
    const input = $('piece-url');
    input.value = publicAddress.href;
    input.focus();
    input.select();
    status.textContent = 'Selecciona y copia el enlace.';
  }
});
viewer.addEventListener('keydown', event => {
  if (event.target instanceof HTMLVideoElement || event.target instanceof HTMLInputElement) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    changePiece(event.key === 'ArrowRight' ? 1 : -1);
  }
});
viewer.addEventListener('close', () => {
  if (viewer.open) return;
  pieceMedia.replaceChildren();
  if (location.hash === pieceLink(viewerItems[viewerIndex]).hash) {
    const url = new URL(location.href);
    url.hash = previousFragment;
    saveFragment(url);
  }
  if (tour.open) spatial?.toggle(true);
  if (tour.open && viewerTrigger?.matches('.frame')) {
    rail.children[frameIndex]?.focus({ preventScroll: true });
  } else {
    const target = viewerTrigger?.isConnected ? viewerTrigger : null;
    (target || (onlySaved ? $('saved-only') : exhibition)).focus({ preventScroll: true });
  }
});

document.addEventListener('click', event => {
  const control = event.target.closest('button');
  if (!control) return;
  if (control.hasAttribute('data-entrance')) {
    const piece = heroItems[heroIndex];
    const image = exhibitPrints[heroIndex].querySelector('img');
    const rect = image.getBoundingClientRect();
    const portal = event.detail && !motionReduced() && image.complete && image.naturalWidth && rect.top >= -10 && rect.bottom <= innerHeight + 10 ? rect : null;
    stopGuided();
    enterRoom(piece.room, piece.id, control, !event.detail, { portal });
    return;
  }
  if (control.hasAttribute('data-guide')) {
    goToStop(0, control, !event.detail);
    return;
  }
  if (control.dataset.tour) {
    stopGuided();
    if (mapList.contains(control)) showTourMap(false);
    enterRoom(control.dataset.tour, control.dataset.pieceTarget, control, !event.detail, { retainFocus: tourYears.contains(control) });
    if (mapList.contains(control) && !control.getClientRects().length) viewport.focus({ preventScroll: true });
    return;
  }
  if (control.dataset.preview !== undefined) {
    stopGuided();
    const index = Number(control.dataset.preview);
    if (index === frameIndex) openFrame(control);
    else selectFrame(index, !event.detail);
    return;
  }
  if (control.dataset.memory) {
    openViewer(featurePieces, featurePieces.findIndex(piece => piece.id === control.dataset.memory), control);
    return;
  }
  if (control.dataset.piece) {
    const piece = byPiece.get(control.dataset.piece);
    const items = archiveGrid.contains(control) ? archiveResults : heroItems;
    openViewer(items, items.indexOf(piece), control);
    return;
  }
  if (control.dataset.frame !== undefined) {
    if (suppressClick && event.detail) return;
    const index = Number(control.dataset.frame);
    if (index === frameIndex || !event.detail) {
      selectFrame(index, !event.detail);
      openFrame(control);
    } else {
      stopGuided();
      selectFrame(index);
    }
  }
});

if (campus) {
  const campusEnter = $('campus-enter');
  const archive = $('archivo');
  $('campus-collections').append($('promociones'), archive);
  let destination;

  function showCollection(name) {
    search.value = '';
    collection.value = name;
    format.value = '';
    onlySaved = false;
    $('saved-only').setAttribute('aria-pressed', 'false');
    renderArchive();
    if (location.hash !== '#archivo') location.hash = 'archivo';
    archive.scrollIntoView({ behavior: motionReduced() ? 'instant' : 'smooth' });
    $('archivo-titulo').focus({ preventScroll: true });
  }

  const album = window.mountMuseumAlbum({
    pieces, byPiece, onOpen: openViewer, onCollection: showCollection,
    onEnter: (control, keyboard) => {
      const target = destination ?? album.current;
      enterFromCampus(target.room, target.id, control, keyboard);
    },
    isReduced: motionReduced, observeImages: revealImages,
  });
  $('campus-all-archive').addEventListener('click', event => {
    event.preventDefault();
    showCollection('');
  });

  function enterFromCampus(room, piece, trigger, keyboard) {
    stopGuided();
    if (viewer.open) viewer.close();
    if (!tour.open && !keyboard && !motionReduced()) tour.classList.add('campus-arrival');
    enterRoom(room, piece, trigger, keyboard);
  }

  for (const room of rooms) {
    const door = button('', room.title);
    const arrow = element('span', 'icon-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    door.append(arrow);
    door.addEventListener('click', event => enterFromCampus(room.id, room.cover, door, !event.detail));
    $('campus-rooms').append(door);
  }
  window.addEventListener('museo-campus-entry', ({ detail }) => {
    const piece = byPiece.get(detail.pieceId) ?? referenceReplacements.get(detail.pieceId);
    const room = byRoom.get(piece?.room ?? detail.roomId);
    destination = room ? byPiece.get(piece?.id ?? room.cover) : undefined;
    if (destination) album.showPiece(destination.id);
    if (detail.enter) {
      const target = destination ?? album.current;
      enterFromCampus(target.room, target.id, campusEnter, false);
    }
  });
}

function readPieceLink() {
  const key = location.hash.match(/^#pieza=([a-z0-9-]+)$/)?.[1];
  const piece = byPiece.get(key) ?? referenceReplacements.get(key);
  if (!piece) {
    if (viewer.open) viewer.close();
    return;
  }
  const items = byRoomPieces.get(piece.room);
  openViewer(items, items.indexOf(piece));
}
window.addEventListener('hashchange', readPieceLink);

renderArchive();
syncYearArrows();
selectExhibit(0, true);
readPieceLink();
campus?.ready();
