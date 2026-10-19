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

// G7 (Joel, 15/10): o SVG que vem de fora da plataforma (appIcon e
// bannerIcon do BAM) precisa estar no namespace do SVG. A Tabela 6 da a esses
// campos o tipo xs:any namespace="http://www.w3.org/2000/svg": icone sem o
// xmlns tira o BAM da norma, e o AoP nao o corrige mais. Corrigir em silencio
// faria a emissora que experimenta contra o testbed validar um BAM que um
// receptor que confira o tipo recusaria. Ate 15/10 o AoP acrescentava o xmlns
// que faltava (tres das quatro amostras do bcast vinham sem ele; corrigidas
// em 15/10). svgProblem diz o motivo da recusa ('' = aceito).
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
// O resto do texto nao muda (SVG que nao seja XML bem formado deixa de
// aparecer: no HTML o analisador tolerava).
function svgDocument(svg) {
    return svgProblem(svg) ? '' : svg.trim();
}

// O SVG que o PROPRIO AoP grava (o avatar do perfil, G8): o documento gravado
// leva o xmlns (G7), acrescentado aqui quando o formulario o manda sem ele.
// '' se nao houver elemento <svg>. So o gestor de perfis usa.
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
// presente mas recusado sai no log com o motivo (G7), uma vez por label e
// motivo (as telas sao montadas de novo a cada visita).
const refusalsLogged = new Set();
function svgImageHtml(svg, attrs = {}, label = '') {
    const problem = svgProblem(svg);
    if (problem && problem !== 'ausente' && label && !refusalsLogged.has(`${label}|${problem}`)) {
        refusalsLogged.add(`${label}|${problem}`);
        console.warn(`[aop] AVISO SVG recusado, nao exibido (${label}): ${problem}`);
    }
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

module.exports = { escapeHtml, svgProblem, svgDocument, withSvgNamespace, svgDataUri, imageHtml, svgImageHtml, cssHexColor, SVG_NS };
