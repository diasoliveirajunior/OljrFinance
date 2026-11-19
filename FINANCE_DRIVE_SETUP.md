# Google Drive: sincronização automática no Finance

## Uso

1. Abra **Importar extrato > Google Drive** e conecte sua própria conta Google.
2. Clique **Escolher pasta**. Navegue pelas pastas ou busque pelo nome (também encontra pastas compartilhadas), entre na pasta e clique **Usar pasta**. Não precisa copiar URL.
3. Escolha a conta/cartão de destino e clique **Ativar sincronização automática** uma vez.
4. O servidor enumera os arquivos, lê OFX, XLSX, CSV e PDF com texto e grava os movimentos reconhecidos sem exigir seleção de arquivos ou confirmação de cada lote. A tela mostra o último lote, a última verificação e as exceções.

A primeira execução começa ao ativar. A rotina verifica novamente aproximadamente a cada cinco minutos e continua com a tela fechada, desde que o servidor esteja ativo. Processa páginas de cinco arquivos, continuando as páginas seguintes automaticamente; o cursor fica no Firestore para retomada. O intervalo não é garantia de tempo real e pode aumentar com fila, indisponibilidade do provedor ou volume de arquivos.

**Pausar** interrompe novas gravações. Trocar pasta pausa a automação e exige escolher/confirmar o destino novamente. **Desconectar** também apaga o token salvo no Finance. Uma reconexão pela mesma identidade preserva a pasta e o destino anteriores, quando existentes.

## Pendências

- Movimentos com data, valor e direção válidos entram automaticamente. Os incompletos ficam pendentes.
- Divergência de saldo, identificadores conflitantes, PDF parcialmente reconhecido ou alterações em movimentos já lançados impedem a importação automática do arquivo. O histórico anterior é preservado.
- Coincidência de data, descrição normalizada, direção e valor com outra origem fica pendente, em vez de assumir que é novo ou fundir movimentos legítimos. Repetições da mesma origem/destino continuam idempotentes.
- Em **Resolver pendência**, usa-se a revisão manual existente. **Encerrar pendência** ignora esta versão sem gravar nem apagar movimentos. A lista mostra até 100 arquivos por situação; encerrando pendências surgem as próximas.
- Falhas de leitura são tentadas novamente nas verificações seguintes. Arquivos incompatíveis aparecem como ignorados e não são baixados.

Um saldo é posição da conta e não vira receita/despesa. A categorização automática usa as regras locais existentes; categorias podem ser corrigidas depois.

## Formatos e limites

Até 3 MB por arquivo e 1.000 linhas. Grava em transações de até 400 movimentos. Falhas podem deixar lotes anteriores concluídos; a retomada ignora suas identidades e continua, sem afirmar que o arquivo inteiro foi atômico.

Excel: lê todas as abas reconhecidas, não executa fórmulas. CSV: identifica cabeçalhos e colunas existentes no importador. PDF: exige texto selecionável e estrutura reconhecida; esta entrega não inclui OCR nem garante ler todo layout bancário. OFX com FITID é o formato mais adequado para identificação estável.

Somente arquivos diretamente na pasta; subpastas, atalhos e documentos nativos Google não são exportados. Atualizações podem acrescentar movimentos; correções ou exclusões no histórico precisam de revisão.

## Configuração e operação

Cliente OAuth Web exclusivo do Finance, API do Drive habilitada:

- Retorno: `https://finance.oljr.com.br/api/finance/storage/callback/google`.
- Escopo: `https://www.googleapis.com/auth/drive.readonly`.
- Servidor: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `FINANCE_OAUTH_STATE_SECRET`, `FINANCE_TOKEN_ENCRYPTION_KEY`.
- Segredos somente nas configurações protegidas; nunca em código, PR, log ou chat.

A navegação de pastas usa a API no servidor; não precisa de chave adicional do Google Picker e não entrega access_token ao navegador. O escopo permite leitura do Drive inteiro; o Finance consulta metadados para selecionar a pasta e restringe o processamento à pasta escolhida. Isso é informado antes de conectar. É um escopo restrito; a distribuição em produção depende dos requisitos de verificação do Google. Em modo externo de testes, o refresh token de Drive expira após sete dias.

O agendador inicia com o Node e não é uma tarefa no navegador. O **Sempre ativo / Always On** do App Service deve estar habilitado para evitar a suspensão por inatividade. Inspeção em 19/11/2026: plano Basic B1, Always On desligado. O PR não altera Azure nem plano. Após autorização específica do responsável, a mudança prevista é:

```powershell
az webapp config set --name oljr-finance --resource-group rg-oljr-finance --always-on true
```

Depois da publicação, verificar no site a escolha visual e, com dados fictícios numa pasta de teste, a importação inicial e a leitura de novo arquivo com a janela fechada. Conferir ausência de duplicação após reinício. A configuração do Google continua em modo de testes até regularização específica.

## Proteção e limites de garantia

- OAuth com PKCE, estado assinado, expiração e uso único. Tokens individuais com AES-GCM, vinculados à identidade; não chegam ao navegador.
- Antes de executar, confere identidade Firebase, conta habilitada e acesso FINANCE. Cada lote também verifica usuário, destino, conexão, revisão e licença de execução no Firestore.
- Licença distribuída de dez minutos impede duas instâncias de processar a conexão simultaneamente; expira após queda. Pausa, mudança de destino e desconexão invalidam execuções antigas.
- Confere parentesco, tamanho e versão dos arquivos. Parser isolado com limite de memória, concorrência e tempo. Nenhum arquivo original é persistido ou enviado a serviço de IA.
- Lotes usam a mesma gravação transacional da importação manual. Uma revisão no destino serializa importações e permite repetir a conferência de colisões em gravações concorrentes.
- Registros operacionais guardam nomes/versões, contagens e motivos genéricos no banco privado. Não registram conteúdo de extratos, tokens ou mensagens brutas do provedor nos logs.

Esta integração não acessa bancos, senhas bancárias ou APIs privadas, não movimenta dinheiro, não implementa Open Finance e não recebeu certificação/auditoria equivalente. Proteções de aplicação não equivalem às garantias de uma integração regulada. OneDrive continua fora desta entrega.

## Validação

```bash
node --test backend/finance-import.test.js backend/finance-import-save.test.js backend/finance-google-drive.test.js backend/finance-drive-sync.test.js
cd portal
npm run build
npm run lint
```

Os testes usam dados fictícios, Drive/OAuth/identidade/Firestore simulados; não comprovam a operação real Google/Azure. A interface foi revisada localmente em tema escuro no desktop e claro no celular, com respostas fictícias.

Referências: [busca de pastas e arquivos](https://developers.google.com/workspace/drive/api/guides/search-files), [OAuth offline](https://developers.google.com/identity/protocols/oauth2/web-server), [escopos](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [modo de testes](https://support.google.com/cloud/answer/15549945?hl=en).
