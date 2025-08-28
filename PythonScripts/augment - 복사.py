# PythonScripts/augment_yolo.py
import os, sys, argparse, platform, shutil, uuid, cv2, numpy as np, random
import albumentations as A

# 표준 출력/에러를 UTF-8로 재설정 (에러는 대체 문자로)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ---------- 공용 유틸 ----------
def safe_path(path):
    return os.path.normpath(path).replace("\\", "/") if platform.system() == "Windows" else os.path.normpath(path)

def set_seed(seed=42):
    np.random.seed(seed)
    random.seed(seed)

def read_yolo_label(txt_path):
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

def save_yolo_label(txt_path, boxes, class_labels):
    with open(txt_path, 'w') as f:
        for cls, box in zip(class_labels, boxes):
            f.write(f"{cls} {' '.join([f'{coord:.6f}' for coord in box])}\n")

def count_images_in_folder(folder):
    return len([f for f in os.listdir(folder) if f.lower().endswith(".jpg")])

def print_status(msg):
    # Blazor가 읽기 쉬운 형태로 표준출력에 상태 라인 배출
    print(f"STATUS: {msg}", flush=True)

# ---------- 1단계: train→valid 분할 ----------
def split_train_valid(base_dir, valid_ratio=0.3):
    train_img_dir = safe_path(os.path.join(base_dir, "train", "images"))
    train_lbl_dir = safe_path(os.path.join(base_dir, "train", "labels"))
    valid_img_dir = safe_path(os.path.join(base_dir, "valid", "images"))
    valid_lbl_dir = safe_path(os.path.join(base_dir, "valid", "labels"))
    os.makedirs(valid_img_dir, exist_ok=True)
    os.makedirs(valid_lbl_dir, exist_ok=True)

    all_images = [f for f in os.listdir(train_img_dir) if f.lower().endswith(".jpg")]
    random.shuffle(all_images)
    split_count = int(len(all_images) * valid_ratio)
    selected_for_valid = all_images[:split_count]

    for filename in selected_for_valid:
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
        except Exception as e:
            print(f"Failed to move {filename}: {e}", flush=True)
    print(f"   Validation set created with {split_count} samples.", flush=True)

# ---------- 2단계: 랜덤 증강 ----------
def perform_random_augmentation_for_train(train_dir, augment_per_image):
    images_dir = os.path.join(train_dir, "images")
    labels_dir = os.path.join(train_dir, "labels")
    transform = A.Compose([
        A.Rotate(limit=15, p=0.3),
        A.Affine(shear={"x": (-1, 1), "y": (-1, 1)}, p=0.3),
        A.RandomBrightnessContrast(brightness_limit=(0, 0.1), contrast_limit=(0, 0.1), p=0.3),
        A.RandomGamma(gamma_limit=(70, 130), p=0.3),
    ], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))

    image_files = [f for f in os.listdir(images_dir) if f.lower().endswith(".jpg")]
    for filename in image_files:
        name = os.path.splitext(filename)[0]
        image_path = os.path.join(images_dir, filename)
        label_path = os.path.join(labels_dir, f"{name}.txt")
        if not os.path.exists(image_path) or not os.path.exists(label_path):
            continue
        image = cv2.imread(image_path)
        if image is None:
            continue

        try:
            boxes, class_labels = read_yolo_label(label_path)
        except Exception as e:
            print(f"Label read error for {label_path}: {e}", flush=True)
            continue

        for _ in range(augment_per_image):
            try:
                applied = transform(image=image, bboxes=boxes, class_labels=class_labels)
                aug_img = applied['image']
                aug_boxes = applied['bboxes']
                aug_classes = applied['class_labels']
                if len(aug_boxes) == 0:
                    continue
                uid = uuid.uuid4().hex[:8]
                cv2.imwrite(os.path.join(images_dir, f"{name}_rnd_{uid}.jpg"), aug_img)
                save_yolo_label(os.path.join(labels_dir, f"{name}_rnd_{uid}.txt"), aug_boxes, aug_classes)
            except Exception as e:
                print(f"Augmentation error for {filename}: {e}", flush=True)
                continue

