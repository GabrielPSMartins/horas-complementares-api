import { protegerRota } from '../../auth.js';
import { 
    obterSolicitacoesCoordenador, 
    obterTiposAtividades, 
    obterHistoricoSolicitacao, 
    obterRelatorioCoordenador 
} from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';

document.addEventListener('DOMContentLoaded', () => {
    carregarDadosPerfilCoordenador();
});


// Estado global da página
let todasSolicitacoes = [];
let solicitacoesFiltradas = [];
let paginaAtual = 1;
const itensPorPagina = 4;
let mapaTiposAtividade = new Map();
let mapaResponsaveisIds = new Map(); // Mapeia id_solicitacao -> changed_by_id

let idCoordenadorLogado = null;
let nomeCoordenadorLogado = '';

// Filtros ativos
let filtroBusca = '';
let filtroStatus = 'todos';
let filtroAtividade = 'todos';
let filtroSemestre = 'todos';

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();
    garantirOpcaoEmAnaliseNoSelect();
    configurarEventosFiltros();
    configurarEventosPaginacao();
    await carregarDados();
});

function garantirOpcaoEmAnaliseNoSelect() {
    const selectStatus = document.getElementById('select-status');
    if (selectStatus) {
        const jaExiste = Array.from(selectStatus.options).some(opt => opt.value.toUpperCase() === 'IN_REVIEW');
        if (!jaExiste) {
            const opt = document.createElement('option');
            opt.value = 'IN_REVIEW';
            opt.textContent = 'Em Análise';
            selectStatus.appendChild(opt);
        }
    }
}

function configurarEventosFiltros() {
    const inputSearch = document.getElementById('input-search-aluno');
    if (inputSearch) {
        inputSearch.addEventListener('input', (e) => {
            filtroBusca = e.target.value.trim().toLowerCase();
            aplicarFiltrosEAtualizar();
        });
    }

    const selectStatus = document.getElementById('select-status');
    if (selectStatus) {
        selectStatus.addEventListener('change', (e) => {
            filtroStatus = e.target.value;
            aplicarFiltrosEAtualizar();
        });
    }

    const selectAtividade = document.getElementById('select-atividade');
    if (selectAtividade) {
        selectAtividade.addEventListener('change', (e) => {
            filtroAtividade = e.target.value;
            aplicarFiltrosEAtualizar();
        });
    }

    const botoesSemestre = document.querySelectorAll('.btn-semester');
    botoesSemestre.forEach(btn => {
        btn.addEventListener('click', (e) => {
            botoesSemestre.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            filtroSemestre = e.currentTarget.getAttribute('data-semestre') || 'todos';
            aplicarFiltrosEAtualizar();
        });
    });
}

function configurarEventosPaginacao() {
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (paginaAtual > 1) {
                paginaAtual--;
                renderizarTabela();
            }
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const totalPaginas = Math.ceil(solicitacoesFiltradas.length / itensPorPagina) || 1;
            if (paginaAtual < totalPaginas) {
                paginaAtual++;
                renderizarTabela();
            }
        });
    }
}

async function carregarDadosCoordenador() {
    try {
        const relatorio = await obterRelatorioCoordenador();
        if (relatorio) {
            idCoordenadorLogado = relatorio.coordinator_id || relatorio.id || relatorio.user_id;
            nomeCoordenadorLogado = relatorio.coordinator_name || relatorio.name || relatorio.full_name || '';
        }
    } catch (e) {
        console.warn("Não foi possível obter dados do relatório do coordenador:", e);
    }
}

async function carregarDados() {
    const tbody = document.getElementById('tbody-solicitacoes');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 32px 20px; color: #64748b;">
                    Carregando solicitações...
                </td>
            </tr>
        `;
    }

    try {
        await Promise.all([
            carregarDadosCoordenador(),
            carregarOpcoesAtividades()
        ]);

        const resData = await obterSolicitacoesCoordenador({ limit: 200 });
        todasSolicitacoes = Array.isArray(resData) ? resData : (resData?.items || resData?.data || []);

        await carregarHistoricoResponsaveis();

        aplicarFiltrosEAtualizar();
    } catch (err) {
        console.error("Erro ao carregar dados das solicitações:", err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: #ef4444; padding: 32px 20px;">
                        Erro ao carregar as solicitações.
                    </td>
                </tr>
            `;
        }
    }
}

