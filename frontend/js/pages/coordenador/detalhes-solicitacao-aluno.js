import { protegerRota } from '../../auth.js';
import { 
    obterSolicitacaoPorId, 
    obterHistoricoSolicitacao, 
    obterRelatorioAlunoPorId, 
    assumirSolicitacao, 
    revisarSolicitacao, 
    abrirAnexo,
    obterPerfilCoordenador,
    obterRelatorioCoordenador
} from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';

carregarDadosPerfilCoordenador();

// Variáveis globais para os dados do coordenador logado
let idCoordenadorLogado = null;
let nomeCoordenadorLogado = '';

// Captura o ID da URL (?id=...)
function obterIdSolicitacaoDaUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// Carrega perfil do coordenador para mapear o responsável
async function carregarDadosCoordenadorLogado() {
    try {
        let coordData = null;
        if (typeof obterPerfilCoordenador === 'function') {
            coordData = await obterPerfilCoordenador();
        }
        
        if (coordData) {
            idCoordenadorLogado = coordData.id || coordData.coordinator_id || coordData.user_id;
            nomeCoordenadorLogado = coordData.name || coordData.coordinator_name || coordData.full_name || '';
        } else if (typeof obterRelatorioCoordenador === 'function') {
            const relatorio = await obterRelatorioCoordenador();
            if (relatorio) {
                const coordObj = relatorio.coordinator || relatorio.user || relatorio;
                idCoordenadorLogado = coordObj.id || coordObj.coordinator_id || coordObj.user_id;
                nomeCoordenadorLogado = coordObj.name || coordObj.coordinator_name || coordObj.full_name || '';
            }
        }
    } catch (e) {
        console.warn("Não foi possível obter dados do perfil do coordenador logado:", e);
    }
}

