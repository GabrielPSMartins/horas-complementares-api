import { protegerRota } from '../../auth.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';
import { obterSolicitacoesCoordenador } from '../../api.js';

protegerRota();

let listaCompletaAlunos = [];
let semestreSelecionado = 'todos';

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
        tabelaBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: #64748b;">Carregando alunos...</td></tr>`;
    }
    if (gridCards) {
        gridCards.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 32px; color: #64748b;">Carregando alunos...</div>`;
    }

    try {
        let resData = null;

        // Tentativa com os parâmetros aceitos pelo backend (limite máximo 100)
        try {
            resData = await obterSolicitacoesCoordenador({ limit: 100, page_size: 100 });
        } catch (e) {
            console.warn('Falha na requisição com parâmetros de limite. Tentando chamada simples...', e);
            resData = await obterSolicitacoesCoordenador();
        }

        const listaSolicitacoes = Array.isArray(resData) ? resData : (resData?.items || resData?.data || []);

        // Agrupa os alunos e calcula as horas exatas conforme dashboards_2.js
        listaCompletaAlunos = processarEAgruparAlunos(listaSolicitacoes);

        renderizarBotoesSemestres();
        filtrarERenderizarAlunos();

    } catch (err) {
        console.error('Erro ao carregar dados dos alunos:', err);
        if (tabelaBody) {
            tabelaBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 32px;">Erro ao carregar alunos. Tente novamente.</td></tr>`;
        }
    }
}

/**
 * LÓGICA IDÊNTICA AO dashboards_2.js:
 * Agrupa os alunos por student_id e soma (accepted_hours || requested_hours || 0)
 * apenas quando o status === 'APPROVED'.
 */
function processarEAgruparAlunos(solicitacoes) {
    const alunosMap = new Map();

    solicitacoes.forEach(item => {
        // Extração do ID do aluno
        const studentId = item.student_id || item.student?.id || item.user_id;
        if (!studentId) return;

        const key = String(studentId);
        const statusUpper = (item.status || 'PENDING').toUpperCase();

        // Extração do semestre real
        const semestreReal = Number(
            item.student?.current_semester 
            ?? item.student_semester 
            ?? item.semester 
            ?? item.current_semester 
            ?? item.student?.semester 
            ?? 1
        );

        // Extração de dados cadastrais
        const nome = item.student_name || item.student?.name || item.student?.full_name || 'Aluno';
        const matricula = item.student_registration_number || item.student?.registration_number || item.student?.rga || '---';
        const email = item.student_email || item.student?.email || `${nome.toLowerCase().replace(/\s+/g, '.')}@aluno.fepi.br`;

        // Cálculo das horas aprovadas (Regra idêntica do dashboards_2.js)
        const horasAprovadasSolicitacao = statusUpper === 'APPROVED' 
            ? Number(item.accepted_hours || item.requested_hours || item.hours || 0) 
            : 0;

        const ehPendente = (statusUpper === 'PENDING' || statusUpper === 'IN_REVIEW') ? 1 : 0;

        if (!alunosMap.has(key)) {
            alunosMap.set(key, {
                id: key,
                nome,
                matricula,
                email,
                semestre: semestreReal,
                aprovadas: horasAprovadasSolicitacao,
                exigidas: 200,
                pendentesCount: ehPendente
            });
        } else {
            const alunoExistente = alunosMap.get(key);
            alunoExistente.aprovadas += horasAprovadasSolicitacao;
            alunoExistente.pendentesCount += ehPendente;
            
            // Atualiza semestre/matrícula caso venha mais completo de outra solicitação
            if (semestreReal && (!alunoExistente.semestre || alunoExistente.semestre === 1)) {
                alunoExistente.semestre = semestreReal;
            }
            if (matricula !== '---' && alunoExistente.matricula === '---') {
                alunoExistente.matricula = matricula;
            }
        }
    });

    // Calcula percentuais finais
    return Array.from(alunosMap.values()).map(aluno => {
        const porcentagem = aluno.exigidas > 0 
            ? Math.min(100, Math.round((aluno.aprovadas / aluno.exigidas) * 100)) 
            : 0;

        return {
            ...aluno,
            porcentagem
        };
    });
}

