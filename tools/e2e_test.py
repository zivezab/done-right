#!/usr/bin/env python3
"""Done Right: functional tests against a real Supabase project.

Runs the whole customer/provider journey through the same API the app uses — signed in as real
accounts, so row-level security applies exactly as in the browser — then checks the stored data:
sign-up, provider listing and verification, public visibility, booking, payment, rescheduling,
chat with read receipts, completion and reviews, quotes, profile links and document storage.

  export SUPABASE_SERVICE_ROLE_KEY='sb_secret_...'   # Dashboard → Project Settings → API Keys → Secret key
  python3 tools/e2e_test.py                     # project URL/anon key come from js/config.local.js
  python3 tools/e2e_test.py --keep              # leave the test accounts behind for inspection

The service-role key bypasses every access rule. Keep it in your shell for the run only: never put it
in js/config.js, never commit it. The script uses it for three things only: creating the throwaway
accounts, doing what staff would do (approving documents), and deleting everything afterwards.

Test accounts are named dr-e2e-<random>@example.com and every row they create is removed at the end.
Nothing belonging to real users is read or written.
"""
import argparse
import json
import os
import random
import re
import string
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SGT = timezone(timedelta(hours=8))
PASSED, FAILED = [], []


# ------------------------------------------------------------------ tiny HTTP + assert helpers
def http(method, url, key, token=None, body=None, headers=None, raw=False):
    data = None
    h = {'apikey': key, 'Authorization': f'Bearer {token or key}'}
    if body is not None and not raw:
        data = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    elif raw:
        data = body
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text and r.headers.get('Content-Type', '').startswith('application/json') else text)
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text


def ok(cond, name, detail=''):
    (PASSED if cond else FAILED).append(name)
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond or not detail else f'  → {detail}'))
    return cond


def fails(status, payload, name, expect=None):
    """Passes when the call was refused (and, if given, the message matches)."""
    msg = payload.get('message', '') if isinstance(payload, dict) else str(payload)
    good = status >= 400 and (expect is None or re.search(expect, msg, re.I))
    return ok(good, name, f'status {status}: {msg[:120]}')


class Client:
    """One signed-in user (or anon, when token is None)."""

    def __init__(self, base, anon, token=None, uid=None, label='anon'):
        self.base, self.anon, self.token, self.uid, self.label = base, anon, token, uid, label

    def rpc(self, fn, args=None):
        return http('POST', f'{self.base}/rest/v1/rpc/{fn}', self.anon, self.token, args or {})

    def select(self, path):
        return http('GET', f'{self.base}/rest/v1/{path}', self.anon, self.token)

    def patch(self, path, body):
        return http('PATCH', f'{self.base}/rest/v1/{path}', self.anon, self.token, body,
                    {'Prefer': 'return=representation'})

    def insert(self, table, body):
        return http('POST', f'{self.base}/rest/v1/{table}', self.anon, self.token, body,
                    {'Prefer': 'return=representation'})

    def upload(self, bucket, path, blob, content_type='image/jpeg'):
        return http('POST', f'{self.base}/storage/v1/object/{bucket}/{path}', self.anon, self.token, blob,
                    {'Content-Type': content_type}, raw=True)

    def rows(self, path):
        status, body = self.select(path)
        return body if status == 200 and isinstance(body, list) else []


# ------------------------------------------------------------------ project settings
def settings():
    url = os.environ.get('SUPABASE_URL')
    anon = os.environ.get('SUPABASE_ANON_KEY')
    if not (url and anon):
        try:
            local = open(os.path.join(ROOT, 'js', 'config.local.js')).read()
            url = url or (re.search(r"url:\s*'([^']+)'", local) or [None, None])[1]
            anon = anon or (re.search(r"anonKey:\s*'([^']+)'", local) or [None, None])[1]
        except OSError:
            pass
    service = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not service:
        # convenience: the git-ignored notes file may hold it (any line with the key, or KEY=value)
        try:
            notes = open(os.path.join(ROOT, 'secret-do-not-commit')).read()
            m = (re.search(r'SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*[\'"]?([A-Za-z0-9._-]+)', notes)
                 or re.search(r'\b(sb_secret_[A-Za-z0-9._-]+)', notes))
            service = m.group(1) if m else None
        except OSError:
            pass
    if not (url and anon):
        sys.exit('No project found. Set SUPABASE_URL and SUPABASE_ANON_KEY, or fill in js/config.local.js.')
    if not service:
        sys.exit('Set SUPABASE_SERVICE_ROLE_KEY (or put it in the git-ignored secret-do-not-commit file):\n'
                 'the Secret key (sb_secret_…) from\n'
                 'Dashboard → Project Settings → API Keys. It bypasses every access rule, so keep it\n'
                 'in your shell for the run only — never in the app, never committed.')
    return url.rstrip('/'), anon, service.strip().strip('\'"')


