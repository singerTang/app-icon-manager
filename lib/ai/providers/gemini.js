// Gemini provider：调用 Generative Language API 生成 SVG 图标
// 文档：POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent

const { postJson } = require('../http');
const { splitVariants, deriveName } = require('../prompt');
const { sanitizeSvg } = require('../sanitize-svg');

const DEFAULT_MODEL = 'gemini-2.0-flash';

function requireKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('未配置 GEMINI_API_KEY，请在 .env 中设置');
  return key;
}

/**
 * 生成图标候选
 * @param {{ name: string, userPrompt: string, systemPrompt: string, count: number }} args
 * @returns {Promise<{ name: string, svg: string }[]>}
 */
async function generateIcons({ name, userPrompt, systemPrompt, count }) {
  const key = requireKey();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const data = await postJson(url, {
    body: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'text/plain', temperature: 0.7 },
    },
  });

  const raw = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('\n');

  return splitVariants(raw)
    .map((svg) => sanitizeSvg(svg))
    .filter((svg) => /^<svg[\s\S]*<\/svg>$/i.test(svg))
    .slice(0, count)
    .map((svg, i) => ({ name: deriveName(name, i), svg }));
}

module.exports = { generateIcons };
