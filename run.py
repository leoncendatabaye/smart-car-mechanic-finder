import logging
from dotenv import load_dotenv
load_dotenv()  # Load .env before anything else

from api.app import create_app

# Show SMS and app logs in the terminal
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
