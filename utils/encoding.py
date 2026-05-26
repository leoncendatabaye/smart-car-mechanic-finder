from typing import Dict


URGENCY_MAP: Dict[str, int] = {
    "normal": 1,
    "urgent": 2,
    "emergency": 3,
}


def encode_urgency(urgency: str) -> int:
    return URGENCY_MAP.get((urgency or "").strip().lower(), 1)


def decode_urgency(value: int) -> str:
    reverse = {v: k for k, v in URGENCY_MAP.items()}
    return reverse.get(value, "normal")
