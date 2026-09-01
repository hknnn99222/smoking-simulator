// 统计计算：存储读写、金额/寿命、连续天数、里程碑、开包进度
const CIGS_PER_PACK = 20
const LIFE_MIN_PER_CIG = 11 // 每戒一根 ≈ 挽回 11 分钟预期寿命
const DAY = 86400000

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function todayStr(ts = Date.now()) {
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function dateFromStr(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

// ---------- 存储 ----------
const DEFAULT_PROFILE = { pricePerPack: 20, cigsPerDay: 20, quitStartAt: 0 }

function getProfile() {
  const p = wx.getStorageSync('profile')
  return Object.assign({}, DEFAULT_PROFILE, p || {})
}

function saveProfile(p) {
  wx.setStorageSync('profile', p)
}

function getDays() {
  return wx.getStorageSync('days') || {}
}

function getTotal() {
  return wx.getStorageSync('total') || 0
}

// 记一次戒掉：按日聚合 + 累计，返回最新值
function addAvoided(ts = Date.now()) {
  const days = getDays()
  const key = todayStr(ts)
  days[key] = (days[key] || 0) + 1
  wx.setStorageSync('days', days)
  const total = getTotal() + 1
  wx.setStorageSync('total', total)
  return { total, today: days[key] }
}

// ---------- 换算 ----------
function moneyOf(total, profile) {
  return +(total * profile.pricePerPack / CIGS_PER_PACK).toFixed(1)
}

function lifeMinutesOf(total) {
  return total * LIFE_MIN_PER_CIG
}

function lifeText(min) {
  if (min < 60) return min + ' 分钟'
  if (min < 1440) return (min / 60).toFixed(1).replace(/\.0$/, '') + ' 小时'
  return (min / 1440).toFixed(1).replace(/\.0$/, '') + ' 天'
}

function moneyText(n) {
  return '¥' + n.toFixed(n % 1 ? 1 : 0)
}

// ---------- 连续天数 ----------
// 今天有记录则从今天往回数；否则从昨天往回数（保留昨天的火苗）
function streakOf(days) {
  let cur = dateFromStr(todayStr())
  if (!days[todayStr(cur)]) cur -= DAY
  let streak = 0
  while (days[todayStr(cur)] > 0) {
    streak++
    cur -= DAY
  }
  return streak
}

function longestOf(days) {
  const keys = Object.keys(days).filter(k => days[k] > 0).sort()
  let best = 0
  let run = 0
  let prev = 0
  for (const k of keys) {
    const t = dateFromStr(k)
    run = prev && t - prev === DAY ? run + 1 : 1
    if (run > best) best = run
    prev = t
  }
  return best
}

// ---------- 开包进度 ----------
function packProgressOf(total) {
  return { inPack: total % CIGS_PER_PACK, packs: Math.floor(total / CIGS_PER_PACK) }
}

function ticketsLeftOf(total, totalDraws) {
  return Math.max(0, Math.floor(total / CIGS_PER_PACK) - totalDraws)
}

// 距下一张抽奖券还差几根（有券可抽时返回 0）
function cigsToNextTicket(total, totalDraws) {
  if (ticketsLeftOf(total, totalDraws) > 0) return 0
  return CIGS_PER_PACK - (total % CIGS_PER_PACK)
}

// ---------- 健康里程碑 ----------
const MILESTONES = [
  { ms: 20 * 60e3, title: '20 分钟', desc: '心率和血压开始下降' },
  { ms: 8 * 3600e3, title: '8 小时', desc: '尼古丁和一氧化碳水平减半' },
  { ms: 24 * 3600e3, title: '24 小时', desc: '一氧化碳清除完毕' },
  { ms: 48 * 3600e3, title: '48 小时', desc: '味觉和嗅觉开始恢复' },
  { ms: 72 * 3600e3, title: '72 小时', desc: '支气管放松，肺活量回升' },
  { ms: 14 * DAY, title: '2 周', desc: '血液循环明显改善' },
  { ms: 90 * DAY, title: '3 个月', desc: '咳嗽和气短明显减少' },
  { ms: 365 * DAY, title: '1 年', desc: '冠心病风险减半' }
]

function milestonesWith(quitStartAt, now = Date.now()) {
  return MILESTONES.map(m => {
    const at = quitStartAt + m.ms
    const reached = now >= at
    const progress = reached ? 1 : Math.max(0, Math.min(1, (now - quitStartAt) / m.ms))
    return Object.assign({}, m, { at, reached, progress })
  })
}

function nextMilestone(quitStartAt, now = Date.now()) {
  const list = milestonesWith(quitStartAt, now)
  const next = list.find(m => !m.reached)
  if (!next) return { title: '满级', desc: '全部达成，身体已满血复活', pct: 100 }
  return { title: next.title, desc: next.desc, pct: Math.round(next.progress * 100) }
}

// ---------- 近 N 天热力图 ----------
function heatmapOf(days, count = 30) {
  const cells = []
  const today = dateFromStr(todayStr())
  for (let i = count - 1; i >= 0; i--) {
    const t = today - i * DAY
    const key = todayStr(t)
    const n = days[key] || 0
    const level = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3
    cells.push({ key, label: key.slice(5), n, level })
  }
  return cells
}

// ---------- 初始化 / 清空 ----------
function initStorage() {
  if (!wx.getStorageSync('profile')) {
    const p = getProfile()
    p.quitStartAt = p.quitStartAt || Date.now()
    saveProfile(p)
  }
  // 迁移旧骨架版的 totalSmoked
  if (wx.getStorageSync('total') === '' && wx.getStorageSync('totalSmoked')) {
    wx.setStorageSync('total', wx.getStorageSync('totalSmoked'))
    wx.removeStorageSync('totalSmoked')
  }
  const skins = wx.getStorageSync('skins')
  if (!skins || !skins.owned) {
    const { initialSkinId } = require('./skins')
    wx.setStorageSync('skins', { owned: { [initialSkinId()]: 1 }, currentId: initialSkinId(), totalDraws: 0 })
  }
}

function clearAll() {
  ;['profile', 'days', 'total', 'skins', 'logs', 'totalSmoked'].forEach(k => wx.removeStorageSync(k))
  initStorage()
}

module.exports = {
  CIGS_PER_PACK,
  LIFE_MIN_PER_CIG,
  todayStr,
  dateFromStr,
  getProfile,
  saveProfile,
  getDays,
  getTotal,
  addAvoided,
  moneyOf,
  lifeMinutesOf,
  lifeText,
  moneyText,
  streakOf,
  longestOf,
  packProgressOf,
  ticketsLeftOf,
  cigsToNextTicket,
  MILESTONES,
  milestonesWith,
  nextMilestone,
  heatmapOf,
  initStorage,
  clearAll
}
