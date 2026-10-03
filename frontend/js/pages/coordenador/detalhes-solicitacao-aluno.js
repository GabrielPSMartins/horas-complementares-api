import { protegerRota } from '../../auth.js';
import { obterSolicitacaoPorId, obterTiposAtividades, obterHistoricoSolicitacao,assumirSolicitacao, revisarSolicitacao, abrirAnexo} from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';

let idSolicitacao = null;
let solicitacaoAtual = null;
let idUsuarioLogado = null;

document.addEventListener('DOMContentLoaded', () => {
    carregarDadosPerfilCoordenador();
});

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();

    idUsuarioLogado = obterIdUsuarioLogado();

    const params = new URLSearchParams(window.location.search);
    idSolicitacao = params.get('id');

    if (!idSolicitacao) {
        alert('ID da solicitação não fornecido.');
        window.location.href = 'solicitacoes-alunos.html';
        return;
    }

    configurarEventosBotoes();
    await carregarDados();
});

// Extrai o ID do utilizador logado do JWT ou LocalStorage
function obterIdUsuarioLogado() {
    try {
        const token = localStorage.getItem('access_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.sub || payload.user_id || payload.id || payload.user?.id || null;
        }
    } catch (e) {
        console.warn('Erro ao extrair ID do token JWT:', e);
    }
    return localStorage.getItem('user_id') || localStorage.getItem('id') || null;
}

async function carregarDados() {
    try {
        const [tiposData, itemSolicitacao] = await Promise.all([
            obterTiposAtividades().catch(() => []),
            obterSolicitacaoPorId(idSolicitacao)
        ]);

        solicitacaoAtual = itemSolicitacao;

        if (!solicitacaoAtual) {
            alert('Solicitação não encontrada.');
            window.location.href = 'solicitacoes-alunos.html';
            return;
        }

        const listaTipos = Array.isArray(tiposData) ? tiposData : (tiposData?.items || tiposData?.data || []);
        const tipoEncontrado = listaTipos.find(t => String(t.id) === String(solicitacaoAtual.activity_type_id));
        const nomeTipoAtividade = tipoEncontrado?.name || tipoEncontrado?.nome || 'Atividade';

        preencherDadosAluno(solicitacaoAtual);
        preencherDadosSolicitacao(solicitacaoAtual, nomeTipoAtividade);
        gerenciarFluxoPermissoes(solicitacaoAtual);

        await carregarHistorico();

        if (window.lucide) {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('Erro ao carregar os dados:', err);
        alert('Erro ao carregar detalhes da solicitação.');
    }
}

function preencherDadosAluno(data) {
    const studentObj = data.student || data.user || {};
    const nome = data.student_name || studentObj.name || studentObj.full_name || 'Aluno Desconhecido';
    const rga = data.student_registration_number || studentObj.registration_number || studentObj.rga || '';
    const semestreTexto = (data.student_semester || studentObj.semester) ? `${data.student_semester || studentObj.semester}º sem.` : '--';
    
    const horasConcluidas = data.student_completed_hours ?? studentObj.completed_hours ?? 0;
    const horasTotais = data.student_total_hours ?? studentObj.total_hours ?? 200;
    const porcentagem = Math.min(Math.round((horasConcluidas / horasTotais) * 100), 100);

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
    if (elProgressoTexto) elProgressoTexto.innerText = `${porcentagem}% · ${horasConcluidas}/${horasTotais}h`;
    if (elProgressoBar) elProgressoBar.style.width = `${porcentagem}%`;
}

function preencherDadosSolicitacao(data, nomeTipo) {
    const elEixoTag = document.getElementById('detalhe-eixo-tag');
    const elStatusBadge = document.getElementById('detalhe-status-badge');
    const elStatusTexto = document.getElementById('detalhe-status-texto');
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

    const statusObj = obterStatusClasseETexto(data.status);
    if (elStatusBadge) {
        elStatusBadge.className = `status-badge ${statusObj.classeCSS}`;
    }
    if (elStatusTexto) elStatusTexto.innerText = statusObj.texto;

    if (elTitulo) elTitulo.innerText = data.title || data.description || 'Sem título';
    if (elDataEnvio) elDataEnvio.innerText = `Enviada em ${formatarData(data.created_at)}`;
    if (elDescricao) elDescricao.innerText = data.description || '-';
    if (elDataAtividade) elDataAtividade.innerText = formatarData(data.activity_date || data.created_at);
    if (elHoras) elHoras.innerText = `${data.requested_hours ?? 0}h`;
    if (elObservacoes) elObservacoes.innerText = data.observations || data.rejection_reason || 'Nenhuma observação informada.';

    // --- ANEXO: o link de download é gerado pelo backend (URL temporária do MinIO) ---
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
                    alert(err.message || 'Erro ao abrir o anexo.');
                }
            };
        }
    } else {
        if (elAnexoNome) elAnexoNome.innerText = 'Nenhum comprovante anexado';
        if (elSubtexto) elSubtexto.innerText = 'Nenhum ficheiro associado';
        if (elBtnDownload) elBtnDownload.style.display = 'none';
    }
}