def perform_random_augmentation_for_valid(base_dir, target_ratio=0.2):
    train_img_dir = os.path.join(base_dir, "train", "images")
    valid_img_dir = os.path.join(base_dir, "valid", "images")
    valid_lbl_dir = os.path.join(base_dir, "valid", "labels")
    train_count = len([f for f in os.listdir(train_img_dir) if f.lower().endswith(".jpg")])
    valid_count = len([f for f in os.listdir(valid_img_dir) if f.lower().endswith(".jpg")])

    desired_valid_count = int(train_count * target_ratio)
    augment_needed = desired_valid_count - valid_count
    if augment_needed <= 0:
        print(f"   Valid set already has {valid_count} images (≥ 20%).", flush=True)
        return

    print(f"   Need to generate {augment_needed} more valid images...", flush=True)
    valid_image_files = [f for f in os.listdir(valid_img_dir) if f.lower().endswith(".jpg")]
    if not valid_image_files:
        print("No valid images found to augment.", flush=True)
        return

    valid_transform = A.Compose([
        A.Rotate(limit=15, p=0.3),
        A.Affine(shear={"x": (-1, 1), "y": (-1, 1)}, p=0.3),
        A.RandomBrightnessContrast(brightness_limit=(0, 0.1), contrast_limit=(0, 0.1), p=0.3),
        A.RandomGamma(gamma_limit=(70, 130), p=0.3),
    ], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))

    for _ in range(augment_needed):
        base_file = random.choice(valid_image_files)
        name = os.path.splitext(base_file)[0]
        image_path = os.path.join(valid_img_dir, base_file)
        label_path = os.path.join(valid_lbl_dir, f"{name}.txt")
        if not os.path.exists(image_path) or not os.path.exists(label_path):
            continue
        image = cv2.imread(image_path)
        if image is None:
            continue

        try:
            boxes, class_labels = read_yolo_label(label_path)
        except Exception as e:
            print(f"Label read error: {label_path} - {e}", flush=True)
            continue

        try:
            applied = valid_transform(image=image, bboxes=boxes, class_labels=class_labels)
            aug_img = applied['image']
            aug_boxes = applied['bboxes']
            aug_classes = applied['class_labels']
            if len(aug_boxes) == 0:
                continue
            uid = uuid.uuid4().hex[:8]
            cv2.imwrite(os.path.join(valid_img_dir, f"{name}_rnd_{uid}.jpg"), aug_img)
            save_yolo_label(os.path.join(valid_lbl_dir, f"{name}_rnd_{uid}.txt"), aug_boxes, aug_classes)
        except Exception as e:
            print(f"Augmentation error: {e}", flush=True)
            continue

    final_valid_count = len([f for f in os.listdir(valid_img_dir) if f.lower().endswith(".jpg")])
    print(f"   Valid set now contains {final_valid_count} images.", flush=True)

