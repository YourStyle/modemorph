#!/usr/bin/env python3
"""
Import exported Supabase data into local PostgreSQL.
Run after migrations have been applied.

Usage:
    python import_data.py [--db-url postgresql://...]
"""

import json
import os
import sys
import psycopg2
from psycopg2.extras import execute_values

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data_export")
DEFAULT_DB_URL = "host=localhost port=5433 dbname=modemorph user=modemorph password=modemorph"

# Import order (respects foreign key deps)
TABLE_ORDER = [
    "basic_materials",
    "basic_wardrobe_items",
    "basic_item_materials",
    "combinations",
    "combination_elements",
    "credit_packs",
    "subscription_pricing",
    "feature_costs",
    # users imported separately (from _auth_users.json)
    # user_profiles depend on users
    "user_profiles",
    "limits",
    "user_credits",
    "user_subscriptions",
    "credit_transactions",
    "payments",
    "wardrobe_items",
    "wardrobe_user_items",
    "outfits",
    "outfit_items",
    "user_looks",
    "looks_sections",
    "section_looks",
    "user_likes",
    "user_events",
    "usage_events",
    "daily_user_activity",
    "main_recommendations",
    "weather_cache",
    "broadcast_messages",
    "reminder_configs",
    "recs_jobs",
    "recs_settings",
    "user_avatars",
    "user_fittings",
    "user_style_profiles",
]


def import_auth_users(cur):
    """Import auth.users into the new users table."""
    path = os.path.join(DATA_DIR, "_auth_users.json")
    if not os.path.exists(path):
        print("  No auth users file found, skipping")
        return 0

    with open(path) as f:
        users = json.load(f)

    count = 0
    for u in users:
        try:
            cur.execute(
                """
                INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at, email_confirmed_at, role)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    u["id"],
                    u["email"],
                    u.get("encrypted_password", ""),
                    json.dumps(u.get("raw_user_meta_data", {})),
                    u.get("created_at"),
                    u.get("email_confirmed_at"),
                    u.get("role", "authenticated"),
                ),
            )
            count += 1
        except Exception as e:
            print(f"  Warning: user {u.get('email')}: {e}")
    return count


def import_table(cur, table_name):
    """Import a single table from JSON export."""
    path = os.path.join(DATA_DIR, f"{table_name}.json")
    if not os.path.exists(path):
        print(f"  {table_name}: no export file, skipping")
        return 0

    with open(path) as f:
        data = json.load(f)

    rows = data.get("rows", [])
    if not rows:
        print(f"  {table_name}: 0 rows")
        return 0

    columns = data.get("columns", list(rows[0].keys()))

    # Build INSERT
    cols_str = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    sql = f'INSERT INTO "{table_name}" ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

    # Detect array columns (float arrays like embeddings)
    # Check first row to find list-of-numbers columns
    array_cols = set()
    if rows:
        for col in columns:
            val = rows[0].get(col)
            if isinstance(val, list) and val and isinstance(val[0], (int, float)):
                array_cols.add(col)

    count = 0
    for row in rows:
        values = []
        for col in columns:
            val = row.get(col)
            if val is None:
                values.append(None)
            elif col in array_cols and isinstance(val, list):
                # Convert Python list to PostgreSQL array literal: {1.0, 2.0, ...}
                val = "{" + ",".join(str(x) for x in val) + "}"
                values.append(val)
            elif isinstance(val, (dict, list)):
                # Convert dicts/lists to JSON strings for JSONB columns
                val = json.dumps(val, ensure_ascii=False)
                values.append(val)
            else:
                values.append(val)
        try:
            cur.execute(sql, values)
            count += 1
        except Exception as e:
            print(f"  Warning: {table_name} row error: {e}")
            cur.connection.rollback()

    return count


def main():
    db_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB_URL
    print(f"Connecting to: {db_url}")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    # 1. Import auth users first
    print("\n--- Importing auth users ---")
    user_count = import_auth_users(cur)
    conn.commit()
    print(f"  Imported {user_count} users")

    # 2. Import tables in order
    print("\n--- Importing tables ---")
    for table in TABLE_ORDER:
        count = import_table(cur, table)
        conn.commit()
        print(f"  {table}: {count} rows imported")

    # 3. Reset sequences
    print("\n--- Resetting sequences ---")
    cur.execute("""
        SELECT c.relname
        FROM pg_class c
        WHERE c.relkind = 'S'
    """)
    sequences = [r[0] for r in cur.fetchall()]
    for seq in sequences:
        # Try to find matching table/column
        table = seq.replace("_id_seq", "").replace("_seq", "")
        try:
            cur.execute(f"SELECT setval('{seq}', COALESCE((SELECT MAX(id) FROM \"{table}\"), 1))")
        except Exception:
            conn.rollback()

    conn.commit()
    cur.close()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
