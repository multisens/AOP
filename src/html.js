// Server HTML with data from outside the platform (BAM of the broadcaster,
// profile of POST /profile/create), which the views show with <%- %>: text
// and attributes are escaped; SVG goes in
// <img src="data:image/svg+xml;base64,...">, where the browser runs no
// script and loads no external resource (Table 6: "Secure static mode SVG
// image").
const SVG_NS = 'http://www.w3.org/2000/svg';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Table 6: appIcon and bannerIcon are xs:any
// namespace="http://www.w3.org/2000/svg". An SVG without this xmlns is
// refused, not fixed. Returns the reason of the refusal ('' = accepted).
function svgProblem(svg) {
    if (typeof svg !== 'string' || svg.trim() === '') return 'ausente';
    const root = /<svg(?=[\s/>])[^>]*>/.exec(svg);
    if (!root) return 'sem elemento <svg>';
    if (!/\sxmlns\s*=\s*(["'])http:\/\/www\.w3\.org\/2000\/svg\1/.test(root[0])) {
        return `elemento <svg> fora do namespace ${SVG_NS} (xmlns ausente ou outro)`;
    }
    return '';
}

// Text with SVG to an SVG document (image/svg+xml); '' if refused
// (svgProblem). As an image, an SVG that is not well-formed XML does not
// show.
function svgDocument(svg) {
    return svgProblem(svg) ? '' : svg.trim();
}

// SVG the AoP itself writes (profile avatar): adds the xmlns when the form
// sends it without one. '' if there is no <svg> element.
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

// Text with SVG to an image data: URL; '' if there is no <svg> element.
function svgDataUri(svg) {
    const doc = svgDocument(svg);
    return doc ? `data:image/svg+xml;base64,${Buffer.from(doc, 'utf8').toString('base64')}` : '';
}

// <img> with the given URL, with extra attributes escaped; '' without URL.
function imageHtml(src, attrs = {}) {
    if (!src) return '';
    const extra = Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
    return `<img src="${escapeHtml(src)}"${extra}>`;
}

// <img> of the SVG, with extra attributes escaped; '' without SVG. With
// label, a refused SVG is logged with the reason, once per label and reason.
const refusalsLogged = new Set();
function svgImageHtml(svg, attrs = {}, label = '') {
    const problem = svgProblem(svg);
    if (problem && problem !== 'ausente' && label && !refusalsLogged.has(`${label}|${problem}`)) {
        refusalsLogged.add(`${label}|${problem}`);
        console.warn(`[aop] AVISO SVG recusado, nao exibido (${label}): ${problem}`);
    }
    return imageHtml(svgDataUri(svg), attrs);
}

// Color that goes inside <style>: the HTML escaping of <%= %> does not
// protect CSS ("red; } body { ... }" would rewrite the sheet). Only #RRGGBB
// passes, or also #RRGGBBAA with alpha: true; anything else becomes the
// fallback.
function cssHexColor(value, fallback, { alpha = false } = {}) {
    const re = alpha ? /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/ : /^#[0-9A-Fa-f]{6}$/;
    return typeof value === 'string' && re.test(value) ? value : fallback;
}

module.exports = { escapeHtml, svgProblem, svgDocument, withSvgNamespace, svgDataUri, imageHtml, svgImageHtml, cssHexColor, SVG_NS };
