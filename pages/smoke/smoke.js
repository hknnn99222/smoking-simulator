// 抽烟会话页：完整状态机
// 待机漂浮(未点燃) → 长按点火(火焰粒子+烟头渐红) → 燃烧待吸(微光+青烟)
// → 按住吸入(火光+震动+吸阻音+烟灰增长) → 松手吐烟(烟雾团)
// → 点按烟身抖灰 → 循环至燃尽 → 烟蒂弹飞 + 结算
const calc = require('../../utils/calc')
const skins = require('../../utils/skins')
const eggs = require('../../utils/eggs')

const BURN_MS = 12000 // 累计按住 12 秒烧完一根
const LIGHT_MS = 1200 // 长按 1.2 秒完成点火
const TAP_MS = 220 // 短于 220ms 视为点按（抖灰）而非吸入

// 精灵图模块级缓存：同皮肤重复进入页面不重复烘焙
const spriteCache = {}

Page({
  data: {
    skin: null,
    phase: 'idle', // idle | lighting | burning | done
    puffs: 0,
    finished: false,
    showSettle: false,
    settle: null
  },

  onLoad() {
    const skinStore = wx.getStorageSync('skins') || {}
    this.skin = skins.getSkin(skinStore.currentId)
    // 场景状态
    this.lit = false // 是否已点燃
    this.lighting = false // 点火中
    this.lightProg = 0 // 烟头红热进度 0~1
    this.burn = 0 // 燃烧进度 0~1
    this.inhaling = false
    this.ashExtra = 0 // 吸入累计的烟灰（抖灰可清）
    this.floatY = 0 // 待机漂浮位移
    this.floatKick = 0 // 抖灰冲击
    this.buttFly = null // 燃尽弹飞的烟蒂
    this.buttFlyAt = 0
    this.particles = []
    this.wispTimer = 0
    this.started = false
    this.added = false
    // 音效
    const profile = calc.getProfile()
    this.soundOn = profile.sound !== false
    this.audio = null
    if (this.soundOn) this.initAudio()
    // 随机彩蛋（低概率）：趣味替身 / 七彩烟
    this.sub = eggs.rollSubstitute()
    this.colorSmoke = !this.sub && eggs.rollRainbow()
    this.eggLabel = this.sub ? '替身 · ' + this.sub.name : this.colorSmoke ? '七彩烟' : ''
    this.heartRing = false
    this.forceHeart = false
    this.forceFrag = false
    this.fragResult = null
    this.rainbowIdx = 0
    this.setData({ skin: this.skin })
  },

  initAudio() {
    try {
      const mk = (src, vol) => {
        const a = wx.createInnerAudioContext()
        a.src = src
        a.volume = vol
        return a
      }
      this.audio = {
        lighter: mk('/audio/lighter.wav', 0.6),
        inhale: mk('/audio/inhale.wav', 0.55)
      }
    } catch (e) {
      this.audio = null
    }
  },

  play(name) {
    if (this.audio && this.audio[name]) {
      try { this.audio[name].play() } catch (e) { /* 音频失败不影响动画 */ }
    }
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
    if (this.audio) {
      for (const k of Object.keys(this.audio)) {
        try { this.audio[k].destroy() } catch (e) { /* 忽略 */ }
      }
    }
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
  onTouchStart(e) {
    if (this.data.finished) return
    const t = (e.touches && e.touches[0]) || {}
    this.touchX = t.x
    this.touchY = t.y
    this.touchAt = Date.now()
    if (!this.lit) {
      if (this.lighting) return
      this.lighting = true
      this.play('lighter')
      wx.vibrateShort({ type: 'light' })
      this.setData({ phase: 'lighting' })
      return
    }
    if (this.inhaling) return
    this.inhaling = true
    this.puffStart = Date.now()
    this.play('inhale')
    wx.vibrateShort({ type: 'light' })
    if (!this.started) this.started = true
  },

  onTouchEnd(e) {
    const dur = (Date.now() - (this.touchAt || Date.now())) / 1000
    if (this.lighting && !this.lit) {
      // 中途松手：点火失败，红热渐退
      this.lighting = false
      this.setData({ phase: 'idle' })
      return
    }
    if (!this.inhaling) return
    this.inhaling = false
    const t = (e.changedTouches && e.changedTouches[0]) || {}
    const x = t.x !== undefined ? t.x : this.touchX
    const y = t.y !== undefined ? t.y : this.touchY
    this.dbg = { dur: +dur.toFixed(3), x, y, touchX: this.touchX, near: this.isNearCig(x, y) }
    if (dur < TAP_MS / 1000 && this.isNearCig(x, y)) {
      this.flickAsh() // 点按烟身：抖灰，不算一口
      return
    }
    this.setData({ puffs: this.data.puffs + 1 })
    this.spawnExhale(dur)
  },

  isNearCig(x, y) {
    if (!this.geo || x === undefined) return false
    const g = this.geo
    return x > g.x0 - 36 && x < g.x0 + g.len + 36 && Math.abs(y - g.cy) < 56
  },

  // 抖灰：烟灰段脱落
  flickAsh() {
    const tip = this.tipX()
    const ashLen = this.currentAshLen()
    for (let i = 0; i < 13; i++) {
      this.particles.push({
        type: 'ash',
        x: tip + Math.random() * (ashLen + 6),
        y: this.geo.cy + this.floatY + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * 60,
        vy: 30 + Math.random() * 70,
        r: 1.5 + Math.random() * 3,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.6,
        seed: Math.random() * 100
      })
    }
    this.ashExtra = 0
    this.floatKick = 9 // 烟身轻弹
    wx.vibrateShort({ type: 'light' })
  },

  onBack() {
    if (this.lit && !this.data.finished) {
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

  // ---------- 燃尽 ----------
  finish() {
    if (!this.lit) return
    this.inhaling = false
    this.lit = false
    this.setData({ finished: true, phase: 'done' })
    wx.vibrateShort({ type: 'heavy' })
    // 清场：残留烟雾 0.5 秒内散尽，避免盖住结算卡
    for (const p of this.particles) {
      if (p.type === 'exhale' || p.type === 'wisp' || p.type === 'suck') {
        p.maxLife = Math.min(p.maxLife, p.life + 0.5)
      }
    }
    this.spawnAshFall()
    // 低概率彩蛋：烟蒂掉落隐藏皮肤碎片（集满 10 片解锁「彩虹」）
    if (this.forceFrag || eggs.rollFrag()) {
      this.forceFrag = false
      this.fragResult = eggs.addFrag()
    }
    // 0.45s 后烟蒂弹飞
    this.buttFlyAt = (this.t || Date.now()) + 450
    setTimeout(() => this.showSettle(), 1500)
    // 弹飞离场、烟灰落定后停掉渲染循环
    setTimeout(() => {
      if (this.data.finished) this.stopLoop()
    }, 2600)
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
        line: this.sub ? this.sub.line : skins.pick(skins.SETTLEMENT_LINES),
        egg: this.sub ? this.eggLabel : this.heartRing ? '心形烟圈' : this.colorSmoke ? '七彩烟' : '',
        frag: this.fragResult,
        inPack: ticketEarned ? calc.CIGS_PER_PACK : inPack,
        ticketEarned
      }
    })
  },

  onAgain() {
    this.lit = false
    this.lighting = false
    this.lightProg = 0
    this.burn = 0
    this.inhaling = false
    this.started = false
    this.added = false
    this.ashExtra = 0
    this.buttFly = null
    this.buttFlyAt = 0
    this.particles = []
    this.heartRing = false
    this.fragResult = null
    this.setData({ showSettle: false, finished: false, puffs: 0, phase: 'idle' })
    this.startLoop()
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goBox() {
    wx.switchTab({ url: '/pages/box/box' })
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

  // ---------- 粒子 ----------
  spawnExhale(durSec) {
    // 心形烟圈彩蛋：低概率触发，替整口烟雾换成一颗上飘的心
    if (this.forceHeart || eggs.rollHeart()) {
      this.forceHeart = false
      this.heartRing = true
      this.spawnHeartRing()
    }
    const count = Math.min(48, Math.round(10 + durSec * 14))
    for (let i = 0; i < count; i++) {
      const p = {
        type: 'exhale',
        x: this.W * 0.5 + (Math.random() - 0.5) * 70,
        y: this.H * 0.66 + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 70,
        vy: -(110 + Math.random() * 130),
        r: 12 + Math.random() * 20,
        life: 0,
        maxLife: 1.7 + Math.random() * 0.9,
        seed: Math.random() * 100
      }
      if (this.colorSmoke) p.rgb = eggs.rainbowColor(this.rainbowIdx++)
      this.particles.push(p)
    }
  },

  // 心形轮廓参数曲线：x=16sin³t, y=13cost-5cos2t-2cos3t-cos4t
  spawnHeartRing() {
    const cx = this.W * 0.5
    const cy0 = this.H * 0.55
    const N = 26
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2
      const hx = 16 * Math.pow(Math.sin(t), 3)
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      this.particles.push({
        type: 'ring',
        x: cx + hx * 3.2,
        y: cy0 - hy * 3.2,
        vx: 0,
        vy: -36,
        r: 7,
        life: 0,
        maxLife: 2.4,
        seed: Math.random() * 100
      })
    }
  },

  spawnSpark() {
    const tipXv = this.tipX()
    this.particles.push({
      type: 'spark',
      x: tipXv + (Math.random() - 0.5) * 8,
      y: this.geo.cy + this.floatY - 4,
      vx: (Math.random() - 0.5) * 160,
      vy: -(100 + Math.random() * 140),
      r: 1.2 + Math.random() * 1.6,
      life: 0,
      maxLife: 0.4 + Math.random() * 0.35,
      seed: Math.random() * 100,
      rgb: Math.random() < 0.5 ? '255,210,110' : '255,170,60'
    })
  },

  spawnSparkle() {
    const tipXv = this.tipX()
    this.particles.push({
      type: 'sparkle',
      x: tipXv + (Math.random() - 0.5) * 46,
      y: this.geo.cy + this.floatY - Math.random() * 34,
      vx: (Math.random() - 0.5) * 20,
      vy: -(20 + Math.random() * 30),
      r: 1.5 + Math.random() * 2,
      life: 0,
      maxLife: 0.8 + Math.random() * 0.4,
      seed: Math.random() * 100
    })
  },

  spawnFlame() {
    const tip = this.tipX()
    this.particles.push({
      type: 'flame',
      x: tip + 2 + (Math.random() - 0.5) * 8,
      y: this.geo.cy + this.floatY + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 30,
      vy: -(50 + Math.random() * 90),
      r: 2.5 + Math.random() * 3.5,
      life: 0,
      maxLife: 0.22 + Math.random() * 0.18,
      seed: Math.random() * 100
    })
  },

  spawnSuck() {
    const tip = this.tipX()
    this.particles.push({
      type: 'suck',
      x: Math.min(tip + 40 + Math.random() * 70, this.W - 12),
      y: this.geo.cy + this.floatY - 30 - Math.random() * 60,
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
    const p = {
      type: 'wisp',
      x: tip + 4 + (Math.random() - 0.5) * 6,
      y: this.geo.cy + this.floatY - 14,
      vx: (Math.random() - 0.5) * 14,
      vy: -(28 + Math.random() * 24),
      r: 3 + Math.random() * 3,
      life: 0,
      maxLife: 1.6 + Math.random() * 0.8,
      seed: Math.random() * 100
    }
    if (this.colorSmoke) p.rgb = eggs.rainbowColor(this.rainbowIdx++)
    this.particles.push(p)
  },

  spawnAshFall() {
    const tip = this.tipX()
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        type: 'ash',
        x: tip + Math.random() * 16,
        y: this.geo.cy + this.floatY + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 36,
        vy: 30 + Math.random() * 50,
        r: 2 + Math.random() * 2.5,
        life: 0,
        maxLife: 1.6 + Math.random() * 0.7,
        seed: Math.random() * 100
      })
    }
  },

  tipX() {
    const g = this.geo
    // 燃烧线随 burn 从最右端（满烟）向滤嘴推进：烟体缩短、烟灰变长
    return g.x0 + g.len - (g.len - g.filterLen) * this.burn
  },

  currentAshLen() {
    return this.lit && !this.sub ? 4 + 18 * this.burn + this.ashExtra : 0
  },

  // 诊断：帧率与场景状态（测试/调试用）
  getStats() {
    const fps = this.frames ? Math.round(this.frames / (this.frameMs / 1000)) : 0
    return {
      fps,
      frames: this.frames || 0,
      phase: this.data.phase,
      lit: this.lit,
      lightProg: +this.lightProg.toFixed(2),
      burn: +this.burn.toFixed(3),
      ashExtra: +this.ashExtra.toFixed(2),
      buttFly: !!this.buttFly,
      dbg: this.dbg || null,
      sub: (this.sub && this.sub.id) || null,
      colorSmoke: !!this.colorSmoke,
      geo: this.geo ? { x0: Math.round(this.geo.x0), cy: Math.round(this.geo.cy), len: Math.round(this.geo.len) } : null
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

    // 待机漂浮 + 抖灰冲击衰减
    this.floatKick = Math.max(0, this.floatKick - 40 * dt)
    this.floatY = Math.sin(now / 900) * 4 - this.floatKick

    // 点火推进 / 红热消退（替身按各自方式「激活」）
    if (this.lighting && !this.lit) {
      this.lightProg = Math.min(1, this.lightProg + dt * (1000 / LIGHT_MS))
      const tipStyle = this.sub ? this.sub.tip : 'ember'
      if (tipStyle === 'ember' || tipStyle === 'spark' || tipStyle === 'sizzle') {
        if (Math.random() < 0.85) this.spawnFlame()
      } else if (tipStyle === 'sparkle' && Math.random() < 0.6) {
        this.spawnSparkle()
      }
      if (this.lightProg >= 1) {
        this.lit = true
        this.lighting = false
        this.started = true
        this.setData({ phase: 'burning' })
        wx.vibrateShort({ type: 'light' })
      }
    } else if (!this.lit && this.lightProg > 0) {
      this.lightProg = Math.max(0, this.lightProg - dt * 2)
    }

    if (this.inhaling) {
      this.burn = Math.min(1, this.burn + dt * (1000 / BURN_MS))
      this.ashExtra = Math.min(14, this.ashExtra + dt * 3)
      if (this.sub) {
        const tipStyle = this.sub.tip
        if (tipStyle === 'spark') {
          if (Math.random() < 0.9) { this.spawnSpark(); this.spawnSpark() }
        } else if (tipStyle === 'sparkle') {
          if (Math.random() < 0.5) this.spawnSparkle()
        } else if (tipStyle === 'sizzle') {
          if (Math.random() < 0.3) this.spawnWisp()
        }
      } else if (Math.random() < 0.7) this.spawnSuck()
      if (this.burn >= 1) this.finish()
    } else if (this.lit && !this.data.finished) {
      // 燃烧待吸：细缕青烟（仙女棒是待机火花）
      this.wispTimer += dt
      if (this.wispTimer > 0.32) {
        this.wispTimer = 0
        if (this.sub && this.sub.tip === 'spark') {
          if (Math.random() < 0.8) this.spawnSpark()
        } else {
          this.spawnWisp()
        }
      }
    }

    // 燃尽弹飞
    if (this.buttFlyAt && now >= this.buttFlyAt && !this.buttFly) {
      this.buttFly = {
        x: this.geo.x0 + this.geo.filterLen / 2,
        y: this.geo.cy + this.floatY,
        vx: 360 + Math.random() * 140,
        vy: -560,
        rot: 0,
        vr: 9 + Math.random() * 4
      }
    }
    if (this.buttFly) {
      const b = this.buttFly
      b.vy += 1300 * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.rot += b.vr * dt
      if (Math.random() < 0.5) {
        this.particles.push({
          type: 'ash',
          x: b.x,
          y: b.y,
          vx: (Math.random() - 0.5) * 40,
          vy: 20,
          r: 1 + Math.random() * 1.5,
          life: 0,
          maxLife: 0.7,
          seed: Math.random() * 100
        })
      }
      if (b.x > this.W + 90 || b.y > this.H + 90 || b.x < -90) this.buttFly = null
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
      } else if (p.type === 'flame') {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.alpha = (1 - lr) * 0.9
      } else if (p.type === 'ring') {
        p.y += p.vy * dt
        p.x += Math.sin(now * 0.002 + p.seed) * 6 * dt
        p.r += 3.5 * dt
        p.alpha = Math.sin(Math.PI * lr) * 0.5
      } else if (p.type === 'spark') {
        p.vy += 420 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.alpha = 1 - lr
      } else if (p.type === 'sparkle') {
        p.x += (p.vx + Math.sin(now * 0.005 + p.seed) * 10) * dt
        p.y += p.vy * dt
        p.alpha = (1 - lr) * 0.8
      } else if (p.type === 'suck') {
        const dx = tip + 4 - p.x
        const dy = this.geo.cy + this.floatY - p.y
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

  // ---------- 趣味替身画法 ----------
  drawSub(now, tip, cy, top, h) {
    const ctx = this.ctx
    const g = this.geo
    const s = this.sub
    const glow = this.lit ? (this.inhaling ? 1 : 0.45) : this.lightProg

    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(this.W / 2, cy + h * 1.2, g.len * 0.42, 7, 0, 0, Math.PI * 2)
    ctx.fill()

    if (s.id === 'lollipop') {
      // 细杆 + 糖球（抽得越多糖球越小）
      const stickH = h * 0.4
      ctx.fillStyle = s.stick
      this.rr(g.x0, cy - stickH / 2, g.len - h, stickH, stickH / 2)
      ctx.fill()
      const r = h * 1.7 * (1 - this.burn * 0.92)
      if (r > 4) {
        const cxTip = g.x0 + g.len - r
        ctx.fillStyle = s.body
        ctx.beginPath()
        ctx.arc(cxTip, cy, r, 0, Math.PI * 2)
        ctx.fill()
        // 白色螺旋纹
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 3
        ctx.beginPath()
        for (let a = 0; a < Math.PI * 4; a += 0.22) {
          const rr2 = r * (a / (Math.PI * 4))
          const px = cxTip + Math.cos(a) * rr2
          const py = cy + Math.sin(a) * rr2
          if (a === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
    } else if (s.id === 'sparkler') {
      // 细杆 + 深色药头（点燃后火花由粒子负责）
      const stickH = h * 0.35
      ctx.fillStyle = s.stick
      this.rr(g.x0, cy - stickH / 2, g.len - 8, stickH, stickH / 2)
      ctx.fill()
      ctx.fillStyle = '#4a4438'
      this.rr(tip - 5, cy - h * 0.3, 11, h * 0.6, 4)
      ctx.fill()
    } else if (s.id === 'glowstick' || s.id === 'saber') {
      // 柄 + 发光杆（吸入更亮）
      ctx.fillStyle = s.stick
      this.rr(g.x0, top, g.filterLen, h, 7)
      ctx.fill()
      if (s.id === 'saber') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(g.x0 + g.filterLen * 0.35, top + 3, 4, h - 6)
        ctx.fillRect(g.x0 + g.filterLen * 0.62, top + 3, 4, h - 6)
      }
      const rodX = g.x0 + g.filterLen - 2
      const rodW = tip - rodX + 2
      if (rodW > 4) {
        ctx.fillStyle = s.body
        this.rr(rodX, top, rodW, h, h / 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.2 + 0.3 * glow
        this.rr(rodX - 4, top - 5, rodW + 8, h + 10, h / 2)
        ctx.fill()
        ctx.globalAlpha = 0.45 + 0.4 * glow
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        this.rr(rodX, cy - 3, rodW, 6, 3)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
    } else if (s.id === 'sausage') {
      // 竹签 + 香肠 + 烤痕（吸入滋滋冒气）
      const stickH = h * 0.3
      ctx.fillStyle = s.stick
      this.rr(g.x0, cy - stickH / 2, g.filterLen, stickH, stickH / 2)
      ctx.fill()
      const rodX = g.x0 + g.filterLen - 2
      const rodW = tip - rodX + 2
      if (rodW > 4) {
        ctx.fillStyle = s.body
        this.rr(rodX, top + 2, rodW, h - 4, (h - 4) / 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(60,25,12,0.45)'
        ctx.lineWidth = 3
        for (let i = 1; i <= 3; i++) {
          const mx = rodX + rodW * (i / 4)
          ctx.beginPath()
          ctx.moveTo(mx - 5, top + 6)
          ctx.lineTo(mx + 5, top + h - 6)
          ctx.stroke()
        }
        if (glow > 0.05) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = 0.1 + 0.16 * glow
          ctx.fillStyle = 'rgb(255,160,80)'
          this.rr(rodX, top, rodW, h, h / 2)
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }
      }
    }
  },

  // 测试专用：确定性地构造彩蛋场景（自动化验证用，正常游玩不会触发）
  debugEgg(kind) {
    if (kind === 'sub') {
      this.sub = eggs.SUBSTITUTES[0]
      this.colorSmoke = false
      this.eggLabel = '替身 · ' + this.sub.name
    } else if (kind === 'rainbow') {
      this.sub = null
      this.colorSmoke = true
      this.eggLabel = '七彩烟'
    } else if (kind === 'heart') {
      this.forceHeart = true
    } else if (kind === 'frag') {
      this.forceFrag = true
    }
    return { sub: this.sub && this.sub.id, colorSmoke: this.colorSmoke }
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
    const smokeRGB = this.sub ? this.sub.smoke : this.skin.smoke
    const W = this.W
    const H = this.H
    ctx.clearRect(0, 0, W, H)

    // 燃尽弹飞：画旋转飞出的烟蒂，不再画正常烟支
    if (this.buttFly) {
      const b = this.buttFly
      const h = g.h
      const len = g.filterLen * 0.9
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.rot)
      ctx.fillStyle = this.sub ? this.sub.stick : cig.filter
      this.rr(-len / 2, -h / 2, len, h, 6)
      ctx.fill()
      ctx.fillStyle = cig.ash
      this.rr(len / 2 - 3, -h / 2 + 2, 7, h - 4, 3)
      ctx.fill()
      ctx.restore()
      this.drawParticles(now, smokeRGB, H)
      return
    }

    const tip = this.tipX()
    const h = g.h
    const cy = g.cy + this.floatY
    const top = cy - h / 2

    // 趣味替身：整套专属画法（棒棒糖/仙女棒/荧光棒/激光剑/香肠）
    if (this.sub) {
      this.drawSub(now, tip, cy, top, h)
      this.drawParticles(now, smokeRGB, H)
      return
    }

    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(W / 2, cy + h * 1.2, g.len * 0.42, 7, 0, 0, Math.PI * 2)
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
    ctx.globalAlpha = 1

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

    // 烟灰（燃烧端右侧，点燃后才有）
    const ashLen = this.currentAshLen()
    if (ashLen > 0) {
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
    } else if (!this.lit && this.lightProg === 0 && !this.sub) {
      // 未点燃：烟丝端深色小截面
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      this.rr(tip - 3, top + 2, 5, h - 4, 2)
      ctx.fill()
    }

    // 火光：点火渐红 → 吸入爆亮 → 待机余烬微光
    let glow = 0
    if (!this.lit) glow = this.lightProg * 0.95
    else if (this.inhaling) glow = 0.85 + 0.15 * Math.sin(now / 45)
    else glow = 0.32 + 0.08 * Math.sin(now / 240)

    if (glow > 0.02) {
      const emberX = tip + 2
      ctx.globalCompositeOperation = 'lighter'
      if (this.sprites) {
        const glowR = 30 + 18 * glow
        ctx.globalAlpha = 0.5 * glow
        ctx.drawImage(this.sprites.glow, emberX - glowR, cy - glowR, glowR * 2, glowR * 2)
        const coreR = 6 + 2 * glow
        ctx.globalAlpha = 0.55 + 0.45 * glow
        ctx.drawImage(this.sprites.core, emberX - coreR, cy - coreR, coreR * 2, coreR * 2)
        ctx.globalAlpha = 1
      } else {
        const gr = ctx.createRadialGradient(emberX, cy, 0, emberX, cy, 30 + 18 * glow)
        gr.addColorStop(0, 'rgba(255,150,60,' + 0.3 * glow + ')')
        gr.addColorStop(1, 'rgba(255,150,60,0)')
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.arc(emberX, cy, 30 + 18 * glow, 0, Math.PI * 2)
        ctx.fill()
        const core = ctx.createRadialGradient(emberX, cy, 0, emberX, cy, 6)
        core.addColorStop(0, 'rgba(255,228,160,' + (0.55 + 0.45 * glow) + ')')
        core.addColorStop(0.6, 'rgba(255,110,45,' + (0.4 + 0.5 * glow) + ')')
        core.addColorStop(1, 'rgba(255,80,30,0)')
        ctx.fillStyle = core
        ctx.beginPath()
        ctx.arc(emberX, cy, 6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    this.drawParticles(now, smokeRGB, H)
  },

  // 粒子：跳过近透明/离屏；烟雾走精灵图（彩色粒子走实心圆），火焰/火花加色
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
      } else if (p.type === 'flame') {
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = 'rgba(255,150,50,' + p.alpha * 0.85 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,225,130,' + p.alpha * 0.7 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      } else if (p.type === 'ring') {
        // 心形烟圈：粉色柔边
        ctx.fillStyle = 'rgba(255,120,165,' + p.alpha * 0.55 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,170,200,' + p.alpha * 0.35 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.type === 'spark' || p.type === 'sparkle') {
        ctx.globalCompositeOperation = 'lighter'
        const rgb = p.rgb || (p.type === 'sparkle' ? '255,190,215' : '255,180,80')
        ctx.fillStyle = 'rgba(' + rgb + ',' + p.alpha * 0.9 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      } else if (sp && !p.rgb) {
        ctx.globalAlpha = p.alpha
        const d = p.r * 2
        ctx.drawImage(sp.smoke, p.x - p.r, p.y - p.r, d, d)
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = 'rgba(' + (p.rgb || smokeRGB) + ',' + p.alpha * 0.5 + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
})
