import browser_cookie3
import http.cookiejar
import traceback
import sys

def extract_youtube_cookies():
    try:
        # Load all cookies from Chrome
        print("Loading Chrome cookies... this might take a moment if the database is large.")
        cj = browser_cookie3.chrome(domain_name='.youtube.com')
        
        # Save them as Netscape HTTP Cookie File
        moz_cj = http.cookiejar.MozillaCookieJar('cookies.txt')
        for cookie in cj:
            moz_cj.set_cookie(cookie)
            
        moz_cj.save(ignore_discard=True, ignore_expires=True)
        print("Successfully exported YouTube cookies to cookies.txt!")
        return True
    except Exception as e:
        print(f"Error extracting Chrome cookies: {e}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = extract_youtube_cookies()
    if not success:
        print("Trying Edge instead...")
        try:
            cj = browser_cookie3.edge(domain_name='.youtube.com')
            moz_cj = http.cookiejar.MozillaCookieJar('cookies.txt')
            for cookie in cj:
                moz_cj.set_cookie(cookie)
            moz_cj.save(ignore_discard=True, ignore_expires=True)
            print("Successfully exported YouTube cookies from Edge to cookies.txt!")
        except Exception as e:
            print(f"Error extracting Edge cookies: {e}")
            traceback.print_exc()
            sys.exit(1)
