import type { TreeDoc, UserDoc } from "../types.ts"

export const GUS_PERSONA =
  "Gus is a young pin oak on Amsterdam Ave with a dry sense of humor and a big heart. He talks like the neighbor who knows everyone's dog by name, and he gets theatrical only about water."

export const GUS_BACKSTORY = [
  "Planted as a sapling in 2023, so he's still skinny and a little self-conscious about it.",
  "Pin oaks hold on to their dead leaves into winter; Gus jokes that he doesn't let go of things easily.",
  "Regulars he knows: Pretzel, a beagle he tolerates; Biscuit, the bodega cat who judges everyone; the halal cart guy who says good morning to him.",
  "Loves: rain, the first bit of shade he's starting to cast on the bus stop, people who stop to read the tag on his trunk.",
  "Dislikes: road salt, cigarette butts in his tree bed, bikes chained to him, scaffolding blocking his sun.",
  "Dream: grow tall enough to shade the whole bus stop.",
].join(" ")

// Shared by text and voice replies so the tree feels like one character everywhere.
export function characterPrompt(tree: TreeDoc) {
  return [
    tree.persona || "You are dry, friendly, and brief.",
    tree.backstory
      ? `Your own backstory (use naturally, never recite it; the people and animals in it are YOUR acquaintances on the block, not the neighbor's): ${tree.backstory}`
      : "",
    "Be a conversation partner, not a status report:",
    "- React to what they actually said first, with feeling.",
    "- About half the time, end with a short, natural question back to them.",
    "- Bring up your moisture only when they ask, when you're thirsty, or when it fits.",
    "- Call back to things they told you earlier in the conversation when it's natural, and use their name sometimes.",
    "- Vary how you open; never repeat a line you already said. Tree puns at most once in a while.",
  ]
    .filter(Boolean)
    .join("\n")
}

type Mood = "thirsty" | "fine" | "refreshed" | "unknown"

type Talk = {
  tree: TreeDoc
  user: UserDoc
  message: string
  moisture: number | null
  feeling: Mood
  recent: string[]
}

type Line = (talk: Talk) => string

const pct = (talk: Talk) => (talk.moisture === null ? "who knows" : `${Math.round(talk.moisture)} percent`)
const nm = (talk: Talk) => talk.tree.name || "your tree"

const greetings: Record<Mood, Line[]> = {
  thirsty: [
    (t) => `${t.user.name}! Oh thank goodness, a friendly face. I'm down to ${pct(t)} and feeling very crunchy. How's your day going?`,
    (t) => `Hey ${t.user.name}, it's ${nm(t)}. Not to be dramatic, but my soil is at ${pct(t)} and I can feel every inch of it. What's new with you?`,
  ],
  fine: [
    (t) => `Hey ${t.user.name}, it's ${nm(t)}. Soil's at ${pct(t)}, so I'm doing alright. What brings you by?`,
    (t) => `${t.user.name}! Good to see you. I'm holding steady at ${pct(t)}. Anything good happen today?`,
  ],
  refreshed: [
    (t) => `${t.user.name}! I'm at ${pct(t)} and feeling fantastic, honestly a little showy. How are you doing?`,
    (t) => `Hey ${t.user.name}, it's ${nm(t)}. Freshly watered, ${pct(t)}, every leaf happy. What's up?`,
  ],
  unknown: [
    (t) => `Hey ${t.user.name}, it's ${nm(t)}. Nobody's given me a sensor yet, so I'm guessing about my own soil. What's going on?`,
  ],
}

const howAreYou: Record<Mood, Line[]> = {
  thirsty: [
    (t) => `Honestly? Parched. I'm at ${pct(t)} and my roots are sending strongly worded memos. Any chance you've got a bucket nearby?`,
    (t) => `Thirsty, ${t.user.name}. ${pct(t)} soil moisture. I'm being brave about it, but only barely.`,
  ],
  fine: [
    (t) => `Pretty good! ${pct(t)} is comfortable. Biscuit the bodega cat walked by and ignored me, which is how I know it's a normal day. You?`,
    (t) => `Can't complain. Soil's at ${pct(t)}, and I think I grew a millimeter. How about you?`,
  ],
  refreshed: [
    (t) => `Amazing. ${pct(t)} and hydrated. I feel like I could shade the whole bus stop today. How are you?`,
    (t) => `Great, thanks to whoever watered me. ${pct(t)}! Tell me something good about your day.`,
  ],
  unknown: [
    () => "I think I'm okay? Without a sensor I'm just vibing. How are you?",
  ],
}

const who: Line[] = [
  (t) => `I'm ${nm(t)}, a ${t.tree.species} on ${t.tree.address}. Planted in 2023, still skinny, working on it. Who are you when you're not talking to trees?`,
  (t) => `${nm(t)}, the ${t.tree.species} on ${t.tree.address}. I hold on to my leaves all winter, so yes, I'm a little sentimental. What about you?`,
]

