// 生成抽烟音效 WAV（16bit PCM 单声道 22050Hz，零依赖）
// lighter.wav：咔哒 + 燃气 whoosh；inhale.wav：吸阻沙声
const fs = require('fs')
const path = require('path')
const SR = 22050
const OUT = path.join(__dirname, '..', 'audio')

function writeWav(name, samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  fs.writeFileSync(path.join(OUT, name), buf)
  console.log('ok', name, (buf.length / 1024).toFixed(1) + 'KB')
}

// 一阶低通（截止随时间变化）
function lowpass(samples, cutoffFn) {
  let y = 0
  return samples.map((x, i) => {
    const fc = cutoffFn(i / samples.length)
    const a = 1 - Math.exp(-2 * Math.PI * fc / SR)
    y += a * (x - y)
    return y
  })
}

const noise = n => Array.from({ length: n }, () => Math.random() * 2 - 1)

// ---------- lighter.wav（约 0.42s）----------
{
  const dur = 0.42
  const n = Math.floor(SR * dur)
  const raw = noise(n)
  const out = new Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    let v = 0
    if (t < 0.028) {
      // 打火机咔哒：高幅噪声指数衰减
      v = raw[i] * Math.exp(-t / 0.008) * 0.55
    } else {
      // 燃气 whoosh：低通噪声（2500→900Hz 扫频），鼓包包络
      const p = (t - 0.028) / (dur - 0.028)
      const a = 1 - Math.exp((-2 * Math.PI * (2500 - 1600 * p)) / SR)
      lp += a * (raw[i] - lp)
      const env = Math.sin(Math.PI * Math.min(1, p)) ** 1.5
      v = lp * env * 0.5
    }
    out[i] = v
  }
  writeWav('lighter.wav', out)
}

// ---------- inhale.wav（约 1.7s）----------
{
  const dur = 1.7
  const n = Math.floor(SR * dur)
  const raw = lowpass(noise(n), p => 750 + 500 * Math.sin(Math.PI * p)) // 截止缓起缓落
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    // 包络：0.15s 起吹、平台微颤、尾部 0.45s 收
    let env
    if (t < 0.15) env = t / 0.15
    else if (t < dur - 0.45) env = 1 - 0.15 * ((t - 0.15) / (dur - 0.6))
    else env = Math.max(0, (dur - t) / 0.45) * 0.85
    env *= 1 + 0.08 * Math.sin(2 * Math.PI * 5.5 * t) // 轻微气息颤动
    out[i] = raw[i] * env * 0.42
  }
  writeWav('inhale.wav', out)
}
