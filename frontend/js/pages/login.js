import { loginUser, getRoleFromToken, validateUserRole, saveAuthSession } from './auth.js'; 

const loginForm = document.getElementById('loginForm');
const msgErro = document.getElementById('msg-erro');
const btnAluno = document.getElementById('btnAluno');
const btnCoordenador = document.getElementById('btnCoordenador');

let tipoSelecionado = 'aluno';

// Verifica o clique nos botões para saber a intenção do usuário
btnAluno?.addEventListener('click', () => {
    tipoSelecionado = 'aluno';
});

btnCoordenador?.addEventListener('click', () => {
    tipoSelecionado = 'coordenador';
});

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Limpa mensagens de erro anteriores
    msgErro.style.display = 'none';
    msgErro.textContent = '';

    const idUser = document.getElementById('id_user').value;
    const password = document.getElementById('password').value;

    try {
        // Faz a requisição usando a função do auth.js
        const data = await loginUser(idUser, password);

        if (!data.access_token) {
            throw new Error('Token de acesso não retornado.');
        }

        // Extrai a role contida no Token JWT
        const roleNoToken = getRoleFromToken(data.access_token);

        // Valida se o perfil do usuário bate com o botão clicado
        validateUserRole(roleNoToken, tipoSelecionado);

        // Salva o token e o perfil no localStorage
        saveAuthSession(data.access_token, roleNoToken || tipoSelecionado);

        // Redireciona para o painel correto
        if (roleNoToken.includes('coord') || roleNoToken.includes('admin')) {
            window.location.href = 'pages/coordenador/dashboard.html';
        } else {
            window.location.href = 'pages/aluno/dashboard.html';
        }

    } catch (error) {
        msgErro.textContent = error.message;
        msgErro.style.display = 'block';
        console.error('Erro de Autenticação:', error);
    }
});