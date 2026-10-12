// Fonte UNICA do avatar padrao e da paleta (M1 da vacina): a mesma silhueta
// estava copiada em cinco arquivos — tres services do AoP, duas views e o
// user-api do tv3ws (atravessando o limite de servico e de linguagem).
// Toda leitura passa a vir daqui; as views recebem os valores por parametro
// de renderizacao.
const { svgImageHtml } = require('../../html');

function svgAvatar(hex) {
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="100" height="100" rx="30" fill="' + hex + '"/>' +
        '<circle cx="50" cy="40" r="14" fill="none" stroke="#ffffff" stroke-width="5"/>' +
        '<path d="M 14 90 a 36 36 0 0 1 72 0" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>' +
    '</svg>';
}

const DEFAULT_AVATAR_HEX = '#4d7c5b'; // verde escuro pastel

const DEFAULT_AVATAR_SVG = svgAvatar(DEFAULT_AVATAR_HEX);

const AVATAR_COLORS = [
    { hex: '#4d7c5b', name: 'Verde' },
    { hex: '#4d5b7c', name: 'Azul' },
    { hex: '#7c4d4d', name: 'Vermelho' },
    { hex: '#7c704d', name: 'Mostarda' },
    { hex: '#5b4d7c', name: 'Roxo' },
    { hex: '#4d7c70', name: 'Verde-azulado' },
    { hex: '#7c4d6e', name: 'Rosa' },
    { hex: '#7c6e4d', name: 'Marrom' }
].map(c => ({ ...c, svg: svgAvatar(c.hex) }));

// Avatar eh SVG inline gravado no Redis/JSON; qualquer outra coisa
// (legado) cai no default.
// Correcao de 12/10 (spec-1210-seguranca2, item 2): o avatar sai como <img>
// com o SVG em URL data: (../../html.js), e nao mais como SVG em linha no
// HTML. O avatar vem do corpo do POST /profile/create sem conferencia de
// formato (service.js, createProfile): um "<svg onload=...>" ou com <script>
// rodava na tela da TV no catalogo, na aplicacao de abertura e na escolha de
// perfil. Num <img> o SVG nao roda script. O padrao tambem vai como <img>,
// para os avatares terem a mesma caixa nas views.
function avatarHtml(avatar) {
    const svg = typeof avatar === 'string' && avatar.startsWith('<svg') ? avatar : DEFAULT_AVATAR_SVG;
    return svgImageHtml(svg, { class: 'avatar', alt: '' });
}

module.exports = { svgAvatar, DEFAULT_AVATAR_HEX, DEFAULT_AVATAR_SVG, AVATAR_COLORS, avatarHtml };
