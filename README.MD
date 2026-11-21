# Massu — Inteligência Financeira

Aplicação web para acompanhar investimentos cadastrados por cada usuário.

## Funcionalidades

- Cadastro, consulta e exclusão de investimentos no Supabase.
- Login, criação de conta e logout pelo Supabase Auth.
- Filtro da tabela e exportação CSV.
- Distribuição da carteira calculada pelos investimentos cadastrados, agrupando LCI e LCA.
- Gráfico de evolução alimentado pela tabela existente `historico_patrimonio`, lendo `data_referencia` e `valor_total`.
- Registro manual do saldo e dos aportes líquidos para cálculo do rendimento.

## Cálculos e limites atuais

- O cartão **Capital investido** soma `valor_investido`; não representa cotação atual nem inclui rendimentos.
- O rendimento mensal usa o último saldo anterior ao mês como abertura e o último saldo do mês como fechamento. A migração `supabase/migrations/20261120_historico_movimentacao_liquida.sql` adiciona a coluna necessária para ajustar aportes e resgates.
- Execute essa migração no SQL Editor do Supabase antes de registrar os saldos. Ela também cria as políticas de inserção e atualização do histórico para o usuário autenticado.
- Registros antigos ficam com movimentação desconhecida; o rendimento só aparece depois que os novos saldos e fluxos necessários forem registrados.
- O saldo é informado manualmente e precisa refletir uma avaliação atual dos investimentos; a aplicação ainda não consulta cotações de mercado.
- SELIC, CDI e IPCA ainda aguardam integração com fontes oficiais.
- Indicadores demonstrativos e linhas fictícias foram removidos da interface.

## Tecnologias

- HTML5, CSS3 e JavaScript.
- Chart.js.
- Supabase JavaScript v2, Auth e banco de dados.

## Segurança

As consultas de investimentos e do histórico filtram pelo usuário autenticado. A proteção efetiva depende das políticas RLS configuradas no Supabase; confirme as políticas de leitura, inserção e exclusão antes de considerar a segurança validada.

As configurações de conexão ficam em `supabase.js`. Não publique chaves secretas no navegador; use somente uma chave publicável com RLS habilitada.

## Execução local

Abra `index.html` com um servidor estático local. O navegador precisa acessar a internet para carregar as bibliotecas CDN e o projeto Supabase.
