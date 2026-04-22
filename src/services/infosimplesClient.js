const ENDPOINT =
  "https://api.infosimples.com/api/v2/consultas/receita-federal/simples-das";

async function consultarDasInfosimples({ cnpj, periodo, dataPagamento, token, timeout = 300 }) {
  const body = {
    cnpj,
    periodo,
    token,
    timeout: String(timeout),
  };
  if (dataPagamento) {
    body.data_pagamento = dataPagamento;
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta invalida da InfoSimples para ${periodo}: ${raw}`);
  }

  return payload;
}

module.exports = {
  consultarDasInfosimples,
};
