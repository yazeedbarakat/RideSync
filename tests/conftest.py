import os
import tempfile

os.environ["DATA_DIR"] = tempfile.mkdtemp()  # never touch the demo database
os.environ["DEMO_NOW"] = "07:05"
