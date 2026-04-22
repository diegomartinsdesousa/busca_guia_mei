const fs = require("fs/promises");
const path = require("path");

const SETTINGS_DIR = path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(SETTINGS_DIR, "configuracoes.json");
const DEFAULT_DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
const ENV_TOKEN = process.env.INFOSIMPLES_TOKEN || "";
const ENV_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "";

async function carregarConfiguracoes() {
  if (ENV_TOKEN || ENV_DOWNLOAD_DIR) {
    return {
      tokenInfosimples: ENV_TOKEN,
      diretorioDownload: ENV_DOWNLOAD_DIR || DEFAULT_DOWNLOAD_DIR,
    };
  }

  try {
    const conteudo = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(conteudo);
    return {
      tokenInfosimples: parsed.tokenInfosimples || "",
      diretorioDownload: parsed.diretorioDownload || DEFAULT_DOWNLOAD_DIR,
    };
  } catch {
    return {
      tokenInfosimples: "",
      diretorioDownload: DEFAULT_DOWNLOAD_DIR,
    };
  }
}

async function salvarConfiguracoes(config) {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(config, null, 2), "utf8");
}

module.exports = {
  carregarConfiguracoes,
  salvarConfiguracoes,
};
