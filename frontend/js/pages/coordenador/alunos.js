import { protegerRota } from '../../auth.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';
import { escapeHtml } from '../../utils/html.js';
import { obterPerfilCoordenador, obterTodosAlunosCoordenador } from '../../api.js';

protegerRota();

let listaCompletaAlunos = [];
let semestreSelecionado = 'todos';
let totalSemestresCurso = 8;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Perfil do Coordenador
    await carregarDadosPerfilCoordenador();

    // 2. Carrega e calcula as horas exatas dos alunos
    await carregarAlunos();

    // 3. Campo de busca em tempo real
    const inputBusca = document.getElementById('input-busca-aluno');
    if (inputBusca) {
        inputBusca.addEventListener('input', () => {
            filtrarERenderizarAlunos();
        });
    }
});

async function carregarAlunos() {
    const gridCards = document.getElementById('grid-cards-alunos');
    const tabelaBody = document.getElementById('tabela-alunos-body');

    if (tabelaBody) {
        tabelaBody.innerHTML = '<tr><td colspan="6" class="tabela-mensagem">Carregando alunos...</td></tr>';
    }
    if (gridCards) {
        gridCards.innerHTML = '<div class="tabela-mensagem" style="grid-column: 1 / -1;">Carregando alunos...</div>';
    }

    try {
        // A API já devolve todos os alunos do curso (inclusive os sem solicitações) com o resumo de horas
        const [alunosApi, coordenador] = await Promise.all([
            obterTodosAlunosCoordenador(),
            obterPerfilCoordenador()
        ]);
        listaCompletaAlunos = alunosApi.map(mapearAlunoApi);
        totalSemestresCurso = coordenador.course_total_semesters ?? totalSemestresCurso;

        renderizarBotoesSemestres();
        filtrarERenderizarAlunos();

    } catch (err) {
        console.error('Erro ao carregar dados dos alunos:', err);
        if (tabelaBody) {
            tabelaBody.innerHTML = '<tr><td colspan="6" class="tabela-mensagem tabela-mensagem--erro">Erro ao carregar alunos. Tente novamente.</td></tr>';
        }
    }
}

// Converte o item de GET /students para o formato usado na renderização da tela
function mapearAlunoApi(aluno) {
    return {
        id: String(aluno.id),
        nome: aluno.name,
        matricula: aluno.registration_number,
        email: aluno.email,
        semestre: aluno.current_semester,
        aprovadas: aluno.total_approved_hours,
        exigidas: aluno.total_required_hours,
        porcentagem: Math.round(aluno.progress_percentage),
        pendentesCount: aluno.open_requests
    };
}

// Um card por semestre do curso (Course.total_semesters), com a quantidade de alunos em cada um
function renderizarBotoesSemestres() {
    const container = document.getElementById('filtro-semestres');
    if (!container) return;

    const contagem = new Map();
    listaCompletaAlunos.forEach(aluno => contagem.set(aluno.semestre, (contagem.get(aluno.semestre) ?? 0) + 1));

    let html = '';
    for (let i = 1; i <= totalSemestresCurso; i++) {
        const qtd = contagem.get(i) ?? 0;
        const classes = ['semestre-card'];
        if (String(semestreSelecionado) === String(i)) classes.push('active');
        if (qtd === 0) classes.push('vazio');

        html += `
            <div class="${classes.join(' ')}" data-semestre="${i}">
                <div class="semestre-card-numero">${i}º</div>
                <div class="semestre-card-contagem">${qtd} aluno${qtd === 1 ? '' : 's'}</div>
            </div>
        `;
    }

    container.innerHTML = html;

    container.querySelectorAll('.semestre-card').forEach(card => {
        card.addEventListener('click', () => {
            const sem = card.getAttribute('data-semestre');
            semestreSelecionado = (semestreSelecionado === sem) ? 'todos' : sem;
            renderizarBotoesSemestres();
            filtrarERenderizarAlunos();
        });
    });
}

function filtrarERenderizarAlunos() {
    const termoBusca = document.getElementById('input-busca-aluno')?.value.toLowerCase().trim() || '';

    const alunosFiltrados = listaCompletaAlunos.filter(aluno => {
        const nome = aluno.nome.toLowerCase();
        const matricula = String(aluno.matricula).toLowerCase();
        const semestre = String(aluno.semestre);

        const bateBusca = !termoBusca || nome.includes(termoBusca) || matricula.includes(termoBusca);
        const bateSemestre = semestreSelecionado === 'todos' || semestre === String(semestreSelecionado);

        return bateBusca && bateSemestre;
    });

    const elSubtitulo = document.getElementById('total-cadastrados-subtitle');
    const elContador = document.getElementById('contador-encontrados');
    if (elSubtitulo) elSubtitulo.textContent = `${listaCompletaAlunos.length} alunos cadastrados`;
    if (elContador) elContador.textContent = `${alunosFiltrados.length} encontrado(s)`;

    renderizarGridRetangulos(alunosFiltrados);
    renderizarTabelaInferior(alunosFiltrados);
}

