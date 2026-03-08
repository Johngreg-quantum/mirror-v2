"""Generate cinematic level card images with DALL-E 3."""
import os, base64, sys
from pathlib import Path
from dotenv import load_dotenv
import openai

load_dotenv()
client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

static = Path(__file__).parent / 'static'
static.mkdir(exist_ok=True)

prompts = [
    (
        'beginner-card.jpg',
        (
            'Cinematic Hollywood film portrait photograph, vertical format. '
            'A confident young man in modern casual clothes standing in warm '
            'golden-hour light. Shallow depth of field, film grain, '
            'bokeh background with warm amber and emerald tones. '
            'Movie poster aesthetic, professional lighting. No text, no logos.'
        ),
    ),
    (
        'intermediate-card.jpg',
        (
            'Cinematic noir portrait photograph, vertical format. '
            'An intense middle-aged man in a dramatic thriller scene, '
            'high-contrast cool blue and warm amber split lighting, '
            'deep shadows, confrontational expression. '
            'Hollywood neo-noir aesthetic, professional cinematography. No text, no logos.'
        ),
    ),
    (
        'advanced-card.jpg',
        (
            'Dark cinematic action portrait photograph, vertical format. '
            'A powerful figure in extreme chiaroscuro lighting — single '
            'dramatic light source illuminating half the face, rest in deep shadow. '
            'Fierce determined expression. Action thriller movie poster aesthetic, '
            'very dark background, burnt orange and black tones. No text, no logos.'
        ),
    ),
]

for filename, prompt in prompts:
    out = static / filename
    if out.exists():
        print(f'  skip {filename} (already exists)')
        continue
    print(f'  generating {filename}...', flush=True)
    try:
        resp = client.images.generate(
            model='dall-e-3',
            prompt=prompt,
            size='1024x1792',
            quality='standard',
            n=1,
            response_format='b64_json',
        )
        data = base64.b64decode(resp.data[0].b64_json)
        out.write_bytes(data)
        print(f'  saved {filename} ({len(data)//1024} KB)')
    except Exception as e:
        print(f'  ERROR generating {filename}: {e}', file=sys.stderr)
        sys.exit(1)

print('Done.')
