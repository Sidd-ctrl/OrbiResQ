import asyncio
import smtplib
from email.message import EmailMessage

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Incident, Notification

CHANNEL_LABELS = {
    "in_app": "In-app alerts",
    "telegram": "Telegram",
    "sms": "SMS (Twilio)",
    "email": "Email (SMTP)",
    "push": "Push notifications",
}


def channel_status() -> list[dict]:
    settings = get_settings()
    telegram_ready = bool(settings.telegram_bot_token and settings.telegram_chat_id)
    sms_ready = bool(
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_from_number
        and settings.alert_sms_to
    )
    email_ready = bool(settings.smtp_host and settings.smtp_from and settings.alert_email_to)
    return [
        {
            "channel": "in_app",
            "label": CHANNEL_LABELS["in_app"],
            "configured": True,
            "required_environment": [],
            "detail": "Stored in the notification log for every incident alert.",
        },
        {
            "channel": "telegram",
            "label": CHANNEL_LABELS["telegram"],
            "configured": telegram_ready,
            "required_environment": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
            "detail": "Bot API delivery." if telegram_ready else "Not configured; alerts remain in the in-app log.",
        },
        {
            "channel": "sms",
            "label": CHANNEL_LABELS["sms"],
            "configured": sms_ready,
            "required_environment": [
                "TWILIO_ACCOUNT_SID",
                "TWILIO_AUTH_TOKEN",
                "TWILIO_FROM_NUMBER",
                "ALERT_SMS_TO",
            ],
            "detail": "Twilio SMS delivery." if sms_ready else "Not configured; no SMS is sent.",
        },
        {
            "channel": "email",
            "label": CHANNEL_LABELS["email"],
            "configured": email_ready,
            "required_environment": ["SMTP_HOST", "SMTP_FROM", "ALERT_EMAIL_TO"],
            "detail": "SMTP delivery." if email_ready else "Not configured; no email is sent.",
        },
        {
            "channel": "push",
            "label": CHANNEL_LABELS["push"],
            "configured": False,
            "required_environment": ["PUSH_PROVIDER_KEY"],
            "detail": "Push delivery requires a provider key and registered device tokens.",
        },
    ]


def _message(incident: Incident) -> tuple[str, str]:
    location = ", ".join(part for part in [incident.city, incident.district, incident.state, incident.country] if part)
    title = f"{incident.severity} {incident.category.replace('_', ' ')} alert"
    body = (
        f"ORBI RESQ incident {incident.id[:8]} · {incident.category.replace('_', ' ')} · "
        f"severity {incident.severity} · {location or 'location unavailable'} · "
        f"status {incident.verification_status}"
    )
    return title, body


async def _send_telegram(title: str, body: str) -> None:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            json={"chat_id": settings.telegram_chat_id, "text": f"{title}\n{body}"},
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Telegram API responded {response.status_code}")


async def _send_sms(body: str) -> None:
    settings = get_settings()
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            url,
            data={"To": settings.alert_sms_to, "From": settings.twilio_from_number, "Body": body},
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Twilio responded {response.status_code}")


def _send_email(title: str, body: str) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["Subject"] = f"ORBI RESQ · {title}"
    message["From"] = settings.smtp_from
    message["To"] = settings.alert_email_to
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


async def dispatch_incident(db: Session, incident: Incident) -> list[Notification]:
    title, body = _message(incident)
    statuses = {item["channel"]: item for item in channel_status()}
    created: list[Notification] = []

    def record(channel: str, status: str, error: str | None = None) -> None:
        notification = Notification(
            incident_id=incident.id,
            channel=channel,
            severity=incident.severity,
            title=title,
            body=body,
            status=status,
            error=error,
        )
        db.add(notification)
        created.append(notification)

    record("in_app", "delivered")

    for channel in ("telegram", "sms", "email", "push"):
        if not statuses[channel]["configured"]:
            record(channel, "skipped_not_configured", statuses[channel]["detail"])
            continue
        try:
            if channel == "telegram":
                await _send_telegram(title, body)
            elif channel == "sms":
                await _send_sms(body)
            elif channel == "email":
                await asyncio.to_thread(_send_email, title, body)
            else:
                record(channel, "skipped_not_configured", statuses[channel]["detail"])
                continue
            record(channel, "sent")
        except Exception as exc:  # noqa: BLE001
            record(channel, "failed", str(exc)[:300])

    db.commit()
    return created
