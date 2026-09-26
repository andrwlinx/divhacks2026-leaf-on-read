# Leaf on Read

A young street tree in New York can drink 15 to 20 gallons a week from May through October. That is three or four buckets, carried by someone who lives close enough to notice. The city looks after a new tree for its first two years. After that, the tree lives or dies with the block.

Most of them die thirsty. Dry soil is invisible from the sidewalk, and a reminder that arrives on the wrong week gets ignored. Leaf on Read puts a small sensor in the soil and lets the tree ask its neighbors, in its own voice, on the day it actually needs water.

## A block that looks after its own

The people who save a street tree are the ones who walk past it every morning. They already know its corner. They already carry buckets when someone asks. They need a clear signal, and a reason to feel that this particular tree is theirs.

Leaf on Read gives a block that signal, and a tree they can talk to.

- **The tree texts when the soil is dry.** Two dry readings in a row, and Gus (or whichever tree you adopted) messages the neighbors who said they would look after it. If rain is already on the way, he stays quiet.
- **One person can say "I'm on it."** The rest of the block hears that someone is coming, so three people do not show up with the same bucket, and nobody assumes someone else went.
- **Watering is something the block can see.** Gallons get logged, the pin on the map turns green, and the tree says thank you. A leaderboard for the block is just neighbors keeping score on care.
- **You can talk back.** Text the tree, or stand next to it and talk. It knows its moisture, its species, and the people who have been showing up.

The demo is one pin oak near Columbia, named Gus. The map around him is the real street-tree census for Morningside Heights. The idea is the same on any block: a tree with a name, a few neighbors who opted in, and a text that arrives when the soil says so.

## Run the phone demo

```bash
open -a Docker   # first time, wait until the whale is ready
docker compose up -d   # Timescale is on localhost:5433 so it does not collide with a local Postgres
cp api/.env.example api/.env
cd api && npm install && npm test && npm run seed && npm run dev
```

In another terminal, expose the API and start the iPhone app:

```bash
cloudflared tunnel --url http://localhost:3000
```

Put the printed `https://….trycloudflare.com` URL in `app/.env` as `EXPO_PUBLIC_API_URL` and in `api/.env` as `PUBLIC_API_URL`, then:

```bash
cd app && npx expo start --tunnel
```

Open the QR code in Expo Go on an iPhone. Gus is the pin near Columbia. On his profile, **Pull from soil** dries the virtual sensor; within a few seconds his pin turns red and his text arrives. **Back in the pot** puts him back. Log a watering and he thanks you.

DigitalOcean, Atlas, and Tiger Data replace `MONGODB_URI`, `TIGER_DATABASE_URL`, and the tunnel URL before judging. The API image is `api/Dockerfile` and listens on `PORT`.
