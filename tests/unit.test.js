// L1 纯逻辑单测：utils/calc.js + utils/skins.js（Node 直跑，无需开发者工具）
// 用法：node tests/unit.test.js
// 先 mock 掉 wx 存储 API，再加载被测模块
const __store = {}
global.wx = {
  getStorageSync: k => (k in __store ? __store[k] : ''),
  setStorageSync: (k, v) => { __store[k] = v },
  removeStorageSync: k => { delete __store[k] }
}

const path = require('path')
const calc = require(path.join(__dirname, '..', 'utils', 'calc.js'))
const skins = require(path.join(__dirname, '..', 'utils', 'skins.js'))

let failed = 0
let passed = 0
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('[PASS]', name) }
  else { failed++; console.log('[FAIL]', name, extra !== undefined ? ':: ' + JSON.stringify(extra) : '') }
}
function near(name, actual, expected, tol) {
  ok(name, Math.abs(actual - expected) <= tol, actual + ' (期望 ' + expected + '±' + tol + ')')
}

// ---------- calc：金额 / 寿命 ----------
const profile = { pricePerPack: 20, cigsPerDay: 20, quitStartAt: Date.now() }
ok('金额：1 根 ¥20/包 = ¥1', calc.moneyOf(1, profile) === 1)
ok('金额：7 根 = ¥7', calc.moneyOf(7, profile) === 7)
ok('金额：7 根 ¥10/包 = ¥3.5', calc.moneyOf(7, { ...profile, pricePerPack: 10 }) === 3.5)
ok('金额：价格 ¥25/包', calc.moneyOf(4, { ...profile, pricePerPack: 25 }) === 5)
ok('寿命：5 根 = 55 分钟', calc.lifeMinutesOf(5) === 55)
ok('寿命文案：59 分钟', calc.lifeText(59) === '59 分钟')
ok('寿命文案：60 分钟 = 1 小时', calc.lifeText(60) === '1 小时')
ok('寿命文案：90 分钟 = 1.5 小时', calc.lifeText(90) === '1.5 小时')
ok('寿命文案：1440 分钟 = 1 天', calc.lifeText(1440) === '1 天')
ok('金额文案：¥3.5', calc.moneyText(3.5) === '¥3.5')
ok('金额文案：¥3', calc.moneyText(3) === '¥3')

// ---------- calc：连续天数 ----------
const days = (...pairs) => Object.assign({}, ...pairs.map(([k, n]) => ({ [k]: n })))
const T = calc.todayStr()
const Y = calc.todayStr(Date.now() - 86400000)
const Y2 = calc.todayStr(Date.now() - 2 * 86400000)
ok('streak：只有今天 = 1', calc.streakOf(days([T, 3])) === 1)
ok('streak：今天+昨天 = 2', calc.streakOf(days([T, 1], [Y, 1])) === 2)
ok('streak：今天没抽、昨天抽了 = 保留 1', calc.streakOf(days([Y, 2])) === 1)
ok('streak：连续三天（前天起）= 3', calc.streakOf(days([Y2, 1], [Y, 1], [T, 1])) === 3)
ok('streak：中断不计（前天+今天）= 1', calc.streakOf(days([Y2, 1], [T, 1])) === 1)
ok('streak：空记录 = 0', calc.streakOf({}) === 0)
ok('longest：间断取最长', calc.longestOf({ [calc.todayStr(Date.now() - 5 * 86400000)]: 1, [calc.todayStr(Date.now() - 4 * 86400000)]: 1, [calc.todayStr(Date.now() - 2 * 86400000)]: 1 }) === 2)

// ---------- calc：开包进度 / 抽奖券 ----------
ok('本包进度：19 根 → inPack 19, packs 0', JSON.stringify(calc.packProgressOf(19)) === '{"inPack":19,"packs":0}')
ok('本包进度：20 根 → inPack 0, packs 1', JSON.stringify(calc.packProgressOf(20)) === '{"inPack":0,"packs":1}')
ok('券：20 根 0 抽 = 1 张', calc.ticketsLeftOf(20, 0) === 1)
ok('券：19 根 = 0 张', calc.ticketsLeftOf(19, 0) === 0)
ok('券：41 根 1 抽 = 1 张', calc.ticketsLeftOf(41, 1) === 1)
ok('券：抽多了不为负', calc.ticketsLeftOf(20, 2) === 0)
ok('距下张券：21 根已抽 1 → 还差 19', calc.cigsToNextTicket(21, 1) === 19)
ok('距下张券：有券未抽 → 0', calc.cigsToNextTicket(20, 0) === 0)

// ---------- calc：里程碑 ----------
const start = Date.now() - 50 * 60000 // 50 分钟前开始戒烟
const ms = calc.milestonesWith(start)
ok('里程碑共 8 档', ms.length === 8)
ok('里程碑：20 分钟已达成', ms[0].reached === true)
ok('里程碑：8 小时未达成', ms[1].reached === false)
near('里程碑进度：50min/8h ≈ 10.4%', ms[1].progress * 100, 10.4, 0.5)
const nm = calc.nextMilestone(start)
ok('下一站 = 8 小时', nm.title === '8 小时' && nm.pct === ms[1].progress * 100 >> 0)
ok('全部达成 → 满级', calc.nextMilestone(Date.now() - 366 * 86400000).title === '满级')

// ---------- calc：热力图 ----------
const cells = calc.heatmapOf({ [T]: 7, [Y]: 3, [Y2]: 1 })
ok('热力图 30 格', cells.length === 30)
ok('热力图末格 = 今天', cells[29].key === T)
ok('热力图分档：7→lv3', cells[29].level === 3)
ok('热力图分档：3→lv2', cells[28].level === 2)
ok('热力图分档：1→lv1', cells[27].level === 1)
ok('热力图分档：0→lv0', cells[0].level === 0)

