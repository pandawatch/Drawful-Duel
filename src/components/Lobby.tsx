import { Check, Copy, Play, QrCode } from "lucide-react";
import { useState } from "react";
import type { RoomState } from "../../shared/types";
import { Scoreboard } from "./Scoreboard";

export function Lobby({ room, error, onStart, onLeave }: { room: RoomState; error: string; onStart: () => void; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${location.origin}/play?room=${room.roomCode}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  const ready = room.players.length === 2 && room.players.every((player) => player.connected);

  return <section className="lobby-layout">
    <div className="lobby-intro"><p className="eyebrow">ROOM CREATED • {room.roomCode}</p><h1>Bring your<br /><span>best bad ideas.</span></h1><p>Two players enter. One questionable masterpiece leaves.</p><button className="text-button" onClick={onLeave}>Close room</button></div>
    <div className="lobby-console">
      <div className="room-code-label"><QrCode size={18} /> ROOM CODE</div>
      <div className="room-code">{room.roomCode.split("").map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}</div>
      <button className="copy-link" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Link copied" : "Copy player link"}</button>
      <div className="lobby-divider" />
      <p className="lobby-section-label">PLAYERS <span>{room.players.length}/2</span></p>
      <Scoreboard players={room.players} />
      <button className="button button-lime button-full" disabled={!ready} onClick={onStart}><Play size={18} fill="currentColor" /> {ready ? "Start the duel" : "Waiting for players"}</button>
      <p className="lobby-footnote">Both players join on their phones at <b>{location.host}/play</b></p>
      {error && <p className="error-message">{error}</p>}
    </div>
  </section>;
}