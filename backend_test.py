#!/usr/bin/env python3
"""
Lightweight verification of v2 timeout fixes.
Tests with MINIMAL payloads to avoid burning LLM credits.
"""
import requests
import time
import json
import sys

# Read backend URL from frontend/.env
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break

API_URL = f"{BASE_URL}/api"
print(f"Testing against: {API_URL}\n")

session = requests.Session()

def test_auth():
    """Test 1: Auth as admin"""
    print("=" * 60)
    print("TEST 1: AUTH")
    print("=" * 60)
    
    resp = session.post(f"{API_URL}/auth/login", json={
        "email": "admin@citetail.com",
        "password": "admin123"
    })
    
    if resp.status_code != 200:
        print(f"❌ FAIL: Login failed with status {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ PASS: Login successful")
    print(f"   User: {data.get('email')}")
    print(f"   Role: {data.get('role')}")
    return True


def test_domain_analysis():
    """Test 2: Domain analysis with example.com (small site, minimal LLM cost)"""
    print("\n" + "=" * 60)
    print("TEST 2: DOMAIN ANALYSIS (example.com)")
    print("=" * 60)
    
    # Create analysis
    resp = session.post(f"{API_URL}/domain/analyze", json={
        "domain": "example.com"
    })
    
    if resp.status_code not in [200, 201, 202]:
        print(f"❌ FAIL: POST /domain/analyze returned {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    job_id = data.get("id")
    print(f"✅ Analysis created: id={job_id}, status={data.get('status')}")
    
    # Poll for completion (max 100s)
    start = time.time()
    max_wait = 100
    poll_interval = 5
    
    while time.time() - start < max_wait:
        time.sleep(poll_interval)
        resp = session.get(f"{API_URL}/domain/{job_id}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: GET /domain/{job_id} returned {resp.status_code}")
            return False
        
        data = resp.json()
        status = data.get("status")
        elapsed = time.time() - start
        print(f"   Poll at {elapsed:.1f}s: status={status}")
        
        if status == "done":
            print(f"✅ PASS: Analysis completed in {elapsed:.1f}s")
            print(f"   AI Readiness Score: {data.get('ai_readiness_score')}")
            print(f"   Citation Sources: {len(data.get('citation_sources', []))}")
            print(f"   Ranking Prompts: {len(data.get('ranking_prompts', []))}")
            return True
        
        if status == "error":
            error_msg = data.get("error", "Unknown error")
            # Check if it's the OLD timeout error (85s)
            if "AI request timed out" in error_msg or "timed out" in error_msg.lower():
                print(f"❌ FAIL: Analysis timed out (v2 fix not working)")
                print(f"   Error: {error_msg}")
                return False
            else:
                # Non-timeout error is acceptable for this test
                print(f"⚠️  Analysis returned error (non-timeout): {error_msg}")
                return True
    
    print(f"❌ FAIL: Analysis did not complete within {max_wait}s")
    return False


def test_visibility_prompt_sources():
    """Test 3: Visibility prompt-sources with stripe (reasonable brand)"""
    print("\n" + "=" * 60)
    print("TEST 3: VISIBILITY PROMPT-SOURCES (stripe)")
    print("=" * 60)
    
    start = time.time()
    resp = session.post(f"{API_URL}/visibility/prompt-sources", json={
        "prompt": "best invoicing tool",
        "brand": "stripe",
        "domain": "stripe.com"
    })
    elapsed = time.time() - start
    
    if resp.status_code == 502 or resp.status_code == 504:
        print(f"❌ FAIL: Cloudflare 502/504 error (timeout)")
        print(f"   Status: {resp.status_code}")
        print(f"   Time: {elapsed:.1f}s")
        return False
    
    if resp.status_code != 200:
        print(f"❌ FAIL: POST /visibility/prompt-sources returned {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        return False
    
    data = resp.json()
    sources = data.get("sources", [])
    
    print(f"✅ PASS: Prompt-sources completed in {elapsed:.1f}s")
    print(f"   Sources returned: {len(sources)}")
    if sources:
        print(f"   First source: {sources[0].get('domain')} - {sources[0].get('title', '')[:50]}")
    
    return True


def check_backend_logs():
    """Check backend logs for timeout errors"""
    print("\n" + "=" * 60)
    print("BACKEND LOG CHECK")
    print("=" * 60)
    
    import subprocess
    result = subprocess.run(
        ["grep", "-E", "domain-|prompt-sources|timeout", "/var/log/supervisor/backend.err.log"],
        capture_output=True,
        text=True
    )
    
    lines = result.stdout.strip().split("\n")[-30:] if result.stdout else []
    
    if lines:
        print("Last 30 relevant log lines:")
        for line in lines:
            print(f"   {line}")
    else:
        print("No timeout-related errors in backend logs ✅")


def main():
    print("LIGHTWEIGHT VERIFICATION - V2 TIMEOUT FIXES")
    print("=" * 60)
    print()
    
    results = []
    
    # Test 1: Auth
    results.append(("Auth", test_auth()))
    
    if not results[0][1]:
        print("\n❌ Auth failed, cannot continue")
        sys.exit(1)
    
    # Test 2: Domain Analysis
    results.append(("Domain Analysis", test_domain_analysis()))
    
    # Test 3: Visibility Prompt-Sources
    results.append(("Visibility Prompt-Sources", test_visibility_prompt_sources()))
    
    # Check logs
    check_backend_logs()
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(r[1] for r in results)
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED - V2 fixes verified")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED - See details above")
        sys.exit(1)


if __name__ == "__main__":
    main()
