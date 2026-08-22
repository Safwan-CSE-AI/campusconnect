"""
CampusConnect AI - Database Models, SQLite WAL Optimization, and Seed Generator
Relational database schema with full foreign key constraints, high-performance WAL mode,
compound indexes, activity feed events, and realistic demo dataset.
"""

import sqlite3
import json
import os
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Generator

DB_PATH = os.path.join(os.path.dirname(__file__), "campusconnect.db")

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA cache_size = -64000") # 64MB Cache
    return conn

@contextmanager
def get_db_context() -> Generator[sqlite3.Connection, None, None]:
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with get_db_context() as conn:
        cursor = conn.cursor()

        # Users Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            student_or_employee_id TEXT NOT NULL,
            department TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'STUDENT', -- STUDENT, MODERATOR, ADMIN
            profile_image TEXT,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # Item Reports Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS item_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            report_type TEXT NOT NULL, -- LOST, FOUND
            item_name TEXT NOT NULL,
            category TEXT NOT NULL,
            brand TEXT,
            color TEXT NOT NULL,
            description TEXT NOT NULL,
            image_urls TEXT, -- JSON array of image URLs
            date_time TEXT NOT NULL,
            campus_zone TEXT NOT NULL,
            building TEXT NOT NULL,
            floor TEXT,
            approximate_location TEXT,
            private_identification_details TEXT, -- SENSITIVE: Never exposed publicly
            current_item_location TEXT DEFAULT 'With Finder', -- With finder, Campus security, Lost and Found office, Department office
            status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, MATCHED, CLAIM_PENDING, VERIFICATION_PENDING, VERIFIED, HANDOVER_PENDING, RETURNED, CLOSED
            qr_code_url TEXT,
            recovery_probability INTEGER DEFAULT 65,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """)

        # Matches Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lost_report_id INTEGER NOT NULL,
            found_report_id INTEGER NOT NULL,
            match_score REAL NOT NULL, -- 0 to 100
            item_score REAL NOT NULL,
            description_score REAL NOT NULL,
            location_score REAL NOT NULL,
            time_score REAL NOT NULL,
            color_brand_score REAL NOT NULL,
            image_score REAL NOT NULL,
            match_reasons TEXT NOT NULL, -- JSON array of strings
            match_status TEXT NOT NULL DEFAULT 'SUGGESTED', -- SUGGESTED, CLAIMED, VERIFIED, REJECTED
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lost_report_id) REFERENCES item_reports (id) ON DELETE CASCADE,
            FOREIGN KEY (found_report_id) REFERENCES item_reports (id) ON DELETE CASCADE,
            UNIQUE(lost_report_id, found_report_id)
        )
        """)

        # Claims Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER,
            lost_report_id INTEGER NOT NULL,
            found_report_id INTEGER NOT NULL,
            claimant_id INTEGER NOT NULL,
            claimant_name TEXT NOT NULL,
            verification_answers TEXT NOT NULL, -- JSON object
            verification_score REAL NOT NULL DEFAULT 0, -- 0 to 100
            status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, MODERATOR_REVIEW
            reviewed_by TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lost_report_id) REFERENCES item_reports (id) ON DELETE CASCADE,
            FOREIGN KEY (found_report_id) REFERENCES item_reports (id) ON DELETE CASCADE,
            FOREIGN KEY (claimant_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """)

        # Handovers Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS handovers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER,
            claim_id INTEGER,
            lost_report_id INTEGER NOT NULL,
            found_report_id INTEGER NOT NULL,
            location TEXT NOT NULL,
            scheduled_time TEXT NOT NULL,
            owner_confirmed INTEGER DEFAULT 0,
            finder_confirmed INTEGER DEFAULT 0,
            moderator_confirmed INTEGER DEFAULT 0,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED, COMPLETED, CANCELLED
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lost_report_id) REFERENCES item_reports (id) ON DELETE CASCADE,
            FOREIGN KEY (found_report_id) REFERENCES item_reports (id) ON DELETE CASCADE
        )
        """)

        # Notifications Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL, -- MATCH, CLAIM, VERIFIED, HANDOVER, RETURNED, SYSTEM
            is_read INTEGER DEFAULT 0,
            link_action TEXT,
            metadata TEXT, -- JSON
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """)

        # Campus Zones Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS campus_zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            building TEXT NOT NULL,
            zone_code TEXT NOT NULL,
            loss_weight REAL DEFAULT 1.0,
            description TEXT
        )
        """)

        # Live Campus Activity Feed Table (Privacy-Safe)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_feed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL, -- LOST, FOUND, MATCH, CLAIM, RETURNED
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            campus_zone TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT 'sparkles',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # Performance Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_items_composite ON item_reports(report_type, category, campus_zone, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_items_user ON item_reports(user_id, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_lookup ON matches(lost_report_id, found_report_id, match_score)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_feed(created_at DESC)")

