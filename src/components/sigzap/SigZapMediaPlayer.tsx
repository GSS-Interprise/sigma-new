import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface SigZapAudioPlayerProps {
  src: string;
  isFromMe?: boolean;
}

export function SigZapAudioPlayer({ src, isFromMe }: SigZapAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && duration) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      audioRef.current.currentTime = percentage * duration;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn(
      "flex items-center gap-2 min-w-[200px] max-w-[280px] p-2 rounded-lg",
      isFromMe ? "bg-white/10" : "bg-muted/50"
    )}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Play/Pause Button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-9 w-9 rounded-full flex-shrink-0",
          isFromMe 
            ? "bg-white/20 hover:bg-white/30 text-white" 
            : "bg-primary/20 hover:bg-primary/30 text-primary"
        )}
        onClick={togglePlay}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </Button>

      {/* Waveform / Progress */}
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="h-6 flex items-center gap-[2px] cursor-pointer"
          onClick={handleSeek}
        >
          {[...Array(30)].map((_, i) => {
            const isActive = (i / 30) * 100 <= progress;
            return (
              <div
                key={i}
                className={cn(
                  "w-[3px] rounded-full transition-colors",
                  isActive
                    ? isFromMe ? "bg-white" : "bg-primary"
                    : isFromMe ? "bg-white/30" : "bg-muted-foreground/30"
                )}
                style={{
                  height: `${Math.sin((i / 30) * Math.PI * 3) * 50 + 50}%`,
                }}
              />
            );
          })}
        </div>
        
        {/* Time */}
        <div className={cn(
          "flex justify-between text-[10px]",
          isFromMe ? "text-white/70" : "text-muted-foreground"
        )}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Mute Button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 flex-shrink-0",
          isFromMe ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground"
        )}
        onClick={toggleMute}
      >
        {isMuted ? (
          <VolumeX className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

interface SigZapVideoPlayerProps {
  src: string;
  isFromMe?: boolean;
}

export function SigZapVideoPlayer({ src, isFromMe }: SigZapVideoPlayerProps) {
  return (
    <video
      src={src}
      controls
      className={cn(
        "max-w-[300px] max-h-64 rounded-lg",
        isFromMe ? "bg-black/20" : "bg-muted/50"
      )}
      preload="metadata"
    />
  );
}
