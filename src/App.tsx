import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, Crown, DoorOpen, Gamepad2, Sparkles } from "lucide-react";
import type { Ack, RoomState } from "../shared/types";
import { socket } from "./socket";
import { DrawingCanvas } from "./components/DrawingCanvas";
import { Lobby } from "./components/Lobby";
import { RoundTimer } from "./components/RoundTimer";
import { Scoreboard } from "./components/Scoreboard";

function useRoom() {
  const [room, setRoom] = useState<RoomState>();
  const [error, setError] = useState("");

  useEffect(() => {
    const onRoom = (state: RoomState) => {
      setRoom(state);
      setError("");
    };
    const onError = ({ message }: { message: string }) => setError(message);
    const onClosed = ({ message }: { message: string }) => {
      setRoom(undefined);
      setError(message);
    };
    socket.on("roomState", onRoom);
    socket.on("gameError", onError);
    socket.on("roomClosed", onClosed);
    return () => {
      socket.off("roomState", onRoom);
      socket.off("gameError", onError);
      socket.off("roomClosed", onClosed);
    };
  }, []);

  const run = (action: (ack: Ack) => void) => {
    setError("");
    action((result) => {
      if (!result.ok) setError(result.error);
    });
  };

  return { room, setRoom, error, setError, run };
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark"><Sparkles size={18} strokeWidth={2.8} /></span>
      <span>DRAWFUL <b>DUEL</b></span>
    </div>
  );
}

function HostApp() {
  const { room, setRoom, error, setError, run } = useRoom();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    return () => {
      socket.emit("leaveRoom");
      socket.disconnect();
    };
  }, []);

  const create = () => {
    setError("");
    setBusy(true);
    socket.emit("createRoom", (result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRoom({
        roomCode: result.data.roomCode,
        phase: "lobby",
        role: "host",
        players: [],
        roundNumber: 0,
      });
    });
  };

  const start = () => run((ack) => socket.emit("hostStart", ack));
  const next = () => run((ack) => socket.emit("nextRound", ack));
  const returnToTitle = () => {
    socket.emit("leaveRoom");
    setRoom(undefined);
  };

  if (!room) return (
    <main className="host-shell title-screen">
      <div className="title-sparks" aria-hidden="true">✳</div>
      <Brand />
      <div className="title-copy">
        <p className="eyebrow">A two-player drawing showdown</p>
        <h1>Draw weird.<br /><span>Guess weirder.</span></h1>
        <p className="title-sub">One draws. One lies. Both get points.</p>
        <button className="button button-lime button-large" onClick={create} disabled={busy}>
          <Gamepad2 size={20} /> {busy ? "Making room..." : "Create a room"}
        </button>
        {error && <p className="error-message">{error}</p>}
      </div>
      <div className="title-footer"><span>DRAW • DECEIVE • DUEL</span><span>FIRST TO 5 WINS</span></div>
    </main>
  );

  return (
    <main className="host-shell">
      <header className="topbar"><Brand compact /><span className="topbar-tag">THE BIG SCREEN</span></header>
      {room.phase === "lobby" && (
        <Lobby room={room} error={error} onStart={start} onLeave={returnToTitle} />
      )}
      {(room.phase === "drawing" || room.phase === "reveal" || room.phase === "finished") && (
        <section className="show-stage">
          <div className="stage-heading">
            <div><p className="eyebrow">ROUND {room.roundNumber}</p><h1>{room.phase === "drawing" ? "Something's brewing" : room.phase === "finished" ? "Duel complete" : "The truth is out"}</h1></div>
            <Scoreboard players={room.players} drawerPlayerId={room.drawerPlayerId} />
          </div>
          {room.phase === "drawing" && <div className="waiting-art"><div className="waiting-orbit"><Sparkles size={46} /></div><h2>{room.drawerName} is making art</h2><p>The other player is cooking up a very convincing lie.</p><RoundTimer duration={60} active={room.phase === "drawing"} /></div>}
          {room.phase !== "drawing" && <Reveal room={room} onNext={room.phase === "finished" ? returnToTitle : next} />}
        </section>
      )}
      {error && <div className="toast-error" role="alert">{error}</div>}
    </main>
  );
}

