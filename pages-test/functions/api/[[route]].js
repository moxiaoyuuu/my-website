export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = '/' + (params.route || []).join('/');
  const token = env.GH_TOKEN;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!token) return new Response(JSON.stringify({ error: 'no token' }), { status: 500, headers: corsHeaders });

  // 转发到 Workers API 的 GitHub 调用
  const OWNER = 'moxiaoyuuu', REPO = 'my-website';

  // GET /succulent
  if (request.method === 'GET' && path === '/succulent') {
    try {
      const ir = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/2`,
        { headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `token ${token}`, 'User-Agent': 'pages-test' } });
      const issue = await ir.json();
      const state = JSON.parse(issue.body);
      const cr = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/2/comments?per_page=20`,
        { headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `token ${token}`, 'User-Agent': 'pages-test' } });
      const comments = cr.ok ? await cr.json() : [];
      const actions = comments.map(c => { try { return JSON.parse(c.body); } catch { return null; } }).filter(a => a && a.type === 'action').slice(-10);

      return new Response(JSON.stringify({ ok: true, state, actions, test: 'pages.dev works!' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
  }

  // POST /comment
  if (request.method === 'POST' && path === '/comment') {
    try {
      const { name, message } = await request.json();
      if (!name || !message) return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: corsHeaders });
      const now = new Date();
      const ts = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
      const body = JSON.stringify({ name, message, time: ts });
      const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/1/comments`,
        { method: 'POST', headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'pages-test' }, body: JSON.stringify({ body }) });
      const data = await res.json();
      return new Response(JSON.stringify({ ok: true, id: data.id, test: 'pages.dev works!' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
  }

  // POST /succulent (simplified)
  if (request.method === 'POST' && path === '/succulent') {
    try {
      const body = await request.json();
      const { action, name } = body;
      if (!name || !['water','sun','fertilize'].includes(action)) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400, headers: corsHeaders });
      const nickname = name.trim().substring(0, 20);
      const COOLDOWNS = { water: 2*60*60*1000, sun: 2*60*60*1000, fertilize: 4*60*60*1000 };

      const ir = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/2`,
        { headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `token ${token}`, 'User-Agent': 'pages-test' } });
      const issue = await ir.json();
      const state = JSON.parse(issue.body);

      const cds = state.cooldowns || {};
      const ucd = cds[nickname] || {};
      const now = Date.now();
      if (ucd[action] && (now - ucd[action]) < COOLDOWNS[action]) {
        const r = Math.ceil((COOLDOWNS[action] - (now - ucd[action])) / 60000);
        return new Response(JSON.stringify({ error: `⏳ 还需等 ${r} 分钟` }), { status: 429, headers: corsHeaders });
      }

      if (action === 'water') { if (state.water >= 95) return new Response(JSON.stringify({ error: 'water full' }), { status: 400, headers: corsHeaders }); state.water = Math.min(100, state.water + 25); }
      else if (action === 'sun') { if (state.sun >= 95) return new Response(JSON.stringify({ error: 'sun full' }), { status: 400, headers: corsHeaders }); state.sun = Math.min(100, state.sun + 25); }
      else { if ((state.fertilizer||0) >= 80) return new Response(JSON.stringify({ error: 'fert full' }), { status: 400, headers: corsHeaders }); state.fertilizer = Math.min(100, (state.fertilizer||0) + 35); }

      if (!cds[nickname]) cds[nickname] = {};
      cds[nickname][action] = now;
      state.cooldowns = cds;
      if (!state.contributions) state.contributions = {};
      state.contributions[nickname] = (state.contributions[nickname]||0) + 1;
      const avg = (state.water+state.sun)/2;
      if (avg >= 30 && avg <= 80) state.growth = Math.min(100, state.growth + ((state.fertilizer||0) > 20 ? 3 : 2));

      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/2`,
        { method: 'PATCH', headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'pages-test' }, body: JSON.stringify({ body: JSON.stringify(state) }) });

      const emoji = { water:'💧', sun:'☀️', fertilize:'🧪' };
      const msg = { water:'浇了水', sun:'晒了太阳', fertilize:'施了肥' };
      const logEntry = { type:'action', name:nickname, action, emoji:emoji[action], msg:msg[action], time: new Date().toLocaleString('zh-CN',{hour:'2-digit',minute:'2-digit'}), grownUp: false };
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/2/comments`,
        { method: 'POST', headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'pages-test' }, body: JSON.stringify({ body: JSON.stringify(logEntry) }) });

      return new Response(JSON.stringify({ ok: true, state, test: 'pages.dev works!' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
  }

  return new Response(JSON.stringify({ ok: true, path, test: 'pages.dev is accessible!' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}
