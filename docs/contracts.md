# Contracts for hardware and the iMessage agent

Base URL is the API (`EXPO_PUBLIC_API_URL` / DigitalOcean). All bodies are JSON.

## Pi → API

`POST /readings`

```json
{ "sensorId": "gus-demo", "moisture": 18, "temp": 24.1, "light": 400, "ts": "2026-09-26T18:00:00.000Z" }
```

`moisture` is a 0–100 percent after the sensor's dry/wet calibration. `201` on success.

The Arduino's own line is accepted too: `device_id` `gus-001` and `moisture_avg` map onto Gus (`sensorId` `gus-demo`).

## API → agent

`POST {AGENT_URL}/events`

```json
{
  "type": "thirsty",
  "treeId": "gus",
  "treeName": "Gus",
  "moisturePct": 18,
  "messages": [
    { "phone": "+12125550123", "language": "es", "text": "…", "voiceUrl": "https://api.example/trees/gus/voice?type=thirsty&lang=es" }
  ]
}
```

`type` is `thirsty`, `thanks`, `rain_skip`, `claimed`, or `claim_expired`. Deliver each `messages[]` item as a DM. `voiceUrl` is omitted when there is no clip. The agent does not write copy.

## Agent → API

- `GET /users/lookup?code=AB12CD` maps `Hi 🌳 join AB12CD` to the user.
- Inbound texts go to `POST /trees/:id/chat` with `{ "userId", "message", "channel": "imessage" }`. Send `reply` back to that phone.
- A thread defaults to the user's most recently adopted tree. The demo tree id is `gus`.
- "I watered it" can also call `POST /trees/:id/waterings` with `{ "userId", "gallons", "source": "imessage" }`.

## Web map reads

`GET /trees?bbox=minLng,minLat,maxLng,maxLat`

`GET /trees/:id`

`GET /trees/:id/readings?range=live|24h|7d`

`GET /blocks/:id/leaderboard`

CORS is open on these routes.
