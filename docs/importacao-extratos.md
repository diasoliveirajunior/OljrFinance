# Importação de extratos

O Finance lê OFX, Excel `.xlsx`, CSV e PDF com texto selecionável. O arquivo é processado no servidor do Finance, sem envio a um serviço externo. O arquivo original não é armazenado. Na importação local/manual, só os lançamentos confirmados são gravados. Na sincronização Google Drive ativada pelo usuário, movimentos reconhecidos são gravados automaticamente e as exceções ficam pendentes.

## Uso

1. Abra **Importar extrato** e escolha uma conta ou um cartão.
2. Selecione um arquivo de até 3 MB.
3. Em planilhas, confira a aba, a linha dos títulos e as colunas de data e descrição. Para valores, pode haver uma coluna única ou colunas separadas de entrada/crédito e saída/débito. Tipo, categoria e saldo são opcionais. Use **Atualizar prévia** após mudar as colunas.
4. Confira as linhas, corrija data, descrição, tipo, valor ou categoria e marque o que deseja importar. Linhas incompletas ficam desmarcadas.
5. Compare os totais e o destino com o documento original e confirme a importação.

São lidas até 1.000 linhas por arquivo, com até 400 lançamentos por confirmação. Após importar, os restantes continuam na prévia. Cada confirmação é uma transação: uma falha não deixa parte do lote gravada. A repetição da mesma origem no mesmo destino é ignorada, inclusive em novas tentativas.

## Particularidades

- **OFX:** lê SGML/XML e usa FITID para reconhecer repetições no mesmo destino. Transferências seguem o sinal do valor quando não há direção explícita.
- **Excel:** `.xlsx`, até 20 abas e 100 colunas. Títulos e informações antes da tabela podem ser ajustados. Datas reais do Excel são aceitas. Fórmulas não são executadas nem importadas; copie os resultados como valores. Para `.xls`, salve como `.xlsx`.
- **CSV:** aceita ponto e vírgula, vírgula ou tabulação, com campos entre aspas. Use UTF-8. Valores brasileiros com vírgula decimal são aceitos.
- **PDF:** até 30 páginas, texto selecionável, datas com ano e uma movimentação por linha, com um único valor ao final. PDFs escaneados, com senha ou com estrutura não reconhecida precisam ser exportados em OFX/Excel/CSV. Linhas com saldo ou total e linhas com mais de um valor não são convertidas. A prévia avisa quando linhas com data não foram convertidas.
- Em Excel/CSV, entradas e saídas são reconhecidas pelas colunas, códigos, convenção de sinais ou sequência de saldos. Uma coluna com valores negativos estabelece o padrão positivo=entrada para valores sem tipo; em arquivos de cartão com convenção oposta, escolha **Positivo é saída**. Um valor positivo isolado e sem evidência continua para revisão.
- Rótulos como `SALDO` e `S A L D O` são equivalentes, inclusive em CSV/Excel e PDF com texto. Saldo não exige tipo e não aparece na tabela de entradas/saídas. Um arquivo reconhecido que só contém saldo não gera pendência por ausência de movimentos. Isso não altera automaticamente o saldo inicial cadastrado na conta.
- Linhas de saldo anterior/inicial/final são separadas e exibidas como referência, sem gerar receita/despesa. Totais não são lançamentos. O saldo do OFX também fica separado. Quando há saldos consecutivos, o sistema compara a variação com o movimento e mostra divergências. Essa conferência descreve o arquivo original; alterações ou linhas desmarcadas na prévia exigem nova conferência pelo usuário.
- A identificação de repetidos é por origem e destino. O mesmo período importado em formatos diferentes precisa de conferência manual. Arquivos diferentes podem representar a mesma movimentação sem identificadores comuns.
- As novas regras se aplicam às próximas leituras. Lançamentos já gravados não são alterados ou removidos automaticamente; um saldo anteriormente registrado como entrada/saída precisa de conferência própria.

## Validação

`node --test backend/finance-import.test.js backend/finance-import-save.test.js backend/finance-google-drive.test.js backend/finance-drive-sync.test.js` usa apenas dados fictícios, incluindo PDFs com texto e planilhas geradas em memória. A confirmação é testada com um substituto do Firestore, sem acessar contas reais. Rodar também `npm run build` e `npm run lint` em `portal`.

Para sincronizar pela nuvem, use a aba **Google Drive**, escolha a pasta visualmente e ative a automação para o destino. Não é necessário selecionar arquivos individualmente. Configuração e limitações em [Google Drive no Finance](../FINANCE_DRIVE_SETUP.md).

O PR inclui verificações automáticas em Node 22. Não publica: a publicação continua no fluxo existente da `main`, após aprovação e integração.
