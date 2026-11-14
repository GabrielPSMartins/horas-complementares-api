import { API_BASE_URL, LOGIN_URL } from './config.js';

// Retorna os cabeçalhos padrão com o Token de Autenticação
function getHeaders(isFormData = false) {
    const token = localStorage.getItem('access_token');

    const headers = {
        'Authorization': `Bearer ${token}`
    };

    // Apenas insere application/json se NÃO for upload de arquivos/FormData
    if (!isFormData) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}

// Encerra a sessão local e volta para o login (token ausente, expirado ou inválido)
function encerrarSessao() {
    localStorage.clear();
    window.location.replace(LOGIN_URL);
}

function montarQueryString(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return queryString ? `?${queryString}` : '';
}

/**
 * Faz uma requisição autenticada à API e trata os erros de forma única:
 * - 401: limpa a sessão, redireciona para o login e lança Error('UNAUTHORIZED');
 * - demais erros: lança Error com a mensagem `detail` devolvida pela API.
 * Por padrão devolve o JSON da resposta; com `raw: true` devolve a Response (ex.: PDF).
 */
async function request(path, { method = 'GET', body, isForm = false, raw = false } = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: getHeaders(isForm),
        body: isForm || body === undefined ? body : JSON.stringify(body)
    });

    if (response.status === 401) {
        encerrarSessao();
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Erro na requisição: ${response.status}`);
    }

    if (raw) return response;
    if (response.status === 204) return null;
    return await response.json();
}

// Abre um PDF da API em uma aba nova. A aba é aberta antes da requisição para não ser bloqueada pelo navegador.
async function abrirPdfEmNovaAba(path) {
    const novaAba = window.open('', '_blank');

    try {
        const response = await request(path, { raw: true });
        const blob = await response.blob();
        const fileUrl = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));

        if (novaAba) {
            novaAba.location.href = fileUrl;
        } else {
            window.location.href = fileUrl;
        }
    } catch (err) {
        if (novaAba) novaAba.close();
        throw err;
    }
}

// Busca o relatório do próprio aluno logado (/students/me/report)
export function obterRelatorioAluno() {
    return request('/students/me/report');
}

// Busca o relatório detalhado de um aluno específico por ID (/students/{student_id}/report)
export function obterRelatorioAlunoPorId(studentId) {
    return request(`/students/${studentId}/report`);
}

// Abre o relatório PDF de um aluno em nova aba (/students/{student_id}/report/pdf)
export function exportarRelatorioPdfAlunoPorId(studentId) {
    return abrirPdfEmNovaAba(`/students/${studentId}/report/pdf`);
}

// Busca o perfil do aluno logado (/students/me)
export function obterMeuPerfilAluno() {
    return request('/students/me');
}

// Busca os alunos do curso do coordenador com o resumo de horas (/students), aceitando search, semester, page e page_size
export function obterAlunosCoordenador(params = {}) {
    return request(`/students${montarQueryString(params)}`);
}

// Busca todos os alunos do curso do coordenador percorrendo as páginas da API (page_size máximo: 100)
export async function obterTodosAlunosCoordenador(params = {}) {
    const todos = [];
    let page = 1;
    let totalPages = 1;

    do {
        const res = await obterAlunosCoordenador({ ...params, page, page_size: 100 });
        todos.push(...res.items);
        totalPages = res.total_pages;
        page++;
    } while (page <= totalPages);

    return todos;
}

// Busca as solicitações do aluno (/activity-requests/me) aceitando filtros
export function obterMinhasSolicitacoes(params = {}) {
    return request(`/activity-requests/me${montarQueryString(params)}`);
}

// Busca a lista de tipos de atividades (/activity-types)
export function obterTiposAtividades() {
    return request('/activity-types');
}

// Cria uma nova solicitação enviando FormData (Com Upload de Arquivo)
export function criarSolicitacao(formData) {
    return request('/activity-requests', { method: 'POST', body: formData, isForm: true });
}

// Busca os dados do dashboard do coordenador (inclui resumo e alunos)
export function obterDashboardCoordenador(params = {}) {
    return request(`/coordinator/dashboard${montarQueryString(params)}`);
}

// Busca solicitações do coordenador (/activity-requests/coordinator)
export function obterSolicitacoesCoordenador(params = {}) {
    return request(`/activity-requests/coordinator${montarQueryString(params)}`);
}

// Busca todas as solicitações do coordenador percorrendo as páginas da API (page_size máximo: 100)
export async function obterTodasSolicitacoesCoordenador(params = {}) {
    const todas = [];
    let page = 1;
    let totalPages = 1;

    do {
        const res = await obterSolicitacoesCoordenador({ ...params, page, page_size: 100 });
        todas.push(...res.items);
        totalPages = res.total_pages;
        page++;
    } while (page <= totalPages);

    return todas;
}

// Busca uma solicitação específica por ID (/activity-requests/{id}), para o aluno dono ou o coordenador do curso
export function obterSolicitacaoPorId(id) {
    return request(`/activity-requests/${id}`);
}

// Busca o histórico de alterações da solicitação (/activity-requests/{id}/history)
export function obterHistoricoSolicitacao(id) {
    return request(`/activity-requests/${id}/history`);
}

// Assume a responsabilidade de uma solicitação (/activity-requests/{id}/assume)
export function assumirSolicitacao(id) {
    return request(`/activity-requests/${id}/assume`, { method: 'PATCH' });
}

// Avalia a solicitação (Aprova ou Rejeita) (/activity-requests/{id}/review)
export function revisarSolicitacao(id, dadosRevisao) {
    return request(`/activity-requests/${id}/review`, { method: 'PATCH', body: dadosRevisao });
}

// Cancela a solicitação (/activity-requests/{id}/cancel)
export function cancelarSolicitacao(id) {
    return request(`/activity-requests/${id}/cancel`, { method: 'PATCH' });
}

// Gera o link temporário de download do anexo (/activity-requests/{id}/attachments/{idAnexo}/download)
export function obterUrlDownloadAnexo(idSolicitacao, idAnexo) {
    return request(`/activity-requests/${idSolicitacao}/attachments/${idAnexo}/download`);
}

// Abre o anexo em nova aba usando o link temporário gerado pelo backend
export async function abrirAnexo(idSolicitacao, idAnexo) {
    const novaAba = window.open('', '_blank');

    try {
        const { url } = await obterUrlDownloadAnexo(idSolicitacao, idAnexo);
        if (novaAba) {
            novaAba.location.href = url;
        } else {
            window.location.href = url;
        }
    } catch (err) {
        if (novaAba) novaAba.close();
        throw err;
    }
}

// Busca o perfil do coordenador logado (/coordinators/me)
export function obterPerfilCoordenador() {
    return request('/coordinators/me');
}

// Altera a senha do usuário (/auth/change-password)
export function alterarSenha(senhaAtual, novaSenha) {
    return request('/auth/change-password', {
        method: 'POST',
        body: {
            current_password: senhaAtual,
            new_password: novaSenha
        }
    });
}

// Exporta o relatório do próprio aluno logado em formato PDF (/students/me/report/pdf)
export async function exportarRelatorioPdf() {
    const response = await request('/students/me/report/pdf', { raw: true });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-horas-complementares.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}
