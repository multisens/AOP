// Fonte UNICA do avatar padrao e da paleta (M1 da vacina): a mesma silhueta
// estava copiada em cinco arquivos — tres services do AoP, duas views e o
// user-api do tv3ws (atravessando o limite de servico e de linguagem).
// Toda leitura passa a vir daqui; as views recebem os valores por parametro
// de renderizacao.
//
// G8 (decisao do Luis em 12/10): o campo avatar do perfil e o NOME de um
// arquivo do diretorio de miniaturas, como a Tabela 7 pede ("avatar": "Path
// indicating the file with the graphical representation of the viewer
// profile", file path, optional; p. 63; p. 81 do PDF). Antes, o AoP e a carga
// gravavam o SVG em linha no campo. Contrato:
// - diretorio: <USER_DATA_PATH>/thumbs aqui, o mesmo USER_THUMBS do tv3ws
//   (/user-files/thumbs, volume ./user-files da raiz), que o entrega pela
//   C.6.14.6 (GET /tv3/<scid>/users/files?path=<avatar>, Tabela C.73);
// - nome: AVATAR_FILE_RE, sem "/" e sem ".." (o nome e o caminho a partir do
//   diretorio, sem subdiretorio);
// - ausente: o avatar padrao de cada tela.
// O gestor de perfis grava o arquivo como <id do perfil>.svg ao criar o
// perfil (service.js, createProfile) e o apaga no despejo (P3).
const fs = require('fs');
const path = require('path');
const { svgDocument, svgDataUri, imageHtml } = require('../../html');

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

// --- arquivo do avatar (G8) -------------------------------------------------------
// Formato do nome (o mesmo da regra do avatar em infra/redis/esquema.json)
const AVATAR_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(svg|png|jpg|jpeg|webp)$/;
// tipo de imagem pela extensao (a mesma tabela do tv3ws na C.6.14.6)
const AVATAR_MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
// Teto do arquivo embutido na tela. O que o gestor grava cabe no corpo do POST
// /profile/create (limite de 100 kB do express.json); arquivo maior foi posto
// por fora e cai no padrao, para nao inchar o HTML da tela.
const MAX_AVATAR_BYTES = 1024 * 1024;
// falha de leitura que equivale a "sem arquivo" (nao vai para o log)
const NOT_FOUND = new Set(['ENOENT', 'ENOTDIR', 'ELOOP', 'ENAMETOOLONG']);

function thumbsDir() {
    const base = process.env.USER_DATA_PATH;
    if (!base) throw new Error('USER_DATA_PATH nao definido: sem diretorio de miniaturas para o avatar');
    return path.join(base, 'thumbs');
}

function isAvatarFileName(name) {
    return typeof name === 'string' && AVATAR_FILE_RE.test(name);
}

// nome do arquivo que o gestor grava para o perfil
function avatarFileName(id) {
    return `${id}.svg`;
}

// SVG do POST /profile/create conferido como as telas ja conferiam (texto que
// comeca por "<svg" e tem elemento <svg>; ver ../../html.js, svgDocument);
// ausente ou fora disso, o padrao — como antes, quando o que nao era SVG
// aparecia como o padrao. O documento gravado leva o xmlns (o arquivo e
// entregue como image/svg+xml pela C.6.14.6).
function avatarSvg(value) {
    const doc = typeof value === 'string' && value.startsWith('<svg') ? svgDocument(value) : '';
    return doc || svgDocument(DEFAULT_AVATAR_SVG);
}

// Grava <thumbs>/<id>.svg e devolve o nome (o valor do campo avatar). Nao
// sobrescreve: arquivo (ou link) ja existente com esse nome e erro (flag wx).
async function writeAvatarFile(id, svg) {
    const name = avatarFileName(id);
    if (!isAvatarFileName(name)) throw new Error(`id de perfil fora do formato do nome do arquivo do avatar: ${id}`);
    const dir = thumbsDir();
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, name), svg, { encoding: 'utf8', flag: 'wx' });
    return name;
}

