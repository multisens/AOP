// HTML do servidor com dado de fora da plataforma (BAM da emissora, perfil do
// POST /profile/create), que as views exibem com <%- %>: texto e atributo vao
// escapados; SVG vai em <img src="data:image/svg+xml;base64,...">, onde o
// navegador nao roda script nem carrega recurso externo (Tabela 6: "Secure
// static mode SVG image").
const SVG_NS = 'http://www.w3.org/2000/svg';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Tabela 6: appIcon e bannerIcon sao xs:any namespace="http://www.w3.org/2000/svg".
// SVG sem esse xmlns e recusado, nao corrigido: corrigir faria a emissora validar
// no testbed um BAM que um receptor que confira o tipo recusaria.
// Devolve o motivo da recusa ('' = aceito).
function svgProblem(svg) {
    if (typeof svg !== 'string' || svg.trim() === '') return 'ausente';
    const root = /<svg(?=[\s/>])[^>]*>/.exec(svg);
    if (!root) return 'sem elemento <svg>';
    if (!/\sxmlns\s*=\s*(["'])http:\/\/www\.w3\.org\/2000\/svg\1/.test(root[0])) {
        return `elemento <svg> fora do namespace ${SVG_NS} (xmlns ausente ou outro)`;
    }
    return '';
}

// Texto com SVG -> documento SVG (image/svg+xml); '' se recusado (svgProblem).
// Como imagem, SVG que nao seja XML bem formado nao aparece.
function svgDocument(svg) {
    return svgProblem(svg) ? '' : svg.trim();
}

// SVG que o PROPRIO AoP grava (avatar do perfil): acrescenta o xmlns quando o
// formulario o manda sem ele. '' se nao houver elemento <svg>.
function withSvgNamespace(svg) {
    if (typeof svg !== 'string') return '';
    let doc = svg.trim();
    const root = /<svg(?=[\s/>])[^>]*>/.exec(doc);
    if (!root) return '';
    if (!/\sxmlns\s*=/.test(root[0])) {
        doc = `${doc.slice(0, root.index)}<svg xmlns="${SVG_NS}"${doc.slice(root.index + 4)}`;
    }
    return svgDocument(doc);
}

// Texto com SVG -> URL data: de imagem; '' se nao houver elemento <svg>
function svgDataUri(svg) {
    const doc = svgDocument(svg);
    return doc ? `data:image/svg+xml;base64,${Buffer.from(doc, 'utf8').toString('base64')}` : '';
}

// <img> com a URL dada, com atributos extras escapados; '' sem URL
function imageHtml(src, attrs = {}) {
    if (!src) return '';
    const extra = Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
    return `<img src="${escapeHtml(src)}"${extra}>`;
}

// <img> do SVG, com atributos extras escapados; '' sem SVG. Com label, o SVG
// recusado sai no log com o motivo, uma vez por label e motivo (as telas sao
// montadas de novo a cada visita).
const refusalsLogged = new Set();
function svgImageHtml(svg, attrs = {}, label = '') {
    const problem = svgProblem(svg);
    if (problem && problem !== 'ausente' && label && !refusalsLogged.has(`${label}|${problem}`)) {
        refusalsLogged.add(`${label}|${problem}`);
        console.warn(`[aop] AVISO SVG recusado, nao exibido (${label}): ${problem}`);
    }
    return imageHtml(svgDataUri(svg), attrs);
}

// Cor que vai para dentro de <style>: o escape de HTML do <%= %> nao protege
// CSS ("red; } body { ... }" reescreveria a folha). So passa #RRGGBB, ou
// tambem #RRGGBBAA com alpha: true; o resto vira fallback.
function cssHexColor(value, fallback, { alpha = false } = {}) {
    const re = alpha ? /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/ : /^#[0-9A-Fa-f]{6}$/;
    return typeof value === 'string' && re.test(value) ? value : fallback;
}

module.exports = { escapeHtml, svgProblem, svgDocument, withSvgNamespace, svgDataUri, imageHtml, svgImageHtml, cssHexColor, SVG_NS };
