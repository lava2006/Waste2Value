import urllib.request

routes = [
    "/",
    "/dashboard",
    "/batches",
    "/batches/new",
    "/batches/batch-001",
    "/evidence/doc-101",
    "/passports/W2V-CP-0001",
    "/verify/W2V-CP-0001",
    "/settings",
]

print("--- Testing Frontend Routes (port 3000) ---")
for r in routes:
    url = f"http://localhost:3000{r}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RouteChecker/1.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            print(f"[OK] {r} -> {response.status}")
    except Exception as e:
        print(f"[FAIL] {r} -> {e}")

backend_endpoints = [
    "/health",
    "/ready",
    "/api/health",
    "/api/ready",
    "/api/batches",
    "/api/batches/batch-001",
    "/api/passports/W2V-CP-0001",
    "/api/verify/W2V-CP-0001",
]

print("\n--- Testing Backend Endpoints (port 8000) ---")
for r in backend_endpoints:
    url = f"http://127.0.0.1:8000{r}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RouteChecker/1.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            print(f"[OK] {r} -> {response.status}")
    except Exception as e:
        print(f"[FAIL] {r} -> {e}")
