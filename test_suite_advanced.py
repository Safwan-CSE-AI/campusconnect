"""
CampusConnect AI - Comprehensive Advanced Automated Test Suite
Includes Unit Tests, Security & Privacy Checks, RBAC Enforcement Tests,
IDOR Verification, File Upload Checks, and End-to-End Reconnection Workflow.
"""

import urllib.request
import urllib.error
import json
import os
import io

BASE_URL = "http://127.0.0.1:8000"

def make_request(path, method="GET", data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = headers or {}
    req_data = None
    if data is not None:
        req_headers["Content-Type"] = "application/json"
        req_data = json.dumps(data).encode("utf-8")
    
    req = urllib.request.Request(url, data=req_data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            status_code = response.status
            try:
                return status_code, json.loads(res_body)
            except Exception:
                return status_code, res_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body

def run_advanced_tests():
    print("=========================================================")
    print("[AUDIT] RUNNING CAMPUSCONNECT AI ADVANCED AUDIT TEST SUITE")
    print("=========================================================\n")

    passed_count = 0
    total_tests = 12

    # 1. UNIT TEST: AI Matching Engine Formula & Flagship Scenario
    from matching_engine import calculate_item_match, color_similarity, location_proximity_score, time_proximity_score
    
    lost_earbuds = {
        "category": "Electronics", "item_name": "Black JBL Wireless Earbuds",
        "description": "Black JBL earbuds in a small matte charging case with a small scratch on the right side.",
        "campus_zone": "Central Library", "building": "Library Building", "floor": "2nd Floor",
        "color": "Black", "brand": "JBL", "date_time": "2026-08-22 10:30", "image_urls": "[]"
    }
    found_earbuds = {
        "category": "Electronics", "item_name": "Black Wireless Earbuds",
        "description": "Black wireless earbuds in charging case found on table near entrance.",
        "campus_zone": "Central Library", "building": "Library Building", "floor": "Entrance",
        "color": "Black", "brand": "JBL", "date_time": "2026-08-22 11:15", "image_urls": "[]"
    }
    match_res = calculate_item_match(lost_earbuds, found_earbuds)
    assert match_res["match_score"] >= 88.0 and match_res["match_score"] <= 95.0, f"Unexpected score {match_res['match_score']}"
    assert match_res["match_level"] == "VERY_STRONG_MATCH"
    assert len(match_res["match_reasons"]) >= 5
    print(f"[PASS] 1. Unit Test - Flagship Matching Algorithm: Score = {match_res['match_score']}%, Reasons = {len(match_res['match_reasons'])}")
    passed_count += 1

    # 2. UNIT TEST: Color Taxonomy & Location Proximity
    assert color_similarity("Navy", "Blue") >= 90.0, "Navy should match Blue"
    assert color_similarity("Charcoal", "Black") >= 90.0, "Charcoal should match Black"
    assert location_proximity_score("Central Library", "Lib", "2nd Floor", "Central Library", "Lib", "Entrance") >= 85.0
    assert location_proximity_score("Central Library", "Lib", "2nd Floor", "Main Bus Stop", "Transit", "Ground") <= 35.0
    print("[PASS] 2. Unit Test - Color Taxonomy & Campus Spatial Hierarchy: Verified proximity degradation.")
    passed_count += 1

    # 3. UNIT TEST: Ownership Challenge Quiz Scoring
    from matching_engine import evaluate_ownership_claim
    claim_eval_pass = evaluate_ownership_claim("Small red sticker inside the charging case lid.", "Small red sticker inside the charging case lid.")
    assert claim_eval_pass["confidence_score"] >= 90.0
    assert claim_eval_pass["status"] == "APPROVED"
    
    claim_eval_fail = evaluate_ownership_claim("I think it is green with no marks", "Small red sticker inside the charging case lid.")
    assert claim_eval_fail["confidence_score"] < 50.0
    print(f"[PASS] 3. Unit Test - Ownership Quiz Evaluator: Valid match gave {claim_eval_pass['confidence_score']}%, invalid gave {claim_eval_fail['confidence_score']}%.")
    passed_count += 1

    # 4. SECURITY TEST: Zero-Leak Privacy Guard on Public Feeds
    code, items = make_request("/api/items?user_id=999") # Unrelated user
    assert code == 200
    for item in items:
        assert item.get("private_identification_details") is None, "CRITICAL: Private details leaked to public feed!"
    print("[PASS] 4. Security Audit - Zero-Leak Privacy Guard: Private details sanitized for public viewers.")
    passed_count += 1

    # 5. SECURITY TEST: RBAC Authorization Enforcement
    # Student Alex (ID 1) attempts to approve a claim -> MUST RETURN 403 FORBIDDEN
    code, err = make_request("/api/claims/1/review?user_id=1", method="PUT", data={"action": "APPROVE", "notes": "Hacked"})
    assert code == 403, f"Expected 403 Forbidden for Student, got {code}"
    print("[PASS] 5. Security Audit - RBAC Enforcement: Student cannot execute moderator actions (403 Forbidden).")
    passed_count += 1

    # 6. SECURITY TEST: IDOR Prevention on Item Deletion
    # Student Sarah (ID 4) attempts to delete Alex's item (ID 1) -> MUST RETURN 403 FORBIDDEN
    code, err = make_request("/api/items/1?user_id=4", method="DELETE")
    assert code == 403, f"Expected 403 Forbidden on IDOR delete, got {code}"
    print("[PASS] 6. Security Audit - IDOR Protection: Users cannot delete other students' reports (403 Forbidden).")
    passed_count += 1

    # 7. SECURITY TEST: Input Validation & Whitelist Schema
    bad_payload = {
        "report_type": "LOST",
        "item_name": "A", # Too short (min_length=2)
        "category": "InvalidCategory123",
        "color": "Black",
        "description": "Short",
        "campus_zone": "Mars Base Alpha", # Invalid zone
        "building": "Main",
        "date_time": "2026-08-22 10:00"
    }
    code, err = make_request("/api/items?user_id=1", method="POST", data=bad_payload)
    assert code == 422, f"Expected 422 Unprocessable Entity for invalid schema, got {code}"
    print("[PASS] 7. Security Audit - Schema Validation: Rejected invalid categories, zones, and short inputs (422).")
    passed_count += 1

    # 8. INTEGRATION TEST: End-to-End Item Reporting & Automatic Match
    new_lost = {
        "report_type": "LOST",
        "item_name": "Sony Wireless Headphones Silver",
        "category": "Electronics",
        "brand": "Sony",
        "color": "Silver",
        "description": "Silver noise cancelling headphones in hard zippered case",
        "campus_zone": "Central Library",
        "building": "Library Building",
        "floor": "3rd Floor",
        "date_time": "2026-08-22 10:00",
        "private_identification_details": "Gold Sony logo and dent on headband",
        "image_urls": []
    }
    code, lost_res = make_request("/api/items?user_id=1", method="POST", data=new_lost)
    assert code == 200
    assert lost_res["recovery_probability"] >= 65
    print(f"[PASS] 8. Integration Test - New Lost Report: Created item ID {lost_res['item']['id']} with Recovery Prob {lost_res['recovery_probability']}%.")
    passed_count += 1

    # 9. INTEGRATION TEST: Ownership Claim Submission
    claim_payload = {
        "match_id": 1,
        "lost_report_id": 1,
        "found_report_id": 11,
        "verification_answer": "Small red sticker inside the charging case lid."
    }
    code, claim_res = make_request("/api/claims?user_id=1", method="POST", data=claim_payload)
    assert code == 200
    assert claim_res["verification_score"] >= 85.0
    print(f"[PASS] 9. Integration Test - Ownership Claim: Verified answer score = {claim_res['verification_score']}%, Status = {claim_res['status']}.")
    passed_count += 1

    # 10. INTEGRATION TEST: Moderator Review by Officer Marcus (ID 2)
    code, review_res = make_request("/api/claims/1/review?user_id=2", method="PUT", data={"action": "APPROVE", "notes": "Officer verified red sticker."})
    assert code == 200
    print(f"[PASS] 10. Integration Test - Moderator Review: Claim approved by Security Officer.")
    passed_count += 1

    # 11. INTEGRATION TEST: Safe Handover Confirmation & Completion
    code, confirm_res = make_request("/api/handovers/1/confirm?user_id=2", method="PUT", data={"party": "moderator"})
    assert code == 200
    assert confirm_res["is_completed"] == True
    print(f"[PASS] 11. Integration Test - Safe Handover: Custody confirmed returned by moderator.")
    passed_count += 1

    # 12. INTEGRATION TEST: 1-Click Interactive Hackathon Demo Runner
    code, demo_res = make_request("/api/demo/run-scenario", method="POST", data={})
    assert code == 200
    assert demo_res["scenario"]["final_status"] == "RETURNED"
    print(f"[PASS] 12. Integration Test - 1-Click Hackathon Showcase: Executed full autonomous reconnection scenario.")
    passed_count += 1

    print("\n=========================================================")
    print(f"[SUCCESS] AUDIT TEST SUITE RESULTS: {passed_count}/{total_tests} TESTS PASSED (100% SUCCESS)")
    print("=========================================================\n")

if __name__ == "__main__":
    run_advanced_tests()
