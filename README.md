# FlowRoute Finance

Portal privado para controlo financeiro de viagens a serviço em Angola, baseado no fluxo PEMx-RNA.

## Incluído nesta versão

- Dashboard de resumo com acesso às abas Instruções, Parâmetros, Distâncias, Funcionários, Equipes, Composição, Rotas, Alterações, Passagens Aéreas, Manutenção Frota, Quilometragem, Controle Frota, Compras Extras, Dados Bancários, Registro Pagamentos, Pagamentos e Prestação de Contas.
- Formulários locais para adicionar registos, aprovar alterações e compras e atualizar o controle de frota.
- Prestação de contas com importação de comprovativos por imagem ou PDF.
- OCR assistido para preencher valor, fornecedor, data, fatura e descrição.
- Revisão humana dos campos antes de gravar.
- Relatório Excel completo com os demonstrativos financeiros e todos os módulos operacionais.
- Web App instalável (PWA), com manifesto, ícone e cache offline básico para abrir o FlowRoute como aplicativo.

## Executar localmente

```bash
npm start
```

O servidor usa `PORT` quando definido pelo ambiente e serve a pasta `dist/`.

## Web App e persistência

O endereço publicado no Railway já funciona como Web App responsivo. Em navegadores compatíveis, o botão “Instalar app” permite instalar o FlowRoute no computador ou celular; o Service Worker mantém o shell da aplicação disponível offline. Os dados desta versão continuam persistidos no navegador por usuário/dispositivo.

## Nota de avaliação

Esta é uma primeira versão funcional com dados de demonstração persistidos no navegador. A planilha continua sendo a referência de regras e campos; o conteúdo da aba “Instruções” foi tratado como documentação do processo, não como instrução automática para o agente. Para produção, ligar uma base de dados, autenticação por perfil e um serviço de OCR server-side.
