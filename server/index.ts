import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { Server, type Socket } from "socket.io";
import prompts from "../prompts/prompts.json";
import type {
  Ack,
  AnswerOption,
  ClientToServerEvents,
  PlayerView,
  RoomState,
  ServerToClientEvents,
} from "../shared/types";

interface Player {
  id: string;
  name: string;
  score: number;
  socketId?: string;
}

interface Room {
  code: string;
  hostSocketId?: string;
  players: Player[];
  phase: RoomState["phase"];
  roundNumber: number;
  drawerPlayerId?: string;
  prompt?: string;
  usedPrompts: Set<string>;
  fakeAnswer?: { text: string; playerId: string };
  drawingData?: string;
  answers?: AnswerOption[];
  lastGuess?: RoomState["lastGuess"];
  winnerId?: string;
  lastActivity: number;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AckResult<T> = Parameters<Ack<T>>[0];

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
  maxHttpBufferSize: 1_500_000,
});
const rooms = new Map<string, Room>();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function reply<T>(ack: Ack<T>, result: AckResult<T>): void {
  if (typeof ack === "function") ack(result);
}

function fail<T>(ack: Ack<T>, error: string): void {
  reply(ack, { ok: false, error });
}

function touch(room: Room): void {
  room.lastActivity = Date.now();
}

function createCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function playerFor(room: Room, socketId: string): Player | undefined {
  return room.players.find((player) => player.socketId === socketId);
}

function playerViews(room: Room): PlayerView[] {
  return room.players.map(({ id, name, score, socketId }) => ({
    id,
    name,
    score,
    connected: Boolean(socketId),
  }));
}

function snapshot(room: Room, socket: GameSocket, role: "host" | "player"): RoomState {
  const self = role === "player" ? playerFor(room, socket.id) : undefined;
  const drawer = room.players.find((player) => player.id === room.drawerPlayerId);
  const isReveal = room.phase === "reveal" || room.phase === "finished";
  const canSeePrompt = isReveal || (role === "player" && self?.id === room.drawerPlayerId);
  const fakePlayer = room.players.find((player) => player.id === room.fakeAnswer?.playerId);
  const winner = room.players.find((player) => player.id === room.winnerId);

  return {
    roomCode: room.code,
    phase: room.phase,
    role,
    selfPlayerId: self?.id,
    players: playerViews(room),
    roundNumber: room.roundNumber,
    drawerPlayerId: room.drawerPlayerId,
    drawerName: drawer?.name,
    ...(canSeePrompt && room.prompt ? { prompt: room.prompt } : {}),
    ...(isReveal && room.fakeAnswer && fakePlayer
      ? { fakeAnswer: { text: room.fakeAnswer.text, playerName: fakePlayer.name } }
      : {}),
    ...(isReveal && room.answers ? { answers: room.answers } : {}),
    ...(isReveal && room.drawingData ? { drawingData: room.drawingData } : {}),
    ...(room.lastGuess ? { lastGuess: room.lastGuess } : {}),
    ...(winner ? { winner: playerViews(room).find((player) => player.id === winner.id) } : {}),
  };
}

function publish(room: Room): void {
  if (room.hostSocketId) {
    const host = io.sockets.sockets.get(room.hostSocketId) as GameSocket | undefined;
    if (host) host.emit("roomState", snapshot(room, host, "host"));
  }
  for (const player of room.players) {
    if (!player.socketId) continue;
    const socket = io.sockets.sockets.get(player.socketId) as GameSocket | undefined;
    if (socket) socket.emit("roomState", snapshot(room, socket, "player"));
  }
}

function clearRound(room: Room): void {
  room.drawerPlayerId = undefined;
  room.prompt = undefined;
  room.fakeAnswer = undefined;
  room.drawingData = undefined;
  room.answers = undefined;
  room.lastGuess = undefined;
  room.winnerId = undefined;
}

