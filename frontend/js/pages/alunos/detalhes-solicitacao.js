import { protegerRota } from '../../auth.js';
import { 
    obterSolicitacaoPorId, 
    obterMinhasSolicitacoes, 
    obterTiposAtividades, 
    obterHistoricoSolicitacao, 
    abrirAnexo 
} from '../../api.js';
import { carregarDadosPerfil } from '../../utils/userprofile.js';

// Protege a rota verificando o token de autenticação
protegerRota();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Preenche o perfil e menu lateral do usuário
    carregarDadosPerfil();

    // 2. Busca o ID da solicitação passado na URL
    const urlParams = new URLSearchParams(window.location.search);
    const idSolicitacao = urlParams.get('id');

    if (!idSolicitacao) {
        alert('ID da solicitação não foi fornecido.');
        window.location.href = 'solicitacoes.html';
        return;
    }

    // 3. Carrega os dados e o histórico da solicitação
    await carregarDetalhes(idSolicitacao);
});

async function carregarDetalhes(id) {
    try {
        // Tenta obter a solicitação específica por ID; se falhar, busca na lista geral do aluno
        let solicitacao = null;
        try {
            if (typeof obterSolicitacaoPorId === 'function') {
                solicitacao = await obterSolicitacaoPorId(id);
            }
        } catch (e) {
            console.warn('Erro ao obter por ID direto, buscando na lista do aluno:', e);
        }

        if (!solicitacao) {
            const dados = await obterMinhasSolicitacoes({});
            const lista = Array.isArray(dados) 
                ? dados 
                : (dados.data || dados.items || dados.solicitacoes || []);
            solicitacao = lista.find(item => String(item.id || item._id) === String(id));
        }

        if (!solicitacao) {
            alert('Solicitação não encontrada.');
            window.location.href = 'solicitacoes.html';
            return;
        }

        // Mapeia os tipos de atividades para exibir o nome amigável
        const tipos = await obterTiposAtividades().catch(() => []);
        const listaTipos = Array.isArray(tipos) ? tipos : (tipos?.data || tipos?.items || []);
        const mapaTipos = {};
        listaTipos.forEach(t => {
            const tId = t.id || t._id;
            mapaTipos[tId] = t.name || t.nome || t.title;
        });

        // Busca o histórico real de alterações da solicitação
        let historico = [];
        try {
            if (typeof obterHistoricoSolicitacao === 'function') {
                const resHistorico = await obterHistoricoSolicitacao(id);
                historico = Array.isArray(resHistorico) 
                    ? resHistorico 
                    : (resHistorico?.items || resHistorico?.data || []);
            }
        } catch (e) {
            console.warn('Erro ao obter histórico da solicitação:', e);
        }

        // Renderiza as informações na tela
        preencherTela(solicitacao, mapaTipos, historico);
        renderizarHistorico(solicitacao, historico);

    } catch (error) {
        console.error('Erro ao carregar detalhes da solicitação:', error);
    }
}

