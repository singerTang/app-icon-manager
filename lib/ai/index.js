// AI provider 抽象层入口：根据 AI_PROVIDER 环境变量导出对应实现
// 统一签名：async generateIcons({ prompt, count, style }) -> [{ name, svg }]

const providers = {
  openai: require('./providers/openai'),
};

function getProvider() {
  const name = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const provider = providers[name];
  if (!provider) {
    throw new Error(`不支持的 AI_PROVIDER「${name}」，当前仅支持 openai`);
  }
  return provider;
}

/**
 * 生成图标候选（统一入口）
 * @param {{ prompt: string, count?: number, style?: string }} args
 * @returns {Promise<{ name: string, svg: string }[]>}
 */
async function generateIcons(args) {
  return getProvider().generateIcons(args);
}

module.exports = { generateIcons, getProvider };
