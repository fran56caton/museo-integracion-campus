'use strict';

const $ = id => document.getElementById(id);
let collection = {};
let view = 'pending';
const selected = new Set();
const bulk = $('bulk');

function node(tag, label, className) {
  const element = document.createElement(tag);
  element.textContent = label || '';
  if (className) element.className = className;
  return element;
}

async function request(url, options) {
  const result = await fetch(url, options);
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(body.error || (result.status === 409
    ? 'El aporte cambió. Actualiza la bandeja y vuelve a intentarlo.' : 'La bandeja no respondió. Vuelve a intentarlo.'));
  return body;
}

function addField(label, control) {
  const wrapper = node('label', label);
  control.setAttribute('aria-label', label);
  wrapper.append(control);
  return wrapper;
}

function field(name, value, max, required = false, multiline = false) {
  const control = node(multiline ? 'textarea' : 'input');
  control.name = name;
  control.value = value || '';
  control.maxLength = max;
  control.required = required;
  return control;
}

function categoryOptions(control) {
  const placeholder = node('option', 'Elegir actividad');
  placeholder.value = '';
  control.replaceChildren(placeholder);
  for (const [key, description] of Object.entries(collection)) {
    const option = node('option', description);
    option.value = key;
    control.append(option);
  }
}

function connectPromotionYear(category, year, label) {
  const update = () => {
    const forPromotion = category.value === 'promociones';
    label.hidden = !forPromotion;
    year.required = forPromotion;
  };
  category.addEventListener('change', update);
  return update;
}

function updateBulk() {
  bulk.hidden = view !== 'pending' || selected.size < 2;
  $('bulk-count').textContent = 'Publicar ' + selected.size + ' fotos del mismo evento';
}

async function decide(item, action, fields, control, message) {
  control.disabled = true;
  try {
    await request('/api/' + item.id + '/' + action, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Museo-Editor': '1'},
      body: JSON.stringify(fields),
    });
    await refresh();
    $('status').textContent = message;
    $('refresh').focus({ preventScroll: true });
  } catch (error) {
    const status = control.closest('article').querySelector('[data-card-status]');
    status.textContent = error.message;
  } finally {
    control.disabled = false;
  }
}

function card(item) {
  const article = node('article');
  const image = node('img');
  image.src = '/foto/' + item.id + '-mini.webp';
  image.alt = item.alt || 'Vista previa de la fotografía recibida';
  image.loading = 'lazy';
  const visual = node('div');
  visual.append(image);
  const content = node('div');
  const label = collection[item.category];
  content.append(node('h3', item.title || label || 'Actividad por identificar'));
  const when = new Date(item.received_at.replace(' ', 'T') + 'Z').toLocaleDateString('es-PE');
  content.append(node('p', item.channel + ' · Recibida el ' + when, 'meta'));
  if (item.caption) content.append(node('p', 'Pie recibido: ' + item.caption, 'caption'));
  const status = node('p');
  status.dataset.cardStatus = '';
  status.setAttribute('role', 'status');
  article.append(visual, content);
  if (item.state === 'approved') {
    const withdraw = node('button', 'Retirar del museo');
    withdraw.type = 'button';
    withdraw.addEventListener('click', () => decide(item, 'withdraw', {}, withdraw, 'Foto retirada. Volvió a la bandeja.'));
    content.append(node('p', label, 'meta'), withdraw, status);
    return article;
  }

  const pick = node('input');
  pick.type = 'checkbox';
  pick.checked = selected.has(item.id);
  pick.addEventListener('change', () => {
    if (pick.checked) selected.add(item.id);
    else selected.delete(item.id);
    updateBulk();
  });
  const pickLabel = node('label', '', 'confirm pick');
  pickLabel.append(pick, document.createTextNode('Incluir esta foto en el lote'));
  visual.append(pickLabel);

  content.append(node('p', label ? 'Sugerencia según ' + item.evidence + ': ' + label : 'Revisión necesaria: ' + item.evidence + '.', 'meta'));
  if (item.possible_duplicate) {
    const comparison = node('details', '', 'comparison');
    comparison.append(node('summary', 'Posible foto repetida'));
    const existing = node('img');
    existing.src = item.possible_duplicate.image;
    existing.alt = item.possible_duplicate.title;
    existing.loading = 'lazy';
    comparison.append(node('p', 'Compárala con «' + item.possible_duplicate.title + '».', 'meta'), existing);
    visual.append(comparison);
  }
  const form = node('form');
  const category = node('select');
  category.name = 'category';
  category.required = true;
  categoryOptions(category);
  category.value = item.category || '';
  const date = node('input');
  date.type = 'date';
  date.name = 'event_date';
  date.value = item.event_date || '';
  const year = field('promotion_year', item.promotion_year, 4);
  year.inputMode = 'numeric';
  year.pattern = '(19|20)[0-9]{2}';
  const yearLabel = addField('Año de la promoción', year);
  connectPromotionYear(category, year, yearLabel)();
  const row = node('div', '', 'fields');
  row.append(addField('Actividad', category), addField('Fecha del evento (opcional)', date), yearLabel);
  const confirmation = node('input');
  confirmation.type = 'checkbox';
  confirmation.name = 'permission';
  confirmation.value = 'confirmed';
  confirmation.required = true;
  const permission = node('label', '', 'confirm');
  permission.append(confirmation, document.createTextNode('La foto está autorizada para aparecer en el museo.'));
  const approve = node('button', 'Añadir al museo', 'primary');
  const discard = node('button', 'Descartar');
  discard.type = 'button';
  const actions = node('div', '', 'actions');
  actions.append(approve, discard);
  form.append(row, addField('Título', field('title', item.title, 120, true)),
    addField('Descripción visual de la foto', field('alt', item.alt, 200, true)),
    addField('Nota para la ficha (opcional)', field('detail', item.detail, 450, false, true)), permission, actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    decide(item, 'approve', Object.fromEntries(new FormData(form)), approve, 'Foto incorporada al museo.');
  });
  discard.addEventListener('click', () => {
    if (window.confirm('¿Descartar esta foto de la bandeja?')) {
      decide(item, 'discard', {}, discard, 'Foto descartada.');
    }
  });
  content.append(form, status);
  return article;
}

