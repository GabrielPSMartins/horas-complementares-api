import { protegerRota } from '../../auth.js';
import { obterTodasSolicitacoesCoordenador, obterTodosAlunosCoordenador } from '../../api.js';
import { escapeHtml } from '../../utils/html.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';
import { obterMapaTiposAtividade } from '../../utils/solicitacao.js';

let chartStatusInstance = null;
let chartCategoriasInstance = null;

// Dados carregados uma única vez; os filtros de semestre trabalham sobre eles
/** @type {import('../../utils/solicitacao.js').SolicitacaoCoordenador[]} */
let todasSolicitacoes = [];
let todosAlunos = [];
let mapaTipos = new Map();

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();
    carregarDadosPerfilCoordenador();
    configurarFiltrosSemestre();

    try {
        [todasSolicitacoes, todosAlunos, mapaTipos] = await Promise.all([
            obterTodasSolicitacoesCoordenador(),
            obterTodosAlunosCoordenador(),
            obterMapaTiposAtividade()
        ]);
    } catch (erro) {
        console.error('Erro ao carregar o dashboard:', erro);
        document.getElementById('lista-aguardam-analise').innerHTML = '<p class="lista-vazia tabela-mensagem--erro">Erro ao carregar dados.</p>';
        return;
    }

    atualizarBotoesSemestreDisponiveis();
    atualizarDashboard('todos');
});

function configurarFiltrosSemestre() {
    const botoes = document.querySelectorAll('.btn-semester');

    botoes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.disabled) return;

            botoes.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            atualizarDashboard(e.currentTarget.getAttribute('data-semestre'));
        });
    });
}

// Desabilita os semestres sem alunos e sem solicitações
function atualizarBotoesSemestreDisponiveis() {
    const semestresComDados = new Set([
        ...todasSolicitacoes.map(item => String(item.student_semester)),
        ...todosAlunos.map(aluno => String(aluno.current_semester))
    ]);

    document.querySelectorAll('.btn-semester').forEach(btn => {
        const semestre = btn.getAttribute('data-semestre');
        if (semestre === 'todos') return;

        btn.disabled = !semestresComDados.has(semestre);
        btn.title = btn.disabled ? 'Nenhuma solicitação encontrada para este semestre' : '';
    });
}

function atualizarDashboard(semestre) {
    const doSemestre = semestre === 'todos'
        ? { solicitacoes: todasSolicitacoes, alunos: todosAlunos }
        : {
            solicitacoes: todasSolicitacoes.filter(item => String(item.student_semester) === semestre),
            alunos: todosAlunos.filter(aluno => String(aluno.current_semester) === semestre)
        };

    const porStatus = contarPorStatus(doSemestre.solicitacoes);

    renderizarCardsMetricas(doSemestre.solicitacoes.length, porStatus, doSemestre.alunos);
    renderizarGraficoStatus(porStatus);
    renderizarSolicitacoesPendentes(doSemestre.solicitacoes);
    renderizarProgressoAlunos(doSemestre.alunos);
    renderizarGraficoCategorias(doSemestre.solicitacoes);
}

function contarPorStatus(solicitacoes) {
    const contagem = { PENDING: 0, IN_REVIEW: 0, APPROVED: 0, REJECTED: 0, CANCELED: 0 };
    solicitacoes.forEach(item => contagem[item.status]++);
    return contagem;
}

function renderizarCardsMetricas(total, porStatus, alunos) {
    const concluidos = alunos.filter(aluno => aluno.progress_percentage >= 100).length;

    document.getElementById('total-solicitacoes').textContent = total;
    document.getElementById('total-pendentes').textContent = porStatus.PENDING;
    document.getElementById('total-aprovadas').textContent = porStatus.APPROVED;
    document.getElementById('total-alunos').textContent = alunos.length;
    document.getElementById('sub-alunos').textContent = `${concluidos} concluíram`;
    document.getElementById('banner-pending-count').textContent = `${porStatus.PENDING} pendente(s)`;
}

