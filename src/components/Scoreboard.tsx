import type { PlayerView } from "../../shared/types";

export function Scoreboard({ players, drawerPlayerId }: { players: PlayerView[]; drawerPlayerId?: string }) {
  return <div className="scoreboard">{players.map((player, index) => <div className="score-player" key={player.id}>
    <span className={`score-avatar avatar-${index}`}>{player.name.slice(0, 1).toUpperCase()}</span>
    <span className="score-name">{player.name}{drawerPlayerId === player.id && <small>DRAWING</small>}{!player.connected && <small>OFFLINE</small>}</span>
    <b className="score-value">{player.score}</b>
  </div>)}</div>;
}