function gerenciarFluxoPermissoes(data) {
    const cardAcoes = document.getElementById('card-acoes-disponiveis');
    const boxAssumir = document.getElementById('box-acao-assumir');
    const boxAvaliar = document.getElementById('box-acao-avaliar');
    const elNomeResponsavel = document.getElementById('nome-responsavel-analise');
    const grupoBotoes = document.getElementById('grupo-botoes-decisao');
    const alertaLeitura = document.getElementById('alerta-apenas-leitura');

    const status = (data.status || 'PENDING').toUpperCase();

    if (['APPROVED', 'REJECTED', 'CANCELED'].includes(status)) {
        if (cardAcoes) cardAcoes.style.display = 'none';
        return;
    }

    if (cardAcoes) cardAcoes.style.display = 'block';

    const reviewerObj = data.reviewed_by || data.reviewer || {};
    const idResponsavel = (typeof reviewerObj === 'object' ? reviewerObj.id : reviewerObj) 
        || data.reviewed_by_id 
        || data.reviewer_id;

    const nomeResponsavel = (typeof reviewerObj === 'object' ? (reviewerObj.name || reviewerObj.full_name) : null) 
        || data.reviewed_by_name 
        || data.reviewer_name 
        || 'Coordenador';

    if (!idResponsavel && status === 'PENDING') {
        if (boxAssumir) boxAssumir.style.display = 'flex';
        if (boxAvaliar) boxAvaliar.style.display = 'none';
        return;
    }

    if (boxAssumir) boxAssumir.style.display = 'none';
    if (boxAvaliar) boxAvaliar.style.display = 'flex';

    if (elNomeResponsavel) {
        elNomeResponsavel.innerText = nomeResponsavel;
    }

    const idRespStr = String(idResponsavel || '').trim();
    const idUserLogadoStr = String(idUsuarioLogado || '').trim();
    const souOResponsavel = idRespStr && idUserLogadoStr && (idRespStr === idUserLogadoStr);

    if (souOResponsavel) {
        if (grupoBotoes) grupoBotoes.style.display = 'flex';
        if (alertaLeitura) alertaLeitura.style.display = 'none';
    } else {
        if (grupoBotoes) grupoBotoes.style.display = 'none';
        if (alertaLeitura) alertaLeitura.style.display = 'block';
    }
}

