import { protegerRota } from '../../auth.js';
import {
    obterTodasSolicitacoesCoordenador,
    obterTodosAlunosCoordenador,
    obterRelatorioAlunoPorId,
    exportarRelatorioPdfAlunoPorId
} from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';
import { escapeHtml } from '../../utils/html.js';
import { STATUS, formatarData, obterMapaTiposAtividade } from '../../utils/solicitacao.js';

let chartTipoInstance = null;
let chartDistribuicaoInstance = null;

/** @type {import('../../utils/solicitacao.js').SolicitacaoCoordenador[]} */
let todasSolicitacoesGlobal = [];
let todosAlunosGlobal = [];
let mapaTiposGlobal = new Map();
let alunoSelecionadoId = null;
let filtroSemestreAtivo = 'todos';
let filtroStatusHistoricoAtivo = 'todos';

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();
    carregarDadosPerfilCoordenador();

    // Aluno pré-selecionado vindo da tela "Alunos" (?student_id=...)
    alunoSelecionadoId = new URLSearchParams(window.location.search).get('student_id');

    configurarFiltrosSemestre();
    configurarEventoSelectAluno();
    configurarEventoExportarPDF();

    await carregarDadosIniciais();

    if (window.lucide) {
        window.lucide.createIcons();
    }
});

function configurarFiltrosSemestre() {
    const botoes = document.querySelectorAll('.btn-semester');
    botoes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.disabled) return;

            botoes.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            filtroSemestreAtivo = e.currentTarget.getAttribute('data-semestre') || 'todos';
            preencherSelectAlunos();
        });
    });
}

function configurarEventoSelectAluno() {
    const select = document.getElementById('select-aluno-relatorio');
    if (!select) return;

    select.addEventListener('change', (e) => {
        alunoSelecionadoId = e.target.value;
        if (alunoSelecionadoId) {
            carregarRelatorioAluno(alunoSelecionadoId);
        } else {
            ocultarRelatorio();
        }
    });
}

