import { bitmapFromFile, nextFrame, openCamera, stopStream } from '../camera.js';
import { mediaError } from '../ui.js';

let alive = false;
let stream = null;

export function mount(root) {
  alive = true;
  stream = null;
  const supported = 'FaceDetector' in window;

  root.innerHTML = `
    <section class="stack">
      <p class="lead">Shape Detection API marca los rostros que encuentra. Funciona sobre todo en Chrome para Android. En el computador a veces hay que activar la API experimental.</p>
      <p id="face-support" class="banner ${supported ? 'ok' : 'warn'}">${supported
        ? 'FaceDetector está disponible. Enciende la cámara o elige una foto.'
        : 'Este navegador no tiene FaceDetector. Chrome de escritorio puede no incluirlo; pruébalo en Chrome para Android.'}</p>
      <div class="actions">
        <button id="face-start" type="button" ${supported ? '' : 'disabled'}>Encender cámara</button>
        <button id="face-flip" class="ghost" type="button" disabled>Cambiar cámara</button>
        <button id="face-stop" class="ghost" type="button" disabled>Apagar</button>
        <label>Foto
          <input id="face-file" type="file" accept="image/*" ${supported ? '' : 'disabled'}>
        </label>
      </div>
      <p id="face-count" class="banner">Rostros: 0</p>
      <canvas id="face-canvas" class="preview canvas-preview" width="960" height="540"></canvas>
      <video id="face-video" playsinline muted autoplay hidden></video>
    </section>
  `;

  const canvas = root.querySelector('#face-canvas');
  const video = root.querySelector('#face-video');
  const count = root.querySelector('#face-count');
  const support = root.querySelector('#face-support');
  const start = root.querySelector('#face-start');
  const flip = root.querySelector('#face-flip');
  const stop = root.querySelector('#face-stop');
  const file = root.querySelector('#face-file');
  const context = canvas.getContext('2d');
  let facing = 'user';
  let mode = 'idle';
  let latest = [];
  let generation = 0;

  const detector = supported ? new FaceDetector({ fastMode: true, maxDetectedFaces: 8 }) : null;

  function paint(source, faces) {
    const width = source.videoWidth || source.width || source.naturalWidth || 960;
    const height = source.videoHeight || source.height || source.naturalHeight || 540;
    if (!width || !height) return;
    canvas.width = width;
    canvas.height = height;
    context.drawImage(source, 0, 0, width, height);
    context.lineWidth = Math.max(3, width / 220);
    context.strokeStyle = '#e7ff3d';
    context.fillStyle = '#ff5d3a';
    for (const face of faces) {
      const box = face.boundingBox;
      if (!box) continue;
      context.strokeRect(box.x, box.y, box.width, box.height);
      for (const landmark of face.landmarks || []) {
        for (const point of landmark.locations || []) {
          context.beginPath();
          context.arc(point.x, point.y, Math.max(2, width / 280), 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    count.textContent = faces.length === 1 ? 'Rostros: 1' : `Rostros: ${faces.length}`;
  }

  async function loop(ticket) {
    while (alive && mode === 'camera' && ticket === generation) {
      if (video.readyState >= 2) {
        try {
          latest = await detector.detect(video);
        } catch (error) {
          support.className = 'banner bad';
          support.textContent = mediaError(error);
          mode = 'idle';
          break;
        }
        if (alive && mode === 'camera' && ticket === generation) paint(video, latest);
      }
      await nextFrame();
    }
  }

  async function begin() {
    const ticket = ++generation;
    support.className = 'banner';
    support.textContent = 'Abriendo la cámara…';
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
    support.textContent = facing === 'user' ? 'Cámara frontal activa.' : 'Cámara trasera activa.';
    loop(ticket);
  }

  start.addEventListener('click', () => begin().catch((error) => {
    support.className = 'banner bad';
    support.textContent = mediaError(error);
  }));

  flip.addEventListener('click', () => {
    facing = facing === 'user' ? 'environment' : 'user';
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
    start.disabled = false;
    flip.disabled = true;
    stop.disabled = true;
    support.className = 'banner';
    support.textContent = 'Cámara apagada.';
  });

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen || !detector) return;
    generation += 1;
    mode = 'file';
    stopStream(stream);
    stream = null;
    start.disabled = false;
    flip.disabled = true;
    stop.disabled = true;
    try {
      const bitmap = await bitmapFromFile(chosen);
      const faces = await detector.detect(bitmap);
      if (!alive) return;
      paint(bitmap, faces);
      support.className = 'banner ok';
      support.textContent = 'Detección hecha sobre la imagen elegida.';
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
