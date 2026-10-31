let alive = false;

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'El servidor rechazó la solicitud.');
  return data;
}

function authMessage(error) {
  const name = error?.name || '';
  const known = {
    NotAllowedError: 'Se canceló la verificación o se agotó el tiempo.',
    InvalidStateError: 'Esa credencial ya está registrada en este autenticador.',
    NotSupportedError: 'Este dispositivo no tiene un autenticador compatible.',
    SecurityError: 'WebAuthn necesita localhost o un dominio en HTTPS. Una dirección IP no sirve.',
    AbortError: 'La operación se interrumpió.',
  };
  return known[name] || error?.message || 'No se pudo usar WebAuthn.';
}

function deviceLabel(credential) {
  const where = credential.deviceType === 'multiDevice' ? 'sincronizada' : 'solo este dispositivo';
  const backup = credential.backedUp ? 'con copia' : 'sin copia';
  return `${where}, ${backup}, usos: ${credential.counter}`;
}

export function mount(root) {
  alive = true;
  root.innerHTML = `
    <section class="stack">
      <p class="lead">Web Authentication API pide una credencial al autenticador del dispositivo. El servidor de Node genera el reto y comprueba la firma. No hay contraseña.</p>
      <p id="auth-support" class="banner">Comprobando el navegador…</p>
      <form id="auth-form" class="stack">
        <label>Nombre de usuario
          <input id="username" name="username" autocomplete="username" minlength="2" maxlength="40" placeholder="Por ejemplo, Ana" required>
        </label>
        <div class="actions">
          <button id="register" type="submit">Registrar credencial</button>
          <button id="login" class="ghost" type="button">Autenticar</button>
          <button id="reset" class="ghost" type="button">Borrar prueba</button>
        </div>
      </form>
      <div>
        <h2>Credenciales de esta sesión</h2>
        <ul id="cred-list" class="list"></ul>
      </div>
      <div>
        <h2>Actividad</h2>
        <pre id="auth-log" class="log"></pre>
      </div>
    </section>
  `;

  const support = root.querySelector('#auth-support');
  const form = root.querySelector('#auth-form');
  const username = root.querySelector('#username');
  const list = root.querySelector('#cred-list');
  const log = root.querySelector('#auth-log');
  const buttons = [...root.querySelectorAll('button')];

  function write(line) {
    const time = new Date().toLocaleTimeString('es-CO', { hour12: false });
    log.textContent = `[${time}] ${line}\n${log.textContent}`.trim();
  }

  async function library() {
    return import('/vendor/webauthn/index.js');
  }

  async function refresh() {
    const name = username.value.trim();
    list.replaceChildren();
    if (name.length < 2) {
      const item = document.createElement('li');
      item.textContent = 'Todavía no hay credenciales para mostrar.';
      list.append(item);
      return;
    }
    try {
      const params = new URLSearchParams({ username: name });
      const response = await fetch(`/api/auth/credentials?${params}`);
      const data = await response.json();
      if (!alive) return;
      if (!data.credentials?.length) {
        const item = document.createElement('li');
        item.textContent = 'Ninguna credencial registrada para ese nombre.';
        list.append(item);
        return;
      }
      for (const credential of data.credentials) {
        const item = document.createElement('li');
        item.textContent = `${credential.id.slice(0, 14)}… · ${deviceLabel(credential)}`;
        list.append(item);
      }
    } catch (error) {
      write(authMessage(error));
    }
  }

  library().then(async (webauthn) => {
    if (!alive) return;
    if (!webauthn.browserSupportsWebAuthn()) {
      support.className = 'banner bad';
      support.textContent = 'Este navegador no implementa WebAuthn.';
      buttons.forEach((button) => { button.disabled = true; });
      return;
    }
    const platform = await webauthn.platformAuthenticatorIsAvailable().catch(() => false);
    if (!alive) return;
    support.className = 'banner ok';
    support.textContent = platform
      ? 'Hay un autenticador en este dispositivo (huella, rostro o PIN). También puedes usar una llave USB.'
      : 'No aparece un autenticador interno. Puedes usar una llave de seguridad USB.';
  }).catch((error) => {
    support.className = 'banner bad';
    support.textContent = authMessage(error);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    register();
  });
  root.querySelector('#login').addEventListener('click', login);
  root.querySelector('#reset').addEventListener('click', reset);
  username.addEventListener('change', refresh);
  refresh();

  function nameOrThrow() {
    const name = username.value.trim();
    if (name.length < 2) throw new Error('Escribe un nombre de al menos 2 caracteres.');
    return name;
  }

  async function register() {
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const name = nameOrThrow();
      const webauthn = await library();
      write(`Pidiendo registro para ${name}. Confirma con tu huella, PIN o llave.`);
      const { options } = await postJSON('/api/auth/register/options', { username: name });
      const attestation = await webauthn.startRegistration({ optionsJSON: options });
      const result = await postJSON('/api/auth/register/verify', { username: name, response: attestation });
      write(result.verified ? 'Credencial registrada y verificada por el servidor.' : 'El servidor no verificó el registro.');
      await refresh();
    } catch (error) {
      write(authMessage(error));
    } finally {
      if (alive) buttons.forEach((button) => { button.disabled = false; });
    }
  }

  async function login() {
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const name = nameOrThrow();
      const webauthn = await library();
      write(`Pidiendo autenticación para ${name}.`);
      const { options } = await postJSON('/api/auth/login/options', { username: name });
      const assertion = await webauthn.startAuthentication({ optionsJSON: options });
      const result = await postJSON('/api/auth/login/verify', { username: name, response: assertion });
      write(result.verified
        ? `Identidad confirmada${result.userVerified ? ' con verificación del usuario' : ''}.`
        : 'La firma no coincidió.');
      await refresh();
    } catch (error) {
      write(authMessage(error));
    } finally {
      if (alive) buttons.forEach((button) => { button.disabled = false; });
    }
  }

  async function reset() {
    try {
      const name = nameOrThrow();
      await postJSON('/api/auth/reset', { username: name });
      write(`Se borraron las credenciales de prueba de ${name}. El autenticador del dispositivo puede seguir guardando la clave.`);
      await refresh();
    } catch (error) {
      write(authMessage(error));
    }
  }
}

export function unmount() {
  alive = false;
}