function renderizarGraficoStatus(porStatus) {
    const ctxStatus = document.getElementById('chartStatus')?.getContext('2d');
    if (!ctxStatus) return;

    if (chartStatusInstance) chartStatusInstance.destroy();

    chartStatusInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Pendentes', 'Aprovadas', 'Rejeitadas', 'Canceladas'],
            datasets: [{
                data: [porStatus.PENDING, porStatus.APPROVED, porStatus.REJECTED, porStatus.CANCELED],
                backgroundColor: ['#f59e0b', '#10b981', '#ef4444', '#64748b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

function renderizarSolicitacoesPendentes(solicitacoes) {
    const container = document.getElementById('lista-aguardam-analise');
    const pendentes = solicitacoes.filter(item => item.status === 'PENDING');

    document.getElementById('titulo-pendentes').textContent = `Aguardam análise (${pendentes.length})`;

    if (pendentes.length === 0) {
        container.innerHTML = '<p class="lista-vazia">Nenhuma solicitação pendente para este semestre.</p>';
        return;
    }

    container.innerHTML = pendentes.slice(0, 6).map(item => `
        <div class="lista-item">
            <div class="lista-item-info">
                <div class="avatar-inicial">${escapeHtml(item.student_name.charAt(0).toUpperCase())}</div>
                <div>
                    <div class="lista-item-titulo">
                        <strong>${escapeHtml(item.student_name)}</strong>
                        <span class="badge-semestre">${escapeHtml(item.student_semester)}º sem.</span>
                    </div>
                    <p class="lista-item-sub">${escapeHtml(mapaTipos.get(item.activity_type_id) ?? 'Tipo não identificado')} · ${escapeHtml(item.requested_hours)}h</p>
                </div>
            </div>
            <a href="detalhes-solicitacao-aluno.html?id=${encodeURIComponent(item.id)}" class="btn-analys">Analisar</a>
        </div>
    `).join('');
}

// Progresso calculado pela API (GET /students): horas aceitas e limite do curso
function renderizarProgressoAlunos(alunos) {
    const container = document.getElementById('lista-progresso-alunos');

    if (alunos.length === 0) {
        container.innerHTML = '<p class="lista-vazia">Nenhum aluno encontrado para este semestre.</p>';
        return;
    }

    container.innerHTML = alunos.slice(0, 6).map(aluno => {
        const percentual = Math.min(Math.round(aluno.progress_percentage), 100);
        let faixa = '';
        let badge = 'badge-formacao';

        if (percentual >= 100) {
            faixa = 'concluido';
            badge = 'badge-approved';
        } else if (percentual < 30) {
            faixa = 'baixo';
            badge = 'badge-pending';
        }

        return `
            <div class="lista-item">
                <div class="lista-item-info">
                    <div class="avatar-inicial">${escapeHtml(aluno.name.charAt(0).toUpperCase())}</div>
                    <div class="lista-item-progresso">
                        <div class="lista-item-titulo">
                            <strong>${escapeHtml(aluno.name)}</strong>
                            <span class="badge-semestre">${escapeHtml(aluno.current_semester)}º sem.</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill ${faixa}" style="width: ${percentual}%;"></div>
                        </div>
                    </div>
                </div>
                <div class="lista-item-horas">
                    <span class="stat-sub">${escapeHtml(aluno.total_approved_hours)}/${escapeHtml(aluno.total_required_hours)}h</span>
                    <span class="status-badge ${badge}">${percentual}%</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarGraficoCategorias(solicitacoes) {
    const ctxCat = document.getElementById('chartCategorias')?.getContext('2d');
    if (!ctxCat) return;

    const porTipo = {};
    solicitacoes.forEach(item => {
        const nome = mapaTipos.get(item.activity_type_id) ?? 'Não identificado';
        porTipo[nome] = (porTipo[nome] ?? 0) + 1;
    });

    const labels = Object.keys(porTipo);
    const valores = Object.values(porTipo);

    if (chartCategoriasInstance) chartCategoriasInstance.destroy();

    chartCategoriasInstance = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Sem dados'],
            datasets: [{
                label: 'Solicitações',
                data: valores.length ? valores : [0],
                backgroundColor: '#2563eb',
                borderRadius: 4,
                barPercentage: 0.5
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } },
                y: { ticks: { autoSkip: false, font: { size: 11 } } }
            }
        }
    });
}
