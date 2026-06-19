#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

# Download and install ffmpeg static build for Render
if [ ! -f "ffmpeg" ]; then
    wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
    tar -xf ffmpeg-release-amd64-static.tar.xz
    mv ffmpeg-*-amd64-static/ffmpeg .
    mv ffmpeg-*-amd64-static/ffprobe .
    rm -rf ffmpeg-*-amd64-static
    rm ffmpeg-release-amd64-static.tar.xz
fi

chmod +x ffmpeg ffprobe
