#!/usr/bin/env python3
"""Delete every account row from the streamline-users DynamoDB table.

This is a one-shot maintenance tool for the "wipe all accounts" operation. It
is intentionally narrow: it only touches streamline-users. It does NOT delete
training plans, sessions/tokens, newsletter subscribers, or contact messages.
(Sessions become useless on their own once the user row is gone, because the
auth Lambda re-checks the user on every request.)

Safety:
  * Refuses to run unless CONFIRM (env) or --confirm equals the exact phrase
    "DELETE ALL ACCOUNTS".
  * Prints the row count before and after so the deletion is auditable in logs.
  * Pass --dry-run to only count and list a sample, deleting nothing.

Usage (locally, with AWS creds in the environment):
    CONFIRM='DELETE ALL ACCOUNTS' python3 scripts/purge-accounts.py
    python3 scripts/purge-accounts.py --dry-run
"""
import argparse
import os
import sys

import boto3

CONFIRM_PHRASE = "DELETE ALL ACCOUNTS"
TABLE_NAME = "streamline-users"
KEY_ATTR = "email"


def main():
    parser = argparse.ArgumentParser(description="Delete all rows from streamline-users.")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    parser.add_argument("--table", default=TABLE_NAME)
    parser.add_argument("--dry-run", action="store_true", help="Count only; delete nothing.")
    parser.add_argument("--confirm", default=os.environ.get("CONFIRM", ""),
                        help='Must equal "%s" to actually delete.' % CONFIRM_PHRASE)
    args = parser.parse_args()

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)

    # Read-only pass: collect every primary key and a small sample for the log.
    keys = []
    sample = []
    scan_kwargs = {"ProjectionExpression": "#e", "ExpressionAttributeNames": {"#e": KEY_ATTR}}
    start_key = None
    while True:
        if start_key:
            scan_kwargs["ExclusiveStartKey"] = start_key
        resp = table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            email = item.get(KEY_ATTR)
            if email:
                keys.append(email)
                if len(sample) < 5:
                    sample.append(email)
        start_key = resp.get("LastEvaluatedKey")
        if not start_key:
            break

    print("table: %s (%s)" % (args.table, args.region))
    print("accounts found: %d" % len(keys))
    print("sample: %s" % sample)

    if args.dry_run:
        print("dry-run: nothing deleted.")
        return 0

    if args.confirm != CONFIRM_PHRASE:
        print('refusing to delete: set CONFIRM (or --confirm) to the exact phrase "%s".' % CONFIRM_PHRASE,
              file=sys.stderr)
        return 2

    if not keys:
        print("nothing to delete.")
        return 0

    deleted = 0
    with table.batch_writer() as batch:
        for email in keys:
            batch.delete_item(Key={KEY_ATTR: email})
            deleted += 1

    remaining = table.scan(Select="COUNT").get("Count", "?")
    print("deleted: %d" % deleted)
    print("remaining rows after purge: %s" % remaining)
    return 0


if __name__ == "__main__":
    sys.exit(main())