function configurarEventosBotoes() {
    const btnAssumir = document.getElementById('btn-assumir-solicitacao');
    const btnAprovar = document.getElementById('btn-aprovar');
    const btnRecusar = document.getElementById('btn-recusar');
    const btnCancelar = document.getElementById('btn-cancelar');

    if (btnAssumir) {
        btnAssumir.addEventListener('click', async () => {
            try {
                btnAssumir.disabled = true;
                btnAssumir.innerText = 'A assumir...';
                await assumirSolicitacao(idSolicitacao);
                alert('Solicitação assumida com sucesso!');
                await carregarDados();
            } catch (err) {
                console.error('Erro ao assumir:', err);
                alert(err.message || 'Erro ao assumir a solicitação.');
            } finally {
                btnAssumir.disabled = false;
                btnAssumir.innerText = 'Assumir';
            }
        });
    }

    if (btnAprovar) {
        btnAprovar.addEventListener('click', async () => {
            const horasAceitas = prompt('Informe a quantidade de horas a aprovar:', solicitacaoAtual?.requested_hours || 0);
            if (horasAceitas === null) return;

            try {
                btnAprovar.disabled = true;
                await revisarSolicitacao(idSolicitacao, {
                    status: 'APPROVED',
                    accepted_hours: Number(horasAceitas)
                });
                alert('Solicitação aprovada com sucesso!');
                await carregarDados();
            } catch (err) {
                console.error('Erro ao aprovar:', err);
                alert(err.message || 'Erro ao aprovar a solicitação.');
            } finally {
                btnAprovar.disabled = false;
            }
        });
    }

    if (btnRecusar) {
        btnRecusar.addEventListener('click', async () => {
            const motivo = prompt('Por favor, informe o motivo do indeferimento/recusa:');
            if (!motivo) return;

            try {
                btnRecusar.disabled = true;
                await revisarSolicitacao(idSolicitacao, {
                    status: 'REJECTED',
                    accepted_hours: 0,
                    rejection_reason: motivo
                });
                alert('Solicitação recusada.');
                await carregarDados();
            } catch (err) {
                console.error('Erro ao recusar:', err);
                alert(err.message || 'Erro ao recusar a solicitação.');
            } finally {
                btnRecusar.disabled = false;
            }
        });
    }

    if (btnCancelar) {
        btnCancelar.addEventListener('click', async () => {
            if (!confirm('Deseja realmente cancelar esta solicitação?')) return;

            try {
                btnCancelar.disabled = true;
                await cancelarSolicitacao(idSolicitacao);
                alert('Solicitação cancelada.');
                await carregarDados();
            } catch (err) {
                console.error('Erro ao cancelar:', err);
                alert(err.message || 'Erro ao cancelar a solicitação.');
            } finally {
                btnCancelar.disabled = false;
            }
        });
    }
}

async function carregarHistorico() {
    const container = document.getElementById('detalhe-timeline');
    if (!container) return;

    try {
        const resHistorico = await obterHistoricoSolicitacao(idSolicitacao);
        const lista = Array.isArray(resHistorico) ? resHistorico : (resHistorico?.items || resHistorico?.data || []);

        if (lista.length > 0) {
            container.innerHTML = lista.map(item => `
                <div class="timeline-item">
                    <div class="timeline-content">
                        <div class="timeline-dot"></div>
                        <div>
                            <strong class="timeline-title">Status mudou para: ${item.new_status || 'Atualização'}</strong>
                            <span class="timeline-sub">${item.comment || item.description || 'Alterado pelo coordenador'}</span>
                        </div>
                    </div>
                    <span class="timeline-date">${formatarData(item.created_at)}</span>
                </div>
            `).join('');
            return;
        }
    } catch (err) {
        console.warn('Histórico indisponível:', err);
    }

    container.innerHTML = `
        <div class="timeline-item">
            <div class="timeline-content">
                <div class="timeline-dot"></div>
                <div>
                    <strong class="timeline-title">Solicitação enviada</strong>
                    <span class="timeline-sub">${solicitacaoAtual?.student_name || 'Aluno'}</span>
                </div>
            </div>
            <span class="timeline-date">${formatarData(solicitacaoAtual?.created_at)}</span>
        </div>
    `;
}

function obterStatusClasseETexto(statusRaw) {
    const st = (statusRaw || 'PENDING').toUpperCase();
    switch (st) {
        case 'APPROVED':
            return { texto: 'Aprovada', classeCSS: 'badge-approved' };
        case 'REJECTED':
            return { texto: 'Recusada', classeCSS: 'badge-rejected' };
        case 'CANCELED':
            return { texto: 'Cancelada', classeCSS: 'badge-canceled' };
        case 'IN_REVIEW':
            return { texto: 'Em Análise', classeCSS: 'badge-in-review' };
        case 'PENDING':
        default:
            return { texto: 'Pendente', classeCSS: 'badge-pending' };
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