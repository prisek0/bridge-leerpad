// Voortgang, XP en reeks; lokaal opgeslagen in de browser.

import { useSyncExternalStore } from 'react'
import type { Exercise } from '../content/types'
import type { ModeId, Setup } from '../game/modes'

/** Een spel dat beter kon, om op een latere dag nog eens te spelen. */
export interface Replay {
  id: string
  mode: ModeId
  setup: Setup
  /** Waarom het beter kon. */
  reason: string
  /** Dag waarop het (laatst) misging; vanaf de dag erna kun je het opnieuw spelen. */
  day: string
}

export interface Progress {
  /** Aantal keer dat een les is afgerond. */
  completed: Record<string, number>
  /** Lessen die je hebt overgeslagen door verder te springen; ze tellen als gedaan. */
  skipped: string[]
  xp: number
  streak: number
  /** Laatste dag (YYYY-MM-DD) waarop het dagdoel gehaald is. */
  lastStreakDay: string | null
  today: { day: string; xp: number }
  dailyGoal: number
  stats: Record<string, { right: number; wrong: number }>
  /** Recente fouten om te herhalen. */
  mistakes: Exercise[]
  sound: boolean
  /** Spelen: ook stof die je nog niet gehad hebt. */
  playAll: boolean
  /** De coach geeft tips tijdens het spelen. */
  coach: boolean
  replays: Replay[]
}

const KEY = 'bridge-leerpad-v1'

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d) }

const initial = (): Progress => ({
  completed: {}, skipped: [], xp: 0, streak: 0, lastStreakDay: null, today: { day: dayKey(), xp: 0 },
  dailyGoal: 30, stats: {}, mistakes: [], sound: true, playAll: false, coach: true, replays: [],
})

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initial(), ...JSON.parse(raw) }
  } catch { /* privémodus of geblokkeerde opslag */ }
  return initial()
}

let state = load()
const listeners = new Set<() => void>()

function save(next: Progress) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* negeren */ }
  listeners.forEach((l) => l())
}

/** Reeks loopt door als het dagdoel gisteren of vandaag gehaald is. */
export function currentStreak(p: Progress): number {
  return p.lastStreakDay === dayKey() || p.lastStreakDay === yesterdayKey() ? p.streak : 0
}

export function todayXp(p: Progress): number {
  return p.today.day === dayKey() ? p.today.xp : 0
}

export function useProgress(): Progress {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
}

export function recordAnswer(ex: Exercise, right: boolean) {
  const skill = ex.skill ?? 'overig'
  const s = state.stats[skill] ?? { right: 0, wrong: 0 }
  let mistakes = state.mistakes
  if (!right) mistakes = [ex, ...mistakes.filter((m) => m.prompt !== ex.prompt || m.kind === 'bid')].slice(0, 40)
  save({ ...state, stats: { ...state.stats, [skill]: right ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 } }, mistakes })
}

/** Alleen de statistiek bijwerken (voor fouten tijdens het spelen die geen oefening zijn). */
export function recordSkill(skill: string, right: boolean) {
  const s = state.stats[skill] ?? { right: 0, wrong: 0 }
  save({ ...state, stats: { ...state.stats, [skill]: right ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 } } })
}

export function removeMistake(ex: Exercise) {
  save({ ...state, mistakes: state.mistakes.filter((m) => m !== ex && JSON.stringify(m) !== JSON.stringify(ex)) })
}

const sameDeal = (a: Setup, b: Setup) => JSON.stringify(a.deal) === JSON.stringify(b.deal)

/** Bewaar een spel dat beter kon voor een herkansing. */
export function saveReplay(mode: ModeId, setup: Setup, reason: string) {
  const r: Replay = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, mode, setup, reason, day: dayKey() }
  save({ ...state, replays: [...state.replays.filter((x) => !sameDeal(x.setup, setup)), r].slice(-20) })
}

/** Na een herkansing: gelukt is weg, anders komt hij een andere dag terug. */
export function replayDone(id: string, ok: boolean) {
  const replays = ok ? state.replays.filter((r) => r.id !== id) : state.replays.map((r) => (r.id === id ? { ...r, day: dayKey() } : r))
  save({ ...state, replays })
}

