// SVG 清洗：剥离脚本、事件属性与外部引用，防存储型 XSS
// 与 server.js 的 ALLOWED_TYPES 白名单、SVG 强制 attachment 响应思路一致

/**
 * 从模型返回的文本中提取第一段 <svg>...</svg>
 * @param {string} raw
 * @returns {string|null}
 */
function extractFirstSvg(raw) {
  if (typeof raw !== 'string') return null;
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

/**
 * 清洗 SVG 文本：
 * - 移除 <script>、<foreignObject>、<use> 等可执行/外部引用节点
 * - 移除所有 on* 事件属性（onclick、onerror 等）
 * - 移除 href/xlink:href 中非 data: 的外部链接
 * @param {string} svg
 * @returns {string}
 */
function sanitizeSvg(svg) {
  let out = String(svg || '');

  // 移除危险节点（含其内容）
  out = out.replace(/<\s*(script|style|foreignobject|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, '');
  // 移除自闭合的危险节点
  out = out.replace(/<\s*(script|style|foreignobject|iframe|object|embed)\b[^>]*\/?>/gi, '');

  // <use href="..."> 可引用外部资源，整体移除该节点
  out = out.replace(/<\s*use\b[\s\S]*?<\/\s*use\s*>/gi, '');
  out = out.replace(/<\s*use\b[^>]*\/?>/gi, '');

  // 移除事件属性
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 仅保留 data: 内联资源，剥离 http(s):// 等外部引用
  out = out.replace(/(xlink:href|href)\s*=\s*("(?:\s*)(?!data:)[^"]*"|'(?:\s*)(?!data:)[^']*')/gi, '');

  return out.trim();
}

module.exports = { extractFirstSvg, sanitizeSvg };
