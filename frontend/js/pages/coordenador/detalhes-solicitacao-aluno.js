import { protegerRota } from '../../auth.js';
import { 
    obterSolicitacaoPorId, 
    obterTiposAtividades, 
    obterHistoricoSolicitacao, 
    assumirSolicitacao, 
    revisarSolicitacao, 
    cancelarSolicitacao,
    abrirAnexo,
    obterPerfilCoordenador,
    obterRelatorioCoordenador,
    obterSolicitacoesCoordenador
} from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';

let idSolicitacao = null;
let studentIdURL = null;
let solicitacaoAtual = null;
let idCoordenadorLogado = null;
let nomeCoordenadorLogado = '';

document.addEventListener('DOMContentLoaded', () => {
    carregarDadosPerfilCoordenador();
});

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();

    const params = new URLSearchParams(window.location.search);
    idSolicitacao = params.get('id');
    studentIdURL = params.get('student_id');

    if (!idSolicitacao) {
        exibirMensagemBanner('ID da solicitação não fornecido.', 'erro');
        setTimeout(() => { window.location.href = 'solicitacoes-alunos.html'; }, 2000);
        return;
    }

    configurarEventosBotoes();
    await carregarDadosCoordenador();
    await carregarDados();
});

function formatarMensagemErro(mensagem) {
    if (!mensagem) return 'Ocorreu um erro ao processar a solicitação.';

    let texto = String(mensagem);

    texto = texto.replace(/accepted_hours/gi, 'Horas aprovadas');
    texto = texto.replace(/requested_hours/gi, 'Horas solicitadas');
    texto = texto.replace(/rejection_reason/gi, 'Justificativa');
    texto = texto.replace(/activity_type_id/gi, 'Tipo de atividade');
    texto = texto.replace(/student_id/gi, 'Aluno');
    texto = texto.replace(/status/gi, 'Status');

    return texto;
}

function exibirMensagemBanner(mensagem, tipo = 'erro') {
    let container = document.getElementById('container-mensagem-banner');
    const cardAcoes = document.getElementById('card-acoes-disponiveis');

    if (!container) {
        container = document.createElement('div');
        container.id = 'container-mensagem-banner';
        container.style.cssText = 'margin-bottom: 20px; width: 100%;';
        
        if (cardAcoes && cardAcoes.parentNode) {
            cardAcoes.parentNode.insertBefore(container, cardAcoes);
        } else {
            document.body.prepend(container);
        }
    } else if (cardAcoes && cardAcoes.parentNode && container.nextSibling !== cardAcoes) {
        cardAcoes.parentNode.insertBefore(container, cardAcoes);
    }

    const ehErro = tipo === 'erro';
    const corBg = ehErro ? '#FEF2F2' : '#F0FDF4';
    const corTexto = ehErro ? '#EF4444' : '#16A34A';
    const corBorda = ehErro ? '#FECDD3' : '#BBF7D0';

    container.innerHTML = `
        <div style="background-color: ${corBg}; border: 1px solid ${corBorda}; color: ${corTexto}; padding: 16px 20px; border-radius: 16px; text-align: center; font-weight: 600; font-size: 0.9375rem; box-shadow: 0 2px 6px rgba(0,0,0,0.02); transition: all 0.3s ease;">
            ${mensagem}
        </div>
    `;
}

function limparMensagemBanner() {
    const container = document.getElementById('container-mensagem-banner');
    if (container) container.innerHTML = '';
}