function Reveal({ room, onNext }: { room: RoomState; onNext: () => void }) {
  const winner = room.winner;
  const real = room.answers?.find((answer) => answer.id === "real");
  const fake = room.answers?.find((answer) => answer.id === "fake");
  return (
    <div className="reveal-layout">
      <div className="art-frame">
        {room.drawingData && <img src={room.drawingData} alt={`Drawing by ${room.drawerName}`} />}
        <span className="art-credit">DRAWN BY {room.drawerName?.toUpperCase()}</span>
      </div>
      <div className="reveal-details">
        {winner && <div className="winner-banner"><Crown size={30} /><p>CHAMPION</p><h2>{winner.name}</h2><span>First to five. All-time legend.</span></div>}
        <p className="eyebrow">THE REAL PROMPT</p><h2 className="real-answer">{real?.text}</h2>
        <div className="fake-reveal"><span className="eyebrow">THE FAKE • {room.fakeAnswer?.playerName}</span><p>{fake?.text}</p></div>
        {room.lastGuess && <div className={`guess-result ${room.lastGuess.correct ? "is-correct" : "is-fake"}`}>
          <strong>{room.lastGuess.playerName} picked {room.lastGuess.correct ? "the real prompt" : "the fake"}</strong>
          <span>{room.lastGuess.correct ? "+1 point for the guess" : "+1 point for the trick"}</span>
        </div>}
        <Scoreboard players={room.players} />
        {room.phase === "finished" ? <button className="button button-lime" onClick={onNext}><ArrowLeft size={18} /> Back to title</button>
          : room.lastGuess && <button className="button button-lime" onClick={onNext}>Next round <ArrowDown size={18} /></button>}
        {!room.lastGuess && <p className="host-hint">Waiting for {room.players.find((player) => player.id !== room.drawerPlayerId)?.name} to choose...</p>}
      </div>
    </div>
  );
}

