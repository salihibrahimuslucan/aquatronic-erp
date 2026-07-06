# src/data/*.json -> supabase/seed.sql (INSERT'ler).
# Anahtar gerektirmez: Salih SQL Editor'de schema.sql'den sonra calistirir.
# Kaynak: items.json (542 urun, store.js normalize kurallariyla) + bom-seed.json
#         + ops.json pool + outsource.json. activityLog TASINMAZ (bayat app-olay logu).
import json, pathlib, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
root = pathlib.Path(__file__).resolve().parent.parent
data = root / 'src' / 'data'

def q(v):
    if v is None: return 'null'
    return "'" + str(v).replace("'", "''") + "'"

def num(v, default=0):
    try:
        n = float(v)
        return int(n) if n == int(n) else n
    except (TypeError, ValueError):
        return default

items = json.loads((data / 'items.json').read_text(encoding='utf-8'))
boms = json.loads((data / 'bom-seed.json').read_text(encoding='utf-8'))
ops = json.loads((data / 'ops.json').read_text(encoding='utf-8'))
outsource = json.loads((data / 'outsource.json').read_text(encoding='utf-8'))

out = ['-- OTOMATIK URETILDI: tools/make_seed_sql.py — elle duzenleme',
       '-- Once schema.sql, sonra bu dosya (SQL Editor).', 'begin;']

# items — store.js normalizeItem kurallari (effectiveFamily = familyOrig ?? family ?? cat)
seen_names = {}
rows = []
for idx, r in enumerate(items):
    iid = r.get('id', idx)
    name = str(r.get('name') or '(isimsiz)').strip()
    # ad benzersizligi (DB unique): cakisan ada #id soneki
    key = name.lower()
    if key in seen_names:
        name = f'{name} (#{iid})'
    seen_names[key] = iid
    family = r.get('familyOrig') or r.get('family') or r.get('cat') or 'diger'
    rows.append('(' + ', '.join([
        str(int(iid)), q(name), q(family), q(r.get('cat') or ''),
        str(num(r.get('qty'))), str(num(r.get('critical', r.get('crt')))),
        q(r.get('note') or ''), q(r.get('photo') or None),
        ('null' if r.get('boxQty') in (None, '') else str(num(r.get('boxQty')))),
        ('null' if r.get('weight') in (None, '') else str(num(r.get('weight')))),
        q(r.get('tr') or name), ('true' if r.get('archived') else 'false'),
    ]) + ')')
out.append('insert into items (id, name, family, cat, qty, critical, note, photo, box_qty, weight, tr, archived) values')
out.append(',\n'.join(rows) + ';')
out.append("select setval(pg_get_serial_sequence('items','id'), (select max(id) from items));")

# boms
brows = []
for b in boms:
    for r in b['bom']:
        brows.append(f"({int(b['productId'])}, {int(r['itemId'])}, {int(r['qty'])})")
if brows:
    out.append('insert into boms (product_id, component_id, qty) values')
    out.append(',\n'.join(brows) + ';')

# pool_tests
prows = []
for p in (ops.get('pool') or []):
    prows.append('(' + ', '.join([
        q(p.get('device') or p.get('desc') or '-'), q(p.get('sn') or ''), q(p.get('desc') or ''),
        q(p.get('status') or ''), q(p.get('address') or ''),
        q(p.get('currentIdle') or ''), q(p.get('currentRun') or ''), q(p.get('height') or ''),
        q(p.get('startDate') or ''), q(p.get('endDate') or ''), q(p.get('notes') or ''),
    ]) + ')')
if prows:
    out.append('insert into pool_tests (device, sn, "desc", status, address, current_idle, current_run, height, start_date, end_date, notes) values')
    out.append(',\n'.join(prows) + ';')

# outsource_jobs
orows = []
for o in outsource:
    orows.append('(' + ', '.join([
        q(o.get('item') or ''), q(o.get('qty') if o.get('qty') not in (None, 0) else ''),
        q(o.get('status') or ''), q(o.get('reqDate') or ''), q(o.get('givenMat') or ''),
        q(o.get('receivedQty') or ''), q(o.get('receivedDate') or ''),
        q(o.get('price') or ''), q(o.get('note') or ''),
    ]) + ')')
if orows:
    out.append('insert into outsource_jobs (item, qty, status, req_date, given_mat, received_qty, received_date, price, note) values')
    out.append(',\n'.join(orows) + ';')

out.append('commit;')
dest = root / 'supabase' / 'seed.sql'
dest.write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'OK: {len(rows)} item, {len(brows)} bom, {len(prows)} pool, {len(orows)} fason -> {dest}')
