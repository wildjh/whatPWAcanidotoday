import { downloadBlob, fileExtension, mediaError, recorderMime } from '../ui.js';

let alive = false;
let stream = null;
let recorder = null;
let blobUrl = '';

function release() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = '';
}

export function mount(root) {
  alive = true;
  const supported = Boolean(navigator.mediaDevices?.getDisplayMedia);
  const zoomSupported = 'CaptureController' in window;

  root.innerHTML = `
    <section class="stack">
      <p class="lead">getDisplayMedia captura una pantalla, una ventana o una pestaña. Si eliges una pestaña y el navegador lo permite, los botones de zoom usan Captured Surface Control.</p>
      <p id="screen-support" class="banner ${supported ? 'ok' : 'warn'}">${supported
        ? 'Puedes elegir qué compartir. El navegador muestra su propio cuadro de selección.'
        : 'Este navegador no permite capturar la pantalla.'}</p>
      <div class="actions">
        <button id="screen-start" type="button" ${supported ? '' : 'disabled'}>Compartir pantalla</button>
        <button id="screen-record" type="button" disabled>Grabar</button>
        <button id="screen-stop-record" class="ghost" type="button" disabled>Detener grabación</button>
        <button id="screen-stop" class="ghost" type="button" disabled>Dejar de compartir</button>
        <button id="zoom-in" class="ghost" type="button" hidden>Acercar</button>
        <button id="zoom-out" class="ghost" type="button" hidden>Alejar</button>
        <button id="zoom-reset" class="ghost" type="button" hidden>Zoom normal</button>
        <button id="screen-download" class="ghost" type="button" hidden>Descargar</button>
      </div>
      <video id="screen-video" class="preview" playsinline autoplay muted></video>
      <video id="screen-playback" class="preview" controls hidden></video>
    </section>
  `;

  const support = root.querySelector('#screen-support');
  const video = root.querySelector('#screen-video');
  const playback = root.querySelector('#screen-playback');
  const start = root.querySelector('#screen-start');
  const record = root.querySelector('#screen-record');
  const stopRecord = root.querySelector('#screen-stop-record');
  const stop = root.querySelector('#screen-stop');
  const download = root.querySelector('#screen-download');
  const zoomIn = root.querySelector('#zoom-in');
  const zoomOut = root.querySelector('#zoom-out');
  const zoomReset = root.querySelector('#zoom-reset');
  let controller = null;
  let chunks = [];
  let clip = null;
  let mime = '';

  function setZoomVisible(value) {
    zoomIn.hidden = !value;
    zoomOut.hidden = !value;
    zoomReset.hidden = !value;
  }

  async function zoom(method) {
    if (!controller || typeof controller[method] !== 'function') return;
    try {
      await controller[method]();
      support.className = 'banner ok';
      support.textContent = 'Se envió el cambio de zoom a la superficie capturada.';
    } catch (error) {
      support.className = 'banner warn';
      support.textContent = error.message || 'Esta captura no acepta zoom. Prueba compartiendo una pestaña.';
    }
  }

  function forgetClip() {
    clip = null;
    playback.hidden = true;
    playback.removeAttribute('src');
    download.hidden = true;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = '';
  }

  function endShare() {
    if (recorder && recorder.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    controller = null;
    video.srcObject = null;
    start.disabled = !supported;
    record.disabled = true;
    stopRecord.disabled = true;
    stop.disabled = true;
    setZoomVisible(false);
  }

  start.addEventListener('click', async () => {
    try {
      forgetClip();
      endShare();
      const options = { video: true, audio: true };
      if (zoomSupported) {
        controller = new CaptureController();
        if (typeof controller.setFocusBehavior === 'function') {
          try { controller.setFocusBehavior('no-focus-change'); } catch { /* el navegador puede rechazar el modo */ }
        }
        options.controller = controller;
      }
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(options);
      } catch (error) {
        if (error.name === 'NotAllowedError' || error.name === 'AbortError') throw error;
        delete options.audio;
        delete options.controller;
        controller = null;
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }
      if (!alive) {
        endShare();
        return;
      }
      video.srcObject = stream;
      await video.play();
      const [track] = stream.getVideoTracks();
      const settings = track.getSettings();
      track.addEventListener('ended', () => {
        if (!alive) return;
        support.className = 'banner';
        support.textContent = 'Dejaste de compartir.';
        endShare();
      });
      start.disabled = true;
      record.disabled = typeof MediaRecorder === 'undefined';
      stop.disabled = false;
      const canZoom = controller && typeof controller.increaseZoomLevel === 'function';
      setZoomVisible(canZoom);
      support.className = 'banner ok';
      support.textContent = `Compartiendo ${settings.width || '?'}×${settings.height || '?'}${canZoom ? '. El zoom solo aplica a algunas pestañas.' : '.'}`;
    } catch (error) {
      support.className = 'banner bad';
      support.textContent = mediaError(error);
      endShare();
    }
  });

  record.addEventListener('click', () => {
    if (!stream) return;
    mime = recorderMime('video');
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
      if (!chunks.length || !alive) return;
      clip = new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' });
      blobUrl = URL.createObjectURL(clip);
      playback.src = blobUrl;
      playback.hidden = false;
      download.hidden = false;
      record.disabled = !stream;
      stopRecord.disabled = true;
      support.className = 'banner ok';
      support.textContent = 'Grabación lista para reproducir o descargar.';
    });
    recorder.start();
    record.disabled = true;
    stopRecord.disabled = false;
    support.className = 'banner warn';
    support.textContent = 'Grabando la captura…';
  });

  stopRecord.addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') recorder.stop();
  });

  stop.addEventListener('click', () => {
    support.className = 'banner';
    support.textContent = 'Se detuvo la captura.';
    endShare();
  });

  download.addEventListener('click', () => {
    if (!clip) return;
    downloadBlob(clip, `captura.${fileExtension(clip.type)}`);
  });

  zoomIn.addEventListener('click', () => zoom('increaseZoomLevel'));
  zoomOut.addEventListener('click', () => zoom('decreaseZoomLevel'));
  zoomReset.addEventListener('click', () => zoom('resetZoomLevel'));
}

export function unmount() {
  alive = false;
  release();
}
