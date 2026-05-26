"""
SMS notification service using Africa's Talking API.
"""
import os
import re
import logging

logger = logging.getLogger(__name__)

AT_USERNAME = os.environ.get("AT_USERNAME", "sandbox")
AT_API_KEY  = os.environ.get("AT_API_KEY",
              "atsk_d1439fe9c39f11cd639d2dc6dc272f16048a50c9dfc75aae3c72eed74da582cc7cd8a26b")

_initialized = False
_sms_client  = None


def _init():
    global _initialized, _sms_client
    if _initialized:
        return _sms_client
    try:
        import urllib3
        urllib3.disable_warnings()

        import requests
        # Only patch once
        if not getattr(requests.Session, '_ssl_patched', False):
            _orig = requests.Session.send
            def _patched(self, *args, **kwargs):
                kwargs['verify'] = False
                return _orig(self, *args, **kwargs)
            requests.Session.send = _patched
            requests.Session._ssl_patched = True

        import africastalking
        africastalking.initialize(AT_USERNAME, AT_API_KEY)
        _sms_client  = africastalking.SMS
        _initialized = True
        logger.info("Africa's Talking SMS initialized")
    except Exception as e:
        logger.error(f"SMS init error: {e}")
        _initialized = True   # don't retry on every call
        _sms_client  = None
    return _sms_client


def normalize_phone(phone: str) -> str:
    digits = re.sub(r'\D', '', str(phone).strip())
    if digits.startswith("250") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 10:
        return f"+250{digits[1:]}"
    if len(digits) == 9:
        return f"+250{digits}"
    return f"+{digits}" if digits else ""


def send_sms(to_phone: str, message: str, label: str = "") -> bool:
    """Send a single SMS. Returns True on success."""
    if not to_phone or to_phone.strip() in ("", "nan"):
        logger.warning(f"No phone number for {label}")
        return False

    sms = _init()
    if sms is None:
        logger.warning("SMS client not available")
        return False

    phone = normalize_phone(to_phone)
    if not phone:
        return False

    try:
        resp = sms.send(message, [phone])
        recipients = resp.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("status") == "Success":
            logger.info(f"SMS sent to {label} ({phone})")
            return True
        logger.warning(f"SMS failed for {phone}: {resp}")
        return False
    except Exception as e:
        logger.error(f"SMS error: {e}")
        return False


def send_request_sms(garage_phone, garage_name, user_name,
                     problem_type, urgency, user_address, user_phone=""):
    """Notify garage of a new service request."""
    urg = {"emergency": "EMERGENCY", "urgent": "URGENT", "normal": "Normal"}
    msg = (
        f"Smart Mechanic Finder - New Request!\n"
        f"Customer: {user_name}\n"
        f"Problem: {problem_type}\n"
        f"Urgency: {urg.get(urgency.lower(), urgency.upper())}\n"
        f"Location: {user_address or 'See dashboard'}\n"
        + (f"Phone: {user_phone}\n" if user_phone else "")
        + f"Login: http://127.0.0.1:5000/garage"
    )
    return send_sms(garage_phone, msg, garage_name)


def send_status_sms(user_phone, garage_name, status, problem_type):
    """Notify user when garage accepts, declines or completes their request."""
    if not user_phone:
        return False
    messages = {
        "accepted": (
            f"Smart Mechanic Finder\n"
            f"Good news! {garage_name} ACCEPTED your request.\n"
            f"Problem: {problem_type}\n"
            f"They will contact you or head to your location."
        ),
        "declined": (
            f"Smart Mechanic Finder\n"
            f"Sorry, {garage_name} is not available for your request.\n"
            f"Problem: {problem_type}\n"
            f"Please try another garage in the app."
        ),
        "completed": (
            f"Smart Mechanic Finder\n"
            f"{garage_name} marked your service COMPLETED.\n"
            f"Problem: {problem_type}\n"
            f"Please rate your experience in the app."
        ),
    }
    msg = messages.get(status)
    if not msg:
        return False
    return send_sms(user_phone, msg, f"user ({user_phone})")
