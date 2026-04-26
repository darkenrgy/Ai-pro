import JSZip from 'jszip';

export async function compressFile(file: File): Promise<Blob> {
  const zip = new JSZip();
  zip.file(file.name, file);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function createPrivateBundle(files: File[], bundleName: string): Promise<Blob> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', comment: `Bundle: ${bundleName}` });
}

export async function decompressFile(archive: Blob): Promise<File[]> {
  const zip = await JSZip.loadAsync(archive);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  const files = await Promise.all(
    entries.map(async (entry) => {
      const content = await entry.async('blob');
      return new File([content], entry.name, {
        type: content.type || 'application/octet-stream',
      });
    })
  );

  return files;
}
