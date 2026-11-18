# Importação de extratos

O Finance lê OFX, Excel `.xlsx`, CSV e PDF com texto selecionável. O arquivo é processado no servidor do Finance, sem envio a um serviço externo. O arquivo original não é armazenado. Só os lançamentos confirmados são gravados.

## Uso

1. Abra **Importar extrato** e escolha uma conta ou um cartão.
2. Selecione um arquivo de até 3 MB.
3. Em planilhas, escolha a aba, a linha dos títulos e as colunas de data, descrição e valor. Tipo e categoria são opcionais. Use **Atualizar prévia** após mudar as colunas.
4. Confira as linhas, corrija data, descrição, tipo, valor ou categoria e marque o que deseja importar. Linhas incompletas ficam desmarcadas.
5. Compare os totais e o destino com o documento original e confirme a importação.

São lidas até 1.000 linhas por arquivo, com até 400 lançamentos por confirmação. Após importar, os restantes continuam na prévia. Cada confirmação é uma transação: uma falha não deixa parte do lote gravada. A repetição da mesma origem no mesmo destino é ignorada, inclusive em novas tentativas.

## Particularidades

- **OFX:** lê SGML/XML e usa FITID para reconhecer repetições no mesmo destino. Transferências seguem o sinal do valor quando não há direção explícita.
- **Excel:** `.xlsx`, até 20 abas e 100 colunas. Títulos e informações antes da tabela podem ser ajustados. Datas reais do Excel são aceitas. Fórmulas não são executadas nem importadas; copie os resultados como valores. Para `.xls`, salve como `.xlsx`.
- **CSV:** aceita ponto e vírgula, vírgula ou tabulação, com campos entre aspas. Use UTF-8. Valores brasileiros com vírgula decimal são aceitos.
- **PDF:** até 30 páginas, texto selecionável, datas com ano e uma movimentação por linha, com um único valor ao final. PDFs escaneados, com senha ou com estrutura não reconhecida precisam ser exportados em OFX/Excel/CSV. Linhas com saldo ou total e linhas com mais de um valor não são convertidas. A prévia avisa quando linhas com data não foram convertidas.
- Valores positivos sem indicação de entrada/saída em Excel, CSV e PDF precisam de revisão. O sistema não presume que todo valor positivo é receita.
- A identificação de repetidos é por origem e destino. O mesmo período importado em formatos diferentes precisa de conferência manual. Arquivos diferentes podem representar a mesma movimentação sem identificadores comuns.

## Validação

`node --test backend/finance-import.test.js backend/finance-import-save.test.js` usa apenas dados fictícios, incluindo PDFs com texto e planilhas geradas em memória. A confirmação é testada com um substituto do Firestore, sem acessar contas reais. Rodar também `npm run build` e `npm run lint` em `portal`.

O PR inclui verificações automáticas em Node 22. Não publica: a publicação continua no fluxo existente da `main`, após aprovação e integração.
