# Google Drive no Finance

## Fluxo

Em **Importar extrato > Google Drive**, cada pessoa conecta a própria conta Google e informa o link de uma pasta de extratos. O Finance lista os arquivos dessa pasta e lê o arquivo selecionado no servidor. O mesmo importador atende arquivos locais e do Drive: OFX, XLSX, CSV e PDF com texto, até 3 MB.

A lista procura arquivos novos ou alterados a cada 30 segundos enquanto a janela está aberta. Selecionar um arquivo carrega a prévia. A gravação exige escolher a conta/cartão, conferir os lançamentos e confirmar. Não há gravação desassistida, busca direta no banco nem agendamento de sincronização com a janela fechada.

Só os arquivos diretamente na pasta escolhida são listados; subpastas, atalhos e documentos nativos Google não são percorridos/exportados. A lista oferece paginação. Versões com confirmação anterior ficam identificadas por usuário, arquivo e conta/cartão de destino. Uma versão alterada precisa de nova revisão; a aplicação não substitui automaticamente lançamentos antigos que tenham sido corrigidos no arquivo.

## Configuração pelo administrador

Requer um cliente OAuth Web próprio do Finance no Google Cloud e a API do Google Drive habilitada. Não reutilizar a conta técnica/Firebase nem credenciais da SEDUC, CEO ou prefeituras.

- Retorno autorizado: `https://finance.oljr.com.br/api/finance/storage/callback/google`.
- Escopo: `https://www.googleapis.com/auth/drive.readonly`.
- Configurações do servidor: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `FINANCE_OAUTH_STATE_SECRET` e `FINANCE_TOKEN_ENCRYPTION_KEY`.
- Os segredos devem entrar diretamente na configuração protegida do servidor, nunca em código, PR, log ou chat.

O escopo somente leitura permite ao token ler o Drive. O aplicativo restringe as chamadas à pasta escolhida e valida o parentesco do arquivo antes da leitura e da confirmação. Essa distinção aparece na tela antes de conectar. `drive.file` é por arquivo e não deve ser apresentado como autorização automática para todos os filhos de uma pasta existente.

`drive.readonly` é um escopo restrito. A tela de consentimento, os usuários de teste e eventual verificação/avaliação exigida pelo Google precisam corresponder ao modo de distribuição do aplicativo. Referência: [escopos da API do Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Se a configuração faltar, a tela informa que a conexão aguarda habilitação pelo administrador; não simula uma conexão ativa. Esta mudança de código não cadastra cliente OAuth, não concede consentimento e não altera configurações da nuvem.

## Proteções

- Tokens por pessoa, criptografados com AES-GCM e vinculados à identidade do Finance. Tokens não chegam ao navegador.
- OAuth com PKCE, estado aleatório assinado, expiração em dez minutos e uso único. O retorno sempre volta ao domínio do Finance.
- Revogar a conexão no Finance invalida solicitações OAuth anteriores e apaga o token armazenado pelo aplicativo. Para revogar também a concessão no Google, a pessoa pode removê-la nas conexões da sua conta Google.
- Requisitar uma pasta ou arquivo de outra conexão, fora da pasta escolhida ou com sessão diferente é recusado.
- Alterações no arquivo durante a leitura ou entre prévia e confirmação exigem releitura.
- A confirmação continua atômica e idempotente. Origem Drive e versão ficam registradas sem guardar o arquivo original.
- A antiga rota `POST /api/finance/drive/sincronizar` retorna 410 e orienta usar a prévia. O caminho antigo não grava mais diretamente nem usa a chave técnica compartilhada.

## Testes

`node --test backend/finance-import.test.js backend/finance-import-save.test.js backend/finance-google-drive.test.js`

Usa dados, OAuth, Drive e Firestore simulados. A autorização real do Google e a leitura de uma pasta real só podem ser validadas após configurar o cliente OAuth e a pessoa autorizar a conexão.
