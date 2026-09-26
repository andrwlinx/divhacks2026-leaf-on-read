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
                                                          ├─► Grok       : tree persona + message copy
                                                          ├─► Gemini     : watering-photo verification
                                                          └─► ElevenLabs : tree voice clips (cached)
Expo app (iOS/Android) ◄──► API
DeepSpace web map (leafonread.tech) ◄── API (read-only)
```

**Why two databases:** sensor readings are high-frequency time series (Tiger Data hypertables + continuous aggregates are built for this); trees/users/waterings are flexible documents (MongoDB). Each is the right tool for its job.

**Why the web map is separate:** the DeepSpace SDK targets Vite + React on Cloudflare Workers and doesn't support React Native.

## 5. App features

| Pri | Feature | Description |
|---|---|---|
| P0 | Onboarding | Phone number (ties the user to their iMessage identity), name, home block, push permission |
| P0 | Map | Trees near the user; pins colored **thirsty / ok / no sensor**; seeded from the 2015 NYC Street Tree Census around Columbia |
| P0 | Tree profile | Name, species, persona blurb, live moisture gauge, 7-day chart, last watered, caretakers, **Text this tree** (opens iMessage to the agent's line) |
| P0 | Log watering | One tap + gallons; a sensor rise auto-confirms it |
| P1 | Adopt & name | Claim a tree and name it; Grok generates its personality |
| P1 | Photo proof | Optional photo; Gemini checks it shows watering |
| P1 | Hear your tree | ElevenLabs voice clip in the tree's voice on the profile |
| P1 | Block leaderboard | Gallons and streaks per neighbor (people ranked for contributing, not trees) |
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
| POST | `/users` | `{phone, name, blockId, pushToken?}` | `User` | App |
| POST | `/trees/:id/adopt` | `{userId, name}` | `Tree` with persona | App |
| POST | `/trees/:id/waterings` | `{userId, gallons, photoBase64?}` | `Watering` with `verified` | App, agent |
| GET | `/blocks/:id/leaderboard` | — | `[{userId, name, gallons, streak}]` | App, web map |
| GET | `/trees/:id/voice` | `?type=thirsty\|thanks` | `audio/mpeg` (cached) | App, agent |

**Outbound to the agent** (share with Agent teammate by **4 PM Sat**):
```json
POST {AGENT_URL}/events
{
  "type": "thirsty" | "thanks",
  "treeId": "...",
  "treeName": "Gus",
  "persona": "grumpy retired jazz musician oak",
  "moisturePct": 18,
  "recipients": ["+12125550123"],
  "voiceUrl": "https://api.../trees/:id/voice?type=thirsty"
}
```

## 7. Data model

**MongoDB**
- `users` `{_id, phone, name, blockId, pushToken, createdAt}`
- `trees` `{_id, censusId, species, lat, lng, address, blockId, name, persona, sensorId, adopterIds[], thirstThreshold, status, lastAlertAt}`
- `waterings` `{_id, treeId, userId, gallons, photoUrl, verified, source: "app" | "imessage", at}`
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
- **Clears** when a watering is logged or moisture rises back above threshold; a sensor rise after a watering sends a `thanks` event.

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
- [ ] **A** "Text this tree" button opens `sms:`/iMessage to the agent's number with a prefilled message.
- [ ] **AG** Agent replies in character when texted.

### Phase 3: Integrations (→ 6 AM Sun)
- [ ] **A** Thirst job (per §8) → `POST {AGENT_URL}/events` + Expo push fallback. *Done when:* a dry-out triggers exactly one alert per cooldown.
- [ ] **A** Adopt flow; Grok generates persona + name suggestions. *Done when:* a new tree has a persona within 5 s.
- [ ] **A** Gemini photo check on watering. *Done when:* a photo of a bucket at a tree returns `verified: true`, a random photo returns `false`.
- [ ] **A** ElevenLabs voice endpoint with caching; play button on profile.
- [ ] **A** Block leaderboard screen.
- [ ] **A** Enable CORS for read endpoints; hand the base URL to the web map owner.
- [ ] **AG** Handle `thirsty`/`thanks` events and send them to the neighborhood group chat; forward "I watered it" replies to `POST /waterings`.
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
3. The block group chat gets a text from Gus, in character; play his voice clip.
4. A judge taps **I watered it** (or replies in iMessage), and waters the pot.
5. Moisture rises on the live chart; Gus texts a thank-you; the judge climbs the leaderboard.
6. Close on the web map: "every block, every tree, every neighbor."

## 11. Risks & open questions

| Risk | Mitigation |
|---|---|
| Photon Spectrum may not support **proactive** outbound iMessage by phone number | AG verifies first thing. Fallback: users text the tree first to opt in; the agent replies in that thread afterward |
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

# app/.env
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_AGENT_PHONE=
```