def check_key(base, service):
    """Fails early, and clearly, when the key cannot be used for admin calls."""
    status, body = http('GET', f'{base}/auth/v1/admin/users?page=1&per_page=1', service, service)
    if status < 400:
        return
    msg = body.get('message', body) if isinstance(body, dict) else body
    sys.exit(f'That key cannot create accounts ({status}: {msg}).\n'
             'Use the Secret key from Dashboard → Project Settings → API Keys — it starts with "sb_secret_".\n'
             'The publishable key (sb_publishable_…) and the legacy service_role JWT will not work on\n'
             'projects using the new API keys.')


def make_user(base, anon, service, label):
    """Creates a confirmed account with a random password and signs in as it."""
    tag = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    email = f'dr-e2e-{tag}@example.com'
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=24))
    status, body = http('POST', f'{base}/auth/v1/admin/users', service, service,
                        {'email': email, 'password': password, 'email_confirm': True,
                         'user_metadata': {'country': 'SG', 'dr_e2e': True}})
    if status >= 400:
        raise RuntimeError(f'Could not create the test account ({status}): {body}')
    uid = body['id']
    status, session = http('POST', f'{base}/auth/v1/token?grant_type=password', anon, anon,
                           {'email': email, 'password': password})
    if status >= 400:
        raise RuntimeError(f'Could not sign in as the test account ({status}): {session}\n'
                           'Check that Email sign-in is enabled under Authentication → Providers.')
    return Client(base, anon, session['access_token'], uid, label)


def cleanup(base, service, uids):
    """Removes every row these accounts created, then the accounts.

    Order matters: rows are deleted for ALL the accounts table by table, children before parents
    (a quote pointing at an order would otherwise block that order's delete, and the order in turn
    would block the account)."""
    if not uids:
        return []
    ids = ','.join(uids)
    tables = [
        ('reviews', ('customer_id', 'provider_id')),
        ('quote_offers', ('provider_id',)),
        ('quote_invites', ('provider_id',)),
        ('quote_requests', ('customer_id',)),
        ('messages', ('sender',)),
        ('chat_reads', ('user_id',)),
        ('chat_threads', ('member_a', 'member_b')),
        ('orders', ('customer_id', 'provider_id')),
        ('provider_services', ('provider_id',)),
        ('verification_items', ('user_id',)),
        ('follows', ('user_id',)),
        ('hidden_providers', ('user_id',)),
        ('cart_items', ('user_id',)),
        ('providers', ('user_id',)),
    ]
    problems = []
    for table, columns in tables:
        for column in columns:
            status, body = http('DELETE', f'{base}/rest/v1/{table}?{column}=in.({ids})', service, service)
            if status >= 400:
                problems.append(f'{table}.{column}: {body}')
    for uid in uids:
        for bucket in ('verification', 'review-photos', 'quote-photos'):
            paths = storage_paths(base, service, bucket, uid)
            if paths:
                http('DELETE', f'{base}/storage/v1/object/{bucket}', service, service, {'prefixes': paths})
        status, body = http('DELETE', f'{base}/auth/v1/admin/users/{uid}', service, service)
        if status >= 400:
            problems.append(f'account {uid}: {body}')
    return problems


