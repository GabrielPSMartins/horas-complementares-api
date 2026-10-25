import { protegerRota } from '../../auth.js';
import { carregarDadosPerfil } from '../../utils/userprofile.js';
import { obterRelatorioAluno, alterarSenha } from '../../api.js';

protegerRota();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Carrega o cabeçalho e sidebar
    await carregarDadosPerfil();

    // 2. Preenche os dados reais do aluno chamando a API
    await preencherCardPerfil();

    // 3. Registra eventos do formulário
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

async function preencherCardPerfil() {
    try {
        const relatorio = await obterRelatorioAluno();
        
        const student = relatorio?.student || {};
        const course = relatorio?.course || {};

        const nome = student.name || 'Aluno';
        const email = student.email || '---';
        const matricula = student.registration_number || '---';
        const curso = course.name || 'Sistemas de Informação';

        const elAvatar = document.getElementById('perfil-avatar');
        if (elAvatar) elAvatar.textContent = obterInicial(nome);

        const elNome = document.getElementById('perfil-nome');
        if (elNome) elNome.textContent = nome;

        const elCursoSemestre = document.getElementById('perfil-curso-semestre');
        if (elCursoSemestre) elCursoSemestre.textContent = curso;

        const elEmail = document.getElementById('perfil-email');
        if (elEmail) elEmail.textContent = email;

        const elMatricula = document.getElementById('perfil-matricula');
        if (elMatricula) elMatricula.textContent = matricula;

    } catch (err) {
        console.error('Erro ao buscar dados do relatório do aluno:', err);
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

        // Requisição para a API de alteração de senha
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
    if (!nome) return 'A';
    return nome.trim().charAt(0).toUpperCase();
}