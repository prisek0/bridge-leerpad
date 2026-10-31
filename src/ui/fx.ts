// Geluidjes en confetti, zonder bestanden.

let ctx: AudioContext | null = null

function tone(freqs: number[], dur = 0.12, type: OscillatorType = 'sine', gap = 0.09) {
  try {
    ctx ??= new AudioContext()
    const t0 = ctx.currentTime
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = type
      o.frequency.value = f
      const t = t0 + i * gap
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(ctx!.destination)
      o.start(t)
      o.stop(t + dur + 0.02)
    })
  } catch { /* geen audio */ }
}

export const sounds = {
  right: () => tone([660, 880], 0.14),
  wrong: () => tone([220, 180], 0.18, 'triangle', 0.12),
  done: () => tone([523, 659, 784, 1047], 0.18, 'sine', 0.1),
}

export function buzz(ms: number) {
  try { navigator.vibrate?.(ms) } catch { /* niet ondersteund */ }
}

export function confetti() {
  const c = document.createElement('canvas')
  c.className = 'confetti'
  c.width = innerWidth * devicePixelRatio
  c.height = innerHeight * devicePixelRatio
  document.body.appendChild(c)
  const g = c.getContext('2d')!
  g.scale(devicePixelRatio, devicePixelRatio)
  const colors = ['#c8963e', '#e2c27a', '#c4343b', '#1f5c43', '#f6f0e1', '#1d2420']
  const bits = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2, y: innerHeight / 3,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
  }))
  let frame = 0
  const step = () => {
    g.clearRect(0, 0, innerWidth, innerHeight)
    for (const b of bits) {
      b.vy += 0.35; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx *= 0.99
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.color
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore()
    }
    if (++frame < 140) requestAnimationFrame(step)
    else c.remove()
  }
  step()
}
