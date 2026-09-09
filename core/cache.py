import functools
import time
from typing import Callable, Any
from fastapi import Request

# Global in-memory cache dictionary:
# Key: (user_id, func_name, args_key_tuple)
# Value: (expiry_time, cached_data)
_CACHE = {}

def cache_metrics(ttl_seconds: int = 60):
    """
    FastAPI route caching decorator with TTL support.
    Scopes cached results by user_id extracted from request.state.user.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request object to determine user context
            request = None
            for arg in args:
                if isinstance(arg, Request) or type(arg).__name__ in ("Request", "MockRequest") or hasattr(arg, "scope"):
                    request = arg
                    break
            if not request:
                request = kwargs.get("request")

            if not request:
                # If request object cannot be resolved, bypass caching
                return await func(*args, **kwargs)

            user = getattr(request.state, "user", None)
            user_id = user.id if user else "anonymous"

            # Build a deterministic cache key from parameters
            args_key = []
            for k, v in sorted(kwargs.items()):
                if k != "request":
                    args_key.append((k, v))
            for i, arg in enumerate(args):
                if arg is not request:
                    args_key.append((f"arg_{i}", arg))

            cache_key = (user_id, func.__name__, tuple(args_key))

            now = time.time()
            if cache_key in _CACHE:
                expiry, cached_value = _CACHE[cache_key]
                if now < expiry:
                    print(f"[CACHE HIT] Returning cached metrics for {func.__name__} (User: {user_id})")
                    return cached_value
                else:
                    _CACHE.pop(cache_key, None)

            # Compute actual results on cache miss
            result = await func(*args, **kwargs)
            _CACHE[cache_key] = (now + ttl_seconds, result)
            return result
        return wrapper
    return decorator

def invalidate_cache(user_id: str):
    """
    Invalidates all cached entries associated with the given user_id.
    Should be called when records are created, modified, or deleted.
    """
    keys_to_remove = [k for k in _CACHE if k[0] == user_id]
    for k in keys_to_remove:
        _CACHE.pop(k, None)
    if keys_to_remove:
        print(f"[CACHE INVALIDATE] Cleared {len(keys_to_remove)} cache entries for user: {user_id}")
