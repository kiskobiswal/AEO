#!/usr/bin/env python3
"""Backend test for Content Writer "Save Drafts" feature.

Tests all CRUD endpoints for drafts WITHOUT calling /generate (no LLM credits).
"""

import requests
import time
import json
from typing import Optional

# Base URL from frontend/.env
BASE_URL = "https://7d678d72-ad72-4e34-a228-c69cd1e57561.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@citetail.com"
ADMIN_PASSWORD = "admin123"

# Sample draft content (safe, no LLM call)
SAMPLE_DRAFT = {
    "title": "AEO basics",
    "topic": "AEO basics",
    "keywords": ["AEO", "GEO"],
    "content": """# AEO basics
META: A short guide about AEO for testing.
TL;DR: AEO helps AI engines cite your content.

## What is AEO?
AEO stands for Answer Engine Optimization.

- Concise answers
- Structured content

## Frequently Asked Questions
### Q: Why does AEO matter?
AEO matters because AI answers are the new SERP.

## Key Takeaways
- Direct answers win
- Use FAQs"""
}

# Longer content for PATCH test
UPDATED_CONTENT = """# AEO basics - Extended Edition
META: A comprehensive guide about AEO for testing with more content.
TL;DR: AEO helps AI engines cite your content by optimizing for answer engines.

## What is AEO?
AEO stands for Answer Engine Optimization. It's the practice of optimizing content for AI-powered search engines like ChatGPT, Perplexity, Claude, and Google AI Overviews.

- Concise answers that AI can extract
- Structured content with clear headings
- Direct answers to common questions
- Use of schema markup

## Why AEO Matters
AI-powered search is changing how people find information. Traditional SEO focused on ranking in search results, but AEO focuses on being cited by AI engines.

## Best Practices for AEO
1. Start with a direct answer (TL;DR)
2. Use question-style headings
3. Include FAQ sections
4. Keep paragraphs short and scannable
5. Add structured data markup

## Frequently Asked Questions
### Q: Why does AEO matter?
AEO matters because AI answers are the new SERP. When users ask questions to AI assistants, they get direct answers instead of a list of links.

### Q: How is AEO different from SEO?
While SEO optimizes for search engine rankings, AEO optimizes for being cited and quoted by AI engines in their responses.

### Q: What are the key elements of AEO?
Key elements include direct answers, structured content, FAQ sections, and content that AI can easily extract and cite.

## Key Takeaways
- Direct answers win in AI search
- Use FAQs to cover common questions
- Structure content for easy extraction
- AEO complements traditional SEO
- Focus on being quotable and citable"""


class TestResult:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name: str, detail: str = ""):
        self.passed.append(f"✅ {test_name}" + (f": {detail}" if detail else ""))
    
    def add_fail(self, test_name: str, detail: str):
        self.failed.append(f"❌ {test_name}: {detail}")
    
    def add_warning(self, test_name: str, detail: str):
        self.warnings.append(f"⚠️  {test_name}: {detail}")
    
    def print_summary(self):
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        
        if self.failed:
            print("\n❌ FAILED TESTS:")
            for f in self.failed:
                print(f"  {f}")
        
        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for w in self.warnings:
                print(f"  {w}")
        
        if self.passed:
            print("\n✅ PASSED TESTS:")
            for p in self.passed:
                print(f"  {p}")
        
        print("\n" + "="*80)
        print(f"Total: {len(self.passed)} passed, {len(self.failed)} failed, {len(self.warnings)} warnings")
        print("="*80 + "\n")


def login() -> Optional[requests.Session]:
    """Login and return session with cookies."""
    print(f"\n[TEST 1] Auth - POST /api/auth/login")
    session = requests.Session()
    
    try:
        resp = session.post(
            f"{API_BASE}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ Login failed: {resp.status_code} - {resp.text[:200]}")
            return None
        
        data = resp.json()
        print(f"✅ Login successful: {data.get('email')}")
        print(f"   Cookies: {list(session.cookies.keys())}")
        return session
    
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None


