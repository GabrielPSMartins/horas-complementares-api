import { protegerRota } from '../../auth.js';
import { obterMinhasSolicitacoes } from '../../api.js';
import { carregarDadosPerfil } from '../../utils/userprofile.js';
import { escapeHtml } from '../../utils/html.js';
import { STATUS, formatarData, obterMapaTiposAtividade } from '../../utils/solicitacao.js';

// Protege a rota verificando o token no localStorage
protegerRota();

// Mapa em memória ID -> nome do tipo de atividade
let mapaTiposAtividade = new Map();

// Estado dos filtros, paginação e parâmetros da requisição
const queryParams = {
    status: null,
    activity_type_id: null,
    start_date: null,
    end_date: null,
    page: 1,
    page_size: 5 // Limite de 5 itens por página
};

// Guarda o número total de solicitações retornadas para calcular páginas
let totalRegistros = 0;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Preenche o perfil e cabeçalhos do aluno
    carregarDadosPerfil();

    // 2. Inicializa os Tipos de Atividade para preencher o select de filtro
    await carregarEAplicarTiposAtividades();

    // 3. Configura os Listeners de Filtro e Paginação
    configurarEventosFiltro();
    configurarEventosPaginacao();

    // 4. Busca inicial das solicitações
    await carregarSolicitacoes();
});

// Busca os tipos de atividades da API e preenche o select no HTML
async function carregarEAplicarTiposAtividades() {
    const selectTipoFiltro = document.getElementById('select-activity-type-filter');

    try {
        mapaTiposAtividade = await obterMapaTiposAtividade();

        if (selectTipoFiltro) {
            selectTipoFiltro.replaceChildren(new Option('Todos os tipos', ''));
            mapaTiposAtividade.forEach((nome, id) => selectTipoFiltro.add(new Option(nome, id)));
        }
    } catch (error) {
        console.warn('Não foi possível carregar os tipos de atividades para os filtros:', error);
    }
}

// Configura os ouvintes de eventos para todos os campos de filtro
function configurarEventosFiltro() {
    const selectStatus = document.getElementById('select-status-filter');
    if (selectStatus) {
        selectStatus.addEventListener('change', async (e) => {
            const valor = e.target.value;
            queryParams.status = (valor === 'ALL' || !valor) ? null : valor;
            queryParams.page = 1;
            await carregarSolicitacoes();
        });
    }

    const selectTipo = document.getElementById('select-activity-type-filter');
    if (selectTipo) {
        selectTipo.addEventListener('change', async (e) => {
            const valor = e.target.value;
            queryParams.activity_type_id = valor ? valor : null;
            queryParams.page = 1;
            await carregarSolicitacoes();
        });
    }

    const inputStartDate = document.getElementById('input-start-date');
    if (inputStartDate) {
        inputStartDate.addEventListener('change', async (e) => {
            queryParams.start_date = e.target.value || null;
            queryParams.page = 1;
            await carregarSolicitacoes();
        });
    }

    const inputEndDate = document.getElementById('input-end-date');
    if (inputEndDate) {
        inputEndDate.addEventListener('change', async (e) => {
            queryParams.end_date = e.target.value || null;
            queryParams.page = 1;
            await carregarSolicitacoes();
        });
    }

    const btnLimpar = document.getElementById('btn-limpar-filtros');
    if (btnLimpar) {
        btnLimpar.addEventListener('click', async () => {
            queryParams.status = null;
            queryParams.activity_type_id = null;
            queryParams.start_date = null;
            queryParams.end_date = null;
            queryParams.page = 1;

            if (selectStatus) selectStatus.value = 'ALL';
            if (selectTipo) selectTipo.value = '';
            if (inputStartDate) inputStartDate.value = '';
            if (inputEndDate) inputEndDate.value = '';

            await carregarSolicitacoes();
        });
    }
}

// Configura os botões Anterior e Próximo
function configurarEventosPaginacao() {
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    if (btnPrev) {
        btnPrev.addEventListener('click', async () => {
            if (queryParams.page > 1) {
                queryParams.page -= 1;
                await carregarSolicitacoes();
            }
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', async () => {
            const totalPaginas = Math.ceil(totalRegistros / queryParams.page_size);
            if (queryParams.page < totalPaginas) {
                queryParams.page += 1;
                await carregarSolicitacoes();
            }
        });
    }
}

// Busca as solicitações no backend enviando os parâmetros ativos
async function carregarSolicitacoes() {
    const tabelaBody = document.getElementById('table-solicitacoes-body');

    try {
        const paramsAtivos = {};
        Object.keys(queryParams).forEach(key => {
            if (queryParams[key] !== null && queryParams[key] !== undefined && queryParams[key] !== '') {
                paramsAtivos[key] = queryParams[key];
            }
        });

        /** @type {import('../../utils/solicitacao.js').Pagina<import('../../utils/solicitacao.js').Solicitacao>} */
        const pagina = await obterMinhasSolicitacoes(paramsAtivos);
        totalRegistros = pagina.total;

        atualizarContador(totalRegistros);
        atualizarControlesPaginacao(totalRegistros);
        renderizarTabela(pagina.items);

    } catch (error) {
        console.error('Erro ao buscar solicitações filtradas:', error);
        if (tabelaBody) {
            tabelaBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-loading tabela-mensagem--erro">
                        Erro ao carregar solicitações. Tente novamente mais tarde.
                    </td>
                </tr>
            `;
        }
    }
}

function atualizarControlesPaginacao(total) {
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const infoText = document.getElementById('pagination-info');

    const totalPaginas = Math.max(1, Math.ceil(total / queryParams.page_size));

    if (infoText) {
        infoText.textContent = `${total} solicitação(ões) · Pág. ${queryParams.page}/${totalPaginas}`;
    }

    if (btnPrev) btnPrev.disabled = queryParams.page <= 1;
    if (btnNext) btnNext.disabled = queryParams.page >= totalPaginas;
}

// Renderiza a tabela HTML com o ícone do Olho apontando para a página de Detalhes
function renderizarTabela(lista) {
    const tabelaBody = document.getElementById('table-solicitacoes-body');
    if (!tabelaBody) return;

    if (!lista || lista.length === 0) {
        tabelaBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-loading">
                    Nenhuma solicitação encontrada para os filtros selecionados.
                </td>
            </tr>
        `;
        return;
    }

    tabelaBody.innerHTML = lista.map(item => {
        const status = STATUS[item.status];
        const tipoAtividade = mapaTiposAtividade.get(item.activity_type_id) ?? 'Atividade';
        const descricao = item.description || 'Sem descrição';

        return `
            <tr>
                <td><strong>${escapeHtml(tipoAtividade)}</strong></td>
                <td class="celula-truncada" title="${escapeHtml(descricao)}">${escapeHtml(descricao)}</td>
                <td>${escapeHtml(formatarData(item.created_at))}</td>
                <td><strong>${escapeHtml(item.requested_hours)}h</strong></td>
                <td><span class="status-badge ${status.badge}">• ${escapeHtml(status.label)}</span></td>
                <td style="text-align: center;">
                    <a href="detalhes-solicitacao.html?id=${encodeURIComponent(item.id)}" title="Ver Detalhes da Solicitação" class="link-icone">
                        <i data-lucide="eye"></i>
                    </a>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function atualizarContador(total) {
    const elContador = document.getElementById('total-solicitacoes-count');
    if (elContador) {
        elContador.textContent = `${total} solicitação(ões) registrada(s)`;
    }
}