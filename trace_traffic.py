import json
import time
import os
import sys
from datetime import datetime

# Colori ANSI per il terminale
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

LOG_FILE = "backend/traffic.jsonl"

def follow(thefile):
    """Generatore che legge le nuove righe man mano che vengono scritte (tail -f)"""
    thefile.seek(0, os.SEEK_END)
    while True:
        line = thefile.readline()
        if not line:
            time.sleep(0.1)
            continue
        yield line

def print_traffic():
    print(f"{Colors.HEADER}📡 AVVIO TRAFFIC INSPECTOR... In attesa di dati su {LOG_FILE}{Colors.ENDC}")
    
    # Assicura che il file esista
    if not os.path.exists(LOG_FILE):
        open(LOG_FILE, 'a').close()

    try:
        with open(LOG_FILE, "r") as f:
            # Opzionale: decommenta per leggere tutto lo storico all'avvio
            # f.seek(0)
            
            lines = follow(f)
            for line in lines:
                try:
                    entry = json.loads(line)
                    timestamp = entry.get("timestamp", "")[11:19] # Solo ora:min:sec
                    direction = entry.get("direction")
                    content = entry.get("content")

                    if direction == "IN":
                        print(f"
{Colors.BLUE}📥 [{timestamp}] REQUEST (Frontend -> Backend){Colors.ENDC}")
                        print(f"{Colors.BLUE}{json.dumps(content, indent=2)}{Colors.ENDC}")
                    
                    elif direction == "OUT":
                        # Filtriamo i messaggi di log lunghi per non intasare la vista
                        if "log" in content:
                            print(f"{Colors.YELLOW}📤 [{timestamp}] LOG: {content['log'][:100]}...{Colors.ENDC}")
                        elif "updateComponents" in content:
                            comps = content['updateComponents'].get('components', [])
                            print(f"{Colors.GREEN}📤 [{timestamp}] UI UPDATE ({len(comps)} components){Colors.ENDC}")
                            # Mostra solo ID e Tipo per brevità
                            summary = [{"id": c.get("id"), "type": c.get("component")} for c in comps]
                            print(f"{Colors.GREEN}{json.dumps(summary, indent=2)}{Colors.ENDC}")
                        elif "updateDataModel" in content:
                            print(f"{Colors.GREEN}📤 [{timestamp}] DATA UPDATE{Colors.ENDC}")
                            # Se è lo script intero, tronchiamolo per leggibilità
                            val = content['updateDataModel'].get('value', {})
                            if 'script' in val:
                                val['script'] = "<SCRIPT_JSON_TRUNCATED>"
                            print(f"{Colors.GREEN}{json.dumps(content, indent=2)}{Colors.ENDC}")
                        else:
                            print(f"{Colors.GREEN}📤 [{timestamp}] RESPONSE{Colors.ENDC}")
                            print(f"{Colors.GREEN}{json.dumps(content, indent=2)}{Colors.ENDC}")

                except json.JSONDecodeError:
                    pass
    except KeyboardInterrupt:
        print(f"
{Colors.FAIL}🛑 Inspector fermato.{Colors.ENDC}")

if __name__ == "__main__":
    print_traffic()
