// 随机彩蛋：低概率惊喜，制造「再抽一根」的期待感
// 所有概率集中在此，随时可调

const P = {
  substitute: 0.025, // 进入抽烟页出现趣味替身
  heart: 0.03, // 每次吐烟出现心形烟圈
  rainbow: 0.04, // 每根烟烟雾变七彩色
  frag: 0.05 // 每次燃尽弹飞掉落隐藏皮肤碎片
}

const FRAGS_NEED = 10 // 碎片集齐数量
const HIDDEN_ID = 'rainbow' // 对应 utils/skins.js 里的隐藏皮肤

// 趣味替身：替换烟支的画法与行为
// stick: 左段柄/杆色 body: 主体色 tip: 燃端效果 smoke: 烟雾色 line: 专属结算文案
const SUBSTITUTES = [
  {
    id: 'lollipop', name: '棒棒糖', tip: 'sparkle',
    stick: '#f2ede2', body: '#ff9ab5', smoke: '255,190,215',
    line: '今天这根是棒棒糖，甜的，零焦油。'
  },
  {
    id: 'sparkler', name: '仙女棒', tip: 'spark',
    stick: '#b8b2a6', body: '#8a8578', smoke: '255,220,170',
    line: '仙女棒放完了，年味和烟瘾一起散了。'
  },
  {
    id: 'glowstick', name: '荧光棒', tip: 'glow',
    stick: '#3a4048', body: '#7cff6a', smoke: '170,255,180',
    line: '荧光棒不致癌，只致青春。'
  },
  {
    id: 'saber', name: '激光剑', tip: 'glow',
    stick: '#5a5f68', body: '#4a9dff', smoke: '170,215,255',
    line: '原力与你同在，烟瘾不与你同在。'
  },
  {
    id: 'sausage', name: '香肠', tip: 'sizzle',
    stick: '#caa27a', body: '#b05a3a', smoke: '255,220,190',
    line: '香肠抽完了？是吃完了吧。'
  }
]

const RAINBOW_COLORS = [
  '255,120,160', '255,170,90', '255,230,120', '140,235,130',
  '120,210,255', '160,150,255', '220,140,255'
]

function rollSubstitute() {
  return Math.random() < P.substitute ? pick(SUBSTITUTES) : null
}

function rollHeart() {
  return Math.random() < P.heart
}

function rollRainbow() {
  return Math.random() < P.rainbow
}

function rollFrag() {
  return Math.random() < P.frag
}

// 彩烟粒子取色：按序轮转彩虹色
function rainbowColor(i) {
  return RAINBOW_COLORS[i % RAINBOW_COLORS.length]
}

// 掉落碎片：写入 skins 存储，返回 { count, unlocked }
function addFrag() {
  const store = wx.getStorageSync('skins') || {}
  store.owned = store.owned || {}
  store.frags = (store.frags || 0) + 1
  let unlocked = false
  if (store.frags >= FRAGS_NEED && !store.owned[HIDDEN_ID]) {
    store.owned[HIDDEN_ID] = 1
    store.frags = 0
    unlocked = true
  }
  wx.setStorageSync('skins', store)
  return { count: unlocked ? FRAGS_NEED : store.frags, unlocked }
}

function fragProgress() {
  const store = wx.getStorageSync('skins') || {}
  return { count: Math.min(store.frags || 0, FRAGS_NEED), need: FRAGS_NEED }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

module.exports = {
  P,
  FRAGS_NEED,
  HIDDEN_ID,
  SUBSTITUTES,
  rollSubstitute,
  rollHeart,
  rollRainbow,
  rollFrag,
  rainbowColor,
  addFrag,
  fragProgress,
  pick
}
