# PythonScripts/augment_yolo.py
import os, sys, argparse, platform, shutil, uuid, cv2, numpy as np, random, math, json
import albumentations as A
from typing import Optional

# --- 콘솔 인코딩(Windows cp949 등) 이슈 방지 ---
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, "reconfigure"):
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
    print(f"STATUS: {msg}", flush=True)

def list_jpg(dir_path: str):
    return [f for f in os.listdir(dir_path) if f.lower().endswith(".jpg")]

def ensure_dirs(*paths):
    for p in paths: os.makedirs(p, exist_ok=True)

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
            if len(parts) != 5: continue
            cls, x, y, w, h = parts
            boxes.append([float(x), float(y), float(w), float(h)])
            class_labels.append(int(float(cls)))
    return boxes, class_labels

def save_yolo_label(txt_path: str, boxes, class_labels):
    with open(txt_path, 'w') as f:
        for cls, box in zip(class_labels, boxes):
            f.write(f"{cls} {' '.join([f'{coord:.6f}' for coord in box])}\n")

# =========================
# 설정 파싱 (JSON)
# =========================
def load_config(config_json_path: Optional[str]):
    # 기본값
    cfg = {
        "valid_ratio": 0.2,
        "n1": 1,
        "n2": 3,
        "seed": 7,
        "fixed": {
            "original": True,
            "rotate90": True,
            "rotate180": True,
            "rotate270": True,
            "hflip": True,
            "hflip_rotate90": True,
            "hflip_rotate180": True,
            "hflip_rotate270": True
        },
        "random": {
            "rotate": {"enabled": True, "limit": 15, "p": 0.3},
            "affine_shear": {"enabled": True, "x_min": -1, "x_max": 1, "y_min": -1, "y_max": 1, "p": 0.3},
            "brightness_contrast": {"enabled": True, "brightness_min": 0.0, "brightness_max": 0.1, "contrast_min": 0.0, "contrast_max": 0.1, "p": 0.3},
            "gamma": {"enabled": True, "min": 70, "max": 130, "p": 0.3},
            "rgb_shift": {"enabled": False, "r_min": -5, "r_max": 5, "g_min": -5, "g_max": 5, "b_min": -5, "b_max": 5, "p": 0.3},
            "gaussian_blur": {"enabled": False, "min": 2, "max": 4, "p": 0.3},
            "shift_scale_rotate": {"enabled": False, "shift_limit": 0.30, "scale_limit": 0.0, "rotate_limit": 15, "border_mode": 1, "p": 0.5},
            "hue_saturation_value": {"enabled": False, "hue": 15, "sat": 25, "val": 10, "p": 0.4},
            "gauss_noise": {"enabled": False, "p": 0.1}
        }
    }
    if config_json_path and os.path.exists(config_json_path):
        try:
            with open(config_json_path, "r", encoding="utf-8") as f:
                user = json.load(f)

            # ------ 보강: fixed_ -> fixed 자동 매핑 ------
            if "fixed" not in user and "fixed_" in user:
                user["fixed"] = user.pop("fixed_")
            # ---------------------------------------------

            # 얕은 병합
            for k in ["valid_ratio","n1","n2","seed"]:
                if k in user:
                    cfg[k] = user[k]
            if "fixed" in user and isinstance(user["fixed"], dict):
                cfg["fixed"].update(user["fixed"])
            if "random" in user and isinstance(user["random"], dict):
                for rk, rv in user["random"].items():
                    if rk in cfg["random"] and isinstance(rv, dict):
                        cfg["random"][rk].update(rv)
        except Exception as e:
            print(f"[PY] Failed to read config_json: {e}", flush=True)
    return cfg

