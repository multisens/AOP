#!/bin/bash
PLAYLIST_FILE="$1.m3u8"
SEGMENT_NAME="$2"
NUM_SEGMENTS=$3

generate_hls_header() {
    echo "#EXTM3U"
    echo "#EXT-X-VERSION:3"
    echo "#EXT-X-TARGETDURATION:$1"
    echo "#EXT-X-MEDIA-SEQUENCE:$2"
}

generate_seg_data() {
    echo "#EXTINF:1.001000,"
    printf "$1_%03d.ts\n" "$2"
}


SEG_NUM=0
while true; do
    generate_hls_header 1 $((SEG_NUM % NUM_SEGMENTS)) > "$PLAYLIST_FILE"
    generate_seg_data $SEGMENT_NAME $((SEG_NUM % NUM_SEGMENTS)) >> "$PLAYLIST_FILE"
    generate_seg_data $SEGMENT_NAME $(((SEG_NUM+1) % NUM_SEGMENTS)) >> "$PLAYLIST_FILE"
    generate_seg_data $SEGMENT_NAME $(((SEG_NUM+2) % NUM_SEGMENTS)) >> "$PLAYLIST_FILE"
    ((SEG_NUM++))
    sleep 1
done