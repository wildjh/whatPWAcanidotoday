export function mediaError(error) {
  if (!window.isSecureContext) {
    return 'El navegador bloqueó el dispositivo porque la página no está en localhost ni en HTTPS.';
  }
  const name = error?.name;
  if (name === 'NotAllowedError') return 'Permiso denegado. Revísalo en el candado de la barra de direcciones.';
  if (name === 'NotFoundError') return 'No hay una cámara o un micrófono disponible.';
  if (name === 'NotReadableError') return 'El dispositivo está ocupado por otro programa.';
  if (name === 'NotSupportedError' || error?.message === 'Not supported') {
    return 'Este entorno no pudo usar el dispositivo. Pruébalo en Chrome o Edge, en localhost o en HTTPS.';
  }
  if (name === 'OverconstrainedError') return 'La cámara no aceptó el modo pedido. Prueba la otra cámara.';
  if (name === 'AbortError') return 'La captura se canceló.';
  return error?.message || 'No se pudo usar el dispositivo.';
}

export function recorderMime(kind) {
  if (typeof MediaRecorder === 'undefined') return '';
  const list = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return list.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function fileExtension(mime) {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
