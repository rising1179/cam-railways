# Cam (Railway / Google Sheets)

- /student : 生徒画面（スマホ向け）
- /teacher : 教員画面（PC向け）

## 環境変数
- PORT
- JWT_SECRET
- GOOGLE_SHEETS_ID
- GOOGLE_SERVICE_ACCOUNT_JSON (1行のJSON)
- CACHE_TTL_SECONDS (任意)

## セットアップ
1. Googleスプレッドシートに7シート作成: Teacher Directory / Student Directory / Student / Reception / Event / Course List / Pass
2. サービスアカウントを編集者で共有
3. Passシートに argon2 ハッシュを配置（student_pass / teacher_pass）
4. Railwayにデプロイして環境変数を設定
