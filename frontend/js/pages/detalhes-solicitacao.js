// js/pages/detalhes-solicitacao.js
import { protegerRota } from '../auth.js';
import { obterMinhasSolicitacoes, obterTiposAtividades } from '../api.js';
import { carregarDadosPerfil } from '../utils/userprofile.js';

// Protege a rota verificando o token
protegerRota();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Preenche o perfil e menu lateral do aluno
    carregarDadosPerfil();

    // 2. Busca o ID da solicitação passado pela URL
    const urlParams = new URLSearchParams(window.location.search);
    const idSolicitacao = urlParams.get('id');

    if (!idSolicitacao) {
        alert('ID da solicitação não foi fornecido.');
        window.location.href = 'solicitacoes.html';
        return;
    }

    // 3. Carrega os dados da solicitação específica
    await carregarDetalhes(idSolicitacao);
});

async function carregarDetalhes(id) {
    try {
        // Busca a lista de solicitações
        const dados = await obterMinhasSolicitacoes({});
        const lista = Array.isArray(dados) 
            ? dados 
            : (dados.data || dados.items || dados.solicitacoes || []);

        // Busca o tipo de atividade para obter o nome amigável
        const tipos = await obterTiposAtividades();
        const listaTipos = Array.isArray(tipos) ? tipos : (tipos?.data || []);
        const mapaTipos = {};
        listaTipos.forEach(t => {
            const tId = t.id || t._id;
            mapaTipos[tId] = t.name || t.nome || t.title;
        });

        // Encontra a solicitação com o ID informado na URL
        const solicitacao = lista.find(item => String(item.id || item._id) === String(id));

        if (!solicitacao) {
            alert('Solicitação não encontrada.');
            window.location.href = 'solicitacoes.html';
            return;
        }

        // Preenche o HTML da tela com os dados encontrados
        preencherTela(solicitacao, mapaTipos);

    } catch (error) {
        console.error('Erro ao carregar detalhes da solicitação:', error);
    }
}

/**
 * Função utilitária que percorre iterativamente qualquer objeto em busca de uma URL/caminho válida.
 */
function encontrarUrlEmObjeto(obj) {
    if (!obj) return null;

    // Se o próprio item for uma string que parece URL ou caminho de arquivo
    if (typeof obj === 'string') {
        const str = obj.trim();
        if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/uploads/') || str.endsWith('.pdf') || str.endsWith('.jpg') || str.endsWith('.png')) {
            return str;
        }
        return null;
    }

    if (typeof obj !== 'object') return null;

    // Procura em todas as chaves do objeto
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (!val) continue;

        if (typeof val === 'string') {
            const strVal = val.trim();
            // Verifica se a chave sugere arquivo/anexo ou se o valor parece um link/arquivo
            const chaveInformaAnexo = /file|arquivo|comprovante|proof|document|anexo|certificad|path|url/i.test(key);
            const valorPareceLink = strVal.startsWith('http') || strVal.startsWith('/') || /\.(pdf|png|jpg|jpeg|webp)$/i.test(strVal);

            if (chaveInformaAnexo && strVal.length > 5) {
                return strVal;
            }
            if (valorPareceLink) {
                return strVal;
            }
        } else if (typeof val === 'object' && val !== null) {
            const resultadoSub = encontrarUrlEmObjeto(val);
            if (resultadoSub) return resultadoSub;
        }
    }

    return null;
}

function preencherTela(item, mapaTipos) {
    // 🔍 Exibe no console exatamente o que chegou da API
    console.log('=== DADOS DA SOLICITAÇÃO ===', item);

    const statusMap = {
        'PENDING': { text: 'Pendente', badgeClass: 'badge-pending' },
        'IN_REVIEW': { text: 'Em Análise', badgeClass: 'badge-in-review' },
        'APPROVED': { text: 'Aprovada', badgeClass: 'badge-approved' },
        'REJECTED': { text: 'Rejeitada', badgeClass: 'badge-rejected' },
        'CANCELED': { text: 'Cancelada', badgeClass: 'badge-canceled' }
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
    if (elTitulo) elTitulo.textContent = nomeAtividade;

    const dataRaw = item.createdAt || item.created_at || item.submission_date;
    const dataEnvioFormatada = dataRaw ? new Date(dataRaw).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '---';
    
    const elDataEnvio = document.getElementById('detalhe-data-envio');
    if (elDataEnvio) elDataEnvio.textContent = `Enviada em ${dataEnvioFormatada}`;

    // Descrição e Data do evento
    const elDescricao = document.getElementById('detalhe-descricao');
    if (elDescricao) elDescricao.textContent = item.description || item.descricao || 'Sem descrição cadastrada.';

    const eventDateRaw = item.event_date || item.dataAtividade || dataRaw;
    const eventDateFormatada = eventDateRaw ? new Date(eventDateRaw).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '---';
    
    const elDataAtividade = document.getElementById('detalhe-data-atividade');
    if (elDataAtividade) elDataAtividade.textContent = eventDateFormatada;

    // Horas
    const elHorasSolicitadas = document.getElementById('detalhe-horas-solicitadas');
    if (elHorasSolicitadas) elHorasSolicitadas.textContent = `${item.requested_hours || item.hours || item.horas || 0}h`;

    const elHorasAprovadas = document.getElementById('detalhe-horas-aprovadas');
    if (elHorasAprovadas) elHorasAprovadas.textContent = item.approved_hours !== undefined && item.approved_hours !== null ? `${item.approved_hours}h` : '-';

    // Observações e Analisador
    const elAnalisadoPor = document.getElementById('detalhe-analisado-por');
    if (elAnalisadoPor) elAnalisadoPor.textContent = item.reviewer_name || item.analisadoPor || 'Aguardando avaliação';

    const elObservacoes = document.getElementById('detalhe-observacoes');
    if (elObservacoes) elObservacoes.textContent = item.reviewer_notes || item.observacoes || 'Nenhuma observação informada.';

    // 📎 BUSCA RECURSIVA DO ARQUIVO
    const fileUrl = encontrarUrlEmObjeto(item);
    console.log('URL de anexo encontrada:', fileUrl);

    const elAnexoNome = document.getElementById('anexo-nome');
    const elAnexoSub = document.getElementById('anexo-subtexto');
    const elBtnDownload = document.getElementById('btn-download-anexo');

    if (fileUrl) {
        const nomeBruto = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
        const nomeLimpo = decodeURIComponent(nomeBruto).split('?')[0];

        if (elAnexoNome) elAnexoNome.textContent = nomeLimpo || 'comprovante.pdf';
        if (elAnexoSub) elAnexoSub.textContent = 'Arquivo disponível para download';

        if (elBtnDownload) {
            elBtnDownload.href = fileUrl;
            elBtnDownload.target = '_blank';
            elBtnDownload.setAttribute('download', nomeLimpo || 'comprovante.pdf');
            elBtnDownload.style.setProperty('display', 'inline-flex', 'important');
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