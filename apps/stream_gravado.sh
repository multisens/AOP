#!/bin/bash

# Configurações rápidas
SEGMENT_DIR="public/media/carnaval/stream/"
PLAYLIST_FILE="public/media/carnaval/stream/carnaval.m3u8"
TOTAL_SEGMENTS=928
SEGMENT_NAME="beijaflor"

# Atualizar playlist
update_hls_playlist() {
    for (( i=0; i<TOTAL_SEGMENTS; i++ )); do
        echo "#EXTM3U" > "$PLAYLIST_FILE"
        echo "#EXT-X-VERSION:3" >> "$PLAYLIST_FILE"
        echo "#EXT-X-TARGETDURATION:1" >> "$PLAYLIST_FILE"
        echo "#EXT-X-MEDIA-SEQUENCE:${i}" >> "$PLAYLIST_FILE"

        echo "#EXTINF:1.001000," >> "$PLAYLIST_FILE"
        printf "${SEGMENT_NAME}_%03d.ts\n" "$i" >> "$PLAYLIST_FILE"
        echo "#EXTINF:1.001000," >> "$PLAYLIST_FILE"
        printf "${SEGMENT_NAME}_%03d.ts\n" "$((i+1))" >> "$PLAYLIST_FILE"

        sleep 1
    done
}

# Uso
CONTROL_FILE="./control.txt"

touch "$CONTROL_FILE"
echo "Monitorando $CONTROL_FILE - Escreva 'STOP' para parar o script"

while true; do
    # Lê o conteúdo do arquivo (removendo espaços em branco e convertendo para maiúsculas)
    CONTENT=$(tr -d '[:space:]' < "$CONTROL_FILE" | tr '[:lower:]' '[:upper:]')
    
    # Verifica se o arquivo contém "STOP"
    if [[ "$CONTENT" == "STOP" ]]; then
        echo "STOP detectado no arquivo. Encerrando..."
        break
    fi
    
    # Escreve a playlist
    update_hls_playlist
done