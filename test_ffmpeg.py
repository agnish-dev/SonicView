import os
import imageio_ffmpeg
import subprocess

ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
os.environ['PATH'] += os.pathsep + os.path.dirname(ffmpeg_path)

subprocess.run(['ffmpeg', '-version'], check=True)
print("SUCCESS!")
