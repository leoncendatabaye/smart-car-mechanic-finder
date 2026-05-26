from pathlib import Path

from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_bcrypt import Bcrypt

from api.routes import api_bp, bcrypt


def create_app() -> Flask:
    react_dist = Path(__file__).resolve().parents[1] / "frontend-react" / "dist"

    app = Flask(__name__, static_folder=str(react_dist), static_url_path="/static")
    CORS(app)
    bcrypt.init_app(app)
    app.register_blueprint(api_bp, url_prefix="/api")

    index_html = str(react_dist / "index.html")

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react(path):
        # Let /api routes pass through (handled by blueprint)
        if path.startswith("api/"):
            from flask import abort
            abort(404)
        # Serve real static assets from dist folder
        asset = react_dist / path
        if path and asset.exists() and asset.is_file():
            return send_from_directory(str(react_dist), path)
        # All other routes → React index.html (SPA)
        return send_from_directory(str(react_dist), "index.html")

    return app
