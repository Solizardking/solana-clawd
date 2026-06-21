"""Render process launcher for the model-kit API."""

import os

import uvicorn


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