function renderizarBotoesSemestres() {
    const container = document.getElementById('filtro-semestres');
    if (!container) return;

    const contagem = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    listaCompletaAlunos.forEach(aluno => {
        const sem = Number(aluno.semestre || 0);
        if (contagem[sem] !== undefined) {
            contagem[sem]++;
        }
    });

    let html = '';
    for (let i = 1; i <= 8; i++) {
        const qtd = contagem[i];
        const estaAtivo = String(semestreSelecionado) === String(i);

        const borderStyle = estaAtivo ? '2px solid #2563eb' : '1px solid #e2e8f0';
        const bgStyle = '#ffffff';
        const numColor = estaAtivo ? '#2563eb' : (qtd === 0 ? '#94a3b8' : '#1e293b');
        const countColor = estaAtivo ? '#2563eb' : '#94a3b8';
        const shadowStyle = estaAtivo ? '0 4px 12px rgba(37, 99, 235, 0.12)' : '0 2px 6px rgba(15, 23, 42, 0.02)';

        html += `
            <div class="card-semestre-item" data-semestre="${i}" style="background: ${bgStyle}; border: ${borderStyle}; border-radius: 18px; padding: 18px 10px; text-align: center; cursor: pointer; transition: all 0.2s ease; box-shadow: ${shadowStyle}; opacity: ${qtd === 0 && !estaAtivo ? '0.7' : '1'};">
                <div style="font-size: 1.4rem; font-weight: 800; color: ${numColor}; line-height: 1;">${i}º</div>
                <div style="font-size: 0.75rem; font-weight: 600; color: ${countColor}; margin-top: 6px;">${qtd} aluno${qtd === 1 ? '' : 's'}</div>
            </div>
        `;
    }

    container.innerHTML = html;

    container.querySelectorAll('.card-semestre-item').forEach(card => {
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
        gridContainer.innerHTML = `
            <div class="ui-card" style="grid-column: 1 / -1; text-align: center; padding: 32px 20px; color: #64748b; font-size: 0.95rem;">
                Nenhum aluno encontrado.
            </div>
        `;
        return;
    }

    gridContainer.innerHTML = alunos.map(aluno => {
        const id = aluno.id;
        const nome = aluno.nome;
        const matricula = aluno.matricula;
        const email = aluno.email;
        const semestreText = `${aluno.semestre}º sem.`;
        
        const aprovadas = aluno.aprovadas;
        const exigidas = aluno.exigidas;
        const porcentagem = aluno.porcentagem;
        const inicial = nome.charAt(0).toUpperCase();

        let badgeStatusHtml = '';

        if (porcentagem >= 100) {
            badgeStatusHtml = `
                <span class="status-badge badge-approved">
                    ✓ Concluído
                </span>
            `;
        } else if (aluno.pendentesCount > 0) {
            badgeStatusHtml = `
                <span class="status-badge badge-pending">
                    ${aluno.pendentesCount} pend.
                </span>
            `;
        }

        return `
            <div class="ui-card" style="display: flex; flex-direction: column; gap: 16px;">
                <div class="flex-between-center" style="gap: 12px; align-items: flex-start;">
                    <div class="flex-align-center" style="gap: 14px;">
                        <div class="avatar-circle large" style="flex-shrink: 0; background-color: #2563eb;">
                            ${inicial}
                        </div>
                        <div>
                            <div class="stat-label" style="margin-bottom: 2px; font-size: 1.1rem;">${nome}</div>
                            <div class="flex-align-center" style="gap: 8px;">
                                <span style="font-size: 0.85rem; color: #64748b; font-weight: 600;">${matricula}</span>
                                <span class="status-badge badge-formacao" style="padding: 2px 10px; font-size: 0.75rem;">
                                    ${semestreText}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div>
                        ${badgeStatusHtml}
                    </div>
                </div>

                <div>
                    <div class="flex-between-center" style="margin-bottom: 6px;">
                        <span style="font-size: 0.875rem; font-weight: 700; color: #475569;">Progresso</span>
                        <span style="font-size: 0.95rem; font-weight: 800; color: ${porcentagem >= 100 ? '#059669' : '#0f172a'};">
                            ${porcentagem}% · ${aprovadas}/${exigidas}h
                        </span>
                    </div>
                    <div class="progress-bar-bg" style="margin: 0; height: 10px;">
                        <div class="progress-bar-fill" style="width: ${porcentagem}%; ${porcentagem >= 100 ? 'background-color: #059669;' : ''}"></div>
                    </div>
                </div>

                <div class="flex-between-center" style="gap: 12px; padding-top: 4px;">
                    <span style="font-size: 0.85rem; color: #64748b; font-weight: 500; word-break: break-all;">${email}</span>
                    <a href="relatorios.html?student_id=${id}" class="btn-export" style="padding: 8px 18px; font-size: 0.85rem;">
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
        tabelaBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px; color: #64748b;">Nenhum aluno encontrado.</td></tr>`;
        return;
    }

    tabelaBody.innerHTML = alunos.map(aluno => {
        const id = aluno.id;
        const nome = aluno.nome;
        const matricula = aluno.matricula;
        const semestreText = `${aluno.semestre}º sem.`;
        
        const aprovadas = aluno.aprovadas;
        const exigidas = aluno.exigidas;
        const porcentagem = aluno.porcentagem;
        const inicial = nome.charAt(0).toUpperCase();

        return `
            <tr>
                <td style="padding: 16px 28px;">
                    <div class="flex-align-center" style="gap: 14px;">
                        <div class="avatar-circle small" style="flex-shrink: 0; background-color: #2563eb;">
                            ${inicial}
                        </div>
                        <strong style="font-size: 0.95rem; color: #0f172a;">${nome}</strong>
                    </div>
                </td>

                <td style="padding: 16px 20px; color: #64748b; font-size: 0.9rem;">${matricula}</td>

                <td style="padding: 16px 20px;">
                    <span class="status-badge badge-formacao" style="padding: 4px 12px; font-size: 0.8rem;">
                        ${semestreText}
                    </span>
                </td>

                <td style="padding: 16px 20px; font-weight: 700; color: #1e293b; font-size: 0.9rem;">
                    ${aprovadas}/${exigidas}h
                </td>

                <td style="padding: 16px 20px;">
                    <div class="flex-align-center" style="gap: 12px;">
                        <div class="progress-bar-bg" style="flex: 1; margin: 0; height: 8px;">
                            <div class="progress-bar-fill" style="width: ${porcentagem}%; ${porcentagem >= 100 ? 'background-color: #059669;' : ''}"></div>
                        </div>
                        <span style="font-weight: 800; font-size: 0.85rem; color: #0f172a; min-width: 40px;">${porcentagem}%</span>
                    </div>
                </td>

                <td style="padding: 16px 28px; text-align: right;">
                    <a href="relatorios.html?student_id=${id}" style="text-decoration: none; color: #2563eb; font-weight: 700; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
                        <i data-lucide="chart-column" style="width: 16px; height: 16px;"></i> Relatório
                    </a>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}