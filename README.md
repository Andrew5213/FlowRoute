# FlowRoute Finance

Portal privado para controlo financeiro de viagens a serviço em Angola, baseado no fluxo PEMx-RNA.

## Incluído nesta versão

- Dashboard de resumo com acesso às abas Instruções, Parâmetros, Distâncias, Funcionários, Equipes, Composição, Rotas, Alterações, Passagens Aéreas, Manutenção Frota, Quilometragem, Controle Frota, Compras Extras, Dados Bancários, Registro Pagamentos, Pagamentos e Prestação de Contas.
- Formulários locais para adicionar registos, aprovar alterações e compras e atualizar o controle de frota.
- Prestação de contas com importação de comprovativos por imagem ou PDF.
- OCR assistido para preencher valor, fornecedor, data, fatura e descrição.
- Leitura por IA de orçamentos em PDF, imagem e planilha nas áreas Compras Extras e Gastos de Obra; os dados são sugeridos para revisão e o documento original fica anexado ao registo.
- Revisão humana dos campos antes de gravar.
- Relatório Excel completo com os demonstrativos financeiros e todos os módulos operacionais.
- Web App instalável (PWA), com manifesto, ícone e cache offline básico para abrir o FlowRoute como aplicativo.

## Executar localmente

```bash
npm start
```

O servidor usa `PORT` quando definido pelo ambiente e serve a pasta `dist/`.

## Web App e persistência

O endereço publicado no Railway já funciona como Web App responsivo. Em navegadores compatíveis, o botão “Instalar app” permite instalar o FlowRoute no computador ou celular; o Service Worker mantém o shell da aplicação disponível offline. O app usa PostgreSQL para contas, dados e documentos anexados.

## Configurar leitura por IA

Defina `OPENAI_API_KEY` como variável secreta no serviço do Railway ou no arquivo `.env` do Compose da VPS. Opcionalmente, use `OPENAI_MODEL` para escolher o modelo; o padrão é `gpt-4o-mini`. A chave fica somente no servidor. A leitura envia o documento selecionado à API da OpenAI e a pessoa deve conferir todos os campos antes de gravar. O uso da API pode gerar custos conforme a conta e o volume de documentos.

## Integração somente leitura com ERPNext

O ERPNext pode consultar `GET /api/integrations/erpnext/snapshot` usando o cabeçalho `X-FlowRoute-ERP-Token`. Configure `FLOWROUTE_ERP_INTEGRATION_SECRET` com um segredo aleatório de pelo menos 32 caracteres no serviço FlowRoute e use exatamente o mesmo valor como variável secreta no serviço ERPNext. A rota não usa contas de usuário e não aceita operações de escrita.

O snapshot entrega uma lista permitida de campos do orçamento, equipes, composição, rotas, alterações, passagens, manutenção, quilometragem, frota, compras, gastos de obra, pagamentos e prestação de contas. A lista de campos também é filtrada no ERPNext. Usuários, perfis, dados bancários, contas, anexos e metadados de documentos não são enviados. A resposta não é persistida nem altera os registos do FlowRoute. Não reutilize senha de usuário como segredo de integração.

## Nota de avaliação

O conteúdo dos documentos carregados é tratado como dado a extrair; instruções impressas dentro deles não são executadas pelo sistema.