// ---------- calc：存储初始化 / 迁移 / 清空 ----------
Object.keys(__store).forEach(k => delete __store[k])
__store['totalSmoked'] = 5 // 旧骨架数据
calc.initStorage()
ok('迁移：totalSmoked → total', __store['total'] === 5)
ok('初始化：初始皮肤 redgold', __store['skins'].currentId === 'redgold' && __store['skins'].owned.redgold === 1)
ok('初始化：档案含起点', typeof __store['profile'].quitStartAt === 'number')
const r = calc.addAvoided()
ok('入库：total 5→6 且按日聚合', r.total === 6 && calc.getDays()[T] === 1)
calc.clearAll()
ok('清空后回到初始态', calc.getTotal() === 0 && wx.getStorageSync('skins').owned.redgold === 1)

// ---------- skins：定义完整性 ----------
ok('共 9 款皮肤（含 1 隐藏）', skins.SKINS.length === 9)
ok('初始款唯一', skins.SKINS.filter(s => s.initial).length === 1)
ok('隐藏款唯一', skins.SKINS.filter(s => s.hidden).length === 1 && skins.SKINS.find(s => s.hidden).id === 'rainbow')
const byRarity = { common: 0, rare: 0, legend: 0, hidden: 0 }
skins.SKINS.forEach(s => byRarity[s.rarity]++)
ok('稀有度分布 4/3/1/1(隐藏)', byRarity.common === 4 && byRarity.rare === 3 && byRarity.legend === 1 && byRarity.hidden === 1, byRarity)
ok('每款配色字段齐全', skins.SKINS.every(s => s.box.top && s.box.bottom && s.box.band && s.cig.body && s.cig.filter && s.smoke))
ok('getSkin 兜底', skins.getSkin('不存在的id').id === 'redgold')

// ---------- skins：抽奖分布（6000 次统计法） ----------
const N = 6000
const dist = { common: 0, rare: 0, legend: 0 }
const ids = {}
for (let i = 0; i < N; i++) {
  const s = skins.rollSkin()
  dist[s.rarity]++
  ids[s.id] = (ids[s.id] || 0) + 1
}
near('roll 分布：普通 ≈60%', dist.common / N * 100, 60, 1.5)
near('roll 分布：稀有 ≈30%', dist.rare / N * 100, 30, 1.5)
near('roll 分布：传说 ≈10%', dist.legend / N * 100, 10, 1.2)
ok('roll 池：只出 7 款可抽皮肤（初始与隐藏不入池）', Object.keys(ids).length === 7 && !ids['redgold'] && !ids['rainbow'], Object.keys(ids))
// 档内均匀：每款频次应接近其所在档的期望（普通≈N*60%/3，稀有≈N*30%/3，传说≈N*10%）
const tierMean = { common: N * 0.6 / 3, rare: N * 0.3 / 3, legend: N * 0.1 }
const tierSpread = {}
skins.SKINS.filter(s => !s.initial && !s.hidden).forEach(s => {
  const dev = Math.abs(ids[s.id] - tierMean[s.rarity]) / tierMean[s.rarity]
  tierSpread[s.id] = Math.round(dev * 100)
})
ok('档内均匀：各款偏差 <12%', Object.values(tierSpread).every(v => v < 12), tierSpread)

// ---------- skins：文案 ----------
ok('renderLine 占位替换', skins.renderLine('{name} ×{n}', { name: '黑冰', n: 3 }) === '黑冰 ×3')
ok('结算文案库非空且随机', typeof skins.pick(skins.SETTLEMENT_LINES) === 'string')

// ---------- eggs：彩蛋 ----------
const eggs = require(path.join(__dirname, '..', 'utils', 'eggs.js'))
ok('彩蛋概率总和低于 15%（低概率设定）', eggs.P.substitute + eggs.P.heart + eggs.P.rainbow + eggs.P.frag < 0.15, eggs.P)
ok('替身共 5 款且字段齐全', eggs.SUBSTITUTES.length === 5 && eggs.SUBSTITUTES.every(s => s.id && s.name && s.stick && s.body && s.smoke && s.line))
// 统计法：低概率事件不应高发（10000 次抽替身，命中率应显著低于 10%）
let subHits = 0
for (let i = 0; i < 10000; i++) if (eggs.rollSubstitute()) subHits++
ok('替身概率低（<6%）', subHits / 10000 < 0.06 && subHits / 10000 > 0.005, subHits / 10000)
ok('彩虹取色循环', eggs.rainbowColor(0) === eggs.rainbowColor(7) && eggs.rainbowColor(1) !== eggs.rainbowColor(2))
// 碎片：累计与解锁
Object.keys(__store).forEach(k => delete __store[k])
let unlockedAt = 0
for (let i = 1; i <= eggs.FRAGS_NEED; i++) {
  const r = eggs.addFrag()
  if (r.unlocked) unlockedAt = i
}
ok('碎片集满解锁隐藏皮肤', unlockedAt === eggs.FRAGS_NEED && __store.skins.owned.rainbow === 1 && __store.skins.frags === 0, { unlockedAt })
ok('已解锁后不再重复解锁', eggs.addFrag().unlocked === false && eggs.addFrag().unlocked === false)
ok('碎片进度展示', eggs.fragProgress().need === eggs.FRAGS_NEED)

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed ? 1 : 0)
