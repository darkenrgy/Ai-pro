interface JoinPayload {
  sessionId: string;
  parentNodeId?: string;
}

export interface DecodedImagePayload {
  sessionId: string;
  parentNodeId?: string;
}

function validatePayload(value: unknown): value is JoinPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybePayload = value as JoinPayload;
  return typeof maybePayload.sessionId === 'string';
}

export async function encodeImageData(payload: JoinPayload): Promise<string> {
  return `AI_PRO_JOIN:${JSON.stringify(payload)}`;
}

export async function decodeImageData(file: File): Promise<DecodedImagePayload | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const { data } = context.getImageData(0, 0, Math.min(canvas.width, 320), Math.min(canvas.height, 320));
  let extracted = '';

  for (let index = 0; index < data.length; index += 4) {
    const byte = data[index] & 0b00000011;
    extracted += byte.toString(2).padStart(2, '0');
  }

  const chars: string[] = [];
  for (let index = 0; index + 8 <= extracted.length; index += 8) {
    const code = Number.parseInt(extracted.slice(index, index + 8), 2);
    if (code === 0) {
      break;
    }
    chars.push(String.fromCharCode(code));
  }

  const text = chars.join('').trim();
  const marker = 'AI_PRO_JOIN:';
  if (!text.startsWith(marker)) {
    return null;
  }

  try {
    const payload = JSON.parse(text.slice(marker.length));
    if (!validatePayload(payload)) {
      return null;
    }

    return {
      sessionId: payload.sessionId,
      parentNodeId: payload.parentNodeId,
    };
  } catch {
    return null;
  }
}
