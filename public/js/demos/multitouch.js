let alive = false;

export function mount(root) {
  alive = true;
  root.innerHTML = `
    <section class="stack">
      <p class="lead">Los eventos táctiles siguen cada dedo. Con dos dedos se calcula la distancia y la escala del pellizco. En el computador puedes arrastrar con el mouse para ver un solo punto.</p>
      <p id="touch-support" class="banner ${navigator.maxTouchPoints > 1 ? 'ok' : ''}">${navigator.maxTouchPoints > 1
        ? `Este aparato informa hasta ${navigator.maxTouchPoints} puntos táctiles.`
        : 'Este equipo no parece tener varios dedos. El recuadro igual responde al mouse y a un dedo.'}</p>
      <div class="readout">
        <div><span>Contactos</span><strong id="touch-count">0</strong></div>
        <div><span>Pellizco</span><strong id="touch-pinch">—</strong></div>
      </div>
      <div id="pad" class="pad" role="application" aria-label="Zona táctil">
        <p class="pad-hint">Apoya los dedos aquí</p>
      </div>
    </section>
  `;

  const pad = root.querySelector('#pad');
  const hint = root.querySelector('.pad-hint');
  const count = root.querySelector('#touch-count');
  const pinch = root.querySelector('#touch-pinch');
  const pointers = new Map();
  let pinchStart = 0;

  function place(touch) {
    const rect = pad.getBoundingClientRect();
    return {
      id: touch.identifier,
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      force: touch.force || 0,
    };
  }

  function render() {
    if (!alive) return;
    const points = [...pointers.values()];
    count.textContent = String(points.length);
    hint.hidden = points.length > 0;
    pad.querySelectorAll('.finger').forEach((node) => node.remove());
    for (const point of points) {
      const dot = document.createElement('div');
      dot.className = 'finger';
      dot.style.left = `${point.x}px`;
      dot.style.top = `${point.y}px`;
      dot.textContent = String(point.id);
      pad.append(dot);
    }
    if (points.length === 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (!pinchStart) pinchStart = distance || 1;
      pinch.textContent = `${Math.round(distance)} px · ×${(distance / pinchStart).toFixed(2)}`;
    } else {
      pinchStart = 0;
      pinch.textContent = '—';
    }
  }

  function syncTouches(event) {
    pointers.clear();
    for (const touch of event.touches) pointers.set(touch.identifier, place(touch));
    render();
  }

  function onTouch(event) {
    event.preventDefault();
    syncTouches(event);
  }

  pad.addEventListener('touchstart', onTouch, { passive: false });
  pad.addEventListener('touchmove', onTouch, { passive: false });
  pad.addEventListener('touchend', onTouch, { passive: false });
  pad.addEventListener('touchcancel', onTouch, { passive: false });

  pad.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') return;
    pad.setPointerCapture(event.pointerId);
    pointers.set('mouse', place({ identifier: 'M', clientX: event.clientX, clientY: event.clientY, force: 0 }));
    render();
  });
  pad.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !pointers.has('mouse')) return;
    pointers.set('mouse', place({ identifier: 'M', clientX: event.clientX, clientY: event.clientY, force: 0 }));
    render();
  });
  function endMouse(event) {
    if (event.pointerType !== 'mouse') return;
    pointers.delete('mouse');
    render();
  }
  pad.addEventListener('pointerup', endMouse);
  pad.addEventListener('pointercancel', endMouse);
  pad.addEventListener('contextmenu', (event) => event.preventDefault());
}

export function unmount() {
  alive = false;
}
