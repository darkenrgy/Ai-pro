import { useCallback, useRef, useState } from 'react';

interface UseMediaRecorderOptions {
  onRecorded: (blob: Blob) => Promise<void>;
}

export function useMediaRecorder({ onRecorded }: UseMediaRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setRecordingError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined,
      });

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });

        void onRecorded(audioBlob);

        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
      };

      recorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError('Microphone access was denied or is unavailable.');
      setIsRecording(false);
    }
  }, [onRecorded]);

  const stopRecording = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      return;
    }

    recorderRef.current.stop();
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    recordingError,
    startRecording,
    stopRecording,
  };
}
