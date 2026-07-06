# Verilen SQL dosyasini canli Supabase DB'ye uygular (migrasyonlar icin).
# Kullanim: python tools/run_sql.py supabase/migrate_XXXX.sql
import pathlib, sys
import psycopg

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
root = pathlib.Path(__file__).resolve().parent.parent

def read_env():
    env = {}
    for line in (root / '.env').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env

if len(sys.argv) < 2:
    print('kullanim: python tools/run_sql.py <dosya.sql>'); sys.exit(1)

sql_path = root / sys.argv[1]
sql = sql_path.read_text(encoding='utf-8')
url = read_env()['SUPABASE_DB_URL']
conn = psycopg.connect(url, connect_timeout=12)
print(f"baglandi: {url.split('@')[1].split(':')[0]}")
with conn:
    with conn.cursor() as cur:
        print(f'{sql_path.name} calisiyor ({len(sql)} bayt)...')
        cur.execute(sql)
        print('OK')
conn.close()
