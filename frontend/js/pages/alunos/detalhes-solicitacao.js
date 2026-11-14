import { protegerRota } from '../../auth.js';
import {
    obterSolicitacaoPorId,
    obterHistoricoSolicitacao,
    cancelarSolicitacao,
    abrirAnexo
} from '../../api.js';
import { carregarDadosPerfil } from '../../utils/userprofile.js';
import { STATUS, formatarData, renderizarHistorico } from '../../utils/solicitacao.js';

// Protege a rota verificando o token de autenticação
protegerRota();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Preenche o perfil e menu lateral do usuário
    carregarDadosPerfil();

    // 2. Busca o ID da solicitação passado na URL
    const idSolicitacao = new URLSearchParams(window.location.search).get('id');

    if (!idSolicitacao) {
        alert('ID da solicitação não foi fornecido.');
        window.location.href = 'solicitacoes.html';
        return;
    }

    // 3. Carrega os dados e o histórico da solicitação
    await carregarDetalhes(idSolicitacao);
});

async function carregarDetalhes(id) {
    /** @type {import('../../utils/solicitacao.js').Solicitacao} */
    let solicitacao;
    try {
        solicitacao = await obterSolicitacaoPorId(id);
    } catch (error) {
        if (error.message === 'UNAUTHORIZED') return;
        alert(error.message || 'Solicitação não encontrada.');
        window.location.href = 'solicitacoes.html';
        return;
    }

    const historico = await obterHistoricoSolicitacao(id).catch(() => []);

    preencherTela(solicitacao);
    configurarBotaoCancelamento(solicitacao);
    renderizarHistorico(document.getElementById('detalhe-timeline'), historico);

    if (window.lucide) window.lucide.createIcons();
}

function preencherTela(item) {
    const status = STATUS[item.status];

    document.getElementById('detalhe-status-badge').className = `status-badge ${status.badge}`;
    document.getElementById('detalhe-status-texto').textContent = `• ${status.label}`;

    document.getElementById('detalhe-titulo').textContent = item.title;
    document.getElementById('detalhe-data-envio').textContent = `Enviada em ${formatarData(item.created_at)}`;
    document.getElementById('detalhe-descricao').textContent = item.description || 'Sem descrição cadastrada.';
    document.getElementById('detalhe-data-atividade').textContent = formatarData(item.activity_date);
    document.getElementById('detalhe-horas-solicitadas').textContent = `${item.requested_hours}h`;
    document.getElementById('detalhe-horas-aprovadas').textContent = item.accepted_hours !== null ? `${item.accepted_hours}h` : '-';

    // Quem avaliou (ou está avaliando) a solicitação
    const analisador = item.reviewed_by_name ?? item.in_review_by_name;
    document.getElementById('detalhe-analisado-por').textContent =
        analisador ?? (item.status === 'PENDING' ? 'Aguardando avaliação' : '-');

    document.getElementById('detalhe-observacoes').textContent = item.rejection_reason || 'Nenhuma observação informada.';

    // Comprovante anexado (o envio aceita um arquivo por solicitação)
    const anexo = item.attachments[0];
    const elAnexoNome = document.getElementById('anexo-nome');
    const elAnexoSub = document.getElementById('anexo-subtexto');
    const elBtnDownload = document.getElementById('btn-download-anexo');

    if (anexo) {
        elAnexoNome.textContent = anexo.file_name;
        elAnexoSub.textContent = 'Arquivo disponível para download';
        elBtnDownload.classList.remove('hidden');
        elBtnDownload.onclick = async (event) => {
            event.preventDefault();
            try {
                await abrirAnexo(item.id, anexo.id);
            } catch (err) {
                alert(err.message || 'Erro ao abrir o anexo.');
            }
        };
    } else {
        elAnexoNome.textContent = 'Nenhum comprovante anexado';
        elAnexoSub.textContent = 'Nenhum arquivo encontrado nos dados da solicitação';
        elBtnDownload.classList.add('hidden');
    }
}

// Exibe o botão de cancelamento (apenas para pendentes) e a confirmação logo abaixo dele
function configurarBotaoCancelamento(solicitacao) {
    const container = document.getElementById('container-btn-cancelar');
    container.classList.toggle('hidden', solicitacao.status !== 'PENDING');
    if (solicitacao.status !== 'PENDING') return;

    const painelAcao = document.getElementById('painel-acao-cancelar');
    const boxConfirmacao = document.getElementById('box-confirmacao-cancelamento');
    const btnConfirmarFinal = document.getElementById('btn-confirmar-cancelamento-final');

    document.getElementById('btn-cancelar-solicitacao').onclick = () => {
        painelAcao.classList.add('hidden');
        boxConfirmacao.classList.remove('hidden');
    };

    document.getElementById('btn-desistir-cancelamento').onclick = () => {
        boxConfirmacao.classList.add('hidden');
        painelAcao.classList.remove('hidden');
    };

    btnConfirmarFinal.onclick = async () => {
        btnConfirmarFinal.disabled = true;
        btnConfirmarFinal.textContent = 'Cancelando...';

        try {
            await cancelarSolicitacao(solicitacao.id);
            window.location.reload();
        } catch (err) {
            alert(err.message || 'Erro ao cancelar a solicitação.');
            btnConfirmarFinal.disabled = false;
            btnConfirmarFinal.textContent = 'Sim, cancelar';
        }
    };
}
