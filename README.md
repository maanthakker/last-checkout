# LAST CHECKOUT

A first-person horror escape game set in the haunted Grand Wexley Hotel. Spooky, not gory (ages 10+).

- **Solo**: 14 floors, from Floor 5 down through the basement, the 7 hidden floors (Floor 13, Nursery, Mirror Hall, Library, Greenhouse, Theatre, Clock Tower) and the lobby finale.
- **Co-op party**: up to 4 heroes in one hotel, sharing one Night Manager. Party code on the check-in page.
- **Versus**: "Play online with a friend". One player is the hero, the other is the Night Manager.
- **Hall of Escapes**: the fastest wins, saved in MongoDB.

## Stack

| Part | What |
| --- | --- |
| `client/` | React 18 + Vite. The game engine runs three.js r128 (npm `three@0.128.0`). |
| `server/` | Node + Express (API, serves the built client) + Socket.IO (online rooms). |
| Database | MongoDB Atlas via Mongoose (leaderboard). Optional: the game runs without it. |

## Run it locally

```bash
npm install
npm run build          # installs and builds the client
cp .env.example .env   # add MONGODB_URI if you want the leaderboard
npm start              # http://localhost:3000
```

For development with hot reload, use two terminals: `npm run dev:server` and `npm run dev:client` (http://localhost:5173).

## Deploy on Render

1. Push this folder to a GitHub repo (for example `last-checkout`).
2. On Render: **New > Web Service**, pick the repo, then use:
   - Runtime: Node
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
   - Or use **New > Blueprint** and Render reads `render.yaml`.
3. Leaderboard (optional): in MongoDB Atlas create a free cluster and a database user, allow access from `0.0.0.0/0` under Network Access, copy the connection string, and add it on Render as the environment variable `MONGODB_URI`.

Free Render services sleep after about 15 minutes without visitors, so the first visit afterwards takes up to a minute to wake up.

## Notes

- Reference photos of real people never go in this repo (`photos/` and `reference/` are ignored).
- `npm test` runs a quick self-check of the online room logic.
