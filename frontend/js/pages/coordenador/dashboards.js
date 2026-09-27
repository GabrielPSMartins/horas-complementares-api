import { protegerRota } from '../../auth.js';
import { obterSolicitacoesCoordenador } from '../../api.js';

let chartStatusInstance = null;
let chartCategoriasInstance = null;
let mapaTiposGlobal = null;
let todasSolicitacoesCache = null;

document.addEventListener('DOMContentLoaded', async () => {
    protegerRota();
    configurarFiltrosSemestre();
    await atualizarDashboard('todos');
});

function configurarFiltrosSemestre() {
    const botoes = document.querySelectorAll('.btn-semester');

    botoes.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const botaoClicado = e.currentTarget;

            botoes.forEach(b => b.classList.remove('active'));
            botaoClicado.classList.add('active');

            const semestre = botaoClicado.getAttribute('data-semestre');
            await atualizarDashboard(semestre);
        });
    });
}

async function carregarTodasSolicitacoes() {
    if (todasSolicitacoesCache) return todasSolicitacoesCache;

    try {
        const resData = await obterSolicitacoesCoordenador({ limit: 100, page_size: 100 });
        let lista = Array.isArray(resData) ? resData : (resData?.items || resData?.data || []);

        const solicitacoesCompletas = lista.map(item => {
            const semestreEncontrado = item.student?.current_semester 
                ?? item.student_semester 
                ?? item.semester 
                ?? item.current_semester;

            return {
                ...item,
                semestre_real: semestreEncontrado
            };
        });

        todasSolicitacoesCache = solicitacoesCompletas;
        return solicitacoesCompletas;

    } catch (err) {
        console.error("Erro ao carregar solicitações:", err);
        return [];
    }
}

async function atualizarDashboard(semestre = 'todos') {
    const containerPendentes = document.getElementById('lista-aguardam-analise');
    const containerAlunos = document.getElementById('lista-progresso-alunos');

    if (containerPendentes) {
        containerPendentes.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 0.875rem;">A carregar dados...</p>';
    }

    try {
        const tiposMap = await obterMapaTiposAtividade();
        const todasSolicitacoes = await carregarTodasSolicitacoes();

        let solicitacoesFiltradas = todasSolicitacoes;

        if (semestre !== 'todos') {
            solicitacoesFiltradas = todasSolicitacoes.filter(item => {
                if (item.semestre_real === undefined || item.semestre_real === null) return false;
                
                const semItem = String(item.semestre_real).replace(/[^0-9]/g, '');
                const semAlvo = String(semestre).replace(/[^0-9]/g, '');
                return semItem === semAlvo;
            });
        }

        renderizarCardsMetricas(solicitacoesFiltradas);
        renderizarGraficoStatus(solicitacoesFiltradas);
        renderizarSolicitacoesPendentes(solicitacoesFiltradas, containerPendentes, tiposMap);
        renderizarProgressoAlunos(solicitacoesFiltradas, containerAlunos);
        renderizarGraficoCategorias(solicitacoesFiltradas, tiposMap);

    } catch (erro) {
        console.error('Erro ao atualizar o dashboard:', erro);
        if (containerPendentes) {
            containerPendentes.innerHTML = '<p style="color: #ef4444; text-align: center; font-size: 0.875rem;">Erro ao carregar dados.</p>';
        }
    }
}

function renderizarCardsMetricas(solicitacoes) {
    let pendentes = 0, aprovadas = 0, canceladas = 0, rejeitadas = 0;
    const alunosSet = new Set();

    solicitacoes.forEach(item => {
        const st = (item.status || 'PENDING').toUpperCase();
        if (st === 'PENDING') pendentes++;
        else if (st === 'APPROVED') aprovadas++;
        else if (st === 'CANCELED') canceladas++;
        else if (st === 'REJECTED') rejeitadas++;

        if (item.student_id) alunosSet.add(item.student_id);
    });

    const totalSolicitacoes = solicitacoes.length;
    const totalAlunos = alunosSet.size;

    const elTotal = document.getElementById('total-solicitacoes');
    const elPendentes = document.getElementById('total-pendentes');
    const elAprovadas = document.getElementById('total-aprovadas');
    const elAlunos = document.getElementById('total-alunos');
    const bannerPending = document.getElementById('banner-pending-count');

    if (elTotal) elTotal.innerText = totalSolicitacoes;
    if (elPendentes) elPendentes.innerText = pendentes;
    if (elAprovadas) elAprovadas.innerText = aprovadas;
    if (elAlunos) elAlunos.innerText = totalAlunos;
    if (bannerPending) bannerPending.innerText = `${pendentes} pendente(s)`;
}