// Ação para abrir o PDF em nova aba para visualização
function configurarEventoExportarPDF() {
    const btnPdf = document.getElementById('btn-exportar-pdf');
    if (!btnPdf) return;

    btnPdf.addEventListener('click', async () => {
        if (!alunoSelecionadoId) {
            alert('Por favor, selecione um aluno para visualizar o relatório.');
            return;
        }

        const textoOriginal = btnPdf.innerHTML;
        btnPdf.innerHTML = `<span>Gerando PDF...</span>`;
        btnPdf.disabled = true;

        try {
            await exportarRelatorioPdfAlunoPorId(alunoSelecionadoId);
        } catch (err) {
            console.error('Erro ao visualizar PDF:', err);
            alert(err.message || 'Erro ao gerar o PDF para visualização.');
        } finally {
            btnPdf.innerHTML = textoOriginal;
            btnPdf.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
    });
}

async function carregarDadosIniciais() {
    try {
        const [solicitacoes, alunos, mapaTipos] = await Promise.all([
            obterTodasSolicitacoesCoordenador(),
            obterTodosAlunosCoordenador(),
            obterMapaTiposAtividade()
        ]);
        mapaTiposGlobal = mapaTipos;
        todasSolicitacoesGlobal = solicitacoes;

        extrairListaUnicaAlunos(alunos);
        atualizarBotoesSemestreDisponiveis();
        preencherSelectAlunos();

        if (alunoSelecionadoId) {
            const select = document.getElementById('select-aluno-relatorio');
            if (select) select.value = alunoSelecionadoId;
            await carregarRelatorioAluno(alunoSelecionadoId);
        } else {
            ocultarRelatorio();
        }

    } catch (err) {
        console.error("Erro ao carregar dados iniciais dos relatórios:", err);
    }
}

// Monta a lista de alunos do curso a partir de GET /students (inclui alunos sem solicitações)
function extrairListaUnicaAlunos(alunos) {
    todosAlunosGlobal = alunos.map(aluno => ({
        id: String(aluno.id),
        name: aluno.name,
        rga: aluno.registration_number,
        semester: String(aluno.current_semester)
    }));
}

function atualizarBotoesSemestreDisponiveis() {
    const semestresComAlunos = new Set(todosAlunosGlobal.map(a => a.semester));
    const botoes = document.querySelectorAll('.btn-semester');

    botoes.forEach(btn => {
        const semAttr = btn.getAttribute('data-semestre');
        if (semAttr === 'todos') {
            btn.disabled = false;
        } else {
            const existe = semestresComAlunos.has(semAttr);
            btn.disabled = !existe;
            if (!existe) btn.title = "Nenhum aluno cadastrado neste semestre";
        }
    });
}

function preencherSelectAlunos() {
    const select = document.getElementById('select-aluno-relatorio');
    if (!select) return;

    select.innerHTML = '<option value="">-- Selecione um aluno --</option>';

    let alunosFiltrados = todosAlunosGlobal;
    if (filtroSemestreAtivo !== 'todos') {
        alunosFiltrados = todosAlunosGlobal.filter(a => String(a.semester) === String(filtroSemestreAtivo));
    }

    if (alunosFiltrados.length === 0) {
        select.innerHTML = '<option value="">Nenhum aluno para este semestre</option>';
        ocultarRelatorio();
        return;
    }

    alunosFiltrados.forEach(aluno => {
        const opt = document.createElement('option');
        opt.value = aluno.id;
        const rgaTexto = aluno.rga ? ` — ${aluno.rga}` : '';
        const semTexto = aluno.semester ? ` (${aluno.semester}º sem.)` : '';
        opt.textContent = `${aluno.name}${rgaTexto}${semTexto}`;
        select.appendChild(opt);
    });

    if (alunoSelecionadoId && alunosFiltrados.some(a => a.id === alunoSelecionadoId)) {
        select.value = alunoSelecionadoId;
        carregarRelatorioAluno(alunoSelecionadoId);
    } else {
        select.value = "";
        ocultarRelatorio();
    }
}

function ocultarRelatorio() {
    alunoSelecionadoId = null;
    const containerConteudo = document.getElementById('container-relatorio-conteudo');
    const containerSemAluno = document.getElementById('container-sem-aluno');
    const btnPdf = document.getElementById('btn-exportar-pdf');

    if (containerConteudo) containerConteudo.style.display = 'none';
    if (containerSemAluno) containerSemAluno.style.display = 'block';
    if (btnPdf) btnPdf.style.display = 'none';
}

function exibirRelatorio() {
    const containerConteudo = document.getElementById('container-relatorio-conteudo');
    const containerSemAluno = document.getElementById('container-sem-aluno');
    const btnPdf = document.getElementById('btn-exportar-pdf');

    if (containerConteudo) containerConteudo.style.display = 'flex';
    if (containerSemAluno) containerSemAluno.style.display = 'none';
    if (btnPdf) {
        btnPdf.style.display = 'inline-flex';
        if (window.lucide) window.lucide.createIcons();
    }
}

async function carregarRelatorioAluno(studentId) {
    if (!studentId) {
        ocultarRelatorio();
        return;
    }

    const solicitacoesAluno = todasSolicitacoesGlobal.filter(s => s.student_id === studentId);

    let relatorio;
    try {
        relatorio = await obterRelatorioAlunoPorId(studentId);
    } catch (e) {
        console.error('Erro ao carregar o relatório do aluno:', e);
        alert(e.message || 'Não foi possível carregar o relatório do aluno.');
        return;
    }

    exibirRelatorio();
    renderizarBannerAluno(relatorio);
    renderizarGraficosAluno(relatorio.summary.approved_hours_by_type);
    renderizarListaSolicitacoesAluno(solicitacoesAluno);
}

// Banner, horas e contagem por status a partir de GET /students/{id}/report (ActivityReportResponse)
function renderizarBannerAluno({ student, course, summary }) {
    document.getElementById('relatorio-nome-aluno').textContent = student.name;
    document.getElementById('relatorio-semestre-badge').textContent = `${student.current_semester}º semestre`;
    document.getElementById('relatorio-info-curso').textContent = `${course.name} · Mat. ${student.registration_number}`;
    document.getElementById('relatorio-avatar').textContent = student.name.charAt(0).toUpperCase();

    const porcentagem = Math.min(100, Math.round(summary.progress_percentage));

    document.getElementById('relatorio-horas-exigidas').textContent = `${summary.total_required_hours}h`;
    document.getElementById('relatorio-horas-aprovadas').textContent = `${summary.total_approved_hours}h`;
    document.getElementById('relatorio-horas-restantes').textContent = `${summary.remaining_hours}h`;
    document.getElementById('relatorio-progresso-porcentagem').textContent = `${porcentagem}%`;
    document.getElementById('relatorio-progresso-bar').style.width = `${porcentagem}%`;

    const porStatus = summary.requests_by_status;
    document.getElementById('count-pendente').textContent = porStatus.PENDING + porStatus.IN_REVIEW;
    document.getElementById('count-aprovada').textContent = porStatus.APPROVED;
    document.getElementById('count-rejeitada').textContent = porStatus.REJECTED;
    document.getElementById('count-cancelada').textContent = porStatus.CANCELED;
}

function renderizarGraficosAluno(horasPorTipo) {
    const ctxTipo = document.getElementById('chartHorasPorTipo')?.getContext('2d');
    const ctxDist = document.getElementById('chartDistribuicao')?.getContext('2d');

    const labels = horasPorTipo.map(item => item.activity_type_name);
    const dataValues = horasPorTipo.map(item => item.approved_hours);

    const cores = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

    if (ctxTipo) {
        if (chartTipoInstance) chartTipoInstance.destroy();

        chartTipoInstance = new Chart(ctxTipo, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sem horas aprovadas'],
                datasets: [{
                    label: 'Horas Aprovadas',
                    data: dataValues.length ? dataValues : [0],
                    backgroundColor: labels.length ? cores.slice(0, labels.length) : ['#e2e8f0'],
                    borderRadius: 6,
                    barPercentage: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 20 } },
                    x: { ticks: { font: { size: 11 } } }
                }
            }
        });
    }

    if (ctxDist) {
        if (chartDistribuicaoInstance) chartDistribuicaoInstance.destroy();

        const labelsLegenda = labels.map((l, i) => `${l}: ${dataValues[i]}h`);

        chartDistribuicaoInstance = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: labelsLegenda.length ? labelsLegenda : ['Sem dados'],
                datasets: [{
                    data: dataValues.length ? dataValues : [1],
                    backgroundColor: dataValues.length ? cores.slice(0, labels.length) : ['#e2e8f0']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 12, weight: '600' }, boxWidth: 12 }
                    }
                }
            }
        });
    }
}