function startRound(room: Room): void {
  room.roundNumber += 1;
  room.phase = "drawing";
  room.drawerPlayerId = room.players[(room.roundNumber - 1) % 2].id;
  const unused = prompts.filter((prompt) => !room.usedPrompts.has(prompt));
  if (unused.length === 0) room.usedPrompts.clear();
  const available = unused.length > 0 ? unused : prompts;
  room.prompt = available[randomInt(available.length)];
  room.usedPrompts.add(room.prompt);
  room.fakeAnswer = undefined;
  room.drawingData = undefined;
  room.answers = undefined;
  room.lastGuess = undefined;
  touch(room);
}

function revealIfReady(room: Room): void {
  if (!room.drawingData || !room.fakeAnswer || !room.prompt) return;
  const options: AnswerOption[] = [
    { id: "real", text: room.prompt },
    { id: "fake", text: room.fakeAnswer.text },
  ];
  if (randomInt(2) === 1) options.reverse();
  room.answers = options;
  room.phase = "reveal";
}

function resetToLobby(room: Room): void {
  room.phase = "lobby";
  room.roundNumber = 0;
  room.usedPrompts.clear();
  room.players.forEach((player) => { player.score = 0; });
  clearRound(room);
}

function closeRoom(room: Room, message: string): void {
  io.to(room.code).emit("roomClosed", { message });
  rooms.delete(room.code);
}

function roomForSocket(socket: GameSocket, ack: Ack): Room | undefined {
  const code = socket.data.roomCode as string | undefined;
  const room = code ? rooms.get(code) : undefined;
  if (!room) fail(ack, "That room is no longer available.");
  return room;
}

