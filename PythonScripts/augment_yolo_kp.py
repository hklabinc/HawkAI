# PythonScripts/augment_yolo_kp.py
#
# YOLO Pose(Keypoint) augmentation script.
# - Based on the existing augment_yolo.py (detection/segment), but extended to keep keypoints.
# - Label format expected (Ultralytics YOLO pose):
#   cls x_center y_center w h  kpt1x kpt1y v1  kpt2x kpt2y v2 ...
#   where bbox + keypoints are normalized (0~1), v is 0/1/2.
#
# This script:
# 1) Applies fixed augmentations (rotations, flips) N1 times
# 2) Splits into train/valid by ratio
# 3) Applies random augmentations N2 times
# 4) Writes augmented images/labels back in YOLO pose format.
#
# Requirements (same as augment_yolo.py):
#   pip install opencv-python albumentations numpy
#

import argparse
import json
import os
import random
import shutil
from pathlib import Path

import cv2
import numpy as np

try:
    import albumentations as A
except Exception as e:
    raise RuntimeError(
        "albumentations is required for augment_yolo_kp.py. Install with: pip install albumentations"
    ) from e


# -----------------------------
# Helpers: parsing + saving YOLO pose labels
# -----------------------------

def read_yolo_pose_label(txt_path: Path):
    """Read a YOLO pose label file.

    Returns
    -------
    boxes: list[list[float]]  (yolo bbox: [x,y,w,h] normalized)
    classes: list[int]
    kpts_per_box: list[list[tuple[float,float,int]]]  (normalized x,y + visibility)
    """
    boxes = []
    classes = []
    kpts_per_box = []

    if not txt_path.exists():
        return boxes, classes, kpts_per_box

    content = txt_path.read_text(encoding="utf-8").strip()
    if not content:
        return boxes, classes, kpts_per_box

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 5:
            continue

        try:
            cls = int(float(parts[0]))
            x = float(parts[1])
            y = float(parts[2])
            w = float(parts[3])
            h = float(parts[4])
        except Exception:
            continue

        extras = parts[5:]
        # keypoints are triples (x y v)
        if len(extras) % 3 != 0:
            # best-effort trim
            extras = extras[: (len(extras) // 3) * 3]

        kpts = []
        for i in range(0, len(extras), 3):
            try:
                kx = float(extras[i])
                ky = float(extras[i + 1])
                v = int(float(extras[i + 2]))
            except Exception:
                kx, ky, v = 0.0, 0.0, 0
            kpts.append((kx, ky, v))

        boxes.append([x, y, w, h])
        classes.append(cls)
        kpts_per_box.append(kpts)

    return boxes, classes, kpts_per_box


def write_yolo_pose_label(txt_path: Path, boxes, classes, kpts_per_box):
    """Write YOLO pose label file."""
    lines = []
    for bbox, cls, kpts in zip(boxes, classes, kpts_per_box):
        x, y, w, h = bbox
        parts = [
            str(int(cls)),
            f"{x:.6f}",
            f"{y:.6f}",
            f"{w:.6f}",
            f"{h:.6f}",
        ]
        for kx, ky, v in kpts:
            parts.extend([f"{kx:.6f}", f"{ky:.6f}", str(int(v))])
        lines.append(" ".join(parts))

    txt_path.parent.mkdir(parents=True, exist_ok=True)
    txt_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


# -----------------------------
# Augmentation core
# -----------------------------

def build_transforms(cfg):
    """Build fixed and random augmentation transforms."""
    fixed_cfg = cfg.get("fixed", {})
    rand_cfg = cfg.get("random", {})

    def _normalize_rotate_limit(val, default=15):
        """Normalize config value to a value accepted by albumentations.Rotate.

        Albumentations Rotate accepts:
        - number (int/float): interpreted internally as (-limit, +limit)
        - tuple/list of 2 numbers: (min, max)

        Our Blazor UI (and legacy configs) sometimes send `limit` as an int (e.g. 15).
        The previous implementation forced tuple(...), which crashes on int.
        """
        if val is None:
            return default

        # If dict-style value is provided
        if isinstance(val, dict):
            if "min" in val and "max" in val:
                try:
                    return (float(val["min"]), float(val["max"]))
                except Exception:
                    return default

        # If list/tuple is provided
        if isinstance(val, (list, tuple)):
            if len(val) == 2:
                try:
                    return (float(val[0]), float(val[1]))
                except Exception:
                    return default
            if len(val) == 1:
                try:
                    return float(val[0])
                except Exception:
                    return default
            return default

        # scalar (int/float/str)
        try:
            return float(val)
        except Exception:
            return default

    # BBox + Keypoint params
    bbox_params = A.BboxParams(format="yolo", label_fields=["class_labels", "bbox_ids"], min_visibility=0.0)
    keypoint_params = A.KeypointParams(format="xy", label_fields=["keypoint_ids", "keypoint_vis"], remove_invisible=False)

    # NOTE:
    # - "original" should be a true no-op.
    # - Using A.Compose([]) with bbox/keypoint processors emits warnings
    #   ("Got processor ... but no transform to process it.")
    # - We use None for original and treat it as identity in apply_and_save_pose().
    fixed_transforms = {
        "original": None,
        "rotate90": A.Compose([A.Rotate(limit=(90, 90), p=1.0)], bbox_params=bbox_params, keypoint_params=keypoint_params),
        "rotate180": A.Compose([A.Rotate(limit=(180, 180), p=1.0)], bbox_params=bbox_params, keypoint_params=keypoint_params),
        "rotate270": A.Compose([A.Rotate(limit=(270, 270), p=1.0)], bbox_params=bbox_params, keypoint_params=keypoint_params),
        "hflip": A.Compose([A.HorizontalFlip(p=1.0)], bbox_params=bbox_params, keypoint_params=keypoint_params),
        "hflip_rotate90": A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(90, 90), p=1.0)], bbox_params=bbox_params, keypoint_params=keypoint_params),
        "hflip_rotate180": A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(180, 180), p=1.0)], bbox_params=bbox_params, keypoint_params=keypoint_params),
        "hflip_rotate270": A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(270, 270), p=1.0)], bbox_params=bbox_params, keypoint_params=keypoint_params),
    }

    # enabled fixed list
    enabled_fixed = [name for name, enabled in fixed_cfg.items() if enabled and name in fixed_transforms]
    if not enabled_fixed:
        enabled_fixed = ["original"]

    # random transforms (probabilities controlled by cfg)
    random_ops = []

    def maybe_add(op_name, op):
        if rand_cfg.get(op_name, {}).get("enabled", False):
            random_ops.append(op)

    # rotate
    rot = rand_cfg.get("rotate", {})
    if rot.get("enabled", False):
        # Albumentations Rotate supports `limit` as int/float or (min,max).
        # Our legacy UI/config uses an int (e.g. 15). Handle both safely.
        limit = _normalize_rotate_limit(rot.get("limit", 15), default=15)
        random_ops.append(A.Rotate(limit=limit, p=float(rot.get("p", 0.5))))

    # affine shear
    shear = rand_cfg.get("affine_shear", {})
    if shear.get("enabled", False):
        random_ops.append(
            A.Affine(
                shear={
                    "x": (float(shear.get("x_min", -10)), float(shear.get("x_max", 10))),
                    "y": (float(shear.get("y_min", -10)), float(shear.get("y_max", 10))),
                },
                p=float(shear.get("p", 0.5)),
            )
        )

    # brightness/contrast
    bc = rand_cfg.get("brightness_contrast", {})
    if bc.get("enabled", False):
        random_ops.append(
            A.RandomBrightnessContrast(
                brightness_limit=(float(bc.get("brightness_min", -0.2)), float(bc.get("brightness_max", 0.2))),
                contrast_limit=(float(bc.get("contrast_min", -0.2)), float(bc.get("contrast_max", 0.2))),
                p=float(bc.get("p", 0.5)),
            )
        )

    # gamma
    gamma = rand_cfg.get("gamma", {})
    if gamma.get("enabled", False):
        random_ops.append(A.RandomGamma(gamma_limit=(int(gamma.get("min", 80)), int(gamma.get("max", 120))), p=float(gamma.get("p", 0.5))))

    # rgb shift
    rgb = rand_cfg.get("rgb_shift", {})
    if rgb.get("enabled", False):
        random_ops.append(
            A.RGBShift(
                r_shift_limit=(int(rgb.get("r_min", -10)), int(rgb.get("r_max", 10))),
                g_shift_limit=(int(rgb.get("g_min", -10)), int(rgb.get("g_max", 10))),
                b_shift_limit=(int(rgb.get("b_min", -10)), int(rgb.get("b_max", 10))),
                p=float(rgb.get("p", 0.5)),
            )
        )

    # gaussian blur
    gb = rand_cfg.get("gaussian_blur", {})
    if gb.get("enabled", False):
        random_ops.append(A.GaussianBlur(blur_limit=(int(gb.get("min", 3)), int(gb.get("max", 7))), p=float(gb.get("p", 0.3))))

    # shift/scale/rotate
    ssr = rand_cfg.get("shift_scale_rotate", {})
    if ssr.get("enabled", False):
        random_ops.append(
            A.ShiftScaleRotate(
                shift_limit=float(ssr.get("shift_limit", 0.0625)),
                scale_limit=float(ssr.get("scale_limit", 0.1)),
                rotate_limit=float(ssr.get("rotate_limit", 15)),
                border_mode=int(ssr.get("border_mode", cv2.BORDER_REFLECT_101)),
                p=float(ssr.get("p", 0.5)),
            )
        )

    # HSV
    hsv = rand_cfg.get("hue_saturation_value", {})
    if hsv.get("enabled", False):
        random_ops.append(
            A.HueSaturationValue(
                hue_shift_limit=int(hsv.get("hue", 20)),
                sat_shift_limit=int(hsv.get("sat", 30)),
                val_shift_limit=int(hsv.get("val", 20)),
                p=float(hsv.get("p", 0.5)),
            )
        )

    # gauss noise
    gn = rand_cfg.get("gauss_noise", {})
    if gn.get("enabled", False):
        random_ops.append(A.GaussNoise(p=float(gn.get("p", 0.3))))

    random_transform = A.Compose(random_ops, bbox_params=bbox_params, keypoint_params=keypoint_params) if random_ops else None

    return enabled_fixed, fixed_transforms, random_transform


