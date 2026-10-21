// Avatar padrao, paleta e arquivo do avatar. O campo avatar do perfil e o NOME
// de um arquivo de <USER_DATA_PATH>/thumbs (Tabela 7: "Path indicating the file
// with the graphical representation of the viewer profile"), sem subdiretorio
// (AVATAR_FILE_RE); o tv3ws entrega o mesmo diretorio pela C.6.14.6.
const fs = require('fs');
const path = require('path');
const { svgDocument, withSvgNamespace, svgDataUri, imageHtml } = require('../../html');

function svgAvatar(hex) {
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="100" height="100" rx="30" fill="' + hex + '"/>' +
        '<circle cx="50" cy="40" r="14" fill="none" stroke="#ffffff" stroke-width="5"/>' +
        '<path d="M 14 90 a 36 36 0 0 1 72 0" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>' +
    '</svg>';
}

const DEFAULT_AVATAR_HEX = '#4d7c5b';

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

function avatarFileName(id) {
    return `${id}.svg`;
}

// SVG do POST /profile/create: texto que comeca por "<svg" e tem elemento
// <svg>; ausente ou fora disso, o padrao. O arquivo gravado leva o xmlns (e
// entregue como image/svg+xml pela C.6.14.6).
function avatarSvg(value) {
    const doc = typeof value === 'string' && value.startsWith('<svg') ? withSvgNamespace(value) : '';
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

// Apaga <thumbs>/<id>.svg (criacao que falhou depois de gravar o arquivo);
// ausente devolve false. Avatar com outro nome nao foi posto pelo gestor e fica.
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

// <img class="avatar"> com o arquivo do avatar em URL data: (sem arquivo, o
// padrao). Embutido, e nao servido por rota do AoP: a rota entregaria o avatar
// de qualquer perfil sem a restricao da Tabela C.73, que o tv3ws aplica, e o SVG
// aberto como documento rodaria script na origem da pagina da TV.
function avatarHtml(avatar) {
    const src = avatarDataUri(avatar) || svgDataUri(DEFAULT_AVATAR_SVG);
    return imageHtml(src, { class: 'avatar', alt: '' });
}

module.exports = {
    svgAvatar, DEFAULT_AVATAR_HEX, DEFAULT_AVATAR_SVG, AVATAR_COLORS, avatarHtml,
    AVATAR_FILE_RE, AVATAR_MIME, MAX_AVATAR_BYTES, thumbsDir, isAvatarFileName, avatarFileName, avatarSvg,
    writeAvatarFile, removeAvatarFile, avatarDataUri,
};
