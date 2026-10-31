import { downloadBlob, fileExtension, mediaError, recorderMime } from '../ui.js';

let alive = false;
let stream = null;
let recorder = null;
let audioContext = null;
let frame = 0;
let blobUrl = '';

function release() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  audioContext?.close().catch(() => {});
  audioContext = null;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = '';
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function mount(root) {
  alive = true;
  const supported = Boolean(navigator.mediaDevices?.getUserMedia) && 'MediaRecorder' in window;

  root.innerHTML = `
    <section class="stack">
      <p class="lead">MediaRecorder guarda el micrófono. Un AnalyserNode de Web Audio dibuja la onda mientras hablas.</p>
      <p id="audio-support" class="banner ${supported ? 'ok' : 'warn'}">${supported
        ? 'Activa el micrófono y luego pulsa Grabar.'
        : 'Este navegador no puede grabar audio.'}</p>
      <div class="actions">
        <button id="mic-start" type="button" ${supported ? '' : 'disabled'}>Activar micrófono</button>
        <button id="mic-record" type="button" disabled>Grabar</button>
        <button id="mic-stop" class="ghost" type="button" disabled>Detener</button>
        <button id="mic-off" class="ghost" type="button" disabled>Apagar micrófono</button>
        <button id="mic-download" class="ghost" type="button" hidden>Descargar</button>
        <strong id="mic-time">00:00</strong>
      </div>
      <canvas id="wave" class="preview canvas-preview" width="960" height="180"></canvas>
      <audio id="mic-playback" controls hidden></audio>
    </section>
  `;

  const support = root.querySelector('#audio-support');
  const canvas = root.querySelector('#wave');
  const playback = root.querySelector('#mic-playback');
  const start = root.querySelector('#mic-start');
  const record = root.querySelector('#mic-record');
  const stop = root.querySelector('#mic-stop');
  const off = root.querySelector('#mic-off');
  const download = root.querySelector('#mic-download');
  const timer = root.querySelector('#mic-time');
  const context = canvas.getContext('2d');
  let analyser = null;
  let samples = null;
  let chunks = [];
  let clip = null;
  let mime = '';
  let startedAt = 0;
  let clock = 0;

  function drawIdle() {
    context.fillStyle = '#050705';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#31392a';
    context.beginPath();
    context.moveTo(0, canvas.height / 2);
    context.lineTo(canvas.width, canvas.height / 2);
    context.stroke();
  }

  function drawWave() {
    if (!alive || !analyser) return;
    analyser.getByteTimeDomainData(samples);
    context.fillStyle = '#050705';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 3;
    context.strokeStyle = '#e7ff3d';
    context.beginPath();
    const step = canvas.width / samples.length;
    for (let index = 0; index < samples.length; index += 1) {
      const y = (samples[index] / 255) * canvas.height;
      if (index === 0) context.moveTo(0, y);
      else context.lineTo(index * step, y);
    }
    context.stroke();
    frame = requestAnimationFrame(drawWave);
  }

  function forgetClip() {
    clip = null;
    playback.hidden = true;
    playback.removeAttribute('src');
    download.hidden = true;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = '';
  }

  function stopClock() {
    clearInterval(clock);
    clock = 0;
  }

  drawIdle();

  start.addEventListener('click', async () => {
    try {
      release();
      alive = true;
      drawIdle();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!alive) {
        release();
        return;
      }
      audioContext = new AudioContext();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      samples = new Uint8Array(analyser.fftSize);
      drawWave();
      start.disabled = true;
      record.disabled = false;
      off.disabled = false;
      support.className = 'banner ok';
      support.textContent = 'Micrófono activo. La onda se mueve con tu voz.';
    } catch (error) {
      support.className = 'banner bad';
      support.textContent = mediaError(error);
    }
  });

  record.addEventListener('click', () => {
    if (!stream) return;
    mime = recorderMime('audio');
    chunks = [];
    forgetClip();
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (error) {
      support.className = 'banner bad';
      support.textContent = mediaError(error);
      return;
    }
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      stopClock();
      if (!chunks.length || !alive) return;
      clip = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
      blobUrl = URL.createObjectURL(clip);
      playback.src = blobUrl;
      playback.hidden = false;
      download.hidden = false;
      record.disabled = !stream;
      stop.disabled = true;
      support.className = 'banner ok';
      support.textContent = 'Grabación lista. Puedes oírla abajo o descargarla.';
    });
    recorder.start();
    startedAt = performance.now();
    timer.textContent = '00:00';
    stopClock();
    clock = setInterval(() => {
      timer.textContent = formatTime(performance.now() - startedAt);
    }, 200);
    record.disabled = true;
    stop.disabled = false;
    support.className = 'banner warn';
    support.textContent = 'Grabando…';
  });

  stop.addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') recorder.stop();
  });

  off.addEventListener('click', () => {
    release();
    alive = true;
    drawIdle();
    timer.textContent = '00:00';
    start.disabled = !supported;
    record.disabled = true;
    stop.disabled = true;
    off.disabled = true;
    forgetClip();
    support.className = 'banner';
    support.textContent = 'Micrófono apagado.';
  });

  download.addEventListener('click', () => {
    if (!clip) return;
    downloadBlob(clip, `audio.${fileExtension(clip.type)}`);
  });
}

export function unmount() {
  alive = false;
  release();
}
