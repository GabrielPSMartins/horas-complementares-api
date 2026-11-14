// Contrato das respostas da API usadas nas telas de solicitação e utilitários compartilhados.
// Os formatos abaixo espelham os schemas Pydantic do backend (ver http://localhost:8000/docs).
import { obterTiposAtividades } from '../api.js';
import { escapeHtml } from './html.js';

/**
 * @typedef {'PENDING'|'IN_REVIEW'|'APPROVED'|'REJECTED'|'CANCELED'} StatusSolicitacao
 */

/**
 * ActivityAttachmentResponse
 * @typedef {Object} Anexo
 * @property {string} id
 * @property {string} file_name
 * @property {string|null} content_type
 * @property {number|null} size_bytes
 * @property {string} created_at
 */

/**
 * ActivityRequestResponse (GET /activity-requests/me, GET /activity-requests/{id})
 * @typedef {Object} Solicitacao
 * @property {string} id
 * @property {string} student_id
 * @property {string} activity_type_id
 * @property {string} title
 * @property {string|null} description
 * @property {string} location
 * @property {string} activity_date   Data sem horário (AAAA-MM-DD)
 * @property {number} requested_hours
 * @property {number|null} accepted_hours
 * @property {StatusSolicitacao} status
 * @property {string|null} rejection_reason
 * @property {string|null} in_review_by_name
 * @property {string|null} in_review_at
 * @property {string|null} reviewed_by_name
 * @property {string|null} reviewed_at
 * @property {string} created_at
 * @property {string} updated_at
 * @property {Anexo[]} attachments
 */

/**
 * ActivityRequestCoordinatorResponse (visão do coordenador: inclui dados do aluno)
 * @typedef {Solicitacao & {
 *   student_name: string,
 *   student_registration_number: string,
 *   student_semester: number
 * }} SolicitacaoCoordenador
 */

/**
 * ActivityRequestHistoryResponse (GET /activity-requests/{id}/history)
 * @typedef {Object} ItemHistorico
 * @property {string} id
 * @property {string|null} changed_by_name
 * @property {StatusSolicitacao|null} previous_status
 * @property {StatusSolicitacao|null} new_status
 * @property {number|null} new_accepted_hours
 * @property {string|null} comment   Na rejeição, contém o motivo
 * @property {string} created_at
 */

/**
 * ActivityTypeResponse (GET /activity-types)
 * @typedef {Object} TipoAtividade
 * @property {string} id
 * @property {string} name
 * @property {string|null} description
 * @property {number} max_hours_per_request
 * @property {boolean} requires_attachment
 */

/**
 * PaginatedResponse (listagens paginadas)
 * @template T
 * @typedef {Object} Pagina
 * @property {T[]} items
 * @property {number} total
 * @property {number} page
 * @property {number} page_size
 * @property {number} total_pages
 */

// Rótulo e classes CSS de cada status da API (badge: tabelas e cabeçalhos; pill: listas do relatório)
export const STATUS = {
    PENDING: { label: 'Pendente', badge: 'badge-pending', pill: 'badge-pill-pending' },
    IN_REVIEW: { label: 'Em Análise', badge: 'badge-in-review', pill: 'badge-pill-pending' },
    APPROVED: { label: 'Aprovada', badge: 'badge-approved', pill: 'badge-pill-approved' },
    REJECTED: { label: 'Rejeitada', badge: 'badge-rejected', pill: 'badge-pill-rejected' },
    CANCELED: { label: 'Cancelada', badge: 'badge-canceled', pill: 'badge-pill-canceled' }
};

const DATA_SEM_HORARIO = /^\d{4}-\d{2}-\d{2}$/;

// Formata como DD/MM/AAAA. Datas sem horário (activity_date) não passam por conversão de fuso,
// senão "2026-09-15" seria lida como meia-noite UTC e apareceria como 14/09 no Brasil.
export function formatarData(valor) {
    if (!valor) return '--';
    if (DATA_SEM_HORARIO.test(valor)) {
        const [ano, mes, dia] = valor.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    return new Date(valor).toLocaleDateString('pt-BR');
}

// Formata como "DD/MM/AAAA às HH:mm" no fuso do navegador
export function formatarDataHora(valor) {
    if (!valor) return '--';
    const data = new Date(valor);
    return `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Devolve um Map id -> nome dos tipos de atividade do curso do usuário logado
export async function obterMapaTiposAtividade() {
    /** @type {TipoAtividade[]} */
    const tipos = await obterTiposAtividades();
    return new Map(tipos.map(tipo => [tipo.id, tipo.name]));
}

// Título e variação visual (classe timeline-item--*) de cada evento do histórico
const EVENTOS_HISTORICO = {
    PENDING: { titulo: 'Solicitação criada pelo aluno', variacao: 'criada' },
    IN_REVIEW: { titulo: 'Análise assumida pelo coordenador', variacao: 'em-analise' },
    APPROVED: { titulo: 'Solicitação aprovada', variacao: 'aprovada' },
    REJECTED: { titulo: 'Solicitação rejeitada', variacao: 'rejeitada' },
    CANCELED: { titulo: 'Solicitação cancelada pelo aluno', variacao: 'cancelada' }
};

/**
 * Renderiza a linha do tempo da solicitação (mesmo visual para aluno e coordenador).
 * @param {HTMLElement} container
 * @param {ItemHistorico[]} historico
 */
export function renderizarHistorico(container, historico) {
    if (historico.length === 0) {
        container.innerHTML = '<p class="timeline-vazia">Nenhum registro de histórico disponível.</p>';
        return;
    }

    container.innerHTML = historico.map(item => {
        const evento = EVENTOS_HISTORICO[item.new_status];
        let detalhe = '';

        if (item.new_status === 'APPROVED' && item.new_accepted_hours !== null) {
            detalhe = `<div class="timeline-note">Horas aprovadas: <strong>${escapeHtml(item.new_accepted_hours)}h</strong></div>`;
        } else if (item.new_status === 'REJECTED' && item.comment) {
            detalhe = `<div class="timeline-note"><strong>Motivo da rejeição:</strong> ${escapeHtml(item.comment)}</div>`;
        }

        return `
            <div class="timeline-item timeline-item--${evento.variacao}">
                <div class="timeline-header">
                    <span class="timeline-tag">${escapeHtml(evento.titulo)}</span>
                    <span class="timeline-date">${escapeHtml(formatarDataHora(item.created_at))}</span>
                </div>
                <div class="timeline-author">Por: <strong>${escapeHtml(item.changed_by_name ?? '--')}</strong></div>
                ${detalhe}
            </div>
        `;
    }).join('');
}
