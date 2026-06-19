import yt_dlp
info = yt_dlp.YoutubeDL({'quiet':True, 'format': 'bestaudio/best'}).extract_info('https://music.youtube.com/watch?v=-Bib8gTPEFQ', download=False)
print('Success!' if 'url' in info else 'Failed')
