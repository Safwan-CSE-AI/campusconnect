"""
CampusConnect AI - Automated Test Suite
Verifies all endpoints, AI matching logic, privacy redaction, and demo flow.
"""

import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def run_tests():
    print("[TEST] Starting CampusConnect AI Test Suite...")

    # 1. Test Static Index
    req = urllib.request.urlopen(f"{BASE_URL}/")
    assert req.status == 200
    html = req.read().decode("utf-8")
    assert "CampusConnect" in html
    print("[PASS] 1. Static Index HTML served successfully.")

    # 2. Test Items List (Privacy Guard Check)
    req = urllib.request.urlopen(f"{BASE_URL}/api/items")
    items = json.loads(req.read().decode("utf-8"))
    assert len(items) >= 40, f"Expected >=40 items, got {len(items)}"
    print(f"[PASS] 2. Items API returned {len(items)} items.")

    # Check privacy redaction on public items
    for item in items:
        if not item.get("is_authorized_viewer"):
            assert item.get("private_identification_details") is None, "Privacy Leak Detected!"
    print("[PASS] 3. Zero-Leak Privacy Guard: Private details are strictly redacted for public items.")

    # 3. Test Matches & Explainable AI
    req = urllib.request.urlopen(f"{BASE_URL}/api/matches?min_score=60")
    matches = json.loads(req.read().decode("utf-8"))
    assert len(matches) >= 8, f"Expected >=8 matches, got {len(matches)}"
    top_match = matches[0]
    assert top_match["match_score"] >= 85.0
    assert len(top_match["match_reasons"]) >= 4
    print(f"[PASS] 4. Smart Matches Engine: Top match score = {top_match['match_score']}%, Reasons count = {len(top_match['match_reasons'])}.")

    # 4. Test New Report Submission & Instant Match Trigger
    new_lost_payload = {
        "report_type": "LOST",
        "item_name": "Test Hydro Flask Blue",
        "category": "Other",
        "brand": "Hydro Flask",
        "color": "Blue",
        "description": "Insulated blue water bottle left in CS Lab",
        "campus_zone": "Computer Science Lab",
        "building": "Turing Technology Block",
        "floor": "3rd Floor",
        "date_time": "2026-08-22 11:00",
        "private_identification_details": "Initials PS engraved on base",
        "image_urls": []
    }
    req_post = urllib.request.Request(
        f"{BASE_URL}/api/items?user_id=1",
        data=json.dumps(new_lost_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    res_post = json.loads(urllib.request.urlopen(req_post).read().decode("utf-8"))
    assert res_post["item"]["id"] is not None
    assert "recovery_probability" in res_post
    print(f"[PASS] 5. New Report Submission: Created item ID {res_post['item']['id']} with Recovery Probability {res_post['recovery_probability']}%.")

    # 5. Test Ownership Verification Claim Challenge
    claim_payload = {
        "match_id": 1,
        "lost_report_id": 1,
        "found_report_id": 21,
        "verification_answer": "Small red sticker inside the charging case."
    }
    req_claim = urllib.request.Request(
        f"{BASE_URL}/api/claims?user_id=1",
        data=json.dumps(claim_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    claim_res = json.loads(urllib.request.urlopen(req_claim).read().decode("utf-8"))
    assert claim_res["verification_score"] >= 85.0
    print(f"[PASS] 6. Ownership Claim Challenge: Score = {claim_res['verification_score']}%, Status = {claim_res['status']}.")

    # 6. Test QR Code Generation
    req_qr = urllib.request.urlopen(f"{BASE_URL}/api/qr/21")
    qr_data = req_qr.read()
    assert len(qr_data) > 100
    print(f"[PASS] 7. QR Code Asset Tag generated: {len(qr_data)} bytes.")

    # 7. Test Analytics Overview
    req_analytics = urllib.request.urlopen(f"{BASE_URL}/api/analytics/overview")
    analytics = json.loads(req_analytics.read().decode("utf-8"))
    assert analytics["total_lost"] >= 1240
    assert analytics["items_returned"] >= 780
    assert len(analytics["category_distribution"]) > 0
    print(f"[PASS] 8. Analytics Overview: Total Lost = {analytics['total_lost']}, Returned = {analytics['items_returned']}, Rate = {analytics['recovery_rate_percent']}%.")

    # 8. Test 1-Click Hackathon Demo Scenario
    req_demo = urllib.request.Request(
        f"{BASE_URL}/api/demo/run-scenario",
        data=b"{}",
        headers={"Content-Type": "application/json"}
    )
    demo_res = json.loads(urllib.request.urlopen(req_demo).read().decode("utf-8"))
    assert demo_res["status"] == "success"
    assert demo_res["scenario"]["final_status"] == "RETURNED"
    assert demo_res["scenario"]["match_score"] >= 90.0
    print(f"[PASS] 9. 1-Click Autonomous Demo: Scenario Completed! Score = {demo_res['scenario']['match_score']}%, Result = {demo_res['scenario']['final_status']}.")

    print("\n[SUCCESS] ALL 9 AUTOMATED TEST SUITE CHECKS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_tests()