# ---------- 메인 파이프라인 ----------
def perform_augmentation(base_dir, valid_ratio, n, seed):
    set_seed(seed)
    train_dir = safe_path(os.path.join(base_dir, "train"))
    images_dir = safe_path(os.path.join(train_dir, "images"))
    labels_dir = safe_path(os.path.join(train_dir, "labels"))
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(labels_dir, exist_ok=True)

    image_files = [f for f in os.listdir(images_dir) if f.lower().endswith(".jpg")]
    total = len(image_files)

    print_status("Fixed augmentations started")
    print("Starting data augmentation process", flush=True)
    print(f"Base directory  : {base_dir}", flush=True)
    print(f"Original images : {total}", flush=True)
    print(f"Valid split     : {valid_ratio:.2f} ({int(valid_ratio*100)}%)", flush=True)
    print(f"Random aug ×{n}", flush=True)
    print(f"Seed            : {seed}", flush=True)
    print()

    transforms = [
        ("original", None),
        ("rotate90", A.Compose([A.Rotate(limit=(90, 90), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("rotate180", A.Compose([A.Rotate(limit=(180, 180), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("hflip", A.Compose([A.HorizontalFlip(p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("hflip_rotate180", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(180, 180), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
        ("hflip_rotate270", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(270, 270), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))),
    ]

    # 1) 고정 증강 + 원본 제거
    for _ in range(n):
        for filename in image_files:
            name = os.path.splitext(filename)[0]
            image_path = safe_path(os.path.join(images_dir, filename))
            label_path = safe_path(os.path.join(labels_dir, f"{name}.txt"))
            if not os.path.exists(image_path) or not os.path.exists(label_path):
                continue
            image = cv2.imread(image_path)
            if image is None:
                continue
            try:
                boxes, class_labels = read_yolo_label(label_path)
            except Exception as e:
                print(f"Failed to read label file: {label_path}, error: {e}", flush=True)
                continue

            for i, (suffix, transform) in enumerate(transforms):
                save_name = f"{name}_{i}"
                try:
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
                            continue
                    cv2.imwrite(safe_path(os.path.join(images_dir, f"{save_name}.jpg")), aug_img)
                    save_yolo_label(safe_path(os.path.join(labels_dir, f"{save_name}.txt")), aug_boxes, aug_classes)
                except Exception as e:
                    print(f"Augmentation error ({suffix}): {e}", flush=True)

    for filename in image_files:
        name = os.path.splitext(filename)[0]
        image_path = safe_path(os.path.join(images_dir, filename))
        label_path = safe_path(os.path.join(labels_dir, f"{name}.txt"))
        try:
            if os.path.exists(image_path): os.remove(image_path)
            if os.path.exists(label_path): os.remove(label_path)
        except Exception as e:
            print(f"Failed to delete original: {e}", flush=True)

    # 2) train/valid 분할
    print_status("Splitting train/valid sets")
    split_train_valid(base_dir, valid_ratio)
    valid_count = count_images_in_folder(os.path.join(base_dir, "valid", "images"))
    train_count_after_split = count_images_in_folder(os.path.join(base_dir, "train", "images"))
    print(f"Current image count → train: {train_count_after_split}, valid: {valid_count}", flush=True)
    print()

    # 3) train 랜덤 증강, 4) valid 약한 증강
    if n > 0:
        print_status("Random augmentations for training set")
        perform_random_augmentation_for_train(train_dir, n)

        train_count_final = count_images_in_folder(os.path.join(base_dir, "train", "images"))
        valid_count_final = count_images_in_folder(os.path.join(base_dir, "valid", "images"))
        print(f"Current image count → train: {train_count_final}, valid: {valid_count_final}", flush=True)
        print()

        print_status("Random augmentations for valid set")
        perform_random_augmentation_for_valid(base_dir, target_ratio=0.2)

        train_count_final = count_images_in_folder(os.path.join(base_dir, "train", "images"))
        valid_count_final = count_images_in_folder(os.path.join(base_dir, "valid", "images"))
        model_name = os.path.basename(base_dir)
        print_status(f"Augmentation Completed for {model_name} (train: {train_count_final}, valid: {valid_count_final})")
        print(f"Augmentation Completed for {model_name} (train: {train_count_final}, valid: {valid_count_final})", flush=True)
    else:
        model_name = os.path.basename(base_dir)
        print_status(f"Augmentation Completed for {model_name} (train: {train_count_after_split}, valid: {valid_count})")
        print("2nd Stage skipped (n=0).", flush=True)
        print(f"Augmentation Completed for {model_name} (train: {train_count_after_split}, valid: {valid_count})", flush=True)

# ---------- 엔트리 포인트 ----------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_dir", required=True, help="Export base directory (contains train/ and valid/)")
    parser.add_argument("--valid_ratio", type=float, default=0.3)
    parser.add_argument("--n", type=int, default=3, help="Augmentation multiplier")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    perform_augmentation(args.base_dir, args.valid_ratio, args.n, args.seed)
