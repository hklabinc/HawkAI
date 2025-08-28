# PythonScripts/augment_yolo.py
import os
import sys
import argparse
import platform
import shutil
import uuid
import cv2
import numpy as np
import random
import math
import albumentations as A

# --- 콘솔 인코딩(Windows cp949 등) 이슈 방지 ---
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')


# =========================
# 유틸
# =========================
def safe_path(path: str) -> str:
    return os.path.normpath(path).replace("\\", "/") if platform.system() == "Windows" else os.path.normpath(path)

def set_seed(seed: int = 7):
    np.random.seed(seed)
    random.seed(seed)

def print_status(msg: str):
    """Blazor가 읽는 상태라인"""
    print(f"STATUS: {msg}", flush=True)

def list_jpg(dir_path: str):
    return [f for f in os.listdir(dir_path) if f.lower().endswith(".jpg")]

def ensure_dirs(*paths):
    for p in paths:
        os.makedirs(p, exist_ok=True)

def count_images(folder: str) -> int:
    return len([f for f in os.listdir(folder) if f.lower().endswith(".jpg")])

def log_counts(base_dir: str, stage: str):
    t_img = os.path.join(base_dir, "train", "images")
    v_img = os.path.join(base_dir, "valid", "images")
    t = count_images(t_img) if os.path.exists(t_img) else 0
    v = count_images(v_img) if os.path.exists(v_img) else 0
    print(f"[PY] {stage} → train: {t} images, valid: {v} images", flush=True)

# --- YOLO 라벨 입출력 ---
def read_yolo_label(txt_path: str):
    boxes, class_labels = [], []
    with open(txt_path, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) != 5:
                continue
            cls, x, y, w, h = parts
            boxes.append([float(x), float(y), float(w), float(h)])
            class_labels.append(int(float(cls)))
    return boxes, class_labels

def save_yolo_label(txt_path: str, boxes, class_labels):
    with open(txt_path, 'w') as f:
        for cls, box in zip(class_labels, boxes):
            f.write(f"{cls} {' '.join([f'{coord:.6f}' for coord in box])}\n")


