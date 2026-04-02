import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface SigZapAudioRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
  isUploading?: boolean;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'sending';

export function SigZapAudioRecorder({ onSend, onCancel, isUploading }: SigZapAudioRecorderProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.log('MediaRecorder already stopped');
      }
    }
    
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Update recording state when uploading starts
  useEffect(() => {
    if (isUploading) {
      setRecordingState('sending');
    }
  }, [isUploading]);

  // Timer for recording duration
  useEffect(() => {
    if (recordingState === 'recording') {
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [recordingState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Start recording
  const startRecording = useCallback(async () => {
    // Prevent starting if already recording or uploading
    if (recordingState !== 'idle') {
      console.log('Cannot start recording - current state:', recordingState);
      return;
    }

    try {
      setRecordingState('requesting');
      setPermissionDenied(false);
      setAudioBlob(null);
      chunksRef.current = [];
      
      // Request microphone with specific constraints for better quality
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
        } 
      });
      
      streamRef.current = stream;
      
      // Determine best supported mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose
          }
        }
      }
      
      const options: MediaRecorderOptions = {
        audioBitsPerSecond: 128000,
      };
      
      if (mimeType) {
        options.mimeType = mimeType;
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Create blob from chunks
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { 
            type: mediaRecorder.mimeType || 'audio/webm' 
          });
          
          if (blob.size > 0) {
            setAudioBlob(blob);
            setRecordingState('stopped');
          } else {
            console.error('Audio blob is empty');
            setRecordingState('idle');
          }
        } else {
          console.error('No audio chunks recorded');
          setRecordingState('idle');
        }
        
        // Stop tracks after recording
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        cleanup();
        setRecordingState('idle');
      };
      
      // Start recording - collect data every 250ms for smoother audio
      mediaRecorder.start(250);
      setRecordingState('recording');
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setPermissionDenied(true);
      cleanup();
      setRecordingState('idle');
    }
  }, [recordingState, cleanup]);

  // Start recording when component mounts
  useEffect(() => {
    if (recordingState === 'idle' && !permissionDenied) {
      startRecording();
    }
  }, []); // Only on mount

  // Stop recording
  const stopRecording = useCallback(() => {
    if (recordingState !== 'recording') {
      console.log('Cannot stop - not recording');
      return;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, [recordingState]);

  // Send the recorded audio
  const sendAudio = useCallback(() => {
    if (!audioBlob || recordingState !== 'stopped') {
      console.log('Cannot send - no audio or wrong state');
      return;
    }
    
    setRecordingState('sending');
    onSend(audioBlob);
  }, [audioBlob, recordingState, onSend]);

  // Cancel recording
  const handleCancel = useCallback(() => {
    cleanup();
    setRecordingState('idle');
    setRecordingTime(0);
    setAudioBlob(null);
    onCancel();
  }, [cleanup, onCancel]);

  // Permission denied state
  if (permissionDenied) {
    return (
      <div className="flex items-center gap-2 flex-1 bg-destructive/10 rounded-lg px-3 py-2">
        <span className="text-sm text-destructive">Permissão de microfone negada</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
        >
          Fechar
        </Button>
      </div>
    );
  }

  // Requesting permission state
  if (recordingState === 'requesting') {
    return (
      <div className="flex items-center gap-2 flex-1 bg-muted/50 rounded-lg px-3 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Solicitando permissão...</span>
      </div>
    );
  }

  // Sending state
  if (recordingState === 'sending' || isUploading) {
    return (
      <div className="flex items-center gap-2 flex-1 bg-primary/10 rounded-lg px-3 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-primary font-medium">Enviando áudio...</span>
      </div>
    );
  }

  // Stopped state - ready to send or re-record
  if (recordingState === 'stopped' && audioBlob) {
    return (
      <div className="flex items-center gap-2 flex-1 bg-primary/10 rounded-lg px-3 py-2 animate-in fade-in">
        <div className="flex items-center gap-2 flex-1">
          <div className="h-3 w-3 rounded-full bg-primary" />
          <span className="text-sm font-mono text-primary">
            {formatTime(recordingTime)}
          </span>
          <span className="text-sm text-muted-foreground">Áudio gravado</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Cancel/Delete button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/20"
            onClick={handleCancel}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          
          {/* Send button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-primary hover:text-primary hover:bg-primary/20"
            onClick={sendAudio}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Recording state
  return (
    <div className="flex items-center gap-2 flex-1 bg-destructive/10 rounded-lg px-3 py-2 animate-in fade-in">
      {/* Recording indicator */}
      <div className="flex items-center gap-2 flex-1">
        <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
        <span className="text-sm font-mono text-destructive">
          {formatTime(recordingTime)}
        </span>
        <span className="text-xs text-destructive/70">Gravando...</span>
        
        {/* Waveform visualization */}
        <div className="flex-1 flex items-center gap-[2px] max-w-[150px]">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-destructive/60 rounded-full animate-pulse"
              style={{
                height: `${Math.sin((Date.now() / 100 + i) * 0.5) * 8 + 12}px`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Cancel button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/20"
          onClick={handleCancel}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        
        {/* Stop button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-primary hover:text-primary hover:bg-primary/20"
          onClick={stopRecording}
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
      </div>
    </div>
  );
}

// Mic button component that triggers recording mode
interface SigZapMicButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function SigZapMicButton({ onClick, disabled }: SigZapMicButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-[44px] w-[44px] text-muted-foreground hover:text-primary flex-shrink-0"
      onClick={onClick}
      disabled={disabled}
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
