#!/bin/bash

videos=(
    "public/media/carnaval/beijaflorCompleto.mp4"
    "public/media/carnaval/granderioCompleto.mp4"
)

for video in "${videos[@]}"; do
    ./stream.sh $video "carnaval"
done