import sys, traceback, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
out = open(r"A:\check_result.txt", "w")
try:
    from main import app
    out.write("SUCCESS: main.py imported OK\n")
except Exception as e:
    out.write("ERROR:\n")
    out.write(traceback.format_exc())
out.close()

