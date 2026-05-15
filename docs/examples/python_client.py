"""
Trust Layer — Python Client Example

Usage:
    python python_client.py

Requires: requests (pip install requests)
"""

import json
import requests

BASE_URL = "http://localhost:3000"


class TrustLayerClient:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.token: str | None = None

    # ── Agent Management ───────────────────────────────

    def register_agent(self, name: str, scope: str) -> dict:
        """Register a new agent and get credentials."""
        res = requests.post(f"{self.base_url}/v1/agents", json={
            "name": name,
            "scope": scope,
        })
        res.raise_for_status()
        data = res.json()
        self.token = data["token"]
        return data

    # ── Policy Management ──────────────────────────────

    def set_policy(self, agent: str, allow: list[dict], deny: list[dict] | None = None) -> dict:
        """Set a policy for an agent."""
        body = {"agent": agent, "allow": allow}
        if deny:
            body["deny"] = deny
        res = requests.post(f"{self.base_url}/v1/policies", json=body)
        res.raise_for_status()
        return res.json()

    # ── Chat ───────────────────────────────────────────

    def chat(self, messages: list[dict], model: str | None = None) -> dict:
        """Proxy a chat completion to the target LLM."""
        body = {"messages": messages}
        if model:
            body["model"] = model
        res = requests.post(f"{self.base_url}/v1/chat", json=body)
        res.raise_for_status()
        return res.json()

    # ── Verify ─────────────────────────────────────────

    def verify(self, response: str, sources: list[dict], action: str, resource: str) -> dict:
        """Ground and guard an existing response."""
        body = {
            "response": response,
            "sources": sources,
            "action": action,
            "resource": resource,
        }
        if self.token:
            body["agent_token"] = self.token
        res = requests.post(f"{self.base_url}/v1/verify", json=body)
        return res.json()

    # ── Chat + Verify ──────────────────────────────────

    def chat_and_verify(
        self,
        messages: list[dict],
        sources: list[dict],
        action: str,
        resource: str,
        model: str | None = None,
    ) -> dict:
        """Full pipeline: chat → ground → guard → audit."""
        body = {
            "messages": messages,
            "sources": sources,
            "action": action,
            "resource": resource,
        }
        if model:
            body["model"] = model
        if self.token:
            body["agent_token"] = self.token
        res = requests.post(f"{self.base_url}/v1/chat/verify", json=body)
        return res.json()

    # ── Audit ──────────────────────────────────────────

    def get_audit_log(self, limit: int = 10) -> list[dict]:
        """Fetch recent audit log entries."""
        res = requests.get(f"{self.base_url}/v1/audit", params={"limit": limit})
        res.raise_for_status()
        return res.json()


# ── Demo ──────────────────────────────────────────────

def main():
    client = TrustLayerClient()

    print("=== Trust Layer Demo ===\n")

    # 1. Register agent
    creds = client.register_agent("hr-bot", "hr:read")
    print(f"Registered agent: {creds['agent_id']}")

    # 2. Set policy
    client.set_policy(
        agent="hr-bot",
        allow=[{"action": "read", "resource": "employee-records/*"}],
        deny=[{"action": "delete", "resource": "*"}],
    )
    print("Policy set: allow read employee-records/*, deny delete *")

    # 3. Chat + verify
    print("\n--- Chat + Verify ---")
    result = client.chat_and_verify(
        messages=[{"role": "user", "content": "Summarize employee data"}],
        sources=[
            {
                "id": "src-1",
                "title": "Employee DB",
                "content": "John is a senior engineer.",
                "authority_score": 0.9,
            }
        ],
        action="read",
        resource="employee-records/john-doe",
    )

    print(f"Verified: {result.get('verified')}")
    if result.get("grounding"):
        print(f"Hallucination score: {result['grounding']['hallucination_score']}")
        for c in result["grounding"]["claims"]:
            print(f"  Claim: {c['text']} → {'OK' if c['supported'] else '!!'}")
    print(f"Guard: {result['guard']['allowed']} ({result['guard']['reason']})")
    print(f"Audit ID: {result.get('audit_id')}")

    # 4. Check audit log
    print("\n--- Recent Audit Entries ---")
    for entry in client.get_audit_log(limit=5):
        print(f"  [{entry['action']}] on {entry['resource']} — allowed: {entry['policy_eval']['allowed']}")


if __name__ == "__main__":
    main()
