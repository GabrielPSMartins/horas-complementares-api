import { obterRelatorioAluno } from '../api.js';

// Busca as informações do aluno na API e preenche os elementos da tela
export async function carregarDadosPerfil() {
    try {
        const report = await obterRelatorioAluno();
        
        if (report && report.student) {
            preencherCamposPerfil(report.student);
        }
    } catch (error) {
        console.error('Erro ao carregar informações do perfil:', error);
    }
}

// Mapeia e preenche os elementos HTML presentes na página
export function preencherCamposPerfil(student) {
    if (!student) return;

    const nomeCompleto = student.name || 'Aluno';
    const matriculaUser = student.registration_number || '---';
    const emailUser = student.email || '---';

    const partesNome = nomeCompleto.trim().split(' ');
    const primeiroNome = partesNome[0] || 'Aluno';
    const inicial = primeiroNome.charAt(0).toUpperCase();

    // 1. Inputs de Formulários (Editar Perfil / Solicitação)
    const elInputNome = document.getElementById('student_name') || document.getElementById('user-name') || document.getElementById('user-profile-name');
    const elInputMatricula = document.getElementById('student_registration') || document.getElementById('user-registration') || document.getElementById('user-profile-registration');
    const elInputEmail = document.getElementById('user-email') || document.getElementById('user-profile-email');

    if (elInputNome) elInputNome.value = nomeCompleto;
    if (elInputMatricula) elInputMatricula.value = matriculaUser;
    if (elInputEmail) elInputEmail.value = emailUser;

    // 2. Saudação no Título Superior ("Olá, [PrimeiroNome]!")
    const elHeaderFirstName = document.getElementById('header-user-firstname');
    if (elHeaderFirstName) elHeaderFirstName.innerText = primeiroNome;

    // 3. Header e Avatares
    const elTopUserName = document.getElementById('top-user-name');
    const elTopAvatar = document.getElementById('top-avatar');
    if (elTopUserName) elTopUserName.innerText = nomeCompleto;
    if (elTopAvatar) elTopAvatar.innerText = inicial;

    // 4. Sidebar Lateral
    const elSidebarUserName = document.getElementById('sidebar-user-name');
    const elSidebarUserRole = document.getElementById('sidebar-user-role');
    const elSidebarAvatar = document.getElementById('sidebar-avatar');
    if (elSidebarUserName) elSidebarUserName.innerText = nomeCompleto;
    if (elSidebarUserRole) elSidebarUserRole.innerText = `Matrícula: ${matriculaUser}`;
    if (elSidebarAvatar) elSidebarAvatar.innerText = inicial;

    // 5. Banner Escuro Central do Dashboard (Ajuste para sumir com "Carregando dados...")
    const elBannerFullName = document.getElementById('banner-user-fullname');
    const elBannerInfo = document.getElementById('banner-user-info');
    const elBannerAvatar = document.getElementById('banner-avatar');

    if (elBannerFullName) elBannerFullName.innerText = nomeCompleto;
    if (elBannerInfo) elBannerInfo.innerText = `Mat. ${matriculaUser} · Email: ${emailUser}`;
    if (elBannerAvatar) elBannerAvatar.innerText = inicial;
}