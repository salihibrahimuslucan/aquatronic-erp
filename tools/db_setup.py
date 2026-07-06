# supabase/schema.sql + seed.sql'i veritabanina kurar ve dogrular.
# Baglanti .env'deki SUPABASE_DB_URL; direkt host IPv6 gerektirirse
# otomatik olarak IPv4 pooler'a (session mode, 5432) duser.
# Kullanim: python tools/db_setup.py [--schema-only|--seed-only]
import pathlib, re, sys
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

env = read_env()
# .env'deki URL calisan session-pooler adresi (proje eu-west-1/Irlanda;
# direkt db.<ref> host'u IPv6-only, bu agdan erisilemiyor)
url = env['SUPABASE_DB_URL']
try:
    conn = psycopg.connect(url, connect_timeout=12)
    print(f"baglandi: {url.split('@')[1].split(':')[0]}")
except Exception as e:
    print(f'HATA: baglanti kurulamadi: {str(e)[:200]}'); sys.exit(1)

mode = sys.argv[1] if len(sys.argv) > 1 else ''
files = []
if mode != '--seed-only': files.append('schema.sql')
if mode != '--schema-only': files.append('seed.sql')

with conn:
    with conn.cursor() as cur:
        for f in files:
            sql = (root / 'supabase' / f).read_text(encoding='utf-8')
            print(f'{f} calisiyor ({len(sql)//1024} KB)...')
            cur.execute(sql)
            print(f'{f} OK')
        cur.execute("""
            select 'items', count(*) from items
            union all select 'boms', count(*) from boms
            union all select 'pool_tests', count(*) from pool_tests
            union all select 'outsource_jobs', count(*) from outsource_jobs
            union all select 'stock_moves', count(*) from stock_moves""")
        for name, n in cur.fetchall():
            print(f'  {name}: {n}')
conn.close()
print('KURULUM TAMAM')
