#!/usr/bin/env python3
import base64
import datetime
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
UTC = ZoneInfo("UTC")

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_DIR, "data")
KEY_FILE = os.path.expanduser("~/.calendar_sync_key")
ENC_KEY = (
    os.environ.get("CALENDAR_SYNC_KEY")
    or (open(KEY_FILE, encoding="utf-8").read().strip() if os.path.exists(KEY_FILE) else "")
)
GAS_URL = "https://script.google.com/macros/s/AKfycbw_mFpl1rQ8ryU4M6s9I56vntGiwf85zMlGwgf_-NZR57rcFHt3uEl59VZyqOQ7bM5ftQ/exec"


def rc4_crypt(data: bytes, key_str: str) -> bytes:
    key = key_str.encode("utf-8")
    S = list(range(256))
    j = 0
    for i in range(256):
        j = (j + S[i] + key[i % len(key)]) & 0xFF
        S[i], S[j] = S[j], S[i]
    i = 0
    j = 0
    # Drop first 1024 bytes of keystream
    for _ in range(1024):
        i = (i + 1) & 0xFF
        j = (j + S[i]) & 0xFF
        S[i], S[j] = S[j], S[i]
    out = bytearray(len(data))
    for k, b in enumerate(data):
        i = (i + 1) & 0xFF
        j = (j + S[i]) & 0xFF
        S[i], S[j] = S[j], S[i]
        out[k] = b ^ S[(S[i] + S[j]) & 0xFF]
    return bytes(out)


def encrypt_events(events: list[dict], year: int, month: int) -> str:
    raw = json.dumps(events, ensure_ascii=False).encode("utf-8")
    salted_key = f"{ENC_KEY}:{year:04d}-{month:02d}"
    cipher = rc4_crypt(raw, salted_key)
    return base64.b64encode(cipher).decode("ascii")


def unescape_ics_text(val: str) -> str:
    if not val:
        return ""
    val = val.replace("\\n", "\n").replace("\\N", "\n")
    val = val.replace("\\,", ",").replace("\\;", ";")
    val = val.replace("\\\\", "\\")
    return val


def unfold_ics(content: str) -> list[str]:
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    unfolded = re.sub(r"\n[ \t]", "", content)
    return unfolded.split("\n")


