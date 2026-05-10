from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import mediapipe as mp
import cv2
import numpy as np
from PIL import Image
import io

app = FastAPI(title="StyleSense Analysis Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

mp_pose = mp.solutions.pose

# Monk Skin Tone scale — 10 tones mapped to approximate LAB lightness ranges
MONK_TONES = [
    {"label": "Monk 1",  "hex": "#f6ede4", "min_l": 85},
    {"label": "Monk 2",  "hex": "#f3e7db", "min_l": 80},
    {"label": "Monk 3",  "hex": "#f7ead0", "min_l": 75},
    {"label": "Monk 4",  "hex": "#eadaba", "min_l": 68},
    {"label": "Monk 5",  "hex": "#d7bd96", "min_l": 60},
    {"label": "Monk 6",  "hex": "#a07850", "min_l": 50},
    {"label": "Monk 7",  "hex": "#825c43", "min_l": 42},
    {"label": "Monk 8",  "hex": "#604134", "min_l": 34},
    {"label": "Monk 9",  "hex": "#3a312a", "min_l": 26},
    {"label": "Monk 10", "hex": "#292420", "min_l": 0},
]

# Color palettes recommended per Monk tone
SKIN_TONE_PALETTES = {
    "Monk 1":  ["#F5F5DC", "#FFE4B5", "#98FB98", "#87CEEB", "#DDA0DD"],
    "Monk 2":  ["#FFFACD", "#F0E68C", "#90EE90", "#ADD8E6", "#FFB6C1"],
    "Monk 3":  ["#FFE4C4", "#F4A460", "#8FBC8F", "#6495ED", "#EE82EE"],
    "Monk 4":  ["#D2691E", "#CD853F", "#6B8E23", "#4682B4", "#9370DB"],
    "Monk 5":  ["#A0522D", "#8B4513", "#556B2F", "#191970", "#8B008B"],
    "Monk 6":  ["#8B4513", "#6B3A2A", "#2E8B57", "#00008B", "#800080"],
    "Monk 7":  ["#7B3F00", "#5C3317", "#1B5E20", "#0D47A1", "#6A0DAD"],
    "Monk 8":  ["#4B2C20", "#3E1F10", "#145A32", "#0B2D6E", "#4A0060"],
    "Monk 9":  ["#3B1F14", "#2C1208", "#0D3B24", "#071D4A", "#330040"],
    "Monk 10": ["#2C1A10", "#1C0A04", "#0A2518", "#040E2B", "#220030"],
}


def classify_body_shape(landmarks) -> str:
    """
    Classifies body shape based on shoulder, waist, and hip landmark ratios.
    Uses MediaPipe pose landmark indices:
      11, 12 = left/right shoulder
      23, 24 = left/right hip
      25, 26 = left/right knee (used as waist proxy)
    """
    lm = landmarks.landmark

    shoulder_width = abs(lm[11].x - lm[12].x)
    hip_width      = abs(lm[23].x - lm[24].x)
    # Approximate waist as midpoint between shoulder and hip width
    waist_width    = (shoulder_width + hip_width) / 2 * 0.75

    ratio_sw_hw = shoulder_width / hip_width if hip_width > 0 else 1

    if 0.9 <= ratio_sw_hw <= 1.1 and waist_width < shoulder_width * 0.85:
        return "Hourglass"
    elif ratio_sw_hw < 0.85:
        return "Pear"
    elif ratio_sw_hw > 1.2:
        return "Inverted Triangle"
    elif abs(shoulder_width - hip_width) < 0.05 and waist_width > shoulder_width * 0.88:
        return "Apple"
    else:
        return "Rectangle"


def classify_skin_tone(image_rgb: np.ndarray) -> tuple[str, list[str]]:
    """
    Detects skin tone from the upper-center region of the image (face/neck area).
    Converts to LAB color space and compares lightness against Monk scale thresholds.
    """
    h, w = image_rgb.shape[:2]
    # Crop face region — upper 30% center 40% of the image
    face_region = image_rgb[0:int(h * 0.3), int(w * 0.3):int(w * 0.7)]

    if face_region.size == 0:
        return "Monk 4", SKIN_TONE_PALETTES["Monk 4"]

    lab      = cv2.cvtColor(face_region, cv2.COLOR_RGB2LAB)
    avg_l    = float(np.mean(lab[:, :, 0])) / 255 * 100  # Normalize to 0-100

    tone_label = "Monk 10"
    for tone in MONK_TONES:
        if avg_l >= tone["min_l"]:
            tone_label = tone["label"]
            break

    palette = SKIN_TONE_PALETTES.get(tone_label, SKIN_TONE_PALETTES["Monk 4"])
    return tone_label, palette


@app.get("/")
def health_check():
    return {"status": "StyleSense analysis service is running"}


@app.post("/analyze")
async def analyze_selfie(file: UploadFile = File(...)):
    # Validate file type
    if file.content_type not in ["image/jpeg", "image/jpg", "image/png"]:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG images are accepted")

    contents = await file.read()
    image_pil = Image.open(io.BytesIO(contents)).convert("RGB")
    image_np  = np.array(image_pil)
    image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)

    # Run MediaPipe Pose
    with mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5) as pose:
        results = pose.process(image_np)

    if not results.pose_landmarks:
        raise HTTPException(
            status_code=422,
            detail="Could not detect a person in the image. Please upload a clear full-body front-facing photo."
        )

    body_shape           = classify_body_shape(results.pose_landmarks)
    skin_tone, palette   = classify_skin_tone(image_np)

    return {
        "bodyShape":    body_shape,
        "skinTone":     skin_tone,
        "colorPalette": palette,
    }