async function refresh() {
  try {
    const response = await request('/api/aportes');
    collection = response.categories;
    const available = new Set(response.items.filter(item => item.state === 'pending').map(item => item.id));
    for (const id of selected) {
      if (!available.has(id)) selected.delete(id);
    }
    const bulkCategory = $('bulk-category');
    const previous = bulkCategory.value;
    categoryOptions(bulkCategory);
    bulkCategory.value = previous;
    updateBulkYear();
    updateBulk();
    for (const tab of $('tabs').querySelectorAll('button')) {
      const total = response.items.filter(item => item.state === tab.dataset.state).length;
      tab.textContent = (tab.dataset.state === 'pending' ? 'Por revisar' : 'En el museo') + ' (' + total + ')';
      tab.setAttribute('aria-pressed', String(tab.dataset.state === view));
    }
    const items = response.items.filter(item => item.state === view);
    $('queue').replaceChildren(...items.map(card));
    if (!items.length) $('queue').append(node('p', view === 'pending'
      ? 'La bandeja está vacía. Puedes importar fotos o esperar un aporte por WhatsApp.'
      : 'Aquí aparecerán las fotos que incorpores al museo.', 'empty'));
  } catch (error) {
    $('status').textContent = error.message;
  }
}

const updateBulkYear = connectPromotionYear($('bulk-category'), $('bulk-promotion-year'), $('bulk-promotion-field'));
bulk.addEventListener('submit', async event => {
  event.preventDefault();
  const control = bulk.querySelector('button');
  control.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(bulk));
    const result = await request('/api/aprobar-lote', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Museo-Editor': '1'},
      body: JSON.stringify({ ...fields, keys: [...selected] }),
    });
    selected.clear();
    bulk.reset();
    await refresh();
    $('status').textContent = result.published + ' fotos incorporadas al museo.';
    $('refresh').focus({ preventScroll: true });
  } catch (error) {
    $('status').textContent = error.message;
  } finally {
    control.disabled = false;
  }
});

$('tabs').addEventListener('click', event => {
  const control = event.target.closest('[data-state]');
  if (!control) return;
  view = control.dataset.state;
  $('status').textContent = '';
  refresh();
});
$('refresh').addEventListener('click', () => refresh());
$('import').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const files = [...$('files').files];
  const status = $('import-status');
  const caption = $('caption').value;
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  const failures = [];
  button.disabled = true;
  status.textContent = 'Procesando fotos…';
  for (const photo of files) {
    try {
      const zipped = /\.zip$/i.test(photo.name);
      const result = await request(zipped ? '/api/importar-zip' : '/api/importar', {
        method: 'POST',
        headers: {'X-Museo-Editor': '1', 'X-Museo-Caption': encodeURIComponent(caption)},
        body: photo,
      });
      if (zipped) {
        added += result.added;
        skipped += result.duplicates;
        invalid += result.skipped;
      } else if (result.added) added++;
      else skipped++;
    } catch (error) {
      failures.push(photo.name + ' · ' + error.message);
    }
  }
  if (!failures.length) form.reset();
  view = 'pending';
  status.textContent = 'Añadidas: ' + added + '. Duplicadas: ' + skipped + '. '
    + (invalid ? 'Fotos del ZIP omitidas: ' + invalid + '. ' : '') + failures.join(' ');
  button.disabled = false;
  refresh();
});
refresh();
