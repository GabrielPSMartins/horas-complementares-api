// Escapa caracteres especiais de HTML para interpolar valores dinâmicos (vindos da API ou do usuário)
// com segurança em templates usados com innerHTML, inclusive dentro de atributos.
export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
