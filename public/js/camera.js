export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

export async function openCamera(facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no expone la cámara.');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}

export async function bitmapFromFile(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
