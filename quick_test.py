#!/usr/bin/env python3
"""Quick verification of timeout fixes - no long-running tests"""
import requests
import time

BACKEND_URL = "https://github-auto-runner.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@citetail.com"
ADMIN_PASSWORD = "admin123"

session = requests.Session()

print("=" * 60)
print("QUICK VERIFICATION - TIMEOUT/502 FIXES")
print("=" * 60)

# 1. Auth
print("\n1. AUTH")
resp = session.post(f"{BACKEND_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
print(f"   POST /api/auth/login: {resp.status_code}")
assert resp.status_code == 200

resp = session.get(f"{BACKEND_URL}/auth/me")
print(f"   GET /api/auth/me: {resp.status_code}")
assert resp.status_code == 200
print("   ✓ Auth working")

# 2. Dashboard
print("\n2. DASHBOARD")
resp = session.get(f"{BACKEND_URL}/dashboard")
print(f"   GET /api/dashboard: {resp.status_code}")
assert resp.status_code == 200
print("   ✓ Dashboard working")

# 3. Content Optimizer - just create, don't wait
print("\n3. CONTENT OPTIMIZER (create only)")
start = time.time()
resp = session.post(f"{BACKEND_URL}/analyses", json={
    "input_type": "text",
    "content": "This is a test of AEO. Short article body for lightweight verification only. " * 2,
    "target_query": "test"
})
elapsed = time.time() - start
print(f"   POST /api/analyses: {resp.status_code} ({elapsed:.2f}s)")
if resp.status_code in [200, 201, 202]:
    data = resp.json()
    print(f"   ✓ Analysis created: {data.get('id')}")
    print(f"   ✓ No 500/502 error on creation")
else:
    print(f"   ✗ FAIL: Got {resp.status_code}")
    print(f"   Response: {resp.text[:200]}")

# 4. PR Coverage - obscure brand
print("\n4. PR COVERAGE (obscure brand)")
start = time.time()
resp = session.post(f"{BACKEND_URL}/pr", json={"brand": "xzqwrandomlbrand9999", "domain": None})
elapsed = time.time() - start
print(f"   POST /api/pr: {resp.status_code} ({elapsed:.2f}s)")
if resp.status_code == 500:
    print(f"   ✗ FAIL: Got 500 error")
    print(f"   Response: {resp.text[:200]}")
elif resp.status_code == 502:
    print(f"   ✗ FAIL: Got 502 timeout")
    print(f"   Response: {resp.text[:200]}")
elif resp.status_code in [200, 201]:
    print(f"   ✓ No 500/502 error (completed in {elapsed:.1f}s)")
else:
    print(f"   ⚠ Got {resp.status_code} (not 500/502)")

# 5. Brand Consistency - obscure brand
print("\n5. BRAND CONSISTENCY (obscure brand)")
start = time.time()
resp = session.post(f"{BACKEND_URL}/brand", json={"brand": "xzqwrandomlbrand9999", "domain": None})
elapsed = time.time() - start
print(f"   POST /api/brand: {resp.status_code} ({elapsed:.2f}s)")
if resp.status_code == 500:
    print(f"   ✗ FAIL: Got 500 error")
    print(f"   Response: {resp.text[:200]}")
elif resp.status_code == 502:
    print(f"   ✗ FAIL: Got 502 timeout")
    print(f"   Response: {resp.text[:200]}")
elif resp.status_code in [200, 201]:
    print(f"   ✓ No 500/502 error (completed in {elapsed:.1f}s)")
else:
    print(f"   ⚠ Got {resp.status_code} (not 500/502)")

# 6. Domain Analysis - just create, don't wait
print("\n6. DOMAIN ANALYSIS (create only)")
start = time.time()
resp = session.post(f"{BACKEND_URL}/domain/analyze", json={"domain": "example.com"})
elapsed = time.time() - start
print(f"   POST /api/domain/analyze: {resp.status_code} ({elapsed:.2f}s)")
if resp.status_code in [200, 201, 202]:
    data = resp.json()
    print(f"   ✓ Domain analysis created: {data.get('id')}")
    print(f"   ✓ No 500/502 error on creation")
else:
    print(f"   ✗ FAIL: Got {resp.status_code}")
    print(f"   Response: {resp.text[:200]}")

# 7. Citations regression
print("\n7. CITATIONS REGRESSION")
start = time.time()
resp = session.post(f"{BACKEND_URL}/citations", json={"query": "aeo test", "domain": None})
elapsed = time.time() - start
print(f"   POST /api/citations: {resp.status_code} ({elapsed:.2f}s)")
if resp.status_code == 500:
    print(f"   ✗ FAIL: Got 500 error")
elif resp.status_code == 502:
    print(f"   ✗ FAIL: Got 502 timeout")
elif resp.status_code == 200:
    print(f"   ✓ Citations working (completed in {elapsed:.1f}s)")
else:
    print(f"   ⚠ Got {resp.status_code}")

print("\n" + "=" * 60)
print("VERIFICATION COMPLETE")
print("=" * 60)