def apply_and_save_pose(image_bgr, boxes, classes, kpts_per_box, transform, out_img: Path, out_lbl: Path):
    """Apply augmentation transform to image + bboxes + keypoints and save."""
    if not boxes:
        return False

    img_h, img_w = image_bgr.shape[:2]

    # Prepare per-bbox ids (for mapping after augmentation)
    bbox_ids = list(range(len(boxes)))

    # Flatten keypoints across boxes, keep ids and visibility in parallel arrays
    keypoints = []
    keypoint_ids = []
    keypoint_vis = []
    kpt_count_per_bbox = {bid: len(kpts_per_box[bid]) for bid in range(len(kpts_per_box))}

    for bid, kpts in enumerate(kpts_per_box):
        for ki, (kx, ky, v) in enumerate(kpts):
            # convert normalized -> pixel for albumentations
            x_pix = float(kx) * img_w
            y_pix = float(ky) * img_h
            keypoints.append((x_pix, y_pix))
            keypoint_ids.append((bid, ki))
            keypoint_vis.append(int(v))

    if transform is None:
        aug = {
            "image": image_bgr,
            "bboxes": boxes,
            "class_labels": classes,
            "bbox_ids": bbox_ids,
            "keypoints": keypoints,
            "keypoint_ids": keypoint_ids,
            "keypoint_vis": keypoint_vis,
        }
    else:
        aug = transform(
            image=image_bgr,
            bboxes=boxes,
            class_labels=classes,
            bbox_ids=bbox_ids,
            keypoints=keypoints,
            keypoint_ids=keypoint_ids,
            keypoint_vis=keypoint_vis,
        )

    aug_img = aug["image"]
    aug_boxes = aug.get("bboxes", [])
    aug_classes = aug.get("class_labels", [])
    aug_bbox_ids = aug.get("bbox_ids", [])

    if not aug_boxes:
        return False

    # Reconstruct keypoints per bbox
    aug_h, aug_w = aug_img.shape[:2]

    # keypoints output is list of (x_pix,y_pix)
    aug_keypoints = aug.get("keypoints", [])
    aug_keypoint_ids = aug.get("keypoint_ids", [])
    aug_keypoint_vis = aug.get("keypoint_vis", [])

    # Build map for quick lookup
    kp_map = {}
    for (x_pix, y_pix), (bid, ki), v in zip(aug_keypoints, aug_keypoint_ids, aug_keypoint_vis):
        kp_map[(int(bid), int(ki))] = (float(x_pix), float(y_pix), int(v))

    keep_bbox_set = set(int(bid) for bid in aug_bbox_ids)

    out_kpts_per_box = []
    for bid in aug_bbox_ids:
        bid = int(bid)
        kcnt = kpt_count_per_bbox.get(bid, 0)
        kpts_out = []
        for ki in range(kcnt):
            x_pix, y_pix, v = kp_map.get((bid, ki), (0.0, 0.0, 0))

            # If original v was 0, keep as absent regardless of transform result
            if v <= 0:
                kpts_out.append((0.0, 0.0, 0))
                continue

            # Out of bounds -> mark absent
            if x_pix < 0 or y_pix < 0 or x_pix >= aug_w or y_pix >= aug_h:
                kpts_out.append((0.0, 0.0, 0))
                continue

            x_n = x_pix / aug_w
            y_n = y_pix / aug_h
            # clamp
            x_n = float(max(0.0, min(1.0, x_n)))
            y_n = float(max(0.0, min(1.0, y_n)))
            kpts_out.append((x_n, y_n, int(v)))

        out_kpts_per_box.append(kpts_out)

    # Save image
    out_img.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_img), aug_img)

    # Save labels
    write_yolo_pose_label(out_lbl, aug_boxes, aug_classes, out_kpts_per_box)
    return True


