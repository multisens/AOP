// Montagem de HTML no servidor com dado que vem de fora da plataforma
// (correcao de 12/10, spec-1210-seguranca2, item 2). Antes, o catalogo de
// aplicacoes, a aplicacao de abertura e a escolha de perfil juntavam ao HTML,
// sem escape, o appName, o appIcon e o globalServiceId do BAM (vindos da
// emissora pelo MQTT, tlm/lls/.../bamt) e o nickname e o avatar do perfil
// (gravados pelo POST /profile/create, que qualquer um na rede alcanca), e as
// views os exibiam com <%- %>: script no nome, no icone ou no avatar rodava na
// tela da TV (medido no Chrome 154: scratchpad/seguranca2-1210/chrome-views.js).
//
// - texto e valor de atributo (entre aspas duplas): escapeHtml;
// - imagem SVG (appIcon e bannerIcon do BAM, Tabela 6, p. 54; p. 72 do PDF:
//   "Secure static mode SVG image, as defined in W3C Candidate Recommendation
//   SVG 2"; e o avatar, desde a decisao do Luis em 12/10 (G8) lido do arquivo
//   que o campo avatar nomeia, profile-manager/avatar.js): vai como
//   <img src="data:image/svg+xml;base64,...">. Num <img> o navegador nao roda
//   script do SVG nem carrega recurso externo (modo seguro do SVG 2); o SVG
//   em linha no HTML rodava os dois.
const SVG_NS = 'http://www.w3.org/2000/svg';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Texto com SVG -> documento SVG (image/svg+xml); '' se nao houver elemento
// <svg>. Como documento image/svg+xml, o elemento raiz precisa do namespace do
// SVG, que o SVG em linha no HTML dispensa; tres das quatro amostras do bcast
// (uff, webmedia, eduplay) vem sem ele. Sem xmlns no <svg>, ele e acrescentado
// para que esses icones continuem aparecendo. O resto do texto nao muda (SVG
// que nao seja XML bem formado deixa de aparecer: no HTML o analisador
// tolerava). Desde a decisao do Luis em 12/10 (G8), e tambem o conteudo do
// arquivo do avatar que o gestor de perfis grava (profile-manager/avatar.js).
// PENDENTE (Joel): acrescentar o xmlns e tolerancia com SVG fora de
// image/svg+xml (as amostras do bcast); corrigir as amostras no bcast
// dispensaria.
function svgDocument(svg) {
    if (typeof svg !== 'string') return '';
    let doc = svg.trim();
    const root = /<svg(?=[\s/>])[^>]*>/.exec(doc);
    if (!root) return '';
    if (!/\sxmlns\s*=/.test(root[0])) {
        doc = `${doc.slice(0, root.index)}<svg xmlns="${SVG_NS}"${doc.slice(root.index + 4)}`;
    }
    return doc;
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

// <img> do SVG, com atributos extras escapados; '' sem SVG
function svgImageHtml(svg, attrs = {}) {
    return imageHtml(svgDataUri(svg), attrs);
}

// Cor que vai para dentro de <style> (correcao de 12/10, spec-1210-defeitos3,
// item 4). O escape de HTML do <%= %> nao protege CSS: "red; } body { ... }"
// passava inteiro e reescrevia a folha de estilo da tela (url() externo,
// conteudo por cima da tela). So passa "#" seguido de 6 digitos hexadecimais
// (RRGGBB), ou de 6 ou 8 (RRGGBBAA) com alpha: true; o resto vira fallback.
function cssHexColor(value, fallback, { alpha = false } = {}) {
    const re = alpha ? /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/ : /^#[0-9A-Fa-f]{6}$/;
    return typeof value === 'string' && re.test(value) ? value : fallback;
}

module.exports = { escapeHtml, svgDocument, svgDataUri, imageHtml, svgImageHtml, cssHexColor, SVG_NS };
