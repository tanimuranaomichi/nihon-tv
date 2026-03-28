# nihon-tv

Cloudflare Workers AI を使った小さな対話ゲームのプロトタイプです。

## セットアップ

```bash
npm install
```

## 起動方法

### Worker だけ起動する

```bash
npx wrangler dev
```

`dist/` にあるフロントをそのまま配信します。

### フロント変更も反映しながら開発する

別ターミナルでフロントのビルド監視を動かします。

```bash
npx vite build --watch
```

もう一方のターミナルで Worker を起動します。

```bash
npx wrangler dev
```

## そのほかのコマンド

型チェック:

```bash
npm run typecheck
```

フロントをビルド:

```bash
npm run build
```
