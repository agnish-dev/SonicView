import os
import asyncio
from groq import AsyncGroq
import json

async def test_groq():
    client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
    try:
        import glob
        audio_files = glob.glob("temp_*.m4a")
        if not audio_files:
            print("No audio file found")
            return
            
        m4a_filepath = audio_files[0]
        print(f"Using {m4a_filepath}")
        
        with open(m4a_filepath, "rb") as file:
            transcription = await client.audio.transcriptions.create(
                file=(m4a_filepath, file.read()),
                model="whisper-large-v3",
                response_format="verbose_json"
            )
            
        detected_language = getattr(transcription, "language", "unknown")
        print("Detected language:", detected_language)
        print("Transcript:", transcription.text[:100], "...")
        
        track_title = "Unknown"
        
        completion = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an expert music metadata extractor. You are provided with the full audio transcript of a song. Your task is to:\n1. Identify the primary language of the song. If it's a mixture, return the language that is spoken the most.\n2. Extract or infer the Artist Name.\n3. Extract or infer the Album Name.\n\nReturn ONLY a valid JSON object with keys: 'primary_language', 'artist', 'album'. Do not include markdown formatting."},
                {"role": "user", "content": f"Title Hint: {track_title}\nAudio Language Detected by Ear: {detected_language}\nFull Transcript:\n{transcription.text}"}
            ],
            response_format={"type": "json_object"}
        )
        
        result_text = completion.choices[0].message.content.strip()
        print("Llama Output:", result_text)
            
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(test_groq())
