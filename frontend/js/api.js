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

// Busca as solicitações do aluno (/activity-requests/me)
export async function obterMinhasSolicitacoes() {
    const response = await fetch(`${API_BASE_URL}/activity-requests/me`, {
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
        // Passamos `true` para NÃO adicionar 'Content-Type': 'application/json'
        headers: getHeaders(true), 
        body: formData
    });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro ao criar solicitação: ${response.status}`);
    }

    return await response.json();
}