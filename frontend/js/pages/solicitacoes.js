// js/pages/solicitacoes.js
import { protegerRota } from '../auth.js';
import { obterMinhasSolicitacoes, obterTiposAtividades } from '../api.js';
import { carregarDadosPerfil } from '../utils/userprofile.js';

// Protege a rota verificando o token no localStorage
protegerRota();

// Dicionário em memória para mapear ID -> Nome da Atividade
const mapaTiposAtividade = {};

// Estado dos filtros, paginação e parâmetros da requisição
const queryParams = {
    status: null,
    activity_type_id: null,
    start_date: null,
    end_date: null,
    page: 1,
    page_size: 4 // Limite de 4 itens por página
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
        const tipos = await obterTiposAtividades();
        const listaTipos = Array.isArray(tipos) ? tipos : (tipos?.data || []);

        let optionsHTML = '<option value="">Todos os tipos</option>';
        
        listaTipos.forEach(tipo => {
            const id = tipo.id || tipo._id;
            const nome = tipo.name || tipo.nome || tipo.title || tipo.descricao;
            
            if (id && nome) {
                mapaTiposAtividade[id] = nome;
                optionsHTML += `<option value="${id}">${nome}</option>`;
            }
        });

        if (selectTipoFiltro) {
            selectTipoFiltro.innerHTML = optionsHTML;
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

        const dados = await obterMinhasSolicitacoes(paramsAtivos);
        
        let solicitacoes = Array.isArray(dados) 
            ? dados 
            : (dados.data || dados.items || dados.solicitacoes || []);
            
        totalRegistros = dados.total || dados.count || solicitacoes.length;

        // Fatiamento no frontend caso a API retorne a lista inteira
        if (Array.isArray(dados) && dados.length > queryParams.page_size) {
            const inicio = (queryParams.page - 1) * queryParams.page_size;
            const fim = inicio + queryParams.page_size;
            solicitacoes = dados.slice(inicio, fim);
        }

        atualizarContador(totalRegistros);
        atualizarControlesPaginacao(totalRegistros);
        renderizarTabela(solicitacoes);

    } catch (error) {
        console.error('Erro ao buscar solicitações filtradas:', error);
        if (tabelaBody) {
            tabelaBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-loading" style="color: var(--error-color, #dc2626);">
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

    if (btnPrev) {
        const desabilitado = queryParams.page <= 1;
        btnPrev.disabled = desabilitado;
        btnPrev.style.opacity = desabilitado ? "0.4" : "1";
        btnPrev.style.cursor = desabilitado ? "not-allowed" : "pointer";
    }

    if (btnNext) {
        const desabilitado = queryParams.page >= totalPaginas;
        btnNext.disabled = desabilitado;
        btnNext.style.opacity = desabilitado ? "0.4" : "1";
        btnNext.style.cursor = desabilitado ? "not-allowed" : "pointer";
    }
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

    const statusMap = {
        'PENDING': { text: 'Pendente', badgeClass: 'badge-pending' },
        'IN_REVIEW': { text: 'Em Análise', badgeClass: 'badge-in-review' },
        'APPROVED': { text: 'Aprovada', badgeClass: 'badge-approved' },
        'REJECTED': { text: 'Rejeitada', badgeClass: 'badge-rejected' },
        'CANCELED': { text: 'Cancelada', badgeClass: 'badge-canceled' }
    };

    tabelaBody.innerHTML = lista.map(item => {
        const id = item.id || item._id;
        const dataRaw = item.createdAt || item.created_at || item.submission_date || item.dataEnvio;
        const dataFormatada = dataRaw 
            ? new Date(dataRaw).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) 
            : '---';

        const rawStatus = (item.status || 'PENDING').toUpperCase();
        const statusInfo = statusMap[rawStatus] || { text: rawStatus, badgeClass: 'badge-pending' };

        const typeId = item.activity_type_id || item.activityTypeId || item.activity_type?.id || item.activityType?.id;

        const tipoAtividade = 
            (typeId && mapaTiposAtividade[typeId]) ||
            item.activity_type?.name || 
            item.activityType?.name || 
            item.activity_type_name || 
            item.tipoAtividade || 
            (typeof item.activity_type === 'string' ? item.activity_type : null) ||
            'Atividade';

        const descricao = item.description || item.descricao || 'Sem descrição';
        const horas = item.requested_hours || item.hours || item.horas || 0;

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-primary);">${tipoAtividade}</td>
                <td style="color: var(--text-secondary); max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${descricao}">
                    ${descricao}
                </td>
                <td style="color: var(--text-secondary);">${dataFormatada}</td>
                <td style="font-weight: 700; color: var(--text-primary);">${horas}h</td>
                <td>
                    <span class="status-badge ${statusInfo.badgeClass}">
                        • ${statusInfo.text}
                    </span>
                </td>
                <td style="text-align: center;">
                    <!-- Clique do olho leva para a página de Detalhes enviando o ID -->
                    <a href="detalhes-solicitacao.html?id=${id}" title="Ver Detalhes da Solicitação" style="color: var(--brand-blue, #0284c7); font-weight: 600;">
                        <i data-lucide="eye" style="width: 18px; height: 18px;"></i>
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