#!/bin/bash

VIDEO="public/media/carnaval/beijaflor.mp4"
PLAYLIST_NAME="carnaval"


path=$(dirname $VIDEO)
file=$(basename $VIDEO)
segname=${file%.*}
num_seg=$(find "$path/stream" -type f -name "*.ts" | wc -l)

# ./stream.sh $VIDEO $PLAYLIST_NAME

echo -e "\n\n-------------------------------------------------------------------"
echo "Streaming video ${file} into stream $path/$PLAYLIST_NAME.m3u8"
echo -e "-------------------------------------------------------------------\n\n"
./tx_segments.sh "$path/stream/$PLAYLIST_NAME" $segname $num_seg