"""
Build build/lambda.zip for AWS Lambda (python3.12, x86_64) without Docker.

Installs the Lambda dependency set as manylinux wheels (so a Windows/macOS machine produces
Linux-compatible binaries) and adds the backend `app` package. boto3 is provided by the runtime.
"""
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BUILD = os.path.join(ROOT, "build")
TARGET = os.path.join(BUILD, "lambda")
ZIP_PATH = os.path.join(BUILD, "lambda.zip")


def main() -> None:
    shutil.rmtree(TARGET, ignore_errors=True)
    os.makedirs(TARGET, exist_ok=True)
    subprocess.check_call(
        [
            sys.executable, "-m", "pip", "install", "--quiet", "--no-cache-dir",
            "--platform", "manylinux2014_x86_64", "--implementation", "cp", "--python-version", "3.12",
            "--only-binary=:all:", "--target", TARGET,
            "-r", os.path.join(ROOT, "backend", "requirements-lambda.txt"),
        ]
    )
    shutil.copytree(
        os.path.join(ROOT, "backend", "app"),
        os.path.join(TARGET, "app"),
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    # strip bulky, unused files to keep cold starts fast
    for dirpath, dirnames, _ in os.walk(TARGET):
        for d in list(dirnames):
            if d in ("__pycache__", "tests") or d.endswith(".dist-info") and False:
                shutil.rmtree(os.path.join(dirpath, d), ignore_errors=True)
                dirnames.remove(d)

    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for dirpath, _, files in os.walk(TARGET):
            for f in files:
                full = os.path.join(dirpath, f)
                z.write(full, os.path.relpath(full, TARGET).replace(os.sep, "/"))
    size = os.path.getsize(ZIP_PATH) / (1024 * 1024)
    print(f"Built {ZIP_PATH} ({size:.1f} MB)")
    if size > 50:
        raise SystemExit("Package exceeds the 50 MB direct-upload limit for Lambda zip (use S3 upload, ok) - review dependencies.")


if __name__ == "__main__":
    main()
