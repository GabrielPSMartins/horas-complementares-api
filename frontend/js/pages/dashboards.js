import { protegerRota } from '../auth.js';
import { obterRelatorioAluno, obterMinhasSolicitacoes } from '../api.js';
import { preencherCamposPerfil } from '../utils/userprofile.js';

// Garante a proteção da rota antes de carregar o restante
protegerRota();

document.addEventListener('DOMContentLoaded', () => {
    carregarDadosDashboard();
});

async function carregarDadosDashboard() {
    try {
        // Busca os dados através do arquivo api.js em paralelo
        const [report, requests] = await Promise.all([
            obterRelatorioAluno(),
            obterMinhasSolicitacoes()
        ]);

        // 1. Preenche Perfil e Horas se o relatório retornou dados
        if (report) {
            if (report.student) {
                // Utiliza o módulo centralizado de perfil
                preencherCamposPerfil(report.student);
            }

            if (report.summary) {
                preencherKPIsHoras(report.summary);

                if (report.summary.approved_hours_by_type && report.summary.approved_hours_by_type.length > 0) {
                    renderizarGraficoEvolucao(report.summary.approved_hours_by_type);
                }
            }
        }

        // 2. Preenche a tabela de solicitações recentes
        if (requests) {
            // Garante o tratamento de array caso o backend retorne envelopado em .data
            const listaSolicitacoes = Array.isArray(requests) 
                ? requests 
                : (requests.data || requests.items || requests.solicitacoes || []);
                
            preencherTabelaSolicitacoes(listaSolicitacoes);
        }

    } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            window.location.href = '../../index.html';
        }
    }
}

// --- PREENCHIMENTO DO RESUMO DE HORAS ---

function preencherKPIsHoras(summary) {
    if (!summary) return;

    const porcentagem = Math.min(100, Math.round(summary.progress_percentage || 0));

    // Cards Superiores
    const elRequired = document.getElementById('hours-required');
    const elApproved = document.getElementById('hours-approved');
    const elApprovedPercent = document.getElementById('hours-approved-percent');
    const elRemaining = document.getElementById('hours-remaining');

    if (elRequired) elRequired.innerText = `${summary.total_required_hours || 0}h`;
    if (elApproved) elApproved.innerText = `${summary.total_approved_hours || 0}h`;
    if (elApprovedPercent) elApprovedPercent.innerText = `${porcentagem}% concluído`;
    if (elRemaining) elRemaining.innerText = `${summary.remaining_hours || 0}h`;

    // Mapeamento de Status
    const statusMap = summary.requests_by_status || {};
    const pendentesCount = statusMap.PENDING ?? statusMap.pending ?? statusMap.Pendente ?? 0;
    const aprovadasCount = statusMap.APPROVED ?? statusMap.approved ?? statusMap.Aprovado ?? 0;
    const rejeitadasCount = statusMap.REJECTED ?? statusMap.rejected ?? statusMap.Rejeitado ?? 0;
    const canceladasCount = statusMap.CANCELED ?? statusMap.canceled ?? statusMap.Cancelado ?? 0;

    const elRequestsPending = document.getElementById('requests-pending-count');
    if (elRequestsPending) elRequestsPending.innerText = pendentesCount;

    // Barra de Progresso
    const elProgressPercentage = document.getElementById('progress-percentage');
    const elHoursCurrent = document.getElementById('hours-current');
    const elHoursMax = document.getElementById('hours-max');
    const elProgressBarFill = document.getElementById('progress-bar-fill');

    if (elProgressPercentage) elProgressPercentage.innerText = `${porcentagem}%`;
    if (elHoursCurrent) elHoursCurrent.innerText = `${summary.total_approved_hours || 0}h`;
    if (elHoursMax) elHoursMax.innerText = `${summary.total_required_hours || 0}h`;
    if (elProgressBarFill) elProgressBarFill.style.width = `${porcentagem}%`;

    // Badges Inferiores
    const elBadgePending = document.getElementById('badge-pending-val');
    const elBadgeApproved = document.getElementById('badge-approved-val');
    const elBadgeRejected = document.getElementById('badge-rejected-val');
    const elBadgeCanceled = document.getElementById('badge-canceled-val');

    if (elBadgePending) elBadgePending.innerText = pendentesCount;
    if (elBadgeApproved) elBadgeApproved.innerText = aprovadasCount;
    if (elBadgeRejected) elBadgeRejected.innerText = rejeitadasCount;
    if (elBadgeCanceled) elBadgeCanceled.innerText = canceladasCount;
}

