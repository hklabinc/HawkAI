#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import re
import yt_dlp
import unicodedata
import re

def sanitize_filename(name):
    # NFC 정규화 (한글 등 유니코드 정리)
    name = unicodedata.normalize("NFC", name)

    # 유니코드 기호/구분 문자 제거 (예: ⧸, ―, · 등)
    name = ''.join(c for c in name if unicodedata.category(c)[0] not in ['S', 'P'])

    # 공백은 밑줄로 변경
    name = name.replace(' ', '_')

    # 알파벳, 숫자, 한글, 밑줄만 허용 (나머지 제거)
    name = re.sub(r'[^\w가-힣_]', '', name)

    # 밑줄 여러 개 연속이면 하나로 줄임
    name = re.sub(r'__+', '_', name)

    # 앞뒤 밑줄 제거
    name = name.strip('_')

    return name

def download(url, output_path, media_type):
    if not os.path.exists(output_path):
        os.makedirs(output_path)

    extension = "mp3" if media_type == "mp3" else "mp4"

    # 파일명 템플릿 설정 (타이틀을 깨끗하게 출력할 수 있도록 강제 후처리할 예정)
    ydl_opts = {
        'format': 'bestaudio/best' if media_type == "mp3" else 'best',
        'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
        'noplaylist': True
    }

    if media_type == "mp3":
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title", "downloaded")
        sanitized_title = sanitize_filename(title)
        filename = f"{sanitized_title}.{extension}"

        # 실제 저장된 파일 이름 찾기
        # yt-dlp는 원본 제목 기준으로 저장하므로, 해당 파일을 찾아 rename 해줌
        downloaded_files = os.listdir(output_path)
        for f in downloaded_files:
            if f.endswith(f".{extension}") and title in f:
                original_path = os.path.join(output_path, f)
                new_path = os.path.join(output_path, filename)
                if original_path != new_path:
                    os.rename(original_path, new_path)
                break

        print(filename)  # 출력: Blazor 측에서 받을 최종 파일명

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: youtube_download.py <url> <output_path> <mp3|mp4>")
        sys.exit(1)

    download(sys.argv[1], sys.argv[2], sys.argv[3])