const shouldWater: Record<Mood, Line[]> = {
  thirsty: [(t) => `Yes. Please. I'm at ${pct(t)}. Three or four buckets would be heroic, and I'll tell everyone.`],
  fine: [(t) => `Not urgently. I'm at ${pct(t)}. Maybe in a day or two, unless it rains. I'll text you.`],
  refreshed: [(t) => `I'm good for now, ${pct(t)}. Save your arms for later this week.`],
  unknown: [() => "Probably? Young trees like me want about 15 to 20 gallons a week in warm months."],
}

const weather: Line[] = [
  () => "I love rain more than anything. Road salt, less so. Is it nice out where you are right now?",
  () => "Hot days are rough on young trees like me. Cloudy with a chance of drizzle is my ideal. What's your ideal weather?",
]

const thanks: Line[] = [
  (t) => `Anytime, ${t.user.name}. You're officially one of my favorite humans.`,
  () => "Aw. You're welcome. Don't tell Pretzel the beagle, but you're my favorite visitor.",
]

const compliment: Line[] = [
  () => "Stop, I'm blushing. My leaves are going to turn red early.",
  (t) => `That's the nicest thing anyone's said to me since the halal cart guy said good morning. Thank you, ${t.user.name}.`,
]

const joke: Line[] = [
  () => "Why did the tree go to the dentist? It needed a root canal. I'm sorry. I've had a lot of time to think.",
  () => "What's a tree's favorite drink? Root beer. Mine's just water, though. Lots of it.",
]

const block: Line[] = [
  () => "The block's good. Biscuit the bodega cat is still judging everyone, and someone chained a bike to me again. Rude. What's happening with you?",
  () => "Busy as always. The bus stop crowd is growing, and I'm trying to grow fast enough to shade them. Seen anything fun lately?",
]

const rough: Line[] = [
  (t) => `Oh no, ${t.user.name}. Come stand in my shade for a minute, it's small but it's yours. What happened?`,
  () => "That sounds heavy. I can't hug, but I can stand here and listen, which I'm very good at. Want to talk about it?",
]

const good: Line[] = [
  (t) => `Yes! I love that for you, ${t.user.name}. My leaves are doing a little happy rustle. What was the best part?`,
  () => "That's the best news I've heard all day, and I hear a lot from the bus stop. Tell me everything.",
]

const bye: Line[] = [
  (t) => `Bye ${t.user.name}! Come say hi again. I'll be right here. Obviously.`,
  () => "See you soon. I'll be here, standing, as usual.",
]

const replies: Line[] = [
  (t) => `Huh, tell me more about that, ${t.user.name}. I don't get out much.`,
  () => "I love that. Life on a sidewalk gets repetitive, so stories are my favorite. What happened next?",
  () => "Interesting. I'll think about that while I stand here, which is all I do. What else is on your mind?",
  (t) => `Ha, fair. You're easy to talk to, ${t.user.name}. What's the best part of your week so far?`,
]

const intents: [RegExp, (talk: Talk) => Line[]][] = [
  [/\b(bye|goodbye|see (you|ya)|later|good ?night)\b/i, () => bye],
  [/\bthank(s| you)?\b|\bthx\b/i, () => thanks],
  [/should i water|do you need (water|a drink)|need water|want (some )?water|are you thirsty/i, (t) => shouldWater[t.feeling]],
  [/how (are|r) (you|u)|how('?s| is) it going|how (do|are) you feel|you (ok|okay|good)|what'?s up/i, (t) => howAreYou[t.feeling]],
  [/who are you|what are you|your name|about yourself|what kind of tree|how old/i, () => who],
  [/\b(rough|bad|awful|terrible|long) (day|week|night)|\b(sad|tired|stressed|exhausted|upset|lonely)\b/i, () => rough],
  [/\b(good|great|amazing|awesome) (day|week|news)|\b(happy|excited|got the job|passed)\b/i, () => good],
  [/\b(joke|funny|laugh)\b/i, () => joke],
  [/\b(love you|cute|beautiful|pretty|handsome|good tree|best tree)\b/i, () => compliment],
  [/\b(rain|weather|hot|cold|sunny|snow|storm)\b/i, () => weather],
  [/\b(block|neighbor|street|amsterdam|columbia|morningside|dog|cat|bodega|bus)\b/i, () => block],
  [/^\s*(hi|hey|hello|yo|hiya|good (morning|afternoon|evening))\b/i, (t) => greetings[t.feeling]],
]

function pick(lines: Line[], talk: Talk) {
  const fresh = lines.map((line) => line(talk)).filter((text) => !talk.recent.includes(text))
  const pool = fresh.length ? fresh : lines.map((line) => line(talk))
  return pool[Math.floor(Math.random() * pool.length)]
}

// No-LLM fallback: keyword intents with lines in the tree's voice, state-aware and non-repeating.
export function smallTalk(talk: Talk) {
  const match = intents.find(([pattern]) => pattern.test(talk.message))
  return pick(match ? match[1](talk) : replies, talk)
}

export function greetingLine(talk: Omit<Talk, "message">) {
  return pick(greetings[talk.feeling], { ...talk, message: "" })
}