// --- TABELA DE SOLICITAÇÕES RECENTES ---

function preencherTabelaSolicitacoes(requests) {
    const tabelaBody = document.getElementById('recent-requests-table');
    if (!tabelaBody || !Array.isArray(requests)) return;

    if (requests.length === 0) {
        tabelaBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhuma solicitação encontrada.</td></tr>`;
        return;
    }

    // Ordena as solicitações da mais recente para a mais antiga
    const listaOrdenada = [...requests].sort((a, b) => {
        const dataA = new Date(a.createdAt || a.created_at || a.submission_date || 0);
        const dataB = new Date(b.createdAt || b.created_at || b.submission_date || 0);
        return dataB - dataA;
    });

    // Filtra apenas as 5 últimas solicitações
    const recentes = listaOrdenada.slice(0, 5);

    const statusMap = {
        'PENDING': { text: 'Pendente', badgeClass: 'badge-pending' },
        'IN_REVIEW': { text: 'Em Análise', badgeClass: 'badge-in-review' },
        'APPROVED': { text: 'Aprovada', badgeClass: 'badge-approved' },
        'REJECTED': { text: 'Rejeitada', badgeClass: 'badge-rejected' },
        'CANCELED': { text: 'Cancelada', badgeClass: 'badge-canceled' }
    };

    tabelaBody.innerHTML = recentes.map(item => {
        const id = item.id || item._id;
        const dataRaw = item.createdAt || item.created_at || item.submission_date;
        const dataFormatada = dataRaw 
            ? new Date(dataRaw).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) 
            : '---';

        const rawStatus = (item.status || 'PENDING').toUpperCase();
        const statusInfo = statusMap[rawStatus] || { text: rawStatus, badgeClass: 'badge-pending' };

        const titulo = item.title || item.titulo || item.description || item.descricao || 'Solicitação de Horas';
        const categoria = item.activity_type_name || item.activity_type?.name || item.category || 'Geral';
        const horas = item.hours || item.requested_hours || item.horas || 0;

        return `
            <tr style="cursor: pointer;" onclick="window.location.href='detalhes-solicitacao.html?id=${id}'">
                <td>
                    <strong style="color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 250px; display: block;">
                        ${titulo}
                    </strong>
                </td>
                <td style="color: var(--text-secondary);">${categoria}</td>
                <td style="font-weight: 600; color: var(--text-primary);">${horas}h</td>
                <td style="color: var(--text-secondary);">${dataFormatada}</td>
                <td>
                    <span class="status-badge ${statusInfo.badgeClass}">
                        ${statusInfo.text}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// --- GRÁFICO POR TIPO DE ATIVIDADE ---

let evolutionChartInstance = null;

function renderizarGraficoEvolucao(approvedHoursList) {
    const canvas = document.getElementById('evolutionChart');
    if (!canvas) return;

    // Destrói a instância anterior caso a função seja chamada novamente
    if (evolutionChartInstance) {
        evolutionChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const labels = approvedHoursList.map(item => item.activity_type_name || 'Atividade');
    const valores = approvedHoursList.map(item => item.approved_hours || 0);

    evolutionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Horas Aprovadas',
                data: valores,
                backgroundColor: 'rgba(37, 99, 235, 0.6)',
                borderColor: '#2563EB',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [4, 4] } },
                x: { grid: { display: false } }
            }
        }
    });
}