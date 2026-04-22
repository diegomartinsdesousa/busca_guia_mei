# Gerador DAS MEI (mes a mes)

Aplicacao web com integracao na API da InfoSimples para consultar e salvar DAS do MEI em PDF.

## O que esta implementado

- Interface web para informar CNPJ, ano e meses (checkbox de janeiro a dezembro).
- Secao de configuracoes para salvar token da InfoSimples e pasta de download.
- Integracao com endpoint `receita-federal/simples-das` da InfoSimples.
- Consulta sequencial por periodo (`AAAAMM`), com logs de execucao.
- Download somente da guia PDF valida (ignora documento intermediario).
- Exibicao de status por periodo.

## Observacao importante

E necessario token valido da InfoSimples e permissao para o servico consultado.

### Codigo 609 (limite no site de origem)

Se aparecer `609 - Tentativas de consultar o site ou aplicativo de origem excedidas`, o provedor ou a Receita limitou chamadas muito frequentes.

O sistema ja:
- espera entre cada periodo (`DELAY_ENTRE_PERIODOS_MS`, padrao 10s)
- retenta ate `INFOSIMPLES_MAX_RETRIES_609` vezes com pausa (`INFOSIMPLES_RETRY_DELAY_609_MS`)

Em lotes grandes (muitos meses), aumente esses valores no Render ou no `.env`.

### Demora ou pagina em branco

- Cada chamada a InfoSimples usa `INFOSIMPLES_TIMEOUT` (segundos). Valores muito altos (ex.: 300) fazem uma unica consulta esperar ate **5 minutos**.
- O padrao agora e **120s** por chamada, com **timeout de rede** no cliente.
- Downloads da Receita usam `DOWNLOAD_FETCH_TIMEOUT_MS` (padrao 2 minutos).
- No Render (plano gratuito), requisicoes HTTP longas podem ser cortadas pelo proxy; para muitos meses, processe em lotes menores ou use plano pago.

## Como executar localmente

1. Instale dependencias:

```bash
npm install
```

2. Inicie o servidor:

```bash
npm run start
```

3. (Opcional) copie `.env.example` para `.env` e ajuste valores.

4. Abra:

`http://localhost:3000`

5. Em `Configuracoes`, informe e salve:
- Token da InfoSimples
- Pasta de download

6. Preencha:
- CNPJ
- Ano
- Meses desejados
- Data de pagamento (opcional, formato `AAAA-MM-DD`)

7. Clique em `Consultar via InfoSimples`.

## Deploy no Render

Este projeto ja inclui `render.yaml`.

### Variaveis de ambiente no Render

- `INFOSIMPLES_TOKEN` (obrigatoria)
- `DOWNLOAD_DIR` (recomendado `/tmp/downloads`)
- `NODE_VERSION` (20)

### Passos rapidos

1. Suba o projeto para GitHub.
2. No Render, clique em **New +** > **Blueprint**.
3. Conecte o repositorio.
4. O Render detecta o `render.yaml` e cria o servico.
5. Configure `INFOSIMPLES_TOKEN` no painel de variaveis.
6. Aguarde deploy e acesse a URL publica.

> Observacao: no Render, o disco e efemero. Arquivos em `/tmp` podem ser perdidos quando o servico reinicia.

## Estrutura

- `src/server.js`: servidor Express e processamento das consultas.
- `src/services/infosimplesClient.js`: cliente HTTP para API InfoSimples.
- `src/services/settingsStore.js`: persistencia de configuracoes locais.
- `views/index.ejs`: tela da aplicacao.
- `public/style.css`: estilos.
- `render.yaml`: configuracao de deploy do Render.

## Proximos passos recomendados

- Persistir historico de consultas em banco de dados.
- Salvar PDFs em armazenamento persistente (S3/R2).
- Criar exportacao de resultados em CSV.
