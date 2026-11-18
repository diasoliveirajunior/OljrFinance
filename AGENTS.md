# AGENTS.md — regras para IAs no OljrFinance

Obrigatório para qualquer IA (Claude, Codex, GPT ou similar) que trabalhe neste
repositório. **Leia antes da primeira edição** e siga em toda entrega.
Padrão de qualidade definido pelo responsável em 18/11/2026.

## O que é este projeto

`OljrFinance` é o **controle financeiro da OLJR**, com app próprio na Azure
(`oljr-finance`, grupo `rg-oljr-finance`) e endereço **https://finance.oljr.com.br**.

- É **separado** do OLJR CEO (www), da SEDUC e das prefeituras. Não use banco,
  chaves, contas ou dados desses projetos.
- O Admin do OLJR CEO tem um atalho para cá, mas o Finance tem **entrada própria**.

## Regras invioláveis

1. **Nunca envie direto para a `main`.** A `main` publica sozinha no ar (GitHub
   Actions `main_oljr-finance.yml`). Todo trabalho é feito numa branch própria
   (`feat/*`, `fix/*`, `docs/*`) e vai para a `main` por **PR**.
2. **Integrar (merge) só com o "ok" explícito do responsável**, para aquele PR.
   Pedido de ajuste não é autorização de publicar.
3. **Nunca commitar segredos**: `.env`, JSON de conta de serviço, chaves, tokens,
   senhas. Em 16/11/2026 uma chave vazou num commit e teve de ser trocada às pressas.
4. **Não mexer em DNS, Azure, Google Cloud ou permissões** sem autorização explícita.
5. Dados financeiros são pessoais: nunca colar extratos, faturas ou valores reais
   em PR, commit, log ou mensagem.

## Antes de enviar (sempre, sem exceção)

Rode **a mesma verificação do GitHub**, não uma mais branda:

```bash
cd portal && npm run build   # = tsc -b && vite build (o mesmo da publicação)
cd portal && npm run lint
```

- `tsc --noEmit` **não serve**: ele deixa passar import e variável sem uso, e a
  publicação quebra. Em 18/11/2026, 3 de 8 publicações falharam por isso e o
  responsável não viu nenhuma das mudanças.
- Se o build ou o lint falhar, **não envie**.

## Depois de integrar (com o ok do responsável)

1. **Acompanhe a publicação** até o fim:
   `gh run watch <id> -R diasoliveirajunior/OljrFinance --exit-status`.
2. Se falhar: diga isso ao responsável, corrija numa branch nova, com PR.
3. **Confira no site** (https://finance.oljr.com.br) que a mudança aparece de fato.
4. Só então diga "está no ar".

## Como reportar ao responsável

Em português simples, sem jargão. Sempre:

- **O que mudou**, do ponto de vista dele (o que ele vai ver na tela).
- **O que foi conferido e como** (testes, build, publicação, olhado no site).
- **O que NÃO foi feito ou NÃO foi conferido**, dito com clareza.
- Nunca dizer "feito" ou "no ar" sem ter visto a publicação terminar com sucesso
  e a tela no site.

## Padrão visual OLJR

- Tela de entrada no padrão do site oficial: fundo escuro, fonte **Montserrat**,
  cartão escuro, botão branco ENTRAR, **ícone de olho** para mostrar a senha.
- Ícones **Lucide** (nunca emoji ou símbolo de texto como ícone).
- Modo escuro e claro.
- Aparência profissional, de banco ou fintech: o responsável pediu explicitamente
  "cara de profissional".

## Forma de trabalho

- Uma entrega por vez, pequena e completa. Não juntar 8 mudanças num envio só.
- Pedido ambíguo: pergunte antes, com as opções.
- Discorde com argumento quando o pedido tiver um problema técnico ou de custo.
