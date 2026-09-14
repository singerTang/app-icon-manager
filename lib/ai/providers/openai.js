// OpenAI provider：调用 Chat Completions 生成 SVG 图标（GPT-4o 系列）
// 文档：POST https://api.openai.com/v1/chat/completions

const { postJson } = require('../http');
const { splitVariants, deriveName } = require('../prompt');
const { sanitizeSvg } = require('../sanitize-svg');

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function requireKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('未配置 OPENAI_API_KEY，请在 .env 中设置');
  return key;
}

// 解析 base_url：兼容带/不带末尾斜杠、带/不带 /v1 的情况，统一拼出 /chat/completions
function resolveChatUrl(base) {
  const b = String(base || '').replace(/\/+$/, '');
  return `${b}/chat/completions`;
}

/**
 * 生成图标候选
 * @param {{ name: string, userPrompt: string, systemPrompt: string, count: number }} args
 * @returns {Promise<{ name: string, svg: string }[]>}
 */
async function generateIcons({ name, userPrompt, systemPrompt, count }) {
  const key = requireKey();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const url = resolveChatUrl(baseUrl);

  const data = await postJson(url, {
    headers: { Authorization: `Bearer ${key}` },
    body: {
      model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
  });

  const raw = data.choices?.[0]?.message?.content || '';

  return splitVariants(raw)
    .map((svg) => sanitizeSvg(svg))
    .filter((svg) => /^<svg[\s\S]*<\/svg>$/i.test(svg))
    .slice(0, count)
    .map((svg, i) => ({ name: deriveName(name, i), svg }));
}

module.exports = { generateIcons };