async function carregarHistoricoResponsaveis() {
    mapaResponsaveisIds.clear();

    const emAnaliseOuConcluidos = todasSolicitacoes.filter(item => 
        item.status && item.status.toUpperCase() !== 'PENDING'
    );

    const promessas = emAnaliseOuConcluidos.map(async (item) => {
        try {
            const resHist = await obterHistoricoSolicitacao(item.id);
            const historico = Array.isArray(resHist) ? resHist : (resHist?.items || resHist?.data || []);

            // Busca o evento no histórico que alterou o status para IN_REVIEW, APPROVED ou REJECTED
            const eventoAssumiu = historico.find(h => 
                h.new_status === 'IN_REVIEW' || h.new_status === 'APPROVED' || h.new_status === 'REJECTED'
            );

            if (eventoAssumiu && eventoAssumiu.changed_by_id) {
                mapaResponsaveisIds.set(String(item.id), eventoAssumiu.changed_by_id);
            }
        } catch (e) {
            console.warn(`Erro ao carregar histórico da solicitação ${item.id}:`, e);
        }
    });

    await Promise.all(promessas);
}

async function carregarOpcoesAtividades() {
    try {
        const tiposData = await obterTiposAtividades();
        const lista = Array.isArray(tiposData) ? tiposData : (tiposData?.items || tiposData?.data || []);
        
        const selectAtividade = document.getElementById('select-atividade');
        mapaTiposAtividade.clear();

        lista.forEach(tipo => {
            const idStr = String(tipo.id);
            const nomeStr = tipo.name || tipo.nome || tipo.title || 'Sem título';
            mapaTiposAtividade.set(idStr, nomeStr);

            if (selectAtividade) {
                const opt = document.createElement('option');
                opt.value = idStr;
                opt.textContent = nomeStr;
                selectAtividade.appendChild(opt);
            }
        });
    } catch (err) {
        console.error("Erro ao carregar tipos de atividades:", err);
    }
}

function aplicarFiltrosEAtualizar() {
    solicitacoesFiltradas = todasSolicitacoes.filter(item => {
        const alunoNome = (item.student_name || '').toLowerCase();
        const alunoRga = (item.student_registration_number || '').toLowerCase();
        const tituloDesc = (item.title || item.description || '').toLowerCase();
        
        const passaBusca = !filtroBusca 
            || alunoNome.includes(filtroBusca) 
            || alunoRga.includes(filtroBusca)
            || tituloDesc.includes(filtroBusca);

        const statusItem = (item.status || 'PENDING').toUpperCase();
        const passaStatus = filtroStatus === 'todos' || statusItem === filtroStatus.toUpperCase();

        const tipoIdItem = String(item.activity_type_id || '');
        const passaAtividade = filtroAtividade === 'todos' || tipoIdItem === filtroAtividade;

        const semestreItem = String(item.student_semester ?? '');
        const passaSemestre = filtroSemestre === 'todos' || semestreItem === filtroSemestre;

        return passaBusca && passaStatus && passaAtividade && passaSemestre;
    });

    paginaAtual = 1;
    renderizarTabela();
}

