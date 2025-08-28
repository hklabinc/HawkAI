# PythonScripts/augment_preview.py
import os, sys, json, argparse
import numpy as np
import cv2
import albumentations as A

def log(msg: str):
    print(f"[PY] {msg}", flush=True)

def img_delta(a: np.ndarray, b: np.ndarray):
    try:
        if a.shape != b.shape:
            return None
        return float(np.mean(np.abs(a.astype(np.int16) - b.astype(np.int16))))
    except Exception as e:
        log(f"delta calc error: {e}")
        return None

def build_fixed_transform_from_flags(fx: dict):
    # 체크된 고정 변환 중 우선순위 1개만 선택
    order = [
        ("original", None),
        ("rotate90", A.Rotate(limit=(90, 90), p=1.0)),
        ("rotate180", A.Rotate(limit=(180, 180), p=1.0)),
        ("rotate270", A.Rotate(limit=(270, 270), p=1.0)),
        ("hflip", A.HorizontalFlip(p=1.0)),
        ("hflip_rotate90", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(90, 90), p=1.0)])),
        ("hflip_rotate180", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(180, 180), p=1.0)])),
        ("hflip_rotate270", A.Compose([A.HorizontalFlip(p=1.0), A.Rotate(limit=(270, 270), p=1.0)])),
    ]
    for key, t in order:
        if fx.get(key, False):
            return t
    return None

def build_random_transform(rnd: dict):
    ts = []

    if rnd.get("rotate", {}).get("enabled", False):
        ts.append(A.Rotate(limit=rnd["rotate"]["limit"], p=1.0))
    if rnd.get("affine_shear", {}).get("enabled", False):
        ts.append(A.Affine(shear={
            "x": (rnd["affine_shear"]["x_min"], rnd["affine_shear"]["x_max"]),
            "y": (rnd["affine_shear"]["y_min"], rnd["affine_shear"]["y_max"])
        }, p=1.0))
    if rnd.get("brightness_contrast", {}).get("enabled", False):
        ts.append(A.RandomBrightnessContrast(
            brightness_limit=(rnd["brightness_contrast"]["brightness_min"], rnd["brightness_contrast"]["brightness_max"]),
            contrast_limit=(rnd["brightness_contrast"]["contrast_min"], rnd["brightness_contrast"]["contrast_max"]),
            p=1.0))
    if rnd.get("gamma", {}).get("enabled", False):
        ts.append(A.RandomGamma(gamma_limit=(rnd["gamma"]["min"], rnd["gamma"]["max"]), p=1.0))
    if rnd.get("rgb_shift", {}).get("enabled", False):
        ts.append(A.RGBShift(
            r_shift_limit=(rnd["rgb_shift"]["r_min"], rnd["rgb_shift"]["r_max"]),
            g_shift_limit=(rnd["rgb_shift"]["g_min"], rnd["rgb_shift"]["g_max"]),
            b_shift_limit=(rnd["rgb_shift"]["b_min"], rnd["rgb_shift"]["b_max"]),
            p=1.0))
    if rnd.get("gaussian_blur", {}).get("enabled", False):
        ts.append(A.GaussianBlur(
            blur_limit=(rnd["gaussian_blur"]["min"], rnd["gaussian_blur"]["max"]), p=1.0))
    if rnd.get("shift_scale_rotate", {}).get("enabled", False):
        ts.append(A.ShiftScaleRotate(
            shift_limit=rnd["shift_scale_rotate"]["shift_limit"],
            scale_limit=rnd["shift_scale_rotate"]["scale_limit"],
            rotate_limit=rnd["shift_scale_rotate"]["rotate_limit"],
            border_mode=rnd["shift_scale_rotate"]["border_mode"],
            p=1.0))
    if rnd.get("hue_saturation_value", {}).get("enabled", False):
        ts.append(A.HueSaturationValue(
            hue_shift_limit=rnd["hue_saturation_value"]["hue"],
            sat_shift_limit=rnd["hue_saturation_value"]["sat"],
            val_shift_limit=rnd["hue_saturation_value"]["val"],
            p=1.0))
    if rnd.get("gauss_noise", {}).get("enabled", False):
        ts.append(A.GaussNoise(p=1.0))

    # 아무 랜덤 변환도 켜져 있지 않으면, 기본으로 Gamma 적용
    if not ts:
        ts.append(A.RandomGamma(gamma_limit=(85, 115), p=1.0))
    return A.Compose(ts)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--config_json", required=True)
    args = p.parse_args()

    log(f"Args.input={args.input}")
    log(f"Args.output={args.output}")
    log(f"Args.config_json={args.config_json}")

    if not os.path.exists(args.input):
        log("Input image does not exist.")
        sys.exit(2)
    if not os.path.exists(args.config_json):
        log("Config json does not exist.")
        sys.exit(2)

    try:
        with open(args.config_json, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception as e:
        log(f"Config load failed: {e}")
        sys.exit(2)

    log(f"albumentations.__version__={getattr(A, '__version__', 'unknown')}")
    log(f"cv2.__version__={cv2.__version__}")

    img = cv2.imread(args.input, cv2.IMREAD_COLOR)
    if img is None:
        log(f"Failed to read input image: {args.input}")
        sys.exit(2)

    log(f"Input image shape={img.shape}, dtype={img.dtype}")

    try:
        fx_cfg = cfg.get("fixed", {}) if isinstance(cfg.get("fixed", {}), dict) else {}
        fx_t = build_fixed_transform_from_flags(fx_cfg)

        rnd_cfg = cfg.get("random", {}) if isinstance(cfg.get("random", {}), dict) else {}
        rnd_t = build_random_transform(rnd_cfg)

        if fx_t is None:
            t = rnd_t
        else:
            if isinstance(fx_t, A.Compose):
                t = A.Compose(fx_t.transforms + rnd_t.transforms)
            else:
                t = A.Compose([fx_t] + rnd_t.transforms)

        out = t(image=img)["image"]

        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        ok = cv2.imwrite(args.output, out, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        log(f"Write output -> {args.output}, ok={ok}")
        if not ok:
            log("Failed to write output image")
            sys.exit(4)

        final_delta = img_delta(img, out)
        log(f"Final mean_abs_delta={final_delta}")
        sys.exit(0)

    except Exception as e:
        log(f"Augment preview failed: {e}")
        sys.exit(5)

if __name__ == "__main__":
    main()
