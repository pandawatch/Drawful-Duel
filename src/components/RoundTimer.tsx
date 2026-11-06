import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

export function RoundTimer({ duration, active }: { duration: number; active: boolean }) {
  const [remaining, setRemaining] = useState(duration);
  useEffect(() => {
    setRemaining(duration);
    if (!active) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [duration, active]);
  return <span className="round-timer"><Timer size={15} /> {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</span>;
}