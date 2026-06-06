// Cloudflare Worker — 留言板 + 多肉游戏 API
const OWNER = 'moxiaoyuuu';
const REPO = 'my-website';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SPECIES = [
  { id:0, name:'粉月影', emoji:'🌸', rarity:'common', color:'#e8b4b8', tip:'#f2a7b0', leaf:'#a8d8a8', rarityLabel:'普通' },
  { id:1, name:'紫珍珠', emoji:'🔮', rarity:'common', color:'#c9b1d9', tip:'#b38cc7', leaf:'#9db89e', rarityLabel:'普通' },
  { id:2, name:'红宝石', emoji:'🔥', rarity:'common', color:'#d4956b', tip:'#e8734a', leaf:'#8cb88a', rarityLabel:'普通' },
  { id:3, name:'冰玉', emoji:'❄️', rarity:'common', color:'#b8d8e8', tip:'#a0d0e8', leaf:'#a0c8b0', rarityLabel:'普通' },
  { id:4, name:'月光仙子', emoji:'🌙', rarity:'common', color:'#d8d8c8', tip:'#e8e0d0', leaf:'#b0c0a0', rarityLabel:'普通' },
  { id:5, name:'蜜桃仙子', emoji:'🍑', rarity:'common', color:'#f0c8b0', tip:'#f5a090', leaf:'#a8c898', rarityLabel:'普通' },
  { id:6, name:'海蓝宝', emoji:'🌊', rarity:'rare', color:'#88c8d8', tip:'#68b8d0', leaf:'#90b890', rarityLabel:'稀有' },
  { id:7, name:'橘子汽水', emoji:'🍊', rarity:'rare', color:'#e8b080', tip:'#f09850', leaf:'#a0c090', rarityLabel:'稀有' },
  { id:8, name:'黑王子', emoji:'🌟', rarity:'rare', color:'#6a5a6a', tip:'#8a6a8a', leaf:'#6a8a6a', rarityLabel:'稀有' },
  { id:9, name:'彩虹糖', emoji:'🌈', rarity:'super_rare', color:'#e8d0c8', tip:'#d8a0b8', leaf:'#98c898', rarityLabel:'超稀有' },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function ghApi(path, token, opts = {}) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/${path}`;
  const headers = { 'Accept': 'application/vnd.github+json', 'Authorization': `token ${token}`, 'User-Agent': 'cf-worker' };
  if (opts.body) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
  return fetch(url, { ...opts, headers: { ...headers, ...(opts.headers||{}) } });
}

// ===== 留言板 =====
async function handleComment(request, token) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { name, message } = body || {};
  if (!name || !message) return json({ error: '请填写昵称和留言内容' }, 400);

  const now = new Date();
  const timeStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const commentBody = JSON.stringify({ name, message, time: timeStr });

  try {
    const res = await ghApi('issues/1/comments', token, { method: 'POST', body: { body: commentBody } });
    if (!res.ok) return json({ error: '留言失败' }, 500);
    const data = await res.json();
    return json({ ok: true, id: data.id });
  } catch { return json({ error: '留言失败，请重试' }, 500); }
}

// ===== 多肉游戏 =====
async function handleSucculent(request, token) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // GET — 读取状态
  if (request.method === 'GET') {
    try {
      const issueRes = await ghApi('issues/2', token);
      if (!issueRes.ok) return json({ error: '读取失败' }, 500);
      const issue = await issueRes.json();
      const state = JSON.parse(issue.body);

      const commentsRes = await ghApi('issues/2/comments?per_page=20', token);
      const comments = commentsRes.ok ? await commentsRes.json() : [];

      const actions = [];
      for (const c of comments) {
        try { const a = JSON.parse(c.body); if (a.type === 'action') actions.push(a); } catch {}
      }

      let currentSpeciesInfo = null;
      if (state.growth >= 100) {
        const sid = state.speciesQueue[state.currentPlant];
        const sp = SPECIES.find(s => s.id === sid);
        if (sp) currentSpeciesInfo = { emoji: sp.emoji, name: sp.name, rarityLabel: sp.rarityLabel };
      } else if (state.growth >= 40) {
        const sid = state.speciesQueue[state.currentPlant];
        const sp = SPECIES.find(s => s.id === sid);
        if (sp) currentSpeciesInfo = { hint: true, color: sp.color, tip: sp.tip, leaf: sp.leaf, rarity: sp.rarity };
      }

      return json({ ok: true, state, actions: actions.slice(-10), currentSpeciesInfo });
    } catch { return json({ error: '加载失败' }, 500); }
  }

  // POST — 执行操作
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { action, name } = body || {};
    if (!name || !name.trim()) return json({ error: '请输入昵称' }, 400);
    if (!['water','sun','fertilize'].includes(action)) return json({ error: '无效操作' }, 400);

    const nickname = name.trim().substring(0, 20);
    const COOLDOWNS = { water: 2*60*60*1000, sun: 2*60*60*1000, fertilize: 4*60*60*1000 };

    try {
      const issueRes = await ghApi('issues/2', token);
      if (!issueRes.ok) return json({ error: '读取状态失败' }, 500);
      const issue = await issueRes.json();
      const state = JSON.parse(issue.body);

      // 检查冷却
      const cooldowns = state.cooldowns || {};
      const userCD = cooldowns[nickname] || {};
      const now = Date.now();
      if (userCD[action] && (now - userCD[action]) < COOLDOWNS[action]) {
        const remain = Math.ceil((COOLDOWNS[action] - (now - userCD[action])) / 60000);
        const names = { water:'浇水', sun:'晒太阳', fertilize:'施肥' };
        return json({ error: `⏳ ${nickname}，你还需要等 ${remain} 分钟才能再次${names[action]}哦~` }, 429);
      }

      // 应用
      if (action === 'water') {
        if (state.water >= 95) return json({ error: '💧 水太多了！' }, 400);
        state.water = Math.min(100, state.water + 25);
      } else if (action === 'sun') {
        if (state.sun >= 95) return json({ error: '☀️ 阳光太强了！' }, 400);
        state.sun = Math.min(100, state.sun + 25);
      } else {
        if ((state.fertilizer||0) >= 80) return json({ error: '🧪 肥料够多了！' }, 400);
        state.fertilizer = Math.min(100, (state.fertilizer||0) + 35);
      }

      if (!cooldowns[nickname]) cooldowns[nickname] = {};
      cooldowns[nickname][action] = now;
      state.cooldowns = cooldowns;

      if (!state.contributions) state.contributions = {};
      state.contributions[nickname] = (state.contributions[nickname] || 0) + 1;

      const avg = (state.water + state.sun) / 2;
      if (avg >= 30 && avg <= 80) {
        state.growth = Math.min(100, state.growth + ((state.fertilizer||0) > 20 ? 3 : 2));
      }

      let grownUp = false, completedSpecies = null;
      if (state.growth >= 100) {
        const sid = state.speciesQueue[state.currentPlant];
        completedSpecies = SPECIES.find(s => s.id === sid);
        if (!state.collectionRevealed) state.collectionRevealed = [];
        if (!state.collectionRevealed.includes(sid)) {
          state.collectionRevealed.push(sid);
          grownUp = true;
        }
      }

      await ghApi('issues/2', token, { method: 'PATCH', body: { body: JSON.stringify(state) } });

      const actionEmoji = { water:'💧', sun:'☀️', fertilize:'🧪' };
      const actionName = { water:'浇了水', sun:'晒了太阳', fertilize:'施了肥' };
      const logEntry = {
        type:'action', name:nickname, action, emoji:actionEmoji[action], msg:actionName[action],
        time: new Date().toLocaleString('zh-CN', { hour:'2-digit', minute:'2-digit' }),
        grownUp, species: completedSpecies?.name, speciesEmoji: completedSpecies?.emoji
      };
      await ghApi('issues/2/comments', token, { method: 'POST', body: { body: JSON.stringify(logEntry) } });

      return json({ ok: true, state, action: logEntry, grownUp, completedSpecies });
    } catch (e) {
      return json({ error: '操作失败，请重试' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ===== 主路由 =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const token = env.GH_TOKEN;

    if (!token) return json({ error: 'Server config error' }, 500);

    if (path === '/api/comment') return handleComment(request, token);
    if (path === '/api/succulent') return handleSucculent(request, token);

    return json({ error: 'Not found' }, 404);
  }
};
