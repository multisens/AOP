#!/bin/bash

CONTROL_FILE="./control.txt"
# videos=(
#     "public/media/carnaval/beijaflorCompleto.mp4"
#     "public/media/carnaval/granderioCompleto.mp4"
# )

touch "$CONTROL_FILE"
echo "Monitorando $CONTROL_FILE - Escreva 'STOP' para parar o script"

# for video in "${videos[@]}"; do
while true; do
    # Lê o conteúdo do arquivo (removendo espaços em branco e convertendo para maiúsculas)
    CONTENT=$(tr -d '[:space:]' < "$CONTROL_FILE" | tr '[:lower:]' '[:upper:]')
    
    # Verifica se o arquivo contém "STOP"
    if [[ "$CONTENT" == "STOP" ]]; then
        echo "STOP detectado no arquivo. Encerrando..."
        break
    fi
    
    # ./stream.sh $video "carnaval"
    ./stream.sh "public/media/carnaval/beijaflor.mp4" "carnaval"
done

rm "$CONTROL_FILE"