function ControllerApp() {
  const { room, error, setError, run } = useRoom();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState(new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "");
  const [fakeAnswer, setFakeAnswer] = useState("");
  const [submittedFake, setSubmittedFake] = useState(false);
  const [submittedDrawing, setSubmittedDrawing] = useState(false);
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    if (!socket.connected) socket.connect();
    return () => {
      socket.emit("leaveRoom");
      socket.disconnect();
    };
  }, []);

  const join = () => {
    setError("");
    socket.emit("joinRoom", { roomCode, name }, (result) => {
      if (!result.ok) setError(result.error);
    });
  };

  const leave = () => {
    socket.emit("leaveRoom");
    location.href = "/play";
  };

  const sendFake = () => {
    setError("");
    socket.emit("submitFakeAnswer", { answer: fakeAnswer }, (result) => {
      if (result.ok) setSubmittedFake(true);
      else setError(result.error);
    });
  };

  const sendDrawing = (imageData: string) => {
    setError("");
    socket.emit("submitDrawing", { imageData }, (result) => {
      if (result.ok) setSubmittedDrawing(true);
      else setError(result.error);
    });
  };

  const guess = (answerId: "real" | "fake") => {
    setSelected(answerId);
    run((ack) => socket.emit("submitGuess", { answerId }, ack));
  };

  if (!room) return (
    <main className="controller-shell join-shell">
      <Brand compact />
      <div className="join-card">
        <p className="eyebrow">YOUR PHONE IS YOUR CONTROLLER</p>
        <h1>Join the duel</h1>
        <label>Room code<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().slice(0, 4))} maxLength={4} autoCapitalize="characters" placeholder="ABCD" /></label>
        <label>Your name<input value={name} onChange={(event) => setName(event.target.value.slice(0, 18))} maxLength={18} placeholder="The doodler" /></label>
        <button className="button button-dark button-full" onClick={join} disabled={roomCode.length !== 4 || !name.trim()}>Join room <Gamepad2 size={18} /></button>
        {error && <p className="error-message">{error}</p>}
      </div>
      <p className="join-note">Two players. One room. Absolutely no artistic talent required.</p>
    </main>
  );

  const self = room.players.find((player) => player.id === room.selfPlayerId);
  const isDrawer = room.drawerPlayerId === room.selfPlayerId;
  const opponent = room.players.find((player) => player.id !== room.selfPlayerId);
  const canGuess = room.phase === "reveal" && !isDrawer && !room.lastGuess;

  return (
    <main className="controller-shell game-controller">
      <header className="controller-header"><Brand compact /><span className="controller-score">{self?.score ?? 0} <i>:</i> {opponent?.score ?? 0}</span></header>
      <div className="controller-round"><span>ROOM {room.roomCode}</span><span>{room.phase === "lobby" ? "LOBBY" : `ROUND ${room.roundNumber}`}</span></div>
      {room.phase === "lobby" && <section className="controller-panel waiting-panel"><div className="waiting-dots"><span /><span /><span /></div><h1>You're in, {self?.name}.</h1><p>Waiting for one more player and the host to start.</p><PlayerLine players={room.players} selfId={room.selfPlayerId} /></section>}
      {room.phase === "drawing" && isDrawer && <section className="controller-panel draw-panel">
        <p className="eyebrow">DRAW THIS, {self?.name?.toUpperCase()}</p><h1 className="prompt-card">{room.prompt ?? "Your secret prompt is loading..."}</h1>
        {submittedDrawing ? <div className="submitted-note"><Sparkles size={20} /> Drawing sent. Let the guessing begin.</div> : <DrawingCanvas onSubmit={sendDrawing} disabled={submittedDrawing} />}
      </section>}
      {room.phase === "drawing" && !isDrawer && <section className="controller-panel trick-panel">
        <p className="eyebrow">YOUR TURN TO DECEIVE</p><h1>Make up a better prompt.</h1><p className="muted-copy">A fake answer that could plausibly match the mystery drawing.</p>
        {submittedFake ? <div className="submitted-note"><Sparkles size={20} /> Your lie is locked in. Nice work.</div> : <>
          <textarea value={fakeAnswer} onChange={(event) => setFakeAnswer(event.target.value.slice(0, 80))} maxLength={80} placeholder="A very serious penguin..." rows={3} />
          <div className="input-footer"><span>{fakeAnswer.length}/80</span><button className="button button-dark" onClick={sendFake} disabled={fakeAnswer.trim().length < 2}>Send the lie <ArrowDown size={17} /></button></div>
        </>}
        <div className="mini-status"><RoundTimer duration={60} active /> <span>{room.drawerName} is drawing...</span></div>
      </section>}
      {room.phase === "reveal" && <section className="controller-panel guess-panel">
        <p className="eyebrow">{isDrawer ? "YOUR MASTERPIECE" : canGuess ? "PICK THE REAL PROMPT" : "THE REVEAL"}</p>
        {room.drawingData && <img className="controller-art" src={room.drawingData} alt={`Drawing by ${room.drawerName}`} />}
        {isDrawer ? <div className="submitted-note">The other player is choosing. Enjoy the suspense.</div> : <div className="answer-list">
          {room.answers?.map((answer) => <button key={answer.id} className={`answer-button ${selected === answer.id ? "answer-selected" : ""}`} disabled={!canGuess} onClick={() => guess(answer.id)}>{answer.text}</button>)}
        </div>}
        {room.lastGuess && <div className={`guess-result ${room.lastGuess.correct ? "is-correct" : "is-fake"}`}><strong>{room.lastGuess.correct ? "Nailed it!" : "You got played."}</strong><span>{room.lastGuess.correct ? "+1 point" : `${room.fakeAnswer?.playerName} gets +1 point`}</span></div>}
        <div className="prompt-reveal"><span className="eyebrow">REAL PROMPT</span><p>{room.prompt}</p><span className="eyebrow">FAKE BY {room.fakeAnswer?.playerName?.toUpperCase()}</span><p>{room.fakeAnswer?.text}</p></div>
      </section>}
      {room.phase === "finished" && <section className="controller-panel winner-panel"><Crown size={42} /><p className="eyebrow">DUEL CHAMPION</p><h1>{room.winner?.name}</h1><p>First to five. You made history.</p>
        {room.drawingData && <img className="controller-art" src={room.drawingData} alt={`Drawing by ${room.drawerName}`} />}
        <div className="prompt-reveal"><span className="eyebrow">REAL PROMPT</span><p>{room.answers?.find((answer) => answer.id === "real")?.text}</p><span className="eyebrow">FAKE BY {room.fakeAnswer?.playerName?.toUpperCase()}</span><p>{room.answers?.find((answer) => answer.id === "fake")?.text}</p></div>
        <button className="button button-dark button-full" onClick={leave}><DoorOpen size={18} /> Leave room</button></section>}
      <footer className="controller-footer"><PlayerLine players={room.players} selfId={room.selfPlayerId} /><button className="text-button" onClick={leave}>Leave</button></footer>
      {error && <div className="controller-error" role="alert">{error}</div>}
    </main>
  );
}

function PlayerLine({ players, selfId }: { players: RoomState["players"]; selfId?: string }) {
  return <div className="player-line">{players.map((player, index) => <span key={player.id} className={player.id === selfId ? "player-self" : ""}><i className={`player-dot dot-${index}`} />{player.name}{!player.connected && " · reconnecting"}</span>)}</div>;
}

export default function App() {
  return location.pathname.startsWith("/play") ? <ControllerApp /> : <HostApp />;
}