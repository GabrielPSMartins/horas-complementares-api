import { protegerRota } from '../auth.js';
import { obterTiposAtividades, criarSolicitacao } from '../api.js';
import { carregarDadosPerfil } from '../utils/userprofile.js';

protegerRota();

document.addEventListener('DOMContentLoaded', () => {
    // 1. Carrega perfil reutilizável e os tipos de atividades
    carregarDadosPerfil();
    carregarTiposAtividades();

    // 2. Inicializa eventos de interatividade do arquivo (dropzone/preview)
    inicializarDropzone();

    // 3. Listener do formulário
    const formSolicitacao = document.getElementById('form-nova-solicitacao');
    if (formSolicitacao) {
        formSolicitacao.addEventListener('submit', tratarEnvioSolicitacao);
    }
});

// Carrega as opções do Select
async function carregarTiposAtividades() {
    const selectTipo = document.getElementById('activity_type_id');
    if (!selectTipo) return;

    try {
        const tipos = await obterTiposAtividades();
        if (tipos && Array.isArray(tipos)) {
            selectTipo.innerHTML = '<option value="" disabled selected>Selecionar...</option>' + 
                tipos.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
    } catch (error) {
        exibirMensagem('Erro ao carregar os tipos de atividades. Tente recarregar a página.', 'error');
    }
}

// Configura o comportamento do campo de seleção de arquivo
function inicializarDropzone() {
    const fileInput = document.getElementById('certificate_file');
    const dropzoneContent = document.getElementById('dropzone-content');
    const filePreview = document.getElementById('file-preview');
    const fileNameDisplay = document.getElementById('file-name-display');
    const btnRemoveFile = document.getElementById('btn-remove-file');

    const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

    if (!fileInput) return;

    fileInput.addEventListener('change', (e) => {
        ocultarMensagem();
        const file = e.target.files[0];

        if (file) {
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            const isValidType = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(fileExtension);

            if (!isValidType) {
                exibirMensagem('Formato inválido! Envie apenas arquivos em PDF ou Imagens (PNG, JPG, JPEG).', 'error');
                resetarUpload();
                return;
            }

            if (dropzoneContent) dropzoneContent.classList.add('hidden');
            if (filePreview) filePreview.classList.remove('hidden');
            if (fileNameDisplay) fileNameDisplay.innerText = file.name;
        } else {
            resetarUpload();
        }
    });

    if (btnRemoveFile) {
        btnRemoveFile.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            ocultarMensagem();
            resetarUpload();
        });
    }

    function resetarUpload() {
        fileInput.value = '';
        if (dropzoneContent) dropzoneContent.classList.remove('hidden');
        if (filePreview) filePreview.classList.add('hidden');
        if (fileNameDisplay) fileNameDisplay.innerText = '';
    }
}

function exibirMensagem(mensagem, tipo = 'error') {
    const alertBox = document.getElementById('form-alert');
    if (!alertBox) return;

    alertBox.innerText = mensagem;
    // Utiliza 'success-message' quando for sucesso e 'error-message' quando for erro
    alertBox.className = tipo === 'success' ? 'success-message' : 'error-message';
    alertBox.style.display = 'block';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function ocultarMensagem() {
    const alertBox = document.getElementById('form-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.innerText = '';
    }
}

// Trata a validação e o envio da solicitação
async function tratarEnvioSolicitacao(e) {
    e.preventDefault();
    ocultarMensagem();

    const btnSubmit = document.getElementById('btn-submit-request');
    const fileInput = document.getElementById('certificate_file');
    const file = fileInput ? fileInput.files[0] : null;

    // Captura os valores dos inputs do HTML
    const activityTypeId = document.getElementById('activity_type_id')?.value;
    const title = document.getElementById('title')?.value?.trim();
    const requestedHoursRaw = document.getElementById('requested_hours')?.value;
    const location = document.getElementById('location')?.value?.trim();
    const activityDate = document.getElementById('activity_date')?.value;
    const description = document.getElementById('description')?.value?.trim();

    // Validações dos campos OBRIGATÓRIOS (segundo o Swagger)
    if (!activityTypeId) {
        exibirMensagem('Por favor, selecione o Tipo de Atividade.', 'error');
        return;
    }
    if (!title) {
        exibirMensagem('Por favor, informe o Título.', 'error');
        return;
    }
    if (!requestedHoursRaw || isNaN(parseInt(requestedHoursRaw, 10))) {
        exibirMensagem('Por favor, informe a quantidade de Horas Solicitadas válida.', 'error');
        return;
    }
    if (!location) {
        exibirMensagem('Por favor, informe o Local/Instituição.', 'error');
        return;
    }
    if (!activityDate) {
        exibirMensagem('Por favor, informe a Data da Atividade.', 'error');
        return;
    }
    if (!file) {
        exibirMensagem('Por favor, anexe o Comprovante/Certificado.', 'error');
        return;
    }

    // Monta o FormData exatamente com as chaves exigidas pela API
    const payload = new FormData();
    payload.append('activity_type_id', activityTypeId);
    payload.append('title', title);
    payload.append('requested_hours', parseInt(requestedHoursRaw, 10));
    payload.append('location', location);
    payload.append('activity_date', activityDate);
    
    if (description) {
        payload.append('description', description);
    }

    payload.append('file', file);

    try {
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = '0.7';
        }

        await criarSolicitacao(payload);

        exibirMensagem('Solicitação enviada com sucesso!', 'success');
        e.target.reset();

        const dropzoneContent = document.getElementById('dropzone-content');
        const filePreview = document.getElementById('file-preview');
        if (dropzoneContent) dropzoneContent.classList.remove('hidden');
        if (filePreview) filePreview.classList.add('hidden');

        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);

    } catch (error) {
        exibirMensagem(error.message || 'Erro ao enviar a solicitação.', 'error');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.style.opacity = '1';
        }
    }
}