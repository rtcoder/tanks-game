# Tanks Game

Browser tank arena built with TypeScript, Vite, Canvas 2D, and one Node backend that serves API data, WebSockets, and the built frontend.

## Setup

Install dependencies:

```sh
npm install
```

## Development

Run the backend server:

```sh
npm run server
```

Run the Vite dev frontend in another terminal:

```sh
npm run dev
```

Open `http://localhost:8080`. Vite proxies `/api` and `/ws` to the backend.

## Build

```sh
npm run build
```

After building, `npm start` serves the production frontend from `dist/` and the backend API/WebSocket from one process at `http://localhost:8001`.
