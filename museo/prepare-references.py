"""Add the two illustrative plates to the exhibition and its source catalogue."""
import json
import sys
from pathlib import Path

from PIL import Image

dist = Path(__file__).resolve().parent / 'dist'
catalog_file = dist / 'catalogo.js'
catalog = json.loads(catalog_file.read_text(encoding='utf-8').split('=', 1)[1].strip().removesuffix(';'))
references = [
    ('cachimbeada', 'Cachimbeada', 'Cachimbeada · Bienvenida a ingresantes', 'Ilustración de una bienvenida universitaria con banderines en el patio. El museo aún no cuenta con una fotografía identificada de esta actividad.'),
    ('aniversario-carrera', 'Aniversario de la carrera', 'Aniversario de Matemática y Física', 'Ilustración conmemorativa con velas y motivos de matemática y física. El museo aún no cuenta con una fotografía identificada de esta celebración.'),
]
for (key, collection, title, description), path in zip(references, sys.argv[1:], strict=True):
    full = f'media/{key}.webp'
    mini = f'media/{key}-mini.webp'
    with Image.open(path) as source:
        source.convert('RGB').save(dist / full, quality=88, method=5)
        source.thumbnail((600, 600), Image.Resampling.LANCZOS)
        source.convert('RGB').save(dist / mini, quality=82, method=5)
    if not any(piece['id'] == key for piece in catalog['pieces']):
        catalog['pieces'].append(dict(id=key, room='tradiciones', collection=collection, title=title,
                                      description=description, alt=description.split('. ')[0],
                                      source='Ilustración generada para el museo', url=None, year=None,
                                      thumb=mini, image=full, video=None, reference=True))
catalog['pending'] = []
catalog_file.write_text('window.MUSEUM = '+json.dumps(catalog, ensure_ascii=False, indent=2)+';\n', encoding='utf-8')
