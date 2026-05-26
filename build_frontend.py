"""Run this to rebuild the React frontend before starting the Flask server."""
import subprocess, sys, os

os.chdir("frontend-react")
result = subprocess.run(["npm", "run", "build"], shell=True)
if result.returncode == 0:
    print("\n✅ React build complete. Run 'py run.py' to start the server.")
else:
    print("\n❌ Build failed.")
    sys.exit(1)
