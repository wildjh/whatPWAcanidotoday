import * as auth from './demos/auth.js';
import * as face from './demos/face.js';
import * as barcode from './demos/barcode.js';
import * as screenDemo from './demos/screen.js';
import * as audio from './demos/audio.js';
import * as orientation from './demos/orientation.js';
import * as motion from './demos/motion.js';
import * as touch from './demos/multitouch.js';
import * as transitions from './demos/transitions.js';

const demos = {
  auth,
  face,
  barcode,
  screen: screenDemo,
  audio,
  orientation,
  motion,
  touch,
  transitions,
};

const mobile = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent);

const catalog = [
  {
    id: 'auth',
    mark: '01',
    title: 'Autenticación',
    text: 'Registra una huella, Face ID o una llave de seguridad y entra sin contraseña.',
    support: () => (window.PublicKeyCredential ? 'ok' : 'no'),
    ok: 'Disponible aquí',
    no: 'WebAuthn no está disponible',
  },
  {
    id: 'face',
    mark: '02',
    title: 'Detección de rostros',
    text: 'Busca caras en la cámara o en una foto con la Shape Detection API.',
    support: () => ('FaceDetector' in window ? 'ok' : 'no'),
    ok: 'Disponible aquí',
    no: 'FaceDetector no está en este navegador',
  },
  {
    id: 'barcode',
    mark: '03',
    title: 'Códigos de barras',
    text: 'Lee códigos de barras y QR con la cámara o desde una imagen.',
    support: () => ('BarcodeDetector' in window ? 'ok' : 'no'),
    ok: 'Disponible aquí',
    no: 'BarcodeDetector no está en este navegador',
  },
  {
    id: 'screen',
    mark: '04',
    title: 'Captura de pantalla',
    text: 'Comparte una pantalla, ventana o pestaña y graba lo que se está viendo.',
    support: () => (navigator.mediaDevices?.getDisplayMedia ? 'ok' : 'no'),
    ok: 'Disponible aquí',
    no: 'getDisplayMedia no está disponible',
  },
  {
    id: 'audio',
    mark: '05',
    title: 'Grabación de audio',
    text: 'Graba el micrófono y dibuja la onda en vivo con Web Audio.',
    support: () => (navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in window ? 'ok' : 'no'),
    ok: 'Disponible aquí',
    no: 'MediaRecorder no está disponible',
  },
  {
    id: 'orientation',
    mark: '06',
    title: 'Orientación',
    text: 'Inclina el teléfono para ver alpha, beta y gamma.',
    support: () => ('DeviceOrientationEvent' in window ? (mobile ? 'ok' : 'maybe') : 'no'),
    ok: 'Disponible aquí',
    maybe: 'Mejor en el teléfono',
    no: 'Sin DeviceOrientationEvent',
  },
  {
    id: 'motion',
    mark: '07',
    title: 'Movimiento',
    text: 'Mide aceleración, giro y sacudidas del dispositivo.',
    support: () => ('DeviceMotionEvent' in window ? (mobile ? 'ok' : 'maybe') : 'no'),
    ok: 'Disponible aquí',
    maybe: 'Mejor en el teléfono',
    no: 'Sin DeviceMotionEvent',
  },
  {
    id: 'touch',
    mark: '08',
    title: 'Multitáctil',
    text: 'Sigue varios dedos a la vez y la distancia de un pellizco.',
    support: () => {
      if (navigator.maxTouchPoints > 1) return 'ok';
      if (navigator.maxTouchPoints > 0) return 'maybe';
      return 'maybe';
    },
    ok: 'Varios dedos disponibles',
    maybe: 'En el teléfono se ven varios dedos',
    no: 'Sin eventos táctiles',
  },
  {
    id: 'transitions',
    mark: '09',
    title: 'View Transitions',
    text: 'Anima el cambio entre páginas como en una aplicación instalada.',
    support: () => (document.startViewTransition ? 'ok' : 'no'),
    ok: 'Disponible aquí',
    no: 'startViewTransition no está disponible',
  },
];

const view = document.querySelector('#view');
const back = document.querySelector('#back');
const title = document.querySelector('#title');
const kicker = document.querySelector('#kicker');
let current = null;

function pill(item) {
  const state = item.support();
  const label = item[state] || item.no;
  const kind = state === 'ok' ? 'ok' : state === 'no' ? 'warn' : '';
  return `<span class="pill ${kind}">${label}</span>`;
}

function homeMarkup() {
  const cards = catalog.map((item) => `
    <button class="card" type="button" data-open="${item.id}">
      <span class="mark">${item.mark}</span>
      <span>
        <span class="card-title">${item.title}</span>
        <span class="card-text">${item.text}</span>
        ${pill(item)}
      </span>
    </button>
  `).join('');

  return `
    <section class="stack">
      <p class="lead">Nueve capacidades del sitio whatpwacando.today, hechas en este proyecto de Node.js. Entra a cada una con su botón. En el teléfono usa la dirección HTTPS para cámara, micrófono, huella y sensores.</p>
      <div class="grid">${cards}</div>
      <footer class="foot">
        <p>Referencia de la actividad: <a href="https://whatpwacando.today/">whatpwacando.today</a></p>
        <p id="origins">Buscando direcciones del servidor…</p>
      </footer>
    </section>
  `;
}

async function showOrigins() {
  const slot = document.querySelector('#origins');
  if (!slot) return;
  try {
    const info = await fetch('/api/info').then((response) => response.json());
    const lines = [`Este equipo: http://localhost:${info.httpPort}`];
    if (info.https) {
      for (const address of info.addresses) {
        if (address === 'localhost') continue;
        lines.push(`Teléfono: https://${address}:${info.httpsPort}`);
      }
    }
    slot.textContent = lines.join(' · ');
  } catch {
    slot.textContent = location.origin;
  }
}

function render(id) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) {
    kicker.textContent = 'Demos PWA';
    title.textContent = 'Qué puede hacer hoy';
    document.title = 'Qué puede hacer una PWA';
    back.hidden = true;
    view.innerHTML = homeMarkup();
    view.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => navigate(button.dataset.open, 'forward'));
    });
    showOrigins();
    return;
  }

  kicker.textContent = `Demo ${item.mark}`;
  title.textContent = item.title;
  document.title = `${item.title} · PWA`;
  back.hidden = false;
  view.replaceChildren();
  demos[id].mount(view);
  current = demos[id];
}

function cleanup() {
  current?.unmount?.();
  current = null;
}

function navigate(id, direction) {
  const root = document.documentElement;
  root.classList.toggle('back-transition', direction === 'back');
  const swap = () => {
    cleanup();
    render(id);
  };

  if (typeof document.startViewTransition !== 'function') {
    swap();
    return;
  }

  try {
    const transition = document.startViewTransition(swap);
    transition.finished.finally(() => root.classList.remove('back-transition'));
  } catch {
    swap();
    root.classList.remove('back-transition');
  }
}

back.addEventListener('click', () => navigate('home', 'back'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !back.hidden) navigate('home', 'back');
});

render('home');
