# leaf-on-read

NYC street trees that text you when they're thirsty.

## Run the phone demo locally

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
cd app && npx expo start --tunnel -c
```

Open the QR code in Expo Go on an iPhone. Gus is the pin near Columbia. Demo controls on his profile pull the virtual sensor out of the soil.

DigitalOcean, Atlas, and Tiger Data replace `MONGODB_URI`, `TIGER_DATABASE_URL`, and the tunnel URL before judging. The API image is `api/Dockerfile` and listens on `PORT`.
