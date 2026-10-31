import crypto from 'node:crypto';
import express from 'express';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const RP_NAME = 'Qué puede hacer una PWA';
const ALGORITHMS = [-7, -257];

const users = new Map();
let httpsReady = false;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/vendor/webauthn', express.static(path.join(__dirname, 'node_modules', '@simplewebauthn', 'browser', 'esm')));
app.use(express.static(path.join(__dirname, 'public')));

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function usernameFrom(value) {
  const username = String(value || '').trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N} ._-]{2,40}$/u.test(username)) {
    throw fail(400, 'Escribe un nombre de 2 a 40 letras o números.');
  }
  return username;
}

function requestContext(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const hostname = host.split(':')[0].replace(/^\[|\]$/g, '');
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  if (ipv4 || hostname.includes(':')) {
    throw fail(400, 'WebAuthn no acepta una dirección IP. Ábrelo en http://localhost:3000 o con un nombre de dominio.');
  }
  return {
    rpID: hostname,
    origin: `${req.secure ? 'https' : 'http'}://${host}`,
  };
}

function publicCredential(credential) {
  return {
    id: credential.id,
    deviceType: credential.deviceType,
    backedUp: credential.backedUp,
    counter: credential.counter,
    transports: credential.transports || [],
  };
}

function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get('/api/info', (req, res) => {
  res.json({
    httpPort: PORT,
    httpsPort: HTTPS_PORT,
    https: httpsReady,
    addresses: ['localhost', ...lanAddresses()],
  });
});

app.get('/api/auth/credentials', (req, res) => {
  const username = usernameFrom(req.query.username);
  const user = users.get(username.toLowerCase());
  res.json({ credentials: user ? user.credentials.map(publicCredential) : [] });
});

app.post('/api/auth/register/options', route(async (req, res) => {
  const username = usernameFrom(req.body?.username);
  const { rpID } = requestContext(req);
  const key = username.toLowerCase();
  let user = users.get(key);
  if (!user) {
    user = {
      username,
      id: new Uint8Array(crypto.randomBytes(32)),
      credentials: [],
      regChallenge: null,
      authChallenge: null,
    };
    users.set(key, user);
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.username,
    userID: user.id,
    userDisplayName: user.username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: user.credentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports,
    })),
    supportedAlgorithmIDs: ALGORITHMS,
    timeout: 60000,
  });

  user.regChallenge = options.challenge;
  res.json({ options });
}));

app.post('/api/auth/register/verify', route(async (req, res) => {
  const username = usernameFrom(req.body?.username);
  const response = req.body?.response;
  const user = users.get(username.toLowerCase());
  if (!user?.regChallenge) throw fail(400, 'El registro expiró. Vuelve a pulsar Registrar.');
  if (!response || typeof response !== 'object') throw fail(400, 'Falta la respuesta del autenticador.');

  const { origin, rpID } = requestContext(req);
  const expectedChallenge = user.regChallenge;
  user.regChallenge = null;

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      supportedAlgorithmIDs: ALGORITHMS,
    });
  } catch (error) {
    throw fail(400, error.message || 'No se pudo verificar el registro.');
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw fail(400, 'El autenticador no quedó verificado.');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  if (user.credentials.some((item) => item.id === credential.id)) {
    throw fail(400, 'Esa credencial ya estaba registrada.');
  }

  user.credentials.push({
    id: credential.id,
    publicKey: new Uint8Array(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });

  res.json({ verified: true, credential: publicCredential(user.credentials.at(-1)) });
}));

app.post('/api/auth/login/options', route(async (req, res) => {
  const username = usernameFrom(req.body?.username);
  const user = users.get(username.toLowerCase());
  if (!user?.credentials.length) throw fail(400, 'Primero registra una credencial para ese nombre.');

  const { rpID } = requestContext(req);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: user.credentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports,
    })),
    userVerification: 'preferred',
    timeout: 60000,
  });
  user.authChallenge = options.challenge;
  res.json({ options });
}));

app.post('/api/auth/login/verify', route(async (req, res) => {
  const username = usernameFrom(req.body?.username);
  const response = req.body?.response;
  const user = users.get(username.toLowerCase());
  if (!user?.authChallenge) throw fail(400, 'La autenticación expiró. Vuelve a intentarlo.');
  if (!response || typeof response !== 'object') throw fail(400, 'Falta la respuesta del autenticador.');

  const credential = user.credentials.find((item) => item.id === response.id);
  if (!credential) throw fail(400, 'Esa credencial no pertenece a este usuario.');

  const { origin, rpID } = requestContext(req);
  const expectedChallenge = user.authChallenge;
  user.authChallenge = null;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
      },
    });
  } catch (error) {
    throw fail(400, error.message || 'No se pudo verificar la autenticación.');
  }

  if (!verification.verified) throw fail(400, 'La firma no es válida.');
  credential.counter = verification.authenticationInfo.newCounter;
  res.json({
    verified: true,
    userVerified: verification.authenticationInfo.userVerified,
    credential: publicCredential(credential),
  });
}));

app.post('/api/auth/reset', (req, res) => {
  const username = usernameFrom(req.body?.username);
  users.delete(username.toLowerCase());
  res.json({ ok: true });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(error.status || 400).json({ error: error.message || 'No se pudo completar la operación.' });
});

function printBanner() {
  console.log('');
  console.log('Qué puede hacer una PWA');
  console.log(`  Este equipo:  http://localhost:${PORT}`);
  if (httpsReady) {
    console.log(`  HTTPS local:  https://localhost:${HTTPS_PORT}`);
    for (const ip of lanAddresses()) {
      console.log(`  En el teléfono: https://${ip}:${HTTPS_PORT}`);
    }
    console.log('  En el teléfono hay que aceptar el certificado autofirmado.');
  }
  console.log('');
}

const httpServer = http.createServer(app);
httpServer.on('error', (error) => {
  console.error(`No se pudo abrir el puerto ${PORT}: ${error.message}`);
  process.exit(1);
});
httpServer.listen(PORT, '0.0.0.0', printBanner);

try {
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...lanAddresses().map((ip) => ({ type: 7, ip })),
  ];
  const certificate = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }],
  });
  const secureServer = https.createServer({ key: certificate.private, cert: certificate.cert }, app);
  secureServer.on('error', (error) => {
    httpsReady = false;
    console.warn(`HTTPS no quedó disponible: ${error.message}`);
  });
  secureServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    httpsReady = true;
    printBanner();
  });
} catch (error) {
  console.warn(`No se pudo crear el certificado HTTPS: ${error.message}`);
}
