// 生成 tabBar 图标：81×81 PNG × 8 张（香烟/柱状图/烟盒/齿轮 × 灰/金）
// 零依赖，仅用 Node 内置 zlib 手写 PNG 编码；3x 超采样抗锯齿
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 81
const OUT_DIR = path.join(__dirname, '..', 'images', 'tab')

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0 // filter: none
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- 画布 ----------
class Img {
  constructor(size) {
    this.size = size
    this.data = Buffer.alloc(size * size * 4, 0)
  }
  blend(x, y, r, g, b, a) {
    const i = (y * this.size + x) * 4
    const sa = a / 255
    const da = this.data[i + 3] / 255
    const oa = sa + da * (1 - sa)
    if (oa <= 0) return
    this.data[i] = Math.round((r * sa + this.data[i] * da * (1 - sa)) / oa)
    this.data[i + 1] = Math.round((g * sa + this.data[i + 1] * da * (1 - sa)) / oa)
    this.data[i + 2] = Math.round((b * sa + this.data[i + 2] * da * (1 - sa)) / oa)
    this.data[i + 3] = Math.round(oa * 255)
  }
}

// pred(x, y) 连续坐标谓词；ss×ss 子采样求覆盖率
function fill(img, pred, color, alpha = 255) {
  const ss = 3
  for (let y = 0; y < img.size; y++) {
    for (let x = 0; x < img.size; x++) {
      let hit = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          if (pred(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss)) hit++
        }
      }
      if (hit > 0) img.blend(x, y, color[0], color[1], color[2], Math.round(alpha * hit / (ss * ss)))
    }
  }
}

const inRRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const nx = Math.max(x0 + r, Math.min(x, x1 - r))
  const ny = Math.max(y0 + r, Math.min(y, y1 - r))
  return (x - nx) * (x - nx) + (y - ny) * (y - ny) <= r * r
}
const inCircle = (x, y, cx, cy, r) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r

// ---------- 图形定义 ----------
const ICONS = {
  // 香烟：横置烟支 + 滤嘴分界 + 火头 + 三缕青烟
  smoke(img, c) {
    fill(img, (x, y) => inRRect(x, y, 9, 34.5, 64, 46.5, 4.5), c, 255)
    fill(img, (x, y) => inRRect(x, y, 9, 34.5, 26, 46.5, 4.5), c, 120) // 滤嘴段半透明
    fill(img, (x, y) => x >= 24.5 && x <= 26.5 && y >= 35 && y <= 46, c, 170) // 分界线
    fill(img, (x, y) => inRRect(x, y, 63.5, 35.5, 70, 45.5, 2.5), c, 210) // 火头
    fill(img, (x, y) => inCircle(x, y, 44, 26, 2.6), c, 110)
    fill(img, (x, y) => inCircle(x, y, 50, 20, 2.1), c, 90)
    fill(img, (x, y) => inCircle(x, y, 55.5, 14.5, 1.6), c, 70)
  },
  // 柱状图：三根柱
  stats(img, c) {
    fill(img, (x, y) => inRRect(x, y, 13, 46, 26, 68, 3), c, 255)
    fill(img, (x, y) => inRRect(x, y, 31.5, 31.5, 44.5, 68, 3), c, 255)
    fill(img, (x, y) => inRRect(x, y, 50, 18.5, 63, 68, 3), c, 255)
    fill(img, (x, y) => x >= 9 && x <= 67 && y >= 68.5 && y <= 71, c, 150) // 基线
  },
  // 烟盒：竖盒 + 盖线 + 中央徽记
  box(img, c) {
    fill(img, (x, y) => inRRect(x, y, 23.5, 12, 57.5, 69, 5), c, 255)
    fill(img, (x, y) => x >= 25.5 && x <= 55.5 && y >= 24 && y <= 26.5, c, 140) // 盖线
    fill(img, (x, y) => inCircle(x, y, 40.5, 46, 6.5), c, 140) // 徽记
    fill(img, (x, y) => inCircle(x, y, 40.5, 46, 3), c, 220)
  },
  // 齿轮：8 齿 + 中心孔
  gear(img, c) {
    const pred = (x, y) => {
      const dx = x - 40.5
      const dy = y - 40.5
      const d = Math.hypot(dx, dy)
      if (d < 9) return false
      if (d >= 15.5 && d <= 22.5) return true
      if (d > 22.5 && d <= 28) {
        let ang = (Math.atan2(dy, dx) * 180) / Math.PI
        ang = ((ang % 45) + 45) % 45
        return Math.min(ang, 45 - ang) <= 11.5
      }
      return false
    }
    fill(img, pred, c, 255)
  }
}

const COLORS = {
  normal: [138, 143, 153], // #8a8f99
  active: [200, 160, 99] // #c8a063
}

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const [name, draw] of Object.entries(ICONS)) {
  for (const [suffix, color] of Object.entries(COLORS)) {
    const img = new Img(SIZE)
    draw(img, color)
    const file = suffix === 'normal' ? `${name}.png` : `${name}-active.png`
    fs.writeFileSync(path.join(OUT_DIR, file), encodePng(SIZE, SIZE, img.data))
    console.log('ok', file)
  }
}
console.log('done →', OUT_DIR)
