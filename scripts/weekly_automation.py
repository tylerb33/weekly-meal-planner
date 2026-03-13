#!/usr/bin/env python3
import glob
import json
import os
import smtplib
import subprocess
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

REPO = Path('/home/dubbz1/Desktop/Dev/weekly-meal-planner')
OUT = REPO / 'out'
SECRETS_ENV = Path.home() / '.config' / 'openclaw' / 'secrets.env'


def run_weekly_pipeline():
    subprocess.run(['npm', 'run', 'weekly:run'], cwd=REPO, check=True)


def get_latest_plan_markdown() -> Path:
    candidates = sorted(glob.glob(str(OUT / 'weekly-plan-*.md')))
    if not candidates:
        raise RuntimeError('No weekly plan markdown output found')
    return Path(candidates[-1])


def load_local_env_if_needed():
    if os.getenv('BWS_ACCESS_TOKEN'):
      return
    if not SECRETS_ENV.exists():
      return
    for line in SECRETS_ENV.read_text().splitlines():
      line = line.strip()
      if not line or line.startswith('#') or '=' not in line:
        continue
      k, v = line.split('=', 1)
      if k and v and k not in os.environ:
        os.environ[k] = v.strip()


def get_bws_secret(key: str) -> str:
    load_local_env_if_needed()
    out = subprocess.check_output(['bws', 'secret', 'list', '--output', 'json'], text=True)
    arr = json.loads(out)
    for s in arr:
        if s.get('key') == key:
            return (s.get('value') or '').strip()
    raise RuntimeError(f'Missing bws secret: {key}')


def send_email(plan_md: Path):
    user = get_bws_secret('GMAIL_USERNAME')
    app_pw = get_bws_secret('GMAIL_APP_PASSWORD').replace(' ', '')
    to = os.getenv('WEEKLY_MEAL_EMAIL_TO', 'tyler.barnett7190@gmail.com').strip()

    body = plan_md.read_text()
    today = datetime.now().strftime('%Y-%m-%d')

    msg = EmailMessage()
    msg['From'] = user
    msg['To'] = to
    msg['Subject'] = f'Weekly Meal Plan + Shopping List ({today})'
    msg.set_content(body)

    with smtplib.SMTP('smtp.gmail.com', 587, timeout=30) as s:
        s.starttls()
        s.login(user, app_pw)
        s.send_message(msg)


def main():
    run_weekly_pipeline()
    md = get_latest_plan_markdown()
    send_email(md)
    print(json.dumps({'ok': True, 'sent': True, 'plan': str(md)}))


if __name__ == '__main__':
    main()