def test_create_draft(session: requests.Session, result: TestResult) -> Optional[str]:
    """Test POST /api/content-writer/drafts"""
    print(f"\n[TEST 2] POST /api/content-writer/drafts - Create draft")
    
    try:
        start = time.time()
        resp = session.post(
            f"{API_BASE}/content-writer/drafts",
            json=SAMPLE_DRAFT,
            timeout=15
        )
        elapsed = time.time() - start
        
        if resp.status_code != 200:
            result.add_fail("Create draft", f"Status {resp.status_code}: {resp.text[:300]}")
            return None
        
        data = resp.json()
        
        # Verify response shape
        required_fields = ["id", "title", "content", "word_count", "scores", "breakdown", "suggestions", "created_at", "updated_at"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            result.add_fail("Create draft", f"Missing fields: {missing}")
            return None
        
        # Verify scores structure
        scores = data.get("scores", {})
        required_scores = ["seo", "aeo", "readability", "overall", "flesch"]
        missing_scores = [s for s in required_scores if s not in scores]
        if missing_scores:
            result.add_fail("Create draft", f"Missing scores: {missing_scores}")
            return None
        
        # Verify breakdown structure
        breakdown = data.get("breakdown", {})
        if "seo" not in breakdown or "aeo" not in breakdown or "keywords" not in breakdown:
            result.add_fail("Create draft", f"Invalid breakdown structure: {list(breakdown.keys())}")
            return None
        
        # Check breakdown arrays
        if not isinstance(breakdown["seo"], list) or len(breakdown["seo"]) != 7:
            result.add_fail("Create draft", f"SEO breakdown should have 7 items, got {len(breakdown.get('seo', []))}")
            return None
        
        if not isinstance(breakdown["aeo"], list) or len(breakdown["aeo"]) != 7:
            result.add_fail("Create draft", f"AEO breakdown should have 7 items, got {len(breakdown.get('aeo', []))}")
            return None
        
        if not isinstance(breakdown["keywords"], list) or len(breakdown["keywords"]) != 2:
            result.add_fail("Create draft", f"Keywords breakdown should have 2 items, got {len(breakdown.get('keywords', []))}")
            return None
        
        # Verify word count
        word_count = data.get("word_count", 0)
        if word_count <= 0:
            result.add_fail("Create draft", f"Word count should be > 0, got {word_count}")
            return None
        
        draft_id = data.get("id")
        result.add_pass(
            "Create draft",
            f"id={draft_id[:8]}..., word_count={word_count}, scores={{seo:{scores['seo']}, aeo:{scores['aeo']}, overall:{scores['overall']}}}, elapsed={elapsed:.2f}s"
        )
        
        print(f"   Draft ID: {draft_id}")
        print(f"   Word count: {word_count}")
        print(f"   Scores: SEO={scores['seo']}, AEO={scores['aeo']}, Overall={scores['overall']}")
        print(f"   Breakdown: {len(breakdown['seo'])} SEO items, {len(breakdown['aeo'])} AEO items, {len(breakdown['keywords'])} keywords")
        print(f"   Suggestions: {len(data.get('suggestions', []))} items")
        print(f"   Elapsed: {elapsed:.2f}s")
        
        return draft_id
    
    except Exception as e:
        result.add_fail("Create draft", f"Exception: {e}")
        return None


def test_list_drafts(session: requests.Session, result: TestResult, expected_id: str):
    """Test GET /api/content-writer/drafts"""
    print(f"\n[TEST 3] GET /api/content-writer/drafts - List drafts")
    
    try:
        resp = session.get(f"{API_BASE}/content-writer/drafts", timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("List drafts", f"Status {resp.status_code}: {resp.text[:300]}")
            return
        
        data = resp.json()
        
        if not isinstance(data, list):
            result.add_fail("List drafts", f"Expected array, got {type(data)}")
            return
        
        # Find our draft
        our_draft = None
        for d in data:
            if d.get("id") == expected_id:
                our_draft = d
                break
        
        if not our_draft:
            result.add_fail("List drafts", f"Draft {expected_id[:8]}... not found in list of {len(data)} drafts")
            return
        
        # Verify lightweight projection (should NOT have full content)
        required_fields = ["id", "title", "topic", "keywords", "word_count", "scores", "preview", "created_at", "updated_at"]
        missing = [f for f in required_fields if f not in our_draft]
        if missing:
            result.add_fail("List drafts", f"Missing fields: {missing}")
            return
        
        if "content" in our_draft:
            result.add_warning("List drafts", "Full 'content' field present in list (should be lightweight)")
        
        result.add_pass(
            "List drafts",
            f"Found draft in list of {len(data)} items, preview={our_draft.get('preview', '')[:50]}..."
        )
        
        print(f"   Total drafts: {len(data)}")
        print(f"   Our draft found: {our_draft.get('title')}")
        print(f"   Preview: {our_draft.get('preview', '')[:80]}...")
    
    except Exception as e:
        result.add_fail("List drafts", f"Exception: {e}")


def test_get_draft(session: requests.Session, result: TestResult, draft_id: str):
    """Test GET /api/content-writer/drafts/{id}"""
    print(f"\n[TEST 4] GET /api/content-writer/drafts/{draft_id[:8]}... - Get single draft")
    
    try:
        resp = session.get(f"{API_BASE}/content-writer/drafts/{draft_id}", timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("Get draft", f"Status {resp.status_code}: {resp.text[:300]}")
            return
        
        data = resp.json()
        
        # Verify full document with content
        if "content" not in data:
            result.add_fail("Get draft", "Missing 'content' field in full draft")
            return
        
        if data.get("id") != draft_id:
            result.add_fail("Get draft", f"ID mismatch: expected {draft_id}, got {data.get('id')}")
            return
        
        content_len = len(data.get("content", ""))
        result.add_pass("Get draft", f"Full draft retrieved, content length={content_len} chars")
        
        print(f"   Title: {data.get('title')}")
        print(f"   Content length: {content_len} chars")
        print(f"   Word count: {data.get('word_count')}")
    
    except Exception as e:
        result.add_fail("Get draft", f"Exception: {e}")


def test_update_draft(session: requests.Session, result: TestResult, draft_id: str):
    """Test PATCH /api/content-writer/drafts/{id} - verify re-scoring without LLM"""
    print(f"\n[TEST 5] PATCH /api/content-writer/drafts/{draft_id[:8]}... - Update draft")
    
    try:
        # Get original scores and updated_at
        resp = session.get(f"{API_BASE}/content-writer/drafts/{draft_id}", timeout=10)
        if resp.status_code != 200:
            result.add_fail("Update draft (pre-check)", f"Failed to get original: {resp.status_code}")
            return
        
        original = resp.json()
        original_word_count = original.get("word_count", 0)
        original_scores = original.get("scores", {})
        original_updated_at = original.get("updated_at")
        
        print(f"   Original: word_count={original_word_count}, scores={original_scores}, updated_at={original_updated_at}")
        
        # Wait a moment to ensure updated_at changes
        time.sleep(1)
        
        # Update with longer content
        start = time.time()
        resp = session.patch(
            f"{API_BASE}/content-writer/drafts/{draft_id}",
            json={"content": UPDATED_CONTENT},
            timeout=15
        )
        elapsed = time.time() - start
        
        if resp.status_code != 200:
            result.add_fail("Update draft", f"Status {resp.status_code}: {resp.text[:300]}")
            return
        
        # Verify it completed quickly (< 1s means no LLM call)
        if elapsed >= 1.0:
            result.add_warning("Update draft", f"Took {elapsed:.2f}s (expected < 1s for no-LLM re-scoring)")
        
        data = resp.json()
        new_word_count = data.get("word_count", 0)
        new_scores = data.get("scores", {})
        new_updated_at = data.get("updated_at")
        
        print(f"   Updated: word_count={new_word_count}, scores={new_scores}, updated_at={new_updated_at}")
        print(f"   Elapsed: {elapsed:.2f}s")
        
        # Verify word count increased
        if new_word_count <= original_word_count:
            result.add_fail("Update draft", f"Word count did not increase: {original_word_count} -> {new_word_count}")
            return
        
        # Verify scores changed (at least one score should be different)
        scores_changed = any(
            new_scores.get(k) != original_scores.get(k)
            for k in ["seo", "aeo", "readability", "overall"]
        )
        if not scores_changed:
            result.add_warning("Update draft", "Scores did not change after content update")
        
        # Verify updated_at changed
        if new_updated_at == original_updated_at:
            result.add_fail("Update draft", "updated_at did not change")
            return
        
        result.add_pass(
            "Update draft",
            f"word_count {original_word_count}->{new_word_count}, scores updated, elapsed={elapsed:.2f}s (< 1s = no LLM)"
        )
    
    except Exception as e:
        result.add_fail("Update draft", f"Exception: {e}")


def test_score_endpoint(session: requests.Session, result: TestResult):
    """Test POST /api/content-writer/score - score without persistence"""
    print(f"\n[TEST 6] POST /api/content-writer/score - Score without persistence")
    
    try:
        test_content = """# Test Article
META: A test article for scoring.
TL;DR: This is a test.

## Introduction
This is a test article with some content.

- Point one
- Point two

## Frequently Asked Questions
### Q: Is this a test?
Yes, this is a test article.

## Key Takeaways
- Testing works
- Scoring is fast"""
        
        start = time.time()
        resp = session.post(
            f"{API_BASE}/content-writer/score",
            json={
                "content": test_content,
                "topic": "test article",
                "keywords": ["test", "article"]
            },
            timeout=15
        )
        elapsed = time.time() - start
        
        if resp.status_code != 200:
            result.add_fail("Score endpoint", f"Status {resp.status_code}: {resp.text[:300]}")
            return
        
        data = resp.json()
        
        # Verify scores dict returned
        if "scores" not in data:
            result.add_fail("Score endpoint", "Missing 'scores' in response")
            return
        
        scores = data.get("scores", {})
        if not all(k in scores for k in ["seo", "aeo", "readability", "overall"]):
            result.add_fail("Score endpoint", f"Incomplete scores: {list(scores.keys())}")
            return
        
        # Verify it's fast (no LLM)
        if elapsed >= 1.0:
            result.add_warning("Score endpoint", f"Took {elapsed:.2f}s (expected < 1s)")
        
        result.add_pass(
            "Score endpoint",
            f"scores={{seo:{scores['seo']}, aeo:{scores['aeo']}, overall:{scores['overall']}}}, elapsed={elapsed:.2f}s"
        )
        
        print(f"   Scores: {scores}")
        print(f"   Elapsed: {elapsed:.2f}s")
    
    except Exception as e:
        result.add_fail("Score endpoint", f"Exception: {e}")


def test_delete_draft(session: requests.Session, result: TestResult, draft_id: str):
    """Test DELETE /api/content-writer/drafts/{id}"""
    print(f"\n[TEST 7] DELETE /api/content-writer/drafts/{draft_id[:8]}... - Delete draft")
    
    try:
        resp = session.delete(f"{API_BASE}/content-writer/drafts/{draft_id}", timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("Delete draft", f"Status {resp.status_code}: {resp.text[:300]}")
            return
        
        data = resp.json()
        if not data.get("ok"):
            result.add_fail("Delete draft", f"Expected {{ok: true}}, got {data}")
            return
        
        result.add_pass("Delete draft", "Returned {ok: true}")
        
        # Verify 404 on subsequent GET
        print(f"   Verifying 404 on GET after delete...")
        resp = session.get(f"{API_BASE}/content-writer/drafts/{draft_id}", timeout=10)
        
        if resp.status_code != 404:
            result.add_fail("Delete draft (verify 404)", f"Expected 404, got {resp.status_code}")
            return
        
        result.add_pass("Delete draft (verify 404)", "GET after delete returns 404")
        print(f"   ✅ GET returns 404 as expected")
    
    except Exception as e:
        result.add_fail("Delete draft", f"Exception: {e}")


def test_unauth_access(result: TestResult):
    """Test unauthenticated access returns 401"""
    print(f"\n[TEST 8] Unauth check - GET /api/content-writer/drafts without cookie")
    
    try:
        # Create new session without login
        unauth_session = requests.Session()
        resp = unauth_session.get(f"{API_BASE}/content-writer/drafts", timeout=10)
        
        if resp.status_code != 401:
            result.add_fail("Unauth check", f"Expected 401, got {resp.status_code}")
            return
        
        result.add_pass("Unauth check", "Returns 401 without auth cookie")
        print(f"   ✅ Returns 401 as expected")
    
    except Exception as e:
        result.add_fail("Unauth check", f"Exception: {e}")


def main():
    print("="*80)
    print("CONTENT WRITER 'SAVE DRAFTS' BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    print(f"Admin: {ADMIN_EMAIL}")
    print("="*80)
    
    result = TestResult()
    
    # Test 1: Login
    session = login()
    if not session:
        print("\n❌ FATAL: Login failed, cannot continue")
        return
    
    result.add_pass("Auth", f"Login successful as {ADMIN_EMAIL}")
    
    # Test 2: Create draft
    draft_id = test_create_draft(session, result)
    if not draft_id:
        print("\n❌ FATAL: Create draft failed, cannot continue")
        result.print_summary()
        return
    
    # Test 3: List drafts
    test_list_drafts(session, result, draft_id)
    
    # Test 4: Get single draft
    test_get_draft(session, result, draft_id)
    
    # Test 5: Update draft (verify re-scoring)
    test_update_draft(session, result, draft_id)
    
    # Test 6: Score endpoint (no persistence)
    test_score_endpoint(session, result)
    
    # Test 7: Delete draft
    test_delete_draft(session, result, draft_id)
    
    # Test 8: Unauth check
    test_unauth_access(result)
    
    # Print summary
    result.print_summary()
    
    # Exit with appropriate code
    if result.failed:
        exit(1)
    else:
        exit(0)


if __name__ == "__main__":
    main()
