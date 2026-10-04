import { protegerRota } from '../../auth.js';
import { carregarDadosPerfil } from '../../utils/userprofile.js';
import { obterPerfilCoordenador, alterarSenha } from '../../api.js';

protegerRota();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Tenta carregar os dados básicos do perfil do storage/helper para o topo e sidebar
    await carregarDadosPerfil();

    // 2. Busca e preenche as informações completas do coordenador (Sidebar, Header e Card)
    await preencherDadosCoordenador();

    // 3. Configura o formulário de troca de senha
    const formSenha = document.getElementById('form-alterar-senha');
    if (formSenha) {
        formSenha.addEventListener('submit', tratarAlteracaoSenha);
    }

    const btnCancelar = document.getElementById('btn-cancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            limparErros();
            esconderAlerta();
            formSenha?.reset();
        });
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
});

async function preencherDadosCoordenador() {
    try {
        // Busca os dados da API (/coordinators/me)
        const coord = await obterPerfilCoordenador();

        const nome = coord?.name || coord?.nome || 'Coordenador';
        const email = coord?.email || '---';
        const matricula = coord?.registration_number || coord?.registrationNumber || coord?.matricula || '---';
        const curso = coord?.course?.name || coord?.curso || 'Sistemas de Informação';
        const inicial = obterInicial(nome);

        // --- PREENCHE HEADER SUPERIOR ---
        const topAvatar = document.getElementById('top-avatar');
        if (topAvatar) topAvatar.textContent = inicial;

        const topUserName = document.getElementById('top-user-name');
        if (topUserName) topUserName.textContent = nome;

        // --- PREENCHE BARRA LATERAL (SIDEBAR) ---
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if (sidebarAvatar) sidebarAvatar.textContent = inicial;

        const sidebarUserName = document.getElementById('sidebar-user-name');
        if (sidebarUserName) sidebarUserName.textContent = nome;

        // --- PREENCHE O CARD DE PERFIL DA TELA ---
        const perfilAvatar = document.getElementById('perfil-avatar');
        if (perfilAvatar) perfilAvatar.textContent = inicial;

        const perfilNome = document.getElementById('perfil-nome');
        if (perfilNome) perfilNome.textContent = nome;

        const perfilCurso = document.getElementById('perfil-curso');
        if (perfilCurso) perfilCurso.textContent = curso;

        const perfilEmail = document.getElementById('perfil-email');
        if (perfilEmail) perfilEmail.textContent = email;

        const perfilMatricula = document.getElementById('perfil-matricula');
        if (perfilMatricula) perfilMatricula.textContent = matricula;

    } catch (err) {
        console.error('Erro ao buscar perfil do coordenador:', err);
    }
}

async function tratarAlteracaoSenha(e) {
    e.preventDefault();
    limparErros();
    esconderAlerta();

    const inputAtual = document.getElementById('senha-atual');
    const inputNova = document.getElementById('nova-senha');
    const inputConfirmar = document.getElementById('confirmar-senha');
    const btnSalvar = document.getElementById('btn-salvar-senha');

    const valAtual = inputAtual?.value.trim();
    const valNova = inputNova?.value.trim();
    const valConfirmar = inputConfirmar?.value.trim();

    let temErro = false;

    if (!valAtual) {
        mostrarErro('senha-atual', 'err-senha-atual', 'Informe a senha atual.');
        temErro = true;
    }

    if (!valNova) {
        mostrarErro('nova-senha', 'err-nova-senha', 'Informe a nova senha.');
        temErro = true;
    } else if (valNova.length < 8) {
        mostrarErro('nova-senha', 'err-nova-senha', 'A nova senha deve ter no mínimo 8 caracteres.');
        temErro = true;
    }

    if (!valConfirmar) {
        mostrarErro('confirmar-senha', 'err-confirmar-senha', 'Confirme a nova senha.');
        temErro = true;
    } else if (valNova && valNova !== valConfirmar) {
        mostrarErro('confirmar-senha', 'err-confirmar-senha', 'As senhas não coincidem.');
        temErro = true;
    }

    if (temErro) {
        exibirAlerta('Por favor, preencha os campos corretamente.', 'erro');
        return;
    }

    try {
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.textContent = 'Alterando...';
        }

        // Envia para a API POST /auth/change-password
        await alterarSenha(valAtual, valNova);

        exibirAlerta('Senha alterada com sucesso!', 'sucesso');
        e.target.reset();
    } catch (err) {
        console.error('Erro ao alterar senha:', err);
        exibirAlerta(err.message || 'Erro ao alterar a senha. Verifique a senha atual.', 'erro');
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.textContent = 'Alterar senha';
        }
    }
}

function exibirAlerta(mensagem, tipo = 'erro') {
    const el = document.getElementById('mensagem-feedback');
    if (!el) return;

    el.textContent = mensagem;
    el.style.display = 'block';

    if (tipo === 'erro') {
        el.style.backgroundColor = '#fef2f2';
        el.style.color = '#ef4444';
        el.style.border = '1px solid #fca5a5';
    } else {
        el.style.backgroundColor = '#f0fdf4';
        el.style.color = '#16a34a';
        el.style.border = '1px solid #86efac';
    }
}

function esconderAlerta() {
    const el = document.getElementById('mensagem-feedback');
    if (el) el.style.display = 'none';
}

function mostrarErro(inputId, errorSpanId, mensagem) {
    const input = document.getElementById(inputId);
    const span = document.getElementById(errorSpanId);

    if (input) input.style.borderColor = '#ef4444';
    if (span) {
        span.textContent = mensagem;
        span.style.display = 'block';
    }
}

function limparErros() {
    ['senha-atual', 'nova-senha', 'confirmar-senha'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.style.borderColor = '#cbd5e1';
    });

    ['err-senha-atual', 'err-nova-senha', 'err-confirmar-senha'].forEach(id => {
        const span = document.getElementById(id);
        if (span) span.style.display = 'none';
    });
}

function obterInicial(nome) {
    if (!nome) return 'C';
    return nome.trim().charAt(0).toUpperCase();
}