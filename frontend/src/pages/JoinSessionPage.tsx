import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { AppShell } from '@/components/layout/AppShell';
import { sessionService } from '@/services/sessionService';
import { decodeImageData } from '@/utils/imageStego';
import { useToastStore } from '@/store/toastStore';

export function JoinSessionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [sessionId, setSessionId] = useState(params.get('sessionId') ?? '');
  const [parentNodeId, setParentNodeId] = useState(params.get('parentNodeId') ?? '');
  const [sharedSecret, setSharedSecret] = useState('');
  const [showSharedSecret, setShowSharedSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannerError, setScannerError] = useState('');
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');
  const [qrCaptured, setQrCaptured] = useState(false);
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [decodeLoading, setDecodeLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);
  const scannerRegionId = 'join-session-qr-reader';
  const pushToast = useToastStore((state) => state.pushToast);

  const getCameraUnavailableMessage = () => {
    if (!window.isSecureContext) {
      return 'Camera access requires a secure context. Open the app on localhost or HTTPS and try again.';
    }

    return 'Camera access is not available on this browser or device.';
  };

  const getCameraAccessErrorMessage = (error: unknown) => {
    const nextError = error as { name?: string };

    if (nextError?.name === 'NotAllowedError' || nextError?.name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access to continue with QR capture.';
    }

    if (nextError?.name === 'NotFoundError' || nextError?.name === 'OverconstrainedError') {
      return 'No usable camera was found. Connect a camera or switch devices and try again.';
    }

    return 'Unable to access the camera. Check browser permissions and try again.';
  };

  const extractJoinParams = (rawValue: string): { sessionId: string; parentNodeId?: string } | null => {
    try {
      const parsedUrl = new URL(rawValue);
      const parsedSessionId = parsedUrl.searchParams.get('sessionId');
      const parsedParentNodeId = parsedUrl.searchParams.get('parentNodeId') ?? undefined;
      if (parsedSessionId) {
        return { sessionId: parsedSessionId, parentNodeId: parsedParentNodeId };
      }
    } catch {
      // Raw value might not be a URL.
    }

    try {
      const parsedJson = JSON.parse(rawValue) as { sessionId?: string; parentNodeId?: string };
      if (parsedJson.sessionId) {
        return { sessionId: parsedJson.sessionId, parentNodeId: parsedJson.parentNodeId };
      }
    } catch {
      // Raw value might not be JSON.
    }

    const uuidMatches = rawValue.match(/[0-9a-fA-F-]{36}/g);
    if (!uuidMatches || uuidMatches.length === 0) {
      return null;
    }

    return {
      sessionId: uuidMatches[0],
      parentNodeId: uuidMatches[1],
    };
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      setScannerActive(false);
      return;
    }

    try {
      const currentState = scanner.getState();
      if (currentState === 2) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch {
      // Best-effort shutdown for camera scanner.
    } finally {
      scannerRef.current = null;
      setScannerActive(false);
    }
  };

  const requestCameraPermission = async () => {
    setScannerError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermissionStatus('denied');
      setScannerError(getCameraUnavailableMessage());
      return false;
    }

    try {
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      stream.getTracks().forEach((track) => track.stop());
      setCameraPermissionStatus('granted');
      setScannerMessage('Camera access granted. You can now scan the host QR code.');
      return true;
    } catch (requestError: unknown) {
      setCameraPermissionStatus('denied');
      setScannerError(getCameraAccessErrorMessage(requestError));
      return false;
    }
  };

  const startScanner = async () => {
    setScannerError('');
    setScannerMessage('');
    hasScannedRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError(getCameraUnavailableMessage());
      return;
    }

    const hasPermission = cameraPermissionStatus === 'granted' ? true : await requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    await stopScanner();

    const scanner = new Html5Qrcode(scannerRegionId);
    scannerRef.current = scanner;

    const onScanSuccess = async (decodedText: string) => {
      if (hasScannedRef.current) {
        return;
      }

      const parsed = extractJoinParams(decodedText);
      if (!parsed) {
        setScannerError('QR code does not include a valid session link or session ID.');
        return;
      }

      hasScannedRef.current = true;
      setQrCaptured(true);
      setSessionId(parsed.sessionId);
      setParentNodeId(parsed.parentNodeId ?? parsed.sessionId);
      setScannerMessage('Session details scanned. Submit to join.');
      await stopScanner();
    };

    const onScanFailure = () => undefined;
    const scannerConfig = { fps: 10, qrbox: { width: 240, height: 240 } };

    try {
      await scanner.start(
        { facingMode: 'environment' },
        scannerConfig,
        onScanSuccess,
        onScanFailure
      );

      setScannerActive(true);
    } catch {
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) {
          setScannerError('No camera devices were detected. Connect a camera and try again.');
          await stopScanner();
          return;
        }

        await scanner.start(cameras[0].id, scannerConfig, onScanSuccess, onScanFailure);
        setScannerActive(true);
      } catch {
        setScannerError('Unable to start QR scanner. Allow camera permissions and try again.');
        await stopScanner();
      }
    }
  };

  useEffect(() => {
    const nextSessionId = params.get('sessionId');
    const nextParentNodeId = params.get('parentNodeId');
    if (nextSessionId) {
      setSessionId(nextSessionId);
    }
    if (nextParentNodeId) {
      setParentNodeId(nextParentNodeId);
    }
  }, [params]);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  const handleDecodeImage = async (file: File | null) => {
    if (!file) {
      return;
    }

    setDecodeLoading(true);
    setScannerError('');
    setScannerMessage('');

    try {
      const decoded = await decodeImageData(file);
      if (!decoded) {
        setScannerError('No embedded join metadata was found in this image.');
        return;
      }

      setSessionId(decoded.sessionId);
      setParentNodeId(decoded.parentNodeId ?? decoded.sessionId);
      setScannerMessage('Secure image decoded. Session details are ready.');
      pushToast({
        title: 'Join metadata decoded',
        message: 'Session and parent node were extracted from the secure image.',
        type: 'success',
        durationMs: 2600,
      });
    } catch {
      setScannerError('Failed to decode image metadata. Use QR scanner or manual values.');
    } finally {
      setDecodeLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!qrCaptured) {
      setError('QR camera capture is required before joining. Please allow camera access and scan the host QR code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sessionService.joinSession({
        sessionId,
        parentNodeId: parentNodeId || sessionId,
        sharedSecret,
      });

      if (response.status === 202 || response.data?.permissionGranted === false) {
        pushToast({
          title: 'Permission requested',
          message: 'Your request was sent to the parent host. You can chat after approval.',
          type: 'warning',
          durationMs: 3500,
        });
      }

      navigate(`/session/${sessionId}`);
    } catch (requestError: unknown) {
      const status = (requestError as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setError('Your role is not allowed to join this session. Ask a host to provide participant access.');
      } else {
        setError('Unable to join the session. Verify the session identifier and access link.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Join Session" subtitle="Enter the session chain with a link, QR route, or the host-provided session identifier.">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-900/80 p-6">
        <div className="mb-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-sm text-slate-300">Scan host QR code</p>
          <p className="mt-1 text-xs text-slate-500">Camera capture is required. Allow permission, then scan to auto-fill session and parent node details.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void requestCameraPermission()}
              disabled={cameraPermissionStatus === 'granted'}
              className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-white/20 disabled:text-slate-400"
            >
              {cameraPermissionStatus === 'granted' ? 'Camera access granted' : 'Allow camera access'}
            </button>
            <button
              type="button"
              onClick={() => void startScanner()}
              disabled={scannerActive || cameraPermissionStatus !== 'granted'}
              className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {scannerActive ? 'Scanner running' : 'Start QR scanner'}
            </button>
            {scannerActive ? (
              <button
                type="button"
                onClick={() => void stopScanner()}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-200"
              >
                Stop scanner
              </button>
            ) : null}
            <label className="cursor-pointer rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-200">
              {decodeLoading ? 'Decoding image...' : 'Decode secure image'}
              <input
                type="file"
                accept="image/*"
                disabled={decodeLoading}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  void handleDecodeImage(nextFile);
                  event.currentTarget.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Permission status: {cameraPermissionStatus === 'granted' ? 'Granted' : cameraPermissionStatus === 'denied' ? 'Denied' : 'Not requested'}
          </p>

          <div id={scannerRegionId} className={`mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 ${scannerActive ? 'min-h-[220px] p-2' : 'h-0 p-0 border-transparent'}`} />

          {scannerError ? <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{scannerError}</p> : null}
          {scannerMessage ? <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{scannerMessage}</p> : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Session ID</label>
            <input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
              placeholder="Paste the session identifier"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">Parent node ID</label>
            <input
              value={parentNodeId}
              onChange={(event) => setParentNodeId(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
              placeholder="Optional parent node in the chain"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm text-slate-300">Shared secret key (for approval)</label>
              <button
                type="button"
                onClick={() => setShowSharedSecret((current) => !current)}
                className="text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
              >
                {showSharedSecret ? 'Hide secret' : 'Show secret'}
              </button>
            </div>
            <input
              type={showSharedSecret ? 'text' : 'password'}
              value={sharedSecret}
              onChange={(event) => setSharedSecret(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
              placeholder="Provide the secret key you want to use"
              required
            />
            <p className="mt-2 text-xs text-slate-400">Use the exact same secret later during approval.</p>
          </div>
          {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !qrCaptured}
            className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {loading ? 'Joining...' : qrCaptured ? 'Join session' : 'Scan QR to continue'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
