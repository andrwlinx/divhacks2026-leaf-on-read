export const languages = ["en", "es", "zh", "bn", "ru", "ht", "ko", "ar"] as const
export type Language = (typeof languages)[number]

type Line = (name: string, pct: number, who?: string) => string

const thirsty: Record<Language, Line> = {
  en: (name, pct) => `${name} here. Soil's at ${pct}%. I need a bucket.`,
  es: (name, pct) => `Soy ${name}. La tierra está al ${pct}%. Necesito agua.`,
  zh: (name, pct) => `我是${name}。土壤湿度 ${pct}%。我渴了。`,
  bn: (name, pct) => `আমি ${name}। মাটি ${pct}%। এক বালতি জল দাও।`,
  ru: (name, pct) => `Это ${name}. Влажность ${pct}%. Меня нужно полить.`,
  ht: (name, pct) => `Se ${name}. Tè a ${pct}%. Mwen swaf.`,
  ko: (name, pct) => `나 ${name}야. 흙이 ${pct}%야. 물 한 통만.`,
  ar: (name, pct) => `أنا ${name}. رطوبة التربة ${pct}٪. أحتاج ماء.`,
}

const thanks: Record<Language, Line> = {
  en: (name) => `${name} here. I can feel the water. Thank you.`,
  es: (name) => `Soy ${name}. Siento el agua. Gracias.`,
  zh: (name) => `我是${name}。水到了。谢谢你。`,
  bn: (name) => `আমি ${name}। জল পেয়েছি। ধন্যবাদ।`,
  ru: (name) => `Это ${name}. Вода дошла. Спасибо.`,
  ht: (name) => `Se ${name}. Mwen santi dlo a. Mèsi.`,
  ko: (name) => `나 ${name}야. 물 느껴져. 고마워.`,
  ar: (name) => `أنا ${name}. وصل الماء. شكراً.`,
}

const rain: Record<Language, Line> = {
  en: (name) => `${name} here. Rain's coming, so you're off the hook.`,
  es: (name) => `Soy ${name}. Va a llover, así que hoy no hace falta.`,
  zh: (name) => `我是${name}。要下雨了，你先歇着。`,
  bn: (name) => `আমি ${name}। বৃষ্টি আসছে, আজ আর দরকার নেই।`,
  ru: (name) => `Это ${name}. Скоро дождь, сегодня можно не поливать.`,
  ht: (name) => `Se ${name}. Lapli pral tonbe, ou pap bezwen wouze m jodi a.`,
  ko: (name) => `나 ${name}야. 비 온대. 오늘은 쉬어도 돼.`,
  ar: (name) => `أنا ${name}. المطر قادم، لا حاجة للسقي اليوم.`,
}

const claimed: Record<Language, Line> = {
  en: (_name, _pct, who) => `${who} is on it.`,
  es: (_name, _pct, who) => `${who} ya va para allá.`,
  zh: (_name, _pct, who) => `${who}已经去了。`,
  bn: (_name, _pct, who) => `${who} যাচ্ছে।`,
  ru: (_name, _pct, who) => `${who} уже идёт.`,
  ht: (_name, _pct, who) => `${who} pral okipe sa.`,
  ko: (_name, _pct, who) => `${who}가 가는 중이야.`,
  ar: (_name, _pct, who) => `${who} في الطريق.`,
}

const expired: Record<Language, Line> = {
  en: (name) => `${name} here. Nobody made it. I'm still thirsty.`,
  es: (name) => `Soy ${name}. Nadie llegó. Sigo sediento.`,
  zh: (name) => `我是${name}。还是没人来。我还是渴。`,
  bn: (name) => `আমি ${name}। কেউ আসেনি। এখনও পিপাসা।`,
  ru: (name) => `Это ${name}. Никто не дошёл. Я всё ещё хочу пить.`,
  ht: (name) => `Se ${name}. Pèsonn pa vini. Mwen toujou swaf.`,
  ko: (name) => `나 ${name}야. 아무도 안 왔어. 아직 목말라.`,
  ar: (name) => `أنا ${name}. لم يأتِ أحد. ما زلت عطشان.`,
}

const books = { thirsty, thanks, rain_skip: rain, claimed, claim_expired: expired }

export function alertText(
  type: keyof typeof books,
  language: string,
  treeName: string,
  moisturePct: number,
  who?: string,
) {
  const lang = (language in thirsty ? language : "en") as Language
  return books[type][lang](treeName, moisturePct, who)
}
