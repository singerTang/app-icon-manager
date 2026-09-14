// AI 图标生成的共享工具：变体切分与名称派生
// system/user prompt 的构造已移至 lib/ai/styles.js（固定三套财务风格）

// 候选之间的分隔标记：要求模型在多张变体之间输出此标记，便于服务端切分
const VARIANT_DELIMITER = '---ICON-VARIANT---';

/**
 * 从模型返回的原始文本中切分并提取多段 SVG
 * @param {string} raw
 * @returns {string[]}
 */
function splitVariants(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  // 优先按分隔标记切分；若模型未遵守，则按 <svg> 出现位置兜底切分
  const parts = raw.split(VARIANT_DELIMITER);
  const svgs = [];
  for (const part of parts) {
    const seg = part.match(/<svg[\s\S]*?<\/svg>/gi);
    if (seg) svgs.push(...seg);
  }
  // 兜底：模型完全没输出分隔符时，从全文提取所有 <svg>
  const all = raw.match(/<svg[\s\S]*?<\/svg>/gi) || [];
  if (!svgs.length) svgs.push(...all);
  return svgs;
}

// 从名称派生图标名（去除标点、限长），失败兜底 icon；附加序号区分多变体
function deriveName(name, i) {
  const base = String(name || '').replace(/[^\w一-龥]/g, '').slice(0, 20) || 'icon';
  return i > 0 ? `${base}_${i + 1}` : base;
}

module.exports = { VARIANT_DELIMITER, splitVariants, deriveName };
