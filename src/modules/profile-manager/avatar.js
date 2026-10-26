// Default avatar, palette and avatar file. The avatar field of the profile
// is the NAME of a file of <USER_DATA_PATH>/thumbs (Table 7: "Path
// indicating the file with the graphical representation of the viewer
// profile"), without a subdirectory (AVATAR_FILE_RE).
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

// Format of the name.
const AVATAR_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(svg|png|jpg|jpeg|webp)$/;
// Image type by extension.
const AVATAR_MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
// Maximum size of the file embedded in the screen; a larger file falls back
// to the default.
const MAX_AVATAR_BYTES = 1024 * 1024;
// Read failures that count as "no file" (not logged).
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

// SVG of POST /profile/create: a text that starts with "<svg" and has an
// <svg> element; absent or anything else, the default. The written file
// carries the xmlns.
function avatarSvg(value) {
    const doc = typeof value === 'string' && value.startsWith('<svg') ? withSvgNamespace(value) : '';
    return doc || svgDocument(DEFAULT_AVATAR_SVG);
}

// Writes <thumbs>/<id>.svg and returns the name (the value of the avatar
// field). Does not overwrite: an existing file (or link) with that name is
// an error (flag wx).
async function writeAvatarFile(id, svg) {
    const name = avatarFileName(id);
    if (!isAvatarFileName(name)) throw new Error(`id de perfil fora do formato do nome do arquivo do avatar: ${id}`);
    const dir = thumbsDir();
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, name), svg, { encoding: 'utf8', flag: 'wx' });
    return name;
}

// Deletes <thumbs>/<name>; a name out of format or a missing file returns
// false.
async function unlinkAvatarFile(name) {
    if (!isAvatarFileName(name)) return false;
    try {
        await fs.promises.unlink(path.join(thumbsDir(), name));
        return true;
    } catch (err) {
        if (err && err.code === 'ENOENT') return false;
        throw err;
    }
}

// Deletes <thumbs>/<id>.svg (a creation that failed after writing the
// file). An avatar with another name stays.
function removeAvatarFile(id) {
    return unlinkAvatarFile(avatarFileName(id));
}

// data: URL of the avatar file; '' if the name is out of format, if the file
// does not exist (or is a link outside the directory, or not a regular file,
// or is above the limit) or if the SVG has no <svg> element.
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

// <img class="avatar"> with the avatar file as a data: URL (without a file,
// the default). Embedded, not served by a route of the AoP: a route would
// serve the avatar of any profile without the restriction of Table C.75, and
// the SVG opened as a document would run script on the origin of the TV
// page.
function avatarHtml(avatar) {
    const src = avatarDataUri(avatar) || svgDataUri(DEFAULT_AVATAR_SVG);
    return imageHtml(src, { class: 'avatar', alt: '' });
}

module.exports = {
    svgAvatar, DEFAULT_AVATAR_HEX, DEFAULT_AVATAR_SVG, AVATAR_COLORS, avatarHtml,
    AVATAR_FILE_RE, AVATAR_MIME, MAX_AVATAR_BYTES, thumbsDir, isAvatarFileName, avatarFileName, avatarSvg,
    writeAvatarFile, unlinkAvatarFile, removeAvatarFile, avatarDataUri,
};
