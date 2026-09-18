#!/usr/bin/env python3
"""
Generates legacy Android Room-format SQLite databases for manual migration
testing of ticket #470 (Android legacy ids collide across accounts).

Creates three files:
  general_db               — stores the accounts table (shared across accounts)
  account_db_1             — account 1's entity tables (categories, balances, ...)
  account_db_2             — account 2's entity tables

Both account databases use the SAME primary-key sequences (id 10 category,
id 100 balance, id 200 recurring, id 300 saving_goal, id 400 template). On a
real device the pre-fix reader derived a UUID from only "<entity>:<pk>", so
these collisions collapsed into one row per entity and broke identity; the
#470 fix scopes by "<entity>:<accountId>:<pk>", so each account keeps a
distinct, reproducible row.

Schema (column names) follows docs/migration/local_schema_map.md Part 1 and
the queries in packages/core/src/migration/local/android-reader.ts.

Usage:
  python3 scripts/seed-android-legacy-fixtures.py --out <dir>
"""

import argparse
import os
import sqlite3


def create_general_db(path: str, account_count: int, online_ids: set) -> None:
    """accounts / access / users tables the reader joins in readAndroidRoomData."""
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY,
          name TEXT,
          account_abbreviation TEXT,
          description TEXT,
          color_hex_code TEXT,
          is_online INTEGER,
          isDefault INTEGER,
          last_synced_at TEXT,
          created_at TEXT,
          updated_at TEXT,
          remote_id INTEGER,
          deleted INTEGER
        );
        CREATE TABLE access (
          id INTEGER PRIMARY KEY,
          account_id INTEGER,
          accountId INTEGER,
          role TEXT,
          userId INTEGER,
          email TEXT,
          firstName TEXT,
          lastName TEXT,
          created_at TEXT,
          updated_at TEXT
        );
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          account_id INTEGER,
          user_name TEXT
        );
        """
    )
    # Accounts listed in --online get is_online=1 plus a remote_id, which is
    # what isServerMirroredAccount() keys on. Everything else stays local-only.
    cur.executemany(
        """
        INSERT INTO accounts
          (id, name, account_abbreviation, is_online, isDefault,
           last_synced_at, remote_id, deleted)
        VALUES (?, ?, ?, ?, 0, ?, ?, 0)
        """,
        [
            (
                i,
                f"Online Account {i}" if i in online_ids else f"Test Account {i}",
                f"A{i}",
                1 if i in online_ids else 0,
                "20260801T093000.000+0000" if i in online_ids else None,
                500 + i if i in online_ids else None,
            )
            for i in range(1, account_count + 1)
        ],
    )

    # Shared-account roster for each online account: one owner + three members.
    # The reader has two disagreeing queries — a JOIN on access.account_id (the
    # local id) and a fallback matching access.accountId against remote_id — so
    # seed both columns to exercise whichever path runs.
    access_rows = []
    next_id = 100
    for i in sorted(online_ids):
        people = [
            ("OWNER", "owner@example.com", "Owner", "Name"),
            ("MEMBER", "member1@example.com", "Member", "A"),
            ("MEMBER", "member2@example.com", "Member", "B"),
            ("MEMBER", "member3@example.com", "Member", "C"),
        ]
        for user_id, (role, email, first, last) in enumerate(people, start=1):
            access_rows.append((next_id, i, 500 + i, role, user_id, email, first, last))
            next_id += 1
    if access_rows:
        cur.executemany(
            """
            INSERT INTO access
              (id, account_id, accountId, role, userId, email, firstName, lastName)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            access_rows,
        )
    conn.commit()
    conn.close()


