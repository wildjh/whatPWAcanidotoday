let alive = false;
let motionHandler = null;

function numberOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value) {
  const number = numberOf(value);
  return number === null ? '—' : number.toFixed(2);
}

function percent(value) {
  const number = numberOf(value) ?? 0;
  const clamped = Math.max(-20, Math.min(20, number));
  return ((clamped + 20) / 40) * 100;
}

async function askPermission(EventType) {
  if (!EventType || typeof EventType.requestPermission !== 'function') return 'granted';
  return EventType.requestPermission();
}

function detach() {
  if (!motionHandler) return;
  window.removeEventListener('devicemotion', motionHandler);
  motionHandler = null;
}

export function mount(root) {
  detach();
  alive = true;
  const supported = 'DeviceMotionEvent' in window;

  root.innerHTML = `
    <section class="stack">
      <p class="lead">DeviceMotionEvent entrega la aceleración y la velocidad de giro. Sacude el teléfono: el contador sube cuando el cambio es brusco. En iPhone el permiso se pide con el botón.</p>
      <p id="motion-support" class="banner ${supported ? '' : 'warn'}">${supported
        ? 'Pulsa el botón y mueve el dispositivo.'
        : 'Este navegador no envía el movimiento del dispositivo.'}</p>
      <div class="actions">
        <button id="motion-start" type="button" ${supported ? '' : 'disabled'}>Leer movimiento</button>
        <strong id="shakes">Sacudidas: 0</strong>
      </div>
      <div class="stack" id="axes">
        <div class="axis"><span>X</span><div class="track"><div class="fill" id="bar-x"></div></div><strong id="val-x">—</strong></div>
        <div class="axis"><span>Y</span><div class="track"><div class="fill" id="bar-y"></div></div><strong id="val-y">—</strong></div>
        <div class="axis"><span>Z</span><div class="track"><div class="fill" id="bar-z"></div></div><strong id="val-z">—</strong></div>
      </div>
      <div class="readout">
        <div><span>Giro alpha</span><strong id="rot-a">—</strong></div>
        <div><span>Giro beta</span><strong id="rot-b">—</strong></div>
        <div><span>Giro gamma</span><strong id="rot-g">—</strong></div>
        <div><span>Intervalo</span><strong id="interval">—</strong></div>
      </div>
    </section>
  `;

  const support = root.querySelector('#motion-support');
  const start = root.querySelector('#motion-start');
  const shakesEl = root.querySelector('#shakes');
  const bars = {
    x: root.querySelector('#bar-x'),
    y: root.querySelector('#bar-y'),
    z: root.querySelector('#bar-z'),
  };
  const values = {
    x: root.querySelector('#val-x'),
    y: root.querySelector('#val-y'),
    z: root.querySelector('#val-z'),
  };
  const rotation = {
    alpha: root.querySelector('#rot-a'),
    beta: root.querySelector('#rot-b'),
    gamma: root.querySelector('#rot-g'),
  };
  const interval = root.querySelector('#interval');
  let shakes = 0;
  let previous = null;
  let sawData = false;

  motionHandler = function onMotion(event) {
    if (!alive) return;
    const gravity = event.accelerationIncludingGravity || {};
    const rotationRate = event.rotationRate || {};
    for (const axis of ['x', 'y', 'z']) {
      values[axis].textContent = text(gravity[axis]);
      bars[axis].style.width = `${percent(gravity[axis])}%`;
      if (numberOf(gravity[axis]) !== null) sawData = true;
    }
    rotation.alpha.textContent = text(rotationRate.alpha);
    rotation.beta.textContent = text(rotationRate.beta);
    rotation.gamma.textContent = text(rotationRate.gamma);
    interval.textContent = numberOf(event.interval) === null ? '—' : `${Math.round(event.interval)} ms`;

    if (numberOf(gravity.x) !== null && previous) {
      const delta = Math.hypot(gravity.x - previous.x, gravity.y - previous.y, gravity.z - previous.z);
      if (delta > 14) {
        shakes += 1;
        shakesEl.textContent = `Sacudidas: ${shakes}`;
      }
    }
    if (numberOf(gravity.x) !== null) previous = { x: gravity.x, y: gravity.y, z: gravity.z };
    if (sawData) {
      support.className = 'banner ok';
      support.textContent = 'Llegando datos de movimiento. Incluye la gravedad, así que quieto no marca cero.';
    }
  }

  start.addEventListener('click', async () => {
    try {
      const permission = await askPermission(window.DeviceMotionEvent);
      if (!alive) return;
      if (permission !== 'granted') {
        support.className = 'banner bad';
        support.textContent = 'Permiso de movimiento denegado.';
        return;
      }
      window.addEventListener('devicemotion', motionHandler);
      start.disabled = true;
      support.className = 'banner';
      support.textContent = 'Esperando el acelerómetro…';
      window.setTimeout(() => {
        if (!alive || sawData) return;
        support.className = 'banner warn';
        support.textContent = 'No llegaron datos. En un computador no hay acelerómetro; pruébalo en un teléfono con HTTPS.';
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