# =========================
# 증강 파이프라인(공통/헬퍼)
# =========================
def build_fixed_transforms():
    """고정 증강 세트 (확률 1.0)"""
    return [
        ("original", None),
        ("rotate90", A.Compose([A.Rotate(limit=(90, 90), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("rotate180", A.Compose([A.Rotate(limit=(180, 180), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("rotate270", A.Compose([A.Rotate(limit=(270, 270), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("hflip", A.Compose([A.HorizontalFlip(p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("hflip_rotate90", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(90, 90), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("hflip_rotate180", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(180, 180), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("hflip_rotate270", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(270, 270), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
    ]

def build_random_transform():
    """랜덤 증강(훈련/검증 공용)"""
    return A.Compose([
        A.Rotate(limit=15, p=0.3),
        A.Affine(shear={"x": (-1, 1), "y": (-1, 1)}, p=0.3),
        A.RandomBrightnessContrast(brightness_limit=(0, 0.1), contrast_limit=(0, 0.1), p=0.3),
        A.RandomGamma(gamma_limit=(70, 130), p=0.3),
    ], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))

def apply_and_save(image, boxes, class_labels, transform, save_img_path: str, save_lbl_path: str):
    """단일 변환 적용 후 이미지/라벨 저장 (transform=None이면 그대로 저장)"""
    if transform is None:
        aug_img = image.copy()
        aug_boxes = boxes
        aug_classes = class_labels
    else:
        applied = transform(image=image, bboxes=boxes, class_labels=class_labels)
        aug_img = applied['image']
        aug_boxes = applied['bboxes']
        aug_classes = applied['class_labels']

    if len(aug_boxes) == 0:
        return False

    cv2.imwrite(save_img_path, aug_img)
    save_yolo_label(save_lbl_path, aug_boxes, aug_classes)
    return True


# =========================
# 1) 고정 증강(한 세트 × n1) + 원본 삭제
# =========================
def fixed_augmentations(images_dir: str, labels_dir: str, n1: int):
    """각 이미지에 대해 '고정 변환 세트'를 n1회 반복 적용. 완료 후 원본 삭제."""
    transforms = build_fixed_transforms()
    image_files = list_jpg(images_dir)

    # 증강 생성
    for it in range(max(0, n1)):  # n1=0이면 스킵
        for filename in image_files:
            name = os.path.splitext(filename)[0]
            image_path = safe_path(os.path.join(images_dir, filename))
            label_path = safe_path(os.path.join(labels_dir, f"{name}.txt"))
            if not (os.path.exists(image_path) and os.path.exists(label_path)):
                continue

            image = cv2.imread(image_path)
            if image is None:
                continue

            try:
                boxes, class_labels = read_yolo_label(label_path)
            except Exception as e:
                print(f"Label read error: {label_path} ({e})", flush=True)
                continue

            for t_idx, (_suffix, transform) in enumerate(transforms):
                # name_it_tidx.jpg/.txt 로 저장 (덮어쓰기 방지)
                save_stem = f"{name}_{it}_{t_idx}"
                save_img = os.path.join(images_dir, f"{save_stem}.jpg")
                save_lbl = os.path.join(labels_dir, f"{save_stem}.txt")
                try:
                    apply_and_save(image, boxes, class_labels, transform, save_img, save_lbl)
                except Exception as e:
                    print(f"Fixed augmentation error ({filename}): {e}", flush=True)

    # 원본 제거
    for filename in image_files:
        name = os.path.splitext(filename)[0]
        img_p = safe_path(os.path.join(images_dir, filename))
        lbl_p = safe_path(os.path.join(labels_dir, f"{name}.txt"))
        try:
            if os.path.exists(img_p): os.remove(img_p)
            if os.path.exists(lbl_p): os.remove(lbl_p)
        except Exception as e:
            print(f"Failed to delete original {filename}: {e}", flush=True)


# =========================
# 2) train → valid 무작위 분할
# =========================
def split_train_valid(base_dir: str, valid_ratio: float):
    train_img_dir = safe_path(os.path.join(base_dir, "train", "images"))
    train_lbl_dir = safe_path(os.path.join(base_dir, "train", "labels"))
    valid_img_dir = safe_path(os.path.join(base_dir, "valid", "images"))
    valid_lbl_dir = safe_path(os.path.join(base_dir, "valid", "labels"))
    ensure_dirs(valid_img_dir, valid_lbl_dir)

    all_images = list_jpg(train_img_dir)
    random.shuffle(all_images)
    split_count = math.ceil(len(all_images) * valid_ratio)   # 올림
    selected = all_images[:split_count]

    moved = 0
    for filename in selected:
        name = os.path.splitext(filename)[0]
        src_img = os.path.join(train_img_dir, filename)
        src_lbl = os.path.join(train_lbl_dir, f"{name}.txt")
        dst_img = os.path.join(valid_img_dir, filename)
        dst_lbl = os.path.join(valid_lbl_dir, f"{name}.txt")
        try:
            if os.path.exists(src_img):
                shutil.move(src_img, dst_img)
            if os.path.exists(src_lbl):
                shutil.move(src_lbl, dst_lbl)
            moved += 1
        except Exception as e:
            print(f"Failed to move {filename}: {e}", flush=True)

    print(f"[PY] Split → moved {moved} to valid (ratio={valid_ratio:.2f})", flush=True)


# =========================
# 3) 랜덤 증강 (train/valid 공용)
# =========================
def random_augment_per_image(images_dir: str, labels_dir: str, per_image_times: int, transform=None, tag="train"):
    """각 이미지마다 per_image_times 번 랜덤 증강 생성"""
    if per_image_times <= 0:
        return
    if transform is None:
        transform = build_random_transform()

    image_files = list_jpg(images_dir)
    total_src = len(image_files)
    made = 0

    for filename in image_files:
        name = os.path.splitext(filename)[0]
        image_path = os.path.join(images_dir, filename)
        label_path = os.path.join(labels_dir, f"{name}.txt")
        if not (os.path.exists(image_path) and os.path.exists(label_path)):
            continue

        image = cv2.imread(image_path)
        if image is None:
            continue

        try:
            boxes, class_labels = read_yolo_label(label_path)
        except Exception as e:
            print(f"Label read error for {label_path}: {e}", flush=True)
            continue

        for idx in range(per_image_times):
            try:
                save_img = os.path.join(images_dir, f"{name}_rnd_{idx}.jpg")
                save_lbl = os.path.join(labels_dir, f"{name}_rnd_{idx}.txt")
                if apply_and_save(image, boxes, class_labels, transform, save_img, save_lbl):
                    made += 1
            except Exception as e:
                print(f"Random augmentation error for {filename}: {e}", flush=True)

    print(f"[PY] Random augment ({tag}) → source:{total_src}, created:{made}", flush=True)


# =========================
# 메인 파이프라인
# =========================
def perform_augmentation(base_dir: str, valid_ratio: float, n1: int, n2: int, seed: int):
    set_seed(seed)

    train_dir = safe_path(os.path.join(base_dir, "train"))
    images_dir = safe_path(os.path.join(train_dir, "images"))
    labels_dir = safe_path(os.path.join(train_dir, "labels"))
    ensure_dirs(images_dir, labels_dir)

    total = len(list_jpg(images_dir))
    print_status("Fixed augmentations started")
    print("Starting data augmentation process", flush=True)
    print(f"Base directory   : {base_dir}", flush=True)
    print(f"Original images  : {total}", flush=True)
    print(f"Valid split      : {valid_ratio:.2f}", flush=True)
    print(f"Fixed aug repeat : n1={n1}", flush=True)
    print(f"Random aug times : n2={n2} per image (train & valid)", flush=True)
    print(f"Seed             : {seed}", flush=True)
    log_counts(base_dir, "Init")

    # 1) 고정 증강 + 원본 삭제 (n1회)
    if total > 0 and n1 > 0:
        fixed_augmentations(images_dir, labels_dir, n1)
        log_counts(base_dir, "After fixed aug")
    elif total == 0:
        print("No images found in train/images.", flush=True)

    # 2) train → valid 분할
    print_status("Splitting train/valid sets")
    split_train_valid(base_dir, valid_ratio)
    log_counts(base_dir, "After split")

    # 3) train 랜덤 증강 (n2회)
    if n2 > 0:
        print_status("Random augmentations for training set")
        random_augment_per_image(
            images_dir=os.path.join(base_dir, "train", "images"),
            labels_dir=os.path.join(base_dir, "train", "labels"),
            per_image_times=n2,
            transform=build_random_transform(),
            tag="train"
        )
        log_counts(base_dir, "After train random aug")

        # 4) valid 랜덤 증강 (n2회) — target_total 방식 제거
        print_status("Random augmentations for valid set")
        random_augment_per_image(
            images_dir=os.path.join(base_dir, "valid", "images"),
            labels_dir=os.path.join(base_dir, "valid", "labels"),
            per_image_times=n2,
            transform=build_random_transform(),
            tag="valid"
        )
        log_counts(base_dir, "After valid random aug")

    # 완료 메시지
    t = count_images(os.path.join(base_dir, "train", "images"))
    v = count_images(os.path.join(base_dir, "valid", "images"))
    model_name = os.path.basename(base_dir)
    print_status(f"Augmentation Completed for {model_name} (train: {t}, valid: {v})")
    print(f"Augmentation Completed for {model_name} (train: {t}, valid: {v})", flush=True)


# =========================
# 엔트리 포인트
# =========================
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_dir", required=True, help="Export base directory (contains train/ and valid/)")
    parser.add_argument("--valid_ratio", type=float, default=0.2)  # 기본 0.2
    parser.add_argument("--n1", type=int, default=1, help="Fixed augment repeat count")
    parser.add_argument("--n2", type=int, default=3, help="Random augment per-image count for train & valid")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    perform_augmentation(args.base_dir, args.valid_ratio, args.n1, args.n2, args.seed)
