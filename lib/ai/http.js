// AI provider 共享 HTTP 工具：带超时的 fetch + 友好错误

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * 带超时的 JSON POST，返回解析后的响应体
 * @param {string} url
 * @param {object} opts { headers, body, timeoutMs }
 * @returns {Promise<any>}
 */
async function postJson(url, { headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('AI 服务请求超时');
    throw new Error(`AI 服务请求失败：${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { /* 非 JSON */ }
  }
  if (!res.ok) {
    const apiMsg = data && (data.error?.message || data.error || data.message);
    throw new Error(apiMsg ? `AI 服务错误：${apiMsg}` : `AI 服务返回 ${res.status}`);
  }
  return data;
}

module.exports = { postJson };
