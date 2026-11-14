import { protegerRota } from '../../auth.js';
import { obterRelatorioAluno, obterMinhasSolicitacoes, exportarRelatorioPdf } from '../../api.js';
import { preencherCamposPerfil } from '../../utils/userprofile.js';
import { escapeHtml } from '../../utils/html.js';
import { STATUS, formatarData, obterMapaTiposAtividade } from '../../utils/solicitacao.js';

// Garante a proteção da rota antes de carregar o restante
protegerRota();

document.addEventListener('DOMContentLoaded', () => {
    carregarDadosDashboard();

    // Evento para o botão de exportar relatório
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', tratarExportacaoPdf);
    }
});

async function tratarExportacaoPdf() {
    const btnExport = document.getElementById('btn-export');
    if (!btnExport) return;

    const conteudoOriginal = btnExport.innerHTML;

    try {
        btnExport.disabled = true;
        btnExport.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Gerando PDF...`;
        if (window.lucide) window.lucide.createIcons();

        await exportarRelatorioPdf();

    } catch (error) {
        console.error('Erro ao exportar PDF:', error);
        if (error.message === 'UNAUTHORIZED') {
            window.location.href = '../../index.html';
        } else {
            alert(error.message || 'Não foi possível baixar o relatório. Tente novamente.');
        }
    } finally {
        btnExport.disabled = false;
        btnExport.innerHTML = conteudoOriginal;
        if (window.lucide) window.lucide.createIcons();
    }
}

async function carregarDadosDashboard() {
    try {
        // A API devolve as solicitações da mais recente para a mais antiga: a 1ª página com 5 itens basta
        const [report, recentes, mapaTipos] = await Promise.all([
            obterRelatorioAluno(),
            obterMinhasSolicitacoes({ page_size: 5 }),
            obterMapaTiposAtividade()
        ]);

        // 1. Perfil, resumo de horas e gráfico por tipo (ActivityReportResponse)
        preencherCamposPerfil(report.student);
        preencherKPIsHoras(report.summary);

        if (report.summary.approved_hours_by_type.length > 0) {
            renderizarGraficoEvolucao(report.summary.approved_hours_by_type);
        }

        // 2. Tabela de solicitações recentes
        preencherTabelaSolicitacoes(recentes.items, mapaTipos);

    } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            window.location.href = '../../index.html';
        }
    }
}

// --- PREENCHIMENTO DO RESUMO DE HORAS ---

function preencherKPIsHoras(summary) {
    const porcentagem = Math.min(100, Math.round(summary.progress_percentage));

    // Cards Superiores
    const elRequired = document.getElementById('hours-required');
    const elApproved = document.getElementById('hours-approved');
    const elApprovedPercent = document.getElementById('hours-approved-percent');
    const elRemaining = document.getElementById('hours-remaining');

    if (elRequired) elRequired.innerText = `${summary.total_required_hours}h`;
    if (elApproved) elApproved.innerText = `${summary.total_approved_hours}h`;
    if (elApprovedPercent) elApprovedPercent.innerText = `${porcentagem}% concluído`;
    if (elRemaining) elRemaining.innerText = `${summary.remaining_hours}h`;

    // Quantidade por status (a API devolve todos os status, inclusive os zerados)
    const porStatus = summary.requests_by_status;
    const pendentesCount = porStatus.PENDING + porStatus.IN_REVIEW;
    const aprovadasCount = porStatus.APPROVED;
    const rejeitadasCount = porStatus.REJECTED;
    const canceladasCount = porStatus.CANCELED;

    const elRequestsPending = document.getElementById('requests-pending-count');
    if (elRequestsPending) elRequestsPending.innerText = pendentesCount;

    // Barra de Progresso
    const elProgressPercentage = document.getElementById('progress-percentage');
    const elHoursCurrent = document.getElementById('hours-current');
    const elHoursMax = document.getElementById('hours-max');
    const elProgressBarFill = document.getElementById('progress-bar-fill');

    if (elProgressPercentage) elProgressPercentage.innerText = `${porcentagem}%`;
    if (elHoursCurrent) elHoursCurrent.innerText = `${summary.total_approved_hours}h`;
    if (elHoursMax) elHoursMax.innerText = `${summary.total_required_hours}h`;
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

function preencherTabelaSolicitacoes(recentes, mapaTipos) {
    const tabelaBody = document.getElementById('recent-requests-table');
    if (!tabelaBody) return;

    if (recentes.length === 0) {
        tabelaBody.innerHTML = '<tr><td colspan="6" class="tabela-mensagem">Nenhuma solicitação encontrada.</td></tr>';
        return;
    }

    tabelaBody.innerHTML = recentes.map(item => {
        const status = STATUS[item.status];
        const categoria = mapaTipos.get(item.activity_type_id) ?? 'Geral';

        return `
            <tr>
                <td><strong class="texto-truncado" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong></td>
                <td>${escapeHtml(categoria)}</td>
                <td><strong>${escapeHtml(item.requested_hours)}h</strong></td>
                <td>${escapeHtml(formatarData(item.created_at))}</td>
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

// --- GRÁFICO POR TIPO DE ATIVIDADE ---

let evolutionChartInstance = null;

function renderizarGraficoEvolucao(approvedHoursList) {
    const canvas = document.getElementById('evolutionChart');
    if (!canvas) return;

    if (evolutionChartInstance) {
        evolutionChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const labels = approvedHoursList.map(item => item.activity_type_name);
    const valores = approvedHoursList.map(item => item.approved_hours);

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