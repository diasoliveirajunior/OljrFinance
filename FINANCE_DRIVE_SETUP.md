# Finance — Google Drive / Banco do Brasil

## Estado em 30/07/2026

- Pasta canônica: `Banco Do Brasil`
- ID: `1F5xY-aIycbPEZDa6JrWdeRiwJZ56dBDl`
- Formato: XLSX mensal do Banco do Brasil
- Período encontrado: 07/2021 a 07/2026
- Há arquivos repetidos; a sincronização deduplica por lançamento e por versão do arquivo.

## Permissão

Compartilhar somente a pasta `Banco Do Brasil`, como **Leitor**, com:

`firebase-adminsdk-fbsvc@oliveirajunior-eca87.iam.gserviceaccount.com`

Essa conta técnica usa acesso somente leitura e não recebe acesso ao restante do Drive
nem às credenciais bancárias.

## Rotas

- `GET /api/finance/drive/status`
- `POST /api/finance/drive/sincronizar`

As duas exigem login, painel `FINANCE` e o e-mail do CEO.

## Persistência

- `finance_lancamentos`: lançamentos importados com `origem: drive_xlsx`
- `finance_drive_arquivos`: registro do ID e `modifiedTime` de cada XLSX
- `finance_drive_config/{email}`: última sincronização e resumo do resultado

## Variáveis opcionais

- `FINANCE_DRIVE_FOLDER_ID`: substitui o ID padrão da pasta
- `FINANCE_DRIVE_OWNER_EMAIL`: substitui o proprietário padrão

Por padrão, a pasta e o proprietário acima já estão configurados no código.