/** Herkansingen van eerdere dagen: met verse ogen, zonder dat je de kaarten nog weet. */
export const readyReplays = (p: Progress) => p.replays.filter((r) => r.day < dayKey())

/** Rond een les af en geef terug of de reeks vandaag omhoog ging. */
export function finishLesson(lessonId: string | null, xp: number): { streakUp: boolean } {
  const day = dayKey()
  const todayXpNow = (state.today.day === day ? state.today.xp : 0) + xp
  let { streak, lastStreakDay } = state
  let streakUp = false
  if (todayXpNow >= state.dailyGoal && lastStreakDay !== day) {
    streak = lastStreakDay === yesterdayKey() ? streak + 1 : 1
    lastStreakDay = day
    streakUp = true
  }
  // Een overgeslagen les die je toch speelt, telt vanaf nu als één keer gespeeld.
  const wasSkipped = !!lessonId && state.skipped.includes(lessonId)
  const completed = lessonId ? { ...state.completed, [lessonId]: wasSkipped ? 1 : (state.completed[lessonId] ?? 0) + 1 } : state.completed
  const skipped = wasSkipped ? state.skipped.filter((id) => id !== lessonId) : state.skipped
  save({ ...state, completed, skipped, xp: state.xp + xp, streak, lastStreakDay, today: { day, xp: todayXpNow } })
  return { streakUp }
}

/** Spring door naar een les: de lessen ervoor tellen als gedaan. */
export function skipLessons(ids: string[]) {
  const todo = ids.filter((id) => !state.completed[id])
  const completed = { ...state.completed }
  for (const id of todo) completed[id] = 1
  save({ ...state, completed, skipped: [...state.skipped, ...todo] })
}

// ------------------------------------------------------- overzetten

/** Wat meegaat naar een ander apparaat. Fouten en herkansingen niet: die maken de link te lang. */
const SHARED = ['completed', 'skipped', 'xp', 'streak', 'lastStreakDay', 'today', 'dailyGoal', 'stats', 'sound', 'playAll', 'coach'] as const
type Shared = Pick<Progress, (typeof SHARED)[number]>
export interface Transfer { v: 1; progress: Shared; theory: string[] }

/** Dezelfde sleutel als in App: welke uitleg je al gezien hebt. */
const THEORY_KEY = 'bridge-theory'
const HASH = '#voortgang='

const toCode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromCode = (code: string) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

/** Een link waarmee je je voortgang op een ander apparaat opent. */
export function transferLink(): string {
  const progress = Object.fromEntries(SHARED.map((k) => [k, state[k]])) as Shared
  let theory: string[] = []
  try { theory = JSON.parse(localStorage.getItem(THEORY_KEY) ?? '[]') } catch { /* negeren */ }
  const data: Transfer = { v: 1, progress, theory }
  return `${location.origin}${location.pathname}${HASH}${toCode(JSON.stringify(data))}`
}

/** Lees een link (of alleen het stuk erachter); null als het geen geldige voortgang is. */
export function readTransfer(text: string): Transfer | null {
  const t = text.trim()
  const code = t.includes(HASH) ? t.slice(t.indexOf(HASH) + HASH.length) : t
  try {
    const data = JSON.parse(fromCode(code)) as Transfer
    if (data?.v !== 1 || typeof data.progress?.xp !== 'number' || typeof data.progress.completed !== 'object') return null
    return data
  } catch {
    return null
  }
}

/** Neem voortgang over; fouten en herkansingen op dit apparaat blijven staan. */
export function importTransfer(data: Transfer) {
  const progress = Object.fromEntries(SHARED.filter((k) => k in data.progress).map((k) => [k, data.progress[k]]))
  try { localStorage.setItem(THEORY_KEY, JSON.stringify(data.theory ?? [])) } catch { /* negeren */ }
  save({ ...state, ...progress })
}

export function setSetting<K extends 'sound' | 'dailyGoal' | 'playAll' | 'coach'>(key: K, value: Progress[K]) {
  save({ ...state, [key]: value })
}

export function resetProgress() {
  save(initial())
}
