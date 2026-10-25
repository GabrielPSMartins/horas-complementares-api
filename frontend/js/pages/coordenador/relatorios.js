import { protegerRota } from '../../auth.js';
import { 
    obterSolicitacoesCoordenador, 
    obterTiposAtividades, 
    obterRelatorioAlunoPorId,
    exportarRelatorioPdfAlunoPorId
} from '../../api.js';
import { carregarDadosPerfilCoordenador } from '../../utils/userprofile.js';

let chartTipoInstance = null;
let chartDistribuicaoInstance = null;

let todasSolicitacoesGlobal = [];
let todosAlunosGlobal = [];
let mapaTiposGlobal = new Map();
let alunoSelecionadoId = null;
let filtroSemestreAtivo = 'todos';
let filtroStatusHistoricoAtivo = 'todos';

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();
    carregarDadosPerfilCoordenador();

    // Captura o ID do aluno vindo via URL (?student_id=... ou ?id=...)
    const params = new URLSearchParams(window.location.search);
    alunoSelecionadoId = params.get('student_id') || params.get('id') || params.get('aluno_id');

    configurarFiltrosSemestre();
    configurarEventoSelectAluno();
    configurarEventoExportarPDF();

    await carregarDadosIniciais();

    if (window.lucide) {
        window.lucide.createIcons();
    }
});

function configurarFiltrosSemestre() {
    const botoes = document.querySelectorAll('.btn-semester');
    botoes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.disabled) return;

            botoes.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            filtroSemestreAtivo = e.currentTarget.getAttribute('data-semestre') || 'todos';
            preencherSelectAlunos();
        });
    });
}

function configurarEventoSelectAluno() {
    const select = document.getElementById('select-aluno-relatorio');
    if (!select) return;

    select.addEventListener('change', (e) => {
        alunoSelecionadoId = e.target.value;
        if (alunoSelecionadoId) {
            carregarRelatorioAluno(alunoSelecionadoId);
        } else {
            ocultarRelatorio();
        }
    });
}

