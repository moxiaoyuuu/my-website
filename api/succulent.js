export const config = { runtime: 'edge' };

const OWNER = 'moxiaoyuuu';
const REPO = 'my-website';
const ISSUE_NUM = 2;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const COOLDOWNS = { water: 2*60*60*1000, sun: 2*60*60*1000, fertilize: 4*60*60*1000 };
const SPECIES = [
  { id:0, name:'粉月影',   emoji:'🌸', rarity:'common',     color:'#e8b4b8', tip:'#f2a7b0', leaf:'#a8d8a8' },
  { id:1, name:'紫珍珠',   emoji:'🔮', rarity:'common',     color:'#c9b1d9', tip:'#b38cc7', leaf:'#9db89e' },
  { id:2, name:'红宝石',   emoji:'🔥', rarity:'common',     color:'#d4956b', tip:'#e8734a', leaf:'#8cb88a' },
  { id:3, name:'冰玉',     emoji:'❄️', rarity:'common',     color:'#b8d8e8', tip:'#a0d0e8', leaf:'#a0c8b0' },
  { id:4, name:'月光仙子', emoji:'🌙', rarity:'common',     color:'#d8d8c8', tip:'#e8e0d0', leaf:'#b0c0a0' },
  { id:5, name:'蜜桃仙子', emoji:'🍑', rarity:'common',     color:'#f0c8b0', tip:'#f5a090', leaf:'#a8c898' },
  { id:6, name:'海蓝宝',   emoji:'🌊', rarity:'rare',       color:'#88c8d8', tip:'#68b8d0', leaf:'#90b890' },
  { id:7, name:'橘子汽水', emoji:'🍊', rarity:'rare',       color:'#e8b080', tip:'#f09850', leaf:'#a0c090' },
  { id:8, name:'黑王子',   emoji:'🌟', rarity:'rare',       color:'#6a5a6a', tip:'#8a6a8a', leaf:'#6a8a6a' },
  { id:9, name:'彩虹糖',   emoji:'🌈', rarity:'super_rare', color:'#e8d0c8', tip:'#d8a0b8', leaf:'#98c898' },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function getIssue(token) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUM}`,
    { headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'token ' + token, 'User-Agent': 'succulent-game' } }
  );
  if (!res.ok) throw new Error('Failed to read issue');
  return res.json();
}

async function updateIssue(token, body) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUM}`,
    {
      method: 'PATCH',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'token ' + token, 'Content-Type': 'application/json', 'User-Agent': 'succulent-game' },
      body: JSON.stringify({ body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }
  );
  if (!res.ok) throw new Error('Failed to update issue');
  return res.json();
}