def create_account_db(path: str, account_id: int, category_name: str) -> None:
    """Room entity tables for one account. Primary keys deliberately collide
    across the two account databases (id 10/100/200/300/400 in both)."""
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY,
          name TEXT,
          type TEXT,
          icon_name TEXT,
          default_flag TEXT,
          "limit" REAL,
          "limit_date" TEXT,
          deleted INTEGER
        );
        CREATE TABLE balances (
          id INTEGER PRIMARY KEY,
          user_id INTEGER,
          amount REAL,
          date TEXT,
          category_id INTEGER,
          name TEXT,
          type TEXT,
          created_at TEXT,
          saving_goal_id INTEGER,
          deleted INTEGER,
          is_transfer_balance INTEGER
        );
        CREATE TABLE recurring (
          id INTEGER PRIMARY KEY,
          repeating INTEGER,
          amount REAL,
          category_id INTEGER,
          start_date TEXT,
          name TEXT,
          type TEXT,
          deleted INTEGER
        );
        CREATE TABLE saving_goals (
          id INTEGER PRIMARY KEY,
          name TEXT,
          amount REAL,
          monthly_amount REAL,
          due_date TEXT,
          category_id INTEGER,
          is_open INTEGER,
          creation_date TEXT,
          deleted INTEGER
        );
        CREATE TABLE templates (
          id INTEGER PRIMARY KEY,
          name TEXT,
          amount REAL,
          category_id INTEGER,
          type TEXT,
          deleted INTEGER
        );
        CREATE TABLE room_master_table (
          id INTEGER PRIMARY KEY,
          identity_hash TEXT
        );
        """
    )
    # Every entity type uses PK 10 (category), 100 (balance), 200 (recurring),
    # 300 (saving goal), 400 (template) — identical in both account DBs.
    cur.executemany(
        "INSERT INTO categories (id, name, type, icon_name, default_flag, deleted) "
        "VALUES (?, ?, 'EXPENSE', NULL, 'CUSTOM', 0)",
        [(10, category_name)],
    )
    cur.executemany(
        "INSERT INTO balances (id, user_id, amount, date, category_id, name, type, "
        "created_at, saving_goal_id, deleted, is_transfer_balance) "
        "VALUES (?, ?, ?, ?, ?, ?, 'EXPENSE', ?, NULL, 0, 0)",
        [
            (100, account_id, 12.5, "20240315", 10,
             f"Lunch {account_id}", "20240315"),
        ],
    )
    cur.executemany(
        "INSERT INTO recurring (id, repeating, amount, category_id, start_date, "
        "name, type, deleted) VALUES (?, 1, ?, ?, ?, ?, 'EXPENSE', 0)",
        [(200, 9.99, 10, "20240101", f"Netflix {account_id}")],
    )
    cur.executemany(
        "INSERT INTO saving_goals (id, name, amount, monthly_amount, due_date, "
        "category_id, is_open, creation_date, deleted) "
        "VALUES (?, ?, ?, ?, ?, 10, 1, ?, 0)",
        [(300, f"Vacation {account_id}", 1000.0, 100.0, "20241231", "20240101")],
    )
    cur.executemany(
        "INSERT INTO templates (id, name, amount, category_id, type, deleted) "
        "VALUES (?, ?, ?, 10, 'EXPENSE', 0)",
        [(400, f"Phone Bill {account_id}", 29.99)],
    )
    conn.commit()
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Output directory for the .db files")
    parser.add_argument(
        "--accounts", type=int, default=2,
        help="Number of account DBs to generate, all sharing the same colliding PKs (default: 2)",
    )
    parser.add_argument(
        "--online", default="",
        help="Comma-separated account ids to mark as legacy online accounts "
             "(is_online=1 + remote_id + a 4-person access roster), e.g. --online 2",
    )
    args = parser.parse_args()

    online_ids = {int(x) for x in args.online.split(",") if x.strip()}

    out = args.out
    os.makedirs(out, exist_ok=True)
    create_general_db(os.path.join(out, "general_db"), args.accounts, online_ids)
    # Account IDs 1..N — must match the ids used in create_general_db.
    names = ["general_db"]
    for i in range(1, args.accounts + 1):
        db_name = f"account_db_{i}"
        create_account_db(os.path.join(out, db_name), i, f"Custom {i} Food")
        names.append(db_name)

    print(f"Created fixtures in {out}:")
    for n in names:
        p = os.path.join(out, n)
        print(f"  {p} ({os.path.getsize(p)} bytes)")


if __name__ == "__main__":
    main()
