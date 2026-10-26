"""Обновляет список файлов игры в index.html и в sw.js. Запускать после добавления картинок/видео/звуков."""
import os, json, re
root = os.path.dirname(os.path.abspath(__file__))
img, vid, snd = {}, [], []
for f in sorted(os.listdir(os.path.join(root, 'img'))):
    n, e = os.path.splitext(f); e = e[1:].lower()
    if e == 'mp4': vid.append(n)
    elif e in ('jpg', 'jpeg', 'png', 'webp'): img.setdefault(n, e)
for f in sorted(os.listdir(os.path.join(root, 'snd'))):
    n, e = os.path.splitext(f)
    if e.lower() == '.mp3': snd.append(n)
p = os.path.join(root, 'index.html'); s = open(p, encoding='utf-8').read()
s = re.sub(r'/\*FILES\*/.*?/\*/FILES\*/', '/*FILES*/' + json.dumps({'img': img, 'vid': vid, 'snd': snd}, ensure_ascii=False) + '/*/FILES*/', s, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
assets = [f"./img/{n}.{e}" for n, e in img.items()] + [f"./snd/{n}.mp3" for n in snd]
p = os.path.join(root, 'sw.js'); w = open(p, encoding='utf-8').read()
w = re.sub(r"const ASSETS = \[.*?\];", "const ASSETS = " + json.dumps(assets) + ";", w, flags=re.S)
m = re.search(r"const VERSION = 'atlas-v(\d+)';", w); w = w.replace(m.group(0), f"const VERSION = 'atlas-v{int(m.group(1))+1}';")
open(p, 'w', encoding='utf-8').write(w)
print('img', len(img), 'vid', len(vid), 'snd', len(snd), '->', re.search(r"atlas-v\d+", w).group(0))
