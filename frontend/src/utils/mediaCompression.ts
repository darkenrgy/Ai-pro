import { compressFile } from '@/utils/compression';

const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 0.8;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to decode image for compression.'));
    };
    image.src = objectUrl;
  });
}

export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const image = await loadImage(file);
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const preferredType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), preferredType, IMAGE_QUALITY);
  });

  return blob ?? file;
}

export async function compressVideo(file: File): Promise<Blob> {
  // Browser-native video transcoding in real time is expensive; keep original payload for low latency.
  return file;
}

export async function compressGenericFile(file: File): Promise<Blob> {
  return compressFile(file);
}

export async function compressMediaFile(file: File, mediaType: 'image' | 'video' | 'audio' | 'file'): Promise<Blob> {
  if (mediaType === 'image') {
    return compressImage(file);
  }

  if (mediaType === 'video') {
    return compressVideo(file);
  }

  if (mediaType === 'audio') {
    return file;
  }

  return compressGenericFile(file);
}