// Ação para abrir o PDF em nova aba para visualização
function configurarEventoExportarPDF() {
    const btnPdf = document.getElementById('btn-exportar-pdf');
    if (!btnPdf) return;

    btnPdf.addEventListener('click', async () => {
        if (!alunoSelecionadoId) {
            alert('Por favor, selecione um aluno para visualizar o relatório.');
            return;
        }

        const textoOriginal = btnPdf.innerHTML;
        btnPdf.innerHTML = `<span>Gerando PDF...</span>`;
        btnPdf.disabled = true;

        try {
            await exportarRelatorioPdfAlunoPorId(alunoSelecionadoId);
        } catch (err) {
            console.error('Erro ao visualizar PDF:', err);
            alert(err.message || 'Erro ao gerar o PDF para visualização.');
        } finally {
            btnPdf.innerHTML = textoOriginal;
            btnPdf.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
    });
}

async function carregarDadosIniciais() {
    try {
        await carregarMapaTiposAtividade();

        const resData = await obterSolicitacoesCoordenador({ limit: 300 });
        todasSolicitacoesGlobal = Array.isArray(resData) ? resData : (resData?.items || resData?.data || []);

        extrairListaUnicaAlunos();
        atualizarBotoesSemestreDisponiveis();
        preencherSelectAlunos();

        if (alunoSelecionadoId) {
            const select = document.getElementById('select-aluno-relatorio');
            if (select) select.value = alunoSelecionadoId;
            await carregarRelatorioAluno(alunoSelecionadoId);
        } else {
            ocultarRelatorio();
        }

    } catch (err) {
        console.error("Erro ao carregar dados iniciais dos relatórios:", err);
    }
}

async function carregarMapaTiposAtividade() {
    try {
        const tiposData = await obterTiposAtividades();
        const lista = Array.isArray(tiposData) ? tiposData : (tiposData?.items || tiposData?.data || []);
        
        mapaTiposGlobal.clear();
        lista.forEach(t => {
            const idStr = String(t.id);
            const nomeStr = t.name || t.nome || t.title || 'Sem título';
            mapaTiposGlobal.set(idStr, nomeStr);
        });
    } catch (e) {
        console.warn("Erro ao carregar mapa de tipos:", e);
    }
}

function extrairListaUnicaAlunos() {
    const alunosMap = new Map();

    todasSolicitacoesGlobal.forEach(item => {
        const studentObj = item.student || item.user || {};
        const idAluno = item.student_id || studentObj.id || item.user_id;
        const nomeAluno = item.student_name || studentObj.name || 'Aluno Sem Nome';
        const rgaAluno = item.student_registration_number || studentObj.registration_number || '';
        const semestreAluno = item.student_semester ?? studentObj.current_semester ?? '';

        if (idAluno && !alunosMap.has(String(idAluno))) {
            alunosMap.set(String(idAluno), {
                id: String(idAluno),
                name: nomeAluno,
                rga: rgaAluno,
                semester: String(semestreAluno).replace(/[^0-9]/g, '')
            });
        }
    });

    todosAlunosGlobal = Array.from(alunosMap.values());
}

function atualizarBotoesSemestreDisponiveis() {
    const semestresComAlunos = new Set(todosAlunosGlobal.map(a => a.semester));
    const botoes = document.querySelectorAll('.btn-semester');

    botoes.forEach(btn => {
        const semAttr = btn.getAttribute('data-semestre');
        if (semAttr === 'todos') {
            btn.disabled = false;
        } else {
            const existe = semestresComAlunos.has(semAttr);
            btn.disabled = !existe;
            if (!existe) btn.title = "Nenhum aluno cadastrado neste semestre";
        }
    });
}

function preencherSelectAlunos() {
    const select = document.getElementById('select-aluno-relatorio');
    if (!select) return;

    select.innerHTML = '<option value="">-- Selecione um aluno --</option>';

    let alunosFiltrados = todosAlunosGlobal;
    if (filtroSemestreAtivo !== 'todos') {
        alunosFiltrados = todosAlunosGlobal.filter(a => String(a.semester) === String(filtroSemestreAtivo));
    }

    if (alunosFiltrados.length === 0) {
        select.innerHTML = '<option value="">Nenhum aluno para este semestre</option>';
        ocultarRelatorio();
        return;
    }

    alunosFiltrados.forEach(aluno => {
        const opt = document.createElement('option');
        opt.value = aluno.id;
        const rgaTexto = aluno.rga ? ` — ${aluno.rga}` : '';
        const semTexto = aluno.semester ? ` (${aluno.semester}º sem.)` : '';
        opt.textContent = `${aluno.name}${rgaTexto}${semTexto}`;
        select.appendChild(opt);
    });

    if (alunoSelecionadoId && alunosFiltrados.some(a => a.id === alunoSelecionadoId)) {
        select.value = alunoSelecionadoId;
        carregarRelatorioAluno(alunoSelecionadoId);
    } else {
        select.value = "";
        ocultarRelatorio();
    }
}

function ocultarRelatorio() {
    alunoSelecionadoId = null;
    const containerConteudo = document.getElementById('container-relatorio-conteudo');
    const containerSemAluno = document.getElementById('container-sem-aluno');
    const btnPdf = document.getElementById('btn-exportar-pdf');

    if (containerConteudo) containerConteudo.style.display = 'none';
    if (containerSemAluno) containerSemAluno.style.display = 'block';
    if (btnPdf) btnPdf.style.display = 'none';
}

function exibirRelatorio() {
    const containerConteudo = document.getElementById('container-relatorio-conteudo');
    const containerSemAluno = document.getElementById('container-sem-aluno');
    const btnPdf = document.getElementById('btn-exportar-pdf');

    if (containerConteudo) containerConteudo.style.display = 'flex';
    if (containerSemAluno) containerSemAluno.style.display = 'none';
    if (btnPdf) {
        btnPdf.style.display = 'inline-flex';
        if (window.lucide) window.lucide.createIcons();
    }
}

async function carregarRelatorioAluno(studentId) {
    if (!studentId) {
        ocultarRelatorio();
        return;
    }

    const solicitacoesAluno = todasSolicitacoesGlobal.filter(s => {
        const idObj = s.student_id || s.student?.id || s.user_id;
        return String(idObj) === String(studentId);
    });

    let dadosRelatorioAPI = null;
    try {
        dadosRelatorioAPI = await obterRelatorioAlunoPorId(studentId);
    } catch (e) {
        console.warn("API de relatório direto indisponível, calculando localmente:", e);
    }

    exibirRelatorio();
    renderizarBannerAluno(studentId, dadosRelatorioAPI, solicitacoesAluno);
    renderizarGraficosAluno(solicitacoesAluno);
    renderizarListaSolicitacoesAluno(solicitacoesAluno);
}

function renderizarBannerAluno(studentId, reportAPI, solicitacoes) {
    const alunoEncontrado = todosAlunosGlobal.find(a => a.id === String(studentId)) || {};
    const studentInfo = reportAPI?.student || {};
    const courseInfo = reportAPI?.course || {};
    const summaryInfo = reportAPI?.summary || {};

    const nomeAluno = studentInfo.name || alunoEncontrado.name || 'Aluno';
    const semestreAluno = studentInfo.current_semester || alunoEncontrado.semester || '--';
    const rgaAluno = studentInfo.registration_number || alunoEncontrado.rga || '';
    const cursoNome = courseInfo.name || 'Sistemas de Informação';

    const elNome = document.getElementById('relatorio-nome-aluno');
    const elSemestre = document.getElementById('relatorio-semestre-badge');
    const elCurso = document.getElementById('relatorio-info-curso');
    const elAvatar = document.getElementById('relatorio-avatar');

    if (elNome) elNome.innerText = nomeAluno;
    if (elSemestre) elSemestre.innerText = semestreAluno !== '--' ? `${semestreAluno}º semestre` : '--';
    if (elCurso) elCurso.innerText = `${cursoNome}${rgaAluno ? ` · Mat. ${rgaAluno}` : ''}`;
    if (elAvatar) {
        const partes = nomeAluno.trim().split(' ');
        elAvatar.innerText = partes[0].charAt(0).toUpperCase();
    }

    let horasAprovadas = 0;
    let pendente = 0, aprovada = 0, rejeitada = 0, cancelada = 0;

    solicitacoes.forEach(item => {
        const st = (item.status || 'PENDING').toUpperCase();
        if (st === 'APPROVED') {
            aprovada++;
            horasAprovadas += (item.accepted_hours ?? item.granted_hours ?? item.requested_hours ?? 0);
        } else if (st === 'REJECTED') {
            rejeitada++;
        } else if (st === 'CANCELED') {
            cancelada++;
        } else {
            pendente++;
        }
    });

    const horasExigidas = summaryInfo.total_required_hours || courseInfo.total_required_hours || 200;
    if (summaryInfo.total_approved_hours !== undefined) {
        horasAprovadas = summaryInfo.total_approved_hours;
    }

    const horasRestantes = Math.max(0, horasExigidas - horasAprovadas);
    const porcentagem = Math.min(100, Math.round((horasAprovadas / horasExigidas) * 100));

    const elExigidas = document.getElementById('relatorio-horas-exigidas');
    const elAprovadas = document.getElementById('relatorio-horas-aprovadas');
    const elRestantes = document.getElementById('relatorio-horas-restantes');
    const elPorcentagem = document.getElementById('relatorio-progresso-porcentagem');
    const elBarra = document.getElementById('relatorio-progresso-bar');

    if (elExigidas) elExigidas.innerText = `${horasExigidas}h`;
    if (elAprovadas) elAprovadas.innerText = `${horasAprovadas}h`;
    if (elRestantes) elRestantes.innerText = `${horasRestantes}h`;
    if (elPorcentagem) elPorcentagem.innerText = `${porcentagem}%`;
    if (elBarra) elBarra.style.width = `${porcentagem}%`;

    const elPend = document.getElementById('count-pendente');
    const elAprov = document.getElementById('count-aprovada');
    const elRej = document.getElementById('count-rejeitada');
    const elCanc = document.getElementById('count-cancelada');

    if (elPend) elPend.innerText = pendente;
    if (elAprov) elAprov.innerText = aprovada;
    if (elRej) elRej.innerText = rejeitada;
    if (elCanc) elCanc.innerText = cancelada;
}

function renderizarGraficosAluno(solicitacoes) {
    const ctxTipo = document.getElementById('chartHorasPorTipo')?.getContext('2d');
    const ctxDist = document.getElementById('chartDistribuicao')?.getContext('2d');

    const horasPorTipoMap = {};

    solicitacoes.forEach(item => {
        const st = (item.status || 'PENDING').toUpperCase();
        if (st === 'APPROVED') {
            const typeId = String(item.activity_type_id || item.activity_type?.id || '');
            const nomeTipo = mapaTiposGlobal.get(typeId) || item.activity_type?.name || 'Outros';
            const h = item.accepted_hours ?? item.granted_hours ?? item.requested_hours ?? 0;

            horasPorTipoMap[nomeTipo] = (horasPorTipoMap[nomeTipo] || 0) + h;
        }
    });

    const labels = Object.keys(horasPorTipoMap);
    const dataValues = Object.values(horasPorTipoMap);

    const cores = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

    if (ctxTipo) {
        if (chartTipoInstance) chartTipoInstance.destroy();

        chartTipoInstance = new Chart(ctxTipo, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sem horas aprovadas'],
                datasets: [{
                    label: 'Horas Aprovadas',
                    data: dataValues.length ? dataValues : [0],
                    backgroundColor: labels.length ? cores.slice(0, labels.length) : ['#e2e8f0'],
                    borderRadius: 6,
                    barPercentage: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 20 } },
                    x: { ticks: { font: { size: 11 } } }
                }
            }
        });
    }

    if (ctxDist) {
        if (chartDistribuicaoInstance) chartDistribuicaoInstance.destroy();

        const labelsLegenda = labels.map((l, i) => `${l}: ${dataValues[i]}h`);

        chartDistribuicaoInstance = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: labelsLegenda.length ? labelsLegenda : ['Sem dados'],
                datasets: [{
                    data: dataValues.length ? dataValues : [1],
                    backgroundColor: dataValues.length ? cores.slice(0, labels.length) : ['#e2e8f0']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 12, weight: '600' }, boxWidth: 12 }
                    }
                }
            }
        });
    }
}