async function carregarDadosCoordenador() {
    try {
        let coordData = null;
        if (typeof obterPerfilCoordenador === 'function') {
            coordData = await obterPerfilCoordenador();
        }
        
        if (coordData) {
            idCoordenadorLogado = coordData.id || coordData.coordinator_id || coordData.user_id;
            nomeCoordenadorLogado = coordData.name || coordData.coordinator_name || coordData.full_name || '';
        } else {
            const relatorio = await obterRelatorioCoordenador().catch(() => null);
            if (relatorio) {
                const coordObj = relatorio.coordinator || relatorio.user || relatorio;
                idCoordenadorLogado = coordObj.id || coordObj.coordinator_id || coordObj.user_id;
                nomeCoordenadorLogado = coordObj.name || coordObj.coordinator_name || coordObj.full_name || '';
            }
        }
    } catch (e) {
        console.warn("Não foi possível obter dados do perfil do coordenador:", e);
    }

    if (!idCoordenadorLogado) {
        try {
            const token = localStorage.getItem('access_token');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                idCoordenadorLogado = payload.sub || payload.user_id || payload.id || payload.coordinator_id || null;
            }
        } catch (e) {
            console.warn('Erro ao extrair ID do token JWT:', e);
        }
    }

    if (!idCoordenadorLogado) {
        idCoordenadorLogado = localStorage.getItem('user_id') || localStorage.getItem('id') || localStorage.getItem('coordinator_id') || null;
    }
}

