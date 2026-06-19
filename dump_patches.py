import json

transcript_path = r"C:\Users\hermb\.gemini\antigravity\brain\10bdfd8c-2572-4155-aecf-558288a0bc6b\.system_generated\logs\transcript_full.jsonl"
patches = []

for i, line in enumerate(open(transcript_path, encoding='utf-8')):
    try:
        entry = json.loads(line)
        for tc in entry.get('tool_calls', []):
            if tc['name'] in ['replace_file_content', 'multi_replace_file_content']:
                args = tc['args']
                if 'main.py' in args.get('TargetFile', ''):
                    patches.append(args)
    except Exception as e:
        pass

with open('patches.json', 'w', encoding='utf-8') as f:
    json.dump(patches, f, indent=2)