function renderizarListaSolicitacoesAluno(solicitacoes) {
    const container = document.getElementById('container-lista-solicitacoes');
    const elTitulo = document.getElementById('titulo-lista-solicitacoes');

    if (!container) return;
    container.innerHTML = '';

    let solicitacoesFiltradas = solicitacoes;
    if (filtroStatusHistoricoAtivo !== 'todos') {
        solicitacoesFiltradas = solicitacoes.filter(item => {
            const st = (item.status || 'PENDING').toUpperCase();
            if (filtroStatusHistoricoAtivo === 'PENDING') return st === 'PENDING';
            if (filtroStatusHistoricoAtivo === 'APPROVED') return st === 'APPROVED';
            if (filtroStatusHistoricoAtivo === 'REJECTED') return st === 'REJECTED';
            if (filtroStatusHistoricoAtivo === 'CANCELED') return st === 'CANCELED';
            if (filtroStatusHistoricoAtivo === 'IN_REVIEW') return st === 'IN_REVIEW' || st === 'UNDER_REVIEW';
            return true;
        });
    }

    if (elTitulo) {
        elTitulo.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
                <span style="font-size: 16px; font-weight: 800; color: #0f172a;">
                    Todas as solicitações (${solicitacoesFiltradas.length})
                </span>

                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="btn-filtro-historico ${filtroStatusHistoricoAtivo === 'todos' ? 'active' : ''}" data-status="todos">Todas</button>
                    <button class="btn-filtro-historico ${filtroStatusHistoricoAtivo === 'PENDING' ? 'active' : ''}" data-status="PENDING">Pendente</button>
                    <button class="btn-filtro-historico ${filtroStatusHistoricoAtivo === 'APPROVED' ? 'active' : ''}" data-status="APPROVED">Aprovada</button>
                    <button class="btn-filtro-historico ${filtroStatusHistoricoAtivo === 'REJECTED' ? 'active' : ''}" data-status="REJECTED">Rejeitada</button>
                    <button class="btn-filtro-historico ${filtroStatusHistoricoAtivo === 'CANCELED' ? 'active' : ''}" data-status="CANCELED">Cancelada</button>
                    <button class="btn-filtro-historico ${filtroStatusHistoricoAtivo === 'IN_REVIEW' ? 'active' : ''}" data-status="IN_REVIEW">Em Análise</button>
                </div>
            </div>
        `;

        const btnsFiltro = elTitulo.querySelectorAll('.btn-filtro-historico');
        btnsFiltro.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filtroStatusHistoricoAtivo = e.currentTarget.getAttribute('data-status');
                renderizarListaSolicitacoesAluno(solicitacoes);
            });
        });
    }

    if (solicitacoesFiltradas.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px 0; font-size: 14px;">Nenhuma solicitação encontrada para este filtro.</p>';
        return;
    }

    solicitacoesFiltradas.forEach(item => {
        const typeId = String(item.activity_type_id || item.activity_type?.id || '');
        const nomeTipo = mapaTiposGlobal.get(typeId) || item.activity_type?.name || 'Atividade Complementar';
        const tituloDesc = item.title || item.description || 'Sem descrição cadastrada';
        const dataFmt = formatarDataBR(item.created_at || item.activity_date);

        const stUpper = (item.status || 'PENDING').toUpperCase();
        const statusObj = obterConfigStatus(stUpper);

        const hSolicitadas = item.requested_hours ?? 0;
        const hAprovadas = item.accepted_hours ?? item.granted_hours;

        const justificativaErro = item.justification || item.rejection_reason;

        const cardHTML = `
            <div class="historico-solicitacao-item">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <strong style="font-size: 16px; color: #0f172a; font-weight: 800; letter-spacing: -0.2px;">
                            ${nomeTipo}
                        </strong>
                        
                        <span class="badge-pill ${statusObj.classePill}">
                            <span class="dot"></span>
                            <span>${statusObj.texto}</span>
                        </span>
                    </div>

                    <div style="text-align: right; flex-shrink: 0;">
                        <span style="font-size: 15px; font-weight: 800; color: #1e293b; display: block;">
                            ${hSolicitadas}h sol.
                        </span>
                        ${stUpper === 'APPROVED' && hAprovadas !== undefined && hAprovadas !== null ? `
                            <span style="font-size: 13px; font-weight: 800; color: #10b981; display: block; margin-top: 1px;">
                                ${hAprovadas}h apr.
                            </span>
                        ` : ''}
                    </div>
                </div>

                <p style="font-size: 14px; color: #64748b; font-weight: 500; margin: 0 0 6px 0; line-height: 1.4;">
                    ${tituloDesc}
                </p>

                <span style="font-size: 13px; color: #94a3b8; font-weight: 500; display: block;">
                    ${dataFmt}
                </span>

                ${stUpper === 'REJECTED' && justificativaErro ? `
                    <div class="caixa-motivo-rejeicao">
                        ${justificativaErro}
                    </div>
                ` : ''}
            </div>
        `;

        container.insertAdjacentHTML('beforeend', cardHTML);
    });
}

function obterConfigStatus(statusRaw) {
    const st = (statusRaw || 'PENDING').toUpperCase();
    switch (st) {
        case 'APPROVED':
            return { texto: 'Aprovada', classePill: 'badge-pill-approved' };
        case 'REJECTED':
            return { texto: 'Rejeitada', classePill: 'badge-pill-rejected' };
        case 'IN_REVIEW':
        case 'UNDER_REVIEW':
            return { texto: 'Em Análise', classePill: 'badge-pill-pending' };
        case 'CANCELED':
            return { texto: 'Cancelada', classePill: 'badge-pill-canceled' };
        case 'PENDING':
        default:
            return { texto: 'Pendente', classePill: 'badge-pill-pending' };
    }
}

function formatarDataBR(dataIso) {
    if (!dataIso) return '--/--/----';
    try {
        const d = new Date(dataIso);
        if (isNaN(d.getTime())) return dataIso;
        return d.toLocaleDateString('pt-BR');
    } catch {
        return dataIso;
    }
}