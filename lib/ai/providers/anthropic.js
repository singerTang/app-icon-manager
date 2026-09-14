// Anthropic provider：调用 Messages API 生成 SVG 图标（Claude 系列）
// 文档：POST https://api.anthropic.com/v1/messages

const { postJson } = require('../http');
const { splitVariants, deriveName } = require('../prompt');
const { sanitizeSvg } = require('../sanitize-svg');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function requireKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('未配置 ANTHROPIC_API_KEY，请在 .env 中设置');
  return key;
}

/**
 * 生成图标候选
 * @param {{ name: string, userPrompt: string, systemPrompt: string, count: number }} args
 * @returns {Promise<{ name: string, svg: string }[]>}
 */
async function generateIcons({ name, userPrompt, systemPrompt, count }) {
  const key = requireKey();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const url = 'https://api.anthropic.com/v1/messages';

  const data = await postJson(url, {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
  });

  const raw = (data.content || []).map((c) => c.text || '').join('\n');

  return splitVariants(raw)
    .map((svg) => sanitizeSvg(svg))
    .filter((svg) => /^<svg[\s\S]*<\/svg>$/i.test(svg))
    .slice(0, count)
    .map((svg, i) => ({ name: deriveName(name, i), svg }));
}

module.exports = { generateIcons };