function renderizarTabela() {
    const tbody = document.getElementById('tbody-solicitacoes');
    const paginationInfo = document.getElementById('pagination-info');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    if (!tbody) return;

    const totalItens = solicitacoesFiltradas.length;
    const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

    if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;
    if (paginaAtual < 1) paginaAtual = 1;

    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const itensPagina = solicitacoesFiltradas.slice(inicio, fim);

    if (totalItens === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 32px 20px; color: #64748b;">
                    Nenhuma solicitação encontrada.
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = '';
        itensPagina.forEach(item => {
            const htmlRow = criarLinhaTabela(item);
            tbody.insertAdjacentHTML('beforeend', htmlRow);
        });
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    if (paginationInfo) {
        paginationInfo.innerText = `${totalItens} solicitação(ões) · Pág. ${paginaAtual}/${totalPaginas}`;
    }

    if (btnPrev) {
        const desabilitarPrev = paginaAtual <= 1;
        btnPrev.disabled = desabilitarPrev;
        btnPrev.style.opacity = desabilitarPrev ? '0.4' : '1';
        btnPrev.style.cursor = desabilitarPrev ? 'not-allowed' : 'pointer';
    }

    if (btnNext) {
        const desabilitarNext = paginaAtual >= totalPaginas;
        btnNext.disabled = desabilitarNext;
        btnNext.style.opacity = desabilitarNext ? '0.4' : '1';
        btnNext.style.cursor = desabilitarNext ? 'not-allowed' : 'pointer';
    }
}

function criarLinhaTabela(item) {
    const nomeAluno = item.student_name || 'Aluno Desconhecido';
    const rgaAluno = item.student_registration_number || '';
    const tituloSolicitacao = item.title || item.description || 'Sem título';

    // Formata o semestre do aluno (ex: "8º sem.")
    const semestreTexto = item.student_semester ? `${item.student_semester}º sem.` : '';

    const typeId = String(item.activity_type_id || '');
    const nomeAtividade = mapaTiposAtividade.get(typeId) || 'Outros';

    const horas = item.requested_hours ?? 0;
    const dataEnvio = formatarData(item.created_at);
    const statusObj = formatarStatusBadge(item.status);

    const idStr = String(item.id);
    const statusUpper = (item.status || 'PENDING').toUpperCase();

    let responsavel = '-';
    if (statusUpper !== 'PENDING') {
        responsavel = item.reviewed_by_name || nomeCoordenadorLogado || 'Coordenador';
    }

    return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <span style="font-weight: 600; color: var(--text-primary); font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${nomeAluno}
                    </span>
                    ${semestreTexto ? `
                        <span style="display: inline-flex; align-items: center; background-color: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 0.6875rem; font-weight: 700; padding: 1px 8px; border-radius: 9999px; white-space: nowrap; flex-shrink: 0;">
                            ${semestreTexto}
                        </span>
                    ` : ''}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${tituloSolicitacao}">
                    ${rgaAluno ? `${rgaAluno} · ` : ''}${tituloSolicitacao}
                </div>
            </td>
            <td style="padding: 12px 8px; color: var(--text-primary); font-size: 0.875rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${nomeAtividade}
            </td>
            <td style="padding: 12px 8px; font-weight: 700; color: var(--text-primary); font-size: 0.875rem;">
                ${horas}h
            </td>
            <td style="padding: 12px 8px; color: var(--text-secondary); font-size: 0.875rem; white-space: nowrap;">
                ${dataEnvio}
            </td>
            <td style="padding: 12px 8px; white-space: nowrap;">
                <span class="status-badge ${statusObj.classe}" style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
                    <span>•</span><span>${statusObj.texto}</span>
                </span>
            </td>
            <td style="padding: 12px 8px; color: var(--text-secondary); font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${responsavel}">
                ${responsavel}
            </td>
            <td style="padding: 12px 8px; text-align: right;">
                <a href="detalhes-solicitacao-aluno.html?id=${idStr}" title="Ver Detalhes" style="color: #2563eb; display: inline-flex; align-items: center; justify-content: center;">
                    <i data-lucide="eye" style="width: 18px; height: 18px;"></i>
                </a>
            </td>
        </tr>
    `;
}

function formatarStatusBadge(statusRaw) {
    const st = (statusRaw || 'PENDING').toUpperCase();
    switch (st) {
        case 'APPROVED':
            return { texto: 'Aprovada', classe: 'badge-approved' };
        case 'REJECTED':
            return { texto: 'Rejeitada', classe: 'badge-rejected' };
        case 'IN_REVIEW':
            return { texto: 'Em Análise', classe: 'badge-pending' };
        case 'CANCELED':
            return { texto: 'Cancelada', classe: 'badge-canceled' };
        case 'PENDING':
        default:
            return { texto: 'Pendente', classe: 'badge-pending' };
    }
}

function formatarData(dataStr) {
    if (!dataStr) return '-';
    try {
        const d = new Date(dataStr);
        if (isNaN(d.getTime())) return dataStr;
        return d.toLocaleDateString('pt-BR');
    } catch {
        return dataStr;
    }
}