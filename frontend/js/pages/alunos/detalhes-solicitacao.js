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

        // Renderiza as informações na tela e o histórico detalhado
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
        'UNDER_REVIEW': { text: '• Em Análise', badgeClass: 'badge-pending' },
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

    const horasAprovadasVal = item.accepted_hours ?? item.granted_hours ?? item.approved_hours;
    const elHorasAprovadas = document.getElementById('detalhe-horas-aprovadas');
    if (elHorasAprovadas) {
        elHorasAprovadas.textContent = (horasAprovadasVal !== undefined && horasAprovadasVal !== null) 
            ? `${horasAprovadasVal}h` 
            : '-';
    }

    // --- REGRA DE ANALISADOR ---
    const foiAssumidoOuAvaliado = Array.isArray(historico) && historico.some(h => {
        const st = (h.new_status || h.status_to || h.status || '').toUpperCase();
        return ['IN_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(st);
    });

    let nomeAnalisador = item.reviewed_by_name || item.reviewer_name || item.reviewed_by?.name || item.reviewer?.name;

    const elAnalisadoPor = document.getElementById('detalhe-analisado-por');
    if (elAnalisadoPor) {
        if (rawStatus === 'PENDING' && !foiAssumidoOuAvaliado && !nomeAnalisador) {
            elAnalisadoPor.textContent = 'Aguardando avaliação';
        } else {
            elAnalisadoPor.textContent = nomeAnalisador || 'Coordenador';
        }
    }

    // Observações do Avaliador
    const observacaoTexto = item.rejection_reason || item.justification || item.reviewer_notes || item.observations || item.observacoes;
    const elObservacoes = document.getElementById('detalhe-observacoes');
    if (elObservacoes) elObservacoes.textContent = observacaoTexto || 'Nenhuma observação informada.';

    // 📎 ANEXO
    const anexo = (Array.isArray(item.attachments) && item.attachments.length > 0) ? item.attachments[0] : null;

    const elAnexoNome = document.getElementById('anexo-nome');
    const elAnexoSub = document.getElementById('anexo-subtexto');
    const elBtnDownload = document.getElementById('btn-download-anexo');

    if (anexo) {
        if (elAnexoNome) elAnexoNome.textContent = anexo.file_name || anexo.filename || 'comprovante.pdf';
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

// Extrai título, cor do badge e marcador circular dinâmico
function extrairInfoHistorico(item) {
    const acao = String(item.action || item.type || item.event || '').toUpperCase();
    const stPara = String(item.status_to || item.new_status || item.status || '').toUpperCase();
    const stDe = String(item.status_from || '').toUpperCase();

    let titulo = item.title || item.action || 'Atualização';
    let iconeCor = '#2563eb';
    let bgCor = '#e0f2fe';

    if (acao.includes('CREATE') || acao.includes('SUBMIT') || acao.includes('CRIADA') || stPara === 'PENDING') {
        titulo = 'Solicitação criada pelo aluno';
        iconeCor = '#0284c7';
        bgCor = '#e0f2fe';
    } else if (acao.includes('ASSUME') || acao.includes('ASSUMIDA') || stPara.includes('UNDER_REVIEW') || stPara.includes('IN_REVIEW')) {
        titulo = 'Análise assumida pelo coordenador';
        iconeCor = '#d97706';
        bgCor = '#fef3c7';
    } else if (acao.includes('APPROVE') || stPara.includes('APPROVED')) {
        titulo = 'Solicitação aprovada';
        iconeCor = '#16a34a';
        bgCor = '#dcfce7';
    } else if (acao.includes('REJECT') || stPara.includes('REJECTED')) {
        titulo = 'Solicitação rejeitada';
        iconeCor = '#dc2626';
        bgCor = '#fee2e2';
    } else if (stDe && stPara) {
        titulo = `Status alterado de ${stDe} para ${stPara}`;
    }

    return { titulo, iconeCor, bgCor };
}

// Mapeia quem realizou a ação
function extrairNomeResponsavel(item, solicitacao = null) {
    const nomeNoHistorico = item.changed_by_name 
        || item.user_name 
        || item.changed_by?.name 
        || item.created_by_name 
        || item.reviewer_name 
        || item.author 
        || item.user?.name;

    if (nomeNoHistorico) {
        return nomeNoHistorico;
    }

    const acao = String(item.action || item.type || '').toUpperCase();
    const status = String(item.status_to || item.new_status || item.status || '').toUpperCase();

    if (acao.includes('CREATE') || acao.includes('SUBMIT') || status === 'PENDING') {
        return solicitacao?.student?.name || solicitacao?.student_name || 'Aluno';
    }

    const nomeCoordenador = solicitacao?.reviewed_by_name || solicitacao?.reviewer_name || solicitacao?.reviewer?.name;
    if (nomeCoordenador) {
        return nomeCoordenador;
    }

    return 'Coordenador';
}

// Renderiza o histórico exatamente no mesmo padrão visual da tela do coordenador
function renderizarHistorico(solicitacao, historico) {
    const container = document.getElementById('detalhe-timeline');
    if (!container) return;

    let lista = Array.isArray(historico) ? historico : (historico?.items || historico?.data || []);

    if (lista && lista.length > 0) {
        container.innerHTML = lista.map(item => {
            const dataFmt = formatarDataHoraBR(item.created_at || item.date || item.timestamp);
            const { titulo, iconeCor, bgCor } = extrairInfoHistorico(item);
            const responsavelTexto = extrairNomeResponsavel(item, solicitacao);

            const acao = String(item.action || item.type || '').toUpperCase();
            const statusPara = String(item.status_to || item.new_status || item.status || '').toUpperCase();

            const isAprovado = acao.includes('APPROVE') || statusPara === 'APPROVED';
            const isRejeitado = acao.includes('REJECT') || statusPara === 'REJECTED';

            const horasAprovadasVal = item.accepted_hours !== undefined && item.accepted_hours !== null 
                ? item.accepted_hours 
                : (item.granted_hours !== undefined && item.granted_hours !== null ? item.granted_hours : solicitacao?.accepted_hours || solicitacao?.granted_hours);

            const motivoRejeicaoVal = item.justification || item.comment || item.rejection_reason || item.notes || solicitacao?.justification || solicitacao?.rejection_reason;

            return `
                <div style="display: flex; gap: 14px; border-left: 2px solid #e2e8f0; padding-left: 18px; position: relative; padding-bottom: 20px;">
                    <div style="position: absolute; left: -7px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background-color: ${iconeCor}; border: 2px solid #ffffff;"></div>
                    
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 4px;">
                            <span style="font-size: 12px; font-weight: 800; color: ${iconeCor}; background-color: ${bgCor}; padding: 2px 10px; border-radius: 999px;">
                                ${titulo}
                            </span>
                            <span style="font-size: 12px; font-weight: 600; color: #94a3b8;">
                                ${dataFmt}
                            </span>
                        </div>

                        <div style="font-size: 13px; color: #334155; font-weight: 600; margin-top: 6px;">
                            Por: <span style="color: #0f172a; font-weight: 700;">${responsavelTexto}</span>
                        </div>

                        ${isAprovado && horasAprovadasVal !== undefined && horasAprovadasVal !== null ? `
                            <div style="margin-top: 8px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #166534; font-weight: 700;">
                                Horas Aprovadas: <span style="font-size: 15px; font-weight: 800;">${horasAprovadasVal}h</span>
                            </div>
                        ` : ''}

                        ${isRejeitado && motivoRejeicaoVal ? `
                            <div style="margin-top: 8px; background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #991b1b; line-height: 1.4;">
                                <strong>Motivo da Rejeição:</strong> ${motivoRejeicaoVal}
                            </div>
                        ` : ''}

                        ${!isAprovado && !isRejeitado && motivoRejeicaoVal ? `
                            <div style="margin-top: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #475569; line-height: 1.4;">
                                <strong>Observação:</strong> ${motivoRejeicaoVal}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    // Fallback padrão se não houver histórico registrado
    container.innerHTML = `
        <div style="display: flex; gap: 14px; border-left: 2px solid #e2e8f0; padding-left: 18px; position: relative;">
            <div style="position: absolute; left: -7px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background-color: #0284c7; border: 2px solid #ffffff;"></div>
            <div style="flex: 1;">
                <span style="font-size: 12px; font-weight: 800; color: #0284c7; background-color: #e0f2fe; padding: 2px 10px; border-radius: 999px;">
                    Solicitação criada pelo aluno
                </span>
                <span style="font-size: 12px; font-weight: 600; color: #94a3b8; float: right;">
                    ${formatarDataHoraBR(solicitacao?.created_at || solicitacao?.createdAt)}
                </span>
                <div style="font-size: 13px; color: #334155; font-weight: 600; margin-top: 6px;">
                    Por: <span style="color: #0f172a; font-weight: 700;">${solicitacao?.student?.name || solicitacao?.student_name || 'Aluno'}</span>
                </div>
            </div>
        </div>
    `;
}

function formatarDataHoraBR(dataIso) {
    if (!dataIso) return '--';
    const data = new Date(dataIso);
    if (isNaN(data.getTime())) return dataIso;
    return data.toLocaleDateString('pt-BR') + ' às ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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