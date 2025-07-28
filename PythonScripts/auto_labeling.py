#!/usr/bin/env python
import cv2
import numpy as np
import json
import sys
from pathlib import Path

# Constants
THRESH_BINARY_VALUE = 200
MIN_CONTOUR_AREA = 500
MAX_CONTOUR_AREA = 30000
MIN_BOX_WIDTH = 10
MIN_BOX_HEIGHT = 10
MAX_BOX_AREA = 30000
MIN_ASPECT_RATIO = 0.25
MAX_ASPECT_RATIO = 4.0

def detect_contours(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, THRESH_BINARY_VALUE, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return [
        cnt for cnt in contours
        if MIN_CONTOUR_AREA <= cv2.contourArea(cnt) <= MAX_CONTOUR_AREA
    ]

def extract_box_info(img_path, label):
    img = cv2.imread(str(img_path))
    if img is None:
        return []

    contours = detect_contours(img)
    box_info_list = []

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        aspect_ratio = w / h if h != 0 else 0
        box_area = w * h

        if w < MIN_BOX_WIDTH or h < MIN_BOX_HEIGHT:
            continue
        if box_area > MAX_BOX_AREA or not (MIN_ASPECT_RATIO < aspect_ratio < MAX_ASPECT_RATIO):
            continue

        box_info_list.append({
            "x": round(float(x), 2),
            "y": round(float(y), 2),
            "w": round(float(w), 2),
            "h": round(float(h), 2),
            "label": label  # ✅ 프로젝트 이름 사용
        })

    return box_info_list

def main():
    if len(sys.argv) != 3:
        print("Usage: auto_labeling.py <image_folder> <label_name>", file=sys.stderr)
        sys.exit(1)

    image_folder = Path(sys.argv[1])
    label_name = sys.argv[2]

    if not image_folder.exists() or not image_folder.is_dir():
        print("Invalid folder path.", file=sys.stderr)
        sys.exit(1)

    result = {}
    for img_path in sorted(image_folder.glob("*")):
        if img_path.suffix.lower() not in [".jpg", ".jpeg", ".png", ".bmp"]:
            continue
        boxes = extract_box_info(img_path, label_name)
        if boxes:
            result[img_path.name] = boxes

    print(json.dumps(result))  # ✅ stdout 출력

if __name__ == "__main__":
    main()