# =========================
# 증강 파이프라인 빌더
# =========================
def build_fixed_transforms_from_config(fixed_cfg: dict):
    out = []
    if fixed_cfg.get("original", True):
        out.append(("original", None))
    def add(name, transform):
        if fixed_cfg.get(name, False):
            out.append((name, transform))

    add("rotate90", A.Compose([A.Rotate(limit=(90, 90), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels'])))
    add("rotate180", A.Compose([A.Rotate(limit=(180, 180), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels'])))
    add("rotate270", A.Compose([A.Rotate(limit=(270, 270), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels'])))
    add("hflip", A.Compose([A.HorizontalFlip(p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels'])))
    add("hflip_rotate90", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(90, 90), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels'])))
    add("hflip_rotate180", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(180, 180), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels'])))
    add("hflip_rotate270", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(270, 270), p=1.0)], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels'])))
    return out

def build_random_transform_from_config(rnd: dict):
    transforms = []
    if rnd["rotate"]["enabled"]:
        transforms.append(A.Rotate(limit=rnd["rotate"]["limit"], p=rnd["rotate"]["p"]))
    if rnd["affine_shear"]["enabled"]:
        transforms.append(A.Affine(shear={
            "x": (rnd["affine_shear"]["x_min"], rnd["affine_shear"]["x_max"]),
            "y": (rnd["affine_shear"]["y_min"], rnd["affine_shear"]["y_max"])
        }, p=rnd["affine_shear"]["p"]))
    if rnd["brightness_contrast"]["enabled"]:
        transforms.append(A.RandomBrightnessContrast(
            brightness_limit=(rnd["brightness_contrast"]["brightness_min"], rnd["brightness_contrast"]["brightness_max"]),
            contrast_limit=(rnd["brightness_contrast"]["contrast_min"], rnd["brightness_contrast"]["contrast_max"]),
            p=rnd["brightness_contrast"]["p"]))
    if rnd["gamma"]["enabled"]:
        transforms.append(A.RandomGamma(gamma_limit=(rnd["gamma"]["min"], rnd["gamma"]["max"]), p=rnd["gamma"]["p"]))
    if rnd["rgb_shift"]["enabled"]:
        transforms.append(A.RGBShift(
            r_shift_limit=(rnd["rgb_shift"]["r_min"], rnd["rgb_shift"]["r_max"]),
            g_shift_limit=(rnd["rgb_shift"]["g_min"], rnd["rgb_shift"]["g_max"]),
            b_shift_limit=(rnd["rgb_shift"]["b_min"], rnd["rgb_shift"]["b_max"]),
            p=rnd["rgb_shift"]["p"]))
    if rnd["gaussian_blur"]["enabled"]:
        transforms.append(A.GaussianBlur(blur_limit=(rnd["gaussian_blur"]["min"], rnd["gaussian_blur"]["max"]), p=rnd["gaussian_blur"]["p"]))
    if rnd["shift_scale_rotate"]["enabled"]:
        transforms.append(A.ShiftScaleRotate(
            shift_limit=rnd["shift_scale_rotate"]["shift_limit"],
            scale_limit=rnd["shift_scale_rotate"]["scale_limit"],
            rotate_limit=rnd["shift_scale_rotate"]["rotate_limit"],
            border_mode=rnd["shift_scale_rotate"]["border_mode"],
            p=rnd["shift_scale_rotate"]["p"]
        ))
    if rnd["hue_saturation_value"]["enabled"]:
        transforms.append(A.HueSaturationValue(
            hue_shift_limit=rnd["hue_saturation_value"]["hue"],
            sat_shift_limit=rnd["hue_saturation_value"]["sat"],
            val_shift_limit=rnd["hue_saturation_value"]["val"],
            p=rnd["hue_saturation_value"]["p"]))
    if rnd["gauss_noise"]["enabled"]:
        transforms.append(A.GaussNoise(p=rnd["gauss_noise"]["p"]))

    return A.Compose(transforms, bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))

def apply_and_save(image, boxes, class_labels, transform, save_img_path: str, save_lbl_path: str):
    if transform is None:
        aug_img, aug_boxes, aug_classes = image.copy(), boxes, class_labels
    else:
        applied = transform(image=image, bboxes=boxes, class_labels=class_labels)
        aug_img = applied['image']; aug_boxes = applied['bboxes']; aug_classes = applied['class_labels']
    if len(aug_boxes) == 0: return False
    cv2.imwrite(save_img_path, aug_img)
    save_yolo_label(save_lbl_path, aug_boxes, aug_classes)
    return True

# =========================
# 1) 고정 증강 × n1 + 원본 삭제
# =========================
def fixed_augmentations(images_dir: str, labels_dir: str, n1: int, fixed_cfg: dict):
    transforms = build_fixed_transforms_from_config(fixed_cfg)
    image_files = list_jpg(images_dir)

    for it in range(max(0, n1)):
        for filename in image_files:
            name = os.path.splitext(filename)[0]
            image_path = safe_path(os.path.join(images_dir, filename))
            label_path = safe_path(os.path.join(labels_dir, f"{name}.txt"))
            if not (os.path.exists(image_path) and os.path.exists(label_path)): continue
            image = cv2.imread(image_path)
            if image is None: continue
            try:
                boxes, class_labels = read_yolo_label(label_path)
            except Exception as e:
                print(f"Label read error: {label_path} ({e})", flush=True); continue

            for t_idx, (_suffix, transform) in enumerate(transforms):
                save_stem = f"{name}_{it}_{t_idx}"
                save_img = os.path.join(images_dir, f"{save_stem}.jpg")
                save_lbl = os.path.join(labels_dir, f"{save_stem}.txt")
                try:
                    apply_and_save(image, boxes, class_labels, transform, save_img, save_lbl)
                except Exception as e:
                    print(f"Fixed augmentation error ({filename}): {e}", flush=True)

    # 원본 삭제
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
# 2) train → valid 분할 (올림)
# =========================
def split_train_valid(base_dir: str, valid_ratio: float):
    train_img_dir = safe_path(os.path.join(base_dir, "train", "images"))
    train_lbl_dir = safe_path(os.path.join(base_dir, "train", "labels"))
    valid_img_dir = safe_path(os.path.join(base_dir, "valid", "images"))
    valid_lbl_dir = safe_path(os.path.join(base_dir, "valid", "labels"))
    ensure_dirs(valid_img_dir, valid_lbl_dir)

    all_images = list_jpg(train_img_dir)
    random.shuffle(all_images)
    split_count = math.ceil(len(all_images) * valid_ratio)
    selected = all_images[:split_count]

    moved = 0
    for filename in selected:
        name = os.path.splitext(filename)[0]
        src_img = os.path.join(train_img_dir, filename)
        src_lbl = os.path.join(train_lbl_dir, f"{name}.txt")
        dst_img = os.path.join(valid_img_dir, filename)
        dst_lbl = os.path.join(valid_lbl_dir, f"{name}.txt")
        try:
            if os.path.exists(src_img): shutil.move(src_img, dst_img)
            if os.path.exists(src_lbl): shutil.move(src_lbl, dst_lbl)
            moved += 1
        except Exception as e:
            print(f"Failed to move {filename}: {e}", flush=True)

    print(f"[PY] Split → moved {moved} to valid (ratio={valid_ratio:.2f})", flush=True)

# =========================
# 3) 랜덤 증강 (train/valid 공용)
# =========================
def random_augment_per_image(images_dir: str, labels_dir: str, per_image_times: int, transform, tag="train"):
    if per_image_times <= 0: return
    image_files = list_jpg(images_dir)
    total_src, made = len(image_files), 0

    for filename in image_files:
        name = os.path.splitext(filename)[0]
        image_path = os.path.join(images_dir, filename)
        label_path = os.path.join(labels_dir, f"{name}.txt")
        if not (os.path.exists(image_path) and os.path.exists(label_path)): continue
        image = cv2.imread(image_path)
        if image is None: continue

        try:
            boxes, class_labels = read_yolo_label(label_path)
        except Exception as e:
            print(f"Label read error for {label_path}: {e}", flush=True); continue

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
def perform_augmentation(base_dir: str, cfg: dict):
    valid_ratio = float(cfg["valid_ratio"])
    n1 = int(cfg["n1"])
    n2 = int(cfg["n2"])
    seed = int(cfg["seed"])
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

    # 1) 고정 증강 + 원본 삭제
    if total > 0 and n1 > 0:
        fixed_augmentations(images_dir, labels_dir, n1, cfg["fixed"])
        log_counts(base_dir, "After fixed aug")
    elif total == 0:
        print("No images found in train/images.", flush=True)

    # 2) split
    print_status("Splitting train/valid sets")
    split_train_valid(base_dir, valid_ratio)
    log_counts(base_dir, "After split")

    # 3) 랜덤 증강 (train/valid)
    if n2 > 0:
        rnd_transform = build_random_transform_from_config(cfg["random"])
        print_status("Random augmentations for training set")
        random_augment_per_image(
            images_dir=os.path.join(base_dir, "train", "images"),
            labels_dir=os.path.join(base_dir, "train", "labels"),
            per_image_times=n2,
            transform=rnd_transform,
            tag="train"
        )
        log_counts(base_dir, "After train random aug")

        print_status("Random augmentations for valid set")
        random_augment_per_image(
            images_dir=os.path.join(base_dir, "valid", "images"),
            labels_dir=os.path.join(base_dir, "valid", "labels"),
            per_image_times=n2,
            transform=rnd_transform,
            tag="valid"
        )
        log_counts(base_dir, "After valid random aug")

    # 완료
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
    parser.add_argument("--base_dir", required=True)
    parser.add_argument("--valid_ratio", type=float, default=None)  # JSON 우선
    parser.add_argument("--n1", type=int, default=None)
    parser.add_argument("--n2", type=int, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--config_json", type=str, default=None)
    args = parser.parse_args()

    cfg = load_config(args.config_json)
    # CLI로 들어온 값이 있으면 JSON보다 우선 적용
    if args.valid_ratio is not None: cfg["valid_ratio"] = args.valid_ratio
    if args.n1 is not None: cfg["n1"] = args.n1
    if args.n2 is not None: cfg["n2"] = args.n2
    if args.seed is not None: cfg["seed"] = args.seed

    perform_augmentation(args.base_dir, cfg)
