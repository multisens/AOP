function createHLSPlayer(url, elm) {
    if (Hls.isSupported()) {
        const hls = new Hls({
            autoStartLoad: true,
            startLevel: -1
        });

        hls.loadSource(url);
        hls.attachMedia(elm);

        hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
            if (typeof handleFragChange === 'function') {
                let segname = data.frag.url.split("/").pop();
                segname = segname.split("_")[0];

                handleFragChange(data.frag.sn, segname);
            }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            elm.play().catch(e => console.error('Erro no autoplay:', e));
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            // console.error('Erro no HLS:', data);
            console.log('restart..');
            hls.detachMedia();
            hls.loadSource(url);
            hls.attachMedia(elm);
        });
    }
    else if (elm.canPlayType('application/vnd.apple.mpegurl')) {
        elm.src = url;
        elm.play().catch(e => console.error('Erro no autoplay nativo:', e));
    }
    else {
        alert('Seu navegador não suporta HLS.');
    }
}