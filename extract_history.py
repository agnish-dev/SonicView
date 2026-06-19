import json
import os

transcript_path = r"C:\Users\hermb\.gemini\antigravity\brain\10bdfd8c-2572-4155-aecf-558288a0bc6b\.system_generated\logs\transcript_full.jsonl"
output_path = "extracted_main.py"

content = None
patches = []

try:
    with open(transcript_path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            try:
                entry = json.loads(line)
                if 'tool_calls' in entry:
                    for tc in entry['tool_calls']:
                        if tc['function']['name'] == 'default_api:write_to_file':
                            args = json.loads(tc['function']['arguments'])
                            if 'main.py' in args.get('TargetFile', ''):
                                content = args.get('CodeContent')
                                print(f"Found write_to_file at line {i}")
                                with open(f"write_{i}.py", "w", encoding="utf-8") as out:
                                    out.write(content)
                        elif tc['function']['name'] in ['default_api:replace_file_content', 'default_api:multi_replace_file_content']:
                            args = json.loads(tc['function']['arguments'])
                            if 'main.py' in args.get('TargetFile', ''):
                                print(f"Found patch at line {i}: {tc['function']['name']}")
                                with open(f"patch_{i}.json", "w", encoding="utf-8") as out:
                                    json.dump(args, out, indent=2)
            except Exception as e:
                pass
except Exception as e:
    print(f"Error reading transcript: {e}")
