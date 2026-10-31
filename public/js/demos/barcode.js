import { bitmapFromFile, nextFrame, openCamera, stopStream } from '../camera.js';
import { mediaError } from '../ui.js';

let alive = false;
let stream = null;

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

export function mount(root) {
  alive = true;
  stream = null;
  const supported = 'BarcodeDetector' in window;

  root.innerHTML = `
    <section class="stack">
      <p class="lead">Barcode Detection API lee códigos de barras y QR. Si el contenido es una dirección web, la página pregunta antes de abrirla.</p>
      <p id="code-support" class="banner ${supported ? 'ok' : 'warn'}">${supported
        ? 'BarcodeDetector está disponible.'
        : 'Este navegador no tiene BarcodeDetector. Pruébalo en Chrome para escritorio o Android. En Safari de iOS 18 esta función no responde.'}</p>
      <div class="actions">
        <button id="code-start" type="button" ${supported ? '' : 'disabled'}>Escanear con la cámara</button>
        <button id="code-flip" class="ghost" type="button" disabled>Cambiar cámara</button>
        <button id="code-stop" class="ghost" type="button" disabled>Apagar</button>
        <label>Imagen
          <input id="code-file" type="file" accept="image/*" ${supported ? '' : 'disabled'}>
        </label>
      </div>
      <ul id="code-list" class="list"><li>Todavía no hay lecturas.</li></ul>
      <canvas id="code-canvas" class="preview canvas-preview" width="960" height="540"></canvas>
      <video id="code-video" playsinline muted autoplay hidden></video>
    </section>
  `;

  const canvas = root.querySelector('#code-canvas');
  const video = root.querySelector('#code-video');
  const list = root.querySelector('#code-list');
  const support = root.querySelector('#code-support');
  const start = root.querySelector('#code-start');
  const flip = root.querySelector('#code-flip');
  const stop = root.querySelector('#code-stop');
  const file = root.querySelector('#code-file');
  const context = canvas.getContext('2d');
  let facing = 'environment';
  let mode = 'idle';
  let detector = null;
  let generation = 0;
  let lastAsked = '';
  let seen = [];

  async function prepare() {
    if (detector) return detector;
    const formats = typeof BarcodeDetector.getSupportedFormats === 'function'
      ? await BarcodeDetector.getSupportedFormats()
      : undefined;
    detector = new BarcodeDetector(formats ? { formats } : undefined);
    return detector;
  }

  function showCodes(codes) {
    list.replaceChildren();
    if (!codes.length) {
      const item = document.createElement('li');
      item.textContent = 'Buscando un código…';
      list.append(item);
      return;
    }
    for (const code of codes) {
      const item = document.createElement('li');
      item.textContent = `${code.format || 'código'}: ${code.rawValue || '(vacío)'}`;
      list.append(item);
    }
  }

  function paint(source, codes) {
    const width = source.videoWidth || source.width || source.naturalWidth || 960;
    const height = source.videoHeight || source.height || source.naturalHeight || 540;
    if (!width || !height) return;
    canvas.width = width;
    canvas.height = height;
    context.drawImage(source, 0, 0, width, height);
    context.lineWidth = Math.max(3, width / 180);
    context.strokeStyle = '#e7ff3d';
    context.fillStyle = '#10140f';
    context.font = `${Math.max(18, width / 36)}px Segoe UI, sans-serif`;
    for (const code of codes) {
      const points = code.cornerPoints || [];
      if (points.length) {
        context.beginPath();
        points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.stroke();
      } else if (code.boundingBox) {
        const box = code.boundingBox;
        context.strokeRect(box.x, box.y, box.width, box.height);
      }
    }
    showCodes(codes);
  }

  function maybeOpen(codes) {
    const url = codes.map((code) => code.rawValue).find(isUrl);
    if (!url || url === lastAsked) return;
    lastAsked = url;
    if (window.confirm(`Se leyó una dirección:\n${url}\n\n¿Quieres abrirla en otra pestaña?`)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function loop(ticket) {
    const reader = await prepare();
    while (alive && mode === 'camera' && ticket === generation) {
      if (video.readyState >= 2) {
        try {
          seen = await reader.detect(video);
        } catch (error) {
          support.className = 'banner bad';
          support.textContent = mediaError(error);
          mode = 'idle';
          break;
        }
        if (alive && mode === 'camera' && ticket === generation) {
          paint(video, seen);
          maybeOpen(seen);
        }
      }
      await nextFrame();
    }
  }

  async function begin() {
    const ticket = ++generation;
    support.className = 'banner';
    support.textContent = 'Abriendo la cámara…';
    await prepare();
    if (!alive || ticket !== generation) return;
    stopStream(stream);
    stream = await openCamera(facing);
    if (!alive || ticket !== generation) {
      stopStream(stream);
      stream = null;
      return;
    }
    video.srcObject = stream;
    await video.play();
    mode = 'camera';
    start.disabled = true;
    flip.disabled = false;
    stop.disabled = false;
    support.className = 'banner ok';
    support.textContent = 'Apunta al código. La lectura se repite sola.';
    loop(ticket);
  }

  start.addEventListener('click', () => begin().catch((error) => {
    support.className = 'banner bad';
    support.textContent = mediaError(error);
  }));

  flip.addEventListener('click', () => {
    facing = facing === 'environment' ? 'user' : 'environment';
    begin().catch((error) => {
      support.className = 'banner bad';
      support.textContent = mediaError(error);
    });
  });

  stop.addEventListener('click', () => {
    generation += 1;
    mode = 'idle';
    stopStream(stream);
    stream = null;
    video.srcObject = null;
    start.disabled = !supported;
    flip.disabled = true;
    stop.disabled = true;
    support.className = 'banner';
    support.textContent = 'Cámara apagada.';
  });

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    generation += 1;
    mode = 'file';
    stopStream(stream);
    stream = null;
    start.disabled = !supported;
    flip.disabled = true;
    stop.disabled = true;
    try {
      const reader = await prepare();
      const bitmap = await bitmapFromFile(chosen);
      const codes = await reader.detect(bitmap);
      if (!alive) return;
      paint(bitmap, codes);
      maybeOpen(codes);
      support.className = codes.length ? 'banner ok' : 'banner warn';
      support.textContent = codes.length ? 'Se leyó la imagen elegida.' : 'No se encontró un código en esa imagen.';
      if (typeof bitmap.close === 'function') bitmap.close();
    } catch (error) {
      support.className = 'banner bad';
      support.textContent = mediaError(error);
    }
  });
}

export function unmount() {
  alive = false;
  stopStream(stream);
  stream = null;
}
