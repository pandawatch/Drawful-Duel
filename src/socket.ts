import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../shared/types";

export const socket = io({ autoConnect: false }) as Socket<ServerToClientEvents, ClientToServerEvents>;