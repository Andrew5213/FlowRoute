# FlowRoute Finance

Portal privado para controlo financeiro de viagens a serviço em Angola, baseado no fluxo PEMx-RNA.

## Incluído nesta versão

- Dashboard com orçamento, despesas, equipes, rotas e alertas.
- Prestação de contas com importação de comprovativos por imagem ou PDF.
- OCR assistido para preencher valor, fornecedor, data, fatura e descrição.
- Revisão humana dos campos antes de gravar.
- Relatório Excel com resumo, orçamento por equipe, diárias, prestação de contas, contingências e parâmetros.

## Executar localmente

```bash
npm start
```

O servidor usa `PORT` quando definido pelo ambiente e serve a pasta `dist/`.

## Nota de avaliação

Esta é uma primeira versão funcional com dados de demonstração persistidos no navegador. Para produção, ligar uma base de dados, autenticação por perfil e um serviço de OCR server-side.
