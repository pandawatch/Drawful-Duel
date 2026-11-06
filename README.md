# Drawful Duel

A two-player drawing-and-bluffing party game. The host opens the big-screen view; both players join from their phones as controllers. The game server owns room state, prompts, round progression, and scoring.

## Requirements

- Node.js 20.19+ (Node 22+ recommended)
- npm

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal for the host screen. Create a room, then open the displayed player link (or `/play`) in two controller tabs and join with the four-letter code. The host can start once both players are connected.

To run either process separately:

```sh
npm run dev:server   # Socket.IO server on port 3001
npm run dev:client   # Vite client on port 5173
```

For phone testing on the same network, open the Vite URL using the development computer's LAN IP (for example, `http://192.168.1.20:5173`). Vite proxies Socket.IO traffic to the server. Allow inbound access to port 5173 on that network.

## Game flow

- The host creates a room; two players join via the four-letter code. Rooms reject a third player.
- The host starts the game when both controllers are connected.
- Players alternate drawing a random unused prompt and submitting a fake answer.
- Once both submissions arrive, the non-drawer picks the real prompt. Correct guesses score one point; choosing the fake awards one point to its author.
- The first player to five points wins. The host advances each completed reveal to the next round.

Prompt data is in [`prompts/prompts.json`](prompts/prompts.json). Shared Socket.IO event and state types live in [`shared/types.ts`](shared/types.ts).

## Production client build

```sh
npm run build
npm run start:server
```

The build produces static files in `dist/`; deploy them behind a web server that proxies `/socket.io` to the Node server on port 3001.