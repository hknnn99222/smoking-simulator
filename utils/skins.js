// 烟盒皮肤定义 + 抽奖逻辑 + 玩梗文案库

const RARITY = {
  common: { key: 'common', name: '普通', weight: 60, color: '#aeb6c2', glow: 'rgba(255,255,255,.5)' },
  rare: { key: 'rare', name: '稀有', weight: 30, color: '#7c8cff', glow: 'rgba(124,140,255,.55)' },
  legend: { key: 'legend', name: '传说', weight: 10, color: '#e8b64c', glow: 'rgba(255,213,0,.6)' }
}

// box: 烟盒配色；cig: 配套烟支配色；smoke: 烟雾 RGB 字符串
const SKINS = [
  {
    id: 'redgold', name: '经典红金', rarity: 'common', initial: true, label: '烤烟型',
    box: { top: '#a32e2e', bottom: '#5c1212', band: '#c8a063', text: '#f5e7c8', pattern: 'none' },
    cig: { body: '#f5f0e4', filter: '#c8a063', ring: '#a32e2e', ash: '#9a9a97' },
    smoke: '235,235,238'
  },
  {
    id: 'bluesky', name: '软蓝天', rarity: 'common', label: '淡味',
    box: { top: '#9ec8e8', bottom: '#4d7fb4', band: '#ffffff', text: '#ffffff', pattern: 'clouds' },
    cig: { body: '#eef4fa', filter: '#dceaf7', ring: '#4d7fb4', ash: '#a9b4bd' },
    smoke: '214,232,246'
  },
  {
    id: 'mint', name: '薄荷爆珠', rarity: 'common', label: '凉感',
    box: { top: '#8fd8c0', bottom: '#2a8a72', band: '#ffffff', text: '#ffffff', pattern: 'dots' },
    cig: { body: '#eefaf5', filter: '#d9f2e8', ring: '#2a8a72', ash: '#a8bdb4' },
    smoke: '200,246,232'
  },
  {
    id: 'amber', name: '琥珀黄', rarity: 'common', label: '原香',
    box: { top: '#e8c46a', bottom: '#a6751f', band: '#fff3d6', text: '#5c4310', pattern: 'none' },
    cig: { body: '#f7f0dd', filter: '#e8d5a8', ring: '#a6751f', ash: '#b0aa98' },
    smoke: '240,230,205'
  },
  {
    id: 'blackice', name: '黑冰', rarity: 'rare', label: '细支',
    box: { top: '#3a4048', bottom: '#14171c', band: '#7fd8ff', text: '#cfeeff', pattern: 'frost' },
    cig: { body: '#eceff2', filter: '#2b2f36', ring: '#7fd8ff', ash: '#8e969e' },
    smoke: '205,235,250'
  },
  {
    id: 'verdant', name: '青山黛', rarity: 'rare', label: '山岚',
    box: { top: '#4f7f6f', bottom: '#1d3a30', band: '#d8c89a', text: '#e9f2ec', pattern: 'mountain' },
    cig: { body: '#eef3ee', filter: '#cfe0d2', ring: '#1d3a30', ash: '#a3b0a6' },
    smoke: '222,240,230'
  },
  {
    id: 'violet', name: '紫气东来', rarity: 'rare', label: '沉香',
    box: { top: '#9a7fd0', bottom: '#43267a', band: '#e8d48a', text: '#f4edff', pattern: 'rays' },
    cig: { body: '#f3eefb', filter: '#d9c9f0', ring: '#43267a', ash: '#b2a8bf' },
    smoke: '235,225,250'
  },
  {
    id: 'gilded', name: '鎏金岁月', rarity: 'legend', label: '典藏',
    box: { top: '#f0d488', bottom: '#9c6f1a', band: '#fff8e0', text: '#5c4310', pattern: 'foil' },
    cig: { body: '#fbf5e3', filter: '#e8c568', ring: '#9c6f1a', ash: '#b8b09a' },
    smoke: '250,240,210'
  }
]

// 开盒前的神秘烟盒（抽奖页用）
const MYSTERY_SKIN = {
  id: 'mystery', name: '???', rarity: 'common', label: '神秘',
  box: { top: '#8a6a3a', bottom: '#33240f', band: '#c8a063', text: '#e8d5a8', pattern: 'rays' },
  cig: { body: '#f5f0e4', filter: '#c8a063', ring: '#33240f', ash: '#9a9a97' },
  smoke: '235,235,238'
}

function getSkin(id) {
  return SKINS.find(s => s.id === id) || SKINS[0]
}

function initialSkinId() {
  const s = SKINS.find(x => x.initial)
  return s ? s.id : SKINS[0].id
}

// 抽奖：先按稀有度权重 roll（仅含有可抽皮肤的档位），再档内均匀
function rollSkin() {
  const keys = Object.keys(RARITY).filter(k => SKINS.some(s => s.rarity === k && !s.initial))
  const total = keys.reduce((sum, k) => sum + RARITY[k].weight, 0)
  let r = Math.random() * total
  let hit = keys[0]
  for (const k of keys) {
    r -= RARITY[k].weight
    if (r <= 0) { hit = k; break }
  }
  const pool = SKINS.filter(s => s.rarity === hit && !s.initial)
  return pool[Math.floor(Math.random() * pool.length)]
}

// ---------- 文案库 ----------
const SETTLEMENT_LINES = [
  '这根没点着，你赢了。',
  '烟瘾只有三分钟，你又一次撑过去了。',
  '省下的不是钱，是以后的体检费。',
  '肺说：谢谢老板。',
  '刚才那口空气，是不是也挺香？',
  '戒的是烟，赢的是自己。',
  '烟灰缸今晚又要饿肚子了。',
  '你跟香烟的关系，正在慢慢变淡。',
  '深呼吸这件事，不花钱，还赚命。',
  '又一根，稳住，我们能赢。'
]

const DUPE_LINES = [
  '又是{name}？它跟你有缘。',
  '{name} ×{n}，可以凑副牌了。',
  '同款又 +1，烟灰缸都看不下去了。',
  '{name}：怎么又是你抽我？'
]

const FIRST_LINES = ['新烟盒入手！', '开出新货了！', '恭喜，收藏 +1！']

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function renderLine(tpl, map) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m))
}

module.exports = {
  RARITY,
  SKINS,
  MYSTERY_SKIN,
  getSkin,
  initialSkinId,
  rollSkin,
  SETTLEMENT_LINES,
  DUPE_LINES,
  FIRST_LINES,
  pick,
  renderLine
}