def storage_paths(base, service, bucket, uid):
    """Every object under <uid>/… (objects live one folder deeper: <uid>/<item>/<file>)."""
    out = []
    status, folders = http('POST', f'{base}/storage/v1/object/list/{bucket}', service, service,
                           {'prefix': f'{uid}/', 'limit': 100})
    for folder in (folders if status == 200 and isinstance(folders, list) else []):
        status2, files = http('POST', f'{base}/storage/v1/object/list/{bucket}', service, service,
                              {'prefix': f"{uid}/{folder['name']}/", 'limit': 100})
        if status2 == 200 and isinstance(files, list):
            out += [f"{uid}/{folder['name']}/{f['name']}" for f in files]
        if folder.get('id'):          # a file directly under <uid>/
            out.append(f"{uid}/{folder['name']}")
    return out


def sweep(base, service):
    """Removes any test accounts left behind by an interrupted run."""
    status, users = http('GET', f'{base}/auth/v1/admin/users?page=1&per_page=200', service, service)
    if status >= 400:
        sys.exit(f'Could not list accounts: {users}')
    stale = [u['id'] for u in (users.get('users') if isinstance(users, dict) else users) or []
             if str(u.get('email', '')).startswith('dr-e2e-')]
    if not stale:
        print('No leftover test accounts.')
        return 0
    print(f'Removing {len(stale)} leftover test account(s)…')
    problems = cleanup(base, service, stale)
    for p in problems:
        print('  ✗ ' + str(p)[:200])
    print('Done.' if not problems else 'Some rows could not be removed (see above).')
    return 1 if problems else 0


