const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const { z } = require("zod");
const { consultarDasInfosimples } = require("./services/infosimplesClient");
const {
  carregarConfiguracoes,
  salvarConfiguracoes,
} = require("./services/settingsStore");

const app = express();
const PORT = process.env.PORT || 3000;
const ANO_ATUAL = new Date().getFullYear();
const BASE_RECEITA = "https://www8.receita.fazenda.gov.br";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

const formSchema = z.object({
  cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 14, "CNPJ deve conter 14 digitos."),
  ano: z.string().refine((v) => /^\d{4}$/.test(v), "Ano invalido."),
  mesesSelecionados: z.preprocess(
    (valor) => {
      if (Array.isArray(valor)) return valor;
      if (typeof valor === "string" && valor.trim()) return [valor];
      return [];
    },
    z.array(z.string().regex(/^(0[1-9]|1[0-2])$/)).min(1, "Marque ao menos um mes.")
  ),
  dataPagamento: z
    .string()
    .optional()
    .transform((v) => (v || "").trim())
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data de pagamento deve ser AAAA-MM-DD."),
});

const configSchema = z.object({
  tokenInfosimples: z.string().min(1, "Informe o token da InfoSimples."),
  diretorioDownload: z
    .string()
    .min(1, "Informe o diretorio de download."),
});

function montarValoresPadrao(configuracoes) {
  return {
    cnpj: "",
    ano: String(ANO_ATUAL),
    mesesSelecionados: [],
    dataPagamento: "",
    tokenInfosimples: configuracoes.tokenInfosimples,
    diretorioDownload: configuracoes.diretorioDownload,
  };
}

function montarPeriodos(mesesSelecionados, ano) {
  return [...new Set(mesesSelecionados)].sort().map((mes) => `${ano}${mes}`);
}

function extrairReceiptsDaResposta(resposta, periodo) {
  const receipts = [];

  if (Array.isArray(resposta.site_receipts)) {
    receipts.push(...resposta.site_receipts);
  }

  if (Array.isArray(resposta.data)) {
    for (const item of resposta.data) {
      if (item?.site_receipt) {
        receipts.push(item.site_receipt);
      }
      const periodos = item?.periodos || {};
      if (periodos[periodo]?.url_das) {
        receipts.push(periodos[periodo].url_das);
      }
    }
  }

  return [...new Set(receipts.filter(Boolean))];
}

async function limparHtmlAntigoPeriodo(pastaAno, cnpj, periodo) {
  let arquivos = [];
  try {
    arquivos = await fs.readdir(pastaAno);
  } catch {
    return;
  }

  const prefixo = `DAS_${cnpj}_${periodo}_`;
  const htmls = arquivos.filter(
    (nome) => nome.startsWith(prefixo) && nome.toLowerCase().endsWith(".html")
  );

  await Promise.all(
    htmls.map((nome) => fs.unlink(path.join(pastaAno, nome)).catch(() => {}))
  );
}

function parecePdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function extrairPrimeiroLinkPdf(html, baseUrl) {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const candidatos = [];
  let match = hrefRegex.exec(html);
  while (match) {
    candidatos.push(match[1]);
    match = hrefRegex.exec(html);
  }

  const linkPreferencial = candidatos.find((href) => {
    const lower = href.toLowerCase();
    return lower.includes("pdf") || lower.includes("imprimir");
  });
  const escolhido = linkPreferencial || candidatos[0];
  if (!escolhido) return null;

  try {
    if (escolhido.startsWith("/")) {
      return new URL(escolhido, BASE_RECEITA).toString();
    }
    return new URL(escolhido, baseUrl).toString();
  } catch {
    return null;
  }
}

async function baixarReceiptPreferindoPdf({ url, cnpj, periodo, indice, pastaAno }) {
  const baseNome = `DAS_${cnpj}_${periodo}_${indice}`;
  const destinoPdf = path.join(pastaAno, `${baseNome}.pdf`);

  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
  }
  const bufferInicial = Buffer.from(await resposta.arrayBuffer());
  if (parecePdf(bufferInicial)) {
    await fs.writeFile(destinoPdf, bufferInicial);
    return destinoPdf;
  }

  const html = bufferInicial.toString("utf8");
  const pdfUrl = extrairPrimeiroLinkPdf(html, url);
  if (!pdfUrl) return null;

  try {
    const respostaPdf = await fetch(pdfUrl);
    if (!respostaPdf.ok) return null;
    const bufferPdf = Buffer.from(await respostaPdf.arrayBuffer());
    if (!parecePdf(bufferPdf)) return null;
    await fs.writeFile(destinoPdf, bufferPdf);
    return destinoPdf;
  } catch {
    return null;
  }
}

function renderPagina(res, { tela = "principal", mensagem = "", erro = "", logs = [], resultados = [], valores }) {
  return res.render("index", {
    tela,
    mensagem,
    erro,
    logs,
    resultados,
    valores,
  });
}

app.get("/", async (_, res) => {
  const configuracoes = await carregarConfiguracoes();
  return renderPagina(res, {
    tela: "principal",
    valores: montarValoresPadrao(configuracoes),
  });
});

