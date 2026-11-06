import { useEffect, useRef, useState } from "react";
import { Check, Eraser, RotateCcw } from "lucide-react";

const COLORS = ["#18191b", "#e94f37", "#21a6a1", "#f2bd30", "#5c62da", "#f4f0e5"];

export function DrawingCanvas({ onSubmit, disabled }: { onSubmit: (data: string) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(6);
  const [hasMarks, setHasMarks] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = bounds.width * ratio;
    canvas.height = bounds.height * ratio;
    const context = canvas.getContext("2d");
    if (context) {
      context.scale(ratio, ratio);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, bounds.width, bounds.height);
    }
  }, []);

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = position(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.strokeStyle = color;
    context.lineWidth = size;
    context.lineTo(point.x + 0.1, point.y + 0.1);
    context.stroke();
    drawing.current = true;
    setHasMarks(true);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const point = position(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.strokeStyle = color;
    context.lineWidth = size;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stop = () => { drawing.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      const bounds = canvas.getBoundingClientRect();
      context.fillStyle = "#fff";
      context.fillRect(0, 0, bounds.width, bounds.height);
    }
    setHasMarks(false);
  };

  return <div className="drawing-tool">
    <div className="canvas-tools">
      <div className="color-tools" aria-label="Brush color">
        {COLORS.map((value) => <button key={value} aria-label={`Color ${value}`} className={`color-swatch ${color === value ? "swatch-active" : ""}`} style={{ backgroundColor: value }} onClick={() => setColor(value)} />)}
      </div>
      <label className="brush-control"><span>SIZE</span><input aria-label="Brush size" type="range" min="2" max="20" value={size} onChange={(event) => setSize(Number(event.target.value))} /><b>{size}</b></label>
      <button className="icon-button" title="Clear canvas" aria-label="Clear canvas" onClick={clear}><RotateCcw size={17} /></button>
    </div>
    <canvas ref={canvasRef} className="draw-canvas" aria-label="Drawing canvas" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />
    <div className="canvas-bottom"><span><Eraser size={15} /> Draw with your finger</span><button className="button button-dark" onClick={() => canvasRef.current && onSubmit(canvasRef.current.toDataURL("image/jpeg", 0.55))} disabled={disabled || !hasMarks}><Check size={18} /> Submit drawing</button></div>
  </div>;
}