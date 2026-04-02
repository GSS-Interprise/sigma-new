import { useState, useRef, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ZoomableImageProps {
  src: string;
  alt: string;
}

export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Use native wheel listener to allow preventDefault (React onWheel is passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setScale(prev => {
        const next = Math.min(Math.max(prev + delta, 0.5), 6);
        if (next <= 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: posStart.current.x + (e.clientX - dragStart.current.x),
      y: posStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const reset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-lg border p-1 shadow-sm">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium min-w-[40px] text-center text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.min(s + 0.25, 6))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        {scale !== 1 && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex items-center justify-center bg-muted/20 rounded-lg min-h-[80vh] overflow-hidden select-none"
        style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={reset}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg transition-transform duration-100"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}