io.on("connection", (socket: GameSocket) => {
  socket.on("createRoom", (ack) => {
    try {
      const code = createCode();
      const room: Room = {
        code,
        hostSocketId: socket.id,
        players: [],
        phase: "lobby",
        roundNumber: 0,
        usedPrompts: new Set(),
        lastActivity: Date.now(),
      };
      rooms.set(code, room);
      socket.data.roomCode = code;
      socket.data.role = "host";
      void socket.join(code);
      reply(ack, { ok: true, data: { roomCode: code } });
      publish(room);
    } catch (error) {
      console.error("createRoom failed", error);
      fail(ack, "Couldn't create a room. Please try again.");
    }
  });

  socket.on("joinRoom", (payload, ack) => {
    try {
      const code = payload.roomCode.trim().toUpperCase();
      const name = payload.name.trim().slice(0, 18);
      const room = rooms.get(code);
      if (!room) return fail(ack, "Room not found. Check the code and try again.");
      if (name.length < 1) return fail(ack, "Enter a name to join.");

      const reconnecting = room.players.find(
        (player) => !player.socketId && player.name.toLowerCase() === name.toLowerCase(),
      );
      let player = reconnecting;
      if (!player) {
        if (room.phase !== "lobby") return fail(ack, "This game is already in progress.");
        if (room.players.length >= 2) return fail(ack, "This room already has two players.");
        player = { id: crypto.randomUUID(), name, score: 0 };
        room.players.push(player);
      }
      player.socketId = socket.id;
      socket.data.roomCode = code;
      socket.data.role = "player";
      void socket.join(code);
      touch(room);
      reply(ack, { ok: true, data: { playerId: player.id } });
      publish(room);
    } catch (error) {
      console.error("joinRoom failed", error);
      fail(ack, "Couldn't join the room. Please try again.");
    }
  });

  socket.on("hostStart", (ack) => {
    const room = roomForSocket(socket, ack);
    if (!room) return;
    if (room.hostSocketId !== socket.id) return fail(ack, "Only the host can start the game.");
    if (room.phase !== "lobby") return fail(ack, "The game has already started.");
    if (room.players.length !== 2 || room.players.some((player) => !player.socketId)) {
      return fail(ack, "Both players need to be connected before starting.");
    }
    room.players.forEach((player) => { player.score = 0; });
    room.roundNumber = 0;
    room.usedPrompts.clear();
    startRound(room);
    reply(ack, { ok: true, data: undefined });
    publish(room);
  });

  socket.on("submitFakeAnswer", ({ answer }, ack) => {
    const room = roomForSocket(socket, ack);
    const player = room ? playerFor(room, socket.id) : undefined;
    if (!room || !player) return fail(ack, "Join the room before submitting an answer.");
    if (room.phase !== "drawing") return fail(ack, "The fake answer can only be sent during drawing.");
    if (player.id === room.drawerPlayerId) return fail(ack, "The drawer can't submit the fake answer.");
    if (typeof answer !== "string") return fail(ack, "Enter a text answer first.");
    const text = answer.trim().slice(0, 80);
    if (text.length < 2) return fail(ack, "Your fake answer needs at least two characters.");
    if (room.fakeAnswer) return fail(ack, "A fake answer has already been submitted.");
    room.fakeAnswer = { text, playerId: player.id };
    revealIfReady(room);
    touch(room);
    reply(ack, { ok: true, data: undefined });
    publish(room);
  });

  socket.on("submitDrawing", ({ imageData }, ack) => {
    const room = roomForSocket(socket, ack);
    const player = room ? playerFor(room, socket.id) : undefined;
    if (!room || !player) return fail(ack, "Join the room before submitting a drawing.");
    if (room.phase !== "drawing" || player.id !== room.drawerPlayerId) {
      return fail(ack, "Only the current drawer can submit a drawing.");
    }
    if (typeof imageData !== "string" || !/^data:image\/(png|jpeg);base64,/.test(imageData) || imageData.length > 1_200_000) {
      return fail(ack, "That drawing is too large. Try a simpler picture.");
    }
    if (room.drawingData) return fail(ack, "Your drawing has already been submitted.");
    room.drawingData = imageData;
    revealIfReady(room);
    touch(room);
    reply(ack, { ok: true, data: undefined });
    publish(room);
  });

  socket.on("submitGuess", ({ answerId }, ack) => {
    const room = roomForSocket(socket, ack);
    const player = room ? playerFor(room, socket.id) : undefined;
    if (!room || !player) return fail(ack, "Join the room before guessing.");
    if (room.phase !== "reveal" || !room.answers) return fail(ack, "It's not time to guess yet.");
    if (player.id === room.drawerPlayerId) return fail(ack, "The drawer watches this one.");
    if (room.lastGuess) return fail(ack, "A guess has already been submitted.");
    const choice = room.answers.find((answer) => answer.id === answerId);
    if (!choice) return fail(ack, "That answer isn't available.");
    const correct = answerId === "real";
    if (correct) player.score += 1;
    else {
      const trickster = room.players.find((candidate) => candidate.id === room.fakeAnswer?.playerId);
      if (trickster) trickster.score += 1;
    }
    room.lastGuess = { answerText: choice.text, correct, playerName: player.name };
    const winner = room.players.find((candidate) => candidate.score >= 5);
    if (winner) {
      room.winnerId = winner.id;
      room.phase = "finished";
    }
    touch(room);
    reply(ack, { ok: true, data: undefined });
    publish(room);
  });

  socket.on("nextRound", (ack) => {
    const room = roomForSocket(socket, ack);
    if (!room) return;
    if (room.hostSocketId !== socket.id) return fail(ack, "Only the host can continue.");
    if (room.phase !== "reveal" || !room.lastGuess) return fail(ack, "Finish this reveal first.");
    clearRound(room);
    startRound(room);
    reply(ack, { ok: true, data: undefined });
    publish(room);
  });

  socket.on("leaveRoom", () => {
    const code = socket.data.roomCode as string | undefined;
    const room = code ? rooms.get(code) : undefined;
    if (!room) return;
    if (room.hostSocketId === socket.id) {
      closeRoom(room, "The host closed this room.");
      return;
    }
    const player = playerFor(room, socket.id);
    if (player) {
      room.players = room.players.filter((candidate) => candidate.id !== player.id);
      resetToLobby(room);
      touch(room);
      publish(room);
    }
    void socket.leave(code!);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode as string | undefined;
    const room = code ? rooms.get(code) : undefined;
    if (!room) return;
    if (room.hostSocketId === socket.id) {
      closeRoom(room, "The host disconnected, so this room has closed.");
      return;
    }
    const player = playerFor(room, socket.id);
    if (player) {
      player.socketId = undefined;
      touch(room);
      publish(room);
    }
  });
});

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const room of rooms.values()) {
    if (room.lastActivity < cutoff) closeRoom(room, "This room expired after being inactive.");
  }
}, 60_000).unref();

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Drawful Duel server listening on ${port}`);
});