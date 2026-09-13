#!/usr/bin/env python3
"""
Backend test for NEW Signup OTP flow.
Tests all scenarios: happy path, cooldown, bad OTP, duplicate email, admin regression.
"""
import os
import sys
import time
import re
import requests
import subprocess
from datetime import datetime

# Base URL from frontend/.env
BASE_URL = "https://github-auto-runner.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@citetail.com"
ADMIN_PASSWORD = "admin123"

# Track test users for cleanup
test_users = []

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def get_otp_from_logs(email):
    """Extract OTP from backend logs for the given email."""
    log(f"Extracting OTP for {email} from backend logs...")
    try:
        result = subprocess.run(
            ["tail", "-n", "200", "/var/log/supervisor/backend.err.log"],
            capture_output=True,
            text=True,
            timeout=5
        )
        # Pattern: [signup-verify] RESEND_API_KEY missing — OTP for <email>: <6-digit-code>
        pattern = rf"\[signup-verify\] RESEND_API_KEY missing — OTP for {re.escape(email)}: (\d{{6}})"
        matches = re.findall(pattern, result.stdout)
        if matches:
            otp = matches[-1]  # Get the most recent OTP
            log(f"✓ Found OTP: {otp}")
            return otp
        else:
            log(f"✗ No OTP found in logs for {email}")
            log(f"Log output (last 50 lines):\n{result.stdout[-2000:]}")
            return None
    except Exception as e:
        log(f"✗ Error reading logs: {e}")
        return None

def test_scenario_1_happy_path():
    """Scenario 1: Happy path - request OTP, verify, check /auth/me"""
    log("\n" + "="*80)
    log("SCENARIO 1: HAPPY PATH")
    log("="*80)
    
    # Use unique email with timestamp
    email = f"test_{int(time.time())}@example.com"
    test_users.append(email)
    
    # Step 1a: POST /signup/request
    log(f"\nStep 1a: POST /auth/signup/request with email={email}")
    resp = requests.post(
        f"{BASE_URL}/auth/signup/request",
        json={"name": "Test User", "email": email, "password": "test123456"}
    )
    log(f"Status: {resp.status_code}")
    log(f"Response: {resp.json()}")
    
    if resp.status_code != 200:
        log(f"✗ FAIL: Expected 200, got {resp.status_code}")
        return False
    
    data = resp.json()
    if not (data.get("ok") and data.get("delivered_to") == email and data.get("expires_in") == 600):
        log(f"✗ FAIL: Response shape incorrect. Expected {{ok:true, delivered_to:{email}, expires_in:600}}")
        return False
    
    log("✓ PASS: /signup/request returned correct response")
    
    # Step 1b: Extract OTP from logs
    log("\nStep 1b: Extract OTP from backend logs")
    time.sleep(1)  # Give logs time to flush
    otp = get_otp_from_logs(email)
    if not otp:
        log("✗ FAIL: Could not extract OTP from logs")
        return False
    
    # Step 1c: POST /signup/verify with correct OTP
    log(f"\nStep 1c: POST /auth/signup/verify with email={email}, code={otp}")
    resp = requests.post(
        f"{BASE_URL}/auth/signup/verify",
        json={"email": email, "code": otp}
    )
    log(f"Status: {resp.status_code}")
    log(f"Response: {resp.json()}")
    
    if resp.status_code != 200:
        log(f"✗ FAIL: Expected 200, got {resp.status_code}")
        return False
    
    user = resp.json()
    if not all(k in user for k in ["id", "email", "name", "role", "entitlements"]):
        log(f"✗ FAIL: User object missing required fields")
        return False
    
    if user["email"] != email or user["role"] != "user":
        log(f"✗ FAIL: User email or role incorrect")
        return False
    
    # Check cookies
    cookies = resp.cookies
    if "access_token" not in cookies or "refresh_token" not in cookies:
        log(f"✗ FAIL: Missing auth cookies")
        return False
    
    log("✓ PASS: /signup/verify returned user object with correct fields and cookies")
    
    # Step 1d: GET /auth/me with cookies
    log("\nStep 1d: GET /auth/me with session cookies")
    resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    log(f"Status: {resp.status_code}")
    log(f"Response: {resp.json()}")
    
    if resp.status_code != 200:
        log(f"✗ FAIL: Expected 200, got {resp.status_code}")
        return False
    
    me = resp.json()
    if me.get("email") != email or me.get("email_verified") != True:
        log(f"✗ FAIL: /auth/me response incorrect. Expected email_verified=true")
        return False
    
    log("✓ PASS: /auth/me returned user with email_verified=true")
    log("\n✅ SCENARIO 1: PASSED")
    return True

