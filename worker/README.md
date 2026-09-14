# Hearthside room server

The server behind **Play with friends**: a private room, joined by a short
code, for people on their own devices. It is entirely optional — the
single-player game needs none of this and works exactly as before whether or
not this is ever deployed.

Runs as a [Cloudflare Worker](https://workers.cloudflare.com/), free tier, no
payment method required. One [Durable Object](https://developers.cloudflare.com/durable-objects/)
instance per room holds a real, live `Poker.Table` — the exact same engine
the single-player game uses (`../game/poker.js`, imported directly, not
forked) — so a room referees itself with the same rules, no separate
reimplementation to keep in sync.

## What's here

- **`index.js`** — the only Cloudflare-specific file. Wires real WebSocket
  traffic to `Room` (below); no game logic of its own.
- **`room.js`** — everything about a room: seats, tokens, the turn clock, the
  live table. A plain class with no Cloudflare API surface, so it can be
  constructed and driven directly from a Node test.
- **`view.js`** — the one chokepoint every outbound message passes through:
  redacts hole cards and rotates seat numbers so each player is always
  "seat 0" in their own view, exactly like the single-player table they
  already know how to render.
- **`../game/code.js`** — room-code generation/parsing (shared with the
  client, so it lives in `game/`, not duplicated here).
- **`tests/`** — pure Node tests, no wrangler or network needed. Includes a
  redaction fuzz test that scripts full sessions across many seeds and
  asserts no player ever receives a card they aren't entitled to see.

## Deploy your own

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) —
no credit card required for this.

```bash
cd worker
npm install        # first time only; installing wrangler may warn about
                    # esbuild/workerd postinstall scripts - that's wrangler's
                    # own build tooling, safe to approve
npx wrangler login  # opens a browser to authorize once
npx wrangler deploy
```

That prints a URL like `https://hearthside-rooms.<you>.workers.dev`. Open
`game/multiplayer.js`, find the `defaultServer()` function near the top, and
replace the placeholder with your URL as `wss://` (not `https://`):

```js
return 'wss://hearthside-rooms.<you>.workers.dev';
```

Redeploy the game (or just reload it, for local testing) and **Play with
friends** will reach your Worker.

### Local testing

`npx wrangler dev` runs a local copy of the Worker. Point the game at it by
setting, in the browser console on the page you're testing:

```js
localStorage.setItem('hearthside-server', 'ws://127.0.0.1:8787');
```

(This overrides `defaultServer()` without needing a rebuild — see
`game/multiplayer.js`.)

## How a room works

- The creator picks the table size, companion difficulty and blind schedule;
  everyone else just picks a name and either creates or joins by code.
- Unclaimed seats are played by the existing AI companions — a two-friend
  room still looks and feels like Hearthside.
- A dropped connection gets 60 seconds to return before its seat
  auto-checks/folds (15 seconds if it was already known to be disconnected).
  No AI ever takes over a human's seat without them choosing that themselves
  in a future release.
- The room survives any disconnect; ten minutes after the *last* socket
  closes, its storage is deleted.
- Online rooms don't use the single-player game's 12-hand "evening" or club
  fund — they just play hands, for as long as anyone's there.

## What v1 does not do yet

Free-text or voice chat, a spectator mode, public matchmaking, joining a
room already in progress, and a visible turn-clock countdown are all
deliberately out of scope for now. See the project's planning notes for the
full phased rollout this fits into.

## A note on the signing/hosting cost

This Worker is designed to comfortably fit Cloudflare's free plan for a
small group of friends playing occasionally — see the request/duration
numbers in the code comments in `index.js` and `room.js` if you want to
reason about your own usage. If you ever need more than the free tier
offers, that's a decision for you to make; nothing here requires it to work
as shipped.
