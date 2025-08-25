#!/bin/bash
path=$(dirname $1)
file=$(basename $1)
if [ -n "$2" ]; then
    stream_name=${2%.*}
else
    stream_name=${file%.*}
fi
stream_out="${path}/stream/${stream_name}.m3u8"
segment_out="${path}/stream/${file%.*}_%03d.ts"

mkdir -p "${path}/stream"
echo -e "\n\n-------------------------------------------------------------------"
echo "Streaming video ${file} into stream ${stream_out}"
echo -e "-------------------------------------------------------------------\n\n"

# FFmpeg options:
# -re                           : reads the video file in real time
# -i $1                         : input video file
# -c:v libx264 -g ...           : output video format h.264, other flags force keyframes to respect the segment size
# -c:a aac                      : output audio format aac
# -f hls                        : output stream in HLS format
# -hls_time 1                   : HLS file segment with 1 seconds
# -hls_list_size 2              : Keep 2 segments in the playlist
# -hls_flags append_list        : Live list update
# -hls_flags omit_endlist       : Never end the stream
# -fflags +nobuffer             : deactivate the in/out buffer for faster stream
ffmpeg  -re \
        -i $1 \
        -c:v libx264 -g 30 -keyint_min 30 -force_key_frames "expr:gte(n, n_forced * 30)" \
        -c:a aac \
        -f hls \
        -hls_segment_filename $segment_out \
        -hls_time 1 \
        -hls_list_size 2 \
        -hls_flags append_list+omit_endlist \
        -fflags +nobuffer \
        $stream_out

echo -e "\n\n-------------------------------------------------------------------"
echo "Streaming ended"
echo -e "-------------------------------------------------------------------\n\n"