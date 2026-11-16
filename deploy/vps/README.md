# Instalação isolada do FlowRoute na VPS

Este Compose usa serviços, rede e volume próprios (`flowroute-finance-vps-*`). O PostgreSQL não publica nenhuma porta. A aplicação fica ligada apenas a `127.0.0.1:8311`, sem alterar Nginx, firewall ou os outros projetos.

## Preparação no servidor

Use o caminho novo `/opt/flowroute-finance` e confirme que ele ainda não existe antes de copiar o pacote. Na pasta `deploy/vps`, copie `.env.example` para `.env` e defina `POSTGRES_PASSWORD` com um valor aleatório longo (hexadecimal, para evitar caracteres especiais na URL do banco). Para ativar a leitura de orçamentos, defina também `OPENAI_API_KEY`; a chave fica apenas no servidor. `OPENAI_MODEL` é opcional. Mantenha `.env` e `migrate/flowroute.snapshot.json` fora do Git.

Na raiz do pacote:

```sh
docker compose -f deploy/vps/docker-compose.yml up -d --build flowroute-db flowroute-app
```

## Importação dos dados do Railway

Coloque o snapshot autorizado em `deploy/vps/migrate/flowroute.snapshot.json` e execute:

```sh
docker compose -f deploy/vps/docker-compose.yml --profile migration run --rm flowroute-migrate
```

O importador recusa gravar se o banco de destino já tiver dados. Ele transfere usuários com os hashes de senha atuais, estado da aplicação e documentos anexados; sessões ativas não são copiadas, então cada usuário fará login novamente.

## Acesso privado para conferência

Com SSH disponível, crie um túnel local:

```sh
ssh -L 8311:127.0.0.1:8311 andrew@177.7.44.229
```

Depois abra `http://localhost:8311`. A aplicação não fica exposta à Internet sem uma configuração HTTPS própria.
