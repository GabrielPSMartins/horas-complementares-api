import { API_BASE_URL, FRONTEND_ROOT_URL, LOGIN_URL } from './config.js';

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

// Decodifica o payload do Token JWT (codificado em base64url, sem padding)
function decodeTokenPayload(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

// Extrai a Role do utilizador a partir do token
export function getRoleFromToken(token) {
  try {
    const decodedPayload = decodeTokenPayload(token);
    return String(decodedPayload.role ?? '').toLowerCase();
  } catch (error) {
    console.error('Erro ao ler permissões do token:', error);
    return '';
  }
}

// Indica se o token está expirado (ou ilegível), conforme o campo exp (segundos desde 1970)
export function isTokenExpired(token) {
  try {
    const { exp } = decodeTokenPayload(token);
    return typeof exp !== 'number' || exp * 1000 <= Date.now();
  } catch (error) {
    return true;
  }
}

function irParaLogin() {
  localStorage.clear();
  window.location.replace(LOGIN_URL);
}

// O perfil ROOT (administração do sistema) não possui telas no frontend: é operado pela documentação da API (/docs)
export const MENSAGEM_ROOT_SEM_INTERFACE = `O perfil ROOT não possui interface web. Utilize a documentação da API em ${API_BASE_URL}/docs.`;

export function isRoot(role) {
  return role === 'root';
}

// Perfis da API (claim "role" do token, em minúsculas): student, coordinator ou root
export function isCoordinator(role) {
  return role === 'coordinator';
}

// Valida se a Role do token bate com o tipo de login selecionado
export function validateUserRole(roleNoToken, tipoSelecionado) {
  if (isRoot(roleNoToken)) {
    throw new Error(MENSAGEM_ROOT_SEM_INTERFACE);
  }

  const isCoord = isCoordinator(roleNoToken);

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
    'tipos-de-atividades.html',
    'perfil-aluno.html'
  ],
  coordenador: [
    'dashboards.html',
    'solicitacoes-alunos.html',
    'detalhes-solicitacao-aluno.html',
    'perfil-coordenador.html',
    'alunos.html',
    'relatorios.html'
  ]
};

export function protegerRota() {
  const pathAtual = window.location.pathname.toLowerCase();
  const isIndex = pathAtual === new URL(LOGIN_URL).pathname.toLowerCase()
    || pathAtual === new URL(FRONTEND_ROOT_URL).pathname.toLowerCase();

  // Se já estiver no index, não precisa fazer validações
  if (isIndex) return;

  const token = localStorage.getItem('access_token');
  
  // 1. Se não tem token, ou se ele já expirou, redireciona para o login
  if (!token || isTokenExpired(token)) {
    irParaLogin();
    return;
  }

  // 2. Extrai a role do token guardado
  const role = getRoleFromToken(token);

  // ROOT não possui telas no frontend
  if (isRoot(role)) {
    irParaLogin();
    return;
  }
  const tipoUtilizador = isCoordinator(role) ? 'coordenador' : 'aluno';

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
    irParaLogin();
  }
}
}

export function logout() {
  irParaLogin();
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