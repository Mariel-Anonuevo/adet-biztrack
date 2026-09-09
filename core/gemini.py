import urllib.request
import urllib.error
import json
import time
from core.config import get_settings

def query_gemini(prompt: str, timeout: int = 30) -> str:
    """
    Queries Google Gemini API with fallback models and retry logic.
    Models tried in order: gemini-3.5-flash, gemini-3.1-flash-lite, gemini-2.5-flash-lite, gemini-2.5-flash.
    """
    settings = get_settings()
    api_key = settings.gemini_api_key

    if not api_key or api_key.strip() == "" or api_key == "your-gemini-api-key-here":
        raise ValueError("Gemini API key is not configured.")

    # Try these models in order
    models_to_try = [
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash"
    ]

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }

    last_error = None
    for model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
        
        # Try up to 2 attempts for each model if we get a transient error (429 or 503)
        for attempt in range(2):
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    candidates = res_data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            text = parts[0].get("text", "")
                            if text:
                                return text.strip()
                    raise Exception("Empty response candidate structure from Gemini API.")
            except urllib.error.HTTPError as e:
                try:
                    error_body = e.read().decode('utf-8')
                    error_json = json.loads(error_body)
                    error_msg = error_json.get("error", {}).get("message", str(e))
                except Exception:
                    error_msg = str(e)

                print(f"[Gemini API] Model {model} attempt {attempt+1} failed with HTTP {e.code}: {error_msg}")
                last_error = f"HTTP {e.code}: {error_msg}"
                
                if e.code in [429, 503]:
                    time.sleep(1)
                else:
                    break
            except Exception as e:
                print(f"[Gemini API] Model {model} attempt {attempt+1} failed with error: {e}")
                last_error = str(e)
                time.sleep(1)

    raise Exception(f"All fallback models failed. Last error: {last_error}")
