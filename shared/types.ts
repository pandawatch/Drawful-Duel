export type GamePhase = "lobby" | "drawing" | "reveal" | "finished";
export type ViewerRole = "host" | "player";

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface AnswerOption {
  id: "real" | "fake";
  text: string;
}

export interface RoomState {
  roomCode: string;
  phase: GamePhase;
  role: ViewerRole;
  selfPlayerId?: string;
  players: PlayerView[];
  roundNumber: number;
  drawerPlayerId?: string;
  drawerName?: string;
  prompt?: string;
  fakeAnswer?: { text: string; playerName: string };
  answers?: AnswerOption[];
  drawingData?: string;
  lastGuess?: { answerText: string; correct: boolean; playerName: string };
  winner?: PlayerView;
}

export type Ack<T = undefined> = (
  result: { ok: true; data: T } | { ok: false; error: string },
) => void;

export interface CreateRoomResult {
  roomCode: string;
}

export interface JoinRoomResult {
  playerId: string;
}

export interface ClientToServerEvents {
  createRoom: (ack: Ack<CreateRoomResult>) => void;
  joinRoom: (payload: { roomCode: string; name: string }, ack: Ack<JoinRoomResult>) => void;
  hostStart: (ack: Ack) => void;
  submitFakeAnswer: (payload: { answer: string }, ack: Ack) => void;
  submitDrawing: (payload: { imageData: string }, ack: Ack) => void;
  submitGuess: (payload: { answerId: AnswerOption["id"] }, ack: Ack) => void;
  nextRound: (ack: Ack) => void;
  leaveRoom: () => void;
}

export interface ServerToClientEvents {
  roomState: (state: RoomState) => void;
  gameError: (payload: { message: string }) => void;
  roomClosed: (payload: { message: string }) => void;
}