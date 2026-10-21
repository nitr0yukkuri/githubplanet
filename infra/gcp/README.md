# githubplanet.dev のALB構成

既存のCloud Runサービスを削除・移設せず、Global external Application Load Balancerを前段に追加します。

```text
githubplanet.dev
        ↓
Global external Application Load Balancer
        ↓
Serverless NEG
        ↓
Cloud Run asia-northeast2 / githubplanet-git
```

## 適用前の準備

- Google CloudプロジェクトでCloud Runサービスが存在すること
- `githubplanet.dev`のDNSを変更できること
- TerraformとGoogle Cloud CLIをインストールすること
- Google Cloudの認証を完了すること

```powershell
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

`terraform.tfvars.example`を`terraform.tfvars`にコピーし、`project_id`を設定します。

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

適用後、出力された`public_ip`をDNSに登録します。

| 名前 | 種類 | 値 |
|---|---|---|
| `@` | A | `terraform output -raw public_ip` |

証明書が有効になるまで、通常は数分、長い場合は数時間かかります。

## Cloud Runの公開URL設定

ALBのDNSが解決した後、既存サービスに公開URLとOAuth callbackを設定します。

```powershell
gcloud run services update githubplanet-git `
  --region asia-northeast2 `
  --update-env-vars "PUBLIC_BASE_URL=https://githubplanet.dev,CALLBACK_URL=https://githubplanet.dev/callback"
```

GitHub OAuth AppのAuthorization callback URLも次に変更します。

```text
https://githubplanet.dev/callback
```

既存の`*.run.app` URLは引き続きCloud Runへ直接アクセスできるため、今回の構成では削除しません。

## 注意

- ALBのグローバルIP、転送ルール、証明書などはGoogle Cloudの課金対象になり得ます。
- `terraform destroy`はALBだけでなく関連リソースを削除するため、実行前に必ず確認してください。
- DNSを切り替える前に、Cloud Runの既存URLでアプリが正常に動作していることを確認してください。