async function carregarDados() {
    try {
        const [tiposData, itemSolicitacao, resHistorico] = await Promise.all([
            obterTiposAtividades().catch(() => []),
            obterSolicitacaoPorId(idSolicitacao),
            obterHistoricoSolicitacao(idSolicitacao).catch(() => [])
        ]);

        solicitacaoAtual = itemSolicitacao;

        if (!solicitacaoAtual) {
            exibirMensagemBanner('Solicitação não encontrada.', 'erro');
            setTimeout(() => { window.location.href = 'solicitacoes-alunos.html'; }, 2000);
            return;
        }

        const listaHistorico = Array.isArray(resHistorico) ? resHistorico : (resHistorico?.items || resHistorico?.data || []);
        const listaTipos = Array.isArray(tiposData) ? tiposData : (tiposData?.items || tiposData?.data || []);
        const tipoEncontrado = listaTipos.find(t => String(t.id) === String(solicitacaoAtual.activity_type_id));
        const nomeTipoAtividade = tipoEncontrado?.name || tipoEncontrado?.nome || 'Atividade';

        const studentObj = solicitacaoAtual.student || solicitacaoAtual.user || {};
        const studentId = studentIdURL || solicitacaoAtual.student_id || studentObj.id || solicitacaoAtual.user_id;

        const dadosHoras = await obterResumoHorasAluno(studentId);

        preencherDadosAluno(solicitacaoAtual, dadosHoras);
        preencherDadosSolicitacao(solicitacaoAtual, nomeTipoAtividade);
        gerenciarFluxoPermissoes(solicitacaoAtual, listaHistorico);

        renderizarHistorico(listaHistorico);

        if (window.lucide) {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('Erro ao carregar os dados:', err);
        const mensagemTratada = formatarMensagemErro(err.message || err.detail || err);
        exibirMensagemBanner(mensagemTratada, 'erro');
    }
}

async function obterResumoHorasAluno(studentId) {
    let horasAprovadas = 0;
    let horasExigidas = 200;
    let percentual = 0;

    if (studentId) {
        try {
            if (typeof obterRelatorioCoordenador === 'function') {
                const relatorio = await obterRelatorioCoordenador(studentId).catch(() => null);
                const summary = relatorio?.summary || relatorio?.estatisticas || relatorio;

                if (summary && (summary.total_approved_hours !== undefined || summary.approved_hours !== undefined)) {
                    horasAprovadas = Number(summary.total_approved_hours ?? summary.approved_hours ?? 0);
                    horasExigidas = Number(summary.total_required_hours ?? summary.required_hours ?? 200);
                    percentual = summary.progress_percentage !== undefined 
                        ? Number(summary.progress_percentage) 
                        : Math.min(100, Math.round((horasAprovadas / horasExigidas) * 100));

                    return { horasAprovadas, horasExigidas, percentual };
                }
            }
        } catch (e) {
            console.warn("Falha ao buscar relatório:", e);
        }

        try {
            if (typeof obterSolicitacoesCoordenador === 'function') {
                const resData = await obterSolicitacoesCoordenador().catch(() => null);
                
                if (resData) {
                    const lista = Array.isArray(resData) ? resData : (resData?.items || resData?.data || []);

                    let total = 0;
                    lista.forEach(item => {
                        const idItem = item.student_id || item.student?.id || item.user_id;
                        const statusItem = (item.status || '').toUpperCase();

                        if (String(idItem) === String(studentId) && statusItem === 'APPROVED') {
                            total += Number(item.accepted_hours ?? item.requested_hours ?? item.hours ?? 0);
                        }
                    });

                    horasAprovadas = total;
                }
            }
        } catch (e) {
            console.warn("Erro ao calcular total manual de horas:", e);
        }
    }

    const student = solicitacaoAtual?.student || solicitacaoAtual?.user || {};
    
    const hrPerfil = student.approved_hours ?? student.completed_hours ?? solicitacaoAtual?.student_completed_hours;
    if (hrPerfil !== undefined && Number(hrPerfil) > horasAprovadas) {
        horasAprovadas = Number(hrPerfil);
    }

    const hrReq = student.total_required_hours ?? student.total_hours ?? solicitacaoAtual?.student_total_hours ?? 200;
    horasExigidas = Number(hrReq);

    percentual = Math.min(100, Math.round((horasAprovadas / horasExigidas) * 100));
    if (isNaN(percentual)) percentual = 0;

    return { horasAprovadas, horasExigidas, percentual };
}

function preencherDadosAluno(data, dadosHoras) {
    const studentObj = data.student || data.user || {};
    const nome = data.student_name || studentObj.name || studentObj.full_name || 'Aluno Desconhecido';
    const rga = data.student_registration_number || studentObj.registration_number || studentObj.rga || '';
    
    const semestreVal = data.student_semester || studentObj.semester || studentObj.current_semester || data.semester || data.semestre_real;
    const semestreTexto = semestreVal ? `${semestreVal}º sem.` : '--';
    
    const horasConcluidas = dadosHoras.horasAprovadas;
    const horasTotaisExigidas = dadosHoras.horasExigidas;
    const porcentagem = dadosHoras.percentual;

    const elNome = document.getElementById('aluno-nome');
    const elAvatar = document.getElementById('aluno-avatar');
    const elSemestre = document.getElementById('aluno-semestre');
    const elCurso = document.getElementById('aluno-info-curso');
    const elProgressoTexto = document.getElementById('aluno-progresso-texto');
    const elProgressoBar = document.getElementById('aluno-progresso-bar');

    if (elNome) elNome.innerText = nome;
    if (elAvatar) elAvatar.innerText = nome.charAt(0).toUpperCase();
    if (elSemestre) elSemestre.innerText = semestreTexto;
    if (elCurso) elCurso.innerText = `Sistemas de Informação${rga ? ` · ${rga}` : ''}`;
    if (elProgressoTexto) elProgressoTexto.innerText = `${porcentagem}% · ${horasConcluidas}/${horasTotaisExigidas}h`;
    if (elProgressoBar) elProgressoBar.style.width = `${porcentagem}%`;
}

function preencherDadosSolicitacao(data, nomeTipo) {
    const elEixoTag = document.getElementById('detalhe-eixo-tag');
    const elStatusBadge = document.getElementById('detalhe-status-badge');
    const elTitulo = document.getElementById('detalhe-titulo');
    const elDataEnvio = document.getElementById('detalhe-data-envio');
    const elDescricao = document.getElementById('detalhe-descricao');
    const elDataAtividade = document.getElementById('detalhe-data-atividade');
    const elHoras = document.getElementById('detalhe-horas-solicitadas');
    const elObservacoes = document.getElementById('detalhe-observacoes');

    const elAnexoNome = document.getElementById('anexo-nome');
    const elSubtexto = document.getElementById('anexo-subtexto');
    const elBtnDownload = document.getElementById('btn-download-anexo');

    if (elEixoTag) elEixoTag.innerText = nomeTipo;

    const statusObj = formatarStatusBadge(data.status);
    
    if (elStatusBadge) {
        elStatusBadge.className = `status-badge ${statusObj.classe}`;
        elStatusBadge.style.display = 'inline-flex';
        elStatusBadge.style.alignItems = 'center';
        elStatusBadge.style.gap = '6px';
        elStatusBadge.innerHTML = `<span>•</span> <span>${statusObj.texto}</span>`;
    }

    if (elTitulo) elTitulo.innerText = data.title || data.description || 'Sem título';
    if (elDataEnvio) elDataEnvio.innerText = `Enviada em ${formatarData(data.created_at)}`;
    if (elDescricao) elDescricao.innerText = data.description || '-';
    if (elDataAtividade) elDataAtividade.innerText = formatarData(data.activity_date || data.created_at);
    if (elHoras) elHoras.innerText = `${data.requested_hours ?? data.hours ?? 0}h`;
    if (elObservacoes) elObservacoes.innerText = data.observations || data.rejection_reason || 'Nenhuma observação informada.';

    const anexo = (Array.isArray(data.attachments) && data.attachments.length > 0) ? data.attachments[0] : null;

    if (anexo) {
        if (elAnexoNome) elAnexoNome.innerText = anexo.file_name || 'comprovante.pdf';
        if (elSubtexto) elSubtexto.innerText = 'Clique para visualizar ou descarregar';
        if (elBtnDownload) {
            elBtnDownload.removeAttribute('download');
            elBtnDownload.style.display = 'inline-flex';
            elBtnDownload.onclick = async (event) => {
                event.preventDefault();
                try {
                    await abrirAnexo(data.id, anexo.id);
                } catch (err) {
                    console.error('Erro ao abrir anexo:', err);
                    const mensagemTratada = formatarMensagemErro(err.message || err.detail || err);
                    exibirMensagemBanner(mensagemTratada, 'erro');
                }
            };
        }
    } else {
        if (elAnexoNome) elAnexoNome.innerText = 'Nenhum comprovante anexado';
        if (elSubtexto) elSubtexto.innerText = 'Nenhum ficheiro associado';
        if (elBtnDownload) elBtnDownload.style.display = 'none';
    }
}

function gerenciarFluxoPermissoes(data, historico) {
    const cardAcoes = document.getElementById('card-acoes-disponiveis');
    const status = (data.status || 'PENDING').toUpperCase();

    if (['APPROVED', 'REJECTED', 'CANCELED'].includes(status)) {
        if (cardAcoes) cardAcoes.style.display = 'none';
        return;
    }

    if (cardAcoes) cardAcoes.style.display = 'block';

    const eventoAssumiu = historico.find(h => 
        ['IN_REVIEW', 'APPROVED', 'REJECTED'].includes((h.new_status || '').toUpperCase())
    );

    let nomeResponsavel = data.reviewed_by_name || data.reviewer_name;
    let idResponsavel = data.reviewed_by_id || data.reviewer_id || (typeof data.reviewed_by === 'object' ? data.reviewed_by?.id : data.reviewed_by);

    if (eventoAssumiu) {
        nomeResponsavel = nomeResponsavel || eventoAssumiu.changed_by_name || eventoAssumiu.user_name || eventoAssumiu.changed_by?.name;
        idResponsavel = idResponsavel || eventoAssumiu.changed_by_id || eventoAssumiu.user_id;
    }

    let souOResponsavel = false;
    if (idResponsavel && idCoordenadorLogado && String(idResponsavel) === String(idCoordenadorLogado)) {
        souOResponsavel = true;
    } else if (nomeResponsavel && nomeCoordenadorLogado && nomeResponsavel.trim().toLowerCase() === nomeCoordenadorLogado.trim().toLowerCase()) {
        souOResponsavel = true;
    } else if (eventoAssumiu && String(eventoAssumiu.changed_by_id) === String(idCoordenadorLogado)) {
        souOResponsavel = true;
    } else if (status === 'IN_REVIEW') {
        souOResponsavel = true;
    }

    if (status === 'PENDING' && !idResponsavel && !eventoAssumiu) {
        cardAcoes.innerHTML = `
            <div style="font-size: 1rem; font-weight: 700; color: #1e293b; margin-bottom: 12px;">Ações disponíveis</div>
            <div style="background-color: #FFFDF5; border: 1px solid #FDE68A; border-radius: 18px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="background-color: #FEF3C7; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i data-lucide="alert-circle" style="width: 24px; height: 24px; color: #D97706;"></i>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.95rem; font-weight: 700; color: #92400E;">Solicitação sem responsável</span>
                        <span style="font-size: 0.85rem; color: #D97706; margin-top: 2px;">Assuma para poder analisar.</span>
                    </div>
                </div>
                <button id="btn-assumir-solicitacao" style="padding: 10px 24px; border-radius: 20px; background: #FF9800; color: #FFFFFF; font-weight: 700; font-size: 0.9rem; border: none; cursor: pointer; box-shadow: 0 3px 8px rgba(255, 152, 0, 0.35); transition: all 0.2s ease; flex-shrink: 0;">
                    Assumir
                </button>
            </div>
        `;
        
        const btnAssumir = document.getElementById('btn-assumir-solicitacao');
        if (btnAssumir) {
            btnAssumir.addEventListener('mouseenter', () => {
                btnAssumir.style.backgroundColor = '#F57C00';
                btnAssumir.style.transform = 'translateY(-1px)';
            });
            btnAssumir.addEventListener('mouseleave', () => {
                btnAssumir.style.backgroundColor = '#FF9800';
                btnAssumir.style.transform = 'translateY(0)';
            });
            btnAssumir.addEventListener('click', eventoAssumirSolicitacao);
        }

        if (window.lucide) {
            window.lucide.createIcons();
        }
        return;
    }

    if (!souOResponsavel) {
        cardAcoes.innerHTML = `
            <div style="font-size: 1rem; font-weight: 700; color: #1e293b; margin-bottom: 12px;">Ações disponíveis</div>
            <div style="text-align: center; color: #64748b; font-size: 0.875rem; padding: 12px;">
                Apenas o coordenador ${nomeResponsavel || 'responsável'} pode avaliar esta solicitação.
            </div>
        `;
        return;
    }

    renderizarPainelAcoesResponsavel();
}

function renderizarPainelAcoesResponsavel() {
    const cardAcoes = document.getElementById('card-acoes-disponiveis');
    if (!cardAcoes) return;

    const maxHoras = solicitacaoAtual?.requested_hours || solicitacaoAtual?.hours || 0;

    cardAcoes.innerHTML = `
        <div style="font-size: 1rem; font-weight: 700; color: #1e293b; margin-bottom: 16px;">Ações disponíveis</div>
        
        <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; color: #2563EB; font-weight: 500; font-size: 0.875rem; margin-bottom: 16px;">
            <i data-lucide="check-circle-2" style="width: 20px; height: 20px; flex-shrink: 0;"></i>
            <span>Você assumiu esta solicitação como responsável.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <button id="btn-toggle-aprovar" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 16px; border: 1px solid #CBD5E1; background: #FFFFFF; font-weight: 700; color: #334155; cursor: pointer; transition: all 0.2s ease;">
                <i data-lucide="check-circle" style="width: 20px; height: 20px;"></i>
                Aprovar
            </button>
            <button id="btn-toggle-rejeitar" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 16px; border: 1px solid #CBD5E1; background: #FFFFFF; font-weight: 700; color: #334155; cursor: pointer; transition: all 0.2s ease;">
                <i data-lucide="x-circle" style="width: 20px; height: 20px;"></i>
                Rejeitar
            </button>
        </div>

        <div id="form-submeter-aprovação" style="display: none; background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 16px; padding: 20px; margin-top: 12px;">
            <label style="display: block; font-size: 0.875rem; font-weight: 700; color: #065F46; margin-bottom: 8px;">
                Horas efetivamente aprovadas <span style="color: #EF4444;">*</span>
            </label>
            <input type="number" id="input-horas-aprovadas" placeholder="Máx. ${maxHoras}h solicitadas" value="${maxHoras}" max="${maxHoras}" min="0" style="width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #E2E8F0; background: #FFFFFF; font-size: 0.9375rem; outline: none; margin-bottom: 16px;">
            <button id="btn-confirmar-aprovação" style="background-color: #059669; color: #FFFFFF; font-weight: 700; padding: 12px 20px; border-radius: 12px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                <i data-lucide="check" style="width: 18px; height: 18px;"></i>
                Confirmar aprovação
            </button>
        </div>

        <div id="form-submeter-rejeicao" style="display: none; background-color: #FEF2F2; border: 1px solid #FECDD3; border-radius: 16px; padding: 20px; margin-top: 12px;">
            <label style="display: block; font-size: 0.875rem; font-weight: 700; color: #991B1B; margin-bottom: 8px;">
                Justificativa <span style="color: #EF4444;">*</span>
            </label>
            <textarea id="textarea-justificativa" placeholder="Descreva o motivo para o aluno poder corrigir e reenviar..." style="width: 100%; height: 90px; padding: 12px 16px; border-radius: 12px; border: 1px solid #E2E8F0; background: #FFFFFF; font-size: 0.9375rem; outline: none; margin-bottom: 16px; resize: none;"></textarea>
            <button id="btn-confirmar-rejeicao" style="background-color: #DC2626; color: #FFFFFF; font-weight: 700; padding: 12px 20px; border-radius: 12px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                <i data-lucide="x" style="width: 18px; height: 18px;"></i>
                Confirmar rejeição
            </button>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    configurarAlternanciaAcoes();
}

function configurarAlternanciaAcoes() {
    const btnAprovar = document.getElementById('btn-toggle-aprovar');
    const btnRejeitar = document.getElementById('btn-toggle-rejeitar');
    const formAprovar = document.getElementById('form-submeter-aprovação');
    const formRejeitar = document.getElementById('form-submeter-rejeicao');

    if (!btnAprovar || !btnRejeitar) return;

    btnAprovar.addEventListener('click', () => {
        limparMensagemBanner();
        formRejeitar.style.display = 'none';
        formAprovar.style.display = 'block';

        btnAprovar.style.border = '2px solid #10B981';
        btnAprovar.style.backgroundColor = '#ECFDF5';
        btnAprovar.style.color = '#047857';

        btnRejeitar.style.border = '1px solid #CBD5E1';
        btnRejeitar.style.backgroundColor = '#FFFFFF';
        btnRejeitar.style.color = '#334155';
    });

    btnRejeitar.addEventListener('click', () => {
        limparMensagemBanner();
        formAprovar.style.display = 'none';
        formRejeitar.style.display = 'block';

        btnRejeitar.style.border = '2px solid #EF4444';
        btnRejeitar.style.backgroundColor = '#FEF2F2';
        btnRejeitar.style.color = '#B91C1C';

        btnAprovar.style.border = '1px solid #CBD5E1';
        btnAprovar.style.backgroundColor = '#FFFFFF';
        btnAprovar.style.color = '#334155';
    });

    document.getElementById('btn-confirmar-aprovação')?.addEventListener('click', submeterAprovacao);
    document.getElementById('btn-confirmar-rejeicao')?.addEventListener('click', submeterRejeicao);
}

async function eventoAssumirSolicitacao() {
    const btn = document.getElementById('btn-assumir-solicitacao');
    try {
        if (btn) btn.disabled = true;
        await assumirSolicitacao(idSolicitacao);
        limparMensagemBanner();
        await carregarDados();
    } catch (err) {
        console.error('Erro ao assumir:', err);
        const mensagemTratada = formatarMensagemErro(err.message || err.detail || err);
        exibirMensagemBanner(mensagemTratada, 'erro');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function submeterAprovacao() {
    limparMensagemBanner();
    const inputHoras = document.getElementById('input-horas-aprovadas');
    const btnConfirmar = document.getElementById('btn-confirmar-aprovação');
    const valorHoras = inputHoras ? inputHoras.value.trim() : '';

    if (!valorHoras || Number(valorHoras) < 0) {
        exibirMensagemBanner('Por favor, preencha todos os campos!', 'erro');
        return;
    }

    try {
        if (btnConfirmar) btnConfirmar.disabled = true;
        await revisarSolicitacao(idSolicitacao, {
            status: 'APPROVED',
            accepted_hours: Number(valorHoras)
        });
        limparMensagemBanner();
        await carregarDados();
    } catch (err) {
        console.error('Erro ao aprovar:', err);
        const mensagemTratada = formatarMensagemErro(err.message || err.detail || err);
        exibirMensagemBanner(mensagemTratada, 'erro');
    } finally {
        if (btnConfirmar) btnConfirmar.disabled = false;
    }
}

async function submeterRejeicao() {
    limparMensagemBanner();
    const txtJustificativa = document.getElementById('textarea-justificativa');
    const btnConfirmar = document.getElementById('btn-confirmar-rejeicao');
    const motivo = txtJustificativa ? txtJustificativa.value.trim() : '';

    if (!motivo) {
        exibirMensagemBanner('Por favor, preencha todos os campos!', 'erro');
        return;
    }

    try {
        if (btnConfirmar) btnConfirmar.disabled = true;
        await revisarSolicitacao(idSolicitacao, {
            status: 'REJECTED',
            accepted_hours: 0,
            rejection_reason: motivo
        });
        limparMensagemBanner();
        await carregarDados();
    } catch (err) {
        console.error('Erro ao recusar:', err);
        const mensagemTratada = formatarMensagemErro(err.message || err.detail || err);
        exibirMensagemBanner(mensagemTratada, 'erro');
    } finally {
        if (btnConfirmar) btnConfirmar.disabled = false;
    }
}

function configurarEventosBotoes() {
    const btnCancelar = document.getElementById('btn-cancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', async () => {
            try {
                btnCancelar.disabled = true;
                await cancelarSolicitacao(idSolicitacao);
                limparMensagemBanner();
                await carregarDados();
            } catch (err) {
                console.error('Erro ao cancelar:', err);
                const mensagemTratada = formatarMensagemErro(err.message || err.detail || err);
                exibirMensagemBanner(mensagemTratada, 'erro');
            } finally {
                btnCancelar.disabled = false;
            }
        });
    }
}

function formatarTituloStatus(statusRaw) {
    const st = (statusRaw || '').toUpperCase();
    switch (st) {
        case 'APPROVED':
            return 'Solicitação Aprovada';
        case 'REJECTED':
            return 'Solicitação Rejeitada';
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

function renderizarHistorico(lista) {
    const container = document.getElementById('detalhe-timeline');
    if (!container) return;

    if (lista && lista.length > 0) {
        container.innerHTML = lista.map(item => {
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
                    <p class="timeline-sub" style="margin: 2px 0 0 0; color: #64748b; font-size: 0.875rem;">Criada pelo aluno ${solicitacaoAtual?.student_name || ''}</p>
                </div>
            </div>
            <span class="timeline-date" style="color: #94a3b8; font-size: 0.8125rem;">${formatarData(solicitacaoAtual?.created_at)}</span>
        </div>
    `;
}

function formatarStatusBadge(statusRaw) {
    const st = (statusRaw || 'PENDING').toUpperCase();
    switch (st) {
        case 'APPROVED':
            return { texto: 'Aprovada', classe: 'badge-approved' };
        case 'REJECTED':
            return { texto: 'Rejeitada', classe: 'badge-rejected' };
        case 'IN_REVIEW':
            return { texto: 'Em Análise', classe: 'badge-pending' };
        case 'CANCELED':
            return { texto: 'Cancelada', classe: 'badge-canceled' };
        case 'PENDING':
        default:
            return { texto: 'Pendente', classe: 'badge-pending' };
    }
}

function formatarData(dataStr) {
    if (!dataStr) return '-';
    try {
        const d = new Date(dataStr);
        if (isNaN(d.getTime())) return dataStr;
        return d.toLocaleDateString('pt-BR');
    } catch {
        return dataStr;
    }
}