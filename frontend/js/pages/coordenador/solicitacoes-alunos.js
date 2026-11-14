import { protegerRota } from '../../auth.js';
import { obterTodasSolicitacoesCoordenador } from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';
import { escapeHtml } from '../../utils/html.js';
import { STATUS, formatarData, obterMapaTiposAtividade } from '../../utils/solicitacao.js';

// Estado global da página
/** @type {import('../../utils/solicitacao.js').SolicitacaoCoordenador[]} */
let todasSolicitacoes = [];
let solicitacoesFiltradas = [];
let paginaAtual = 1;
const itensPorPagina = 4;
let mapaTiposAtividade = new Map();

// Filtros ativos
let filtroBusca = '';
let filtroStatus = 'todos';
let filtroAtividade = 'todos';
let filtroSemestre = 'todos';

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();
    carregarDadosPerfilCoordenador();
    configurarEventosFiltros();
    configurarEventosPaginacao();
    await carregarDados();
});

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
            if (e.currentTarget.disabled) return;

            botoesSemestre.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            filtroSemestre = e.currentTarget.getAttribute('data-semestre') || 'todos';
            aplicarFiltrosEAtualizar();
        });
    });
}

function atualizarBotoesSemestreDisponiveis() {
    const semestresDisponiveis = new Set();

    todasSolicitacoes.forEach(item => semestresDisponiveis.add(String(item.student_semester)));

    const botoesSemestre = document.querySelectorAll('.btn-semester');
    botoesSemestre.forEach(btn => {
        const semAttr = btn.getAttribute('data-semestre');
        if (semAttr === 'todos') {
            btn.disabled = false;
        } else {
            const existe = semestresDisponiveis.has(String(semAttr));
            btn.disabled = !existe;
            if (!existe) {
                btn.title = "Nenhuma solicitação encontrada para este semestre";
            } else {
                btn.removeAttribute('title');
            }
        }
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

async function carregarDados() {
    const tbody = document.getElementById('tbody-solicitacoes');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="tabela-mensagem">Carregando solicitações...</td></tr>';
    }

    try {
        await carregarOpcoesAtividades();

        todasSolicitacoes = await obterTodasSolicitacoesCoordenador();

        atualizarBotoesSemestreDisponiveis();

        aplicarFiltrosEAtualizar();
    } catch (err) {
        console.error("Erro ao carregar dados das solicitações:", err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="tabela-mensagem tabela-mensagem--erro">Erro ao carregar as solicitações.</td></tr>';
        }
    }
}

async function carregarOpcoesAtividades() {
    try {
        mapaTiposAtividade = await obterMapaTiposAtividade();
        const selectAtividade = document.getElementById('select-atividade');

        mapaTiposAtividade.forEach((nome, id) => {
            selectAtividade?.add(new Option(nome, id));
        });
    } catch (err) {
        console.error("Erro ao carregar tipos de atividades:", err);
    }
}

function aplicarFiltrosEAtualizar() {
    solicitacoesFiltradas = todasSolicitacoes.filter(item => {
        const passaBusca = !filtroBusca
            || item.student_name.toLowerCase().includes(filtroBusca)
            || item.student_registration_number.toLowerCase().includes(filtroBusca)
            || item.title.toLowerCase().includes(filtroBusca);

        const passaStatus = filtroStatus === 'todos' || item.status === filtroStatus;
        const passaAtividade = filtroAtividade === 'todos' || item.activity_type_id === filtroAtividade;
        const passaSemestre = filtroSemestre === 'todos' || String(item.student_semester) === filtroSemestre;

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
        tbody.innerHTML = '<tr><td colspan="7" class="tabela-mensagem">Nenhuma solicitação encontrada.</td></tr>';
    } else {
        tbody.innerHTML = itensPagina.map(criarLinhaTabela).join('');
        if (window.lucide) window.lucide.createIcons();
    }

    if (paginationInfo) {
        paginationInfo.innerText = `${totalItens} solicitação(ões) · Pág. ${paginaAtual}/${totalPaginas}`;
    }

    if (btnPrev) btnPrev.disabled = paginaAtual <= 1;
    if (btnNext) btnNext.disabled = paginaAtual >= totalPaginas;
}

/** @param {import('../../utils/solicitacao.js').SolicitacaoCoordenador} item */
function criarLinhaTabela(item) {
    const status = STATUS[item.status];
    const nomeAtividade = mapaTiposAtividade.get(item.activity_type_id) ?? 'Outros';
    const responsavel = item.reviewed_by_name ?? item.in_review_by_name ?? '-';

    return `
        <tr>
            <td>
                <div class="aluno-celula">
                    <span class="aluno-celula-nome">${escapeHtml(item.student_name)}</span>
                    <span class="badge-semestre">${escapeHtml(item.student_semester)}º sem.</span>
                </div>
                <div class="aluno-celula-sub" title="${escapeHtml(item.title)}">
                    ${escapeHtml(item.student_registration_number)} · ${escapeHtml(item.title)}
                </div>
            </td>
            <td class="celula-truncada">${escapeHtml(nomeAtividade)}</td>
            <td><strong>${escapeHtml(item.requested_hours)}h</strong></td>
            <td>${escapeHtml(formatarData(item.created_at))}</td>
            <td><span class="status-badge ${status.badge}">• ${escapeHtml(status.label)}</span></td>
            <td class="celula-truncada" title="${escapeHtml(responsavel)}">${escapeHtml(responsavel)}</td>
            <td style="text-align: right;">
                <a href="detalhes-solicitacao-aluno.html?id=${encodeURIComponent(item.id)}" title="Ver Detalhes" class="link-icone">
                    <i data-lucide="eye"></i>
                </a>
            </td>
        </tr>
    `;
}
