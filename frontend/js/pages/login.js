import { loginUser, getRoleFromToken, validateUserRole, saveAuthSession } from '../auth.js'; 

const loginForm = document.getElementById('loginForm');
const msgErro = document.getElementById('msg-erro');
const btnAluno = document.getElementById('btnAluno');
const btnCoordenador = document.getElementById('btnCoordenador');
const forgotPassword = document.getElementById('forgotPassword'); // <--- 1. Captura o elemento

let tipoSelecionado = 'aluno';

// --- MUDANÇA AQUI: Tratamento do clique em "Esqueci minha senha" ---
forgotPassword?.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Exibe o aviso utilizando a caixa de mensagem já existente na página
    msgErro.textContent = 'Para redefinir sua senha, entre em contato com o suporte da instituição.';
    
    // Garante estilização visível (você também pode aplicar a classe .success-message se quiser tom informativo)
    msgErro.style.display = 'block';
});

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

    const idUser = document.getElementById('id_user').value.trim();
    const password = document.getElementById('password').value.trim();

    // Validação de campos vazios no front-end
    if (!idUser || !password) {
        msgErro.textContent = 'Por favor, preencha todos os campos!';
        msgErro.style.display = 'block';
        return; 
    }

    try {
        const data = await loginUser(idUser, password);

        if (!data.access_token) {
            throw new Error('Token de acesso não retornado.');
        }

        const roleNoToken = getRoleFromToken(data.access_token);
        validateUserRole(roleNoToken, tipoSelecionado);
        saveAuthSession(data.access_token, roleNoToken || tipoSelecionado);

        if (roleNoToken.includes('coord') || roleNoToken.includes('admin')) {
            window.location.href = 'pages/coordenador/dashboards.html';
        } else {
            window.location.href = 'pages/aluno/dashboard.html';
        }

    } catch (error) {
        msgErro.textContent = error.message;
        msgErro.style.display = 'block';
        console.error('Erro de Autenticação:', error);
    }
});