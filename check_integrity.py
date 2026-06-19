import os

def check_file(path):
    try:
        with open(path, 'rb') as f:
            data = f.read()
            s = set(data)
            if len(s) == 1 and 0 in s:
                print(f"{path} is fully NULL ({len(data)} bytes)!")
            else:
                print(f"{path} is OK ({len(data)} bytes, {len(s)} unique bytes)")
    except Exception as e:
        print(f"Error reading {path}: {e}")

check_file('src/App.jsx')
check_file('backend/main.py')
