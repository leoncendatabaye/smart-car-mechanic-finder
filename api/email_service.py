"""
Email notification service using Gmail SMTP.
Sends emails to garage and user for service request events.

Setup:
1. Use a Gmail account
2. Enable 2-Factor Authentication on that Gmail
3. Go to Google Account → Security → App Passwords
4. Create an App Password for "Mail"
5. Set EMAIL_ADDRESS and EMAIL_PASSWORD below (or as env vars)
"""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
EMAIL_ADDRESS  = os.environ.get("EMAIL_ADDRESS",  "your_gmail@gmail.com")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "your_app_password_here")
EMAIL_FROM     = f"Smart Mechanic Finder <{EMAIL_ADDRESS}>"
APP_BASE_URL   = os.environ.get("APP_BASE_URL",   "http://127.0.0.1:5000")


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email. Returns True on success."""
    if not to or "@" not in to:
        logger.warning(f"Invalid email address: {to}")
        return False
    if EMAIL_ADDRESS == "your_gmail@gmail.com":
        logger.warning("Email not configured — skipping")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = EMAIL_FROM
        msg["To"]      = to
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.sendmail(EMAIL_ADDRESS, to, msg.as_string())

        logger.info(f"Email sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Email error to {to}: {e}")
        return False


def _base_template(content: str) -> str:
    return f"""
    <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f4f6f9;padding:20px">
      <div style="background:#1f4fd6;padding:20px;border-radius:10px 10px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:1.4rem">🔧 Smart Mechanic Finder</h1>
      </div>
      <div style="background:white;padding:24px;border-radius:0 0 10px 10px;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
        {content}
        <hr style="border:none;border-top:1px solid #f0f0f0;margin:20px 0">
        <p style="color:#aaa;font-size:0.8rem;text-align:center">
          Smart Mechanic Finder — Rwanda's AI-powered mechanic recommendation system
        </p>
      </div>
    </div>
    """


# ── Garage: new request notification ─────────────────────────────────────────
def email_garage_new_request(garage_email: str, garage_name: str, user_name: str,
                              user_phone: str, problem_type: str, urgency: str,
                              user_address: str) -> bool:
    urgency_colors = {"emergency": "#e74c3c", "urgent": "#e67e22", "normal": "#27ae60"}
    urg_color = urgency_colors.get(urgency.lower(), "#1f4fd6")

    content = f"""
        <h2 style="color:#12263a;margin-top:0">🚗 New Service Request</h2>
        <p>Hello <strong>{garage_name}</strong>,</p>
        <p>A customer has sent you a service request through Smart Mechanic Finder.</p>

        <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#7a8fa6;width:40%">👤 Customer</td><td style="padding:6px 0;font-weight:600">{user_name}</td></tr>
            <tr><td style="padding:6px 0;color:#7a8fa6">📞 Phone</td><td style="padding:6px 0">{user_phone or '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#7a8fa6">🔧 Problem</td><td style="padding:6px 0;font-weight:600">{problem_type}</td></tr>
            <tr><td style="padding:6px 0;color:#7a8fa6">⚡ Urgency</td><td style="padding:6px 0"><span style="color:{urg_color};font-weight:700;text-transform:uppercase">{urgency}</span></td></tr>
            <tr><td style="padding:6px 0;color:#7a8fa6">📍 Location</td><td style="padding:6px 0">{user_address or 'See dashboard'}</td></tr>
          </table>
        </div>

        <p>Please log in to your dashboard to accept or decline this request.</p>
        <div style="text-align:center;margin:20px 0">
          <a href="{APP_BASE_URL}/garage" style="background:#16a085;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:1rem">
            🔓 Open Dashboard
          </a>
        </div>
    """
    return send_email(garage_email, f"🚗 New Request: {problem_type} — {user_name}", _base_template(content))


# ── User: status update notification ─────────────────────────────────────────
def email_user_status(user_email: str, user_name: str, garage_name: str,
                      problem_type: str, status: str) -> bool:
    if status == "accepted":
        icon, color, headline = "✅", "#27ae60", "Request Accepted!"
        body = f"""
            <p>Great news, <strong>{user_name}</strong>!</p>
            <p><strong>{garage_name}</strong> has <span style="color:#27ae60;font-weight:700">accepted</span> your service request.</p>
            <p>They will contact you shortly or head to your location.</p>
        """
    elif status == "declined":
        icon, color, headline = "❌", "#e74c3c", "Request Declined"
        body = f"""
            <p>Hello <strong>{user_name}</strong>,</p>
            <p>Unfortunately, <strong>{garage_name}</strong> is currently <span style="color:#e74c3c;font-weight:700">not available</span> for your request.</p>
            <p>Please open the app and try requesting another nearby garage.</p>
            <div style="text-align:center;margin:20px 0">
              <a href="{APP_BASE_URL}/home" style="background:#1f4fd6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
                🔍 Find Another Garage
              </a>
            </div>
        """
    elif status == "completed":
        icon, color, headline = "🏁", "#2980b9", "Service Completed!"
        body = f"""
            <p>Hello <strong>{user_name}</strong>,</p>
            <p><strong>{garage_name}</strong> has marked your service as <span style="color:#2980b9;font-weight:700">completed</span>.</p>
            <p>We hope everything went well! Please take a moment to rate your experience.</p>
            <div style="text-align:center;margin:20px 0">
              <a href="{APP_BASE_URL}/my-requests" style="background:#f39c12;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
                ⭐ Rate Your Experience
              </a>
            </div>
        """
    else:
        return False

    content = f"""
        <div style="text-align:center;margin-bottom:16px">
          <span style="font-size:2.5rem">{icon}</span>
          <h2 style="color:{color};margin:8px 0">{headline}</h2>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;margin-bottom:16px">
          <div style="color:#7a8fa6;font-size:0.85rem">Service Request</div>
          <div style="font-weight:600">{problem_type} at {garage_name}</div>
        </div>
        {body}
    """
    subjects = {
        "accepted":  f"✅ {garage_name} accepted your request",
        "declined":  f"❌ {garage_name} is not available",
        "completed": f"🏁 Service completed by {garage_name}",
    }
    return send_email(user_email, subjects[status], _base_template(content))


# ── User: registration welcome ────────────────────────────────────────────────
def email_welcome_user(user_email: str, user_name: str) -> bool:
    content = f"""
        <h2 style="color:#12263a;margin-top:0">Welcome to Smart Mechanic Finder! 🎉</h2>
        <p>Hello <strong>{user_name}</strong>,</p>
        <p>Your account has been created successfully. You can now:</p>
        <ul style="color:#4a5d73;line-height:1.8">
          <li>🔍 Find the best nearby mechanics using AI ranking</li>
          <li>🚗 Send service requests directly to garages</li>
          <li>📍 Share your location for faster service</li>
          <li>⭐ Rate mechanics after service</li>
        </ul>
        <div style="text-align:center;margin:20px 0">
          <a href="{APP_BASE_URL}/home" style="background:#1f4fd6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            🔍 Find a Mechanic Now
          </a>
        </div>
    """
    return send_email(user_email, "Welcome to Smart Mechanic Finder! 🔧", _base_template(content))


# ── Garage: registration confirmation ────────────────────────────────────────
def email_garage_registered(garage_email: str, garage_name: str) -> bool:
    content = f"""
        <h2 style="color:#12263a;margin-top:0">Registration Received! 🔧</h2>
        <p>Hello <strong>{garage_name}</strong>,</p>
        <p>Your garage registration has been submitted successfully.</p>
        <div style="background:#fff8e1;border:1px solid #f0c040;border-radius:8px;padding:14px;margin:16px 0">
          <strong>⏳ Pending Verification</strong><br>
          <span style="color:#7a5c00">An admin will review your account within 24 hours. You will receive another email once verified.</span>
        </div>
        <p>Once verified, you can log in to your dashboard to receive and manage service requests from customers.</p>
    """
    return send_email(garage_email, "Garage Registration Received — Smart Mechanic Finder", _base_template(content))


# ── Garage: verification approved ────────────────────────────────────────────
def email_garage_verified(garage_email: str, garage_name: str) -> bool:
    content = f"""
        <h2 style="color:#27ae60;margin-top:0">✅ Your Garage is Verified!</h2>
        <p>Hello <strong>{garage_name}</strong>,</p>
        <p>Your garage account has been <strong style="color:#27ae60">verified</strong> by our admin team.</p>
        <p>You can now log in to your dashboard to start receiving service requests from customers.</p>
        <div style="text-align:center;margin:20px 0">
          <a href="{APP_BASE_URL}/garage" style="background:#16a085;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            🔓 Login to Dashboard
          </a>
        </div>
    """
    return send_email(garage_email, "✅ Your Garage Account is Verified!", _base_template(content))
