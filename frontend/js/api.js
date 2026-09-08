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

// Busca as solicitações do aluno (/activity-requests/me) aceitando filtros
export async function obterMinhasSolicitacoes(params = {}) {
    // Converte o objeto { status: 'PENDING', activity_type_id: 1 } para "?status=PENDING&activity_type_id=1"
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