function renderizarGraficoStatus(solicitacoes) {
    const ctxStatus = document.getElementById('chartStatus')?.getContext('2d');
    if (!ctxStatus) return;

    let pendentes = 0, aprovadas = 0, rejeitadas = 0, canceladas = 0;

    solicitacoes.forEach(item => {
        const st = (item.status || 'PENDING').toUpperCase();
        if (st === 'PENDING') pendentes++;
        else if (st === 'APPROVED') aprovadas++;
        else if (st === 'REJECTED') rejeitadas++;
        else if (st === 'CANCELED') canceladas++;
    });

    if (chartStatusInstance) chartStatusInstance.destroy();

    chartStatusInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Pendentes', 'Aprovadas', 'Rejeitadas', 'Canceladas'],
            datasets: [{
                data: [pendentes, aprovadas, rejeitadas, canceladas],
                backgroundColor: ['#f59e0b', '#10b981', '#ef4444', '#64748b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

function renderizarSolicitacoesPendentes(solicitacoes, container, tiposMap) {
    if (!container) return;
    container.innerHTML = '';

    const titulo = document.getElementById('titulo-pendentes');
    const pendentes = solicitacoes.filter(item => !item.status || item.status.toUpperCase() === 'PENDING');
    const total = pendentes.length;

    if (titulo) titulo.innerText = `Aguardam análise (${total})`;

    if (total === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 0.875rem;">Nenhuma solicitação pendente para este semestre.</p>';
        return;
    }

    const exibidas = pendentes.slice(0, 6);

    exibidas.forEach((item, index) => {
        const alunoNome = item.student_name || 'Aluno';
        const semestreVal = item.semestre_real;
        const semestreHTML = semestreVal ? `<span class="status-badge badge-formacao" style="font-size: 0.7rem; padding: 2px 8px;">${semestreVal}º sem.</span>` : '';
        
        const nomeTipoAtividade = tiposMap?.get(item.activity_type_id) 
            || item.title 
            || 'Atividade Complementar';
        
        const horas = item.requested_hours ?? 0;
        const id = item.id;
        const isLast = index === exibidas.length - 1;

        const itemHTML = `
            <div class="flex-between-center" style="padding-bottom: 12px; ${!isLast ? 'border-bottom: 1px solid #f1f5f9;' : ''}">
                <div class="flex-align-center" style="gap: 12px;">
                    <div class="avatar-circle medium" style="background-color: #2563eb; width: 40px; height: 40px; min-width: 40px; display: flex; align-items: center; justify-content: center; color: white; border-radius: 50%; font-weight: 600;">${alunoNome.charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="flex-align-center" style="gap: 8px;">
                            <strong>${alunoNome}</strong>
                            ${semestreHTML}
                        </div>
                        <p class="stat-sub" style="margin-top: 2px; font-size: 0.8rem; color: #64748b;">${nomeTipoAtividade} · ${horas}h</p>
                    </div>
                </div>
                <a href="solicitacoes.html?id=${id}" class="btn-analys">Analisar</a>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHTML);
    });
}

function renderizarProgressoAlunos(solicitacoes, container) {
    if (!container) return;
    container.innerHTML = '';

    const alunosMap = new Map();

    solicitacoes.forEach(item => {
        const studentId = item.student_id || item.id;
        const studentName = item.student_name || 'Aluno';

        if (studentId && !alunosMap.has(studentId)) {
            alunosMap.set(studentId, {
                id: studentId,
                name: studentName,
                semester: item.semestre_real,
                approved_hours: item.status === 'APPROVED' ? (item.accepted_hours || item.requested_hours || 0) : 0,
                total_required_hours: 200
            });
        } else if (studentId && item.status === 'APPROVED') {
            const al = alunosMap.get(studentId);
            al.approved_hours += (item.accepted_hours || item.requested_hours || 0);
        }
    });

    const alunos = Array.from(alunosMap.values());

    if (alunos.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 0.875rem;">Nenhum aluno encontrado para este semestre.</p>';
        return;
    }

    const alunosExibidos = alunos.slice(0, 6);

    alunosExibidos.forEach(aluno => {
        const nome = aluno.name;
        const semestreVal = aluno.semester;
        const semestreHTML = semestreVal ? `<span class="status-badge badge-formacao" style="font-size: 0.7rem; padding: 2px 8px;">${semestreVal}º sem.</span>` : '';
        const horasAprovadas = aluno.approved_hours || 0;
        const horasTotais = aluno.total_required_hours || 200;

        const percentual = Math.min(Math.round((horasAprovadas / horasTotais) * 100), 100);
        const inicial = nome.charAt(0).toUpperCase();

        let corBarra = '#2563eb';
        let corBadge = 'badge-formacao';

        if (percentual >= 100) {
            corBarra = '#10b981';
            corBadge = 'badge-approved';
        } else if (percentual < 30) {
            corBarra = '#ef4444';
            corBadge = 'badge-pending';
        }

        const itemHTML = `
            <div class="flex-between-center" style="gap: 16px; margin-bottom: 12px;">
                <div class="avatar-circle medium" style="background-color: #2563eb; width: 40px; height: 40px; min-width: 40px; display: flex; align-items: center; justify-content: center; color: white; border-radius: 50%; font-weight: 600;">${inicial}</div>
                <div style="flex-grow: 1;">
                    <div class="flex-align-center" style="gap: 8px; margin-bottom: 6px;">
                        <strong>${nome}</strong>
                        ${semestreHTML}
                    </div>
                    <div class="progress-bar-bg" style="margin: 0; height: 8px;">
                        <div class="progress-bar-fill" style="width: ${percentual}%; background-color: ${corBarra};"></div>
                    </div>
                </div>
                <div class="flex-align-center" style="gap: 12px; min-width: 110px; justify-content: flex-end;">
                    <span class="stat-sub" style="font-weight: 600;">${horasAprovadas}/${horasTotais}h</span>
                    <span class="status-badge ${corBadge}" style="font-weight: 800;">${percentual}%</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHTML);
    });
}

function renderizarGraficoCategorias(solicitacoes, tiposMap) {
    const ctxCat = document.getElementById('chartCategorias')?.getContext('2d');
    if (!ctxCat) return;

    const categoriasCount = {};

    solicitacoes.forEach(item => {
        const nomeTipo = tiposMap?.get(item.activity_type_id) 
            || item.title 
            || 'Geral';
            
        categoriasCount[nomeTipo] = (categoriasCount[nomeTipo] || 0) + 1;
    });

    const labels = Object.keys(categoriasCount);
    const dataValues = Object.values(categoriasCount);

    if (chartCategoriasInstance) chartCategoriasInstance.destroy();

    chartCategoriasInstance = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Sem dados'],
            datasets: [{
                label: 'Solicitações',
                data: dataValues.length ? dataValues : [0],
                backgroundColor: '#2563eb',
                borderRadius: 4,
                barPercentage: 0.5
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } },
                y: { ticks: { autoSkip: false, font: { size: 11 } } }
            }
        }
    });
}

async function obterMapaTiposAtividade() {
    if (mapaTiposGlobal) return mapaTiposGlobal;
    const mapa = new Map();
    try {
        const apiModule = await import('../../api.js');
        let tiposData = null;
        if (typeof apiModule.obterTiposAtividade === 'function') {
            tiposData = await apiModule.obterTiposAtividade();
        } else if (typeof apiModule.listarTiposAtividade === 'function') {
            tiposData = await apiModule.listarTiposAtividade();
        }
        const lista = Array.isArray(tiposData) ? tiposData : (tiposData?.items || tiposData?.data || []);
        lista.forEach(t => mapa.set(t.id, t.name || t.nome || t.title));
        mapaTiposGlobal = mapa;
    } catch (e) {}
    return mapa;
}