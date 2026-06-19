import httpx
from ytmusicapi import YTMusic

yt = YTMusic()
results = yt.search('sao pao', filter='songs')[:5]

for r in results:
    art = r['thumbnails'][-1]['url'] if r.get('thumbnails') else ''
    print('Raw:', art)
    
    if 'googleusercontent.com' in art and '=' in art:
        art = art.split('=')[0] + '=w1080-h1080-l90-rj'
    elif art.startswith('https://i.ytimg.com/vi/'):
        art = art.replace('hqdefault', 'maxresdefault').replace('sddefault', 'maxresdefault').replace('mqdefault', 'maxresdefault').replace('default', 'maxresdefault')
        
    status = httpx.get(art).status_code
    print(status, art)
    print('-'*20)
