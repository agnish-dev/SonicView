import json

transcript_path = r"C:\Users\hermb\.gemini\antigravity\brain\10bdfd8c-2572-4155-aecf-558288a0bc6b\.system_generated\logs\transcript_full.jsonl"

for i, line in enumerate(open(transcript_path, encoding='utf-8')):
    try:
        entry = json.loads(line)
        for tc in entry.get('tool_calls', []):
            if tc['name'] in ['default_api:write_to_file', 'default_api:replace_file_content', 'default_api:multi_replace_file_content']:
                args = tc['args']
                if 'main.py' in args.get('TargetFile', ''):
                    print(f"Line {i}: {tc['name']} -> {args.get('TargetFile')}")
    except Exception as e:
        pass