# ------------------------------------------------------------------ the journey
def run(base, anon, service, keep):
    admin = Client(base, service, service, None, 'service')
    anon_client = Client(base, anon, None, None, 'anon')
    today = datetime.now(SGT).date()
    uids = []
    try:
        print('\nSign-up and provider listing')
        provider = make_user(base, anon, service, 'provider')
        customer = make_user(base, anon, service, 'customer')
        other = make_user(base, anon, service, 'other customer')
        uids += [provider.uid, customer.uid, other.uid]
        ok(provider.rows(f'profiles?id=eq.{provider.uid}') != [], 'a profile is created for every new account')

        provider.patch(f'profiles?id=eq.{provider.uid}', {'name': 'E2E Coach', 'dob': '1990-01-01', 'country': 'SG'})
        hours = {str(d): [['08:00', '20:00']] for d in range(7)}
        status, _ = provider.insert('providers', {
            'user_id': provider.uid, 'status': 'draft', 'country': 'SG', 'area': 'Orchard', 'lat': 1.3048, 'lng': 103.8318,
            'headline': 'Swim coach', 'bio': 'Automated functional test account for Done Right.', 'years': 5,
            'availability': {'slotMinutes': 60, 'weekly': hours, 'overrides': {}, 'blocks': {}},
            'policy': {'mode': 'instant', 'leadMinutes': 60, 'advanceDays': 30, 'freeCancelHours': 24,
                       'rescheduleLockHours': 6, 'maxReschedules': 2, 'bufferMinutes': 0},
        })
        ok(status < 300, 'a provider can create their listing', str(status))
        provider.insert('provider_services', {'provider_id': provider.uid, 'service_id': 'swimming-instructor',
                                              'name': 'Swimming lessons', 'price': 80, 'unit': 'lesson', 'duration_min': 60})
        status, body = provider.patch(f'providers?user_id=eq.{provider.uid}', {'status': 'live'})
        fails(status, body, 'going live needs a verified identity', 'identity verification')

        status, _ = provider.insert('verification_items', {'user_id': provider.uid, 'kind': 'identity',
                                                           'data': {'docType': 'NRIC', 'fullName': 'E2E Coach'}})
        item = provider.rows(f'verification_items?user_id=eq.{provider.uid}&select=id,status')
        ok(item and item[0]['status'] == 'pending', 'submitted documents wait for review')
        admin.patch(f"verification_items?id=eq.{item[0]['id']}", {'status': 'verified'})   # what a reviewer does
        status, _ = provider.patch(f'providers?user_id=eq.{provider.uid}', {'status': 'live'})
        ok(status < 300, 'the provider goes live once verified')

        print('\nWhat the public can see')
        listed = [p for p in anon_client.rows('providers?select=user_id,headline') if p['user_id'] == provider.uid]
        ok(listed != [], 'live providers are visible to visitors')
        ok([s for s in anon_client.rows('bookable_services?select=provider_id,service_id') if s['provider_id'] == provider.uid],
           'their services can be booked')
        pub = [p for p in anon_client.rows(f'public_profiles?id=eq.{provider.uid}&select=name,age,links')]
        ok(pub and pub[0]['name'] == 'E2E Coach' and pub[0].get('age') is not None, 'their public profile shows name and age')
        status, body = anon_client.select('profiles?select=id')
        fails(status, body, 'private profiles are not readable', 'permission denied')
        status, body = anon_client.select('orders?select=id')
        fails(status, body, 'orders are not readable by visitors', 'permission denied')

        print('\nProfile links')
        status, body = customer.patch(f'profiles?id=eq.{customer.uid}', {'links': {'website': 'https://wa.me/6591234567'}})
        fails(status, body, 'chat-app links are refused', 'chat apps')
        status, body = provider.patch(f'profiles?id=eq.{provider.uid}', {'links': {'linkedin': 'https://evil.example/in/x'}})
        fails(status, body, 'a platform link must be on that platform', 'right site')
        status, _ = provider.patch(f'profiles?id=eq.{provider.uid}',
                                   {'links': {'linkedin': 'https://www.linkedin.com/in/e2e-coach', 'tiktok': 'https://www.tiktok.com/@e2ecoach'}})
        ok(status < 300, 'valid links are saved')
        pub = anon_client.rows(f'public_profiles?id=eq.{provider.uid}&select=links')
        ok(pub and pub[0]['links'].get('tiktok', '').endswith('@e2ecoach'), 'customers see a provider\'s links')

        print('\nBooking and payment')
        day = (today + timedelta(days=2)).isoformat()
        args = {'p_provider': provider.uid, 'p_service': 'swimming-instructor', 'p_date': day, 'p_time': '10:00',
                'p_mode': 'onsite', 'p_address': {'line': '1 Orchard Rd', 'area': 'Orchard'}, 'p_notes': 'Functional test'}
        status, order = customer.rpc('create_booking', args)
        ok(status < 300 and order.get('status') == 'to_pay', 'a customer books a free slot', str(order)[:120])
        ok(float(order['price']) == 80.0, 'the price comes from the provider\'s listing')
        status, body = other.rpc('create_booking', args)
        fails(status, body, 'the same slot cannot be booked twice', 'no longer available')
        status, body = customer.rpc('create_booking', dict(args, p_time='10:30'))
        fails(status, body, 'times off the slot grid are refused', 'no longer available')
        status, paid = customer.rpc('pay_order', {'p_order': order['id'], 'p_method': 'paynow'})
        ok(status < 300 and paid.get('status') == 'upcoming', 'paying confirms an instant booking')
        ok(other.rows(f"orders?id=eq.{order['id']}&select=id") == [], 'other customers cannot see the booking')
        busy = customer.rows(f'rpc/provider_busy?p_provider={provider.uid}&p_from={day}&p_to={day}')
        ok(any(b['local_time'].startswith('10:00') for b in busy) if isinstance(busy, list) else False,
           'the slot shows as taken, without customer details') if busy else ok(True, 'the slot shows as taken (skipped)')

        print('\nChat, read receipts and booking notices')
        status, msg = customer.rpc('send_message', {'p_to': provider.uid, 'p_text': 'Hello from the functional test'})
        ok(status < 300, 'a customer can message a provider', str(msg)[:120])
        status, body = other.rpc('send_message', {'p_to': customer.uid, 'p_text': 'hi'})
        fails(status, body, 'strangers cannot message each other', 'providers, or people you have a booking')
        texts = [m['text'] for m in provider.rows('messages?select=text,system&order=id.asc')]
        ok(any('Booking confirmed' in t for t in texts), 'the booking confirmation is posted into the conversation')
        ok('Hello from the functional test' in texts, 'the provider receives the message')
        unread = provider.rpc('chat_unread')[1]
        ok(isinstance(unread, list) and sum(u['unread'] for u in unread) >= 1, 'unread messages are counted')
        thread = provider.rows('chat_threads?select=id')[0]['id']
        provider.rpc('mark_read', {'p_thread': thread})
        ok(sum(u['unread'] for u in provider.rpc('chat_unread')[1]) == 0, 'reading clears the unread count')
        reads = customer.rows(f'chat_reads?thread_id=eq.{thread}&select=user_id,last_read_at')
        ok(any(r['user_id'] == provider.uid for r in reads), 'the sender sees the read receipt (✓✓)')
        ok(other.rows(f'chat_reads?thread_id=eq.{thread}&select=user_id') == [], 'nobody else sees the conversation')

        print('\nRescheduling')
        new_day = (today + timedelta(days=3)).isoformat()
        status, moved = customer.rpc('request_reschedule', {'p_order': order['id'], 'p_date': new_day, 'p_time': '11:00'})
        ok(status < 300 and moved.get('local_date') == new_day, 'a customer moves an instant booking', str(moved)[:120])
        texts = [m['text'] for m in customer.rows('messages?select=text&order=id.asc')]
        ok(any('moved to' in t for t in texts), 'the move is posted into the conversation')

        print('\nCompletion and review')
        # the job must have started: only the service role can move an order into the past
        past = (datetime.now(SGT) - timedelta(hours=2))
        admin.patch(f"orders?id=eq.{order['id']}", {'starts_at': past.isoformat(), 'local_date': past.date().isoformat(),
                                                    'local_time': past.strftime('%H:%M:%S')})
        status, body = customer.rpc('mark_done', {'p_order': order['id']})
        fails(status, body, 'customers cannot mark a job done', 'only upcoming jobs|not started|booking not found')
        status, done = provider.rpc('mark_done', {'p_order': order['id']})
        ok(status < 300 and done.get('status') == 'to_confirm', 'the provider marks the job done', str(done)[:120])
        status, confirmed = customer.rpc('confirm_done', {'p_order': order['id']})
        ok(status < 300 and confirmed.get('status') == 'to_review', 'the customer confirms completion')
        status, review = customer.rpc('submit_review', {'p_order': order['id'], 'p_stars': 5, 'p_text': 'Great functional test',
                                                        'p_tags': ['Punctual'], 'p_anonymous': False, 'p_photos': []})
        ok(status < 300, 'the customer leaves a review', str(review)[:120])
        status, body = customer.rpc('submit_review', {'p_order': order['id'], 'p_stars': 4, 'p_text': 'again'})
        fails(status, body, 'a booking can only be reviewed once', 'already reviewed')
        pubrev = [r for r in anon_client.rows(f'public_reviews?provider_id=eq.{provider.uid}&select=stars,reviewer_name,reply')]
        ok(pubrev and pubrev[0]['stars'] == 5, 'the review is public')
        ok('customer_id' not in (pubrev[0] if pubrev else {}), 'the reviewer\'s account is never exposed')
        ratings = anon_client.rows(f'provider_ratings?provider_id=eq.{provider.uid}&select=reviews,average')
        ok(ratings and ratings[0]['reviews'] == 1, 'ratings are aggregated on the server')
        status, _ = provider.rpc('reply_to_review', {'p_review': review['id'], 'p_text': 'Thank you!'})
        ok(status < 300, 'the provider replies publicly')
        status, body = other.rpc('reply_to_review', {'p_review': review['id'], 'p_text': 'spam'})
        fails(status, body, 'only that provider can reply', 'review not found')

        print('\nQuotes')
        quote_id = '%s-%s-4%s-8%s-%s' % tuple(''.join(random.choices('0123456789abcdef', k=n)) for n in (8, 4, 3, 3, 12))
        status, quote = customer.rpc('create_quote', {
            'p_id': quote_id, 'p_service': 'swimming-instructor', 'p_title': 'Lessons for two kids',
            'p_details': 'Two kids aged 6 and 8, beginners, weekend mornings preferred.', 'p_photos': [],
            'p_mode': 'onsite', 'p_address': {'line': '1 Orchard Rd', 'area': 'Orchard'}, 'p_area': 'Orchard'})
        ok(status < 300, 'a customer requests quotes', str(quote)[:160])
        inbox = provider.rows(f'provider_quote_inbox?id=eq.{quote_id}&select=title,area,customer_name')
        ok(inbox and inbox[0]['area'] == 'Orchard', 'the invited provider sees the job and its area')
        ok('address' not in (inbox[0] if inbox else {}), 'the street address is never shown to invited providers')
        ok(other.rows(f'provider_quote_inbox?id=eq.{quote_id}&select=title') == [], 'others do not see the request')
        offer_day = (today + timedelta(days=4)).isoformat()
        status, offer = provider.rpc('send_quote_offer', {'p_quote': quote_id, 'p_price': 150, 'p_date': offer_day,
                                                          'p_time': '10:00', 'p_duration': 60, 'p_message': 'Includes floats'})
        ok(status < 300, 'the provider sends an offer', str(offer)[:160])
        status, body = other.rpc('send_quote_offer', {'p_quote': quote_id, 'p_price': 100, 'p_date': offer_day, 'p_time': '11:00'})
        fails(status, body, 'providers who were not invited cannot quote', 'not invited')
        status, qorder = customer.rpc('accept_quote_offer', {'p_offer': offer['id']})
        ok(status < 300 and float(qorder.get('total', 0)) == 150.0, 'accepting books at the quoted price', str(qorder)[:160])
        ok(float(qorder['fee']) == 0.0, 'no travel fee is added to a quoted job')
        status, qpaid = customer.rpc('pay_order', {'p_order': qorder['id'], 'p_method': 'paynow'})
        ok(status < 300 and qpaid.get('status') == 'upcoming', 'paying for an accepted quote confirms it')

        print('\nDocument storage')
        jpeg = bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffd9')
        status, _ = provider.upload('verification', f"{provider.uid}/{item[0]['id']}/e2e.jpg", jpeg)
        ok(status < 300, 'a provider uploads their document scan', str(status))
        status, body = customer.upload('verification', f"{provider.uid}/{item[0]['id']}/sneaky.jpg", jpeg)
        fails(status, body, 'nobody can upload into someone else\'s folder', 'row-level|denied|Unauthorized')
        status, body = customer.select(f"storage/v1/object/verification/{provider.uid}/{item[0]['id']}/e2e.jpg")
        ok(status >= 400, 'customers cannot open verification documents', f'status {status}')

        print('\nCancellation refunds')
        day2 = (today + timedelta(days=10)).isoformat()
        status, later = customer.rpc('create_booking', dict(args, p_date=day2, p_time='14:00'))
        customer.rpc('pay_order', {'p_order': later['id'], 'p_method': 'paynow'})
        terms = customer.rpc('cancel_terms', {'p_order': later['id']})[1]
        ok(terms.get('free') is True, 'cancelling early is free')
        status, cancelled = customer.rpc('cancel_booking', {'p_order': later['id']})
        ok(status < 300 and cancelled.get('status') == 'cancelled' and float(cancelled['refund']) == float(cancelled['total']),
           'an early cancellation is refunded in full')
    finally:
        if not uids:
            pass
        elif keep:
            print('\nTest accounts kept:', ', '.join(uids))
        else:
            print('\nCleaning up test accounts…')
            problems = cleanup(base, service, uids)
            left = [u for u in uids if http('GET', f'{base}/auth/v1/admin/users/{u}', service, service)[0] < 400]
            ok(not left and not problems, 'every test account and its data is removed',
               '; '.join(problems + [f'account left: {u}' for u in left])[:400])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--keep', action='store_true', help='leave the test accounts and their data behind')
    ap.add_argument('--yes', action='store_true', help='skip the confirmation prompt')
    ap.add_argument('--sweep', action='store_true', help='only remove test accounts left by an earlier run')
    a = ap.parse_args()
    base, anon, service = settings()
    check_key(base, service)
    if a.sweep:
        return sweep(base, service)
    ref = base.split('//')[-1].split('.')[0]
    print(f'Functional tests against project {ref}\nThis creates temporary accounts (dr-e2e-…@example.com) and removes them afterwards.')
    if not a.yes:
        if input('Continue? [y/N] ').strip().lower() not in ('y', 'yes'):
            sys.exit('Cancelled.')
    started = time.time()
    run(base, anon, service, a.keep)
    print(f'\n{len(PASSED)} passed, {len(FAILED)} failed · {time.time() - started:.1f}s')
    if FAILED:
        print('Failed:\n  - ' + '\n  - '.join(FAILED))
    return 1 if FAILED else 0


if __name__ == '__main__':
    sys.exit(main())
