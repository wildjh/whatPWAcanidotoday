let alive = false;
let orientationHandler = null;

function numberOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value, digits = 0, suffix = '') {
  const number = numberOf(value);
  if (number === null) return '—';
  return `${number.toFixed(digits)}${suffix}`;
}

async function askPermission(EventType) {
  if (!EventType || typeof EventType.requestPermission !== 'function') return 'granted';
  return EventType.requestPermission();
}

function detach() {
  if (!orientationHandler) return;
  window.removeEventListener('deviceorientation', orientationHandler);
  window.removeEventListener('deviceorientationabsolute', orientationHandler);
  orientationHandler = null;
}

export function mount(root) {
  detach();
  alive = true;
  const supported = 'DeviceOrientationEvent' in window;

  root.innerHTML = `
    <section class="stack">
      <p class="lead">DeviceOrientationEvent informa cómo está inclinado el aparato. En iPhone hay que pulsar el botón: el permiso solo vale dentro de ese toque. En Android usa HTTPS.</p>
      <p id="ori-support" class="banner ${supported ? '' : 'warn'}">${supported
        ? 'Pulsa el botón y mueve el teléfono.'
        : 'Este navegador no envía la orientación del dispositivo.'}</p>
      <div class="actions">
        <button id="ori-start" type="button" ${supported ? '' : 'disabled'}>Leer orientación</button>
      </div>
      <div class="sensors">
        <div class="phone-wrap">
          <div id="phone" class="phone"><div class="phone-screen">PWA</div></div>
        </div>
        <div class="stack">
          <div class="compass" aria-hidden="true"><div id="needle" class="needle"></div></div>
          <div class="readout">
            <div><span>Alpha (brújula)</span><strong id="alpha">—</strong></div>
            <div><span>Beta (frente)</span><strong id="beta">—</strong></div>
            <div><span>Gamma (lado)</span><strong id="gamma">—</strong></div>
          </div>
        </div>
      </div>
    </section>
  `;

  const support = root.querySelector('#ori-support');
  const phone = root.querySelector('#phone');
  const needle = root.querySelector('#needle');
  const alphaEl = root.querySelector('#alpha');
  const betaEl = root.querySelector('#beta');
  const gammaEl = root.querySelector('#gamma');
  const start = root.querySelector('#ori-start');
  let sawData = false;

  orientationHandler = function onOrientation(event) {
    if (!alive) return;
    const alpha = numberOf(event.webkitCompassHeading) ?? numberOf(event.alpha);
    const beta = numberOf(event.beta);
    const gamma = numberOf(event.gamma);
    alphaEl.textContent = text(alpha, 0, '°');
    betaEl.textContent = text(beta, 0, '°');
    gammaEl.textContent = text(gamma, 0, '°');
    if (alpha !== null) needle.style.transform = `rotate(${alpha}deg)`;
    const tiltX = beta === null ? 0 : Math.max(-55, Math.min(55, beta - 35));
    const tiltY = gamma === null ? 0 : Math.max(-55, Math.min(55, gamma));
    phone.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    if (alpha !== null || beta !== null || gamma !== null) {
      sawData = true;
      support.className = 'banner ok';
      support.textContent = event.absolute ? 'Orientación absoluta activa.' : 'El dispositivo está enviando su inclinación.';
    }
  }

  start.addEventListener('click', async () => {
    try {
      const permission = await askPermission(window.DeviceOrientationEvent);
      if (!alive) return;
      if (permission !== 'granted') {
        support.className = 'banner bad';
        support.textContent = 'Permiso de orientación denegado.';
        return;
      }
      window.addEventListener('deviceorientation', orientationHandler);
      window.addEventListener('deviceorientationabsolute', orientationHandler);
      start.disabled = true;
      support.className = 'banner';
      support.textContent = 'Esperando datos del sensor… Si no cambian, este equipo no tiene brújula o acelerómetro.';
      window.setTimeout(() => {
        if (!alive || sawData) return;
        support.className = 'banner warn';
        support.textContent = 'No llegaron datos. Ábrelo en un teléfono, en HTTPS, y acepta el permiso de movimiento.';
      }, 2500);
    } catch (error) {
      support.className = 'banner bad';
      support.textContent = error.message || 'No se pudo pedir el permiso.';
    }
  });
}

export function unmount() {
  alive = false;
  detach();
}