def seed_db():
    with get_db_context() as conn:
        cursor = conn.cursor()

        # Check if users already seeded
        cursor.execute("SELECT COUNT(*) as c FROM users")
        if cursor.fetchone()["c"] > 0:
            return

        print("[DB] Seeding CampusConnect AI database...")

        # 1. Seed Users (3 Personas)
        users_data = [
            ("Alex Rivera", "student@campus.edu", "STU-2024-8891", "Computer Science", "STUDENT", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150", "student123"),
            ("Officer Marcus Vance", "security@campus.edu", "SEC-1044", "Campus Security & Safety", "MODERATOR", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", "security123"),
            ("Dr. Eleanor Vance", "admin@campus.edu", "ADM-0021", "Dean of Student Affairs", "ADMIN", "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150", "admin123"),
            ("Sarah Jenkins", "sarah.j@campus.edu", "STU-2023-4412", "Mechanical Engineering", "STUDENT", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150", "student123"),
            ("David Kim", "david.k@campus.edu", "STU-2025-1109", "Business Administration", "STUDENT", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", "student123")
        ]

        from auth import hash_password
        for u in users_data:
            cursor.execute("""
            INSERT INTO users (name, email, student_or_employee_id, department, role, profile_image, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (u[0], u[1], u[2], u[3], u[4], u[5], hash_password(u[6])))

        # 2. Seed Campus Zones
        zones_data = [
            ("Central Library", "Library Building", "LIB", 28.0, "High-density academic study area with 4 floors and quiet zones."),
            ("Student Cafeteria", "Dining Hall & Student Center", "CAF", 20.0, "High foot-traffic dining and social hub."),
            ("Computer Science Lab", "Turing Technology Block", "CSL", 15.0, "Software labs, robotics center, and project workspaces."),
            ("Main Auditorium", "Arts & Convention Complex", "AUD", 12.0, "Event space for campus ceremonies, guest lectures, and concerts."),
            ("Classroom Block A", "Academic Wing East", "CBA", 10.0, "General lecture halls and seminar rooms."),
            ("Playground & Sports Complex", "Athletic Pavilion", "SPT", 7.0, "Gym, indoor badminton courts, track and field pavilion."),
            ("Campus Parking Area", "North & South Lots", "PRK", 4.0, "Vehicle parking and bicycle docking bays."),
            ("Student Hostel Block", "Residential Quad", "HST", 3.0, "Dormitories, common lounges, and residential study halls."),
            ("Main Bus Stop", "Campus Transit Hub", "BUS", 1.0, "University shuttle station and transit entrance.")
        ]
        for z in zones_data:
            cursor.execute("""
            INSERT OR IGNORE INTO campus_zones (name, building, zone_code, loss_weight, description)
            VALUES (?, ?, ?, ?, ?)
            """, z)

        now = datetime.now()
        t_minus_1h = (now - timedelta(hours=1, minutes=15)).strftime("%Y-%m-%d %H:%M")
        t_minus_45m = (now - timedelta(minutes=45)).strftime("%Y-%m-%d %H:%M")
        t_minus_25m = (now - timedelta(minutes=25)).strftime("%Y-%m-%d %H:%M")
        t_minus_3h = (now - timedelta(hours=3)).strftime("%Y-%m-%d %H:%M")
        t_minus_5h = (now - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M")
        t_minus_1d = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M")
        t_minus_2d = (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M")

        # 3. Seed Items (Including Flagship JBL Earbuds Scenario)
        items_data = [
            # Flagship Lost Item (ID 1)
            (
                1, 1, "Alex Rivera", "LOST", "Black JBL Wireless Earbuds", "Electronics", "JBL", "Black",
                "Black JBL earbuds in a small matte charging case with a small scratch on the right side.",
                json.dumps(["https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600"]),
                t_minus_45m, "Central Library", "Library Building", "2nd Floor", "Desk 42 near window",
                "Small red sticker inside the charging case.", "With Finder", "ACTIVE", 91
            ),
            # Flagship Found Item (ID 11)
            (
                11, 2, "Officer Marcus Vance", "FOUND", "Black Wireless Earbuds", "Electronics", "JBL", "Black",
                "Black wireless earbuds in charging case found on table near entrance.",
                json.dumps(["https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600"]),
                t_minus_25m, "Central Library", "Library Building", "Entrance", "Security Turnstiles",
                "Found inside case with small red sticker.", "Campus security", "ACTIVE", 95
            ),
            # Lost MacBook
            (
                2, 4, "Sarah Jenkins", "LOST", "Space Gray MacBook Air M2", "Electronics", "Apple", "Space Gray",
                "13-inch Space Gray Apple laptop with transparent hardshell cover left after study group.",
                json.dumps(["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600"]),
                t_minus_3h, "Student Cafeteria", "Dining Hall & Student Center", "1st Floor", "Juice Bar Booth Table 4",
                "GitHub Octocat sticker on palmrest, password hint: BlueCosmos", "With Finder", "ACTIVE", 78
            ),
            # Found MacBook
            (
                12, 2, "Officer Marcus Vance", "FOUND", "Apple Laptop with Clear Cover", "Electronics", "Apple", "Space Gray",
                "Space gray MacBook Air turned in by cafeteria cleaner.",
                json.dumps(["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600"]),
                t_minus_1h, "Student Cafeteria", "Dining Hall & Student Center", "Patio", "Turned in to Lost & Found",
                "Has Octocat developer sticker on keyboard area.", "Campus security", "ACTIVE", 86
            ),
            # Lost Wallet
            (
                3, 5, "David Kim", "LOST", "Brown Leather Coach Wallet", "Wallet", "Coach", "Brown",
                "Genuine brown leather bifold wallet with contrast beige stitching.",
                json.dumps(["https://images.unsplash.com/photo-1627123424574-724758594e93?w=600"]),
                t_minus_5h, "Main Auditorium", "Arts & Convention Complex", "Lobby", "Row G Seat 14",
                "California Driver's License ending 9821, gym card #441, $45 cash inside.", "With Finder", "ACTIVE", 82
            ),
            # Found Wallet
            (
                13, 2, "Officer Marcus Vance", "FOUND", "Brown Leather Bifold Wallet", "Wallet", "Coach", "Brown",
                "Brown leather men's wallet found under seating aisle after morning orientation.",
                json.dumps(["https://images.unsplash.com/photo-1627123424574-724758594e93?w=600"]),
                t_minus_3h, "Main Auditorium", "Arts & Convention Complex", "Row G", "Security Turnstiles",
                "Contains student ID and gym membership pass.", "Campus security", "ACTIVE", 89
            ),
            # Lost ID Card
            (
                4, 1, "Alex Rivera", "LOST", "University Student ID Card", "ID Card", "Campus ID", "Blue/White",
                "Plastic campus student access badge with lanyard clip.",
                json.dumps(["https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600"]),
                t_minus_1d, "Computer Science Lab", "Turing Technology Block", "2nd Floor", "Lab 204 Station 12",
                "Student ID number STU-2024-8891 printed on back barcode.", "With Finder", "RETURNED", 96
            ),
            # Found ID Card
            (
                14, 2, "Officer Marcus Vance", "FOUND", "Student Access Card Badge", "ID Card", "Campus ID", "Blue/White",
                "Student smartcard with blue campus lanyard.",
                json.dumps(["https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600"]),
                t_minus_1d, "Computer Science Lab", "Turing Technology Block", "1st Floor", "Main Entrance Security",
                "STU-2024-8891 on barcode.", "Campus security", "RETURNED", 98
            ),
            # Lost Keys
            (
                5, 4, "Sarah Jenkins", "LOST", "Toyota Car Key & Blue Carabiner", "Keys", "Toyota", "Silver/Black",
                "Toyota smart key fob with small silver key and blue metal carabiner clip.",
                json.dumps(["https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600"]),
                t_minus_2d, "Campus Parking Area", "North & South Lots", "North Lot", "Near Section B light pole",
                "Gym locker mini-tag #108 attached.", "With Finder", "ACTIVE", 72
            ),
            # Found Keys
            (
                15, 5, "David Kim", "FOUND", "Car Key Fob with Carabiner", "Keys", "Toyota", "Black",
                "Electronic key fob on blue aluminum clip found in parking lot walkway.",
                json.dumps(["https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600"]),
                t_minus_1d, "Campus Parking Area", "North & South Lots", "South Lot", "Walkway to Library",
                "Locker tag #108.", "With Finder", "ACTIVE", 80
            ),
            # Lost Hydro Flask Bottle
            (
                6, 5, "David Kim", "LOST", "Navy Blue Hydro Flask 32oz", "Other", "Hydro Flask", "Navy Blue",
                "Wide mouth insulated water bottle with black flex cap and slight bottom dent.",
                json.dumps(["https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600"]),
                t_minus_3h, "Playground & Sports Complex", "Athletic Pavilion", "Bleachers", "Section 3 top row",
                "NASA Artemis mission holographic sticker on side.", "With Finder", "ACTIVE", 64
            )
        ]

        for item in items_data:
            cursor.execute("""
            INSERT OR REPLACE INTO item_reports (
                id, user_id, user_name, report_type, item_name, category, brand, color, description,
                image_urls, date_time, campus_zone, building, floor, approximate_location,
                private_identification_details, current_item_location, status, recovery_probability,
                qr_code_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8],
                item[9], item[10], item[11], item[12], item[13], item[14], item[15], item[16], item[17], item[18],
                f"/api/qr/{item[0]}"
            ))

        # 4. Seed Matches (Flagship Earbuds 91.5% Match)
        earbuds_reasons = json.dumps([
            "✓ Same item category (Electronics)",
            "✓ Similar color (Black)",
            "✓ Same campus zone (Central Library)",
            "✓ Found 35 minutes after reported loss",
            "✓ Semantic description alignment (94% similarity)",
            "✓ Matching brand identifier (JBL)"
        ])
        cursor.execute("""
        INSERT OR REPLACE INTO matches (
            id, lost_report_id, found_report_id, match_score, item_score, description_score,
            location_score, time_score, color_brand_score, image_score, match_reasons, match_status
        ) VALUES (
            1, 1, 11, 91.5, 95.0, 92.0, 90.0, 95.0, 90.0, 85.0, ?, 'SUGGESTED'
        )
        """, (earbuds_reasons,))

        # Seed MacBook Match (87.0%)
        macbook_reasons = json.dumps([
            "✓ Same item category (Electronics)",
            "✓ Matching brand identifier (Apple)",
            "✓ Same campus zone (Student Cafeteria)",
            "✓ Found within 2 hours of loss",
            "✓ High description token similarity (90%)"
        ])
        cursor.execute("""
        INSERT OR REPLACE INTO matches (
            id, lost_report_id, found_report_id, match_score, item_score, description_score,
            location_score, time_score, color_brand_score, image_score, match_reasons, match_status
        ) VALUES (
            2, 2, 12, 87.0, 92.0, 88.0, 85.0, 85.0, 90.0, 80.0, ?, 'SUGGESTED'
        )
        """, (macbook_reasons,))

        # Seed Wallet Match (89.0%)
        wallet_reasons = json.dumps([
            "✓ Same item category (Wallet)",
            "✓ Matching brand identifier (Coach)",
            "✓ Same campus zone (Main Auditorium)",
            "✓ Matching color family (Brown leather)",
            "✓ Found 2 hours after reported loss"
        ])
        cursor.execute("""
        INSERT OR REPLACE INTO matches (
            id, lost_report_id, found_report_id, match_score, item_score, description_score,
            location_score, time_score, color_brand_score, image_score, match_reasons, match_status
        ) VALUES (
            3, 3, 13, 89.0, 94.0, 86.0, 90.0, 88.0, 92.0, 80.0, ?, 'SUGGESTED'
        )
        """, (wallet_reasons,))

        # 5. Seed Live Privacy-Safe Activity Feed
        activities = [
            ("LOST", "🔴 Lost Report Logged", "Black JBL Wireless Earbuds reported lost near Central Library", "Central Library", "help-circle"),
            ("FOUND", "🟢 Found Item Turned In", "Black Wireless Earbuds safely delivered to Security Desk", "Central Library", "check-circle-2"),
            ("MATCH", "🧠 AI Reconnection Detected", "91% Strong Match identified for Black JBL Earbuds", "Central Library", "sparkles"),
            ("CLAIM", "🔐 Ownership Quiz Answered", "Private verification challenge passed (95% confidence)", "Central Library", "shield-check"),
            ("RETURNED", "🎉 Item Successfully Reunited", "University Student ID Card returned to Alex Rivera", "Computer Science Lab", "package-check"),
            ("FOUND", "🟢 Found Item Turned In", "Apple MacBook Air in clear case turned in to Lost & Found", "Student Cafeteria", "laptop")
        ]
        for act in activities:
            cursor.execute("""
            INSERT INTO activity_feed (event_type, title, description, campus_zone, icon)
            VALUES (?, ?, ?, ?, ?)
            """, act)

        # 6. Seed Notifications
        cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, link_action, metadata)
        VALUES (
            1,
            '🎯 91% Match Detected!',
            'The Recovery Intelligence Engine found a 91% match for your Black JBL Wireless Earbuds at Central Library.',
            'MATCH',
            'match_1',
            ?
        )
        """, (json.dumps({"match_id": 1, "lost_id": 1, "found_id": 11}),))

        print("[DB] CampusConnect AI database seeded successfully with Top 5 Hackathon intelligence data.")
