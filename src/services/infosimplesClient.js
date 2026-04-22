const { fetchComTimeout } = require("./fetchComTimeout");

const ENDPOINT =
  "https://api.infosimples.com/api/v2/consultas/receita-federal/simples-das";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Limite de espera no HTTP cliente: timeout da API (s) + margem de rede */
function timeoutFetchInfosimplesSegundos(timeoutApiSegundos) {
  const s = Number(timeoutApiSegundos) || 120;
  return Math.min(Math.max(s, 30), 180) * 1000 + 20000;
}

async function consultarDasInfosimples({ cnpj, periodo, dataPagamento, token, timeout = 120 }) {
  const body = {
    cnpj,
    periodo,
    token,
    timeout: String(timeout),
  };
  if (dataPagamento) {
    body.data_pagamento = dataPagamento;
  }

  let response;
  try {
    response = await fetchComTimeout(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      timeoutFetchInfosimplesSegundos(timeout)
    );
  } catch (err) {
    const nome = err?.name === "AbortError" ? "Timeout" : err?.message;
    throw new Error(`Falha ao contatar InfoSimples (${periodo}): ${nome}`);
  }

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta invalida da InfoSimples para ${periodo}: ${raw}`);
  }

  return payload;
}

/**
 * Codigo 609: limite de tentativas no site de origem (Receita).
 * Retenta com espera para nao disparar varias chamadas seguidas.
 */
async function consultarDasInfosimplesComRetentativas({
  cnpj,
  periodo,
  dataPagamento,
  token,
  timeout = 120,
  maxRetries609 = 2,
  delayEntreRetentativas609 = 25000,
}) {
  let ultima = await consultarDasInfosimples({
    cnpj,
    periodo,
    dataPagamento,
    token,
    timeout,
  });

  let tentativa = 0;
  while (Number(ultima.code) === 609 && tentativa < maxRetries609) {
    await sleep(delayEntreRetentativas609);
    ultima = await consultarDasInfosimples({
      cnpj,
      periodo,
      dataPagamento,
      token,
      timeout,
    });
    tentativa += 1;
  }

  return ultima;
}

module.exports = {
  consultarDasInfosimples,
  consultarDasInfosimplesComRetentativas,
  sleep,
  timeoutFetchInfosimplesSegundos,
};
