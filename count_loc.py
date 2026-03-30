import os

def count_lines(directory, exts, exclude_dirs):
    total_lines = 0
    total_files = 0
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for f in files:
            if any(f.endswith(ext) for ext in exts):
                filepath = os.path.join(root, f)
                try:
                    with open(filepath, 'r', encoding='utf-8') as file:
                        lines = sum(1 for line in file)
                        total_lines += lines
                        total_files += 1
                except Exception:
                    pass
    return total_files, total_lines

if __name__ == "__main__":
    base_dir = r"c:\Projects\Personal-Finance-App-PFA"
    
    # Frontend
    frontend_dir = os.path.join(base_dir, "frontend")
    f_files, f_lines = count_lines(frontend_dir, ['.js', '.jsx', '.css', '.html'], ['node_modules', 'build'])
    
    # Backend
    backend_dir = os.path.join(base_dir, "backend")
    b_files, b_lines = count_lines(backend_dir, ['.py', '.txt', '.example'], ['venv', '__pycache__'])
    
    # Root
    r_files, r_lines = count_lines(base_dir, ['.json', '.md', '.txt'], ['node_modules', 'build', 'venv', 'backend', 'frontend', '.git', '.firebase'])
    
    total_files = f_files + b_files + r_files
    total_lines = f_lines + b_lines + r_lines
    print(f"Frontend: {f_files} files, {f_lines} lines")
    print(f"Backend: {b_files} files, {b_lines} lines")
    print(f"Root: {r_files} files, {r_lines} lines")
    print(f"Total: {total_files} files, {total_lines} lines")
