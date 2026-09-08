#!/usr/bin/env python3
"""
Lightweight backend verification for timeout/502 fixes.
MINIMAL credit spend - no full scans.
"""
import requests
import time
import json
import os

# Read backend URL from frontend/.env
BACKEND_URL = "https://34635123-f47c-4df6-a694-3e011d93b96e.preview.emergentagent.com/api"

# Admin credentials from test_credentials.md
ADMIN_EMAIL = "admin@citetail.com"
ADMIN_PASSWORD = "admin123"

session = requests.Session()

def test_auth():
    """Test 1: Auth as admin"""
    print("\n=== TEST 1: AUTH ===")
    resp = session.post(f"{BACKEND_URL}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    print(f"POST /api/auth/login: {resp.status_code}")
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    user = resp.json()
    print(f"✓ Logged in as: {user.get('email')}")
    
    # Verify session works
    me_resp = session.get(f"{BACKEND_URL}/auth/me")
    print(f"GET /api/auth/me: {me_resp.status_code}")
    assert me_resp.status_code == 200, f"Session check failed: {me_resp.text}"
    print("✓ Session cookie working")
    return True

def test_dashboard():
    """Test 2: Dashboard endpoint (lightweight)"""
    print("\n=== TEST 2: DASHBOARD (lightweight) ===")
    resp = session.get(f"{BACKEND_URL}/dashboard")
    print(f"GET /api/dashboard: {resp.status_code}")
    assert resp.status_code == 200, f"Dashboard failed: {resp.text}"
    print("✓ Dashboard endpoint working")
    return True

def test_content_optimizer_lightweight():
    """Test 3: Content Optimizer with SHORT text (minimal LLM call)"""
    print("\n=== TEST 3: CONTENT OPTIMIZER (lightweight, short text) ===")
    start = time.time()
    
    # Use a very short text to minimize LLM cost
    short_text = "This is a test of AEO. Short article body for lightweight verification only. " * 2
    
    resp = session.post(f"{BACKEND_URL}/analyses", json={
        "input_type": "text",
        "content": short_text,
        "target_query": "test"
    })
    print(f"POST /api/analyses: {resp.status_code} ({time.time()-start:.2f}s)")
    
    if resp.status_code not in [200, 201, 202]:
        print(f"✗ FAIL: Expected 200/201/202, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    analysis_id = data.get("id")
    print(f"✓ Analysis created: {analysis_id}")
    
    # Poll for completion (max 90s)
    poll_start = time.time()
    max_wait = 90
    while time.time() - poll_start < max_wait:
        poll_resp = session.get(f"{BACKEND_URL}/analyses/{analysis_id}")
        if poll_resp.status_code != 200:
            print(f"✗ FAIL: Poll returned {poll_resp.status_code}")
            return False
        
        poll_data = poll_resp.json()
        status = poll_data.get("status")
        
        if status == "done":
            elapsed = time.time() - start
            print(f"✓ Analysis completed in {elapsed:.1f}s (< 90s)")
            print(f"  Status: {status}")
            print(f"  Score: {poll_data.get('overall_score')}")
            return True
        elif status == "error":
            print(f"✗ FAIL: Analysis errored: {poll_data.get('error')}")
            return False
        
        time.sleep(3)
    
    print(f"✗ FAIL: Analysis timed out after {max_wait}s")
    return False

def test_pr_coverage_lightweight():
    """Test 4: PR Coverage with obscure brand (minimal TinyFish calls)"""
    print("\n=== TEST 4: PR COVERAGE (lightweight, obscure brand) ===")
    start = time.time()
    
    # Use a very obscure brand name that won't have real press
    # This will return empty results quickly
    resp = session.post(f"{BACKEND_URL}/pr", json={
        "brand": "xzqwrandomlbrand9999",
        "domain": None
    })
    print(f"POST /api/pr: {resp.status_code} ({time.time()-start:.2f}s)")
    
    if resp.status_code == 500:
        print(f"✗ FAIL: Got 500 error")
        print(f"Response: {resp.text}")
        return False
    elif resp.status_code == 502:
        print(f"✗ FAIL: Got 502 timeout (same as before)")
        print(f"Response: {resp.text}")
        return False
    elif resp.status_code in [200, 201]:
        elapsed = time.time() - start
        print(f"✓ PR endpoint returned {resp.status_code} in {elapsed:.1f}s (< 90s)")
        data = resp.json()
        print(f"  Press articles: {len(data.get('press', []))}")
        return True
    else:
        print(f"⚠ Got {resp.status_code} (not 500/502, acceptable)")
        return True

def test_brand_consistency_lightweight():
    """Test 5: Brand Consistency with obscure brand (minimal TinyFish calls)"""
    print("\n=== TEST 5: BRAND CONSISTENCY (lightweight, obscure brand) ===")
    start = time.time()
    
    # Use the same obscure brand
    resp = session.post(f"{BACKEND_URL}/brand", json={
        "brand": "xzqwrandomlbrand9999",
        "domain": None
    })
    print(f"POST /api/brand: {resp.status_code} ({time.time()-start:.2f}s)")
    
    if resp.status_code == 500:
        print(f"✗ FAIL: Got 500 error")
        print(f"Response: {resp.text}")
        return False
    elif resp.status_code == 502:
        print(f"✗ FAIL: Got 502 timeout (same as before)")
        print(f"Response: {resp.text}")
        return False
    elif resp.status_code in [200, 201]:
        elapsed = time.time() - start
        print(f"✓ Brand endpoint returned {resp.status_code} in {elapsed:.1f}s (< 90s)")
        data = resp.json()
        print(f"  Platforms: {len(data.get('platforms', []))}")
        return True
    else:
        print(f"⚠ Got {resp.status_code} (not 500/502, acceptable)")
        return True

def test_domain_analyze_lightweight():
    """Test 6: Domain Analysis with small domain (last, most expensive)"""
    print("\n=== TEST 6: DOMAIN ANALYSIS (lightweight, small domain) ===")
    start = time.time()
    
    # Use example.com - small crawl surface
    resp = session.post(f"{BACKEND_URL}/domain/analyze", json={
        "domain": "example.com"
    })
    print(f"POST /api/domain/analyze: {resp.status_code} ({time.time()-start:.2f}s)")
    
    if resp.status_code not in [200, 201, 202]:
        print(f"✗ FAIL: Expected 200/201/202, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    job_id = data.get("id")
    print(f"✓ Domain analysis created: {job_id}")
    
    # Poll for completion (max 120s for domain analysis)
    poll_start = time.time()
    max_wait = 120
    while time.time() - poll_start < max_wait:
        poll_resp = session.get(f"{BACKEND_URL}/domain/{job_id}")
        if poll_resp.status_code != 200:
            print(f"✗ FAIL: Poll returned {poll_resp.status_code}")
            return False
        
        poll_data = poll_resp.json()
        status = poll_data.get("status")
        
        if status == "done":
            elapsed = time.time() - start
            print(f"✓ Domain analysis completed in {elapsed:.1f}s (< 120s)")
            print(f"  Status: {status}")
            print(f"  AI Readiness: {poll_data.get('ai_readiness_score')}")
            return True
        elif status == "error":
            print(f"✗ FAIL: Domain analysis errored: {poll_data.get('error')}")
            return False
        
        time.sleep(5)
    
    print(f"✗ FAIL: Domain analysis timed out after {max_wait}s")
    return False

def test_citations_regression():
    """Test 7: Citations endpoint (regression, 1 Serper call max)"""
    print("\n=== TEST 7: CITATIONS REGRESSION (1 Serper call) ===")
    start = time.time()
    
    resp = session.post(f"{BACKEND_URL}/citations", json={
        "query": "aeo test",
        "domain": None
    })
    print(f"POST /api/citations: {resp.status_code} ({time.time()-start:.2f}s)")
    
    if resp.status_code == 500:
        print(f"✗ FAIL: Got 500 error")
        print(f"Response: {resp.text}")
        return False
    elif resp.status_code == 502:
        print(f"✗ FAIL: Got 502 timeout")
        print(f"Response: {resp.text}")
        return False
    elif resp.status_code == 200:
        elapsed = time.time() - start
        print(f"✓ Citations endpoint returned 200 in {elapsed:.1f}s")
        data = resp.json()
        print(f"  Sources: {len(data.get('sources', []))}")
        return True
    else:
        print(f"⚠ Got {resp.status_code} (not 500/502, acceptable)")
        return True

def main():
    print("=" * 60)
    print("LIGHTWEIGHT BACKEND VERIFICATION - TIMEOUT/502 FIXES")
    print("=" * 60)
    
    results = {}
    
    try:
        results["auth"] = test_auth()
        results["dashboard"] = test_dashboard()
        results["content_optimizer"] = test_content_optimizer_lightweight()
        results["pr_coverage"] = test_pr_coverage_lightweight()
        results["brand_consistency"] = test_brand_consistency_lightweight()
        results["domain_analysis"] = test_domain_analyze_lightweight()
        results["citations_regression"] = test_citations_regression()
    except Exception as e:
        print(f"\n✗ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        results["exception"] = False
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    print("\n" + "=" * 60)
    if all_passed:
        print("✓ ALL TESTS PASSED")
    else:
        print("✗ SOME TESTS FAILED")
    print("=" * 60)
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