async function getComments(token, perPage = 20) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUM}/comments?per_page=${perPage}`,
    { headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'token ' + token, 'User-Agent': 'succulent-game' } }
  );
  if (!res.ok) return [];
  return res.json();
}

async function addComment(token, body) {
  await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUM}/comments`,
    {
      method: 'POST',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'token ' + token, 'Content-Type': 'application/json', 'User-Agent': 'succulent-game' },
      body: JSON.stringify({ body }),
    }
  );
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const token = process.env.GH_TOKEN;
  if (!token) return json({ error: 'Server config error' }, 500);

  // ===== GET: 获取游戏状态 =====
  if (request.method === 'GET') {
    try {
      const issue = await getIssue(token);
      const state = JSON.parse(issue.body);
      const comments = await getComments(token, 20);

      // 解析操作日志
      const actions = [];
      for (const c of comments) {
        try {
          const a = JSON.parse(c.body);
          if (a.type === 'action') actions.push(a);
        } catch {}
      }

      // 计算当前植物的物种信息
      let currentSpeciesInfo = null;
      if (state.growth >= 100) {
        const speciesId = state.speciesQueue[state.currentPlant];
        currentSpeciesInfo = SPECIES.find(s => s.id === speciesId) || null;
      } else {
        // 生长中，不透露物种，但可以给出颜色提示
        const speciesId = state.speciesQueue[state.currentPlant];
        const sp = SPECIES.find(s => s.id === speciesId);
        if (sp && state.growth >= 40) {
          currentSpeciesInfo = { hint: true, color: sp.color, tip: sp.tip, leaf: sp.leaf, rarity: sp.rarity };
        }
      }

      return json({
        ok: true,
        state,
        actions: actions.slice(-10),
        currentSpeciesInfo,
        issueNumber: ISSUE_NUM,
      });
    } catch (e) {
      return json({ error: '加载失败' }, 500);
    }
  }

  // ===== POST: 执行操作 =====
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { action, name } = body || {};
    if (!name || !name.trim()) return json({ error: '请输入昵称' }, 400);
    if (!['water', 'sun', 'fertilize'].includes(action)) return json({ error: '无效操作' }, 400);

    const nickname = name.trim().substring(0, 20);

    try {
      const issue = await getIssue(token);
      const state = JSON.parse(issue.body);

      // 检查冷却
      const cooldowns = state.cooldowns || {};
      const userCD = cooldowns[nickname] || {};
      const now = Date.now();
      const cdMs = COOLDOWNS[action];

      if (userCD[action] && (now - userCD[action]) < cdMs) {
        const remain = Math.ceil((cdMs - (now - userCD[action])) / 60000);
        return json({ error: `⏳ ${nickname}，你还需要等 ${remain} 分钟才能再次${action==='water'?'浇水':action==='sun'?'晒太阳':'施肥'}哦~` }, 429);
      }

      // 应用操作
      if (action === 'water') {
        if (state.water >= 95) return json({ error: '💧 水太多了！' }, 400);
        state.water = Math.min(100, state.water + 25);
      } else if (action === 'sun') {
        if (state.sun >= 95) return json({ error: '☀️ 阳光太强了！' }, 400);
        state.sun = Math.min(100, state.sun + 25);
      } else if (action === 'fertilize') {
        if (state.fertilizer >= 80) return json({ error: '🧪 肥料够多了！' }, 400);
        state.fertilizer = Math.min(100, state.fertilizer + 35);
      }

      // 更新冷却
      if (!cooldowns[nickname]) cooldowns[nickname] = {};
      cooldowns[nickname][action] = now;
      state.cooldowns = cooldowns;

      // 更新贡献
      if (!state.contributions) state.contributions = {};
      state.contributions[nickname] = (state.contributions[nickname] || 0) + 1;

      // 计算成长
      const avg = (state.water + state.sun) / 2;
      if (avg >= 30 && avg <= 80) {
        const boost = state.fertilizer > 20 ? 3 : 2;
        state.growth = Math.min(100, state.growth + boost);
      }

      // 检查是否长成
      let grownUp = false;
      let completedSpecies = null;
      if (state.growth >= 100) {
        const speciesId = state.speciesQueue[state.currentPlant];
        completedSpecies = SPECIES.find(s => s.id === speciesId);
        if (!state.collectionRevealed.includes(speciesId)) {
          state.collectionRevealed.push(speciesId);
          grownUp = true;
        }
      }

      // 保存状态
      await updateIssue(token, state);

      // 创建操作日志
      const actionEmoji = { water: '💧', sun: '☀️', fertilize: '🧪' };
      const actionName = { water: '浇了水', sun: '晒了太阳', fertilize: '施了肥' };
      const logEntry = {
        type: 'action',
        name: nickname,
        action: action,
        emoji: actionEmoji[action],
        msg: actionName[action],
        time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        grownUp: grownUp,
        species: completedSpecies ? completedSpecies.name : null,
        speciesEmoji: completedSpecies ? completedSpecies.emoji : null,
      };
      await addComment(token, JSON.stringify(logEntry));

      return json({ ok: true, state, action: logEntry, grownUp, completedSpecies });
    } catch (e) {
      return json({ error: '操作失败，请重试' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
