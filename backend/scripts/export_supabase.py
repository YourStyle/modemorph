#!/usr/bin/env python3
"""
Export all data and schema from Supabase PostgreSQL.
Connects directly to Supabase Postgres and dumps:
1. Full schema (CREATE TABLE statements with constraints)
2. All data as INSERT statements
3. RPC function definitions (PL/pgSQL)
4. Auth users table (for migration)

Output: backend/migrations/001_schema.sql + backend/data_export/
"""

import json
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

# Supabase direct connection (non-pooling for schema access)
DATABASE_URL = "host=db.cipjxxtdmfhoqixtiruy.supabase.co port=5432 dbname=postgres user=postgres password=UOClJEtrW92UaNQp sslmode=require"

EXPORT_DIR = os.path.join(os.path.dirname(__file__), "..", "data_export")
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations")


def json_serializer(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    raise TypeError(f"Type {type(obj)} not serializable")


def connect():
    print("Connecting to Supabase PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_client_encoding("UTF8")
    print("Connected!")
    return conn


def get_public_tables(cur):
    cur.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    return [row[0] for row in cur.fetchall()]


def get_table_schema(cur, table_name):
    """Get CREATE TABLE statement for a table."""
    # Get columns
    cur.execute("""
        SELECT column_name, data_type, udt_name, is_nullable,
               column_default, character_maximum_length,
               numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """, (table_name,))
    columns = cur.fetchall()

    # Get primary key
    cur.execute("""
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = %s
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
    """, (table_name,))
    pk_columns = [row[0] for row in cur.fetchall()]

    # Get unique constraints
    cur.execute("""
        SELECT tc.constraint_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = %s
          AND tc.constraint_type = 'UNIQUE'
        ORDER BY tc.constraint_name, kcu.ordinal_position
    """, (table_name,))
    unique_constraints = {}
    for row in cur.fetchall():
        unique_constraints.setdefault(row[0], []).append(row[1])

    # Get foreign keys
    cur.execute("""
        SELECT
            kcu.column_name,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = %s
          AND tc.constraint_type = 'FOREIGN KEY'
    """, (table_name,))
    foreign_keys = cur.fetchall()

    return {
        "columns": columns,
        "primary_key": pk_columns,
        "unique_constraints": unique_constraints,
        "foreign_keys": foreign_keys,
    }


def build_create_table_sql(table_name, schema):
    lines = []
    for col in schema["columns"]:
        col_name, data_type, udt_name, is_nullable, default, max_len, num_prec, num_scale = col

        # Map data type
        if udt_name == "uuid":
            type_str = "UUID"
        elif udt_name == "jsonb":
            type_str = "JSONB"
        elif udt_name == "json":
            type_str = "JSON"
        elif udt_name == "timestamptz":
            type_str = "TIMESTAMPTZ"
        elif udt_name == "timestamp":
            type_str = "TIMESTAMP"
        elif udt_name in ("int4", "int8", "int2"):
            type_str = {"int4": "INTEGER", "int8": "BIGINT", "int2": "SMALLINT"}[udt_name]
        elif udt_name == "float8":
            type_str = "DOUBLE PRECISION"
        elif udt_name == "float4":
            type_str = "REAL"
        elif udt_name == "numeric":
            if num_prec and num_scale:
                type_str = f"NUMERIC({num_prec},{num_scale})"
            else:
                type_str = "NUMERIC"
        elif udt_name == "bool":
            type_str = "BOOLEAN"
        elif udt_name == "text":
            type_str = "TEXT"
        elif udt_name == "varchar":
            type_str = f"VARCHAR({max_len})" if max_len else "VARCHAR"
        elif data_type == "ARRAY":
            type_str = "TEXT[]"
        else:
            type_str = data_type.upper()

        parts = [f'    "{col_name}" {type_str}']
        if is_nullable == "NO":
            parts.append("NOT NULL")
        if default:
            # Clean up Supabase-specific defaults
            clean_default = default.replace("::text", "").replace("::character varying", "")
            parts.append(f"DEFAULT {clean_default}")

        lines.append(" ".join(parts))

    # Primary key
    if schema["primary_key"]:
        pk_cols = ", ".join(f'"{c}"' for c in schema["primary_key"])
        lines.append(f"    PRIMARY KEY ({pk_cols})")

    # Unique constraints
    for name, cols in schema["unique_constraints"].items():
        u_cols = ", ".join(f'"{c}"' for c in cols)
        lines.append(f"    UNIQUE ({u_cols})")

    sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" (\n'
    sql += ",\n".join(lines)
    sql += "\n);\n"

    # Foreign keys as ALTER TABLE (to handle circular deps)
    for fk in schema["foreign_keys"]:
        col, ftable, fcol = fk
        sql += f'\nALTER TABLE "{table_name}" ADD FOREIGN KEY ("{col}") REFERENCES "{ftable}"("{fcol}");\n'

    return sql


def get_rpc_functions(cur):
    """Get all user-defined PL/pgSQL functions in public schema."""
    cur.execute("""
        SELECT
            p.proname AS function_name,
            pg_get_functiondef(p.oid) AS function_def
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
        ORDER BY p.proname
    """)
    return cur.fetchall()


def get_auth_users(cur):
    """Get auth.users for migration (id, email, encrypted_password, metadata)."""
    try:
        cur.execute("""
            SELECT id, email, encrypted_password, raw_user_meta_data,
                   created_at, email_confirmed_at, role
            FROM auth.users
            ORDER BY created_at
        """)
        return cur.fetchall()
    except Exception as e:
        print(f"  Warning: Cannot access auth.users: {e}")
        return []


def export_table_data(cur, table_name):
    """Export all rows from a table as JSON."""
    cur.execute(f'SELECT * FROM "{table_name}"')
    columns = [desc[0] for desc in cur.description]
    rows = cur.fetchall()

    data = []
    for row in rows:
        record = {}
        for i, col in enumerate(columns):
            record[col] = row[i]
        data.append(record)

    return {"table": table_name, "columns": columns, "row_count": len(data), "rows": data}


def get_indexes(cur):
    """Get all custom indexes."""
    cur.execute("""
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname
    """)
    return [row[0] for row in cur.fetchall()]


def get_enums(cur):
    """Get custom enum types."""
    cur.execute("""
        SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public'
        GROUP BY t.typname
    """)
    return cur.fetchall()


def main():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    os.makedirs(MIGRATIONS_DIR, exist_ok=True)

    conn = connect()
    cur = conn.cursor()

    # 1. Get all tables
    tables = get_public_tables(cur)
    print(f"\nFound {len(tables)} tables: {', '.join(tables)}")

    # 2. Export schema
    print("\n--- Exporting Schema ---")
    schema_sql = "-- ModeMorph Database Schema\n"
    schema_sql += f"-- Exported from Supabase on {datetime.now().isoformat()}\n"
    schema_sql += "-- Auto-generated by export_supabase.py\n\n"

    # Extensions
    schema_sql += 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n'
    schema_sql += 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n'

    # Enums
    enums = get_enums(cur)
    if enums:
        schema_sql += "-- Enum types\n"
        for enum_name, enum_values in enums:
            values = ", ".join(f"'{v}'" for v in enum_values)
            schema_sql += f"CREATE TYPE {enum_name} AS ENUM ({values});\n"
        schema_sql += "\n"

    # Tables
    for table in tables:
        print(f"  Schema: {table}")
        schema = get_table_schema(cur, table)
        schema_sql += f"-- Table: {table}\n"
        schema_sql += build_create_table_sql(table, schema)
        schema_sql += "\n"

    # Indexes
    indexes = get_indexes(cur)
    if indexes:
        schema_sql += "\n-- Indexes\n"
        for idx in indexes:
            schema_sql += f"{idx};\n"

    # RPC Functions
    print("\n--- Exporting RPC Functions ---")
    functions = get_rpc_functions(cur)
    if functions:
        schema_sql += "\n-- Functions (RPC)\n"
        for func_name, func_def in functions:
            print(f"  Function: {func_name}")
            schema_sql += f"\n{func_def};\n"

    schema_path = os.path.join(MIGRATIONS_DIR, "001_schema.sql")
    with open(schema_path, "w") as f:
        f.write(schema_sql)
    print(f"\nSchema saved to: {schema_path}")

    # 3. Export data
    print("\n--- Exporting Data ---")
    summary = {}
    for table in tables:
        print(f"  Data: {table}...", end=" ")
        data = export_table_data(cur, table)
        print(f"{data['row_count']} rows")
        summary[table] = data["row_count"]

        data_path = os.path.join(EXPORT_DIR, f"{table}.json")
        with open(data_path, "w") as f:
            json.dump(data, f, default=json_serializer, ensure_ascii=False, indent=2)

    # 4. Export auth users
    print("\n--- Exporting Auth Users ---")
    cur2 = conn.cursor(cursor_factory=RealDictCursor)
    auth_users = get_auth_users(cur2)
    if auth_users:
        print(f"  Found {len(auth_users)} users")
        users_path = os.path.join(EXPORT_DIR, "_auth_users.json")
        with open(users_path, "w") as f:
            json.dump(
                [dict(u) for u in auth_users],
                f, default=json_serializer, ensure_ascii=False, indent=2
            )

    # 5. Summary
    print("\n=== Export Summary ===")
    total_rows = 0
    for table, count in sorted(summary.items()):
        print(f"  {table}: {count} rows")
        total_rows += count
    print(f"\n  Total: {len(tables)} tables, {total_rows} rows")
    print(f"  Functions: {len(functions)}")
    print(f"  Auth users: {len(auth_users)}")

    cur.close()
    cur2.close()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