def test_scenario_2_cooldown():
    """Scenario 2: Cooldown - two requests back-to-back should give 429"""
    log("\n" + "="*80)
    log("SCENARIO 2: COOLDOWN")
    log("="*80)
    
    email = f"test_{int(time.time())}_cooldown@example.com"
    test_users.append(email)
    
    # First request
    log(f"\nFirst request: POST /auth/signup/request with email={email}")
    resp1 = requests.post(
        f"{BASE_URL}/auth/signup/request",
        json={"name": "Test User", "email": email, "password": "test123456"}
    )
    log(f"Status: {resp1.status_code}")
    log(f"Response: {resp1.json()}")
    
    if resp1.status_code != 200:
        log(f"✗ FAIL: First request should return 200, got {resp1.status_code}")
        return False
    
    log("✓ First request successful")
    
    # Second request immediately
    log(f"\nSecond request (immediate): POST /auth/signup/request with same email")
    resp2 = requests.post(
        f"{BASE_URL}/auth/signup/request",
        json={"name": "Test User", "email": email, "password": "test123456"}
    )
    log(f"Status: {resp2.status_code}")
    log(f"Response: {resp2.json()}")
    
    if resp2.status_code != 429:
        log(f"✗ FAIL: Expected 429 (cooldown), got {resp2.status_code}")
        return False
    
    detail = resp2.json().get("detail", "")
    if "Please wait" not in detail or "s before" not in detail:
        log(f"✗ FAIL: Expected cooldown message with 'Please wait' and seconds, got: {detail}")
        return False
    
    log(f"✓ PASS: Second request returned 429 with cooldown message: {detail}")
    log("\n✅ SCENARIO 2: PASSED")
    return True

