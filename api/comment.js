// Vercel Serverless Function — 留言板 API 中转
// 接收前端留言请求，使用服务端 Token 写入 GitHub Issues

export default async function handler(req, res) {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, message } = req.body || {};
  if (!name || !message) {
    return res.status(400).json({ error: '请填写昵称和留言内容' });
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    return res.status(500).json({ error: '服务器配置错误' });
  }

  const now = new Date();
  const timeStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const body = JSON.stringify({ name, message, time: timeStr });

  try {
    const ghRes = await fetch(
      'https://api.github.com/repos/moxiaoyuuu/my-website/issues/1/comments',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'token ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      }
    );

    if (!ghRes.ok) {
      const err = await ghRes.text();
      return res.status(500).json({ error: '留言失败: ' + err });
    }

    const data = await ghRes.json();
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: '留言失败，请重试' });
  }
}
