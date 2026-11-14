import { protegerRota } from '../../auth.js';
import {
    obterSolicitacaoPorId,
    obterHistoricoSolicitacao,
    obterRelatorioAlunoPorId,
    assumirSolicitacao,
    revisarSolicitacao,
    abrirAnexo
} from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';
import {
    STATUS,
    formatarData,
    obterMapaTiposAtividade,
    renderizarHistorico
} from '../../utils/solicitacao.js';

carregarDadosPerfilCoordenador();

/** @type {Map<string, string>} */
let mapaTipos = new Map();

// Exibe a mensagem de sucesso/erro logo acima do card de ações
function exibirBannerMensagem(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('container-mensagem-banner');
    container.innerHTML = '';

    const banner = document.createElement('div');
    banner.className = `alert-banner alert-banner--${tipo}`;
    banner.textContent = mensagem;
    container.appendChild(banner);

    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Preenche o card superior com os dados e o progresso do aluno (GET /students/{id}/report)
async function carregarProgressoAluno(studentId) {
    try {
        const { student, course, summary } = await obterRelatorioAlunoPorId(studentId);
        const porcentagem = Math.round(summary.progress_percentage);

        document.getElementById('aluno-nome').textContent = student.name;
        document.getElementById('aluno-avatar').textContent = student.name.charAt(0).toUpperCase();
        document.getElementById('aluno-semestre').textContent = `${student.current_semester}º Semestre`;
        document.getElementById('aluno-info-curso').textContent = `${course.name} · Mat: ${student.registration_number}`;
        document.getElementById('aluno-progresso-texto').textContent =
            `${porcentagem}% · ${summary.total_approved_hours}/${summary.total_required_hours}h`;
        document.getElementById('aluno-progresso-bar').style.width = `${Math.min(porcentagem, 100)}%`;
    } catch (error) {
        console.error('Erro ao carregar relatório do aluno:', error);
    }
}

/** @param {import('../../utils/solicitacao.js').SolicitacaoCoordenador} solicitacao */
function preencherDetalhesSolicitacao(solicitacao) {
    const status = STATUS[solicitacao.status];

    document.getElementById('detalhe-eixo-tag').textContent = mapaTipos.get(solicitacao.activity_type_id) ?? 'Atividade Complementar';

    const elStatus = document.getElementById('detalhe-status-badge');
    elStatus.className = `status-badge ${status.badge}`;
    elStatus.textContent = status.label;

    document.getElementById('detalhe-titulo').textContent = solicitacao.title;
    document.getElementById('detalhe-data-envio').textContent = `Enviado em ${formatarData(solicitacao.created_at)}`;
    document.getElementById('detalhe-descricao').textContent = solicitacao.description || 'Sem descrição cadastrada.';
    document.getElementById('detalhe-data-atividade').textContent = formatarData(solicitacao.activity_date);
    document.getElementById('detalhe-horas-solicitadas').textContent = `${solicitacao.requested_hours}h`;
    document.getElementById('detalhe-observacoes').textContent = solicitacao.rejection_reason || 'Nenhuma observação.';

    const anexo = solicitacao.attachments[0];
    const elBtnDownload = document.getElementById('btn-download-anexo');

    document.getElementById('anexo-nome').textContent = anexo ? anexo.file_name : 'Nenhum arquivo anexado';
    elBtnDownload.classList.toggle('hidden', !anexo);

    if (anexo) {
        elBtnDownload.onclick = async (e) => {
            e.preventDefault();
            try {
                await abrirAnexo(solicitacao.id, anexo.id);
            } catch (err) {
                alert(err.message || 'Erro ao abrir o comprovante. Tente novamente.');
            }
        };
    }
}

// Mostra a ação possível para o status atual: assumir (pendente) ou aprovar/rejeitar (em análise)
function renderizarCardAcoes(solicitacao) {
    const pendente = solicitacao.status === 'PENDING';
    const emAnalise = solicitacao.status === 'IN_REVIEW';

    document.getElementById('card-acoes-disponiveis').classList.toggle('hidden', !pendente && !emAnalise);
    document.getElementById('acao-assumir').classList.toggle('hidden', !pendente);
    document.getElementById('acao-analisar').classList.toggle('hidden', !emAnalise);

    if (emAnalise) {
        const inputHoras = document.getElementById('input-horas-efetivas');
        inputHoras.value = solicitacao.requested_hours;
        inputHoras.placeholder = `Máx. ${solicitacao.requested_hours}h solicitadas`;
    }
}

// Alterna entre os formulários de aprovação e de rejeição
function selecionarAba(aba) {
    const aprovar = aba === 'aprovar';
    document.getElementById('tab-btn-aprovar').classList.toggle('active', aprovar);
    document.getElementById('tab-btn-rejeitar').classList.toggle('active', !aprovar);
    document.getElementById('form-container-aprovar').classList.toggle('hidden', !aprovar);
    document.getElementById('form-container-rejeitar').classList.toggle('hidden', aprovar);
}

async function carregarHistorico(idSolicitacao) {
    const container = document.getElementById('detalhe-timeline');
    try {
        renderizarHistorico(container, await obterHistoricoSolicitacao(idSolicitacao));
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        container.innerHTML = '<p class="timeline-vazia">Não foi possível carregar o histórico.</p>';
    }
}

// Busca a solicitação na API e atualiza todas as seções da tela
async function recarregarTela(idSolicitacao) {
    const solicitacao = await obterSolicitacaoPorId(idSolicitacao);

    preencherDetalhesSolicitacao(solicitacao);
    renderizarCardAcoes(solicitacao);

    await Promise.all([
        carregarProgressoAluno(solicitacao.student_id),
        carregarHistorico(idSolicitacao)
    ]);

    if (window.lucide) window.lucide.createIcons();
}

function configurarAcoes(idSolicitacao) {
    document.getElementById('btn-assumir-solicitacao').addEventListener('click', async () => {
        try {
            await assumirSolicitacao(idSolicitacao);
            await recarregarTela(idSolicitacao);
        } catch (err) {
            exibirBannerMensagem(err.message || 'Erro ao assumir solicitação.', 'erro');
        }
    });

    document.getElementById('tab-btn-aprovar').addEventListener('click', () => selecionarAba('aprovar'));
    document.getElementById('tab-btn-rejeitar').addEventListener('click', () => selecionarAba('rejeitar'));

    document.getElementById('btn-confirmar-aprovacao').addEventListener('click', async () => {
        const horas = Number.parseInt(document.getElementById('input-horas-efetivas').value, 10);

        if (Number.isNaN(horas) || horas < 0) {
            exibirBannerMensagem('Informe uma quantidade de horas válida.', 'erro');
            return;
        }

        await processarDecisao(idSolicitacao, { status: 'APPROVED', accepted_hours: horas });
    });

    document.getElementById('btn-confirmar-rejeicao').addEventListener('click', async () => {
        const motivo = document.getElementById('textarea-motivo-rejeicao').value.trim();

        if (!motivo) {
            exibirBannerMensagem('Para rejeitar, é obrigatório preencher a justificativa.', 'erro');
            return;
        }

        await processarDecisao(idSolicitacao, { status: 'REJECTED', rejection_reason: motivo });
    });
}

// Envia a decisão (PATCH /activity-requests/{id}/review, schema ActivityReviewRequest)
async function processarDecisao(idSolicitacao, decisao) {
    try {
        await revisarSolicitacao(idSolicitacao, decisao);
        exibirBannerMensagem(`Solicitação ${decisao.status === 'APPROVED' ? 'aprovada' : 'rejeitada'} com sucesso!`, 'sucesso');
        await recarregarTela(idSolicitacao);
    } catch (err) {
        exibirBannerMensagem(err.message || 'Erro ao processar a decisão.', 'erro');
    }
}

// Inicialização principal da página
document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();

    const idSolicitacao = new URLSearchParams(window.location.search).get('id');

    if (!idSolicitacao) {
        exibirBannerMensagem('ID de solicitação inválido ou não informado na URL.', 'erro');
        return;
    }

    configurarAcoes(idSolicitacao);

    try {
        mapaTipos = await obterMapaTiposAtividade().catch(() => new Map());
        await recarregarTela(idSolicitacao);
    } catch (error) {
        console.error('Erro ao carregar dados da solicitação:', error);
        exibirBannerMensagem(error.message || 'Erro ao carregar dados da solicitação.', 'erro');
    }
});