app.get("/configuracoes", async (_, res) => {
  const configuracoes = await carregarConfiguracoes();
  return renderPagina(res, {
    tela: "configuracoes",
    valores: montarValoresPadrao(configuracoes),
  });
});

app.get("/healthz", (_, res) => {
  res.status(200).json({ ok: true });
});

app.post("/gerar", async (req, res) => {
  const configuracoes = await carregarConfiguracoes();
  const parsed = formSchema.safeParse(req.body);
  const valores = montarValoresPadrao(configuracoes);
  valores.cnpj = req.body.cnpj || "";
  valores.ano = req.body.ano || String(ANO_ATUAL);
  valores.mesesSelecionados = Array.isArray(req.body.mesesSelecionados)
    ? req.body.mesesSelecionados
    : req.body.mesesSelecionados
    ? [req.body.mesesSelecionados]
    : [];
  valores.dataPagamento = req.body.dataPagamento || "";

  if (!parsed.success) {
    const erro = parsed.error.issues[0]?.message || "Dados invalidos.";
    res.status(400);
    return renderPagina(res, {
      tela: "principal",
      erro,
      valores,
    });
  }

  try {
    if (!configuracoes.tokenInfosimples) {
      throw new Error("Token da InfoSimples nao configurado. Preencha em Configuracoes.");
    }

    const meses = montarPeriodos(parsed.data.mesesSelecionados, parsed.data.ano);
    const logs = [];
    const resultados = [];
    const pastaAno = path.join(configuracoes.diretorioDownload, parsed.data.ano);
    await fs.mkdir(pastaAno, { recursive: true });

    for (const periodo of meses) {
      logs.push(`[${new Date().toLocaleTimeString("pt-BR")}] Consultando ${periodo}...`);
      const resposta = await consultarDasInfosimples({
        cnpj: parsed.data.cnpj,
        periodo,
        dataPagamento: parsed.data.dataPagamento,
        token: configuracoes.tokenInfosimples,
      });

      const code = Number(resposta.code);
      const sucessoApi = code === 200;
      const siteReceipts = extrairReceiptsDaResposta(resposta, periodo);
      const arquivos = [];
      if (sucessoApi && siteReceipts.length > 0) {
        await limparHtmlAntigoPeriodo(pastaAno, parsed.data.cnpj, periodo);
        for (let idx = 0; idx < siteReceipts.length; idx += 1) {
          const url = siteReceipts[idx];
          const destino = await baixarReceiptPreferindoPdf({
            url,
            cnpj: parsed.data.cnpj,
            periodo,
            indice: idx + 1,
            pastaAno,
          });
          if (destino) {
            arquivos.push(destino);
            break;
          }
        }
      }

      const temPdf = arquivos.some((arquivo) => arquivo.toLowerCase().endsWith(".pdf"));
      const sucesso = sucessoApi && temPdf;
      const erros = Array.isArray(resposta.errors) ? [...resposta.errors] : [];
      if (sucessoApi && !temPdf) {
        erros.push("Nao foi possivel gerar PDF para o periodo.");
      }

      resultados.push({
        periodo,
        code,
        codeMessage: resposta.code_message || "",
        sucesso,
        header: resposta.header || null,
        data: resposta.data || null,
        siteReceipts: siteReceipts.length ? siteReceipts : null,
        arquivosBaixados: arquivos,
        errors: erros,
      });

      logs.push(
        sucesso
          ? `[${new Date().toLocaleTimeString("pt-BR")}] ${periodo}: consulta concluida com sucesso (${arquivos.length} arquivo(s) baixado(s)).`
          : `[${new Date().toLocaleTimeString("pt-BR")}] ${periodo}: falha ao gerar PDF (${code} - ${resposta.code_message || "sem mensagem"}).`
      );
    }

    return renderPagina(res, {
      tela: "principal",
      mensagem: "Consultas via InfoSimples finalizadas.",
      logs,
      resultados,
      valores,
    });
  } catch (error) {
    res.status(500);
    return renderPagina(res, {
      tela: "principal",
      erro: `Falha no processamento: ${error.message}`,
      valores,
    });
  }
});

app.post("/configuracoes", async (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  const valores = {
    ...(await montarValoresPadrao(await carregarConfiguracoes())),
    cnpj: req.body.cnpj || "",
    ano: req.body.ano || String(ANO_ATUAL),
    mesesSelecionados: [],
    dataPagamento: req.body.dataPagamento || "",
    tokenInfosimples: req.body.tokenInfosimples || "",
    diretorioDownload: req.body.diretorioDownload || "",
  };

  if (!parsed.success) {
    const erro = parsed.error.issues[0]?.message || "Configuracoes invalidas.";
    res.status(400);
    return renderPagina(res, {
      tela: "configuracoes",
      erro,
      valores,
    });
  }

  await salvarConfiguracoes(parsed.data);
  const configuracoes = await carregarConfiguracoes();
  return renderPagina(res, {
    tela: "configuracoes",
    mensagem: "Configuracoes salvas com sucesso.",
    valores: montarValoresPadrao(configuracoes),
  });
});

app.listen(PORT, () => {
  console.log(`Servidor ativo em http://localhost:${PORT}`);
});
