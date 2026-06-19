import imageio_ffmpeg
import shutil
shutil.copy(imageio_ffmpeg.get_ffmpeg_exe(), 'backend/venv/Scripts/ffmpeg.exe')
print("Copied to backend/ffmpeg.exe")
