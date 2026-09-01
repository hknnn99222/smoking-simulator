// 抽烟会话页：Canvas 香烟 + 按住吸入/松开吐烟 + 结算
const calc = require('../../utils/calc')
const skins = require('../../utils/skins')

const BURN_MS = 12000 // 累计按住 12 秒烧完一根

// 精灵图模块级缓存：同皮肤重复进入页面不重复烘焙
const spriteCache = {}

Page({
  data: {
    skin: null,
    showHint: true,
    puffs: 0,
    finished: false,
    showSettle: false,
    settle: null
  },

  onLoad() {
    const skinStore = wx.getStorageSync('skins') || {}
    const skin = skins.getSkin(skinStore.currentId)
    this.skin = skin
    this.setData({ skin })
    // 场景状态
    this.burn = 0
    this.inhaling = false
    this.started = false
    this.added = false
    this.particles = []
    this.wispTimer = 0
  },

  onReady() {
    const query = this.createSelectorQuery()
    query.select('#cig').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0]) return
      const { node, width, height } = res[0]
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const dpr = Math.min(info.pixelRatio || 2, 2) // 动画画布封顶 2，高分屏省一半以上像素
      node.width = width * dpr
      node.height = height * dpr
      const ctx = node.getContext('2d')
      ctx.scale(dpr, dpr)
      this.node = node
      this.ctx = ctx
      this.W = width
      this.H = height
      this.buildSprites()
      // 香烟几何：滤嘴在左，燃烧端在右
      const len = Math.min(width * 0.74, 360)
      this.geo = {
        len,
        x0: (width - len) / 2,
        cy: height * 0.42,
        filterLen: len * 0.26,
        h: 30
      }
      // 等页面转场动画结束（~250ms）再开始绘制：
      // canvas 同层渲染在转场期间可能抢先出现，看起来像画在上一页上
      setTimeout(() => {
        if (!this.rafActive) this.startLoop()
      }, 250)
    })
  },

  onShow() {
    // 结算卡在场时场景已静止，不重启循环
    if (this.node && !this.rafActive && !this.data.showSettle) this.startLoop()
  },

  onHide() {
    this.stopLoop()
  },

  onUnload() {
    this.stopLoop()
  },

  startLoop() {
    if (!this.node || this.rafActive) return
    this.rafActive = true
    this.last = 0
    const loop = now => {
      if (!this.rafActive) return
      this.tick(now)
      this.rafId = this.node.requestAnimationFrame(loop)
    }
    this.rafId = this.node.requestAnimationFrame(loop)
  },

  stopLoop() {
    this.rafActive = false
    if (this.node && this.rafId) this.node.cancelAnimationFrame(this.rafId)
  },

  // ---------- 交互 ----------
  onTouchStart() {
    if (this.data.finished || this.inhaling) return
    this.inhaling = true
    this.puffStart = Date.now()
    if (!this.started) {
      this.started = true
      this.setData({ showHint: false })
    }
    wx.vibrateShort({ type: 'light' })
  },

  onTouchEnd() {
    if (!this.inhaling) return
    this.inhaling = false
    const dur = (Date.now() - this.puffStart) / 1000
    this.setData({ puffs: this.data.puffs + 1 })
    this.spawnExhale(dur)
  },

  onBack() {
    if (this.started && !this.data.finished) {
      wx.showModal({
        title: '这根还没抽完',
        content: '现在退出不计入戒掉哦',
        confirmText: '继续抽',
        cancelText: '退出',
        success: res => {
          if (!res.confirm) wx.navigateBack()
        }
      })
      return
    }
    wx.navigateBack()
  },

  // ---------- 结算 ----------
  finish() {
    this.setData({ finished: true })
    this.inhaling = false
    this.finishAt = this.t || Date.now() // 烟蒂渐隐的起点
    wx.vibrateShort({ type: 'heavy' })
    // 清场：残留烟雾 0.5 秒内散尽，避免盖住随后弹出的结算卡
    for (const p of this.particles) {
      if (p.type === 'exhale' || p.type === 'wisp' || p.type === 'suck') {
        p.maxLife = Math.min(p.maxLife, p.life + 0.5)
      }
    }
    this.spawnAshFall()
    setTimeout(() => this.showSettle(), 900)
    // 烟灰落定后场景静止：停掉渲染循环，结算期间不再空转
    setTimeout(() => {
      if (this.data.finished) this.stopLoop()
    }, 2400)
  },

  showSettle() {
    if (this.added) return
    this.added = true
    const { total } = calc.addAvoided()
    const profile = calc.getProfile()
    const inPack = total % calc.CIGS_PER_PACK
    const ticketEarned = inPack === 0
    this.setData({
      showSettle: true,
      settle: {
        total,
        moneyText: calc.moneyText(calc.moneyOf(1, profile)),
        line: skins.pick(skins.SETTLEMENT_LINES),
        inPack: ticketEarned ? calc.CIGS_PER_PACK : inPack,
        ticketEarned
      }
    })
  },

  onAgain() {
    this.burn = 0
    this.inhaling = false
    this.started = false
    this.added = false
    this.finishAt = 0
    this.particles = []
    this.setData({ showSettle: false, finished: false, puffs: 0, showHint: true })
    this.startLoop()
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goBox() {
    wx.switchTab({ url: '/pages/box/box' })
  },

  // ---------- 粒子 ----------
  spawnExhale(durSec) {
    const count = Math.min(48, Math.round(10 + durSec * 14))
    for (let i = 0; i < count; i++) {
      this.particles.push({
        type: 'exhale',
        x: this.W * 0.5 + (Math.random() - 0.5) * 70,
        y: this.H * 0.66 + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 70,
        vy: -(110 + Math.random() * 130),
        r: 12 + Math.random() * 20,
        life: 0,
        maxLife: 1.7 + Math.random() * 0.9,
        seed: Math.random() * 100
      })
    }
  },

  spawnSuck() {
    const tip = this.tipX()
    this.particles.push({
      type: 'suck',
      x: Math.min(tip + 40 + Math.random() * 70, this.W - 12),
      y: this.geo.cy - 30 - Math.random() * 60,
      vx: 0,
      vy: 0,
      r: 3 + Math.random() * 4,
      life: 0,
      maxLife: 0.55,
      seed: Math.random() * 100
    })
  },

  spawnWisp() {
    const tip = this.tipX()
    this.particles.push({
      type: 'wisp',
      x: tip + 4 + (Math.random() - 0.5) * 6,
      y: this.geo.cy - 14,
      vx: (Math.random() - 0.5) * 14,
      vy: -(28 + Math.random() * 24),
      r: 3 + Math.random() * 3,
      life: 0,
      maxLife: 1.6 + Math.random() * 0.8,
      seed: Math.random() * 100
    })
  },

  spawnAshFall() {
    const tip = this.tipX()
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        type: 'ash',
        x: tip + Math.random() * 16,
        y: this.geo.cy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 36,
        vy: 30 + Math.random() * 50,
        r: 2 + Math.random() * 2.5,
        life: 0,
        maxLife: 1.6 + Math.random() * 0.7,
        seed: Math.random() * 100
      })
    }
  },

  // 诊断：返回自进入页面以来的平均帧率
  getStats() {
    if (!this.frames) return { fps: 0, frames: 0 }
    return { fps: Math.round(this.frames / (this.frameMs / 1000)), frames: this.frames }
  },

  tipX() {
    const g = this.geo
    // 燃烧线随 burn 从最右端（满烟）向滤嘴推进：烟体缩短、烟灰变长
    return g.x0 + g.len - (g.len - g.filterLen) * this.burn
  },

  // ---------- 精灵图：烟雾/火光一次性预渲染，逐帧 drawImage 零分配 ----------
  buildSprites() {
    this.sprites = null
    if (spriteCache[this.skin.id]) {
      this.sprites = spriteCache[this.skin.id]
      return
    }
    try {
      const rgb = this.skin.smoke
      const smokeC = wx.createOffscreenCanvas({ type: '2d', width: 64, height: 64 })
      const sc = smokeC.getContext('2d')
      const g = sc.createRadialGradient(32, 32, 2, 32, 32, 32)
      g.addColorStop(0, 'rgba(' + rgb + ',0.5)')
      g.addColorStop(0.55, 'rgba(' + rgb + ',0.24)')
      g.addColorStop(1, 'rgba(' + rgb + ',0)')
      sc.fillStyle = g
      sc.fillRect(0, 0, 64, 64)

      const glowC = wx.createOffscreenCanvas({ type: '2d', width: 96, height: 96 })
      const gc = glowC.getContext('2d')
      const gg = gc.createRadialGradient(48, 48, 2, 48, 48, 48)
      gg.addColorStop(0, 'rgba(255,150,60,0.55)')
      gg.addColorStop(1, 'rgba(255,150,60,0)')
      gc.fillStyle = gg
      gc.fillRect(0, 0, 96, 96)

      const coreC = wx.createOffscreenCanvas({ type: '2d', width: 48, height: 48 })
      const cc = coreC.getContext('2d')
      const cg = cc.createRadialGradient(24, 24, 1, 24, 24, 24)
      cg.addColorStop(0, 'rgba(255,228,160,1)')
      cg.addColorStop(0.55, 'rgba(255,110,45,0.85)')
      cg.addColorStop(1, 'rgba(255,80,30,0)')
      cc.fillStyle = cg
      cc.fillRect(0, 0, 48, 48)

      this.sprites = { smoke: smokeC, glow: glowC, core: coreC }
      spriteCache[this.skin.id] = this.sprites
    } catch (e) {
      this.sprites = null // 低版本环境兜底：走简单圆形绘制
    }
  },

  // ---------- 主循环 ----------
  tick(now) {
    // 帧率限制：rAF 在部分环境未按垂直同步节流（实测开发者工具会跑到 180fps），
    // 多余回调直接跳过，物理与绘制封顶 ~66fps
    if (this.lastRender && now - this.lastRender < 15) return
    this.lastRender = now

    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016)
    this.last = now
    this.t = now

    // 帧率探针（诊断用）
    this.frames = (this.frames || 0) + 1
    this.frameMs = (this.frameMs || 0) + dt * 1000

    if (this.inhaling) {
      this.burn = Math.min(1, this.burn + dt * (1000 / BURN_MS))
      if (Math.random() < 0.7) this.spawnSuck()
      if (this.burn >= 1) this.finish()
    } else if (!this.data.finished) {
      this.wispTimer += dt
      if (this.wispTimer > 0.32) {
        this.wispTimer = 0
        this.spawnWisp()
      }
    }

    this.updateParticles(dt, now)
    this.render(now)
  },

  updateParticles(dt, now) {
    const tip = this.tipX()
    const list = this.particles
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      p.life += dt
      if (p.life >= p.maxLife) {
        list.splice(i, 1)
        continue
      }
      const lr = p.life / p.maxLife
      if (p.type === 'exhale') {
        p.vy += (-55 - p.vy) * 0.9 * dt
        p.vx += Math.sin(now * 0.003 + p.seed) * 30 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.r += 16 * dt
        p.alpha = Math.sin(Math.PI * lr) * 0.34
      } else if (p.type === 'wisp') {
        p.x += (p.vx + Math.sin(now * 0.004 + p.seed) * 12) * dt
        p.y += p.vy * dt
        p.r += 6 * dt
        p.alpha = (1 - lr) * 0.22
      } else if (p.type === 'suck') {
        const dx = tip + 4 - p.x
        const dy = this.geo.cy - p.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        if (d < 14) {
          list.splice(i, 1)
          continue
        }
        p.x += (dx / d) * 260 * dt
        p.y += (dy / d) * 260 * dt
        p.alpha = (1 - lr) * 0.3
      } else if (p.type === 'ash') {
        p.vy += 480 * dt
        p.vx += Math.sin(now * 0.005 + p.seed) * 20 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.alpha = 1 - lr
      }
    }
    if (list.length > 240) list.splice(0, list.length - 240)
  },

  // ---------- 渲染 ----------
  rr(x, y, w, h, r) {
    const ctx = this.ctx
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  render(now) {
    const ctx = this.ctx
    const g = this.geo
    const cig = this.skin.cig
    const smokeRGB = this.skin.smoke
    const W = this.W
    const H = this.H
    ctx.clearRect(0, 0, W, H)

    const tip = this.tipX()
    const h = g.h
    const top = g.cy - h / 2

    // 烧完 1.2s 后整支烟（含烟蒂）渐隐掐灭；消失后仅剩烟灰/余烟粒子
    let cigAlpha = 1
    if (this.finishAt) {
      cigAlpha = Math.max(0, 1 - (now - this.finishAt - 1200) / 600)
      if (cigAlpha <= 0) {
        this.drawParticles(now, smokeRGB, H)
        return
      }
    }
    ctx.globalAlpha = cigAlpha

    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(W / 2, g.cy + h * 1.2, g.len * 0.42, 7, 0, 0, Math.PI * 2)
    ctx.fill()

    // 滤嘴（左段）
    ctx.fillStyle = cig.filter
    this.rr(g.x0, top, g.filterLen, h, 7)
    ctx.fill()
    // 滤嘴纹路
    ctx.strokeStyle = cig.ring
    ctx.globalAlpha = 0.75
    ctx.lineWidth = 3
    const ringInset = h * 0.14
    ;[0.6, 0.72].forEach(k => {
      const x = g.x0 + g.filterLen * k
      ctx.beginPath()
      ctx.moveTo(x, top + ringInset)
      ctx.lineTo(x, top + h - ringInset)
      ctx.stroke()
    })
    ctx.globalAlpha = cigAlpha

    // 烟体（燃烧缩短）
    if (tip > g.x0 + g.filterLen + 1) {
      ctx.fillStyle = cig.body
      this.rr(g.x0 + g.filterLen - 2, top, tip - g.x0 - g.filterLen + 2, h, 6)
      ctx.fill()
      // 接纸线
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(g.x0 + g.filterLen, top + 3)
      ctx.lineTo(g.x0 + g.filterLen, top + h - 3)
      ctx.stroke()
    }

    // 烟灰（燃烧端右侧）
    const ashLen = 4 + 18 * this.burn
    ctx.fillStyle = cig.ash
    this.rr(tip, top - 2, ashLen, h + 4, 5)
    ctx.fill()
    // 灰上裂纹
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'
    ctx.lineWidth = 1.5
    for (let i = 1; i <= 2; i++) {
      const x = tip + ashLen * (i * 0.32)
      ctx.beginPath()
      ctx.moveTo(x, top + 3)
      ctx.lineTo(x + 3, top + h - 3)
      ctx.stroke()
    }

    // 火光：吸入时爆亮，待机时余烬微光（精灵图绘制，失败兜底现场渐变）
    const glow = this.inhaling
      ? 0.85 + 0.15 * Math.sin(now / 45)
      : 0.32 + 0.08 * Math.sin(now / 240)
    const emberX = tip + 2
    ctx.globalCompositeOperation = 'lighter'
    if (this.sprites) {
      const glowR = 30 + 18 * glow
      ctx.globalAlpha = 0.5 * glow
      ctx.drawImage(this.sprites.glow, emberX - glowR, g.cy - glowR, glowR * 2, glowR * 2)
      const coreR = 6 + 2 * glow
      ctx.globalAlpha = 0.55 + 0.45 * glow
      ctx.drawImage(this.sprites.core, emberX - coreR, g.cy - coreR, coreR * 2, coreR * 2)
      ctx.globalAlpha = cigAlpha
    } else {
      // 外圈光晕
      const gr = ctx.createRadialGradient(emberX, g.cy, 0, emberX, g.cy, 30 + 18 * glow)
      gr.addColorStop(0, 'rgba(255,150,60,' + 0.3 * glow + ')')
      gr.addColorStop(1, 'rgba(255,150,60,0)')
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(emberX, g.cy, 30 + 18 * glow, 0, Math.PI * 2)
      ctx.fill()
      // 炭火核心
      const core = ctx.createRadialGradient(emberX, g.cy, 0, emberX, g.cy, 6)
      core.addColorStop(0, 'rgba(255,228,160,' + (0.55 + 0.45 * glow) + ')')
      core.addColorStop(0.6, 'rgba(255,110,45,' + (0.4 + 0.5 * glow) + ')')
      core.addColorStop(1, 'rgba(255,80,30,0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(emberX, g.cy, 6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    this.drawParticles(now, smokeRGB, H)
  },

  // 粒子：跳过近透明/离屏；烟雾走精灵图，烟灰走实心小圆
  drawParticles(now, smokeRGB, H) {
    const ctx = this.ctx
    const sp = this.sprites
    for (const p of this.particles) {
      if (!p.alpha || p.alpha < 0.02) continue
      if (p.y + p.r < -20 || p.y - p.r > H + 20) continue
      if (p.type === 'ash') {
        ctx.fillStyle = 'rgba(150,148,142,' + p.alpha * 0.9 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      } else if (sp) {
        ctx.globalAlpha = p.alpha
        const d = p.r * 2
        ctx.drawImage(sp.smoke, p.x - p.r, p.y - p.r, d, d)
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = 'rgba(' + smokeRGB + ',' + p.alpha * 0.5 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
})