function renderizarGridRetangulos(alunos) {
    const gridContainer = document.getElementById('grid-cards-alunos');
    if (!gridContainer) return;

    if (alunos.length === 0) {
        gridContainer.innerHTML = '<div class="ui-card tabela-mensagem" style="grid-column: 1 / -1;">Nenhum aluno encontrado.</div>';
        return;
    }

    gridContainer.innerHTML = alunos.map(aluno => {
        const concluido = aluno.porcentagem >= 100;
        let badgeStatusHtml = '';

        if (concluido) {
            badgeStatusHtml = '<span class="status-badge badge-approved">✓ Concluído</span>';
        } else if (aluno.pendentesCount > 0) {
            badgeStatusHtml = `<span class="status-badge badge-pending">${escapeHtml(aluno.pendentesCount)} pend.</span>`;
        }

        return `
            <div class="ui-card aluno-card">
                <div class="aluno-card-topo">
                    <div class="flex-align-center" style="gap: 14px;">
                        <div class="avatar-circle large">${escapeHtml(aluno.nome.charAt(0).toUpperCase())}</div>
                        <div>
                            <div class="stat-label aluno-card-nome">${escapeHtml(aluno.nome)}</div>
                            <div class="flex-align-center" style="gap: 8px;">
                                <span class="aluno-card-matricula">${escapeHtml(aluno.matricula)}</span>
                                <span class="status-badge badge-formacao">${escapeHtml(aluno.semestre)}º sem.</span>
                            </div>
                        </div>
                    </div>
                    <div>${badgeStatusHtml}</div>
                </div>

                <div>
                    <div class="flex-between-center">
                        <span class="aluno-progresso-rotulo">Progresso</span>
                        <span class="aluno-progresso-valor ${concluido ? 'concluido' : ''}">
                            ${escapeHtml(aluno.porcentagem)}% · ${escapeHtml(aluno.aprovadas)}/${escapeHtml(aluno.exigidas)}h
                        </span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill ${concluido ? 'concluido' : ''}" style="width: ${Math.min(aluno.porcentagem, 100)}%;"></div>
                    </div>
                </div>

                <div class="aluno-card-rodape">
                    <span class="aluno-card-email">${escapeHtml(aluno.email)}</span>
                    <a href="relatorios.html?student_id=${encodeURIComponent(aluno.id)}" class="btn-export">
                        <i data-lucide="chart-column"></i> Relatório
                    </a>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

function renderizarTabelaInferior(alunos) {
    const tabelaBody = document.getElementById('tabela-alunos-body');
    if (!tabelaBody) return;

    if (alunos.length === 0) {
        tabelaBody.innerHTML = '<tr><td colspan="6" class="tabela-mensagem">Nenhum aluno encontrado.</td></tr>';
        return;
    }

    tabelaBody.innerHTML = alunos.map(aluno => {
        const concluido = aluno.porcentagem >= 100;

        return `
            <tr>
                <td>
                    <div class="flex-align-center" style="gap: 14px;">
                        <div class="avatar-circle small">${escapeHtml(aluno.nome.charAt(0).toUpperCase())}</div>
                        <strong class="tabela-alunos-nome">${escapeHtml(aluno.nome)}</strong>
                    </div>
                </td>
                <td class="tabela-alunos-matricula">${escapeHtml(aluno.matricula)}</td>
                <td><span class="status-badge badge-formacao">${escapeHtml(aluno.semestre)}º sem.</span></td>
                <td class="tabela-alunos-horas">${escapeHtml(aluno.aprovadas)}/${escapeHtml(aluno.exigidas)}h</td>
                <td>
                    <div class="flex-align-center" style="gap: 12px;">
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill ${concluido ? 'concluido' : ''}" style="width: ${Math.min(aluno.porcentagem, 100)}%;"></div>
                        </div>
                        <span class="tabela-alunos-percentual">${escapeHtml(aluno.porcentagem)}%</span>
                    </div>
                </td>
                <td>
                    <a href="relatorios.html?student_id=${encodeURIComponent(aluno.id)}" class="link-relatorio">
                        <i data-lucide="chart-column"></i> Relatório
                    </a>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}
