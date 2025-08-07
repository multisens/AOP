#!/bin/bash
path=$(dirname $1)
file=$(basename $1)
stream_out="${path}/stream/${file%.*}.m3u8"

mkdir -p "${path}/stream"
echo "Streaming video ${file} into stream ${stream_out}"

# FFmpeg options:
# -re                           : reads the video file in real time
# -stream_loop -1               : repeats the video in loop
# -i $1                         : input video file
# -c:v libx264                  : output video format h.264
# -c:a aac                      : output audio format aac
# -f hls                        : output stream in HLS format
# -hls_time 2                   : HLS file segment with 2 seconds
# -hls_list_size 5              : Keep 5 segments in the playlist
# -hls_flags delete_segments    : Remove old segments
# -hls_flags append_list        : Live list update
# -hls_flags omit_endlist       : Never end the stream
ffmpeg  -re \
        -stream_loop -1 \
        -i $1 \
        -c:v libx264 \
        -c:a aac \
        -f hls \
        -hls_time 2 \
        -hls_list_size 5 \
        -hls_flags delete_segments+append_list+omit_endlist \
        $stream_out

# echo "Streaming ended, cleaning output files"
# rm "${path}/stream/*"