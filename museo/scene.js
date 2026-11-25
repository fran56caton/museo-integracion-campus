import {
  AmbientLight, BoxGeometry, CanvasTexture, Color, DirectionalLight, Fog, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry,
  Raycaster, RepeatWrapping, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
  ACESFilmicToneMapping,
} from 'three';

const rooms = {
  promociones: { wall: 0x728474, recess: 0x31463f, floor: 0xa48869, trim: 0xc7a46d, light: 0xffe2b9, wood: true },
  tradiciones: { wall: 0xb88064, recess: 0x624237, floor: 0xab907c, trim: 0xe1b983, light: 0xffdcc1 },
  universidad: { wall: 0x657783, recess: 0x344451, floor: 0x9b9790, trim: 0xddb87a, light: 0xffe8c2 },
  campo: { wall: 0x94a196, recess: 0x4c625d, floor: 0x9c997d, trim: 0xc6b989, light: 0xffedcf, lookout: true },
};
const bay = 3.78;
const wallDepth = -4.2;
const wallHeight = 4.5;
const eye = 1.62;
const box = new BoxGeometry(1, 1, 1);
const quad = new PlaneGeometry(1, 1);

function surface(color, options = {}) {
  return new MeshStandardMaterial({ color, roughness: .86, ...options });
}