def test_scenario_3_bad_otp():
    """Scenario 3: Bad OTP - wrong code should give 400, correct code should still work"""
    log("\n" + "="*80)
    log("SCENARIO 3: BAD OTP")
    log("="*80)
    
    email = f"test_{int(time.time())}_badotp@example.com"
    test_users.append(email)
    
    # Request OTP
    log(f"\nStep 1: POST /auth/signup/request with email={email}")
    resp = requests.post(
        f"{BASE_URL}/auth/signup/request",
        json={"name": "Test User", "email": email, "password": "test123456"}
    )
    log(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        log(f"✗ FAIL: signup/request failed with {resp.status_code}")
        return False
    
    # Try wrong OTP
    log(f"\nStep 2: POST /auth/signup/verify with WRONG code (000000)")
    resp = requests.post(
        f"{BASE_URL}/auth/signup/verify",
        json={"email": email, "code": "000000"}
    )
    log(f"Status: {resp.status_code}")
    log(f"Response: {resp.json()}")
    
    if resp.status_code != 400:
        log(f"✗ FAIL: Expected 400 for wrong OTP, got {resp.status_code}")
        return False
    
    detail = resp.json().get("detail", "")
    if "Invalid code" not in detail:
        log(f"✗ FAIL: Expected 'Invalid code' message, got: {detail}")
        return False
    
    log("✓ PASS: Wrong OTP returned 400 with 'Invalid code'")
    
    # Get correct OTP and verify
    log(f"\nStep 3: Extract correct OTP and verify")
    time.sleep(1)
    otp = get_otp_from_logs(email)
    if not otp:
        log("✗ FAIL: Could not extract OTP from logs")
        return False
    
    resp = requests.post(
        f"{BASE_URL}/auth/signup/verify",
        json={"email": email, "code": otp}
    )
    log(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        log(f"✗ FAIL: Correct OTP should work after wrong attempt, got {resp.status_code}")
        log(f"Response: {resp.json()}")
        return False
    
    log("✓ PASS: Correct OTP still works after wrong attempt")
    log("\n✅ SCENARIO 3: PASSED")
    return True

def test_scenario_4_duplicate_email():
    """Scenario 4: Duplicate email - after user created, same email should give 400"""
    log("\n" + "="*80)
    log("SCENARIO 4: DUPLICATE EMAIL")
    log("="*80)
    
    email = f"test_{int(time.time())}_dup@example.com"
    test_users.append(email)
    
    # Create user (full flow)
    log(f"\nStep 1: Create user with email={email}")
    resp = requests.post(
        f"{BASE_URL}/auth/signup/request",
        json={"name": "Test User", "email": email, "password": "test123456"}
    )
    if resp.status_code != 200:
        log(f"✗ FAIL: signup/request failed with {resp.status_code}")
        return False
    
    time.sleep(1)
    otp = get_otp_from_logs(email)
    if not otp:
        log("✗ FAIL: Could not extract OTP")
        return False
    
    resp = requests.post(
        f"{BASE_URL}/auth/signup/verify",
        json={"email": email, "code": otp}
    )
    if resp.status_code != 200:
        log(f"✗ FAIL: signup/verify failed with {resp.status_code}")
        return False
    
    log("✓ User created successfully")
    
    # Try to request OTP again with same email
    log(f"\nStep 2: POST /auth/signup/request with SAME email (should fail)")
    resp = requests.post(
        f"{BASE_URL}/auth/signup/request",
        json={"name": "Test User", "email": email, "password": "test123456"}
    )
    log(f"Status: {resp.status_code}")
    log(f"Response: {resp.json()}")
    
    if resp.status_code != 400:
        log(f"✗ FAIL: Expected 400 for duplicate email, got {resp.status_code}")
        return False
    
    detail = resp.json().get("detail", "")
    if "Email already registered" not in detail:
        log(f"✗ FAIL: Expected 'Email already registered' message, got: {detail}")
        return False
    
    log("✓ PASS: Duplicate email returned 400 with 'Email already registered'")
    log("\n✅ SCENARIO 4: PASSED")
    return True

def test_scenario_5_admin_regression():
    """Scenario 5: Admin regression - admin login should still work"""
    log("\n" + "="*80)
    log("SCENARIO 5: ADMIN REGRESSION CHECK")
    log("="*80)
    
    log(f"\nPOST /auth/login with admin@citetail.com / admin123")
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    log(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        log(f"✗ FAIL: Admin login failed with {resp.status_code}")
        log(f"Response: {resp.json()}")
        return False
    
    user = resp.json()
    if user.get("email") != ADMIN_EMAIL:
        log(f"✗ FAIL: Admin email incorrect")
        return False
    
    log(f"✓ PASS: Admin login still works correctly")
    log("\n✅ SCENARIO 5: PASSED")
    return True

def cleanup_test_users():
    """Delete test users from MongoDB"""
    log("\n" + "="*80)
    log("CLEANUP: Deleting test users")
    log("="*80)
    
    if not test_users:
        log("No test users to clean up")
        return
    
    try:
        # Build mongosh command to delete test users
        emails_str = ", ".join([f'"{email}"' for email in test_users])
        mongo_cmd = f'db.users.deleteMany({{email: {{$in: [{emails_str}]}}}});'
        
        log(f"Deleting {len(test_users)} test users from MongoDB...")
        result = subprocess.run(
            ["mongosh", "mongodb://localhost:27017/test_database", "--quiet", "--eval", mongo_cmd],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        log(f"MongoDB output: {result.stdout}")
        if result.returncode == 0:
            log(f"✓ Test users deleted successfully")
        else:
            log(f"⚠ Warning: MongoDB cleanup may have failed: {result.stderr}")
    except Exception as e:
        log(f"⚠ Warning: Could not clean up test users: {e}")

def main():
    log("="*80)
    log("BACKEND TEST: NEW SIGNUP OTP FLOW")
    log("="*80)
    log(f"Base URL: {BASE_URL}")
    log(f"Admin: {ADMIN_EMAIL}")
    
    results = {}
    
    try:
        # Run all scenarios
        results["Scenario 1: Happy Path"] = test_scenario_1_happy_path()
        results["Scenario 2: Cooldown"] = test_scenario_2_cooldown()
        results["Scenario 3: Bad OTP"] = test_scenario_3_bad_otp()
        results["Scenario 4: Duplicate Email"] = test_scenario_4_duplicate_email()
        results["Scenario 5: Admin Regression"] = test_scenario_5_admin_regression()
        
    finally:
        # Always cleanup
        cleanup_test_users()
    
    # Summary
    log("\n" + "="*80)
    log("TEST SUMMARY")
    log("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for scenario, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        log(f"{status}: {scenario}")
    
    log(f"\nTotal: {passed}/{total} scenarios passed")
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        log(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
