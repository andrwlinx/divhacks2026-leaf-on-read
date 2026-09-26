# Leaf on Read — Product Requirements

> NYC street trees that text you when they're thirsty. Soil sensors + an iMessage agent that rallies neighbors to water young trees, with a companion mobile app for the map, adoption, and watering logs.

| | |
|---|---|
| **Event** | DivHacks 2026, Columbia (hacking ends Sun 9/27 10:30 AM, judging 12–4 PM) |
| **General track** | Know Your City (alt: Hack the City) |
| **Sponsor tracks** | Photon, Gemini, ElevenLabs, SpaceXAI (Grok + Cursor), DeepSpace, Tiger Data, MongoDB Atlas, DigitalOcean, .Tech |
| **Owners** | **App + API + data:** Andrew · **Hardware:** HW teammate · **iMessage agent:** Agent teammate · **Web map:** TBD |

---

## 1. Problem

Young street trees in NYC die mostly from lack of water.

- NYC Parks says young trees need **15–20 gallons per week, May through October** (3–4 large buckets). City arborists cite insufficient water as the leading cause of street tree death.
- Parks contractors care for new trees for **only their first two years**, watering at least every two weeks. After that, survival depends on neighbors.
- NYC Parks' Young Street Tree Mortality Study (13,405 trees, 2006–07) found **~74% alive**; survival ranged from **~60–63%** in industrial and vacant areas to **~83%** on one- and two-family residential blocks. Fewer caretakers means more dead trees.
- A reminder study (Ithaca, NY) found postcards to water street trees measurably raised soil moisture, **but the effect faded**, and only reminders sent during peak dry weeks mattered.

**Insight:** generic, scheduled reminders fade. A reminder triggered by *actual* dry soil, from a tree with a personality neighbors feel attached to, arrives exactly when it matters and is harder to ignore.