function solid(group, material, width, height, depth, x, y, z) {
  const mesh = new Mesh(box, material);
  mesh.scale.set(width, height, depth);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function plate(group, material, width, height, x, y, z) {
  const mesh = new Mesh(quad, material);
  mesh.scale.set(width, height, 1);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function grain(kind) {
  const wood = kind === 'wood';
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    let seed = 99;
    const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    ctx.fillStyle = wood ? '#c4bab0' : '#d0cbc0';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5600; i++) {
      const x = rand() * w;
      const y = rand() * h;
      ctx.fillStyle = rand() > .48 ? 'rgba(49,44,39,.10)' : 'rgba(253,242,215,.16)';
      ctx.fillRect(x, y, wood ? 4 + rand() * 68 : rand() * 2.7, wood ? 1 : rand() * 2.2);
    }
    if (wood) {
      for (let y = 0; y < h; y += 32) {
        ctx.fillStyle = y % 64 ? '#44362820' : '#f9e9c226';
        ctx.fillRect(0, y, w, 30);
        ctx.fillStyle = '#594b4350';
        ctx.fillRect(0, y, w, 1);
        ctx.fillRect(y % 64 ? 132 : 63, y, 1, 32);
      }
    } else if (kind === 'stone') {
      ctx.strokeStyle = '#7b746a70';
      ctx.strokeRect(0, 0, w, h);
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

function gradientTexture(rgba, center = .5) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h * center, 3, w / 2, h / 2, h / 2);
    gradient.addColorStop(0, 'rgba(' + rgba + ',.86)');
    gradient.addColorStop(.54, 'rgba(' + rgba + ',.32)');
    gradient.addColorStop(1, 'rgba(' + rgba + ',0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

function placard(item, index, total) {
  const texture = canvasTexture(384, 124, (ctx, w, h) => {
    ctx.fillStyle = '#f2ebdc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#815632';
    ctx.fillRect(19, 17, 33, 2);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText((index + 1) + ' / ' + total, 19, 43);
    ctx.fillStyle = '#203132';
    ctx.font = '24px Georgia';
    const lines = [''];
    for (const word of item.title.split(' ')) {
      const last = lines.length - 1;
      const next = (lines[last] + ' ' + word).trim();
      if (ctx.measureText(next).width > w - 38 && lines[last]) lines.push(word);
      else lines[last] = next;
    }
    lines.slice(0, 2).forEach((line, i) => ctx.fillText(line + (i === 1 && lines.length > 2 ? '…' : ''), 19, 74 + i * 28, w - 38));
  });
  return new MeshBasicMaterial({ map: texture, toneMapped: false, userData: { ownMap: true } });
}

function release(group) {
  const materials = new Set();
  group.traverse(node => { if (node.isMesh) materials.add(node.material); });
  for (const material of materials) {
    if (material.userData.ownMap) material.map.dispose();
    material.dispose();
  }
}

function exhibition(host, onChoose, onUnavailable) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, powerPreference: 'low-power' });
  if (!context) return null;
  const renderer = new WebGLRenderer({ canvas, context });
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  host.prepend(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x758581);
  scene.fog = new Fog(scene.background, 13, 32);
  const fill = new HemisphereLight(0xe0e8ef, 0x645446, 2.05);
  const key = new DirectionalLight(0xffe1bb, 1.55);
  key.position.set(-1.5, 5, 3);
  scene.add(fill, key, new AmbientLight(0xffedd4, .58));

  const camera = new PerspectiveCamera(51, 1, .06, 62);
  const ray = new Raycaster();
  const pointer = new Vector2();
  const look = new Vector3();
  const fromLook = new Vector3();
  const fromPosition = new Vector3();
  const toLook = new Vector3();
  const destination = new Vector3();
  const floorTextures = [grain('stone'), grain('wood')];
  const wallTexture = grain('plaster');
  wallTexture.repeat.set(2.6, 3);
  const shadow = gradientTexture('15,13,11');
  const glow = gradientTexture('255,222,164', .36);
  const textures = new Map();
  const bays = [];
  const marks = [];
  let room;
  let selected = 0;
  let wide = false;
  let running = false;
  let lost = false;
  let frame = 0;
  let paint = 0;
  let travelStart = 0;
  let travelDuration = 0;
  let pressPosition;

  function render() {
    if (!running || lost) return;
    const radius = wide ? 23 : 14;
    for (const frameBay of bays) frameBay.group.visible = Math.abs(frameBay.group.position.x - camera.position.x) < radius;
    renderer.render(scene, camera);
  }

  function queueRender() {
    if (paint || !running || lost) return;
    paint = requestAnimationFrame(() => {
      paint = 0;
      render();
    });
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 650 ? 1.35 : 1.65));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = camera.aspect < .9 ? 54 : 50;
    camera.updateProjectionMatrix();
    if (bays[selected]) focus(selected, true, wide);
  }

  function loadPrint(path) {
    if (textures.has(path)) return textures.get(path);
    const job = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const texture = new CanvasTexture(img);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      };
      img.onerror = () => resolve(null);
      img.src = path;
    });
    textures.set(path, job);
    return job;
  }

  function warmPrints(index, count = 2) {
    for (let i = Math.max(0, index - count); i <= Math.min(bays.length - 1, index + count); i++) {
      const frameBay = bays[i];
      frameBay.ready ??= frameBay.load();
    }
  }

  function build(id, items) {
    if (room) {
      scene.remove(room);
      release(room);
    }
    cancelAnimationFrame(frame);
    frame = 0;
    room = new Group();
    const currentRoom = room;
    scene.add(room);
    bays.length = 0;
    marks.length = 0;
    selected = 0;

    const palette = rooms[id];
    const { wall, recess, floor, trim, light, wood, lookout } = palette;
    scene.background.set(lookout ? 0xc1ced0 : recess);
    scene.fog.color.copy(scene.background);
    key.color.set(light);

    const span = items.length * bay + 3.6;
    const half = span / 2;
    const tile = floorTextures[Number(!!wood)];
    tile.repeat.set(span / (wood ? 2.7 : .95), 11);
    const flooring = surface(floor, { map: tile, roughness: wood ? .57 : .72 });
    const plaster = surface(new Color(wall).multiplyScalar(1.2), { map: wallTexture });
    const panels = surface(recess);
    const shadowed = surface(0x242a28);
    const ceiling = surface(lookout ? 0x9eaaa3 : 0x64605a, { emissive: 0x1d1a16 });
    const metal = surface(trim, { metalness: .38, roughness: .43 });
    const mat = surface(0xe2d7c3, { roughness: .96, emissive: 0x25211c });
    const lamp = new MeshBasicMaterial({ color: light, toneMapped: false });
    const castShadow = new MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false, opacity: .76, toneMapped: false });
    const litPlaster = new MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, opacity: .31, toneMapped: false });
    const floorLight = new MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, opacity: .2, toneMapped: false });

    solid(room, flooring, span, .18, 12.6, 0, -.09, 1.56);
    solid(room, panels, span, wallHeight, .24, 0, wallHeight / 2, wallDepth - .22);
    solid(room, panels, span, .12, .16, 0, .092, wallDepth + .12);
    solid(room, metal, span, .012, .038, 0, .013, -2.25);
    solid(room, metal, span, .012, .038, 0, .013, 2.75);
    solid(room, shadowed, span, .085, .13, 0, 3.93, -2.8);
    for (const x of [-half, half]) {
      solid(room, plaster, .25, wallHeight, 12.4, x, wallHeight / 2, 1.65);
      solid(room, panels, 1.4, .11, 12.4, x, .08, 1.65);
    }
    if (!lookout) {
      solid(room, ceiling, span, .23, 12.5, 0, 4.53, 1.65);
      solid(room, panels, span, wallHeight, .2, 0, wallHeight / 2, 7.75);
      solid(room, panels, span, .095, .28, 0, 4.38, .25);
      solid(room, lamp, span, .016, .07, 0, 4.327, .25);
    } else {
      loadPrint('media/huanuco-valle-mini.webp').then(texture => {
        if (room !== currentRoom || !texture) return;
        plate(room, new MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }), span + 6, 8.5, 0, 6.95, -11.9);
        queueRender();
      });
      solid(room, ceiling, span, .17, 2.3, 0, 4.42, -3.53);
    }

    items.forEach((item, index) => {
      const x = (index - (items.length - 1) / 2) * bay;
      const group = new Group();
      group.position.x = x;
      room.add(group);
      const artY = 2.16;
      const printWidth = 2.86;
      const printHeight = 1.7;
      solid(group, plaster, bay - .055, 3.94, .17, 0, 1.97, wallDepth);
      solid(group, panels, .085, 4.06, .25, -bay / 2, 2.03, wallDepth + .06);
      solid(group, ceiling, bay - .04, .16, 1.05, 0, 4.14, wallDepth + .33);
      plate(group, litPlaster, bay - .07, 3.55, 0, 2.32, wallDepth + .087);
      const pool = plate(group, floorLight, 3.75, 4.7, 0, .011, -2.55);
      pool.rotation.x = -Math.PI / 2;
      plate(group, castShadow, 3.58, 2.64, .045, artY - .12, wallDepth + .093);
      solid(group, shadowed, 3.05, 1.94, .12, 0, artY, wallDepth + .13);
      solid(group, metal, 2.99, 1.88, .057, 0, artY, wallDepth + .211);
      const mark = solid(group, mat, printWidth, printHeight, .045, 0, artY, wallDepth + .249);
      mark.userData.index = index;
      marks.push(mark);
      plate(group, placard(item, index, items.length), 1.13, .365, .87, .94, wallDepth + .103);
      solid(group, shadowed, .58, .085, .17, 0, 3.91, -2.8);
      solid(group, lamp, .46, .021, .062, 0, 3.857, -2.83);
      if (index % 3 === 0) {
        solid(group, plaster, .22, 4.32, .63, -bay / 2, 2.16, -3.86);
        solid(group, panels, 2, .14, .64, 1.18, .48, 1.49);
        solid(group, shadowed, 1.73, .38, .13, 1.18, .20, 1.49);
      }

      bays.push({
        group,
        load: () => loadPrint(item.thumb).then(texture => {
          if (room !== currentRoom || !texture) return;
          const ratio = texture.image.naturalWidth / texture.image.naturalHeight;
          const height = Math.min(printHeight - .11, (printWidth - .17) / ratio);
          const print = plate(group, new MeshBasicMaterial({ map: texture, toneMapped: false }), height * ratio, height, 0, artY, wallDepth + .274);
          print.userData.index = index;
          marks.push(print);
          queueRender();
        }),
      });
    });
    resize();
  }

  function positionFor(index) { return bays[index]?.group.position.x ?? 0; }

  function framingDistance() {
    const angle = Math.tan(camera.fov * Math.PI / 360);
    return Math.max(3.85, Math.min(5.35, 1.72 / (angle * camera.aspect)));
  }

  function pose() {
    camera.lookAt(look);
    render();
  }

  function tick(now) {
    frame = 0;
    if (!running || lost) return;
    const t = Math.min(1, (now - travelStart) / travelDuration);
    const ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(fromPosition, destination, ease);
    look.lerpVectors(fromLook, toLook, ease);
    pose();
    if (t < 1) frame = requestAnimationFrame(tick);
  }

  function focus(index, instant = false, overview = wide) {
    if (!bays[index]) return;
    selected = index;
    wide = overview;
    warmPrints(index, wide ? 5 : 2);
    const x = positionFor(index);
    const direction = index < (bays.length - 1) / 2 ? 1 : -1;
    const distance = framingDistance();
    const angle = camera.aspect < .9 ? .12 : .48;
    if (wide) {
      destination.set(x - direction * 1.44, eye + .22, wallDepth + Math.max(7, distance + 1.8));
      toLook.set(x + direction * (camera.aspect < .9 ? .66 : 1.6), 1.87, wallDepth);
    } else {
      destination.set(x - direction * angle, eye, wallDepth + distance);
      toLook.set(x, 1.94, wallDepth);
    }
    cancelAnimationFrame(frame);
    frame = 0;
    if (instant || !running || camera.position.lengthSq() === 0) {
      camera.position.copy(destination);
      look.copy(toLook);
      pose();
    } else {
      fromPosition.copy(camera.position);
      fromLook.copy(look);
      travelStart = performance.now();
      travelDuration = Math.min(660, 360 + 28 * camera.position.distanceTo(destination));
      frame = requestAnimationFrame(tick);
    }
    return bays[index].ready;
  }

  function preview(offset, index) {
    if (!bays[index]) return;
    cancelAnimationFrame(frame);
    frame = 0;
    const center = positionFor(index);
    const x = Math.max(positionFor(0) - .58, Math.min(positionFor(bays.length - 1) + .58, center + offset));
    warmPrints(Math.max(0, Math.min(bays.length - 1, index + Math.round(offset / bay))), wide ? 5 : 2);
    const distance = framingDistance();
    camera.position.set(x, eye + (wide ? .22 : 0), wallDepth + (wide ? Math.max(7, distance + 1.8) : distance));
    look.set(x + (x - center) * .20, wide ? 1.87 : 1.94, wallDepth);
    pose();
  }

  function toggle(active) {
    running = active && !lost;
    if (running) resize();
    else {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(paint);
      frame = 0;
      paint = 0;
    }
  }

  host.addEventListener('pointerdown', event => {
    pressPosition = event.isPrimary && event.button === 0 ? [event.clientX, event.clientY] : undefined;
  });
  host.addEventListener('pointercancel', () => { pressPosition = undefined; });
  host.addEventListener('click', event => {
    if (!running || !pressPosition || Math.hypot(event.clientX - pressPosition[0], event.clientY - pressPosition[1]) > 9) return;
    const bounds = host.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) * 2 / bounds.width - 1, 1 - (event.clientY - bounds.top) * 2 / bounds.height);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(marks.filter(mark => mark.parent.visible), false)[0];
    if (!hit) return;
    const index = hit.object.userData.index;
    onChoose(index, selected === index);
  });

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
    toggle(false);
    onUnavailable();
  });
  new ResizeObserver(resize).observe(host);
  return { build, focus, preview, toggle };
}

window.createMuseumScene = exhibition;
