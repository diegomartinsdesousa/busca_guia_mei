/**
 * fetch com AbortSignal para nao travar indefinidamente (comum em servidores cloud).
 */
async function fetchComTimeout(url, init = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

module.exports = { fetchComTimeout };
