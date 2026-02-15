import subprocess
import json
import time
import sys
import re
from datetime import datetime

# Configurazione
SERVICE_NAME = "infographic-agent-pro"  # Sostituisci se il nome del servizio Cloud Run è diverso
POLL_INTERVAL = 2  # Secondi tra ogni check (per evitare rate limit)

class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def get_logs(last_timestamp=None):
    """Chiama gcloud per ottenere i log recenti."""
    cmd = [
        "gcloud", "logging", "read",
        f'resource.type="cloud_run_revision" AND jsonPayload.tag="TRAFFIC_DEBUG"',
        "--limit=20",
        "--format=json",
        "--order=asc"  # Dal più vecchio al più recente
    ]
    
    if last_timestamp:
        # Filtra solo i nuovi log
        cmd[3] += f' AND timestamp>"{last_timestamp}"'

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"{Colors.FAIL}Errore gcloud: {result.stderr}{Colors.ENDC}")
            return []
        return json.loads(result.stdout)
    except Exception as e:
        print(f"{Colors.FAIL}Eccezione: {e}{Colors.ENDC}")
        return []

def format_log(entry):
    payload = entry.get('jsonPayload', {})
    if not payload: return

    timestamp = entry.get('timestamp', '')[11:19] # Ora:Min:Sec
    direction = payload.get('direction')
    content = payload.get('content')

    if direction == "IN":
        print(f"
{Colors.BLUE}📥 [{timestamp}] CLOUD REQUEST (Frontend -> Backend){Colors.ENDC}")
        print(f"{Colors.BLUE}{json.dumps(content, indent=2)}{Colors.ENDC}")
    
    elif direction == "OUT":
        if "log" in content:
            print(f"{Colors.YELLOW}📤 [{timestamp}] LOG: {content['log'][:100]}...{Colors.ENDC}")
        elif "updateComponents" in content:
            comps = content['updateComponents'].get('components', [])
            print(f"{Colors.GREEN}📤 [{timestamp}] UI UPDATE ({len(comps)} components){Colors.ENDC}")
            summary = [{"id": c.get("id"), "type": c.get("component")} for c in comps]
            print(f"{Colors.GREEN}{json.dumps(summary, indent=2)}{Colors.ENDC}")
        elif "updateDataModel" in content:
            print(f"{Colors.GREEN}📤 [{timestamp}] DATA UPDATE{Colors.ENDC}")
            val = content['updateDataModel'].get('value', {})
            # Tronchiamo script lunghi
            if 'script' in val: val['script'] = "<SCRIPT_JSON_TRUNCATED>"
            print(f"{Colors.GREEN}{json.dumps(content, indent=2)}{Colors.ENDC}")
        else:
            print(f"{Colors.GREEN}📤 [{timestamp}] RESPONSE{Colors.ENDC}")
            print(f"{Colors.GREEN}{json.dumps(content, indent=2)}{Colors.ENDC}")

def main():
    print(f"{Colors.HEADER}📡 AVVIO REMOTE TRAFFIC INSPECTOR... Collegamento a Google Cloud Logging{Colors.ENDC}")
    print(f"{Colors.HEADER}⏳ In attesa di traffico taggato 'TRAFFIC_DEBUG'... (Premi Ctrl+C per uscire){Colors.ENDC}")
    
    last_ts = datetime.utcnow().isoformat() + "Z"

    try:
        while True:
            logs = get_logs(last_ts)
            if logs:
                # Aggiorna il timestamp per la prossima chiamata
                last_ts = logs[-1].get('timestamp')
                for log in logs:
                    format_log(log)
            
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print(f"
{Colors.FAIL}🛑 Inspector fermato.{Colors.ENDC}")

if __name__ == "__main__":
    main()