// Apaga <thumbs>/<id>.svg (despejo, P3, ou criacao que falhou depois de gravar
// o arquivo). Arquivo ausente nao e erro (devolve false). So o arquivo que o
// gestor grava para o perfil: um avatar com outro nome nao foi posto por ele e
// fica.
async function removeAvatarFile(id) {
    const name = avatarFileName(id);
    if (!isAvatarFileName(name)) return false;
    try {
        await fs.promises.unlink(path.join(thumbsDir(), name));
        return true;
    } catch (err) {
        if (err && err.code === 'ENOENT') return false;
        throw err;
    }
}

// URL data: do arquivo do avatar; '' se o nome estiver fora do formato, se o
// arquivo nao existir (ou for link para fora do diretorio, ou nao for arquivo
// comum, ou passar do teto) ou se o SVG nao tiver elemento <svg>.
function avatarDataUri(name) {
    if (!isAvatarFileName(name)) return '';
    try {
        const dir = fs.realpathSync(thumbsDir());
        const real = fs.realpathSync(path.join(dir, name));
        if (path.dirname(real) !== dir) return '';
        const st = fs.statSync(real);
        if (!st.isFile() || st.size > MAX_AVATAR_BYTES) return '';
        const data = fs.readFileSync(real);
        const ext = name.slice(name.lastIndexOf('.') + 1);
        if (ext === 'svg') return svgDataUri(data.toString('utf8'));
        return `data:${AVATAR_MIME[ext]};base64,${data.toString('base64')}`;
    } catch (err) {
        if (!NOT_FOUND.has(err && err.code)) console.error(`[avatar] falha lendo o arquivo ${name}: ${err && err.message}`);
        return '';
    }
}

// Avatar nas telas da plataforma (escolha de perfil, catalogo de aplicacoes,
// aplicacao de abertura): <img class="avatar"> com o arquivo nomeado no campo
// avatar embutido em URL data:; sem arquivo ou fora do formato, o padrao.
// Correcao de 12/10 (spec-1210-seguranca2, item 2): o avatar sai como <img>,
// e nao mais como SVG em linha no HTML (um "<svg onload=...>" ou com <script>
// rodava na tela da TV); num <img> o SVG nao roda script. O padrao tambem vai
// como <img>, para os avatares terem a mesma caixa nas views.
// G8 (decisao do Luis em 12/10): o AoP le o arquivo e o embute, em vez de
// servi-lo por uma rota estatica do diretorio de miniaturas:
// - a porta do AoP e alcancavel por qualquer um na rede, e uma rota dele
//   entregaria o avatar de qualquer perfil sem a restricao da Tabela C.73
//   (p. 333; p. 351 do PDF: "the file is returned only if the user has granted
//   access to the broadcaster"), que o tv3ws aplica na C.6.14.6;
// - um SVG servido pela origem do AoP e aberto como documento rodaria o
//   script dele nessa origem (a da pagina da TV, com o /mqtt); embutido num
//   <img>, nao roda;
// - as telas ja mostravam o avatar como <img src=data:> (mesma caixa, mesmas
//   conferencias de escape).
// Custo: leitura sincrona do arquivo a cada tela (ate cinco perfis, P3).
// Desde G8, o SVG em linha no campo (perfis gravados antes) esta fora do
// formato e aparece como o padrao.
function avatarHtml(avatar) {
    const src = avatarDataUri(avatar) || svgDataUri(DEFAULT_AVATAR_SVG);
    return imageHtml(src, { class: 'avatar', alt: '' });
}

module.exports = {
    svgAvatar, DEFAULT_AVATAR_HEX, DEFAULT_AVATAR_SVG, AVATAR_COLORS, avatarHtml,
    AVATAR_FILE_RE, AVATAR_MIME, MAX_AVATAR_BYTES, thumbsDir, isAvatarFileName, avatarFileName, avatarSvg,
    writeAvatarFile, removeAvatarFile, avatarDataUri,
};
