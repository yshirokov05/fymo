import os

exclude_dirs = {'node_modules', '.git', '.firebase', 'build', 'dist', 'coverage', 'venv', '__pycache__', 'code-review', 'secure_policies'}
exclude_exts = {'.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.eot', '.ttf', '.woff', '.woff2', '.pdf', '.lock', '.pyc', '.exe', '.dll', '.so'}

total_files = 0
total_lines = 0

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    for file in files:
        ext = os.path.splitext(file)[1].lower()
        if ext in exclude_exts or file in {'package-lock.json', 'count_lines.py'}:
            continue
        total_files += 1
        path = os.path.join(root, file)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                total_lines += sum(1 for _ in f)
        except Exception:
            pass

print(f"File Count: {total_files}")
print(f"Lines of Code: {total_lines}")
