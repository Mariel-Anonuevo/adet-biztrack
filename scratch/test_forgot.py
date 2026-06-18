import json, urllib.request, ssl
url = 'http://127.0.0.1:8000/auth/api/forgot'
payload = json.dumps({'email':'test@example.com'}).encode('utf-8')
req = urllib.request.Request(url, data=payload, headers={'Content-Type':'application/json'}, method='POST')
# ignore SSL verification if needed
context = ssl._create_unverified_context()
with urllib.request.urlopen(req, context=context) as resp:
    print(resp.read().decode())
