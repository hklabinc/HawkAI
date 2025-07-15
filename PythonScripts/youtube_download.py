#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import yt_dlp
import unicodedata
import re


def sanitize_filename(name: str) -> str:
    """영문, 숫자, 공백/밑줄/하이픈 외 특수문자 제거 및 정리"""
    name = unicodedata.normalize("NFC", name)
    # name = re.sub(r'[^a-zA-Z0-9 _-]', '', name)
    name = re.sub(r'[^가-힣a-zA-Z0-9 _-]', '', name)  # ✅ 한글 허용
    name = re.sub(r'\s+', '_', name)
    return re.sub(r'_+', '_', name).strip('_')


def download(url: str, output_dir: str, media_type: str):
    os.makedirs(output_dir, exist_ok=True)

    with yt_dlp.YoutubeDL({}) as ydl:
        info = ydl.extract_info(url, download=False)
        title = sanitize_filename(info.get("title", "downloaded"))

    # 확장자는 mp4만 직접 붙임. mp3는 postprocessor가 자동 부착
    base_filename = os.path.join(output_dir, title)
    output_template = base_filename if media_type == "mp3" else f"{base_filename}.mp4"

    ydl_opts = {
        'format': 'bestaudio/best' if media_type == "mp3" else 'best',
        'outtmpl': output_template,
        'noplaylist': True,
        'quiet': True,
    }

    if media_type == "mp3":
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    # mp3는 확장자 없이 저장되므로 여기서 .mp3 붙여서 출력
    final_filename = f"{title}.mp3" if media_type == "mp3" else f"{title}.mp4"
    print(final_filename)


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[3] not in ("mp3", "mp4"):
        print("Usage: youtube_download.py <url> <output_path> <mp3|mp4>")
        sys.exit(1)

    download(sys.argv[1], sys.argv[2], sys.argv[3])