// Formata data ISO para DD/MM/AAAA às HH:mm
function formatarDataHoraBR(dataIso) {
    if (!dataIso) return '--';
    const data = new Date(dataIso);
    if (isNaN(data.getTime())) return dataIso;
    return data.toLocaleDateString('pt-BR') + ' às ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Formata data simples DD/MM/AAAA
function formatarDataBR(dataIso) {
    if (!dataIso) return '--';
    const data = new Date(dataIso);
    if (isNaN(data.getTime())) return dataIso;
    return data.toLocaleDateString('pt-BR');
}

// Retorna estilo e rótulo do badge de status
function obterStatusConfig(status) {
    const st = String(status || '').toUpperCase().trim();
    switch (st) {
        case 'APPROVED':
        case 'APROVADA':
            return { label: 'Aprovada', class: 'status-badge badge-approved' };
        case 'REJECTED':
        case 'REJEITADA':
            return { label: 'Rejeitada', class: 'status-badge badge-rejected' };
        case 'UNDER_REVIEW':
        case 'EM_ANALISE':
        case 'IN_REVIEW':
            return { label: 'Em Análise', class: 'status-badge badge-pending' };
        case 'PENDING':
        case 'PENDENTE':
        default:
            return { label: 'Pendente', class: 'status-badge badge-pending' };
    }
}

// Traduz termos de erros técnicos de API para mensagens amigáveis em português
function formatarMensagemErroAPI(msgBruta) {
    if (!msgBruta) return 'Ocorreu um erro ao processar a requisição.';

    let texto = String(msgBruta);

    texto = texto.replace(/accepted_hours/gi, 'As horas aprovadas');
    texto = texto.replace(/granted_hours/gi, 'As horas concedidas');
    texto = texto.replace(/requested_hours/gi, 'As horas solicitadas');
    texto = texto.replace(/justification/gi, 'A justificativa');
    texto = texto.replace(/rejection_reason/gi, 'O motivo da rejeição');
    texto = texto.replace(/status/gi, 'O status');

    texto = texto.charAt(0).toUpperCase() + texto.slice(1);

    return texto;
}

// Exibe mensagem dinâmica exatamente ACIMA do card-acoes-disponiveis
function exibirBannerMensagem(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('container-mensagem-banner');
    const cardAcoes = document.getElementById('card-acoes-disponiveis');

    if (!container && cardAcoes && cardAcoes.parentNode) {
        container = document.createElement('div');
        container.id = 'container-mensagem-banner';
        cardAcoes.parentNode.insertBefore(container, cardAcoes);
    } else if (container && cardAcoes && container.nextElementSibling !== cardAcoes) {
        cardAcoes.parentNode.insertBefore(container, cardAcoes);
    }

    if (!container) return;

    const mensagemTratada = tipo === 'erro' ? formatarMensagemErroAPI(mensagem) : mensagem;

    const corBg = tipo === 'sucesso' ? '#dcfce7' : '#fee2e2';
    const corTexto = tipo === 'sucesso' ? '#15803d' : '#b91c1c';
    const corBorda = tipo === 'sucesso' ? '#bbf7d0' : '#fca5a5';

    container.innerHTML = `
        <div style="background-color: ${corBg}; color: ${corTexto}; border: 1px solid ${corBorda}; padding: 14px 20px; border-radius: 16px; margin-bottom: 20px; font-weight: 600; font-size: 14px;">
            ${mensagemTratada}
        </div>
    `;

    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Busca o relatório do aluno por ID e preenche o card superior de progresso
async function carregarEPreencherProgressoAluno(studentId) {
    if (!studentId) return;

    try {
        const reportData = await obterRelatorioAlunoPorId(studentId);
        if (!reportData) return;

        const student = reportData.student || {};
        const course = reportData.course || {};
        const summary = reportData.summary || {};

        const totalAprovadas = summary.total_approved_hours || 0;
        const totalExigidas = summary.total_required_hours || course.total_required_hours || 0;
        const porcentagem = summary.progress_percentage !== undefined 
            ? Math.round(summary.progress_percentage) 
            : (totalExigidas > 0 ? Math.round((totalAprovadas / totalExigidas) * 100) : 0);

        const elNome = document.getElementById('aluno-nome');
        const elAvatar = document.getElementById('aluno-avatar');
        if (elNome) elNome.innerText = student.name || 'Aluno';
        if (elAvatar) {
            const partes = (student.name || 'A').trim().split(' ');
            const inicial = partes[0].charAt(0).toUpperCase();
            elAvatar.innerText = inicial;
        }

        const elSemestre = document.getElementById('aluno-semestre');
        if (elSemestre) {
            elSemestre.innerText = student.current_semester 
                ? `${student.current_semester}º Semestre` 
                : 'Semestre --';
        }

        const elCurso = document.getElementById('aluno-info-curso');
        if (elCurso) {
            const nomeCurso = course.name || 'Sistemas de Informação';
            const mat = student.registration_number ? ` · Mat: ${student.registration_number}` : '';
            elCurso.innerText = `${nomeCurso}${mat}`;
        }

        const elProgressoTexto = document.getElementById('aluno-progresso-texto');
        if (elProgressoTexto) {
            elProgressoTexto.innerText = `${porcentagem}% · ${totalAprovadas}/${totalExigidas}h`;
        }

        const elProgressoBar = document.getElementById('aluno-progresso-bar');
        if (elProgressoBar) {
            const larguraVisual = Math.min(porcentagem, 100);
            elProgressoBar.style.width = `${larguraVisual}%`;
        }

    } catch (error) {
        console.error('Erro ao carregar relatório do aluno:', error);
    }
}

// Preenche dados da solicitação
function preencherDetalhesSolicitacao(solicitacao) {
    if (!solicitacao) return;

    const elEixo = document.getElementById('detalhe-eixo-tag');
    if (elEixo) elEixo.innerText = solicitacao.activity_type_name || solicitacao.category || solicitacao.activity_type?.name || 'Atividade Complementar';

    const elStatus = document.getElementById('detalhe-status-badge');
    if (elStatus) {
        const statusConfig = obterStatusConfig(solicitacao.status);
        elStatus.className = statusConfig.class;
        elStatus.innerText = statusConfig.label;
    }

    const elTitulo = document.getElementById('detalhe-titulo');
    if (elTitulo) elTitulo.innerText = solicitacao.title || 'Sem título';

    const elDataEnvio = document.getElementById('detalhe-data-envio');
    if (elDataEnvio) {
        const dataFormatada = formatarDataBR(solicitacao.created_at || solicitacao.created_date);
        elDataEnvio.innerText = `Enviado em ${dataFormatada}`;
    }

    const elDescricao = document.getElementById('detalhe-descricao');
    if (elDescricao) elDescricao.innerText = solicitacao.description || 'Sem descrição cadastrada.';

    const elDataAtividade = document.getElementById('detalhe-data-atividade');
    if (elDataAtividade) {
        elDataAtividade.innerText = formatarDataBR(solicitacao.activity_date || solicitacao.date);
    }

    const elHoras = document.getElementById('detalhe-horas-solicitadas');
    if (elHoras) {
        const horas = solicitacao.requested_hours || solicitacao.hours || 0;
        elHoras.innerText = `${horas}h`;
    }

    const elObservacoes = document.getElementById('detalhe-observacoes');
    if (elObservacoes) {
        elObservacoes.innerText = solicitacao.justification || solicitacao.notes || solicitacao.rejection_reason || 'Nenhuma observação.';
    }

    const elAnexoNome = document.getElementById('anexo-nome');
    const elBtnDownload = document.getElementById('btn-download-anexo');
    const anexos = solicitacao.attachments || solicitacao.files || [];

    if (anexos.length > 0) {
        const primeiroAnexo = anexos[0];
        const nomeArquivo = primeiroAnexo.filename || primeiroAnexo.original_name || 'comprovante.pdf';
        
        if (elAnexoNome) elAnexoNome.innerText = nomeArquivo;

        if (elBtnDownload) {
            elBtnDownload.style.display = 'inline-flex';
            elBtnDownload.onclick = async (e) => {
                e.preventDefault();
                try {
                    await abrirAnexo(solicitacao.id, primeiroAnexo.id);
                } catch (err) {
                    alert('Erro ao abrir o comprovante. Tente novamente.');
                }
            };
        }
    } else {
        if (elAnexoNome) elAnexoNome.innerText = 'Nenhum arquivo anexado';
        if (elBtnDownload) elBtnDownload.style.display = 'none';
    }
}

// Renderiza a área de ações
function renderizarCardAcoes(solicitacao) {
    const cardAcoes = document.getElementById('card-acoes-disponiveis');
    if (!cardAcoes) return;

    cardAcoes.style.display = 'block';
    const status = String(solicitacao.status || '').toUpperCase().trim();

    // 1. Estado "Solicitação sem responsável" (caixa amarela)
    if (status === 'PENDING' || status === 'PENDENTE') {
        cardAcoes.innerHTML = `
            <h3 style="font-size: 16px; font-weight: 800; color: #1e293b; margin: 0 0 16px 0;">Ações disponíveis</h3>
            
            <div style="background-color: #fffbeb; border: 1.5px solid #fde68a; border-radius: 20px; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 48px; height: 48px; border-radius: 14px; background-color: #fef3c7; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #d97706;">
                        <i data-lucide="alert-circle" style="width: 24px; height: 24px;"></i>
                    </div>
                    <div>
                        <strong style="font-size: 16px; font-weight: 800; color: #78350f; display: block; margin-bottom: 2px;">
                            Solicitação sem responsável
                        </strong>
                        <span style="font-size: 14px; font-weight: 600; color: #d97706;">
                            Assuma para poder analisar.
                        </span>
                    </div>
                </div>

                <button id="btn-assumir-solicitacao" type="button" style="background-color: #f59e0b; color: #ffffff; border: none; padding: 12px 32px; border-radius: 999px; font-size: 15px; font-weight: 800; cursor: pointer; transition: background 0.2s ease; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);">
                    Assumir
                </button>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        document.getElementById('btn-assumir-solicitacao')?.addEventListener('click', async () => {
            try {
                const resultado = await assumirSolicitacao(solicitacao.id);
                
                solicitacao.status = 'UNDER_REVIEW';
                solicitacao.reviewer_id = resultado?.reviewer_id || idCoordenadorLogado;
                solicitacao.reviewed_by_name = resultado?.reviewer_name || resultado?.changed_by_name || nomeCoordenadorLogado;

                preencherDetalhesSolicitacao(solicitacao);
                renderizarCardAcoes(solicitacao);
                await carregarHistorico(solicitacao.id, solicitacao);
            } catch (err) {
                exibirBannerMensagem(err.message || 'Erro ao assumir solicitação.', 'erro');
            }
        });
    } 
    // 2. Estado "Em Análise" (Aprovar / Rejeitar)
    else if (status === 'UNDER_REVIEW' || status === 'EM_ANALISE' || status === 'IN_REVIEW') {
        const horasSolicitadas = solicitacao.requested_hours || solicitacao.hours || 0;

        cardAcoes.innerHTML = `
            <h3 style="font-size: 16px; font-weight: 800; color: #1e293b; margin: 0 0 16px 0;">Ações disponíveis</h3>
            
            <div style="background-color: #eff6ff; border: 1px solid #dbeafe; border-radius: 14px; padding: 14px 20px; display: flex; align-items: center; gap: 10px; color: #1d4ed8; font-weight: 700; font-size: 14px; margin-bottom: 16px;">
                <i data-lucide="check-circle" style="width: 20px; height: 20px;"></i>
                <span>Você assumiu esta solicitação como responsável.</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                <button type="button" id="tab-btn-aprovar" style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 800; color: #334155; cursor: pointer; transition: all 0.2s ease;">
                    <i data-lucide="check-circle" style="width: 20px; height: 20px;"></i>
                    <span>Aprovar</span>
                </button>

                <button type="button" id="tab-btn-rejeitar" style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 800; color: #334155; cursor: pointer; transition: all 0.2s ease;">
                    <i data-lucide="x-circle" style="width: 20px; height: 20px;"></i>
                    <span>Rejeitar</span>
                </button>
            </div>

            <div id="form-container-aprovar" style="display: none; background-color: #f0fdf4; border: 1.5px solid #86efac; border-radius: 16px; padding: 20px;">
                <label style="display: block; font-size: 14px; font-weight: 800; color: #166534; margin-bottom: 8px;">
                    Horas efetivamente aprovadas <span style="color: #dc2626;">*</span>
                </label>
                <input type="number" id="input-horas-efetivas" value="${horasSolicitadas}" placeholder="Máx. ${horasSolicitadas}h solicitadas" style="width: 100%; padding: 14px 16px; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 14px; margin-bottom: 16px; outline: none; background: #ffffff;" />
                
                <button type="button" id="btn-confirmar-aprovação" style="background-color: #059669; color: white; border: none; padding: 12px 24px; font-size: 14px; font-weight: 800; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="check" style="width: 18px; height: 18px;"></i>
                    <span>Confirmar aprovação</span>
                </button>
            </div>

            <div id="form-container-rejeitar" style="display: none; background-color: #fef2f2; border: 1.5px solid #fca5a5; border-radius: 16px; padding: 20px;">
                <label style="display: block; font-size: 14px; font-weight: 800; color: #991b1b; margin-bottom: 8px;">
                    Justificativa <span style="color: #dc2626;">*</span>
                </label>
                <textarea id="textarea-motivo-rejeicao" rows="3" placeholder="Descreva o motivo para o aluno poder corrigir e reenviar..." style="width: 100%; padding: 14px 16px; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 14px; margin-bottom: 16px; outline: none; background: #ffffff; resize: vertical;"></textarea>
                
                <button type="button" id="btn-confirmar-rejeicao" style="background-color: #dc2626; color: white; border: none; padding: 12px 24px; font-size: 14px; font-weight: 800; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="x-circle" style="width: 18px; height: 18px;"></i>
                    <span>Confirmar rejeição</span>
                </button>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        const tabAprovar = document.getElementById('tab-btn-aprovar');
        const tabRejeitar = document.getElementById('tab-btn-rejeitar');
        const formAprovar = document.getElementById('form-container-aprovar');
        const formRejeitar = document.getElementById('form-container-rejeitar');

        tabAprovar?.addEventListener('click', () => {
            formAprovar.style.display = 'block';
            formRejeitar.style.display = 'none';

            tabAprovar.style.borderColor = '#10b981';
            tabAprovar.style.backgroundColor = '#ecfdf5';
            tabAprovar.style.color = '#047857';

            tabRejeitar.style.borderColor = '#e2e8f0';
            tabRejeitar.style.backgroundColor = '#ffffff';
            tabRejeitar.style.color = '#334155';
        });

        tabRejeitar?.addEventListener('click', () => {
            formRejeitar.style.display = 'block';
            formAprovar.style.display = 'none';

            tabRejeitar.style.borderColor = '#ef4444';
            tabRejeitar.style.backgroundColor = '#fef2f2';
            tabRejeitar.style.color = '#b91c1c';

            tabAprovar.style.borderColor = '#e2e8f0';
            tabAprovar.style.backgroundColor = '#ffffff';
            tabAprovar.style.color = '#334155';
        });

        document.getElementById('btn-confirmar-aprovação')?.addEventListener('click', async () => {
            const inputHoras = document.getElementById('input-horas-efetivas');
            const horasVal = inputHoras ? parseFloat(inputHoras.value) : 0;
            
            if (isNaN(horasVal) || horasVal < 0) {
                exibirBannerMensagem('Informe uma quantidade de horas válida.', 'erro');
                return;
            }

            await processarDecisao(solicitacao, 'APPROVED', horasVal, '');
        });

        document.getElementById('btn-confirmar-rejeicao')?.addEventListener('click', async () => {
            const txtMotivo = document.getElementById('textarea-motivo-rejeicao');
            const motivoVal = txtMotivo ? txtMotivo.value.trim() : '';

            if (!motivoVal) {
                exibirBannerMensagem('Para rejeitar, é obrigatório preencher a justificativa.', 'erro');
                return;
            }
            await processarDecisao(solicitacao, 'REJECTED', 0, motivoVal);
        });
    } 
    // 3. Caso já esteja finalizada
    else {
        cardAcoes.style.display = 'none';
    }
}

// Submete a decisão para a API
async function processarDecisao(solicitacao, novoStatus, horasConcedidas, justificativa) {
    try {
        const payload = {
            status: novoStatus,
            accepted_hours: novoStatus === 'APPROVED' ? horasConcedidas : 0,
            granted_hours: novoStatus === 'APPROVED' ? horasConcedidas : 0,
            justification: justificativa
        };

        await revisarSolicitacao(solicitacao.id, payload);

        exibirBannerMensagem(`Solicitação ${novoStatus === 'APPROVED' ? 'aprovada' : 'rejeitada'} com sucesso!`, 'sucesso');

        solicitacao.status = novoStatus;
        solicitacao.accepted_hours = novoStatus === 'APPROVED' ? horasConcedidas : 0;
        solicitacao.granted_hours = novoStatus === 'APPROVED' ? horasConcedidas : 0;
        solicitacao.justification = justificativa;

        preencherDetalhesSolicitacao(solicitacao);
        renderizarCardAcoes(solicitacao);
        await carregarHistorico(solicitacao.id, solicitacao);

        const studentId = solicitacao.student_id || solicitacao.student?.id;
        if (studentId) {
            await carregarEPreencherProgressoAluno(studentId);
        }

    } catch (err) {
        exibirBannerMensagem(err.message || 'Erro ao processar a decisão.', 'erro');
    }
}

// Mapeia ações e cria formatação rica para o histórico
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

// Extrai o nome do responsável
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

    if (item.changed_by_id && String(item.changed_by_id) === String(idCoordenadorLogado)) {
        return nomeCoordenadorLogado || 'Coordenador';
    }

    const acao = String(item.action || item.type || '').toUpperCase();
    const status = String(item.status_to || item.new_status || item.status || '').toUpperCase();

    if (acao.includes('CREATE') || acao.includes('SUBMIT') || status === 'PENDING') {
        return solicitacao?.student?.name || solicitacao?.student_name || 'Aluno';
    }

    const nomeCoordenador = solicitacao?.reviewed_by_name || solicitacao?.reviewer_name || solicitacao?.reviewer?.name || nomeCoordenadorLogado;
    if (nomeCoordenador) {
        return nomeCoordenador;
    }

    return 'Coordenador';
}

// Carrega e renderiza o histórico
async function carregarHistorico(idSolicitacao, solicitacao = null) {
    const container = document.getElementById('detalhe-timeline');
    if (!container) return;

    try {
        const historico = await obterHistoricoSolicitacao(idSolicitacao);
        
        let lista = [];
        if (Array.isArray(historico)) {
            lista = historico;
        } else if (historico && typeof historico === 'object') {
            lista = historico.history || historico.items || historico.data || historico.timeline || [];
        }

        if (lista.length === 0) {
            container.innerHTML = '<p style="color: #94a3b8; font-size: 13px;">Nenhum registro de histórico disponível.</p>';
            return;
        }

        container.innerHTML = lista.map(item => {
            const dataFmt = formatarDataHoraBR(item.created_at || item.date || item.timestamp);
            const { titulo, iconeCor, bgCor } = extrairInfoHistorico(item);
            const responsavelTexto = extrairNomeResponsavel(item, solicitacao);

            const acao = String(item.action || item.type || '').toUpperCase();
            const statusPara = String(item.status_to || item.new_status || item.status || '').toUpperCase();

            const isAprovado = acao.includes('APPROVE') || statusPara === 'APPROVED';
            const isRejeitado = acao.includes('REJECT') || statusPara === 'REJECTED';

            // Extrai as horas aprovadas do item do histórico ou da própria solicitação
            const horasAprovadasVal = item.accepted_hours !== undefined && item.accepted_hours !== null 
                ? item.accepted_hours 
                : (item.granted_hours !== undefined && item.granted_hours !== null ? item.granted_hours : solicitacao?.accepted_hours || solicitacao?.granted_hours);

            // Extrai a justificativa / motivo da rejeição
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

                        <!-- Destaque para Horas Aprovadas caso o evento seja de Aprovação -->
                        ${isAprovado && horasAprovadasVal !== undefined && horasAprovadasVal !== null ? `
                            <div style="margin-top: 8px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #166534; font-weight: 700;">
                                Horas Aprovadas: <span style="font-size: 15px; font-weight: 800;">${horasAprovadasVal}h</span>
                            </div>
                        ` : ''}

                        <!-- Destaque para Motivo da Rejeição caso o evento seja de Rejeição -->
                        ${isRejeitado && motivoRejeicaoVal ? `
                            <div style="margin-top: 8px; background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #991b1b; line-height: 1.4;">
                                <strong>Motivo da Rejeição:</strong> ${motivoRejeicaoVal}
                            </div>
                        ` : ''}

                        <!-- Observações gerais em outros tipos de ações -->
                        ${!isAprovado && !isRejeitado && motivoRejeicaoVal ? `
                            <div style="margin-top: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #475569; line-height: 1.4;">
                                <strong>Observação:</strong> ${motivoRejeicaoVal}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        container.innerHTML = '<p style="color: #94a3b8; font-size: 13px;">Não foi possível carregar o histórico.</p>';
    }
}

// Inicialização principal da página
document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();

    await carregarDadosCoordenadorLogado();

    const idSolicitacao = obterIdSolicitacaoDaUrl();

    if (!idSolicitacao) {
        exibirBannerMensagem('ID de solicitação inválido ou não informado na URL.', 'erro');
        return;
    }

    try {
        const solicitacao = await obterSolicitacaoPorId(idSolicitacao);

        preencherDetalhesSolicitacao(solicitacao);
        renderizarCardAcoes(solicitacao);

        const studentId = solicitacao.student_id || solicitacao.student?.id;
        if (studentId) {
            await carregarEPreencherProgressoAluno(studentId);
        }

        await carregarHistorico(idSolicitacao, solicitacao);

        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (error) {
        console.error('Erro ao carregar dados da solicitação:', error);
        exibirBannerMensagem('Erro ao carregar dados da solicitação.', 'erro');
    }
});