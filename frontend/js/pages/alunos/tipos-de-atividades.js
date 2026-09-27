import { protegerRota } from '../../auth.js';
import { carregarDadosPerfil } from '../../utils/userprofile.js';

// Protege a rota verificando o token no localStorage
protegerRota();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Preenche o perfil e cabeçalhos do aluno
    await carregarDadosPerfil();

    // 2. Elementos para filtragem e busca
    const searchInput = document.getElementById('input-search');
    const filterButtons = document.querySelectorAll('[data-filter]');
    const cards = document.querySelectorAll('.activity-card');

    let currentCategory = 'all';
    let currentQuery = '';

    // Função unificada para aplicar ambos os filtros (texto e categoria)
    function aplicarFiltros() {
        cards.forEach(card => {
            const cardCategory = card.getAttribute('data-category');
            const title = card.querySelector('.stat-label, h1, h3')?.textContent.toLowerCase() || '';
            const description = card.querySelector('.stat-sub, p')?.textContent.toLowerCase() || '';

            const matchesCategory = (currentCategory === 'all') || (cardCategory === currentCategory);
            const matchesSearch = title.includes(currentQuery) || description.includes(currentQuery);

            if (matchesCategory && matchesSearch) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Evento de pesquisa por texto
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentQuery = searchInput.value.toLowerCase().trim();
            aplicarFiltros();
        });
    }

    // Eventos dos botões de filtro por categoria
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentCategory = button.getAttribute('data-filter');

            // Feedback visual de seleção
            filterButtons.forEach(btn => {
                btn.style.opacity = '0.6';
                btn.style.transform = 'scale(0.95)';
            });

            button.style.opacity = '1';
            button.style.transform = 'scale(1)';

            aplicarFiltros();
        });
    });
});