Sources: [NYC Parks – Water](https://www.nycgovparks.org/trees/tree-care/water) · [NYC Parks – Young Street Tree Mortality](https://www.nycgovparks.org/trees/ystm) · [Lu et al. (USFS)](https://research.fs.usda.gov/treesearch/37294) · [Stewardship outreach study](https://auf.isa-arbor.com/content/42/5/301) · [Gothamist – drought and street trees](https://gothamist.com/news/drought-presents-dire-threat-to-nycs-street-trees-arborists-say)

## 2. Users

1. **Block neighbors**: adopt a tree, get texted when it's thirsty, log watering.
2. **Block association organizers**: see which trees on their blocks need help and who's pitching in.
3. **Public / judges**: view the citywide web map at `leafonread.tech`.

## 3. Scope

**In scope (this PRD):** Expo mobile app, backend API, databases, the thirst-alert job, the read API for the web map.

**Owned by teammates (interfaces defined here):** Arduino/Pi firmware, Photon iMessage agent, DeepSpace web map.

**Out of scope:** real citywide deployment, sync with NYC Tree Map, auth beyond phone number.

## 4. Architecture

```
Arduino (Grove moisture / temp / light)
   └─ USB serial ─► Raspberry Pi 4 ─► POST /readings ─► API (Node/TS on DigitalOcean App Platform)
                                                          ├─► Tiger Data   : readings hypertable (time series)
                                                          ├─► MongoDB Atlas: trees, users, waterings, blocks
                                                          ├─► thirst job ─► POST {AGENT_URL}/events ─► Photon iMessage agent
                                                          │              └► Expo push (fallback)
                                                          ├─► Grok       : tree persona, message copy, and the tree chat brain (§8a)
                                                          ├─► Gemini     : watering-photo verification
                                                          └─► ElevenLabs : tree voice clips (cached)
Expo app (iOS/Android) ◄──► API
DeepSpace web map (leafonread.tech) ◄── API (read-only)
```

**Why two databases:** sensor readings are high-frequency time series (Tiger Data hypertables + continuous aggregates are built for this); trees/users/waterings are flexible documents (MongoDB). Each is the right tool for its job.

### 4a. iMessage outbound: what Photon supports

Researched 9/26 ([Spaces and Users](https://photon.codes/docs/spectrum-ts/spaces-and-users), [iMessage connection & routing](https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing), [Hermes Agent's Photon guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/photon)):

- **The SDK can text someone first.** `im.space.create(await im.user("+1..."))` then `.send(...)` starts a new DM; passing several users creates a group.
- **But the line type matters:**

| | Shared pool (free / Pro) | Dedicated line (Business) |
|---|---|---|
| Start a DM with a new number | **No** per Hermes docs: recipients must text the line first | Yes |
| Group chats | **No**, throws `UnsupportedError` | Yes |
| Sender number | Can differ per recipient | One number for everyone |
| Limits | 5,000 msgs/day per server, 50 new conversations/line/day | Same defaults, raisable |

**Decision: design for opt-in first, so the app works on either line.**
1. Onboarding ends with **Say hi to your tree**, which opens iMessage prefilled with `Hi 🌳 join <userCode>`. The agent maps the sender's number to the user, so the conversation now exists and the agent can message them any time afterward. This is also good consent practice for unsolicited texts.
2. Thirsty alerts go as **DMs to each adopter** (fan-out). Works on shared pool.
3. **Block group chat is a stretch** that needs a dedicated line. AG asks the Photon sponsor table for a dedicated line or hackathon credits.
4. **Open question for the Photon table:** on the shared pool, which number does a user text first? If the number isn't stable, the app fetches it from `GET /agent/line` (served by AG) instead of hardcoding `EXPO_PUBLIC_AGENT_PHONE`.

**Why the web map is separate:** the DeepSpace SDK targets Vite + React on Cloudflare Workers and doesn't support React Native.

## 5. App features

| Pri | Feature | Description |
|---|---|---|
| P0 | Onboarding | Phone number (ties the user to their iMessage identity), name, home block, language, push permission, then **"Say hi to your tree"**: opens iMessage with a prefilled join code so the user texts the agent first (opt-in; see §4a) |
| P0 | Map | Trees near the user; pins colored **thirsty / ok / no sensor**; seeded from the 2015 NYC Street Tree Census around Columbia |
| P0 | Tree profile | Name, species, persona blurb, live moisture gauge, 7-day chart, last watered, caretakers, **Text this tree** (opens iMessage to the agent's line) |
| P0 | Log watering | One tap + gallons; a sensor rise auto-confirms it |
| P1 | Adopt & name | Claim a tree and name it; Grok generates its personality |
| P1 | Photo proof | Optional photo; Gemini checks it shows watering |
| P0 | Talk to your tree (iMessage) | Text the tree anything; it replies in character, grounded in its real sensor data and watering history (§8a) |
| P1 | Talk to your tree (in app) | Chat screen on the tree profile using the same brain and history as iMessage |
| P1 | Talk out loud | Hold-to-talk voice conversation on its own screen: the tree greets you, says how it's doing (thirsty/fine, soil moisture), and answers in its persona's voice. ElevenLabs Scribe for speech-to-text and ElevenLabs TTS for replies; falls back to typing and the iPhone's built-in voice when keys are missing |
| P2 | Voice replies | Tree replies as ElevenLabs voice notes in iMessage and playable audio in the app |
| P1 | Hear your tree | ElevenLabs voice clip in the tree's voice on the profile |
| P1 | Block leaderboard | Gallons and streaks per neighbor (people ranked for contributing, not trees) |
| P1 | Rain check | Before a thirsty alert, check the forecast; if rain is coming, the tree skips the alert and says so (§8b) |
| P1 | "I'm on it" claiming | One tap (or text "on it") claims a thirsty tree for 2 hours; other adopters see who's on it and stop getting nagged (§8c) |
| P1 | Your language | Pick a language at onboarding; the tree texts, chats, and speaks in it (§8d) |
| P2 | Impact | Gallons delivered, hours trees stayed above threshold, mortality-by-land-use overlay |
| P2 | Push fallback | Expo push when the iMessage agent is unreachable |

## 6. API contract

All JSON. Base URL from `EXPO_PUBLIC_API_URL`.

| Method | Path | Body / query | Returns | Caller |
|---|---|---|---|---|
| POST | `/readings` | `{sensorId, moisture, temp, light, ts}` | `201` | Pi |
| GET | `/trees` | `?bbox=minLng,minLat,maxLng,maxLat` | `Tree[]` with `status` | App, web map |
| GET | `/trees/:id` | — | `Tree` + latest reading + caretakers | App, web map |
| GET | `/trees/:id/readings` | `?range=24h\|7d` | hourly `{t, moisture}` | App, web map |
| POST | `/users` | `{phone, name, blockId, language, pushToken?}` | `User` | App |
| POST | `/trees/:id/adopt` | `{userId, name}` | `Tree` with persona | App |
| POST | `/trees/:id/waterings` | `{userId, gallons, photoBase64?}` | `Watering` with `verified` | App, agent |
| POST | `/trees/:id/claim` | `{userId}` | `{claim: {userId, name, until}}`, `409` if already claimed | App, agent |
| DELETE | `/trees/:id/claim` | `{userId}` | `204` | App, agent |
| GET | `/blocks/:id/leaderboard` | — | `[{userId, name, gallons, streak}]` | App, web map |
| POST | `/trees/:id/chat` | `{userId, message, channel: "app"\|"imessage"}` | `{reply, actions[], voiceUrl?}` | App, agent |
| GET | `/trees/:id/chat` | `?userId=&limit=50` | message history | App |
| POST | `/trees/:id/talk/greet` | `{userId}` | `{reply, state, audioUrl}`: the tree says hi and how it's doing | App |
| POST | `/trees/:id/talk` | multipart `userId` + `audio` (m4a) or `text` | `{transcript, reply, actions, state, audioUrl}` | App |
| GET | `/voice/clips/:id` | — | `audio/mpeg` spoken reply | App |
| GET | `/trees/:id/voice` | `?type=thirsty\|thanks` | `audio/mpeg` (cached) | App, agent |

**Outbound to the agent** (share with Agent teammate by **4 PM Sat**):
```json
POST {AGENT_URL}/events
{
  "type": "thirsty" | "thanks" | "rain_skip" | "claimed" | "claim_expired",
  "treeId": "...",
  "treeName": "Gus",
  "moisturePct": 18,
  "messages": [
    { "phone": "+12125550123", "language": "es", "text": "…", "voiceUrl": "https://api.../voice/abc.mp3" }
  ]
}
```
The API writes each message in the recipient's language; the agent only delivers `text` (and `voiceUrl` if present) to each `phone`.

## 7. Data model

**MongoDB**
- `users` `{_id, phone, name, blockId, language, pushToken, createdAt}`
- `trees` `{_id, censusId, species, lat, lng, address, blockId, name, persona, sensorId, adopterIds[], thirstThreshold, status, lastAlertAt, claim: {userId, until} | null, rainSkipUntil}`
- `waterings` `{_id, treeId, userId, gallons, photoUrl, verified, source: "app" | "imessage", at}`
- `messages` `{_id, treeId, userId, role: "user" | "tree", text, channel: "app" | "imessage", actions[], at}`
- `blocks` `{_id, name, bbox}`

**Tiger Data**
```sql
CREATE TABLE readings (
  time TIMESTAMPTZ NOT NULL,
  sensor_id TEXT NOT NULL,
  tree_id TEXT,
  moisture DOUBLE PRECISION,
  temp DOUBLE PRECISION,
  light DOUBLE PRECISION
);
SELECT create_hypertable('readings', 'time');
-- plus an hourly continuous aggregate (avg moisture per tree) for charts
```

## 8. Thirst logic

- **Calibrate** each sensor at setup: record raw values in dry and saturated soil, then store the threshold on the tree.
- **Thirsty** = average moisture below threshold for 2 consecutive windows (hourly in production, ~1 minute in demo mode via `DEMO_MODE=1`).
- **Cooldown:** at most one alert per tree every 6 hours (30 s in demo mode).
- **Before alerting**, run the rain check (§8b) and skip alerts while the tree is claimed (§8c).
- **Clears** when a watering is logged or moisture rises back above threshold; a sensor rise after a watering sends a `thanks` event.

## 8a. Talking to the tree

**One brain, two surfaces.** `POST /trees/:id/chat` is the only place tree replies are generated. The Photon agent forwards inbound texts to it; the app's chat screen calls it directly. Same persona, same memory, whichever channel the user picks.

**Each reply is built from:**
- the tree's persona (generated by Grok at adoption) and name, species, and address
- live state from Tiger Data: current moisture %, trend over the last 24 h, temperature, hours since last watering
- recent waterings and who did them (Mongo)
- the last ~20 messages with this user (Mongo `messages`)

**Rules in the system prompt:**
- Stay in character, keep replies to 1–3 short sentences (it's a text message).
- Only state facts about its own condition that come from the provided data; never invent readings.
- If asked something unrelated or unsafe, deflect in character and steer back to the block or the tree.

**Actions via tool calls** (returned in `actions[]` and executed by the API):
- `log_watering {gallons}`: "just gave you two buckets" → watering logged, status cleared
- `get_status`: "how are you feeling?" → answers from live data
- `rename {name}`: adopter can rename the tree

**Routing iMessage threads to a tree:** a user's thread talks to their most recently adopted tree by default; mentioning another tree by name ("hey Maple") switches the thread to it.

**Stretch:** swap Mongo history for Backboard long-term memory (another sponsor prize) so the tree remembers facts about each neighbor across weeks.

## 8b. Rain check

- When a tree turns thirsty, fetch the next 12 h of hourly precipitation for its location from [Open-Meteo](https://open-meteo.com/) (free, no API key). Cache per block for 30 min.
- **Skip** if expected rain ≥ 6 mm (~¼ in) with probability ≥ 60% (tunable). Send a `rain_skip` event once (*"Rain's coming tonight, you're off the hook 🌧️"*) and set `rainSkipUntil` to the end of the rain window.
- **After the window:** if moisture is still below threshold, the rain wasn't enough, so alert normally.
- **Demo:** `DEMO_FORCE_RAIN=1` fakes a forecast so the skip can be shown on demand.
- The tree's chat context includes the forecast, so "should I water you today?" gets a weather-aware answer.

## 8c. "I'm on it" claiming

- A thirsty-alert recipient taps **I'm on it** in the app, or texts "on it" (the chat brain calls the `claim` tool).
- The tree is claimed for **2 hours** (2 min in demo mode). Other adopters get a `claimed` event: *"Andrew's on it 💪"*. No more thirsty alerts go out while it's claimed.
- Logging a watering (or a sensor rise) clears the claim and triggers `thanks`.
- If the claim expires with no watering, send `claim_expired` to the other adopters and resume normal alerts.
- Only one active claim per tree; a second claim returns `409` with who holds it.

## 8d. Your language

- Onboarding asks for a language (start with English, Spanish, Chinese, Bengali, Russian, Haitian Creole, Korean, Arabic; stored as a code like `es`).
- Alert texts, chat replies, and the voice all use the recipient's language. Grok writes in that language with the same persona; ElevenLabs uses its multilingual model with the tree's voice.
- Group messages (if we get a dedicated line) use the block's most common language.
- Out of scope: translating the app's own UI.

## 9. Task list

Legend: **A** = Andrew (app/API), **HW** = hardware teammate, **AG** = agent teammate.

### Phase 0: Setup (now → 3 PM Sat)
- [ ] **A** Monorepo `app/ api/ web/ firmware/ agent/ docs/`; add `.gitignore` and `.env.example` **before** any keys. *Done when:* `git grep -i key` finds no secrets.
- [ ] **A** `npx create-expo-app app` (TypeScript, Expo Router). *Done when:* the app opens on a phone via Expo Go.
- [ ] **A** API skeleton (Hono or Express, TS) with `GET /health`, deployed to DigitalOcean App Platform. *Done when:* the public URL returns 200.
- [ ] **A** Create MongoDB Atlas cluster and Tiger Data service; connection strings in `.env`. *Done when:* the API connects to both on boot.
- [ ] **A** Claim the `leafonread.tech` domain at the MLH table.
- [ ] **HW** Arduino reads moisture/temp/light; Pi forwards over serial. *Done when:* Pi prints readings every 5 s.

### Phase 1: Data spine (→ 7 PM Sat)
- [ ] **A** Seed ~50 trees within ~6 blocks of Columbia from the Street Tree Census into Mongo. *Done when:* `GET /trees?bbox=` returns them.
- [ ] **A** `POST /readings` → Tiger hypertable; create hourly continuous aggregate. *Done when:* inserted rows show up in `/trees/:id/readings`.
- [ ] **A** `scripts/fake-sensor.ts`: posts a dry→wet curve for a tree. *Done when:* the app and API can be developed with no hardware.
- [ ] **A** Share the `/readings` and `/events` contracts with HW and AG.
- [ ] **HW** Pi posts to `/readings`. *Done when:* live rows appear in Tiger.

### Phase 2: P0 app (→ 1 AM Sun)
- [ ] **A** Onboarding → `POST /users`, store user locally (SecureStore). *Done when:* relaunch skips onboarding.
- [ ] **A** Map screen (`react-native-maps`), status-colored pins, refresh every 15 s. *Done when:* a fake-sensor dry-out turns a pin red without reopening the app.
- [ ] **A** Tree profile with gauge + 7-day chart (e.g. `victory-native` or `react-native-gifted-charts`). *Done when:* the chart matches Tiger data.
- [ ] **A** Log watering → `POST /waterings`; status flips to ok. *Done when:* the pin goes green after logging.
- [ ] **A** "Say hi to your tree" (onboarding) and "Text this tree" (profile) open `sms:` to the agent's line with a prefilled join code / message. *Done when:* texting it makes the agent reply by name.
- [ ] **AG** Before 4 PM Sat: confirm with the Photon table which line type we have, whether the shared-pool number is stable, and whether a dedicated line is available for the demo.
- [ ] **A** `POST /trees/:id/chat` with persona + live-data context + message history (Grok). *Done when:* "how are you?" answers with the real moisture reading, in character.
- [ ] **AG** Forward every inbound text to `POST /trees/:id/chat` and send back `reply`. *Done when:* a text to the tree gets an in-character reply within ~5 s.

### Phase 3: Integrations (→ 6 AM Sun)
- [ ] **A** Thirst job (per §8) → `POST {AGENT_URL}/events` + Expo push fallback. *Done when:* a dry-out triggers exactly one alert per cooldown.
- [ ] **A** Adopt flow; Grok generates persona + name suggestions. *Done when:* a new tree has a persona within 5 s.
- [ ] **A** Chat tool calls: `log_watering`, `get_status`, `rename`. *Done when:* texting "I watered you" clears the thirsty status.
- [ ] **A** In-app chat screen on the tree profile, showing history from both channels. *Done when:* a message sent over iMessage also appears in the app thread.
- [ ] **A** Rain check (§8b): Open-Meteo lookup, skip logic, `rain_skip` event, `DEMO_FORCE_RAIN`. *Done when:* a dry-out with forced rain sends the rain message instead of a thirsty alert.
- [ ] **A** Claiming (§8c): claim endpoints, `claim` chat tool, 2-hour expiry, `claimed` / `claim_expired` events, **I'm on it** button on the profile and map. *Done when:* claiming from one phone stops alerts to the other and shows "Andrew's on it."
- [ ] **A** Language (§8d): picker in onboarding, `language` on users, per-recipient message text, multilingual voice. *Done when:* a Spanish-speaking user gets the thirsty alert and chat replies in Spanish.
- [ ] **A** (P2) Voice replies: ElevenLabs audio for chat replies, returned as `voiceUrl`.
- [ ] **A** Gemini photo check on watering. *Done when:* a photo of a bucket at a tree returns `verified: true`, a random photo returns `false`.
- [ ] **A** ElevenLabs voice endpoint with caching; play button on profile.
- [ ] **A** Block leaderboard screen.
- [ ] **A** Enable CORS for read endpoints; hand the base URL to the web map owner.
- [ ] **AG** Handle `join <userCode>` messages → link phone to user. Deliver each event's `messages[]` as DMs (all types: `thirsty`, `thanks`, `rain_skip`, `claimed`, `claim_expired`) (group chat only if we have a dedicated line); forward "I watered it" replies to `POST /waterings`.
- [ ] **TBD** DeepSpace web map at `leafonread.tech` reading `/trees` and `/leaderboard`.

### Phase 4: Freeze (6 → 10:30 AM Sun)
- [ ] **All** End-to-end run with real sensor and real iMessage.
- [ ] **A** Demo seed data (a few trees mid-thirst, a populated leaderboard).
- [ ] **A** Record a backup screen video of the full demo.
- [ ] **All** Devpost write-up, including one line per sponsor on exactly how it's used.
- [ ] **All** Submit before 10:30 AM.

## 10. Demo script (2 min)

1. "Young street trees in NYC die from thirst, and reminders fade. Meet Gus."
2. Pull the sensor out of wet soil. Within seconds, Gus's pin turns red on the app map.
3. The judge's phone (they said hi to Gus at the start of the demo) gets a text from Gus, in character, with his voice clip. With a dedicated line, this goes to a block group chat instead.
4. A judge taps **I watered it** (or replies in iMessage), and waters the pot.
5. Moisture rises on the live chart; Gus texts a thank-you; the judge climbs the leaderboard.
6. Close on the web map: "every block, every tree, every neighbor."

## 11. Risks & open questions

| Risk | Mitigation |
|---|---|
| Shared-pool Photon lines can't start conversations or group chats (§4a) | Opt-in-first design: users text the tree during onboarding; alerts are DMs. Ask the Photon table for a dedicated line |
| Hardware fails during judging | `fake-sensor.ts` in demo mode + backup video |
| Grove moisture readings are noisy / uncalibrated | Per-sensor dry/wet calibration; average over the window |
| Venue Wi-Fi flaky for the Pi | Phone hotspot for the Pi |
| Web map has no owner | Stretch goal; the app is the primary demo |
| Judges ask about real deployment (theft, weather) | Sealed low-cost unit per adopted tree, run by block associations; data could feed NYC Tree Map |

## 12. Environment variables

```
# api/.env
MONGODB_URI=
TIGER_DATABASE_URL=
AGENT_URL=
GEMINI_API_KEY=
XAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
DEMO_MODE=1
DEMO_FORCE_RAIN=0

# app/.env
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_AGENT_PHONE=
```