# -----------------------------
# Pipeline
# -----------------------------

def list_images(img_dir: Path):
    if not img_dir.exists():
        return []
    exts = {".jpg", ".jpeg", ".png"}
    return sorted([p for p in img_dir.iterdir() if p.suffix.lower() in exts])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_dir", required=True, help="Export base dir (contains train/valid subfolders)")
    parser.add_argument("--config_json", required=True, help="Augmentation config JSON path")
    args = parser.parse_args()

    base_dir = Path(args.base_dir)
    cfg_path = Path(args.config_json)

    if not base_dir.exists():
        raise FileNotFoundError(f"base_dir not found: {base_dir}")
    if not cfg_path.exists():
        raise FileNotFoundError(f"config_json not found: {cfg_path}")

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))

    # Backward-compat: existing UI sends fixed_ key
    if "fixed_" in cfg and "fixed" not in cfg:
        cfg["fixed"] = cfg.pop("fixed_")

    valid_ratio = float(cfg.get("valid_ratio", 0.2))
    n1 = int(cfg.get("n1", 1))
    n2 = int(cfg.get("n2", 0))
    seed = int(cfg.get("seed", 7))

    random.seed(seed)
    np.random.seed(seed)

    enabled_fixed, fixed_transforms, random_transform = build_transforms(cfg)

    # Paths
    train_img_dir = base_dir / "train" / "images"
    train_lbl_dir = base_dir / "train" / "labels"
    valid_img_dir = base_dir / "valid" / "images"
    valid_lbl_dir = base_dir / "valid" / "labels"

    # Fixed augmentation output temp folder
    fixed_img_dir = base_dir / "_fixed" / "images"
    fixed_lbl_dir = base_dir / "_fixed" / "labels"
    shutil.rmtree(fixed_img_dir.parent, ignore_errors=True)
    fixed_img_dir.mkdir(parents=True, exist_ok=True)
    fixed_lbl_dir.mkdir(parents=True, exist_ok=True)

    # Read original train images (we assume base_dir already has train/images + train/labels)
    originals = list_images(train_img_dir)

    total_tasks = len(originals) * len(enabled_fixed) * max(1, n1)
    done = 0

    for img_path in originals:
        lbl_path = train_lbl_dir / (img_path.stem + ".txt")
        img = cv2.imread(str(img_path))
        if img is None:
            continue

        boxes, classes, kpts_per_box = read_yolo_pose_label(lbl_path)
        if not boxes:
            # no labels -> skip
            continue

        for fixed_name in enabled_fixed:
            t = fixed_transforms.get(fixed_name)
            for it in range(n1):
                out_stem = f"{img_path.stem}_{fixed_name}_{it}" if fixed_name != "original" or it > 0 else img_path.stem
                out_img = fixed_img_dir / f"{out_stem}{img_path.suffix.lower()}"
                out_lbl = fixed_lbl_dir / f"{out_stem}.txt"

                ok = apply_and_save_pose(img, boxes, classes, kpts_per_box, t, out_img, out_lbl)
                done += 1
                if done % 10 == 0 or done == total_tasks:
                    print(f"STATUS:Fixed augmentation {done}/{total_tasks}", flush=True)

    # Replace original train with fixed augmented set
    shutil.rmtree(train_img_dir, ignore_errors=True)
    shutil.rmtree(train_lbl_dir, ignore_errors=True)
    train_img_dir.mkdir(parents=True, exist_ok=True)
    train_lbl_dir.mkdir(parents=True, exist_ok=True)

    for p in fixed_img_dir.iterdir():
        shutil.move(str(p), str(train_img_dir / p.name))
    for p in fixed_lbl_dir.iterdir():
        shutil.move(str(p), str(train_lbl_dir / p.name))

    shutil.rmtree(fixed_img_dir.parent, ignore_errors=True)

    # Split train/valid
    all_imgs = list_images(train_img_dir)
    random.shuffle(all_imgs)

    n_valid = int(round(len(all_imgs) * valid_ratio))
    valid_imgs = set(all_imgs[:n_valid])

    shutil.rmtree(valid_img_dir, ignore_errors=True)
    shutil.rmtree(valid_lbl_dir, ignore_errors=True)
    valid_img_dir.mkdir(parents=True, exist_ok=True)
    valid_lbl_dir.mkdir(parents=True, exist_ok=True)

    for img_path in list(all_imgs):
        if img_path in valid_imgs:
            # move image + label to valid
            lbl_path = train_lbl_dir / (img_path.stem + ".txt")
            shutil.move(str(img_path), str(valid_img_dir / img_path.name))
            if lbl_path.exists():
                shutil.move(str(lbl_path), str(valid_lbl_dir / lbl_path.name))

    print("STATUS:Split train/valid completed", flush=True)

    # Random augmentation on BOTH train and valid
    if n2 > 0 and random_transform is not None:
        for split_name, img_dir, lbl_dir in [
            ("train", train_img_dir, train_lbl_dir),
            ("valid", valid_img_dir, valid_lbl_dir),
        ]:
            imgs = list_images(img_dir)
            total_rnd = len(imgs) * n2
            done_rnd = 0

            for img_path in imgs:
                lbl_path = lbl_dir / (img_path.stem + ".txt")
                img = cv2.imread(str(img_path))
                if img is None:
                    continue

                boxes, classes, kpts_per_box = read_yolo_pose_label(lbl_path)
                if not boxes:
                    continue

                for ri in range(n2):
                    out_stem = f"{img_path.stem}_rnd{ri}"
                    out_img = img_dir / f"{out_stem}{img_path.suffix.lower()}"
                    out_lbl = lbl_dir / f"{out_stem}.txt"
                    apply_and_save_pose(img, boxes, classes, kpts_per_box, random_transform, out_img, out_lbl)

                    done_rnd += 1
                    if done_rnd % 20 == 0 or done_rnd == total_rnd:
                        print(f"STATUS:Random augmentation ({split_name}) {done_rnd}/{total_rnd}", flush=True)

    print("STATUS:Augmentation finished", flush=True)


if __name__ == "__main__":
    main()
