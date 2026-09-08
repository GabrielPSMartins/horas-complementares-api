import { API_BASE_URL } from './config.js'; 

export async function loginUser(username, password) {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    throw new Error(data.detail || `Erro no login. (Status: ${response.status})`);
  }

  return data;
}

// Decodifica o payload do Token JWT para extrair a Role do usuário

export function getRoleFromToken(token) {
  try {
    const payloadBase64 = token.split('.')[1];
    const decodedPayload = JSON.parse(atob(payloadBase64));
    return String(decodedPayload.role || decodedPayload.user_type || decodedPayload.type || '').toLowerCase();
  } catch (error) {
    console.error('Erro ao ler permissões do token:', error);
    return '';
  }
}

// Valida se a Role do token bate com o tipo de login selecionado

export function validateUserRole(roleNoToken, tipoSelecionado) {
  const isCoord = roleNoToken.includes('coord') || roleNoToken.includes('admin');

  if (tipoSelecionado === 'coordenador' && !isCoord) {
    throw new Error('Esta conta não tem permissão de coordenador.');
  }

  if (tipoSelecionado === 'aluno' && isCoord) {
    throw new Error('Sua conta é de coordenador. Clique em "Entrar como Coordenador".');
  }
}

// Salva os dados de autenticação no localStorage

export function saveAuthSession(token, role) {
  localStorage.setItem('access_token', token);
  localStorage.setItem('user_type', role);
}
 