function renderizarListaSolicitacoesAluno(solicitacoes) {
    const container = document.getElementById('container-lista-solicitacoes');
    const elTitulo = document.getElementById('titulo-lista-solicitacoes');

    const solicitacoesFiltradas = filtroStatusHistoricoAtivo === 'todos'
        ? solicitacoes
        : solicitacoes.filter(item => item.status === filtroStatusHistoricoAtivo);

    const filtros = [['todos', 'Todas'], ...['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'IN_REVIEW'].map(st => [st, STATUS[st].label])];

    elTitulo.innerHTML = `
        <div class="relatorio-lista-cabecalho">
            <span class="relatorio-lista-titulo">Todas as solicitações (${solicitacoesFiltradas.length})</span>
            <div class="relatorio-filtros">
                ${filtros.map(([valor, rotulo]) => `
                    <button class="btn-filtro-historico ${filtroStatusHistoricoAtivo === valor ? 'active' : ''}" data-status="${valor}">${rotulo}</button>
                `).join('')}
            </div>
        </div>
    `;

    elTitulo.querySelectorAll('.btn-filtro-historico').forEach(btn => {
        btn.addEventListener('click', (e) => {
            filtroStatusHistoricoAtivo = e.currentTarget.getAttribute('data-status');
            renderizarListaSolicitacoesAluno(solicitacoes);
        });
    });

    if (solicitacoesFiltradas.length === 0) {
        container.innerHTML = '<p class="tabela-mensagem">Nenhuma solicitação encontrada para este filtro.</p>';
        return;
    }

    container.innerHTML = solicitacoesFiltradas.map(item => {
        const status = STATUS[item.status];
        const nomeTipo = mapaTiposGlobal.get(item.activity_type_id) ?? 'Atividade Complementar';

        return `
            <div class="historico-solicitacao-item">
                <div class="historico-solicitacao-topo">
                    <div class="historico-solicitacao-tipo">
                        <strong>${escapeHtml(nomeTipo)}</strong>
                        <span class="badge-pill ${status.pill}">
                            <span class="dot"></span>
                            <span>${escapeHtml(status.label)}</span>
                        </span>
                    </div>
                    <div class="historico-solicitacao-horas">
                        <span>${escapeHtml(item.requested_hours)}h sol.</span>
                        ${item.status === 'APPROVED' ? `<span class="horas-aprovadas">${escapeHtml(item.accepted_hours)}h apr.</span>` : ''}
                    </div>
                </div>
                <p class="historico-solicitacao-titulo">${escapeHtml(item.title)}</p>
                <span class="historico-solicitacao-data">${escapeHtml(formatarData(item.created_at))}</span>
                ${item.status === 'REJECTED' ? `<div class="caixa-motivo-rejeicao">${escapeHtml(item.rejection_reason)}</div>` : ''}
            </div>
        `;
    }).join('');
}
