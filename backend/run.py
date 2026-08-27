"""后端启动入口。

用法（在 backend/ 目录）：

    python run.py
    python run.py --reload
    uv run python run.py --reload
    python -m app --reload
"""

from app.runner import main

if __name__ == "__main__":
    main()