function preencherTela(item, mapaTipos, historico = []) {
    const statusMap = {
        'PENDING': { text: '• Pendente', badgeClass: 'badge-pending' },
        'IN_REVIEW': { text: '• Em Análise', badgeClass: 'badge-pending' },
        'APPROVED': { text: '• Aprovada', badgeClass: 'badge-approved' },
        'REJECTED': { text: '• Rejeitada', badgeClass: 'badge-rejected' },
        'CANCELED': { text: '• Cancelada', badgeClass: 'badge-canceled' }
    };

    const rawStatus = (item.status || 'PENDING').toUpperCase();
    const statusInfo = statusMap[rawStatus] || { text: rawStatus, badgeClass: 'badge-pending' };

    // Categoria / Tipo de Atividade
    const typeId = item.activity_type_id || item.activityTypeId || item.activity_type?.id;
    const nomeAtividade = mapaTipos[typeId] || item.activity_type?.name || item.tipoAtividade || 'Atividade';

    const elCategoria = document.getElementById('detalhe-categoria');
    if (elCategoria) elCategoria.textContent = nomeAtividade;

    // Status Badge
    const elStatusBadge = document.getElementById('detalhe-status-badge');
    const elStatusTexto = document.getElementById('detalhe-status-texto');
    if (elStatusBadge) elStatusBadge.className = `status-badge ${statusInfo.badgeClass}`;
    if (elStatusTexto) elStatusTexto.textContent = statusInfo.text;

    // Título e Datas
    const elTitulo = document.getElementById('detalhe-titulo');
    if (elTitulo) elTitulo.textContent = item.title || item.titulo || nomeAtividade;

    const dataRaw = item.created_at || item.createdAt || item.submission_date;
    const dataEnvioFormatada = formatarData(dataRaw);
    
    const elDataEnvio = document.getElementById('detalhe-data-envio');
    if (elDataEnvio) elDataEnvio.textContent = `Enviada em ${dataEnvioFormatada}`;

    // Descrição e Data do evento
    const elDescricao = document.getElementById('detalhe-descricao');
    if (elDescricao) elDescricao.textContent = item.description || item.descricao || 'Sem descrição cadastrada.';

    const eventDateRaw = item.activity_date || item.event_date || item.dataAtividade || dataRaw;
    const elDataAtividade = document.getElementById('detalhe-data-atividade');
    if (elDataAtividade) elDataAtividade.textContent = formatarData(eventDateRaw);

    // Horas Solicitadas e Aprovadas
    const elHorasSolicitadas = document.getElementById('detalhe-horas-solicitadas');
    if (elHorasSolicitadas) elHorasSolicitadas.textContent = `${item.requested_hours ?? item.hours ?? item.horas ?? 0}h`;

    const horasAprovadasVal = item.accepted_hours ?? item.approved_hours;
    const elHorasAprovadas = document.getElementById('detalhe-horas-aprovadas');
    if (elHorasAprovadas) {
        elHorasAprovadas.textContent = (horasAprovadasVal !== undefined && horasAprovadasVal !== null) 
            ? `${horasAprovadasVal}h` 
            : '-';
    }

    // --- REGRA DE ANALISADOR ---
    // Verifica se houve alguma mudança de status por parte de um coordenador (IN_REVIEW, APPROVED, REJECTED)
    const foiAssumidoOuAvaliado = Array.isArray(historico) && historico.some(h => {
        const st = (h.new_status || '').toUpperCase();
        return ['IN_REVIEW', 'APPROVED', 'REJECTED'].includes(st);
    });

    let nomeAnalisador = item.reviewed_by_name || item.reviewer_name || item.reviewed_by?.name || item.reviewer?.name;

    const elAnalisadoPor = document.getElementById('detalhe-analisado-por');
    if (elAnalisadoPor) {
        if (rawStatus === 'PENDING' && !foiAssumidoOuAvaliado && !nomeAnalisador) {
            elAnalisadoPor.textContent = 'Aguardando avaliação';
        } else {
            elAnalisadoPor.textContent = nomeAnalisador || 'Thiago Al';
        }
    }

    // Observações do Avaliador
    const observacaoTexto = item.rejection_reason || item.reviewer_notes || item.observations || item.observacoes;
    const elObservacoes = document.getElementById('detalhe-observacoes');
    if (elObservacoes) elObservacoes.textContent = observacaoTexto || 'Nenhuma observação informada.';

    // 📎 ANEXO
    const anexo = (Array.isArray(item.attachments) && item.attachments.length > 0) ? item.attachments[0] : null;

    const elAnexoNome = document.getElementById('anexo-nome');
    const elAnexoSub = document.getElementById('anexo-subtexto');
    const elBtnDownload = document.getElementById('btn-download-anexo');

    if (anexo) {
        if (elAnexoNome) elAnexoNome.textContent = anexo.file_name || 'comprovante.pdf';
        if (elAnexoSub) elAnexoSub.textContent = 'Arquivo disponível para download';

        if (elBtnDownload) {
            elBtnDownload.style.setProperty('display', 'inline-flex', 'important');
            elBtnDownload.onclick = async (event) => {
                event.preventDefault();
                try {
                    await abrirAnexo(item.id, anexo.id);
                } catch (err) {
                    console.error('Erro ao abrir anexo:', err);
                    alert(err.message || 'Erro ao abrir o anexo.');
                }
            };
        }
    } else {
        if (elAnexoNome) elAnexoNome.textContent = 'Nenhum comprovante anexado';
        if (elAnexoSub) elAnexoSub.textContent = 'Nenhum arquivo encontrado nos dados da solicitação';
        if (elBtnDownload) elBtnDownload.style.setProperty('display', 'none', 'important');
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderizarHistorico(solicitacao, historico) {
    const container = document.getElementById('detalhe-timeline');
    if (!container) return;

    if (historico && historico.length > 0) {
        container.innerHTML = historico.map(item => {
            const tituloFormatado = formatarTituloStatus(item.new_status || item.status);
            const descricao = item.comment || item.description || 'Atualização no sistema';
            
            return `
                <div class="timeline-item" style="margin-bottom: 16px;">
                    <div class="timeline-content">
                        <div class="timeline-dot"></div>
                        <div>
                            <strong class="timeline-title" style="font-size: 0.95rem; color: #1e293b;">${tituloFormatado}</strong>
                            <p class="timeline-sub" style="margin: 2px 0 0 0; color: #64748b; font-size: 0.875rem;">${descricao}</p>
                        </div>
                    </div>
                    <span class="timeline-date" style="color: #94a3b8; font-size: 0.8125rem;">${formatarData(item.created_at)}</span>
                </div>
            `;
        }).join('');
        return;
    }

    container.innerHTML = `
        <div class="timeline-item">
            <div class="timeline-content">
                <div class="timeline-dot"></div>
                <div>
                    <strong class="timeline-title" style="font-size: 0.95rem; color: #1e293b;">Solicitação Enviada</strong>
                    <p class="timeline-sub" style="margin: 2px 0 0 0; color: #64748b; font-size: 0.875rem;">Solicitação registrada no sistema.</p>
                </div>
            </div>
            <span class="timeline-date" style="color: #94a3b8; font-size: 0.8125rem;">${formatarData(solicitacao?.created_at || solicitacao?.createdAt)}</span>
        </div>
    `;
}

function formatarTituloStatus(statusRaw) {
    const st = (statusRaw || '').toUpperCase();
    switch (st) {
        case 'APPROVED':
            return 'Solicitação Aprovada';
        case 'REJECTED':
            return 'Solicitação Recusada';
        case 'IN_REVIEW':
            return 'Em Análise pelo Coordenador';
        case 'CANCELED':
            return 'Solicitação Cancelada';
        case 'PENDING':
            return 'Solicitação Enviada';
        default:
            return statusRaw ? `Status: ${statusRaw}` : 'Atualização de Status';
    }
}

function formatarData(dataStr) {
    if (!dataStr) return '---';
    try {
        const d = new Date(dataStr);
        if (isNaN(d.getTime())) return dataStr;
        return d.toLocaleDateString('pt-BR');
    } catch {
        return dataStr;
    }
}