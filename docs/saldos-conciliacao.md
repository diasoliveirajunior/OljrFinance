# Saldos bancários e conferência do histórico

O saldo informado por um extrato é uma posição da conta em uma data. Não é uma
receita ou despesa e não recebe novamente a soma dos movimentos anteriores.

## Comportamento

- A conta mostra o último saldo do extrato e sua data original. Um dia sem
  movimento não transforma a data da fonte em uma consulta bancária de hoje.
- O cálculo do histórico usa a primeira abertura documentada que cobre o início
  dos lançamentos. Sem essa abertura, usa o saldo inicial do cadastro e informa
  a limitação. O valor salvo no cadastro não é alterado automaticamente.
- A tela detalha abertura, entradas, saídas, valor calculado na data do extrato
  e diferença para o valor informado. Abertura e fechamento de cada arquivo,
  continuidade entre períodos e correspondência dos movimentos são conferidos.
- Alterações ou exclusões de movimentos, fontes incompletas, movimentos sem
  correspondência e diferenças entre períodos impedem a conferência positiva.
  As diferenças não geram lançamentos artificiais de ajuste.
- Movimentos posteriores à data do extrato produzem uma estimativa separada.
  Lançamentos futuros não compõem o saldo de hoje (America/Cuiaba).
- Posições diferentes na data mais recente resultam em saldo a conferir, sem
  escolher ou somar valores arbitrariamente. O patrimônio fica a conferir também.
- O consolidado usa os saldos de referência das contas, que podem ter datas
  diferentes; a conferência e a data de cada uma ficam nos cartões de conta.

## Leitura e atualização

A sincronização Google Drive grava posições em `finance_extratos`, separadas de
`finance_lancamentos`, com proprietário, destino, versão do arquivo, moeda,
assinaturas dos movimentos esperados e estado da leitura. Não guarda o arquivo
original nessa coleção. A moeda BRL é exigida para usar uma posição.

O leitor versão 3 relê uma vez os arquivos concluídos ou pendentes por leitores
anteriores para registrar essas informações. A proteção de idempotência continua
ativa: reler não deve duplicar movimentos já importados. Arquivos marcados como
resolvidos continuam resolvidos. A releitura ocorre na próxima sincronização da
conexão configurada; este PR não executa uma migração em produção.

O vínculo ao proprietário e à conta é verificado no servidor. A versão do arquivo
e a conexão são conferidas novamente antes de registrar as posições. Posições não
são aceitas diretamente do navegador. Importações manuais ainda não registram
essas referências: sem sincronização Drive, a conta usa o cálculo identificado.

Uma limpeza operacional completa precisa incluir `finance_extratos`, além dos
lançamentos e recibos de importação, para não manter referências do histórico
removido. Exclusões comuns de lançamentos preservam as fontes e passam a mostrar
a ausência na conferência.

## Limites

Conferência significa consistência entre os arquivos lidos e os lançamentos
registrados. Não prova que o banco disponibilizou todos os arquivos. Um intervalo
sem movimento e sem diferença de saldo não permite provar que faltou um extrato.
PDF depende do formato e da presença de texto legível. Não há OCR nesta entrega.

Sem horário bancário, movimentos do mesmo dia podem já estar incluídos na posição;
por isso a estimativa soma somente datas posteriores. Posições intradiárias
diferentes na mesma data ficam como conflito. Não são diferenciados saldo
disponível, limite de crédito, aplicações automáticas e saldo bloqueado.

Não há conexão Open Finance, API bancária, pagamentos, transferências ou garantia
de saldo em tempo real nesta entrega. Nenhuma infraestrutura ou permissão cloud
é alterada. Os testes e a demonstração visual usam somente dados fictícios.

## Referências públicas usadas no modelo

- [Open Banking UK — Balances](https://openbankinguk.github.io/read-write-api-site3/v3.1.11/resources-and-data-models/aisp/Balances.html):
  saldo como posição com data, moeda, sinal e tipo.
- [Open Banking UK — Transactions](https://openbankinguk.github.io/read-write-api-site3/v4.0.1/resources-and-data-models/aisp/Transactions.html):
  movimentos separados da posição, com identificação e datas próprias.
- [Itaú — conciliação bancária](https://blog.itau.com.br/empresas/conciliacao-bancaria-para-empresas):
  comparação entre registros e extratos para identificar diferenças.

São referências de comportamento e dados públicos. Não foi copiado código de
bancos, utilizado endpoint privado ou alegada certificação Open Finance.
