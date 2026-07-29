#!/usr/bin/env python3
"""Report which Bedrock model IDs this AWS account can actually invoke.

The daily swim-set and dryland generators pick their model from an ordered
candidate list (the GeneratorModelIds stack parameter, surfaced to the Lambdas
as MODEL_IDS). Two independent things decide whether a candidate works, and
they fail in ways that look identical from the site's side:

  * The ID form. Newer Claude models are inference-profile-only on Bedrock, so
    the bare foundation-model ID is rejected with a ValidationException telling
    you to use an inference profile. The US cross-region profile ID is the same
    string with a "us." prefix.
  * Model access. Bedrock grants access per foundation model, per region, in
    the console (Bedrock > Model access). An ID that is spelled correctly but
    not granted fails with AccessDeniedException.

This script answers both by making a real one-token invoke_model call against
each candidate, which is the only check that proves access end to end.

Usage (locally, with AWS creds in the environment):
    python3 scripts/check-bedrock-models.py
    python3 scripts/check-bedrock-models.py --region us-west-2
    python3 scripts/check-bedrock-models.py anthropic.claude-haiku-4-5 us.anthropic.claude-haiku-4-5

Exit status is 0 if at least one candidate is invokable, 1 otherwise.
"""
import argparse
import json
import sys

import boto3
from botocore.exceptions import ClientError

# Mirrors the GeneratorModelIds default in cloudformation/template.yml, plus the
# Claude 3 Haiku ID the search Lambda uses (an older model that still supports
# on-demand throughput, so it needs no inference profile).
DEFAULT_CANDIDATES = [
    "us.anthropic.claude-haiku-4-5",
    "anthropic.claude-haiku-4-5",
    "us.anthropic.claude-sonnet-4-6",
    "anthropic.claude-sonnet-4-6",
    "anthropic.claude-3-haiku-20240307-v1:0",
]

# The generators treat exactly these as "this model ID is unusable on this
# account" and fall through to the next candidate.
UNUSABLE = ("ValidationException", "AccessDeniedException", "ResourceNotFoundException")


def probe(client, model_id):
    """Invoke model_id with a trivial prompt. Returns (ok, detail)."""
    try:
        client.invoke_model(
            modelId=model_id,
            body=json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "hi"}],
                }
            ),
        )
    except ClientError as ex:
        code = ex.response.get("Error", {}).get("Code", "UnknownError")
        message = ex.response.get("Error", {}).get("Message", str(ex))
        return False, "%s: %s" % (code, message)
    return True, "invokable"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("model_ids", nargs="*", help="model IDs to probe (default: the generators' candidate list)")
    parser.add_argument("--region", default="us-east-1", help="Bedrock region (default: us-east-1, where the generators run)")
    args = parser.parse_args()

    candidates = args.model_ids or DEFAULT_CANDIDATES
    client = boto3.client("bedrock-runtime", region_name=args.region)

    print("Probing %d model ID(s) in %s\n" % (len(candidates), args.region))
    usable = []
    for model_id in candidates:
        ok, detail = probe(client, model_id)
        if ok:
            usable.append(model_id)
            print("  OK       %s" % model_id)
        else:
            # Flag the two failure modes the generators skip past, so a typo or a
            # missing model-access grant reads differently from a real outage.
            code = detail.split(":", 1)[0]
            mark = "SKIPPED " if code in UNUSABLE else "ERROR   "
            print("  %s %s\n             %s" % (mark, model_id, detail))

    if not usable:
        print("\nNo candidate is invokable. Grant model access in the Bedrock console")
        print("(Bedrock > Model access) for the region above, then re-run.")
        return 1

    print("\nUsable, in candidate order: %s" % ", ".join(usable))
    print("The generators will use: %s" % usable[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