def parse_ics_datetime(prop_key: str, prop_val: str):
    val = prop_val.strip()
    if "VALUE=DATE" in prop_key.upper() or re.fullmatch(r"\d{8}", val):
        d = datetime.date(int(val[0:4]), int(val[4:6]), int(val[6:8]))
        return True, d

    m = re.match(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$", val)
    if not m:
        raise ValueError(f"Unrecognized datetime format: {prop_key}:{prop_val}")
    yr, mo, da, hr, mi, se, is_utc = m.groups()
    if is_utc == "Z":
        dt_utc = datetime.datetime(
            int(yr), int(mo), int(da), int(hr), int(mi), int(se), tzinfo=UTC
        )
        return False, dt_utc.astimezone(KST)
    else:
        return False, datetime.datetime(
            int(yr), int(mo), int(da), int(hr), int(mi), int(se), tzinfo=KST
        )


def parse_ics_file(content: str, filename: str) -> list[dict]:
    if filename.startswith("Birthdays_"):
        return []

    lines = unfold_ics(content)
    cal_name = "일정"
    for line in lines:
        if line.startswith("X-WR-CALNAME:"):
            cal_name = unescape_ics_text(line.split(":", 1)[1].strip())
            break

    if cal_name in ("대한민국의 휴일", "Tasks", "생일"):
        return []

    raw_events = []
    in_event = False
    in_alarm = False
    curr = {}

    for line in lines:
        if line == "BEGIN:VEVENT":
            in_event = True
            in_alarm = False
            curr = {"EXDATE": []}
            continue
        elif line == "END:VEVENT":
            if in_event:
                raw_events.append(curr)
            in_event = False
            continue
        elif line == "BEGIN:VALARM":
            in_alarm = True
            continue
        elif line == "END:VALARM":
            in_alarm = False
            continue

        if not in_event or in_alarm or ":" not in line:
            continue

        k, v = line.split(":", 1)
        base_k = k.split(";", 1)[0].upper()
        if base_k == "EXDATE":
            curr["EXDATE"].append((k, v))
        elif base_k in ("DTSTART", "DTEND", "RECURRENCE-ID"):
            curr[base_k] = (k, v)
        elif base_k in ("UID", "SUMMARY", "DESCRIPTION", "LOCATION", "STATUS", "RRULE"):
            curr[base_k] = v

    overridden_dates = set()
    for ev in raw_events:
        if "RECURRENCE-ID" in ev and "UID" in ev:
            try:
                _, dt_obj = parse_ics_datetime(*ev["RECURRENCE-ID"])
                d_str = (
                    dt_obj.strftime("%Y-%m-%d")
                    if isinstance(dt_obj, (datetime.date, datetime.datetime))
                    else ""
                )
                overridden_dates.add((ev["UID"], d_str))
            except Exception:
                pass

    parsed_events = []

    for ev in raw_events:
        if ev.get("STATUS", "").upper() == "CANCELLED":
            continue
        if "DTSTART" not in ev:
            continue

        try:
            is_all_day, start_obj = parse_ics_datetime(*ev["DTSTART"])
        except Exception:
            continue

        if "DTEND" in ev:
            try:
                _, end_obj = parse_ics_datetime(*ev["DTEND"])
            except Exception:
                end_obj = start_obj
        else:
            end_obj = start_obj

        if is_all_day:
            if isinstance(end_obj, datetime.datetime):
                end_obj = end_obj.date()
            if isinstance(start_obj, datetime.datetime):
                start_obj = start_obj.date()
            end_inclusive = end_obj - datetime.timedelta(days=1)
            if end_inclusive < start_obj:
                end_inclusive = start_obj
            duration = end_inclusive - start_obj
        else:
            duration = end_obj - start_obj

        uid = ev.get("UID", "")
        subject = unescape_ics_text(ev.get("SUMMARY", "")) or "(제목 없음)"
        description = unescape_ics_text(ev.get("DESCRIPTION", ""))
        location = unescape_ics_text(ev.get("LOCATION", ""))

        exdates = set()
        for ex_k, ex_v in ev.get("EXDATE", []):
            for part in ex_v.split(","):
                try:
                    _, ex_dt = parse_ics_datetime(ex_k, part)
                    exdates.add(ex_dt.strftime("%Y-%m-%d"))
                except Exception:
                    pass

        instances = []
        rrule = ev.get("RRULE", "")
        max_expand_year = datetime.datetime.now(KST).year + 5
        if rrule and "FREQ=YEARLY" in rrule and "RECURRENCE-ID" not in ev:
            until_date = datetime.date(max_expand_year, 12, 31)
            m_until = re.search(r"UNTIL=(\d{4})(\d{2})(\d{2})", rrule)
            if m_until:
                until_date = datetime.date(
                    int(m_until.group(1)), int(m_until.group(2)), int(m_until.group(3))
                )
            start_yr = start_obj.year
            for yr in range(max(start_yr, 2020), min(until_date.year, max_expand_year) + 1):
                try:
                    inst_start = start_obj.replace(year=yr)
                except ValueError:
                    inst_start = start_obj.replace(year=yr, day=28)
                inst_date = (
                    inst_start.date()
                    if isinstance(inst_start, datetime.datetime)
                    else inst_start
                )
                if inst_date > until_date:
                    continue
                d_str = inst_date.strftime("%Y-%m-%d")
                if d_str in exdates or (uid, d_str) in overridden_dates:
                    continue
                instances.append((inst_start, inst_start + duration))
        else:
            instances.append((start_obj, start_obj + duration))

        for s_obj, e_obj in instances:
            s_date_str = s_obj.strftime("%Y-%m-%d")
            e_date_str = e_obj.strftime("%Y-%m-%d")
            if is_all_day:
                s_time_str = ""
                e_time_str = ""
            else:
                s_time_str = s_obj.strftime("%H:%M")
                e_time_str = e_obj.strftime("%H:%M")
                if (
                    e_time_str == "00:00"
                    and (e_obj.date() - s_obj.date()).days == 1
                ):
                    e_date_str = s_date_str

            ev_id = uid if len(instances) == 1 else f"{uid}_{s_date_str}"
            parsed_events.append(
                {
                    "id": ev_id,
                    "subject": subject,
                    "description": description,
                    "location": location,
                    "category": cal_name,
                    "startDate": s_date_str,
                    "endDate": e_date_str,
                    "startTime": s_time_str,
                    "endTime": e_time_str,
                    "isAllDay": is_all_day,
                    "isMultiDay": s_date_str != e_date_str,
                }
            )

    return parsed_events


def write_encrypted_month(yr: int, mo: int, month_events: list[dict]):
    os.makedirs(DATA_DIR, exist_ok=True)
    month_events.sort(
        key=lambda x: (x["startDate"], x["startTime"] or "", x["subject"], x["id"])
    )
    payload = {
        "year": yr,
        "month": mo,
        "enc": encrypt_events(month_events, yr, mo),
    }
    out_path = os.path.join(DATA_DIR, f"{yr:04d}-{mo:02d}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def build_monthly_files(zip_path: str, start_year: int = 2024, end_year: int | None = None):
    if end_year is None:
        # 매년 현재 연도 기준 +3년까지 자동 확장 (해가 바뀌면 자동으로 2028, 2029, 2030... 생성)
        end_year = datetime.datetime.now(KST).year + 3

    all_events = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if not name.endswith(".ics"):
                continue
            raw_bytes = zf.read(name)
            content = raw_bytes.decode("utf-8", errors="replace")
            all_events.extend(parse_ics_file(content, os.path.basename(name)))

    # 만약 더 먼 미래(예: 2032년 등)에 등록된 일정이 있으면 그 해까지 자동 포함
    for ev in all_events:
        try:
            ev_yr = int(ev["endDate"][:4])
            if 2020 <= ev_yr <= 2100 and ev_yr > end_year:
                end_year = ev_yr
        except Exception:
            pass

    total_written = 0
    for yr in range(start_year, end_year + 1):
        for mo in range(1, 13):
            first_day = f"{yr:04d}-{mo:02d}-01"
            if mo == 12:
                next_month_first = datetime.date(yr + 1, 1, 1)
            else:
                next_month_first = datetime.date(yr, mo + 1, 1)
            last_day = (next_month_first - datetime.timedelta(days=1)).strftime(
                "%Y-%m-%d"
            )
            month_events = [
                ev
                for ev in all_events
                if ev["endDate"] >= first_day and ev["startDate"] <= last_day
            ]
            write_encrypted_month(yr, mo, month_events)
            total_written += 1

    return len(all_events), total_written


def sync_from_gas() -> bool:
    """Try syncing current and surrounding months directly from GAS via HTTP."""
    now = datetime.datetime.now(KST)
    months_to_sync = []
    for offset in (-1, 0, 1, 2):
        m = now.month + offset
        y = now.year
        while m < 1:
            m += 12
            y -= 1
        while m > 12:
            m -= 12
            y += 1
        months_to_sync.append((y, m))

    synced_any = False
    for y, m in months_to_sync:
        url = f"{GAS_URL}?month={y:04d}-{m:02d}&key={ENC_KEY}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    if isinstance(data, dict) and "events" in data:
                        write_encrypted_month(y, m, data["events"])
                        synced_any = True
        except Exception:
            return False
    return synced_any


def download_ical_via_chrome(target_zip: str) -> bool:
    downloads_dir = os.path.expanduser("~/Downloads")
    for old_f in glob.glob(os.path.join(downloads_dir, "bestlook87@gmail.com*.ical.zip")):
        try:
            os.remove(old_f)
        except OSError:
            pass

    apple_script = '''
    tell application "Google Chrome"
        if (count of windows) is 0 then
            return "NO_WINDOW"
        end if
        set t to make new tab at end of tabs of front window with properties {URL:"https://calendar.google.com/calendar/u/0/exporticalzip"}
        delay 6
        try
            if URL of t is "about:blank" or URL of t contains "exporticalzip" then
                close t
            end if
        end try
        return "OK"
    end tell
    '''
    res = subprocess.run(["osascript", "-e", apple_script], capture_output=True, text=True)
    if res.returncode != 0:
        return False

    for _ in range(10):
        matches = glob.glob(os.path.join(downloads_dir, "bestlook87@gmail.com*.ical.zip"))
        if matches:
            latest = max(matches, key=os.path.getmtime)
            if os.path.getsize(latest) > 1000:
                shutil.move(latest, target_zip)
                return True
        time.sleep(1)
    return False


def auto_sync():
    if sync_from_gas():
        print("Synced latest months via GAS.")
    else:
        zip_path = "/tmp/ical_autosync.zip"
        if not download_ical_via_chrome(zip_path):
            print("Failed to sync via GAS or Chrome.")
            return 1
        ev_count, file_count = build_monthly_files(zip_path)
        try:
            os.remove(zip_path)
        except OSError:
            pass
        print(f"Synced {ev_count} events into {file_count} encrypted monthly files.")

    status = subprocess.run(
        ["git", "status", "--porcelain", "data/"],
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
    )
    if status.stdout.strip():
        subprocess.run(["git", "add", "data/"], cwd=REPO_DIR, check=True)
        now_str = datetime.datetime.now(KST).strftime("%Y-%m-%d %H:%M")
        subprocess.run(
            ["git", "commit", "-m", f"chore: auto-sync encrypted calendar data ({now_str})"],
            cwd=REPO_DIR,
            check=True,
        )
        subprocess.run(["git", "push", "origin", "main"], cwd=REPO_DIR, check=True)
        print("Pushed updated encrypted calendar JSON files to GitHub.")
    else:
        print("No calendar changes to push.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--auto-sync":
        sys.exit(auto_sync())
    zip_file = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ical.zip"
    ev_count, file_count = build_monthly_files(zip_file)
    print(f"Parsed and encrypted {ev_count} total events across {file_count} monthly JSON files.")
