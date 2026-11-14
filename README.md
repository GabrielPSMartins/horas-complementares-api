# Sistema de Horas Complementares

Sistema web para gestão de atividades complementares do curso de Sistemas de Informação do Centro Universitário de Itajubá – FEPI. Desenvolvido como Trabalho de Conclusão de Curso (2026).

O aluno envia o certificado de uma atividade, o coordenador do curso analisa e aprova (definindo as horas aceitas) ou rejeita com justificativa, e o aluno acompanha o progresso até completar a carga horária exigida e exporta o relatório em PDF. Cada mudança de status fica registrada em um histórico de auditoria.

## Funcionalidades

**Aluno**
- Dashboard com progresso de horas (total, restantes e por tipo de atividade)
- Envio de solicitação com certificado (PDF, JPEG, PNG ou WEBP)
- Listagem com filtros, detalhes com linha do tempo do histórico e cancelamento de solicitações pendentes
- Relatório de horas em PDF

**Coordenador**
- Dashboard com indicadores por status e por semestre
- Fila de solicitações do curso: assumir, aprovar ou rejeitar
- Lista de alunos e relatório individual com exportação em PDF

**Regras de negócio**
- Limite de horas por certificado e, opcionalmente, limite acumulado por tipo de atividade
- Limite total do curso (horas exigidas + tolerância), validado no envio e na aprovação
- Fluxo de status: `PENDING → IN_REVIEW → APPROVED | REJECTED`, ou `PENDING → CANCELED`
- Controle de acesso por perfil (Aluno, Coordenador e ROOT) com JWT

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, JWT, ReportLab |
| Banco de dados | PostgreSQL 16 |
| Armazenamento de arquivos | MinIO (compatível com S3) |
| Frontend | HTML, CSS e JavaScript nativos (sem etapa de build), Chart.js e Lucide Icons via CDN |
| Infraestrutura | Docker Compose (PostgreSQL, pgAdmin e MinIO) |

## Estrutura do repositório

```
.
├── backend/
│   ├── app/
│   │   ├── api/            # rotas e dependências (autenticação, permissões)
│   │   ├── core/           # segurança (hash de senha, JWT)
│   │   ├── db/             # sessão do banco e seed de desenvolvimento
│   │   ├── middlewares/    # log de requisições
│   │   ├── models/         # entidades SQLAlchemy
│   │   ├── schemas/        # DTOs Pydantic
│   │   └── services/       # regras de negócio
│   ├── config/             # configurações via variáveis de ambiente
│   ├── migrations/         # migrações Alembic
│   ├── tests/
│   ├── docker-compose.yml
│   └── requirements.txt
└── frontend/
    ├── index.html          # tela de login
    ├── pages/aluno/
    ├── pages/coordenador/
    ├── css/
    └── js/
```

## Pré-requisitos

- Python 3.12
- Docker e Docker Compose
- Git

## Como executar

Há duas formas de executar. As duas começam pelo passo 1.

- **Tudo em containers** (mais simples, ideal para avaliar o projeto): passo 1 e depois a seção [Executar tudo com Docker](#executar-tudo-com-docker).
- **Desenvolvimento local** (API com recarga automática): passos 1 a 6.

Todos os comandos abaixo partem da raiz do repositório.

### 1. Configurar as variáveis de ambiente

```bash
cd backend
cp .env.example .env
```

Os valores do `.env.example` já funcionam para desenvolvimento local. Para qualquer uso fora da sua máquina, troque `SECRET_KEY` e as senhas.

### 2. Subir PostgreSQL, pgAdmin e MinIO

```bash
docker compose up -d
```

| Serviço | Endereço |
|---|---|
| PostgreSQL | `localhost:5433` |
| pgAdmin | http://localhost:5051 |
| MinIO (API) | `localhost:9000` |
| MinIO (console) | http://localhost:9001 (usuário e senha `minioadmin`) |

O bucket de certificados é criado automaticamente no primeiro envio.

> A MinIO deixou de publicar as imagens oficiais da edição comunitária (`minio/minio` não pode mais ser baixada). O projeto usa `pgsty/minio`, um fork comunitário compatível, com a versão fixada no `docker-compose.yml`.

### 3. Instalar as dependências do backend

```bash
python3.12 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
```

`requirements.txt` tem só o que a API usa em execução. `requirements-dev.txt` inclui também as ferramentas de teste.

### 4. Criar as tabelas e carregar os dados iniciais

```bash
alembic upgrade head
python -m app.db.seeds.development
```

O seed cria o curso de Sistemas de Informação (200 h exigidas + 10 h de tolerância), 13 tipos de atividade e os usuários de demonstração listados abaixo. Ele pode ser executado mais de uma vez sem duplicar dados.

### 5. Iniciar a API

```bash
uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Documentação interativa (Swagger): http://localhost:8000/docs

### 6. Servir o frontend

Em outro terminal, a partir da raiz do repositório:

```bash
python3 -m http.server 5500
```

Acesse http://localhost:5500/frontend/. Também é possível servir a pasta `frontend/` como raiz (`python3 -m http.server 5500 --directory frontend` e acessar http://localhost:5500/).

Por padrão, o frontend procura a API no mesmo host da página, na porta 8000 (em desenvolvimento, `http://localhost:8000`). O endereço pode ser alterado em `frontend/js/config.js`.

## Executar tudo com Docker

Depois do passo 1, dentro de `backend/`:

```bash
docker compose --profile app up -d --build
docker compose exec api python -m app.db.seeds.development   # dados iniciais (uma vez)
```

O container da API aplica as migrações sozinho ao iniciar. Acesse http://localhost:5500/frontend/ (frontend) e http://localhost:8000/docs (API).

Sem `--profile app`, o `docker compose up -d` sobe só a infraestrutura (PostgreSQL, pgAdmin e MinIO), como no passo 2.

## Usuários de demonstração

| Perfil | Usuário | Senha |
|---|---|---|
| Coordenador | `00000001` | `FEPI*11111111111` |
| Aluno | `00023520` | `FEPI*00000000000` |
| ROOT | `root` | valor de `DEFAULT_ROOT_PASSWORD` no `.env` |

Alunos e coordenadores entram com a matrícula. A senha inicial segue o padrão `FEPI*<CPF sem pontuação>`.

O perfil ROOT, que cadastra coordenadores, não tem telas no frontend e é operado pelo Swagger. Para isso, use o botão **Authorize** em `/docs` com o usuário e a senha. Se o ROOT tentar entrar pela tela de login, o sistema exibe uma mensagem indicando o Swagger.

## Testes

```bash
cd backend
pytest                      # 144 testes
pytest --cov=app            # com relatório de cobertura (~91%)
```

Os testes cobrem autenticação (login, JWT, perfis), o ciclo de vida da solicitação (assumir, aprovar, rejeitar, cancelar e histórico), os limites de horas (por certificado, por tipo e do curso), as permissões entre alunos e coordenadores de cursos diferentes, as validações de entrada, a consistência das transações e os filtros das listagens.

Por padrão os testes usam um banco SQLite em memória. Para rodá-los no PostgreSQL, crie um banco vazio e descartável e informe a URL dele (as tabelas são recriadas a cada teste, então **não use o banco de desenvolvimento**):

```bash
docker exec horas_complementares_postgres createdb -U horas_user horas_test
TEST_DATABASE_URL=postgresql+psycopg://horas_user:horas_password@localhost:5433/horas_test pytest
```

## Autores

- Gabriel de Paula dos Santos Martins (backend)
- Leonardo Fonseca Silva (frontend)

Orientador: Prof. Leandro Duarte Pereira
