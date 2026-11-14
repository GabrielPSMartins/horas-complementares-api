// Endereço da API. Por padrão é a mesma máquina que serve o frontend, na porta 8000
// (em desenvolvimento: http://localhost:8000). Para outro endereço, altere aqui.
export const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

// Raiz do frontend, calculada a partir da localização deste arquivo (frontend/js/config.js).
// Assim os redirecionamentos funcionam tanto servindo a raiz do repositório
// (http://host/frontend/) quanto servindo a pasta frontend/ diretamente (http://host/).
export const FRONTEND_ROOT_URL = new URL('../', import.meta.url).href;
export const LOGIN_URL = new URL('index.html', FRONTEND_ROOT_URL).href;
