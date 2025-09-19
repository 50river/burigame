# Buri Game (Ishikawa Amberjack Journey)

## English

### Concept
This is a browser game created by an Ishikawa native who grew up surrounded by the legend of *buri* (Japanese amberjack). In Japan the fish is called a "shusse-uo"—a fish whose name changes with every stage of growth, symbolising good fortune and career success. The game invites hackathon judges (and players everywhere) to discover that story by guiding the fish from humble eggs to celebratory dishes.

### Story & Cultural Roots
- Hometown pride: The Hokuriku region, especially Ishikawa Prefecture, is famous for spectacular winter amberjack.
- Cultural lesson: Every successful merge unlocks the next traditional name—`魚卵 → 稚魚 → こぞくら → ふくらぎ → がんど → ぶり`—before celebrating with beloved dishes like sashimi, sushi, *buri daikon*, and *buri shabu*.
- Purpose: I built this to share our local culture with the world and let people feel the excitement of a "career-changing" fish in a playful, interactive way.

### Gameplay Highlights
- Merge & evolve: Drop matching stages to merge them and climb the amberjack life (and dining) cycle.
- Ocean currents: Random bursts of the warm Tsushima Current or cold Liman Current gently push the board, forcing players to read the sea.
- "Buri Okoshi" bonus: A festive 12-second window where every drop becomes a full-grown amberjack for huge combos.
- Share your catch: Capture the final board state and share directly from the browser.
- Soundscape: Background music (with volume controls) inspired by the coastal atmosphere of Ishikawa.

### Controls
- Keyboard: `←` / `→` move, `Space` drops, `R` resets.
- Mobile: Drag to position, release to drop.

### Technology
- HTML5 Canvas for physics-driven falling and collisions.
- Vanilla JavaScript (`src/game.js`) for gameplay, effects, and Web Share integration.
- CSS (`src/style.css`) for a warm local-festival aesthetic.
- Lightweight assets only (`img/*.png`, `buri.mp3`) so it runs instantly in the browser.

### Run Locally
- Quick start: open `index.html` directly in a modern desktop or mobile browser.
- Local server (optional): from the project root run `npx http-server .` or any static file server, then visit the printed URL.

### For Hackathon Judges
This prototype is ready for live demos: all assets are bundled, no build step is required, and the cultural story is woven through the UI. Future additions include seasonal events tied to Ishikawa festivals and online leaderboards to compare catches across regions.

---

## 日本語

### コンセプト
開発者である私は石川県で生まれ育ち、冬の味覚として知られる「ぶり」に強い思い入れがあります。日本ではぶりが成長とともに名前を変える「出世魚」として親しまれ、縁起物でもあります。このゲームは、その文化と物語を世界の人に体験してもらうために制作しました。

### ストーリーと文化的背景
- ご当地自慢: 北陸・石川県は寒い季節になると脂ののった寒ぶりで全国に知られています。
- 文化体験: 同じ段階の玉を合体させるたびに `魚卵 → 稚魚 → こぞくら → ふくらぎ → がんど → ぶり` と名前が変わり、最終的には刺身・寿司・ぶり大根・鰤しゃぶといった祝い膳にたどり着きます。
- 目的: 「出世魚」という縁起の良い文化をゲームという形で広め、遊びながら知ってもらうことが狙いです。

### ゲームの見どころ
- 合体で出世: 同じ段階をぶつけて成長させ、ぶりの一生とごちそうを駆け上がります。
- 海流イベント: 暖流の対馬海流と寒流のリマン海流がランダムに発生し、盤面をじわっと押し流します。
- 「ぶりおこし」ボーナス: 12秒間すべての玉がぶりになるフィーバータイム。
- リザルト共有: 最後の盤面を自動キャプチャしてそのまま共有できます。
- サウンド: 石川の海辺をイメージしたBGM（音量調整・ミュート対応）。

### 操作方法
- PC: `←` `→` キーで移動、`Space` で落下、`R` でリセット。
- スマホ: 画面ドラッグで移動し、指を離すと落下します。

### 技術スタック
- HTML5 Canvas による物理表現と描画。
- 純粋な JavaScript（`src/game.js`）でゲームロジック、演出、Web Share API を実装。
- `src/style.css` でご当地フェスをイメージしたUIを構築。
- 画像 (`img/*.png`) と音声 (`buri.mp3`) を含むだけの軽量構成で、ブラウザだけで動作します。

### ローカルでの遊び方
- もっとも簡単: `index.html` をブラウザで直接開くだけです。
- サーバー経由（任意）: プロジェクト直下で `npx http-server .` などの静的サーバーを起動し、表示されたURLにアクセスします。

### 今後の展開
ハッカソン向けのプロトタイプとして、すぐにデモできる状態です。今後は石川県の季節行事と連動したイベントモードや、各地域のスコアを競うオンラインランキングを検討しています。
