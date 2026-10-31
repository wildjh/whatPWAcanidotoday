let alive = false;
let page = 'gallery';

const styles = [
  ['slide', 'Deslizamiento'],
  ['fade', 'Fundido'],
  ['morph', 'Elemento compartido'],
];

export function mount(root) {
  alive = true;
  page = 'gallery';
  root.innerHTML = `
    <section class="stack">
      <p class="lead">La View Transitions API anima el cambio de una vista a otra. Elige un estilo y pasa entre la galería y el detalle: el cartel conserva el nombre <code>poster</code> y el navegador interpola su tamaño y su posición.</p>
      <p id="vt-support" class="banner ${document.startViewTransition ? 'ok' : 'warn'}">${document.startViewTransition
        ? 'startViewTransition está disponible. También anima el paso entre el inicio y cada demo.'
        : 'Este navegador cambia la vista sin animación.'}</p>
      <label>Estilo de la transición
        <select id="vt-style">
          ${styles.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
        </select>
      </label>
      <div class="actions">
        <button id="vt-gallery" class="ghost" type="button">Galería</button>
        <button id="vt-detail" type="button">Detalle</button>
        <button id="vt-play" class="ghost" type="button">Ida y vuelta</button>
      </div>
      <div id="vt-stage"></div>
      <pre class="snippet">document.startViewTransition(() => actualizarDOM());</pre>
    </section>
  `;

  const select = root.querySelector('#vt-style');
  const stage = root.querySelector('#vt-stage');
  const play = root.querySelector('#vt-play');
  select.value = document.documentElement.dataset.vt || 'slide';
  select.addEventListener('change', () => {
    document.documentElement.dataset.vt = select.value;
  });

  function paint() {
    const forward = page === 'detail';
    stage.innerHTML = forward ? `
      <article class="stage-card detail">
        <div class="detail-row">
          <div class="poster small"></div>
          <div>
            <h2>Detalle</h2>
            <p>El cartel pequeño es el mismo elemento de la galería. Al volver, se agranda y viaja a su lugar.</p>
          </div>
        </div>
      </article>
    ` : `
      <article class="stage-card gallery">
        <h2>Galería</h2>
        <div class="poster large"></div>
        <p>Vista de origen. Pasa al detalle para ver la transición.</p>
      </article>
    `;
  }

  async function swap(next) {
    if (!alive) return;
    page = next;
    const rootNode = document.documentElement;
    rootNode.classList.toggle('back-transition', next === 'gallery');
    const update = () => { if (alive) paint(); };
    if (typeof document.startViewTransition !== 'function') {
      update();
      return;
    }
    try {
      const transition = document.startViewTransition(update);
      await transition.finished.catch(() => {});
    } catch {
      update();
    }
  }

  root.querySelector('#vt-gallery').addEventListener('click', () => swap('gallery'));
  root.querySelector('#vt-detail').addEventListener('click', () => swap('detail'));
  play.addEventListener('click', async () => {
    play.disabled = true;
    await swap('detail');
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    if (alive) await swap('gallery');
    if (alive) play.disabled = false;
  });

  paint();
}

export function unmount() {
  alive = false;
}
