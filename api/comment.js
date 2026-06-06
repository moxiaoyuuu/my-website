export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    return json({ error: '服务器配置错误' }, 500);
  }

  // ===== 删除留言 =====
  if (request.method === 'DELETE') {
    let body;
    try { body = await request.json(); } catch { return json({ error: '无效请求' }, 400); }

    const { commentId, adminPass } = body || {};
    const pass = process.env.ADMIN_PASS || 'lyq2026';
    if (adminPass !== pass) {
      return json({ error: '管理密码错误' }, 403);
    }
    if (!commentId) {
      return json({ error: '缺少 commentId' }, 400);
    }

    try {
      const ghRes = await fetch(
        `https://api.github.com/repos/moxiaoyuuu/my-website/issues/comments/${commentId}`,
        {
          method: 'DELETE',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': 'token ' + token,
            'User-Agent': 'liyueqi-comments',
          },
        }
      );
      if (!ghRes.ok && ghRes.status !== 204) {
        return json({ error: '删除失败' }, 500);
      }
      return json({ ok: true });
    } catch {
      return json({ error: '删除失败，请重试' }, 500);
    }
  }

  // ===== 发布留言 =====
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: '无效请求' }, 400); }

  const { name, message } = body || {};
  if (!name || !message) {
    return json({ error: '请填写昵称和留言内容' }, 400);
  }

  const now = new Date();
  const timeStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const commentBody = JSON.stringify({ name, message, time: timeStr });

  try {
    const ghRes = await fetch(
      'https://api.github.com/repos/moxiaoyuuu/my-website/issues/1/comments',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'token ' + token,
          'Content-Type': 'application/json',
          'User-Agent': 'liyueqi-comments',
        },
        body: JSON.stringify({ body: commentBody }),
      }
    );

    if (!ghRes.ok) {
      return json({ error: '留言失败，请重试' }, 500);
    }

    const data = await ghRes.json();
    return json({ ok: true, id: data.id });
  } catch {
    return json({ error: '留言失败，请重试' }, 500);
  }
}
