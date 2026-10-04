import { API_BASE_URL } from './config.js';

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

// Busca o relatório do aluno (/students/me/report)
export async function obterRelatorioAluno() {
    const response = await fetch(`${API_BASE_URL}/students/me/report`, {
        headers: getHeaders()
    });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
    }

    return await response.json();
}

// Busca o relatório do coordenador (/coordinator/me/report)
export async function obterRelatorioCoordenador() {
    const response = await fetch(`${API_BASE_URL}/coordinator/me/report`, {
        headers: getHeaders()
    });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
    }

    return await response.json();
}

// Busca as solicitações do aluno (/activity-requests/me) aceitando filtros
export async function obterMinhasSolicitacoes(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `${API_BASE_URL}/activity-requests/me${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(endpoint, {
        headers: getHeaders()
    });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
    }

    return await response.json();
}

// Busca a lista de tipos de atividades (/activity-types)
export async function obterTiposAtividades() {
    const response = await fetch(`${API_BASE_URL}/activity-types`, {
        headers: getHeaders()
    });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
    }

    return await response.json();
}

// Cria uma nova solicitação enviando FormData (Com Upload de Arquivo)
export async function criarSolicitacao(formData) {
    const response = await fetch(`${API_BASE_URL}/activity-requests`, {
        method: 'POST',
        headers: getHeaders(true), 
        body: formData
    });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Erro ao criar solicitação: ${response.status}`);
    }

    return await response.json();
}

// Busca os dados do dashboard do coordenador (inclui resumo e alunos)
export async function obterDashboardCoordenador(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `${API_BASE_URL}/coordinator/dashboard${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(endpoint, {
        headers: getHeaders()
    });

    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) throw new Error(`Erro na requisição: ${response.status}`);

    return await response.json();
}

// Busca solicitações do coordenador (/activity-requests/coordinator)
export async function obterSolicitacoesCoordenador(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `${API_BASE_URL}/activity-requests/coordinator${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(endpoint, {
        headers: getHeaders()
    });

    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) throw new Error(`Erro na requisição: ${response.status}`);

    return await response.json();
}

// Busca uma solicitação específica por ID navegando nas solicitações do coordenador
export async function obterSolicitacaoPorId(id) {
    const res = await obterSolicitacoesCoordenador({ limit: 300 });
    const lista = Array.isArray(res) ? res : (res?.items || res?.data || []);
    const item = lista.find(s => String(s.id) === String(id));
    if (!item) throw new Error('Solicitação não encontrada');
    return item;
}

// Busca o histórico de alterações da solicitação (/activity-requests/{id}/history)
export async function obterHistoricoSolicitacao(id) {
    const response = await fetch(`${API_BASE_URL}/activity-requests/${id}/history`, {
        headers: getHeaders()
    });

    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) throw new Error(`Erro na requisição: ${response.status}`);

    return await response.json();
}

// Assume a responsabilidade de uma solicitação (/activity-requests/{id}/assume)
export async function assumirSolicitacao(id) {
    const response = await fetch(`${API_BASE_URL}/activity-requests/${id}/assume`, {
        method: 'PATCH',
        headers: getHeaders()
    });

    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Erro ao assumir solicitação: ${response.status}`);
    }

    return await response.json();
}

// Avalia a solicitação (Aprova ou Rejeita) (/activity-requests/{id}/review)
export async function revisarSolicitacao(id, dadosRevisao) {
    const response = await fetch(`${API_BASE_URL}/activity-requests/${id}/review`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(dadosRevisao)
    });

    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Erro ao revisar solicitação: ${response.status}`);
    }

    return await response.json();
}

// Cancela a solicitação (/activity-requests/{id}/cancel)
export async function cancelarSolicitacao(id) {
    const response = await fetch(`${API_BASE_URL}/activity-requests/${id}/cancel`, {
        method: 'PATCH',
        headers: getHeaders()
    });

    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Erro ao cancelar solicitação: ${response.status}`);
    }

    return await response.json();
}

// Gera o link temporário de download do anexo (/activity-requests/{id}/attachments/{idAnexo}/download)
export async function obterUrlDownloadAnexo(idSolicitacao, idAnexo) {
    const response = await fetch(`${API_BASE_URL}/activity-requests/${idSolicitacao}/attachments/${idAnexo}/download`, {
        headers: getHeaders()
    });

    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Erro ao obter link do anexo: ${response.status}`);
    }

    return await response.json();
}

// Abre o anexo em nova aba usando o link temporário gerado pelo backend
export async function abrirAnexo(idSolicitacao, idAnexo) {
    // A aba é aberta antes da requisição para não ser bloqueada como pop-up
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

export async function obterPerfilCoordenador() {
    const response = await fetch(`${API_BASE_URL}/coordinators/me`, {
        method: 'GET',
        headers: getHeaders()
    });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
    }

    return await response.json();
}

// Altera a senha do usuário (/auth/change-password)
export async function alterarSenha(senhaAtual, novaSenha) {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            current_password: senhaAtual,
            new_password: novaSenha
        })
    });

    if (response.status === 401) {
        throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || 'Erro ao alterar a senha. Verifique a senha atual.');
    }

    return await response.json();
}