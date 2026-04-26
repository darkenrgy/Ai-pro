import { useEffect, useState, type FormEvent } from 'react';
import { fileService } from '@/services/fileService';
import { downloadBlob } from '@/utils/download';
import type { FileMetadata } from '@/types/file';
import { compressFile, decompressFile } from '@/utils/compression';
import { decryptBlob, deriveFileKey, encryptBlob } from '@/utils/fileCrypto';

interface FileVaultProps {
  sessionId: string;
}

export function FileVault({ sessionId }: FileVaultProps) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [fileSecret, setFileSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ name: string; type: string; contentUrl: string } | null>(null);

  const refreshFiles = async () => {
    const response = await fileService.listSessionFiles(sessionId);
    setFiles(response);
  };

  useEffect(() => {
    void refreshFiles().catch(() => setError('Unable to load session files.'));
  }, [sessionId]);

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    if (!fileSecret.trim()) {
      setError('Provide a file secret phrase before upload.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const compressedBlob = await compressFile(selectedFile);
      const key = await deriveFileKey(sessionId, fileSecret.trim());
      const encryptedBlob = await encryptBlob(compressedBlob, key);

      const securedFile = new File([encryptedBlob], `${selectedFile.name}.aip`, {
        type: 'application/octet-stream',
      });

      await fileService.uploadFile(sessionId, securedFile, description || undefined);
      setSelectedFile(null);
      setDescription('');
      await refreshFiles();
    } catch {
      setError('File upload failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const encryptedBlob = await fileService.downloadFile(fileId);
      const key = await deriveFileKey(sessionId, fileSecret.trim());
      const decryptedArchive = await decryptBlob(encryptedBlob, key);
      const unpackedFiles = await decompressFile(decryptedArchive);

      if (unpackedFiles.length === 0) {
        throw new Error('No file data found in decrypted archive');
      }

      const restored = unpackedFiles[0];
      const contentUrl = URL.createObjectURL(restored);
      setPreview((current) => {
        if (current?.contentUrl) {
          URL.revokeObjectURL(current.contentUrl);
        }
        return {
          name: restored.name,
          type: restored.type,
          contentUrl,
        };
      });

      downloadBlob(restored, restored.name);
    } catch {
      const blob = await fileService.downloadFile(fileId);
      downloadBlob(blob, fileName);
    }
  };

  useEffect(() => {
    return () => {
      if (preview?.contentUrl) {
        URL.revokeObjectURL(preview.contentUrl);
      }
    };
  }, [preview]);

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Files</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Encrypted session vault</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{files.length} items</span>
      </div>

      <form onSubmit={handleUpload} className="mt-5 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
        <input
          type="file"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-cyan-300"
        />
        <input
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description for this private upload"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
        />
        <input
          type="password"
          value={fileSecret}
          onChange={(event) => setFileSecret(event.target.value)}
          placeholder="File secret phrase (required for encrypt/decrypt)"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
        />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !selectedFile || !fileSecret.trim()}
          className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {loading ? 'Uploading...' : 'Upload file'}
        </button>
      </form>

      {preview ? (
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Last file preview</p>
          <p className="mt-2 text-sm font-semibold text-white">{preview.name}</p>
          {preview.type.startsWith('image/') ? (
            <img src={preview.contentUrl} alt={preview.name} className="mt-3 max-h-48 rounded-2xl border border-white/10 object-contain" />
          ) : (
            <p className="mt-3 text-xs text-slate-400">Preview available for image formats. File was decrypted, decompressed, and downloaded.</p>
          )}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {files.length === 0 ? <p className="text-sm text-slate-400">No files have been shared in this session yet.</p> : null}
        {files.map((file) => (
          <div key={file.fileId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-white">{file.fileName}</p>
                <p className="text-xs text-slate-400">
                  {Math.round(file.originalSizeBytes / 1024)} KB original · {Math.round(file.storedSizeBytes / 1024)} KB stored
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(file.fileId, file.fileName)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
