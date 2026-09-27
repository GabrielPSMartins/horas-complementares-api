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

// Decodifica o payload do Token JWT para extrair a Role do utilizador
export function getRoleFromToken(token) {
  try {
    const payloadBase64 = token.split('.')[1];
    const jsonPayload = decodeURIComponent(
      atob(payloadBase64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decodedPayload = JSON.parse(jsonPayload);
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

// --- ROTAS PERMITIDAS POR TIPO DE UTILIZADOR ---
const ROTAS_PERMITIDAS = {
  aluno: [
    'dashboard.html',
    'detalhes-solicitacao.html',
    'nova-solicitacao.html',
    'solicitacoes.html',
    'tipos-de-atividades.html'
  ],
  coordenador: [
    'dashboards.html' // Corrigido para "dashboards.html" conforme a pasta do projeto
  ]
};

export function protegerRota() {
  const pathAtual = window.location.pathname.toLowerCase();
  const isIndex = pathAtual.endsWith('index.html') || pathAtual === '/' || pathAtual.endsWith('/frontend/');

  // Se já estiver no index, não precisa fazer validações
  if (isIndex) return;

  const token = localStorage.getItem('access_token');
  
  // 1. Se não tem token, redireciona para o login
  if (!token) {
    window.location.replace('/frontend/index.html');
    return;
  }

  // 2. Extrai a role do token guardado
  const role = getRoleFromToken(token);
  const isCoord = role.includes('coord') || role.includes('admin');
  const tipoUtilizador = isCoord ? 'coordenador' : 'aluno';

  // 3. BLOQUEIO DIRETO POR PASTA: Se o aluno tentar aceder a qualquer página dentro de /coordenador/
  if (tipoUtilizador === 'aluno' && pathAtual.includes('/coordenador/')) {
    window.location.replace('../aluno/dashboard.html');
    return;
  }

  // 4. Validação por ficheiro permitido
  const paginaAtual = pathAtual.split('/').pop();
  const paginasAutorizadas = ROTAS_PERMITIDAS[tipoUtilizador] || [];
  const temAcesso = paginasAutorizadas.includes(paginaAtual);

  if (!temAcesso) { 
  if (tipoUtilizador === 'aluno') {
    window.location.replace('../aluno/dashboard.html');
  } else if (tipoUtilizador === 'coordenador') {
    window.location.replace('../coordenador/dashboards.html');
  } else {
    window.location.replace('/frontend/index.html');
  }
}
}

export function logout() {
  localStorage.clear();
  window.location.replace('/frontend/index.html');
}

// Bloqueia navegação por cache no botão "Voltar"
window.addEventListener('pageshow', () => {
  protegerRota();
});

// Evento automático nos botões de sair
document.addEventListener('DOMContentLoaded', () => {
  const botoesLogout = document.querySelectorAll('#btn-logout, .btn-logout');
  botoesLogout.forEach(botao => {
    botao.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  });
});